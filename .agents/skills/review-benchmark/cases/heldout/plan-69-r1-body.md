<!-- plan-contract: v4 -->

## Goal

Fix #49, #67, and #68 in the plan-lifecycle plugin, and fix the audit flaws in its instructions and helper.
- #68: plan.mjs reads gh output larger than 1 MiB.
- #49: plan.mjs reads review records written with Markdown emphasis, and a bolded severe finding cannot keep a code pass.
- #67: the contract states that a partial pull request from the linked branch closes the issue on merge, and tells the manager to reopen it; plan.mjs reports an early closure and names the recovery.
- Audit: the manager, contract, and reviewer instructions have one home per rule, executable steps, and a done condition per phase.

Mode: plan-and-implement

## Research

Evidence (Node v24.22.0, gh 2.102.0):

- #68 reproduced. A child that writes 2 MiB through `spawnSync` under the default `maxBuffer` fails with `error.code === 'ENOBUFS'`, message `spawnSync <cmd> ENOBUFS`, signal `SIGTERM`, status `null`.
- With `maxBuffer: 256 * 1024 * 1024`, all 2,097,152 bytes arrive. `runGh()` in `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs` passes no `maxBuffer`.
- The fake gh `scripts/tests/fixtures/gh-stub/gh` prints with `console.log(...)` and then calls `process.exit(0)`. Such a child delivered only 146,176 of 8,388,608 bytes. `fs.writeSync(1, ...)` delivered all 8,388,608 bytes. A regression test above 1 MiB needs synchronous writes in the stub.
- #49 reproduced with the current `parseReviewComment()`:
  - `**### Code review round 1**` + `**Code-review: pass**` returns `undefined`.
  - `**Code-review:** \`pass\`.` returns `undefined`.
  - `- Plan-review: _repair_` under `## **Plan review** round 1` returns `undefined`.
  - `- **[HIGH]** src/example.mjs:1 - data loss - fix` after `Code-review: pass` returns `{code, pass}` (fail-open).
  - `1. Bug [critical] src/example.mjs:1 - ...` after `Code-review: pass` returns `{code, pass}` (fail-open).
  - `> Severity: High` after `Code-review: pass` returns `{code, pass}` (fail-open).
- A prototype parser (strip `*`, `_`, and backticks; strip leading `>` and list markers; heading regex `^(?:#+\s*)?(plan|code) review`; verdict regex `^(plan|code)[- ]review:\s*([a-z]+(?:-[a-z]+)*)`; severity on `[critical]` or `[high]` anywhere, or `critical:`, `high:`, or `severity: critical|high` at line start) returned the expected result for 15 cases: the 5 existing `reviewCases` in `scripts/tests/plan-cli.mjs`, the 6 rows above, and 4 controls.
- #67: GitHub docs ("Linking a pull request to an issue", https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue) say that merging a linked pull request into the default branch closes its linked issue. Every pull request from a `gh issue develop` branch is linked. Only manually linked pull requests can be unlinked.
- `gh pr view <n> --json closingIssuesReferences` works: PR #66 lists `[65]`. `gh issue reopen` has `-c, --comment`.
- GitHub CLI flags confirmed from `--help`: `gh issue develop` has `--list`, `--base`, `--checkout`, `--name`; `gh pr merge` has `--match-head-commit SHA`, `--merge`, `--squash`; `gh pr checks` has `--watch`. This repository merges with merge commits (for example `Merge pull request #66 ...`).
- Baseline: `plan.mjs show 65` prints `#65 · finished · plan.mjs: close the three advisory notes from #60 and #63 · https://github.com/DocksDocks/docks/issues/65`, then `reviews: plan=pass code=pass`, and exits 0.
- omp substitutes `${CLAUDE_PLUGIN_ROOT}` in plugin content; Claude Code docs say the variable resolves inline in agent content; Codex does not substitute it.
- Current scores: skills plan-manager 14, plan-reviewer 13, plan-workspace 15 (floor 8); agents code-reviewer 15, plan-reviewer 15 (floor 14).
- The installed v0.11.1 helper still has the #49 parser bug, so review verdict lines in this plan's own reviews must be plain text.

Decisions:

- #67 uses the reopen flow: every plan pull request still comes from the linked branch; before the merge question for a partial pull request, the manager says that the merge closes the issue; after the merge it reopens the issue with one `gh issue reopen --comment` call, which applies the comment and the reopen together or not at all, so a failed call is safe to rerun, and confirms that `show` reads `ongoing`. The user chose this over unlinked partial branches and over one pull request per plan.
- The comment page size rises to `first:250`, the GraphQL connection maximum, with a 256 MiB `maxBuffer`. A full page is at most 250 comments of 65,536 characters, about 100 MB of JSON. Smaller pages would add GraphQL calls that #60 removed.
- The parser tolerates Markdown, and the reviewer templates prescribe plain verdict lines.
- The durable-solution rule is copied into the reviewer files, because Codex does not substitute `${CLAUDE_PLUGIN_ROOT}`.
- Canonical homes: `plan-contract.md` holds the path criteria, the review loop, the linked-branch steps, and the landing rules. `plan-manager/SKILL.md` holds the phase order, each phase's own actions, and a "Done when" line per phase. The reviewer agents and the `plan-reviewer` skill own the exact review block. The Codex wrappers point to the agent Output Format.
- New helper strings:
  - `runGh()` stderr: `gh <argv[0]> <argv[1]> output exceeded 256 MiB`.
  - `show` advice: `advice: plan is closed as completed while step <id> is <status>; closed by <closer>; reopen the issue if work remains`, where `<closer>` is the pull request URL, `commit <oid>`, or `an unknown closer`.
  - `step` refusal: `plan #<n> is finished; reopen it before moving step <id> to <status>`.
  - `list` advice: `advice: list stopped at 500 plans; more plans may exist`.
  - `list` failure: `gh issue list returned malformed issues`.

Rejected audit findings (no concrete consequence):

- `step` renormalizes the body: all writes normalize the body by design.
- Dependencies give advice only: documented behavior.
- `status` on `unlabelled` or `unreadable`: `workStarted()` already returns true for these.
- Recording check results in Verification Results: already required.
- The review-trust model lets the assignee post reviews: the manager posts reviewer blocks by design.
- Symlink and chmod hardening of scratch paths: only the local user controls these paths.
- Further fake-gh fidelity changes beyond synchronous output.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | helper_fixes | Raise the gh buffer, read Markdown review records, report early closure, flag the list limit, add regression tests and a stub that writes all output | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | - | local | planned | node scripts/tests/plan-cli.mjs passes with the new large-output, review-record, early-closure, and list-limit cases |
| 2 | contract_and_manager | State the partial pull request reopen flow, consolidate the path, review-loop, and linked-branch rules in the contract, add the review diff recipe, post-merge steps, and a done line per phase | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-manager/references/github-issue-publication.md | - | local | planned | The contract holds the reopen flow and the new helper strings; the skill points to the contract for each moved rule |
| 3 | reviewer_format | Give both reviewers one exact output block, copy the durable-solution rule into them, point Codex wrappers at the agent format, prune frozen history from the workspace check | plugins/plan-lifecycle/agents/code-reviewer.md, plugins/plan-lifecycle/agents/plan-reviewer.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/references/codex-agent-templates.md, .codex/agents/plan-reviewer.toml, .codex/agents/code-reviewer.toml, plugins/plan-lifecycle/skills/AGENTS.md | - | local | planned | Both example blocks parse to the intended verdict with the new helper and agent scores stay at or above the floor |
| 4 | hashes_and_gate | Refresh content hashes and run the plugin and full gates | plugins/plan-lifecycle/skills | 1, 2, 3 | local | planned | node scripts/ci.mjs exits 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | node scripts/tests/plan-cli.mjs | Exit 0 and a plan-cli smoke PASSED line |
| A2 | node plugins/plan-lifecycle/test/selftest.mjs | Exit 0 |
| A3 | node plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs show 65 | The header strip with status finished, then reviews: plan=pass code=pass, no advice line, exit 0 |
| A4 | node -e "import('./plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs').then((m) => console.log(JSON.stringify(m.parseReviewComment('**### Code review round 1**\n\n**Code-review: pass**'))))" | Prints {"kind":"code","verdict":"pass"} |
| A5 | node -e "import('./plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs').then((m) => console.log(JSON.stringify(m.parseReviewComment('### Code review round 1\nCode-review: pass\n- [HIGH] Bug - src/example.mjs:1 - data loss - fix'))))" | Prints {"kind":"code","verdict":"fixes-required"} |
| A6 | node scripts/ci.mjs | Exit 0 |

## Do not touch

- Release tooling and every plugin `version` field.
- `docs/plans/finished/`.
- The root `AGENTS.md`.
- The `docks` plugin.

## Open questions

None.

## Verification Results

Not run.
