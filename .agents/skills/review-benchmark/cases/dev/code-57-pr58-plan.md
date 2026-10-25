<!-- plan-contract: v4 -->

## Goal

Add a docks skill, `code-guardrails`, that stops agents from writing low-quality code in five languages. The skill has two jobs:

1. Set up strict linter rules for TypeScript (oxlint, plus the upstream anti-slop ruleset), Rust (clippy), Swift (SwiftLint), Python (Ruff), and Bash (ShellCheck) when the project lacks them.
2. Apply the rules that no linter checks: one mapped source for constants and values (numbers, strings, units, limits, paths, keys), constants derived from other constants (`MIB = 1024 * KIB`), test data that reuses production constants without tautological assertions, and code that reads data from its owning location instead of copying it.

User decisions (recorded in session, 2026-09-24):

- Shape: a new dedicated skill, not an extension of `code-clarity` and not a merged code-quality skill.
- Lint behavior: add missing rules to the existing linter config and report each change. Ask before installing a tool that the project does not have.
- anti-slop: link to <https://github.com/dmmulroy/anti-slop> and hand off to its own `install-anti-slop` skill. Do not copy its rule files into docks. Ask before the network install.
- Tool preferences: oxlint, oxfmt or Prettier, ShellCheck. Avoid ESLint.

Mode: plan-and-implement

## Research

Repository facts:

- No existing skill covers this. `plugins/docks/skills/engineering/code-clarity/SKILL.md` has one line on magic values (step 2 of "Improve in leverage order"). `plugins/docks/skills/engineering/type-safety-discipline/SKILL.md` maps a repeated magic string to a union type (Rust/Kotlin/Python table row), and it also claims repeated-value ownership in five places: the "When to Use" trigger "A string or number literal appearing in 2+ places", the Quick Reference row "Magic string literal in 2+ places" ("Single source of truth"), the section 3 heading "No magic literals - name them with a type", the section 3 sentence "For numeric magic constants, gather them in a single config object", and Decision Tree item 3 "Same string literal in 2+ places? → Extract to a type / enum / `Literal`" (verify: `grep -niE '2\+ places|magic|config object' plugins/docks/skills/engineering/type-safety-discipline/SKILL.md`). `references/python-typing.md` section "Literal types instead of string magic" is closed-set typing only and stays. Those five places become a second owner of the constant rules, so the cutover moves them to `code-guardrails` and keeps the type-specific union and newtype advice. `plugins/docks/skills/engineering/code-review/references/maintainability.md` rates a repeated magic string or config object LOW-MEDIUM and does not mention numbers. `plugins/docks/skills/engineering/refactor/references/duplication-scanner.md` detects duplicate blocks longer than 5 lines, so a one-line raw value repeated across files is not found.
- `plugins/docks/skills/engineering/lint-no-suppressions/` owns suppression syntax and the pre-commit hook (`references/per-tool-catalog.md`, `references/pre-commit-hook.md`). The new skill owns which rules to enable. It routes suppression requests to `lint-no-suppressions` and does not repeat suppression syntax (one fact, one home).
- Authoring rules: `plugins/docks/skills/AGENTS.md` (description starts "Use when", 500 characters or fewer, "Not for" routing, body 80–310 lines, references 30–150 lines with a Contents list above 100 lines, no author-script names in shipped bodies, content-hash backfill after a meaning change). Per-language references follow the `solid/references/<lang>-*.md` pattern named in `write-skill`.
- Skill catalogs that list skills by name: `README.md` and `plugins/docks/README.md` (engineering skill tables). Both plugin manifests list skill directories, not skill names (Claude: category directories; Codex: `./skills/`), so a new skill directory needs no manifest edit (verify: `grep -n skills plugins/docks/.claude-plugin/plugin.json plugins/docks/.codex-plugin/plugin.json`).
- `scripts/tree/guard.mjs` requires a matching row for any new `AGENTS.md`; this change adds none.

Official sources (fetched 2026-09-24):

- oxlint `eslint/no-magic-numbers` with options `ignore`, `ignoreArrayIndexes`, `ignoreDefaultValues`, `ignoreClassFieldInitialValues`, `enforceConst`, `detectObjects`, `ignoreEnums`, `ignoreNumericLiteralTypes`, `ignoreReadonlyClassProperties`, `ignoreTypeIndexes`: <https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-magic-numbers>
- anti-slop: MIT, oxlint JS plugin, meant to be copied into the project, installed by `npx skills add dmmulroy/anti-slop --skill install-anti-slop`: <https://github.com/dmmulroy/anti-slop>
- SwiftLint `no_magic_numbers`: opt-in, default `allowed_numbers` [0.0, 1.0, 100.0], skips `XCTestCase` and `QuickSpec` subclasses and `@Test`: <https://realm.github.io/SwiftLint/no_magic_numbers.html>
- Ruff `PLR2004` magic-value-comparison, comparisons only: <https://docs.astral.sh/ruff/rules/magic-value-comparison/>
- Clippy has no magic-number lint (lint index): <https://rust-lang.github.io/rust-clippy/master/>. `[lints.clippy]` in `Cargo.toml` applies to the current package only (<https://doc.rust-lang.org/cargo/reference/manifest.html#the-lints-section>). A workspace needs `[workspace.lints.clippy]` in the root manifest plus `[lints] workspace = true` in each member manifest (<https://doc.rust-lang.org/cargo/reference/workspaces.html#the-lints-table>). The Rust reference covers both layouts.
- ShellCheck has no magic-value check. Local ShellCheck is 0.9.0, which has no `--rcfile` option (added in 0.10.0: <https://github.com/koalaman/shellcheck/wiki/Directive#--rcfile>), so the smoke check puts `.shellcheckrc` beside the sample script and relies on config discovery. Local `shellcheck --list-optional` lists: add-default-case, avoid-nullary-conditions, check-extra-masked-returns, check-set-e-suppressed, check-unassigned-uppercase, deprecate-which, quote-safe-variables, require-double-brackets, require-variable-braces. <https://www.shellcheck.net/wiki/>
- Formatters (oxfmt, Prettier, shfmt, rustfmt, swift-format, ruff format) change layout only. They do not detect raw values; the skill says so once.

Decisions:

- Rust and Bash have no linter rule for raw values. Their references give a code convention plus a self-contained check that lists numeric and string literals repeated across files (a `rg` pipeline), so the agent can still find them.
- Each per-language reference gives a complete recommended config block and says which rules catch raw values. Rule names are verified against official docs at authoring time; each reference cites its sources.
- The durable fix replaces the one-line magic-value hint in `code-clarity` with a route to the new skill, instead of growing a second copy of the same rules there.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | skill_body | Author `SKILL.md`: description, up to 3 constraints (one mapped source; add rules to existing config and report; ask before installing tools or the anti-slop network step), workflow (detect languages and lint configs, add missing rules, run linter, fix findings, report), constant-map model with BAD/GOOD (derived constants, units in names, one owning module, import instead of copy), test-data rules (reuse production constants for inputs, literal expected values when testing the constant itself, shared fixtures module), formatter note, routing table | plugins/docks/skills/engineering/code-guardrails/SKILL.md | - | local | done | Body is 80–310 lines; the skill-guard scorer gives 14 or more |
| 2 | lang_refs | Author per-language references with a verified config block, the rules that catch raw values, a verification command, and cited sources: TypeScript (oxlint `.oxlintrc.json` or `oxlint.config.ts`, `no-magic-numbers` options, anti-slop handoff, oxfmt/Prettier note), Rust (`[lints.clippy]` for a single package, `[workspace.lints.clippy]` plus `[lints] workspace = true` in each member for a workspace, convention, repeated-literal check), Swift (`.swiftlint.yml` opt-in rules), Python (Ruff `[tool.ruff.lint]` select), Bash (`.shellcheckrc`, `readonly` constants, repeated-literal check) | plugins/docks/skills/engineering/code-guardrails/references/typescript.md, plugins/docks/skills/engineering/code-guardrails/references/rust.md, plugins/docks/skills/engineering/code-guardrails/references/swift.md, plugins/docks/skills/engineering/code-guardrails/references/python.md, plugins/docks/skills/engineering/code-guardrails/references/bash.md | 1 | local | done | Each reference is 30–150 lines, is linked from `SKILL.md`, and passes the refs guard |
| 3 | routing | Route siblings: `code-clarity` step 2 routes constant mapping to `code-guardrails`; `refactor` duplication scan gains a scattered-values category; `code-review` maintainability row covers magic numbers and strings; `type-safety-discipline` rescopes all five repeated-value places named in Research to a closed set of states (type, enum, `Literal`) and routes other repeated values and numeric constants to `code-guardrails`; add the skill row to both README tables | plugins/docks/skills/engineering/type-safety-discipline/SKILL.md, plugins/docks/skills/engineering/code-clarity/SKILL.md, plugins/docks/skills/engineering/refactor/references/duplication-scanner.md, plugins/docks/skills/engineering/code-review/references/maintainability.md, README.md, plugins/docks/README.md | 1 | local | done | Each file names `code-guardrails`; the Research verify grep on `type-safety-discipline` shows only closed-set wording or a `code-guardrails` route; no sibling repeats the constant rules |
| 4 | bookkeeping | Run the content-hash backfill for every changed skill | plugins/docks/skills/engineering/code-guardrails/SKILL.md, plugins/docks/skills/engineering/code-clarity/SKILL.md, plugins/docks/skills/engineering/refactor/SKILL.md, plugins/docks/skills/engineering/code-review/SKILL.md, plugins/docks/skills/engineering/type-safety-discipline/SKILL.md | 2, 3 | local | done | The backfill reports no pending drift on a second run |
| 5 | behavior | Run the ShellCheck smoke check with the installed `shellcheck` (sample `.shellcheckrc` beside the sample script), run oxlint and Ruff smoke checks only if they are already available without a download (`bunx --no-install oxlint`, a Ruff binary on `PATH`), and run a trigger check with a fresh subagent: should-trigger and near-miss prompts against the skill listing | plugins/docks/skills/engineering/code-guardrails/references/bash.md | 4 | local | done | ShellCheck reports the expected finding; every near-miss routes away; oxlint and Ruff checks run or are recorded as not available locally |
| 6 | tool_probe | Ask the user in session before downloading oxlint or Ruff. With approval, run the oxlint smoke check through `bunx oxlint` and the Ruff smoke check through `uv tool run ruff`. Without approval, record the checks as not run | plugins/docks/skills/engineering/code-guardrails/references/typescript.md, plugins/docks/skills/engineering/code-guardrails/references/python.md, plugins/docks/skills/engineering/code-guardrails/references/bash.md | 5 | probe | done | Each approved check reports the expected raw-value finding, or the record states that the user declined the download |
| 7 | gate | Run the full gate because root `README.md` changes | README.md | 5 | local | done | `node scripts/ci.mjs` exits 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file \| grep code-guardrails` | Score of 14 or more |
| A2 | `node scripts/skills/guard.mjs` | Exit 0 |
| A3 | In a scratch directory holding the sample `.shellcheckrc` from references/bash.md beside a sample script: `shellcheck <sample script>` | ShellCheck applies the enabled optional checks and reports the sample finding |
| A4 | After approval in step 6: `bunx oxlint -c <sample config from references/typescript.md> <sample.ts>` | Reports `eslint(no-magic-numbers)` on the raw value and not on the named constant |
| A5 | After approval in step 6: `uv tool run ruff check --config <sample pyproject from references/python.md> <sample.py>` | Reports `PLR2004` on the raw comparison |
| A6 | Fresh-subagent trigger check with the full skill listing | Should-trigger prompts pick `code-guardrails` with at most one miss; every near-miss picks its sibling |
| A7 | `node scripts/ci.mjs` | Exit 0 |

## Do not touch

- `lint-no-suppressions` suppression syntax and pre-commit hook content.
- anti-slop rule source: link and hand off only; do not copy files.
- Plugin versions and release manifests (release is a separate flow).
- `type-safety-discipline` union, newtype, and class-gate content (only the constant-ownership lines move).

## Open questions

- Advisory from code review round 2 (MEDIUM, not changed after pass): the test-file overrides in `references/typescript.md` and `references/python.md` turn off raw-number checks for all test code, not only expected values. A follow-up could scope the exception to files that check constant values.
- Advisory from code review round 2 (MEDIUM, not changed after pass): the numeric scan in `SKILL.md` "Find scattered values" does not match hexadecimal or binary literals (`0xFF`, `0b1010`) as whole values.

## Verification Results

- A1: `skill-guard.mjs score --per-file` → `engineering/code-guardrails 16`. Description is 493 characters.
- A2: `node scripts/skills/guard.mjs` → all guards passed; refs-guard: 26 skills, 80 reference files. `tests/skill-trigger-collision.mjs` passed. A second content-hash backfill run wrote nothing.
- A3: ShellCheck 0.9.0, sample `.shellcheckrc` beside `sample.sh`, `shellcheck sample.sh` → `SC2250 (style)` from the enabled optional check `require-variable-braces`, so ShellCheck read the rc file.
- A4 (download approved in session): `bunx oxlint -c .oxlintrc.json sample.ts src` with the reference JSON → `eslint(no-magic-numbers): No magic number: 10485760` on the raw comparison only; no finding on the named constant or in `src/__tests__/a.test.ts` (test override works).
- A5 (download approved in session): `uv tool run ruff check` with the reference TOML → `PLR2004` on `size <= 8388608` in `sample.py`; no finding in `tests/test_limits.py` (per-file test exception works).
- Scattered-values check from SKILL.md run on `plugins/plan-lifecycle` → lists repeated values with counts (for example `'blocked'` 7 times).
- A6: blind routing by a fresh scout with the full skill listing, 14 queries → 8 of 8 should-trigger queries picked `code-guardrails`; 6 of 6 near misses picked `lint-no-suppressions` (2), `code-clarity`, `refactor`, `type-safety-discipline`, `code-review`.
- A7: `node scripts/ci.mjs` → "All ci.mjs checks passed - 2 plugin(s) + repo-wide".
- Limitation: Rust and Swift config blocks were checked against official docs only; `cargo` and `swiftlint` are not installed locally.
