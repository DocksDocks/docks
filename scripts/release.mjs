#!/usr/bin/env node
// release.mjs — bump ONE plugin's version, tag, push, and create a GitHub Release.
// REGISTRY-DRIVEN: --plugin picks an entry from scripts/lib/plugins.mjs. Versions
// are per-plugin and independent, so a release targets exactly one plugin.
//
// Usage:
//   node scripts/release.mjs [--dry-run] [--plugin <name>] <new-version>   # e.g. 0.2.0
//   node scripts/release.mjs [--dry-run] [--plugin <name>] patch|minor|major
//   (--plugin defaults to "docks"; use --plugin session-relay for the other)
//
// Runs end-to-end: full ci.mjs gate → bump the plugin's manifests (Claude pair +
// Codex if present) + its marketplace entry → commit+push → claude plugin tag
// --push (<name>--v<ver>) → wait for tag-CI → gh release create (only if CI green).
// --dry-run does everything read-only and PRINTS the destructive steps instead.
//
// Preconditions: clean working tree, gh + claude on PATH.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { byName, PLUGINS, claudeManifest, codexManifest, CLAUDE_MARKETPLACE } from './lib/plugins.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const err = (m) => { console.error(`error: ${m}`); process.exit(1); };
const has = (cmd) => !spawnSync(cmd, ['--version'], { stdio: 'ignore' }).error;
const cap = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', cwd: REPO });
const run = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: REPO }); if ((r.status ?? 1) !== 0) err(`${cmd} ${args.join(' ')} failed`); };

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const DRY = dryRun ? '[dry-run] ' : '';
const pluginName = (() => { const i = argv.indexOf('--plugin'); return i >= 0 ? argv[i + 1] : 'docks'; })();
const positional = argv.filter((a, i) => a !== '--dry-run' && a !== '--plugin' && argv[i - 1] !== '--plugin');
const ARG = positional[0];

const plugin = byName(pluginName);
if (!plugin) err(`unknown plugin: ${pluginName} (known: ${PLUGINS.map((p) => p.name).join(', ')})`);

const PLUGIN_JSON = path.join(REPO, claudeManifest(plugin));
const MARKETPLACE_JSON = path.join(REPO, CLAUDE_MARKETPLACE);
const CODEX_PLUGIN_JSON = path.join(REPO, codexManifest(plugin));
const PLUGIN_PATH = `./${plugin.root}`;

// --- preconditions (external tools only needed for a real run) ---
if (!dryRun && !has('gh')) err('gh is required');
if (!dryRun && !has('claude')) err('claude is required');
if (!fs.existsSync(PLUGIN_JSON)) err(`plugin.json not found at ${PLUGIN_JSON}`);
if (!fs.existsSync(MARKETPLACE_JSON)) err(`marketplace.json not found at ${MARKETPLACE_JSON}`);
if (!dryRun && cap('git', ['status', '--porcelain']).stdout.trim() !== '') err('working tree dirty — commit/stash first');

// --- local CI gate (full repo + all plugins) ---
console.log('Running local ci.mjs...');
if ((spawnSync('node', [path.join(REPO, 'scripts/ci.mjs'), '-q'], { stdio: 'inherit' }).status ?? 1) !== 0) {
  err('scripts/ci.mjs failed — fix issues before releasing (see ci.mjs output)');
}
console.log('');

// --- compute new version (from THIS plugin's manifest) ---
if (!ARG) err('missing version arg (use X.Y.Z, patch, minor, or major)');
const CURRENT = JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8')).version;
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(CURRENT || '');
if (!m) err(`current version not semver: ${CURRENT}`);
const [MAJOR, MINOR, PATCH] = [Number(m[1]), Number(m[2]), Number(m[3])];
let NEW_VERSION;
if (ARG === 'major') NEW_VERSION = `${MAJOR + 1}.0.0`;
else if (ARG === 'minor') NEW_VERSION = `${MAJOR}.${MINOR + 1}.0`;
else if (ARG === 'patch') NEW_VERSION = `${MAJOR}.${MINOR}.${PATCH + 1}`;
else if (/^\d+\.\d+\.\d+$/.test(ARG)) NEW_VERSION = ARG;
else err(`version must be X.Y.Z, patch, minor, or major (got: ${ARG})`);
if (NEW_VERSION === CURRENT) err(`new version equals current (${CURRENT})`);
console.log(`Bumping ${plugin.name}: ${CURRENT} → ${NEW_VERSION}`);

// --- bump this plugin's manifests + marketplace entry ---
// Re-serialize with 2-space indent + trailing newline (matches the committed,
// jq-formatted manifests, so only the version line(s) change).
function bump(file, mutate) {
  const original = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(original);
  mutate(data);
  const out = `${JSON.stringify(data, null, 2)}\n`;
  if (dryRun) {
    const orig = original.split('\n');
    const changed = out.split('\n').filter((l, i) => l !== orig[i]).map((l) => l.trim());
    console.log(`  ${DRY}would write ${path.relative(REPO, file)} (changed: ${changed.join(' | ') || 'none — formatting drift!'})`);
  } else {
    fs.writeFileSync(file, out);
  }
}
bump(PLUGIN_JSON, (d) => { d.version = NEW_VERSION; });
bump(MARKETPLACE_JSON, (d) => { const p = d.plugins.find((x) => x.name === plugin.name); if (p) p.version = NEW_VERSION; });
const codexAdd = [];
if (plugin.codex && fs.existsSync(CODEX_PLUGIN_JSON)) { bump(CODEX_PLUGIN_JSON, (d) => { d.version = NEW_VERSION; }); codexAdd.push(CODEX_PLUGIN_JSON); }

// --- commit + push the bump ---
const addFiles = [claudeManifest(plugin), CLAUDE_MARKETPLACE, ...codexAdd.map((f) => path.relative(REPO, f))];
const TAG_NAME = `${plugin.name}--v${NEW_VERSION}`;
if (dryRun) {
  console.log(`  ${DRY}git add ${addFiles.join(' ')}`);
  console.log(`  ${DRY}git commit -m "chore(release): ${plugin.name} v${NEW_VERSION}"`);
  console.log(`  ${DRY}git push origin HEAD`);
  console.log(`  ${DRY}claude plugin tag --push --message "${plugin.name} plugin %s" ${PLUGIN_PATH}`);
  console.log(`  ${DRY}wait for tag-CI on ${TAG_NAME}, then gh release create (gated on CI green)`);
  console.log(`\n${DRY}OK — no changes written, no tag, no release.`);
  process.exit(0);
}
run('git', ['add', ...addFiles]);
run('git', ['commit', '-m', `chore(release): ${plugin.name} v${NEW_VERSION}`]);
run('git', ['push', 'origin', 'HEAD']);

// --- tag + push (triggers CI on the tag push) ---
run('claude', ['plugin', 'tag', '--push', '--message', `${plugin.name} plugin %s`, PLUGIN_PATH]);
const TAG_SHA = cap('git', ['rev-parse', `${TAG_NAME}^{commit}`]).stdout.trim();

// --- wait for CI on the tag push, gate the release on its result ---
console.log(`\nWaiting for CI on tag ${TAG_NAME} (commit ${TAG_SHA})...`);
let RUN_ID = '';
for (let i = 0; i < 30; i += 1) {
  RUN_ID = cap('gh', ['run', 'list', '--workflow=ci.yml', '--json', 'databaseId,headSha,event',
    '--jq', `.[] | select(.headSha == "${TAG_SHA}" and .event == "push") | .databaseId`]).stdout.trim().split('\n')[0] || '';
  if (RUN_ID) break;
  spawnSync('sleep', ['2']);
}
if (!RUN_ID) err(`no CI run appeared for ${TAG_NAME} after 60s — check Actions manually before releasing`);

console.log(`Watching CI run ${RUN_ID}...\n  https://github.com/DocksDocks/docks/actions/runs/${RUN_ID}`);
if ((spawnSync('gh', ['run', 'watch', RUN_ID, '--exit-status'], { stdio: 'inherit', cwd: REPO }).status ?? 1) !== 0) {
  console.log(`\n✘ CI failed for ${TAG_NAME} — NOT creating GitHub Release.\n`);
  console.log('To recover:');
  console.log(`  1. Investigate: gh run view ${RUN_ID} --log-failed`);
  console.log('  2. Fix on a follow-up commit, then either:');
  console.log(`       a) bump version again: node scripts/release.mjs --plugin ${plugin.name} patch`);
  console.log('       b) or move the tag (loses immutability):');
  console.log(`            git tag -d ${TAG_NAME} && git push origin :refs/tags/${TAG_NAME} && node scripts/release.mjs --plugin ${plugin.name} ${NEW_VERSION}`);
  process.exit(1);
}

// --- release notes from commits since previous tag for THIS plugin ---
const PREV_TAG = cap('git', ['tag', '--list', `${plugin.name}--v*`, '--sort=-version:refname']).stdout.trim().split('\n')[1] || '';
const NOTES = PREV_TAG ? cap('git', ['log', `${PREV_TAG}..HEAD`, '--pretty=format:- %s', '--no-merges']).stdout : 'Initial release.';
const HEADER = PREV_TAG ? `Changes since \`${PREV_TAG}\`:` : '';

run('gh', ['release', 'create', TAG_NAME, '--title', `${plugin.name} v${NEW_VERSION}`,
  '--notes', `${HEADER}\n\n${NOTES}\n\n## Install\n\n\`\`\`\n${plugin.install}\n\`\`\``]);

console.log(`\n✔ Released ${plugin.name} v${NEW_VERSION} (CI green)\n  Tag:    ${TAG_NAME}\n  Github: https://github.com/DocksDocks/docks/releases/tag/${TAG_NAME}`);
