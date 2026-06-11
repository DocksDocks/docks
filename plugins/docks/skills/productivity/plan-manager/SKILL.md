---
name: plan-manager
description: Use when the user asks to list plans, show/resume/start/ship a plan, scaffold a new plan, fire scheduled plans, check plan status ("what plans do I have?"), or ingest open-question answers (pasted JSON or docs/plans/_open_questions/ files). Cross-tool plan management — scans docs/plans/, computes age tokens, dispatches assignees, evaluates scheduled triggers, audit-gated scaffolds, three pretty-print tiers. Not for bootstrapping docs/plans/ (plan-init) or verifying finished plans (plan-review).
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-06-11"
  content_hash: "c9ec717966b0dcbd702961b795091fbfa589b666d8bd8485f1226f55b0bd8ab6"
---

# Plan Manager

Read plans from `docs/plans/`, scaffold new ones, evaluate scheduled triggers, dispatch work to the right assignee, and render previews so the user never has to open a plan file themselves.

<constraint>
**Every lifecycle directory is multi-occupancy.** `planned/`, `ongoing/`, `blocked/`, `scheduled/`, and `finished/` each hold an arbitrary number of plan files at any time. Never tell the user "you already have an ongoing plan — finish it first." Never block a `git mv` because another plan is already in the destination. Parallel work is the default.
</constraint>

<constraint>
**Pretty-print every plan touch.** After every `Write` or `Edit` to a plan file, AND after every `git mv` between lifecycle directories, render the right pretty-print tier (Tier 1, 2, or 3 — defined below). Never end a plan-touching turn with just a file path — the user must see what landed without opening the file.
</constraint>

<constraint>
**Never invent an assignee.** If a plan's `assignee` frontmatter is `null`, ask the user or self-execute — do not pick an agent out of thin air. An assignee resolves one of two ways: a **project** agent in the runtime-appropriate dir (`.claude/agents/<assignee>.md` for Claude Code, `.codex/agents/<assignee>.toml` for Codex), or a **plugin** agent under a scoped name (`<plugin>:<assignee>`, e.g. `docks:plan-review`) that lives in the plugin install cache, NOT in the project agents dir — so a missing project file alone does not prove a scoped assignee is stale. If neither resolves, warn the user (stale assignee), offer to reassign, and only proceed once the user confirms.
</constraint>

<constraint>
**Shell-avoidance.** Use `Glob` for file enumeration (not `find`, `ls`, or shell `for` loops). Use `Read` for file contents (not `cat`/`head`/`tail`). Use `Grep` for content search. Reserve `Bash` for `date`, `git mv`, `git status`, and read-only existence checks (`test -f`, `test -d`). No shell loops, no `$(...)` substitution, no pipes.
</constraint>

<constraint>
**HTML sidecar via the `plan-sidecar` skill.** Every plan `<slug>.md` MAY have a sidecar at `docs/plans/_views/<basename>.html` (browser view; the .md stays canonical and is the only thing agents read; the basename NEVER changes — on ship only the .md is renamed). After every `Write` / `Edit` to a plan AND after every `git mv` between lifecycle directories, invoke the **`plan-sidecar`** skill — sidecar mode for the touched plan (regenerates the `_views/` file IN PLACE; never `git mv` a sidecar), then dashboard mode to sync `docs/plans/_assets/plans-data.js` (`index.html` is a write-once skeleton — never edit it). Do NOT hand-author the HTML here; `plan-sidecar` owns the standard, and the project's `docs/plans/AGENTS.md` is the per-project source of truth. NEVER read the .html to answer questions about plan state — the .md is canonical.
</constraint>

## Workflow

### Step 1 — Parse user intent

The user message determines category and operation:

| User phrase | Category | Operation |
|---|---|---|
| "list plans" / "any plans?" / "what plans do I have?" | (all non-finished) | Tier-1 goal listing |
| "list <category> plans" / "any plans <category>?" | `<category>` | Tier-2 bulk listing if N>1, else Tier-3 |
| "show <slug>" / "show me the <slug> plan" | (find across all) | Tier-3 single-plan preview |
| "resume <slug>" | `ongoing` | Dispatch to assignee with plan body as context |
| "start <slug>" | `planned` → `ongoing` | Move file, set `started_at`, dispatch to assignee |
| "new plan <slug>" / "scaffold a plan for <slug>" | `planned/` | See Step 6 (new plan scaffold) |
| "fire scheduled" / "check scheduled" | `scheduled` | List + evaluate triggers + offer to fire DUE plans |
| "ship <slug>" | `ongoing` → `finished` | Move, set ship_commit, auto-dispatch plan-review |
| pasted answers JSON / "ingest answers" / answers file found | (find by slug) | Ingest open-question answers (Step 6.5) |

### Step 2 — Enumerate plans

Run `date '+%Y-%m-%dT%H:%M:%S%:z'` once at the top of the turn to anchor "now" (full ISO datetime with offset) — every age computation in this turn uses this single value, and every transition timestamp (`started_at`, `blocked_since`, `updated` bump) is set from this same anchor for consistency within the turn.

Use `Glob("docs/plans/<category>/*.md")`. Exclude `.gitkeep`. For each match, `Read` the file and parse YAML frontmatter (title, goal, status, assignee, blockers, blocked_since, scheduled_date, trigger, auto_execute, created, updated, started_at, ship_commit). Parse the body's `## Steps` table and `## Mistakes & Dead Ends` section for derived counts.

Also `Glob("docs/plans/_open_questions/*.answers.json")` — every match is a pending answers export waiting to be ingested. Surface pending files in any listing output and offer Step 6.5.

### Step 3 — Compute derived state

Age tokens are **category-specific** — bare "X" is forbidden. The numeric component renders at the largest unit ≥ 1: `<60s → just now`, `<60min → <X>m`, `<24h → <X>h`, `<365d → <X>d`, `≥365d → <Y>mo`. Source fields are ISO 8601 datetimes; subtract from the turn anchor.

| Category | Age token | Source field |
|---|---|---|
| `planned/` | `<X> queued` | now − `created` |
| `ongoing/` | `<X> in flight` | now − `started_at` |
| `blocked/` | `blocked <X> · waiting on <name>` | now − `blocked_since` |
| `scheduled/` | `fires in <X>` / `DUE` / `OVERDUE by <X>` | `scheduled_date` − now |
| `finished/` | `shipped <X> ago` (`shipped just now` at <60s) | now − `updated` |

Plus:
- `M/N steps` — count rows in `## Steps` table; `M` = rows with status `done`, `N` = total rows.
- `K mistakes noted` — count of bullet entries under `## Mistakes & Dead Ends`.
- Optional `stale <X>` flag for `ongoing/` when `now − updated > 3 days`.

If `started_at` is `null` for an ongoing/ plan (legacy or never set), render `<X> in flight (approx)` using `now − created` — the parenthetical signals the fallback. If a legacy plan still has a bare date (`2026-05-12`) instead of an ISO datetime, treat it as `T00:00:00<local-offset>` for the math — do not refuse to compute.

### Step 4 — Dispatch decision

```
plan has assignee?            agent file exists?       action
──────────────────────────────────────────────────────────────────────
yes                           yes                      Agent(subagent_type=<assignee>, prompt=<plan-body>)
yes                           no                       Warn user · offer reassign · STOP until confirmed
no                            —                        Self-execute IF scope is small (<5 line items) · else ask user which agent
```

Pass the plan file path AND full body as context so the assignee re-reads the plan. The body itself carries handoff state (`## Mistakes & Dead Ends`, `## Sources`, `## Evidence log`, `## Steps`) — that's the survival mechanism across auto-compact.

### Step 5 — Move file (state transition)

```bash
git mv docs/plans/<old-cat>/<slug>.md docs/plans/<new-cat>/<new-name>.md
# Only the .md moves. <new-name> = <slug>, except on → finished/ where it gains
# the date prefix (see the finished bullet below). The sidecar lives at
# docs/plans/_views/<basename>.html with a STABLE basename — never git mv it;
# Step 7.5 regenerates it in place (new data-status, badge, source link).
```

Then `Edit` the file's frontmatter to update `status`, bump `updated` to the turn-anchor ISO datetime, and apply transition-specific field updates. Every timestamp written in this turn uses the **same** anchor value captured in Step 2 — never re-invoke `date` for individual fields.

- **First move to `ongoing/`** (from `planned/` or `scheduled/`, when `started_at: null`): set `started_at: "<anchor ISO datetime>"`. **Never re-set on later moves.**
- **`ongoing/` → `blocked/`**: set `blocked_since: "<anchor ISO datetime>"`, set `blocked_reason: <one-line>`.
- **`blocked/` → `ongoing/`**: clear `blocked_reason` and `blocked_since` (set both to `null`). Do NOT touch `started_at`.
- **`scheduled/` → `ongoing/`**: remove scheduled-only keys (`trigger`, `scheduled_date`, `auto_execute`). Set `started_at` if null.
- **`ongoing/` → `finished/`**: rename the `.md` to `<YYYY-MM-DD>-<slug>.md` (date-only completion prefix — never a datetime in the filename; the `_views/` sidecar keeps its scaffold basename), set `ship_commit: <SHA>` (ask user if not known). **Branch-agnostic** — `ship_commit` is HEAD on whatever branch you're on; ship from `main` (direct) or from a feature branch (so plan-review runs before the merge). Never require `main`, never switch or create branches — the branch is the user's call. The `updated` bump records the ship-time datetime that `finished/` age tokens read from. Then auto-trigger plan-review (Step 8).

### Step 6 — New plan scaffold

When the user says "new plan <slug>" or "scaffold a plan for <slug>":

**Audit-first gate — mandatory, BEFORE writing the plan file.** A plan is only as good as the evidence it cites:

- Open/grep every file the plan will cite. Every `file:line` in `## Sources` and every `affected_paths` entry must come from code read in THIS session — never from memory of the codebase.
- Pair each Sources entry with one-line evidence of what it shows ("— card renders timestamp only", "— retention parser regex here").
- Record verbatim user decisions that constrain the plan (approvals, declined options like "do not re-propose X") in `## Context` / `## Out of scope`, so future agents don't re-litigate them.
- Prefer executable acceptance criteria (a command + expected outcome) over judgment calls, where natural.
- Proportionality: a small parked-idea stub needs only a light audit — don't let process outweigh a 20-line placeholder plan.

Then scaffold:

1. Compose filename: `<YYYYMMDD>-<kebab-slug>.md` using the **date portion** of the turn anchor (slice the first 10 chars of the ISO datetime, strip the dashes for the prefix). Filenames stay date-only — never datetime — to keep `ls` readable.
2. Ask the user inline for `title` (≤70 chars) and `goal` (≤200 chars) if not provided.
3. `Write` the file at `docs/plans/planned/<filename>` with frontmatter defaults (status: planned, **created: "<anchor ISO datetime>"**, **updated: "<anchor ISO datetime>"**, started_at: null, assignee: null, blockers: [], blocked_reason: null, blocked_since: null, ship_commit: null, tags: [], affected_paths: [], related_plans: [], review_status: null). Quote the datetimes (`created: "..."`) so YAML doesn't mis-parse the offset colon.
4. Body has all 12 canonical sections from `docs/plans/AGENTS.md` (`## Goal`, `## Context`, `## Steps`, `## Acceptance criteria`, `## Out of scope`, `## Mistakes & Dead Ends`, `## Sources`, `## Blockers`, `## Notes`, `## Evidence log`, `## Review`). Sections 5–11 have heading + empty body. `## Review` carries the placeholder `(filled by plan-review on completion)`. When the plan genuinely needs user decisions, add an optional `## Open questions` section between `## Blockers` and `## Notes` — each question carries an `id`, a type (`choice` with options, one of which may be `(recommended)` and `custom allowed`, or `text`), and enough context (inline `code` welcome) to decide without reading the whole plan.
5. Render Tier-3 preview so the user sees the scaffold immediately.

### Step 6.5 — Ingest open-question answers

Trigger: the user pastes an answers JSON (`{ "slug": …, "answers": … }`), or Step 2 found `docs/plans/_open_questions/<basename>.answers.json` (exported from the sidecar's Open questions tab — `file://` pages can't write into the repo, so the user copies or downloads).

1. Locate the plan by slug across categories; `Read` it.
2. For each answered question id, encode the decision into the plan: rationale into `## Context` / `## Notes`, scope changes into `## Steps` rows or `## Out of scope`. Record the user's choice verbatim (e.g. `cadence: quarterly`).
3. Remove the answered questions from `## Open questions` (drop the whole section when none remain); unanswered ids stay — partial ingests are fine. Bump `updated` to the turn anchor.
4. Run Step 7.5 — the sidecar's `#plan-questions` island shrinks or disappears, and the data file's `questions` count updates.
5. Delete the ingested answers file (`git rm` when tracked). Render Tier-3.

### Step 7 — Render preview (mandatory after Steps 4, 5, or 6)

Pick the right tier:

- **Tier 1** — Goal-listing. Triggered by broad asks ("list plans", "what plans do I have?"). Format: `  <slug>: <goal>` per line. Sorted by `(category, age desc)` using the source ISO datetime so same-day plans break ties deterministically.
- **Tier 2** — Bulk listing. Triggered by `list <category>` with N > 1. Adds assignee column + category-specific age token + `M/N steps` + `K mistakes noted`.
- **Tier 3** — Single-plan preview. Triggered by `show <slug>`, after any write/move, after a scaffold. Header strip (title, goal, status with age token, steps, assignee, blockers, created) + body verbatim + footer file path. The header strip's `created` line renders just the date portion (`2026-05-26`) for readability; the full ISO datetime stays in the file.

The header-strip `status` line uses the same category-specific age tokens as Tier 2 (with sub-day `<X>m` / `<X>h` granularity when applicable). Empty optional sections (anything in 6–11 with only the heading) are NOT shown in the body of Tier 3 output.

### Step 7.5 — Refresh the HTML sidecar (after any plan write / move)

After Step 5 (`git mv`) or any `Write` / `Edit` to a plan file, invoke the **`plan-sidecar`** skill — don't hand-author HTML here:

1. **Sidecar mode** — `plan-sidecar <path/to/the-touched-plan.md>` regenerates `docs/plans/_views/<basename>.html` IN PLACE (new `data-status` / badge / source link after a move; it skips the write when the projection is unchanged ignoring time-derived text — never regenerate just to refresh an age token, ages render at view time).
2. **Dashboard mode** — `plan-sidecar dashboard` syncs `docs/plans/_assets/plans-data.js` whenever ANY plan was touched in the turn. `index.html` is a write-once static skeleton — never edited.

In Claude Code, activate it via the `Skill` tool (`plan-sidecar`); on Codex / other runtimes, follow its `SKILL.md`. `plan-sidecar` owns the standard — shared `_assets/`, the load-bearing `data-*` contract, and per-plan latitude. NEVER read the `.html` back — the .md is canonical.

This step runs BEFORE Step 7 (pretty-print) so the chat preview can mention "sidecar refreshed → docs/plans/_views/<basename>.html".

### Step 8 — Auto-trigger plan-review on `→ finished/`

After Step 5 moves a plan to `finished/` AND `ship_commit` is set, immediately dispatch the `plan-review` skill (or Claude agent in Claude Code via `Agent(subagent_type="plan-review", prompt=<plan-path>)`). The Review block gets written, `review_status` set, Tier-3 preview rendered.

If `ship_commit` is missing at the time of the move, stop and ask the user for the SHA — never run plan-review against an empty `ship_commit`.

After plan-review writes the `## Review` block to the .md, Step 7.5 must run AGAIN to refresh the sidecar `.html` with the new review content.

## Schedule trigger evaluation (for `scheduled/` only)

Only two trigger types are supported:

| `trigger` value | Fire condition |
|---|---|
| `date` | `now > scheduled_date` (parse ISO 8601 with offset, compare as Unix timestamps) |
| `manual-approval` | User explicitly says "fire scheduled" or approves a listed DUE plan |

For `trigger: date`, compute `next_fire_age = now - scheduled_date`:

- `next_fire_age < 0` → UPCOMING (Tier-2 shows `fires in <X>d`)
- `next_fire_age ≥ 0` AND `auto_execute: true` → FIRE NOW (Step 5 move + Step 8 plan-review dispatch + Step 7 preview)
- `next_fire_age ≥ 0` AND `auto_execute: false` → DUE (Tier-2 shows `DUE` or `OVERDUE by <X>d`; surface to user for approval; do not fire silently)

If a plan was DUE but didn't fire, append a one-line entry to `docs/plans/scheduled/.misfires.log`: `<ISO timestamp>  <slug>  <reason>`. Never silently drop a misfire.

## Common traps

| Trap | Wrong fix | Right fix |
|---|---|---|
| Showing `<X>` without a contextual word | Bare `2d` | Category-specific token (`2d in flight`, `2d queued`, `blocked 2d`, etc.) |
| Rounding a sub-day delta up to `1d` | `1d in flight` for a 3-hour-old plan | Use `<X>m` / `<X>h` until the delta crosses 24h |
| Writing a bare date into a datetime field | `created: 2026-05-26` | Quote a full ISO datetime — `created: "2026-05-26T17:23:40-03:00"` |
| Re-invoking `date` for each transition field | One anchor per file edit | One anchor per turn (Step 2) — every timestamp in this turn uses it |
| Re-setting `started_at` on `blocked/ → ongoing/` | Bumping `started_at` because plan is "newly ongoing again" | `started_at` is set ONCE; on bounce-back, leave it alone |
| Ending a turn with just a file path after a write | "Created docs/plans/planned/foo.md" with no preview | Always render Tier-1/2/3 — pretty-print is mandatory |
| Inventing an assignee when frontmatter says `null` | Picking the "obvious" agent silently | Ask the user, or self-execute if scope is small (<5 line items) |
| Counting age ambiguously when `started_at` is null | Defaulting to `now − created` without flagging | Render `<X> in flight (approx)` so the user sees it's a fallback |
| Auto-firing a `scheduled/` plan with `auto_execute: false` | Treating "DUE" as permission to fire | DUE means "list for approval"; only `auto_execute: true` fires silently |
| Skipping plan-review on `→ finished/` because `ship_commit` is empty | Calling plan-review with empty SHA | Stop and ask the user for the SHA before moving to finished/ |
| Reading a stale plan body after another agent edited it | Trusting cached content | Re-`Read` the file when re-entering after dispatch |
| Embedding a datetime into the filename | `20260526T172340-foo.md` | Filenames stay date-only — the datetime lives in the frontmatter |
| `git mv`-ing the `_views/` sidecar alongside its `.md` | Carrying the `.html` in the move "to keep them together" | Only the `.md` moves; the sidecar keeps its stable `_views/<basename>.html` path and is regenerated in place (Step 7.5) |
| Scaffolding a plan from memory of the codebase | Writing `file:line` Sources without opening the files | Audit-first gate — every Source / affected_path comes from code read in this session, with one-line evidence |
| Editing a sidecar or `plans-data.js` only to refresh a stale age | Rewriting `6d queued` by hand | Ages render at view time from the ISO datetimes; baked text is the no-JS fallback |

## Anti-Hallucination Checks

- Before reporting "moved", confirm `git mv` exited 0 and `test -f <new-path>` succeeds.
- Before reporting an `assignee` dispatch, confirm the target resolves — a project agent at `.claude/agents/<name>.md` / `.codex/agents/<name>.toml` (Glob-checkable), or a scoped `<plugin>:<name>` plugin agent registered by the runtime's plugin loader (not a project file). Never `Agent(subagent_type=...)` for an unresolved name.
- Computed ages must come from a single `date '+%Y-%m-%dT%H:%M:%S%:z'` invocation at the top of the turn (Step 2), not from memory of the current datetime. Every write in this turn uses that same anchor for `updated`/`started_at`/`blocked_since` so they round-trip cleanly with the displayed age tokens.
- Never report `DUE` for a scheduled plan without parsing `scheduled_date` and comparing to a freshly-fetched `now`.
- After every `Edit` to a plan file, re-`Read` the affected frontmatter line and confirm the change applied — `Edit` failures are silent if the `old_string` was wrong.
- Never claim plan-review ran without confirming the plan body now contains a `## Review` block AND `review_status` is set to one of `passed` / `partial` / `regressed`.
- If a plan body mentions a framework or library (Next.js, Supabase, React, Tailwind, etc.) AND the assignee has not been invoked in this session, instruct the assignee to **resolve-library-id → query-docs** via context7 before writing code. Training-data drift is the most common failure mode.

## Success Criteria

- Every plan write/move is followed by a Tier-1/2/3 preview — the user never opens the file to know what landed.
- Every plan write/move refreshes `docs/plans/_views/<basename>.html` AND `docs/plans/_assets/plans-data.js` via the `plan-sidecar` skill — sidecars never `git mv`'d, `index.html` never edited. The .md remains canonical.
- New plans pass the audit-first gate; ingested answers are encoded into the plan and the answers file is deleted.
- No plan in any category is treated as a singleton — multi-occupancy is the default everywhere.
- Schedule triggers evaluate against a freshly-fetched `now`, not a stale conversation timestamp.
- Dispatched assignees receive the full plan body as context so they survive auto-compact.
- Stale `assignee` values trigger a warning and reassignment, never a silent failure.
- `started_at` is set exactly once per plan (first ongoing/ entry), never re-set.
- Plan-review auto-fires on every successful `→ finished/` move with `ship_commit` set.
- Age tokens are category-specific in every output — no bare `X days` anywhere — and use sub-day units (`<X>m`, `<X>h`) when the delta is below 24 hours.
- Every timestamp field (`created`, `updated`, `started_at`, `blocked_since`) is written as a quoted ISO 8601 datetime with offset; the per-turn anchor is the source for every write in that turn.

## Staleness check (per-project contract)

`docs/plans/AGENTS.md` (written by plan-init) is the per-project source of truth this skill executes against. If it lacks a section this skill relies on (the `_views/` sidecar rules, view-time age tokens, Open questions, audit-first scaffolding), offer to append the missing section from plan-init's template — never silently diverge from the project's own contract.

## References

- `docs/plans/AGENTS.md` — full convention (frontmatter schema, body sections, lifecycle transitions, pretty-print contract); the per-project source of truth. Created/updated by `plan-init` — a contract change in any plan-* skill must land in plan-init's template too.
- `plan-init` skill — bootstraps `docs/plans/` directory structure. Use that, not this skill, for first-time setup.
- `plan-review` skill — verifies finished/ plans. Auto-dispatched by Step 8 of this skill; also runs manually via "review plan <slug>".
- `plan-sidecar` skill — authors the `<slug>.html` sidecars + `docs/plans/index.html` dashboard. Invoked by Step 7.5 after every plan touch (this skill never hand-authors the HTML).
- Claude-only thin wrapper `plugins/docks/agents/plan-manager.md` exists for inter-agent dispatch via `Agent(subagent_type="plan-manager", prompt=...)`. Users trigger this skill directly via natural language.
