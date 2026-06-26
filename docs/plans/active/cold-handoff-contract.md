---
title: Close the cold-handoff gap in the plans contract
goal: Make plan self-review optimize standalone executability — add a scored Standalone-Executability dimension, a binary cold-handoff required-content checklist, and cold-executable spine fields — synced across both contract homes.
status: in_review
created: "2026-06-26T02:58:48+00:00"
updated: "2026-06-26T04:32:42+00:00"
started_at: "2026-06-26T02:58:48+00:00"
assignee: null
tags: [plans, contract, self-review, cold-handoff]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/docks/skills/productivity/plan-init/SKILL.md
  - plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-review/SKILL.md
  - plugins/docks/agents/plan-manager.md
  - AGENTS.md
related_plans: []
review_status: passed
in_review_since: "2026-06-26T04:32:42+00:00"
planned_at_commit: 4c12d53c33a8d387d1277997054cab858dc1a23c
---

# Close the cold-handoff gap in the plans contract

## Goal

Plans drafted by `plan-manager` stay under-specified for **cold handoff** (a fresh,
weaker executor acting with ONLY the file) because the cold-handoff test is a
*reflective question* sitting *outside* the scored self-review rubric, while the
"lean spine / include-only-when-content" rule actively biases toward dropping the
standalone context a stranger needs. Success: (1) the self-review rubric scores
**Standalone executability** as its largest weight so the hill-climb optimizes it;
(2) the reflective test becomes a **binary required-content checklist** + an
adversarial cold-read; (3) the spine carries the cold-executable fields
(environment/commands, exact file paths, interface contracts, executable
acceptance, non-goals, rationale, gotchas) as tiered/conditionally-required; all
synced across both contract homes + the skills + agents. This plan is itself
written in the new format as the worked example proving it is fillable.

## Context & rationale

Source: research artifact "Closing the Cold-Handoff Gap in `DocksDocks/docks`"
(uploaded 2026-06-26). It confirmed five hypotheses; the load-bearing ones drive
the design:

- **The rubric is the ceiling** (Sean Geng): the loop can only climb as high as
  the rubric lets it perceive quality — so handoff-completeness must be *scored*,
  not just asked, or it is never optimized. → new **Standalone executability**
  dimension, weighted **22** (largest), scored against an objective checklist.
- **Reflective criteria are gameable** (LLM-as-judge research): an open "where
  would it guess?" prompt is satisfiable superficially. → convert to a **binary
  contract** (present & specific / `N/A — reason`) + an adversarial cold-read that
  enumerates unanswered decisions as defects.
- **"Minimal ≠ short"** (Anthropic context-engineering): the old "include a
  section only when it carries content" rule silently drops load-bearing context.
  → reframe proportionality to **"required when its absence would force a guess;
  omit only when inapplicable, and then say `N/A — reason`"**, tiered by plan size.
- **Objective sub-checklist over subjective score**: a "how complete does this
  feel" score invites length-padding/reward-hacking. → score the dimension
  field-by-field against the checklist; re-anchor on the rubric every ~3 rounds.

Decisions (recorded so they don't die with this session):
- Rubric re-weighted to keep the sum at **100**: Standalone executability 22,
  Actionability 16, Dependency order 12, Evidence 10, Goal coverage 12, Executable
  acceptance 12, Failure mode 10, Assumption→question 6. Exact weights are a
  judgment call; the non-negotiable is that handoff-completeness carries a large,
  explicit weight. "Checkable acceptance" was renamed **Executable acceptance**
  (command + expected output) rather than split into a new line, to hold the
  dimension count at 8 and keep the instruction budget in check.
- EARS notation mentioned as an *optional* phrasing aid, not required — keeps the
  change testable without forcing a new notation on every plan.
- Scope = the research's Stages 1–3 (the plan-system contract). Stage 4 (kit-wide
  description audit, Codex AGENTS.md commands, Claude-A/B test harness) is
  deferred — see Out of scope.

## Environment & how-to-run

- **Runtime:** Node `22.x` (`node --version` → `v22.22.2`), pnpm `11.5.1` via
  `corepack`. The skill-frontmatter validators need the `yaml` npm package.
- **Install (once per fresh container):** `corepack enable && pnpm install --frozen-lockfile`
- **Author gate (must be green before commit):** `node scripts/ci.mjs`
- **Re-sync content hashes after editing a SKILL.md body or any `references/`
  file:** `node scripts/skills/content-hash.mjs --backfill`
- **Spot-score a skill:** `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file | grep plan-`
- **Time/commit anchors:** `date '+%Y-%m-%dT%H:%M:%S%:z'` and `git rev-parse HEAD`.

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | Reframe the body spine (proportionality → "required unless `N/A — reason`"), add cold-executable sections + `Files` column to the Steps table, add the **Cold-handoff checklist** subsection | `docs/plans/AGENTS.md` | — | done |
| 2 | Re-weight the self-review rubric to 8 dims summing 100; add the objectivity + re-anchor notes | `docs/plans/AGENTS.md` | 1 | done |
| 3 | Mirror steps 1–2 into the consumer-source template (same substance, inside the fence) | `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md` | 1,2 | done |
| 4 | Update the draft self-review constraint + Step 6 spine list in plan-manager | `plugins/docks/skills/productivity/plan-manager/SKILL.md` | 1,2 | done |
| 5 | Update Mode 0 rubric table + cold-handoff text in plan-review | `plugins/docks/skills/productivity/plan-review/SKILL.md` | 1,2 | done |
| 6 | Update the plan-manager agent wrapper's self-review restatement; refresh terse summaries in root `AGENTS.md` + plan-init Root Snippet/reference desc | `plugins/docks/agents/plan-manager.md`, `AGENTS.md`, `plugins/docks/skills/productivity/plan-init/SKILL.md` | 1,2 | done |
| 7 | Bump `metadata.updated` (2026-06-26) on the 3 changed skills; `content-hash.mjs --backfill` | the 3 SKILL.md frontmatters | 3,4,5 | done |
| 8 | Write this plan in the new format (dogfood / worked example) + self-review it | `docs/plans/active/cold-handoff-contract.md` | 1–7 | done |
| 9 | `node scripts/ci.mjs` green; adversarial review pass; then commit + push to `claude/new-session-b8ooj9` | all affected | 8 | done |

## Interfaces & data shapes

The contract's two machine-relevant shapes downstream readers depend on:

- **Self-review rubric** — 8 dimensions; weights MUST sum to 100:
  `Standalone executability 22 · Actionability 16 · Dependency order 12 ·
  Evidence re-verify 10 · Goal coverage 12 · Executable acceptance 12 ·
  Failure mode 10 · Assumption→question 6`.
- **Cold-handoff checklist** — 9 binary items, each `present & specific` or
  `N/A — <reason>`: file manifest · environment & commands · interface/data
  contracts · executable acceptance · out-of-scope · decision rationale · known
  gotchas · global constraints verbatim · no undefined/forward terms.
- **Steps table header** — now `# / Task / Files / Depends / Status` (the `Files`
  column is the per-step file manifest); status enum unchanged
  (`planned/in-flight/done/blocked/skipped`). `plan-manager`'s `M/N steps` parse
  counts rows by the `Status` column, which is unaffected by the new column.

## Acceptance criteria

- `node scripts/ci.mjs; echo $?` → prints `✔ All ci.mjs checks passed` and exits `0`
  (manifests, guards, per-file score floors, **skill content_hash in sync**, scaffold all green).
- Rubric sum check — both homes carry weights summing to 100 (22+16+12+10+12+12+10+6).
  For each of `docs/plans/AGENTS.md` and the plan-init template, run:
  `awk -F'|' '/^\| (Standalone executability|Actionability|Dependency order|Evidence re-verify|Goal coverage|Executable acceptance|Failure mode|Assumption) /{gsub(/ /,"",$3); s+=$3} END{print s}' <file>`
  → prints `100`.
- New dimension present in both contract homes:
  `grep -c 'Standalone executability' docs/plans/AGENTS.md plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md`
  → each `≥ 1`.
- Cold-handoff checklist present in both homes:
  `grep -l 'Cold-handoff checklist' docs/plans/AGENTS.md plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md`
  → both paths listed.
- Tree-node size held: `wc -l < docs/plans/AGENTS.md` → `< 500`.
- Per-file scores held above floor:
  `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file | grep -E 'plan-(manager|review|init)'`
  → each ≥ the productivity floor (8); observed 16/16/15 (plan-init/plan-manager/plan-review).

## Out of scope / do-NOT-touch

- **Stage 4 (kit-wide):** auditing every convention-skill description, adding a
  hand-written build/test/lint block to a root AGENTS.md for Codex, reframing
  all-caps imperatives kit-wide, and the Claude-A/B fresh-instance test harness.
  Deferred to a follow-up — this plan is the cold-handoff *contract*, not the
  kit-wide sweep. Blast radius of including it: touches dozens of skills.
- **`docs/plans/finished/**`** — terminal archive; never rewrite historical plans.
- **`scripts/**`** — no validator floors were loosened; the contract is authored to
  pass the *existing* gates. Do NOT relax `tree/guard`, `refs-guard`, or scorers.
- **`docs/scaffold/**` + `.codex/agents/*.toml`** — the scaffold seed and Codex
  wrappers point at the canonical contract; they need no edit for a spine/rubric
  change (`N/A` for this plan). Re-check if a *frontmatter-schema* change lands.
- **Manifest/version files** — no release; versions stay at 0.6.3 this pass.

## Known gotchas

- **`content_hash` covers body + `references/`.** Editing
  `plans-agents-md-template.md` changes plan-init's hash — bump plan-init's
  `metadata.updated` and run `--backfill`, or CI's idempotency check fails.
- **`docs/plans/AGENTS.md` is a context-tree node, not a skill** — governed by
  `tree/guard` (≤500 lines), not the skill scorer; it is not content-hashed.
- **The template's headings live inside a 4-backtick fence**, so `refs-guard`'s
  fence-length tracking ignores them (a 3-backtick inner block can't close a
  4-backtick fence) — no `## Contents` TOC is required. Don't "fix" this.
- **Two synced homes + skills.** A spine/rubric change that lands in
  `docs/plans/AGENTS.md` but not the plan-init template (or vice-versa) silently
  diverges; `plugins/docks/skills/AGENTS.md` ("Plan-skill contract sync") mandates
  same-commit parity.
- **Adding a `Files` column** must not break `plan-manager`'s `M/N steps` parse —
  it counts the `Status` column, which is still named and present.

## Global constraints

- `node scripts/ci.mjs` exits 0 — non-negotiable before commit (`scripts/AGENTS.md`).
- Per-file score floors: productivity skills **8**, agents **14** (`scripts/config/scoring.json`).
- Skill body sweet spot 80–310 lines, hard cap 500; tree nodes ≤500.
- Develop/commit/push on branch `claude/new-session-b8ooj9` only.
- No plugin version bump in prose; manifests stay in lockstep (untouched here).

## Cold-handoff checklist

1. **File manifest** — present: every step names exact path(s) (`## Steps` `Files` column + `affected_paths`).
2. **Environment & commands** — present: `## Environment & how-to-run` (versions + exact commands with flags).
3. **Interface & data contracts** — present: `## Interfaces & data shapes` (rubric shape, checklist items, table header).
4. **Executable acceptance** — present: `## Acceptance criteria` are commands + expected output/exit code.
5. **Out of scope** — present: `## Out of scope / do-NOT-touch`, stated positively with blast-radius notes.
6. **Decision rationale** — present: `## Context & rationale` records the *why* behind weights, EARS-optional, scope cut.
7. **Known gotchas** — present: `## Known gotchas` (hash surface, fence, tree-node, sync, parse).
8. **Global constraints verbatim** — present: `## Global constraints` (CI, floors, sweet spots, branch).
9. **No undefined terms / forward refs** — present: every section/file/command named resolves; no `TBD`/`TODO`.

Adversarial cold-read: reading ONLY this file, an executor can run every step
(exact paths + commands given), verify each via the acceptance commands, and
knows what NOT to touch. No unanswered decision remains → no `## Open questions`.

## Self-review

Scored against the new rubric (the one this plan introduces — re-anchored on
`docs/plans/AGENTS.md`). **Two passes, and the gap between them is itself the
finding:**

- **Pass 1 (in-context self-score): 98/100, Standalone executability 22/22,
  "cold-read leaves no gap." This was optimistic and wrong.** It missed a
  checklist-item-9 violation (stray `</content>`/`</invoke>` tags leaked into the
  tail of this file) and a checklist-item-1 violation (`affected_paths` omitted
  `plan-init/SKILL.md`, which the Steps `Files` column lists). The in-context
  author cannot reliably catch its own cold-handoff holes — exactly the failure
  this change targets.
- **Pass 2 (fresh-context adversarial review):** a fresh-instance review of this
  plan + the contract (the Claude-A/Claude-B method the research recommends)
  caught both violations above, plus two design gaps in the contract itself — an
  unjustified-`N/A` self-grant vector and a checklist↔rubric double-count. All
  fixed: the contract now requires a *justified* `N/A` and weights the 22 points
  on the items other rubric rows don't already reward.

Post-fix honest score (de-duplicated dimension, per the tightened rubric):

- Standalone executability 20/22 — checklist clean post-fix; −2 because Pass 1
  proved the in-context score is not self-sufficient (the fresh pass is the gate).
- Actionability 16/16 — every step names a file + a verifiable done-condition.
- Dependency order 12/12 — `Depends` is acyclic (1→…→9).
- Evidence re-verify 10/10 — manifest now matches `git status`; paths confirmed.
- Goal coverage 12/12 — steps 1–7 cover all three goal clauses; 8–9 verify.
- Executable acceptance 12/12 — criteria are commands + output; rubric-sum command
  corrected to be precisely runnable (a Pass-1 cold-handoff defect, now fixed).
- Failure mode 9/10 — CI + `git restore` is the revert trigger; −1: no per-step rollback.
- Assumption→question 6/6 — scope cut + weights are recorded decisions, none guessed.

`Score: 97/100 · trajectory 98 (in-context, optimistic) → 97 (post fresh-context review + fixes) · stopped: fresh-context review resolved all findings`

## Review

- **Goal met:** yes — all three goal clauses shipped: the scored Standalone-executability dimension (22, largest; rubric sums to 100 in both homes), the binary cold-handoff checklist + adversarial cold-read (replacing the reflective test), and the tiered cold-executable spine; synced across both contract homes + skills + agent wrapper.
- **Acceptance criteria:** all pass — `node scripts/ci.mjs` exit 0; rubric sum 100/100 both homes; `Standalone executability`/`Cold-handoff checklist` present in both homes; `docs/plans/AGENTS.md` 360 lines (<500); per-file scores 16/16/15 (≥ floor 8).
- **Regressions:** none — CI green on `4c12d53..HEAD`; no validator floors loosened.
- **Scope drift:** none — all 7 `affected_paths` appear in the diff. One unannounced change: `docs/plans/active/cold-handoff-contract.md` itself (the plan file, conventionally not self-listed — expected).
- **CI:** pass (`✔ All ci.mjs checks passed`).
- **Follow-ups:** `cold-handoff-contract-stage4` (the deferred kit-wide sweep — convention-skill description audit, Codex AGENTS.md build/test/lint block, all-caps→"rule+why"). Not auto-created.
- Filed by: plan-review (completion review, inline) on 2026-06-26T04:32:42+00:00

## Sources

- `docs/plans/AGENTS.md:170-190` — the re-weighted rubric (8 dims, sum 100) + objectivity/re-anchor notes this plan added.
- `docs/plans/AGENTS.md:92-160` — reframed Body spine + the Cold-handoff checklist subsection.
- `plugins/docks/skills/AGENTS.md` "Plan-skill contract sync (two homes)" — the same-commit parity rule this plan obeys.
- `scripts/AGENTS.md:5-7` — the `node scripts/ci.mjs` must-be-green gate.
- `scripts/skills/refs-guard.mjs:34-56` — fence-length tracking that exempts the template's in-fence headings from the TOC rule.
- `scripts/config/scoring.json` — per-file floors (productivity 8, agents 14).
- Uploaded research artifact "Closing the Cold-Handoff Gap in `DocksDocks/docks`" — the design source.
