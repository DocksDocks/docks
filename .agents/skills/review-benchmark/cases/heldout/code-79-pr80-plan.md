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

- Gap 11: `status` refuses `planned` and `ongoing` while the trimmed Research section is empty or equals `_Not researched yet._`. `blocked` stays allowed. The drafting advice uses the same test. Evidence for equality, not substring: this plan's Research quotes the placeholder in prose, and the 0.13.1 helper then printed `Research is not filled after drafting.` for this plan. Rejected: a done-when text change only, because it is not a gate.
- Gap 12: no automatic retry in the helper, because the server result of a failed write is unknown. The agent runs `show` first. `edit` refreshes provenance only after the remote write succeeds, so one retry with the same file works. Rejected: a helper retry loop.
- Gap 13: advice, not a refusal, with exact path equality after trimming and backtick removal. Rejected: a refusal, because Files cells can hold folders or globs.
- Gap 2: a contract rule, plus `edit` advice when a trusted plan pass exists and Goal, Research, Steps, Acceptance, or Do not touch changed. Rejected: a derived stale verdict, because issue `updatedAt` also changes on comments.
- Gap 9: switch a clean user checkout back to the default branch; keep the merged local branch and name it in the report. Rejected: a branch-deletion question, because yolo asks only the merge question.
- Gap 8: commit each step when its proof passes; review fixes are new commits.
- The trial uses a disposable private repository and the branch files, not the installed plugin.

Trial decisions (gaps 14-18; evidence in Verification Results):

- Gap 14: a red baseline can fail on a missing export or symbol that the step adds. Any other import, setup, or syntax failure is not a red baseline. Do not add an empty stub. Reason: `tdd-workflow` says "the compile error IS the failing baseline" and lists "Add an empty `function foo() {}` stub" as the wrong fix; yolo Red baseline item 2 required an assertion failure. Rejected: keep the yolo text, because two docks rules then conflict.
- Gap 15: the run summary gets its pull request URL and check state after the checks finish, through `gh pr edit --body-file`. An open pull request for the branch gets its body updated instead of a second `gh pr create`. Rejected: write the summary after `gh pr create`, because `gh pr create` needs a body.
- Gap 16: the run summary is the pull request description; `commit-discipline` owns the commits only. Rejected: merge both formats, because the run summary already holds what changed, verification, and decisions.
- Gap 17: temporary check worktrees use `${XDG_DATA_HOME:-$HOME/.local/share}/agent-worktrees/<repository-name>/check-<short-sha>`, the same root as the contract's yolo worktree. Rejected: the review scratch directory, because it is inside `.git`.
- Gap 18: Research is done for an adopted plan that is already ongoing; the Done when names that case. Rejected: move the plan back to planned, because the contract refuses that transition after work starts.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | research_gate | Refuse `status planned` and `status ongoing` without filled Research | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | - | local | done | plan-cli research-gate cases pass; plugin gate green; committed |
| 2 | edit_retry | Keep export provenance until the remote edit succeeds | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | 1 | local | done | plan-cli retry case passes; plugin gate green; committed |
| 3 | shared_files | Advise on steps that share a Files path with no Depends chain | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | 2 | local | done | plan-cli shared-files cases pass; plugin gate green; committed |
| 4 | rereview_advice | Advise on planned-work edits after a plan-review pass | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | 3 | local | done | plan-cli re-review cases pass; plugin gate green; committed |
| 5 | contract_rules | State the gap 2, 3, 11, 12, 13 rules and the yolo adopt pointer in the contract | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md | 4 | local | done | content hash refreshed; plugin gate green; committed |
| 6 | reviewer_checks | Make plan reviewers check repository-required Acceptance rows | plugins/plan-lifecycle/agents/plan-reviewer.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md | 5 | local | done | review blocks still identical; plugin gate green; committed |
| 7 | yolo_rules | Close yolo gaps 1-10 and require code-clarity | plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md | 6 | local | done | content hash refreshed; yolo score at or above floor; plugin gate green; committed |
| 8 | trial_repo | Create and seed the disposable private trial repository | - | 7 | push | done | trial repository main holds the seed commit |
| 9 | trial_runs | Run trial yolo runs A, B, and C with the branch files | - | 8 | probe | done | each run reached its merge question or a recorded stop |
| 10 | trial_analysis | Check each rule against trial evidence and record proven gaps | - | 9 | local | done | evidence table in Verification Results; each proven gap appended as a step |
| 11 | release | Release plan-lifecycle after the landing merge | - | 10 | release | planned | release tag exists, or the user declined and the step is skipped |
| 12 | red_baseline_symbol | Accept a missing added export as a red baseline in yolo | plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md | 10 | local | done | yolo Red baseline item 2 agrees with `tdd-workflow`; fresh agent answer recorded; plugin gate green; committed |
| 13 | summary_after_checks | Update the pull request body with the final run summary after checks | plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md | 12 | local | done | Landing names `gh pr edit --body-file` after checks and for an open pull request; fresh agent answer recorded; plugin gate green; committed |
| 14 | pr_body_owner | Make the run summary the only pull request description format | plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md | 13 | local | done | Engineering standards and Landing name one description format; fresh agent answer recorded; plugin gate green; committed |
| 15 | check_worktree_path | Name the path of temporary check worktrees | plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md | 14 | local | done | Commits and Checks that fail outside the goal name the worktree path; fresh agent answer recorded; plugin gate green; committed |
| 16 | adopted_research_done | Define Research completion for an adopted ongoing plan | plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md | 15 | local | done | Run order Research Done when covers an ongoing adopted plan; fresh agent answer recorded; plugin gate green; committed |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-cli.mjs` | Exit 0; the PASSED line names research gate, edit retry, shared files advice, and re-review advice |
| A2 | `node scripts/ci.mjs --plugin plan-lifecycle` per commit; full `node scripts/ci.mjs` on the reviewed head | Exit 0 for each run |
| A3 | Branch helper on the trial repository: `status <probe> planned` with placeholder Research | Exit 1; stderr `status planned requires a filled Research section` |
| A4 | Branch helper on the trial repository: `edit` of the probe plan with two steps that share a file, then a Research edit after a posted plan-review pass | stdout has `advice: steps <a> and <b> share <path> with no Depends link`, then `advice: plan review passed before this edit; changed sections: Research; run a new plan-review round before code that depends on them` |
| A5 | Trial runs A, B, C | Verification Results hold the rule evidence table; every rule is followed or not exercised, or its gap is a step of this plan |

## Do not touch

Plugin manifest and marketplace version fields (`scripts/release.mjs` bumps them after the merge). Skills of the `docks` plugin. Frozen `docs/plans/finished/` history.

## Open questions

## Verification Results

### Gates and helper probes

- Each of steps 1-7: `node scripts/tests/plan-cli.mjs` printed the PASSED line, and `node scripts/ci.mjs --plugin plan-lifecycle` passed on the committed step in a clean worktree.
- Red runs before each helper change: step 1 `AssertionError: status planned requires a filled Research section` (actual 0, expected 1); step 2 `stale export: ... was exported from a superseded body`; step 3 `only steps without a Depends chain get shared-path advice`; step 4 the re-review advice regex did not match.
- Step 6: the `### Plan review round <N>` blocks of both plan-reviewer files are byte-identical (110 bytes each).
- Step 7: yolo `SKILL.md` has 316 lines; the run summary moved to `references/run-summary.md`. Score 16 against the productivity floor 8.
- Full `node scripts/ci.mjs` on the step 7 head failed `bun run check:js` on the format of one `scripts/tests/plan-cli.mjs` call. The plugin gate does not check that file. The format commit fixed it, and the full gate then passed.
- A3 on the disposable trial repository: `status 1 planned` with placeholder Research printed `status planned requires a filled Research section`, exit 1.
- A4 on the disposable trial repository: `edit` printed `advice: steps add_truncate and fix_slugify share src/text.mjs with no Depends link`. After a posted plan-review pass, a Research edit printed `advice: plan review passed before this edit; changed sections: Research; run a new plan-review round before code that depends on them`. The probe plan was retired.

### Trial runs

Three yolo runs used the branch files in the disposable trial repository. Run A took the truncate and slugify request. Run B received the cut-off request `check the open pull request and`. Run C started in the message that answered run B's merge question. The user answered `Merge now` for runs B and C. Trial issue and pull request numbers below refer to that repository.

| Rule | Run | Evidence | Result |
|---|---|---|---|
| Gap 1: adopt an existing plan; incomplete request | B | No new trial issue between plan 2 and run C's plan 4. Plan 2 Research: "Asked: \"check the open pull request and\" (the text stops after \"and\"). Did: adopted plan [2]" | followed |
| Gap 2: new plan review after a planned-work edit | B | B's Research edit printed `advice: plan review passed before this edit; changed sections: Research; ...`. B wrote no code after it. | followed |
| Gap 3: Acceptance holds repository-required checks | A | Plan 2 Acceptance: "A2 \| `node scripts/check-unicode.mjs` \| Exit 0; prints `unicode check passed`" | followed |
| Gap 4: run summary reports failures and limits | A, B, C | Pull request 3 body: "### Limits and failures - Baseline failure: `node scripts/lint.mjs` exits 1 with `src/legacy.mjs:1: use const or let, not var`" | followed |
| Gap 5: baseline failure outside the goal | A | Plan 2 Verification Results: "Baseline failure: `node scripts/lint.mjs` on `origin/main` (`ea9eab9`) in a temporary worktree: exit 1 with the same line" | followed; worktree path missing (gap 17) |
| Gap 6: red baseline owner and record | A | "Red baseline, step slugify_segments: `node --test test/text.test.mjs`: 3 failed, 1 passed." The truncate step added an empty declaration to avoid an import failure. | followed; conflicts with `tdd-workflow` (gap 14) |
| Gap 7: self-review record | A, C | Comment whose first line is `Self-review`; run A: "`show` did not count it (`code=none` before round 1)" | followed |
| Gap 8: commit timing | A | "Commits: `a5e1841` (step slugify_segments), `f2883fa` (step truncate)"; the review fix `442622e` is a new commit | followed |
| Gap 9: cleanup after the merge | B, C | Run B: "`git status --porcelain` printed nothing, so I switched to `main` and pulled". After run C the clone is on `main` at `40eb8f5`; merged local branches named for deletion. | followed |
| Gap 10: merge answer before a new request | B, C | Pull request 3 merged 21:23:18Z; plan 2 closed 21:23:19Z; run C's plan 4 created 21:24:47Z | followed |
| Gap 11: Research gate | probe | `status planned requires a filled Research section`, exit 1 | followed |
| Gap 12: GitHub failure retry | - | No `gh` call failed during the trial. The plan-cli retry case covers the helper change. | not exercised |
| Gap 13: shared Files paths | probe, A | Probe advice line above; plan 2 step truncate shares `src/text.mjs` with step slugify_segments and has Depends 1 | followed |
| `code-clarity` on every code change | A, C | Plan 2 Engineering standards: "slugify_segments \| `tdd-workflow`, `code-clarity`, `commit-discipline`"; run C applied it to the README code block | followed |

Accepted gaps (trial event quote plus rule text):

- Gap 14. Event (run A): "I added an empty `truncate` declaration first. Without it, the missing named export fails the whole test file at import." Text: yolo Red baseline item 2 "Each new test must fail on an assertion, not on an import, setup, or syntax error" against `tdd-workflow` "Add an empty `function foo() {}` stub ... the compile error IS the failing baseline."
- Gap 15. Event (runs A and C): "I wrote \"this pull request\" and \"pending when opened\" first. After the checks passed, I filled in the real values with `gh pr edit --body-file`." Run B replaced the body of an existing pull request without a rule. Text: Landing step 4 writes the summary before step 5 opens the pull request, and the template starts "Pull request: <url>. Checks: <state>."; Landing step 5 only names `gh pr create`.
- Gap 16. Event (run A): "I used only the yolo run-summary template and dropped the `commit-discipline` sections". Text: Engineering standards row "Commits and the pull request description \| `commit-discipline`" against Landing step 4 "Write the run summary from `references/run-summary.md`".
- Gap 17. Event (run A): "For the lint check on `origin/main`, I put the worktree under the review scratch directory". Text: `grep -rn "temporary worktree" plugins/plan-lifecycle` finds only yolo "Run the same check on `origin/<default>` in a temporary worktree." with no path.
- Gap 18. Event (run B): "The Research \"Done when\" cannot be tested on an adopted plan that is ongoing." Text: Run order Research "`status <n> planned` succeeds" against the contract "After it starts, only ongoing and blocked are legal targets."

Rejected candidates: reviewer wrappers from the installed plugin (a trial setup effect: the trial forbade the installed plugin); a review fix that changes a spec assertion (Red baseline item 4 covers it); acceptance for a check that fails on the default branch and a missing type checker (Checks that fail outside the goal covers it, and the run recorded it); the meaning of "check" and of "the open pull request" (the incomplete-request rule covers both, and the run followed it); summary content for an adopted plan, and where adoption facts go (the template and the contract sections cover them); acceptance rerun when the default branch did not move (no rule forbids it); merge method (the contract permits any method that the repository allows); remote and earlier-run branches (no deletion happened, which is the safe default); the user's checkout in an adopted run, `code-clarity` on a README code block, proof for a non-`tdd-workflow` step, and review results in Verification Results (each run followed the existing text).

### Proofs for steps 12-16

Each step was committed alone, and `node scripts/ci.mjs --plugin plan-lifecycle` passed on each commit. A fresh read-only agent then got the trial situation and the new yolo text, without the expected answer.

- Step 12 (gap 14): "Yes, this is a valid red baseline ... The docks `tdd-workflow` skill agrees". The agent found that "for it" did not say whether the record replaces the counts. A new commit now says "instead of the counts for that file".
- Step 13 (gap 15): "You write `pending` for both the URL and the checks ... The real values go in only after the head check in step 7"; for an open pull request: "You use `gh pr edit` for the body, not `gh pr create`."
- Step 14 (gap 16): "For the pull request description, use the yolo run summary as written, with nothing added. For commit messages, follow `commit-discipline`. The two texts do not conflict".
- Step 15 (gap 17): the agent gave `git worktree add --detach "${XDG_DATA_HOME:-$HOME/.local/share}/agent-worktrees/yolo-trial/check-ea9eab9" ea9eab9` and "the path must not be under `/tmp` or inside `.git`". It noted that no fetch came before the check. A new commit adds `git fetch origin <default>` first.
- Step 16 (gap 18): "Research counts as done ... This plan reads `ongoing`". It found that the Draft Done when could not be met by an adopted plan. A new commit adds "The run adopted a plan" to that Done when.

### Acceptance on the candidate head

- A1 `node scripts/tests/plan-cli.mjs`: exit 0; PASSED line ends with `machine path advice, research gate, edit retry, shared files advice, re-review advice`.
- A2 full `node scripts/ci.mjs` on `9105202b`: `All ci.mjs checks passed - 2 plugin(s) + repo-wide`.
- A3 and A4: see Gates and helper probes. A5: see Trial runs.
