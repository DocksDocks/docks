import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// `gateSkills` derives its ENTIRE work set from the skill scorer's stdout. A scorer that
// crashed, was killed, or silently skipped skills used to leave both scoring loops iterating
// nothing and still print the per-file all-clear — a green gate that scored nothing. These
// contracts drive the real `scripts/ci.mjs` with a PATH shim standing in for the scorer, the
// same technique `scripts/tests/ci-plugin-targeting.mjs` uses, so they exercise the shipped
// gate rather than a reimplementation of it.
const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, '../../..');
const TARGET = 'docks';
const SKILLS_ROOT = `plugins/${TARGET}/skills`;

// Counted the way the gate counts: every <category>/<skill> directory, SKILL.md or not.
const skillDirs = (root) => {
  const out = [];
  for (const category of fs.readdirSync(path.join(REPO, root)).sort()) {
    const cp = path.join(REPO, root, category);
    if (!fs.statSync(cp).isDirectory()) continue;
    for (const name of fs.readdirSync(cp).sort()) {
      if (fs.statSync(path.join(cp, name)).isDirectory()) out.push(`${category}/${name}`);
    }
  }
  return out;
};
const EXPECTED = skillDirs(SKILLS_ROOT);
assert.ok(EXPECTED.length >= 2, `${SKILLS_ROOT} must hold at least two skills for the subset case to mean anything`);

// One shim per tool on PATH. Every stubbed child succeeds silently except the scorer, whose
// behaviour DOCKS_SCORE_MODE selects: `full` reproduces the real scorer's contract (a row per
// skill directory holding a SKILL.md, upstream skills included — the scorer emits those too,
// skill-guard.mjs:168-171), `empty` prints nothing, `subset` drops the first row, `crash`
// writes a diagnostic to stderr and exits 3.
function writeShim(directory, name) {
  const script = `#!${process.execPath}
import fs from 'node:fs';
import path from 'node:path';
const tool = ${JSON.stringify(name)};
const args = process.argv.slice(2);
if (tool === 'claude') process.stdout.write('Validation passed\\n');
if (tool === 'node' && args[0] === 'scripts/config/read-floor.mjs') process.stdout.write('10\\n');
if (tool === 'node' && args[0] === 'plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs' && args[1] === 'score') {
  const root = args.at(-1);
  const rows = [];
  for (const category of fs.readdirSync(root).sort()) {
    const cp = path.join(root, category);
    if (!fs.statSync(cp).isDirectory()) continue;
    for (const skill of fs.readdirSync(cp).sort()) {
      const dir = path.join(cp, skill);
      if (!fs.statSync(dir).isDirectory()) continue;
      if (!fs.existsSync(path.join(dir, 'SKILL.md'))) continue;
      rows.push(\`\${category}/\${skill} 14\`);
    }
  }
  const mode = root === ${JSON.stringify(SKILLS_ROOT)} ? process.env.DOCKS_SCORE_MODE : 'full';
  if (mode === 'crash') {
    process.stderr.write('skill-guard: simulated scorer crash\\n');
    process.exit(3);
  }
  const emitted = mode === 'empty' ? [] : mode === 'subset' ? rows.slice(1) : rows;
  if (emitted.length) process.stdout.write(\`\${emitted.join('\\n')}\\n\`);
}
process.exit(0);
`;
  fs.writeFileSync(path.join(directory, name), script, { mode: 0o755 });
}

const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-skill-score-vacuity-'));
for (const tool of ['node', 'bun', 'claude', 'shellcheck', 'cargo']) writeShim(shimDir, tool);

const baseEnv = { ...process.env };
delete baseEnv.CARGO_TARGET_DIR;
delete baseEnv.GITHUB_ACTIONS;

const runCi = (mode) => {
  const result = spawnSync(process.execPath, ['scripts/ci.mjs', '--plugin', TARGET], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 180_000,
    env: {
      ...baseEnv,
      PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ''}`,
      DOCKS_SCORE_MODE: mode,
    },
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};

const rx = (literal) => new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

test.after(() => fs.rmSync(shimDir, { recursive: true, force: true }));

// The control case. Without it, a gate broken outright would satisfy every case below.
test('a scorer covering every skill on disk keeps the gate green', () => {
  const { status, output } = runCi('full');
  assert.equal(status, 0, output);
  assert.match(
    output,
    rx(
      `${TARGET} skill score set covers the tree: ${EXPECTED.length} score rows for ${EXPECTED.length} skill dirs on disk`,
    ),
  );
  assert.match(output, rx(`${TARGET} skills per-file all clear`));
});

test('an empty score set fails the gate instead of reporting all clear', () => {
  const { status, output } = runCi('empty');
  assert.notEqual(status, 0);
  assert.match(
    output,
    rx(
      `${TARGET} skill score set does not cover the tree: expected ${EXPECTED.length} skill(s) on disk, parsed 0 score row(s)`,
    ),
  );
  // The actionable half: which skills the scorer never reported.
  assert.match(output, rx(`unscored on disk: ${EXPECTED.join(', ')}`));
  assert.doesNotMatch(output, rx(`${TARGET} skills per-file all clear`));
});

test('a short score set fails the gate and names the unscored skill', () => {
  const { status, output } = runCi('subset');
  assert.notEqual(status, 0);
  assert.match(
    output,
    rx(
      `${TARGET} skill score set does not cover the tree: expected ${EXPECTED.length} skill(s) on disk, parsed ${EXPECTED.length - 1} score row(s)`,
    ),
  );
  assert.match(output, rx(`unscored on disk: ${EXPECTED[0]}`));
  assert.doesNotMatch(output, rx(`${TARGET} skills per-file all clear`));
});

test('a scorer that exits non-zero fails the gate naming the command', () => {
  const { status, output } = runCi('crash');
  assert.notEqual(status, 0);
  assert.match(output, rx(`${TARGET} skill scorer exited 3 — no score set to gate`));
  assert.match(
    output,
    rx('node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file'),
  );
  assert.doesNotMatch(output, rx(`${TARGET} skills per-file all clear`));
});
