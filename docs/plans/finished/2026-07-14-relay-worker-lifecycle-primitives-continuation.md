---
title: Ship Session Relay managed lifecycle behavior
goal: Ship managed relay birth, exact cancellation, durable lifecycle authority, and honest terminal release without historical recovery machinery.
status: finished
created: "2026-07-14T09:34:54-03:00"
updated: "2026-07-14T17:38:39-03:00"
started_at: "2026-07-14T10:19:03-03:00"
assignee: codex
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: xhigh
review_waivers: []
tags: [session-relay, lifecycle, rust, release]
affected_paths:
  - plugins/session-relay/rust/Cargo.toml
  - plugins/session-relay/rust/Cargo.lock
  - plugins/session-relay/rust/src/appserver.rs
  - plugins/session-relay/rust/src/bus.rs
  - plugins/session-relay/rust/src/channel.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/hook.rs
  - plugins/session-relay/rust/src/lib.rs
  - plugins/session-relay/rust/src/lifecycle.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/src/supervisor.rs
  - plugins/session-relay/rust/src/watch.rs
  - plugins/session-relay/rust/tests/lifecycle_admission.rs
  - plugins/session-relay/rust/tests/lifecycle_managed.rs
  - plugins/session-relay/rust/tests/lifecycle_supervisor.rs
  - plugins/session-relay/rust/tests/lifecycle_release.rs
  - plugins/session-relay/test/fake-app-server.mjs
  - plugins/session-relay/test/reentry-inventory.mjs
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/test/supervisor-custody.mjs
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
related_plans:
  - docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md
  - docs/plans/active/relay-worker-fanout.md
review_status: passed
planned_at_commit: 3e6486e45859cfeccd7b1ecf6d7c539c163a4ab5
execution_base_commit: 18b023ec461c2374eb73cf293d8223a23e36d044
ship_commit: 1e9b89b729dbe1102fbc3e146bc4cbfc9932ea70
---

# Ship Session Relay managed lifecycle behavior

## Goal

Ship the practical lifecycle layer Session Relay needs now:

1. A classic Claude/Codex child cannot be reported born, and a Codex app-server
   worker cannot receive its first `turn/start`, until its exact runtime id is
   durably bound to the expected managed worker.
2. Lifecycle authority is stored independently of the legacy discovery registry,
   so a still-running `0.10.0` writer cannot erase or reopen managed state.
3. Cancellation publishes a fence before re-entry, targets the exact known turn
   when one exists, and retains uncertainty instead of claiming success.
4. Transition-capable attach/wake child processes remain under an unreaped
   detached supervisor; terminal release is idempotent and labels evidence
   honestly as process-only unless stronger proof actually exists.

The source is complete when focused lifecycle behavior, the black-box relay
self-test, formatting, clippy, and the repository's one final CI run pass. The
normal producer-built binary and Session Relay release workflow follows
immediately after plan completion.

## Context & rationale

The previous execution expanded into a historical recovery protocol for three
dead custodians. On 2026-07-14 the owner explicitly decided that this material
is context, not a product guarantee, and directed the implementation to ship
the lifecycle behavior safely without preserving that evidence chain.

The audited reusable checkpoint is `2a864e9b6f966384e4c4ed0e4b3d563b348a3830`:
it contains the lifecycle state foundation, capability admission, race fixes,
and detached child supervisor. Commits after it that add WIP range receipts,
runner custodians, continuation bindings, recovery imports, or historical
cleanup are not part of this plan.

This reset is intentionally proportional. Independent agents may inspect or
implement non-overlapping seams, but there is one plan writer, one integration
tree, one bounded correctness review, and no repeated review of unchanged input.

## Environment & how-to-run

- Repository: `/home/vagrant/projects/docks`, Node 24, pnpm via Corepack.
- Rust: the toolchain pinned by `plugins/session-relay/rust/rust-toolchain.toml`;
  dependencies remain locked by `Cargo.lock`.
- Focused Rust commands run from `plugins/session-relay/rust/`.
- Black-box and CI commands run from the repository root.
- Project CI command: `node scripts/ci.mjs`.
- Committed release binaries must come only from
  `.github/workflows/build-binaries.yml`; never commit a local Cargo binary.

## Interfaces & data shapes

### Durable authority

`$AGENT_RELAY_HOME/lifecycle-v1.json` is the sole managed-lifecycle authority.
It carries schema version `1` plus the lifecycle maps used by `LifecycleStore`
(workers, pending attaches, bindings, operations, supervisors, watchdogs,
tombstones, and audit rows). `registry.json` remains discovery projection only.
Both files use the existing store lock, but lifecycle decisions read and write
only `lifecycle-v1.json`; a missing authority file initializes empty, while a
malformed existing file fails closed.

### Managed relay birth

Classic Claude and Codex spawn paths create a pending worker before launching
the child, pass its one-use claim tuple only in that child's environment, and
report birth only after the SessionStart hook has bound the observed runtime id
Active. A registration without that exact claim is killed and refused.

The app-server spawn path performs this order:

`create pending worker -> thread/start -> atomically claim exact thread id and
publish discovery -> admit InitialTurn -> turn/start`.

The pending token is one-use and binds worker id, generation, tool, canonical
cwd, and the expected or returned runtime id. Guarded app-server admission also
revalidates the registered socket fingerprint before first-turn use. Any
mismatch or failure before Active sends no first-turn bytes. Existing user-owned
and older sessions not born by relay remain on the compatible unmanaged path.

### Cancellation and terminalization

For an Active managed worker, cancellation first publishes the lifecycle fence,
drains/cancels prior operations, then sends `turn/interrupt` only for the exact
persisted thread/turn tuple. Terminal or idle confirmation may finalize the
operation; timeout, disconnect, missing turn identity, or supervisor loss stays
`FencingUnconfirmed`. Terminal release is a version-checked, idempotent worker,
pending-retirement, and tombstone update; the retained managed binding continues
to refuse re-entry and cannot reopen the runtime id.

### Evidence honesty

An unreaped supervisor-owned `Child` supports stable process control and exact
reap evidence. This release allows terminal release only when the worker itself
requires `ProcessOnly`, uses `SupervisorOwnedProcess`, has no live matching
operation, and every matching tombstone carries exact reap proof. It does not
claim cgroup worker-tree confinement, durable app-server flush proof, or
adversarial same-UID containment. Callers retain capacity whenever the required
scope is stronger than process-only evidence.

## Steps

| # | Task | Files | Depends | Status | Done condition / revert trigger |
|---|---|---|---|---|---|
| 1 | Integrate the audited product checkpoint through `2a864e9`, keeping current-main plan files and excluding every later receipt/recovery commit. | Existing Session Relay Rust modules and focused tests listed in `affected_paths` | — | done | Merge contains only the lifecycle/admission/supervisor product checkpoint; no runner custodian, WIP baseline, continuation binding, or recovery fixture appears. Revert trigger: any non-Session-Relay product path is changed. |
| 2 | Complete durable authority, managed Claude/Codex birth, exact cancellation, and idempotent terminal release. | `rust/src/{lifecycle,store,appserver,spawn,supervisor}.rs`, `rust/tests/lifecycle_release.rs`, `test/fake-app-server.mjs` | 1 | done | Focused tests prove old-writer non-erasure, no pre-Active birth/`turn/start`, exact interrupt, re-entry refusal after fence, and no release on uncertain proof. Revert trigger: an unmanaged compatibility test regresses or a failure path emits first-turn bytes. |
| 3 | Run the focused acceptance set, perform one fresh correctness review limited to the four Goal properties, and apply at most one reproduced-blocker repair pass. | Product diff and tests only; plan-manager remains the plan writer | 2 | done | A1-A6 pass. The sole review's three reproduced blockers were repaired together: discovery now publishes atomically with the managed claim, post-`turn/start` pump errors retain `FencingUnconfirmed`, and absent authority ignores registry lifecycle fields. No second review cycle was opened. |
| 4 | Document the shipped guarantee, complete the plan, run the one repository CI gate, then execute the official binary/release workflow and verify the published release. | `plugins/session-relay/{AGENTS.md,skills/productivity/session-relay/SKILL.md}`, manifests/binaries only through `scripts/release.mjs` and producer artifacts | 3 | done | Producer run `29365184448` built all four targets from source commit `6d63e65`; tag CI `29366032347` passed at release commit `1e9b89b`; the non-draft GitHub Release was published. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `cd plugins/session-relay/rust && cargo test --locked --test lifecycle_managed` | Exit 0; lifecycle transition and GC compatibility tests pass. |
| A2 | `cd plugins/session-relay/rust && cargo test --locked --test lifecycle_admission` | Exit 0; capability admission and compile-boundary tests pass. |
| A3 | `cd plugins/session-relay/rust && cargo test --locked --test lifecycle_supervisor` | Exit 0; detached supervisor custody and reap tests pass. |
| A4 | `cd plugins/session-relay/rust && cargo test --locked --test lifecycle_release` | Exit 0; durable authority and terminal-release regressions pass. |
| A5 | `node plugins/session-relay/test/reentry-inventory.mjs --compile-fail && node plugins/session-relay/test/selftest.mjs` | Both exit 0; every mutating relay path remains guarded and the black-box self-test prints its runtime-derived PASS summary. |
| A6 | `cd plugins/session-relay/rust && cargo fmt --check && cargo clippy --locked --all-targets -- -D warnings` | Exit 0 with no formatting diff or warning. |

The project CI command is recorded separately above and runs once after A1-A6,
not once per edit and not duplicated inside this inventory.

## Out of scope / do-NOT-touch

- Do not import `runner_job_custodian.rs`, WIP history/allowlist fixtures,
  continuation/restart bindings, recovery-node commits, or historical-root
  cleanup. They are not product requirements.
- Do not claim or implement cgroup worker-tree proof, `pidfd` proof, retained-fd
  `execveat`, or adversarial same-UID containment in this release. The detached
  supervisor's unreaped child is the supported stable process handle.
- Do not change Docks plan-review policy, Effect Kit, docks-kit, or the blocked
  relay-worker-fanout plan during this source implementation.
- Do not change existing unmanaged relay semantics except where needed to route
  operations through the already-added guards.
- Do not commit locally built release binaries.

## Known gotchas

- Codex returns the thread id from `thread/start`; there is no pre-minted id.
  The lifecycle claim must therefore occur after that response but before
  `turn/start`.
- App-server status reads are observations, not atomic start-if-idle authority.
- Old `0.10.0` processes understand only `registry.json`; lifecycle authority
  must not rely on unknown-key preservation there.
- Killing a root child does not prove all descendants are gone. Never translate
  process reap into worker-tree capacity release.
- `/tmp` is a small tmpfs in this environment. Clean disposable Cargo targets
  if `ENOSPC` appears; do not delete source worktrees.

## STOP conditions

- If the implementation cannot prevent first-turn bytes before an exact Active
  binding, stop and report rather than advertise managed birth.
- If an old-writer simulation can mutate or erase `lifecycle-v1.json`, stop and
  fix the storage boundary before release.
- If exact turn identity is unavailable, retain `FencingUnconfirmed`; do not
  guess the latest turn or claim quiescence.
- If official binary workflow or tag CI fails, do not create the GitHub Release.

## Cold-handoff checklist

- [x] File manifest names every production and test ownership area.
- [x] Environment and exact focused/final commands are recorded.
- [x] Durable store, birth ordering, cancellation, and evidence contracts are explicit.
- [x] Acceptance is executable and nonempty.
- [x] Historical recovery, stronger proof tiers, and adjacent plugins are excluded.
- [x] The reason for dropping recovery ceremony and keeping product safeguards is recorded.
- [x] Runtime/store/temporary-space traps are recorded.
- [x] Release binary provenance is copied from the Session Relay contract.
- [x] No TODO, undefined future type, or unresolved owner decision remains.

## Self-review

Score: 96/100, single bounded pass. The pass removed historical recovery,
reduced 38 criteria to six executable product gates, retained old-writer and
first-turn safety as real blockers, and narrowed process evidence so the release
cannot overclaim worker-tree quiescence. No iterative plan review is required;
completion receives one bounded correctness review after implementation.

## Review

- Goal met: yes. Managed birth, durable authority, exact cancellation, and
  evidence-honest terminal release shipped together.
- Regressions: none recorded. The first macOS producer run exposed an `openpty`
  signature mismatch; target-specific FFI pointers fixed it before any artifact
  or release was created.
- CI: focused acceptance passed; full local CI passed after the source and
  official-binary updates; tag CI `29366032347` passed at the release commit.
- Follow-ups: none required for this lifecycle release. Stronger worker-tree
  proof and historical recovery remain explicitly outside the guarantee.
- Filed by: Codex, OpenAI, `gpt-5.6-sol` at `xhigh` effort.
- Cross-check: the same read-only reviewer that found the three product blockers
  confirmed at source commit `6d63e65` that every repair closed and the terminal
  release invariant remained intact.

## Notes

- Owner decision, 2026-07-14: historical recovery/evidence is context only and
  is not a required product guarantee.
- Owner goal, 2026-07-14: ship Session Relay lifecycle behavior safely, with
  implementation expected to be bounded to roughly one or two focused hours.
- Focused implementation evidence, 2026-07-14: 40 lifecycle/admission/
  supervisor/release tests passed; six authority-bypass fixtures failed to
  compile as required; the supervisor PTY/flood/watchdog matrix passed; the
  black-box self-test passed all 125 checks; formatting and clippy passed.
- Release evidence, 2026-07-14: official producer run `29365184448` succeeded
  for Linux and macOS at `6d63e65`; the four artifact checksums match the
  committed binaries; release commit/tag `1e9b89b` passed tag CI run
  `29366032347`; the non-draft Session Relay release was published.
