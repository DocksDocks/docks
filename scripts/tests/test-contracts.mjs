#!/usr/bin/env bun
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseDocument } from 'yaml';
import { PLUGINS } from '../lib/plugins.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const ROW_KEYS = [
  'id',
  'version',
  'title',
  'owner',
  'selection',
  'platforms',
  'toolchains',
  'release_role',
  'replaces',
  'skips',
];
const OWNER_KEYS = ['suite', 'layer'];
const SELECTION_KEYS = ['kind', 'selector', 'expected_min'];
const SKIP_KEYS = ['selector', 'owner', 'reason', 'expires'];
const LAYERS = new Set(['unit', 'integration', 'contract', 'smoke']);
const SELECTION_KINDS = new Set(['node-test-file', 'node-script']);
const RELEASE_ROLES = new Set(['gate', 'release-evidence', 'none']);
const PLATFORMS = new Set(['linux', 'macos']);
// A `skip.expires` waiver is invalidated by the passage of time, so the real clock is the input here:
// pinning this to a constant would let an expired waiver pass forever. Override it only to test this
// validator itself, never to silence the alarm.
const TODAY = process.env.DOCKS_TEST_TODAY ?? new Date().toISOString().slice(0, 10);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO, relativePath), 'utf8'));
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, keys, label) {
  assert.ok(isPlainObject(value), `${label} must be a plain object`);
  assert.deepEqual(Object.keys(value), keys, `${label} has unknown, missing, or reordered keys`);
}

function assertNonemptyString(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`);
  assert.ok(value.length > 0, `${label} must not be empty`);
}

function assertSortedStrings(value, label, { nonempty = false, allowed = null } = {}) {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  if (nonempty) assert.ok(value.length > 0, `${label} must not be empty`);
  value.forEach((entry, index) => {
    assertNonemptyString(entry, `${label}[${index}]`);
    if (allowed !== null) assert.ok(allowed.has(entry), `${label}[${index}] is unknown: ${entry}`);
  });
  assert.deepEqual(value, [...new Set(value)].sort(), `${label} must be sorted and unique`);
}

function assertIsoDate(value, label) {
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/, `${label} must be an ISO YYYY-MM-DD date`);
  const date = new Date(`${value}T00:00:00.000Z`);
  assert.equal(date.toISOString().slice(0, 10), value, `${label} must be a real calendar date`);
  assert.ok(value >= TODAY, `${label} expired in the past: ${value}`);
}

function assertRelativeFile(value, label) {
  assertNonemptyString(value, label);
  assert.equal(path.isAbsolute(value), false, `${label} must be repository-relative`);
  assert.equal(value.split(path.sep).includes('..'), false, `${label} must not traverse outside the repository`);
}

function validateRegistry(registry) {
  assertExactKeys(registry, ['schema', 'contracts'], 'registry');
  assert.equal(registry.schema, 1, 'registry schema must be 1');
  assert.ok(Array.isArray(registry.contracts), 'registry contracts must be an array');

  const ids = new Set();
  const ownership = new Set();
  for (const [index, contract] of registry.contracts.entries()) {
    const label = `contracts[${index}]`;
    assertExactKeys(contract, ROW_KEYS, label);
    assertNonemptyString(contract.id, `${label}.id`);
    assert.match(contract.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${label}.id must be kebab-case`);
    assert.equal(ids.has(contract.id), false, `duplicate contract id: ${contract.id}`);
    ids.add(contract.id);
    assert.ok(
      Number.isSafeInteger(contract.version) && contract.version > 0,
      `${contract.id}.version must be positive`,
    );
    assertNonemptyString(contract.title, `${contract.id}.title`);

    assertExactKeys(contract.owner, OWNER_KEYS, `${contract.id}.owner`);
    assertRelativeFile(contract.owner.suite, `${contract.id}.owner.suite`);
    assert.ok(LAYERS.has(contract.owner.layer), `${contract.id}.owner.layer is unknown`);

    assertExactKeys(contract.selection, SELECTION_KEYS, `${contract.id}.selection`);
    assert.ok(SELECTION_KINDS.has(contract.selection.kind), `${contract.id}.selection.kind is unknown`);
    assertNonemptyString(contract.selection.selector, `${contract.id}.selection.selector`);
    assert.ok(
      Number.isSafeInteger(contract.selection.expected_min) && contract.selection.expected_min > 0,
      `${contract.id}.selection.expected_min must be a positive integer`,
    );
    const ownerSelector = `${contract.owner.suite}\u0000${contract.selection.selector}`;
    assert.equal(ownership.has(ownerSelector), false, `duplicate owner and selector pair: ${contract.id}`);
    ownership.add(ownerSelector);

    assertSortedStrings(contract.platforms, `${contract.id}.platforms`, { nonempty: true, allowed: PLATFORMS });
    assertSortedStrings(contract.toolchains, `${contract.id}.toolchains`);
    assert.ok(RELEASE_ROLES.has(contract.release_role), `${contract.id}.release_role is unknown`);
    assertSortedStrings(contract.replaces, `${contract.id}.replaces`);
    assert.ok(Array.isArray(contract.skips), `${contract.id}.skips must be an array`);
    for (const [skipIndex, skip] of contract.skips.entries()) {
      const skipLabel = `${contract.id}.skips[${skipIndex}]`;
      assertExactKeys(skip, SKIP_KEYS, skipLabel);
      assertNonemptyString(skip.selector, `${skipLabel}.selector`);
      assertNonemptyString(skip.owner, `${skipLabel}.owner`);
      assertNonemptyString(skip.reason, `${skipLabel}.reason`);
      assertIsoDate(skip.expires, `${skipLabel}.expires`);
    }
  }

  for (const contract of registry.contracts) {
    for (const replaced of contract.replaces) {
      assert.ok(ids.has(replaced), `${contract.id}.replaces has dangling target: ${replaced}`);
      assert.notEqual(replaced, contract.id, `${contract.id} cannot replace itself`);
    }
  }
}

function slug(value) {
  return value
    .replace(/\.test\.mjs$|\.mjs$/u, '')
    .replace(/[^a-zA-Z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .toLowerCase();
}

function descriptor({ id, suite, kind, selector, selectedCount, executed, runners, runnerSource }) {
  return { id, suite, kind, selector, selectedCount, executed, runners, runnerSource };
}

function distinctRunners(invocations = []) {
  return [...new Set(invocations.map(({ runner }) => runner))].sort();
}

function unitDescriptors(packageJson) {
  const directory = path.join(REPO, 'scripts/tests/unit');
  const unitFiles = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
    .map((entry) => entry.name)
    .sort();
  const unitCommand = packageJson.scripts?.['test:unit'];
  assert.equal(typeof unitCommand, 'string', 'package.json must declare scripts.test:unit');
  // Only Bun's test runner registers the files' test() calls; `bun <file>` would run one file as a plain script.
  const executesUnitGlob = /^bun test\b/u.test(unitCommand) && unitCommand.includes('./scripts/tests/unit/*.test.mjs');
  const unitRunner = unitCommand.trim().split(/\s+/u)[0];
  return unitFiles.map((file) => {
    const suite = `scripts/tests/unit/${file}`;
    const source = fs.readFileSync(path.join(REPO, suite), 'utf8');
    const selectedCount = [...source.matchAll(/\btest\s*\(/gu)].length;
    return descriptor({
      id: `unit-${slug(file)}`,
      suite,
      kind: 'node-test-file',
      selector: suite,
      selectedCount,
      executed: executesUnitGlob,
      runners: [unitRunner],
      runnerSource: 'package.json scripts.test:unit',
    });
  });
}
function executableCodePositions(source) {
  const positions = new Uint8Array(source.length);
  let state = 'code';
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (state === 'code') {
      if (current === '/' && next === '/') {
        state = 'line-comment';
        index += 1;
      } else if (current === '/' && next === '*') {
        state = 'block-comment';
        index += 1;
      } else if (current === "'" || current === '"' || current === '`') {
        state = current;
      } else {
        positions[index] = 1;
      }
    } else if (state === 'line-comment') {
      if (current === '\n') {
        state = 'code';
        positions[index] = 1;
      }
    } else if (state === 'block-comment') {
      if (current === '*' && next === '/') {
        state = 'code';
        index += 1;
      }
    } else if (current === '\\') {
      index += 1;
    } else if (current === state) {
      state = 'code';
    }
  }
  return positions;
}

// A plugin descriptor suite reaches the runner through gatePlugin's parameter, sometimes by way of a loop variable or
// an argument array, so follow the nearest preceding binding back to the descriptor field it reads.
function pluginDescriptorField(ciSource, codePositions, expression, position, pluginParameter) {
  const [root, field] = expression.split('.');
  if (root === pluginParameter) return field ?? null;
  const bindingPattern = new RegExp(
    String.raw`\b(?:const\s+${root}\s*=\s*\[\s*|for\s*\(\s*const\s+${root}\s+of\s+)(?<source>[A-Za-z_][\w.]*)`,
    'gu',
  );
  let binding = null;
  for (const candidate of ciSource.slice(0, position).matchAll(bindingPattern)) {
    if (codePositions[candidate.index] === 1) binding = candidate;
  }
  if (binding === null) return null;
  return pluginDescriptorField(ciSource, codePositions, binding.groups.source, binding.index, pluginParameter);
}

function gateInvocationArguments(ciSource) {
  const bySuite = new Map();
  const byPluginField = new Map();
  const codePositions = executableCodePositions(ciSource);
  const pluginParameter = /\bfunction gatePlugin\((?<name>[A-Za-z_]\w*)\)/u.exec(ciSource)?.groups.name;
  assert.ok(pluginParameter, 'scripts/ci.mjs must declare gatePlugin(<plugin>) to gate plugin descriptor suites');
  const invocationPattern =
    /\b(?<runner>node|bun)(?:Ok)?\((?:\[\s*(?:['"](?<suite>[^'"]+\.mjs)['"]|(?<expression>[A-Za-z_][\w.]*))(?<args>[^[]*?)\]|(?<variable>[A-Za-z_]\w*))\)/gu;
  for (const match of ciSource.matchAll(invocationPattern)) {
    if (codePositions[match.index] !== 1) continue;
    const { runner, suite, expression, variable } = match.groups;
    if (suite === undefined) {
      const field = pluginDescriptorField(
        ciSource,
        codePositions,
        expression ?? variable,
        match.index,
        pluginParameter,
      );
      if (field === null) continue;
      const invocations = byPluginField.get(field) ?? [];
      invocations.push({ runner, args: [] });
      byPluginField.set(field, invocations);
      continue;
    }
    const args = [...match.groups.args.matchAll(/,\s*(['"])([^'"]*)\1/gu)].map((argument) => argument[2]);
    const invocations = bySuite.get(suite) ?? [];
    invocations.push({ runner, args });
    bySuite.set(suite, invocations);
  }
  return { bySuite, byPluginField };
}

function gateSelection(suite, invocations = []) {
  const distinct = [...new Map(invocations.map(({ args }) => [JSON.stringify(args), args])).values()].sort(
    (left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
  if (distinct.length === 0) return { selector: suite, selectedCount: 1 };
  if (distinct.length === 1) return { selector: [suite, ...distinct[0]].join(' '), selectedCount: 1 };

  const commonFlag = distinct[0][0];
  const sameFlagCases =
    commonFlag?.startsWith('--') && distinct.every((args) => args.length === 2 && args[0] === commonFlag);
  const selector = sameFlagCases
    ? `${suite} ${commonFlag} ${distinct
        .map(([, value]) => value)
        .sort()
        .join('|')}`
    : `${suite} ${distinct.map((args) => JSON.stringify(args)).join('|')}`;
  return { selector, selectedCount: distinct.length };
}

function repoSuiteDescriptors({ bySuite: invocations }) {
  // The registry certifies commands the gate executes; a path in prose or diagnostics only names a suite.
  const paths = [...invocations.keys()].filter(
    (suite) =>
      (suite.startsWith('scripts/tests/') || suite.startsWith('tests/')) && !suite.startsWith('scripts/tests/unit/'),
  );
  const selectors = new Map([
    ['scripts/tests/ci-plugin-targeting.mjs', 'scripts/tests/ci-plugin-targeting.mjs --unit'],
  ]);
  return [...new Set(paths)].sort().map((suite) => {
    const selection = gateSelection(suite, invocations.get(suite));
    return descriptor({
      id: `repo-${slug(path.basename(suite))}`,
      suite,
      kind: 'node-script',
      selector: selectors.get(suite) ?? selection.selector,
      selectedCount: selection.selectedCount,
      executed: true,
      runners: distinctRunners(invocations.get(suite)),
      runnerSource: 'scripts/ci.mjs',
    });
  });
}

function sourceCheckId(plugin, check) {
  const stem = slug(path.basename(check.path));
  const suffix = check.args?.length > 0 ? check.args.map(slug).join('-') : 'default';
  return `plugin-${slug(plugin.name)}-source-${stem}-${suffix}`;
}

function commandSelector(suite, args = []) {
  return [suite, ...args].join(' ');
}

function pluginDescriptors({ byPluginField }) {
  const runnersOf = (field) => {
    const runners = distinctRunners(byPluginField.get(field));
    assert.ok(runners.length > 0, `scripts/ci.mjs gatePlugin() never runs the plugin descriptor field ${field}`);
    return runners;
  };
  const discovered = [];
  for (const plugin of PLUGINS) {
    if (plugin.selftest) {
      discovered.push(
        descriptor({
          id: `plugin-${slug(plugin.name)}-selftest`,
          suite: plugin.selftest,
          kind: 'node-script',
          selector: plugin.selftest,
          selectedCount: 1,
          executed: true,
          runners: runnersOf('selftest'),
          runnerSource: 'scripts/ci.mjs',
        }),
      );
    }
    if (plugin.distributionContract) {
      discovered.push(
        descriptor({
          id: `plugin-${slug(plugin.name)}-distribution-contract`,
          suite: plugin.distributionContract,
          kind: 'node-script',
          selector: plugin.distributionContract,
          selectedCount: 1,
          executed: true,
          runners: runnersOf('distributionContract'),
          runnerSource: 'scripts/ci.mjs',
        }),
      );
    }
    for (const check of plugin.sourceChecks ?? []) {
      discovered.push(
        descriptor({
          id: sourceCheckId(plugin, check),
          suite: check.path,
          kind: 'node-script',
          selector: commandSelector(check.path, check.args),
          selectedCount: 1,
          executed: true,
          runners: runnersOf('sourceChecks'),
          runnerSource: 'scripts/ci.mjs',
        }),
      );
    }
    for (const suite of plugin.releaseContracts ?? []) {
      discovered.push(
        descriptor({
          id: `plugin-${slug(plugin.name)}-release-${slug(path.basename(suite))}`,
          suite,
          kind: 'node-script',
          selector: suite,
          selectedCount: 1,
          executed: true,
          runners: runnersOf('releaseContracts'),
          runnerSource: 'scripts/ci.mjs',
        }),
      );
    }
  }
  return discovered;
}

function assertSetEqual(actual, expected, label) {
  const missing = [...expected].filter((value) => !actual.has(value)).sort();
  const unknown = [...actual].filter((value) => !expected.has(value)).sort();
  assert.deepEqual(
    { missing, unknown },
    { missing: [], unknown: [] },
    `${label}: missing=[${missing.join(', ')}] unknown=[${unknown.join(', ')}]`,
  );
}

// The registry's toolchain tokens must follow the gate: CI pins Node in the workflow and Bun in package.json, so a
// suite whose runner changes, or a runtime major bump, makes every affected contract name the new runner.
function nodeToolchain() {
  const workflowPath = '.github/workflows/ci.yml';
  const document = parseDocument(fs.readFileSync(path.join(REPO, workflowPath), 'utf8'));
  assert.deepEqual(document.errors, [], `${workflowPath} must parse as YAML`);
  const versions = new Set();
  for (const [jobId, job] of Object.entries(document.toJS()?.jobs ?? {})) {
    for (const step of job?.steps ?? []) {
      if (typeof step?.uses !== 'string' || !step.uses.startsWith('actions/setup-node@')) continue;
      const version = step.with?.['node-version'];
      assert.ok(
        version !== undefined && version !== null && String(version).length > 0,
        `${workflowPath} job ${jobId} setup-node step must set node-version`,
      );
      versions.add(String(version));
    }
  }
  assert.ok(versions.size > 0, `${workflowPath} must set node-version in a setup-node step`);
  assert.equal(
    versions.size,
    1,
    `${workflowPath} setup-node steps disagree on node-version: ${[...versions].sort().join(', ')}`,
  );
  const [version] = versions;
  const major = /^v?(?<major>\d+)(?:\.|$)/u.exec(version)?.groups.major;
  assert.ok(major, `${workflowPath} node-version must name a numeric major version: ${version}`);
  return `node-${major}`;
}

function bunToolchain(packageJson) {
  const major = /^bun@(?<major>\d+)\./u.exec(packageJson.packageManager ?? '')?.groups.major;
  assert.ok(major, `package.json packageManager must pin bun@<major>.<minor>.<patch>: ${packageJson.packageManager}`);
  return `bun-${major}`;
}

const FIXTURE_ROOT = 'scripts/tests/fixtures';

// Sorted repository-relative POSIX paths, so that evidence reads the same on each platform.
function filesUnder(relativeDirectory) {
  const absolute = path.join(REPO, relativeDirectory);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) return [];
  const files = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...filesUnder(relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}

// The `env` options that take an operand, as GNU and BSD `env` read them: -u NAME unsets, -C DIR changes folder,
// -P PATH sets the search path. -S STRING is also an operand, but its words are more `env` arguments.
const ENV_OPERAND_FLAGS = new Set(['u', 'C', 'P']);
const ENV_OPERAND_LONG = new Set(['--unset', '--chdir']);

// The interpreter of a #! line: null if the source has no #! line, and '' if the line names no interpreter.
// `#!/usr/bin/env [options] [NAME=VALUE...] <name>` finds <name> on PATH, so the options, their operands, and the
// assignments come before the interpreter and are not it.
export function shebangInterpreter(source) {
  const line = /^#!(?<line>[^\n]*)/u.exec(source)?.groups.line;
  if (line === undefined) return null;
  const [program = '', ...words] = line.trim().split(/\s+/u).filter(Boolean);
  if (path.posix.basename(program) !== 'env') return path.posix.basename(program);
  const pending = [...words];
  while (pending.length > 0) {
    const word = pending.shift();
    // `--` ends the options, but `env` still reads NAME=VALUE assignments after it.
    if (word === '--') return path.posix.basename(pending.find((rest) => !/^[^=]+=/u.test(rest)) ?? '');
    if (word === '-' || word === '--ignore-environment') continue;
    if (word.startsWith('--')) {
      const [name, value] = word.split(/=(.*)/su);
      // The kernel gives `env` the rest of the #! line as one word, and -S splits it; this split already did that.
      if (name === '--split-string') pending.unshift(...(value ?? '').split(/\s+/u).filter(Boolean));
      else if (ENV_OPERAND_LONG.has(name) && value === undefined) pending.shift();
      continue;
    }
    if (word.startsWith('-')) {
      // A cluster such as -iu NAME: the first flag that takes an operand takes the rest of the word or the next word.
      for (let index = 1; index < word.length; index += 1) {
        const flag = word[index];
        const rest = word.slice(index + 1);
        if (flag === 'S') {
          if (rest.length > 0) pending.unshift(rest);
          break;
        }
        if (ENV_OPERAND_FLAGS.has(flag)) {
          if (rest.length === 0) pending.shift();
          break;
        }
      }
      continue;
    }
    if (/^[^=]+=/u.test(word)) continue;
    return path.posix.basename(word);
  }
  return '';
}

// A suite can run a fixture program, as the plan CLI cases run the fake gh from PATH. The suite then needs the
// program's interpreter where it runs, so that interpreter is a runner of each suite that names the fixture.
function fixturePrograms() {
  const programs = [];
  for (const fixture of filesUnder(FIXTURE_ROOT)) {
    const absolute = path.join(REPO, fixture);
    // Only an executable file runs through its #! line; a suite reads each other fixture as data.
    if ((fs.statSync(absolute).mode & 0o111) === 0) continue;
    const interpreter = shebangInterpreter(fs.readFileSync(absolute, 'utf8'));
    if (interpreter === null) continue;
    assert.ok(interpreter.length > 0, `${fixture} has a #! line with no interpreter; name the program that runs it`);
    // A suite names the top folder of a fixture, which it can put on PATH, or a file at the fixture root. The match
    // starts at `fixtures/`, because a suite can name the path from the repository root or from its own folder.
    const [top] = fixture.slice(FIXTURE_ROOT.length + 1).split('/');
    const escaped = `fixtures/${top}`.replace(/[\\^$.*+?()[\]{}|/]/gu, '\\$&');
    programs.push({
      fixture,
      folder: `${FIXTURE_ROOT}/${top}`,
      interpreter,
      reference: new RegExp(String.raw`(?<![\w.-])${escaped}(?![\w.-])`, 'u'),
    });
  }
  return programs;
}

// The files a suite runs: the suite file and, as for scripts/tests/plan-cli.mjs, the files in the folder of its name.
function suiteFiles(suite) {
  const caseFolder = suite.replace(/\.test\.mjs$|\.mjs$/u, '');
  if (caseFolder === suite) return [suite];
  return [suite, ...filesUnder(caseFolder).filter((file) => /\.[cm]?js$/u.test(file))];
}

function fixtureRunners(suite, programs) {
  const runners = [];
  for (const file of suiteFiles(suite)) {
    const source = fs.readFileSync(path.join(REPO, file), 'utf8');
    for (const { fixture, folder, interpreter, reference } of programs) {
      if (!reference.test(source)) continue;
      runners.push({
        runner: interpreter,
        source: `${file} names ${folder}, where ${fixture} runs with ${interpreter}`,
      });
    }
  }
  return runners;
}

// The gate checks the committed registry. A test can give `--registry <path>` to check a changed copy, so that it can
// show that each check rejects the defect that it covers.
function main() {
  const { values: options } = parseArgs({
    options: { registry: { type: 'string', default: 'scripts/config/test-contracts.json' } },
  });
  const registry = JSON.parse(fs.readFileSync(path.resolve(REPO, options.registry), 'utf8'));
  const packageJson = readJson('package.json');
  const ciSource = fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf8');
  validateRegistry(registry);

  const gateInvocations = gateInvocationArguments(ciSource);
  const discoveredDescriptors = [
    ...unitDescriptors(packageJson),
    ...repoSuiteDescriptors(gateInvocations),
    ...pluginDescriptors(gateInvocations),
  ];
  const descriptorById = new Map();
  for (const discovered of discoveredDescriptors) {
    assert.equal(descriptorById.has(discovered.id), false, `duplicate discovered contract id: ${discovered.id}`);
    descriptorById.set(discovered.id, discovered);
  }

  const discovered = new Set(descriptorById.keys());
  const registered = new Set(registry.contracts.map(({ id }) => id));
  assertSetEqual(registered, discovered, 'discovered and registered sets differ');

  const selected = new Set();
  const executed = new Set();
  const toolchainByRunner = new Map([
    ['node', nodeToolchain()],
    ['bun', bunToolchain(packageJson)],
  ]);
  const programs = fixturePrograms();
  const toolchainDifferences = [];
  for (const contract of registry.contracts) {
    const evidence = descriptorById.get(contract.id);
    assert.ok(evidence, `${contract.id} has no discovered selection evidence`);
    assert.equal(contract.owner.suite, evidence.suite, `${contract.id} owner suite differs from discovery`);
    assert.equal(contract.selection.kind, evidence.kind, `${contract.id} selection kind differs from discovery`);
    assert.equal(
      contract.selection.selector,
      evidence.selector,
      `${contract.id} selector differs from gate descriptor`,
    );
    assert.ok(evidence.selectedCount > 0, `${contract.id} selected no tests`);
    assert.ok(
      evidence.selectedCount >= contract.selection.expected_min,
      `${contract.id} selected ${evidence.selectedCount}, below expected minimum ${contract.selection.expected_min}`,
    );
    assert.ok(fs.existsSync(path.join(REPO, contract.owner.suite)), `${contract.id} owner suite does not exist`);
    assert.ok(evidence.runners.length > 0, `${contract.id} has no discovered runner`);
    const runners = [
      ...evidence.runners.map((runner) => ({
        runner,
        source: `${evidence.runnerSource} runs ${evidence.suite} with ${runner}`,
      })),
      ...fixtureRunners(evidence.suite, programs),
    ];
    const sourcesByToolchain = new Map();
    for (const { runner, source } of runners) {
      const toolchain = toolchainByRunner.get(runner);
      assert.ok(
        toolchain,
        `${contract.id} runs with ${runner}, which has no known toolchain token (${source}); map ${runner} to its pinned toolchain in toolchainByRunner`,
      );
      const sources = sourcesByToolchain.get(toolchain) ?? new Set();
      sources.add(source);
      sourcesByToolchain.set(toolchain, sources);
    }
    // An exact list, so that a toolchain which a runner needs cannot go missing, and one which nothing needs cannot
    // stay.
    for (const [toolchain, sources] of [...sourcesByToolchain].sort(([left], [right]) => left.localeCompare(right))) {
      if (!contract.toolchains.includes(toolchain)) {
        toolchainDifferences.push(`${contract.id}.toolchains must list ${toolchain}: ${[...sources].join('; ')}`);
      }
    }
    // The discovered runners are the evidence: they show which toolchains the row needs instead.
    const discoveredRunners = [...new Set(runners.map(({ source }) => source))].join('; ');
    for (const toolchain of contract.toolchains) {
      if (!sourcesByToolchain.has(toolchain)) {
        toolchainDifferences.push(
          `${contract.id}.toolchains lists ${toolchain}, which no discovered runner needs (discovered: ${discoveredRunners})`,
        );
      }
    }
    selected.add(contract.id);
    if (evidence.executed) executed.add(contract.id);
  }
  assert.ok(selected.size > 0, 'selected set must not be empty');
  for (const id of selected) assert.ok(registered.has(id), `selected contract is not registered: ${id}`);
  assertSetEqual(executed, selected, 'executed and selected sets differ');
  // Collected rather than asserted per row so one run names every stale contract.
  assert.deepEqual(
    toolchainDifferences,
    [],
    `contract toolchains differ from the discovered runners; make each row of scripts/config/test-contracts.json list exactly the toolchains that its runners need:\n${toolchainDifferences.join('\n')}`,
  );

  const counts = `contracts=${registered.size} discovered=${discovered.size} selected=${selected.size}`;
  console.log(`PASS test_contracts ${counts}`);
}

// author-tooling.mjs imports shebangInterpreter to test it, and the import must not run the registry check.
if (import.meta.main) main();
