---
name: plan-manager
description: "Use when a goal may need the six-phase plan flow: decide, draft, research, plan review, implement, code review; an issue-backed canonical plan; or lifecycle handling. Not for workspace setup (use plan-workspace), plan criticism (use plan-reviewer), or code-review agent work."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-08-20"
  content_hash: "9925e479ad988ca1981cefbe9262aa2d1686708397ed0884581dc77f2e779eec"
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
The plan record is a GitHub issue: its body carries the `plan_contract: v2` frontmatter and the eight `##` sections, its `plan:<status>` label mirrors the frontmatter `status`, and no plan markdown is tracked in the repository.
Use the v2 contract in
[`references/plan-contract.md`](references/plan-contract.md) for the exact eight
sections, both table headers, record shapes, and lifecycle transitions. Do not
restate or extend those shapes here.
</constraint>

<constraint>
A step whose `Effect` is not `local` requires an in-session `ask` confirmation immediately before it runs; when `ask` is unavailable the step is set `blocked` with `blocked_reason` naming the unconfirmed effect.
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
   path only for a clear reversible local diff. Otherwise the issue-creation
   preflight blocks canonical planning; do not silently substitute a tracked
   file. State a direct-path assumption in the final report. A direct run
   creates no plan issue.

2. **Draft.** Complete the preflight in
   [`references/github-issue-publication.md`](references/github-issue-publication.md),
   then run
   `plan.mjs new --title <title> --goal <goal> --mode <plan-and-implement|plan-only>`.
   Report the returned issue number. Use the edit flow below to write the full
   outcome and one Mode line in `## Goal`, the hypothesis in `## Research`, and
   provisional `## Steps` and `## Acceptance` tables. Keep status `drafting`.

3. **Research.** Read the record with `plan.mjs export <issue>` into the
   repository's sanctioned, untracked review scratch. The command resolves that
   directory with `git rev-parse --git-path docks-review`, so it is
   `.git/docks-review/` in a plain clone and the worktree-private equivalent in a
   linked worktree, creates it with mode `0700` when missing, writes
   `plan-<issue>.md` there verbatim, and prints the absolute local-file path. Confirm or refute the hypothesis
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
   <local-file>`, then `plan.mjs check <issue>`. Set the plan with
   `plan.mjs status <issue> planned`. Delete the temporary file. Every later
   body edit uses the same export-to-local-file, edit, check, and delete flow.

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

   **Plan-only runs stop here.** Deliver the reviewed issue at `status: planned`.
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

6. **Code review.** Build the review diff from what actually changed: `git status --porcelain` names the paths and the diff covers exactly those. Name every changed path that no Steps `Files` cell mentions in the review request, so the reviewer judges undeclared scope instead of the manager blocking on bookkeeping.

   Resolve the scratch directory with `git rev-parse --git-path docks-review` and
   create it with mode `0700`. Write the review input to
   `<that directory>/<issue>-<round>.diff`. Resolving through git keeps a linked
   worktree working, where `.git` is a file and a literal `.git/` path does not
   exist. The directory is untracked and discarded with the clone. Cover exactly the changed paths with
   `git diff -- <those paths>` and `git diff --cached -- <those paths>`. Add one
   `git diff --no-index /dev/null <path>` hunk for each untracked path.

   Re-export the record before this dispatch too, exactly as in phase 4, so the
   reviewer reads current bytes rather than a stale export.

   Dispatch `code-reviewer` with the absolute diff path, the absolute export
   path, and the issue number. Append its
   report to `## Review` under
   `### Code review round <n> — <UTC date>`. Fix every `CRITICAL` and `HIGH`
   finding. Record each `MEDIUM` and `LOW` finding, then fix it at your judgment.
   Re-review only after fixing a `CRITICAL` or `HIGH`.

   This is a progress guard, not a budget. If a code-review round returns the same finding-id set as the previous round and no file changed between the two rounds, stop, append `Code-review: blocked` naming that set, and set the plan `blocked`.

   When a round returns `Code-review: pass`, report that the work is ready for
   the user's landing actions. Run `plan.mjs archive <issue>` only after the
   user has landed the closing pull request.

## Plan contract

Read [`references/plan-contract.md`](references/plan-contract.md) before creating
or changing a canonical plan. It owns the exact frontmatter, eight sections,
Steps and Acceptance table headers, review records, and closed transitions.
The record has no hashes or permits.
Keep paths repository-relative; acceptance rows run from the repository root.

## Lifecycle CLI

`plan.mjs` is plugin payload, not project payload. It ships inside the installed `plan-lifecycle` plugin at `skills/productivity/plan-manager/scripts/plan.mjs`. A project never vendors, copies, or re-creates it, and an unresolvable tool means the plugin is not installed. Never report it as a file missing from the repository. Resolve it from the loaded `plan-manager` skill directory, or from the runtime plugin cache. Run it with the repository root as the working directory, because it resolves the target repository from that checkout's GitHub remote.

The `plan:` namespace is reserved: `labels --extra` and `new --label` reject a
value that is `plan` or begins `plan:`, so an extra cannot plant a second status
label. Every mutating command refuses a plan owned by another login and claims an
unassigned one in the same write; read-only commands never check ownership.

`archive` verifies the landing pull request with one `gh api graphql` query. A
reference counts only when `mergedAt` is set, `baseRefName` equals the default
branch of that reference's own repository, and the reference is absent from the
`userLinkedOnly: true` set, because a hand-linked merge is not the contract's
`Closes #<issue>`.

| command | behaviour | stdout on success |
|---|---|---|
| `labels [--extra <name>]…` | `gh label create <name> --force` for `plan`, `plan:drafting`, `plan:planned`, `plan:ongoing`, `plan:blocked`, `plan:finished`, and `plan-scheduled`, then each `--extra` | one line per label: `label ready: <name>` |
| `new --title <t> --goal <g> [--mode plan-and-implement\|plan-only] [--label <name>]…` | render the unchanged v2 template body, `gh issue create --title --body-file --label plan --label plan:drafting --assignee @me` (+ extras) | `plan created: #<n> <url>` |
| `claim <issue>` | resolve the acting login, `gh issue edit <n> --add-assignee @me` when unassigned; idempotent for the owner, refuses a foreign owner without writing | `plan #<n> claimed: <login>` |
| `show <issue> [--body]` | header strip on stdout; `--body` puts the record alone on stdout and the header strip on stderr | `#<n> · <status> · <title> · <url>` |
| `export <issue>` | read the issue, resolve the scratch dir with `git rev-parse --git-path docks-review` (so a linked worktree works), create it mode 0700 when missing, write the body verbatim to `plan-<issue>.md` inside it | the absolute export path |
| `edit <issue> --file <path>` | run the 13 checks on the file, refuse on any failure, then replace the body | header strip, then `changed: <k> line(s)` and the changed lines as `-old` / `+new` |
| `check <issue \| --file <path>>` | 13 checks | `plan check passed: #<n>` or `plan check passed: <path>` |
| `status <issue> <status> [--reason <text>]` | validate the transition against the body frontmatter, write body, swap label in the same `gh issue edit` call | `plan #<n> status: <old> -> <new>` |
| `step <issue> <step-id> <status>` | rewrite one Steps `Status` cell | `plan #<n> step <id>: <old> -> <new>` |
| `list [--status <s>]` | `gh issue list --label plan --state all --limit 500 --json number,title,state,labels`; status from the `plan:<status>` label; open issues first, then closed; each group sorted by ascending number | `<status>\t#<n>\t<title>` per line |
| `next` | queue-aware startable plans from `docs/PLAN-QUEUE.md` (`Plan` cell holds the issue number); falls back to every `planned` plan on a missing or malformed queue, warning on stderr | `#<n>` per line |
| `archive <issue>` | require `ongoing`, terminal steps, `Code-review: pass`, and a keyword-linked pull request merged into its repository's default branch; set `finished`, apply `plan:finished`, close the issue | `plan #<n> finished (closed by <pr-url>)` |
| `retire <issue> --reason <text>` | append `## Retirement`, set `finished`, apply `plan:finished`, close as not planned | `plan #<n> retired` |

Every command exits 0 on success and 1 on a usage or validation failure. Failure
messages keep their current wording wherever the check is unchanged.

## Issue creation

Every canonical plan crosses the GitHub issue boundary. Before `plan.mjs new`,
follow
[`references/github-issue-publication.md`](references/github-issue-publication.md).
When its confirmation cannot be obtained, report the blocker and create nothing.

## Reading and writing

Render a plan body verbatim only when the user names that plan and asks to see it. After a write, report the one-line header strip and the changed lines only; a write never re-renders the body.

## Landing

Work lands through a pull request whose body carries `Closes #<issue>` and whose base is the repository default branch, because GitHub interprets a closing keyword only in a pull request that targets the default branch. `plan.mjs archive` verifies that merged pull request rather than performing the merge.

Only the pull request that lands the completed work carries `Closes #<issue>`. A partial pull request carries a plain `Refs #<issue>` instead, because GitHub closes the issue as soon as the first pull request carrying a closing keyword merges into the default branch.

One writer owns a plan issue at a time, recorded in the issue's own GitHub assignee field, never the frontmatter `assignee` key, which stays `null`. `plan.mjs new` claims ownership at creation and `plan.mjs claim <issue>` claims an existing plan. Ownership is a precondition, not advice: every mutating command refuses a plan owned by another login, writes nothing when it refuses, and claims an unassigned plan in the same write. Read-only commands never check ownership. Taking a plan from another owner is a deliberate manual GitHub action; no lifecycle command transfers ownership.

Landing sits outside the six phases. The branch, commits, push, pull request,
and merge are the user's to run, on request, under `docks:commit-discipline`.
No Steps row exists for them; `archive` reads the result rather than causing it.
A plan that never lands is retired, not archived.

## Frozen history

`docs/plans/finished/` is frozen pre-GitHub history. Never read, parse, classify,
or migrate it through this lifecycle. It is not a plan source of truth.

## Git boundary

This lifecycle creates zero commits and never pushes.
Commit when the user asks, under `docks:commit-discipline`.

## BAD / GOOD

```text
BAD: Skip repository research because the draft sounds plausible.
GOOD: Confirm the hypothesis, cite the source, and choose the durable fix.

BAD: Run implementation after a plan-only delivery without a new instruction.
GOOD: Stop at the reviewed planned issue and report its number and verdict.

BAD: Treat repeated review output as permission to loop forever.
GOOD: Stop on identical findings with no changed files and record the block.
```
