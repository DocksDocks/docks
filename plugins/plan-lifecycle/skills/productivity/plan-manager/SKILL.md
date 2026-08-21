---
name: plan-manager
description: "Use when a goal may need the six-phase plan flow: decide, draft, research, plan review, implement, code review; an issue-backed canonical plan; or lifecycle handling. Not for workspace setup (use plan-workspace), plan criticism (use plan-reviewer), or code-review agent work."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-08-21"
  content_hash: "0f0f3ca545c47bbd5314402248b3047d6a3e50e3604d4e6fd0da4d7862844d4b"
---

# Plan Manager

Own one user goal from the mode decision through the final review. Use a canonical
plan when the work needs a durable handoff. Use direct implementation only for a
clear, reversible local change with one bounded acceptance path.

<constraint>
Exactly three skills own the six-phase flow. `plan-workspace` maintains the
workspace. Main-context `plan-manager` decides, drafts, researches, dispatches
one plan review, implements, dispatches code review, and archives. Internal
`plan-reviewer` returns the read-only pre-implementation verdict. Main context
owns user questions, finding disposition, edits, verification, and lifecycle.
</constraint>

<constraint>
The plan record is a GitHub issue. Its body starts with
`<!-- plan-contract: v3 -->`, then a blank line and the exact eight `##`
sections; it has no frontmatter. GitHub owns title, phase, owner, timestamps,
and completion. Use the v3 contract in
[`references/plan-contract.md`](references/plan-contract.md) for the exact body,
table headers, record shapes, status derivation, and archive verification. Do
not restate or extend those shapes here.
</constraint>

<constraint>
A step whose `Effect` is not `local` requires an in-session `ask` confirmation
immediately before it runs; when `ask` is unavailable the step is set `blocked`
and the first line of `## Open questions` becomes `Blocked: <one-line reason>`
naming the unconfirmed effect. Only a blocked plan may open `## Open questions`
with `Blocked:`.
Routine plan issue publication and the landing actions in `## Landing` carry
the settled mode's authorization; they are not Steps rows and never need this
confirmation.
</constraint>

## Six-phase flow

1. **Decide.** Phase 1 asks exactly one question with exactly three options, in this order and wording: `Plan and implement now`, `Plan only, stop at planned`, `Implement directly` — and skips the question only when the request already settles the mode.

   The request settles the mode only when the user explicitly asks to plan and
   build, explicitly asks for a plan or proposal without execution, or
   explicitly asks for a direct fix of one clear reversible local diff with one
   bounded acceptance path. Never use `ask` only for permission to begin. Never
   use it to restate scope that the request already gives.

   Use a plan for multi-commit or cross-repository work, a cold handoff, an
   unresolved decision, a cross-subsystem or public-contract change,
   security-sensitive or destructive work, or any non-`local` effect. When
   `ask` is unavailable in a subagent, headless run, or `-p` run, take the direct
   path only for a clear reversible local diff. Otherwise canonical planning
   continues unless an issue-publication safeguard needs an answer; do not
   silently substitute a tracked file. State a direct-path assumption in the
   final report. A direct run creates no plan issue.

2. **Draft.** Complete the preflight in
   [`references/github-issue-publication.md`](references/github-issue-publication.md).
   The settled mode authorizes the issue write, so ask again only for an
   ambiguous repository or a sensitive public disclosure. Then run
   `plan.mjs new --title <title> --goal <goal> --mode <plan-and-implement|plan-only>`.
   Report the returned issue number. Use the edit flow below to write the full
   outcome and one Mode line in `## Goal`, the hypothesis in `## Research`, and
   provisional `## Steps` and `## Acceptance` tables. Keep status `drafting`.

3. **Research.** Run `plan.mjs export <issue>`. The command writes into the
   repository's sanctioned, untracked review scratch. It resolves that directory
   with `git rev-parse --git-path docks-review`. A plain clone uses
   `.git/docks-review/`. A linked worktree gets a worktree-private directory.
   The command creates a missing scratch directory with mode `0700`. It writes the
   body verbatim to `plan-<issue>.md`. It writes the body digest as one lowercase
   SHA-256 line in `plan-<issue>.md.origin`. The sidecar mode is `0600`. The
   command prints the absolute export path. Confirm or refute the hypothesis
   against the repository. Read the target files and the nearest `AGENTS.md` or
   `CLAUDE.md`. Use the language server for definitions and references before
   changing an exported symbol. Verify every library, framework, runtime, or
   external-API claim against current official documentation. Never rely on
   memory. Follow the library and API fact rule in
   `docks:skill-agent-pipeline`; cite that skill by name, never by its repository
   path.

   In the local file, record each finding in `## Research` with a repository
   path and symbol or an official URL. Name the durable fix and the temporary
   fix that it replaces in one line. A patch-over is not ready when a root-cause
   fix is reachable. Bind the exact `Files` cells; their union is the plan's
   declared scope. Fill `## Acceptance`. Run `plan.mjs edit <issue> --file
   <local-file>`. Run `plan.mjs check <issue>`. Set the plan with
   `plan.mjs status <issue> planned`. Delete the temporary file and its `.origin`
   sidecar. Every later body edit uses the same export, edit, check, and delete
   flow.

4. **Plan review.** Dispatch the `plan-reviewer` agent exactly once for every
   canonical plan. Run `plan.mjs export <issue>` first and dispatch the reviewer with the issue number and the printed export path, because a read-only reviewer cannot fetch an issue body itself. Append the verdict and
   findings verbatim to `## Review` under
   `### Plan review — <UTC date>`. Fix every finding that you reproduce. For a
   rejected finding, append one line that states why.

   A `blocked` verdict identifies a decision that only the user can make. Put
   the decision in `## Open questions` and use `ask`. The verdict is not a
   lifecycle block. There is no second review round, no permit, and no repair
   ceiling. If dispatch fails, retry the dispatch because no review ran. If the
   same failure signature recurs and no relevant bytes changed between attempts,
   stop, append `Plan-review: blocked` naming that signature, and set the plan
   blocked. When no wrapper is registered, dispatch one fresh read-only
   subagent. Give it the same three-kind contract by naming the `plan-reviewer`
   skill. A missing wrapper never creates another role and never skips review.

   **Plan-only runs stop here.** Deliver the reviewed issue carrying `plan:planned`.
   Report the verdict and issue number. Do not enter phase 5 without a new user
   instruction. A later session resumes at phase 5 by reading the issue body.

5. **Implement.** Run `plan.mjs status <issue> ongoing`. For each row, run
   `plan.mjs step <issue> <id> in-flight`, implement or delegate the task, and
   run `plan.mjs step <issue> <id> done` after its proof succeeds. Follow the
   effect confirmation constraint before running any non-`local` row.

   Write self-explaining code under `docks:code-clarity`. Prefer domain names to
   vague names. Make invalid states unrepresentable in types. Prefer small named
   functions to narration. Make errors name the operation and subject. Comment
   only when syntax cannot express the reason. Run every `## Acceptance` command
   and write its real output into `## Verification Results` through the edit
   flow.

6. **Code review.** Build the review diff from the complete candidate pull
   request, not only the dirty worktree. Resolve and fetch the repository
   default branch, then compute `<merge-base>` with
   `git merge-base <default-remote-ref> HEAD`. Cover one net tracked candidate
   with `git diff <merge-base> -- <changed paths>`. Add one
   `git diff --no-index /dev/null <path>` hunk for each untracked path.
   `git status --porcelain` still names dirty paths. Name every changed path
   that no Steps `Files` cell mentions in the review request.

   Resolve the scratch directory with `git rev-parse --git-path docks-review`
   and create it with mode `0700`. Write the review input to
   `<that directory>/<issue>-<round>.diff`. Resolving through git keeps linked
   worktrees valid, where `.git` is a file and a literal `.git/` path does not
   exist. The directory is untracked and discarded with the clone.

   After pull-request creation, record `headRefOid` and compare the changed paths
   and hunks from `gh pr diff` with the reviewed net candidate. Any mismatch
   invalidates the pass and blocks merge.

   Re-export the record before this dispatch too, exactly as in phase 4, so the
   reviewer reads current bytes rather than a stale export.

   Dispatch `code-reviewer` with the absolute diff path, the absolute export
   path, and the issue number. Append its
   report to `## Review` under
   `### Code review round <n> — <UTC date>`. A round that returns
   `Code-review: pass` carries no unfixed `CRITICAL` or `HIGH` finding; it may
   still carry advisory `MEDIUM` and `LOW` lines. Record each advisory as a
   follow-up and do not change reviewed bytes after a pass; an advisory never
   triggers a re-review. A round that returns `Code-review: fixes-required`
   names at least one evidenced `CRITICAL` or `HIGH` defect: fix every one of
   them, then dispatch exactly one repair re-review. If that repair re-review
   again returns `fixes-required`, stop: append `Code-review: blocked` naming
   the surviving findings, and set the plan `blocked`.

   A `pass` round ends review and starts landing. Follow `## Landing`. Run
   `plan.mjs archive <issue>` only after an approved merge lands the closing
   pull request.

## Plan contract

Read [`references/plan-contract.md`](references/plan-contract.md) before creating
or changing a canonical plan. It owns the exact v3 marker, eight sections,
Steps and Acceptance table headers, review records, GitHub-field ownership,
derived status truth table, and archive verification. The record has no
frontmatter, hashes, permits, or alternate readable shape.
Keep paths repository-relative; acceptance rows run from the repository root.

## Lifecycle CLI

`plan.mjs` is plugin payload, not project payload. It ships inside the installed `plan-lifecycle` plugin at `skills/productivity/plan-manager/scripts/plan.mjs`. A project never vendors, copies, or re-creates it, and an unresolvable tool means the plugin is not installed. Never report it as a file missing from the repository. Resolve it from the loaded `plan-manager` skill directory, or from the runtime plugin cache. Run it with the repository root as the working directory, because it resolves the target repository from that checkout's GitHub remote.

The `plan:` namespace is reserved: `labels --extra` and `new --label` reject a
value that is `plan` or begins `plan:`, so an extra cannot plant a second status
label. Every mutating command refuses a plan owned by another login and claims an
unassigned one in the same write; read-only commands never check ownership.

`edit` requires export provenance for every body change. It refuses a missing
sidecar, an unreadable digest, or a digest from a superseded body revision.
After validation, `edit` refreshes the digest before the remote body write.
A local sidecar failure fails closed and requires one re-export.
A phase-only status change leaves the body and sidecar valid.

`archive` reads `closedByPullRequestsReferences` with `excludeUserLinked: true`.
A manually linked pull request never proves a landing.

When that connection is empty, `archive` examines only the latest closure.
A commit closer supplies its `associatedPullRequests`.
Any other latest closer supplies no commit fallback proof.
An issue closed by a commit, reopened, then closed by hand has no commit proof.

Every accepted pull request merges into the target repository's default branch.
A commit pushed straight to that branch has no associated merged pull request
and is refused.

| command | behaviour | stdout on success |
|---|---|---|
| `labels [--extra <name>]…` | `gh label create <name> --force` for `plan`, `plan:drafting`, `plan:planned`, `plan:ongoing`, and `plan:blocked`, then each `--extra` | one line per label: `label ready: <name>` |
| `new --title <t> --goal <g> [--mode plan-and-implement\|plan-only] [--label <name>]…` | render the v3 marker-based body, `gh issue create --title --body-file --label plan --label plan:drafting --assignee @me` (+ extras) | `plan created: #<n> <url>` |
| `claim <issue>` | resolve the acting login, `gh issue edit <n> --add-assignee @me` when unassigned; idempotent for the owner, refuses a foreign owner without writing | `plan #<n> claimed: <login>` |
| `show <issue> [--body]` | header strip on stdout; `--body` puts the record alone on stdout and the header strip on stderr | `#<n> · <status> · <title> · <url>` |
| `export <issue>` | `export` writes the body to the worktree-aware `docks-review` directory. It writes its SHA-256 digest to `<file>.origin` with mode `0600`. | the absolute export path |
| `edit <issue> --file <path>` | `edit` runs 13 checks. It requires provenance for the current body. It refreshes the digest before the remote body write. It then replaces the body. | header strip, then `changed: <k> line(s)` and the changed lines as `-old` / `+new` |
| `check <issue \| --file <path>>` | 13 checks | `plan check passed: #<n>` or `plan check passed: <path>` |
| `status <issue> <status> [--reason <text>]` | `status` requires an open issue. It validates and updates its phase label. It keeps a leading `Blocked:` line only for blocked status. | `plan #<n> status: <old> -> <new>` |
| `step <issue> <step-id> <status>` | rewrite one Steps `Status` cell | `plan #<n> step <id>: <old> -> <new>` |
| `list [--status <s>]` | list plan issues and derive status from phase label for open work or from `state` + `stateReason` when closed; open issues first, then closed; each group sorted by ascending number | `<status>\t#<n>\t<title>` per line |
| `next` | queue-aware startable plans from `docs/PLAN-QUEUE.md` (`Plan` cell holds the issue number); falls back to every `planned` plan on a missing or malformed queue, warning on stderr | `#<n>` per line |
| `archive <issue>` | require completed closure, terminal steps, an exact `Code-review: pass` line, and a merged closing pull request into the target repository's default branch; remove any stale phase label without writing status | `plan #<n> finished (closed by <pr-url>)` |
| `retire <issue> --reason <text>` | close as not planned and remove every phase label; completion derives as `retired` from GitHub | `plan #<n> retired` |

Every command exits 0 on success and 1 on a usage or validation failure. Failure
messages keep their current wording wherever the check is unchanged.

## Issue publication

Every canonical plan crosses the GitHub issue boundary. Before `plan.mjs new`,
run the preflight in
[`references/github-issue-publication.md`](references/github-issue-publication.md).
The settled plan mode authorizes routine creation and update of the plan issue
in the repository that the preflight resolved. Do not ask again for that
publication or show a repository picker that repeats a resolved fact. Ask only
for an ambiguous repository or a sensitive public disclosure. When such an ask
cannot be obtained, report the blocker and create nothing.

## Reading and writing

Render a plan body verbatim only when the user names that plan and asks to see it. After a write, report the one-line header strip and the changed lines only; a write never re-renders the body.

## Landing

One writer owns a plan issue at a time, recorded in the issue's own GitHub assignee field. `plan.mjs new` claims ownership at creation and `plan.mjs claim <issue>` claims an existing plan. Ownership is a precondition, not advice: every mutating command refuses a plan owned by another login, writes nothing when it refuses, and claims an unassigned plan in the same write. Read-only commands never check ownership. Taking a plan from another owner is a deliberate manual GitHub action; no lifecycle command transfers ownership.

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

Only the pull request that lands the completed work carries `Closes #<issue>`.
A partial pull request carries plain `Refs #<issue>`. `archive` reads the
merged result rather than causing it. A plan that never lands is retired, not
archived.

## Frozen history

`docs/plans/finished/` is frozen pre-GitHub history. Never read, parse, classify,
or migrate it through this lifecycle. It is not a plan source of truth.

## Git boundary

Routine landing Git work is in scope: branch, commit, push, and pull request
after `Code-review: pass`, under `docks:commit-discipline`. The merge itself
needs the fresh `Merge now` answer. Force-push, history rewrite, branch
deletion, and every other destructive Git action stay out of scope without an
explicit user request.

## BAD / GOOD

```text
BAD: Skip repository research because the draft sounds plausible.
GOOD: Confirm the hypothesis, cite the source, and choose the durable fix.

BAD: Run implementation after a plan-only delivery without a new instruction.
GOOD: Stop at the reviewed planned issue and report its number and verdict.

BAD: Treat a failed repair re-review as permission to dispatch another round.
GOOD: After one repair re-review still returns `fixes-required`, record the
      block and stop.

BAD: Ask a second time which repository receives the plan issue.
GOOD: Publish to the repository the preflight resolved and report it.

BAD: Merge the pull request because the required checks turned green.
GOOD: Ask `Merge now` or `Leave pull request open`, then act on that answer.

BAD: Stop at a passed review and hand the user an uncommitted tree.
GOOD: Commit, push, open the closing pull request, watch the required checks,
      then stop at the merge question.
```
