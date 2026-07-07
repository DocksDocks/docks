---
name: plan-manager
description: Use when the user asks to list plans, show/start/block/ship a plan, scaffold a new plan (drafted then self-reviewed), fire scheduled plans, or answer a plan's open questions. Cross-tool management over docs/plans/active + finished — status is a frontmatter field, transitions edit it (git mv only on ship) and auto-commit the .md, with status-specific age tokens + 3 pretty-print tiers. Not for bootstrapping/migrating docs/plans (use plan-init) or verifying finished plans (use plan-review).
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-07-06"
  content_hash: "e7de8c74097e8323c3bd1bf7f6124b94532be790405aa18eca83880563874597"
---

# Plan Manager

Read plans from `docs/plans/active/` + `finished/`, scaffold new ones (drafted
then self-reviewed), transition status, dispatch to assignees, and render
previews so the user never opens a plan file. A plan's lifecycle stage is its
`status:` field; `active/` vs `finished/` is the only directory distinction.

<constraint>
**A new plan is drafted, then self-reviewed, BEFORE it reaches the user.** After writing the draft, red-team it against the scored rubric in `docs/plans/AGENTS.md` (standalone executability 22 — the largest weight — actionability, dependency order, evidence re-verify, goal coverage, executable acceptance, failure mode, assumption→question) AND walk the **cold-handoff checklist**, the binary required-content gate (file manifest with exact paths, environment & commands with flags, interface/data contracts, executable acceptance, out-of-scope, decision rationale, known gotchas, global constraints verbatim, no undefined/forward terms) — each item present & specific or a *justified* `N/A — reason` (a generic N/A scores as a miss). Then an **adversarial cold-read**: read ONLY this file and enumerate every decision it doesn't answer; each is a defect. Fix what you can; turn every remaining guess into an `## Open question` (`NEEDS CLARIFICATION` for true unknowns). For a big/risky plan (>6 steps or a risk-flagged step), use a fresh-context `plan-review` agent only when it resolves and explicit delegation/policy allows it; otherwise run the review inline. The user sees the already-hole-checked plan, not the raw draft.
</constraint>

<constraint>
**Status is a frontmatter field; `git mv` only on ship.** A transition (`planned→ongoing→blocked→ongoing`, schedule-fire) is a one-line edit of `status:` plus its dated fields — NO `git mv`. Only `→ finished` moves the file (`git mv active/<slug>.md → finished/<YYYY-MM-DD>-<slug>.md`). Never re-create the old `planned/ongoing/blocked/scheduled/` directories.
</constraint>

<constraint>
**Auto-commit the `.md` on every transition.** After a status change (and after ingesting open-question answers), `git add` the plan and commit with a one-line message (`plan(<slug>): <transition>`), so a fresh session/container resumes from committed state. Commit only the plan file(s). The user can amend; never force-push.
</constraint>

<constraint>
**Unresolved `## Open questions` → the native picker, on every render.** Whenever you present or render a plan that still carries `## Open questions` (Tier-3, after ANY write/transition — not only at new-plan scaffold), surface each through `AskUserQuestion` (Claude) / `ask_user_question` (Codex) in the SAME turn. Never leave them as prose for the user to answer in free text; then ingest (Step 6.5) and re-render.
</constraint>

<constraint>
**Cross-tool second opinion is optional, picker-gated, and read-only.** On `start <slug>`, explicit `cross-check <slug>`, and Step 8 completion-review dispatch, first check whether the alternate reviewer is available. In a Claude-side run, available means `command -v codex` succeeds AND `codex login status` exits 0; if either fails, skip silently with no offer and no codex mention. When available, ask through the native picker before running the one-shot read-only leg. The reviewer never writes plan files; `plan-manager` remains the sole writer for draft `## Self-review` ingestion.
</constraint>

## Multi-occupancy + shell-avoidance

`active/` holds any number of plans at any status — never tell the user to finish one first. Use `Glob` for enumeration (not `find`/`ls`/`for`), `Read` for contents (not `cat`), `Grep` for search; reserve `Bash` for `date`, `git mv`/`git add`/`git commit`/`git rm`, `git status`, read-only `test`, and — solely for the cross-tool second opinion — the availability probes (`command -v`, `codex login status`) plus the pinned one-shot reviewer legs.

## Optional cross-tool second opinion

Offer this only after the availability gate passes. Use neutral picker wording such as "Include a cross-tool second opinion before proceeding?" with yes/no choices; declining changes nothing. Accepting runs a one-shot reviewer and then `plan-manager` ingests accepted findings into the plan with attribution before the lifecycle step continues. As of 2026-07, the recommended Codex leg is pinned below; check the current model tier list before changing it, but never inherit an ambient model or effort setting.

```bash
timeout 600 codex exec -s read-only -m gpt-5.5 -c model_reasoning_effort=xhigh -- \
  "You are an independent plan reviewer red-teaming a draft before execution. Read <plan path> fully, plus any file it cites in affected_paths. Red-team it: (1) missed failure modes, wrong assumptions, cheaper alternatives; (2) steps whose done-condition is vague or unverifiable; (3) anything a cold executor with only this file would have to guess. Do NOT rewrite the plan. Return a numbered findings list — severity (high/med/low), section, one-sentence defect, one-sentence fix — and end with a one-line verdict."
```

This block is the draft-review leg. The completion-review leg (different rubric — it judges the diff against the goal, never the draft rubric) and the reverse Codex-runtime leg are pinned in plan-review's `## Cross-tool second opinion`. The `timeout 600` prefix needs GNU coreutils (absent on stock macOS): drop the prefix there and enforce the same 600-second budget with the runtime's own command timeout.

Attributed ingest format:

```markdown
Cross-check (<YYYY-MM-DD>): [codex <model> <effort>] <N> findings (<sev breakdown>) — <accepted count> accepted, <rejected count> rejected (one-line reason each); [claude] independently verified <finding ids> against source before accepting.
DISAGREEMENT: <topic> — [codex] <position> / [claude] <position>. Kept: <choice> — decided by <the orchestrating agent | user via picker>, because <one line>.
```

- Draft reviews: these lines append inside `## Self-review`. Completion reviews: a `- **Cross-check:** …` bullet inside the `## Review` block (same line grammar).
- Finding ids are the alternate reviewer's own list numbers — its numbered list is the id space; no separate scheme.
- In a Codex runtime the tags swap: `[claude <model> <effort>]` is the reviewer, `[codex] independently verified …` the orchestrator.
- **Reconciliation rule**: both positions are always retained and attributed; a disagreement is never silently dropped or averaged. The orchestrating agent decides and names itself; if the disagreement changes scope, behavior, or a user-made decision, it escalates via the native picker instead.

STOP conditions:

- Codex leg errors, times out (600s), or returns unparseable output AFTER the user accepted → record `Cross-check attempted <date>: codex leg failed (<one-line reason>)` in the plan, continue with the Claude-only review, and NEVER block the lifecycle transition on the failed leg.
- Same rule mirrored for the reverse (claude) leg in a Codex runtime.
- `codex login status` non-zero at offer time → no offer, no error, no codex mention (silent skip is the designed path, not a failure).

## Workflow

### Step 1 — Parse intent

| User phrase | Operation |
|---|---|
| "list plans" / "what plans do I have?" | Tier-1 goal listing (all `active/`) |
| "list <status>" / "show ongoing" | filter `active/` by `status:` field; Tier-2 if N>1 |
| "show <slug>" | Tier-3 single-plan preview (search `active/` + `finished/`) |
| "start <slug>" | `status: planned→ongoing`, set `started_at`, dispatch |
| "cross-check <slug>" | availability-gated cross-tool second opinion; ingest attributed findings into `## Self-review` without changing status |
| "block <slug>" / "unblock <slug>" | flip `status` + `blocked_*` fields |
| "ship <slug>" | gate on `review_status: passed`, `git mv → finished/`, set `ship_commit` (no re-dispatch) |
| "complete <slug>" / all `## Steps` `done` | `status: → in_review`, set `in_review_since`, auto-dispatch completion review |
| "new plan <slug>" | Step 6 (draft → self-review → open questions) |
| "fire scheduled" | evaluate `scheduled` triggers, offer to fire DUE plans |
| answers to open questions | encode into the plan, remove the questions (Step 6.5) |

### Step 2 — Enumerate (+ deprecation check)

Run `date '+%Y-%m-%dT%H:%M:%S%:z'` once — every age and every timestamp this turn uses this anchor. `Glob("docs/plans/active/*.md")` + `Glob("docs/plans/finished/*.md")`; `Read` each and parse frontmatter (title, goal, **status**, assignee, blocked_*, scheduled_*, created, updated, started_at, ship_commit) + the `## Steps` table.

**Deprecation detection:** if `Glob` also finds `docs/plans/{planned,ongoing,blocked,scheduled}/*.md`, `_views/`, or `index.html`, the project is on the old 5-folder model. STOP and tell the user, offering to run **`plan-init`** to migrate to the two-folder model — do not operate on a mixed layout.

### Step 3 — Derived state

Age tokens are **status-specific** (per `docs/plans/AGENTS.md`): `planned`→`<X> queued` (from `created`), `ongoing`→`<X> in flight` (from `started_at`; `(approx)` from `created` if null), `blocked`→`blocked <X> · waiting on <name>` (from `blocked_since`), `scheduled`→`fires in <X>`/`DUE`/`OVERDUE by <X>` (from `scheduled_date`), `in_review`→`<X> in review` (from `in_review_since`), `finished`→`shipped <X> ago` (from `updated`). Units: `just now`/`<X>m`/`<X>h`/`<X>d`/`<Y>mo`. Plus `M/N steps` (done/total from the table) and `K mistakes noted`. Optional `stale <X>` for `ongoing` when `now − updated > 3d`.

### Step 4 — Dispatch

```
assignee set?   agent resolves?   action
yes             yes               dispatch via current runtime only when delegation is allowed (`Agent(subagent_type=…)` on Claude; Codex custom-agent handoff when available)
yes             no                warn · offer reassign · STOP until confirmed
no              —                 self-execute if scope <5 items, else ask which agent
```

Pass the full plan body as context — it carries the handoff state (`## Steps`, `## Mistakes & Dead Ends`, `## Sources`) that survives auto-compact. An assignee resolves as a project agent (`.claude/agents/<name>.md` / `.codex/agents/<name>.toml`) or a scoped plugin agent (`<plugin>:<name>`); a missing project file alone doesn't prove a scoped name is stale.

On dispatch, instruct the executor to run the **drift check first**: `git diff --stat <planned_at_commit>..HEAD -- <affected_paths>`. If in-scope files changed since the plan was written, STOP and reconcile the plan before editing — don't hand a stale plan to an executor.

For `start <slug>`, run the optional cross-tool second-opinion offer before dispatch. If accepted, run the one-shot reviewer against the plan path, independently verify accepted findings against source, append the attributed lines to `## Self-review`, auto-commit that plan edit, then dispatch the executor. If the accepted leg hits a STOP condition, record the attempted-failure line and continue with normal dispatch.

### Step 5 — Transition (status edit; git mv only on ship)

`Edit` the frontmatter: set `status`, bump `updated` to the turn anchor, apply transition fields (all timestamps from the one anchor):

- **First `→ ongoing`:** set `started_at` (once; never re-set).
- **`→ blocked`:** set `blocked_reason` + `blocked_since`.
- **`blocked → ongoing`:** clear `blocked_reason`/`blocked_since`; leave `started_at`.
- **`scheduled → ongoing`:** drop `trigger`/`scheduled_date`/`auto_execute`; set `started_at`.
- **All `## Steps` `done` → `in_review`:** set `status: in_review` + `in_review_since`; auto-dispatch the completion review (Step 8). No `git mv`. An `auto_execute` scheduled plan halts here too.
- **`→ finished` (ship):** only when `review_status: passed` (on `partial`/`regressed`, route back to `ongoing` to fix; if `null`, dispatch the completion review inline first). `git mv active/<slug>.md → finished/<YYYY-MM-DD>-<slug>.md` (date prefix from the anchor), set `ship_commit` (HEAD — ask if unknown; branch-agnostic), bump `updated`. The `## Review` from `in_review` carries forward — do NOT re-dispatch (re-run only if HEAD moved).

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

1. Compose `active/<kebab-slug>.md` (no date prefix — status is a field). Frontmatter defaults: `status: planned`, `created`+`updated` = anchor, `started_at: null`, `assignee: null`, `tags: []`, `affected_paths: []`, `related_plans: []`, `review_status: null`, `planned_at_commit`: `git rev-parse HEAD` (the drift + completion-review base). Body = the base spine (`## Goal`, `## Steps` with exact paths, `## Acceptance criteria`, `## Cold-handoff checklist`, `## Review` placeholder); for a substantive/handoff plan also add `## Context & rationale`, `## Environment & how-to-run`, `## Out of scope / do-NOT-touch`, and — when work crosses files — `## Interfaces & data shapes`. These are required unless explicitly `N/A — reason`; a section is omitted only when its absence wouldn't force the executor to guess — never silently (per the spine rule in `docs/plans/AGENTS.md`).
2. **Self-review the draft — scored + tiered** (the constraint's rubric + cold-handoff). Run the weighted score pass (per `docs/plans/AGENTS.md`), then iterate: **score every plan once; enter the hill-climb iff the first `score < 85` OR the plan is big/risky (>6 steps or a risk flag) OR the user asked for hardening.** Big/risky dispatches the loop to a fresh-context `plan-review` Mode 0 only when a resolved agent and explicit delegation/policy allow it; that agent RETURNS the rewrite + trajectory and `plan-manager` is the sole writer. Without a resolved/allowed agent, run the same review inline. Fix holes; record the outcome in `## Self-review` as `Score: <n>/100 · trajectory <a→b→…> · stopped: plateau (K=3) | 8-round cap`. If the user accepts the optional cross-tool second opinion, append the attributed cross-check lines after the score line. Every remaining guess → an `## Open question` (`id`, `choice`/`text`, options with one `(recommended)`).
3. **Surface the open questions** via the native picker — `AskUserQuestion` (Claude Code) / `ask_user_question` (Codex). For a *visual* question (component look, layout, palette), render the options as a self-contained throwaway `.html` (gitignored; hand back the path if headless) instead of describing them.
4. Auto-commit, then render Tier-3.

### Step 6.5 — Ingest open-question answers

Encode each answer into the plan (rationale → `## Context`/`## Notes`; scope → `## Steps`/`## Out of scope`; record the choice verbatim). Remove answered questions (drop the section when empty). Bump `updated`, auto-commit, render Tier-3.

### Step 7 — Render preview (mandatory after Steps 4/5/6)

- **Tier 1** (broad asks): `  <slug>: <goal>` per line, sorted `(status, age desc)`.
- **Tier 2** (`list <status>`, N>1): + assignee + age token + `M/N steps` + `K mistakes noted`.
- **Tier 3** (`show <slug>`, or after any write/ship): header strip (title, goal, status+age, steps, assignee, created date) + body verbatim (omit empty optional sections) + file path.

### Step 8 — Auto-trigger the completion review on `→ in_review`

When all `## Steps` reach `done`, transition to `in_review` (Step 5) and dispatch `plan-review` through the current runtime when a resolved agent and explicit delegation/policy allow it (Claude: `Agent(subagent_type="plan-review", prompt=<plan-path>)`; Codex: project `.codex/agents/plan-review.toml` custom-agent handoff). If no resolved agent or delegation permission exists, run the `plan-review` skill inline.

Before dispatching completion review, run the optional cross-tool second-opinion offer in the same picker turn. If accepted, the flow is collect-then-compose: run the one-shot reviewer (plan-review's completion-review leg, not the draft rubric) and gather its findings FIRST, hand them to the completion review for per-finding reproduction, and only then let plan-review compose the single `## Review` block once — one writer, never a post-hoc edit splicing findings into an already-written block. The second-opinion process stays read-only; accepted findings render as a `- **Cross-check:** …` bullet inside `## Review` using the attributed grammar. If the accepted leg hits a STOP condition, record the attempted-failure line in the plan and continue the Claude-only completion review.

The **completion mode** diffs `planned_at_commit..HEAD`, writes `## Review` + `review_status`, and the file stays in `active/`. Re-render Tier-3 and auto-commit. Surface the verdict: on `passed`, "reviewed — say `ship <slug>` to archive"; on `partial`/`regressed`, route back to `ongoing` with the findings. **Ship no longer re-dispatches review** — the completion review is the review (re-run at ship only if HEAD moved).

## Publishing a plan as a GitHub issue (`--issues`)

On `--issues` (or "publish <slug> as an issue"): preflight `gh auth status` + a GitHub remote — if either fails, publish nothing and say why. Then `gh repo view --json visibility`: if the repo is **public**, warn that issues are publicly visible and get explicit confirmation before publishing any plan that names a vulnerability, credential location, or other sensitive finding. Then `gh issue create --title "<plan title>" --body-file <plan path>`; record the issue URL in the plan's `## Notes` and auto-commit. The `.md` stays the source of truth; the issue is distribution.

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
| Listing open questions as prose | Surface via `AskUserQuestion`/`ask_user_question` in the same turn (constraint) |
| Re-dispatching review on ship | The completion review (on `→ in_review`) is the review; ship re-runs it only if HEAD moved |

## Anti-Hallucination Checks

- Before "shipped", confirm `git mv` exited 0 and `test -f finished/<...>` succeeds.
- Before an `assignee` dispatch, confirm the target resolves and delegation is allowed; never `Agent()` or Codex-dispatch an unresolved name.
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
- plan-review's completion review auto-fires on every `→ in_review`; ship is gated on `review_status: passed` and never re-dispatches.
- Unresolved `## Open questions` are always surfaced via the native picker, never left as prose.

## Staleness check

`docs/plans/AGENTS.md` (written by plan-init) is the per-project source of truth this skill executes against. If it lacks a section this skill relies on (status-as-field, the self-review rubric, open-questions picker, age tokens), offer to refresh it from plan-init — never silently diverge.
