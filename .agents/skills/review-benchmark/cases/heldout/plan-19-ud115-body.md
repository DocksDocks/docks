<!-- plan-contract: v3 -->

## Goal

Make a `plan-and-implement` run land its own work. The manager commits the work on a plan branch. After code review passes, it pushes the reviewed branch, creates or updates the pull request that closes the plan issue, waits for CI, and asks the user before every merge into the default branch. Today a passed plan stops with no pull request. The user must then run the branch, commit, push, pull request, and merge by hand, so a passed plan is not ready to merge.

User request (in session, 2026-08-21): "make plan-and-implement commit and push its reviewed branch, create or update the linked pull request, wait for CI, and always ask before merging into the default branch".

Scope: the plan-lifecycle manager skill and its two references, the workspace standard and its template, the root `## Plans` section and its generated copy, the lifecycle authoring node, both READMEs, the refactor executor handoff, and the phase test. Direct implementation and `plan-only` runs do not change.

Mode: plan-and-implement

## Research

Hypothesis: the lifecycle stops after code review because the manager, the contract, the workspace standard, the root guide, and both READMEs state zero commits and user-run landing. The facts below confirm it.

### Repository facts

- `plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md:150-152` ends a passing review with "ready for the user's landing actions" and archives only after the user lands the closing pull request. Lines 228-231 make the branch, commits, push, pull request, and merge "the user's to run". Lines 238-241 (`## Git boundary`) say "This lifecycle creates zero commits and never pushes."
- The same file builds the code-review diff only from dirty paths: `git status --porcelain`, `git diff`, `git diff --cached`, and one `git diff --no-index /dev/null <path>` hunk for each untracked path (lines 128-136). A commit on the branch is outside that diff.
- The same file lets the manager fix `MEDIUM` and `LOW` findings "at your judgment" and re-review "only after fixing a `CRITICAL` or `HIGH`" (lines 144-146). Phase 5 runs every Acceptance command before code review (lines 124-126).
- `plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md:248-257` holds the same landing rule, and lines 313-318 list "no automatic commit, no automatic push". Lines 136-138 require every Steps row to be terminal before the pull request with `Closes #<issue>` merges. Lines 266-292 make `archive` accept only a merged pull request into the default branch that closed the issue, read from `closedByPullRequestsReferences`. Lines 303-307 require an in-session `ask` before a Steps row with a non-`local` Effect runs. Landing has no Steps row (`plan-manager/SKILL.md:230`).
- `plugins/plan-lifecycle/skills/productivity/plan-manager/references/github-issue-publication.md:10-11` resolves the repository and its default branch with `gh repo view --json nameWithOwner,visibility,defaultBranchRef`. Lines 23-26 say that the user runs landing on request.
- `docs/PLAN.md` repeats the rule at line 303 (phase 6 reviews again only after a critical or high fix), lines 305-308 (dirty-path review diff), line 318, and lines 329-333. `plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plan-md-template.md` carries the same text four lines lower (307, 309-312, 322, 333-337). `scripts/tests/plan-skill-phases.mjs:371-387` requires `docs/PLAN.md` to equal the template's terminal fence byte for byte.
- `AGENTS.md:104-105` says "This lifecycle creates zero commits and never pushes. Commit when the user asks". `AGENTS.md:71-124` equals the generated root `## Plans` section in `plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md:198-251` (the sentence is at 231-232). Line 99 of that skill makes this section a current marker for workspace classification.
- `README.md:92-93` says "The lifecycle creates zero automatic commits and never pushes." `plugins/docks/README.md:64-65` says that the six phases run "with zero automatic commits".
- `plugins/docks/skills/engineering/refactor/references/executor-dispatch.md:91` tells `plan-manager` to archive as soon as the code review returns `Code-review: pass`. Lines 103-105 say "This lifecycle creates zero commits and never pushes, merges, or applies directly to the main working tree."
- `plugins/plan-lifecycle/skills/AGENTS.md:57-77` lists "the zero-commit rule" (line 63) in the synchronized surface and names each copy to update with it, including `scripts/tests/plan-skill-phases.mjs`.
- `scripts/tests/plan-skill-phases.mjs:60-64` pins "This lifecycle creates zero commits and never pushes." in the manager skill, `docs/PLAN.md`, and the template, and lines 339-340 assert it again for the manager. Lines 70-74 pin the dirty-path review-diff sentence. Lines 171-183 require each pinned clause exactly once in each file and fail when it is removed. Lines 262 and 265 cap each skill body at 310 lines and the three bodies at 700 lines. Today they have 246, 82, and 290 lines (618 in total, counted as the test counts).
- `scripts/tests/plan-cli.mjs`, `plugins/plan-lifecycle/test/selftest.mjs`, `plugins/plan-lifecycle/agents/*.md`, and `.codex/agents/*.toml` hold no commit, push, or landing rule. A grep for "zero commits" and "never pushes" finds nothing in them.
- Instruction files for the changed paths: `plugins/plan-lifecycle/skills/AGENTS.md:25-33` and `plugins/docks/skills/AGENTS.md:9-11` require a content-hash backfill after a skill's meaning changes, and `scripts/ci.mjs:520-522` checks it for each plugin. `plugins/plan-lifecycle/skills/AGENTS.md:35-42` and `plugins/docks/skills/AGENTS.md:13-15` forbid author-script steps in shipped skill text. `plugins/plan-lifecycle/skills/AGENTS.md:90-93` sets the productivity score floor at 8. `AGENTS.md:143` requires the full `node scripts/ci.mjs` gate for a change that spans plugins, and the gate runs both phase cases and the CLI test (`scripts/ci.mjs:374-383`).

### External sources

- GitHub reads a closing keyword such as `Closes #<issue>` in the pull request description, and only when the pull request targets the default branch: https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue
- `gh pr create` takes `--base`, `--head`, `--title`, and `--body-file`. `--head` skips its own push and fork prompts: https://cli.github.com/manual/gh_pr_create
- `gh pr list --head <branch> --state open --json number` finds the open pull request of a branch: https://cli.github.com/manual/gh_pr_list
- `gh pr edit <pr> --body-file <file>` replaces the body: https://cli.github.com/manual/gh_pr_edit
- `gh pr view --json` exposes `headRefOid`, `baseRefName`, `statusCheckRollup`, and `state`: https://cli.github.com/manual/gh_pr_view
- `gh pr checks` has `--watch` ("Watch checks until they finish") and `--required` ("Only show checks that are required"). Its JSON field `bucket` takes the values `pass`, `fail`, `pending`, `skipping`, and `cancel`. Exit code 8 means that checks are pending: https://cli.github.com/manual/gh_pr_checks
- `gh pr merge` has `--match-head-commit <SHA>` ("Commit SHA that the pull request head must match to allow merge"), the method flags `--merge`, `--squash`, and `--rebase`, and the flags `--auto`, `--admin`, and `--delete-branch`. On a branch that requires a merge queue, it adds the pull request to the queue: https://cli.github.com/manual/gh_pr_merge
- `gh repo view --json` exposes `defaultBranchRef`, `mergeCommitAllowed`, `squashMergeAllowed`, and `rebaseMergeAllowed`: https://cli.github.com/manual/gh_repo_view
- A skipped job reports success. When the base branch requires status checks, they must pass before the pull request can merge: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks
- `git push` refuses a non-fast-forward update unless the user forces it: https://git-scm.com/docs/git-push

### Tools

The Acceptance commands run on Node 24, the version that `.github/workflows/ci.yml` sets (`node-version: '24'`) and `AGENTS.md:15` names, and on GNU `grep`. The skill text that this plan writes names `git` and `gh` commands. Their flags come from the current manual pages above.

### Landing design

The contract's `## Landing` section holds this procedure once. The manager skill, the issue-publication reference, the workspace standard, and the guides link to it or summarize it. The settled `plan-and-implement` mode authorizes the commits, the push, and the pull request of this procedure for that plan. Landing stays outside the Steps table. Only the merge asks again.

1. Branch. At the start of phase 5, run `git status --porcelain`. Continue only when it prints nothing. Otherwise set the plan `blocked` with the dirty paths. Never stash, move, or commit work that the plan did not make. Run `git fetch <remote> <default>`, where `<remote>` is the git remote of the repository that the preflight resolved. Switch to the branch `plan-<issue>` when it exists. Otherwise create it with `git switch -c plan-<issue> <remote>/<default>`.
2. Commit. Commit the candidate on `plan-<issue>` before each code-review round, after the Acceptance commands and the repository's own pre-commit checks pass, under `docks:commit-discipline` (Request corrections, entry 1).
3. Review diff. Run `git fetch <remote> <default>`. Write `git diff $(git merge-base <remote>/<default> HEAD) HEAD` to the round's diff file. Dispatch the round with that diff and the `HEAD` SHA, which is the round's reviewed head. Name each changed path that no Steps `Files` cell mentions.
4. Reviewed head. A `Code-review: pass` covers only its reviewed head. A change after a pass, also a fix for a `MEDIUM` or `LOW` finding, is a new commit after a new Acceptance run, and it gets a new code-review round before the push. A finding that the manager leaves open goes into the pull request body under Open findings. Record the reviewed head SHA in `## Verification Results`.
5. Push. Run `git push -u <remote> plan-<issue>`. When git refuses a non-fast-forward update, stop and report. Never force-push.
6. Pull request. Write the body to a file in the review scratch directory. Put `Closes #<issue>` on its own line. Use repository-relative paths and no secrets. When `gh pr list --repo <owner/repo> --head plan-<issue> --state open --json number` returns a pull request, run `gh pr edit <pr> --repo <owner/repo> --body-file <file>`. Otherwise run `gh pr create --repo <owner/repo> --base <default> --head plan-<issue> --title <title> --body-file <file>`.
7. Head check. `gh pr view <pr> --repo <owner/repo> --json headRefOid,baseRefName` must show the reviewed head and the default branch. Otherwise stop and report.
8. Checks. Wait for CI as Request corrections, entry 2 says. A failed or cancelled check blocks the merge question until its fix passes a new code-review round, a new push, and a new wait.
9. Merge question. When every Steps row is terminal, ask afresh with `ask`. The options are `Merge now` and `Leave pull request open`. The question names the pull request URL, the default branch, the reviewed head, and the check result. A prior answer never authorizes a merge. When `ask` is unavailable, or the answer is not `Merge now`, leave the pull request and the issue open and report both links.
10. Merge. Read `headRefOid` again. Run `gh pr merge <pr> --repo <owner/repo> --match-head-commit <reviewed-head>` with the first method flag that the repository allows, in the order `--merge`, `--squash`, `--rebase`, read from `gh repo view --json mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed`, and with the flag of User choices, entry 2. Never pass `--auto` or `--admin`. When the merge command fails, leave the pull request open and report the error. When a merge queue takes the pull request, report it and wait until `gh pr view <pr> --json state` reads `MERGED`.
11. Archive. Run `plan.mjs archive <issue>` after GitHub closes the issue.

### Request corrections

- Request correction. Asked: "commit and push its reviewed branch". Did: the manager commits the candidate on `plan-<issue>` before each code-review round, after the Acceptance commands pass, and reviews the committed range from the merge base with the default branch to `HEAD`. It pushes only the head that the last `Code-review: pass` reviewed. Reason: a commit gives each round one fixed head SHA. The current diff covers only dirty paths (`plan-manager/SKILL.md:128-136`), so earlier commits on a reused branch would land without review. The manager also fixes `MEDIUM` and `LOW` findings without a new round (`plan-manager/SKILL.md:144-146`), so a commit made after the review could carry bytes that no reviewer read. `gh pr merge --match-head-commit <SHA>` refuses a merge when the pull request head differs from that SHA (gh pr merge manual). The commit stays local until the pass. It follows the Acceptance commands and the repository's own pre-commit checks, such as the gate that `AGENTS.md:142-143` asks for before a commit in this repository.
- Request correction. Asked: "wait for CI". Did: after the pull request exists, the manager waits up to five minutes for the first check in `gh pr view <pr> --json statusCheckRollup`. It then runs `gh pr checks <pr> --watch` over every reported check, not only the required ones, and reads the `bucket` of each check with `gh pr checks <pr> --json name,bucket`. The merge question needs `pass` or `skipping` for each check. A check that is still pending after 60 minutes ends the wait, and the manager leaves the pull request open and reports it. When no check appears within five minutes, the merge question says that no CI ran and cites the passing Acceptance results. Reason: `plan-lifecycle` ships to other repositories (`AGENTS.md:26`, `plan-manager/SKILL.md:165`). Such a repository can have no workflow, a workflow that a path filter skips, or no required check. `gh pr checks --required` shows only required checks (gh pr checks manual), and a skipped job reports success (GitHub status checks page). A wait without an end would never reach the merge question that the request asks for.

### User choices

- The user chose to keep `plan.mjs` and `scripts/tests/plan-cli.mjs` unchanged. The manager runs the landing commands with `git` and `gh` from the skill text, and no helper command enforces their order. The user wants the shipped helper to stay stable in this change. `archive` already accepts only a merged pull request into the default branch whose closing keyword closed the issue (`plan-contract.md:266-292`), and GitHub refuses a merge whose head differs from `--match-head-commit`.
- The user chose to merge with `--delete-branch`, so that no merged `plan-<issue>` branch stays on the remote or in the checkout. The merge question keeps its two options and does not list the deletion, because the user wants one short question for each plan.

Durable fix: move commit, push, pull request, check wait, and merge question into the lifecycle contract and every copy of it, and pin each copy in the phase test; the rejected temporary fix is a closing reminder that asks the user to commit, push, and open the pull request, which leaves a passed plan without a pull request.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | manager_landing | Write the Landing design, the request corrections, and the user choices into `## Landing` of `plan-contract.md`, and replace "no automatic commit, no automatic push" in its `## What the lifecycle never does`. In the manager skill, add design item 1 to phase 5, replace the phase 6 diff text and lines 144-146 with design items 2 to 4, replace lines 150-152 and lines 228-231 with a short summary that links the contract, and remove `## Git boundary`. Replace lines 23-26 of `github-issue-publication.md` with the same summary | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/references/github-issue-publication.md | — | `local` | `planned` | The contract `## Landing` states design items 1 to 11, and a grep for "zero commits", "user's to run", "user's landing actions", and "user runs it on request" in the three files prints nothing |
| 2 | contract_copies | Carry the same rules into every copy. In `docs/PLAN.md` and the template, change phase 6, the review-diff paragraph, the zero-commit line, and `## Landing`, and keep both byte-identical. Change the root `## Plans` section and its generated copy in the workspace skill, and keep both identical. Make line 63 of `plugins/plan-lifecycle/skills/AGENTS.md` name the landing rule instead of the zero-commit rule. Replace the lifecycle sentences of both READMEs. In `executor-dispatch.md`, make line 91 hand the approved diff to `plan-manager`, which commits it, runs code review, and lands it as the contract says, and archive only after the approved merge. Make lines 103-105 keep only the executor's own rule: no commit, no push, no merge, and no direct apply to the main working tree | docs/PLAN.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plan-md-template.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md, AGENTS.md, plugins/plan-lifecycle/skills/AGENTS.md, README.md, plugins/docks/README.md, plugins/docks/skills/engineering/refactor/references/executor-dispatch.md | 1 | `local` | `planned` | `node scripts/tests/plan-skill-phases.mjs --case plan-workspace-template` exits 0, and the root `## Plans` section equals its generated copy |
| 3 | test_pins | Replace the `zero-commits` pin and the dirty-path `review-scope-guard` pin with clauses for the new landing rule and the merge-base review diff, in each file that states them: the manager skill, the contract, `docs/PLAN.md`, the template, the workspace skill, `AGENTS.md`, `plugins/plan-lifecycle/skills/AGENTS.md`, both READMEs, and `executor-dispatch.md`. Update the manager assertion at lines 339-340. Add a guard with fixed strings that fails when a retired sentence returns to any of these files | scripts/tests/plan-skill-phases.mjs | 2 | `local` | `planned` | `node scripts/tests/plan-skill-phases.mjs --case bounded-workflows` exits 0, and its mutation loop fails when any new clause is removed from any one pinned file |
| 4 | hash_backfill | Run `node scripts/skills/content-hash.mjs --backfill plugins/plan-lifecycle/skills` and `node scripts/skills/content-hash.mjs --backfill`, then run the full gate | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md, plugins/docks/skills/engineering/refactor/SKILL.md | 3 | `local` | `planned` | `node scripts/ci.mjs` exits 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-skill-phases.mjs --case bounded-workflows` | Exit 0 |
| A2 | `node scripts/tests/plan-skill-phases.mjs --case plan-workspace-template` | Exit 0; `docs/PLAN.md` equals the template fence |
| A3 | `node scripts/tests/plan-cli.mjs` | Exit 0; `archive` still verifies the merged closing pull request |
| A4 | `node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills` | Exit 0 (`plugins/plan-lifecycle/skills/AGENTS.md:25-33`) |
| A5 | `node tests/idempotency.mjs` | Exit 0; every docks skill hash, also the one of `refactor`, is in sync (`plugins/docks/skills/AGENTS.md:9-11`) |
| A6 | `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file plugins/plan-lifecycle/skills` | Each `productivity/plan-*` line scores 8 or more |
| A7 | `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file plugins/docks/skills` | The `engineering/refactor` line scores 10 or more |
| A8 | `node scripts/skills/no-author-scripts.mjs plugins/plan-lifecycle/skills plugins/plan-lifecycle/agents` | Exit 0 |
| A9 | `node scripts/skills/no-author-scripts.mjs` | Exit 0 for the docks skills, also the refactor reference |
| A10 | `node scripts/skills/durable-anchors.mjs` | Exit 0; no changed skill text or `AGENTS.md` node carries a live `path:NN` anchor |
| A11 | `node scripts/ci.mjs` | Exit 0 (`AGENTS.md:143`: the full gate for a change that spans plugins) |
| A12 | `grep -rn -e 'zero commits' -e 'zero automatic commits' -e 'never pushes' -e "user's to run" -e "user's landing actions" -e 'user runs it on request' AGENTS.md README.md docs/PLAN.md plugins/plan-lifecycle/skills plugins/docks/README.md plugins/docks/skills/engineering/refactor` | Prints nothing and exits 1; today it prints 18 lines |
| A13 | `grep -c -e 'git push -u' plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md` | Prints 1 or more: the manager pushes the reviewed branch; today it prints 0 |
| A14 | `grep -c 'Closes #<issue>' plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md` | Prints 1 or more: the manager creates the landing pull request, or updates the open one, with `Closes #<issue>` in its body |
| A15 | `grep -c -e 'gh pr checks' plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md` | Prints 1 or more: the manager waits for CI; today it prints 0 |
| A16 | `grep -c -e '--match-head-commit' plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md` | Prints 1 or more: the merge accepts only the reviewed head; today it prints 0 |
| A17 | `grep -c -e 'Leave pull request open' plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md` | Prints 1 or more: the manager asks before each merge; today it prints 0 |

## Do not touch

- `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs` and `scripts/tests/plan-cli.mjs` (User choices, entry 1).
- The issue-creation preflight in `github-issue-publication.md:1-21`.
- The reviewer wrappers in `plugins/plan-lifecycle/agents/` and `.codex/agents/`.
- Direct implementation and `plan-only` runs: they make no commit and no pull request.
- `--auto`, `--admin`, force-push, and any history rewrite.
- Plugin manifests, versions, and marketplace catalogs. The release runs after the merge as its own request (`scripts/AGENTS.md:170-171`).
- `docs/plans/finished/` and the point-in-time records under `docs/` (`docs/AGENTS.md`).

## Open questions

None

## Review

_No review yet._

## Verification Results

_Not implemented yet._
