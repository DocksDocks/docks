---
title: Add a tiered scored iterate-until-plateau refinement to the plan self-review
goal: Port Sean Geng's plan-optimizer (scored critique→rewrite loop, tiered to plan size, best-of-N escape) into the existing docks self-review machinery — no new skill — proven by a decision matrix and gated by a behavioral smoke test.
status: finished
created: "2026-06-23T15:40:27-03:00"
updated: "2026-06-23T19:19:32Z"
started_at: "2026-06-23T16:01:20-03:00"
ship_commit: "891ccf3e29c5f75c82c7d0fed6e2116ea63ccbfc"
assignee: null
tags: ["plan-system", "skill-enhancement", "research"]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md
  - plugins/docks/skills/productivity/plan-review/SKILL.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
related_plans: []
review_status: passed
---

# Add a tiered scored iterate-until-plateau refinement to the plan self-review

## Goal

Reconciled, canonical plan — supersedes the `-claude.md` and `-codex.md` drafts.

**Verdict:** yes, integrate the technique — as an enhancement to the **existing**
self-review (no 4th `plan-*` skill), proven by the decision matrix below. The
article's contribution is a *scored, iterative* critique (score → critique →
rewrite → repeat until the score plateaus, with a best-of-N escape). docks
already does the *qualitative, single-pass* version (draft in produce-mode →
self-review in critique-mode against a 7-check rubric). The work upgrades that
single pass into a **tiered** scored loop: every plan is scored once; the
expensive iterate-to-plateau loop fires only when it pays off.

Success = the self-review gains a weighted score + a tiered iterate-until-plateau
loop, defined **once** in `docs/plans/AGENTS.md` and synced to the plan-init
template, with the plan-manager↔plan-review write-ownership made explicit, the
thin agent wrappers left thin, a behavioral smoke test passing, and
`node scripts/ci.mjs` green.

## Context

**Source technique** (https://seangeng.com/writing/iterate-a-plan-until-it-stops-improving,
shipped as the `plan-optimizer` Claude Code skill):

```
plan = generate initial plan;  best = plan;  best_score = score(plan)   # 0-100
repeat:
    candidate = improve(best)          # critique top weaknesses, then rewrite
    s = score(candidate)
    if s > best_score + MARGIN:        # MARGIN ≈ +2, filters noise
        best, best_score = candidate, s
until plateau                          # no gain over last K rounds (K≈3)
return best
```

- **Score** is a deliberate, separate pass — criterion by criterion, sub-score
  each. Weighted dimensions: goal clarity, completeness, sequencing &
  dependencies, feasibility & resourcing, risks & mitigations, success metrics,
  specificity (≈ 1:1 with docks's 7 self-review checks).
- **Best-of-N** escape when hill-climb stalls: generate ~3 different versions in
  one round, score all, keep the winner.
- Output: best plan + per-criterion score breakdown + trajectory
  (`48 → 67 → 81 → 89 → 91 → 91`).

**What docks already has:** the lifecycle frames drafting as *produce mode* and
review as *critique mode*, red-teaming every draft against a 7-check rubric +
cold-handoff test before the user sees it (`docs/plans/AGENTS.md:111-143`).
Review is **proportional** today (`docs/plans/AGENTS.md:140-143`): small plans
get the inline rubric; big/risky plans (>6 steps or a risk flag) additionally
get a fresh-context subagent review — that subagent is `plan-review` Mode 0
(`plan-review/SKILL.md:35-56`), dispatched by `plan-manager` (Step 6).

**The gap = the article's delta:** docks's critique is a **single, unscored
pass**. The technique makes it **scored and iterative until plateau**.

### Decision matrix (which integration shape)

Scored 1–5 (higher = better); the chosen shape must also *meet the goal*.

| Option | Lifecycle fit | Low collision | Cost (tiered) | Cross-tool | Low sync burden | Low validation burden | Meets goal |
|---|---|---|---|---|---|---|---|
| **A — enhance `plan-manager` drafting (Step 6)** | 5 | 5 | 4 | 5 | 4 | 4 | yes |
| **B — enhance `plan-review` Mode 0** | 5 | 5 | 4 | 5 | 4 | 4 | yes |
| C — standalone `plan-optimizer` skill | 2 | 2 | 4 | 5 | 2 | 2 | yes |
| D — no integration | — | 5 | 5 | 5 | 5 | 5 | **no** |

**Chosen: A + B** (the two halves of the *same* self-review — drafting side and
fresh-context-review side). C bypasses the lifecycle gate, collides with
`plan-manager` ("improve a plan"), adds a third rubric home + CSO/scoring/
collision-test surface. D wins on cost but fails the goal. A+B reuses one rubric,
gates through the lifecycle, and needs no new trigger.

### Tiered loop policy (the cost control)

Every plan is **scored once**; iteration intensity scales with the plan:

| Tier | Treatment |
|---|---|
| Parked / small stub | one rubric **score + single critique** pass — no iteration |
| Normal substantive plan | bounded hill-climb **only if score < threshold (default 85/100)** or the user asks for hardening; iterate to plateau or cap |
| Big / risky (>6 steps or risk flag) | fresh-context `plan-review` Mode 0 review **+ optional best-of-N escape** |
| Explicit "make this best possible" | full iterate-until-plateau loop |

Constants (article defaults): **MARGIN +2, sliding-window K=3, best-of-N=3, hard
8-round cap**, iteration **threshold 85/100** (all tunable; recorded in the
contract). This *refines* — does not discard — the proportionality rule at
`docs/plans/AGENTS.md:140-143`: every plan still gets scored, but only
sub-threshold / big / on-request plans pay for iteration.

### Write-ownership (plan-manager ↔ plan-review)

- **`plan-manager` OWNS the plan file**: scaffolds it, writes the optimized
  draft, and records the final score + trajectory in `## Self-review`.
- **`plan-review` Mode 0, when dispatched by `plan-manager`, is RETURN-ONLY:** it
  scores + critiques + proposes a rewrite and **returns** them (with the
  trajectory) to the caller; it does **not** touch the plan file. `plan-manager`
  is the sole writer during new-plan scaffolding.
- The pre-existing **direct user-invoked draft review** ("review the draft", no
  `plan-manager` in the loop) is the separate path that may append its findings to
  `## Self-review` itself — there is no dispatcher to hand the write to. New-plan
  scaffolding always routes through `plan-manager`, so the ownership rule holds there.
- Small plans: `plan-manager` runs score+critique inline and writes. Big/risky:
  `plan-manager` dispatches Mode 0 (fresh context), receives the rewrite, writes.

### Sync surface (four homes edited; wrappers verified, not edited)

The loop description lands in **four** edited homes: `docs/plans/AGENTS.md` + the
plan-init template (the contract pair, "two homes" rule in
`plugins/docks/skills/AGENTS.md`), and the `plan-review` + `plan-manager` SKILL
bodies. The two thin agent wrappers (`plugins/docks/agents/*.md`) are
**verify-only**: each ends with *"The skill body is the source of truth … resolve
any divergence by updating the skill, not by widening this agent."* Their
high-level wording ("red-team against the self-review rubric", "open questions
via the native picker") stays **true** under a scored rubric, so they are NOT
edited unless a specific sentence becomes false.

### Decisions (resolved via the open-questions picker)

- **Shape:** enhance existing self-review in place (A+B); no new skill.
- **Scope:** tiered — every plan scored; loop fires sub-threshold / big-risky /
  on-request.
- **Constants:** MARGIN +2, K=3, best-of-N=3, 8-round cap, threshold 85/100.
- **Attribution:** credit Sean Geng + the article URL in the contract (`docs/plans/AGENTS.md` loop paragraph, synced to the template) and `plan-review`'s `## References` — the homes that actually carry a citations section (`plan-manager` has none, so attribution does not land there).

## Steps

| # | Task | Depends | Status |
|---|---|---|---|
| 1 | `docs/plans/AGENTS.md` "Self-review": add a `Weight` column to the 7-check rubric table — default (tunable) weights summing to 100: goal-clarity/actionability 20, completeness/goal-coverage 15, sequencing & dependency-order 15, feasibility 15, risks & failure-mode 15, success-metrics/checkable-acceptance 10, specificity 10. Add a paragraph documenting the **tiered** iterate-until-plateau loop (MARGIN +2, K=3, 8-round cap, best-of-N=3, threshold 85/100) and a one-line attribution to Sean Geng + the article URL. REPLACE the proportionality rule at lines 140-143 (incl. the "get the inline rubric" sentence) with the tiered policy. | — | done |
| 2 | Sync the same substance (Weight column + tiered-loop paragraph + attribution) into `plugins/.../plan-init/references/plans-agents-md-template.md` (Self-review section, ~line 105) — mirror the *substance*, not byte-for-byte. **Also REPLACE the template's own proportionality sentence at ~line 125** (the identical "get the inline rubric" string lives in both homes; leaving the template's copy diverges the two contract homes). | 1 | done |
| 3 | Rewrite `plan-review` Mode 0 (`SKILL.md:35-55`) to run the scored loop (score = separate pass → critique → rewrite → re-score → stop at plateau/8-round cap; best-of-N when stuck) and to **return** the rewrite + breakdown + trajectory to the caller (RETURN-ONLY when dispatched by plan-manager — it does NOT write the plan file; the separate direct user-invoked draft-review path may write to `## Self-review` itself). Pin the recorded-artifact format: `Score: <n>/100 · trajectory <a→b→…> · stopped: plateau (K=3) | 8-round cap`. Add the Sean-Geng attribution to `## References`. Bump `metadata.updated`; re-sync `content_hash`. | 1 | done |
| 4 | Update `plan-manager` Step 6 (`SKILL.md:92-99`) for the tiered policy + write-ownership. State the control flow explicitly: **score every plan once; enter the hill-climb iff `score < 85` OR the plan is big/risky OR the user asked for hardening** — big/risky dispatches to the fresh-context Mode 0, everything else runs inline. `plan-manager` writes the optimized draft and records the score + trajectory (Step 3 format) in `## Self-review`. Bump `metadata.updated`; re-sync `content_hash`. | 3 | done |
| 5 | **Verify (do not edit)** the two thin wrappers `plugins/docks/agents/plan-review.md` + `plan-manager.md`: confirm their wording stays true under the scored loop (incl. that plan-manager.md:29's named enumeration of the 7 checks stays accurate — only a Weight column is added, the checks don't change). Edit ONLY a sentence that became factually *false* (incomplete-but-true wording is left as-is). Done-condition: `git diff --stat plugins/docks/agents/` is empty, OR each hunk corrects a now-false sentence (noted in the commit). | 3,4 | done |
| 6 | **Smoke test:** on a throwaway draft plan, run the loop; confirm a per-criterion score breakdown + a trajectory + a plateau/cap stop reason are recorded in its `## Self-review` in the Step 3 format. Then `rm` the throwaway and confirm `git status` is clean — plan `.md`s are tracked (only render `.html`s are gitignored), so it must be deleted, never committed. | 3,4 | done |
| 7 | Run the project's CI (`node scripts/ci.mjs`): skill guards + 16-pt skill scorer AND agent guards + agent scorer (max 15, floor 14) green; content-hash idempotency green. Fix any floor regression in-file — never loosen floors. | 2,3,4,5,6 | done |

## Acceptance criteria

- [x] The decision matrix is recorded and selects enhance-in-place (A+B) — `grep -n "Decision matrix" docs/plans/active/plan-optimizer-integration.md` resolves and the chosen row is stated.
- [x] `docs/plans/AGENTS.md` documents a weighted rubric + the tiered loop + constants — `grep -nE "plateau|best-of-N|sliding window|Weight|threshold" docs/plans/AGENTS.md` returns the new lines.
- [x] The proportionality sentence is gone from BOTH contract homes — `grep -c "get the inline rubric" docs/plans/AGENTS.md plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md` reports `0` for each file.
- [x] The plan-init template carries the synced substance — `grep -nE "plateau|best-of-N|Weight|threshold" plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md` is non-empty.
- [x] `plan-review` Mode 0 + `plan-manager` Step 6 describe the tiered loop AND the write-ownership (plan-manager writes, Mode 0 returns) — confirmed by Read; both skills' `content_hash` re-synced (CI idempotency passes).
- [x] Smoke test recorded: a throwaway run shows score breakdown + trajectory + plateau/cap stop in `## Self-review` (Step 3 format); the specific throwaway file is then deleted — `ls docs/plans/active/<throwaway-slug>.md` returns "No such file" AND `git status --short` is clean (it was never committed). (Do not assert `active/` is empty — it holds real plans.)
- [x] Wrappers stayed thin: `git diff --stat plugins/docks/agents/` is empty, OR every hunk corrects a sentence that became false.
- [x] `node scripts/ci.mjs` exits 0 — all guards, 16-pt skill scorer, agent scorer (floor 14) green, no loosened floors.
- [x] No new top-level `plan-*` skill dir — `ls -d plugins/docks/skills/productivity/plan-*/` lists exactly `plan-init/`, `plan-manager/`, `plan-review/`.

## Out of scope

- A general-purpose (non-plan) optimizer skill.
- A user-invocable `optimize plan <slug>` re-run verb (natural follow-up; the loop already runs on every plan via the tiers).
- Vendoring Sean Geng's `plan-optimizer.zip` / SKILL.md verbatim — license is unstated on the freebie page; we port the *technique* and attribute it, treating the license as unknown unless verified.
- Changing the open-questions surfacing (native picker), storage model, status lifecycle, or auto-commit behavior beyond what the loop requires.
- Editing the thin agent wrappers beyond correcting a now-false sentence (Step 5).

## Self-review

Reconciliation of the `-claude.md` and `-codex.md` drafts, plus a fresh-context
Mode 0 red-team on this merged file and a 30-agent adversarial evaluation of the
`-codex` draft (31/34 findings verified — it independently corroborated the same
gaps and strengths folded in here). What the cross-critique caught and this plan
fixes:

- **Wrapper-edit error (from the `-claude` Mode 0 pass):** that review told Step 5
  to edit the wrappers *unconditionally*. The wrappers are explicitly thin
  ("the skill body is the source of truth"), so Step 5 is now **verify-only** and
  affected_paths drops them — the sync surface is **four** edited homes, not six.
- **Data-flow ambiguity (Codex point 3):** "return the optimized draft" never said
  who writes it. Now explicit: `plan-manager` owns the write; Mode 0 returns.
- **"Every plan + 8-round" was blunt (Codex point 2):** replaced with the tiered
  policy — every plan scored, iteration gated on threshold/size/request. Honors
  the user's "every plan" while respecting proportionality.
- **No decision matrix (Codex point 1):** added a scored A/B/C/D matrix as the
  evidence for enhance-in-place.
- **No behavioral check (Codex point 5):** added the Step 6 smoke test.
- **Acceptance criteria** are `[ ]` checkboxes with concrete commands + expected
  output (kept from `-claude`), including a negative grep that the old
  proportionality sentence is gone.

The merged-file Mode 0 pass then caught three merge-introduced defects, now fixed:
- **False "gitignored" premise** — `.gitignore` has no `docs/plans/` entry (only
  render `.html`s are gitignored), so the smoke-test throwaway is tracked. Step 6
  now `rm`s it and asserts `git status` clean.
- **Template proportionality sentence orphaned** — the `"get the inline rubric"`
  string lives in BOTH the contract and the template; Step 2 + the negative-grep
  now cover both homes (else they'd diverge).
- **Attribution home ambiguous** — `plan-manager` has no `## References`; pinned
  attribution to the contract + `plan-review`'s `## References`.
Plus pinned the rubric weights, the `score < 85` iteration control-flow, and the
recorded-artifact format that were under-specified.

A follow-up Codex review caught two final nits, now fixed: (1) the write-ownership
rule contradicted itself ("does not write" + "may append to `## Self-review`") —
resolved by keying it on the path: Mode 0 is RETURN-ONLY when dispatched by
plan-manager, while the separate direct user-invoked draft-review path may write
to `## Self-review` itself; (2) the smoke-test cleanup wrongly asserted
`ls active/` is empty — now checks the specific throwaway slug is absent +
`git status --short` clean.

All open questions resolved via the picker (see Context → Decisions); none are
silent guesses.

## Review

- **Goal met:** yes — all 8 acceptance criteria verified with evidence this turn (grep + diff reads); weighted rubric + tiered iterate-until-plateau loop landed in `docs/plans/AGENTS.md` and synced to the plan-init template, plan-review Mode 0 + plan-manager Step 6 carry the loop and the write-ownership rule, and CI is green.
- **Regressions:** none — `affected_paths` (4 entries) all in the ship-commit changed-files list; the only unannounced change (`plan-init/SKILL.md`) is the expected `metadata.updated`/`content_hash` re-sync forced by editing the template it owns, not drift.
- **CI:** pass — `node scripts/ci.mjs` exits 0 (skills eng 224 / prod 188, agents 30 / floor 28, `skill content_hash in sync; maintainer re-run is a no-op`).
- **Follow-ups:** none
- Filed by: plan-review on 2026-06-23T19:19:32Z

## Sources

- `https://seangeng.com/writing/iterate-a-plan-until-it-stops-improving` — technique: pseudocode, MARGIN +2, K=3, best-of-N(3), 7 weighted dimensions, trajectory `48→67→81→89→91→91`.
- `https://seangeng.com/freebies/plan-optimizer` — shipped `plan-optimizer` SKILL.md: "Score the current plan from 0 to 100 … go criterion by criterion, assign each a sub-score"; margin / sliding-window / best-of-N / max-rounds mechanics. License not stated.
- `docs/plans/AGENTS.md:111-143` — self-review rubric (7 checks + cold-handoff), produce-vs-critique framing.
- `docs/plans/AGENTS.md:140-143` — the proportionality rule Step 1 replaces with the tiered policy.
- `plugins/docks/skills/productivity/plan-review/SKILL.md:35-55` — Mode 0 draft review: "Report findings … OR return them to the dispatching agent. Do NOT write a `## Review` block" — the return-not-write basis for the write-ownership rule.
- `plugins/docks/skills/productivity/plan-manager/SKILL.md:19` + Step 6 (`:92-99`) — self-review constraint + the big/risky → fresh-context-subagent dispatch hook plan-manager owns.
- `plugins/docks/skills/AGENTS.md` → "Plan-skill contract sync (two homes)" — Steps 1+2 must land together.
- `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md:105-125` — second home of the rubric.
- `plugins/docks/agents/plan-review.md:66`, `plan-manager.md:67` — both: "The skill body is the source of truth … not by widening this agent" — the verify-only basis for Step 5.

## Notes

Supersedes `plan-optimizer-integration-claude.md` and
`plan-optimizer-integration-codex.md` (both archived to `finished/` with a
supersede note). The merge keeps `-claude`'s concrete constants + checkable
acceptance + resolved decisions and `-codex`'s decision matrix + smoke test +
tiered policy + data-flow/thin-wrapper discipline.

**Attribution (decided):** the contract (`docs/plans/AGENTS.md` + synced
template) and `plan-review`'s `## References` credit Sean Geng +
https://seangeng.com/writing/iterate-a-plan-until-it-stops-improving.
`plan-manager` has no `## References` section, so attribution lands in those
homes, not in every changed file.

**Failure mode (Steps 3–4–7):** a `content_hash` idempotency failure at the CI
gate after editing the SKILL bodies — re-run the project's content-hash backfill
and re-check before assuming a real regression (a stale stored hash looks like
drift but is fixed by the backfill, not a code change).

**Execution (2026-06-23, branch `feat/plan-optimizer-loop`):** all 7 steps done.
Edited 4 contract/skill homes (`docs/plans/AGENTS.md`, the plan-init template,
`plan-review` + `plan-manager` SKILL bodies); bumped `metadata.updated` on the 3
touched skills and re-synced their `content_hash`. Step 5 confirmed the two agent
wrappers stayed thin (`git diff plugins/docks/agents/` empty — the verify-only
call held). Step 6 smoke test ran the loop on a throwaway and recorded
`Score: 88/100 · trajectory 50→81→88→88→88 · stopped: plateau (K=3)`, then deleted
it (git-clean). Step 7 `node scripts/ci.mjs` exited 0 (skills eng 224 / prod 188,
agents 30 / floor 28, content_hash idempotency in sync). All 8 acceptance criteria
verified green.
