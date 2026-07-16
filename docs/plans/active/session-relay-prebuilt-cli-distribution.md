---
title: Deliver Session Relay as a prebuilt CLI
goal: Publish verified Session Relay assets, install them through docks-kit, and replace plugin-bundled executables with a stable CLI launcher.
status: planned
created: "2026-07-16T04:10:15-03:00"
updated: "2026-07-16T05:08:46-03:00"
started_at: null
assignee: null
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: high
review_waivers: []
tags: [session-relay, distribution, rust, github-actions]
affected_paths:
  - .claude-plugin/marketplace.json
  - .github/AGENTS.md
  - .github/workflows/build-binaries.yml
  - .github/workflows/ci.yml
  - plugins/session-relay/AGENTS.md
  - plugins/session-relay/.claude-plugin/plugin.json
  - plugins/session-relay/.codex-plugin/plugin.json
  - plugins/session-relay/bin/SHA256SUMS
  - plugins/session-relay/bin/relay
  - plugins/session-relay/bin/relay-aarch64-apple-darwin
  - plugins/session-relay/bin/relay-aarch64-unknown-linux-musl
  - plugins/session-relay/bin/relay-x86_64-apple-darwin
  - plugins/session-relay/bin/relay-x86_64-unknown-linux-musl
  - plugins/session-relay/rust/Cargo.lock
  - plugins/session-relay/rust/Cargo.toml
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - plugins/session-relay/test/distribution-contract.mjs
  - plugins/session-relay/test/selftest.mjs
  - scripts/AGENTS.md
  - scripts/ci.mjs
  - scripts/lib/plugins.mjs
  - scripts/lib/rust-bin.mjs
  - scripts/release.mjs
related_plans: []
review_status: null
planned_at_commit: b65ca2c9819e3113fa43576b5845f0f33a278a61
execution_base_commit: null
---

# Deliver Session Relay as a prebuilt CLI

## Goal

Ship Session Relay as a normal precompiled CLI: GitHub Actions builds the four supported Rust targets, Session Relay `0.12.0` publishes the executables plus `SHA256SUMS`, and the plugin keeps only a small launcher that resolves an installed `session-relay` executable. A companion `DocksDocks/public` release installs and verifies that exact release through `docks-kit`, so plugin installation no longer carries four opaque platform binaries.

## Context & rationale

The current plugin commits four compiled executables and dispatches among them from `plugins/session-relay/bin/relay`. This makes the plugin payload large, obscures provenance during review, and requires an unusual build-artifact commit before every release. The chosen replacement follows the conventional Rust CLI pattern used by projects such as Grok Build: compile per platform in CI, publish immutable checksummed release assets, and let an installer place one host executable on the user's PATH.

The plugin must not download executables from hooks or MCP startup. Those paths are latency-sensitive and operate on untrusted plugin installation state. The plugin launcher therefore performs resolution only and fails with an actionable installation command. `docks-kit` owns downloads, checksum verification, smoke testing, and atomic replacement in the companion repository.

This plan owns the Docks release producer, plugin-consumer contract, and coordinated release ordering. A companion plan in `/home/vagrant/projects/public` owns the `docks-kit` installer and its release. Session Relay is the required cross-project implementation transport; the public worker must be dispatched and return a clean committed handback while the current embedded binary still exists. Each repository retains its own plan lifecycle and commit history.

## Environment & how-to-run

- Node.js 24 and the lockfile-pinned pnpm dependencies: `corepack enable && pnpm install --frozen-lockfile`.
- Rust toolchain: `plugins/session-relay/rust/rust-toolchain.toml`; all builds use `cargo build --release --locked`.
- Focused Docks tests:
  - `node plugins/session-relay/test/distribution-contract.mjs`
  - `node plugins/session-relay/test/selftest.mjs`
  - `node scripts/ci.mjs --plugin session-relay`
- Required broad Docks gate before commit: `node scripts/ci.mjs`.
- Skill maintenance after the shipped skill text changes:
  - `node scripts/skills/content-hash.mjs --fix plugins/session-relay/skills`
  - `node scripts/skills/content-hash.mjs --check-only plugins/session-relay/skills`
- GitHub workflow syntax is validated by the repository CI gate; no release workflow is dispatched before both implementations and local gates are complete.
- Companion repository commands and prerequisites live in its own plan; the Docks completion receipt consumes only the companion plan's pinned clean commit and the distribution-contract report, not unbound conversational claims.
- Coordinated release order:
  1. Implement, test, commit, and push both repositories.
  2. Release Session Relay `0.12.0` and verify its five live assets.
  3. Run the public repository's live installer smoke against `0.12.0`.
  4. Release the next `docks-kit` version only after that smoke passes.

## Interfaces & data shapes

### Published release assets

For tag `session-relay--v<VERSION>`, the GitHub Release must contain exactly one executable for every supported target plus one checksum manifest:

```text
session-relay-x86_64-unknown-linux-musl
session-relay-aarch64-unknown-linux-musl
session-relay-x86_64-apple-darwin
session-relay-aarch64-apple-darwin
SHA256SUMS
```

`SHA256SUMS` uses the standard `<64 lowercase hex><two spaces><asset-name>` format and covers all four executables. Asset names are stable and are the contract consumed by `docks-kit`.

### Installed executable

`docks-kit` pins Session Relay `0.12.0` in `SoT/toolchain.json` and installs one verified host asset as:

```text
~/.local/bin/session-relay
```

The Rust CLI must support `session-relay --version` and print `session-relay <semver>`. The Cargo package version stays synchronized with the Session Relay plugin manifest version during `scripts/release.mjs`.

Every ordinary `docks-kit sync` that targets Claude or Codex must ensure the pinned Session Relay CLI before installing, refreshing, or enabling the Session Relay plugin. The ensure path maps the host OS and architecture to one of the four release targets, downloads the matching executable and `SHA256SUMS`, verifies the digest and exact version, atomically installs it, then proceeds with plugin configuration. An unsupported platform, failed download, checksum mismatch, version mismatch, or replacement failure aborts that sync path clearly; it may not report success with a plugin whose CLI is missing or stale.

### Plugin launcher resolution

`plugins/session-relay/bin/relay` resolves in this order:

1. Non-empty `SESSION_RELAY_BIN`.
2. `session-relay` found on `PATH`.
3. `$HOME/.local/bin/session-relay`.
4. Exit nonzero with a clear `docks-kit sync` / `docks-kit toolchain ensure session-relay` installation message.

The launcher rejects a resolver target that is itself, preventing recursion. It never downloads, compiles, or silently falls back to an embedded executable.

### Release orchestration

The binary builder is reusable by tag CI and manual dispatch. On `session-relay--v*`, the validation job must pass before publishing. The publisher downloads only artifacts produced by that same workflow run, validates the tag against the manifests and Cargo version, generates `SHA256SUMS`, and creates the GitHub Release with the five assets. The publishing job alone receives `contents: write`; the workflow-level default remains `contents: read`.

The Session Relay GitHub Release install block is exactly `docks-kit sync`, because that command ensures the verified CLI before installing or enabling the plugin for either supported agent runtime. It must not retain the current plugin-only `/plugin install session-relay@docks` instructions. `scripts/lib/plugins.mjs` owns this release-note descriptor, and the distribution-contract test must prove it cannot publish plugin-first instructions after embedded binaries are removed.

`scripts/release.mjs` applies every manifest, marketplace, Cargo, and lockfile version change first, runs the full CI gate on that exact changed tree, and only then commits and pushes. A failed post-bump gate must prevent commit, push, tag, and publication. For Session Relay it must not create a duplicate Release: it waits for authoritative tag CI, then verifies that the expected GitHub Release and all five assets exist. Other plugins retain their current release behavior.

`--dry-run` remains strictly read-only. It computes and prints the manifest, marketplace, Cargo, and lockfile changes without writing them, skips the full CI execution while clearly reporting that the real release will gate the changed tree, and performs no commit, push, tag, or GitHub mutation. The distribution-contract test snapshots tracked status, untracked status, and every release-owned file byte before and after `node scripts/release.mjs --dry-run --plugin session-relay 0.12.0`.

## Steps

| # | Task | Files | Depends | Status | Done condition |
|---|---|---|---|---|---|
| 1 | Dispatch the separate `DocksDocks/public` installer implementation through the currently working embedded Session Relay binary under its own reviewed plan; collect a clean committed handback before deleting any embedded binary. | `/home/vagrant/projects/public/docs/plans/active/session-relay-cli-installation.md` (external companion plan; modified only by its plan-manager), Session Relay lifecycle/handback records (external state) | — | planned | The worker is launched with explicit Codex Standard tier, creates and starts its repository-local plan, freezes failing installer tests, proves every Claude/Codex `docks-kit sync` auto-ensures the correct precompiled host CLI before Session Relay plugin configuration, commits a clean implementation, hands back, and is collected before Docks Step 3 begins. |
| 2 | Add frozen Docks distribution-contract tests before production changes and capture their failure against the embedded-binary design. | `plugins/session-relay/test/distribution-contract.mjs`, `plugins/session-relay/test/selftest.mjs` | 1 | planned | The new tests fail for missing external resolution, version output, release-asset publication, post-bump CI ordering, explicit fresh self-test binary, cross-repo contract receipt, or obsolete committed-binary assumptions; the failing output is recorded before production edits. |
| 3 | Make the Rust CLI and plugin launcher expose the stable external CLI contract, then remove committed platform executables and their in-plugin checksum file. | `plugins/session-relay/rust/Cargo.toml`, `plugins/session-relay/rust/Cargo.lock`, `plugins/session-relay/rust/src/main.rs`, `plugins/session-relay/bin/relay`, `plugins/session-relay/bin/SHA256SUMS`, `plugins/session-relay/bin/relay-*`, `plugins/session-relay/test/selftest.mjs` | 1, 2 | planned | `--version` reports the Cargo version; launcher tests prove resolution order, recursion rejection, and actionable failure; self-test requires `SESSION_RELAY_TEST_BIN` and fails rather than skips when absent; `git ls-files plugins/session-relay/bin` lists only the launcher. |
| 4 | Convert binary production to tag-gated GitHub Release assets with least-privilege permissions and same-run artifact provenance. | `.github/workflows/build-binaries.yml`, `.github/workflows/ci.yml`, `.github/AGENTS.md`, `plugins/session-relay/AGENTS.md` | 2 | planned | Workflow contract tests prove all four stable asset names, checksum generation, validation dependency, tag restriction, pinned actions, and publisher-only write permission. |
| 5 | Update registry-driven CI and release tooling for source-built local tests, post-bump validation, CI-published release assets, safe release notes, and a non-mutating preview. | `scripts/ci.mjs`, `scripts/lib/plugins.mjs`, `scripts/lib/rust-bin.mjs`, `scripts/release.mjs`, `scripts/AGENTS.md` | 3, 4 | planned | Local CI builds/tests the explicit host binary without comparing committed executables; tests prove all version files change before the exact-tree CI gate and any gate failure prevents commit/push/tag; Session Relay release verification expects all five assets without creating a duplicate release; its install descriptor is exactly `docks-kit sync`; and a dry-run snapshot proves no tracked, untracked, or release-owned-file mutation. |
| 6 | Update Session Relay usage guidance for the external CLI and refresh its metadata/content hash through the prescribed maintenance flow. | `plugins/session-relay/skills/productivity/session-relay/SKILL.md` | 3, 5 | planned | Skill docs name `session-relay` as the installed executable, keep instructions and troubleshooting with the skill, put executable helpers in Rust subcommands rather than skill scripts, and content-hash validation is idempotent. |
| 7 | Verify the pinned producer/consumer contract, commit and push both repositories, release Session Relay `0.12.0`, smoke-install the live asset through `docks-kit`, then release the next `docks-kit` version. | `plugins/session-relay/test/distribution-contract.mjs` (read-only comparison against `/home/vagrant/projects/public` and live GitHub Release), `/home/vagrant/projects/public` companion plan and release tooling (external repository) | 1–6 | planned | A machine-readable contract report pins both commit SHAs and proves exact URL/tag/assets/checksum/version/install path; both CIs and diffs are green; the live five-asset Session Relay release verifies; a temporary-home `docks-kit` smoke installs it and prints `session-relay 0.12.0`; the new `docks-kit` release is published and verified. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node plugins/session-relay/test/distribution-contract.mjs --public-repo /home/vagrant/projects/public` | Exit 0; reports launcher, Rust version, workflow publication, post-bump release ordering, exact `docks-kit sync` release notes, a non-mutating Session Relay dry-run, and an exact clean committed producer/consumer contract with both SHAs. |
| A2 | `cargo build --manifest-path plugins/session-relay/rust/Cargo.toml --release --locked && SESSION_RELAY_TEST_BIN="$PWD/plugins/session-relay/rust/target/release/relay" node plugins/session-relay/test/selftest.mjs` | Exit 0; black-box Relay behavior passes using only the explicitly supplied fresh release executable. |
| A3 | `git ls-files plugins/session-relay/bin` | Output is exactly `plugins/session-relay/bin/relay`. |
| A4 | `node scripts/ci.mjs --plugin session-relay` | Exit 0; Session Relay Rust, launcher, workflow, manifest, skill, and self-test gates pass. |
| A5 | `node scripts/skills/content-hash.mjs --check-only plugins/session-relay/skills` | Exit 0 with no stale hash. |
| A6 | `base=$(sed -n 's/^execution_base_commit: //p' docs/plans/active/session-relay-prebuilt-cli-distribution.md); git diff --check "$base..HEAD"` | Exit 0 with no whitespace errors anywhere in the immutable implementation range. |
| A7 | `gh release view session-relay--v0.12.0 --json tagName,isDraft,assets` | Exit 0; non-draft release has exactly the four named executables and `SHA256SUMS`. |
| A8 | `node plugins/session-relay/test/distribution-contract.mjs --public-repo /home/vagrant/projects/public --release session-relay--v0.12.0` | Exit 0; downloads the live checksum manifest and host asset to a temporary directory, verifies the digest, and observes `session-relay 0.12.0`. |
| A9 | `test -z "$(git status --porcelain=v1)" && test -z "$(git -C /home/vagrant/projects/public status --porcelain=v1)"` | Exit 0, proving both repositories are clean after releases complete. |

## Out of scope / do-NOT-touch

- Do not commit newly generated Rust release binaries anywhere in the repository; deleting the obsolete committed binaries is required, but producing replacements in-tree is forbidden.
- Do not add a plugin-install hook that downloads or compiles code; plugin hook and MCP startup must remain deterministic local execution.
- Do not add Windows support in this plan; the producer supports the existing four Linux/macOS targets, while `docks-kit` must fail clearly on unsupported platforms.
- Do not modify Session Relay message, wake, fanout, lifecycle, or app-server semantics except for the top-level CLI version response.
- Do not modify unrelated plugin versions or manifests; release only Session Relay in Docks and the `docks-kit` package in the public repository.
- Do not edit `/home/vagrant/projects/public` directly from this Docks worktree; use the Session Relay worker and its repository-local plan-manager.

## Known gotchas

- GitHub Actions references must remain pinned to full 40-character commit SHAs, including any download/upload or release action introduced.
- A reusable workflow called from tag CI must expose artifacts to the publishing job in the same workflow run; do not substitute artifacts from a prior manual run.
- `actions/download-artifact` extracts per-artifact directories by default; checksum generation must deliberately flatten or reference the resulting paths without accepting duplicate names.
- A shell `command -v session-relay` hit may resolve the launcher itself through a plugin-added PATH entry. Compare canonical paths before `exec` to prevent recursion.
- Local self-tests run before any GitHub Release exists. They must use only `SESSION_RELAY_TEST_BIN` pointing at a freshly built host binary, never select debug/committed fallbacks, skip, or attempt a network download.
- `Cargo.lock` records the package version. Release-version synchronization must update it deterministically, normally through Cargo rather than hand-editing.
- The companion installer pin is intentionally a future Session Relay version until release. Real installation cannot succeed until the Docks release is published; tests must use mocked/local assets.

## Global constraints

- Treat plugin marketplaces, installers, and downloaded artifacts as untrusted until verified.
- No secrets in committed config.
- Run `node scripts/ci.mjs` before any commit.
- Do not release or modify generated release binaries unless explicitly asked for a release.
- User installation must not require a Rust compiler.
- `docks-kit sync` must automatically install or update the verified precompiled Session Relay CLI for the current supported OS/architecture whenever it installs or refreshes the Session Relay plugin.
- Every downloaded executable must be checksummed before installation and smoke-tested before replacing an existing executable.
- The stable installed command is `session-relay`; the plugin-internal compatibility launcher remains `plugins/session-relay/bin/relay`.
- Supported release targets are exactly `x86_64-unknown-linux-musl`, `aarch64-unknown-linux-musl`, `x86_64-apple-darwin`, and `aarch64-apple-darwin`.

## STOP conditions

- STOP if current GitHub Actions artifact semantics cannot prove the published binaries came from the same tag-gated workflow run; do not fall back to latest/manual artifacts.
- STOP if `docks-kit` cannot verify a checksum before replacement or cannot preserve an existing executable on failure.
- STOP if plugin startup would need network access or compilation to retain compatibility.
- STOP if a release tool change would affect non-Session-Relay plugin release behavior without an explicit regression test.
- STOP collection if the Session Relay worker reports a dirty worktree, out-of-scope edits, an unreviewed plan transition, or a merge conflict.
- STOP before releasing `docks-kit` if the live Session Relay asset cannot be checksum-verified and installed through its actual installer in a temporary home.

## Cold-handoff checklist

- **File manifest:** Present; every Docks-owned step names exact paths and the public-repository boundary is explicitly external.
- **Environment & commands:** Present; Node, pnpm, Rust, focused gates, full CI, and hash maintenance commands are exact.
- **Interface & data contracts:** Present; asset names, checksum format, installed path, version output, launcher order, and release ownership are fixed.
- **Executable acceptance:** Present; A1–A9 are commands with exact success conditions.
- **Out of scope:** Present; committing generated replacement binaries, Windows support, runtime semantics, and direct public edits are prohibited; the explicitly authorized Session Relay `0.12.0` and subsequent `docks-kit` releases are required.
- **Decision rationale:** Present; CI assets plus explicit installer are selected to reduce payload size and improve provenance without startup downloads.
- **Known gotchas:** Present; same-run provenance, action pinning, launcher recursion, offline tests, Cargo lockstep, and pre-release pins are covered.
- **Global constraints verbatim:** Present; user compiler, checksum, supported-target, binary, security, and release constraints are explicit.
- **No undefined terms / forward refs:** Present; all commands, paths, asset names, and ownership boundaries are defined in this plan.

## Self-review

Score: 98/100 · one local pass · caught: separated the public repository into its own lifecycle, prohibited hook-time downloads, made same-run artifact provenance explicit, and added recursion plus pre-release-pin gotchas.

Cross-check (2026-07-16): [X: anthropic unavailable] authentication preflight failed; [S: openai gpt-5.6-sol high Standard] 5 findings — accepted S1,S2,S3,S4,S5 / rejected none; [Codex main-context orchestrator] reproduced all five against the plan and source before accepting. Repairs reordered Relay bootstrap before binary deletion, incorporated the user's explicit release authorization, required exact-tree post-bump CI, made self-test binary selection explicit and non-skipping, and added pinned cross-repo plus live-release evidence.

Cross-check (2026-07-16, round 2): [X: anthropic unavailable] authentication preflight failed; [S: openai gpt-5.6-sol high Standard] 4 findings — accepted S1,S2,S3,S4 / rejected none; [Codex main-context orchestrator] reproduced all four. Repairs require a complete affected-path review bundle, add every release-mutated manifest/catalog file, bind whitespace validation to the execution range, and make the final cleanliness command prove both repositories.

Cross-check (2026-07-16, round 3): [X: anthropic unavailable] authentication preflight failed; [S: openai gpt-5.6-sol high Standard] score 86 with 3 findings — accepted S1,S2,S3 / rejected none; [Codex main-context orchestrator] reproduced all three. Repairs make Session Relay release notes install through `docks-kit sync`, remove the checklist contradiction around the authorized releases, and preserve `release.mjs --dry-run` as a tested byte-for-byte non-mutating preview. The resolved three-round batch is exhausted; another independent round requires the plan-manager continuation choice.

## Review

(filled by plan-review on completion)

## Sources

- `plugins/session-relay/bin/relay` — current launcher dispatches to four embedded target binaries.
- `plugins/session-relay/rust/Cargo.toml` — current package lacks product-version synchronization.
- `.github/workflows/build-binaries.yml` — current binary workflow is manual-only and uploads Actions artifacts.
- `.github/workflows/ci.yml` — current tag CI validates but does not publish release assets.
- `scripts/ci.mjs` and `scripts/lib/plugins.mjs` — current Rust capability rebuilds and compares committed binaries.
- `scripts/release.mjs` — current release path assumes binaries are already committed and creates the GitHub Release after tag CI.
- `plugins/session-relay/test/selftest.mjs` — current test resolution falls back to committed platform executables.
- Official cargo-dist documentation — prebuilt target assets and installers are a standard Rust CLI distribution model.
- Grok Build public installer and README — end users receive platform-specific precompiled Rust binaries and do not compile locally.

## Notes

- Companion repository: `/home/vagrant/projects/public`.
- Intended first compatible Session Relay release: `0.12.0`.
- Release authorization was explicitly granted by the user after the first independent review; Session Relay `0.12.0` and the next compatible `docks-kit` version are now part of the plan.

## Mistakes & Dead Ends

- **2026-07-16T04:34:00-03:00**: Sealed the first review bundle under `/tmp/docks-plan-review-<uuid>` instead of the helper-owned `/tmp/docks-plan-review/<uuid>` root → policy cleanup correctly rejected it → preserved those invalidly located read-only bundles and will use the exact helper root for every fresh review.
