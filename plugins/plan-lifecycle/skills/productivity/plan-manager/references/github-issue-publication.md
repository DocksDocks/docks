# GitHub issue publication

Publishing a canonical plan as a GitHub issue is a `publish` effect, so it obeys
the same rule as every non-`local` step: ask first, in this session, naming the
exact repository.

Preflight, in order. A failure at any point creates no issue and writes nothing:

1. The plan exists as a canonical v2 plan and `plan.mjs check` passes on it.
2. `gh auth status` succeeds.
3. The repository has a GitHub remote.
4. `gh repo view --json visibility` returns the visibility.
5. An in-session `ask` confirmation names the exact repository.
6. For a public repository whose plan names a vulnerability, a credential
   location, or another sensitive finding, a second explicit confirmation states
   that the issue body becomes public.

Create the issue from the plan's title and body. Record the returned URL in
`## Review` as one line. Publication changes no status, dispatches no review,
creates no commit, and never makes the issue the source of truth: the markdown
plan under `docs/plans/` stays authoritative.

When `ask` is unavailable — a subagent, headless, or `-p` run — do not publish.
Set the owning step `blocked` with `blocked_reason` naming the unconfirmed
`publish` effect, and report the blocker.
