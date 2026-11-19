#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shebangInterpreter } from './test-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BIOME = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'biome.cmd' : 'biome');
const VALIDATE_SKILLS = path.join(ROOT, 'scripts/lib/validate-skills.mjs');
const TREE_GUARD = path.join(ROOT, 'scripts/tree/guard.mjs');
const SKILLS_GUARD = path.join(ROOT, 'scripts/skills/guard.mjs');
const TEST_CONTRACTS = path.join(ROOT, 'scripts/tests/test-contracts.mjs');
const REPORT_SECTION = path.join(ROOT, 'scripts/config/report-section.md');
const SKILL_GUARD = path.join(ROOT, 'plugins/docks/skills/write-skill/scripts/skill-guard.mjs');
const AGENTS_GUARD = path.join(ROOT, 'scripts/agents/guard.mjs');

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

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
// suite, and the tests/plan-cli/ case files run as one suite through the tests/plan-cli.mjs row;
// the allowlist names entry points that are not validators.
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
        if (e.name !== 'node_modules' && rel !== 'lib' && rel !== 'tests/unit' && rel !== 'tests/plan-cli')
          walkScripts(full);
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
      `^FAIL: bun ${path.join(ROOT, 'scripts/lib/validate-skills.mjs')} --runtime all ${target} could not start: ENOENT \\(`,
    ),
  );
}

function runTestContracts(fixtureRoot, name, registry) {
  const file = path.join(fixtureRoot, name);
  fs.writeFileSync(file, `${JSON.stringify(registry, null, 2)}\n`);
  return runNode(TEST_CONTRACTS, ['--registry', file]);
}

// The registry check must reject a row that does not list a toolchain that its suite needs, and a row that lists a
// toolchain that nothing needs. Each negative case changes one row in a copy of the registry.
function testTestContractToolchains() {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/config/test-contracts.json'), 'utf8'));
  const passed = runNode(TEST_CONTRACTS, []);
  assertStarted(passed);
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /^PASS test_contracts /);

  // The plan CLI suite runs with Node, and its cases run the fake gh, which runs with Bun.
  const planCli = registry.contracts.find(({ id }) => id === 'repo-plan-cli');
  assert.ok(planCli, 'the registry must hold the repo-plan-cli row');
  const bunToken = planCli.toolchains.find((token) => token.startsWith('bun-'));
  const nodeToken = planCli.toolchains.find((token) => token.startsWith('node-'));
  assert.ok(bunToken && nodeToken, `repo-plan-cli must list a Bun and a Node toolchain: ${planCli.toolchains}`);
  const bunOnly = registry.contracts.find(({ toolchains }) => toolchains.length === 1 && toolchains[0] === bunToken);
  assert.ok(bunOnly, `the registry must hold a row that lists only ${bunToken}`);

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-author-tooling-contracts-'));
  try {
    const lacksBun = structuredClone(registry);
    const lacksBunRow = lacksBun.contracts.find(({ id }) => id === planCli.id);
    lacksBunRow.toolchains = lacksBunRow.toolchains.filter((token) => token !== bunToken);
    const missing = runTestContracts(fixtureRoot, 'lacks-bun.json', lacksBun);
    assertStarted(missing);
    assert.notEqual(missing.status, 0);
    assert.match(
      `${missing.stdout}\n${missing.stderr}`,
      new RegExp(
        `repo-plan-cli\\.toolchains must list ${escapeRegExp(bunToken)}: .*scripts/tests/fixtures/gh-stub/gh runs with bun`,
      ),
    );

    const listsNode = structuredClone(registry);
    const listsNodeRow = listsNode.contracts.find(({ id }) => id === bunOnly.id);
    listsNodeRow.toolchains = [bunToken, nodeToken].sort();
    const extra = runTestContracts(fixtureRoot, 'lists-node.json', listsNode);
    assertStarted(extra);
    assert.notEqual(extra.status, 0);
    // The line names the runners that discovery found, so that the reader sees why the row does not need the token.
    const runnerEvidence = `\\(discovered: [^\\n]*\\b${escapeRegExp(bunOnly.owner.suite)} with bun\\b[^\\n]*\\)`;
    assert.match(
      `${extra.stdout}\n${extra.stderr}`,
      new RegExp(
        `${escapeRegExp(bunOnly.id)}\\.toolchains lists ${escapeRegExp(nodeToken)}, which no discovered runner needs ${runnerEvidence}`,
      ),
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

// A fixture program runs with the interpreter of its #! line, and that interpreter decides which toolchain a suite
// needs. `env` reads its options, their operands, and NAME=VALUE words before the interpreter, so none of them is it.
function testShebangInterpreter() {
  const cases = [
    ['#!/usr/bin/env bun\n', 'bun'],
    ['#!/usr/local/bin/bun\n', 'bun'],
    ['#!/usr/bin/env -S -u NODE_OPTIONS bun\n', 'bun'],
    ['#!/usr/bin/env -S -uNODE_OPTIONS bun --smol\n', 'bun'],
    ['#!/usr/bin/env --split-string=-u NODE_OPTIONS bun\n', 'bun'],
    ['#!/usr/bin/env --unset=NODE_OPTIONS node\n', 'node'],
    ['#!/usr/bin/env --unset NODE_OPTIONS node\n', 'node'],
    ['#!/usr/bin/env -i FORCE_COLOR=0 node\n', 'node'],
    ['#!/usr/bin/env - --ignore-environment node\n', 'node'],
    ['#!/usr/bin/env -iu NODE_OPTIONS /opt/bun/bin/bun\n', 'bun'],
    ['#!/usr/bin/env -S -- FORCE_COLOR=0 bun\n', 'bun'],
    ['#!/usr/bin/env -- bun\n', 'bun'],
    ['#!/usr/bin/env -S -u NODE_OPTIONS\n', ''],
    ['#!\n', ''],
    ['console.log(1);\n', null],
  ];
  for (const [source, interpreter] of cases) {
    assert.equal(shebangInterpreter(source), interpreter, `interpreter of ${JSON.stringify(source)}`);
  }
}

// Every docks skill must end with the canonical Report section. The cases change a full copy of the docks skills: the
// copy passes the sub-guards that run before the Report check, so that each run gets to that check.
function testSkillsGuardReportSection() {
  const canonical = fs.readFileSync(REPORT_SECTION, 'utf8');
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-author-tooling-report-'));
  try {
    const skillsRoot = path.join(fixtureRoot, 'skills');
    fs.cpSync(path.join(ROOT, 'plugins/docks/skills'), skillsRoot, { recursive: true });
    const skillFiles = fs
      .readdirSync(skillsRoot, { recursive: true })
      .filter((relative) => path.basename(relative) === 'SKILL.md')
      .sort();
    assert.ok(skillFiles.length >= 2, `the fixture needs two skills, found ${skillFiles.length}`);
    const originals = new Map(
      skillFiles.map((relative) => [relative, fs.readFileSync(path.join(skillsRoot, relative), 'utf8')]),
    );
    for (const [relative, content] of originals)
      assert.ok(content.endsWith(canonical), `${relative} must end with the canonical Report section`);
    const write = (relative, content) => fs.writeFileSync(path.join(skillsRoot, relative), content);
    const withoutSection = (relative) => originals.get(relative).slice(0, -canonical.length);
    const failLine = (relative, reason) => new RegExp(`^FAIL: .*/${escapeRegExp(relative)}: ${reason}`, 'm');
    const failedCount = (count) =>
      new RegExp(`Guard FAILED: ${count} skill file\\(s\\) do not end with the canonical Report section\\n$`);

    const unchanged = runNode(SKILLS_GUARD, [skillsRoot]);
    assertStarted(unchanged);
    assert.equal(unchanged.status, 0, unchanged.stderr);
    assert.match(
      unchanged.stdout,
      /Guard PASSED: skills match Codex and Claude conventions and end with the canonical Report section\n$/,
    );

    const [missingSkill, changedSkill] = skillFiles;
    write(missingSkill, withoutSection(missingSkill));
    const missing = runNode(SKILLS_GUARD, [skillsRoot]);
    assertStarted(missing);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, failLine(missingSkill, 'missing the Report section'));
    assert.match(missing.stderr, failedCount(1));
    write(missingSkill, originals.get(missingSkill));

    // The byte goes before the last byte of the file, which is in the section.
    const changedOriginal = originals.get(changedSkill);
    write(changedSkill, `${changedOriginal.slice(0, -1)}x${changedOriginal.slice(-1)}`);
    const changed = runNode(SKILLS_GUARD, [skillsRoot]);
    assertStarted(changed);
    assert.equal(changed.status, 1);
    assert.match(changed.stderr, failLine(changedSkill, 'the Report section differs from'));
    assert.match(changed.stderr, failedCount(1));

    // No skill has the section: a check that only looks for a file that differs finds nothing to report here.
    for (const relative of skillFiles) write(relative, withoutSection(relative));
    const allMissing = runNode(SKILLS_GUARD, [skillsRoot]);
    assertStarted(allMissing);
    assert.equal(allMissing.status, 1);
    for (const relative of skillFiles)
      assert.match(allMissing.stderr, failLine(relative, 'missing the Report section'));
    assert.match(allMissing.stderr, failedCount(skillFiles.length));
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

// A shared file ships in two plugins with the same bytes. The guard reads the files from its own repository, so the
// cases run the guard of a copy of the scripts and plugins, and change the copy of the shared file there. The target
// is the plan-lifecycle skills, and the copy is in the docks plugin: the check runs whatever the target folder is.
function testSkillsGuardSharedFiles() {
  const canonical = 'plugins/plan-lifecycle/skills/plan-workspace/references/pull-request-template.md';
  const copy = 'plugins/docks/skills/agent-first-setup/references/pull-request-template.md';
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-author-tooling-shared-'));
  try {
    for (const dir of ['scripts', 'plugins'])
      fs.cpSync(path.join(ROOT, dir), path.join(fixtureRoot, dir), { recursive: true, verbatimSymlinks: true });
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(fixtureRoot, 'node_modules'), 'dir');
    const guard = path.join(fixtureRoot, 'scripts/skills/guard.mjs');
    const target = path.join(fixtureRoot, 'plugins/plan-lifecycle/skills');
    const copyFile = path.join(fixtureRoot, copy);
    const original = fs.readFileSync(copyFile, 'latin1');
    const canonicalText = fs.readFileSync(path.join(fixtureRoot, canonical), 'latin1');
    assert.equal(original, canonicalText, `${copy} must equal ${canonical}`);
    const failLine = (reason) => new RegExp(`^FAIL: ${escapeRegExp(copy)}: ${reason}$`, 'm');

    const identical = runNode(guard, [target]);
    assertStarted(identical);
    assert.equal(identical.status, 0, identical.stderr);
    assert.match(identical.stdout, /Guard PASSED: /);

    // One byte changes, before the last byte of the file.
    fs.writeFileSync(copyFile, `${original.slice(0, -1)}x${original.slice(-1)}`, 'latin1');
    const changed = runNode(guard, [target]);
    assertStarted(changed);
    assert.equal(changed.status, 1);
    assert.match(changed.stderr, failLine(`differs from ${escapeRegExp(canonical)}; copy that file over it`));
    assert.match(changed.stderr, /Guard FAILED: 1 shared file\(s\) do not match their canonical file\n$/);

    fs.rmSync(copyFile);
    const missing = runNode(guard, [target]);
    assertStarted(missing);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, failLine('cannot read the shared file \\(ENOENT\\)'));

    // The repository lists its shared files in a config file. Without that file the guard checks none, so the
    // missing copy no longer fails, and the guard prints nothing about shared files.
    const config = path.join(fixtureRoot, 'scripts/config/shared-references.json');
    const configFail = (reason) => new RegExp(`^FAIL: scripts/config/shared-references\\.json: ${reason}`, 'm');
    fs.rmSync(config);
    const noConfig = runNode(guard, [target]);
    assertStarted(noConfig);
    assert.equal(noConfig.status, 0, noConfig.stderr);
    assert.doesNotMatch(`${noConfig.stdout}\n${noConfig.stderr}`, /shared file/);

    // An entry without its copies has the wrong shape.
    fs.writeFileSync(config, `${JSON.stringify([{ canonical }])}\n`);
    const badShape = runNode(guard, [target]);
    assertStarted(badShape);
    assert.equal(badShape.status, 2);
    assert.match(badShape.stderr, configFail('must be a list of '));

    fs.writeFileSync(config, '[\n');
    const badJson = runNode(guard, [target]);
    assertStarted(badJson);
    assert.equal(badJson.status, 2);
    assert.match(badJson.stderr, configFail('not valid JSON: '));
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

// The shipped scorer of write-skill reads the native layout: each skill is a folder `<root>/<name>/SKILL.md`, one
// level below the skills root. A folder without a SKILL.md is not a skill, so the scorer does not go into it.
function testSkillGuardScoresFlatSkills() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-author-tooling-skill-guard-'));
  try {
    const skillsRoot = path.join(fixtureRoot, 'skills');
    const writeSkill = (relative, name) => {
      const folder = path.join(skillsRoot, relative);
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(
        path.join(folder, 'SKILL.md'),
        ['---', `name: ${name}`, `description: Use when a test scores the ${name} fixture. Not for real work.`, '---']
          .concat([`# ${name}`, '', '## Workflow', '', '1. Score the fixture.', ''])
          .join('\n'),
      );
    };
    writeSkill('alpha', 'alpha');
    writeSkill('beta', 'beta');
    writeSkill('group/nested', 'nested');
    fs.writeFileSync(path.join(skillsRoot, 'AGENTS.md'), '# Skills\n');
    const rowsOf = (stdout) =>
      stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split(' '));

    const perFile = runNode(SKILL_GUARD, ['score', '--per-file', skillsRoot]);
    assertStarted(perFile);
    assert.equal(perFile.status, 0, perFile.stderr);
    const rows = rowsOf(perFile.stdout);
    assert.deepEqual(
      rows.map(([name]) => name),
      ['alpha', 'beta'],
      'the scorer must give one row per skills/<name>/SKILL.md and no row for a deeper skill',
    );
    for (const [name, score] of rows) assert.match(score, /^\d+$/, `${name} must get an integer score`);

    const total = runNode(SKILL_GUARD, ['score', skillsRoot]);
    assertStarted(total);
    assert.equal(total.status, 0, total.stderr);
    assert.equal(total.stdout, `${rows.reduce((sum, [, score]) => sum + Number(score), 0)}\n`);

    // Without a root, the scorer reads plugins/docks/skills of the working directory.
    const docksSkills = path.join(ROOT, 'plugins/docks/skills');
    const shippedNames = fs
      .readdirSync(docksSkills)
      .filter((name) => fs.existsSync(path.join(docksSkills, name, 'SKILL.md')))
      .sort();
    assert.ok(shippedNames.length > 0, 'plugins/docks/skills must hold skills at skills/<name>/SKILL.md');
    const shipped = runNode(SKILL_GUARD, ['score', '--per-file']);
    assertStarted(shipped);
    assert.equal(shipped.status, 0, shipped.stderr);
    assert.deepEqual(
      rowsOf(shipped.stdout).map(([name]) => name),
      shippedNames,
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

// A plugin agent names the files of its skill as `skill://<skill>/<path>`, because omp resolves that form and sets no
// plugin root variable. The guard accepts the `skill://` form. It refuses each `${...}` variable in an agent, and it
// refuses a file path to a SKILL.md.
function testAgentsGuardSkillReferences() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-author-tooling-agents-'));
  try {
    const agentText = (reference) =>
      [
        '---',
        'name: probe-reviewer',
        'description: Use when a test needs a probe reviewer agent. Not for real reviews.',
        'tools: read, glob, grep',
        'autoload-skills: probe-reviewer',
        '---',
        '',
        '# Probe Reviewer',
        '',
        `Read \`${reference}\` before the review.`,
        '',
        '<constraint>',
        'Remain read-only.',
        '</constraint>',
        '',
        '## Workflow',
        '',
        '1. Review the input.',
        '',
        '## Success Criteria',
        '',
        '- The review is complete.',
        '',
      ].join('\n');
    let index = 0;
    const runGuard = (reference) => {
      index += 1;
      const agents = path.join(fixtureRoot, `agents-${index}`);
      fs.mkdirSync(agents);
      fs.writeFileSync(path.join(agents, 'probe-reviewer.md'), agentText(reference));
      return runNode(AGENTS_GUARD, [agents]);
    };

    for (const reference of ['skill://probe-reviewer/SKILL.md', 'skill://probe-reviewer/references/delta.md']) {
      const accepted = runGuard(reference);
      assertStarted(accepted);
      assert.equal(accepted.status, 0, `${reference} must be accepted:\n${accepted.stderr}`);
    }

    const variableRule = /omp sets no plugin root variable, so name each skill file as skill:\/\/<skill>\/<path>/;
    const pathRule = /a bundled SKILL\.md must load via skill:\/\/<skill>\/SKILL\.md, not a file path/;
    // Each fixture breaks one rule only: the variable rule refuses a `${...}` variable also in a path to a file that
    // is not SKILL.md, and in a variable that is not a plugin root variable.
    for (const variable of [`\${CLAUDE_PLUGIN_ROOT}`, `\${OMP_PLUGIN_ROOT}`, `\${PLUGIN_ROOT}`, `\${HOME}`]) {
      const rejected = runGuard(`${variable}/skills/probe-reviewer/references/delta.md`);
      assertStarted(rejected);
      assert.equal(rejected.status, 1, `${variable} must be refused:\n${rejected.stdout}`);
      assert.match(rejected.stderr, /^FAIL: probe-reviewer\b/m);
      assert.match(rejected.stderr, variableRule, `${variable} must be refused by the variable rule`);
      assert.ok(
        rejected.stderr.includes(`remove ${variable};`),
        `the refusal must name ${variable}:\n${rejected.stderr}`,
      );
      assert.doesNotMatch(rejected.stderr, pathRule, `${variable} names no SKILL.md, so the path rule must not fire`);
    }
    // A plain repository path to SKILL.md holds no variable, so only the skill:// path rule refuses it.
    const plainPath = 'plugins/plan-lifecycle/skills/probe-reviewer/SKILL.md';
    const rejectedPath = runGuard(plainPath);
    assertStarted(rejectedPath);
    assert.equal(rejectedPath.status, 1, `${plainPath} must be refused:\n${rejectedPath.stdout}`);
    assert.match(rejectedPath.stderr, pathRule, `${plainPath} must be refused by the skill:// path rule`);
    assert.ok(rejectedPath.stderr.includes(plainPath), `the refusal must show the line:\n${rejectedPath.stderr}`);
    assert.doesNotMatch(rejectedPath.stderr, variableRule, `${plainPath} holds no variable`);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

testBiomeRejectsSyntaxDefect();
testCombinedSkillValidation();
testTreeGuardOperationalFailures();
testSkillsGuardSpawnFailure();
testSkillsGuardReportSection();
testSkillsGuardSharedFiles();
testSkillGuardScoresFlatSkills();
testAgentsGuardSkillReferences();
testTestContractToolchains();
testShebangInterpreter();
testValidatorTable();
console.log('author tooling contracts passed');
