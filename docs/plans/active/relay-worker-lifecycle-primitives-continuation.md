---
title: Continue relay worker lifecycle primitives from current main
goal: Finish the existing Session Relay lifecycle deliverable from its verified implementation checkpoint under a normal current-lifecycle execution base.
status: planned
created: "2026-07-14T09:34:54-03:00"
updated: "2026-07-14T09:58:20-03:00"
started_at: null
assignee: null
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: xhigh
review_waivers: []
tags: [session-relay, lifecycle, rust, continuation]
affected_paths:
  - docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md
  - plugins/session-relay/rust/src/appserver.rs
  - plugins/session-relay/rust/src/bin/runner_job_custodian.rs
  - plugins/session-relay/rust/src/bus.rs
  - plugins/session-relay/rust/src/channel.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/hook.rs
  - plugins/session-relay/rust/src/lib.rs
  - plugins/session-relay/rust/src/lifecycle.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/rust/src/process_identity.rs
  - plugins/session-relay/rust/src/runtime_install.rs
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/src/supervisor.rs
  - plugins/session-relay/rust/src/watch.rs
  - plugins/session-relay/rust/tests/lifecycle_supervisor.rs
  - plugins/session-relay/rust/tests/lifecycle_turn_cancellation.rs
  - plugins/session-relay/rust/tests/lifecycle_store_compat.rs
  - plugins/session-relay/rust/tests/lifecycle_managed.rs
  - plugins/session-relay/rust/tests/lifecycle_admission.rs
  - plugins/session-relay/rust/tests/lifecycle_controller.rs
  - plugins/session-relay/rust/tests/process_identity.rs
  - plugins/session-relay/rust/tests/lifecycle_proof.rs
  - plugins/session-relay/rust/tests/lifecycle_terminal.rs
  - plugins/session-relay/rust/Cargo.toml
  - plugins/session-relay/rust/Cargo.lock
  - plugins/session-relay/hooks/hooks.json
  - plugins/session-relay/hooks/codex-hooks.json
  - plugins/session-relay/test/fake-app-server.mjs
  - plugins/session-relay/test/feasibility-probe.mjs
  - plugins/session-relay/test/lifecycle-smoke.mjs
  - plugins/session-relay/test/mixed-version-lifecycle-store.mjs
  - plugins/session-relay/test/process-signal-inventory.mjs
  - plugins/session-relay/test/reentry-inventory.mjs
  - plugins/session-relay/test/run-build-matrix.mjs
  - plugins/session-relay/test/runtime-appserver-quiescence.mjs
  - plugins/session-relay/test/runtime-hook-abort.mjs
  - plugins/session-relay/test/runtime-hook-upgrade.mjs
  - plugins/session-relay/test/runner-job-custodian.mjs
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/test/supervisor-custody.mjs
  - plugins/session-relay/test/appserver-schema-contract.mjs
  - plugins/session-relay/test/wip-snapshot.mjs
  - plugins/session-relay/test/rust-test-inventory.mjs
  - plugins/session-relay/test/final-scope.mjs
  - plugins/session-relay/test/fixtures/lifecycle-capability-schema.json
  - plugins/session-relay/test/fixtures/runtime-doctor-schema.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/doctor-ready.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/doctor-degraded.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/doctor-unavailable.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/install-changed.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/install-current.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/install-lower-no-op.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/install-previous-retained.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/command-inability.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/usage-error.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/schema-error.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/validation-error.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/tamper-error.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/io-error.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/lock-error.json
  - plugins/session-relay/test/fixtures/process-signal-inventory.json
  - plugins/session-relay/test/fixtures/reentry-inventory.json
  - plugins/session-relay/test/fixtures/rust-test-inventory.json
  - plugins/session-relay/test/fixtures/appserver-server-requests.json
  - plugins/session-relay/test/fixtures/wip-step-allowlist.json
  - plugins/session-relay/test/fixtures/wip-historical-baseline.json
  - plugins/session-relay/test/fixtures/lifecycle-continuation-binding.json
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.toml
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.lock
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/guardless.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/wrong-target.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fence-reentry.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/reentry-fence.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/cancel-reentry.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/child-cancel-reentry.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fabricated-owned-proof.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fabricated-pidfd-proof.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/tampered-cgroup-proof.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fabricated-protocol-proof.rs
  - plugins/session-relay/AGENTS.md
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - .github/workflows/build-binaries.yml
related_plans:
  - docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md
  - docs/plans/finished/2026-07-14-compatibility-final-review-repair-rung.md
  - docs/plans/active/relay-worker-fanout.md
review_status: null
planned_at_commit: 3e6486e45859cfeccd7b1ecf6d7c539c163a4ab5
execution_base_commit: null
---

# Continue relay worker lifecycle primitives from current main

## Goal

Finish the predecessor's unchanged Session Relay deliverable: Linux-authoritative
managed admission, stable-handle process control, worker quiescence, durable
lifecycle authority across released `0.10.0` writers, typed Darwin
unavailability, and an exact source-ready handoff that remains
`packaged_ready=false` until the later Session Relay release.

This continuation changes only plan lifecycle identity and execution logistics.
It does not narrow or replace the predecessor Goal, technical interfaces,
negative guarantees, remaining implementation steps, 38 completion criteria,
or 82-event evidence contract.

## Context & rationale

The predecessor accumulated a valid technical specification and a clean partial
implementation, but its historical start transition cannot pass the current
generic completion validator. Docks `0.12.5` added a narrow legacy E/R/B/Q/F
bridge. Its Q review then found only two stale status statements: the old text
still described the completed Docks prerequisite and Step P as pending.

A proposed Docks `0.12.6` repair rung grew into an unrelated 3,000-line
release/recovery subsystem solely to authorize those two prose corrections. It
was never started or implemented and is now archived as superseded. The current
path preserves the product Goal and implementation history while establishing a
normal current plan start and execution base before any additional source commit
is integrated.

Authoritative preserved inputs at scaffold time:

- Frozen technical specification:
  `docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md`,
  Git blob `bc8621a6131363849c2cc79ab95899dcb1302138`, raw SHA-256
  `5cb993acd7532b736d62123b1b11be4b1d672c6e0b252ed00501d16c0bd8dfda`.
- Clean implementation branch/worktree:
  `codex/primitives-collab` at
  `22b754adcd5756f084fd61f55436971a6b9d407f` in
  `/tmp/docks-primitives-collab`.
- Branch relation at scaffold: merge base
  `9e0bd6ab69bffc565a240139cb598af120b3bec9`; 23 commits exist only on the
  implementation branch and 121 only on current `main`.
- Completed predecessor rows remain completed and immutable: 1, P, 2, 3a, and
  3b. Step 1b has partial implementation commits but remains incomplete until
  its full frozen done condition and gates pass. Pending rows are 1b, 3c, 3d,
  1c, 1d, 4, 5, 6, 7, 8, and 9 in that dependency order.

Why a successor instead of another compatibility exception: the implementation
has not been merged into `main`. Starting this plan first means the later
integration and every remaining worker commit naturally belong to a current,
reviewable `execution_base_commit..HEAD` range. No history rewrite, Docks policy
change, or release prerequisite is needed.

## Environment & how-to-run

- Orchestrator checkout: `/home/vagrant/projects/docks`, branch `main`.
- Preserved source checkout: `/tmp/docks-primitives-collab`, branch
  `codex/primitives-collab`, initially clean at `22b754a`.
- Create a fresh continuation worker branch/worktree from the recorded
  `execution_base_commit`; integrate the preserved branch there. Do not resume
  source writes in the old worktree.
- Node.js: 24.x, matching repository CI.
- Rust commands must run from `plugins/session-relay/rust/`, where
  `rust-toolchain.toml` pins Rust 1.85.0. Never run Cargo from repository root.
- Narrow verification order: exact changed target/test, affected Rust target,
  `cargo fmt --check` + clippy, affected Node integration, relay selftest, then
  the one required full `node scripts/ci.mjs` immediately before each commit.
- Release flow after passed completion review:
  `node scripts/release.mjs --dry-run --plugin session-relay patch`, then
  `node scripts/release.mjs --plugin session-relay patch` under the owner's
  standing authorization. Verify the pushed commit, tag, GitHub Release, tag CI,
  manifests, and installed payload independently.

## Interfaces & data shapes

The archived predecessor is the immutable technical specification. A worker
must read it before editing source. This continuation supplies only the following
closed overlay; no other predecessor term is reinterpreted:

| Surface | Continuation value |
|---|---|
| Product Goal and guarantee tiers | Byte-authoritative predecessor `## Goal` and `## Interfaces & data shapes`. |
| Completed prefix | Rows 1, P, 2, 3a, and 3b plus their named commits/evidence. |
| Remaining work | Predecessor rows 1b, 3c, 3d, 1c, 1d, 4, 5, 6, 7, 8, and 9 with their exact files, dependencies, mutations, RunGates, and STOP conditions. |
| Technical acceptance | Predecessor A101–A138 and its exact 82-event schedule; no command, expected result, or negative may be dropped. |
| Lifecycle identity | This plan's reviewed planned commit, first-start commit, and recorded `execution_base_commit` own new execution. Predecessor receipt bytes retain their original per-receipt plan commit/blob; `ContinuationBindingV1` imports them by hash without rewriting or relabeling them. |
| Existing source history | `codex/primitives-collab@22b754a`, integrated after this plan starts as the exact second parent of one two-parent continuation merge; no preserved commit is rewritten or force-updated. |
| Completion inventory | Exactly 38 criterion-specific rows A101–A138 below, in that order. Each row binds its frozen predecessor command/expected hashes, all scheduled event occurrences, its ordered summary, and both final evidence records. |
| Completion proof | `ContinuationScopeV1 {schema:1,spec_path,spec_git_blob,spec_raw_sha256,predecessor_planned_at_commit,predecessor_execution_base_commit,continuation_plan,continuation_planned_at_commit,continuation_start_commit,continuation_execution_base_commit,continuation_binding_sha256,preserved_implementation_commit,implementation_merge,implementation_merge_parents,implementation_tip,implementation_tree,implementation_scope_tree_sha256,reviewed_head,acceptance_inventory_sha256,schedule_sha256,event_count,event_chain_head,step_range_chain_head,runner_attempt_chain_head,root_migration_snapshot_sha256,criteria_summaries,criteria_sha256,final_execution_evidence_sha256,lifecycle_completion_evidence_sha256,source_ready:true,packaged_ready:false,fanout_unblock:false,receipt_sha256}`. |

Before the first post-start source edit, Step 1 creates and commits exactly one
`plugins/session-relay/test/fixtures/lifecycle-continuation-binding.json` as
compact RFC-8785 JCS:

```text
ContinuationBindingV1 {
  schema:1,
  spec:{path,git_blob,raw_sha256,planned_at_commit,execution_base_commit},
  continuation:{plan_path,planned_at_commit,reviewed_commit,
    reviewed_plan_blob,start_commit,start_plan_blob,execution_base_commit},
  preserved_implementation:{commit,tree},
  imported_prefix_events:[{
    ordinal,occurrence_id,criterion_id,original_plan_commit,
    original_plan_blob,original_result_sha256,
    original_event_receipt_sha256,imported_event_receipt_sha256
  }],
  imported_step_ranges:[{
    step,original_plan_commit,original_plan_blob,base_commit,head_commit,
    original_receipt_sha256,imported_receipt_sha256
  }],
  legacy_authorities:[{
    kind,pin,source_sha256,snapshot_sha256,receipt_chain_head
  }],
  acceptance_inventory_sha256,schedule_sha256,binding_sha256
}
```

The arrays are closed: eight prefix events in original ordinal order; one
historical step range; and three legacy authorities in exact
`step_range,runner_canonical,runner_equivalent` order. Each imported receipt
stores the hash of the immutable original plus its own continuation identity;
the original byte is never edited, copied as a new authority, or attributed to
this plan. `binding_sha256` is SHA-256 over JCS without that field. A
fixture-only negative matrix drops, duplicates, reorders, or substitutes each
plan/blob/base/commit/event/range/authority/chain identity in turn and requires
every case to fail before later work begins.

`plugins/session-relay/test/final-scope.mjs` must add one deterministic,
read-only completion mode:

```text
node plugins/session-relay/test/final-scope.mjs --verify-continuation \
  --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md \
  --spec-git-blob bc8621a6131363849c2cc79ab95899dcb1302138 \
  --spec-raw-sha256 5cb993acd7532b736d62123b1b11be4b1d672c6e0b252ed00501d16c0bd8dfda \
  --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md \
  --reviewed-head <40hex>
```

It validates the closed overlay and `ContinuationBindingV1`, exact-compares the
38 continuation rows one-to-one with the frozen predecessor inventory, proves
all 82 events and both evidence objects, proves the exact two-parent integration
and preserved source-scope tree, and emits exactly one compact
`ContinuationScopeV1` line. `--verify-continuation-criterion` performs the same
closed validation and emits one criterion result. Both modes write nothing and
do not contact a runtime, network, cache, or live receipt root during completion
review. Changing or omitting any frozen command, expected text, occurrence,
summary, evidence hash, merge parent, or binding field fails.

## Steps

| # | Task | Files | Depends | Status | Done condition / STOP trigger |
|---|---|---|---|---|---|
| 1 | From the recorded execution base, create a fresh continuation worker branch. Before any source edit, merge `codex/primitives-collab@22b754a` with `--no-ff`: first parent exactly the execution base, second parent exactly `22b754a`; keep the first parent's plan/archive tree, permit no conflict except deletion of the stale predecessor active-plan path, and require the merge's Session Relay/workflow tree to equal the second parent. Commit and negative-test `ContinuationBindingV1`, independently reverify the completed prefix, then finish predecessor Step 1b. | Frozen predecessor Step 1b paths; new continuation-binding fixture; this plan and both archived plans read-only | — | planned | Merge parents and scope trees are exact; the current/archived plan bytes equal the first parent and the stale predecessor active path remains absent; no preserved commit is lost or rewritten. The binding proves eight original events, one range, and three legacy authorities without rewriting evidence. Rows 1/P/2/3a/3b remain exact; frozen A103/A109/A107/A108/A106 and the Step-1b receipt pass. Any other conflict, binding negative that passes, or completed-prefix regression is STOP. |
| 2 | Complete predecessor Steps 3c and 3d in order with their exact durable-store, cancellation, admission-inventory, mixed-version, and range-receipt contracts. | Frozen predecessor Step 3c/3d paths | 1 | planned | Every frozen Step 3c/3d done condition and A113/A116/A117/A127/A128/A106 occurrence passes; no old writer can erase/reopen lifecycle authority and every pre-controller mutation path has an executed unique behavior test. |
| 3 | Execute the owner-provisioned 1c/1d live feasibility sequences and, only on their valid retained receipt, implement predecessor Step 4. | Frozen predecessor Step 1c/1d/4 paths | 2 | planned | A110 then A111 prove the exact retained-fd/TRACEEXEC/cgroup path; A118/A119/A120 and Step-4 A106 pass. Missing or invalid runner/delegation blocks this row; an unbuildable primitive is a HARD STOP to the owner, never a fallback. |
| 4 | Implement predecessor Steps 5, 6, and 7 in dependency order. | Frozen predecessor Step 5/6/7 paths | 3 | planned | Managed first-prompt control, stable runtime, bounded quiescence, proof construction, reconcile/release/abandon, terminalization, and all named Rust/Node/golden/inventory gates pass without weakening a frozen negative. |
| 5 | Run predecessor Step 8's repeatable completeness audit and Step 9's documentation, Darwin, build-matrix, final-scope, cleanup, and source-ready handoff. Add the read-only continuation verifiers above. | Frozen predecessor Step 8/9 paths plus `plugins/session-relay/test/final-scope.mjs` | 4 | planned | Exact 38-criterion/82-event evidence closes; every live authority/root is cleaned only through the frozen A138 protocol; `FinalExecutionEvidenceV1` binds the continuation execution identities plus the continuation binding and passes before integration. |
| 6 | With `main` still byte-equal to the recorded execution base, fast-forward it to the clean continuation worker tip, prove the embedded merge has parents `<execution-base> 22b754a` and exact source/plan scope, project and import one `LifecycleCompletionEvidenceV1`, run A101–A138 and full repository CI, then enter `in_review`; after passed completion review, archive the plan. Session Relay release is the separate post-ship producer workflow. | This plan and completion-evidence handoff only; all implementation paths read-only after fast-forward | 5 | planned | Integration occurs before evidence import and `in_review`; the imported record binds both final evidence hashes, all 38 summaries, 82-event/chain/root/runner identities, exact integration commit/tree, and `source_ready=true`, `packaged_ready=false`, `fanout_unblock=false`. A101–A138 pass in order in the disposable checkout, full `node scripts/ci.mjs` exits 0, completion review passes, and the plan archives before the independently verified release flow begins. |

### Exact integration order

Let `B` be this plan's recorded execution-base commit and `P` be
`22b754adcd5756f084fd61f55436971a6b9d407f`. Main-context plan-manager records
both before dispatch. The Step-1 worker creates a fresh branch at `B` and runs
one `--no-ff --no-commit` merge of `P`. The only permitted unmerged path is
`docs/plans/active/relay-worker-lifecycle-primitives.md`; it is resolved as
absent, matching `B`. The current continuation and both archive paths must be
byte-identical to `B`. Every path outside `plugins/session-relay/` and
`.github/workflows/build-binaries.yml` must also equal `B`, while those two
source scopes must equal `P`. The resulting commit `M` must have the exact
ordered parent string `B P`; any other conflict, parent, or tree is STOP.

Every later worker commit descends from `M` and cannot modify a plan path. After
Step 5 produces a clean final tip `T`, `main` must still equal `B`. Plan-manager
fast-forwards `main` to `T`, verifies `M` remains in the first-parent ancestry of
`T`, rechecks `M`'s exact parents and trees, and records `T` as the integrated
source commit. Only then may it project/import `LifecycleCompletionEvidenceV1`
as a plan-only commit and enter `in_review`. Squash, cherry-pick, rebase, patch
replay, a second source merge, evidence import before source integration, and
completion review against the pre-integration head are forbidden.

## Acceptance criteria

The separately recorded project CI command is `node scripts/ci.mjs`; completion
runs it once after this exact ordered inventory rather than duplicating it as a
row. Each command is read-only and validates `ContinuationBindingV1`, its own
frozen predecessor command/expected hashes, all scheduled occurrences, its
ordered criterion summary, and the exact `FinalExecutionEvidenceV1` plus
`LifecycleCompletionEvidenceV1` hashes embedded before `in_review`. Dynamic
hash placeholders mean lowercase 64-hex.

| ID | Command | Expected |
|---|---|---|
| A101 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A101 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A101 occurrences=1 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A102 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A102 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A102 occurrences=1 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A103 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A103 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A103 occurrences=1 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A104 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A104 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A104 occurrences=10 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A105 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A105 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A105 occurrences=2 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A106 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A106 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A106 occurrences=11 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A107 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A107 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A107 occurrences=2 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A108 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A108 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A108 occurrences=2 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A109 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A109 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A109 occurrences=2 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A110 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A110 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A110 occurrences=1 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A111 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A111 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A111 occurrences=1 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A112 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A112 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A112 occurrences=2 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A113 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A113 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A113 occurrences=2 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A114 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A114 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A114 occurrences=2 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A115 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A115 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A115 occurrences=2 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A116 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A116 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A116 occurrences=2 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A117 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A117 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A117 occurrences=2 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A118 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A118 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A118 occurrences=2 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A119 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A119 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A119 occurrences=1 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A120 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A120 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A120 occurrences=1 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A121 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A121 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A121 occurrences=1 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A122 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A122 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A122 occurrences=2 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A123 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A123 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A123 occurrences=2 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A124 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A124 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A124 occurrences=2 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A125 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A125 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A125 occurrences=1 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A126 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A126 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A126 occurrences=2 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A127 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A127 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A127 occurrences=3 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A128 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A128 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A128 occurrences=4 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A129 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A129 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A129 occurrences=2 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A130 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A130 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A130 occurrences=2 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A131 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A131 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A131 occurrences=3 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A132 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A132 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A132 occurrences=2 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A133 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A133 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A133 occurrences=1 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A134 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A134 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A134 occurrences=1 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A135 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A135 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A135 occurrences=1 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A136 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A136 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A136 occurrences=1 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A137 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A137 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A137 occurrences=1 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |
| A138 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation-criterion --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --criterion A138 --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; stdout exactly `CONTINUATION_ACCEPTANCE PASS criterion=A138 occurrences=1 summary_sha256=<hex> final_evidence_sha256=<hex> completion_evidence_sha256=<hex>`. |

## Out of scope / do-NOT-touch

- Do not implement or release the superseded Docks compatibility-repair rung.
  Docks `0.12.5` remains the satisfied producer prerequisite.
- Do not change the predecessor Goal, guarantee tiers, technical data shapes,
  frozen negative cases, 38 criteria, or 82-event contract. This is a lifecycle
  continuation, not a product rescope.
- Do not release Effect Kit unless its own plugin payload changes; shared
  marketplace metadata alone is not an Effect Kit release.
- Do not implement `relay-worker-fanout`; it remains blocked until the immutable
  Session Relay release proves `packaged_ready` in its own later handoff.
- Do not modify either archived plan from a worker branch. They are read-only
  provenance/specification inputs.
- Do not force-push, reset, rebase away, or delete the preserved implementation
  branch. Integration must retain its commit ancestry.

## Known gotchas

- The preserved branch is 23 commits ahead of its merge base while current main
  is 121 commits ahead; integrate in a fresh continuation worktree and resolve
  deliberately. Do not write in the old shared worktree.
- Cargo from repository root fails because the toolchain pin is below
  `plugins/session-relay/rust/`.
- Claude CLI currently reports `loggedIn:false`. Record the X leg as
  `unavailable_auth`; one fresh passed S leg is sufficient under the released
  policy and the owner's standing cross-company consent.
- Historical live RunGate receipts are not rerun. Pending live gates require the
  exact owner-provisioned runner and delegated cgroup described by the frozen
  spec; copied receipt bytes do not authorize them.
- Source-ready is not packaged-ready. The release/tag/binary/install checks occur
  only after passed completion review and are independently reproduced.

## Global constraints

- Workers implement and commit only on their assigned worktree; they never push,
  tag, publish a release, or write plan lifecycle fields.
- Main-context plan-manager is the only plan/receipt/status writer and independently
  verifies every worker claim against current tool output.
- Run narrow checks first and the required full `node scripts/ci.mjs` once at
  each final pre-commit boundary; any later relevant edit invalidates that run.
- Releases, tags, and pushes are authorized by the owner for this four-stage
  goal, but destructive Git remains forbidden without a new explicit approval.
- Any discovery that a required primitive is unbuildable as specified is a HARD
  STOP for the owner; do not substitute a weaker guarantee.

## STOP conditions

- The archived spec hash/blob differs from the two frozen identities.
- `codex/primitives-collab@22b754a` is missing, dirty, rewritten, or cannot be
  integrated without changing the product Goal/deliverable.
- A completed-prefix invariant or immutable acceptance/event record regresses.
- A worker needs to modify a plan, archived spec, Docks policy, Effect Kit, or
  fanout implementation to complete a Session Relay row.
- The exact Linux authoritative path is unbuildable, or the required live runner
  cannot supply its specified primitive; report rather than weakening/faking it.
- Any release preflight cannot bind exact reviewed commit, manifests, tag,
  remote, workflow run, binaries, checksums, and installed payload.

## Cold-handoff checklist

- [x] File manifest: frontmatter enumerates every remaining production/test/doc
  surface; exact per-row ownership lives in the frozen predecessor.
- [x] Environment & commands: roots, branches, versions, Cargo cwd, validation
  order, CI, and release commands are explicit.
- [x] Interface & data contracts: the predecessor is hash-frozen and the closed
  continuation overlay plus `ContinuationScopeV1` shape is exact.
- [x] Executable acceptance: A101–A138 are the exact ordered criterion-specific
  completion commands; each binds its predecessor row, continuation identity,
  occurrences, summary, and both evidence objects.
- [x] Out of scope: Docks repair, Effect Kit, fanout, plan writes, destructive
  Git, and product rescope are excluded.
- [x] Decision rationale: a normal successor preserves implementation and avoids
  a disproportionate one-plan Docks exception.
- [x] Known gotchas: branch divergence, Cargo cwd, review degradation, live
  RunGates, and source/package separation are explicit.
- [x] Global constraints: writer ownership, verification, CI, release authority,
  and HARD STOP conditions are explicit.
- [x] No undefined terms/forward refs: every predecessor term resolves through
  the hash-frozen spec; every new continuation term is defined here.

Adversarial cold-read result: a fresh executor reads this file, verifies the
frozen predecessor, creates a continuation worktree from the recorded execution
base, retains `22b754a` ancestry, and resumes at Step 1b without reconstructing
Friday's conversation or invoking the superseded Docks detour.

## Self-review

Author score: **96/100** — standalone 21/22, actionability 16/16, dependency
12/12, evidence 10/10, goal coverage 12/12, executable acceptance 12/12,
failure mode 9/10, assumption-to-question 4/6. The sole source-conflict allowance
is now exact and has already been reproduced with `git merge-tree`; the
continuation verifier and binding fixture remain planned Step-1/5 work and are
explicit acceptance obligations rather than assumed helpers.

The plan intentionally does not reprint or re-review thousands of settled
technical lines. Independent review must verify the hash-bound continuation
model, completed-prefix claims, branch-preserving integration, and whether the
38 rows strictly prove the predecessor inventory. A reviewer finding an actual current
correctness defect remains actionable; stylistic expansion of the archived spec
is not a reason to reopen it.

**Bounded formal review repair (2026-07-14T09:58:20-03:00):** the sealed
successor draft received one fresh S verdict of NOT READY with three high
findings; X was honestly recorded `unavailable_auth`. Direct reproduction
accepted all three. The repair adds a closed dual-identity
`ContinuationBindingV1` with exact imported prefix/range/authority cardinality
and substitution negatives, restores all 38 criterion-specific completion rows
with one-to-one frozen inventory/evidence binding, and fixes integration order
to an exact `B P` two-parent merge followed by source integration and evidence
import before `in_review`. It does not reopen the archived technical design,
alter the Goal/deliverable, add a Docks release, or change the preserved source
checkpoint. One fresh bounded review checks only those three corrections; a
style-driven request to expand the archived specification is rejected.

## Mistakes & Dead Ends

- **2026-07-14T09:34:54-03:00**: Continued expanding a Docks compatibility
  repair for two stale Session Relay status sentences → the detour reached about
  3,000 lines and delayed all product implementation → archive it unexecuted and
  establish a current-lifecycle successor around the preserved source branch.

## Sources

- `docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md:117-132`
  — unchanged product Goal and why the three primitives unblock fanout.
- `docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md:2429-2449`
  — exact completed/pending row status, dependency order, files, and done/STOP
  conditions carried by this continuation.
- `docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md:2454-2497`
  — canonical 38-row completion inventory A101–A138.
- `docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md:355-370`
  — exact 82-event schedule and execution/completion separation.
- `git:codex/primitives-collab@22b754adcd5756f084fd61f55436971a6b9d407f`
  — clean preserved implementation checkpoint with 23 commits beyond its merge
  base and no worktree delta at scaffold time.

## Review

(filled by plan-review on completion)
