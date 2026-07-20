#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BIOME = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'biome.cmd' : 'biome');
const VALIDATE_SKILLS = path.join(ROOT, 'scripts/lib/validate-skills.mjs');
const TREE_GUARD = path.join(ROOT, 'scripts/tree/guard.mjs');
const SKILLS_GUARD = path.join(ROOT, 'scripts/skills/guard.mjs');

function runNode(script, args, options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    ...options,
  });
}

function assertStarted(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
}

function testBiomeRejectsSyntaxDefect() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-author-tooling-biome-'));
  const fixture = path.join(fixtureRoot, 'broken-syntax.mjs');
  try {
    fs.writeFileSync(fixture, 'const broken = ;\n');
    const result = spawnSync(BIOME, ['lint', fixture], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 30_000,
    });
    assertStarted(result);
    assert.notEqual(result.status, 0);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, /broken-syntax\.mjs/);
    assert.match(output, /expected an expression/i);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function testCombinedSkillValidation() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-author-tooling-skills-'));
  try {
    const validRoot = path.join(fixtureRoot, 'valid');
    const validSkill = path.join(validRoot, 'valid-skill');
    fs.mkdirSync(validSkill, { recursive: true });
    fs.writeFileSync(
      path.join(validSkill, 'SKILL.md'),
      [
        '---',
        'name: valid-skill',
        'description: Use when verifying the combined validator fixture.',
        'user-invocable: false',
        'metadata:',
        '  updated: "2026-07-20"',
        '---',
        '# Valid skill',
        '',
      ].join('\n'),
    );
    const valid = runNode(VALIDATE_SKILLS, ['--runtime', 'all', validRoot]);
    assertStarted(valid);
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(valid.stdout, 'Guard PASSED: 1 skill(s) match Codex and Claude skill frontmatter expectations\n');

    const malformedRoot = path.join(fixtureRoot, 'malformed');
    const malformedSkill = path.join(malformedRoot, 'malformed-skill');
    const malformedFile = path.join(malformedSkill, 'SKILL.md');
    fs.mkdirSync(malformedSkill, { recursive: true });
    fs.writeFileSync(malformedFile, '---\nname: [\n---\n# Malformed\n');
    const malformed = runNode(VALIDATE_SKILLS, ['--runtime', 'all', malformedRoot]);
    assertStarted(malformed);
    assert.equal(malformed.status, 1);
    assert.match(malformed.stderr, new RegExp(`FAIL: .*${path.basename(malformedFile)}: invalid YAML frontmatter:`));
    assert.match(malformed.stderr, /Guard FAILED: 1 skill file\(s\) failed Codex and Claude compatibility\n$/);

    const emptyRoot = path.join(fixtureRoot, 'empty');
    fs.mkdirSync(emptyRoot);
    const empty = runNode(VALIDATE_SKILLS, ['--runtime', 'all', emptyRoot]);
    assertStarted(empty);
    assert.equal(empty.status, 1);
    assert.equal(empty.stderr, `Guard FAILED: no SKILL.md files found under ${emptyRoot}\n`);

    const missingRoot = path.join(fixtureRoot, 'missing');
    const missing = runNode(VALIDATE_SKILLS, ['--runtime', 'all', missingRoot]);
    assertStarted(missing);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, new RegExp(`^FAIL: cannot read skills directory ${missingRoot}: .*ENOENT`));
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function testTreeGuardOperationalFailures() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-author-tooling-tree-'));
  try {
    const missingRoot = path.join(fixtureRoot, 'missing');
    const missing = runNode(TREE_GUARD, [missingRoot]);
    assertStarted(missing);
    assert.equal(missing.status, 2);
    assert.equal(missing.stderr, `FAIL: tree root not found or unreadable: ${missingRoot}\n`);

    const unreadableRoot = path.join(fixtureRoot, 'unreadable-file');
    const agents = path.join(unreadableRoot, 'AGENTS.md');
    fs.mkdirSync(unreadableRoot);
    fs.writeFileSync(agents, '# Fixture\n');
    fs.writeFileSync(path.join(unreadableRoot, 'CLAUDE.md'), '@AGENTS.md\n');
    fs.chmodSync(agents, 0);
    let unreadable;
    try {
      unreadable = runNode(TREE_GUARD, [unreadableRoot]);
    } finally {
      fs.chmodSync(agents, 0o600);
    }
    assertStarted(unreadable);
    assert.equal(unreadable.status, 2);
    assert.match(unreadable.stderr, new RegExp(`^FAIL: cannot read tree file ${agents}: `));
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function testSkillsGuardSpawnFailure() {
  const target = path.join(ROOT, 'plugins/docks/skills');
  const result = runNode(SKILLS_GUARD, [target], { env: { ...process.env, PATH: '' } });
  assertStarted(result);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    new RegExp(
      `^FAIL: node ${path.join(ROOT, 'scripts/lib/validate-skills.mjs')} --runtime all ${target} could not start: .*ENOENT`,
    ),
  );
}

testBiomeRejectsSyntaxDefect();
testCombinedSkillValidation();
testTreeGuardOperationalFailures();
testSkillsGuardSpawnFailure();
console.log('author tooling contracts passed');
