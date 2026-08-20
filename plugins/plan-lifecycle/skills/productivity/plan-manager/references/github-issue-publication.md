# GitHub issue creation

Every canonical plan begins as a GitHub issue. Creating it is a
repository-visible write, so complete this preflight before `plan.mjs new`.
A failure creates no issue and writes nothing:

1. `gh auth status` succeeds.
2. The checkout has a GitHub remote.
3. From that checkout,
   `gh repo view --json nameWithOwner,visibility,defaultBranchRef` resolves the
   exact repository, its visibility, and its default branch.
4. An in-session `ask` confirmation names that exact repository and confirms
   creation of the plan issue there.
5. When the repository is public and the proposed plan names a vulnerability, a
   credential location, or another sensitive finding, a second explicit
   confirmation states that the issue body is public.

When `ask` is unavailable in a subagent, headless run, or `-p` run, do not run
`plan.mjs new`. Report that issue creation is blocked because the exact
repository confirmation could not be obtained. Never substitute a tracked plan
file or create the issue speculatively.

The pull request that lands the work must carry `Closes #<issue>` in its body
and target the repository default branch. Landing is not a lifecycle action or
a Steps row; the user runs it on request, and `plan.mjs archive` only verifies
the resulting merged pull request.
