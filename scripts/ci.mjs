#!/usr/bin/env node
// ci.mjs — local mirror of .github/workflows/ci.yml. Run before releasing.
// REGISTRY-DRIVEN: repo-wide checks run once, then every plugin in
// scripts/lib/plugins.mjs is gated through the same capability-driven
// gatePlugin() (a check runs only when the descriptor declares that capability).
// Adding a plugin = one registry entry; no edits here.
// Usage: node scripts/ci.mjs [-q] [--plugin <name>] [--timings-json <path>] [--list]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { startTask } from './lib/ci-background-task.mjs';
import { resolveCiTargets, selectedAuthorChecks } from './lib/ci-targeting.mjs';
import {
  CLAUDE_MARKETPLACE,
  CODEX_MARKETPLACE,
  claudeManifest,
  codexManifest,
  manifestCategories,
  marketEntryVersion,
  PLUGINS,
  presentPlugins,
  shellHooks,
} from './lib/plugins.mjs';
import { findCargo } from './lib/rust-bin.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
process.chdir(REPO);
const rawArgv = process.argv.slice(2);

function parseArgs(args) {
  const options = { quiet: false, list: false, plugin: null, timingsJson: null };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-q' || arg === '--list') {
      if (seen.has(arg)) throw new Error(`duplicate argument: ${arg}`);
      seen.add(arg);
      if (arg === '-q') options.quiet = true;
      else options.list = true;
      continue;
    }
    if (arg === '--plugin' || arg === '--timings-json') {
      if (seen.has(arg)) throw new Error(`duplicate argument: ${arg}`);
      const value = args[index + 1];
      if (!value || value.startsWith('-')) throw new Error(`${arg} requires one value`);
      seen.add(arg);
      index += 1;
      if (arg === '--plugin') options.plugin = value;
      else options.timingsJson = value;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (options.list && (options.plugin !== null || options.timingsJson !== null)) {
    throw new Error('--list cannot be combined with --plugin or --timings-json');
  }
  return options;
}

let options;
try {
  options = parseArgs(rawArgv);
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exit(2);
}
const QUIET = options.quiet;
const onlyPlugin = options.plugin;
const startedAt = performance.now();
const phases = [];
const tasks = [];
let activePhase = null;
const failures = [];
const ok = (m) => {
  if (!QUIET) console.log(`\x1b[1;32m  ✔\x1b[0m ${m}`);
};
const fail = (m) => {
  console.log(`\x1b[1;31m  ✘\x1b[0m ${m}`);
  failures.push(m);
};
const warn = (m) => {
  if (!QUIET) console.log(`\x1b[1;33m  ⚠\x1b[0m ${m}`);
};
const closePhase = () => {
  if (activePhase === null) return;
  phases.push({
    name: activePhase.name,
    duration_ms: Math.max(0, Math.round(performance.now() - activePhase.startedAt)),
    status: failures.length === activePhase.failureCount ? 'passed' : 'failed',
  });
  activePhase = null;
};
const section = (m) => {
  closePhase();
  activePhase = { name: m, startedAt: performance.now(), failureCount: failures.length };
  if (!QUIET) console.log(`\n\x1b[1m▸ ${m}\x1b[0m`);
};
const node = (args, options = {}) => spawnSync('node', args, { encoding: 'utf8', ...options });
const nodeOk = (args, options) => (node(args, options).status ?? 1) === 0;
const readJSON = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const BUNDLE = 'plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs';
const floorCache = new Map();
const floorOf = (kind, cat) => {
  const key = `${kind}/${cat ?? ''}`;
  if (floorCache.has(key)) return floorCache.get(key);
  const result = node(['scripts/config/read-floor.mjs', kind, ...(cat ? [cat] : [])]);
  const parsed = result.status === 0 ? parseInt(result.stdout.trim(), 10) : null;
  const floor = Number.isInteger(parsed) ? parsed : null;
  floorCache.set(key, floor);
  return floor;
};

// --list: print the registry and exit.
if (options.list) {
  for (const p of PLUGINS) console.log(`${p.name}\t${p.root}\t${fs.existsSync(p.root) ? 'present' : 'MISSING'}`);
  process.exit(0);
}

// Which plugins to gate (default: every present plugin; --plugin narrows it).
let targets;
try {
  targets = resolveCiTargets(presentPlugins(), onlyPlugin);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const authorChecks = selectedAuthorChecks(targets);
const planPolicyRegressionTask = authorChecks.has('plan-reviewer')
  ? startTask(
      'plan-review-policy regressions',
      process.execPath,
      ['scripts/tests/plan-review-policy-regressions.mjs', '--self-test'],
      { cwd: REPO, tasks },
    )
  : null;
const javascriptQualityTask =
  onlyPlugin === null ? startTask('javascript quality', 'pnpm', ['run', 'check:js'], { cwd: REPO, tasks }) : null;

// Catalogs are shared; read once (used by the per-plugin version checks too).
const claudeMarket = readJSON(CLAUDE_MARKETPLACE);
const codexMarket = readJSON(CODEX_MARKETPLACE);

if (onlyPlugin === null) {
  // ========================== repo-wide checks ==========================
  section('workflow YAML');
  for (const workflowPath of [
    '.github/workflows/ci.yml',
    '.github/workflows/build-binaries.yml',
    '.github/workflows/dependency-integrity.yml',
  ]) {
    try {
      const doc = parseDocument(fs.readFileSync(workflowPath, 'utf8'), {
        prettyErrors: true,
        strict: true,
        uniqueKeys: true,
      });
      doc.errors.length ? fail(`${workflowPath} YAML invalid`) : ok(`${workflowPath} parses (node yaml)`);
    } catch {
      fail(`${workflowPath} YAML invalid`);
    }
  }

  section('marketplace catalogs');
  claudeMarket ? ok(`${CLAUDE_MARKETPLACE} JSON valid`) : fail(`${CLAUDE_MARKETPLACE} JSON invalid`);
  if (fs.existsSync(CODEX_MARKETPLACE))
    codexMarket ? ok(`${CODEX_MARKETPLACE} JSON valid`) : fail(`${CODEX_MARKETPLACE} JSON invalid`);
  else warn(`${CODEX_MARKETPLACE} missing — Codex distribution not configured (optional)`);

  section('repo-wide guards');
  nodeOk(['scripts/tree/guard.mjs'])
    ? ok('tree/guard passed (context-tree node pairs)')
    : fail("tree/guard failed (run 'node scripts/tree/guard.mjs')");
  nodeOk(['scripts/skills/durable-anchors.mjs'])
    ? ok('durable-anchors passed (no live file:line anchors in long-lived docs)')
    : fail("durable-anchors failed (run 'node scripts/skills/durable-anchors.mjs')");
  nodeOk(['scripts/tests/author-tooling.mjs'])
    ? ok('author tooling contracts passed')
    : fail('author tooling contracts failed (run: node scripts/tests/author-tooling.mjs)');

  section('CI targeting contract');
  nodeOk(['scripts/tests/ci-plugin-targeting.mjs', '--unit'])
    ? ok('CI targeting, tag resolution, and cache contract passed')
    : fail('CI targeting contract failed (run: node scripts/tests/ci-plugin-targeting.mjs --unit)');
}

if (authorChecks.has('idempotency')) {
  section('skill-maintainer idempotency');
  nodeOk(['tests/idempotency.mjs'])
    ? ok('skill content_hash determinism; maintainer re-run is a no-op')
    : fail('skill-maintainer idempotency failed (run: node tests/idempotency.mjs)');
}

// shell lint — shellHooks(p) collects each plugin's hooks/*.sh plus a rust
// capability's sh launcher (today: session-relay's bin/relay). Self-skips without shellcheck.
section('shell lint');
const bashFiles = targets.flatMap(shellHooks);
if (bashFiles.length === 0) ok('no bash to lint (all tooling is Node .mjs)');
else {
  const shellcheck = spawnSync('shellcheck', ['-S', 'warning', ...bashFiles], { encoding: 'utf8' });
  if (shellcheck.error) warn('shellcheck not installed — skipped locally (CI enforces)');
  else if ((shellcheck.status ?? 1) === 0) ok(`shellcheck -S warning clean (${bashFiles.length} hook(s))`);
  else fail(`shellcheck warnings (run: shellcheck -S warning ${bashFiles.join(' ')})`);
}

if (authorChecks.has('scaffold') && fs.existsSync('docs/scaffold/spec.yaml')) {
  section('scaffold');
  nodeOk(['scripts/scaffold/guard-spec.mjs'])
    ? ok('scaffold/guard-spec passed (spec coherent; referenced paths resolve)')
    : fail('scaffold/guard-spec failed (run: node scripts/scaffold/guard-spec.mjs)');
  nodeOk(['scripts/scaffold/test.mjs'])
    ? ok('scaffold/test passed (templates render to a valid skeleton)')
    : fail('scaffold/test failed (run: node scripts/scaffold/test.mjs)');
}

// ============================ per-plugin gate ============================
for (const p of targets) gatePlugin(p);

if (authorChecks.has('plan-reviewer')) {
  section('plan review policy');
  const planPolicySurfacesPassed = nodeOk(['scripts/tests/plan-review-policy.mjs', '--case', 'surfaces']);
  const planConvergenceRepairPassed = ['repair-artifacts', 'repair-series', 'reviewer-workdir', 'cli-transport'].every(
    (testCase) => nodeOk(['scripts/tests/plan-review-convergence-repair.mjs', '--case', testCase]),
  );
  const planPolicyRegressionsPassed = await planPolicyRegressionTask;
  planPolicySurfacesPassed
    ? ok('plan-review-policy fast surfaces passed')
    : fail('plan-review-policy fast surfaces failed (run: node scripts/tests/plan-review-policy.mjs --case surfaces)');
  if (planPolicyRegressionsPassed) {
    ok('plan-review-policy contract passed');
    ok('plan-review-policy regressions passed');
  } else
    fail(
      'plan-review-policy contract/regressions failed (run: node scripts/tests/plan-review-policy-regressions.mjs --self-test)',
    );
  planConvergenceRepairPassed
    ? ok('plan-review convergence repair contract passed')
    : fail(
        'plan-review convergence repair contract failed (run: node scripts/tests/plan-review-convergence-repair.mjs --case <case>)',
      );
}

if (javascriptQualityTask !== null) {
  section('javascript quality');
  const javascriptQualityPassed = await javascriptQualityTask;
  javascriptQualityPassed
    ? ok('JavaScript format and lint checks passed')
    : fail('JavaScript format and lint checks failed (run: pnpm run check:js)');
}

function gatePlugin(p) {
  section(`plugin: ${p.name}`);
  const manifest = readJSON(claudeManifest(p));
  manifest ? ok(`${p.name} plugin.json JSON valid`) : fail(`${p.name} plugin.json JSON invalid`);
  const mv = marketEntryVersion(claudeMarket, p.name);
  if (manifest?.version && manifest.version === mv) ok(`${p.name} version agrees (${manifest.version})`);
  else fail(`${p.name} version drift: plugin.json=${manifest?.version} marketplace.json=${mv}`);

  const v = spawnSync('claude', ['plugin', 'validate', `./${p.root}`], { encoding: 'utf8' });
  if (v.error) (p.name === 'docks' ? fail : warn)(`claude CLI not found — ${p.name} plugin validate skipped`);
  else if (`${v.stdout}${v.stderr}`.includes('Validation passed')) ok(`claude plugin validate ./${p.root}`);
  else fail(`claude plugin validate ./${p.root} (run manually for details)`);

  if (p.codex) {
    const cp = readJSON(codexManifest(p));
    cp ? ok(`${p.name} codex plugin.json JSON valid`) : fail(`${p.name} codex plugin.json JSON invalid`);
    cp?.skills === './skills/'
      ? ok(`${p.name} codex skills uses string path "./skills/"`)
      : fail(`${p.name} codex plugin.json skills must be string "./skills/" (arrays are rejected by Codex)`);
    cp?.version === manifest?.version
      ? ok(`${p.name} codex manifest version matches claude (${cp?.version})`)
      : fail(`${p.name} codex version drift: codex=${cp?.version} claude=${manifest?.version}`);
    (codexMarket?.plugins || []).some((x) => x.name === p.name)
      ? ok(`${p.name} listed in Codex marketplace (${CODEX_MARKETPLACE})`)
      : fail(`${p.name} missing from ${CODEX_MARKETPLACE}`);
  }

  for (const f of p.extraJson)
    readJSON(f) ? ok(`${p.name} ${path.basename(f)} JSON valid`) : fail(`${p.name} ${f} JSON invalid`);

  if (p.skills && fs.existsSync(p.skills)) gateSkills(p, manifest);

  if (p.agents && fs.existsSync(p.agents)) {
    nodeOk(['scripts/agents/guard.mjs', p.agents])
      ? ok(`${p.name} agents/guard passed`)
      : fail(`${p.name} agents/guard failed (run: node scripts/agents/guard.mjs ${p.agents})`);
    const floor = floorOf('agents');
    const count = fs
      .readdirSync(p.agents)
      .filter((f) => f.endsWith('.md') && f !== 'AGENTS.md' && f !== 'CLAUDE.md').length;
    const agentScoreRows = node(['scripts/agents/score.mjs', '--per-file', p.agents])
      .stdout.trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => ({ line, score: parseInt(line.split(' ').pop(), 10) }));
    const total = agentScoreRows.reduce((sum, row) => sum + row.score, 0);
    total >= count * floor
      ? ok(`${p.name} agents score: ${total} (floor ${count * floor} = ${count} × ${floor})`)
      : fail(`${p.name} agents score: ${total} below floor ${count * floor} (${count} × ${floor})`);
    let aunder = 0;
    for (const row of agentScoreRows) {
      if (row.score < floor) {
        fail(`  ${p.name} agents:${row.line} below per-file floor ${floor}`);
        aunder = 1;
      }
    }
    if (!aunder) ok(`${p.name} agents per-file all ≥ ${floor}`);
  }

  // Rust source is built before tests so self-tests never resolve a committed
  // or ambient executable.
  let rustBinary = null;
  if (p.rust) {
    if (fs.existsSync(p.rust.dir)) rustBinary = gateRust(p);
    else fail(`${p.name}: Rust source directory missing: ${p.rust.dir}`);
  }

  if (p.distributionContract) {
    nodeOk([p.distributionContract])
      ? ok(`${p.name} distribution contract passed (${path.basename(p.distributionContract)})`)
      : fail(`${p.name} distribution contract failed (run: node ${p.distributionContract})`);
  }

  for (const contract of p.releaseContracts ?? []) {
    nodeOk([contract])
      ? ok(`${p.name} release contract passed (${path.basename(contract)})`)
      : fail(`${p.name} release contract failed (run: node ${contract})`);
  }

  if (p.selftest) {
    const testOptions = p.rust
      ? { env: { ...process.env, [p.rust.source.testBinaryEnv]: rustBinary ?? '' } }
      : undefined;
    nodeOk([p.selftest], testOptions)
      ? ok(`${p.name} self-test passed (${path.basename(p.selftest)})`)
      : fail(
          `${p.name} self-test failed (run: ${p.rust ? `${p.rust.source.testBinaryEnv}=${rustBinary ?? '<fresh-release-binary>'} ` : ''}node ${p.selftest})`,
        );
  }
}

// Rust capability: format, lint, and build the host executable directly from
// source. Published target binaries are produced only by the release workflow;
// local CI never reads or writes plugin bin/ assets or SHA256SUMS.
function gateRust(p) {
  const { dir, source } = p.rust;
  const cargo = findCargo();
  if (!cargo) {
    fail(`${p.name}: cargo not found — Rust source build is required`);
    return null;
  }

  const cargoRun = (args) => spawnSync(cargo, args, { encoding: 'utf8', cwd: dir });
  (cargoRun(['fmt', '--check']).status ?? 1) === 0
    ? ok(`${p.name} cargo fmt --check clean`)
    : fail(`${p.name} cargo fmt --check failed (run: cargo fmt, in ${dir})`);
  (cargoRun(['clippy', '--release', '--all-targets', '--locked', '--', '-D', 'warnings']).status ?? 1) === 0
    ? ok(`${p.name} cargo clippy --release --locked -D warnings clean`)
    : fail(
        `${p.name} cargo clippy failed (run: cargo clippy --release --all-targets --locked -- -D warnings, in ${dir})`,
      );

  if ((cargoRun(['build', '--release', '--locked']).status ?? 1) !== 0) {
    fail(`${p.name} host build failed (run: cargo build --release --locked, in ${dir})`);
    return null;
  }

  const built = path.resolve(REPO, source.builtBinary);
  try {
    if (!fs.statSync(built).isFile()) throw new Error('not a regular file');
    fs.accessSync(built, fs.constants.X_OK);
  } catch {
    fail(`${p.name} host build did not produce executable ${source.builtBinary}`);
    return null;
  }
  ok(`${p.name} source-built host executable ready --release --locked → ${source.builtBinary}`);
  return built;
}

function gateSkills(p, manifest) {
  // category layout — declared categories exist; no skills directly under skills/<name>.
  let layoutOk = true;
  for (const c of manifestCategories(manifest)) {
    if (!fs.existsSync(path.join(p.root, 'skills', c))) {
      fail(`${p.name}: plugin.json references missing category dir skills/${c}`);
      layoutOk = false;
    }
  }
  const strays = fs.readdirSync(p.skills).filter((d) => fs.existsSync(`${p.skills}/${d}/SKILL.md`)).length;
  if (strays > 0) {
    fail(`${p.name}: ${strays} skill(s) at skills/<name>/SKILL.md (need skills/<category>/<name>/SKILL.md)`);
    layoutOk = false;
  }
  if (layoutOk) ok(`${p.name} skill categories declared in plugin.json all exist; no stray skills`);

  nodeOk(['scripts/skills/guard.mjs', p.skills])
    ? ok(`${p.name} skill frontmatter valid`)
    : fail(`${p.name} skill frontmatter invalid (node scripts/skills/guard.mjs ${p.skills})`);
  const naArgs = ['scripts/skills/no-author-scripts.mjs', p.skills, ...(p.agents ? [p.agents] : [])];
  nodeOk(naArgs)
    ? ok(`${p.name} no shipped skill/agent names docks author scripts`)
    : fail(`${p.name} names docks author scripts (node ${naArgs.join(' ')})`);
  nodeOk(['scripts/skills/content-hash.mjs', '--check-only', p.skills])
    ? ok(`${p.name} skill content_hash in sync`)
    : fail(`${p.name} skill content_hash drift (node scripts/skills/content-hash.mjs --backfill ${p.skills})`);
  nodeOk(['tests/skill-trigger-collision.mjs', p.skills])
    ? ok(`${p.name} no unrouted high-overlap skill pair`)
    : fail(`${p.name} trigger-collision (node tests/skill-trigger-collision.mjs ${p.skills})`);
  if (p.transformGuard)
    nodeOk(['scripts/skills/transform-guard.mjs', p.skills])
      ? ok(`${p.name} transform-guard passed`)
      : fail(`${p.name} transform-guard failed (node scripts/skills/transform-guard.mjs ${p.skills})`);

  const scores = node([BUNDLE, 'score', '--per-file', p.skills])
    .stdout.trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [n, s] = l.split(' ');
      return { name: n, cat: n.split('/')[0], score: parseInt(s, 10) };
    });
  for (const c of [...new Set(scores.map((r) => r.cat))]) {
    const floor = floorOf('skills', c);
    if (floor == null) {
      fail(`${p.name}: scripts/config/scoring.json missing skills.${c}`);
      continue;
    }
    const rows = scores.filter((r) => r.cat === c);
    const sum = rows.reduce((a, r) => a + r.score, 0);
    const catFloor = rows.length * floor;
    sum >= catFloor
      ? ok(`${p.name} skills/${c}: ${sum} (floor ${catFloor} = ${rows.length} × ${floor})`)
      : fail(`${p.name} skills/${c}: ${sum} below floor ${catFloor} (${rows.length} × ${floor})`);
  }
  let under = 0;
  let exempt = 0;
  for (const r of scores) {
    if (/^upstream:/m.test(fs.readFileSync(`${p.skills}/${r.name}/SKILL.md`, 'utf8'))) {
      exempt += 1;
      continue;
    }
    const floor = floorOf('skills', r.cat);
    if (floor != null && r.score < floor) {
      fail(`  ${p.name} skills:${r.name} score ${r.score} below per-file floor ${floor}`);
      under = 1;
    }
  }
  if (!under) ok(`${p.name} skills per-file all clear per-category floors (${exempt} upstream skipped)`);
}

// ============================ summary ============================
closePhase();
const timingReport = (status) => ({
  schema: 1,
  mode: { plugin: onlyPlugin },
  status,
  total_ms: Math.max(0, Math.round(performance.now() - startedAt)),
  phases,
  tasks,
});
const writeTimings = (status) => {
  if (options.timingsJson === null) return;
  try {
    fs.writeFileSync(options.timingsJson, `${JSON.stringify(timingReport(status))}\n`, { encoding: 'utf8' });
  } catch (error) {
    try {
      fs.rmSync(options.timingsJson, { force: true });
    } catch {}
    console.error(`[WARN] cannot write timing report ${options.timingsJson}: ${error.message}`);
  }
};

console.log('');
if (failures.length === 0) {
  writeTimings('passed');
  console.log(
    `\x1b[1;32m✔ All ci.mjs checks passed\x1b[0m — ${onlyPlugin ? `plugin '${onlyPlugin}'` : `${targets.length} plugin(s) + repo-wide`}; safe to release.`,
  );
  process.exit(0);
}
writeTimings('failed');
console.log(`\x1b[1;31m✘ ${failures.length} check(s) failed:\x1b[0m`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(1);
