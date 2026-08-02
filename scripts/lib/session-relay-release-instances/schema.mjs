// Shape and closed-key validator for a release instance.
//
// A release instance holds every value that identifies one particular release attempt.
// The lane holds protocol logic and reads identity from here, so releasing edits the
// single `VERSION` declaration plus one new instance file.
//
// There is exactly one field group per row of the identity inventory in the
// release-instance-separation plan. Adding a group here without a row there, or the
// reverse, is drift: the coverage case fails when a scanned identity literal maps to no
// field or to two.
//
// The validator fails closed. An unknown key is an error rather than ignored data,
// because a typo in an instance file would otherwise silently fall back to whatever the
// lane did before, which is the exact failure this separation removes.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const COMMIT40 = /^[0-9a-f]{40}$/;
const DIGEST64 = /^[0-9a-f]{64}$/;
const PLANPATH = /^docs\/plans\/(?:active|finished)\/\S+\.md$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

// kind -> [predicate, description]. Kept as data so the validator has one code path per
// kind and the error text can name the kind that failed.
const KINDS = Object.freeze({
  uuid: [(v) => typeof v === 'string' && UUID.test(v), 'a uuid'],
  commit40: [(v) => typeof v === 'string' && COMMIT40.test(v), 'a 40-hex commit'],
  // A tag that has not been cut yet has no commit, and `null` is the only honest
  // spelling of that. A placeholder such as `deadbeef…` satisfies `commit40`, so it
  // reads as a real commit everywhere downstream and would MATCH a receipt that
  // happened to carry it - turning each `!==` guard into a fail-open. `null` cannot
  // equal a real commit, so every comparison site refuses on its own with no
  // load-time guard, and the publish path asserts the value is no longer null.
  unborn_commit40: [
    (v) => v === null || (typeof v === 'string' && COMMIT40.test(v)),
    'a 40-hex commit, or null while the release tag is not yet cut',
  ],
  digest64: [(v) => typeof v === 'string' && DIGEST64.test(v), 'a 64-hex digest'],
  planpath: [(v) => typeof v === 'string' && PLANPATH.test(v), 'a docs/plans path'],
  version: [(v) => typeof v === 'string' && SEMVER.test(v), 'a semantic version'],
  text: [(v) => typeof v === 'string' && v.length > 0, 'a non-empty string'],
  paths: [
    (v) => Array.isArray(v) && v.length > 0 && v.every((p) => typeof p === 'string' && p.length > 0),
    'a non-empty array of paths',
  ],
  record: [(v) => v !== null && typeof v === 'object' && !Array.isArray(v), 'an object'],
});

export const INSTANCE_FIELD_GROUPS = Object.freeze({
  current_attempt: Object.freeze({
    goal_id: 'uuid',
    docks_repository_id: 'text',
    docks_run_id: 'uuid',
    docks_plan_path: 'planpath',
    docks_source_base: 'commit40',
    public_run_id: 'uuid',
    release_plan_path: 'planpath',
  }),
  planrun_attempt: Object.freeze({
    docks_repository_id: 'text',
    docks_run_id: 'uuid',
    docks_plan_path: 'planpath',
    docks_source_base: 'commit40',
    release_tag_commit: 'unborn_commit40',
    docks_affected_paths: 'paths',
  }),
  retained_promotion: Object.freeze({
    docks_run_id: 'uuid',
    docks_plan_path: 'planpath',
    promotion_sha256: 'digest64',
    completion_review_sha256: 'digest64',
    publication_sha256: 'digest64',
    public_release_sha256: 'digest64',
    source_proof_sha256: 'digest64',
  }),
  continuation_paths: Object.freeze({
    current: 'paths',
    planrun: 'paths',
  }),
  public_child: Object.freeze({
    version: 'version',
    tag: 'text',
    // SHA-256 over the compact JCS of `{schema:1, source_base:<child implementation commit>,
    // paths:[{path, sha256}]}` for every affected path of the child's finished plan, read at that
    // commit. It pins the released bytes this repository reviewed, because a child's PlanRunV1
    // `acceptance.source_sha256` hashes a preimage - manifest source_base plus per-path filesystem
    // modes - that the record never persists and no remote observer can reconstruct.
    implementation_content_sha256: 'digest64',
  }),
  legacy_0_13: Object.freeze({
    release_version: 'version',
    public_plan_path: 'planpath',
    public_blocked_reason: 'text',
    companion_base_commit: 'commit40',
    pinned_completion: 'record',
    pinned_completion_policy: 'record',
    pinned_completion_state: 'record',
  }),
  historical_receipts: Object.freeze({
    source_proof_v1: 'digest64',
    source_proof_v2: 'digest64',
    publication: 'digest64',
    public_request: 'digest64',
  }),
  authorized_base: Object.freeze({
    current_main_base: 'commit40',
    shipped_to_promoted_paths: 'paths',
    authorized_base_to_promoted_paths: 'paths',
  }),
  fixture: Object.freeze({
    plan_path: 'planpath',
  }),
});

// One spelling of the unborn-tag question, so that libraries and contract suites
// cannot each invent their own. `release_tag_commit` is null until the tag is cut;
// see the `unborn_commit40` kind above for why a placeholder commit is not an
// option. Read through these rather than reaching into the instance, so a future
// change to how the unborn state is represented has exactly one edit site.
// Deliberately not written with optional chaining and `?? null`: that spelling
// collapses five states - absent instance, absent group, absent key, `undefined`,
// and an explicit `null` - into a confident "tag not cut", when only the last one
// means that. A suite handing in a partial fixture would then receive a reassuring
// answer instead of an error, which is the same vacuous-assertion failure this
// helper exists to prevent. Only an explicit `null` is the unborn state.
export function releaseTagCommit(instance) {
  const group = instance === null || typeof instance !== 'object' ? undefined : instance.planrun_attempt;
  if (group === null || typeof group !== 'object' || Array.isArray(group)) {
    throw new ReleaseInstanceError(
      'release instance has no planrun_attempt group, so the release tag state is unknown',
    );
  }
  if (!('release_tag_commit' in group)) {
    throw new ReleaseInstanceError(
      'release instance planrun_attempt omits release_tag_commit, so the release tag state is unknown',
    );
  }
  // Presence is not enough. An explicit `undefined` would otherwise flow out and
  // make `isReleaseTagCut` answer true, asserting the tag is cut when nothing is
  // known - the fail-open this helper exists to close.
  const value = group.release_tag_commit;
  if (value !== null && !(typeof value === 'string' && COMMIT40.test(value))) {
    throw new ReleaseInstanceError(
      `release instance release_tag_commit must be a 40-hex commit or null, received ${JSON.stringify(value)}`,
    );
  }
  return value;
}
export const isReleaseTagCut = (instance) => releaseTagCommit(instance) !== null;
export const UNBORN_RELEASE_TAG_REASON = 'the release tag is not cut yet, so no commit can be bound to it';

export class ReleaseInstanceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReleaseInstanceError';
  }
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const inner of Object.values(value)) deepFreeze(inner);
  return Object.freeze(value);
}

// Validate and deep-freeze. Throws `ReleaseInstanceError` naming the offending key.
//
// Groups are optional, fields within a present group are not. A historical instance
// carries only the groups the lane actually recorded for that release - demanding all
// nine would force an executor to invent identity that was never written down, which the
// plan makes a STOP condition. Closure is preserved where it matters: an unknown group or
// field is rejected, and a group that is present must be complete and well-typed. Pass
// `require` to demand specific groups at a call site that genuinely needs them.
export function validateReleaseInstance(instance, { source = 'instance', require: required = [] } = {}) {
  if (instance === null || typeof instance !== 'object' || Array.isArray(instance)) {
    throw new ReleaseInstanceError(`${source} must be an object`);
  }

  for (const group of Object.keys(instance)) {
    if (!(group in INSTANCE_FIELD_GROUPS)) {
      throw new ReleaseInstanceError(`${source} carries unknown field group ${group}`);
    }
  }

  const present = Object.keys(instance);
  if (present.length === 0) {
    throw new ReleaseInstanceError(`${source} carries no field groups`);
  }
  for (const group of required) {
    if (!(group in instance)) {
      throw new ReleaseInstanceError(`${source} is missing required field group ${group}`);
    }
  }

  for (const group of present) {
    const fields = INSTANCE_FIELD_GROUPS[group];
    const value = instance[group];
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new ReleaseInstanceError(`${source} field group ${group} must be an object`);
    }
    for (const key of Object.keys(value)) {
      if (!(key in fields)) {
        throw new ReleaseInstanceError(`${source} carries unknown field ${group}.${key}`);
      }
    }
    for (const [key, kind] of Object.entries(fields)) {
      if (!(key in value)) {
        throw new ReleaseInstanceError(`${source} is missing required field ${group}.${key}`);
      }
      const [ok, described] = KINDS[kind];
      if (!ok(value[key])) {
        throw new ReleaseInstanceError(
          `${source} field ${group}.${key} must be ${described}, received ${JSON.stringify(value[key])}`,
        );
      }
    }
  }

  return deepFreeze(instance);
}
