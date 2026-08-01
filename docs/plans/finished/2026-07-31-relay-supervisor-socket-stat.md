---
title: Keep the frame-corruption test knob out of released relay binaries
goal: Gate the test-only supervisor identity override behind debug assertions so it cannot reach a release artifact, and certify the merged handshake change against every path it touched.
status: finished
created: "2026-07-31T18:18:37.005+00:00"
updated: "2026-08-01T01:49:35.204+00:00"
started_at: "2026-08-01T01:36:21.452+00:00"
finished_at: "2026-08-01T01:49:35.204+00:00"
assignee: null
tags: [plans, session-relay, supervisor, lifecycle, release]
affected_paths:
  - plugins/session-relay/rust/src/lifecycle.rs
  - plugins/session-relay/rust/src/supervisor.rs
  - plugins/session-relay/rust/tests/lifecycle_supervisor.rs
  - plugins/session-relay/test/fixtures/rust-test-inventory.json
related_plans: []
---

# Keep the frame-corruption test knob out of released relay binaries

## Goal

`RELAY_TEST_CORRUPT_CONTROL_FRAME` stops existing in release builds. The proof it supports
keeps working in the test profile, and acceptance binds all four paths the handshake work
touched, which the two predecessor runs could not do.

## Context & rationale

The handshake work is merged and green: the client no longer stats the socket path and no
longer reads the ready record, twelve cases pass, and the selected-plugin gate exits 0.
Two predecessor runs are recorded in `## Review`. Both blocked for the same structural
reason rather than a defect in the code: each declared its affected paths at draft time and
then discovered another path while implementing. This run declares the set taken from the
implementation itself, so that class of block cannot repeat.

### The knob should not ship {mechanism}

Proving that the identity frame is load-bearing needs a way to make the supervisor send a
mismatched instance id, so the client can be observed refusing it. That override reads an
environment variable and is compiled unconditionally, and the relay plugin distributes
prebuilt binaries. A switch whose only purpose is to falsify an identity assertion does not
belong in a shipped artifact, even one that can only cause a refusal rather than an
acceptance.

The two timing latches are different and stay as they are: they delay a client between
steps it already performs, and they assert nothing. This plan changes only the override
that falsifies identity.

The test profile keeps the proof. The relay inventory runs `cargo test --locked`, which
builds with debug assertions on, and the distribution contract builds the shipped binary
with `--release`, which turns them off. A `debug_assertions` gate therefore preserves every
existing case while removing the switch from what users receive.

### What this run certifies

The predecessor was blocked because its acceptance bound three paths while its checkpoint
contained four. Acceptance here binds all four, so the merged handshake change and the
orphaned-reader deletion that followed it are covered by one manifest.

## Environment & how-to-run

Repository `DocksDocks/docks`, Node 24 through corepack, and the pinned Rust toolchain the
relay plugin declares. Setup is `corepack enable && pnpm install --frozen-lockfile`.

The relay lane needs a delegated cgroup root. Without one, an unrelated case in
`workspace_coordination_process` fails on a missing default cgroup path; the workflow
supplies `SESSION_RELAY_TEST_CGROUP_ROOT` and a local run must do the same.

Every step's effect is `local`. No step contacts GitHub, a package registry, or any remote.
This plan does not release the plugin, so no version declaration changes and no tag is
created.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Record that the released binary currently contains the override, so the removal has a measured before-state. | — | — | `local` | `planned` | A release build of the relay binary contains the literal `RELAY_TEST_CORRUPT_CONTROL_FRAME`. If it does not, STOP: the premise is wrong and nothing needs gating. |
| 2 | Gate the override behind `debug_assertions`, leaving the real instance id as the only value a release build can send. | `plugins/session-relay/rust/src/supervisor.rs` | 1 | `local` | `planned` | The gated form compiles under both profiles, and `cargo clippy --release --all-targets` reports no warnings. |
| 3 | Confirm the proof still holds in the test profile. | `plugins/session-relay/rust/tests/lifecycle_supervisor.rs` | 2 | `local` | `planned` | The mismatched-identity case still passes, and mutating the frame validator to accept unconditionally still fails that case and only that case. |
| 4 | Run the plugin gate and record the acceptance proofs these rows name. | — | 3 | `local` | `planned` | `node scripts/ci.mjs --plugin session-relay` exits 0 with the relay source check among its reported checks. |

## Acceptance criteria

| id | Command | Expected |
|---|---|---|
| A1 | non-command observable: build the relay binary with `--release` before step 2 and search it for the literal `RELAY_TEST_CORRUPT_CONTROL_FRAME` | The literal is present. This is the before-state; its absence STOPS the plan because there would be nothing to gate. |
| A2 | non-command observable: rebuild with `--release` after step 2 and search the binary for the same literal | Absent. Record the search command and both results, so the removal is a comparison against captured output rather than a claim. |
| A3 | `node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_supervisor` | Exit 0. Record the full `test result:` summary line showing all twelve cases passing, so the gate did not disable a case. |
| A4 | non-command observable: make `validate_identity_frame` return success unconditionally, run the A3 command, then restore it | Non-zero naming only the mismatched-identity case, then zero after restoring. Record both summary lines and the sole failing case name, proving the gated override still drives a real proof. |
| A5 | `node scripts/ci.mjs --plugin session-relay` | Exit 0 with a delegated cgroup root supplied, as the relay lane runs it. The selected-plugin gate is authoritative for this payload and its owned release tooling. |

## Out of scope / do-NOT-touch

- The handshake change itself, which is merged and green. This run certifies it and does not
  reopen it.
- The two timing latches. They delay a client between steps it already performs and assert
  nothing, so they are not in the same category as an identity override.
- `ping_supervisor` and the record fields it reads, which serve a supervisor expected to
  still be serving.
- The supervisor bind-time stat.
- Any version declaration, tag, or release artifact for the relay plugin. Gating a symbol
  out of a future build is not a release.

## STOP conditions

1. A release build does not contain the literal before step 2. The premise is wrong.
2. The gated form fails to compile under either profile, or clippy reports a warning under
   `--release`. A suppression is not an acceptable substitute.
3. The mismatched-identity case stops passing in the test profile after step 2. The gate
   removed the proof rather than the exposure.
4. A4 passes with the frame validator mutated. The case is then not proving what it claims
   and the gate cannot be judged safe on its evidence.

## Open questions

None. The exposure, the profile split that makes a debug gate safe, the reason the timing
latches are excluded, and the four paths acceptance must bind are all settled above.

Plan-run: {"acceptance":{"source_sha256":"51ea03fa0ad6a153d5d28106705a88b67d06814f5b2006fed017f55b60be893a","verification_sha256":"665c8abda49717441ac724d0e9a4d7422439739e2dac5bd61c3d2ce31cbde757"},"blocker":null,"completion_review":{"input_sha256":"e08c4574c585a14c406a2545c3291c9a648fe062bf8ce79c15ed8246bcc33b73","invocations":1,"result_sha256":"77999ccee2b6e8c8490cfff326773fa579f998fe29d658d90b2cefe4ac41f2a9","state":"passed"},"draft_review":{"input_sha256":"f395a6d754e81fdf0ef4e4e88399ec616f08cf76fc9dcdcc6ba9c9b4b8dc8c16","invocations":1,"result_sha256":"f441bdbf00a9dab5a8d28ca059fd38e27d4c70b9390a3e948e9d8872eade9246","state":"passed"},"execution_parent":"a5c9020b2d6ec552e9728f2c4c7d7aa43d1f09e0","goal_id":"2557b5e7-76e6-4373-952e-0f4eba454142","implementation_commit":"a68f733916f5d3c37202b008db76ddd50fb3dfc2","plan_path":"docs/plans/active/relay-supervisor-socket-stat.md","plan_sha256":"472b7f76206626e79314ee92951a340c8341550cd52c5f78b174a7f2b3fc953f","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"321a83d9-985c-4354-a30f-519d6cf58118","schema":1,"source_base":"a5c9020b2d6ec552e9728f2c4c7d7aa43d1f09e0","source_sha256":"7f3c2ff939105090d9269fdca15ab67bccce17e16c082aa176e19653808725c2"}

## Review

Plan-attempt-history: {"authorization_source_sha256":"41ba374a8169920653c43bbaa284b0fa3b6303093c5833b9c5b7152895931ed6","plan_bytes_sha256":"9b8953d464d6cf54896213f6ebb0afc3243e80d0cf660481effdd134cef0a77e","replacement_run_id":"8a74adb1-d494-4220-8a84-6ca21b9dd5a0","run":{"acceptance":{"source_sha256":"40035bc0d2c73a5a362d60331b72dc0d8e4e577190019788519d1e54c1ca4e95","verification_sha256":"9ef7e1fbdc7548f3b81efad23c2634efec7c327f48ce53b89f3ed41ad3e630c2"},"blocker":{"evidence_sha256":"5b68f6295e8fba7f419defc036d4281b0945df5ddca4d6c868233a599ec95fc7","kind":"review_failed"},"completion_review":{"input_sha256":"ba483ce0b629e3bb395dc59c01146ed64644f5fa09dc2c4668f46bf7c9e330ba","invocations":2,"result_sha256":"5b68f6295e8fba7f419defc036d4281b0945df5ddca4d6c868233a599ec95fc7","state":"blocked"},"draft_review":{"input_sha256":"129b12a1d821983827e88a7aaefa78f9661a5b872d4bb9338b372dff5791d272","invocations":1,"result_sha256":"5c92499ff415ab00dc0593e547c7e851f2c2fc3d4f9bdae9b0665bdae18726de","state":"passed"},"execution_parent":"27a9f0c76a005d5838a638176b7dbb2eb8c8e197","goal_id":"2557b5e7-76e6-4373-952e-0f4eba454142","implementation_commit":"fcade333f1d95aca654a965552f75c96b48334b7","plan_path":"docs/plans/active/relay-supervisor-socket-stat.md","plan_sha256":"e638f67f1c19e782140ce41705aa9bc93e7dd668f6f344d8538ec01b1dc2cabf","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"440e31f9-8323-4b0f-b909-ef77c1b3a826","schema":1,"source_base":"a1c6a3130144834da6bfc5983567df16d7407eab","source_sha256":"3a9dac614c15bc1f2089025d3a0a7bd4cf24e2e0cdf00a46d963d61f9afa7f54"},"schema":1,"status":"blocked","successor_run_sha256":"e06cf44a5fac01d4b5a73c56c35a2f363dbeab28ab396ac437b7354635861dcb"}

Plan-attempt-history: {"authorization_source_sha256":"122fcb06da81e1f13c8d11a07b8cd9535ae59acf8818bde5010d82e10793d852","plan_bytes_sha256":"512d594b57889c4041290505ff490259fd90e6cce8da81df710a4aef3dff7540","replacement_run_id":"321a83d9-985c-4354-a30f-519d6cf58118","run":{"acceptance":{"source_sha256":"2086119dd8f9e2bf5708045555d62598b2f31c72047bca32380122b6a0cddf3d","verification_sha256":"c3ca3a000d7bc0d78b4f5d9ece776c0886d61ab0195ca8dab55cddecd52fdf68"},"blocker":{"evidence_sha256":"c0c2b5aa60dd7f8d8f68448fceb4efe2350792769abdf220f829e9fbb634d124","kind":"review_failed"},"completion_review":{"input_sha256":"bc0aeac8c8bdcfeb3fefb5fee240d3692949607ae38738e3fe877da31f693210","invocations":1,"result_sha256":"c0c2b5aa60dd7f8d8f68448fceb4efe2350792769abdf220f829e9fbb634d124","state":"blocked"},"draft_review":{"input_sha256":"fc2f0de0290e208e457fdc7f7e740afd041e30abb0b9358377c414bc1503e036","invocations":2,"result_sha256":"89bf4dcffc01176bfa78545e2b4ba919b2322ef3ab6dc4cd88553bf7b7ae45bf","state":"passed"},"execution_parent":"ad560a92c3024077825aad0f44b0d472debce8bb","goal_id":"2557b5e7-76e6-4373-952e-0f4eba454142","implementation_commit":"3a9d4e71bc63c44036f821ac56ef0d32327dd5fb","plan_path":"docs/plans/active/relay-supervisor-socket-stat.md","plan_sha256":"c1197ec40b0502fd1716be7d5c3f496ff332960c6b558f22deb5a9feccdcb636","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"8a74adb1-d494-4220-8a84-6ca21b9dd5a0","schema":1,"source_base":"085e0d064bd1dfb752827f8eb2c24262d6fa5c6f","source_sha256":"41de82673a0a7eb0d1e8f33d97b72edcfac5780b59d5e0b28c706e59597c7871"},"schema":1,"status":"blocked","successor_run_sha256":"82f088c8da85336e8cfbab647bbd04870196852f1cf97a37b346ebdb32c913b8"}

## Verification Results

Every command below was run at the repository root, in the relay crate where a `cargo`
invocation is shown. Exit codes, counts and summary lines are copied from the runs.

### A1 - the override was present in the released binary

Before step 2, on the merged handshake commit:

```
cargo build --release --locked
strings target/release/relay | grep -c 'RELAY_TEST_CORRUPT_CONTROL_FRAME'
1
```

The premise holds: a switch that makes the supervisor send a mismatched instance id was
compiled into the artifact this plugin distributes.

### A2 - it is absent after the gate

After step 2, rebuilding the same profile:

```
cargo build --release --locked
strings target/release/relay | grep -c 'RELAY_TEST_CORRUPT_CONTROL_FRAME'
0

strings target/release/relay | grep -c 'RELAY_TEST_CONTROL_READY_LATCH'
1
```

One to zero for the override, and the timing latch is deliberately still there. That second
count is what makes the first meaningful: the binary was rebuilt and still carries the
ungated test names, so the zero is the gate working rather than a build that never ran or a
`strings` invocation that matched nothing.

The probe is sound for this crate. The release profile sets `opt-level`, `lto`,
`codegen-units`, `panic` and `strip`, but never `debug-assertions`, so it stays false and
`#[cfg(debug_assertions)]` genuinely removes the code. `strip = true` removes symbols, not
read-only string data, so an environment variable name that is present would still be found.

### A3 - the proof survives in the test profile

```
node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_supervisor
wrapper exit: 0

cargo test --locked --test lifecycle_supervisor -- --test-threads=1
test result: ok. 12 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

All twelve cases pass, so the gate disabled nothing. The wrapper prints no summary when it
succeeds, so the binary summary comes from a direct run of the same tree.

### A4 - the gated override still drives a real proof

`return Ok(());` injected as the first statement of `validate_identity_frame`:

```
node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_supervisor
wrapper exit: 1
test result: FAILED. 11 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out
test lifecycle_supervisor_refuses_a_mismatched_supervisor_identity ... FAILED
```

Exactly the mismatched-identity case failed and nothing else. Restoring the file:

```
node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_supervisor
wrapper exit: 0
test result: ok. 12 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

The restored file was byte-compared against the pre-mutation copy and reported identical, so
the returning green is the committed bytes.

### A5 - the selected-plugin gate

```
SESSION_RELAY_TEST_CGROUP_ROOT=<delegated cgroup> node scripts/ci.mjs --plugin session-relay
exit: 0
All ci.mjs checks passed — plugin 'session-relay'; safe to release.
```

### Both profiles, because they now compile different code

```
cargo clippy --release --all-targets --locked -- -D warnings   exit: 0
cargo clippy --all-targets --locked -- -D warnings             exit: 0
```

The gate means the shipped path and the tested path are no longer the same code, so a
debug-only check would not have covered the artifact. `kind` keeps a use under both
profiles, since the frame records it regardless.

### Scope, and what acceptance binds

This run declares four paths and this diff carries one. The other three hold the merged
handshake change that the two predecessor runs implemented, and acceptance binds the
manifest of all four, which is what neither predecessor could do:

- The first bound three paths while its checkpoint contained four, because adding a test
  changed the generated test-surface declaration nobody had declared.
- The second bound three while its checkpoint contained four again, because deleting the
  client read orphaned a reader in `lifecycle.rs` and the gate denies warnings, so the
  reader had to go.

The path set here was taken from `git show --name-only` on the merged checkpoint rather than
from analysis, which is why it is complete. `git status --porcelain` listed only declared
paths before the checkpoint was taken.
