#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(pluginRoot, '../..');
const skillRoot = path.join(pluginRoot, 'skills/engineering');

function skill(name) {
  const file = path.join(skillRoot, name, 'SKILL.md');
  const source = fs.readFileSync(file, 'utf8');
  const match = source.match(/^description:\s*["'](.+)["']$/m);
  assert.ok(match, `${name}: single-line quoted description is required by this regression`);
  return { description: match[1], source };
}

const v3 = skill('effect-ts-specialist');
const v4 = skill('effect-v4');
const setup = skill('effect-ts-setup');
const port = skill('effect-ts-port');

const contracts = [
  {
    name: 'Effect 3.x implementation selects the existing specialist',
    checks: [[v3.description, /Effect 3\.x/], [v4.description, /Not for Effect 3\.x; use effect-ts-specialist/]],
  },
  {
    name: 'explicit Effect v4 selects the v4 specialist',
    checks: [[v4.description, /explicitly requests Effect v4/], [v3.description, /Not for Effect v4 \(use effect-v4\)/]],
  },
  {
    name: 'an Effect 4 dependency selects the v4 specialist',
    checks: [[v4.description, /package\.json plus the lockfile resolve `effect` 4\.x/]],
  },
  {
    name: 'Effect setup remains on the v3 setup skill',
    checks: [[setup.description, /bootstrapping Effect 3\.x/], [v4.source, /Explicit Effect 3\.x setup request \| Use `effect-ts-setup`/]],
  },
  {
    name: 'Effect porting remains on the v3 port skill',
    checks: [[port.description, /porting existing Fastify.*to Effect 3\.x/], [v4.source, /Explicit Effect 3\.x Fastify.*port request \| Use `effect-ts-port`/]],
  },
  {
    name: 'generic TypeScript selects no Effect skill',
    checks: [[v4.source, /Generic TypeScript request with no Effect signal \| Do not use an Effect Kit skill/]],
  },
  {
    name: 'package and lockfile evidence are both mandatory',
    checks: [
      [v4.source, /inspect both `package\.json` and the repository lockfile/],
      [v4.source, /`package\.json` and lockfile disagree, or the resolved major is unclear \| Stop/],
    ],
  },
  {
    name: 'Effect v4 setup and porting never reach v3 skills',
    checks: [
      [setup.description, /Not for Effect v4 setup \(unsupported\)/],
      [port.description, /Not for Effect v4 porting\/migration \(unsupported\)/],
      [v4.source, /Effect v4 setup\/port\/migration request \| Report unsupported/],
    ],
  },
];

for (const contract of contracts) {
  for (const [artifact, pattern] of contract.checks) assert.match(artifact, pattern, contract.name);
}

for (const relative of [
  '.claude-plugin/plugin.json',
  '.codex-plugin/plugin.json',
]) {
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, relative), 'utf8'));
  assert.match(manifest.description, /Effect 3\.x/);
  assert.match(manifest.description, /Effect v4 beta/);
}

const marketplace = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude-plugin/marketplace.json'), 'utf8'));
const entry = marketplace.plugins.find((plugin) => plugin.name === 'effect-kit');
assert.ok(entry, 'effect-kit marketplace entry must exist');
assert.match(entry.description, /Effect v4 beta/);

console.log(`effect-kit self-test PASSED: ${contracts.length} shipped routing contracts and manifest discovery checks`);
