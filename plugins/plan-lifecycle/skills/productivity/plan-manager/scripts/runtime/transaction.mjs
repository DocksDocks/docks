import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  bodyWithNormalizedStepStatuses,
  canonicalPlanViewFromParsed,
  fenceAt,
  jcs,
  normalizeLogicalPaths,
  parsePlan,
  parseStepsTable,
  sha256,
  validatePlanRun,
} from './current-codec.mjs';
import {
  captureRepositoryPreimage,
  gitDirectories,
  repositoryRoot,
  validateRepositoryPreimage,
} from './git-preimage.mjs';
import {
  assertOnlyChanged,
  assertPersistedTransition,
  assertPlainObject,
  assertPlanRunReplacement,
  changedRunFields,
  fail,
  HASH,
  LIVE_REVIEW_STATES,
  NORMALIZED_STEP_STATUS,
  PLAN_HASH_MODE,
  STEP_STATUS_TRANSITIONS,
  UUID,
  validatePlanReplacementAuthority,
} from './plan-state.mjs';

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}

function readLockOwner(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(lockPath, 'owner.json'), 'utf8'));
  } catch {
    return null;
  }
}

function releaseLock(handle) {
  const owner = readLockOwner(handle.path);
  if (owner !== null && owner.nonce === handle.owner.nonce) fs.rmSync(handle.path, { recursive: true, force: true });
}

function reclaimDeadLock(lockPath, requested, verifyPreimage) {
  const owner = readLockOwner(lockPath);
  if (owner === null) return false;
  if (owner.hostname !== os.hostname()) fail('foreign lock owner blocks reclamation');
  if (processAlive(owner.pid)) return false;
  if (owner.run_id !== requested.run_id || owner.expected_preimage !== requested.expected_preimage) {
    fail('dead lock belongs to a different owner/run or preimage');
  }
  verifyPreimage();
  const tombstone = `${lockPath}.reclaim-${process.pid}-${randomUUID()}`;
  try {
    fs.renameSync(lockPath, tombstone);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return true;
    throw error;
  }
  fs.rmSync(tombstone, { recursive: true, force: true });
  return true;
}

async function acquireLock({ lockPath, owner, timeoutMs, verifyPreimage }) {
  const started = Date.now();
  fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  while (true) {
    try {
      fs.mkdirSync(lockPath, { mode: 0o700 });
      const ownerPath = path.join(lockPath, 'owner.json');
      const descriptor = fs.openSync(ownerPath, 'wx', 0o600);
      try {
        fs.writeFileSync(descriptor, jcs(owner));
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      return {
        owner,
        path: lockPath,
        release() {
          releaseLock(this);
        },
      };
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
    }
    if (reclaimDeadLock(lockPath, owner, verifyPreimage)) continue;
    if (Date.now() - started >= timeoutMs) fail('lock owner is busy or lock acquisition timed out');
    await new Promise((resolve) => setTimeout(resolve, Math.min(10, timeoutMs)));
  }
}

export async function acquirePlanLock({
  file,
  repositoryId,
  planPath,
  runId,
  expectedBytesSha256,
  lockRoot = path.join(os.tmpdir(), 'docks-plan-run-locks'),
  lockTimeoutMs = 1_000,
}) {
  if (typeof file !== 'string' || file === '') fail('plan lock file is required');
  if (typeof repositoryId !== 'string' || repositoryId === '') fail('plan lock repository identity is required');
  normalizeLogicalPaths([planPath], 'plan path');
  if (!UUID.test(runId) || !HASH.test(expectedBytesSha256)) fail('plan lock run/preimage identity is invalid');
  // Resolve symlinks, not just `.`/`..`. The lock key is the plan's identity, so two callers naming
  // the SAME record through different paths must contend for the same lock. Keying on
  // `path.resolve` alone let an alias and its target take two different locks and enter the same
  // transaction together, which is the mutual exclusion this lock exists to provide. An absent
  // file keeps the resolved path and fails the preimage check immediately below.
  let absolute = path.resolve(file);
  try {
    absolute = fs.realpathSync(absolute);
  } catch {
    // The preimage verification below reports the missing file with its own message.
  }
  const verifyPreimage = () => {
    if (!fs.existsSync(absolute) || sha256(fs.readFileSync(absolute)) !== expectedBytesSha256) {
      fail('dead plan lock preimage is stale');
    }
  };
  verifyPreimage();
  const key = sha256(jcs({ file: absolute, plan_path: planPath, repository_id: repositoryId }));
  const owner = {
    schema: 1,
    hostname: os.hostname(),
    pid: process.pid,
    run_id: runId,
    expected_preimage: expectedBytesSha256,
    nonce: randomUUID(),
  };
  return acquireLock({ lockPath: path.join(lockRoot, key), owner, timeoutMs: lockTimeoutMs, verifyPreimage });
}
function writePlanBytes(file, expectedBytesSha256, nextBuffer) {
  const directory = path.dirname(file);
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    const descriptor = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeFileSync(descriptor, nextBuffer);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    if (sha256(fs.readFileSync(file)) !== expectedBytesSha256) fail('plan CAS preimage changed before atomic rename');
    fs.renameSync(temporary, file);
    fsyncDirectory(directory);
    const readback = fs.readFileSync(file);
    if (!readback.equals(nextBuffer)) fail('plan transaction readback mismatch');
    return readback;
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
function fsyncDirectory(directory) {
  const descriptor = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

// A plan cannot finish before it started. Enforced on the write paths rather
// than inside `validatePlanRun` so the one archived record carrying an
// inversion keeps validating and no historical plan is retroactively rejected.
// `frontmatter` is already on every validated view, so this costs no extra
// parse. Both writers must call it: an ordinary transition and a replacement
// authority are independent routes to the same bytes, and the driver-shaped
// replacement path is what produced the one inversion on record. No "did this
// transition move the stamp" refinement: it would guard an unreachable case,
// since `finished_at` is only set at finish and finished bytes are immutable.
// A plan that somehow does carry an inversion is blocked until repaired.
//
// Known bound: `Date.parse` truncates to whole milliseconds, so an inversion
// inside one millisecond is invisible here - `...T00:00:00.0009Z` and
// `...T00:00:00.0001Z` both parse to 1784851200000 and compare equal. A
// lexicographic tie-break would be wrong across differing UTC offsets, and the
// inversion this guard exists to catch was 151 minutes, so the bound is recorded
// rather than traded for a riskier comparison.
function assertPlanChronology(frontmatter) {
  const instant = (value, label) => {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') fail(`PlanRun ${label} must be a string or null`);
    const parsedInstant = Date.parse(value);
    if (Number.isNaN(parsedInstant)) fail(`PlanRun ${label} is not a valid instant: ${value}`);
    return parsedInstant;
  };
  const startedAt = instant(frontmatter.started_at, 'started_at');
  const finishedAt = instant(frontmatter.finished_at, 'finished_at');
  if (startedAt !== null && finishedAt !== null && finishedAt < startedAt) {
    fail('PlanRun finished_at cannot precede started_at');
  }
}
function planRunBodyLineIndex(body) {
  let fence = null;
  let recordIndex = null;
  const lines = body.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const marker = fenceAt(lines[index]);
    if (fence === null && marker !== null) {
      fence = marker;
      continue;
    }
    if (
      fence !== null &&
      marker !== null &&
      marker.marker === fence.marker &&
      marker.length >= fence.length &&
      /^\s*$/.test(marker.tail)
    ) {
      fence = null;
      continue;
    }
    if (fence === null && /^Plan-run:/.test(lines[index])) {
      if (recordIndex !== null) fail('duplicate Plan-run record');
      recordIndex = index;
    }
  }
  if (recordIndex === null) fail('missing unfenced Plan-run record');
  return recordIndex;
}

function comparableStatusProgressBytes(bytes, parsed, steps) {
  const lines = Buffer.from(bytes).toString('utf8').split('\n');
  const bodyOffset = parsed.frontmatterEnd + 1;
  for (const row of steps.rows) {
    const index = bodyOffset + row.lineIndex;
    const line = lines[index];
    lines[index] = line.slice(0, row.statusStart) + NORMALIZED_STEP_STATUS + line.slice(row.statusEnd);
  }
  const updatedIndexes = [];
  for (let index = 1; index < parsed.frontmatterEnd; index += 1) {
    if (/^updated:/.test(parsed.lines[index])) updatedIndexes.push(index);
  }
  if (updatedIndexes.length !== 1) fail('status progress requires exactly one frontmatter updated timestamp');
  const updatedIndex = updatedIndexes[0];
  const updatedEnding = lines[updatedIndex].endsWith('\r') ? '\r' : '';
  lines[updatedIndex] = `<updated>${updatedEnding}`;
  const recordIndex = bodyOffset + planRunBodyLineIndex(parsed.body);
  const recordEnding = lines[recordIndex].endsWith('\r') ? '\r' : '';
  lines[recordIndex] = `<Plan-run>${recordEnding}`;
  return lines.join('\n');
}

function assertStatusProgressTransition(current, next, currentBytes, nextBytes) {
  if (current.frontmatter.plan_hash_mode !== PLAN_HASH_MODE || next.frontmatter.plan_hash_mode !== PLAN_HASH_MODE) {
    return false;
  }
  const currentSteps = parseStepsTable(parsePlan(currentBytes).body);
  const nextParsed = parsePlan(nextBytes);
  const nextSteps = parseStepsTable(nextParsed.body);
  if (
    currentSteps.rows.length !== nextSteps.rows.length ||
    currentSteps.rows.some((row, index) => row.identity !== nextSteps.rows[index].identity)
  ) {
    fail('status progress must preserve Steps row identities and order');
  }
  const changedRows = currentSteps.rows.filter((row, index) => row.status !== nextSteps.rows[index].status);
  if (changedRows.length === 0) return false;
  if (current.status === 'blocked' || current.status === 'finished') {
    fail(`${current.status} PlanRun bytes are immutable`);
  }
  if (
    [current.run.draft_review.state, current.run.completion_review.state].some((state) => LIVE_REVIEW_STATES.has(state))
  ) {
    fail('status progress is forbidden while a review reservation is live');
  }
  if (current.status !== 'ongoing') fail('status progress requires an ongoing PlanRun');
  if (current.status !== next.status) fail('status progress cannot change lifecycle status');
  for (let index = 0; index < currentSteps.rows.length; index += 1) {
    const before = currentSteps.rows[index].status;
    const after = nextSteps.rows[index].status;
    if (before !== after && !STEP_STATUS_TRANSITIONS.get(before).has(after)) {
      fail(`illegal Steps Status transition: ${before} -> ${after}`);
    }
  }
  const currentParsed = parsePlan(currentBytes);
  const currentUpdated = currentParsed.frontmatter.updated;
  const nextUpdated = nextParsed.frontmatter.updated;
  if (
    typeof currentUpdated !== 'string' ||
    typeof nextUpdated !== 'string' ||
    Number.isNaN(Date.parse(currentUpdated)) ||
    Number.isNaN(Date.parse(nextUpdated)) ||
    currentUpdated === nextUpdated
  ) {
    fail('status progress requires a changed valid frontmatter updated timestamp');
  }
  const changed = changedRunFields(current, next);
  const normalizedDigest = sha256(
    canonicalPlanViewFromParsed(
      currentParsed.frontmatter,
      bodyWithNormalizedStepStatuses(currentParsed.body, currentSteps),
      false,
    ),
  );
  const bootstrap = current.run.plan_sha256 !== normalizedDigest;
  if (bootstrap) {
    if (!currentSteps.rows.every((row) => row.status === 'planned')) {
      fail('only an all-planned marked plan may bootstrap its normalized digest');
    }
    if (next.run.plan_sha256 !== normalizedDigest) {
      fail('first status progress must atomically install the normalized plan digest');
    }
    assertOnlyChanged(changed, new Set(['plan_sha256']), 'bootstrap status progress');
  } else {
    if (next.run.plan_sha256 !== current.run.plan_sha256) {
      fail('status progress cannot change an installed normalized plan digest');
    }
    assertOnlyChanged(changed, new Set(), 'status progress');
  }
  if (
    comparableStatusProgressBytes(currentBytes, currentParsed, currentSteps) !==
    comparableStatusProgressBytes(nextBytes, nextParsed, nextSteps)
  ) {
    fail('status progress may change only Steps Status cells, updated, and the bootstrap digest');
  }
  return true;
}

export async function transactPlanRun({
  file,
  identity,
  expectedBytesSha256,
  nextBytes,
  lockRoot,
  lockTimeoutMs = 1_000,
  acceptanceManifest,
  acceptanceManifestExpectation,
}) {
  assertPlainObject(identity, 'plan transaction identity');
  if (!HASH.test(expectedBytesSha256)) fail('plan transaction expected preimage must be a SHA-256 digest');
  // Same single-resolution rule as `replacePlanRunInPlace`, and it matters more here: every
  // `start`, reserve, record and finish goes through this function. `acquirePlanLock` resolves
  // symlinks to build its key, so passing the caller's raw `file` on to the CAS read and
  // `writePlanBytes` would lock the target and write the alias. Resolve once, then use that one
  // value for the lock, the read and the rename.
  let canonicalFile = path.resolve(file);
  try {
    canonicalFile = fs.realpathSync(canonicalFile);
  } catch {
    // An absent file keeps the resolved path; the lock's own preimage check reports it.
  }
  const lock = await acquirePlanLock({
    file: canonicalFile,
    repositoryId: identity.repositoryId,
    planPath: identity.planPath,
    runId: identity.runId,
    expectedBytesSha256,
    ...(lockRoot === undefined ? {} : { lockRoot }),
    lockTimeoutMs,
  });
  try {
    const currentBytes = fs.readFileSync(canonicalFile);
    if (sha256(currentBytes) !== expectedBytesSha256) fail('plan CAS preimage is stale');
    const current = validatePlanRun(currentBytes, { ...identity, acceptanceProof: 'recorded' });
    const nextBuffer = Buffer.from(nextBytes);
    // Key the proof mode on what the transition DOES, not on which side is read.
    // Minting or changing an acceptance must be proven against live bytes;
    // carrying one forward unchanged only re-reads bytes the CAS preimage above
    // already pinned, and re-proving those is impossible once HEAD has moved.
    const carried = validatePlanRun(nextBuffer, { ...identity, acceptanceProof: 'recorded' });
    const installsAcceptance =
      carried.run.acceptance !== null && jcs(carried.run.acceptance) !== jcs(current.run.acceptance);
    // Pin `live` explicitly rather than relying on the default: `identity` is
    // only asserted to be a plain object, so a caller could otherwise smuggle
    // `acceptanceProof: 'recorded'` through the spread and skip the one proof
    // that matters. Omitting the manifest then fails closed on the existing error.
    const next = installsAcceptance
      ? validatePlanRun(nextBuffer, {
          ...identity,
          acceptanceProof: 'live',
          ...(acceptanceManifest === undefined ? {} : { acceptanceManifest }),
          ...(acceptanceManifestExpectation === undefined ? {} : { acceptanceManifestExpectation }),
        })
      : carried;
    // Draft review F1 observed that `recorded` drops two checks, not one: the
    // live manifest re-snapshot and the `frontmatter.affected_paths` comparison,
    // the only site in this module reading `affected_paths`. Its conclusion — a
    // carry-forward could therefore rewrite the path set — was disproven: the
    // set is inside `canonicalPlanView`, so editing it moves `plan_sha256`, and
    // `assertPersistedTransition` permits no ordinary transition to change that.
    // Verified both ways; an explicit guard here is unreachable. The protection
    // is pinned by test instead of restated as code that can never fire.
    if (jcs(current.attempt_history) !== jcs(next.attempt_history)) {
      fail('ordinary PlanRun transitions cannot mutate attempt history');
    }
    const statusProgress = assertStatusProgressTransition(current, next, currentBytes, nextBuffer);
    if (!statusProgress) {
      assertPersistedTransition({ status: current.status, run: current.run }, { status: next.status, run: next.run });
    }
    if (
      (current.status === 'finished' || (current.status === 'blocked' && next.status === 'blocked')) &&
      !currentBytes.equals(nextBuffer)
    ) {
      fail(`${current.status} PlanRun bytes are immutable`);
    }
    if (
      !statusProgress &&
      jcs({ status: current.status, run: current.run }) === jcs({ status: next.status, run: next.run }) &&
      !currentBytes.equals(nextBuffer)
    ) {
      fail('persisted PlanRun bytes cannot change without a legal state event');
    }
    assertPlanChronology(next.frontmatter);
    const readback = writePlanBytes(canonicalFile, expectedBytesSha256, nextBuffer);
    return {
      attempt_history: next.attempt_history,
      bytes_sha256: sha256(readback),
      run: next.run,
      status: next.status,
    };
  } finally {
    lock.release();
  }
}

export async function replacePlanRunInPlace({
  authority,
  currentIdentity,
  expectedBytesSha256,
  file,
  liveSourceSha256,
  lockRoot,
  lockTimeoutMs = 1_000,
  nextBytes,
  repo,
}) {
  assertPlainObject(currentIdentity, 'current plan transaction identity');
  if (!HASH.test(expectedBytesSha256)) fail('plan transaction expected preimage must be a SHA-256 digest');
  // Resolve ONCE, before the lock, and use that single value for the lock key, the CAS read, the
  // logical-path guard and the rename. Resolving again after `await acquirePlanLock` reopened the
  // window the guard was meant to close: a symlink retargeted during acquisition made the lock key
  // describe one record while the write landed on another. One resolution, one path, no window.
  const root = repositoryRoot(repo);
  let logicalFile;
  let canonicalFile;
  try {
    canonicalFile = fs.realpathSync(file);
    const relativeFile = path.relative(root, canonicalFile).split(path.sep).join('/');
    [logicalFile] = normalizeLogicalPaths([relativeFile], 'replacement file path');
  } catch {
    fail('replacement file path does not match current PlanRun plan_path');
  }
  const lock = await acquirePlanLock({
    file: canonicalFile,
    repositoryId: currentIdentity.repositoryId,
    planPath: currentIdentity.planPath,
    runId: currentIdentity.runId,
    expectedBytesSha256,
    ...(lockRoot === undefined ? {} : { lockRoot }),
    lockTimeoutMs,
  });
  try {
    const currentBytes = fs.readFileSync(canonicalFile);
    if (sha256(currentBytes) !== expectedBytesSha256) fail('plan CAS preimage is stale');
    // The predecessor is immutable, terminal, and about to be recorded rather
    // than consulted: its bytes are pinned here by the CAS preimage and again by
    // `plan_bytes_sha256` in the attempt entry, so historical unmarked records
    // remain valid. The successor is separately mode-guarded below.
    const current = validatePlanRun(currentBytes, { ...currentIdentity, acceptanceProof: 'recorded' });
    if (logicalFile !== current.run.plan_path) {
      fail('replacement file path does not match current PlanRun plan_path');
    }
    const nextBuffer = Buffer.from(nextBytes);
    const next = validatePlanRun(nextBuffer, {
      goalId: current.run.goal_id,
      planPath: current.run.plan_path,
      repositoryId: current.run.repository_id,
    });
    if (next.frontmatter.plan_hash_mode !== PLAN_HASH_MODE) {
      fail(`successor frontmatter plan_hash_mode must be ${PLAN_HASH_MODE}`);
    }
    validatePlanReplacementAuthority(authority, current, next, liveSourceSha256);
    assertPlanRunReplacement(current, next, currentBytes, authority);
    assertPlanChronology(next.frontmatter);
    const readback = writePlanBytes(canonicalFile, expectedBytesSha256, nextBuffer);
    return {
      attempt_history: next.attempt_history,
      bytes_sha256: sha256(readback),
      run: next.run,
      status: next.status,
    };
  } finally {
    lock.release();
  }
}
export async function withRepositoryTransaction(
  { expected, ownedPaths, repo, runId, lockTimeoutMs = 1_000 },
  operation,
) {
  if (typeof operation !== 'function') fail('repository transaction operation must be a function');
  validateRepositoryPreimage(expected);
  if (!UUID.test(runId)) fail('repository transaction run id must be a UUID');
  const root = repositoryRoot(repo);
  const logical = normalizeLogicalPaths(ownedPaths, 'owned path');
  if (expected.repository !== root || jcs(logical) !== jcs(expected.owned_paths.map((entry) => entry.path))) {
    fail('repository transaction owned path/repository preimage mismatch');
  }
  const { commonDir } = gitDirectories(root);
  const expectedDigest = sha256(jcs(expected));
  const owner = {
    schema: 1,
    hostname: os.hostname(),
    pid: process.pid,
    run_id: runId,
    expected_preimage: expectedDigest,
    nonce: randomUUID(),
  };
  const verifyPreimage = () => {
    const actual = captureRepositoryPreimage({ repo: root, ownedPaths: logical });
    if (jcs(actual) !== jcs(expected)) fail('repository HEAD, index, or owned-path preimage changed concurrently');
  };
  const lockPath = path.join(commonDir, 'docks-plan-run-locks', 'repository');
  const lock = await acquireLock({ lockPath, owner, timeoutMs: lockTimeoutMs, verifyPreimage });
  try {
    verifyPreimage();
    return await operation();
  } finally {
    lock.release();
  }
}
