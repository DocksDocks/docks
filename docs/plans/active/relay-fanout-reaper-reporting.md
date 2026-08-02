---
title: Make the fanout reaper report why a worktree survived
goal: Return and emit a typed reason when fan-out GC protects a worktree, cannot remove it, refuses a flat legacy reservation, or cannot open the worktrees surface.
status: blocked
created: "2026-08-01T23:17:11-03:00"
updated: "2026-08-02T19:07:32.556+00:00"
started_at: "2026-08-02T17:55:37.690+00:00"
finished_at: null
assignee: null
tags: [plans, session-relay, fanout, gc, observability, registered-idea]
affected_paths:
  - plugins/session-relay/AGENTS.md
  - plugins/session-relay/rust/src/fanout.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/tests/fanout_reap.rs
  - plugins/session-relay/test/fixtures/rust-test-inventory.json
related_plans: []
---

# Make the fanout reaper report why a worktree survived

## Goal

Fan-out GC returns a typed reason for every protective or failed-removal retention covered by this plan, for a refused flat legacy reservation, and for an unavailable worktrees surface; the store boundary emits that same discriminant as a structured stderr diagnostic.

## Context & rationale

`FanoutGcReport` currently contains only `removed_worktrees` and `retained_branches`, and `FanoutGcOutcome` distinguishes only skipped, retained, and removed dispositions (`plugins/session-relay/rust/src/fanout.rs:49-59`). Repository-identity and worktree-snapshot changes both become an unreasoned retained branch (`plugins/session-relay/rust/src/fanout.rs:389-405`). The commit/cleanliness guard also becomes `Retained(branch)` (`plugins/session-relay/rust/src/fanout.rs:479-490`), and a failed `remove_unstarted_worktree` call becomes the same value (`plugins/session-relay/rust/src/fanout.rs:507-513`). The final fold records only branch names and a removal count (`plugins/session-relay/rust/src/fanout.rs:520-529`), so the caller cannot distinguish protection from failure.

At the store boundary, an absent `worktrees` GC surface is replaced with `FanoutGcReport::default()`, which is an empty successful report, and stderr renders only branch names (`plugins/session-relay/rust/src/store.rs:1313-1324`). That is the reproducible silent-success path this plan removes.

Current reservations are created below a repository key (`plugins/session-relay/rust/src/fanout.rs:556-564`), while `worktree_path_components` explicitly accepts the legacy one-component shape through the current three-component maximum (`plugins/session-relay/rust/src/fanout.rs:112-125`, `plugins/session-relay/rust/src/fanout.rs:152-159`). The existing integration fixture proves that a flat record is presently reaped (`plugins/session-relay/rust/tests/fanout_reap.rs:355-391`). This plan changes that policy at the reaper boundary: a flat record is retained with the explicit `legacy_shape` reason, without widening or rewriting the containment parser.

The reaper also acquires the managed-repository refusal gate before mutation (`plugins/session-relay/rust/src/fanout.rs:453-459`); the gate itself is `RepositoryGate::refuse_legacy_if_managed` (`plugins/session-relay/rust/src/workspace/repository_gate.rs:450-475`). This plan does not change that authority boundary.

Historical note, not relied on: a cleared observation associated six surviving worktrees with flat records. The evidence is no longer available, so no causal claim or historical census is an input to this plan. The flat-shape decision is instead proven by a deterministic fixture built from current code.

## Environment & how-to-run

Run commands from the repository root. Node dependencies are pinned by `package.json`; the Rust crate pins toolchain `1.85.0` in `plugins/session-relay/rust/rust-toolchain.toml`. Install prerequisites when needed with:

```bash
corepack pnpm install --frozen-lockfile
rustup toolchain install 1.85.0 --profile minimal --component rustfmt --component clippy
```

Use `cargo +1.85.0 --manifest-path plugins/session-relay/rust/Cargo.toml ...` for focused Rust checks. The authoritative repository gate for this plugin is `node scripts/ci.mjs --plugin session-relay`.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Replace unreasoned retained outcomes with a typed `FanoutGcReason` carried by report entries. Define stable labels for `legacy_shape`, `repository_identity_changed`, `worktree_changed`, `uncollected_commits`, `commit_inspection_failed`, `worktree_not_clean`, `removal_failed`, and `worktrees_surface_unavailable`; map each current retained arm without changing removal eligibility. | `plugins/session-relay/rust/src/fanout.rs` | — | `local` | `planned` | Report data distinguishes protective retention, failed inspection, and failed removal by enum variant and stable label. STOP if a retained outcome can reach the report without a reason, or if introducing the report changes which keyed worktrees are removed. |
| 2 | Refuse a one-component legacy reservation at the reaper policy boundary before Git inspection or removal. Preserve its worktree and branch and report `legacy_shape`; keep the existing 1..=3 containment parser unchanged because rollback and validation still need to resolve persisted paths. | `plugins/session-relay/rust/src/fanout.rs`, `plugins/session-relay/rust/tests/fanout_reap.rs`, `plugins/session-relay/test/fixtures/rust-test-inventory.json` | 1 | `local` | `planned` | Rename the existing flat fixture to `legacy_flat_worktree_is_refused_and_reported`; it constructs a flat record deterministically, proves the worktree and branch remain, and observes `legacy_shape`. Regenerate the exact Rust test inventory. STOP if the record path is rewritten, the branch is deleted, or `worktree_path_components` is widened. |
| 3 | Replace the missing-surface default with a report entry carrying `worktrees_surface_unavailable`, and render report reasons at the store boundary as stable structured stderr records whose `reason` field comes only from `FanoutGcReason`. Preserve the existing removed-count return and branch-retention message. | `plugins/session-relay/rust/src/fanout.rs`, `plugins/session-relay/rust/src/store.rs` | 1 | `local` | `planned` | An absent worktrees surface produces a non-empty reason report, and the stderr writer renders the report discriminant without re-inferring a cause. STOP if the `None` arm remains an empty default or if rendering has an independent reason switch. |
| 4 | Add non-vacuous reason tests at their owning boundaries: create a `#[cfg(test)] mod tests` at the end of `fanout.rs` containing `retention_report_keeps_reason_discriminants` and `removal_failure_has_distinct_report_reason`; extend the existing `store.rs` test module with `fanout_diagnostics_render_report_reasons` and `missing_worktrees_surface_reports_unavailable`; update the existing `fanout_reap.rs` flat-shape integration test from step 2. | `plugins/session-relay/rust/src/fanout.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/rust/tests/fanout_reap.rs`, `plugins/session-relay/test/fixtures/rust-test-inventory.json` | 2, 3 | `local` | `planned` | The fanout unit tests fail if protective retention and removal failure collapse; the store unit tests assert report data and exact structured stderr bytes; the integration test fails if a flat reservation is removed, rewritten, or diagnosed without `legacy_shape`. STOP if a test only compares source text or still passes after its production mapping is collapsed. |
| 5 | Document every stable reason label and its operator action in the plugin Store hygiene and Worktree fan-out contracts, including that flat legacy reservations are refused rather than migrated. | `plugins/session-relay/AGENTS.md` | 4 | `local` | `planned` | The contract maps each reason from step 1 to an inspection or recovery action and states that `legacy_shape` preserves the worktree and branch. STOP if documentation promises migration or path rewriting. |
| 6 | Run the focused tests, exact test-inventory check, and authoritative plugin gate. | `plugins/session-relay/AGENTS.md`, `plugins/session-relay/rust/src/fanout.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/rust/tests/fanout_reap.rs`, `plugins/session-relay/test/fixtures/rust-test-inventory.json` | 5 | `local` | `planned` | Every Acceptance criteria command exits 0 with the stated observation. On failure, keep the plan `ongoing`, preserve all worktrees and branches, and repair only the failing owned path; STOP on any retention-safety regression. |
| 7 | Archive the finished plan through the plan-manager transaction. | `docs/plans/finished/<finish-date>-relay-fanout-reaper-reporting.md` | 6 | `local` | `planned` | The plan is `finished` at the named archive path, where `<finish-date>` is the UTC date on which the archive transaction runs, and the archive checkpoint contains only owned implementation paths plus the finished plan. On transaction or checkpoint mismatch, leave the plan `ongoing` and STOP. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --lib fanout::tests::retention_report_keeps_reason_discriminants -- --exact` | Exit 0; exactly one named unit test passes and its report entries retain distinct typed reason variants. |
| A2 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --lib fanout::tests::removal_failure_has_distinct_report_reason -- --exact` | Exit 0; exactly one named unit test passes and the failed-removal arm reports `removal_failed`, not a protective reason. |
| A3 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --lib store::tests::fanout_diagnostics_render_report_reasons -- --exact` | Exit 0; exactly one named unit test passes and exact structured stderr bytes contain the discriminant-derived `reason` field for every report reason. |
| A4 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --lib store::tests::missing_worktrees_surface_reports_unavailable -- --exact` | Exit 0; exactly one named unit test passes and the absent-surface path returns and renders `worktrees_surface_unavailable` rather than an empty default report. |
| A5 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --test fanout_reap legacy_flat_worktree_is_refused_and_reported -- --exact` | Exit 0; exactly one named integration test passes, the flat worktree and branch still exist, and stderr contains `legacy_shape`. |
| A6 | `node plugins/session-relay/test/rust-test-inventory.mjs` | Exit 0 with `PASS rust_test_inventory`; the committed fixture exactly matches the renamed integration-test inventory. |
| A7 | `node scripts/ci.mjs --plugin session-relay` | Exit 0 and prints `All ci.mjs checks passed — plugin 'session-relay'; safe to release.` after the plugin checks complete. |

## Out of scope / do-NOT-touch

- Do not relax retention for uncollected commits, failed inspection, or a non-clean worktree.
- Do not delete fan-out branch refs; the current reaper explicitly preserves them (`plugins/session-relay/rust/src/fanout.rs:389-390`).
- Do not migrate or rewrite flat persisted paths. There is no authority or path-rewrite mechanism for transferring their custody safely during GC.
- Do not widen `worktree_path_components`; keyed two- and three-component paths remain the current accepted removal shapes, while the reaper refuses the legacy one-component shape.
- Do not change the one-day fan-out cutoff, six-hour throttle, repository gate, managed-workspace authority, or collection protocol.
- Do not modify files outside `affected_paths`, except for the lifecycle-owned archive move in the final step.

## STOP conditions

1. Any implementation step requires an effect other than `local`.
2. A test or diff shows that a worktree with uncollected commits, a failed inspection, a non-clean tree, or a flat legacy path can be removed.
3. A flat record's persisted path is rewritten, its worktree is moved, or its branch is deleted.
4. A reason is represented as an untyped free-form string in report data, or stderr chooses a cause independently of the report discriminant.
5. The unavailable-worktrees-surface path can still return an empty successful report.
6. A reason arm lacks a deterministic test that fails when mapped to another reason.
7. The exact Rust inventory or `node scripts/ci.mjs --plugin session-relay` fails after an owned-path repair.

## Open questions

1. **D1 — Decided:** The cleared observation of six flat historical survivors is not causal evidence and the plan does not rely on it. A deterministic flat-record fixture establishes the chosen behavior from current code.
2. **D2 — Decided:** The reason is a typed discriminant in the returned report and is rendered at the store boundary as a structured stderr diagnostic. The discriminant is the single source of truth; report data and emitted bytes each have tests.
3. **D3 — Decided:** Flat legacy reservations are refused with `legacy_shape`, preserving their worktree and branch. They are not migrated because no authority or safe path-rewrite mechanism exists during GC, and `worktree_path_components` is not widened.

## Review

N/A — no review has been dispatched for this run.

Plan-run: {"acceptance":{"source_sha256":"dc9d7b86bf1d884aaff21340a7baf93383447938c73980f9ad9df749cf5e3d73","verification_sha256":"84d69e4184e2e72de2783bfee3763943bcd636d2085c8417f36eb19a4f2c81c6"},"blocker":{"evidence_sha256":"e06194a5985ee080fc607a603488d13b88ae811aac6bc7c3698ddc453efa1752","kind":"review_failed"},"completion_review":{"input_sha256":"36175bcaad63f6ddd7b92e120b3fcf731c7056d8a823c401dd9a1661a77493eb","invocations":1,"result_sha256":"e06194a5985ee080fc607a603488d13b88ae811aac6bc7c3698ddc453efa1752","state":"blocked"},"draft_review":{"input_sha256":"56bcbb2cf1acf2b2437c0181f45fa6656aec25aa00654b20f452508c6892c449","invocations":1,"result_sha256":"f598651f8a166226414c83ece2c84b549169df942a6e2bd64ea96e1898d25d8c","state":"passed"},"execution_parent":"428ca586723eafa326c4dca495940f7a2bbe2ad9","goal_id":"b3a2ec1d-440c-45b2-ad81-6e0f8a270abd","implementation_commit":"1a7e68f8dc16d0193881bb27e10689c4710f1c23","plan_path":"docs/plans/active/relay-fanout-reaper-reporting.md","plan_sha256":"076d022a2856147d1be2e1c128d6d955a5e546be84126c0d1547b9521b596593","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"8e656e8b-8a20-4acc-9460-3a7dabc5c447","schema":1,"source_base":"702383f504757336ebe6c3859db70384e82a814f","source_sha256":"309f51fbad84174a850cf673817f5c3af4d3be07640bbb095b4a5271f11a8646"}


Completion review invocation 1:

Completion-review-result: {"diff_sha256":"e6e1a9e899544d5705655a981f694efb6b5892cfcc8c205c1bf953b72fb33d58","findings":[{"defect":"Acceptance A6 is not executable as specified. Running its exact command, `node plugins/session-relay/test/rust-test-inventory.mjs`, exits 1 with `usage: node rust-test-inventory.mjs --case <name>` because the unchanged inventory checker requires a named case. The corrected focused invocation with `--case fanout_reap` passes, but that is not the sealed acceptance command.","fix":"Correct A6 to invoke `node plugins/session-relay/test/rust-test-inventory.mjs --case fanout_reap`, rebind the canonical plan, and rerun completion review so every exact acceptance command is satisfiable.","id":"A6-inventory-command","kind":"missing_acceptance","locator":".git/docks-review/completion-relay-fanout-reaper-reporting-1/plan.md:70; plugins/session-relay/test/rust-test-inventory.mjs:111-114"}],"implementation_commit":"1a7e68f8dc16d0193881bb27e10689c4710f1c23","invocation":1,"run_id":"8e656e8b-8a20-4acc-9460-3a7dabc5c447","schema":1,"verdict":"repair"}

## Verification Results

### Implementation (2026-08-02)

Implementation commit `1a7e68f`, based on `execution_parent` `428ca586723eafa326c4dca495940f7a2bbe2ad9`.
The checkpoint is shared with `lifecycle-dispatch-integrity`, whose file set is disjoint; the
reviewed diff for this run is bounded to this plan's `affected_paths`.

**Step 1 — typed outcome reason.** `FanoutGcOutcome::Retained` and `FanoutGcDecision::Retained` now
require a `FanoutGcReason`, with eight stable labels: `legacy_shape`,
`repository_identity_changed`, `worktree_changed`, `uncollected_commits`,
`commit_inspection_failed`, `worktree_not_clean`, `removal_failed`, and
`worktrees_surface_unavailable`. Commit inspection, cleanliness, revalidation and removal now map to
distinct arms. Keyed-worktree removal eligibility is unchanged.

**Step 2 — unavailable surface.** A missing worktrees surface returned
`FanoutGcReport::default()`, an empty success report indistinguishable from "nothing to do". It now
returns `FanoutGcReport::worktrees_surface_unavailable()`.

**Step 3 — reasons tested.** Four named unit tests plus integration coverage. Non-vacuity was
demonstrated, not asserted: collapsing `RemovalFailed` into `WorktreeNotClean` made
`fanout::tests::removal_failure_has_distinct_report_reason` fail, and restoring the arm made it pass.

**Step 4 — legacy shape refused, not migrated.** A validated one-component path is recognised and
reported as `legacy_shape` before any repository or Git inspection. The record is not mutated, the
tree is not moved or deleted, and the branch is not deleted. `worktree_path_components` stays
`1..=3`. Migration was rejected because no authority or path-rewrite mechanism exists for those
records and rewriting persisted paths during a GC sweep could move custody unsafely.

**Step 5 — documented.** All eight labels and their operator actions are documented in
`plugins/session-relay/AGENTS.md` under Store hygiene, with the keyed/flat policy and the
refusal-without-migration contract under Worktree fan-out.

**Reason rendering.** One discriminant, two renderings: the typed reason travels in the report and
the store boundary emits `{"event":"fanout_gc",...,"reason":"<label>"}` on stderr, reading only
`entry.reason.label()`. Both the report data and the exact stderr bytes are tested. This matters
because the sweep runs from an unattended hook, where the returned report has no reader.

### Acceptance

| ID | Result |
|---|---|
| A1 | `fanout::tests::retention_report_keeps_reason_discriminants` — 1 passed |
| A2 | `fanout::tests::removal_failure_has_distinct_report_reason` — 1 passed |
| A3 | `store::tests::fanout_diagnostics_render_report_reasons` — 1 passed, exact bytes for all eight reasons |
| A4 | `store::tests::missing_worktrees_surface_reports_unavailable` — 1 passed |
| A5 | flat-reservation integration test passes and asserts the directory, branch and persisted path all survive |
| A6 | see the deviation below |
| A7 | `node scripts/ci.mjs` exits 0 across all three plugins and repo-wide |

**A6 deviation, recorded rather than silently substituted.** The row's command as written,
`node plugins/session-relay/test/rust-test-inventory.mjs`, cannot run: the script requires
`--case <name>`. That script is outside this plan's `affected_paths`, and the acceptance table is
inside `plan_sha256` with both draft permits spent, so the row could not be amended without a full
plan replacement — disproportionate for a missing argument. The substituted commands were
`node plugins/session-relay/test/rust-test-inventory.mjs --generate` and
`node plugins/session-relay/test/rust-test-inventory.mjs --case fanout_reap`, which report 10/10
`fanout_reap` tests. The check performed is the one the row intended.

The full serial crate suite passes, and `cargo fmt` was applied before the final gate.
