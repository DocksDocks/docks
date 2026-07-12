---
title: Build relay worker lifecycle primitives
goal: Add Linux-authoritative managed admission, stable-handle process control, and worker quiescence, with typed Darwin unavailability and no false fallback confirmation.
status: ongoing
created: "2026-07-11T03:31:53-03:00"
updated: "2026-07-12T16:41:50-03:00"
started_at: "2026-07-11T11:29:49-03:00"
assignee: null
review_author_company: anthropic
review_author_tool: claude-code
review_author_model: opus
review_author_effort: max
review_waivers: []
tags: [session-relay, lifecycle, rust, safety]
affected_paths:
  - plugins/session-relay/rust/src/appserver.rs
  - plugins/session-relay/rust/src/bin/runner_job_custodian.rs
  - plugins/session-relay/rust/src/bus.rs
  - plugins/session-relay/rust/src/channel.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/hook.rs
  - plugins/session-relay/rust/src/lib.rs
  - plugins/session-relay/rust/src/lifecycle.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/rust/src/process_identity.rs
  - plugins/session-relay/rust/src/runtime_install.rs
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/src/supervisor.rs
  - plugins/session-relay/rust/src/watch.rs
  - plugins/session-relay/rust/tests/lifecycle_supervisor.rs
  - plugins/session-relay/rust/tests/lifecycle_turn_cancellation.rs
  - plugins/session-relay/rust/tests/lifecycle_store_compat.rs
  - plugins/session-relay/rust/tests/lifecycle_managed.rs
  - plugins/session-relay/rust/tests/lifecycle_admission.rs
  - plugins/session-relay/rust/tests/lifecycle_controller.rs
  - plugins/session-relay/rust/tests/process_identity.rs
  - plugins/session-relay/rust/tests/lifecycle_proof.rs
  - plugins/session-relay/rust/tests/lifecycle_terminal.rs
  - plugins/session-relay/rust/Cargo.toml
  - plugins/session-relay/rust/Cargo.lock
  - plugins/session-relay/hooks/hooks.json
  - plugins/session-relay/hooks/codex-hooks.json
  - plugins/session-relay/test/fake-app-server.mjs
  - plugins/session-relay/test/feasibility-probe.mjs
  - plugins/session-relay/test/lifecycle-smoke.mjs
  - plugins/session-relay/test/mixed-version-lifecycle-store.mjs
  - plugins/session-relay/test/process-signal-inventory.mjs
  - plugins/session-relay/test/reentry-inventory.mjs
  - plugins/session-relay/test/run-build-matrix.mjs
  - plugins/session-relay/test/runtime-appserver-quiescence.mjs
  - plugins/session-relay/test/runtime-hook-abort.mjs
  - plugins/session-relay/test/runtime-hook-upgrade.mjs
  - plugins/session-relay/test/runner-job-custodian.mjs
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/test/supervisor-custody.mjs
  - plugins/session-relay/test/appserver-schema-contract.mjs
  - plugins/session-relay/test/wip-snapshot.mjs
  - plugins/session-relay/test/rust-test-inventory.mjs
  - plugins/session-relay/test/final-scope.mjs
  - plugins/session-relay/test/fixtures/lifecycle-capability-schema.json
  - plugins/session-relay/test/fixtures/runtime-doctor-schema.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/doctor-ready.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/doctor-degraded.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/doctor-unavailable.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/install-changed.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/install-current.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/install-lower-no-op.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/install-previous-retained.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/command-inability.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/usage-error.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/schema-error.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/validation-error.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/tamper-error.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/io-error.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/lock-error.json
  - plugins/session-relay/test/fixtures/process-signal-inventory.json
  - plugins/session-relay/test/fixtures/reentry-inventory.json
  - plugins/session-relay/test/fixtures/rust-test-inventory.json
  - plugins/session-relay/test/fixtures/appserver-server-requests.json
  - plugins/session-relay/test/fixtures/wip-step-allowlist.json
  - plugins/session-relay/test/fixtures/wip-historical-baseline.json
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.toml
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.lock
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/guardless.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/wrong-target.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fence-reentry.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/reentry-fence.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/cancel-reentry.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/child-cancel-reentry.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fabricated-owned-proof.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fabricated-pidfd-proof.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/tampered-cgroup-proof.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fabricated-protocol-proof.rs
  - plugins/session-relay/AGENTS.md
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - .github/workflows/build-binaries.yml
related_plans:
  - relay-worker-fanout
review_status: null
planned_at_commit: 12cf2ead208fe932084890b8e3fbd5c72591f3db
execution_base_commit: de925e9bc046645a72f59bcd493da44d53adaf5a
---

# Build relay worker lifecycle primitives

## Goal

Build three general, independently testable relay capabilities. On **Linux**, the authoritative path must (A) prevent a managed hook-born Claude CLI **or relay-owned Codex app-server thread** from processing its first prompt when attach fails—Claude through the required `UserPromptSubmit` barrier and Codex through direct lifecycle binding after `thread/start` but before the first `turn/start`; (B) signal processes only through a kernel-stable handle or an unreaped supervisor-owned child, and confirm the cooperatively launched worker tree only behind the bounded confinement contract in this plan; and (C) cancel and prove app-server lineage only after a verified graceful stop/reap plus durable protocol flush, while capability-binding every relay drain, resume, injection, turn start, process launch, attach, interrupt, clean, and signal to the exact lifecycle/binding/fence epoch. On **Darwin**, success is the portable supervisor-owned-child/process-observation behavior plus closed typed `UnavailablePlatform` for the authoritative managed-controller/fd-exec/cgroup path; no Darwin fallback may inherit the Linux guarantee.

The result must distinguish **process-only**, **protocol-only**, and **worker-tree** evidence. Observation-only PID/start-time data, stable-looking descendant snapshots, any live shared-server scan, a single interrupted turn, `thread/read idle`, root-process exit, frozen-but-unflushed protocol artifacts, or `cgroup.events populated 0` outside the stated cooperative-worker boundary can never release a worker-tree capacity slot. ProtocolTree proof requires a verified graceful stop/reap whose durability contract flushes every accepted lineage/turn/terminal mutation before a complete offline scan; freezing is only a temporary WorkerTree snapshot aid and must end in kill plus `populated 0`, never thaw/release. Unsupported or lost capabilities remain `FencingUnconfirmed`, refuse every re-entry/drain, survive GC, and expose bounded reconcile/abandon paths.

Lifecycle authority must also survive an already-running released 0.10.0 process rewriting the legacy discovery registry, and release/abandon must atomically terminalize worker, session binding, retained authority, and any capacity charge without reopening the runtime id. Completing this plan proves one exact merged **source-ready** tip. It does not itself make the consumer payload packaged-ready: `relay-worker-fanout` remains blocked until a later immutable Session Relay tag/release descends from that tip, carries producer-built verifying binaries/checksums and matching manifests, and passes the packaged 0.10.0→N/N→N live-upgrade plus mixed-version-writer matrices.

## Context & rationale

- `relay-worker-fanout` is blocked on three general relay-core primitives. Its lifecycle-specific recovery/collection items remain out of scope; this plan provides only reusable attach, admission, process, quiescence, and reconciliation contracts.
- **Owner-approved Draft-13 boundary (2026-07-12):** after review proved that `hooks/list` is a snapshot with no expected-hash-bound child launch, the owner approved replacing the strict “hook-born Codex CLI” deliverable with relay-owned app-server birth. `thread/start` may discover the Codex runtime id, but relay must complete the direct lifecycle claim before it sends any `turn/start`. Managed Codex CLI fallback and direct human/third-party resume are outside the managed guarantee; unmanaged compatibility remains.
- **Observed upgrade failure (2026-07-12):** a long-lived Codex process retained an absolute hook command into a pruned versioned plugin cache and emitted repeated SessionStart/UserPromptSubmit exit 127 after `docks-kit sync codex`; the current trusted 0.10.0 hooks and binary passed when invoked directly, and a fresh ephemeral Codex session registered successfully. Draft-13 therefore treats executable-path durability across N→N+1 refresh as a separate capability from hook trust and adds a stable monotonic relay runtime plus live-upgrade acceptance.
- **Mixed-version writer boundary (Draft-24):** the released 0.10.0 registry writer parses and rewrites only `agents` and `names`; preserving unknown keys in the new writer cannot stop an already-running old bus/register/GC process from erasing lifecycle maps in `registry.json`. All lifecycle, binding, custody, proof, audit, and capacity authority therefore moves to a separate versioned `lifecycle-v1.json` that 0.10.0 never opens. The legacy registry becomes a repairable discovery projection, never authority. This closes old-writer non-erasure only; an old binary remains lifecycle-unaware and must never be treated as a managed controller.
- **Standalone-hook trust boundary (Draft-19):** the literal `/bin/sh` bootstrap is responsible for ordinary cache-prune/upgrade durability and fail-closed corruption checks, not authenticity against a deliberate same-UID actor that atomically replaces the plugin root, launcher, manifests, checksums, and payload before cached code executes. Known-at-check symlinks/non-regular launchers/bad modes fail; ordinary deletion races fall through only when the root is then truly absent and non-link. Once the selected native installer begins, its retained dirfds/fds prevent mixed-generation splice. docks-kit provides the optional higher-assurance proactive path by independently hashing a retained selected-native fd against its expected external digest and invoking `__install-stable` through those same verified bytes, bypassing the mutable cache dispatcher; standalone first bootstrap remains plugin-owned and does not depend on docks-kit.
- Independent red-team verification confirmed the feasibility foundation: Codex app-server returns the exact `turn.id`, supports `turn/interrupt {threadId,turnId}`, and emits terminal completion; both runtimes support `UserPromptSubmit` blocking; exit-0 universal `continue:false` is documented for SessionStart but Claude's event-specific section describes SessionStart as context-oriented, so the real-runtime matrix treats Claude SessionStart stop as version-pinned empirical defense-in-depth rather than the only prompt barrier. Hook timeout is configurable and fail-open. Linux has pidfd, `/proc` field-22, cgroup v2 kill/populated; rustix gates pidfd to Linux; Darwin exposes observation APIs. Current Codex app-server exposes no public mutation-rejecting durable-flush watermark, so `ProtocolTree` is unavailable for the installed runtime and cannot be a positive completion dependency.
- A start-time comparison followed by raw `kill`/`killpg` is check-then-act: the target can exit and its PID/PGID can recycle between operations. Darwin `proc_bsdinfo` and Linux start-time fallback are therefore **observation only**, not generation-safe signal handles.
- A delegated cgroup writable by the same user is not adversarial containment: a deliberately cooperating-violating process can request migration or use a broker. `CooperativeWorkerV1` proves only gated initial placement plus inherited membership for ordinary/nested-namespace descendants created by the relay-launched task, tied to generation-bound manager authority. Intentional same-UID ancestor/sibling migration is recorded as an out-of-model negative capability observation and never folded into a successful proof.
- A read/write flock alone cannot bound fencing. A writer may starve behind new readers, and a reader may hold through a 300-second pump, unbounded wake, or any lifecycle-sensitive `attach --exec`; CLOEXEC then drops even an Unmanaged guard while the resumed CLI continues across Claiming. Fence intent must publish before drain, new admissions must refuse without joining the reader queue, and every admitted operation—including pre-claim attach/resume—must be cancelable, parent-waited, and bounded.
- Re-entry is broader than `watch --auto-turn`: current drains exist in CLI inbox, MCP inbox, channel, hook, watch, and wake. Current app-server status/ack/deliver call `thread/resume`; pending acknowledgement is its own turn-start path. The inventory must be mechanically complete, not a hand-counted list.
- Codex CLI has no pre-minted session id. Managed state therefore keeps a pre-launch `worker_id` and pending token-hash index, but the authoritative Codex claimant is the relay-owned app-server controller: SessionStart inside `thread/start` is non-claiming, then the controller obtains `runtime_session_id` from the response, atomically binds that exact identity, and only then may send `turn/start`. Controller retry is idempotent; token replay to another identity is refused.
- Codex plugin hooks are non-managed, trust is snapshot-only, and a long-lived session can retain a versioned executable path after cache refresh. Managed Codex first-prompt safety therefore does not depend on hook trust. Production still inspects both rows through `hooks/list` for diagnostics and ordinary registration/re-entry coverage, never uses the broad bypass, and runs hooks through a monotonic stable relay runtime so an N→N+1 refresh cannot strand an old session.
- Admission authority is time-sensitive: an Unmanaged guard issued before first SessionStart cannot remain valid after the same runtime id becomes Managed. Binding epoch, Claiming publication, prior-guard drain, target-free lower APIs, and use-time re-resolution are one mandatory invariant.
- Two equal asynchronous app-server scans are not a fixed point, and a shared second client can create lineage after the final page. Shared scans are observation-only unless the server supplies a held mutation-rejecting barrier. A frozen dedicated writer can still hold queued child creation or unflushed state, so only a verified graceful stop/reap with a durable flush contract can support final offline ProtocolTree proof; freeze followed by kill/`populated 0` proves only the bounded physical tree.
- Every fence attempt has its own epoch/version. Interrupt, clean, signal, timeout, finish, reconcile, release, and abandon must CAS or re-resolve that exact epoch so a late fencer cannot overwrite newer state.
- The pre-plan baseline GC aged registry entries/surfaces without managed exemptions; checkpoint `701cea7` already delegates lifecycle-bound sessions to the Step-2 GC rules. Remaining work must extend that protection to versioned active operations, supervisor/socket custody, handoffs, stale-event audits, and later proof records regardless of age.

### Step-8 immutable live-evidence rehash

Step 1b creates the validation-only rehash mode before any live gate runs and records the native runner's sentinel-bound receipt root as `RUNNER_RECEIPT_ROOT`. Step 8 sets `STEP8_REHASH_RECEIPT="$RUNNER_RECEIPT_ROOT/step-8-live-evidence-rehash.json"`; that exact path is separate from `STEP_RECEIPT_DIR`, is not a repository mutation, and is created once as a mode-0600 regular file followed by file fsync and runner-receipt-root directory fsync. The recursively closed receipt is `LiveEvidenceRehashReceipt {schema:1,step:"8",plan_blob_sha256,step8_head,runner_state_receipt_sha256,runner_attempt_chain_sha256,terminal_attempt_receipt_sha256,ordered_gate_result_sha256s,gate_artifact_manifest_sha256,bootstrap_receipt_manifest_sha256,prior_step_range_receipt_chain_sha256,terminal_reason,cleanup_sha256,verified_at,receipt_sha256}`. `step8_head` is the exact clean Git HEAD observed by A133 and later must equal the Step-8 empty-range A106 receipt's base/head while remaining an ancestor of the final implementation tip. `ordered_gate_result_sha256s` has exactly six entries in A110 (RunGate A1c)→A111 (RunGate A1d)→A119 (RunGate A5)→A120 (RunGate A5b)→A121 (RunGate A6)→A125 (RunGate A7) order; `terminal_reason` is exactly `Complete`; the prior step-range chain ends at Step 7 because Step 8's empty A106 receipt is written only after the audit. `receipt_sha256` is JCS SHA-256 over every preceding field. The rehash mode reads only immutable receipt/artifact bytes, recomputes every nested hash/link and exact binary/Cargo identity, and never opens a capability fd, runtime, auth, cgroup, socket, or process-control handle. Retry verifies and returns the byte-identical existing receipt; mismatch refuses rather than overwriting it.

## Threat model

These primitives defend a **cooperative worker**: the relay launches the user's own task under the user's own credentials and must contain accidental runaway descendants, crashes, PID/PGID reuse, signal TOCTOU, stale re-entry, and capacity overrun. `WorkerTree` means every process in the relay-controlled launch boundary that a cooperative task creates directly under the isolated wrapper. Its proof is authoritative only for that bounded set and only while the exact manager cgroup fd, namespace/setup receipt, kill result, and `populated 0` evidence remain valid.

A deliberately adversarial same-UID worker is outside this guarantee. In particular, it can ask a same-user broker such as `systemd-run --user` / D-Bus `StartTransientUnit` to create or move a process into a sibling cgroup, or pass work/authority through an already-reachable same-user service or `SCM_RIGHTS`. That broker-assisted writer can survive `cgroup.kill` while the worker leaf reports `populated 0`; neither seccomp on the worker nor its cgroup namespace can revoke authority already held by the broker. The fan-out hard cap accepts this bounded cooperative scope; tests must not relabel broker escape as covered WorkerTree evidence.

The same cooperative boundary applies to local plugin-cache authenticity. A same-UID actor can deliberately replace both code and the metadata that the standalone cached dispatcher has not yet pinned; the shell bootstrap cannot authenticate that race and makes no such claim. Its predicates detect the object state actually observed, ordinary package-manager deletion is covered, and the native installer becomes splice-resistant only after it has started and opened its no-follow source fds. The docks-kit proactive verified-native path is a separate stronger provenance path, not evidence that the standalone shell acquired adversarial authenticity.

Adversarial-grade containment is a future, separately scoped capability requiring IPC and network namespace isolation, broker-socket denial, a complete service/FD handoff policy, and a full sandbox threat review. Cheap defense-in-depth in this plan still closes accidental/direct escape paths: architecture-validated seccomp, wholesale `clone3` denial returning `ENOSYS`, x86 x32 rejection, capability drop, inherited-fd closure, and a fresh PID/proc/cgroup view. The owner confirmed **`CooperativeWorkerV1`** on 2026-07-11; implementation and acceptance use it and must label it in every WorkerTree proof/status response.

## Feasibility and guarantee tiers

| Capability | Confirmed buildable path | What can never be claimed |
|---|---|---|
| Managed first-prompt admission | **Claude:** Claiming publication is the first short hook transaction and required `UserPromptSubmit` returns structured stop for non-Active workers; SessionStart stop remains empirical defense-in-depth. **Codex:** the relay-owned controller obtains the thread id from `thread/start`, directly performs the exact pending-token lifecycle claim, and emits no `turn/start` until the claim commits Active. Both runtimes retain supervisor custody and a measured deadline ≤20 seconds. Codex hook health is diagnostic/defense-in-depth and stable-runtime-backed, not the first-prompt linearization point. | A trusted `hooks/list` snapshot cannot atomically bind a later CLI child and may not be presented as such. Plugin enablement is not hook trust; production bypass is forbidden. Managed Codex CLI fallback is forbidden. Direct human/third-party clients are outside relay ownership. Root kill alone is not tree proof. |
| Process signal | Linux: open pidfd **before** validating start generation, then signal that pinned task. Live supervisor: signal/kill an unreaped `Child` it still owns. Cooperative WorkerTree (`ConfinedCgroupCooperative`, both runtimes): gated placement (`CLONE_INTO_CGROUP`/stop-GO) into a generation-bound domain cgroup leaf, then `cgroup.kill` and `populated 0`. | Darwin or Linux without pidfd after supervisor recovery must not raw-signal. PID/start-time is observation only. Process exit or owned process-group exit never proves an arbitrary worker tree, and the cgroup tier makes no adversarial same-UID broker claim. |
| Cgroup tree (`ConfinedCgroupCooperative`, both runtimes) | Under `CooperativeWorkerV1`, place the runtime in a delegated, newly created **domain** cgroup leaf with **atomic/gated initial placement** (`clone3 CLONE_INTO_CGROUP` or a separately capability-checked pre-exec stop/GO handshake so no runtime code forks before verified leaf membership); retain the generation-bound leaf fd; assert `cgroup.type=domain`, empty `cgroup.subtree_control`, and writable `cgroup.kill`; write `cgroup.kill=1`, then wait for `cgroup.events populated=0`. Optional freeze is diagnostic only and, if used, must end in kill rather than thaw-through-release. Works for **both** Claude and Codex because cgroup membership is namespace-independent. The anti-escape seccomp deny-list is a **Claude-only `FilteredCgroupHardening`** upgrade, never required for the cooperative tier. | Plain delegation, non-atomic placement, threaded/domain-invalid topology, manager-fd loss, unsupported direct placement without a verified stop/GO fallback, or any claim against broker-assisted / explicit same-UID cgroup migration is unconfirmed even if kill succeeds and `populated 0` is observed. Freeze is not confinement proof. `FilteredCgroupHardening` is best-effort defense-in-depth and makes **no** adversarial-containment claim. |
| App-server protocol | Current Codex supports exact owned-turn interruption and exact per-background-terminal termination, but the installed app-server has no public mutation-rejecting durable shutdown/flush watermark or persisted terminal ledger. Therefore real-runtime `ProtocolTree` is explicitly `UnavailableCurrentCodexAppServer`; the typed positive proof path is exercised only against a fake/future adapter that implements the full contract. | Process exit, stdio EOF, internal shutdown completion, `clean {}`, terminal-list emptiness, equal async scans, live shared-server scans, idle, freeze, or readable but unflushed offline artifacts never construct ProtocolTree proof. |
| Worker-tree release | Exhaustive proof validation accepts only a strong confined-cgroup proof explicitly labeled `CooperativeWorkerV1`, or compound gracefully flushed app-server lineage proof plus that physical containment for a relay-owned dedicated server. | Shared app-server, tracked descendant trees, stable snapshots, observation-only identities, root-only proofs, and deliberately broker-escaped same-UID processes remain outside/`FencingUnconfirmed`; no adversarial-sandbox claim is made. |

## Environment & how-to-run

- **Plan source:** the orchestrator and every worker read `/home/vagrant/projects/docks/docs/plans/active/relay-worker-lifecycle-primitives.md` from the main worktree at dispatch time; the older implementation-branch copy is non-authoritative. Dispatch records `PLAN_COMMIT` and `PLAN_BLOB` from that path. Step 3b is clean at `STEP3B_HEAD=2a864e9b6f966384e4c4ed0e4b3d563b348a3830`; the first Step-1b worker runs A103 before creating the helper and closed step allowlist. After Step 1b commits them, every later step runs reusable pre-edit A104 and every committed step runs post-step A106. Unrelated main commits do not invalidate a path-specific snapshot; a changed plan commit/blob does.
- **Implementation checkout/base:** the registered checkout is `/tmp/docks-primitives-collab` on branch `codex/primitives-collab`, clean at `2a864e9b6f966384e4c4ed0e4b3d563b348a3830` after Step 3b. After Step 1b, every redispatch records `WIP_PATCH_SHA256` over `git diff --binary HEAD` plus `WIP_UNTRACKED_SHA256` over a sorted path/mode/content-hash manifest generated by committed `test/wip-snapshot.mjs`; the helper enforces the step allowlist and rejects any unexpected path/mode/byte. Clean checkouts use canonical empty hashes. A new worker independently verifies hashes before editing. Each step records `STEP_BASE` before its first edit and, after committing clean, records `STEP_HEAD` and runs A106 over that exact range. `/home/vagrant/projects` and `/tmp` are different filesystems, so `git worktree move` is invalid. Before final handoff, commit and verify all intended work, require clean status, record branch/full HEAD, run non-forced `git worktree remove /tmp/docks-primitives-collab`, then `git worktree add /home/vagrant/projects/docks-primitives-collab codex/primitives-collab`, and verify the same branch/HEAD. Never remove a dirty checkout. Drift base remains `12cf2ea`; completion runs in the implementation worktree against its recorded tip, never main HEAD.
- **One-time preserved-WIP bootstrap (orchestrator-observed 2026-07-12 before Draft-14 edits):** before the missing reusable helper exists, A102 independently binds the checkout to `HEAD=701cea7e671bc40ee23d69abf79ff102e0eecb20`, NUL status hash `2911f30fa11a2b6b49cbb3ad4635bddc0bdc6d96a31c8204bdfea279bf226afd`, tracked binary-patch hash `20a63f01d8bd4580aa03a46d368c16b2e27741170bae67b2e98f8f6b15ec0a9a`, and canonical sorted untracked-manifest hash `905f7207f73273efc2b24fd016acaa9fd04548bf6cb9c2414867fc1105968587`. The five sorted `path|100644|sha256` lines are: `plugins/session-relay/rust/src/supervisor.rs|100644|be15fc6f22fa8d327df6dde9428c4e2600ed05dc8fefbe7e0634405adac433f1`; `plugins/session-relay/rust/tests/lifecycle_supervisor.rs|100644|6978cf1be1a010b58c0dc8e2b61e1842d9fced1e4ac74f8eafdbd015bdd5dbc5`; `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/child-cancel-reentry.rs|100644|8744fc369ab9ab3c25025b718dd60ab244f617e6b7e4fe5a7579087e492e3946`; `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fabricated-owned-proof.rs|100644|d4c220f679dd0fee706b4d8f637f5c64a966ee6c5d20bbe2b6a64a9fec4fd2fd`; `plugins/session-relay/test/supervisor-custody.mjs|100644|2068054bf8bc2d91b93978cea1c32384b24c3aba07b91a4d349bc9ab9c940f21`. A102 verifies exact paths/digests, non-symlink/non-executable modes, and exact status before any edit. The worker repairs/commits Step 3b to clean status first. Step 1b then creates `wip-snapshot.mjs` and proves canonical empty hashes plus negative tracked/staged/unstaged/untracked/symlink/executable/rename/delete fixtures. All later dispatches use A104 with `--allow-step "$STEP_ID"`; the hard-coded initial manifest is never reused after Step 3b.
- **Exact A102 command (run once, before any Step-3b edit):** from `/tmp/docks-primitives-collab`, run:
  ```bash
  set -euo pipefail
  test "$(git rev-parse HEAD)" = 701cea7e671bc40ee23d69abf79ff102e0eecb20
  test "$(git status --porcelain=v1 -z | sha256sum | cut -d' ' -f1)" = 2911f30fa11a2b6b49cbb3ad4635bddc0bdc6d96a31c8204bdfea279bf226afd
  test "$(git diff --binary HEAD | sha256sum | cut -d' ' -f1)" = 20a63f01d8bd4580aa03a46d368c16b2e27741170bae67b2e98f8f6b15ec0a9a
  files=(plugins/session-relay/rust/src/supervisor.rs plugins/session-relay/rust/tests/lifecycle_supervisor.rs plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/child-cancel-reentry.rs plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fabricated-owned-proof.rs plugins/session-relay/test/supervisor-custody.mjs)
  expected=(be15fc6f22fa8d327df6dde9428c4e2600ed05dc8fefbe7e0634405adac433f1 6978cf1be1a010b58c0dc8e2b61e1842d9fced1e4ac74f8eafdbd015bdd5dbc5 8744fc369ab9ab3c25025b718dd60ab244f617e6b7e4fe5a7579087e492e3946 d4c220f679dd0fee706b4d8f637f5c64a966ee6c5d20bbe2b6a64a9fec4fd2fd 2068054bf8bc2d91b93978cea1c32384b24c3aba07b91a4d349bc9ab9c940f21)
  for i in "${!files[@]}"; do test -f "${files[$i]}"; test ! -L "${files[$i]}"; test ! -x "${files[$i]}"; test "$(sha256sum -- "${files[$i]}" | cut -d' ' -f1)" = "${expected[$i]}"; done
  manifest_hash="$({ for i in "${!files[@]}"; do printf '%s|100644|%s\n' "${files[$i]}" "${expected[$i]}"; done; } | sha256sum | cut -d' ' -f1)"
  test "$manifest_hash" = 905f7207f73273efc2b24fd016acaa9fd04548bf6cb9c2414867fc1105968587
  ```
- **Toolchain:** Rust `1.85.0`; locked rustix `1.1.4`; Node 24; committed Cargo lock. Targets: x86_64/aarch64 musl-linux and x86_64/aarch64 Darwin.
- **Confirmed-source rule:** Step 1 preserves original evidence; Step 1b migrates stale verdicts and adds raw app-server ordering (feasibility-only), stable-generation, hook-health, and experimental-capability evidence. Production direct claim/controller behavior is Step 5/A121 (RunGate A6). No row may substitute hand-written booleans or re-argue docs.
- **Draft-22 pre-edit hard-stop evidence (reproduced 2026-07-12):** `git diff --raw 12cf2ea..2a864e9b6f966384e4c4ed0e4b3d563b348a3830` returned exactly 35 entries, all `A|M` with final mode `100644`. Real multi-owner examples include `rust/src/lifecycle.rs` (Steps 2, 3a, 3b), `rust/src/spawn.rs` (3a, 3b), `test/reentry-inventory.mjs` (3a, 3b), and `test/selftest.mjs` (3a plus both Step-3b commits). Node 24 reported `net.createSocketPair`, `net.socketpair`, `constants.SOCK_SEQPACKET`, and `constants.SCM_CREDENTIALS` all `undefined`; the plan had no executable WIP negative matrix, runner matrix, stable-generation/pointer matrix, or post-step range gate. Host `claude auth status --json` reported `loggedIn:false`; `codex login status` reported ChatGPT login ready. Authentication therefore remains an external mandatory gate: never skip, fake, or convert an unavailable row to PASS.
- **Local commands:**
  ```bash
  export PATH="$HOME/.cargo/bin:$PATH"
  (cd plugins/session-relay/rust && cargo test --locked)
  node plugins/session-relay/test/selftest.mjs
  node plugins/session-relay/test/lifecycle-smoke.mjs --case reentry-matrix
  node plugins/session-relay/test/reentry-inventory.mjs
  node scripts/ci.mjs --plugin session-relay
  ```
- **Exact A103 command (run once, before any Step-1b edit):** only after Step 3b is committed and the orchestrator has independently recorded its full tip, dispatch `PLAN_COMMIT`, `PLAN_BLOB`, and `STEP3B_HEAD`; from `/tmp/docks-primitives-collab`, run:
  ```bash
  set -euo pipefail
  test -n "$PLAN_COMMIT" && test -n "$PLAN_BLOB" && test -n "$STEP3B_HEAD"
  test "$(git branch --show-current)" = codex/primitives-collab
  test "$(git rev-parse HEAD)" = "$STEP3B_HEAD"
  test -z "$(git status --porcelain)"
  test "$(git -C /home/vagrant/projects/docks log -1 --format=%H -- docs/plans/active/relay-worker-lifecycle-primitives.md)" = "$PLAN_COMMIT"
  test "$(git -C /home/vagrant/projects/docks show "$PLAN_COMMIT:docs/plans/active/relay-worker-lifecycle-primitives.md" | git hash-object --stdin)" = "$PLAN_BLOB"
  test "$(git -C /home/vagrant/projects/docks hash-object docs/plans/active/relay-worker-lifecycle-primitives.md)" = "$PLAN_BLOB"
  git diff --check HEAD
  ```
  This one-time bridge authenticates the clean post-3b tip before `wip-snapshot.mjs` exists. Step 1b creates schema-v2 historical and future fixtures plus the helper. The closed historical shape is `{schema:2,base,tip,commit_owners,entries,manifest_sha256}`. `commit_owners` contains exactly the 22 commits from `git rev-list --reverse --topo-order 12cf2ea..STEP3B_HEAD`; every row binds full commit, ordered parents, tree, `kind:"content"|"merge"`, and byte-sorted `changes:[{path,owner}]`. Owner is exactly `plan-history|1|2|3a|3b`. Content changes exact-match `git diff-tree --first-parent --raw -z --no-renames`; merge carriers have exact parents/tree, `changes:[]`, and no merge-resolution delta. The exhaustive owner map is: plan-history-only `07ad2df,e80edc3,73aca9b,610ca11,8879d89,de925e9,4302d0b,80c0f65,21026c5,b89c8b2,9e0bd6a`; Step 1 `ef90239,c32aafa`; Step 2 `066262f`; Step 3a `bb69601`; Step 3b `06d2324,2a864e9`; merge carriers `242d823,70dfbee,730409f`; mixed `cdc70f0` maps its plan path to `plan-history` and its two plugin paths to `1`; mixed `701cea7` maps only the plan path to `plan-history` and every other first-parent change to `3a`. Full SHAs are resolved from these unique prefixes and stored; a prefix is never stored. Each of the 35 historical A/M regular-100644 entries derives its grouped owners from that map, retains old/new modes+oids and `final_disposition`, and hashes RFC-8785 JCS minus its own digest. Only the stale implementation-branch plan is `must_be_absent_at_final_tip`. Missing/extra commit/path, wrong parent/tree, assigning a merge change, the `cdc70f0`/`701cea7` split differing, or a 34/36-row range fails.

  The future fixture is recursively closed as `{schema:2,historical_manifest_sha256,steps,manifest_sha256}` with exact execution order `1b,3c,3d,1c,1d,4,5,6,7,8,9`; each step carries byte-sorted literal `{path,status,old_kind,new_kind,final_mode,historical_entry_sha256?}` rows. `A` is absent→regular, `M` is regular→different regular, and `D` is regular→absent; directories/globs/optional rows are forbidden. Steps 1c, 1d, and 8 have empty mutation arrays. Step 8 is verification-only: a newly discovered missing target forces STOP and plan/fixture review before any edit. Step 9 alone deletes the stale branch-plan and treats both WIP fixtures as read-only. Step 5 lists exactly the fourteen named doctor goldens, never their directory. Every path in Steps 1b/3c/3d/4/5/6/7/9 is a literal mutation row except paths the step explicitly labels read-only; the fixture generator exact-compares this closed step manifest to the plan table. Production `rust/Cargo.toml` and `Cargo.lock` are read-only after `STEP3B_HEAD`; the exact authoritative blobs are `Cargo.toml sha256=de0ae13cced9fb6c0b8c7dc869db82f3e4590875eb9ac2b19669f17d223e5627` with `libc="0.2"` and `rustix={version="1.1",features=["fs","net","process"]}`, and `Cargo.lock sha256=9f926f41f1df7395e9064f48542ce4be91cbce1566d04bf35a4f6fba08a8bb74`; the older main-worktree Cargo bytes are not the implementation baseline. `libc` owns raw `prctl`/subreaper, seqpacket credentials and `sendmsg`/`recvmsg`, `execveat`, waits/signals/poll/fcntl, ptrace, clone3, seccomp, and setsid; rustix `fs|net|process` owns safe fd/filesystem, peer-credential, uid, pidfd, and process helpers; the generated C seccomp probe is test-only. A103 verifies both hashes, `RunnerBinaryIdentity` binds `cargo_toml_sha256`, A109 offline validation maps every native syscall to this closed supplier set, and A106/A137 reject either Cargo byte changing. An unmapped API or needed feature/dependency is a plan STOP, not an implicit allowance. A103 is never reused after Step 1b.

  **Future mutation grammar (Draft-35 execution-blocker clarification):** the authoritative source is each literal repo-root-relative backticked path item in the Steps-table **Files** cell. A parenthetical annotation applies only to its immediately preceding path and is classified by its first token: `(new)` asserts absent-before and creates an `A` row; `(modify …)` asserts a projected-present `M` row; `(delete …)` creates the sole `D` row; `(read-only …)` excludes that path from mutations. An otherwise unannotated path in a mutating step is a mutation whose `A|M` status is derived by folding projected existence through exact step order. Unknown annotation tokens fail. Steps 1c, 1d, and 8 are verification-only and therefore have empty mutation arrays regardless of their explicitly read-only files. Directory-prefix inheritance, shorthand paths, globs, optional rows, and annotation carry-forward are forbidden. Every future `A` or `M` row is regular→regular/absent→regular as applicable with `final_mode:"100644"`; the `D` row is regular→absent with `final_mode:null`; no executable-mode mutation is authorized. The Step-3c/4/6 compile-fixture `Cargo.lock` items are explicitly read-only because target declarations do not change dependency resolution; their companion fixture `Cargo.toml` items mutate to declare the new binary targets. The generator parses this grammar from the exact pinned plan blob, folds state from `STEP3B_HEAD`, and exact-compares the recursively closed future fixture; a hard-coded second source of truth is forbidden.

- **Sentinel roots:** `wip-snapshot.mjs` creates `STEP_RECEIPT_DIR` under literal `/tmp/relay-step-range.*`; the native runner creates distinct immutable build, matrix-run, live-run, and receipt roots under `/tmp/relay-runner-{build,state,receipt}.*`; final-scope creates `/tmp/relay-final-scope.*`. Every root is a canonical non-link directory owned by the current uid, mode 0700, held by a dirfd, and contains an exclusive `.relay-root.json` equal to `{schema:1,purpose,token:<32-random-byte-hex>,canonical_path,uid,dev,ino}`. Every ordinary use revalidates path, dirfd, sentinel, owner, mode, dev, and inode. Cleanup is fd-relative and begins only from the exact sentinel-bearing root; symlink/special/missing/swapped sentinel, identity change, caller-selected root, or escape poisons/stops. A138 alone may unlink the final quarantine sentinel after `RemovalPrepared` durably binds its exact bytes/hash, directory dev/inode/owner/mode, empty payload manifest, and parent identity. Its append-only progress/phase receipts live under `$FINAL_SCOPE_ROOT/a138-state/`, never inside the quarantine. A retry in `RemovalPrepared` accepts the fixed quarantine path either sentinel-only with exact identity or sentinel-absent and literally empty with that same dev/inode/owner/mode; any other state stops. Final manifests live inside the final-scope root, never a fixed caller path.

- **Exact A106 post-step range contract:** set `STEP_BASE` and `STEP_HEAD` to clean committed tips and run the helper after every step in canonical order `1b,3c,3d,1c,1d,4,5,6,7,8,9`. It writes exclusive-create append-only `StepRangeReceipt {schema:2,step,ordinal,base,head,previous_receipt_sha256,supersedes_receipt_sha256|null,historical_manifest_sha256,allowlist_manifest_sha256,entries,entries_sha256,receipt_sha256}` at `<ordinal>-<step>-<receipt_sha256>.json`, fsyncs file+directory, and prints `STEP_RANGE PASS step=<id> ordinal=<n> base=<sha> head=<sha> entries=<n> receipt_sha256=<hex>`. Each actual raw mutation must exact-match an allowed literal row; acceptance gates, not unused allowlist rows, prove completeness. A same-step repair appends a superseding receipt only while the old receipt is latest, uses the same original base and an ancestor-expanded head, points both previous+supersedes to the old hash, and retains the old file. A later-step receipt makes earlier supersession illegal. Missing/overwritten/deleted/forked/reordered receipt, wrong previous hash, cross-step supersession, narrowed base, nonancestor head, dirty/noncurrent HEAD, or unallowed mutation fails. A137 validates the full append ledger, selects one terminal active receipt per step, and requires exact active-step contiguity. A104 binds pre-edit/WIP bytes; A106 binds committed-clean ranges.
- **Acceptance event accounting (Draft-29 blocker repair):** canonical acceptance IDs are inventory keys, not chronological event ordinals. Every actual gate/check occurrence appends and fsyncs one exclusive-create `AcceptanceEventReceipt {schema:1,event_ordinal,occurrence_id,phase,criterion_id,scope,command_sha256,expected_sha256,exit_code,met,result_sha256,previous_event_sha256,event_sha256}`; ordinals 1–80 live below sentinel-bound `$RUNNER_RECEIPT_ROOT/acceptance-events/`, while terminal A137/A138 ordinals 81–82 live below sentinel-bound `$FINAL_SCOPE_ROOT/acceptance-events/` so their evidence survives runner-root cleanup. `event_sha256` is JCS SHA-256 over every preceding field. `occurrence_id` is exactly `<phase>/<criterion_id>/<scope>`, unique in the closed schedule below; `scope` is `default` unless written explicitly. The first Step-1b commit imports the exact already-immutable evidence for the `historical` phase without rerunning it and binds each imported result to its original Git/evidence hash. Later events are written only after their named command returns or, for terminal A137/A138, by the command's final crash-durable sub-operation after all preceding assertions succeed. No overwrite, deletion, duplicate id, gap, fork, reordered ordinal, unlisted phase/criterion/scope, result substitution, or `met:true` with nonzero exit is valid.

  `AcceptanceEventScheduleV1` is the following literal dependency-ordered map; order within each row and row order are semantic:

  ```text
  historical: A101,A102,A112,A114,A115,A132
  1b: A103,A105,A107,A108,A109,A106
  3c: A104,A113,A116,A106
  3d: A104,A117,A127/pre-controller,A128/pre-controller,A106
  1c: A104,A110,A106
  1d: A104,A111,A106
  4: A104,A118,A119,A120,A106
  5: A104,A121,A122,A123,A124,A127/complete,A128/post-controller,A106
  6: A104,A125,A126,A131/protocol,A106
  7: A104,A128/post-terminal,A129,A130,A131/terminal,A106
  8: A104,A105,A107,A108,A109,A112,A113,A114,A115,A116,A117,A118,A122,A123,A124,A126,A127,A128,A129,A130,A131,A132,A133,A106
  9: A104,A134,A135,A136,A106,A137,A138
  ```

  Step 9 therefore commits its allowed mutations after A134–A136, appends the Step-9 A106 range receipt/event, and only then runs A137–A138; this is the sole deliberate numeric-order break inside that phase. A109 parses this literal map, requires all and only A101–A138, the exact 11 A106 occurrences, ten A104 occurrences, scoped A127/A128/A131 occurrences, the Step-8 repeat set, and the six one-shot RunGate positions. A137 first validates events 1–80, then its final sub-operation appends event 81 and fsyncs `AcceptancePrefixSnapshot {schema:1,schedule_sha256,event_count:81,events,partial_criteria,event_chain_head,snapshot_sha256}` at exact `$FINAL_SCOPE_ROOT/acceptance-prefix-snapshot.json`; `events` contains every ordered `{occurrence_id,criterion_id,event_sha256,result_sha256}` row for ordinals 1–81 and `partial_criteria` contains the deterministically aggregated A101–A137 summaries. Only after re-reading and validating those bytes does it fsync `AcceptancePrefixReceipt {schema:1,schedule_sha256,event_count:81,event_chain_head,criteria_through:A137,prefix_snapshot_sha256,receipt_sha256}`. A138 has one literal phase-aware `final-scope.mjs --run-a138` entrypoint and an append-only `FinalAcceptancePhaseReceipt {schema:1,ordinal,phase,previous_phase_sha256,prefix_sha256,prefix_snapshot_sha256,step8_scope_result_sha256,negative_matrix_result_sha256,source_ready_matrix_result_sha256,expected_a138_result_sha256,runner_root_identity,quarantine_identity,cleanup_manifest_sha256,runner_cleanup_sha256,sentinel_removed_sha256,quarantine_removed_sha256,event82_sha256,summary_sha256,receipt_sha256}` chain under `$FINAL_SCOPE_ROOT/a138-state/`. The closed phase order is `Prepared→Quarantined→CleanupComplete→RemovalPrepared→SentinelRemoved→QuarantineRemoved→Event82Written→SummaryPublished→Finalized`; fields not yet available are null and later receipts preserve every earlier value. Before any root access the entrypoint loads the latest exact phase. With no state it performs all root-dependent positive/negative/source-ready checks, requires runner/final-scope roots on the same device, hashes a complete byte-sorted cleanup manifest, and fsyncs `Prepared`. From `Prepared` it atomically `renameat2(RENAME_NOREPLACE)` moves the exact root to `$FINAL_SCOPE_ROOT/runner-receipt-quarantine`; if a crash lands after rename but before `Quarantined`, retry accepts only original-absent plus an exact dev/inode/sentinel/manifest match at that fixed quarantine path. `Quarantined` cleanup is fd-relative and manifest-driven, deletes only payload entries, keeps `.relay-root.json` as the sole in-quarantine file, writes progress receipts outside under `a138-state/`, and resumes only when remaining payload entries are an exact subset of the bound manifest; unexpected/mutated bytes fail. Sentinel-only with its original bytes/hash and exact directory identity writes `CleanupComplete` and `RunnerCleanupReceipt`. `CleanupComplete` fsyncs `RemovalPrepared` binding sentinel bytes/hash plus directory and parent identities. `RemovalPrepared` unlinks only `.relay-root.json` and parent-fsyncs; if a crash lands after unlink but before `SentinelRemoved`, retry accepts only the fixed path as a literally empty directory with the exact bound dev/inode/owner/mode and original root absent. `SentinelRemoved` binds that state, then `rmdir`s the exact empty directory and parent-fsyncs; if a crash lands after rmdir but before `QuarantineRemoved`, retry accepts absence only from `SentinelRemoved` with the exact cleanup/sentinel chain. `QuarantineRemoved` binds both original/quarantine absence plus cleanup and sentinel-removal hashes. Only `QuarantineRemoved` may write event 82; summary requires event 82 and includes `quarantine_removed_sha256`; `Finalized` requires the durable summary, complete phase chain, and both paths still absent before PASS. A failure before `QuarantineRemoved` leaves no event 82 or final summary. No phase skips, guesses cleanup from mere `Prepared`, or reports met before durable path removal. A synthetic `--a138-crash-matrix` runs first against helper-created disposable sentinel roots and injects `after-prepared`, `after-quarantine`, `during-cleanup`, `after-cleanup`, `before-sentinel-unlink`, `after-sentinel-unlink`, `after-removal`, `after-event-82`, and `after-summary` barriers, requiring retry through the same `--run-a138` entrypoint and byte-identical final receipts. Snapshot/state mutation, progress inside quarantine, original+quarantine coexistence, cross-device rename, quarantine substitution, manifest drift, phase fork/reorder, or any phase-inappropriate root access fails. `AcceptanceSummaryReceipt {schema:1,schedule_sha256,event_chain_head,criteria,criteria_sha256,runner_cleanup_sha256,quarantine_removed_sha256,receipt_sha256}` contains exactly 38 `AcceptanceCriterionSummary {schema:1,criterion_id,events,met,summary_sha256}` rows in A101→A138 inventory order; `events` contains that criterion's exact scheduled `{occurrence_id,event_sha256,result_sha256}` rows in event order; `met` is true only when every scheduled occurrence passed and no extra occurrence exists; `summary_sha256` hashes the preceding summary fields. The completion review and `SourceReadyHandoffReceipt.acceptance_result_sha256s` use exactly these 38 `summary_sha256` values in inventory order and require the matching `Finalized` phase receipt. They never pretend the dependency-ordered event chain itself ran in numeric order or select a “latest” repeated result.
- **Runner live job capability:** Node 24 exposes no public `AF_UNIX SOCK_SEQPACKET`/`SCM_CREDENTIALS`, so JavaScript is validation-only and never launches or owns the native driver, sockets, gates, credentials, or cleanup. Step 1b adds `rust/src/bin/runner_job_custodian.rs` without a new package. The orchestrator builds once into the sentinel-bound immutable `RUNNER_BUILD_DIR`, verifies the owner-executable regular binary, and records `RunnerBinaryIdentity {schema:1,dev,ino,size,mode,sha256,source_head,cargo_lock_sha256}`. Direct path execution is bootstrap only. On entry the binary opens and retains `/proc/self/exe`, exact-matches the external identity, restores CLOEXEC, calls `PR_SET_CHILD_SUBREAPER`, and the original foreground PID becomes long-lived custodian C. C launches driver-loop D from the retained fd with `execveat(AT_EMPTY_PATH)`; D launches every gate G from the same retained fd. C is therefore G's ancestor subreaper: D normally exact-waits G, but if D dies, C adopts, bounded-kills, and exact-waits G plus payload descendants before cleanup, then exact-waits D. No role after bootstrap reopens or executes a pathname. Retarget/unlink after bootstrap must leave descendants on the retained bytes; wrong/missing/leaked self fd or identity fails before sockets/children. Non-Linux returns typed unavailability; no Node fallback exists.

  On the owner-provisioned Linux job, set nonempty `RELAY_RUNNER_ID`, one sentinel-bound `RELAY_RUNNER_RECEIPT` root/path, and validated delegated `RELAY_CGROUP_ROOT`; none is authority. After Steps 1b→3c→3d, start one foreground `RELAY_RUNNER_JOB=1 "$RUNNER_BUILD_DIR/debug/runner_job_custodian" --custodian-driver --state-root "$RUNNER_LIVE_STATE_DIR" --node-wrapper plugins/session-relay/test/runner-job-custodian.mjs --runner-id "$RELAY_RUNNER_ID" --runner-receipt "$RELAY_RUNNER_RECEIPT" --cgroup-root "$RELAY_CGROUP_ROOT"` and retain C/D plus the live capability through A125 (RunGate A7). The native process accepts only the six compiled literal recursively closed RunGate rows in A110 (RunGate A1c)→A111 (RunGate A1d)→A119 (RunGate A5)→A120 (RunGate A5b)→A121 (RunGate A6)→A125 (RunGate A7) order. `node_script`, `args`, sorted `env`, and their compact-JCS hash must byte-equal the compiled row. No caller supplies executable, cwd, raw environment, shell text, assignment prefix, or extra field. Base child names are exactly `HOME|LANG|LC_ALL|PATH|TMPDIR`; auth contributes only the preflight-sealed runtime artifact/name. Duplicate/ambient names fail before gate spawn.

  D creates C↔D credential-checked control plus one per-gate capability channel, one private one-shot GO channel, and one result channel. It launches G from the retained self fd with exactly fixed self-exec, capability, GO-read, and result-write fds. G's first actions restore CLOEXEC on all four, validate each fd/peer/self identity, and close everything else. Before G can send OPEN it blocks on GO. D records G's kernel PID, sends C an authenticated `DriverArm`, completes challenge/response, receives `DriverArmAck`, then writes exactly one matching GO record. C requires C↔D `SO_PASSCRED` sender PID/uid/gid, while OPEN/COMMIT require G's kernel credentials. G cannot spawn Node or emit an authoritative byte before matching GO and OPEN acknowledgement. Node stdin is `/dev/null`; stdout is exactly one bounded canonical `PayloadResult`; stderr is bounded diagnostic; capability/self/GO/result fds are CLOEXEC and absent from Node/runtime descendants. G exact-waits Node, COMMITs evidence, writes exactly one `GateExitRecord`, closes, and exits. D buffers the record, exact-waits G, sends authenticated `DriverReap`, and C advances/emits public `GateResult` only after `DriverReapAck`. COMMIT acknowledgement alone never advances capacity.

  A109 is native-rooted and auth-free: `"$RUNNER_BIN" --matrix-driver --state-root "$RUNNER_MATRIX_STATE_DIR" --expected-self-sha256 "$RUNNER_BIN_SHA256" --emit "$RUNNER_MATRIX_RESULT" && node plugins/session-relay/test/runner-job-custodian.mjs --validate-matrix "$RUNNER_MATRIX_RESULT" --native-source plugins/session-relay/rust/src/bin/runner_job_custodian.rs`. The native matrix uses compiled synthetic payload modes only—success, crash-before-OPEN, crash-after-OPEN, wrong/duplicate COMMIT, and result mismatch—and must not invoke Claude, Codex, real runtime scripts, auth, or cgroups. The later Node process is an offline artifact/source validator and has no native process ancestry. Matrix cleanup removes only its run directory; the immutable build, live run, receipts, and diagnostics remain. Live A110 (RunGate A1c)→A125 (RunGate A7) removes only live scratch after terminal cleanup. A137 validates final scope with runner-receipt cleanup explicitly deferred; contiguous A138 consumes and mutation-tests the Step-8 rehash receipt, then alone performs sentinel-bound final runner-receipt-root cleanup. Failure retains redacted evidence but always closes fds and reaps all owned/adopted processes.

  Literal compact-JCS frames (`args` excludes Node argv[0]; `env` is sorted and every object is closed):

  ```json
  {"args":["--case","exec-stop-feasibility","--matrix","--receipt-phase","exec-stop"],"env":[{"name":"RELAY_REAL_RUNTIME_TEST","source":"literal_one"},{"name":"RELAY_RUNNER_ID","source":"runner_id"},{"name":"RELAY_RUNNER_RECEIPT","source":"runner_receipt"}],"gate":"A1c","node_script":"plugins/session-relay/test/feasibility-probe.mjs","schema":1}
  {"args":["--case","delegated-runner-preflight","--receipt-phase","delegation"],"env":[{"name":"RELAY_CGROUP_ROOT","source":"cgroup_root"},{"name":"RELAY_REAL_RUNTIME_TEST","source":"literal_one"},{"name":"RELAY_RUNNER_ID","source":"runner_id"},{"name":"RELAY_RUNNER_RECEIPT","source":"runner_receipt"}],"gate":"A1d","node_script":"plugins/session-relay/test/runtime-hook-abort.mjs","schema":1}
  {"args":["--case","containment"],"env":[{"name":"RELAY_CGROUP_ROOT","source":"cgroup_root"},{"name":"RELAY_REAL_RUNTIME_TEST","source":"literal_one"},{"name":"RELAY_RUNNER_ID","source":"runner_id"},{"name":"RELAY_RUNNER_RECEIPT","source":"runner_receipt"}],"gate":"A5","node_script":"plugins/session-relay/test/lifecycle-smoke.mjs","schema":1}
  {"args":["--case","cgroup-cooperative-child-spawn","--matrix"],"env":[{"name":"RELAY_CGROUP_ROOT","source":"cgroup_root"},{"name":"RELAY_REAL_RUNTIME_TEST","source":"literal_one"},{"name":"RELAY_RUNNER_ID","source":"runner_id"},{"name":"RELAY_RUNNER_RECEIPT","source":"runner_receipt"}],"gate":"A5b","node_script":"plugins/session-relay/test/runtime-hook-abort.mjs","schema":1}
  {"args":["--matrix"],"env":[{"name":"RELAY_CGROUP_ROOT","source":"cgroup_root"},{"name":"RELAY_REAL_RUNTIME_TEST","source":"literal_one"},{"name":"RELAY_RUNNER_ID","source":"runner_id"},{"name":"RELAY_RUNNER_RECEIPT","source":"runner_receipt"}],"gate":"A6","node_script":"plugins/session-relay/test/runtime-hook-abort.mjs","schema":1}
  {"args":["--matrix"],"env":[{"name":"RELAY_CGROUP_ROOT","source":"cgroup_root"},{"name":"RELAY_REAL_RUNTIME_TEST","source":"literal_one"},{"name":"RELAY_RUNNER_ID","source":"runner_id"},{"name":"RELAY_RUNNER_RECEIPT","source":"runner_receipt"}],"gate":"A7","node_script":"plugins/session-relay/test/runtime-appserver-quiescence.mjs","schema":1}
  ```
- **Runner capability protocol:** `RUNNER_BOOTSTRAP_INPUT_SHA256` remains exactly 64 ASCII zeroes. All control/result packets are one canonical-JCS `SOCK_SEQPACKET` packet, maximum 64 KiB, with exact one-message framing; `MSG_TRUNC|MSG_CTRUNC`, missing/extra/duplicate ancillary credentials, unknown fields, extra packet, early EOF, or oversized/noncanonical bytes poison. C↔D control requires credentials for the recorded D; gate capability requires credentials for the armed G. The closed pre-OPEN handshake is `DriverArm → DriverArmChallenge → DriverArmResponse → DriverArmAck → GateGo → GateOpen`. `DriverArm={schema:1,capability_id,sequence,gate,gate_pid,run_gate_sha256,live_tuple_sha256,input_receipt_sha256,self_identity_sha256,go_channel_sha256,result_channel_sha256}`. GO is a one-shot private record `{schema:1,arm_ack_sha256,gate_pid,sequence,gate}`; G cannot reach OPEN without exact GO, and GO EOF/duplicate/mismatch poisons with zero authoritative bytes. OPEN selectors add `driver_arm_ack_sha256` and `self_identity_sha256` and must exact-match C's `DriverArmed` state.

  The state machine is `Idle{next_sequence} → DriverArmed{arm,arm_ack_sha256} → OpenReserved{...} → CommitReserved{...} → CommittedAwaitingReap{commit_ack_sha256,gate_exit_sha256} → Idle(next)|Complete`; every invalid packet/credential/transition/crash goes terminal `Poisoned`. OPEN and COMMIT retain their challenge/ack hashes and exact receipt/evidence binding, but COMMIT ack never advances. G writes one bounded `GateExitRecord {schema:1,gate,sequence,pid,payload_result_sha256,input_receipt_sha256,result_receipt_sha256,evidence_sha256,open_ack_sha256,commit_ack_sha256}` to its dedicated result channel, closes, and exits. D buffers it, exact-waits the same G PID, sends authenticated `DriverReap {arm_ack_sha256,gate_exit,status}`, and C advances/prints public GateResult only after `DriverReapAck`. Equality is `D-spawn pid = armed pid = OPEN credential pid = selectors.gate_pid = COMMIT credential pid = D wait pid = GateExitRecord.pid = GateResult.pid`; uid/gid and self identity also match. If D dies, C poisons, closes every channel, adopts/kills/waits G and payload as subreaper, and emits no result/capacity advance.

  Fixed G fds are exactly self-exec, capability, GO-read, and result-write. G restores CLOEXEC on all four before validation; none reaches Node. External driver stdin accepts exactly one compiled RunGate JCS line at a time; stdout emits exactly one GateResult only after reap ack; stderr is diagnostic only. Node stdout is exactly one `PayloadResult {schema:1,gate,result_receipt_sha256,evidence_sha256}` and multiple/partial/extra output poisons. Wrapper/borrower/copy-no-fd, OPEN-before-arm/GO, wrong PID/frame/hash, pathname retarget, driver/gate crash at every state, result-before-wait, adopted descendant not reaped, fd leak, duplicate/stale/concurrent sequence, and missing/wrong COMMIT are mandatory negatives.

  A110 (RunGate A1c) uses the bootstrap input and COMMITs the new partial receipt; A111 (RunGate A1d) opens against that partial and COMMITs the sealed final receipt; A119 (RunGate A5)/A120 (RunGate A5b)/A121 (RunGate A6)/A125 (RunGate A7) reuse the sealed receipt while binding new evidence. Any poison/expiry archives redacted evidence and the immutable attempt receipts, uses a fresh custodian/capability/sentinel/state/receipt root, and replays the exact prefix through the predecessor of the outstanding gate: before A119 (RunGate A5) replay A110 (RunGate A1c)→A111 (RunGate A1d); before A120 (RunGate A5b) replay A110 (RunGate A1c)→A111 (RunGate A1d)→A119 (RunGate A5); before A121 (RunGate A6) replay A110 (RunGate A1c)→A111 (RunGate A1d)→A119 (RunGate A5)→A120 (RunGate A5b); before A125 (RunGate A7) replay A110 (RunGate A1c)→A111 (RunGate A1d)→A119 (RunGate A5)→A120 (RunGate A5b)→A121 (RunGate A6). Earlier attempts never let a fresh capability skip a prefix; these new-capability reruns are authorized reconstruction, not same-capability replay. Each terminal `RunnerAttemptReceipt {schema:1,previous_attempt_sha256,binary_identity_sha256,capability_id,state_root_identity_sha256,receipt_root_identity_sha256,started_boottime_ns,finished_boottime_ns,ordered_gate_result_sha256s,terminal_reason,receipt_sha256}` is append-only; A137 validates the full attempt chain and the final active attempt's complete A110 (RunGate A1c)→A125 (RunGate A7) evidence. After A125 (RunGate A7) or failure, C/D close all fds, exact-wait/kill owned or adopted descendants, remove only live scratch, and record cleanup. This proves live same-job continuity under `CooperativeWorkerV1`, not remote attestation against a malicious same-UID job controller.
- **Runner receipt lifetime:** `runner_receipt_ttl_ms = 7_200_000` from A110 (RunGate A1c) OPEN's one `CLOCK_BOOTTIME` start; no phase or retry resets it. ISO timestamps are diagnostic; `{started_boottime_ns,expires_boottime_ns,host_boot_id}` are authoritative for expiry. A110 (RunGate A1c) COMMIT writes the recursively closed `PartialDelegatedRunnerReceipt {schema:1,phase:"exec-stop",runner_id,capability_id,host_boot_id,kernel_release,uid,observed_at,expires_at,started_boottime_ns,expires_boottime_ns,yama_ptrace_scope,ptrace_policy_sha256,exec_stop_results,evidence_sha256,receipt_sha256}` and binds its hash. A111 (RunGate A1d) OPEN exact-validates that file/hash, then A111 (RunGate A1d) COMMIT writes the final `DelegatedRunnerReceipt` with `partial_receipt_sha256` plus delegation/child-cleanup fields and atomically seals its hash. A119 (RunGate A5)/A120 (RunGate A5b)/A121 (RunGate A6)/A125 (RunGate A7) must finish before expiry; after poison/expiry a new live custodian reconstructs the exact ordered prefix specified above in the current owner job before the outstanding gate. Completed step receipts remain historical evidence, but only the new attempt's full prefix is live authority. Boot change, expiry, different runtime bytes, missing/changed partial receipt, dead/poisoned capability, skipped prefix, or live-tuple mismatch fails before authoritative bytes. Both receipts are integrity evidence only—not a signature, attestation, authentication token, or later-run authority—and are never accepted without successful OPEN plus field/delegation revalidation and successful COMMIT.
- **Real runtime:** `runtime-hook-abort.mjs`, `runtime-hook-upgrade.mjs`, `runtime-appserver-quiescence.mjs`, and `feasibility-probe.mjs` create isolated temporary `HOME`, `CODEX_HOME`, plugin config, relay store, cwd, and sentinels. They record exact hook health and stable-runtime manifest/digest plus runtime version. Missing auth/runtime is failure for the real-runtime gate, never skip/pass.
- **Authentication preflight:** before isolated-home tests, run `claude -p 'Print exactly RELAY_AUTH_OK'` and `codex exec --sandbox read-only 'Print exactly RELAY_AUTH_OK'`; each must exit 0 and print only the marker. Step 1 records, from current runtime docs/probes, the exact credential artifact or allowlisted secret-environment variable each CLI supports. The harness creates a mode-0700 temporary home/config, installs only test hook/plugin files, and either read-only references the supported credential artifact at its runtime-defined location or forwards the allowlisted secret variable by name. It never copies credential bytes into artifacts, logs paths/values/hashes, or broad-copies the user's config. If neither safe mechanism is available, STOP and report the runtime row unavailable; do not skip/pass or weaken home isolation.
- **Threat-model owner gate:** RESOLVED 2026-07-11 — owner selected Option 1 (`CooperativeWorkerV1`). This resolves the product boundary only; Draft-23 implementation remains paused for current eligible schema-v1 review evidence, and Step 4 separately requires capability-bound A110 (RunGate A1c)+A111 (RunGate A1d) PASS.
- **Probe evidence contract:** each capability row contains `runtime`, `runtime_version`, `platform`, `argv`, `started_at`, `finished_at`, `exit_status`, base64 or artifact-path `stdout`/`stderr`, artifact SHA-256, parser rule, and derived verdict. The harness rejects a verdict without matching raw evidence, rejects unknown/missing schema fields, verifies its own committed git-blob hash, and emits the raw-record hash chain. There is no editable pass/fail fixture. Partial and final delegated-runner receipts use their recursively closed shapes below and JCS SHA-256 over every field except their own `receipt_sha256`; a matching digest detects accidental byte change only and never proves who produced the receipt.
- **Independent cgroup feasibility verdicts:** Step 1b migrates the evidence schema from stale `strong_cgroup` to two independent verdicts. `cooperative_cgroup` depends only on a fresh domain leaf, gated placement, retained manager authority, `cgroup.kill`, and `populated 0`; freeze is optional. `filtered_hardening` depends on the namespace/seccomp/legacy-clone real-spawn probe and is Claude-only. Failure of either verdict never changes the other. The raw filter row still proves `clone3` returns `-1/ENOSYS` without creating a child and requires a real shell/tool child+wait sentinel for each runtime on which filtered hardening is advertised.
- **Feasibility-first exec-stop gate:** before Step 4, A110 (RunGate A1c) runs the production-shaped blocked-child/host-PID/fd-exec protocol independently for Claude and Codex in the owner-provisioned job and begins `RELAY_RUNNER_RECEIPT`. The supervisor must seize the exact reported task, observe that same tracee at `PTRACE_EVENT_EXEC`, open the procfs magic-link target while it is stopped, compare the opened file's fstat/content hash to the retained executable fd, and detach only after the target-code sentinel is still absent. Any runtime row that cannot meet this contract is `unavailable`; STOP before Step 4 rather than inventing a weaker launch. A110 (RunGate A1c) alone never authorizes Step 4: A111 (RunGate A1d) must complete the same host-bound receipt before expiry.
- **Owner-provisioned positive Linux runner:** authoritative managed-controller/fd-exec and WorkerTree positives are Linux-only in this plan and require an owner-provisioned delegated cgroup-v2 runner before Step 4. The runner must set `RELAY_CGROUP_ROOT` to a writable delegated domain owned by the test uid, on a read-write cgroup2 mount, with permission to create/move into a disposable child and with `cgroup.kill`, `cgroup.events`, and `cgroup.procs` usable in that child; the kernel must support pidfd, `clone3(CLONE_INTO_CGROUP)` or the separately proven stop/GO fallback, ptrace seize/TRACEEXEC, `execveat(AT_EMPTY_PATH)`, and `AF_UNIX SOCK_SEQPACKET`. Provisioning may use a system service/unit with `Delegate=yes` or equivalent CI runner setup, but the tests do not attempt to grant themselves delegation. The current orchestrator sandbox has a read-only cgroup2 view and no user bus, so it is explicitly **not** a positive runner. A111 (RunGate A1d) consumes the partial A110 (RunGate A1c) receipt under live sequence 2, creates one disposable leaf under the supplied fd-root, validates mount id/dev/inode/domain/writable control files, moves one exact stopped child, writes `cgroup.kill`, exact-`waitpid`s and reaps that child with the recorded terminal status before accepting `populated 0`, removes the leaf, completes the receipt, and fails (never skips) on timeout, zombie/unreaped child, populated mismatch, or cleanup failure. A119 (RunGate A5)/A120 (RunGate A5b)/A121 (RunGate A6)/A125 (RunGate A7) consume sequences 3–6 and each live-revalidate the receipt's unexpired runner/boot/kernel/uid/mount/root/runtime identities and current delegation before any child/RPC/fence byte; no cached receipt or copied bytes authorize GO. No Step-4 implementation or any A119 (RunGate A5)/A120 (RunGate A5b)/A121 (RunGate A6)/A125 (RunGate A7) completion claim may begin without capability-bound A110 (RunGate A1c)+A111 (RunGate A1d) PASS from the still-live custodian.
- **Measured attach deadline:** the probe runs 10 isolated cold starts per runtime including sequential store-lock contention. Set `managed_attach_deadline_ms = max_observed_ms + max(2000, ceil(max_observed_ms / 2))`; it must be `<= 20_000`, preserving at least 10 seconds inside the project's explicitly configured 30-second UserPromptSubmit hook budget. If the formula exceeds 20 seconds, STOP. Never lengthen the three-second global store lock.
- **Hook budget:** set `timeout: 30` explicitly on both runtimes' SessionStart and UserPromptSubmit command handlers. Timeout is fail-open and is tested as such; 30 seconds is a configured project budget, not a runtime minimum.
- **Codex hook health and runtime durability:** query `hooks/list` for the exact target cwd and record the two required rows as `HookHealthSnapshot`; missing/untrusted/drifted rows degrade diagnostics/re-entry but are not the managed first-turn linearization point. The app-server direct claim is authoritative. Hook commands use the monotonic stable runtime contract from §5. Production never writes Codex's internal trust state and never uses `--dangerously-bypass-hook-trust`; the feasibility harness may use the bypass only inside its isolated allowlisted home and labels it `test_only_bypass=true`. A live-upgrade matrix starts an N session, validates/installs N+1, ordinarily prunes the N plugin cache, then proves both the old session's UserPromptSubmit and a new/subagent SessionStart execute through the stable runtime. Lower-version concurrency cannot downgrade; known-at-check symlink/nonregular/mode corruption fails the standalone invocation, and once the native installer starts, same-version target/binary/payload/hook identity mismatch plus pinned-source tamper fails closed. Deliberate same-UID replace-all before cached code executes is outside standalone authenticity and is never a positive test expectation.
- **Cancellation/control bounds:** `managed_cancel_poll_ms = 100`, `managed_cancel_grace_ms = 5_000`, `supervisor_control_bind_deadline_ms = 5_000`, `watchdog_heartbeat_interval_ms = 250`, and `watchdog_stale_after_ms = 1_000`. Every admitted blocking loop checks a nonblocking generation/epoch-specific marker at least once per poll interval; it must not acquire the three-second global store lock merely to poll. At grace expiry, the guard must have either completed its external operation or exact-CAS transferred retained authority/evidence to a typed cancellation handoff before releasing. If exact turn identity, exact fence epoch/version, or live child custody cannot be transferred, exact-CAS the still-active operation to `FencingUnconfirmed`, retain it for status/reconcile, and stop waiting; never extend the grace to obtain a green test. `pending_attach.expires_at` is launch time plus the measured `managed_attach_deadline_ms`, so claim-vs-expiry is decided by the one atomic claim transaction. A caller that receives bootstrap data but never binds Control is killed/reaped or durably handed off by the fixed control-bind deadline; no retry resets it.
- **Protocol scan bound:** `protocol_lineage_deadline_ms = 20_000` is one monotonic deadline for all lineage/turn/terminal pages, verified graceful shutdown/reap/flush, and final offline scan. A page, continuous spawner, graceful stop/flush, or offline read that exhausts it returns `ProtocolIncomplete`; no retry loop may extend the same proof attempt. Freeze/kill is a separate physical-containment path and never upgrades protocol evidence.
- **Native platform matrix:** re-verify runner labels in Step 1, then run Darwin process probes natively on `macos-15-intel` and `macos-15`; cross-linking x86_64 on arm64 is not semantic verification. Darwin preserves the portable supervisor-owned-child/process-observation path but must compile and report managed controller/fd-exec/cgroup admission as the closed typed `UnavailablePlatform`; it may not silently emulate the Linux authoritative path. A future Darwin equivalent requires a separately reviewed plan.
- **Remote mutation gate:** canonical A135 is the only acceptance criterion that dispatches external CI. Before it, ask the owner to authorize pushing the exact implementation SHA and dispatching the workflow; do neither implicitly. If approval is withheld, the remote ref mismatches, or GitHub is unavailable, STOP with A135 unverified and do not claim the plan complete. `run-build-matrix.mjs` never pushes; it only verifies the already-authorized remote SHA and dispatches/watches that exact run.
- **Binary discipline:** do not edit `plugins/session-relay/bin/`, manifest versions, marketplace versions, tags, or releases in this source plan. A123 uses isolated source-built synthetic payloads because the committed binaries predate these commands. After source acceptance, the separate owner-gated producer/release workflow must rebuild actual target binaries and rerun packaged 0.10.0→N/N→N hook/live-upgrade plus old-writer authority matrices before release; implementation evidence is never relabeled packaged evidence. Source-plan finish records `packaged_ready=false` and cannot unblock fan-out.

## Interfaces & data shapes

### 1. Durable worker identity, pending attach, and lifecycle

Managed lifecycle is keyed by a pre-launch UUIDv4 `worker_id`, never by the not-yet-known Codex session id. `<AGENT_RELAY_HOME>/lifecycle-v1.json` is the sole authority for lifecycle, binding, operation, supervisor, proof/audit, terminal, and capacity state. `registry.json` remains only the released-format discovery projection (`agents`/`names` and compatibility metadata); old-process loss or rewrite of an Entry never means Unmanaged, never clears authority, and never releases capacity. Every admission/status/re-entry/GC path reads the authority file first. A missing projection for an authoritative session reports `discovery_degraded` and may repair a minimal Entry only after the authority decision.

The authority document is recursively closed and canonical: `LifecycleAuthorityV1 {schema:1,store_id,generation,managed_workers,pending_managed,session_bindings,managed_tombstones,lifecycle_audit,managed_gc_manifests,active_operations,operation_tombstones,cancellation_handoffs,lifecycle_supervisors,lifecycle_watchdogs,managed_appserver_controllers,managed_command_authorizations,loss_cleanup_records,fence_proof_records,capacity_charges,managed_terminal_records,content_sha256}`. `store_id` is immutable UUIDv4; `generation` is a checked canonical decimal u64 incremented once per successful transaction; `content_sha256` is SHA-256 of JCS over the document without that field. Unknown/duplicate/noncanonical/hash-invalid content, or a missing file after initialization, fails closed and is never the registry reader's empty fallback. Under the existing relay-home `.lock`, commit is `create_new` same-directory temp mode 0600 → write all bytes → `sync_all(temp)` → atomic rename over `lifecycle-v1.json` → fsync relay-home directory → unlock. A failure exposes the complete prior or next generation, never an empty/mixed store; orphan exact-name temps are cleaned only under that lock.

The five explicit authority collections added after the original lifecycle maps are canonical byte-sorted maps keyed by their embedded immutable ids: `cancellation_handoffs[handoff_id]`, `managed_appserver_controllers[controller_instance_id]`, `managed_command_authorizations[authorization_id]`, `loss_cleanup_records[cleanup_id]`, and `fence_proof_records[proof_record_sha256]`. Every key, record version, content hash, and cross-reference is validated within the same authority generation. A missing, duplicate, mismatched, dangling, or cross-family reference makes the whole authority document malformed and fails closed; no record is synthesized from `registry.json`, a socket, marker, or live process. There is at most one live controller for an exact worker/generation/binding/control tuple, one live cleanup record for an exact post-loss tuple, and one immutable proof record for an exact worker/generation/fence epoch/fencing version. An `Issued` command authorization references the exact live controller and operation version; a live handoff references the exact `HandedOff` operation custody. Creation, version/state consumption, terminal retirement, and tombstoning occur in the same `lifecycle-v1.json` generation as the worker/binding/operation transition they authorize. A terminal transaction retires every matching live entry into its closed audit/tombstone representation; GC cannot collect a live/referenced entry independently. Step 3c migration creates all five maps empty when no valid legacy record exists; the released 0.10.0 registry writer cannot create, delete, or alter them.

One-time migration is authority-first under `.lock`: if the authority file exists, exact-validate and use it while treating any registry lifecycle extras as stale projection; else exact-validate all known legacy lifecycle keys, durably create the authority document, and only then scrub those extras from `registry.json`; with no legacy keys, create the closed empty authority before first lifecycle use. Crash after authority creation but before scrub resumes from authority. Conflicting registry extras never overwrite it. Every safety decision—including pending creation, Claiming/Managed/Active, fencing, release, and abandonment—commits entirely in `lifecycle-v1.json`; Entry/name/marker writes happen afterward as repairable projection and cannot participate in the linearization point. The plan promises old 0.10.0 **non-erasure**, not managed behavior from an already-running old executable.

```rust
pub enum ManagedState {
    Attaching,
    Active,
    Fencing,
    FencingUnconfirmed,
    Fenced,
    TerminalRetained,
    TerminalReleasable,
}

pub enum RequiredScope { ProcessOnly, ProtocolTree, WorkerTree }

pub enum ExecutionBackend {
    LinuxPidFdProcess,
    SupervisorOwnedProcess,
    SupervisorOwnedGroup,
    ConfinedCgroupCooperative,
    TrackedTree,
    SharedAppServer,
    DedicatedConfinedAppServer,
    ObservationOnly,
}

pub struct ReleaseReceipt {
    pub worker_id: String,
    pub generation: String,
    pub released_at: String,
    pub mode: String,       // "proved" | "risk-accepted"
    pub reason: String,
    pub evidence_sha256: String,
}

pub enum ManagedTerminalOutcome { ProvedReleased, RiskAcceptedAbandoned }

pub enum CapacityChargeState {
    Held,
    Released { terminal_receipt_sha256: String },
}

pub struct CapacityCharge {
    charge_id: String,
    scope_id: String,
    worker_id: String,
    generation: String,
    version: String,
    state: CapacityChargeState,
}

pub struct ManagedTerminalReceipt {
    schema: u8, // exactly 1
    worker_id: String,
    generation: String,
    prior_worker_version: String,
    terminal_worker_version: String,
    runtime_session_id: String,
    prior_binding_epoch: String,
    terminal_binding_epoch: String,
    outcome: ManagedTerminalOutcome,
    proof_sha256: Option<String>,
    reason: String,
    acknowledgement: Option<String>,
    capacity_charge_id: Option<String>,
    prior_capacity_version: Option<String>,
    terminal_capacity_version: Option<String>,
    retired_authority_sha256: String,
    terminal_at: String,
    gc_eligible_at: String,
    not_quiescence_proven: bool,
    receipt_sha256: String,
}

pub struct FenceProofRecord {
    worker_id: String,
    generation: String,
    fence_epoch: String,
    fencing_version: String,
    scope: RequiredScope,
    backend: ExecutionBackend,
    evidence_sha256: String,
    completed_at: String,
    proof_record_sha256: String, // JCS SHA-256 of every preceding field
    _sealed: lifecycle::Sealed,
}

pub enum SessionOperationOutcome { Reaped, RiskAccepted }

pub struct SessionOperationReceipt {
    runtime_session_id: String,
    terminal_binding_epoch: String,
    operation_id: String,
    final_operation_version: String,
    outcome: SessionOperationOutcome,
    authority_binding_sha256: String,
    evidence_sha256: String,
    terminal_at: String,
    _sealed: lifecycle::Sealed,
}

pub struct SessionOperationTombstone {
    runtime_session_id: String,
    terminal_binding_epoch: String,
    operation_id: String,
    final_operation_version: String,
    outcome: SessionOperationOutcome,
    receipt_sha256: String,
    terminal_at: String,
    gc_eligible_at: String,
}

pub enum CodexManagedBoundary {
    RelayOwnedAppServer {
        server_fingerprint: String,
        thread_id: String,
        controller_instance_id: String,
    },
}

pub enum LostAuthorityReason {
    CancelDeadline,
    HandoffRebindFailed,
    SupervisorLost,
    CustodyLost,
    ProxyStartupFailed,
    AppServerClaimFailed,
}

pub struct PendingAttach {
    pub worker_id: String,
    pub generation: String,
    pub token_sha256: String,
    pub expected_runtime_session_id: Option<String>, // Claude Some; Codex None until thread/start
    pub expected_tool: String,
    pub expected_cwd: String,
    pub expires_at: String,
    pub version: String,
    pub claim_state: PendingClaimState,
}

pub enum PendingClaimState {
    Available,
    WaitingOnCancel {
        runtime_session_id: String,
        binding_epoch: String,
        operation_id: String,
        cancellation_epoch: String,
        claim_version: String,
    },
    Claiming { runtime_session_id: String, claim_version: String },
}

pub struct WaitingManagedClaim {
    pub worker_id: String,
    pub generation: String,
    pub token_sha256: String,
    pub runtime_session_id: String,
    pub tool: String,
    pub canonical_cwd: String,
    pub pending_version: String,
    pub claim_version: String,
    pub deadline_at: String,
}

pub struct ManagedWorker {
    pub worker_id: String,
    pub generation: String,
    pub runtime_session_id: Option<String>,
    pub claimed_token_sha256: Option<String>,
    pub tool: String,
    pub cwd: String,
    pub state: ManagedState,
    pub version: String,                 // canonical checked u64 decimal string
    pub fence_epoch: Option<String>,     // Some only while Fencing; copied into terminal proof/audit
    pub required_scope: RequiredScope,
    pub execution: ExecutionBackend,
    pub process_identity: Option<ProcessIdentityRecord>,
    pub appserver_lineage: Option<AppServerLineageRecord>,
    pub codex_boundary: Option<CodexManagedBoundary>,
    pub fence_reason: Option<String>,
    pub proof_gap: Option<String>,
    pub lost_authority: Vec<LostAuthorityEvidence>,
    pub release_receipt: Option<ReleaseReceipt>,
}

pub struct SessionBinding {
    pub runtime_session_id: String,
    pub binding_epoch: String, // canonical checked u64 decimal string
    pub state: BindingState,
}

pub enum BindingState {
    Unmanaged,
    UnmanagedCanceling {
        operation_id: String,
        cancellation_epoch: String,
        binding_epoch: String,
        waiting_claim: Option<WaitingManagedClaim>,
        lost_operations: Vec<LostAuthorityEvidence>,
    },
    GcDeleting { gc_epoch: String, binding_epoch: String, entry_version: String },
    Claiming { worker_id: String, generation: String, claim_version: String },
    Managed { worker_id: String, generation: String },
    ManagedTerminal {
        worker_id: String,
        generation: String,
        terminal_epoch: String,
        outcome: ManagedTerminalOutcome,
        terminal_receipt_sha256: String,
    },
    ManagedGcDeleting {
        gc_epoch: String,
        worker_id: String,
        generation: String,
        terminal_epoch: String,
        outcome: ManagedTerminalOutcome,
        terminal_receipt_sha256: String,
    },
    TerminalFence {
        terminal_epoch: String,
        outcome: ManagedTerminalOutcome,
        terminal_receipt_sha256: String,
    },
}

pub struct ProcessIdentityRecord {
    pub observation: ProcessObservation,
    pub live_supervisor_instance_id: Option<String>,
    pub cgroup_boundary: Option<CgroupBoundary>,
    pub recorded_at: String,
}

pub struct AppServerLineageRecord {
    pub authority: AppServerAuthority,
    pub root_thread_id: String,
    pub thread_edges: Vec<ThreadEdge>,
    pub turn_ids: Vec<String>,
    pub last_complete_page_hash: Option<String>,
}

pub struct ManagedAppServerControllerRecord {
    worker_id: String,
    generation: String,
    binding_epoch: String,
    controller_instance_id: String,
    controller_version: String,
    supervisor_instance_id: String,
    control_epoch: String,
    server_fingerprint: String,
    root_thread_id: String,
    socket_path: PathBuf,
    socket_dev: u64,
    socket_ino: u64,
    request_sequence: String,
    connection_state: AppServerConnectionState,
    in_flight: Vec<AppServerRequestCustody>,
    notification_sequence: String,
}

pub enum AppServerConnectionState { Starting, Ready, LostAuthority, Terminal }

pub struct AppServerRequestCustody {
    operation_id: String,
    operation_version: String,
    direction: RpcDirection,
    request_id: RpcId,
    method: String,
    request_sequence: String,
    state: AppServerRequestState,
}

pub enum RpcDirection { ClientToServer, ServerToClient }
pub enum AppServerRequestState { Prepared, RequestSentUnknown, Completed, LostAuthority }

pub struct LostAuthorityEvidence {
    operation_id: String,
    operation_version: String,
    reason: LostAuthorityReason,
    observed_at: String,
}

pub enum AppServerAuthority {
    SharedSocket { server: String },
    DedicatedStdio { supervisor_instance_id: String, process: ProcessObservation },
}

pub struct ThreadEdge {
    pub parent_thread_id: String,
    pub child_thread_id: String,
}
```

Claude's launcher generates a 256-bit random raw token, persists only SHA-256, and passes `RELAY_MANAGED_WORKER_ID`, `RELAY_MANAGED_GENERATION`, and `RELAY_MANAGED_ATTACH_TOKEN` to the owned CLI child. Codex token custody is controller-local: after an authenticated supervisor resolves `ChildLaunchSpec::ManagedCodexAppServer`, the supervisor generates the raw token, atomically creates the pending attach with only its hash, and retains the raw token only in the controller's locked memory. It starts the dedicated server, runs `thread/start`, claims the returned identity, then zeroizes/drops the raw token after the final claim result. The raw token never crosses caller/watchdog bootstrap, argv, environment, store, log, diagnostic, event, or later controller socket. Before claim it authorizes one identity binding; after claim only the claimed-token hash supports idempotency for the same worker/generation/session/tool/canonical-cwd/controller tuple and can never bind another tuple. Supervisor/controller loss before final claim consumes/refuses the exact pending record and applies the pre-binding loss row below; no replacement controller can recover the secret or adopt the child.

Every runtime session, including a not-yet-managed Codex id, has a persisted monotonically increasing `binding_epoch`. Admission, first SessionStart claim, unmanaged-operation cancellation, pending-token creation, and Unmanaged GC serialize through that record; this is mandatory. `UnmanagedCanceling` is the exact pre-claim cancellation linearization state and refuses new mutation. `GcDeleting` is a separate internal durable exclusion state: admission/claim/pending creation seeing it refuses or bounded-retries without creating surfaces.

Unmanaged disconnect and first SessionStart race in one short `with_lock` transaction. If disconnect wins, exact-CAS `Unmanaged@epoch + ActiveOperation@version → UnmanagedCanceling` with a new stable `cancellation_epoch`, and mint `CancellationAuthority::UnmanagedOperation` for only that session/epoch/operation/cancellation epoch; mutable custody version is checked separately on every command. A claim that sees `UnmanagedCanceling` does not wait only in memory: in one transaction it validates the pending token, reserves its exact pending version as `WaitingOnCancel`, and installs the full `WaitingManagedClaim`. An exact duplicate joins that durable waiter; a conflicting tuple refuses. Exact reap with `Some(waiter)` atomically advances `UnmanagedCanceling@N→Claiming@N+1`, advances the same pending record to Claiming, and preserves its claim version for exactly one finalization; with `None` it advances to `Unmanaged@N+1`. If the fixed claim deadline expires with `Some(waiter)`, one transaction consumes that exact pending token, advances the binding to `Managed@N+1`, rebinds the operation to a new exact fence epoch/version, and applies the exceptional `Attaching→FencingUnconfirmed` transition with `LostAuthority/CancelDeadline`; it never publishes Active. If SessionStart wins and publishes Claiming/increments epoch first, the old unmanaged authority is stale and emits zero signal/state bytes; Claim authority owns cancellation. Late reap/cancel reports after any winner only append stale audit. `UnmanagedCanceling` with lost/unreaped authority is non-GCable and status-addressable by session+operation. Crash/retry reconstructs the waiter only from these durable records; it never relies on a live hook call.

`claim_managed_attach(token, runtime_session_id, tool, cwd)` for Claude and `claim_managed_appserver(token, runtime_session_id, server_fingerprint, controller_instance_id, cwd)` for Codex share one two-phase bind whose **first operation is one short `with_lock` publication transaction**:

1. Hash token; validate `pending_managed[token_hash]`, generation/tool/canonical cwd/expiry and optional Claude id; reject conflicting binding; increment `binding_epoch`; atomically write `BindingState::Claiming { worker_id, generation, claim_version }`, mark the token claim-in-progress, and publish cancellation for all older-epoch guards. Do not run GC, marker writes, ordinary register, drain, RPC, process work, or wait first.
2. Outside the global lock, acquire the session binding/activity lock exclusively and drain prior epoch guards within `managed_cancel_grace_ms`. New admission sees `Claiming` and refuses. Older `Unmanaged` guards may finish work begun before Claiming, but cannot survive into Managed because final binding waits for their shared guards to release and every lower use re-resolves the epoch.
3. Under one second short `with_lock`, CAS the exact Claiming `binding_epoch + claim_version`, pending token, and worker `Attaching` version to `BindingState::Managed` + worker `Active`; write Entry/session binding/claimed-token hash and remove pending. If drain or final CAS fails, exact-CAS Claiming to `BindingState::Managed` bound to the worker in `ManagedState::Fencing` (never Active), retain the binding/epoch, and block the prompt; future admission therefore resolves managed refusal rather than recreating Unmanaged authority.

For Codex the detached supervisor is also the durable app-server controller: it retains the dedicated server Child, stdin/stdout JSON-RPC transport, request map, server-request/approval handler, and notification pump for the full managed lifetime. It calls `thread/start`, persists the returned thread id/server fingerprint/controller record, and invokes `claim_managed_appserver`; it MUST NOT emit `turn/start` before the exact claim commits Active. Codex SessionStart occurs inside `thread/start`, before the controller receives that result, so it is explicitly **non-claiming** for managed birth: it may append a provisional observation but returns success immediately without drain, wait, Active publication, or token use. The controller is the sole claimant; exact controller retry joins the durable claim. Claim failure or deadline emits no `turn/start`, exact-transitions through the lost-authority table below, and asks the retained supervisor to stop/reap the dedicated app-server and its confined tree. Managed Codex wake/resume from a later relay process uses a short-lived, same-UID, capability-bound controller command over the recorded socket; it never depends on the original caller, forwards arbitrary JSON bytes, or falls back to `codex exec`, TUI resume, or a third-party client.

After Active, marker/ordinary registration/GC run as best-effort follow-ups and cannot undo the authoritative binding. An exact duplicate **Claude** SessionStart during Claiming joins/polls that claim result; Codex SessionStart remains non-claiming and controller retry supplies Codex idempotency.

Duplicate/resume semantics are exact:

| Input | Result |
|---|---|
| Concurrent duplicate with same claimed token + same runtime id/generation/tool/cwd and, for Codex, exact controller retry with same server/controller boundary | Join the one durable claim and return its exact committed result without version/state churn: Active only if the original finalized Active, otherwise the same structured stop/refusal. Managed Codex SessionStart never enters this row. |
| SessionStart resume without token + exact existing session binding/tool/cwd | Re-evaluate lifecycle: Active continues; any fenced/nonterminal-stop state emits structured stop. |
| Claimed token with different runtime id/tool/cwd/generation or Codex server/controller boundary | Refuse and audit; never rebind. |
| Expired unclaimed token | Refuse; `Attaching→Fencing`; supervisor fences using retained handles. |
| Token replay after bind to a second worker/id | Refuse and audit. |

The closed worker transitions are `Attaching→Active|Fencing`; exceptional `Attaching→FencingUnconfirmed` only through the exact lost-authority mapping below; `Active→Fencing`; `Fencing→Fenced|FencingUnconfirmed`; `FencingUnconfirmed→Fencing` only through reconcile; `Fenced→TerminalRetained` only through crash-resumable proof retention; `TerminalRetained→TerminalReleasable` only through explicit release; `FencingUnconfirmed→TerminalReleasable` only through audited abandonment. `Active→Fencing` and reconcile mint `fence_epoch=Some(new_uuid)` and the resulting worker `version` is the exact `fencing_version`; later states clear the live field only after copying both values into proof/audit records.

Release/abandon linearize as one authority-file CAS, never as a worker-only transition. The transaction revalidates exact worker/generation/version, runtime session, `BindingState::Managed` tuple and binding epoch, optional capacity charge/version, proof hash or abandonment acknowledgement, and no competing `ManagedGcDeleting`; it refuses while any `LossCleanupRecord` is Pending/Running. Proved release requires `TerminalRetained` plus the retained proof at the required scope. Risk-accepted abandonment requires `FencingUnconfirmed`, explicit reason and acknowledgement, emits no signal, and records `not_quiescence_proven=true`. In one `lifecycle-v1.json` generation it writes worker `TerminalReleasable`, binding epoch N→N+1 as `ManagedTerminal`, the closed `ManagedTerminalReceipt`, every matching live operation/controller/custody/supervisor/watchdog/handoff as terminal audit/tombstone bound to that receipt, and `CapacityCharge::Held→Released` bound to the same receipt. `capacity_charge_id=None` is allowed only for a worker durably born without a reservation; later fan-out-reserved workers must carry Some and cannot substitute None. Capacity excludes the worker only when released charge, terminal worker, terminal binding, and receipt hashes all agree; any missing/mismatch remains charged. Retry returns the same receipt; stale actors are audit-only.

`ManagedTerminal|ManagedGcDeleting|TerminalFence` always refuse SessionStart/admission/re-entry before registry, marker, mailbox, RPC, or process bytes. After the ordinary cutoff and exact receipt/reference validation, managed GC CASes `ManagedTerminal→ManagedGcDeleting`, performs crash-resumable physical projection cleanup, then in one final authority transaction removes the heavy worker/released charge/heavy terminal records and replaces the binding with compact `TerminalFence`; it never recreates Unmanaged. The compact fence is permanent under this plan, especially for risk-accepted abandonment where a process may still exist. A future explicit purge policy requires separate review.

Every lost-authority source and reason uses exactly one row; a stale actor is audit-only and cannot skip a state:

| Source at exact CAS | Required transition |
|---|---|
| Pending worker `Attaching`, no owned session binding | A claim-validation refusal (expired token, returned id already foreign-bound, wrong cwd/tool/server/controller, or crash before Claiming) preserves the foreign/absent binding byte-for-byte and consumes/refuses only the exact pending token. With retained supervisor/cgroup custody, worker-only `Attaching→Fencing` fences the dedicated child; with lost custody, exceptional worker-only `Attaching→FencingUnconfirmed`. Never invent or mutate a session binding. Validation refusal is distinct from `LostAuthority`; controller/supervisor loss after pending creation records the matching typed loss on the worker-owned operation. |
| `Unmanaged` / pre-bind operation | `Unmanaged→UnmanagedCanceling` plus typed operation `LostAuthority(reason)` and append exact `LostAuthorityEvidence`. |
| Already `UnmanagedCanceling` | Keep lifecycle state; exact-CAS each additional current operation to typed loss and append its original evidence. A waiting claim binds the complete loss set; it never rewrites non-deadline reasons to `CancelDeadline`. |
| `Claiming` / worker `Attaching` | Atomically bind the exact worker as Managed and apply exceptional `Attaching→FencingUnconfirmed` with the complete typed loss set; consume the pending token; never Active. |
| `Active` | In one store transaction mark every matching unresolved operation lost, preserve each reason, and apply `Active→Fencing` with a new fence epoch/version then exact `Fencing→FencingUnconfirmed`; direct `Active→FencingUnconfirmed` is forbidden. |
| `Fencing` for the matching fence epoch/version | Batch-mark every matching unresolved operation and apply `Fencing→FencingUnconfirmed` with the typed loss set. |
| Already `FencingUnconfirmed` | Keep lifecycle state; exact-CAS any additional current operation loss and append its typed evidence. |
| Exact current `Fenced|TerminalRetained|TerminalReleasable` | Lifecycle and custody are immutable; append audit only, even when the reporting actor otherwise matches. |
| Any stale binding/operation/handoff/claim/fence version | Append stale audit only; zero state, signal, RPC, or output bytes. |

The table applies to every enumerated `LostAuthorityReason`; reason-specific code may not invent strings or another transition. One supervisor/watchdog/controller failure is processed as one atomic batch across every matching operation, so later current reports see an already-fail-closed row rather than an undefined intermediate state. When a row's closed transaction ends in `FencingUnconfirmed` and still has exact live supervisor plus retained child/cgroup custody, that transaction also creates one durable `LossCleanupRecord::Pending` and returns one sealed `LossCleanupPermit` bound to `{worker_id,generation,fence_epoch,post_loss_fencing_version,supervisor_instance_id,control_epoch,loss_batch_sha256,host_boot_id,deadline_boottime_ns,cleanup_handle_slot}`. The record atomically fixes `created_boottime_ns` and that deadline when it is created. This permit is the sole exception to the ordinary “current Fencing only” action rule: it is explicitly valid only against the exact post-loss `FencingUnconfirmed` version written by the same transaction. A retained-custody `Attaching→Fencing` row uses the ordinary fence path instead; no live matching custody means no permit and no guessed cleanup.

`perform_loss_cleanup` atomically consumes `Pending@cleanup_version→Running@cleanup_version+1` only after re-resolving the exact post-loss worker/version, supervisor/control epoch, loss batch, host boot id, unexpired fixed deadline, and private composite cleanup-handle slot; the transaction writes one fresh `cleanup_attempt_id`. Replay, stale version/epoch/attempt, a different loss batch or boot, another handle, or an expired deadline emits zero close/signal/RPC bytes. The deadline is fixed once at record creation as `created_boottime_ns + managed_cancel_grace_ms`; permit delivery, Running transition, retry, and supervisor health never reset it.

A crash after durable Pending but before permit delivery/consumption is bounded: at or after that fixed deadline, the watchdog or explicit reconcile may exact-CAS only the matching Pending version to `Failed(PendingPermitExpired)` with zero cleanup bytes and no reminted permit. A late original permit loses CAS and emits zero bytes. Running uses the same deadline. At or after it, watchdog or reconcile may exact-CAS the exact Running version and `cleanup_attempt_id` to `Failed(RunningDeadlineOutcomeUnknown)` even when the supervisor remains health-responsive; health is diagnostic and cannot make a stalled executor immortal. Boot-id change exact-CASes the matching nonterminal record to `Failed(HostBootChanged)` with zero action. Timeout/boot recovery never closes, signals, emits RPC, constructs proof, changes `FencingUnconfirmed`, or releases capacity.

The cleanup actor revalidates exact Running tuple/attempt/deadline before each new close/kill/reap operation and issues no new operation after deadline or stale state. It targets only retained exact stdio/Child/cgroup-fd authority; operations are monotonic/idempotent. An operation already entered before timeout may finish, but its late completion CAS loses and cannot alter lifecycle, proof, receipt, or capacity. Completion versus timeout has exactly one exact-CAS winner. Reconcile/release/abandon seeing unexpired `Pending|Running` refuses without epoch/state change; after a terminal `Failed|Completed`, a separately authorized new fence epoch or explicit audited abandonment may proceed, but Failed never implies quiescence and ordinary proved release still cannot. The worker stays `FencingUnconfirmed` before, during, and after cleanup. `LossCleanupOutcome` is diagnostic evidence only: it cannot construct `FenceEvidence`, `FenceProofRecord`, `ReleaseReceipt`, `TerminalRetained`, or free a capacity slot even when close/kill/reap/populated-zero all succeed.

A claim arriving after pre-bind loss transfers the original typed evidence; only expiry of still-live cancellation authority adds `CancelDeadline`. Closed unmanaged transitions are `Unmanaged@N→UnmanagedCanceling@N`; exact reap with a durable waiting claim `UnmanagedCanceling@N→Claiming@N+1`; exact reap/reconcile without one `→Unmanaged@N+1`; exact live cancel deadline with a durable waiter `→Managed@N+1` paired with exceptional `Attaching→FencingUnconfirmed(CancelDeadline)`; risk-accepted `abandon-session→Unmanaged@N+1` with `NOT QUIESCENCE-PROVEN` receipt. No other unmanaged transitions exist. Only releasable managed records and terminal unmanaged-operation tombstones with their required receipt may age out. Binding GC alone may exact-CAS plain `Unmanaged→GcDeleting→removed`; `UnmanagedCanceling` is never GC-eligible. Failed pre-delete lock acquisition restores untouched Unmanaged; once deletion starts `GcDeleting` is crash-resumable. `Claiming`, `Managed`, `ManagedTerminal`, `ManagedGcDeleting`, and `TerminalFence` never age or disappear independently of their exact authority-file protocol.

### 2. Binding-safe admission, fence intent, and sealed capabilities

Admission first resolves a binding capability, then applies the already-sound publish-first fence protocol. The atomically saved `ManagedState::Fencing` record remains the fence-intent publication and linearization point; a separate generation-bound marker may cache it for fast refusal but is never authoritative:

1. `admit_operation(target, kind)` resolves/creates the target session's `SessionBinding` under `with_lock`. `Claiming` refuses. `Unmanaged` or Active Managed captures the exact runtime session, worker (if any), generation, `binding_epoch`, lifecycle version, canonical tool/cwd/app-server selectors, and one allowed `OperationKind`.
2. Admission checks authoritative binding/lifecycle before touching the per-session binding lock or per-worker `activity.lock`, acquires the required shared locks, then re-resolves the same binding epoch/state/generation/version. A changed record releases and refuses. The returned guard retains both locks for its lifetime.
3. Under one short `with_lock`, fencing validates generation and CAS `Active→Fencing` with a new `fence_epoch`/version; release the global lock. Only then materialize a cache marker or drain. A crash between CAS and cache remains fenced.
4. A caller whose first lifecycle read follows Fencing refuses without joining activity. The fencer publishes cancellation, then acquires **every session binding lock currently bound to the worker plus worker activity** exclusively in deterministic session-id order. This includes an older Unmanaged guard caught by Claiming/attach failure even though it never joined worker activity. Previously admitted operations poll cancellation and release; any binding/activity drain timeout CASes the exact fence epoch to `FencingUnconfirmed`.
5. No global store lock is held while acquiring binding/activity locks, waiting, spawning, pumping, interrupting, or signaling.

```rust
pub enum OperationKind {
    SessionStartDrain,
    UserPromptDrain,
    CliInboxDrain,
    McpInboxDrain,
    ChannelDeliver,
    WatchInject,
    WatchAutoTurn,
    WatchAck,
    WatchWakeFallback,
    WakeAppServer,
    WakeCli,
    AttachResume,
    InitialTurn,
    ControllerRead,
    ControllerInjectItems,
    ControllerStartTurn,
}

pub enum GuardTarget {
    Session {
        runtime_session_id: String,
        worker_id: Option<String>,
        generation: Option<String>,
        binding_epoch: String,
        tool: String,
        canonical_cwd: String,
    },
    AppServerThread {
        runtime_session_id: String,
        worker_id: Option<String>,
        generation: Option<String>,
        binding_epoch: String,
        tool: String,
        canonical_cwd: String,
        server_fingerprint: String,
        thread_id: String,
    },
    PendingWorker {
        worker_id: String,
        generation: String,
        worker_version: String,
        tool: String,
        canonical_cwd: String,
        birth_operation_id: String,
        birth_operation_version: String,
    },
}

pub struct SharedFileLock { file: File, _sealed: lifecycle::Sealed }
pub struct ExclusiveFileLock { file: File, _sealed: lifecycle::Sealed }
pub struct CancelToken {
    marker_path: PathBuf,
    operation_id: String,
    expected_operation_version: String,
    binding_epoch: String,
    generation: Option<String>,
    claim_or_fence_epoch: Option<String>,
}

pub enum ExternalCustody {
    None,
    TurnNotSent,
    TurnStartSentUnknown { thread_id: String, server_fingerprint: String },
    TurnKnown { thread_id: String, turn_id: String, server_fingerprint: String },
    TurnTerminal { thread_id: String, turn_id: String, status: String },
    ChildStarting { supervisor_instance_id: String },
    ChildOwned { supervisor_instance_id: String, process: ProcessObservation },
    ChildCancelRequested { supervisor_instance_id: String, process: ProcessObservation, request_id: String },
    ChildReaped { supervisor_instance_id: String, process: ProcessObservation, exit_status: i32 },
    HandedOff { handoff_id: String },
    LostAuthority { last_observation: Option<ProcessObservation>, reason: LostAuthorityReason },
}

pub struct ActiveOperationRecord {
    operation_id: String,
    runtime_session_id: String,
    worker_id: Option<String>,
    generation: Option<String>,
    binding_epoch: String,
    lifecycle_version: Option<String>,
    operation_version: String, // checked u64 decimal; incremented by every custody transition
    kind: OperationKind,
    custody: ExternalCustody,
}

pub enum CancellationAuthority {
    UnmanagedOperation {
        runtime_session_id: String,
        binding_epoch: String,
        operation_id: String,
        cancellation_epoch: String,
    },
    Claim { binding_epoch: String, claim_version: String },
    Fence { generation: String, fence_epoch: String, fencing_version: String },
}

pub enum HandoffCustody {
    KnownTurn { thread_id: String, turn_id: String, server_fingerprint: String },
    SupervisorChild {
        supervisor_instance_id: String,
        process: ProcessObservation,
        cancel_request_id: String,
    },
}

pub struct CancellationHandoff {
    handoff_id: String,
    handoff_version: String,
    operation_id: String,
    source_operation_version: String,
    authority: CancellationAuthority,
    custody: HandoffCustody,
    transferred_at: String,
}

pub struct ReentryGuard {
    target: GuardTarget,             // private; lower APIs derive target from here
    allowed: OperationKind,          // exactly one operation family
    lifecycle_version: Option<String>,
    binding_guard: SharedFileLock,   // retained for the guard lifetime
    activity_guard: Option<SharedFileLock>,
    deadline: Instant,
    cancel: CancelToken,
    operation_id: String,
    _sealed: lifecycle::Sealed,
}

pub enum Admission {
    Unmanaged(ReentryGuard),
    Managed(ReentryGuard),
    Refused {
        runtime_session_id: String,
        binding_epoch: String,
        worker_id: Option<String>,
        managed_state: Option<ManagedState>,
        reason: String,
    },
}

pub fn admit_operation(session_or_worker: &str, kind: OperationKind) -> Result<Admission, String>;
pub fn publish_fence(worker_id: &str, generation: &str, reason: &str) -> Result<FenceIntent, String>;
pub fn drain_prior_operations(intent: FenceIntent) -> Result<FencePermit, DrainError>;
```

`ReentryGuard` construction, fields, target resolution, and seal remain private to `lifecycle.rs`. Admission durably creates one versioned `ActiveOperationRecord`; `drop` may remove it only when no external action was sent or exact terminal/reap evidence is recorded. Unresolved custody survives guard/process loss and is non-GCable. A session with unresolved unmanaged custody refuses every later mutating admission (pure reads/status only) until a claim binds it into Fencing/FencingUnconfirmed or an operator resolves/abandons it. Immediately before every lower mutation, `authorize_use(&mut guard, expected_kind)` re-reads the binding and lifecycle under one short `with_lock`; it rejects a changed epoch/state/generation/version or wrong kind, then releases the global lock before the external action. Because the guard still holds the shared binding/activity locks, a Claiming transition cannot finalize Managed and a Fencing transition cannot finish drain while that authorized action remains live.

Every custody mutation uses `cas_operation_custody(operation_id, expected_operation_version, expected_variant, next)` in one short store transaction and increments `operation_version`; no external work occurs under the lock. `cancellation_epoch` is stable across those custody versions, while every supervisor command separately exact-checks the current operation version. The closed transitions are `None→TurnStartSentUnknown|ChildStarting`; `TurnStartSentUnknown→TurnNotSent|TurnKnown|LostAuthority`; `TurnKnown→TurnTerminal|HandedOff|LostAuthority`; `ChildStarting→ChildOwned|LostAuthority`; `ChildOwned→ChildCancelRequested|ChildReaped|LostAuthority`; `ChildCancelRequested→ChildReaped|HandedOff|LostAuthority`; and `HandedOff→TurnTerminal|ChildReaped|LostAuthority`. Creating a handoff atomically creates `{handoff_id,handoff_version=1,source_operation_version}` and CASes custody to `HandedOff`; consuming/updating it checks both operation and handoff versions. A losing delayed response/terminal/supervisor report writes at most an append-only stale-event audit and cannot change custody, lifecycle, signal, or RPC bytes. At the `TurnStartSentUnknown` grace deadline the guard closes its connection and exact-CASes `LostAuthority`; a response that arrives after that CAS is never allowed to resurrect the operation.

Lower APIs take **no independently supplied session, worker, server, thread, cwd, tool, process target, program, raw argv, or raw environment**. They derive all authority selectors and executable identity from the capability. The only separate launch payload is a closed typed value whose variants contain validated behavior data, never an escape hatch:

```rust
store::drain_with_guard(&mut ReentryGuard)
appserver::resume_with_guard(&mut ReentryGuard)
appserver::inject_with_guard(&mut ReentryGuard, items)
appserver::start_turn_with_guard(&mut ReentryGuard, prompt)
spawn::run_child_with_guard(&mut ReentryGuard, ChildLaunchSpec)
spawn::run_managed_codex_with_permit(&mut ManagedBirthPermit, ManagedCodexBirthOptions)

pub enum ChildLaunchSpec {
    AttachResume(AttachOptions),
    WakeDoorbell(DoorbellMessage),
    WatchWakeFallback(DoorbellMessage),
}

pub struct AttachOptions {
    pub model: Option<ValidatedModel>,
    pub effort: Option<ValidatedEffort>,
}

pub struct ManagedCodexBirthOptions {
    pub model: Option<ValidatedModel>,
    pub effort: Option<ValidatedEffort>,
    pub sandbox: ValidatedSandbox,
    pub initial_prompt: ValidatedAppServerInput,
}

pub enum ValidatedSandbox { ReadOnly, WorkspaceWrite, DangerFullAccess }

pub struct ManagedBirthPermit {
    worker_id: String,
    generation: String,
    worker_version: String,
    tool: String,
    canonical_cwd: String,
    birth_operation_id: String,
    birth_operation_version: String,
    consumed: bool,
    _sealed: lifecycle::Sealed,
}

pub struct ValidatedThreadView {
    pub thread_id: String,
    pub status: String,
    pub cwd: PathBuf,
    pub source_kind: String,
}

pub struct SupervisorRecord {
    supervisor_instance_id: String,
    control_epoch: String,
    operation_id: String,
    operation_version: String,
    process: ProcessObservation,
    socket_path: PathBuf,
    socket_dev: u64,
    socket_ino: u64,
    version: String,
    state: SupervisorState,
}

pub enum SupervisorState { Starting, Ready, LostAuthority, Terminal }

pub struct SupervisorLaunchRecord {
    operation_id: String,
    expected_operation_version: String,
    control_epoch: String,
    control_nonce_sha256: String,
    spec: ChildLaunchSpec,
    stdio: StdioProfile,
}

pub struct StdioProfile {
    stdin: StdioEndpointMode,
    stdout: StdioEndpointMode,
    stderr: StdioEndpointMode,
}

pub enum StdioEndpointMode {
    Closed,
    Pipe,
    Pty { terminal_group: String, rows: u16, cols: u16 },
}

pub enum SupervisorCommand {
    LaunchOwned { operation_id: String, expected_operation_version: String },
    Input { operation_id: String, expected_operation_version: String, bytes_b64: String },
    InputEof { operation_id: String, expected_operation_version: String },
    ResizePty { operation_id: String, expected_operation_version: String, terminal_group: String, rows: u16, cols: u16 },
    ForwardSignal { operation_id: String, expected_operation_version: String, signal: OwnedSignal },
    CancelOwned {
        operation_id: String,
        expected_operation_version: String,
        authority: CancellationAuthority,
        request_id: String,
    },
    QueryOwned { operation_id: String, expected_operation_version: String },
}

pub enum ManagedAppServerCommand {
    ReadThread,
    InjectItems { items: ValidatedAppServerInput },
    StartTurn { prompt: ValidatedAppServerInput },
    InterruptOwnedTurn,
    ListDescendants { cursor: Option<String> },
    ListOwnedTerminals { cursor: Option<String> },
    TerminateOwnedTerminal { terminal: OwnedBackgroundTerminalRef },
}

pub enum RpcId { Integer(u64), String(String) } // float, null, negative, and duplicate directional ids refuse

pub struct OwnedBackgroundTerminalRef {
    controller_instance_id: String,
    control_epoch: String,
    operation_id: String,
    operation_version: String,
    process_id: String,
    page_evidence_sha256: String,
    _sealed: appserver::Sealed,
}

pub struct ManagedAppServerRequestEnvelope {
    schema: u8, // exactly 1
    worker_id: String,
    generation: String,
    binding_epoch: String,
    controller_instance_id: String,
    controller_version: String,
    control_epoch: String,
    operation_id: String,
    expected_operation_version: String,
    authorization_id: String,
    expected_authorization_version: String,
    request_sequence: String,
    command: ManagedAppServerCommand,
}

pub struct ManagedCommandAuthorizationRecord {
    authorization_id: String,
    authorization_version: String,
    worker_id: String,
    generation: String,
    binding_epoch: String,
    controller_instance_id: String,
    control_epoch: String,
    operation_id: String,
    operation_version: String,
    command_discriminant: String,
    authority: ManagedCommandAuthority,
    state: ManagedCommandAuthorizationState,
    expires_at: String,
}

pub enum ManagedCommandAuthority {
    Reentry { operation_kind: OperationKind },
    TurnCancellation { custody_version: String, permit_binding_sha256: String },
    Fence { fence_epoch: String, fencing_version: String, proof_attempt_sha256: String },
}

pub enum ManagedCommandAuthorizationState { Issued, Consumed, Refused, Expired }

pub enum ManagedAppServerResult {
    Thread { operation_version: String, thread: ValidatedThreadView },
    Injected { operation_version: String, item_ids: Vec<String> },
    TurnStarted { operation_version: String, turn_id: String },
    TurnInterrupted { operation_version: String, turn_id: String, terminal_status: String },
    DescendantsPage { operation_version: String, threads: Vec<ValidatedThreadView>, next_cursor: Option<String> },
    TerminalsPage { operation_version: String, terminals: Vec<OwnedBackgroundTerminalRef>, next_cursor: Option<String> },
    TerminalTerminated { operation_version: String, terminal: OwnedBackgroundTerminalRef },
    RefusedStale { observed_operation_version: String },
    LostAuthority { operation_version: String, reason: LostAuthorityReason },
}

pub struct ValidatedAppServerInput { items: Vec<serde_json::Value>, _sealed: appserver::Sealed }

pub enum SupervisorHello {
    Health {
        supervisor_instance_id: String,
        supervisor_version: String,
        nonce: String,
    },
    Control {
        supervisor_instance_id: String,
        control_epoch: String,
        operation_id: String,
        expected_operation_version: String,
        control_nonce: String,
    },
    ManagedOperation(ManagedAppServerRequestEnvelope),
}

pub enum SupervisorEvent {
    Started { control_epoch: String, operation_id: String, operation_version: String, process: ProcessObservation },
    ControlBound { control_epoch: String, operation_id: String, operation_version: String },
    Output { control_epoch: String, operation_id: String, operation_version: String, sequence: String, stream: String, bytes_b64: String },
    InputAccepted { control_epoch: String, operation_id: String, operation_version: String, sequence: String, byte_count: u32 },
    PtyResized { control_epoch: String, operation_id: String, operation_version: String, sequence: String, terminal_group: String, rows: u16, cols: u16 },
    Reaped { control_epoch: String, operation_id: String, operation_version: String, exit_status: i32 },
    RefusedStale { control_epoch: String, operation_id: String, observed_operation_version: String },
    LostAuthority { control_epoch: String, operation_id: String, operation_version: String, reason: LostAuthorityReason },
}

pub struct SupervisorHealthPong {
    supervisor_instance_id: String,
    supervisor_version: String,
    challenge_nonce: String,
}

pub struct SupervisorWatchdogRecord {
    watchdog_instance_id: String,
    supervisor_instance_id: String,
    control_epoch: String,
    operation_id: String,
    process: ProcessObservation,
    version: String,
    heartbeat_at: String,
}

pub enum SupervisorStartupPhase {
    WatchdogBootstrap,
    SupervisorBootstrap,
    ListenerBound,
    GlobalQueuesReady,
    AcceptorsReady,
    ControlAuthenticated,
    OperationQueuesReady,
    ChildSpawned,
    ProxyThreadsReady,
    StartedPublished,
}

pub enum ManagedAppServerStartupPhase {
    ManagedPendingCreated,
    AppServerChildSpawned,
    AppServerTransportReady,
    AppServerRequestMapReady,
    AppServerNotificationPumpReady,
    AppServerServerRequestHandlersReady,
    ThreadStarted,
    ClaimFinalized,
    ControllerReadyPersisted,
}

pub struct ChildCancellationPermit {
    supervisor_instance_id: String,
    operation_id: String,
    operation_version: String,
    authority: CancellationAuthority,
    child_slot: u64,
    _sealed: supervisor::Sealed,
}
```

Managed Codex birth is not a session re-entry and cannot fabricate a `ReentryGuard` before `thread/start` returns an id. In the same store transaction that creates the exact `Attaching` pending worker and versioned birth operation, `mint_managed_birth_permit` privately seals the tuple `{worker_id,generation,worker_version,tool,canonical_cwd,birth_operation_id,birth_operation_version}`. `run_managed_codex_with_permit` re-resolves that tuple immediately before supervisor launch and atomically consumes the permit once; wrong state/version/tool/cwd, replay, expiry, or launch after any worker transition emits zero child/app-server bytes. The supervisor launch record carries only the exact consumed birth operation/version and may progress only through the managed startup phases. A `ManagedBirthPermit` cannot authorize any existing-session drain, controller command, signal, fence, or second child, and no public constructor or deserializable wire representation exists.

Before a later process can construct the wire envelope, the matching in-process sealed capability mints exactly one random `ManagedCommandAuthorizationRecord` in the store. The wire carries only its id/version. The supervisor atomically re-resolves and consumes the exact `Issued` record before emitting any app-server byte; a replay, wrong command discriminant, wrong controller/operation/version, expired record, or cross-family substitution writes only `Refused` and emits zero bytes. The existing `OperationKind::InitialTurn` remains distinct and is retained only for the legacy **unmanaged** app-server `spawn::run_appserver_pump → SpawnedThread::start_initial_turn_with_guard/pump_with_guard` chain under `ReentryGuard<AppServerThread>`; Step 3d's `unmanaged_initial_turn` behavior row proves success/wrong-kind/stale/pre-fence/mid-block-fence with zero unauthorized RPC bytes. Managed birth uses only `ManagedBirthPermit`, and after Active every managed initial or later `turn/start` uses `ControllerStartTurn`. The closed family matrix is:

| Command | Required persisted authority |
|---|---|
| `ReadThread` | `Reentry { operation_kind: ControllerRead }`; result is snapshot-only and cannot guide a later mutation after that operation goes stale. |
| `InjectItems` | `Reentry { operation_kind: ControllerInjectItems }` for the same binding/controller. |
| `StartTurn` | `Reentry { operation_kind: ControllerStartTurn }` for the same binding/controller. |
| `InterruptOwnedTurn` | Exact `TurnCancellation` for the operation's persisted owned turn, or exact current `Fence` whose action set includes interrupt. |
| `ListDescendants` / `ListOwnedTerminals` | Exact current `Fence` and proof attempt; pages and refs inherit that attempt binding. |
| `TerminateOwnedTerminal` | Exact current `Fence` plus same-attempt `OwnedBackgroundTerminalRef`; no Active re-entry authorization can terminate. |

`OperationKind`, capability constructor, command discriminant, and allowed result are source-derived into the re-entry inventory. A JSON command variant, same-UID socket access, or sealed target ref alone is never authority.

`ChildLaunchSpec`, `AttachOptions`, `ValidatedModel`, `ValidatedEffort`, and `DoorbellMessage` are closed types constructed by parsers with explicit length/value bounds. They contain no `OsString`, executable path, cwd, session/worker/thread id, arbitrary flag list, environment map, fd, or authority-selector field. `run_child_with_guard` matches `(guard.allowed, spec.variant)`. `AttachResume` derives each endpoint from the caller via `isatty` plus fstat dev/inode grouping; `WakeDoorbell` and `WatchWakeFallback` explicitly use `{stdin: Closed, stdout: Pipe, stderr: Pipe}` to preserve checkpoint behavior. It writes a version-bound `SupervisorLaunchRecord` and sends only operation id/version to the supervisor. The supervisor re-resolves the record, derives program/session/cwd/generation/environment internally, builds env from an allowlist, maps `Closed` to null/closed input, creates pipes for `Pipe`, and creates PTY controller/slave pairs for terminal groups. It spawns the child itself as PTY session/foreground owner where applicable and owns the unreaped `Child` from birth. No `Child` or caller fd is transferred between processes and no public/internal target-taking mutator remains.

The supervisor is the hidden detached `relay __lifecycle-supervisor` process. The separately detached watchdog starts first and spawns/owns the supervisor `Child`; both use real new sessions, no parent-death signal, and closed/independent stdio. On pinned Rust 1.85, `CommandExt::process_group(0)` is insufficient and stable `CommandExt::setsid` is unavailable; use the minimal async-signal-safe `pre_exec` wrapper around `libc::setsid()` and propagate failure from spawn. Acceptance proves watchdog SID=watchdog PID and supervisor SID=supervisor PID, both differ from the caller, and caller exit or caller-process-group SIGHUP leaves watchdog custody live.

The supervisor owns a mode-0600 Unix socket and validates same-UID peer credentials (`SO_PEERCRED` on Linux, `getpeereid` on Darwin), exact socket dev/inode, supervisor instance/version, stable `control_epoch`, mutable operation/version, and current Claim/Fence authority from the store; caller-supplied command fields are selectors, never authority. Bootstrap uses two explicit one-shot pipe pairs as the sole temporary inherited-fd exception. The caller spawns the watchdog with a caller↔watchdog bootstrap pair. The watchdog generates the random `control_epoch` and 256-bit nonce, persists only `control_nonce_sha256`, creates a watchdog→supervisor nonce pipe, spawns the supervisor, writes/closes the supervisor nonce pipe, writes the raw nonce to the caller response pipe, then closes both bootstrap pairs. The supervisor reads/closes its nonce fd before listener setup; the caller reads/closes its response fd. All bootstrap fds are `CLOEXEC` except the one endpoint deliberately inherited by its immediate child, never enter argv/environment/log/event/store, and must be absent from caller/watchdog/supervisor before `Ready`; caller death at any boundary leads to the numeric control-bind deadline and bounded cleanup, never leaked authority. The first socket frame is mandatory `SupervisorHello`: `Health` receives `SupervisorHealthPong` echoing its one-use challenge nonce, which is liveness-only and never command authority; exactly one matching CLI-child `Control { control_epoch, control_nonce }` stream binds, receives `ControlBound` without echoing the secret, and only that stream's EOF can publish that CLI operation's cancellation. `ManagedOperation` is a distinct one-request role for a later process: it carries the full closed envelope, never the control nonce or raw pending token, exact-validates worker/generation/binding/controller/control/operation/request sequence before any app-server byte, returns exactly one `ManagedAppServerResult`, and disconnects without changing durable controller custody. Each later command independently validates mutable `expected_operation_version`. A second, stale, replayed, sequence-skipping, or role-confused stream is refused with zero app-server bytes.

Portable CLI-child startup phases are the closed `SupervisorStartupPhase` enum; managed Codex adds the separate closed `ManagedAppServerStartupPhase` in Step 5. Global `Ready` means listener/socket identity, watchdog record, acceptors, global bounded queues, and zero bootstrap fds are durably live. Per-operation `ControlBound` means the authenticated control reader and all per-operation queues exist. Only then may the supervisor spawn a CLI child; after child creation every required pipe/PTY thread must start before `Started` or any output byte. Managed Codex may emit no app-server request until its request map, notification pump, and complete server-request handlers are ready; it may emit no `turn/start` before ClaimFinalized and ControllerReadyPersisted. Any failure at a source-derived phase kills/waits/reaps any created child and applies the phase-appropriate pre-binding or `LostAuthority(ProxyStartupFailed)` transition. CI derives phase names from production transitions and fails if a phase lacks before/after failure injection. `Input` carries exact bytes (max 64 KiB/frame), `InputEof` closes only child stdin, `ResizePty` is bounded to 1..4096 rows/cols and the named PTY group, and `ForwardSignal` accepts only SIGINT/SIGTERM/SIGHUP. Output frames preserve exact per-stream bytes and carry the control epoch, current operation version, and monotonic sequence; PTY endpoints preserve `isatty`, controlling terminal, foreground group, Ctrl-C, and resize behavior. Each direction has a 1 MiB bounded queue. A slow connected caller applies child-visible pipe/PTY backpressure as before, while cancellation/control polling runs independently at ≤100 ms.

There is no silent reattach policy for an interactive CLI-child Control stream. Its EOF/disconnect exact-CASes that operation to cancellation using current authority, drops caller-bound output, drains/discards child output, and asks the supervisor to kill/wait/reap within grace. `ManagedCodexAppServer` has no caller Control lease: after `ControllerReadyPersisted`, the initiating caller receives a versioned durable-handoff result and may exit; death before that point follows the pre-binding loss/deadline row, while EOF afterward does not cancel the server. Short-lived later relay invocations authenticate, admit a sealed lifecycle operation, send one `ManagedOperation` envelope, receive one result, and disconnect without canceling custody. Arbitrary JSON/target forwarding is impossible; terminal termination consumes only a sealed same-controller/page/operation `OwnedBackgroundTerminalRef`. `CancelOwned` is accepted only after the supervisor privately constructs `ChildCancellationPermit`; `kill_wait_owned_child(&mut ChildCancellationPermit)` re-resolves exact authority before signal, then kill/waits/reaps its own slot. A stale request reports `RefusedStale` and emits zero bytes. The supervisor remains alive until every owned CLI/app-server child is reaped or exact lifecycle abandonment records loss.

Supervisor startup/crash recovery is explicit. The watchdog records its generation-bound identity and control epoch, waits/reaps the supervisor, and on exit exact-CASes every matching unresolved operation to `LostAuthority(SupervisorLost)` plus the state-specific lifecycle transition within `managed_cancel_grace_ms`. Health checks are mandatory only for sessions whose records assert matching supervisor custody; ordinary unmanaged sessions without a supervisor retain compatibility. Every custody-bearing admission, claim, fence drain, status, and reconcile performs a ≤100 ms `Health` challenge plus supervisor/watchdog generation, control epoch, and heartbeat check before mutation; health EOF never changes custody. Missing supervisor/watchdog records while any nonterminal `ChildStarting|ChildOwned|ChildCancelRequested|LostAuthority` operation exists are fail-closed: exact-CAS loss where authority still matches and refuse the mutation. If the watchdog dies first, the next such check applies `SupervisorLost`; it never reconstructs/adopts the supervisor or worker Child. Tests cover caller exit and process-group SIGHUP, supervisor death with no connected caller (watchdog publishes within 5s), watchdog-then-supervisor death (first re-entry refuses/CASes), health-first/control-first connection order, stale replacement instances, every startup phase failure, and stale control-epoch/version races. `QueryOwned` is snapshot-only, checks expected version, and returns control epoch+observed operation version; it cannot guide later mutation without new authorization. The supervisor is also the later Step-4 cgroup manager; Step 3b adds portable owned-child custody, bidirectional stdio/PTY IPC, exact cancellation, watchdog, and reap proof, while pidfd/cgroup authority remains Step 4.

Managed app-server controller recovery is separately exact. `server_fingerprint` is SHA-256 of JCS over `{schema:1,supervisor_instance_id,control_epoch,controller_instance_id,owned_child_slot,process_generation,initialized_codex_version,executable_identity_sha256,stdio_transport_instance_id}`. JSON-RPC ids are `RpcId::Integer(u64)|String(String)` and are keyed by direction+method+id; float/null/negative ids and numeric/string collisions refuse. Immediately before any request bytes, the controller exact-CASes custody `Prepared→RequestSentUnknown`; after the matching typed response it exact-CASes to the command-specific result with the same operation/controller/sequence. A write/response ambiguity remains sent-unknown and applies typed custody loss at the fixed deadline—never retries or guesses.

The committed `appserver-server-requests.json` is recursively closed: `{schema:1,codex_version,targets:[{target,executable_sha256}],generator_argv:[string],schema_bundle_sha256,methods:[{method,params_schema_sha256,response_schema_sha256,policy,response_template_sha256}]}`. Targets and methods are UTF-8 byte-sorted and unique; policy is `decline|cancel|unsupported_loss`; no extra key/result exists. Its canonical `generator_argv` is exactly `["codex","app-server","generate-json-schema","--experimental","--out","<OUT>"]`; raw temporary paths are execution-only and never enter committed bytes. Generation fixes `umask 077`, normalizes every recorded file/dir mode to the closed expected mode table, rejects links/special files, sorts relative UTF-8 paths bytewise, excludes mtimes/inodes/temp-root names, and proves two distinct sentinel temp roots produce byte-identical candidate bytes and manifest hash.

`node plugins/session-relay/test/appserver-schema-contract.mjs --regenerate --codex <invoked-native-codex-path> --out <sentinel-temp>` records the invoked path and an ephemeral canonical-resolution receipt. It resolves the bounded symlink chain with `readlinkat` relative to pinned parent dirfds, recording each link identity/target, then opens the canonical parent dirfd and **final canonical component** `O_RDONLY|O_NOFOLLOW|O_CLOEXEC`; non-native/script/loop/owner-mode-invalid chains refuse. This permits the current `command -v codex` symlink while preventing a final-component follow race. The same retained fd is fstat/hashed and invokes the production Rust fd-exec helper for exact argv `codex app-server generate-json-schema --experimental --out <raw-temp>/schema`; no later pathname lookup may choose either generator or server bytes. The harness installs deterministic barriers that retarget any invoked-chain symlink and atomically replace the canonical pathname before/after final open: validation must fail or produce one internally consistent receipt, and after open it must execute/hash the retained original fd, never describe or execute the replacement. `--verify-current --codex <invoked-native-codex-path>` regenerates twice in distinct sentinel-bearing temp directories, byte-compares version/target/executable/schema/method/response-template hashes, separately asserts the invoked+canonical resolution receipts, and cleans only its temps. It never edits the fixture or embeds host-specific absolute paths in it. Step 5's supervisor runs the same production fd-exec generator from the retained executable fd before managed server spawn, retains that exact fd for actual app-server launch, and refuses before pending creation/Active when any identity or schema hash differs.

For the currently researched contract the methods are `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/tool/requestUserInput`, `mcpServer/elicitation/request`, `item/permissions/requestApproval`, `item/tool/call`, `account/chatgptAuthTokens/refresh`, `attestation/generate`, `currentTime/read`, and legacy `applyPatchApproval`/`execCommandApproval`. The managed controller advertises no interactive/dynamic/auth-refresh/attestation/current-time capability. Approval/permission/legacy rows use exact hashed schema-valid decline/cancel templates; MCP elicitation uses its real `cancel` variant. `ToolRequestUserInputResponse` has no cancel variant in 0.144.1, so `item/tool/requestUserInput` is `unsupported_loss`: send the fixture's exact JSON-RPC error `{code:-32601,message:"unsupported managed controller request: item/tool/requestUserInput"}` for the same typed `RpcId`, then atomically mark matching in-flight operations `LostAuthority(CustodyLost)`. Dynamic tool/auth refresh/attestation/current-time and any unknown method follow the same method-specific hashed error+loss policy. Never emit `{answers:{}}` as an invented cancellation, accept command/file/permission, fabricate input, supply tokens/attestation, or hang. A Codex version, target executable digest, generated schema, method set, or response/error template that differs is `unavailable` until the fixture and policy are re-reviewed.

Controller-pump exit while the supervisor remains live, app-server stdio EOF, malformed/ambiguous response, request-map corruption, or an unsupported/unhandled/unknown server request first atomically batch-marks every matching in-flight operation `LostAuthority(CustodyLost)`, applies the closed post-loss lifecycle transition, persists `LossCleanupRecord::Pending`, and returns the exact sealed `LossCleanupPermit` in that transaction. The still-live supervisor immediately consumes that permit through `perform_loss_cleanup`; it never attempts to mint a normal `SupervisorFencePermit` after leaving Fencing. Cleanup closes app-server stdin/stdout/stderr, emits no further application bytes, kills the retained cgroup/owned child, and bounded-waits for exact reap plus `populated 0`. Physical cleanup never upgrades or clears the logical failure: custody and lifecycle remain `FencingUnconfirmed`, the outcome cannot construct WorkerTree proof or release capacity, and only a later new-epoch reconcile may attempt ordinary proof. If supervisor/cgroup authority is already lost, the batch loss persists without a permit and cleanup remains unconfirmed; it never reconnects, swaps in a new transport, or guesses a response. A later relay process can wake an idle Active worker only through the same controller instance/control epoch and typed admitted command; a stale controller/socket/sequence emits zero app-server bytes. Tests keep the original launcher dead, then use a second relay process for read/inject/start/interrupt; separately kill only the controller pump, only the app-server child, and only the initiating caller, and exercise concurrent numeric/string request ids, cross-thread terminal substitution, every source-derived server-request policy, unknown methods, atomic permit mint, post-publication permit use, replay/stale/cross-loss zero-byte refusal, no-remint crash recovery, no-capacity-release success, and cleanup completion/failure inside `managed_cancel_grace_ms`.

`ProcessObservation` is the immutable observation record defined in the next section; Step 3b introduces that data shape in `supervisor.rs` for child identity/status only. Step 4 adds pidfd/cgroup `SignalHandle` constructors and authoritative process actions. An observation alone never authorizes signaling.

A guard admitted for unmanaged A cannot name managed B; a guard for `CliInboxDrain` cannot start a turn; and a guard from binding epoch N fails after Claiming increments to N+1. Queue, peek, registry reads, and pure observation may remain allowed.

The committed source-derived inventory maps every drain, generic outbound app-server mutation primitive plus all callers, process creation/exec/signal, and pending acknowledgement callsite to a concrete `ReentryGuard`, `TurnCancellationPermit`, or `FencePermit` API and an executed unique behavior-test id. `FenceControl` is not a manifest-only exception and `UnmanagedOnly` is not a bypass: unmanaged mutations still require a bound `ReentryGuard`. Only pure `ReadOnly` observations may lack a capability. CI fails on any unmapped/stale callsite, rationale-only mutating class, name-only classification, or matrix row that does not invoke its production wrapper.

Every admitted external operation has a cancellation contract: WebSocket/socket reads and supervisor event waits use individual timeouts no greater than `managed_cancel_poll_ms`; settle sleep is interruptible; turn pumps persist `TurnStartSentUnknown` before the send, persist the exact returned `turn.id` before pumping, and interrupt only that owned exact turn on cancellation; wake/attach/resume ask the detached supervisor to spawn/own the child from birth, poll cancel, then request exact-authority kill/wait/reap; watch fallback does the same. A single monotonic `managed_cancel_grace_ms` deadline covers the guard-owned cancellation/handoff attempt and cannot be reset by retries. **Every attach or resume whose session binding can ever transition uses supervisor-owned spawn+event-wait even when admission returns `Unmanaged`; no lifecycle-sensitive path calls `CommandExt::exec`.**

The live guard may construct a sealed `TurnCancellationPermit` only for its own persisted `TurnKnown` custody and only after exact re-resolution of the current `UnmanagedCanceling`, Claiming, or Fencing authority. It derives server/thread/turn from the operation record, permits exactly one `turn/interrupt`, and waits for the matching turn's terminal status. It cannot re-enter, start, inject, terminate terminals, signal processes, select another target, or substitute for `FencePermit`. BeforeSend failure exact-CASes `TurnNotSent`; a lost/delayed/malformed response after send remains `TurnStartSentUnknown` until the fixed deadline, then closes the connection and becomes `LostAuthority`—never latest-turn guessing. On matching turn terminal or supervisor child-reap event the guard resolves custody and releases. Otherwise, before grace expiry it exact-CASes a known-turn or `ChildCancelRequested` handoff to the same unmanaged/claim/fence authority; unknown/lost authority exact-CASes the corresponding UnmanagedCanceling evidence or managed `FencingUnconfirmed`. The supervisor continues owning and reaping the child after caller/guard release. No thread-local custodian or reconstructable PID is treated as live authority.

The relay caller retains the binding guard until the external CLI exits, supervisor reap completes, or exact custody handoff is durable. Claiming cannot publish Active while any unresolved operation or handoff remains; its one final CAS publishes Managed/Fencing with a new fence epoch/version and atomically rebinds each exact Claim handoff to that Fence authority, or publishes FencingUnconfirmed if the handoff cannot be rebound. Plain attach prints no copyable command for a transition-capable session and routes through this guarded supervisor path. `exec` is allowed only for a statically separate command with no session binding and no route to managed claim—not for any attach/resume.

### 3. Stable signal handles and containment proof

```rust
pub enum SignalHandle {
    LinuxPidFd { fd: OwnedFd, expected: ProcessObservation },
    SupervisorOwnedChild {
        supervisor_instance_id: String,
        operation_id: String,
        operation_version: String,
        expected: ProcessObservation,
        _sealed: supervisor::Sealed,
    },
    SupervisorConfinedCgroup {
        supervisor_instance_id: String,
        boundary: CgroupBoundary,
        _sealed: supervisor::Sealed,
    },
    ObservationOnly(ProcessObservation),
}

pub enum SupervisorFenceCommand {
    SignalOwned {
        operation_id: String,
        expected_operation_version: String,
        fence_epoch: String,
        fencing_version: String,
        signal: OwnedSignal,
    },
    FenceConfinedCgroup {
        worker_id: String,
        generation: String,
        fence_epoch: String,
        fencing_version: String,
        action: CgroupFenceAction,
    },
}

pub struct SupervisorFencePermit {
    supervisor_instance_id: String,
    worker_id: String,
    generation: String,
    fence_epoch: String,
    fencing_version: String,
    handle_slot: u64,
    _sealed: supervisor::Sealed,
}

pub struct LossCleanupRecord {
    cleanup_id: String,
    cleanup_version: String,
    worker_id: String,
    generation: String,
    fence_epoch: String,
    post_loss_fencing_version: String,
    supervisor_instance_id: String,
    control_epoch: String,
    loss_batch_sha256: String,
    host_boot_id: String,
    created_boottime_ns: String,
    deadline_boottime_ns: String,
    state: LossCleanupState,
}

pub enum LossCleanupState {
    Pending,
    Running {
        cleanup_attempt_id: String,
        started_boottime_ns: String,
    },
    Completed { evidence_sha256: String },
    Failed { reason: LossCleanupFailureReason, evidence_sha256: String },
}

pub enum LossCleanupFailureReason {
    PendingPermitExpired,
    RunningDeadlineOutcomeUnknown,
    SupervisorLost,
    HostBootChanged,
    CleanupFailed,
}

pub struct LossCleanupPermit {
    cleanup_id: String,
    cleanup_version: String,
    worker_id: String,
    generation: String,
    fence_epoch: String,
    post_loss_fencing_version: String,
    supervisor_instance_id: String,
    control_epoch: String,
    loss_batch_sha256: String,
    host_boot_id: String,
    deadline_boottime_ns: String,
    cleanup_handle_slot: u64, // private composite: app-server stdio + owned child + optional cgroup fd
    consumed: bool,
    _sealed: supervisor::Sealed,
}

pub struct LossCleanupOutcome {
    cleanup_id: String,
    cleanup_version: String,
    closed_all_stdio: bool,
    child_reaped: bool,
    cgroup_populated_zero: bool,
    evidence_sha256: String,
}

pub fn perform_loss_cleanup(permit: LossCleanupPermit) -> Result<LossCleanupOutcome, String>;

pub struct ProcessObservation {
    pub pid: u32,
    pub pgid: Option<i32>,
    pub start: StartGeneration,
}

pub struct PartialDelegatedRunnerReceipt {
    schema: u8, // exactly 1; phase exactly "exec-stop"
    phase: String,
    runner_id: String,
    capability_id: String,
    host_boot_id: String,
    kernel_release: String,
    uid: u32,
    observed_at: String,
    expires_at: String,
    started_boottime_ns: u64,
    expires_boottime_ns: u64,
    yama_ptrace_scope: String,
    ptrace_policy_sha256: String,
    exec_stop_results: Vec<RunnerExecStopResult>,
    evidence_sha256: String,
    receipt_sha256: String, // JCS SHA-256 of every preceding field
}

pub struct DelegatedRunnerReceipt {
    schema: u8, // exactly 1; recursively closed JSON representation
    partial_receipt_sha256: String,
    runner_id: String,
    capability_id: String, // public correlation id; never authority by itself
    host_boot_id: String,
    kernel_release: String,
    uid: u32,
    observed_at: String,
    expires_at: String,
    started_boottime_ns: u64,
    expires_boottime_ns: u64,
    cgroup_mount_id: u64,
    cgroup_mount_dev: u64,
    cgroup_mount_ino: u64,
    canonical_root: String,
    root_dev: u64,
    root_ino: u64,
    root_owner_uid: u32,
    root_mode: u32,
    yama_ptrace_scope: String,
    ptrace_policy_sha256: String,
    exec_stop_results: Vec<RunnerExecStopResult>, // exact Claude+Codex rows, runtime-byte sorted
    probe_child: RunnerProbeChildReceipt,
    populated_zero: bool,
    leaf_removed: bool,
    evidence_sha256: String,
    receipt_sha256: String, // JCS SHA-256 of every preceding field; integrity only
}

pub enum RunnerCapabilityGate { A1c, A1d, A5, A5b, A6, A7 }
pub const RUNNER_BOOTSTRAP_INPUT_SHA256: &str =
    "0000000000000000000000000000000000000000000000000000000000000000";

pub enum GateEnvSource { LiteralOne, RunnerId, RunnerReceipt, CgroupRoot }

pub struct GateEnvBinding {
    name: String, // exact gate-row allowlist; UTF-8 byte-sorted and unique
    source: GateEnvSource,
}

pub struct RunGate {
    schema: u8, // exactly 1; recursively closed JCS
    gate: RunnerCapabilityGate,
    node_script: String, // exact fixed repo-relative path for gate
    args: Vec<String>,   // exact fixed Node args; no argv[0], shell, or assignments
    env: Vec<GateEnvBinding>, // exact fixed row; only literal base/sealed-auth names may be added
}

pub struct RunnerBinaryIdentity {
    schema: u8,
    dev: u64,
    ino: u64,
    size: u64,
    mode: u32,
    sha256: String,
    source_head: String,
    cargo_toml_sha256: String,
    cargo_lock_sha256: String,
}

pub struct RunnerRootIdentity {
    schema: u8,
    purpose: String,
    token: String, // 64 lowercase hex chars from 32 random bytes
    canonical_path: String,
    uid: u32,
    dev: u64,
    ino: u64,
    mode: u32, // exactly 0700
}

pub struct RunnerStateIdentity {
    schema: u8,
    binary_identity_sha256: String,
    build_root: RunnerRootIdentity,
    matrix_root: RunnerRootIdentity,
    live_root: RunnerRootIdentity,
    receipt_root: RunnerRootIdentity,
    step_receipt_root_sha256: String,
    matrix_cleanup_sha256: String,
    live_cleanup_sha256: String,
    state_receipt_sha256: String,
}

pub struct DriverArm {
    schema: u8,
    capability_id: String,
    sequence: u64,
    gate: RunnerCapabilityGate,
    gate_pid: u32,
    run_gate_sha256: String,
    live_tuple_sha256: String,
    input_receipt_sha256: String,
    self_identity_sha256: String,
    go_channel_sha256: String,
    result_channel_sha256: String,
}

pub struct DriverArmChallenge { arm: DriverArm, challenge: [u8; 32] }
pub struct DriverArmResponse { arm: DriverArm, challenge_sha256: String }
pub struct DriverArmAck { arm: DriverArm, arm_ack_sha256: String }
pub struct GateGo {
    schema: u8,
    arm_ack_sha256: String,
    gate_pid: u32,
    sequence: u64,
    gate: RunnerCapabilityGate,
}

pub struct GateResult {
    schema: u8,
    gate: RunnerCapabilityGate,
    sequence: u64,
    pid: u32, // exact driver-spawn/native-gate/OPEN/COMMIT/wait PID
    status: i32,
    input_receipt_sha256: String,
    result_receipt_sha256: String,
    open_ack_sha256: String,
    commit_ack_sha256: String,
    evidence_sha256: String,
}

pub enum RunnerCapabilityState {
    Idle { next_sequence: u64 },
    DriverArmed { arm: DriverArm, arm_ack_sha256: String },
    OpenReserved {
        selectors: RunnerGateOpenSelectors,
        open_ack_sha256: String,
    },
    CommitReserved {
        selectors: RunnerGateCommitSelectors,
        commit_ack_sha256: String,
    },
    CommittedAwaitingReap {
        commit_ack_sha256: String,
        gate_exit_sha256: String,
    },
    Poisoned { sequence: u64, reason: String },
    Complete { final_commit_ack_sha256: String },
}

pub struct RunnerGateOpenSelectors {
    schema: u8, // exactly 1
    capability_id: String,
    sequence: u64, // exactly 1..=6 in enum order
    gate: RunnerCapabilityGate,
    gate_pid: u32,
    driver_arm_ack_sha256: String,
    self_identity_sha256: String,
    live_tuple_sha256: String, // fresh boot/kernel/uid/mount/root/runtime tuple
    input_receipt_sha256: String, // A1c: 64-zero bootstrap sentinel; later: prior receipt hash
}

pub struct RunnerGateOpenChallenge {
    selectors: RunnerGateOpenSelectors,
    challenge: [u8; 32], // fd-only, one-use, never persisted raw
}

pub struct RunnerGateOpenResponse {
    selectors: RunnerGateOpenSelectors,
    challenge_sha256: String,
}

pub struct RunnerGateOpenAck {
    selectors: RunnerGateOpenSelectors,
    open_ack_sha256: String,
}

pub struct RunnerGateCommitSelectors {
    open: RunnerGateOpenSelectors,
    open_ack_sha256: String,
    result_receipt_sha256: String,
    evidence_sha256: String,
}

pub struct RunnerGateCommitChallenge {
    selectors: RunnerGateCommitSelectors,
    challenge: [u8; 32],
}

pub struct RunnerGateCommitResponse {
    selectors: RunnerGateCommitSelectors,
    challenge_sha256: String,
}

pub struct RunnerGateCommitAck {
    selectors: RunnerGateCommitSelectors,
    commit_ack_sha256: String, // binds work; sequence advances only after DriverReapAck
}

pub struct PayloadResult {
    schema: u8,
    gate: RunnerCapabilityGate,
    result_receipt_sha256: String,
    evidence_sha256: String,
}

pub struct GateExitRecord {
    schema: u8,
    gate: RunnerCapabilityGate,
    sequence: u64,
    pid: u32,
    payload_result_sha256: String,
    input_receipt_sha256: String,
    result_receipt_sha256: String,
    evidence_sha256: String,
    open_ack_sha256: String,
    commit_ack_sha256: String,
}

pub struct DriverReap { arm_ack_sha256: String, gate_exit: GateExitRecord, status: i32 }
pub struct DriverReapAck { driver_reap_sha256: String, next_sequence: u64 }

pub struct RunnerExecStopResult {
    runtime: String,
    runtime_version: String,
    invoked_path_sha256: String,
    canonical_path_sha256: String,
    executable_dev: u64,
    executable_ino: u64,
    executable_size: u64,
    executable_sha256: String,
    tracee_pid: u32,
    ptrace_event: u32, // exactly PTRACE_EVENT_EXEC
    proc_exe_fd_identity_sha256: String,
    retained_fd_identity_sha256: String,
    target_sentinel_absent_before_detach: bool,
    detached_and_terminal_sentinel: bool,
}

pub struct RunnerProbeChildReceipt {
    pid: u32,
    start: StartGeneration,
    stopped_before_move: bool,
    leaf_membership_sha256: String,
    cgroup_kill_write_sha256: String,
    wait_status: i32,
    waitpid_reaped: bool,
    reaped_at: String,
}

pub enum StartGeneration {
    LinuxProcStartTicks(u64),
    DarwinBsdStartTime { sec: i64, usec: i64 },
    Unavailable,
}

pub struct CgroupBoundary {
    worker_id: String,
    generation: String,
    mount_id: u64,
    manager_root_dev: u64,
    manager_root_ino: u64,
    worker_dir_dev: u64,
    worker_dir_ino: u64,
    worker_dir_owner_uid: u32,
    worker_dir_mode: u32,
    relative_path: String,
    generation_component: String,
    placement: CgroupPlacementReceipt,
    filtered_hardening: Option<FilteredCgroupHardeningReceipt>,
    _sealed: supervisor::Sealed,
}

pub enum GatedPlacementMode {
    Clone3IntoCgroup, // clone3(CLONE_INTO_CGROUP): runtime is born directly in the leaf
    PreExecStopGo,    // pre-exec stop/GO: manager moves+verifies before any runtime code runs
}

// Setup-time evidence only. It exists before GO and contains no post-kill claim.
pub struct CgroupPlacementReceipt {
    worker_id: String,
    generation: String,
    supervisor_instance_id: String,
    control_epoch: String,
    runtime: String,
    runtime_version: String,
    runtime_executable_path: PathBuf,
    runtime_executable_dev: u64,
    runtime_executable_ino: u64,
    runtime_executable_size: u64,
    runtime_executable_sha256: String,
    runtime_executable_fd_identity_sha256: String,
    child_kernel_executable_identity_sha256: String,
    target_triple: String,
    sandbox_version: String,
    host_boot_id: String,
    kernel_release: String,
    gated_placement: GatedPlacementMode,
    no_runtime_code_before_membership: bool,
    leaf_membership_verified: bool,
    cgroup_type_domain: bool,
    subtree_control_empty: bool,
    cgroup_kill_writable: bool,
    setup_transcript_sha256: String,
    _sealed: supervisor::Sealed,
}

// Terminal action evidence. Only the live matching supervisor constructs it after kill.
pub struct CgroupKillReceipt {
    worker_id: String,
    generation: String,
    fence_epoch: String,
    fencing_version: String,
    placement_receipt_sha256: String,
    host_boot_id: String,
    kernel_release: String,
    kill_write_evidence_sha256: String,
    populated_zero: bool,
    no_surviving_host_pid_under_leaf: bool,
    optional_freeze_observation: Option<String>,
    terminal_evidence_sha256: String,
    _sealed: supervisor::Sealed,
}

// OPTIONAL Claude-only defense-in-depth. Failure disables ONLY this layer, never the
// cooperative WorkerTree. Codex is expected to lack this (bwrap needs the denied syscalls).
pub struct FilteredCgroupHardeningReceipt {
    cgroup_namespace_ino: u64,
    moved_before_cgroup_unshare: bool,
    cgroup_root_is_worker_leaf: bool,
    new_user_mount_pid_cgroup_namespaces: bool,
    fresh_proc_mount: bool,
    inherited_proc_mounts_detached: u32,
    proc_pid_fd_authority_denied: bool,
    single_read_only_cgroup2_mount: bool,
    inherited_control_fds: u32,
    no_new_privs: bool,
    seccomp_audit_arch: u32,
    x32_syscalls_rejected: bool,
    clone3_denied_wholesale: bool,
    clone3_denial_action: u32,
    clone3_denial_errno: i32,
    ordinary_spawn_probe_sha256: String,
    namespace_mount_seccomp_sha256: String,
    pre_go_escape_probe_sha256: String,
    _sealed: supervisor::Sealed,
}
```

`ProcessIdentityRecord` is durable observation/recovery input. `SignalHandle` is live sealed authority: pidfd is local; supervisor variants are usable only through the matching live supervisor instance, which retains the actual Child/cgroup fd. Step 4 extends the closed supervisor protocol with `SupervisorFenceCommand`; immediately before an ordinary fence action the supervisor re-resolves exact operation plus current Fencing generation/epoch/version and privately mints `SupervisorFencePermit`. Post-loss cleanup never uses this constructor; it uses only the transaction-returned `LossCleanupPermit` against the exact post-loss `FencingUnconfirmed` version. Stale commands emit zero signal/state bytes. Linux pidfd recovery order is **open pidfd first, then read/compare the generation while the fd pins the task**, then signal via pidfd. If pidfd open fails or the pinned observation mismatches, do not raw-signal. `PidFdExitProof` additionally requires a sealed whole-process exit receipt from pidfd `POLLIN` (or `waitid(P_PIDFD)` where the supervisor also owns the child); identity alone is never exit proof. On Darwin and Linux without pidfd, recovery produces `ObservationOnly` and returns unconfirmed. A live supervisor may safely act through its unreaped `Child` only when its instance id and operation version match; once reaped/restarted, that authority is gone. `killpg` is permitted only inside the supervisor while its unreaped owned group leader prevents PGID reuse, and it proves group scope only—not escaped descendants or WorkerTree.

Managed launch uses `__managed-child-exec` with this executable cgroup setup contract (mandatory cooperative steps + optional Claude-only `FilteredCgroupHardening`):

1. **Preflight or fail closed (cooperative = mandatory; filter = optional Claude-only).** For the **cooperative** tier (both runtimes) require Linux cgroup v2, a newly created **`domain`** worker leaf with empty `cgroup.subtree_control` and writable `cgroup.kill`, a writable delegation permitting create/move at both destination and common ancestor, and at least one independently proven gated-placement capability. Classify direct `CLONE_INTO_CGROUP` failure exactly: `EACCES` means placement/delegation restrictions failed; `EBUSY` means a domain controller is enabled in the target; `EOPNOTSUPP` means domain-invalid; `ENOSYS` means the syscall path is unavailable. `EINVAL` means unsupported `CLONE_INTO_CGROUP` only when a same-binary control proves the `clone_args` size/base clone3 call valid and a disposable-leaf probe reproduces failure with the exact otherwise-valid flag/fd; malformed size/flags/fd remain implementation errors and STOP. Do not generic-retry clone3; use stop/GO only if its own capability probe already passed. If neither path is available, record `ObservationOnly`/`Unconfirmed` and never label the backend `ConfinedCgroupCooperative`. The **`FilteredCgroupHardening`** add-on additionally requires cgroup+mount+PID namespaces, either current-user-namespace `CAP_SYS_ADMIN` or enabled unprivileged user namespaces with uid/gid mapping, fresh proc mounting, `no_new_privs`, and seccomp filtering; if any of these fail, record `filtered_hardening: None` — this never reduces the cooperative WorkerTree.
2. **Create and retain manager authority.** Derive `<manager-root>` from the active cgroup2 mount plus this process's exact unified `0::` membership row; an optional `RELAY_CGROUP_ROOT` override is accepted only after the same mount-id/dev/inode/common-ancestor and delegation validation. Require create/move permission at destination and common ancestor before launch. The manager creates `<manager-root>/<worker_id>-<generation>/`, opens the exact directory `O_PATH|O_DIRECTORY|O_CLOEXEC`, records mount/dev/inode/uid/mode/path/generation, and keeps that fd private. All `cgroup.procs`, optional `cgroup.freeze`, `cgroup.kill`, `cgroup.subtree_control`, and `cgroup.events` access uses `openat` from this fd; no later path lookup is signaling authority.
3. **Pin executable bytes, gate placement, and stop at successful exec before target code (mandatory Linux path, both runtimes).** Resolve the final native executable once; reject symlinks, scripts, and dispatch launchers for the authoritative confined path. Open the regular executable `O_RDONLY|O_NOFOLLOW|O_CLOEXEC`, fstat/hash that fd, and retain it through launch. The minimal trusted wrapper creates the final execing task (for the filtered path, after creating the PID namespace), reports that task's host PID over a one-shot private pipe, and blocks the task on a second private release pipe before untrusted exec. The supervisor is its ancestor and sole tracer; it uses `PTRACE_SEIZE` with `PTRACE_O_TRACEEXEC` on that blocked exact task, verifies the seize, and either created it in the leaf through `clone3(CLONE_INTO_CGROUP)` or moves/verifies it through the retained cgroup fd for the separately proven stop/GO fallback. Only then does the supervisor release the trusted task to finish namespace/seccomp setup and call `execveat(fd, "", argv, envp, AT_EMPTY_PATH)` on the retained fd—never a pathname lookup. Successful exec produces exact `PTRACE_EVENT_EXEC` before the new program begins execution.

   The event PID returned by `waitpid` must equal the seized tracee identity tracked by the supervisor; no descendant/adopted PID is accepted. At that exact `PTRACE_EVENT_EXEC` stop, the same seized task cannot run another exec and cannot exit/reuse its PID until the tracer resumes it. `/proc/<event-pid>/exe` is a procfs magic symlink, so the supervisor deliberately opens it **without `O_NOFOLLOW`** while the tracee is stopped, immediately fstats and hashes that opened fd, and compares dev/ino/size/content with the independently retained executable fd. `O_NOFOLLOW` on this procfs path must be a negative probe returning `ELOOP`, never the positive algorithm. Only after executable identity, leaf membership/domain, and kill authority all match does the receipt bind the tracee/event/fd identities and `PTRACE_DETACH` with signal 0; detach is final GO. Any PID-handoff/event-PID mismatch, seize/event timeout, wrong event/status, procfs open/fstat/hash mismatch, ptrace loss, exec failure, membership mismatch, or early exit kills/waits/reaps and refuses without target code. The final task is single-threaded at seize/exec; PID handoff/release fds close before detach; no external attach/adoption is allowed. **(Claude-only `FilteredCgroupHardening` continues from the blocked final task:)** it must already be in the leaf when it calls `unshare(CLONE_NEWCGROUP)`, so `/` inside that namespace is the worker leaf rather than an ancestor.
4. **Build an isolated view (Claude-only `FilteredCgroupHardening`; Codex skips this and stays cooperative).** For the rootless path, the wrapper first creates a user namespace, pauses while the manager installs `setgroups=deny` and uid/gid maps, then creates private mount+cgroup+PID namespaces and forks the namespace PID 1. It makes mounts private, enumerates and detaches **every inherited procfs and cgroup2 mount**, mounts one fresh `/proc` for the new PID namespace, proves `/proc/<host-pid>/{fd,fdinfo,root,cwd}` grants no host authority, and mounts exactly one cgroup2 view at `/sys/fs/cgroup`, rooted at the worker leaf and remounted read-only/nosuid/nodev/noexec. The privileged path must produce the identical observable view/receipt.
5. **Remove alternate authority before untrusted exec (Claude-only `FilteredCgroupHardening`).** Explicitly close every non-allowlisted fd (including manager/cgroup/mount namespace fds) with close-range plus fresh-`/proc/self/fd` verification; retain only stdio and the pinned target fd until `execveat`. The parent-owned ptrace relationship is already established before seccomp. Set `no_new_privs`, drop namespace capabilities, then install an architecture-validating seccomp filter. It accepts only `AUDIT_ARCH_X86_64` or `AUDIT_ARCH_AARCH64` matching the compiled target; on x86_64 it rejects every syscall number carrying `__X32_SYSCALL_BIT`. Because classic seccomp BPF cannot dereference the `clone3` pointer argument, deny `clone3` wholesale with **exactly `SECCOMP_RET_ERRNO | (ENOSYS & SECCOMP_RET_DATA)`**, never `EPERM`, kill, trap, or a generic deny action. This makes glibc `posix_spawn` take its verified legacy-`clone` fallback. On that legacy path, allow ordinary child flags but deny every namespace-creating flag. Deny later `mount`, `umount2`, `fsopen`, `fsmount`, `open_tree`, `move_mount`, `mount_setattr`, `fsconfig`, `fspick`, `pivot_root`, `chroot`, `setns`, `unshare`, namespace-creating legacy `clone` flags, tracee-side `ptrace`, `process_vm_readv`, `process_vm_writev`, and `pidfd_getfd`; allow the one fd-based `execveat` required to reach the exec stop. Most controls are defense-in-depth after capability drop and the fresh PID/proc view; failure of the architecture/x32/clone3-return/exec-stop checks is independently fatal to the filtered hardening layer only, never to cooperative WorkerTree.
6. **Adversarial and compatibility gates, then GO.** Preserve the raw-syscall namespace-denial fixture in the exact namespaces: it must prove `clone3` creates no child and returns `-1/ENOSYS`; namespace flags through legacy `clone` remain denied; wrong-arch and x32 actions are asserted exactly; ancestor/sibling write, remount, new namespace, inherited-fd, alternate proc/cgroup mount, and `/proc/<pid>/{fd,fdinfo,root,cwd}` attacks fail in the filtered layer. A deterministic barrier replaces the executable pathname after the fd hash and before exec; the pinned original reaches `PTRACE_EVENT_EXEC` or launch refuses, and the receipt never describes the replacement. Negative rows inject forged/wrong host-PID handoff, release-before-seize, seize denial, missing/wrong exec event, exec timeout/failure, event-PID substitution, `O_NOFOLLOW` proc-exe `ELOOP`, proc-exe fd/hash mismatch, ptrace detach failure, and identity replacement; all kill/reap before target sentinel. Separately, A120 (RunGate A5b) drives each real runtime through blocked final task→seize→gated leaf→fd exec→same-tracee exec-event→followed proc-magic-link fd identity→detach GO, then real sandbox tool child plus nested double-fork/fork storm and `cgroup.kill`→`populated 0`. Optional freeze is not a GO/proof prerequisite. Only a runtime passing this cooperative gate may receive `ConfinedCgroupCooperative`; inability to establish the ancestor tracer, fd-bound exec stop, placement, or leaf containment records it unavailable. Claude additionally attempts filtered hardening; Codex is expected filtered-unavailable. The manager constructs the receipt at the exec stop and sends GO only by validated detach.

The detached lifecycle supervisor is the cgroup manager and retains the exact directory fd until terminal release. Ordinary CLI exit/restart asks that supervisor to act; it does not reopen the path. Each production launch privately constructs its own `CgroupPlacementReceipt` from the live host boot id, kernel, runtime binary/version, exact leaf fd, and gated placement; each fence constructs its own matching `CgroupKillReceipt`. A120 (RunGate A5b) is CI/release regression evidence only and never authorizes a later host, runtime, or worker. Any cached capability/status record is explicitly non-authoritative diagnostic input, is bound to host boot id+kernel+runtime binary digest, and is invalidated on any change. If the supervisor or fd is lost, mount/dev/inode/path revalidation is observation only because the path/inode could have been recycled; this plan defines no fd-reconstruction/transfer path, so recovery remains `FencingUnconfirmed`. A **cooperative** failure — gated-placement/leaf-membership loss, non-domain/non-empty-subtree leaf, non-writable `cgroup.kill`, typed-placement fallback failure, kill/`populated 0` failure, surviving host PID, retained-fd loss, or supervisor-authority loss — makes WorkerTree unavailable for that runtime. A **filtered-hardening** failure records `filtered_hardening: None` and disables only the Claude-only layer. This direct boundary does not claim to stop a deliberately adversarial same-user broker or service from creating a sibling process; every `CgroupTreeProof` is stamped `CooperativeWorkerV1` and diagnostics repeat that scope.

### 4. Exhaustive, scope-bound proof validation

```rust
pub enum ProcessProof {
    PidFdExited(PidFdExitProof),
    OwnedChildReaped(OwnedChildReapProof),
}

pub struct PidFdExitProof {
    worker_id: String,
    generation: String,
    pid: u32,
    pidfd_identity_sha256: String,
    exit_receipt: PidFdExitReceipt,
    _sealed: process_identity::Sealed,
}

pub struct PidFdExitReceipt {
    observation: String, // "pollin-whole-process" | "waitid-p-pidfd-owned"
    observed_at: String,
    raw_evidence_sha256: String,
    _sealed: process_identity::Sealed,
}

pub struct OwnedChildReapProof {
    worker_id: String,
    generation: String,
    operation_id: String,
    supervisor_instance_id: String,
    pid: u32,
    exit_status: i32,
    operation_version: String,
    _sealed: supervisor::Sealed,
}

pub struct CgroupTreeProof {
    worker_id: String,
    generation: String,
    boundary: CgroupBoundary,
    termination: CgroupKillReceipt,
    threat_model: WorkerThreatModel,
    fence_epoch: String,
    fencing_version: String,
    _sealed: supervisor::Sealed,
}

pub enum WorkerThreatModel { CooperativeWorkerV1 }

pub struct ProtocolProofAttempt {
    worker_id: String,
    generation: String,
    server_fingerprint: String,
    supervisor_instance_id: String,
    fence_epoch: String,
    fencing_version: String,
    adapter_instance_id: String,
    attempt_binding_sha256: String,
    _sealed: lifecycle::Sealed,
}

pub struct ThreadQuiescence {
    attempt_binding_sha256: String,
    thread_id: String,
    parent_thread_id: Option<String>,
    turns: Vec<TurnTerminalProof>,
    terminals: Vec<TerminalTerminationProof>,
    terminal_pages_sha256: String,
    terminal_next_cursor_is_null: bool,
    evidence_sha256: String,
    _sealed: lifecycle::Sealed,
}

pub struct TerminalTerminationProof {
    attempt_binding_sha256: String,
    process_id: String,
    persisted_status: String,
    source: String,
    evidence_sha256: String,
    _sealed: lifecycle::Sealed,
}

pub struct TurnTerminalProof {
    attempt_binding_sha256: String,
    turn_id: String,
    persisted_status: String,
    source: String, // "includeTurns" | "thread/turns/list"
    evidence_sha256: String,
    _sealed: lifecycle::Sealed,
}

pub struct ProtocolTreeProof {
    attempt: ProtocolProofAttempt,
    worker_id: String,
    generation: String,
    server_fingerprint: String,
    supervisor_instance_id: String,
    fence_epoch: String,
    fencing_version: String,
    root_thread_id: String,
    lineage_hash: String,
    threads: Vec<ThreadQuiescence>,
    boundary: DedicatedOfflineBoundaryProof,
    completed_before_deadline: bool,
    _sealed: lifecycle::Sealed,
}

pub struct DedicatedOfflineBoundaryProof {
    attempt_binding_sha256: String,
    worker_id: String,
    generation: String,
    server_fingerprint: String,
    fence_epoch: String,
    fencing_version: String,
    supervisor_instance_id: String,
    no_listener_evidence_sha256: String,
    graceful_stop_reaped_evidence_sha256: String,
    durable_flush: DurableFlushReceipt,
    complete_offline_artifact_set_sha256: String,
    _sealed: lifecycle::Sealed,
}

pub struct DurableFlushReceipt {
    attempt_binding_sha256: String,
    contract_version: String,
    accepted_mutation_watermark: String,
    flushed_mutation_watermark: String,
    shutdown_ack_sha256: String,
    storage_sync_evidence_sha256: String,
    evidence_sha256: String,
    _sealed: lifecycle::Sealed,
}

pub struct ProtocolObservation {
    pub root_thread_id: String,
    pub observed_lineage_hash: String,
    pub completed_pages: u32,
    pub reason_not_proof: String,
}

pub enum WorkerTreeProof {
    ConfinedCgroup(CgroupTreeProof),
    AppServerTreeAndContainment {
        protocol: ProtocolTreeProof,
        containment: CgroupTreeProof,
    },
}

pub enum FenceEvidence {
    ProcessOnly(ProcessProof),
    ProtocolOnly(ProtocolTreeProof),
    WorkerTree(WorkerTreeProof),
    Unconfirmed { reason: String, observations: Vec<ProcessObservation> },
}

pub struct FenceIntent {
    worker_id: String,
    generation: String,
    fence_epoch: String, // UUIDv4, new for every reconcile attempt
    fencing_version: String,
    _sealed: lifecycle::Sealed,
}

pub struct FenceTurnRef {
    thread_id: String,
    turn_id: String,
    fence_epoch: String,
    _sealed: lifecycle::Sealed,
}

pub struct OwnedTurnRef {
    operation_id: String,
    thread_id: String,
    turn_id: String,
    binding_epoch: String,
    _sealed: lifecycle::Sealed,
}

pub struct TurnCancellationPermit {
    operation_id: String,
    worker_id: Option<String>,
    generation: Option<String>,
    binding_epoch: String,
    authority: CancellationAuthority,
    turn: OwnedTurnRef,
    _sealed: lifecycle::Sealed,
}

pub struct FenceTerminalRef {
    thread_id: String,
    process_id: String,
    fence_epoch: String,
    _sealed: lifecycle::Sealed,
}

pub enum FenceAction { InterruptKnownTurn, TerminateKnownTerminal, SignalRecordedHandle, FenceConfinedCgroup }

pub enum OwnedSignal { SigInt, SigTerm, SigHup }
pub enum CgroupFenceAction { Kill, DiagnosticFreeze }

pub enum FenceAppServerHandle {
    SharedSocket { server: String, server_fingerprint: String },
    DedicatedStdio { supervisor_instance_id: String, io: AppServerIo },
}

pub struct AppServerIo { reader: File, writer: File, _sealed: lifecycle::Sealed }

pub struct FencePermit {
    intent: FenceIntent,
    worker_snapshot: ManagedWorker,
    allowed: Vec<FenceAction>,
    signal_handle: Option<SignalHandle>,
    appserver_handle: Option<FenceAppServerHandle>,
    binding_guards: Vec<ExclusiveFileLock>,
    activity_guard: ExclusiveFileLock,
    _sealed: lifecycle::Sealed,
}

pub enum DrainError {
    TimedOut { prior_operations: Vec<String> },
    StaleGeneration,
    StateChanged,
}

pub enum FenceOutcome {
    Confirmed { worker_id: String, generation: String, scope: RequiredScope },
    Unconfirmed { worker_id: String, generation: String, reason: UnconfirmedReason },
}

pub enum UnconfirmedReason {
    ObservationOnly,
    UnconfirmedDescendants,
    ContainmentMismatch,
    ProtocolIncomplete,
    LostAuthority,
}

pub fn finish_fence(permit: FencePermit, evidence: FenceEvidence) -> Result<FenceOutcome, String>;
pub fn mark_fence_unconfirmed(intent: FenceIntent, error: DrainError) -> Result<FenceOutcome, String>;
pub fn finalize_fenced_retention(worker_id: &str, generation: &str, expected_version: &str, proof_sha256: &str) -> Result<(), String>;
```

`TurnCancellationPermit`, `OwnedTurnRef`, `FencePermit`, `FenceTurnRef`, and `FenceTerminalRef` construction/seals remain private. A `TurnCancellationPermit` is the deliberately weaker pre-drain authority for one live guard's own exact persisted turn; every use re-resolves its exact UnmanagedCanceling session/binding/cancellation epoch plus current operation version, Claiming epoch/version, or Fencing generation/epoch/version, derives the target from sealed custody, and may only interrupt that one turn. A full `FencePermit` is still post-drain and every fence mutation re-resolves exact `Fencing + worker_id + generation + fence_epoch + fencing_version` immediately before use. The only lower mutators that accept them are:

```rust
appserver::interrupt_owned_turn_on_cancel(&mut TurnCancellationPermit)
appserver::interrupt_with_fence(&mut FencePermit, &FenceTurnRef)
appserver::terminate_terminal_with_fence(&mut FencePermit, &FenceTerminalRef)
process_identity::signal_recorded_with_fence(&mut FencePermit, OwnedSignal) // no pid/pgid/path argument
process_identity::fence_cgroup_with_fence(&mut FencePermit, CgroupFenceAction) // no path/fd argument
```

The full-fence refs are emitted only by exact custody handoff or enumeration under the same permit epoch. Terminal refs use the current exact `thread/backgroundTerminals/list` process id and terminate it with `thread/backgroundTerminals/terminate`; bulk `clean {}` acknowledgement is never completion evidence. There is deliberately no resume/start/inject/drain/spawn overload for either permit, and no interrupt/terminate/signal overload without the matching sealed capability. Every call verifies its `FenceAction`; the cancellation permit cannot clean/signal/re-enter, a process-only permit cannot terminate a terminal, and an app-server permit cannot signal an unrelated handle.

`drain_prior_operations` cannot mint `FencePermit` until it holds all bound-session locks plus worker activity exclusively and every released guard has either resolved custody or written an exact-version `CancellationHandoff`. A handoff is consumed into the permit only when its authority matches the same current fence epoch/version; unknown-turn or lost-supervisor handoffs instead force `FencingUnconfirmed`. `finish_fence` consumes that permit and, in one `with_lock`, exhaustively validates evidence, writes immutable `FenceProofRecord`, then CASes only the exact current `Fencing` fence epoch/version to `Fenced` or `FencingUnconfirmed`. On confirmed proof it immediately calls idempotent `finalize_fenced_retention`, which exact-CASes `Fenced@version→TerminalRetained@version+1` only after the proof record and terminal evidence are durable and no unresolved operation/handoff remains. A crash after the Fenced write is resumed by `lifecycle reconcile`; it never recomputes or substitutes proof. `mark_fence_unconfirmed` consumes the exact intent after any binding/activity drain timeout and performs the exact version CAS. A stale completion returns `StateChanged` and writes nothing.

Reconcile, release, and abandon are also exact-version operations. Reconcile first resumes an exact `Fenced→TerminalRetained` retention gap, otherwise CASes `FencingUnconfirmed@version N` to `Fencing@version N+1` with a new `fence_epoch`; release CASes only `TerminalRetained@expected_version` and only when `--proof-sha256` matches the stored `FenceProofRecord`; abandon CASes only `FencingUnconfirmed@expected_version`. Thus an old fencer cannot signal, finish, release, or overwrite state after reconcile or audited abandonment.

Proof scope remains exhaustive: `ProcessProof` satisfies only `ProcessOnly`; `ProtocolTreeProof` only `ProtocolTree`; only `WorkerTreeProof` satisfies `WorkerTree`. Every proof attempt privately mints one canonical `ProtocolProofAttempt` over worker, generation, server fingerprint, supervisor, fence epoch, fencing version, and adapter instance. `DurableFlushReceipt`, `ThreadQuiescence`, every `TurnTerminalProof`, every `TerminalTerminationProof`, and the offline boundary all carry that exact `attempt_binding_sha256` plus their own evidence hash. The builder rejects any N/N+1 mixing before a `FenceEvidence` value exists; serialization round-trips cannot replace nested receipts. Every proof-critical protocol field is private/sealed; only a private adapter builder holding the exact `FencePermit` constructs the complete proof. `DedicatedOfflineBoundaryProof` is constructible only by an adapter that reports a mutation-rejecting durable flush watermark covering every accepted mutation and whose complete offline scan reaches that watermark. The current Codex adapter is hard-coded `UnavailableCurrentCodexAppServer` and cannot construct it; the positive path exists only in the fake/future-adapter contract test. Freeze evidence is deliberately absent from this type. A `TrackedTree` backend always returns `Unconfirmed`, root exit never promotes to tree proof, and unknown evidence/backend variants fail closed. `CgroupTreeProof` satisfies WorkerTree only for `CooperativeWorkerV1`; its setup-time boundary cannot be promoted without the same-fence sealed `CgroupKillReceipt`, and attempting to omit or widen that threat-model tag fails closed.

All `CgroupBoundary`, placement/kill/filtered receipt, and `CgroupTreeProof` fields are private. Public methods are read-only accessors returning copies/borrows; no mutable accessor or public constructor exists. A120 (RunGate A5b) produces CI/release regression evidence only. Every production worker constructs fresh placement evidence on its actual host/runtime/leaf; no cached attestation authorizes GO or proof. Only the live matching supervisor may construct the final `CgroupTreeProof`, after re-resolving its private `SupervisorFencePermit`, writing kill, observing populated-zero, validating every in-model membership row, and binding the exact placement receipt plus fence epoch/version. Compile-fail fixtures reject construction and field mutation; runtime tests prove a stale supervisor or altered serialized observation cannot enter `FenceEvidence::WorkerTree`.

### 5. Managed first-prompt admission, hook health, and measured dead-man

Claude SessionStart performs only the short atomic Claiming publication first, drains old binding-epoch guards outside the global lock, then CASes Claiming→Managed/Active. It does not run GC, marker, ordinary register, or mailbox drain before Active. On claim/drain/CAS failure it returns exit-0 JSON with top-level `continue:false`/`stopReason`, records the error, and notifies the detached supervisor. Claude's current SessionStart behavior is captured by a version-pinned empirical row because its event-specific documentation emphasizes context even though universal `continue:false` is documented. Claude UserPromptSubmit is the required prompt barrier: it admits a binding-bound `UserPromptDrain`, and non-Active/Claiming state returns `decision:"block"` without draining. Both handlers explicitly configure `timeout: 30`; timeout remains fail-open and activates supervisor fencing.

Managed Codex does not depend on either hook to prevent the first prompt. The relay-owned app-server controller starts the dedicated server, obtains the exact thread id, completes `claim_managed_appserver`, then authorizes the first `turn/start` only after Active; failure emits no turn request. Codex SessionStart/UserPromptSubmit remain ordinary registration, mailbox/re-entry defense, and diagnostic surfaces. A non-Active managed Codex hook still refuses/drains nothing, but hook skip/timeout cannot bypass controller admission. Direct CLI/TUI or third-party app-server sessions remain unmanaged and make no managed guarantee. Ordinary unmanaged behavior in both tools remains byte-compatible and fail-open, but unmanaged mutations still require a session/epoch-bound guard.

Hook health is a versioned diagnostic snapshot, not child-spawn authority:

```rust
pub struct HookHealthSnapshot {
    codex_version: String,
    schema_bundle_sha256: String,
    entry_cwd: String,
    entry_warnings: Vec<String>,
    entry_errors: Vec<HookErrorInfo>,
    hook: HookMetadataSnapshot,
    source_path: String,
    source_dev: u64,
    source_ino: u64,
    source_sha256: String,
    expected_command_schema: String,
    normalized_expected_command_sha256: String,
    normalized_observed_command_sha256: String,
    mismatch_reason: Option<String>,
}

pub struct HookErrorInfo { path: String, message: String }

pub struct HookMetadataSnapshot {
    key: String,
    event_name: String,
    handler_type: String,
    is_managed: bool,
    plugin_id: Option<String>,
    source: String,
    source_path: String,
    command: Option<String>,
    matcher: Option<String>,
    status_message: Option<String>,
    current_hash: String,
    display_order: i64,
    timeout_seconds: u64,
    enabled: bool,
    trust_status: String,
}
```

The installed-version wire type is preserved before deriving health: response `data[]` contains `{cwd,warnings:[string],errors:[{path,message}],hooks:[HookMetadataSnapshot]}`; nullable `command`, `matcher`, `pluginId`, and `statusMessage` remain null rather than invented defaults. Hook normalization is literal and version-pinned: JCS-encode the exact containing-entry cwd/warnings/structured errors plus every hook field in generated-schema placement and SHA-256 those bytes. The required Docks rows then demand `plugin_id=Some("session-relay@docks")`, `handler_type=command`, non-null exact command string, and the expected event/source/trust fields. No argv split, shell-semantic equivalence parser, whitespace folding, path resolution, stringified error, or stderr interpretation is allowed.

`hooks/list` for the exact cwd must return exactly one session-relay row per required event whose plugin id, event, enabled state, timeout, command semantics, source identity/hash, `currentHash`, and `trustStatus` match the shipped expectation; the trusted status applies only to that returned current hash. A later re-list/source re-hash can detect version/source/semantic/post-list drift and report `HookHealthDegraded`, but no snapshot or private re-hash is described as an atomic expected-hash-bound launch guarantee. Production never passes `--dangerously-bypass-hook-trust`.

The two committed Codex hook commands are the exact durable shell bootstraps below; their first executable is `/bin/sh`, never the versioned relay. SessionStart has no suffix; UserPromptSubmit passes the required event suffix:

```sh
/bin/sh -c 'plugin=$1; shift; root=${XDG_DATA_HOME:-${HOME:?HOME required}/.local/share}/docks/session-relay/runtime; if test -L "$plugin"; then exit 4; fi; if test ! -e "$plugin"; then exec "$root/current/relay" hook codex "$@"; fi; if test ! -d "$plugin"; then exit 4; fi; launcher=$plugin/bin/relay; if test -L "$launcher" || test ! -f "$launcher" || test ! -x "$launcher"; then if test ! -e "$plugin" && test ! -L "$plugin"; then exec "$root/current/relay" hook codex "$@"; fi; exit 4; fi; "$launcher" __install-stable --plugin-root "$plugin" --json >/dev/null; rc=$?; if test "$rc" -eq 0; then exec "$root/current/relay" hook codex "$@"; fi; if test ! -e "$plugin" && test ! -L "$plugin"; then exec "$root/current/relay" hook codex "$@"; fi; exit "$rc"' relay-hook "${CLAUDE_PLUGIN_ROOT}"
/bin/sh -c 'plugin=$1; shift; root=${XDG_DATA_HOME:-${HOME:?HOME required}/.local/share}/docks/session-relay/runtime; if test -L "$plugin"; then exit 4; fi; if test ! -e "$plugin"; then exec "$root/current/relay" hook codex "$@"; fi; if test ! -d "$plugin"; then exit 4; fi; launcher=$plugin/bin/relay; if test -L "$launcher" || test ! -f "$launcher" || test ! -x "$launcher"; then if test ! -e "$plugin" && test ! -L "$plugin"; then exec "$root/current/relay" hook codex "$@"; fi; exit 4; fi; "$launcher" __install-stable --plugin-root "$plugin" --json >/dev/null; rc=$?; if test "$rc" -eq 0; then exec "$root/current/relay" hook codex "$@"; fi; if test ! -e "$plugin" && test ! -L "$plugin"; then exec "$root/current/relay" hook codex "$@"; fi; exit "$rc"' relay-hook "${CLAUDE_PLUGIN_ROOT}" --event prompt
```

Shell/argv quoting is emitted literally by `codex-hooks.json`; neither cwd nor hook input is interpolated into code. Installer JSON is redirected so complete hook stdout contains exactly one hook response object. The shell predicates are corruption and ordinary-prune checks at the instant observed, not a cache-authentication primitive. A plugin-root symlink—including a dangling symlink—that is present at the root check fails; a launcher symlink/nonregular/nonexecutable object present at its checks fails. When N's cached plugin root remains an ordinary real directory, the launcher validates/installs. If ordinary cache pruning removes the root before the first existence check, after the directory check but before launcher validation, before launcher execution, or while installer source opens are beginning, the applicable branch must re-evaluate `! -e && ! -L` and may fall through to stable `current/relay` only while the whole root is then truly absent and non-link; a present invalid object fails. Missing/invalid `current` fails visibly and the hook never searches cache directories. A deliberate same-UID replace-all can change the root and launcher between shell predicates and execution, so standalone bootstrap explicitly does **not** claim that the code first executed from the cache is authentic or race-pinned. A123 covers ordinary deletion at every named window, known-at-check dangling/non-dangling root and launcher links/nonregular/mode corruption, exact stdout, and the transition to native-installer pinning; it does not install an impossible pre-exec symlink/recreate authenticity barrier.

The runtime root is same-owner mode 0700 and contains `install.lock` (same-owner regular mode 0600), immutable `generations/<plugin_version>-<binary_sha256>/{relay,runtime.json}`, a staging directory, and an intentional relative `current` symlink to one complete generation. Once the native installer process starts, it opens the exact supplied plugin root as a same-owner `O_PATH|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC` dirfd, then opens exact `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `hooks/codex-hooks.json`, `hooks/hooks.json`, `bin/SHA256SUMS`, `bin/relay`, the selected `bin/<target>`, and every canonical payload-manifest member relative to pinned parent dirfds with per-component no-follow checks. It retains all manifest/checksum/hook-definition/payload-member/selected-binary fds through validation and copy; the selected payload is hashed and copied from the same open fd, and `plugin_payload_sha256`/`hook_definitions_sha256` are computed only from those retained fds. From that native-installer boundary onward, rename/recreate/symlink barriers at every source component must either fail validation or preserve the originally opened bytes—never mix manifests, checksum, hook definitions, dispatcher, or payload across generations. This post-start splice guarantee does not retroactively authenticate the cache launcher that the standalone shell already executed.

The pinned manifests must match `name=session-relay` and identical strict-semver `version`; `bin/SHA256SUMS` has a unique lowercase SHA-256 plus basename for exactly the closed target mapping `Linux x86_64→relay-x86_64-unknown-linux-musl`, `Linux aarch64→relay-aarch64-unknown-linux-musl`, `Darwin x86_64→relay-x86_64-apple-darwin`, `Darwin arm64→relay-aarch64-apple-darwin`; selected payload is a regular executable matching its digest. `bin/relay` is only the dispatcher used by standalone bootstrap to invoke the native installer; stable generation copies the selected native binary, never that shell launcher. Never use Cargo package version. The installer locks `install.lock` across current-state read, source validation, generation staging, every fsync, and pointer commit. It lstat-validates every runtime parent/generation object; hostile symlinks are rejected, while managed `current` is allowed only when its target is one same-root immutable generation with matching regular 0755 binary and closed record. Exact portable commit sequence: write+fsync binary and record in staging; fsync staging generation directory; rename staging into `generations/`; fsync `generations/`; create temporary relative symlink in runtime root; fsync runtime root; rename it over `current`; fsync root again. Never fsync the symlink inode. Crash selects complete old or new pair; partial staging is never selected and is cleaned under next lock. Keep current+previous; delete older unselected only after pointer durability. Higher semver replaces; lower no-ops. A same-version no-op is permitted only when the complete canonical identity tuple `{plugin_version,target,binary_sha256,plugin_payload_sha256,hook_definitions_sha256}` equals the selected record; a mismatch in **any** field is fatal and cannot repair/replace/no-op. Lock serialization prevents downgrade. Core standalone hooks own ordinary-upgrade durability and post-start native pinning. For the optional high-assurance proactive path, docks-kit obtains an expected selected-native digest from its own trusted distribution input, opens and hashes those native bytes independently of the cache dispatcher, and invokes `__install-stable --plugin-root <exact-root> --json` through that same retained fd or equivalent identity-pinned direct-native primitive; digest mismatch or identity drift fails before installer execution. That stronger path does not become a standalone-hook dependency and must not be cited as standalone authenticity.

```rust
pub struct StableRuntimeRecord {
    schema: u8, // exactly 1
    plugin_version: String,
    target: String,
    binary_sha256: String,
    plugin_payload_sha256: String,
    hook_definitions_sha256: String,
    installed_at: String,
}

pub struct RuntimeInstallResult {
    schema: u8,
    changed: bool,
    selected: StableRuntimeRecord,
    selected_generation: String,
    previous_generation: Option<String>,
    reason_code: Option<String>,
}

pub struct RuntimeDoctorResult {
    schema: u8,
    state: String, // ready | degraded | unavailable
    stable_path: Option<String>,
    selected: Option<StableRuntimeRecord>,
    hook_health: String, // healthy | degraded | unknown
    capabilities: BTreeMap<String, String>, // available | unavailable | unknown
    reason_code: Option<String>,
}

pub struct RuntimeToolError {
    schema: u8,
    state: String, // exactly "error"
    reason_code: String,
    detail: String,
}
```

Every object is recursively closed in the committed JSON schema. Doctor capability keys are exactly `stable_runtime`, `hook_session_start`, `hook_user_prompt_submit`, `managed_appserver`, `cooperative_cgroup`, and `filtered_hardening`; values are `available|unavailable|unknown`. Result reason codes are exactly `ready`, `hook_health_degraded`, `capability_unavailable`, `stable_runtime_absent`, and `unsupported_runtime_contract`; install reason codes are `installed`, `already_current`, `lower_version_ignored`, and `previous_retained`. `previous_retained` is exit-0 only when a lower candidate's complete canonical identity exactly matches the retained previous generation: current remains selected, `changed=false`, and `previous_generation` names that retained generation; mismatched/corrupt retained bytes cannot qualify. Error reason codes are exactly `usage`, `schema_mismatch`, `unsupported_target`, `unsupported_install_source`, `validation_failed`, `tamper_detected`, `owner_mode_invalid`, `lock_failed`, and `io_failed`. Unknown keys/codes/extra fields fail validation. `ready|degraded|unavailable` are normal exit-0 `RuntimeDoctorResult` readiness states; exit 3 is reserved for command inability such as an unsupported install target and emits `RuntimeToolError`. Exit 2 is usage/schema, 4 validation/tamper, and 5 I/O/lock. JSON-mode nonzero paths, including usage once `--json` is recognized, emit exactly one schema-valid `RuntimeToolError` on stdout; stderr is human diagnostic only. Fourteen golden fixtures cover doctor ready/degraded/unavailable, install changed/current/lower-no-op/previous-retained, and every error exit, and the schema and implementation are independently checked against them. `plugin_payload_sha256` is a canonical sorted path/mode/content manifest over the installed plugin payload excluding the mutable stable runtime root; `hook_definitions_sha256` is the canonical normalized shipped SessionStart/UserPromptSubmit definition set. They drive diagnostics/restart delta only, never lifecycle proof.

The Codex plugin manager's installed plugin root is the standalone bootstrap trust input. `SHA256SUMS` proves package-internal corruption/target selection, not authenticity against a malicious same-UID actor who rewrites both binary and checksum; that actor is outside the cooperative same-user threat boundary already stated. The installer never claims signature verification. A higher-assurance docks-kit proactive path must open the selected native payload, compare that retained fd's digest to an immutable reviewed Docks contract/release fixture **before** any cache execution, and invoke `__install-stable` through those same retained verified native bytes (platform fd-exec or an equivalently identity-pinned direct-native primitive); it cannot execute the dispatcher, re-resolve the selected path, or treat self-reported cache checksums as an external anchor.

`relay doctor --json --capabilities` is the versioned consumer contract for docks-kit and operators. Its closed schema reports stable generation/path/version/target/binary digest, plugin payload digest, normalized hook-definition digest/health, and typed capability availability/reason codes; it is diagnostic, never lifecycle proof. `__install-stable --json` uses a separate closed result schema with `changed`, selected/previous generation, and typed error. Both schemas live in `test/fixtures/runtime-doctor-schema.json`; docks-kit consumes an exact reviewed schema/commit rather than parsing stderr.

The supervisor holds the unreaped root child and, where available, strong cgroup control. Its deadline comes from the measured formula in Environment—not a hard-coded four seconds. Sequential contention tests queue multiple near-timeout store users and prove the attach claim is still first; failure blocks the prompt and fences, never lengthens `with_lock` beyond three seconds.

The bounded race is explicit for Claude: the required UserPromptSubmit block has an explicitly configured 30-second hook timeout; the watchdog deadline is at most 20 seconds, leaving at least 10 seconds of project-configured margin for owned-child termination and wait. SessionStart stop is an earlier defense where the exact version honors it, but the Claude safety claim does not require SessionStart alone. If UserPromptSubmit is skipped or violates that contract, Claude prompt execution may begin any time from CLI exec until the watchdog acts; the residual window is at most `managed_attach_deadline_ms` for a scheduled supervisor with a live owned-child handle, but it is not zero and cannot be a hard scheduler guarantee. Codex has no corresponding first-turn race because the relay controller withholds `turn/start` until Active. Root termination is only ProcessOnly unless strong containment proves the tree.

### 6. App-server lineage, terminal flush, and physical scope

Persist every successful `turn/start` response's exact `turn.id` before pumping. Persist `TurnStartSentUnknown` before the send so an ambiguous after-send failure cannot disappear. Fencing first blocks relay re-entry. Async repeated scans are observations, not a fixed point: equality of two scans cannot construct `ProtocolTreeProof`.

1. A live guard first uses `TurnCancellationPermit` to interrupt only its own exact persisted turn and requires a matching terminal event; after drain, `FencePermit` may interrupt exact handed-off or enumerated turns. List background terminals and terminate each exact returned `processId`; never treat bulk `clean {}` acceptance as terminal completion. Enumerate descendants/turns/terminals through all pages under one `protocol_lineage_deadline_ms` deadline. `thread/read idle` alone remains forbidden.
2. Every connection that uses descendant filters, `thread/turns/list`, `thread/items/list`, or background-terminal list/terminate sends `initialize` with `capabilities.experimentalApi=true`, verifies the initialization response under the recorded runtime version, then sends `initialized`. Missing/unsupported experimental methods return typed `ProtocolIncomplete`; they never fall back to partial stable scans or bulk clean.
3. A **shared socket server** always yields `ProtocolObservation`, never `ProtocolTreeProof`, and cannot transition a ProtocolTree worker to Fenced. Two sequence reads or a snapshot without durable mutation rejection are insufficient. Step 1 records whether a future authoritative barrier exists, but this plan does not add unverified acquire/hold/release mutators; adopting it requires a separately reviewed capability contract.
4. The installed Codex adapter is explicitly `UnavailableCurrentCodexAppServer`: it has no public mutation-rejecting durable shutdown/flush watermark or persisted terminal-completion ledger, so every real dedicated-server ProtocolTree attempt returns `ProtocolIncomplete { reason: MissingDurableFlushContract }`. The positive adapter contract remains testable with the fake server: reject new mutations, flush every accepted lineage/turn/terminal mutation through an explicit durable watermark, acknowledge it, exit/reap, then complete a finite offline scan through the same-or-later watermark. Process exit, stdio EOF, internal shutdown completion, `clean {}`, and process kill are not a protocol flush.
5. Cgroup kill is the authoritative physical path: write `cgroup.kill=1`, then wait for `populated 0`. Freeze is optional diagnostic/snapshot aid only; processes may migrate while frozen. Freeze cannot construct `DedicatedOfflineBoundaryProof` or `ProtocolTreeProof`, and if used it must proceed to kill without thaw-through-release.
6. For notification-loss recovery, accept exact persisted turn terminal state only from the complete gracefully stopped/flushed offline artifact set. Live `includeTurns`/`turns/list` on a shared server is supporting observation only.
7. A real child-agent test creates a child-thread writer; a real background terminal writes another sentinel; queued-after-parent and continuous-spawner fixtures create descendants after the second equal live scan. A thaw-after-candidate-proof fixture queues a child plus unflushed write before freeze and proves freeze/offline equality is rejected. Every writer must be covered by graceful flush or physically killed behind the confined cgroup. If the deadline expires, a writer continues, a child appears outside the flushed watermark, or any code attempts thaw-through-release, return `ProtocolIncomplete`/refuse release.

Compound WorkerTree+Protocol proof remains a future-adapter path requiring the relay-owned dedicated stdio server, verified graceful flush, and cooperative-scope cgroup containment. The current runtime can still confirm the bounded physical WorkerTree after `cgroup.kill`→`populated 0` when protocol evidence is incomplete, but no ProtocolTree proof is fabricated. The live app-server Child/stdio authority is tied to `supervisor_instance_id`; if that child/protocol authority fails while the same supervisor remains live, its retained cgroup fd may still prove the bounded physical tree. Supervisor loss also loses that fd and remains `FencingUnconfirmed`; no path reopen reconstructs it. Shared servers are observation-only and killing one is forbidden.

### 7. GC retention and durable reconciliation

GC eligibility is lifecycle-aware before surface deletion. `Attaching|Active|Fencing|FencingUnconfirmed|Fenced|TerminalRetained`, pending attaches, `SessionBinding::Claiming|Managed`, versioned unresolved `ActiveOperationRecord`, `CancellationHandoff`, live/lost `SupervisorRecord` and socket identity, generation tombstones, fence-intent markers, activity locks, stale-event audits, and proof records are non-GCable regardless of `last_seen` or mtime. `SessionBinding::GcDeleting|ManagedGcDeleting` is non-admissible and processed only by exact-epoch GC resume. Only an atomically matching `TerminalReleasable + ManagedTerminal + ManagedTerminalReceipt + Released capacity charge when present` tuple can enter the ordinary managed age check; final managed GC retains `TerminalFence` permanently and never recreates Unmanaged.

`SessionOperationTombstone` is keyed by runtime session plus operation. Reaped and risk-accepted outcomes carry distinct receipt hashes; `gc_eligible_at` is `terminal_at +` the existing ordinary age cutoff, never a new shorter cutoff. Even after that time it is deletable only when no pending attach, Claiming/Managed/UnmanagedCanceling binding, unresolved operation/custody, handoff, supervisor/watchdog record, proof, or audit reference points to the session/operation. Risk-accepted deletion never upgrades its `NOT QUIESCENCE-PROVEN` meaning.

`SessionBinding::Unmanaged` preserves legacy aging through this exact two-lock/CAS protocol; neither lock is nested and no external work occurs under either:

1. Under `with_gc_lock`, enumerate old candidates and immutable surface identities, then release it without deleting.
2. Under one short `with_lock`, revalidate that the registry Entry projection and every ordinary surface are older than cutoff; the binding lock is neither live nor unknown; no Claiming/cancel marker exists; no unexpired/retained pending token, managed worker, tombstone, proof, or audit record references the runtime id; and binding epoch/Entry version still match. Exact-CAS `Unmanaged→GcDeleting { gc_epoch, binding_epoch, entry_version }` in one `lifecycle-v1.json` authority generation. This is the GC linearization point; the registry Entry is not authority. Admission, pending-token creation, and SessionStart claim all re-read the authority binding under `with_lock` and refuse/retry `GcDeleting`; they can never publish Claiming across it.
3. Outside global locks, acquire the exact binding lock exclusively with a bounded try-lock. If it cannot be acquired before deletion begins, exact-CAS the untouched record back to Unmanaged and skip. Once held, reacquire `with_gc_lock`, revalidate pinned dev/inode/name/age identities, and delete ordinary surfaces except the binding lock, Entry, and binding record; release `with_gc_lock` before any `with_lock` call. A crash or I/O failure leaves durable `GcDeleting`; later GC resumes only with the exact `gc_epoch` and already-deleted surfaces are idempotently absent. Claim/admission remain refused.
4. After every ordinary surface is absent and while the exclusive binding fd is still held, acquire `with_gc_lock`, revalidate and unlink the binding-lock pathname while its old inode remains pinned by the fd, then release `with_gc_lock`. Remove the registry Entry projection, then one final short `with_lock` exact-CASes the same authority `GcDeleting` epoch/version to remove the Unmanaged binding last. Only then release the fd. A projection-write crash or final-CAS failure retains authoritative `GcDeleting`; admission still refuses and exact-epoch GC can resume/finalize despite an absent Entry/lock pathname. No authority-removal-before-lock-unlink window may let admission create a replacement lock that GC then unlinks.

Malformed/unknown binding state is preserved, never guessed eligible. Race tests pause after enumeration, after `GcDeleting` publication, after the first ordinary-surface deletion, and after binding-lock unlink; concurrent pending creation/SessionStart either wins before the CAS (GC makes zero deletions and preserves every byte) or sees `GcDeleting` (the claimant makes zero state/surface changes while GC deletes only the exact old candidate manifest and resumes idempotently). No fresh or out-of-candidate mailbox, audit, marker, lock, or registry byte may be lost.

Add CLI surfaces:

```text
relay lifecycle status <worker|session> --json
relay lifecycle reconcile <worker> --generation <uuid> --expected-version <n> --json
relay lifecycle reconcile-session <session> --binding-epoch <n> --operation <uuid> --cancellation-epoch <uuid> --expected-operation-version <n> --json
relay lifecycle release <worker> --generation <uuid> --expected-version <n> --session <id> --binding-epoch <n> --capacity-charge <id|none> --expected-capacity-version <n|none> --proof-sha256 <hex>
relay lifecycle abandon <worker> --generation <uuid> --expected-version <n> --session <id> --binding-epoch <n> --capacity-charge <id|none> --expected-capacity-version <n|none> --reason <text> --i-understand-processes-may-still-be-running
relay lifecycle abandon-session <session> --binding-epoch <n> --operation <uuid> --cancellation-epoch <uuid> --expected-operation-version <n> --reason <text> --i-understand-processes-may-still-be-running
```

`status` reports authority-store id/generation, state/version/fence epoch, binding/terminal epoch, operation/handoff/supervisor authority, optional capacity charge/version, backend/scope, proof gap, last attempts, and an exact version-bound retry/recovery command. Worker `reconcile` behaves as before. `reconcile-session` acts only on exact `UnmanagedCanceling` session/binding/cancellation epoch, operation, current operation version, and the still-live matching supervisor; successful reap writes a terminal tombstone and advances binding epoch. `abandon-session` requires the same exact selectors, reason, and acknowledgement, advances the binding epoch with a risk-accepted tombstone, and prints **“NOT QUIESCENCE-PROVEN”**. Neither session command raw-signals observation-only PIDs or invents a worker. Shared servers cannot reconcile to ProtocolTree. Worker release/abandon require every literal worker/binding/charge/proof selector shown above and never infer one from the registry projection. Any stale selector changes nothing.

### 8. Source-ready versus packaged-ready release handoff

This plan's canonical schema-v1 **`Completion-review-receipt:` machine line** in the exact date-prefixed `docs/plans/finished/<YYYY-MM-DD>-relay-worker-lifecycle-primitives.md` path returned by plan-manager's ship transition, pinned by that archive commit, is the durable source-ready authority. It proves the exact reviewed/merged source tip, canonical A101–A138 inventory and its 38 deterministic criterion-summary hashes, passed completion verdict, and no binary/version/release mutation. It deliberately does **not** prove `packaged_ready`.

After plan-manager validates a `passed` completion receipt, archives the plan, and commits that lifecycle transition, the orchestrator records `FINISHED_PLAN_COMMIT` and the exact date-prefixed path returned by ship as `FINISHED_PLAN_PATH`, requires it to match `docs/plans/finished/[0-9]{4}-[0-9]{2}-[0-9]{2}-relay-worker-lifecycle-primitives.md`, and runs exactly: `node plugins/session-relay/test/final-scope.mjs --derive-source-ready-from-completion --finished-plan "$FINISHED_PLAN_PATH" --finished-plan-commit "$FINISHED_PLAN_COMMIT" --json`. This is a post-completion handoff derivation, not a circular acceptance row. It exact-loads that path from the pinned Git blob and requires exactly one `Completion-review-receipt:` machine line, validates it with the shipped schema-v1 helper, requires the archive path to be the exact path returned by ship, `reviewed_head` to equal the merged Session Relay source tip, `completion_verdict="passed"`, all canonical A101–A138 summaries present/in inventory order/met, zero regressions, canonical A137 final-scope evidence, and canonical A138 `AcceptanceSummaryReceipt`/rehash/cleanup/`QuarantineRemoved`/`Finalized` evidence with both cleanup paths absent, then emits exactly one compact-JCS `SourceReadyHandoffReceipt {schema:1,plan_path,finished_plan_commit,completion_receipt_sha256,reviewed_source_tip,acceptance_inventory_sha256,acceptance_result_sha256s,final_scope_result_sha256,step8_cleanup_result_sha256,source_ready,packaged_ready,fanout_unblock,receipt_sha256}`. The three booleans are exactly `true,false,false`; `plan_path` is the exact returned date-prefixed archive path; `acceptance_result_sha256s` contains exactly the 38 `AcceptanceCriterionSummary.summary_sha256` values in A101→A138 inventory order, each aggregating every required chronological occurrence; `receipt_sha256` is JCS SHA-256 over every preceding field. Re-running against the same Git blob must print byte-identical receipt bytes and `SOURCE_READY_HANDOFF PASS receipt_sha256=<same-hex>` on stderr; a draft `Review-receipt:` prefix, missing/multiple/stale/non-passed completion receipt, missing/extra/forked event or summary, absent/mismatched removal/finalization evidence, “latest result” substitution, undated/wrong-date/wrong-slug/not-returned archive path, wrong archive commit/tip/order/count/hash, or any true packaged/fanout claim fails.

The later owner-approved producer/release workflow must consume that exact source-ready receipt hash and record an immutable `session-relay--vN` tag with `N > 0.10.0`, a published non-draft GitHub Release, a tag commit descending from `reviewed_source_tip`, exact producer workflow/run/commit identity, Rust source tree equality with the reviewed source tree, four committed target binaries byte-equal to producer artifacts, verifying `SHA256SUMS`, matching Claude/Codex/marketplace version N, and packaged-artifact 0.10.0→N plus N→N hook/live-upgrade and mixed-version old-writer matrices. Synthetic source-built canonical A123 evidence cannot substitute. Until that later receipt exists, `packaged_ready=false`, `fanout_unblock=false`, and `relay-worker-fanout` remains blocked even if this plan moves to `finished/`.

## Steps

| # | Task | Files | Depends | Status | Done condition / STOP trigger |
|---|---|---|---|---|---|
| 1 | Codify the original feasibility foundation in a committed probe harness: runtime/hook/process rows, explicit absence of a current durable app-server flush contract, raw `clone3→ENOSYS`, and per-runtime ordinary-spawn probes. Emit raw-record hashes and measure attach/protocol bounds. | `plugins/session-relay/test/feasibility-probe.mjs`, `plugins/session-relay/test/fixtures/lifecycle-capability-schema.json`, `docs/plans/active/relay-worker-lifecycle-primitives.md:Notes` | — | done | Commit `c32aafa17d1408157f87de5b616135212f33a2ed` established the original evidence, but its stale `strong_cgroup`/freeze coupling is superseded by Step 1b and cannot by itself advertise Option-A cooperative containment. |
| 1b | From clean `STEP3B_HEAD`, run A103, create the schema-v2 WIP/history/allowlist/receipt machinery; migrate feasibility evidence to independent cooperative/filtered verdicts; prototype post-decision Codex ordering; define hook-health and stable-runtime evidence; and build the retained-self-fd native C/D/G custodian with validation-only Node wrapper. | `plugins/session-relay/rust/src/bin/runner_job_custodian.rs` (new), `plugins/session-relay/test/feasibility-probe.mjs`, `plugins/session-relay/test/fixtures/lifecycle-capability-schema.json`, `plugins/session-relay/test/fixtures/wip-historical-baseline.json` (new), `plugins/session-relay/test/fixtures/wip-step-allowlist.json` (new), `plugins/session-relay/test/runtime-hook-abort.mjs` (new), `plugins/session-relay/test/runtime-hook-upgrade.mjs` (new), `plugins/session-relay/test/runner-job-custodian.mjs` (new), `plugins/session-relay/test/wip-snapshot.mjs` (new); production `rust/Cargo.toml`/`Cargo.lock` read-only. | 1, 3b | planned | A103, WIP negative matrix, native-rooted auth-free A109, stable-generation matrix, A107/A108, and A106 pass. Historical fixture exact-maps 22 commits/35 entries including mixed `cdc70f0`/`701cea7`; future fixture contains literal step mutation rows and empty 1c/1d/8. The A108 transcript has zero pre-decision turn bytes and one successful post-decision harmless request/response. Native matrix proves self-fd identity, ancestor-subreaper adoption, DriverArm/GO/OPEN/COMMIT/reap-ack ordering, bounded channels, and every credential/fd/PID/crash/cleanup negative with no auth/runtime/cgroup access. First commit creates helper/fixtures and A106 append-receipts it before any later step. No implementation-branch plan/doc edit or dependency drift is permitted. |
| 1c | Through sequence 1 of the still-live owner-runner custodian, feasibility-first prototype the exact blocked-child→host-PID handoff→seize/TRACEEXEC→retained-fd `execveat`→same-tracee exec-stop identity sequence independently for Claude and Codex and begin the closed runner receipt. This is raw evidence, not the Step-4 production implementation. | `plugins/session-relay/test/runner-job-custodian.mjs`, `plugins/session-relay/test/feasibility-probe.mjs`, `plugins/session-relay/test/runtime-hook-abort.mjs`, `plugins/session-relay/test/fixtures/lifecycle-capability-schema.json` | 1b, 3d | planned | The exact A110 (RunGate A1c) frame runs through C/D/G `DriverArm→GO→OPEN→COMMIT→GateExit→exact wait→DriverReapAck`; fixed native fds restore CLOEXEC before protocol and never reach Node. Sequence 1 proves armed/spawn/credential/wait/result PID equality, binds retained self identity, live tuple, and exact bootstrap input before probe bytes, then binds partial receipt and exec-stop evidence before reap-ack advance. The partial unexpired receipt proves target sentinel absent until detach, procfs magic-link fd matching retained fd, `O_NOFOLLOW→ELOOP`, and mismatch kill/reap before target code. A111 (RunGate A1d) must immediately arm sequence 2 against that partial on the same live capability. Any mandatory row unavailable poisons/stops before Step 4 and reports the primitive unbuildable on the proposed Linux path. |
| 1d | Through sequence 2 of the same live custodian, validate the owner-provisioned delegated Linux runner without self-provisioning: pin `RELAY_CGROUP_ROOT`, create a disposable domain leaf, exercise stopped-child placement, `cgroup.kill`, exact wait/reap, `populated 0`, and leaf removal, then seal the closed integrity-only receipt. | `plugins/session-relay/test/runner-job-custodian.mjs`, `plugins/session-relay/test/runtime-hook-abort.mjs`, `plugins/session-relay/test/fixtures/lifecycle-capability-schema.json` | 1b, 1c | planned | The exact A111 (RunGate A1d) frame preserves direct native-gate spawn/OPEN/COMMIT/wait/result PID equality. OPEN binds its live tuple and A110 (RunGate A1c) partial-receipt hash before Node/delegation/probe-child bytes. It exact-waits/reaps the killed probe child before populated-zero/removal and records every result; COMMIT then binds the new sealed final receipt and delegation/kill/reap/removal evidence hashes before sequence advance. Copied receipt/environment without the inherited fd, wrapper/borrower PID mismatch, duplicate/stale OPEN, authoritative-before-OPEN, missing/wrong COMMIT, timeout, EOF, zombie/unreaped child, receipt expiry/mismatch, or cleanup failure poisons and closes the capability. The current read-only-cgroup/no-user-bus sandbox is not eligible. Missing delegation/runner is never a skip; no Step 4 or A119 (RunGate A5)/A120 (RunGate A5b)/A121 (RunGate A6)/A125 (RunGate A7) completion begins until resolved. |
| 2 | Add binding epochs/states, two-phase pending-token claim, binding/activity serialization, exact duplicate/resume rules, versioned lifecycle transitions, tombstones, receipts, and GC exclusions plus exact `GcDeleting` CAS/resume. Claiming publication remains the first short hook transaction; Active waits for older unmanaged guards to drain. | `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/rust/src/hook.rs`, `plugins/session-relay/rust/src/lib.rs`, `plugins/session-relay/rust/Cargo.toml`, `plugins/session-relay/rust/Cargo.lock`, `plugins/session-relay/rust/tests/lifecycle_managed.rs` | 1 | done | Commit `066262feda00cd416aad748cf89b4b4a28eb773a` independently passed the Step-2 managed lifecycle suite. Later steps may extend types but may not weaken the verified transition/GC invariants. |
| 3a | Retain the delivered capability-bound admission and publish-first fencing foundation, limited to its verified surface: target-free lower APIs, closed `ChildLaunchSpec`, no lifecycle-sensitive `exec`, exact guard target/kind/binding re-resolution, and the existing four compile boundaries. Do not call cancellation or inventories complete yet. | `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/rust/src/appserver.rs`, `plugins/session-relay/rust/src/bus.rs`, `plugins/session-relay/rust/src/channel.rs`, `plugins/session-relay/rust/src/cli.rs`, `plugins/session-relay/rust/src/hook.rs`, `plugins/session-relay/rust/src/watch.rs`, `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/tests/lifecycle_admission.rs`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.toml`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.lock`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/guardless.rs`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/wrong-target.rs`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fence-reentry.rs`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/reentry-fence.rs` | 2 | done | Checkpoint `701cea7e671bc40ee23d69abf79ff102e0eecb20` independently passed A114's narrowed existing guard/compile suite. The false-green cancellation/inventory claims are explicitly deferred to 3b–3d. |
| 3b | Repair and commit the detached watchdog-first supervisor and versioned operation substrate after A102. | Exact paths are frozen in the historical fixture from commits `06d2324e981eed576d1c8cd3d796a5258f6fd159` and `2a864e9b6f966384e4c4ed0e4b3d563b348a3830`. | 3a | done | A112/A115, three consecutive 122-check selftests, full Rust, clippy/fmt, and plugin CI passed; clean `STEP3B_HEAD=2a864e9b6f966384e4c4ed0e4b3d563b348a3830`. The caller-death Control repair terminalizes abandoned pre-child startup instead of false `SupervisorLost`. |
| 3c | First migrate every lifecycle/binding/custody/proof/audit/capacity map to the sole crash-durable `lifecycle-v1.json` authority and prove an exact released 0.10.0 writer cannot erase or reopen it; then add exact turn/child cancellation on the 3b substrate: persist `TurnStartSentUnknown` before send and exact returned `turn.id` before pump; add `TurnCancellationPermit`, exact terminal observation, versioned `CancellationHandoff`, nonblocking 100 ms polling, fixed 5s guard resolution/handoff, and apply every authority loss only through the source-state×reason table. A child handoff remains owned by the detached supervisor. Extend the closed Rust target fixture with the Step-3c target/case before A113/A116 run. | `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/src/appserver.rs`, `plugins/session-relay/rust/src/supervisor.rs`, `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/rust/tests/lifecycle_store_compat.rs` (new), `plugins/session-relay/rust/tests/lifecycle_turn_cancellation.rs` (new), `plugins/session-relay/test/mixed-version-lifecycle-store.mjs` (new), `plugins/session-relay/bin/relay` (read-only), `plugins/session-relay/test/fake-app-server.mjs` (read-only), `plugins/session-relay/test/lifecycle-smoke.mjs` (read-only), `plugins/session-relay/test/rust-test-inventory.mjs` (read-only), `plugins/session-relay/test/fixtures/rust-test-inventory.json`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.toml`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.lock` (read-only), `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/cancel-reentry.rs` (new), `plugins/session-relay/test/reentry-inventory.mjs` (read-only) | 1b, 3b | planned | The Step-3c fixture extension lands before the gates; A113/A116 and A106 pass authority-first migration, durable commit crash barriers, exact 0.10.0 register/GC rewrite non-erasure, projection loss/repair, malformed-store refusal, deterministic send/response/terminal, child-ignore-kill, every source/reason/crash row, operation-version races, and exact step-range ownership. Any registry-first authority decision, empty fallback, cross-file claim linearization, old write changing authority bytes/generation, direct Active→FencingUnconfirmed, latest-turn guess, stale mutation, >100 ms individual block, guard held after 5s, dropped child authority, unresolved operation disappearance, zero/missing target, or unreceipted mutation: STOP. |
| 3d | Close the pre-controller source-derived admission surface: make wake/watch mutation-guiding status guard-aware, map every generic outbound mutation primitive/caller available before Step 5 to an executed unique behavior test, invoke every then-existing non-controller `OperationKind` wrapper, and replace all placeholder/name-only counts. Include the existing unmanaged `InitialTurn` spawn→start→pump wrapper as behavior `unmanaged_initial_turn`, plus first-birth collision and wrong/stale/mid-block-fence rows. Step 5 owns `ControllerRead|ControllerInjectItems|ControllerStartTurn` and the post-Step-5 A127/A128 rerun. | `plugins/session-relay/rust/src/appserver.rs`, `plugins/session-relay/rust/src/cli.rs`, `plugins/session-relay/rust/src/watch.rs`, `plugins/session-relay/rust/tests/lifecycle_admission.rs`, `plugins/session-relay/test/reentry-inventory.mjs`, `plugins/session-relay/test/fixtures/reentry-inventory.json`, `plugins/session-relay/test/lifecycle-smoke.mjs`, `plugins/session-relay/test/selftest.mjs` | 3c | planned | A117 passes its explicitly pre-controller matrix with no placeholder behavior ids; its A127/A128 invocation is scoped to variants then present and proves `InitialTurn` only for unmanaged app-server spawn while managed turns remain unavailable until Step 5. Any mutation-guiding RPC precedes admission, a stale response guides a later mutation, or an inventory row lacks an executed production-wrapper test: STOP. |
| 4 | **Only after capability-bound A110 (RunGate A1c)+A111 (RunGate A1d) PASS seals the owner-provisioned Linux runner receipt while its custodian remains live**, extend the Step-3b supervisor with Linux pidfd and `ConfinedCgroupCooperative`: fd-pin/hash/fd-exec the exact native runtime; same-tracee TRACEEXEC/proc-magic-link identity; gated placement into a fresh delegated domain leaf; retained generation-bound fd; setup-only placement receipt; post-kill same-fence termination receipt; exact domain/empty-subtree/kill checks; `cgroup.kill`→exact reap→`populated 0`; fail-closed fd loss. Classify `CLONE_INTO_CGROUP` errors exactly; use stop/GO only when independently proven. Add Claude-only best-effort filtered hardening, Darwin closed `UnavailablePlatform`, inventory every signal callsite, and extend the Rust target fixture before A118. | `plugins/session-relay/rust/src/process_identity.rs` (new), `plugins/session-relay/rust/tests/process_identity.rs` (new), `plugins/session-relay/rust/src/supervisor.rs`, `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/src/main.rs`, `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/test/runner-job-custodian.mjs`, `plugins/session-relay/test/rust-test-inventory.mjs`, `plugins/session-relay/test/fixtures/rust-test-inventory.json`, `plugins/session-relay/test/process-signal-inventory.mjs` (new), `plugins/session-relay/test/fixtures/process-signal-inventory.json` (new), `plugins/session-relay/test/runtime-hook-abort.mjs` (modify; created in Step 1b), `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.toml`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.lock` (read-only), `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fabricated-pidfd-proof.rs` (new), `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/tampered-cgroup-proof.rs` (new), `plugins/session-relay/test/reentry-inventory.mjs`, `.github/workflows/build-binaries.yml` | 1c, 1d, 3d | planned | Fixture extension precedes A118. A118 passes its local command; A119 (RunGate A5)/A120 (RunGate A5b) use the six-gate literal set and consume live sequences 3–4 while preserving direct native-gate spawn/OPEN/COMMIT/wait/result PID equality and revalidating unexpired runner/boot/kernel/uid/mount/root/runtime receipt fields. Together they prove stable signaling, retained-fd/path-race closure, same-seized-tracee exec-stop identity, gated membership, typed fallback, phase-correct kill/reap/populated-0 with no surviving in-model PID for both runtimes, and independently labeled Claude-only filtered hardening. A109 rejects A118 or any extra gate as a RunGate. A receipt hash/copy or wrapper/borrowed credential fd never authorizes GO; a pre-kill boundary can never become WorkerTree proof. Missing/dead/mismatched custodian/A110 (RunGate A1c)/runner/A111 (RunGate A1d): BLOCK/STOP before this step. |
| 5 | Implement managed first-prompt admission, durable controller, post-loss cleanup authority, stable hook runtime/installer, deterministic schema, and exact doctor/install contracts; extend the Rust fixture before A121 (RunGate A6)/A122 and rerun complete A127/A128. | `plugins/session-relay/rust/src/appserver.rs`, `plugins/session-relay/rust/src/hook.rs`, `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/src/runtime_install.rs` (new), `plugins/session-relay/rust/src/main.rs`, `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/rust/src/supervisor.rs`, `plugins/session-relay/rust/tests/lifecycle_admission.rs`, `plugins/session-relay/rust/tests/lifecycle_managed.rs`, `plugins/session-relay/rust/tests/lifecycle_controller.rs` (new), `plugins/session-relay/hooks/hooks.json`, `plugins/session-relay/hooks/codex-hooks.json`, `plugins/session-relay/test/appserver-schema-contract.mjs` (new), `plugins/session-relay/test/fixtures/appserver-server-requests.json` (new), `plugins/session-relay/test/rust-test-inventory.mjs`, `plugins/session-relay/test/fixtures/rust-test-inventory.json`, `plugins/session-relay/test/reentry-inventory.mjs`, `plugins/session-relay/test/fixtures/reentry-inventory.json`, `plugins/session-relay/test/lifecycle-smoke.mjs`, `plugins/session-relay/test/fixtures/runtime-doctor-schema.json` (new), `plugins/session-relay/test/fixtures/runtime-doctor-goldens/doctor-ready.json` (new), `plugins/session-relay/test/fixtures/runtime-doctor-goldens/doctor-degraded.json` (new), `plugins/session-relay/test/fixtures/runtime-doctor-goldens/doctor-unavailable.json` (new), `plugins/session-relay/test/fixtures/runtime-doctor-goldens/install-changed.json` (new), `plugins/session-relay/test/fixtures/runtime-doctor-goldens/install-current.json` (new), `plugins/session-relay/test/fixtures/runtime-doctor-goldens/install-lower-no-op.json` (new), `plugins/session-relay/test/fixtures/runtime-doctor-goldens/install-previous-retained.json` (new), `plugins/session-relay/test/fixtures/runtime-doctor-goldens/command-inability.json` (new), `plugins/session-relay/test/fixtures/runtime-doctor-goldens/usage-error.json` (new), `plugins/session-relay/test/fixtures/runtime-doctor-goldens/schema-error.json` (new), `plugins/session-relay/test/fixtures/runtime-doctor-goldens/validation-error.json` (new), `plugins/session-relay/test/fixtures/runtime-doctor-goldens/tamper-error.json` (new), `plugins/session-relay/test/fixtures/runtime-doctor-goldens/io-error.json` (new), `plugins/session-relay/test/fixtures/runtime-doctor-goldens/lock-error.json` (new), `plugins/session-relay/test/runtime-hook-abort.mjs` (modify; created in Step 1b), `plugins/session-relay/test/runtime-hook-upgrade.mjs` (modify; created in Step 1b), `plugins/session-relay/test/selftest.mjs` | 1b-4 | planned | A121 (RunGate A6)/A122/A123/A124 plus post-Step-5 A127/A128 prove every Step-5 authority contract already specified in Interfaces. The fourteen golden filenames are the closed set; no directory allowance exists. `previous_retained` requires an exact retained previous-generation identity, returns `changed:false` and the selected current unchanged; corrupt/mismatched retained generations refuse. Managed CLI fallback, pre-Active turn, arbitrary forwarding, reconnect guessing, bytes after loss, cleanup through normal post-loss FencePermit, non-atomic runtime pair, or standalone adversarial-cache-authenticity claim: STOP. A106 must exact-match this row's mutation set. |
| 6 | Consume Step-5 controller and Step-3c exact-turn handoffs through post-drain `FencePermit`; initialize with experimental API capability; implement finite recursive lineage/turn pagination and exact sealed-ref background-terminal list/terminate; mint one sealed `ProtocolProofAttempt` and require its binding on every nested receipt/evidence hash before `FenceEvidence` construction. The real current Codex adapter must always return `MissingDurableFlushContract`; positive graceful reject/flush/watermark/reap/offline remains fake/future-only; shared scans stay observation-only; physical fallback is cgroup kill. Extend the Rust target fixture before A131. | `plugins/session-relay/rust/src/appserver.rs`, `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/tests/lifecycle_proof.rs` (new), `plugins/session-relay/test/rust-test-inventory.mjs`, `plugins/session-relay/test/fixtures/rust-test-inventory.json`, `plugins/session-relay/test/fake-app-server.mjs`, `plugins/session-relay/test/runtime-appserver-quiescence.mjs` (new), `plugins/session-relay/test/lifecycle-smoke.mjs`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.toml`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.lock` (read-only), `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fabricated-protocol-proof.rs` (new), `plugins/session-relay/test/reentry-inventory.mjs`, `plugins/session-relay/test/fixtures/reentry-inventory.json` | 3c-5 | planned | Fixture extension precedes A131; A125 (RunGate A7)/A126/A131 prove typed experimental-method failure, real runtime ProtocolIncomplete, private attempt-bound fake proof construction, N/N+1 nested-receipt mix rejection, finite pagination, exact terminal termination, later-fence replay rejection, late/continuous writer rejection, and physical fallback. |
| 7 | Add version-CAS lifecycle status/reconcile/release/abandon, cancellation-handoff diagnostics, immutable fence-proof records, crash-resumable `Fenced→TerminalRetained`, stale-fencer rejection, and the one authority-file terminal transaction that jointly advances worker, Managed binding, retired authority, receipt, and optional capacity charge before crash-resumable `ManagedGcDeleting→TerminalFence`. Extend the closed Rust target fixture before A130. Every cancellation/fence/terminal transition consumes exact generation+binding/fence epoch+version/charge authority. | `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/src/cli.rs`, `plugins/session-relay/rust/src/main.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/rust/tests/lifecycle_terminal.rs` (new), `plugins/session-relay/test/rust-test-inventory.mjs`, `plugins/session-relay/test/fixtures/rust-test-inventory.json`, `plugins/session-relay/test/lifecycle-smoke.mjs` | 2-6 | planned | Fixture extension precedes A130. A128-A131 prove crash-after-proof retention resumes exactly once, stale cancellation/fence completion loses, unresolved custody is non-GCable, release matches the stored proof hash, release/abandon races with re-entry/GC have one winner, capacity stays held until the matching terminal receipt and drops once, old registry writers cannot change terminal authority, and GC retains a compact refusal fence without dangling Managed references. Any proved worker is stranded in Fenced, terminalization is cross-file/partial, a risk-accepted runtime id reopens, capacity releases on mismatch, zero/missing target, or any late actor overwrites newer state: STOP. |
| 8 | Verification-only completeness audit over already-landed per-step adversarial matrices; preserve all relay tests and mutate no file. Re-run only repeatable checks: A105, A107, A108, A109, A112, A113, A114, A115, A116, A117, A118, A122, A123, A124, A126, A127, A128, A129, A130, A131, A132, and the Step-8-only A133. Do not replay historical bootstrap gates A101/A102/A103 or one-shot live gates A110 (RunGate A1c)/A111 (RunGate A1d)/A119 (RunGate A5)/A120 (RunGate A5b)/A121 (RunGate A6)/A125 (RunGate A7). A133 invokes the committed validation-only `runner-job-custodian.mjs --rehash-live-evidence` command to emit and verify the closed `LiveEvidenceRehashReceipt` without reconnecting to or waking the completed capability. | Read-only: `plugins/session-relay/rust/src/appserver.rs` (read-only), `plugins/session-relay/rust/src/hook.rs` (read-only), `plugins/session-relay/rust/src/lifecycle.rs` (read-only), `plugins/session-relay/rust/src/process_identity.rs` (read-only), `plugins/session-relay/rust/src/runtime_install.rs` (read-only), `plugins/session-relay/rust/src/supervisor.rs` (read-only), `plugins/session-relay/rust/src/spawn.rs` (read-only), `plugins/session-relay/rust/src/store.rs` (read-only); `plugins/session-relay/test/rust-test-inventory.mjs` (read-only), `plugins/session-relay/test/fixtures/rust-test-inventory.json` (read-only), `plugins/session-relay/test/fixtures/wip-historical-baseline.json` (read-only), `plugins/session-relay/test/fixtures/wip-step-allowlist.json` (read-only), `plugins/session-relay/test/runner-job-custodian.mjs` (read-only), `plugins/session-relay/test/feasibility-probe.mjs` (read-only), `plugins/session-relay/test/supervisor-custody.mjs` (read-only), `plugins/session-relay/test/lifecycle-smoke.mjs` (read-only), `plugins/session-relay/test/process-signal-inventory.mjs` (read-only), `plugins/session-relay/test/reentry-inventory.mjs` (read-only), `plugins/session-relay/test/runtime-hook-abort.mjs` (read-only), `plugins/session-relay/test/runtime-hook-upgrade.mjs` (read-only), `plugins/session-relay/test/runtime-appserver-quiescence.mjs` (read-only), `plugins/session-relay/test/fake-app-server.mjs` (read-only), `plugins/session-relay/test/selftest.mjs` (read-only). | 2-7 | planned | Every listed repeatable check appends its exact Step-8 occurrence in `AcceptanceEventScheduleV1` and passes; A133 emits `LIVE_EVIDENCE_REHASH PASS` and byte-identical verify output, then Step-8 A106 records the empty Git range and final Step-8 event. Offline rehash recomputes every `RunnerAttemptReceipt`, GateResult, OPEN/COMMIT acknowledgement, result/evidence hash, binary/Cargo identity, previous-attempt link, historical bootstrap receipt, prior A106 receipt, and acceptance event through Step 8; it requires final RunGate order A110→A111→A119→A120→A121→A125, terminal `Complete`, and recorded cleanup while making no liveness claim from receipt bytes. Any changed/missing/reordered/forked artifact fails. If audit discovers a missing row/target/case, STOP, return the affected earlier step to planned, remodel its literal mutation allowance, implement there, and rerun that earlier gate; Step 8 never retroactively edits coverage or broadens ownership. Any replay/wake/reconnect of the completed capability, Step-8 mutation, zero/missing target, late-first-introduced case, or historical/future fixture change is a STOP. |
| 9 | Document the accepted guarantee tiers, recovery contract, and exact source-ready release handoff; delete the one stale implementation-branch plan; add exact-SHA Darwin and final-scope verification without binary/release changes. | `plugins/session-relay/AGENTS.md`, `plugins/session-relay/skills/productivity/session-relay/SKILL.md`, `plugins/session-relay/rust/src/main.rs`, `docs/plans/active/relay-worker-lifecycle-primitives.md` (delete stale implementation-branch copy only), `plugins/session-relay/test/fixtures/wip-historical-baseline.json` (read-only verification), `plugins/session-relay/test/fixtures/wip-step-allowlist.json` (read-only verification), `plugins/session-relay/test/run-build-matrix.mjs` (new), `plugins/session-relay/test/final-scope.mjs` (new), `.github/workflows/build-binaries.yml` | 1b-8 | planned | Run A134–A136, commit the exact allowed Step-9 mutations, append Step-9 A106, then run A137–A138. `final-scope` verifies the exhaustive 22-commit/35-entry history map, full append-only step/event ledgers and runner-attempt chain, exact active chain, deterministic 38-row acceptance summary, runner build/state cleanup identity, Step-8 rehash binding, and ordered tree-state fold. A137 appends terminal event 81 and fsyncs the byte-complete `AcceptancePrefixSnapshot` before a digest-bound `AcceptancePrefixReceipt`, while deferring runner-root cleanup; A138's single phase-aware entrypoint runs a nine-barrier synthetic crash matrix, keeps progress outside quarantine, reduces quarantine to its bound sentinel, durably removes sentinel then directory in distinct resumable phases, and only then advances through event82/summary/finalized receipts. The verifier starts at `12cf2ea`, applies historical net state then active receipts, exact-matches every old state, derives base-to-final delta, and byte-compares canonical path/status/mode/oid rows plus final `ls-tree` state against Git. Historical plan A followed by Step-9 D reduces to absence and zero final `docs/plans/**` delta. A138 source-ready derivation matrix validates the closed projector and same-entrypoint recovery at every payload/sentinel/directory removal phase; after the canonical passed completion receipt is archived, the exact post-completion command in Source-ready versus packaged-ready emits the immutable source-tip/receipt projection with `source_ready=true`, `packaged_ready=false`, and `fanout_unblock=false`; no latest-result selection, set union, wildcard, read-only authorization, caller-selected cleanup root, premature receipt cleanup, binary/version/release surface, or unexplained path is accepted. Darwin preserves portable behavior and reports authoritative paths unavailable. |

Every planned row must finish with A106 over its exact `STEP_BASE..STEP_HEAD`; Steps 1c/1d produce authenticated empty-range receipts because they execute already-committed harnesses. In Step 8, `wip-historical-baseline.json` and `wip-step-allowlist.json` are read-only verification inputs, never mutations. In Step 9 those same fixtures remain read-only; the sole plan-path mutation is the authenticated deletion of the implementation-branch copy `docs/plans/active/relay-worker-lifecycle-primitives.md`, represented by one `D` allowlist row with `final_mode:null` and its historical entry hash. The `docs/plans/**` phrase in the task is a zero-delta assertion, not a wildcard mutation allowance. No directory or glob in prose authorizes a mutation.

For cold execution, the following ownership clauses are part of the corresponding table rows. Step 3c creates/migrates all five explicit authority collections, seeds valid cross-referenced records in A113, and proves the exact 0.10.0 writer changes neither their bytes nor the authority generation; A116 proves durable `cancellation_handoffs` reload and rejects dangling/mismatched references. Step 5 owns controller, authorization, and cleanup record persistence/restart behavior plus the fixed-deadline Pending and healthy-stalled Running recovery barriers. Step 7 owns immutable proof-map insertion and same-generation retirement of every matching live authority entry during terminalization. Step 8 runs A133 after its closed repeatable set and then writes the empty-range A106 receipt; Step 9 runs A134–A137 plus A138. These clauses narrow and complete the existing row contracts; they do not add files, change the mutation allowlist, or alter step order.

## Acceptance criteria

Run Node commands from repository root with `PATH="$HOME/.cargo/bin:$PATH"`; every Cargo command explicitly changes directory to `plugins/session-relay/rust/` first so `rust-toolchain.toml` pins Rust 1.85.0. A criterion passes only with its stated evidence; skips, placeholder behavior labels, self-authored booleans, or empty fixtures fail.

`rust-test-inventory.mjs` owns a closed source-derived map for `lifecycle_managed`, `lifecycle_admission`, `lifecycle_supervisor`, `lifecycle_store_compat`, `lifecycle_turn_cancellation`, `lifecycle_controller`, `process_identity`, `lifecycle_proof`, and `lifecycle_terminal`. For each target it parses `cargo test --test <target> -- --list`, requires a nonzero set, compares every required production behavior id to the listed tests, and then parses the executed test summary to require the same nonzero count with zero ignored/filtered required ids. `reentry-inventory.mjs --compile-fail` enumerates the actual sorted `lifecycle-capability-bypass/src/bin/*.rs` set from disk, compares it to its closed expected-boundary fixture, and accepts only the intended privacy/type/trait failure signature for each bin. Cargo exit 0 with zero tests is a hard failure everywhere.

Canonical receipt/inventory IDs are reserved in the disjoint numeric range A101–A138 and serialize in that exact inventory order; chronological executions follow `AcceptanceEventScheduleV1` and may repeat a criterion only at its explicitly listed occurrence. The `Legacy label` column preserves prior historical names for archaeology only; no prose dependency, lifecycle rule, completion claim, or receipt generator may use those labels as acceptance identities. The six compiled native protocol names remain explicitly `RunGate A1c`, `RunGate A1d`, `RunGate A5`, `RunGate A5b`, `RunGate A6`, and `RunGate A7`; they map only to canonical A110, A111, A119, A120, A121, and A125 respectively and are never acceptance IDs themselves. A static Step-1b mapping check parses this table plus the literal event schedule, requires exactly the 38 unique A101→A138 inventory rows, every closed occurrence, and six exact RunGate mappings, and rejects any unqualified legacy acceptance reference or unscheduled execution in step/dependency/completion prose.

| ID | Legacy label | Criterion | Command | Expected |
|---|---|---|---|---|
| A101 | A0 | Verify the one-time clean bootstrap checkpoint before first implementation dispatch. | `test "$(pwd)" = /tmp/docks-primitives-collab && test "$(git branch --show-current)" = codex/primitives-collab && test "$(git rev-parse HEAD)" = 701cea7e671bc40ee23d69abf79ff102e0eecb20 && test -z "$(git status --porcelain)"` | Exit 0 once before implementation. This historical bootstrap precondition is not rerun after work advances or dirties the checkout. |
| A102 | A0b-bootstrap | Authenticate the preserved dirty Step-3b checkout before its missing helper can exist. | Run the exact multi-line **A102 command** in Environment from `/tmp/docks-primitives-collab`. | Exit 0 before any new edit. HEAD, NUL status, binary patch, five explicit untracked paths/modes/digests, and aggregate manifest match the orchestrator-observed values. Any staged/unstaged/untracked path, byte, symlink, or executable-mode change fails. This gate is used only to finish Step 3b. |
| A103 | A0c-step1b-bootstrap | Authenticate the first clean post-Step-3b handoff before the reusable helper exists. | Run the exact multi-line **A103 command** from Environment with orchestrator-recorded `PLAN_COMMIT`, `PLAN_BLOB`, and `STEP3B_HEAD`. | Exit 0 before the first Step-1b edit. Exact main plan snapshot, implementation branch/tip, clean status, and diff check match. Step 1b then commits the helper, immutable historical baseline, and separate closed future-step allowlist; A103 is never reused. |
| A104 | A0b | After Step 1b creates the helper, bind every dispatch to plan snapshot, implementation tip, step allowlist, and exact WIP bytes. | `test -n "$PLAN_COMMIT" && test -n "$PLAN_BLOB" && test -n "$IMPL_HEAD" && test -n "$STEP_ID" && test -n "$WIP_PATCH_SHA256" && test -n "$WIP_UNTRACKED_SHA256" && test "$(git -C /home/vagrant/projects/docks log -1 --format=%H -- docs/plans/active/relay-worker-lifecycle-primitives.md)" = "$PLAN_COMMIT" && test "$(git -C /home/vagrant/projects/docks show "$PLAN_COMMIT:docs/plans/active/relay-worker-lifecycle-primitives.md" \| git hash-object --stdin)" = "$PLAN_BLOB" && test "$(git -C /home/vagrant/projects/docks hash-object docs/plans/active/relay-worker-lifecycle-primitives.md)" = "$PLAN_BLOB" && test "$(git rev-parse HEAD)" = "$IMPL_HEAD" && node plugins/session-relay/test/wip-snapshot.mjs --verify --patch-sha256 "$WIP_PATCH_SHA256" --untracked-sha256 "$WIP_UNTRACKED_SHA256" --allow-step "$STEP_ID"` | Exit 0 before each post-1b worker step. Helper hashes binary HEAD diff and sorted path/git-mode/content manifest, rejects unexpected tracked/staged/unstaged/untracked/symlink/executable/rename/delete entries, and defines canonical clean hashes. New workers review verified WIP before edits. |
| A105 | A0b-matrix | Prove pre-edit WIP binding rejects every dirty/path/mode class rather than trusting prose. | `node plugins/session-relay/test/wip-snapshot.mjs --negative-matrix` | Exit 0 with one named PASS each for tracked, staged, unstaged, untracked, symlink, executable, rename, delete, unexpected path, wrong step, historical overlap without hash, and cleanup; each disposable fixture fails verification for its intended reason and the source checkout remains byte-identical. |
| A106 | A0d | Authenticate every committed step range, including Step 1b immediately after its first commit. | `test -n "$STEP_ID" && test -n "$STEP_BASE" && test -n "$STEP_HEAD" && test -n "$STEP_RECEIPT_DIR" && node plugins/session-relay/test/wip-snapshot.mjs --verify-step-range --step "$STEP_ID" --base "$STEP_BASE" --head "$STEP_HEAD" --historical plugins/session-relay/test/fixtures/wip-historical-baseline.json --allowlist plugins/session-relay/test/fixtures/wip-step-allowlist.json --receipt-dir "$STEP_RECEIPT_DIR"` | Exit 0 with `STEP_RANGE PASS step=<id> ordinal=<n> ... receipt_sha256=<hex>`. Current clean HEAD, exact sentinel dirfd identity, ancestry, literal allowed A/M/D scope, historical hashes, append-only previous/supersession chain, fsync, and receipt digest match. Overwrite/delete/fork/wrong-prev/cross-step supersede/supersede-after-later/narrowed-base/nonancestor-head, read-only mutation, Cargo dependency drift, or unowned committed change fails. |
| A107 | A1 | Full feasibility evidence comes from the migrated committed harness. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/feasibility-probe.mjs --verify-current` | Exit 0; validates raw schema/hash chain; records protocol unavailability, 20s deadline, native process rows, and independent `cooperative_cgroup=<available\|unavailable>` plus `filtered_hardening=<available\|unavailable>` per runtime/platform. Cooperative requires fresh domain/gated placement/manager authority/kill/populated-zero and never requires freeze or seccomp. Filtered hardening records raw clone3 ENOSYS/no-child, legacy denial, policy hash, and real spawn/wait only where advertised. No stale `strong_cgroup` verdict can drive availability. |
| A108 | A1b | Raw Codex API ordering, hook health, stable generation switching, and experimental capability are feasible. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/feasibility-probe.mjs --case codex-managed-boundary && node plugins/session-relay/test/runtime-hook-upgrade.mjs --case stable-generation-pointer --matrix` | Exit 0 with raw transcript: managed SessionStart runs before the `thread/start` response and returns non-claiming success; the returned id becomes a prototype claim candidate; zero `turn/start` request bytes occur before the explicit prototype decision; immediately after that decision the harness sends exactly one harmless `turn/start` request and receives its matching successful response with the same JSON-RPC id/thread id. A zero-turn transcript is a hard failure. This remains `feasibility_only`, not production binding. Hook snapshots and the named generation/pointer crash/race matrix pass; missing auth is unavailable/STOP, never skip. Production Rust claim is A121 (RunGate A6) only. |
| A109 | A1e-custodian-matrix | Prove the native C/D/G protocol, ordered fresh-capability reconstruction, closed syscall/dependency provenance, and immutable-rehash rejection matrix without auth/runtime/cgroup access. | `test -x "$RUNNER_BIN" && "$RUNNER_BIN" --matrix-driver --state-root "$RUNNER_MATRIX_STATE_DIR" --expected-self-sha256 "$RUNNER_BIN_SHA256" --emit "$RUNNER_MATRIX_RESULT" && node plugins/session-relay/test/runner-job-custodian.mjs --validate-matrix "$RUNNER_MATRIX_RESULT" --native-source plugins/session-relay/rust/src/bin/runner_job_custodian.rs && node plugins/session-relay/test/runner-job-custodian.mjs --rehash-negative-matrix --matrix-result "$RUNNER_MATRIX_RESULT" --native-source plugins/session-relay/rust/src/bin/runner_job_custodian.rs && node plugins/session-relay/test/runner-job-custodian.mjs --validate-acceptance-map /home/vagrant/projects/docks/docs/plans/active/relay-worker-lifecycle-primitives.md --plan-blob "" --canonical-range A101:A138 --event-schedule acceptance-event-schedule-v1 --run-gates A110:A1c,A111:A1d,A119:A5,A120:A5b,A121:A6,A125:A7` | Exit 0 with native `RUNNER_MATRIX PASS`, offline `RUNNER_MATRIX_VALIDATION PASS`, then `LIVE_EVIDENCE_REHASH_NEGATIVE_MATRIX PASS`, `ACCEPTANCE_MAP PASS A101..A138`, and `ACCEPTANCE_EVENT_SCHEDULE PASS events=82`. Synthetic positives and every arm/GO/OPEN/COMMIT/reap/adoption/self-fd/result/framing/cleanup negative execute with zero Claude/Codex/cgroup/auth access. The static validator exact-parses the literal phase/occurrence map, its unique ids/scopes and complete criterion coverage; missing/extra/reordered/duplicate occurrence, numeric-order substitution, or latest-result aggregation fails. The literal gate set is exactly A110 (RunGate A1c)/A111 (RunGate A1d)/A119 (RunGate A5)/A120 (RunGate A5b)/A121 (RunGate A6)/A125 (RunGate A7); A118/extra gates fail. Expiry after A119 (RunGate A5), A120 (RunGate A5b), and A121 (RunGate A6) creates a new attempt that must replay its exact prefix before the outstanding gate; every skip fails before authoritative bytes and attempt receipts remain append-only. Offline rehash negatives flip each RunnerAttemptReceipt, GateResult, OPEN/COMMIT acknowledgement, evidence/result hash, binary/Cargo identity, previous-attempt link, bootstrap manifest, prior A106 chain, and acceptance-event link; every row refuses. Offline validation binds the exact Cargo.toml hash and maps every native API to the closed libc/rustix supplier set. Node has no ancestry over C/D/G and no socket/gate/credential/cleanup authority. Matrix scratch is removed; build/live/receipt roots and exact binary identity remain. |
| A110 | A1c | The retained-fd/TRACEEXEC architecture is buildable for both Linux runtimes and sequence 1 proves live job continuity. | Submit the compiled literal RunGate A1c for canonical A110 to the still-live native custodian; no shell/caller argv/env. | `DriverArm→ArmAck→GO→OPEN→COMMIT→GateExit→wait→DriverReapAck` passes with retained self identity and exact armed/spawn/credential/wait/result PID equality. Fixed self/capability/GO/result fds restore CLOEXEC and never reach Node. OPEN binds bootstrap+live tuple before probe bytes; reap-ack alone advances after partial receipt+exec-stop evidence. Both runtime rows prove stopped tracee/fd/proc identity/sentinel behavior and mismatch kill/reap. Copy/no-fd, wrapper/borrower, OPEN-before-arm/GO, self-path retarget, crash/result/framing/reap faults poison before advance. Any mandatory row unavailable is a hard STOP before Step 4. |
| A111 | A1d | The same live custodian supplies sequence 2 while the owner-provisioned Linux job validates writable cgroup-v2 delegation and completes the receipt. | Submit the compiled literal RunGate A1d for canonical A111 to that same custodian. | The full arm/GO/open/commit/reap-ack chain exact-validates the canonical A110 partial receipt produced by RunGate A1c plus live runner/boot/kernel/uid/runtime tuple before delegation bytes. It pins root dirfd/mount/dev/inode, validates domain delegation, creates/removes one leaf, moves and cgroup-kills one stopped child, exact-waits/reaps before `populated 0`, and seals the final receipt. Only DriverReapAck advances to sequence 3. Missing/read-only delegation, poison/replay/crash, zombie, populated mismatch, expiry, sentinel/cleanup fault, or any PID/self/frame mismatch is FAIL/BLOCK, never skip. |
| A112 | A2 | Core pending identity, unmanaged cancellation, and multi-operation lost-authority transitions are atomic, durable, typed, and controller-independent. | `node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_managed && (cd plugins/session-relay/rust && cargo test --locked --test lifecycle_managed -- --nocapture)` | Exit 0 with nonzero source-derived required IDs. Token hashing/pending creation, two-phase generic claim, durable waiter, exact duplicate/refusal, UnmanagedCanceling transfer, crash/reload, worker-only pre-binding refusal, and every typed multi-operation loss/source-state row pass without a Codex controller, app-server, or non-claiming hook assumption. Foreign bindings remain byte-identical; terminal/stale rows are audit-only. |
| A113 | A2b | Lifecycle authority survives old registry writers and crash-durable migration. | `(cd plugins/session-relay/rust && cargo test --locked --test lifecycle_store_compat -- --nocapture) && RELAY_OLD_BIN="$PWD/plugins/session-relay/bin/relay" node plugins/session-relay/test/mixed-version-lifecycle-store.mjs --expect-old-version 0.10.0` | Exit 0 with nonzero migration/commit tests. Exact committed 0.10.0 checksum/version is verified, then same-id/renamed/unrelated register and old GC/hook writer paths may rewrite registry projection but cannot change `lifecycle-v1.json` bytes/generation or managed refusal/status. Missing Entry repairs without authority drift. Crash barriers before/after temp sync/rename/parent fsync expose one complete generation; malformed/missing-after-init authority refuses; migration crash after authority commit resumes without registry rollback. |
| A114 | A3a | Capabilities bind authority and preserve publish-first fencing/attach lifetime. | `node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_admission && (cd plugins/session-relay/rust && cargo test --locked --test lifecycle_admission -- --nocapture) && node plugins/session-relay/test/reentry-inventory.mjs --compile-fail` | All exit 0 with nonzero required IDs. Wrong target is inexpressible and wrong `OperationKind` refuses at use; source finds zero lifecycle-sensitive `exec`; closed launch specs have no raw authority selectors; guard A cannot operate on B. Compile-fail enumerates every `src/bin/*.rs`, fails if one is skipped, and proves each fails at the expected capability boundary rather than an unrelated compiler error. |
| A115 | A3b | Detached watchdog/supervisor own each transition-capable CLI child from birth and preserve attach/wake I/O without depending on the later app-server controller. | `node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_supervisor && (cd plugins/session-relay/rust && cargo test --locked --test lifecycle_supervisor -- --nocapture) && node plugins/session-relay/test/supervisor-custody.mjs --matrix && node plugins/session-relay/test/reentry-inventory.mjs --compile-fail` | Exit 0 with nonzero required IDs. Source-derived portable startup phases inject before/after failure. Rows prove both bootstrap pipes, zero bootstrap fds, independent SID/custody, numeric bind/heartbeat deadlines, CLI Control bind/EOF cancellation, caller death before/after spawn, exact operation/handoff versions, pipe/PTY proxy, kill/wait/reap, compatibility, and zero-byte stale events. No managed Codex token, `ControllerReady`, non-claiming SessionStart, or app-server behavior is required before Step 5. |
| A116 | A3c | Exact-turn and supervisor-owned-child cancellation close the guard-drain cycle within fixed bounds. | `node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_turn_cancellation && (cd plugins/session-relay/rust && cargo test --locked --test lifecycle_turn_cancellation -- --nocapture) && node plugins/session-relay/test/lifecycle-smoke.mjs --case cancellation-custody && node plugins/session-relay/test/reentry-inventory.mjs --compile-fail` | Exit 0 with nonzero required IDs. Send/response/terminal/child-ignore barriers and every lost-authority source/reason/crash row pass. Each custody/handoff CAS checks exact versions; delayed losers audit only. Cancellation interrupts exactly the persisted turn and accepts only matching terminal. Every wait ≤100 ms; one 5s deadline ends terminal/reap/handoff or applies the closed state-specific Unconfirmed path. Guard releases while supervisor retains child authority. |
| A117 | A3d | Every production pre-controller re-entry wrapper is guarded before any mutation-guiding observation and has executed behavior evidence. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case reentry-matrix --phase pre-controller && node plugins/session-relay/test/reentry-inventory.mjs --behavior-evidence --phase pre-controller` | Exit 0; wake/watch admission precedes status RPC, a fence during status discards the response, and fenced first-read preserves mailbox. Every source-derived pre-Step-5 mutator/caller and non-controller `OperationKind` has unique executed success/wrong-kind/stale/pre-fence/mid-block evidence. `unmanaged_initial_turn` maps existing `InitialTurn` only to the legacy spawn→start→pump wrapper; managed `ControllerStartTurn` is forbidden in this phase and added/rechecked by Step 5/A127/A128. First-birth collision refuses and never starts a turn. |
| A118 | A4 | Linux has no check-then-kill path; Darwin preserves only the portable supervisor/observation contract. | `node plugins/session-relay/test/rust-test-inventory.mjs --case process_identity && node plugins/session-relay/test/process-signal-inventory.mjs && (cd plugins/session-relay/rust && cargo test --locked --test process_identity -- --nocapture)` | All exit 0 with nonzero fixture-backed IDs added before this gate. Inventory rejects ObservationOnly/start-check+kill; PID substitution receives zero signal; Linux pidfd-open-before-validation targets only the pinned task; exit proof needs terminal evidence; live unreaped-Child signaling affects only its child. Darwin/no-pidfd and every authoritative managed-controller/fd-exec/cgroup constructor return typed `UnavailablePlatform`/Unconfirmed with zero raw signal. |
| A119 | A5 | Linux tree proof requires same-tracee fd-bound exec-stop placement, same-fence kill evidence, and live sequence 3. | Submit the exact literal `RunGate A5` for canonical A119 frame from Environment. | Direct native-gate PID equality holds across spawn/OPEN/COMMIT/wait/result. OPEN sequence 3 first acknowledges the final sealed receipt input hash and freshly revalidated unexpired runner/boot/kernel/uid/mount/root/runtime tuple/current delegation. Only then may the native gate spawn Node or production `launch_confined` emit a child/ptrace/exec byte. It verifies private host-PID handoff, seized tracee/event PID equality, gated leaf placement, retained-fd exec, exact TRACEEXEC stop, followed procfs magic-link fd fstat/hash equality while stopped, then detach/GO. `O_NOFOLLOW` gets `ELOOP`. COMMIT keeps the same sealed receipt as result and binds the complete containment evidence hash before GateResult/sequence 4. Forged/substituted PID, wrapper/borrowed credential PID, early release, seize/event timeout, wrong event, proc fd/hash mismatch, exec/detach failure, scripts/symlinks, membership mismatch, target sentinel before detach, stale receipt, dead/duplicated capability, wrong/missing COMMIT, or live-field mismatch all kill/reap, poison, and fail. Receipt bytes alone never authorize OPEN/GO. |
| A120 | A5b | The owner-provisioned delegated Linux runner drives BOTH real runtimes through the production confined launcher under live sequence 4. | Submit the exact literal `RunGate A5b` for canonical A120 frame from Environment. | Direct native-gate PID equality holds across spawn/OPEN/COMMIT/wait/result. OPEN sequence 4 binds the final sealed receipt input hash and live revalidation on the same unexpired receipt-bound `RELAY_CGROUP_ROOT` runner from canonical A111 (RunGate A1d) before Node or either real runtime launches. Harness calls production supervisor/`launch_confined`, captures tracee/event/fd/proc-identity/placement and same-fence kill receipts, creates real child/grandchild/storm under leaf, exact-waits/reaps owned roots, and reaches populated-zero. Target sentinel proves no target instruction before detach. A second worker mints a distinct placement receipt. COMMIT keeps the sealed receipt as result and binds the full two-runtime evidence hash before GateResult/sequence 5. Cached/fixture/copied evidence or wrapper/borrowed-fd credentials cannot authorize OPEN/GO; missing/wrong COMMIT poisons. Missing/stale/mismatched runner or capability is BLOCK, not skip; Claude filtered hardening stays separate. |
| A121 | A6 | Real Linux managed admission and durable controller are runtime-correct and fail closed on custody loss under live sequence 5. | Submit the exact literal `RunGate A6` for canonical A121 frame from Environment. | Direct native-gate PID equality holds across spawn/OPEN/COMMIT/wait/result. OPEN sequence 5 binds the final sealed receipt input hash and live runner-receipt/delegation revalidation before Node, pending creation, child, RPC, or fence bytes. Claude barriers pass. Codex pending creation atomically mints one sealed `ManagedBirthPermit`; only its exact Attaching tuple launches once, and replay/wrong tuple emits zero bytes. SessionStart remains non-claiming; controller alone claims Active; transcript has zero `turn/start` before durable Active. Foreign/refusal rows preserve foreign state. After caller exit a second invocation uses one typed result. Every unsupported/unknown/custody-loss row atomically records logical loss plus one exact `LossCleanupPermit`; after publication that permit alone closes stdio, emits no further bytes, kills live retained custody, and bounded-reaps/observes populated-zero. Replay/stale/cross-loss/no-live-custody emits zero bytes; crash cannot remint; success leaves lifecycle unconfirmed and capacity held. COMMIT keeps the sealed receipt as result and binds the complete admission/controller/loss evidence hash before GateResult/sequence 6; missing/wrong COMMIT or credential PID mismatch poisons. No CLI fallback/bypass. |
| A122 | A6a | Managed Codex controller, schema, and command authority are complete after Step 5. | `node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_controller && (cd plugins/session-relay/rust && cargo test --locked --test lifecycle_controller -- --nocapture) && node plugins/session-relay/test/appserver-schema-contract.mjs --verify-current --codex "$(command -v codex)" && node plugins/session-relay/test/reentry-inventory.mjs && node plugins/session-relay/test/lifecycle-smoke.mjs --case reentry-matrix` | Exit 0 with nonzero fixture-backed IDs. Birth permit, token secrecy, pending→thread/start→claim→ControllerReady, caller death, exact retries/loss, `ControllerRead\|ControllerInjectItems\|ControllerStartTurn`, command authorization consumption, cross-family/replay/expiry zero-byte behavior, atomic loss+cleanup-permit mint, exact post-loss consumption, replay/stale/cross-batch refusal, Pending/Running reconcile refusal, watchdog exact timeout-to-Failed with no signal, crash no-remint, and cleanup-success-no-release pass. Schema verification records invoked+canonical native path, uses one retained no-follow fd for generator and server, survives retarget/replacement barriers, canonicalizes `<OUT>`, fixed modes/umask/relative sorting, and proves byte-identical candidates from two temp roots. Exact schema/version/identity matches before pending creation/Active. |
| A123 | A6b | Source-built N/N+1 payloads exercise exact hooks, the honest standalone trust boundary, and fd-pinned crash-atomic monotonic selection. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/runtime-hook-upgrade.mjs --matrix` | Exit 0. Real Codex uses synthetic N/N+1 payloads with exact hook JSON, both manifests, checksums, and hook/payload identities. Old UserPromptSubmit and new/subagent SessionStart execute through stable current; stdout is one hook JSON with exact event suffix. Known-at-check plugin-root/launcher dangling or non-dangling symlink, nonregular object, or wrong executable mode fails; only a root observed truly absent and non-link falls through. Deterministic ordinary-prune barriers delete the real root before the first existence check, after the successful directory check but before launcher validation, after valid launcher checks but before exec, and while initial installer source opens begin; every row either falls through stable only after `! -e && ! -L` or fails visibly, never executes a now-missing path. A deliberate same-UID atomic replace-all row is labeled `outside_standalone_authenticity`, proves no false guarantee, and is not required-denial evidence. After the native installer starts, dirfd/openat barriers rename/recreate every manifest/checksum/hook/payload/selected-binary component; installer either fails or copies/hashes its pinned fd bytes without mixing. A synthetic docks-kit-style proactive row opens the selected payload, independently verifies the retained fd against an external expected digest, invokes `__install-stable` through those same fd-pinned native bytes, and rejects dispatcher/payload digest substitution or path re-resolution before install. Same-version no-op requires equality of version,target,binary,payload,hook; each single-field mismatch is fatal. A lower candidate exactly matching the retained previous identity returns `previous_retained`, `changed:false`, and preserves current; each retained-identity mismatch/corruption refuses. Lock/generation/pointer crash/races pass. Implementation evidence is not packaged evidence. |
| A124 | A6c | Installer and doctor expose the exact closed consumer contract without promoting diagnostics to proof. | `node plugins/session-relay/test/runtime-hook-upgrade.mjs --case doctor-schema` | Exit 0; implementation and schema independently validate all fourteen committed goldens: doctor ready/degraded/unavailable exit 0; install changed/current/lower-no-op/previous-retained exit 0; typed command inability exit 3; usage/schema 2; validation/tamper 4; I/O/lock 5. Unknown capability/reason/extra/malformed field fails. Both payload/hook digests and literal hook inventory fields match; human stderr cannot classify state. |
| A125 | A7 | Real app-server fencing distinguishes exact cancellation, shared observation, current ProtocolTree unavailability, and physical kill under final live sequence 6. | Submit the exact literal `RunGate A7` for canonical A125 frame from Environment. | Direct native-gate PID equality holds across spawn/OPEN/COMMIT/wait/result. OPEN sequence 6 binds the final sealed receipt input hash and live runner/delegation revalidation before Node or any RPC/fence byte; initialize advertises `experimentalApi=true` before descendant/turn/item/terminal methods and records runtime/method availability; unsupported methods fail typed. Exact interrupt reaches matching terminal; each terminal is paged and terminated only through its sealed same-attempt reference. Shared rows remain observation; current dedicated rows report MissingDurableFlushContract. Physical cgroup kill produces only WorkerTree. COMMIT keeps the sealed receipt as result, binds the complete final evidence hash, records both terminal OPEN/COMMIT acknowledgement links, and only then closes the capability as Complete; missing/wrong COMMIT or credential PID mismatch poisons instead. Any later/replayed gate fails. |
| A126 | A8 | Protocol recovery is attempt-bound, terminal-boundary, and finite, with a fake/future positive adapter only. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case appserver-recovery` | Exit 0; fake positive proof requires one attempt binding across flush, thread, turn, terminal, boundary, and evidence hashes plus mutation rejection/watermark/reap/offline pagination. Mixing any nested N receipt into N+1 is rejected before FenceEvidence. Missing/partial evidence and all prior negative rows return ProtocolIncomplete ≤20s. Real Codex cannot construct DurableFlushReceipt. |
| A127 | A9 | Every mutator has a concrete matching capability and executed behavior evidence. | `node plugins/session-relay/test/reentry-inventory.mjs` | Exit 0; scans generic app-server primitives/callers, every drain/resume/inject/start/interrupt/list/terminate, process create/exec/signal, pending acknowledgement, and all Step-5 controller variants. Existing-session actions map to target-free `ReentryGuard`, exact-owned-turn cancellation, or post-drain `FencePermit`; managed first birth maps only to the sealed exact-tuple one-use `ManagedBirthPermit`. Pure reads cannot guide later mutation after stale. Source-derived N is reported; every row has a unique production behavior id; no rationale/name-only or generic “first birth” exemption passes. |
| A128 | A10 | Every production re-entry/controller surface enforces target/kind/binding/cancellation/terminal epoch at use. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case reentry-matrix` | Exit 0 after Step 5 and again after Step 7; one production-wrapper row per source-derived `OperationKind` covers success, wrong kind, stale binding/controller/operation version, pre-fence, and mid-block fence with no-mutation evidence. `InitialTurn` maps only to the legacy unmanaged wrapper; `ControllerRead\|ControllerInjectItems\|ControllerStartTurn` map only to the managed controller. `ManagedTerminal\|ManagedGcDeleting\|TerminalFence` refuse before context/RPC/process bytes. Wake/watch status is admitted and stale responses discarded; queue/peek remain allowed. No placeholder label. |
| A129 | A11 | GC cannot erase durable authority/custody, preserves legacy Unmanaged aging, and never reopens terminal managed sessions. | `node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_managed && (cd plugins/session-relay/rust && cargo test --locked --test lifecycle_managed -- --nocapture)` | Exit 0 with nonzero required GC IDs. Aged lifecycle states plus `UnmanagedCanceling`, pending/Claiming/Managed binding, tombstone, lock, proof, unresolved custody, supervisor/watchdog/socket/heartbeat, handoff, and stale audit survive. Only plain old Unmanaged enters ordinary `GcDeleting`; matching terminal tuples enter `ManagedGcDeleting`, crash-resume projection cleanup, and finish as compact `TerminalFence` while capacity remains released exactly once. Registry Entry loss/recreation cannot change authority; deterministic crash/race barriers preserve one complete authority generation. |
| A130 | A12 | Operator transitions, joint terminalization, retention recovery, session-operation recovery, supervisor reports, custody CAS, and competing fencers are exact-version. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case reconcile && (cd plugins/session-relay/rust && cargo test --locked --test lifecycle_terminal -- --nocapture)` | Exit 0 with nonzero terminal IDs. Crash after durable FenceProofRecord/Fenced resumes exactly once to TerminalRetained; release rejects a different proof hash. Release/abandon versus SessionStart/admission/GC/stale supervisor has exactly one winner; pre-rename crash exposes all preterminal state, post-rename all terminal state, and retry returns the same receipt. Capacity remains Held until the joint worker+binding+retired-authority+receipt CAS and becomes Released once only when every hash agrees. Risk acceptance emits no signal, prints NOT QUIESCENCE-PROVEN, and retains TerminalFence. Session reconcile uses exact binding/operation/current custody version plus stable cancellation epoch; stale completions are audit-only. |
| A131 | A13 | Proof validation and capability families are exhaustive, sealed, scope-safe, epoch/attempt-bound, phase-correct, and threat-model-labeled. | `node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_proof && (cd plugins/session-relay/rust && cargo test --locked --test lifecycle_proof -- --nocapture) && node plugins/session-relay/test/reentry-inventory.mjs --compile-fail` | All exit 0 with nonzero required IDs. Backend×scope×evidence rows pass. Process/protocol/boundary/kill/fence fields are private. Compile-fail auto-enumeration rejects fabrication/mutation at expected boundaries; runtime rows reject later-fence replay, nested attempt mixing, cached authorization, pre-kill promotion, serialized tamper, stale controller/supervisor, cross-thread terminal refs, and host/runtime executable mismatch. Current Codex cannot build offline boundary. |
| A132 | A14 | Existing behavior remains green. | `(cd plugins/session-relay/rust && cargo test --locked) && node plugins/session-relay/test/selftest.mjs` | Exit 0; all Rust tests pass and selftest ends with its runtime-derived PASS count. Ordinary unmanaged hook/output/mailbox bytes remain compatible; attach output remains compatible except the intentional guarded spawn+wait behavior. |
| A133 | A14r | Step 8 cryptographically revalidates completed one-shot evidence without replaying it. | `test -n "$PLAN_BLOB" && STEP8_HEAD="$(git rev-parse HEAD)" && test -n "$STEP8_HEAD" && test -n "$RUNNER_STATE_RECEIPT" && test -n "$RUNNER_RECEIPT_ROOT" && test -n "$STEP_RECEIPT_DIR" && test "$STEP8_REHASH_RECEIPT" = "$RUNNER_RECEIPT_ROOT/step-8-live-evidence-rehash.json" && node plugins/session-relay/test/runner-job-custodian.mjs --rehash-live-evidence --plan-blob "$PLAN_BLOB" --step8-head "$STEP8_HEAD" --runner-state "$RUNNER_STATE_RECEIPT" --runner-receipt-root "$RUNNER_RECEIPT_ROOT" --step-receipts "$STEP_RECEIPT_DIR" --through-step 7 --emit "$STEP8_REHASH_RECEIPT" && node plugins/session-relay/test/runner-job-custodian.mjs --verify-rehash-receipt "$STEP8_REHASH_RECEIPT" --plan-blob "$PLAN_BLOB" --step8-head "$STEP8_HEAD" --runner-state "$RUNNER_STATE_RECEIPT" --runner-receipt-root "$RUNNER_RECEIPT_ROOT" --step-receipts "$STEP_RECEIPT_DIR" --through-step 7` | Exit 0 with `LIVE_EVIDENCE_REHASH PASS receipt_sha256=<hex>` then `LIVE_EVIDENCE_REHASH_VERIFY PASS receipt_sha256=<same-hex>`. Receipt is the exact closed `LiveEvidenceRehashReceipt`; it binds the clean Step-8 head, complete immutable attempt/artifact/bootstrap/prior-A106 chains, and terminal cleanup, emits no live/runtime/process byte, and retry returns the same receipt. Any missing/changed/reordered/forked input, non-Complete terminal, wrong gate order/count, path outside the runner sentinel root, existing-byte mismatch, capability/runtime/auth/cgroup/process access, or liveness claim fails. Step 8 then writes its empty-range A106 receipt with base=head=`STEP8_HEAD`; final scope derives that head from the Step-8 A106 receipt rather than trusting a later environment variable. |
| A134 | A15 | Formatting and warnings are clean. | `(cd plugins/session-relay/rust && cargo fmt --check && cargo clippy --locked --all-targets -- -D warnings)` | Exit 0, no format diff, no warnings. |
| A135 | A16 | Four architectures compile; Darwin runs the portable supervisor and reports authoritative managed paths unavailable. | `node plugins/session-relay/test/run-build-matrix.mjs --ref codex/primitives-collab --sha "$(git rev-parse HEAD)"` | **Owner approval is still required immediately before push/dispatch.** Exact clean remote SHA only. Linux targets compile. Native macos-15-intel and macos-15 run the portable A115 getpeereid/session/PTY/signal/EOF/health/watchdog subset and explicit constructors/status rows proving managed controller, TRACEEXEC fd-exec, pidfd, and cgroup WorkerTree are typed `UnavailablePlatform` with no child/RPC/signal side effect. No Darwin equivalent is advertised. |
| A136 | A17 | Full plugin/repo gates pass. | `node scripts/ci.mjs` | Exit 0 with all repo/plugin guards, Rust, selftest, hooks, skills, and manifests green; documented local binary digest warning only. |
| A137 | A18 | The clean implementation tip equals the ordered historical tree plus active append-only step and acceptance-event receipts and contains no binary/release/docs mutation; runner-receipt cleanup remains deferred until contiguous A138. | `test "$(git branch --show-current)" = codex/primitives-collab && test "$(git rev-parse HEAD)" = "$IMPL_TIP" && test -z "$(git status --porcelain)" && git diff --check 12cf2ea.."$IMPL_TIP" && node plugins/session-relay/test/final-scope.mjs --verify-range --base 12cf2ea --tip "$IMPL_TIP" --historical plugins/session-relay/test/fixtures/wip-historical-baseline.json --allowlist plugins/session-relay/test/fixtures/wip-step-allowlist.json --receipts "$STEP_RECEIPT_DIR" --runner-state "$RUNNER_STATE_RECEIPT" --runner-receipt-root "$RUNNER_RECEIPT_ROOT" --acceptance-events "$RUNNER_RECEIPT_ROOT/acceptance-events" --event-schedule acceptance-event-schedule-v1 --defer-runner-receipt-cleanup --step-order 1b,3c,3d,1c,1d,4,5,6,7,8,9 --root "$FINAL_SCOPE_ROOT" --emit-manifest "$FINAL_SCOPE_ROOT/final-scope-manifest.json" && node plugins/session-relay/test/final-scope.mjs --negative-matrix --base 12cf2ea --tip "$IMPL_TIP" --historical plugins/session-relay/test/fixtures/wip-historical-baseline.json --allowlist plugins/session-relay/test/fixtures/wip-step-allowlist.json --receipts "$STEP_RECEIPT_DIR" --runner-state "$RUNNER_STATE_RECEIPT" --runner-receipt-root "$RUNNER_RECEIPT_ROOT" --acceptance-events "$RUNNER_RECEIPT_ROOT/acceptance-events" --event-schedule acceptance-event-schedule-v1 --defer-runner-receipt-cleanup --step-order 1b,3c,3d,1c,1d,4,5,6,7,8,9 --root "$FINAL_SCOPE_ROOT" && node plugins/session-relay/test/final-scope.mjs --seal-acceptance-prefix --acceptance-events "$RUNNER_RECEIPT_ROOT/acceptance-events" --terminal-events "$FINAL_SCOPE_ROOT/acceptance-events" --event-schedule acceptance-event-schedule-v1 --criterion A137 --emit-snapshot "$FINAL_SCOPE_ROOT/acceptance-prefix-snapshot.json" --emit "$FINAL_SCOPE_ROOT/acceptance-prefix.json"` | Exit 0 with `FINAL_SCOPE PASS ... runner_receipt_cleanup=deferred`, then `ACCEPTANCE_PREFIX_SNAPSHOT PASS events=81 snapshot_sha256=<hex>` and `ACCEPTANCE_PREFIX PASS events=81 through=A137 receipt_sha256=<hex>`. Before the final sub-operation, helper verifies 22 commits/35 entries, the full step ledger/active chain, exact events 1–80, append-only runner-attempt chain, Git ranges, Cargo blobs/supplier map, runner identity/no live PID/fd, and matrix/live cleanup while retaining the runner receipt root for A138. The final sub-operation appends terminal A137 event 81 only after every positive and negative check passes, fsyncs and re-reads the byte-complete ordered event/partial-summary snapshot, then seals a prefix that binds its digest. The final runner attempt carries ordered A110→A111→A119→A120→A121→A125 RunGate evidence. Missing/extra/reordered/duplicated/forked event, wrong occurrence scope, latest-result selection, prefix-snapshot mutation/omission, union/dedup shortcut, extra/reordered/forked step/runner receipt, tree/Cargo mismatch, wildcard, read-only mutation, cleanup escape, premature runner-receipt cleanup, binary/version/release surface, or live process/fd fails. |
| A138 | A18a | Through one phase-aware entrypoint, bind the immutable Step-8 rehash and A137 snapshot+prefix to the same runner/step/event chains, then crash-durably quarantine/remove the exact runner root before emitting terminal A138 and the final 38-row summary. | `node plugins/session-relay/test/final-scope.mjs --a138-crash-matrix --acceptance-prefix-snapshot "$FINAL_SCOPE_ROOT/acceptance-prefix-snapshot.json" --acceptance-prefix "$FINAL_SCOPE_ROOT/acceptance-prefix.json" --root "$FINAL_SCOPE_ROOT/a138-crash-matrix" --step-order 1b,3c,3d,1c,1d,4,5,6,7,8,9 && node plugins/session-relay/test/final-scope.mjs --run-a138 --tip "$IMPL_TIP" --plan-blob "$PLAN_BLOB" --runner-state "$RUNNER_STATE_RECEIPT" --runner-receipt-root "$RUNNER_RECEIPT_ROOT" --receipts "$STEP_RECEIPT_DIR" --acceptance-events "$RUNNER_RECEIPT_ROOT/acceptance-events" --acceptance-prefix-snapshot "$FINAL_SCOPE_ROOT/acceptance-prefix-snapshot.json" --acceptance-prefix "$FINAL_SCOPE_ROOT/acceptance-prefix.json" --step8-rehash "$STEP8_REHASH_RECEIPT" --terminal-events "$FINAL_SCOPE_ROOT/acceptance-events" --state-dir "$FINAL_SCOPE_ROOT/a138-state" --quarantine "$FINAL_SCOPE_ROOT/runner-receipt-quarantine" --emit-acceptance-summary "$FINAL_SCOPE_ROOT/acceptance-summary.json" --step-order 1b,3c,3d,1c,1d,4,5,6,7,8,9` | Exit 0 first with `A138_CRASH_MATRIX PASS barriers=after-prepared,after-quarantine,during-cleanup,after-cleanup,before-sentinel-unlink,after-sentinel-unlink,after-removal,after-event-82,after-summary`, then with `STEP8_REHASH_SCOPE PASS`, `STEP8_REHASH_SCOPE_NEGATIVE_MATRIX PASS`, `SOURCE_READY_DERIVATION_MATRIX PASS`, `RUNNER_RECEIPT_CLEANUP PASS cleanup_sha256=<hex> sentinel_removed_sha256=<hex> quarantine_removed_sha256=<hex>`, `ACCEPTANCE_SUMMARY PASS events=82 criteria=38 receipt_sha256=<hex>`, and `A138_FINALIZED PASS`; an exact retry after any barrier prints the same final hashes. `--run-a138` loads the latest append-only phase receipt before any root access. `no-state` verifies once and writes `Prepared`; `Prepared` renames/recognizes the exact quarantine; `Quarantined` deletes payload while keeping the sentinel and external progress; `CleanupComplete` writes `RemovalPrepared`; `RemovalPrepared` unlinks only the bound sentinel or recognizes the exact sentinel-less empty directory; `SentinelRemoved` rmdirs that directory or recognizes its absence; only `QuarantineRemoved` writes event 82; `Event82Written` writes the removal-bound summary; `SummaryPublished` writes `Finalized`; `Finalized` revalidates the chain and both paths absent. The crash matrix interrupts every named phase including final-sentinel-unlink before rmdir and retries this same entrypoint. Any in-quarantine progress, unbound sentinel-less directory, event82/summary while either path exists, removal without durable cleanup, phase skip/fork, both paths existing, cross-device rename, manifest drift, deleted-root access after QuarantineRemoved, second gate/verifier, missing sentinel/removal hash, or differing retry hash fails. |

The named acceptance rows additionally require these exact Draft-27 closures:

- **A109:** its literal `--rehash-negative-matrix` command flips each RunnerAttemptReceipt, GateResult, OPEN/COMMIT acknowledgement, evidence/result hash, binary/Cargo identity, prior-attempt link, bootstrap receipt, and A106 receipt class; every mutation fails without auth, runtime, cgroup, wake, reconnect, or live-gate replay.
- **A113:** migration creates all five explicit closed authority maps. The mixed-version fixture seeds each with valid cross-referenced records, invokes exact 0.10.0 register/GC/hook writers, and proves neither map bytes nor authority generation changes; missing/dangling/mismatched key, version, hash, or reference fails the whole authority document.
- **A116:** a versioned `cancellation_handoffs` entry survives crash/reload, remains bound to its exact `HandedOff` operation custody, and is retired only in the matching authority transaction; dangling and cross-operation references refuse.
- **A121 (RunGate A6)/A122:** controller, command-authorization, and cleanup records survive restart in their explicit maps. Crash after Pending commit/before permit return reaches exactly one `Failed(PendingPermitExpired)` at the fixed deadline; a late permit/replay emits zero bytes. Running stalled before the first action and after every close/kill/reap boundary reaches exactly one `Failed(RunningDeadlineOutcomeUnknown)` even while health succeeds. Completion-versus-timeout has one CAS winner; late results are audit-only. Wrong version/attempt/boot, pre-deadline timeout, deadline reset, or permit remint changes nothing. Failed does not imply quiescence or release capacity.
- **A129:** every live/referenced entry in all five explicit maps is non-GCable. GC rejects dangling references rather than erasing them and terminal GC retains the compact `TerminalFence` after same-generation retirement.
- **A130:** immutable proof-map insertion/reload and terminal retirement are in the same authority generation as their worker/binding/receipt/charge transitions. Pending/Running block competing terminalization only until their fixed terminal timeout; afterward reconcile or audited abandonment may proceed, while ordinary proved release still requires proof.
- **A137/A138:** final scope validates the rehash receipt against the same immutable complete A110→A111→A119→A120→A121→A125 RunGate attempt chain, full step ledger, empty Step-8 A106 receipt, and events 1–80. A137 appends event 81 and seals a byte-complete surviving snapshot plus digest-bound prefix only after every check. A138's one phase-aware entrypoint loads append-only state before root access, validates once, keeps progress outside quarantine, resumes payload deletion, then durably unlinks the bound sentinel and rmdirs the authenticated empty directory in separate phases before event82/summary; `Finalized` remains mandatory for PASS/source-ready. Nine synthetic barriers include final-sentinel-unlink-before-rmdir. No sentinel-less directory is guessed, no success evidence precedes path absence, no completed capability is replayed, and no repeated criterion is collapsed to its latest result.

## Out of scope / do-NOT-touch

- Fan-out-specific recovery for never-Idle `Stopping`, partial `git worktree remove`, fence-owner lease/steal, cap/depth, handback, merge, and collection remains in `relay-worker-fanout` Draft-5.
- No raw kill fallback is added for Darwin/recovered non-pidfd Linux. Observation-only cleanup is intentionally incomplete and must remain unconfirmed.
- No claim that a merely delegated or partially isolated cgroup is authoritative; privileged/system-wide cgroup setup, root helper, launchd service, kernel extension, or system daemon requires separate approval.
- No claim that WorkerTree contains a deliberately adversarial same-UID task. Broker-assisted spawn or handoff through `systemd-run --user`, D-Bus `StartTransientUnit`, `SCM_RIGHTS`, or another reachable same-user service is outside `CooperativeWorkerV1`. IPC/network namespaces, broker-socket denial, and a full adversarial sandbox are future separate scope.
- No claim that standalone `/bin/sh` bootstrap authenticates cached code against a deliberate same-UID atomic root/launcher/metadata/payload replacement before the native installer starts. Ordinary prune durability, known-at-check corruption refusal, post-start fd pinning, and the optional docks-kit externally verified-native path are the exact scopes.
- No claim that the live runner-job capability is remote attestation or resists a malicious same-UID actor controlling the orchestrator job. It proves non-copyable descriptor continuity and strict sequence under `CooperativeWorkerV1`; a stronger CI-provider identity/attestation service is separate scope.
- No claim that relay controls direct human/third-party app-server clients. Relay gates all of its own surfaces; external mutation remains outside the trust boundary. Only a relay-owned stdio-only dedicated server plus physical containment proves exclusivity.
- Do not kill a shared app-server or promote any of its scans to ProtocolTree proof in this plan. A future barrier API requires a separate acquire/hold/release capability review. Dedicated stdio containment is explicit, never inferred.
- Do not change ordinary unmanaged mailbox semantics, trust fencing, discovery, or the age cutoff for legacy Unmanaged GC; only add the binding-lock/pending-reference safety predicates specified here. Do not change committed binaries, versions, tags, or releases.
- Do not edit `plugins/session-relay/bin/**`: plan acceptance builds native targets but committing generated binaries would mix producer/release work into the source change.
- Do not edit plugin manifests or `.claude-plugin/marketplace.json` / `.agents/plugins/marketplace.json`: no version or release is authorized by this implementation plan.
- Do not edit `docs/plans/active/relay-worker-fanout.md` during implementation. Its fan-out-specific lifecycle design consumes these primitives only after both this plan's source completion receipt and the later immutable `packaged_ready` Session Relay release receipt exist; moving this source plan to `finished/` alone is insufficient.

## Known gotchas

- Opening pidfd **after** a generation check still races; open first, then validate the pinned target.
- An unreaped Child prevents PID reuse but does not prevent descendants escaping its process group. Its proof scope is explicit.
- A new process group is not a new session. On Rust 1.85 use the reviewed async-signal-safe `pre_exec(libc::setsid)` path; `process_group(0)` alone does not detach custody.
- `populated 0` says nothing about a process intentionally migrated outside the leaf. It is authoritative only for the explicit `CooperativeWorkerV1` set: runtime born in the leaf plus ordinary/nested descendants whose membership probes stayed there; intentional same-UID migration is outside the claim.
- Flock writer fairness is not a safety primitive. Fence intent keeps post-intent readers out; cancellation bounds pre-intent readers.
- `attach --exec` closes CLOEXEC locks. Even an Unmanaged attach can become Claiming while its resumed CLI lives, so every transition-capable attach/resume keeps relay as the waiting parent; “managed only” is insufficient.
- An Unmanaged guard is not timeless. First SessionStart must publish Claiming/increment binding epoch, drain older guards, and finalize Managed only after they release; every use re-resolves the epoch.
- Capability targets and kinds cannot be caller arguments. If a lower mutator accepts both a guard and an independent session/thread/process selector, the guard is forgeable by substitution.
- `thread_state` currently calls `thread/resume`; status must use pure `thread/read` or an admitted resume.
- First birth is not session re-entry. Managed Codex app-server birth therefore takes only the sealed one-use `ManagedBirthPermit` minted from its exact Attaching worker/generation/version/tool/cwd/birth-operation tuple; unmanaged hook-born CLI remains a separately classified creation whose collision path rejects an existing fenced id. Existing legacy unmanaged app-server spawn uses `InitialTurn`; after managed Active, every initial/later `turn/start` uses `ControllerStartTurn`, and its returned exact turn id becomes durable custody before pumping.
- `registry.json` is not lifecycle authority. An old 0.10.0 writer may erase unknown registry keys or the projected Entry; only exact-valid `lifecycle-v1.json` controls Managed/terminal/admission/capacity state, and parse failure is never empty-Unmanaged fallback.
- Worker terminal state, Managed binding, retired custody, receipt, and capacity charge are one authority generation. A worker-only `TerminalReleasable`, dangling Managed reference, registry-derived selector, or GC recreation of Unmanaged is unsafe.
- Source-ready is not packaged-ready. No source CI, synthetic A123 payload, plan archive, or local binary can substitute for producer artifacts, verifying checksums, immutable tag/release, and packaged live-upgrade/old-writer evidence.
- App-server `turn/start` may have succeeded when the response is lost. Persist the pending-send state before writing; never erase or guess an unknown active turn.
- `turn/interrupt` completion does not stop background terminals or child threads. Every thread/page/terminal needs evidence.
- A daemonized process can evade app-server terminal bookkeeping. Without authoritative process containment, protocol proof is not WorkerTree proof.
- Two identical lineage passes prove neither completeness nor exclusion. A shared server needs a held mutation-rejecting barrier; a dedicated server needs graceful mutation rejection, durable flush watermark, exit/reap, and final offline scan. Freeze is not a flush.
- A `FencePermit` from an older fence epoch is hostile stale authority after timeout, reconcile, release, or abandon; every fence action and terminal transition must re-resolve/CAS exact version.
- A read-only cgroup mount is bypassable through inherited fds, inherited procfs/alternate mounts, `/proc/<host-pid>/{fd,fdinfo,root,cwd}`, new namespaces, or remount syscalls unless the ordered namespace/proc/fd/seccomp contract closes every direct route.
- Seccomp BPF cannot dereference `clone3`'s pointer argument; filtering namespace flags inside that struct is fictitious. Deny `clone3` wholesale with `SECCOMP_RET_ERRNO|ENOSYS`, **not EPERM**, so glibc `posix_spawn` falls back to legacy `clone`; keep namespace flags denied on that legacy path and prove ordinary spawn/wait for **Claude** under the filter (the Claude-only `FilteredCgroupHardening` tier). **Codex's `bwrap` sandbox needs the denied `unshare`/`mount`, so it cannot run under this filter and uses the unfiltered `ConfinedCgroupCooperative` tier instead** — its containment comes from cgroup membership (namespace-independent) + `cgroup.kill`, not the filter. Validate `seccomp_data.arch`, and on x86_64 reject `__X32_SYSCALL_BIT` before dispatch.
- A same-user broker acts outside the worker's seccomp/cgroup namespace. `populated 0` cannot prove absence of intentionally broker-spawned sibling work; that is an explicit threat-model boundary, not a cgroup proof bug hidden by wording.
- Frozen state can contain queued children or unflushed writes, and tasks may migrate while frozen. Freeze is optional observation only; if used it must end in kill plus `populated 0`, never thaw-through-release or ProtocolTree promotion.
- Cgroup placement evidence exists before GO; kill/populated-zero evidence exists only after fencing. Never put terminal booleans into the immutable live boundary or reuse the A120 (RunGate A5b) fixture transcript as per-worker action proof.
- `/proc/<pid>/exe` is a magic symlink. `O_NOFOLLOW` correctly returns `ELOOP`; the positive exec-stop algorithm follows it only while the exact seized tracee is stopped at its `PTRACE_EVENT_EXEC`, then immediately fstat/hashes the opened fd against the retained executable fd before detach.
- A delegated-runner receipt hash is not a signature or durable attestation. It detects changed canonical evidence bytes only; every later real gate must live-revalidate the same unexpired runner/boot/kernel/uid/mount/root/runtime tuple and current delegation.
- `cgroup.events populated 0` may precede parent reap. A111 (RunGate A1d) and production cleanup must exact-wait/reap every owned probe/root child before accepting populated-zero and removing the leaf.
- Durable logical loss moves the worker to `FencingUnconfirmed`, where a normal `SupervisorFencePermit` is intentionally unavailable. Only the one sealed `LossCleanupPermit` returned by the same loss transaction may close/kill/reap after publication, and even complete cleanup cannot release capacity.
- The hook's invalid-launcher branch is itself a prune race. It must recheck the whole root as truly absent and non-link before stable fallback; an invalid launcher under any still-present/link/non-directory root remains exit 4.
- The final full-range scope gate begins before the future allowlist exists. Preserve the exact historical manifest and its owner commits separately; a path's historical appearance is never a future allowance.
- Claude's event-specific SessionStart documentation is context-oriented while universal `continue:false` is documented globally. Preserve a version-pinned empirical row, but make Claude prompt safety depend on UserPromptSubmit+supervisor; Codex safety depends on withholding `turn/start` until controller claim. Keep explicit 30-second hook timeouts for bounded diagnostics/re-entry.
- Codex plugin enablement does not imply hook health, and `hooks/list` is only a snapshot. Record exact semantic/version/source/hash drift and never relabel it atomic launch authority. `--dangerously-bypass-hook-trust` remains test-only because it would authorize unrelated untrusted hooks.
- A versioned plugin-cache path is not durable across refresh. Codex hooks must execute the stable monotonic runtime; the installer must derive version/digest from plugin manifest+SHA256SUMS and survive crash as either valid old or valid new, never a partial binary/record pair.
- A SessionStart token inherited or repeated for the exact bound session is an idempotency key, not a globally reusable attach credential.
- Managed hook claim must precede current GC/marker/register/drain work. One nearly exhausted three-second lock attempt cannot be followed by more pre-Active lock paths.
- Queue/peek are safe while fenced; drains are not. Refused drains must preserve mailbox bytes exactly.
- GC must inspect lifecycle before deleting **any** candidate surface; preserving only the registry row after deleting locks/tombstones is insufficient.
- Wall-clock stability of a sentinel is supporting evidence only; terminal/process exit and complete pagination remain authoritative.
- `/tmp` and `/home/vagrant/projects` are different filesystems here; `git worktree move` cannot relocate between them. Only remove/re-add an already clean, committed worktree while preserving the exact branch and HEAD.

## Global constraints

- **“FEASIBILITY FIRST. Step 1 must be a research/feasibility spike; design only what the platforms actually allow.”** Current evidence makes absent app-server durable flush and any unavailable cgroup/runtime-spawn capability explicit unavailability, never optimistic proof.
- **“never call git/process/RPC while holding with_lock/with_gc_lock.”** Also never sleep or wait under those locks.
- Keep the global store flock timeout exactly three seconds.
- Target x86_64+aarch64 musl-linux and Darwin builds. The authoritative managed controller/fd-exec/cgroup path is Linux-only in this plan; Darwin must compile and return typed closed unavailability while preserving the portable supervisor-owned-child path.
- Fallback tiers can never claim a stronger scope than their evidence.
- Keep primitives general and independently testable; fan-out is only the first consumer.
- WorkerTree guarantees are bounded to the explicit cooperative-worker threat model unless the owner chooses a future adversarial-isolation expansion.
- Claude managed full-access requires the UserPromptSubmit barrier plus numeric supervisor deadline; Codex managed full-access requires controller-withheld first turn. Any WorkerTree claim additionally requires that runtime's fd-bound physical-containment capability. Hook health remains diagnostic for Codex.
- Never weaken validators, security fences, test assertions, or binary provenance.

## STOP conditions

- `lifecycle-v1.json` is not the sole authority, uses empty fallback, lacks temp+file-fsync+rename+parent-fsync durability, migration scrubs registry before authority commit, any safety decision linearizes across authority and registry, or the exact released 0.10.0 writer changes/reopens managed authority. Old-binary non-erasure is required; claiming full managed behavior from an already-running old executable is forbidden.
- Any of `cancellation_handoffs`, `managed_appserver_controllers`, `managed_command_authorizations`, `loss_cleanup_records`, or `fence_proof_records` is omitted from the closed authority schema, stored in a shadow file/projection, excluded from JCS/generation CAS, left live after matching terminalization, independently GCed while referenced, or accepted with a missing/dangling/cross-family key, version, hash, or reference.
- Release/abandon changes worker without the exact Managed binding/retired-authority/terminal-receipt/optional-charge transaction, frees capacity on any mismatch, races Pending/Running loss cleanup, permits terminal re-entry, or managed GC removes the compact TerminalFence/recreates Unmanaged.
- Loss cleanup can strand Pending after permit-delivery crash or Running under a healthy-but-stalled supervisor; any retry resets the fixed deadline; timeout recovery emits a cleanup/signal/RPC byte, remints authority, wins on a stale version/attempt/boot, changes `FencingUnconfirmed`, constructs proof, or releases capacity; or a late cleanup completion mutates state after losing the terminal CAS.
- Step 8 reruns a historical bootstrap or one-shot A110 (RunGate A1c)/A111 (RunGate A1d)/A119 (RunGate A5)/A120 (RunGate A5b)/A121 (RunGate A6)/A125 (RunGate A7) gate, reconnects to/wakes the completed capability, treats immutable receipts as current liveness, omits a named repeatable check, or accepts a rehash with any changed/missing/reordered/forked evidence/link.
- A poisoned/expired fresh custodian skips any required A110 (RunGate A1c)→predecessor prefix, overwrites an earlier RunnerAttemptReceipt, treats reconstruction as same-capability replay, or A137's final active attempt lacks ordered A110 (RunGate A1c)→A125 (RunGate A7) evidence.
- Source-plan completion, local/source-built artifacts, or synthetic N/N+1 evidence is relabeled packaged-ready or unblocks fan-out before the immutable producer/tag/release/checksum/packaged-matrix receipt.
- One live ancestor-subreaper custodian does not retain exact self/capability/state authority across A110 (RunGate A1c)→A111 (RunGate A1d)→A119 (RunGate A5)→A120 (RunGate A5b)→A121 (RunGate A6)→A125 (RunGate A7); any post-bootstrap role path-execs instead of retained-fd `execveat`; `DriverArm→ArmAck→GO→OPEN→COMMIT→GateExit→wait→DriverReapAck` is reordered, forgeable, uncredentialed, unbounded, or advances before reap; fixed self/capability/GO/result fds are not immediately CLOEXEC or leak to Node/runtime; armed/spawn/OPEN/COMMIT/wait/result PID/self/frame/uid/gid differ; D death does not cause C to adopt/kill/wait G+payload; an authoritative byte precedes GO+OPEN; copied/wrapped/borrowed/replayed traffic succeeds; any malformed/extra/truncated packet/result/credential does not poison; matrix invokes auth/runtime/cgroup or Node launches native roles; build/state/receipt cleanup crosses a sentinel identity; or live receipt/revalidation fails. The current read-only cgroup/no-user-bus sandbox cannot be relabeled positive.
- Node creates or retains the socketpair, receives `SCM_CREDENTIALS`, spawns a credential gate, or supplies any substitute for the native Rust driver/custodian/gate; the native binary is not built from the exact committed `runner_job_custodian.rs` with locked Cargo input; `--matrix` is missing a named positive/negative row; cleanup leaves any native PID/fd/temp alive; or non-Linux silently falls back instead of typed unavailability.
- Claude/Codex authentication preflight is unavailable or not marker-exact; it is never a skip, fixture, zero-turn pass, or reason to weaken isolated-home/auth handling. The orchestrator reverified Claude `loggedIn:true` and Codex ChatGPT login before Draft-23 review, but the implementation worker must repeat the marker-exact A107 preflight in its isolated runner.
- Managed Codex birth lacks the exact-tuple sealed one-use permit, permits replay/cross-worker launch, or requires a fabricated runtime-session guard before `thread/start` returns.
- Any observation/start-time check is followed by raw PID/PGID signal without a live pidfd, unreaped Child, or verified confined-cgroup handle.
- An in-model ordinary/nested/double-fork/fork-storm descendant leaves the worker leaf, or boundary mount/dev/inode/generation/threat-model tag does not match. Intentional same-UID ancestor/sibling migration and broker/SCM_RIGHTS fixtures must be labeled `outside_threat_model`, not required-denial proof or adversarial containment.
- Cooperative placement is non-atomic, the fresh leaf is not exact domain/empty-subtree with writable kill, clone3 errors are generically retried, `EINVAL` falls back without proving valid args plus unsupported feature, stop/GO was not separately proven, an in-model descendant survives outside the leaf, or `populated 0` is claimed while an in-model host-visible PID remains.
- `FilteredCgroupHardening` (Claude-only) setup moves the wrapper after cgroup-namespace creation, retains an inherited procfs mount, exposes host proc/alternate cgroupfs/proc-pid-fd authority, leaks a control fd, omits native arch/x32 validation, lets raw `clone3` create a child or return anything except `-1/ENOSYS`, permits namespace/remount syscalls through legacy paths, or tries to recover proof after losing the exact manager fd. Codex being filtered-unavailable is expected and must NOT reduce its cooperative-tier availability.
- Fence intent is not visible before reader drain, post-intent readers can start external work, a prior operation lacks exact cancellation, or any lifecycle-sensitive attach/resume uses `exec` or releases its guard before supervisor reap/exact custody handoff.
- The transition-capable child is spawned outside the detached supervisor, caller exit drops child authority, supervisor commands accept raw executable/target authority, a stale operation/claim/fence version signals, supervisor loss adopts/reconstructs a Child/PID, watchdogless supervisor death remains Ready/Active, or pipe/PTY stdin/EOF/output/resize/signal/backpressure/disconnect semantics regress.
- Health and control connections lack distinct authenticated first frames, health EOF changes custody, more than one control binds, a child spawns before ControlBound, Ready precedes durable listener/socket/watchdog/thread setup, required thread-spawn errors are discarded, or the supervisor does not enter a real new session.
- A pre-SessionStart unmanaged child cannot be canceled by exact session+binding epoch+operation+version authority, disconnect-vs-Claiming is not one atomic winner, `UnmanagedCanceling` admits new mutation/GC, or an unresolved no-worker operation lacks exact status/reconcile/abandon surfaces.
- A claim waiting behind `UnmanagedCanceling` is not durably bound to its pending token/tuple, cancellation authority changes merely because custody version advances, a crash loses the waiter, or an exact duplicate returns a different committed result.
- `turn/start` does not persist pending-send and exact returned id, cancellation guesses latest/thread-only targets, matching terminal evidence is absent, a stale claim/fence epoch emits an RPC, an individual cancellation block exceeds 100 ms, a guard survives the 5s grace, or a live Child is dropped/waited indefinitely instead of remaining owned by the detached supervisor.
- Admission returns a capability with an independently supplied authority target, fails to bind kind/epoch, or lets an old Unmanaged guard cross Claiming→Managed/Fencing.
- The source-derived inventory finds an unmapped generic mutator/caller, a rationale-only mutation, a placeholder/name-only behavior row, a mutation-guiding status RPC before admission, or a lower API callable without its matching sealed `ReentryGuard`/`ManagedBirthPermit`/`TurnCancellationPermit`/`FencePermit`.
- Any Step-3c/4/5/6 Rust target/case is first added after A116/A118/A122/A131, Step 8 retroactively legitimizes a prior zero-test pass, or `ControllerRead|ControllerInjectItems|ControllerStartTurn` are absent from the enum/matrix/post-Step-5 A127/A128 run.
- Claude first SessionStart or Codex direct app-server claim cannot publish Claiming/increment epoch first, drain older guards, exact-CAS Managed, or reject conflicting/replayed identity/server/controller; duplicate semantics differ from the table; or Codex emits `turn/start` before Active.
- GC removes or makes unreachable any non-releasable worker, pending claim, active operation/custody handoff/supervisor record, session binding, tombstone, fence marker, lifecycle lock, proof, or audit surface.
- Unmanaged GC deletes any surface before exact `GcDeleting` publication, permits pending/Claiming/admission across that state, rolls back after deletion begins, or cannot idempotently resume an exact `gc_epoch` after crash.
- `finish_fence` accepts root/process/protocol evidence for a recorded WorkerTree requirement, or any tracked-tree path returns confirmed.
- A confirmed fence lacks an immutable fence-bound proof record, `Fenced→TerminalRetained` has no idempotent crash-resume path, release accepts a different proof hash, or a setup-time cgroup boundary constructs proof without a same-fence post-kill receipt.
- Any custody/supervisor/fence action or finish/timeout/reconcile/release/abandon transition omits exact operation+handoff+generation+claim/fence epoch+version validation/CAS, or a stale actor changes newer state.
- `FenceIntent`, pidfd-exit/owned-child-reap/cgroup proof is caller-constructible or proof-critical cgroup fields are externally mutable without the private matching supervisor constructor.
- The installed current-Codex adapter constructs `ProtocolTreeProof` or `DurableFlushReceipt`; app-server proof uses live shared/equal scan, `clean {}`, stdio EOF, internal shutdown, freeze, process kill, or unflushed offline artifacts; exact terminal pagination is incomplete; or the 20s deadline expires without `ProtocolIncomplete`.
- Any protocol proof-critical field is publicly constructible/mutable, omits worker/generation/server/supervisor/fence binding, replays across reconcile, or experimental list/filter methods run without negotiated `experimentalApi=true`.
- A107 can pass with fabricated booleans, A120 (RunGate A5b) does not run both real runtimes in recorded live capability/delegation context, A121 (RunGate A6) omits Claude timeout/block or Codex pre-Active zero-turn evidence, A123 omits old+new session ordinary-prune/known-corruption/post-installer-pinning rows or relabels deliberate same-UID replace-all as standalone authenticity, A125 (RunGate A7) never starts real writers, or A127 uses a fixed count/placeholder test id.
- Managed attach performs GC/register/marker/mailbox drain before Claiming publication, waits while holding the global lock, deadline formula exceeds 20s, or global lock timeout is lengthened.
- Managed Codex uses CLI/TUI fallback, treats a hook-health snapshot as atomic spawn authority, uses the hook-trust bypass in production, emits a first turn before direct Active claim, or runs a hook from a pruned versioned path instead of the valid stable runtime.
- The committed Codex hook command begins with a versioned plugin executable, old cached command is not executed verbatim after deleting its whole plugin root, stable install lacks the exclusive owner-checked lock/immutable generation/single atomic pointer, concurrent lower install can overwrite higher, or any crash selects mismatched binary/record bytes.
- A root/launcher symlink, nonregular object, or bad mode already present at its exact shell check is accepted; ordinary prune at a named pre-launch window does not fall through only after the root is observed `! -e && ! -L` or fail visibly; standalone bootstrap claims adversarial same-UID pre-exec cache authenticity; installer validation after native start reopens a source pathname instead of using retained dirfds/fds; selected payload hashing/copying use different fds; post-start rename/recreate barriers mix source generations; the docks-kit proactive path executes before external expected-digest verification; or same-version no-op ignores target/payload/hook identity.
- Schema fixture bytes contain a raw temp path, depend on temp root/mtime/umask/order, generator and managed server do not use the same retained no-follow native fd, or symlink retarget/path replacement selects different bytes after identity validation.
- Managed Codex SessionStart claims/waits/blocks `thread/start`; the original caller owns the active app-server transport; later relay invocation cannot issue a typed guarded command; arbitrary JSON/target forwarding exists; or controller/server/caller failure can reconnect/guess instead of typed loss.
- Unsupported/unknown controller input or custody loss fails to atomically preserve logical loss plus one exact post-loss cleanup record/permit, tries to mint a normal FencePermit after leaving Fencing, accepts replay/stale/cross-loss cleanup, remints after crash, emits bytes after loss, leaves stdio open, omits immediate physical kill/reap when retained authority is live, or lets successful cleanup construct proof/change `FencingUnconfirmed`/release capacity.
- A supervisor/watchdog failure updates only one of multiple matching operations, rewrites an original typed reason, has no already-UnmanagedCanceling/FencingUnconfirmed/terminal row, or a current terminal report mutates lifecycle/custody.
- A102 hashes differ before first repair, the first Step-3b edit precedes that gate, Step 1b starts before clean `STEP3B_HEAD`, `wip-snapshot --negative-matrix` is incomplete, any step omits A106 after committing, A106 accepts an unowned committed-clean mutation, the external receipt chain is missing/forked/reordered, or final A137 accepts dirty/non-current HEAD.
- The historical fixture has other than 35 A/M regular-100644 rows, collapses a multi-owner path, lacks recursively closed byte-sorted `owners/commits`, or hashes anything other than the specified JCS-minus-own-digest bytes. The future fixture contains a read-only mention, glob/directory, non-A/M/D row, wrong final mode, or unauthenticated historical overlap.
- A137 uses wildcard/regex/“seen historically”, omits the exhaustive 22-commit mixed-path owner map, permits receipt overwrite/fork/reorder, uses a set union/dedup instead of ordered tree-state folding, fails old-state or final `ls-tree` equality, accepts an unallowed path/mode/type/gitlink/oid/status, leaves the stale plan or any `docs/plans/**` delta, ignores runner PID/fd/root cleanup, or fails historical/allowlist/ledger/final manifest rehash.
- A108 records zero turn traffic after the prototype decision, sends any `turn/start` before it, or lacks one matching harmless post-decision request/response. The stable-generation/pointer matrix is absent or nondeterministic.
- Shared-server loss has neither actionable status/reconcile nor explicit audited abandonment, or abandonment is presented as quiescence.
- Three attempts repeat the same test/lint failure without a new diagnosis; append `## Mistakes & Dead Ends` and reassess.

## Cold-handoff checklist

1. **File manifest:** present — each step names exact existing/new paths; cited baseline callsites carry checkpoint/path evidence in Sources.
2. **Environment & commands:** present — path-specific plan/blob, exact clean Step-3b head, one-time bridge, recursively closed historical/future fixtures, pre-edit A104 plus post-commit A106 receipts, cross-filesystem handoff, four targets, native Rust custodian build/invocation/cleanup, six literal frames, isolated real-runtime setup/auth STOP, and owner-provisioned delegated Linux prerequisite are explicit.
3. **Interface & data contracts:** present — byte-sorted multi-owner/JCS historical entries, mutation-only A/M/D future rows, immutable per-step and runner-attempt receipts, sole crash-durable lifecycle authority plus five explicit cross-referenced authority maps and repairable legacy projection, exact-tuple ManagedBirthPermit, non-claiming SessionStart/controller claim, fixed-deadline post-loss cleanup with Pending and healthy-stalled Running recovery, joint worker/binding/capacity terminal receipt and permanent terminal fence, stable custody versions, executable-bound cgroup receipts, attempt-bound proof, immutable runtime generations, fourteen exact doctor goldens, tombstone GC, and operator APIs are explicit.
4. **Executable acceptance:** present — canonical A101–A138 are machine-parsed in order and each carries an exact command plus expected evidence. A108 requires one harmless post-decision request and matching response, never a zero-turn pass. Step 8 reruns only its closed repeatable set and offline-rehashes the immutable completed RunGate chain; A137 validates final scope with cleanup deferred, and A138 validates the rehash/source-ready projector matrices before the sole final cleanup.
5. **Out of scope:** present — fan-out specifics, unsafe raw signaling, adversarial same-UID broker isolation, privileged helpers, arbitrary clients, shared-server kill, binaries/releases, and unrelated changes are excluded.
6. **Decision rationale:** present — every non-obvious choice is tied to a red-team defect and failure mode.
7. **Known gotchas:** present — TOCTOU, Unmanaged attach transition, capability substitution, fence epoch, namespace/remount/proc/fd/ABI escape, freeze/unflushed lineage, broker scope, GC, and timing traps are explicit.
8. **Global constraints verbatim:** present — feasibility-first, no external work under locks, targets, and honest tiering are carried forward.
9. **No undefined terms / forward refs:** present — every state, scope, guard, proof, receipt, test harness, and structured question is defined; no TODO/TBD remains.

Adversarial cold-read result: Draft-27 preserves every lifecycle/controller/process/proof/installer/platform contract while closing Draft-24's durable-map and cleanup-recovery gaps, Draft-25's prose-only rehash gap, and Draft-26's acceptance-table/cleanup ordering gap. History has an exhaustive 22-commit mixed-path owner map; future mutations are literal and Step 8 is mutation-empty; A106 and runner attempts are append-only; Step 8 emits a closed offline-rehash receipt rather than replaying the completed capability; contiguous A137/A138 consume it before final cleanup while retaining the ordered tree fold. The runner is native-rooted, retained-self-fd, ancestor-subreaper C/D/G with credentialed Arm/GO/OPEN/COMMIT/reap-ack, auth-free synthetic matrix, bounded channels, and sentinel-separated build/state/receipt cleanup. Node is offline validation-only. Lifecycle authority is single-file, old-writer-safe, and explicitly stores every durable authority family; cleanup has bounded effect-free terminal recovery; terminalization is one authority CAS; source-ready cannot be confused with packaged-ready. Claude and Codex login are currently available but real-runtime preflight remains mandatory at execution. No cold executor must infer owner attribution, mutation status, attempt prefix, dependency supplier, process ancestry, wait authority, terminal capacity behavior, cleanup root, or downstream release readiness.

## Decision log

- **Resolved 2026-07-11** — `threat-model-scope`: owner selected **Option 1, `CooperativeWorkerV1`**. Implementation and acceptance adopt the cooperative model; broker-assisted same-UID evasion is out of scope. See ## Threat model.

- **Resolved 2026-07-11** — `codex-cooperative-cgroup-tier`: the filtered candidate passes Claude but blocks Codex's normal `bwrap` namespace/mount path, so the owner selected **Option A**: a `ConfinedCgroupCooperative` WorkerTree tier for both runtimes and a separate Claude-only `FilteredCgroupHardening` best-effort layer. Primary-source re-review preserves the decision but tightens it: the cooperative proof is gated placement into a fresh domain leaf with empty `cgroup.subtree_control`, retained fd, `cgroup.kill=1`, and `populated=0`; freeze is optional observation. Direct placement classifies `EACCES|EBUSY|EOPNOTSUPP|ENOSYS` plus narrowly validated unsupported-feature `EINVAL` and falls back only to separately proven stop/GO. In-model ordinary/nested descendants must remain in the leaf; intentional same-UID migration/brokers are diagnostic and outside `CooperativeWorkerV1`. Option B and Option C remain rejected.

- **Resolved 2026-07-12** — `codex-managed-boundary`: owner approved replacing managed hook-born Codex CLI with relay-owned dedicated app-server birth. The controller binds the exact `thread/start` id before first `turn/start`; CLI/TUI/third-party fallback is unmanaged and never inherits the guarantee.

- **Resolved 2026-07-12** — `stable-hook-runtime-ownership`: Docks/session-relay owns standalone ordinary-prune durability, corruption checks, and the monotonic post-start installer because plugin operation cannot depend on another repo. Standalone does not claim adversarial cache authenticity. docks-kit may proactively deploy the same interface through its stronger external-digest/direct-native path and expose status, but remains optional rather than the sole runtime owner.

## Self-review
Review-receipt: {"S":{"raw":{"attempts":[{"child_id":"exec-session-42807","denial_source":null,"effort":"high","exit_code":143,"model":"fable","output_started":false,"reason":"Claude reviewer exceeded the 600-second deadline with no output","result":"deadline_exceeded","retry_cause":null,"schema":1,"signal":null,"started":true,"stderr_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","stdout_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","timeout_mode":"orchestrator_tool","timeout_seconds":600,"transport":"cli"}],"decision_evidence":null,"findings":[],"findings_sha256":null,"leg":"S","reason":"Claude reviewer exceeded the 600-second deadline with no output","request":{"acceptance_inventory_sha256":null,"author":{"company":"anthropic","effort":"max","model":"opus","tool":"claude-code"},"bundle_sha256":"a2bf7a646ae6b6eecf2b3942c5344adbd4e22eb4432efc27e2f6f95bcb9c3d20","diff_sha256":null,"execution_base_commit":null,"input_sha256":"9a79ddc38b5203b5e94173ac6f704e41a0c64a689c9c453386167f4609bb653c","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"max","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"skill_default","cross_company_consent":"runtime_global","openai_tiers":"skill_default","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"5f788dfdaa23f145c734213ebcd8d11d0acc85721cac57961436ee54ed0b023a","request_id":"5d1b9781-ed63-4853-a4f4-6eb311496d9e","reviewed_commit_or_head":"4cb0121c6a1cdbe0eb841b043ac2173542b29673","schema":1},"result":"timed_out","reviewer_output":null,"schema":1,"selected":null,"severity_totals":{"high":0,"low":0,"medium":0},"waiver":null,"waiver_sha256":null},"reconciliation":{"accepted":[],"rejected":[]},"request":{"acceptance_inventory_sha256":null,"author":{"company":"anthropic","effort":"max","model":"opus","tool":"claude-code"},"bundle_sha256":"a2bf7a646ae6b6eecf2b3942c5344adbd4e22eb4432efc27e2f6f95bcb9c3d20","diff_sha256":null,"execution_base_commit":null,"input_sha256":"9a79ddc38b5203b5e94173ac6f704e41a0c64a689c9c453386167f4609bb653c","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"max","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"skill_default","cross_company_consent":"runtime_global","openai_tiers":"skill_default","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"5f788dfdaa23f145c734213ebcd8d11d0acc85721cac57961436ee54ed0b023a","request_id":"5d1b9781-ed63-4853-a4f4-6eb311496d9e","reviewed_commit_or_head":"4cb0121c6a1cdbe0eb841b043ac2173542b29673","schema":1}},"X":{"raw":{"attempts":[{"child_id":"/root/draft34_formal_x","denial_source":null,"effort":"xhigh","exit_code":0,"model":"gpt-5.6-sol","output_started":true,"reason":"completed","result":"passed","retry_cause":null,"schema":1,"signal":null,"started":true,"stderr_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","stdout_sha256":"0297cc7fedf95577aad60ac7bbd2b8fbe074f6485c8c506472df56e96e77d9aa","timeout_mode":"orchestrator_tool","timeout_seconds":600,"transport":"in_session"}],"decision_evidence":null,"findings":[],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","leg":"X","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"anthropic","effort":"max","model":"opus","tool":"claude-code"},"bundle_sha256":"a2bf7a646ae6b6eecf2b3942c5344adbd4e22eb4432efc27e2f6f95bcb9c3d20","diff_sha256":null,"execution_base_commit":null,"input_sha256":"9a79ddc38b5203b5e94173ac6f704e41a0c64a689c9c453386167f4609bb653c","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"max","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"skill_default","cross_company_consent":"runtime_global","openai_tiers":"skill_default","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"5f788dfdaa23f145c734213ebcd8d11d0acc85721cac57961436ee54ed0b023a","request_id":"5d1b9781-ed63-4853-a4f4-6eb311496d9e","reviewed_commit_or_head":"4cb0121c6a1cdbe0eb841b043ac2173542b29673","schema":1},"result":"passed","reviewer_output":{"confirmations":["The sealed manifest is internally consistent: all 22 exported file SHA-256 values match, all 82 requested file-or-tombstone states match, plan.review.md matches input_sha256, and the bundle is read-only.","A138 cleanup keeps the quarantine sentinel-only while all progress and phase receipts remain under the separate final-scope a138-state directory; manifest-driven resume accepts only an exact remaining payload subset and rejects unexpected bytes.","RemovalPrepared durably binds the sentinel bytes and hash, quarantine directory identity, empty payload state, and parent identity before unlink; a crash after unlink is recoverable only as the exact sentinel-less empty directory, after which SentinelRemoved alone authorizes rmdir.","QuarantineRemoved is recorded only after rmdir and parent fsync, and it alone permits event 82; event 82, the final summary, Finalized, completion evidence, and source-ready projection therefore cannot precede durable quarantine removal.","The literal schedule mechanically contains exactly 82 unique occurrences: 80 before A137, terminal A137 as event 81, and A138 as event 82. The acceptance table contains exactly 38 unique rows A101 through A138, and the summary contract preserves every scheduled occurrence per criterion rather than collapsing repeated checks."],"score":100,"structured_output_sha256":"0297cc7fedf95577aad60ac7bbd2b8fbe074f6485c8c506472df56e96e77d9aa","verdict":"ready"},"schema":1,"selected":{"effort":"xhigh","model":"gpt-5.6-sol","transport":"in_session"},"severity_totals":{"high":0,"low":0,"medium":0},"waiver":null,"waiver_sha256":null},"reconciliation":{"accepted":[],"rejected":[]},"request":{"acceptance_inventory_sha256":null,"author":{"company":"anthropic","effort":"max","model":"opus","tool":"claude-code"},"bundle_sha256":"a2bf7a646ae6b6eecf2b3942c5344adbd4e22eb4432efc27e2f6f95bcb9c3d20","diff_sha256":null,"execution_base_commit":null,"input_sha256":"9a79ddc38b5203b5e94173ac6f704e41a0c64a689c9c453386167f4609bb653c","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"max","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"skill_default","cross_company_consent":"runtime_global","openai_tiers":"skill_default","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"5f788dfdaa23f145c734213ebcd8d11d0acc85721cac57961436ee54ed0b023a","request_id":"5d1b9781-ed63-4853-a4f4-6eb311496d9e","reviewed_commit_or_head":"4cb0121c6a1cdbe0eb841b043ac2173542b29673","schema":1}},"author":{"company":"anthropic","effort":"max","model":"opus","tool":"claude-code"},"decision_evidence":null,"input_sha256":"9a79ddc38b5203b5e94173ac6f704e41a0c64a689c9c453386167f4609bb653c","outcome":"single","phase":"draft","policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"max","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"skill_default","cross_company_consent":"runtime_global","openai_tiers":"skill_default","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"5f788dfdaa23f145c734213ebcd8d11d0acc85721cac57961436ee54ed0b023a","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"anthropic","effort":"max","model":"opus","tool":"claude-code"},"bundle_sha256":"a2bf7a646ae6b6eecf2b3942c5344adbd4e22eb4432efc27e2f6f95bcb9c3d20","diff_sha256":null,"execution_base_commit":null,"input_sha256":"9a79ddc38b5203b5e94173ac6f704e41a0c64a689c9c453386167f4609bb653c","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"max","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"skill_default","cross_company_consent":"runtime_global","openai_tiers":"skill_default","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"5f788dfdaa23f145c734213ebcd8d11d0acc85721cac57961436ee54ed0b023a","request_id":"5d1b9781-ed63-4853-a4f4-6eb311496d9e","reviewed_commit_or_head":"4cb0121c6a1cdbe0eb841b043ac2173542b29673","schema":1},"reviewed_at":"2026-07-12T16:55:26-03:00","reviewed_commit":"4cb0121c6a1cdbe0eb841b043ac2173542b29673","schema":1}

Score: **99/100 (Draft-35 execution-blocker clarification; schema-v1 review pending)** · trajectory **98 Draft-34 author → 100 X READY single-review outcome → implementation-found mutation grammar ambiguity → 99 Draft-35 literal mutation grammar** · stopped: **only the reproduced machine-parsing blocker is repaired; implementation remains paused until this exact snapshot is review-eligible**.

**Draft-34 bounded repair (2026-07-12T16:41:50-03:00):** the exact sealed Draft-33 X leg scored 87 NOT READY with one high finding; direct reproduction accepted it. The quarantine retained its sentinel and progress receipts yet later required a literally empty directory, leaving final-file-unlink before rmdir unauthenticated across crash. Draft-34 moves every progress receipt outside quarantine, defines CleanupComplete as sentinel-only, and adds `RemovalPrepared→SentinelRemoved→QuarantineRemoved`. RemovalPrepared binds the final sentinel plus exact directory/parent identity; retry after sentinel unlink accepts only that same fixed path as a literally empty exact dev/inode/owner/mode directory; SentinelRemoved alone authorizes rmdir, and QuarantineRemoved alone permits event 82. The ninth crash barrier targets final-sentinel-unlink before rmdir. Goal/deliverable/completed receipts/step order remain byte-unchanged.

**Draft-35 bounded execution-blocker repair (2026-07-12):** Step-1b implementation and two independent read-only reviews proved that the sealed Draft-34 future-fixture contract could not mechanically derive exact mutation rows: `final_mode` had no rule, Step 3c's unscoped `read-only` preceded required/new mutations, Step 8 used forbidden shorthand, and compile-fixture lockfiles were undecided. This repair adds one normative per-item grammar, fixes Step 3c's path-local read-only annotations, declares Step-3c/4/6 fixture locks read-only while their manifests mutate, expands every Step-8 path, fixes every future mode to non-executable `100644`, and requires projected-state parsing from the pinned plan blob. Goal, deliverables, completed historical receipts, acceptance schedule, step order, runtime design, and release contract remain byte-unchanged.

**Draft-33 bounded repair (2026-07-12T16:32:23-03:00):** the exact sealed Draft-32 X leg scored 87 NOT READY with one high finding; direct reproduction accepted it. CleanupComplete previously permitted event 82 and summary before the empty quarantine directory was removed, so a persistent removal failure could leave durable success evidence without A138 PASS. Draft-33 inserts `RemovalPrepared→QuarantineRemoved` before event 82. RemovalPrepared binds and authorizes idempotent removal plus parent fsync; a crash after removal is recognized only from that exact phase and cleanup chain. Event 82, the 38-row summary, completion evidence, and source-ready all require QuarantineRemoved; A138 PASS additionally requires Finalized and continued absence of both paths. The crash matrix adds immediately-before/after-removal barriers and forbids any met/summary artifact while either path exists. Goal/deliverable/completed receipts/step order remain byte-unchanged.

**Draft-32 bounded repair (2026-07-12T16:22:45-03:00):** the exact sealed Draft-31 X leg scored 87 NOT READY with one high finding; direct reproduction accepted it. A crash immediately after pending fsync but before cleanup left the original root present, while the binary pending/no-pending branch could falsely continue to event 82. Draft-32 replaces that boolean with an append-only six-phase receipt chain: `Prepared→Quarantined→CleanupComplete→Event82Written→SummaryPublished→Finalized`. The same A138 entrypoint validates once, atomically renames the same-device root to a fixed identity-checked quarantine, resumes fd-relative manifest-driven deletion across crashes, and cannot write event 82 until an empty verified quarantine produces durable cleanup evidence. Its crash matrix covers after Prepared, after rename, during deletion, after cleanup, after event 82, and after summary; every retry must finish with identical hashes and both original/quarantine paths absent. Goal/deliverable/completed receipts/step order remain byte-unchanged.

**Draft-31 bounded repair (2026-07-12T16:13:35-03:00):** the exact sealed Draft-30 X leg scored 87 NOT READY with one high finding; direct reproduction accepted it. Although surviving bytes were sufficient, retrying A138's shell chain still failed on its initial deleted `STEP8_REHASH_RECEIPT` test before reaching resume logic. Draft-31 replaces that chain with one literal `--run-a138` entrypoint that checks the exact pending record before any runner-root test/open/verifier. The fresh branch performs every root-dependent positive/negative/source-ready check and fsyncs their hashes into pending before cleanup; the matching resume branch skips them and uses only final-scope snapshot, prefix, pending, terminal-event state, and summary path. A preceding synthetic `--a138-crash-matrix` invokes that same entrypoint after cleanup and after event 82, requiring byte-identical output and zero deleted-root access. Goal/deliverable/completed receipts/step order remain byte-unchanged.

**Draft-30 bounded repair (2026-07-12T16:04:46-03:00):** the exact sealed Draft-29 X leg scored 84 NOT READY with one high finding; direct reproduction accepted it. A137's prefix previously retained only hashes, so a crash after A138 deleted events 1–80 but before summary publication could authenticate yet not reconstruct their bytes. Draft-30 makes A137 fsync and re-read a byte-complete ordered `AcceptancePrefixSnapshot` containing events 1–81 and partial A101–A137 summaries before it emits a digest-bound prefix. A138 binds the snapshot digest in its pending intent and reconstructs the final 38 summaries solely from that surviving snapshot plus cleanup-bound event 82. Explicit crash barriers immediately after cleanup and after event 82/before summary must resume byte-identically without reading the deleted root. Goal/deliverable/completed receipts/step order remain byte-unchanged.

**Draft-29 bounded repair (2026-07-12T15:55:18-03:00):** the exact sealed Draft-28 X leg scored 86 NOT READY with one high finding; direct reproduction accepted it. Canonical A101–A138 were incorrectly described as chronological execution order even though the fixed dependency graph intentionally runs higher IDs before lower IDs and reruns A104/A106/A127/A128/A131 plus the Step-8 repeat set. Draft-29 preserves every step and RunGate but defines one closed 82-occurrence `AcceptanceEventScheduleV1`, append-only unique event receipts in dependency order, and deterministic aggregation into exactly 38 criterion-summary hashes in inventory order. A109 statically validates the map; Step 9 now explicitly commits and records A106 before final A137/A138; A137 seals event 81/prefix only after its checks; A138 crash-durably binds cleanup into event 82 and the final summary before source-ready projection. Missing/extra/reordered/forked occurrences and latest-result selection fail. The still-running Anthropic Fable/high leg was dispatched on the rejected sealed input and cannot make Draft-29 current. Goal/deliverable/completed receipts/step order remain byte-unchanged.

**Draft-28 bounded repair (2026-07-12T15:29:23-03:00):** the exact sealed Draft-27 X leg scored 82 NOT READY with two findings; direct reproduction accepted both. X1 found that canonical A1–A38 collided with numeric-looking legacy labels and left remote CI, Step 9, Step 8, and completion ranges ambiguous. Draft-28 moves canonical IDs to the disjoint A101–A138 range, translates executable Environment/Steps/Interfaces/acceptance/STOP/handoff prose, preserves six explicitly named RunGates with a closed mapping, and adds a static A109 mapping check; historical labels remain only in the descriptive column and Self-review history. X2 found that `source_ready` named no durable receipt authority. Draft-28 binds the immutable schema-v1 `Completion-review-receipt:` line at the exact date-prefixed archive path returned by ship, defines a closed deterministic `SourceReadyHandoffReceipt` projection and exact post-completion command, adds wrong-prefix/path/date/commit negatives to A138's synthetic derivation matrix, and requires the later packaged receipt to carry the source-ready hash. The Anthropic Fable/high leg timed out at 600 seconds without a verdict; because X already rejected this sealed draft, no fallback result is relabeled green. Goal/deliverable/completed receipts/step order remain byte-unchanged.

**Draft-27 bounded repair (2026-07-12T15:05:43-03:00):** the second final-diff audit accepted Draft-26's receipt/command semantics but found A18a outside the Markdown acceptance table and ordered after A18's final runner-receipt cleanup. The finding is accepted. Draft-27 keeps A18a contiguous in the canonical table, makes Step 9 explicitly require A15–A18a, has A18 validate final scope with runner-receipt cleanup deferred, and has A18a consume plus mutation-test the rehash receipt before the sole sentinel-bound final cleanup. Step-8 head is derived from its empty A0d receipt and checked as an ancestor of final tip; no later environment variable is trusted. The legacy completion table is also migrated to current schema: canonical numeric IDs A1–A38, exact `Expected` header, escaped internal pipes, and a separate unique Legacy-label column preserve every protocol/gate name. The final fresh-context audit returned READY, independently parsed all 38 rows, and found no circular dependency or new contradiction. Goal/deliverable/completed receipts/order remain byte-unchanged.

**Draft-26 bounded repair (2026-07-12T14:52:15-03:00):** a fresh-context final-diff audit accepted Draft-25's durable-map and cleanup-recovery closures but found Step 8's replacement rehash path remained prose-only: no closed receipt, literal command, actual A1e negative invocation, or explicit final-scope consumer. The finding is accepted. Draft-26 defines the fsync-durable closed `LiveEvidenceRehashReceipt` at the exact sentinel-bound path, adds A1e-custodian-matrix's literal mutation matrix, A14r's exact emit+verify command and outputs, and A18a's independent final-scope binding plus negatives. Step 8 runs only the closed repeatable set, A14r, then empty-range A0d; Step 9 runs A15–A18a. No live gate, capability, runtime, auth, cgroup, or process handle is reopened, and Goal/deliverable/completed receipts/order remain byte-unchanged.

**Draft-25 bounded repair (2026-07-12T14:37:52-03:00):** exact sealed Draft-24 bundle `c287be60ee87cf68f2c0636c9d5261f937011eae90931ac66fee796f1860c019` received X score 84 NOT READY with three findings; an independent fresh-context reproduction accepted X1–X3 and confirmed none makes the Goal/deliverable unbuildable. X1 is closed by five explicit canonical authority maps with same-generation cross-reference, migration, terminal-retirement, GC, and old-writer invariants. X2 is closed by one boot-bound fixed cleanup deadline plus effect-free exact-CAS recovery for permit-delivery-crashed Pending and healthy-but-stalled Running, with late authority/results unable to act or release capacity. X3 is closed by an explicit repeatable Step-8 set and validation-only offline rehash of the immutable completed A1c→A7 chain; completed capability replay remains forbidden. Anthropic Fable/high and Opus/max direct CLI attempts each timed out at 600 seconds without schema-valid output and are recorded unavailable, never green. Existing completed step receipts, statuses, dependency order, Goal, deliverable, and mutation ownership remain unchanged; implementation resumes only after a fresh sealed review returns eligible READY evidence.

Cross-check (2026-07-12): [X: openai gpt-5.6-sol xhigh] accepted X1 missing closed durable collections, X2 unrecoverable Pending/healthy-stalled Running windows, X3 impossible Step-8 one-shot replay; [S: anthropic fable high then opus max] both timed out/unavailable with no verdict; [gpt-5.6-sol orchestrator + fresh-context reproducer] independently accepted all three against the exact sealed bundle and separately reviewed the bounded repair design.

**Draft-24 bounded repair (2026-07-12T13:53:50-03:00):** the sealed Draft-23 X/S pair both returned NOT READY. All nine findings are accepted after independent reproduction; S3's claim about missing dependencies and S4's claim that `InitialTurn` was implementation-orphaned were corrected against exact `STEP3B_HEAD`, while their cold-handoff mapping gaps remain accepted. Draft-24 moves lifecycle authority out of the old-writable registry into crash-durable `lifecycle-v1.json`, adds an exact 0.10.0 mixed-writer matrix, defines one joint worker/binding/retired-authority/receipt/capacity terminal CAS plus permanent terminal fence, and makes source-ready distinct from immutable packaged-ready/fanout unblock. It closes duplicate A/M ownership, fresh-custodian prefix reconstruction and attempt receipts, exact Cargo hashes/syscall suppliers, unmanaged `InitialTurn` versus managed `ControllerStartTurn`, A4's local/non-gate identity, and the fourteenth `previous_retained` golden. Existing completed step receipts and canonical future order remain unchanged; implementation resumes only after a fresh sealed review returns READY.

Cross-check (2026-07-12): [X: openai gpt-5.6-sol xhigh] 3 findings — accepted X1,X2,X3 / rejected none; [S: anthropic fable high] 6 findings — accepted S1,S2,S3,S4,S5,S6 / rejected none (S3/S4 factual premises corrected against `2a864e9`, repair retained); [gpt-5.6-sol orchestrator] independently reproduced every id against sealed input and exact implementation head before accepting.

**Draft-23 bounded repair (2026-07-12T12:55:36-03:00):** two fresh-context `gpt-5.6-sol` reviews independently reproduced nine Draft-22 defects and rejected execution. All are accepted. Draft-23 makes the native binary—not Node—the A1e root; separates immutable build from matrix/live/receipt scratch; retains verified self bytes for `execveat`; makes the foreground custodian an ancestor subreaper; adds credentialed `DriverArm→Ack→GO` before OPEN and exact reap acknowledgement after COMMIT; closes packet/fd/result bounds; and makes A1e synthetic/auth-free. It replaces authored historical ownership with an exhaustive 22-commit first-parent map including mixed `cdc70f0`/`701cea7`, makes Step 8 read-only, uses append-only superseding receipts, sentinel-binds every temp root, and replaces A18's invalid set union with ordered tree-state folding plus exact Git/tree equality. It also migrates legacy author/execution-base frontmatter to the v0.12.3 review contract. Goal and deliverable are byte-unchanged. A prior Relay-based Claude export attempt was authoritatively `platform_denied`; under v0.12.3 it is not retried, one available reviewer is sufficient, and current direct Claude/Codex authentication is separately available for the portable schema-v1 runner.

**Draft-22 bounded repair (2026-07-12T05:19:13-03:00):** pre-edit reproduction found exactly 35 historical A/M regular-100644 rows, real paths owned across Steps 2/3a/3b, no Node 24 socketpair/`SOCK_SEQPACKET`/`SCM_CREDENTIALS` API, missing executable negative/range matrices, Claude `loggedIn:false`, and Codex ready. Draft-22 replaces single-owner history with recursively closed byte-sorted `owners[{step,commits}]` plus exact JCS-minus-own-digest hashes; makes future authorization exact mutation-only A/M/D rows with thirteen named doctor goldens, read-only Step-8/9 fixture mentions, and one Step-9 stale-plan deletion; adds post-step A0d receipts and ordered A18 recomputation; binds every requested matrix to a command; moves socketpair/credential/gate authority into one pinned Rust autobin with Node validation-only; and requires A1b to send and receive one harmless turn only after the prototype decision. Authentication remains mandatory external evidence. Goal, deliverable, and all Draft-21 lifecycle/process/controller/proof/installer/platform authority contracts are unchanged.

**Draft-20 immutable acceptance re-review (superseded candidate):** exact commit `d86f418b1a6e2755f988fad984bf1dd876495047`, plan blob `5960fcc4eb0e9236c959588de4338cb199427bbf`, score **95/100, NOT READY**. It accepted the honest hook boundary, two-phase runner receipt order, live inherited capability, LossCleanupPermit, ManagedBirthPermit, inventory/A18, and platform contracts. Its sole HIGH blocker was gate-PID executability: acceptance described shell environment assignments as argv, did not close RunGate environment injection, and did not prove that the driver-spawn PID was the same credential sender at both OPEN and COMMIT.

**Draft-21 bounded repair (2026-07-12T04:03:59-03:00):** defines six literal compact-JCS RunGate rows with exact Node script/args, literal base names, sealed auth names, and closed allowlisted env sources; arbitrary executable/cwd/env/shell syntax or ambient inheritance is inexpressible. The driver directly spawns a committed native credential gate, passes one fixed capability fd only for that spawn, and the gate restores CLOEXEC as its first fd action before validation, OPEN, or Node spawn. Every positive binds `driver_spawn_pid == OPEN SCM_CREDENTIALS.pid == selectors.gate_pid == COMMIT SCM_CREDENTIALS.pid == exact_wait_pid == GateResult.pid`. Non-exec shell wrappers and sibling borrowers fail the PID check, poison before Node/authoritative bytes, and cannot COMMIT. The two-phase receipt/evidence contract and all other Draft-20 invariants remain unchanged.

**Draft-19 immutable acceptance re-review (superseded candidate):** exact commit `7a32b46c0af503e96acb2e9d2514228e4e0db74b`, plan blob `f26d730e4d83f6389593f4625057befe17f5cfcd`, score **92/100, NOT READY**. It reproduced A0b-bootstrap and shell/source syntax, accepted the honest standalone-hook boundary, live inherited `SOCK_SEQPACKET` capability, LossCleanupPermit, ManagedBirthPermit, inventory ownership, historical-plus-future A18, and Linux/Darwin split. Its sole HIGH blocker was receipt ordering: the one-phase handshake could not both fail no-fd copies before authoritative work and bind the partial/final receipt produced by that work.

**Draft-20 bounded repair (2026-07-12T03:48:40-03:00):** splits each exact runner sequence into credential-bound OPEN and COMMIT. OPEN binds gate/sequence/pid/live tuple plus prior input receipt before any authoritative byte; A1c uses the closed 64-zero bootstrap sentinel. COMMIT on the same reserved sequence binds the resulting receipt and evidence hashes before GateResult or sequence advance. A1c commits its closed partial receipt; A1d opens against that hash and commits the final sealed receipt; A5/A5b/A6/A7 open against the final hash and commit new evidence while preserving it. Missing/wrong COMMIT, bytes before OPEN, copy/no-fd, replay, mismatch, EOF, or crash poisons the capability and blocks later gates. Every other Draft-19 contract is unchanged.

**Draft-18 immutable acceptance re-review (superseded candidate):** exact commit `8f390d5ac6d5d0e8401928aef2865585b7e47ca9`, plan blob `fcca189d7862d0acf99a3580b52aa4d6fade46b6`, score **90/100, NOT READY**. It reproduced exact A0b-bootstrap and shell syntax, confirmed LossCleanupPermit, ManagedBirthPermit/controller/inventory/schema, A1c+A1d gate placement/reap/live revalidation, historical-plus-future A18, and the Linux/Darwin Goal. Two HIGH blockers remained: the literal hook could execute a replacement cache launcher before native dirfd pinning while claiming root-link authenticity, and the receipt's caller-supplied runner id/nonce/hash tuple was entirely copyable and could not make a copied later-job receipt fail.

**Draft-19 bounded repair (2026-07-12T03:14:31-03:00):** narrows standalone hooks to the executable `CooperativeWorkerV1` boundary—known-at-check corruption refusal plus ordinary deletion fallback, with deliberate same-UID pre-exec replace-all outside authenticity and fd splice resistance beginning only once native installer starts—while preserving docks-kit's optional external-digest/direct-native path. It replaces the copyable same-job assertion with a foreground custodian-created `AF_UNIX SOCK_SEQPACKET` capability, public `capability_id`, inherited gate-only fd, exact A1c→A1d→A5→A5b→A6→A7 challenge/ack chain, receipt/live-tuple binding, CLOEXEC non-leakage, fatal sequence/EOF/crash behavior, and copy-all-bytes/no-fd plus duplicate/stale/concurrent negatives. All Draft-18 loss-cleanup, exact reap/live delegation, immutable-scope, controller, schema/installer-after-start, and platform repairs are preserved.

**Draft-17 immutable architecture re-review (superseded candidate):** exact commit `74476bcbef85e5de2a4d4aa0136d92f72935a938`, plan blob `c089dab342a90f7736ecad46773fd6dcf198bbee`, score **86/100, NOT READY**. It independently reproduced A0b and accepted the proc-magic-link, ManagedBirthPermit, controller/inventory, fd-pinned installer/schema, same-version tuple, and Linux/Darwin repairs. It rejected dispatch because the closed loss table left `Fencing` before attempting to mint normal fence authority; the literal hook missed the prune window between directory and launcher checks; the delegated-runner receipt had no closed integrity-only shape/co-located gate/reap/live-revalidation contract; A18 did not explicitly own the already-landed historical range; and the headline Goal did not state the existing Linux/Darwin completion boundary.

**Draft-18 bounded repair (2026-07-12T02:48:01-03:00):** adds `LossCleanupRecord/Permit/Outcome`, minted in the durable loss transaction and valid exactly once against the resulting `FencingUnconfirmed` version, with replay/stale/crash/no-capacity-release rules in A6/A6a. Both literal hook commands now recheck truly absent non-link root before invalid-launcher fallback and A6b barriers that exact window. `DelegatedRunnerReceipt` is recursively closed over runner/boot/kernel/uid/mount/root/ptrace/runtime/time/expiry/child-wait/reap/populated/removal evidence; its JCS hash is explicitly integrity-only. A1c+A1d are one non-migrating host run, exact-reap before populated-zero/removal, and A5/A5b/A6/A7 live-revalidate before execution. Step 1b now freezes exact `12cf2ea..STEP3B_HEAD` path/status/mode/oid/commit ownership separately from future per-step allowances, and A18 verifies their exact union while requiring the stale plan absent. The Goal now states, without expanding or reducing behavior, the platform contract already present since Draft-17: Linux is authoritative; Darwin success is portable supervisor behavior plus typed unavailability.

Cross-check attempted (2026-07-12): [claude opus xhigh] `platform_denied` before the reviewer process launched because the host security layer denied the cross-company runtime; attempted:false, selected:null, no review findings, no retry. This transport result is recorded separately and is not a READY verdict or a waiver of the fresh dual-review requirement.

**Draft-17 author score:** **96/100 (independent re-review was pending)** · trajectory **95 Draft-16 author → 79 architecture / 82 acceptance NOT READY → 96 authority/feasibility/TOCTOU/platform repair** · superseded by the exact 86/100 review and Draft-18 repair above.

**Draft-17 extended remodel (2026-07-12T02:17:03-03:00):** The immutable Draft-16 architecture review scored **79/100, NOT READY** and the acceptance review scored **82/100, NOT READY**. Their blocking findings are all accepted. Draft-17 adds a sealed one-use `ManagedBirthPermit` bound to the exact Attaching worker/generation/version/tool/cwd/birth operation; defines `ControllerRead|ControllerInjectItems|ControllerStartTurn` and reruns full A9/A10 after Step 5; makes Steps 3c/4/5/6 extend a closed `rust-test-inventory.json` before their first gate; adds A1c raw per-runtime same-tracee TRACEEXEC feasibility and A1d owner-provisioned delegated-runner preflight before Step 4; pins installer manifests/checksum/hooks/payload/selected binary through dirfds/fds and makes complete same-version identity equality mandatory; canonicalizes schema argv with `<OUT>`, modes, ordering, and two-root byte equality; pins invoked/canonical native command identity and uses the same retained fd for generator/server across retarget barriers; makes unsupported/unknown/custody loss atomic before immediate same-fence close/kill/reap while preserving logical failure; scopes authoritative controller/fd-exec/cgroup paths to Linux and gives Darwin explicit closed-unavailable tests; makes every dangling/non-dangling plugin-root symlink fail; corrects `/proc/<pid>/exe` to a deliberately followed magic link at the exact seized tracee's exec stop with `O_NOFOLLOW→ELOOP` negative; and replaces A18 wildcard acceptance with exact path+mode-union/raw-diff verification plus a canonical manifest hash. Exact HooksList wire shape, `request_user_input=unsupported_loss`, one-document hook stdout, preserved A0b hashes, Step-3b split, exact server-method set, controller one-use authorization, and zero implementation-range plan/docs delta remain unchanged. No implementation may resume until a fresh immutable pair returns READY; no Step 4 work may start without A1c+A1d PASS.

**Draft-16 immutable review (superseded):** architecture **79/100, NOT READY**; acceptance/contract **82/100, NOT READY**. Both preserved the verified wire/policy closures but rejected dispatch for unrepresentable managed-birth authority, late/missing inventory ownership, controller enum/matrix drift, exec-stop feasibility/identity ambiguity, installer/schema TOCTOU, loss cleanup gaps, Darwin overclaim, incomplete hook-link policy, wildcard final scope, and lack of a real positive delegated Linux runner.

**Draft-16 extended remodel (2026-07-12):** Draft-15 architecture found a Step-3b→Step-5 gate cycle, missing pre-target exec stop, unbound controller command families, and non-regenerable runtime request fixture. Acceptance additionally reproduced double-JSON hook stdout, the Rust inventory created after first use, hooks/list wire-type drift, nonexistent request-user-input cancel response, prune-after-check failure, ambiguous installer paths, and A18 allowing the stale branch plan. Draft-16 splits core A2/A3b from new post-Step-5 A6a, creates the inventory inside Step 3b, uses a blocked final task plus ancestor `PTRACE_SEIZE|PTRACE_O_TRACEEXEC` and detaches only after fd/kernel identity at `PTRACE_EVENT_EXEC`, persists one-use command authorizations minted from Reentry/TurnCancel/Fence capabilities, pins the exact generated schema+native fd before pending creation, redirects installer JSON and rechecks disappearance races, preserves exact HooksList null/error placement, makes request-user-input an exact JSON-RPC error+loss, pins both manifests/`bin/SHA256SUMS`/four target names, and removes every `docs/plans/**` net delta before A18. No implementation may resume until a new immutable pair returns READY.

**Draft-15 immutable review (superseded):** architecture **82/100, NOT READY**; acceptance/contract **72/100, NOT READY**. Both independently validated A0b and most Draft-14 closures, then rejected the controller dependency cycle. Architecture required an actual exec-stop and persisted command-family authority; acceptance reproduced hook protocol corruption, late inventory creation, generated wire-schema mismatches, cache-prune TOCTOU, installer path ambiguity, and plan-file scope leakage.

**Draft-15 extended remodel (2026-07-12):** The immutable Draft-14 reviewers both reproduced that the name-filtered A3b command exits 0 with zero tests and that UserPromptSubmit lost `--event prompt`. They also found no authenticated Step-3b→1b bridge, no representable controller-local pending-token path, no distinct later-process controller handshake/result, no pre-binding foreign-identity refusal row, incomplete server-request/RPC authority, check-then-exec provenance, a broken Step-6 dependency, a contradictory doctor-unavailable taxonomy, a source-binary versus shipped-binary evidence mismatch, and prose-only A18 negatives. Draft-15 replaces filtered Cargo gates with exact integration targets plus nonzero/source-derived inventory, adds A0c and a closed step allowlist, makes the supervisor create/hold/zeroize the Codex token, defines the full controller envelope/results/fingerprint/RpcId/sealed terminal refs and generated request-policy fixture, closes pre-binding loss, pins native executable bytes through fd-exec and kernel identity, specifies two root-state-sensitive hook commands and portable pointer durability, enumerates doctor keys/reasons/goldens, separates source-built implementation evidence from the later owner-gated packaged rerun, makes Step 6 depend on Step 5, and executes final-scope negatives in a disposable checkout. No implementation may resume until a new immutable pair returns READY.

**Draft-14 immutable review (superseded):** architecture **86/100, NOT READY**; acceptance/contract **78/100, NOT READY**. Both validated A0b-bootstrap and rejected dispatch on controller/token authority, event-correct hook execution, and executable provenance. Acceptance independently demonstrated the zero-test Cargo false green and added the unauthenticated 3b→1b gap, pre-binding lifecycle hole, source-vs-packaged evidence split, dependency/taxonomy contradictions, and missing executable negative gates.

**Draft-14 extended remodel (2026-07-12):** Two immutable Draft-13 reviewers independently reproduced the cache-prune bootstrap impossibility, missing atomic binary+record commit, SessionStart/thread-response ordering cycle, absent durable active controller, unclosed multi-operation loss fan-in, and circular WIP helper. Acceptance additionally required full executable provenance and clean exact-tip completion; architecture required consistent event control epochs and resolved-decision placement. Draft-14 specifies the exact shell-first hook command; owner-locked immutable generations and one atomic `current` pointer; managed SessionStart as non-claiming; supervisor-owned JSON-RPC controller custody with later-process typed commands; explicit caller→watchdog→supervisor nonce pipes and source-derived startup phases; atomic typed loss batches including already-fail-closed and terminal states; a helper-free observed WIP bootstrap followed by Step-3b clean commit before helper creation; production-path executable digest receipts; closed installer/doctor schemas for docks-kit; and dirty/current A18 gates. No implementation may resume until a new immutable pair returns READY.

**Draft-13 immutable review (superseded):** architecture **84/100, NOT READY**; acceptance/contract **82/100, NOT READY**. Shared blockers: stable launcher begins inside the pruned root; binary+record replacement is non-atomic/unlocked; active app-server controller lacks durable custody; loss graph omits multi-operation/already-fail-closed states; and A0b requires a helper that does not exist. Additional blockers: SessionStart occurs before the `thread/start` response, nonce pipe inheritance was contradictory, cgroup receipts omitted executable provenance/production path, and A18 ignored dirty/current HEAD.

**Draft-13 extended remodel (2026-07-12):** The owner approved the required goal boundary after Draft-12 review proved an atomic hook-hash-bound Codex CLI launch was not available. Codex managed birth is now a relay-owned app-server with direct claim before first turn. Draft-13 also defines a self-bootstrapping monotonic stable hook runtime that survives plugin-cache pruning; semantic hook health without false atomicity; a closed source-state×lost-reason graph; watchdog-first independent session custody; stable control epoch plus private nonce and strict Ready/ControlBound/spawn/proxy phases; attempt-bound nested protocol receipts; per-launch cgroup evidence instead of cached authorization; exact tracked+untracked WIP hashes; and complete session-operation receipts. No implementation may resume until fresh immutable reviews return READY and the exact plan blob plus WIP hashes are re-dispatched.

**Draft-12 immutable extended review (superseded):** architecture reviewer **88/100, NOT READY** and contract/acceptance reviewer **88/100, NOT READY**. Blocking findings were: unclosed lost-authority transitions; watchdog detachment unspecified; supervisor control nonce/health/startup authority incomplete; nested protocol receipts not attempt-bound; hook trust claimed atomicity unavailable from `hooks/list`; cgroup capability attestation incorrectly authorized later launches; and A0b omitted dirty WIP content. Draft-13 maps each finding to an interface plus executable row.

**Draft-12 extended remodel (2026-07-11):** Two fresh gpt-5.6-sol audits invalidated Draft-11's narrow READY verdict. The remodel adds a durable waiting-claim tuple and stable cancellation epoch; durable `fence_epoch`; immutable fence-proof retention plus crash-resumable `Fenced→TerminalRetained`; role-authenticated supervisor Health/Control handshakes, ControlBound-before-spawn, true `setsid`, and startup-error propagation; setup/post-kill cgroup receipt separation with runtime capability attestation; sealed fence-bound protocol proofs and experimental API negotiation; pidfd exit receipts; supported Codex `hooks/list` production trust preflight; explicit session-operation tombstone GC; native Darwin supervisor tests; path-specific plan snapshots; and cross-filesystem-safe worktree handoff. Step 1b is reopened and Step 3b is correctly in-flight. No implementation may resume until a fresh immutable review returns READY and the plan blob is re-dispatched.

Cross-check (2026-07-11): [claude opus xhigh] platform_denied before plan-specific launch because the host security layer had already denied the required relay cross-company launch; attempted:false, selected:null, no user refusal; [codex gpt-5.6-sol xhigh] two independent read-only audits returned NOT READY and their verified findings were folded into Draft-12.

**Historical Draft-11 verdict (invalidated):**

Score: **97/100 (Draft-11 dual-review READY)** · trajectory **96 Draft-10 author → 94/NOT READY dual state-graph check → 96 explicit-transition repair → 98 architecture READY / 97 acceptance READY**.

**Immutable Draft-11 recheck (`9bc4c24`, 2026-07-11):** Independent architecture review returned **READY 98/100** and acceptance review returned **READY 97/100**. Both confirmed the closed graph, cancel-first deadline bind, reap-with-waiter exactly-once path, no-waiter return, claim-first staleness, audit-only late losers, and UnmanagedCanceling permit alignment. The reviewers were read-only; the orchestrator independently ran `git diff --check`, `node scripts/tree/guard.mjs`, and `node scripts/ci.mjs --plugin session-relay` green before this verdict record.

**Draft-11 repair (2026-07-11):** Both targeted Draft-10 reviewers found the same narrow contradiction: the cancel-deadline acceptance required `UnmanagedCanceling→Managed/FencingUnconfirmed`, while the closed graph forbade it. Draft-11 explicitly adds the exact atomic binding transition and exceptional `Attaching→FencingUnconfirmed` only for that deadline, plus the reap-with-waiter `→Claiming` path, exactly-once Active finalization, late-event loser behavior, and matching A2 rows. It also aligns TurnCancellationPermit use-time resolution with UnmanagedCanceling.

Weighted author result: standalone **22/22**; actionability **15/16**; dependency **12/12**; evidence **10/10**; goal **12/12**; executable acceptance **12/12**; failure **9/10**; assumption→question **4/6**.

**Historical Draft-10 author/review:** author **96/100**; targeted acceptance **94/100 NOT READY** and architecture **NOT READY** on the same closed-transition contradiction.

**Historical Draft-10 author pass:**

Score: **96/100** · trajectory **95 Draft-9 author → 96 READY architecture / 90 NOT READY acceptance → 94 unmanaged-authority repair → 96 cold-read**.

**Draft-10 remodel (2026-07-11):** The Draft-9 architecture leg returned READY 96/100; the acceptance leg found one remaining pre-claim hole: an unmanaged attach has neither Claim nor Fence authority. Draft-10 adds exact `UnmanagedOperation` cancellation, durable `UnmanagedCanceling`, an atomic disconnect-vs-Claiming winner table, session-operation reconcile/abandon with risk receipts, non-GC retention, and explicit race tests. It also preserves wake/watch's existing null stdin through `StdioEndpointMode::Closed` and removes backend-name remnants.

Weighted author result: standalone executability **22/22**; actionability **15/16**; dependency order **12/12**; evidence re-verify **10/10**; goal coverage **12/12**; executable acceptance **12/12**; failure mode **9/10**; assumption→question **4/6**. The only deductions are the intentional owner-gated remote run and explicit product-risk abandonment surface.

**Draft-9 immutable review result:** architecture **READY 96/100**; acceptance **NOT READY 90/100** solely on unmanaged cancellation authority, with Closed stdin as a nonblocking refinement. Draft-10 closes both.

**Historical Draft-9 author pass:**

Score: **95/100** · trajectory **93 Draft-8 author → 84/87 immutable reviews → 92 interactive/watchdog repair → 95 proof-immutability repair**.

**Draft-9 remodel (2026-07-11):** Draft-8's immutable reviews agreed the dependency/CAS/scope repairs worked but found three remaining gaps: output-only IPC broke inherited interactive attach, no live actor could publish supervisor death after caller exit, and public cgroup fields allowed proof tampering. Draft-9 defines per-endpoint pipe/PTY transport with stdin/EOF/output/resize/signal/backpressure and disconnect-fence behavior; adds a detached watchdog that owns/reaps the supervisor plus mandatory liveness checks; and makes every proof-critical cgroup field private with supervisor-only exact-fence construction and tamper fixtures. It also names the reverse worktree move and aligns the backend enum with `ConfinedCgroupCooperative`.

Weighted author result: standalone executability **22/22**; actionability **15/16**; dependency order **12/12**; evidence re-verify **10/10**; goal coverage **11/12**; executable acceptance **11/12**; failure mode **9/10**; assumption→question **5/6**. Remaining deductions are the deliberately unavailable current ProtocolTree and implementation risk guarded by Step-3b's hard STOP.

**Draft-8 immutable review result (superseded by Draft-9):** architecture reviewer **84/100, NOT READY**; acceptance/source reviewer **87/100, NOT READY**. Both converged on the interactive transport blocker; architecture additionally required idle supervisor-death detection and immutable cgroup proof fields.

**Historical Draft-8 author pass:**

Score: **93/100** · trajectory **94 Draft-7 author claim → 72/77 immutable agent reviews → 90 supervisor/CAS repair → 93 cold-read repair**.

**Draft-8 remodel (2026-07-11):** The two immutable Draft-7 reviews rejected the thread-local child custodian, absent operation versioning, A3 dependency cycle, forgeable process proof, broken A18 regex, stale-plan handoff, incomplete `EINVAL` routing, and mixed cooperative/adversarial cgroup matrix. Draft-8 moves a real detached supervisor before cancellation, makes it own Child from birth, defines exact IPC/crash/proxy semantics and private child cancellation/reap authority, adds operation/handoff CAS versions and a closed transition table, splits 3a–3d without cycles, seals process proofs/FenceIntent, makes intentional same-UID migration diagnostic/out-of-model, and repairs the executable commands.

Weighted author result: standalone executability **21/22**; actionability **15/16**; dependency order **11/12**; evidence re-verify **10/10**; goal coverage **11/12**; executable acceptance **11/12**; failure mode **9/10**; assumption→question **5/6**. The remaining dependency deduction is implementation risk in portable detached-supervisor output proxying; Step 3b now has a binary STOP rather than an invented fallback.

**Draft-7 immutable review result (superseded by Draft-8):** architecture reviewer **72/100, NOT READY**; acceptance/source reviewer **77/100, NOT READY**. Their blocking findings are the explicit Draft-8 closure list above.

**Draft-7 remodel (2026-07-11):** Two independent gpt-5.6-sol cold reviews reproduced that the previous Step 3 could false-green: `turn/start` discarded the returned turn id, cancellation only stopped the local pump, child cancellation could wait indefinitely after marking unconfirmed, wake/watch used unguarded mutation-guiding status, and A9/A10 accepted name/placeholder evidence. The dependency repair keeps Steps 1–2, narrows delivered Step 3 to 3a, adds 3b exact turn/child custody and 3c behavior-complete inventory, then lets containment consume those handoffs. Primary-source research additionally pins explicit hook timeouts, makes Claude SessionStart an empirical extra rather than the sole barrier, makes freeze optional, adds typed `CLONE_INTO_CGROUP` fallback, and makes current Codex ProtocolTree explicitly unavailable. The goal and final proof tiers are unchanged; unsupported tiers remain fail-closed.

Draft-7 weighted author result: standalone executability **21/22**; actionability **15/16**; dependency order **12/12**; evidence re-verify **10/10**; goal coverage **11/12**; executable acceptance **11/12**; failure mode **9/10**; assumption→question **5/6**. The independent reviews superseded this optimistic score.

**Historical Draft-4–Draft-6 review log (superseded where Draft-7 conflicts):**

Score: **96/100** · trajectory **93→95→95→95→95→96** · stopped: **plateau (K=3)**, then a Draft-6 delta from the Step-1 feasibility finding.

**Draft-6 revision (2026-07-11, from Step-1 real-runtime evidence + gpt-5.6-sol tier consultation):** The feasibility spike falsified the Draft-5 assumption that both runtimes spawn under the exact anti-escape filter — Codex's `bwrap` needs the very syscalls the filter denies. Rather than route the primary fan-out worker to `ProcessOnly`, Draft-6 resolves `codex-cooperative-cgroup-tier` = **Option A**: a `ConfinedCgroupCooperative` WorkerTree tier (delegated domain leaf + gated placement + `cgroup.kill`/freeze/populated-0, no filter) for **both** runtimes, with the anti-escape filter demoted to a Claude-only `FilteredCgroupHardening`. This is the faithful consequence of the confirmed `CooperativeWorkerV1` (the filter only buys deliberate-escape defense, already out of scope), and it lifts goal coverage 11→12 (the primary worker now gets a real kill-boundary). Two soundness must-haves surfaced by gpt-5.6-sol and folded into A5b/A13/Step 4/STOP: (a) atomic/gated initial placement (`CLONE_INTO_CGROUP` or stop/GO) closes the spawn-then-move race; (b) `cgroup.type=domain` assertion, fail-closed on threaded (`cgroup.kill`→`EOPNOTSUPP`). Independently orchestrator-verified: cgroup v2 membership is namespace-independent, so Codex's bwrap-nested descendants stay in the leaf and are killed. No affirmed invariant reopened; the historical Draft-4/Draft-5 closures below are unchanged.

Weighted result: standalone executability **21/22**; actionability **15/16**; dependency order **12/12**; evidence re-verify **10/10**; goal coverage **11/12**; executable acceptance **12/12**; failure mode **9/10**; assumption→question **5/6**. Draft-5 is a single-item delta: it pins the only safe glibc-compatible `clone3` return action, separates the unchanged raw denial probe from dual-real-runtime functionality, and makes failure disable the strong tier per runtime. The retained deductions remain because durable protocol proof is deliberately unavailable without a verified graceful flush contract, WorkerTree is cooperative rather than adversarial-grade, native probes may disable strong containment, and the pre-dispatch owner gate remains open. The plan does not paper over any tier.

The Draft-5 critique pass checked the return action against current glibc fallback and Linux seccomp semantics, then checked the candidate-filter feasibility row, installed-filter identity, real Claude/Codex tool+child+wait sentinels, raw namespace-denial retention, and runtime-specific downgrade through A13. Three no-improvement passes held at 95. B1/B2/B3, `ChildLaunchSpec`, `GcDeleting`, fence-version CAS, sealed permits, mutator inventory, watchdog, lock order, and shared-server observation-only behavior were checked for churn and remained unchanged.

Draft-5 single-item closure:

1. **BLOCKING closed — clone3 return action and worker functionality:** wholesale `clone3` denial is exactly `SECCOMP_RET_ERRNO|ENOSYS`, while namespace flags stay denied on legacy `clone`. A1 prototypes the exact policy; A5 retains the raw no-child namespace-denial probe; A5b runs real Claude and Codex under the installed filter and requires actual shell/tool child creation, wait, and ordered sentinels. A runtime without a safe fallback is explicitly strong-cgroup unavailable and cannot construct `ConfinedCgroup` in A13.

Draft-4 closure log:

1. **B1 closed — Unmanaged attach lifetime:** every transition-capable attach/resume now uses guard-held spawn+wait/cancel-reap, including `Admission::Unmanaged`; no lifecycle-sensitive path may `exec`. A3 reproduces Unmanaged epoch N→Claiming N+1 while a write-loop CLI is live and forbids Active until child reap/guard release.
2. **B2 closed — freeze is not terminal protocol proof:** `DedicatedOfflineBoundaryProof` requires verified graceful mutation rejection, durable flush watermark/ack, process reap, and complete offline scan. Freeze can aid physical containment only, must continue to cgroup kill+`populated 0`, and can never thaw through release. A7/A8 add queued-unflushed/thaw-after-candidate sentinels.
3. **B3 closed/bounded — cgroup hardening and threat model:** setup detaches every procfs mount, probes proc-pid-fd authority, validates seccomp architecture, rejects x32, denies `clone3` wholesale (with the Draft-5 ENOSYS return contract), and adds direct-ABI/defense-in-depth syscall probes. `WorkerTree` is explicitly `CooperativeWorkerV1`; same-user broker/SCM_RIGHTS escape is out of scope and adversarial isolation is a future plan. `threat-model-scope` asks the owner to confirm that product boundary.
4. **Refinement closed — closed child payload:** `run_child_with_guard` accepts only `ChildLaunchSpec` closed variants; executable/session/cwd/env authority is derived from the guard and raw argv/env/authority fields are inexpressible.
5. **Refinement closed — exact Unmanaged GC:** only old, unreferenced, unlocked `SessionBinding::Unmanaged` records can exact-CAS to durable `GcDeleting`. Claim/admission/pending creation refuse that epoch; deletion is crash-resumable; paused races prove the claimant either wins before deletion (zero GC deletions) or loses to the GC epoch (zero claimant changes); binding/Entry removal is last.

Affirmed invariants are intentionally unchanged: publish-first Fencing prevents reader starvation; exact generation/fence-version CAS rejects stale fencers; sealed `FencePermit` plus the complete source-derived mutator inventory prevent escape hatches; Claiming cancellation drains old epochs; the measured watchdog remains `<=20s` with a 10s UserPromptSubmit margin; the both-hooks-skipped scheduler race remains an explicit unsupported-contract residual; global/activity lock ordering remains acyclic; shared servers remain ProtocolObservation-only; pidfd signal tiers, durable fences, and operator abandonment remain fail-closed.

## Mistakes & Dead Ends

- **2026-07-12T04:03:59-03:00**: Wrote gate commands as shell assignment text inside an alleged argv and left the sender PID implicit → a shell/wrapper could be the spawned PID while another process held the fd and sent credentials → use literal closed frames, direct-spawn one native credential gate, restore fd CLOEXEC there, and require spawn/OPEN/COMMIT/wait/result PID equality.
- **2026-07-12T03:48:40-03:00**: Bound each gate's only capability handshake to the receipt hash produced by that same gate while also requiring no-fd copies to fail before probing → the receipt did not exist until after the forbidden work → reserve with credential-bound OPEN over the prior/bootstrap input, then COMMIT the result/evidence on the same sequence before advance.
- **2026-07-12T03:14:31-03:00**: Claimed that shell predicates plus a later native installer made the cached launcher authentic across deliberate same-UID atomic replacement → the replacement launcher executes before dirfd pinning can help → narrow standalone to ordinary prune/observed corruption, begin splice resistance only after native start, and preserve docks-kit's separate externally verified-native path.
- **2026-07-12T03:14:31-03:00**: Claimed a caller-supplied runner id, copyable nonce/hash, and live host tuple made copied evidence fail in a later job → every byte could be copied on the same host before expiry → require one retained inherited `SOCK_SEQPACKET` capability with credential-bound monotonic challenges across all six real gates.
- **2026-07-11T23:52:32-03:00**: Treated Draft-11's two narrow state-graph reviews as sufficient → extended cold reviews found missing durable waiter identity, unreachable terminal retention, forgeable protocol proof, phase-confused cgroup receipts, and unmodeled Codex hook trust → invalidate the READY record and require a fresh full-contract review after Draft-12.
- **2026-07-11T23:52:32-03:00**: Prescribed `git worktree move` between `/home/vagrant/projects` and `/tmp` → the filesystems differ and the move failed → use clean verified remove/re-add of the same branch/full HEAD only.
- **2026-07-11T23:52:32-03:00**: Let the Step-1 harness's isolated `--dangerously-bypass-hook-trust` row stand in for production feasibility → current Codex explicitly skips untrusted plugin hooks and the flag would authorize unrelated hooks → production now requires exact `hooks/list` trust/hash preflight and never uses the bypass.
- **2026-07-11T23:52:32-03:00**: First Step-3b WIP passed its authored tests → independent code review reproduced fail-open missing-supervisor admission, health/control first-connection cancellation, process-group-without-session detach, discarded thread-start failures, and incomplete matrix rows → implementation stays paused until the remodeled contract is approved, then the worker repairs against that blob.
- **2026-07-12T00:37:40-03:00**: Treated a trusted `hooks/list` snapshot plus immediate source re-hash as a production launch barrier → the API supplies no atomic expected-hash-bound child launch and cache refresh can strand already-resolved hook commands → move managed Codex to direct app-server claim and treat hook health as diagnostic, backed by a monotonic stable executable.
- **2026-07-12T00:37:40-03:00**: Bound redispatch only to plan blob and implementation HEAD → the preserved Step-3b checkout has tracked and untracked WIP not covered by either value → require binary patch and sorted untracked-manifest hashes before every handoff.

## Notes

- Step 1 appends the committed harness git-blob hash, raw artifact hashes, exact runtime versions, 10-run timing samples, derived deadline, and capability verdicts here. Large raw protocol/hook transcripts remain in the harness-owned temporary artifact directory, not pasted into the plan.
- Independent red-team trajectory: Draft-1 **56/100**; Draft-2 **74/100**; Draft-3 **80/100**; Draft-4 **93/100** after its final convergence pass. Draft-5 changes only the clone3 return action plus its feasibility/acceptance proof and reaches **95/100** without reopening affirmed invariants.

- **Historical Step-1 feasibility result (2026-07-11, orchestrator-run in the real authenticated env; harness on `codex/primitives-impl`, git-blob `02cea7b`, commit `c32aafa`):** the original harness exited 0 with an intact 49-record hash chain, current protocol unavailability, 20-second lineage deadline, and `managed_attach_deadline_ms=4360`. Its `strong_cgroup`/mandatory-freeze schema and test-only Codex hook-trust bypass are now explicitly superseded by Step 1b; this evidence cannot satisfy remodeled A1/A1b until cooperative/filtered, direct app-server claim, semantic hook-health, and stable-runtime rows pass.

## Sources

- `docs/plans/active/relay-worker-fanout.md:456-473` — final red-team splits general primitives (this plan) from fan-out-specific recovery.
- `plugins/session-relay/rust/src/appserver.rs:84-107,399-418,916-925` at checkpoint `701cea7` — `turn/start` result is discarded and cancellation only exits the local pump; no exact remote interrupt exists yet.
- `plugins/session-relay/rust/src/bus.rs:283-315` — MCP inbox drains directly.
- `plugins/session-relay/rust/src/channel.rs:174-195` — channel drains then emits context directly.
- `plugins/session-relay/rust/src/cli.rs:920-930` and `plugins/session-relay/rust/src/watch.rs:620-640` at checkpoint `701cea7` — mutation-guiding status reads can run outside the admitted guard.
- `plugins/session-relay/rust/src/spawn.rs:268-301` at checkpoint `701cea7` — child cancellation marks unconfirmed after grace but keeps waiting indefinitely.
- `plugins/session-relay/rust/tests/lifecycle_admission.rs:596-647` at checkpoint `701cea7` — five operation rows report the placeholder `dedicated_behavior_test` rather than executing the production wrapper.
- `plugins/session-relay/rust/src/store.rs:1081-1083,1179-1181` at checkpoint `701cea7` — store GC already delegates lifecycle-bound sessions to Step-2 protection; Draft-8 extends retention to operation/supervisor/handoff custody.
- `plugins/session-relay/rust/src/watch.rs:245-310,555-640` — pending acknowledgement, mailbox drain/deliver, and wake fallback are distinct re-entry paths.
- `plugins/session-relay/rust/src/main.rs:14-59` — multi-call routing to extend with lifecycle reconcile and hidden managed launcher.
- [Claude hooks](https://code.claude.com/docs/en/hooks) — universal `continue:false`, UserPromptSubmit blocking, and configurable handler defaults; SessionStart's event-specific surface is context-oriented, so its stop row is version-pinned.
- [Codex hooks](https://learn.chatgpt.com/docs/hooks#common-output-fields) — SessionStart/common stop and UserPromptSubmit behavior; timeout failures are fail-open.
- [Codex hook trust](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks) — plugin hooks use the same exact-hash review flow; new/changed unmanaged hooks are skipped, and the bypass flag is only for already-vetted automation.
- [Codex app-server](https://learn.chatgpt.com/docs/app-server#api-overview) — `turn/start` returns the initial turn; exact interrupt, turn pagination, and exact background-terminal list/terminate exist, but no public durable shutdown/flush watermark exists.
- [Codex app-server hook inventory](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md) — `hooks/list` returns effective-cwd `currentHash`, `trustStatus`, enabled state, source, and plugin id; experimental methods require initialization opt-in.
- [Codex app-server `ServerRequest` source](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/common.rs) — current source-of-truth generated request union includes approval, user-input, MCP elicitation, permission, dynamic-tool, auth-refresh, attestation, current-time, and legacy request variants; the implementation fixture is regenerated from the exact supported installed version.
- [Codex plugin/bundle hook execution issue](https://github.com/openai/codex/issues/16466) — current upstream evidence that stable plugin hook execution context/path is not yet a runtime-provided durability guarantee; session-relay must own its stable executable contract.
- [Codex interrupt example](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md#example-interrupt-an-active-turn) — exact interrupt request and terminal event; background terminals survive interrupt.
- [Linux pidfd](https://man7.org/linux/man-pages/man2/pidfd_open.2.html) and [`/proc/pid/stat`](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html) — stable fd vs observation-only start generation.
- [Linux cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html) — namespace delegation reachability, `cgroup.freeze`/`frozen`, `cgroup.kill`, `populated`, and the fact that freeze alone still permits migration.
- [Linux cgroup namespaces](https://man7.org/linux/man-pages/man7/cgroup_namespaces.7.html), [mount namespaces](https://man7.org/linux/man-pages/man7/mount_namespaces.7.html), and [user namespaces](https://man7.org/linux/man-pages/man7/user_namespaces.7.html) — namespace root is the creator's current cgroup; private cgroupfs mounts and user-namespace capabilities/mappings establish the setup order and prerequisites.
- [Linux seccomp filters](https://www.kernel.org/doc/html/latest/userspace-api/seccomp_filter.html), [`seccomp.h`](https://github.com/torvalds/linux/blob/master/include/uapi/linux/seccomp.h), [`seccomp(2)`](https://man7.org/linux/man-pages/man2/seccomp.2.html), and [`no_new_privs`](https://www.kernel.org/doc/html/latest/userspace-api/no_new_privs.html) — classic BPF cannot dereference pointer arguments; `SECCOMP_RET_ERRNO` returns its lower data bits as `errno`; filters must validate architecture; and x86-64/x32 need explicit syscall-number discrimination.
- [`clone(2)` / `clone3`](https://man7.org/linux/man-pages/man2/clone.2.html) — direct `CLONE_INTO_CGROUP` placement and its `EACCES`/`EBUSY`/`EOPNOTSUPP` failure modes; `clone3` pointer arguments remain opaque to classic seccomp.
- [`execveat(2)`](https://man7.org/linux/man-pages/man2/execveat.2.html) — `AT_EMPTY_PATH` executes the already-open executable fd and closes the path-hash-to-exec race for the authoritative Linux confined launcher.
- [`ptrace(2)`](https://man7.org/linux/man-pages/man2/ptrace.2.html) — `PTRACE_SEIZE` establishes the ancestor-owned trace without an attach SIGSTOP and `PTRACE_O_TRACEEXEC` yields `PTRACE_EVENT_EXEC` before the new program begins execution; detach is the explicit target-code GO boundary.
- [`fsync(2)`](https://man7.org/linux/man-pages/man2/fsync.2.html) and [`rename(2)`](https://man7.org/linux/man-pages/man2/rename.2.html) — crash durability requires syncing containing directories around entry renames; the plan never attempts to fsync a symlink inode.
- [glibc Linux `spawni.c`](https://github.com/bminor/glibc/blob/master/sysdeps/unix/sysv/linux/spawni.c#L416-L438) — current `posix_spawn` tries `clone3` first and takes the legacy-clone fallback only for `ENOSYS`/`EINVAL`; `EPERM` would make managed child/tool spawn fail instead of falling back.
- [`proc_pid_fd(5)`](https://man7.org/linux/man-pages/man5/proc_pid_fd.5.html), [`ptrace(2)`](https://man7.org/linux/man-pages/man2/ptrace.2.html), [`process_vm_readv(2)`](https://man7.org/linux/man-pages/man2/process_vm_readv.2.html), and [`pidfd_getfd(2)`](https://man7.org/linux/man-pages/man2/pidfd_getfd.2.html) — proc/fd and cross-process fd/memory surfaces are authority paths to probe/deny after namespace setup.
- [Rust Unix `CommandExt`](https://doc.rust-lang.org/std/os/unix/process/trait.CommandExt.html) and [`setsid(2)`](https://man7.org/linux/man-pages/man2/setsid.2.html) — process-group creation is not session creation; pinned Rust 1.85 needs the reviewed `pre_exec(libc::setsid)` path.
- [Apple XNU process info](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/proc_info.h) and [`libproc.h`](https://github.com/apple-oss-distributions/xnu/blob/main/libsyscall/wrappers/libproc/libproc.h) — Darwin observation fields/private enumeration, not an atomic signal handle.

## Review

*(filled by plan-review on completion)*
