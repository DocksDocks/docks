---
title: Optimize all skill prompts, harden validator scripts, revalidate kit
goal: Every shipped skill + reference audited and improved (CSO, facts, structure), validator scripts hardened, all guards/scorers green, queued codex-mirror plan shipped
status: ongoing
created: "2026-06-10T05:31:43+00:00"
updated: "2026-06-10T05:31:43+00:00"
started_at: "2026-06-10T05:31:43+00:00"
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: null
tags: [skills, scripts, audit, quality]
affected_paths:
  - plugins/docks/skills/
  - scripts/
  - .agents/skills/codex-plugin-mirror/SKILL.md
  - docs/plans/
related_plans: [20260610-codex-mirror-native-manifest-note, 2026-06-10-capability-tuning-research-rollout]
review_status: null
---

# Optimize all skill prompts, harden validator scripts, revalidate kit

## Goal

Auto-mode full-kit pass (user /goal): (1) audit every shipped skill body + references for prompt quality — CSO descriptions, factual drift, constraint placement, slop, cross-tool wording, structure rewards — and apply improvements; (2) review validator scripts (guards/scorers/ci) for hardening and tooling gaps and apply safe upgrades; (3) revalidate everything (guards + scorers + plugin validate green); (4) execute the queued codex-mirror-native-manifest-note plan as part of the skill-review sweep.

## Context

Follows the capability-tuning research rollout (d1ded75). Baseline at start: 27 shipped skills scoring 8–16 (floors eng 10 / prod 8); low scorers caveman 8, zoom-out 9, make-interfaces-feel-better 10 (vendored — body frozen), lint-no-suppressions 13, write-skill 14. Three sub-80-line bodies lose the 2-pt sweet-spot reward legitimately fixable with real content (gotchas, BAD/GOOD).

## Steps

| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Fan out 3 read-only audits: engineering skills, productivity skills, scripts | — | 3-way | in-flight | audit agents |
| 2 | Implement queued codex-mirror-native-manifest-note plan (start → ship) | — | with #1 | planned | main |
| 3 | Apply per-skill prompt improvements from audit findings (evidence-gated) | 1 | — | planned | main |
| 4 | Apply script/guard hardening from audit findings (no floor-loosening) | 1 | — | planned | main |
| 5 | Bump metadata.updated + content-hash backfill for every meaning-changed skill | 3 | — | planned | main |
| 6 | Full revalidation: ci.sh green, per-file scores ≥ baseline, commit + push | 4, 5 | — | planned | main |

## Acceptance criteria

- [ ] Every shipped skill reviewed with per-file disposition (improved / clean / vendored-frozen)
- [ ] No skill scores below its baseline; low scorers (caveman, zoom-out, lint-no-suppressions, write-skill) raised with real content, not gaming
- [ ] Scripts reviewed; safe hardening applied; no validator floor loosened
- [ ] codex-mirror-native-manifest-note shipped + reviewed
- [ ] bash scripts/ci.sh exits 0; pushed to claude/dreamy-dijkstra-xu8opp

## Out of scope

- Rewriting the vendored make-interfaces-feel-better body (upstream-verbatim by policy)
- Release tagging / version bumps
- New skills beyond what audits justify

## Mistakes & Dead Ends

## Sources

- bash scripts/skills/score.sh --per-file baseline 2026-06-10T05:31 — see Context
- plugins/docks/skills/AGENTS.md — authoring + cross-tool wording rules (refreshed 2026-06-10)

## Blockers

## Notes

- Goal set via /goal (auto mode) — no approval gates; CI is the gate.

## Evidence log

- **2026-06-10T05:31:43+00:00** — Plan created; baseline scores captured — main

## Review

(filled by plan-review on completion)
