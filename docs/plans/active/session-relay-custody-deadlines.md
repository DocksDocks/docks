---
title: Stop slow-but-alive peers becoming retained custody faults
goal: Replace the custody deadlines that turn a merely slow local peer into a retained fault with event waits, forgiveness, and backoff, and prove it under contention.
plan_hash_mode: status-excluded-v1
status: planned
created: "2026-08-07T13:40:00+00:00"
updated: "2026-08-07T17:41:27.289+00:00"
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

The three custody targets need a delegated cgroup. The harness provisions one per case;
a bare `cargo test` for those targets fails on a missing
`SESSION_RELAY_TEST_CGROUP_ROOT`, which is a pre-existing environment requirement and not
a defect introduced here.

```bash
node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_lease_process
node scripts/ci.mjs --plugin session-relay
```

Contention is reproduced with N background CPU spinners; the measurements in Context used
three on a six-vCPU host.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | broker_event_wait | Replace the 3 s busy-poll readiness budget with an event wait on the existing socketpair: drop `set_nonblocking(true)`, wait via `poll()` for `POLLIN\|POLLHUP`, keep a coarse periodic `child.try_wait()` so a broker that dies without closing its fd is still detected. Retain the authenticated 32-byte token comparison and the three `Ready`/`Closed`/`Pending` outcomes unchanged. Regenerate the reentry inventory, which keys syscall sites by file and function and gains a `libc_poll` site here. | `plugins/session-relay/rust/src/workspace.rs`, `plugins/session-relay/test/fixtures/reentry-inventory.json` | — | `local` | `planned` | `workspace_lease_process` passes with 8 spinners running, and no `did not publish authenticated readiness` error appears; failure action: STOP and record the observed poll behaviour. |
| 2 | custody_forgiveness | Give all nine raw `HEARTBEAT_FENCE_AFTER` receive sites the same consecutive-miss tolerance `heartbeat()` already applies, so one slow ACK cannot fence: `command` `:505`, `finish_bootstrap` `:727`, `worker_prepared` `:754`, `activate` `:798`, `accept_bootstrap_fault` `:840` and `:851`, `confirm_empty` `:915`, `next_admitted` `:1047`, `wait_ack` `:1079`. No site keeps zero forgiveness; leaving any one raw would preserve the defect on that path. Keep the fence itself and its three-strike count unchanged. | `plugins/session-relay/rust/src/workspace/custody.rs` | — | `local` | `planned` | Every one of the nine sites tolerates a late ACK, a custodian answering after 800 ms completes the release instead of producing `custody control deadline elapsed`, and the existing 300 ms-ACK in-file tests at `custody.rs:1987` and `:2029` still pass. Failure action: STOP. |
| 3 | gate_backoff | Replace the fixed `GATE_TIMEOUT` wait with capped exponential backoff modelled on `src/watch.rs:409-414`, so queued writers retry instead of refusing at a constant 3 s. Preserve the `no mutation performed` guarantee on final expiry. | `plugins/session-relay/rust/src/workspace/repository_gate.rs` | — | `local` | `planned` | Eight concurrent workspace mutations against one repository all succeed or refuse cleanly, with zero `contention exceeded three seconds`; failure action: STOP. |
| 4 | graceful_stop_budget | Thread `GRACEFUL_STOP_DEADLINE` through as an injected parameter at its call sites, following `graceful_stop_and_wait_empty_within`, and raise the shipped default to a value justified by a measurement recorded in this step: time the SIGTERM-to-exit interval for a descheduled root under 8 spinners and set the default above the observed maximum. Do not alter the stop/empty budget split. | `plugins/session-relay/rust/src/workspace/platform/linux.rs` | — | `local` | `planned` | The measured interval and the chosen default are both recorded, the split assertions at `tests/workspace_lease_process.rs:1863-1892` still pass unchanged, and a SIGTERMed root under load no longer yields `quiesce_failed`; failure action: STOP. |
| 5 | runtime_exchange_retry | Determine from the custody runtime protocol whether `quiesce`, `terminate`, `close_lease` and `closed_committed` tolerate a duplicate request. If they do, add one bounded retry around the exchange. If any does not, introduce a separate exchange-only bound for the client socket at `:6859`/`:6862` and widen only that; `RUNTIME_EXCHANGE_DEADLINE` as reused at `src/workspace.rs:4721` is a post-fence verdict and keeps its current value either way. Record which action forbids retry and why in the crate map. | `plugins/session-relay/rust/src/workspace.rs`, `plugins/session-relay/rust/README.md` | — | `local` | `planned` | The chosen route is recorded with the protocol evidence that justified it, the bound used at `:4721` is unchanged, and no `response deadline elapsed after` error appears under 8 spinners; failure action: STOP and leave both constants unchanged. |
| 6 | load_regression | Add one regression test that drives a full workspace release under deliberate CPU contention and asserts no retained custody fault is produced. Register it in the frozen inventory via the harness generator, never by hand. | `plugins/session-relay/rust/tests/workspace_lease_process.rs`, `plugins/session-relay/test/fixtures/rust-test-inventory.json` | 1, 2, 3, 4 | `local` | `planned` | The new test fails when any one of step:broker_event_wait, step:custody_forgiveness, step:gate_backoff or step:graceful_stop_budget is reverted, and passes with all four applied; failure action: STOP, an unfalsifiable test is worse than none. |
| 7 | deadline_taxonomy | Record the A/B/C/D deadline taxonomy in the crate map so a future author can tell a liveness guess from a safety bound, naming the constants that must stay strict. | `plugins/session-relay/rust/README.md` | 1, 2, 3, 4, 5 | `local` | `planned` | The map lists every changed constant with its bucket and cites the safety bounds left untouched; failure action: STOP. |

## Acceptance criteria

| ID | Step | Command | Expected |
|---|---|---|---|
| A1 | broker_event_wait | `node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_lease_process` | `0` |
| A2 | custody_forgiveness | `node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_coordination_process` | `0` |
| A3 | gate_backoff | `node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_identity` | `0` |
| A4 | load_regression | `node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_resources` | `0` |
| A5 | broker_event_wait | `awk '/fn broker_readiness_pair/,/^}/' plugins/session-relay/rust/src/workspace.rs \| grep -c 'set_nonblocking'` | `0` |
| A6 | load_regression | `node scripts/ci.mjs --plugin session-relay` | `0` |
| A7 | runtime_exchange_retry | `grep -c 'idempotent' plugins/session-relay/rust/README.md` | `1` |
| A8 | deadline_taxonomy | `grep -c 'liveness guess' plugins/session-relay/rust/README.md` | `1` |
| A9 | runtime_exchange_retry | `grep -c 'RUNTIME_EXCHANGE_DEADLINE: Duration = Duration::from_secs(2)' plugins/session-relay/rust/src/workspace.rs` | `1` |

A4 is a regression guard, not an observation of any one step: `workspace_resources` carries the
`PROVIDER_TIMEOUT` 4 s-8 s window this plan must not disturb, so it fails if the provider bound is
touched. step:graceful_stop_budget is instead observed by A6 through step:load_regression, whose
test must fail when that step alone is reverted. A5 and A9 are the invariant pair for
step:runtime_exchange_retry's shared constant: A9 pins `RUNTIME_EXCHANGE_DEADLINE` at its current
two seconds so the post-fence verdict at `src/workspace.rs:4721` cannot be widened as a side effect
of fixing the client exchange, which must get its own bound instead. A5 is the only row that is red
today and alone separates a real implementation from a no-op. A7 records the idempotency decision
step:runtime_exchange_retry must reach before changing anything, and A8 records the taxonomy.

How each row is judged:

| Binding | Meaning | Rows |
|---|---|---|
| `exit` | the command's exit status is compared against the expected value | A1 A2 A3 A4 A6 |
| `match` | the command's output is compared against the expected value | A5 A7 A8 A9 |

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

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"6f3041c74f3331cc59a047aadca3dcd2e6c9604cd8331791fd4d115661c9dfe1","invocations":2,"result_sha256":"063eb3ada72c7dc2da14554cebc11668c9e2be38dea29b244022418c25244522","state":"passed"},"execution_parent":null,"goal_id":"9373c033-3c34-4774-9cf3-f5240feb538e","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-custody-deadlines.md","plan_sha256":"7231765b8e27f816c165a8649f75a030e71ffe9aa15e9f77e97977b7fe7f52d4","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"24728318-1179-42d7-be26-6bda735c2433","schema":1,"source_base":"b5b797c5b8950266a33ee9f85566c948e6352dea","source_sha256":"8ac784cb0202abd752a3dc2451539171ff87069856b33c67f773c59561542a2f"}

N/A — draft not yet reviewed.

## Verification Results
N/A — not started.

Proofs are pre-implementation baselines taken before any step ran.
A1-A4 and A6 are green today and are regression guards: the plan must not break them.
A5 is the only row that is red today, so it alone discriminates a real implementation from a no-op.

Proofs are pre-implementation baselines taken before any step ran.
A1-A4 and A6 are green today and are regression guards: the plan must not break them.
A5, A7 and A8 are red today and discriminate a real implementation from a no-op; A9 is a green invariant guard that fails only on an out-of-scope regression.

Falsifiability-proof: {"binds":"exit","command_sha256":"46d62042f5fe2622289d5cbb965b7c89b4242139e4fd763390381ef8e569b649","expected_sha256":"ccf7f2a69fbff091dadda5c9ae3fc6c30f79d762043cfe5c45f8902c12cebf13","observed":0,"probe":"Baseline at HEAD b5b797c on 2026-08-07: exit 0 in 55 s. Green before the change and must stay green; it is the target where the 3 s broker deadline was measured failing 5/5 under 3 spinners.","row_id":"A1","source_base":"b5b797c5b8950266a33ee9f85566c948e6352dea","step_id":"broker_event_wait"}
Falsifiability-proof: {"binds":"exit","command_sha256":"766346c8204f4558f4a46f05a31b18d991352de1a41883e7a7622eb75ca58d7e","expected_sha256":"ccf7f2a69fbff091dadda5c9ae3fc6c30f79d762043cfe5c45f8902c12cebf13","observed":0,"probe":"Baseline at HEAD b5b797c on 2026-08-07: exit 0 in 258 s. The slowest custody target, so the most exposed to any deadline regression.","row_id":"A2","source_base":"b5b797c5b8950266a33ee9f85566c948e6352dea","step_id":"custody_forgiveness"}
Falsifiability-proof: {"binds":"exit","command_sha256":"2f3f6d95cb7c5ac2ba1a565ba49fda3373456889548a8b009b3c2651b6e6f2c3","expected_sha256":"ccf7f2a69fbff091dadda5c9ae3fc6c30f79d762043cfe5c45f8902c12cebf13","observed":0,"probe":"Baseline at HEAD b5b797c on 2026-08-07: exit 0 in 50 s.","row_id":"A3","source_base":"b5b797c5b8950266a33ee9f85566c948e6352dea","step_id":"gate_backoff"}
Falsifiability-proof: {"binds":"exit","command_sha256":"c82746e1c645511d2519d1a336ce24e89fcebe8a0ef65db5ce6918f2be4c92ba","expected_sha256":"ccf7f2a69fbff091dadda5c9ae3fc6c30f79d762043cfe5c45f8902c12cebf13","observed":0,"probe":"Baseline at HEAD b5b797c on 2026-08-07: exit 0 in 7 s. Carries the PROVIDER_TIMEOUT 4 s-8 s window this plan must not disturb.","row_id":"A4","source_base":"b5b797c5b8950266a33ee9f85566c948e6352dea","step_id":"load_regression"}
Falsifiability-proof: {"binds":"match","command_sha256":"c4d57f2a7b58a940dc6a128fa98cff1f5c4facc9e53454b9311662742c99ae6d","expected_sha256":"ccf7f2a69fbff091dadda5c9ae3fc6c30f79d762043cfe5c45f8902c12cebf13","observed":{"matcher":"count","result":"1"},"probe":"Baseline at HEAD b5b797c on 2026-08-07: the awk range over fn broker_readiness_pair yields 1. This is the discriminating row: it is RED before step:broker_event_wait and 0 after. File-wide the count is 3; the other two sites (workspace.rs:6980, :7478) are unrelated sockets and must survive, which is why the row is scoped to the function rather than the file.","row_id":"A5","source_base":"b5b797c5b8950266a33ee9f85566c948e6352dea","step_id":"broker_event_wait"}
Falsifiability-proof: {"binds":"exit","command_sha256":"c2e766e106f1d4eecc488a3c2e4888aa5dd6828f196564a223944d29e5f02268","expected_sha256":"ccf7f2a69fbff091dadda5c9ae3fc6c30f79d762043cfe5c45f8902c12cebf13","observed":0,"probe":"Observed exit 0 in 330 s on 2026-08-07 against exactly the bytes committed as b5b797c; the only changes since are docs/plans and scripts/config, neither of which is in the session-relay plugin payload this gate validates.","row_id":"A6","source_base":"b5b797c5b8950266a33ee9f85566c948e6352dea","step_id":"load_regression"}
Falsifiability-proof: {"binds":"match","command_sha256":"a66318f9f0a0db91d8bb4b090bd3394daff7283ca5f92832fe868f8c2e296769","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"0"},"probe":"Baseline at HEAD b5b797c on 2026-08-07: the README does not mention idempotency, so this row is red until step:runtime_exchange_retry records which custody runtime actions tolerate a duplicate request and which forbid one.","row_id":"A7","source_base":"b5b797c5b8950266a33ee9f85566c948e6352dea","step_id":"runtime_exchange_retry"}
Falsifiability-proof: {"binds":"match","command_sha256":"d4794502fa682867a326117448ead4987a667c0aabef8058e012723d31a0fb8b","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"0"},"probe":"Baseline at HEAD b5b797c on 2026-08-07: the README carries no deadline taxonomy, so this row is red until step:deadline_taxonomy records which constants are liveness guesses and which are safety bounds.","row_id":"A8","source_base":"b5b797c5b8950266a33ee9f85566c948e6352dea","step_id":"deadline_taxonomy"}
Falsifiability-proof: {"binds":"match","command_sha256":"efe1dabb897a6bd5bd9076227935dd0fa02aca6395a9b3293296900169cff8b2","expected_sha256":"c538263d2b9ccb860eeefbce59dc553b3518b366bb51f3bff46ec46ada5f98f1","observed":{"matcher":"count","result":"1"},"probe":"Baseline at HEAD b5b797c on 2026-08-07: RUNTIME_EXCHANGE_DEADLINE is Duration::from_secs(2) and the count is 1. This row is GREEN today by design: it is an invariant guard, not a discriminator. It fails only if the shared constant is widened, which would silently relax the post-fence verdict at src/workspace.rs:4721 that this plan lists as out of scope.","row_id":"A9","source_base":"b5b797c5b8950266a33ee9f85566c948e6352dea","step_id":"runtime_exchange_retry"}
