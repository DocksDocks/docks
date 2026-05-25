# AGENTS.md — docs/plans/

Tactical work-item tracker. Every non-trivial work item — anything that
takes more than one commit, or whose progress needs to survive an
auto-compact — lives here as a plan file. **Every plan file is a complete
handoff document**: any agent can pick one up cold, without conversation
context, and continue.

Operations are skill-driven (cross-tool: Codex and Claude both work via
natural language). The skills are also user-invocable directly.

| User says | Skill triggered |
|---|---|
| "create docs/plans", "bootstrap planning" | `plan-init` |
| "list plans", "show <slug>", "resume <slug>", "start <slug>", "new plan <slug>", "fire scheduled" | `plan-manager` |
| "review plan <slug>", auto on `→ finished/` move | `plan-review` |

## Directory layout

```
docs/plans/
├── AGENTS.md       # this file — rules (cross-tool source of truth)
├── CLAUDE.md       # one-line @AGENTS.md import for Claude Code discovery
├── planned/        # specced, not started — actionable when picked up
├── ongoing/        # actively being worked on
├── blocked/        # waiting on a specific external input
├── scheduled/      # queued for date- or approval-triggered auto-execution
└── finished/       # shipped
```

A plan is a single `.md` file that moves between directories as its status
changes. Each category has a `.gitkeep` so empty directories survive in git.

## Multi-occupancy — every category, always

**Every lifecycle directory holds an arbitrary number of plans
simultaneously.** There is no "current plan" slot, no per-category cap, no
"finish or block this one before starting another." Parallel work is the
default — multiple ongoing plans, multiple scheduled plans, multiple
blocked plans all coexist. The directory name describes lifecycle stage,
not occupancy.

When `plan-manager` moves a plan between directories, it never checks
whether the destination is "occupied." If three plans are already ongoing
and a fourth moves from `planned/` to `ongoing/`, that's expected, not a
conflict.

## Category semantics

| Category | Why a plan lives here | Who moves it out |
|---|---|---|
| `planned/` | Internal queue — could start tomorrow. | Human picks it up |
| `ongoing/` | At least one assignee is actively working it. | Human or agent, on ship or block |
| `blocked/` | External dependency named in `blocked_reason`. | Human, when external input lands |
| `scheduled/` | Auto-execution queued for date or manual approval. | `plan-manager`, when trigger fires |
| `finished/` | Shipped or superseded — terminal. | (terminal) |

## File conventions

Every plan file has frontmatter + body. Base frontmatter (all categories):

```markdown
---
title: Short imperative title, ≤70 chars
goal: One-sentence precise summary, ≤200 chars
status: planned | ongoing | blocked | scheduled | finished
created: YYYY-MM-DD
updated: YYYY-MM-DD
started_at: null
assignee: null | <agent-name-from-.claude/agents/>
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: null
tags: []
affected_paths: []
related_plans: []
review_status: null
---
```

`started_at` is set ONCE — the first time a plan moves into `ongoing/` —
and never re-set on later bounces. It answers "how long has this plan
been in flight in total."

### `scheduled/` adds three fields

```markdown
---
trigger: date | manual-approval
scheduled_date: "2026-06-01T09:00:00-03:00"   # required when trigger: date
auto_execute: false                            # true → plan-manager fires silently
---
```

`plan-manager` fires the plan when `now > scheduled_date`. With
`auto_execute: false` (default), it lists the DUE plan for user approval
first. With `auto_execute: true`, it moves the file to `ongoing/` and
dispatches to the assignee agent without asking.

### Frontmatter rules

| Key | Rule |
|---|---|
| `title` | Imperative, ≤70 chars, no trailing period. First line of body must repeat as `# Title`. |
| `goal` | One-sentence precise summary of the success state, ≤200 chars. Drives Tier-1 listing. |
| `status` | Must match the containing directory. |
| `created` | Never changes after the file exists. |
| `updated` | Bump to today's date on every substantive edit. |
| `started_at` | Date the plan FIRST moved into `ongoing/`. Set once; never re-set on later moves. `null` until first ongoing/ entry. |
| `assignee` | Name of an agent under `.claude/agents/` (no `.md` suffix). `null` = plan-manager picks or asks. |
| `blockers` | Array of short strings. Empty → actionable immediately. |
| `blocked_reason` | One-line reason naming the external actor + the specific input needed. Required when `status: blocked`. |
| `blocked_since` | Date the plan first moved into `blocked/`. Cleared only when leaving `blocked/`. |
| `ship_commit` | Full SHA once the work lands on `main`. Only populated for `finished/`. |
| `tags` | Free-form labels (e.g., `[migration, security]`) for filtering. Empty by default. |
| `affected_paths` | Files this plan touches. Optional; populates the scope-drift check in plan-review. |
| `related_plans` | Slugs of related/dependent plans. Optional. |
| `review_status` | `null` until plan-review runs; then `passed` / `partial` / `regressed`. |
| `trigger` | `date` or `manual-approval`. Required for `scheduled/`; absent elsewhere. |
| `scheduled_date` | ISO 8601 with offset. Required when `trigger: date`. |
| `auto_execute` | `true` = silent fire; `false` (default) = surface for approval. |

### Body sections (canonical order)

```markdown
# <Title from frontmatter>

## Goal
Detailed and precise — what success looks like, why it matters. The
frontmatter `goal` field is the one-line summary; this section is the
expanded version.

## Context
One short paragraph: why this work, what it unblocks, current state.

## Steps
| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Do X | — | with #2 | planned | backend |
| 2 | Do Y | — | with #1 | planned | supabase |
| 3 | Do Z | 1, 2 | — | planned | frontend |

Status enum: `planned` / `in-flight` / `done` / `blocked` / `skipped`.
Optional `### Step details` block beneath the table for per-row notes.

## Acceptance criteria
Tri-state checkboxes:
- [ ] planned
- [~] in flight (uncommitted scratch)
- [x] shipped — `[x]` is binding, `[~]` is freely toggled.

## Out of scope
Anything adjacent that is NOT in this plan.

## Mistakes & Dead Ends
Append-only journal. One entry per attempt that didn't work:
- **YYYY-MM-DD**: <what was tried> → <why it failed> → <how to avoid>

Empty when nothing's been tried. Incoming agents read this to skip
re-walking known dead ends.

## Sources
URLs and file:line references, each paired with the concept they clarified:
- <URL or file:line> — <which concept it clarified>

## Blockers
Empty, or bulleted list of specific external inputs needed.

## Notes
Design decisions, open questions, related plans.

## Evidence log
Append-only timeline (optional — omit for small plans):
- **<ISO timestamp>** — <event> — <by whom/what>

## Review
(filled by plan-review on completion — leave empty placeholder until shipped)
```

When filled by `plan-review`, the Review section uses this schema:

```markdown
- **Goal met:** yes | partial | no — <one-line reasoning>
- **Regressions:** none | <list with file:line>
- **CI:** <pass | fail + first failing check>
- **Follow-ups:** none | <list of new plan slugs filed>
- Filed by: plan-review on <ISO timestamp>
```

Sections 5–11 must have their heading present but may have empty body.
Section 12 (`## Review`) is a placeholder until `plan-review` fires.

## Lifecycle transitions

| Transition | What plan-manager does |
|---|---|
| New plan | Create in `planned/<YYYYMMDD>-<slug>.md` (or `scheduled/` if it has a trigger). |
| First commit toward plan | `git mv` to `ongoing/`, flip status, bump `updated`, **set `started_at: today` (first time only)**. |
| Block | `git mv ongoing/ → blocked/`, set `blocked_reason`, `blocked_since`. |
| Unblock | `git mv blocked/ → ongoing/`, clear `blocked_reason` and `blocked_since`. `started_at` unchanged. |
| Schedule trigger fires | `git mv scheduled/ → ongoing/`, remove scheduled-only keys, set `started_at`, dispatch to assignee. |
| Ship | `git mv` to `finished/<YYYY-MM-DD>-<slug>.md`, set `status: finished`, paste SHA into `ship_commit`. Auto-dispatches `plan-review`. |
| Supersede | Move to `finished/` with "Superseded by `<slug>`" in Notes. Don't delete. |

## Pretty-print preview contract

After any agent writes a plan or moves it between directories, it MUST
render the file content in chat — never leave the user to open the file.
Three tiers.

### Tier 1 — Goal-listing (default for broad asks)

Triggered by "what plans do I have?", "list plans", or any unscoped ask.
Format: `  <slug>: <goal>` per line. Sorted by `(category, age desc)`.
Category headers shown only when scope crosses categories.

```
Here are the plans:
  w2-whatsapp-send: Wire W2 send so phone numbers flow with no manual reformat
  image-cdn-migration: Migrate image CDN to Cloudflare R2 to drop S3 egress
  auth-rate-limit: Add /auth/login throttle to stop credential stuffing
```

### Tier 2 — Bulk listing (per-category, N > 1)

Triggered by "list <category> plans" with multiple plans in the category.
Adds the assignee column and a category-specific age token (table below).

```
docs/plans/ongoing/ (3)
  20260511-w2-whatsapp-send.md     supabase   Wire W2 send · 2d in flight · 3/5 steps · 1 mistake noted
  20260509-image-cdn-migration.md  null       Migrate CDN to R2 · 4d in flight · 1/4 steps
  20260507-auth-rate-limit.md      backend    /auth/login throttle · 6d in flight · 0/4 steps · stale 4d
```

Derived columns: `M/N steps` (done/total from `## Steps` table) and
`K mistakes noted` (count of `## Mistakes & Dead Ends` bullet entries).

### Tier 3 — Single-plan preview

Triggered by "show <slug>" or after any plan write/move. Header strip +
body verbatim:

```
Created docs/plans/planned/20260511-w2-whatsapp-send.md

  title       Wire W2 send_whatsapp branch
  goal        Wire W2 send so phone numbers flow with no manual reformat
  status      planned (0d queued)
  steps       0/5 done · #1 planned (backend)
  assignee    supabase
  blockers    none
  created     2026-05-11

---

# Wire W2 send_whatsapp branch

(body rendered verbatim — markdown headings render natively)

---

docs/plans/planned/20260511-w2-whatsapp-send.md
```

### Age tokens (category-specific; bare `X days` is forbidden)

Every age token carries a contextual word — never bare numbers, because
"6 days" alone is ambiguous (since creation? in category? since last edit?).

| Category | Age token | Source date | Example |
|---|---|---|---|
| `planned/` | `<X>d queued` | today − `created` | `6d queued` |
| `ongoing/` | `<X>d in flight` | today − `started_at` | `2d in flight` |
| `blocked/` | `blocked <X>d · waiting on <name>` | today − `blocked_since` | `blocked 47d · waiting on Bruno` |
| `scheduled/` | `fires in <X>d` / `DUE` / `OVERDUE by <X>d` | `scheduled_date` − today | `fires in 5d` |
| `finished/` | `shipped <X>d ago` | today − date from filename prefix | `shipped 4d ago` |

Optional `stale <X>d` flag for `ongoing/` when `today − updated > 3` days.
`<X>d` is compact form; ≥365 days renders as `<Y>mo`. If `started_at` is
`null` (legacy plan), fall back to `<X>d in flight (approx)` using `created`.

## Auto-compact resilience

The plan file on disk is the source of truth — it isn't part of
conversation context, so auto-compact never touches it.

- **Re-read before resume** when picking up after a gap.
- **Update as you go** in the file, not just in chat.
- **Don't track state only in chat** — mirror anything important to the plan file.
- **The plan file is a complete handoff document** — `Mistakes & Dead Ends`, `Sources`, `Evidence log`, and the `Steps` table mean an incoming agent (or the same agent after compact) has everything to continue without recap.

## HTML sidecar (browser view)

Every plan `.md` file MAY have a sibling `.html` sidecar in the same
directory — `docs/plans/ongoing/20260511-foo.md` → `docs/plans/ongoing/20260511-foo.html`.
The `.md` remains the source of truth (canonical, agent-readable, git-friendly,
LLM-native). The `.html` is a **derived artifact** for browser analysis only:
collapsible sections, click-to-copy, color-coded status, no token cost in
agent flows because no agent ever reads it.

Shared assets live at:

```
docs/plans/_assets/
├── dashboard.css      # one stylesheet for every sidecar + the dashboard
└── dashboard.js       # toggleable sections, click-to-copy, filter/sort
```

Optionally, `docs/plans/index.html` is a **dashboard** that lists every plan
across categories with filter / sort / search. Same `_assets/`.

### Who authors it

The **`plan-sidecar` skill** (`plugins/docks/skills/productivity/plan-sidecar/`) —
not a generator script. `plan-manager` invokes it after every plan write / `git mv`:
sidecar mode for the touched plan, then dashboard mode for `index.html`. It skips
the write when the parsed projection is unchanged, and never reads the `.html`
back (the `.md` is canonical). The full HTML skeletons live in that skill's
`references/templates.md`; per-plan latitude is allowed within the contract below —
extra visualization is fine as long as every hook still resolves and nothing is inlined.

The .html files can be checked in (so a teammate sees the formatted view
on GitHub or via a static-host link) or gitignored (treat as build
artifact). Both choices are valid; default is checked-in until your
repo's plan count makes the noise tedious. If gitignoring, add to
`.gitignore`:

```
docs/plans/**/*.html
!docs/plans/index.html
!docs/plans/_assets/
```

### The contract (what the css/js depend on)

Path rule: a sidecar in a category dir references `../_assets/…`; `index.html`
references `_assets/…` (no `../`). Sidecars embed the frontmatter as JSON in a
`<script type="application/json" id="plan-data">` island so the JS needn't
re-parse YAML. Age tokens are category-specific (see the table above). Full HTML
skeletons (sidecar + dashboard): the `plan-sidecar` skill's `references/templates.md`.

| Element | Required attribute | Used by css/js for |
|---|---|---|
| `<body>` (sidecar) | `data-status="<category>"` | page-level theming |
| `<body>` (dashboard) | `class="dashboard"` | switches dashboard.js into dashboard mode |
| `<span class="status-badge">` | `data-status="<category>"` | color per lifecycle (planned/ongoing/blocked/scheduled/finished) |
| `<section class="plan-section plan-section--<slug>">` | `data-section="<slug>"` | collapse + tint (mistakes=red, review=green, blockers=amber) |
| `<td class="status">` (in `table.steps`) | `data-status="<step-status>"` | done=green, in-flight=blue, planned=gray, blocked=red, skipped=strike |
| dashboard `<tr>` | `data-status` / `data-assignee` / `data-tags` | row filtering |
| dashboard `<th>` | `data-sort` (+ cell `data-sort-value` for non-text) | column sorting |
| empty `<div class="plan-section__content">` | (empty) | dashboard.js auto-collapses on load |

## Slugs and naming

`<YYYYMMDD>-<kebab-slug>.md` (e.g., `20260511-w2-whatsapp-send.md`). Date
prefix keeps `ls` chronological. On ship, change the prefix to the
completion date: `finished/2026-05-04-auth-rate-limit.md`.

The sidecar `.html` follows the same naming — `finished/2026-05-04-auth-rate-limit.html`.

## When to create a plan

Create a plan for: multi-commit work, work that crosses subsystems, work
blocked on external info, work the user says "plan first", anything
time-triggered. Skip for: single-file tweaks, lint fixes, typo
corrections, one-shot ops tasks.

Reference docs, architecture notes, and API contracts do not belong here
— they belong in `.agents/skills/` (or the tool-specific `.claude/skills/`
equivalent), agent files, or the project's root `AGENTS.md`.

(Template generated by `plan-init` on 2026-05-12T15:00:00-03:00)
