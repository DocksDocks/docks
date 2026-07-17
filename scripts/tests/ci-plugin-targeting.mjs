#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--unit')) throw new Error('usage: ci-plugin-targeting.mjs [--unit]');
const unitOnly = args[0] === '--unit';
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
    const timing = JSON.parse(fs.readFileSync(timingPath, 'utf8'));
    assert.deepEqual(Object.keys(timing), ['schema', 'mode', 'status', 'total_ms', 'phases', 'tasks']);
    assert.equal(timing.schema, 1);
    assert.deepEqual(timing.mode, { plugin: 'effect-kit' });
    assert.equal(timing.status, 'passed');
    assert.ok(Number.isInteger(timing.total_ms) && timing.total_ms >= 0);
    assert.ok(timing.phases.length > 0);
    for (const row of [...timing.phases, ...timing.tasks]) {
      assert.deepEqual(Object.keys(row), ['name', 'duration_ms', 'status']);
      assert.equal(typeof row.name, 'string');
      assert.ok(Number.isInteger(row.duration_ms) && row.duration_ms >= 0);
      assert.ok(['passed', 'failed'].includes(row.status));
    }
    assert.equal(timing.tasks.length, 0);
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
