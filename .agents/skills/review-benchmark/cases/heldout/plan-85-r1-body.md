<!-- plan-contract: v4 -->

## Goal

Fix yolo Landing step 11. When the message that answers the merge question also starts a new yolo run, step 11 says to merge or leave open, then archive and run Teardown. On Leave pull request open, the plan stays open and plan.mjs refuses to archive it. Make step 11 follow step 9 on Merge now and step 10 on any other answer, then start the new run. Scope: plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md only. Source: code review rounds 1 and 2 on plan #83.

Mode: plan-and-implement

## Research

### Request

- The owner chose "Fix in a new plan" in an in-session `ask` (2026-10-21), after code review rounds 1 and 2 of plan #83 both reported this MEDIUM finding.
- Plan #83 (PR #84) rewrote the sentence from "archive and clean up" to "archive and run Teardown" and kept the archive call on the open path (`git show 14691074 -- plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md`).

### Repository facts

- `plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md` Landing step 11 (lines 306-308): "When the message that answers the merge question also starts a new yolo run, finish this run first: merge or leave open as the answer says, then archive and run Teardown. Then start the new run."
- Landing step 9 owns the `Merge now` path: merge and archive as the contract says, run the contract's Teardown, report Kept resources, and ask before each later plan step and production cleanup.
- Landing step 10 owns every other answer: leave the pull request and issue open, run Teardown's exit without a merge, report both links and Kept resources.
- `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs:935` refuses archive for any status other than `finished`: `archive requires finished status, found ${status}`. On `Leave pull request open` the issue stays open, so its status is `ongoing` and archive fails.
- No other file restates the new-run handoff (`grep -rn 'new yolo run' plugins .codex .agents` matches only yolo `SKILL.md`:306).
- After a meaning change, `node scripts/skills/content-hash.mjs --backfill plugins/plan-lifecycle/skills` resyncs `content_hash` and `metadata.updated` (`plugins/plan-lifecycle/skills/AGENTS.md`). `node scripts/ci.mjs --plugin plan-lifecycle` is the authoritative gate; `claude plugin validate` in it needs the lockfile-pinned CLI (`bun install --frozen-lockfile` runs the package's `postinstall`, which puts the native binary in place; then `node_modules/.bin` on `PATH`, as `.github/workflows/ci.yml` does).

### Decisions

- New step 11 delegates to the existing steps: on `Merge now`, follow step 9; on any other answer, follow step 10; then start the new run. Reason: steps 9 and 10 already own each path, so step 11 copies no rule and cannot drift from them.
- Rejected: keep "archive" and add "only on `Merge now`" inside step 11. It repeats step 9's sequence and leaves a second copy to maintain.

### Engineering standards

Prose-only change in one shipped skill body. It follows the plan-lifecycle authoring node and the Simplified Technical English output standard. No code, test, or error message changes.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | fix_step_11 | Rewrite yolo Landing step 11: finish this run first; on `Merge now`, follow step 9, or step 10 when step 9 fails; on any other answer, follow step 10; then start the new run. | `plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md` | - | local | planned | Step 11 names step 9 for `Merge now` and step 10 for every other answer, and it no longer says to archive on its own |
| 2 | refresh_hash | Run `node scripts/skills/content-hash.mjs --backfill plugins/plan-lifecycle/skills`. | `plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md` | - | local | planned | `node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills` exits 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/ci.mjs --plugin plan-lifecycle` | Exit 0 |
| A2 | `node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills` | Exit 0 |
| A3 | `grep -n 'then archive and run Teardown' plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md` | No output, exit 1 |
| A4 | `grep -A3 '^11\. ' plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md` | The step names step 9 for `Merge now` and step 10 for any other answer |

## Do not touch

- `plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md`, plan-manager `SKILL.md`, and `references/run-summary.md`: they do not hold the new-run handoff.
- `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs` and its tests.
- Plugin manifests, marketplace catalogs, versions, tags, and releases.

## Open questions

## Verification Results
