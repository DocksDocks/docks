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

    // A lone AGENTS.md is a complete node; any legacy CLAUDE.md fails the guard.
    const nodeRoot = path.join(fixtureRoot, 'node');
    fs.mkdirSync(path.join(nodeRoot, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(nodeRoot, 'AGENTS.md'), '# Fixture\n');
    const lone = runNode(TREE_GUARD, [nodeRoot]);
    assertStarted(lone);
    assert.equal(lone.status, 0, lone.stderr);
    fs.writeFileSync(path.join(nodeRoot, '.claude', 'CLAUDE.md'), '@../AGENTS.md\n');
    const legacy = runNode(TREE_GUARD, [nodeRoot]);
    assertStarted(legacy);
    assert.equal(legacy.status, 1);
    assert.match(
      legacy.stderr,
      /^FAIL: \.claude\/CLAUDE\.md — legacy CLAUDE\.md: keep one home for instructions \(a CLAUDE\.md without an @AGENTS\.md import makes Claude read it instead of AGENTS\.md\)/,
    );

    // The root routing table must name every nested node, and every row must resolve.
    const routeRoot = path.join(fixtureRoot, 'route');
    fs.mkdirSync(path.join(routeRoot, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(routeRoot, 'sub', 'AGENTS.md'), '# Sub\n');
    fs.writeFileSync(path.join(routeRoot, 'AGENTS.md'), '# Root\n');
    const unrouted = runNode(TREE_GUARD, [routeRoot]);
    assertStarted(unrouted);
    assert.equal(unrouted.status, 1);
    assert.match(unrouted.stderr, /^FAIL: sub\/AGENTS\.md — node not routed/m);
    fs.writeFileSync(path.join(routeRoot, 'AGENTS.md'), '| Node |\n|---|\n| `sub/AGENTS.md` |\n| `gone/AGENTS.md` |\n');
    const dead = runNode(TREE_GUARD, [routeRoot]);
    assertStarted(dead);
    assert.equal(dead.status, 1);
    assert.match(dead.stderr, /^FAIL: AGENTS\.md table row `gone\/AGENTS\.md` — dead route/m);
    assert.doesNotMatch(dead.stderr, /not routed/);
    // A first cell `@<dir>/AGENTS.md` routes the same node; the leading `@` is stripped.
    fs.writeFileSync(path.join(routeRoot, 'AGENTS.md'), '| Node |\n|---|\n| `@sub/AGENTS.md` |\n');
    const atRouted = runNode(TREE_GUARD, [routeRoot]);
    assertStarted(atRouted);
    assert.equal(atRouted.status, 0, atRouted.stderr);

    // A backticked pointer whose first segment is a top-level dir must resolve from the
    // node's folder or the repo root; other slash tokens are not pointers.
    const pointerRoot = path.join(fixtureRoot, 'pointer');
    fs.mkdirSync(path.join(pointerRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(pointerRoot, 'AGENTS.md'), '| `docs/AGENTS.md` |\n');
    fs.writeFileSync(path.join(pointerRoot, 'docs', 'AGENTS.md'), 'See `docs/guide.md`, and `npm/scope`.\n');
    const deadPointer = runNode(TREE_GUARD, [pointerRoot]);
    assertStarted(deadPointer);
    assert.equal(deadPointer.status, 1);
    assert.match(deadPointer.stderr, /^FAIL: docs\/AGENTS\.md — dead pointer `docs\/guide\.md`$/m);
    assert.doesNotMatch(deadPointer.stderr, /npm\/scope/);
    fs.mkdirSync(path.join(pointerRoot, 'docs', 'docs'));
    fs.writeFileSync(path.join(pointerRoot, 'docs', 'docs', 'guide.md'), '# Guide\n');
    const nodeRelative = runNode(TREE_GUARD, [pointerRoot]);
    assertStarted(nodeRelative);
    assert.equal(nodeRelative.status, 0, nodeRelative.stderr);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

// scripts/AGENTS.md validator table: every validator script has a row, every row resolves.
// lib/ holds shared modules (a lib validator may still have a row); tests/unit/ runs as one
// suite; the allowlist names entry points that are not validators.
const NON_VALIDATOR_SCRIPTS = new Set(['release.mjs', 'ci-target.mjs', 'capture-tdd-red.mjs']);

function validatorTableErrors(root) {
  const scriptsDir = path.join(root, 'scripts');
  const rows = new Set();
  for (const line of fs.readFileSync(path.join(scriptsDir, 'AGENTS.md'), 'utf8').split('\n')) {
    const first = line.match(/^\|\s*`([^`\s]+\.mjs)`\s*\|/);
    if (first) rows.add(first[1]);
  }
  const onDisk = [];
  (function walkScripts(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = path.relative(scriptsDir, full).split(path.sep).join('/');
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && rel !== 'lib' && rel !== 'tests/unit') walkScripts(full);
      } else if (e.isFile() && e.name.endsWith('.mjs') && !NON_VALIDATOR_SCRIPTS.has(rel)) onDisk.push(rel);
    }
  })(scriptsDir);
  const errors = [];
  for (const rel of onDisk.sort())
    if (!rows.has(rel)) errors.push(`scripts/${rel} — script missing from the scripts/AGENTS.md validator table`);
  for (const rel of rows)
    if (!fs.existsSync(path.join(scriptsDir, rel)) && !fs.existsSync(path.join(root, rel)))
      errors.push(`scripts/AGENTS.md table row \`${rel}\` — dead row (script missing)`);
  return errors;
}

function testValidatorTable() {
  // Fixture: the check reports an unlisted script and a dead row.
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-author-tooling-table-'));
  try {
    fs.mkdirSync(path.join(fixtureRoot, 'scripts', 'tree'), { recursive: true });
    fs.writeFileSync(
      path.join(fixtureRoot, 'scripts', 'AGENTS.md'),
      '| Script |\n|---|\n| `ci.mjs` |\n| `gone.mjs` |\n',
    );
    fs.writeFileSync(path.join(fixtureRoot, 'scripts', 'ci.mjs'), '');
    fs.writeFileSync(path.join(fixtureRoot, 'scripts', 'tree', 'guard.mjs'), '');
    assert.deepEqual(validatorTableErrors(fixtureRoot), [
      'scripts/tree/guard.mjs — script missing from the scripts/AGENTS.md validator table',
      'scripts/AGENTS.md table row `gone.mjs` — dead row (script missing)',
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
  // This repository: the table must match scripts on disk.
  const errors = validatorTableErrors(ROOT);
  assert.equal(errors.length, 0, `scripts/AGENTS.md validator table is out of date:\n${errors.join('\n')}`);
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
testValidatorTable();
console.log('author tooling contracts passed');
