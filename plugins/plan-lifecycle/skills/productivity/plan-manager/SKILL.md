---
name: plan-manager
description: "Use when a goal may need the six-phase plan flow: decide, draft, research, plan review, implement, code review; an issue-backed canonical plan; or lifecycle handling. Not for workspace setup (use plan-workspace), plan criticism (use plan-reviewer), or code-review agent work."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-08-24"
  content_hash: "9ba61ce6b78db45126838e43e8dc1c4033f0c6aad29b8eb559e6371ad5a31f18"
---

# Plan Manager

Own one user goal from the mode decision through the final review. Use a canonical
plan when the work needs a durable handoff. Use direct implementation only for a
clear, reversible local change with one bounded acceptance path.

<constraint>
Exactly three skills own the six-phase flow. `plan-workspace` maintains the
workspace. Main-context `plan-manager` decides, drafts, researches, runs the
bounded plan-review and code-review loops, implements, lands, and archives.
Internal `plan-reviewer` returns each read-only pre-implementation verdict.
Main context owns user questions, finding disposition, edits, verification,
review-comment publication, and lifecycle.
</constraint>

<constraint>
The plan record is a GitHub issue. Its body starts with
`<!-- plan-contract: v3 -->`, then a blank line and the exact eight `##`
sections; it has no frontmatter. GitHub owns title, phase, owner, timestamps,
and completion. Use the v3 contract in
[`references/plan-contract.md`](references/plan-contract.md) for the exact body,
table headers, review-comment records, status derivation, and archive
verification. Do not restate or extend those shapes here.
</constraint>

<constraint>
A step whose `Effect` is not `local` requires an in-session `ask` confirmation
immediately before it runs; when `ask` is unavailable the step is set `blocked`
and the first line of `## Open questions` becomes `Blocked: <one-line reason>`
naming the unconfirmed effect. Only a blocked plan may open `## Open questions`
with `Blocked:`.
Routine plan-issue publication, review-comment publication, and the linked
branch, commit, normal-push, and landing actions described below carry the
settled mode's authorization. They are not Steps rows and never need this
confirmation.
</constraint>

## Six-phase flow

1. **Decide.** Phase 1 asks exactly one question with exactly three options, in this order and wording: `Plan and implement now`, `Plan only, stop at planned`, `Implement directly` - and skips the question only when the request already settles the mode.

   The request settles the mode only when the user explicitly asks to plan and
   build, asks for a plan without execution, or asks for a direct fix of one
   clear reversible local diff with one bounded acceptance path. Never use
   `ask` only for permission to begin. Use a plan for multi-commit or
   cross-repository work, a cold handoff, an unresolved decision, a
   cross-subsystem or public-contract change, security-sensitive or
   destructive work, or any non-`local` effect. When `ask` is unavailable,
   take the direct path only for such a clear reversible local diff and state
   that assumption in the final report. A direct run creates no plan issue.

2. **Draft.** Complete the preflight in
   [`references/github-issue-publication.md`](references/github-issue-publication.md).
   The settled mode authorizes the issue write, so ask again only for an
   ambiguous repository or a sensitive public disclosure. Then run
   `plan.mjs new --title <title> --goal <goal> --mode <plan-and-implement|plan-only>`.
   Report the returned issue number. Use the edit flow below to write the full
   outcome and one Mode line in `## Goal`, the hypothesis in `## Research`, and
   provisional `## Steps` and `## Acceptance` tables. Keep status `drafting`. Every plan delivers a durable solution: fix the root cause and complete the cutover in one pass. Temporary fixes, stopgaps, workarounds, and solutions that schedule future maintenance are prohibited unless the user explicitly requested a temporary fix, and the plan records that request in `## Goal` or `## Open questions`. Reviewers treat an unrequested temporary fix as a finding: `goal_fit` in plan review, `Spec` in code review.

3. **Research.** Run `plan.mjs export <issue>`. It resolves the repository's
   sanctioned untracked scratch with `git rev-parse --git-path docks-review`
   (worktree-safe), creates it with mode `0700`, writes the body verbatim to
   `plan-<issue>.md` plus a SHA-256 sidecar `plan-<issue>.md.origin` with mode
   `0600`, and prints the absolute export path. Confirm or refute the
   hypothesis against the repository: read the target files and the nearest
   `AGENTS.md` or `CLAUDE.md`, use the language server before changing an
   exported symbol, and verify every library or external-API claim against
   current official documentation under the fact rule in
   `docks:skill-agent-pipeline` (cite it by name, never by path).

   In the local file, record each finding in `## Research` with a repository
   path and symbol or an official URL. Name the durable fix and the temporary
   fix it replaces in one line. Bind the exact `Files` cells; their union is
   the plan's declared scope. Fill `## Acceptance`. Run
   `plan.mjs edit <issue> --file <local-file>`, then `plan.mjs check <issue>`,
   then `plan.mjs status <issue> planned`, then delete the temporary file and
   its `.origin` sidecar. Every later body edit uses this same flow.

4. **Plan review.** Run at most five rounds. At the start of every round, run
   `plan.mjs export <issue>` and dispatch `plan-reviewer` with the issue number
   and that round's printed export path. A read-only reviewer cannot fetch the
   issue body itself. It returns exactly one markdown block; post that whole
   block unchanged as one issue comment. Never append a review record to
   `## Review`.

   `Plan-review: pass` ends this phase. `Plan-review: repair` names findings to
   reproduce. On rounds 1 through 4, fix every reproduced finding, record the
   evidence for any rejected finding, and require relevant plan bytes to change.
   A repair with no relevant byte change is no progress: record the blocker, set
   the plan `blocked`, and stop. Re-export the repaired body and dispatch a fresh
   review in the next round. If that review repeats any named finding that was
   just repaired, the finding survived its fix: record it, set the plan
   `blocked`, and stop. Never proceed to implementation with repaired bytes that
   no review passed.

   `Plan-review: blocked` identifies a decision only the user can make. Put it
   in `## Open questions` through the edit flow and use `ask`; it is not by
   itself a lifecycle block. If the answer changes the plan, use a fresh
   export and review in the next available round; with no answer, stop at the
   pending user decision.

   A `Plan-review: repair` verdict in round 5 exhausts the ceiling: record the
   blocker, set the plan `blocked`, and stop without an unreviewable
   sixth-round repair. If dispatch fails, retry because no review ran; if the
   same failure signature recurs with no relevant byte change, record it and
   block. When no wrapper is registered, dispatch one fresh read-only subagent
   and name the `plan-reviewer` skill; a missing wrapper never creates another
   role or skips review.

   **Plan-only runs stop here after a pass.** Deliver the issue carrying
   `plan:planned`, report the verdict and issue number, and never create a
   branch or enter phase 5 without a new user instruction. A later session
   resumes by reading the full record with `plan.mjs show <issue> --body`.

5. **Implement.** Run `plan.mjs status <issue> ongoing`, then resolve the target
   repository's `nameWithOwner` and `defaultBranchRef.name`.

   Before any branch checkout, and specifically before any `gh issue develop
   --checkout`, require `git status --porcelain` to be empty. If it is dirty,
   never stash, move, or commit the ambient work. Set the plan `blocked` and
   name the dirty paths, or continue only in an authorized clean worktree.

   Check out the issue's linked branch through the repository-scoped flow in
   the contract reference: pass `--repo <nameWithOwner>` to every
   `gh issue develop` call, reuse a verified linked branch from `--list`, or
   create one with `--base <default-branch> --checkout`, and verify the
   checkout. After any failure, re-list and recover; if recovery cannot verify
   and check out a linked branch, record the blocker, set the plan `blocked`,
   and stop. There is no local or unlinked fallback, and plan-only runs never
   create a branch.

   Branch creation, commits, and normal pushes are routine authorized work
   from this point onward. For each row, run
   `plan.mjs step <issue> <id> in-flight`, implement or delegate, and mark it
   `done` after its proof succeeds, honoring the effect confirmation
   constraint for any non-`local` row. Write self-explaining code under
   `docks:code-clarity`. Run every `## Acceptance` command and write its real
   output into `## Verification Results` through the edit flow.

6. **Code review.** Run at most five rounds. At the start of every round, build
   a fresh review diff from the complete candidate pull request, not only the
   dirty worktree. Resolve and fetch the repository default branch, compute
   `<merge-base>` with `git merge-base <default-remote-ref> HEAD`, and cover one
   net tracked candidate with `git diff <merge-base> -- <changed paths>`. Add one
   `git diff --no-index /dev/null <path>` hunk for each untracked path.
   `git status --porcelain` still names dirty paths. Name every changed path that
   no Steps `Files` cell mentions in the review request.

   Resolve the scratch directory with `git rev-parse --git-path docks-review`
   (mode `0700`; linked-worktree safe, since `.git` may be a file) and write
   each fresh input to `<that directory>/<issue>-<round>.diff`. Re-run
   `plan.mjs export <issue>` in the same round so the reviewer receives the
   fresh absolute diff path, fresh absolute export path, and issue number.

   Dispatch `code-reviewer`. It returns exactly one markdown block; post that
   whole block unchanged as one issue comment. `Code-review: pass` ends the loop
   with no unfixed `CRITICAL` or `HIGH` finding. Record any advisory `MEDIUM` or
   `LOW` lines as follow-up work only after pass, do not change reviewed bytes,
   and never re-review for an advisory.

   `Code-review: fixes-required` names evidenced `CRITICAL` or `HIGH` defects.
   On rounds 1 through 4, fix every named defect. A repair with no relevant byte
   change is no progress and terminates the loop. Build a fresh diff, re-export
   the current plan, and dispatch the next round against the repaired bytes. If
   that review repeats any named defect just repaired, the finding survived its
   fix and terminates the loop. A non-pass verdict in round 5 exhausts the
   ceiling without starting a sixth-round repair.

   `Code-review: blocked` is a technical block caused by unreadable or
   contradictory review input and terminates the loop. For that verdict or any
   terminal repair failure-no progress, a surviving finding, dispatch failure
   with unchanged bytes, or the round-five ceiling-commit all current work,
   including repair bytes, push it normally to the linked plan branch, record
   the blocker, set the plan `blocked`, and stop. Perform the commit and push
   before the blocked lifecycle write so implementation work is never stranded.

   After a pass, commit and push any remaining reviewed bytes, then create or
   update the closing pull request under `## Landing`. Record its `headRefOid`
   and compare the changed paths and hunks from `gh pr diff` with the reviewed
   net candidate. Any mismatch invalidates the pass and blocks merge. Run
   `plan.mjs archive <issue>` only after an approved merge lands that pull
   request.

## Plan contract

Read [`references/plan-contract.md`](references/plan-contract.md) before creating
or changing a canonical plan. It owns the exact v3 marker, eight sections,
Steps and Acceptance table headers, review-comment record shapes and trust,
GitHub-field ownership, derived status truth table, linked-branch flow, and
archive verification. The record has no frontmatter and no hashes or permits.
Keep paths repository-relative; acceptance rows run from the repository root.

## Lifecycle CLI

`plan.mjs` is plugin payload, not project payload. It ships inside the installed `plan-lifecycle` plugin at `skills/productivity/plan-manager/scripts/plan.mjs`. A project never vendors, copies, or re-creates it, and an unresolvable tool means the plugin is not installed. Never report it as a file missing from the repository. Resolve it from the loaded `plan-manager` skill directory, or from the runtime plugin cache. Run it with the repository root as the working directory, because it resolves the target repository from that checkout's GitHub remote.

The `plan:` namespace is reserved: `labels --extra` and `new --label` reject a
value that is `plan` or begins `plan:`. `edit` requires export provenance for
every body change: it refuses a missing sidecar, an unreadable digest, or a
digest from a superseded body revision, and refreshes the digest before the
remote body write. A local sidecar failure fails closed and requires one
re-export; a phase-only status change leaves the body and sidecar valid.

Review state follows the contract: a comment is trusted only when the issue
has exactly one assignee and that assignee authored the well-formed
whole-comment record; the latest trusted record per review kind wins, with a
legacy body verdict used only when no trusted record of that kind exists.
Archive proof rules live in the contract reference.

| command | behaviour | stdout on success |
|---|---|---|
| `labels [--extra <name>]…` | `gh label create <name> --force` for `plan`, `plan:drafting`, `plan:planned`, `plan:ongoing`, and `plan:blocked`, then each `--extra` | one line per label: `label ready: <name>` |
| `new --title <t> --goal <g> [--mode plan-and-implement\|plan-only] [--label <name>]…` | render the v3 marker-based body, `gh issue create --title --body-file --label plan --label plan:drafting --assignee @me` (+ extras) | `plan created: #<n> <url>` |
| `claim <issue>` | resolve the acting login, `gh issue edit <n> --add-assignee @me` when unassigned; idempotent for the owner, refuses a foreign owner without writing | `plan #<n> claimed: <login>` |
| `show <issue> [--body]` | header strip, then per-kind verdicts from latest trusted comments with legacy fallback only when none exists; `--body` puts the record alone on stdout and both metadata lines on stderr | header strip, then `reviews: plan=<pass\|repair\|blocked\|none> code=<pass\|fixes-required\|blocked\|none>` |
| `export <issue>` | `export` writes the body to the worktree-aware `docks-review` directory. It writes its SHA-256 digest to `<file>.origin` with mode `0600`. | the absolute export path |
| `edit <issue> --file <path>` | `edit` runs 13 checks. It requires provenance for the current body. It refreshes the digest before the remote body write. It then replaces the body. | header strip, then `changed: <k> line(s)` and the changed lines as `-old` / `+new` |
| `check <issue \| --file <path>>` | 13 checks | `plan check passed: #<n>` or `plan check passed: <path>` |
| `status <issue> <status> [--reason <text>]` | `status` requires an open issue. It validates and updates its phase label. It keeps a leading `Blocked:` line only for blocked status. | `plan #<n> status: <old> -> <new>` |
| `step <issue> <step-id> <status>` | rewrite one Steps `Status` cell | `plan #<n> step <id>: <old> -> <new>` |
| `list [--status <s>]` | list plan issues and derive status from phase label for open work or from `state` + `stateReason` when closed; open issues first, then closed; each group sorted by ascending number | `<status>\t#<n>\t<title>` per line |
| `next` | queue-aware startable plans from `docs/PLAN-QUEUE.md` (`Plan` cell holds the issue number); falls back to every `planned` plan on a missing or malformed queue, warning on stderr | `#<n>` per line |
| `archive <issue>` | require completed closure, terminal steps, a trusted latest `Code-review: pass` comment (or legacy body pass only when no trusted code record exists), and a merged closing pull request into the target repository's default branch; remove any stale phase label without writing status | `plan #<n> finished (closed by <pr-url>)` |
| `retire <issue> --reason <text>` | close as not planned and remove every phase label; completion derives as `retired` from GitHub | `plan #<n> retired` |

Every command exits 0 on success and 1 on a usage or validation failure.

## Issue publication

Every canonical plan crosses the GitHub issue boundary. Before `plan.mjs new`,
run the preflight in
[`references/github-issue-publication.md`](references/github-issue-publication.md).
The settled plan mode authorizes routine creation and update of the plan issue
in the repository that the preflight resolved. Do not ask again for that
publication or show a repository picker that repeats a resolved fact. The same
authorization covers posting each reviewer's returned block as one unchanged
issue comment. Ask only for an ambiguous repository or a sensitive public
disclosure. When such an ask cannot be obtained, report the blocker and create
nothing.

## Reading and writing

Render a plan body verbatim only when the user names that plan and asks to see it. After a write, report the one-line header strip and the changed lines only; a write never re-renders the body.

## Landing

One writer owns a plan issue at a time, recorded in the issue's own GitHub assignee field. `plan.mjs new` claims ownership at creation and `plan.mjs claim <issue>` claims an existing plan. Ownership is a precondition, not advice: every mutating command refuses a plan owned by another login, writes nothing when it refuses, and claims an unassigned plan in the same write. Read-only commands never check ownership. Taking a plan from another owner is a deliberate manual GitHub action; no lifecycle command transfers ownership.

The linked plan branch, commits, and normal pushes are already routine
authorized work from implement start. The closing pull request carries
`Closes #<issue>` and targets the repository default branch.

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

Only the pull request that lands the completed work carries `Closes #<issue>`;
a partial one carries plain `Refs #<issue>`. A plan that never lands is
retired, not archived.

## Frozen history

`docs/plans/finished/` is frozen pre-GitHub history. Humans may read it as
history, but no lifecycle command or workspace migration operation opens or
inventories it; it is not a lifecycle source of truth.

## Git boundary

Routine linked-branch creation, commits, and normal pushes are in scope from
implement start under `docks:commit-discipline`; the merge itself needs the
fresh `Merge now` answer. Force-push, history rewrite, branch deletion, and
every other destructive Git action stay out of scope without an explicit user
request.

## BAD / GOOD

```text
BAD: Stop a failed code-review loop with repaired work left uncommitted.
GOOD: Before blocking, commit and push all current work to the linked branch.

BAD: Append a reviewer report to the issue body's `## Review` section.
GOOD: Post the reviewer's one markdown block unchanged as one issue comment.

BAD: Wait until a passed review to create the implementation branch.
GOOD: Verify and check out the linked plan branch when phase 5 starts; after a
      pass, create or update the closing pull request and wait for the merge ask.
```
