<!-- plan-contract: v4 -->

## Goal

Reduce the number of `gh` invocations that each `plan.mjs` command makes, without weakening its safety checks. Real plan commands make fewer network round trips, and the `plan-cli` contract test and the CI gate get shorter. Also fix two defects that the research found:

1. `archive` fetches the filtered closing references (`excludeUserLinked: true`) but never checks them.
2. `new` runs `gh label create --force` without a color for all five plan labels, so every `new` gives the existing labels a random new color.

User decision (in session, 2026-09-24): reduce GitHub calls in `plan.mjs` (chosen over a test-only parallelization).

Mode: plan-and-implement

## Research

Measured baseline (PATH wrapper that logs argv around `scripts/tests/fixtures/gh-stub/gh`, 2026-09-24): `node scripts/tests/plan-cli.mjs` passes in about 18 s. It makes 121 CLI launches (new 32, export 31, edit 31, status 11, step 6, archive 6, show 4) and 624 gh launches. The test is the `plan orchestration` phase of `node scripts/ci.mjs` (17.5 s of 30.6 s local).

Calls per command today, in `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs`. Symbols: R = `resolveRepository` (`gh repo view`); I = `issueView` from `readPlanIssue`; U = `resolveActingLogin` (`gh api user`); H = `planWorkStarted` (REST issue events, paginated); C = `issueComments` (REST comments, paginated); P = `archivePullRequestReferences` (GraphQL); A = `associatedPullRequests` (GraphQL); B = the read before a write in `editIssueBodyIfUnchanged` or the label-write function; W = `gh issue edit`; V and VL = the reads after a body or label write.

| Command | Calls today | Count |
|---|---|---|
| new | R, U, 5 × `gh label create --force`, `gh issue create` | 8 |
| show | R, I, C | 3 |
| export | R, I | 2 |
| edit (not started) | R, I, U, H, B, W, V | 7 |
| status (not started) | R, I, U, H, B, W, V | 7 |
| step | R, I, U, B, W, V | 6 |
| list | R, `gh issue list` | 2 |
| archive (PR closer) | R, I, U, C, P, B, W, VL | 8 |
| archive (commit closer) | R, I, U, C, P, A, B, W, VL | 9 |
| retire | R, I, U, B, W, VL, `gh issue close` | 7 |

Findings:

- R, I, U, H, C, P, and A are independent reads of data that one GraphQL query can return: `viewer { login }`, `repository { nameWithOwner visibility defaultBranchRef issue(number) { … assignedActors labels comments timelineItems(itemTypes: [LABELED_EVENT]) timelineItems(last: 1, itemTypes: [CLOSED_EVENT]) { closer { PullRequest | Commit { associatedPullRequests } } } closedByPullRequestsReferences(excludeUserLinked: true) } }`. Sources: <https://docs.github.com/en/graphql/reference/issues#object-issue>, <https://docs.github.com/en/graphql/reference/issues#object-closedevent>, <https://docs.github.com/en/graphql/reference/commits#object-commit>, <https://docs.github.com/en/graphql/reference/repos#object-repository>.
- GraphQL connections return at most 100 nodes per page, and `gh api --paginate` cannot page several independent cursors in one query (<https://cli.github.com/manual/gh_api>, <https://docs.github.com/en/graphql/guides/using-pagination-in-the-graphql-api>). Each connection that reports `hasNextPage` gets its own follow-up page query.
- GraphQL can return HTTP 200 with an `errors` array and partial `data` (<https://docs.github.com/en/graphql/guides/migrating-from-rest-to-graphql>). Missing data must fail the command; it must not read as "no reviews", "no history", or "no owner".
- B, W, and V or VL must stay separate calls. The read before a write must happen after the provenance and freeze checks, and the check after a write must happen after the edit.
- `archivePlan` uses only the latest `ClosedEvent.closer`. The contract (Landing and archive proof) says the landing pull request carries `Closes #<issue>` and the proof uses `excludeUserLinked: true`, so the proof pull request must also appear in the filtered closing references.
- `gh label create --force` without `--color` sets a random color and updates an existing label (<https://cli.github.com/manual/gh_label_create>). `plan-contract.md` (Status, ownership, and frozen state) names this command. Creating only the missing labels keeps `new` idempotent and stops the recoloring.
- `scripts/tests/plan-cli.mjs` has no assertions on `state.calls` or exact gh argv. The race case depends on `state.remoteChange.viewsBeforeChange = 1` in the stub, so the stub must count the new snapshot read as the first view. The test does not cover `list` or `retire`.

Projected calls (single page): new 3 (read, one create per missing label, issue create; 2 when all labels exist), show 1, export 1, edit 4, status 4, step 4, list 2, archive 4, retire 5. Projected test launches: about 280 of 624; the time estimate is 10 to 13 s instead of about 18 s. These are estimates.

Durable fix: one snapshot read per command replaces the separate reads. The separate read functions are removed, not kept beside the new path.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | snapshot | Add one GraphQL snapshot read that returns viewer login, repository identity, the issue, and the connections each command needs (assignees, labels, comments, labeled-event history, latest closer with nested associated pull requests, filtered closing references). Page each connection with its own cursor. Fail on `errors` or missing data. Use it in show, export, edit, status, step, archive, and retire; remove `resolveRepository`, `resolveActingLogin`, `planWorkStarted`, `issueComments`, `archivePullRequestReferences`, and `associatedPullRequests` as separate gh reads. Keep B, W, V, VL, and `gh issue close` unchanged | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs | - | local | planned | Every command except list makes one read before its write path; no removed function remains |
| 2 | archive_proof | Require the proof pull request (PR closer, or the merged pull request associated with a commit closer) to appear in the filtered closing references, in addition to the current merged-into-default-branch checks | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs | 1 | local | planned | A closure by a pull request that is only user-linked is refused |
| 3 | labels | In `new`, read the five plan labels in the snapshot and create only the missing ones with `gh label create` without `--force`; update the contract sentence that names `gh label create --force` | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md | 1 | local | planned | `new` in a repository with all labels makes no label call and changes no label |
| 4 | stub_tests | Extend the gh stub for the snapshot query (viewer, repository, issue connections with pagination, LABELED_EVENT and CLOSED_EVENT timelines, nested commit associations, closing references, GraphQL errors, label lookup) and make `viewsBeforeChange` count the snapshot read. Add plan-cli cases: more than 100 comments and label events, a user-linked-only closer refused, a commit closer accepted, a GraphQL error that fails closed, `new` with existing labels, and `list` and `retire` | scripts/tests/fixtures/gh-stub/gh, scripts/tests/plan-cli.mjs | 1, 2, 3 | local | planned | `node scripts/tests/plan-cli.mjs` passes with the new cases |
| 5 | measure | Measure gh launches and test time with the same argv-logging PATH wrapper; record the results | scripts/tests/plan-cli.mjs | 4 | local | planned | Measured launches and time are recorded in Verification Results |
| 6 | bookkeeping | Run the content-hash backfill for plan-lifecycle skills; bump `metadata.updated` on plan-manager by hand if only scripts changed | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md | 3 | local | planned | A second backfill run writes nothing |
| 7 | gate | Run the full gate, because the change spans the plugin and author test tooling | scripts/tests/plan-cli.mjs | 5, 6 | local | planned | `node scripts/ci.mjs` exits 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-cli.mjs` | Passes, including the new boundary and refusal cases |
| A2 | argv-logging PATH wrapper around the stub during A1 | Fewer than 350 gh launches (baseline 624); per-command counts match the projection within one call |
| A3 | `node plugins/plan-lifecycle/test/selftest.mjs` | Passes |
| A4 | Real read against this repository: `node plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs show 60` | Prints the same header strip and review line as before the change |
| A5 | `node scripts/ci.mjs` | Exit 0 |

## Do not touch

- The pre-write read, the write, the post-write checks, and `gh issue close` order.
- Export provenance format and the `.origin` sidecar.
- `list` output format and its 500-item limit.
- Plugin versions and release manifests.

## Open questions

## Verification Results
