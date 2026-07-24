import assert from 'node:assert/strict';
import { HASHES, planRun, REPOSITORY_ID } from './fixtures/plan-run-v1.mjs';
import { clone, expectThrow } from './harness.mjs';

const CURRENT_SOURCE = '9'.repeat(64);
const NEXT_SOURCE = 'a'.repeat(64);
const TARGET = `${REPOSITORY_ID}#release:docks`;

function authority(overrides = {}) {
  return {
    scopes: ['release'],
    mode: 'mutate',
    targets: [TARGET],
    source_sha256: CURRENT_SOURCE,
    ...overrides,
  };
}

function authorize(api, overrides = {}) {
  return api.authorizeExternalEffect({
    authority: authority(),
    effect: 'release',
    liveSourceSha256: CURRENT_SOURCE,
    mode: 'mutate',
    target: TARGET,
    ...overrides,
  });
}

export function registerExternalAuthority(suite, api) {
  suite.test('external-authority', 'local effects require no external authority', () => {
    const result = api.authorizeExternalEffect({
      authority: null,
      effect: 'local',
      liveSourceSha256: null,
      mode: 'mutate',
      target: REPOSITORY_ID,
    });
    assert.equal(result.effect, 'local');
    assert.equal(result.authorized, true);
  });

  suite.test('external-authority', 'persisted requested effects never grant live authority', () => {
    const run = planRun({
      requested_effects: ['local', 'release', 'push'],
      risk: 'external',
    });
    for (const effect of ['release', 'push']) {
      expectThrow(
        () =>
          api.authorizeExternalEffect({
            authority: null,
            effect,
            liveSourceSha256: CURRENT_SOURCE,
            mode: 'mutate',
            requestedEffects: run.requested_effects,
            target: TARGET,
          }),
        /authority|live|intent|scope/i,
      );
    }
  });

  suite.test('external-authority', 'authority binds exact scope, target, mode, and current-user digest', () => {
    assert.equal(authorize(api).authorized, true);
    const mismatches = [
      { effect: 'deploy' },
      { target: `${REPOSITORY_ID}#release:other` },
      { mode: 'read' },
      { liveSourceSha256: NEXT_SOURCE },
    ];
    for (const mismatch of mismatches) {
      expectThrow(() => authorize(api, mismatch), /authority|scope|target|mode|source|current/i);
    }
  });

  suite.test(
    'external-authority',
    'release authority is not transitive to deploy, production, or standalone effects',
    () => {
      for (const effect of ['deploy', 'production_access', 'push', 'publish', 'probe']) {
        expectThrow(() => authorize(api, { effect }), /authority|scope|effect/i);
      }
    },
  );

  suite.test('external-authority', 'probe authority is read-only and grants no mutation', () => {
    const probe = authority({ mode: 'read', scopes: ['probe'], targets: [`${REPOSITORY_ID}#probe:origin`] });
    const allowed = api.authorizeExternalEffect({
      authority: probe,
      effect: 'probe',
      liveSourceSha256: CURRENT_SOURCE,
      mode: 'read',
      target: probe.targets[0],
    });
    assert.equal(allowed.authorized, true);
    for (const mismatch of [
      { effect: 'probe', mode: 'mutate' },
      { effect: 'production_access', mode: 'read' },
      { effect: 'push', mode: 'mutate' },
    ]) {
      expectThrow(
        () =>
          api.authorizeExternalEffect({
            authority: probe,
            liveSourceSha256: CURRENT_SOURCE,
            target: probe.targets[0],
            ...mismatch,
          }),
        /probe|read|authority|scope|mode/i,
      );
    }
  });

  suite.test('external-authority', 'cold or scheduled recovery requires a new live source binding', () => {
    const persistedAuthority = authority();
    expectThrow(
      () => authorize(api, { authority: persistedAuthority, liveSourceSha256: NEXT_SOURCE }),
      /source|current|live|authority/i,
    );
    assert.equal(
      authorize(api, {
        authority: authority({ source_sha256: NEXT_SOURCE }),
        liveSourceSha256: NEXT_SOURCE,
      }).authorized,
      true,
    );
  });

  suite.test(
    'external-authority',
    'ExternalAuthorityV1 is closed and contains digests rather than raw user text',
    () => {
      api.validateExternalAuthority(authority(), { liveSourceSha256: CURRENT_SOURCE });
      const invalid = [
        { unexpected: true },
        { scopes: [] },
        { scopes: ['*'] },
        { scopes: ['release', 'release'] },
        { mode: 'write' },
        { targets: [] },
        { targets: [TARGET, TARGET] },
        { source_sha256: 'raw user instruction' },
      ];
      for (const mutation of invalid) {
        const value = { ...clone(authority()), ...mutation };
        expectThrow(
          () => api.validateExternalAuthority(value, { liveSourceSha256: CURRENT_SOURCE }),
          /unknown|scope|mode|target|digest|source|duplicate/i,
        );
      }
    },
  );

  suite.test(
    'external-authority',
    'authority widening mutation cannot replace exact membership with prefix matching',
    () => {
      const exact = authority({ scopes: ['release'], targets: [`${REPOSITORY_ID}#release:prod`] });
      for (const target of [
        `${REPOSITORY_ID}#release:prod-shadow`,
        `${REPOSITORY_ID}#release:prod/other`,
        `${REPOSITORY_ID}#release`,
      ]) {
        expectThrow(
          () =>
            api.authorizeExternalEffect({
              authority: exact,
              effect: 'release',
              liveSourceSha256: CURRENT_SOURCE,
              mode: 'mutate',
              target,
            }),
          /target|authority|exact/i,
        );
      }
    },
  );

  suite.test(
    'external-authority',
    'authority validation does not accept a plan digest as current-user authority',
    () => {
      expectThrow(() => authorize(api, { liveSourceSha256: HASHES.plan }), /source|current|live|authority/i);
    },
  );
}
