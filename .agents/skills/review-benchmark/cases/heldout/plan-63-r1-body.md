<!-- plan-contract: v4 -->

## Goal

Fix the #60 regression on `main`: `archive` refuses every plan, because GitHub classifies a pull request from a `gh issue develop` branch as user-linked, so `closedByPullRequestsReferences(excludeUserLinked: true)` never lists it. Prove a pull-request closure by the closing keyword in that pull request's description instead, and remove the filtered-reference read.

User decision (in session, 2026-09-24): check the closing keyword in the pull request, chosen over reverting to the pre-#60 proof.

Mode: plan-and-implement

## Research

- Live evidence (GraphQL, 2026-09-24): for issues #57, #59, and #60, `closedByPullRequestsReferences(excludeUserLinked: true, includeClosedPrs: true)` returns no nodes, and the same connection without `excludeUserLinked` returns the merged closing pull requests #58, #61, and #62. All three came from `gh issue develop` branches and carry `Closes #<issue>` in the body. `plan.mjs archive 60` refused with "archive requires a closing pull request merged into DocksDocks/docks:main".
- GitHub links an issue by keyword only from a pull request description or a commit message; the keywords are close, closes, closed, fix, fixes, fixed, resolve, resolves, resolved, followed by `#N`, `owner/repo#N`, or the issue URL, optionally after a colon (<https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue>). The title does not link.
- `plan.mjs` today: `readSnapshot` requests the filtered references and pages them through `issueNodes`; `archivePlan` requires the PR closer in `issue.closing`. `plan-contract.md` (Landing and archive proof) says "Use `excludeUserLinked: true`."
- `scripts/tests/fixtures/gh-stub/gh` models `excludeUserLinked` filtering, and `scripts/tests/plan-cli.mjs` has the #60 cases that depend on it. The stub did not model the classification of `gh issue develop` branches, which is why the tests passed.

Durable fix: the proof reads the closer pull request's own body, so it holds whatever sidebar link state GitHub reports. The filtered-reference connection, its paging, and its stub model are removed.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | proof | Add `body` to the pull-request closer fields; in `archivePlan` require a closing keyword for this issue (`#N`, `owner/repo#N` for this repository, or the issue URL, case-insensitive, optional colon, word-bounded so `#600` does not match `#60`). Remove the `closing` connection from `readSnapshot` and the membership check. Keep the commit-closer proof and the merged-into-default-branch checks | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs | - | local | planned | `archive` accepts a merged PR closer whose body says `Closes #N`, refuses one without it |
| 2 | contract | Replace "Use `excludeUserLinked: true`." with the keyword rule | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md | 1 | local | planned | The contract names the keyword proof and no longer names `excludeUserLinked` |
| 3 | tests | Remove the stub's filtered-reference model; add PR `body` to closer data. plan-cli cases: `Closes #N` accepted, `Fixes: owner/repo#N` accepted, body without keyword refused, `Closes #N0` for issue N refused, commit closer still accepted | scripts/tests/fixtures/gh-stub/gh, scripts/tests/plan-cli.mjs | 1 | local | planned | `node scripts/tests/plan-cli.mjs` passes |
| 4 | live | Archive #60 with the fixed `plan.mjs` from the branch | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs | 3 | probe | planned | `plan #60 finished (closed by …/pull/62)` |
| 5 | gate | Content-hash backfill for plan-lifecycle; full gate | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md | 3 | local | planned | `node scripts/ci.mjs` exits 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-cli.mjs` | Passes, including the new keyword cases |
| A2 | `node plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs archive 60` from the branch | Archives #60 through PR #62 |
| A3 | `node scripts/ci.mjs` | Exit 0 |

## Do not touch

- The one-read snapshot design from #60 and the pre-write, write, and post-write calls.
- Commit-closer proof.

## Open questions

## Verification Results
