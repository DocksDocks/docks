---
name: plan
description: Use when the user asks "any plans <category>?", "list plans", "show <slug>", "fire scheduled", or "migrate from roadmap". Thin dispatcher over the plan-manager agent. Subcommands — show (render one plan), list (digest of a category), check-scheduled (evaluate triggers + fire DUE), migrate-from-roadmap (one-shot docs/roadmap/ → docs/plans/ migration). Default (no subcommand) behaves like list of all categories.
argument-hint: "[show|list|check-scheduled|migrate-from-roadmap] [slug-or-category]"
allowed-tools: >-
  Read Write Glob Grep Agent
  Bash(date) Bash(git status) Bash(git log:*) Bash(git rev-parse:*)
  Bash(git mv:*) Bash(test:*) Bash(mkdir:*) Bash(touch:*)
---

# Plans

Quick CLI over the `plan-manager` agent. Dispatches to plan-manager for all real work; this command just shapes the invocation.

<constraint>
**Every lifecycle directory is multi-occupancy.** No subcommand may block a state transition because another plan is already in the destination. `planned/`, `ongoing/`, `blocked/`, `scheduled/`, and `finished/` each hold an arbitrary number of plan files. Pass this rule through to plan-manager.
</constraint>

<constraint>
**Pretty-print every plan touch.** plan-manager's output MUST render a preview block after any write or move. Do not let the agent end a turn with only a path. If you see a path-only response, re-prompt for the preview.
</constraint>

<constraint>
**Migration is destructive-ish.** `migrate-from-roadmap` performs `git mv` of every file under `docs/roadmap/` into `docs/plans/`, rewrites frontmatter, and creates the new categories. Before applying, show the migration table and wait for user confirmation. Never run silently.
</constraint>

## Pre-flight context

Environment snapshot (rendered at command-invoke time via Claude Code `!`-injection — no tool calls needed):

- Date: !`date '+%Y-%m-%d %H:%M:%S %Z'`
- Branch: !`git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(not a git repo)"`

Has the plans dir been initialized?

```!
test -d docs/plans && echo "yes — docs/plans/ present" || echo "no — run plan-init first"
```

If the answer is "no", and the user did NOT ask for `migrate-from-roadmap`, surface the missing-init state and stop. Don't auto-bootstrap from a runtime command — that's plan-init's job.

## Phase 1: Dispatch to plan-manager

Parse the first token of `$ARGUMENTS` as the subcommand. Map to a plan-manager invocation:

| Subcommand | `$ARGUMENTS` pattern | plan-manager prompt |
|---|---|---|
| `show <slug>` | `show w2-whatsapp-send` | "Find and render the plan whose slug matches `<slug>` across all lifecycle directories. Use the single-plan preview format from your system prompt." |
| `list [category]` | `list ongoing` or `list` | "List plans in `<category>` (or all categories if absent) using the bulk listing format. Sort by age descending." |
| `check-scheduled` | `check-scheduled` | "Enumerate docs/plans/scheduled/, evaluate each trigger against now, fire any DUE plans with `auto_execute: true`, surface DUE plans with `auto_execute: false` for user approval. Log misfires." |
| `migrate-from-roadmap` | `migrate-from-roadmap` | "Detect docs/roadmap/, migrate every file to docs/plans/ with frontmatter rewrites: add `title`/`assignee`/`blockers` (default `null`/`[]`), preserve `created`/`updated`/`status`, infer `assignee` as `null` (user fills in later). Create missing `blocked/` and `scheduled/` dirs. Show the migration table BEFORE applying. Wait for user confirmation." |
| (empty / unknown) | `` or `foo` | "List a one-line digest per category (planned, ongoing, blocked, scheduled, finished) with counts. Suggest `show <slug>` for full preview." |

Then invoke the `plan-manager` agent via the Agent tool with the mapped prompt, passing through the literal `$ARGUMENTS` string as additional context so plan-manager has the raw user input alongside the structured prompt.

## Usage

```bash
/docks:plan                                    # digest of all 5 categories
/docks:plan list                               # same as above
/docks:plan list ongoing                       # one category
/docks:plan show w2-whatsapp-send              # full preview of one plan
/docks:plan check-scheduled                    # evaluate triggers, fire DUE
/docks:plan migrate-from-roadmap               # one-shot migration from old roadmap/ layout
```

## Notes

- For creating a new plan, write the file directly with `Write` under the right lifecycle directory and let plan-manager render the preview, OR ask plan-manager to draft and write the plan from a short description.
- For setting up `docs/plans/` in a project that doesn't have it, use the `plan-init` skill — not this command.
- The plans convention itself (categories, frontmatter, lifecycle transitions, pretty-print contract) is documented in the project's `docs/plans/CLAUDE.md` after `plan-init` runs.

## Success Criteria

- The right subcommand fires for the user's phrase (show/list/check-scheduled/migrate-from-roadmap, or the default digest).
- plan-manager renders a pretty-print preview after every plan write or move — the user never has to open the file to know what landed.
- Multi-occupancy is preserved: no subcommand blocks a state transition just because another plan already lives in the destination.
- `check-scheduled` evaluates `scheduled_date` against a freshly-fetched `now` and reports DUE / UPCOMING / OVERDUE accurately, never from stale memory.
- `migrate-from-roadmap` shows the migration table before applying and waits for explicit user confirmation — never runs silently.
