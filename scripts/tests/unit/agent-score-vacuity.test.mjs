import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// The agent-score branch used to trust the scorer's stdout completely: an empty directory,
// a crashed scorer, a same-size set of invented names, or NaN scores could all reach a green
// per-file all-clear. Drive the real `scripts/ci.mjs` with PATH shims, matching the skill-score
// vacuity contracts, so these cases exercise the shipped gate rather than a reimplementation.
const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, '../../..');
const TARGET = 'plan-lifecycle';
const SKILLS_ROOT = `plugins/${TARGET}/skills`;
const AGENTS_ROOT = `plugins/${TARGET}/agents`;

const agentNames = (root) =>
  fs
    .readdirSync(path.join(REPO, root))
    .filter((name) => name.endsWith('.md') && name !== 'AGENTS.md' && name !== 'CLAUDE.md')
    .sort()
    .map((name) => name.replace(/\.md$/u, ''));
const EXPECTED = agentNames(AGENTS_ROOT);
assert.ok(EXPECTED.length >= 2, `${AGENTS_ROOT} must hold at least two agents for the mismatch case to mean anything`);

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
    const categoryPath = path.join(root, category);
    if (!fs.statSync(categoryPath).isDirectory()) continue;
    for (const skill of fs.readdirSync(categoryPath).sort()) {
      const skillPath = path.join(categoryPath, skill);
      if (fs.statSync(skillPath).isDirectory() && fs.existsSync(path.join(skillPath, 'SKILL.md'))) {
        rows.push(\`\${category}/\${skill} 14\`);
      }
    }
  }
  if (rows.length) process.stdout.write(\`\${rows.join('\\n')}\\n\`);
}
if (tool === 'node' && args[0] === 'scripts/agents/score.mjs' && args[1] === '--per-file') {
  const root = args.at(-1);
  const rows = fs
    .readdirSync(root)
    .filter((entry) => entry.endsWith('.md') && entry !== 'AGENTS.md' && entry !== 'CLAUDE.md')
    .sort()
    .map((entry) => \`\${entry.replace(/\\.md$/u, '')} 14\`);
  const mode = process.env.DOCKS_AGENT_SCORE_MODE;
  if (mode === 'crash') {
    process.stderr.write('agent-score: simulated scorer crash\\n');
    process.exit(3);
  }
  if (mode === 'mismatch' && rows.length) rows[0] = 'not-on-disk 14';
  if (mode === 'non-finite' && rows.length) rows[0] = \`\${rows[0].split(' ')[0]} NaN\`;
  if (rows.length) process.stdout.write(\`\${rows.join('\\n')}\\n\`);
}
process.exit(0);
`;
  fs.writeFileSync(path.join(directory, name), script, { mode: 0o755 });
}

const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docks-agent-score-vacuity-'));
for (const tool of ['node', 'bun', 'claude', 'shellcheck', 'cargo']) writeShim(shimDir, tool);

// Make the parent gate observe either an empty agents directory or a declared root that does
// not exist. Child checks are shimmed; the same hook is harmless in those short-lived processes.
const fixtureHook = path.join(shimDir, 'payload-root-fixture.mjs');
fs.writeFileSync(
  fixtureHook,
  `import fs from 'node:fs';
const existsSync = fs.existsSync.bind(fs);
const readdirSync = fs.readdirSync.bind(fs);
fs.existsSync = (target) => target === process.env.DOCKS_MISSING_ROOT ? false : existsSync(target);
fs.readdirSync = (target, ...args) =>
  process.env.DOCKS_AGENT_SCORE_MODE === 'empty-directory' && target === ${JSON.stringify(AGENTS_ROOT)}
    ? []
    : readdirSync(target, ...args);
`,
);

const baseEnv = { ...process.env };
delete baseEnv.CARGO_TARGET_DIR;
delete baseEnv.GITHUB_ACTIONS;
delete baseEnv.NODE_OPTIONS;

const runCi = (mode) => {
  const result = spawnSync(process.execPath, ['scripts/ci.mjs', '--plugin', TARGET], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 180_000,
    env: {
      ...baseEnv,
      PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ''}`,
      DOCKS_AGENT_SCORE_MODE: mode,
      ...(mode === 'empty-directory' || mode.startsWith('missing-')
        ? {
            NODE_OPTIONS: `--import=${fixtureHook}`,
            DOCKS_MISSING_ROOT:
              mode === 'missing-skills-root' ? SKILLS_ROOT : mode === 'missing-agents-root' ? AGENTS_ROOT : '',
          }
        : {}),
    },
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};

const rx = (literal) => new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

test.after(() => fs.rmSync(shimDir, { recursive: true, force: true }));

test('a scorer covering every agent on disk keeps the gate green', () => {
  const { status, output } = runCi('full');
  assert.equal(status, 0, output);
  assert.match(
    output,
    rx(
      `${TARGET} agent score set covers the tree: ${EXPECTED.length} score rows for ${EXPECTED.length} agent files on disk`,
    ),
  );
  assert.match(output, rx(`${TARGET} agents per-file all ≥ 10`));
});
test('a missing declared skills root fails explicitly', () => {
  const { status, output } = runCi('missing-skills-root');
  assert.notEqual(status, 0);
  assert.match(output, rx(`${TARGET} declared skills root missing: ${SKILLS_ROOT}`));
});

test('a missing declared agents root fails explicitly', () => {
  const { status, output } = runCi('missing-agents-root');
  assert.notEqual(status, 0);
  assert.match(output, rx(`${TARGET} declared agents root missing: ${AGENTS_ROOT}`));
});

test('an empty declared agents directory fails instead of passing vacuously', () => {
  const { status, output } = runCi('empty-directory');
  assert.notEqual(status, 0);
  assert.match(output, rx(`${TARGET} declared agents root is empty — no agent score set to gate: ${AGENTS_ROOT}`));
  assert.doesNotMatch(output, rx(`${TARGET} agents per-file all ≥ 10`));
});

test('an agent scorer that exits non-zero fails the gate naming the command', () => {
  const { status, output } = runCi('crash');
  assert.notEqual(status, 0);
  assert.match(output, rx(`${TARGET} agent scorer exited 3 — no score set to gate`));
  assert.match(output, rx(`node scripts/agents/score.mjs --per-file ${AGENTS_ROOT}`));
  assert.doesNotMatch(output, rx(`${TARGET} agents per-file all ≥ 10`));
});

test('a same-size score set with a wrong row name fails corroboration', () => {
  const { status, output } = runCi('mismatch');
  assert.notEqual(status, 0);
  assert.match(
    output,
    rx(
      `${TARGET} agent score set does not cover the tree: expected ${EXPECTED.length} agent(s) on disk, parsed ${EXPECTED.length} score row(s)`,
    ),
  );
  assert.match(output, rx(`unscored on disk: ${EXPECTED[0]}`));
  assert.match(output, rx('not on disk: not-on-disk'));
  assert.doesNotMatch(output, rx(`${TARGET} agents per-file all ≥ 10`));
});

test('a non-finite agent score fails before floor arithmetic', () => {
  const { status, output } = runCi('non-finite');
  assert.notEqual(status, 0);
  assert.match(output, rx(`${TARGET} agent scorer produced non-finite score(s): ${EXPECTED[0]} NaN`));
  assert.doesNotMatch(output, rx(`${TARGET} agents per-file all ≥ 10`));
});
