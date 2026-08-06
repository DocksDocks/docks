import { jcs } from './current-codec.mjs';
import { AUTHORITY_SCOPES, assertClosed, COMMIT, EFFECT_ORDER, fail, HASH, UUID } from './plan-state.mjs';

function validateFinding(finding, label) {
  assertClosed(finding, ['id', 'kind', 'locator', 'defect', 'fix'], label);
  for (const key of ['id', 'kind', 'locator', 'defect', 'fix']) {
    if (typeof finding[key] !== 'string' || finding[key].trim() === '') fail(`${label} ${key} must be non-empty`);
  }
}

export function validateCompletionReview(value, binding = {}) {
  if (Buffer.byteLength(jcs(value)) > 32 * 1024) fail('CompletionReviewV1 exceeds 32 KiB');
  assertClosed(
    value,
    ['schema', 'run_id', 'invocation', 'implementation_commit', 'diff_sha256', 'verdict', 'findings'],
    'CompletionReviewV1',
  );
  if (value.schema !== 1) fail('CompletionReviewV1 schema must be 1');
  if (!UUID.test(value.run_id)) fail('CompletionReviewV1 run binding is invalid');
  if (![1, 2].includes(value.invocation)) fail('CompletionReviewV1 invocation must be one or two');
  if (!COMMIT.test(value.implementation_commit) || !HASH.test(value.diff_sha256)) {
    fail('CompletionReviewV1 implementation/diff binding is invalid');
  }
  if (!['pass', 'repair', 'blocked'].includes(value.verdict)) fail('CompletionReviewV1 verdict is invalid');
  if (!Array.isArray(value.findings)) fail('CompletionReviewV1 findings must be an array');
  value.findings.forEach((finding) => {
    validateFinding(finding, 'CompletionReviewV1 finding');
  });
  if (value.verdict === 'pass' && value.findings.length !== 0) fail('pass verdict cannot contain findings');
  if (value.verdict !== 'pass' && value.findings.length === 0) fail(`${value.verdict} verdict requires findings`);
  for (const key of ['run_id', 'invocation', 'implementation_commit', 'diff_sha256']) {
    if (binding[key] !== undefined && binding[key] !== value[key]) fail(`stale CompletionReviewV1 ${key} binding`);
  }
  return value;
}

export function validateExternalAuthority(authority, { liveSourceSha256 } = {}) {
  assertClosed(authority, ['scopes', 'mode', 'targets', 'source_sha256'], 'ExternalAuthorityV1');
  if (!Array.isArray(authority.scopes) || authority.scopes.length === 0) {
    fail('ExternalAuthorityV1 scopes must be a non-empty array');
  }
  const scopes = new Set();
  let lastIndex = -1;
  for (const scope of authority.scopes) {
    if (!AUTHORITY_SCOPES.has(scope)) fail(`ExternalAuthorityV1 scope is invalid: ${String(scope)}`);
    if (scopes.has(scope)) fail(`duplicate ExternalAuthorityV1 scope: ${scope}`);
    const index = EFFECT_ORDER.indexOf(scope);
    if (index <= lastIndex) fail('ExternalAuthorityV1 scopes must use canonical order');
    lastIndex = index;
    scopes.add(scope);
  }
  if (!['read', 'mutate'].includes(authority.mode)) fail('ExternalAuthorityV1 mode must be read or mutate');
  if (scopes.has('probe')) {
    if (scopes.size !== 1 || authority.mode !== 'read') fail('probe authority is read-only and cannot widen scope');
  } else if (authority.mode !== 'mutate') {
    fail('non-probe external authority requires mutate mode');
  }
  if (!Array.isArray(authority.targets) || authority.targets.length === 0) {
    fail('ExternalAuthorityV1 targets must be a non-empty array');
  }
  const targets = new Set();
  for (const target of authority.targets) {
    if (typeof target !== 'string' || target.length === 0 || target.trim() !== target || /[\0\r\n]/.test(target)) {
      fail('ExternalAuthorityV1 target must be an exact non-empty identity');
    }
    if (targets.has(target)) fail(`duplicate ExternalAuthorityV1 target: ${target}`);
    targets.add(target);
  }
  if (typeof authority.source_sha256 !== 'string' || !HASH.test(authority.source_sha256)) {
    fail('ExternalAuthorityV1 source must be a current-user SHA-256 digest');
  }
  if (liveSourceSha256 !== undefined) {
    if (typeof liveSourceSha256 !== 'string' || !HASH.test(liveSourceSha256)) {
      fail('live current-user source digest is invalid');
    }
    if (authority.source_sha256 !== liveSourceSha256) {
      fail('ExternalAuthorityV1 source does not match the live current-user source');
    }
  }
  return authority;
}

export function authorizeExternalEffect({ authority, effect, liveSourceSha256, mode, target }) {
  if (effect === 'local') {
    return { authorized: true, effect: 'local', mode, target };
  }
  if (!AUTHORITY_SCOPES.has(effect)) fail(`external effect scope is invalid: ${String(effect)}`);
  if (authority === null || authority === undefined) {
    fail(`live ExternalAuthorityV1 is required for ${effect}; persisted intent grants no authority`);
  }
  if (typeof liveSourceSha256 !== 'string' || !HASH.test(liveSourceSha256)) {
    fail(`live current-user source digest is required to authorize ${effect}`);
  }
  validateExternalAuthority(authority, { liveSourceSha256 });
  if (!authority.scopes.includes(effect)) fail(`ExternalAuthorityV1 does not grant exact scope ${effect}`);
  if (authority.mode !== mode) fail(`ExternalAuthorityV1 mode mismatch for ${effect}`);
  if (effect === 'probe' && mode !== 'read') fail('probe authority is read-only');
  if (effect !== 'probe' && mode !== 'mutate') fail(`${effect} authority requires mutate mode`);
  if (typeof target !== 'string' || !authority.targets.includes(target)) {
    fail('ExternalAuthorityV1 target requires exact membership');
  }
  return {
    authorized: true,
    effect,
    mode,
    target,
    source_sha256: authority.source_sha256,
  };
}
