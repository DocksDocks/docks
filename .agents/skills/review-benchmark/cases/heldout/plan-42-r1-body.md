<!-- plan-contract: v3 -->

## Goal

Make `edit` reject every Steps `Status`-cell change once the plan is past `planned`, so `STEP_TRANSITIONS` and dependency ordering cannot be bypassed by body edits; `plan.mjs step` becomes the only writer of step state after work starts.

Mode: plan-and-implement

## Research

- Advisory-directed follow-up to plan #40. The #40 guard refuses only terminal-to-non-terminal regressions; `edit` can still write `planned -> done`, `in-flight -> planned`, or any other move `STEP_TRANSITIONS` forbids, because `checkPlan` validates structure, never transitions.
- Guarding only `ongoing` and `finished` (the advisory's literal pair) leaves a loophole: `ongoing -> blocked -> ongoing` is a legal label round-trip, so an agent could park the plan `blocked`, edit statuses, and resume. The guard therefore keys on the record status NOT being `drafting` or `planned` - covering `ongoing`, `blocked`, `finished`, and every other derived state.
- A new Steps row born with a non-`planned` status on a started plan is the same bypass (a step can be conjured pre-`done`), so past `planned` a new row must carry `planned`.
- While `drafting` or `planned`, Steps tables are freely redrafted - statuses are all `planned` in practice and the state machine has not started; the guard must not constrain those phases.
- The #40 terminal-repair path (`step` accepts terminal targets on a `finished` plan) stays the sanctioned repair route and is unaffected; this change makes it the ONLY route on such plans.
- Verified consumers: the manager writes `## Review` and `## Verification Results` via `edit` while `ongoing` - those edits leave Status cells unchanged and must keep passing. `scripts/tests/plan-cli.mjs` has #40 assertions (regression refusal, terminal-preserving row addition) whose fixtures must be re-based on the stricter rule.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | guard | Replace the terminal-only regression guard in editPlan with a full status-cell freeze past planned, including planned-only new rows | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs | - | `local` | `planned` | edit refuses any Status change and any non-planned new row once record status is not drafting or planned, with an error naming plan.mjs step |
| 2 | tests | Rework the #40 edit-guard assertions and add bypass coverage | scripts/tests/plan-cli.mjs | 1 | `local` | `planned` | plan-cli exit 0 with refusal coverage for planned-to-done and in-flight-to-planned on an ongoing plan, drafting-phase edits still free, and status-preserving ongoing edits still passing |
| 3 | contract_docs | Sync the contract, CLI table, and mirrored surfaces to the stricter rule | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, docs/PLAN.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plan-md-template.md | 1 | `local` | `planned` | plan-skill-phases exit 0 and every surface states edit never changes a Status cell once work starts |
| 4 | gate | Re-sync content hashes and run the full repo gate | plugins/plan-lifecycle/skills/, scripts/ | 1, 2, 3 | `local` | `planned` | node scripts/ci.mjs exit 0 (diff touches repo-lane scripts/tests) |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-cli.mjs` | Exit 0 including refusals for planned-to-done and in-flight-to-planned via edit on an ongoing plan, a free Steps redraft while drafting, and a status-preserving edit while ongoing |
| A2 | `node scripts/tests/plan-skill-phases.mjs` | Exit 0 with contract, SKILL table, docs/PLAN.md, and template synchronized |
| A3 | `node scripts/ci.mjs` | Exit 0 (full gate; repo-lane files change) |
| A4 | `node plugins/plan-lifecycle/test/selftest.mjs` | Exit 0 |

## Do not touch

- `setStepStatus` semantics from plan #40 (terminal repair on finished plans) - already reviewed and landed.
- `archivePullRequestReferences` latest-closure semantics - load-bearing, out of scope.
- `docs/plans/finished/` - frozen history.
- Manifest versions and release tooling - release is a separate action.

## Open questions

None

## Review

_No review yet._

## Verification Results

_Not implemented yet._
