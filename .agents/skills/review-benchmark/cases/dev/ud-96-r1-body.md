<!-- plan-contract: v4 -->

## Goal

Fix the plan-lifecycle defect in #90: a reopen after a partial-merge close can race GitHub's own close and leave the plan issue closed with reason REOPENED, a state that GitHub refuses to change. Give agents that use a skill from this repository a documented way to report a problem with that skill as a GitHub issue here, with a template that explains the problem well and keeps private data out of the public issue. Close the open items from the advisor check of #89 and #95.

Scope: the plan-lifecycle helper, contract, and skills; the shipped docks and plan-lifecycle skills; the test-contract registry; and releases of the changed plugins after the merge, each with its own question.

Yolo: the user delegated every decision except the merge to the agent.

Mode: plan-and-implement

## Research

### Open issues

- `gh issue list --repo DocksDocks/docks --state open` lists one issue: #90 (label `bug`). Issues #91 to #94 are the throwaway probe issues of #89; they are closed as not planned and carry no labels.
- #90 is an agent-filed report against plan-lifecycle 0.15.0. The manager merged a partial pull request and reopened the plan issue 1 s after GitHub's `ClosedEvent` (merge 19:29:45, close 19:29:47, reopen 19:29:48 UTC). The issue ended `CLOSED` with `stateReason` `REOPENED`. Since then GitHub refuses every reopen and close, also in the web page, and only GitHub Support can repair it. `plan.mjs` derives `unreadable` for that state (`statusFromIssue`), so `step`, `retire`, and `archive` stop. Waiting until the issue read `CLOSED` with its `ClosedEvent`, plus about 10 s, avoided the state on the next plan (#90, "Workaround that worked").

### How the reopen works today

- The contract (`plan-contract.md`, Pull requests, partial pull request step 2) tells the manager to run `show <n>` after the merge and, when it reads `finished`, `gh issue reopen <n> --repo <owner/repo> --comment "Reopened: partial pull request #<pr> closed this plan through its linked branch. Work continues."`. Nothing waits for GitHub's close to settle, so an agent that reads `finished` reopens within a second of the close, as in #90. `plan-manager/SKILL.md` (Landing and reporting, BAD/GOOD) repeats the same step.
- `plan.mjs` `readSnapshot` reads the latest `ClosedEvent` with its closer (`CLOSED_EVENT_FIELDS`) but not its `createdAt`. The fake gh (`scripts/tests/fixtures/gh-stub/gh`) renders the latest close without `createdAt` and has no `issue reopen` handler.
- Experiment (`gh pr view <pr> --json closingIssuesReferences` on merged pull requests #95, #88, and #86): a merged pull request still lists the issues it closes (`[89]`, `[87]`, `[85]`). The `ClosedEvent` of #89 has closer `PullRequest` #95, `stateReason` `COMPLETED`, and `createdAt` 2 s after the pull request's `mergedAt`.
- `gh issue reopen` takes `-c, --comment` (gh 2.102.0 help; https://cli.github.com/manual/gh_issue_reopen).

### How agents would report a skill problem

- No reporting path exists: no shipped skill names this repository, there is no `.github/ISSUE_TEMPLATE`, no `SECURITY.md`, and private vulnerability reporting is off (`gh api repos/DocksDocks/docks/private-vulnerability-reporting` returns `{"enabled":false}`; https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository).
- #90 shows what a useful report holds: plugin version, the exact instruction, an observed timeline, every repair attempt, a working workaround, and suggested changes. It also names a private repository and a private plan title, which a public report should leave out.
- Skills load their body only on activation, and agents choose skills by description (`plugins/docks/skills/AGENTS.md`, intro). An agent sees a pointer in a skill body exactly when it uses that skill. The repository already keeps one byte-identical paragraph in several skills, the plan-lifecycle prerequisite paragraph, checked by a grep (`plugins/plan-lifecycle/skills/AGENTS.md`, Fail-loud routing).
- gh can file and search: `gh issue create --repo <owner/repo> --title <t> --body-file <file>` and `gh issue list --repo <owner/repo> --state all --search <query>` (gh 2.102.0 help; https://cli.github.com/manual/gh_issue_create, https://cli.github.com/manual/gh_issue_list). Without gh, a prefilled `issues/new?title=&body=` URL opens the form (https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-an-issue, "Creating an issue from a URL query").
- Shipped skills sit at `<plugin-root>/skills/<category>/<skill>/SKILL.md`, and each plugin root carries `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` with `version`. Each skill's frontmatter carries `metadata.updated` and `metadata.content_hash`, which identify the exact skill text.
- The scorer gives 2 points for a body of 80 to 310 lines (`skill-guard.mjs`). The longest bodies stay inside their current band with 4 more lines: `type-safety-discipline` (310-line file, about 300-line body) stays at or under 310, and `yolo` is already above it.

### Advisor follow-ups from #89 and #95

- `scripts/config/test-contracts.json` lists `"toolchains": ["node-24"]` for all 17 contracts. Since #88, 16 of them run on Bun (`bun()`/`bunOk()` in `scripts/ci.mjs`, `bun test` for the unit files). Only `scripts/tests/plan-cli.mjs` runs on Node, and its fake gh runs on Bun. `scripts/tests/test-contracts.mjs` only checks that the field is a sorted string array, so nothing caught the drift.
- Corrections to the #95 run summary: the remote branch `89-optimize-the-gate-and-the-plan-helper-after-the-bun-switch` stays on GitHub (the repository does not delete merged branches; `delete_branch_on_merge=false`); `status` writes now also run the post-write label check, and a `status` write now creates a missing phase label where it used to fail inside `gh issue edit`; plugin users get the faster helper only with a plan-lifecycle release, which steps 5 and 6 of this plan schedule.
- No official GitHub source states a 100-label cap per issue (web search), so #95's fix that takes removal ids from the paged snapshot stays as merged.

### Decisions

1. Add `reopen <n> --pr <pr>` to `plan.mjs` and make it the contract's only reopen path after a partial merge. It reads the plan for write (ownership check, no claim, because the reopen writes no body), and reads the pull request (`merged`, `mergedAt`, `closingIssuesReferences`).
   - When the pull request is not merged, it refuses.
   - When the pull request does not close the plan, it prints that nothing needs a reopen and exits 0, so the manager can run it after every partial merge.
   - Otherwise it waits until the plan's latest `ClosedEvent` comes from that pull request (or from a commit associated with it) and is not older than `mergedAt`. It polls with a growing pause (250 ms, doubling up to 2 s) for at most 60 s.
   - It then waits until 10 s after that event's `createdAt` (the settle time that avoided the state in #90) and runs `gh issue reopen <n> --repo <repo> --comment "<the contract's comment>"`.
   - It reads the plan again and prints `plan #<n> reopened: <status>`.
   - A plan that is already open after that close prints `plan #<n> is open: <status>` and changes nothing. A close by another closer after the merge is refused, and so is a plan that GitHub left `CLOSED` with reason `REOPENED`, before or after the reopen.
   - The sleep blocks the process with `Atomics.wait`, which Node allows on the main thread (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics/wait).
   - Rejected: contract prose only (#90 suggestion 1). An agent would hand-roll the polling each time, and a missed wait is permanent. Rejected: a fixed sleep after the merge. It does not prove that the close happened, and it waits needlessly when the merge does not close the plan.
2. `show` prints advice for a plan that GitHub left `CLOSED` with reason `REOPENED`: `GitHub left this issue closed with reason REOPENED and refuses every state change; ask GitHub Support to repair it, and record step results in an issue comment until then` (#90 suggestion 2). The derived status stays `unreadable`, so the contract's status table does not change.
3. The contract documents the fallback (#90 suggestion 3): do not retry the reopen; record the remaining step results in one issue comment; report the plan as stuck; ask the repository owner to contact GitHub Support. The contract's command table, advice list, and refusal list gain the new command, advice, and refusals. `plan-manager/SKILL.md` names `reopen` where it now names a hand reopen.
4. Add the docks skill `report-skill-issue` (`productivity/`, `user-invocable: true`). It confirms that the problem is in the skill, collects the plugin version and the skill's `metadata.updated` and `content_hash`, searches for a duplicate, drafts the title `<plugin>:<skill>: <symptom>` and a fixed-section body, gets the user's approval of the exact text, and files it with `gh issue create --repo DocksDocks/docks --body-file`. Without gh, it gives the prefilled URL.
   - Its constraints: the repository is public; file only after approval, which ends the turn in a headless run; leave out secrets (name the variable), private repository, organization, and customer names, hostnames, machine paths, proprietary code, and private plan titles. A security problem is never filed publicly; the user gets the draft to send to the repository owner privately.
   - The template follows #90's structure: Summary, Skill, What the skill says, What happened, Expected, How to reproduce, Workaround, Suggested change.
   - Rejected: a `.github/ISSUE_TEMPLATE` form, because agents file through `gh issue create`, and a second copy of the template would drift.
5. Every shipped skill of both plugins ends with one byte-identical `## Report a problem with this skill` section that points to `report-skill-issue` and, for a runtime without docks, states the minimum draft and the approval rule. `plugins/docks/skills/AGENTS.md` owns the rule and its verify command, and `plugins/plan-lifecycle/skills/AGENTS.md` points to it.
   - Rejected: description text, because it costs listing budget in every session. Rejected: a SessionStart hook, because it injects context into every session. Rejected: a new validator, because the repository checks its other byte-identical paragraph with a grep. Rejected: the reviewer agent wrappers and the project-local `.agents/skills`, because the wrappers load the canonical skill and project-local skills are fixed in place.
6. Correct the registry: each contract lists the toolchain of the runner that the gate uses for it. That is `bun-1` for the 16 Bun suites and `bun-1` plus `node-24` for `repo-plan-cli`, whose fake gh runs on Bun. `scripts/tests/test-contracts.mjs` derives the expected token from how `scripts/ci.mjs` runs each suite (`node()`/`nodeOk()` give `node-<major>` from the `node-version` in `.github/workflows/ci.yml`; `bun()`/`bunOk()` and `bun test` give `bun-<major>` from `packageManager`). It fails when a contract omits its runner's token, so a later runtime change cannot leave the registry stale. Rejected: renaming the selection kinds `node-script` and `node-test-file`, because they name the selection shape and a rename changes no behavior.
7. Release both plugins after the merge, each with its own question: docks 0.21.0 (new skill) and plan-lifecycle 0.16.0 (new command), as minor bumps under 0.x semantic versioning. A plan-lifecycle release also ships the #89 helper changes. `plugins/plan-lifecycle/compatibility.json` stays at `minimum_docks_major: 0`, because the plan-lifecycle pointer works without docks.

### Request corrections

Asked: "check open issues as we have some new issues that came". Did: fix #90, the only open issue, and explain #91 to #94 as #89's closed probe issues. Reason: `gh issue list --state open` lists only #90.

### Engineering standards

- Step 1 `reopen_spec`: `tdd-workflow` (spec tests before the helper code; red baseline below), `test-coverage` principles, `code-clarity`, `commit-discipline`.
- Step 2 `reopen_helper`: `fix-workflow` (#90 is a reported defect; the reproduction is step 1's red baseline), `code-clarity`, `commit-discipline`.
- Step 3 `report_skill`: `write-skill` (description rules, trigger collisions, score), `code-clarity`, `commit-discipline`.
- Step 4 `registry_toolchains`: `tdd-workflow` (the cross-check is written first and fails on the stale registry), `code-clarity`, `commit-discipline`.
- Before code review round 1: `code-review` self-review with `code-clarity`.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | reopen_spec | Write the plan-CLI spec cases for `reopen` and the stuck-state advice: waits for the pull request's close and reopens with the contract comment; nothing to reopen when the pull request does not close the plan; refuses an unmerged pull request; refuses a close by another closer after the merge; reports GitHub's `CLOSED`/`REOPENED` state with a refusal and `show` advice; prints the open status when already reopened. Teach the fake gh `issue reopen`, a delayed close after a set number of reads, a reopen that GitHub leaves closed, `createdAt` on close events, and a `pullRequest` query with `closingIssuesReferences` | scripts/tests/plan-cli/, scripts/tests/fixtures/gh-stub/gh | - | local | planned | the new cases fail on the current helper because `reopen` and the advice do not exist (red baseline in Verification Results), and the other plan-CLI cases still pass |
| 2 | reopen_helper | Implement `reopen <n> --pr <pr>` and the `show` advice (decisions 1 and 2) in `plan.mjs`; update the contract's partial pull request steps, command table, advice list, refusal list, and fallback (decision 3); name `reopen` in `plan-manager/SKILL.md`; backfill the plan-lifecycle content hashes | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md | 1 | local | planned | `node scripts/tests/plan-cli.mjs` passes with the step 1 spec files unchanged (`git diff -- <spec files>` prints nothing); `bun run test:coverage` reports at least 99% line coverage for `plan.mjs` |
| 3 | report_skill | Add `plugins/docks/skills/productivity/report-skill-issue/SKILL.md` (decision 4); end every shipped skill of both plugins with the byte-identical report section (decision 5); add the rule and verify command to `plugins/docks/skills/AGENTS.md` and a pointer to `plugins/plan-lifecycle/skills/AGENTS.md`; list the skill in both READMEs; backfill the content hashes of both plugins | plugins/docks/skills/, plugins/plan-lifecycle/skills/, README.md, plugins/docks/README.md | 2 | local | planned | the verify command finds no shipped skill without the section and one byte-identical variant; `report-skill-issue` scores at least 14; `bun scripts/ci.mjs --plugin docks` and `bun scripts/ci.mjs --plugin plan-lifecycle` exit 0 |
| 4 | registry_toolchains | Write the toolchain cross-check in `scripts/tests/test-contracts.mjs` first, then correct the 17 `toolchains` values (decision 6) | scripts/tests/test-contracts.mjs, scripts/config/test-contracts.json | - | local | planned | the cross-check fails on the stale registry (red baseline), and after the correction `bun scripts/tests/test-contracts.mjs` passes |
| 5 | release_docks | After the merge and only with its own question: run `bun scripts/release.mjs --plugin docks minor` from a clean `main` | none | 3 | release | planned | the `docks--v0.21.0` tag CI passes and `gh release view docks--v0.21.0` shows the release, or the step is skipped with the user's answer recorded |
| 6 | release_plan_lifecycle | After the merge and only with its own question: run `bun scripts/release.mjs --plugin plan-lifecycle minor` from a clean `main` | none | 2, 3, 5 | release | planned | the `plan-lifecycle--v0.16.0` tag CI passes and `gh release view plan-lifecycle--v0.16.0` shows the release, or the step is skipped with the user's answer recorded |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| a1 | `bun scripts/ci.mjs` | exits 0 for the repo-wide checks and both plugins (root `AGENTS.md`: the full gate for repo-wide and multi-plugin changes) |
| a2 | `bun scripts/tests/ci-plugin-targeting.mjs` | exits 0 (the non-unit targeting contract, `.github/AGENTS.md`) |
| a3 | `node scripts/tests/plan-cli.mjs` | exits 0, including every `reopen` case |
| a4 | `bun run test:coverage` | runs under Node and reports at least 99% line coverage for `plan.mjs` |
| a5 | `for f in plugins/docks/skills/*/*/SKILL.md plugins/plan-lifecycle/skills/*/*/SKILL.md; do sed -n '/^## Report a problem with this skill$/,$p' "$f" \| sha256sum; done \| sort \| uniq -c` | one line whose count equals the number of shipped skills (30), and the hash is not that of empty input |
| a6 | `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file plugins/docks/skills` | `productivity/report-skill-issue` scores at least 14, and no skill falls below its category floor |
| a7 | `bun scripts/tests/test-contracts.mjs` on a scratch copy of the registry where `repo-plan-cli` lists only `bun-1` | fails naming `repo-plan-cli`; the real registry passes |
| a8 | On GitHub, with the branch helper: `show 89` (archived; its closure read now includes `createdAt`), and `reopen 94 --pr 95` on the closed probe issue #94, which #95 does not close | `show` succeeds; `reopen` prints that pull request #95 does not close plan #94 and exits 0; #94 stays closed as not planned with no labels |
| a9 | A dry run of `report-skill-issue` on #90's facts, without filing | the draft has every template section, the title `plan-lifecycle:plan-manager: <symptom>`, and no private repository name or plan title |
| a10 | pull request checks | every check passes |

## Do not touch

- The plan contract's other rules and refusal strings, the write path from #89, and the status table.
- The reviewer agent wrappers (`plugins/plan-lifecycle/agents/`) and the project-local `.agents/skills/`.
- `docs/` point-in-time records.
- The remote branches `87-evaluate-and-adopt-the-bun-runtime-for-the-repository-mjs-tooling` and `89-optimize-the-gate-and-the-plan-helper-after-the-bun-switch`, which earlier plans created.
- Repository settings, including private vulnerability reporting.
- #90's text, which the user's account published.

## Open questions

## Verification Results
