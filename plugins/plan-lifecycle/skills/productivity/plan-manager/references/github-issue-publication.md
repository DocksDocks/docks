# GitHub issue publication

Every canonical plan begins as a GitHub issue. Creating it is a
repository-visible write, so complete this preflight before `plan.mjs new`.
A failed preflight creates no issue and writes nothing:

1. `gh auth status` succeeds.
2. The checkout has a GitHub remote.
3. From that checkout,
   `gh repo view --json nameWithOwner,visibility,defaultBranchRef` resolves the
   exact repository, its visibility, and its default branch.

## Contents

- [Authorization](#authorization)
- [Review publication](#review-publication)
- [Implementation branch](#implementation-branch)
- [Landing](#landing)

## Authorization

The settled plan mode authorizes routine creation and update of the plan issue
in the repository that the preflight resolved. Do not ask again for that
publication or show a repository picker that repeats a resolved fact. The same
authorization covers posting each reviewer's returned block as one unchanged
issue comment.

Two safeguards still require an in-session `ask` before the write:

- **Ambiguity.** The preflight resolves no repository, resolves more than one
  candidate GitHub remote, or resolves a repository that contradicts the user's
  stated target. Ask which exact repository receives the issue.
- **Sensitive public disclosure.** The repository is public and the proposed
  plan names a vulnerability, a credential location, or another sensitive
  finding. Ask one explicit question stating that the issue body is public.

When `ask` is unavailable in a subagent, headless run, or `-p` run and a
safeguard applies, do not run `plan.mjs new`. Report that issue publication is
blocked and name the safeguard that could not be answered. Never substitute a
tracked plan file and never publish a sensitive body speculatively. When no
safeguard applies, the settled mode is sufficient and publication proceeds.

## Review publication

`## Review` remains exactly `_Review records are stored in issue comments._`.
Each reviewer returns one markdown block; the manager posts that whole block
unchanged as one issue comment. A comment is trusted only when the issue has
exactly one assignee and that assignee authored the well-formed whole-comment
record. The latest trusted record per review kind wins. A legacy body verdict
for one kind is used only when no trusted comment record of that kind exists.

Both review phases run at most five rounds. Every round reads a fresh plan
export, and every code-review round also reads a fresh complete-candidate diff.
Rounds 1 through 4 repair every reproduced or named finding and re-review the
repaired bytes. The loop stops on no relevant byte change, a finding surviving
its fix, or a `repair` or `fixes-required` verdict in round 5. A
plan-review `blocked`
routes its user-only decision through `## Open questions` and `ask`. A technical
code-review block or any terminal repair failure after implementation starts
commits and normally pushes all current work before the manager records the
blocker, sets the plan `blocked`, and stops.

## Implementation branch

Routine linked-branch creation, commits, and normal pushes are authorized when
the settled `plan-and-implement` run enters phase 5. A plan-only run stops before
phase 5 and never creates a branch.

Immediately after setting the plan `ongoing`, resolve the target repository's
`nameWithOwner` and `defaultBranchRef.name`.

Before any branch checkout, and specifically before any `gh issue develop
--checkout`, require `git status --porcelain` to be empty. If it is dirty, never
stash, move, or commit the ambient work. Set the plan `blocked` and name the
dirty paths, or continue only in an authorized clean worktree.

Pass `--repo <nameWithOwner>` to every `gh issue develop` call. First run
`gh issue develop <issue> --repo <nameWithOwner> --list`. If it reports a
linked branch, verify that branch belongs to the resolved repository, fetch it,
and check it out. Otherwise run
`gh issue develop <issue> --repo <nameWithOwner> --base <default-branch>
--checkout`. After either path, verify that the checked-out branch is the
issue's linked branch.

After any list, create, fetch, or checkout failure, re-run the repository-scoped
`--list`. If it reports a linked branch, verify that branch belongs to the
resolved repository, fetch it, and check it out. If recovery cannot verify and
check out a linked branch, record the blocker, set the plan `blocked`, and stop.
There is no local or unlinked fallback, and implementation never starts on an
unverified branch.

## Landing

After `Code-review: pass`, commit and push any remaining reviewed bytes, then
create or update one pull request carrying `Closes #<issue>` and targeting the
repository default branch. This landing work needs no additional prompt.

Never treat an empty first checks result as success. Retry
`gh pr checks --json name,bucket` at most 12 times with a 10-second delay until
checks appear. If required checks exist, run
`gh pr checks --watch --required`; if CI checks exist but none are required,
run `gh pr checks --watch` to wait for all reported CI. Any failed check blocks
merge. If no checks appear, continue only when repository inspection confirms
that no pull-request CI is configured; otherwise leave the pull request open
with a named no-checks blocker and do not show the merge prompt.

When the checks policy passes and GitHub reports the pull request mergeable,
ask immediately with exactly two options: `Merge now` or
`Leave pull request open`. Merge only on that fresh answer. If the user
declines, or `ask` is unavailable, leave the pull request and the issue open
and report the pull request URL. Never auto-merge, force-push, bypass branch
protection, or merge on a stale or assumed answer.

Immediately before merge, re-read `headRefOid` and `gh pr diff`. If the head SHA
or diff changed, block merge. Invoke `gh pr merge` with
`--match-head-commit <reviewed-head-sha>` and the repository's configured merge
strategy only after the fresh `Merge now` answer.

`plan.mjs archive <issue>` stays a post-merge verifier. It requires the latest
trusted code-review record to pass, with legacy body fallback only when no
trusted code-review comment exists; it verifies the merged closing pull request
and never performs the merge.

```text
BAD: Ask again which repository receives the issue after the preflight
     resolved exactly one.
GOOD: Publish the issue and unchanged review comments to that repository.

BAD: Append review records to `## Review`.
GOOD: Keep the static pointer and post each reviewer block as one issue comment.

BAD: Fall back to a local branch when linked-branch creation fails.
GOOD: Re-list with `--repo`, recover the linked branch, or block before coding.

BAD: Stash, move, or commit dirty ambient work to make branch checkout succeed.
GOOD: Block with the dirty paths or use an authorized clean worktree.

BAD: Leave repaired implementation work uncommitted when review terminates.
GOOD: Commit and push current work to the linked branch before blocking.

BAD: Merge the pull request because the required checks turned green.
GOOD: Ask `Merge now` or `Leave pull request open`, then act on that answer.

BAD: Create the implementation branch only after review passes.
GOOD: Verify the linked branch at implement start; after pass, create or update
      the closing pull request and wait for the merge question.
```
