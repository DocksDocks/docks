#!/usr/bin/env node
// ci.mjs — local mirror of .github/workflows/ci.yml. Run before releasing.
// REGISTRY-DRIVEN: repo-wide checks run once, then every plugin in
// scripts/lib/plugins.mjs is gated through the same capability-driven
// gatePlugin() (a check runs only when the descriptor declares that capability).
// Adding a plugin = one registry entry; no edits here.
// Usage: node scripts/ci.mjs [-q] [--plugin <name> | --lane <name>] [--timings-json <path>] [--list]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { beginCommand, startTask, summarizeCommands } from './lib/ci-background-task.mjs';
import { resolveCiLane, resolveCiTargets, selectedAuthorChecks } from './lib/ci-targeting.mjs';
import {
  cargoJobLimit,
  describeEnvelope,
  detectCompetingWork,
  hostResources,
  runtimeAvailability,
} from './lib/host-resources.mjs';
import {
  CLAUDE_MARKETPLACE,
  CODEX_MARKETPLACE,
  claudeManifest,
  codexManifest,
  manifestCategories,
  marketEntryVersion,
  PLUGINS,
  presentPlugins,
  privatizeBuiltBinary,
  resolveBuiltBinary,
  shellHooks,
} from './lib/plugins.mjs';
import { findCargo } from './lib/rust-bin.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
process.chdir(REPO);
const rawArgv = process.argv.slice(2);

function parseArgs(args) {
  const options = { quiet: false, list: false, plugin: null, lane: null, timingsJson: null };
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
const node = (args, options = {}) =>
  runCommand(`node ${args.join(' ')}`, ['node', ...args], { encoding: 'utf8', ...options });
// A failing check must name its own cause. Every `nodeOk` site asserts success, so a
// non-zero exit is always a defect worth reading: print the child's captured output
// rather than only the caller's one-line summary. Without this, a check that passes
// locally and fails on a runner is undiagnosable except by bisecting through CI.
const nodeOk = (args, options) => {
  const result = node(args, options);
  if ((result.status ?? 1) === 0) return true;
  const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (detail) console.error(detail);
  return false;
};
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

function prepareRelayLinuxDelegation(selected) {
  if (process.platform !== 'linux' || !selected.some((plugin) => (plugin.sourceChecks ?? []).length > 0)) return null;
  const configured = process.env.SESSION_RELAY_TEST_CGROUP_ROOT;
  if (configured) {
    let canonical;
    try {
      canonical = fs.realpathSync(configured);
      const stat = fs.statSync(canonical);
      if (!stat.isDirectory() || stat.uid !== process.getuid()) throw new Error('not an owned directory');
    } catch (error) {
      fail(`Session Relay cgroup delegation is invalid: ${error.message}`);
      return null;
    }
    if (canonical !== path.resolve(configured)) {
      fail('Session Relay cgroup delegation must be a canonical path');
      return null;
    }
    process.env.SESSION_RELAY_TEST_CGROUP_ROOT = canonical;
    return null;
  }
  if (process.env.GITHUB_ACTIONS !== 'true') return null;
  const uid = process.getuid();
  const gid = process.getgid();
  const root =
    `/sys/fs/cgroup/session-relay-test-${uid}-` +
    `${process.env.GITHUB_RUN_ID ?? 'run'}-${process.env.GITHUB_RUN_ATTEMPT ?? 'attempt'}-${process.pid}`;
  const runSudo = (args) =>
    runCommand(`sudo -n ${args.join(' ')}`, ['sudo', '-n', ...args], {
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const failureDetail = (result) =>
    result.stderr?.trim() || result.error?.message || result.signal || `exit ${result.status}`;
  const created = runSudo(['mkdir', root]);
  if (created.error || created.signal !== null || created.status !== 0) {
    fail(`Session Relay cgroup delegation could not be created: ${failureDetail(created)}`);
    return null;
  }
  const owned = runSudo(['chown', `${uid}:${gid}`, root]);
  if (owned.error || owned.signal !== null || owned.status !== 0) {
    runSudo(['rmdir', root]);
    fail(`Session Relay cgroup delegation could not be delegated: ${failureDetail(owned)}`);
    return null;
  }
  process.env.SESSION_RELAY_TEST_CGROUP_ROOT = root;
  return () => {
    delete process.env.SESSION_RELAY_TEST_CGROUP_ROOT;
    const removed = runSudo(['rmdir', root]);
    if (removed.error || removed.signal !== null || removed.status !== 0)
      fail(`Session Relay cgroup delegation did not cleanly close: ${failureDetail(removed)}`);
  };
}

// --list: print the registry and exit.
if (options.list) {
  for (const p of PLUGINS) console.log(`${p.name}\t${p.root}\t${fs.existsSync(p.root) ? 'present' : 'MISSING'}`);
  process.exit(0);
}
const resources = hostResources();
const availability = runtimeAvailability({
  cpus: resources.cpus,
  constrained: resources.constrainedBy === 'cgroup',
  cgroupRelative: resources.cgroupRelative,
});
const competing = detectCompetingWork();
const cargoJobs = cargoJobLimit(resources, { availability });
process.env.CARGO_BUILD_JOBS = String(cargoJobs);
ok(describeEnvelope(resources, { cargoJobs, availability, competing }));

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
  javascriptQualityCommands.push(['pnpm', ...args]);
  javascriptQualityTasks.push(
    startTask(name, 'pnpm', args, { cwd: REPO, tasks, commands, phase: activePhase?.name ?? null }),
  );
};
if (onlyPlugin === null && onlyLane === null) {
  scheduleJavaScriptQuality('javascript quality', ['run', 'check:js']);
} else {
  const pathsFor = (field) => [...new Set(targets.flatMap((plugin) => plugin.javascriptQuality?.[field] ?? []))];
  const ciPaths = pathsFor('ci');
  const lintPaths = pathsFor('lint');
  if (ciPaths.length > 0) scheduleJavaScriptQuality('javascript quality', ['exec', 'biome', 'ci', ...ciPaths]);
  if (lintPaths.length > 0)
    scheduleJavaScriptQuality('javascript quality lint', ['exec', 'biome', 'lint', ...lintPaths]);
}

// Catalogs are shared; read once (used by the per-plugin version checks too).
const claudeMarket = targets.length === 0 ? null : readJSON(CLAUDE_MARKETPLACE);
const codexMarket = targets.length === 0 ? null : readJSON(CODEX_MARKETPLACE);

if (repoWide) {
  const { parseDocument } = await import('yaml');
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
  nodeOk(['scripts/tests/ci-observability.mjs'])
    ? ok('CI observability contracts passed')
    : fail('CI observability contracts failed (run: node scripts/tests/ci-observability.mjs)');
  nodeOk(['scripts/tests/test-contracts.mjs'])
    ? ok('test-contract registry passed')
    : fail('test-contract registry failed (run: node scripts/tests/test-contracts.mjs)');
  (runCommand('pnpm run test:unit', ['pnpm', 'run', 'test:unit'], { encoding: 'utf8' }).status ?? 1) === 0
    ? ok('unit tests passed')
    : fail('unit tests failed (run: pnpm run test:unit)');

  section('CI targeting contract');
  const ciTargeting = node(['scripts/tests/ci-plugin-targeting.mjs', '--unit']);
  if ((ciTargeting.status ?? 1) === 0) {
    ok('CI targeting, tag resolution, and cache contract passed');
  } else {
    const detail = [ciTargeting.stdout, ciTargeting.stderr]
      .map((output) => output?.trim())
      .filter(Boolean)
      .join('\n');
    fail(
      `CI targeting contract failed (run: node scripts/tests/ci-plugin-targeting.mjs --unit)${detail ? `\n${detail}` : ''}`,
    );
  }
}

if (authorChecks.has('idempotency')) {
  section('skill-maintainer idempotency');
  nodeOk(['tests/idempotency.mjs'])
    ? ok('skill content_hash determinism; maintainer re-run is a no-op')
    : fail('skill-maintainer idempotency failed (run: node tests/idempotency.mjs)');
}

// shell lint — shellHooks(p) collects each plugin's hooks/*.sh plus a rust
// capability's sh launcher (today: session-relay's bin/relay). Self-skips without shellcheck.
if (targets.length > 0) {
  section('shell lint');
  const bashFiles = targets.flatMap(shellHooks);
  if (bashFiles.length === 0) ok('no bash to lint (all tooling is Node .mjs)');
  else {
    const shellcheck = runCommand(
      `shellcheck -S warning ${bashFiles.join(' ')}`,
      ['shellcheck', '-S', 'warning', ...bashFiles],
      { encoding: 'utf8' },
    );
    if (shellcheck.error) warn('shellcheck not installed — skipped locally (CI enforces)');
    else if ((shellcheck.status ?? 1) === 0) ok(`shellcheck -S warning clean (${bashFiles.length} hook(s))`);
    else fail(`shellcheck warnings (run: shellcheck -S warning ${bashFiles.join(' ')})`);
  }
}

const routingPluginNames = new Set(['docks', 'effect-kit']);
const selectedRoutingPlugin = targets.some(({ name }) => routingPluginNames.has(name));
const collisionGroups = [];
if (selectedRoutingPlugin) {
  collisionGroups.push({
    label: 'docks/effect-kit',
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
    nodeOk(['tests/skill-trigger-collision.mjs', ...roots])
      ? ok(`${label} no unrouted high-overlap skill pair`)
      : fail(`${label} trigger-collision (node tests/skill-trigger-collision.mjs ${roots.join(' ')})`);
  }
}

if (planAuthorChecks) {
  section('plan orchestration');
  nodeOk(['scripts/tests/plan-orchestration.mjs'])
    ? ok('focused PlanRunV1 orchestration contract passed')
    : fail('focused orchestration contract failed (run: node scripts/tests/plan-orchestration.mjs)');
  nodeOk(['scripts/tests/plan-skill-phases.mjs', '--case', 'bounded-workflows'])
    ? ok('three-skill, one-wrapper bounded workflow contract passed')
    : fail(
        'bounded plan workflow contract failed (run: node scripts/tests/plan-skill-phases.mjs --case bounded-workflows)',
      );
  nodeOk(['scripts/tests/plan-queue.mjs'])
    ? ok('queue contract passed')
    : fail('queue contract failed (run: node scripts/tests/plan-queue.mjs)');
  nodeOk(['scripts/tests/plan-skill-phases.mjs', '--case', 'plan-queue'])
    ? ok('plan-queue skill contract passed')
    : fail('plan-queue skill contract failed (run: node scripts/tests/plan-skill-phases.mjs --case plan-queue)');
}

for (const plugin of targets) gatePlugin(plugin);
if (javascriptQualityTasks.length > 0) {
  section('javascript quality');
  const javascriptQualityPassed = (await Promise.all(javascriptQualityTasks)).every(Boolean);
  if (javascriptQualityPassed) ok('JavaScript format and lint checks passed');
  else {
    const renderedCommands = javascriptQualityCommands.map(([command, ...args]) => `${command} ${args.join(' ')}`);
    fail(`JavaScript format and lint checks failed (run: ${renderedCommands.join(' && ')})`);
  }
}

function gatePlugin(p) {
  section(`plugin: ${p.name}`);
  const manifest = readJSON(claudeManifest(p));
  manifest ? ok(`${p.name} plugin.json JSON valid`) : fail(`${p.name} plugin.json JSON invalid`);
  const mv = marketEntryVersion(claudeMarket, p.name);
  if (manifest?.version && manifest.version === mv) ok(`${p.name} version agrees (${manifest.version})`);
  else fail(`${p.name} version drift: plugin.json=${manifest?.version} marketplace.json=${mv}`);

  const v = runCommand(`claude plugin validate ./${p.root}`, ['claude', 'plugin', 'validate', `./${p.root}`], {
    encoding: 'utf8',
  });
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

  const delegationCleanup = rustBinary === null ? null : prepareRelayLinuxDelegation([p]);

  for (const check of p.sourceChecks ?? []) {
    const args = [check.path, ...(check.args ?? [])];
    if (check.binaryArg) {
      if (rustBinary === null) {
        fail(`${p.name} source check requires a fresh Rust binary (${check.path})`);
        continue;
      }
      args.push(check.binaryArg, rustBinary);
    }
    const checkOptions = p.rust
      ? { env: { ...process.env, [p.rust.source.testBinaryEnv]: rustBinary ?? '' } }
      : undefined;
    nodeOk(args, checkOptions)
      ? ok(`${p.name} source check passed (${(check.binaryArg ? args.slice(0, -2) : args).join(' ')})`)
      : fail(`${p.name} source check failed (run: node ${args.join(' ')})`);
  }

  for (const contract of p.releaseContracts ?? []) {
    nodeOk([contract])
      ? ok(`${p.name} release contract passed (${path.basename(contract)})`)
      : fail(`${p.name} release contract failed (run: node ${contract})`);
  }

  if (p.selftest) {
    if (p.rust) {
      const baseEnv = { ...process.env, [p.rust.source.testBinaryEnv]: rustBinary ?? '' };
      const jobsOne = node([p.selftest], {
        env: { ...baseEnv, SESSION_RELAY_TEST_JOBS: '1' },
      });
      const jobsFour = node([p.selftest], {
        env: { ...baseEnv, SESSION_RELAY_TEST_JOBS: '4' },
      });
      const runs = [
        ['jobs-1', jobsOne],
        ['jobs-4', jobsFour],
      ];
      const crashed = runs.filter(([, run]) => (run.status ?? 1) !== 0);
      const drifted = crashed.length === 0 && jobsOne.stdout !== jobsFour.stdout;
      if (crashed.length === 0 && !drifted) {
        ok(`${p.name} self-test passed with byte-identical jobs-1/jobs-4 output (${path.basename(p.selftest)})`);
      } else {
        for (const [label, run] of crashed) {
          const detail = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim();
          console.error(`${label} exited ${run.status ?? 'null'}${detail ? `:\n${detail}` : ' with no output'}`);
        }
        if (drifted) {
          const left = (jobsOne.stdout ?? '').split('\n');
          const right = (jobsFour.stdout ?? '').split('\n');
          const firstDiff = left.findIndex((line, index) => line !== right[index]);
          const at = firstDiff === -1 ? Math.min(left.length, right.length) : firstDiff;
          console.error(
            `jobs-1 (${left.length} lines) vs jobs-4 (${right.length} lines) diverged at line ${at + 1}:\n` +
              `- ${left[at] ?? '<eof>'}\n+ ${right[at] ?? '<eof>'}`,
          );
        }
        const binary = rustBinary ?? '<fresh-release-binary>';
        const reason = drifted
          ? 'jobs-1/jobs-4 output drifted'
          : `failed (${crashed.map(([label]) => label).join(', ')})`;
        fail(
          `${p.name} self-test ${reason} ` +
            `(run twice with ${p.rust.source.testBinaryEnv}=${binary} and SESSION_RELAY_TEST_JOBS=1|4)`,
        );
      }
    } else {
      nodeOk([p.selftest])
        ? ok(`${p.name} self-test passed (${path.basename(p.selftest)})`)
        : fail(`${p.name} self-test failed (run: node ${p.selftest})`);
    }
  }
  if (delegationCleanup !== null) delegationCleanup();
}

// Rust capability: format, lint, and build the host executable directly from
// source. Published target binaries are produced only by the release workflow;
// local CI never reads or writes plugin bin/ assets or SHA256SUMS.
function gateRust(p) {
  const { binName, dir, source } = p.rust;
  const cargo = findCargo();
  if (!cargo) {
    fail(`${p.name}: cargo not found — Rust source build is required`);
    return null;
  }

  const cargoRun = (args) => runCommand(`cargo ${args.join(' ')}`, [cargo, ...args], { encoding: 'utf8', cwd: dir });
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

  const built = resolveBuiltBinary({ source, binName, env: process.env, repo: REPO, cargoCwd: dir });
  try {
    if (!fs.statSync(built).isFile()) throw new Error('not a regular file');
    fs.accessSync(built, fs.constants.X_OK);
  } catch {
    fail(`${p.name} host build did not produce executable ${built}`);
    return null;
  }
  const privateBinary = privatizeBuiltBinary({ binary: built, dir: path.dirname(built) });
  ok(`${p.name} source-built host executable ready --release --locked: source ${built} → private ${privateBinary}`);
  return privateBinary;
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
  if (p.transformGuard)
    nodeOk(['scripts/skills/transform-guard.mjs'])
      ? ok(`repo-wide transform-guard passed (owned by ${p.name})`)
      : fail(`repo-wide transform-guard failed (node scripts/skills/transform-guard.mjs)`);

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
    `\x1b[1;32m✔ All ci.mjs checks passed\x1b[0m — ${ciLane ? `lane '${ciLane.name}'` : onlyPlugin ? `plugin '${onlyPlugin}'` : `${targets.length} plugin(s) + repo-wide`}; safe to release.`,
  );
  process.exit(0);
}
writeTimings('failed');
console.log(`\x1b[1;31m✘ ${failures.length} check(s) failed:\x1b[0m`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(1);
