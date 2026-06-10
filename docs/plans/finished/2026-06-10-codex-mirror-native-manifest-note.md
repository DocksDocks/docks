---
title: Note Codex native .claude-plugin discovery in codex-plugin-mirror
goal: codex-plugin-mirror reflects that Codex discovers .claude-plugin/plugin.json natively, re-scoping the mirror to the marketplace catalog, degradation surfacing, and version lockstep
status: finished
created: "2026-06-10T05:25:00+00:00"
updated: "2026-06-10T05:35:26+00:00"
started_at: "2026-06-10T05:31:43+00:00"
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: 71bfdb79028d24e05a07d63b48fd2c8c9c61b78f
tags: [skills, codex, project-local]
affected_paths:
  - .agents/skills/codex-plugin-mirror/SKILL.md
related_plans: [2026-06-10-capability-tuning-research-rollout]
review_status: passed
---

# Note Codex native .claude-plugin discovery in codex-plugin-mirror

## Goal

The project-local `codex-plugin-mirror` skill currently frames `.codex-plugin/plugin.json` generation as required for Codex to see a Claude plugin. Research (2026-06-10) found Codex natively discovers `.claude-plugin/plugin.json` as an alternate manifest path (`DISCOVERABLE_PLUGIN_MANIFEST_PATHS = [".codex-plugin/plugin.json", ".claude-plugin/plugin.json"]` in `codex-rs/utils/plugins/src/plugin_namespace.rs`). The skill should state this fact and re-scope its pitch: the mirror's remaining value is (a) the Codex marketplace catalog (`.agents/plugins/marketplace.json`), (b) the Codex-specific `interface` block + "(skills only)" degradation surfacing, and (c) version lockstep across manifests. Success = the skill no longer implies a `.codex-plugin` manifest is mandatory for discovery, with a date-stamped source.

## Context

Follow-up filed by plan-review on the capability-tuning research rollout (ship d1ded75). Single-file change to a project-local (non-shipped) skill; tracked as a plan because the user requested it explicitly.

## Steps

| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Re-verify DISCOVERABLE_PLUGIN_MANIFEST_PATHS in openai/codex source at implementation time | — | — | done | main |
| 2 | Update SKILL.md: framing paragraph + a "native discovery" fact note + trap-table row; bump metadata.updated | 1 | — | done | main |
| 3 | Run the repo validators (ci.sh), commit + push | 2 | — | done | main |

## Acceptance criteria

- [x] SKILL.md states Codex natively discovers `.claude-plugin/plugin.json` (with source + verification date) — "Scope note" paragraph + trap row
- [x] Mirror's value proposition re-scoped to marketplace catalog + interface/degradation + version lockstep — nothing implies the `.codex-plugin` manifest is required for discovery
- [x] `metadata.updated` bumped; ci.sh green (exit 0); shipped as 71bfdb7

## Out of scope

- Changing the mirror's generation behavior (an explicit `.codex-plugin/plugin.json` stays valuable: Codex-tailored description, `interface` block, `skills` path string)
- Plugin version bumps or release tagging
- The shipped `skill-agent-pipeline` references (already updated in d1ded75)

## Mistakes & Dead Ends

## Sources

- openai/codex `codex-rs/utils/plugins/src/plugin_namespace.rs` — `DISCOVERABLE_PLUGIN_MANIFEST_PATHS` includes `.claude-plugin/plugin.json` (verified 2026-06-10)
- docs/plans/finished/2026-06-10-capability-tuning-research-rollout.md — Review → Follow-ups (origin of this plan)

## Blockers

## Notes

## Evidence log

## Review

- **Goal met:** yes — Scope-note paragraph + trap row land the native-discovery fact (re-verified against openai/codex HEAD at implementation time) and re-scope the mirror's pitch; all 3 criteria evidence-verified against the 71bfdb7 diff.
- **Regressions:** none — change is additive prose in a project-local skill; full guard+scorer suite green.
- **CI:** pass (`✔ All ci.sh checks passed`, exit 0, run pre-ship this turn)
- **Follow-ups:** none — unannounced rider in the ship commit is the umbrella plan file (20260610-full-kit-prompt-optimization.md), expected.
- Filed by: plan-review on 2026-06-10T05:35:26+00:00
