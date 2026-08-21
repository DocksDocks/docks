# GitHub issue publication

Every canonical plan begins as a GitHub issue. Creating it is a
repository-visible write, so complete this preflight before `plan.mjs new`.
A failed preflight creates no issue and writes nothing:

1. `gh auth status` succeeds.
2. The checkout has a GitHub remote.
3. From that checkout,
   `gh repo view --json nameWithOwner,visibility,defaultBranchRef` resolves the
   exact repository, its visibility, and its default branch.

## Authorization

The settled plan mode authorizes routine creation and update of the plan issue
in the repository that the preflight resolved. Do not ask again for that
publication or show a repository picker that repeats a resolved fact.

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

## Landing

After `Code-review: pass`, the manager runs landing without another prompt:
ensure a non-default branch, commit exactly the reviewed bytes under
`docks:commit-discipline`, push normally, and create or update one pull request
that carries `Closes #<issue>` and targets the repository default branch.

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

`plan.mjs archive <issue>` stays a post-merge verifier: it verifies the merged
closing pull request and never performs the merge.

```text
BAD: Ask again which repository receives the issue after the preflight
     resolved exactly one.
GOOD: Publish to the resolved repository and report its name with the issue
      number.

BAD: Merge the pull request because the required checks turned green.
GOOD: Ask `Merge now` or `Leave pull request open`, then act on that answer.

BAD: Leave the work uncommitted and tell the user to push it.
GOOD: Commit, push, and open the closing pull request, then stop at the merge
      question.
```
