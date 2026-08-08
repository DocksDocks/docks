---
title: Stop slow-but-alive peers becoming retained custody faults
goal: Replace the custody deadlines that turn a merely slow local peer into a retained fault with widened bounds and event waits, and prove it with tests that actually execute.
plan_hash_mode: status-excluded-v1
status: blocked
blocked_reason: "Draft verification invocation 2 of 2 returned two findings and both reproduce, so the run is terminal: a draft repair verdict is accepted at most once and invocation 1 spent it on six accepted findings. F1: step:runtime_exchange_retry edits src/workspace.rs but no acceptance row observes that source change. Its only RED row is A7, a grep for the word idempotent in README.md; A9 and A13 pin RUNTIME_EXCHANGE_DEADLINE at its definition :41 and its unrelated post-fence use :4721 and stay green when workspace.rs is untouched; A6 and A17 are green before and after. An implementation writing only README prose, or widening the read timeout alone which the step itself forbids, satisfies every row. F2: the clause this run ADDED to step:load_regression claiming every RELAY_TEST_* delay knob sits on the lifecycle-supervisor startup checkpoint is false. Knobs exist at supervisor.rs:1048 RELAY_TEST_WATCHDOG_CALLER_DISCONNECT_MS, :1072-1102 the control-ready latches, :1970 RELAY_TEST_SUPERVISOR_CANCEL_BARRIER_MS and :2445 RELAY_TEST_THREAD_SPAWN_FAIL; only :1037-1042 is on the startup checkpoint. That clause was copied verbatim from the invocation-1 reviewer defect text without independent verification, which is a new failure mode: a reviewer verdict may be right while its supporting evidence is wrong. The conclusion it supported is independently true, since the custodian acknowledgements are unconditional, so no custodian-ACK delay seam exists. No code is lost: run 1 implementation commit dfa599f stays preserved at refs/docks/preserve/24728318-1179-42d7-be26-6bda735c2433 and the tracked source is unchanged at its pre-change content."
blocked_since: "2026-08-08T00:14:53.943+00:00"
created: "2026-08-07T13:40:00+00:00"
updated: "2026-08-08T00:14:53.943+00:00"
started_at: null
finished_at: null
assignee: null
tags: [session-relay, custody, deadlines, reliability]
affected_paths:
  - plugins/session-relay/rust/README.md
  - plugins/session-relay/rust/src/workspace.rs
  - plugins/session-relay/rust/src/workspace/custody.rs
  - plugins/session-relay/rust/src/workspace/platform/linux.rs
  - plugins/session-relay/rust/src/workspace/repository_gate.rs
  - plugins/session-relay/rust/tests/workspace_lease_process.rs
  - plugins/session-relay/test/fixtures/reentry-inventory.json
  - plugins/session-relay/test/fixtures/rust-test-inventory.json
  - plugins/session-relay/test/rust-unit-tests.mjs
  - scripts/ci.mjs
  - scripts/config/test-contracts.json
  - scripts/lib/plugins.mjs
related_plans: []
---

## Goal

A workspace peer that is alive but descheduled must not be judged dead. Five wall-clock deadlines in
the custody path expire on load alone, and four of the five escalate into a retained custody fault
that only an operator can clear by running `relay workspace recover`.

Every bound this plan touches is **widened or given an explicit total**, never deleted. A deleted
ceiling on a synchronous path is a worse failure than a premature error, because it hangs and leaks
whatever child the expiry was reaping.

The plan also fixes the reason three earlier runs of it were wrong: its proofs did not run. The only
command in this repository that executes Rust tests is
`plugins/session-relay/test/rust-test-inventory.mjs:266`, `cargo test --locked --test <target>`, over
eight integration targets. Nothing runs `cargo test --lib`, so all 137 crate unit tests — including
the three broker-readiness tests this plan depends on — are compiled by `cargo clippy --all-targets`
and never executed. And a source check that does not run currently still passes the gate, because
`scripts/ci.mjs:570-573` downgrades a `SKIP` line to a warning that never reaches `failures`.

## Context & rationale

Measured, not assumed. Under three CPU spinners on a six-vCPU host, 5 of 5 runs of
`workspace_lease_process` died at `src/workspace.rs:5417` — a three-second budget for the Git broker
to publish readiness — with the broker alive and its stderr empty. Separately, eight
`custody runtime close_lease response deadline elapsed after 2000 ms` failures were recorded under
`cargo nextest -j6` and are cited in
`docs/plans/finished/2026-08-07-session-relay-quiesce-deadline.md:104`.

These are one defect class. A deadline that bounds *a local peer we ourselves spawned* is a liveness
guess, and every such guess is wrong under contention. The crate already knows this:
`src/workspace/platform/linux.rs:781-788` records an earlier instance where one budget was spent on
two waits, handing `wait_recursive_empty` a `Duration::ZERO` and turning a healthy shutdown into
`quiesce_failed`. That comment is the precedent this plan generalises.

Severity comes from where expiry lands. `src/supervisor.rs:863-875` `retain_runtime_fault` is
divergent (`-> !`) and is reached from **fourteen** sites in the release protocol — `:699`, `:714`,
`:730`, `:738`, `:742`, `:747`, `:761`, `:769`, `:775`, `:780`, `:790`, `:799`, `:804`, `:814` — and
the `quiesce_failed` literal is at `:727`. So one 750 ms miss on a custody ACK becomes a fault
requiring operator recovery.

The five rows in scope, all reachable from ordinary `relay workspace` verbs:

| Row | Site | Value | Why it is a false negative |
|---|---|---|---|
| 1 | `src/workspace.rs:5417` | 3 s | Broker readiness. The parent already distinguishes "exited" from "slow" via `child.try_wait()` at `:5421-5422` and `:5451-5452`, so this fires **only** when the child is confirmed alive. |
| 2 | `src/workspace/custody.rs:18` | 750 ms | `HEARTBEAT_FENCE_AFTER` is borrowed as a one-shot reply timeout at **nine** sites in eight functions: `command` `:505`, `finish_bootstrap` `:727`, `worker_prepared` `:754`, `activate` `:798`, `accept_bootstrap_fault` `:840` and `:851`, `confirm_empty` `:915`, `next_admitted` `:1047`, `wait_ack` `:1079`. It is not a per-receive budget. `heartbeat()` (`:527-559`) never reads it: it receives on `HEARTBEAT_INTERVAL` (250 ms, `:17`) at `:536` and fences after three consecutive misses at `:549-554`, so 750 ms is the **implicit aggregate** of that three-strike check. The nine sites spend a whole liveness aggregate on one reply. |
| 3 | `src/workspace/repository_gate.rs:15` | 3 s | `GATE_TIMEOUT` at its sole use `:150` is a fixed budget for lock contention regardless of how many writers are queued, so it degrades with concurrency by construction. It is also the **only** bound on the `flock(LOCK_EX\|LOCK_NB)` loop at `:157`. |
| 4 | `src/workspace/platform/linux.rs:61` | 500 ms | `GRACEFUL_STOP_DEADLINE` bounds a possibly-descheduled root leaving after SIGTERM. Sole use `:776`. |
| 5 | `src/workspace.rs:41` | 2000 ms | `RUNTIME_EXCHANGE_DEADLINE` bounds BOTH client socket options as a one-shot pair with no retry: `set_write_timeout` (`SO_SNDTIMEO`) at `:6859` and `set_read_timeout` (`SO_RCVTIMEO`) at `:6862`, with a single `read_to_end` at `:6871-6873`. It is **genuinely fused**: also reused at `:4721` as a post-SIGKILL-fence pidfd wait, which is a real verdict and out of scope, and interpolated into the operator diagnostic at `:6881`. |

### Readiness as an event rather than a clock {mechanism}

Row 1 replaces one constant rather than deleting it. `broker_readiness_pair` (`src/workspace.rs:85-101`)
already builds a `UnixStream::pair()` and then deliberately sets the reader non-blocking at `:91`;
that flag is the sole reason the loop at `:5418-5461` busy-polls at 10 ms and needs a budget at all.
Polling the fd for `POLLIN|POLLHUP` — close to the shape already implemented in
`custody::wait_readable` (`src/workspace/custody.rs:1898` onward), whose own poll set is
`POLLIN|POLLHUP|POLLERR` at `:1902` — returns the instant the broker writes, and `POLLHUP` already
carries the `Closed` verdict.

What the event wait must NOT do is drop the ceiling. `src/workspace.rs:5462-5467` is the only path
that bounds a broker which stays alive and never publishes readiness: it kills the child, reaps it,
takes its stderr and returns a diagnostic. `POLLIN`, `POLLHUP` and the periodic `child.try_wait()`
are each never satisfied in that case. The wait is inline in `start_git_broker` (`:5319`), called
synchronously from the workspace-start path at `:1416`, and the repository gate is dropped one line
earlier at `:1415`, so **nothing outside imposes any deadline**. Two sibling arms perform the same
cleanup and must also survive: `Closed` at `:5434-5443` and the error arm at `:5444-5449`.

The defect is that 3 s expires on a *healthy* broker under load, not that a bound exists. So this
step keeps exactly one bound, raises it, and makes it overridable through the `env_ms` mechanism the
crate already provides at `src/channel.rs:33-40`.

The same reasoning applies to row 3, and it is the sharper trap. `src/watch.rs:409-414` is the capped
backoff this plan cites as a model, but it caps only the *interval* between attempts
(`POLL_MS.saturating_mul(1 << shift).min(WAKE_RETRY_MAX_MS)`) and imposes **no total ceiling** — it
retries for the life of the watch loop. Copying it verbatim into `repository_gate` would delete the
only bound on a synchronous gate acquisition. Row 3 therefore adds an explicit total budget
alongside the per-attempt one.

Row 5 is the one row whose fix is not obvious, because retrying `quiesce`, `terminate`, `close_lease`
or `closed_committed` is only safe if the runtime protocol tolerates a duplicate request.
step:runtime_exchange_retry settles that from the protocol itself before changing anything, and its
failure action is to introduce a separate client bound rather than guess. Note the responder has its
own, separate budget: `RUNTIME_COMMAND_IO_DEADLINE` (200 ms, `src/workspace.rs:39`, used at `:7029`
and `:7032`) bounds the server end of the same socket, so widening only the client leaves a
descheduled custodian that cannot *write* within 200 ms still failing.

## Environment & how-to-run

Linux with cgroup v2 delegation, systemd user session, Rust toolchain per `rust-toolchain.toml`. All
commands run from the repository root.

The three delegated custody targets need an owned cgroup. The harness provisions one per case; a bare
`cargo test` for those targets fails on a missing `SESSION_RELAY_TEST_CGROUP_ROOT`, which is a
pre-existing environment requirement and not a defect introduced here.

The harness does NOT fail loudly when it cannot obtain that delegation. Off CI it prints
`SKIP rust_test_inventory case=<name> reason=cgroup-delegation-unavailable` and exits 0
(`rust-test-inventory.mjs:243-264`); it hard-fails only when `GITHUB_ACTIONS` is `true` (`:247-252`).
Until step:gate_fails_on_skip lands, `scripts/ci.mjs:570-573` also downgrades that line to a warning
which never reaches `failures`, so the gate exits 0 with the three delegated cases unexecuted.
Confirm delegation before trusting any custody result:
`systemd-run --user --scope -p Delegate=yes --collect --quiet -- true` must exit 0.

**Acceptance preconditions.** Observe every row with the gate memo DISABLED: `--memo` or
`DOCKS_CI_MEMO=1` short-circuits `scripts/ci.mjs:244-254` to `CACHED PASS` and `exit 0` without
running the gate, which would satisfy an exit-bound row without executing anything. The memo is
opt-in, so the default path is correct; do not enable it while observing acceptance.

```bash
node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_lease_process
node plugins/session-relay/test/rust-unit-tests.mjs
node scripts/ci.mjs --plugin session-relay
```

Slowness is reproduced by INJECTING a deterministic delay at the mechanism under test — a late
custodian ACK, a held repository gate, a worker root that ignores SIGTERM — never by loading the
host. Do not run CPU spinners on this repository. Synthetic host load makes the result depend on the
runner's spare capacity, and on a small box it starves the very processes under test: an earlier
attempt exhausted a six-vCPU workstation twice and required a reboot. The three-spinner figure quoted
in Context describes how the ORIGINAL defect was first observed, not a method to repeat.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | execute_unit_tests | Make the 137 crate unit tests execute. Add `plugins/session-relay/test/rust-unit-tests.mjs`, which runs `cargo test --locked --lib` from `plugins/session-relay/rust`, parses the `test result: ok. N passed; 0 failed; M ignored; 0 measured; K filtered out` summary, asserts `N` is at least a minimum pinned in the runner itself and that failed, ignored and filtered are all zero. Do NOT read that minimum from `expected_min`: for a `sourceChecks` descriptor `selectedCount` is hard-coded to 1 (`scripts/tests/test-contracts.mjs:271`), so `expected_min` must be exactly `1` and bounds the selection, not the test count. Register the row exactly as the derivation dictates — id `plugin-session-relay-source-rust-unit-tests-default`, `owner.suite` and `selection.selector` both the suite path, `selection.kind` `node-script` — because `:417` asserts discovered/registered equality in both directions through `assertSetEqual` (`:385-393`), `:424-426` asserts per-field agreement on `owner.suite`, `selection.kind` and `selection.selector`, and `:428-432` assert the count, the `expected_min` floor and suite existence, and prints one `PASS rust_unit_tests executed=N` line only after the run succeeded. Register it as a session-relay `sourceChecks` entry in `scripts/lib/plugins.mjs` beside the eight `rust-test-inventory` rows at `:150-181`, so it runs in the targeted `--plugin session-relay` lane and the full gate alike (`scripts/ci.mjs:546` iterates the selected plugins), and add its contract row to `scripts/config/test-contracts.json`. It needs no cgroup delegation, so it has no skip path. | `plugins/session-relay/test/rust-unit-tests.mjs`, `scripts/lib/plugins.mjs`, `scripts/config/test-contracts.json` | — | `local` | `planned` | Row A15 counts one `PASS rust_unit_tests` line where the baseline is 0, and A6 exercises the same runner through the gate. Failure action: STOP; every later step that cites a unit test depends on this one. |
| 2 | gate_fails_on_skip | Make a source check that did not execute fail the gate. `scripts/ci.mjs:570-573` currently detects a `SKIP ` line and calls `warn`, and `warn` (`:100-102`) only prints — it never appends to `failures` — so the gate exits 0 at `:844` with the three delegated custody cases unrun. The comment at `:568-569` already admits the hole and chose a warning; upgrade it to a failure. Emit the failure from a SINGLE-LINE `fail(...)` call containing the exact phrase `source check did not execute`, so row A16 can bind the diagnostic to the failing call rather than to loose file text. This is shared tooling and changes behaviour for every plugin, which is intended: a check that reports it did not run must never pass. | `scripts/ci.mjs` | — | `local` | `planned` | A16 counts one `fail(...)` call carrying `source check did not execute`, where the baseline is 0, so the phrase cannot be satisfied by a comment or by a surviving `warn(`; and A6 still exits 0 on this host because A10 shows delegation is available. Failure action: STOP. |
| 3 | broker_event_wait | Replace the 3 s busy-poll with an event wait, without removing the ceiling. Drop `set_nonblocking(true)` at `src/workspace.rs:91`, wait via `poll()` for `POLLIN\|POLLHUP`, and keep a coarse periodic `child.try_wait()` so a broker that dies without closing its fd is still detected. Keep exactly one wall-clock ceiling, `BROKER_READINESS_DEADLINE`, raised well above any observed publish latency and overridable through `env_ms` (`src/channel.rs:33-40`). Preserve all three cleanup arms in effect — `Closed` `:5434-5443`, error `:5444-5449`, and expiry `:5462-5467` — each of which kills the child, reaps it, takes its stderr and returns a distinguishable diagnostic. Retain the authenticated 32-byte token comparison and the `Ready`/`Closed`/`Pending` trichotomy. Regenerate the reentry inventory, which keys syscall sites by file and function and gains a `libc_poll` site here. | `plugins/session-relay/rust/src/workspace.rs`, `plugins/session-relay/test/fixtures/reentry-inventory.json` | 1 | `local` | `planned` | Rows A5 and A12 together show `set_nonblocking` gone from `fn broker_readiness_pair` AND the file-wide count down from 3 to 2, so the call was removed rather than moved elsewhere in the file; A11 shows the function still exists, so A5 cannot pass on an empty `awk` range; the three existing broker-readiness unit tests now execute under A15, including `broker_readiness_refuses_a_child_that_closes_without_publishing`; and A1 passes. Deliberately NOT covered by step:load_regression, because an injected delay cannot make a prompt broker slow. Failure action: STOP and record the observed poll behaviour. |
| 4 | custody_forgiveness | Stop the nine one-shot reply receives from borrowing the heartbeat liveness aggregate. Add `CONTROL_EXCHANGE_DEADLINE = 3 * HEARTBEAT_FENCE_AFTER` (2250 ms) and use it at all nine: `command` `:505`, `finish_bootstrap` `:727`, `worker_prepared` `:754`, `activate` `:798`, `accept_bootstrap_fault` `:840` and `:851`, `confirm_empty` `:915`, `next_admitted` `:1047`, `wait_ack` `:1079`. Leave `ControlEndpoint::heartbeat` (`:527-559`) byte-identical: it receives on `HEARTBEAT_INTERVAL` and counts three strikes, and that counter is the liveness oracle. Express the new constant in terms of the fence so the relationship stays visible. Add the discriminating unit test for this step to the existing `mod tests` in the same file: a reply arriving after `HEARTBEAT_FENCE_AFTER` but within `CONTROL_EXCHANGE_DEADLINE` must complete, so reverting the constant to the fence makes it fail. step:load_regression cannot discriminate this step, because its target has no custodian-ACK delay seam. Do NOT alter the deadline error literal formatted at `custody.rs:1913`: `heartbeat()` classifies a miss by `error.starts_with` at `:548`, so changing that text would make it fence on the FIRST miss instead of the third and silently destroy the three-strike oracle. | `plugins/session-relay/rust/src/workspace/custody.rs` | 1 | `local` | `planned` | All nine sites bound replies by `CONTROL_EXCHANGE_DEADLINE` and none by `HEARTBEAT_FENCE_AFTER`; A14 shows the deadline error literal byte-identical, so the strike classifier at `:548` still matches; the two existing 300 ms-ACK unit tests at `custody.rs:1987` and `:2029` still pass and now actually execute under A15; the new discriminating unit test added here fails when the nine sites are reverted to `HEARTBEAT_FENCE_AFTER` and passes with `CONTROL_EXCHANGE_DEADLINE`, also under A15; and A2 passes. Failure action: STOP. |
| 5 | gate_backoff | Replace the fixed single-attempt wait with capped exponential backoff between attempts, modelled on `src/watch.rs:409-414`, AND an explicit total ceiling. `GATE_TIMEOUT` becomes the budget for one acquisition attempt; add `GATE_TOTAL_BUDGET` bounding the whole loop. The cited model caps only the inter-attempt interval and never terminates, so copying it alone would delete the only bound on the `flock` loop at `repository_gate.rs:157` — that is forbidden. Preserve the `no mutation performed` guarantee on final expiry, and keep the expiry diagnostic in step with the constant rather than hardcoding a duration in prose as `:154` does today. | `plugins/session-relay/rust/src/workspace/repository_gate.rs` | 2 | `local` | `planned` | A total ceiling exists and is named in source, so a queued writer cannot wait forever; the final-expiry error still states `no mutation performed`; and A3 passes. Failure action: STOP. |
| 6 | graceful_stop_budget | Raise the shipped `GRACEFUL_STOP_DEADLINE` default (`platform/linux.rs:61`, sole use `:776`) to a value justified by a measurement recorded in this step: sample the SIGTERM-to-exit interval for a runnable child enough times to see the tail, and set the default well above the observed maximum. The injectable variant already exists at `:794` with budgets at `:797-798`, so no threading work is needed; the two callers that supply the default are `src/supervisor.rs:719` and `:928`. Measure on an unloaded host and label the value provisional; do NOT create synthetic CPU load to measure, since starving the box distorts the very interval being sampled. Do not alter the stop/empty budget split, and do not touch `EMPTY_DEADLINE` (`:59`), which serves three purposes. | `plugins/session-relay/rust/src/workspace/platform/linux.rs`, `plugins/session-relay/rust/README.md` | 2 | `local` | `planned` | The sampled distribution and the chosen default are both recorded in the crate map, the split is unchanged, and the step is discriminated by step:load_regression, whose test must fail when this default alone is reverted. A4 guards the provider bounds in this same file. Failure action: STOP. |
| 7 | runtime_exchange_retry | Determine from the custody runtime protocol whether `quiesce`, `terminate`, `close_lease` and `closed_committed` tolerate a duplicate request. If they do, add one bounded retry. If any does not, introduce a separate exchange-only bound and apply it to BOTH client socket options — `set_write_timeout` (`SO_SNDTIMEO`) at `:6859` and `set_read_timeout` (`SO_RCVTIMEO`) at `:6862` — so send and receive stay symmetric. Widening the read alone would leave the send budget at 2 s, which is the same asymmetry this plan already flags for the responder-side constant. `RUNTIME_EXCHANGE_DEADLINE` is fused: its reuse at `src/workspace.rs:4721` is a post-SIGKILL-fence pidfd verdict and keeps its current value either way. Whichever route is taken, update the operator diagnostic at `:6881`, which interpolates `RUNTIME_EXCHANGE_DEADLINE` and would otherwise report a duration that was never applied. Record in the crate map which action forbids retry and why, and record that the responder keeps its own separate `RUNTIME_COMMAND_IO_DEADLINE` (200 ms, `:39`, used `:7029`/`:7032`) so widening the client alone does not help a custodian that cannot write in time. | `plugins/session-relay/rust/src/workspace.rs`, `plugins/session-relay/rust/README.md` | 2 | `local` | `planned` | A7 records the idempotency decision; A9 shows the shared constant byte-identical at its definition and A13 shows `:4721` still uses that identifier, so the post-fence verdict was not widened as a side effect; the diagnostic reports the bound actually applied. Failure action: STOP. |
| 8 | load_regression | Add one regression test driving a full workspace release with a deterministic delay INJECTED at each mechanism reachable from this target: a held repository gate, and a worker root that ignores SIGTERM. Assert no retained custody fault is produced. Do NOT attempt to inject a late custodian ACK here: no such seam exists — the custodian ACKs in `src/supervisor.rs` are unconditional, the only workspace injectors are error-only (`INTEGRATION_FAULT_POINTS` at `src/workspace.rs:2252-2261`, `SESSION_RELAY_TEST_CLEANUP_FAULT` at `:3110-3116`), and every `RELAY_TEST_*` delay knob sits on the lifecycle-supervisor startup checkpoint rather than on custody. Creating that seam would require editing `src/supervisor.rs`, which this plan does not declare and which `affected_paths` freezes once the run leaves `drafting`. step:custody_forgiveness is discriminated instead by a crate unit test, which step:execute_unit_tests makes executable. Do NOT induce contention by loading the host: a spin loop makes the result depend on spare capacity and on a small box starves the processes under test. Register the test in the frozen inventory via the harness generator, never by hand. | `plugins/session-relay/rust/tests/workspace_lease_process.rs`, `plugins/session-relay/test/fixtures/rust-test-inventory.json` | 3, 4, 5, 6 | `local` | `planned` | The new test fails when either step:gate_backoff or step:graceful_stop_budget is reverted in isolation, and passes with both applied; it lives in `workspace_lease_process`, so A1 executes it. step:custody_forgiveness is NOT discriminated here, because this target has no custodian-ACK delay seam; its discriminator is a unit test asserting that a reply arriving after `HEARTBEAT_FENCE_AFTER` but within `CONTROL_EXCHANGE_DEADLINE` completes, executed by A15. Failure action: STOP. |
| 9 | deadline_taxonomy | Record the A/B/C/D deadline taxonomy in the crate map so a future author can tell a liveness guess from a safety bound, naming the constants that must stay strict and correcting the doubly stale `README.md:135` row, which records 1,793 lines against an actual 1897 and 9 frozen tests against an actual 10. | `plugins/session-relay/rust/README.md` | 3, 4, 5, 6, 7, 8 | `local` | `planned` | A8 records the taxonomy, the map lists every changed constant with its bucket and cites the safety bounds left untouched, and the `README.md:135` row records the observed line count, the observed frozen-test count and the fixture line span that `plugins/session-relay/test/fixtures/rust-test-inventory.json` actually occupies. This row depends on step:load_regression because that step adds a test to the same file, so recording the numbers first would satisfy the clause and then falsify it. Failure action: STOP. |

## Acceptance criteria

| ID | Step | Command | Expected |
|---|---|---|---|
| A1 | broker_event_wait | `node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_lease_process \| grep -c '^PASS rust_test_inventory case=workspace_lease_process'` | `1` |
| A2 | custody_forgiveness | `node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_coordination_process \| grep -c '^PASS rust_test_inventory case=workspace_coordination_process'` | `1` |
| A3 | gate_backoff | `node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_identity \| grep -c '^PASS rust_test_inventory case=workspace_identity'` | `1` |
| A4 | graceful_stop_budget | `node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_resources \| grep -c '^PASS rust_test_inventory case=workspace_resources'` | `1` |
| A5 | broker_event_wait | `awk '/fn broker_readiness_pair/,/^}/' plugins/session-relay/rust/src/workspace.rs \| grep -c 'set_nonblocking'` | `0` |
| A6 | load_regression | `DOCKS_CI_MEMO=0 node scripts/ci.mjs --plugin session-relay` | `0` |
| A7 | runtime_exchange_retry | `grep -c 'idempotent' plugins/session-relay/rust/README.md` | `1` |
| A8 | deadline_taxonomy | `grep -c 'liveness guess' plugins/session-relay/rust/README.md` | `1` |
| A9 | runtime_exchange_retry | `grep -cF 'RUNTIME_EXCHANGE_DEADLINE: Duration = Duration::from_secs(2);' plugins/session-relay/rust/src/workspace.rs` | `1` |
| A10 | load_regression | `systemd-run --user --scope -p Delegate=yes --collect --quiet -- true` | `0` |
| A11 | broker_event_wait | `grep -c 'fn broker_readiness_pair' plugins/session-relay/rust/src/workspace.rs` | `1` |
| A12 | broker_event_wait | `grep -c 'set_nonblocking' plugins/session-relay/rust/src/workspace.rs` | `2` |
| A13 | runtime_exchange_retry | `grep -cF 'let deadline = Instant::now() + RUNTIME_EXCHANGE_DEADLINE;' plugins/session-relay/rust/src/workspace.rs` | `1` |
| A14 | custody_forgiveness | `grep -cF 'custody control deadline elapsed after {} ms' plugins/session-relay/rust/src/workspace/custody.rs` | `1` |
| A15 | execute_unit_tests | `node plugins/session-relay/test/rust-unit-tests.mjs \| grep -c '^PASS rust_unit_tests'` | `1` |
| A16 | gate_fails_on_skip | `grep -cE 'fail\(.*source check did not execute' scripts/ci.mjs` | `1` |
| A17 | gate_fails_on_skip | `DOCKS_CI_MEMO=0 node scripts/ci.mjs` | `0` |

A Command cell writes a shell pipeline separator as `\|`, which is Markdown escaping for a table cell
and not part of the command: a bare `|` would end the cell in any GitHub-flavoured renderer. Read every
`\|` as a single `|` when running the row. The digest binds the authored cell, so the escape is inside
`command_sha256` by construction; the row is executable after that one substitution and was measured
that way.

A1-A4 count the harness PASS line instead of testing its exit status, because an exit status of zero
does not mean the tests ran: `rust-test-inventory.mjs:243-264` prints `SKIP` and exits 0 when cgroup
delegation is unavailable off CI. `PASS rust_test_inventory case=<name>` is emitted only on the
execution path (`:279`), and the comment at `:262` states that a case which did not execute must never
print one. `workspace_resources` is not in the delegated set (`:181`) so it has no skip path, but A4 is
bound the same way so no row here can be satisfied by a skip.

Each row states what it cannot prove, because three review rounds died on rows that proved less than
they claimed:

- **A1-A4 are green before and after.** They are regression guards and execution proofs, not
  discriminators. A1 additionally executes step:load_regression's new test.
- **A5 alone is not sufficient for step:broker_event_wait.** It measures a token inside one function,
  so moving the `set_nonblocking` call elsewhere in the file would satisfy it while leaving the socket
  non-blocking. A12 closes that by pinning the file-wide count at 2, and A11 stops A5 passing on an
  empty `awk` range.
- **A6 proves the gate is green, and after step:gate_fails_on_skip it also proves the delegated cases
  executed** — until then `scripts/ci.mjs:570-573` downgrades a skip to a warning that never reaches
  `failures`. A10 states the delegation precondition separately, and the memo must stay disabled.
- **A9 pins a definition, A13 pins the use site.** A9 alone would allow step:runtime_exchange_retry to
  swap the identifier at `src/workspace.rs:4721` to a new constant, widening the post-fence verdict
  while the definition stayed byte-identical. A13 forbids exactly that.
- **A14 guards a fused literal, not prose.** `heartbeat()` classifies a missed deadline by string
  prefix at `custody.rs:548`, so this row is what keeps the three-strike liveness oracle intact.
- **A7 and A8 are single-line greps.** They record that a decision and a taxonomy were written, not
  that either is correct; the reviewer judges the prose.
- **A15 is the row that makes the unit tests real.** Baseline 0, because the runner does not exist.
  It carries the three broker-readiness tests and the two 300 ms-ACK tests that steps 3 and 4 rely on.

- **A17 is the row that makes the authoritative gate a claim rather than an assertion.**
  step:gate_fails_on_skip changes `scripts/ci.mjs` for every plugin and step:execute_unit_tests edits
  `scripts/lib/plugins.mjs` and `scripts/config/test-contracts.json`, so this change spans shared
  tooling and the full `node scripts/ci.mjs` gate is authoritative, not the selected-plugin gate. A6
  covers the session-relay payload; A17 covers everything the skip fix could break elsewhere. Both
  pin the memo off for the reason A6 records.

- **A16 is a source assertion, not a behavioural one.** It proves a single-line `fail(...)` call
  carrying `source check did not execute` exists, which a comment or a surviving `warn(` cannot
  satisfy. It does NOT execute the skip path: doing that hermetically would need a gate run on a host
  without cgroup delegation, and this host has it. The behavioural consequence is instead observed in
  the negative by A6, which must still exit 0 here precisely because A10 shows nothing skips.
- **A6 pins the memo off in the command itself.** `DOCKS_CI_MEMO=0` is not decoration:
  `scripts/ci.mjs:236` enables the memo when `DOCKS_CI_MEMO === '1'` or `--memo` is passed, and a hit
  prints `CACHED PASS` and exits 0 at `:244-254` without running the gate, which would satisfy an
  exit-bound row with no work done. The row disables it rather than relying on the reader.
- **A16 uses `grep -cE` with an escaped paren deliberately.** The `.*` needs a regex, so unlike A9,
  A13 and A14 this row cannot use `-F`; `fail\(` escapes the literal paren that this host's default
  ERE would otherwise read as a group.

A9, A13 and A14 use `grep -cF` deliberately. This host ships `pi-uu-grep 17.1.5`, which defaults to
extended regular expressions, so a literal `(2)` or `{}` in the pattern would parse as a group and the
row would report `0` against correct source. The fixed-string flag makes each a byte assertion.

How each row is judged:

| Binding | Meaning | Rows |
|---|---|---|
| `exit` | the command's exit status is compared against the expected value | A6 A10 A17 |
| `match` | the command's output is compared against the expected value | A1 A2 A3 A4 A5 A7 A8 A9 A11 A12 A13 A14 A15 A16 |

## Out of scope / do-NOT-touch

These expire on a real verdict, not on load, and must keep their current strictness:

- `MANAGED_ATTACH_DEADLINE_MS` and `MANAGED_CANCEL_GRACE_MS` (`src/lifecycle.rs:21,23`) — expiry yields `FencingUnconfirmed`; widening the window widens the interval in which two workers could both believe they hold a binding.
- `PROVIDER_TERMINATION_GRACE` (`src/workspace/resources.rs:27`) — a SIGTERM-to-SIGKILL escalation rung.
- `PROVIDER_TIMEOUT` (`src/workspace/resources.rs:26`) — bounds a third-party executable. `tests/workspace_resources.rs:379-382` asserts the observed *elapsed* time inside a 4 s-8 s window, so it constrains this constant only indirectly; widening it past 8 s would fail that assertion.
- `src/workspace.rs:3948` and `:4721` — both assert something about an already-fenced peer, so expiry means a real leak. A13 pins `:4721` to the shared constant so step:runtime_exchange_retry cannot widen it by swapping the identifier.
- `ControlEndpoint::heartbeat` in full (`src/workspace/custody.rs:527-559`), including its `HEARTBEAT_INTERVAL` receive at `:536` and the three-strike count at `:549-554`. That counter is the liveness oracle and the safety property. Note it never reads `HEARTBEAT_FENCE_AFTER`: the 750 ms fence is the implicit aggregate of three 250 ms strikes, so after step:custody_forgiveness the fence constant survives only as the derivation base of `CONTROL_EXCHANGE_DEADLINE`. Leaving this function byte-identical therefore does keep the fence and the count literally unchanged.
- The deadline error literal formatted at `src/workspace/custody.rs:1913`, guarded by A14. `heartbeat()` classifies a miss by `error.starts_with` at `:548`, so rewording that text would make it fence on the first miss rather than the third.
- `EMPTY_DEADLINE` (`src/workspace/platform/linux.rs:59`) — classified B at low confidence, serves three call sites (`:760`, `:777`, `:2228`), and is not changed here.
- `RUNTIME_COMMAND_IO_DEADLINE` (`src/workspace.rs:39`) — the responder-side 200 ms budget. step:runtime_exchange_retry records its existence but does not change it.
- The stop/empty budget split itself, and the RAII ownership of `fresh_home`.

**The cost this plan accepts, stated rather than hidden.** `command()` drains pending heartbeats at
`custody.rs:501-503` BEFORE it sends, and the blocking receive is `:505`. There is no concurrent
heartbeat driver in production: every call site is synchronous (`:502`, `:793`, `:888`), and the
supervisor loop that calls `controller.heartbeat()` at `workspace.rs:6995` is the same single-threaded
non-blocking accept loop, in its `WouldBlock` branch, so it is not running while that receive blocks.
So a peer that dies MID-EXCHANGE is detected after 2250 ms rather than 750 ms: worst-case death
detection during a control exchange triples. That is accepted because the cost is delaying a fault by
about 1.5 s while the benefit is not killing a live peer at all, and today that false kill reaches the
divergent `retain_runtime_fault` and leaves a retained custody fault clearable only by an operator.
The idle monitoring path is unaffected, because that is where `heartbeat()` still runs on its 250 ms
beat.

## STOP conditions

- Any change would widen a fencing window or defer a kill escalation.
- A custody runtime action turns out not to be idempotent and a retry was already added.
- The step:load_regression test cannot be made to fail by reverting a fix.
- `plugins/session-relay/test/fixtures/rust-test-inventory.json` would need hand-editing.
- Any acceptance row regresses on the pre-existing baseline.
- A deadline is deleted rather than widened, leaving a wait with no ceiling. Widening a budget is in
  scope; removing the last bound on a synchronous call is not, because a hang is a worse failure than
  a premature error and it leaks whatever child the bound was reaping.
- A step would change the deadline error literal at `custody.rs:1913` or the identifier at
  `workspace.rs:4721`. Both are load-bearing for code the plan promises not to touch.
- A Done-when clause would rest on a test that nothing executes. After step:execute_unit_tests the
  unit tests run; before it, no clause may cite one.

## Open questions

None blocking. Row 5's idempotency question is answered inside step:runtime_exchange_retry from the protocol definition, and that step carries an explicit non-retry fallback.

## Review

Plan-run: {"acceptance":null,"blocker":{"evidence_sha256":"daabd6da0ebee78f3c914a663dc475985d5441cf46593fd5dbf8b73005e4de25","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"047da690a46f3f24b466ed7773f63060626f6dc1babc6f41deffa068e8af618b","invocations":2,"result_sha256":"daabd6da0ebee78f3c914a663dc475985d5441cf46593fd5dbf8b73005e4de25","state":"blocked"},"execution_parent":null,"goal_id":"9373c033-3c34-4774-9cf3-f5240feb538e","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-custody-deadlines.md","plan_sha256":"616bfce16ce49ef3f85e9cf5bad7f25ef0f29b5e6576afc08262c5bdf11a3840","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"b79fe417-ef0c-4967-9d8d-768650770522","schema":1,"source_base":"4f585ff62209a95d727a890c3e053d357f36c8a7","source_sha256":"a4a71c5d17db0a6a1c44cddc52b10f1fc877e4eb5d6c3f606554e3aa5f8c8e88"}

Plan-attempt-history: {"authorization_source_sha256":"9536b4f291522f749a38c661440bcfc356f2623ccb02671f6db1136e88da7408","plan_bytes_sha256":"2e5357ecf0e1eb98cf8b39facd6f0300c334916a295d37c481ba5cd9784163b9","replacement_run_id":"e5078c54-4082-4d67-a7a9-066f81197405","run":{"acceptance":{"source_sha256":"e34968a2300fdd0e9234d392d081ca9771ecaa5ff4875c55e718d5e55c03e0da","verification_sha256":"d41a324c40b1c3cdff0eb2cd2791d20062973d92bdbc5eec3e7e58a2224ad80a"},"blocker":{"evidence_sha256":"049147dba303403791b469e20851aa06cbc64d2dae13a8865422d96c2d6984e0","kind":"review_failed"},"completion_review":{"input_sha256":"bfda5009376bcd2cc38c7ac57001386fcfc469c8d819acc15707470b21ec90d5","invocations":2,"result_sha256":"049147dba303403791b469e20851aa06cbc64d2dae13a8865422d96c2d6984e0","state":"blocked"},"draft_review":{"input_sha256":"6f3041c74f3331cc59a047aadca3dcd2e6c9604cd8331791fd4d115661c9dfe1","invocations":2,"result_sha256":"063eb3ada72c7dc2da14554cebc11668c9e2be38dea29b244022418c25244522","state":"passed"},"execution_parent":"d90cca30219bf6bbe7d9984697cafec53e41178f","goal_id":"9373c033-3c34-4774-9cf3-f5240feb538e","implementation_commit":"dfa599f11970dd92f69379627c5313e2df6480ed","plan_path":"docs/plans/active/session-relay-custody-deadlines.md","plan_sha256":"4c279710ad53c18eacff5ff87b057a0fc417ed2089c3a5961c4883439d31e1f5","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"24728318-1179-42d7-be26-6bda735c2433","schema":1,"source_base":"dfa599f11970dd92f69379627c5313e2df6480ed","source_sha256":"e34968a2300fdd0e9234d392d081ca9771ecaa5ff4875c55e718d5e55c03e0da"},"schema":1,"status":"blocked","successor_run_sha256":"f9c04d886bb9875b6ff0f57406adbf4f4d2c3d39d576b9215f7adde046626118"}
Plan-attempt-history: {"authorization_source_sha256":"e5f174b7b2b8b6c220e0b51fff0de6c90fb7e11a30e2b3afc9691e192b0a4e04","plan_bytes_sha256":"1f95fa2218935ce8ef4dbf971504291a18f837ac8cb852f70b0e1a53d2631a40","replacement_run_id":"25c3e005-ae61-4dd9-ac06-7fc2ccaf9913","run":{"acceptance":null,"blocker":{"evidence_sha256":"dcaf083fb064aad77198b2261c4abf51dfa32d42adb26523848347d439e3f83c","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"f76b0e11d2f53deaa3a0518c1af5beebe4facab6b0237002adf82f0f420edfc5","invocations":2,"result_sha256":"dcaf083fb064aad77198b2261c4abf51dfa32d42adb26523848347d439e3f83c","state":"blocked"},"execution_parent":null,"goal_id":"9373c033-3c34-4774-9cf3-f5240feb538e","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-custody-deadlines.md","plan_sha256":"3463066108abf4ff3ec5c50b7e25c2fb7be6371f9c6845ea8d1602ef8b1fef76","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"e5078c54-4082-4d67-a7a9-066f81197405","schema":1,"source_base":"72d6480e8c7efdc83f08ccb20d3cf4c04a000f65","source_sha256":"846eda52c2b40610d1accb28a39a0d14ea9b1fb2293f849fa814093c35aa5baf"},"schema":1,"status":"blocked","successor_run_sha256":"3d3fa3c9aa4afb32b440b53c7fff8df40d8a673e83390c818d6df19412a4ca4e"}
Plan-attempt-history: {"authorization_source_sha256":"6ce9ddb5494a4f39fa15c53b4b8fdf82213f9b410d2b0a1f8651186990e28232","plan_bytes_sha256":"c2432ba58778e1a34c4728e7b0c79b224d53cf056bdce9105192d59b8d59b4db","replacement_run_id":"b79fe417-ef0c-4967-9d8d-768650770522","run":{"acceptance":null,"blocker":{"evidence_sha256":"f96374e3a7d21e644cee9767b3ee3c96f51713e43c916572d1a26546b0ccf1e6","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"0373fb39de0ccd743104603a884e35e1895c0cf8a3fa291cbb613dcc5a166330","invocations":2,"result_sha256":"f96374e3a7d21e644cee9767b3ee3c96f51713e43c916572d1a26546b0ccf1e6","state":"blocked"},"execution_parent":null,"goal_id":"9373c033-3c34-4774-9cf3-f5240feb538e","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-custody-deadlines.md","plan_sha256":"feb6299fa8f5c678f8f7b6e82f9945aeee7c5841a7ce1666af1753d4afa39761","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"25c3e005-ae61-4dd9-ac06-7fc2ccaf9913","schema":1,"source_base":"2d21abe7d6770d5ccb68f8cee31f32bdd644be8e","source_sha256":"bf67eae1f43f3d501fca39fa341733b62b449ad4017c0408a30f3c43a72b9be1"},"schema":1,"status":"blocked","successor_run_sha256":"1f35cb8d0a4c37f0fe87d60e8ccf738515d9a1758351c67b7e86b3c5357f8546"}

Runs 1, 2 and 3 are terminal and appear above as attempt history only. Each block bought a real
defect in bytes that run 1 had already passed through a full draft AND completion review.

Run 1 was blocked by its completion review, at the permit ceiling, on one prose defect: the
Verification Results opening sentence named execution_parent 989618d, which is the start
checkpoint and the parent of the implementation commit, while the record execution_parent was
d90cca3. Two commit identity roles were conflated.

Run 2 blocked at the draft phase. Its invocation 1 found that acceptance rows A1-A4 could pass
without executing any custody test, because rust-test-inventory.mjs prints SKIP and exits 0 when
cgroup delegation is unavailable off CI. Its verification then found that HEARTBEAT_FENCE_AFTER is
the 3 x HEARTBEAT_INTERVAL aggregate of heartbeat()'s three-strike liveness fence rather than a
per-receive budget, so the old row 2 could not both grant the nine sites that tolerance and leave
the fence unchanged — and run 1 had shipped 2250 ms while its plan text claimed the fence was
untouched. Four citations were also wrong.

Run 3 blocked at the draft phase too. Its invocation 1 found that the old row 1 deleted the LAST
ceiling on the Git broker readiness wait, turning a bounded 3 s failure into an unbounded hang that
also leaks a live child, which run 1 had shipped. Its verification then found that the repair, and
the custody row before it, rested on crate unit tests that nothing in this repository executes.

Run 4 is authorized by the current user and was audited against the source for all four
demonstrated failure modes BEFORE any permit was spent, rather than repaired one reviewer finding
at a time. That audit produced rows A12, A13, A14 and A16, both new steps, and four citation
corrections. Its results, and what each acceptance row still cannot prove, are recorded beside the
acceptance table so a reviewer need not rediscover them.

Two steps are added rather than substituted. step:execute_unit_tests makes the 137 crate unit
tests run in both the targeted and full gate lanes; step:gate_fails_on_skip makes a source check
that did not execute fail instead of warn. Both were decided by the current user, and the second
changes shared tooling deliberately, so scripts/ci.mjs is declared and the full gate is
authoritative for this run's verification.

Run 1 implementation commit dfa599f remains preserved at
refs/docks/preserve/24728318-1179-42d7-be26-6bda735c2433. It is a reference, not a base: steps 3
and 4 must be reimplemented, because the separate CONTROL_EXCHANGE_DEADLINE and the retained
readiness ceiling are not what that commit contains.

N/A — run 4 draft not yet reviewed.

## Verification Results
N/A — run 4 has executed nothing. The rows below are pre-implementation baselines for run 4
source_base 4f585ff, measured against a genuinely pre-change worktree: run 1 landed this plan and was
then rewound under explicit authorization, and the eight rust and fixture paths were restored to their
d90cca3 content before these measurements, so no row observes its own fix. This sentence names the
same commit the record binds and every proof record carries; it is derived from the record rather than
written by hand, because naming a different commit for one field is the conflation class that
terminally blocked run 1.

RED and therefore discriminating: A5 (1 to 0), A7 (0 to 1), A8 (0 to 1), A12 (3 to 2), A15 (0 to 1)
and A16 (0 to 1). GREEN precondition and invariant guards: A9, A10, A11, A13 and A14. Green
before-and-after execution proofs and regression guards: A1-A4, A6 and A17.

Three earlier runs of this plan were terminally blocked by draft review, each on a proof that proved
less than it claimed, so this draft was audited against the source for all four demonstrated failure
modes before any permit was spent. That audit produced A12, A13, A14, A16 and the two new steps, and
corrected four citation drifts. What it found, and what each row still cannot prove, is recorded
beside the acceptance table rather than left for a reviewer to rediscover.

Falsifiability-proof: {"binds":"match","command_sha256":"3ee11ae80e484bbe3c152ef4be0f77877c04b3961d9cecb53de06e81a6cc686a","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"1"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 4 source_base 4f585ff: run 1 landed this plan's implementation and was then rewound, and the eight rust and fixture paths were restored to their d90cca3 content before these measurements, so no row observes its own fix. Every commit since d90cca3 touches only the plan record and this plan's scope-waiver file, neither of which any row reads. The harness printed exactly one `PASS rust_test_inventory case=workspace_lease_process` line in 69 s, so the case really executed. This row counts that line rather than testing the exit status, because rust-test-inventory.mjs:243-264 prints SKIP and exits 0 when cgroup delegation is unavailable off CI, and an exit-bound row would then go green without running a single custody test. Green before and after. It also executes step:load_regression's new test once that step lands, and it is the target where the 3 s broker readiness budget was measured failing under load.","row_id":"A1","source_base":"4f585ff62209a95d727a890c3e053d357f36c8a7","step_id":"broker_event_wait"}
Falsifiability-proof: {"binds":"match","command_sha256":"644bd64b048f04804d66b47deb6d3000f72a4ccdf33684e8fdd939b991901147","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"1"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 4 source_base 4f585ff: run 1 landed this plan's implementation and was then rewound, and the eight rust and fixture paths were restored to their d90cca3 content before these measurements, so no row observes its own fix. Every commit since d90cca3 touches only the plan record and this plan's scope-waiver file, neither of which any row reads. The harness printed exactly one `PASS rust_test_inventory case=workspace_coordination_process` line in 269 s, so the case really executed. This row counts that line rather than testing the exit status, because rust-test-inventory.mjs:243-264 prints SKIP and exits 0 when cgroup delegation is unavailable off CI, and an exit-bound row would then go green without running a single custody test. The slowest custody target and the most exposed to any regression from step:custody_forgiveness.","row_id":"A2","source_base":"4f585ff62209a95d727a890c3e053d357f36c8a7","step_id":"custody_forgiveness"}
Falsifiability-proof: {"binds":"match","command_sha256":"e859859844723ca5e49b5e2862ca575715e5dd36aaf2e6fc5afb4f7b212f4b21","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"1"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 4 source_base 4f585ff: run 1 landed this plan's implementation and was then rewound, and the eight rust and fixture paths were restored to their d90cca3 content before these measurements, so no row observes its own fix. Every commit since d90cca3 touches only the plan record and this plan's scope-waiver file, neither of which any row reads. The harness printed exactly one `PASS rust_test_inventory case=workspace_identity` line in 53 s, so the case really executed. This row counts that line rather than testing the exit status, because rust-test-inventory.mjs:243-264 prints SKIP and exits 0 when cgroup delegation is unavailable off CI, and an exit-bound row would then go green without running a single custody test. Covers the repository gate that step:gate_backoff changes.","row_id":"A3","source_base":"4f585ff62209a95d727a890c3e053d357f36c8a7","step_id":"gate_backoff"}
Falsifiability-proof: {"binds":"match","command_sha256":"97aa84535b1170c6365685e131347230703893329898b1158c41a29cc3de6eac","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"1"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 4 source_base 4f585ff: run 1 landed this plan's implementation and was then rewound, and the eight rust and fixture paths were restored to their d90cca3 content before these measurements, so no row observes its own fix. Every commit since d90cca3 touches only the plan record and this plan's scope-waiver file, neither of which any row reads. The harness printed exactly one `PASS rust_test_inventory case=workspace_resources` line in 8 s, so the case really executed. This row counts that line rather than testing the exit status, because rust-test-inventory.mjs:243-264 prints SKIP and exits 0 when cgroup delegation is unavailable off CI, and an exit-bound row would then go green without running a single custody test. workspace_resources is absent from the delegated set at rust-test-inventory.mjs:181, so it has no non-execution path; it is bound the same way so no row in this table can be satisfied by a skip. It guards the PROVIDER_TIMEOUT 4 s-8 s elapsed window asserted at tests/workspace_resources.rs:379-382, in the same file step:graceful_stop_budget edits.","row_id":"A4","source_base":"4f585ff62209a95d727a890c3e053d357f36c8a7","step_id":"graceful_stop_budget"}
Falsifiability-proof: {"binds":"match","command_sha256":"c4d57f2a7b58a940dc6a128fa98cff1f5c4facc9e53454b9311662742c99ae6d","expected_sha256":"ccf7f2a69fbff091dadda5c9ae3fc6c30f79d762043cfe5c45f8902c12cebf13","observed":{"matcher":"count","result":"1"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 4 source_base 4f585ff: run 1 landed this plan's implementation and was then rewound, and the eight rust and fixture paths were restored to their d90cca3 content before these measurements, so no row observes its own fix. Every commit since d90cca3 touches only the plan record and this plan's scope-waiver file, neither of which any row reads. The awk range over fn broker_readiness_pair (workspace.rs:85-101) yields 1, the set_nonblocking call at :91. RED at 1 before and 0 after, so this discriminates step:broker_event_wait. It is NOT sufficient alone: moving the call elsewhere in the file would also yield 0, which is why A12 pins the file-wide count, and an empty awk range would yield 0, which is why A11 pins the function's existence.","row_id":"A5","source_base":"4f585ff62209a95d727a890c3e053d357f36c8a7","step_id":"broker_event_wait"}
Falsifiability-proof: {"binds":"exit","command_sha256":"61026ee12450742fe840c28709fba5e491d0dec3e789559fbd77b4cf9699c70a","expected_sha256":"ccf7f2a69fbff091dadda5c9ae3fc6c30f79d762043cfe5c45f8902c12cebf13","observed":0,"probe":"Whole-plugin regression gate, green before and after. Exit 0 observed in run 1 at b5b797c in 330 s. The delta from that commit to the bound base is inert for this row: git diff --name-only b5b797c 4f585ff touches only docs/plans and scripts/config, neither of which is in the session-relay payload this gate validates, so the observation holds at run 4 source_base 4f585ff. Re-observed for real at acceptance, and A17 additionally runs the full gate, which is the authoritative one for this run. DOCKS_CI_MEMO=0 is part of the command because scripts/ci.mjs:236 enables the memo on DOCKS_CI_MEMO === '1' and a hit prints CACHED PASS and exits 0 at :244-254 without running the gate. Until step:gate_fails_on_skip lands this row proves build and lint health only, because :570-573 downgrades a skipped source check to a warning that never reaches failures; after that step its exit 0 also means the delegated cases executed.","row_id":"A6","source_base":"4f585ff62209a95d727a890c3e053d357f36c8a7","step_id":"load_regression"}
Falsifiability-proof: {"binds":"match","command_sha256":"a66318f9f0a0db91d8bb4b090bd3394daff7283ca5f92832fe868f8c2e296769","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"0"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 4 source_base 4f585ff: run 1 landed this plan's implementation and was then rewound, and the eight rust and fixture paths were restored to their d90cca3 content before these measurements, so no row observes its own fix. Every commit since d90cca3 touches only the plan record and this plan's scope-waiver file, neither of which any row reads. plugins/session-relay/rust/README.md does not mention idempotency, so the count is 0. RED until step:runtime_exchange_retry records which custody runtime actions tolerate a duplicate request and which forbid one. It records that a decision was written, not that the decision is correct; the reviewer judges the prose.","row_id":"A7","source_base":"4f585ff62209a95d727a890c3e053d357f36c8a7","step_id":"runtime_exchange_retry"}
Falsifiability-proof: {"binds":"match","command_sha256":"d4794502fa682867a326117448ead4987a667c0aabef8058e012723d31a0fb8b","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"0"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 4 source_base 4f585ff: run 1 landed this plan's implementation and was then rewound, and the eight rust and fixture paths were restored to their d90cca3 content before these measurements, so no row observes its own fix. Every commit since d90cca3 touches only the plan record and this plan's scope-waiver file, neither of which any row reads. The README carries no deadline taxonomy, so the count is 0. RED until step:deadline_taxonomy records which constants are liveness guesses and which are safety bounds. Same limitation as A7.","row_id":"A8","source_base":"4f585ff62209a95d727a890c3e053d357f36c8a7","step_id":"deadline_taxonomy"}
Falsifiability-proof: {"binds":"match","command_sha256":"82b1042d8f82322e26bd83ae78cec1eb3aad2457c0bbb34ada0fdecd0916a9ec","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"1"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 4 source_base 4f585ff: run 1 landed this plan's implementation and was then rewound, and the eight rust and fixture paths were restored to their d90cca3 content before these measurements, so no row observes its own fix. Every commit since d90cca3 touches only the plan record and this plan's scope-waiver file, neither of which any row reads. With grep -cF, the RUNTIME_EXCHANGE_DEADLINE definition literal occurs exactly once, at workspace.rs:41. GREEN by design; an invariant guard, not a discriminator. It pins the DEFINITION only, so it must be read with A13, which pins the use site at :4721 that this constant is fused with.","row_id":"A9","source_base":"4f585ff62209a95d727a890c3e053d357f36c8a7","step_id":"runtime_exchange_retry"}
Falsifiability-proof: {"binds":"exit","command_sha256":"b591052847d0765bf0847e653382350f614d467a89d07976650f4fd0e076970f","expected_sha256":"ccf7f2a69fbff091dadda5c9ae3fc6c30f79d762043cfe5c45f8902c12cebf13","observed":0,"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 4 source_base 4f585ff: run 1 landed this plan's implementation and was then rewound, and the eight rust and fixture paths were restored to their d90cca3 content before these measurements, so no row observes its own fix. Every commit since d90cca3 touches only the plan record and this plan's scope-waiver file, neither of which any row reads. systemd-run --user --scope -p Delegate=yes --collect --quiet -- true exited 0, so this host can delegate a cgroup-v2 subtree. That is the exact probe rust-test-inventory.mjs:224-227 runs before deciding whether to execute or skip the three delegated cases. GREEN before and after; a precondition guard, not a discriminator. It fails loudly on a host that cannot delegate rather than letting A6 report a silent skip as a pass.","row_id":"A10","source_base":"4f585ff62209a95d727a890c3e053d357f36c8a7","step_id":"load_regression"}
Falsifiability-proof: {"binds":"match","command_sha256":"a7ff3431a90b79bcc97f16542c52725295455d68c836b70e765452226d98229e","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"1"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 4 source_base 4f585ff: run 1 landed this plan's implementation and was then rewound, and the eight rust and fixture paths were restored to their d90cca3 content before these measurements, so no row observes its own fix. Every commit since d90cca3 touches only the plan record and this plan's scope-waiver file, neither of which any row reads. workspace.rs defines fn broker_readiness_pair exactly once, at :85. GREEN before and after; this is A5's non-vacuity precondition. Without it, renaming or deleting the function would make A5's awk range empty and its grep -c return 0, satisfying A5 while proving nothing.","row_id":"A11","source_base":"4f585ff62209a95d727a890c3e053d357f36c8a7","step_id":"broker_event_wait"}
Falsifiability-proof: {"binds":"match","command_sha256":"2a7007da3b95e29aab8b3e26dba8e24a60a397d03085218e490f2dca76b11053","expected_sha256":"9ccf2b7fcd6612847a2df9e3690e651dba906662971ee31324d96814e779799e","observed":{"matcher":"count","result":"3"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 4 source_base 4f585ff: run 1 landed this plan's implementation and was then rewound, and the eight rust and fixture paths were restored to their d90cca3 content before these measurements, so no row observes its own fix. Every commit since d90cca3 touches only the plan record and this plan's scope-waiver file, neither of which any row reads. set_nonblocking occurs three times file-wide in workspace.rs: :91 inside broker_readiness_pair, plus :6980 and :7478 on unrelated listener sockets that must survive. RED at 3 and 2 after, so it discriminates step:broker_event_wait AND closes A5's move-the-call hole: relocating the :91 call into start_git_broker would satisfy A5 but not this row.","row_id":"A12","source_base":"4f585ff62209a95d727a890c3e053d357f36c8a7","step_id":"broker_event_wait"}
Falsifiability-proof: {"binds":"match","command_sha256":"35ee6e5f3c016819e22573ac8629351d4e28c0a38c3bef87d36b242db9832d52","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"1"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 4 source_base 4f585ff: run 1 landed this plan's implementation and was then rewound, and the eight rust and fixture paths were restored to their d90cca3 content before these measurements, so no row observes its own fix. Every commit since d90cca3 touches only the plan record and this plan's scope-waiver file, neither of which any row reads. With grep -cF, the post-SIGKILL-fence pidfd wait at workspace.rs:4721 uses the shared RUNTIME_EXCHANGE_DEADLINE identifier, once. GREEN before and after; an invariant guard. It exists because A9 pins only the definition: step:runtime_exchange_retry could otherwise introduce a new constant and swap the identifier here, widening a real post-fence verdict the plan lists as out of scope while A9 stayed green.","row_id":"A13","source_base":"4f585ff62209a95d727a890c3e053d357f36c8a7","step_id":"runtime_exchange_retry"}
Falsifiability-proof: {"binds":"match","command_sha256":"bcd59f968f532cfcf69e1bca8f1fef1ecd806cb7ef8678638ba6dfa584b2cf7c","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"1"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 4 source_base 4f585ff: run 1 landed this plan's implementation and was then rewound, and the eight rust and fixture paths were restored to their d90cca3 content before these measurements, so no row observes its own fix. Every commit since d90cca3 touches only the plan record and this plan's scope-waiver file, neither of which any row reads. With grep -cF, the deadline error literal 'custody control deadline elapsed after {} ms' occurs once, formatted at custody.rs:1913. GREEN before and after; this guards a FUSED LITERAL, not prose. ControlEndpoint::heartbeat classifies a missed deadline by error.starts_with at :548, so rewording that text would make it fence on the first miss instead of the third and silently destroy the three-strike liveness oracle step:custody_forgiveness promises to leave untouched.","row_id":"A14","source_base":"4f585ff62209a95d727a890c3e053d357f36c8a7","step_id":"custody_forgiveness"}
Falsifiability-proof: {"binds":"match","command_sha256":"b9f8cdc8877ccb7a59ded002d732ef50eac61d29535d9bdb7e3d297c92448e55","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"0"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 4 source_base 4f585ff: run 1 landed this plan's implementation and was then rewound, and the eight rust and fixture paths were restored to their d90cca3 content before these measurements, so no row observes its own fix. Every commit since d90cca3 touches only the plan record and this plan's scope-waiver file, neither of which any row reads. plugins/session-relay/test/rust-unit-tests.mjs does not exist, so the pipeline prints nothing and the count is 0. RED until step:execute_unit_tests adds it. Measured separately: cargo test --locked --lib from plugins/session-relay/rust passes 137 tests in 1.76 s, 7.8 s including the build, and nothing in this repository runs it today — scripts/ci.mjs runs only cargo fmt, clippy and build, and rust-test-inventory.mjs:266 runs --test <integration target>. Those 137 include the three broker-readiness tests step:broker_event_wait depends on and the two 300 ms-ACK tests step:custody_forgiveness depends on.","row_id":"A15","source_base":"4f585ff62209a95d727a890c3e053d357f36c8a7","step_id":"execute_unit_tests"}
Falsifiability-proof: {"binds":"match","command_sha256":"0e8ab752bfcfdbd5c7e2e3933cb70d95f6eee52af47864b0ec64a33673a168b2","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"0"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 4 source_base 4f585ff: run 1 landed this plan's implementation and was then rewound, and the eight rust and fixture paths were restored to their d90cca3 content before these measurements, so no row observes its own fix. Every commit since d90cca3 touches only the plan record and this plan's scope-waiver file, neither of which any row reads. scripts/ci.mjs contains no fail() call carrying 'source check did not execute', so the count is 0. RED until step:gate_fails_on_skip lands. The pattern is bound to a fail( call rather than loose file text so a comment, or a surviving warn( at :572, cannot satisfy it. It is a source assertion, not behavioural: exercising the skip path would need a host without cgroup delegation, and A10 shows this host has it. This row uses grep -cE with fail\\( escaped because the .* needs a regex, unlike A9, A13 and A14 which use -F.","row_id":"A16","source_base":"4f585ff62209a95d727a890c3e053d357f36c8a7","step_id":"gate_fails_on_skip"}
Falsifiability-proof: {"binds":"exit","command_sha256":"78b47849a84d1ea8b14b780aa0e4af5c931ce0ee47782ca7961fadb20a1e9575","expected_sha256":"ccf7f2a69fbff091dadda5c9ae3fc6c30f79d762043cfe5c45f8902c12cebf13","observed":0,"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 4 source_base 4f585ff: run 1 landed this plan's implementation and was then rewound, and the eight rust and fixture paths were restored to their d90cca3 content before these measurements, so no row observes its own fix. Every commit since d90cca3 touches only the plan record and this plan's scope-waiver file, neither of which any row reads. DOCKS_CI_MEMO=0 node scripts/ci.mjs exited 0 in 499 s, measured on 2026-08-07 against this exact pre-change tree: 422.9 s session-relay, 35.4 s plan orchestration, 22.3 s repo-wide guards. The gate itself reported \"The full gate is the correct scope: this working tree changes files outside every plugin root\", which is why this row exists: step:gate_fails_on_skip changes scripts/ci.mjs for every plugin and step:execute_unit_tests edits scripts/lib/plugins.mjs and scripts/config/test-contracts.json, so the authoritative gate is the full one and A6's selected-plugin run cannot stand in for it. GREEN before and after; a repo-wide regression guard, not a discriminator. The memo is pinned off for the reason A6 records.","row_id":"A17","source_base":"4f585ff62209a95d727a890c3e053d357f36c8a7","step_id":"gate_fails_on_skip"}

## Proposed repair

For the next authorized successor. This section is advisory and is excluded from `plan_sha256`.

Two mechanical repairs, then dispatch. Nothing else in these bytes is known to be wrong: run 4 was
audited against the source before its first permit and the six invocation-1 findings were all repaired.

**F1, add source-observing rows for step:runtime_exchange_retry.** It is the only step whose source
change no row watches. Bind it the way A5 and A12 bind step:broker_event_wait:

- one row counting the new bound or retry identifier at BOTH client socket-option sites,
  `set_write_timeout` at `src/workspace.rs:6859` and `set_read_timeout` at `:6862`, expected `2`
  against a measured baseline of `0`;
- one row asserting no client socket option still passes `RUNTIME_EXCHANGE_DEADLINE`, which is what
  forbids the read-only widening the step already calls an asymmetry;
- optionally one row for the diagnostic at `:6881` reporting the bound actually applied.

Measure a pre-change baseline for each and install a Falsifiability-proof line, exactly as A12, A13,
A14 and A16 were done.

**F2, restate the RELAY_TEST_* clause as observed.** The knobs sit on the supervisor startup
checkpoint (`:1037-1042`), the watchdog caller-disconnect path (`:1048`, sleep `:1054-1056`), the
control-ready latches (`:1072-1102`) and the cancel barrier (`:1970`, sleep `:1970-1975`); there is
also `RELAY_TEST_THREAD_SPAWN_FAIL` at `:2445`. None is on the custodian ACK path, which is why no
custodian-ACK delay seam exists and why the conclusion still holds.

**The process lesson, which cost this run.** Four failure modes were swept before dispatch and that
was worth it: invocation 1 returned six findings and all six were repairable. But the repair itself
introduced F2 by copying a reviewer defect sentence into the plan as fact. A reviewer verdict is
evidence that something is wrong; its supporting citations are NOT pre-verified. Add a fifth sweep
item: re-verify every claim a repair introduces, including claims quoted from the reviewer.

Carry forward, all correct and already in these bytes:

- The two added steps and their rows: step:execute_unit_tests with A15, and step:gate_fails_on_skip
  with A16 and A17. cargo test --locked --lib passes 137 tests in 1.76 s and nothing runs it today;
  the full gate passes in 499 s and is authoritative because shared tooling is declared.
- The 56 P21 waivers, of which exactly one coupling was real: scripts/tests/test-contracts.mjs needs a
  registry row shaped as its own derivation dictates and a green re-run, not an edit.
- Rows A12, A13, A14 closing the vacuity holes in A5, A9 and step:custody_forgiveness, and the four
  citation corrections from invocation 1.
- The CONTROL_EXCHANGE_DEADLINE resolution, the retained env-overridable BROKER_READINESS_DEADLINE
  with its three cleanup arms, and the accepted 2250 ms mid-exchange death-detection cost stated in
  Out of scope rather than hidden.
