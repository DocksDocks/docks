---
title: Categorize skills/agents into folders with per-category scoring
goal: Split skills + agents into engineering/productivity/internal folders, declare in plugin.json, rebalance score floors per category
status: ongoing
created: 2026-05-24
updated: 2026-05-24
started_at: 2026-05-24
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: null
tags: [foundation, refactor, scoring]
affected_paths:
  - plugins/docks/.claude-plugin/plugin.json
  - plugins/docks/.codex-plugin/plugin.json
  - plugins/docks/skills/
  - plugins/docks/agents/
  - scripts/scoring.config.json
  - scripts/guard-skills.sh
  - scripts/score-skills.sh
  - scripts/guard-agents.sh
  - scripts/score-agents.sh
  - scripts/ci.sh
  - CLAUDE.md
related_plans: [skill-maintainer-fixes, tree-skill, codex-agents-dual-emit, scaffold]
review_status: null
---

# Categorize skills/agents into folders with per-category scoring

## Goal

Replace the flat `plugins/docks/{skills,agents}/<name>/` layout with a three-folder categorization (`engineering/`, `productivity/`, `internal/`); declare each category as an explicit path in `plugin.json` (depth-1 auto-discovery requirement); update guards and scorers to walk depth-2; rebalance score floors so each category gets a calibrated bar (engineering raised, internal lowered, productivity unchanged). The forked-* wrappers stop needing filler to clear an inappropriate floor; user-facing engineering skills get a higher bar.

## Context

Two coupled problems:

1. At ~30 skills the flat directory clutters — forked-* wrappers mixed with user-facing skills mixed with workflow tools. Naming prefixes (`docs-`, `forked-`, `plan-`) implicitly categorize today; folders make it explicit.
2. The uniform ≥8/16 score floor forces forked-* wrappers (thin `context: fork` helpers, ~30 lines) to inflate with filler to pass. Per-category floors fix the calibration.

They ship together: per-category scoring needs categories to scope to.

Structural plan — no behavior changes, no new skills, no new agents. Every later plan touches paths or validators that change here, so this lands first.

## Steps

| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Confirm category assignments with user | — | — | planned | self |
| 2 | Add `scripts/scoring.config.json` with per-category floors | 1 | with #3 | planned | self |
| 3 | Write `scripts/read-floor.sh <kind> <category>` helper | 1 | with #2 | planned | self |
| 4 | Update `plugins/docks/.claude-plugin/plugin.json` to declare category paths in `skills` + `agents` arrays | 1 | with #5 | planned | self |
| 5 | Mirror in `plugins/docks/.codex-plugin/plugin.json` | 1 | with #4 | planned | self |
| 6 | `git mv` every skill into its category folder | 4, 5 | with #7 | planned | self |
| 7 | `git mv` every agent into its category folder | 4, 5 | with #6 | planned | self |
| 8 | Update `guard-skills.sh` + `guard-agents.sh` to walk depth-2 | 6, 7 | with #9 | planned | self |
| 9 | Update `score-skills.sh` + `score-agents.sh` to read per-category floors | 6, 7 | with #8 | planned | self |
| 10 | Update root `CLAUDE.md` path references to use category subdirs | 6, 7 | — | planned | self |
| 11 | Add `scripts/ci.sh` sanity check: every plugin.json category dir exists, every skill/agent lives in a category | 8, 9 | — | planned | self |
| 12 | `bash scripts/ci.sh` green; iterate on floors if regressions are calibration-worthy | 2–11 | — | planned | self |
| 13 | `./scripts/release.sh patch` | 12 | — | planned | self |

### Step details

- **#1** — Proposed assignments (confirm or amend):
  - `skills/engineering/`: code-review, dep-vuln-workflow, design-tokenization, fix-workflow, human-docs-workflow, lint-no-suppressions, make-interfaces-feel-better, react-component-patterns, solid, tdd-workflow, test-coverage, type-safety-discipline
  - `skills/productivity/`: agents, caveman, plan-init, plan-manager, plan-review, write-skill, zoom-out
  - `skills/internal/`: forked-docs-categorizer, forked-docs-pattern-extractor, forked-docs-pattern-scanner, forked-docs-role-mapper, forked-refactor-dead-code-scanner, forked-refactor-duplication-scanner, forked-security-adversarial-hunter, forked-security-logic-analyzer, forked-security-vulnerability-scanner
  - `agents/engineering/`: refactor-*, security-*, docs-* agents
  - `agents/internal/`: plan-manager, plan-review (thin wrappers)
- **#2** — `scripts/scoring.config.json`:
  ```json
  {
    "skills": {
      "engineering":  { "per_file_floor": 10 },
      "productivity": { "per_file_floor": 8 },
      "internal":     { "per_file_floor": 4 }
    },
    "agents": {
      "engineering":  { "per_file_floor": 14 },
      "productivity": { "per_file_floor": 14 },
      "internal":     { "per_file_floor": 8 }
    }
  }
  ```
  Total floors stay count-derived: `sum(per_file_floor × count)` per category.
- **#4** — `plugin.json` change: `"skills": ["./skills/engineering", "./skills/productivity", "./skills/internal"]` and same shape for `"agents"`. Plugin auto-discovery is depth-1, so each category needs an explicit path entry.
- **#5** — Codex manifest's `skills` field accepts a string (`"./skills/"`) per the docs. Need to verify it accepts an array; if not, fall back to pointing at `.agents/skills/` (the canonical home that the bridge skill maintains).
- **#8** — Iteration change: `for skill_dir in "$DIR"/*/` → `for skill_dir in "$DIR"/*/*/`. Same in guard-agents.sh.
- **#9** — For each skill/agent, derive category from path (`basename $(dirname $file)`), look up floor in `scoring.config.json`, apply per-file check. Aggregate "total = N × per-file" still holds, but per-category.
- **#10** — Path references in CLAUDE.md will be revisited in plan tree-skill when the section relocates into `plugins/docks/skills/AGENTS.md`; light touch this round.

## Acceptance criteria

- [ ] Every existing skill/agent lives under a category folder; no skills at `skills/<name>/` directly
- [ ] `plugin.json` (both Claude and Codex) declares each category as a path; CI fails if a category dir referenced in the manifest doesn't exist on disk
- [ ] `score-skills.sh` and `score-agents.sh` apply per-category floors read from `scripts/scoring.config.json`
- [ ] Every skill clears its category's floor (or the floor is recalibrated against actual scores — see open questions)
- [ ] `bash scripts/ci.sh` green
- [ ] Root `CLAUDE.md` path references use new category subdirs (e.g., `plugins/docks/skills/productivity/agents/`)

## Out of scope

- No new skills, agents, or commands
- No behavior changes to existing skills
- No `misc/` category — defer until something genuinely doesn't fit
- Categorization of commands (only 3 today, no benefit)
- Renaming the `forked-` prefix once they live in `internal/` — defer to a separate plan with a sed pass over orchestration commands

## Mistakes & Dead Ends

(none yet — plan freshly written)

## Sources

- https://code.claude.com/docs/en/skills — Claude Code plugin skills are depth-1 auto-discovered; custom paths declared in plugin.json supplement defaults
- https://developers.openai.com/codex/plugins/build — Codex plugin manifest fields, `skills` path declaration
- `scripts/guard-skills.sh` (repo) — current depth-1 iteration pattern this plan changes
- `scripts/score-skills.sh` (repo) — current uniform-floor scoring that per-category replaces

## Blockers

(none — actionable immediately)

## Notes

- Open questions (resolve before or during step 1):
  - Does `agents/productivity/` ship empty as a slot, or skip the category until needed? Lean: skip — add when first plan lands.
  - Keep the `forked-` prefix on internal/ skills (`internal/forked-docs-categorizer`)? Tradeoff: nicer naming vs. silent breakage of every `Skill(skill: "docks:forked-…")` reference. Lean: keep this round; rename in a separate plan.
  - Score floor for `internal/` agents (≥8) — calibrate against actual scores first by running `score-agents.sh --per-file` and picking the floor 1-2 points below the lowest legitimate passing score.
- Plan tree-skill will later relocate authoring guidance out of root CLAUDE.md into `plugins/docks/skills/AGENTS.md`. This plan only updates path strings; the relocation itself is tree-skill's job.

## Review

(filled by plan-review on completion)
