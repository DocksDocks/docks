<!-- plan-contract: v3 -->

## Goal

Give the shipped `plan.mjs` two narrow safety fixes observed failing in real runs: (1) a step-repair path for a closed-but-unarchived plan that preserves the original closing event, and (2) an `edit` guard that refuses a body write which would regress a Steps `Status` cell from terminal to non-terminal.

Mode: plan-and-implement

## Research

- Real failure 1 (plan #35): the issue closed via its PR merge while step `hash_gate` was still `in-flight` (a step-mark command aborted earlier in a `&&` chain). `step` requires status `ongoing` (plan.mjs:905) and `archive` requires every step terminal (plan.mjs:1033-1034), a deadlock. The session recovered by reopen + hand-close + a second closing PR, which is exactly the destructive path: `archivePullRequestReferences` (plan.mjs:384-388) deliberately trusts only the LATEST closure event, so the reopen destroyed the PR-closure proof. A session advisory settled the design: never accept a displaced earlier closure; the latest-closure rule is load-bearing (an old merged PR must not authorize a later manual close). The repair must therefore mutate the step cell on the closed issue without touching GitHub state.
- Real failure 2 (plan #39): `edit` re-applied a locally stale draft over a fresh export. The provenance guard (plan.mjs:833-842) compares the sidecar digest against the REMOTE body, so an intervening `export` refreshes the sidecar and a stale FILE passes, silently reverting both Steps `Status` cells from `done` to `planned`. A pre-merge advisory caught the would-be repeat of failure 1.
- Fix 1 shape: relax plan.mjs:905 to also accept `record.status === 'finished'` when the TARGET status is terminal (`done` or `skipped`); every other status keeps the `ongoing` requirement. Body edits on closed GitHub issues are permitted by GitHub and do not create closure events. For this repair, `editIssueBodyIfUnchanged` sends the body with `gh api --method PATCH repos/{owner}/{repo}/issues/<n> -f body=@<body-file>` instead of `gh issue edit --body-file` (plan.mjs:566), so the request carries only the `body` field and no state field; `-f body=@<body-file>` reads the value from the temporary file that `withBodyFile` writes (plan.mjs:547-560). The re-reads before and after the write (plan.mjs:563-564, 576-577) stay. Dependency and transition legality checks (plan.mjs:911-915) stay as-is.
- Fix 2 shape: add an exported `stepStatusRegressions(before, after)` to plan.mjs next to `checkPlan`, and call it in `editPlan` after `checkPlan` (plan.mjs:843). It parses the Steps tables of `issue.body` and `after` (`parseRows` with the same 8-cell contract) and, for every step id present in both, returns each id whose current cell is `done` or `skipped` and whose incoming cell differs and is non-terminal; `editPlan` then fails, naming each step id and instructing re-export. `scripts/tests/plan-cli.mjs` imports the helper for direct cases, the same way `scripts/tests/plan-skill-phases.mjs` imports `machinePathCitations`. Renames/additions/removals of rows stay legal.
- Test surfaces: `scripts/tests/plan-cli.mjs` drives the CLI against `scripts/tests/fixtures/gh-stub/gh` and asserts exit codes and messages; `scripts/tests/plan-skill-phases.mjs` pins contract wording across skills/references/template; `plugins/plan-lifecycle/test/selftest.mjs` checks manifest/contract coherence. New behavior needs plan-cli coverage for both fixes (allowed and refused paths).
- Contract text: `plan-manager/references/plan-contract.md` (Issue writes section) and the `step` and `edit` rows of the CLI table in `plan-manager/SKILL.md` describe the current `ongoing`-only rule; both must state the narrow finished-plan repair and the regression refusal. `docs/PLAN.md` and the workspace template only say that `step` checks the plan state and dependencies and leave the closed-plan rule to the contract, so neither file changes and the phase tests keep them byte-identical.
- plan-lifecycle is self-versioned; a release/version bump is a separate action outside this plan.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | step_repair | Accept `step <issue> <id> <done or skipped>` on a `finished` plan; all other statuses keep requiring `ongoing`; never touch GitHub state or reopen | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs | - | `local` | `planned` | Repairing a terminal step on a closed COMPLETED issue succeeds and `archive` then verifies against the ORIGINAL closing PR; non-terminal targets on finished plans still fail |
| 2 | edit_guard | Refuse `edit` bodies that regress any matching step id from `done` or `skipped` to a different non-terminal status, naming the step and instructing re-export | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs | - | `local` | `planned` | A stale draft reverting a done step fails loudly; legitimate row additions, removals, and renames still pass |
| 3 | tests | Cover both fixes in the CLI suite: finished-plan terminal repair passes, finished-plan non-terminal mutation fails, regression edit fails, non-regressing edit passes | scripts/tests/plan-cli.mjs, scripts/tests/fixtures/gh-stub/gh | 1,2 | `local` | `planned` | `node scripts/tests/plan-cli.mjs` exit 0 with the new assertions |
| 4 | contract_docs | State the finished-plan step repair and the edit regression refusal in the contract and the CLI table | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md | 1,2 | `local` | `planned` | `node scripts/tests/plan-skill-phases.mjs` exit 0; contract and CLI table name both behaviors |
| 5 | gate | Run the plugin gate on the final tree | plugins/plan-lifecycle/ | 1,2,3,4 | `local` | `planned` | `node scripts/ci.mjs --plugin plan-lifecycle` exit 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-cli.mjs` | Exit 0 including finished-plan repair and regression-guard assertions |
| A2 | `node scripts/tests/plan-skill-phases.mjs` | Exit 0 |
| A3 | `node plugins/plan-lifecycle/test/selftest.mjs` | Exit 0 |
| A4 | `node scripts/ci.mjs --plugin plan-lifecycle` | Exit 0 |

## Do not touch

- `archivePullRequestReferences` latest-closure semantics (plan.mjs:349-393) - the displaced-closure rejection is load-bearing and stays.
- `docs/plans/finished/` - frozen history.
- Manifest versions and release tooling - release is a separate action.

## Open questions

None

## Review

_No review yet._

## Verification Results

_Not implemented yet._
