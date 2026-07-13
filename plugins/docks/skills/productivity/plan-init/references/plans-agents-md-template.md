# Embedded Template — `docs/plans/AGENTS.md`

Verbatim content to write at `docs/plans/AGENTS.md` (cross-tool — Codex, Claude Code, OpenCode, VS Code Copilot all read AGENTS.md when present). The bootstrap also writes a one-line `docs/plans/CLAUDE.md` containing `@AGENTS.md` so Claude Code's nested-directory discovery picks up the same content. The example datetimes below are illustrative — write the block as-is.

Deliberate divergence: the template's `## Runtime agent dispatch` section ships to consumers but is absent from the docks repo's own `docs/plans/AGENTS.md` (the kit documents its wrappers in its root file instead) — don't "fix" the mismatch by deleting the section here.

````markdown
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

## Runtime agent dispatch

The `plan-*` skills are canonical. Runtime agents are thin convenience wrappers:
Claude plugins may provide `plugins/docks/agents/plan-manager.md` and
`plan-review.md`, while Codex projects may provide `.codex/agents/plan-manager.toml`
and `plan-review.toml` seeded by `plan-init` or scaffold. Use an agent only when
it resolves and explicit user delegation or runtime policy allows it; otherwise
run the matching skill inline.

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
directory. A transition is a one-line field edit — no `git mv` — until the
plan ships, when its `.md` moves `active/ → finished/` (gaining a date prefix).
Status is stored in exactly one place; the folder only answers "is this live or
archived." Each folder has a `.gitkeep` so it survives empty. `ls active/` is
the live list; `plan-manager` renders the rich status/age/progress glance on
demand.

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
assignee: null
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

Status-specific keys are added only when that status applies:

| Added when | Keys |
|---|---|
| `status: blocked` | `blocked_reason` (external actor + input needed), `blocked_since` (ISO datetime) |
| `status: scheduled` | `trigger` (`date` \| `manual-approval`), `scheduled_date` (ISO, required for `date`), `auto_execute` (default `false`) |
| `status: in_review` | `in_review_since` (ISO datetime, set once on `→ in_review`); completion review diffs `execution_base_commit..HEAD` |
| `status: finished` | `ship_commit` (full SHA under review — branch-agnostic) |

`planned_at_commit` is the scaffold/drift base. `execution_base_commit` is the
exact plan-only commit that first changes `planned|scheduled → ongoing`; capture
it, then record its SHA in a second plan-only identity commit before work.
Completion validates that ancestry/start transition and diffs
`execution_base_commit..HEAD`, excluding concurrent pre-start work.

All time-valued keys are ISO 8601 datetimes with offset, captured at write time
via `date '+%Y-%m-%dT%H:%M:%S%:z'` and quoted. `started_at` is set ONCE (first
move to `ongoing`), never re-set. `scheduled` fires when `now > scheduled_date`;
`auto_execute: true` fires silently, else the DUE plan is surfaced for approval.

## Body — spine, plus the sections a cold executor needs

A plan is read cold: a fresh, weaker executor (or a thin subagent) acts on it
with no conversation context. The test for a section is "would its absence force
the executor to guess?" — if yes, it is required; omit a section only when it is
genuinely inapplicable, and then say so explicitly (`N/A — <reason>`), never
silently. Tier by size so a parked idea isn't drowned in empty headings:

- Base spine (every plan): `## Goal`, `## Steps`, `## Acceptance criteria`,
  `## Cold-handoff checklist`, `## Review`.
- Substantive / multi-commit / handoff plans also require (or `N/A — reason`):
  `## Context & rationale`, `## Environment & how-to-run`,
  `## Out of scope / do-NOT-touch`, and — when work crosses files —
  `## Interfaces & data shapes`. Add `## Known gotchas` / `## Global constraints`
  whenever such traps or hard limits exist.

| Section | Required? | Holds |
|---|---|---|
| `## Goal` | yes | what success looks like, why it matters |
| `## Context & rationale` | substantive | why now, what it unblocks, verbatim user decisions — AND the *why* behind each non-obvious choice (rationale dies with the drafting session) |
| `## Environment & how-to-run` | substantive | runtime/tool versions, env vars, and the exact install/build/test/lint commands with flags (`pnpm test`, `pytest -v`) |
| `## Steps` | yes | the `# / Task / Files / Depends / Status` table — every row names the exact path(s) it creates/modifies (`path:line-range` when editing); status enum `planned/in-flight/done/blocked/skipped` |
| `## Interfaces & data shapes` | multi-file | exact signatures / types / JSON shapes a neighboring task consumes or produces |
| `## Acceptance criteria` | yes | each criterion is a command + its expected output, not a prose judgment (EARS phrasing optional) |
| `## Out of scope / do-NOT-touch` | substantive | adjacent work excluded, stated positively (an agent can't infer it from omission); per-file do-NOT-touch with one-line blast-radius rationale |
| `## Known gotchas` | when traps exist | framework/repo pitfalls that otherwise live only in conversation |
| `## Global constraints` | when limits exist | version floors, dependency limits, naming/copy rules, platform reqs — one line each, copied verbatim from the spec |
| `## Cold-handoff checklist` | yes | the binary required-content gate (see below) — each item present & specific or `N/A — reason` |
| `## STOP conditions` | on risky/handoff plans | named escape hatches — "if assumption X turns out false, STOP and report; do not improvise" |
| `## Open questions` | when decisions pending | agent→user residue; `NEEDS CLARIFICATION` marks a genuine unknown, not a silent default |
| `## Self-review` | on substantive plans | what the scored rubric pass caught |
| `## Review` | yes (placeholder) | `(filled by plan-review on completion)` until shipped |
| `## Mistakes & Dead Ends` | as they happen | append-only `- **<ISO>**: <tried> → <why> → <avoid>` |
| `## Sources` | when it cites code | `file:line` / URL paired with one-line evidence |
| `## Notes` | when useful | design decisions, links |

`plan-review` fills `## Review` with: `Goal met: yes|partial|no`, `Regressions`,
`CI`, `Follow-ups`, `Filed by`, plus an optional `Cross-check` bullet when a
cross-tool second opinion was accepted (grammar below).

### Cold-handoff checklist — the required-content gate

The cold-handoff test is a binary contract, not a reflective question (a draft
can satisfy that superficially). Before a plan is shown, walk this list — each
item is present & specific, or marked `N/A — reason` where the reason proves a
cold executor needs nothing there (a generic "N/A — not needed" is a miss, not a
pass — an unjustified N/A is how the score gets gamed); a bare gap is a defect:

1. File manifest — every step names exact path(s) (`path:line-range` to edit).
2. Environment & commands — versions, env vars, exact build/test/lint commands with flags.
3. Interface & data contracts — exact signatures/types/shapes for anything crossing a task boundary.
4. Executable acceptance — a nonempty ordered table containing required
   `ID | Command | Expected` columns (optional descriptive columns are allowed),
   with unique `A1…` IDs; every criterion is executable.
5. Out of scope — what NOT to touch, stated positively.
6. Decision rationale — the *why* behind each non-obvious choice.
7. Known gotchas — the traps that lived only in conversation.
8. Global constraints verbatim — exact values copied from the spec.
9. No undefined terms / forward refs — no `TBD`/`TODO`/"implement later", no reference to a type/function/file defined nowhere in the plan or in cited code.

Then the adversarial cold-read: read ONLY this file and, at each step, enumerate
every decision it does not answer — and challenge every `N/A` (truly
inapplicable, or quietly skipped?). Each unanswered decision or unjustified `N/A`
is a defect — fix it or turn it into an `## Open question` (mark genuine unknowns
`NEEDS CLARIFICATION`).

## Self-review — drafted plans arrive already hole-checked

Drafting runs in produce mode (optimistic); reviewing runs in critique mode
(adversarial). Verification is easier than generation, so a plan is drafted,
then red-teamed against the rubric below, before it reaches the user — making
"review each detail and revalidate" automatic. Two question layers: agent→agent
(this rubric, resolved internally) and agent→user (`## Open questions`).

| Check | Weight | Hole it catches |
|---|---|---|
| Standalone executability | 22 | the cold-handoff checklist passes — the **weakest plausible executor** (a smaller/cheaper model: strong at following explicit instructions, weak at filling gaps) could act with ONLY this file |
| Actionability | 16 | every step has a verifiable done-condition |
| Dependency order | 12 | no step needs a later step's output; prerequisites exist |
| Evidence re-verify | 10 | every cited `file:line` was opened this session and says what's claimed |
| Goal coverage | 12 | with every step done, is the Goal actually met? name the gap |
| Executable acceptance | 12 | criteria are a command + its expected output, not prose |
| Failure mode | 10 | each risky step has a revert trigger |
| Assumption → question | 6 | anything guessed becomes an `## Open question`, not a silent default |

Sum = 100. **Standalone executability carries the largest weight on purpose:**
the loop only climbs as high as the rubric lets it perceive quality, so the
cold-handoff dimension must be scored heavily or the hill-climb can't optimize
it. Score it objectively against the cold-handoff checklist above (each field
present/specific or a *justified* `N/A`), weighting the items the other rows
don't already reward — rationale, gotchas, interface/data contracts, environment
& commands, global constraints verbatim — so the 22 points buy genuinely
cold-handoff content, not work Actionability or Executable acceptance already
paid for. That resists the padding a "completeness" score otherwise invites.

**Scored iterate-until-plateau loop (tiered).** The rubric is *scored*, not just
checked: a deliberate separate pass assigns each check its weighted sub-score
(sum 0–100), then hill-climbs — critique lowest checks → rewrite → re-score, keep
a new draft only if it beats the best by margin **+2**, stop at plateau (no gain
over **K=3** rounds) or an **8-round cap**; when stuck, a **best-of-N=3** escape
picks the best of 3 fresh rewrites. Every ~3 rounds re-anchor on the original
rubric + checklist before scoring (it counters scores climbing while the plan
doesn't get easier to execute cold). Record `Score: <n>/100 · trajectory
<a→b→…> · stopped: plateau (K=3) | 8-round cap` in `## Self-review`. Tiered —
**every plan is scored once**; iteration fires only when the first **score < 85**,
the plan is big/risky (>6 steps or a risk flag → a fresh-context subagent runs
it), or the user asks for hardening; a parked stub gets just the score + one
critique. *(Technique adapted from Sean Geng, "Iterate a plan until it stops
improving" — https://seangeng.com/writing/iterate-a-plan-until-it-stops-improving.)*

### Strong-default independent review

Every plan is reviewed before execution by X (best available model from the
other company) and S (an independent reviewer from the author's company). Both
are fresh, findings-only, explicit-model/effort, and consume one sealed non-git
bundle. Portable schema-v1 transports are in-session read-only dispatch or
`codex exec -s read-only` / `claude -p --permission-mode plan`; session-relay is
not a schema-v1 transport. `plan-review` returns evidence; main-context
plan-manager alone reconciles, writes receipts, and changes lifecycle state.

Resolve cross-company consent (`always | ask | never`) independently from
zero-review progression (`ask | proceed | block`). `always` skips only Docks'
X-consent picker, never host policy. Record authoritative host denial as
`platform_denied` and never retry another transport. One successful leg may
proceed with exact degradation recorded, so a single subscription is not a hard
block. Every passed leg persists its exact structured verdict, score,
confirmations, and output hash. `not_ready` is ineligible in schema v1;
current-user waivers bind one phase+canonical input, and consent is not a waiver.

Creation commits `planned` or `scheduled` first. `start`, schedule fire, and
auto execution use `prepare(intent) → main dispatch → apply`; missing/stale/
blocked evidence never reaches `ongoing`, and an eligible intent is consumed
once. The start transition is a plan-only commit whose SHA is recorded as
`execution_base_commit` in a second plan-only commit before work. Completion
commits `in_review` before an unlinked disposable-clone check.
Receipts bind author, immutable commit/head, canonical input, bundle, resolved
policy+provenance, X/S attempts, decisions/waivers, reconciliation, outcome, and
time. Canonical input excludes only lifecycle/waiver fields (including
`execution_base_commit`) and exact machine
records; ordinary prose changes always invalidate reuse.
Completion binds the planned/start SHAs, canonical diff bytes/hash, and exact
nonempty ordered acceptance inventory; evidence covers it one-to-one.
Completion derives `regressed` for a passed X/S `not_ready`, failed CI, recorded regression, or a high
primary finding; otherwise `passed` requires goal met plus every acceptance met,
and other cases are `partial`. Frontmatter must match that receipt at apply/ship.
Cleanup takes only the prepare identity under `/tmp/docks-plan-verify`, bound to
token, original snapshot, head, tree, path, and sentinel—never a caller root.

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
   plan input, author, policy and provenance, decisions/waivers, sealed bundle,
   immutable commit/head/tree, diff, ordered acceptance inventory, and any
   compatibility source/release/cache/application identities. A mismatch
   restarts the earliest invalidated rung.
5. Optimization never skips required X/S review, the nonempty ordered
   acceptance inventory or its one-to-one primary evidence, the start and
   `execution_base_commit` identity commits, the plan-only `in_review` commit,
   the required broad pre-commit gate, or final completion verification,
   receipt application, and reuse validation. Completion still runs each
   inventory row exactly once in its defined order.

Preserve attribution:

Attributed ingest format:

```markdown
Cross-check (<YYYY-MM-DD>): [X: <other-company> <model> <effort>] <N> findings — accepted X<ids> / rejected X<ids> (<reasons>); [S: <author-company> <model> <effort>] <M> findings — accepted S<ids> / rejected S<ids> (<reasons>); [<orchestrator>] independently verified ids.
DISAGREEMENT: <topic> — [X<id>] <position> / [S<id>] <position>. Kept: <choice> — decided by <orchestrator|user>, because <reason>.
```

- Draft reviews: these lines append inside `## Self-review`. Completion reviews: a `- **Cross-check:** …` bullet inside the `## Review` block (same line grammar).
- Finding ids are leg-namespaced (`X1…`, `S1…`); accepted and rejected ids form an exact partition and every rejection preserves a reason.
- **Reconciliation rule**: both positions are always retained and attributed; a disagreement is never silently dropped or averaged. The orchestrating agent decides and names itself; if the disagreement changes scope, behavior, or a user-made decision, it escalates via the native picker instead.

## Open questions — bounded decisions for the user

List a pending decision under `## Open questions`: an `id`, a type (`choice`
with options — mark one `(recommended)`, note `custom allowed` — or `text`),
and enough context to decide. This block is the canonical structured list; how
it's surfaced:

- **Native multiple-choice — mandatory for every question, on every render.**
  Whenever a plan with unresolved `## Open questions` is presented or rendered
  (Tier-3, after ANY write/transition — not only at scaffold), surface each one
  through the runtime's picker in the SAME turn; never leave them as prose for
  the user to answer in free text. Claude Code: `AskUserQuestion`. Codex:
  `ask_user_question` (interactive questionnaire — single/multi-choice + custom
  option; interactive mode only). Use whichever the runtime provides.
- **Visual choice** (component look, layout, palette) → the agent renders the
  options as a self-contained, throwaway `.html` and surfaces it; ephemeral and
  gitignored. No display → hands back the file path.

Answers are encoded into the plan (`## Context` / `## Notes` / `## Steps`), the
answered questions removed, and `updated` bumped. A genuinely non-interactive
run (CI / `codex exec`, where the question tools are disabled) is the floor:
present the options inline and read the reply.

## Lifecycle transitions

A transition is a frontmatter edit; `plan-manager` auto-commits the `.md` after
each one so a fresh session resumes from committed state (the user can amend).

| Transition | What plan-manager does |
|---|---|
| New plan | Draft + self-review, then write `active/<slug>.md`, `status: planned`. `created`+`updated` = now; set `planned_at_commit` (`git rev-parse HEAD`). |
| Start | Commit `status: ongoing` + first `started_at`, capture the commit SHA, then record it as `execution_base_commit` in a second plan-only commit before dispatch. No `git mv`. |
| Block | `status: blocked`, set `blocked_reason` + `blocked_since`. No `git mv`. |
| Unblock | `status: ongoing`, clear `blocked_reason`/`blocked_since`. `started_at` unchanged. |
| Schedule fires | `status: ongoing`, drop scheduled keys, set `started_at`, dispatch. (`auto_execute` still halts at `in_review`.) |
| Steps complete → review | All `## Steps` rows `done` → `status: in_review`, set `in_review_since`, dispatch `plan-review` through the current runtime when a resolved agent and explicit delegation/policy allow it (Claude `Agent(subagent_type=...)`; Codex `.codex/agents/plan-review.toml`); otherwise run the `plan-review` skill inline. Completion validates planned/start ancestry, diffs `execution_base_commit..HEAD`, writes `## Review` + `review_status`, and keeps the file in `active/`. No `git mv`. |
| Ship | Only when `review_status: passed` matches a current derived-passed completion receipt (else fix first; if `null`, dispatch review inline). `git mv active/<slug>.md → finished/<YYYY-MM-DD>-<slug>.md`, `status: finished`, bump `updated`, set `ship_commit`. Carries `## Review` forward — no re-dispatch. |
| Supersede | Move to `finished/` with "Superseded by `<slug>`" in `## Notes`. |

## On-demand views

No committed dashboard. The view is `ls active/` / `ls finished/` (the set),
`plan-manager` in chat (the rich glance, computed live from frontmatter), or a
throwaway `.html` for a visual open question (gitignored).

## Pretty-print preview contract

After any agent writes or ships a plan, it MUST render the file in chat. Tiers:
Tier 1 goal-listing (`  <slug>: <goal>`, sorted by `(status, age desc)`);
Tier 2 bulk listing (adds assignee + age token + `M/N steps` + `K mistakes`);
Tier 3 single-plan (header strip + body verbatim + file path).

### Age tokens (status-specific; bare `X days` is forbidden)

Computed from frontmatter ISO datetimes vs "now" (anchored once per turn).
Largest unit ≥ 1: `<60s → just now`, `<60min → <X>m`, `<24h → <X>h`,
`<365d → <X>d`, `≥365d → <Y>mo`.

| Status | Age token | Source |
|---|---|---|
| `planned` | `<X> queued` | now − `created` |
| `ongoing` | `<X> in flight` (`(approx)` from `created` if `started_at` null) | now − `started_at` |
| `blocked` | `blocked <X> · waiting on <name>` | now − `blocked_since` |
| `scheduled` | `fires in <X>` / `DUE` / `OVERDUE by <X>` | `scheduled_date` − now |
| `in_review` | `<X> in review` | now − `in_review_since` |
| `finished` | `shipped <X> ago` | now − `updated` |

Optional `stale <X>` for `ongoing` when `now − updated > 3 days`. Legacy
date-only frontmatter is treated as `T00:00:00<offset>`.

## Audit-first scaffolding

A plan is only as good as the evidence it cites. Before scaffolding a
substantive plan: open/grep every file you intend to cite (every `file:line` in
`## Sources` and `affected_paths` comes from code read this session); pair each
Source with one-line evidence; record verbatim user decisions; prefer
executable acceptance criteria. Proportionality: a 20-line stub needs only a
light audit.

## Auto-compact resilience

The plan file on disk is the source of truth — auto-compact never touches it.
Re-read before resuming after a gap; update the file as you go (not just chat);
the `## Steps` table, `## Mistakes & Dead Ends`, and `## Sources` mean an
incoming agent has everything to continue.

## When to create a plan

Create one for: multi-commit work, work crossing subsystems, work blocked on
external info, "plan first" requests, anything time-triggered. Skip for:
single-file tweaks, lint fixes, typos, one-shot ops. Reference docs and API
contracts belong in skills / agent files / the root AGENTS.md, not here.
````
