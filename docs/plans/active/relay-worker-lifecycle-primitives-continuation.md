---
title: Continue relay worker lifecycle primitives from current main
goal: Finish the existing Session Relay lifecycle deliverable from its verified implementation checkpoint under a normal current-lifecycle execution base.
status: ongoing
created: "2026-07-14T09:34:54-03:00"
updated: "2026-07-14T12:51:38-03:00"
started_at: "2026-07-14T10:19:03-03:00"
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
  - plugins/session-relay/test/fixtures/lifecycle-restart-recovery-binding.json
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
execution_base_commit: 18b023ec461c2374eb73cf293d8223a23e36d044
---

# Continue relay worker lifecycle primitives from current main

## Goal

Finish the predecessor's unchanged Session Relay deliverable: Linux-authoritative
managed admission, stable-handle process control, worker quiescence, durable
lifecycle authority across released `0.10.0` writers, typed Darwin
unavailability, and an exact source-ready handoff that remains
`packaged_ready=false` until the later Session Relay release.

This continuation preserves that product Goal while adding one owner-authorized,
bounded proof-provenance repair for three historical schema-v2 custodians lost
when their host session ended. It does not claim that those custodians or their
private signing keys survived. Their bytes and receipt chains become closed
historical evidence; product migration is instead re-proved from fresh,
distinct schema-v2 generations carrying exact payload copies into the unchanged
schema-v3 design. No product guarantee, remaining implementation row, 38-row
completion inventory, or 82-event schedule is removed.

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

Execution reached the committed continuation checkpoint
`K1=0960048120b1d92c59b360463bcdcfee77bd998e`, whose parent merge
`M=876ca391abd2b4b8e088287a981f316d2c1bb2ce` has ordered parents
`B=d192843020d9a3a626733188f5c472dcb1e11bc9` and
`P=22b754adcd5756f084fd61f55436971a6b9d407f`. `K1` committed and
negative-tested `ContinuationBindingV1`; no later source commit exists.

At Step 1b the exact three legacy challenge attempts returned
`ECONNREFUSED`. Their mode-0600 authority records and root snapshots still
match the pinned bytes, but all bind absent custodian PID `245`; the Ed25519
private keys existed only in that process. Recreating those keys, relabeling the
old authority records, or calling the old roots live would be false. On
2026-07-14 the owner selected bounded recovery: retain the historical bytes,
state the lost liveness explicitly, create distinct live proof generations, and
continue without weakening the product migration test.

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
- Continuation worker checkout: `/tmp/docks-primitives-continuation`, branch
  `codex/primitives-continuation`, clean at `K1=0960048` before this recovery.
- Main remains clean at the pre-recovery base `B=d192843`. Review and commit the
  recovery plan on main, then merge `K1` into its receipt-bearing base exactly
  as specified below. Do not resume the retired `codex/primitives-collab`
  worktree.
- Node.js: 24.x, matching repository CI.
- Rust commands must run from `plugins/session-relay/rust/`, where
  `rust-toolchain.toml` pins Rust 1.85.0. Never run Cargo from repository root.
- Verification is targeted-first. Plan-only and receipt-only commits run only
  plan/frontmatter/hash/diff checks. Intermediate source commits run the exact
  changed target plus affected Rust/Node gates; expand only when dependency or
  risk warrants it. `cargo fmt --check`, clippy, relay selftest, and the single
  full `node scripts/ci.mjs` run at Step 6's final integration boundary, not
  after tiny edits. A later relevant edit invalidates only the affected narrow
  result; it does not trigger unrelated full CI.
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
| Integration overlay | All paths come from the preserved parent except `plugins/session-relay/skills/productivity/session-relay/SKILL.md`, which remains byte-equal to continuation-base blob `24715dd59942d057ce21a7dd4faeb008a7ce5134` / SHA-256 `5ccb180e3e63a0b5c238e6d72283000c2163577953ab416d06c32a00f9499e27`. The old parent blob `cf73743c31949c90a7fa456a8e28396803be5eef` is forbidden because it removes the current canonical plan-policy boundary and fails repository CI. |
| Historical authority loss | The three schema-v2 roots, authority records, pins, snapshots, and receipt-chain heads remain hash-authoritative but not live-authoritative after custodian PID `245` disappeared. Historical liveness and signature continuity are permanently `false`; no later receipt may reverse either value. |
| Recovery boundary | `RestartRecoveryBindingV1` closes the loss observation and authorizes one test-harness-only static copy from each exact old payload into a distinct fresh schema-v2 root. Old sentinels, authority records, identities, signatures, and socket names are never copied, rewritten, or accepted as current authority. |
| Live migration proof | Each fresh root gets a new sentinel, Ed25519 authority, process generation, socket, pin, and initial signed challenge. The unchanged native migration then consumes those three live generations and creates two schema-v3 successors. After the migration parent exits, a new verifier process must reconstruct from coordinator hashes and re-challenge both successors before A109 or later work can pass. |
| Completion inventory | Exactly 38 criterion-specific rows A101–A138 below, in that order. Each row binds its frozen predecessor command/expected hashes, all scheduled event occurrences, its ordered summary, and both final evidence records. |
| Completion proof | `ContinuationScopeV1 {schema:1,spec_path,spec_git_blob,spec_raw_sha256,predecessor_planned_at_commit,predecessor_execution_base_commit,continuation_plan,continuation_planned_at_commit,continuation_start_commit,continuation_execution_base_commit,execution_base_record_commit,continuation_integration_base_commit,continuation_binding_sha256,restart_recovery_binding_sha256,integration_overlay_sha256,preserved_implementation_commit,implementation_merge,implementation_merge_parents,recovery_merge,recovery_merge_parents,recovery_checkpoint_commit,implementation_tip,implementation_tree,implementation_scope_tree_sha256,reviewed_head,acceptance_inventory_sha256,schedule_sha256,event_count,event_chain_head,step_range_chain_head,runner_attempt_chain_head,legacy_loss_observation_sha256,recovery_generation_receipts_sha256,root_migration_snapshot_sha256,criteria_summaries,criteria_sha256,final_execution_evidence_sha256,lifecycle_completion_evidence_sha256,source_ready:true,packaged_ready:false,fanout_unblock:false,receipt_sha256}`. |

Before the first post-start source edit, Step 1 creates and commits exactly one
`plugins/session-relay/test/fixtures/lifecycle-continuation-binding.json` as
compact RFC-8785 JCS:

```text
ContinuationBindingV1 {
  schema:1,
  spec:{path,git_blob,raw_sha256,planned_at_commit,execution_base_commit},
  continuation:{plan_path,planned_at_commit,reviewed_commit,
    reviewed_plan_blob,start_commit,start_plan_blob,execution_base_commit,
    execution_base_record_commit,integration_base_commit,
    integration_base_plan_blob},
  preserved_implementation:{commit,tree},
  integration_overlay:{retained_path,base_blob,base_sha256,
    forbidden_preserved_blob,overlay_sha256},
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
plan/blob/base/commit/event/range/authority/chain/overlay identity in turn and
requires every case to fail before later work begins.

`ContinuationBindingV1` at `K1` is immutable and keeps its original
`legacy_authorities` rows as historical identities. Before any production
migration edit, Step 1 adds
`plugins/session-relay/test/fixtures/lifecycle-restart-recovery-binding.json`
as compact RFC-8785 JCS with this closed shape:

```text
RestartRecoveryBindingV1 {
  schema:1,
  owner_decision:{kind:"bounded_snapshot_recovery",selected_at,
    continuation_plan_blob,decision_sha256},
  prior:{continuation_binding_path,continuation_binding_blob,
    continuation_binding_raw_sha256,continuation_binding_sha256,
    checkpoint_commit,checkpoint_tree},
  recovery_history:{pre_repair_base,recovery_plan_commit,
    recovery_plan_blob,recovery_receipt_commit,recovery_receipt_plan_blob,
    recovery_merge,recovery_merge_parents,recovery_checkpoint_commit},
  loss_observation:{observed_at,custodian_pid:245,process_present:false,
    authorities:[{kind,root,authority_path,pin,source_sha256,socket_id,
      authority_file_sha256,root_snapshot_sha256,receipt_chain_head,
      challenge_exit:1,challenge_error:"ECONNREFUSED"}],
    observation_sha256},
  recovery_intents:[{kind,ordinal,closed_authority_pin,
    closed_snapshot_sha256,payload_manifest_sha256,
    generation_intent_sha256}],
  guarantees:{historical_authority_liveness:false,
    historical_signature_continuity:false,historical_byte_continuity:true,
    fresh_live_migration_proof_required:true,
    label:"snapshot_recovery_after_custodian_loss"},
  acceptance_inventory_sha256,schedule_sha256,binding_sha256
}
```

The authority array is closed and ordered
`step_range,runner_canonical,runner_equivalent`. The fixture records authority
file hashes `8c51234cf6663d665cfa6f0301261e996a99f0fc9e959a5ab5eff01d71a11eb6`,
`f74ee17a16bd17bafa48bcfcb43a618b80b9320bded120e7f3d6329c488e3256`,
and `a5b285ab91c044858ce1afda318a582802ad680ebba753ea3deffb97f9837e9d`
in that order, plus the already bound snapshot and chain hashes. Its negative
matrix drops, reorders, duplicates, or substitutes every plan/merge/checkpoint,
authority, loss, snapshot, chain, intent, and guarantee field; setting either
historical liveness or signature continuity to `true` must fail.

The test helper's recovery reader is available only when the exact fixture,
fixture hash, reviewed recovery plan blob, and three closed tuples match. It
opens the old roots and authority files read-only, performs no socket operation,
and copies only a byte-sorted payload manifest into three newly created roots.
For each it emits `RecoveryGenerationReceiptV1 {schema:1,
restart_recovery_binding_sha256,kind,ordinal,closed_authority_pin,
closed_snapshot_sha256,fresh_root_identity_sha256,fresh_sentinel_sha256,
fresh_authority_sha256,fresh_authority_record_sha256,fresh_source_sha256,
fresh_custodian_pid,fresh_custodian_start_ticks,fresh_socket_id,
payload_manifest_sha256,payload_equivalent:true,generation_intent_sha256,
initial_challenge_receipt_sha256,receipt_sha256}`. Any source write, copied
identity byte, manifest difference, dead fresh custodian, or missing fresh
signed challenge fails before native migration starts.

The three recovery generations replace only the dead schema-v2 inputs to the
frozen `--migration-apply` bootstrap. All schema-v3 objects, transition
semantics, negative matrices, runner layout, A109 command, A101–A138 completion
commands, and the 82-event order remain unchanged. The migration ledger binds
the three recovery receipts and the recovery binding. After `Active`, the
migration parent must exit; a separately started verifier reconstructs solely
from migration id, anchor, ledger, and active-phase hashes, challenges both
schema-v3 custodians, and exact-compares their payload manifests. This is a
real post-parent restart check, not a claim that the dead historical custodians
restarted.

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
| 1 | Preserve completed merge `M` and binding checkpoint `K1`. From the recovery receipt base `B2`, create exact recovery merge `M2` with ordered parents `B2 K1`, taking this plan from `B2` and every non-plan byte from `K1`. Before any production migration edit, commit and negative-test `RestartRecoveryBindingV1` as checkpoint `K2`. Use its read-only static source gate to create three distinct fresh live schema-v2 generations, migrate those through the frozen schema-v3 design, prove both successor authorities from a new verifier after the migration parent exits, then finish predecessor Step 1b. | Frozen predecessor Step 1b paths; `wip-snapshot.mjs`; both binding fixtures; this plan and both archived plans read-only in the worker | — | planned | `M`, `K1`, `M2`, and `K2` identities/trees are exact and no history is rewritten. Both bindings pass their closed negative matrices. The old authorities remain explicitly dead historical evidence; three fresh recovery receipts prove byte-equivalent payloads plus distinct live authorities, and the native migration ledger binds them. Post-parent restart validation challenges both schema-v3 custodians. Rows 1/P/2/3a/3b remain exact; A109 runs before frozen A107/A108/A106 and the superseding Step-1b receipt. Any old-liveness claim, old-root write, copied identity byte, source edit before `K2`, failing binding negative, or completed-prefix regression is STOP. |
| 2 | Complete predecessor Steps 3c and 3d in order with their exact durable-store, cancellation, admission-inventory, mixed-version, and range-receipt contracts. | Frozen predecessor Step 3c/3d paths | 1 | planned | Every frozen Step 3c/3d done condition and A113/A116/A117/A127/A128/A106 occurrence passes; no old writer can erase/reopen lifecycle authority and every pre-controller mutation path has an executed unique behavior test. |
| 3 | Execute the owner-provisioned 1c/1d live feasibility sequences and, only on their valid retained receipt, implement predecessor Step 4. | Frozen predecessor Step 1c/1d/4 paths | 2 | planned | A110 then A111 prove the exact retained-fd/TRACEEXEC/cgroup path; A118/A119/A120 and Step-4 A106 pass. Missing or invalid runner/delegation blocks this row; an unbuildable primitive is a HARD STOP to the owner, never a fallback. |
| 4 | Implement predecessor Steps 5, 6, and 7 in dependency order. | Frozen predecessor Step 5/6/7 paths | 3 | planned | Managed first-prompt control, stable runtime, bounded quiescence, proof construction, reconcile/release/abandon, terminalization, and all named Rust/Node/golden/inventory gates pass without weakening a frozen negative. |
| 5 | Run predecessor Step 8's repeatable completeness audit and Step 9's documentation, Darwin, build-matrix, final-scope, cleanup, and source-ready handoff. Add the read-only continuation verifiers above. | Frozen predecessor Step 8/9 paths plus `plugins/session-relay/test/final-scope.mjs` | 4 | planned | Exact 38-criterion/82-event evidence closes; A137 challenges the five fresh live generations, A138 cleans those generations through the frozen journal, and the already closed dead roots are never counted as live. `FinalExecutionEvidenceV1` binds both continuation bindings, recovery receipts, restart proof, and continuation execution identities before integration. |
| 6 | With `main` still exactly at recovery receipt base `B2`, fast-forward it to the clean continuation worker tip, prove embedded merges `M` and `M2` plus both binding checkpoints, project and import one `LifecycleCompletionEvidenceV1`, run A101–A138 and the single full repository CI, then enter `in_review`; after passed completion review, archive the plan. Session Relay release is the separate post-ship producer workflow. | This plan and completion-evidence handoff only; all implementation paths read-only after fast-forward | 5 | planned | Integration occurs before evidence import and `in_review`; the imported record binds the original overlay, restart-recovery binding, recovery receipts, restart proof, both final evidence hashes, all 38 summaries, 82-event/chain/root/runner identities, exact integration commit/tree, and `source_ready=true`, `packaged_ready=false`, `fanout_unblock=false`. A101–A138 pass in order in the disposable checkout, the one final `node scripts/ci.mjs` exits 0, completion review passes, and the plan archives before the independently verified release flow begins. |

### Exact integration order

The immutable historical chain is
`E=18b023ec461c2374eb73cf293d8223a23e36d044` →
`R=fd89ad0a53dd236378f9e516323e20756891d687` →
`Q0=dc68c713474f9cfac24c6260bac5d416be94663d` → reviewed `Q` →
receipt base `B=d192843020d9a3a626733188f5c472dcb1e11bc9`. Preserved
implementation `P=22b754adcd5756f084fd61f55436971a6b9d407f` was integrated by
`M=876ca391abd2b4b8e088287a981f316d2c1bb2ce` with exact parents `B P`;
`K1=0960048120b1d92c59b360463bcdcfee77bd998e` is its direct binding
checkpoint. Those commits and `ContinuationBindingV1` are immutable.

Main-context plan-manager creates one consolidated recovery candidate `C` as a
direct plan-only child of `B`, seals and reviews `C` once with lifecycle intent
`none`, then creates receipt-only `B2` as `C`'s direct child. `B2` may differ
from `C` only in this plan's `updated`, `Cross-check`, replacement
`Review-receipt`, and receipt attribution in `Self-review`; it retains
`status: ongoing`, `started_at`, and `execution_base_commit: E`. Receipt-only
changes reuse the sealed review and do not trigger another review or full CI.

The worker then creates one `--no-ff --no-commit` recovery merge `M2` with exact
ordered parents `B2 K1`. This plan path must equal `B2`; every other path must
equal `K1`. No archive, skill, source, workflow, or fixture exception is
permitted. The resulting tree is exact before commit. Its direct child `K2`
may modify only `lifecycle-restart-recovery-binding.json` and the narrow binding
validator in `wip-snapshot.mjs`; it must commit the closed fixture and pass its
negative matrix before production migration code changes. Every later worker
commit descends from `K2` and cannot modify a plan path.

After Step 5 produces clean final tip `T`, `main` must still equal `B2`.
Plan-manager fast-forwards main to `T`, verifies both `M` and `M2` remain in
ancestry with exact ordered parents/trees, verifies `K1`/`K2` and both bindings,
and records `T` as the integrated source commit. Only then may it project/import
`LifecycleCompletionEvidenceV1` as a plan-only commit and enter `in_review`.
Squash, cherry-pick, rebase, patch replay, another source merge, evidence import
before source integration, and completion review against the pre-integration
head are forbidden.

## Acceptance criteria

The separately recorded project CI command is `node scripts/ci.mjs`; completion
runs it once after this exact ordered inventory rather than duplicating it as a
row. Each command is read-only and validates both binding fixtures, the explicit
false historical-liveness guarantees, the fresh recovery-generation and
post-parent restart receipts, its own frozen predecessor command/expected
hashes, all scheduled occurrences, its ordered criterion summary, and the exact
`FinalExecutionEvidenceV1` plus `LifecycleCompletionEvidenceV1` hashes embedded
before `in_review`. Dynamic hash placeholders mean lowercase 64-hex.

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
  frozen negative cases, 38 criteria, or 82-event contract outside the explicit
  dead-schema-v2 input substitution defined by `RestartRecoveryBindingV1`.
- Do not release Effect Kit unless its own plugin payload changes; shared
  marketplace metadata alone is not an Effect Kit release.
- Do not implement `relay-worker-fanout`; it remains blocked until the immutable
  Session Relay release proves `packaged_ready` in its own later handoff.
- Do not modify either archived plan from a worker branch. They are read-only
  provenance/specification inputs.
- Do not force-push, reset, rebase away, or delete the preserved implementation
  branch. Integration must retain its commit ancestry.

## Known gotchas

- `M` and `K1` already integrate the 23 preserved commits. Recovery builds from
  them through `B2 K1`; do not replay the original integration or write in the
  old shared worktree.
- Cargo from repository root fails because the toolchain pin is below
  `plugins/session-relay/rust/`.
- Determine each cross-company leg's availability from its live preflight. A
  CLI authentication failure affects only that CLI attempt; never pre-record an
  unavailable result for another transport or a later review.
- Historical live RunGate receipts are not rerun. Pending live gates require the
  exact owner-provisioned runner and delegated cgroup described by the frozen
  spec; copied receipt bytes do not authorize them.
- The dead schema-v2 roots are read-only source snapshots, not current
  authorities. Only distinct fresh generations may enter the migration ledger;
  copied payload equivalence never implies signature or process continuity.
- Source-ready is not packaged-ready. The release/tag/binary/install checks occur
  only after passed completion review and are independently reproduced.

## Global constraints

- Workers implement and commit only on their assigned worktree; they never push,
  tag, publish a release, or write plan lifecycle fields.
- Main-context plan-manager is the only plan/receipt/status writer and independently
  verifies every worker claim against current tool output.
- Use targeted checks for plan-only, receipt-only, fixture, and intermediate
  source commits. Run full `node scripts/ci.mjs` once at Step 6 after the final
  integrated source tip is stable; rerun it only if a later relevant source or
  policy edit invalidates that final result.
- Releases, tags, and pushes are authorized by the owner for this four-stage
  goal, but destructive Git remains forbidden without a new explicit approval.
- Any discovery that a required primitive is unbuildable as specified is a HARD
  STOP for the owner; do not substitute a weaker guarantee.

## STOP conditions

- The archived spec hash/blob differs from the two frozen identities.
- `codex/primitives-collab@22b754a` is missing, dirty, rewritten, or cannot be
  integrated without changing the product Goal/deliverable.
- A completed-prefix invariant or immutable acceptance/event record regresses.
- Any code or receipt claims the three historical custodians remain live,
  preserves their signatures, or treats copied payloads as authority continuity.
- `M2` is not exactly `B2 K1`, production migration code changes before `K2`, or
  either binding/negative matrix fails.
- A recovery source byte differs from its closed manifest, a fresh schema-v2
  authority cannot be challenged, or either schema-v3 successor fails the
  post-parent restart challenge.
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
- [x] Interface & data contracts: the predecessor is hash-frozen; both bindings,
  the bounded dead-authority substitution, and `ContinuationScopeV1` are exact.
- [x] Executable acceptance: A101–A138 are the exact ordered criterion-specific
  completion commands; each binds its predecessor row, continuation identity,
  occurrences, summary, and both evidence objects.
- [x] Out of scope: Docks repair, Effect Kit, fanout, plan writes, destructive
  Git, and product rescope are excluded.
- [x] Decision rationale: a normal successor preserves implementation and avoids
  a disproportionate one-plan Docks exception.
- [x] Known gotchas: recovery ancestry, Cargo cwd, review degradation, dead
  historical authorities, live RunGates, and source/package separation are explicit.
- [x] Global constraints: writer ownership, verification, CI, release authority,
  and HARD STOP conditions are explicit.
- [x] No undefined terms/forward refs: every predecessor term resolves through
  the hash-frozen spec; every new continuation term is defined here.

Cold-read result: a fresh executor verifies the frozen predecessor plus `M/K1`,
creates `M2/K2` from the reviewed recovery base, records the dead authority loss
without a false continuity claim, proves migration on distinct live generations,
and resumes Step 1b without reconstructing prior conversation.

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

**Runtime-gate repair (2026-07-14T10:46:00-03:00):** the first exact merge
projection reached repository CI before any merge commit and proved that the
preserved parent predates the current Session Relay skill's plan-policy boundary.
The correction retains that one current blob, projects every other implementation
and workflow byte from the preserved parent, and binds the overlay plus the fresh
review candidate `Q` and receipt-bearing integration base `B`. It changes no
product Goal, primitive, acceptance row, event, or remaining implementation step.
One fresh review is limited to this reproduced one-path overlay and the closed
`E/R/Q0/Q/B/P` identity chain; after its receipt, implementation resumes without
a further design-review cycle.

The first corrected X leg was READY 94 and raised only two low wording findings.
Direct reproduction accepted both: the stale CLI-authentication gotcha is now
transport- and attempt-scoped, and `before dispatch` now names the Step-1 worker.
Neither changes the overlay, identity chain, Goal, acceptance, or implementation;
the final check is limited to those accepted wording corrections.

**Final bounded review (2026-07-14T11:24:08-03:00):** S returned READY 100
with no findings; X returned READY 95 with one low suggestion. The orchestrator
reproduced X1 against the sealed plan and rejected it because criterion mode is
already required to perform the same closed `ContinuationBindingV1` validation,
whose `spec` object binds the exact path, Git blob, and raw SHA-256. The sealed
bundle reverified byte-for-byte. Outcome is dual and pre-execution eligible;
review ends here and Step 1 resumes from the receipt-bearing base.

**Bounded custodian-loss recovery (2026-07-14T12:51:38-03:00):** exact live
challenges against all three historical schema-v2 records failed with
`ECONNREFUSED`; PID `245` is absent while record/root bytes remain hash-exact.
The owner selected bounded recovery. This candidate preserves `M/K1` and the
original binding, permanently marks old liveness and signature continuity
false, and adds one closed static-payload-to-fresh-authority bridge before the
unchanged native schema-v3 migration. It also replaces per-commit full CI with
targeted intermediate checks and one final integration CI. One sealed X/S
review evaluates this consolidated recovery only. If it is ready, the receipt
commit reuses that review; unchanged bytes are not reviewed again.

## Mistakes & Dead Ends

- **2026-07-14T09:34:54-03:00**: Continued expanding a Docks compatibility
  repair for two stale Session Relay status sentences → the detour reached about
  3,000 lines and delayed all product implementation → archive it unexecuted and
  establish a current-lifecycle successor around the preserved source branch.
- **2026-07-14T10:46:00-03:00**: Required the preserved parent's entire Session
  Relay tree byte-for-byte → repository CI caught that this would roll back the
  current plan-policy boundary in one skill file → commit no source, retain that
  exact current blob as the sole overlay, and rebind the worker to the resulting
  receipt-bearing integration base.
- **2026-07-14T12:51:38-03:00**: Relied on process-held schema-v2 private keys
  surviving a host-session restart → all three authority records and roots
  remained but their shared custodian PID disappeared → record the loss as
  closed evidence, prove behavior on distinct fresh live generations, and never
  make execution depend on uncommitted process-only historical authority again.

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
- `git:codex/primitives-continuation@0960048120b1d92c59b360463bcdcfee77bd998e`
  — clean committed continuation binding checkpoint; its parent merge is
  `876ca391abd2b4b8e088287a981f316d2c1bb2ce` with exact parents `B P`.

## Review

Recovery-candidate review is pending. The receipt below applies only to the
pre-recovery `B` plan bytes and is superseded for execution by this substantive
change; `B2` must replace it with the one fresh sealed recovery review.

Cross-check (2026-07-14): [X: anthropic fable high; result=passed] 1 low finding — accepted none / rejected X1 (criterion mode already binds the frozen spec identity through ContinuationBindingV1); [S: openai gpt-5.6-sol xhigh; result=passed] 0 findings — accepted none / rejected none; [orchestrator: openai codex gpt-5.6-sol xhigh] reproduced X1 against the sealed plan, reverified the bundle, and rejected duplicate enforcement.

Review-receipt: {"S":{"raw":{"attempts":[{"child_id":"relay_final_readiness","denial_source":null,"effort":"xhigh","exit_code":0,"model":"gpt-5.6-sol","output_started":true,"reason":"completed","result":"passed","retry_cause":null,"schema":1,"signal":null,"started":true,"stderr_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","stdout_sha256":"31e49e076d6f17343e13b11bcbeab5ea03fdf02bfcd7990d3e0fd7f6d28df09e","timeout_mode":"orchestrator_tool","timeout_seconds":600,"transport":"in_session"}],"decision_evidence":null,"findings":[],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","leg":"S","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"200c9f30183402f09c2546936ac31c73493be150d9e42e34f63b4ba557f90b33","diff_sha256":null,"execution_base_commit":null,"input_sha256":"4869e8ffb586ef1ef2a6be9b1229e7fcf1a4f699f07c844b8821f67965f2b64d","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"max","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"skill_default","cross_company_consent":"current_user","openai_tiers":"skill_default","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"3c95e5e16578dbf7b675ed6324de50e5cd749744239d2b2bea45603cf766bee1","request_id":"124a176b-c233-4814-997f-4395fe9d8171","reviewed_commit_or_head":"25a5a2e4c567f94236f3636c01e4abbf68cefe72","schema":1},"result":"passed","reviewer_output":{"confirmations":["The CLI-authentication gotcha now derives availability from each live preflight and limits an authentication failure to that CLI attempt, explicitly excluding other transports and later reviews.","The integration-order instruction explicitly says the plan-manager records the identities and blobs before dispatching the Step-1 worker.","Q0 is exactly dc68c713474f9cfac24c6260bac5d416be94663d; Q is its direct plan-only child applying only the two accepted wording fixes; B is Q's direct receipt-bearing child.","The overlay remains closed to one retained path with its exact base blob, SHA-256, and forbidden preserved blob; every other source-scope path must equal P, the merge parents must be ordered B P, and any deviation is STOP."],"score":100,"structured_output_sha256":"31e49e076d6f17343e13b11bcbeab5ea03fdf02bfcd7990d3e0fd7f6d28df09e","verdict":"ready"},"schema":1,"selected":{"effort":"xhigh","model":"gpt-5.6-sol","transport":"in_session"},"severity_totals":{"high":0,"low":0,"medium":0},"waiver":null,"waiver_sha256":null},"reconciliation":{"accepted":[],"rejected":[]},"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"200c9f30183402f09c2546936ac31c73493be150d9e42e34f63b4ba557f90b33","diff_sha256":null,"execution_base_commit":null,"input_sha256":"4869e8ffb586ef1ef2a6be9b1229e7fcf1a4f699f07c844b8821f67965f2b64d","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"max","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"skill_default","cross_company_consent":"current_user","openai_tiers":"skill_default","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"3c95e5e16578dbf7b675ed6324de50e5cd749744239d2b2bea45603cf766bee1","request_id":"124a176b-c233-4814-997f-4395fe9d8171","reviewed_commit_or_head":"25a5a2e4c567f94236f3636c01e4abbf68cefe72","schema":1}},"X":{"raw":{"attempts":[{"child_id":"a3e74a08-8bd3-41e0-9bdc-eb5129b7f192","denial_source":null,"effort":"high","exit_code":0,"model":"fable","output_started":true,"reason":"completed","result":"passed","retry_cause":null,"schema":1,"signal":null,"started":true,"stderr_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","stdout_sha256":"633a979496f3b352ceac3be376bc83cbfa8436597d86fe59c4132aac4a3e4959","timeout_mode":"orchestrator_tool","timeout_seconds":600,"transport":"cli"}],"decision_evidence":null,"findings":[{"defect":"The per-criterion completion commands (`--verify-continuation-criterion`) omit the explicit `--spec-git-blob`/`--spec-raw-sha256` argv pins that the documented full `--verify-continuation` mode carries, and the plan does not state where criterion mode sources the frozen spec identity (plan Context prose vs the in-tree ContinuationBindingV1 fixture), leaving the \"performs the same closed validation\" claim under-specified for the Step-5 implementer.","evidence":"plan.review.md lines 141-146 show the full-mode invocation with `--spec-git-blob bc8621a6131363849c2cc79ab95899dcb1302138 --spec-raw-sha256 5cb993acd7532b736d62123b1b11be4b1d672c6e0b252ed00501d16c0bd8dfda`; every A101-A138 row passes only `--spec`, `--plan`, `--criterion`, and `--reviewed-head` with no spec-identity pins.","fix":"State in `## Interfaces & data shapes` that `--verify-continuation-criterion` binds the frozen spec blob/raw-SHA-256 from the hash-pinned identities recorded in the plan's Context section (or add the two pin flags to every A101-A138 command), so both modes derive the spec identity from the same closed source.","id":"X1","locator":"lines 140-146 vs A101-A138 rows (lines 221-258)","path":"plan.review.md","section":"Acceptance criteria","severity":"low"}],"findings_sha256":"c0d3e5fd18f5b8f8713ba726167fa01333ce40a0925b936292b7a6854aad9fae","leg":"X","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"200c9f30183402f09c2546936ac31c73493be150d9e42e34f63b4ba557f90b33","diff_sha256":null,"execution_base_commit":null,"input_sha256":"4869e8ffb586ef1ef2a6be9b1229e7fcf1a4f699f07c844b8821f67965f2b64d","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"max","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"skill_default","cross_company_consent":"current_user","openai_tiers":"skill_default","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"3c95e5e16578dbf7b675ed6324de50e5cd749744239d2b2bea45603cf766bee1","request_id":"124a176b-c233-4814-997f-4395fe9d8171","reviewed_commit_or_head":"25a5a2e4c567f94236f3636c01e4abbf68cefe72","schema":1},"result":"passed","reviewer_output":{"confirmations":["Manifest input_sha256 4869e8ffb586ef1ef2a6be9b1229e7fcf1a4f699f07c844b8821f67965f2b64d and reviewed_commit 25a5a2e4c567f94236f3636c01e4abbf68cefe72 match the sealed request envelope; plan frontmatter author (openai/codex/gpt-5.6-sol/xhigh) matches request.author, so this leg is correctly cross-company X.","Both previously accepted low wording corrections are applied: the Known-gotchas CLI-authentication note is transport- and attempt-scoped ('A CLI authentication failure affects only that CLI attempt; never pre-record an unavailable result for another transport or a later review'), and the integration-order recording clause now reads 'before dispatching the Step-1 worker'.","The bundled plugins/session-relay/skills/productivity/session-relay/SKILL.md carries manifest SHA-256 5ccb180e3e63a0b5c238e6d72283000c2163577953ab416d06c32a00f9499e27, byte-identical to the retained-overlay SHA-256 pinned in the plan's Integration-overlay row, corroborating the single retained-path overlay claim.","Occurrence counts across A101-A138 (1,1,1,10,2,11,2,2,2,1,1,2,2,2,2,2,2,2,1,1,1,2,2,2,1,2,3,4,2,2,3,2,1,1,1,1,1,1) sum to exactly 82, matching the claimed 82-event evidence contract, and the project CI command `node scripts/ci.mjs` is recorded separately rather than duplicated as an inventory row, per current evidence-order policy.","The E/R/Q0/Q/B/P identity chain is internally consistent: E=18b023ec execution base, R=fd89ad0a its record commit, Q0=dc68c713 sole child of R, Q the reviewed wording-fix child (this draft request, lifecycle_intent none), B the future receipt-bearing integration base; Steps 1-6, the exact `B P` merge-parent requirement, main==B until fast-forward, and integration-before-evidence-import-before-in_review are mutually consistent.","Step-scope consistency holds: affected_paths cover both source scopes (plugins/session-relay/ and .github/workflows/build-binaries.yml), the stale predecessor active-plan path is the only permitted unmerged path and is excluded from affected_paths, and the Self-review component scores (21+16+12+10+12+12+9+4) sum to the stated 96.","Sandbox note: shell execution was unavailable in this reviewer sandbox (EROFS on session-env), so file hashes were cross-checked via the sealed manifest's recorded SHA-256 values rather than independently recomputed; the collector's bundle re-hash remains the byte authority."],"score":95,"structured_output_sha256":"633a979496f3b352ceac3be376bc83cbfa8436597d86fe59c4132aac4a3e4959","verdict":"ready"},"schema":1,"selected":{"effort":"high","model":"fable","transport":"cli"},"severity_totals":{"high":0,"low":1,"medium":0},"waiver":null,"waiver_sha256":null},"reconciliation":{"accepted":[],"rejected":[{"id":"X1","reason":"Rejected after read reproduction: criterion mode is already required to perform the same closed validation, including the ContinuationBindingV1 spec path, blob, and raw hash; extra flags would duplicate rather than strengthen the contract."}]},"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"200c9f30183402f09c2546936ac31c73493be150d9e42e34f63b4ba557f90b33","diff_sha256":null,"execution_base_commit":null,"input_sha256":"4869e8ffb586ef1ef2a6be9b1229e7fcf1a4f699f07c844b8821f67965f2b64d","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"max","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"skill_default","cross_company_consent":"current_user","openai_tiers":"skill_default","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"3c95e5e16578dbf7b675ed6324de50e5cd749744239d2b2bea45603cf766bee1","request_id":"124a176b-c233-4814-997f-4395fe9d8171","reviewed_commit_or_head":"25a5a2e4c567f94236f3636c01e4abbf68cefe72","schema":1}},"author":{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"},"decision_evidence":null,"input_sha256":"4869e8ffb586ef1ef2a6be9b1229e7fcf1a4f699f07c844b8821f67965f2b64d","outcome":"dual","phase":"draft","policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"max","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"skill_default","cross_company_consent":"current_user","openai_tiers":"skill_default","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"3c95e5e16578dbf7b675ed6324de50e5cd749744239d2b2bea45603cf766bee1","pre_execution_eligible":true,"reproduced":[{"defect":"The per-criterion completion commands (`--verify-continuation-criterion`) omit the explicit `--spec-git-blob`/`--spec-raw-sha256` argv pins that the documented full `--verify-continuation` mode carries, and the plan does not state where criterion mode sources the frozen spec identity (plan Context prose vs the in-tree ContinuationBindingV1 fixture), leaving the \"performs the same closed validation\" claim under-specified for the Step-5 implementer.","fix":"State in `## Interfaces & data shapes` that `--verify-continuation-criterion` binds the frozen spec blob/raw-SHA-256 from the hash-pinned identities recorded in the plan's Context section (or add the two pin flags to every A101-A138 command), so both modes derive the spec identity from the same closed source.","id":"X1","locator":"lines 140-146 vs A101-A138 rows (lines 221-258)","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"4869e8ffb586ef1ef2a6be9b1229e7fcf1a4f699f07c844b8821f67965f2b64d","exit_code":null,"method":"read"},"severity":"low","source":"X"}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"200c9f30183402f09c2546936ac31c73493be150d9e42e34f63b4ba557f90b33","diff_sha256":null,"execution_base_commit":null,"input_sha256":"4869e8ffb586ef1ef2a6be9b1229e7fcf1a4f699f07c844b8821f67965f2b64d","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"max","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"skill_default","cross_company_consent":"current_user","openai_tiers":"skill_default","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"3c95e5e16578dbf7b675ed6324de50e5cd749744239d2b2bea45603cf766bee1","request_id":"124a176b-c233-4814-997f-4395fe9d8171","reviewed_commit_or_head":"25a5a2e4c567f94236f3636c01e4abbf68cefe72","schema":1},"reviewed_at":"2026-07-14T11:24:08-03:00","reviewed_commit":"25a5a2e4c567f94236f3636c01e4abbf68cefe72","schema":1}

(Completion-review evidence is filled by plan-review after implementation.)
