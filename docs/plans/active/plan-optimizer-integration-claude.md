---
title: Fold iterate-until-plateau plan refinement into the self-review loop
goal: Port Sean Geng's plan-optimizer (scored iterate-until-plateau loop + best-of-N) into the existing docks self-review machinery instead of shipping a 4th plan-* skill.
status: planned
created: "2026-06-23T15:07:16-03:00"
updated: "2026-06-23T15:07:16-03:00"
started_at: null
assignee: null
tags: ["plan-system", "skill-enhancement", "research"]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md
  - plugins/docks/skills/productivity/plan-review/SKILL.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/agents/plan-review.md
  - plugins/docks/agents/plan-manager.md
related_plans: []
review_status: null
---

# Fold iterate-until-plateau plan refinement into the self-review loop

## Goal

Decide whether Sean Geng's **plan-optimizer** technique belongs in the docks
plugin, and if so, integrate it. The verdict (see `## Context`): **yes, but as
an enhancement to the existing self-review loop — not as a new standalone
skill.** The article's contribution is a *scored, iterative* critique
(score → critique → rewrite → repeat until the score plateaus, with a best-of-N
escape). docks already has the *qualitative, single-pass* version of exactly
this (draft in produce-mode → self-review in critique-mode against a 7-check
rubric). The work is to upgrade that single pass into a scored loop, in place,
proportional to plan size — reusing the one rubric docks already owns.

Success = the existing self-review becomes a scored iterate-until-plateau loop
for big/risky plans, defined **once** in `docs/plans/AGENTS.md` and synced to
the plan-init template, with no 4th plan-* skill added and `node scripts/ci.mjs`
green.

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
until plateau                          # no real gain over last K rounds (K≈3)
return best
```

- **Score** is a deliberate, separate pass — criterion by criterion, sub-score
  each. Weighted rubric dimensions: goal clarity, completeness, sequencing &
  dependencies, feasibility & resourcing, risks & mitigations, success metrics,
  specificity.
- **Stuck → best-of-N:** generate ~3 genuinely different versions in one round,
  score all, keep the winner.
- Reported trajectory example: `48 → 67 → 81 → 89 → 91 → 91`.

**What docks already has (the half that overlaps):** the plan lifecycle frames
drafting as *produce mode* and review as *critique mode*, and red-teams every
draft against a 7-check rubric + cold-handoff test before the user sees it
(`docs/plans/AGENTS.md:111-143`). Big/risky plans (>6 steps or a risk-flagged
step) already get a **fresh-context subagent** review — that subagent is
`plan-review` Mode 0 (`plugins/docks/skills/productivity/plan-review/SKILL.md:35-56`),
dispatched by `plan-manager` (`.../plan-manager/SKILL.md:19`, Step 6).

**The gap = exactly the article's delta:** docks's critique is a **single,
unscored pass**. The article makes it **iterative and scored until plateau**.
The article's 7 weighted dimensions map almost 1:1 onto docks's 7 self-review
checks — so this is an upgrade to existing machinery, not a new concept.

**Why enhance, not add a standalone skill** (decision, pending Q1):
- A 4th plan-* skill collides with `plan-manager` (both "improve a plan") and
  needs fresh `Not for…` routing clauses.
- It would put the rubric in a *third* home; the kit's "two homes" rule
  (`plugins/docks/skills/AGENTS.md` → "Plan-skill contract sync") already
  strains keeping `AGENTS.md` + the plan-init template in lockstep.
- A standalone skill wouldn't gate through the plan lifecycle; the whole point
  of docks plans is that the lifecycle *is* the gate.
- Folding in dogfoods the existing produce/critique framing and keeps one rubric.

**Full sync surface (≥ "two homes"):** the loop description must stay coherent
across **six** places, not two — `docs/plans/AGENTS.md` + the plan-init template
(the rubric's canonical pair), the `plan-review` + `plan-manager` SKILL bodies,
and their two thin agent wrappers. The "two homes" rule names the *contract*
pair; Steps 3–5 cover the other four. Step 6's CI gate is what proves they
didn't drift.

**Proportionality is non-negotiable** (`docs/plans/AGENTS.md:140-143`): the loop
multiplies token cost (N generate+score passes). Small plans (≤6 steps, no risk
flag) keep the cheap single inline pass; only big/risky plans get the loop. A
hard max-rounds cap bounds worst-case cost.

## Steps

| # | Task | Depends | Status |
|---|---|---|---|
| 1 | In `docs/plans/AGENTS.md`, extend the "Self-review" section concretely: add a `Weight` column to the existing 7-check rubric table (per-dimension weights summing to 100, mapped 1:1 to the article's 7 dimensions), then add a paragraph below the table documenting the iterate-until-plateau loop (MARGIN +2, sliding window K=3, hard max-rounds cap) and the best-of-N(3) escape when hill-climb stalls. Keep proportionality explicit: small = single inline pass, big/risky = scored loop. | — | planned |
| 2 | Sync the IDENTICAL edit (Weight column + loop paragraph) into `plugins/.../plan-init/references/plans-agents-md-template.md` (its "Self-review" section, ~line 105) — the "two homes" rule. The template's wording is condensed vs the contract, so mirror the *substance* (same Weight column, same loop terms), not byte-for-byte text. | 1 | planned |
| 3 | Rewrite `plan-review` Mode 0 (`SKILL.md:35-56`) to run the scored loop: score (deliberate separate pass) → critique top weaknesses → rewrite → re-score → stop at plateau or max-rounds; best-of-N when stuck; return the optimized draft + score breakdown + trajectory, still surfacing residual human decisions as `## Open questions`. Bump `metadata.updated`; re-sync `content_hash`. | 1 | planned |
| 4 | Update `plan-manager` Step 6 (`SKILL.md:92-99`): small plans = inline single-pass self-review (unchanged); big/risky = dispatch the now-iterative Mode 0 optimizer (the dispatch hook already exists) and record trajectory + final score in `## Self-review`. Bump `metadata.updated`; re-sync `content_hash`. | 3 | planned |
| 5 | Reconcile the thin Claude agents `plugins/docks/agents/plan-review.md` + `plan-manager.md` with Steps 3–4 — both bodies DO paraphrase Mode-0 / self-review behavior, so this is unconditional: each body must reference the scored loop + trajectory recording, and the agent scorer must stay ≥14 per file (agent scorer max 15, floor 14 — distinct from the 16-pt skill scorer). | 3,4 | planned |
| 6 | Run the project's validators/CI: skill guards + 16-pt skill scorer AND agent guards + agent scorer (max 15, floor 14) all green; content-hash idempotency green. Fix any floor regressions in-file (never loosen floors). | 2,3,4,5 | planned |

## Acceptance criteria

- [ ] `docs/plans/AGENTS.md` "Self-review" documents a weighted rubric + iterate-until-plateau (MARGIN, K, max-rounds cap) + best-of-N — verify by grep: `grep -nE "plateau|best-of-N|sliding window|Weight" docs/plans/AGENTS.md` returns the new lines.
- [ ] The plan-init template carries the synced substance — the SAME positive grep on the template returns the loop terms: `grep -nE "plateau|best-of-N|sliding window|Weight" plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md` is non-empty (the two-homes sync is verified by both greps hitting, not by a byte-diff of the already-divergent blocks).
- [ ] `plan-review` Mode 0 + `plan-manager` Step 6 describe the scored loop and the small-vs-big routing; both skills' `content_hash` re-synced (the idempotency check in the project's CI passes).
- [ ] The project's CI (`node scripts/ci.mjs`) exits 0 — all guards, the 16-pt skill scorer, and the agent scorer (floor 14) green, no loosened floors.
- [ ] No new top-level `plan-*` skill directory exists — `ls -d plugins/docks/skills/productivity/plan-*/` lists exactly `plan-init/`, `plan-manager/`, `plan-review/`.

## Out of scope

- A general-purpose (non-plan) optimizer skill.
- Auto-running the loop on every plan — proportionality keeps small plans single-pass.
- Vendoring Sean Geng's `plan-optimizer.zip` verbatim. License is unstated on the freebie page; we port the *technique* and attribute the source, we don't copy the file.
- Changing the open-questions surfacing (native picker) or any other lifecycle stage.

## Open questions

- **id: integration-shape** (choice; custom allowed)
  How should the technique land?
  - (a) Enhance the existing self-review / `plan-review` Mode 0 in place — one rubric, lifecycle-gated, no new skill. **(recommended)**
  - (b) Ship a standalone `plan-optimizer` skill alongside the existing three.
  - (c) Both — fold the loop into self-review AND expose a user-invocable `optimize plan <slug>` entry point.

- **id: loop-scope** (choice; custom allowed)
  When does the scored loop run?
  - (a) Big/risky plans only (>6 steps or a risk-flagged step) — matches the existing fresh-context-subagent trigger. **(recommended)**
  - (b) Every plan (small plans too).
  - (c) Only on explicit user request ("optimize this plan").

- **id: loop-constants** (choice; custom allowed)
  The loop's tunable constants (the article's defaults are MARGIN +2, sliding
  window K=3, best-of-N=3; only the hard rounds-cap is genuinely undecided).
  Adopt which set?
  - (a) Article defaults (MARGIN +2, K=3, N=3) + a **5-round** hard cap. **(recommended)**
  - (b) Article defaults + a **3-round** cap (cheaper, may under-optimize).
  - (c) Article defaults + an **8-round** cap (more thorough, higher token cost).
  - (custom) override MARGIN / K / N as well.

- **id: attribution** (choice; custom allowed)
  Credit the source in the skill/notes?
  - (a) Yes — name Sean Geng + the article URL in a `## Notes`/`## Sources` line of the changed skills. **(recommended)**
  - (b) No attribution.

## Self-review

Inline rubric pass + a fresh-context `plan-review` Mode 0 red-team (risk-flagged:
touches the cross-tool contract). All eight cited `file:line` sources re-verified
as accurate; dependency graph (1→2, 1→3→4→5→6) confirmed acyclic; Goal fully
covered by Steps 1–6. Holes the pass caught and fixed:

- **Score-edit shape was under-specified** (Steps 1–2): now names the concrete
  edit — a `Weight` column on the rubric table + a loop paragraph below it — so
  the "sync the identical edit" step has a definite shape to mirror.
- **Non-checkable acceptance criterion**: the `diff <(sed…) <(sed…)` check
  compared two already-divergent blocks (23 vs 15 lines) → replaced with a
  positive grep on both the contract and the template.
- **`ls | grep` expected output was wrong** (directories print trailing slashes)
  → switched to `ls -d …/plan-*/` with slashes in the expected output.
- **Step 5 had a conditional/vague done-condition** ("if their bodies describe…")
  → made unconditional with a checkable outcome (agent scorer ≥14 per file).
- **Skill (16) vs agent (15, floor 14) scorers were conflated** in Step 6 → split
  out; Step 5 now owns the agent-floor risk it actually creates.
- **Loop-constants asymmetry**: MARGIN/K/N were hard-coded while only the cap was
  an open question → folded all four into the `loop-constants` question.
- **"Two homes" undersold the surface** (really six places) → noted in `## Context`.

Remaining genuine human decisions are the four `## Open questions` (none were
silent guesses).

## Review

(filled by plan-review on completion)

## Sources

- `https://seangeng.com/writing/iterate-a-plan-until-it-stops-improving` — the technique: pseudocode, MARGIN +2, sliding window K=3, best-of-N(3), 7 weighted rubric dimensions, trajectory `48→67→81→89→91→91`.
- `https://seangeng.com/freebies/plan-optimizer` — the shipped `plan-optimizer` SKILL.md: "Score the current plan from 0 to 100… go criterion by criterion, assign each a sub-score"; margin/sliding-window/best-of-N mechanics.
- `docs/plans/AGENTS.md:111-143` — docks self-review rubric (7 checks + cold-handoff) and the produce-vs-critique framing the loop extends.
- `docs/plans/AGENTS.md:140-143` — proportionality rule: small = inline rubric, big/risky = fresh-context subagent.
- `plugins/docks/skills/productivity/plan-review/SKILL.md:35-56` — Mode 0 draft review (the single-pass red-team to be made iterative).
- `plugins/docks/skills/productivity/plan-manager/SKILL.md:19` + Step 6 (`:92-99`) — the self-review constraint and the big/risky → fresh-context-subagent dispatch hook.
- `plugins/docks/skills/AGENTS.md` → "Plan-skill contract sync (two homes)" — why Steps 1 and 2 must land in the same commit.
- `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md:105-125` — the second home of the rubric (the template plan-init writes into consumer projects).
- `plugins/docks/agents/plan-review.md`, `plan-manager.md` — thin opus wrappers to keep in lockstep (Step 5).

## Notes

This plan is itself the deliverable of the "could this be integrated?" question:
the answer is **yes, by enhancing the existing self-review into a scored loop**,
contingent on Q1. If the user picks (b) standalone skill, Steps 1–5 change shape
(author a new skill via `write-skill` instead of editing the contract) but the
rubric-sync and CI gate (Steps 2, 6) still apply.

**Failure mode (Steps 3–4–6):** the risk is a `content_hash` idempotency failure
at the CI gate after editing the SKILL bodies. If it fails, re-run the project's
content-hash backfill and re-check before assuming a real regression — a stale
stored hash looks identical to drift but is fixed by the backfill, not by a code
change.
