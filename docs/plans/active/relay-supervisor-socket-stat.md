---
title: Remove the client-side ready-record read from the supervisor handshake
goal: Make the lifecycle supervisor handshake depend only on the identity frame validated over the held connection, by deleting the client-side ready-record read that races watchdog cleanup of that record.
status: blocked
created: "2026-07-31T18:18:37.005+00:00"
updated: "2026-07-31T21:57:05-03:00"
started_at: "2026-08-01T00:32:00.892+00:00"
finished_at: null
assignee: null
tags: [plans, session-relay, supervisor, lifecycle, race]
affected_paths:
  - plugins/session-relay/rust/src/supervisor.rs
  - plugins/session-relay/rust/tests/lifecycle_supervisor.rs
  - plugins/session-relay/test/fixtures/rust-test-inventory.json
related_plans: []
---

# Remove the client's ready-record read from the supervisor handshake

## Goal

`wait_control_ready` stops reading the supervisor ready record. The frame it already
validated over the held connection becomes the whole of the check, so the handshake no
longer depends on state that another process is concurrently retiring. Identity
enforcement does not weaken, and this plan proves that by mutation rather than by
assertion.

## Context & rationale

The predecessor run removed this function's socket-path stat and is recorded in
`## Review`. Its completion review found that the removal was incomplete: the record read
left behind has the same shape as the stat it replaced. This plan finishes that work with
the mechanism measured rather than assumed.

### The record read races a different process {mechanism}

The supervisor writes its ready record and then serves the connection. When the supervised
child finishes, the supervisor unlinks its socket and exits. A separate watchdog process
polls that child; once it observes the exit it calls `finish_supervisor_service`, which
removes the supervisor entry from the registry.

So the record's lifetime ends after the socket's, in another process, on a poll loop. The
client reads the record after the handshake frame arrives, which places that read in a
window bounded by how quickly the watchdog is scheduled. Measured on the current tree: with
the client held until the socket is unlinked the read still succeeds, and with a further
400 ms pause it fails with `lifecycle supervisor ready record is missing`. A loaded runner
supplies that pause for free, which is the same failure mode the predecessor set out to
remove, relocated one step later.

### The frame already proves everything the record read checks {mechanism}

`validate_identity_frame` runs over the connection the client holds, before any registry
access, and requires the frame to carry the expected kind, supervisor instance id,
operation id, operation version and control epoch.

The record comparison that follows checks three things. The supervisor instance id and the
control epoch are both bound by the frame, so they are duplicates. The third is
`state == Ready`, and the ordering makes that a duplicate too: the supervisor has exactly
one site that writes the ready record and exactly one site that sends `control_bound`, and
the write precedes the send in the same straight-line path. A frame that validates
therefore proves the ready record was written before it was sent. Re-reading the registry
cannot add that fact; it can only add a dependency on the entry still being present.

The read is deleted rather than made tolerant of a missing entry, for the same reason the
stat was: a check whose only realistic firing is a false rejection during the protocol's
normal ending is not worth keeping in a narrower form.

### What stays

The record's `socket_dev` and `socket_ino` fields keep a live reader in `ping_supervisor`,
which inspects a supervisor expected to still be serving. That path is out of scope and
unchanged. Nothing in this plan alters what the supervisor writes; only what the client
reads back.

## Environment & how-to-run

Repository `DocksDocks/docks`, Node 24 through corepack, and the pinned Rust toolchain the
relay plugin declares. Setup is `corepack enable && pnpm install --frozen-lockfile`. The
relay leg builds its own host binary, so the first run is slow.

The relay test lane requires a delegated cgroup root. Without one, an unrelated case in
`workspace_coordination_process` fails on a missing default cgroup path; the workflow
supplies `SESSION_RELAY_TEST_CGROUP_ROOT` for that reason and a local run must do the same.

Every step's effect is `local`. No step contacts GitHub, a package registry, or any remote.
The plugin is separately versioned; this plan does not release it, so no version
declaration changes and no tag is created.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Extend the existing test-only client latch so it can also wait for the watchdog to retire the ready record: add a signal written immediately after `finish_supervisor_service` returns, and have the latch block on whichever signal its variable names. | `plugins/session-relay/rust/src/supervisor.rs` | — | `local` | `planned` | An unset variable leaves timing unchanged, and a named signal that never arrives fails loudly rather than proceeding. If the signal cannot be observed from the client, STOP: the retirement site is not what this plan measured. |
| 2 | Add a case that latches on record retirement and asserts the handshake still succeeds, so the race is pinned by a test that fails before the repair. | `plugins/session-relay/rust/tests/lifecycle_supervisor.rs`, `plugins/session-relay/test/fixtures/rust-test-inventory.json` | 1 | `local` | `planned` | The A1 command reports this case failing with `lifecycle supervisor ready record is missing`. Any other message STOPS the plan, because it would mean the case is not exercising the measured window. |
| 3 | Delete the ready-record read and its comparison from `wait_control_ready`, leaving the validated frame as the whole check. | `plugins/session-relay/rust/src/supervisor.rs` | 2 | `local` | `planned` | The step-2 case passes and every other case in that binary holds the status it had at step 2. |
| 4 | Confirm the frame check is still the enforcement, using the mismatched-identity case the predecessor added. | `plugins/session-relay/rust/tests/lifecycle_supervisor.rs` | 3 | `local` | `planned` | Mutating the frame validator to accept unconditionally fails that case and only that case; restoring it returns the binary to green. |
| 5 | Run the plugin gate and record the acceptance proofs this plan's rows name. | — | 4 | `local` | `planned` | `node scripts/ci.mjs --plugin session-relay` exits 0 with the relay source check among its reported checks. |

## Acceptance criteria

| id | Command | Expected |
|---|---|---|
| A1 | `node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_supervisor` | Non-zero with step 2 applied and step 3 not applied. Record the wrapper exit, the full `test result:` summary line, and the name of the sole failing case, which must be the step-2 case and must report `lifecycle supervisor ready record is missing`. |
| A2 | `node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_supervisor` | Exit 0 once step 3 is applied. Record the full `test result:` summary line showing every case passing, including the one step 2 added. |
| A3 | non-command observable: restore only the lines step 3 deleted, run the A1 command, then delete them again and run it again | Non-zero the first time and zero the second. Record both `test result:` summary lines and the sole failing case name each time, proving the deletion is the repair rather than something incidental. |
| A4 | non-command observable: make `validate_identity_frame` return success unconditionally, run the A2 command, then restore it | Non-zero naming only the mismatched-identity case, then zero after restoring. Record both summary lines, proving the frame check is the enforcement step 3 relies on. |
| A5 | `node scripts/ci.mjs --plugin session-relay` | Exit 0 with a delegated cgroup root supplied, as the relay lane runs it. The selected-plugin gate is authoritative for this payload. |

## Out of scope / do-NOT-touch

- The supervisor's bind-time stat. It reads a socket the same process just bound and is not
  a client-side dependency.
- `ping_supervisor` and its `socket_dev`/`socket_ino` comparison, which inspects a
  supervisor expected to still be serving and is the remaining reader of those fields.
- What the supervisor writes into the ready record, and the record's schema.
- `finish_supervisor_service` itself. The watchdog retiring a finished supervisor is
  correct; the defect is the client depending on that entry.
- `MANAGED_ATTACH_DEADLINE_MS` and `READY_POLL`. Widening a deadline would hide the
  ordering defect rather than remove it.
- The release evidence contract. It failed only on the runner, because it resolves a
  pinned commit that a depth-1 checkout cannot see, and that is fixed and merged: the
  workflow now fetches full history and CI reports the contract passing. The plugin gate
  can therefore reach exit 0, and A5 needs no prerequisite. Nothing here changes it.

## STOP conditions

1. The step-1 signal cannot be observed from the client. The retirement site is then not
   what this plan measured and the mechanism must be re-measured before any deletion.
2. A1 passes before step 3. The reproduction is vacuous and A3 cannot mean anything.
3. A3 passes after restoring the deleted lines. The deletion was not the repair.
4. A4 passes with the frame validator mutated. The frame check is then not the authority
   this plan claims, and deleting the record read would genuinely weaken enforcement.
5. Any case other than the step-2 case changes status between step 2 and step 3. The change
   is broader than the ordering defect it claims to fix.

## Open questions

None. The retirement site, the process that performs it, the ordering that makes the record
read redundant, the reason a deadline change is not the fix, and the boundary against the
health path are all settled above.

Plan-run: {"acceptance":{"source_sha256":"2086119dd8f9e2bf5708045555d62598b2f31c72047bca32380122b6a0cddf3d","verification_sha256":"c3ca3a000d7bc0d78b4f5d9ece776c0886d61ab0195ca8dab55cddecd52fdf68"},"blocker":{"evidence_sha256":"c0c2b5aa60dd7f8d8f68448fceb4efe2350792769abdf220f829e9fbb634d124","kind":"review_failed"},"completion_review":{"input_sha256":"bc0aeac8c8bdcfeb3fefb5fee240d3692949607ae38738e3fe877da31f693210","invocations":1,"result_sha256":"c0c2b5aa60dd7f8d8f68448fceb4efe2350792769abdf220f829e9fbb634d124","state":"blocked"},"draft_review":{"input_sha256":"fc2f0de0290e208e457fdc7f7e740afd041e30abb0b9358377c414bc1503e036","invocations":2,"result_sha256":"89bf4dcffc01176bfa78545e2b4ba919b2322ef3ab6dc4cd88553bf7b7ae45bf","state":"passed"},"execution_parent":"ad560a92c3024077825aad0f44b0d472debce8bb","goal_id":"2557b5e7-76e6-4373-952e-0f4eba454142","implementation_commit":"3a9d4e71bc63c44036f821ac56ef0d32327dd5fb","plan_path":"docs/plans/active/relay-supervisor-socket-stat.md","plan_sha256":"c1197ec40b0502fd1716be7d5c3f496ff332960c6b558f22deb5a9feccdcb636","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"8a74adb1-d494-4220-8a84-6ca21b9dd5a0","schema":1,"source_base":"085e0d064bd1dfb752827f8eb2c24262d6fa5c6f","source_sha256":"41de82673a0a7eb0d1e8f33d97b72edcfac5780b59d5e0b28c706e59597c7871"}

## Review

Draft review passed on invocation 2 after one accepted repair (F1: a stale claim that the
release evidence contract still failed).

Completion review 1 of 2 returned blocked with two reproduced findings:

- **C1** The implementation deletes an orphaned reader from lifecycle.rs, which is not a
  declared affected path. Acceptance binds three paths and the checkpoint contains four, so
  the run carries a change acceptance cannot certify. The deletion was forced: the client
  read was its only caller and the gate denies warnings.
- **C2** A4 requires the restored run and its summary; only the mutated failing run was
  recorded. That evidence has since been captured for a successor.

Neither is repairable inside this run, because affected_paths is bound by plan_sha256 and
cannot move while ongoing. The implementation is green at its checkpoint. A successor must
declare all four touched paths before starting.

Plan-attempt-history: {"authorization_source_sha256":"41ba374a8169920653c43bbaa284b0fa3b6303093c5833b9c5b7152895931ed6","plan_bytes_sha256":"9b8953d464d6cf54896213f6ebb0afc3243e80d0cf660481effdd134cef0a77e","replacement_run_id":"8a74adb1-d494-4220-8a84-6ca21b9dd5a0","run":{"acceptance":{"source_sha256":"40035bc0d2c73a5a362d60331b72dc0d8e4e577190019788519d1e54c1ca4e95","verification_sha256":"9ef7e1fbdc7548f3b81efad23c2634efec7c327f48ce53b89f3ed41ad3e630c2"},"blocker":{"evidence_sha256":"5b68f6295e8fba7f419defc036d4281b0945df5ddca4d6c868233a599ec95fc7","kind":"review_failed"},"completion_review":{"input_sha256":"ba483ce0b629e3bb395dc59c01146ed64644f5fa09dc2c4668f46bf7c9e330ba","invocations":2,"result_sha256":"5b68f6295e8fba7f419defc036d4281b0945df5ddca4d6c868233a599ec95fc7","state":"blocked"},"draft_review":{"input_sha256":"129b12a1d821983827e88a7aaefa78f9661a5b872d4bb9338b372dff5791d272","invocations":1,"result_sha256":"5c92499ff415ab00dc0593e547c7e851f2c2fc3d4f9bdae9b0665bdae18726de","state":"passed"},"execution_parent":"27a9f0c76a005d5838a638176b7dbb2eb8c8e197","goal_id":"2557b5e7-76e6-4373-952e-0f4eba454142","implementation_commit":"fcade333f1d95aca654a965552f75c96b48334b7","plan_path":"docs/plans/active/relay-supervisor-socket-stat.md","plan_sha256":"e638f67f1c19e782140ce41705aa9bc93e7dd668f6f344d8538ec01b1dc2cabf","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"440e31f9-8323-4b0f-b909-ef77c1b3a826","schema":1,"source_base":"a1c6a3130144834da6bfc5983567df16d7407eab","source_sha256":"3a9dac614c15bc1f2089025d3a0a7bd4cf24e2e0cdf00a46d963d61f9afa7f54"},"schema":1,"status":"blocked","successor_run_sha256":"e06cf44a5fac01d4b5a73c56c35a2f363dbeab28ab396ac437b7354635861dcb"}

## Verification Results

Every command below was run at the repository root. Exit codes, summary lines and quoted
text are copied from the runs, not reconstructed.

### A1 - the reproduction is red, through the command the row names

With step 2 applied and step 3 reverted, meaning the ready-record read and its reader
method restored verbatim:

```
node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_supervisor
wrapper exit: 1
test result: FAILED. 11 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out
test lifecycle_supervisor_handshake_survives_a_retired_ready_record ... FAILED
lifecycle supervisor ready record is missing
```

The sole failing case is the one step 2 added, the other eleven pass in that same state,
and the message is the one the mechanism predicts. The failure is not a latch timeout: the
latch reports `ready-record-retired latch never fired` when its signal does not arrive, and
that text does not appear.

### A2 - the fixed state, whole binary

```
node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_supervisor
wrapper exit: 0

cargo test --locked --test lifecycle_supervisor -- --test-threads=1
test result: ok. 12 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

The wrapper prints no summary when it succeeds, so the binary summary is recorded from a
direct run of the same tree. All twelve cases pass, including both cases this plan and its
predecessor added.

### A3 - the deletion is what fixed it

Restoring only the lines step 3 deleted and running the A1 command produces the A1 result
above: wrapper exit 1, `FAILED. 11 passed; 1 failed`, sole failing case
`lifecycle_supervisor_handshake_survives_a_retired_ready_record`. Deleting them again and
re-running produces the A2 result: wrapper exit 0, `ok. 12 passed; 0 failed`.

Both restores were performed with `git checkout --` against the implementation checkpoint
rather than by re-applying text, and `git status --porcelain` reported zero entries
afterwards, so the green state is the committed bytes and not a near-miss.

### A4 - the frame check is the enforcement this deletion relies on

`return Ok(());` injected as the first statement of `validate_identity_frame`:

```
node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_supervisor
wrapper exit: 1
test result: FAILED. 11 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out
test lifecycle_supervisor_refuses_a_mismatched_supervisor_identity ... FAILED
```

Exactly the mismatched-identity case failed and nothing else, so removing the record read
did not remove enforcement. Restoring the file returned the tree to zero dirty entries.

### A5 - the selected-plugin gate

```
SESSION_RELAY_TEST_CGROUP_ROOT=<delegated cgroup> node scripts/ci.mjs --plugin session-relay
exit: 0
All ci.mjs checks passed — plugin 'session-relay'; safe to release.
```

The cgroup root is a host requirement, not a consequence of this change: `delegated_root`
falls back to a path under `/sys/fs/cgroup` that this host does not provide and that an
unprivileged user cannot create. The relay lane in the workflow supplies the same variable,
so this run matches how the gate runs in CI.

### Why the record read was deleted rather than retried

The window is real and was measured before the deletion. Holding the client until the
supervisor unlinks its socket still reads the record successfully; holding it a further
400 ms fails with `lifecycle supervisor ready record is missing`. The retirement happens in
a different process: the supervisor exits, the watchdog observes that exit on a 250 ms
poll, and `finish_supervisor_service` removes the entry.

Deleting rather than retrying is justified by ordering, not by preference. `run_supervisor`
has exactly one site that writes the ready record and exactly one that sends
`control_bound`, and the write precedes the send on the same straight-line path, so a
validated frame already proves the record was written. The other two comparisons are fields
the frame binds. A retry would have re-derived a fact the frame already carried, while
keeping a dependency on an entry the protocol is entitled to remove.

### Scope note recorded rather than hidden

**Outside acceptance evidence: `plugins/session-relay/rust/src/lifecycle.rs`.**

`plugins/session-relay/rust/src/lifecycle.rs` is committed in the implementation checkpoint
but is not a declared affected path, so it sits outside the acceptance manifest, which binds
exactly the three declared paths. Deleting the client read left
`read_supervisor_for_session_from_operation` with no caller anywhere in the crate, and the
gate runs clippy with `-D warnings`, so the choice was to delete the orphaned reader or to
suppress a warning. Suppression is prohibited, so it was deleted. A cascade check confirmed
its helpers keep other callers, and clippy over all targets reports no warnings.

The generated test-surface declaration is a declared path this time. The predecessor met
that file as an undeclared surprise; this plan declared it before starting.
