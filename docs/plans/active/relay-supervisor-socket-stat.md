---
title: Remove the lifecycle supervisor socket stat that races its own cleanup
goal: Delete the client-side socket path stat from the lifecycle supervisor handshake, because the frame the client already validated binds strictly more identity than that stat can, and the stat fails whenever the supervisor retires the socket first.
status: blocked
created: "2026-07-31T18:18:37.005+00:00"
updated: "2026-07-31T17:12:41-03:00"
started_at: "2026-07-31T19:05:59.976+00:00"
finished_at: null
assignee: null
tags: [plans, session-relay, supervisor, lifecycle, race]
affected_paths:
  - plugins/session-relay/rust/src/supervisor.rs
  - plugins/session-relay/rust/tests/lifecycle_supervisor.rs
related_plans: []
---

# Remove the lifecycle supervisor socket stat that races its own cleanup

## Goal

`node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_supervisor`
passes on a GitHub runner. The client leg of the handshake stops inspecting the socket
path after the connection is established, because the frame it already validated proves
more about that connection than the path can, and the path may legitimately be gone by
then. Identity enforcement does not weaken: the frame check becomes the sole authority
and this plan proves it is load-bearing.

## Context & rationale

One test fails, and only on CI. Measured from run 30653654341, the failing case is
`lifecycle_supervisor_preserves_codex_fast_and_default_tiers_in_exact_argv`; the other
eight cases in that binary pass. The panic text is
`stat lifecycle supervisor socket: No such file or directory (os error 2)`, and the run
reports `8 passed; 1 failed`. Two runs of the same commit and one of its successor
reproduced it, so it is deterministic on that host and absent on this one.

An earlier commit narrowed the window at the supervisor's own bind-time stat. That was
the wrong site. Exactly two places emit that message:

- `plugins/session-relay/rust/src/supervisor.rs:1327-1328`, inside `run_supervisor`,
  which stats the socket it has just bound and keeps the result as the identity it will
  publish. This runs in the supervisor process.
- `plugins/session-relay/rust/src/supervisor.rs:1651-1652`, inside
  `wait_control_ready`, which stats the path again and compares it against the published
  record. This runs in the client process, reached from `run_child_with_guard` at
  `plugins/session-relay/rust/src/supervisor.rs:1083-1085`.

The failing message comes from the client site, which that earlier commit never touched.

### Why the path can be gone {mechanism}

The supervisor publishes its record with `state` set to ready at
`plugins/session-relay/rust/src/supervisor.rs:1447-1460`, writes the `control_bound`
frame, serves the connection, and then removes the socket at
`plugins/session-relay/rust/src/supervisor.rs:1471-1473`. That final removal has no
guard. The client reads `control_bound` and only then stats the path
(`plugins/session-relay/rust/src/supervisor.rs:1651-1652`), so whenever the supervised
child finishes before the client is next scheduled, the client stats a path the
supervisor has already unlinked and the handshake fails.

This is one run racing itself, not two runs sharing a namespace. The socket filename
cannot collide: `supervisor_socket_path` composes `std::env::temp_dir()` with
`relay-lifecycle-{}.sock` over a sanitized operation id
(`plugins/session-relay/rust/src/supervisor.rs:1670-1675`), every operation id is a
fresh v4 identifier minted at
`plugins/session-relay/rust/src/lifecycle.rs:1306-1308`, and the inventory runs this
binary with `--test-threads=1`
(`plugins/session-relay/test/rust-test-inventory.mjs:194-198`). Renaming the socket or
moving it out of the shared temporary directory would therefore fix nothing.

The injected delay explains why CI sees it and this host does not. The failing test asks
the supervisor to sleep before two named startup phases, read at
`plugins/session-relay/rust/src/supervisor.rs:1037-1042`, which moves the client's stat
later relative to the supervisor's cleanup. A loaded two-core runner completes that
reordering.

### The frame already binds more than the stat {mechanism}

`wait_control_ready` validates the received frame at
`plugins/session-relay/rust/src/supervisor.rs:1650` before touching the filesystem.
`validate_identity_frame`, at
`plugins/session-relay/rust/src/supervisor.rs:2728-2745`, requires the frame to carry
the expected kind, the supervisor instance id, the operation id, the operation version,
and the control epoch, each equal to the launch the client prepared. That check runs
over the connection the client is holding.

The comparison at `plugins/session-relay/rust/src/supervisor.rs:1656-1662` then re-reads
the persisted record and compares five things. The instance id and the control epoch
duplicate the frame. The operation version, which the frame does bind, is absent there,
so the record comparison is a strict subset on identity. Only two parts are not
duplicated: the record's ready state, which is a store fact worth keeping, and the
device and inode numbers, which come from the path.

Those device and inode numbers cannot do the job they appear to do. They are read after
the connection exists and are never compared against the connected descriptor, so they
cannot establish which inode the connection reached. A replaced socket would be caught
only if the replacement happened to be visible in the window between connecting and
statting, and would be missed otherwise. Meanwhile an absent path, which is the
protocol's own normal ending, fails the handshake outright.

So the path comparison is redundant on the identity it shares with the frame, unable to
decide the one question it seems to answer, and the sole cause of the observed failure.
It is removed rather than made tolerant of a missing file: a check that cannot catch the
attack it implies, and whose only realistic firing is a false rejection, should not be
kept in a narrower form. The record read stays, for the ready state.

The similar comparison in the health path at
`plugins/session-relay/rust/src/lifecycle.rs:6106-6110` is a different case and is out
of scope: it inspects a supervisor expected to still be serving, not one whose socket
the protocol has already retired.

## Environment & how-to-run

Repository `DocksDocks/docks`, Node 24 through corepack, and the pinned Rust toolchain
the relay plugin declares. Setup is `corepack enable && pnpm install --frozen-lockfile`.
The relay leg builds its own host binary, so the first run is slow.

Every step's effect is `local`. No step contacts GitHub, a package registry, or any
remote. The plugin is separately versioned; this plan does not release it, so no version
declaration changes and no tag is created.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Add a test-only knob that suspends the client between reading the `control_bound` frame and inspecting the socket path, mirroring the existing supervisor delay knob, so the reordering CI produces is reproducible on any host. | `plugins/session-relay/rust/src/supervisor.rs` | — | `local` | `planned` | The knob is read only when its environment variable is set, and an unset variable leaves timing unchanged. If it cannot make the failure appear locally, STOP: the mechanism above is unproven and needs a new measurement, not a fix. |
| 2 | Add a case that sets the step-1 knob and asserts the handshake succeeds, pinning the race with a test that fails before the repair. | `plugins/session-relay/rust/tests/lifecycle_supervisor.rs` | 1 | `local` | `planned` | `cargo test --locked --test lifecycle_supervisor` names the new case and reports it failing with the same absent-path message CI produced. A different message STOPS the plan. |
| 3 | Delete the client's socket path stat and the device and inode comparison, keeping the record read and its ready-state check. | `plugins/session-relay/rust/src/supervisor.rs` | 2 | `local` | `planned` | The step-2 case passes and the eight pre-existing cases in that binary still pass. |
| 4 | Add a case proving the frame validation refuses a mismatched supervisor identity, so step 3 cannot be read as removing enforcement. | `plugins/session-relay/rust/tests/lifecycle_supervisor.rs` | 3 | `local` | `planned` | Mutating the frame validator to accept a mismatch makes this case fail; with the validator intact it passes. |
| 5 | Run the plugin gate and record the acceptance proofs this plan's rows name. | — | 4 | `local` | `planned` | `node scripts/ci.mjs --plugin session-relay` exits 0 with the relay source check among its reported checks. |

## Acceptance criteria

| id | Command | Expected |
|---|---|---|
| A1 | non-command observable: with step 2 applied and step 3 not yet applied, `node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_supervisor` | Non-zero, naming the step-2 case and the absent-path message. This is the reproduction; a pass means step 1 did not widen the window and the plan STOPS. |
| A2 | `node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_supervisor` | Exit 0 once step 3 is applied, every case in the binary passing, including the one step 2 added. This is the check CI reported failing. |
| A3 | non-command observable: restore only the lines step 3 deleted, rerun the A2 command, then delete them again | Non-zero on the step-2 case alone, proving the deletion is what fixed it rather than something incidental. |
| A4 | non-command observable: make `validate_identity_frame` return success unconditionally, rerun the A2 command, then restore it | Non-zero on the step-4 case, proving the frame check is the enforcement step 3 relies on. |
| A5 | `node scripts/ci.mjs --plugin session-relay` | Exit 0. The selected-plugin gate is authoritative for this payload and its owned release tooling. |

## Out of scope / do-NOT-touch

- `plugins/session-relay/test/release-evidence-contract.mjs`, which fails on the same
  runs for an unrelated reason. It is a separate defect and needs its own plan.
- The supervisor's bind-time stat at
  `plugins/session-relay/rust/src/supervisor.rs:1327-1328`. It reads a socket the same
  process just bound and is not the failing site.
- The health comparison at
  `plugins/session-relay/rust/src/lifecycle.rs:6106-6110`, which inspects a supervisor
  expected to still be serving.
- `MANAGED_ATTACH_DEADLINE_MS` and `READY_POLL`. Widening a deadline would hide the
  ordering defect rather than fix it.
- The socket path composition. Operation ids are already unique per run.
- Any version declaration, tag, or release artifact for the relay plugin.

## STOP conditions

1. The step-1 knob does not reproduce the failure locally. The mechanism is unproven and
   the plan returns to measurement.
2. A1 passes before step 3. The reproduction is vacuous and A3 cannot mean anything.
3. A3 passes after restoring the deleted lines. The deletion was not the repair.
4. A4 passes with the frame validator mutated. The frame check is then not the authority
   this plan claims, and removing the path comparison would genuinely weaken identity
   enforcement rather than remove a duplicate.
5. Any pre-existing case in that binary changes status at step 3. The change is broader
   than the ordering defect it claims to fix.

## Open questions

None. The failing site, the mechanism, the reason a shared temporary directory is not
implicated, the decision to delete the path comparison rather than make it tolerate a
missing file or widen a deadline, the requirement that the frame check be proven
load-bearing before that deletion is accepted, and the exclusion of the unrelated
release contract and health path are all settled above.

Plan-run: {"acceptance":{"source_sha256":"40035bc0d2c73a5a362d60331b72dc0d8e4e577190019788519d1e54c1ca4e95","verification_sha256":"9ef7e1fbdc7548f3b81efad23c2634efec7c327f48ce53b89f3ed41ad3e630c2"},"blocker":{"evidence_sha256":"5b68f6295e8fba7f419defc036d4281b0945df5ddca4d6c868233a599ec95fc7","kind":"review_failed"},"completion_review":{"input_sha256":"ba483ce0b629e3bb395dc59c01146ed64644f5fa09dc2c4668f46bf7c9e330ba","invocations":2,"result_sha256":"5b68f6295e8fba7f419defc036d4281b0945df5ddca4d6c868233a599ec95fc7","state":"blocked"},"draft_review":{"input_sha256":"129b12a1d821983827e88a7aaefa78f9661a5b872d4bb9338b372dff5791d272","invocations":1,"result_sha256":"5c92499ff415ab00dc0593e547c7e851f2c2fc3d4f9bdae9b0665bdae18726de","state":"passed"},"execution_parent":"27a9f0c76a005d5838a638176b7dbb2eb8c8e197","goal_id":"2557b5e7-76e6-4373-952e-0f4eba454142","implementation_commit":"fcade333f1d95aca654a965552f75c96b48334b7","plan_path":"docs/plans/active/relay-supervisor-socket-stat.md","plan_sha256":"e638f67f1c19e782140ce41705aa9bc93e7dd668f6f344d8538ec01b1dc2cabf","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"440e31f9-8323-4b0f-b909-ef77c1b3a826","schema":1,"source_base":"a1c6a3130144834da6bfc5983567df16d7407eab","source_sha256":"3a9dac614c15bc1f2089025d3a0a7bd4cf24e2e0cdf00a46d963d61f9afa7f54"}

## Review

Draft review passed on invocation 1 with zero findings.

Completion review spent both permits. Invocation 1 returned `repair` with one finding
(C1: a comment claiming `wait_control_ready` compares the socket path metadata), which
was reproduced, accepted and repaired; the implementation checkpoint was amended rather
than stacked. Invocation 2 returned `repair` with two further findings, both reproduced:

- **C1** The latch proves the socket was unlinked, not that the ready record survives.
  A 400 ms sleep inserted after the latch and before the record read fails the new case
  with `lifecycle supervisor ready record is missing`. The record read that this plan
  kept has the same race shape as the stat it removed, so the handshake is not free of
  retired-state dependence and A2 is not safe on a loaded runner. Closing it needs a
  bounded client acknowledgement holding the supervisor alive across that read - a
  design change wider than the reviewed scope.
- **C2** A1 and A3 name the Node inventory command in the pre-step-3 state; the recorded
  evidence is a filtered `cargo test --exact` run and bare exit codes, so it does not
  establish that the new case alone failed or that the nine pre-existing cases held
  their status.

Accepting a repair on invocation 2 is a terminal block by contract. This run is
immutable. Reopening the goal requires exact current-user replacement authority on this
same path; no `v2` file exists or may be created.

## Verification Results

Every command below was run in `/home/vagrant/projects/docks`. Exit codes and quoted
text are copied from the runs, not reconstructed.

### A1 - the reproduction is red, and red for the stated reason

With step 2 applied and step 3 reverted (the `fs::metadata` call and the
`socket_dev`/`socket_ino` comparison restored verbatim):

```
cd plugins/session-relay/rust
cargo test --locked --test lifecycle_supervisor -- \
  --exact lifecycle_supervisor_handshake_survives_a_retired_socket_path
exit=101
stat lifecycle supervisor socket: No such file or directory (os error 2)
```

That is byte-identical to the text CI run 30653654341 produced. The same log contains no
`deadline`, `timed out`, or `timeout` match, so the red is the ordering defect and not a
widened-deadline artifact.

### A2 - the check CI reported failing now passes, whole binary

```
node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_supervisor
exit=0

cd plugins/session-relay/rust
cargo test --locked --test lifecycle_supervisor -- --test-threads=1
test result: ok. 11 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

All 11 named cases are listed as `ok`, so the 9 pre-existing cases are unchanged in
status and STOP condition 5 does not fire.

### A3 - the deletion is what fixed it

```
restore the two deleted regions   -> exit=101
  stat lifecycle supervisor socket: No such file or directory (os error 2)
delete them again                 -> exit=0
```

The restored file was byte-compared against the pre-mutation copy (`cmp -s` reported
identical), so the green is the same bytes that shipped, not a different edit.

### A4 - the frame check is the enforcement the deletion relies on

`return Ok(());` injected as the first statement of `validate_identity_frame`:

```
cargo test --locked --test lifecycle_supervisor -- --test-threads=1
test result: FAILED. 10 passed; 1 failed
test lifecycle_supervisor_refuses_a_mismatched_supervisor_identity ... FAILED
```

Exactly the step-4 case failed and nothing else. Restoring the file (`cmp -s` identical)
returns the binary to 11 passed.

### A5 - the selected-plugin gate

```
SESSION_RELAY_TEST_CGROUP_ROOT=<delegated cgroup> node scripts/ci.mjs --plugin session-relay
exit=0
✔ All ci.mjs checks passed — plugin 'session-relay'; safe to release.
```

The cgroup root is required by the host, not by this change. `delegated_root()` in
`plugins/session-relay/rust/src/workspace/platform/linux.rs:270-292` falls back to
`/sys/fs/cgroup/session-relay-<euid>`, which does not exist here and which
`mkdir -p /sys/fs/cgroup/session-relay-1000` refuses with `Permission denied`. Without the
variable, `overlapping_path_claims_are_atomic_and_refused` in
`workspace_coordination_process` fails with
`stat cgroup /sys/fs/cgroup/session-relay-1000: No such file or directory (os error 2)`.
That failure was reproduced with this change stashed, at HEAD, with identical text, so it
is environmental and predates this work. The relay lane in `.github/workflows/ci.yml`
supplies the same variable, so this run matches how CI runs the gate.

### Deviation from step 1, and why

Step 1 asked for a delay knob mirroring the supervisor's startup knob. It is implemented
as a latch instead: the supervisor writes a signal immediately after it unlinks the
socket, and the client blocks on that signal. A tuned sleep was implemented first and
measured, then rejected:

```
SWEEP_MS   0 -> PASS      300 -> failed, different cause
          25 -> PASS      750 -> failed, different cause
         100 -> PASS
```

At 300 ms and beyond the operation had terminalized and the failure became
`lifecycle supervisor ready record is missing`, which is not the failure CI reports. A
sleep therefore selects between two different states by load, which is the same class of
defect this plan removes. The latch reproduces one exact interleaving at any load, fails
loudly when the signal never arrives rather than degrading into a silent pass, and the
case asserts the signal file exists so it cannot pass without reaching the window. The
step-1 done-when still holds: the variable is read only when set, and unset leaves timing
unchanged.

### Scope note recorded rather than hidden

`plugins/session-relay/test/fixtures/rust-test-inventory.json` is the generated
declaration of the relay test surface. Adding a case necessarily changes it, and the plan
did not declare it. It could not be added to `affected_paths` mid-run: that set is inside
`canonicalPlanView`, so editing it moves `plan_sha256`, and `assertPersistedTransition`
admits no ordinary transition that changes `plan_sha256`. It was regenerated with the
file's own `--generate` mode, its diff is the two new case names and nothing else, and it
is committed in the implementation checkpoint through `ownedPaths`. The acceptance
manifest binds exactly the two declared paths, so this file sits outside acceptance
evidence.

### Completion review 1 of 2, and the repair it produced

Invocation 1 returned `repair` with one finding, C1: the surviving comment at the
supervisor's bind-time stat claimed `wait_control_ready` compares the socket path's
device and inode against the record, which this change deletes.

The finding was reproduced before it was accepted. The comment did say that, at
`supervisor.rs:1355-1357`. The repair corrects only those sentences and leaves the
bind-time stat unchanged, because a `stat` of the path is still the right identity there:

```
grep -rn 'socket_dev\|socket_ino' src/
  src/supervisor.rs:1487-1488   written by run_supervisor
  src/lifecycle.rs:6109         read by ping_supervisor
```

So the fields keep a live reader and are not orphaned by this change; only the attribution
to `wait_control_ready` was false. A sweep of the whole relay Rust tree for sibling prose
asserting the client compares or stats the path found no other stale claim. The
"substituting an fstat failed six lifecycle tests" sentence is kept but re-scoped as
history, because that measurement was taken while the client still compared them.

After the repair: `cargo fmt --check` clean, `test result: ok. 11 passed; 0 failed`, and
`node scripts/ci.mjs --plugin session-relay` exit 0 with the delegated cgroup root. The
implementation checkpoint was amended rather than stacked, because it is unpublished and
sensitive work owns three checkpoints, not four.
