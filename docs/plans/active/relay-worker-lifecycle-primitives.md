---
title: Build relay worker lifecycle primitives
goal: Add verified hook abort, stable-handle process control, and lifecycle-gated worker quiescence without allowing fallback tiers to claim false confirmation.
status: ongoing
created: "2026-07-11T03:31:53-03:00"
updated: "2026-07-11T22:27:10-03:00"
started_at: "2026-07-11T11:29:49-03:00"
assignee: null
tags: [session-relay, lifecycle, rust, safety]
affected_paths:
  - plugins/session-relay/rust/src/appserver.rs
  - plugins/session-relay/rust/src/bus.rs
  - plugins/session-relay/rust/src/channel.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/hook.rs
  - plugins/session-relay/rust/src/lib.rs
  - plugins/session-relay/rust/src/lifecycle.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/rust/src/process_identity.rs
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/src/supervisor.rs
  - plugins/session-relay/rust/src/watch.rs
  - plugins/session-relay/rust/tests/lifecycle_supervisor.rs
  - plugins/session-relay/rust/tests/lifecycle_turn_cancellation.rs
  - plugins/session-relay/rust/Cargo.toml
  - plugins/session-relay/rust/Cargo.lock
  - plugins/session-relay/hooks/hooks.json
  - plugins/session-relay/hooks/codex-hooks.json
  - plugins/session-relay/test/fake-app-server.mjs
  - plugins/session-relay/test/feasibility-probe.mjs
  - plugins/session-relay/test/lifecycle-smoke.mjs
  - plugins/session-relay/test/process-signal-inventory.mjs
  - plugins/session-relay/test/reentry-inventory.mjs
  - plugins/session-relay/test/run-build-matrix.mjs
  - plugins/session-relay/test/runtime-appserver-quiescence.mjs
  - plugins/session-relay/test/runtime-hook-abort.mjs
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/test/supervisor-custody.mjs
  - plugins/session-relay/test/fixtures/lifecycle-capability-schema.json
  - plugins/session-relay/test/fixtures/process-signal-inventory.json
  - plugins/session-relay/test/fixtures/reentry-inventory.json
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.toml
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/guardless.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/wrong-target.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fence-reentry.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/reentry-fence.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/cancel-reentry.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/child-cancel-reentry.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fabricated-owned-proof.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fabricated-pidfd-proof.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/tampered-cgroup-proof.rs
  - plugins/session-relay/AGENTS.md
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - .github/workflows/build-binaries.yml
related_plans:
  - relay-worker-fanout
review_status: null
planned_at_commit: 12cf2ea
---

# Build relay worker lifecycle primitives

## Goal

Build three general, independently testable relay capabilities: (A) prevent a managed hook-born Claude or Codex CLI from processing its first prompt when attach fails; (B) signal processes only through a kernel-stable handle or an unreaped supervisor-owned child, and confirm the cooperatively launched worker tree only behind the bounded confinement contract in this plan; and (C) cancel and prove app-server lineage only after a verified graceful stop/reap plus durable protocol flush, while capability-binding every relay drain, resume, injection, turn start, process launch, attach, interrupt, clean, and signal to the exact lifecycle/binding/fence epoch.

The result must distinguish **process-only**, **protocol-only**, and **worker-tree** evidence. Observation-only PID/start-time data, stable-looking descendant snapshots, any live shared-server scan, a single interrupted turn, `thread/read idle`, root-process exit, frozen-but-unflushed protocol artifacts, or `cgroup.events populated 0` outside the stated cooperative-worker boundary can never release a worker-tree capacity slot. ProtocolTree proof requires a verified graceful stop/reap whose durability contract flushes every accepted lineage/turn/terminal mutation before a complete offline scan; freezing is only a temporary WorkerTree snapshot aid and must end in kill plus `populated 0`, never thaw/release. Unsupported or lost capabilities remain `FencingUnconfirmed`, refuse every re-entry/drain, survive GC, and expose bounded reconcile/abandon paths.

## Context & rationale

- `relay-worker-fanout` is blocked on three general relay-core primitives. Its lifecycle-specific recovery/collection items remain out of scope; this plan provides only reusable attach, admission, process, quiescence, and reconciliation contracts.
- Independent red-team verification confirmed the feasibility foundation: Codex app-server returns the exact `turn.id`, supports `turn/interrupt {threadId,turnId}`, and emits terminal completion; both runtimes support `UserPromptSubmit` blocking; exit-0 universal `continue:false` is documented for SessionStart but Claude's event-specific section describes SessionStart as context-oriented, so the real-runtime matrix treats Claude SessionStart stop as version-pinned empirical defense-in-depth rather than the only prompt barrier. Hook timeout is configurable and fail-open. Linux has pidfd, `/proc` field-22, cgroup v2 kill/populated; rustix gates pidfd to Linux; Darwin exposes observation APIs. Current Codex app-server exposes no public mutation-rejecting durable-flush watermark, so `ProtocolTree` is unavailable for the installed runtime and cannot be a positive completion dependency.
- A start-time comparison followed by raw `kill`/`killpg` is check-then-act: the target can exit and its PID/PGID can recycle between operations. Darwin `proc_bsdinfo` and Linux start-time fallback are therefore **observation only**, not generation-safe signal handles.
- A delegated cgroup writable by the same user is not adversarial containment: a deliberately cooperating-violating process can request migration or use a broker. `CooperativeWorkerV1` proves only gated initial placement plus inherited membership for ordinary/nested-namespace descendants created by the relay-launched task, tied to generation-bound manager authority. Intentional same-UID ancestor/sibling migration is recorded as an out-of-model negative capability observation and never folded into a successful proof.
- A read/write flock alone cannot bound fencing. A writer may starve behind new readers, and a reader may hold through a 300-second pump, unbounded wake, or any lifecycle-sensitive `attach --exec`; CLOEXEC then drops even an Unmanaged guard while the resumed CLI continues across Claiming. Fence intent must publish before drain, new admissions must refuse without joining the reader queue, and every admitted operation—including pre-claim attach/resume—must be cancelable, parent-waited, and bounded.
- Re-entry is broader than `watch --auto-turn`: current drains exist in CLI inbox, MCP inbox, channel, hook, watch, and wake. Current app-server status/ack/deliver call `thread/resume`; pending acknowledgement is its own turn-start path. The inventory must be mechanically complete, not a hand-counted list.
- Codex CLI has no pre-minted session id. Managed state therefore needs a pre-launch `worker_id`, a pending token-hash index, and an atomic first-SessionStart binding to the discovered `runtime_session_id`. Duplicate SessionStart and resume are idempotent only for the exact bound identity; token replay to another identity is refused.
- Admission authority is time-sensitive: an Unmanaged guard issued before first SessionStart cannot remain valid after the same runtime id becomes Managed. Binding epoch, Claiming publication, prior-guard drain, target-free lower APIs, and use-time re-resolution are one mandatory invariant.
- Two equal asynchronous app-server scans are not a fixed point, and a shared second client can create lineage after the final page. Shared scans are observation-only unless the server supplies a held mutation-rejecting barrier. A frozen dedicated writer can still hold queued child creation or unflushed state, so only a verified graceful stop/reap with a durable flush contract can support final offline ProtocolTree proof; freeze followed by kill/`populated 0` proves only the bounded physical tree.
- Every fence attempt has its own epoch/version. Interrupt, clean, signal, timeout, finish, reconcile, release, and abandon must CAS or re-resolve that exact epoch so a late fencer cannot overwrite newer state.
- The pre-plan baseline GC aged registry entries/surfaces without managed exemptions; checkpoint `701cea7` already delegates lifecycle-bound sessions to the Step-2 GC rules. Remaining work must extend that protection to versioned active operations, supervisor/socket custody, handoffs, stale-event audits, and later proof records regardless of age.

## Threat model

These primitives defend a **cooperative worker**: the relay launches the user's own task under the user's own credentials and must contain accidental runaway descendants, crashes, PID/PGID reuse, signal TOCTOU, stale re-entry, and capacity overrun. `WorkerTree` means every process in the relay-controlled launch boundary that a cooperative task creates directly under the isolated wrapper. Its proof is authoritative only for that bounded set and only while the exact manager cgroup fd, namespace/setup receipt, kill result, and `populated 0` evidence remain valid.

A deliberately adversarial same-UID worker is outside this guarantee. In particular, it can ask a same-user broker such as `systemd-run --user` / D-Bus `StartTransientUnit` to create or move a process into a sibling cgroup, or pass work/authority through an already-reachable same-user service or `SCM_RIGHTS`. That broker-assisted writer can survive `cgroup.kill` while the worker leaf reports `populated 0`; neither seccomp on the worker nor its cgroup namespace can revoke authority already held by the broker. The fan-out hard cap accepts this bounded cooperative scope; tests must not relabel broker escape as covered WorkerTree evidence.

Adversarial-grade containment is a future, separately scoped capability requiring IPC and network namespace isolation, broker-socket denial, a complete service/FD handoff policy, and a full sandbox threat review. Cheap defense-in-depth in this plan still closes accidental/direct escape paths: architecture-validated seccomp, wholesale `clone3` denial returning `ENOSYS`, x86 x32 rejection, capability drop, inherited-fd closure, and a fresh PID/proc/cgroup view. The owner confirmed **`CooperativeWorkerV1`** on 2026-07-11; implementation and acceptance use it and must label it in every WorkerTree proof/status response.

## Feasibility and guarantee tiers

| Capability | Confirmed buildable path | What can never be claimed |
|---|---|---|
| Hook abort | Managed Claiming publication is the first short locked transaction; SessionStart returns universal structured stop on failure where the current runtime honors it; UserPromptSubmit independently blocks non-Active workers; both hook handlers pin an explicit 30-second timeout; a detached supervisor retains an unreaped child handle and a measured deadline no greater than 20 seconds. | Claude SessionStart stop is a version-pinned empirical optimization, not the sole barrier. If UserPromptSubmit is skipped/regresses, the supervisor watchdog is bounded best effort, not a hard scheduler guarantee. On a platform without worker-tree containment, killing the owned root does not prove descendants absent. |
| Process signal | Linux: open pidfd **before** validating start generation, then signal that pinned task. Live supervisor: signal/kill an unreaped `Child` it still owns. Cooperative WorkerTree (`ConfinedCgroupCooperative`, both runtimes): gated placement (`CLONE_INTO_CGROUP`/stop-GO) into a generation-bound domain cgroup leaf, then `cgroup.kill` and `populated 0`. | Darwin or Linux without pidfd after supervisor recovery must not raw-signal. PID/start-time is observation only. Process exit or owned process-group exit never proves an arbitrary worker tree, and the cgroup tier makes no adversarial same-UID broker claim. |
| Cgroup tree (`ConfinedCgroupCooperative`, both runtimes) | Under `CooperativeWorkerV1`, place the runtime in a delegated, newly created **domain** cgroup leaf with **atomic/gated initial placement** (`clone3 CLONE_INTO_CGROUP` or a separately capability-checked pre-exec stop/GO handshake so no runtime code forks before verified leaf membership); retain the generation-bound leaf fd; assert `cgroup.type=domain`, empty `cgroup.subtree_control`, and writable `cgroup.kill`; write `cgroup.kill=1`, then wait for `cgroup.events populated=0`. Optional freeze is diagnostic only and, if used, must end in kill rather than thaw-through-release. Works for **both** Claude and Codex because cgroup membership is namespace-independent. The anti-escape seccomp deny-list is a **Claude-only `FilteredCgroupHardening`** upgrade, never required for the cooperative tier. | Plain delegation, non-atomic placement, threaded/domain-invalid topology, manager-fd loss, unsupported direct placement without a verified stop/GO fallback, or any claim against broker-assisted / explicit same-UID cgroup migration is unconfirmed even if kill succeeds and `populated 0` is observed. Freeze is not confinement proof. `FilteredCgroupHardening` is best-effort defense-in-depth and makes **no** adversarial-containment claim. |
| App-server protocol | Current Codex supports exact owned-turn interruption and exact per-background-terminal termination, but the installed app-server has no public mutation-rejecting durable shutdown/flush watermark or persisted terminal ledger. Therefore real-runtime `ProtocolTree` is explicitly `UnavailableCurrentCodexAppServer`; the typed positive proof path is exercised only against a fake/future adapter that implements the full contract. | Process exit, stdio EOF, internal shutdown completion, `clean {}`, terminal-list emptiness, equal async scans, live shared-server scans, idle, freeze, or readable but unflushed offline artifacts never construct ProtocolTree proof. |
| Worker-tree release | Exhaustive proof validation accepts only a strong confined-cgroup proof explicitly labeled `CooperativeWorkerV1`, or compound gracefully flushed app-server lineage proof plus that physical containment for a relay-owned dedicated server. | Shared app-server, tracked descendant trees, stable snapshots, observation-only identities, root-only proofs, and deliberately broker-escaped same-UID processes remain outside/`FencingUnconfirmed`; no adversarial-sandbox claim is made. |

## Environment & how-to-run

- **Plan source:** the orchestrator and every worker read `/home/vagrant/projects/docks/docs/plans/active/relay-worker-lifecycle-primitives.md` from the main worktree at dispatch time; the older plan copy on the implementation branch is non-authoritative and need not be cherry-picked. The dispatch message records `git -C /home/vagrant/projects/docks rev-parse HEAD` plus `git -C /home/vagrant/projects/docks hash-object docs/plans/active/relay-worker-lifecycle-primitives.md`, and the worker repeats both before acting. If either changes, stop for re-dispatch rather than mixing revisions.
- **Implementation checkout/base:** one-time pre-dispatch checkpoint `701cea7e671bc40ee23d69abf79ff102e0eecb20` on branch `codex/primitives-collab`. Before agent dispatch, the orchestrator runs `git worktree move /home/vagrant/projects/docks-primitives-collab /tmp/docks-primitives-collab`; this intentionally updates registered worktree metadata. `/tmp` is writable to in-session agents and outside main, so it adds no untracked nested checkout. Verify with `git worktree list --porcelain` and A0. Before final handoff run `git worktree move /tmp/docks-primitives-collab /home/vagrant/projects/docks-primitives-collab` and re-verify. Drift/review base remains `12cf2ea`.
- **Toolchain:** Rust `1.85.0`; locked rustix `1.1.4`; Node 24; committed Cargo lock. Targets: x86_64/aarch64 musl-linux and x86_64/aarch64 Darwin.
- **Confirmed-source rule:** Step 1 codifies the already-confirmed red-team feasibility facts in a committed, runnable probe harness. It does not substitute hand-written booleans or re-argue the docs.
- **Local commands:**
  ```bash
  export PATH="$HOME/.cargo/bin:$PATH"
  (cd plugins/session-relay/rust && cargo test --locked)
  node plugins/session-relay/test/selftest.mjs
  node plugins/session-relay/test/lifecycle-smoke.mjs --case reentry-matrix
  node plugins/session-relay/test/reentry-inventory.mjs
  node scripts/ci.mjs --plugin session-relay
  ```
- **Real runtime:** `runtime-hook-abort.mjs`, `runtime-appserver-quiescence.mjs`, and `feasibility-probe.mjs` create isolated temporary `HOME`, `CODEX_HOME`, plugin config, relay store, cwd, and sentinels. They must record the exact loaded hook path/hash and runtime version. Missing auth/runtime is failure for the real-runtime gate, never skip/pass.
- **Authentication preflight:** before isolated-home tests, run `claude -p 'Print exactly RELAY_AUTH_OK'` and `codex exec --sandbox read-only 'Print exactly RELAY_AUTH_OK'`; each must exit 0 and print only the marker. Step 1 records, from current runtime docs/probes, the exact credential artifact or allowlisted secret-environment variable each CLI supports. The harness creates a mode-0700 temporary home/config, installs only test hook/plugin files, and either read-only references the supported credential artifact at its runtime-defined location or forwards the allowlisted secret variable by name. It never copies credential bytes into artifacts, logs paths/values/hashes, or broad-copies the user's config. If neither safe mechanism is available, STOP and report the runtime row unavailable; do not skip/pass or weaken home isolation.
- **Pre-dispatch owner gate:** RESOLVED 2026-07-11 — owner selected Option 1 (`CooperativeWorkerV1`). Implementation may proceed.
- **Probe evidence contract:** each capability row contains `runtime`, `runtime_version`, `platform`, `argv`, `started_at`, `finished_at`, `exit_status`, base64 or artifact-path `stdout`/`stderr`, artifact SHA-256, parser rule, and derived verdict. The harness rejects a verdict without matching raw evidence, rejects unknown/missing schema fields, verifies its own committed git-blob hash, and emits the raw-record hash chain. There is no editable pass/fail fixture.
- **Strong-tier spawn feasibility:** Step 1 prototypes the exact architecture-specific seccomp policy, records its BPF/policy hash, and runs authenticated real Claude and Codex beneath it. For each runtime, the harness first proves raw `clone3` returns `-1/ENOSYS` without creating a child, then requires a real shell/tool launch, an ordinary descendant, a wait, and an ordered completion sentinel. Step 4's installed filter must reproduce the same canonical policy and return action. A runtime without a safe legacy-`clone` fallback is recorded `strong_cgroup=unavailable` for that runtime; it is never allowed to advertise `ConfinedCgroupCooperative`/WorkerTree.
- **Measured attach deadline:** the probe runs 10 isolated cold starts per runtime including sequential store-lock contention. Set `managed_attach_deadline_ms = max_observed_ms + max(2000, ceil(max_observed_ms / 2))`; it must be `<= 20_000`, preserving at least 10 seconds inside the project's explicitly configured 30-second UserPromptSubmit hook budget. If the formula exceeds 20 seconds, STOP. Never lengthen the three-second global store lock.
- **Hook budget:** set `timeout: 30` explicitly on both runtimes' SessionStart and UserPromptSubmit command handlers. Timeout is fail-open and is tested as such; 30 seconds is a configured project budget, not a runtime minimum.
- **Cancellation bounds:** `managed_cancel_poll_ms = 100` and `managed_cancel_grace_ms = 5_000`. Every admitted blocking loop checks a nonblocking generation/epoch-specific marker at least once per poll interval; it must not acquire the three-second global store lock merely to poll. At grace expiry, the guard must have either completed its external operation or exact-CAS transferred retained authority/evidence to a typed cancellation handoff before releasing. If exact turn identity, exact fence epoch/version, or live child custody cannot be transferred, exact-CAS the still-active operation to `FencingUnconfirmed`, retain it for status/reconcile, and stop waiting; never extend the grace to obtain a green test. `pending_attach.expires_at` is launch time plus the measured `managed_attach_deadline_ms`, so claim-vs-expiry is decided by the one atomic claim transaction.
- **Protocol scan bound:** `protocol_lineage_deadline_ms = 20_000` is one monotonic deadline for all lineage/turn/terminal pages, verified graceful shutdown/reap/flush, and final offline scan. A page, continuous spawner, graceful stop/flush, or offline read that exhausts it returns `ProtocolIncomplete`; no retry loop may extend the same proof attempt. Freeze/kill is a separate physical-containment path and never upgrades protocol evidence.
- **Native platform matrix:** re-verify runner labels in Step 1, then run Darwin process probes natively on `macos-15-intel` and `macos-15`; cross-linking x86_64 on arm64 is not semantic verification.
- **Remote mutation gate:** A16 is the only acceptance criterion that dispatches external CI. Before it, ask the owner to authorize pushing the exact implementation SHA and dispatching the workflow; do neither implicitly. If approval is withheld, the remote ref mismatches, or GitHub is unavailable, STOP with A16 unverified and do not claim the plan complete. `run-build-matrix.mjs` never pushes; it only verifies the already-authorized remote SHA and dispatches/watches that exact run.
- **Binary discipline:** do not edit `plugins/session-relay/bin/`, manifest versions, marketplace versions, tags, or releases. Producer artifacts remain a later user-gated step.

## Interfaces & data shapes

### 1. Durable worker identity, pending attach, and lifecycle

Managed lifecycle is keyed by a pre-launch UUIDv4 `worker_id`, never by the not-yet-known Codex session id. Extend registry storage backward-compatibly with `managed_workers`, `pending_managed`, `session_bindings`, and `managed_tombstones`; legacy entries remain unmanaged.

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

pub struct PendingAttach {
    pub worker_id: String,
    pub generation: String,
    pub token_sha256: String,
    pub expected_runtime_session_id: Option<String>, // Claude Some; Codex None
    pub expected_tool: String,
    pub expected_cwd: String,
    pub expires_at: String,
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
    pub required_scope: RequiredScope,
    pub execution: ExecutionBackend,
    pub process_identity: Option<ProcessIdentityRecord>,
    pub appserver_lineage: Option<AppServerLineageRecord>,
    pub fence_reason: Option<String>,
    pub proof_gap: Option<String>,
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
        operation_version: String,
        binding_epoch: String,
    },
    GcDeleting { gc_epoch: String, binding_epoch: String, entry_version: String },
    Claiming { worker_id: String, generation: String, claim_version: String },
    Managed { worker_id: String, generation: String },
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

pub enum AppServerAuthority {
    SharedSocket { server: String },
    DedicatedStdio { supervisor_instance_id: String, process: ProcessObservation },
}

pub struct ThreadEdge {
    pub parent_thread_id: String,
    pub child_thread_id: String,
}
```

The launcher generates a 256-bit random raw token, persists only SHA-256, and passes `RELAY_MANAGED_WORKER_ID`, `RELAY_MANAGED_GENERATION`, and `RELAY_MANAGED_ATTACH_TOKEN` to the owned child. The raw token is never written to registry, logs, diagnostics, or argv. Its continued presence in the exact bound CLI environment is expected: before claim it authorizes one identity binding; after claim it is only an idempotency key for that same worker/generation/session/tool/canonical-cwd tuple and can never bind another tuple.

Every runtime session, including a not-yet-managed Codex id, has a persisted monotonically increasing `binding_epoch`. Admission, first SessionStart claim, unmanaged-operation cancellation, pending-token creation, and Unmanaged GC serialize through that record; this is mandatory. `UnmanagedCanceling` is the exact pre-claim cancellation linearization state and refuses new mutation. `GcDeleting` is a separate internal durable exclusion state: admission/claim/pending creation seeing it refuses or bounded-retries without creating surfaces.

Unmanaged disconnect and first SessionStart race in one short `with_lock` transaction. If disconnect wins, exact-CAS `Unmanaged@epoch + ActiveOperation@version → UnmanagedCanceling` and mint `CancellationAuthority::UnmanagedOperation` for only that session/epoch/operation/version; it can only cancel/reap the matching supervisor child. Claim waits for exact reap, then advances epoch to Claiming, or at its fixed deadline atomically binds the pending worker directly to Managed/FencingUnconfirmed and rebinds the unresolved operation to that worker's fence authority. If SessionStart wins and publishes Claiming/increments epoch first, the old unmanaged authority is stale and emits zero signal/state bytes; Claim authority owns cancellation. `UnmanagedCanceling` with lost/unreaped authority is non-GCable and status-addressable by session+operation.

`claim_managed_attach(token, runtime_session_id, tool, cwd)` is a two-phase bind whose **first operation is one short `with_lock` publication transaction**:

1. Hash token; validate `pending_managed[token_hash]`, generation/tool/canonical cwd/expiry and optional Claude id; reject conflicting binding; increment `binding_epoch`; atomically write `BindingState::Claiming { worker_id, generation, claim_version }`, mark the token claim-in-progress, and publish cancellation for all older-epoch guards. Do not run GC, marker writes, ordinary register, drain, RPC, process work, or wait first.
2. Outside the global lock, acquire the session binding/activity lock exclusively and drain prior epoch guards within `managed_cancel_grace_ms`. New admission sees `Claiming` and refuses. Older `Unmanaged` guards may finish work begun before Claiming, but cannot survive into Managed because final binding waits for their shared guards to release and every lower use re-resolves the epoch.
3. Under one second short `with_lock`, CAS the exact Claiming `binding_epoch + claim_version`, pending token, and worker `Attaching` version to `BindingState::Managed` + worker `Active`; write Entry/session binding/claimed-token hash and remove pending. If drain or final CAS fails, exact-CAS Claiming to `BindingState::Managed` bound to the worker in `ManagedState::Fencing` (never Active), retain the binding/epoch, and block the prompt; future admission therefore resolves managed refusal rather than recreating Unmanaged authority.

After Active, marker/ordinary registration/GC run as best-effort follow-ups and cannot undo the authoritative binding. Exact duplicate SessionStart during Claiming joins/polls that claim result within the attach deadline; it never starts another claim or increments the epoch.

Duplicate/resume semantics are exact:

| Input | Result |
|---|---|
| Concurrent duplicate with same claimed token + same runtime id/generation/tool/cwd | Idempotent Active success; no version/state churn and no second claim. |
| SessionStart resume without token + exact existing session binding/tool/cwd | Re-evaluate lifecycle: Active continues; any fenced/nonterminal-stop state emits structured stop. |
| Claimed token with different runtime id/tool/cwd/generation | Refuse and audit; never rebind. |
| Expired unclaimed token | Refuse; `Attaching→Fencing`; supervisor fences using retained handles. |
| Token replay after bind to a second worker/id | Refuse and audit. |

The closed worker transitions are `Attaching→Active|Fencing`; `Active→Fencing`; `Fencing→Fenced|FencingUnconfirmed`; `FencingUnconfirmed→Fencing` only through reconcile; `Fenced→TerminalRetained`; `TerminalRetained→TerminalReleasable` only through explicit owner release; `FencingUnconfirmed→TerminalReleasable` only through audited risk-accepting abandonment. The closed unmanaged cancellation transitions are `Unmanaged@N→UnmanagedCanceling@N`; successful exact reap/reconcile advances to `Unmanaged@N+1` with a terminal operation tombstone; exact risk-accepted `abandon-session` also advances to `Unmanaged@N+1` but retains a `NOT QUIESCENCE-PROVEN` receipt/tombstone. No other transitions exist. Only releasable managed records and risk-accepted terminal unmanaged-operation tombstones may age out. Binding GC alone may exact-CAS plain `Unmanaged@epoch/version→GcDeleting@gc_epoch→removed`; `UnmanagedCanceling` is never GC-eligible. A failed pre-delete lock acquisition exact-CASes untouched `GcDeleting` back to the same Unmanaged epoch/version. Once surface deletion starts, `GcDeleting` is crash-resumable and cannot roll back. `Claiming` and `Managed` never age out independently.

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
    LostAuthority { last_observation: Option<ProcessObservation>, reason: String },
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
        operation_version: String,
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

Every custody mutation uses `cas_operation_custody(operation_id, expected_operation_version, expected_variant, next)` in one short store transaction and increments `operation_version`; no external work occurs under the lock. The closed transitions are `None→TurnStartSentUnknown|ChildStarting`; `TurnStartSentUnknown→TurnNotSent|TurnKnown|LostAuthority`; `TurnKnown→TurnTerminal|HandedOff|LostAuthority`; `ChildStarting→ChildOwned|LostAuthority`; `ChildOwned→ChildCancelRequested|ChildReaped|LostAuthority`; `ChildCancelRequested→ChildReaped|HandedOff|LostAuthority`; and `HandedOff→TurnTerminal|ChildReaped|LostAuthority`. Creating a handoff atomically creates `{handoff_id,handoff_version=1,source_operation_version}` and CASes custody to `HandedOff`; consuming/updating it checks both operation and handoff versions. A losing delayed response/terminal/supervisor report writes at most an append-only stale-event audit and cannot change custody, lifecycle, signal, or RPC bytes. At the `TurnStartSentUnknown` grace deadline the guard closes its connection and exact-CASes `LostAuthority`; a response that arrives after that CAS is never allowed to resurrect the operation.

Lower APIs take **no independently supplied session, worker, server, thread, cwd, tool, process target, program, raw argv, or raw environment**. They derive all authority selectors and executable identity from the capability. The only separate launch payload is a closed typed value whose variants contain validated behavior data, never an escape hatch:

```rust
store::drain_with_guard(&mut ReentryGuard)
appserver::resume_with_guard(&mut ReentryGuard)
appserver::inject_with_guard(&mut ReentryGuard, items)
appserver::start_turn_with_guard(&mut ReentryGuard, prompt)
spawn::run_child_with_guard(&mut ReentryGuard, ChildLaunchSpec)

pub enum ChildLaunchSpec {
    AttachResume(AttachOptions),
    WakeDoorbell(DoorbellMessage),
    WatchWakeFallback(DoorbellMessage),
}

pub struct AttachOptions {
    pub model: Option<ValidatedModel>,
    pub effort: Option<ValidatedEffort>,
}

pub struct SupervisorRecord {
    supervisor_instance_id: String,
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
    ForwardSignal { operation_id: String, expected_operation_version: String, signal: i32 },
    CancelOwned {
        operation_id: String,
        expected_operation_version: String,
        authority: CancellationAuthority,
        request_id: String,
    },
    QueryOwned { operation_id: String },
}

pub enum SupervisorEvent {
    Started { operation_id: String, operation_version: String, process: ProcessObservation },
    Output { operation_id: String, stream: String, bytes_b64: String },
    InputAccepted { operation_id: String, byte_count: u32 },
    PtyResized { operation_id: String, terminal_group: String, rows: u16, cols: u16 },
    Reaped { operation_id: String, operation_version: String, exit_status: i32 },
    RefusedStale { operation_id: String, observed_operation_version: String },
    LostAuthority { operation_id: String, reason: String },
}

pub struct SupervisorWatchdogRecord {
    watchdog_instance_id: String,
    supervisor_instance_id: String,
    process: ProcessObservation,
    version: String,
    heartbeat_at: String,
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

`ChildLaunchSpec`, `AttachOptions`, `ValidatedModel`, `ValidatedEffort`, and `DoorbellMessage` are closed types constructed by parsers with explicit length/value bounds. They contain no `OsString`, executable path, cwd, session/worker/thread id, arbitrary flag list, environment map, fd, or authority-selector field. `run_child_with_guard` matches `(guard.allowed, spec.variant)`. `AttachResume` derives each endpoint from the caller via `isatty` plus fstat dev/inode grouping; `WakeDoorbell` and `WatchWakeFallback` explicitly use `{stdin: Closed, stdout: Pipe, stderr: Pipe}` to preserve checkpoint behavior. It writes a version-bound `SupervisorLaunchRecord` and sends only operation id/version to the supervisor. The supervisor re-resolves the record, derives program/session/cwd/generation/environment internally, builds env from an allowlist, maps `Closed` to null/closed input, creates pipes for `Pipe`, and creates PTY controller/slave pairs for terminal groups. It spawns the child itself as PTY session/foreground owner where applicable and owns the unreaped `Child` from birth. No `Child` or caller fd is transferred between processes and no public/internal target-taking mutator remains.

The supervisor is the hidden detached `relay __lifecycle-supervisor` process, started with a new session and no parent-death signal. It owns a mode-0600 Unix socket and validates same-UID peer credentials (`SO_PEERCRED` on Linux, `getpeereid` on Darwin), exact socket dev/inode, supervisor instance/version, operation/version, and current Claim/Fence authority from the store; caller-supplied command fields are selectors, never authority. `Input` carries exact bytes (max 64 KiB/frame), `InputEof` closes only child stdin, `ResizePty` is bounded to 1..4096 rows/cols and the named PTY group, and `ForwardSignal` accepts only SIGINT/SIGTERM/SIGHUP. Output frames preserve exact per-stream bytes; PTY endpoints preserve `isatty`, controlling terminal, foreground group, Ctrl-C, and resize behavior. Each direction has a 1 MiB bounded queue. A slow connected caller applies child-visible pipe/PTY backpressure as before, while cancellation/control polling runs independently at ≤100 ms.

There is no silent reattach policy. Caller socket EOF/disconnect exact-CASes the operation to cancellation using the current UnmanagedOperation/Claim/Fence authority (publishing `UnmanagedCanceling` or Active→Fencing first), drops queued caller-bound output, continues draining/discarding child output so the child cannot deadlock on a full pipe, and asks the supervisor to kill/wait/reap within the fixed cancellation grace. The supervisor continues owning the child until reap after caller disconnect; discarded-byte counts are audited. `CancelOwned` is accepted only after the supervisor privately constructs `ChildCancellationPermit`; `kill_wait_owned_child(&mut ChildCancellationPermit)` re-resolves the exact authority immediately before signal, then kill/waits/reaps its own child slot. A stale request reports `RefusedStale` and emits zero signal/state bytes. The supervisor remains alive until every owned child is reaped or exact lifecycle abandonment records loss.

Supervisor startup/crash recovery is explicit. A separate hidden detached `relay __lifecycle-watchdog` process spawns and owns the supervisor `Child` from birth, records its own generation-bound identity, waits/reaps it, and on exit exact-CASes every matching unresolved operation to `LostAuthority` plus lifecycle `FencingUnconfirmed` within `managed_cancel_grace_ms`. The supervisor publishes `Starting→Ready`, socket identity, and a heartbeat at least every second before any child launch. Every admission, claim, fence drain, status, and reconcile performs a ≤100 ms socket ping plus supervisor/watchdog generation and heartbeat check before mutation; mismatch refuses and performs the same exact CAS. If the watchdog dies first, the next such check marks authority lost; it never reconstructs/adopts the supervisor or worker Child. Tests cover supervisor death with no connected caller (watchdog publishes within 5s), watchdog-then-supervisor death (first re-entry refuses/CASes), and stale replacement instances. `QueryOwned` is observation only. The supervisor is also the later Step-4 cgroup manager; Step 3b adds portable owned-child custody, bidirectional stdio/PTY IPC, exact cancellation, watchdog, and reap proof, while pidfd/cgroup authority remains Step 4.

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
        signal: FenceSignal,
    },
    FenceConfinedCgroup {
        worker_id: String,
        generation: String,
        fence_epoch: String,
        fencing_version: String,
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

pub struct ProcessObservation {
    pub pid: u32,
    pub pgid: Option<i32>,
    pub start: StartGeneration,
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
    // Option A split: cooperative receipt is MANDATORY for a ConfinedCgroupCooperative
    // WorkerTree (both Claude and Codex); the anti-escape filter is an OPTIONAL Claude-only
    // add-on. Cooperative-receipt failure disables WorkerTree for that runtime; filtered-
    // hardening failure disables ONLY the Claude hardening layer.
    cooperative: CgroupCooperativeReceipt,
    filtered_hardening: Option<FilteredCgroupHardeningReceipt>,
    _sealed: supervisor::Sealed,
}

pub enum GatedPlacementMode {
    Clone3IntoCgroup, // clone3(CLONE_INTO_CGROUP): runtime is born directly in the leaf
    PreExecStopGo,    // pre-exec stop/GO: manager moves+verifies before any runtime code runs
}

// MANDATORY for every ConfinedCgroupCooperative WorkerTree, both runtimes. Contains no
// namespace/seccomp requirement: cgroup membership is namespace-independent, so cgroup.kill
// on a domain leaf reaches even a bwrap-nested descendant.
pub struct CgroupCooperativeReceipt {
    gated_placement: GatedPlacementMode,
    no_runtime_code_before_membership: bool,
    leaf_membership_verified: bool,
    cgroup_type_domain: bool,
    subtree_control_empty: bool,
    cgroup_kill_writable: bool,
    killed: bool,
    populated_zero: bool,
    optional_freeze_observation: Option<String>,
    no_surviving_host_pid_under_leaf: bool,
    cooperative_probe_sha256: String,
    setup_transcript_sha256: String,
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

`ProcessIdentityRecord` is durable observation/recovery input. `SignalHandle` is live sealed authority: pidfd is local; supervisor variants are usable only through the matching live supervisor instance, which retains the actual Child/cgroup fd. Step 4 extends the closed supervisor protocol with `SupervisorFenceCommand`; immediately before action the supervisor re-resolves exact operation plus Fencing generation/epoch/version and privately mints `SupervisorFencePermit`. Stale commands emit zero signal/state bytes. Linux pidfd recovery order is **open pidfd first, then read/compare the generation while the fd pins the task**, then signal via pidfd. If pidfd open fails or the pinned observation mismatches, do not raw-signal. On Darwin and Linux without pidfd, recovery produces `ObservationOnly` and returns unconfirmed. A live supervisor may safely act through its unreaped `Child` only when its instance id and operation version match; once reaped/restarted, that authority is gone. `killpg` is permitted only inside the supervisor while its unreaped owned group leader prevents PGID reuse, and it proves group scope only—not escaped descendants or WorkerTree.

Managed launch uses `__managed-child-exec` with this executable cgroup setup contract (mandatory cooperative steps + optional Claude-only `FilteredCgroupHardening`):

1. **Preflight or fail closed (cooperative = mandatory; filter = optional Claude-only).** For the **cooperative** tier (both runtimes) require Linux cgroup v2, a newly created **`domain`** worker leaf with empty `cgroup.subtree_control` and writable `cgroup.kill`, a writable delegation permitting create/move at both destination and common ancestor, and at least one independently proven gated-placement capability. Classify direct `CLONE_INTO_CGROUP` failure exactly: `EACCES` means placement/delegation restrictions failed; `EBUSY` means a domain controller is enabled in the target; `EOPNOTSUPP` means domain-invalid; `ENOSYS` means the syscall path is unavailable. `EINVAL` means unsupported `CLONE_INTO_CGROUP` only when a same-binary control proves the `clone_args` size/base clone3 call valid and a disposable-leaf probe reproduces failure with the exact otherwise-valid flag/fd; malformed size/flags/fd remain implementation errors and STOP. Do not generic-retry clone3; use stop/GO only if its own capability probe already passed. If neither path is available, record `ObservationOnly`/`Unconfirmed` and never label the backend `ConfinedCgroupCooperative`. The **`FilteredCgroupHardening`** add-on additionally requires cgroup+mount+PID namespaces, either current-user-namespace `CAP_SYS_ADMIN` or enabled unprivileged user namespaces with uid/gid mapping, fresh proc mounting, `no_new_privs`, and seccomp filtering; if any of these fail, record `filtered_hardening: None` — this never reduces the cooperative WorkerTree.
2. **Create and retain manager authority.** The manager creates `<manager-root>/<worker_id>-<generation>/`, opens the exact directory `O_PATH|O_DIRECTORY|O_CLOEXEC`, records mount/dev/inode/uid/mode/path/generation, and keeps that fd private. All `cgroup.procs`, optional `cgroup.freeze`, `cgroup.kill`, `cgroup.subtree_control`, and `cgroup.events` access uses `openat` from this fd; no later path lookup is signaling authority.
3. **Gated placement before any runtime code (mandatory, both runtimes).** Either spawn the runtime via a successful `clone3(CLONE_INTO_CGROUP)` so it is born in the leaf, or use the separately proven trusted wrapper blocked on a private handshake pipe and, before it executes runtime code or forks, have the manager write its pinned pid through the retained fd into the worker leaf and verify membership. Verify `cgroup.type=domain`, empty `cgroup.subtree_control`, and writable `cgroup.kill`. **(Claude-only `FilteredCgroupHardening` continues from here:)** the wrapper must already be in the leaf when it calls `unshare(CLONE_NEWCGROUP)`, so `/` inside that namespace is the worker leaf rather than an ancestor.
4. **Build an isolated view (Claude-only `FilteredCgroupHardening`; Codex skips this and stays cooperative).** For the rootless path, the wrapper first creates a user namespace, pauses while the manager installs `setgroups=deny` and uid/gid maps, then creates private mount+cgroup+PID namespaces and forks the namespace PID 1. It makes mounts private, enumerates and detaches **every inherited procfs and cgroup2 mount**, mounts one fresh `/proc` for the new PID namespace, proves `/proc/<host-pid>/{fd,fdinfo,root,cwd}` grants no host authority, and mounts exactly one cgroup2 view at `/sys/fs/cgroup`, rooted at the worker leaf and remounted read-only/nosuid/nodev/noexec. The privileged path must produce the identical observable view/receipt.
5. **Remove alternate authority before untrusted exec (Claude-only `FilteredCgroupHardening`).** Explicitly close every non-allowlisted fd (including manager/cgroup/mount namespace fds) with close-range plus fresh-`/proc/self/fd` verification; retain only stdio and the GO pipe. Set `no_new_privs`, drop namespace capabilities, then install an architecture-validating seccomp filter. It accepts only `AUDIT_ARCH_X86_64` or `AUDIT_ARCH_AARCH64` matching the compiled target; on x86_64 it rejects every syscall number carrying `__X32_SYSCALL_BIT`. Because classic seccomp BPF cannot dereference the `clone3` pointer argument, deny `clone3` wholesale with **exactly `SECCOMP_RET_ERRNO | (ENOSYS & SECCOMP_RET_DATA)`**, never `EPERM`, kill, trap, or a generic deny action. This makes glibc `posix_spawn` take its verified legacy-`clone` fallback. On that legacy path, allow ordinary child flags but deny every namespace-creating flag. Deny `mount`, `umount2`, `fsopen`, `fsmount`, `open_tree`, `move_mount`, `mount_setattr`, `fsconfig`, `fspick`, `pivot_root`, `chroot`, `setns`, `unshare`, namespace-creating legacy `clone` flags, `ptrace`, `process_vm_writev`, and `pidfd_getfd`. Most of the latter controls are defense-in-depth after capability drop and the fresh PID/proc view; failure of the architecture/x32/clone3-return checks is independently fatal to the filtered hardening layer only (Codex simply lacks it and stays on the cooperative tier), never to the cooperative WorkerTree.
6. **Adversarial and compatibility gates, then GO.** Preserve the raw-syscall namespace-denial fixture in the exact namespaces: it must prove `clone3` creates no child and returns `-1/ENOSYS`; namespace flags through legacy `clone` remain denied; wrong-arch and x32 actions are asserted exactly; ancestor/sibling write, remount, new namespace, inherited-fd, alternate proc/cgroup mount, and `/proc/<pid>/{fd,fdinfo,root,cwd}` attacks fail in the filtered layer. Separately, run A5b's **cooperative** gate for each real runtime: gated leaf placement, the real sandbox tool child plus nested-namespace double-forked grandchild/fork storm, a host-PID-stays-under-leaf assertion, then `cgroup.kill`→`populated 0`. Optional freeze is a separate observation and not a GO/proof prerequisite. Only a runtime passing the cooperative gate may receive GO with `ConfinedCgroupCooperative`; a runtime that cannot achieve gated placement or leaf containment records `ConfinedCgroupCooperative` unavailable. Claude additionally attempts the filtered hardening; Codex is expected filtered-unavailable and remains cooperative-tier eligible. The manager re-verifies leaf membership and the receipt, then sends GO.

The detached lifecycle supervisor is the cgroup manager and retains the exact directory fd until terminal release. Ordinary CLI exit/restart asks that supervisor to act; it does not reopen the path. If the supervisor or fd is lost, mount/dev/inode/path revalidation is observation only because the path/inode could have been recycled; this plan defines no fd-reconstruction/transfer path, so recovery remains `FencingUnconfirmed`. A **cooperative** failure — gated-placement/leaf-membership loss, non-domain/non-empty-subtree leaf, non-writable `cgroup.kill`, typed-placement fallback failure, kill/`populated 0` failure, surviving host PID, retained-fd loss, or supervisor-authority loss — makes WorkerTree unavailable for that runtime. A **filtered-hardening** failure records `filtered_hardening: None` and disables only the Claude-only layer. This direct boundary does not claim to stop a deliberately adversarial same-user broker or service from creating a sibling process; every `CgroupTreeProof` is stamped `CooperativeWorkerV1` and diagnostics repeat that scope.

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
    boundary_probe: CooperativeBoundaryProbeReceipt,
    populated_zero_observed: bool,
    threat_model: WorkerThreatModel,
    fence_epoch: String,
    fencing_version: String,
    _sealed: supervisor::Sealed,
}

pub enum WorkerThreatModel { CooperativeWorkerV1 }

pub struct CooperativeBoundaryProbeReceipt {
    worker_id: String,
    generation: String,
    membership_attempts: Vec<CooperativeMembershipAttempt>,
    out_of_model_observations: Vec<OutOfModelEscapeObservation>,
    raw_evidence_sha256: String,
    _sealed: supervisor::Sealed,
}

pub struct CooperativeMembershipAttempt {
    scenario: String,
    membership_unchanged: bool,
}

pub struct OutOfModelEscapeObservation {
    scenario: String,
    result: String,
    classification: String,
}

pub struct ThreadQuiescence {
    pub thread_id: String,
    pub parent_thread_id: Option<String>,
    pub turns: Vec<TurnTerminalProof>,
    pub terminals: Vec<TerminalTerminationProof>,
    pub terminal_pages_sha256: String,
    pub terminal_next_cursor_is_null: bool,
}

pub struct TerminalTerminationProof {
    pub process_id: String,
    pub persisted_status: String,
    pub source: String,
}

pub struct TurnTerminalProof {
    pub turn_id: String,
    pub persisted_status: String,
    pub source: String, // "includeTurns" | "thread/turns/list"
}

pub struct ProtocolTreeProof {
    pub root_thread_id: String,
    pub lineage_hash: String,
    pub threads: Vec<ThreadQuiescence>,
    pub boundary: DedicatedOfflineBoundaryProof,
    pub completed_before_deadline: bool,
}

pub struct DedicatedOfflineBoundaryProof {
    supervisor_instance_id: String,
    no_listener_evidence_sha256: String,
    graceful_stop_reaped_evidence_sha256: String,
    durable_flush: DurableFlushReceipt,
    complete_offline_artifact_set_sha256: String,
    _sealed: lifecycle::Sealed,
}

pub struct DurableFlushReceipt {
    contract_version: String,
    accepted_mutation_watermark: String,
    flushed_mutation_watermark: String,
    shutdown_ack_sha256: String,
    storage_sync_evidence_sha256: String,
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

pub enum FenceAction { InterruptKnownTurn, TerminateKnownTerminal, SignalRecordedHandle }

pub enum FenceSignal {
    Posix(i32),
    FreezeConfinedCgroup,
    KillConfinedCgroup,
}

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
```

`TurnCancellationPermit`, `OwnedTurnRef`, `FencePermit`, `FenceTurnRef`, and `FenceTerminalRef` construction/seals remain private. A `TurnCancellationPermit` is the deliberately weaker pre-drain authority for one live guard's own exact persisted turn; every use re-resolves its exact Claiming or Fencing generation/epoch/version, derives the target from sealed custody, and may only interrupt that one turn. A full `FencePermit` is still post-drain and every fence mutation re-resolves exact `Fencing + worker_id + generation + fence_epoch + fencing_version` immediately before use. The only lower mutators that accept them are:

```rust
appserver::interrupt_owned_turn_on_cancel(&mut TurnCancellationPermit)
appserver::interrupt_with_fence(&mut FencePermit, &FenceTurnRef)
appserver::terminate_terminal_with_fence(&mut FencePermit, &FenceTerminalRef)
process_identity::signal_recorded_with_fence(&mut FencePermit, FenceSignal) // no pid/pgid/path argument
```

The full-fence refs are emitted only by exact custody handoff or enumeration under the same permit epoch. Terminal refs use the current exact `thread/backgroundTerminals/list` process id and terminate it with `thread/backgroundTerminals/terminate`; bulk `clean {}` acknowledgement is never completion evidence. There is deliberately no resume/start/inject/drain/spawn overload for either permit, and no interrupt/terminate/signal overload without the matching sealed capability. Every call verifies its `FenceAction`; the cancellation permit cannot clean/signal/re-enter, a process-only permit cannot terminate a terminal, and an app-server permit cannot signal an unrelated handle.

`drain_prior_operations` cannot mint `FencePermit` until it holds all bound-session locks plus worker activity exclusively and every released guard has either resolved custody or written an exact-version `CancellationHandoff`. A handoff is consumed into the permit only when its authority matches the same current fence epoch/version; unknown-turn or lost-supervisor handoffs instead force `FencingUnconfirmed`. `finish_fence` consumes that permit and, in one `with_lock`, exhaustively validates evidence then CASes only the exact current `Fencing` fence epoch/version to `Fenced` or `FencingUnconfirmed`. `mark_fence_unconfirmed` consumes the exact intent after any binding/activity drain timeout and does the same version CAS. A stale completion returns `StateChanged` and writes nothing.

Reconcile, release, and abandon are also exact-version operations. Reconcile CASes `FencingUnconfirmed@version N` to `Fencing@version N+1` with a new `fence_epoch`; release CASes only `TerminalRetained@expected_version`; abandon CASes only `FencingUnconfirmed@expected_version`. Thus an old fencer cannot signal, finish, release, or overwrite state after reconcile or audited abandonment.

Proof scope remains exhaustive: `ProcessProof` satisfies only `ProcessOnly`; `ProtocolTreeProof` only `ProtocolTree`; only `WorkerTreeProof` satisfies `WorkerTree`. `DedicatedOfflineBoundaryProof` is constructible only by an adapter that reports a mutation-rejecting durable flush watermark covering every accepted mutation and whose complete offline scan reaches that watermark. The current Codex adapter is hard-coded `UnavailableCurrentCodexAppServer` and cannot construct it; the positive path exists only in the fake/future-adapter contract test. Freeze evidence is deliberately absent from this type. A `TrackedTree` backend always returns `Unconfirmed`, root exit never promotes to tree proof, and unknown evidence/backend variants fail closed. `CgroupTreeProof` satisfies WorkerTree only for `CooperativeWorkerV1`; attempting to omit or widen that threat-model tag fails closed.

All `CgroupBoundary`, cooperative/filtered receipt, boundary-probe, and `CgroupTreeProof` fields are private. Public methods are read-only accessors returning copies/borrows; no mutable accessor or public constructor exists. Only the live matching supervisor may construct the final `CgroupTreeProof`, after re-resolving its private `SupervisorFencePermit`, writing kill, observing populated-zero, validating every in-model membership row, and binding the exact fence epoch/version. Compile-fail fixtures reject construction and field mutation; runtime tests prove a stale supervisor or altered serialized observation cannot enter `FenceEvidence::WorkerTree`.

### 5. Hook attach and measured dead-man

Managed SessionStart performs only the short atomic Claiming publication first, drains old binding-epoch guards outside the global lock, then CASes Claiming→Managed/Active. It does not run GC, marker, ordinary register, or mailbox drain before Active. On claim/drain/CAS failure it returns exit-0 JSON with top-level `continue:false`/`stopReason`, records the error, and notifies the detached supervisor. Codex treats this as a documented stop; Claude's current behavior is captured by a version-pinned empirical row because its event-specific documentation emphasizes context even though universal `continue:false` is documented. UserPromptSubmit is the required cross-runtime prompt barrier: it admits a binding-bound `UserPromptDrain`, and non-Active/Claiming state returns `decision:"block"` without draining. Both handlers explicitly configure `timeout: 30`; timeout remains fail-open and activates supervisor fencing. Ordinary unmanaged behavior remains byte-compatible and fail-open, but unmanaged mutations still require a session/epoch-bound guard.

The supervisor holds the unreaped root child and, where available, strong cgroup control. Its deadline comes from the measured formula in Environment—not a hard-coded four seconds. Sequential contention tests queue multiple near-timeout store users and prove the attach claim is still first; failure blocks the prompt and fences, never lengthens `with_lock` beyond three seconds.

The bounded race is explicit. The required UserPromptSubmit block has an explicitly configured 30-second hook timeout; the watchdog deadline is at most 20 seconds, leaving at least 10 seconds of project-configured margin for owned-child termination and wait. SessionStart stop is an earlier defense where the exact runtime/version honors it, but the safety claim does not require Claude SessionStart alone. If UserPromptSubmit is skipped or violates that contract, prompt execution may begin any time from CLI exec until the watchdog acts; the residual window is at most `managed_attach_deadline_ms` for a scheduled supervisor with a live owned-child handle, but it is not zero and cannot be a hard scheduler guarantee. Root termination is only ProcessOnly unless strong containment proves the tree.

### 6. App-server lineage, terminal flush, and physical scope

Persist every successful `turn/start` response's exact `turn.id` before pumping. Persist `TurnStartSentUnknown` before the send so an ambiguous after-send failure cannot disappear. Fencing first blocks relay re-entry. Async repeated scans are observations, not a fixed point: equality of two scans cannot construct `ProtocolTreeProof`.

1. A live guard first uses `TurnCancellationPermit` to interrupt only its own exact persisted turn and requires a matching terminal event; after drain, `FencePermit` may interrupt exact handed-off or enumerated turns. List background terminals and terminate each exact returned `processId`; never treat bulk `clean {}` acceptance as terminal completion. Enumerate descendants/turns/terminals through all pages under one `protocol_lineage_deadline_ms` deadline. `thread/read idle` alone remains forbidden.
2. A **shared socket server** always yields `ProtocolObservation`, never `ProtocolTreeProof`, and cannot transition a ProtocolTree worker to Fenced. Two sequence reads or a snapshot without durable mutation rejection are insufficient. Step 1 records whether a future authoritative barrier exists, but this plan does not add unverified acquire/hold/release mutators; adopting it requires a separately reviewed capability contract.
3. The installed Codex adapter is explicitly `UnavailableCurrentCodexAppServer`: it has no public mutation-rejecting durable shutdown/flush watermark or persisted terminal-completion ledger, so every real dedicated-server ProtocolTree attempt returns `ProtocolIncomplete { reason: MissingDurableFlushContract }`. The positive adapter contract remains testable with the fake server: reject new mutations, flush every accepted lineage/turn/terminal mutation through an explicit durable watermark, acknowledge it, exit/reap, then complete a finite offline scan through the same-or-later watermark. Process exit, stdio EOF, internal shutdown completion, `clean {}`, and process kill are not a protocol flush.
4. Cgroup kill is the authoritative physical path: write `cgroup.kill=1`, then wait for `populated 0`. Freeze is optional diagnostic/snapshot aid only; processes may migrate while frozen. Freeze cannot construct `DedicatedOfflineBoundaryProof` or `ProtocolTreeProof`, and if used it must proceed to kill without thaw-through-release.
5. For notification-loss recovery, accept exact persisted turn terminal state only from the complete gracefully stopped/flushed offline artifact set. Live `includeTurns`/`turns/list` on a shared server is supporting observation only.
6. A real child-agent test creates a child-thread writer; a real background terminal writes another sentinel; queued-after-parent and continuous-spawner fixtures create descendants after the second equal live scan. A thaw-after-candidate-proof fixture queues a child plus unflushed write before freeze and proves freeze/offline equality is rejected. Every writer must be covered by graceful flush or physically killed behind the confined cgroup. If the deadline expires, a writer continues, a child appears outside the flushed watermark, or any code attempts thaw-through-release, return `ProtocolIncomplete`/refuse release.

Compound WorkerTree+Protocol proof remains a future-adapter path requiring the relay-owned dedicated stdio server, verified graceful flush, and cooperative-scope cgroup containment. The current runtime can still confirm the bounded physical WorkerTree after `cgroup.kill`→`populated 0` when protocol evidence is incomplete, but no ProtocolTree proof is fabricated. The live app-server Child/stdio authority is tied to `supervisor_instance_id`; if that child/protocol authority fails while the same supervisor remains live, its retained cgroup fd may still prove the bounded physical tree. Supervisor loss also loses that fd and remains `FencingUnconfirmed`; no path reopen reconstructs it. Shared servers are observation-only and killing one is forbidden.

### 7. GC retention and durable reconciliation

GC eligibility is lifecycle-aware before surface deletion. `Attaching|Active|Fencing|FencingUnconfirmed|Fenced|TerminalRetained`, pending attaches, `SessionBinding::Claiming|Managed`, versioned unresolved `ActiveOperationRecord`, `CancellationHandoff`, live/lost `SupervisorRecord` and socket identity, generation tombstones, fence-intent markers, activity locks, stale-event audits, and proof records are non-GCable regardless of `last_seen` or mtime. `SessionBinding::GcDeleting` is non-admissible and is processed only by exact-epoch GC resume. Only `TerminalReleasable` with a valid `ReleaseReceipt` can enter the ordinary managed age check.

`SessionBinding::Unmanaged` preserves legacy aging through this exact two-lock/CAS protocol; neither lock is nested and no external work occurs under either:

1. Under `with_gc_lock`, enumerate old candidates and immutable surface identities, then release it without deleting.
2. Under one short `with_lock`, revalidate that the Entry and every ordinary surface are older than cutoff; the binding lock is neither live nor unknown; no Claiming/cancel marker exists; no unexpired/retained pending token, managed worker, tombstone, proof, or audit record references the runtime id; and binding epoch/Entry version still match. Exact-CAS `Unmanaged→GcDeleting { gc_epoch, binding_epoch, entry_version }` in the same atomic registry write. This is the GC linearization point. Admission, pending-token creation, and SessionStart claim all re-read the binding under `with_lock` and refuse/retry `GcDeleting`; they can never publish Claiming across it.
3. Outside global locks, acquire the exact binding lock exclusively with a bounded try-lock. If it cannot be acquired before deletion begins, exact-CAS the untouched record back to Unmanaged and skip. Once held, reacquire `with_gc_lock`, revalidate pinned dev/inode/name/age identities, and delete ordinary surfaces except the binding lock, Entry, and binding record; release `with_gc_lock` before any `with_lock` call. A crash or I/O failure leaves durable `GcDeleting`; later GC resumes only with the exact `gc_epoch` and already-deleted surfaces are idempotently absent. Claim/admission remain refused.
4. After every ordinary surface is absent and while the exclusive binding fd is still held, acquire `with_gc_lock`, revalidate and unlink the binding-lock pathname while its old inode remains pinned by the fd, then release `with_gc_lock`. One final short `with_lock` exact-CASes the same `GcDeleting` epoch/version to remove Entry+binding record last. Only then release the fd. A crash or final-CAS failure retains `GcDeleting`; admission still refuses and exact-epoch GC can resume/finalize despite the already-absent lock pathname. No record-removal-before-lock-unlink window may let admission create a replacement lock that GC then unlinks.

Malformed/unknown binding state is preserved, never guessed eligible. Race tests pause after enumeration, after `GcDeleting` publication, after the first ordinary-surface deletion, and after binding-lock unlink; concurrent pending creation/SessionStart either wins before the CAS (GC makes zero deletions and preserves every byte) or sees `GcDeleting` (the claimant makes zero state/surface changes while GC deletes only the exact old candidate manifest and resumes idempotently). No fresh or out-of-candidate mailbox, audit, marker, lock, or registry byte may be lost.

Add CLI surfaces:

```text
relay lifecycle status <worker|session> --json
relay lifecycle reconcile <worker> --generation <uuid> --expected-version <n> --json
relay lifecycle reconcile-session <session> --binding-epoch <n> --operation <uuid> --expected-operation-version <n> --json
relay lifecycle release <worker> --generation <uuid> --expected-version <n> --proof-sha256 <hex>
relay lifecycle abandon <worker> --generation <uuid> --expected-version <n> --reason <text> --i-understand-processes-may-still-be-running
relay lifecycle abandon-session <session> --binding-epoch <n> --operation <uuid> --expected-operation-version <n> --reason <text> --i-understand-processes-may-still-be-running
```

`status` reports state/version/fence epoch, operation/handoff/supervisor authority, backend/scope, proof gap, last attempts, and an exact version-bound recovery command. Worker `reconcile` behaves as before. `reconcile-session` acts only on exact `UnmanagedCanceling` session/epoch/operation/version and the still-live matching supervisor; successful reap writes a terminal tombstone and advances binding epoch. `abandon-session` requires the same exact selectors, reason, and acknowledgement, advances the binding epoch with a risk-accepted tombstone, and prints **“NOT QUIESCENCE-PROVEN”**. Neither session command raw-signals observation-only PIDs or invents a worker. Shared servers cannot reconcile to ProtocolTree. Worker release/abandon remain exact generation/version/proof operations. Any stale selector changes nothing.

## Steps

| # | Task | Files | Depends | Status | Done condition / STOP trigger |
|---|---|---|---|---|---|
| 1 | Codify the confirmed feasibility foundation in a committed probe harness and minimum evidence schema: runtime/hook/process rows, explicit absence of a current durable app-server flush contract, strong-cgroup prerequisites, raw `clone3→ENOSYS`, and per-runtime ordinary-spawn probes. Emit raw-record hashes and measure attach/protocol bounds. | `plugins/session-relay/test/feasibility-probe.mjs`, `plugins/session-relay/test/fixtures/lifecycle-capability-schema.json`, `docs/plans/active/relay-worker-lifecycle-primitives.md:Notes` | — | done | Independently re-run A1 passed on commit `c32aafa17d1408157f87de5b616135212f33a2ed`; current evidence records `protocol_tree=unavailable`, measured attach deadline 4360 ms, Claude filtered-hardening available, and Codex filtered-hardening unavailable while cooperative eligibility remains. Re-run after runtime upgrades. |
| 2 | Add binding epochs/states, two-phase pending-token claim, binding/activity serialization, exact duplicate/resume rules, versioned lifecycle transitions, tombstones, receipts, and GC exclusions plus exact `GcDeleting` CAS/resume. Claiming publication remains the first short hook transaction; Active waits for older unmanaged guards to drain. | `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/rust/src/hook.rs`, `plugins/session-relay/rust/src/lib.rs`, `plugins/session-relay/rust/Cargo.toml`, `plugins/session-relay/rust/Cargo.lock`, `plugins/session-relay/rust/tests/lifecycle_managed.rs` | 1 | done | Commit `066262feda00cd416aad748cf89b4b4a28eb773a` independently passed the Step-2 managed lifecycle suite. Later steps may extend types but may not weaken the verified transition/GC invariants. |
| 3a | Retain the delivered capability-bound admission and publish-first fencing foundation, limited to its verified surface: target-free lower APIs, closed `ChildLaunchSpec`, no lifecycle-sensitive `exec`, exact guard target/kind/binding re-resolution, and the existing four compile boundaries. Do not call cancellation or inventories complete yet. | `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/rust/src/appserver.rs`, `plugins/session-relay/rust/src/bus.rs`, `plugins/session-relay/rust/src/channel.rs`, `plugins/session-relay/rust/src/cli.rs`, `plugins/session-relay/rust/src/hook.rs`, `plugins/session-relay/rust/src/watch.rs`, `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/tests/lifecycle_admission.rs`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/**` | 2 | done | Checkpoint `701cea7e671bc40ee23d69abf79ff102e0eecb20` independently passed A3a's narrowed existing guard/compile suite. The false-green cancellation/inventory claims are explicitly deferred to 3b–3d. |
| 3b | Add the minimal detached lifecycle supervisor/watchdog and versioned operation substrate before cancellation: supervisor owns every transition-capable Child from birth; preserves Closed/pipe/PTY stdin, EOF, output, resize, Ctrl-C/signal, exit, and backpressure; disconnect publishes exact UnmanagedOperation/Claim/Fence cancellation and drains/reaps; watchdog detects death without a caller. Add `UnmanagedCanceling`, exact disconnect-vs-Claiming transfer, closed commands, private child permit, operation/handoff versions, custody transitions, sealed reap proofs, and session-operation recovery. No pidfd/cgroup yet. | `plugins/session-relay/rust/src/supervisor.rs` (new), `plugins/session-relay/rust/src/main.rs`, `plugins/session-relay/rust/src/lib.rs`, `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/rust/tests/lifecycle_supervisor.rs` (new), `plugins/session-relay/test/supervisor-custody.mjs` (new), `plugins/session-relay/test/selftest.mjs`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/child-cancel-reentry.rs` (new), `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fabricated-owned-proof.rs` (new) | 3a | planned | A2/A3b prove interactive/noninteractive compatibility, unmanaged cancellation linearization, disconnect/flood, watchdog death publication, exact reap, stale zero-signal behavior, and no Child/PID reconstruction. If any pre-claim attach lacks exact cancellation or bidirectional supervisor behavior cannot be preserved, STOP as unbuildable. |
| 3c | Add exact turn/child cancellation on the 3b substrate: persist `TurnStartSentUnknown` before send and exact returned `turn.id` before pump; add `TurnCancellationPermit`, exact terminal observation, versioned `CancellationHandoff`, nonblocking 100 ms polling, and fixed 5s guard resolution/handoff. Unknown/lost authority exact-CASes `FencingUnconfirmed`; a child handoff remains owned by the detached supervisor. | `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/src/appserver.rs`, `plugins/session-relay/rust/src/supervisor.rs`, `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/rust/tests/lifecycle_turn_cancellation.rs` (new), `plugins/session-relay/test/fake-app-server.mjs`, `plugins/session-relay/test/lifecycle-smoke.mjs`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/cancel-reentry.rs` (new) | 3b | planned | A3c passes deterministic send/response/terminal and child-ignore-kill barriers plus operation-version winner/loser races. Any latest-turn guess, stale mutation, >100 ms individual block, guard held after 5s, dropped child authority, or unresolved operation disappearance: STOP. |
| 3d | Close the source-derived admission surface: make wake/watch mutation-guiding status guard-aware, map every generic outbound mutation primitive and caller to an executed unique behavior test, invoke every production `OperationKind` wrapper, and replace all placeholder/name-only counts. Include first-birth collision and wrong/stale/mid-block-fence rows. | `plugins/session-relay/rust/src/appserver.rs`, `plugins/session-relay/rust/src/cli.rs`, `plugins/session-relay/rust/src/watch.rs`, `plugins/session-relay/rust/tests/lifecycle_admission.rs`, `plugins/session-relay/test/reentry-inventory.mjs`, `plugins/session-relay/test/fixtures/reentry-inventory.json`, `plugins/session-relay/test/lifecycle-smoke.mjs`, `plugins/session-relay/test/selftest.mjs` | 3c | planned | A3d/A9/A10 pass with no placeholder behavior ids. Any mutation-guiding RPC precedes admission, a stale response guides a later mutation, or an inventory row lacks an executed production-wrapper test: STOP. |
| 4 | Extend the Step-3b supervisor with pidfd and `ConfinedCgroupCooperative`: gated placement into a fresh delegated domain leaf; retained generation-bound fd; exact domain/empty-subtree/kill checks; `cgroup.kill`→`populated 0`; fail-closed fd loss. Classify `CLONE_INTO_CGROUP` `EACCES|EBUSY|EOPNOTSUPP|ENOSYS` plus narrowly validated unsupported-feature `EINVAL`; use stop/GO only when independently proven. Add Claude-only best-effort filtered hardening and inventory every signal callsite. | `plugins/session-relay/rust/src/process_identity.rs` (new), `plugins/session-relay/rust/src/supervisor.rs`, `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/src/main.rs`, `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/test/process-signal-inventory.mjs` (new), `plugins/session-relay/test/fixtures/process-signal-inventory.json` (new), `plugins/session-relay/test/runtime-hook-abort.mjs` (new), `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fabricated-pidfd-proof.rs` (new), `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/tampered-cgroup-proof.rs` (new), `.github/workflows/build-binaries.yml` | 1-3d | planned | A4/A5/A5b prove stable signaling, gated membership, typed fallback, kill/populated-0 with no surviving in-model PID for both runtimes, and Claude-only filtered hardening. Intentional same-UID migration/brokers are labeled outside threat model, not successful-proof prerequisites. |
| 5 | Implement managed hook abort with Claiming publication first, bounded old-epoch drain, exact idempotent resume, Codex documented/Claude version-pinned SessionStart universal stop, required cross-runtime UserPromptSubmit block, explicit `timeout: 30` on both events, measured dead-man, and ordinary behavior compatibility. | `plugins/session-relay/rust/src/hook.rs`, `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/hooks/hooks.json`, `plugins/session-relay/hooks/codex-hooks.json`, `plugins/session-relay/test/runtime-hook-abort.mjs` (new), `plugins/session-relay/test/selftest.mjs` | 1-4 | planned | A2/A6 prove two-phase claim plus the isolated Claude/Codex event×timeout matrix. Claude SessionStart behavior is reported separately; UserPromptSubmit plus supervisor is mandatory. Any first-prompt sentinel, implicit timeout, or pre-Claiming hook work: STOP. |
| 6 | Consume Step-3c exact-turn handoffs through post-drain `FencePermit`; implement finite recursive lineage/turn pagination and exact background-terminal list/terminate. The real current Codex adapter must always return `MissingDurableFlushContract` for ProtocolTree. Exercise the positive graceful reject/flush/watermark/reap/offline contract only through a fake/future adapter; shared scans stay observation-only; physical fallback is `cgroup.kill`→`populated 0`. | `plugins/session-relay/rust/src/appserver.rs`, `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/test/fake-app-server.mjs`, `plugins/session-relay/test/runtime-appserver-quiescence.mjs` (new), `plugins/session-relay/test/lifecycle-smoke.mjs` | 3c-4 | planned | A7/A8 prove real runtime ProtocolIncomplete, fake adapter proof construction, finite pagination, exact terminal termination, late/continuous writer rejection, and physical fallback. Any real current-Codex row constructs ProtocolTree, bulk clean acknowledgement counts as completion, or equal/freeze scan constructs proof: STOP. |
| 7 | Add version-CAS lifecycle status/reconcile/release/abandon, cancellation-handoff diagnostics, stale-fencer rejection, receipts, and explicit release. Every cancellation/fence transition consumes exact generation+binding/fence epoch+version authority. | `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/src/cli.rs`, `plugins/session-relay/rust/src/main.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/test/lifecycle-smoke.mjs` | 2-6 | planned | A12/A13 prove stale cancellation/fence completion loses to reconcile/abandon and writes nothing; unresolved custody is non-GCable and status-addressable; proof-bound release/abandon use expected version. Any late actor overwrites newer state: STOP. |
| 8 | Complete adversarial unit/cross-process/real-runtime matrices and source-inventory enforcement; preserve all existing relay tests and isolated cleanup. Include supervisor caller-exit/crash, operation CAS losers, cancellation send/response/terminal barriers, Unmanaged attach/Claiming, GC-vs-claim pause points, raw ABI/procfs containment, optional-freeze rejection, and missing-flush runtime rows. | `plugins/session-relay/rust/src/appserver.rs`, `plugins/session-relay/rust/src/hook.rs`, `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/src/process_identity.rs`, `plugins/session-relay/rust/src/supervisor.rs`, `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/test/feasibility-probe.mjs`, `plugins/session-relay/test/supervisor-custody.mjs`, `plugins/session-relay/test/lifecycle-smoke.mjs`, `plugins/session-relay/test/process-signal-inventory.mjs`, `plugins/session-relay/test/reentry-inventory.mjs`, `plugins/session-relay/test/runtime-hook-abort.mjs`, `plugins/session-relay/test/runtime-appserver-quiescence.mjs`, `plugins/session-relay/test/fake-app-server.mjs`, `plugins/session-relay/test/selftest.mjs` | 2-7 | planned | A1-A14 pass; helpers clean children/stores in `finally`; externally observable sentinels and kernel/protocol evidence, not elapsed time alone, establish results. Cooperative-scope test labels are machine-checked. |
| 9 | Document guarantee tiers, `CooperativeWorkerV1`, exact cancellation custody, current `ProtocolTree` unavailability, hook-version/timeout contract, cgroup placement fallbacks, GC, and operator recovery; add an exact-SHA native-matrix dispatcher and run full gates without binary/release changes. | `plugins/session-relay/AGENTS.md`, `plugins/session-relay/skills/productivity/session-relay/SKILL.md`, `plugins/session-relay/rust/src/main.rs`, `plugins/session-relay/test/run-build-matrix.mjs` (new), `.github/workflows/build-binaries.yml` | 1-8 | planned | A15-A18 pass. Docs never call Darwin/start-time/tracked-tree/shared scans generation-safe, freeze a proof prerequisite, current Codex ProtocolTree-capable, or cooperative containment adversarial. Native dispatch refuses an unpushed/mismatched SHA. |

## Acceptance criteria

Run Node commands from repository root with `PATH="$HOME/.cargo/bin:$PATH"`; every Cargo command explicitly changes directory to `plugins/session-relay/rust/` first so `rust-toolchain.toml` pins Rust 1.85.0. A criterion passes only with its stated evidence; skips, placeholder behavior labels, self-authored booleans, or empty fixtures fail.

| ID | Criterion | Command | Expected output/result |
|---|---|---|---|
| A0 | Verify the one-time resume checkpoint and immutable main-worktree plan snapshot before first dispatch. | `test "$(pwd)" = /tmp/docks-primitives-collab && test "$(git branch --show-current)" = codex/primitives-collab && test "$(git rev-parse HEAD)" = 701cea7e671bc40ee23d69abf79ff102e0eecb20 && test -z "$(git status --porcelain)" && test -n "$PLAN_MAIN_COMMIT" && test -n "$PLAN_BLOB" && test "$(git -C /home/vagrant/projects/docks rev-parse HEAD)" = "$PLAN_MAIN_COMMIT" && test "$(git -C /home/vagrant/projects/docks hash-object docs/plans/active/relay-worker-lifecycle-primitives.md)" = "$PLAN_BLOB"` | Exit 0 once before implementation. The orchestrator exports the two plan values in the dispatch message. This is a pre-dispatch precondition, not a final gate and is not rerun after implementation advances HEAD. Workers read the absolute main-worktree plan; they do not cherry-pick plan commits. |
| A1 | Full feasibility evidence comes from the committed harness. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/feasibility-probe.mjs --verify-current` | Exit 0; validates raw schema/hash chain and existing 12 hook rows; records the exact app-server graceful stop/reject/flush/watermark/reap methods and raw responses or `protocol_tree=unavailable`; records 20s protocol deadline, cgroup kill/freeze, namespace/user-map/mount/detach-all-proc/seccomp audit-arch/x32/proc-pid-fd prerequisites, and native process rows. The candidate-filter transcript records raw `clone3=-1/ENOSYS`, no clone3 child, legacy namespace-clone denial, exact filter/policy hash, and per-runtime Claude/Codex ordinary shell/tool child+wait sentinel result. Always prints `shared_protocol=observation_only` and `worker_tree_threat_model=cooperative`; any failed prerequisite or spawn fallback prints `strong_cgroup=unavailable runtime=<claude|codex>`; no editable verdict overrides raw evidence. |
| A2 | Pending identity binding and unmanaged cancellation are atomic, epoch-serialized, and exact. | `(cd plugins/session-relay/rust && cargo test --locked managed_attach_ -- --nocapture)` | Exit 0; identity rows plus unmanaged disconnect races pass. Cancel-first exact-CASes `UnmanagedCanceling`, blocks claim/new mutation, and reaches reap→Unmanaged next epoch or direct Managed/FencingUnconfirmed at deadline. Claiming-first stales unmanaged authority with zero signal/state bytes and Claim authority takes custody. Exactly one path finalizes; lost/unreaped unmanaged operations remain session-status-addressable and non-GCable. |
| A3a | Capabilities bind authority and preserve publish-first fencing/attach lifetime. | `(cd plugins/session-relay/rust && cargo test --locked lifecycle_admission_ -- --nocapture) && node plugins/session-relay/test/reentry-inventory.mjs --compile-fail` | Both exit 0; wrong target is inexpressible and wrong `OperationKind` refuses at use; source finds zero lifecycle-sensitive `exec`; closed `ChildLaunchSpec` has no raw authority selectors; guard A cannot operate on B. The baseline four bins fail; later capability/proof bins may also run and must fail. This gate claims neither supervisor nor cancellation/inventory completion. |
| A3b | Detached supervisor/watchdog own each transition-capable Child/supervisor from birth and preserve attach/wake I/O. | `(cd plugins/session-relay/rust && cargo test --locked lifecycle_supervisor_ -- --nocapture) && node plugins/session-relay/test/supervisor-custody.mjs --matrix` | Exit 0. Pipe rows prove exact stdin bytes+EOF, separate stdout/stderr, exit, and slow-reader backpressure; wake/watch rows prove stdin is Closed/null and cannot hang waiting for input. Real PTY rows prove `isatty`, controlling terminal/foreground group, input, Ctrl-C, resize, signal allowlist, and output. Pre-claim unmanaged disconnect publishes exact `UnmanagedCanceling`; disconnect-vs-Claiming barriers prove the winner table. A post-disconnect flood proves bounded queues dropped/drained, exact cancellation, retained authority through reap, and no leak. No-caller supervisor death is CASed by watchdog within 5s; watchdog-first loss makes next re-entry refuse/CAS. Stale versions emit zero bytes; reap proof is supervisor-only. |
| A3c | Exact-turn and supervisor-owned-child cancellation close the guard-drain cycle within fixed bounds. | `(cd plugins/session-relay/rust && cargo test --locked lifecycle_turn_cancellation_ -- --nocapture) && node plugins/session-relay/test/lifecycle-smoke.mjs --case cancellation-custody && node plugins/session-relay/test/reentry-inventory.mjs --compile-fail` | Exit 0. Deterministic barriers cover before send, after send/before response, after response, before terminal, and supervisor child ignoring kill. Every custody transition exact-CASes `operation_version`; handoff consumes exact operation+handoff versions; losing delayed events only append stale audit. Cancellation emits exactly one interrupt for the persisted turn id and accepts only matching terminal. Every wait requests ≤100 ms; one 5s deadline ends in terminal/reap, exact handoff, or FencingUnconfirmed. Guard releases by deadline while the detached supervisor retains child authority. Existing four compile-fail bins plus new `cancel-reentry` fail. |
| A3d | Every production re-entry wrapper is guarded before any mutation-guiding observation and has executed behavior evidence. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case reentry-matrix && node plugins/session-relay/test/reentry-inventory.mjs --behavior-evidence` | Exit 0; wake/watch admission precedes the first mutation-guiding status RPC, a fence during status discards the stale response and emits no later mutation, and fenced first-read preserves mailbox. Every source-derived generic mutator/caller and every `OperationKind` names a unique executed behavior-test id covering success, wrong kind/epoch, pre-fence, and mid-block fence; no placeholder/rationale/fixed-count/name-only PASS remains. First-birth collision with an existing fenced id refuses registration and never starts a turn. |
| A4 | No check-then-kill path can signal a recycled identity. | `node plugins/session-relay/test/process-signal-inventory.mjs && (cd plugins/session-relay/rust && cargo test --locked stable_signal_ -- --nocapture)` | Both exit 0; source-derived inventory classifies every raw signal callsite and rejects ObservationOnly/start-check+kill; a deterministic syscall race fixture exits the observed target and substitutes a sentinel identity before action, with zero signal attempts and unchanged sentinel bytes; real pidfd-open-before-validation targets only the pinned task; live unreaped-Child signaling affects only its owned child; Darwin/no-pidfd recovery returns Unconfirmed without signaling. |
| A5 | Tree proof requires exact gated placement and kill evidence; filtered hardening remains separate. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case containment` | Exit 0; cooperative rows require a new domain/empty-subtree leaf, retained manager fd, verified initial membership, `cgroup.kill=1`, and `populated=0`. Fixtures classify `EACCES`, `EBUSY`, `EOPNOTSUPP`, `ENOSYS`, and narrowly validated unsupported-feature `EINVAL`; malformed `EINVAL` is a STOP and never fallback. Each uses stop/GO only after its independent capability check. Cooperative membership attempts cover ordinary child, nested namespace, double fork, and fork storm. Intentional direct migration/broker/SCM_RIGHTS rows are labeled `outside_threat_model` and ignored by proof validation. Optional freeze never upgrades proof. Separate Claude hardening rows prove proc/fd/namespace and exact arch/x32/clone3 actions. |
| A5b | Cooperative cgroup child creation works in BOTH runtimes with gated placement; the anti-escape filter is Claude-only hardening. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/runtime-hook-abort.mjs --case cgroup-cooperative-child-spawn --matrix` | Exit 0. The harness records host mount/delegation context (a sandbox read-only `/sys/fs/cgroup` is not misreported as host infeasibility). Isolated authenticated Claude and Codex are each gated into a new domain leaf, run their real sandbox, and create an in-model tool child, nested-namespace held grandchild, and fork storm; every host-visible PID created by those fixtures stays under the leaf. It writes `cgroup.kill=1` during the storm and requires `populated=0` with no surviving in-model PID. Intentional migration/broker fixtures are separately labeled outside threat model. Rows print `PASS cgroup_cooperative_spawn runtime=<runtime> gated=<clone3_into_cgroup|stop_go> domain=1`. Claude separately passes filtered hardening; Codex's expected bwrap denial does not reduce cooperative availability. |
| A6 | Both real CLIs block managed first-prompt failures through the documented required barrier. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/runtime-hook-abort.mjs --matrix` | Exit 0; isolated logs prove exact hook file/hash loaded and `timeout:30` parsed for both events. Codex SessionStart universal stop is verified; Claude SessionStart result is recorded as version-pinned empirical behavior, not counted as the sole barrier. For both runtimes UserPromptSubmit lifecycle block prevents model processing; timeout is deliberately fail-open and the supervisor fences/reaps before the 20s deadline. Duplicate SessionStart and sequential contention preserve absent sentinels. Output names each runtime/version/event result rather than relying on a fixed row count. |
| A7 | Real app-server fencing distinguishes exact cancellation, shared observation, current ProtocolTree unavailability, and physical kill. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/runtime-appserver-quiescence.mjs --matrix` | Exit 0; exact owned-turn interrupt reaches matching terminal; each background terminal is listed and terminated by exact process id. Every shared row remains `ProtocolObservation`. Every installed-current-Codex dedicated ProtocolTree row prints `ProtocolIncomplete reason=MissingDurableFlushContract`; process exit, stdio EOF, internal shutdown, `clean {}`, offline readability, idle, and equal scans cannot construct the receipt. A cooperative cgroup may instead `kill`→`populated 0` and produce only WorkerTree. |
| A8 | Protocol recovery is terminal-boundary and finite, with a fake/future positive adapter only. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case appserver-recovery` | Exit 0; fake adapter positive proof requires mutation rejection, flush watermark/ack, reap, and complete offline pagination to `nextCursor:null`. Missing/partial watermark, terminal pages, continuous spawner, after-second-pass child, bulk-clean acknowledgement, process kill, optional freeze, and idle all return ProtocolIncomplete within 20s. Real-adapter construction of `DurableFlushReceipt` is compile-time or runtime impossible. |
| A9 | Every mutator has a concrete matching capability and executed behavior evidence. | `node plugins/session-relay/test/reentry-inventory.mjs` | Exit 0; scans generic outbound app-server request primitives plus all callers, every drain/resume/inject/start/interrupt/list/terminate, process create/exec/signal, and pending acknowledgement. Each maps to target-free `ReentryGuard`, exact-owned-turn `TurnCancellationPermit`, or sealed post-drain `FencePermit`, plus a unique executed behavior-test id. Pure reads are source-verified and cannot guide later mutation after their guard goes stale. First-birth process/thread creation remains a source-verified non-reentry class only when its collision path proves it cannot attach to an existing fenced id. Source-derived N is reported, never fixed in a fixture; no rationale/name-only row passes. |
| A10 | Every production re-entry surface enforces target/kind/binding/cancellation epoch at use. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case reentry-matrix` | Exit 0; one production-wrapper row per source-derived `OperationKind` covers success, wrong kind, stale binding, pre-fence, and mid-block fence with externally observable no-mutation evidence. Wake/watch mutation-guiding status is inside admission and stale responses are discarded. Fenced rows emit no context/RPC/process; queue/peek remain allowed. No row prints a generic placeholder label. |
| A11 | GC cannot erase durable authority/custody and preserves legacy Unmanaged aging. | `(cd plugins/session-relay/rust && cargo test --locked managed_gc_ -- --nocapture)` | Exit 0; aged lifecycle states plus `UnmanagedCanceling`, pending/Claiming/Managed binding, tombstone, lock, proof, unresolved custody, supervisor/watchdog/socket/heartbeat, handoff, and stale audit survive. Only plain old Unmanaged enters `GcDeleting`; terminal reconciled/risk-accepted session-operation tombstones age only under their receipt rule. Deterministic crash/race barriers preserve exact bytes and Entry/binding removal remains last. |
| A12 | Operator transitions, session-operation recovery, supervisor reports, custody CAS, and competing fencers are exact-version. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case reconcile` | Exit 0; worker races behave as before. `reconcile-session` accepts only exact UnmanagedCanceling session/epoch/operation/version and live supervisor reap; `abandon-session` accepts the same exact selectors plus acknowledgement, advances epoch with risk receipt, and prints `NOT QUIESCENCE-PROVEN`. Stale session/worker completions change no lifecycle/custody/mail/process bytes and only append permitted audit. |
| A13 | Proof validation and capability families are exhaustive, sealed, scope-safe, epoch-bound, and threat-model-labeled. | `(cd plugins/session-relay/rust && cargo test --locked fence_proof_ -- --nocapture) && node plugins/session-relay/test/reentry-inventory.mjs --compile-fail` | Both exit 0; every backend×scope×evidence row passes. ProcessProof/FenceIntent/cgroup constructors and fields are private/sealed; fabricated owned-child/pidfd and constructed/mutated-cgroup bins fail to compile, while serialized tamper/runtime stale-supervisor rows fail closed. `TurnCancellationPermit` only interrupts its exact owned turn; supervisor privately mints child/fence permits; ReentryGuard/FencePermit cannot cross. Current Codex cannot build `DedicatedOfflineBoundaryProof`; optional freeze is absent. Cgroup WorkerTree requires the exact in-model receipt, supervisor kill/populated-0, fence epoch/version, and A5b. |
| A14 | Existing behavior remains green. | `(cd plugins/session-relay/rust && cargo test --locked) && node plugins/session-relay/test/selftest.mjs` | Exit 0; all Rust tests pass and selftest ends with its runtime-derived PASS count. Ordinary unmanaged hook/output/mailbox bytes remain compatible; attach output remains compatible except the intentional guarded spawn+wait behavior. |
| A15 | Formatting and warnings are clean. | `(cd plugins/session-relay/rust && cargo fmt --check && cargo clippy --locked --all-targets -- -D warnings)` | Exit 0, no format diff, no warnings. |
| A16 | Four architectures compile; Darwin observation semantics run natively. | `node plugins/session-relay/test/run-build-matrix.mjs --ref codex/primitives-collab --sha "$(git rev-parse HEAD)"` | **Owner approval is still required immediately before push/dispatch.** Helper exits 0 only when the clean remote `codex/primitives-collab` ref equals the supplied full SHA; otherwise prints `STOP: exact SHA is not on remote` and performs no mutation. It dispatches/watches only the matching run id/head SHA. Linux x86_64/aarch64 musl and native `macos-15-intel`/`macos-15` jobs are green; Darwin reports observation-only recovery; no artifacts are committed. |
| A17 | Full plugin/repo gates pass. | `node scripts/ci.mjs` | Exit 0 with all repo/plugin guards, Rust, selftest, hooks, skills, and manifests green; documented local binary digest warning only. |
| A18 | Diff is scoped and contains no binary/release mutation. | `git diff --check 12cf2ea..HEAD && test -z "$(git diff --name-only 12cf2ea..HEAD | rg -v '^(plugins/session-relay/(rust/src/.*|rust/tests/.*|rust/Cargo\.(toml|lock)|hooks/.*|test/.*|AGENTS\.md|skills/productivity/session-relay/SKILL\.md)|\.github/workflows/build-binaries\.yml|docs/plans/active/relay-worker-lifecycle-primitives\.md)$')"` | Exit 0; the captured unexpected-path output is empty. No `plugins/session-relay/bin`, manifest version, marketplace version, or unrelated path changes. This exact expression is regression-tested against `12cf2ea..701cea7` and must accept the legitimate existing Rust/test descendants. |

## Out of scope / do-NOT-touch

- Fan-out-specific recovery for never-Idle `Stopping`, partial `git worktree remove`, fence-owner lease/steal, cap/depth, handback, merge, and collection remains in `relay-worker-fanout` Draft-5.
- No raw kill fallback is added for Darwin/recovered non-pidfd Linux. Observation-only cleanup is intentionally incomplete and must remain unconfirmed.
- No claim that a merely delegated or partially isolated cgroup is authoritative; privileged/system-wide cgroup setup, root helper, launchd service, kernel extension, or system daemon requires separate approval.
- No claim that WorkerTree contains a deliberately adversarial same-UID task. Broker-assisted spawn or handoff through `systemd-run --user`, D-Bus `StartTransientUnit`, `SCM_RIGHTS`, or another reachable same-user service is outside `CooperativeWorkerV1`. IPC/network namespaces, broker-socket denial, and a full adversarial sandbox are future separate scope.
- No claim that relay controls direct human/third-party app-server clients. Relay gates all of its own surfaces; external mutation remains outside the trust boundary. Only a relay-owned stdio-only dedicated server plus physical containment proves exclusivity.
- Do not kill a shared app-server or promote any of its scans to ProtocolTree proof in this plan. A future barrier API requires a separate acquire/hold/release capability review. Dedicated stdio containment is explicit, never inferred.
- Do not change ordinary unmanaged mailbox semantics, trust fencing, discovery, or the age cutoff for legacy Unmanaged GC; only add the binding-lock/pending-reference safety predicates specified here. Do not change committed binaries, versions, tags, or releases.
- Do not edit `plugins/session-relay/bin/**`: plan acceptance builds native targets but committing generated binaries would mix producer/release work into the source change.
- Do not edit plugin manifests or `.claude-plugin/marketplace.json` / `.agents/plugins/marketplace.json`: no version or release is authorized by this implementation plan.
- Do not edit `docs/plans/active/relay-worker-fanout.md`: its fan-out-specific lifecycle design consumes these primitives only after this plan ships.

## Known gotchas

- Opening pidfd **after** a generation check still races; open first, then validate the pinned target.
- An unreaped Child prevents PID reuse but does not prevent descendants escaping its process group. Its proof scope is explicit.
- `populated 0` says nothing about a process intentionally migrated outside the leaf. It is authoritative only for the explicit `CooperativeWorkerV1` set: runtime born in the leaf plus ordinary/nested descendants whose membership probes stayed there; intentional same-UID migration is outside the claim.
- Flock writer fairness is not a safety primitive. Fence intent keeps post-intent readers out; cancellation bounds pre-intent readers.
- `attach --exec` closes CLOEXEC locks. Even an Unmanaged attach can become Claiming while its resumed CLI lives, so every transition-capable attach/resume keeps relay as the waiting parent; “managed only” is insufficient.
- An Unmanaged guard is not timeless. First SessionStart must publish Claiming/increment binding epoch, drain older guards, and finalize Managed only after they release; every use re-resolves the epoch.
- Capability targets and kinds cannot be caller arguments. If a lower mutator accepts both a guard and an independent session/thread/process selector, the guard is forgeable by substitution.
- `thread_state` currently calls `thread/resume`; status must use pure `thread/read` or an admitted resume.
- A first-birth (Codex `Command::spawn` with hook-assigned id, app-server `thread/start` with returned thread id) is a creation, not re-entry, and takes no invented `BirthPermit`; its registration collision path must reject an existing fenced id. This does **not** exempt `turn/start`: it targets an existing thread, must be guard-authorized, and its returned exact turn id becomes durable custody before pumping.
- App-server `turn/start` may have succeeded when the response is lost. Persist the pending-send state before writing; never erase or guess an unknown active turn.
- `turn/interrupt` completion does not stop background terminals or child threads. Every thread/page/terminal needs evidence.
- A daemonized process can evade app-server terminal bookkeeping. Without authoritative process containment, protocol proof is not WorkerTree proof.
- Two identical lineage passes prove neither completeness nor exclusion. A shared server needs a held mutation-rejecting barrier; a dedicated server needs graceful mutation rejection, durable flush watermark, exit/reap, and final offline scan. Freeze is not a flush.
- A `FencePermit` from an older fence epoch is hostile stale authority after timeout, reconcile, release, or abandon; every fence action and terminal transition must re-resolve/CAS exact version.
- A read-only cgroup mount is bypassable through inherited fds, inherited procfs/alternate mounts, `/proc/<host-pid>/{fd,fdinfo,root,cwd}`, new namespaces, or remount syscalls unless the ordered namespace/proc/fd/seccomp contract closes every direct route.
- Seccomp BPF cannot dereference `clone3`'s pointer argument; filtering namespace flags inside that struct is fictitious. Deny `clone3` wholesale with `SECCOMP_RET_ERRNO|ENOSYS`, **not EPERM**, so glibc `posix_spawn` falls back to legacy `clone`; keep namespace flags denied on that legacy path and prove ordinary spawn/wait for **Claude** under the filter (the Claude-only `FilteredCgroupHardening` tier). **Codex's `bwrap` sandbox needs the denied `unshare`/`mount`, so it cannot run under this filter and uses the unfiltered `ConfinedCgroupCooperative` tier instead** — its containment comes from cgroup membership (namespace-independent) + `cgroup.kill`, not the filter. Validate `seccomp_data.arch`, and on x86_64 reject `__X32_SYSCALL_BIT` before dispatch.
- A same-user broker acts outside the worker's seccomp/cgroup namespace. `populated 0` cannot prove absence of intentionally broker-spawned sibling work; that is an explicit threat-model boundary, not a cgroup proof bug hidden by wording.
- Frozen state can contain queued children or unflushed writes, and tasks may migrate while frozen. Freeze is optional observation only; if used it must end in kill plus `populated 0`, never thaw-through-release or ProtocolTree promotion.
- Claude's event-specific SessionStart documentation is context-oriented while universal `continue:false` is documented globally. Preserve a version-pinned empirical row, but make cross-runtime prompt safety depend on UserPromptSubmit plus the supervisor, with explicit 30-second handler timeouts.
- A SessionStart token inherited or repeated for the exact bound session is an idempotency key, not a globally reusable attach credential.
- Managed hook claim must precede current GC/marker/register/drain work. One nearly exhausted three-second lock attempt cannot be followed by more pre-Active lock paths.
- Queue/peek are safe while fenced; drains are not. Refused drains must preserve mailbox bytes exactly.
- GC must inspect lifecycle before deleting **any** candidate surface; preserving only the registry row after deleting locks/tombstones is insufficient.
- Wall-clock stability of a sentinel is supporting evidence only; terminal/process exit and complete pagination remain authoritative.

## Global constraints

- **“FEASIBILITY FIRST. Step 1 must be a research/feasibility spike; design only what the platforms actually allow.”** Current evidence makes absent app-server durable flush and any unavailable cgroup/runtime-spawn capability explicit unavailability, never optimistic proof.
- **“never call git/process/RPC while holding with_lock/with_gc_lock.”** Also never sleep or wait under those locks.
- Keep the global store flock timeout exactly three seconds.
- Target x86_64+aarch64 musl-linux and Darwin builds.
- Fallback tiers can never claim a stronger scope than their evidence.
- Keep primitives general and independently testable; fan-out is only the first consumer.
- WorkerTree guarantees are bounded to the explicit cooperative-worker threat model unless the owner chooses a future adversarial-isolation expansion.
- Managed fallback forbids full-access until hook abort and physical containment capabilities are proven for that runtime.
- Never weaken validators, security fences, test assertions, or binary provenance.

## STOP conditions

- Any observation/start-time check is followed by raw PID/PGID signal without a live pidfd, unreaped Child, or verified confined-cgroup handle.
- An in-model ordinary/nested/double-fork/fork-storm descendant leaves the worker leaf, or boundary mount/dev/inode/generation/threat-model tag does not match. Intentional same-UID ancestor/sibling migration and broker/SCM_RIGHTS fixtures must be labeled `outside_threat_model`, not required-denial proof or adversarial containment.
- Cooperative placement is non-atomic, the fresh leaf is not exact domain/empty-subtree with writable kill, clone3 errors are generically retried, `EINVAL` falls back without proving valid args plus unsupported feature, stop/GO was not separately proven, an in-model descendant survives outside the leaf, or `populated 0` is claimed while an in-model host-visible PID remains.
- `FilteredCgroupHardening` (Claude-only) setup moves the wrapper after cgroup-namespace creation, retains an inherited procfs mount, exposes host proc/alternate cgroupfs/proc-pid-fd authority, leaks a control fd, omits native arch/x32 validation, lets raw `clone3` create a child or return anything except `-1/ENOSYS`, permits namespace/remount syscalls through legacy paths, or tries to recover proof after losing the exact manager fd. Codex being filtered-unavailable is expected and must NOT reduce its cooperative-tier availability.
- Fence intent is not visible before reader drain, post-intent readers can start external work, a prior operation lacks exact cancellation, or any lifecycle-sensitive attach/resume uses `exec` or releases its guard before supervisor reap/exact custody handoff.
- The transition-capable child is spawned outside the detached supervisor, caller exit drops child authority, supervisor commands accept raw executable/target authority, a stale operation/claim/fence version signals, supervisor loss adopts/reconstructs a Child/PID, watchdogless supervisor death remains Ready/Active, or pipe/PTY stdin/EOF/output/resize/signal/backpressure/disconnect semantics regress.
- A pre-SessionStart unmanaged child cannot be canceled by exact session+binding epoch+operation+version authority, disconnect-vs-Claiming is not one atomic winner, `UnmanagedCanceling` admits new mutation/GC, or an unresolved no-worker operation lacks exact status/reconcile/abandon surfaces.
- `turn/start` does not persist pending-send and exact returned id, cancellation guesses latest/thread-only targets, matching terminal evidence is absent, a stale claim/fence epoch emits an RPC, an individual cancellation block exceeds 100 ms, a guard survives the 5s grace, or a live Child is dropped/waited indefinitely instead of remaining owned by the detached supervisor.
- Admission returns a capability with an independently supplied authority target, fails to bind kind/epoch, or lets an old Unmanaged guard cross Claiming→Managed/Fencing.
- The source-derived inventory finds an unmapped generic mutator/caller, a rationale-only mutation, a placeholder/name-only behavior row, a mutation-guiding status RPC before admission, or a lower API callable without matching sealed `ReentryGuard`/`TurnCancellationPermit`/`FencePermit`.
- Codex first SessionStart cannot publish Claiming/increment epoch first, drain older guards, exact-CAS Managed, or reject conflicting/replayed identity; duplicate/resume semantics differ from the table.
- GC removes or makes unreachable any non-releasable worker, pending claim, active operation/custody handoff/supervisor record, session binding, tombstone, fence marker, lifecycle lock, proof, or audit surface.
- Unmanaged GC deletes any surface before exact `GcDeleting` publication, permits pending/Claiming/admission across that state, rolls back after deletion begins, or cannot idempotently resume an exact `gc_epoch` after crash.
- `finish_fence` accepts root/process/protocol evidence for a recorded WorkerTree requirement, or any tracked-tree path returns confirmed.
- Any custody/supervisor/fence action or finish/timeout/reconcile/release/abandon transition omits exact operation+handoff+generation+claim/fence epoch+version validation/CAS, or a stale actor changes newer state.
- `FenceIntent`, pidfd-exit/owned-child-reap/cgroup proof is caller-constructible or proof-critical cgroup fields are externally mutable without the private matching supervisor constructor.
- The installed current-Codex adapter constructs `ProtocolTreeProof` or `DurableFlushReceipt`; app-server proof uses live shared/equal scan, `clean {}`, stdio EOF, internal shutdown, freeze, process kill, or unflushed offline artifacts; exact terminal pagination is incomplete; or the 20s deadline expires without `ProtocolIncomplete`.
- A1 can pass with fabricated booleans, A5b does not run both real CLIs in recorded host delegation context, A6 omits explicit timeouts/UserPromptSubmit model-block evidence, A7 never starts real writers, or A9 uses a fixed count/placeholder test id.
- Managed attach performs GC/register/marker/mailbox drain before Claiming publication, waits while holding the global lock, deadline formula exceeds 20s, or global lock timeout is lengthened.
- Shared-server loss has neither actionable status/reconcile nor explicit audited abandonment, or abandonment is presented as quiescence.
- Three attempts repeat the same test/lint failure without a new diagnosis; append `## Mistakes & Dead Ends` and reassess.

## Cold-handoff checklist

1. **File manifest:** present — each step names exact existing/new paths and current line ranges for cited callsites.
2. **Environment & commands:** present — base, versions, four targets, isolated real-runtime setup, measured deadline formula, and exact gates are specified.
3. **Interface & data contracts:** present — binding epoch/Claiming, durable operation custody, three sealed capability families, exact cancellation/fence CAS, cooperative cgroup fallback, explicit current ProtocolTree unavailability/future adapter, proofs, GC, and operator APIs are explicit.
4. **Executable acceptance:** present — A0–A18 plus A3a–A3d are command + expected evidence, including detached-supervisor crash/lifetime, operation-CAS races, adversarial matrices, and source-derived behavior ids.
5. **Out of scope:** present — fan-out specifics, unsafe raw signaling, adversarial same-UID broker isolation, privileged helpers, arbitrary clients, shared-server kill, binaries/releases, and unrelated changes are excluded.
6. **Decision rationale:** present — every non-obvious choice is tied to a red-team defect and failure mode.
7. **Known gotchas:** present — TOCTOU, Unmanaged attach transition, capability substitution, fence epoch, namespace/remount/proc/fd/ABI escape, freeze/unflushed lineage, broker scope, GC, and timing traps are explicit.
8. **Global constraints verbatim:** present — feasibility-first, no external work under locks, targets, and honest tiering are carried forward.
9. **No undefined terms / forward refs:** present — every state, scope, guard, proof, receipt, test harness, and structured question is defined; no TODO/TBD remains.

Adversarial cold-read result: a cold executor need not invent binding serialization, exact turn/child custody, cancellation handoff, authority targets, fence epochs/CAS, cgroup fallback/error routing, hook timeout/version semantics, current protocol-proof availability, scan deadlines, GC eligibility, proof promotion, or operator release rules. No owner decision remains open; remote push/dispatch remains a separate execution-time approval gate.

## Open questions

- **Resolved 2026-07-11** — `threat-model-scope`: owner selected **Option 1, `CooperativeWorkerV1`**. Implementation and acceptance adopt the cooperative model; broker-assisted same-UID evasion is out of scope. See ## Threat model.

- **Resolved 2026-07-11** — `codex-cooperative-cgroup-tier`: the filtered candidate passes Claude but blocks Codex's normal `bwrap` namespace/mount path, so the owner selected **Option A**: a `ConfinedCgroupCooperative` WorkerTree tier for both runtimes and a separate Claude-only `FilteredCgroupHardening` best-effort layer. Primary-source re-review preserves the decision but tightens it: the cooperative proof is gated placement into a fresh domain leaf with empty `cgroup.subtree_control`, retained fd, `cgroup.kill=1`, and `populated=0`; freeze is optional observation. Direct placement classifies `EACCES|EBUSY|EOPNOTSUPP|ENOSYS` plus narrowly validated unsupported-feature `EINVAL` and falls back only to separately proven stop/GO. In-model ordinary/nested descendants must remain in the leaf; intentional same-UID migration/brokers are diagnostic and outside `CooperativeWorkerV1`. Option B and Option C remain rejected.

## Self-review

Score: **96/100 (provisional Draft-10 author pass)** · trajectory **95 Draft-9 author → 96 READY architecture / 90 NOT READY acceptance → 94 unmanaged-authority repair → 96 cold-read** · stopped: **pending final acceptance recheck**.

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

## Notes

- Step 1 appends the committed harness git-blob hash, raw artifact hashes, exact runtime versions, 10-run timing samples, derived deadline, and capability verdicts here. Large raw protocol/hook transcripts remain in the harness-owned temporary artifact directory, not pasted into the plan.
- Independent red-team trajectory: Draft-1 **56/100**; Draft-2 **74/100**; Draft-3 **80/100**; Draft-4 **93/100** after its final convergence pass. Draft-5 changes only the clone3 return action plus its feasibility/acceptance proof and reaches **95/100** without reopening affirmed invariants.

- **Step-1 feasibility result (2026-07-11, orchestrator-run in the real authenticated env; harness on `codex/primitives-impl`, git-blob `02cea7b`, commit `c32aafa`):** `RELAY_REAL_RUNTIME_TEST=1 node …feasibility-probe.mjs --verify-current` → **PROBE_EXIT=0**, evidence `sha256=76728fa8…`, chain head `bfd40220…`, 49 records, hash chain re-validated intact. Verdicts: `shared_protocol=observation_only`; `worker_tree_threat_model=cooperative`; `protocol_tree=unavailable` (no durable-flush contract); `protocol_lineage` deadline 20000 ms, measured **609 ms**; 20/20 attach-timing samples 468–2360 ms → `managed_attach_deadline_ms=4360`; Claude filtered hardening available; Codex filtered hardening unavailable because normal bwrap needs the denied namespace/mount syscalls. **A1 PASSES.** Draft-7 retains the cooperative cgroup tier for both runtimes but corrects its authoritative sequence to gated fresh-domain placement → `cgroup.kill` → `populated 0`; freeze is optional observation. Darwin CI (A16) remains owner-push-gated.

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
- [Codex app-server](https://learn.chatgpt.com/docs/app-server#api-overview) — `turn/start` returns the initial turn; exact interrupt, turn pagination, and exact background-terminal list/terminate exist, but no public durable shutdown/flush watermark exists.
- [Codex interrupt example](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md#example-interrupt-an-active-turn) — exact interrupt request and terminal event; background terminals survive interrupt.
- [Linux pidfd](https://man7.org/linux/man-pages/man2/pidfd_open.2.html) and [`/proc/pid/stat`](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html) — stable fd vs observation-only start generation.
- [Linux cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html) — namespace delegation reachability, `cgroup.freeze`/`frozen`, `cgroup.kill`, `populated`, and the fact that freeze alone still permits migration.
- [Linux cgroup namespaces](https://man7.org/linux/man-pages/man7/cgroup_namespaces.7.html), [mount namespaces](https://man7.org/linux/man-pages/man7/mount_namespaces.7.html), and [user namespaces](https://man7.org/linux/man-pages/man7/user_namespaces.7.html) — namespace root is the creator's current cgroup; private cgroupfs mounts and user-namespace capabilities/mappings establish the setup order and prerequisites.
- [Linux seccomp filters](https://www.kernel.org/doc/html/latest/userspace-api/seccomp_filter.html), [`seccomp.h`](https://github.com/torvalds/linux/blob/master/include/uapi/linux/seccomp.h), [`seccomp(2)`](https://man7.org/linux/man-pages/man2/seccomp.2.html), and [`no_new_privs`](https://www.kernel.org/doc/html/latest/userspace-api/no_new_privs.html) — classic BPF cannot dereference pointer arguments; `SECCOMP_RET_ERRNO` returns its lower data bits as `errno`; filters must validate architecture; and x86-64/x32 need explicit syscall-number discrimination.
- [`clone(2)` / `clone3`](https://man7.org/linux/man-pages/man2/clone.2.html) — direct `CLONE_INTO_CGROUP` placement and its `EACCES`/`EBUSY`/`EOPNOTSUPP` failure modes; `clone3` pointer arguments remain opaque to classic seccomp.
- [glibc Linux `spawni.c`](https://github.com/bminor/glibc/blob/master/sysdeps/unix/sysv/linux/spawni.c#L416-L438) — current `posix_spawn` tries `clone3` first and takes the legacy-clone fallback only for `ENOSYS`/`EINVAL`; `EPERM` would make managed child/tool spawn fail instead of falling back.
- [`proc_pid_fd(5)`](https://man7.org/linux/man-pages/man5/proc_pid_fd.5.html), [`ptrace(2)`](https://man7.org/linux/man-pages/man2/ptrace.2.html), [`process_vm_readv(2)`](https://man7.org/linux/man-pages/man2/process_vm_readv.2.html), and [`pidfd_getfd(2)`](https://man7.org/linux/man-pages/man2/pidfd_getfd.2.html) — proc/fd and cross-process fd/memory surfaces are authority paths to probe/deny after namespace setup.
- [Apple XNU process info](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/proc_info.h) and [`libproc.h`](https://github.com/apple-oss-distributions/xnu/blob/main/libsyscall/wrappers/libproc/libproc.h) — Darwin observation fields/private enumeration, not an atomic signal handle.

## Review

*(filled by plan-review on completion)*
