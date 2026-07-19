# Dispatched-executor mode (optional, Claude-only)

The model-tiered alternative to in-context implementation (Phases 7–8). An
expensive orchestrator plans and reviews; a **cheaper executor** does the edits
in an isolated git worktree; the orchestrator reviews that diff like a tech lead.

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

- The approved plan is well-scoped with machine-checkable done criteria (the
  executor needs them — it has zero session context).
- The user wants to spend the capable model on judgment, not execution.
- The host is Claude Code and the repo is a git repository.

If any of those is false, run Phases 7–8 in-context instead.

## Preconditions

Check all before dispatching:

- The repo is a git repository (worktree isolation needs it). If not: stop, say so, run Phases 7–8 in-context.
- The plan is approved (`status: ongoing` via `start <slug>`) and its dependencies are done.
- Run the plan's drift check first: `git diff --stat <planned_at_commit>..HEAD -- <affected_paths>`. If in-scope files changed since the plan was written, reconcile the plan before dispatching — never hand a stale plan to an executor.

## Dispatch

Spawn **one** executor subagent with `isolation: "worktree"`, default model `sonnet` (or the model the user named — e.g. `haiku`). The subagent has no session context, so the prompt must contain:

1. **The full plan body, inlined.** The worktree holds only committed files; if the plan `.md` is uncommitted the executor can't read it. Always inline.
2. An executor preamble: *follow the plan step by step; run every verification command and confirm the expected result before moving on; touch only the files in `affected_paths`; if a STOP condition fires, stop and report; do not improvise around obstacles; before reporting, audit every claim against an actual tool result.*
3. A fixed report format: `STATUS: COMPLETE | STOPPED` · per-step done/skipped + verification result · `STOPPED BECAUSE` (if stopped) · `FILES CHANGED` · `NOTES` (deviations, judgment calls).

Treat the returned diff as **untrusted** until reviewed.

## Review — the orchestrator's real job

Never fix anything yourself; review like a tech lead reviewing a PR against the spec.

1. **Re-run every done criterion** in the worktree — don't trust the report, verify. (Fresh worktrees share git history but not `node_modules`/build artifacts; the executor installs deps first — that's expected, not a deviation.)
2. **Scope check:** `git -C <worktree> diff --name-only` must be a subset of the plan's `affected_paths`. Any out-of-scope file fails review.
3. **Read the full diff** against "why this matters" — does it solve the actual problem, in the repo's conventions?
4. **Audit the new tests** — executors game criteria; a test that asserts nothing passes the suite and proves nothing.

## Verdict

A *documented* deviation is judged on merit, not reflex-blocked; an *undocumented* one is a review failure.

| Verdict | When | Action |
|---|---|---|
| **APPROVE** | criteria pass, scope clean, quality holds | record it in the plan's `## Review`; present the diff summary + worktree path. **Merging is the user's call — never merge/push/commit to their branch.** |
| **REVISE** | fixable gaps | `SendMessage` the same executor with specific, actionable feedback. **Max 2 rounds**, then BLOCK. |
| **BLOCK** | STOP hit, scope violated unrecoverably, or revisions exhausted | note it in the plan; refine the plan with what was learned; tell the user. |

Running verification inside the worktree is fine — it's isolated and disposable; the no-mutating-commands rule protects the user's working tree, not the worktree.

## What stays out of this mode

- The verdict feeds back through the plan's `docs/plans/` lifecycle (the `## Review` block, `review_status`) — there is no separate `plans/` directory.
- No auto-merge, no push, no commit to the user's branch.
- Off Claude (or when worktree isolation is unavailable): this whole mode is skipped; use Phases 7–8 in-context.
