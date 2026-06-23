---
name: plan-manager
description: Use when the user asks to list plans, show/start/block/ship a plan, scaffold a new plan (drafted then self-reviewed), fire scheduled plans, or answer a plan's open questions. Cross-tool management over docs/plans/active + finished — status is a frontmatter field, transitions edit it (git mv only on ship) and auto-commit the .md, with status-specific age tokens + 3 pretty-print tiers. Not for bootstrapping/migrating docs/plans (use plan-init) or verifying finished plans (use plan-review).
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-06-23"
  content_hash: "d68387c6c93c27ba28d9f74e11bdf159fb76e7ebf9628788b1d1f6c4be48ec05"
---

# Plan Manager

Read plans from `docs/plans/active/` + `finished/`, scaffold new ones (drafted
then self-reviewed), transition status, dispatch to assignees, and render
previews so the user never opens a plan file. A plan's lifecycle stage is its
`status:` field; `active/` vs `finished/` is the only directory distinction.

<constraint>
**A new plan is drafted, then self-reviewed, BEFORE it reaches the user.** After writing the draft, red-team it against the rubric in `docs/plans/AGENTS.md` (actionability, dependency order, evidence re-verify, goal coverage, checkable acceptance, failure mode, assumption→question) and the cold-handoff test ("could a fresh agent run this with ONLY this file?"). Fix what you can; turn every remaining guess into an `## Open question`. For a big/risky plan (>6 steps or a risk-flagged step) run the review as a fresh-context subagent. The user sees the already-hole-checked plan, not the raw draft.
</constraint>

<constraint>
**Status is a frontmatter field; `git mv` only on ship.** A transition (`planned→ongoing→blocked→ongoing`, schedule-fire) is a one-line edit of `status:` plus its dated fields — NO `git mv`. Only `→ finished` moves the file (`git mv active/<slug>.md → finished/<YYYY-MM-DD>-<slug>.md`). Never re-create the old `planned/ongoing/blocked/scheduled/` directories.
</constraint>

<constraint>
**Auto-commit the `.md` on every transition.** After a status change (and after ingesting open-question answers), `git add` the plan and commit with a one-line message (`plan(<slug>): <transition>`), so a fresh session/container resumes from committed state. Commit only the plan file(s). The user can amend; never force-push.
</constraint>

## Multi-occupancy + shell-avoidance

`active/` holds any number of plans at any status — never tell the user to finish one first. Use `Glob` for enumeration (not `find`/`ls`/`for`), `Read` for contents (not `cat`), `Grep` for search; reserve `Bash` for `date`, `git mv`/`git add`/`git commit`/`git rm`, `git status`, and read-only `test`.

## Workflow

### Step 1 — Parse intent

| User phrase | Operation |
|---|---|
| "list plans" / "what plans do I have?" | Tier-1 goal listing (all `active/`) |
| "list <status>" / "show ongoing" | filter `active/` by `status:` field; Tier-2 if N>1 |
| "show <slug>" | Tier-3 single-plan preview (search `active/` + `finished/`) |
| "start <slug>" | `status: planned→ongoing`, set `started_at`, dispatch |
| "block <slug>" / "unblock <slug>" | flip `status` + `blocked_*` fields |
| "ship <slug>" | `git mv → finished/`, set `ship_commit`, auto-dispatch plan-review |
| "new plan <slug>" | Step 6 (draft → self-review → open questions) |
| "fire scheduled" | evaluate `scheduled` triggers, offer to fire DUE plans |
| answers to open questions | encode into the plan, remove the questions (Step 6.5) |

### Step 2 — Enumerate (+ deprecation check)

Run `date '+%Y-%m-%dT%H:%M:%S%:z'` once — every age and every timestamp this turn uses this anchor. `Glob("docs/plans/active/*.md")` + `Glob("docs/plans/finished/*.md")`; `Read` each and parse frontmatter (title, goal, **status**, assignee, blocked_*, scheduled_*, created, updated, started_at, ship_commit) + the `## Steps` table.

**Deprecation detection:** if `Glob` also finds `docs/plans/{planned,ongoing,blocked,scheduled}/*.md`, `_views/`, or `index.html`, the project is on the old 5-folder model. STOP and tell the user, offering to run **`plan-init`** to migrate to the two-folder model — do not operate on a mixed layout.

### Step 3 — Derived state

Age tokens are **status-specific** (per `docs/plans/AGENTS.md`): `planned`→`<X> queued` (from `created`), `ongoing`→`<X> in flight` (from `started_at`; `(approx)` from `created` if null), `blocked`→`blocked <X> · waiting on <name>` (from `blocked_since`), `scheduled`→`fires in <X>`/`DUE`/`OVERDUE by <X>` (from `scheduled_date`), `finished`→`shipped <X> ago` (from `updated`). Units: `just now`/`<X>m`/`<X>h`/`<X>d`/`<Y>mo`. Plus `M/N steps` (done/total from the table) and `K mistakes noted`. Optional `stale <X>` for `ongoing` when `now − updated > 3d`.

### Step 4 — Dispatch

```
assignee set?   agent resolves?   action
yes             yes               Agent(subagent_type=<assignee>, prompt=<plan-body>)
yes             no                warn · offer reassign · STOP until confirmed
no              —                 self-execute if scope <5 items, else ask which agent
```

Pass the full plan body as context — it carries the handoff state (`## Steps`, `## Mistakes & Dead Ends`, `## Sources`) that survives auto-compact. An assignee resolves as a project agent (`.claude/agents/<name>.md` / `.codex/agents/<name>.toml`) or a scoped plugin agent (`<plugin>:<name>`); a missing project file alone doesn't prove a scoped name is stale.

### Step 5 — Transition (status edit; git mv only on ship)

`Edit` the frontmatter: set `status`, bump `updated` to the turn anchor, apply transition fields (all timestamps from the one anchor):

- **First `→ ongoing`:** set `started_at` (once; never re-set).
- **`→ blocked`:** set `blocked_reason` + `blocked_since`.
- **`blocked → ongoing`:** clear `blocked_reason`/`blocked_since`; leave `started_at`.
- **`scheduled → ongoing`:** drop `trigger`/`scheduled_date`/`auto_execute`; set `started_at`.
- **`→ finished`:** `git mv active/<slug>.md → finished/<YYYY-MM-DD>-<slug>.md` (date prefix from the anchor), set `ship_commit` (HEAD — ask if unknown; branch-agnostic), bump `updated`. Then Step 8.

Then **auto-commit** (constraint above). `started_at`/`updated` use the same anchor so they round-trip with the displayed age tokens.

```bash
# BAD — v1 muscle memory: move between status folders (they don't exist in v2)
git mv docs/plans/ongoing/x.md docs/plans/blocked/x.md

# GOOD — status is a field: Edit frontmatter (status: blocked + blocked_reason
# + blocked_since), then auto-commit. git mv happens ONLY on ship.
git add docs/plans/active/x.md && git commit -m "plan(x): block on CI"
```

### Step 6 — New plan: draft → self-review → open questions

**Audit-first** (mandatory before writing): open/grep every file the plan will cite — every `file:line` in `## Sources` and `affected_paths` comes from code read THIS session, paired with one-line evidence. Record verbatim user decisions in `## Context`/`## Out of scope`. Proportionality: a parked-idea stub needs only a light audit.

1. Compose `active/<kebab-slug>.md` (no date prefix — status is a field). Frontmatter defaults: `status: planned`, `created`+`updated` = anchor, `started_at: null`, `assignee: null`, `tags: []`, `affected_paths: []`, `related_plans: []`, `review_status: null`. Body = the required spine (`## Goal`, `## Steps`, `## Acceptance criteria`, `## Review` placeholder) plus only the optional sections that carry content.
2. **Self-review the draft — scored + tiered** (the constraint's rubric + cold-handoff). Run the weighted score pass (per `docs/plans/AGENTS.md`), then iterate: **score every plan once; enter the hill-climb iff the first `score < 85` OR the plan is big/risky (>6 steps or a risk flag) OR the user asked for hardening.** Big/risky dispatches the loop to a fresh-context `plan-review` Mode 0 — it RETURNS the rewrite + trajectory and `plan-manager` is the sole writer; everything else runs inline. Fix holes; record the outcome in `## Self-review` as `Score: <n>/100 · trajectory <a→b→…> · stopped: plateau (K=3) | 8-round cap`. Every remaining guess → an `## Open question` (`id`, `choice`/`text`, options with one `(recommended)`).
3. **Surface the open questions** via the native picker — `AskUserQuestion` (Claude Code) / `ask_user_question` (Codex). For a *visual* question (component look, layout, palette), render the options as a self-contained throwaway `.html` (gitignored; hand back the path if headless) instead of describing them.
4. Auto-commit, then render Tier-3.

### Step 6.5 — Ingest open-question answers

Encode each answer into the plan (rationale → `## Context`/`## Notes`; scope → `## Steps`/`## Out of scope`; record the choice verbatim). Remove answered questions (drop the section when empty). Bump `updated`, auto-commit, render Tier-3.

### Step 7 — Render preview (mandatory after Steps 4/5/6)

- **Tier 1** (broad asks): `  <slug>: <goal>` per line, sorted `(status, age desc)`.
- **Tier 2** (`list <status>`, N>1): + assignee + age token + `M/N steps` + `K mistakes noted`.
- **Tier 3** (`show <slug>`, or after any write/ship): header strip (title, goal, status+age, steps, assignee, created date) + body verbatim (omit empty optional sections) + file path.

### Step 8 — Auto-trigger plan-review on `→ finished`

After a ship with `ship_commit` set, dispatch `plan-review` (Claude: `Agent(subagent_type="plan-review", prompt=<plan-path>)`). It writes `## Review` + `review_status`; then re-render Tier-3 and auto-commit. If `ship_commit` is missing, STOP and ask for the SHA first.

## Schedule trigger evaluation (`status: scheduled`)

`trigger: date` fires when `now > scheduled_date`; `manual-approval` fires on user say-so. With `auto_execute: true`, fire silently (Step 5 `→ ongoing` + Step 8); else surface as `DUE`/`OVERDUE` for approval. (No misfire log — a DUE plan simply stays listed until fired.)

## Common traps

| Trap | Right fix |
|---|---|
| `git mv` between `planned/ongoing/blocked/` | Those folders don't exist in v2 — edit the `status:` field; `git mv` only on ship |
| Showing a raw draft to the user | Self-review first (the constraint) — the user sees a hole-checked plan |
| Ending a transition without committing | Auto-commit the `.md` (constraint) so a new session resumes |
| Bare `<X>` age with no context word | Status-specific token (`2d in flight`, `blocked 2d`, …) |
| Re-setting `started_at` on `blocked→ongoing` | Set once, on first `→ ongoing`; leave it after |
| Operating on a 5-folder layout | Deprecation detection (Step 2) — offer plan-init migration first |
| Committing the throwaway visual-question HTML | It's gitignored (`docs/plans/.gitignore`) — never `git add` it |
| Re-invoking `date` per field | One anchor per turn (Step 2) |

## Anti-Hallucination Checks

- Before "shipped", confirm `git mv` exited 0 and `test -f finished/<...>` succeeds.
- Before an `assignee` dispatch, confirm the target resolves; never `Agent()` an unresolved name.
- Ages come from one `date` call at the top of the turn, not memory.
- After every `Edit`, re-`Read` the changed frontmatter line and confirm it applied — `Edit` fails silently on a wrong `old_string`.
- Never report plan-review ran without confirming a `## Review` block + `review_status` ∈ {passed, partial, regressed}.
- If a plan body names a framework/library and the assignee hasn't been invoked this session, instruct it to resolve-library-id → query-docs (context7) before writing code.

## Success Criteria

- Every new plan is self-reviewed before the user sees it; remaining guesses are open questions surfaced via the native picker.
- Every write/transition renders a Tier-1/2/3 preview AND auto-commits the `.md`.
- Status lives only in the `status:` field; `git mv` happens only on ship.
- A 5-folder layout triggers a migration offer, never silent mixed-model operation.
- `started_at` is set exactly once; age tokens are status-specific everywhere.
- plan-review auto-fires on every `→ finished` with `ship_commit` set.

## Staleness check

`docs/plans/AGENTS.md` (written by plan-init) is the per-project source of truth this skill executes against. If it lacks a section this skill relies on (status-as-field, the self-review rubric, open-questions picker, age tokens), offer to refresh it from plan-init — never silently diverge.
