---
title: Make the fanout reaper report why a worktree survived
goal: Stop the fan-out worktree reaper from reporting removal failure and deliberate retention identically, so an operator can tell a protected worktree from one that has silently failed to collect for weeks.
status: drafting
created: "2026-08-01T23:17:11-03:00"
updated: "2026-08-01T23:17:11-03:00"
started_at: null
finished_at: null
assignee: null
tags: [plans, session-relay, fanout, gc, observability, registered-idea]
affected_paths:
  - plugins/session-relay/rust/src/fanout.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/AGENTS.md
related_plans: []
---

# Make the fanout reaper report why a worktree survived

## Goal

Every worktree the reaper leaves behind carries a recorded reason, so a silent
no-op cannot be mistaken for a healthy sweep.

## Context & rationale

Measured on this host, then cleared at the owner's request. The evidence no
longer exists on disk, so this record is what survives.

Six fan-out worktrees survived **fourteen days** against a documented one-day
sweep. GC was enabled (`AGENT_RELAY_GC_DAYS` unset everywhere) and the sweep was
running: throttle stamp rewritten ninety minutes earlier, 1,657 repository-gate
entries touched half an hour before measurement. Every documented skip gate was
measured and none fired:

| Gate | Source | Measured |
|---|---|---|
| record absent | `fanout.rs:352` | all six present |
| invalid path | `fanout.rs:360` | valid |
| younger than cutoff | `fanout.rs:368` | 14 days vs 1-day cutoff |
| `collection_phase` set | `fanout.rs:382` | `null` |
| `state == Collected` | `fanout.rs:383` | none |
| worker live | `fanout.rs:384` | `active_operations` empty |
| collection lock held | `fanout.rs:448` | `flock`, zero live holders |
| identity mismatch | `fanout.rs:392` | device and inode matched |
| managed refusal | `repository_gate.rs:469` | `repositories/` empty, no marker |
| commits or dirty | `fanout.rs:479` | five of six clean, zero past base |

One was legitimately retained: it held one commit past its `base_sha`, which is
the branch-preserving behaviour the code intends.

The six were then removed with a plain `git worktree remove`, all succeeding with
no `--force` and no error. `remove_unstarted_worktree` (`fanout.rs:507`) drives
that same operation, so git-level removal worked the whole time. That demotes
removal failure and promotes the surface lookup: `store.rs:1313` resolves
`gc_surface_dir(&self.surface_dirs, "worktrees")`, and the `None` arm at
`store.rs:1318` substitutes `FanoutGcReport::default()` — zero removals,
indistinguishable from a healthy sweep. Hypothesis, not conclusion; confirming it
needs an instrumented run.

The defect is the silence, not the retention. Protecting a worktree with
uncollected commits is correct (`fanout.rs:389-390`). But `fanout.rs:512` maps a
failed removal to `Retained(branch)` — the identical value a deliberate
retention produces at `:489` — and neither path emits a diagnostic.

All six survivors carried flat single-component paths (`worktrees/<uuid>`), while
current code provisions a repository-keyed two-component layout
(`fanout/git.rs:189-191`, asserted at `fanout.rs:2322-2332`).
`worktree_path_components` accepts one to three components, so it tolerated the
legacy shape. A correlation across the whole observed set, not a proven cause.

## Environment & how-to-run

Run every command from the repository root of this checkout. Rust work needs the
pinned toolchain from `rust-toolchain.toml`, resolved from the crate directory.

```bash
corepack enable && pnpm install --frozen-lockfile   # Node 24
node scripts/ci.mjs --plugin session-relay          # authoritative gate for this plan
```

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | `outcome_reason` | Give the retained outcome a reason discriminant, separating protective retention, removal failure, and unevaluated | `rust/src/fanout.rs` | — | `local` | `planned` | The report distinguishes retention for uncollected commits from retention because removal errored. Failure: STOP; a boolean or bare string reintroduces the collapse. |
| 2 | `surface_absent` | Make an unavailable worktrees surface a reported condition, not an empty success report | `rust/src/store.rs` | `outcome_reason` | `local` | `planned` | With the surface unavailable the sweep reports that condition instead of zero removals. Failure: STOP; a default report for an error is the silence being fixed. |
| 3 | `reason_test` | Cover each reason with a test that fails when its arm reverts to the collapsed value | `rust/src/fanout.rs` | `outcome_reason`, `surface_absent` | `local` | `planned` | Each reason has a test; reverting its arm fails it. Failure: STOP; a test passing both ways proves nothing. |
| 4 | `legacy_shape` | Decide and record whether flat single-component reservations are migrated or refused, rather than silently tolerated | `rust/src/fanout.rs`, `AGENTS.md` | `reason_test` | `local` | `planned` | The chosen behaviour is implemented and stated in the plugin context file. Failure: STOP; do not widen `worktree_path_components`, which deepens the tolerance that hid this. |
| 5 | `document` | State each reported reason in the plugin contract with its operator action | `AGENTS.md` | `reason_test` | `local` | `planned` | The contract lists every reason and what to do about it. Failure: STOP; an observable nobody can interpret is not observability. |
| 6 | `archive` | Archive this plan | this plan record | `document` | `local` | `planned` | Plan is `finished` at the dated archive path with a local commit. Failure: leave `ongoing`. |

## Acceptance criteria

| Id | Criterion |
|---|---|
| A1 | `node scripts/ci.mjs --plugin session-relay` exits 0 with a clean working tree. |
| A2 | Retention for uncollected commits and retention after a failed removal report different reasons. Non-vacuity: collapsing both arms fails a test. |
| A3 | A sweep that cannot open the worktrees surface reports that condition rather than zero removals. Non-vacuity: restoring the `None` default arm fails a test. |
| A4 | A flat single-component reservation behaves as step 4 decided, asserted rather than assumed. |
| A5 | Every source line cited in Context still resolves to the construct it describes, re-read rather than trusted. |

Each row names an observable outcome rather than a step number, so renumbering
cannot desync it.

## Out of scope / do-NOT-touch

- The retention policy. Protecting a worktree with uncollected commits or a dirty
  tree is correct and must not be relaxed to reduce accumulation.
- Branch deletion. `fanout.rs:389-390` states GC never deletes refs; that is the
  only thing keeping an uncollected commit reachable.
- The one-day cutoff and six-hour throttle. Nothing measured implicates them.
- The other registered plans. Separate goals.

## STOP conditions

1. Any row whose `Effect` column is not `local` is reached.
2. A change makes the reaper remove a worktree holding uncollected commits or
   uncommitted changes. Accumulation is the symptom; data loss is worse.
3. `worktree_path_components` is widened to accept more shapes as the legacy fix.
4. A reason is added that no test can produce.
5. The removal path changes before the reporting is fixed; without discriminated
   reasons there is no way to observe whether it helped.

## Open questions

1. Whether the leading hypothesis holds. Confirming needs one instrumented sweep
   against a reconstructed flat-shape reservation.
2. Whether the reason belongs only in the returned report, or also in a log line,
   since the sweep runs unattended from a hook.
3. Whether existing flat-shape records are migrated in place or refused.

## Review

Not dispatched. Registered so measurements taken against a state that no longer
exists survive the session. Full review budget, no permit reserved or spent.

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"execution_parent":null,"goal_id":"b3a2ec1d-440c-45b2-ad81-6e0f8a270abd","implementation_commit":null,"plan_path":"docs/plans/active/relay-fanout-reaper-reporting.md","plan_sha256":"9c8f1745b59ae621cb91bd70572c1197441a276f6d285b3ccb5c88ae3ad84d53","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"8e656e8b-8a20-4acc-9460-3a7dabc5c447","schema":1,"source_base":"f295cce5c776485d6e70399c952e4e7ef2ce216c","source_sha256":"f28faafabb3833ed484c04e884bd4fc1c073d1f861dda1e79b33878aa3eee30a"}

## Verification Results

Manager-written after execution. Empty at registration time.
