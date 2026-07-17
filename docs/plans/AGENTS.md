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
| "review plan <slug>", auto on steps-complete (`→ in_review`) | `plan-review` |

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
status: planned | ongoing | blocked | scheduled | in_review | finished
created: "2026-06-14T05:09:31+00:00"
updated: "2026-06-14T05:09:31+00:00"
started_at: null
assignee: null | <agent-name>
review_author_company: openai | anthropic | unknown
review_author_tool: <string>
review_author_model: <string>
review_author_effort: <string>
review_waivers: []
tags: []
affected_paths: []
related_plans: []
review_status: null
planned_at_commit: null
execution_base_commit: null
---
```

Status-specific keys are added **only when that status applies** (the same
"required unless genuinely inapplicable" discipline as the body):

| Added when | Keys |
|---|---|
| `status: blocked` | `blocked_reason` (names the external actor + input needed), `blocked_since` (ISO datetime) |
| `status: scheduled` | `trigger` (`date` \| `manual-approval`), `scheduled_date` (ISO, required for `date`), `auto_execute` (default `false`) |
| `status: in_review` | `in_review_since` (ISO datetime, set once on `→ in_review`); the completion review diffs `execution_base_commit..HEAD` |
| `status: finished` | `ship_commit` (full SHA under review — branch-agnostic) |

`planned_at_commit` is the SHA the plan was scaffolded against and remains the
draft-input/drift base. `execution_base_commit` is the exact plan-only commit
that first changes `planned|scheduled → ongoing`; record that SHA in a second
plan-only identity commit before implementation. Completion validates ancestry
and the start transition, then diffs `execution_base_commit..HEAD`, excluding
concurrent work that landed before execution.

All time-valued keys (`created`, `updated`, `started_at`, `blocked_since`,
`scheduled_date`, `in_review_since`) are **ISO 8601 datetimes with offset**
(`YYYY-MM-DDTHH:MM:SS±HH:MM`), captured once at write time via
`date '+%Y-%m-%dT%H:%M:%S%:z'` — never bare dates. Quote them so the offset
colon doesn't confuse YAML. `started_at` is set ONCE (first move to
`ongoing`) and never re-set. `scheduled` fires when `now > scheduled_date`;
`auto_execute: true` fires silently, else the DUE plan is surfaced for
approval.

## Body — spine, plus the sections a cold executor needs

A plan is read **cold**: a fresh, weaker executor (or a thin subagent) acts on
it with no conversation context. So the test for a section is **"would its
absence force the executor to guess?"** — if yes, it is required; **omit a
section only when it is genuinely inapplicable, and then say so explicitly
(`N/A — <one-line reason>`), never silently.** This replaces the old "include it
only when it carries content" rule, which quietly dropped exactly the standalone
context a stranger needs. Tier by size so a parked idea isn't drowned in empty
headings:

- **Base spine (every plan):** `## Goal`, `## Steps`, `## Acceptance criteria`,
  `## Cold-handoff checklist`, `## Review`.
- **Substantive / multi-commit / handoff plans also require** (or an explicit
  `N/A — reason`): `## Context & rationale`, `## Environment & how-to-run`,
  `## Out of scope / do-NOT-touch`, and — when work crosses files —
  `## Interfaces & data shapes`. Add `## Known gotchas` / `## Global constraints`
  whenever such traps or hard limits exist.

| Section | Required? | Holds |
|---|---|---|
| `## Goal` | **yes** | what success looks like, why it matters (the expanded `goal:`) |
| `## Context & rationale` | substantive | why now, what it unblocks, verbatim user decisions — AND the *why* behind each non-obvious choice (rationale is the implicit knowledge that dies with the drafting session) |
| `## Environment & how-to-run` | substantive | runtime/tool versions, env vars, and the exact install/build/test/lint commands **with flags** (`pnpm test`, `pytest -v`) — an executor references these constantly |
| `## Steps` | **yes** | the `# / Task / Files / Depends / Status` table — **every row names the exact path(s)** it creates/modifies (`path:line-range` when editing); status enum `planned/in-flight/done/blocked/skipped` |
| `## Interfaces & data shapes` | multi-file | exact signatures / types / JSON shapes a neighboring task consumes or produces — a task's implementer sees only their own task, so this is how they learn the names and types around them |
| `## Acceptance criteria` | **yes** | a nonempty ordered Markdown table containing required `ID | Command | Expected` columns (optional descriptive columns are allowed); IDs are unique `A1…`, and each row is executable, not prose |
| `## Out of scope / do-NOT-touch` | substantive | adjacent work excluded, stated positively (an agent cannot infer it from omission); for an implementation plan, a per-file do-NOT-touch list, each with a one-line blast-radius rationale |
| `## Known gotchas` | when traps exist | framework/repo pitfalls that otherwise live only in conversation |
| `## Global constraints` | when limits exist | version floors, dependency limits, naming/copy rules, platform reqs — one line each, **copied verbatim** from the spec |
| `## Cold-handoff checklist` | **yes** | the binary required-content gate (see below) — each item present & specific or `N/A — reason` |
| `## STOP conditions` | on risky/handoff plans | named, plan-specific escape hatches — "if assumption X turns out false, STOP and report; do not improvise" |
| `## Open questions` | when decisions are pending | agent→user residue; `NEEDS CLARIFICATION` marks a genuine unknown rather than a silent default |
| `## Self-review` | on substantive plans | what the checklist pass caught (see below) |
| `## Review` | **yes** (placeholder) | `(filled by main-context plan-manager after completion evidence)` until shipped |
| `## Mistakes & Dead Ends` | as they happen | append-only: `- **<ISO>**: <tried> → <why it failed> → <how to avoid>` |
| `## Sources` | when it cites code | `file:line` / URL — each paired with the one-line evidence it shows |
| `## Notes` | when useful | design decisions, links |

The first body line repeats the title as `# <Title>`. Main-context
`plan-manager` fills `## Review` with: `Goal met: yes|partial|no`,
`Regressions`, `CI`, `Follow-ups`, `Filed by`, plus the primary-review
`Cross-check` attribution when evidence was applied (grammar below).

### Cold-handoff checklist — the required-content gate

The cold-handoff test is no longer a reflective question (a draft can satisfy
that superficially); it is a **binary contract**. Before a plan is shown, walk
this list — each item is **present & specific**, or marked **`N/A — reason`**
where the reason proves a cold executor needs nothing there (a generic
"N/A — not needed" is a **miss**, not a pass — an unjustified N/A can hide a
real gap); a bare gap is a defect, not a default:

1. **File manifest** — every step names exact path(s) (`path:line-range` to edit).
2. **Environment & commands** — versions, env vars, exact build/test/lint commands with flags.
3. **Interface & data contracts** — exact signatures/types/shapes for anything crossing a task boundary.
4. **Executable acceptance** — every criterion is a command + its expected output.
5. **Out of scope** — what NOT to touch, stated positively.
6. **Decision rationale** — the *why* behind each non-obvious choice.
7. **Known gotchas** — the traps that lived only in conversation.
8. **Global constraints verbatim** — exact values copied from the spec.
9. **No undefined terms / forward refs** — no `TBD`/`TODO`/"implement later", no reference to a type/function/file defined nowhere in the plan or in cited code.

Then run the **adversarial cold-read**: *read ONLY this file and, at each step,
enumerate every decision it does not answer — and challenge every `N/A`* (truly
inapplicable, or quietly skipped?). Each unanswered decision or unjustified `N/A`
is a defect — fix it, or turn it into an `## Open question` (mark genuine unknowns
`NEEDS CLARIFICATION`). This converts "where would it guess?" into a finding list.

## Self-review — drafted plans arrive already hole-checked

Drafting runs in *produce* mode (optimistic, momentum-driven); reviewing runs
in *critique* mode (adversarial, checks each claim). They are different
passes, and verification is easier than generation — so a plan is **drafted,
then red-teamed against the checklist below, before it reaches the user.** This
makes "review each detail and revalidate" automatic. Two question layers:

- **agent → agent** (this checklist): the agent interrogates its own draft and
  fixes what it can. Resolved internally; the user never sees it.
- **agent → user** (`## Open questions`): only the residue that genuinely
  needs a human decision, surfaced as options.

Checklist — run every criterion before the plan is shown. This is not a numeric
score:

| Criterion | Hole it catches |
|---|---|
| `standalone_executability` | the cold-handoff checklist passes — the weakest plausible executor could act with only this file |
| `actionability` | every step has a verifiable done-condition — no "improve/handle/clean up X" |
| `dependency_order` | no step needs the output of a later one; prerequisites exist |
| `evidence_reverification` | every cited `file:line` was opened this session and says what the step claims |
| `goal_coverage` | completing every step actually meets the goal |
| `executable_acceptance` | criteria are commands plus expected output, not prose judgments |
| `failure_modes` | each risky step has a revert trigger or explicit stop condition |
| `open_questions` | anything guessed becomes an `## Open question`, never a silent default |

Run one deliberate checklist pass, repair the highest-impact holes once, and
record the criteria checked plus a short caught/fixed list in `## Self-review`.
This local author check is not independent review evidence and never loops.

### Strong-default independent review

Independent review is the strong default for every plan. Before execution,
main-context `plan-manager` prepares one immutable non-git bundle and dispatches
one fresh findings-only `primary` reviewer. `plan-review` returns typed evidence;
plan-manager alone dispatches, reconciles, writes receipts, and changes lifecycle
state. Session Relay is never valid review evidence.

Current policy and all new records use schema 5. The closed policy has
`role: primary`, `fallback: availability_only`, and `max_rounds: 2` exactly.
Its ordered candidates are (1) `codex:gpt-5.6-sol@high` with `service_tier:
default`, (2) `claude:fable@high`, and (3) `claude:opus@xhigh`.

GPT is always first. Claude is availability-only fallback within the same
primary role, never a routine second reviewer. Every value retains provenance.
Advance only after `tool_unavailable`, `auth_failed`, or `model_unavailable`
with no output/result. `platform_denied`, timeout, transport/signal/exit failure,
parse/schema failure, or substantive output is terminal.

The argv builder derives the exact next candidate from the validated
prior-attempt ledger and rejects any skipped or substituted
tool/model/effort/service-tier tuple.

Every schema-5 output checks `standalone_executability`, `actionability`,
`dependency_order`, `evidence_reverification`, `goal_coverage`,
`executable_acceptance`, `failure_modes`, and `open_questions`.

Each criterion is `{status: pass | non_blocking_gap | blocking_gap, evidence:
<nonempty string>}`; the verdict is the strongest status. Every gap maps to a
finding, and `pass` has none. Any blocker makes the run `not_ready`; rejection
cannot rewrite it to `passed`. New records omit X/S, numeric score/rubric,
cross-company consent, and zero-review fields.
Round 1 is full. Plan-manager reproduces every finding and records its
disposition. Only when every raw blocker is reproduced and accepted may
plan-improver patch exactly that set; one rejected blocker terminates the
series. Changed input permits one target-limited repair round, which passes only
without blockers. There is no round 3, reset, continuation, unchanged-input
repair, or non-blocking repair target.

New waivers bind `roles: [primary]`; historical leg-based waivers retain their
persisted meaning. Creation first commits `planned` (or `scheduled`) without
executing. `start`, schedule fire, and `auto_execute` use
`prepare(intent) → main review dispatch → apply`; apply re-hashes the plan,
bundle, policy, provenance, and waiver before consuming the intent once.
Missing, stale, terminal, or blocking evidence never enters `ongoing`.

Canonical input removes only lifecycle fields (`updated`, `status`, `started_at`,
`in_review_since`, block fields, `assignee`, `review_status`, `ship_commit`,
`execution_base_commit`), `review_waivers`, and exact machine records. Ordinary
prose stays hashed. Current receipts bind author, phase/intent, immutable head,
canonical input, bundle, policy/provenance, attempt ledger, waiver,
checklist/findings/dispositions, eligibility, and time. Every receipt embeds the
complete `ReviewSeriesV5`; its final round equals the receipt-derived run. A
repair series is full round 1, one transition, and repair round 2 under the same
phase, intent, kind, and policy; completion rounds also retain planned/start
commit identities. Substantive or policy changes invalidate reuse.

Completion first commits the plan-only `in_review` transition, then runs
plan-documented setup, acceptance, and CI in a sentinel-bound unlinked
disposable clone. It proves the original worktree and Git metadata stayed
unchanged before applying evidence. Completion receipts also bind
`planned_at_commit`, `execution_base_commit`, canonical binary diff bytes/hash,
and a nonempty ordered acceptance inventory derived from the canonical plan.
Current bundle manifest schema 3 means full review and schema 4 means repair;
both carry `review_schema:5` and only the primary v5 output schema. Historical
manifest schemas 1/2 retain their exact X/S files and bytes.
Primary evidence covers that inventory one-to-one with identical IDs, commands,
expected values, and order. The derived completion verdict is `regressed` when
the primary review is unavailable/not-ready, CI fails, a regression is
recorded, or a primary high completion finding exists. `passed` requires a
passed/waived primary outcome, `goal_met=yes`, every acceptance met, CI exit 0,
no recorded regression, and no primary high completion finding; all other cases
are `partial`. Frontmatter `review_status` must match that verdict at apply and
ship. The rendered Review block uses a schema-5 primary-review summary;
historical receipts retain their exact X/S Cross-check rendering.
Every schema-5 generic-series, draft/completion reuse, render, and apply path
receives and validates the exact authoritative waiver set.
Disposable cleanup accepts only the helper-returned prepare identity under
`/tmp/docks-plan-verify`, bound to its random token, original snapshot, reviewed
head, source tree, canonical path, and sentinel—never a caller-selected root.

Policy versions 1–4, record schemas 1–3, and their persisted requests, outputs,
runs, waivers, and receipts remain valid only under their exact historical
validators. X/S legs, numeric scores and weighted rubrics, cross-company
consent, zero-review progression, and five-round receipts are historical-only;
never reinterpret or upgrade them as schema 5.

### Docks-only legacy start compatibility

Legacy start compatibility is a closed Docks exception, not a plan-authored
escape hatch. Ordinary execution-range validation runs first and preserves its
existing error order and closed schema-v1 result. Only the helper's exact
abbreviated historical shape may enter compatibility validation; prose,
frontmatter, waivers, or a broadly similar start commit cannot opt another plan
in.

For an eligible historical plan, plan-manager alone writes and commits the
contiguous `E → R → B → Q → F` chain: E applies the helper-generated
historical material, exact diff, and receipt; R records ordinary X/S review of
E; B binds the exact E/R evidence; Q applies the helper-generated Docks
release/cache prerequisite after the compatibility source plan has passed and
the immutable patch release is active in both supported caches; F performs a
fresh ordinary review of Q. R and F are eligible only as `dual|single`, with at
least one passed leg and every passed leg `ready` with zero findings. Waivers,
`zero_degraded`, `blocked`, `not_ready`, or a finding-bearing passed leg cannot
authorize compatibility. Plan-review and its helper remain read-only,
evidence-only producers throughout.

The application, binding, prerequisite, and both attributed review lines remain
canonical plan input. Completion revalidates their immutable commit chain and
the full execution range; its stable-view reuse removes only the complete
`## Review` partition and still requires the exact rendered receipt block. No
existing review request, bundle, prepared result, completion receipt, or cleanup
schema gains a key. Source readiness is not runtime activation: the separately
authorized Docks release/refresh prerequisite owns immutable release and cache
equality, while a later docks-kit stage may propagate only the generic execution
ladder to consumer-global `AGENTS.md`, never compatibility eligibility.

### Evidence-complete execution ladder

Use this order to remove redundant work without removing evidence:

1. Assign one writer to each shared worktree. Plan-manager remains the sole
   writer of plan prose, receipts, lifecycle fields, and lifecycle commits;
   every parallel reviewer or auditor is read-only.
2. Run independent read-only audits in parallel only when each receives the
   same immutable input and reports evidence separately.
3. After an edit, run syntax/structural checks and direct acceptance first,
   focused regression suites next, and broader project/plugin gates last. Run
   the repository's required broad/full gate once at the pre-commit boundary
   after narrower checks pass; any later relevant edit invalidates that run.
4. Reuse evidence only while every bound identity still matches: canonical
   plan input, author, policy and provenance, waivers, sealed bundle, immutable
   commit/head/tree, diff, ordered acceptance inventory, and any compatibility
   source/release/cache/application identities. A mismatch
   restarts the earliest invalidated rung.
5. Optimization never skips required primary review, the nonempty ordered
   acceptance inventory or its one-to-one primary evidence, the start and
   `execution_base_commit` identity commits, the plan-only `in_review` commit,
   the required broad pre-commit gate, or final completion verification,
   receipt application, and reuse validation. Completion still runs each
   inventory row exactly once in its defined order.

Acceptance inventories remain nonempty and task-specific. Omit a broad check only when the plan records the exact project CI command and retains a fast independent acceptance row that proves that command's composition or strict containment of the omitted surface; if containment is uncertain or the independent proof is absent, retain the row. Newly authored inventories omit the project CI command itself because completion executes that exact recorded command separately once after the ordered inventory. This is plan-manager/plan-review evidence only; historical validators and receipts remain unchanged.

Completion-review repairs remain `in_review`, preserve the original `in_review_since`, reopen affected Step rows, and invalidate prior completion input without inventing an undocumented lifecycle transition. Main-context completion runs any plan-documented repository setup inside the disposable checkout before acceptance/CI; setup failure stops without a receipt; the generic helper never selects a package manager or copies/symlinks dependencies.

Keep findings attributed instead of blending reviewer and plan-manager voices:

Attributed ingest format:

```markdown
Cross-check (<YYYY-MM-DD>): [primary: <company> <model> <effort>] <N> findings — accepted <ids> / rejected <ids> (<reason each>); [<plan-manager>] independently reproduced accepted blocking ids against source before repair.
```

- Draft reviews append this line inside `## Self-review`. Completion reviews use
  a `- **Cross-check:** …` bullet inside the `## Review` block.
- Accepted and rejected ids form an exact partition, and every rejection
  preserves a reason. Plan-improver receives only accepted, independently
  reproduced blocking ids.

## Open questions — bounded decisions for the user

When a plan's next step needs a human decision, list it under
`## Open questions`: an `id`, a type (`choice` with options — mark one
`(recommended)`, note `custom allowed` — or `text` for a genuinely open
answer), and enough context (inline `code` welcome) to decide without reading
the whole plan. This block is the canonical, structured list of what's
pending; how it's *surfaced* is:

- **Native multiple-choice — mandatory for every question, on every render.**
  Whenever a plan carrying unresolved `## Open questions` is presented or
  rendered (Tier-3, after ANY write/transition — not only at scaffold), the
  agent MUST surface each one through the runtime's question UI in the SAME turn
  — never leave them as prose for the user to answer in free text. The user just
  clicks an option (one marked `(recommended)`; a `text` question uses the
  free-text / custom field). Claude Code: `AskUserQuestion`. Codex: `ask_user_question`,
  its interactive questionnaire (single/multi-choice + custom option) — landing
  as of 2026-06 ([openai/codex#9926](https://github.com/openai/codex/issues/9926)),
  interactive mode only; use it where present. This is what makes juggling
  several plans at once cheap.
- **Visual choice** (component look, layout, palette, spacing) → the agent
  renders the options as a self-contained, self-styled, throwaway `.html` and
  surfaces it, because seeing beats describing. Ephemeral and gitignored —
  never a tracked artifact. (No display — headless/remote — hands back the
  file path.)

Answers are encoded back into the plan (`## Context` / `## Notes` /
`## Steps`), the answered questions removed, and `updated` bumped.

A genuinely non-interactive context is the floor case — `codex exec`, CI, or
any run where the question tools are removed (both `AskUserQuestion` and
`ask_user_question` are disabled in non-interactive mode so they can't hang).
There, the agent presents the same structured options inline and reads the
reply. That's the unavoidable minimum, not a path to design for — optimize for
the picker.

## Lifecycle transitions

A transition is a frontmatter edit; `plan-manager` **auto-commits the `.md`**
after each one (with a clear message) so a fresh session/container resumes
from committed state — the user can amend.

| Transition | What plan-manager does |
|---|---|
| New plan | Draft + self-review, then `Write` `active/<slug>.md`, `status: planned` (`scheduled` if it has a trigger). `created`+`updated` = now; **set `planned_at_commit`** (`git rev-parse HEAD`) as the drift + review base. |
| Start | Commit only `status: ongoing` + first `started_at`; capture that exact commit SHA, then record it as `execution_base_commit` in a second plan-only commit before dispatch. No `git mv`. |
| Block | `status: blocked`, set `blocked_reason` + `blocked_since`. No `git mv`. |
| Unblock | `status: ongoing`, clear `blocked_reason`/`blocked_since`. `started_at` unchanged. |
| Schedule fires | `status: ongoing`, drop scheduled-only keys, set `started_at`, dispatch. (An `auto_execute` plan still halts at `in_review` for a human ship.) |
| Steps complete → review | When every `## Steps` row is `done`: `status: in_review`, set `in_review_since`; main-context plan-manager dispatches evidence-only `plan-review`, validates planned/start ancestry, diffs `execution_base_commit..HEAD`, and alone writes `## Review` + `review_status`. The file stays in `active/`. No `git mv`. |
| Ship | Allowed only when `review_status: passed` and it matches a current derived-passed completion receipt (on `partial`/`regressed`, fix first; if `null`, dispatch the review inline). `git mv active/<slug>.md → finished/<YYYY-MM-DD>-<slug>.md`, `status: finished`, bump `updated`, set `ship_commit` (HEAD). Carries the existing `## Review` forward — **no re-dispatch** (re-run only if HEAD moved since the review). |
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
| `in_review` | `<X> in review` | now − `in_review_since` |
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
