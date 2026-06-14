#!/usr/bin/env node
// ci.mjs — local mirror of .github/workflows/ci.yml (port of ci.sh). Run before
// releasing. All validators are Node .mjs; manifests are checked natively.
// Usage: node scripts/ci.mjs [-q]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
process.chdir(REPO);
const QUIET = process.argv.includes('-q');
const failures = [];
const ok = (m) => { if (!QUIET) console.log(`\x1b[1;32m  ✔\x1b[0m ${m}`); };
const fail = (m) => { console.log(`\x1b[1;31m  ✘\x1b[0m ${m}`); failures.push(m); };
const warn = (m) => { if (!QUIET) console.log(`\x1b[1;33m  ⚠\x1b[0m ${m}`); };
const section = (m) => { if (!QUIET) console.log(`\n\x1b[1m▸ ${m}\x1b[0m`); };
const node = (args) => spawnSync('node', args, { encoding: 'utf8' });
const nodeOk = (args) => (node(args).status ?? 1) === 0;
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const BUNDLE = 'plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs';

// --- 1. workflow YAML validity ---
section('workflow YAML');
try {
  const doc = parseDocument(fs.readFileSync('.github/workflows/ci.yml', 'utf8'), { prettyErrors: true, strict: true, uniqueKeys: true });
  if (doc.errors.length) fail('.github/workflows/ci.yml YAML invalid');
  else ok('.github/workflows/ci.yml parses (node yaml)');
} catch { fail('.github/workflows/ci.yml YAML invalid'); }

// --- 2. plugin manifest ---
section('plugin manifest');
const plugin = readJSON('plugins/docks/.claude-plugin/plugin.json');
const market = readJSON('.claude-plugin/marketplace.json');
plugin ? ok('plugin.json JSON valid') : fail('plugin.json JSON invalid');
market ? ok('marketplace.json JSON valid') : fail('marketplace.json JSON invalid');
const PLUGIN_V = plugin?.version;
const MARKET_V = market?.plugins?.find((p) => p.name === 'docks')?.version;
if (PLUGIN_V && PLUGIN_V === MARKET_V) ok(`plugin.json + marketplace.json versions agree (${PLUGIN_V})`);
else fail(`version drift: plugin.json=${PLUGIN_V} marketplace.json=${MARKET_V}`);

const claude = spawnSync('claude', ['plugin', 'validate', './plugins/docks'], { encoding: 'utf8' });
if (claude.error) fail('claude CLI not found — install Claude Code to run "claude plugin validate"');
else if (`${claude.stdout}${claude.stderr}`.includes('Validation passed')) ok('claude plugin validate ./plugins/docks');
else fail('claude plugin validate ./plugins/docks (run manually for details)');

// --- 2b. Codex plugin manifest ---
section('Codex plugin manifest');
const CODEX_PLUGIN = 'plugins/docks/.codex-plugin/plugin.json';
const CODEX_MARKET = '.agents/plugins/marketplace.json';
if (fs.existsSync(CODEX_PLUGIN)) {
  const cp = readJSON(CODEX_PLUGIN);
  cp ? ok(`${CODEX_PLUGIN} JSON valid`) : fail(`${CODEX_PLUGIN} JSON invalid`);
  if (cp?.skills === './skills/') ok(`codex plugin.json skills uses current Codex string path (${cp.skills})`);
  else fail('codex plugin.json skills must be string "./skills/" for current Codex (arrays are rejected)');
  if (cp?.version === PLUGIN_V) ok(`codex plugin.json version matches claude plugin.json (${PLUGIN_V})`);
  else fail(`version drift: claude=${PLUGIN_V} codex=${cp?.version}`);
  if (fs.existsSync(CODEX_MARKET)) (readJSON(CODEX_MARKET) ? ok(`${CODEX_MARKET} JSON valid`) : fail(`${CODEX_MARKET} JSON invalid`));
  else fail(`${CODEX_MARKET} missing while ${CODEX_PLUGIN} exists — they should ship together`);
} else warn(`${CODEX_PLUGIN} missing — Codex distribution not configured (optional)`);

// --- 2c. category layout ---
section('category layout');
let layoutOk = true;
for (const p of plugin?.skills || []) {
  const clean = p.replace(/^\.\//, '');
  if (!fs.existsSync(path.join('plugins/docks', clean))) { fail(`plugin.json references missing category dir: ${clean}`); layoutOk = false; }
}
const strays = fs.existsSync('plugins/docks/skills')
  ? fs.readdirSync('plugins/docks/skills').filter((d) => fs.existsSync(`plugins/docks/skills/${d}/SKILL.md`)).length : 0;
if (strays > 0) { fail(`${strays} skill(s) at skills/<name>/SKILL.md (should be skills/<category>/<name>/SKILL.md)`); layoutOk = false; }
if (layoutOk) ok('skill categories declared in plugin.json all exist; no stray skills outside categories');

// --- 3. structural guards ---
section('structural guards');
const guards = [
  ['skills/guard', ['scripts/skills/guard.mjs']],
  ['skills/no-author-scripts', ['scripts/skills/no-author-scripts.mjs']],
  ['skills/transform-guard', ['scripts/skills/transform-guard.mjs']],
  ['agents/guard', ['scripts/agents/guard.mjs']],
  ['tree/guard', ['scripts/tree/guard.mjs']],
];
for (const [name, args] of guards) (nodeOk(args) ? ok(`${name} passed`) : fail(`${name} failed (run 'node ${args[0]}' for details)`));

// --- 3c. trigger collisions ---
section('trigger collisions');
nodeOk(['tests/skill-trigger-collision.mjs']) ? ok('no unrouted high-overlap skill descriptions')
  : fail('trigger-collision: unrouted high-overlap pair(s) (run: node tests/skill-trigger-collision.mjs)');

// --- 3b. shell lint (only the bash that remains: release.sh + hooks) ---
// Self-skips when shellcheck isn't installed locally; tag-CI enforces it.
section('shell lint');
const bashFiles = ['scripts/release.sh', ...(fs.existsSync('plugins/docks/hooks')
  ? fs.readdirSync('plugins/docks/hooks').filter((f) => f.endsWith('.sh')).map((f) => `plugins/docks/hooks/${f}`) : [])];
const shellcheck = spawnSync('shellcheck', ['-S', 'warning', ...bashFiles], { encoding: 'utf8' });
if (shellcheck.error) warn('shellcheck not installed — skipped locally (CI enforces)');
else if ((shellcheck.status ?? 1) === 0) ok(`shellcheck -S warning clean (${bashFiles.length} bash file(s))`);
else fail(`shellcheck warnings (run: shellcheck -S warning ${bashFiles.join(' ')})`);

// --- 4 + 5. score floors (per-category + per-file) ---
section('quality score floors');
const floorOf = (kind, cat) => { const r = node(['scripts/config/read-floor.mjs', kind, ...(cat ? [cat] : [])]); return r.status === 0 ? parseInt(r.stdout.trim(), 10) : null; };
const skillScores = node([BUNDLE, 'score', '--per-file', 'plugins/docks/skills']).stdout.trim().split('\n').filter(Boolean)
  .map((l) => { const [n, s] = l.split(' '); return { name: n, cat: n.split('/')[0], score: parseInt(s, 10) }; });
for (const c of ['engineering', 'productivity']) {
  const floor = floorOf('skills', c);
  if (floor == null) { fail(`scripts/config/scoring.json missing skills.${c}`); continue; }
  const rows = skillScores.filter((r) => r.cat === c);
  if (rows.length === 0) continue;
  const sum = rows.reduce((a, r) => a + r.score, 0);
  const catFloor = rows.length * floor;
  sum >= catFloor ? ok(`skills score/${c}: ${sum} (floor ${catFloor} = ${rows.length} × ${floor})`)
    : fail(`skills score/${c}: ${sum} below floor ${catFloor} (${rows.length} × ${floor})`);
}
{
  const floor = floorOf('agents');
  const count = fs.existsSync('plugins/docks/agents') ? fs.readdirSync('plugins/docks/agents').filter((f) => f.endsWith('.md') && f !== 'AGENTS.md' && f !== 'CLAUDE.md').length : 0;
  const total = parseInt(node(['scripts/agents/score.mjs']).stdout.trim(), 10);
  total >= count * floor ? ok(`score-agents: ${total} (floor ${count * floor} = ${count} × ${floor})`)
    : fail(`score-agents: ${total} below floor ${count * floor} (${count} × ${floor})`);
}

section('per-file score floors');
let anyUnder = 0; let exemptN = 0;
for (const r of skillScores) {
  if (/^upstream:/m.test(fs.readFileSync(`plugins/docks/skills/${r.name}/SKILL.md`, 'utf8'))) { exemptN += 1; continue; }
  const floor = floorOf('skills', r.cat);
  if (r.score < floor) { fail(`  skills:${r.name} score ${r.score} below per-file floor ${floor}`); anyUnder = 1; }
}
if (!anyUnder) ok(`skills per-file all clear per-category floors (${exemptN} upstream skipped)`);
{
  const floor = floorOf('agents');
  const rows = node(['scripts/agents/score.mjs', '--per-file']).stdout.trim().split('\n').filter(Boolean);
  let under = 0;
  for (const l of rows) { const s = parseInt(l.split(' ').pop(), 10); if (s < floor) { fail(`  agents:${l} below per-file floor ${floor}`); under = 1; } }
  if (!under) ok(`agents per-file all ≥ ${floor}`);
}

// --- 6. idempotency ---
section('skill-maintainer idempotency');
nodeOk(['tests/idempotency.mjs']) ? ok('skill content_hash in sync; maintainer re-run is a no-op')
  : fail('skill-maintainer idempotency failed (run: node tests/idempotency.mjs)');

// --- 7. scaffold ---
if (fs.existsSync('docs/scaffold/spec.yaml')) {
  section('scaffold');
  nodeOk(['scripts/scaffold/guard-spec.mjs']) ? ok('scaffold/guard-spec passed (spec coherent; referenced paths resolve)')
    : fail('scaffold/guard-spec failed (run: node scripts/scaffold/guard-spec.mjs)');
  nodeOk(['scripts/scaffold/test.mjs']) ? ok('scaffold/test passed (templates render to a valid skeleton)')
    : fail('scaffold/test failed (run: node scripts/scaffold/test.mjs)');
}

// --- summary ---
console.log('');
if (failures.length === 0) {
  console.log('\x1b[1;32m✔ All ci.mjs checks passed\x1b[0m — safe to release.');
  process.exit(0);
}
console.log(`\x1b[1;31m✘ ${failures.length} check(s) failed:\x1b[0m`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(1);
