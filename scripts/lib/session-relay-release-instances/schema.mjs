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
    docks_run_id: 'uuid',
    docks_plan_path: 'planpath',
    docks_source_base: 'commit40',
    public_run_id: 'uuid',
    release_plan_path: 'planpath',
  }),
  planrun_attempt: Object.freeze({
    docks_run_id: 'uuid',
    docks_plan_path: 'planpath',
    docks_source_base: 'commit40',
    release_tag_commit: 'commit40',
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
