#!/usr/bin/env bun
// Check plugin packaging and compatibility. The author smoke covers the helper.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(pluginRoot, '../..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(repoRoot, relative), 'utf8'));

// ---- compatibility: closed object, integer minimum met by docks ------------
const compatibility = readJson('plugins/plan-lifecycle/compatibility.json');
assert.deepEqual(
  Object.keys(compatibility).sort(),
  ['minimum_docks_major', 'schema'],
  'compatibility.json must stay a closed two-key declaration',
);
assert.equal(compatibility.schema, 1, 'compatibility schema must be 1');
assert.ok(
  Number.isInteger(compatibility.minimum_docks_major) && compatibility.minimum_docks_major >= 0,
  'minimum_docks_major must be a non-negative integer',
);
const docksVersion = readJson('plugins/docks/package.json').version;
const docksMajor = Number.parseInt(docksVersion.split('.')[0], 10);
assert.ok(Number.isInteger(docksMajor), `docks version ${docksVersion} must parse a major`);
assert.ok(
  docksMajor >= compatibility.minimum_docks_major,
  `docks major ${docksMajor} must meet minimum_docks_major ${compatibility.minimum_docks_major}`,
);

// ---- package/catalog agreement ---------------------------------------------
const catalog = readJson('.omp-plugin/marketplace.json');
const catalogEntries = catalog.plugins.filter((plugin) => plugin.name === 'plan-lifecycle');
assert.equal(catalogEntries.length, 1, 'plan-lifecycle must have exactly one entry in .omp-plugin/marketplace.json');
const [catalogEntry] = catalogEntries;
assert.equal(catalogEntry.source, './plugins/plan-lifecycle');

const pluginPackage = readJson('plugins/plan-lifecycle/package.json');
assert.equal(pluginPackage.name, 'plan-lifecycle');
assert.equal(
  pluginPackage.version,
  catalogEntry.version,
  `plan-lifecycle package.json and catalog entry must agree (package=${pluginPackage.version} catalog=${catalogEntry.version})`,
);
assert.ok(
  pluginPackage.omp !== null && typeof pluginPackage.omp === 'object' && !Array.isArray(pluginPackage.omp),
  'plan-lifecycle package.json must declare an omp object',
);

// ---- single ownership: the catalog and the author registry -----------------
const { PLUGINS } = await import(new URL('../../../scripts/lib/plugins.mjs', import.meta.url));
const registered = PLUGINS.filter((plugin) => plugin.name === 'plan-lifecycle');
assert.equal(registered.length, 1, 'the author registry must contain exactly one plan-lifecycle descriptor');
assert.equal(registered[0].root, 'plugins/plan-lifecycle');

console.log(
  `plan-lifecycle self-test PASSED: package/catalog agreement (${pluginPackage.version}), ` +
    'registry and catalog hold exactly one entry, ' +
    `minimum_docks_major ${compatibility.minimum_docks_major} met by docks major ${docksMajor}`,
);
