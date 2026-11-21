<!-- plan-contract: v4 -->

## Goal

Close the three review notes recorded on #60 and #63:

1. #63 MEDIUM: `hasClosingKeyword` in `plan.mjs` uses `\s+` between the keyword and the issue reference, so `Closes:` and `#N` in separate paragraphs pass the archive proof. Allow spaces and tabs only, and make the archive refusal name that rule.
2. #60 LOW: `ACTING_LOGIN_ERROR` names `gh api user --jq .login`, which `plan.mjs` no longer calls. Name the GraphQL `viewer.login` lookup.
3. #60 LOW: `scripts/tests/plan-cli.mjs` runs each CLI call with `timeout: 10_000`, which can fail the gate on a slow runner. Remove it.

User instruction (in session, 2026-09-24): "do the follow-up".

Mode: plan-and-implement

## Research

- `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs` - `hasClosingKeyword` builds `\b(?:close|…|resolved):?\s+(?:#|<repo>#)<n>(?![A-Za-z0-9_])` with flag `i` (verify: `grep -n -A6 'function hasClosingKeyword' plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs`). GitHub documents the syntax as `KEYWORD #ISSUE-NUMBER` (<https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue>). A same-line separator matches that syntax. Step 1 may also let one keyword cover a comma-separated list, such as `Fixes #4, #5`, if the regex stays readable.
- Existing refusal cases in `scripts/tests/plan-cli.mjs` (the `closedPlan` loop) already cover `Refs #N`, number prefix and suffix, keyword prefix, issue URL, another repository, and a null description. No case covers a line break between the keyword and the reference. Commit closers reach the same check: `archive` runs `hasClosingKeyword` on the description of each associated pull request.
- `ACTING_LOGIN_ERROR` has three uses in `plan.mjs` and none in tests or the contract (verify: `grep -rn ACTING_LOGIN_ERROR plugins scripts`).
- `run()` in `scripts/tests/plan-cli.mjs` passes `timeout: 10_000` to `spawnSync`; the CI job already has its own overall time limit.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | separator | Replace `\s+` with `[ \t]+` in `hasClosingKeyword` and change the archive refusal to `archive requires a closing keyword and #<issue> on one line in a pull request merged into <nameWithOwner>:<branch>`; add refusal cases `Closes:\n\n#ISSUE` and `Closes\n#ISSUE` for a pull-request closer and for a commit closer, and an acceptance case with a tab separator | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | - | local | planned | The new refusal cases fail before the change and pass after it |
| 2 | login_error | Change `ACTING_LOGIN_ERROR` to name the GraphQL `viewer.login` lookup | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs | - | local | planned | No `gh api user` text remains in `plan.mjs` |
| 3 | timeout | Remove `timeout: 10_000` from `run()` | scripts/tests/plan-cli.mjs | - | local | planned | `run()` has no per-command timeout |
| 4 | gate | Update `metadata.updated` for plan-manager only if the backfill requires it; run the full gate | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md | 1, 2, 3 | local | planned | `node scripts/ci.mjs` exits 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-cli.mjs` before step 1 code change, with only the new cases added | Fails on the line-break case |
| A2 | `node scripts/tests/plan-cli.mjs` after all steps | Passes |
| A3 | `grep -n 'gh api user\|timeout: 10_000' plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs scripts/tests/plan-cli.mjs` | No matches |
| A4 | `node scripts/ci.mjs` | Exit 0 |
| A5 | `grep -q 'viewer.login' plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs` | Exit 0 |

## Do not touch

- The keyword set, the issue-URL refusal, and the commit-closer proof.
- Plugin versions and release manifests.

## Open questions

## Verification Results
