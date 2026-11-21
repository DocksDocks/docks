<!-- plan-contract: v4 -->

## Goal

Close two gaps in the plan-lifecycle 0.13.0 yolo release. (1) The contract's Linked branch section says to set up the branch after the plan is ongoing, but Yolo runs sets it up right after `new`, and the Yolo runs override table has no row for that timing, while its intro keeps all other rules in force. (2) The yolo skill's Recover after compaction step reads `closedByPullRequestsReferences`, which carries no branch name, so a resumed run has no command that yields the branch. Make the timing override explicit in both places and give recovery a command that returns the head branch. Ship as a plan-lifecycle patch release.

Mode: plan-and-implement

## Research

- `plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md`, Linked branch: the intro reads `Set up the linked branch after the plan is ongoing and before any code change:`. Item 2 carries the only yolo pointer, `A yolo run uses the worktree rule in Yolo runs instead.` The Yolo runs table names the dirty-checkout override but no timing override, and the section intro says `All other contract rules stay in force.` Decision: move the item 2 pointer to the intro line as `A yolo run uses the timing and worktree rules in Yolo runs instead.`, and add the table row `| Linked-branch timing | Right after \`new\`, while the plan is drafting |`. The row then carries the timing, so the `### Linked branch timing` subsection, which only repeats it, goes. One pointer covers both overrides, so item 2 returns to its pre-yolo text.
- `plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md`, Recover after compaction: it runs `gh issue view <n> --repo <owner/repo> --json closedByPullRequestsReferences` and says `read the pull request head`. That field lists only the open pull requests whose head is the issue's linked branch, and returns id, number, repository, and url for each, with no branch name (observed on DocksDocks/yolo-smoke#1). Decision: read the pull request number from that field, then run `gh pr view <pr> --repo <owner/repo> --json headRefName`. Proof on the scratch repository: the first command printed `2`; `gh pr view 2 --repo DocksDocks/yolo-smoke --json headRefName -q .headRefName` printed `1-add-greetmjs-command-line-greeting-script`, the branch the yolo run created with `gh issue develop`.
- GitHub drops an issue's linked branch from `gh issue develop --list` and GraphQL `linkedBranches` once a pull request from it exists (DocksDocks/yolo-smoke#1 and DocksDocks/docks#72 both list nothing). The recovery fallback is therefore required, not optional.
- plan-manager phase 5 (`Set up the linked branch with the contract's Linked branch steps`) needs no edit: item 3 reuses the branch that yolo created during drafting.
- Content hash: `node scripts/skills/content-hash.mjs --backfill plugins/plan-lifecycle/skills`. Gate: the change is owned by `plan-lifecycle` alone, so `node scripts/ci.mjs --plugin plan-lifecycle` is authoritative (root `AGENTS.md`, Tool-agnostic rules), with the lockfile-pinned Claude Code CLI on `PATH` as CI uses it.
- Engineering standards: prose fix; `code-clarity` for wording. No permanent test, because no test pins skill prose (`plugins/plan-lifecycle/skills/AGENTS.md`).

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | contract_timing | Move the yolo pointer from Linked branch item 2 to the intro line, naming timing and worktree; add the Linked-branch timing row to the Yolo runs table in place of the Linked branch timing subsection | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md | - | local | planned | The intro line names both overrides; the table has the timing row |
| 2 | yolo_recovery | Recovery reads the pull request number from `closedByPullRequestsReferences`, then the branch from `gh pr view <pr> --json headRefName` | plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md | - | local | planned | The section names both commands |
| 3 | gate | Backfill content hashes; run the plugin gate | plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md | 1, 2 | local | planned | `node scripts/ci.mjs --plugin plan-lifecycle` exits 0 |
| 4 | release_patch | After the landing merge: `node scripts/release.mjs --plugin plan-lifecycle patch`. On a red tag CI the script reverts its bump commit and deletes the tag, so the same command reruns after the fix | plugins/plan-lifecycle | 3 | release | planned | Tag `plan-lifecycle--v0.13.1` exists with green tag CI |
| 5 | sync_omp | After the release: from the DocksDocks/public checkout, `./docks-kit sync omp` | - | 4 | deploy | planned | The installed plugin cache holds `plan-lifecycle` 0.13.1 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills` | Exit 0 |
| A2 | `node scripts/ci.mjs --plugin plan-lifecycle` | Exit 0 |
| A3 | `grep -n 'timing and worktree rules in Yolo runs' plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md` | One line, in Linked branch |
| A4 | `grep -n 'headRefName' plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md` | One line, in Recover after compaction |

## Do not touch

- `plan.mjs` behavior.
- The yolo Run order, effect table, and round ceiling.

## Open questions

## Verification Results
