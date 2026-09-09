---
name: plan-manager
description: "Use when a goal may need the six-phase plan flow: decide, draft, research, plan review, implement, code review; an issue-backed canonical plan; or lifecycle handling. Not for workspace setup (use plan-workspace), plan criticism (use plan-reviewer), or code-review agent work."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-09-09"
  content_hash: "92135a0b657a5b7fc2a978f63b52716d8dfd3d9e851042174c60dfb6473b74ce"
---

# Plan Manager

Own the user goal through six phases. Read
[`references/plan-contract.md`](references/plan-contract.md) before using the
lifecycle helper. That reference owns record shapes, commands, normalization,
ownership, review trust, and landing safeguards. Do not copy its grammar here.

<constraint>
Main context owns mode selection, questions, edits, implementation, review
publication, and lifecycle changes. Reviewers stay read-only. Use
`plan-workspace` for repository setup and `plan-reviewer` for plan review.
Deliver the durable solution required by the canonical contract.
</constraint>

<constraint>
Ask in-session immediately before running a non-local Effect step. Persisted
intent is not permission. If confirmation is unavailable, block the step and
plan with a reason. Routine issue publication and linked-branch landing work
follow the settled mode and the separate merge safeguard in the contract.
</constraint>

## Resolve the helper

`plan.mjs` ships in the installed plugin at
`skills/productivity/plan-manager/scripts/plan.mjs`. Resolve it from this skill
or the runtime plugin cache. Run it from the target repository root. Never
copy it into the project or recreate it when the plugin is unavailable.
Use the command reference for arguments and refusal recovery.

## Six phases

### 1. Decide

If the request does not settle the mode, ask with these options:
`Plan and implement now`, `Plan only, stop at planned`, `Implement directly`.
Do not ask only for permission to begin.

Use direct implementation for one clear, reversible, low-risk local diff with
one bounded acceptance path. It creates no plan issue, reviewer, or automatic
commit. Use a canonical plan for explicit planning, multi-commit or
cross-repository work, cold handoff, unresolved decisions, public-contract or
cross-subsystem changes, security-sensitive or destructive work, or external
effects. Without `ask`, take only the qualifying direct path and report the
assumption; otherwise report the missing decision.

### 2. Draft

Complete the preflight in
[`references/github-issue-publication.md`](references/github-issue-publication.md).
Create the issue with `new` and the settled mode. Report its number. Draft the
outcome, research hypothesis, provisional steps, scope, and acceptance proof.
Keep the plan drafting while those claims remain provisional.

### 3. Research

Export the issue and edit the exported file. Check the repository instructions,
target files, callers, tests, and current official documentation. Use language
server references before changing exported symbols. Bind research findings to
repository paths and symbols or official URLs. Name the durable fix and the
temporary approach it replaces. Make the Files cells cover the intended scope.

Fill acceptance with runnable proof, then use `edit` to publish the export.
Read all advisories and resolve any decision they expose. A defaulted plan-only
mode never authorizes implementation. Move the researched plan to planned.
Use a fresh export for later body edits; keep its provenance sidecar intact.

### 4. Plan review

Export fresh input for each round. Dispatch `plan-reviewer` with the issue
number and export path. If no wrapper exists, dispatch a fresh read-only
reviewer with the skill. Publish its one returned block unchanged as an issue
comment. Never store a review in the body.

Stop on pass. Reproduce repair findings, fix confirmed defects, and record
evidence for rejected findings. Review the changed plan with fresh input.
Route a user-only decision through Open questions and `ask`. On no progress,
a surviving finding, or a round-5 non-pass, ask the user to continue or block.
If no answer is available, record the reason and block. A repeated dispatch
failure without a relevant change also needs a user decision, not a silent skip.
Never implement a repaired plan that has not passed review.

A plan-only run stops after pass at planned. Report the issue and verdict.
Do not create a branch or implement without a new instruction.

### 5. Implement

Move the plan to ongoing. Follow the contract's linked-branch flow before
coding. Require clean `git status --porcelain` before branch checkout, including
`gh issue develop --checkout`. Never stash, move, or commit ambient work to
make it clean. Use an authorized clean worktree or block with the dirty paths.
Pass `--repo` on every `gh issue develop` call. Verify the linked branch; after
failure, re-list and recover it or block. There is no unlinked fallback.

Set each step in-flight, implement or delegate it, run its proof, then mark it
done. Honor the Effect confirmation gate. Use `docks:code-clarity` for
self-explaining code. Run all acceptance commands and record real results in
Verification Results through the export/edit flow.

### 6. Code review

Review the complete candidate, not only dirty files. Fetch the default branch
and compute its merge base with HEAD. Build the net tracked diff against that
base and add untracked file hunks. Name changed paths outside Steps Files.
Save the diff under the worktree-safe scratch path from
`git rev-parse --git-path docks-review`, with directory mode `0700`.

Each round receives a fresh diff, fresh plan export, issue number, and round
number. Dispatch `code-reviewer` and publish its one block unchanged. Stop on
pass. Record advisory MEDIUM and LOW findings without changing passed bytes.
Fix evidenced severe defects and request a fresh review. On no progress, a
surviving finding, or a round-5 non-pass, ask the user to continue or block.
Unreadable input must be resolved before a safe verdict. If blocking after
implementation, commit and normally push current work to the linked branch
before recording the blocker so repairs are not stranded.

## Landing and reporting

After pass, commit and push remaining reviewed bytes. Create or update the
closing pull request. Compare its head and diff with the reviewed candidate;
a mismatch invalidates the pass. Follow the canonical checks policy: wait up
to five minutes for checks to appear, and never treat an empty result as success.
Ask freshly for `Merge now` or `Leave pull request open`. Without a fresh merge
answer, leave it open. Re-read the head and diff immediately before merging
with `--match-head-commit`. Archive only after the approved merge lands.

Render the body only when the user names the plan and asks to see it. After a
write, report the header and changed lines. Frozen history under
`docs/plans/finished/` is not lifecycle input; do not open or inventory it.

## BAD / GOOD

```text
BAD: Repair the plan and implement without another review.
GOOD: Export the changed plan and get a fresh pass.

BAD: Merge because checks passed earlier.
GOOD: Verify the reviewed head and obtain a fresh Merge now answer.
```
