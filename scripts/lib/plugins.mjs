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
//   rust          Rust binary capability, or null: { dir, bin, binName, targets }
//                 — ci.mjs runs fmt/clippy + a --locked host-leg build into
//                 bin/ and verifies committed SHA256SUMS; release.mjs refuses
//                 to tag unless every target binary + the launcher are
//                 committed and checksums verify (see lib/rust-bin.mjs)
//   extraJson     additional JSON configs to validate (hooks/mcp/etc.)
//   transformGuard run scripts/skills/transform-guard.mjs (curated transformers)
//   install       the consumer install snippet for the GitHub Release notes
import fs from 'node:fs';
import path from 'node:path';

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
      bin: 'plugins/session-relay/bin',
      binName: 'relay',
      targets: [
        'x86_64-unknown-linux-musl',
        'aarch64-unknown-linux-musl',
        'x86_64-apple-darwin',
        'aarch64-apple-darwin',
      ],
    },
    extraJson: [
      'plugins/session-relay/hooks/codex-hooks.json',
      'plugins/session-relay/.codex-plugin/bus.mcp.json',
    ],
    transformGuard: false,
    install: '/plugin marketplace update docks\n/plugin install session-relay@docks',
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
  return skills.map((s) => s.replace(/^\.\//, '').replace(/^skills\//, '').replace(/\/$/, '')).filter(Boolean);
}

// Bash hook files (*.sh) under a plugin's hooks/ dir — for shellcheck.
export function shellHooks(p) {
  const dir = path.join(p.root, 'hooks');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.sh')).map((f) => path.join(dir, f));
}
