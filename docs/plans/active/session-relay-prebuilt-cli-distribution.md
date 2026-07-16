---
title: Deliver Session Relay as a prebuilt CLI
goal: Publish verified Session Relay release assets and replace plugin-bundled executables with a stable external CLI launcher.
status: planned
created: "2026-07-16T04:10:15-03:00"
updated: "2026-07-16T04:10:15-03:00"
started_at: null
assignee: null
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: high
review_waivers: []
tags: [session-relay, distribution, rust, github-actions]
affected_paths:
  - .github/AGENTS.md
  - .github/workflows/build-binaries.yml
  - .github/workflows/ci.yml
  - plugins/session-relay/AGENTS.md
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

Ship Session Relay as a normal precompiled CLI: GitHub Actions builds the four supported Rust targets, a Session Relay release publishes the executables plus `SHA256SUMS`, and the plugin keeps only a small launcher that resolves an installed `session-relay` executable. The separately planned `DocksDocks/public` change will install and verify the exact release through `docks-kit`, so plugin installation no longer carries four opaque platform binaries.

## Context & rationale

The current plugin commits four compiled executables and dispatches among them from `plugins/session-relay/bin/relay`. This makes the plugin payload large, obscures provenance during review, and requires an unusual build-artifact commit before every release. The chosen replacement follows the conventional Rust CLI pattern used by projects such as Grok Build: compile per platform in CI, publish immutable checksummed release assets, and let an installer place one host executable on the user's PATH.

The plugin must not download executables from hooks or MCP startup. Those paths are latency-sensitive and operate on untrusted plugin installation state. The plugin launcher therefore performs resolution only and fails with an actionable installation command. `docks-kit` owns downloads, checksum verification, smoke testing, and atomic replacement in the companion repository.

This plan owns the Docks release producer and plugin-consumer contract. A companion plan in `/home/vagrant/projects/public` owns the `docks-kit` installer. Session Relay is the required cross-project implementation transport; each repository retains its own plan lifecycle and commit history.

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
- GitHub workflow syntax is validated by the repository CI gate; no release workflow is dispatched during implementation.
- Companion repository commands and prerequisites live in its own plan and are not evidence for this repository's completion receipt.

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

`docks-kit` installs one verified host asset as:

```text
~/.local/bin/session-relay
```

The Rust CLI must support `session-relay --version` and print `session-relay <semver>`. The Cargo package version stays synchronized with the Session Relay plugin manifest version during `scripts/release.mjs`.

### Plugin launcher resolution

`plugins/session-relay/bin/relay` resolves in this order:

1. Non-empty `SESSION_RELAY_BIN`.
2. `session-relay` found on `PATH`.
3. `$HOME/.local/bin/session-relay`.
4. Exit nonzero with a clear `docks-kit sync` / `docks-kit toolchain ensure session-relay` installation message.

The launcher rejects a resolver target that is itself, preventing recursion. It never downloads, compiles, or silently falls back to an embedded executable.

### Release orchestration

The binary builder is reusable by tag CI and manual dispatch. On `session-relay--v*`, the validation job must pass before publishing. The publisher downloads only artifacts produced by that same workflow run, validates the tag against the manifests and Cargo version, generates `SHA256SUMS`, and creates the GitHub Release with the five assets. The publishing job alone receives `contents: write`; the workflow-level default remains `contents: read`.

`scripts/release.mjs` must not create a duplicate Release for Session Relay. It waits for authoritative tag CI, then verifies that the expected GitHub Release and all five assets exist. Other plugins retain their current release behavior.

## Steps

| # | Task | Files | Depends | Status | Done condition |
|---|---|---|---|---|---|
| 1 | Add frozen distribution-contract tests before implementation and capture their failure against the embedded-binary design. | `plugins/session-relay/test/distribution-contract.mjs`, `plugins/session-relay/test/selftest.mjs` | — | planned | The new tests fail for missing external resolution, version output, release-asset publication, or obsolete committed-binary assumptions; the failing output is recorded before production edits. |
| 2 | Make the Rust CLI and plugin launcher expose the stable external CLI contract, then remove committed platform executables and their in-plugin checksum file. | `plugins/session-relay/rust/Cargo.toml`, `plugins/session-relay/rust/Cargo.lock`, `plugins/session-relay/rust/src/main.rs`, `plugins/session-relay/bin/relay`, `plugins/session-relay/bin/SHA256SUMS`, `plugins/session-relay/bin/relay-*`, `plugins/session-relay/test/selftest.mjs` | 1 | planned | `--version` reports the Cargo version; launcher tests prove resolution order, recursion rejection, and actionable failure; `git ls-files plugins/session-relay/bin` lists only the launcher. |
| 3 | Convert binary production to tag-gated GitHub Release assets with least-privilege permissions and same-run artifact provenance. | `.github/workflows/build-binaries.yml`, `.github/workflows/ci.yml`, `.github/AGENTS.md`, `plugins/session-relay/AGENTS.md` | 1 | planned | Workflow contract tests prove all four stable asset names, checksum generation, validation dependency, tag restriction, pinned actions, and publisher-only write permission. |
| 4 | Update registry-driven CI and release tooling for source-built local tests and CI-published release assets. | `scripts/ci.mjs`, `scripts/lib/plugins.mjs`, `scripts/lib/rust-bin.mjs`, `scripts/release.mjs`, `scripts/AGENTS.md` | 2, 3 | planned | Local CI builds/tests the host binary without comparing committed executables; release dry-run synchronizes Cargo/manifests and Session Relay release verification expects all five assets without creating a duplicate release. |
| 5 | Update Session Relay usage guidance for the external CLI and refresh its metadata/content hash through the prescribed maintenance flow. | `plugins/session-relay/skills/productivity/session-relay/SKILL.md` | 2, 4 | planned | Skill docs name `session-relay` as the installed executable, preserve `relay` command examples through the plugin launcher where appropriate, and content-hash validation is idempotent. |
| 6 | Dispatch the separate `DocksDocks/public` installer implementation through Session Relay under its own reviewed plan, then verify the producer/consumer URL, asset, version, checksum, and install-path contract match byte-for-byte. | `/home/vagrant/projects/public/docs/plans/active/session-relay-cli-installation.md` (external companion plan; modified only by its plan-manager), Session Relay handback/collection records (external state) | 2, 3, 4 | planned | The Relay worker returns a clean committed handback from the public repository; its plan and tests consume `session-relay--v<VERSION>`, the five asset names above, and `~/.local/bin/session-relay` exactly. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node plugins/session-relay/test/distribution-contract.mjs` | Exit 0; reports the launcher, Rust version, workflow publication, and release-tool contracts passed. |
| A2 | `node plugins/session-relay/test/selftest.mjs` | Exit 0; black-box Relay behavior passes using the freshly built host executable rather than a committed platform binary. |
| A3 | `git ls-files plugins/session-relay/bin` | Output is exactly `plugins/session-relay/bin/relay`. |
| A4 | `node scripts/ci.mjs --plugin session-relay` | Exit 0; Session Relay Rust, launcher, workflow, manifest, skill, and self-test gates pass. |
| A5 | `node scripts/skills/content-hash.mjs --check-only plugins/session-relay/skills` | Exit 0 with no stale hash. |
| A6 | `git diff --check` | Exit 0 with no whitespace errors. |
| A7 | `git status --short` | Empty after all planned Docks commits and the external Relay collection are complete. |

## Out of scope / do-NOT-touch

- Do not create, tag, or publish a Session Relay release; this implementation prepares the source and workflow only, because release authorization was not requested.
- Do not commit newly generated Rust release binaries anywhere in the repository; deleting the obsolete committed binaries is required, but producing replacements in-tree is forbidden.
- Do not add a plugin-install hook that downloads or compiles code; plugin hook and MCP startup must remain deterministic local execution.
- Do not add Windows support in this plan; the producer supports the existing four Linux/macOS targets, while `docks-kit` must fail clearly on unsupported platforms.
- Do not modify Session Relay message, wake, fanout, lifecycle, or app-server semantics except for the top-level CLI version response.
- Do not modify unrelated plugin versions or manifests during implementation; version synchronization logic changes, but an actual version bump belongs to release execution.
- Do not edit `/home/vagrant/projects/public` directly from this Docks worktree; use the Session Relay worker and its repository-local plan-manager.

## Known gotchas

- GitHub Actions references must remain pinned to full 40-character commit SHAs, including any download/upload or release action introduced.
- A reusable workflow called from tag CI must expose artifacts to the publishing job in the same workflow run; do not substitute artifacts from a prior manual run.
- `actions/download-artifact` extracts per-artifact directories by default; checksum generation must deliberately flatten or reference the resulting paths without accepting duplicate names.
- A shell `command -v session-relay` hit may resolve the launcher itself through a plugin-added PATH entry. Compare canonical paths before `exec` to prevent recursion.
- Local self-tests run before any GitHub Release exists. They must use a freshly built host binary or an explicit test override, never attempt a network download.
- `Cargo.lock` records the package version. Release-version synchronization must update it deterministically, normally through Cargo rather than hand-editing.
- The companion installer pin is intentionally a future Session Relay version until release. Real installation cannot succeed until the Docks release is published; tests must use mocked/local assets.

## Global constraints

- Treat plugin marketplaces, installers, and downloaded artifacts as untrusted until verified.
- No secrets in committed config.
- Run `node scripts/ci.mjs` before any commit.
- Do not release or modify generated release binaries unless explicitly asked for a release.
- User installation must not require a Rust compiler.
- Every downloaded executable must be checksummed before installation and smoke-tested before replacing an existing executable.
- The stable installed command is `session-relay`; the plugin-internal compatibility launcher remains `plugins/session-relay/bin/relay`.
- Supported release targets are exactly `x86_64-unknown-linux-musl`, `aarch64-unknown-linux-musl`, `x86_64-apple-darwin`, and `aarch64-apple-darwin`.

## STOP conditions

- STOP if current GitHub Actions artifact semantics cannot prove the published binaries came from the same tag-gated workflow run; do not fall back to latest/manual artifacts.
- STOP if `docks-kit` cannot verify a checksum before replacement or cannot preserve an existing executable on failure.
- STOP if plugin startup would need network access or compilation to retain compatibility.
- STOP if a release tool change would affect non-Session-Relay plugin release behavior without an explicit regression test.
- STOP collection if the Session Relay worker reports a dirty worktree, out-of-scope edits, an unreviewed plan transition, or a merge conflict.

## Cold-handoff checklist

- **File manifest:** Present; every Docks-owned step names exact paths and the public-repository boundary is explicitly external.
- **Environment & commands:** Present; Node, pnpm, Rust, focused gates, full CI, and hash maintenance commands are exact.
- **Interface & data contracts:** Present; asset names, checksum format, installed path, version output, launcher order, and release ownership are fixed.
- **Executable acceptance:** Present; A1–A7 are commands with exact success conditions.
- **Out of scope:** Present; release execution, new generated binaries, Windows support, runtime semantics, and direct public edits are prohibited.
- **Decision rationale:** Present; CI assets plus explicit installer are selected to reduce payload size and improve provenance without startup downloads.
- **Known gotchas:** Present; same-run provenance, action pinning, launcher recursion, offline tests, Cargo lockstep, and pre-release pins are covered.
- **Global constraints verbatim:** Present; user compiler, checksum, supported-target, binary, security, and release constraints are explicit.
- **No undefined terms / forward refs:** Present; all commands, paths, asset names, and ownership boundaries are defined in this plan.

## Self-review

Score: 97/100 · one local pass · caught: separated the public repository into its own lifecycle, prohibited hook-time downloads, made same-run artifact provenance explicit, and added recursion plus pre-release-pin gotchas.

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
- Intended first compatible Session Relay release: `0.12.0`; do not publish it as part of this plan.
