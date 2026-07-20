// plugins.mjs — the registry of plugins this repo ships. SINGLE SOURCE OF TRUTH
// for the author tooling: ci.mjs gates every entry, release.mjs bumps/tags one.
// Adding a plugin = adding one descriptor here (no edits to ci.mjs/release.mjs).
//
// Each descriptor declares paths + capabilities; the tooling runs a check only
// when the capability is present, so a skills-only plugin and a skills+agents+
// selftest plugin share one code path. Versions are PER-PLUGIN and independent
// (docks and session-relay version separately); the Claude marketplace catalog
// holds one entry per plugin, matched by `name`.
//
// Fields:
//   name          marketplace + tag identity (claude plugin tag → <name>--v<ver>)
//   root          plugin dir under the repo
//   skills        skills root, or null
//   agents        agents root, or null
//   codex         true when a .codex-plugin/ mirror + Codex marketplace entry ship
//   selftest      path to a runnable self-test, or null
//   rust          Rust binary capability, or null. `source` owns local build
//                 paths; `prebuilt` owns immutable release target/asset naming.
//                 ci.mjs builds source.builtBinary and passes it explicitly to
//                 the self-test. No generated executable is written to bin/.
//   extraJson     additional JSON configs to validate (hooks/mcp/etc.)
//   authorChecks  repository author suites owned by this plugin
//   releaseContracts additional release-state/evidence contract tests
//   transformGuard run scripts/skills/transform-guard.mjs (curated transformers)
//   install/release consumer installation text; Session Relay additionally owns
//                 prerelease staging and its closed prebuilt asset set
import fs from 'node:fs';
import path from 'node:path';
import { rustReleaseAssetNames } from './rust-bin.mjs';

const SESSION_RELAY_PREBUILT = Object.freeze({
  targets: Object.freeze([
    'x86_64-unknown-linux-musl',
    'aarch64-unknown-linux-musl',
    'x86_64-apple-darwin',
    'aarch64-apple-darwin',
  ]),
  assetPrefix: 'session-relay',
  checksumAsset: 'SHA256SUMS',
});

export const PLUGINS = [
  {
    name: 'docks',
    root: 'plugins/docks',
    skills: 'plugins/docks/skills',
    agents: 'plugins/docks/agents',
    codex: true,
    selftest: null,
    rust: null,
    extraJson: [],
    authorChecks: ['idempotency', 'scaffold', 'plan-reviewer'],
    releaseContracts: [],
    transformGuard: true,
    install: '/plugin marketplace update docks\n/plugin install docks@docks',
  },
  {
    name: 'session-relay',
    root: 'plugins/session-relay',
    skills: 'plugins/session-relay/skills',
    agents: null,
    codex: true,
    selftest: 'plugins/session-relay/test/selftest.mjs',
    rust: {
      dir: 'plugins/session-relay/rust',
      binName: 'relay',
      source: {
        manifest: 'plugins/session-relay/rust/Cargo.toml',
        lockfile: 'plugins/session-relay/rust/Cargo.lock',
        builtBinary: 'plugins/session-relay/rust/target/release/relay',
        testBinaryEnv: 'SESSION_RELAY_TEST_BIN',
      },
      prebuilt: SESSION_RELAY_PREBUILT,
    },
    distributionContract: 'plugins/session-relay/test/distribution-contract.mjs',
    extraJson: ['plugins/session-relay/hooks/codex-hooks.json', 'plugins/session-relay/.codex-plugin/bus.mcp.json'],
    authorChecks: [],
    releaseContracts: [
      'plugins/session-relay/test/release-evidence-contract.mjs',
      'plugins/session-relay/test/release-publication-contract.mjs',
      'plugins/session-relay/test/release-promotion-contract.mjs',
    ],
    transformGuard: false,
    release: {
      assets: rustReleaseAssetNames(SESSION_RELAY_PREBUILT),
      prereleaseBody:
        'This prerelease stages Session Relay binaries for downstream checksum pinning. It is not ready for installation.',
      install: 'docks-kit sync',
    },
  },
  {
    name: 'effect-kit',
    root: 'plugins/effect-kit',
    skills: 'plugins/effect-kit/skills',
    agents: null,
    codex: true,
    selftest: 'plugins/effect-kit/test/selftest.mjs',
    rust: null,
    extraJson: [],
    authorChecks: [],
    releaseContracts: [],
    transformGuard: false,
    install: '/plugin marketplace update docks\n/plugin install effect-kit@docks',
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
