#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

function gateInvocationArguments(ciSource) {
  const bySuite = new Map();
  const invocationPattern = /\bnode(?:Ok)?\(\[\s*['"](?<suite>[^'"]+\.mjs)['"](?<args>[^[]*?)\]\)/gu;
  for (const match of ciSource.matchAll(invocationPattern)) {
    const args = [...match.groups.args.matchAll(/,\s*(['"])([^'"]*)\1/gu)].map((argument) => argument[2]);
    const invocations = bySuite.get(match.groups.suite) ?? [];
    invocations.push(args);
    bySuite.set(match.groups.suite, invocations);
  }
  return bySuite;
}

function gateSelection(suite, invocations = []) {
  const distinct = [...new Map(invocations.map((args) => [JSON.stringify(args), args])).values()].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
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

function repoSuiteDescriptors(ciSource) {
  const paths = [...ciSource.matchAll(/['"]((?:scripts\/tests|tests)\/[^'"]+\.mjs)['"]/gu)]
    .map((match) => match[1])
    .filter((suite) => !suite.startsWith('scripts/tests/unit/'));
  const selectors = new Map([
    ['scripts/tests/ci-plugin-targeting.mjs', 'scripts/tests/ci-plugin-targeting.mjs --unit'],
  ]);
  const invocations = gateInvocationArguments(ciSource);
  return [...new Set(paths)].sort().map((suite) => {
    const selection = gateSelection(suite, invocations.get(suite));
    return descriptor({
      id: `repo-${slug(path.basename(suite))}`,
      suite,
      kind: 'node-script',
      selector: selectors.get(suite) ?? selection.selector,
      selectedCount: selection.selectedCount,
      executed: true,
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
const packageJson = readJson('package.json');
const ciSource = fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf8');
validateRegistry(registry);

const discoveredDescriptors = [
  ...unitDescriptors(packageJson),
  ...repoSuiteDescriptors(ciSource),
  ...pluginDescriptors(),
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
