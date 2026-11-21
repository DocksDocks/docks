<!-- plan-contract: v4 -->

## Goal

Remove the files under docs/ that only the pre-GitHub plan workflow used, because plans live in GitHub issues and the files add noise: the frozen plan archive docs/plans/ (121 files), docs/release-evidence/, docs/authoring-audits.md, docs/optimization-audit-may-2026.md, and docs/PLAN-QUEUE.md. Remove the no-bespoke-gates guard with its test, fixtures, registry row, and gate step, because its fourth test needs a plan body under docs/plans and can never fire after the removal. Update every reference in this repository (docs/AGENTS.md, docs/PLAN.md, the root AGENTS.md, scripts/AGENTS.md, .github/AGENTS.md, .claude/launch.json, and script comments). Keep docs/AGENTS.md and docs/PLAN.md, and keep the shipped plan-lifecycle guidance about docs/plans/finished/ for other projects. Git history keeps every removed file.

Yolo: the user delegated every decision except the merge to the agent.

Mode: plan-and-implement

## Research

### Facts

- Plans have been GitHub issues since commit `b976562e` ("make the plan record a GitHub issue"); docs/AGENTS.md and docs/PLAN.md call `docs/plans/finished/` frozen pre-GitHub history that no helper reads. The archive holds 121 files (4.9 MB).
- `git grep` outside the removed files finds these references: docs/AGENTS.md (the PLAN-QUEUE note, the frozen-archive note, and the point-in-time records section), docs/PLAN.md (two lines), the root AGENTS.md (repository scope and the context-tree row for docs/AGENTS.md), scripts/AGENTS.md (the PLAN-QUEUE sentence and the durable-anchors and no-bespoke-gates rows), .github/AGENTS.md (the repo lane list names no-bespoke-gates), .claude/launch.json (its only configuration serves docs/plans over HTTP), scripts/ci.mjs (the no-bespoke-gates gate step), scripts/tests/ci-plugin-targeting.mjs (an assertion that the repo lane runs that guard once), scripts/config/test-contracts.json (row `unit-no-bespoke-gates`), scripts/lib/ci-targeting.mjs (a comment), scripts/skills/durable-anchors.mjs (`SKIP_PATHS` skips docs/plans, and its comments), and scripts/skills/refs-guard.mjs (a comment with a docs/plans example).
- `scripts/plans/no-bespoke-gates.mjs` flags an export only when all four of its measurements hold; the fourth is "a plan body under docs/plans/ names the export" (`PLAN_DIR`). Its unit test (`scripts/tests/unit/no-bespoke-gates.test.mjs`) reads a real archive file (`PLAN_PATH`) and fixtures under `scripts/tests/unit/fixtures/no-bespoke-gate/`. With docs/plans gone, the guard can never report a defect.
- docs/release-evidence/, docs/authoring-audits.md, and docs/optimization-audit-may-2026.md are dated records; nothing in the repository reads them (the word `release-evidence` in `scripts/tests/test-contracts.mjs` is a release-role value, not the folder).
- The shipped plan-lifecycle skills (`plan-contract.md`, `plan-workspace/SKILL.md`, `plan-md-template.md`) mention `docs/plans/finished/` and `docs/PLAN-QUEUE.md` for projects that migrated from the old layout; that guidance concerns other repositories and stays.
- The review benchmark's held-out case `code-H1-plan.md` quotes a historical plan that names `docs/plans/finished/`; it is case data and stays.

### Decisions

1. **Remove the records.** Delete docs/plans/, docs/release-evidence/, docs/authoring-audits.md, docs/optimization-audit-may-2026.md, docs/PLAN-QUEUE.md, and .claude/launch.json.
2. **Rewrite the docs node.** docs/AGENTS.md keeps its plan-record routing, drops the PLAN-QUEUE and frozen-archive notes, and replaces the point-in-time records section with a records rule: docs/ holds only AGENTS.md and PLAN.md; plans, audits, and release evidence are recorded in GitHub issues and pull requests; long-lived documentation uses the durable anchor grammar. docs/PLAN.md drops its two lines about the archive and PLAN-QUEUE. The root AGENTS.md describes docs/ as plan routing and drops the context-tree row for docs/AGENTS.md, because Claude Code and Codex load a nested AGENTS.md from its folder without a row.
3. **Remove the guard.** Delete `scripts/plans/` (the guard is its only file), the unit test and its fixtures, the registry row, the gate step, the ci-plugin-targeting assertion, the scripts/AGENTS.md row, the .github/AGENTS.md mention, and the ci-targeting comment. Rejected: a guard that reads plan issues (network access in the gate) and a plan citation in code (the user chose removal).
4. **Drop the dead skip.** `durable-anchors.mjs` loses `SKIP_PATHS` and its docs/plans comments, so every AGENTS.md node is in scope; the scripts/AGENTS.md row says so. `refs-guard.mjs` gets a generic example in its comment.
5. **Review diff.** The review diffs go to `.git/docks-review/` and show each deleted file by name only (`git diff -D`), and the dispatch lists the deleted paths, because the archive's text is not under review.

### Engineering standards

- Steps 1 and 2: `code-clarity` for the changed text and comments.
- Commits: `commit-discipline`. Step 2 lands as two commits, first the guard script, its unit test, and its fixtures, then the registry row, the gate step, and the text edits; each commit stays green, so either one can be reverted alone. Self-review during code review round 1: `code-review` with `code-clarity`.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | remove_records | Implement decisions 1 and 2 | docs/, .claude/launch.json, AGENTS.md | - | local | planned | the files are gone, and docs/AGENTS.md, docs/PLAN.md, and the root AGENTS.md name no removed file |
| 2 | remove_guard | Implement decisions 3 and 4 | scripts/plans/, scripts/tests/unit/no-bespoke-gates.test.mjs, scripts/tests/unit/fixtures/no-bespoke-gate/, scripts/config/test-contracts.json, scripts/ci.mjs, scripts/AGENTS.md, .github/AGENTS.md, scripts/lib/ci-targeting.mjs, scripts/skills/durable-anchors.mjs, scripts/skills/refs-guard.mjs | - | local | planned | the guard and its test are gone, and the registry, author-tooling, CI targeting, and durable-anchors checks pass |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| a1 | `bun scripts/ci.mjs` | exits 0 for the repo-wide checks and both plugins |
| a2 | `git grep -n -E 'no-bespoke\|PLAN-QUEUE\|docs/plans\|release-evidence/\|authoring-audits\|optimization-audit' -- ':!plugins/plan-lifecycle' ':!.agents/skills/review-benchmark/cases'` | prints nothing |
| a3 | `ls docs` | `AGENTS.md` and `PLAN.md` only |
| a4 | pull request checks | every check passes |

## Do not touch

- The shipped plan-lifecycle guidance about docs/plans/finished/ and docs/PLAN-QUEUE.md for other projects.
- The review benchmark case data.
- Git history: no rewrite.

## Open questions

## Verification Results
