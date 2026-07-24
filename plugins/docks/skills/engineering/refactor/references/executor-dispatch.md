# Dispatched-executor mode (optional, Claude-only)

The model-tiered alternative to in-context implementation (Phases 7–8). The
main-context `plan-manager` owns the reviewed run; a **cheaper executor** makes
the edits in an isolated git worktree and returns its diff for untrusted review.

**This mode is opt-in and Claude-only.** It relies on `isolation: "worktree"`
and subagent dispatch, which are Claude-Code-specific (per the kit's cross-tool
rules). The default everywhere — and the only path off Claude — is the
single-context implementation in the skill body. Use this mode only when the user
asks for it (e.g. "implement 003 with a cheaper executor", "execute haiku").

## Contents

- [When to use](#when-to-use)
- [Preconditions](#preconditions)
- [Dispatch](#dispatch)
- [Review — the orchestrator's real job](#review--the-orchestrators-real-job)
- [Verdict](#verdict)
- [What stays out of this mode](#what-stays-out-of-this-mode)

## When to use

- The current plan is well-scoped with machine-checkable done criteria (the
  executor needs them because it has zero session context).
- The user wants to spend the capable model on judgment, not execution.
- The host is Claude Code and the repo is a git repository.

If any of those is false, let `plan-manager` run Phases 7–8 in context instead.

## Preconditions

Check all before dispatching:

- The repository supports worktree isolation. Otherwise report that constraint
  to `plan-manager`, which continues through Phases 7–8 in context.
- The canonical plan is at `status: ongoing`, contains exactly one valid
  `Plan-run:` record, and its `draft_review.state` is `passed` or the
  local-risk-only `degraded`.
- `plan-manager` has created and read back the reviewed start checkpoint and
  still owns the active `repository_id + plan_path + run_id`.
- Before launch, `plan-manager` revalidates the bound `plan_sha256`,
  `source_sha256`, `execution_parent`, current HEAD/index, and owned-path
  preimages. Any mismatch becomes `concurrent_change` before dispatch; never
  hand a stale or differently bound run to the executor.

## Dispatch

Spawn **one** executor subagent with `isolation: "worktree"` from the read-back
start checkpoint, using default model `sonnet` (or the model the user named,
such as `haiku`). The subagent has no session context, so the prompt must
contain:

1. The canonical `plan_path`; exact `repository_id`, `run_id`, `plan_sha256`,
   `source_sha256`, and `execution_parent` bindings; and the affected-path set
   from the canonical plan. The executor reads the checkpointed plan at that
   path; do not inline an unbound second copy.
2. An executor preamble: *follow the plan step by step; run every verification
   command and confirm the expected result before moving on; touch only the
   canonical affected paths; do not edit the plan or its `Plan-run:` record; if
   a STOP condition fires, stop and report; do not improvise around obstacles;
   do not commit, push, or merge; audit every claim against an actual tool
   result.*
3. A fixed report format: exact run bindings · `STATUS: COMPLETE | STOPPED` ·
   per-step done/skipped and verification result · `STOPPED BECAUSE` (if
   stopped) · `FILES CHANGED` · `NOTES` (deviations, judgment calls). The
   executor must return the worktree diff with this report.

Treat the returned bindings, report, and diff as **untrusted** until reviewed.

## Review — the orchestrator's real job

Review like a tech lead reviewing a PR against the bound plan. Fixable gaps go
back to the same executor; the reviewed result returns to `plan-manager`.

1. **Binding check:** the report's `repository_id`, `run_id`, `plan_sha256`,
   `source_sha256`, and `execution_parent` must exactly match the live
   `PlanRunV1`; reject output from any other or superseded run.
2. **Re-run every done criterion** in the worktree — do not trust the report.
   Fresh worktrees share git history but not `node_modules` or build artifacts;
   an executor installing dependencies there is expected, not a deviation.
3. **Scope check:** `git -C <worktree> diff --name-only` must be a subset of the
   canonical affected-path set. Any out-of-scope file fails review.
4. **Read the full diff** against why the change matters and the repository's
   conventions.
5. **Audit new tests** for observable contracts; a test that asserts nothing
   can pass while proving nothing.

## Verdict

A *documented* deviation is judged on merit, not reflex-blocked; an
*undocumented* one is a review failure.

| Verdict | When | Action |
|---|---|---|
| **APPROVE** | bindings match, criteria pass, scope is clean, and quality holds | Return the reviewed diff and executor result to main-context `plan-manager`. It revalidates the live `PlanRunV1` and apply preimages, applies only the bound diff, reruns verification, records `## Verification Results`, binds `acceptance`, performs the separate completion review for `sensitive` or `external` risk, then finishes and archives the run without another lifecycle handoff. |
| **REVISE** | fixable gaps | Send the same executor specific, actionable feedback. Allow at most two executor revision rounds, then return a failure result to `plan-manager`. |
| **BLOCK** | STOP hit, scope violated unrecoverably, or revisions exhausted | Return the evidence to `plan-manager`; it records the applicable current blocker and does not restart draft review. |

Verification in the isolated worktree is evidence for review, not final
acceptance. `plan-manager` reruns the invalidated checks after applying the
approved diff to the bound run.

## What stays out of this mode

- The executor never writes lifecycle state, `Plan-run:`, `## Review`, or
  `## Verification Results`; main-context `plan-manager` owns them.
- The executor never commits, pushes, merges, or applies directly to the main
  working tree. Its only handoff is the bound diff and result.
- Off Claude, or when worktree isolation is unavailable, this mode is skipped;
  `plan-manager` runs Phases 7–8 in context.
