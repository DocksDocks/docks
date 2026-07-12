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
---
```

Status-specific keys are added **only when that status applies** (the same
"required unless genuinely inapplicable" discipline as the body):

| Added when | Keys |
|---|---|
| `status: blocked` | `blocked_reason` (names the external actor + input needed), `blocked_since` (ISO datetime) |
| `status: scheduled` | `trigger` (`date` \| `manual-approval`), `scheduled_date` (ISO, required for `date`), `auto_execute` (default `false`) |
| `status: in_review` | `in_review_since` (ISO datetime, set once on `→ in_review`); the completion review diffs `planned_at_commit..HEAD` |
| `status: finished` | `ship_commit` (full SHA under review — branch-agnostic) |

`planned_at_commit` (base frontmatter) is the SHA the plan was scaffolded against (`git rev-parse HEAD`): the drift-check base AND the completion-review diff base.

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
| `## Acceptance criteria` | **yes** | each criterion is a **command + its expected output**, not a prose judgment (EARS phrasing optional) — see "Executable acceptance" |
| `## Out of scope / do-NOT-touch` | substantive | adjacent work excluded, stated positively (an agent cannot infer it from omission); for an implementation plan, a per-file do-NOT-touch list, each with a one-line blast-radius rationale |
| `## Known gotchas` | when traps exist | framework/repo pitfalls that otherwise live only in conversation |
| `## Global constraints` | when limits exist | version floors, dependency limits, naming/copy rules, platform reqs — one line each, **copied verbatim** from the spec |
| `## Cold-handoff checklist` | **yes** | the binary required-content gate (see below) — each item present & specific or `N/A — reason` |
| `## STOP conditions` | on risky/handoff plans | named, plan-specific escape hatches — "if assumption X turns out false, STOP and report; do not improvise" |
| `## Open questions` | when decisions are pending | agent→user residue; `NEEDS CLARIFICATION` marks a genuine unknown rather than a silent default |
| `## Self-review` | on substantive plans | what the scored rubric pass caught (see below) |
| `## Review` | **yes** (placeholder) | `(filled by plan-review on completion)` until shipped |
| `## Mistakes & Dead Ends` | as they happen | append-only: `- **<ISO>**: <tried> → <why it failed> → <how to avoid>` |
| `## Sources` | when it cites code | `file:line` / URL — each paired with the one-line evidence it shows |
| `## Notes` | when useful | design decisions, links |

The first body line repeats the title as `# <Title>`. `plan-review` fills
`## Review` with: `Goal met: yes|partial|no`, `Regressions`, `CI`,
`Follow-ups`, `Filed by`, plus an optional `Cross-check` bullet when a
cross-tool second opinion was accepted (grammar below).

### Cold-handoff checklist — the required-content gate

The cold-handoff test is no longer a reflective question (a draft can satisfy
that superficially); it is a **binary contract**. Before a plan is shown, walk
this list — each item is **present & specific**, or marked **`N/A — reason`**
where the reason proves a cold executor needs nothing there (a generic
"N/A — not needed" is a **miss**, not a pass — an unjustified N/A is how the
score gets gamed); a bare gap is a defect, not a default:

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
then red-teamed against the rubric below, before it reaches the user.** This
makes "review each detail and revalidate" automatic. Two question layers:

- **agent → agent** (this rubric): the agent interrogates its own draft and
  fixes what it can. Resolved internally; the user never sees it.
- **agent → user** (`## Open questions`): only the residue that genuinely
  needs a human decision, surfaced as options.

Rubric — run every item before the plan is shown. Each check carries a **weight**
(default, tunable; sums to 100) used by the score pass below:

| Check | Weight | Hole it catches |
|---|---|---|
| Standalone executability | 22 | the cold-handoff checklist passes — the **weakest plausible executor** (a smaller/cheaper model: good at following explicit instructions, weak at filling gaps) could act with ONLY this file |
| Actionability | 16 | every step has a verifiable done-condition — no "improve/handle/clean up X" |
| Dependency order | 12 | no step needs the output of a later one; prerequisites exist |
| Evidence re-verify | 10 | every cited `file:line` was opened *this session* and says what the step claims |
| Goal coverage | 12 | with every step done, is the Goal *actually* met? name the gap |
| Executable acceptance | 12 | criteria are a command + its expected output, not a prose judgment |
| Failure mode | 10 | each risky step has a revert trigger / "if this fails, then…" |
| Assumption → question | 6 | anything *guessed* becomes an `## Open question`, never a silent default |

Sum = 100. **Standalone executability carries the largest weight on purpose:**
the loop can only climb as high as the rubric lets it perceive quality, so the
cold-handoff dimension must be scored — and scored heavily — or the hill-climb
cannot optimize it (anything not scored is not climbed). Score it **objectively**
against the cold-handoff checklist above (each field present/specific or a
*justified* `N/A`), not a subjective "how complete does this feel". **Weight the
items the other rows don't already reward** — decision rationale, known gotchas,
interface/data contracts, environment & commands, global constraints verbatim —
so the 22 points buy genuinely cold-handoff content, not work Actionability or
Executable acceptance already paid for. A de-duplicated, objective sub-checklist
resists the padding/reward-hacking that a "completeness" score otherwise invites.

### Scored iterate-until-plateau loop (tiered)

The rubric isn't only a checklist — it's *scored*, and a draft is refined until
the score stops improving. The score pass is **deliberate and separate**: go
check by check, assign each its weighted sub-score, sum to a 0–100 total. Then
hill-climb — critique the lowest-scoring checks, rewrite to fix them, re-score;
keep the new draft only if it beats the best by a real **margin (+2)**; stop when
the best score hasn't moved over the last **K=3** rounds (plateau) or at a hard
**8-round cap**. When hill-climbing stalls below target, take a **best-of-N (N=3)**
escape — generate 3 genuinely different rewrites in one round, score all, keep
the winner. Every ~3 rounds **re-anchor on the original rubric + checklist** (re-read
them) before scoring again — it counters the drift where scores climb but the plan
doesn't actually get easier to execute cold. Record the outcome in `## Self-review`
as `Score: <n>/100 · trajectory <a→b→…> · stopped: plateau (K=3) | 8-round cap`.

**Tiered — every plan is scored once; iteration intensity scales with the plan.**
Small plans no longer *skip* the review; they get the score and simply converge
out of the loop immediately:

| Tier | Treatment |
|---|---|
| Parked / small stub | one weighted **score + single critique** pass — no iteration |
| Normal substantive plan | hill-climb **only if the first score < 85/100** or the user asks for hardening; iterate to plateau or the 8-round cap |
| Big / risky (>6 steps or a risk flag) | a **fresh-context subagent** runs the loop (it can't inherit the author's blind spots) + the best-of-N escape |
| Explicit "make this best possible" | the full iterate-until-plateau loop |

Record what the pass caught in `## Self-review` (it's a real artifact, not
ceremony). *(Scored-loop technique adapted from Sean Geng, "Iterate a plan until
it stops improving" — https://seangeng.com/writing/iterate-a-plan-until-it-stops-improving.)*

### Strong-default independent review

Independent review is the strong default for every plan. Before execution,
main-context `plan-manager` prepares one immutable, non-git bundle and asks two
fresh, findings-only reviewers to consume it: X is the best available model from
the company other than `review_author_company`; S is an independent reviewer
from the author's company. Both legs use explicit model/effort pins and either
an in-session read-only dispatch or the portable CLI baseline (`codex exec -s
read-only` / `claude -p --permission-mode plan`). Session-relay is not a schema-v1
transport. `plan-review` returns evidence; plan-manager alone reconciles findings,
writes receipts, and changes lifecycle state.

The resolved logical policy has independent choices for cross-company consent
(`always | ask | never`) and zero-review progression (`ask | proceed | block`).
`always` suppresses only Docks' X-consent picker; it never bypasses host policy.
An authoritative host denial is `platform_denied` and is not retried through a
different transport. One successful leg is enough to proceed with the other
exact outcome recorded, so missing a second subscription is never a hard block.
Zero successful legs follow the separately resolved zero-review choice. A
current-user waiver may name X, S, or both for exactly one phase and canonical
input hash; consent `never` is not a waiver.

Creation first commits `planned` (or `scheduled`) without executing. `start`,
schedule fire, and `auto_execute` use `prepare(intent) → main review dispatch →
apply`; apply re-hashes the plan, bundle, policy, and waiver before consuming the
intent once. Missing, stale, or blocked evidence never enters `ongoing`.
Completion first commits the plan-only `in_review` transition, verifies in an
unlinked disposable clone, then writes one completion receipt after proving the
original worktree and Git metadata stayed unchanged.

Canonical input removes only lifecycle fields (`updated`, `status`,
`started_at`, `in_review_since`, block fields, `assignee`, `review_status`,
`ship_commit`) plus `review_waivers`, and exact one-line machine records. All
ordinary plan prose remains hashed. Receipts bind the author identity, phase,
lifecycle intent, immutable commit/head, canonical input, sealed bundle,
resolved policy+provenance, X/S attempt ledgers, decisions/waivers, finding
reconciliation, outcome, and time. Any substantive or policy change invalidates
reuse; excluded lifecycle fields and the receipt's own line do not.

Keep findings attributed instead of blending reviewer voices:

Attributed ingest format:

```markdown
Cross-check (<YYYY-MM-DD>): [X: <other-company> <model> <effort>] <N> findings — accepted X<ids> / rejected X<ids> (<reason each>); [S: <author-company> <model> <effort>] <M> findings — accepted S<ids> / rejected S<ids> (<reason each>); [<orchestrator>] independently verified <X/S ids> against source before accepting.
DISAGREEMENT: <topic> — [X<id>] <position> / [S<id>] <position>. Kept: <choice> — decided by <the orchestrating agent | user via picker>, because <one line>.
```

- Draft reviews: these lines append inside `## Self-review`. Completion reviews: a `- **Cross-check:** …` bullet inside the `## Review` block (same line grammar).
- Finding ids are leg-namespaced (`X1…`, `S1…`); accepted and rejected ids form an exact partition and every rejection preserves a reason.
- **Reconciliation rule**: both positions are always retained and attributed; a disagreement is never silently dropped or averaged. The orchestrating agent decides and names itself; if the disagreement changes scope, behavior, or a user-made decision, it escalates via the native picker instead.

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
| Start | `status: ongoing`, **set `started_at` (first time only)**, dispatch to assignee. No `git mv`. |
| Block | `status: blocked`, set `blocked_reason` + `blocked_since`. No `git mv`. |
| Unblock | `status: ongoing`, clear `blocked_reason`/`blocked_since`. `started_at` unchanged. |
| Schedule fires | `status: ongoing`, drop scheduled-only keys, set `started_at`, dispatch. (An `auto_execute` plan still halts at `in_review` for a human ship.) |
| Steps complete → review | When every `## Steps` row is `done`: `status: in_review`, set `in_review_since`, **auto-dispatch `plan-review`** (completion review — diffs `planned_at_commit..HEAD`, writes `## Review` + `review_status`, file stays in `active/`). No `git mv`. |
| Ship | Allowed only when `review_status: passed` (on `partial`/`regressed`, fix first; if `null`, dispatch the review inline). `git mv active/<slug>.md → finished/<YYYY-MM-DD>-<slug>.md`, `status: finished`, bump `updated`, set `ship_commit` (HEAD). Carries the existing `## Review` forward — **no re-dispatch** (re-run only if HEAD moved since the review). |
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
