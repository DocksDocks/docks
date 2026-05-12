---
title: Introduce on-demand references/ files in 6 skills
goal: Lift deep per-language/per-framework/per-tool content into references/ for solid, test-coverage, dep-vuln-workflow, lint-no-suppressions, code-review, fix-workflow — main SKILL.md becomes decision-tree + top-rules
status: planned
created: 2026-05-12
updated: 2026-05-12
started_at: null
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: null
tags: [skills, refactor, references]
affected_paths:
  - plugins/docks/skills/solid/
  - plugins/docks/skills/test-coverage/
  - plugins/docks/skills/dep-vuln-workflow/
  - plugins/docks/skills/lint-no-suppressions/
  - plugins/docks/skills/code-review/
  - plugins/docks/skills/fix-workflow/
related_plans: []
review_status: null
---

# Introduce on-demand references/ files in 6 skills

## Goal

Restructure 6 skills so each one's main SKILL.md becomes a thin **decision tree + top-rules + 1–2 BAD/GOOD pairs + 2–3 `<constraint>` blocks** that routes the agent to per-language, per-framework, or per-tool `references/<topic>.md` files for deep content. Mirrors the pattern proven in the prior audit:

- `react-component-patterns` — 94-LOC SKILL.md decision tree + 174-LOC `references/effects.md` + 298-LOC `references/composition.md`
- `type-safety-discipline` — TS-primary SKILL.md body + `references/{rust-newtype,kotlin-value-class,python-typing}.md`

Each restructured skill must:

- Keep its per-file scorer score ≥ 8 (current floor); preferably retain or improve its current 14–16 score
- Keep its CSO description tight (lead with concept triggers; first 100 chars matter most for matching)
- Retain at least one BAD/GOOD code pair and 2–3 `<constraint>` blocks in the main SKILL.md body (the scorer rewards both)
- Carry an unambiguous decision tree at the top of SKILL.md so the agent loads the right references file on first read

## Context

The prior skills-audit commit introduced the references/ pattern with concrete proof: an inactive skill costs nothing from references (they live on disk; only SKILL.md description loads into the session listing), and an active skill loads only the specific references file relevant to the task. This frees the SKILL.md body for tight rules + decision tree without bloating per-skill cost. The 6 candidate skills currently have monolithic bodies covering multiple stacks/tools/axes — they're exactly the cases where references would help.

Current state of the 6 affected skills (LOC = body line count from `wc -l`):

- `solid` — 228 LOC, TS-primary code examples, mentions Python/Go in passing but no deep examples
- `test-coverage` — ~161 LOC, generic 6-step framework but no per-framework templates
- `dep-vuln-workflow` — ~170 LOC, multi-ecosystem (pnpm/npm/yarn/pip/cargo/go) in main body
- `lint-no-suppressions` — ~117 LOC, ESLint-leaning examples
- `code-review` — ~145 LOC, covers bug/security/perf/maintainability/AI-slop axes
- `fix-workflow` — ~168 LOC, tier-1/2/3 plans but no per-finding-type templates

## Steps

| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Restructure `solid` → TS-primary SKILL.md + `references/{rust,python,go}-solid.md` (per-principle deep examples per language) | — | with #2-#6 | planned | null |
| 2 | Restructure `test-coverage` → generic 6-step body + `references/{jest-vitest,pytest,junit,cargo-test,go-test}.md` (per-framework templates: file layout, assertion idioms, mocking conventions, fixture patterns) | — | with #1,#3-#6 | planned | null |
| 3 | Restructure `dep-vuln-workflow` → triage process body + `references/{npm-pnpm,pip,cargo,go-mod}-playbook.md` (per-ecosystem audit commands, severity-triage flags, major-version upgrade order) | — | with #1,#2,#4-#6 | planned | null |
| 4 | Extend `lint-no-suppressions` → keep body lean + add `references/per-tool-catalog.md` (suppression syntax for ESLint, TS / `@ts-ignore` / `@ts-expect-error`, mypy `# type: ignore`, ruff `# noqa`, clippy `#[allow]`, golangci-lint `//nolint`, shellcheck `# shellcheck disable=`) | — | with #1-#3,#5,#6 | planned | null |
| 5 | Restructure `code-review` → SKILL.md as per-axis triage decision tree + `references/{security,perf,maintainability,ai-slop}.md` (per-axis finding catalogue, severity calibration, common false-positive guards) | — | with #1-#4,#6 | planned | null |
| 6 | Restructure `fix-workflow` → main body as tier-1/2/3 framework + `references/{security-fix,perf-fix,bug-fix}-templates.md` (per-finding-type plan templates with revert triggers and test strategy) | — | with #1-#5 | planned | null |
| 7 | Run `bash scripts/ci.sh` and `bash scripts/score-skills.sh --per-file` after EACH skill restructure; verify guard pass and per-file score ≥ 8 | 1-6 (incrementally) | — | planned | null |
| 8 | Update `metadata.updated` frontmatter on each restructured skill | 1-6 | — | planned | null |
| 9 | Commit: one commit per skill OR one batched commit (decide based on diff size; rule of thumb: batch if total <500 LOC changed, split if >500). Push to main. | 7, 8 | — | planned | null |

Status enum: `planned` / `in-flight` / `done` / `blocked` / `skipped`.

## Acceptance criteria

- [ ] All 6 skills restructured with at least one `references/` file each
- [ ] Each restructured skill's per-file score ≥ 8 (current floor); preferably ≥ 14
- [ ] `bash scripts/ci.sh` green end-to-end after each commit
- [ ] `grep -rn 'references/' plugins/docks/skills/{solid,test-coverage,dep-vuln-workflow,lint-no-suppressions,code-review,fix-workflow}/` confirms every named references file exists (no dangling pointers)
- [ ] Each SKILL.md body retains ≥1 BAD/GOOD code pair and ≥2 `<constraint>` blocks (scorer signal preservation)
- [ ] Description listing budget stays under 50% of `SLASH_COMMAND_TOOL_CHAR_BUDGET` (currently ~37% — net effect should be roughly flat since descriptions don't grow)
- [ ] Manual sanity check: read each restructured SKILL.md in isolation and confirm the decision tree unambiguously routes to the correct references file

## Out of scope

- Skills NOT in the 6-skill list (tdd-workflow, agents, plan-init/manager/review are already tight or orchestration-only; design-tokenization and make-interfaces-feel-better already have references; type-safety-discipline and react-component-patterns are the predecessors)
- The `forked-*` orchestration wrappers (intentionally tiny; references would be over-engineering)
- New skill additions
- Description rewrites (only update a description if extraction reveals it's now misleading)
- Cross-tool guard for SKILL.md ↔ references/ pointer validation — useful but separate plan
- Plugin manifest/marketplace.json edits (descriptions enumerate themes, not individual files; no change needed)
- Codex manifest regeneration (no Claude-side description changes here, so Codex side stays in sync via `release.sh` version lockstep alone)

## Mistakes & Dead Ends

(empty — append entries as the work proceeds)

## Sources

- `/home/docks/.claude/plans/analyze-the-whole-plugin-snappy-neumann.md` — the prior audit plan that established the references/ pattern, including the primary-language-first structure decision
- Latest commit on main: `refactor(skills): audit out stack-specific drift; merge + generalize + prune` — the predecessor that introduced `react-component-patterns` and `type-safety-discipline` as references-using exemplars
- `plugins/docks/skills/type-safety-discipline/SKILL.md` + `references/` — concrete example of TS-primary + per-language references (Rust/Kotlin/Python)
- `plugins/docks/skills/react-component-patterns/SKILL.md` + `references/` — concrete example of merged-skill-with-decision-tree (effects + composition)
- `scripts/score-skills.sh` — scorer mechanics; per-file floor 8/16; rewards `<constraint>` blocks (up to 3), BAD/GOOD code pairs, freshness, table density
- `scripts/guard-skills.sh` — structural validator (frontmatter, ≤500 lines, name-matches-dir)
- `CLAUDE.md` § "Authoring skills, commands & agents" — description budget, listing truncation rules (1,536 chars per description, 8K total at default budget)
- agentskills.io specification — references/ files load on-demand only when SKILL.md body instructs Read

## Blockers

(none — actionable immediately)

## Notes

- **Scorer signal preservation:** the scorer rewards `<constraint>` blocks (≤3 max credit) and BAD/GOOD code pairs in the SKILL.md body. When extracting content to references/, ensure each main SKILL.md retains the most-illustrative BAD/GOOD pair AND 2–3 strongest `<constraint>` blocks. If a skill currently has 3 constraints, redistribute carefully — don't drop below 2.
- **Cross-reference discipline:** every references/<file>.md mentioned in SKILL.md must exist. There is no validator for this yet — manual grep check after each restructure (acceptance criterion #4 above covers this).
- **Per-language scope decisions:**
  - `solid`: TS-primary (current state) + Rust + Python + Go = 4 references files. Skip Kotlin/Swift unless trivial; kit users skew JS/Python/Rust/Go.
  - `test-coverage`: Jest+Vitest combined (npm ecosystem) + pytest + JUnit + cargo test + go test = 5 references files
  - `dep-vuln-workflow`: npm+pnpm combined + pip + cargo + go mod = 4 playbook references files
- **Single vs multiple references for `lint-no-suppressions`:** one consolidated `per-tool-catalog.md` is fine here because the suppression-syntax topic is narrow (just the syntax forms per tool, plus one universal rule: "include a reason on the same line"). Don't fragment.
- **Description budget impact:** descriptions don't grow in this plan (only bodies and references move). Listing budget impact ≈ 0.
- **Body line-count target:** after restructure, aim for 80–200 LOC in each SKILL.md (well within scorer sweet spot 80–310). Current bodies are 117–228 LOC, so most have headroom even before extraction.
- **Commit strategy decision:** prefer per-skill commits unless a single skill's diff is trivial (<50 LOC), in which case batch with the next one. Avoid one mega-commit covering all 6 — review burden too high.

## Evidence log

- **2026-05-12T16:07:30-03:00** — Plan created — assistant (Claude Opus 4.7)

## Review

(empty — `plan-review` will fill on ship)
