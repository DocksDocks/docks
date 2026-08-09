---
name: plan-manager
description: "Use when a goal may need the six-phase plan flow: decide, draft, research, plan review, implement, code review; a markdown-only plan; lifecycle handling; or guarded GitHub issue publication. Not for workspace setup (use plan-workspace), plan criticism (use plan-reviewer), or code-review agent work."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-08-09"
  content_hash: "c623f9baa4e6a20fcb0a55766fd74233b052fe8fe668995d042dd91e905ad03c"
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
A canonical plan is a markdown-only record. It has no hashes or permits. Use the
v2 contract in
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
   path only for a clear reversible local diff. Otherwise, plan and implement.
   State this assumption in the final report. A direct run creates no plan file,
   so record nothing. Otherwise, record exactly one line in `## Goal`:
   `Mode: plan-and-implement` or `Mode: plan-only`.

2. **Draft.** Run `plan.mjs new <slug>` with the required title and goal options.
   Write the full outcome in `## Goal`. Write the hypothesis in `## Research`.
   Leave `## Steps` and `## Acceptance` provisional. Keep status `drafting`.

3. **Research.** Confirm or refute the hypothesis against the repository. Read
   the target files and the nearest `AGENTS.md` or `CLAUDE.md`. Use the language
   server for definitions and references before changing an exported symbol.
   Verify every library, framework, runtime, or external-API claim against
   current official documentation. Never rely on memory. Follow the library and
   API fact rule in `docks:skill-agent-pipeline`; cite that skill by name, never
   by its repository path.

   Record each finding in `## Research` with a repository path and symbol or an
   official URL. Name the durable fix and the temporary fix that it replaces in
   one line. A patch-over is not ready when a root-cause fix is reachable. Bind
   the exact `Files` cells; their union is the plan's declared scope. Fill
   `## Acceptance`. Run `plan.mjs check` until it passes. Then run
   `plan.mjs status <slug> planned`.

4. **Plan review.** Dispatch the `plan-reviewer` agent exactly once for every
   canonical plan. Pass the plan path and nothing else. Append the verdict and
   findings verbatim to `## Review` under
   `### Plan review — <UTC date>`. Fix every finding that you reproduce. For a
   rejected finding, append one line that states why.

   A `blocked` verdict identifies a decision that only the user can make. Put
   the decision in `## Open questions` and use `ask`. The verdict is not a
   lifecycle block. There is no second review round, no permit, and no repair
   ceiling. If dispatch fails, retry the dispatch because no review ran. If the same failure signature recurs and no relevant bytes changed between attempts, stop, append `Plan-review: blocked` naming that signature, and set the plan blocked.
   When no wrapper is registered, dispatch one fresh read-only subagent. Give it
   the same three-kind contract by naming the `plan-reviewer` skill. A missing wrapper
   never creates another role and never skips review.

   **Plan-only runs stop here.** Deliver the reviewed plan at `status: planned`.
   Report the verdict and plan path. Do not enter phase 5 without a new user
   instruction. A later session resumes at phase 5 by reading the plan file.

5. **Implement.** Run `plan.mjs status <slug> ongoing`. For each row, run
   `plan.mjs step <slug> <id> in-flight`, implement or delegate the task, and run
   `plan.mjs step <slug> <id> done` after its proof succeeds. Follow the effect
   confirmation constraint before running any non-`local` row.

   Write self-explaining code under `docks:code-clarity`. Prefer domain names to
   vague names. Make invalid states unrepresentable in types. Prefer small named
   functions to narration. Make errors name the operation and subject. Comment
   only when syntax cannot express the reason. Run every `## Acceptance` command
   and paste its real output into `## Verification Results`.

6. **Code review.** Build the review diff from what actually changed: `git status --porcelain` names the paths and the diff covers exactly those. Name every changed path that no Steps `Files` cell mentions in the review request, so the reviewer judges undeclared scope instead of the manager blocking on bookkeeping.

   Create `<repo>/.git/docks-review` with mode `0700`. Write the review input to
   `<repo>/.git/docks-review/<slug>-<round>.diff`. The directory is untracked and
   discarded with the clone. Run `git status --porcelain` to name every changed
   path. Cover exactly those paths with `git diff -- <those paths>` and
   `git diff --cached -- <those paths>`. Add one
   `git diff --no-index /dev/null <path>` hunk for each untracked path.

   Dispatch `code-reviewer` with the diff path and plan path. Append its report
   to `## Review` under `### Code review round <n> — <UTC date>`. Fix every
   `CRITICAL` and `HIGH` finding. Record each `MEDIUM` and `LOW` finding, then
   fix it at your judgment. Re-review only after fixing a `CRITICAL` or `HIGH`.

   This is a progress guard, not a budget. If a code-review round returns the same finding-id set as the previous round and no file changed between the two rounds, stop, append `Code-review: blocked` naming that set, and set the plan `blocked`.

   When a round returns `Code-review: pass`, run `plan.mjs archive <slug>`.

## Plan contract

Read [`references/plan-contract.md`](references/plan-contract.md) before creating
or changing a canonical plan. It owns the exact frontmatter, eight sections,
Steps and Acceptance table headers, review records, and closed transitions.
Keep paths repository-relative; acceptance rows run from the repository root.

## Lifecycle CLI

Run the shipped `plan.mjs` from the repository root.

| Subcommand | Result |
|---|---|
| `new <slug> --title <t> --goal <g> [--mode plan-and-implement\|plan-only]` | Create a drafting plan from the v2 template. |
| `check <slug-or-path>` | Run the 13 byte-level plan checks. |
| `status <slug> <status> [--reason <text>]` | Apply one valid plan-status transition. |
| `step <slug> <step-id> <status>` | Apply one valid Steps-row transition. |
| `list [--status <s>]` | List active and finished plans. |
| `next` | List startable plans with queue-aware ordering. |
| `archive <slug>` | Finish and move an implemented plan after code-review pass. |
| `retire <slug> --reason <text>` | Record abandonment and archive a non-finished v2 plan. |

`check` success prints `plan check passed: <path>`. Every command exits 0 on
success and 1 on a usage or validation failure.

## GitHub issue publication

Use [`references/github-issue-publication.md`](references/github-issue-publication.md)
for publication preflights, confirmation, and recording rules.

## Legacy plans

A plan carrying a `Plan-run:` line is a v1 plan. Render it, never parse or
migrate it, and finish it by hand as described in the `plan-workspace` skill.

## Git boundary

This lifecycle creates zero commits and never pushes.
Commit when the user asks, under `docks:commit-discipline`.

## BAD / GOOD

```text
BAD: Skip repository research because the draft sounds plausible.
GOOD: Confirm the hypothesis, cite the source, and choose the durable fix.

BAD: Run implementation after a plan-only delivery without a new instruction.
GOOD: Stop at the reviewed planned record and report its path and verdict.

BAD: Treat repeated review output as permission to loop forever.
GOOD: Stop on identical findings with no changed files and record the block.
```
