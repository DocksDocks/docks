---
name: plan-manager
description: "Use when a goal may need the six-phase plan flow: decide, draft, research, plan review, implement, code review; an issue-backed canonical plan; or lifecycle handling. Not for workspace setup (use plan-workspace), plan criticism (use plan-reviewer), or code-review agent work."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-10-23"
  content_hash: "f1012e9255b604143194984ac7b6f482d506bf76b1722b44c3852b2416068bee"
---

# Plan Manager

Own the user goal through six phases. Read
[`references/plan-contract.md`](references/plan-contract.md) before phase 1.
The contract owns the path criteria, record shapes, commands, normalization,
ownership, the review loop, review trust, and landing safeguards. This skill
owns the phase order and what each phase must finish. Do not copy contract rules here.

<constraint>
Main context owns mode selection, questions, edits, implementation, review
publication, and lifecycle changes. Reviewers stay read-only. Use
`plan-workspace` for repository setup and `plan-reviewer` for plan review.
Deliver the durable solution that the contract defines.
</constraint>

<constraint>
Ask in-session immediately before running a non-local Effect step. Persisted
intent is not permission. If confirmation is unavailable, block the step and
plan with a reason. The settled mode covers routine issue publication and
linked-branch landing work. Every merge needs a fresh `Merge now` answer. A
production cleanup in the contract's Teardown needs its own in-session
question, also in a yolo run. In a yolo run, the contract's Yolo runs section
replaces every question in this skill except the merge question and a
production cleanup question.
</constraint>

## Resolve the helper

`plan.mjs` ships in the installed plugin at
`skills/productivity/plan-manager/scripts/plan.mjs`. Resolve it from this skill
or the runtime plugin cache. Run it from the target repository root. Never
copy it into the project or recreate it when the plugin is unavailable.
Use the contract's command and refusal lists for arguments and recovery.

## Six phases

### 1. Decide

Apply the path criteria in the contract (Record and mode). If the request does
not settle the path and the Mode, ask with these options: `Plan and implement now`,
`Plan only, stop at planned`, `Implement directly`. Do not ask only for
permission to begin.

If `ask` is unavailable, implement directly only when the request meets the
direct-implementation criteria, and report that assumption. Otherwise create no
plan issue and report the missing decision.

Done when: the path is direct implementation, or a plan with a settled Mode.

### 2. Draft

Complete the preflight in
[`references/github-issue-publication.md`](references/github-issue-publication.md).
Create the issue with `new` and the settled mode. Report its number. Draft the
outcome, research hypothesis, provisional steps, scope, and acceptance proof.
Keep the plan drafting while those claims remain provisional.

Done when: `show <n>` prints the header strip with status `drafting`.

### 3. Research

Export the issue and edit the exported file. Check the repository instructions,
target files, callers, tests, and current official documentation. Use language
server references before changing exported symbols. Bind research findings to
repository paths and symbols or official URLs. Name the durable fix and the
temporary approach it replaces. Make the Files cells cover the intended scope.

Fill acceptance with runnable proof, then use `edit` to publish the export.
Read all advice and resolve any decision it exposes. A defaulted plan-only
mode never authorizes implementation. Use a fresh export for each later body
edit, and keep its provenance sidecar intact.

Done when: `status <n> planned` succeeds and no advice needs a decision.

### 4. Plan review

Run the contract's review loop with `plan-reviewer`. For each round, export
fresh input and dispatch `plan-reviewer` with the issue number, export path, and
round number. If no wrapper exists, dispatch a fresh read-only reviewer with the
`plan-reviewer` skill. Route a user-only decision through Open questions and
`ask`. Never implement a repaired plan that has not passed review.

A plan-only run stops after the pass, at planned. Report the issue and verdict.
Do not create a branch or implement without a new instruction.

Done when: `show <n>` reports `plan=pass`.

### 5. Implement

Move the plan to ongoing. Set up the linked branch with the contract's Linked
branch steps before you change code. Set each step in-flight, implement or
delegate it, run its proof, then mark it done. Honor the Effect confirmation
gate. When `docks:code-clarity` is available, use it for self-explaining code.
Run all acceptance commands and record real results in Verification Results
through the export/edit flow.

Done when: every step that can run before the merge is done or skipped, and
Verification Results hold real acceptance results.

### 6. Code review

Review the complete candidate: committed, staged, unstaged, and untracked
changes since the merge base with the default branch. Build the diff in the
review scratch directory:

```bash
scratch=$(git rev-parse --git-path docks-review)
mkdir -p "$scratch" && chmod 700 "$scratch"
git fetch origin <default>
base=$(git merge-base "origin/<default>" HEAD)
review_diff="$scratch/code-review-<n>-round-<k>.diff"
git diff --binary "$base" > "$review_diff"
git ls-files --others --exclude-standard -z |
  while IFS= read -r -d '' file; do git diff --no-index --binary -- /dev/null "$file"; done >> "$review_diff"
```

`git diff --no-index` exits 1 when the files differ, so that exit status is
expected here. In the dispatch message, name each changed path that is outside
the Steps Files cells.

Run the contract's review loop with `code-reviewer`. Give each round a fresh
diff, a fresh plan export, the issue number, and the round number. Fix each
evidenced CRITICAL or HIGH defect before the next round. A pass can carry MEDIUM
and LOW findings. The posted comment is their record; do not change reviewed
bytes for them. Resolve unreadable input before you request a verdict. If you
block after implementation, commit and push current work to the linked branch
before you record the blocker, so repairs are not stranded. Then run the
contract's Teardown for an exit without a merge.

Done when: `show <n>` reports `code=pass`.

## Landing and reporting

After code review passes, follow the contract's Landing and archive proof:
commit and push the reviewed bytes, open or update the pull request, wait for
checks, ask afresh for `Merge now` or `Leave pull request open`, and merge only
on `Merge now`. The `Merge now` option states the teardown, as the contract's
Checks and merge says. After a partial merge, run `reopen <n> --pr <pr>` as the
contract states. Archive only after the landing merge, when every step is terminal.
After archive, run the contract's Teardown. Without `Merge now`, run Teardown's
exit without a merge. Report Kept resources in both cases.

Render the body only when the user names the plan and asks to see it. After a
write, report the header strip and changed lines.

Done when: `archive <n>` prints `plan #<n> finished (closed by <pr-url>)` and
you reported Kept resources, or the user chose `Leave pull request open` and
you reported the open pull request and Kept resources.

## BAD / GOOD

```text
BAD: Repair the plan and implement without another review.
GOOD: Export the changed plan and get a fresh pass.

BAD: Merge because checks passed earlier.
GOOD: Verify the reviewed head and obtain a fresh Merge now answer.

BAD: Merge a partial pull request and trust `Refs #<issue>` to keep the issue open.
GOOD: Say that the merge closes the issue, merge on `Merge now`, run `reopen <n> --pr <pr>`, and confirm `show` reads ongoing.

BAD: Run `git branch -D` after `git branch -d` refuses.
GOOD: Keep the branch and list it under Kept resources.
```

## Report a problem with this skill

When this skill gives a wrong, outdated, or unsafe instruction, or a script that it ships fails, report the problem in the public DocksDocks/docks repository. Use the docks `report-skill-issue` skill for the report. If that skill is not installed, do not file anything: give the user a draft instead. The draft names this skill and its plugin version, quotes the instruction, and states what happened and what you expected. Leave out secrets and private names.
