#!/usr/bin/env node
// Falsification probes for acceptance-evidence bookkeeping. Test scaffolding, never payload.
//
// Every writable fixture lives in a temporary directory outside `docs/plans/`.
// A child command's failure is evidence: each probe catches and judges that status,
// then exits 0 only when the stated expectation holds. No probe dispatches a reviewer
// or reserves a permit on a real plan.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeRepository, withTempDirectory } from './plan-orchestration/harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
// Two distinct roles, deliberately two constants.
//
// `LIVE_PLAN` is gone on purpose. Proving a probe left the real plans alone is now
// `withLivePlanGuard`, which digests the whole corpus instead of naming one path that the
// lifecycle is free to archive.
//
// `FIXTURE_PLAN` is the byte source probes MUTATE into scratch fixtures. It must be frozen:
// `installProofRecords` reads the acceptance table and `mutateOneRowField` indexes fixed row
// columns, so sourcing those from a live plan coupled them to a body that drafting rewrites.
const FIXTURE_PLAN = path.join(ROOT, 'scripts/tests/fixtures/structural-plan.md');
const SELF_CHECK_PATH = path.join(
  ROOT,
  'plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs',
);
const SAMPLE_REVIEW_PATH = path.join(
  ROOT,
  'plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/sample-review.mjs',
);
const PLAN_RUN_PATH = path.join(ROOT, 'plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs');
const MEASUREMENTS_PATH = path.join(
  ROOT,
  'plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-measurements.mjs',
);
const CONTRACT_PATHS = [
  path.join(ROOT, 'docs/plans/AGENTS.md'),
  path.join(ROOT, 'plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md'),
];

const selfCheck = await import(SELF_CHECK_PATH);
const measurements = await import(MEASUREMENTS_PATH);
const api = await import(PLAN_RUN_PATH);
const args = process.argv.slice(2);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const planRunLine = (bytes) =>
  bytes
    .toString()
    .split('\n')
    .find((line) => line.startsWith('Plan-run: '));
const planRunRecord = (bytes) => JSON.parse(planRunLine(bytes).slice('Plan-run: '.length));

// Guard the whole plan CORPUS, never one path. The invariant these probes need is "the probe
// wrote nothing into docs/plans/", and naming a single file could not express it: this suite was
// pinned to one active plan, and the moment that plan archived, every guarded probe failed on
// ENOENT against a path the lifecycle had legitimately moved. A digest map over both directories
// is path-independent - it survives archive, creation and deletion - and is strictly stronger,
// because it also catches a probe that damages some OTHER plan.
function planCorpusDigest() {
  const corpus = new Map();
  for (const relative of ['docs/plans/active', 'docs/plans/finished']) {
    const directory = path.join(ROOT, relative);
    if (!fs.existsSync(directory)) continue;
    for (const entry of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, entry);
      if (!fs.statSync(file).isFile()) continue;
      corpus.set(`${relative}/${entry}`, sha256(fs.readFileSync(file)));
    }
  }
  return corpus;
}

async function withLivePlanGuard(operation) {
  const before = planCorpusDigest();
  assert.ok(before.size > 0, 'the plan corpus must not be empty, or this guard proves nothing');
  let result;
  let failure;
  try {
    result = await operation();
  } catch (error) {
    failure = error;
  }
  const after = planCorpusDigest();
  assert.deepEqual([...after.entries()].sort(), [...before.entries()].sort(), 'the probe changed docs/plans/');
  if (failure !== undefined) throw failure;
  return result;
}

const withScratch = (prefix, operation) =>
  withTempDirectory(prefix, async (root) => {
    const plansRoot = path.join(ROOT, 'docs/plans') + path.sep;
    assert.ok(!path.resolve(root).startsWith(plansRoot), 'scratch root must be outside docs/plans');
    return operation(root);
  });

function spawnNode(argv, options = {}) {
  const result = spawnSync(process.execPath, argv, {
    cwd: options.cwd ?? ROOT,
    encoding: 'utf8',
    timeout: options.timeout ?? 120_000,
    env: { ...process.env, ...options.env },
  });
  assert.equal(result.error, undefined, `${path.basename(argv[0])} failed to start`);
  assert.equal(result.signal, null, `${path.basename(argv[0])} was signalled`);
  return { ...result, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function replaceExactly(text, before, after, label) {
  const count = text.split(before).length - 1;
  assert.equal(count, 1, `${label}: expected exactly one mutation target, found ${count}`);
  return text.replace(before, after);
}

function installProofRecords(planText) {
  const report = selfCheck.acceptanceProofReport(planText);
  const records = report.rows.map((row) => ({
    row_id: row.row_id,
    step_id: row.expected_keys.step_id,
    command_sha256: row.expected_keys.command_sha256,
    expected_sha256: row.expected_keys.expected_sha256,
    source_base: row.expected_keys.source_base,
    binds: row.binds,
    observed: row.binds === 'match' ? { matcher: 'proof-line-count', result: report.rows.length } : 0,
    probe: `fixture:${row.row_id}`,
  }));
  assert.ok(records.length > 0, 'proof fixture must contain at least one acceptance row');
  assert.ok(
    records.every((record) => ['exit', 'match'].includes(record.binds)),
    'every fixture row needs a binding',
  );

  const lines = planText.split('\n');
  const start = lines.indexOf('## Verification Results');
  assert.notEqual(start, -1, 'proof fixture needs Verification Results');
  const next = lines.findIndex((line, index) => index > start && /^##\s+/.test(line));
  const end = next < 0 ? lines.length : next;
  lines.splice(
    start + 1,
    end - start - 1,
    '',
    ...records.map((record) => `Falsifiability-proof: ${api.jcs(record)}`),
    '',
  );
  const installed = lines.join('\n');
  const proven = selfCheck.acceptanceProofReport(installed);
  assert.equal(proven.unproven, 0, 'fixture proof installation must prove every row');
  return installed;
}

function oneRowPlan({ command = '`node fixture.mjs`', expected = 'Exit 0', sourceBase = 'a'.repeat(40) } = {}) {
  const run = {
    schema: 1,
    goal_id: '10000000-0000-4000-8000-000000000001',
    run_id: '20000000-0000-4000-8000-000000000002',
    repository_id: 'docks:scratch-evidence-report',
    plan_path: 'plans/evidence-report.md',
    requested_effects: ['local'],
    risk: 'local',
    plan_sha256: 'b'.repeat(64),
    source_base: sourceBase,
    source_sha256: 'c'.repeat(64),
    draft_review: { state: 'passed', invocations: 1, input_sha256: 'd'.repeat(64), result_sha256: 'e'.repeat(64) },
    execution_parent: sourceBase,
    implementation_commit: null,
    completion_review: { state: 'not_required', invocations: 0, input_sha256: null, result_sha256: null },
    acceptance: null,
    blocker: null,
  };
  return [
    '---',
    'title: Evidence report fixture',
    'goal: Bind one acceptance row.',
    'status: ongoing',
    'created: "2026-07-31T00:00:00Z"',
    'updated: "2026-07-31T00:00:00Z"',
    'started_at: "2026-07-31T00:00:00Z"',
    'finished_at: null',
    'affected_paths:',
    '  - tracked.txt',
    '---',
    '',
    '# Evidence report fixture',
    '',
    '## Acceptance criteria',
    '',
    '| ID | Step | Command | Expected |',
    '|---|---:|---|---|',
    `| A1 | 1 | ${command} | ${expected} |`,
    '',
    '| Binding | Observation | Rows |',
    '|---|---|---|',
    '| `exit` | child status | A1 |',
    '',
    `Plan-run: ${api.jcs(run)}`,
    '',
    '## Verification Results',
    '',
    'Not yet started.',
    '',
    '## Review',
    '',
    '(fixture)',
    '',
  ].join('\n');
}

function mutateOneRowField(planText, field, value) {
  const indexes = { step_id: 2, command_sha256: 3, expected_sha256: 4 };
  const index = indexes[field];
  assert.notEqual(index, undefined, `unsupported row field ${field}`);
  const lines = planText.split('\n');
  const row = lines.findIndex((line) => /^\|\s*A1\s*\|/.test(line));
  assert.notEqual(row, -1, 'fixture A1 row is missing');
  const cells = lines[row].split('|');
  cells[index] = ` ${value} `;
  lines[row] = cells.join('|');
  return lines.join('\n');
}

function mutateSourceBase(planText, value) {
  const lines = planText.split('\n');
  const index = lines.findIndex((line) => line.startsWith('Plan-run: '));
  assert.notEqual(index, -1, 'fixture Plan-run is missing');
  const run = JSON.parse(lines[index].slice('Plan-run: '.length));
  run.source_base = value;
  lines[index] = `Plan-run: ${api.jcs(run)}`;
  return lines.join('\n');
}

// Read the frozen fixture, then re-point its `source_base` at the commit this clone is
// actually on. The fixture is a byte snapshot of a real plan, so it carries the commit that
// plan recorded; `runMeasurementProducer` resolves a producer with `git show <source_base>:…`,
// which fails outright once that commit is unreachable. A full clone hides this - the commit
// stays resolvable as an ancestor - while a depth-1 CI checkout has only one commit, so the
// measurement failed there and nowhere else. Pinning a commit literal in a fixture is a
// dependency on unbounded history; HEAD exists in every clone by construction.
//
// This does not re-couple the fixture to live bytes. The producer counts declarations of
// `EXCLUDED_SECTIONS = new Set`, which is one line by construction, so a count that moves is
// a real defect rather than fixture rot.
function readFixturePlan() {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  return mutateSourceBase(fs.readFileSync(FIXTURE_PLAN, 'utf8'), head);
}

function reviewPhase(state) {
  if (state === 'not_required' || state === 'not_started') {
    return { state, invocations: 0, input_sha256: null, result_sha256: null };
  }
  if (state === 'passed') {
    return { state, invocations: 1, input_sha256: '1'.repeat(64), result_sha256: '2'.repeat(64) };
  }
  throw new Error(`unsupported fixture review state: ${state}`);
}

function renderLifecyclePlan({ run, status = 'ongoing', includeProof = false }) {
  const command = '`node fixture.mjs`';
  const expected = 'Exit 0';
  const proof = includeProof
    ? `Falsifiability-proof: ${api.jcs({
        row_id: 'A1',
        step_id: '1',
        command_sha256: sha256(Buffer.from(` ${command} `)),
        expected_sha256: sha256(Buffer.from(` ${expected} `)),
        source_base: run.source_base,
        binds: 'exit',
        observed: 0,
        probe: 'fixture:lifecycle',
      })}`
    : 'Not yet started.';
  return Buffer.from(
    [
      '---',
      'title: Scratch evidence lifecycle',
      'goal: Exercise one evidence lifecycle transition.',
      `status: ${status}`,
      'created: "2026-07-31T00:00:00Z"',
      'updated: "2026-07-31T00:00:00Z"',
      'started_at: "2026-07-31T00:00:00Z"',
      'finished_at: null',
      'affected_paths:',
      '  - tracked.txt',
      '---',
      '',
      '# Scratch evidence lifecycle',
      '',
      '## Goal',
      '',
      'Exercise one evidence lifecycle transition.',
      '',
      '## Steps',
      '',
      '| # | Task | Files | Depends | Effect | Status |',
      '|---|---|---|---|---|---|',
      '| 1 | Exercise fixture | `tracked.txt` | — | local | planned |',
      '',
      '## Acceptance criteria',
      '',
      '| ID | Step | Command | Expected |',
      '|---|---:|---|---|',
      `| A1 | 1 | ${command} | ${expected} |`,
      '',
      '| Binding | Observation | Rows |',
      '|---|---|---|',
      '| `exit` | child status | A1 |',
      '',
      `Plan-run: ${api.jcs(run)}`,
      '',
      '## Verification Results',
      '',
      proof,
      '',
      '## Review',
      '',
      '(fixture)',
      '',
    ].join('\n'),
  );
}

function buildLifecycleWorld(root, { risk = 'local', includeProof = false, name = 'evidence' } = {}) {
  const repo = path.join(root, 'repo');
  const head = initializeRepository(repo);
  const logicalPlanPath = `plans/${name}.md`;
  const manifest = api.createAffectedPathManifest({ repo, paths: ['tracked.txt'], sourceBase: head });
  const base = {
    schema: 1,
    goal_id: '30000000-0000-4000-8000-000000000003',
    run_id: risk === 'local' ? '40000000-0000-4000-8000-000000000004' : '50000000-0000-4000-8000-000000000005',
    repository_id: `docks:scratch-evidence-${risk}`,
    plan_path: logicalPlanPath,
    requested_effects: risk === 'local' ? ['local'] : ['local', 'production_access'],
    risk,
    plan_sha256: '0'.repeat(64),
    source_base: head,
    source_sha256: manifest.source_sha256,
    draft_review: reviewPhase('passed'),
    execution_parent: head,
    implementation_commit: null,
    completion_review: reviewPhase(risk === 'local' ? 'not_required' : 'not_started'),
    acceptance: null,
    blocker: null,
  };
  const unbound = renderLifecyclePlan({ run: base, includeProof });
  const run = { ...base, plan_sha256: api.sha256(api.canonicalPlanView(unbound)) };
  const bytes = renderLifecyclePlan({ run, includeProof });
  const file = path.join(repo, logicalPlanPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  const identity = {
    goalId: run.goal_id,
    planPath: run.plan_path,
    repositoryId: run.repository_id,
    runId: run.run_id,
  };
  api.validatePlanRun(bytes, identity);
  return { bytes, file, head, identity, manifest, repo, run };
}

function installStatusAndRun(bytes, status, run) {
  const lines = bytes.toString().split('\n');
  const statusIndex = lines.findIndex((line) => line.startsWith('status: '));
  const runIndex = lines.findIndex((line) => line.startsWith('Plan-run: '));
  assert.notEqual(statusIndex, -1, 'frontmatter status is missing');
  assert.notEqual(runIndex, -1, 'Plan-run is missing');
  lines[statusIndex] = `status: ${status}`;
  lines[runIndex] = `Plan-run: ${api.jcs(run)}`;
  return Buffer.from(lines.join('\n'));
}

function insertSection(bytes, heading, body) {
  const marker = '\n## Verification Results\n';
  return Buffer.from(replaceExactly(bytes.toString(), marker, `\n${heading}\n\n${body}\n${marker}`, heading));
}

const probes = {};

probes['command-drift'] = () =>
  withLivePlanGuard(() =>
    withScratch('evidence-command-', (root) => {
      const sentinel = path.join(root, 'command-ran');
      const dangerous = `\`node -e "require('node:fs').writeFileSync('${sentinel}','ran');process.exit(9)"\``;
      const provenFixture = installProofRecords(oneRowPlan({ command: dangerous }));
      const fixtureFile = path.join(root, 'command-drift.md');
      fs.writeFileSync(fixtureFile, provenFixture);

      const restored = selfCheck.acceptanceProofReport(provenFixture).rows[0];
      assert.equal(restored.proven, true, 'recorded fixture must begin proven');
      assert.equal(restored.record_present, true, 'proven row must expose its record');
      assert.equal(fs.existsSync(sentinel), false, 'building a proof fixture must not execute its command');

      const mutations = [
        ['command_sha256', (text) => mutateOneRowField(text, 'command_sha256', '`node changed.mjs`')],
        ['expected_sha256', (text) => mutateOneRowField(text, 'expected_sha256', 'Exit 7')],
        ['step_id', (text) => mutateOneRowField(text, 'step_id', '2')],
        ['source_base', (text) => mutateSourceBase(text, 'f'.repeat(40))],
      ];
      for (const [key, mutate] of mutations) {
        const changed = mutate(provenFixture);
        const row = selfCheck.acceptanceProofReport(changed).rows[0];
        assert.equal(row.proven, false, `${key}: changed row must be unproven`);
        assert.equal(row.record_present, false, `${key}: drifted row must not expose a current record`);
        assert.deepEqual(row.drifted_keys, [key], `${key}: the report must name only the field changed`);
        fs.writeFileSync(fixtureFile, provenFixture);
        const repaired = selfCheck.acceptanceProofReport(fs.readFileSync(fixtureFile, 'utf8')).rows[0];
        assert.equal(repaired.proven, true, `${key}: restoring the field must restore proof`);
      }

      assert.equal(fs.existsSync(sentinel), false, 'proof verification must never execute the recorded command');
      process.stdout.write('  ok four key drifts named; restored rows proven; executable command stayed inert\n');
    }),
  );

probes['stale-quantity'] = () =>
  withLivePlanGuard(() =>
    withScratch('evidence-quantity-', (root) => {
      const fixture = installProofRecords(readFixturePlan());
      const file = path.join(root, 'quantity.md');
      fs.writeFileSync(file, fixture);

      const changedQuantity = replaceExactly(
        fixture,
        '|lines declaring `EXCLUDED_SECTIONS`|1|',
        '|lines declaring `EXCLUDED_SECTIONS`|2|',
        'committed quantity',
      );
      fs.writeFileSync(file, changedQuantity);
      const stale = spawnNode([SELF_CHECK_PATH, 'check', file]);
      assert.notEqual(stale.status, 0, 'a stale committed quantity must make the child self-check fail');
      assert.match(stale.output, /lines declaring `EXCLUDED_SECTIONS`/, 'the failure must name the stale claim');
      assert.match(stale.output, /recorded 2, producer observed 1/, 'the failure must name the measured disagreement');

      fs.writeFileSync(file, fixture);
      const restored = spawnNode([SELF_CHECK_PATH, 'check', file]);
      assert.equal(restored.status, 0, `restored committed quantity must pass:\n${restored.output}`);

      const snapshot = replaceExactly(
        fixture,
        '|acceptance rows across tracked plans|437|',
        '|acceptance rows across tracked plans|438|',
        'snapshot quantity',
      );
      fs.writeFileSync(file, snapshot);
      const reported = spawnNode([SELF_CHECK_PATH, 'check', file]);
      assert.equal(reported.status, 0, `snapshot drift must remain non-blocking:\n${reported.output}`);
      assert.match(reported.output, /MEASUREMENT snapshot reported/, 'snapshot quantity must be reported');

      const validProducer = {
        op: 'show-count',
        path: 'plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs',
        matcher: 'EXCLUDED_SECTIONS = new Set',
        timeout_ms: 1_000,
        max_bytes: 1_048_576,
      };
      const sentinel = path.join(root, 'producer-ran');
      const sentinelSyntax = `; node -e "require('node:fs').writeFileSync('${sentinel}','ran')"`;
      const forbidden = [
        ['unknown op', { ...validProducer, op: `shell${sentinelSyntax}` }, /unknown measurement producer op/],
        ['extra key', { ...validProducer, command: sentinelSyntax }, /measurement producer keys are closed/],
        ['shell syntax', { ...validProducer, matcher: `EXCLUDED_SECTIONS${sentinelSyntax}` }, /contains shell syntax/],
      ];
      for (const [label, producer, pattern] of forbidden) {
        assert.throws(
          () =>
            measurements.runMeasurementProducer(producer, {
              repo: ROOT,
              sourceBase: planRunRecord(Buffer.from(fixture)).source_base,
            }),
          pattern,
          `${label}: forbidden producer must be rejected`,
        );
        assert.equal(fs.existsSync(sentinel), false, `${label}: rejection must happen without execution`);
      }
      process.stdout.write(
        '  ok committed drift failed by claim; snapshot reported; three producer forms rejected inertly\n',
      );
    }),
  );

function review(binding, finding = null) {
  return {
    schema: 1,
    ...binding,
    verdict: finding === null ? 'pass' : 'repair',
    findings: finding === null ? [] : [finding],
  };
}

probes['injected-defect'] = () =>
  withLivePlanGuard(() =>
    withScratch('evidence-samples-', (root) => {
      // No live-plan read here: `withLivePlanGuard` digests the whole plan corpus around this
      // probe, and reserving a permit would necessarily change those bytes. Watching one path
      // was weaker AND broke when that plan archived.
      const bundle = path.join(root, 'bundle.bin');
      const results = path.join(root, 'results.json');
      const bundleBytes = Buffer.from('sealed evidence sample bundle\n');
      fs.writeFileSync(bundle, bundleBytes, { mode: 0o400 });
      fs.chmodSync(bundle, 0o400);
      const digest = sha256(bundleBytes);
      const binding = {
        run_id: '60000000-0000-4000-8000-000000000006',
        invocation: 1,
        plan_sha256: '6'.repeat(64),
        source_sha256: '7'.repeat(64),
      };
      const finding = {
        id: 'R1',
        kind: 'contradiction',
        class: 'v1_contract_contradiction',
        locator: 'fixture acceptance row',
        defect: 'The scripted sample names an injected contradiction.',
        fix: 'Remove the contradiction from the fixture.',
      };
      const clean = { schema: 1, bundle_sha256: digest, review: review(binding) };
      const defective = { schema: 1, bundle_sha256: digest, review: review(binding, finding) };
      const run = (samples, k = 3, bundleFile = bundle) => {
        fs.writeFileSync(results, `${JSON.stringify(samples)}\n`);
        return spawnNode([SAMPLE_REVIEW_PATH, `--bundle=${bundleFile}`, `--results=${results}`, `--k=${k}`]);
      };
      const parse = (result) => {
        assert.equal(result.status, 0, `valid scripted sequence must aggregate:\n${result.output}`);
        return JSON.parse(result.stdout);
      };

      const tainted = parse(run([defective, clean, clean, clean]));
      assert.deepEqual(tainted.finding_union, [finding], 'scripted finding must enter the union');
      assert.equal(tainted.clean_stop, false, 'a finding plus K clean samples on one digest must refuse clean stop');
      assert.equal(tainted.stop_reason, 'findings_present', 'tainted digest must name findings_present');
      assert.equal(tainted.pass_rate, 0.75, 'pass rate must count three of four scripted passes');
      assert.equal(tainted.bundle_sha256, digest, 'aggregation must report the sealed bundle digest');

      const allClean = parse(run([clean, clean, clean]));
      assert.equal(allClean.clean_stop, true, 'K scripted clean samples must report clean');
      assert.equal(allClean.stop_reason, 'clean', 'clean samples must report the clean reason');
      assert.deepEqual(allClean.finding_union, [], 'clean samples must report an empty union');
      assert.equal(allClean.pass_rate, 1, 'all-clean pass rate must be one');

      const tooFew = parse(run([clean, clean]));
      assert.equal(tooFew.clean_stop, false, 'K-1 clean samples must not stop');
      assert.equal(tooFew.stop_reason, 'insufficient_samples', 'K-1 samples must report insufficiency');

      const belowFloor = run([clean, clean], 2);
      assert.equal(belowFloor.status, 2, 'configured K below three must be a configuration error');
      assert.match(belowFloor.output, /configured K 2 is below the minimum of 3/, 'K-floor refusal must be named');

      const mismatched = run([clean, { ...clean, bundle_sha256: '8'.repeat(64) }]);
      assert.equal(mismatched.status, 1, 'mixed bundle digests must be invalid data');
      assert.match(mismatched.output, /shared digest/, 'mixed samples must name the shared-digest violation');

      const changedBundle = path.join(root, 'changed-bundle.bin');
      const changedBytes = Buffer.from('sealed evidence sample bundle, changed\n');
      fs.writeFileSync(changedBundle, changedBytes, { mode: 0o400 });
      const changedDigest = sha256(changedBytes);
      const changedClean = { ...clean, bundle_sha256: changedDigest };
      const afterChange = parse(run([changedClean, changedClean, changedClean], 3, changedBundle));
      assert.equal(afterChange.clean_stop, true, 'K clean samples after a byte change must pass for the new digest');
      assert.notEqual(afterChange.bundle_sha256, digest, 'byte change must create a distinct aggregation identity');

      // The "no real permit was reserved" claim is carried by the corpus guard wrapping this
      // probe: a reservation rewrites a `Plan-run` line, which the digest map would catch in
      // whichever file held it.
      process.stdout.write(
        '  ok scripted union taints one digest; clean/changed digest passes; K floor and sharing enforced\n',
      );
    }),
  );

probes['excluded-section'] = () =>
  withLivePlanGuard(() =>
    withScratch('evidence-exclusion-', async (root) => {
      const world = buildLifecycleWorld(root, { includeProof: true, name: 'excluded-section' });
      const blockedRun = {
        ...world.run,
        blocker: { kind: 'verification_failed', evidence_sha256: '9'.repeat(64) },
      };
      const withRepair = insertSection(world.bytes, '## Proposed repair', 'Replace the fixture assertion.');
      const nextBytes = installStatusAndRun(withRepair, 'blocked', blockedRun);
      assert.equal(
        api.sha256(api.canonicalPlanView(nextBytes)),
        world.run.plan_sha256,
        'Proposed repair must leave plan_sha256 unchanged',
      );
      const installed = await api.transactPlanRun({
        file: world.file,
        identity: world.identity,
        expectedBytesSha256: api.sha256(world.bytes),
        nextBytes,
      });
      assert.equal(installed.status, 'blocked', 'the same transaction must install blocked status');
      assert.ok(
        fs.readFileSync(world.file).equals(nextBytes),
        'blocking transaction must install Proposed repair bytes',
      );

      const byteOnly = Buffer.from(
        replaceExactly(
          nextBytes.toString(),
          'Replace the fixture assertion.',
          'Replace the fixture assertion exactly.',
          'repair body',
        ),
      );
      await assert.rejects(
        api.transactPlanRun({
          file: world.file,
          identity: world.identity,
          expectedBytesSha256: api.sha256(nextBytes),
          nextBytes: byteOnly,
        }),
        /blocked PlanRun bytes are immutable/,
        'an already-blocked run must refuse byte-only repair edits',
      );

      const underNotes = Buffer.from(
        replaceExactly(nextBytes.toString(), '## Proposed repair', '## Notes', 'repair heading'),
      );
      assert.notEqual(
        api.sha256(api.canonicalPlanView(underNotes)),
        world.run.plan_sha256,
        'identical repair text under Notes must move plan_sha256',
      );
      process.stdout.write(
        '  ok repair installed with block and stable digest; blocked byte edit refused; Notes moved digest\n',
      );
    }),
  );

probes['paired-clause'] = () =>
  withLivePlanGuard(() =>
    withScratch('evidence-clause-', (root) => {
      const sentence =
        'The non-authoritative `## Proposed repair` section is excluded from `plan_sha256`; it is installed only by the transition that blocks a run and is never added to an already-blocked run, because `blocked` → `blocked` rejects any byte change.';
      const normalize = (text) => text.replace(/\s+/g, ' ').trim();
      for (const source of CONTRACT_PATHS) {
        const copy = path.join(root, path.basename(source));
        fs.copyFileSync(source, copy);
        assert.ok(
          normalize(fs.readFileSync(copy, 'utf8')).includes(sentence),
          `${path.relative(ROOT, source)} is missing the Proposed repair sentence`,
        );
      }
      process.stdout.write(
        '  ok Proposed repair sentence present independently in AGENTS and plan-workspace template\n',
      );
    }),
  );

probes['proof-writer'] = () =>
  withLivePlanGuard(() =>
    withScratch('evidence-writer-', async (root) => {
      const world = buildLifecycleWorld(root, { risk: 'sensitive', name: 'proof-writer' });
      const before = fs.readFileSync(world.file);
      const beforeReport = selfCheck.acceptanceProofReport(before.toString());
      assert.equal(beforeReport.unproven, 1, 'proof writer fixture must begin with one unproven row');

      const expectation = { repo: world.repo, paths: ['tracked.txt'], sourceBase: world.head };
      const written = await selfCheck.writeFalsifiabilityProofs({
        file: world.file,
        identity: world.identity,
        observations: { A1: { observed: 0, probe: 'node fixture.mjs' } },
        implementationCommit: world.head,
        acceptanceManifest: world.manifest,
        acceptanceManifestExpectation: expectation,
      });
      const after = fs.readFileSync(world.file);
      const view = api.validatePlanRun(after, { ...world.identity, acceptanceProof: 'recorded' });
      const report = selfCheck.acceptanceProofReport(after.toString());
      assert.equal(report.proven, 1, 'written proof must read back as proven');
      assert.equal(report.rows[0].record_present, true, 'written proof record must be present');
      assert.equal(view.run.completion_review.state, 'reserved', 'writer must use the completion-review reservation');
      assert.equal(view.run.implementation_commit, world.head, 'reservation must bind the implementation commit');
      assert.equal(view.run.plan_sha256, world.run.plan_sha256, 'proof writing must preserve recorded plan_sha256');
      assert.equal(written.plan_sha256, world.run.plan_sha256, 'writer result must report the unchanged plan_sha256');
      assert.equal(
        view.run.acceptance.verification_sha256,
        api.sha256(api.canonicalVerificationResults(after)),
        'acceptance must bind the new canonical Verification Results bytes',
      );
      assert.equal(view.run.acceptance.source_sha256, world.manifest.source_sha256, 'acceptance must bind final paths');
      // The fixture section is `## Verification Results` + blank line + `Not yet started.`,
      // which is the live template shape. That placeholder must not survive beside real
      // evidence: an earlier installer tested `retained.length === 1` against the unstripped
      // slice, so the leading blank made the placeholder the SECOND line, it was retained, and
      // the section claimed nothing was done while carrying a full set of proofs. Every
      // assertion above passed while that was true, so the defect was invisible here.
      assert.ok(
        !after.toString().includes('Not yet started.'),
        'the Not yet started placeholder must not survive beside written proofs',
      );

      const record = report.rows[0].record;
      assert.deepEqual(
        Object.keys(record).sort(),
        ['binds', 'command_sha256', 'expected_sha256', 'observed', 'probe', 'row_id', 'source_base', 'step_id'].sort(),
        'proof record fields must be closed and complete',
      );
      for (const key of ['row_id', 'step_id', 'command_sha256', 'expected_sha256', 'source_base', 'binds', 'probe']) {
        assert.equal(typeof record[key], 'string', `${key} must be populated as a string`);
        assert.notEqual(record[key], '', `${key} must not be empty`);
      }
      assert.equal(Number.isInteger(record.observed), true, 'exit observation must be populated as an integer');

      const byteOnly = Buffer.from(
        replaceExactly(
          after.toString(),
          'Falsifiability-proof: ',
          'Writer-note: byte-only edit\nFalsifiability-proof: ',
          'proof line',
        ),
      );
      await assert.rejects(
        api.transactPlanRun({
          file: world.file,
          identity: world.identity,
          expectedBytesSha256: api.sha256(after),
          nextBytes: byteOnly,
        }),
        /acceptance verification_sha256 does not match canonical Verification Results bytes/,
        'byte-only Verification Results edit must be refused',
      );
      process.stdout.write(
        '  ok proof minted on completion reserve; all fields bound; digest stable; byte-only edit refused\n',
      );
    }),
  );

/**
 * Derive the anchor instead of naming it. This previously replaced the literal
 * `status: ongoing`, which coupled every status fixture to the LIVE plan's transient lifecycle
 * state: the moment that plan moved to `blocked`, the anchor matched zero times and
 * `replaceExactly` failed with "expected exactly one mutation target, found 0" - a green suite
 * turned red with no code change, purely because a plan advanced. That is the same defect class
 * this suite exists to catch, evidence keyed to bytes that move, so the fixture reads whatever
 * status the source carries and rewrites that.
 */
function setFrontmatterStatus(planText, status) {
  // Replace on the ANCHORED pattern, never on the extracted substring: `replaceExactly` counts
  // plain substring hits (:89-93), and a plan body can legitimately contain the literal
  // `status: finished` in prose - this plan's own Verification Results does, describing its
  // sibling. Handing it the substring would count 2 and fail the moment such a plan advanced,
  // which is the same coupling one level down.
  const line = /^status: \S+[ \t]*$/gm;
  const hits = planText.match(line) ?? [];
  assert.equal(hits.length, 1, `expected exactly one frontmatter status line, found ${hits.length}`);
  return planText.replace(/^status: \S+[ \t]*$/m, `status: ${status}`);
}

probes['r7-finished'] = () =>
  withLivePlanGuard(() =>
    withScratch('evidence-r7-finished-', (root) => {
      const unresolvedPlan = 'docs/plans/active/r7-finished-scratch.md';
      assert.ok(!fs.existsSync(path.join(ROOT, unresolvedPlan)), `${unresolvedPlan} must remain unresolved`);

      const baseFixture = readFixturePlan();
      const fixture = replaceExactly(
        baseFixture,
        'docs/plans/*/*.md > /tmp/rows.txt',
        `docs/plans/*/*.md ${unresolvedPlan} > /tmp/rows.txt`,
        'plant unresolved R7 producer path',
      );

      const scriptsRoot = path.join(root, 'scripts');
      const lifecycleRoot = path.join(scriptsRoot, 'lifecycle');
      fs.mkdirSync(lifecycleRoot, { recursive: true });
      const regressedScript = path.join(lifecycleRoot, 'plan-self-check.mjs');
      fs.copyFileSync(SELF_CHECK_PATH, regressedScript);
      fs.copyFileSync(MEASUREMENTS_PATH, path.join(lifecycleRoot, 'plan-measurements.mjs'));
      fs.copyFileSync(
        path.join(path.dirname(SELF_CHECK_PATH), 'plan-properties.json'),
        path.join(lifecycleRoot, 'plan-properties.json'),
      );
      fs.copyFileSync(PLAN_RUN_PATH, path.join(scriptsRoot, 'plan-run.mjs'));
      fs.copyFileSync(
        path.join(path.dirname(PLAN_RUN_PATH), 'legacy-review-records.mjs'),
        path.join(scriptsRoot, 'legacy-review-records.mjs'),
      );

      const repairedBytes = fs.readFileSync(regressedScript, 'utf8');
      // Anchor on the rule's opening line ALONE, never on the comment beneath it. An anchor that
      // quotes prose breaks when the prose is reworded, which is the coupling this suite already
      // had to remove twice. Re-inserting the guard as the rule's first statement reproduces the
      // exact shipped defect: it returned before reading `producerLines`.
      const r7Anchor = "  structuralRule('R7', (context, fire) => {";
      const regressedBytes = replaceExactly(
        repairedBytes,
        r7Anchor,
        `${r7Anchor}\n    if (context.status === 'finished') return;`,
        'reinsert the R7 finished suppression',
      );
      assert.notEqual(regressedBytes, repairedBytes, 'the regressed script copy must change bytes');
      fs.writeFileSync(regressedScript, regressedBytes);

      // Assert the DELTA the planted path causes, never an absolute finding count. The fixture is
      // a frozen snapshot of a real plan, and its own producer block cites the plan path it was
      // taken from - so archiving that plan made the citation unresolved and moved every absolute
      // count by one. The delta is what this probe actually claims: planting one unresolved path
      // adds exactly one finding, and the suppression removes it again at `finished`.
      const cells = [
        { label: 'repaired drafting', script: SELF_CHECK_PATH, status: 'drafting', delta: 1, exit: 1 },
        { label: 'repaired finished', script: SELF_CHECK_PATH, status: 'finished', delta: 1, exit: 0 },
        { label: 'regressed drafting', script: regressedScript, status: 'drafting', delta: 1, exit: 1 },
        { label: 'regressed finished', script: regressedScript, status: 'finished', delta: 0, exit: 0 },
      ];
      const countFindings = (script, text, label) => {
        const file = path.join(root, `${label}.md`);
        fs.writeFileSync(file, text);
        const child = spawnNode([script, 'rules', file]);
        const summary = /^RULES \S+ \d+ checked, (\d+) finding\(s\)$/m.exec(child.output);
        assert.notEqual(summary, null, `${label}: rules summary missing:\n${child.output}`);
        return { count: Number(summary[1]), output: child.output, status: child.status };
      };
      const observations = cells.map((cell) => {
        const slug = cell.label.replace(' ', '-');
        const baseline = countFindings(cell.script, setFrontmatterStatus(baseFixture, cell.status), `${slug}-base`);
        const planted = countFindings(cell.script, setFrontmatterStatus(fixture, cell.status), slug);
        assert.equal(
          planted.count - baseline.count,
          cell.delta,
          `${cell.label}: R7 visibility regression - planted ${planted.count} vs baseline ${baseline.count}`,
        );
        assert.equal(planted.status, cell.exit, `${cell.label}: R7 failure-mode regression:\n${planted.output}`);
        const namedPath = planted.output.includes(`R7 fail unresolved active path ${unresolvedPlan}`);
        assert.equal(namedPath, cell.delta === 1, `${cell.label}: R7 path visibility mismatch`);
        return { ...cell, actualExit: planted.status };
      });
      assert.deepEqual(
        observations.filter((cell) => cell.status === 'finished').map((cell) => cell.actualExit),
        [0, 0],
        'repaired and regressed finished cells must both decline to fail',
      );
      process.stdout.write(
        '  ok r7-finished delta over baseline: repaired drafting=+1/1 finished=+1/0; regressed drafting=+1/1 finished=+0/0\n',
      );
    }),
  );

probes['status-mode'] = () =>
  withLivePlanGuard(() =>
    withScratch('evidence-status-', (root) => {
      const proven = installProofRecords(readFixturePlan());
      const unproven = mutateOneRowField(proven, 'command_sha256', '`node changed-status-probe.mjs`');
      const expectedModes = {
        drafting: 'enforcing',
        planned: 'counting-only',
        scheduled: 'counting-only',
        ongoing: 'counting-only',
        finished: 'counting-only',
        blocked: 'counting-only',
      };
      for (const [status, mode] of Object.entries(expectedModes)) {
        assert.equal(selfCheck.statusMode(status), mode, `${status}: exported status mode must match the contract`);
        const fixture = path.join(root, `${status}.md`);
        fs.writeFileSync(fixture, setFrontmatterStatus(unproven, status));
        const child = spawnNode([SELF_CHECK_PATH, 'check', fixture]);
        if (status === 'drafting') {
          assert.notEqual(child.status, 0, 'drafting must enforce the unproven row');
          assert.match(
            child.output,
            /A1 unproven: command_sha256/,
            'drafting failure must name A1 and its drifted key',
          );
          assert.match(
            child.output,
            /FALSIFIABILITY enforcing 10\/11 proven, 1 unproven/,
            'drafting must report counts',
          );
        } else {
          assert.equal(child.status, 0, `${status}: counting-only fixture must not block:\n${child.output}`);
          assert.match(
            child.output,
            /FALSIFIABILITY counting-only 10\/11 proven, 1 unproven/,
            `${status}: counting-only run must report counts`,
          );
        }
      }
      process.stdout.write(
        '  ok drafting enforced A1; planned/scheduled/ongoing/finished/blocked counted without blocking\n',
      );
    }),
  );

probes['rules-archive'] = () =>
  withLivePlanGuard(() => {
    const archive = path.join(ROOT, 'docs/plans/finished');
    const countMarkdown = (directory) =>
      fs.readdirSync(directory, { withFileTypes: true }).reduce((count, entry) => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) return count + countMarkdown(target);
        return count + Number(entry.isFile() && entry.name.endsWith('.md'));
      }, 0);
    const expectedPlans = countMarkdown(archive);
    const child = spawnNode([SELF_CHECK_PATH, 'rules', archive]);
    assert.equal(child.status, 0, `archive rules run must report without blocking:\n${child.output}`);
    const summary = /RULES-DIRECTORY plans=(\d+) rules=18 findings=(\d+) unclassified=(\d+)/.exec(child.output);
    assert.notEqual(summary, null, `archive rules run must print an aggregate summary:\n${child.output}`);
    assert.equal(Number(summary[1]), expectedPlans, 'archive summary must visit every Markdown plan');
    assert.equal(Number(summary[3]), 0, 'every archived plan must be classified');
    assert.equal(
      [...child.output.matchAll(/^RULES-PLAN /gm)].length,
      expectedPlans,
      'archive run must report one result per plan',
    );
    process.stdout.write(
      `  ok archive rules reported ${expectedPlans} plans, ${summary[2]} findings, and blocked none\n`,
    );
  });

// A measurement records the commit it was taken against, so a clone that lacks that commit
// cannot measure the producer at all. Git words "commit not in this clone" and "path not in
// this commit" almost identically, and this repository spent a full CI round on the ambiguity:
// a frozen fixture pinned an ancestor commit, which every full clone resolves and a depth-1
// checkout does not have. Assert the two are distinguishable in BOTH directions, because a
// catch that reported the typed message for every failure would hide a genuine bad path.
probes['unreachable-base'] = () =>
  withScratch('evidence-unreachable-', (root) => {
    const repo = path.join(root, 'repo');
    const head = initializeRepository(repo);
    const producer = {
      op: 'show-count',
      path: 'tracked.txt',
      matcher: 'base',
      timeout_ms: 1_000,
      max_bytes: 4096,
    };

    // The fixture commit holds a one-line `tracked.txt`, so the reachable case must measure
    // exactly that line. A `typeof` check would pass on a silent zero and leave the happy path
    // unproven, which is what makes the two throw assertions below meaningful.
    const measured = measurements.runMeasurementProducer(producer, { repo, sourceBase: head });
    assert.equal(measured, 1, 'a reachable commit must measure its producer against committed bytes');

    const absent = 'b'.repeat(40);
    assert.throws(
      () => measurements.runMeasurementProducer(producer, { repo, sourceBase: absent }),
      new RegExp(`source_base ${absent} is not present in this clone`),
      'an unreachable source_base must name itself rather than surfacing a raw git failure',
    );

    assert.throws(
      () => measurements.runMeasurementProducer({ ...producer, path: 'absent.txt' }, { repo, sourceBase: head }),
      /absent\.txt/,
      'a reachable commit with a wrong path must still report the path, not the clone',
    );

    process.stdout.write(
      `  ok reachable base measured ${measured}; unreachable base typed; wrong path still names the path\n`,
    );
  });

export const PROBE_NAMES = Object.keys(probes);

const name = args.find((argument) => !argument.startsWith('-'));
if (name === undefined || !Object.hasOwn(probes, name)) {
  process.stderr.write(`usage: node scripts/tests/plan-evidence-probes.mjs <${PROBE_NAMES.join('|')}>\n`);
  process.exit(2);
}

try {
  await probes[name]();
  process.stdout.write(`ok - plan-evidence-probes: ${name}\n`);
} catch (error) {
  process.stderr.write(`not ok - plan-evidence-probes: ${name}\n`);
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
}
