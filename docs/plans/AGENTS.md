# AGENTS.md — docs/plans/

Tactical work-item tracker. Every non-trivial work item — anything that
takes more than one commit, or whose progress needs to survive an
auto-compact — lives here as a plan file. **Every plan file is a complete
handoff document**: any agent can pick one up cold, without conversation
context, and continue.

The `.md` is the only tracked artifact. There is no committed HTML, no data
file, no dashboard — views are generated on demand (see "On-demand views").
Operations are skill-driven (cross-tool: Codex and Claude both work via
natural language); the skills are also user-invocable directly.

| User says | Skill triggered |
|---|---|
| "create docs/plans", "bootstrap planning", "migrate my plans" | `plan-init` |
| "list plans", "show <slug>", "start/block/ship <slug>", "new plan <slug>", "fire scheduled" | `plan-manager` |
| "review plan <slug>", auto on `→ finished` move | `plan-review` |

## Directory layout

```
docs/plans/
├── AGENTS.md      # this file — rules (cross-tool source of truth)
├── CLAUDE.md      # one-line @AGENTS.md import for Claude Code discovery
├── active/        # every non-finished plan — status lives in frontmatter
└── finished/      # shipped or superseded — terminal archive
```

**Two folders, not five.** A plan's lifecycle stage (`planned` / `ongoing` /
`blocked` / `scheduled`) is the `status:` frontmatter field, not its
directory. A transition is a one-line field edit — **no `git mv`** — until
the plan ships, when its `.md` moves `active/ → finished/` (gaining a date
prefix). Status is stored in exactly one place; the folder only answers
"is this live or archived." Each folder has a `.gitkeep` so it survives empty.

> **Why a field, not a folder:** storing status in both the directory and a
> frontmatter field (the old 5-folder model) meant they could disagree, and
> every minor transition was a `git mv`. Issue trackers use a status field for
> the same reason. `ls active/` is the live list; `plan-manager` renders the
> rich status/age/progress glance on demand.

## Multi-occupancy

`active/` holds an arbitrary number of plans at any status, simultaneously.
There is no "current plan" slot, no cap, no "finish this before starting
another." Parallel work is the default — never block an operation because
other plans exist.

## Frontmatter

Every plan file has frontmatter + body. Base frontmatter:

```markdown
---
title: Short imperative title, ≤70 chars
goal: One-sentence precise summary, ≤200 chars
status: planned | ongoing | blocked | scheduled | finished
created: "2026-06-14T05:09:31+00:00"
updated: "2026-06-14T05:09:31+00:00"
started_at: null
assignee: null | <agent-name>
tags: []
affected_paths: []
related_plans: []
review_status: null
---
```

Status-specific keys are added **only when that status applies** (same
"include it when it carries content" rule as the body):

| Added when | Keys |
|---|---|
| `status: blocked` | `blocked_reason` (names the external actor + input needed), `blocked_since` (ISO datetime) |
| `status: scheduled` | `trigger` (`date` \| `manual-approval`), `scheduled_date` (ISO, required for `date`), `auto_execute` (default `false`) |
| `status: finished` | `ship_commit` (full SHA under review — branch-agnostic) |

All time-valued keys (`created`, `updated`, `started_at`, `blocked_since`,
`scheduled_date`) are **ISO 8601 datetimes with offset**
(`YYYY-MM-DDTHH:MM:SS±HH:MM`), captured once at write time via
`date '+%Y-%m-%dT%H:%M:%S%:z'` — never bare dates. Quote them so the offset
colon doesn't confuse YAML. `started_at` is set ONCE (first move to
`ongoing`) and never re-set. `scheduled` fires when `now > scheduled_date`;
`auto_execute: true` fires silently, else the DUE plan is surfaced for
approval.

## Body — lean spine, optional rest

The required spine is small so a parked idea isn't drowned in empty headings.
Include an optional section only when it carries content.

| Section | Required? | Holds |
|---|---|---|
| `## Goal` | **yes** | what success looks like, why it matters (the expanded `goal:`) |
| `## Steps` | **yes** | the `# / Task / Depends / Status` table; status enum `planned/in-flight/done/blocked/skipped` |
| `## Acceptance criteria` | **yes** | checkable conditions — prefer a command + expected output over a judgment call |
| `## Review` | **yes** (placeholder) | `(filled by plan-review on completion)` until shipped |
| `## Context` | when useful | why now, what it unblocks, verbatim user decisions that constrain the plan |
| `## Out of scope` | when useful | adjacent work explicitly NOT included |
| `## Open questions` | when decisions are pending | see "Open questions" — agent→user residue |
| `## Self-review` | on substantive plans | what the rubric pass caught (see below) |
| `## Mistakes & Dead Ends` | as they happen | append-only: `- **<ISO>**: <tried> → <why it failed> → <how to avoid>` |
| `## Sources` | when it cites code | `file:line` / URL — each paired with the one-line evidence it shows |
| `## Notes` | when useful | design decisions, links |

The first body line repeats the title as `# <Title>`. `plan-review` fills
`## Review` with: `Goal met: yes|partial|no`, `Regressions`, `CI`,
`Follow-ups`, `Filed by`.

## Self-review — drafted plans arrive already hole-checked

Drafting runs in *produce* mode (optimistic, momentum-driven); reviewing runs
in *critique* mode (adversarial, checks each claim). They are different
passes, and verification is easier than generation — so a plan is **drafted,
then red-teamed against the rubric below, before it reaches the user.** This
makes "review each detail and revalidate" automatic. Two question layers:

- **agent → agent** (this rubric): the agent interrogates its own draft and
  fixes what it can. Resolved internally; the user never sees it.
- **agent → user** (`## Open questions`): only the residue that genuinely
  needs a human decision, surfaced as options.

Rubric — run every item before the plan is shown:

| Check | Hole it catches |
|---|---|
| Actionability | every step has a verifiable done-condition — no "improve/handle/clean up X" |
| Dependency order | no step needs the output of a later one; prerequisites exist |
| Evidence re-verify | every cited `file:line` was opened *this session* and says what the step claims |
| Goal coverage | with every step done, is the Goal *actually* met? name the gap |
| Checkable acceptance | criteria are a command + expected output where natural |
| Failure mode | each risky step has a revert trigger / "if this fails, then…" |
| Assumption → question | anything *guessed* becomes an `## Open question`, never a silent default |

Then the meta-frame that catches the rest — the cold-handoff test: *"Could a
fresh agent execute this with ONLY this file? Where would it guess?"* Every
guess → fix it or make it an open question.

**Proportional:** small plans (≤6 steps, no risk flag) get the inline rubric.
Big or risky plans additionally get a **fresh-context subagent review** — a
separate agent can't inherit the author's blind spots. Record what the pass
caught in `## Self-review` (it's a real artifact, not ceremony).

## Open questions — bounded decisions for the user

When a plan's next step needs a human decision, list it under
`## Open questions`: an `id`, a type (`choice` with options — mark one
`(recommended)`, note `custom allowed` — or `text`), and enough context
(inline `code` welcome) to decide without reading the whole plan.

How they're surfaced:

- **Text / discrete choice → native multiple-choice.** In Claude Code, the
  agent asks via the question UI (`AskUserQuestion`); the user just picks. This
  is what makes managing several plans at once cheap.
- **Visual choice** (component look, layout, palette, spacing) → the plan
  *induces the agent to render the options as a self-contained, self-styled,
  throwaway `.html`* and surface it, because seeing beats describing. The HTML
  is ephemeral and gitignored — never a tracked artifact. (Where there's no
  display — headless/remote — the agent hands back the file path or falls back
  to describing.)
- **Headless / no question UI (e.g. Codex)** → the agent prints the questions
  as a numbered text block and reads the user's typed answers. No files.

When answered, the agent encodes each decision into the plan (`## Context` /
`## Notes` / `## Steps`), removes the answered questions, and bumps `updated`.

## Lifecycle transitions

A transition is a frontmatter edit; `plan-manager` **auto-commits the `.md`**
after each one (with a clear message) so a fresh session/container resumes
from committed state — the user can amend.

| Transition | What plan-manager does |
|---|---|
| New plan | Draft + self-review, then `Write` `active/<slug>.md`, `status: planned` (`scheduled` if it has a trigger). `created`+`updated` = now. |
| Start | `status: ongoing`, **set `started_at` (first time only)**, dispatch to assignee. No `git mv`. |
| Block | `status: blocked`, set `blocked_reason` + `blocked_since`. No `git mv`. |
| Unblock | `status: ongoing`, clear `blocked_reason`/`blocked_since`. `started_at` unchanged. |
| Schedule fires | `status: ongoing`, drop scheduled-only keys, set `started_at`, dispatch. |
| Ship | `git mv active/<slug>.md → finished/<YYYY-MM-DD>-<slug>.md`, `status: finished`, bump `updated`, set `ship_commit` (HEAD — branch-agnostic). Auto-dispatch `plan-review`. |
| Supersede | Move to `finished/` with "Superseded by `<slug>`" in `## Notes`. Don't delete. |

## On-demand views

There is no committed dashboard. The view is whichever of these you reach for:

- **`ls active/` / `ls finished/`** — the cheap filesystem index (the *set*).
- **`plan-manager` in chat** — the rich glance, computed live from frontmatter
  (status, age token, `M/N` steps), never stored. This is the dashboard.
- **A throwaway `.html`** — only for *visual* open questions (above), gitignored.

## Pretty-print preview contract

After any agent writes a plan or ships it, it MUST render the file in chat —
never leave the user to open it. Three tiers.

- **Tier 1 — goal-listing** (broad asks: "list plans", "what plans do I
  have?"): `  <slug>: <goal>` per line, sorted by `(status, age desc)`.
- **Tier 2 — bulk listing** ("list ongoing", N>1): adds assignee + the
  category-specific age token + `M/N steps` + `K mistakes noted`.
- **Tier 3 — single-plan** ("show <slug>", or after any write/ship): header
  strip (title, goal, status + age, steps, assignee, created date) + body
  verbatim + footer file path. Empty optional sections are omitted.

### Age tokens (status-specific; bare `X days` is forbidden)

Computed from the frontmatter ISO datetimes against "now" (`date` anchored
once per turn). Numeric component renders at the largest unit ≥ 1: `<60s →
just now`, `<60min → <X>m`, `<24h → <X>h`, `<365d → <X>d`, `≥365d → <Y>mo`.

| Status | Age token | Source field |
|---|---|---|
| `planned` | `<X> queued` | now − `created` |
| `ongoing` | `<X> in flight` (`(approx)` from `created` if `started_at` null) | now − `started_at` |
| `blocked` | `blocked <X> · waiting on <name>` | now − `blocked_since` |
| `scheduled` | `fires in <X>` / `DUE` / `OVERDUE by <X>` | `scheduled_date` − now |
| `finished` | `shipped <X> ago` (`shipped just now` <60s) | now − `updated` |

Optional `stale <X>` flag for `ongoing` when `now − updated > 3 days`. Legacy
date-only frontmatter is treated as `T00:00:00<offset>`.

## Audit-first scaffolding

A plan is only as good as the evidence it cites. Before scaffolding a
substantive plan: open/grep every file you intend to cite (every `file:line`
in `## Sources` and `affected_paths` comes from code read this session, never
memory); pair each Source with one-line evidence; record verbatim user
decisions in `## Context` / `## Out of scope`; prefer executable acceptance
criteria. Proportionality: a 20-line parked-idea stub needs only a light audit.

## Auto-compact resilience

The plan file on disk is the source of truth — it isn't conversation context,
so auto-compact never touches it. Re-read before resuming after a gap; update
the file as you go (not just chat); the `## Steps` table, `## Mistakes & Dead
Ends`, and `## Sources` mean an incoming agent has everything to continue.

## Slugs and naming

`active/<kebab-slug>.md` while in flight (no date prefix — status is a field,
not the filename). On ship, `git mv` to `finished/<YYYY-MM-DD>-<slug>.md` so
the archive sorts chronologically by completion date.

## Migrating an old (5-folder) docs/plans

`plan-init` detects a v1 layout (any of `planned/ongoing/blocked/scheduled/`
dirs, `_views/`, `_assets/`, `index.html`, or a contract that says "status
must match the directory") and migrates it idempotently: move non-finished
plans into `active/` keeping their `status` field, keep `finished/`, `git rm`
the derived artifacts, rewrite this contract, gitignore renders. Re-running on
a v2 layout is a no-op. `plan-manager` surfaces a deprecated layout and offers
the migration rather than operating on a mixed model.

## When to create a plan

Create one for: multi-commit work, work crossing subsystems, work blocked on
external info, anything the user says "plan first", anything time-triggered.
Skip for: single-file tweaks, lint fixes, typos, one-shot ops. Reference docs,
architecture notes, and API contracts belong in skills / agent files / the
root `AGENTS.md`, not here.
