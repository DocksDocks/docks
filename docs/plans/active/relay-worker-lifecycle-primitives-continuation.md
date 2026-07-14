---
title: Continue relay worker lifecycle primitives from current main
goal: Finish the existing Session Relay lifecycle deliverable from its verified implementation checkpoint under a normal current-lifecycle execution base.
status: planned
created: "2026-07-14T09:34:54-03:00"
updated: "2026-07-14T09:34:54-03:00"
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
| Lifecycle identity | This plan's reviewed planned commit, first-start commit, and recorded `execution_base_commit`; predecessor E/R/B/Q/F is provenance only. |
| Existing source history | `codex/primitives-collab@22b754a`, integrated after this plan starts without rewriting or force-updating that branch. |
| Completion proof | `ContinuationScopeV1 {schema:1,spec_path,spec_git_blob,spec_raw_sha256,continuation_plan,execution_base_commit,reviewed_head,implementation_merge,criteria_count:38,event_count:82,source_ready:true,packaged_ready:false,fanout_unblock:false,receipt_sha256}`. |

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

It validates the closed overlay, parses and proves all predecessor criteria and
events against final evidence, proves the preserved implementation commit is an
ancestor of the reviewed source tip through one non-destructive integration,
and emits exactly one compact `ContinuationScopeV1` line. It writes nothing and
does not contact a runtime, network, cache, or live receipt root during
completion review.

## Steps

| # | Task | Files | Depends | Status | Done condition / STOP trigger |
|---|---|---|---|---|---|
| 1 | Establish a fresh worker branch from this plan's execution base, non-destructively integrate `codex/primitives-collab@22b754a`, exclude every predecessor/continuation plan-path mutation from the worker result, independently reverify the completed prefix, and finish predecessor Step 1b. | Frozen predecessor Step 1b paths; this plan and both archived plans read-only | — | planned | The preserved commit is an ancestor of the clean continuation worker tip; no commit is lost or rewritten; rows 1/P/2/3a/3b remain exact; Step 1b's frozen A103/A109/A107/A108/A106 gates pass and its exact step receipt is committed. Any unresolvable semantic source conflict or completed-prefix regression is STOP. |
| 2 | Complete predecessor Steps 3c and 3d in order with their exact durable-store, cancellation, admission-inventory, mixed-version, and range-receipt contracts. | Frozen predecessor Step 3c/3d paths | 1 | planned | Every frozen Step 3c/3d done condition and A113/A116/A117/A127/A128/A106 occurrence passes; no old writer can erase/reopen lifecycle authority and every pre-controller mutation path has an executed unique behavior test. |
| 3 | Execute the owner-provisioned 1c/1d live feasibility sequences and, only on their valid retained receipt, implement predecessor Step 4. | Frozen predecessor Step 1c/1d/4 paths | 2 | planned | A110 then A111 prove the exact retained-fd/TRACEEXEC/cgroup path; A118/A119/A120 and Step-4 A106 pass. Missing or invalid runner/delegation blocks this row; an unbuildable primitive is a HARD STOP to the owner, never a fallback. |
| 4 | Implement predecessor Steps 5, 6, and 7 in dependency order. | Frozen predecessor Step 5/6/7 paths | 3 | planned | Managed first-prompt control, stable runtime, bounded quiescence, proof construction, reconcile/release/abandon, terminalization, and all named Rust/Node/golden/inventory gates pass without weakening a frozen negative. |
| 5 | Run predecessor Step 8's repeatable completeness audit and Step 9's documentation, Darwin, build-matrix, final-scope, cleanup, and source-ready handoff. Add the read-only continuation verifier above. | Frozen predecessor Step 8/9 paths plus `plugins/session-relay/test/final-scope.mjs` | 4 | planned | Exact 38-criterion/82-event evidence closes; every live authority/root is cleaned only through the frozen A138 protocol; `ContinuationScopeV1` passes with `source_ready=true`, `packaged_ready=false`, and `fanout_unblock=false`. |
| 6 | Independently verify the integrated source and ordered acceptance inventory, run full repository CI once at the final boundary, complete-review and archive this plan, then merge/push/release Session Relay under the standing authorization and verify remote/install state. | This plan; all implementation paths read-only during verification; Session Relay manifests/catalog/release artifacts only during release | 5 | planned | A1–A6 pass in order in a disposable checkout, full `node scripts/ci.mjs` exits 0, completion review passes, the plan archives, `main` and origin contain the reviewed source, the new Session Relay tag/release and tag CI are green, and installed payload hashes/manifests equal the immutable release. |

## Acceptance criteria

The separately recorded project CI command is `node scripts/ci.mjs`; completion
runs it once after this ordered inventory rather than duplicating it as a row.

| ID | Command | Expected |
|---|---|---|
| A1 | `node --input-type=module -e 'import fs from "node:fs";import crypto from "node:crypto";import{execFileSync}from"node:child_process";const p="docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md",b=fs.readFileSync(p),s=b.toString("utf8"),sha=crypto.createHash("sha256").update(b).digest("hex"),blob=execFileSync("git",["hash-object",p],{encoding:"utf8"}).trim(),start=s.indexOf("\n## Acceptance criteria\n"),end=s.indexOf("\n## Execution gate catalogue\n",start+1),table=s.slice(start,end),ids=[...table.matchAll(/^\| (A1(?:0[1-9]|[12][0-9]|3[0-8])) \|/gm)].map(x=>x[1]);if(start<0||end<0||sha!=="5cb993acd7532b736d62123b1b11be4b1d672c6e0b252ed00501d16c0bd8dfda"||blob!=="bc8621a6131363849c2cc79ab95899dcb1302138"||ids.length!==38||new Set(ids).size!==38)process.exit(1);console.log("FROZEN_SPEC PASS criteria=38")'` | Exit 0; stdout exactly `FROZEN_SPEC PASS criteria=38`. |
| A2 | `node plugins/session-relay/test/final-scope.mjs --verify-continuation --spec docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-legacy.md --spec-git-blob bc8621a6131363849c2cc79ab95899dcb1302138 --spec-raw-sha256 5cb993acd7532b736d62123b1b11be4b1d672c6e0b252ed00501d16c0bd8dfda --plan docs/plans/active/relay-worker-lifecycle-primitives-continuation.md --reviewed-head "$(git rev-parse HEAD)"` | Exit 0; one compact `ContinuationScopeV1` line proves 38 criteria, 82 events, the implementation integration, `source_ready:true`, `packaged_ready:false`, and `fanout_unblock:false`. |
| A3 | `(cd plugins/session-relay/rust && cargo fmt --check && cargo clippy --locked --all-targets -- -D warnings)` | Exit 0 with no formatting diff or warning. |
| A4 | `(cd plugins/session-relay/rust && cargo test --locked)` | Exit 0; every unit and integration target passes under the pinned Rust 1.85.0 toolchain. |
| A5 | `node plugins/session-relay/test/selftest.mjs` | Exit 0 with every Session Relay black-box assertion passing. |
| A6 | `BASE="$(node --input-type=module -e 'import fs from "node:fs";import{parsePlan}from"./plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs";const x=parsePlan(fs.readFileSync("docs/plans/active/relay-worker-lifecycle-primitives-continuation.md")).frontmatter.execution_base_commit;if(!/^[0-9a-f]{40}$/.test(x))process.exit(1);process.stdout.write(x)')" && git diff --check "$BASE"..HEAD` | Exit 0; the complete current execution range has no whitespace error. |

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
- [x] Executable acceptance: A1–A6 are ordered commands with exact outcomes;
  A2 proves all 38 predecessor criteria and 82 events rather than duplicating
  them in this plan.
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

Author score: **94/100** — standalone 20/22, actionability 16/16, dependency
12/12, evidence 10/10, goal coverage 12/12, executable acceptance 11/12,
failure mode 9/10, assumption-to-question 4/6. Deductions: the integration may
surface source conflicts that cannot be predicted before the current execution
base exists; A2 is a planned verifier mode and must be implemented before
completion. Both are explicit Step/STOP conditions rather than hidden guesses.

The plan intentionally does not reprint or re-review thousands of settled
technical lines. Independent review must verify the hash-bound continuation
model, completed-prefix claims, branch-preserving integration, and whether A2
strictly proves the predecessor inventory. A reviewer finding an actual current
correctness defect remains actionable; stylistic expansion of the archived spec
is not a reason to reopen it.

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
