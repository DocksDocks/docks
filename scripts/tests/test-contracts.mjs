#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LABEL_CONTRACT_OWNERS,
  PRODUCTION_OUTPUT_LABELS,
  SCENARIOS,
} from '../../plugins/session-relay/test/selftest.mjs';
import { PLUGINS } from '../lib/plugins.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const RUST_INVENTORY_SUITE = 'plugins/session-relay/test/rust-test-inventory.mjs';
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
const SELECTION_KINDS = new Set(['node-test-file', 'node-script', 'cargo-test-target', 'semantic-label-set']);
const RELEASE_ROLES = new Set(['gate', 'release-evidence', 'none']);
const PLATFORMS = new Set(['linux', 'macos']);
const TODAY = new Date().toISOString().slice(0, 10);

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

function descriptor({ id, suite, kind, selector, selectedCount, executed }) {
  return { id, suite, kind, selector, selectedCount, executed };
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
  const executesUnitGlob = unitCommand.includes('scripts/tests/unit/*.test.mjs');
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
    });
  });
}

function repoSuiteDescriptors(ciSource) {
  const paths = [...ciSource.matchAll(/['"]((?:scripts\/tests|tests)\/[^'"]+\.mjs)['"]/gu)]
    .map((match) => match[1])
    .filter((suite) => !suite.startsWith('scripts/tests/unit/'));
  const selectors = new Map([
    ['scripts/tests/ci-plugin-targeting.mjs', 'scripts/tests/ci-plugin-targeting.mjs --unit'],
    ['scripts/tests/plan-skill-phases.mjs', 'scripts/tests/plan-skill-phases.mjs --case bounded-workflows'],
  ]);
  return [...new Set(paths)].sort().map((suite) =>
    descriptor({
      id: `repo-${slug(path.basename(suite))}`,
      suite,
      kind: 'node-script',
      selector: selectors.get(suite) ?? suite,
      selectedCount: 1,
      executed: true,
    }),
  );
}

function sourceCheckId(plugin, check) {
  const stem = slug(path.basename(check.path));
  const suffix = check.args?.length > 0 ? check.args.map(slug).join('-') : 'default';
  return `plugin-${slug(plugin.name)}-source-${stem}-${suffix}`;
}

function commandSelector(suite, args = []) {
  return [suite, ...args].join(' ');
}

function pluginDescriptors() {
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
        }),
      );
    }
  }
  return discovered;
}

function validateOmittedRustTargets(inventory) {
  assert.equal(inventory.schema_version, 5, 'Rust inventory schema must be 5');
  assert.ok(isPlainObject(inventory.cases), 'Rust inventory cases must be an object');
  assert.ok(isPlainObject(inventory.omitted_targets), 'Rust inventory omitted_targets must be an object');
  const rustTests = fs
    .readdirSync(path.join(REPO, 'plugins/session-relay/rust/tests'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.rs'))
    .map((entry) => entry.name.slice(0, -3))
    .sort();
  const expectedOmitted = rustTests.filter((target) => !Object.hasOwn(inventory.cases, target));
  assert.deepEqual(Object.keys(inventory.omitted_targets).sort(), expectedOmitted, 'unowned omitted Rust target');
  for (const [target, omission] of Object.entries(inventory.omitted_targets)) {
    assertExactKeys(omission, ['owner', 'reason', 'expires'], `omitted Rust target ${target}`);
    assertNonemptyString(omission.owner, `omitted Rust target ${target}.owner`);
    assertNonemptyString(omission.reason, `omitted Rust target ${target}.reason`);
    assertIsoDate(omission.expires, `omitted Rust target ${target}.expires`);
  }

  const suiteSource = fs.readFileSync(path.join(REPO, RUST_INVENTORY_SUITE), 'utf8');
  assert.match(suiteSource, /assert\.equal\(Number\(summary\[2\]\), 0,/u, 'Rust inventory must record zero ignored');
  assert.match(suiteSource, /assert\.equal\(Number\(summary\[3\]\), 0,/u, 'Rust inventory must record zero filtered');
}

function rustDescriptors(inventory, plugins) {
  const relay = plugins.find((plugin) => plugin.name === 'session-relay');
  assert.ok(relay, 'Session Relay plugin descriptor is missing');
  const executedTargets = new Set(
    (relay.sourceChecks ?? [])
      .filter((check) => check.path === RUST_INVENTORY_SUITE && check.args?.[0] === '--case')
      .map((check) => check.args[1]),
  );
  return Object.entries(inventory.cases)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([target, entry]) => {
      assertExactKeys(entry, ['tests'], `Rust target ${target}`);
      assert.ok(Array.isArray(entry.tests), `Rust target ${target}.tests must be an array`);
      for (const [index, test] of entry.tests.entries()) {
        assertNonemptyString(test, `Rust target ${target}.tests[${index}]`);
      }
      assert.deepEqual(
        entry.tests,
        [...new Set(entry.tests)].sort(),
        `Rust target ${target}.tests must be sorted and unique`,
      );
      return descriptor({
        id: `rust-target-${slug(target)}`,
        suite: RUST_INVENTORY_SUITE,
        kind: 'cargo-test-target',
        selector: target,
        selectedCount: entry.tests.length,
        executed: executedTargets.has(target),
      });
    });
}

function semanticDescriptor(plugins) {
  assert.deepEqual(
    Object.keys(LABEL_CONTRACT_OWNERS),
    SCENARIOS.map(({ name }) => name),
  );
  for (const scenario of SCENARIOS) {
    const ownership = LABEL_CONTRACT_OWNERS[scenario.name];
    assertExactKeys(ownership, ['owner', 'label_count'], `semantic owner ${scenario.name}`);
    assert.equal(
      ownership.owner,
      path.relative(REPO, scenario.modulePath).split(path.sep).join('/'),
      `semantic owner ${scenario.name} suite drifted`,
    );
    assert.equal(
      ownership.label_count,
      scenario.expectedLabels.length,
      `semantic owner ${scenario.name} count drifted`,
    );
    assert.ok(
      fs.existsSync(path.join(REPO, ownership.owner)),
      `semantic owner suite does not exist: ${ownership.owner}`,
    );
  }
  const selectedCount = Object.values(LABEL_CONTRACT_OWNERS).reduce((sum, owner) => sum + owner.label_count, 0);
  const relaySelftestExecuted = plugins.some(
    (plugin) => plugin.name === 'session-relay' && plugin.selftest === 'plugins/session-relay/test/selftest.mjs',
  );
  assert.equal(PRODUCTION_OUTPUT_LABELS.length, selectedCount, 'production semantic label union drifted');
  return descriptor({
    id: 'session-relay-semantic-label-set',
    suite: 'plugins/session-relay/test/selftest.mjs',
    kind: 'semantic-label-set',
    selector: 'SCENARIOS.expectedLabels',
    selectedCount,
    executed: relaySelftestExecuted,
  });
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

const registry = readJson('scripts/config/test-contracts.json');
const inventory = readJson('plugins/session-relay/test/fixtures/rust-test-inventory.json');
const packageJson = readJson('package.json');
const ciSource = fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf8');
validateRegistry(registry);
validateOmittedRustTargets(inventory);

const discoveredDescriptors = [
  ...unitDescriptors(packageJson),
  ...repoSuiteDescriptors(ciSource),
  ...pluginDescriptors(),
  ...rustDescriptors(inventory, PLUGINS),
  semanticDescriptor(PLUGINS),
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
for (const contract of registry.contracts) {
  const evidence = descriptorById.get(contract.id);
  assert.ok(evidence, `${contract.id} has no discovered selection evidence`);
  assert.equal(contract.owner.suite, evidence.suite, `${contract.id} owner suite differs from discovery`);
  assert.equal(contract.selection.kind, evidence.kind, `${contract.id} selection kind differs from discovery`);
  assert.equal(contract.selection.selector, evidence.selector, `${contract.id} selector differs from gate descriptor`);
  assert.ok(evidence.selectedCount > 0, `${contract.id} selected no tests`);
  assert.ok(
    evidence.selectedCount >= contract.selection.expected_min,
    `${contract.id} selected ${evidence.selectedCount}, below expected minimum ${contract.selection.expected_min}`,
  );
  assert.ok(fs.existsSync(path.join(REPO, contract.owner.suite)), `${contract.id} owner suite does not exist`);
  selected.add(contract.id);
  if (evidence.executed) executed.add(contract.id);
}
assert.ok(selected.size > 0, 'selected set must not be empty');
for (const id of selected) assert.ok(registered.has(id), `selected contract is not registered: ${id}`);
assertSetEqual(executed, selected, 'executed and selected sets differ');

console.log(`PASS test_contracts contracts=${registered.size} discovered=${discovered.size} selected=${selected.size}`);
