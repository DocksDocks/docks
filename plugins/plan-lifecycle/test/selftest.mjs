#!/usr/bin/env node
// plan-lifecycle self-test — binds the four declarations the extraction relies
// on: the fail-loud routing prerequisite in every external route, closed
// compatibility with docks' parsed major, manifest/catalog version agreement,
// and single ownership in both catalogs plus the author registry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(pluginRoot, '../..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(repoRoot, relative), 'utf8'));
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

// ---- routing prerequisite: byte-identical, exactly once per route ----------
// Keep in lockstep with scripts/tests/plan-skill-phases.mjs and the six files.
const LIFECYCLE_ROUTE_PREREQUISITE =
  'Prerequisite: `plan-lifecycle` must be installed. If `plan-workspace` or `plan-manager` is unavailable, STOP, name the missing `plan-lifecycle` plugin, and do not create or mutate a plan.';
const LIFECYCLE_ROUTE_FILES = [
  'plugins/docks/skills/engineering/refactor/SKILL.md',
  'plugins/docks/skills/engineering/security/SKILL.md',
  'plugins/docks/skills/productivity/context-tree/SKILL.md',
  'plugins/docks/skills/productivity/skill-agent-pipeline/SKILL.md',
  'plugins/effect-kit/skills/engineering/effect-ts-port/SKILL.md',
  'plugins/effect-kit/skills/engineering/effect-ts-setup/SKILL.md',
];
for (const relative of LIFECYCLE_ROUTE_FILES) {
  const occurrences = read(relative).split(LIFECYCLE_ROUTE_PREREQUISITE).length - 1;
  assert.equal(occurrences, 1, `${relative} must carry the absent-lifecycle prerequisite paragraph exactly once`);
}

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
const docksVersion = readJson('plugins/docks/.claude-plugin/plugin.json').version;
const docksMajor = Number.parseInt(docksVersion.split('.')[0], 10);
assert.ok(Number.isInteger(docksMajor), `docks version ${docksVersion} must parse a major`);
assert.ok(
  docksMajor >= compatibility.minimum_docks_major,
  `docks major ${docksMajor} must meet minimum_docks_major ${compatibility.minimum_docks_major}`,
);

// ---- manifest/catalog agreement --------------------------------------------
const claudeMarket = readJson('.claude-plugin/marketplace.json');
const codexMarket = readJson('.agents/plugins/marketplace.json');
const marketVersion = (name) => {
  const entries = claudeMarket.plugins.filter((plugin) => plugin.name === name);
  assert.equal(entries.length, 1, `${name} must have exactly one Claude marketplace entry`);
  return entries[0].version;
};

const claudeManifest = readJson('plugins/plan-lifecycle/.claude-plugin/plugin.json');
const codexManifest = readJson('plugins/plan-lifecycle/.codex-plugin/plugin.json');
assert.equal(claudeManifest.name, 'plan-lifecycle');
assert.equal(codexManifest.name, 'plan-lifecycle');
assert.equal(
  claudeManifest.version,
  codexManifest.version,
  `plan-lifecycle manifests must agree (claude=${claudeManifest.version} codex=${codexManifest.version})`,
);
assert.equal(claudeManifest.version, marketVersion('plan-lifecycle'), 'plan-lifecycle catalog entry must agree');

const effectClaude = readJson('plugins/effect-kit/.claude-plugin/plugin.json');
const effectCodex = readJson('plugins/effect-kit/.codex-plugin/plugin.json');
assert.equal(
  effectClaude.version,
  effectCodex.version,
  `effect-kit manifests must agree (claude=${effectClaude.version} codex=${effectCodex.version})`,
);
assert.equal(effectClaude.version, marketVersion('effect-kit'), 'effect-kit catalog entry must agree');
assert.ok(
  (effectClaude.dependencies ?? []).some(
    (dependency) => dependency.name === 'plan-lifecycle' && dependency.marketplace === 'docks',
  ),
  'effect-kit Claude manifest must declare the plan-lifecycle dependency',
);

// ---- single ownership: both catalogs and the author registry ---------------
const codexEntries = codexMarket.plugins.filter((plugin) => plugin.name === 'plan-lifecycle');
assert.equal(codexEntries.length, 1, 'plan-lifecycle must have exactly one Codex marketplace entry');
assert.equal(codexEntries[0].source?.path, './plugins/plan-lifecycle');
const claudeEntry = claudeMarket.plugins.find((plugin) => plugin.name === 'plan-lifecycle');
assert.equal(claudeEntry.source, './plugins/plan-lifecycle');

const { PLUGINS } = await import(new URL('../../../scripts/lib/plugins.mjs', import.meta.url));
const registered = PLUGINS.filter((plugin) => plugin.name === 'plan-lifecycle');
assert.equal(registered.length, 1, 'the author registry must contain exactly one plan-lifecycle descriptor');
assert.equal(registered[0].root, 'plugins/plan-lifecycle');

console.log(
  'plan-lifecycle self-test PASSED: routing-prerequisite (6 routes), ' +
    `manifest/catalog agreement (plan-lifecycle ${claudeManifest.version}, effect-kit ${effectClaude.version}), ` +
    'registry and both catalogs hold exactly one entry, ' +
    `minimum_docks_major ${compatibility.minimum_docks_major} met by docks major ${docksMajor}`,
);
