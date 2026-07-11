---
title: Mandatory cross-company dual plan review + orchestrator-selection doctrine
goal: Codify a mandatory two-reviewer (cross-company + same-company) plan review into the plan lifecycle skills, plus orchestrator-model-selection guidance, so every plan is red-teamed by the best model of the other company AND a second instance of its own before execution.
status: planned
created: "2026-07-11T14:44:27-03:00"
updated: "2026-07-11T14:44:27-03:00"
started_at: null
assignee: null
tags: [plan-lifecycle, skills, review-policy, session-relay]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-review/SKILL.md
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
related_plans: []
review_status: null
planned_at_commit: "9e0bd6ab69bffc565a240139cb598af120b3bec9"
---

# Mandatory cross-company dual plan review + orchestrator-selection doctrine

## Goal

Make independent review of a plan **mandatory and cross-company**, not optional and single-sourced. Today the kit offers an *optional, picker-gated, single* cross-tool second opinion (`plan-manager` "Optional cross-tool second opinion"; `plan-review` "Cross-tool second opinion") and a manual "red-team pair spawn" in the session-relay skill. This plan upgrades that to a standing rule: **every plan drafted with plan-manager is reviewed, before execution, by (a) the best available model of the OTHER company AND (b) a second independent instance of the author's own model** — both read-only red-teams, findings reconciled by the orchestrator. It also codifies an **orchestrator-selection doctrine** (default orchestrator = strongest available model run as the *interactive* session; explicit relay-vs-subagent judgment per task) to the extent that belongs in this repo. Success = the skills + `docs/plans/AGENTS.md` encode the dual-review contract with pinned model tiers and graceful degradation, and the policy is self-demonstrated by having been dual-reviewed itself.

## Context & rationale

Verbatim user intent (2026-07-11), sharpened into a policy statement:

1. **Default orchestrator = the strongest available model, run as the interactive session.** Prefer gpt-5.6-sol (Codex) as the standing orchestrator when available: it is the kit's strongest reasoner AND it avoids Claude's `claude -p --resume` cache-miss penalty on relay wakes. The orchestrator is always the session the human drives directly — never a headless-woken session — so its prompt cache stays warm. Reserve long-transcript relay wakes for when existing context is essential; otherwise prefer fresh short spawns. *(User: "the bigger issue with claude currently via relay is that it has non cache hits via its calls … which is via claude -p"; "since gpt 5.6 sol is more intelligent, shouldn't it be the orchestrator".)*
2. **Orchestrator judgment — relay vs in-session subagents.** For each delegated unit, pick the cheapest sufficient mechanism: an in-session subagent/Task when the work belongs to THIS session/project (fast, cache-warm); a relay spawn/wake only when it needs another project's context, another tool, or a durable resumable session. *(User: "be able to evaluate its relay or whether just use agents".)*
3. **Mandatory cross-company dual review (the core rule).** Every plan, once drafted with plan-manager, is reviewed before acceptance by TWO independent read-only reviewers:
   - **(a) the best available model of the OTHER company** (cross-company red-team). Author gpt-5.6-sol (OpenAI) → reviewer best Claude: `fable` effort high, or `opus` effort xhigh. Author Claude → reviewer gpt-5.6-sol effort xhigh.
   - **(b) a second independent instance of the author's own model** (same-company second opinion): a fresh gpt-5.6-sol for a gpt-sol-authored plan; a fresh Claude for a Claude-authored plan.
   The orchestrator reconciles both findings and writes the verdict. Cross-company diversity catches blind spots a model family shares; the same-company second instance catches within-family reasoning slips. Generalizes the existing "red-team pair spawn." *(User: "gpt 5.6 sol developed a plan with plan manager, it should ask red team claude 'best' available to review that plan, and another gpt 5.6 sol to review it too. for claude's best 'fable' effort high or 'opus' effort xhigh.")*
4. **Codify in this repo** so it triggers automatically on plan draft/start, dispatched over session-relay with pinned model/effort per the tiers above. *(User: "something you could include here in this repo".)*

Why now: the kit already has all the mechanical pieces (session-relay bus, one-shot reviewer legs, the red-team pair). This plan promotes them from opt-in to a standing, attributed, dual-source contract — the highest-leverage quality gate for every downstream plan.

## Environment & how-to-run

- Node 24 + pnpm via corepack (`corepack enable && pnpm install --frozen-lockfile`).
- Validators: `node scripts/ci.mjs` (repo-wide) and `node scripts/ci.mjs --plugin session-relay`; skill gates include description-CSO, frontmatter, ≤500-line body, and `content_hash` sync. After editing any SKILL.md, its `metadata.updated` and `content_hash` must be refreshed (ci.mjs enforces the hash).
- Reviewer dispatch is over session-relay: `relay spawn <dir> --tool <codex|claude> --model <m> --effort <e> --name <reviewer> --reply-to <me> --read-only -- "<review task + plan path>"`, pinned per tier.

## Interfaces & data shapes

- **Dual-review attribution** (extends the existing single-reviewer format in `docs/plans/AGENTS.md`):
  ```markdown
  Cross-check (<YYYY-MM-DD>): [<company-B best> <model> <effort>] <N> findings (<sev>) — <accepted>/<rejected>; [<company-A second> <model> <effort>] <M> findings (<sev>) — <accepted>/<rejected>; [<author>] independently verified <ids> against source before accepting.
  DISAGREEMENT: <topic> — [reviewer-1] <pos> / [reviewer-2] <pos>. Kept: <choice> — decided by <orchestrator|user via picker>, because <one line>.
  ```
- **Model tier map** (dated 2026-07; the skill text must say "check the current tier list"): OpenAI best = `gpt-5.6-sol` effort `xhigh`; Claude best = `fable` effort `high` OR `opus` effort `xhigh`.
- **Availability degradation contract**: if the other company's model is unavailable (probe fails), record `Cross-check attempted <date>: <company-B> leg unavailable (<reason>)`, proceed with the same-company second opinion alone, and NEVER block the lifecycle on the missing leg (mirrors the existing single-leg STOP-condition rule).

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | Define the dual-review contract in the cross-tool source of truth: mandatory two-reviewer (cross-company + same-company) on plan draft/start, the tier map, the reconciliation/attribution grammar for TWO reviewers, and the availability-degradation fallback. | `docs/plans/AGENTS.md` (Cross-tool second opinions section) | — | planned |
| 2 | Update plan-manager: promote "Optional cross-tool second opinion" to the mandatory dual-review flow on new-plan draft and `start`; keep it read-only and orchestrator-reconciled; add the second-instance same-company leg; keep graceful skip when a company's model is unavailable. | `plugins/docks/skills/productivity/plan-manager/SKILL.md` + `metadata.updated`/`content_hash` | 1 | planned |
| 3 | Update plan-review: support both reviewer legs (cross-company + same-company second instance) for draft and completion review, with the two-reviewer attribution grammar; keep pins explicit. | `plugins/docks/skills/productivity/plan-review/SKILL.md` + `metadata.updated`/`content_hash` | 1 | planned |
| 4 | Fold the standing dual-review into the session-relay "Red-team pair spawn" so the pair is the default plan-review mechanism (cross-company + same-company), not a manual option. | `plugins/session-relay/skills/productivity/session-relay/SKILL.md` + `metadata.updated`/`content_hash` | 1 | planned |
| 5 | Add the orchestrator-selection doctrine (strongest-available orchestrator as the interactive session; relay-vs-subagent judgment; cache-warm rule) to the extent it belongs in this repo — see Open question `orchestrator-doctrine-home`. | TBD by open question | 1 | planned |

## Acceptance criteria

| ID | Criterion | Command | Expected |
|---|---|---|---|
| A1 | Dual-review contract is the source of truth. | `grep -c "cross-company" docs/plans/AGENTS.md` | ≥1; the section names both legs, the tier map, and the degradation fallback. |
| A2 | Skills encode the mandatory dual review. | `node scripts/ci.mjs` | Exit 0; plan-manager + plan-review + session-relay skills pass all gates incl. refreshed `content_hash`; bodies ≤500 lines. |
| A3 | Attribution grammar supports two reviewers. | inspect `docs/plans/AGENTS.md` diff | The `Cross-check` line has slots for company-B best AND company-A second, plus reconciliation. |
| A4 | Self-demonstration. | this plan's `## Review` | This plan was itself dual-reviewed (a gpt-5.6-sol leg is recorded in `## Self-review`; a fresh-Claude leg if run). |

## Out of scope / do-NOT-touch

- Consumer-side model/permission config and the user's global orchestration preferences — those live in the user's global config / `DocksDocks/public`, not docks (per root AGENTS.md "What does NOT belong in this repo"). Step 5's home is an open question precisely because of this boundary.
- No change to how plans are *executed*, only how they are *reviewed*.
- No new binaries, manifests, or version bumps.

## Cold-handoff checklist

1. File manifest — Steps name exact skill paths. ✅ (Step 5 pending the open question.)
2. Environment & commands — `node scripts/ci.mjs`, content_hash refresh. ✅
3. Interface/data contracts — dual-review attribution grammar + tier map + degradation. ✅
4. Executable acceptance — A1–A4 are commands/inspections. ✅
5. Out of scope — stated positively. ✅
6. Decision rationale — Context §1–4 (verbatim user intent). ✅
7. Known gotchas — availability degradation; content_hash gate; ambient-model pins forbidden. ✅
8. Global constraints — model pins dated + "check current tier list"; skills ≤500 lines. ✅
9. No undefined/forward terms — `N/A` Step 5 target is an explicit open question, not a silent TBD. ✅ (justified.)

## Open questions

*(surfaced via picker after this draft; see below)*

## Self-review

Score: **86/100** (draft) · single scored pass (moderate policy plan). Standalone executability 18/22 (Step 5 target is an open question, deliberately deferred); actionability 14/16; dependency order 12/12; evidence re-verify 9/10 (skills grepped this session at `plan-manager` L42-62, `plan-review` L95-111, `session-relay` L383+); goal coverage 11/12; executable acceptance 10/12 (A2/A3 partly inspection-based); failure mode 7/10; assumption→question 5/6. Enters no hill-climb (moderate, first score ≥85). Cross-company review of THIS plan is pending (a gpt-5.6-sol leg is being dispatched per the very policy it defines — self-demonstrating).

## Review

*(filled by plan-review on completion)*

## Sources

- `plugins/docks/skills/productivity/plan-manager/SKILL.md:42-62` — current OPTIONAL, picker-gated, single cross-tool second opinion + pinned draft-review leg.
- `plugins/docks/skills/productivity/plan-review/SKILL.md:95-111` — one-shot reviewer legs (draft + completion), single reviewer.
- `plugins/session-relay/skills/productivity/session-relay/SKILL.md:383-398` — manual "Red-team pair spawn" (a-team codex, b-team claude), orchestrator writes verdict.
- `docs/plans/AGENTS.md` "Cross-tool second opinions" — the attribution grammar this plan extends to two reviewers.
