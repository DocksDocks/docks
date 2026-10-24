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

- No existing skill covers this. `plugins/docks/skills/engineering/code-clarity/SKILL.md` has one line on magic values (step 2 of "Improve in leverage order"). `plugins/docks/skills/engineering/type-safety-discipline/SKILL.md` covers only magic string literals (union types). `plugins/docks/skills/engineering/code-review/references/maintainability.md` rates a repeated magic string or config object LOW-MEDIUM and does not mention numbers. `plugins/docks/skills/engineering/refactor/references/duplication-scanner.md` detects duplicate blocks longer than 5 lines, so a one-line raw value repeated across files is not found.
- `plugins/docks/skills/engineering/lint-no-suppressions/` owns suppression syntax and the pre-commit hook (`references/per-tool-catalog.md`, `references/pre-commit-hook.md`). The new skill owns which rules to enable. It routes suppression requests to `lint-no-suppressions` and does not repeat suppression syntax (one fact, one home).
- Authoring rules: `plugins/docks/skills/AGENTS.md` (description starts "Use when", 500 characters or fewer, "Not for" routing, body 80–310 lines, references 30–150 lines with a Contents list above 100 lines, no author-script names in shipped bodies, content-hash backfill after a meaning change). Per-language references follow the `solid/references/<lang>-*.md` pattern named in `write-skill`.
- Skill catalogs that list skills by name: `README.md` and `plugins/docks/README.md` (engineering skill tables). Both plugin manifests list skill directories, not skill names (Claude: category directories; Codex: `./skills/`), so a new skill directory needs no manifest edit (verify: `grep -n skills plugins/docks/.claude-plugin/plugin.json plugins/docks/.codex-plugin/plugin.json`).
- `scripts/tree/guard.mjs` requires a matching row for any new `AGENTS.md`; this change adds none.

Official sources (fetched 2026-09-24):

- oxlint `eslint/no-magic-numbers` with options `ignore`, `ignoreArrayIndexes`, `ignoreDefaultValues`, `ignoreClassFieldInitialValues`, `enforceConst`, `detectObjects`, `ignoreEnums`, `ignoreNumericLiteralTypes`, `ignoreReadonlyClassProperties`, `ignoreTypeIndexes`: <https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-magic-numbers>
- anti-slop: MIT, oxlint JS plugin, meant to be copied into the project, installed by `npx skills add dmmulroy/anti-slop --skill install-anti-slop`: <https://github.com/dmmulroy/anti-slop>
- SwiftLint `no_magic_numbers`: opt-in, default `allowed_numbers` [0.0, 1.0, 100.0], skips `XCTestCase` and `QuickSpec` subclasses and `@Test`: <https://realm.github.io/SwiftLint/no_magic_numbers.html>
- Ruff `PLR2004` magic-value-comparison, comparisons only: <https://docs.astral.sh/ruff/rules/magic-value-comparison/>
- Clippy has no magic-number lint (lint index): <https://rust-lang.github.io/rust-clippy/master/>. `[lints.clippy]` in `Cargo.toml` is the project-wide config location.
- ShellCheck has no magic-value check. Local `shellcheck --list-optional` (0.9.0) lists: add-default-case, avoid-nullary-conditions, check-extra-masked-returns, check-set-e-suppressed, check-unassigned-uppercase, deprecate-which, quote-safe-variables, require-double-brackets, require-variable-braces. <https://www.shellcheck.net/wiki/>
- Formatters (oxfmt, Prettier, shfmt, rustfmt, swift-format, ruff format) change layout only. They do not detect raw values; the skill says so once.

Decisions:

- Rust and Bash have no linter rule for raw values. Their references give a code convention plus a self-contained check that lists numeric and string literals repeated across files (a `rg` pipeline), so the agent can still find them.
- Each per-language reference gives a complete recommended config block and says which rules catch raw values. Rule names are verified against official docs at authoring time; each reference cites its sources.
- The durable fix replaces the one-line magic-value hint in `code-clarity` with a route to the new skill, instead of growing a second copy of the same rules there.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | skill_body | Author `SKILL.md`: description, up to 3 constraints (one mapped source; add rules to existing config and report; ask before installing tools or the anti-slop network step), workflow (detect languages and lint configs, add missing rules, run linter, fix findings, report), constant-map model with BAD/GOOD (derived constants, units in names, one owning module, import instead of copy), test-data rules (reuse production constants for inputs, literal expected values when testing the constant itself, shared fixtures module), formatter note, routing table | plugins/docks/skills/engineering/code-guardrails/SKILL.md | - | local | planned | Body is 80–310 lines; the skill-guard scorer gives 14 or more |
| 2 | lang_refs | Author per-language references with a verified config block, the rules that catch raw values, a verification command, and cited sources: TypeScript (oxlint `.oxlintrc.json` or `oxlint.config.ts`, `no-magic-numbers` options, anti-slop handoff, oxfmt/Prettier note), Rust (`[lints.clippy]`, convention, repeated-literal check), Swift (`.swiftlint.yml` opt-in rules), Python (Ruff `[tool.ruff.lint]` select), Bash (`.shellcheckrc`, `readonly` constants, repeated-literal check) | plugins/docks/skills/engineering/code-guardrails/references/typescript.md, plugins/docks/skills/engineering/code-guardrails/references/rust.md, plugins/docks/skills/engineering/code-guardrails/references/swift.md, plugins/docks/skills/engineering/code-guardrails/references/python.md, plugins/docks/skills/engineering/code-guardrails/references/bash.md | 1 | local | planned | Each reference is 30–150 lines, is linked from `SKILL.md`, and passes the refs guard |
| 3 | routing | Route siblings: `code-clarity` step 2 routes constant mapping to `code-guardrails`; `refactor` duplication scan gains a scattered-values category; `code-review` maintainability row covers magic numbers and strings; add the skill row to both README tables | plugins/docks/skills/engineering/code-clarity/SKILL.md, plugins/docks/skills/engineering/refactor/references/duplication-scanner.md, plugins/docks/skills/engineering/code-review/references/maintainability.md, README.md, plugins/docks/README.md | 1 | local | planned | Each file names `code-guardrails`; no sibling repeats the constant rules |
| 4 | bookkeeping | Run the content-hash backfill for every changed skill | plugins/docks/skills/engineering/code-guardrails/SKILL.md, plugins/docks/skills/engineering/code-clarity/SKILL.md, plugins/docks/skills/engineering/refactor/SKILL.md, plugins/docks/skills/engineering/code-review/SKILL.md | 2, 3 | local | planned | The backfill reports no pending drift on a second run |
| 5 | behavior | Run the smoke checks for the config blocks that have local tools (ShellCheck, oxlint through bunx, Ruff through `uv tool run`), and run a trigger check with a fresh subagent: should-trigger and near-miss prompts against the skill listing | plugins/docks/skills/engineering/code-guardrails/references/typescript.md, plugins/docks/skills/engineering/code-guardrails/references/python.md, plugins/docks/skills/engineering/code-guardrails/references/bash.md | 4 | local | planned | Each smoke check reports the expected raw-value finding; every near-miss routes away |
| 6 | gate | Run the full gate because root `README.md` changes | README.md | 5 | local | planned | `node scripts/ci.mjs` exits 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file \| grep code-guardrails` | Score of 14 or more |
| A2 | `node scripts/skills/guard.mjs` | Exit 0 |
| A3 | `shellcheck --rcfile <sample .shellcheckrc from references/bash.md> <sample script>` | ShellCheck applies the enabled optional checks and reports the sample finding |
| A4 | `bunx oxlint -c <sample config from references/typescript.md> <sample.ts>` | Reports `eslint(no-magic-numbers)` on the raw value and not on the named constant |
| A5 | `uv tool run ruff check --config <sample pyproject from references/python.md> <sample.py>` | Reports `PLR2004` on the raw comparison |
| A6 | Fresh-subagent trigger check with the full skill listing | Should-trigger prompts pick `code-guardrails` with at most one miss; every near-miss picks its sibling |
| A7 | `node scripts/ci.mjs` | Exit 0 |

## Do not touch

- `lint-no-suppressions` suppression syntax and pre-commit hook content.
- anti-slop rule source: link and hand off only; do not copy files.
- Plugin versions and release manifests (release is a separate flow).
- `type-safety-discipline` content.

## Open questions

## Verification Results
