<!-- plan-contract: v4 -->

## Goal

Fix the two advisory findings from the #57 code review in the `code-guardrails` skill:

1. The raw-number lint rule stays on in test files. Tests put an expected literal in a named constant, so an inline copied limit fails lint. The repeated-value scan, which already includes test files, catches a production value copied into a test constant.
2. The repeated-value scan matches hexadecimal, binary, and octal literals as whole values.

User decision (in session, 2026-09-24): "best durable solution" for finding 1, which this plan resolves as rule on in tests at error level plus the scan for constant copies.

Mode: plan-and-implement

## Research

Reproduced both findings (scratch run, 2026-09-24):

- Finding 1: with the `references/typescript.md` config, `bunx --no-install oxlint` on `src/__tests__/upload.test.ts` containing `export const tooBig = 10485761;` reported 0 `no-magic-numbers` findings, because the test override turns the rule off.
- Finding 2: the SKILL.md numeric scan `'[0-9][0-9_.]+'` with `grep -w` reported nothing for `0xFF` written 4 times across a `.rs` and a `.sh` file. The pattern `'0[xXbBoO][0-9a-fA-F_]+|[0-9][0-9_.]+'` reported `4 0xFF`.

Tool facts:

- oxlint `eslint/no-magic-numbers` does not report a number that initializes a `const` declaration (the #57 smoke check reported no finding on `export const MAX_UPLOAD_BYTES = 10_485_760;`). So a test can hold an expected literal in a named `const`, and the rule still reports inline literals such as `fileOfSize(10485761)`. The rule cannot find a copied value stored in a `const`, in test or production code; the scan covers that case. <https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-magic-numbers>
- Ruff `PLR2004` reports magic values in comparisons, such as `assert size == 8388608`; comparing with a named `Final` constant passes. <https://docs.astral.sh/ruff/rules/magic-value-comparison/>
- SwiftLint `no_magic_numbers` skips subclasses of `test_parent_classes` (default `XCTestCase`, `QuickSpec`); `test_parent_classes: []` enables it there. Swift Testing `@Test` functions and `@Suite` types are always skipped; the skip is built into the rule (`NoMagicNumbersRule.swift`, `visit(FunctionDeclSyntax)` and `isTestSuite`), so no setting enables it. <https://realm.github.io/SwiftLint/no_magic_numbers.html>, <https://github.com/realm/SwiftLint/blob/main/Source/SwiftLintBuiltInRules/Rules/Idiomatic/NoMagicNumbersRule.swift>
- Test-file statements to change: `references/typescript.md` (override block and its two lead-in lines), `references/python.md` (`per-file-ignores` entries, the test-exception sentence, and the test guidance line), `references/swift.md` (test skip paragraph and config block), `SKILL.md` (third constraint, "Test data" section, "Find scattered values" pattern and text, Gotchas).

Durable fix: remove the blanket test exemptions instead of narrowing them to a file-name convention, because no convention is standard across projects and a narrowed glob still exempts inline copies inside those files.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | refs | Remove the test-file exemptions from the TypeScript and Python configs and text; add `test_parent_classes: []` to the Swift config and state the built-in `@Test` and `@Suite` skip; in each, tell tests to hold expected literals in named constants and point to the scan for copied values | plugins/docks/skills/engineering/code-guardrails/references/typescript.md, plugins/docks/skills/engineering/code-guardrails/references/python.md, plugins/docks/skills/engineering/code-guardrails/references/swift.md | - | local | planned | No reference exempts test files from the raw-number rule; the Swift reference names the built-in skip |
| 2 | skill | Update the third constraint and "Test data" (named expected constants, BAD/GOOD), the scan pattern (nondecimal literals) and its text (scan includes tests and finds constants copied into tests), and a Gotchas row | plugins/docks/skills/engineering/code-guardrails/SKILL.md | - | local | planned | SKILL.md states the rule-on-in-tests policy and the new pattern |
| 3 | verify | Run content-hash backfill, the smoke checks, and the docks gate | plugins/docks/skills/engineering/code-guardrails/SKILL.md | 1, 2 | local | planned | Acceptance rows A1-A5 hold |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `bunx --no-install oxlint -c .oxlintrc.json src` in a scratch folder with the new TypeScript config and a test file holding `expect(size).toBe(10485761)` and `const expectedLimitBytes = 10_485_760;` | One `no-magic-numbers` finding on the inline literal; none on the `const` |
| A2 | `uv tool run ruff check tests` in a scratch folder with the new Python config and `assert size == 8388608` in a test | One `PLR2004` finding |
| A3 | The new SKILL.md numeric scan on files that contain `0xFF` 4 times | Output `4 0xFF` |
| A4 | `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file \| grep code-guardrails` | 16 |
| A5 | `node scripts/ci.mjs --plugin docks` | Exit 0 |

## Do not touch

- Rust and Bash references (their linters have no raw-number rule, so no test exemption exists).
- Sibling skills.

## Open questions

## Verification Results
