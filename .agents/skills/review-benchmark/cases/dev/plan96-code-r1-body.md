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

1. Add `reopen <n> --pr <pr>` to `plan.mjs` and make it the contract's only reopen path after a partial merge. It reads the pull request (`merged`, `mergedAt`, `closingIssuesReferences`) and the plan for write.
   - When the pull request is not merged, it refuses.
   - When the pull request does not close the plan, it prints that nothing needs a reopen, exits 0, and writes nothing, so the manager can run it after every partial merge.
   - Otherwise it polls until it observes both facts: the plan reads `CLOSED`, and its latest `ClosedEvent` comes from that pull request (or from a commit associated with it) and is not older than `mergedAt`. The pause grows from 250 ms and doubles up to 2 s, for at most 34 reads (about 60 s); the bound counts reads, not wall time.
   - A plan that reads `OPEN` with such a close event was reopened after that close: the command prints `plan #<n> is open: <status>` and writes nothing. A close by another closer after the merge is refused.
   - After both observations it waits a full 10 s on its own clock, the wait that avoided the state in #90. It then reads ownership, state, and the close event again, right before the write. It writes only when the plan still reads `CLOSED` with reason `COMPLETED` and the same close event; a plan that now reads `OPEN` prints the open status, and a foreign owner is refused.
   - The reopen is one `gh api graphql` request: `reopenIssue`, `addComment` with the contract's comment, and, for an unassigned plan, `addAssigneesToAssignable` with the acting login, so the claim lands in the same write as the contract requires (Status, ownership, and frozen state). The last field returns the stored state and reason, and the command prints `plan #<n> reopened: <status>`.
   - A plan that reads `CLOSED` with reason `REOPENED` is refused with the stuck-state message: before the reopen, after it, and when GitHub answers the reopen with an error (#90: "Could not reopen the issue").
   - The waits block the process with `Atomics.wait`, which Node allows on the main thread (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics/wait). The plan-CLI cases load a test-only `--import` hook that makes those waits return at once, as `scripts/tests/unit/agent-score-vacuity.test.mjs` loads its fixture hook, so the shipped helper carries no test switch, and the read bound makes the timeout case fast.
   - Rejected: contract prose only (#90 suggestion 1), because an agent would hand-roll the polling each time and a missed wait is permanent. Rejected: a fixed sleep after the merge, because it does not prove that the close happened. Rejected: a settle time computed from the event's `createdAt`, because the local clock can drift from GitHub's and shrink the wait to nothing. Rejected: `gh issue reopen --comment`, because it cannot claim an unassigned plan in the same write.
2. `show` prints advice for a plan that GitHub left `CLOSED` with reason `REOPENED`: `GitHub left this issue closed with reason REOPENED and refuses every state change; ask GitHub Support to repair it, and record step results in an issue comment until then` (#90 suggestion 2). The derived status stays `unreadable`, so the contract's status table does not change.
3. The contract documents the fallback (#90 suggestion 3): do not retry the reopen; record the remaining step results in one issue comment; report the plan as stuck; ask the repository owner to contact GitHub Support. The contract's command table, advice list, and refusal list gain the new command, advice, and refusals. `plan-manager/SKILL.md` names `reopen` where it now names a hand reopen.
4. Add the docks skill `report-skill-issue` (`productivity/`, `user-invocable: true`). It confirms that the problem is in the skill, collects the plugin version and the skill's `metadata.updated` and `content_hash`, searches for a duplicate, drafts the title `<plugin>:<skill>: <symptom>` and a fixed-section body, gets the user's approval of the exact text, and files it with `gh issue create --repo DocksDocks/docks --body-file`. Without gh, it gives the prefilled URL.
   - Its constraints: the repository is public; file only after approval, which ends the turn in a headless run; leave out secrets (name the variable), private repository, organization, and customer names, hostnames, machine paths, proprietary code, and private plan titles. A security problem is never filed publicly; the user gets the draft to send to the repository owner privately.
   - The template follows #90's structure: Summary, Skill, What the skill says, What happened, Expected, How to reproduce, Workaround, Suggested change.
   - Rejected: a `.github/ISSUE_TEMPLATE` form, because agents file through `gh issue create`, and a second copy of the template would drift.
5. Every shipped skill of both plugins ends with one byte-identical `## Report a problem with this skill` section that points to `report-skill-issue`. For a runtime without docks, the section says to give the user a draft only and to file nothing, because the publication safeguards (public destination, redaction, security reports, exact-text approval) live in the skill. `plugins/docks/skills/AGENTS.md` owns the rule and its verify command, and `plugins/plan-lifecycle/skills/AGENTS.md` points to it.
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
| 1 | reopen_spec | Write the plan-CLI spec cases for `reopen` and the stuck-state advice: waits for the pull request's close, then reopens with the contract comment and claims an unassigned plan; nothing to reopen when the pull request does not close the plan; refuses an unmerged pull request; refuses a close by another closer after the merge; refuses GitHub's `CLOSED`/`REOPENED` state before and after the reopen, and `show` advises on it; prints the open status when the plan was already reopened; refuses after the bounded reads when GitHub never closes the plan. Add the test-only `--import` hook that skips the waits. Teach the fake gh the `reopenIssue` and `addComment` mutations, a delayed close after a set number of reads, a reopen that GitHub leaves closed, `createdAt` on close events, and a `pullRequest` query with `closingIssuesReferences` | scripts/tests/plan-cli/, scripts/tests/fixtures/gh-stub/gh | - | local | done | the new cases fail on the current helper because `reopen` and the advice do not exist (red baseline in Verification Results), and the other plan-CLI cases still pass |
| 2 | reopen_helper | Implement `reopen <n> --pr <pr>` and the `show` advice (decisions 1 and 2) in `plan.mjs`; update the contract's partial pull request steps, command table, advice list, refusal list, and fallback (decision 3); name `reopen` in `plan-manager/SKILL.md`; backfill the plan-lifecycle content hashes | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md | 1 | local | done | `node scripts/tests/plan-cli.mjs` passes with the step 1 spec files unchanged (`git diff -- <spec files>` prints nothing); `bun run test:coverage` reports at least 99% line coverage for `plan.mjs` |
| 3 | report_skill | Add `plugins/docks/skills/productivity/report-skill-issue/SKILL.md` (decision 4); end every shipped skill of both plugins with the byte-identical report section (decision 5); add the rule and verify command to `plugins/docks/skills/AGENTS.md` and a pointer to `plugins/plan-lifecycle/skills/AGENTS.md`; list the skill in both READMEs; backfill the content hashes of both plugins | plugins/docks/skills/, plugins/plan-lifecycle/skills/, README.md, plugins/docks/README.md | 2 | local | done | the gaps of a fresh agent without the skill are recorded first (`write-skill` step 0); a5, a6, a11, and a12 hold; `bun scripts/ci.mjs --plugin docks` and `bun scripts/ci.mjs --plugin plan-lifecycle` exit 0 |
| 4 | registry_toolchains | Write the toolchain cross-check in `scripts/tests/test-contracts.mjs` first, then correct the 17 `toolchains` values (decision 6) | scripts/tests/test-contracts.mjs, scripts/config/test-contracts.json | - | local | done | the cross-check fails on the stale registry (red baseline), and after the correction `bun scripts/tests/test-contracts.mjs` passes |
| 5 | release_docks | After the merge and only with its own question: run `bun scripts/release.mjs --plugin docks minor` from a clean `main` | plugins/docks/.claude-plugin/plugin.json, plugins/docks/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 3 | release | planned | the `docks--v0.21.0` tag CI passes and `gh release view docks--v0.21.0` shows the release, or the step is skipped with the user's answer recorded |
| 6 | release_plan_lifecycle | After the merge and only with its own question: run `bun scripts/release.mjs --plugin plan-lifecycle minor` from a clean `main` | plugins/plan-lifecycle/.claude-plugin/plugin.json, plugins/plan-lifecycle/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 2, 3, 5 | release | planned | the `plan-lifecycle--v0.16.0` tag CI passes and `gh release view plan-lifecycle--v0.16.0` shows the release, or the step is skipped with the user's answer recorded |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| a1 | `bun scripts/ci.mjs` | exits 0 for the repo-wide checks and both plugins (root `AGENTS.md`: the full gate for repo-wide and multi-plugin changes) |
| a2 | `bun scripts/tests/ci-plugin-targeting.mjs` | exits 0 (the non-unit targeting contract, `.github/AGENTS.md`) |
| a3 | `node scripts/tests/plan-cli.mjs` | exits 0, including every `reopen` case |
| a4 | `bun run test:coverage` | runs under Node and reports at least 99% line coverage for `plan.mjs` |
| a5 | `for f in plugins/docks/skills/*/*/SKILL.md plugins/plan-lifecycle/skills/*/*/SKILL.md; do sed -n '/^## Report a problem with this skill$/,$p' "$f" \| sha256sum; done \| sort \| uniq -c` | one line whose count equals the number of shipped skills (30), and the hash is not that of empty input |
| a6 | `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file plugins/docks/skills` | `productivity/report-skill-issue` scores at least 14, and no skill falls below its category floor |
| a7 | In a temporary worktree of the branch (the yolo Commits rule for worktree paths), set `repo-plan-cli` to list only `bun-1` in `scripts/config/test-contracts.json` and run `bun scripts/tests/test-contracts.mjs` there; then run it in the checkout | the worktree run fails naming `repo-plan-cli`; the checkout run passes |
| a8 | On GitHub, with the branch helper: `show 89` (archived; its closure read now includes `createdAt`), and `reopen 94 --pr 95` on the closed probe issue #94, which #95 does not close | `show` succeeds; `reopen` prints that pull request #95 does not close plan #94 and exits 0; #94 stays closed as not planned with no labels |
| a9 | A dry run of `report-skill-issue` on #90's facts, without filing | the draft has every template section, the title `plan-lifecycle:plan-manager: <symptom>`, and no private repository name or plan title |
| a10 | pull request checks | every check passes |
| a11 | Trigger check from `write-skill` (Behavioral checks): 9 should-trigger and 9 near-miss queries, a third of each held back; for each query a fresh `sonic` subagent gets the names and descriptions of every docks and plan-lifecycle skill and names the skill it would load, or none | every held-back near-miss routes away from `report-skill-issue` (the near-misses include the three sibling routes: `fix-workflow`, `skill-maintenance`, and `write-skill`), and the held-back should-trigger queries load it with at most one miss |
| a12 | Baseline check from `write-skill`: 3 realistic prompts about a wrong instruction in a docks or plan-lifecycle skill, each given to a fresh `sonic` subagent without the skill and to one with it; assertions written before the "with" outputs are read | the "with" runs close the gaps that the "without" runs show (template sections, redaction, a security problem kept private, approval before filing) and break nothing that the "without" runs got right |

## Do not touch

- The plan contract's other rules and refusal strings, the write path from #89, and the status table.
- The reviewer agent wrappers (`plugins/plan-lifecycle/agents/`) and the project-local `.agents/skills/`.
- `docs/` point-in-time records.
- The remote branches `87-evaluate-and-adopt-the-bun-runtime-for-the-repository-mjs-tooling` and `89-optimize-the-gate-and-the-plan-helper-after-the-bun-switch`, which earlier plans created.
- Repository settings, including private vulnerability reporting.
- #90's text, which the user's account published.

## Open questions

## Verification Results

Local runs: Linux x64, Node v24.22.1, Bun 1.4.4. Node test runs set `TMPDIR` to the review scratch (the workstation limitation recorded in #87).

### Step 4 `registry_toolchains` (commit `6bbf8b30`)

- Red baseline, step registry_toolchains: `bun scripts/tests/test-contracts.mjs`: 16 failed, 1 passed (the cross-check named the 16 Bun suites, for example `repo-author-tooling.toolchains must list bun-1: scripts/ci.mjs runs scripts/tests/author-tooling.mjs with bun`; `repo-plan-cli` passed).
- After the registry change, with the check unchanged since the red baseline: `PASS test_contracts contracts=17 discovered=17 selected=17`.

### Steps 1 and 2 `reopen_spec`, `reopen_helper` (commit `347f0a58`)

- Red baseline, step reopen_spec: `node --test scripts/tests/plan-cli/*.test.mjs`: 13 failed, 48 passed. Every failure is an assertion on the helper's usage error (`reopen` is not a command yet); the 48 existing cases pass. The spec files are staged.
- After the helper change, with the spec files unchanged since the red baseline (`git diff` on the four files was empty): `node scripts/tests/plan-cli.mjs`: 61 passed, 0 failed.
- Beyond the spec, the helper refuses two more cases, and the contract lists both refusals: `plan #<n> changed during the settle wait; run reopen again` (the read after the 10 s wait shows a different close) and `plan issue state differs after reopen` (the stored state still reads closed after the write). The pull request query also checks the repository of each closing reference, so an issue with the same number in another repository does not count.

### Step 3 `report_skill` (commits `8542d798`, `093c13f0`)

- Baseline, "without" arm (recorded before the skill existed): three fresh `sonic` agents had no target repository or gh command, no plugin version or runtime, no quote, no fixed sections, no duplicate search, no approval step, and one would report a security problem publicly. Right already: private names and the secret value left out, rotation advised.
- a12, "with" arm, round 1: A held every applicable assertion; B skipped the duplicate search (and so missed the open #90) and named no command or account; C wrote its private draft without the template sections. The skill then gained: every stage in order and no skipped search, also in a text-only run; the private draft uses every section; the pre-filing check lists the search and the target, command, and account; the prefilled link files nothing by itself.
- a12, round 2 (fresh agents, same prompts): A held 1, 2, 3, 4, 5, and 8. B ran the search, found #90, drafted a comment there with new facts only, and named `gh issue comment 90 --repo DocksDocks/docks --body-file <file>` and the account; neither private name appears. C advised rotation first and wrote a private draft with every section, no public path, and only the variable name. Pass.
- a11 trigger check (one fresh `sonic` agent per query, given only the 30 names and descriptions): 9 of 9 report requests loaded `report-skill-issue`, including the 3 held back; 9 of 9 near-misses routed elsewhere, including the 3 held back (`skill-maintenance`, none, `plan-manager`) and the sibling routes `fix-workflow` and `write-skill`. Pass.
- Two dry runs encoded the prefilled link by hand (one link body differed from the shown draft, one was empty), so the link section now gives a Node and a Python command (commit `093c13f0`). Both commands round-trip a body with backticks, `&`, `$`, quotes, `%`, `#`, and non-ASCII text. A repeat dry run produced a link whose body equals the shown draft and its body file byte for byte (2178 characters).

### Acceptance (at `093c13f0` unless noted)

- a1 `bun scripts/ci.mjs`: exit 0, `All ci.mjs checks passed - 2 plugin(s) + repo-wide`.
- a2 `bun scripts/tests/ci-plugin-targeting.mjs`: exit 0.
- a3 `node scripts/tests/plan-cli.mjs`: 61 passed, 0 failed (at `8542d798`; no plan-lifecycle file changed since).
- a4 `bun run test:coverage`: `plan.mjs` 99.68% lines, 80.23% branches, 97.62% functions; uncovered lines 94-95, 451, 843 are older code (at `8542d798`).
- a5: one line, `30 a27c6a6c22683e7cf5e9837d2a5c3baf2ea3cf104d04e5a9b2a52e598124d4c4`; 30 shipped skills; not the hash of empty input.
- a6: `productivity/report-skill-issue 15`; the scorer and the docks gate report no skill below its floor; body 240 lines.
- a7: in a temporary worktree of `8542d798`, `repo-plan-cli` with only `bun-1` made the check fail with exactly one finding, `repo-plan-cli.toolchains must list node-24: scripts/ci.mjs runs scripts/tests/plan-cli.mjs with node`; the checkout run passed. The worktree was removed afterwards.
- a8, real GitHub with the branch helper: `show 89` printed `#89 · finished · …` and `reviews: plan=pass code=pass` with one GraphQL query that includes the close read. `reopen 94 --pr 95` printed `pull request #95 does not close plan #94; nothing to reopen`, exit 0, after one GraphQL query and no write; #94 stayed `CLOSED`/`NOT_PLANNED` with no labels, and its JSON (state, reason, labels, assignees, comments, updatedAt) was identical before and after.
- a9: a fresh agent drafted #90's report from the issue's facts with the title `plan-lifecycle:plan-manager: reopening immediately after a partial merge can leave the plan issue unreadable` and every template section; the private repository name, the plan title, and the issue number from #90 are absent. Pass.
- a10: pending (pull request checks).
