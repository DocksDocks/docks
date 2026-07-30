#!/usr/bin/env node
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
//     (plan-run.mjs:1552-1557, the sole result transition allowed to refund).
//     `transport_retried` cannot reach `retryable` at all (plan-run.mjs:1523),
//     so it degrades local draft work or blocks; at non-local risk `degraded` is
//     unavailable (plan-run.mjs:535) and it blocks. A driver hardcoding one
//     successor fails closed and loses the run it exists to protect.
//  3. Every result event carries `run_id`, `invocation` and `input_sha256`.
//     `resultBindingMatches` (plan-run.mjs:916) requires them; omitting them is a
//     SUBSTANTIVE failure that burns the permit rather than a transport failure
//     that refunds it.
//
// The body edit is installed INSIDE the reserve transaction, because only that
// transition may move `plan_sha256`, `source_base` and `source_sha256`
// (plan-run.mjs:1636-1639) - and only when the prior state is not `retryable`, so
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
import { execFileSync, spawn } from 'node:child_process';

const SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP'];
const PHASE = 'draft_review';
const LIVE_STATES = new Set(['reserved', 'transport_retried']);
const DEFAULT_REVIEWER = ['omp', '--model', 'openai-codex/gpt-5.6-sol', '-p', '--mode', 'json', '{{PROMPT}}'];
const DISPATCH_TIMEOUT_MS = Number(process.env.DOCKS_REVIEW_TIMEOUT_MS ?? 1_800_000);
// `transactPlanRun` defaults its per-plan lock to 1 s. A contended repository -
// or a probe that deliberately holds the lock to order a preimage race - needs a
// longer budget, so the existing parameter is threaded rather than raced.
const LOCK = process.env.DOCKS_PLAN_LOCK_TIMEOUT_MS === undefined
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
  --commit         actually reserve and dispatch (default: dry run)
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
const COMMIT = args.includes('--commit');

// Resolved from this file, never from the plan's repository: when the plugin is
// installed outside the repository under review, the library is not reachable
// from that repository's root at all.
// `fileURLToPath` rather than `.pathname`: the latter keeps percent-encoding, so
// a consumer whose plugin lives under a path containing a space would resolve
// `../plan-run.mjs` into a directory that does not exist.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const lib = await import(path.join(HERE, '../plan-run.mjs'));
const policy = await import(path.join(HERE, '../../../plan-reviewer/scripts/review-policy.mjs'));

const readRecord = (text) => {
  const line = text.split('\n').find((l) => l.startsWith('Plan-run:'));
  if (!line) throw new Error(`${PLAN} carries no Plan-run record`);
  return JSON.parse(line.slice('Plan-run:'.length));
};

const liveBytes = fs.readFileSync(planFile);
const record = readRecord(liveBytes.toString());
const identity = { goalId: record.goal_id, planPath: PLAN, repositoryId: record.repository_id, runId: record.run_id };
const current = lib.validatePlanRun(liveBytes, identity);
const phase = current.run[PHASE];

if (!['not_started', 'retryable', 'repairing'].includes(phase.state)) {
  throw new Error(`draft_review is ${phase.state}: terminal, already live, or out of permits`);
}
if (phase.invocations >= 2) throw new Error('draft-review permit ceiling of two is spent');
if (BODY !== null && phase.state === 'retryable') {
  throw new Error('a transport retry must not move the reviewed bytes; drop --body');
}

// The bundle binds the bytes the reviewer will actually see, so a repaired body
// is folded in BEFORE sealing and installed by the reserve transaction below.
const candidateText = BODY === null ? liveBytes.toString() : fs.readFileSync(path.resolve(BODY), 'utf8');
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
const paths = current.frontmatter.affected_paths;
const manifest = lib.createAffectedPathManifest({ repo: REPO, sourceBase: head, paths });
const planSha256 = lib.sha256(lib.canonicalPlanView(Buffer.from(candidateText)));
const invocation = phase.invocations + 1;
const binding = { run_id: record.run_id, invocation, plan_sha256: planSha256, source_sha256: manifest.source_sha256 };

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
console.log('phase         :', PHASE, `${phase.state} -> reserved, invocation ${invocation} of 2`);
console.log('head          :', head.slice(0, 12));
console.log('plan_sha256   :', record.plan_sha256.slice(0, 16), BODY === null ? '(unchanged)' : `-> ${planSha256.slice(0, 16)}`);
console.log('bundle        :', bundle.path);
// Printed in full, not truncated: A6 requires the dry run's reported digest to be
// checkable against the sealed bundle, and a 16-character prefix cannot be handed to
// the bundle verifier. An operator comparing it to `input_sha256` needs all of it too.
console.log('bundle_sha256 :', bundle.sha256);
console.log('prompt bytes  :', Buffer.byteLength(prompt));

if (!COMMIT) {
  console.log('\nDRY RUN - nothing reserved, nothing dispatched, plan untouched.');
  process.exit(0);
}

// --- from here on a permit is at stake ------------------------------------

let withheld = null;
let child = null;

const resultEvent = (type, extra) => ({
  type,
  phase: PHASE,
  run_id: record.run_id,
  invocation,
  input_sha256: bundle.sha256,
  ...extra,
});

// Emitting a result against a phase that is not live hard-fails at
// plan-run.mjs:1039-1040, so a signal arriving BEFORE the reserve lands must
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
reserved.run.plan_sha256 = planSha256;
reserved.run.source_base = manifest.source_base;
reserved.run.source_sha256 = manifest.source_sha256;

const afterReserve = await lib.transactPlanRun({
  file: planFile,
  identity,
  expectedBytesSha256: lib.sha256(liveBytes),
  nextBytes: withRecord(candidateText, reserved),
  ...LOCK,
});
console.log(
  '\nRESERVED      :',
  `${PHASE} ${afterReserve.run[PHASE].state}, invocation ${afterReserve.run[PHASE].invocations} of 2`,
);

const reviewerArgv = JSON.parse(process.env.DOCKS_REVIEWER_ARGV ?? JSON.stringify(DEFAULT_REVIEWER)).map((a) =>
  a === '{{PROMPT}}' ? prompt : a,
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
      if (code !== 0) {
        reject(new Error(`reviewer exited ${signal ?? code}: ${Buffer.concat(errors).toString().slice(0, 200)}`));
        return;
      }
      resolve(Buffer.concat(chunks).toString());
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
      throw new Error(`HEAD drifted during dispatch: ${head.slice(0, 12)} -> ${headNow.slice(0, 12)}`);
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
      outcome =
        parsed.error === 'invalid_input'
          ? { invalid: lib.validateReviewInvalidInput({ schema: 1, error: 'invalid_input', reason: parsed.reason }) }
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
        await settle(resultEvent('review_passed', { result_sha256: lib.sha256(Buffer.from(lib.jcs(review))) }), 'PASSED');
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
  console.log(`\n${invalidOutput ? 'INVALID REVIEWER OUTPUT' : 'DISPATCH FAILED'}:`, String(error.message).slice(0, 300));
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
}
