<!-- plan-contract: v3 -->

## Goal

Consolidate the separately reviewed #18 convergence change and the repaired #19 landing change into one complete default-branch candidate, secure its CI and head-SHA merge boundary, and prepare the closing pull request.

Mode: plan-and-implement

## Research

- Issue #18 established the bounded review verdict contract. Commit `4b11871`
  implements its separately reviewed changes and remains the first commit in
  this branch.
- Issue #19 established routine plan publication and landing: commit and push
  the reviewed branch, open the closing pull request, wait for its checks
  policy, and ask only immediately before merge. Its three code-review rounds
  exposed the net-diff, no-checks, and head-SHA requirements now in this plan.
- Repository inspection found the same lifecycle boundary in the root guidance,
  shipped documentation, reviewer wrappers, manager and workspace skills,
  reference contracts, executor handoff, and orchestration tests. These files
  must change together to avoid a second convention. The Codex code-reviewer
  template that workspace setup uses to seed the live wrapper
  (`plan-workspace/references/codex-agent-templates.md`) carries the same
  verdict block, so it changes and is pinned with the live wrappers.
- GitHub documents that `Closes #N` links a pull request and closes the issue
  only after the pull request merges:
  https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue
- One pull request lands #18 and #20 together. GitHub applies one closing
  keyword to each issue number of a comma list (same page), so the description
  line `Closes #18, #20` closes both plans when the pull request merges. Issue
  #19 is already closed and gets a plain reference.
- The GitHub CLI documents pull-request creation, check watching, and
  head-matched merge:
  https://cli.github.com/manual/gh_pr_create
  https://cli.github.com/manual/gh_pr_checks
  https://cli.github.com/manual/gh_pr_merge
- Exit status of `gh pr checks` (manual page above): 0 when every check passed,
  8 when a check failed, and 1 for a usage or API error. The bounded check
  discovery treats exit 8 as a failed check that blocks the merge, and it
  retries exit 1 at most three times before it reports a no-checks blocker.
- Durable fix chosen: one contract for review convergence and landing, changed
  in every mirror and pinned by tests in one cutover. Rejected temporary fix:
  land #18 alone and leave the #19 landing text for a later pull request.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | combined_contract | Consolidate bounded review and reviewed pull-request landing | `.codex/agents/code-reviewer.toml`, `AGENTS.md`, `README.md`, `docs/PLAN.md`, `plugins/docks/README.md`, `plugins/docks/skills/engineering/refactor/references/executor-dispatch.md`, `plugins/plan-lifecycle/agents/code-reviewer.md`, `plugins/plan-lifecycle/skills/AGENTS.md`, `plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md`, `plugins/plan-lifecycle/skills/productivity/plan-manager/references/github-issue-publication.md`, `plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md`, `plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md`, `plugins/plan-lifecycle/skills/productivity/plan-workspace/references/codex-agent-templates.md`, `plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plan-md-template.md` | — | `local` | `planned` | One contract covers advisory-only passes, one repair re-review, routine issue and pull-request publication, a merge-base net candidate, bounded check discovery with the `gh pr checks` exit-status rule above, fresh head-SHA and diff validation, and a merge-only prompt. |
| 2 | regression_contract | Pin every changed lifecycle boundary | `plugins/plan-lifecycle/skills/productivity/plan-workspace/references/codex-agent-templates.md`, `scripts/tests/plan-cli.mjs`, `scripts/tests/plan-skill-phases.mjs` | 1 | `local` | `planned` | The plan CLI and bounded workflow suites fail if any verdict, publication, review-scope, checks, or merge boundary regresses, including the seeded Codex template's verdict block. |
| 3 | hashes_and_gate | Refresh owned skill hashes and run the repository gate | `plugins/docks/skills/engineering/refactor/SKILL.md`, `plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md`, `plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md` | 1 | `local` | `planned` | Content hashes match the final skill bytes and the full repository gate passes. |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| lifecycle-phases | `node scripts/tests/plan-skill-phases.mjs` | Prints `three-skill, two-wrapper v3 plan workflows passed`. |
| landing-pr | `grep -c 'Closes #<issue>' plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md` | At least 1: the contract tells the manager to open the closing pull request after `Code-review: pass`. |
| repository-gate | `node scripts/ci.mjs` | Exits zero and prints `All ci.mjs checks passed`. |

## Do not touch

- Do not change `plan.mjs` archive behavior or its merged-pull-request verifier.
- Do not change plugin versions, marketplace versions, release tooling, or the
  main checkout.

## Open questions

None

## Review

_No review yet._

## Verification Results

_Not implemented yet._
