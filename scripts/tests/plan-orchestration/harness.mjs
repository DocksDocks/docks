import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export class FocusedSuite {
  #cases = [];

  test(group, name, run) {
    assert.equal(typeof group, 'string');
    assert.equal(typeof name, 'string');
    assert.equal(typeof run, 'function');
    this.#cases.push({ group, name, run });
  }

  groups() {
    return [...new Set(this.#cases.map(({ group }) => group))].sort();
  }

  count(groups = null) {
    return this.#selected(groups).length;
  }

  async run(groups = null) {
    const selected = this.#selected(groups);
    const failures = [];
    for (const testCase of selected) {
      try {
        await testCase.run();
        process.stdout.write(`ok - ${testCase.group}: ${testCase.name}\n`);
      } catch (error) {
        failures.push({ testCase, error });
        process.stderr.write(`not ok - ${testCase.group}: ${testCase.name}\n`);
        process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`${failures.length} of ${selected.length} plan-orchestration cases failed`);
    }
    return selected.length;
  }

  #selected(groups) {
    if (groups === null) return this.#cases;
    const wanted = new Set(groups);
    return this.#cases.filter(({ group }) => wanted.has(group));
  }
}

export function clone(value) {
  return structuredClone(value);
}

export function expectReject(operation, pattern, message = 'operation must reject') {
  return assert.rejects(Promise.resolve().then(operation), pattern, message);
}

export function expectThrow(operation, pattern, message = 'operation must reject') {
  return assert.throws(operation, pattern, message);
}

export function withTempDirectory(prefix, operation) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const finish = () => fs.rmSync(root, { recursive: true, force: true });
  try {
    const result = operation(root);
    if (result && typeof result.then === 'function') return result.finally(finish);
    finish();
    return result;
  } catch (error) {
    finish();
    throw error;
  }
}

export function git(repo, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_COUNT: '0',
      GIT_CONFIG_GLOBAL: os.devNull,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_SYSTEM: os.devNull,
    },
    shell: false,
  });
  assert.equal(result.error, undefined, `git ${args.join(' ')} failed to start`);
  assert.equal(result.signal, null, `git ${args.join(' ')} was signalled`);
  if (!allowFailure) assert.equal(result.status, 0, result.stderr || `git ${args.join(' ')} failed`);
  return { ...result, stdout: result.stdout.trimEnd() };
}

export function initializeRepository(repo) {
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.email', 'plan-orchestration@example.invalid']);
  git(repo, ['config', 'user.name', 'Plan Orchestration Fixture']);
  fs.writeFileSync(path.join(repo, 'tracked.txt'), 'base\n');
  git(repo, ['add', 'tracked.txt']);
  git(repo, ['commit', '-qm', 'fixture base']);
  return git(repo, ['rev-parse', 'HEAD']).stdout;
}

export function writeFile(repo, logical, content) {
  const absolute = path.join(repo, logical);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
  return absolute;
}
