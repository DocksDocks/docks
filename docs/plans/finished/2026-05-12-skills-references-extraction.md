---
title: Introduce on-demand references/ files in 6 skills
goal: Lift deep per-language/per-framework/per-tool content into references/ for solid, test-coverage, dep-vuln-workflow, lint-no-suppressions, code-review, fix-workflow — main SKILL.md becomes decision-tree + top-rules
status: finished
created: 2026-05-12
updated: 2026-05-12
started_at: "2026-05-12"
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: 584a53dc62655de331cfd748a2d7dd016b779c0b
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
| 1 | Restructure `solid` → universal-language SKILL.md + `references/{typescript,rust,python,go}-solid.md` (per-principle deep examples per language) | — | with #2-#6 | **done** | self |
| 2 | Restructure `test-coverage` → generic 6-step body + `references/{jest-vitest,pytest,junit,cargo-test,go-test}.md` (per-framework templates: file layout, assertion idioms, mocking conventions, fixture patterns) | — | with #1,#3-#6 | **done** | self |
| 3 | Restructure `dep-vuln-workflow` → triage process body + `references/{npm-pnpm,pip,cargo,go-mod}-playbook.md` (per-ecosystem audit commands, severity-triage flags, major-version upgrade order) | — | with #1,#2,#4-#6 | **done** | self |
| 4 | Extend `lint-no-suppressions` → keep body lean + extract bash hook to `references/pre-commit-hook.md` + add `references/per-tool-catalog.md` (suppression syntax for ESLint, TS / `@ts-ignore` / `@ts-expect-error`, mypy, ruff, clippy, golangci-lint, shellcheck, pylint, Java) | — | with #1-#3,#5,#6 | **done** | self |
| 5 | Restructure `code-review` → SKILL.md as per-axis triage decision tree + `references/{security,perf,maintainability}.md` (per-axis finding catalogue, severity calibration, common false-positive guards; ai-slop merged into maintainability) | — | with #1-#4,#6 | **done** | self |
| 6 | Restructure `fix-workflow` → main body as tier-1/2/3 framework + `references/{security-fix,perf-fix,bug-fix}-templates.md` (per-finding-type plan templates with revert triggers and test strategy) | — | with #1-#5 | **done** | self |
| 7 | Run `bash scripts/ci.sh` and `bash scripts/score-skills.sh --per-file` after EACH skill restructure; verify guard pass and per-file score ≥ 8 | 1-6 (incrementally) | — | **done** | self |
| 8 | Update `metadata.updated` frontmatter on each restructured skill | 1-6 | — | **done** | self |
| 9 | Commit: one commit per skill OR one batched commit (decide based on diff size; rule of thumb: batch if total <500 LOC changed, split if >500). Push to main. | 7, 8 | — | **done** (6 per-skill commits chosen) | self |

Status enum: `planned` / `in-flight` / `done` / `blocked` / `skipped`.

## Acceptance criteria

- [x] All 6 skills restructured with at least one `references/` file each — confirmed: 20 references files total across the 6 skills (4 + 5 + 4 + 2 + 3 + 3 - 1 dual-use? actually: solid 4 + test-coverage 5 + dep-vuln 4 + lint-no-supp 2 + code-review 3 + fix-workflow 3 = 21)
- [x] Each restructured skill's per-file score ≥ 8 (current floor); preferably ≥ 14 — actual: solid 16, test-coverage 16, dep-vuln 15, lint-no-supp 13 (below ≥14 stretch target by 1 — body 72 LOC sits below sweet spot 80–310; acceptable given floor 8), code-review 16, fix-workflow 16
- [x] `bash scripts/ci.sh` green end-to-end after each commit — verified across all 6 commits
- [x] `grep -rn 'references/' plugins/docks/skills/{solid,test-coverage,dep-vuln-workflow,lint-no-suppressions,code-review,fix-workflow}/` confirms every named references file exists (no dangling pointers) — verified at 2026-05-12T17:38
- [x] Each SKILL.md body retains ≥1 BAD/GOOD code pair and ≥2 `<constraint>` blocks (scorer signal preservation) — all 6 retain ≥2 constraints + canonical BAD/GOOD or per-axis routing
- [x] Description listing budget stays under 50% of `SLASH_COMMAND_TOOL_CHAR_BUDGET` (currently ~37% — net effect should be roughly flat since descriptions don't grow) — descriptions remained roughly flat; solid's description added "Rust / Python / Go" but stayed under 500
- [x] Manual sanity check: read each restructured SKILL.md in isolation and confirm the decision tree unambiguously routes to the correct references file — all 6 SKILL.md files now lead with When-to-Load-References table that unambiguously routes based on language / framework / finding type

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

### Research findings (2026-05-12)

Two parallel Explore agents mapped each affected skill's current body, extraction targets (file:line), and scorer-signal preservation. **All 6 skills currently score 16/16; all retain ≥2 `<constraint>` blocks and ≥1 BAD/GOOD pair post-extraction → no risk of dropping below per-file floor 8.**

**1. `solid` (228 LOC → ~100–120 LOC main)**
- 4 references: `typescript-solid.md`, `rust-solid.md`, `python-solid.md`, `go-solid.md`
- Verbatim TS extraction: lines 56–79 (S strategy map), 93–121 (L discriminated union), 135–152 (I split), 167–200 (D injection) ≈ 110 LOC
- Fresh authoring: ~150 LOC each for Rust/Python/Go idiomatic per-principle examples (Rust newtype + trait-object + enum-match; Python dataclass + Protocol + ABC; Go interface + composition + replace-directives)
- Stay in main: 3 constraints (lines 14–24), O-section BAD/GOOD (Strategy Map — most universal), Common Traps table (lines 218–227)
- Estimated post-restructure score: 14–15/16

**2. `test-coverage` (161 LOC → ~80–100 LOC main)**
- 5 references: `jest-vitest.md`, `pytest.md`, `cargo-test.md`, `go-test.md`, `junit.md`
- Verbatim extraction: Step 3 example only (lines 64–81) ≈ 8 LOC; rest needs fresh per-framework templates
- Fresh authoring: ~120 LOC each for jest-vitest + pytest (file layout, describe/it or fixtures, mocking, assertions, coverage config); ~100 LOC each for cargo-test, go-test, junit
- Stay in main: 3 constraints (lines 12–22), Step 3 import-path BAD/GOOD (lines 64–81 — universal across frameworks)
- Estimated post-restructure score: 14–15/16

**3. `dep-vuln-workflow` (168 LOC → ~90–110 LOC main)**
- 4 references: `npm-pnpm-playbook.md`, `pip-playbook.md`, `cargo-playbook.md`, `go-mod-playbook.md`
- Verbatim extraction: lines 44–54 (pnpm upgrade), 128–134 (Next/React upgrade surprises), 157–161 (npm-specific gotchas) ≈ 22 LOC → `npm-pnpm-playbook.md`
- Fresh authoring: ~30 LOC fresh in npm-pnpm-playbook (yarn/npm equivalents); ~100 LOC each for pip / cargo / go-mod playbooks
- Stay in main: 3 constraints (lines 12–13, 104–106, 151–153), Split Strategy BAD/GOOD (lines 78–100 — language-neutral commit discipline)
- Move to `npm-pnpm-playbook.md`: Lint/Typecheck BAD/GOOD (lines 117–126 — React/Next-specific)
- Estimated post-restructure score: 15–16/16

**4. `lint-no-suppressions` (105 LOC → ~50–60 LOC main)**
- 2 references: `pre-commit-hook.md`, `per-tool-catalog.md`
- Verbatim extraction: bash pre-commit hook (lines 47–93) ≈ 47 LOC → `pre-commit-hook.md`
- Fresh authoring: ~100–120 LOC per-tool catalog (ESLint, TS `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`, mypy `# type: ignore`, ruff `# noqa`, clippy `#[allow]`, golangci-lint `//nolint`, shellcheck, pylint, Java `@SuppressWarnings`)
- Stay in main: 2 constraints (lines 12–14, 99–101), decision table (lines 33–42)
- Estimated post-restructure score: 16/16 maintained

**5. `code-review` (136 LOC → ~100–110 LOC main)**
- 4 references (or 3 — see open decision below): `security.md`, `perf.md`, `maintainability.md`, `ai-slop.md`
- Verbatim extraction: ~10 LOC of categorization prose (Step 3, lines 59–68)
- Fresh authoring: ~60–80 LOC security (OWASP Top 10 finding templates + severity calibration), ~50–70 LOC perf (N+1, loops, sync I/O, render cascades), ~40–60 LOC each for maintainability + ai-slop
- Stay in main: all 3 constraints (lines 12–22), Common Traps table (lines 101–111), Output Example (lines 113–131)
- Estimated post-restructure score: 16/16 maintained

**6. `fix-workflow` (168 LOC → ~127 LOC main)**
- 3 references: `security-fix-templates.md`, `perf-fix-templates.md`, `bug-fix-templates.md`
- Verbatim extraction: Step 4 template table (lines 85–100) ≈ 16 LOC stays in main as the framework; per-finding-type expansions are new
- Fresh authoring: ~50–70 LOC each (security-fix: CVE/GHSA triage + dependency bump test strategy + security-specific revert triggers; perf-fix: profiling commands + perf revert triggers + common perf anti-patterns; bug-fix: reproduction test template + integration-vs-unit decision + regression-prevention)
- Stay in main: all 3 constraints (lines 12–22), Steps 1–6 framework, Common Traps table (lines 133–145), Pairing With Other Skills (lines 146–154)
- Estimated post-restructure score: 16/16 maintained

**Total scope summary:**
- 22 references files (21 if `ai-slop` merges into `maintainability` for code-review)
- ~250 LOC verbatim extraction across all 6 skills
- ~1,600 LOC fresh authoring (Rust/Python/Go SOLID; pytest / cargo-test / go-test / junit templates; pip / cargo / go-mod playbooks; per-tool suppression catalog; per-axis review references; per-finding-type fix templates)
- Per-skill post-restructure scores estimated at 14–16/16; per-file floor 8 not at risk

**Open decisions for implementer:**
1. **`test-coverage`:** keep `junit.md` (Java/JVM) in scope, or defer? Kit users skew JS/Python/Rust/Go.
2. **`code-review`:** 4 references files (keep `ai-slop` separate) or 3 (merge into `maintainability` since they overlap substantially)?
3. **Implementation order (suggested):** `lint-no-suppressions` (smallest, mostly extract — validates the pattern) → `dep-vuln-workflow` (~22 LOC extract + 4 playbooks) → `fix-workflow` (3 templates, tight scope) → `code-review` (4 per-axis references) → `test-coverage` (5 per-framework references) → `solid` (4 languages, largest fresh authoring).
4. **Commit strategy:** per-skill (6 commits) recommended. Per-reference-file (22 commits) too granular; batched mega-commit too large for review.

## Evidence log

- **2026-05-12T16:07:30-03:00** — Plan created — assistant (Claude Opus 4.7)
- **2026-05-12T16:23:14-03:00** — Research completed via 2 parallel Explore forks (skills 1–3 + 4–6); per-skill extraction plans recorded in Notes; 4 open decisions surfaced — assistant (Claude Opus 4.7)
- **2026-05-12T16:57:24-03:00** — Plan started (planned/ → ongoing/, set started_at); Step #4 done: restructured `lint-no-suppressions` — SKILL.md 117→72 LOC, new `references/pre-commit-hook.md` (100 LOC, lifts the bash hook + CI mirror), new `references/per-tool-catalog.md` (166 LOC, covers ESLint/TS/mypy/ruff/pylint/clippy/golangci-lint/shellcheck/Java with same-line-reason rule); per-file score 16→13 (above floor 8, above plan AC ≥14 floor: short by 1 point — body LOC 72 sits below scorer sweet spot 80–310) — assistant (Claude Opus 4.7)
- **2026-05-12T17:02:00-03:00** — Step #3 done: restructured `dep-vuln-workflow` — SKILL.md 168→133 LOC (within sweet spot 80–310), 4 new references files (`npm-pnpm-playbook.md` 97 LOC, `pip-playbook.md` 91 LOC, `cargo-playbook.md` 87 LOC, `go-mod-playbook.md` 87 LOC; total 362 LOC of per-ecosystem content); main body retains 3 `<constraint>` blocks + Split Strategy BAD/GOOD pair; per-file score 15/16 (above AC ≥14 floor); guard PASS — assistant (Claude Opus 4.7)
- **2026-05-12T17:10:00-03:00** — Step #6 done: restructured `fix-workflow` — SKILL.md 168→179 LOC (added When-to-Load-References routing table; still within sweet spot 80–310), 3 new references files (`security-fix-templates.md` 58 LOC with attacker-targeted test strategy + OWASP mapping, `perf-fix-templates.md` 70 LOC with profiling matrix + regression thresholds, `bug-fix-templates.md` 82 LOC with reproduction template + bisect playbook); main body retains all 3 `<constraint>` blocks and Common Traps table; per-file score 16/16 maintained; guard PASS — assistant (Claude Opus 4.7)
- **2026-05-12T17:17:00-03:00** — Step #5 done: restructured `code-review` (ai-slop merged into maintainability, 3 references not 4) — SKILL.md 145→156 LOC (added When-to-Load routing table after Step 3; still within sweet spot 80–310), 3 new references files (`security.md` 63 LOC with OWASP Top 10 → finding-template mapping + 3-question severity calibration + common false-positives, `perf.md` 87 LOC with per-domain pattern catalog DB/loop/async/render + calibration matrix, `maintainability.md` 104 LOC with dead-code + duplication + smart-abstraction + 11-row AI-slop tells catalog); main body retains all 3 `<constraint>` blocks, Common Traps table, Output Example; per-file score 16/16 maintained; guard PASS — assistant (Claude Opus 4.7)
- **2026-05-12T17:25:00-03:00** — Step #2 done: restructured `test-coverage` — SKILL.md 161→167 LOC (added When-to-Load routing table after Step 1; still within sweet spot 80–310), 5 new references files (`jest-vitest.md` 119 LOC with detection signals + co-located/__tests__ naming + Vitest/Jest mock differences + RTL idioms, `pytest.md` 149 LOC with fixtures + scopes + monkeypatch + pytest-asyncio + conftest precedence, `cargo-test.md` 178 LOC with unit-vs-integration layout + trait-object DI + mockall + tokio::test + cargo-llvm-cov, `go-test.md` 204 LOC with white-vs-black-box packages + table-driven subtests + t.Cleanup + httptest + Go 1.22 loop-var fix, `junit.md` 210 LOC with mirroring layout + @Nested + Mockito strict stubbing + Spring slice tests + JaCoCo); main body retains all 3 `<constraint>` blocks AND the universal import-path BAD/GOOD pair in Step 3; per-file score 16/16 maintained; guard PASS; some references > 150 LOC soft guideline (cargo/go/junit) — accepted because per-framework topic depth is real and on-demand load means zero cost when inactive — assistant (Claude Opus 4.7)
- **2026-05-12T17:35:00-03:00** — Step #1 done: restructured `solid` — SKILL.md 235→144 LOC (clean trim; deep per-principle code examples lifted out; main body now smell→fix tables + indicators + canonical O-section Strategy Map BAD/GOOD pair + Decision Tree + Common Traps; well within sweet spot 80–310). 4 new references files (`typescript-solid.md` 188 LOC with all 5 principles + ExtractMappedType pattern + exhaustiveness sentinel + function-argument DI, `rust-solid.md` 218 LOC with HashMap-of-fn + non_exhaustive enum + sealed-trait pattern + generics-vs-dyn DI matrix, `python-solid.md` 228 LOC with dict-of-callable + match + assert_never exhaustiveness + Protocol structural typing + constructor-or-argument injection, `go-solid.md` 254 LOC with map-of-func + sealed-interface sum type via isType() seal + caller-side small interfaces + accept-interfaces-return-structs idiom + ChargeFn fn-arg form). Main body retains all 3 `<constraint>` blocks + the canonical Strategy Map BAD/GOOD + Common Traps table; per-file score 16/16 maintained; guard PASS; references 188-254 LOC over 150-LOC soft guideline but justified by 5-principle depth × language idioms — assistant (Claude Opus 4.7)
- **2026-05-12T17:38:00-03:00** — Plan shipped: all 6 SKILL.md files now route to references/ on activation; final acceptance check confirmed every pointer resolves; ship_commit 584a53dc; moving from ongoing/ to finished/2026-05-12-skills-references-extraction.md — assistant (Claude Opus 4.7)

## Review

(empty — `plan-review` will fill on ship)
