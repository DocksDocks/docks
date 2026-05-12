---
title: Smoke-test the docks:plans handoff-grade redesign
goal: Verify the new docs:plans schema, 3-tier pretty-print, and skill workflow end-to-end via this very plan
status: planned
created: 2026-05-12
updated: 2026-05-12
started_at: null
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: null
tags: [meta, dogfood]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/docks/skills/plan-init/references/plans-agents-md-template.md
  - plugins/docks/skills/plan-init/SKILL.md
  - plugins/docks/skills/plan-manager/SKILL.md
  - plugins/docks/skills/plan-review/SKILL.md
  - plugins/docks/agents/plan-manager.md
  - plugins/docks/agents/plan-review.md
  - plugins/docks/commands/plan.md
  - AGENTS.md
related_plans: []
review_status: null
---

# Smoke-test the docks:plans handoff-grade redesign

## Goal

Validate that the rebuilt `docs:plans` convention works end-to-end. Concretely: a plan file using the new schema (with `goal`, `started_at`, `tags`, `affected_paths`, `related_plans`, `review_status` frontmatter plus the new `## Goal` / `## Steps` / `## Mistakes & Dead Ends` / `## Sources` / `## Evidence log` / `## Review` body sections) can be created, listed in three pretty-print tiers (goal-listing, bulk digest with category-specific age tokens, single-plan preview), moved through `planned/ → ongoing/ → finished/` with `started_at` set on first ongoing entry and `ship_commit` set on ship, and reviewed by the new `plan-review` skill which writes a structured `## Review` block.

## Context

The previous plans system worked but plan files were shallow (no `goal`, no structured `Steps` with parallelism, no `Mistakes & Dead Ends` journal, no `Sources` log, no `Review` section). Pretty-print used ambiguous `X days` tokens. The `/docks:plan` slash command had been over-built into a multi-arg dispatcher when the original intent was a one-shot bootstrap. This redesign moved every runtime operation into cross-tool skills triggered by natural language, deleted the slash command, and extended plan files into complete handoff documents. This smoke-test plan exists to dogfood the result.

## Steps

| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Update `docs/plans/AGENTS.md` with new schema + sections + age tokens | — | with #2 | done | self |
| 2 | Update `plan-init/references/plans-agents-md-template.md` in lockstep | — | with #1 | done | self |
| 3 | Create `plan-manager` skill | 1, 2 | with #4 | done | self |
| 4 | Create `plan-review` skill | 1, 2 | with #3 | done | self |
| 5 | Update `plan-init/SKILL.md` to mention new sibling skills | 1 | with #6, #7 | done | self |
| 6 | Refactor `plan-manager` agent to thin opus wrapper | 3 | with #7 | done | self |
| 7 | Create `plan-review` agent (thin opus wrapper) | 4 | with #6 | done | self |
| 8 | Delete `plugins/docks/commands/plan.md` | — | — | done | self |
| 9 | Update root `AGENTS.md` with `<constraint>` block | 3, 4 | — | done | self |
| 10 | Run `bash scripts/ci.sh` — verify guards + scorers green | 1–9 | — | done | self |
| 11 | Smoke-test: this plan file + lifecycle demonstration | 10 | — | in-flight | self |

### Step details

- **#1 + #2** — Lockstep edit. Both files received identical body content; only differences are the `{{ISO_DATE}}` placeholder (template) vs literal timestamp (canonical) and the wrapping 4-backtick code fence (template only).
- **#3 + #4** — New skills target 16/16 on `score-skills.sh` via 4 constraints each (capped at 3 for scoring), Wrong/Right traps table for BAD/GOOD credit, multiple code fences with language tags, body in 80–310 line sweet spot.
- **#6 + #7** — Agent bodies shrank to ~85 lines each but stayed substantive via the 4 (plan-manager) / 2 (plan-review) unique constraints + Workflow + Anti-Hallucination + Success Criteria + context7 mention. plan-manager scores 15/15; plan-review 14/15.
- **#10** — Full CI pass: 27 skills (score 406, floor 216), 3 commands (63/63 — perfect since plan.md deleted), 22 agents (320, floor 308).
- **#11** — This plan file IS the smoke test artifact; demonstrates schema, sections, and 3-tier pretty-print render.

## Acceptance criteria

- [x] All frontmatter fields documented in `docs/plans/AGENTS.md` are present and valid in this file (`title`, `goal`, `status`, `created`, `updated`, `started_at`, `assignee`, `blockers`, `blocked_reason`, `blocked_since`, `ship_commit`, `tags`, `affected_paths`, `related_plans`, `review_status`).
- [x] All 12 canonical body sections present with non-trivial content (or heading-only for optional sections 6–11).
- [x] `## Steps` table includes the `Depends` and `Parallel` columns with at least one row demonstrating each.
- [x] `## Mistakes & Dead Ends` entries follow the structured shape `**<date>**: <tried> → <why failed> → <how to avoid>`.
- [x] `## Sources` entries pair each URL with the concept it clarified.
- [ ] Plan moves through `planned/ → ongoing/ → finished/` with `started_at` set on first ongoing entry (NOT yet exercised — this plan is still in `planned/`).
- [ ] `plan-review` auto-fires on the `→ finished/` move and writes a structured `## Review` block (deferred until the redesign work ships and this plan moves to ongoing/finished).

## Out of scope

- Migration of existing plan files (none exist — all category dirs hold only `.gitkeep`).
- A plan-health scorer (`scripts/score-plans.sh`) — follow-up.
- `affected_paths`-based conflict detection between ongoing plans — follow-up.
- Codex-equivalent `.toml` subagent files — Codex consumes the skills directly; no subagent needed for plans.

## Mistakes & Dead Ends

- **2026-05-12**: First draft of the redesign added `/docks:plan` subcommands (`review`, `new`) on top of the existing `show/list/check-scheduled/migrate-from-roadmap` dispatcher → user clarified the original `/docks:plan` was only meant to bootstrap with no arguments, and runtime operations belong in skills → avoid by asking about a command's original scope BEFORE adding subcommands; check whether a skill could replace the command before extending it.
- **2026-05-12**: First draft of Tier-2 pretty-print used bare `6 days` with no contextual word → user pointed out "days" is ambiguous (since creation? in category? since last edit?) → avoid by always pairing age numbers with a category-specific contextual word (`6d queued`, `2d in flight`, `blocked 47d`, `fires in 5d`, `shipped 4d ago`); added `started_at` frontmatter so the `ongoing/` token is exact, not approximated.
- **2026-05-12**: First Tier-2 example showed a row in `ongoing/` tagged "blocked → see plan", which contradicts the convention (blocked plans live in `blocked/`, not `ongoing/`) → avoid by sanity-checking example rows against lifecycle rules before publishing them.

## Sources

- https://github.com/mattpocock/skills/blob/main/skills/productivity/handoff/SKILL.md — reference-driven handoff structure; inspires the "every plan is a complete handoff document" framing and the `## Sources` section pairing URLs with what each clarified
- https://github.com/vercel-labs/agent-browser — session-isolation pattern and deterministic refs (`@e1`); inspires the deterministic `#N` step IDs in the `## Steps` table
- https://learn.microsoft.com/en-us/agent-framework/workflows/orchestrations/handoff — decentralized routing; inspires the `Depends` + `Owner` columns as a routing graph declaration
- https://fast.io/resources/ai-agent-state-checkpointing/ — 4-layer checkpoint state (mission / tool-env / model-config / artifact-refs); maps to `goal/status`, `affected_paths`, `assignee`, `sources`/`related_plans`
- https://github.com/TauricResearch/TradingAgents — per-step decision log capturing what + WHY; inspires `## Mistakes & Dead Ends`
- `plugins/docks/agents/plan-manager.md` (pre-refactor) — the 7-step workflow whose substance migrated into the new `plan-manager` skill (now an 8-step workflow with new-plan scaffolding added)
- `plugins/docks/agents/refactor-post-verifier.md` — template for `plan-review` (validator-runner + delta-reporter pattern)

## Blockers

(none — actionable now; this plan tracks the redesign work that's already largely complete)

## Notes

- Eating own dog food: this plan uses every new frontmatter field and every new body section, including the 3-entry `## Mistakes & Dead Ends` populated with the actual planning-session mistakes from this redesign.
- `started_at: null` because this plan hasn't moved to `ongoing/` yet. When the redesign work ships and this plan transitions to `ongoing/` for the lifecycle demonstration, `plan-manager` will set `started_at` to that date — and never re-set it.
- `affected_paths` lists every file touched by the redesign so the eventual `plan-review` can run the scope-drift check.
- The two unchecked acceptance criteria (lifecycle move + plan-review run) are intentionally deferred — they require this plan to actually ship through the new system, which is a future verification step the user can drive after merging.

## Evidence log

- 2026-05-12T12:55 -03:00 — Plan research phase (three Explore agents: current-plans inventory, handoff/agent-browser research, sibling-agent reference patterns)
- 2026-05-12T13:10 -03:00 — User confirmed scope decisions: bundle bonus frontmatter, both auto+manual plan-review trigger, structured Mistakes entries
- 2026-05-12T13:30 -03:00 — User requested Codex equivalent via skills; plan extended to cross-tool skill-first architecture
- 2026-05-12T13:50 -03:00 — User clarified ambiguous "X days" tokens; pretty-print rewritten with category-specific age tokens + `started_at` field added
- 2026-05-12T14:10 -03:00 — User clarified `/docks:plan` was bootstrap-only (no arguments); plan rewritten skill-first, slash command deleted, root AGENTS.md `<constraint>` block added
- 2026-05-12T15:30 -03:00 — Implementation complete: `docs/plans/AGENTS.md` + plan-init template rewritten; `plan-manager` + `plan-review` skills created (both 16/16); plan-manager agent refactored to thin opus wrapper (15/15); plan-review agent created (14/15); `/docks:plan` command deleted; root AGENTS.md updated; `bash scripts/ci.sh` green
- 2026-05-12T15:45 -03:00 — This smoke-test plan file written as dogfood of the new schema

## Review

(filled by plan-review on completion)
