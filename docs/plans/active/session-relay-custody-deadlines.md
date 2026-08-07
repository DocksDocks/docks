---
title: Stop slow-but-alive peers becoming retained custody faults
goal: Replace the custody deadlines that turn a merely slow local peer into a retained fault with event waits, forgiveness, and backoff, and prove it under contention.
plan_hash_mode: status-excluded-v1
status: blocked
blocked_reason: "Draft verification invocation 2 of 2 returned two findings and both reproduce, so the run is terminal: a draft repair verdict is accepted at most once and invocation 1 spent it. f1 is substantive. ControlEndpoint::heartbeat receives on HEARTBEAT_INTERVAL (250 ms, custody.rs:17) at :536 and forgives three consecutive misses at :549-554, so HEARTBEAT_FENCE_AFTER (750 ms) is the PRODUCT 3x250 ms and not an independent per-receive budget. The nine raw sites each already wait the full 750 ms, so giving them the same three-miss tolerance yields 2250 ms and triples the effective custody control fence, contradicting the same row instruction to keep the fence and its three-strike count unchanged. Run 1 implemented exactly that 2250 ms and neither its draft nor its completion review caught the contradiction. f2 is four citation errors: retain_runtime_fault is supervisor.rs:863-875 with fourteen call sites, not :863-881 with eleven; workspace.rs:5448 is the return Err line and the second try_wait is :5451-5452; custody::wait_readable is custody.rs:1898 onward with POLLIN|POLLHUP|POLLERR at :1902, not :1886-1928; and the 4 s-8 s guard is tests/workspace_resources.rs:379-382 asserting observed elapsed time, not :376-379 pinning PROVIDER_TIMEOUT. No code is lost: run 1 implementation commit dfa599f is preserved at refs/docks/preserve/24728318-1179-42d7-be26-6bda735c2433 and its diff is saved outside the repository."
blocked_since: "2026-08-07T21:40:18.887+00:00"
created: "2026-08-07T13:40:00+00:00"
updated: "2026-08-07T21:40:18.887+00:00"
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
related_plans: []
---

## Goal

A workspace peer that is alive but descheduled must not be judged dead. Today five
wall-clock deadlines in the custody path expire on load alone, and four of them
escalate into a retained custody fault that only an operator can clear.

## Context & rationale

Measured, not assumed. Under three CPU spinners on a six-vCPU host, 5 of 5 runs of
`workspace_lease_process` died at `src/workspace.rs:5417` — a three-second budget for
the Git broker to publish readiness — with the broker alive and its stderr empty.
Separately, eight `custody runtime close_lease response deadline elapsed after 2000 ms`
failures were recorded under `cargo nextest -j6` and are cited in
`docs/plans/finished/2026-08-07-session-relay-quiesce-deadline.md:104`.

These are one defect class. A deadline that bounds *a local peer we ourselves spawned*
is a liveness guess, and every such guess is wrong under contention. The crate already
knows this: `src/workspace/platform/linux.rs:786-793` records an earlier instance where
one budget was spent on two waits, handing `wait_recursive_empty` a `Duration::ZERO` and
turning a healthy shutdown into `quiesce_failed`. That comment is the precedent this
plan generalises.

Severity comes from where expiry lands. `src/supervisor.rs:863-881`
`retain_runtime_fault` is divergent (`-> !`) and is reached from eleven sites in the
release protocol; the `quiesce_failed` literal is at `:727`. So one 750 ms miss on a
custody ACK becomes a fault requiring `relay workspace recover`.

The five rows in scope, all reachable from ordinary `relay workspace` verbs:

| Row | Site | Value | Why it is a false negative |
|---|---|---|---|
| 1 | `src/workspace.rs:5417` | 3 s | Broker readiness. The parent already distinguishes "exited" from "slow" via `child.try_wait()` at `:5421`/`:5448`, so this fires **only** when the child is confirmed alive. |
| 2 | `src/workspace/custody.rs:18` | 750 ms | `HEARTBEAT_FENCE_AFTER` is used raw, with no forgiveness, at **nine** sites in eight functions: `command` `:505`, `finish_bootstrap` `:727`, `worker_prepared` `:754`, `activate` `:798`, `accept_bootstrap_fault` `:840` and `:851`, `confirm_empty` `:915`, `next_admitted` `:1047`, `wait_ack` `:1079`. Only `heartbeat()` `:540-556` forgives, tolerating three consecutive misses. |
| 3 | `src/workspace/repository_gate.rs:15` | 3 s | `GATE_TIMEOUT` is a fixed budget for lock contention regardless of how many writers are queued, so it degrades with concurrency by construction. |
| 4 | `src/workspace/platform/linux.rs:61` | 500 ms | `GRACEFUL_STOP_DEADLINE` bounds a possibly-descheduled root leaving after SIGTERM. |
| 5 | `src/workspace.rs:41` | 2000 ms | `RUNTIME_EXCHANGE_DEADLINE`, one-shot `SO_RCVTIMEO` with no retry anywhere. Note it is *also* reused at `:4721` as a post-SIGKILL-fence pidfd wait, which is a real verdict and out of scope, so this row may not simply widen the shared constant. |

### Readiness as an event rather than a clock {mechanism}

Row 1 needs no new constant. `broker_readiness_pair` (`src/workspace.rs:85-101`) already
builds a `UnixStream::pair()` and then deliberately sets the reader non-blocking at `:91`;
that flag is the sole reason the loop busy-polls at 10 ms and needs a budget at all.
Polling the fd for `POLLIN|POLLHUP` — exactly the shape already implemented in
`custody::wait_readable` (`src/workspace/custody.rs:1886-1928`) — returns the instant the
broker writes, and `POLLHUP` already carries the `Closed` verdict.

Row 5 is the one row whose fix is not obvious, because retrying `quiesce`, `terminate`,
`close_lease` or `closed_committed` is only safe if the runtime protocol tolerates a
duplicate request. Step 5 settles that from the protocol itself before changing anything,
and its failure action is to widen the budget rather than guess.

Every mechanism needed already exists in this crate and none of the custody deadlines use
any of them: `env_ms(name, default)` at `src/channel.rs:33-40`, constructor injection at
`src/lifecycle.rs:1203-1206` and `src/workspace/platform/linux.rs:796`, and capped
exponential backoff at `src/watch.rs:409-414`.

## Environment & how-to-run

Linux with cgroup v2 delegation, systemd user session, Rust toolchain per
`rust-toolchain.toml`. All commands run from the repository root.

The three custody targets need a delegated cgroup. The harness provisions one per case; a bare
`cargo test` for those targets fails on a missing `SESSION_RELAY_TEST_CGROUP_ROOT`, which is a
pre-existing environment requirement and not a defect introduced here.

The harness itself does NOT fail loudly when it cannot obtain that delegation. Off CI it prints
`SKIP rust_test_inventory case=<name> reason=cgroup-delegation-unavailable` and exits 0
(`rust-test-inventory.mjs:243-264`); it turns the same condition into a hard failure only when
`GITHUB_ACTIONS` is `true` (`:247-252`). Treating exit 0 from these targets as proof of a passing
custody run is therefore wrong on a workstation, which is why A1-A4 count the PASS line and A10
asserts the delegation separately. Confirm delegation before trusting any custody result:
`systemd-run --user --scope -p Delegate=yes --collect --quiet -- true` must exit 0.

```bash
node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_lease_process
node scripts/ci.mjs --plugin session-relay
```

Slowness is reproduced by INJECTING a deterministic delay at the mechanism under test — a late
custodian ACK, a held repository gate, a worker root that ignores SIGTERM — never by loading the
host. Do not run CPU spinners on this repository. Synthetic host load makes the result depend on
the runner's spare capacity, and on a small box it starves the very processes under test: an
earlier attempt exhausted a six-vCPU workstation twice and required a reboot. The three-spinner
figure quoted in Context describes how the ORIGINAL defect was first observed, not a method to
repeat.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | broker_event_wait | Replace the 3 s busy-poll readiness budget with an event wait on the existing socketpair: drop `set_nonblocking(true)`, wait via `poll()` for `POLLIN\|POLLHUP`, keep a coarse periodic `child.try_wait()` so a broker that dies without closing its fd is still detected. Retain the authenticated 32-byte token comparison and the three `Ready`/`Closed`/`Pending` outcomes unchanged. Regenerate the reentry inventory, which keys syscall sites by file and function and gains a `libc_poll` site here. | `plugins/session-relay/rust/src/workspace.rs`, `plugins/session-relay/test/fixtures/reentry-inventory.json` | — | `local` | `planned` | Row A5 shows 0 `set_nonblocking` inside `fn broker_readiness_pair` while the file-wide count drops 3 to 2, so the two unrelated listener sockets survive; the wait is an event wait with no wall-clock budget, so the string `did not publish authenticated readiness` no longer exists in the crate; and `workspace_lease_process` passes. This step is deliberately NOT covered by step:load_regression, because an injected delay cannot make a prompt broker slow. Failure action: STOP and record the observed poll behaviour. |
| 2 | custody_forgiveness | Give all nine raw `HEARTBEAT_FENCE_AFTER` receive sites the same consecutive-miss tolerance `heartbeat()` already applies, so one slow ACK cannot fence: `command` `:505`, `finish_bootstrap` `:727`, `worker_prepared` `:754`, `activate` `:798`, `accept_bootstrap_fault` `:840` and `:851`, `confirm_empty` `:915`, `next_admitted` `:1047`, `wait_ack` `:1079`. No site keeps zero forgiveness; leaving any one raw would preserve the defect on that path. Keep the fence itself and its three-strike count unchanged. | `plugins/session-relay/rust/src/workspace/custody.rs` | — | `local` | `planned` | Every one of the nine sites tolerates a late ACK, a custodian answering after 800 ms completes the release instead of producing `custody control deadline elapsed`, and the existing 300 ms-ACK in-file tests at `custody.rs:1987` and `:2029` still pass. Failure action: STOP. |
| 3 | gate_backoff | Replace the fixed `GATE_TIMEOUT` wait with capped exponential backoff modelled on `src/watch.rs:409-414`, so queued writers retry instead of refusing at a constant 3 s. Preserve the `no mutation performed` guarantee on final expiry. | `plugins/session-relay/rust/src/workspace/repository_gate.rs` | — | `local` | `planned` | Eight concurrent workspace mutations against one repository all succeed or refuse cleanly, with zero `contention exceeded three seconds`; failure action: STOP. |
| 4 | graceful_stop_budget | Thread `GRACEFUL_STOP_DEADLINE` through as an injected parameter at its call sites, following `graceful_stop_and_wait_empty_within`, and raise the shipped default to a value justified by a measurement recorded in this step: sample the SIGTERM-to-exit interval for a runnable child enough times to see the tail, and set the default well above the observed maximum. Measure on an unloaded host and label the value provisional; do NOT create synthetic CPU load to measure, since starving the box distorts the very interval being sampled. Do not alter the stop/empty budget split. | `plugins/session-relay/rust/src/workspace/platform/linux.rs` | — | `local` | `planned` | The sampled distribution and the chosen default are both recorded, the split assertions at `tests/workspace_lease_process.rs:1863-1892` still pass unchanged, and a root that exits later than the old budget but inside the new one no longer yields `quiesce_failed`; failure action: STOP. |
| 5 | runtime_exchange_retry | Determine from the custody runtime protocol whether `quiesce`, `terminate`, `close_lease` and `closed_committed` tolerate a duplicate request. If they do, add one bounded retry around the exchange. If any does not, introduce a separate exchange-only bound for the client socket at `:6859`/`:6862` and widen only that; `RUNTIME_EXCHANGE_DEADLINE` as reused at `src/workspace.rs:4721` is a post-fence verdict and keeps its current value either way. Record which action forbids retry and why in the crate map. | `plugins/session-relay/rust/src/workspace.rs`, `plugins/session-relay/rust/README.md` | — | `local` | `planned` | The chosen route is recorded with the protocol evidence that justified it, the bound used at `:4721` is unchanged, and the new bound is derived in a comment from the worst-case legal exchange that step:custody_forgiveness now permits; failure action: STOP and leave both constants unchanged. |
| 6 | load_regression | Add one regression test that drives a full workspace release with a deterministic delay INJECTED at each mechanism it guards — a late custodian ACK, a held repository gate, a worker root that ignores SIGTERM — and assert no retained custody fault is produced. Do NOT induce contention by loading the host: a spin loop makes the result depend on the runner's spare capacity and on a small box starves the very processes under test. Register the test in the frozen inventory via the harness generator, never by hand. | `plugins/session-relay/rust/tests/workspace_lease_process.rs`, `plugins/session-relay/test/fixtures/rust-test-inventory.json` | 1, 2, 3, 4 | `local` | `planned` | The new test fails when any one of step:custody_forgiveness, step:gate_backoff or step:graceful_stop_budget is reverted, and passes with all three applied. step:broker_event_wait is NOT discriminated by this test, because an injected delay cannot make a prompt broker slow; row A5 is its discriminator instead. Failure action: STOP, an unfalsifiable test is worse than none. |
| 7 | deadline_taxonomy | Record the A/B/C/D deadline taxonomy in the crate map so a future author can tell a liveness guess from a safety bound, naming the constants that must stay strict. | `plugins/session-relay/rust/README.md` | 1, 2, 3, 4, 5 | `local` | `planned` | The map lists every changed constant with its bucket and cites the safety bounds left untouched; failure action: STOP. |

## Acceptance criteria

| ID | Step | Command | Expected |
|---|---|---|---|
| A1 | broker_event_wait | `node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_lease_process \| grep -c '^PASS rust_test_inventory case=workspace_lease_process'` | `1` |
| A2 | custody_forgiveness | `node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_coordination_process \| grep -c '^PASS rust_test_inventory case=workspace_coordination_process'` | `1` |
| A3 | gate_backoff | `node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_identity \| grep -c '^PASS rust_test_inventory case=workspace_identity'` | `1` |
| A4 | load_regression | `node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_resources \| grep -c '^PASS rust_test_inventory case=workspace_resources'` | `1` |
| A5 | broker_event_wait | `awk '/fn broker_readiness_pair/,/^}/' plugins/session-relay/rust/src/workspace.rs \| grep -c 'set_nonblocking'` | `0` |
| A6 | load_regression | `node scripts/ci.mjs --plugin session-relay` | `0` |
| A7 | runtime_exchange_retry | `grep -c 'idempotent' plugins/session-relay/rust/README.md` | `1` |
| A8 | deadline_taxonomy | `grep -c 'liveness guess' plugins/session-relay/rust/README.md` | `1` |
| A9 | runtime_exchange_retry | `grep -cF 'RUNTIME_EXCHANGE_DEADLINE: Duration = Duration::from_secs(2);' plugins/session-relay/rust/src/workspace.rs` | `1` |
| A10 | load_regression | `systemd-run --user --scope -p Delegate=yes --collect --quiet -- true` | `0` |
| A11 | broker_event_wait | `grep -c 'fn broker_readiness_pair' plugins/session-relay/rust/src/workspace.rs` | `1` |

A1-A4 count the harness PASS line instead of testing its exit status, because an exit status of
zero does not mean the tests ran. `rust-test-inventory.mjs` needs an owned cgroup-v2 delegation for
`workspace_identity`, `workspace_lease_process` and `workspace_coordination_process` (`:181`); when
`systemd-run --user --scope -p Delegate=yes` fails and `GITHUB_ACTIONS` is not `true`, it prints
`SKIP rust_test_inventory case=<name> reason=cgroup-delegation-unavailable` and exits 0 (`:243-264`).
`PASS rust_test_inventory case=<name>` is emitted only on the execution path (`:279`), and the
harness comment at `:262` states that a case which did not execute must never print one, so that
line is the execution proof and a count of exactly 1 is the only outcome those rows accept.
`workspace_resources` is not in the delegated set and therefore has no non-execution path, but A4 is
bound the same way so that no row in this table can be satisfied by a skip.

A10 is that precondition made explicit and falsifiable. A6 runs the same harness inside the plugin
gate, and `scripts/ci.mjs` captures child output and prints it only on failure, so no PASS line
reaches the gate's own stdout and A6 cannot be rebound the way A1-A4 are. A10 asserts instead that
the delegation the harness probes for is available, which is exactly the condition under which A6's
exit status implies execution rather than a silent skip. A10 fails on a host that cannot delegate,
which is the honest outcome: on such a host A6 proves nothing about custody and must not be read as
if it did.

A11 does the same job for A5 that A10 does for A6. Sweeping the accepted class across every row
found a second instance the review did not name: A5 expects `0` from an `awk` range delimited by
`fn broker_readiness_pair`, and an empty range also yields `0`, so renaming or deleting that
function would satisfy A5 without proving anything. A11 pins the function's existence at exactly one
definition, so A5's `0` can only mean "the call is gone from a function that is still there".

A Command cell writes a shell pipeline's separator as `\|`, which is Markdown escaping for a table
cell and not part of the command: a bare `|` would end the cell in any GitHub-flavoured renderer.
Read every `\|` in this table as a single `|` when running the row. The digest binds the authored
cell, so the escape is inside `command_sha256` by construction; the row is executable after that one
substitution and was measured that way. This applies to A1-A5 alike.

A4 also remains a regression guard rather than an observation of any one step: `workspace_resources`
carries the `PROVIDER_TIMEOUT` 4 s-8 s window this plan must not disturb, so it fails if the
provider bound is touched. step:graceful_stop_budget is instead observed by A6 through
step:load_regression, whose test must fail when that step alone is reverted. A5 and A9 are the
invariant pair for step:runtime_exchange_retry's shared constant: A9 pins
`RUNTIME_EXCHANGE_DEADLINE` at its current two seconds so the post-fence verdict at
`src/workspace.rs:4721` cannot be widened as a side effect of fixing the client exchange, which must
get its own bound instead. A5 is the only source-shape row that is red today and alone separates a
real implementation from a no-op. A7 records the idempotency decision step:runtime_exchange_retry
must reach before changing anything, and A8 records the taxonomy.

A9 uses `grep -cF` deliberately. This host ships `pi-uu-grep 17.1.5`, which defaults to extended
regular expressions, so the literal `(2)` in the pattern would parse as a capture group and the
row would report `0` against correct source. The fixed-string flag makes the row a byte assertion,
which is what it is meant to be.

How each row is judged:

| Binding | Meaning | Rows |
|---|---|---|
| `exit` | the command's exit status is compared against the expected value | A6 A10 |
| `match` | the command's output is compared against the expected value | A1 A2 A3 A4 A5 A7 A8 A9 A11 |

## Out of scope / do-NOT-touch

These expire on a real verdict, not on load, and must keep their current strictness:

- `MANAGED_ATTACH_DEADLINE_MS` and `MANAGED_CANCEL_GRACE_MS` (`src/lifecycle.rs:21,23`) — expiry yields `FencingUnconfirmed`; widening the window widens the interval in which two workers could both believe they hold a binding.
- `PROVIDER_TERMINATION_GRACE` (`src/workspace/resources.rs:27`) — a SIGTERM-to-SIGKILL escalation rung.
- `PROVIDER_TIMEOUT` (`src/workspace/resources.rs:26`) — bounds a third-party executable, and `tests/workspace_resources.rs:376-379` hard-pins it inside a 4 s–8 s window.
- `src/workspace.rs:3948` and `:4721` — both assert something about an already-fenced peer, so expiry means a real leak.
- The three-strike count in `ControlEndpoint::heartbeat` (`src/workspace/custody.rs:549-554`) — the count is the safety property.
- `EMPTY_DEADLINE` (`src/workspace/platform/linux.rs:59`) — classified B at low confidence; it is not changed here.
- The stop/empty budget split itself, and the RAII ownership of `fresh_home`.

## STOP conditions

- Any change would widen a fencing window or defer a kill escalation.
- A custody runtime action turns out not to be idempotent and a retry was already added.
- The step:load_regression test cannot be made to fail by reverting a fix.
- `plugins/session-relay/test/fixtures/rust-test-inventory.json` would need hand-editing.
- Any acceptance row regresses on the pre-existing baseline.

## Open questions

None blocking. Row 5's idempotency question is answered inside step:runtime_exchange_retry from the protocol definition, and that step carries an explicit non-retry fallback.

## Review

Plan-run: {"acceptance":null,"blocker":{"evidence_sha256":"dcaf083fb064aad77198b2261c4abf51dfa32d42adb26523848347d439e3f83c","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"f76b0e11d2f53deaa3a0518c1af5beebe4facab6b0237002adf82f0f420edfc5","invocations":2,"result_sha256":"dcaf083fb064aad77198b2261c4abf51dfa32d42adb26523848347d439e3f83c","state":"blocked"},"execution_parent":null,"goal_id":"9373c033-3c34-4774-9cf3-f5240feb538e","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-custody-deadlines.md","plan_sha256":"3463066108abf4ff3ec5c50b7e25c2fb7be6371f9c6845ea8d1602ef8b1fef76","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"e5078c54-4082-4d67-a7a9-066f81197405","schema":1,"source_base":"72d6480e8c7efdc83f08ccb20d3cf4c04a000f65","source_sha256":"846eda52c2b40610d1accb28a39a0d14ea9b1fb2293f849fa814093c35aa5baf"}

Plan-attempt-history: {"authorization_source_sha256":"9536b4f291522f749a38c661440bcfc356f2623ccb02671f6db1136e88da7408","plan_bytes_sha256":"2e5357ecf0e1eb98cf8b39facd6f0300c334916a295d37c481ba5cd9784163b9","replacement_run_id":"e5078c54-4082-4d67-a7a9-066f81197405","run":{"acceptance":{"source_sha256":"e34968a2300fdd0e9234d392d081ca9771ecaa5ff4875c55e718d5e55c03e0da","verification_sha256":"d41a324c40b1c3cdff0eb2cd2791d20062973d92bdbc5eec3e7e58a2224ad80a"},"blocker":{"evidence_sha256":"049147dba303403791b469e20851aa06cbc64d2dae13a8865422d96c2d6984e0","kind":"review_failed"},"completion_review":{"input_sha256":"bfda5009376bcd2cc38c7ac57001386fcfc469c8d819acc15707470b21ec90d5","invocations":2,"result_sha256":"049147dba303403791b469e20851aa06cbc64d2dae13a8865422d96c2d6984e0","state":"blocked"},"draft_review":{"input_sha256":"6f3041c74f3331cc59a047aadca3dcd2e6c9604cd8331791fd4d115661c9dfe1","invocations":2,"result_sha256":"063eb3ada72c7dc2da14554cebc11668c9e2be38dea29b244022418c25244522","state":"passed"},"execution_parent":"d90cca30219bf6bbe7d9984697cafec53e41178f","goal_id":"9373c033-3c34-4774-9cf3-f5240feb538e","implementation_commit":"dfa599f11970dd92f69379627c5313e2df6480ed","plan_path":"docs/plans/active/session-relay-custody-deadlines.md","plan_sha256":"4c279710ad53c18eacff5ff87b057a0fc417ed2089c3a5961c4883439d31e1f5","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"24728318-1179-42d7-be26-6bda735c2433","schema":1,"source_base":"dfa599f11970dd92f69379627c5313e2df6480ed","source_sha256":"e34968a2300fdd0e9234d392d081ca9771ecaa5ff4875c55e718d5e55c03e0da"},"schema":1,"status":"blocked","successor_run_sha256":"f9c04d886bb9875b6ff0f57406adbf4f4d2c3d39d576b9215f7adde046626118"}

Run 1 of this plan is terminal and appears above as attempt history only. Its draft review
passed on invocation 2 of 2 and its code was fully verified, but completion review spent both
permits and blocked on one prose defect: the Verification Results opening sentence named
execution_parent 989618d, which is the start checkpoint and the parent of the implementation
commit, while the record execution_parent was d90cca3. Two distinct commit identity roles were
conflated. Because that section is frozen by acceptance.verification_sha256, correcting it
required a replaced acceptance and a review permit that run no longer had.

Run 2 is authorized by the current user and starts with fresh budgets. Run 1 implementation
commit dfa599f is preserved at refs/docks/preserve/24728318-1179-42d7-be26-6bda735c2433 so the
attempt-history record above stays re-derivable, and the three local commits were rewound so
this run builds its own start checkpoint and its own implementation diff rather than binding an
ancestor commit as its implementation. The tracked source bytes are unchanged from run 1.

N/A — run 2 draft not yet reviewed.

## Verification Results
N/A — run 2 has executed nothing. The rows below are pre-implementation baselines for run 2
source_base 72d6480, measured against a genuinely pre-change worktree: run 1 landed these bytes
and was then rewound, and the eight affected paths were restored to their pre-change content
before these measurements, so no row observes its own fix.

A5, A7 and A8 are RED and together discriminate a real implementation from a no-op. A9 and A10 are
GREEN precondition and invariant guards. A1-A4 are green-before-and-after regression guards, and
draft review invocation 1 correctly rejected their original exit-bound form: rust-test-inventory.mjs
prints SKIP and exits 0 when cgroup delegation is unavailable off CI, so exit 0 did not prove the
custody tests ran. They now count the harness PASS line, each was measured executing on the
pre-change tree (69 s, 269 s, 53 s and 8 s), and A10 makes the delegation A6 depends on explicit.
Every row is re-observed for real at acceptance, when this section is rewritten with those results.

Falsifiability-proof: {"binds":"match","command_sha256":"3ee11ae80e484bbe3c152ef4be0f77877c04b3961d9cecb53de06e81a6cc686a","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"1"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 2 source_base 72d6480: run 1 landed these bytes and was then rewound, and the eight affected paths were restored to their pre-change content before this measurement, so the row does not observe its own fix. The harness printed exactly one `PASS rust_test_inventory case=workspace_lease_process` line in 69 s, so the case really executed. This row counts that line rather than testing the exit status, because rust-test-inventory.mjs prints SKIP and exits 0 when cgroup delegation is unavailable off CI, and an exit-bound row would then go green without running a single custody test. Green before and after; the target where the 3 s broker readiness budget was measured failing under load, which step:broker_event_wait removes.","row_id":"A1","source_base":"72d6480e8c7efdc83f08ccb20d3cf4c04a000f65","step_id":"broker_event_wait"}
Falsifiability-proof: {"binds":"match","command_sha256":"644bd64b048f04804d66b47deb6d3000f72a4ccdf33684e8fdd939b991901147","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"1"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 2 source_base 72d6480: run 1 landed these bytes and was then rewound, and the eight affected paths were restored to their pre-change content before this measurement, so the row does not observe its own fix. The harness printed exactly one `PASS rust_test_inventory case=workspace_coordination_process` line in 269 s, so the case really executed. This row counts that line rather than testing the exit status, because rust-test-inventory.mjs prints SKIP and exits 0 when cgroup delegation is unavailable off CI, and an exit-bound row would then go green without running a single custody test. The slowest custody target and the most exposed to any regression from step:custody_forgiveness.","row_id":"A2","source_base":"72d6480e8c7efdc83f08ccb20d3cf4c04a000f65","step_id":"custody_forgiveness"}
Falsifiability-proof: {"binds":"match","command_sha256":"e859859844723ca5e49b5e2862ca575715e5dd36aaf2e6fc5afb4f7b212f4b21","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"1"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 2 source_base 72d6480: run 1 landed these bytes and was then rewound, and the eight affected paths were restored to their pre-change content before this measurement, so the row does not observe its own fix. The harness printed exactly one `PASS rust_test_inventory case=workspace_identity` line in 53 s, so the case really executed. This row counts that line rather than testing the exit status, because rust-test-inventory.mjs prints SKIP and exits 0 when cgroup delegation is unavailable off CI, and an exit-bound row would then go green without running a single custody test. Covers the repository gate that step:gate_backoff changes.","row_id":"A3","source_base":"72d6480e8c7efdc83f08ccb20d3cf4c04a000f65","step_id":"gate_backoff"}
Falsifiability-proof: {"binds":"match","command_sha256":"97aa84535b1170c6365685e131347230703893329898b1158c41a29cc3de6eac","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"1"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 2 source_base 72d6480: run 1 landed these bytes and was then rewound, and the eight affected paths were restored to their pre-change content before this measurement, so the row does not observe its own fix. The harness printed exactly one `PASS rust_test_inventory case=workspace_resources` line in 8 s, so the case really executed. This row counts that line rather than testing the exit status, because rust-test-inventory.mjs prints SKIP and exits 0 when cgroup delegation is unavailable off CI, and an exit-bound row would then go green without running a single custody test. workspace_resources is not in the delegated set, so it had no non-execution path even before this rebinding; it is bound the same way so no row in the table can be satisfied by a skip. It carries the PROVIDER_TIMEOUT 4 s-8 s window this plan must not disturb.","row_id":"A4","source_base":"72d6480e8c7efdc83f08ccb20d3cf4c04a000f65","step_id":"load_regression"}
Falsifiability-proof: {"binds":"match","command_sha256":"c4d57f2a7b58a940dc6a128fa98cff1f5c4facc9e53454b9311662742c99ae6d","expected_sha256":"ccf7f2a69fbff091dadda5c9ae3fc6c30f79d762043cfe5c45f8902c12cebf13","observed":{"matcher":"count","result":"1"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 2 source_base 72d6480: run 1 landed these bytes and was then rewound, and the eight affected paths were restored to their pre-change content before this measurement, so the row does not observe its own fix. The awk range over fn broker_readiness_pair yields 1. This is the discriminating row for step:broker_event_wait, RED at 1 before and 0 after. File-wide the count is 3; the other two sites are unrelated listener sockets that must survive, which is why the row is scoped to the function rather than the file. It is also the ONLY discriminator for that step, because step:load_regression cannot discriminate it: an injected delay cannot make a prompt broker slow.","row_id":"A5","source_base":"72d6480e8c7efdc83f08ccb20d3cf4c04a000f65","step_id":"broker_event_wait"}
Falsifiability-proof: {"binds":"exit","command_sha256":"c2e766e106f1d4eecc488a3c2e4888aa5dd6828f196564a223944d29e5f02268","expected_sha256":"ccf7f2a69fbff091dadda5c9ae3fc6c30f79d762043cfe5c45f8902c12cebf13","observed":0,"probe":"Whole-plugin regression gate, green before and after. Exit 0 observed in run 1 at b5b797c; git diff --name-only b5b797c d90cca3 returns only docs/plans and scripts/config and git diff --name-only d90cca3 72d6480 -- plugins/session-relay/ returns nothing, so that observation holds at run 2 source_base 72d6480. Re-observed for real at acceptance. This row stays exit-bound because scripts/ci.mjs captures child output and prints it only on failure, so no PASS line reaches the gate's own stdout; A10 supplies the delegation precondition under which this exit status implies execution rather than a silent skip.","row_id":"A6","source_base":"72d6480e8c7efdc83f08ccb20d3cf4c04a000f65","step_id":"load_regression"}
Falsifiability-proof: {"binds":"match","command_sha256":"a66318f9f0a0db91d8bb4b090bd3394daff7283ca5f92832fe868f8c2e296769","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"0"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 2 source_base 72d6480: run 1 landed these bytes and was then rewound, and the eight affected paths were restored to their pre-change content before this measurement, so the row does not observe its own fix. The README does not mention idempotency, so the count is 0. RED until step:runtime_exchange_retry records which custody runtime actions tolerate a duplicate request and which forbid one.","row_id":"A7","source_base":"72d6480e8c7efdc83f08ccb20d3cf4c04a000f65","step_id":"runtime_exchange_retry"}
Falsifiability-proof: {"binds":"match","command_sha256":"d4794502fa682867a326117448ead4987a667c0aabef8058e012723d31a0fb8b","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"0"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 2 source_base 72d6480: run 1 landed these bytes and was then rewound, and the eight affected paths were restored to their pre-change content before this measurement, so the row does not observe its own fix. The README carries no deadline taxonomy, so the count is 0. RED until step:deadline_taxonomy records which constants are liveness guesses and which are safety bounds.","row_id":"A8","source_base":"72d6480e8c7efdc83f08ccb20d3cf4c04a000f65","step_id":"deadline_taxonomy"}
Falsifiability-proof: {"binds":"match","command_sha256":"82b1042d8f82322e26bd83ae78cec1eb3aad2457c0bbb34ada0fdecd0916a9ec","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"1"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 2 source_base 72d6480: run 1 landed these bytes and was then rewound, and the eight affected paths were restored to their pre-change content before this measurement, so the row does not observe its own fix. With grep -cF, RUNTIME_EXCHANGE_DEADLINE is Duration::from_secs(2) and the count is 1. GREEN today by design; an invariant guard, not a discriminator. It fails only if the shared constant is widened, which would silently relax the post-fence verdict this plan lists as out of scope. The fixed-string flag is required because this host ships pi-uu-grep 17.1.5, which defaults to extended regular expressions and would read the literal (2) as a capture group.","row_id":"A9","source_base":"72d6480e8c7efdc83f08ccb20d3cf4c04a000f65","step_id":"runtime_exchange_retry"}
Falsifiability-proof: {"binds":"exit","command_sha256":"b591052847d0765bf0847e653382350f614d467a89d07976650f4fd0e076970f","expected_sha256":"ccf7f2a69fbff091dadda5c9ae3fc6c30f79d762043cfe5c45f8902c12cebf13","observed":0,"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 2 source_base 72d6480: run 1 landed these bytes and was then rewound, and the eight affected paths were restored to their pre-change content before this measurement, so the row does not observe its own fix. systemd-run --user --scope -p Delegate=yes --collect --quiet -- true exited 0, so this host can delegate a cgroup-v2 subtree. That is the exact probe rust-test-inventory.mjs:224-227 runs before deciding whether to execute or skip the three delegated cases, so a passing A10 is what makes A6's exit status mean executed. GREEN today and green after; it is a precondition guard, not a discriminator, and it fails loudly on a host that cannot delegate instead of letting A6 report a silent skip as a pass.","row_id":"A10","source_base":"72d6480e8c7efdc83f08ccb20d3cf4c04a000f65","step_id":"load_regression"}
Falsifiability-proof: {"binds":"match","command_sha256":"a7ff3431a90b79bcc97f16542c52725295455d68c836b70e765452226d98229e","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"1"},"probe":"Measured on 2026-08-07 against the genuine pre-change worktree at run 2 source_base 72d6480: run 1 landed these bytes and was then rewound, and the eight affected paths were restored to their pre-change content before this measurement, so the row does not observe its own fix. plugins/session-relay/rust/src/workspace.rs defines fn broker_readiness_pair exactly once, so the count is 1. GREEN today and green after; this is A5's non-vacuity precondition, not a discriminator. A5 expects 0 from an awk range delimited by that function name, and an empty range also yields 0, so without this row renaming or deleting the function would satisfy A5 while proving nothing. Found by sweeping the accepted class v1_acceptance_output_mismatch across every acceptance row, not named by the review.","row_id":"A11","source_base":"72d6480e8c7efdc83f08ccb20d3cf4c04a000f65","step_id":"broker_event_wait"}

## Proposed repair

For the next authorized successor. This section is advisory and is excluded from `plan_sha256`.

Resolve f1 as a design decision before redrafting, because it changes what the plan promises rather
than how it is worded. `HEARTBEAT_FENCE_AFTER` is not a per-receive budget: `heartbeat()` receives on
`HEARTBEAT_INTERVAL` (250 ms) and fences after three consecutive misses, so 750 ms is the aggregate.
The nine raw sites already wait the full 750 ms each, so the two coherent options are:

1. Keep the aggregate at 750 ms. Have the nine sites receive on `HEARTBEAT_INTERVAL` with a
   three-miss tolerance, matching `heartbeat()` exactly. The fence and the three-strike count stay
   literally unchanged, and a late ACK inside 750 ms is admitted. This is what the current row 2
   text claims to do, and it is NOT what run 1 implemented.
2. Declare a new, larger aggregate explicitly. State the resulting per-site bound, drop the
   unchanged-fence clause, justify the widening against the fencing-window safety argument, and
   move the fence out of the do-not-touch list. Run 1 implemented this option (2250 ms) while the
   plan text asserted option 1, which is the contradiction.

Option 1 is the smaller claim and preserves the safety property the plan protects; option 2 needs an
argument that 2250 ms cannot widen a fencing window. Pick one, then correct the Context sentence that
says `heartbeat()` forgives on `HEARTBEAT_FENCE_AFTER`, and make row 2 state the effective per-site
bound so an 800 ms ACK is admitted by construction rather than by inference.

Resolve f2 mechanically by correcting each citation to the observed range: `supervisor.rs:863-875`
with fourteen `retain_runtime_fault` call sites (`:699`, `:714`, `:730`, `:738`, `:742`, `:747`,
`:761`, `:769`, `:775`, `:780`, `:790`, `:799`, `:804`, `:814`); `workspace.rs:5451-5452` for the
second `child.try_wait()`; `custody.rs:1898` onward for `wait_readable`, whose poll set is
`POLLIN|POLLHUP|POLLERR`; and `tests/workspace_resources.rs:379-382` as an elapsed-time window that
constrains `PROVIDER_TIMEOUT` only indirectly.

Carry forward from run 2, which was correct and should not be re-litigated:

- The acceptance rebinding accepted from invocation 1. A1-A4 count the harness `PASS` line because
  `rust-test-inventory.mjs:243-264` prints `SKIP` and exits 0 when cgroup delegation is unavailable
  off CI, so an exit-bound row goes green without running a single custody test.
- A10, the delegation precondition that makes A6 mean "executed", and A11, which stops A5 being
  satisfied by an empty `awk` range. A11 came from sweeping the accepted class across every row.
- The eleven measured pre-implementation proofs, taken on a genuinely pre-change tree.
- The scope-waiver widening committed as `72d6480`, which P21 requires once the waiver file is
  tracked.
