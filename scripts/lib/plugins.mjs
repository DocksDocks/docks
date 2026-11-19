// plugins.mjs — the registry of plugins this repo ships. SINGLE SOURCE OF TRUTH
// for the author tooling: ci.mjs gates every entry, release.mjs bumps/tags one.
// Adding a plugin = adding one descriptor here (no edits to ci.mjs/release.mjs).
//
// Each descriptor declares paths + capabilities; the tooling runs a check only
// when the capability is present, so a skills-only plugin and a skills+agents+
// selftest plugin share one code path. Versions are PER-PLUGIN and independent
// (each plugin versions separately); each plugin's package.json carries its
// version, and the one omp catalog holds one entry per plugin, matched by `name`.
//
// Fields:
//   name          catalog + tag identity (the release tags <name>--v<ver>)
//   root          plugin dir under the repo; also the changed-path prefix that maps
//                 a pull-request diff onto this plugin's shard (ci-targeting.mjs
//                 `resolveShardSelection`), so the workflow never duplicates roots
//   ciLane        required plugin validation shard (`core`). `repo` is
//                 the always-on repo-wide shard and no plugin may claim it.
//   javascriptQuality scoped Biome paths (`ci` required, optional `lint`)
//   skills        skills root, or null
//   agents        agents root, or null
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
      lint: [
        'plugins/docks/skills/write-skill/scripts',
        'plugins/docks/skills/agent-first-setup/scripts',
        'plugins/docks/skills/multi-tool-bridge/scripts',
      ],
    },
    skills: 'plugins/docks/skills',
    agents: null,
    selftest: null,
    rust: null,
    extraJson: ['plugins/docks/hooks/hooks.json'],
    authorChecks: ['idempotency', 'plan-reviewer'],
    releaseContracts: [],
    transformGuard: true,
    release: {
      kind: 'generic',
      install: 'omp plugin marketplace update docks\nomp plugin install docks@docks',
    },
  },
  {
    name: 'plan-lifecycle',
    root: 'plugins/plan-lifecycle',
    ciLane: 'core',
    javascriptQuality: {
      ci: ['plugins/plan-lifecycle/test'],
      lint: [
        'plugins/plan-lifecycle/skills/plan-manager/scripts',
        'plugins/plan-lifecycle/skills/plan-workspace/scripts',
      ],
    },
    skills: 'plugins/plan-lifecycle/skills',
    agents: 'plugins/plan-lifecycle/agents',
    selftest: 'plugins/plan-lifecycle/test/selftest.mjs',
    rust: null,
    extraJson: [],
    // Both owners select only the plan-cli.mjs helper smoke through 'plan-reviewer'.
    // selectedAuthorChecks() dedupes it on a full run.
    authorChecks: ['plan-reviewer'],
    releaseContracts: [],
    transformGuard: false,
    release: {
      kind: 'generic',
      install: 'omp plugin marketplace update docks\nomp plugin install plan-lifecycle@docks',
    },
  },
];

// The one catalog of the native omp packages (one entry per plugin, matched by name).
export const MARKETPLACE = '.omp-plugin/marketplace.json';

// The native package manifest of a plugin, relative to the repository root.
export const pluginPackageJson = (p) => `${p.root}/package.json`;

export const byName = (name) => PLUGINS.find((p) => p.name === name) || null;

// Plugins actually present on disk (a descriptor may outlive its files mid-edit).
export const presentPlugins = () => PLUGINS.filter((p) => fs.existsSync(p.root));

// Shell files to lint: hook scripts (*.sh) under a plugin's hooks/ dir, the
// bundled skill scripts (skills/**/scripts/*.sh), and the rust capability's sh
// launcher (bin/<binName>) when present.
export function shellScripts(p) {
  const shFiles = (dir, keep) =>
    fs.existsSync(dir)
      ? fs
          .readdirSync(dir, { recursive: true })
          .filter((f) => f.endsWith('.sh') && keep(f))
          .sort()
          .map((f) => path.join(dir, f))
      : [];
  const out = [
    ...shFiles(path.join(p.root, 'hooks'), (f) => !f.includes(path.sep)),
    ...shFiles(path.join(p.root, 'skills'), (f) => path.basename(path.dirname(f)) === 'scripts'),
  ];
  if (p.rust) {
    const launcher = path.join(p.root, 'bin', p.rust.binName);
    if (fs.existsSync(launcher)) out.push(launcher);
  }
  return out;
}
