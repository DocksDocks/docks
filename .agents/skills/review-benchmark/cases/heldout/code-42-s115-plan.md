<!-- plan-contract: v3 -->

## Goal

Make `plan.mjs edit` freeze the execution state of the Steps table once the plan is past `planned`. After that point, `edit` must not change a `Status`, `Effect`, display number, or `Depends` cell, and it must not remove a row. A new row must start `planned` and must come after every existing row. Then a body edit cannot bypass `STEP_TRANSITIONS`, the dependency order, or the `ask` gate for a step whose Effect is not `local`. After work starts, `plan.mjs step` is the only writer of step state.

Mode: plan-and-implement

## Research

- This plan follows plan #40. The guard of #40 refuses only a move from a terminal status to a non-terminal status. `edit` can still write `planned -> done`, `in-flight -> planned`, and other moves that `STEP_TRANSITIONS` forbids. `checkPlan` validates the structure. It does not validate transitions.
- The current status alone is not a sufficient gate. A plan can go `ongoing -> blocked -> ongoing`. Also, `blocked -> planned` and `blocked -> drafting` are legal transitions in `STATUS_TRANSITIONS`. Thus a started plan can return to an editable label. The freeze therefore uses an irreversible started predicate: the record status is not `drafting` or `planned`, or the label event history of the issue shows that `plan:ongoing` was applied at some time.
- Label events are timeline facts that GitHub owns. No later transition or body write can erase them. `edit` reads them with `gh api repos/{owner}/{repo}/issues/{number}/events --paginate --slurp`. The query runs only on the path that is otherwise editable (`drafting` or `planned`). A plan in a later phase is frozen without the extra call.
- A new row with a status other than `planned` is the same bypass, because it creates a step that is already past `planned`. On a started open plan, a new row must carry `planned` and must come after the existing rows. On a closed plan (`finished` and every other closed state), `edit` refuses every new row. After the merge, the only step change is terminal repair with `plan.mjs step`. New work goes into a follow-up plan. Otherwise an appended `planned` row and a later `step ... done` on the finished plan add unreviewed work to a merged record.
- A freeze of `Status` alone is not sufficient. The removal of a non-terminal row fakes completion, because `archive` requires every step terminal. A change of a `Depends` cell changes the execution order. A change of display numbers moves every dependency reference. A change of `Effect` (for example `push -> local`) stops the `ask` that the manager runs before a step whose Effect is not `local`. Past `planned`, the presence, display number, `Depends`, `Effect`, and `Status` of each existing row are frozen. `Task`, `Files`, and `Done when` stay editable as prose.
- Correction routes replace removal and rewrites on a live plan. Retire an obsolete step with `plan.mjs step <issue> <id> skipped`, and append a corrected row that starts `planned`. Appended rows are visible in the record and in the candidate diff.
- While the plan is `drafting` or `planned`, the Steps table stays free to redraft. All statuses are `planned` in practice, and the state machine has not started.
- The terminal repair path of #40 (`step` accepts a terminal target on a `finished` plan) does not change. This plan makes it the only route on such plans.
- Verified consumers: the manager writes `## Verification Results` with `edit` while the plan is `ongoing`. These edits keep every Status cell and must still pass. `scripts/tests/plan-cli.mjs` has #40 assertions (regression refusal, a row addition that keeps terminal cells). Their fixtures must move to the stricter rule.
- The gh stub `scripts/tests/fixtures/gh-stub/gh` has no issue events endpoint. The tests need it, with the same `--paginate --slurp` page shape as the comments endpoint.
- Durable fix: enforce the freeze in `edit` itself. A text rule alone is the temporary option, because it trusts each agent to follow it.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | guard | Replace the terminal-only regression guard in editPlan with an execution-state freeze once work has started: Status, Effect, row presence, display numbers, and Depends are frozen for existing rows; new rows append after every existing row and start planned on open started plans, and closed plans refuse new rows; started means the current status is past planned or plan:ongoing was applied at some time per the label events | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs | - | `local` | `done` | edit refuses any Status or Effect change, row removal, display or Depends rewrite, any new row that is not planned or not appended on a started open plan, and any new row on a closed plan, also after an ongoing-to-blocked-to-planned round trip, with an error that names plan.mjs step |
| 2 | tests | Rework the #40 edit-guard assertions, add bypass coverage, and add the issue events endpoint to the gh stub | scripts/tests/plan-cli.mjs, scripts/tests/fixtures/gh-stub/gh | 1 | `local` | `done` | plan-cli exits 0 with refusal coverage for planned-to-done, in-flight-to-planned, row removal, a Depends rewrite, an Effect downgrade, a row inserted between existing rows, an edit after an ongoing-to-blocked-to-planned round trip, and a row appended to a finished plan, with free drafting-phase edits and passing status-preserving ongoing edits |
| 3 | contract_docs | Sync the contract, the CLI tables, and the mirrored surfaces to the stricter rule, and pin the new clause in the phase-sync test | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, docs/PLAN.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plan-md-template.md, scripts/tests/plan-skill-phases.mjs | 1 | `local` | `done` | plan-skill-phases exits 0 with a new pinned clause for the execution-state freeze on all four surfaces, and every surface states that edit never changes step state once work starts |
| 4 | gate | Refresh the content hashes and run the full repository gate | plugins/plan-lifecycle/skills/, scripts/ | 1, 2, 3 | `local` | `done` | node scripts/ci.mjs exits 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-cli.mjs` | Exit 0, with refusals for planned-to-done, in-flight-to-planned, row removal, a Depends rewrite, an Effect downgrade, an inserted row, an edit after the round trip on a started plan, and a row appended to a finished plan, plus a free Steps redraft while drafting and a status-preserving edit while ongoing |
| A2 | `node scripts/tests/plan-skill-phases.mjs` | Exit 0, with the contract, the SKILL table, docs/PLAN.md, and the template in sync, and the new execution-state freeze clause pinned on all four surfaces |
| A3 | `node scripts/ci.mjs` | Exit 0 |
| A4 | `node plugins/plan-lifecycle/test/selftest.mjs` | Exit 0 |

## Do not touch

- The `setStepStatus` behavior of plan #40 (terminal repair on finished plans). It is reviewed and merged.
- The latest-closure behavior of `archivePullRequestReferences`. Archive depends on it, and it is out of scope.
- `docs/plans/finished/`: frozen history.
- Manifest versions and release tooling. The release is a separate action.

## Open questions

None

## Review

_Review records are stored in issue comments._

## Verification Results

- A1 `node scripts/tests/plan-cli.mjs` exited 0. The run includes refusals for planned-to-done on an ongoing plan, row removal, a Depends rewrite, an Effect downgrade, a row inserted above the existing rows, an edit after `plan:ongoing` label history, and a row appended to a finished plan. It also includes a free Steps redraft while drafting (with blocked-only history) and a status-preserving edit while ongoing. Each refusal exits 1, keeps the body, makes no body-write call, and keeps the provenance sidecar.
- A2 `node scripts/tests/plan-skill-phases.mjs` exited 0. The contract, the SKILL table, docs/PLAN.md, and the template are in sync, and the new clause is pinned on all four surfaces.
- A3 `node scripts/ci.mjs` exited 0: `All ci.mjs checks passed - 2 plugin(s) + repo-wide`.
- A4 `node plugins/plan-lifecycle/test/selftest.mjs` exited 0.
- Advisory disposition: a session advisory asked to treat any `plan:blocked` history as started. This plan declines it. Parking before the start is not started work, and it would freeze legitimate repair redrafts in the `planned` phase. A blocked-only history test pins this boundary.
