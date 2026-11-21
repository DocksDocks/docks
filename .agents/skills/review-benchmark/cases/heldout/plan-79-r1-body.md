<!-- plan-contract: v4 -->

## Goal

Close the 13 gaps that #78 lists in the plan-lifecycle plugin: the yolo skill, the plan contract, the plan-reviewer surfaces, and plan.mjs. Make the yolo skill apply `code-clarity` to every change of code, tests, comments, or error messages. After the fixes, run trial yolo runs in a disposable private repository, and fix in this plan each further gap that the trial proves with evidence.

Mode: plan-and-implement

## Research

Repository facts (paths relative to the repository root):

- `plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md`: Run order Decide says "The path is a plan... Ask nothing", and Draft always runs `new` (gap 1). Review loops has no rule for edits after `plan=pass` (gap 2). Research has no required-check rule (gap 3). The Run summary template has only `<command>: <result>` (gap 4). The constraints have no baseline-failure rule (gap 5). Engineering standards maps `tdd-workflow` but names no baseline owner or record (gap 6). Self-review has no record (gap 7). Landing step 1 says "Commit the reviewed bytes" with no commit timing (gap 8). Landing step 9 covers only a worktree (gap 9). No rule orders a merge answer and a new request (gap 10). `code-clarity` applies only to the row "Names, comments, errors, and function size".
- `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs`: `setPlanStatus` writes `planned` with placeholder Research; `printAdvice` only advises `Research is not filled after drafting.` after the write (gap 11). `runGh` throws `gh <a> <b> failed: <stderr>`; the top-level catch prints it on stderr with exit 1 and nothing on stdout. `editPlan` refreshes the `.origin` sidecar before the remote write, so a retry of the same file after a failed `gh issue edit` refuses as `stale export` (gap 12). No code reads the Files cell (gap 13).
- `plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md`: the refusal list has no `gh` failure and no retry rule (gap 12); Steps has no Files grammar and no overlap rule (gap 13); the review loop has no re-review rule after a pass (gap 2).
- `plugins/plan-lifecycle/agents/plan-reviewer.md` and `plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md`: the `goal_fit` triggers do not cover a missing repository-required check (gap 3). The review block must stay identical in both files (`plugins/plan-lifecycle/skills/AGENTS.md`, Plan-skill contract sync).
- `scripts/tests/plan-cli.mjs` tests the helper with the stub `scripts/tests/fixtures/gh-stub/gh`; the stub fails every `issue edit` while `state.issueEditError` is set.
- Versioning (`scripts/AGENTS.md`): a pull request does not bump plugin versions; `scripts/release.mjs` bumps them after the merge.
- `code-clarity` lives at `plugins/docks/skills/engineering/code-clarity/SKILL.md`.

Decisions:

- Gap 11: `status` refuses `planned` and `ongoing` while Research is empty or holds `_Not researched yet._`. `blocked` stays allowed. The drafting advice uses the same test. Rejected: a done-when text change only, because it is not a gate.
- Gap 12: no automatic retry in the helper, because the server result of a failed write is unknown. The agent runs `show` first. `edit` refreshes provenance only after the remote write succeeds, so one retry with the same file works. Rejected: a helper retry loop.
- Gap 13: advice, not a refusal, with exact path equality after trimming and backtick removal. Rejected: a refusal, because Files cells can hold folders or globs.
- Gap 2: a contract rule, plus `edit` advice when a trusted plan pass exists and Goal, Research, Steps, Acceptance, or Do not touch changed. Rejected: a derived stale verdict, because issue `updatedAt` also changes on comments.
- Gap 9: switch a clean user checkout back to the default branch; keep the merged local branch and name it in the report. Rejected: a branch-deletion question, because yolo asks only the merge question.
- Gap 10: the merge question gets a third option, `Merge and continue`, for a merge answer that also holds a new request. On it, merge and archive this plan first, then start the new request as a new yolo run. Rejected: read the new request from the answer text, because one answer then holds two decisions.
- Gap 8: commit each step when its proof passes; review fixes are new commits.
- Gap 7: the self-review returns the code-review block shape: `### Code review round 0`, then a `Code-review:` verdict line, then its findings. Post it unchanged as one issue comment before round 1, as each review round is posted. Rejected: a Verification Results line, because the body never holds a review.
- The trial uses a disposable private repository and the branch files, not the installed plugin.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | research_gate | Refuse `status planned` and `status ongoing` without filled Research | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | - | local | planned | plan-cli research-gate cases pass; plugin gate green; committed |
| 2 | edit_retry | Keep export provenance until the remote edit succeeds | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | 1 | local | planned | plan-cli retry case passes; plugin gate green; committed |
| 3 | shared_files | Advise on steps that share a Files path with no Depends chain | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | 2 | local | planned | plan-cli shared-files cases pass; plugin gate green; committed |
| 4 | rereview_advice | Advise on planned-work edits after a plan-review pass | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | 3 | local | planned | plan-cli re-review cases pass; plugin gate green; committed |
| 5 | contract_rules | State the gap 2, 3, 11, 12, 13 rules and the yolo adopt pointer in the contract | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md | 4 | local | planned | content hash refreshed; plugin gate green; committed |
| 6 | reviewer_checks | Make plan reviewers check repository-required Acceptance rows | plugins/plan-lifecycle/agents/plan-reviewer.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md | 5 | local | planned | review blocks still identical; plugin gate green; committed |
| 7 | yolo_rules | Close yolo gaps 1-10 and require code-clarity | plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md | 6 | local | planned | content hash refreshed; yolo score at or above floor; plugin gate green; committed |
| 8 | trial_repo | Create and seed the disposable private trial repository | - | 7 | push | planned | trial repository main holds the seed commit |
| 9 | trial_runs | Run trial yolo runs A, B, and C with the branch files | - | 8 | probe | planned | each run reached its merge question or a recorded stop |
| 10 | trial_analysis | Check each rule against trial evidence and record proven gaps | - | 9 | local | planned | evidence table in Verification Results; each proven gap appended as a step |
| 11 | release | Release plan-lifecycle after the landing merge | - | 10 | release | planned | release tag exists, or the user declined and the step is skipped |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-cli.mjs` | Exit 0; the PASSED line names research gate, edit retry, shared files advice, and re-review advice |
| A2 | `node scripts/ci.mjs --plugin plan-lifecycle` per commit and on the reviewed head | Exit 0 for each run |
| A3 | Branch helper on the trial repository: `status <probe> planned` with placeholder Research | Exit 1; stderr `status planned requires a filled Research section` |
| A4 | Branch helper on the trial repository: `edit` of the probe plan with two steps that share a file, then a Research edit after a posted plan-review pass | stdout has `advice: steps <a> and <b> share <path> with no Depends link`, then `advice: plan review passed before this edit; changed sections: Research; run a new plan-review round before code that depends on them` |
| A5 | Trial runs A, B, C | Verification Results hold the rule evidence table; every rule is followed or not exercised, or its gap is a step of this plan |

## Do not touch

Plugin manifest and marketplace version fields (`scripts/release.mjs` bumps them after the merge). Skills of the `docks` plugin. Frozen `docs/plans/finished/` history.

## Open questions

## Verification Results
