<!-- plan-contract: v3 -->

## Goal

A code-review round whose findings are all `MEDIUM` or `LOW` returns `Code-review: pass`, so the plan reaches `plan.mjs archive` without a re-review. When the re-review after a repair still returns a `CRITICAL` or `HIGH` finding, the manager blocks the plan and starts no further round.

User request (in session, 2026-08-21): "Make the review pass cover advisory-only rounds, in plan review and code review. Issue #16 cannot reach archive: its last code-review round had only MEDIUM findings, and the reviewer still returned fixes-required. A round with only MEDIUM or LOW findings should reach archive without another review. If the same CRITICAL or HIGH comes back after a fix, block the plan instead of looping."

Scope: the plugin and Codex code-reviewer wrappers, the Codex wrapper template that plan-workspace seeds, plan-manager phase 6, the review-records rule of the plan contract and its two copies (the workspace template and `docs/PLAN.md`), the plan test suites, and the gate wiring for the new suite case. Plan review, `plan.mjs`, and the plugin version stay as they are.

Mode: plan-and-implement

## Research

### Consumers of the verdict semantics

All paths and lines are at the base commit of this plan.

1. `plugins/plan-lifecycle/agents/code-reviewer.md`, workflow item 9 (lines 81-85), defines `pass` as "Neither axis has a finding" and `fixes-required` as "At least one evidenced defect can be fixed by the manager". One `MEDIUM` finding therefore forces `fixes-required`. The Output Format rule (lines 104-105) says "A `pass` verdict has no finding lines." The finding line shape (lines 98-102) holds severity, category, `file:line`, defect, and fix. It holds no finding id.
2. Both wrappers cap `Maintainability` and `Performance` findings at `MEDIUM` (`code-reviewer.md` lines 49-57, `.codex/agents/code-reviewer.toml` lines 22-30).
3. `.codex/agents/code-reviewer.toml` carries the Standards buckets, the caps, and the Spec axis inline (lines 12-41). It asks for "one readable `Code-review:` markdown block" (line 44). It defines no verdict word and has no numbered workflow. The phases suite checks only its `name` and `sandbox_mode` lines (`scripts/tests/plan-skill-phases.mjs` lines 303-307), so no test ties it to the plugin wrapper today.
4. `plugins/plan-lifecycle/skills/productivity/plan-workspace/references/codex-agent-templates.md` lines 31-80 hold the code-reviewer template that plan-workspace seeds as `.codex/agents/code-reviewer.toml` (`plan-workspace/SKILL.md` lines 142-145). The template has no verdict definitions. Plan-workspace seeds only a missing file and never overwrites one, because existing agent files are project-owned (`codex-agent-templates.md` lines 3-7).
5. `plan-manager/SKILL.md` phase 6 (lines 144-146) says "Fix every `CRITICAL` and `HIGH` finding. Record each `MEDIUM` and `LOW` finding, then fix it at your judgment. Re-review only after fixing a `CRITICAL` or `HIGH`." The manager already treats `MEDIUM` and `LOW` findings as advisory. Only the wrapper verdict does not. The progress guard (line 148) fires only when a round "returns the same finding-id set as the previous round and no file changed between the two rounds". Lines 150-152 move a pass to landing and archive. The command table (line 203) names "an exact `Code-review: pass` line".
6. `plan-manager/references/plan-contract.md` lines 170-172 close the verdict words and say "`pass` has no finding lines; the others have at least one." That sentence covers both `Plan-review:` and `Code-review:`. Lines 174-175 limit plan-review findings to `goal_fit`, `research_gap`, and `security_risk`. Lines 266-270 make archive require "a line exactly `Code-review: pass` in `## Review`".
7. `plan-workspace/references/plan-md-template.md` carries the record shapes and "A `pass` record has no finding lines. Every other verdict has at least one finding line." (lines 282-298), the phase-6 summary (line 307), and the progress guard (lines 314-316). `docs/PLAN.md` is the template's terminal fence byte for byte (`scripts/tests/plan-skill-phases.mjs` lines 371-378). It holds the same text at lines 278-294, 303, and 310-312.
8. `plan-manager/scripts/plan.mjs` line 898 tests `/^Code-review: pass$/m` against `## Review`. The `m` flag anchors at each line. A pass line that finding lines follow therefore matches, and a `Code-review: fixes-required` line never matches.
9. `scripts/tests/plan-skill-phases.mjs` pins the progress guard as `code-review-progress-guard` in the manager skill, `docs/PLAN.md`, and the template (lines 65-69). Each pinned clause must occur exactly once after whitespace normalization, and its removal must fail (lines 171-183). `parseArgs` accepts only the `bounded-workflows` and `plan-workspace-template` cases (lines 214-220). The code-reviewer marker list (lines 287-291) checks the plugin wrapper body only.
10. `scripts/tests/plan-cli.mjs` refuses `Code-review: pass with caveat` at archive (lines 1197-1202). It archives a keyword-closed plan with a bare `Code-review: pass` (lines 1306-1331). No case puts finding lines after a pass.
11. `scripts/ci.mjs` runs `plan-cli.mjs` and the two phases cases in the plan orchestration section (lines 372-385). `scripts/tests/ci-plugin-targeting.mjs` counts those invocations in the full, Docks-targeted, and core runs (lines 514-516, 531-545, 583-585). `scripts/AGENTS.md` (lines 23, 31, 56-58, 96) and `.github/AGENTS.md` (lines 6-9, 56-58) name the two cases.
12. These readers stay valid without a change: root `AGENTS.md` lines 114-117, `plan-workspace/SKILL.md` lines 241-244, and `plugins/docks/skills/engineering/refactor/references/executor-dispatch.md` line 91 name the exact `Code-review: pass` line. The plan-reviewer wrapper defines plan-review verdicts only (`plugins/plan-lifecycle/agents/plan-reviewer.md` lines 51-54 and 76-83).

### Hypothesis and durable fix

Hypothesis: the archive refusal comes from the wrapper's verdict rule, not from `plan.mjs`. Confirmed: item 8 accepts a pass line that advisory lines follow, and only item 1 turns a `MEDIUM` finding into `fixes-required`. So `plan.mjs` stays unchanged.

Durable fix: define `pass` and `fixes-required` by severity where the reviewer reads them (both wrappers and the template), align phase 6 and the contract with its two copies, replace the progress guard with a one-repair bound, and pin each new sentence. Rejected temporary fix: append a `Code-review: pass` line to issue #16 by hand.

### Verdict text

The steps write these sentences verbatim.

```text
pass:            `pass`: No finding is `CRITICAL` or `HIGH`. `MEDIUM` and `LOW` finding lines may follow the verdict.
fixes-required:  `fixes-required`: At least one evidenced `CRITICAL` or `HIGH` defect can be fixed by the manager.
advisory caps:   Maintainability and Performance findings stay advisory under their caps and never force `fixes-required`.
output rule:     A `pass` verdict has no `CRITICAL` or `HIGH` finding line.
record rule:     A plan-review `pass` has no finding lines. A code-review `pass` has no `CRITICAL` or `HIGH` finding line, and `MEDIUM` and `LOW` finding lines may follow it. Every other verdict has at least one finding line.
manager rule:    A `Code-review: pass` may list `MEDIUM` and `LOW` findings. Fix them at your judgment; they need no re-review.
bound:           If the re-review after a repair still returns a `CRITICAL` or `HIGH` finding, stop, append `Code-review: blocked` naming those findings, and set the plan `blocked`.
```

The advisory-caps sentence follows from item 2. No finding in those two buckets can reach `HIGH`, so the bucket rule and the severity rule agree.

The phases suite pins four of these sentences in a new `review-verdicts` case:

- `code-review-pass` (the pass sentence): `code-reviewer.md`, `.codex/agents/code-reviewer.toml`, and `codex-agent-templates.md`.
- `code-review-fixes-required` (the fixes-required sentence): the same three files.
- `code-review-record-rule` (the record rule): `plan-contract.md`, `plan-md-template.md`, and `docs/PLAN.md`.
- `code-review-bound` (the bound): `plan-manager/SKILL.md`, `plan-md-template.md`, and `docs/PLAN.md`.

A separate case keeps these pins apart from the v3 shape list and gives the gate its own failure line, like the two existing cases (`scripts/ci.mjs` lines 377-384). It runs inside the plan orchestration section, so the timing phase census stays the same (`scripts/AGENTS.md` lines 63-64; `scripts/tests/ci-plugin-targeting.mjs` lines 614-627).

The Codex wrapper gets the verdict lines inline. It already inlines the buckets and the caps so that it stays complete without the runtime skills (`.codex/agents/code-reviewer.toml` lines 44-46). The docks `code-review` skill that it loads (line 7) defines no `Code-review:` verdict, so no skill can supply the lines. Three lines keep the wrapper thin (root `AGENTS.md` lines 55-58).

### Request corrections

- Request correction. Asked: "Make the review pass cover advisory-only rounds, in plan review and code review." Did: only code review changes. Plan review keeps `pass`, `repair`, and `blocked`, and a plan-review `pass` still has no finding lines. Reason: a plan-review finding has a kind, not a severity (`plan-contract.md` lines 174-175; `plan-reviewer.md` lines 76-80), so no plan-review finding is `MEDIUM` or `LOW`. Phase 4 dispatches exactly one plan review and has "no second review round" (`plan-manager/SKILL.md` lines 96 and 103-105), so plan review has no re-review loop to bound.
- Request correction. Asked: "If the same CRITICAL or HIGH comes back after a fix, block the plan instead of looping." Did: the bound blocks when the re-review after one repair returns any `CRITICAL` or `HIGH` finding, the same one or a new one. Reason: a code-review finding line carries no id (item 1), so "the same finding" has no mechanical test once a line number or a defect text changes. The current guard compares a "finding-id set" that no record shape defines, and it fires only when "no file changed between the two rounds" (item 5). After a repair edits files, it never fires. A blocked plan stops and gives the choice to the user through its `Blocked:` line (`plan-contract.md` lines 77-79).

### User choices

- The user chose to leave the plan-lifecycle version, its two manifests, and both marketplace catalogs unchanged in this plan, and to release after the merge with `node scripts/release.mjs --plugin plan-lifecycle <bump>`. Reason: `release.mjs` bumps the plugin's two manifests and its catalog entry in lockstep, then commits, pushes, tags, and waits for tag CI (`scripts/AGENTS.md` lines 171 and 175-185). A bump in this pull request would do that work by hand. The push and the release are non-`local` effects that need an in-session `ask` immediately before they run (`plan-contract.md` lines 303-307).

### Tool facts

- Node 24: `.github/workflows/ci.yml` sets `node-version: '24'`, and root `AGENTS.md` line 15 names Node 24 as the validator runtime.
- Bun 1.4.0: `package.json` `packageManager` (line 4). The full gate runs `bun run test:unit`.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | wrapper_verdicts | In `plugins/plan-lifecycle/agents/code-reviewer.md` workflow item 9, replace the `pass` and `fixes-required` entries with the pass and fixes-required sentences from Verdict text, keep `blocked`, and add the advisory-caps sentence below the list. Replace its Output Format sentence "A `pass` verdict has no finding lines." with the output rule. Add the pass, fixes-required, and advisory-caps sentences to `.codex/agents/code-reviewer.toml` and to the code-reviewer template in `codex-agent-templates.md`, after the Spec axis. | plugins/plan-lifecycle/agents/code-reviewer.md, .codex/agents/code-reviewer.toml, plugins/plan-lifecycle/skills/productivity/plan-workspace/references/codex-agent-templates.md | — | `local` | `planned` | Each of the three files holds the pass sentence and the fixes-required sentence once, and the plugin wrapper still names exactly the three verdicts `pass`, `fixes-required`, and `blocked` |
| 2 | manager_phase6 | In `plan-manager/SKILL.md` phase 6, keep the fix and re-review sentences, add the manager rule after "Re-review only after fixing a `CRITICAL` or `HIGH`.", and replace the progress-guard paragraph with the bound. Keep the pass-to-landing paragraph and the `archive` command row. | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md | 1 | `local` | `planned` | Phase 6 holds the manager rule and the bound once each, and the file no longer contains "same finding-id set" |
| 3 | contract_sync | In `plan-contract.md`, replace "`pass` has no finding lines; the others have at least one." with the record rule. In `plan-md-template.md`, replace "A `pass` record has no finding lines. Every other verdict has at least one finding line." with the record rule, add "A round with only medium and low findings passes." after "review again only after such a fix." in the phase-6 summary, and replace the progress-guard paragraph with the bound. Copy the template's terminal fence to `docs/PLAN.md` byte for byte. | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plan-md-template.md, docs/PLAN.md | 2 | `local` | `planned` | The three files hold the record rule once each, the template and `docs/PLAN.md` hold the bound once each, and `docs/PLAN.md` equals the template's terminal fence |
| 4 | verdict_pins | In `scripts/tests/plan-skill-phases.mjs`, move the clause loop of `assertV3ClausesAndMutations` into a helper that takes a clause list. Add a `REVIEW_VERDICT_CLAUSES` list with the four pins from Verdict text. Add a `review-verdicts` case to `parseArgs` and its usage text that checks that list and prints `review verdict contract passed`, and run the same check in the default case. Remove the `code-review-progress-guard` pin. In `scripts/tests/plan-cli.mjs`, add two archive cases: a `Code-review: pass` line followed by one `MEDIUM` finding line archives, and a `Code-review: fixes-required` line with one `MEDIUM` finding line is refused with `archive requires Code-review: pass`. | scripts/tests/plan-skill-phases.mjs, scripts/tests/plan-cli.mjs | 3 | `local` | `planned` | `node scripts/tests/plan-skill-phases.mjs --case review-verdicts` and `node scripts/tests/plan-cli.mjs` exit 0 |
| 5 | gate_wiring | In the plan orchestration section of `scripts/ci.mjs`, run `scripts/tests/plan-skill-phases.mjs --case review-verdicts` after the two existing cases, with the pass line `review verdict contract passed` and the failure line `review verdict contract failed (run: node scripts/tests/plan-skill-phases.mjs --case review-verdicts)`. In `scripts/tests/ci-plugin-targeting.mjs`, assert that the full, Docks-targeted, and core runs invoke the new case once each. Name the third case where `scripts/AGENTS.md` and `.github/AGENTS.md` name the two existing cases. | scripts/ci.mjs, scripts/tests/ci-plugin-targeting.mjs, scripts/AGENTS.md, .github/AGENTS.md | 4 | `local` | `planned` | `node scripts/tests/ci-plugin-targeting.mjs` exits 0 with the three new count assertions |
| 6 | hash_backfill | Run `node scripts/skills/content-hash.mjs --backfill plugins/plan-lifecycle/skills`. It rewrites `content_hash` and `metadata.updated` of `plan-manager` (its SKILL.md and `plan-contract.md` changed) and of `plan-workspace` (its two references changed). | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md | 5 | `local` | `planned` | `node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills` prints `unchanged` for all three skills and exits 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-skill-phases.mjs --case review-verdicts` | Exit 0 and prints `review verdict contract passed`. Before the change, the suite rejects the unknown case with its usage error and exits 1. |
| A2 | For each of `plugins/plan-lifecycle/agents/code-reviewer.md`, `.codex/agents/code-reviewer.toml`, and `codex-agent-templates.md`, and for each of the clauses `code-review-pass` and `code-review-fixes-required`: save a copy of the file in the review scratch directory (`git rev-parse --git-path docks-review`), delete the clause, run `node scripts/tests/plan-skill-phases.mjs --case review-verdicts`, then restore the copy | Each of the six runs exits 1 with a message that names the file and the clause. `git diff --stat` prints the same output after the six restores as before them. |
| A3 | The same save, delete, run, and restore cycle for `code-review-record-rule` in `plan-contract.md`, `plan-md-template.md`, and `docs/PLAN.md`, and for `code-review-bound` in `plan-manager/SKILL.md`, `plan-md-template.md`, and `docs/PLAN.md` | Each of the six runs exits 1 with a message that names the file and the clause. `git diff --stat` is unchanged after the restores. |
| A4 | `git grep -n -F "same finding-id set" -- plugins scripts docs/PLAN.md` | Prints nothing and exits 1: the progress guard is gone from the manager skill, the template, `docs/PLAN.md`, and the suite. Before the change, it prints four lines. |
| A5 | `node scripts/tests/plan-cli.mjs` | Exit 0, including the two new archive cases. This is a regression guard: `plan.mjs` does not change, so the two cases also pass on the base CLI. |
| A6 | `node scripts/tests/plan-skill-phases.mjs --case bounded-workflows`, then `node scripts/tests/plan-skill-phases.mjs --case plan-workspace-template` | Both exit 0. |
| A7 | `node scripts/tests/ci-plugin-targeting.mjs` | Exit 0. This is the non-unit targeting contract that the separate CI job runs (`.github/AGENTS.md` lines 77-81). |
| A8 | `node scripts/agents/score.mjs --per-file plugins/plan-lifecycle/agents` | Each wrapper scores 14 or more (the per-file floor in `scripts/AGENTS.md` line 90). |
| A9 | `node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills` | Exit 0, and every skill prints `unchanged` (`plugins/plan-lifecycle/skills/AGENTS.md` lines 24-33). |
| A10 | `node scripts/ci.mjs` | Exit 0. The change edits `scripts/ci.mjs` and spans the plan-lifecycle plugin, `docs/`, and the repository tooling, so the full gate applies (root `AGENTS.md` line 143; `scripts/AGENTS.md` line 6). |

## Do not touch

- `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs`: the archive check stays the exact `Code-review: pass` line (item 8).
- Plan review: `plugins/plan-lifecycle/agents/plan-reviewer.md`, `.codex/agents/plan-reviewer.toml`, `plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md`, and the `Plan-review:` verdict words (first request correction).
- The plan-lifecycle version: `plugins/plan-lifecycle/.claude-plugin/plugin.json`, `plugins/plan-lifecycle/.codex-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `.agents/plugins/marketplace.json` (user choice).
- Consumer `.codex/agents/code-reviewer.toml` files that already exist. They are project-owned (item 4).
- `docs/plans/finished/`, which is frozen history.
- The record of issue #16. Its owner runs code review again under the new wrapper.

## Open questions

None

## Review

_No review yet._

## Verification Results

_Not implemented yet._
