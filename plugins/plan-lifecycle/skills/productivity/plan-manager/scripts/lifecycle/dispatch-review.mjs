#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
// Crash-safe draft-review dispatch driver.
//
// Seal, reserve, dispatch and settle happen in ONE process, so no window exists
// where the run sits cold-`reserved` with nobody holding it. Cold entry into a
// live review state blocks with dangling-launch evidence and never redispatches
// (docs/plans/AGENTS.md), so a crash between reserve and settle costs the run.
//
// Three properties carry that guarantee, and each is load-bearing:
//
//  1. The reviewer runs as an ASYNC child. A blocking spawn would pin the event
//     loop and a signal arriving mid-dispatch would not reach its handler until
//     the reviewer returned, which is precisely the window this driver removes.
//  2. Signal handlers persist `review_transport_failure` and let the reducer
//     choose the successor state. `reserved` refunds to `retryable`
//     (the refund predicate in runtime/plan-state.mjs, the sole result transition allowed to refund).
//     `transport_retried` cannot reach `retryable` at all (REVIEW_TRANSITIONS in runtime/plan-state.mjs),
//     so it degrades local draft work or blocks; at non-local risk `degraded` is
//     unavailable (validateTuple in runtime/plan-state.mjs) and it blocks. A driver hardcoding one
//     successor fails closed and loses the run it exists to protect.
//  3. Every result event carries `run_id`, `invocation` and `input_sha256`.
//     `resultBindingMatches` in runtime/plan-state.mjs requires them; omitting them is a
//     SUBSTANTIVE failure that burns the permit rather than a transport failure
//     that refunds it.
//
// The body edit is installed INSIDE the reserve transaction, because only that
// transition may move `plan_sha256`, `source_base` and `source_sha256`
// (assertPersistedTransition's draft arm in runtime/plan-state.mjs) - and only when the prior state is not `retryable`, so
// a transport retry can never smuggle new bytes past the reviewer.
//
// Settlement boundary: the driver persists only what is mechanical. `pass` is
// validated matching output and a closed `ReviewInvalidInputV1` is consumed
// against the exact live reservation, so both settle unattended, as does a
// transport failure. It must NOT settle `repair` or `blocked`: `repairing` is for
// an accepted repair verdict only, and reviewer prose never mutates state. On
// those verdicts the driver writes the result to its own file and stops with the
// phase still `reserved` for main-context adjudication.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// A sibling of this driver, NOT `scripts/lib/`: a static relative specifier resolves
// against this module's URL, so the probe travels with the plugin wherever it is
// installed. Author-side `scripts/*` is absent from a consumer's checkout.
import { PLACEHOLDER, probeReviewerRoute } from './reviewer-route-preflight.mjs';

const SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP'];
const PHASE = 'draft_review';
const LIVE_STATES = new Set(['reserved', 'transport_retried']);
const DEFAULT_REVIEWER = ['omp', '--model', 'openai-codex/gpt-5.6-sol', '-p', '--mode', 'json', PLACEHOLDER];
const DISPATCH_TIMEOUT_MS = Number(process.env.DOCKS_REVIEW_TIMEOUT_MS ?? 1_800_000);
// Bounded far below the dispatch budget on purpose: the probe asks for one trivial
// JSON object, so a route still silent after two minutes is not a route worth
// reserving a permit against.
const ROUTE_PROBE_TIMEOUT_MS = 120_000;
// `transactPlanRun` defaults its per-plan lock to 1 s. A contended repository -
// or a probe that deliberately holds the lock to order a preimage race - needs a
// longer budget, so the existing parameter is threaded rather than raced.
const LOCK =
  process.env.DOCKS_PLAN_LOCK_TIMEOUT_MS === undefined
    ? {}
    : { lockTimeoutMs: Number(process.env.DOCKS_PLAN_LOCK_TIMEOUT_MS) };

const USAGE = `Usage: node dispatch-review.mjs <plan-path> [options]

Seals a review bundle, reserves one draft-review permit, dispatches the reviewer
and settles the outcome in a single process. A catchable signal inside the
dispatch window refunds the permit instead of leaving the run cold-reserved.

Options:
  --tag=<name>     result/bundle basename (default: the plan's basename)
  --repo=<path>    repository root (default: derived from the plan path)
  --out-dir=<path> bundle + result directory (default: <repo>/.git/docks-review)
  --body=<file>    repaired plan body installed inside the reserve transaction;
                   rejected when the prior phase state is 'retryable', because a
                   transport retry must not move the reviewed bytes
  --scope-waivers=<file>
                   explicit exact file/path P21 waivers with mandatory reasons
  --commit         actually reserve and dispatch (default: dry run)
  --skip-route-probe
                   skip the pre-reserve reviewer-route probe. Only for an
                   operator who has already proven this exact route; a dry run
                   skips it anyway, because a dry run reserves nothing
  --help           print this text

Environment:
  DOCKS_REVIEWER_ARGV      JSON argv array; '{{PROMPT}}' is replaced by the
                           prompt. Default: ${JSON.stringify(DEFAULT_REVIEWER)}
  DOCKS_REVIEW_TIMEOUT_MS  dispatch timeout in ms (default 1800000)

Run detached (nohup ... &) so a caller-side timeout cannot SIGKILL the driver
mid-dispatch: SIGKILL cannot be handled, so it leaves a bare 'reserved' for cold
entry to block. Only the three catchable signals above refund.

Exit status is 0 when the on-disk phase is settled or deliberately held for
adjudication, and non-zero when the run is left live with no captured verdict.`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}

const flag = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? null : hit.slice(name.length + 3);
};
const planArg = args.find((a) => !a.startsWith('-'));
if (!planArg) {
  console.error('dispatch-review: a plan path is required\n');
  console.error(USAGE);
  process.exit(2);
}

const planFile = path.resolve(planArg);
if (!fs.existsSync(planFile)) {
  console.error(`dispatch-review: plan not found: ${planFile}`);
  process.exit(2);
}

const git = (repo, argv) => execFileSync('git', argv, { cwd: repo, encoding: 'utf8' }).trim();
const REPO = flag('repo') ?? git(path.dirname(planFile), ['rev-parse', '--show-toplevel']);
const PLAN = path.relative(REPO, planFile).split(path.sep).join('/');
const TAG = flag('tag') ?? path.basename(planFile, '.md');
const OUT_DIR = flag('out-dir') ?? path.join(REPO, '.git', 'docks-review');
const BODY = flag('body');
const SCOPE_WAIVERS = flag('scope-waivers');
const COMMIT = args.includes('--commit');
const SKIP_ROUTE_PROBE = args.includes('--skip-route-probe');

// Resolved from this file, never from the plan's repository: when the plugin is
// installed outside the repository under review, the library is not reachable
// from that repository's root at all.
// `fileURLToPath` rather than `.pathname`: the latter keeps percent-encoding, so
// a consumer whose plugin lives under a path containing a space would resolve
// `../plan-run.mjs` into a directory that does not exist.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const lib = await import(path.join(HERE, '../plan-run.mjs'));
const policy = await import(path.join(HERE, '../../../plan-reviewer/scripts/review-policy.mjs'));
const selfCheck = await import(path.join(HERE, 'plan-self-check.mjs'));
const DRAFT_REVIEW_INVOCATION_LIMIT = 2;

const readRecord = (text) => {
  const line = text.split('\n').find((l) => l.startsWith('Plan-run:'));
  if (!line) throw new Error(`${PLAN} carries no Plan-run record`);
  return JSON.parse(line.slice('Plan-run:'.length));
};

const rebindReviewSource = (run, { planSha256, sourceBase, sourceSha256 }) => ({
  ...run,
  plan_sha256: planSha256,
  source_base: sourceBase,
  source_sha256: sourceSha256,
});

const liveBytes = fs.readFileSync(planFile);
const record = readRecord(liveBytes.toString());
const identity = { goalId: record.goal_id, planPath: PLAN, repositoryId: record.repository_id, runId: record.run_id };
const current = lib.validatePlanRun(liveBytes, identity);
const phase = current.run[PHASE];

if (!['not_started', 'retryable', 'repairing'].includes(phase.state)) {
  throw new Error(`draft_review is ${phase.state}: terminal, already live, or out of permits`);
}
if (phase.invocations >= DRAFT_REVIEW_INVOCATION_LIMIT) {
  throw new Error(`draft-review permit ceiling of ${DRAFT_REVIEW_INVOCATION_LIMIT} is spent`);
}
if (BODY !== null && phase.state === 'retryable') {
  throw new Error('a transport retry must not move the reviewed bytes; drop --body');
}

// The bundle binds the bytes the reviewer will actually see, so a repaired body
// is folded in BEFORE sealing and installed by the reserve transaction below.
const candidateSourceText = BODY === null ? liveBytes.toString() : fs.readFileSync(path.resolve(BODY), 'utf8');
const withRecord = (baseText, state) => {
  const lines = baseText.split('\n');
  const at = lines.findIndex((l) => l.startsWith('Plan-run:'));
  if (at < 0) throw new Error('candidate body carries no Plan-run record line to replace');
  lines[at] = `Plan-run: ${lib.jcs(state.run)}`;
  const stamp = lines.findIndex((l) => l.startsWith('updated:'));
  if (stamp >= 0) lines[stamp] = `updated: "${new Date().toISOString().replace('Z', '+00:00')}"`;
  const status = lines.findIndex((l) => l.startsWith('status:'));
  if (status >= 0 && lines[status] !== `status: ${state.status}`) lines[status] = `status: ${state.status}`;
  return Buffer.from(lines.join('\n'));
};

const head = git(REPO, ['rev-parse', 'HEAD']);
// Scope comes from the bytes being sealed, NOT from the bytes on disk. A repaired
// body may widen `affected_paths`, and `planSha256` below already binds the
// candidate - so reading the live frontmatter here sealed a manifest narrower than
// the plan it was bound to. Measured: a repair that added 7 paths produced an
// invocation-2 `source_sha256` byte-identical to invocation 1's, and the reviewer
// caught it as `v1_evidence_mismatch` (199 manifest entries against 206 declared).
const paths = lib.parsePlan(Buffer.from(candidateSourceText)).frontmatter.affected_paths;
const manifest = lib.createAffectedPathManifest({ repo: REPO, sourceBase: head, paths });
const planSha256 = lib.sha256(lib.canonicalPlanView(Buffer.from(candidateSourceText)));
const rebound = {
  planSha256,
  sourceBase: manifest.source_base,
  sourceSha256: manifest.source_sha256,
};
const candidate = {
  status: current.status,
  run: rebindReviewSource(current.run, rebound),
};
const candidateText = withRecord(candidateSourceText, candidate).toString();
const invocation = phase.invocations + 1;
const binding = {
  run_id: record.run_id,
  invocation,
  plan_sha256: planSha256,
  source_sha256: manifest.source_sha256,
};

const preflight = (label, operation) => {
  try {
    return operation();
  } catch (error) {
    console.error(`\ndispatch-review: ${label}: ${String(error.message).slice(0, 200)}`);
    console.error('PREFLIGHT FAILED - no permit reserved, no reviewer dispatched.');
    process.exit(2);
  }
};
let scopeWaivers;
const readScopeWaivers = () => {
  if (SCOPE_WAIVERS === null) return null;
  if (scopeWaivers !== undefined) return scopeWaivers;
  try {
    scopeWaivers = JSON.parse(fs.readFileSync(path.resolve(SCOPE_WAIVERS), 'utf8'));
  } catch (error) {
    throw new Error(`scope waivers are unreadable: ${error.message}`);
  }
  return scopeWaivers;
};

preflight('deterministic scope check failed', () => {
  const result = selfCheck.scriptChecks(candidateSourceText, {
    repo: REPO,
    scopeWaivers: readScopeWaivers(),
  }).P21;
  if (result?.verdict !== 'pass') throw new Error(result?.reason ?? 'P21 did not return a verdict');
});

fs.mkdirSync(OUT_DIR, { recursive: true, mode: 0o700 });
const bundle = policy.createPlanReviewBundle({
  binding,
  manifest,
  outRoot: OUT_DIR,
  planBytes: Buffer.from(candidateText),
  repo: REPO,
  paths,
  sourceBase: head,
});
const prompt = policy.buildPlanReviewPrompt({ binding, bundlePath: bundle.path, expectedSha256: bundle.sha256 });
const resultFile = path.join(OUT_DIR, `${TAG}-${PHASE}-${invocation}-result.json`);

console.log('plan          :', PLAN);
console.log(
  'phase         :',
  PHASE,
  `${phase.state} -> reserved, invocation ${invocation} of ${DRAFT_REVIEW_INVOCATION_LIMIT}`,
);
console.log('head          :', head.slice(0, 12));
console.log(
  'plan_sha256   :',
  record.plan_sha256.slice(0, 16),
  BODY === null ? '(unchanged)' : `-> ${planSha256.slice(0, 16)}`,
);
console.log('bundle        :', bundle.path);
// Printed in full, not truncated: A6 requires the dry run's reported digest to be
// checkable against the sealed bundle, and a 16-character prefix cannot be handed to
// the bundle verifier. An operator comparing it to `input_sha256` needs all of it too.
console.log('bundle_sha256 :', bundle.sha256);
console.log('prompt bytes  :', Buffer.byteLength(prompt));

// --- preflight: everything the dispatch depends on, proven BEFORE a permit is at
// stake ---------------------------------------------------------------------
//
// `docs/plans/AGENTS.md` states one sentence with two halves: "Before reserving,
// preflight the exact reviewer route and a private file that will receive complete
// stdout."
// Both run here, above the reserve, because a throw PAST the reservation leaves a
// live `reserved` that cold entry can only block - and no refund path covers a
// defect the driver could have seen before spending anything.
const RAW_STDOUT = path.join(OUT_DIR, `${TAG}-${PHASE}-${invocation}-stdout.raw`);

// A bare command name is resolved through PATH the way `spawn` will resolve it;
// anything containing a separator is checked where it points. `spawn` itself is
// left untouched - this proves the route, it does not replace it.
const resolveExecutable = (command) => {
  // An empty command joins to the directory itself, and every traversable directory
  // carries X_OK, so `''` and a directory-valued argv[0] both passed an access-only
  // check and then failed at `spawn` - after the reservation.
  //
  // Measured consequence, not assumed: that spawn failure IS caught and refunded, so the
  // phase reaches `retryable` with `invocations` 0 rather than a cold `reserved`. The harm
  // is subtler and still real - a preventable local misconfiguration spends the run's ONE
  // refundable transport failure, and the next genuine transport failure then cannot
  // refund from `transport_retried`: it degrades local work, or blocks at non-local risk.
  // The driver also exits 0 on that path, so a caller reading the status learns nothing.
  if (typeof command !== 'string' || command.trim() === '') {
    throw new Error('reviewer argv[0] is empty');
  }
  const executableFile = (candidate) => {
    // statSync follows symlinks, so a symlinked binary still resolves.
    if (!fs.statSync(candidate).isFile()) throw new Error(`not a regular file: ${candidate}`);
    fs.accessSync(candidate, fs.constants.X_OK);
    return candidate;
  };
  // Resolved against REPO, not this process's cwd, because `spawn` runs the reviewer with
  // `cwd: REPO` and the OS resolves a relative command after that chdir. Checking `./x`
  // against the launcher's cwd is a DIFFERENT file: the route could pass preflight, reserve,
  // and then fail at spawn - the exact ordering this preflight exists to prevent. Relative
  // PATH entries carry the same hazard and get the same treatment.
  if (command.includes(path.sep)) return executableFile(path.resolve(REPO, command));
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (dir === '') continue;
    try {
      return executableFile(path.resolve(REPO, dir, command));
    } catch {
      // Keep walking PATH. Only exhaustion is a failure.
    }
  }
  throw new Error(`not found on PATH: ${command}`);
};

if (!COMMIT) {
  console.log('\nDRY RUN - nothing reserved, nothing dispatched, plan untouched.');
  process.exit(0);
}

// Below the dry-run exit ON PURPOSE. Step 1 requires the route proven ahead of the
// RESERVE, and the reserve is ~40 lines below; the dry-run early exit is not the
// reserve. Hoisting these above it would make `DEFAULT_REVIEWER`'s bare `omp`
// a hard failure for any consumer inspecting a plan without that binary on
// PATH - narrowing the one path whose contract is "nothing reserved, nothing
// dispatched, plan untouched". Every probe case still exercises this, because
// `startDriver` (scripts/tests/plan-dispatch-probes.mjs) always appends `--commit`.
const reviewerRoute = preflight('reviewer route is unusable', () => {
  let parsedArgv;
  try {
    parsedArgv = JSON.parse(process.env.DOCKS_REVIEWER_ARGV ?? JSON.stringify(DEFAULT_REVIEWER));
  } catch (error) {
    throw new Error(`DOCKS_REVIEWER_ARGV is not JSON: ${error.message}`);
  }
  if (!Array.isArray(parsedArgv) || parsedArgv.length === 0) {
    throw new Error(`DOCKS_REVIEWER_ARGV must be a non-empty array, got ${typeof parsedArgv}`);
  }
  if (!parsedArgv.every((a) => typeof a === 'string')) {
    throw new Error('DOCKS_REVIEWER_ARGV must contain only strings');
  }
  // Executability is part of the route being "exact": a binary that does not exist
  // fails at `spawn` after the reservation, which is the same hazard reached later.
  resolveExecutable(parsedArgv[0]);
  return parsedArgv;
});
// The template keeps its placeholder so the probe below can substitute a trivial
// prompt into the SAME argv the dispatch will use. Two argv shapes would prove a
// route nobody is about to trust.
const reviewerArgv = reviewerRoute.map((a) => (a === PLACEHOLDER ? prompt : a));

preflight('raw-stdout target is not writable', () => {
  // Append mode, NOT 'w'. A transport failure refunds the permit, so the retry
  // recomputes the same `invocation` (declared as `phase.invocations + 1`) and the
  // same target path - and a truncating probe would erase the previous attempt's
  // captured stdout, which is the one artifact worth having at that moment.
  // Creating the file here keeps step 4's write the only truncating writer.
  const descriptor = fs.openSync(RAW_STDOUT, 'a', 0o600);
  fs.closeSync(descriptor);
});
// Re-read and verify the sealed artifacts as the last fallible preflight before
// reservation, then bind the record to the two artifacts that actually carry
// each field. The review binding intentionally has no source_base field.
preflight('sealed review bundle is inconsistent', () => {
  const verifiedBundle = policy.verifyPlanReviewBundle({
    binding,
    bundlePath: bundle.path,
    expectedSha256: bundle.sha256,
    repo: REPO,
    paths,
    sourceBase: head,
  });
  const sealedRecord = readRecord(verifiedBundle.planBytes.toString());
  if (sealedRecord.plan_sha256 !== verifiedBundle.binding.plan_sha256) {
    throw new Error('sealed plan record plan_sha256 must equal binding plan_sha256');
  }
  if (sealedRecord.source_sha256 !== verifiedBundle.binding.source_sha256) {
    throw new Error('sealed plan record source_sha256 must equal binding source_sha256');
  }
  if (sealedRecord.source_base !== verifiedBundle.manifest.source_base) {
    throw new Error('sealed plan record source_base must equal manifest source_base');
  }
});

// The last fallible preflight, and the only one that costs anything: it RUNS the
// route once against a fixed trivial prompt, after every free check has passed.
//
// Executability is not usability. The shipped default route answered
// `usage_limit_reached` and its hurried replacement answered off-contract; both
// spawned perfectly, both were discovered only after the reservation, and both
// burned a permit. This probe observes exit status and whether any JSON object came
// back, which is exactly the pair those two failures separate on.
//
// Safe against the crash-safety design in the header rather than an exception to it:
// no reservation exists yet, so the probe consumes no permit, mutates no plan bytes,
// and a refusal here leaves nothing to refund and no cold `reserved` to reconcile.
// The probe is a child process that writes nowhere - not even to RAW_STDOUT, whose
// only writer stays the dispatch itself.
if (!SKIP_ROUTE_PROBE) {
  preflight('reviewer route probe failed', () => {
    const probed = probeReviewerRoute({
      argv: reviewerRoute,
      cwd: REPO,
      env: process.env,
      timeoutMs: ROUTE_PROBE_TIMEOUT_MS,
    });
    if (!probed.usable) {
      // The route is printed separately, not folded into the thrown message:
      // `preflight` truncates at 200 characters, and an operator reading a refusal
      // needs BOTH the full argv that was tried and the reason it came back.
      console.error('\nroute probe   : refused');
      console.error('route         :', reviewerRoute.join(' '));
      throw new Error(probed.reason);
    }
    console.log('route probe   :', `${probed.reason} (${probed.durationMs} ms)`);
  });
}

console.log('route         :', reviewerArgv[0], `(${reviewerArgv.length} argv)`);
console.log('raw stdout    :', RAW_STDOUT);

// --- from here on a permit is at stake ------------------------------------

let withheld = null;
let child = null;
// Set when the reviewed tree moved under the dispatch. The permit refunds, but no verdict
// was captured, so the run still needs redispatching after the tree is reconciled - and a
// caller reading only the exit status would otherwise be told "fine".
let driftRefused = null;

const resultEvent = (type, extra) => ({
  type,
  phase: PHASE,
  run_id: record.run_id,
  invocation,
  input_sha256: bundle.sha256,
  ...extra,
});

// Emitting a result against a phase that is not live hard-fails at
// the live-phase guard in runtime/plan-state.mjs, so a signal arriving BEFORE the reserve lands must
// persist nothing: no permit was consumed, so there is nothing to refund, and
// emitting would turn a clean no-op into a crash inside the very window this
// driver exists to make survivable.
const settle = async (event, label) => {
  const live = fs.readFileSync(planFile);
  const view = lib.validatePlanRun(live, identity);
  const state = view.run[PHASE].state;
  if (!LIVE_STATES.has(state)) {
    console.log(`${label}: no live reservation (phase is ${state}) - nothing persisted`);
    return view;
  }
  const next = lib.reducePlanRun({ current: { status: view.status, run: view.run }, event });
  const out = await lib.transactPlanRun({
    file: planFile,
    identity,
    expectedBytesSha256: lib.sha256(live),
    nextBytes: withRecord(live.toString(), next),
    ...LOCK,
  });
  console.log(
    `${label}: ${PHASE} ${state} -> ${out.run[PHASE].state}`,
    `| invocations ${out.run[PHASE].invocations} | status ${out.status}`,
  );
  return out;
};

// One event, and the reducer picks the successor the phase actually permits:
// refund from `reserved`, degrade or block from `transport_retried`.
const transportFailure = (why) =>
  settle(
    resultEvent('review_transport_failure', {
      result_sha256: lib.sha256(Buffer.from(lib.jcs({ schema: 1, transport_failure: String(why).slice(0, 200) }))),
    }),
    'TRANSPORT FAILURE',
  );

for (const signal of SIGNALS) {
  process.on(signal, async () => {
    console.log(`\n${signal} received inside the dispatch window`);
    if (child !== null && child.exitCode === null) child.kill('SIGKILL');
    try {
      await transportFailure(`killed by ${signal}`);
    } catch (error) {
      console.error('signal settlement failed:', String(error.message).slice(0, 300));
    } finally {
      process.exit(1);
    }
  });
}

const reserved = lib.reducePlanRun({
  current: { status: current.status, run: current.run },
  event: { type: 'reserve_review', phase: PHASE, input_sha256: bundle.sha256 },
});
// Permitted by this transition alone, and only from a non-retryable predecessor.
reserved.run = rebindReviewSource(reserved.run, rebound);

const afterReserve = await lib.transactPlanRun({
  file: planFile,
  identity,
  expectedBytesSha256: lib.sha256(liveBytes),
  nextBytes: withRecord(candidateText, reserved),
  ...LOCK,
});
console.log(
  '\nRESERVED      :',
  `${PHASE} ${afterReserve.run[PHASE].state}, invocation ${afterReserve.run[PHASE].invocations} of ${DRAFT_REVIEW_INVOCATION_LIMIT}`,
);

const runReviewer = () =>
  new Promise((resolve, reject) => {
    child = spawn(reviewerArgv[0], reviewerArgv.slice(1), { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    const errors = [];
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      reject(new Error(`reviewer exceeded ${DISPATCH_TIMEOUT_MS} ms`));
    }, DISPATCH_TIMEOUT_MS);
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => errors.push(d));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      // Persist the COMPLETE byte stream before interpreting it. The target's
      // existence and writability are proven pre-reserve, so this write is the
      // second half of that same AGENTS.md sentence and nothing more. The
      // normalized verdict stays a SEPARATE artifact (`resultFile`), because a
      // reply that fails validation must still be recoverable verbatim.
      const raw = Buffer.concat(chunks);
      try {
        fs.writeFileSync(RAW_STDOUT, raw);
      } catch (error) {
        reject(error);
        return;
      }
      if (code !== 0) {
        reject(new Error(`reviewer exited ${signal ?? code}: ${Buffer.concat(errors).toString().slice(0, 200)}`));
        return;
      }
      // Step 7 judges the PERSISTED bytes, not the buffer they came from: re-read the
      // file that was just written, so a reply that never reached disk can never settle
      // a verdict. `extractReview` and `validatePlanReview` then see exactly what an
      // operator auditing the artifact sees.
      try {
        resolve(fs.readFileSync(RAW_STDOUT, 'utf8'));
      } catch (error) {
        reject(error);
      }
    });
  });

// Accepts a plain JSON reply or an omp `--mode json` event stream.
const extractReview = (stdout) => {
  const texts = [];
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('{')) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type !== 'agent_end') continue;
    for (const message of event.messages ?? []) {
      if (message?.role !== 'assistant') continue;
      for (const block of message.content ?? []) if (block?.type === 'text') texts.push(block.text ?? '');
    }
  }
  const answer = texts.length > 0 ? [...texts].reverse().find((t) => t.includes('{')) : stdout;
  if (!answer || !answer.includes('{')) throw new Error('no JSON object in reviewer output');
  return JSON.parse(answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1));
};

// Transport and reviewer-output defects both refund, but they are NOT the same
// event and must never share one message. A reviewer emitting subtly wrong JSON
// would otherwise look identical to a dead process: the budget drains through
// `retryable` to `transport_retried` to `blocked` while the log only ever says
// "transport failure", and the operator never learns the verdict was readable.
class ReviewerOutputError extends Error {}

try {
  let stdout;
  try {
    stdout = await runReviewer();

    // Drift after dispatch is not `concurrent_change`: that rule covers a mismatch
    // failing BEFORE write or dispatch. Here the sealed bundle went stale through
    // no fault of the review, so it refunds rather than consuming the permit for
    // an environment change - and a `blocked` tuple could not preserve the
    // reservation either.
    const headNow = git(REPO, ['rev-parse', 'HEAD']);
    if (headNow !== head) {
      driftRefused = `HEAD drifted during dispatch: ${head.slice(0, 12)} -> ${headNow.slice(0, 12)}`;
      throw new Error(driftRefused);
    }

    // HEAD holding still does not mean the reviewed bytes held still: the manifest
    // digests worktree CONTENT (the private snapshot step of
    // `createAffectedPathManifest`, in `runtime/git-preimage.mjs`), so an uncommitted edit
    // to an affected path moves `source_sha256` while HEAD is unchanged. Re-derive
    // and compare both, or the guard settles against a stale manifest - which is
    // exactly what it did.
    const driftNow = lib.createAffectedPathManifest({ repo: REPO, sourceBase: headNow, paths });
    if (driftNow.source_sha256 !== manifest.source_sha256) {
      // Both drift branches set this, deliberately symmetric: they are the committed and
      // uncommitted halves of ONE guard, and an exit status that differed between them
      // would be an observable contract no acceptance row explains.
      driftRefused = `affected paths drifted during dispatch: ${manifest.source_sha256.slice(0, 12)} -> ${driftNow.source_sha256.slice(0, 12)}`;
      throw new Error(driftRefused);
    }
  } catch (error) {
    console.log('\nTRANSPORT FAILED:', String(error.message).slice(0, 300));
    await transportFailure(error.message);
    stdout = null;
  }

  if (stdout !== null) {
    let outcome;
    try {
      const parsed = extractReview(stdout);
      // Validate what the reviewer RETURNED, never a reconstruction. Rebuilding
      // `{schema:1,error:'invalid_input',reason}` normalised a wrong-schema, no-schema
      // or extra-key reply into a valid one and settled it TERMINALLY - so a reply the
      // reviewer never made could end the run. Passing `parsed` lets `assertClosed`
      // refuse it as malformed reviewer output, which refunds instead.
      outcome =
        parsed.error === 'invalid_input'
          ? { invalid: lib.validateReviewInvalidInput(parsed) }
          : { review: policy.validatePlanReview(parsed, binding) };
    } catch (error) {
      // The reviewer answered, but not in a form the contract can consume.
      throw new ReviewerOutputError(error.message);
    }

    if (outcome.invalid !== undefined) {
      fs.writeFileSync(resultFile, `${JSON.stringify(outcome.invalid, null, 2)}\n`);
      await settle(resultEvent('review_invalid_input', { result: outcome.invalid }), 'INVALID INPUT');
      console.log('reason        :', outcome.invalid.reason, '- terminal, never redispatched');
    } else {
      const review = outcome.review;
      fs.writeFileSync(resultFile, `${JSON.stringify(review, null, 2)}\n`);
      console.log('verdict       :', review.verdict, `(${review.findings.length} finding(s))`);
      for (const f of review.findings) console.log(`  [${f.id}] ${f.kind} @ ${f.locator.slice(0, 70)}`);

      if (review.verdict === 'pass') {
        await settle(
          resultEvent('review_passed', { result_sha256: lib.sha256(Buffer.from(lib.jcs(review))) }),
          'PASSED',
        );
      } else {
        withheld = review.verdict;
        console.log(`\nNOT SETTLED   : "${review.verdict}" requires main-context acceptance.`);
        console.log('phase remains : reserved (deliberate) - reproduce each finding, accept the');
        console.log('                reproducible ones, then settle from the accepted set.');
        console.log('result bytes  :', resultFile);
      }
    }
  }
} catch (error) {
  const invalidOutput = error instanceof ReviewerOutputError;
  console.log(
    `\n${invalidOutput ? 'INVALID REVIEWER OUTPUT' : 'DISPATCH FAILED'}:`,
    String(error.message).slice(0, 300),
  );
  if (invalidOutput) {
    console.log('The reviewer replied but the reply is not contract-shaped, so the');
    console.log('verdict is unusable. Refunding: a malformed reply must not burn a');
    console.log('substantive permit, and the message above names the validator that');
    console.log('rejected it rather than blaming transport.');
  }
  await transportFailure(invalidOutput ? `invalid reviewer output: ${error.message}` : error.message);
} finally {
  const final = lib.validatePlanRun(fs.readFileSync(planFile), identity);
  const state = final.run[PHASE].state;
  console.log('\nfinal state   :', final.status, `| ${PHASE} ${state} (${final.run[PHASE].invocations} used)`);
  if (LIVE_STATES.has(state)) {
    if (withheld !== null) {
      console.log(`held for acceptance: "${withheld}" captured, permit reserved and unspent.`);
      console.log('ADJUDICATE NOW - an interrupted session here cold-blocks the run.');
    } else {
      console.log('FATAL: left live on disk with no captured verdict.');
      process.exitCode = 1;
    }
  }
  // A drift refund returns the permit, so the phase is not left live and the block above
  // stays quiet - but no verdict was captured and the review still has to happen. Exit
  // non-zero so a caller reading only the status is not told the review completed.
  if (driftRefused !== null) {
    console.log('drift refused :', driftRefused);
    console.log('                permit refunded; reconcile the tree, then redispatch.');
    process.exitCode = 1;
  }
}
