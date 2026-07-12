#!/usr/bin/env node
// ci.mjs — local mirror of .github/workflows/ci.yml. Run before releasing.
// REGISTRY-DRIVEN: repo-wide checks run once, then every plugin in
// scripts/lib/plugins.mjs is gated through the same capability-driven
// gatePlugin() (a check runs only when the descriptor declares that capability).
// Adding a plugin = one registry entry; no edits here.
// Usage: node scripts/ci.mjs [-q] [--plugin <name>] [--list]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import {
  PLUGINS, presentPlugins, byName, claudeManifest, codexManifest,
  CLAUDE_MARKETPLACE, CODEX_MARKETPLACE, marketEntryVersion, manifestCategories, shellHooks,
} from './lib/plugins.mjs';
import { findCargo, rustHostTarget, sha256File, verifySha256Sums } from './lib/rust-bin.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
process.chdir(REPO);
const argv = process.argv.slice(2);
const QUIET = argv.includes('-q');
const onlyPlugin = (() => { const i = argv.indexOf('--plugin'); return i >= 0 ? argv[i + 1] : null; })();

const failures = [];
const ok = (m) => { if (!QUIET) console.log(`\x1b[1;32m  ✔\x1b[0m ${m}`); };
const fail = (m) => { console.log(`\x1b[1;31m  ✘\x1b[0m ${m}`); failures.push(m); };
const warn = (m) => { if (!QUIET) console.log(`\x1b[1;33m  ⚠\x1b[0m ${m}`); };
const section = (m) => { if (!QUIET) console.log(`\n\x1b[1m▸ ${m}\x1b[0m`); };
const node = (args) => spawnSync('node', args, { encoding: 'utf8' });
const nodeOk = (args) => (node(args).status ?? 1) === 0;
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const BUNDLE = 'plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs';
const floorOf = (kind, cat) => { const r = node(['scripts/config/read-floor.mjs', kind, ...(cat ? [cat] : [])]); return r.status === 0 ? parseInt(r.stdout.trim(), 10) : null; };

// --list: print the registry and exit.
if (argv.includes('--list')) {
  for (const p of PLUGINS) console.log(`${p.name}\t${p.root}\t${fs.existsSync(p.root) ? 'present' : 'MISSING'}`);
  process.exit(0);
}

// Which plugins to gate (default: every present plugin; --plugin narrows it).
let targets = presentPlugins();
if (onlyPlugin) {
  const p = byName(onlyPlugin);
  if (!p) { console.error(`unknown plugin: ${onlyPlugin} (known: ${PLUGINS.map((x) => x.name).join(', ')})`); process.exit(2); }
  targets = [p];
}

// Catalogs are shared; read once (used by the per-plugin version checks too).
const claudeMarket = readJSON(CLAUDE_MARKETPLACE);
const codexMarket = readJSON(CODEX_MARKETPLACE);

// ============================ repo-wide checks ============================
section('workflow YAML');
try {
  const doc = parseDocument(fs.readFileSync('.github/workflows/ci.yml', 'utf8'), { prettyErrors: true, strict: true, uniqueKeys: true });
  doc.errors.length ? fail('.github/workflows/ci.yml YAML invalid') : ok('.github/workflows/ci.yml parses (node yaml)');
} catch { fail('.github/workflows/ci.yml YAML invalid'); }

section('marketplace catalogs');
claudeMarket ? ok(`${CLAUDE_MARKETPLACE} JSON valid`) : fail(`${CLAUDE_MARKETPLACE} JSON invalid`);
if (fs.existsSync(CODEX_MARKETPLACE)) (codexMarket ? ok(`${CODEX_MARKETPLACE} JSON valid`) : fail(`${CODEX_MARKETPLACE} JSON invalid`));
else warn(`${CODEX_MARKETPLACE} missing — Codex distribution not configured (optional)`);

section('repo-wide guards');
nodeOk(['scripts/tree/guard.mjs']) ? ok('tree/guard passed (context-tree node pairs)') : fail("tree/guard failed (run 'node scripts/tree/guard.mjs')");
nodeOk(['scripts/skills/durable-anchors.mjs']) ? ok('durable-anchors passed (no live file:line anchors in long-lived docs)')
  : fail("durable-anchors failed (run 'node scripts/skills/durable-anchors.mjs')");

section('skill-maintainer idempotency');
nodeOk(['tests/idempotency.mjs']) ? ok('skill content_hash determinism; maintainer re-run is a no-op')
  : fail('skill-maintainer idempotency failed (run: node tests/idempotency.mjs)');

// shell lint — shellHooks(p) collects each plugin's hooks/*.sh plus a rust
// capability's sh launcher (today: session-relay's bin/relay). Self-skips without shellcheck.
section('shell lint');
const bashFiles = PLUGINS.filter((p) => fs.existsSync(p.root)).flatMap(shellHooks);
if (bashFiles.length === 0) ok('no bash to lint (all tooling is Node .mjs)');
else {
  const shellcheck = spawnSync('shellcheck', ['-S', 'warning', ...bashFiles], { encoding: 'utf8' });
  if (shellcheck.error) warn('shellcheck not installed — skipped locally (CI enforces)');
  else if ((shellcheck.status ?? 1) === 0) ok(`shellcheck -S warning clean (${bashFiles.length} hook(s))`);
  else fail(`shellcheck warnings (run: shellcheck -S warning ${bashFiles.join(' ')})`);
}

if (fs.existsSync('docs/scaffold/spec.yaml')) {
  section('scaffold');
  nodeOk(['scripts/scaffold/guard-spec.mjs']) ? ok('scaffold/guard-spec passed (spec coherent; referenced paths resolve)')
    : fail('scaffold/guard-spec failed (run: node scripts/scaffold/guard-spec.mjs)');
  nodeOk(['scripts/scaffold/test.mjs']) ? ok('scaffold/test passed (templates render to a valid skeleton)')
    : fail('scaffold/test failed (run: node scripts/scaffold/test.mjs)');
}

section('plan review policy');
nodeOk(['scripts/tests/plan-review-policy.mjs']) ? ok('plan-review-policy contract passed')
  : fail('plan-review-policy contract failed (run: node scripts/tests/plan-review-policy.mjs)');
nodeOk(['scripts/tests/plan-review-policy-mutations.mjs', '--self-test']) ? ok('plan-review-policy mutations passed')
  : fail('plan-review-policy mutations failed (run: node scripts/tests/plan-review-policy-mutations.mjs --self-test)');

// ============================ per-plugin gate ============================
for (const p of targets) gatePlugin(p);

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
    cp?.skills === './skills/' ? ok(`${p.name} codex skills uses string path "./skills/"`)
      : fail(`${p.name} codex plugin.json skills must be string "./skills/" (arrays are rejected by Codex)`);
    cp?.version === manifest?.version ? ok(`${p.name} codex manifest version matches claude (${cp?.version})`)
      : fail(`${p.name} codex version drift: codex=${cp?.version} claude=${manifest?.version}`);
    (codexMarket?.plugins || []).some((x) => x.name === p.name) ? ok(`${p.name} listed in Codex marketplace (${CODEX_MARKETPLACE})`)
      : fail(`${p.name} missing from ${CODEX_MARKETPLACE}`);
  }

  for (const f of p.extraJson) (readJSON(f) ? ok(`${p.name} ${path.basename(f)} JSON valid`) : fail(`${p.name} ${f} JSON invalid`));

  if (p.skills && fs.existsSync(p.skills)) gateSkills(p, manifest);

  if (p.agents && fs.existsSync(p.agents)) {
    nodeOk(['scripts/agents/guard.mjs', p.agents]) ? ok(`${p.name} agents/guard passed`)
      : fail(`${p.name} agents/guard failed (run: node scripts/agents/guard.mjs ${p.agents})`);
    const floor = floorOf('agents');
    const count = fs.readdirSync(p.agents).filter((f) => f.endsWith('.md') && f !== 'AGENTS.md' && f !== 'CLAUDE.md').length;
    const total = parseInt(node(['scripts/agents/score.mjs', p.agents]).stdout.trim(), 10);
    total >= count * floor ? ok(`${p.name} agents score: ${total} (floor ${count * floor} = ${count} × ${floor})`)
      : fail(`${p.name} agents score: ${total} below floor ${count * floor} (${count} × ${floor})`);
    let aunder = 0;
    for (const l of node(['scripts/agents/score.mjs', '--per-file', p.agents]).stdout.trim().split('\n').filter(Boolean)) {
      const s = parseInt(l.split(' ').pop(), 10);
      if (s < floor) { fail(`  ${p.name} agents:${l} below per-file floor ${floor}`); aunder = 1; }
    }
    if (!aunder) ok(`${p.name} agents per-file all ≥ ${floor}`);
  }

  // Rust gate runs BEFORE the self-test so a broken/mismatched binary fails
  // here with a clear message, not as a confusing self-test spawn error.
  if (p.rust && fs.existsSync(p.rust.dir)) gateRust(p);

  if (p.selftest) (nodeOk([p.selftest]) ? ok(`${p.name} self-test passed (${path.basename(p.selftest)})`)
    : fail(`${p.name} self-test failed (run: node ${p.selftest})`));
}

// Rust capability: fmt + clippy + a --locked release build of the HOST leg
// only (the other legs come from the build-binaries workflow and are
// committed in-tree — git-clone plugin delivery never sees Release assets).
// The host build lands in bin/ and the committed SHA256SUMS is verified
// against it: a divergent local toolchain fails loudly instead of silently
// shipping a byte-different binary.
function gateRust(p) {
  const { dir, bin, binName } = p.rust;
  const cargo = findCargo();
  if (!cargo) warn(`${p.name}: cargo not found — Rust gate skipped locally (CI enforces)`);
  else {
    const cargoRun = (args) => spawnSync(cargo, args, { encoding: 'utf8', cwd: dir });
    (cargoRun(['fmt', '--check']).status ?? 1) === 0 ? ok(`${p.name} cargo fmt --check clean`)
      : fail(`${p.name} cargo fmt --check failed (run: cargo fmt, in ${dir})`);
    (cargoRun(['clippy', '--all-targets', '--', '-D', 'warnings']).status ?? 1) === 0 ? ok(`${p.name} cargo clippy -D warnings clean`)
      : fail(`${p.name} cargo clippy failed (run: cargo clippy --all-targets -- -D warnings, in ${dir})`);
    const host = rustHostTarget();
    if (!host) fail(`${p.name}: unsupported host ${process.platform}/${process.arch} — no launcher target triple`);
    else if ((cargoRun(['build', '--release', '--locked', '--target', host]).status ?? 1) === 0) {
      const built = path.join(dir, 'target', host, 'release', binName);
      const out = path.join(bin, `${binName}-${host}`);
      if (!fs.existsSync(out)) {
        // No committed binary yet (pre-flip window) — stage the local build so
        // the self-test has something to spawn.
        fs.mkdirSync(bin, { recursive: true });
        fs.copyFileSync(built, out);
        fs.chmodSync(out, 0o755);
        ok(`${p.name} host leg built --locked → ${out}`);
      } else if (sha256File(built) === sha256File(out)) {
        // Committed binary is canonical (the build-binaries workflow is the
        // sole producer) — never overwrite it; a matching rebuild proves the
        // committed artifact is reproducible from this source.
        ok(`${p.name} host rebuild byte-identical to committed ${binName}-${host}`);
      } else {
        // Binaries embed build paths + the host linker's output, so only a
        // runner on the SAME image as the producer can expect byte-identity.
        (process.env.CI ? fail : warn)(`${p.name} host rebuild digest differs from committed ${binName}-${host} — CI enforces byte-identity (same image as build-binaries); locally this is expected path/linker variance`);
      }
    } else fail(`${p.name} host build failed (run: rustup target add ${host} && cargo build --release --locked --target ${host}, in ${dir})`);
  }
  if (!fs.existsSync(path.join(bin, 'SHA256SUMS'))) {
    warn(`${p.name}: no committed ${bin}/SHA256SUMS yet (binaries land via build-binaries.yml) — checksum verify skipped`);
    return;
  }
  const { listed, bad } = verifySha256Sums(bin);
  bad.length === 0 ? ok(`${p.name} bin checksums verify (${listed} listed)`)
    : fail(`${p.name} bin checksum failures: ${bad.join(', ')} — local build must be byte-identical to committed (pinned toolchain)`);
}

function gateSkills(p, manifest) {
  // category layout — declared categories exist; no skills directly under skills/<name>.
  let layoutOk = true;
  for (const c of manifestCategories(manifest)) {
    if (!fs.existsSync(path.join(p.root, 'skills', c))) { fail(`${p.name}: plugin.json references missing category dir skills/${c}`); layoutOk = false; }
  }
  const strays = fs.readdirSync(p.skills).filter((d) => fs.existsSync(`${p.skills}/${d}/SKILL.md`)).length;
  if (strays > 0) { fail(`${p.name}: ${strays} skill(s) at skills/<name>/SKILL.md (need skills/<category>/<name>/SKILL.md)`); layoutOk = false; }
  if (layoutOk) ok(`${p.name} skill categories declared in plugin.json all exist; no stray skills`);

  nodeOk(['scripts/skills/guard.mjs', p.skills]) ? ok(`${p.name} skill frontmatter valid`)
    : fail(`${p.name} skill frontmatter invalid (node scripts/skills/guard.mjs ${p.skills})`);
  const naArgs = ['scripts/skills/no-author-scripts.mjs', p.skills, ...(p.agents ? [p.agents] : [])];
  nodeOk(naArgs) ? ok(`${p.name} no shipped skill/agent names docks author scripts`)
    : fail(`${p.name} names docks author scripts (node ${naArgs.join(' ')})`);
  nodeOk(['scripts/skills/content-hash.mjs', '--check-only', p.skills]) ? ok(`${p.name} skill content_hash in sync`)
    : fail(`${p.name} skill content_hash drift (node scripts/skills/content-hash.mjs --backfill ${p.skills})`);
  nodeOk(['tests/skill-trigger-collision.mjs', p.skills]) ? ok(`${p.name} no unrouted high-overlap skill pair`)
    : fail(`${p.name} trigger-collision (node tests/skill-trigger-collision.mjs ${p.skills})`);
  if (p.transformGuard) (nodeOk(['scripts/skills/transform-guard.mjs', p.skills]) ? ok(`${p.name} transform-guard passed`)
    : fail(`${p.name} transform-guard failed (node scripts/skills/transform-guard.mjs ${p.skills})`));

  const scores = node([BUNDLE, 'score', '--per-file', p.skills]).stdout.trim().split('\n').filter(Boolean)
    .map((l) => { const [n, s] = l.split(' '); return { name: n, cat: n.split('/')[0], score: parseInt(s, 10) }; });
  for (const c of [...new Set(scores.map((r) => r.cat))]) {
    const floor = floorOf('skills', c);
    if (floor == null) { fail(`${p.name}: scripts/config/scoring.json missing skills.${c}`); continue; }
    const rows = scores.filter((r) => r.cat === c);
    const sum = rows.reduce((a, r) => a + r.score, 0);
    const catFloor = rows.length * floor;
    sum >= catFloor ? ok(`${p.name} skills/${c}: ${sum} (floor ${catFloor} = ${rows.length} × ${floor})`)
      : fail(`${p.name} skills/${c}: ${sum} below floor ${catFloor} (${rows.length} × ${floor})`);
  }
  let under = 0; let exempt = 0;
  for (const r of scores) {
    if (/^upstream:/m.test(fs.readFileSync(`${p.skills}/${r.name}/SKILL.md`, 'utf8'))) { exempt += 1; continue; }
    const floor = floorOf('skills', r.cat);
    if (floor != null && r.score < floor) { fail(`  ${p.name} skills:${r.name} score ${r.score} below per-file floor ${floor}`); under = 1; }
  }
  if (!under) ok(`${p.name} skills per-file all clear per-category floors (${exempt} upstream skipped)`);
}

// ============================ summary ============================
console.log('');
if (failures.length === 0) {
  console.log(`\x1b[1;32m✔ All ci.mjs checks passed\x1b[0m — ${onlyPlugin ? `plugin '${onlyPlugin}' + repo-wide` : `${targets.length} plugin(s) + repo-wide`}; safe to release.`);
  process.exit(0);
}
console.log(`\x1b[1;31m✘ ${failures.length} check(s) failed:\x1b[0m`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(1);
