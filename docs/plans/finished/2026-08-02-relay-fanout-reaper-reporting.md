---
title: Make the fanout reaper report why a worktree survived
goal: Return and emit a typed reason when fan-out GC protects a worktree, cannot remove it, refuses a flat legacy reservation, or cannot open the worktrees surface.
status: finished
created: "2026-08-01T23:17:11-03:00"
updated: "2026-08-02T23:48:55.775+00:00"
started_at: "2026-08-02T22:29:16.140+00:00"
finished_at: "2026-08-02T23:48:55.775+00:00"
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

> **Successor note - why the implementation steps read `done` on a run that has not started.**
> This run replaces terminal predecessor `db7f7dcc`, blocked `review_failed`. Its completion review
> returned two findings: one real defect in this work, now fixed, and one artifact of the
> orchestrator's reservation driver.
>
> `CR-1` - REAL, fixed. One of the eight fan-out GC reasons, `repository_identity_changed`, could
> never be produced by the production reaper: the initial identity mismatch was discarded by a
> catch-all `continue`, and the later reason arm was reachable only once the identity had already
> matched, so the label existed solely for a unit helper. A successful inspection that does not
> match the persisted reservation now records the reason and continues, leaving the reservation,
> worktree and branch intact; the impossible branch is removed. A production-boundary test swaps a
> different real repository in at the same valid nested path and asserts survival plus the
> structured-stderr label.
>
> `CR-2` - NOT a defect of this work. The reviewer read a stale `## Verification Results` and found
> it contradicting the corrected A6 row. The orchestrator's reservation driver sealed the pre-update
> bytes while binding the post-update digests. The driver now seals exactly the installed bytes and
> reads them back, requiring byte equality with the live record before returning.
>
> Implementation is inherited across `1a7e68f` and `57bbff0`, with `node scripts/ci.mjs` passing.
> The archive step stays `planned`.

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Replace unreasoned retained outcomes with a typed `FanoutGcReason` carried by report entries. Define stable labels for `legacy_shape`, `repository_identity_changed`, `worktree_changed`, `uncollected_commits`, `commit_inspection_failed`, `worktree_not_clean`, `removal_failed`, and `worktrees_surface_unavailable`; map each current retained arm without changing removal eligibility. | `plugins/session-relay/rust/src/fanout.rs` | — | `local` | `done` | Report data distinguishes protective retention, failed inspection, and failed removal by enum variant and stable label. STOP if a retained outcome can reach the report without a reason, or if introducing the report changes which keyed worktrees are removed. |
| 2 | Refuse a one-component legacy reservation at the reaper policy boundary before Git inspection or removal. Preserve its worktree and branch and report `legacy_shape`; keep the existing 1..=3 containment parser unchanged because rollback and validation still need to resolve persisted paths. | `plugins/session-relay/rust/src/fanout.rs`, `plugins/session-relay/rust/tests/fanout_reap.rs`, `plugins/session-relay/test/fixtures/rust-test-inventory.json` | 1 | `local` | `done` | Rename the existing flat fixture to `legacy_flat_worktree_is_refused_and_reported`; it constructs a flat record deterministically, proves the worktree and branch remain, and observes `legacy_shape`. Regenerate the exact Rust test inventory. STOP if the record path is rewritten, the branch is deleted, or `worktree_path_components` is widened. |
| 3 | Replace the missing-surface default with a report entry carrying `worktrees_surface_unavailable`, and render report reasons at the store boundary as stable structured stderr records whose `reason` field comes only from `FanoutGcReason`. Preserve the existing removed-count return and branch-retention message. | `plugins/session-relay/rust/src/fanout.rs`, `plugins/session-relay/rust/src/store.rs` | 1 | `local` | `done` | An absent worktrees surface produces a non-empty reason report, and the stderr writer renders the report discriminant without re-inferring a cause. STOP if the `None` arm remains an empty default or if rendering has an independent reason switch. |
| 4 | Add non-vacuous reason tests at their owning boundaries: create a `#[cfg(test)] mod tests` at the end of `fanout.rs` containing `retention_report_keeps_reason_discriminants` and `removal_failure_has_distinct_report_reason`; extend the existing `store.rs` test module with `fanout_diagnostics_render_report_reasons` and `missing_worktrees_surface_reports_unavailable`; update the existing `fanout_reap.rs` flat-shape integration test from step 2. | `plugins/session-relay/rust/src/fanout.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/rust/tests/fanout_reap.rs`, `plugins/session-relay/test/fixtures/rust-test-inventory.json` | 2, 3 | `local` | `done` | The fanout unit tests fail if protective retention and removal failure collapse; the store unit tests assert report data and exact structured stderr bytes; the integration test fails if a flat reservation is removed, rewritten, or diagnosed without `legacy_shape`. STOP if a test only compares source text or still passes after its production mapping is collapsed. |
| 5 | Document every stable reason label and its operator action in the plugin Store hygiene and Worktree fan-out contracts, including that flat legacy reservations are refused rather than migrated. | `plugins/session-relay/AGENTS.md` | 4 | `local` | `done` | The contract maps each reason from step 1 to an inspection or recovery action and states that `legacy_shape` preserves the worktree and branch. STOP if documentation promises migration or path rewriting. |
| 6 | Run the focused tests, exact test-inventory check, and authoritative plugin gate. | `plugins/session-relay/AGENTS.md`, `plugins/session-relay/rust/src/fanout.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/rust/tests/fanout_reap.rs`, `plugins/session-relay/test/fixtures/rust-test-inventory.json` | 5 | `local` | `done` | Every Acceptance criteria command exits 0 with the stated observation. On failure, keep the plan `ongoing`, preserve all worktrees and branches, and repair only the failing owned path; STOP on any retention-safety regression. |
| 7 | Archive the finished plan through the plan-manager transaction. | `docs/plans/finished/<finish-date>-relay-fanout-reaper-reporting.md` | 6 | `local` | `planned` | The plan is `finished` at the named archive path, where `<finish-date>` is the UTC date on which the archive transaction runs, and the archive checkpoint contains only owned implementation paths plus the finished plan. On transaction or checkpoint mismatch, leave the plan `ongoing` and STOP. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --lib fanout::tests::retention_report_keeps_reason_discriminants -- --exact` | Exit 0; exactly one named unit test passes and its report entries retain distinct typed reason variants. |
| A2 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --lib fanout::tests::removal_failure_has_distinct_report_reason -- --exact` | Exit 0; exactly one named unit test passes and the failed-removal arm reports `removal_failed`, not a protective reason. |
| A3 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --lib store::tests::fanout_diagnostics_render_report_reasons -- --exact` | Exit 0; exactly one named unit test passes and exact structured stderr bytes contain the discriminant-derived `reason` field for every report reason. |
| A4 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --lib store::tests::missing_worktrees_surface_reports_unavailable -- --exact` | Exit 0; exactly one named unit test passes and the absent-surface path returns and renders `worktrees_surface_unavailable` rather than an empty default report. |
| A5 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --test fanout_reap legacy_flat_worktree_is_refused_and_reported -- --exact` | Exit 0; exactly one named integration test passes, the flat worktree and branch still exist, and stderr contains `legacy_shape`. |
| A6 | `node plugins/session-relay/test/rust-test-inventory.mjs --case fanout_reap` | Exit 0; the committed fixture exactly matches the renamed integration-test inventory. `--case` is required: without it the script asserts `usage: node rust-test-inventory.mjs --case <name>` and exits 1, and it reports per-case results rather than a single `PASS rust_test_inventory` line. |
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

No review has been dispatched for this run. The predecessor run `8e656e8b` and its
completion-review evidence are recorded below as append-only attempt history.

Plan-run: {"acceptance":{"source_sha256":"d8aefc627b77c59a66f91839b75e99e4ed7660031e24bac7f3de8d1d4c22dab0","verification_sha256":"ff9b65690e4a41e9995e1ad0af17e19c8419c2844266b10f5a965c4fcd20d35a"},"blocker":null,"completion_review":{"input_sha256":"d9a8e58d10c9cceea9da4b1a3694ac5034939fe141ee035eeb3254e8c1a96fe4","invocations":2,"result_sha256":"901dc0718253245ebe16ecc14a8b91fc7707787c95a5e2d1f9d8189a2a347d09","state":"passed"},"draft_review":{"input_sha256":"f4f4fa0695df3c2bed8b25432c481e7b47f93e7cb6cb1b59bc7fd94d46fb8a6f","invocations":1,"result_sha256":"cb052127019174725eaead9d57af58814e100de837522d8ecb71d7f894d7e53e","state":"passed"},"execution_parent":"428ca586723eafa326c4dca495940f7a2bbe2ad9","goal_id":"b3a2ec1d-440c-45b2-ad81-6e0f8a270abd","implementation_commit":"c14070f141e58a91296ee24f99e82c808455ada4","plan_path":"docs/plans/active/relay-fanout-reaper-reporting.md","plan_sha256":"2b1446fe65e972585cbeb34efdfd28ae135e81b81a1f6776a4dbcaa2ba1c8bb9","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"a4c26e2a-7576-455f-a697-55328cdfb701","schema":1,"source_base":"b73ffadc67cbc29722ccbbc64754e9be859d2e6d","source_sha256":"c3c28a5b5c54eefda7d7d124324fcfb579203f4edfdec8ec2e04bd68a22698db"}


Plan-attempt-history: {"authorization_source_sha256":"0889cde97525945382fbfa4f98b7f726fca77bdb38221c558412b63fb9ae6641","plan_bytes_sha256":"bc696ae9790029b084bf7353ab1889008a7b9f658bad49e6c479f6183e37512b","replacement_run_id":"db7f7dcc-3ede-4b59-910a-beecfe6288b1","run":{"acceptance":{"source_sha256":"dc9d7b86bf1d884aaff21340a7baf93383447938c73980f9ad9df749cf5e3d73","verification_sha256":"84d69e4184e2e72de2783bfee3763943bcd636d2085c8417f36eb19a4f2c81c6"},"blocker":{"evidence_sha256":"e06194a5985ee080fc607a603488d13b88ae811aac6bc7c3698ddc453efa1752","kind":"review_failed"},"completion_review":{"input_sha256":"36175bcaad63f6ddd7b92e120b3fcf731c7056d8a823c401dd9a1661a77493eb","invocations":1,"result_sha256":"e06194a5985ee080fc607a603488d13b88ae811aac6bc7c3698ddc453efa1752","state":"blocked"},"draft_review":{"input_sha256":"56bcbb2cf1acf2b2437c0181f45fa6656aec25aa00654b20f452508c6892c449","invocations":1,"result_sha256":"f598651f8a166226414c83ece2c84b549169df942a6e2bd64ea96e1898d25d8c","state":"passed"},"execution_parent":"428ca586723eafa326c4dca495940f7a2bbe2ad9","goal_id":"b3a2ec1d-440c-45b2-ad81-6e0f8a270abd","implementation_commit":"1a7e68f8dc16d0193881bb27e10689c4710f1c23","plan_path":"docs/plans/active/relay-fanout-reaper-reporting.md","plan_sha256":"076d022a2856147d1be2e1c128d6d955a5e546be84126c0d1547b9521b596593","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"8e656e8b-8a20-4acc-9460-3a7dabc5c447","schema":1,"source_base":"702383f504757336ebe6c3859db70384e82a814f","source_sha256":"309f51fbad84174a850cf673817f5c3af4d3be07640bbb095b4a5271f11a8646"},"schema":1,"status":"blocked","successor_run_sha256":"4c128613169ac12920244fc0949fd1e8fa5fdefbb208145ee1d95eba404e2e69"}
Plan-attempt-history: {"authorization_source_sha256":"0889cde97525945382fbfa4f98b7f726fca77bdb38221c558412b63fb9ae6641","plan_bytes_sha256":"430e104db892ce49d4c24d74be9a2fd9120b671e714fa328d9404278de8b082b","replacement_run_id":"a4c26e2a-7576-455f-a697-55328cdfb701","run":{"acceptance":{"source_sha256":"9d031c84a9d02cf992162578676a1b3832a7bfdc887879fe1789163ae9079758","verification_sha256":"3fbc276d6d404545c73a853622191e1936f9a0e9647f4a69e0736891b19f56be"},"blocker":{"evidence_sha256":"644ce23a42385766ad675abfe961785aac5b1b19748893fa4128b1e3358c6a4e","kind":"review_failed"},"completion_review":{"input_sha256":"70cbdf86d93265fe796383b8743d0d65a4107b404ad4c6b2d8ae3a5f2e35cff5","invocations":1,"result_sha256":"644ce23a42385766ad675abfe961785aac5b1b19748893fa4128b1e3358c6a4e","state":"blocked"},"draft_review":{"input_sha256":"50e2456062fcdda65faeaa44e750fcd942250e650a99e3e7372355d5b53ed5d6","invocations":1,"result_sha256":"08407af64bcef40d799dc527650d81095c9ad0b053e3dfccf65f864e26e949bd","state":"passed"},"execution_parent":"428ca586723eafa326c4dca495940f7a2bbe2ad9","goal_id":"b3a2ec1d-440c-45b2-ad81-6e0f8a270abd","implementation_commit":"5e1d94bbd5fb4da0d15c9f2fc51f116ce3c7bb36","plan_path":"docs/plans/active/relay-fanout-reaper-reporting.md","plan_sha256":"8ce01bf42a064ca75543b30a2e9d28c5942b49c7fff2cd3d8941746c549881d4","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"db7f7dcc-3ede-4b59-910a-beecfe6288b1","schema":1,"source_base":"07432faf38462bcd2db8c115b01751b1c5543e9e","source_sha256":"d3931fd672b82d69cb7f35f0e28dec1af9769861c62d300a4eeeac7b0f1e2fdb"},"schema":1,"status":"blocked","successor_run_sha256":"86b4702a153063d75bdade3345581a9e0a8fdcc5f1ad6bc0e5b65299d3ebc60a"}



Completion review invocation 1:

Completion-review-result: {"diff_sha256":"e6e1a9e899544d5705655a981f694efb6b5892cfcc8c205c1bf953b72fb33d58","findings":[{"defect":"The production reaper cannot report `repository_identity_changed` for the mismatch it encounters: the initial identity mismatch is silently discarded by `Ok(_) | Err(_) => continue`, while the later reason arm receives an identity that already matched `snapshot` and is reached only when `current == expected_record`, so `ctx.identity.matches_record(current)` cannot be false. The A1 probe manufactures `changed_candidate_reason(false, None)` directly and therefore passes without exercising this production wiring; its repository-identity non-vacuity claim is not real.","fix":"Retain and report an initial or revalidated repository-identity mismatch with `FanoutGcReason::RepositoryIdentityChanged` without permitting removal, and add a production-boundary fixture that creates the mismatch, proves the worktree and branch survive, and observes the reason.","id":"CR-1","kind":"missing_acceptance","locator":"plugins/session-relay/rust/src/fanout.rs:505-530,584-586,1238-1266"},{"defect":"The successor note and current A6 row say A6 was corrected to `--case fanout_reap`, but the current Verification Results still say `A6 | see the deviation below` and claim the row omits `--case`. Reproduction contradicts that stale record: the corrected command exits 0 and prints `PASS rust_test_inventory case=fanout_reap tests=10 executed=10`. Thus the successor note, acceptance table, and Verification Results do not agree.","fix":"Create a corrected successor plan record whose Verification Results record the runnable A6 command and its per-case output, removing the stale predecessor deviation from the current-run results (the predecessor remains preserved in attempt history).","id":"CR-2","kind":"contradiction","locator":".git/docks-review/completion-relay-fanout-reaper-reporting-1/plan.md:51-59,83,168-178"}],"implementation_commit":"5e1d94bbd5fb4da0d15c9f2fc51f116ce3c7bb36","invocation":1,"run_id":"db7f7dcc-3ede-4b59-910a-beecfe6288b1","schema":1,"verdict":"blocked"}


Completion review invocation 1:

Completion-review-result: {"diff_sha256":"911c0a6a7216ce7e3097cadc9cfb93c747f618d43d74dd0f750c2a1734840337","findings":[{"defect":"The `### Acceptance` results table is keyed to IDs that do not denote this plan's sealed acceptance rows, so two criteria are unrecorded and two rows correspond to no criterion. Sealed A1/A2 are `--lib fanout::tests::retention_report_keeps_reason_discriminants` / `...::removal_failure_has_distinct_report_reason -- --exact`, but results row A1 reports the `--test fanout_reap` suite and row A2 reports the whole `fanout::tests` module. Sealed A4 is `--lib store::tests::missing_worktrees_surface_reports_unavailable -- --exact`, but results row A4 reports `cargo fmt --check` and `cargo clippy`, which is not an acceptance criterion of this plan; that criterion's observation appears only inside row A3. Sealed A5 (`--test fanout_reap legacy_flat_worktree_is_refused_and_reported -- --exact`) has no row bearing its ID. Sealed A6 (inventory `--case fanout_reap`) is reported under row A5, and sealed A7 (`node scripts/ci.mjs --plugin session-relay`) under row A6 as bare `exit 0`, so A7's required observation - that it prints `All ci.mjs checks passed - plugin 'session-relay'; safe to release.` - is recorded nowhere, while results row A7 quotes the repo-wide sentence for a different command. The predecessor record at commit 5e1d94b carried the identical sealed criteria with an ID-aligned results table (`A1 | fanout::tests::retention_report_keeps_reason_discriminants - 1 passed`, ... , `A6 | see the deviation below`), so this run's rewrite introduced the drift while addressing CR-2; the resulting archive cannot be audited row-by-row against its own acceptance table. This is the only defect found: the reviewed diff itself satisfies Steps 1-5 (typed `FanoutGcReason` with all eight labels reaching the report, flat legacy refusal before lock/identity/gate/removal with worktree, branch and persisted path preserved, non-empty missing-surface report rendered solely from `entry.reason.label()`, the four named tests at their owning boundaries, the regenerated inventory, and the eight documented reason/action pairs in AGENTS.md), and the removed `ctx.identity.matches_record` arm is provably unreachable dead code because `abandoned_worktree_decision` returns `Skipped` on `current != expected_record` before it.","fix":"Re-record `## Verification Results` - excluded from `plan_sha256` per docs/plans/AGENTS.md:177-179, so no sealed content changes - with exactly one row per sealed acceptance ID in the order of `## Acceptance criteria`: A1 and A2 naming the two `--lib fanout::tests::... -- --exact` invocations and their single-test results, A3 and A4 naming the two `--lib store::tests::... -- --exact` invocations, A5 naming `--test fanout_reap legacy_flat_worktree_is_refused_and_reported -- --exact` with the surviving worktree/branch and the observed `legacy_shape` stderr, A6 naming `node plugins/session-relay/test/rust-test-inventory.mjs --case fanout_reap` with its `PASS rust_test_inventory case=fanout_reap` line, and A7 naming `node scripts/ci.mjs --plugin session-relay` quoting the required sentence `All ci.mjs checks passed - plugin 'session-relay'; safe to release.`. Move the supplementary evidence (the 11-test `--test fanout_reap` suite run, `cargo fmt --check`/`cargo clippy`, and the repo-wide `node scripts/ci.mjs` result) into the prose above the table instead of into ID-labelled rows.","id":"CR-1","kind":"missing_acceptance","locator":".git/docks-review/completion-relay-fanout-reaper-reporting-1/plan.md:195-205 (against the sealed criteria at :83-93)"}],"implementation_commit":"a5094d3c2d8259d1dc7701f477ae4f59a687a893","invocation":1,"run_id":"a4c26e2a-7576-455f-a697-55328cdfb701","schema":1,"verdict":"repair"}


Completion review invocation 2:

Completion-review-result: {"diff_sha256":"911c0a6a7216ce7e3097cadc9cfb93c747f618d43d74dd0f750c2a1734840337","findings":[],"implementation_commit":"c14070f141e58a91296ee24f99e82c808455ada4","invocation":2,"run_id":"a4c26e2a-7576-455f-a697-55328cdfb701","schema":1,"verdict":"pass"}

## Verification Results

### Implementation (2026-08-02)

Implementation spans `1a7e68f` and `57bbff0` on ancestry from `428ca58`, this run's
`execution_parent`. The checkpoints are shared with `lifecycle-dispatch-integrity`, whose file set
is disjoint; the reviewed diff for this run is bounded to this plan's five `affected_paths`.

**The typed reason surface.** `FanoutGcReport` previously carried only `removed_worktrees` and
`retained_branches`, so a protective retention, a removal failure and an unevaluated outcome were
indistinguishable, and an absent worktrees surface defaulted to an empty report that read as "nothing
to do". Every retention now carries a typed `FanoutGcReason` discriminant travelling in the returned
report and rendered at the store boundary from `entry.reason.label()` alone. There is no second,
independently maintained mapping.

**The reachability defect the predecessor's completion review found — `CR-1`, fixed.** One of the
eight labels, `repository_identity_changed`, could never be produced by the production reaper. The
outer identity match admitted only identities matching the snapshot and discarded every successful
mismatch with a catch-all `continue`; the later reason helper was reached only once
`current == expected_record`, so the admitted identity necessarily matched there too. The label
existed solely for a unit helper — a report discriminant that production could not emit.

A successful identity inspection that does not match the persisted reservation now records
`RepositoryIdentityChanged` and continues immediately, before the repository gate and before any
removal. The reservation, the valid nested path, the worktree and the branch all survive.
Inspection *errors* remain fail-closed skips, which is the existing safety posture. The impossible
repository-identity branch is removed from the later helper, which now handles only worktree
snapshot changes.

**Reachability audit — all eight labels, each with the test that proves it.**

| Label | Reached by | Test |
|---|---|---|
| `legacy_shape` | an old valid one-component legacy path hits pre-removal retention | `legacy_flat_worktree_is_refused_and_reported` (production boundary) |
| `repository_identity_changed` | inspection succeeds but does not match the reservation binding | `reservation_with_changed_repository_identity_is_retained_and_reported` (production boundary) |
| `worktree_changed` | dev/inode/mtime move between snapshot and revalidation | `fanout::tests::retention_report_keeps_reason_discriminants` |
| `uncollected_commits` | rev-list returns nonzero before cleanliness or removal | `reservation_with_uncollected_commits_keeps_worktree_and_reports_branch` (production boundary) |
| `commit_inspection_failed` | a real rev-list/spawn/object/reference error | `fanout::tests::retention_report_keeps_reason_discriminants` |
| `worktree_not_clean` | `ensure_clean` rejects tracked or untracked changes | `reservation_with_dirty_changes_keeps_worktree_and_reports_reason` (production boundary) |
| `removal_failed` | a real `git worktree remove` failure, for example a locked worktree | `fanout::tests::removal_failure_has_distinct_report_reason` |
| `worktrees_surface_unavailable` | `collect_fanout_gc` receives no opened surface | `store::tests::missing_worktrees_surface_reports_unavailable` |

`store::tests::fanout_diagnostics_render_report_reasons` verifies all eight stable labels render
from `entry.reason.label()` at the structured-stderr boundary.

**Revert sensitivity for `CR-1`.** With the mismatch arm regressed to `Ok(_) => continue`,
`reservation_with_changed_repository_identity_is_retained_and_reported` FAILED (exit 101, `0 passed;
1 failed; 10 filtered out`). With the arm restored it passes, and the production-boundary suite is
`11 passed`.

**Retention safety.** `cargo test --test fanout_reap reservation_with_` is `3 passed`, including the
uncollected-commits and dirty-changes cases; both assert the worktree and the branch remain.

**`CR-2` was not a defect of this work.** The reviewer read a stale `## Verification Results`,
because the orchestrator's reservation driver sealed pre-update bytes while binding post-update
digests. The driver now seals exactly the installed bytes and reads them back, requiring byte
equality with the live record before it returns. This record was sealed under that fix.

### Acceptance

One row per sealed acceptance ID, in the order of `## Acceptance criteria`, each recording the
result of that row's exact command.

| ID | Result |
|---|---|
| A1 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --lib fanout::tests::retention_report_keeps_reason_discriminants -- --exact` — exit 0, `1 passed; 0 failed; 136 filtered out`; every retained entry carries a distinct reason discriminant |
| A2 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --lib fanout::tests::removal_failure_has_distinct_report_reason -- --exact` — exit 0, `1 passed; 0 failed; 136 filtered out`; a failed removal is reported as `removal_failed`, distinct from every protective retention |
| A3 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --lib store::tests::fanout_diagnostics_render_report_reasons -- --exact` — exit 0, `1 passed; 0 failed; 136 filtered out`; all eight stable labels render at the structured-stderr boundary from `entry.reason.label()` alone |
| A4 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --lib store::tests::missing_worktrees_surface_reports_unavailable -- --exact` — exit 0, `1 passed; 0 failed; 136 filtered out`; an absent worktrees surface reports `worktrees_surface_unavailable` instead of defaulting to an empty report |
| A5 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --test fanout_reap legacy_flat_worktree_is_refused_and_reported -- --exact` — exit 0, `1 passed; 0 failed; 10 filtered out`; the flat legacy worktree is refused and reported, not removed |
| A6 | `node plugins/session-relay/test/rust-test-inventory.mjs --case fanout_reap` — exit 0, `PASS rust_test_inventory case=fanout_reap tests=11 executed=11`; the committed fixture matches the integration-test inventory exactly |
| A7 | `node scripts/ci.mjs --plugin session-relay` — exit 0, `All ci.mjs checks passed — plugin 'session-relay'; safe to release.` |

**`CR-1` from completion invocation 1 — accepted and repaired here.** The previous results table was
keyed to IDs that did not denote the sealed acceptance rows: it reported whole suites where the
criteria name single `-- --exact` unit tests, so two sealed criteria were unrecorded and two recorded
rows matched no criterion. `## Verification Results` is excluded from `plan_sha256`, so re-recording
it changes no sealed content. The reachability evidence that table was carrying has not been
discarded — it is the audit above, which is narrative, while this section is the acceptance ledger.

### Reliability observations, recorded rather than smoothed over

`A7` FAILED once out of five gate runs, on `session-relay self-test failed (jobs-1)`. It then passed
on the two following gate runs, and a direct six-iteration jobs-1 versus jobs-4 comparison against
the release binary produced byte-identical output 6/6. Two full `node scripts/ci.mjs` runs also
passed over the same bytes. The evidence available says infrequent environment timing, not a
deterministic defect in this change; it is recorded here rather than omitted, because one observed
failure in a release gate is worth a successor's attention.

### Environment note on the bare Rust suite

`cargo test` run directly from `plugins/session-relay/rust` fails eight
`tests/workspace_coordination_process.rs` cases with `write custody FD: Permission denied`. These
are environment-gated, not regressions: `scripts/ci.mjs:145-188` provisions and delegates
`SESSION_RELAY_TEST_CGROUP_ROOT` before running them, so the authoritative acceptance path is the
gate, which passes. `plugins/session-relay/rust/src/workspace.rs` is byte-unchanged by this run
(`git diff 428ca58..HEAD -- .../workspace.rs` is empty). Separately,
`workspace::tests::broker_readiness_refuses_a_child_that_closes_without_publishing` flakes under
parallel load and passed 5/5 in isolation; it is also untouched here.
