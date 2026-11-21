<!-- plan-contract: v4 -->

## Goal

Decide from measurements whether the repository's own `.mjs` tooling and the plan-lifecycle plugin's `.mjs` files should run on the Bun 1.4.4 runtime instead of Node 24. Make the faster runtime that passes the same gates the one that local commands and CI use.

Scope: author-side scripts under `scripts/` and `tests/`, the package scripts in `package.json`, the CI workflows, the instructions that name the validator runtime, and the plan-lifecycle helper `plan.mjs` and its self-test. Compare both runtimes on process startup, each validator, the unit suite, and the gates, and record the numbers.

Yolo: the user delegated every decision except the merge to the agent.

Mode: plan-and-implement

## Research

### How the scripts run today

- Every script runs as `node <file>`. `package.json` scripts `ci`, `guard:skills`, `score:skills`, `test:observability`, and `test:contracts` call `node`. `test:unit` is `node --test --test-concurrency=4 scripts/tests/unit/*.test.mjs`. `test:coverage` is `node --test --experimental-test-coverage` over `scripts/tests/plan-cli.mjs`.
- `scripts/ci.mjs` - `node()` and `nodeOk()` - spawn a literal `node` for every sub-check. `scripts/skills/guard.mjs` - `run()` - and `scripts/lib/plugin-release.mjs` - `runSelectedCi()` - also spawn a literal `node`. Tests spawn `process.execPath`.
- Tests intercept gate children by command name through PATH shims: `scripts/tests/ci-plugin-targeting.mjs` - `writeCiProbeShim()`, `writeReleaseShim()` - and the `writeShim()` helpers in `scripts/tests/unit/agent-score-vacuity.test.mjs` and `scripts/tests/unit/skill-score-vacuity.test.mjs`.
- `scripts/tests/test-contracts.mjs` - `gateInvocationArguments()` - finds gate suites by matching `node(...)`/`nodeOk(...)` calls in `scripts/ci.mjs`, and `unitDescriptors()` reads the `test:unit` command.
- `.github/workflows/ci.yml` sets up Node 24 and Bun, runs `node scripts/ci.mjs`, `node scripts/ci-target.mjs`, `node scripts/tests/ci-plugin-targeting.mjs`, `node node_modules/@anthropic-ai/claude-code/install.cjs`, and `npm audit signatures`. `resolve-shards` installs no Bun.
- `package.json` pins `packageManager: bun@1.4.0`. The workflows give setup-bun no `bun-version`, so CI installs 1.4.0. Plan #12 moved the package manager to Bun and kept the Node runtime out of scope.
- Shipped to consumers: `plan.mjs` (`plan-contract.md`: "Run `node <installed-helper> <command>`"), `plugins/docks/hooks/context-tree-nudge.mjs` (`hooks.json`: `node "${CLAUDE_PLUGIN_ROOT}/hooks/context-tree-nudge.mjs"`), and `skill-guard.mjs` (`write-skill/SKILL.md`: `node <write-skill-dir>/scripts/skill-guard.mjs`). The gate exercises `plan.mjs` only through `scripts/tests/plan-cli.mjs`, which spawns it with `process.execPath`, and it calls `plan.mjs` through the fake `gh` in `scripts/tests/fixtures/gh-stub/gh` (a `#!/usr/bin/env node` script).

### Measurements

Linux x64, 20 cores, Node v24.22.1, Bun 1.4.4. Each value is the median of interleaved runs, with the start runtime rotated each round. Command: `python3 "$(git rev-parse --git-path docks-review)/yolo-87/bench/bench.py" startup scripts unit gates`. "Whole tree" puts a `node` symlink to `bun` first on PATH, which is what `bun --bun run` does.

| Command (30 runs startup, 10 runs scripts) | Node ms | Bun ms | Ratio |
|---|---:|---:|---:|
| empty script `-e 0` | 21 | 5 | 4.4x |
| `plan.mjs` usage error (no `gh` call) | 33 | 15 | 2.2x |
| `context-tree-nudge.mjs` hook | 22 | 12 | 1.8x |
| `scripts/config/read-floor.mjs agents` | 22 | 6 | 3.6x |
| `scripts/agents/guard.mjs` | 23 | 7 | 3.3x |
| `scripts/agents/score.mjs --per-file` | 23 | 8 | 3.1x |
| `scripts/tree/guard.mjs` | 37 | 13 | 2.7x |
| `scripts/skills/durable-anchors.mjs` | 47 | 20 | 2.4x |
| `scripts/plans/no-bespoke-gates.mjs` | 42 | 14 | 2.9x |
| `skill-guard.mjs score --per-file` | 29 | 13 | 2.3x |
| `scripts/skills/guard.mjs` (spawns three children) | 133 | 57 whole tree, 112 parent only | 2.3x |

| Unit suite (3 runs) | Median | Result |
|---|---:|---|
| `node --test --test-concurrency=4` | 6.62 s | 72 pass |
| `bun test` (one shared process) | 10.37 s | 69 pass, 3 fail (RC2) |
| `bun test --parallel=4` | 6.44 s | 69 pass, 3 fail (RC2) |

| `ci.mjs --plugin <name>` (3 runs) | Node | Bun parent, `node` children | Bun whole tree |
|---|---:|---:|---:|
| plan-lifecycle | 19.46 s | 19.76 s | 9.71 s |
| docks | 20.41 s | 19.93 s | 9.39 s |

The gate's `--timings-json` shows where the time goes. `scripts/tests/plan-cli.mjs` takes 18.7 s of the 19.4 s Node plan-lifecycle gate and 9.2 s of the 9.7 s whole-tree Bun gate. All other plan-lifecycle commands sum to 0.49 s on Node and 0.21 s on Bun; docks: 0.69 s and 0.35 s. `claude plugin validate` takes 0.24 s on both.

| `plan-cli.mjs` (3 runs): `plan.mjs` runtime | fake `gh` runtime | Median |
|---|---|---:|
| Node | Node | 19.50 s |
| Node | Bun | 13.55 s |
| Bun | Node | 15.37 s |
| Bun | Bun | 9.06 s |

### Compatibility

Every entry point that `scripts/ci.mjs` runs for the docks, plan-lifecycle, and repo lanes was run three ways (Node, Bun parent, whole tree on Bun), and the hook was run with five inputs. All outputs are byte-identical except the five root causes below and measured-time values. The docks and plan-lifecycle gates exit 0 on all three. Logs: `$(git rev-parse --git-path docks-review)/yolo-87/compat/`.

- RC1: `scripts/tests/author-tooling.mjs` - `testSkillsGuardSpawnFailure()` - expects Node's spawn error text `spawnSync node ENOENT`. Bun prints `Executable not found in $PATH: "node"`. `error.code` is `ENOENT` on both.
- RC2: `scripts/tests/unit/agent-score-vacuity.test.mjs` - `runCi()` - loads its fixture through `NODE_OPTIONS=--import=<hook>`. Bun ignores `--import` in `NODE_OPTIONS`, so three tests fail. The command-line flag works on both: Bun 1.4.4 `bun --help` lists "`--import=<val>` Alias of --preload, for Node.js compatibility".
- RC3: `test:unit` needs Node's `node --test` runner mode, which Bun does not have. With `node` aliased to Bun, it exits 1 and runs no test, so the failure is loud.
- RC4: `scripts/tests/unit/tag-ci-run-identity.test.mjs` sets `process.env.PATH` at module scope and cleans up only on process `exit`. `bun test` runs several files in one process, so the stub PATH leaks into later files. Results are unchanged today.
- RC5: Bun coverage does not count lines that run in child processes: `plan.mjs` line coverage is 22.34% under `bun test --coverage` and 99.01% under Node.

### Decisions

1. Run the repository's author tooling on Bun: `scripts/**`, `tests/**`, `plugins/plan-lifecycle/test/selftest.mjs`, and the fake `gh` fixture. Each process starts 2-4x faster, and the outputs are identical. Rejected: keep Node (it gives up the measured gate and startup gains).
2. Keep shipped consumer payload on Node, in consumer instructions and in the gate: `plan.mjs` through `scripts/tests/plan-cli.mjs`, the `skill-guard.mjs` scorer, and the hook. Consumers invoke these with `node` (repo facts above). The Claude Code native installer needs no Node and documents no Bun for hooks; hook commands run through `sh -c`. Codex is a Rust binary with no runtime requirement. Rejected: run `plan.mjs` on Bun in the gate. It would save 4.5 s more per plugin gate (13.55 s to 9.06 s), but CI would then stop proving `plan.mjs` on the runtime that consumers use. Rejected: require Bun from consumers.
3. Run the fake `gh` (`scripts/tests/fixtures/gh-stub/gh`) on Bun through its shebang. It is author-side test infrastructure, and it removes 6 s from every `plan-cli.mjs` run while `plan.mjs` stays on Node.
4. Select each runtime explicitly by command name. `scripts/ci.mjs` runs author scripts as `bun <script>` and shipped payload as `node <script>`, through runners named for their runtime: `bun()`/`bunOk()` and `node()`/`nodeOk()`. Rejected: `bun --bun run` or `bunfig.toml` `[run] bun = true`. Either makes every `node` in the process tree mean Bun, so the gate could not run shipped payload on Node, and `test:coverage` would move to Bun without notice. `bun <file>` does not alias at all (local probe). Rejected: `process.execPath` for gate children, because the PATH shims that the tests use to intercept children work by command name.
5. Run unit tests with `bun test --parallel=4 --timeout=180 ./scripts/tests/unit/*.test.mjs`. The speed is equal (6.44 s and 6.62 s), and the tooling's unit tests then run on the runtime that runs the tooling. `--parallel` gives worker processes and a fresh global per file. Bun's default per-test timeout is 5 s and Node's is unlimited. `bun test --timeout` takes seconds, so the command sets 180, the longest child timeout (180 s) that the unit tests use. A `node:test` API that Bun lacks throws, so the suite fails loudly (probe). Rejected: plain `bun test` (one shared process, 10.37 s). Rejected: keep `node --test` (the unit tests would exercise the tooling on a runtime it no longer uses).
6. Keep `test:coverage` on Node. Bun coverage cannot see child processes (RC5), and `plan.mjs` is consumer payload (decision 2).
7. Pin the Bun runtime at 1.4.4 in `package.json` `engines.bun`. `packageManager` stays `bun@1.4.0`: it records the package manager that plan #12 chose, and this plan changes only the runtime. When the workflow gives no `bun-version`, setup-bun reads `engines.bun` first and falls back to `packageManager`. Bun 1.4.3 fixed `node:child_process` regressions from 1.4.0: truncated pipe data, a `spawnSync` that never returned, and lost output. The gate depends on these paths.
8. CI: the gate jobs keep setup-node, because shipped-payload contracts, `npm audit signatures`, and the claude-code `install.cjs` need Node. They run `bun scripts/ci.mjs`, `bun scripts/ci-target.mjs release-tag`, and `bun scripts/tests/ci-plugin-targeting.mjs`. `resolve-shards` keeps `node scripts/ci-target.mjs shards`: `.github/AGENTS.md` states that this job "needs only a checkout and Node", every shard waits on it, and adding setup-bun there would cost more than the 15 ms of startup it saves [INFERENCE: setup cost not measured].
9. Shebangs: author entry points and the fake `gh` use `#!/usr/bin/env bun`. `scripts/tests/plan-cli.mjs` keeps `#!/usr/bin/env node`, because it proves `plan.mjs` on Node. Shipped files keep `#!/usr/bin/env node`.
10. Fix RC1, RC2, and RC4 first, so that each suite passes on both runtimes before the switch. RC1: the guard prints `error.code` with the runtime's message. RC2: pass the hook as a `--import=<hook>` argument. RC4: restore `PATH` and remove the stub root in `test.after`.
11. Docs: update the author instructions that name the runtime or tell a reader to run author scripts. In shipped `write-skill/SKILL.md`, change only the three commands that run this kit's own gate, then backfill its `content_hash`. Leave `docs/` point-in-time records unchanged, as `docs/AGENTS.md` requires.

Expected result: about 14 s for each plugin gate instead of 19.5 s (about -28%): the `plan-cli.mjs` split gives 13.55 s, and the other commands save 0.3 s. Repo-lane suites also start faster.

### Request corrections

Asked: make "our .mjs scripts actually use bun runtime ... for both plan-lifecycle and scripts from the repo itself". Did: the repository's author tooling, the plan-lifecycle self-test, and the fake `gh` move to Bun. The shipped plan-lifecycle helper `plan.mjs`, the docks hook, and the shipped `skill-guard.mjs` scorer stay on Node, and the gate keeps proving them on Node. Reason: consumers invoke these files with `node`, and no agent host documents Bun on PATH (decision 2).

### Engineering standards

- Step 1 `runtime_neutral_tests`: `fix-workflow` (the Bun repro commands are the feedback loop; each fix has a revert trigger: the suite that it repairs), `code-clarity`, `commit-discipline`.
- Step 2 `author_tooling_on_bun`: `code-clarity` (runner names state their runtime; one comment states why shipped payload runs on Node; every rerun hint names the command that the gate ran), `commit-discipline`.
- Step 3 `runtime_docs`: `code-clarity` (docs keep the rationale for the runtime split), `commit-discipline`.
- Before code review round 1: `code-review` self-review with `code-clarity`.

### Sources

- https://bun.com/docs/runtime/bunfig#run-bun - "When `true`, Bun prepends `$PATH` with a `node` symlink that points to the `bun` binary"; it works recursively.
- https://bun.com/docs/runtime - "`--bun` Force a script or package to use Bun's runtime instead of Node.js (via symlinking node)."
- https://bun.com/docs/runtime/nodejs-compat#node-test - `node:test` is partial; missing "code coverage" and "Node's `--test` CLI runner mode".
- https://bun.com/docs/test - "By default the test runner runs all tests in a single process"; `--timeout` sets the per-test timeout.
- https://bun.com/docs/test/parallel - `--parallel[=N]` "Runs files across `N` worker processes ... Implies `--isolate`".
- https://bun.com/docs/test/code-coverage - "Coverage only tracks files that are loaded."
- https://nodejs.org/docs/latest-v24.x/api/cli.html#--test-isolationmode - "The default isolation mode is `'process'`"; `--test-timeout` default `Infinity`; `NODE_V8_COVERAGE` "will automatically propagate to subprocesses".
- https://github.com/oven-sh/setup-bun/blob/v2.2.0/README.md - without input, setup-bun reads the Bun version from `package.json`.
- https://bun.com/blog/bun-v1.4.3 - `node:child_process` fixes: truncated data on failed pipe reads, a `spawnSync` that could spin and never return, dropped output on a full pipe.
- https://code.claude.com/docs/en/setup - the native binary "doesn't use your Node.js at runtime".
- https://code.claude.com/docs/en/hooks - shell-form hook commands run through `sh -c`; "The `node` plus script-path pattern works on every platform".
- https://github.com/openai/codex/blob/main/docs/install.md - "Codex is written in Rust"; system requirements name no runtime.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | runtime_neutral_tests | Make the author suites pass on Node and Bun: `scripts/skills/guard.mjs` prints the spawn `error.code` with the runtime's message and `author-tooling.mjs` matches the code (RC1); `agent-score-vacuity.test.mjs` passes its fixture hook as a `--import=<hook>` argument instead of `NODE_OPTIONS` (RC2); `tag-ci-run-identity.test.mjs` restores `PATH` and removes its stub root in `test.after` (RC4) | scripts/skills/guard.mjs, scripts/tests/author-tooling.mjs, scripts/tests/unit/agent-score-vacuity.test.mjs, scripts/tests/unit/tag-ci-run-identity.test.mjs | - | local | planned | `node scripts/tests/author-tooling.mjs` and `bun scripts/tests/author-tooling.mjs` exit 0; `node --test --test-concurrency=4 scripts/tests/unit/*.test.mjs` and `bun test --parallel=4 --timeout=180 ./scripts/tests/unit/*.test.mjs` each report 72 pass, 0 fail |
| 2 | author_tooling_on_bun | Run author tooling on Bun 1.4.4 and keep shipped payload on Node: set `engines.bun` to `1.4.4` in `package.json`; point `ci`, `guard:skills`, `test:observability`, and `test:contracts` at `bun`, and `test:unit` at `bun test --parallel=4 --timeout=180 ./scripts/tests/unit/*.test.mjs` (`score:skills` and `test:coverage` stay on `node`); in `scripts/ci.mjs` add `bun()`/`bunOk()` for author scripts, keep `node()`/`nodeOk()` only for `scripts/tests/plan-cli.mjs` and the `skill-guard.mjs` scorer, and make every rerun hint name the command the gate ran; spawn `bun` in `scripts/skills/guard.mjs` and `scripts/lib/plugin-release.mjs`; spawn `process.execPath` in `tests/idempotency.mjs`; print `bun scripts/ci.mjs` in the gate-memo cost advice; set `#!/usr/bin/env bun` on author entry points and the fake `gh` (not `scripts/tests/plan-cli.mjs` or shipped files); run `bun` for `scripts/ci.mjs`, `scripts/ci-target.mjs release-tag`, and `scripts/tests/ci-plugin-targeting.mjs` in `.github/workflows/ci.yml` (`resolve-shards` keeps Node); move every test shim, assertion, and registry pattern that names the runner | package.json, scripts/ci.mjs, scripts/skills/guard.mjs, scripts/lib/plugin-release.mjs, scripts/lib/gate-memo.mjs, tests/idempotency.mjs, scripts/tests/fixtures/gh-stub/gh, .github/workflows/ci.yml, scripts/tests/ci-plugin-targeting.mjs, scripts/tests/test-contracts.mjs, scripts/tests/author-tooling.mjs, scripts/tests/unit/agent-score-vacuity.test.mjs, scripts/tests/unit/skill-score-vacuity.test.mjs, scripts/tests/unit/gate-memo.test.mjs, scripts/capture-tdd-red.mjs, scripts/ci-target.mjs, scripts/release.mjs, scripts/agents/guard.mjs, scripts/agents/score.mjs, scripts/config/read-floor.mjs, scripts/lib/validate-skills.mjs, scripts/plans/no-bespoke-gates.mjs, scripts/skills/codex-facts.mjs, scripts/skills/content-hash.mjs, scripts/skills/durable-anchors.mjs, scripts/skills/no-author-scripts.mjs, scripts/skills/refs-guard.mjs, scripts/skills/transform-guard.mjs, scripts/tree/guard.mjs, scripts/tests/ci-observability.mjs, tests/skill-trigger-collision.mjs, plugins/plan-lifecycle/test/selftest.mjs | 1 | local | planned | `bun scripts/ci.mjs` exits 0; its `--timings-json` lists `node` as `argv[0]` only for `scripts/tests/plan-cli.mjs` and the `skill-guard.mjs` scorer; `bun scripts/tests/ci-plugin-targeting.mjs` exits 0 |
| 3 | runtime_docs | State the runtime split and move every author command to `bun` in root `AGENTS.md` (Commands, the runtime sentence, validator commands), `scripts/AGENTS.md`, `.github/AGENTS.md`, `README.md`, `plugins/docks/README.md`, `plugins/docks/skills/AGENTS.md`, `plugins/plan-lifecycle/skills/AGENTS.md`, and the three this-kit gate commands in `write-skill/SKILL.md`, then run `bun scripts/skills/content-hash.mjs --backfill plugins/docks/skills`; commands that run shipped `skill-guard.mjs` or `plan.mjs` keep `node` | AGENTS.md, scripts/AGENTS.md, .github/AGENTS.md, README.md, plugins/docks/README.md, plugins/docks/skills/AGENTS.md, plugins/plan-lifecycle/skills/AGENTS.md, plugins/docks/skills/productivity/write-skill/SKILL.md | 2 | local | planned | each line that `git grep -n -E '\bnode (scripts\|tests)/' -- ':!docs/'` prints runs `scripts/tests/plan-cli.mjs` or `resolve-shards`' `scripts/ci-target.mjs` on Node, is a consumer-side command in a shipped skill body, or is a test assertion of one of these, as listed in Verification Results; `bun scripts/ci.mjs` exits 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| a1 | `bun install --frozen-lockfile && git diff --exit-code bun.lock` | both exit 0 under Bun 1.4.4 |
| a2 | `bun scripts/ci.mjs` | exits 0 for the repo-wide checks and both plugins (root `AGENTS.md`: the full gate for repo-wide and multi-plugin changes) |
| a3 | `bun scripts/tests/ci-plugin-targeting.mjs` | exits 0 (the non-unit targeting contract that the `targeting-contracts` job runs, `.github/AGENTS.md`) |
| a4 | `bun run test:unit` | exits 0 and reports 72 pass, 0 fail |
| a5 | `bun run test:coverage` | runs under Node and reports at least 99% line coverage for `plan.mjs` |
| a6 | `bun scripts/ci.mjs --plugin plan-lifecycle --timings-json <file>`, then print each command's `argv[0]` | `node` only for `scripts/tests/plan-cli.mjs` and the `skill-guard.mjs` scorer, `claude` for plugin validate, and `bun` for every other command |
| a7 | Three interleaved runs each of `node scripts/ci.mjs --plugin plan-lifecycle --timings-json <file>` in a temporary worktree of `origin/main` and `bun scripts/ci.mjs --plugin plan-lifecycle --timings-json <file>` on the branch | the branch median `total_ms` is at least 20% below the `origin/main` median |
| a8 | pull request checks | every check passes |

## Do not touch

- Shipped consumer surfaces: `plan.mjs` code and its `node <installed-helper>` contract line, `plugins/docks/hooks/hooks.json`, `context-tree-nudge.mjs`, `skill-guard.mjs` code, and every shipped skill body except the three this-kit gate commands in `write-skill/SKILL.md` (decision 2).
- `docs/` point-in-time records, including `docs/authoring-audits.md` (`docs/AGENTS.md`).
- The `install.cjs` and `npm audit signatures` CI steps, and `.github/workflows/dependency-integrity.yml`.
- `test:coverage` and `score:skills`, which stay on Node (decisions 2 and 6).
- Plugin versions, manifests, and marketplace catalogs. This plan makes no release.
- The `scripts/lib/gate-memo.mjs` key fields. `toolFingerprint` already records both runtimes.
- `bunfig.toml`: no `[run] bun` setting (decision 4).

## Open questions

## Verification Results

