// plugins.mjs — the registry of plugins this repo ships. SINGLE SOURCE OF TRUTH
// for the author tooling: ci.mjs gates every entry, release.mjs bumps/tags one.
// Adding a plugin = adding one descriptor here (no edits to ci.mjs/release.mjs).
//
// Each descriptor declares paths + capabilities; the tooling runs a check only
// when the capability is present, so a skills-only plugin and a skills+agents+
// selftest plugin share one code path. Versions are PER-PLUGIN and independent
// (each plugin versions separately); the Claude marketplace catalog
// holds one entry per plugin, matched by `name`.
//
// Fields:
//   name          marketplace + tag identity (claude plugin tag → <name>--v<ver>)
//   root          plugin dir under the repo; also the changed-path prefix that maps
//                 a pull-request diff onto this plugin's shard (ci-targeting.mjs
//                 `resolveShardSelection`), so the workflow never duplicates roots
//   ciLane        required plugin validation shard (`core`). `repo` is
//                 the always-on repo-wide shard and no plugin may claim it.
//   javascriptQuality scoped Biome paths (`ci` required, optional `lint`)
//   skills        skills root, or null
//   agents        agents root, or null
//   codex         true when a .codex-plugin/ mirror + Codex marketplace entry ship
//   selftest      path to a runnable self-test, or null
//   rust          Rust binary capability, or null. `source` owns local build
//                 paths; `prebuilt` owns immutable release target/asset naming.
//                 No plugin declares it today; the shape stays documented so a
//                 future Rust plugin needs one descriptor and no tooling edit.
//   extraJson     additional JSON configs to validate (hooks/mcp/etc.)
//   authorChecks  repository author suites owned by this plugin
//   releaseContracts additional release-state/evidence contract tests
//   sourceChecks  ordered source/process/smoke checks
//   transformGuard run scripts/skills/transform-guard.mjs (curated transformers)
//   release       closed data-only policy: plugins own only kind/install.
import fs from 'node:fs';
import path from 'node:path';

// Biome paths no plugin owns, and therefore the always-on repo-wide shard does.
// `package.json` `scripts.check:js` checks these in full mode; in lane/plugin mode
// ci.mjs unions `javascriptQuality` over the SELECTED plugins, so a path outside
// every plugin root would be checked by no pull-request shard at all — `tests/`
// holds the cross-plugin suites ci.mjs itself runs, and biome.json/package.json
// configure every other check. Shape mirrors a plugin's `javascriptQuality` so
// the scheduler treats owner and residual identically. `lint` is empty because
// `check:js`'s second invocation (`biome lint`) names only the two plugin-owned
// skill script dirs; the superset contract in scripts/tests/ci-plugin-targeting.mjs
// fails if either invocation ever grows an unowned path.
export const REPO_WIDE_JAVASCRIPT_QUALITY = Object.freeze({
  ci: Object.freeze(['tests', 'package.json', 'biome.json']),
  lint: Object.freeze([]),
});

export const PLUGINS = [
  {
    name: 'docks',
    root: 'plugins/docks',
    ciLane: 'core',
    javascriptQuality: {
      ci: ['scripts', 'plugins/docks/hooks'],
      lint: ['plugins/docks/skills/productivity/write-skill/scripts'],
    },
    skills: 'plugins/docks/skills',
    agents: null,
    codex: true,
    selftest: null,
    rust: null,
    extraJson: [],
    authorChecks: ['idempotency', 'plan-reviewer'],
    releaseContracts: [],
    transformGuard: true,
    release: {
      kind: 'generic',
      install: '/plugin marketplace update docks\n/plugin install docks@docks',
    },
  },
  {
    name: 'plan-lifecycle',
    root: 'plugins/plan-lifecycle',
    ciLane: 'core',
    javascriptQuality: {
      ci: ['plugins/plan-lifecycle/test'],
      lint: ['plugins/plan-lifecycle/skills/productivity/plan-manager/scripts'],
    },
    skills: 'plugins/plan-lifecycle/skills',
    agents: 'plugins/plan-lifecycle/agents',
    codex: true,
    selftest: 'plugins/plan-lifecycle/test/selftest.mjs',
    rust: null,
    extraJson: [],
    // 'plan-reviewer' also stays on docks: the routing prerequisite the suite
    // asserts lives in docks skill bodies, while the lifecycle machinery it
    // drives ships here. Both owners select the same suites and
    // selectedAuthorChecks() dedupes on a full run.
    authorChecks: ['plan-reviewer'],
    releaseContracts: [],
    transformGuard: false,
    release: {
      kind: 'generic',
      install: '/plugin marketplace update docks\n/plugin install plan-lifecycle@docks',
    },
  },
];

// Shared catalogs (one entry per plugin, matched by name).
export const CLAUDE_MARKETPLACE = '.claude-plugin/marketplace.json';
export const CODEX_MARKETPLACE = '.agents/plugins/marketplace.json';

export const claudeManifest = (p) => `${p.root}/.claude-plugin/plugin.json`;
export const codexManifest = (p) => `${p.root}/.codex-plugin/plugin.json`;

export const byName = (name) => PLUGINS.find((p) => p.name === name) || null;

// Plugins actually present on disk (a descriptor may outlive its files mid-edit).
export const presentPlugins = () => PLUGINS.filter((p) => fs.existsSync(p.root));

// Version of a plugin's entry in a parsed marketplace catalog.
export const marketEntryVersion = (market, name) => market?.plugins?.find((x) => x.name === name)?.version;

// Skill categories a plugin declares in its manifest `skills` array
// (["./skills/productivity", …] → ["productivity", …]); [] when skills is the
// Codex string form or absent.
export function manifestCategories(manifest) {
  const skills = manifest?.skills;
  if (!Array.isArray(skills)) return [];
  return skills
    .map((s) =>
      s
        .replace(/^\.\//, '')
        .replace(/^skills\//, '')
        .replace(/\/$/, ''),
    )
    .filter(Boolean);
}

// Shell files to lint: hook scripts (*.sh) under a plugin's hooks/ dir, plus
// the rust capability's sh launcher (bin/<binName>) when present.
export function shellHooks(p) {
  const dir = path.join(p.root, 'hooks');
  const out = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.sh'))
        .map((f) => path.join(dir, f))
    : [];
  if (p.rust) {
    const launcher = path.join(p.root, 'bin', p.rust.binName);
    if (fs.existsSync(launcher)) out.push(launcher);
  }
  return out;
}
