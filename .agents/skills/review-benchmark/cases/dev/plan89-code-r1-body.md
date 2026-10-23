<!-- plan-contract: v4 -->

## Goal

Find and implement code optimizations that make the gate and the plan-lifecycle helper faster on top of the Bun switch (#87). Prove each gain with before and after measurements.

Scope: the gate's scheduling in `scripts/ci.mjs`, the slowest suites it runs (`scripts/tests/plan-cli.mjs` and the unit tests), the CI workflow, and the shipped `plan.mjs` where an optimization lowers consumer latency without changing its contract. Keep the coverage and semantics of every check.

Yolo: the user delegated every decision except the merge to the agent.

Mode: plan-and-implement

## Research

### Where the time goes now

- Hosted baseline: a `workflow_dispatch` run on `main` at the #88 merge (run 39885296173) passed; its full gate took 29.9 s. `node scripts/tests/plan-cli.mjs` took 17.8 s (59%), `bun run test:unit` 6.6 s, `bun scripts/tests/ci-plugin-targeting.mjs --unit` 2.0 s, and `bun scripts/tests/ci-observability.mjs` 1.5 s. Every other command took less than 0.5 s. This run also covered the dispatch leg that the #88 pull request did not run.
- Local baseline (20 cores, Node v24.22.1, Bun 1.4.4, medians of the gate's own `total_ms`): `--plugin plan-lifecycle` 13.7 s, `--plugin docks` 13.8 s, `--lane repo` 9.45 s, full gate 23.8 s.
- `scripts/tests/plan-cli.mjs` (12.4 s serial on a quiet machine) is one top-level script with about 32 cases that share one scratch git repository and one fake-gh state file. One run starts 198 `plan.mjs` processes and 414 fake-gh processes; the spawns take 12.7 s of 13.05 s. Only one case depends on an earlier one: the status-transitions case reuses the `frozen` plan of the frozen-steps case. A prototype that runs the 44 cases as isolated units passed every time: 3.5 s with 4 workers and 2.1 s with 8 workers, against 12.4 s serial (quiet machine; logs in `$(git rev-parse --git-path docks-review)/yolo-89/PlanCliCost/`).
- `bun run test:unit` (6.43 s on 4 cores) is bound by one file. `scripts/tests/unit/ci-background-task.test.mjs` takes 6.42 s because two tests block in turn inside one worker: a 3000 ms busy loop for the pipe-backpressure test and a 2500 ms busy loop for the blocked-lifetime test. The vacuity files run 7 and 4 real gates one after another (about 0.28 s each). The prototype that combines decisions 3 to 6 ran 72 of 72 tests in 1.72 s on 4 cores (3 runs; logs in `$(git rev-parse --git-path docks-review)/yolo-89/UnitSuiteCost/`).
- The shipped `plan.mjs` makes 4 gh calls for each write (`edit`, `status`, `step`, `archive`) and 5 for `retire`: a snapshot `gh api graphql`, a pre-write `gh issue view`, `gh issue edit`, and a read-back `gh issue view`. `list` makes 2 (a repository lookup and `gh issue list`). Internally, `gh issue edit` first looks the issue up, and it looks up repository metadata when labels or assignees change, so one write sends about 5 to 6 HTTP requests. On this machine one `gh api graphql` call took about 380 ms and one `gh issue view` 430 to 470 ms (log: `$(git rev-parse --git-path docks-review)/yolo-89/gh-calls/`).

### Decisions

1. Run the plan-CLI cases in parallel through Node's test runner. Move the cases into node:test files under `scripts/tests/plan-cli/`. Each `test()` gets its own context from a shared harness: a fresh scratch git repository, a fake-gh state file seeded with the five plan labels, and its own environment. The frozen-steps and status-transitions cases become one test. `scripts/tests/plan-cli.mjs` stays the suite entry, so the gate invocation, the targeting call counts, the test-contract registry entry, and the validator-table row do not change. The entry runs `node --test --test-concurrency=<os.availableParallelism()> <case files>` and exits with its status. Node's runner gives each file its own process ("each matching test file is executed in a separate child process", https://nodejs.org/docs/latest-v24.x/api/test.html#test-runner-execution-model). Runtime stays Node, so `plan.mjs` is still proven on the consumer runtime (#87). Rejected: an async pool inside one file, because every one of the 198 `run()` calls would need `await`, and a missed `await` could turn an assertion into a no-op. Rejected: a bespoke worker runner inside `plan-cli.mjs`, because Node's runner already gives isolation, concurrency, and reporting.
2. Teach the validator table walker in `scripts/tests/author-tooling.mjs` (`validatorTableErrors`) to skip `scripts/tests/plan-cli/`, as it already skips `scripts/tests/unit/`: the files run as one suite through the `scripts/tests/plan-cli.mjs` row. `test:coverage` runs the case files directly with `node --test --experimental-test-coverage`. Node passes `NODE_V8_COVERAGE` to child processes (https://nodejs.org/docs/latest-v24.x/api/cli.html#node_v8_coveragedir), so `plan.mjs` coverage stays measurable.
3. Replace the busy-loop blockers in the background-task tests with sleeping children (`setTimeout`). `spawnSync` itself freezes the parent's event loop (the synchronous methods "will block the Node.js event loop, pausing execution of any additional code until the spawned process exits", https://nodejs.org/docs/latest-v24.x/api/child_process.html#synchronous-process-creation), so the busy loop adds nothing but CPU starvation. Commit 692c0617 records a flake from that starvation.
4. Shorten the two blocking windows and keep their margins. Blocked lifetime: a 300 ms child behind a 1000 ms block, assert at least 950 ms awaited, keep the 250 ms tolerance. Pipe backpressure: a 1500 ms block, a 750 ms threshold, best of 3. The writer took at most 190 ms under 4-core load, so 750 ms leaves about 4x margin. A mutant `startTask` that relays the child's pipes and times the await failed every shortened variant. Rejected: tighter values (700/300 ms), because the margin drops to 1.6x.
5. Move the two blocker tests into their own files, `ci-background-task-blocked-lifetime.test.mjs` and `ci-background-task-pipe-backpressure.test.mjs`, so that Bun's parallel runner can place them on different workers, and register both files in `scripts/config/test-contracts.json` like the other unit files.
6. In both vacuity files, start every gate when the module loads with async `spawn` and let each test await its own result. The assertions and per-test reporting stay the same.
7. Cut gh round trips in the shipped `plan.mjs` without changing its contract. (a) Each write sends one `gh api graphql` request. Its first mutation is `updateIssue` with the new body and, for a claim, `assigneeIds` (the assignees from the pre-write read plus the acting login), so the body and the claim are one mutation, as the contract's same-write claim requires (`UpdateIssueInput` has `body` and `assigneeIds`, "The Node ID of assignees for this issue", https://docs.github.com/en/graphql/reference/issues). Label repair follows in the same request as discrete `addLabelsToLabelable` and `removeLabelsFromLabelable` mutations (same reference page), because a full `labelIds` replacement would drop a label added concurrently; gh does the same on purpose (cli/cli `pkg/cmd/pr/shared/editable_http.go`, `UpdateIssue`: "Labels are updated through discrete mutations to avoid having to replace the entire list of labels and risking race conditions"). The mutation fields run serially (https://spec.graphql.org/October2021/: the mutation "selection set should be executed serially"). The last mutation selects the stored body and labels, which replace the read-back `gh issue view`; the post-write body and label checks, the same ones as today, catch a partial result. Today's helper is not atomic either: gh sends the label additions, the label removals, and the body update as parallel requests. The pre-write `gh issue view` stays and also reads `labels` and `assignees`, because the contract says "Read the issue again before each write" and a plan-CLI case tests the race. The body travels as `-F body=@<file>` from the existing `withBodyFile`: gh returns the bytes of an `@` file unchanged, while any other `-F` value gets type conversion and `{owner}`, `{repo}`, `{branch}`, `:owner`, `:repo`, and `:branch` placeholder filling (cli/cli `pkg/cmd/api/fields.go`, `magicFieldValue`; https://cli.github.com/manual/gh_api). So a body that quotes such a token is stored as written, as with today's `--body-file`, and the body stays out of the command arguments. A phase label that a status write needs and the repository lacks is created with `gh label create`, as `new` does, and then looked up. (b) `list` reads the repository name and the plan issues in one paged GraphQL query instead of a repository lookup plus `gh issue list`. Expected counts: 3 gh calls for each write, 4 for `retire`, and 1 for `list` when the repository has at most 100 plan issues, plus one page call per further 100 up to the 500-plan cap (`gh issue list` also pages internally). Refusal strings stay the same. GitHub failures keep the contract's two forms, `gh <command> <subcommand> failed: ...` and `gh api graphql returned errors: ...`. Because only shipped `scripts/` change, step 3 bumps `metadata.updated` in `plan-manager/SKILL.md`, as `plugins/plan-lifecycle/skills/AGENTS.md` requires.
8. Rejected: overlapping gate checks in `scripts/ci.mjs`. After decisions 1 to 6, the estimated sequential repo lane is about 4.7 s and the full gate about 8.6 s, so overlap would save about 2 to 4 s. It would touch the timing schema, the phase and task assertions in `scripts/tests/ci-plugin-targeting.mjs`, the test-contract discovery of `node([`/`bun([` calls, and the inline failure reporting.
9. Rejected: Node's compile cache. `node plan.mjs` took 25.7 ms without it and 25.0 ms with it; `plan.mjs` code is only about 2 ms of its start.
10. Rejected: seeding plan fixtures straight into the fake-gh state instead of running `new`. It saved 21% serial time in the prototype, but it would tie fixtures to the stub's issue format, and with decision 1 it would save under 1 s.
11. Rejected: `retire` closing the issue inside the same mutation request, because a label mismatch would no longer stop the close. Rejected: dropping the pre-write read or the post-write check, because the contract requires both. Rejected: one `updateIssue` with a full `labelIds` list, because it would add the lost-update race that gh avoids (decision 7).

### Request corrections

Asked: the Goal's scope names the gate's scheduling in `scripts/ci.mjs` and the CI workflow. Did: no change to either. Reason: decision 8; the workflow already runs the gate in parallel shards, and the gains come from the suites.

### Engineering standards

- Step 1 `unit_suite_windows`: `test-coverage` principles (every assertion still fails when its behavior regresses; checked with the pipe-relaying mutant), `code-clarity`, `commit-discipline`.
- Step 2 `plan_cli_parallel`: `test-coverage` principles (no case lost: the per-test count and `plan.mjs` coverage stay the same or rise), `code-clarity`, `commit-discipline`.
- Step 3 `plan_helper_round_trips`: `code-clarity` (the mutation request names the guarantee it keeps), `commit-discipline`.
- Before code review round 1: `code-review` self-review with `code-clarity`.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | unit_suite_windows | Cut the unit suite's critical path (decisions 3 to 6): sleeping blockers, the shorter windows, the two blocker tests in their own registered files, and gates started at module load in both vacuity files; update the verify note at the top of `scripts/lib/ci-background-task.mjs` | scripts/tests/unit/ci-background-task.test.mjs, scripts/tests/unit/ci-background-task-blocked-lifetime.test.mjs, scripts/tests/unit/ci-background-task-pipe-backpressure.test.mjs, scripts/tests/unit/agent-score-vacuity.test.mjs, scripts/tests/unit/skill-score-vacuity.test.mjs, scripts/config/test-contracts.json, scripts/lib/ci-background-task.mjs | - | local | done | `bun run test:unit` reports 72 pass, 0 fail across 9 files; `taskset -c 0-3 bun run test:unit` finishes in at most 2.5 s; with a copy of `scripts/lib/ci-background-task.mjs` whose launcher relays the child's pipes and times the await, both blocker tests fail; `bun scripts/tests/test-contracts.mjs` passes |
| 2 | plan_cli_parallel | Split `scripts/tests/plan-cli.mjs` into node:test case files under `scripts/tests/plan-cli/` with a shared per-test harness, keep `scripts/tests/plan-cli.mjs` as the entry that runs them through `node --test` in parallel, skip the directory in the validator-table walker, point `test:coverage` at the case files, and update the `scripts/AGENTS.md` rows (decisions 1 and 2) | scripts/tests/plan-cli.mjs, scripts/tests/plan-cli/, scripts/tests/author-tooling.mjs, scripts/AGENTS.md, package.json | - | local | done | `node scripts/tests/plan-cli.mjs` exits 0 and reports at least one `test()` per former case; `taskset -c 0-3 node scripts/tests/plan-cli.mjs` finishes in at most 5 s; `bun run test:coverage` reports at least 99% line coverage for `plan.mjs`; `bun scripts/tests/author-tooling.mjs` passes |
| 3 | plan_helper_round_trips | Send each `plan.mjs` write as one GraphQL request whose first mutation, `updateIssue`, carries the body (as `-F body=@<file>`) and any claim, followed by discrete label mutations, and verify from the returned stored state; read `list` in one paged GraphQL query (decision 7); make the fake gh handle the new mutations and query and mirror gh's `-F` value handling (an `@` file is read verbatim; any other value gets type conversion and placeholder filling); update the plan-CLI cases whose expected gh command or message changes; bump `metadata.updated` in `plan-manager/SKILL.md` | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, scripts/tests/fixtures/gh-stub/gh, scripts/tests/plan-cli/ | 2 | local | done | `node scripts/tests/plan-cli.mjs` exits 0; a plan-CLI case edits a body that quotes `{owner}`, `{repo}`, `{branch}`, and `:owner` and reads it back unchanged; a logged plan-CLI run shows 3 gh calls for each successful `edit`, `status`, `step`, and `archive`, 4 for `retire`, and 1 for `list` (5 for the 500-plan case); `plan-contract.md` needs no change; `plan-manager/SKILL.md` `metadata.updated` names the change date and `bun scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills` passes |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| a1 | `bun run test:unit` | 72 pass, 0 fail, across 9 files |
| a2 | `node scripts/tests/plan-cli.mjs` | exits 0 |
| a3 | `bun run test:coverage` | runs under Node and reports at least 99% line coverage for `plan.mjs` |
| a4 | `bun scripts/ci.mjs` | exits 0 for the repo-wide checks and both plugins (root `AGENTS.md`: the full gate for repo-wide and multi-plugin changes) |
| a5 | `bun scripts/tests/ci-plugin-targeting.mjs` | exits 0 (the non-unit targeting contract, `.github/AGENTS.md`) |
| a6 | Three interleaved runs each, `origin/main` in a temporary worktree against the branch, of `bun scripts/ci.mjs --plugin plan-lifecycle`, `--lane repo`, and the full gate, comparing the gate's `total_ms` | branch medians at least 60% lower for `--plugin plan-lifecycle`, 35% lower for `--lane repo`, and 45% lower for the full gate |
| a7 | `taskset -c 0-3 bun run test:unit` and `taskset -c 0-3 node scripts/tests/plan-cli.mjs` | at most 2.5 s and 5 s |
| a8 | The branch's `plan.mjs` runs this plan's own routine lifecycle commands on #89 (`list`, `show`, `export`, `edit`, `step`) with a logging `gh` wrapper first on PATH | every command succeeds; each write logs 3 gh calls and `list` logs 1 |
| a9 | pull request checks | every check passes |

## Do not touch

- The plan contract and its refusal strings in `plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md`, the pre-write read, the post-write check, the `retire` close order, and `new`.
- The runtime split from #87: `plan.mjs` and the plan-CLI suite run on Node; author tooling runs on Bun.
- Check scheduling in `scripts/ci.mjs` and `.github/workflows/ci.yml` (decision 8).
- Plugin versions, manifests, and marketplace catalogs. This plan makes no release.
- `docs/` point-in-time records.

## Open questions

## Verification Results

Local runs: Linux x64, 20 cores, Node v24.22.1, Bun 1.4.4. Node test runs set `TMPDIR` to a directory in the review scratch, because a stray `package.json` with `"type": "commonjs"` at the root of this workstation's system temporary directory makes Node load the tests' extensionless ESM shims as CommonJS (recorded in #87).

### Step 1 `unit_suite_windows` (commit `1d2b35e8`)

- `bun run test:unit`: 72 pass, 0 fail, across 9 files.
- `taskset -c 0-3 bun test --parallel=4 --timeout=180000 ./scripts/tests/unit/*.test.mjs`, 3 runs: 1724, 1726, and 1704 ms (before: 6.43 s three times).
- Mutant check: the two blocker test files, pointed at a `startTask` that relays the child's pipes and times the await, fail both tests (blocked lifetime and pipe backpressure); pointed at the real library, both pass.
- The commit passes on its own in a temporary worktree: unit suite 72 of 72, `bun scripts/tests/test-contracts.mjs` (`contracts=17`), the old serial `node scripts/tests/plan-cli.mjs`, and biome.

### Step 2 `plan_cli_parallel` (commit `5efaf4ef`)

- `node scripts/tests/plan-cli.mjs`: 45 tests, 45 pass (44 former cases plus a new `list` order case).
- `taskset -c 0-3 node scripts/tests/plan-cli.mjs`, 3 runs: 3956, 3925, and 3844 ms (before: 12.4 s serial).
- `bun run test:coverage`: `plan.mjs` 996 of 1006 lines, the same as before. Branch coverage moved from 282/371 to 280/369: the old shared state reached `statusFromIssue` with a different mix of issues. No assertion was dropped. The new `list` order case restores the `COMPLETED` branch and the sort over mixed open and closed plans.
- `bun scripts/tests/author-tooling.mjs`, `bun scripts/tests/test-contracts.mjs`, and `bun scripts/tree/guard.mjs`: pass.

### Step 3 `plan_helper_round_trips` (commits `267482e5`, `21e0faec`)

- `node scripts/tests/plan-cli.mjs`: 47 tests, 47 pass. The two new cases: an `edit` whose body quotes `{owner}`, `{repo}`, `{branch}`, `:owner`, and `:repo` reads back unchanged; a status write on a repository that lacks `plan:planned` creates the label and applies it.
- gh calls per successful command in a logged plan-CLI run: `edit` 3 (24 runs), `status` 3 (9 runs; 5 when labels page or the phase label is created), `step` 3, `archive` 3 (4 when closers page), `retire` 4, `list` 1 (5 for the 500-plan case), `show` and `export` 1, `new` 2. Before: 4 for each write, 5 for `retire`, 2 for `list`.
- `bun run test:coverage`: `plan.mjs` 99.54% lines, 78.06% branches.
- `bun scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills`: pass; `plan-manager/SKILL.md` `metadata.updated` is 2026-10-23.
- Real GitHub, through the branch helper with a logging `gh` wrapper (a8): on this issue, `list` 1 call, `show` 1, `export` 1, `edit` 3, `step` 3, all successful, and the `list` output matches the released helper line for line. Throwaway probe issues #91, #92, and #93 exercised `status` with a claim, `edit`, `step`, and `retire`: 3 calls for each write and 4 for `retire`; the claim, the phase labels, and a body quoting `{owner} {repo} {branch} :owner :repo :branch` were stored correctly. The probes are closed as not planned, and their `plan` label is removed, so `list` does not show them.
- Real GitHub timing, medians: a `status` write took 3229 ms of gh time with the released helper (4 calls; `gh issue edit` alone 1895 ms) and 2759 ms with the branch helper (3 calls; the mutation 1721 ms). `list` took 1.10 to 1.42 s with the released helper and 0.51 to 0.78 s with the branch helper (5 runs each).
- Self-review findings (3 LOW) are fixed in `21e0faec`; plan review round 5 passed the one Research sentence that changed with it.

### Acceptance (final tree `21e0faec`)

- a1 `bun run test:unit`: 72 pass, 0 fail, across 9 files.
- a2 `node scripts/tests/plan-cli.mjs`: exit 0, 47 of 47.
- a3 `bun run test:coverage`: runs `node --test --experimental-test-coverage`; `plan.mjs` 99.54% lines.
- a4 `bun scripts/ci.mjs`: exit 0, status `passed`, `total_ms` 7313. It also passes without the `TMPDIR` setting (7697 ms): since #88 the unit tests run on Bun, so the stray `package.json` in the system temporary directory no longer affects the gate.
- a5 `bun scripts/tests/ci-plugin-targeting.mjs`: exit 0.
- a6 `python3 "$(git rev-parse --git-path docks-review)/yolo-89/bench/compare.py" <origin-main-worktree> 3 <gate-args>`, both sides on Bun, three interleaved runs each, medians of the gate's own `total_ms` (measured at `267482e5`; `21e0faec` changes no runtime path):

| Gate | `origin/main` | Branch | Change |
|---|---:|---:|---:|
| `--plugin plan-lifecycle` | 12.92 s | 2.54 s | -80.4% |
| `--lane repo` | 9.33 s | 4.44 s | -52.4% |
| full gate (`-q`) | 22.41 s | 7.25 s | -67.7% |

- a7 `taskset -c 0-3`, 3 runs: `bun run test:unit` 1730, 1739, and 1723 ms; `node scripts/tests/plan-cli.mjs` 4188, 4080, and 4124 ms.
- a8: see Step 3 (real GitHub runs).
- a9 pull request checks: pending.
- `bun run check:js`: exit 0 with 7 warnings and 3 infos, the same counts as on `main`.
- The #88 runtime switch on `main`: a `workflow_dispatch` run at merge commit `37852a89` (run 39885296173) passed, which covers the dispatch leg that #88's pull-request CI did not run. The release-tag legs (`bun scripts/ci-target.mjs release-tag`, then `bun scripts/ci.mjs --lane repo` and `--plugin`) first run on the next release tag.
