---
title: Ship only consumer-reachable files in plugin payloads
goal: Move the Session Relay crate and Node suites out of the shipped plugin directory, keep CI lane ownership, and guard the payload boundary.
plan_hash_mode: status-excluded-v1
status: blocked
blocked_reason: "Draft review invocation 2 of 2 returned a further finding (F1, v1_evidence_mismatch): the sealed affected-path manifest carried 199 entries while the repaired frontmatter declared 206, because dispatch-review.mjs:188 derives manifest paths from the on-disk plan rather than the --body candidate. The finding reproduced; the draft permit ceiling is spent, so this run is terminal and a successor requires exact current-user replacement authority."
blocked_since: "2026-08-07T01:00:39.918+00:00"
created: "2026-08-06T23:58:34.120+00:00"
updated: "2026-08-07T01:00:39.917+00:00"
started_at: null
finished_at: null
assignee: null
tags: [session-relay, packaging, ci, payload]
affected_paths:
  - .github/AGENTS.md
  - .github/workflows/build-binaries.yml
  - .github/workflows/ci.yml
  - .gitignore
  - AGENTS.md
  - README.md
  - docs/plans/active/plan-lifecycle-review-and-authority-modules.md
  - docs/plans/active/session-relay-post-cutover-modules.md
  - docs/plans/active/session-relay-typed-irc-sqlite.md
  - package.json
  - plugins/effect-kit/test/selftest.mjs
  - plugins/plan-lifecycle/compatibility.json
  - plugins/plan-lifecycle/skills/AGENTS.md
  - plugins/plan-lifecycle/test/selftest.mjs
  - plugins/session-relay/AGENTS.md
  - plugins/session-relay/README.md
  - plugins/session-relay/rust/Cargo.lock
  - plugins/session-relay/rust/Cargo.toml
  - plugins/session-relay/rust/rust-toolchain.toml
  - plugins/session-relay/rust/src/appserver.rs
  - plugins/session-relay/rust/src/bus.rs
  - plugins/session-relay/rust/src/channel.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/discover.rs
  - plugins/session-relay/rust/src/fanout.rs
  - plugins/session-relay/rust/src/fanout/authority.rs
  - plugins/session-relay/rust/src/fanout/git.rs
  - plugins/session-relay/rust/src/gc.rs
  - plugins/session-relay/rust/src/hook.rs
  - plugins/session-relay/rust/src/lib.rs
  - plugins/session-relay/rust/src/lifecycle.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/rust/src/protocol.rs
  - plugins/session-relay/rust/src/sha256.rs
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/src/supervisor.rs
  - plugins/session-relay/rust/src/watch.rs
  - plugins/session-relay/rust/src/workspace.rs
  - plugins/session-relay/rust/src/workspace/authority.rs
  - plugins/session-relay/rust/src/workspace/capability.rs
  - plugins/session-relay/rust/src/workspace/custody.rs
  - plugins/session-relay/rust/src/workspace/git.rs
  - plugins/session-relay/rust/src/workspace/platform.rs
  - plugins/session-relay/rust/src/workspace/platform/linux.rs
  - plugins/session-relay/rust/src/workspace/platform/macos.rs
  - plugins/session-relay/rust/src/workspace/repository_gate.rs
  - plugins/session-relay/rust/src/workspace/resources.rs
  - plugins/session-relay/rust/src/workspace/schema.rs
  - plugins/session-relay/rust/tests/bus_smoke.rs
  - plugins/session-relay/rust/tests/fanout.rs
  - plugins/session-relay/rust/tests/fanout_reap.rs
  - plugins/session-relay/rust/tests/lifecycle_admission.rs
  - plugins/session-relay/rust/tests/lifecycle_managed.rs
  - plugins/session-relay/rust/tests/lifecycle_release.rs
  - plugins/session-relay/rust/tests/lifecycle_supervisor.rs
  - plugins/session-relay/rust/tests/lock_race.rs
  - plugins/session-relay/rust/tests/protocol.rs
  - plugins/session-relay/rust/tests/support/fanout.rs
  - plugins/session-relay/rust/tests/support/mod.rs
  - plugins/session-relay/rust/tests/support/workspace.rs
  - plugins/session-relay/rust/tests/workspace_coordination_process.rs
  - plugins/session-relay/rust/tests/workspace_identity.rs
  - plugins/session-relay/rust/tests/workspace_lease_process.rs
  - plugins/session-relay/rust/tests/workspace_resources.rs
  - plugins/session-relay/test/companion-distribution-contract.mjs
  - plugins/session-relay/test/distribution-contract.mjs
  - plugins/session-relay/test/fake-app-server.mjs
  - plugins/session-relay/test/fanout-smoke.mjs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.lock
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.toml
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/child-cancel-reentry.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fabricated-owned-proof.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fence-reentry.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/guardless.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/reentry-fence.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/wrong-target.rs
  - plugins/session-relay/test/fixtures/reentry-inventory.json
  - plugins/session-relay/test/fixtures/release-identity-inventory.json
  - plugins/session-relay/test/fixtures/rust-test-inventory.json
  - plugins/session-relay/test/fixtures/wake-usage-claude.json
  - plugins/session-relay/test/fixtures/wake-usage-codex.jsonl
  - plugins/session-relay/test/historical-plan-path.mjs
  - plugins/session-relay/test/reentry-inventory.mjs
  - plugins/session-relay/test/release-evidence-contract.mjs
  - plugins/session-relay/test/release-instance-contract.mjs
  - plugins/session-relay/test/release-promotion-contract.mjs
  - plugins/session-relay/test/release-publication-contract.mjs
  - plugins/session-relay/test/remediation-contract.mjs
  - plugins/session-relay/test/rust-test-inventory.mjs
  - plugins/session-relay/test/scenario-appserver.mjs
  - plugins/session-relay/test/scenario-core.mjs
  - plugins/session-relay/test/scenario-discovery-hardening.mjs
  - plugins/session-relay/test/scenario-follow-doctor-mailbox.mjs
  - plugins/session-relay/test/scenario-gc.mjs
  - plugins/session-relay/test/scenario-hooks-identity.mjs
  - plugins/session-relay/test/scenario-spawn-wake-supervisor.mjs
  - plugins/session-relay/test/selftest-fixture.mjs
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/test/supervisor-custody.mjs
  - plugins/session-relay/test/version.mjs
  - plugins/session-relay/test/workspace-smoke.mjs
  - scripts/AGENTS.md
  - scripts/ci.mjs
  - scripts/config/plan-lifecycle-compatibility.json
  - scripts/config/plan-scope-waivers/plan-lifecycle-review-and-authority-modules.json
  - scripts/config/plan-scope-waivers/session-relay-payload-boundary.json
  - scripts/config/test-contracts.json
  - scripts/lib/ci-targeting.mjs
  - scripts/lib/plugins.mjs
  - scripts/lib/session-relay-release-preparation.mjs
  - scripts/lib/session-relay-release-promotion.mjs
  - scripts/plugins/payload-guard.mjs
  - scripts/tests/ci-plugin-targeting.mjs
  - scripts/tests/effect-kit/selftest.mjs
  - scripts/tests/plan-lifecycle/selftest.mjs
  - scripts/tests/session-relay/companion-distribution-contract.mjs
  - scripts/tests/session-relay/distribution-contract.mjs
  - scripts/tests/session-relay/fake-app-server.mjs
  - scripts/tests/session-relay/fanout-smoke.mjs
  - scripts/tests/session-relay/fixtures/lifecycle-capability-bypass/Cargo.lock
  - scripts/tests/session-relay/fixtures/lifecycle-capability-bypass/Cargo.toml
  - scripts/tests/session-relay/fixtures/lifecycle-capability-bypass/src/bin/child-cancel-reentry.rs
  - scripts/tests/session-relay/fixtures/lifecycle-capability-bypass/src/bin/fabricated-owned-proof.rs
  - scripts/tests/session-relay/fixtures/lifecycle-capability-bypass/src/bin/fence-reentry.rs
  - scripts/tests/session-relay/fixtures/lifecycle-capability-bypass/src/bin/guardless.rs
  - scripts/tests/session-relay/fixtures/lifecycle-capability-bypass/src/bin/reentry-fence.rs
  - scripts/tests/session-relay/fixtures/lifecycle-capability-bypass/src/bin/wrong-target.rs
  - scripts/tests/session-relay/fixtures/reentry-inventory.json
  - scripts/tests/session-relay/fixtures/release-identity-inventory.json
  - scripts/tests/session-relay/fixtures/rust-test-inventory.json
  - scripts/tests/session-relay/fixtures/wake-usage-claude.json
  - scripts/tests/session-relay/fixtures/wake-usage-codex.jsonl
  - scripts/tests/session-relay/historical-plan-path.mjs
  - scripts/tests/session-relay/reentry-inventory.mjs
  - scripts/tests/session-relay/release-evidence-contract.mjs
  - scripts/tests/session-relay/release-instance-contract.mjs
  - scripts/tests/session-relay/release-promotion-contract.mjs
  - scripts/tests/session-relay/release-publication-contract.mjs
  - scripts/tests/session-relay/remediation-contract.mjs
  - scripts/tests/session-relay/rust-test-inventory.mjs
  - scripts/tests/session-relay/scenario-appserver.mjs
  - scripts/tests/session-relay/scenario-core.mjs
  - scripts/tests/session-relay/scenario-discovery-hardening.mjs
  - scripts/tests/session-relay/scenario-follow-doctor-mailbox.mjs
  - scripts/tests/session-relay/scenario-gc.mjs
  - scripts/tests/session-relay/scenario-hooks-identity.mjs
  - scripts/tests/session-relay/scenario-spawn-wake-supervisor.mjs
  - scripts/tests/session-relay/selftest-fixture.mjs
  - scripts/tests/session-relay/selftest.mjs
  - scripts/tests/session-relay/supervisor-custody.mjs
  - scripts/tests/session-relay/version.mjs
  - scripts/tests/session-relay/workspace-smoke.mjs
  - scripts/tests/test-contracts.mjs
  - scripts/tests/unit/cargo-target-dir.test.mjs
  - scripts/tests/unit/payload-guard.test.mjs
  - scripts/tests/unit/session-relay-selftest.test.mjs
  - src/session-relay/Cargo.lock
  - src/session-relay/Cargo.toml
  - src/session-relay/rust-toolchain.toml
  - src/session-relay/src/appserver.rs
  - src/session-relay/src/bus.rs
  - src/session-relay/src/channel.rs
  - src/session-relay/src/cli.rs
  - src/session-relay/src/discover.rs
  - src/session-relay/src/fanout.rs
  - src/session-relay/src/fanout/authority.rs
  - src/session-relay/src/fanout/git.rs
  - src/session-relay/src/gc.rs
  - src/session-relay/src/hook.rs
  - src/session-relay/src/lib.rs
  - src/session-relay/src/lifecycle.rs
  - src/session-relay/src/main.rs
  - src/session-relay/src/protocol.rs
  - src/session-relay/src/sha256.rs
  - src/session-relay/src/spawn.rs
  - src/session-relay/src/store.rs
  - src/session-relay/src/supervisor.rs
  - src/session-relay/src/watch.rs
  - src/session-relay/src/workspace.rs
  - src/session-relay/src/workspace/authority.rs
  - src/session-relay/src/workspace/capability.rs
  - src/session-relay/src/workspace/custody.rs
  - src/session-relay/src/workspace/git.rs
  - src/session-relay/src/workspace/platform.rs
  - src/session-relay/src/workspace/platform/linux.rs
  - src/session-relay/src/workspace/platform/macos.rs
  - src/session-relay/src/workspace/repository_gate.rs
  - src/session-relay/src/workspace/resources.rs
  - src/session-relay/src/workspace/schema.rs
  - src/session-relay/tests/bus_smoke.rs
  - src/session-relay/tests/fanout.rs
  - src/session-relay/tests/fanout_reap.rs
  - src/session-relay/tests/lifecycle_admission.rs
  - src/session-relay/tests/lifecycle_managed.rs
  - src/session-relay/tests/lifecycle_release.rs
  - src/session-relay/tests/lifecycle_supervisor.rs
  - src/session-relay/tests/lock_race.rs
  - src/session-relay/tests/protocol.rs
  - src/session-relay/tests/support/fanout.rs
  - src/session-relay/tests/support/mod.rs
  - src/session-relay/tests/support/workspace.rs
  - src/session-relay/tests/workspace_coordination_process.rs
  - src/session-relay/tests/workspace_identity.rs
  - src/session-relay/tests/workspace_lease_process.rs
  - src/session-relay/tests/workspace_resources.rs
related_plans: []
---
## Goal

Move the Session Relay Rust crate and its Node suites out of the shipped plugin directory, keep CI lane ownership pointing at them, and add a guard that fails when any plugin payload grows a file a consumer cannot reach.

## Context & rationale

`plugins/session-relay/` is the marketplace `source` for the Session Relay plugin in both catalogs — `.claude-plugin/marketplace.json` gives `"source": "./plugins/session-relay"` and `.agents/plugins/marketplace.json` gives `{"source":"local","path":"./plugins/session-relay"}`. Neither is a file list. No narrowing mechanism exists anywhere in the repository: no `.npmignore`, no `.claudeignore`, no `files` or `exclude` key in either `plugin.json`. The repository's own `README.md` states the model plainly — the marketplace `source` boundary is the filter, "not an ignore-file mechanism". Every tracked byte under that directory is therefore cloned onto every consumer machine.

Measured on the current tree, that directory is 98 tracked files and 3,665,239 bytes:

| Subtree | Files | Bytes | Reachable at runtime on a consumer machine |
|---|---:|---:|---|
| `rust/` | 49 | 2,499,779 | No |
| `test/` | 37 | 1,079,688 | No |
| manifests, `bin/`, `hooks/`, `skills/`, docs | 12 | 85,772 | Yes |

97.7% of both the file count and the byte total is unreachable. The proof for `rust/` is `plugins/session-relay/bin/relay`: it is a POSIX resolver that tries `$SESSION_RELAY_BIN`, then `command -v session-relay`, then `${HOME}/.local/bin/session-relay`, and otherwise prints `docks-kit sync` guidance and exits 1. It contains no `cargo` and no reference to `rust/`, so a consumer can never build the shipped source. The binary they actually run arrives separately as a prebuilt release asset installed by the external `docks-kit` CLI, which means the Rust is paid for twice — once as unusable source in the payload, once as the 2.8 MB artifact that does the work. The proof for `test/` is that no shipped file references it; the suites are invoked only by `scripts/ci.mjs` through the plugin registry.

Keeping the Rust itself is deliberate. The crate is 53,448 lines of `src` against exactly three dependencies — `tinyjson`, `libc`, `rustix` — and the original justification is recorded in `docs/plans/finished/2026-07-02-session-relay-rust-port.md`: remove the consumer Node runtime dependency for Codex-only hosts, and upgrade the store mutex to kernel `flock(2)`, because "flock only interlocks with other flock callers and Node has no stable flock". The crate has since grown `F_OFD_SETLK` leases, `clone3(CLONE_INTO_CGROUP)`, `pidfd_open`, Landlock, seccomp BPF, `SCM_RIGHTS` fd passing over `SOCK_SEQPACKET`, and dirfd-relative `openat`/`O_NOFOLLOW`. None of those have a Node API. The weight this plan removes is repository-payload weight, not runtime weight, so relocation is the fix and reimplementation is not.

One coupling is a design decision rather than a rename. `scripts/lib/ci-targeting.mjs` resolves a changed path to a CI lane strictly by plugin-root prefix, and any path outside every plugin root fails open to all three shards. That default is correct — it over-gates and never under-gates — but relay is 345 s of a 411 s full gate, so letting every Rust-only pull request fail open discards the sharding win exactly where it is worth most. This plan adds an `extraRoots` dimension to the plugin descriptor so ownership survives the move while the payload boundary shrinks. `plugins/session-relay/` keeps `root`, `skills/`, `bin/`, `hooks/` and both manifests, so `assertPluginTreesAreRegistered` and `assertShardTopologyCoversRegistry` stay satisfied.

The guard exists because this class of bloat is invisible until a consumer installs. Nothing in the gate today asserts what a payload directory may contain, which is how 3.5 MB accumulated unnoticed. A positive allowlist — not a denylist of incidental names — is the reviewable form, matching the reasoning already written at `scripts/lib/ci-targeting.mjs:165`.

## Environment & how-to-run

Node 24 with pnpm through corepack; `corepack enable && pnpm install --frozen-lockfile`. Rust 1.85 with the `x86_64-unknown-linux-musl` target for the crate. All commands run from the repository root. The full gate is `node scripts/ci.mjs` and costs roughly 410 s; the selected-plugin gate is `node scripts/ci.mjs --plugin session-relay`. Moves use `git mv` so rename detection keeps history. Three pairs must land together or a gate contradicts itself: the generated workflow in `scripts/lib/session-relay-release-preparation.mjs` against `.github/workflows/ci.yml`; the descriptor in `scripts/lib/plugins.mjs` against `scripts/config/test-contracts.json`; and the biome argv in `package.json` against the descriptor's `javascriptQuality`.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | lane_ownership | Add an `extraRoots` array to the plugin descriptor shape and consult it in `pluginOwningPath` after the `root` prefix test, so a plugin may own paths outside its payload directory. Default `[]` for every other plugin, and keep the fail-open default for a path no plugin claims. | `scripts/lib/ci-targeting.mjs`; `scripts/lib/plugins.mjs`; `scripts/tests/ci-plugin-targeting.mjs` | — | `local` | `planned` | `node scripts/tests/ci-plugin-targeting.mjs` passes with a new case asserting a path under an `extraRoots` entry resolves to exactly `['repo','relay']`, and a case asserting a repo-level path owned by nobody still returns all three lanes. Failure: STOP; ownership must never silently under-gate. |
| 2 | move_crate | Move the crate with `git mv plugins/session-relay/rust src/session-relay`, then retarget every cargo literal: the descriptor `rust.dir`, `manifest`, `lockfile` and `builtBinary`, the musl provisioning and cargo cache blocks in both the workflow generator and the two committed workflows, the version-bump path pair, the binary producer working directory and `--manifest-path`, the ignore rule for the build tree, the two unit tests, and the relative crate dependency in the bypass fixture. Set the descriptor `extraRoots` to the new crate root. | `.github/workflows/build-binaries.yml`; `.github/workflows/ci.yml`; `.gitignore`; `plugins/session-relay/rust/Cargo.lock`; `plugins/session-relay/rust/Cargo.toml`; `plugins/session-relay/rust/rust-toolchain.toml`; `plugins/session-relay/rust/src/appserver.rs`; `plugins/session-relay/rust/src/bus.rs`; `plugins/session-relay/rust/src/channel.rs`; `plugins/session-relay/rust/src/cli.rs`; `plugins/session-relay/rust/src/discover.rs`; `plugins/session-relay/rust/src/fanout.rs`; `plugins/session-relay/rust/src/fanout/authority.rs`; `plugins/session-relay/rust/src/fanout/git.rs`; `plugins/session-relay/rust/src/gc.rs`; `plugins/session-relay/rust/src/hook.rs`; `plugins/session-relay/rust/src/lib.rs`; `plugins/session-relay/rust/src/lifecycle.rs`; `plugins/session-relay/rust/src/main.rs`; `plugins/session-relay/rust/src/protocol.rs`; `plugins/session-relay/rust/src/sha256.rs`; `plugins/session-relay/rust/src/spawn.rs`; `plugins/session-relay/rust/src/store.rs`; `plugins/session-relay/rust/src/supervisor.rs`; `plugins/session-relay/rust/src/watch.rs`; `plugins/session-relay/rust/src/workspace.rs`; `plugins/session-relay/rust/src/workspace/authority.rs`; `plugins/session-relay/rust/src/workspace/capability.rs`; `plugins/session-relay/rust/src/workspace/custody.rs`; `plugins/session-relay/rust/src/workspace/git.rs`; `plugins/session-relay/rust/src/workspace/platform.rs`; `plugins/session-relay/rust/src/workspace/platform/linux.rs`; `plugins/session-relay/rust/src/workspace/platform/macos.rs`; `plugins/session-relay/rust/src/workspace/repository_gate.rs`; `plugins/session-relay/rust/src/workspace/resources.rs`; `plugins/session-relay/rust/src/workspace/schema.rs`; `plugins/session-relay/rust/tests/bus_smoke.rs`; `plugins/session-relay/rust/tests/fanout.rs`; `plugins/session-relay/rust/tests/fanout_reap.rs`; `plugins/session-relay/rust/tests/lifecycle_admission.rs`; `plugins/session-relay/rust/tests/lifecycle_managed.rs`; `plugins/session-relay/rust/tests/lifecycle_release.rs`; `plugins/session-relay/rust/tests/lifecycle_supervisor.rs`; `plugins/session-relay/rust/tests/lock_race.rs`; `plugins/session-relay/rust/tests/protocol.rs`; `plugins/session-relay/rust/tests/support/fanout.rs`; `plugins/session-relay/rust/tests/support/mod.rs`; `plugins/session-relay/rust/tests/support/workspace.rs`; `plugins/session-relay/rust/tests/workspace_coordination_process.rs`; `plugins/session-relay/rust/tests/workspace_identity.rs`; `plugins/session-relay/rust/tests/workspace_lease_process.rs`; `plugins/session-relay/rust/tests/workspace_resources.rs`; `scripts/lib/plugins.mjs`; `scripts/lib/session-relay-release-preparation.mjs`; `scripts/tests/test-contracts.mjs`; `scripts/tests/unit/cargo-target-dir.test.mjs`; `src/session-relay/Cargo.lock`; `src/session-relay/Cargo.toml`; `src/session-relay/rust-toolchain.toml`; `src/session-relay/src/appserver.rs`; `src/session-relay/src/bus.rs`; `src/session-relay/src/channel.rs`; `src/session-relay/src/cli.rs`; `src/session-relay/src/discover.rs`; `src/session-relay/src/fanout.rs`; `src/session-relay/src/fanout/authority.rs`; `src/session-relay/src/fanout/git.rs`; `src/session-relay/src/gc.rs`; `src/session-relay/src/hook.rs`; `src/session-relay/src/lib.rs`; `src/session-relay/src/lifecycle.rs`; `src/session-relay/src/main.rs`; `src/session-relay/src/protocol.rs`; `src/session-relay/src/sha256.rs`; `src/session-relay/src/spawn.rs`; `src/session-relay/src/store.rs`; `src/session-relay/src/supervisor.rs`; `src/session-relay/src/watch.rs`; `src/session-relay/src/workspace.rs`; `src/session-relay/src/workspace/authority.rs`; `src/session-relay/src/workspace/capability.rs`; `src/session-relay/src/workspace/custody.rs`; `src/session-relay/src/workspace/git.rs`; `src/session-relay/src/workspace/platform.rs`; `src/session-relay/src/workspace/platform/linux.rs`; `src/session-relay/src/workspace/platform/macos.rs`; `src/session-relay/src/workspace/repository_gate.rs`; `src/session-relay/src/workspace/resources.rs`; `src/session-relay/src/workspace/schema.rs`; `src/session-relay/tests/bus_smoke.rs`; `src/session-relay/tests/fanout.rs`; `src/session-relay/tests/fanout_reap.rs`; `src/session-relay/tests/lifecycle_admission.rs`; `src/session-relay/tests/lifecycle_managed.rs`; `src/session-relay/tests/lifecycle_release.rs`; `src/session-relay/tests/lifecycle_supervisor.rs`; `src/session-relay/tests/lock_race.rs`; `src/session-relay/tests/protocol.rs`; `src/session-relay/tests/support/fanout.rs`; `src/session-relay/tests/support/mod.rs`; `src/session-relay/tests/support/workspace.rs`; `src/session-relay/tests/workspace_coordination_process.rs`; `src/session-relay/tests/workspace_identity.rs`; `src/session-relay/tests/workspace_lease_process.rs`; `src/session-relay/tests/workspace_resources.rs` | 1 | `local` | `planned` | `cargo build --manifest-path src/session-relay/Cargo.toml --release --locked` exits 0, `git ls-files plugins/session-relay/rust` prints nothing, and `node scripts/ci.mjs --plugin session-relay` exits 0. Failure: STOP and restore with the reverse `git mv`. |
| 3 | move_suites | Move the Node suites with `git mv plugins/session-relay/test scripts/tests/session-relay`, recompute the repository-root depth math in every moved suite, and retarget the descriptor `selftest`, its fifteen `sourceChecks` and five `releaseContracts`, all thirty-one contract-registry rows, the registry validator literals, the promotion repair path, and the two fixtures pinning source paths. Delete the now-redundant `plugins/session-relay/test` entry from the descriptor `javascriptQuality.ci` and from the three biome argv lists, because the existing `scripts` entry already covers the new location. In the same pass relocate the two sibling payload violations and the one declaration that shares their fate - `plugins/effect-kit/test/selftest.mjs` and `plugins/plan-lifecycle/test/selftest.mjs` to `scripts/tests/<plugin>/selftest.mjs`, and `plugins/plan-lifecycle/compatibility.json` to `scripts/config/plan-lifecycle-compatibility.json` - retargeting both descriptors, their registry rows and the prose that names them, so the allowlist in step 4 needs no exemption. Each is one file and none is read by any runtime: the declaration is consumed only by the plan-lifecycle self-test. | `AGENTS.md`; `package.json`; `plugins/effect-kit/test/selftest.mjs`; `plugins/plan-lifecycle/compatibility.json`; `plugins/plan-lifecycle/skills/AGENTS.md`; `plugins/plan-lifecycle/test/selftest.mjs`; `plugins/session-relay/test/companion-distribution-contract.mjs`; `plugins/session-relay/test/distribution-contract.mjs`; `plugins/session-relay/test/fake-app-server.mjs`; `plugins/session-relay/test/fanout-smoke.mjs`; `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.lock`; `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.toml`; `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/child-cancel-reentry.rs`; `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fabricated-owned-proof.rs`; `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fence-reentry.rs`; `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/guardless.rs`; `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/reentry-fence.rs`; `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/wrong-target.rs`; `plugins/session-relay/test/fixtures/reentry-inventory.json`; `plugins/session-relay/test/fixtures/release-identity-inventory.json`; `plugins/session-relay/test/fixtures/rust-test-inventory.json`; `plugins/session-relay/test/fixtures/wake-usage-claude.json`; `plugins/session-relay/test/fixtures/wake-usage-codex.jsonl`; `plugins/session-relay/test/historical-plan-path.mjs`; `plugins/session-relay/test/reentry-inventory.mjs`; `plugins/session-relay/test/release-evidence-contract.mjs`; `plugins/session-relay/test/release-instance-contract.mjs`; `plugins/session-relay/test/release-promotion-contract.mjs`; `plugins/session-relay/test/release-publication-contract.mjs`; `plugins/session-relay/test/remediation-contract.mjs`; `plugins/session-relay/test/rust-test-inventory.mjs`; `plugins/session-relay/test/scenario-appserver.mjs`; `plugins/session-relay/test/scenario-core.mjs`; `plugins/session-relay/test/scenario-discovery-hardening.mjs`; `plugins/session-relay/test/scenario-follow-doctor-mailbox.mjs`; `plugins/session-relay/test/scenario-gc.mjs`; `plugins/session-relay/test/scenario-hooks-identity.mjs`; `plugins/session-relay/test/scenario-spawn-wake-supervisor.mjs`; `plugins/session-relay/test/selftest-fixture.mjs`; `plugins/session-relay/test/selftest.mjs`; `plugins/session-relay/test/supervisor-custody.mjs`; `plugins/session-relay/test/version.mjs`; `plugins/session-relay/test/workspace-smoke.mjs`; `scripts/config/plan-lifecycle-compatibility.json`; `scripts/config/test-contracts.json`; `scripts/lib/plugins.mjs`; `scripts/lib/session-relay-release-promotion.mjs`; `scripts/tests/effect-kit/selftest.mjs`; `scripts/tests/plan-lifecycle/selftest.mjs`; `scripts/tests/session-relay/companion-distribution-contract.mjs`; `scripts/tests/session-relay/distribution-contract.mjs`; `scripts/tests/session-relay/fake-app-server.mjs`; `scripts/tests/session-relay/fanout-smoke.mjs`; `scripts/tests/session-relay/fixtures/lifecycle-capability-bypass/Cargo.lock`; `scripts/tests/session-relay/fixtures/lifecycle-capability-bypass/Cargo.toml`; `scripts/tests/session-relay/fixtures/lifecycle-capability-bypass/src/bin/child-cancel-reentry.rs`; `scripts/tests/session-relay/fixtures/lifecycle-capability-bypass/src/bin/fabricated-owned-proof.rs`; `scripts/tests/session-relay/fixtures/lifecycle-capability-bypass/src/bin/fence-reentry.rs`; `scripts/tests/session-relay/fixtures/lifecycle-capability-bypass/src/bin/guardless.rs`; `scripts/tests/session-relay/fixtures/lifecycle-capability-bypass/src/bin/reentry-fence.rs`; `scripts/tests/session-relay/fixtures/lifecycle-capability-bypass/src/bin/wrong-target.rs`; `scripts/tests/session-relay/fixtures/reentry-inventory.json`; `scripts/tests/session-relay/fixtures/release-identity-inventory.json`; `scripts/tests/session-relay/fixtures/rust-test-inventory.json`; `scripts/tests/session-relay/fixtures/wake-usage-claude.json`; `scripts/tests/session-relay/fixtures/wake-usage-codex.jsonl`; `scripts/tests/session-relay/historical-plan-path.mjs`; `scripts/tests/session-relay/reentry-inventory.mjs`; `scripts/tests/session-relay/release-evidence-contract.mjs`; `scripts/tests/session-relay/release-instance-contract.mjs`; `scripts/tests/session-relay/release-promotion-contract.mjs`; `scripts/tests/session-relay/release-publication-contract.mjs`; `scripts/tests/session-relay/remediation-contract.mjs`; `scripts/tests/session-relay/rust-test-inventory.mjs`; `scripts/tests/session-relay/scenario-appserver.mjs`; `scripts/tests/session-relay/scenario-core.mjs`; `scripts/tests/session-relay/scenario-discovery-hardening.mjs`; `scripts/tests/session-relay/scenario-follow-doctor-mailbox.mjs`; `scripts/tests/session-relay/scenario-gc.mjs`; `scripts/tests/session-relay/scenario-hooks-identity.mjs`; `scripts/tests/session-relay/scenario-spawn-wake-supervisor.mjs`; `scripts/tests/session-relay/selftest-fixture.mjs`; `scripts/tests/session-relay/selftest.mjs`; `scripts/tests/session-relay/supervisor-custody.mjs`; `scripts/tests/session-relay/version.mjs`; `scripts/tests/session-relay/workspace-smoke.mjs`; `scripts/tests/test-contracts.mjs`; `scripts/tests/unit/session-relay-selftest.test.mjs` | 2 | `local` | `planned` | `node scripts/tests/test-contracts.mjs` reports equal discovered, registered and selected counts, `git ls-files plugins/session-relay/test` prints nothing, `node scripts/tests/ci-plugin-targeting.mjs` passes its javascript-quality ownership superset assertion, and no tracked entry under any `plugins/<name>/` directory falls outside the step 4 allowlist. Failure: STOP; a suite resolving the wrong repository root must be fixed, never papered over. |
| 4 | payload_guard | Add the payload boundary guard described under `## The payload boundary guard {mechanism}`, register it in the repository-wide phase of the gate, and add its unit test to the contract registry. | `scripts/ci.mjs`; `scripts/config/test-contracts.json`; `scripts/plugins/payload-guard.mjs`; `scripts/tests/unit/payload-guard.test.mjs` | 3 | `local` | `planned` | `node scripts/plugins/payload-guard.mjs` exits 0 over all four plugins, and `node --test scripts/tests/unit/payload-guard.test.mjs` proves the guard exits non-zero on a planted disallowed file and zero once it is removed. Failure: STOP; a guard that cannot fail is not a guard. |
| 5 | shipped_prose | Rewrite every document describing the old layout: the plugin layout table and capability prose, the repository-scope tree, the delivery paragraph, the release-literal surface note, and the cargo cache note. State the new boundary and why the crate is not payload. | `.github/AGENTS.md`; `AGENTS.md`; `README.md`; `plugins/session-relay/AGENTS.md`; `plugins/session-relay/README.md`; `scripts/AGENTS.md` | 4 | `local` | `planned` | A Markdown scan for the two old directory prefixes over the surfaces this plan owns - excluding `docs/plans/`, `scripts/tests/fixtures/`, `node_modules` and `.git`, which hold plan records and fixtures that legitimately cite historical paths - returns no hit, and `node scripts/tree/guard.mjs` exits 0. Failure: STOP; shipped prose naming a missing path is the defect this plan exists to remove. |
| 6 | stale_refs | Retarget the scope-waiver keys naming moved suites and the `affected_paths` entries in the three active plans that name moved files, so no live record cites a path this plan deleted, and re-derive the scope-waiver pairs this plan owns, whose frozen-evidence entries are keyed to the pre-move suite paths and go stale the moment step 3 lands. Leave every finished record and every frozen release-instance JSON untouched. | `docs/plans/active/plan-lifecycle-review-and-authority-modules.md`; `docs/plans/active/session-relay-post-cutover-modules.md`; `docs/plans/active/session-relay-typed-irc-sqlite.md`; `scripts/config/plan-scope-waivers/plan-lifecycle-review-and-authority-modules.json`; `scripts/config/plan-scope-waivers/session-relay-payload-boundary.json` | 5 | `local` | `planned` | Every path cited by the `affected_paths` of the four other active plans - `plan-lifecycle-derived-history-navigation`, `plan-lifecycle-review-and-authority-modules`, `plan-lifecycle-review-dispatch-performance`, `session-relay-post-cutover-modules` and `session-relay-typed-irc-sqlite` - resolves on disk, reported as zero unresolved entries. The record of this plan is deliberately excluded: a move plan must cite both the pre-move paths it deletes and the post-move paths it creates, so 86 of its entries are tombstones by design. `node scripts/tests/plan-orchestration.mjs` exits 0. Failure: STOP; never edit a finished record to make a scan pass. |
| 7 | full_gate | Run the authoritative full gate on the combined change set and record the payload measurement before and after. | `scripts/ci.mjs` | 6 | `local` | `planned` | `node scripts/ci.mjs` exits 0, and the payload measurement reports twelve tracked files under `plugins/session-relay` totalling fewer than 100000 bytes. Failure: diagnose inside the implementation loop; repeated same-signature failure with no relevant-byte progress blocks this run. |

## The payload boundary guard {mechanism}

The guard answers one question per plugin: may a consumer reach this file? It is a positive
allowlist, not a denylist of incidental names, because a denylist grows one plausible entry at a
time and nobody re-reads it — the reasoning already written at `scripts/lib/ci-targeting.mjs:165`.

A payload directory may contain only `.claude-plugin/`, `.codex-plugin/`, `skills/`, `hooks/`,
`commands/`, `agents/`, `bin/`, `README.md`, `AGENTS.md`, `CLAUDE.md` and `LICENSE`. Every other
tracked entry fails the guard, which names the plugin, the offending path and its byte size. The
allowlist is the set of things a runtime loads: manifests, skills, hooks, commands, subagents, and
the launcher. Build inputs, test suites and toolchain files are not in it.

Membership is asked of `git ls-files`, so an untracked local file cannot mask a violation and an
ignored build tree cannot trip it. The guard runs in the repository-wide phase because the rule is
repository policy across all four plugins, not one plugin's business.

The allowlist has **no exemption mechanism**, and that is the point. Three tracked entries outside
it exist today — `plugins/plan-lifecycle/compatibility.json`, `plugins/plan-lifecycle/test/` and
`plugins/effect-kit/test/` — and step 3 relocates all three rather than naming them as permitted.
Each is a single file and none is read by any runtime, so exempting them would buy nothing and
would leave behind the escape hatch through which the next 3.5 MB arrives.

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/ci-plugin-targeting.mjs` | exit 0; a crate path under `src/session-relay/` selects exactly `['repo','relay']` |
| A2 | `node scripts/tests/test-contracts.mjs` | exit 0; discovered, registered and selected counts are equal |
| A3 | `node scripts/plugins/payload-guard.mjs` | exit 0; reports all four plugin payloads clean |
| A4 | `node --test scripts/tests/unit/payload-guard.test.mjs` | exit 0; includes a case where a disallowed file makes the guard exit non-zero |
| A5 | `git ls-files plugins/session-relay \| wc -l` | `12` |
| A6 | `cargo build --manifest-path src/session-relay/Cargo.toml --release --locked` | exit 0 |
| A7 | `node scripts/ci.mjs --plugin session-relay` | exit 0 |
| A8 | `node scripts/ci.mjs` | exit 0; all four plugins plus repo-wide pass |
| A9 | `grep -rn 'plugins/session-relay/rust\|plugins/session-relay/test' --include=*.md . \| grep -vE 'docs/plans/\|scripts/tests/fixtures/\|node_modules\|^\./\.git/'` | no output |

Each acceptance row is bound by how it is falsified:

| Binds | Meaning | Rows |
|---|---|---|
| `exit` | the command's exit status is the verdict | A1 A2 A3 A4 A6 A7 A8 |
| `match` | the command's output is compared against the expected value | A5 A9 |

## Out of scope / do-NOT-touch

Do not reimplement any part of the Rust crate in Node; the syscall surface has no Node equivalent and that question is settled in this plan's rationale. Do not change the crate's own module layout, its `Cargo.toml` dependency set, or any `.rs` content beyond what a path move forces. Do not change `plugins/session-relay/bin/relay`, the hooks, the skills, or either `plugin.json` — the consumer-visible contract must stay byte-identical apart from files disappearing that were never reachable. Do not touch `docs/plans/finished/**`, which is terminal historical record, nor `scripts/lib/session-relay-release-instances/*.json`, which is frozen release evidence whose recorded paths describe what was true at that commit. Do not touch `scripts/tests/plan-orchestration/fixtures/legacy-regression-tree/**`. Do not cut a release, push a tag, or publish anything: this plan is entirely local and requests no external effect. Do not relax any validator floor to make the gate pass.

## STOP conditions

STOP if the payload guard cannot be made to fail on a deliberately planted disallowed file, because an unfalsifiable guard is worse than none. STOP if lane ownership after step 1 lets any changed path select fewer shards than it does today, since under-gating is the one failure mode the fail-open default exists to prevent. STOP if a moved suite resolves a repository root different from the one it resolved before the move. STOP if the generated workflow and the committed workflow disagree after retargeting. STOP if any consumer-visible file under `plugins/session-relay/` changes content rather than merely surviving. STOP and request authority if any step turns out to require a push, tag, or publication.

## Open questions

None. Placement is settled: the crate becomes the Cargo root at `src/session-relay/`, keeping its mandatory `src/` and `tests/` children, and the Node suites move to `scripts/tests/session-relay/` beside the existing `unit/` and `plan-orchestration/` suites rather than into the crate's cargo-owned `tests/` directory. Lane ownership is settled: an `extraRoots` descriptor field, not an accepted fail-open. Rust is retained.

## Review

Plan-run: {"acceptance":null,"blocker":{"evidence_sha256":"c6ac2d4a9e01e7112c9566fcb4eb3e9b5509bec08021ef3f07b70ab4adfde19d","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"574d4365a05292d2deae55ab64fe9700773c4e9baf67b1c32cc796e98360587e","invocations":2,"result_sha256":"c6ac2d4a9e01e7112c9566fcb4eb3e9b5509bec08021ef3f07b70ab4adfde19d","state":"blocked"},"execution_parent":null,"goal_id":"74f45ad9-2bc6-4d22-8b7f-f782465413bf","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-payload-boundary.md","plan_sha256":"08e24f276c077801b1823a10f012935745b9be06c1443283853f689d89d01645","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"d49e7c59-a92d-4dee-9209-650f1c9e0ab6","schema":1,"source_base":"195f96adb69f9f1c001d0ffdb18a457abfbd12cd","source_sha256":"a6557771021e09dc6a22556c2ead3782b45caaa8b5a2580b3e28c662ededdc8a"}

N/A — pending draft review.

## Verification Results
Pre-implementation falsifiability probes. Each acceptance row was exercised against the tree at
this source_base before any implementation byte changed, so a row that is already green cannot
be mistaken for one the work will make green. Six of the nine rows are red today (A1, A3, A4,
A5, A6, A9). A2 is green, so it was proven to discriminate by a planted unregistered suite that
turned it red and a restore verified byte-identical. A7 and A8 are recorded as pre-move gate
baselines rather than as pending outcomes.

Pre-implementation falsifiability probes. Each acceptance row was exercised against the tree at
this source_base before any implementation byte changed, so a row that is already green cannot
be mistaken for one the work will make green. Six of the nine rows are red today (A1, A3, A4,
A5, A6, A9). A2 is green, so it was proven to discriminate by a planted unregistered suite that
turned it red and a restore verified byte-identical. A7 and A8 are recorded as pre-move gate
baselines rather than as pending outcomes.

A1, A3 and A9 were re-probed after draft review invocation 1 returned three repair findings, all
three reproduced and accepted. The allowlist could not pass over the plan-lifecycle and effect-kit
payloads, so step 3 now relocates those three entries instead of exempting them. A9 swept records
no step owns, so it is scoped to owned surfaces and falls from 167 hits to 3. Step 6 contradicted
the tombstones this plan deliberately declares, so it is restricted to the other five active plans.
The repair adds no Steps row: a progress transaction must preserve row identity and order, so the
relocation folds into move_suites, which already owns the Node suites two of the three files are.

Falsifiability-proof: {"binds":"exit","command_sha256":"d5d4076f388e028981817058befcf3b629e1a76a7c46622cb6648ccb3160c12d","expected_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","observed":1,"probe":"node -e on scripts/lib/ci-targeting.mjs resolveShardSelection({eventName:'pull_request',baseResolved:true,changedPaths:['src/session-relay/src/main.rs']}); exits 0 only when lanes equal ['repo','relay']. Today it returned ['repo','core','relay'] with reason path-outside-every-plugin-root:src/session-relay/src/main.rs, so the row is currently unsatisfied and the extraRoots work is what closes it.","row_id":"A1","source_base":"195f96adb69f9f1c001d0ffdb18a457abfbd12cd","step_id":"node scripts/tests/ci-plugin-targeting.mjs"}
Falsifiability-proof: {"binds":"exit","command_sha256":"f791780299b0d2e303a44eca7cdafa15267e4bc8475f7c8d0c582e45afbee831","expected_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","observed":1,"probe":"Planted scripts/tests/unit/zz-planted-probe.test.mjs (an unregistered suite) and ran node scripts/tests/test-contracts.mjs: exit 1. Removed it and re-ran: exit 0, with scripts/config/test-contracts.json byte-identical at sha256 180dfc53a844ddb3caa0cff2988915583fa7859ef4909fef764b54b7b434447f. The row therefore discriminates rather than passing vacuously.","row_id":"A2","source_base":"195f96adb69f9f1c001d0ffdb18a457abfbd12cd","step_id":"node scripts/tests/test-contracts.mjs"}
Falsifiability-proof: {"binds":"exit","command_sha256":"637c24ff47141ce59c8904e577616ff73b49f87732f6ada6f5f8fd8d085d597f","expected_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","observed":1,"probe":"node scripts/plugins/payload-guard.mjs today: exit 1, the module does not exist yet. Enumerating tracked entries outside the allowlist today returns plugins/plan-lifecycle/compatibility.json, plugins/plan-lifecycle/test, plugins/effect-kit/test, plugins/session-relay/rust and plugins/session-relay/test - the exact set steps 2 and 3 relocate; plugins/docks is already clean.","row_id":"A3","source_base":"195f96adb69f9f1c001d0ffdb18a457abfbd12cd","step_id":"node scripts/plugins/payload-guard.mjs"}
Falsifiability-proof: {"binds":"exit","command_sha256":"d2ca56ee3b791cc8f4876f93d864b2c30db8c8ab3f859201d9006d70a4f0cd66","expected_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","observed":1,"probe":"node --test scripts/tests/unit/payload-guard.test.mjs today: exit 1, the test does not exist yet.","row_id":"A4","source_base":"195f96adb69f9f1c001d0ffdb18a457abfbd12cd","step_id":"node --test scripts/tests/unit/payload-guard.test.mjs"}
Falsifiability-proof: {"binds":"match","command_sha256":"db065852200564330370bf4b3b37e08668c399a1bd7ec3679d17a0ba83f9f86e","expected_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","observed":{"matcher":"equals 12","result":"98"},"probe":"git ls-files plugins/session-relay | wc -l today reports 98 tracked files. The row asserts 12, so it is currently false by 86 files - exactly the count steps 2 and 3 relocate.","row_id":"A5","source_base":"195f96adb69f9f1c001d0ffdb18a457abfbd12cd","step_id":"git ls-files plugins/session-relay \\| wc -l"}
Falsifiability-proof: {"binds":"exit","command_sha256":"cbbbfe9e9c0edc96f8b332109231d3f2c97b76f78c6dd452ab2a88a23fe7e250","expected_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","observed":1,"probe":"cargo build --manifest-path src/session-relay/Cargo.toml --release --locked today: exit 1, no manifest at that path. The row cannot pass before step 2 moves the crate.","row_id":"A6","source_base":"195f96adb69f9f1c001d0ffdb18a457abfbd12cd","step_id":"cargo build --manifest-path src/session-relay/Cargo.toml --release --locked"}
Falsifiability-proof: {"binds":"exit","command_sha256":"cbbbfe9e9c0edc96f8b332109231d3f2c97b76f78c6dd452ab2a88a23fe7e250","expected_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","observed":0,"probe":"node scripts/ci.mjs --plugin session-relay today: exit 0. Recorded as the pre-move baseline, so any post-move failure of this row is attributable to the move and not to pre-existing breakage.","row_id":"A7","source_base":"195f96adb69f9f1c001d0ffdb18a457abfbd12cd","step_id":"node scripts/ci.mjs --plugin session-relay"}
Falsifiability-proof: {"binds":"exit","command_sha256":"c09ec2ae510b2c875845da1722b3f970caa713f7fcad33b02b82c6e5664b7c25","expected_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","observed":0,"probe":"node scripts/ci.mjs today: exit 0 across 4 plugins plus repo-wide in 419.2s, with this plan file and its scope-waiver JSON already present in the working tree. Recorded as the pre-move baseline.","row_id":"A8","source_base":"195f96adb69f9f1c001d0ffdb18a457abfbd12cd","step_id":"node scripts/ci.mjs"}
Falsifiability-proof: {"binds":"match","command_sha256":"1c16d8a1c85f5e3ec27900d0f82ee59aa3975e1c35a5b7d16288c65803b589de","expected_sha256":"df301f89b7059d92f0c7d4b95fc5fc2fe1b18e74cf9c5c33b7ee3387f27bc0ae","observed":{"matcher":"no output","result":"3 lines"},"probe":"The corrected scan - Markdown only, excluding docs/plans/, scripts/tests/fixtures/, node_modules and .git - reports exactly 3 lines today, in .github/AGENTS.md, plugins/session-relay/AGENTS.md and scripts/AGENTS.md. All three are owned by step 5, so the row is falsifiable and fully covered. The pre-repair scan counted 167 lines because it also swept plan records and a fixture that no step edits.","row_id":"A9","source_base":"195f96adb69f9f1c001d0ffdb18a457abfbd12cd","step_id":"grep -rn 'plugins/session-relay/rust\\|plugins/session-relay/test' --include=*.md . \\| grep -vE 'docs/plans/\\|scripts/tests/fixtures/\\|node_modules\\|^\\./\\.git/'"}
