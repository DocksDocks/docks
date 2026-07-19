#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HARNESS = 'scripts/tests/plan-review-policy.mjs';
const CONVERGENCE_HARNESS = 'scripts/tests/plan-review-convergence-repair.mjs';
const ORCHESTRATION_HARNESS = 'scripts/tests/plan-review-policy-regressions.mjs';
const DEFAULT_JOBS = Math.max(1, Math.min(6, os.availableParallelism()));
const MAX_CHILD_OUTPUT_BYTES = 16 * 1024 * 1024;
const CHILD_TIMEOUT_MS = 15 * 60 * 1000;
const INTERRUPT_ESCALATION_MS = 500;
const RUN_NAMESPACE_ENV = 'DOCKS_REVIEW_POLICY_DRIVER_RUN_NAMESPACE';
const NAMESPACE_FIXTURE_DIR_ENV = 'DOCKS_REVIEW_POLICY_NAMESPACE_FIXTURE_DIR';
const NAMESPACE_FIXTURE_PEER_ENV = 'DOCKS_REVIEW_POLICY_NAMESPACE_FIXTURE_PEER';
const NAMESPACE_FIXTURE_TIMEOUT_MS = 5000;
const ORCHESTRATION_ORACLE_ENV = 'DOCKS_REVIEW_POLICY_ORCHESTRATION_ORACLE';
const RUN_NAMESPACE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RUN_NAMESPACE = validatedRunNamespace(process.env[RUN_NAMESPACE_ENV] ?? randomUUID(), 'driver run namespace');
const OWNED_ROOT_PREFIX = ownedRootPrefix(RUN_NAMESPACE);
const runtime = { signal: null, activeChildren: new Map(), ownedRoots: new Set() };
const REQUIRED_SURFACES = [
  'docs/plans/AGENTS.md',
  'docs/plans/finished/2026-07-16-plan-review-convergence-and-improver.md',
  'plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md',
  'plugins/docks/skills/productivity/plan-workspace/SKILL.md',
  'plugins/docks/skills/productivity/plan-creator/SKILL.md',
  'plugins/docks/skills/productivity/plan-manager/SKILL.md',
  'plugins/docks/skills/productivity/plan-reviewer/SKILL.md',
  'plugins/docks/skills/productivity/plan-repairer/SKILL.md',
  'plugins/docks/agents/plan-manager.md',
  'plugins/docks/agents/plan-reviewer.md',
  '.codex/agents/plan-manager.toml',
  '.codex/agents/plan-reviewer.toml',
  'plugins/docks/skills/productivity/plan-workspace/references/codex-agent-templates.md',
  'docs/scaffold/templates/codex-plan-manager.toml.template',
  'docs/scaffold/templates/codex-plan-reviewer.toml.template',
  'docs/scaffold/templates/root-AGENTS.md.template',
  'AGENTS.md', 'README.md', 'plugins/docks/README.md', 'plugins/docks/skills/AGENTS.md',
  'plugins/session-relay/skills/productivity/session-relay/SKILL.md',
  'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
  'scripts/ci.mjs',
  'scripts/tests/fixtures/plan-review-policy/sample-plan.md',
  HARNESS,
  CONVERGENCE_HARNESS,
  ORCHESTRATION_HARNESS,
];

function validatedRunNamespace(value, label) {
  if (!RUN_NAMESPACE_PATTERN.test(value)) throw new Error(`${label} must be a canonical UUID`);
  return value;
}

function ownedRootPrefix(namespace) {
  return `review-policy-driver-${validatedRunNamespace(namespace, 'owned-root namespace')}-`;
}

function copyRoot(sourceRoot, target) {
  for (const relative of REQUIRED_SURFACES) {
    const source = path.join(sourceRoot, relative); const dest = path.join(target, relative);
    assert.ok(fs.existsSync(source), `omitted-surface oracle: ${relative}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(source, dest); fs.chmodSync(dest, 0o600);
  }
}

function changeOwnedModes(target, directoryMode, fileMode) {
  if (!fs.existsSync(target)) return;
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    fs.chmodSync(target, directoryMode);
    for (const name of fs.readdirSync(target)) changeOwnedModes(path.join(target, name), directoryMode, fileMode);
  } else fs.chmodSync(target, fileMode);
}

function createOwnedRoot(label) {
  if (runtime.signal !== null) throw new Error(`regression driver interrupted by ${runtime.signal}`);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${OWNED_ROOT_PREFIX}${label}-`)); runtime.ownedRoots.add(path.resolve(root)); return root;
}

function removeNamespacedRoot(root, namespace) {
  const prefix = ownedRootPrefix(namespace);
  const temp = path.resolve(os.tmpdir()); const absolute = path.resolve(root);
  assert.equal(path.dirname(absolute), temp, 'owned temp root must be a direct os.tmpdir child');
  assert.ok(path.basename(absolute).startsWith(prefix), 'owned temp root prefix mismatch');
  if (!fs.existsSync(absolute)) return;
  try { changeOwnedModes(absolute, 0o700, 0o600); fs.rmSync(absolute, { recursive: true, force: true }); }
  finally { assert.equal(fs.existsSync(absolute), false, 'owned temp root cleanup must complete'); }
}

function removeOwnedRoot(root) {
  const absolute = path.resolve(root);
  try { removeNamespacedRoot(absolute, RUN_NAMESPACE); }
  finally { if (!fs.existsSync(absolute)) runtime.ownedRoots.delete(absolute); }
}

function signalChildTree(child, signal) {
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

function terminateTrackedChild(record) {
  if (record.escalation !== null) return;
  signalChildTree(record.child, 'SIGTERM');
  record.escalation = setTimeout(() => signalChildTree(record.child, 'SIGKILL'), INTERRUPT_ESCALATION_MS);
}

function requestInterruption(signal) {
  if (runtime.signal !== null) return;
  runtime.signal = signal;
  for (const record of runtime.activeChildren.values()) terminateTrackedChild(record);
}

async function awaitActiveChildren() {
  while (runtime.activeChildren.size > 0) await Promise.all([...runtime.activeChildren.values()].map((record) => record.closed));
}

function runChild({ argv, cwd, env = process.env, timeoutMs = CHILD_TIMEOUT_MS, onSpawn = null, onStdout = null }) {
  if (runtime.signal !== null) return Promise.reject(new Error(`regression driver interrupted by ${runtime.signal}`));
  return new Promise((resolve) => {
    const stdout = []; const stderr = []; let stdoutBytes = 0; let stderrBytes = 0; let childError = null;
    const child = spawn(argv[0], argv.slice(1), {
      cwd, env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32',
    });
    let closeRecord; const closed = new Promise((done) => { closeRecord = done; }); const record = { child, closed, escalation: null };
    runtime.activeChildren.set(child, record); onSpawn?.(child);
    const timer = setTimeout(() => {
      childError ??= Object.assign(new Error(`child timed out after ${timeoutMs}ms`), { code: 'ETIMEDOUT' });
      terminateTrackedChild(record);
    }, timeoutMs);
    const collect = (chunks, chunk, stream) => {
      const bytes = Buffer.from(chunk); chunks.push(bytes);
      if (stream === 'stdout') onStdout?.(bytes.toString('utf8'));
      if (stream === 'stdout') stdoutBytes += bytes.length; else stderrBytes += bytes.length;
      if (stdoutBytes > MAX_CHILD_OUTPUT_BYTES || stderrBytes > MAX_CHILD_OUTPUT_BYTES) {
        childError ??= Object.assign(new Error(`child ${stream} exceeded ${MAX_CHILD_OUTPUT_BYTES} bytes`), { code: 'ERR_CHILD_OUTPUT_LIMIT' });
        terminateTrackedChild(record);
      }
    };
    child.stdout.on('data', (chunk) => collect(stdout, chunk, 'stdout'));
    child.stderr.on('data', (chunk) => collect(stderr, chunk, 'stderr'));
    child.on('error', (error) => { childError ??= error; });
    child.on('close', (status, signal) => {
      clearTimeout(timer); if (record.escalation !== null) clearTimeout(record.escalation); runtime.activeChildren.delete(child); closeRecord();
      resolve({ status, signal, error: childError, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
    });
    if (runtime.signal !== null) terminateTrackedChild(record);
  });
}

function run(root, args, harness = HARNESS, extraEnv = {}) {
  assert.ok([HARNESS, CONVERGENCE_HARNESS, ORCHESTRATION_HARNESS].includes(harness), 'regression harness must be closed');
  const privateTemp = path.join(root, '.tmp'); fs.mkdirSync(privateTemp, { mode: 0o700, recursive: true });
  return runChild({ argv: [process.execPath, path.join(root, harness), ...args], cwd: root, env: { ...process.env, ...extraEnv, TMPDIR: privateTemp, TMP: privateTemp, TEMP: privateTemp } });
}

function requirePass(label, result, pattern) {
  assert.equal(result.error, null, `${label}: ${result.error?.message}`); assert.equal(result.signal, null, `${label}: signal ${result.signal}`);
  assert.equal(result.status, 0, `${label}: ${result.stderr}`); assert.match(result.stdout, pattern, `${label}: named proof missing`); console.log(`${label} passed`);
}

async function runPool(items, jobs, worker) {
  assert.ok(Number.isInteger(jobs) && jobs >= 1, 'pool jobs must be a positive integer');
  const results = new Array(items.length); const runCounts = new Array(items.length).fill(0); let nextIndex = 0;
  const consume = async () => {
    while (runtime.signal === null && nextIndex < items.length) {
      const index = nextIndex; nextIndex += 1; runCounts[index] += 1;
      try { results[index] = { status: 'fulfilled', value: await worker(items[index], index) }; }
      catch (error) { results[index] = { status: 'rejected', reason: error }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, consume));
  if (runtime.signal === null) assert.deepEqual(runCounts, new Array(items.length).fill(1), 'every pool index runs exactly once');
  return results;
}

function parseArgs(argv) {
  let jobs = DEFAULT_JOBS; let jobsSeen = false; let mode = 'regressions'; let modeSeen = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--self-test' && !modeSeen) { mode = 'regressions'; modeSeen = true; }
    else if (arg === '--scheduler-self-test' && !modeSeen) { mode = 'scheduler'; modeSeen = true; }
    else if (arg === '--namespace-isolation-fixture' && !modeSeen) { mode = 'namespace'; modeSeen = true; }
    else if (arg === '--interrupt-fixture' && !modeSeen) { mode = 'interrupt'; modeSeen = true; }
    else if (arg === '--orchestration-oracle' && !modeSeen && process.env[ORCHESTRATION_ORACLE_ENV] === '1') { mode = 'orchestration'; modeSeen = true; }
    else if (arg === '--jobs' && !jobsSeen) {
      const value = argv[index + 1];
      if (!/^[1-9][0-9]*$/.test(value ?? '')) throw new Error('--jobs requires one positive integer');
      jobs = Number(value); jobsSeen = true; index += 1;
      if (!Number.isSafeInteger(jobs) || jobs > os.availableParallelism()) throw new Error(`--jobs must be between 1 and ${os.availableParallelism()}`);
    } else throw new Error(`unknown or duplicate regression-driver argument: ${arg}`);
  }
  return { jobs, mode };
}

function ownedRootPaths(namespace = RUN_NAMESPACE) {
  const prefix = ownedRootPrefix(namespace);
  return fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith(prefix)).map((name) => path.join(os.tmpdir(), name)).sort();
}

function namespaceFixtureRecordPath(directory, stage, namespace) {
  assert.ok(['ready', 'observed', 'trimmed'].includes(stage), 'namespace fixture stage is closed');
  return path.join(directory, `${stage}-${validatedRunNamespace(namespace, 'namespace fixture record')}.json`);
}

function writeNamespaceFixtureRecord(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, { flag: 'wx', mode: 0o600 });
  fs.renameSync(temporary, file);
}

async function waitForNamespaceFixtureRecord(file, label) {
  const deadline = Date.now() + NAMESPACE_FIXTURE_TIMEOUT_MS;
  while (!fs.existsSync(file)) {
    if (runtime.signal !== null) throw new Error(`namespace fixture interrupted by ${runtime.signal}`);
    if (Date.now() >= deadline) throw new Error(`${label} timed out`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function readNamespaceFixtureReady(file, namespace) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(Object.keys(value).sort(), ['namespace', 'roots', 'schema'], 'namespace fixture ready record is closed');
  assert.equal(value.schema, 1); assert.equal(value.namespace, namespace);
  assert.ok(Array.isArray(value.roots) && value.roots.length === 2 && new Set(value.roots).size === 2, 'namespace fixture publishes two distinct roots');
  const prefix = ownedRootPrefix(namespace); const temp = path.resolve(os.tmpdir());
  value.roots = value.roots.map((root) => {
    const absolute = path.resolve(root);
    assert.equal(path.dirname(absolute), temp, 'namespace fixture root is a direct os.tmpdir child');
    assert.ok(path.basename(absolute).startsWith(prefix), 'namespace fixture root matches its explicit namespace');
    return absolute;
  }).sort();
  return value;
}

async function runNamespaceIsolationFixture() {
  const directoryValue = process.env[NAMESPACE_FIXTURE_DIR_ENV];
  assert.ok(typeof directoryValue === 'string' && path.isAbsolute(directoryValue), 'namespace fixture directory must be absolute');
  const directory = path.resolve(directoryValue); const directoryStat = fs.lstatSync(directory);
  assert.ok(directoryStat.isDirectory() && !directoryStat.isSymbolicLink(), 'namespace fixture directory must be a real directory');
  const peerNamespace = validatedRunNamespace(process.env[NAMESPACE_FIXTURE_PEER_ENV], 'namespace fixture peer');
  assert.notEqual(peerNamespace, RUN_NAMESPACE, 'namespace fixture peers must use distinct UUIDs');
  const roots = [createOwnedRoot('concurrent-primary'), createOwnedRoot('concurrent-witness')].map((root) => path.resolve(root)).sort();
  try {
    const ownReady = namespaceFixtureRecordPath(directory, 'ready', RUN_NAMESPACE);
    const peerReady = namespaceFixtureRecordPath(directory, 'ready', peerNamespace);
    writeNamespaceFixtureRecord(ownReady, { schema: 1, namespace: RUN_NAMESPACE, roots });
    await waitForNamespaceFixtureRecord(peerReady, 'peer namespace ready record');
    const peer = readNamespaceFixtureReady(peerReady, peerNamespace);
    assert.deepEqual(ownedRootPaths(), roots, 'child observes exactly its own namespace roots');
    assert.ok(peer.roots.every((root) => fs.existsSync(root)), 'peer roots coexist with the child namespace');
    assert.ok(peer.roots.every((root) => !ownedRootPaths().includes(root)), 'child namespace view excludes peer roots');

    writeNamespaceFixtureRecord(namespaceFixtureRecordPath(directory, 'observed', RUN_NAMESPACE), { schema: 1, namespace: RUN_NAMESPACE });
    await waitForNamespaceFixtureRecord(namespaceFixtureRecordPath(directory, 'observed', peerNamespace), 'peer namespace observation record');
    removeOwnedRoot(roots[0]);
    assert.deepEqual(ownedRootPaths(), [roots[1]], 'owned cleanup removes only one child root');
    assert.equal(fs.existsSync(peer.roots[1]), true, 'owned cleanup preserves the peer witness root');

    writeNamespaceFixtureRecord(namespaceFixtureRecordPath(directory, 'trimmed', RUN_NAMESPACE), { schema: 1, namespace: RUN_NAMESPACE });
    await waitForNamespaceFixtureRecord(namespaceFixtureRecordPath(directory, 'trimmed', peerNamespace), 'peer namespace trim record');
    removeOwnedRoot(roots[1]);
    assert.deepEqual(ownedRootPaths(), [], 'child leaves zero roots in its namespace');
    process.stdout.write(`namespace isolation fixture passed ${RUN_NAMESPACE}\n`);
  } finally {
    for (const root of roots) if (fs.existsSync(root)) removeOwnedRoot(root);
  }
}

async function testConcurrentNamespaceProcesses(jobs) {
  const namespaces = [randomUUID(), randomUUID()].map((value) => validatedRunNamespace(value, 'concurrent scheduler namespace'));
  assert.notEqual(namespaces[0], namespaces[1], 'concurrent scheduler namespaces are distinct');
  for (const namespace of namespaces) assert.deepEqual(ownedRootPaths(namespace), [], 'concurrent scheduler namespace starts empty');
  const coordinationRoot = createOwnedRoot('scheduler-concurrent-processes'); const directory = path.join(coordinationRoot, 'coordination'); fs.mkdirSync(directory, { mode: 0o700 });
  try {
    const children = namespaces.map((namespace, index) => runChild({
      argv: [process.execPath, fileURLToPath(import.meta.url), '--scheduler-self-test', '--jobs', String(jobs)], cwd: ROOT, timeoutMs: 10000,
      env: { ...process.env, [RUN_NAMESPACE_ENV]: namespace, [NAMESPACE_FIXTURE_DIR_ENV]: directory, [NAMESPACE_FIXTURE_PEER_ENV]: namespaces[1 - index] },
    }));
    const results = await Promise.all(children);
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index]; const namespace = namespaces[index];
      assert.equal(result.error, null, result.error?.message); assert.equal(result.signal, null); assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, '', 'concurrent scheduler child emits zero stderr');
      assert.equal(result.stdout, `namespace isolation fixture passed ${namespace}\nregression scheduler self-test passed\n`, 'concurrent scheduler child emits exact fixture and scheduler success records');
      for (const stage of ['ready', 'observed', 'trimmed']) assert.equal(fs.existsSync(namespaceFixtureRecordPath(directory, stage, namespace)), true, `${stage} barrier record exists`);
    }
    for (const namespace of namespaces) assert.deepEqual(ownedRootPaths(namespace), [], 'concurrent scheduler namespace finishes empty');
  } finally {
    for (const namespace of namespaces) for (const root of ownedRootPaths(namespace)) removeNamespacedRoot(root, namespace);
    removeOwnedRoot(coordinationRoot);
  }
}

function processExists(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { if (error?.code === 'ESRCH') return false; throw error; }
}

async function runInterruptionFixture() {
  const snapshot = createOwnedRoot('interrupt-snapshot'); const childRoot = createOwnedRoot('interrupt-child');
  try {
    copyRoot(ROOT, snapshot); changeOwnedModes(snapshot, 0o500, 0o400);
    let ready; const readyPromise = new Promise((resolve) => { ready = resolve; });
    const childSource = "process.on('SIGTERM',()=>{});process.stdout.write('interrupt-child-ready '+process.pid+'\\n');setInterval(()=>{},1000);";
    const childPromise = runChild({
      argv: [process.execPath, '-e', childSource], cwd: childRoot,
      onStdout: (text) => { process.stdout.write(text); if (text.includes('interrupt-child-ready ')) ready(); },
    });
    await Promise.race([readyPromise, childPromise.then(() => { throw new Error('interrupt fixture child exited before ready'); })]);
    console.log(`omitted-surface oracle copied ${REQUIRED_SURFACES.length} interrupt-fixture surfaces`);
    await childPromise;
  } finally {
    removeOwnedRoot(childRoot); removeOwnedRoot(snapshot);
  }
}

async function testInterruptionCleanup() {
  const nestedNamespace = validatedRunNamespace(randomUUID(), 'nested driver run namespace');
  assert.deepEqual(ownedRootPaths(nestedNamespace), [], 'fresh nested namespace starts with zero owned roots');
  assert.throws(() => ownedRootPaths(`${nestedNamespace}-suffix`), /canonical UUID/, 'owned-root scans reject non-canonical namespaces');
  let driver = null; let output = ''; let sent = false; let observedRoots = []; let childPid = null;
  try {
    const result = await runChild({
      argv: [process.execPath, fileURLToPath(import.meta.url), '--interrupt-fixture'], cwd: ROOT, timeoutMs: 10000,
      env: { ...process.env, [RUN_NAMESPACE_ENV]: nestedNamespace },
      onSpawn: (child) => { driver = child; },
      onStdout: (text) => {
        output += text;
        if (!sent && output.includes('omitted-surface oracle copied')) {
          observedRoots = ownedRootPaths(nestedNamespace); sent = true; driver.kill('SIGINT');
        }
      },
    });
    const match = /interrupt-child-ready ([0-9]+)/.exec(result.stdout); childPid = match === null ? null : Number(match[1]);
    const childSurvived = childPid !== null && processExists(childPid); const remainingRoots = ownedRootPaths(nestedNamespace);
    assert.equal(sent, true, 'interruption test must signal immediately after the copied-snapshot marker');
    assert.equal(observedRoots.length, 2, 'parent observes both roots in the explicit nested namespace');
    assert.equal(result.error, null, result.error?.message); assert.equal(result.status, null); assert.equal(result.signal, 'SIGINT', 'driver preserves the original parent signal result');
    assert.ok(childPid !== null, 'interruption fixture reports its active child'); assert.equal(childSurvived, false, 'interruption leaves no surviving child');
    assert.deepEqual(remainingRoots, [], 'interruption leaves zero roots in the explicit nested namespace');
  } finally {
    if (childPid !== null && processExists(childPid)) {
      try { process.kill(-childPid, 'SIGKILL'); } catch (error) { if (error?.code !== 'ESRCH') throw error; }
    }
    for (const root of ownedRootPaths(nestedNamespace)) removeNamespacedRoot(root, nestedNamespace);
  }
}

async function testScheduler(jobs) {
  const delays = [30, 5, 20, 1, 15, 10]; let active = 0; let maximum = 0;
  const results = await runPool(delays, jobs, async (delay, index) => {
    active += 1; maximum = Math.max(maximum, active);
    try { await new Promise((resolve) => setTimeout(resolve, delay)); return `job-${index}`; }
    finally { active -= 1; }
  });
  assert.deepEqual(results.map((row) => row.value), delays.map((_, index) => `job-${index}`), 'scheduler retains declaration order');
  assert.ok(maximum <= jobs && maximum === Math.min(jobs, delays.length), 'scheduler honors the concurrency bound');
  const failures = await runPool([0, 1, 2], jobs, async (value) => { if (value !== 1) throw new Error(`failure-${value}`); return value; });
  assert.equal(failures.findIndex((row) => row.status === 'rejected'), 0, 'scheduler reconciliation selects the lowest failed index');
  const root = createOwnedRoot('scheduler');
  try {
    const sealed = path.join(root, 'sealed'); fs.mkdirSync(sealed); fs.writeFileSync(path.join(sealed, 'fixture'), 'fixture\n'); changeOwnedModes(sealed, 0o500, 0o400);
  } finally { removeOwnedRoot(root); }
  assert.equal(fs.existsSync(root), false, 'scheduler cleanup removes read-only owned roots');
  if (process.env[NAMESPACE_FIXTURE_DIR_ENV] !== undefined || process.env[NAMESPACE_FIXTURE_PEER_ENV] !== undefined) await runNamespaceIsolationFixture();
  else await testConcurrentNamespaceProcesses(jobs);
  await testInterruptionCleanup();
  console.log('regression scheduler self-test passed');
}

function applyVariant(relative, before, after) {
  return (root) => {
    const file = path.join(root, relative); const text = fs.readFileSync(file, 'utf8');
    assert.equal(text.split(before).length - 1, 1, `regression anchor must be unique: ${relative}`);
    fs.writeFileSync(file, text.replace(before, after));
  };
}

function applyVariantAll(relative, before, after, expectedCount) {
  return (root) => {
    const file = path.join(root, relative); const text = fs.readFileSync(file, 'utf8');
    assert.equal(text.split(before).length - 1, expectedCount, `regression anchor count: ${relative}`);
    fs.writeFileSync(file, text.replaceAll(before, after));
  };
}

function applyVariantLast(relative, before, after) {
  return (root) => {
    const file = path.join(root, relative); const text = fs.readFileSync(file, 'utf8'); const at = text.lastIndexOf(before); assert.ok(at >= 0, `regression anchor missing: ${relative}`);
    fs.writeFileSync(file, `${text.slice(0, at)}${after}${text.slice(at + before.length)}`);
  };
}

function combine(...variants) {
  return (root) => { for (const apply of variants) apply(root); };
}

function assertManagerIssuePublishingContract() {
  const skill = fs.readFileSync('plugins/docks/skills/productivity/plan-manager/SKILL.md', 'utf8');
  assert.match(skill.match(/^description:.*$/m)?.[0] ?? '', /\bpublish\b.*GitHub issue/i, 'plan-manager description missing publish trigger');
  assert.match(skill, /^\| publish\/--issues \|.*GitHub issue.*no review or status change \|$/m, 'plan-manager operation table missing publishing operation');

  const heading = '## Publishing a plan as a GitHub issue (`--issues`)';
  const start = skill.indexOf(heading);
  assert.notEqual(start, -1, 'plan-manager missing GitHub issue publishing operation');
  const nextHeading = skill.indexOf('\n## ', start + heading.length);
  const section = skill.slice(start, nextHeading === -1 ? undefined : nextHeading);
  for (const marker of [
    '`publish <slug> as an issue`',
    '`gh auth status`',
    'GitHub remote',
    '`gh repo view --json visibility`',
    'public repository',
    'explicit confirmation',
    'vulnerability',
    'credential location',
    'sensitive finding',
    '`gh issue create --title "<plan title>" --body-file <plan path>`',
    'URL in `## Notes`',
    'auto-commit only the plan',
    'Do not dispatch review',
    'change lifecycle status',
    'canonical Markdown plan remains the authoritative',
  ]) {
    assert.match(section, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `publishing operation missing ${marker}`);
  }
  console.log('GitHub issue publishing operation preservation passed');
}

function orchestrationCandidate(tool, model, effort, serviceTier = null) {
  return {
    company: tool === 'codex' ? 'openai' : 'anthropic',
    tool,
    model,
    effort,
    ...(serviceTier === null ? {} : { service_tier: serviceTier }),
  };
}

function orchestrationAttempt(candidate, result) {
  const started = !['auth_failed', 'tool_unavailable', 'platform_denied'].includes(result);
  const outputStarted = ['passed', 'output_invalid'].includes(result);
  const signaled = result === 'signaled' || result === 'deadline_exceeded';
  const exited = ['model_unavailable', 'nonzero_exit', 'output_invalid'].includes(result);
  return {
    schema: 6,
    candidate,
    started,
    output_started: outputStarted,
    child_id: started ? `child-${candidate.model}` : null,
    timeout_mode: started ? 'orchestrator_tool' : null,
    timeout_seconds: started ? 600 : null,
    result,
    exit_code: result === 'passed' ? 0 : exited ? 1 : null,
    signal: signaled ? 'SIGTERM' : null,
    denial_source: result === 'platform_denied' ? 'managed_policy' : null,
    reason: `fixture ${result}`,
    stdout_sha256: started ? 'a'.repeat(64) : null,
    stderr_sha256: started ? 'b'.repeat(64) : null,
  };
}

function orchestrationSeries(api, state, attemptResults, { staleInput = false, notReady = false } = {}) {
  const reviewPolicy = {
    schema: 6,
    role: 'primary',
    fallback: 'availability_only',
    max_rounds: 2,
    candidates: [
      orchestrationCandidate('codex', 'gpt-5.6-sol', 'high', 'default'),
      orchestrationCandidate('claude', 'fable', 'high'),
      orchestrationCandidate('claude', 'opus', 'xhigh'),
    ],
    provenance: { role: 'skill_default', fallback: 'skill_default', max_rounds: 'skill_default', candidates: 'skill_default' },
  };
  const inputSha256 = staleInput ? '9'.repeat(64) : state.current_input_sha256;
  const request = {
    schema: 6,
    request_id: state.request_ids.at(-1),
    phase: state.phase,
    lifecycle_intent: state.lifecycle_intent,
    reviewed_commit_or_head: '5'.repeat(40),
    planned_at_commit: null,
    execution_base_commit: null,
    diff_sha256: null,
    acceptance_inventory_sha256: null,
    input_sha256: inputSha256,
    bundle_sha256: '8'.repeat(64),
    author: { company: 'openai', tool: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
    policy: reviewPolicy,
    policy_sha256: api.sha256(api.jcs(reviewPolicy)),
    review_mode: state.round_index === 1 ? 'full' : 'repair',
    round_index: state.round_index,
    previous_input_sha256: state.round_index === 1 ? null : state.initial_input_sha256,
    repair_targets_sha256: state.round_index === 1 ? null : '7'.repeat(64),
    orchestration_series_id: state.series_id,
    orchestration_state_sha256: state.state_sha256,
  };
  const attempts = attemptResults.map((result, index) => orchestrationAttempt(reviewPolicy.candidates[index], result));
  const passed = attempts.at(-1)?.result === 'passed';
  const checklist = Object.fromEntries([
    'standalone_executability', 'actionability', 'dependency_order', 'evidence_reverification',
    'goal_coverage', 'executable_acceptance', 'failure_modes', 'open_questions',
  ].map((criterion) => [criterion, {
    status: notReady && criterion === 'executable_acceptance' ? 'blocking_gap' : 'pass',
    evidence: `${criterion} evidence`,
  }]));
  const finding = {
    id: 'P1',
    criterion: 'executable_acceptance',
    status: 'blocking_gap',
    section: 'Acceptance criteria',
    path: 'src/example.txt',
    locator: 'A1',
    defect: 'The fixture is not ready.',
    fix: 'Make the fixture ready.',
    evidence: 'A blocking fixture condition remains.',
  };
  const reviewerOutput = passed ? {
    schema: 6,
    role: 'primary',
    request,
    verdict: notReady ? 'blocking_gap' : 'pass',
    checklist,
    findings: notReady ? [finding] : [],
  } : null;
  const fallback = attemptResults.every((result) => ['auth_failed', 'model_unavailable', 'tool_unavailable'].includes(result));
  const raw = {
    schema: 6,
    role: 'primary',
    request,
    result: passed ? 'passed' : fallback ? 'unavailable' : 'failed',
    attempts,
    selected: passed ? attempts.at(-1).candidate : null,
    reviewer_output: reviewerOutput,
    findings_sha256: passed ? api.sha256(api.jcs(reviewerOutput.findings)) : null,
    waiver: null,
    waiver_sha256: null,
    reason: passed ? null : 'fixture terminal result',
  };
  const reviewer = {
    raw,
    accepted_finding_ids: notReady ? ['P1'] : [],
    rejected: [],
  };
  const run = {
    schema: 6,
    kind: state.phase,
    request,
    reviewer,
    reproduced: notReady ? [{
      id: 'P1',
      reproduction: { method: 'read', command: null, exit_code: null, evidence_sha256: '6'.repeat(64) },
    }] : [],
    outcome: passed ? notReady ? 'not_ready' : 'passed' : fallback ? 'unavailable' : 'not_ready',
    pre_execution_eligible: passed && !notReady,
  };
  return {
    schema: 6,
    orchestration_series_id: state.series_id,
    policy_sha256: request.policy_sha256,
    initial_input_sha256: state.initial_input_sha256,
    current_input_sha256: inputSha256,
    rounds: [run],
    repairs: [],
  };
}

function assertUnchangedAfterThrow(value, operation, pattern) {
  const before = structuredClone(value);
  assert.throws(operation, pattern);
  assert.deepEqual(value, before, 'rejected orchestration operation mutated its input');
}

async function runOrchestrationOracle() {
  assertManagerIssuePublishingContract();
  const helperPath = path.resolve('plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs');
  const policy = await import(`${pathToFileURL(helperPath).href}?orchestration-oracle=${randomUUID()}`);
  const exportNames = [
    'beginReviewOrchestration',
    'advanceReviewOrchestrationRepair',
    'settleReviewOrchestration',
    'consumeReviewIntent',
  ];
  const absent = exportNames.filter((name) => typeof policy[name] !== 'function');
  assert.deepEqual(absent, [], `planned orchestration exports absent: ${absent.join(', ')}`);

  const planPath = 'docs/plans/active/no-progress-fixture.md';
  const sourceText = 'schema-6 exact retry user message';
  let ordinal = 0;
  const nextUuid = () => `123e4567-e89b-42d3-a456-${String(ordinal += 1).padStart(12, '0')}`;
  const begin = ({
    inputSha256 = '1'.repeat(64),
    lifecycleIntent = 'none',
    orchestrationAttempt = 1,
    previousState = null,
    retryAuthorization = null,
    sourceText = null,
  } = {}) => policy.beginReviewOrchestration({
    planPath,
    phase: 'draft',
    lifecycleIntent,
    inputSha256,
    seriesId: nextUuid(),
    requestId: nextUuid(),
    orchestrationAttempt,
    previousState,
    retryAuthorization,
    sourceText,
  });
  const settle = (state, attemptResults, options) => policy.settleReviewOrchestration({
    state,
    series: orchestrationSeries(policy, state, attemptResults, options),
  });

  const first = settle(begin(), ['auth_failed', 'model_unavailable', 'tool_unavailable']);
  assert.equal(first.orchestration_attempt, 1);
  assert.equal(first.status, 'stopped');
  assert.equal(first.stop_reason, 'unavailable_auth');
  assert.equal(first.retry_authorization, null);

  const authorization = {
    schema: 1,
    authorization_id: nextUuid(),
    actor: 'user',
    authorized_at: '2026-07-19T12:00:00-03:00',
    plan_path: planPath,
    phase: 'draft',
    intent_group: 'none',
    input_sha256: first.current_input_sha256,
    stopped_state_sha256: first.state_sha256,
    source_text_sha256: policy.sha256(sourceText),
  };
  for (const forged of [
    { ...authorization, actor: 'system' },
    { ...authorization, plan_path: 'docs/plans/active/other.md' },
    { ...authorization, input_sha256: 'd'.repeat(64) },
    { ...authorization, stopped_state_sha256: 'e'.repeat(64) },
    { ...authorization, source_text_sha256: 'f'.repeat(64) },
  ]) {
    assert.throws(() => begin({
      orchestrationAttempt: 2,
      previousState: first,
      retryAuthorization: forged,
      sourceText,
    }), /authorization|actor|path|input|state|source/i);
  }
  assert.throws(() => begin({
    orchestrationAttempt: 2,
    previousState: first,
    retryAuthorization: authorization,
    sourceText: 'schema-6 mismatched retry user message',
  }), /authorization|source/i);
  assert.throws(() => begin({ orchestrationAttempt: 2, previousState: first }), /authorization|source|retry/i);
  const secondActive = begin({
    orchestrationAttempt: 2,
    previousState: first,
    retryAuthorization: authorization,
    sourceText,
  });
  assert.equal(secondActive.orchestration_attempt, 2);
  assert.deepEqual(secondActive.retry_authorization, authorization);
  const second = settle(secondActive, ['tool_unavailable', 'model_unavailable', 'auth_failed']);
  assert.equal(second.status, 'stuck');
  assert.equal(second.stop_reason, 'unavailable_auth');
  for (const attempt of [3, 2]) {
    assert.throws(() => policy.beginReviewOrchestration({
      planPath,
      phase: 'draft',
      lifecycleIntent: 'none',
      inputSha256: first.current_input_sha256,
      seriesId: nextUuid(),
      requestId: nextUuid(),
      orchestrationAttempt: attempt,
      previousState: second,
      retryAuthorization: { ...authorization, authorization_id: nextUuid(), stopped_state_sha256: second.state_sha256 },
      sourceText,
    }), /attempt|retry|stuck|authorization/i);
  }
  assert.throws(() => begin({ orchestrationAttempt: 1, previousState: second }), /same|input|stuck|attempt/i);
  const changed = begin({ inputSha256: '2'.repeat(64), previousState: second });
  assert.equal(changed.orchestration_attempt, 1);
  const repairStart = begin();
  const repaired = policy.advanceReviewOrchestrationRepair({
    state: repairStart,
    requestId: nextUuid(),
    currentInputSha256: '3'.repeat(64),
  });
  assert.equal(repaired.status, 'active');
  assert.equal(repaired.round_index, 2);
  assert.equal(repaired.orchestration_attempt, 1);
  assert.equal(repaired.series_id, repairStart.series_id);
  assert.equal(repaired.request_ids.length, 2);
  const cannotRepair = policy.advanceReviewOrchestrationRepair({
    state: begin(),
    requestId: nextUuid(),
    currentInputSha256: '1'.repeat(64),
  });
  assert.equal(cannotRepair.status, 'stuck');
  assert.equal(cannotRepair.stop_reason, 'cannot_repair');

  for (const [attemptResults, stopReason] of [
    [['model_unavailable', 'tool_unavailable', 'model_unavailable'], 'unavailable_model'],
    [['tool_unavailable', 'tool_unavailable', 'tool_unavailable'], 'unavailable_unknown'],
    [['deadline_exceeded'], 'timed_out'],
    [['transient_transport'], 'unavailable_unknown'],
    [['nonzero_exit'], 'failed_unparseable'],
    [['signaled'], 'failed_unparseable'],
    [['output_invalid'], 'failed_unparseable'],
  ]) {
    const stopped = settle(begin(), attemptResults);
    assert.equal(stopped.status, 'stopped');
    assert.equal(stopped.stop_reason, stopReason);
  }
  for (const [attemptResults, stopReason, options] of [
    [['platform_denied'], 'platform_denied', undefined],
    [['passed'], 'not_ready', { notReady: true }],
    [['passed'], 'stale_input', { staleInput: true }],
  ]) {
    const stuck = settle(begin(), attemptResults, options);
    assert.equal(stuck.status, 'stuck');
    assert.equal(stuck.stop_reason, stopReason);
  }

  const nonretryable = settle(begin(), ['platform_denied']);
  assert.throws(() => begin({
    orchestrationAttempt: 2,
    previousState: nonretryable,
    retryAuthorization: { ...authorization, input_sha256: nonretryable.current_input_sha256, stopped_state_sha256: nonretryable.state_sha256 },
    sourceText,
  }), /platform|nonretryable|retry|stuck/i);
  const malformed = begin();
  const malformedSeries = orchestrationSeries(policy, malformed, ['passed']);
  delete malformed.request_ids;
  assertUnchangedAfterThrow(malformed, () => policy.settleReviewOrchestration({
    state: malformed,
    series: malformedSeries,
  }), /request|state|closed|missing/i);
  const mismatched = begin();
  mismatched.state_sha256 = 'f'.repeat(64);
  assertUnchangedAfterThrow(mismatched, () => settle(mismatched, ['passed']), /hash|state/i);

  const nonExecuting = settle(begin(), ['passed']);
  const none = policy.consumeReviewIntent({ state: 'planned', intent: 'none', eligible: true, orchestration: nonExecuting });
  assert.equal(none.orchestration.apply_state, 'none');
  assert.equal(none.orchestration.transitioned_from_state_sha256, null);
  const executing = begin({ lifecycleIntent: 'start' });
  const passed = settle(executing, ['passed']);
  assert.equal(passed.status, 'passed');
  assert.equal(passed.apply_state, 'pending');
  const consumed = policy.consumeReviewIntent({ state: 'planned', intent: 'start', eligible: true, orchestration: passed });
  assert.deepEqual({ kind: consumed.kind, state: consumed.state }, { kind: 'applied', state: 'ongoing' });
  assert.equal(consumed.orchestration.apply_state, 'consumed');
  assertUnchangedAfterThrow(consumed.orchestration, () => policy.consumeReviewIntent({
    state: consumed.state,
    intent: 'start',
    eligible: true,
    orchestration: consumed.orchestration,
  }), /consum|duplicate|pending|apply/i);
  const rejected = policy.consumeReviewIntent({ state: 'scheduled', intent: 'start', eligible: true, orchestration: passed });
  assert.equal(rejected.kind, 'rejected');
  assert.equal(rejected.orchestration.status, 'stuck');
  assert.equal(rejected.orchestration.stop_reason, 'apply_rejected');
  assert.equal(rejected.orchestration.orchestration_attempt, 1);

  const fixture = fs.readFileSync('scripts/tests/fixtures/plan-review-policy/sample-plan.md', 'utf8');
  const metadataOnly = fixture
    .replace('updated: "2026-07-12T00:00:00-03:00"', 'updated: "2026-07-19T12:00:00-03:00"')
    .replace('status: planned', 'status: ongoing')
    .replace('review_status: null', 'review_status: passed');
  assert.equal(policy.canonicalPlanView(metadataOnly), policy.canonicalPlanView(fixture));
  const receiptOnly = fixture.replace('Review-receipt: {"schema":1}', 'Review-receipt: {"schema":2}');
  assert.equal(policy.canonicalPlanView(receiptOnly), policy.canonicalPlanView(fixture));
  const withOrchestrationRecord = `${metadataOnly.trimEnd()}\n\nReview-orchestration-state: ${policy.jcs(changed)}\n`;
  assert.equal(policy.canonicalPlanView(withOrchestrationRecord), policy.canonicalPlanView(fixture));
  assert.throws(
    () => policy.canonicalPlanView(`${withOrchestrationRecord.trimEnd()}\nReview-orchestration-state: ${policy.jcs(changed)}\n`),
    /duplicate.*orchestration/i,
  );
  assert.throws(
    () => policy.canonicalPlanView(`${metadataOnly.trimEnd()}\n\nReview-orchestration-state: {"schema":}\n`),
    /JSON|orchestration|record|malformed/i,
  );
  const mismatchedRecord = { ...changed, state_sha256: 'f'.repeat(64) };
  assert.throws(
    () => policy.canonicalPlanView(`${metadataOnly.trimEnd()}\n\nReview-orchestration-state: ${policy.jcs(mismatchedRecord)}\n`),
    /hash|orchestration|state/i,
  );
  assert.notEqual(policy.canonicalPlanView(fixture.replace('Prove canonical policy behavior.', 'Changed substantive goal.')), policy.canonicalPlanView(fixture));
  console.log('total result reducer and bounded no-progress orchestration passed');
}


const REGRESSIONS = [
  ['policy-v2 score gate regression', ['--case', 'validation-matrix'], /pre_execution_eligible|completion verdict|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "function reviewerMeetsPolicy(raw, policy) { return raw.reviewer_output?.verdict === 'ready' && (policy.schema === 1 || raw.reviewer_output.score >= policy.minimum_score); }",
    "function reviewerMeetsPolicy(raw, policy) { return raw.reviewer_output?.verdict === 'ready'; }",
  )],
  ['policy-v2 max-round lower-bound regression', ['--case', 'schemas'], /max_rounds|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (!Number.isInteger(policy.max_rounds) || policy.max_rounds < 1 || policy.max_rounds > 10) throw new Error('max_rounds');",
    "if (!Number.isInteger(policy.max_rounds) || policy.max_rounds < 0 || policy.max_rounds > 10) throw new Error('max_rounds');",
  )],
  ['structured-output constrained type regression', ['--case', 'schemas'], /const requires type|enum requires type|Assertion/, applyVariantAll(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "const typedConst = (type, value) => ({ type, const: value });",
    "const typedConst = (_type, value) => ({ const: value });",
    2,
  )],
  ['schema-3 rubric sum regression', ['--case', 'schemas'], /rubric|score|sum|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (rubricScore !== output.score) throw new Error('reviewer rubric score sum mismatch');",
    "if (rubricScore < output.score) throw new Error('reviewer rubric score sum mismatch');",
  )],
  ['schema-3 blocking verdict regression', ['--case', 'schemas'], /blocking|verdict|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if ((output.verdict === 'not_ready') !== hasBlocking) throw new Error('reviewer blocking verdict mismatch');",
    "if (output.verdict === 'not_ready' && !hasBlocking) throw new Error('reviewer blocking verdict mismatch');",
  )],
  ['schema-3 repair changed-input regression', ['--case', 'schemas'], /changed|input|repair|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (request.input_sha256 === request.previous_input_sha256) throw new Error('repair review requires changed input');",
    "if (request.input_sha256 !== request.previous_input_sha256) throw new Error('repair review requires changed input');",
  )],
  ['schema-3 lifetime cap regression', ['--case', 'schemas'], /max_rounds|lifetime|round|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (series.rounds.length > policy.max_rounds) throw new Error('review series exceeds lifetime max_rounds');",
    "if (series.rounds.length > policy.max_rounds + 1) throw new Error('review series exceeds lifetime max_rounds');",
  )],
  ['schema-3 initial run-kind regression', ['--case', 'schemas'], /review series run kind|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "oneOf(kind, new Set(['draft', 'completion']), 'review series run kind');",
    'void kind;',
  )],
  ['schema-3 run-kind drift regression', ['--case', 'schemas'], /review series run kind drift|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (round.kind !== kind) throw new Error('review series run kind drift');",
    "if (false) throw new Error('review series run kind drift');",
  )],
  ['schema-3 reviewer burden-of-proof regression', ['--case', 'legs'], /provable, actionable, unintentional defects|prompt missing|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    'Report only provable, actionable, unintentional defects',
    'Report possible defects',
  )],
  ['two-round current default regression', ['--case', 'surfaces'], /two-round default|max_rounds:? ?2|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-manager/SKILL.md',
    'max_rounds:2',
    'max_rounds:3',
  )],
  ['GitHub publishing contract loss', ['--orchestration-oracle'], /publishing operation|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-manager/SKILL.md',
    '## Publishing a plan as a GitHub issue (`--issues`)',
    '## Removed external operation',
  ), ORCHESTRATION_HARNESS],
  ['stale policy completion reuse regression', ['--case', 'completion-reuse'], /resolved policy|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "validateCompletionReceipt(receipt, { reviewed_head: reviewedHead, plan_input_sha256: sha256(canonicalPlanView(beforeBytes)), review_status: afterPlan.frontmatter.review_status }, { expectedPolicy, waivers });",
    "validateCompletionReceipt(receipt, { reviewed_head: reviewedHead, plan_input_sha256: sha256(canonicalPlanView(beforeBytes)), review_status: afterPlan.frontmatter.review_status }, { waivers });",
  )],
  ['stale policy draft reuse regression', ['--case', 'schemas'], /resolved policy|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "return validateDraftReceipt(normalized.receipt, normalized.expectedInput, { expectedPolicy: normalized.expectedPolicy, waivers: normalized.waivers });",
    "return validateDraftReceipt(normalized.receipt, normalized.expectedInput, { waivers: normalized.waivers });",
  )],
  ['policy-v2 repeated-candidate regression', ['--case', 'validation-matrix'], /at most once|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "      if (attempt.result === 'model_unavailable') {\n        tier += 1;\n        if (i < attempts.length - 1 && !tiers[tier]) throw new Error('attempt continued past tier list');\n      } else if (i !== attempts.length - 1) throw new Error('attempt after terminal result');",
    "      if (attempt.result === 'model_unavailable') {\n        tier += 1;\n        if (i < attempts.length - 1 && !tiers[tier]) throw new Error('attempt continued past tier list');\n      }",
  )],
  ['policy-v2 provider-wide rotation regression', ['--case', 'validation-matrix'], /provider-wide|terminal|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "      if (attempt.result === 'model_unavailable') {\n        tier += 1;\n        if (i < attempts.length - 1 && !tiers[tier]) throw new Error('attempt continued past tier list');\n      } else if (i !== attempts.length - 1) throw new Error('attempt after terminal result');",
    "      if (attempt.result === 'model_unavailable' || i < attempts.length - 1) {\n        tier += 1;\n        if (i < attempts.length - 1 && !tiers[tier]) throw new Error('attempt continued past tier list');\n      }",
  )],
  ['passed not_ready regression', ['--case', 'validation-matrix'], /not_ready|not-ready|pre_execution_eligible|completion verdict|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "function reviewerMeetsPolicy(raw, policy) { return raw.reviewer_output?.verdict === 'ready' && (policy.schema === 1 || raw.reviewer_output.score >= policy.minimum_score); }",
    "function reviewerMeetsPolicy(raw, policy) { return policy.schema === 1 || raw.reviewer_output?.score >= policy.minimum_score; }",
  )],
  ['vacuous acceptance inventory', ['--case', 'validation-matrix'], /acceptance inventory|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (value.schema !== 1 || !Array.isArray(value.criteria) || value.criteria.length === 0) throw new Error('acceptance inventory must be nonempty');",
    "if (value.schema !== 1 || !Array.isArray(value.criteria)) throw new Error('acceptance inventory must be nonempty');",
  )],
  ['acceptance command substitution', ['--case', 'validation-matrix'], /altered acceptance command|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (row.criterion_id !== criterion.id || row.command !== criterion.command || row.expected !== criterion.expected) throw new Error('acceptance evidence order or criterion mismatch');",
    "if (row.criterion_id !== criterion.id || row.expected !== criterion.expected) throw new Error('acceptance evidence order or criterion mismatch');",
  )],
  ['raw source plan ancestor defenses', ['--case', 'bundle'], /raw plan requested ancestor|must reject|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (unique.some((logical) => sameOrAncestor(logical, safePlan))) throw new Error('raw plan path or ancestor is forbidden in requested paths');",
      "if (false) throw new Error('raw plan path or ancestor is forbidden in requested paths');",
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (entries.slice(start).some((entry) => entry.path === safePlan)) throw new Error('raw plan path was emitted by requested path expansion');",
      "if (false) throw new Error('raw plan path was emitted by requested path expansion');",
    ),
  )],
  ['sealed plan-view semantic binding', ['--case', 'bundle'], /plan-B substitution|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (!planView || planView.mode !== '100444' || sha256(planView.bytes) !== manifest.input_sha256) throw new Error('bundle plan view input hash mismatch');",
    "if (!planView || planView.mode !== '100444') throw new Error('bundle plan view input hash mismatch');",
  )],
  ['sealed reviewer-schema semantic binding', ['--case', 'bundle'], /reviewer schema substitution|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (!schema || schema.mode !== '100444' || schema.bytes.toString() !== expected) throw new Error(`bundle reviewer schema mismatch: ${leg} v${version}`);",
    "if (!schema || schema.mode !== '100444') throw new Error(`bundle reviewer schema mismatch: ${leg} v${version}`);",
  )],
  ['requested-row coverage binding', ['--case', 'bundle'], /requested-state substitution|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (row.state === 'file' && (matches.length !== 1 || matches[0] !== logical)) throw new Error('file requested path coverage mismatch');",
    "if (false) throw new Error('file requested path coverage mismatch');",
  )],
  ['sealed file hash regression', ['--case', 'bundle'], /post-seal bundle regression|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (sha256(bytes) !== row.sha256) throw new Error(`bundle file hash mismatch: ${logical}`);",
    "if (false) throw new Error(`bundle file hash mismatch: ${logical}`);",
  )],
  ['destroy-bundle expected hash regression', ['--case', 'bundle'], /expected hash mismatch must fail|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    'const verified = verifyBundle({ bundle: target.root, expectedSha256 });',
    'const verified = verifyBundle({ bundle: target.root });',
  )],
  ['destroy-bundle root boundary regression', ['--case', 'bundle'], /outside review root must fail|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (bundle !== candidate || path.dirname(candidate) !== root || !inside(root, candidate) || !UUID.test(path.basename(candidate))) throw new Error('review bundle path is outside the supported temporary review root');",
    "if (false) throw new Error('review bundle path is outside the supported temporary review root');",
  )],
  ['destroy-bundle ownership regression', ['--case', 'bundle'], /ownership mismatch must fail|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (typeof process.getuid === 'function' && rootStat.uid !== process.getuid()) throw new Error('review root ownership mismatch');",
      "if (false) throw new Error('review root ownership mismatch');",
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      'validateReviewBundleOwnership(target.root);',
      'void target.root;',
    ),
    applyVariantAll(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new Error('review bundle ownership mismatch');",
      "if (false) throw new Error('review bundle ownership mismatch');",
      2,
    ),
  )],
  ['execution range validator regression', ['--case', 'lifecycle'], /non-start execution base|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    'validateExecutionRange({ repo, planPath: safePlan, plannedAtCommit, executionBaseCommit, reviewedHead: reviewedCommit });',
    '({ repo, planPath: safePlan, plannedAtCommit, executionBaseCommit, reviewedHead: reviewedCommit });',
  )],
  ['planned-base completion diff regression', ['--case', 'lifecycle'], /pre-start concurrent work|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    'const diffBytes = completionDiff(repo, executionBaseCommit, reviewedCommit);',
    'const diffBytes = completionDiff(repo, plannedAtCommit, reviewedCommit);',
  )],
  ['read-only wrapper claims primary writes', ['--case', 'surfaces'], /primary work|write boundary|CI, acceptance|Assertion/, applyVariant(
    '.codex/agents/plan-reviewer.toml',
    '- Never run or claim CI, acceptance, clone, cleanup, patch, retry, receipt,\n  orchestration, or lifecycle work.',
    '- CI, acceptance, clone, cleanup, patch, retry, receipt, orchestration, and lifecycle work passed.',
  )],
  ['Claude evidence wrapper regains Bash', ['--case', 'surfaces'], /regression-capable reviewer tools|Assertion/, applyVariant(
    'plugins/docks/agents/plan-reviewer.md',
    'tools: Read, Glob, Grep',
    'tools: Read, Glob, Grep, Bash',
  )],
  ['JCS lone-surrogate value regression', ['--case', 'canonical'], /lone-surrogate value|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "assertUnicodeScalarString(value, 'JCS string');",
    "void value; // variant string validation",
  )],
  ['JCS lone-surrogate key regression', ['--case', 'canonical'], /lone-surrogate property key|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "for (const key of keys) assertUnicodeScalarString(key, 'JCS property key');",
    "for (const key of keys) void key; // variant property-key validation",
  )],
  ['CI focused surfaces call removed', ['--case', 'surfaces'], /focused.*surfaces|exactly one|Assertion/i, applyVariant(
    'scripts/ci.mjs',
    "const planPolicySurfacesPassed = nodeOk(['scripts/tests/plan-review-policy.mjs', '--case', 'surfaces']);",
    'const planPolicySurfacesPassed = true;',
  )],
  ['CI regression-driver call removed', ['--case', 'surfaces'], /regression.*self-test|exactly one|Assertion/i, applyVariant(
    'scripts/ci.mjs',
    "startNodeTask('plan-review-policy regressions', ['scripts/tests/plan-review-policy-regressions.mjs', '--self-test'], { cwd: REPO, tasks })",
    'Promise.resolve(true)',
  )],
  ['CI no-argument full policy-harness duplicate restored', ['--case', 'surfaces'], /no-argument full policy-harness|zero no-argument|Assertion/i, applyVariant(
    'scripts/ci.mjs',
    "  section('plan review policy');\n  const planPolicySurfacesPassed = nodeOk(['scripts/tests/plan-review-policy.mjs', '--case', 'surfaces']);",
    "  section('plan review policy');\n  nodeOk(['scripts/tests/plan-review-policy.mjs']);\n  const planPolicySurfacesPassed = nodeOk(['scripts/tests/plan-review-policy.mjs', '--case', 'surfaces']);",
  )],
  ['compatibility authorization-id regression', ['--case', 'execution-compatibility'], /authorization id|source mismatch|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (authorizationId !== COMPATIBILITY_AUTHORIZATION_SCOPE.authorization_id || ownerMessageSha256 !== COMPATIBILITY_AUTHORIZATION_SCOPE.source_text_sha256) throw new Error('execution compatibility owner confirmation source mismatch');",
    "if (ownerMessageSha256 !== COMPATIBILITY_AUTHORIZATION_SCOPE.source_text_sha256) throw new Error('execution compatibility owner confirmation source mismatch');",
  )],
  ['compatibility authorization-plan regression', ['--case', 'execution-compatibility'], /authorization plan path|plan target|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (plan_path !== COMPATIBILITY_AUTHORIZATION_SCOPE.target.plan_path) throw new Error('execution compatibility owner confirmation plan target mismatch');",
    'void plan_path; // variant authorization plan target check',
  )],
  ['compatibility authorization-planned regression', ['--case', 'execution-compatibility'], /authorization planned commit|planned target|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (plannedAtCommit !== COMPATIBILITY_AUTHORIZATION_SCOPE.target.planned_at_commit) throw new Error('execution compatibility owner confirmation planned target mismatch');",
    'void plannedAtCommit; // variant authorization planned target check',
  )],
  ['compatibility authorization-execution regression', ['--case', 'execution-compatibility'], /authorization execution-base commit|execution target|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (executionBaseCommit !== COMPATIBILITY_AUTHORIZATION_SCOPE.target.execution_base_commit) throw new Error('execution compatibility owner confirmation execution target mismatch');",
    'void executionBaseCommit; // variant authorization execution target check',
  )],
  ['compatibility stored authorization-digest regression', ['--case', 'execution-compatibility'], /stored authorization scope digest|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (ownerConfirmation.authorization_scope_sha256 !== COMPATIBILITY_AUTHORIZATION_SCOPE_SHA256) throw new Error('execution compatibility owner confirmation stored authorization scope digest mismatch');",
    'void ownerConfirmation.authorization_scope_sha256; // variant stored authorization scope digest check',
  )],
  ['prerequisite failed-child regression', ['--case', 'execution-compatibility'], /nonzero child status|signaled child|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (result.error !== null || result.signal !== null || result.status !== 0) throw new Error(`${label} child failed`);",
    "if (result.error !== null) throw new Error(`${label} child failed`);",
  )],
  ['canonical cache file regression', ['--case', 'execution-compatibility'], /cache symlink|cache directory|cache realpath|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (stat.kind !== 'file' || stat.symbolicLink || dependencies.realpath(absolutePath) !== absolutePath) throw new Error(`${label} must be a canonical non-symlink file`);",
    "if (false) throw new Error(`${label} must be a canonical non-symlink file`);",
  )],
  ['remote main exact-row regression', ['--case', 'execution-compatibility'], /remote main extra row|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (text !== expected) throw new Error('remote main stdout mismatch');",
    "if (!text.startsWith(expected)) throw new Error('remote main stdout mismatch');",
  )],
  ['remote tag exact-row regression', ['--case', 'execution-compatibility'], /remote tag row order|remote tag unpeeled|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "throw new Error('remote tag stdout mismatch');\n}",
    "return { ref, annotated: true, tag_object: rows[0]?.[0] ?? releaseCommit, peeled_commit: releaseCommit };\n}",
  )],
  ['release projection regression', ['--case', 'execution-compatibility'], /release draft|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (jcs(parsed) !== jcs(expected)) throw new Error('GitHub Release projection mismatch');",
    "void parsed; // variant GitHub Release projection",
  )],
  ['Codex plugin uniqueness regression', ['--case', 'execution-compatibility'], /duplicate Codex plugin|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (matches.length !== 1) throw new Error('Codex plugin selection must be unique');",
    "if (matches.length === 0) throw new Error('Codex plugin selection must be unique');",
  )],
  ['observation self-hash regression', ['--case', 'execution-compatibility'], /stale stored stderr|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (observations.observations_sha256 !== sha256(jcs(preimage))) throw new Error('Docks prerequisite observations hash mismatch');",
    "void preimage; // variant observations self-hash",
  )],
  ['prerequisite receipt self-hash regression', ['--case', 'execution-compatibility'], /partially rehashed stored stderr|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (receipt.receipt_sha256 !== sha256(jcs(preimage))) throw new Error('Docks prerequisite receipt hash mismatch');",
    "void preimage; // variant prerequisite receipt self-hash",
  )],
  ['canonical remote config count regression', ['--case', 'execution-compatibility'], /GIT_CONFIG_COUNT|Assertion|child failed/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "env.GIT_DIR = os.devNull;\n  env.GIT_CONFIG_GLOBAL = os.devNull;\n  env.GIT_CONFIG_SYSTEM = os.devNull;\n  env.GIT_CONFIG_NOSYSTEM = '1';\n  env.GIT_CONFIG_COUNT = '0';",
    "env.GIT_DIR = os.devNull;\n  env.GIT_CONFIG_GLOBAL = os.devNull;\n  env.GIT_CONFIG_SYSTEM = os.devNull;\n  env.GIT_CONFIG_NOSYSTEM = '1';\n  env.GIT_CONFIG_COUNT = '1';",
  )],
  ['canonical remote tag loses peeled pattern', ['--case', 'execution-compatibility'], /two canonical remote children|deep-equal|Assertion|remote tag/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "return ['git', 'ls-remote', '--exit-code', '--tags', CANONICAL_REPOSITORY_URL, ref, `${ref}^{}`];",
    "return ['git', 'ls-remote', '--exit-code', '--tags', CANONICAL_REPOSITORY_URL, ref];",
  )],
  ['Completion Review accepted-order regression', ['--case', 'execution-compatibility'], /accepted X1,X2|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    'accepted: receipt[leg].reconciliation.accepted.slice().sort(compareUtf16),',
    'accepted: receipt[leg].reconciliation.accepted.slice(),',
  )],
  ['Completion Review rejected-order regression', ['--case', 'execution-compatibility'], /rejected S1|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    'rejected: receipt[leg].reconciliation.rejected.map(({ id, reason }) => ({ id, reason })).sort((a, b) => compareUtf16(a.id, b.id)),',
    'rejected: receipt[leg].reconciliation.rejected.map(({ id, reason }) => ({ id, reason })),',
  )],
  ['Completion Review reproduced-order regression', ['--case', 'execution-compatibility'], /verified X1,X2|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "reproduced_ids: receipt.reproduced.filter((row) => row.source === 'X' || row.source === 'S').map((row) => row.id).sort(compareUtf16),",
    "reproduced_ids: receipt.reproduced.filter((row) => row.source === 'X' || row.source === 'S').map((row) => row.id),",
  )],
  ['Completion Review special-character quoting regression', ['--case', 'execution-compatibility'], /specialCharacter|injected|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "} else rendered += `\\\\u${first.toString(16).padStart(4, '0')}`;",
    '} else rendered += value[index];',
  )],
  ['completion-stable Review removal regression', ['--case', 'execution-compatibility'], /stable|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    'return canonicalPlanView(withoutReview);',
    'return canonicalPlanView(bytes);',
  )],
  ['execution scope transient-path regression', ['--case', 'execution-compatibility'], /per-commit outside scope|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "for (const changedPath of changed) if (!allowed.has(changedPath)) throw new Error(`execution scope path is not allowed: ${changedPath}`);",
    'for (const changedPath of changed) void changedPath;',
  )],
  ['execution scope sealed-manifest regression', ['--case', 'execution-compatibility'], /self-broadened scope manifest|sealed allowed paths|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (allowedPathsSha256 !== expectedAllowedPathsSha256) throw new Error('execution scope sealed allowed paths hash mismatch');",
    'void expectedAllowedPathsSha256; // variant sealed allowed paths check',
  )],
  ['legacy creation and start shape regression', ['--case', 'execution-compatibility'], /planned path already existed|creation parent drift|creation extra path|start extra path|must reject|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (pathExistsAt(repo, plannedAtCommit, plan_path)) throw new Error('plan path existed at planned_at_commit');",
      'void plan_path; // variant legacy creation absence check',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (commitParent(repo, plan_creation_commit, 'plan creation commit') !== plannedAtCommit) throw new Error('plan creation parent mismatch');",
      'void plan_creation_commit; // variant creation parent check',
    ),
    applyVariantAll(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (creationPaths.length !== 1 || creationPaths[0] !== plan_path) throw new Error('plan creation must be plan-only');",
      'void creationPaths; // variant creation path check', 2,
    ),
    applyVariantAll(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (startPaths.length !== 1 || startPaths[0] !== plan_path) throw new Error('legacy start must change only the plan');",
      'void startPaths; // variant start path check', 2,
    ),
  )],
  ['legacy section-vector and transition-diff regression', ['--case', 'execution-compatibility'], /protected section changed|heading vector changed|transition diff|Assertion/, combine(
    applyVariantAll(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (jcs(parentPartitions.map((row) => row.name)) !== jcs(basePartitions.map((row) => row.name))) throw new Error('execution compatibility heading vector changed');",
      'void parentPartitions; void basePartitions; // variant heading vector check', 2,
    ),
    applyVariantAll(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      'for (const row of partitions) if (row.changed && protectedNames.has(row.name)) throw new Error(`execution compatibility protected section changed: ${row.name}`);',
      'for (const row of partitions) void row; // variant protected-section check', 2,
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "'--diff-algorithm=myers', '--unified=3', '--inter-hunk-context=0'",
      "'--diff-algorithm=myers', '--unified=4', '--inter-hunk-context=0'",
    ),
  )],
  ['compatibility copied-artifact isolation regression', ['--case', 'execution-compatibility'], /named diff driver|exact deterministic argv|transition diff|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "'diff', '--no-index', '--text', '--binary'",
    "'diff', '--text', '--binary'",
  )],
  ['compatibility GIT_ATTR_NOSYSTEM child-isolation regression', ['--case', 'execution-compatibility'], /ambient attribute source|GIT_ATTR_NOSYSTEM|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "env.GIT_ATTR_NOSYSTEM = '1';",
    "env.GIT_ATTR_NOSYSTEM = '0';",
  )],
  ['compatibility E reconstruction regression', ['--case', 'execution-compatibility'], /historical application|E historical reconstruction|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (application.markdown !== expectedApplication.markdown || receipt.receipt_sha256 !== expectedApplication.receipt_sha256) throw new Error('execution compatibility application mismatch');",
      'void expectedApplication; // variant direct historical reconstruction',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      'return { ...application, receipt, application: expectedApplication };',
      'return { ...application, receipt, application }; // variant canonical historical substitution',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (application.markdown !== reconstructed.markdown) throw new Error('compatibility evidence historical application mismatch');",
      'void reconstructed; // variant repository historical reconstruction',
    ),
  )],
  ['compatibility findings-free regression', ['--case', 'execution-compatibility'], /R not_ready|R finding|must reject|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (passed.length < 1 || passed.some((raw) => raw.reviewer_output?.verdict !== 'ready' || raw.findings.length !== 0)) throw new Error('execution compatibility review must be findings-free ready');",
      "if (passed.length < 1) throw new Error('execution compatibility review must be findings-free ready');",
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (!['dual', 'single'].includes(receipt.outcome) || receipt.pre_execution_eligible !== true) throw new Error('execution compatibility review outcome is ineligible');",
      "if (!['dual', 'single'].includes(receipt.outcome)) throw new Error('execution compatibility review outcome is ineligible');",
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (leg.raw.result === 'waived' || leg.raw.waiver !== null || leg.raw.findings.length !== 0 || leg.reconciliation.accepted.length !== 0 || leg.reconciliation.rejected.length !== 0) throw new Error('execution compatibility review waiver/finding is forbidden');",
      "if (leg.raw.result === 'waived' || leg.raw.waiver !== null) throw new Error('execution compatibility review waiver/finding is forbidden');",
    ),
  )],
  ['compatibility adjacency and plan-only regression', ['--case', 'execution-compatibility'], /E adjacency|R adjacency|B extra path|Q extra path|Q adjacency|must reject|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (commitParent(repo, commit, label) !== parent) throw new Error(`${label} parent mismatch`);",
      'void parent; // variant direct adjacency check',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (repository.parent(commit, label) !== parent) throw new Error(`${label} parent mismatch`);",
      'void parent; // variant prerequisite adjacency check',
    ),
    applyVariantAll(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (paths.length !== 1 || paths[0] !== planPath) throw new Error(`${label} must change only the plan`);",
      'void paths; // variant plan-only check', 2,
    ),
  )],
  ['compatibility binding record regression', ['--case', 'execution-compatibility'], /B binding record|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (extracted.markdown !== `Execution-base-compatibility-binding: ${jcs(binding)}\\n`) throw new Error('compatibility binding application mismatch');",
    'void extracted; // variant binding application check',
  )],
  ['prerequisite Q marker and delta regression', ['--case', 'execution-compatibility'], /Q pending marker|Q Step-P|Q extra prose|must reject|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (markerCount !== 1 || plannedCount !== 1 || doneCount !== 0) throw new Error('Docks prerequisite marker or Step-P row mismatch');",
      'void markerCount; void plannedCount; void doneCount; // variant Q marker check',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "requirePlanDelta(bindingState.bindingBytes, prerequisiteBytes, expectedPrerequisite, 'Docks prerequisite closure');",
      'void expectedPrerequisite; // variant Q exact delta check',
    ),
  )],
  ['final F receipt and delta regression', ['--case', 'execution-compatibility'], /F extra prose|F attribution|R not_ready|R finding|must reject|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (committedFinal.payload !== finalReview.payload) throw new Error('execution review receipt was not retained');",
      'void committedFinal; // variant final receipt retention',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "requirePlanDelta(prerequisiteBytes, executionReviewBytes, expectedFinal, 'execution final review');",
      'void expectedFinal; // variant final review delta',
    ),
  )],
  ['stored prerequisite closure regression', ['--case', 'execution-compatibility'], /stored observation missing field|stored observation extra field|stored main projection|stored argv order|must reject|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "assertClosed(row, ['schema', 'argv', 'exit_code', 'stdout_sha256', 'stderr_sha256', 'projection'], label);",
      'void row; // variant stored observation closure',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (row.schema !== 1 || row.exit_code !== 0 || jcs(row.argv) !== jcs(expectedArgv)) throw new Error(`${label} identity mismatch`);",
      'void expectedArgv; // variant stored observation identity',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (jcs(observations.remote_main.projection) !== jcs({ commit: receipt.release_commit, ref: 'refs/heads/main' })) throw new Error('stored remote main projection mismatch');",
      'void receipt; // variant stored main projection',
    ),
  )],
  ['completion Review reuse byte checks regression', ['--case', 'execution-compatibility'], /completion reuse|must reject|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (record.payload !== jcs(receipt)) throw new Error('completion Review receipt payload mismatch');",
      'void record; // variant completion receipt payload',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (completionStablePlanViewV1(beforeReviewBytes) !== completionStablePlanViewV1(afterReviewBytes)) throw new Error('completion stable plan view mismatch');",
      'void beforeReviewBytes; void afterReviewBytes; // variant completion stable view',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "requirePlanDelta(beforeReviewBytes, afterReviewBytes, expected, 'completion Review apply', ['updated', 'review_status']);",
      'void expected; // variant completion Review exact apply',
    ),
  )],
  ['execution scope chronological empty-ledger regression', ['--case', 'execution-compatibility'], /scope ledger|empty commits|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      'const commits = newestFirst.reverse();',
      'const commits = newestFirst; // variant chronological order',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      'const changed = changedPaths(repo, row.parent, row.commit).slice().sort(compareUtf16);',
      'const changed = changedPaths(repo, row.parent, row.commit).slice();',
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      'const ledger = commits.map((row, index) => {',
      'const ledger = commits.filter((row) => changedPaths(repo, row.parent, row.commit).length > 0).map((row, index) => {',
    ),
  )],
  ['strict corpus identity regression', ['--case', 'strict-contract'], /strict corpus|Assertion/, applyVariant(
    HARNESS,
    "'strict-success', 'path-escape'",
    "'path-escape', 'strict-success'",
  )],
  ['strict raw result comparison regression', ['--case', 'strict-contract'], /strict differential retains raw comparison|Assertion/, combine(
    applyVariantLast(HARNESS, 'assert.equal(newResult.status, oldResult.status', 'assert.equal(oldResult.status, oldResult.status'),
    applyVariantLast(HARNESS, 'assert.deepEqual(newResult.stdout, oldResult.stdout', 'assert.deepEqual(oldResult.stdout, oldResult.stdout'),
    applyVariantLast(HARNESS, 'assert.deepEqual(newResult.stderr, oldResult.stderr', 'assert.deepEqual(oldResult.stderr, oldResult.stderr'),
  )],
  ['closed selector fallback regression', ['--case', 'selectors'], /selector|Expected|Assertion|unknown or malformed/, applyVariant(
    HARNESS,
    "else throw new Error('unknown or malformed plan-review-policy test selector');",
    'else {}',
  )],
  ['malformed acceptance source table', ['--case', 'validation-matrix'], /acceptance inventory|criterion id|Assertion/, applyVariant(
    'scripts/tests/fixtures/plan-review-policy/sample-plan.md',
    '| A2 | `node --check fixture.js` | exit 0 |',
    '| A1 | `node --check fixture.js` | exit 0 |',
  )],
  ['current schema closure regression', ['--case', 'current-single-lane'], /current policy missing minimum_score/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "assertClosed(policy, ['schema', 'role', 'fallback', 'max_rounds', 'candidates', 'provenance'], 'current policy');",
    "assertClosed(policy, ['schema', 'role', 'fallback', 'max_rounds', 'candidates', 'provenance', 'minimum_score'], 'current policy');",
  )],
  ['current two-round cap regression', ['--case', 'current-single-lane'], /current rounds|max_rounds|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (policy.max_rounds !== 2) throw new Error('current policy max_rounds must be exactly 2');",
    "if (policy.max_rounds < 2) throw new Error('current policy max_rounds must be at least 2');",
  )],
  ['current platform fallback regression', ['--case', 'current-single-lane'], /platform|terminal|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (index < attempts.length - 1 && !CURRENT_FALLBACK_RESULTS.has(attempt.result)) throw new Error(`current attempt continued after terminal ${attempt.result}`);",
    "if (index < attempts.length - 1 && attempt.result === 'passed') throw new Error(`current attempt continued after terminal ${attempt.result}`);",
  )],
  ['current output fallback regression', ['--case', 'current-single-lane'], /fallback after output|output|terminal|must reject|Assertion/, combine(
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (CURRENT_FALLBACK_RESULTS.has(attempt.result) && attempt.output_started) throw new Error('availability fallback cannot follow substantive output');",
      "if (false && CURRENT_FALLBACK_RESULTS.has(attempt.result) && attempt.output_started) throw new Error('availability fallback cannot follow substantive output');",
    ),
    applyVariant(
      'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
      "if (index < attempts.length - 1 && attempt.output_started) throw new Error('current attempt fallback after output is terminal');",
      "if (false && index < attempts.length - 1 && attempt.output_started) throw new Error('current attempt fallback after output is terminal');",
    ),
  )],
  ['current checklist verdict regression', ['--case', 'current-receipts'], /verdict|strongest|must reject|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (output.verdict !== strongest) throw new Error('current reviewer verdict must equal strongest checklist status');",
    "if (false && output.verdict !== strongest) throw new Error('current reviewer verdict must equal strongest checklist status');",
  )],
  ['current unstarted model-unavailable regression', ['--case', 'current-single-lane'], /unstarted model_unavailable|started real launch|Missing expected exception|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (attempt.result === 'model_unavailable' && !attempt.started) throw new Error('model_unavailable requires a started real launch');",
    "if (false && attempt.result === 'model_unavailable' && !attempt.started) throw new Error('model_unavailable requires a started real launch');",
  )],
  ['current attempt launch-evidence regression', ['--case', 'current-single-lane'], /child|timeout|600|Missing expected exception|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (attempt.started && (attempt.child_id === null || attempt.timeout_mode === null || attempt.timeout_seconds !== 600 || attempt.stdout_sha256 === null || attempt.stderr_sha256 === null)) throw new Error('started current attempt requires child id, timeout mode, 600-second deadline, and output hashes');",
    "if (attempt.started && (attempt.stdout_sha256 === null || attempt.stderr_sha256 === null)) throw new Error('started current attempt requires output hashes');",
  )],
  ['current deadline contradiction regression', ['--case', 'current-single-lane'], /deadline|exit|signal|Missing expected exception|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (attempt.result === 'deadline_exceeded' && (!attempt.started || ((attempt.exit_code === null) === (attempt.signal === null)))) throw new Error('invalid current deadline: exactly one exit code or signal is required');",
    "if (attempt.result === 'deadline_exceeded' && (!attempt.started || (attempt.exit_code === null && attempt.signal === null))) throw new Error('invalid current deadline');",
  )],
  ['current repair source-binding regression', ['--case', 'single-repair'], /source|primary|Missing expected exception|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (target.source !== 'primary') throw new Error('current repair target source must be primary');",
    "if (false && target.source !== 'primary') throw new Error('current repair target source must be primary');",
  ), CONVERGENCE_HARNESS],
  ['current repair finding-identity regression', ['--case', 'single-repair'], /section|path|locator|evidence|exact|reproduced|Missing expected exception|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "const findingFields = ['criterion', 'status', 'section', 'path', 'locator', 'defect', 'fix', 'evidence'];",
    "const findingFields = ['criterion', 'status', 'defect', 'fix'];",
  ), CONVERGENCE_HARNESS],
  ['current rejected blocking-gap regression', ['--case', 'current-receipts'], /blocking_gap.*terminal|outcome mismatch|Missing expected exception|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (currentBlockingFindings(reviewer).length > 0) return { outcome: 'not_ready', eligible: false };",
    "if (currentAcceptedBlockingFindings(reviewer).length > 0) return { outcome: 'not_ready', eligible: false };",
  )],
  ['current failed-after-passed-attempt regression', ['--case', 'current-receipts'], /failed review.*passed attempt|passed attempt|Missing expected exception|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (raw.result === 'failed' && (!sequence.terminal || sequence.selected_index !== null)) throw new Error('current failed review cannot discard a passed attempt');",
    "if (raw.result === 'failed' && !sequence.terminal) throw new Error('current failed review requires terminal attempt');",
  )],
  ['current completion primary-render regression', ['--case', 'current-completion-renderer'], /schema-5 primary-only|Cross-check:|\[X:|\[S:|"X":|"S":|completionReviewLeg|Cannot read properties|Assertion/, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    'const block = receipt.schema === 5 ? completionReviewBlockV5(receipt, { waivers }) : completionReviewBlockV1(receipt, { waivers });',
    'const block = completionReviewBlockV1(receipt, { waivers });',
  )],
  ['current completion waiver-render regression', ['--case', 'current-completion-renderer'], /waiver.*snapshot|explicit completion waiver|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    'const block = receipt.schema === 5 ? completionReviewBlockV5(receipt, { waivers }) : completionReviewBlockV1(receipt, { waivers });',
    'const block = receipt.schema === 5 ? completionReviewBlockV5(receipt) : completionReviewBlockV1(receipt, { waivers });',
  )],
  ['current completion missing-LF normalization regression', ['--case', 'completion-reuse'], /plan body must end in LF|completion reuse|Missing expected exception|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    'const beforeReviewBytes = receipt.schema === 5 ? completionReviewBytes(beforeBytes) : beforeBytes;',
    'const beforeReviewBytes = beforeBytes;',
  )],
  ['current generic-series waiver regression', ['--case', 'current-receipts'], /waiver.*snapshot|generic current series|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    'if (series?.schema === 5) return validateCurrentReviewSeries(series, { waivers });',
    'if (series?.schema === 5) return validateCurrentReviewSeries(series);',
  )],
  ['current draft-reuse waiver regression', ['--case', 'current-receipts'], /waiver.*snapshot|draft reuse|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    'return validateDraftReceipt(normalized.receipt, normalized.expectedInput, { expectedPolicy: normalized.expectedPolicy, waivers: normalized.waivers });',
    'return validateDraftReceipt(normalized.receipt, normalized.expectedInput, { expectedPolicy: normalized.expectedPolicy });',
  )],
  ['current argv candidate-binding regression', ['--case', 'current-argv'], /candidate|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    'const candidate = request.policy.candidates[priorAttempts.length];',
    'const candidate = request.policy.candidates[0];',
  ), CONVERGENCE_HARNESS],
  ['current bundle primary-schema identity regression', ['--case', 'current-bundle'], /primary\.v5|reviewer schema (?:identity|paths)|path.*undefined|Expected values|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "const reviewerSchemas = reviewSchema === 5 ? { primary: 'reviewer-output.primary.v5.schema.json' } : { X: 'reviewer-output.X.schema.json', S: 'reviewer-output.S.schema.json' };",
    "const reviewerSchemas = reviewSchema === 5 ? { X: 'reviewer-output.X.schema.json', S: 'reviewer-output.S.schema.json' } : { X: 'reviewer-output.X.schema.json', S: 'reviewer-output.S.schema.json' };",
  ), CONVERGENCE_HARNESS],
  ['historical bundle fixed-golden regression', ['--case', 'current-bundle'], /historical bundle bytes|fixed pre-schema-5 golden|Assertion/i, applyVariantAll(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "const str = { type: 'string', minLength: 1 };",
    "const str = { type: 'string', minLength: 1, maxLength: 999 };",
    2,
  ), CONVERGENCE_HARNESS],
  ['current series drift regression', ['--case', 'single-repair'], /phase.*drift|lifecycle.*drift|Missing expected exception|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (round.request.phase !== phase || round.kind !== kind || round.request.lifecycle_intent !== lifecycleIntent) throw new Error('current review series phase, kind, or lifecycle drift');",
    "if (false && (round.request.phase !== phase || round.kind !== kind || round.request.lifecycle_intent !== lifecycleIntent)) throw new Error('current review series phase, kind, or lifecycle drift');",
  ), CONVERGENCE_HARNESS],
  ['current completion execution-identity drift regression', ['--case', 'single-repair'], /execution.*drift|execution_base_commit|completion.*identity|Missing expected exception|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (phase === 'completion' && (round.request.planned_at_commit !== first.request.planned_at_commit || round.request.execution_base_commit !== first.request.execution_base_commit)) throw new Error('current completion series execution identity drift');",
    "if (false && phase === 'completion' && (round.request.planned_at_commit !== first.request.planned_at_commit || round.request.execution_base_commit !== first.request.execution_base_commit)) throw new Error('current completion series execution identity drift');",
  ), CONVERGENCE_HARNESS],
  ['current rejected-blocker repair regression', ['--case', 'single-repair'], /rejected.*blocking|blocking.*rejected|Missing expected exception|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (rejectedBlocking.length > 0) throw new Error('current repair series cannot leave a rejected blocking finding outside repair');",
    "if (false && rejectedBlocking.length > 0) throw new Error('current repair series cannot leave a rejected blocking finding outside repair');",
  ), CONVERGENCE_HARNESS],
  ['current completion reuse waiver regression', ['--case', 'completion-reuse'], /waiver.*snapshot|completion waiver reuse|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    'const expected = applyCompletionReviewBlock(beforeReviewBytes, receipt, { waivers });',
    'const expected = applyCompletionReviewBlock(beforeReviewBytes, receipt);',
  )],
  ['current completion series-final binding regression', ['--case', 'current-receipts'], /series.*final|final.*series|Missing expected exception|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (jcs(series.rounds.at(-1)) !== jcs(run)) throw new Error('current completion receipt series final run mismatch');",
    "if (false && jcs(series.rounds.at(-1)) !== jcs(run)) throw new Error('current completion receipt series final run mismatch');",
  )],
  ['orchestration auth fallback mapping regression', ['--orchestration-oracle'], /Assertion|unavailable_auth|stop_reason/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "auth_failed: 'unavailable_auth',",
    "auth_failed: 'unavailable_unknown',",
  ), ORCHESTRATION_HARNESS],
  ['orchestration model fallback mapping regression', ['--orchestration-oracle'], /Assertion|unavailable_model|stop_reason/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "model_unavailable: 'unavailable_model',",
    "model_unavailable: 'unavailable_unknown',",
  ), ORCHESTRATION_HARNESS],
  ['orchestration tool fallback mapping regression', ['--orchestration-oracle'], /Assertion|unavailable_unknown|stop_reason/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "tool_unavailable: 'unavailable_unknown',",
    "tool_unavailable: 'unavailable_model',",
  ), ORCHESTRATION_HARNESS],
  ['orchestration deadline mapping regression', ['--orchestration-oracle'], /Assertion|timed_out|stop_reason/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "deadline_exceeded: 'timed_out',",
    "deadline_exceeded: 'unavailable_unknown',",
  ), ORCHESTRATION_HARNESS],
  ['orchestration transient mapping regression', ['--orchestration-oracle'], /Assertion|unavailable_unknown|stop_reason/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "transient_transport: 'unavailable_unknown',",
    "transient_transport: 'timed_out',",
  ), ORCHESTRATION_HARNESS],
  ['orchestration nonzero mapping regression', ['--orchestration-oracle'], /Assertion|failed_unparseable|stop_reason/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "nonzero_exit: 'failed_unparseable',",
    "nonzero_exit: 'unavailable_unknown',",
  ), ORCHESTRATION_HARNESS],
  ['orchestration signal mapping regression', ['--orchestration-oracle'], /Assertion|failed_unparseable|stop_reason/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "signaled: 'failed_unparseable',",
    "signaled: 'timed_out',",
  ), ORCHESTRATION_HARNESS],
  ['orchestration invalid-output mapping regression', ['--orchestration-oracle'], /Assertion|failed_unparseable|stop_reason/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "output_invalid: 'failed_unparseable',",
    "output_invalid: 'unavailable_unknown',",
  ), ORCHESTRATION_HARNESS],
  ['orchestration platform denial mapping regression', ['--orchestration-oracle'], /Assertion|platform_denied|stuck|stop_reason/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "platform_denied: 'platform_denied',",
    "platform_denied: 'unavailable_unknown',",
  ), ORCHESTRATION_HARNESS],
  ['orchestration fallback precedence regression', ['--orchestration-oracle'], /Assertion|unavailable_auth|precedence|stop_reason/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "const ORCHESTRATION_FALLBACK_PRECEDENCE = ['auth_failed', 'model_unavailable', 'tool_unavailable'];",
    "const ORCHESTRATION_FALLBACK_PRECEDENCE = ['tool_unavailable', 'model_unavailable', 'auth_failed'];",
  ), ORCHESTRATION_HARNESS],
  ['orchestration attempt status conversion regression', ['--orchestration-oracle'], /Assertion|stopped|stuck|status/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "return orchestration.orchestration_attempt === 1 ? 'stopped' : 'stuck';",
    "return 'stopped';",
  ), ORCHESTRATION_HARNESS],
  ['orchestration nonretryable status regression', ['--orchestration-oracle'], /Assertion|stuck|nonretryable|status/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "const ORCHESTRATION_NONRETRYABLE_REASONS = new Set(['platform_denied', 'stale_input', 'cannot_repair', 'not_ready', 'apply_rejected']);",
    "const ORCHESTRATION_NONRETRYABLE_REASONS = new Set(['stale_input', 'cannot_repair', 'not_ready', 'apply_rejected']);",
  ), ORCHESTRATION_HARNESS],
  ['orchestration retry authorization guard regression', ['--orchestration-oracle'], /authorization|retry|attempt|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (orchestrationAttempt === 2) validateReviewRetryAuthorization(retryAuthorization, previousState, sourceText);",
    "if (orchestrationAttempt === 2) void retryAuthorization;",
  ), ORCHESTRATION_HARNESS],
  ['orchestration duplicate intent consumption regression', ['--orchestration-oracle'], /consum|duplicate|pending|apply|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "if (orchestration.apply_state !== 'pending') throw new Error('review intent is not pending');",
    "if (false && orchestration.apply_state !== 'pending') throw new Error('review intent is not pending');",
  ), ORCHESTRATION_HARNESS],
  ['orchestration stale-input mapping regression', ['--orchestration-oracle'], /stale_input|stuck|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "stale_input: 'stale_input',",
    "stale_input: 'not_ready',",
  ), ORCHESTRATION_HARNESS],
  ['orchestration cannot-repair mapping regression', ['--orchestration-oracle'], /cannot_repair|stuck|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "cannot_repair: 'cannot_repair',",
    "cannot_repair: 'not_ready',",
  ), ORCHESTRATION_HARNESS],
  ['orchestration not-ready mapping regression', ['--orchestration-oracle'], /not_ready|stuck|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "not_ready: 'not_ready',",
    "not_ready: 'failed_unparseable',",
  ), ORCHESTRATION_HARNESS],
  ['orchestration apply-rejected mapping regression', ['--orchestration-oracle'], /apply_rejected|stuck|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "apply_rejected: 'apply_rejected',",
    "apply_rejected: 'not_ready',",
  ), ORCHESTRATION_HARNESS],
  ['orchestration metadata-only reset regression', ['--orchestration-oracle'], /canonical|Expected values|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    "  'updated', 'status', 'started_at', 'in_review_since', 'blocked_reason',",
    "  'updated', 'started_at', 'in_review_since', 'blocked_reason',",
  ), ORCHESTRATION_HARNESS],
  ['orchestration machine-record exclusion regression', ['--orchestration-oracle'], /canonical|orchestration|Expected values|Assertion/i, applyVariant(
    'plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs',
    'const MACHINE_RECORD = /^(Bootstrap-review-record|Review-receipt|Completion-review-receipt|Review-orchestration-state): (\\{.*\\})$/;',
    'const MACHINE_RECORD = /^(Bootstrap-review-record|Review-receipt|Completion-review-receipt): (\\{.*\\})$/;',
  ), ORCHESTRATION_HARNESS],
];

async function runRegressionSuite(jobs) {
  const self = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  assert.doesNotMatch(self, /from ['"].*review-policy\.mjs['"]/);
  assert.doesNotMatch(self, /from ['"].*plan-review-policy\.mjs['"]/);
  assert.doesNotMatch(self, /spawnSync\(/, 'driver must not block the mutation scheduler');
  assert.equal((self.match(/\bspawn\(/g) || []).length, 1, 'driver has one black-box spawn site');
  console.log('regression driver imports no helper/harness/inventory and spawns only a copied harness');

  const snapshot = createOwnedRoot('snapshot');
  try {
    copyRoot(ROOT, snapshot); changeOwnedModes(snapshot, 0o500, 0o400);
    console.log(`omitted-surface oracle copied ${REQUIRED_SURFACES.length} live/generated/helper surfaces`);

    const baseline = createOwnedRoot('baseline');
    try {
      copyRoot(snapshot, baseline);
      const orchestration = await run(
        baseline,
        ['--orchestration-oracle'],
        ORCHESTRATION_HARNESS,
        { [ORCHESTRATION_ORACLE_ENV]: '1' },
      );
      requirePass('total result reducer and bounded no-progress orchestration', orchestration, /total result reducer and bounded no-progress orchestration passed/);
      assert.match(orchestration.stdout, /GitHub issue publishing operation preservation passed/);
      const full = await run(baseline, []);
      requirePass('semantic attempt/ledger/raw/run/receipt validation matrix', full, /semantic validation matrix passed/);
      assert.match(full.stdout, /not_ready verdict and structured-output hash cannot authorize execution/);
      assert.match(full.stdout, /derived completion verdict rejects failing primary evidence and mismatched review_status/);
      requirePass('distinct X\/S schema and request leg matrix', full, /direct argv.*consent separation passed/);
      requirePass('shipped completion clone\/snapshot\/cleanup matrix', full, /git clone --no-local.*digest passed/);
      assert.match(full.stdout, /canonical root and prepare identity reject arbitrary roots and forged tokens/);
      requirePass('canonical bundle, fence, consumer, and surface matrix', full, /plan-review-policy contract passed/);
      for (const [testCase, proof] of [
        ['current-argv', /reviewer argv binds prior attempts/],
        ['current-bundle', /current bundle carries primary v5 identity/],
        ['single-repair', /single repair requires every raw blocker accepted and reproduced/],
      ]) {
        const convergence = await run(baseline, ['--case', testCase], CONVERGENCE_HARNESS);
        requirePass(`convergence baseline ${testCase}`, convergence, proof);
      }
    } finally { removeOwnedRoot(baseline); }

    const results = await runPool(REGRESSIONS, jobs, async ([, args, , apply, harness = HARNESS], index) => {
      const root = createOwnedRoot(`regression-${index}`);
      try {
        copyRoot(snapshot, root);
        apply(root);
        const extraEnv = harness === ORCHESTRATION_HARNESS ? { [ORCHESTRATION_ORACLE_ENV]: '1' } : {};
        return await run(root, args, harness, extraEnv);
      } finally { removeOwnedRoot(root); }
    });
    if (runtime.signal !== null) return;
    for (let index = 0; index < REGRESSIONS.length; index += 1) {
      const [label, , pattern] = REGRESSIONS[index]; const settled = results[index];
      if (settled.status === 'rejected') throw new Error(`${label}: ${settled.reason?.stack || settled.reason}`);
      const result = settled.value;
      assert.equal(result.error, null, `${label}: ${result.error?.message}`); assert.equal(result.signal, null, `${label}: signal ${result.signal}`);
      assert.notEqual(result.status, 0, `${label}: variant copied artifact unexpectedly passed`);
      assert.match(`${result.stdout}\n${result.stderr}`, pattern, `${label}: independent failure oracle did not fire`);
      console.log(`regression fixture detected: ${label}`);
    }
  } finally { removeOwnedRoot(snapshot); }
  console.log('plan-review-policy regressions passed');
}

const signalHandlers = new Map(['SIGINT', 'SIGTERM'].map((signal) => [signal, () => requestInterruption(signal)]));
for (const [signal, handler] of signalHandlers) process.on(signal, handler);
let failure = null;
try {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === 'scheduler') await testScheduler(options.jobs);
  else if (options.mode === 'namespace') await runNamespaceIsolationFixture();
  else if (options.mode === 'interrupt') await runInterruptionFixture();
  else if (options.mode === 'orchestration') await runOrchestrationOracle();
  else await runRegressionSuite(options.jobs);
} catch (error) {
  failure = error;
} finally {
  await awaitActiveChildren();
  for (const root of [...runtime.ownedRoots]) removeOwnedRoot(root);
  for (const [signal, handler] of signalHandlers) process.off(signal, handler);
}
if (runtime.signal !== null) { process.kill(process.pid, runtime.signal); await new Promise(() => {}); }
if (failure !== null) { console.error(failure.stack || failure.message); process.exitCode = 1; }
