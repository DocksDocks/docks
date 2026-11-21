<!-- plan-contract: v4 -->

## Goal

Fix two plan-lifecycle defects that agent sessions reported.

- #125: a landing pull request merged into the default branch with `Closes #<n>` in its description, but GitHub left the plan issue open. After a manual close, `plan.mjs archive` refuses, and the contract gives no next step. Outcome: the contract and the helper give one supported way to finish and archive such a plan, with the merged pull request as proof.
- #122: the yolo skill says "Push the linked branch with a normal push" and has no rule for a repository hook that fails, so an agent ran `git push --no-verify`. Outcome: the yolo skill and the contract treat a failing repository hook, such as a pre-push hook, as a failed check, and never skip it.

Scope: the plan-lifecycle plugin (yolo and plan-manager skills, the plan contract, `plan.mjs`) and its plan-CLI tests. The landing pull request closes #122 and #125.

Yolo: the user delegated every decision except the merge to the agent.

Mode: plan-and-implement

## Research

### Repository facts

- `plan.mjs` `archivePlan` proves a landing only through the latest `ClosedEvent` closer: a merged pull request whose description holds a closing keyword for the plan (`hasClosingKeyword`), or a commit with an associated merged pull request into the default branch. It refuses an open plan with `archive requires finished status, found <status>`, and a plan closed by hand (closer `null`) with `archive requires a closing pull request merged into <nameWithOwner>:<branch>`. No command or contract step finishes a plan whose landing merge did not close it.
- `readSnapshot` reads the closer body and the commit associations only for `archive` (option `archive`). `reopen` reads the closure through option `closure` and uses the closer number and repository, not its body.
- `reopen <n> --pr <pr>` already reads a named pull request (`readPullRequest`) and polls the plan with `REOPEN_PAUSES_MS` and `REOPEN_READS` (about 60 s). The plan-CLI cases skip those waits through `scripts/tests/plan-cli/skip-waits.mjs` and check the recorded pauses.
- The fake gh `issue close` sets the state but records no comment and no `ClosedEvent`; `closedPlan` in `scripts/tests/plan-cli/harness.mjs` stores the closer only in the issue timeline, not in `state.prs`.
- In this repository the same flow closes the issue: plan #123 has the `ClosedEvent` closer pull request #124 (GraphQL, 2026-11-05), from a `gh issue develop` branch, with a description edited by `gh pr edit --body-file`. So the edit and the linked branch are not the trigger of #125.
- The yolo skill Landing step 3 says only "Push the linked branch with a normal push". Its "Checks that fail outside the goal" section and the contract's Checks and merge section cover pull request checks only. No plan-lifecycle file names a repository hook.
- Other mentions of `archive`: `plan-manager/SKILL.md` (Done when of Landing), `plan-contract.md` (command table, refusals, Pull requests, Archive, After archive). `plugins/docks/README.md` says "`plan.mjs archive` verifies the merged closing pull request", which stays true. The review-benchmark cases under `.agents/skills/review-benchmark/cases/` are frozen historical inputs.
- Repository rules for these paths: `plugins/plan-lifecycle/skills/AGENTS.md` (run the content-hash backfill after a meaning change; shipped bodies name no author scripts; owning gate `bun scripts/ci.mjs --plugin plan-lifecycle`), `scripts/AGENTS.md` (the plan-CLI suite runs in that plugin gate; no test pins skill prose), root `AGENTS.md` (one plugin, so the plugin gate is authoritative).

### Official sources

- GitHub closes an issue when a linked pull request merges into the default branch, and closing keywords work only for the default branch: <https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue>.
- Since 2025-04-23, a repository setting "Auto-close issues with merged linked pull requests" can turn that close off; it is on by default: <https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-auto-closing-issues>, <https://github.blog/changelog/2025-04-23-users-can-now-choose-whether-merging-linked-pull-requests-automatically-closes-the-issue/>. Neither the REST repository object nor the GraphQL `Repository` type exposes this setting (checked 2026-11-05 with `gh api`), so the helper cannot detect it.
- A keyword in a commit message also closes the issue when the commit reaches the default branch (same linking page). This fits #125: the non-plan pull request that closed its issue also had the keyword in its commit message. The cause in #125 is not confirmed; the fix does not depend on it.
- Git hooks: `pre-commit` and `pre-push` can be bypassed with `--no-verify`, and `core.hooksPath` moves the hooks directory: <https://git-scm.com/docs/githooks>, <https://git-scm.com/docs/git-push>, <https://git-scm.com/docs/git-commit>. Husky turns all hooks off with `HUSKY=0`: <https://github.com/typicode/husky/blob/main/docs/how-to.md>.

### Decisions

1. `archive` takes the landing pull request: `archive <n> --pr <pr>`, like `reopen <n> --pr <pr>`. The proof is that pull request: merged, in this repository, into the default branch, with a closing keyword for the plan in its description. The latest closer is no longer the proof. Rejected: keep the closer proof and add `--pr` as a second path (two proof rules for one fact); find the pull request through `closedByPullRequestsReferences` (#63 removed that read because GitHub classifies `gh issue develop` pull requests as user-linked).
2. When the plan is open, `archive` first waits for GitHub to close it, with the same pauses as `reopen` (about 60 s), so it does not race GitHub's own close (the #90 race was a reopen against that close). When GitHub closes it, archive continues. When the plan is still open after the waits, archive first closes it as completed with the comment `Closed by archive: pull request #<pr> merged into <branch> and closes this plan, but GitHub left the plan open.`, and only then removes the phase labels. That order keeps a rerun valid after a partial failure: a failed close leaves the plan `ongoing`, and a failed label removal leaves it `finished`; both pass the archive status check. Removing the labels first would leave an open plan without a phase label (`unlabelled`), which archive refuses. Only an `ongoing` open plan qualifies. Rejected: a contract-approved manual close (the agent would need a second step and the record would have no proof line).
3. A plan that a user closed as completed archives with the same pull request proof. A retired, duplicate, or unreadable plan still refuses.
4. Refusals: `archive requires an issue and --pr` (new), `archive requires ongoing or finished status, found <status>` (replaces `archive requires finished status, found <status>`), and the existing `pull request #<pr> is not merged` and `archive requires a closing pull request merged into <nameWithOwner>:<branch>` for a pull request that fails the proof.
5. The wait constants serve `reopen` and `archive`, so they get a shared name (`CLOSE_WAIT_PAUSES_MS`, `CLOSE_WAIT_READS`). The closer `body` field and the archive-only commit association read leave `readSnapshot`, because no proof reads them now.
6. For a partial pull request in a repository that does not close issues on merge, `reopen` reports `GitHub has not closed plan #<n> for pull request #<pr> yet; run reopen again once it has`. The contract adds: when a second run reports the same and `show` reads `ongoing`, the plan is open, so continue without a reopen. The helper code of `reopen` does not change.
7. Repository hooks (#122): the contract gets a `### Repository hooks` rule under Landing and archive proof. A hook is a required check; never skip or turn it off (`--no-verify`, `-n` of `git commit`, a `core.hooksPath` change, `HUSKY=0`). When the plan causes the failure, fix it. When untracked or modified files that the plan did not make cause it, record them and block; do not run the command from another worktree to avoid them, because a new worktree can lack the hook setup of the checkout (code review round 2: Husky sets the hooks path to `.husky/_` and writes a `.gitignore` of `*` there, so a fresh worktree has no hook wrappers: <https://github.com/typicode/husky/blob/main/index.js>). The same gap exists, from before this plan, in the worktree that Yolo runs, Linked branch timing, makes for a dirty checkout. Code review rounds 2 and 3 showed that a check of hook files depends on the hook manager, so this plan does not change that section and defers the gap to #127. When the hook fails the same way on `origin/<default>`, it is a baseline failure: record it, block the plan, and ask the user. The Yolo runs table gets a row: a yolo run records the failure, sets the plan blocked with the hook name and the failing check, runs Teardown's exit without a merge, and lists the unpushed branch under Kept resources. The yolo skill points to that rule from Commits item 1, Landing step 3, and "Checks that fail outside the goal", adds "Do not skip a repository hook" to its second constraint, and adds a BAD/GOOD pair. Rejected: ask the user in a yolo run (the yolo skill allows no question before the merge except the stall question); push from a detached worktree (it can skip the hook).
8. The plugin version changes only through the release after the merge (step `release`), because a yolo run does not release before the merge.
9. Steps after the landing merge run once the landing pull request has merged, whether or not GitHub has closed the plan. The contract's "Steps after the landing merge" says that such a step stays `planned` "until the landing merge closes the issue"; when GitHub does not close the plan, that step never runs, and archive refuses the non-terminal step. The rule becomes: the step stays `planned` until the landing pull request merges; then ask in session, run it, and mark it with `step` (an open plan is `ongoing`, so `step` accepts it; a finished plan accepts `done` or `skipped`). Archive runs after every step is terminal. Yolo Landing step 9 gets the same order: merge, then each step after the merge with its own question, then archive, then Teardown.
10. Code review round 1 and its self-review (issue comments) found defects in done steps, so step `review_fixes` carries the repairs. Helper: archive refuses a plan with a malformed Steps row (`refuseMalformedSteps`), as `edit` and `step` do; before its own close, archive repeats the pre-write body comparison and the foreign-owner check, so a concurrent edit or a new owner stops the close; archive posts the close comment only when the plan does not already hold it from the acting login, because gh posts the comment before it closes; the unreachable same-repository check of the pull request goes. Tests: the proof, step, review, and owner refusals also run on an open plan with no write, close, or wait; exact waits; a REOPENED-stuck case; the fake `issue close` follows gh (comment first, no write on a closed issue, a failure after the comment); the commit-association paging case moves to `reopen`. Contract: Repository hooks blocks when files that the plan did not make fail a hook (decision 7), fetches `origin/<default>` for the baseline, names `-n` only for `git commit`, routes a hook that refuses the push before a block or a stall, and routes a hook failure in a step after the merge to that step; Archive states that its rerun replaces step 3 of the retry steps; Steps after the landing merge names `done` and `skipped`; long sentences split.

### Engineering standards

- Step `archive_pr`: `tdd-workflow` (red baseline of the new archive cases before production code), `code-clarity` (names, refusal messages, comments), `commit-discipline`.
- Step `contract_archive`: `code-clarity` (refusal strings in the contract), `commit-discipline`.
- Step `hook_rule`: `commit-discipline`; the skill-authoring rules of `plugins/plan-lifecycle/skills/AGENTS.md`.
- Step `hashes_gate`: `commit-discipline`.
- Step `review_fixes`: `fix-workflow` (reproduce each finding, test that fails when the fix is removed), `code-clarity`, `commit-discipline`.

### Request corrections

- Asked: (interjection during research) fix the omp prompt for a read of the hooks path, and create an issue in DocksDocks/public. Did: created DocksDocks/public#126 with a second comment, and keep the fix out of this plan. Reason: the rule lives in DocksDocks/public `SoT/.omp/config.yml`, another repository, which root `AGENTS.md` names as the home of consumer permissions.

### Tool facts

- Node: v26.13.0 locally (`node --version`, 2026-11-05); CI pins Node 24 (`.github/workflows/ci.yml` `node-version`).
- Bun: 1.4.4 (`package.json` `packageManager`).
- gh: 2.103.3 (`gh --version`, 2026-11-05).
- git: 2.53.0 (`git --version`, 2026-11-05).

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | archive_pr | Write the new archive cases first (red baseline), then make `archive` take `--pr <pr>` and prove the landing with that pull request (decisions 1 to 5): wait for GitHub to close an open ongoing plan, then close it as completed with the comment, and remove the phase labels only after the close; accept a plan closed by hand as completed; refuse a missing `--pr`, an unmerged pull request, a pull request into another branch or without the keyword, and an open plan that is not ongoing. Teach the fake gh to record the `issue close` comment and a `ClosedEvent` without a closer, and to serve the closer pull requests of `closedPlan` from `state.prs`. Move every existing archive case to `--pr`. Rename the wait constants and remove the closer `body` and the archive-only commit association read | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli/archive-closer.test.mjs, scripts/tests/plan-cli/archive-retire-list.test.mjs, scripts/tests/plan-cli/harness.mjs, scripts/tests/fixtures/gh-stub/gh, scripts/tests/plan-cli/gh-stub.test.mjs | - | local | done | `node scripts/tests/plan-cli.mjs` passes; the new cases failed before the production change (red baseline recorded); a case shows an open plan archived after the waits with the close comment stored; a case shows GitHub's close during the waits with no helper close; a case shows that a rerun after a failed close archives the plan |
| 2 | contract_archive | Update the contract command table, the refusal list, the Archive section, After archive, the partial pull request note (decision 6), and "Steps after the landing merge" (decision 9) for `archive <n> --pr <pr>`; update the plan-manager Landing Done when; put yolo Landing step 9 in the order of decision 9 | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md | 1 | local | done | Every refusal string of `archive` in `plan.mjs` is in the contract refusal list; no plan-lifecycle file names `archive <n>` without `--pr`; no plan-lifecycle file makes a step after the merge wait for GitHub's close |
| 3 | hook_rule | Add the contract `### Repository hooks` rule and its Yolo runs row (decision 7); point to it from yolo Commits item 1, Landing step 3, and "Checks that fail outside the goal"; add the constraint line and the BAD/GOOD pair | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md | 2 | local | done | The contract states the hook rule and the yolo row; yolo Landing step 3 names it; no plan-lifecycle file tells an agent to skip a hook |
| 4 | hashes_gate | Run the content-hash backfill for plan-lifecycle skills, check that `plan-manager/SKILL.md` `metadata.updated` reads the change date, run the read-only live archive probe, and run the plugin gate | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md | 3 | probe | done | Acceptance A1 to A5 hold |
| 5 | release | After the landing merge, release plan-lifecycle with a minor bump: `bun scripts/release.mjs --plugin plan-lifecycle minor` | plugins/plan-lifecycle/.claude-plugin/plugin.json, plugins/plan-lifecycle/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 4 | release | done | The release command prints the new tag and GitHub lists the release |
| 6 | review_fixes | Repair the code review round 1 and self-review findings (decision 10): helper guards and close comment, tests and fake gh, contract and skill text; refresh the content hashes; rerun the plugin gate | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli/archive-closer.test.mjs, scripts/tests/plan-cli/archive-retire-list.test.mjs, scripts/tests/plan-cli/reopen.test.mjs, scripts/tests/plan-cli/harness.mjs, scripts/tests/plan-cli/skip-waits.mjs, scripts/tests/fixtures/gh-stub/gh, scripts/tests/plan-cli/gh-stub.test.mjs, plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md | 4 | local | done | Each repaired helper finding has a case that fails when its fix is removed; `node scripts/tests/plan-cli.mjs` passes; Acceptance A1 to A5 hold again |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-cli.mjs` | Exit 0, with the new `archive --pr` cases passing |
| A2 | `bun scripts/ci.mjs --plugin plan-lifecycle` | Exit 0 (the gate that `plugins/plan-lifecycle/skills/AGENTS.md` and root `AGENTS.md` name for a one-plugin change) |
| A3 | `bun scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills` | Exit 0 |
| A4 | `node plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs archive 123 --pr 124` on the branch | Prints `plan #123 finished (closed by https://github.com/DocksDocks/docks/pull/124)` and writes nothing, because finished plan #123 carries no phase label |
| A5 | `grep -rn "archive <n>" plugins/plan-lifecycle/skills` | Every match also names `--pr <pr>` |

## Do not touch

- `reopen` behavior: only its wait constants get the shared name.
- The frozen review-benchmark cases under `.agents/skills/review-benchmark/cases/`.
- `plugins/docks/README.md`: its archive sentence stays true.
- DocksDocks/public: the omp prompt fix is DocksDocks/public#126.

## Open questions

None.

## Verification Results

- Red baseline, step archive_pr: `node scripts/tests/plan-cli.mjs`: 19 failed, 69 passed. All 19 are the new or moved archive cases; the shipped helper answered `invalid option: --pr`, and the missing-`--pr` case failed because the old helper still archived `archive <n>`.
- A1: `node scripts/tests/plan-cli.mjs` on the candidate: 88 tests, 88 passed, 0 failed. The staged spec files were unchanged while `plan.mjs` changed (`git diff -- scripts/tests` printed nothing).
- A2: `bun scripts/ci.mjs --plugin plan-lifecycle`: every check passed except `claude CLI could not run - plan-lifecycle plugin not validated` (`error: command not found: claude` on this workstation). Baseline failure: the same gate on `origin/main` (9995e4a9) in a temporary worktree failed with the same single check. The pull request checks run the plugin validation with the `claude` CLI.
- A3: `bun scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills`: exit 0, after the backfill wrote `productivity/plan-manager` and `productivity/yolo` (`metadata.updated` 2026-11-05).
- A4: `node plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs archive 123 --pr 124` on the branch: `plan #123 finished (closed by https://github.com/DocksDocks/docks/pull/124)`, exit 0; #123 kept state CLOSED, labels `plan`, and 22 comments, so nothing was written.
- A5: `grep -rn "archive <n>" plugins/plan-lifecycle/skills`: every match names `--pr <pr>`.
- `bun run check:js`: exit 0. Each commit (86a86656, 4cdb43ab, d000231e) passed `node scripts/tests/plan-cli.mjs` (88 of 88) and `bun run check:js` in a temporary worktree.
- Red baseline, step review_fixes, review round 1: `node scripts/tests/plan-cli.mjs`: 4 failed, 88 passed. The four are the malformed-row refusal, the body change after the last read, the owner claim after the last read, and the single close comment after a close that failed after its comment. The new coverage cases (open-plan refusals, exact waits, REOPENED-stuck plan, another repository's pull request number, reopen paging) passed against the pre-fix helper, because that behavior was already correct; the round 1 self-review reproduced each gap with a helper mutant that the old suite did not catch.
- After the staged spec, Biome reformatted one line of `scripts/tests/plan-cli/archive-closer.test.mjs` (a line split, no assertion change) so `bun run check:js` passes.
- Review fixes (4102be2b, 513ffe8d): `node scripts/tests/plan-cli.mjs`: 92 of 92 passed; `bun run check:js`: exit 0; `bun scripts/ci.mjs --plugin plan-lifecycle`: the same single baseline failure (`claude` CLI missing) and every other check passed; the content-hash backfill rewrote `productivity/plan-manager`.
- Round 2 and round 3 repairs (6a102860, f09fd112): the second commit reverts the yolo worktree hook check that the first added, and defers that pre-existing gap to #127 (decision 7).
- Acceptance on the reviewed head f09fd112: A1 `node scripts/tests/plan-cli.mjs` 92 of 92 passed; A2 `bun scripts/ci.mjs --plugin plan-lifecycle` passed every check except the same baseline `claude` CLI validation; A3 exit 0; A4 printed `plan #123 finished (closed by https://github.com/DocksDocks/docks/pull/124)` and #123 kept state CLOSED, labels `plan`, and 22 comments; A5 no match without `--pr <pr>`; `bun run check:js` exit 0.

