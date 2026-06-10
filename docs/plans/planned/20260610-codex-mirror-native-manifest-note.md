---
title: Note Codex native .claude-plugin discovery in codex-plugin-mirror
goal: codex-plugin-mirror reflects that Codex discovers .claude-plugin/plugin.json natively, re-scoping the mirror to the marketplace catalog, degradation surfacing, and version lockstep
status: planned
created: "2026-06-10T05:25:00+00:00"
updated: "2026-06-10T05:25:00+00:00"
started_at: null
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: null
tags: [skills, codex, project-local]
affected_paths:
  - .agents/skills/codex-plugin-mirror/SKILL.md
related_plans: [2026-06-10-capability-tuning-research-rollout]
review_status: null
---

# Note Codex native .claude-plugin discovery in codex-plugin-mirror

## Goal

The project-local `codex-plugin-mirror` skill currently frames `.codex-plugin/plugin.json` generation as required for Codex to see a Claude plugin. Research (2026-06-10) found Codex natively discovers `.claude-plugin/plugin.json` as an alternate manifest path (`DISCOVERABLE_PLUGIN_MANIFEST_PATHS = [".codex-plugin/plugin.json", ".claude-plugin/plugin.json"]` in `codex-rs/utils/plugins/src/plugin_namespace.rs`). The skill should state this fact and re-scope its pitch: the mirror's remaining value is (a) the Codex marketplace catalog (`.agents/plugins/marketplace.json`), (b) the Codex-specific `interface` block + "(skills only)" degradation surfacing, and (c) version lockstep across manifests. Success = the skill no longer implies a `.codex-plugin` manifest is mandatory for discovery, with a date-stamped source.

## Context

Follow-up filed by plan-review on the capability-tuning research rollout (ship d1ded75). Single-file change to a project-local (non-shipped) skill; tracked as a plan because the user requested it explicitly.

## Steps

| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Re-verify DISCOVERABLE_PLUGIN_MANIFEST_PATHS in openai/codex source at implementation time | — | — | planned | main |
| 2 | Update SKILL.md: framing paragraph + a "native discovery" fact note + trap-table row; bump metadata.updated | 1 | — | planned | main |
| 3 | Run the repo validators (ci.sh), commit + push | 2 | — | planned | main |

## Acceptance criteria

- [ ] SKILL.md states Codex natively discovers `.claude-plugin/plugin.json` (with source + verification date)
- [ ] Mirror's value proposition re-scoped to marketplace catalog + interface/degradation + version lockstep — nothing implies the `.codex-plugin` manifest is required for discovery
- [ ] `metadata.updated` bumped; ci.sh green; pushed

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

(filled by plan-review on completion)
