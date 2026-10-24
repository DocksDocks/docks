<!-- plan-contract: v4 -->

## Goal

Fix five defects that benchmark 1 of #98 found in the code of #96 and that nobody fixed (D3 to D7): the test-contract registry check accepts a missing toolchain; no test covers the reopen refusal after a change during the settle wait; the fake gh returns pull request fields that the query does not select; a reopen test checks request text instead of the stored result; and the report-section verify command passes when every skill lacks the section. Fix each root cause, so the same kind of defect cannot pass the gate again.

Yolo: the user delegated every decision except the merge to the agent.

Mode: plan-and-implement

## Research

### Reproductions

Each defect was reproduced on `main` at `163acb53` (plan-lifecycle 0.17.1). The mutations ran in a temporary detached worktree, which was removed afterwards.

- D3: `scripts/config/test-contracts.json` lists `"toolchains": ["bun-1", "node-24"]` for `repo-plan-cli`, because the gate runs `scripts/tests/plan-cli.mjs` with Node and the fake gh (`scripts/tests/fixtures/gh-stub/gh`) starts with `#!/usr/bin/env bun`. With `bun-1` removed from that row, `bun scripts/tests/test-contracts.mjs` still printed `PASS test_contracts contracts=18 discovered=18 selected=18`. The check (`scripts/tests/test-contracts.mjs`, the loop over `registry.contracts`) asserts only that each runner that it discovers in `scripts/ci.mjs` is listed. It never discovers the fake gh's runtime, and it never rejects a listed toolchain that nothing needs.
- D4: `plan.mjs` refuses with `plan #<n> changed during the settle wait; run reopen again` when the plan is still closed after the settle wait and either its status is no longer `finished` or the latest close differs from the one before the wait (`reopen`, after `sleep(REOPEN_SETTLE_MS)`). `grep -rn 'changed during the settle wait' scripts/tests` prints nothing: no test reaches either branch.
- D5: the fake gh builds pull request nodes with `merged`, `mergedAt`, `state`, `url`, and `baseRefName` whether or not the query selects them (`pullRequestNode` and the `Repository.pullRequest` handler). With `mergedAt` and `baseRefName` removed from `PULL_REQUEST_FIELDS` in `plan.mjs`, `node scripts/tests/plan-cli.mjs` still passed 66 of 66, although GitHub would then return neither field and `pullRequestNodes` would reject every closing pull request as malformed.
- D6: `scripts/tests/plan-cli/reopen.test.mjs` ("reopen after a commit close") asserts `!writes[0].some((argument) => argument.includes('addAssigneesToAssignable'))`. That checks the text of the request, not a result that a user can see; the same test already asserts the stored issue and the count of writes.
- D7: the Report section rule in `plugins/docks/skills/AGENTS.md` gives the verify command `for f in …; do sed -n '/^## Report a problem with this skill$/,$p' "$f" | sha256sum; done | sort | uniq -c`. On three skills that all lack the section it printed `3 e3b0c442…` (the digest of empty input): one line whose count equals the number of skills, which the rule calls a pass. No gate check compares the copies.

### Decisions

1. **D3: the registry check discovers fixture runtimes and requires an exact toolchain list.** `test-contracts.mjs` also discovers the interpreter of each executable fixture that a suite runs: an executable file with a `#!` line under `scripts/tests/fixtures/`, when the suite's files name that fixture's folder. `bun` maps to `bun-1` and `node` to `node-24`, as the gate runners do. Each contract's `toolchains` must then equal the discovered set: a missing toolchain fails, and a listed toolchain that nothing needs fails, each with the contract id, the toolchain, and the evidence path. Rejected: a declared field for fixture runtimes (the declaration could drift the same way); a check only for `repo-plan-cli` (the next fixture would have the same gap).
2. **D5: the fake gh returns only the selected pull request fields.** Each pull request node that the fake gh returns, for a closer, an associated pull request, or `Repository.pullRequest`, holds only the fields that the query selects at that level, read with the selection helpers that the fake gh already has (`graphqlSelections`, `ownFields`). A test that relied on an unselected field is changed to select it or to stop relying on it. Proof: the D5 mutation above must then fail the plan CLI suite. Rejected: a validation step in `plan.mjs` (the helper already validates; the gap is in the fake).
3. **D4: two tests cover the settle-wait refusal.** The refusal has two triggers, and each test reaches one of them without a change to `plan.mjs`: one test replaces the latest close during the settle wait with a later close by the same pull request at another `createdAt`, so the close differs; one test changes the issue's `stateReason` from `COMPLETED` to `NOT_PLANNED` during the wait while the issue stays closed with the same latest close, so `statusFromIssue` reads `retired` instead of `finished`. A label change cannot reach the refusal, because a closed issue's status comes from `stateReason`, not from labels (`statusFromIssue`). Each test asserts the exact refusal text, exit 1, one settle wait, no write, and the stored issue as the change left it. Proof: with the refusal replaced by a pass-through in a temporary copy, both tests fail.
4. **D6: the reopen test asserts results, not request text.** The request-text assertion goes. When the fake gh records a visible result of a claim (for example an assignment event), the test asserts that no such result appears; otherwise the stored issue and the write count, which the test already asserts, are the proof.
5. **D7: the skills guard checks the Report section.** `scripts/skills/guard.mjs`, which the gate runs for each plugin's skills, fails when a `SKILL.md` does not end with the canonical Report section, byte for byte. The canonical text lives once, in `scripts/config/report-section.md`, so the copies in both plugins match one source. The error names each file and says whether the section is missing or differs. The Report section rule in `plugins/docks/skills/AGENTS.md` then names the guard as its check and says that a change to the section changes the canonical file and every copy in one commit. Rejected: a corrected shell command (a reader can still misread its output; the gate never runs it).

### Request corrections

Asked: "fix defects first in its own plan" for D2 to D7. Did: this plan fixes D3 to D7; D2, a defect of the report-skill-issue skill, moves to the report-skill-issue plan that follows, by the user's choice in this session. Reason: the user's answer to a publication question.

### Engineering standards

- Steps 1, 2, and 5: `fix-workflow` (reproduce before, confirm after, with the mutations above) and `code-clarity`.
- Steps 3 and 4: `test-coverage` (tests for behavior that exists; no test of request text) and `code-clarity`.
- Commits: `commit-discipline`. Self-review during code review round 1: `code-review` with `code-clarity`.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | registry_toolchains | Implement decision 1 (D3) | scripts/tests/test-contracts.mjs, scripts/config/test-contracts.json | - | local | done | the current registry passes; with `bun-1` removed from `repo-plan-cli` the check fails and names `repo-plan-cli`, `bun-1`, and the fake gh; with an unneeded toolchain added to one row it fails and names that row |
| 2 | stub_selection | Implement decision 2 (D5) | scripts/tests/fixtures/gh-stub/gh, scripts/tests/plan-cli/ | - | local | done | the plan CLI suite passes; with `mergedAt` and `baseRefName` removed from `PULL_REQUEST_FIELDS` in a temporary copy, the suite fails |
| 3 | settle_refusal_tests | Implement decision 3 (D4) | scripts/tests/plan-cli/reopen.test.mjs | 2 | local | done | both new tests pass (a changed close, and `stateReason` changed to `NOT_PLANNED`), and both fail when the refusal is replaced by a pass-through in a temporary copy |
| 4 | reopen_outcome | Implement decision 4 (D6) | scripts/tests/plan-cli/reopen.test.mjs | 3 | local | done | no reopen test asserts request text, and the test still passes |
| 5 | report_section_guard | Implement decision 5 (D7) | scripts/skills/guard.mjs, scripts/config/report-section.md, plugins/docks/skills/AGENTS.md | - | local | done | the guard passes on both plugins; it fails and names the file when one skill lacks the section or one byte of a copy differs |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| a1 | `bun scripts/ci.mjs` | exits 0 for the repo-wide checks and both plugins (root `AGENTS.md`: the full gate for repo-wide tooling and changes in more than one area) |
| a2 | `node scripts/tests/plan-cli.mjs` and `bun run test:coverage` | the suite passes, and `plan.mjs` line coverage stays at or above 99% |
| a3 | step 1 mutations in a temporary worktree at the reviewed candidate | the check fails for the removed and for the added toolchain, and passes on the unchanged registry |
| a4 | step 2 mutation in a temporary worktree | the plan CLI suite fails with the two fields removed from the query |
| a5 | step 3 mutation in a temporary worktree | both settle-wait tests fail with the refusal removed |
| a6 | step 5 mutations in a temporary worktree | `bun scripts/skills/guard.mjs plugins/docks/skills` fails and names the file for a missing section and for a changed byte; both plugins pass unchanged |
| a7 | pull request checks | every check passes |

## Do not touch

- The behavior of `plan.mjs`: this plan changes tests, the fake gh, and author tooling only.
- The report-skill-issue skill: the plan that follows changes it.
- Review trust, the verdict words, and the landing rules.

## Open questions

## Verification Results

Commits on the linked branch: `e24c49b9` (step 1), `2fe28f52` (step 2), `f0a82ab7` (steps 3 and 4), `33c45f33` (step 5). Each commit passed its focused check in a temporary detached worktree: `bun scripts/tests/test-contracts.mjs` passed at `e24c49b9`; `node scripts/tests/plan-cli.mjs` passed 66 of 66 at `2fe28f52` and 68 of 68 at `f0a82ab7`; at `33c45f33` the skills guard passed for both plugins, the registry check passed, and `bun run check:js` passed.

- a1: `bun scripts/ci.mjs` passed for the repo-wide checks and both plugins on the candidate before the commits.
- a2: `node scripts/tests/plan-cli.mjs`: 68 tests, 68 pass; `bun run test:coverage`: `plan.mjs` line coverage 99.68%.
- a3 (step 1): with `bun-1` removed from `repo-plan-cli` and `node-24` added to `repo-skill-trigger-collision`, `bun scripts/tests/test-contracts.mjs` failed with `repo-plan-cli.toolchains must list bun-1: scripts/tests/plan-cli/harness.mjs names scripts/tests/fixtures/gh-stub, where scripts/tests/fixtures/gh-stub/gh runs with bun` and `repo-skill-trigger-collision.toolchains lists node-24, which no discovered runner needs`. Before the fix, the same removal passed.
- a4 (step 2): with `mergedAt` and `baseRefName` removed from `PULL_REQUEST_FIELDS` in a worktree at `33c45f33`, the plan CLI suite failed 26 of 68 tests. Before the fix, the same mutation passed 66 of 66.
- a5 (step 3): with the refusal replaced by a pass-through in a worktree at `33c45f33`, `node --test scripts/tests/plan-cli/reopen.test.mjs` failed exactly the two new tests ("reopen refuses a plan whose latest close changes during the settle wait" and "reopen refuses a plan that someone closes as not planned during the settle wait"); 15 passed.
- Step 4: the fake gh records no result of a claim on an owned plan (the assignees stay the same), so the stored-issue and single-write assertions are the proof; no reopen test inspects request arguments.
- a6 (step 5): on a copy of `plugins/docks/skills`, the guard failed with `<copy>/skills/engineering/code-clarity/SKILL.md: missing the Report section; ...` for a removed section, and with `.../zoom-out/SKILL.md: the Report section differs from scripts/config/report-section.md; ...` for one added byte. Both plugins pass unchanged.
