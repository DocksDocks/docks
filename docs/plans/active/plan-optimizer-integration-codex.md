---
title: Evaluate plan optimizer integration for docks
goal: Decide whether Sean Geng's plan-optimizer loop belongs in docks as a new skill or as an upgrade to existing plan lifecycle skills, then implement the chosen path safely.
status: planned
created: "2026-06-23T15:05:18-03:00"
updated: "2026-06-23T15:05:18-03:00"
started_at: null
assignee: null
tags: [plans, skills, research, codex]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/docks/skills/AGENTS.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-review/SKILL.md
  - plugins/docks/skills/productivity/plan-init/SKILL.md
  - plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md
related_plans: [plans-v2-md-only]
review_status: null
---

# Evaluate plan optimizer integration for docks

## Goal

Determine whether the external plan-optimizer idea should become a new docks skill or improve existing plan-related skills, then ship the smallest cross-tool change that gives docks plans a stronger hardening loop without duplicating the current plan lifecycle.

## Context

User request: understand whether the skill from <https://seangeng.com/writing/iterate-a-plan-until-it-stops-improving> can be integrated into the docks plugin, or whether existing plan-related skills would benefit from it, and create this plan with a `-codex.md` suffix using `docks:plan-manager`.

Initial read: do not vendor the upstream Claude Code skill as-is. Docks already has `plan-manager` for plan creation and transitions, `plan-review` for draft/finished review, and `plan-init` for propagating the docs/plans contract. The most likely fit is to strengthen the existing draft self-review path with a bounded score -> critique -> rewrite loop, margin guard, plateau stop, and optional best-of-N escape for big/risky plans. A standalone docks skill is still allowed if the decision matrix proves it should optimize arbitrary non-`docs/plans` plans without colliding with `plan-manager` and `plan-review`.

## Steps

| # | Task | Depends | Status |
|---|---|---|---|
| 1 | Re-read the upstream article and published `plan-optimizer/SKILL.md`; extract only portable concepts: task-specific rubric, separate scoring pass, critique-before-rewrite, score margin, plateau stop, best-of-N escape, concise score trajectory output. | - | planned |
| 2 | Build a decision matrix for integration shape: (A) enhance `plan-manager` new-plan drafting, (B) enhance `plan-review` draft-review mode, (C) add a standalone `plan-optimizer` skill for arbitrary plans, (D) no integration. Score against lifecycle fit, trigger collision, token cost, cross-tool wording, and validation burden. | 1 | planned |
| 3 | Implement the selected minimal path. Expected default: update `plan-manager` to run a bounded optimizer loop only for substantive or user-requested hardening, and update `plan-review` draft mode so it can red-team the loop output; if Step 2 chooses a standalone skill, first update this plan's `affected_paths` with the new skill path. | 2 | planned |
| 4 | If any plan contract changes, update all contract homes in the same commit: current `docs/plans/AGENTS.md`, `plan-init/references/plans-agents-md-template.md`, and any affected `plan-*` skill wording. | 3 | planned |
| 5 | Check skill-trigger routing. Ensure descriptions and "Not for..." clauses prevent ambiguous matches among `plan-manager`, `plan-review`, any new optimizer skill, and non-plan skills that already use scoring loops. | 3 | planned |
| 6 | Re-sync changed skill metadata and hashes, then validate with the narrowest useful gates first and `node scripts/ci.mjs` before commit. | 3,4,5 | planned |
| 7 | Smoke-test the behavior on a throwaway or existing draft plan: confirm it produces a better plan, a per-criterion score, a visible trajectory, and stops because of plateau/max-rounds rather than continuing indefinitely. Remove any throwaway artifact before shipping. | 6 | planned |

## Acceptance criteria

- The final implementation explicitly documents the chosen shape: existing `plan-*` upgrade, standalone skill, or no integration, with the decision matrix rationale.
- If `plan-*` behavior changes, `docs/plans/AGENTS.md` and `plan-init/references/plans-agents-md-template.md` stay in sync with the skill body changes.
- The optimizer behavior is bounded: objective rubric, score margin, max rounds, plateau stop, and at most one best-of-N escape unless the user asks for more.
- Trigger text does not make `plan-manager`, `plan-review`, and any optimizer path fight over the same user prompt.
- Validation passes: changed skills have fresh `metadata.updated` values where meaning changed, content hashes are re-synced, relevant skill scores stay above floor, and `node scripts/ci.mjs` exits 0.
- A smoke test demonstrates the loop on a plan and records the score trajectory plus the substantive changes it made.

## Out of scope

- Installing the upstream ZIP directly into this repo or into a user's personal Claude Code skills directory.
- Adding a generic optimizer for non-plan artifacts unless Step 2 proves a standalone plan optimizer skill is the right plugin surface.
- Changing the docs/plans storage model, status lifecycle, or auto-commit behavior beyond what the optimizer loop requires.
- Delegating execution to plugin-shipped subagents; the shipped plugin surface remains cross-tool skills.

## Self-review

- **Actionability:** Split the work into a source extraction step, an explicit decision matrix, implementation, contract sync, trigger-collision check, validation, and smoke test.
- **Dependency order:** Contract updates wait until the integration shape is chosen; validation waits until metadata/hash changes are complete.
- **Evidence re-verify:** Sources below were opened in this session. The plan cites current line numbers for local contract and skill behavior rather than relying on memory.
- **Goal coverage:** Added the "no integration" branch so the plan can satisfy the user's "understand if" request even if the right answer is not to ship code.
- **Checkable acceptance:** Validation uses concrete commands and a smoke test with observable trajectory output.
- **Failure mode:** If scoring loops bloat the always-loaded skill descriptions or cause trigger collisions, Step 2/5 should select a narrower `plan-review` draft-review enhancement or no new skill instead of creating a broad optimizer.
- **Assumption to question:** No user decision is needed before implementation; the plan records a default recommendation but requires evidence-based selection before edits.

## Sources

- <https://seangeng.com/writing/iterate-a-plan-until-it-stops-improving> - article source for rubric-first planning, critique/rewrite separation, margin guard, plateau stop, and best-of-N escape.
- <https://seangeng.com/freebies/plan-optimizer> - published `plan-optimizer/SKILL.md` source for trigger wording, score trajectory output, max-rounds guard, and plateau policy.
- `plugins/docks/skills/productivity/plan-manager/SKILL.md:18` - current new-plan flow already requires draft -> self-review before the user sees the plan.
- `plugins/docks/skills/productivity/plan-manager/SKILL.md:92` - new-plan scaffolding is the likely integration point for a stronger hardening loop.
- `plugins/docks/skills/productivity/plan-review/SKILL.md:35` - draft-review mode already red-teams non-finished plans without looking for a diff.
- `plugins/docks/skills/productivity/plan-review/SKILL.md:41` - draft-review rubric is the existing lightweight scorer/checklist surface.
- `docs/plans/AGENTS.md:111` - per-project plans contract defines the current draft self-review pass.
- `docs/plans/AGENTS.md:233` - audit-first scaffolding requires every cited source and affected path to be read in-session.
- `plugins/docks/skills/productivity/plan-init/SKILL.md:151` - `plan-init` owns the template that propagates plan contract changes into consumer projects.
- `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md:105` - generated plans contract already includes the self-review rubric that must stay synchronized.
- `plugins/docks/skills/AGENTS.md:63` - plan contract changes must land in `plan-*` skills and the generated docs/plans contract together.
- `plugins/docks/skills/AGENTS.md:17` - skill descriptions require trigger discipline and collision checks if a new skill is added.
- `plugins/docks/.claude-plugin/plugin.json:19` - Claude plugin manifest exposes the productivity skill root, so a new productivity skill would be discovered without a per-skill manifest entry.
- `plugins/docks/.codex-plugin/plugin.json:21` - Codex plugin manifest exposes the whole skills root, so a new productivity skill would be discovered without a per-skill manifest entry.

## Review

(filled by plan-review on completion)
