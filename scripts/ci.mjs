#!/usr/bin/env bun
// ci.mjs — local mirror of .github/workflows/ci.yml. Run before releasing.
// REGISTRY-DRIVEN: repo-wide checks run once, then every plugin in
// scripts/lib/plugins.mjs is gated through the same capability-driven
// gatePlugin() (a check runs only when the descriptor declares that capability).
// Adding a plugin = one registry entry; no edits here.
// Usage: bun scripts/ci.mjs [-q] [--memo] [--plugin <name> | --lane <name>] [--timings-json <path>] [--list]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beginCommand, startTask, summarizeCommands } from './lib/ci-background-task.mjs';
import { resolveCiLane, resolveCiTargets, selectedAuthorChecks } from './lib/ci-targeting.mjs';
import { changedScopes, computeGateKey, lookupMemo, memoRoot, recordMemo, renderGateCost } from './lib/gate-memo.mjs';
import { describeEnvelope, detectCompetingWork, hostResources, runtimeAvailability } from './lib/host-resources.mjs';
import {
  MARKETPLACE,
  PLUGINS,
  pluginPackageJson,
  presentPlugins,
  REPO_WIDE_JAVASCRIPT_QUALITY,
  shellScripts,
} from './lib/plugins.mjs';
import { eachSkillCandidateDir, findSkillFiles } from './lib/skills-walk.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
process.chdir(REPO);
const rawArgv = process.argv.slice(2);

function parseArgs(args) {
  const options = { quiet: false, list: false, memo: false, plugin: null, lane: null, timingsJson: null };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-q' || arg === '--list' || arg === '--memo') {
      if (seen.has(arg)) throw new Error(`duplicate argument: ${arg}`);
      seen.add(arg);
      if (arg === '-q') options.quiet = true;
      else if (arg === '--memo') options.memo = true;
      else options.list = true;
      continue;
    }
    if (arg === '--plugin' || arg === '--lane' || arg === '--timings-json') {
      if (seen.has(arg)) throw new Error(`duplicate argument: ${arg}`);
      const value = args[index + 1];
      if (!value || value.startsWith('-')) throw new Error(`${arg} requires one value`);
      seen.add(arg);
      index += 1;
      if (arg === '--plugin') options.plugin = value;
      else if (arg === '--lane') options.lane = value;
      else options.timingsJson = value;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (options.list && (options.plugin !== null || options.lane !== null || options.timingsJson !== null)) {
    throw new Error('--list cannot be combined with --plugin, --lane, or --timings-json');
  }
  if (options.plugin !== null && options.lane !== null) {
    throw new Error('--plugin cannot be combined with --lane');
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
const onlyLane = options.lane;
const startedAt = performance.now();
const phases = [];
const tasks = [];
const commands = [];
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
const runCommand = (id, [command, ...args], commandOptions = {}) => {
  const trackedCommand = beginCommand(commands, {
    id,
    kind: 'sync',
    argv: [command, ...args],
    cwd: commandOptions.cwd ?? null,
    phase: activePhase?.name ?? null,
  });
  let result;
  try {
    result = spawnSync(command, args, commandOptions);
    return result;
  } finally {
    trackedCommand.finish({
      status: (result?.status ?? 1) === 0 ? 'passed' : 'failed',
      exit_code: result?.status ?? null,
      signal: result?.signal ?? null,
    });
  }
};
// Author scripts run on Bun. plan-cli.mjs (which drives the shipped plan.mjs) and the
// shipped skill scorer run on Node: consumers invoke those files with `node`, so the
// gate must prove them there.
const node = (args, options = {}) =>
  runCommand(`node ${args.join(' ')}`, ['node', ...args], { encoding: 'utf8', ...options });
const bun = (args, options = {}) =>
  runCommand(`bun ${args.join(' ')}`, ['bun', ...args], { encoding: 'utf8', ...options });
// A failing check must name its own cause. Every `nodeOk`/`bunOk` site asserts success,
// so a non-zero exit is always a defect worth reading: print the child's captured output
// rather than only the caller's one-line summary. Without this, a check that passes
// locally and fails on a runner is undiagnosable except by bisecting through CI.
const succeededOrPrintOutput = (result) => {
  if ((result.status ?? 1) === 0) return true;
  const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (detail) console.error(detail);
  return false;
};
const nodeOk = (args, options) => succeededOrPrintOutput(node(args, options));
const bunOk = (args, options) => succeededOrPrintOutput(bun(args, options));
const readJSON = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const BUNDLE = 'plugins/docks/skills/write-skill/scripts/skill-guard.mjs';
const floorCache = new Map();
const floorOf = (kind) => {
  if (floorCache.has(kind)) return floorCache.get(kind);
  const result = bun(['scripts/config/read-floor.mjs', kind]);
  const parsed = result.status === 0 ? parseInt(result.stdout.trim(), 10) : null;
  const floor = Number.isInteger(parsed) ? parsed : null;
  floorCache.set(kind, floor);
  return floor;
};
// The native omp package rules. omp installs a package whose catalog and package.json parse, and it checks no skill
// or agent, so this gate checks the layout itself. The folders below belong to the Claude Code and Codex plugin
// formats, and a native package has none of them: the repo-wide phase refuses the repository-level folders, and each
// plugin gate refuses the plugin-level folders under its root.
const LEFTOVER_REPO_PATHS = ['.claude-plugin', '.agents/plugins', '.codex'];
const LEFTOVER_PLUGIN_PATHS = ['.claude-plugin', '.codex-plugin'];
// The string fields of each plugin package.json; it also declares `private: true`, `type: "module"`, and `omp`.
const PACKAGE_FIELDS = ['name', 'version', 'description', 'license'];
// The files that omp loads for an `omp.extensions` entry that names a folder, in its order.
const EXTENSION_INDEX_FILES = ['index.ts', 'index.js', 'index.mjs', 'index.cjs'];
// A `${...}` variable. omp sets no plugin root variable for an agent, so the text would stay literal.
const TEXT_VARIABLE = /\$\{[^}\s]*\}/gu;
// The frontmatter block of a markdown file, and the keys of its top-level lines.
const frontmatterOf = (text) => /^---\n([\s\S]*?)\n---(?:\n|$)/u.exec(text)?.[1] ?? null;
const frontmatterKeys = (block) =>
  new Set(block.split('\n').flatMap((line) => /^([A-Za-z][\w-]*):/u.exec(line)?.[1] ?? []));
const frontmatterName = (block) =>
  /^name:[ \t]*(.*)$/mu
    .exec(block)?.[1]
    .trim()
    .replace(/^([\x22\x27])(.*)\1$/u, '$2') ?? null;

// --list: print the registry and exit.
if (options.list) {
  for (const p of PLUGINS) console.log(`${p.name}\t${p.root}\t${fs.existsSync(p.root) ? 'present' : 'MISSING'}`);
  process.exit(0);
}

// Content-keyed memo (opt-in: --memo or DOCKS_CI_MEMO=1). A hit skips the gate and
// says so loudly; a miss, an undescribable working tree, or a disabled memo runs the
// full gate exactly as before. `--timings-json` forces a full run: a memo hit produces
// no commands to report, and a caller asking for a timing report must get a real one.
const memoScope = { plugin: onlyPlugin, lane: onlyLane };
// `--memo`/DOCKS_CI_MEMO asked for the memo; `--timings-json` then declines it (see
// above). The end-of-run cost summary suggests `--memo` only when nobody asked.
const memoRequested = options.memo || process.env.DOCKS_CI_MEMO === '1';
const memoEnabled = memoRequested && options.timingsJson === null;
const MEMO_ROOT = memoRoot();
let memoKey = null;
if (memoEnabled) {
  const computed = computeGateKey({ repo: REPO, scope: memoScope });
  memoKey = computed.key;
  const hit = lookupMemo(memoKey, MEMO_ROOT);
  if (hit !== null) {
    console.log(`\x1b[1;35m▣ CACHED PASS (ci.mjs memo hit) — NOT a fresh gate run\x1b[0m`);
    console.log(`  key         : ${hit.key}`);
    console.log(
      `  recorded at : ${hit.recorded_at} (${Math.round((Date.now() - Date.parse(hit.recorded_at)) / 1000)}s ago)`,
    );
    console.log(`  recorded by : ${hit.git_head ?? 'unknown'} in ${hit.duration_ms ?? '?'}ms`);
    console.log(`  memo file   : ${path.join(MEMO_ROOT, `${hit.key}.json`)}`);
    console.log('  Working-tree bytes, node, platform and tool versions are identical to that run.');
    console.log('  Re-run without --memo (and unset DOCKS_CI_MEMO) to force a full gate.');
    process.exit(0);
  }
  console.log(
    memoKey === null
      ? `\x1b[1;35m▣ ci.mjs memo MISS — working tree not describable (${computed.reason}); running the full gate\x1b[0m`
      : `\x1b[1;35m▣ ci.mjs memo MISS — key ${memoKey.slice(0, 16)}… not recorded; running the full gate\x1b[0m`,
  );
}
const resources = hostResources();
const availability = runtimeAvailability({
  cpus: resources.cpus,
  constrained: resources.constrainedBy === 'cgroup',
  cgroupRelative: resources.cgroupRelative,
});
const competing = detectCompetingWork();
ok(describeEnvelope(resources, { availability, competing }));

// Which plugins to gate (default: every present plugin; --plugin and --lane narrow it).
let ciLane = null;
let targets;
try {
  const plugins = presentPlugins();
  if (onlyLane === null) targets = resolveCiTargets(plugins, onlyPlugin);
  else {
    ciLane = resolveCiLane(plugins, onlyLane);
    targets = ciLane.targets;
  }
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const repoWide = ciLane?.repoWide ?? onlyPlugin === null;
const authorChecks = selectedAuthorChecks(targets);
const planAuthorChecks = authorChecks.has('plan-reviewer');
const javascriptQualityTasks = [];
const javascriptQualityCommands = [];
const scheduleJavaScriptQuality = (name, args) => {
  javascriptQualityCommands.push(['bun', ...args]);
  javascriptQualityTasks.push(
    startTask(name, 'bun', args, { cwd: REPO, tasks, commands, phase: activePhase?.name ?? null }),
  );
};
if (onlyPlugin === null && onlyLane === null) {
  scheduleJavaScriptQuality('javascript quality', ['run', 'check:js']);
} else {
  // Union of the selected plugins' scoped paths, plus the residual set the repo-wide
  // shard owns. Without the residual the always-on shard scheduled no biome at all
  // (it selects zero plugins), so a pull request touching only `tests/`, `biome.json`
  // or `package.json` was neither formatted nor linted by any shard.
  const pathsFor = (field) => [
    ...new Set([
      ...targets.flatMap((plugin) => plugin.javascriptQuality?.[field] ?? []),
      ...(repoWide ? (REPO_WIDE_JAVASCRIPT_QUALITY[field] ?? []) : []),
    ]),
  ];
  const ciPaths = pathsFor('ci');
  const lintPaths = pathsFor('lint');
  if (ciPaths.length > 0) scheduleJavaScriptQuality('javascript quality', ['run', 'biome', 'ci', ...ciPaths]);
  if (lintPaths.length > 0)
    scheduleJavaScriptQuality('javascript quality lint', ['run', 'biome', 'lint', ...lintPaths]);
}

// The catalog is shared; read once (used by the per-plugin version checks too). The
// repo-wide shard selects no plugin but still validates the catalog, so read it
// whenever either a plugin or the repo-wide phase needs it.
const needsCatalogs = repoWide || targets.length > 0;
const market = needsCatalogs ? readJSON(MARKETPLACE) : null;
const catalogEntries = (name) =>
  Array.isArray(market?.plugins) ? market.plugins.filter((entry) => entry?.name === name) : [];

if (repoWide) {
  const { parseDocument } = await import('yaml');
  // ========================== repo-wide checks ==========================
  section('workflow YAML');
  for (const workflowPath of ['.github/workflows/ci.yml', '.github/workflows/dependency-integrity.yml']) {
    try {
      const doc = parseDocument(fs.readFileSync(workflowPath, 'utf8'), {
        prettyErrors: true,
        strict: true,
        uniqueKeys: true,
      });
      doc.errors.length ? fail(`${workflowPath} YAML invalid`) : ok(`${workflowPath} parses (yaml package)`);
    } catch {
      fail(`${workflowPath} YAML invalid`);
    }
  }

  section('marketplace catalogs');
  gateCatalog();

  section('repo-wide guards');
  bunOk(['scripts/tree/guard.mjs'])
    ? ok('tree/guard passed (context-tree nodes)')
    : fail('tree/guard failed (run: bun scripts/tree/guard.mjs)');
  bunOk(['scripts/skills/durable-anchors.mjs'])
    ? ok('durable-anchors passed (no live file:line anchors in long-lived docs)')
    : fail('durable-anchors failed (run: bun scripts/skills/durable-anchors.mjs)');
  bunOk(['scripts/tests/author-tooling.mjs'])
    ? ok('author tooling contracts passed')
    : fail('author tooling contracts failed (run: bun scripts/tests/author-tooling.mjs)');
  bunOk(['scripts/tests/ci-observability.mjs'])
    ? ok('CI observability contracts passed')
    : fail('CI observability contracts failed (run: bun scripts/tests/ci-observability.mjs)');
  bunOk(['scripts/tests/test-contracts.mjs'])
    ? ok('test-contract registry passed')
    : fail('test-contract registry failed (run: bun scripts/tests/test-contracts.mjs)');
  (runCommand('bun run test:unit', ['bun', 'run', 'test:unit'], { encoding: 'utf8' }).status ?? 1) === 0
    ? ok('unit tests passed')
    : fail('unit tests failed (run: bun run test:unit)');

  section('CI targeting contract');
  const ciTargeting = bun(['scripts/tests/ci-plugin-targeting.mjs', '--unit']);
  if ((ciTargeting.status ?? 1) === 0) {
    ok('CI targeting, tag resolution, and cache contract passed');
  } else {
    const detail = [ciTargeting.stdout, ciTargeting.stderr]
      .map((output) => output?.trim())
      .filter(Boolean)
      .join('\n');
    fail(
      `CI targeting contract failed (run: bun scripts/tests/ci-plugin-targeting.mjs --unit)${detail ? `\n${detail}` : ''}`,
    );
  }
}

if (authorChecks.has('idempotency')) {
  section('skill-maintainer idempotency');
  bunOk(['tests/idempotency.mjs'])
    ? ok('skill content_hash determinism; maintainer re-run is a no-op')
    : fail('skill-maintainer idempotency failed (run: bun tests/idempotency.mjs)');
}

// shell lint — shellScripts(p) collects each selected plugin's bundled skill
// scripts (skills/**/scripts/*.sh) and a rust capability's sh launcher, so every
// shipped shell script of a target is linted.
if (targets.length > 0) {
  section('shell lint');
  const shellFiles = targets.flatMap(shellScripts);
  if (shellFiles.length === 0) ok('no shell script to lint');
  else {
    const shellcheck = runCommand(
      `shellcheck -S warning ${shellFiles.join(' ')}`,
      ['shellcheck', '-S', 'warning', ...shellFiles],
      { encoding: 'utf8' },
    );
    if (shellcheck.error) fail('shellcheck could not run — shell lint not validated');
    else if ((shellcheck.status ?? 1) === 0) ok(`shellcheck -S warning clean: ${shellFiles.join(', ')}`);
    else fail(`shellcheck warnings (run: shellcheck -S warning ${shellFiles.join(' ')})`);
  }
}

const routingPluginNames = new Set(['docks']);
const selectedRoutingPlugin = targets.some(({ name }) => routingPluginNames.has(name));
const collisionGroups = [];
if (selectedRoutingPlugin) {
  collisionGroups.push({
    label: 'docks',
    roots: PLUGINS.filter(({ name }) => routingPluginNames.has(name)).map(({ skills }) => skills),
  });
}
const remainingCollisionTargets = targets.filter(({ name }) => !routingPluginNames.has(name));
if (remainingCollisionTargets.length > 0) {
  collisionGroups.push({
    label: remainingCollisionTargets.map(({ name }) => name).join('/'),
    roots: remainingCollisionTargets.map(({ skills }) => skills),
  });
}
if (collisionGroups.length > 0) {
  section('skill trigger collisions');
  for (const { label, roots } of collisionGroups) {
    bunOk(['tests/skill-trigger-collision.mjs', ...roots])
      ? ok(`${label} no unrouted high-overlap skill pair`)
      : fail(`${label} trigger-collision (bun tests/skill-trigger-collision.mjs ${roots.join(' ')})`);
  }
}

if (planAuthorChecks) {
  section('plan orchestration');
  nodeOk(['scripts/tests/plan-cli.mjs'])
    ? ok('plan CLI contract passed')
    : fail('plan CLI contract failed (run: node scripts/tests/plan-cli.mjs)');
}

for (const plugin of targets) await gatePlugin(plugin);
if (javascriptQualityTasks.length > 0) {
  section('javascript quality');
  const javascriptQualityPassed = (await Promise.all(javascriptQualityTasks)).every(Boolean);
  if (javascriptQualityPassed) ok('JavaScript format and lint checks passed');
  else {
    const renderedCommands = javascriptQualityCommands.map(([command, ...args]) => `${command} ${args.join(' ')}`);
    fail(`JavaScript format and lint checks failed (run: ${renderedCommands.join(' && ')})`);
  }
}

async function gatePlugin(p) {
  section(`plugin: ${p.name}`);
  gatePackage(p);
  await gateExtensions(p);
  for (const leftover of LEFTOVER_PLUGIN_PATHS.map((name) => `${p.root}/${name}`)) {
    if (fs.existsSync(leftover)) fail(`${p.name}: ${leftover} is a leftover of another plugin format; remove it`);
  }

  for (const f of p.extraJson)
    readJSON(f) ? ok(`${p.name} ${path.basename(f)} JSON valid`) : fail(`${p.name} ${f} JSON invalid`);

  if (p.skills) {
    if (fs.existsSync(p.skills)) gateSkills(p);
    else fail(`${p.name} declared skills root missing: ${p.skills}`);
  }

  if (p.agents) {
    if (!fs.existsSync(p.agents)) {
      fail(`${p.name} declared agents root missing: ${p.agents}`);
    } else {
      gateAgentFiles(p);
      bunOk(['scripts/agents/guard.mjs', p.agents])
        ? ok(`${p.name} agents/guard passed`)
        : fail(`${p.name} agents/guard failed (run: bun scripts/agents/guard.mjs ${p.agents})`);
      const floor = floorOf('agents');
      const agentFiles = fs
        .readdirSync(p.agents)
        .filter((name) => name.endsWith('.md') && name !== 'AGENTS.md' && name !== 'CLAUDE.md')
        .sort();
      const onDisk = agentFiles.map((name) => name.replace(/\.md$/u, ''));
      const scoreArgs = ['scripts/agents/score.mjs', '--per-file', p.agents];
      const scoreCommand = `bun ${scoreArgs.join(' ')}`;
      const scoreRun = bun(scoreArgs);
      if ((scoreRun.status ?? 1) !== 0) {
        const detail = `${scoreRun.stdout ?? ''}${scoreRun.stderr ?? ''}`.trim();
        if (detail) console.error(detail);
        fail(`${p.name} agent scorer exited ${scoreRun.status ?? 'null'} — no score set to gate (${scoreCommand})`);
      } else {
        const agentScoreRows = (scoreRun.stdout ?? '')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const match = /^(.+)\s+(\S+)$/u.exec(line);
            return { line, name: match?.[1] ?? '', score: Number(match?.[2]) };
          });
        const nonFinite = agentScoreRows.filter((row) => !Number.isFinite(row.score));
        const scoredCounts = new Map();
        for (const row of agentScoreRows) scoredCounts.set(row.name, (scoredCounts.get(row.name) ?? 0) + 1);
        const scored = new Set(scoredCounts.keys());
        const disk = new Set(onDisk);
        const unscored = onDisk.filter((name) => !scored.has(name));
        const notOnDisk = [...scored].filter((name) => !disk.has(name));
        const duplicates = [...scoredCounts].filter(([, count]) => count > 1).map(([name]) => name);
        const scoreSetMismatch =
          agentScoreRows.length !== onDisk.length ||
          unscored.length > 0 ||
          notOnDisk.length > 0 ||
          duplicates.length > 0;

        if (onDisk.length === 0) {
          fail(`${p.name} declared agents root is empty — no agent score set to gate: ${p.agents}`);
        } else if (nonFinite.length > 0) {
          fail(
            `${p.name} agent scorer produced non-finite score(s): ${nonFinite.map((row) => row.line).join(', ')} (${scoreCommand})`,
          );
        } else if (scoreSetMismatch) {
          const mismatchDetails = [
            unscored.length > 0 ? `unscored on disk: ${unscored.join(', ')}` : null,
            notOnDisk.length > 0 ? `not on disk: ${notOnDisk.join(', ')}` : null,
            duplicates.length > 0 ? `duplicate score rows: ${duplicates.join(', ')}` : null,
          ].filter(Boolean);
          fail(
            `${p.name} agent score set does not cover the tree: expected ${onDisk.length} agent(s) on disk, parsed ${agentScoreRows.length} score row(s) from ${scoreCommand}` +
              (mismatchDetails.length > 0 ? ` — ${mismatchDetails.join(' — ')}` : ''),
          );
        } else {
          ok(
            `${p.name} agent score set covers the tree: ${agentScoreRows.length} score rows for ${onDisk.length} agent files on disk`,
          );
          const total = agentScoreRows.reduce((sum, row) => sum + row.score, 0);
          total >= onDisk.length * floor
            ? ok(`${p.name} agents score: ${total} (floor ${onDisk.length * floor} = ${onDisk.length} × ${floor})`)
            : fail(
                `${p.name} agents score: ${total} below floor ${onDisk.length * floor} (${onDisk.length} × ${floor})`,
              );
          let aunder = 0;
          for (const row of agentScoreRows) {
            if (row.score < floor) {
              fail(`  ${p.name} agents:${row.line} below per-file floor ${floor}`);
              aunder = 1;
            }
          }
          if (!aunder) ok(`${p.name} agents per-file all ≥ ${floor}`);
        }
      }
    }
  }

  if (p.distributionContract) {
    bunOk([p.distributionContract])
      ? ok(`${p.name} distribution contract passed (${path.basename(p.distributionContract)})`)
      : fail(`${p.name} distribution contract failed (run: bun ${p.distributionContract})`);
  }

  for (const check of p.sourceChecks ?? []) {
    const args = [check.path, ...(check.args ?? [])];
    const outcome = bun(args);
    const label = args.join(' ');
    if ((outcome.status ?? 1) !== 0) {
      const detail = `${outcome.stdout ?? ''}${outcome.stderr ?? ''}`.trim();
      if (detail) console.error(detail);
      fail(`${p.name} source check failed (run: bun ${args.join(' ')})`);
      continue;
    }
    // A source check may legitimately decline to run: a check whose host prerequisites are
    // absent exits 0 after printing its own SKIP line. Treating exit 0 alone as a pass would
    // render that hole in the gate as green, so surface it as a warning.
    const skipped = (outcome.stdout ?? '').split('\n').find((line) => line.startsWith('SKIP '));
    skipped
      ? warn(`${p.name} source check SKIPPED (${label}) - ${skipped.slice('SKIP '.length)}`)
      : ok(`${p.name} source check passed (${label})`);
  }

  for (const contract of p.releaseContracts ?? []) {
    bunOk([contract])
      ? ok(`${p.name} release contract passed (${path.basename(contract)})`)
      : fail(`${p.name} release contract failed (run: bun ${contract})`);
  }

  if (p.selftest) {
    bunOk([p.selftest])
      ? ok(`${p.name} self-test passed (${path.basename(p.selftest)})`)
      : fail(`${p.name} self-test failed (run: bun ${p.selftest})`);
  }
}

// The catalog: it parses and names the marketplace and its owner, it holds one entry per descriptor and no other
// entry, and no folder of another plugin format is left in the repository.
function gateCatalog() {
  if (market === null) {
    fail(`${MARKETPLACE} is missing or is not valid JSON`);
    return;
  }
  ok(`${MARKETPLACE} JSON valid`);
  typeof market.name === 'string' && market.name !== ''
    ? ok(`${MARKETPLACE} names the marketplace ${market.name}`)
    : fail(`${MARKETPLACE} has no name`);
  typeof market.owner?.name === 'string' && market.owner.name !== ''
    ? ok(`${MARKETPLACE} names its owner`)
    : fail(`${MARKETPLACE} has no owner.name`);
  if (!Array.isArray(market.plugins)) fail(`${MARKETPLACE} has no plugins list`);
  for (const p of PLUGINS) {
    const count = catalogEntries(p.name).length;
    count === 1
      ? ok(`${MARKETPLACE} has one entry for ${p.name}`)
      : fail(`${MARKETPLACE} has ${count} entries for ${p.name}; it needs exactly one`);
  }
  for (const entry of Array.isArray(market.plugins) ? market.plugins : []) {
    if (!PLUGINS.some((p) => p.name === entry?.name))
      fail(`${MARKETPLACE} entry ${entry?.name} has no descriptor in scripts/lib/plugins.mjs`);
  }
  const leftovers = LEFTOVER_REPO_PATHS.filter((leftover) => fs.existsSync(leftover));
  for (const leftover of leftovers) fail(`${leftover} is a leftover of another plugin format; remove it`);
  if (leftovers.length === 0) ok(`no folder of another plugin format (${LEFTOVER_REPO_PATHS.join(', ')})`);
}

// The plugin package.json: it parses and has the native fields, and its name, version, and folder agree with its
// catalog entry.
function gatePackage(p) {
  const file = pluginPackageJson(p);
  const pluginPackage = readJSON(file);
  if (pluginPackage === null) {
    fail(`${p.name} ${file} is missing or is not valid JSON`);
    return;
  }
  ok(`${p.name} ${file} JSON valid`);
  const missing = PACKAGE_FIELDS.filter((field) => typeof pluginPackage[field] !== 'string' || !pluginPackage[field]);
  if (pluginPackage.private !== true) missing.push('private: true');
  if (pluginPackage.type !== 'module') missing.push('type: "module"');
  missing.length === 0
    ? ok(`${p.name} ${file} has the native package fields`)
    : fail(`${p.name} ${file} lacks ${missing.join(', ')}`);
  const omp = pluginPackage.omp;
  omp !== null && typeof omp === 'object' && !Array.isArray(omp)
    ? ok(`${p.name} ${file} declares the omp object`)
    : fail(`${p.name} ${file} must declare an omp object`);
  pluginPackage.name === p.name
    ? ok(`${p.name} ${file} name matches its catalog entry`)
    : fail(`${p.name} ${file} name ${pluginPackage.name} is not its catalog entry name ${p.name}`);
  const entries = catalogEntries(p.name);
  if (entries.length !== 1) {
    fail(`${p.name} needs exactly one entry in ${MARKETPLACE}; it has ${entries.length}`);
    return;
  }
  const [entry] = entries;
  typeof pluginPackage.version === 'string' && pluginPackage.version === entry.version
    ? ok(`${p.name} version agrees (${pluginPackage.version})`)
    : fail(`${p.name} version drift: ${file}=${pluginPackage.version} ${MARKETPLACE}=${entry.version}`);
  const source = typeof entry.source === 'string' ? path.relative(REPO, path.resolve(REPO, entry.source)) : null;
  if (source === null || source.startsWith('..') || path.isAbsolute(source))
    fail(`${p.name} catalog source ${entry.source} is outside the repository`);
  else if (source !== p.root) fail(`${p.name} catalog source ${entry.source} is not ./${p.root}`);
  else if (!fs.existsSync(source)) fail(`${p.name} catalog source ${entry.source} does not exist`);
  else ok(`${p.name} catalog source ${entry.source} exists`);
}

// Each `omp.extensions` entry of the plugin package.json is a module with a default function export, the factory
// that omp calls. omp skips a missing entry without a message, and install checks no entry, so the gate checks them.
// The gate imports the module itself and nothing from omp: an extension declares its own types and imports no omp
// package.
async function gateExtensions(p) {
  // An absent property means no extensions. A property that is present, also with the value null, must be a list.
  const omp = Object(readJSON(pluginPackageJson(p))?.omp);
  const extensions = Object.hasOwn(omp, 'extensions') ? omp.extensions : [];
  if (!Array.isArray(extensions) || extensions.some((entry) => typeof entry !== 'string')) {
    fail(`${p.name} omp.extensions must be an array of strings`);
    return;
  }
  let extensionsOk = true;
  for (const entry of extensions) {
    const problem = await extensionProblem(p.root, entry);
    if (problem !== null) {
      fail(`${p.name} omp.extensions entry ${entry} ${problem}`);
      extensionsOk = false;
    }
  }
  if (extensionsOk && extensions.length > 0)
    ok(`${p.name} omp.extensions entries have a default function export (${extensions.length})`);
}

// The problem of one `omp.extensions` entry, or null when omp can load it. The install copies only the plugin
// folder, so an entry outside it is missing after install: the entry path, the real path of the entry, and the real
// path of the file that omp loads, with each symbolic link resolved, must be inside the real plugin folder. A folder
// entry loads its first `index.*` file, as omp does. A module that throws at import gives a problem, so the gate goes
// on to its summary.
async function extensionProblem(pluginRoot, entry) {
  const outside = (root, file) => path.relative(root, file).split(path.sep)[0] === '..';
  const target = path.resolve(pluginRoot, entry);
  if (outside(path.resolve(pluginRoot), target)) return 'is outside the plugin folder';
  const isFile = (file) => fs.statSync(file, { throwIfNoEntry: false })?.isFile() === true;
  const modulePath = fs.statSync(target, { throwIfNoEntry: false })?.isDirectory()
    ? (EXTENSION_INDEX_FILES.map((name) => path.join(target, name)).find(isFile) ?? target)
    : target;
  if (!isFile(modulePath)) return `is not a file (a folder entry needs one of ${EXTENSION_INDEX_FILES.join(', ')})`;
  const realRoot = fs.realpathSync(pluginRoot);
  if (outside(realRoot, fs.realpathSync(target)) || outside(realRoot, fs.realpathSync(modulePath)))
    return 'is outside the plugin folder after symbolic links resolve';
  let module;
  try {
    module = await import(pathToFileURL(modulePath).href);
  } catch (error) {
    return `throws at import: ${String(error?.message ?? error).replace(/\s+/gu, ' ')}`;
  }
  return typeof module.default === 'function' ? null : 'has no default function export';
}

// Each agent file loads as an omp task agent: it has a name and a description, no `model` key (a Claude Code alias
// such as `sonnet` fails in omp), and no `${...}` variable.
function gateAgentFiles(p) {
  let agentsOk = true;
  for (const file of fs
    .readdirSync(p.agents)
    .filter((name) => name.endsWith('.md'))
    .sort()) {
    const text = fs.readFileSync(path.join(p.agents, file), 'utf8');
    const block = frontmatterOf(text);
    const keys = frontmatterKeys(block ?? '');
    const problems = [];
    if (block === null) problems.push('has no frontmatter');
    for (const key of ['name', 'description']) if (!keys.has(key)) problems.push(`has no ${key}`);
    if (keys.has('model')) problems.push('has a model key');
    const variables = [...new Set(text.match(TEXT_VARIABLE) ?? [])];
    if (variables.length > 0) problems.push(`names ${variables.join(', ')}, which omp does not set`);
    if (problems.length > 0) {
      fail(`${p.name} agent ${file.replace(/\.md$/u, '')} ${problems.join('; ')}`);
      agentsOk = false;
    }
  }
  if (agentsOk) ok(`${p.name} agents load as omp task agents`);
}

function gateSkills(p) {
  // Native layout: each skill is skills/<name>/SKILL.md, one level below skills/, and its frontmatter name is <name>.
  let layoutOk = true;
  for (const file of findSkillFiles(p.skills)) {
    const relative = path.relative(p.skills, file).split(path.sep).join('/');
    const [folder, ...rest] = relative.split('/');
    if (rest.length !== 1) {
      fail(`${p.name}: skills/${relative} is not at skills/<name>/SKILL.md`);
      layoutOk = false;
      continue;
    }
    const name = frontmatterName(frontmatterOf(fs.readFileSync(file, 'utf8')) ?? '');
    if (name !== folder) {
      fail(`${p.name}: skills/${relative} has the name '${name}', not its folder name '${folder}'`);
      layoutOk = false;
    }
  }
  if (layoutOk) ok(`${p.name} skills sit at skills/<name>/SKILL.md under their own name`);

  bunOk(['scripts/skills/guard.mjs', p.skills])
    ? ok(`${p.name} skill frontmatter valid`)
    : fail(`${p.name} skill frontmatter invalid (bun scripts/skills/guard.mjs ${p.skills})`);
  const naArgs = ['scripts/skills/no-author-scripts.mjs', p.skills, ...(p.agents ? [p.agents] : [])];
  bunOk(naArgs)
    ? ok(`${p.name} no shipped skill/agent names docks author scripts`)
    : fail(`${p.name} names docks author scripts (bun ${naArgs.join(' ')})`);
  bunOk(['scripts/skills/content-hash.mjs', '--check-only', p.skills])
    ? ok(`${p.name} skill content_hash in sync`)
    : fail(`${p.name} skill content_hash drift (bun scripts/skills/content-hash.mjs --backfill ${p.skills})`);
  if (p.transformGuard)
    bunOk(['scripts/skills/transform-guard.mjs'])
      ? ok(`repo-wide transform-guard passed (owned by ${p.name})`)
      : fail(`repo-wide transform-guard failed (bun scripts/skills/transform-guard.mjs)`);

  // The scorer's stdout is the ONLY input to both loops below, so a scorer that
  // crashed, was killed, wrote a diagnostic to stderr, or silently skipped skills
  // would leave both loops iterating nothing and still reach the all-clear below.
  // Two independent conditions close that: the child's exit status, and a row
  // count corroborated from disk (same shape as the agents branch above).
  const scoreArgs = [BUNDLE, 'score', '--per-file', p.skills];
  const scoreCommand = `node ${scoreArgs.join(' ')}`;
  const scoreRun = node(scoreArgs);
  if ((scoreRun.status ?? 1) !== 0) {
    const detail = `${scoreRun.stdout ?? ''}${scoreRun.stderr ?? ''}`.trim();
    if (detail) console.error(detail);
    fail(`${p.name} skill scorer exited ${scoreRun.status ?? 'null'} — no score set to gate (${scoreCommand})`);
    return;
  }
  const scores = scoreRun.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [n, s] = l.split(' ');
      return { name: n, score: parseInt(s, 10) };
    });
  // Counted from skill DIRECTORIES, not SKILL.md files: a directory missing its
  // SKILL.md is invisible to the scorer, so counting files would corroborate an
  // empty-by-omission score set at the wrong number.
  const onDisk = [...eachSkillCandidateDir(p.skills)].map(({ name }) => name);
  const scored = new Set(scores.map((r) => r.name));
  const unscored = onDisk.filter((n) => !scored.has(n));
  if (scores.length !== onDisk.length) {
    fail(
      `${p.name} skill score set does not cover the tree: expected ${onDisk.length} skill(s) on disk, parsed ${scores.length} score row(s) from ${scoreCommand}` +
        (unscored.length ? ` — unscored on disk: ${unscored.join(', ')}` : ''),
    );
    return;
  }
  ok(`${p.name} skill score set covers the tree: ${scores.length} score rows for ${onDisk.length} skill dirs on disk`);
  const floor = floorOf('skills');
  if (floor == null) {
    fail(`${p.name}: scripts/config/scoring.json missing skills.per_file_floor`);
    return;
  }
  const sum = scores.reduce((a, r) => a + r.score, 0);
  const totalFloor = scores.length * floor;
  sum >= totalFloor
    ? ok(`${p.name} skills: ${sum} (floor ${totalFloor} = ${scores.length} × ${floor})`)
    : fail(`${p.name} skills: ${sum} below floor ${totalFloor} (${scores.length} × ${floor})`);
  let under = 0;
  let exempt = 0;
  for (const r of scores) {
    if (/^upstream:/m.test(fs.readFileSync(`${p.skills}/${r.name}/SKILL.md`, 'utf8'))) {
      exempt += 1;
      continue;
    }
    if (r.score < floor) {
      fail(`  ${p.name} skills:${r.name} score ${r.score} below per-file floor ${floor}`);
      under = 1;
    }
  }
  if (!under) ok(`${p.name} skills per-file all clear (floor ${floor}; ${exempt} upstream skipped)`);
}

// ============================ summary ============================
closePhase();
const timingReport = (status) => {
  const totalMs = Math.max(0, Math.round(performance.now() - startedAt));
  const reconstruction = summarizeCommands(commands, totalMs);
  const host =
    process.env.GITHUB_ACTIONS === 'true'
      ? {
          run_id: process.env.GITHUB_RUN_ID ?? null,
          run_attempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
          job: process.env.GITHUB_JOB ?? null,
          workflow: process.env.GITHUB_WORKFLOW ?? null,
          runner_os: process.env.RUNNER_OS ?? null,
          runner_arch: process.env.RUNNER_ARCH ?? null,
        }
      : null;
  return {
    schema: ciLane === null ? 1 : 2,
    mode: ciLane === null ? { plugin: onlyPlugin } : { plugin: null, lane: ciLane.name },
    status,
    total_ms: totalMs,
    phases,
    tasks,
    commands,
    reconstruction,
    host,
  };
};
const writeTimings = (report) => {
  if (options.timingsJson === null) return;
  try {
    fs.writeFileSync(options.timingsJson, `${JSON.stringify(report)}\n`, { encoding: 'utf8' });
  } catch (error) {
    try {
      fs.rmSync(options.timingsJson, { force: true });
    } catch {}
    console.error(`[WARN] cannot write timing report ${options.timingsJson}: ${error.message}`);
  }
};
// The same record `--timings-json` would write also drives the end-of-run cost
// summary, so the two can never disagree about what the gate charged.
const report = timingReport(failures.length === 0 ? 'passed' : 'failed');
// The advice line names the scope the working tree actually needs, so it costs one
// `git status` - and only on a full run, which is the only run that prints it.
const costSummary = renderGateCost(report, {
  memoRequested,
  scopes: onlyPlugin === null && onlyLane === null ? changedScopes({ repo: REPO, plugins: PLUGINS }) : null,
});
const printCost = () => {
  if (costSummary !== null) console.log(`\n${costSummary}`);
};

console.log('');
if (failures.length === 0) {
  writeTimings(report);
  console.log(
    `\x1b[1;32m✔ All ci.mjs checks passed\x1b[0m — ${ciLane ? `lane '${ciLane.name}'` : onlyPlugin ? `plugin '${onlyPlugin}'` : `${targets.length} plugin(s) + repo-wide`}; safe to release.`,
  );
  // Only a PASS is memoized, and only under the key computed from the pre-run
  // working tree - the bytes this run actually gated.
  if (memoEnabled && memoKey !== null) {
    try {
      const file = recordMemo(
        memoKey,
        {
          scope: memoScope,
          git_head: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout?.trim() ?? null,
          duration_ms: Math.max(0, Math.round(performance.now() - startedAt)),
        },
        MEMO_ROOT,
      );
      console.log(`\x1b[1;35m▣ memo recorded\x1b[0m ${file}`);
    } catch (error) {
      console.log(`\x1b[1;33m  ⚠\x1b[0m memo not recorded: ${error.message}`);
    }
  }
  printCost();
  process.exit(0);
}
writeTimings(report);
console.log(`\x1b[1;31m✘ ${failures.length} check(s) failed:\x1b[0m`);
for (const f of failures) console.log(`  - ${f}`);
printCost();
process.exit(1);
