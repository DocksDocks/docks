#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { PLUGINS } from '../lib/plugins.mjs';
import {
  parseReleaseTag,
  releaseCiArgs,
  resolveCiTargets,
  selectedAuthorChecks,
  workflowCiSelection,
} from '../lib/ci-targeting.mjs';
import { startNodeTask } from '../lib/ci-background-task.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const mode = args[0] ?? null;
const validInvocation = args.length === 0
  || (args.length === 1 && ['--unit', '--background-output', '--dry-run-release-safety', '--timing-write-failure'].includes(mode))
  || (args.length === 2 && mode === '--validate-docks-timings');
if (!validInvocation) {
  throw new Error('usage: ci-plugin-targeting.mjs [--unit|--background-output|--dry-run-release-safety|--timing-write-failure|--validate-docks-timings <path>]');
}
const unitOnly = mode === '--unit';

function validateTimingReport(timingPath, plugin, taskNames) {
  const timing = JSON.parse(fs.readFileSync(timingPath, 'utf8'));
  assert.deepEqual(Object.keys(timing), ['schema', 'mode', 'status', 'total_ms', 'phases', 'tasks']);
  assert.equal(timing.schema, 1);
  assert.deepEqual(timing.mode, { plugin });
  assert.equal(timing.status, 'passed');
  assert.ok(Number.isInteger(timing.total_ms) && timing.total_ms >= 0);
  assert.ok(timing.phases.length > 0);
  for (const row of [...timing.phases, ...timing.tasks]) {
    assert.deepEqual(Object.keys(row), ['name', 'duration_ms', 'status']);
    assert.equal(typeof row.name, 'string');
    assert.ok(Number.isInteger(row.duration_ms) && row.duration_ms >= 0);
    assert.ok(['passed', 'failed'].includes(row.status));
  }
  assert.deepEqual(timing.tasks.map((task) => task.name), taskNames);
  assert.ok(timing.tasks.every((task) => task.status === 'passed'));
}

async function testBackgroundOutputRetention() {
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-ci-background-output-'));
  const tasks = [];
  const errorStream = new PassThrough();
  let diagnostic = '';
  errorStream.setEncoding('utf8');
  errorStream.on('data', (chunk) => { diagnostic += chunk; });
  try {
    const script = "process.stdout.write('retained-prefix\\n'); process.stdout.write('x'.repeat(1024 * 1024 + 4096), () => process.exit(1));";
    const passed = await startNodeTask('large failing task', ['-e', script], { cwd: ROOT, tasks, errorStream, artifactRoot });
    assert.equal(passed, false);
    assert.deepEqual(tasks.map(({ name, status }) => ({ name, status })), [{ name: 'large failing task', status: 'failed' }]);
    const artifacts = fs.readdirSync(artifactRoot);
    assert.equal(artifacts.length, 1);
    const outputDirectory = path.join(artifactRoot, artifacts[0]);
    const stdoutPath = path.join(outputDirectory, 'stdout.log');
    const stderrPath = path.join(outputDirectory, 'stderr.log');
    const stdout = fs.readFileSync(stdoutPath);
    assert.equal(stdout.subarray(0, 'retained-prefix\n'.length).toString(), 'retained-prefix\n');
    assert.ok(stdout.length > 1024 * 1024);
    assert.equal(fs.statSync(stdoutPath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(stderrPath).mode & 0o777, 0o600);
    assert.match(diagnostic, new RegExp(`stdout=${stdoutPath.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`));
    assert.match(diagnostic, new RegExp(`stderr=${stderrPath.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`));
  } finally {
    fs.rmSync(artifactRoot, { recursive: true, force: true });
  }
}

function gitSnapshot() {
  const run = (gitArgs) => {
    const result = spawnSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const manifests = [
    'plugins/docks/.claude-plugin/plugin.json',
    'plugins/docks/.codex-plugin/plugin.json',
    '.claude-plugin/marketplace.json',
  ];
  return {
    status: run(['status', '--porcelain=v1', '--untracked-files=all']),
    refs: run(['show-ref']),
    manifests: manifests.map((file) => fs.readFileSync(path.join(ROOT, file), 'base64')),
  };
}


function writeReleaseShim(directory, name) {
  const script = `#!${process.execPath}
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const tool = ${JSON.stringify(name)};
const args = process.argv.slice(2);
fs.appendFileSync(process.env.DOCKS_RELEASE_CALL_LOG, JSON.stringify({ tool, args }) + '\\n');
if (tool === 'node') {
  const child = spawnSync(process.env.DOCKS_RELEASE_REAL_NODE, args, {
    stdio: 'inherit',
    env: { ...process.env, PATH: process.env.DOCKS_RELEASE_REAL_PATH },
  });
  process.exit(child.status ?? 1);
}
process.exit(97);
`;
  fs.writeFileSync(path.join(directory, name), script, { mode: 0o755 });
}

function testDryRunReleaseSafety() {
  const before = gitSnapshot();
  assert.equal(before.status, '', 'dry-run safety requires a clean checkout');
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-release-dry-run-'));
  const shimDir = path.join(fixtureRoot, 'bin');
  const callLog = path.join(fixtureRoot, 'calls.jsonl');
  fs.mkdirSync(shimDir, { mode: 0o700 });
  fs.writeFileSync(callLog, '', { mode: 0o600 });
  try {
    for (const name of ['node', 'git', 'claude', 'gh']) writeReleaseShim(shimDir, name);
    const result = spawnSync(process.execPath, ['scripts/release.mjs', '--dry-run', '--plugin', 'docks', 'patch'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 600_000,
      env: {
        ...process.env,
        PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ''}`,
        DOCKS_RELEASE_CALL_LOG: callLog,
        DOCKS_RELEASE_REAL_NODE: process.execPath,
        DOCKS_RELEASE_REAL_PATH: process.env.PATH ?? '',
      },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /\[dry-run\] git push origin HEAD/);
    assert.match(result.stdout, /\[dry-run\] claude plugin tag --push/);
    assert.match(result.stdout, /\[dry-run\] wait for tag-CI .* gh release create/);
    assert.match(result.stdout, /\[dry-run\] OK — no changes written, no tag, no release/);
    const calls = fs.readFileSync(callLog, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    assert.ok(calls.some(({ tool, args: callArgs }) => tool === 'node'
      && callArgs[0] === path.join(ROOT, 'scripts/ci.mjs')
      && callArgs.slice(1).join(' ') === '-q --plugin docks'), 'fixture must intercept and preserve the targeted Docks preflight');
    assert.equal(calls.some(({ tool, args: callArgs }) => tool === 'git' && callArgs[0] === 'push'), false, 'dry-run must not invoke git push');
    assert.equal(calls.some(({ tool, args: callArgs }) => tool === 'claude' && callArgs[0] === 'plugin' && callArgs[1] === 'tag'), false, 'dry-run must not invoke claude plugin tag');
    assert.equal(calls.some(({ tool, args: callArgs }) => tool === 'gh' && callArgs[0] === 'release' && callArgs[1] === 'create'), false, 'dry-run must not invoke gh release create');
    assert.deepEqual(gitSnapshot(), before);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function testTimingWriteFailure() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-timing-write-'));
  const worktree = path.join(fixtureRoot, 'worktree');
  let worktreeAdded = false;
  const runCi = (cwd, timingPath) => spawnSync(process.execPath, ['scripts/ci.mjs', '--plugin', 'effect-kit', '--timings-json', timingPath], {
    cwd,
    encoding: 'utf8',
    timeout: 600_000,
  });
  try {
    const passedTiming = path.join(fixtureRoot, 'missing-passed', 'timings.json');
    const passed = runCi(ROOT, passedTiming);
    assert.equal(passed.status, 0, `${passed.stdout}\n${passed.stderr}`);
    assert.match(passed.stderr, /cannot write timing report/);
    assert.equal(fs.existsSync(passedTiming), false, 'failed timing output must not leave a report');

    const added = spawnSync('git', ['worktree', 'add', '--detach', worktree, 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(added.status, 0, added.stderr);
    worktreeAdded = true;
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(worktree, 'node_modules'), 'dir');
    fs.copyFileSync(path.join(ROOT, 'scripts/ci.mjs'), path.join(worktree, 'scripts/ci.mjs'));
    const manifestPath = path.join(worktree, 'plugins/effect-kit/.claude-plugin/plugin.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.version = '0.0.0';
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const failedTiming = path.join(fixtureRoot, 'missing-failed', 'timings.json');
    const failed = runCi(worktree, failedTiming);
    assert.equal(failed.status, 1, `${failed.stdout}\n${failed.stderr}`);
    assert.match(failed.stderr, /cannot write timing report/);
    assert.match(failed.stdout, /check\(s\) failed/);
    assert.equal(fs.existsSync(failedTiming), false, 'failed timing output must not leave stale evidence');
  } finally {
    if (worktreeAdded) {
      const removed = spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(removed.status, 0, removed.stderr);
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

if (mode === '--validate-docks-timings') {
  validateTimingReport(path.resolve(args[1]), 'docks', ['plan-review-policy regressions']);
  console.log('Docks timing report and single background join passed');
  process.exit(0);
}
if (mode === '--background-output') {
  await testBackgroundOutputRetention();
  console.log('background failure output retention passed');
  process.exit(0);
}
if (mode === '--dry-run-release-safety') {
  testDryRunReleaseSafety();
  console.log('Docks release dry-run left repository bytes and refs unchanged');
  process.exit(0);
}
if (mode === '--timing-write-failure') {
  testTimingWriteFailure();
  console.log('timing write failures preserve the underlying CI result');
  process.exit(0);
}
const names = (rows) => rows.map((row) => row.name);
const byName = (name) => PLUGINS.find((plugin) => plugin.name === name);

assert.deepEqual(names(resolveCiTargets(PLUGINS, null)), ['docks', 'session-relay', 'effect-kit']);
assert.deepEqual(names(resolveCiTargets(PLUGINS, 'docks')), ['docks']);
assert.throws(() => resolveCiTargets(PLUGINS, 'unknown-plugin'), /unknown plugin.*docks, session-relay, effect-kit/);
assert.deepEqual([...selectedAuthorChecks([byName('docks')])], ['idempotency', 'scaffold', 'plan-review']);
assert.deepEqual([...selectedAuthorChecks([byName('effect-kit')])], []);
assert.deepEqual(releaseCiArgs('docks'), ['-q', '--plugin', 'docks']);
console.log('registry targeting and author-check selection passed');

assert.deepEqual(parseReleaseTag('docks--v0.12.8'), { plugin: 'docks', version: '0.12.8', needsRust: false });
assert.deepEqual(parseReleaseTag('session-relay--v11.2.0'), { plugin: 'session-relay', version: '11.2.0', needsRust: true });
for (const invalid of [
  'docks--v01.2.3', 'docks--v1.02.3', 'docks--v1.2.03', 'docks--v1.2',
  'unknown--v1.2.3', 'docks--v1.2.3;echo-owned', 'refs/tags/docks--v1.2.3',
]) assert.throws(() => parseReleaseTag(invalid), /invalid release tag|unknown plugin/);
assert.deepEqual(workflowCiSelection('pull_request', ''), { mode: 'full', plugin: null, needsRust: true });
assert.deepEqual(workflowCiSelection('workflow_dispatch', ''), { mode: 'full', plugin: null, needsRust: true });
assert.deepEqual(workflowCiSelection('push', 'effect-kit--v0.3.1'), { mode: 'targeted', plugin: 'effect-kit', needsRust: false });
assert.throws(() => workflowCiSelection('push', 'bad-tag'), /invalid release tag/);
assert.throws(() => workflowCiSelection('schedule', ''), /unsupported workflow event/);
console.log('release tag and workflow selection passed');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-ci-targeting-'));
try {
  const githubOutput = path.join(tmp, 'github-output');
  const cli = spawnSync('node', ['scripts/ci-target.mjs', 'release-tag', 'session-relay--v0.11.2', '--github-output', githubOutput], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout, '');
  assert.equal(fs.readFileSync(githubOutput, 'utf8'), 'mode=targeted\nplugin=session-relay\nneeds_rust=true\n');

  const malformed = spawnSync('node', ['scripts/ci-target.mjs', 'release-tag', 'docks--v1.2.3;echo-owned'], { cwd: ROOT, encoding: 'utf8' });
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /invalid release tag/);
  console.log('release tag resolver CLI passed');

  if (!unitOnly) {
    const timingPath = path.join(tmp, 'effect-kit-timings.json');
    const targeted = spawnSync('node', ['scripts/ci.mjs', '--plugin', 'effect-kit', '--timings-json', timingPath], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
    assert.equal(targeted.status, 0, `${targeted.stdout}\n${targeted.stderr}`);
    assert.doesNotMatch(targeted.stdout, /skill-maintainer idempotency|plan review policy|plugin: docks|plugin: session-relay/);
    assert.match(targeted.stdout, /plugin: effect-kit/);
    validateTimingReport(timingPath, 'effect-kit', []);
    console.log('targeted CI timing report passed');
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

const workflowText = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const workflow = parseDocument(workflowText, { prettyErrors: true, strict: true, uniqueKeys: true });
assert.equal(workflow.errors.length, 0);
const steps = workflow.toJS().jobs.validate.steps;
const step = (name) => steps.find((row) => row.name?.startsWith(name));
assert.equal(step('resolve CI target').if, "github.event_name == 'push'");
assert.match(step('resolve CI target').run, /scripts\/ci-target\.mjs release-tag/);
assert.equal(step('provision Rust 1.85.0 with musl for the session-relay host leg').if, "github.event_name != 'push' || steps.target.outputs.needs_rust == 'true'");
assert.match(step('run the authoritative gate').run, /if \[ "\$\{\{ github\.event_name \}\}" = "push" \]/);
assert.match(step('run the authoritative gate').run, /node scripts\/ci\.mjs --plugin "\$\{\{ steps\.target\.outputs\.plugin \}\}"/);
assert.match(step('run the authoritative gate').run, /node scripts\/ci\.mjs$/m);
const setupNode = steps.find((row) => typeof row.uses === 'string' && row.uses.startsWith('actions/setup-node@'));
assert.ok(setupNode);
assert.equal(setupNode.with['node-version'], '24');
assert.ok(steps.indexOf(step('resolve CI target')) < steps.indexOf(step('cache pnpm store')));
const pnpmCache = step('cache pnpm store');
assert.match(pnpmCache.uses, /^actions\/cache@[0-9a-f]{40}$/);
assert.equal(pnpmCache.with.path, '~/.pnpm-store');
assert.match(pnpmCache.with.key, /runner\.os.*runner\.arch.*hashFiles\('pnpm-lock\.yaml', 'package\.json'\)/);
assert.match(pnpmCache.with['restore-keys'], /pnpm-v11-.*runner\.os.*runner\.arch/);
const cargoCache = step('cache Cargo dependencies and target outputs');
assert.match(cargoCache.uses, /^actions\/cache@[0-9a-f]{40}$/);
assert.equal(cargoCache.if, "github.event_name != 'push' || steps.target.outputs.needs_rust == 'true'");
assert.match(cargoCache.with.key, /runner\.os.*runner\.arch.*Cargo\.lock.*rust-toolchain\.toml.*src\/\*\*\/\*\.rs/);
assert.match(cargoCache.with['restore-keys'], /Cargo\.lock.*rust-toolchain\.toml/);
console.log('workflow targeting and dependency cache contract passed');
