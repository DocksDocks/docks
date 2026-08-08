---
title: Split Relay custody modules after the vNext cutover
goal: After typed SQLite Relay is authoritative, separate process custody, lifecycle garbage collection, cleanup replay, guardian, and Git broker modules without changing behavior.
plan_hash_mode: status-excluded-v1
status: finished
created: "2026-08-05T03:40:58.144Z"
updated: "2026-08-07T23:05:00+00:00"
started_at: null
finished_at: "2026-08-07T23:05:00+00:00"
blocked_reason: "Superseded by the extraction of session-relay into its own repository, DocksDocks/session-relay, split with `git subtree split --prefix=plugins/session-relay` from docks commit 2e973cbf08e6be28da260f1f0f48643afb58ac42. The tree this plan targets no longer exists in this repository, so the goal cannot be executed here. Run identity is repository_id + plan_path + run_id, so a plan cannot move between repositories: re-draft this goal in the new repository under goal_id d3d2f5b2-81f7-4a3a-8660-20dfc76b4e72 rather than reusing this record."
assignee: null
tags: [session-relay, refactor, custody, post-cutover]
affected_paths:
  - plugins/session-relay/rust/src/gc.rs
  - plugins/session-relay/rust/src/lifecycle.rs
  - plugins/session-relay/rust/src/lifecycle/gc.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/src/supervisor.rs
  - plugins/session-relay/rust/src/supervisor/process.rs
  - plugins/session-relay/rust/src/supervisor/workspace_custody.rs
  - plugins/session-relay/rust/src/workspace.rs
  - plugins/session-relay/rust/src/workspace/broker.rs
  - plugins/session-relay/rust/src/workspace/cleanup.rs
  - plugins/session-relay/rust/src/workspace/guardian.rs
  - plugins/session-relay/rust/tests/lifecycle_supervisor.rs
  - plugins/session-relay/rust/tests/workspace_coordination_process.rs
  - plugins/session-relay/rust/tests/workspace_resources.rs
  - plugins/session-relay/test/reentry-inventory.mjs
  - plugins/session-relay/test/rust-test-inventory.mjs
  - plugins/session-relay/test/workspace-smoke.mjs
related_plans:
  - docs/plans/active/session-relay-typed-irc-sqlite.md
---

# Split Relay custody modules after the vNext cutover

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":["v1_contract_contradiction"],"input_sha256":"aba9bbcc24fd5da847eb995b05e474b6505dbb7abb424b164fc10ed8b38a814c","invocations":2,"result_sha256":"059190b638b42983094cfc095ecc194e3978345d251f04c7d722fca7e11a1aa6","state":"passed"},"execution_parent":null,"goal_id":"d3d2f5b2-81f7-4a3a-8660-20dfc76b4e72","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-post-cutover-modules.md","plan_sha256":"8595f5da412d337482c071e6fefc7d3327992973bdc60993f898c4f152985692","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"affa3b81-5e27-4b73-9dc0-d7c3360bfe42","schema":1,"source_base":"672246bd388d3f34475be70857e3ec0dcb222b23","source_sha256":"43ed7194d0639c99eb6739f4a83e1a8c93a4e9dcfb9f392ca2158f9faa6d7bfb"}

## Goal

Reduce Session Relay’s post-cutover legacy maintenance surface by extracting six evidenced Modules along real protocol and caller seams while preserving every custody, Git, cleanup, and garbage-collection contract.

## Context & rationale

Baseline review found distinct generic process-supervisor and Linux workspace-custody protocols in one file; managed lifecycle state and unmanaged garbage collection in one store; duplicated finish/abort cleanup-intent replay; and separate guardian and Git broker processes in one workspace module. These are real seams with distinct callers and state transitions. They are not required for the SQLite communication cutover and must run only after that plan removes the old messaging authority, so storage and custody regressions remain attributable.

## Environment & how-to-run

Run from the repository root with the pinned Rust toolchain and Linux custody prerequisites. Start only after `session-relay-typed-irc-sqlite` is finished and its vNext gate is green on the exact source base. Preserve platform refusal behavior and all release-evidence contracts.

## Module extraction boundary {mechanism}

A frozen interface inventory maps each public entrypoint, internal process command, durable record, fault hook, reentry site, and test owner to exactly one destination Module. Generic process supervision, Linux workspace custody, unmanaged garbage collection, cleanup replay, guardian protocol, and Git broker protocol keep their existing state machines and errors. Root Modules re-export only current callers.

Each extraction moves one closed behavior set and its focused tests before another extraction starts. Finish and abort share cleanup parsing and replay mechanics but retain separate policy predicates. Guardian custody and Git mutation authorization remain separate protocols. A deletion is legal only when the inventory shows no caller and names the replacement contract.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | freeze_post_cutover_interfaces | Capture current public entrypoints, process commands, durable record keys, fault hooks, reentry sites, and test owners before moving code. | `plugins/session-relay/rust/src/supervisor.rs`; `plugins/session-relay/rust/src/lifecycle.rs`; `plugins/session-relay/rust/src/workspace.rs`; `plugins/session-relay/test/reentry-inventory.mjs`; `plugins/session-relay/test/rust-test-inventory.mjs` | — | `local` | `planned` | One inventory binds every external caller, process birth, protocol message, record shape, and acceptance owner; deletion or movement without a mapped destination fails. |
| 2 | split_supervisor_modules | Separate generic detached process supervision from Linux workspace custody and re-export only the existing entrypoints. | `plugins/session-relay/rust/src/supervisor.rs`; `plugins/session-relay/rust/src/supervisor/process.rs`; `plugins/session-relay/rust/src/supervisor/workspace_custody.rs`; `plugins/session-relay/rust/src/main.rs`; `plugins/session-relay/rust/src/spawn.rs`; `plugins/session-relay/rust/tests/lifecycle_supervisor.rs` | 1 | `local` | `planned` | Generic watchdog/control/stdIO behavior and workspace cgroup/lease/fence custody compile and pass through separate Modules with unchanged commands, errors, signals, reaping, and fault evidence. |
| 3 | split_lifecycle_gc | Move unmanaged retention and garbage-collection manifests/checkpoints behind a dedicated Module that reuses the lifecycle transaction adapter. | `plugins/session-relay/rust/src/lifecycle.rs`; `plugins/session-relay/rust/src/lifecycle/gc.rs`; `plugins/session-relay/rust/src/gc.rs`; `plugins/session-relay/rust/tests/workspace_resources.rs` | 1 | `local` | `planned` | Managed attach/admission/fencing and unmanaged GC have separate ownership; GC resume/delete manifests and held-lock safety remain byte- and behavior-compatible. |
| 4 | unify_cleanup_replay | Extract shared cleanup-intent parse, retention verification, intermediate replay, and finalization from finish and abort while keeping request policy separate. | `plugins/session-relay/rust/src/workspace.rs`; `plugins/session-relay/rust/src/workspace/cleanup.rs`; `plugins/session-relay/rust/tests/workspace_coordination_process.rs`; `plugins/session-relay/test/workspace-smoke.mjs` | 1 | `local` | `planned` | Finish and abort call one replay/finalization Module; their distinct acceptance predicates and reasons remain outside it; every interrupted Releasing and AbortedRetained path passes. |
| 5 | split_guardian_and_broker | Separate Linux guardian custody protocol from Git broker authorization, replay, index, commit, and handback mechanics. | `plugins/session-relay/rust/src/workspace.rs`; `plugins/session-relay/rust/src/workspace/guardian.rs`; `plugins/session-relay/rust/src/workspace/broker.rs`; `plugins/session-relay/test/reentry-inventory.mjs`; `plugins/session-relay/rust/tests/workspace_coordination_process.rs` | 2, 3, 4 | `local` | `planned` | Each internal process has one Module, closed command protocol, and exact caller; Git mutations remain capability-brokered and custody remains Linux-gated. |
| 6 | remove_obsolete_branches | Delete only post-vNext unreachable compatibility and test-hook branches whose callers and contract owners have explicit replacements. | `plugins/session-relay/rust/src/supervisor.rs`; `plugins/session-relay/rust/src/lifecycle.rs`; `plugins/session-relay/rust/src/workspace.rs`; `plugins/session-relay/test/reentry-inventory.mjs`; `plugins/session-relay/test/rust-test-inventory.mjs` | 2, 3, 4, 5 | `local` | `planned` | The frozen interface inventory has no unmapped deletion; production ambient test hooks have injected or test-only seams; no historical release record or retained workspace becomes unreadable. |
| 7 | prove_module_parity | Run focused custody, lifecycle, workspace, reentry, and full selected-plugin contracts against the final module graph. | all affected paths in frontmatter | 6 | `local` | `planned` | All named acceptance commands pass on unchanged behavior; reverting each extraction to an unmapped cross-Module call makes its owning contract fail. |

## Acceptance criteria

| ID | Command | Expected result |
|---|---|---|
| A1 | `cargo test --locked --manifest-path plugins/session-relay/rust/Cargo.toml --test lifecycle_supervisor` | Exit 0; generic supervision and workspace custody preserve startup, heartbeat, disconnect, cancellation, and reap behavior. |
| A2 | `cargo test --locked --manifest-path plugins/session-relay/rust/Cargo.toml --test workspace_coordination_process` | Exit 0; cleanup replay, guardian, broker, capability, and handback behavior remain unchanged. |
| A3 | `node plugins/session-relay/test/reentry-inventory.mjs` | Exit 0; every process, FD, signal, Git, filesystem, broker, and platform site is classified after movement. |
| A4 | `node plugins/session-relay/test/workspace-smoke.mjs --case single-session-compat && node plugins/session-relay/test/workspace-smoke.mjs --case docs-contract` | Exit 0 against an explicit fresh binary; public workspace behavior and documentation contracts remain stable. |
| A5 | `node scripts/ci.mjs --plugin session-relay` | Exit 0; the complete Session Relay source, custody, release-evidence, and fresh-binary gates pass. |

## Out of scope / do-NOT-touch

- Do not change the vNext SQLite schema, IRC/job protocol, migration, or adapter semantics.
- Do not merge process control into IRC or job state.
- Do not change Git capability authority, worktree layout, platform admission, cgroup/Landlock behavior, or cleanup retention policy.
- Do not delete historical records or compatibility solely because a file is large.
- Do not publish or release in this plan.

## STOP conditions

1. The vNext communication plan is not finished or its exact selected-plugin gate is not green.
2. An extraction changes a durable record, public command, error, stdout, signal, custody, or Git authorization contract.
3. A moved process/reentry site lacks one exact owner and executable contract.
4. A deletion lacks a mapped caller and replacement contract or changes historical evidence.
5. The selected Session Relay gate fails after focused tests pass.

## Open questions

None. This plan is deliberately post-cutover and behavior-preserving; it does not carry the SQLite migration.

## Review

N/A — manager-written after draft review.

## Verification Results

N/A — plan-only request; implementation and acceptance have not run.
