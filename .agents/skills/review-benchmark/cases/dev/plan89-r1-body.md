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
7. Cut gh round trips in the shipped `plan.mjs` without changing its contract. (a) Each write sends one `gh api graphql` request whose mutations run in order (https://spec.graphql.org/October2021/: a mutation's top-level "selection set should be executed serially"): `updateIssue` for the body, `addLabelsToLabelable` and `removeLabelsFromLabelable` for label repair, and `addAssigneesToAssignable` for a claim (https://docs.github.com/en/graphql/reference/mutations). The response returns the stored body, labels, and assignees, which replaces the read-back `gh issue view`. The pre-write `gh issue view` stays, because the contract says "Read the issue again before each write" and a plan-CLI case tests the race. A phase label that a status write needs and the repository lacks is created with `gh label create`, as `new` does. (b) `list` reads the repository name and the plan issues in one paged GraphQL query instead of a repository lookup plus `gh issue list`. Expected counts: 3 gh calls for each write, 4 for `retire`, 1 for `list`. Refusal strings stay the same. GitHub failures keep the contract's two forms, `gh <command> <subcommand> failed: ...` and `gh api graphql returned errors: ...`.
8. Rejected: overlapping gate checks in `scripts/ci.mjs`. After decisions 1 to 6, the estimated sequential repo lane is about 4.7 s and the full gate about 8.6 s, so overlap would save about 2 to 4 s. It would touch the timing schema, the phase and task assertions in `scripts/tests/ci-plugin-targeting.mjs`, the test-contract discovery of `node([`/`bun([` calls, and the inline failure reporting.
9. Rejected: Node's compile cache. `node plan.mjs` took 25.7 ms without it and 25.0 ms with it; `plan.mjs` code is only about 2 ms of its start.
10. Rejected: seeding plan fixtures straight into the fake-gh state instead of running `new`. It saved 21% serial time in the prototype, but it would tie fixtures to the stub's issue format, and with decision 1 it would save under 1 s.
11. Rejected: `retire` closing the issue inside the same mutation request, because a label mismatch would no longer stop the close. Rejected: dropping the pre-write read or the post-write check, because the contract requires both.

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
| 1 | unit_suite_windows | Cut the unit suite's critical path (decisions 3 to 6): sleeping blockers, the shorter windows, the two blocker tests in their own registered files, and gates started at module load in both vacuity files; update the verify note at the top of `scripts/lib/ci-background-task.mjs` | scripts/tests/unit/ci-background-task.test.mjs, scripts/tests/unit/ci-background-task-blocked-lifetime.test.mjs, scripts/tests/unit/ci-background-task-pipe-backpressure.test.mjs, scripts/tests/unit/agent-score-vacuity.test.mjs, scripts/tests/unit/skill-score-vacuity.test.mjs, scripts/config/test-contracts.json, scripts/lib/ci-background-task.mjs | - | local | planned | `bun run test:unit` reports 72 pass, 0 fail across 9 files; `taskset -c 0-3 bun run test:unit` finishes in at most 2.5 s; with a copy of `scripts/lib/ci-background-task.mjs` whose launcher relays the child's pipes and times the await, both blocker tests fail; `bun scripts/tests/test-contracts.mjs` passes |
| 2 | plan_cli_parallel | Split `scripts/tests/plan-cli.mjs` into node:test case files under `scripts/tests/plan-cli/` with a shared per-test harness, keep `scripts/tests/plan-cli.mjs` as the entry that runs them through `node --test` in parallel, skip the directory in the validator-table walker, point `test:coverage` at the case files, and update the `scripts/AGENTS.md` rows (decisions 1 and 2) | scripts/tests/plan-cli.mjs, scripts/tests/plan-cli/, scripts/tests/author-tooling.mjs, scripts/AGENTS.md, package.json | - | local | planned | `node scripts/tests/plan-cli.mjs` exits 0 and reports at least one `test()` per former case; `taskset -c 0-3 node scripts/tests/plan-cli.mjs` finishes in at most 5 s; `bun run test:coverage` reports at least 99% line coverage for `plan.mjs`; `bun scripts/tests/author-tooling.mjs` passes |
| 3 | plan_helper_round_trips | Send each `plan.mjs` write as one ordered GraphQL mutation request that returns the stored state, and read `list` in one paged GraphQL query (decision 7); teach the fake gh the new mutations and query, and update the plan-CLI cases whose expected gh command or message changes | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/fixtures/gh-stub/gh, scripts/tests/plan-cli/ | 2 | local | planned | `node scripts/tests/plan-cli.mjs` exits 0; a logged plan-CLI run shows 3 gh calls for each successful `edit`, `status`, `step`, and `archive`, 4 for `retire`, and 1 for `list`; `plan-contract.md` needs no change |

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
