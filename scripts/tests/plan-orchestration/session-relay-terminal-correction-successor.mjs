import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PREDECESSOR_PATH = 'docs/plans/finished/2026-08-04-session-relay-0.16.0-terminal-evidence-correction.md';
const PRIOR_EVIDENCE_PATH = 'docs/release-evidence/session-relay-0.16.0-terminal-correction.md';
const SUCCESSOR_PATH = 'docs/release-evidence/session-relay-0.16.0-terminal-correction-successor.md';

const PREDECESSOR_SHA256 = '5616f8060401f17bf150108ad9d00fae7eb109602d5f46dc3ffb4a790701a30d';
const PRIOR_EVIDENCE_SHA256 = 'e0c9363e06d434250c398e5b8987e943f2ed11c04bb525a7236f67173a13f775';
const RUN_ID = 'b0cd4072-9703-4b98-9e5f-2f1cba6ac5d2';
const IMPLEMENTATION_COMMIT = '98ea3821689bdfb04c919023cccac9401ff61c63';
const COMPLETION_REVIEW_SHA256 = '415187f5332880e6482306ad8ca261a90fe7c7e90d540fc55599caccb127af4f';
const ARCHIVE_COMMIT = 'ef625042b7db018cb60def998a31b165b08b87ef';
const TERMINAL_DONE_CONDITION =
  'Verification Results bind the observations; CompletionReviewV1 passes; the archived plan has all five step statuses `done`; the terminal checkpoint reaches `DocksDocks/docks:main` and reads back. Any preimage, review, push, or read-back mismatch stops without changing the original archive.';

const SUCCESSOR_PREFIX = 'Successor-correction-record: ';
const ACCEPTED_ARGUMENTS = new Map([
  ['--mode=positive', 'positive'],
  ['--mode=status-mutation', 'status-mutation'],
  ['--mode=promise-mutation', 'promise-mutation'],
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), 'canonical JSON contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  assert.ok(value && typeof value === 'object', 'canonical JSON contains an unsupported value');
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(',')}}`;
}

function exactKeys(value, keys, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} has a non-closed key set`);
}

function onePrefixedJson(text, prefix, label) {
  const lines = text.split('\n').filter((line) => line.startsWith(prefix));
  assert.equal(lines.length, 1, `${label} must contain exactly one ${prefix.trim()} line`);
  const spelling = lines[0].slice(prefix.length);
  assert.ok(spelling.length > 0, `${label} JSON is empty`);
  const value = JSON.parse(spelling);
  assert.equal(lines[0], `${prefix}${canonicalize(value)}`, `${label} JSON is not compact canonical JSON`);
  return value;
}

function assertUtcIsoTimestamp(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`);
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, `${label} is not UTC ISO-8601`);
  const parsed = new Date(value);
  assert.ok(!Number.isNaN(parsed.valueOf()), `${label} is not a real timestamp`);
  assert.equal(parsed.toISOString(), value, `${label} is not normalized UTC ISO-8601`);
}

function validatePlanRun(predecessorText) {
  const run = onePrefixedJson(predecessorText, 'Plan-run: ', 'predecessor Plan-run');
  exactKeys(
    run,
    [
      'acceptance',
      'blocker',
      'completion_review',
      'draft_review',
      'execution_parent',
      'goal_id',
      'implementation_commit',
      'plan_path',
      'plan_sha256',
      'repository_id',
      'requested_effects',
      'risk',
      'run_id',
      'schema',
      'source_base',
      'source_sha256',
    ],
    'predecessor Plan-run',
  );
  exactKeys(run.acceptance, ['source_sha256', 'verification_sha256'], 'Plan-run acceptance');
  exactKeys(
    run.completion_review,
    ['accepted_classes', 'input_sha256', 'invocations', 'result_sha256', 'state'],
    'Plan-run completion_review',
  );
  exactKeys(
    run.draft_review,
    ['accepted_classes', 'input_sha256', 'invocations', 'result_sha256', 'state'],
    'Plan-run draft_review',
  );

  assert.equal(run.schema, 1, 'wrong Plan-run schema');
  assert.equal(run.repository_id, 'DocksDocks/docks', 'wrong Plan-run repository');
  assert.equal(run.run_id, RUN_ID, 'wrong Plan-run run_id');
  assert.equal(run.implementation_commit, IMPLEMENTATION_COMMIT, 'wrong Plan-run implementation commit');
  assert.equal(run.completion_review.state, 'passed', 'Plan-run completion review did not pass');
  assert.equal(
    run.completion_review.result_sha256,
    COMPLETION_REVIEW_SHA256,
    'wrong Plan-run completion review result',
  );
  assert.deepEqual(run.completion_review.accepted_classes, [], 'completion review accepted unexpected classes');
  assert.equal(run.completion_review.invocations, 1, 'wrong completion review invocation count');
  assert.equal(run.blocker, null, 'completed Plan-run has a blocker');

  return run;
}

function validateCompletionResult(predecessorText) {
  const result = onePrefixedJson(predecessorText, 'Completion-review-result: ', 'predecessor Completion-review-result');
  exactKeys(
    result,
    ['diff_sha256', 'findings', 'implementation_commit', 'invocation', 'run_id', 'schema', 'verdict'],
    'Completion-review-result',
  );
  assert.equal(result.schema, 1, 'wrong Completion-review-result schema');
  assert.equal(result.run_id, RUN_ID, 'wrong Completion-review-result run_id');
  assert.equal(
    result.implementation_commit,
    IMPLEMENTATION_COMMIT,
    'wrong Completion-review-result implementation commit',
  );
  assert.equal(result.invocation, 1, 'wrong Completion-review-result invocation');
  assert.equal(result.verdict, 'pass', 'Completion-review-result did not pass');
  assert.deepEqual(result.findings, [], 'Completion-review-result contains findings');
}

function parseSteps(predecessorText) {
  const lines = predecessorText.split('\n');
  const headings = lines.reduce((indexes, line, index) => {
    if (line === '## Steps') indexes.push(index);
    return indexes;
  }, []);
  assert.deepEqual(headings.length, 1, 'predecessor must contain exactly one Steps section');
  const start = headings[0] + 1;
  const relativeEnd = lines.slice(start).findIndex((line) => /^##\s/.test(line));
  assert.notEqual(relativeEnd, -1, 'predecessor Steps section has no closing heading');
  const rows = [];
  for (let index = start; index < start + relativeEnd; index += 1) {
    if (!/^\|\s*\d+\s*\|/.test(lines[index])) continue;
    const cells = lines[index]
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    assert.equal(cells.length, 8, `step row on line ${index + 1} has the wrong cell count`);
    const number = Number(cells[0]);
    assert.ok(Number.isSafeInteger(number), `step row on line ${index + 1} has an invalid number`);
    const unwrapCode = (cell) => (/^`[^`]+`$/.test(cell) ? cell.slice(1, -1) : cell);
    rows.push({
      number,
      id: unwrapCode(cells[1]),
      status: unwrapCode(cells[6]),
      doneCondition: cells[7],
      lineIndex: index,
      line: lines[index],
    });
  }
  return rows;
}

function validateSteps(predecessorText) {
  const steps = parseSteps(predecessorText);
  assert.equal(steps.length, 5, 'predecessor must contain exactly five Steps rows');
  assert.deepEqual(
    steps.map((step) => step.number),
    [1, 2, 3, 4, 5],
    'predecessor step numbers are not exactly 1 through 5',
  );
  assert.equal(steps.filter((step) => step.status === 'done').length, 4, 'predecessor must have four done rows');
  assert.equal(steps.filter((step) => step.status === 'planned').length, 1, 'predecessor must have one planned row');
  const terminal = steps[4];
  assert.equal(terminal.number, 5, 'wrong terminal step number');
  assert.equal(terminal.id, 'bind_and_publish_correction', 'wrong terminal step id');
  assert.equal(terminal.status, 'planned', 'wrong terminal step status');
  assert.equal(terminal.doneCondition, TERMINAL_DONE_CONDITION, 'wrong terminal step done condition');
  return { steps, terminal };
}

function validatePriorEvidence(priorEvidenceText) {
  const correction = onePrefixedJson(priorEvidenceText, 'Correction-record: ', 'prior correction record');
  exactKeys(
    correction,
    ['archive', 'implementation', 'observed_at', 'preflight_refs', 'receipts', 'release', 'remote', 'schema', 'type'],
    'prior correction record',
  );
  exactKeys(
    correction.archive,
    [
      'active_path',
      'contradictory_step_ids',
      'path',
      'sha256',
      'status',
      'terminal_evidence_bound',
      'verification_claimed_through',
    ],
    'prior correction archive',
  );
  exactKeys(
    correction.implementation,
    ['commit', 'completion_review_sha256', 'run_id'],
    'prior correction implementation',
  );
  exactKeys(correction.preflight_refs, ['refs', 'sha256'], 'prior correction preflight_refs');
  exactKeys(correction.receipts, ['finalization_sha256', 'promotion_sha256'], 'prior correction receipts');
  exactKeys(correction.release, ['assets', 'published_at', 'state', 'tag'], 'prior correction release');
  exactKeys(correction.remote, ['active_absent', 'archive_present', 'main'], 'prior correction remote');
  assert.equal(correction.schema, 1, 'wrong prior correction schema');
  assert.equal(correction.type, 'SessionRelayTerminalEvidenceCorrectionV1', 'wrong prior correction type');
}

function validateSuccessor(successorText, terminal) {
  const record = onePrefixedJson(successorText, SUCCESSOR_PREFIX, 'successor correction record');
  exactKeys(
    record,
    ['observed_at', 'predecessor', 'prior_evidence', 'schema', 'terminal', 'type'],
    'successor correction record',
  );
  exactKeys(
    record.predecessor,
    [
      'completion_review_result_sha256',
      'completion_review_state',
      'done_condition',
      'done_rows',
      'implementation_commit',
      'path',
      'recorded_status',
      'required_status',
      'run_id',
      'sha256',
      'status',
      'step_id',
      'step_number',
      'total_rows',
    ],
    'successor predecessor',
  );
  exactKeys(record.prior_evidence, ['path', 'sha256'], 'successor prior_evidence');
  exactKeys(
    record.terminal,
    ['archive_commit', 'published_ref', 'published_remote', 'remote_main_after_push', 'terminal_readback_observed'],
    'successor terminal',
  );

  assert.equal(record.schema, 1, 'wrong successor schema');
  assert.equal(record.type, 'SessionRelayTerminalEvidenceCorrectionSuccessorV1', 'wrong successor type');
  assertUtcIsoTimestamp(record.observed_at, 'successor observed_at');

  assert.deepEqual(
    record.predecessor,
    {
      completion_review_result_sha256: COMPLETION_REVIEW_SHA256,
      completion_review_state: 'passed',
      done_condition: TERMINAL_DONE_CONDITION,
      done_rows: 4,
      implementation_commit: IMPLEMENTATION_COMMIT,
      path: PREDECESSOR_PATH,
      recorded_status: 'planned',
      required_status: 'done',
      run_id: RUN_ID,
      sha256: PREDECESSOR_SHA256,
      status: 'finished',
      step_id: 'bind_and_publish_correction',
      step_number: 5,
      total_rows: 5,
    },
    'wrong successor predecessor binding',
  );
  assert.deepEqual(
    record.prior_evidence,
    { path: PRIOR_EVIDENCE_PATH, sha256: PRIOR_EVIDENCE_SHA256 },
    'wrong successor prior-evidence binding',
  );
  assert.deepEqual(
    record.terminal,
    {
      archive_commit: ARCHIVE_COMMIT,
      published_ref: 'refs/heads/main',
      published_remote: 'DocksDocks/docks',
      remote_main_after_push: ARCHIVE_COMMIT,
      terminal_readback_observed: true,
    },
    'wrong successor terminal binding',
  );

  assert.equal(record.predecessor.step_number, terminal.number, 'successor binds the wrong step number');
  assert.equal(record.predecessor.step_id, terminal.id, 'successor binds the wrong step id');
  assert.equal(record.predecessor.recorded_status, terminal.status, 'successor binds the wrong recorded status');
  assert.equal(
    record.predecessor.done_condition,
    terminal.doneCondition,
    'successor binds the wrong terminal done condition',
  );
}

function proveArchivedBytes(path, expectedBytes) {
  const archived = execFileSync('git', ['show', `${ARCHIVE_COMMIT}:${path}`], {
    cwd: ROOT,
    encoding: null,
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.ok(Buffer.isBuffer(archived), `git show did not return bytes for ${path}`);
  assert.equal(Buffer.compare(archived, expectedBytes), 0, `archive commit bytes differ for ${path}`);
}

function loadInputs() {
  const predecessorBytes = readFileSync(resolve(ROOT, PREDECESSOR_PATH));
  const priorEvidenceBytes = readFileSync(resolve(ROOT, PRIOR_EVIDENCE_PATH));
  const successorBytes = readFileSync(resolve(ROOT, SUCCESSOR_PATH));
  return {
    predecessorBytes,
    predecessorText: predecessorBytes.toString('utf8'),
    priorEvidenceBytes,
    priorEvidenceText: priorEvidenceBytes.toString('utf8'),
    successorBytes,
    successorText: successorBytes.toString('utf8'),
  };
}

function validateCore(inputs, { proveArchive }) {
  assert.equal(sha256(inputs.predecessorBytes), PREDECESSOR_SHA256, 'predecessor SHA-256 mismatch');
  assert.equal(sha256(inputs.priorEvidenceBytes), PRIOR_EVIDENCE_SHA256, 'prior evidence SHA-256 mismatch');
  assert.deepEqual(
    inputs.predecessorText.match(/^status: [^\r\n]+$/gm),
    ['status: finished'],
    'predecessor must have exactly one finished frontmatter status',
  );

  const planRun = validatePlanRun(inputs.predecessorText);
  validateCompletionResult(inputs.predecessorText);
  const { steps, terminal } = validateSteps(inputs.predecessorText);
  validatePriorEvidence(inputs.priorEvidenceText);
  validateSuccessor(inputs.successorText, terminal);

  assert.equal(planRun.run_id, RUN_ID, 'successor targets a different Plan-run');
  assert.equal(steps.length, 5, 'successor targets a different predecessor row set');

  if (proveArchive) {
    proveArchivedBytes(PREDECESSOR_PATH, inputs.predecessorBytes);
    proveArchivedBytes(PRIOR_EVIDENCE_PATH, inputs.priorEvidenceBytes);
  }
}

function mutateTerminalRow(predecessorText, oldText, newText, label) {
  const steps = parseSteps(predecessorText);
  assert.equal(steps.length, 5, `${label} requires the exact five-row predecessor`);
  const terminal = steps[4];
  assert.equal(terminal.number, 5, `${label} could not identify terminal row 5`);
  const first = terminal.line.indexOf(oldText);
  assert.notEqual(first, -1, `${label} source text is absent from the terminal row`);
  assert.equal(terminal.line.indexOf(oldText, first + oldText.length), -1, `${label} source text is ambiguous`);
  const mutatedLine = `${terminal.line.slice(0, first)}${newText}${terminal.line.slice(first + oldText.length)}`;
  const lines = predecessorText.split('\n');
  lines[terminal.lineIndex] = mutatedLine;
  return lines.join('\n');
}

function expectCoreRejection(label, inputs) {
  let rejected = false;
  try {
    validateCore(inputs, { proveArchive: false });
  } catch {
    rejected = true;
  }
  assert.ok(rejected, `${label} was unexpectedly accepted by core validation`);
}

function main() {
  assert.equal(process.argv.length, 3, 'exactly one --mode argument is required');
  const mode = ACCEPTED_ARGUMENTS.get(process.argv[2]);
  assert.ok(mode, `invalid mode: ${process.argv[2]}`);

  const inputs = loadInputs();
  validateCore(inputs, { proveArchive: true });

  if (mode === 'status-mutation') {
    const predecessorText = mutateTerminalRow(inputs.predecessorText, '| `planned` |', '| `done` |', 'status mutation');
    expectCoreRejection('status mutation', { ...inputs, predecessorText });
  } else if (mode === 'promise-mutation') {
    const predecessorText = mutateTerminalRow(
      inputs.predecessorText,
      'all five step statuses `done`',
      'all five step statuses `planned`',
      'promise mutation',
    );
    expectCoreRejection('promise mutation', { ...inputs, predecessorText });
  }

  console.log(`PASS session-relay terminal correction successor ${mode}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL session-relay terminal correction successor: ${message}`);
  process.exitCode = 1;
}
