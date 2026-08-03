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
//   ciLane        required plugin validation lane (`core` or `relay`)
//   javascriptQuality scoped Biome paths (`ci` required, optional `lint`)
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
//   sourceChecks  ordered source/process/smoke checks; `binaryArg` appends the
//                 one fresh source-built executable as an explicit CLI argument
//   transformGuard run scripts/skills/transform-guard.mjs (curated transformers)
//   install/release consumer installation text; Session Relay additionally owns
//                 prerelease staging and its closed prebuilt asset set
import fs from 'node:fs';
import path from 'node:path';
import { CURRENT_RELEASE_TARGETS, rustReleaseAssetNames } from './rust-bin.mjs';

// `CARGO_TARGET_DIR` is documented as relative to cargo's working directory, not
// to the repository root — `CARGO_TARGET_DIR=reltarget cargo metadata` run from
// the crate reports `<crate>/reltarget`. `gateRust` invokes cargo with
// `cwd: p.rust.dir`, so `cargoCwd` must be that same directory or the gate stats
// a path cargo never wrote: a false red normally, and a false GREEN whenever a
// stale binary already sits at the repo-root-relative path.
export function resolveBuiltBinary({ source, binName, env, repo, cargoCwd }) {
  const cargoTargetDir = env.CARGO_TARGET_DIR;
  return typeof cargoTargetDir === 'string' && cargoTargetDir.length > 0
    ? path.resolve(repo, cargoCwd, cargoTargetDir, 'release', binName)
    : path.resolve(repo, source.builtBinary);
}

// The private copy exists so a concurrent rebuild cannot swap the bytes out from
// under validation. It is scratch, so it must not outlive the run that made it:
// without this sweep every gate invocation would strand a `.docks-ci-binary-*`
// directory inside `target/release/` forever.
const privateBinaryDirs = new Set();
let privateBinarySweepArmed = false;

export function privatizeBuiltBinary({ binary, dir }) {
  const privateDir = fs.mkdtempSync(path.join(path.resolve(dir), '.docks-ci-binary-'));
  privateBinaryDirs.add(privateDir);
  if (!privateBinarySweepArmed) {
    privateBinarySweepArmed = true;
    process.on('exit', () => {
      for (const created of privateBinaryDirs) {
        try {
          fs.rmSync(created, { force: true, recursive: true });
        } catch {
          // Best effort: a swept-away or read-only scratch dir must never fail the gate.
        }
      }
    });
  }
  const privateBinary = path.join(privateDir, path.basename(binary));
  const mode = fs.statSync(binary).mode & 0o777;
  fs.copyFileSync(binary, privateBinary, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(privateBinary, mode);
  return privateBinary;
}

// The Session Relay prebuilt descriptor tracks the CURRENT release generation
// only; retained historical four-target (x86_64-apple-darwin) expectations live
// beside the retained validators, never here.
const SESSION_RELAY_PREBUILT = Object.freeze({
  targets: CURRENT_RELEASE_TARGETS,
  assetPrefix: 'session-relay',
  checksumAsset: 'SHA256SUMS',
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
    install: '/plugin marketplace update docks\n/plugin install docks@docks',
  },
  {
    name: 'session-relay',
    root: 'plugins/session-relay',
    ciLane: 'relay',
    javascriptQuality: { ci: ['scripts', 'plugins/session-relay/test'], lint: [] },
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
    sourceChecks: [
      {
        path: 'plugins/session-relay/test/rust-test-inventory.mjs',
        args: ['--case', 'protocol'],
      },
      {
        path: 'plugins/session-relay/test/rust-test-inventory.mjs',
        args: ['--case', 'fanout'],
      },
      {
        path: 'plugins/session-relay/test/rust-test-inventory.mjs',
        args: ['--case', 'fanout_reap'],
      },
      {
        path: 'plugins/session-relay/test/rust-test-inventory.mjs',
        args: ['--case', 'lifecycle_supervisor'],
      },
      {
        path: 'plugins/session-relay/test/rust-test-inventory.mjs',
        args: ['--case', 'workspace_identity'],
      },
      {
        path: 'plugins/session-relay/test/rust-test-inventory.mjs',
        args: ['--case', 'workspace_lease_process'],
      },
      {
        path: 'plugins/session-relay/test/rust-test-inventory.mjs',
        args: ['--case', 'workspace_coordination_process'],
      },
      {
        path: 'plugins/session-relay/test/rust-test-inventory.mjs',
        args: ['--case', 'workspace_resources'],
      },
      { path: 'plugins/session-relay/test/reentry-inventory.mjs', args: [] },
      {
        path: 'plugins/session-relay/test/workspace-smoke.mjs',
        args: ['--case', 'single-session-compat'],
        binaryArg: '--bin',
      },
      {
        path: 'plugins/session-relay/test/workspace-smoke.mjs',
        args: ['--case', 'docs-contract'],
        binaryArg: '--bin',
      },
      // Release-instance separation. The lane must hold protocol logic only: every value
      // identifying one release attempt lives in an instance file loaded by version, so a
      // release edits the single `VERSION` declaration. These run as source checks rather
      // than release contracts because they scan lane source and need `--case` arguments.
      {
        path: 'plugins/session-relay/test/release-instance-contract.mjs',
      },
      {
        path: 'plugins/session-relay/test/release-instance-contract.mjs',
        args: ['--case', 'modules'],
      },
      {
        path: 'plugins/session-relay/test/release-instance-contract.mjs',
        args: ['--case', 'validator'],
      },
      {
        path: 'plugins/session-relay/test/release-instance-contract.mjs',
        args: ['--case', 'coverage'],
      },
    ],
    extraJson: ['plugins/session-relay/hooks/codex-hooks.json', 'plugins/session-relay/.codex-plugin/bus.mcp.json'],
    authorChecks: [],
    releaseContracts: [
      'plugins/session-relay/test/release-evidence-contract.mjs',
      'plugins/session-relay/test/release-publication-contract.mjs',
      'plugins/session-relay/test/release-promotion-contract.mjs',
      // These two were real contract suites that nothing executed: declared in the
      // release instance's `docks_affected_paths` but absent from every descriptor
      // field, so CI never ran them. One had been failing since before the 0.15.0
      // migration and nobody noticed. Listing them here is the fix for that rot -
      // a contract nothing runs is not a contract. Both take no arguments, matching
      // how `ci.mjs` invokes each entry.
      'plugins/session-relay/test/remediation-contract.mjs',
      'plugins/session-relay/test/companion-distribution-contract.mjs',
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
    ciLane: 'core',
    javascriptQuality: { ci: ['plugins/effect-kit/test'], lint: [] },
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
  {
    name: 'plan-lifecycle',
    root: 'plugins/plan-lifecycle',
    ciLane: 'core',
    javascriptQuality: {
      ci: ['plugins/plan-lifecycle/test'],
      lint: ['plugins/plan-lifecycle/skills/productivity/plan-reviewer/scripts'],
    },
    skills: 'plugins/plan-lifecycle/skills',
    agents: 'plugins/plan-lifecycle/agents',
    codex: true,
    selftest: 'plugins/plan-lifecycle/test/selftest.mjs',
    rust: null,
    extraJson: [],
    // 'plan-reviewer' also stays on docks: the routing prerequisite the suite
    // asserts lives in docks/effect-kit skill bodies, while the lifecycle
    // machinery it drives ships here. Both owners select the same suites and
    // selectedAuthorChecks() dedupes on a full run.
    authorChecks: ['plan-reviewer'],
    releaseContracts: [],
    transformGuard: false,
    install: '/plugin marketplace update docks\n/plugin install plan-lifecycle@docks',
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
