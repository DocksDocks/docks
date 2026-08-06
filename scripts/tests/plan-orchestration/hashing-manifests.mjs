import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  acceptance,
  bindPlan,
  IMPLEMENTATION_COMMIT,
  PLAN_PATH,
  REPOSITORY_ID,
  reviewPhase,
  tuple,
} from './fixtures/plan-run-v1.mjs';
import { expectThrow, git, initializeRepository, withTempDirectory, writeFile } from './harness.mjs';

function replaceOnce(text, before, after) {
  assert.equal(text.split(before).length - 1, 1, `fixture must contain exactly one ${before}`);
  return text.replace(before, after);
}
function markedPlan(api, { legacyDigest = false } = {}) {
  const fixture = bindPlan(api, tuple('drafting'));
  const marked = fixture.bytes
    .toString()
    .replace(
      'title: Autonomous controller fixture',
      `plan_hash_mode: status-excluded-v1
title: Autonomous controller fixture`,
    )
    .replace(
      '| # | Task | Files | Depends | Effect | Status |',
      '| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |',
    )
    .replace('|---|---|---|---|---|---|', '|---:|---|---|---|---|---|---|---|')
    .replace(
      '| 1 | Change fixture | `src/tracked.txt` | — | local | planned |',
      '| 1 | change_fixture | Change fixture | `src/tracked.txt` | — | local | planned | Observable proof |',
    );
  const normalizedView = api.canonicalPlanView(Buffer.from(marked));
  const normalizedDigest = api.sha256(normalizedView);
  const legacyView = normalizedView.replace(' status-excluded-v1 ', ' planned ');
  const run = {
    ...fixture.run,
    plan_sha256: legacyDigest ? api.sha256(legacyView) : normalizedDigest,
  };
  return {
    bytes: Buffer.from(marked.replace(`Plan-run: ${api.jcs(fixture.run)}`, `Plan-run: ${api.jcs(run)}`)),
    normalizedDigest,
    run,
  };
}

const PLAN_AFFECTED_PATHS = Object.freeze(['src/tracked.txt', 'src/untracked.txt']);

function bindAcceptanceManifest(api, fixture, acceptanceManifest) {
  const run = {
    ...fixture.run,
    acceptance: { ...fixture.run.acceptance, source_sha256: acceptanceManifest.source_sha256 },
  };
  return {
    ...fixture,
    acceptanceManifest,
    bytes: Buffer.from(
      replaceOnce(fixture.bytes.toString(), `Plan-run: ${api.jcs(fixture.run)}`, `Plan-run: ${api.jcs(run)}`),
    ),
    run,
  };
}

function acceptedLiveFixture(api, repo, manifestPaths = PLAN_AFFECTED_PATHS) {
  const sourceBase = initializeRepository(repo);
  writeFile(repo, 'src/tracked.txt', 'tracked acceptance bytes\n');
  writeFile(repo, 'src/untracked.txt', 'untracked acceptance bytes\n');
  const paths = [...manifestPaths];
  const acceptanceManifest = api.createAffectedPathManifest({ repo, paths, sourceBase });
  const fixture = bindPlan(
    api,
    tuple('finished', {
      acceptance: acceptance(),
      draft_review: reviewPhase('passed'),
      execution_parent: sourceBase,
      implementation_commit: IMPLEMENTATION_COMMIT,
      completion_review: reviewPhase('passed'),
      source_base: sourceBase,
    }),
  );
  return bindAcceptanceManifest(
    api,
    {
      ...fixture,
      expectation: { repo, paths, sourceBase },
      sourceBase,
    },
    acceptanceManifest,
  );
}

function validateAcceptedFixture(api, fixture, acceptanceManifestExpectation) {
  const expected = {
    acceptanceManifest: fixture.acceptanceManifest,
    goalId: fixture.run.goal_id,
    planPath: PLAN_PATH,
    repositoryId: REPOSITORY_ID,
    runId: fixture.run.run_id,
  };
  if (acceptanceManifestExpectation !== undefined) {
    expected.acceptanceManifestExpectation = acceptanceManifestExpectation;
  }
  return api.validatePlanRun(fixture.bytes, expected);
}

export function registerHashingAndManifest(suite, api) {
  suite.test('hashing-manifests', 'canonical plan identity excludes only lifecycle and manager-owned evidence', () => {
    const fixture = bindPlan(api, tuple('drafting'));
    const original = fixture.bytes.toString();
    const canonical = api.canonicalPlanView(fixture.bytes);
    const lifecycleOnly = original
      .replace('status: drafting', 'status: planned')
      .replace('updated: "2026-07-24T00:00:00Z"', 'updated: "2026-07-24T01:00:00Z"')
      .replace('started_at: null', 'started_at: "2026-07-24T00:30:00Z"');
    const blockedLifecycle = original
      .replace('status: drafting', 'status: blocked')
      .replace('updated: "2026-07-24T00:00:00Z"', 'updated: "2026-07-24T01:00:00Z"')
      .replace(
        'started_at: null',
        'blocked_reason: "Review permits exhausted."\nblocked_since: "2026-07-24T01:00:00Z"\nstarted_at: null',
      );
    const changedRecord = original.replace(fixture.run.run_id, '33333333-3333-4333-8333-333333333333');
    const changedVerification = replaceOnce(
      original,
      'Manager-written output that is excluded from plan identity.',
      'Different observed verification output.',
    );
    const changedReview = replaceOnce(
      original,
      'Fresh reviewer output that is excluded from plan identity.',
      'Different fresh reviewer output.',
    );
    for (const bytes of [lifecycleOnly, blockedLifecycle, changedRecord, changedVerification, changedReview]) {
      assert.equal(api.canonicalPlanView(Buffer.from(bytes)), canonical);
    }
  });

  suite.test('hashing-manifests', 'attempt history is validated only as an unfenced Review record', () => {
    const fixture = bindPlan(api, tuple('drafting'));
    const original = fixture.bytes.toString();
    const orphan = 'Plan-attempt-history: {"schema":1}';
    const outsideReview = replaceOnce(original, '## Verification Results', `${orphan}\n\n## Verification Results`);
    const malformedReview = replaceOnce(original, 'Fresh reviewer output that is excluded from plan identity.', orphan);
    const fencedExample = replaceOnce(
      original,
      'Fresh reviewer output that is excluded from plan identity.',
      `\`\`\`text\n${orphan}\n\`\`\``,
    );

    expectThrow(() => api.validatePlanRun(Buffer.from(outsideReview)), /Review section/i);
    expectThrow(() => api.validatePlanRun(Buffer.from(malformedReview)), /PlanAttemptHistoryV1|keys|closed/i);
    assert.equal(api.validatePlanRun(Buffer.from(fencedExample)).attempt_history.length, 0);
  });

  suite.test(
    'hashing-manifests',
    'canonical plan identity binds substantive scope, steps, effects, and acceptance',
    () => {
      const fixture = bindPlan(api, tuple('drafting'));
      const original = fixture.bytes.toString();
      const digest = api.sha256(api.canonicalPlanView(fixture.bytes));
      const mutations = [
        [
          '## Goal\n\nImplement and verify one bounded local change.',
          '## Goal\n\nImplement and verify one bounded public-contract change.',
        ],
        [
          '| 1 | Change fixture | `src/tracked.txt` | — | local | planned |',
          '| 1 | Change fixture | `src/other.txt` | — | local | planned |',
        ],
        ['| local | planned |', '| release | planned |'],
        ['Exit 0', 'Exit 0 and print verified'],
        ['  - src/untracked.txt', '  - src/other.txt'],
      ];
      for (const [before, after] of mutations) {
        assert.notEqual(
          api.sha256(api.canonicalPlanView(Buffer.from(replaceOnce(original, before, after)))),
          digest,
          `${before} must remain bound`,
        );
      }
    },
  );

  suite.test('hashing-manifests', 'unmarked plans retain status-bound legacy digest identity', () => {
    const fixture = bindPlan(api, tuple('drafting'));
    const changedStatus = replaceOnce(fixture.bytes.toString(), '| local | planned |', '| local | done |');
    assert.notEqual(api.canonicalPlanView(Buffer.from(changedStatus)), api.canonicalPlanView(fixture.bytes));
    assert.equal(api.validatePlanRun(fixture.bytes).run.plan_sha256, fixture.run.plan_sha256);
  });

  suite.test('hashing-manifests', 'marked mode excludes only valid Steps Status cells', () => {
    const fixture = markedPlan(api, { legacyDigest: true });
    assert.notEqual(fixture.run.plan_sha256, fixture.normalizedDigest);
    assert.equal(api.validatePlanRun(fixture.bytes).run.plan_sha256, fixture.run.plan_sha256);
    const original = fixture.bytes.toString();
    const progressed = replaceOnce(original, '| local | planned |', '| local | done |');
    assert.equal(api.canonicalPlanView(Buffer.from(progressed)), api.canonicalPlanView(fixture.bytes));

    const boundCells = [
      ['| 1 | change_fixture |', '| 2 | change_fixture |'],
      ['| 1 | change_fixture |', '| 1 | changed_identity |'],
      ['| Change fixture |', '| Change other fixture |'],
      ['| `src/tracked.txt` |', '| `src/other.txt` |'],
      ['| — | local |', '| 1 | local |'],
      ['| local | planned |', '| release | planned |'],
      ['| Observable proof |', '| Different proof |'],
    ];
    for (const [before, after] of boundCells) {
      assert.notEqual(
        api.canonicalPlanView(Buffer.from(replaceOnce(original, before, after))),
        api.canonicalPlanView(fixture.bytes),
        `${before} must remain bound in status-excluded-v1`,
      );
    }
    expectThrow(
      () => api.canonicalPlanView(Buffer.from(replaceOnce(original, '| planned |', '| unknown |'))),
      /Steps row Status is invalid/i,
    );
    expectThrow(
      () => api.canonicalPlanView(Buffer.from(replaceOnce(original, '| Status |', '| State |'))),
      /Steps table columns|canonical schema/i,
    );
  });

  suite.test('hashing-manifests', 'marked Steps reject duplicate display numbers with distinct stable Ids', () => {
    const original = markedPlan(api).bytes.toString();
    const row = '| 1 | change_fixture | Change fixture | `src/tracked.txt` | — | local | planned | Observable proof |';
    const duplicateNumber = replaceOnce(
      original,
      row,
      `${row}
| 1 | verify_fixture | Verify fixture | \`src/other.txt\` | — | local | planned | Different proof |`,
    );

    expectThrow(() => api.canonicalPlanView(Buffer.from(duplicateNumber)), /duplicate.*Steps row number/i);
  });

  suite.test('hashing-manifests', 'marked Steps reject duplicate stable Ids with distinct display numbers', () => {
    const original = markedPlan(api).bytes.toString();
    const row = '| 1 | change_fixture | Change fixture | `src/tracked.txt` | — | local | planned | Observable proof |';
    const duplicateId = replaceOnce(
      original,
      row,
      `${row}
| 2 | change_fixture | Verify fixture | \`src/other.txt\` | — | local | planned | Different proof |`,
    );

    expectThrow(() => api.canonicalPlanView(Buffer.from(duplicateId)), /duplicate.*Steps row Id/i);
  });

  suite.test('hashing-manifests', 'marked legacy Steps retain duplicate display-number rejection', () => {
    const fixture = bindPlan(api, tuple('drafting'));
    const marked = replaceOnce(
      fixture.bytes
        .toString()
        .replace(
          '| # | Task | Files | Depends | Effect | Status |',
          '| # | Task | Files | Depends | Effect | Status | Done when / failure action |',
        )
        .replace('|---|---|---|---|---|---|', '|---|---|---|---|---|---|---|')
        .replace(
          '| 1 | Change fixture | `src/tracked.txt` | — | local | planned |',
          '| 1 | Change fixture | `src/tracked.txt` | — | local | planned | Observable proof |',
        ),
      'title: Autonomous controller fixture',
      `plan_hash_mode: status-excluded-v1
title: Autonomous controller fixture`,
    );
    const row = '| 1 | Change fixture | `src/tracked.txt` | — | local | planned | Observable proof |';
    const duplicateNumber = replaceOnce(
      marked,
      row,
      `${row}
| 1 | Verify fixture | \`src/other.txt\` | — | local | planned | Different proof |`,
    );

    expectThrow(() => api.canonicalPlanView(Buffer.from(duplicateNumber)), /duplicate.*Steps row number/i);
  });

  suite.test('hashing-manifests', 'fenced and non-Steps Status text remains bound', () => {
    const fixture = markedPlan(api);
    const decorated = fixture.bytes.toString().replace(
      '## Steps',
      `## Context

| Label | Status |
|---|---|
| non_steps | planned |

\`\`\`markdown
## Steps
| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 9 | fenced_example | Example | \`example.txt\` | — | local | planned | Example only |
\`\`\`

## Steps`,
    );
    const digest = api.sha256(api.canonicalPlanView(Buffer.from(decorated)));
    for (const [before, after] of [
      ['| non_steps | planned |', '| non_steps | done |'],
      [
        '| 9 | fenced_example | Example | `example.txt` | — | local | planned |',
        '| 9 | fenced_example | Example | `example.txt` | — | local | done |',
      ],
    ]) {
      assert.notEqual(api.sha256(api.canonicalPlanView(Buffer.from(replaceOnce(decorated, before, after)))), digest);
    }
  });

  suite.test(
    'hashing-manifests',
    'canonical parsing rejects duplicate lifecycle keys and duplicate excluded sections',
    () => {
      const fixture = bindPlan(api, tuple('drafting'));
      const text = fixture.bytes.toString();
      expectThrow(
        () => api.canonicalPlanView(Buffer.from(text.replace('status: drafting', 'status: drafting\nstatus: planned'))),
        /duplicate|status/i,
      );
      expectThrow(() => api.canonicalPlanView(Buffer.from(`${text}\n## Review\n\nduplicate\n`)), /duplicate|Review/i);
      expectThrow(
        () => api.canonicalPlanView(Buffer.from(`${text}\n## Verification Results\n\nduplicate\n`)),
        /duplicate|Verification Results/i,
      );
    },
  );

  suite.test('hashing-manifests', 'affected-path manifest binds tracked dirty, untracked, and absent bytes', () =>
    withTempDirectory('plan-run-manifest-', (root) => {
      const repo = path.join(root, 'repo');
      const sourceBase = initializeRepository(repo);
      writeFile(repo, 'tracked.txt', 'dirty working-tree bytes\n');
      writeFile(repo, 'untracked.txt', 'untracked bytes\n');
      const paths = ['tracked.txt', 'untracked.txt', 'absent.txt'];
      const manifest = api.createAffectedPathManifest({ repo, paths, sourceBase });
      api.validateAffectedPathManifest(manifest, { repo, paths, sourceBase });
      assert.equal(manifest.source_base, sourceBase);
      assert.match(manifest.source_sha256, /^[0-9a-f]{64}$/);
      assert.deepEqual(
        manifest.paths.map((entry) => entry.path),
        [...paths].sort(),
      );
      assert.equal(manifest.paths.find(({ path: logical }) => logical === 'absent.txt')?.state, 'missing');
      assert.equal(manifest.paths.find(({ path: logical }) => logical === 'untracked.txt')?.state, 'file');

      const reordered = api.createAffectedPathManifest({ repo, paths: [...paths].reverse(), sourceBase });
      assert.equal(reordered.source_sha256, manifest.source_sha256, 'caller ordering is not part of identity');

      writeFile(repo, 'tracked.txt', 'different dirty bytes\n');
      const changed = api.createAffectedPathManifest({ repo, paths, sourceBase });
      assert.notEqual(changed.source_sha256, manifest.source_sha256);

      fs.rmSync(path.join(repo, 'untracked.txt'));
      const disappeared = api.createAffectedPathManifest({ repo, paths, sourceBase });
      assert.notEqual(disappeared.source_sha256, changed.source_sha256, 'existence is hash-bound');
    }),
  );

  suite.test('hashing-manifests', 'affected-path manifest is repository/path scoped and rejects aliases', () =>
    withTempDirectory('plan-run-manifest-paths-', (root) => {
      const repo = path.join(root, 'repo');
      const sourceBase = initializeRepository(repo);
      writeFile(repo, 'inside.txt', 'inside\n');
      const outside = path.join(root, 'outside.txt');
      fs.writeFileSync(outside, 'outside\n');
      fs.symlinkSync(outside, path.join(repo, 'link.txt'));
      for (const paths of [['../outside.txt'], ['/etc/passwd'], ['inside.txt', './inside.txt'], ['link.txt']]) {
        expectThrow(
          () => api.createAffectedPathManifest({ repo, paths, sourceBase }),
          /path|relative|duplicate|symlink|canonical|escape/i,
        );
      }
    }),
  );

  suite.test('hashing-manifests', 'manifest source base is the exact repository commit, not a label', () =>
    withTempDirectory('plan-run-manifest-base-', (root) => {
      const repo = path.join(root, 'repo');
      const sourceBase = initializeRepository(repo);
      for (const badBase of ['HEAD', sourceBase.slice(0, 12), '0'.repeat(40)]) {
        expectThrow(
          () => api.createAffectedPathManifest({ repo, paths: ['tracked.txt'], sourceBase: badBase }),
          /source|base|commit|identity/i,
        );
      }
      assert.equal(git(repo, ['rev-parse', 'HEAD']).stdout, sourceBase);
    }),
  );

  suite.test(
    'hashing-manifests',
    'accepted PlanRun validates the exact live repository, canonical frontmatter paths, and HEAD',
    () =>
      withTempDirectory('plan-run-accepted-live-', (root) => {
        const repo = path.join(root, 'repo');
        const fixture = acceptedLiveFixture(api, repo);
        const validated = validateAcceptedFixture(api, fixture, fixture.expectation);

        assert.deepEqual(validated.frontmatter.affected_paths, PLAN_AFFECTED_PATHS);
        assert.deepEqual(
          fixture.acceptanceManifest.paths.map((entry) => entry.path),
          PLAN_AFFECTED_PATHS,
        );
        assert.equal(validated.run.acceptance.source_sha256, fixture.acceptanceManifest.source_sha256);
        assert.equal(fixture.acceptanceManifest.source_base, fixture.sourceBase);
        assert.equal(git(repo, ['rev-parse', 'HEAD']).stdout, fixture.sourceBase);
      }),
  );

  suite.test('hashing-manifests', 'accepted PlanRun rejects a missing live manifest expectation', () =>
    withTempDirectory('plan-run-accepted-expectation-', (root) => {
      const fixture = acceptedLiveFixture(api, path.join(root, 'repo'));
      expectThrow(
        () => validateAcceptedFixture(api, fixture),
        /acceptance manifest expectation|live|repo|paths|sourceBase|required|complete/i,
      );
    }),
  );

  suite.test('hashing-manifests', 'accepted PlanRun requires every live manifest expectation field', () =>
    withTempDirectory('plan-run-accepted-partial-', (root) => {
      const fixture = acceptedLiveFixture(api, path.join(root, 'repo'));
      for (const missing of ['repo', 'paths', 'sourceBase']) {
        const partial = { ...fixture.expectation };
        delete partial[missing];
        expectThrow(
          () => validateAcceptedFixture(api, fixture, partial),
          /acceptance manifest expectation|live|repo|paths|sourceBase|required|complete/i,
          `acceptance manifest expectation without ${missing} must reject`,
        );
      }
    }),
  );

  suite.test('hashing-manifests', 'accepted PlanRun expectation paths must equal frontmatter affected_paths', () =>
    withTempDirectory('plan-run-accepted-paths-', (root) => {
      const fixture = acceptedLiveFixture(api, path.join(root, 'repo'), [PLAN_AFFECTED_PATHS[0]]);
      assert.notDeepEqual(fixture.expectation.paths, api.parsePlan(fixture.bytes).frontmatter.affected_paths);
      expectThrow(
        () => validateAcceptedFixture(api, fixture, fixture.expectation),
        /affected_paths|affected path|frontmatter|plan.*path|exact/i,
      );
    }),
  );

  suite.test('hashing-manifests', 'accepted PlanRun rejects a self-consistent fabricated manifest', () =>
    withTempDirectory('plan-run-accepted-fabricated-', (root) => {
      const live = acceptedLiveFixture(api, path.join(root, 'repo'));
      const paths = live.acceptanceManifest.paths.map((entry, index) =>
        index === 0 ? { ...entry, sha256: api.sha256(Buffer.from('fabricated acceptance bytes\n')) } : entry,
      );
      const acceptanceManifest = {
        ...live.acceptanceManifest,
        paths,
        source_sha256: api.sha256(api.jcs({ schema: 1, source_base: live.acceptanceManifest.source_base, paths })),
      };
      const fabricated = bindAcceptanceManifest(api, live, acceptanceManifest);
      assert.notEqual(fabricated.acceptanceManifest.source_sha256, live.acceptanceManifest.source_sha256);
      expectThrow(
        () => validateAcceptedFixture(api, fabricated, fabricated.expectation),
        /acceptance manifest expectation|live|manifest|repository|bytes|required/i,
      );
    }),
  );

  suite.test('hashing-manifests', 'accepted PlanRun rejects affected-path byte drift from its manifest', () =>
    withTempDirectory('plan-run-accepted-byte-drift-', (root) => {
      const repo = path.join(root, 'repo');
      const fixture = acceptedLiveFixture(api, repo);
      writeFile(repo, PLAN_AFFECTED_PATHS[0], 'drifted acceptance bytes\n');
      expectThrow(
        () => validateAcceptedFixture(api, fixture, fixture.expectation),
        /acceptance manifest expectation|live|manifest|repository|bytes|required/i,
      );
    }),
  );

  suite.test('hashing-manifests', 'accepted PlanRun rejects repository HEAD drift from its manifest', () =>
    withTempDirectory('plan-run-accepted-head-drift-', (root) => {
      const repo = path.join(root, 'repo');
      const fixture = acceptedLiveFixture(api, repo);
      writeFile(repo, 'head-drift.txt', 'new repository head\n');
      git(repo, ['add', 'head-drift.txt']);
      git(repo, ['commit', '-qm', 'advance fixture head']);
      assert.notEqual(git(repo, ['rev-parse', 'HEAD']).stdout, fixture.sourceBase);
      expectThrow(
        () => validateAcceptedFixture(api, fixture, fixture.expectation),
        /acceptance manifest expectation|live|repository|HEAD|source|commit|required/i,
      );
    }),
  );

  suite.test('hashing-manifests', 'recorded acceptance proof drops the live snapshot and nothing else', () =>
    withTempDirectory('plan-run-accepted-recorded-', (root) => {
      const fixture = acceptedLiveFixture(api, path.join(root, 'repo'));
      const identity = {
        goalId: fixture.run.goal_id,
        planPath: PLAN_PATH,
        repositoryId: REPOSITORY_ID,
        runId: fixture.run.run_id,
      };
      // The default is `live`, so an omitted mode keeps today's exact strictness.
      expectThrow(() => api.validatePlanRun(fixture.bytes, identity), /final affected-path manifest/i);
      // `recorded` re-reads the same bytes without re-proving a discharged snapshot.
      assert.ok(api.validatePlanRun(fixture.bytes, { ...identity, acceptanceProof: 'recorded' }));
      // An unknown mode must fail closed rather than degrade to `recorded`.
      expectThrow(
        () => api.validatePlanRun(fixture.bytes, { ...identity, acceptanceProof: 'Recorded' }),
        /acceptance proof must be live or recorded/i,
      );
      // `recorded` still binds the plan's own Verification Results bytes.
      const tampered = Buffer.from(
        replaceOnce(
          fixture.bytes.toString(),
          fixture.run.acceptance.verification_sha256,
          api.sha256(Buffer.from('tampered verification bytes\n')),
        ),
      );
      expectThrow(
        () => api.validatePlanRun(tampered, { ...identity, acceptanceProof: 'recorded' }),
        /verification_sha256/i,
      );
    }),
  );

  suite.test('hashing-manifests', 'run identity is repository qualified even when goal and plan path match', () => {
    const fixture = bindPlan(api, tuple('drafting'));
    const validated = api.validatePlanRun(fixture.bytes, {
      planPath: PLAN_PATH,
      repositoryId: REPOSITORY_ID,
    });
    assert.equal(validated.run.repository_id, REPOSITORY_ID);
    expectThrow(
      () => api.validatePlanRun(fixture.bytes, { planPath: PLAN_PATH, repositoryId: 'public:/fixture/repository' }),
      /repository|identity|mismatch/i,
    );
  });
}
