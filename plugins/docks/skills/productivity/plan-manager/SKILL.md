---
name: plan-manager
description: Use when the user asks to list plans, show/resume/start a plan, scaffold a new plan, fire scheduled plans, or check plan status ("what plans do I have?"). Handles cross-tool plan management — scans docs/plans/, computes age tokens, dispatches assignees, evaluates scheduled triggers, scaffolds skeletons, renders three pretty-print tiers (goal-listing, bulk digest, single-plan preview). Not for bootstrapping docs/plans/ (plan-init) or verifying finished plans (plan-review).
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-05-22"
  content_hash: "95bd339d027a9e54c5bd715348cac59cf1921bdcbe0a277ce35d1683e1a30d1f"
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
**Never invent an assignee.** If a plan's `assignee` frontmatter is `null`, ask the user or self-execute — do not pick an agent out of thin air. If `assignee` names an agent that does not exist under the runtime-appropriate agents directory (`.claude/agents/<assignee>.md` for Claude Code, `.codex/agents/<assignee>.toml` for Codex), warn the user (stale assignee), offer to reassign, and only proceed once the user confirms.
</constraint>

<constraint>
**Shell-avoidance.** Use `Glob` for file enumeration (not `find`, `ls`, or shell `for` loops). Use `Read` for file contents (not `cat`/`head`/`tail`). Use `Grep` for content search. Reserve `Bash` for `date`, `git mv`, `git status`, and read-only existence checks (`test -f`, `test -d`). No shell loops, no `$(...)` substitution, no pipes.
</constraint>

<constraint>
**HTML sidecar via the `plan-sidecar` skill.** Every plan `<slug>.md` MAY have a sibling `<slug>.html` (browser view; the .md stays canonical and is the only thing agents read). After every `Write` / `Edit` to a plan AND after every `git mv` between lifecycle directories, invoke the **`plan-sidecar`** skill — sidecar mode for the touched plan, then dashboard mode to refresh `docs/plans/index.html`. Do NOT hand-author the HTML here; `plan-sidecar` owns the standard (shared assets `docs/plans/_assets/{dashboard.css,dashboard.js}`, the `data-*` contract, skip-if-unchanged). NEVER read the .html to answer questions about plan state — the .md is canonical.
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

### Step 2 — Enumerate plans

Run `date '+%Y-%m-%dT%H:%M:%S%:z'` once at the top of the turn to anchor "now" — every age computation in this turn uses this single value.

Use `Glob("docs/plans/<category>/*.md")`. Exclude `.gitkeep`. For each match, `Read` the file and parse YAML frontmatter (title, goal, status, assignee, blockers, blocked_since, scheduled_date, trigger, auto_execute, created, updated, started_at, ship_commit). Parse the body's `## Steps` table and `## Mistakes & Dead Ends` section for derived counts.

### Step 3 — Compute derived state

Age tokens are **category-specific** — bare "X days" is forbidden:

| Category | Age token | Source date |
|---|---|---|
| `planned/` | `<X>d queued` | today − `created` |
| `ongoing/` | `<X>d in flight` | today − `started_at` |
| `blocked/` | `blocked <X>d · waiting on <name>` | today − `blocked_since` |
| `scheduled/` | `fires in <X>d` / `DUE` / `OVERDUE by <X>d` | `scheduled_date` − today |
| `finished/` | `shipped <X>d ago` | today − date from filename prefix |

Plus:
- `M/N steps` — count rows in `## Steps` table; `M` = rows with status `done`, `N` = total rows.
- `K mistakes noted` — count of bullet entries under `## Mistakes & Dead Ends`.
- Optional `stale <X>d` flag for `ongoing/` when `today − updated > 3` days.

If `started_at` is `null` for an ongoing/ plan (legacy or never set), render `<X>d in flight (approx)` using `today − created` — the parenthetical signals the fallback.

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
git mv docs/plans/<old-cat>/<slug>.md docs/plans/<new-cat>/<slug>.md
```

Then `Edit` the file's frontmatter to update `status`, bump `updated`, and apply transition-specific field updates:

- **First move to `ongoing/`** (from `planned/` or `scheduled/`, when `started_at: null`): set `started_at: <today YYYY-MM-DD>`. **Never re-set on later moves.**
- **`ongoing/` → `blocked/`**: set `blocked_since: <today>`, set `blocked_reason: <one-line>`.
- **`blocked/` → `ongoing/`**: clear `blocked_reason` and `blocked_since`. Do NOT touch `started_at`.
- **`scheduled/` → `ongoing/`**: remove scheduled-only keys (`trigger`, `scheduled_date`, `auto_execute`). Set `started_at` if null.
- **`ongoing/` → `finished/`**: rename file to `<YYYY-MM-DD>-<slug>.md` (completion-date prefix), set `ship_commit: <SHA>` (ask user if not known). Then auto-trigger plan-review (Step 8).

### Step 6 — New plan scaffold

When the user says "new plan <slug>" or "scaffold a plan for <slug>":

1. Compose filename: `<YYYYMMDD>-<kebab-slug>.md` using today's date.
2. Ask the user inline for `title` (≤70 chars) and `goal` (≤200 chars) if not provided.
3. `Write` the file at `docs/plans/planned/<filename>` with frontmatter defaults (status: planned, created: today, updated: today, started_at: null, assignee: null, blockers: [], blocked_reason: null, blocked_since: null, ship_commit: null, tags: [], affected_paths: [], related_plans: [], review_status: null).
4. Body has all 12 canonical sections from `docs/plans/AGENTS.md` (`## Goal`, `## Context`, `## Steps`, `## Acceptance criteria`, `## Out of scope`, `## Mistakes & Dead Ends`, `## Sources`, `## Blockers`, `## Notes`, `## Evidence log`, `## Review`). Sections 5–11 have heading + empty body. `## Review` carries the placeholder `(filled by plan-review on completion)`.
5. Render Tier-3 preview so the user sees the scaffold immediately.

### Step 7 — Render preview (mandatory after Steps 4, 5, or 6)

Pick the right tier:

- **Tier 1** — Goal-listing. Triggered by broad asks ("list plans", "what plans do I have?"). Format: `  <slug>: <goal>` per line. Sorted by `(category, age desc)`.
- **Tier 2** — Bulk listing. Triggered by `list <category>` with N > 1. Adds assignee column + category-specific age token + `M/N steps` + `K mistakes noted`.
- **Tier 3** — Single-plan preview. Triggered by `show <slug>`, after any write/move, after a scaffold. Header strip (title, goal, status with age token, steps, assignee, blockers, created) + body verbatim + footer file path.

The header-strip `status` line uses the same category-specific age tokens as Tier 2. Empty optional sections (anything in 6–11 with only the heading) are NOT shown in the body of Tier 3 output.

### Step 7.5 — Refresh the HTML sidecar (after any plan write / move)

After Step 5 (`git mv`) or any `Write` / `Edit` to a plan file, invoke the **`plan-sidecar`** skill — don't hand-author HTML here:

1. **Sidecar mode** — `plan-sidecar <path/to/the-touched-plan.md>` re-authors that plan's `<slug>.html` (it skips the write if the parsed projection is unchanged).
2. **Dashboard mode** — `plan-sidecar dashboard` refreshes `docs/plans/index.html` whenever ANY plan was touched in the turn.

In Claude Code, activate it via the `Skill` tool (`plan-sidecar`); on Codex / other runtimes, follow its `SKILL.md`. `plan-sidecar` owns the standard — shared `_assets/`, the load-bearing `data-*` contract, and per-plan latitude. NEVER read the `.html` back — the .md is canonical.

This step runs BEFORE Step 7 (pretty-print) so the chat preview can mention "sidecar refreshed → docs/plans/<cat>/<slug>.html".

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
| Showing `<X> days` without a contextual word | Bare `2 days` | Category-specific token (`2d in flight`, `2d queued`, `blocked 2d`, etc.) |
| Re-setting `started_at` on `blocked/ → ongoing/` | Bumping `started_at` because plan is "newly ongoing again" | `started_at` is set ONCE; on bounce-back, leave it alone |
| Ending a turn with just a file path after a write | "Created docs/plans/planned/foo.md" with no preview | Always render Tier-1/2/3 — pretty-print is mandatory |
| Inventing an assignee when frontmatter says `null` | Picking the "obvious" agent silently | Ask the user, or self-execute if scope is small (<5 line items) |
| Counting `<X> days` ambiguously when `started_at` is null | Defaulting to `today − created` without flagging | Render `<X>d in flight (approx)` so the user sees it's a fallback |
| Auto-firing a `scheduled/` plan with `auto_execute: false` | Treating "DUE" as permission to fire | DUE means "list for approval"; only `auto_execute: true` fires silently |
| Skipping plan-review on `→ finished/` because `ship_commit` is empty | Calling plan-review with empty SHA | Stop and ask the user for the SHA before moving to finished/ |
| Reading a stale plan body after another agent edited it | Trusting cached content | Re-`Read` the file when re-entering after dispatch |

## Anti-Hallucination Checks

- Before reporting "moved", confirm `git mv` exited 0 and `test -f <new-path>` succeeds.
- Before reporting an `assignee` dispatch, confirm the agent file exists with `Glob` — never `Agent(subagent_type=...)` for a non-existent name.
- Computed ages must come from a single `date` invocation at the top of the turn, not from memory of the current date.
- Never report `DUE` for a scheduled plan without parsing `scheduled_date` and comparing to a freshly-fetched `now`.
- After every `Edit` to a plan file, re-`Read` the affected frontmatter line and confirm the change applied — `Edit` failures are silent if the `old_string` was wrong.
- Never claim plan-review ran without confirming the plan body now contains a `## Review` block AND `review_status` is set to one of `passed` / `partial` / `regressed`.
- If a plan body mentions a framework or library (Next.js, Supabase, React, Tailwind, etc.) AND the assignee has not been invoked in this session, instruct the assignee to **resolve-library-id → query-docs** via context7 before writing code. Training-data drift is the most common failure mode.

## Success Criteria

- Every plan write/move is followed by a Tier-1/2/3 preview — the user never opens the file to know what landed.
- Every plan write/move refreshes the `<slug>.html` sidecar AND `docs/plans/index.html` via the `plan-sidecar` skill. The .md remains canonical and is never out-of-sync with its sidecar.
- No plan in any category is treated as a singleton — multi-occupancy is the default everywhere.
- Schedule triggers evaluate against a freshly-fetched `now`, not a stale conversation timestamp.
- Dispatched assignees receive the full plan body as context so they survive auto-compact.
- Stale `assignee` values trigger a warning and reassignment, never a silent failure.
- `started_at` is set exactly once per plan (first ongoing/ entry), never re-set.
- Plan-review auto-fires on every successful `→ finished/` move with `ship_commit` set.
- Age tokens are category-specific in every output — no bare `X days` anywhere.

## References

- `docs/plans/AGENTS.md` — full convention (frontmatter schema, body sections, lifecycle transitions, pretty-print contract). Created/updated by `plan-init`.
- `plan-init` skill — bootstraps `docs/plans/` directory structure. Use that, not this skill, for first-time setup.
- `plan-review` skill — verifies finished/ plans. Auto-dispatched by Step 8 of this skill; also runs manually via "review plan <slug>".
- `plan-sidecar` skill — authors the `<slug>.html` sidecars + `docs/plans/index.html` dashboard. Invoked by Step 7.5 after every plan touch (this skill never hand-authors the HTML).
- Claude-only thin wrapper `plugins/docks/agents/plan-manager.md` exists for inter-agent dispatch via `Agent(subagent_type="plan-manager", prompt=...)`. Users trigger this skill directly via natural language.
