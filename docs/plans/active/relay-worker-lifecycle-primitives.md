---
title: Build relay worker lifecycle primitives
goal: Add verified hook abort, stable-handle process control, and lifecycle-gated worker quiescence without allowing fallback tiers to claim false confirmation.
status: planned
created: "2026-07-11T03:31:53-03:00"
updated: "2026-07-11T04:25:38-03:00"
started_at: null
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
  - plugins/session-relay/rust/src/watch.rs
  - plugins/session-relay/rust/Cargo.toml
  - plugins/session-relay/rust/Cargo.lock
  - plugins/session-relay/hooks/hooks.json
  - plugins/session-relay/hooks/codex-hooks.json
  - plugins/session-relay/test/fake-app-server.mjs
  - plugins/session-relay/test/feasibility-probe.mjs
  - plugins/session-relay/test/lifecycle-smoke.mjs
  - plugins/session-relay/test/process-signal-inventory.mjs
  - plugins/session-relay/test/reentry-inventory.mjs
  - plugins/session-relay/test/runtime-appserver-quiescence.mjs
  - plugins/session-relay/test/runtime-hook-abort.mjs
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/test/fixtures/lifecycle-capability-schema.json
  - plugins/session-relay/test/fixtures/process-signal-inventory.json
  - plugins/session-relay/test/fixtures/reentry-inventory.json
  - plugins/session-relay/test/fixtures/lifecycle-guard-bypass/Cargo.toml
  - plugins/session-relay/test/fixtures/lifecycle-guard-bypass/src/main.rs
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

Build three general, independently testable relay capabilities: (A) prevent a managed hook-born Claude or Codex CLI from processing its first prompt when attach fails; (B) signal processes only through a kernel-stable handle or an unreaped supervisor-owned child, and confirm a worker tree only behind an escape-proof containment boundary; and (C) cancel and prove every app-server thread/turn/terminal in a managed worker lineage while every relay drain, resume, injection, turn start, process launch, and attach consults a durable lifecycle.

The result must distinguish **process-only**, **protocol-only**, and **worker-tree** evidence. Observation-only PID/start-time data, stable-looking descendant snapshots, a single interrupted turn, `thread/read idle`, root-process exit, or `cgroup.events populated 0` without anti-migration confinement can never release a worker-tree capacity slot. Unsupported or lost capabilities remain `FencingUnconfirmed`, continue refusing every relay re-entry/drain, survive GC, and expose bounded operator reconcile/abandon paths.

## Context & rationale

- `relay-worker-fanout` is blocked on three general relay-core primitives. Its lifecycle-specific recovery/collection items remain out of scope; this plan provides only reusable attach, admission, process, quiescence, and reconciliation contracts.
- Independent Draft-1 red-team verification confirmed the feasibility foundation: Codex app-server has `turn/interrupt {threadId,turnId}` and terminal `turn/completed interrupted`; Claude and Codex support SessionStart `continue:false` and UserPromptSubmit block; hook timeout is fail-open; Linux has pidfd, `/proc` field-22, cgroup v2 `cgroup.kill`/`populated 0`; rustix 1.1.4 gates pidfd to Linux; Darwin exposes `proc_bsdinfo`/`libproc`. Draft-2 does not reopen those facts. It fixes the unsafe completeness assumptions built on top of them.
- A start-time comparison followed by raw `kill`/`killpg` is check-then-act: the target can exit and its PID/PGID can recycle between operations. Darwin `proc_bsdinfo` and Linux start-time fallback are therefore **observation only**, not generation-safe signal handles.
- A delegated cgroup writable by the same user is not automatically a confinement boundary. A descendant can migrate to an ancestor/sibling before `cgroup.kill`; the worker cgroup then reports `populated 0` while the escaped process remains live. Strong cgroup proof requires a tested namespace/permission/sandbox boundary that denies escape, plus generation-bound path identity.
- A read/write flock alone cannot bound fencing. A writer may starve behind new readers, and a reader may hold through a 300-second pump, unbounded wake, or `attach --exec`; CLOEXEC then drops the guard while the resumed CLI continues. Fence intent must publish before drain, new admissions must refuse without joining the reader queue, and every admitted operation must be cancelable and bounded.
- Re-entry is broader than `watch --auto-turn`: current drains exist in CLI inbox, MCP inbox, channel, hook, watch, and wake. Current app-server status/ack/deliver call `thread/resume`; pending acknowledgement is its own turn-start path. The inventory must be mechanically complete, not a hand-counted list.
- Codex CLI has no pre-minted session id. Managed state therefore needs a pre-launch `worker_id`, a pending token-hash index, and an atomic first-SessionStart binding to the discovered `runtime_session_id`. Duplicate SessionStart and resume are idempotent only for the exact bound identity; token replay to another identity is refused.
- Current GC ages out registry entries and relay surfaces without a managed-state exemption. Every non-releasable managed record, pending attach, generation tombstone, fence marker, and lifecycle lock must be preserved regardless of age.

## Feasibility and guarantee tiers

| Capability | Confirmed buildable path | What can never be claimed |
|---|---|---|
| Hook abort | Managed attach is the first short locked transaction; SessionStart returns structured stop on failure; UserPromptSubmit independently blocks non-Active workers; a detached supervisor retains an unreaped child handle and a measured deadline below the 30-second UserPromptSubmit minimum. | If both hooks are skipped/regress, the supervisor watchdog is a bounded best effort, not a hard scheduler guarantee. On a platform without worker-tree containment, killing the owned root does not prove descendants absent. |
| Process signal | Linux: open pidfd **before** validating start generation, then signal that pinned task. Live supervisor: signal/kill an unreaped `Child` it still owns. Strong Linux tree: generation-bound, escape-proof cgroup boundary, then `cgroup.kill` and `populated 0`. | Darwin or Linux without pidfd after supervisor recovery must not raw-signal. PID/start-time is observation only. Process exit or owned process-group exit never proves an arbitrary worker tree. |
| Cgroup tree | Create before CLI exec; bind exact mount/dev/inode/path to worker generation; hide/deny ancestor and sibling migration; adversarially prove writes to escape targets fail before and during fence. | A merely delegated user-writable subtree is unconfirmed even if `cgroup.kill` succeeds and `populated 0` is observed. |
| App-server protocol | Interrupt exact persisted turns; recursively enumerate root/child thread lineage to a fixed point; prove persisted terminal status for every turn; paginate and empty background terminals for every thread. | One interrupted root turn or one empty terminal list is protocol-incomplete. Protocol quiescence alone is not physical worker-tree quiescence if child/daemon processes can escape bookkeeping. |
| Worker-tree release | Exhaustive proof validation accepts only a strong confined-cgroup proof, or compound app-server lineage proof plus an authoritative process-containment proof for a relay-owned dedicated server. | Shared app-server, tracked descendant trees, stable snapshots, observation-only identities, and root-only proofs remain `FencingUnconfirmed`. |

## Environment & how-to-run

- **Checkout/base:** `/home/vagrant/projects/docks-primitives`, branch `codex/relay-worker-lifecycle-primitives`; Draft-1 commit `07ad2df`; drift base remains `12cf2ea` as required by the originating plan. Run A0 before implementation.
- **Toolchain:** Rust `1.85.0`; locked rustix `1.1.4`; Node 24; committed Cargo lock. Targets: x86_64/aarch64 musl-linux and x86_64/aarch64 Darwin.
- **Confirmed-source rule:** Step 1 codifies the already-confirmed red-team feasibility facts in a committed, runnable probe harness. It does not substitute hand-written booleans or re-argue the docs.
- **Local commands:**
  ```bash
  export PATH="$HOME/.cargo/bin:$PATH"
  cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked
  node plugins/session-relay/test/selftest.mjs
  node plugins/session-relay/test/lifecycle-smoke.mjs --all
  node plugins/session-relay/test/reentry-inventory.mjs
  node scripts/ci.mjs --plugin session-relay
  ```
- **Real runtime:** `runtime-hook-abort.mjs`, `runtime-appserver-quiescence.mjs`, and `feasibility-probe.mjs` create isolated temporary `HOME`, `CODEX_HOME`, plugin config, relay store, cwd, and sentinels. They must record the exact loaded hook path/hash and runtime version. Missing auth/runtime is failure for the real-runtime gate, never skip/pass.
- **Probe evidence contract:** each capability row contains `runtime`, `runtime_version`, `platform`, `argv`, `started_at`, `finished_at`, `exit_status`, base64 or artifact-path `stdout`/`stderr`, artifact SHA-256, parser rule, and derived verdict. The harness rejects a verdict without matching raw evidence, rejects unknown/missing schema fields, verifies its own committed git-blob hash, and emits the raw-record hash chain. There is no editable pass/fail fixture.
- **Measured attach deadline:** the probe runs 10 isolated cold starts per runtime including sequential store-lock contention. Set `managed_attach_deadline_ms = max_observed_ms + max(2000, ceil(max_observed_ms / 2))`; it must be `<= 20_000`, preserving at least 10 seconds below the 30-second UserPromptSubmit minimum. If the formula exceeds 20 seconds, STOP. Never lengthen the three-second global store lock.
- **Cancellation bounds:** `managed_cancel_poll_ms = 100` and `managed_cancel_grace_ms = 5_000`. Every admitted blocking loop observes cancellation at least once per poll interval. At grace expiry, stop waiting, persist the still-active operation ids in `FencingUnconfirmed`, and hand them to `lifecycle status`; never extend the grace to obtain a green test. `pending_attach.expires_at` is launch time plus the measured `managed_attach_deadline_ms`, so claim-vs-expiry is decided by the one atomic claim transaction.
- **Native platform matrix:** re-verify runner labels in Step 1, then run Darwin process probes natively on `macos-15-intel` and `macos-15`; cross-linking x86_64 on arm64 is not semantic verification.
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
    ConfinedCgroup,
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
    pub worker_id: String,
    pub generation: String,
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

`claim_managed_attach(token, runtime_session_id, tool, cwd)` is the **first** managed hook transaction and uses one `with_lock`: hash token; resolve `pending_managed[token_hash]`; validate generation/tool/canonical cwd/expiry and optional Claude id; require no conflicting `session_binding`; bind the Codex id if absent; write worker `Active`, Entry binding, session binding, and claimed-token hash; remove the pending row. Do not run GC, marker writes, ordinary register, inbox drain, RPC, or process work first. After Active, marker/ordinary registration/GC run as best-effort follow-ups and cannot undo the authoritative binding.

Duplicate/resume semantics are exact:

| Input | Result |
|---|---|
| Concurrent duplicate with same claimed token + same runtime id/generation/tool/cwd | Idempotent Active success; no version/state churn and no second claim. |
| SessionStart resume without token + exact existing session binding/tool/cwd | Re-evaluate lifecycle: Active continues; any fenced/nonterminal-stop state emits structured stop. |
| Claimed token with different runtime id/tool/cwd/generation | Refuse and audit; never rebind. |
| Expired unclaimed token | Refuse; `Attaching→Fencing`; supervisor fences using retained handles. |
| Token replay after bind to a second worker/id | Refuse and audit. |

The closed transitions are `Attaching→Active|Fencing`; `Active→Fencing`; `Fencing→Fenced|FencingUnconfirmed`; `FencingUnconfirmed→Fencing` only through reconcile; `Fenced→TerminalRetained`; `TerminalRetained→TerminalReleasable` only through explicit owner release; `FencingUnconfirmed→TerminalReleasable` only through audited risk-accepting abandonment. No other transitions exist. Only `TerminalReleasable` may age out.

### 2. Fence-intent admission, cancellation, and compile-time guards

Every managed operation uses the authoritative lifecycle record plus a per-worker `activity.lock`. The atomically saved `ManagedState::Fencing` record is the fence-intent publication and linearization point; a separate generation-bound marker may cache it for fast refusal but is never authoritative:

1. Under one short `with_lock`, validate generation and CAS `Active→Fencing` in the registry's atomic save; release the global lock. Only after that durable publication may code materialize a cache marker or begin drain. A crash between the CAS and cache creation remains fenced because every admission reads the authoritative record.
2. `admit_operation` reads the authoritative state before touching `activity.lock`, acquires a shared activity guard only for Active/unmanaged work, then rechecks authoritative state + generation. A racer admitted before publication releases immediately after the recheck. A caller whose first state read occurs after publication refuses without joining the shared-reader queue.
3. Fencer publishes cancellation after the CAS, then acquires the activity lock exclusively. Previously admitted operations must observe cancellation and release within their operation-specific bound. If exclusive drain misses `managed_cancel_grace_ms`, transition to `FencingUnconfirmed`; do not wait forever or claim Fenced.
4. No global store lock is held while waiting, spawning, pumping, interrupting, or signaling.

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
    AttachManaged,
    Deliver,
    InitialTurn,
}

pub struct ReentryGuard { /* private fields: worker/generation/kind/activity/deadline/cancel */ }
pub struct FencePermit { /* generation-bound fence intent + exclusive activity guard */ }

pub enum Admission {
    Unmanaged(ReentryGuard),
    Managed(ReentryGuard),
    Refused { worker_id: String, state: ManagedState, reason: String },
}

pub fn admit_operation(session_or_worker: &str, kind: OperationKind) -> Result<Admission, String>;
pub fn publish_fence(worker_id: &str, generation: &str, reason: &str) -> Result<FenceIntent, String>;
pub fn drain_prior_operations(intent: FenceIntent) -> Result<FencePermit, DrainError>;
```

`ReentryGuard` constructors and fields remain private to `lifecycle.rs`. Change lower layers so bypasses fail compilation:

```rust
store::drain_with_guard(id, &ReentryGuard)
appserver::resume_with_guard(server, thread, &ReentryGuard)
appserver::inject_with_guard(..., &ReentryGuard)
appserver::start_turn_with_guard(..., &ReentryGuard)
spawn::run_child_with_guard(..., &ReentryGuard)
```

No public/internal `store::drain(id)` or mutating app-server/process helper without a guard remains. Queue, peek, registry reads, and pure `thread/read` may remain allowed. The committed source-derived inventory maps every drain, app-server mutation, process creation/exec/signal, and pending acknowledgement callsite to an `OperationKind` or an explicit non-re-entry class (`FenceControl`, `UnmanagedOnly`, or `ReadOnly`) with rationale; CI fails on an unmapped or stale match.

Every admitted external operation has a cancellation contract: WebSocket/socket reads poll cancellation with bounded read deadlines; settle sleep is interruptible; turn pumps interrupt on cancellation; wake/managed attach spawn a child, retain the unreaped `Child`, poll cancel, then kill/wait through that owned handle; watch fallback waits similarly. Managed `attach --exec` must **not** call `exec`. It spawns and waits under `AttachManaged`; plain managed attach prints no copyable resume command and instructs the user to use the guarded exec path. If a child cannot be canceled/reaped within the grace, fencing stays unconfirmed.

### 3. Stable signal handles and containment proof

```rust
pub enum SignalHandle {
    LinuxPidFd { fd: OwnedFd, expected: ProcessObservation },
    SupervisorChild { child: Child, expected: ProcessObservation }, // unreaped
    ConfinedCgroup { control: OwnedFd, boundary: CgroupBoundary },
    ObservationOnly(ProcessObservation),
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
    pub worker_id: String,
    pub generation: String,
    pub mount_id: u64,
    pub manager_root_dev: u64,
    pub manager_root_ino: u64,
    pub worker_dir_dev: u64,
    pub worker_dir_ino: u64,
    pub worker_dir_owner_uid: u32,
    pub worker_dir_mode: u32,
    pub relative_path: String,
    pub generation_component: String,
    pub cgroup_namespace_ino: u64,
    pub escape_control: CgroupEscapeControl,
}

pub enum CgroupEscapeControl {
    NamespaceRootPlusReadOnlyMount,
    SandboxDeniedCgroupFs,
}
```

`ProcessIdentityRecord` is durable observation/recovery input; `SignalHandle` is live, non-serializable authority. Linux pidfd recovery order is **open pidfd first, then read/compare the generation while the fd pins the task**, then signal via pidfd. If pidfd open fails or the pinned observation mismatches, do not raw-signal. On Darwin and Linux without pidfd, recovery produces `ObservationOnly` and returns unconfirmed. A live supervisor may safely act through its unreaped `Child` only when its instance id matches the record; once reaped/dropped/restarted, that authority is gone. `killpg` is permitted only while an unreaped owned group leader prevents PGID reuse, and it proves group scope only—not escaped descendants or WorkerTree.

Managed launch uses `__managed-child-exec`: wrapper blocks before exec; parent persists worker/handle, establishes confinement, verifies exact membership/boundary, then sends `GO`. For cgroup strong tier, the child sees a cgroup namespace/mount/sandbox view in which writes that could move it above/outside the generation-bound worker subtree fail. The manager retains an fd to the exact cgroup control directory; recovery reopens only after matching mount/dev/inode/path/generation. Any mismatch or successful escape probe downgrades to observation-only/unconfirmed.

### 4. Exhaustive, scope-bound proof validation

```rust
pub enum ProcessProof {
    PidFdExited { worker_id: String, generation: String, pid: u32 },
    OwnedChildReaped { worker_id: String, generation: String, pid: u32 },
}

pub struct CgroupTreeProof {
    pub worker_id: String,
    pub generation: String,
    pub boundary: CgroupBoundary,
    pub escape_probe: EscapeProbeReceipt,
    pub populated_zero_observed: bool,
}

pub struct EscapeProbeReceipt {
    pub worker_id: String,
    pub generation: String,
    pub before_fence_attempts: Vec<EscapeAttempt>,
    pub during_fence_attempts: Vec<EscapeAttempt>,
    pub raw_evidence_sha256: String,
}

pub struct EscapeAttempt {
    pub target: String,
    pub denied_errno: i32,
    pub membership_unchanged: bool,
}

pub struct ThreadQuiescence {
    pub thread_id: String,
    pub parent_thread_id: Option<String>,
    pub turns: Vec<TurnTerminalProof>,
    pub terminal_pages_sha256: String,
    pub terminal_next_cursor_is_null: bool,
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
    pub fixed_point_passes: u8, // exactly 2 identical complete passes
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
    pub worker_id: String,
    pub generation: String,
    pub fencing_version: String,
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

pub fn finish_fence(worker: &ManagedWorker, evidence: FenceEvidence) -> Result<FenceOutcome, String>;
```

`finish_fence(worker_snapshot, evidence)` exhaustively matches recorded generation, backend, and `required_scope`. `ProcessProof` can satisfy only `ProcessOnly`; `ProtocolTreeProof` only `ProtocolTree`; only `WorkerTreeProof` satisfies `WorkerTree`. A `TrackedTree` backend **always** returns `Unconfirmed` even when two snapshots look stable and every observed PID exits. Root exit is never promoted to tree proof. Unknown future evidence/backend variants fail closed.

### 5. Hook attach and measured dead-man

Managed SessionStart performs only the atomic claim first. It does not run GC, marker, ordinary register, or drain before Active. On claim failure it returns exit-0 JSON with top-level `continue:false`/`stopReason`, records the error, and notifies the detached supervisor. UserPromptSubmit admits `UserPromptDrain`; non-Active state returns documented block JSON without draining. Ordinary unmanaged behavior remains byte-compatible and fail-open.

The supervisor holds the unreaped root child and, where available, strong cgroup control. Its deadline comes from the measured formula in Environment—not a hard-coded four seconds. Sequential contention tests queue multiple near-timeout store users and prove the attach claim is still first; failure blocks the prompt and fences, never lengthens `with_lock` beyond three seconds.

The bounded race is explicit. When the installed hooks execute under their verified contracts, SessionStart stop or the 30-second-minimum UserPromptSubmit block keeps the prompt behind a watchdog deadline of at most 20 seconds, leaving at least 10 seconds for owned-child termination and wait. If the runtime skips both hooks or violates that contract, prompt execution may begin any time from CLI exec until the watchdog acts; the residual window is at most `managed_attach_deadline_ms` for a scheduled supervisor with a live owned-child handle, but it is not zero and cannot be a hard scheduler guarantee. Root termination is only ProcessOnly unless strong containment proves the tree.

### 6. App-server lineage, already-terminal recovery, and physical scope

Persist every `turnId`. Fencing first blocks relay re-entry, then recursively proves the app-server lineage:

1. Interrupt the root's exact active turn and wait for matching `turn/completed interrupted` when connected.
2. Enumerate descendants via paginated `thread/list` parent/ancestor filters to `nextCursor:null`; for each thread enumerate turns via `thread/read includeTurns:true` or paginated `thread/turns/list` and persist parent/thread/turn/status edges.
3. Interrupt every active descendant turn; repeat lineage enumeration until **two complete identical passes** show no new descendants and every known turn terminal.
4. For recovery after a notification was missed, accept only persisted exact-turn status from `includeTurns`/`turns/list`; `thread/read idle` alone is forbidden.
5. For every thread, create/observe the real background-terminal test case, call clean, paginate list to `nextCursor:null`, and require empty. Repeat lineage enumeration after terminal cleanup.
6. A real child-agent test creates a child-thread writer sentinel. A daemonized-process test attempts to escape terminal bookkeeping. If either writer continues or disappears from bookkeeping without authoritative containment, evidence is protocol-only/unconfirmed.

Shared app-server can at most produce `ProtocolTreeProof`; it cannot produce WorkerTree proof because its OS process is shared. WorkerTree proof requires a relay-owned **dedicated** `codex app-server` inside an escape-proof generation-bound cgroup, connected only through supervisor-owned stdio pipes with no socket listener, plus the full protocol proof and physical cgroup proof. The live unreaped app-server `Child`/stdio authority is tied to `supervisor_instance_id`; after supervisor loss the stdio protocol path is unrecoverable, so only the verified cgroup proof may confirm the tree. Killing a shared server is forbidden.

### 7. GC retention and durable reconciliation

GC eligibility is lifecycle-aware before surface deletion. `Attaching|Active|Fencing|FencingUnconfirmed|Fenced|TerminalRetained`, pending attaches, session bindings, generation tombstones, fence-intent markers, activity locks, and proof/audit records are non-GCable regardless of `last_seen` or mtime. Only `TerminalReleasable` with a valid `ReleaseReceipt` can enter the ordinary age check. Registry/session binding removal remains last, and tombstone removal is part of the same explicitly releasable candidate.

Add CLI surfaces:

```text
relay lifecycle status <worker|session> --json
relay lifecycle reconcile <worker> --generation <uuid> --json
relay lifecycle release <worker> --generation <uuid> --proof-sha256 <hex>
relay lifecycle abandon <worker> --generation <uuid> --reason <text> --i-understand-processes-may-still-be-running
```

`status` reports state, backend/scope, retained handles, proof gap, last attempts, and exact recovery command. `reconcile` republishes fence intent and retries only authoritative evidence paths; it never raw-signals observation-only PIDs. Restore-same-server, reconnect/lineage proof, pidfd reopen, owned-child wait, or verified cgroup proof may succeed. Successful proof produces `Fenced`; closing retained handles/resources produces `TerminalRetained`. `release` requires exact generation and matching persisted proof hash, appends a proved `ReleaseReceipt`, and moves only `TerminalRetained→TerminalReleasable`. `abandon` is the sole risk-accepting capacity-release path: explicit generation + nonempty reason + exact acknowledgement flag, append-only risk-accepted receipt, transition to `TerminalReleasable`, and output **“NOT QUIESCENCE-PROVEN”**. It never produces Fenced/WorkerTree proof.

## Steps

| # | Task | Files | Depends | Status | Done condition / STOP trigger |
|---|---|---|---|---|---|
| 1 | Codify the confirmed feasibility foundation in a committed probe harness and minimum capability-evidence schema: versions, raw argv/stdout/stderr/status/timestamps, loaded hook hash/path, per-runtime SessionStart/UserPromptSubmit allow/block/timeout matrix, exact app-server interrupt/terminal/background/list methods, pidfd/rustix gating, cgroup anti-migration capability, and native Darwin observation-only APIs. Emit a raw-record hash chain and harness git-blob hash; measure attach deadline. | `plugins/session-relay/test/feasibility-probe.mjs` (new), `plugins/session-relay/test/fixtures/lifecycle-capability-schema.json` (new), `docs/plans/active/relay-worker-lifecycle-primitives.md:Notes` | — | planned | A1 passes without editable pass/fail booleans. If measured deadline exceeds 20s, current runtime lacks an enumerated capability, raw evidence/schema/hash validation fails, or hook source cannot be proven isolated/loaded, STOP before Rust changes. |
| 2 | Add worker-id/pending-token/session-binding schema, exact claim/duplicate/resume rules, lifecycle transitions, generation tombstones, release receipts, GC exemptions, and first-transaction managed attach. | `rust/src/lifecycle.rs` (new), `rust/src/store.rs:1023-1205,1208-1292`, `rust/src/hook.rs:195-240`, `rust/src/lib.rs`, `rust/Cargo.toml`, `rust/Cargo.lock` | 1 | planned | A2/A11 prove Codex atomic binding, duplicates/replay/expiry matrix, managed attach first transaction, and aged nonterminal retention. Any GC path can erase a non-releasable record/surface or any pre-claim GC/register/drain occurs: STOP. |
| 3 | Implement publish-first authoritative Fencing state, bounded cancellation/drain, private typed `ReentryGuard`, complete source-derived inventory, and guard-required drain/mutation APIs across CLI/MCP/channel/hook/watch/appserver/spawn. Replace managed attach exec with spawn+wait under guard. Add a tiny fixture crate that intentionally calls the lower API without a guard; the inventory harness requires `cargo check` to fail for the private/missing guard. | `rust/src/lifecycle.rs`, `rust/src/store.rs`, `rust/src/appserver.rs`, `rust/src/bus.rs:283-315`, `rust/src/channel.rs:174-195`, `rust/src/cli.rs:269-367,885-903,925-1105`, `rust/src/hook.rs:195-240`, `rust/src/watch.rs:245-310,555-640`, `rust/src/spawn.rs`, `test/fixtures/lifecycle-guard-bypass/Cargo.toml` (new), `test/fixtures/lifecycle-guard-bypass/src/main.rs` (new), `test/reentry-inventory.mjs` (new), `test/fixtures/reentry-inventory.json` (new) | 2 | planned | A3/A9/A10 pass writer-starvation, crash-between-CAS-and-cache, 100ms cancellation polling/5s grace, exec-lifetime, complete drain, pending-ack, and compile-boundary cases. Any unguarded drain/mutator remains or a post-intent admission begins external work: STOP. |
| 4 | Implement stable handle acquisition/signaling and scope-limited proofs: pidfd-open-then-validate, unreaped Child, observation-only recovery, barriered exec, generation-bound cgroup identity, and tested anti-migration boundary. Inventory every signal callsite; never raw-signal after observation-only validation. | `rust/src/process_identity.rs` (new), `rust/src/spawn.rs:337-495,662-793`, `rust/src/main.rs:14-59`, `rust/src/lifecycle.rs`, `rust/src/store.rs`, `test/process-signal-inventory.mjs` (new), `test/fixtures/process-signal-inventory.json` (new), `.github/workflows/build-binaries.yml` | 1-3 | planned | A4/A5 force exit+PID reuse between observation/action, pre/during-fence cgroup escape attempts, stable tracked snapshots, and supervisor restart. Any raw signal callsite lacks a stable-handle class, replacement receives a signal, worker escapes strong cgroup, or tracked tree returns confirmed: STOP. |
| 5 | Implement managed hook abort with atomic claim first, exact idempotent resume, structured SessionStart stop, UserPromptSubmit drain gate, measured dead-man, and ordinary behavior compatibility. | `rust/src/hook.rs`, `rust/src/spawn.rs`, `rust/src/store.rs`, `hooks/hooks.json`, `hooks/codex-hooks.json`, `test/runtime-hook-abort.mjs` (new), `test/selftest.mjs` | 1-4 | planned | A6 proves the full Claude/Codex event×timeout matrix from isolated loaded hooks, absent sentinels, duplicate/bound identity behavior, and sequential contention. Any first-prompt sentinel appears: STOP. |
| 6 | Implement exact-turn interruption, persisted already-terminal recovery, recursive paginated child-thread lineage to a two-pass fixed point, per-thread paginated background cleanup, child-writer/daemon sentinels, and compound protocol+physical proof. | `rust/src/appserver.rs:50-76,84-241,537-617`, `rust/src/spawn.rs:337-495`, `rust/src/lifecycle.rs`, `test/fake-app-server.mjs`, `test/runtime-appserver-quiescence.mjs` (new), `test/lifecycle-smoke.mjs` (new) | 1-4 | planned | A7/A8 prove live background/child writers stop, every page reaches null cursor, missed notifications recover from exact persisted turn status, shared server stays protocol-only, and daemon escape prevents WorkerTree proof. Any root-only or idle-only evidence reaches Fenced: STOP. |
| 7 | Add durable lifecycle status/reconcile/release/abandon, audit receipts, explicit release transition, and diagnostics for shared-server loss, observation-only recovery, stale handles, and containment failure. | `rust/src/lifecycle.rs`, `rust/src/cli.rs`, `rust/src/main.rs`, `rust/src/store.rs`, `test/lifecycle-smoke.mjs` | 2-6 | planned | A12 proves safe reconcile, exact handoff diagnostics, proof-bound release, explicit abandonment wording/audit/generation checks, and no silent permanent leak. Any automatic risk acceptance or abandonment labeled quiescent: STOP. |
| 8 | Add adversarial unit/cross-process/real-runtime matrices and source-inventory enforcement; preserve all existing relay tests and isolated cleanup. | `rust/src/appserver.rs`, `rust/src/hook.rs`, `rust/src/lifecycle.rs`, `rust/src/process_identity.rs`, `rust/src/spawn.rs`, `rust/src/store.rs`, `test/feasibility-probe.mjs`, `test/lifecycle-smoke.mjs`, `test/process-signal-inventory.mjs`, `test/reentry-inventory.mjs`, `test/runtime-hook-abort.mjs`, `test/runtime-appserver-quiescence.mjs`, `test/fake-app-server.mjs`, `test/selftest.mjs` | 2-7 | planned | A1-A14 pass; helpers clean children/stores in `finally`; externally observable sentinels and kernel/protocol evidence, not elapsed time alone, establish results. |
| 9 | Document guarantee tiers, unsupported fallbacks, identity binding, admission/cancel, GC retention, recursive app-server scope, and operator recovery; run native target and full repo gates without binary/release changes. | `plugins/session-relay/AGENTS.md`, `skills/productivity/session-relay/SKILL.md`, `rust/src/main.rs`, `.github/workflows/build-binaries.yml` | 1-8 | planned | A15-A18 pass. Docs never call Darwin/start-time/tracked-tree/shared-server protocol evidence generation-safe or worker-quiescent. |

## Acceptance criteria

Run from repository root with `PATH="$HOME/.cargo/bin:$PATH"`. A criterion passes only with its stated evidence; skips, self-authored booleans, or empty fixtures fail.

| ID | Criterion | Command | Expected output/result |
|---|---|---|---|
| A0 | Reconcile source drift before implementation. | `git diff --stat 12cf2ea..HEAD -- plugins/session-relay/rust plugins/session-relay/hooks plugins/session-relay/test plugins/session-relay/AGENTS.md plugins/session-relay/skills/productivity/session-relay/SKILL.md .github/workflows/build-binaries.yml` | Before implementation stdout is empty; plan-only commits are outside this path set. Any source drift is reconciled first. |
| A1 | Full feasibility evidence comes from the committed harness. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/feasibility-probe.mjs --verify-current` | Exit 0; validates the minimum evidence schema; prints committed harness git-blob SHA and raw-record hash chain; records exact argv/stdout/stderr/status/timestamps, Claude/Codex versions, isolated loaded hook paths/hashes, all 12 runtime×event×allow/block/timeout hook rows, app-server interrupt/terminal/background/lineage method rows, pidfd/rustix/cgroup/Darwin rows, 10 timing samples per runtime, derived deadline `<=20000`, then `PASS: lifecycle feasibility matrix`. Missing/raw-mismatched evidence or a manually populated verdict exits nonzero. |
| A2 | Pending identity binding is atomic and exact. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked managed_attach_ -- --nocapture` | Exit 0; rows pass for Claude prebound id, Codex unknown→bound id, concurrent duplicate, claimed-token duplicate, resume without token, replay-to-new-id, wrong id/tool/cwd/generation, expiry, and conflicting session binding. Exactly one claim commits. |
| A3 | Fence intent prevents starvation and survives exec lifetime. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked lifecycle_admission_ -- --nocapture && node plugins/session-relay/test/reentry-inventory.mjs --compile-fail` | Both exit 0; crash immediately after authoritative `Active→Fencing` save still refuses; adversarial callers whose first read follows intent never acquire activity; prior 300s-pump/wake fixtures poll cancel within 100ms and release within 5s; writer finishes bounded; managed attach spawns/waits and cancel-reaps its child; fixture crate's guardless lower-API call fails `cargo check` for missing/private `&ReentryGuard`; no managed path calls `exec`. |
| A4 | No check-then-kill path can signal a recycled identity. | `node plugins/session-relay/test/process-signal-inventory.mjs && cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked stable_signal_ -- --nocapture` | Both exit 0; source-derived inventory classifies every raw signal callsite and rejects ObservationOnly/start-check+kill; a deterministic syscall race fixture exits the observed target and substitutes a sentinel identity before action, with zero signal attempts and unchanged sentinel bytes; real pidfd-open-before-validation targets only the pinned task; live unreaped-Child signaling affects only its owned child; Darwin/no-pidfd recovery returns Unconfirmed without signaling. |
| A5 | Tree proof requires anti-migration confinement; tracked trees never confirm. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case containment` | Exit 0; worker escape writes to ancestor/sibling/alternate cgroupfs fail before and during fence; mount/dev/inode/owner/mode/path/generation mismatch fails proof; cgroup sentinel stops and exact retained boundary reports populated 0; plain delegated cgroup is Unconfirmed; **every** tracked-tree case (stable clean snapshot, observed setsid child, early reparent) returns `UnconfirmedDescendants`. |
| A6 | Both real CLIs block every managed first-prompt failure mode. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/runtime-hook-abort.mjs --matrix` | Exit 0; for Claude and Codex, isolated logs prove exact hook file/hash loaded and rows pass for SessionStart attach failure, SessionStart timeout, UserPromptSubmit lifecycle block, UserPromptSubmit timeout + supervisor fence, duplicate SessionStart, and sequential lock contention; every sentinel is absent; final `PASS: 12 managed hook-abort rows`. |
| A7 | Real app-server fencing stops root, child thread, and actual background writers. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/runtime-appserver-quiescence.mjs --matrix` | Exit 0; starts a root turn, child-agent thread writer, and real background terminal writer; interrupts exact turns; observes persisted terminal status; paginates descendants/turns/terminals to `nextCursor:null`; writer PIDs exit and sentinel sizes stop changing; shared-socket row proves ProtocolTree only; dedicated row proves stdio-only/no-listener ownership and, when strong cgroup containment is available, compound WorkerTree; daemon-escape row is Unconfirmed without that containment; final `PASS: app-server recursive quiescence matrix`. |
| A8 | Missed-notification recovery uses persisted exact-turn evidence. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case appserver-recovery` | Exit 0; fake server emits completion before reconnect; recovery finds exact turn terminal through includeTurns/turns-list across multiple pages, reaches two identical lineage passes, and rejects idle-only, missing-turn, new-child-between-pass, partial-page, and nonempty-terminal fixtures. |
| A9 | Re-entry inventory is source-derived and complete. | `node plugins/session-relay/test/reentry-inventory.mjs` | Exit 0; scans every `store::drain`, app-server mutation (`thread/resume`, inject, turn/thread start, interrupt, terminal clean), process creation/exec/signal, and pending-ack callsite; exact committed manifest covers all with no stale rows, classifies every non-re-entry exception with rationale, and prints `PASS: <N> classified lifecycle-sensitive callsites` using source-derived N (never a hard-coded expected count). |
| A10 | Every gated surface refuses without consuming fenced mail or mutating runtime state. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case reentry-matrix` | Exit 0; derives one row for every gated `OperationKind` in the A9 manifest, including hook SessionStart/UserPrompt, CLI/MCP inbox, channel delivery, watch inject/auto-turn/ack/wake fallback, wake app-server/CLI, managed attach, deliver, and initial turn; fenced rows emit no context/RPC/process, mailbox byte hash and app-server turn/thread counts are unchanged, while queue/peek remain allowed. Missing or extra manifest kinds fail. |
| A11 | GC cannot erase a durable fence. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked managed_gc_ -- --nocapture` | Exit 0; 30-day-old Attaching/Active/Fencing/FencingUnconfirmed/Fenced/TerminalRetained plus pending/binding/tombstone/lock/fence/proof surfaces survive; only TerminalReleasable with valid receipt ages out atomically; registry/binding removal is last. |
| A12 | Confirmed and unconfirmed states have explicit, audited operator paths. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case reconcile` | Exit 0; status JSON names proof gap + exact command; restored shared server reconciles via persisted lineage; observation-only case does not signal; release refuses wrong generation/proof/state and accepts only matching TerminalRetained proof; bad generation/reason/ack refuses abandonment; valid explicit abandon appends a risk-accepted receipt, prints `NOT QUIESCENCE-PROVEN`, and becomes TerminalReleasable without Fenced proof. |
| A13 | Proof validation is exhaustive and scope-safe. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked fence_proof_ -- --nocapture` | Exit 0; every backend×required-scope×evidence row is asserted; ProcessOnly cannot satisfy ProtocolTree/WorkerTree, ProtocolOnly cannot satisfy WorkerTree, tracked/root-exit never confirm WorkerTree, mismatched generation/boundary fails, unknown variant fails closed. |
| A14 | Existing behavior remains green. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked && node plugins/session-relay/test/selftest.mjs` | Exit 0; all Rust tests pass and selftest ends with its runtime-derived PASS count. Ordinary unmanaged hook/output/CLI bytes remain compatible. |
| A15 | Formatting and warnings are clean. | `cargo fmt --manifest-path plugins/session-relay/rust/Cargo.toml --check && cargo clippy --manifest-path plugins/session-relay/rust/Cargo.toml --locked --all-targets -- -D warnings` | Exit 0, no format diff, no warnings. |
| A16 | Four architectures compile; Darwin observation semantics run natively. | `gh workflow run build-binaries.yml --ref codex/relay-worker-lifecycle-primitives && gh run watch --exit-status "$(gh run list --workflow build-binaries.yml --branch codex/relay-worker-lifecycle-primitives --limit 1 --json databaseId --jq '.[0].databaseId')"` | Linux x86_64/aarch64 musl builds green; native `macos-15-intel` and `macos-15` build/probe jobs green; Darwin reports observation-only after supervisor recovery. No artifacts are committed. |
| A17 | Full plugin/repo gates pass. | `node scripts/ci.mjs` | Exit 0 with all repo/plugin guards, Rust, selftest, hooks, skills, and manifests green; documented local binary digest warning only. |
| A18 | Diff is scoped and contains no binary/release mutation. | `git diff --check 12cf2ea..HEAD && git diff --name-only 12cf2ea..HEAD | rg '^(plugins/session-relay/(rust/src|rust/Cargo\.(toml|lock)|hooks|test|AGENTS\.md|skills/productivity/session-relay/SKILL\.md)|\.github/workflows/build-binaries\.yml|docs/plans/active/relay-worker-lifecycle-primitives\.md)$' -v` | First exits 0; second prints nothing/exits 1; no `plugins/session-relay/bin`, manifest version, marketplace version, or unrelated path changes. |

## Out of scope / do-NOT-touch

- Fan-out-specific recovery for never-Idle `Stopping`, partial `git worktree remove`, fence-owner lease/steal, cap/depth, handback, merge, and collection remains in `relay-worker-fanout` Draft-5.
- No raw kill fallback is added for Darwin/recovered non-pidfd Linux. Observation-only cleanup is intentionally incomplete and must remain unconfirmed.
- No claim that a merely delegated cgroup is authoritative; privileged/system-wide cgroup setup, root helper, launchd service, kernel extension, or system daemon requires separate approval.
- No claim that relay controls direct human/third-party app-server clients. Relay gates all of its own surfaces; external mutation remains outside the trust boundary. Only a relay-owned stdio-only dedicated server plus physical containment proves exclusivity.
- Do not kill a shared app-server. Dedicated server containment is a separate capability selected by policy, never silently inferred.
- Do not change ordinary unmanaged mailbox semantics, trust fencing, discovery, flat-file GC behavior for unmanaged entries, committed binaries, versions, tags, or releases.
- Do not edit `plugins/session-relay/bin/**`: plan acceptance builds native targets but committing generated binaries would mix producer/release work into the source change.
- Do not edit plugin manifests or `.claude-plugin/marketplace.json` / `.agents/plugins/marketplace.json`: no version or release is authorized by this implementation plan.
- Do not edit `docs/plans/active/relay-worker-fanout.md`: its fan-out-specific lifecycle design consumes these primitives only after this plan ships.

## Known gotchas

- Opening pidfd **after** a generation check still races; open first, then validate the pinned target.
- An unreaped Child prevents PID reuse but does not prevent descendants escaping its process group. Its proof scope is explicit.
- `populated 0` is true after a process migrates away. It is authoritative only together with a proven anti-migration boundary.
- Flock writer fairness is not a safety primitive. Fence intent keeps post-intent readers out; cancellation bounds pre-intent readers.
- `attach --exec` closes CLOEXEC locks. Managed attach must keep relay as the waiting parent.
- `thread_state` currently calls `thread/resume`; status must use pure `thread/read` or an admitted resume.
- `turn/interrupt` completion does not stop background terminals or child threads. Every thread/page/terminal needs evidence.
- A daemonized process can evade app-server terminal bookkeeping. Without authoritative process containment, protocol proof is not WorkerTree proof.
- Two identical lineage passes are not exclusive against another client. A dedicated-server WorkerTree proof also needs stdio-only ownership with no listener and authoritative physical containment.
- A SessionStart token inherited or repeated for the exact bound session is an idempotency key, not a globally reusable attach credential.
- Managed hook claim must precede current GC/marker/register/drain work. One nearly exhausted three-second lock attempt cannot be followed by more pre-Active lock paths.
- Queue/peek are safe while fenced; drains are not. Refused drains must preserve mailbox bytes exactly.
- GC must inspect lifecycle before deleting **any** candidate surface; preserving only the registry row after deleting locks/tombstones is insufficient.
- Wall-clock stability of a sentinel is supporting evidence only; terminal/process exit and complete pagination remain authoritative.

## Global constraints

- **“FEASIBILITY FIRST. Step 1 must be a research/feasibility spike; design only what the platforms actually allow.”** Draft-2 codifies the independently confirmed facts in a committed executable harness rather than re-deriving them.
- **“never call git/process/RPC while holding with_lock/with_gc_lock.”** Also never sleep or wait under those locks.
- Keep the global store flock timeout exactly three seconds.
- Target x86_64+aarch64 musl-linux and Darwin builds.
- Fallback tiers can never claim a stronger scope than their evidence.
- Keep primitives general and independently testable; fan-out is only the first consumer.
- Managed fallback forbids full-access until hook abort and physical containment capabilities are proven for that runtime.
- Never weaken validators, security fences, test assertions, or binary provenance.

## STOP conditions

- Any observation/start-time check is followed by raw PID/PGID signal without a live pidfd, unreaped Child, or verified confined-cgroup handle.
- A cgroup escape probe can migrate to ancestor/sibling, cgroupfs remains writable outside the worker root, or boundary mount/dev/inode/generation does not match.
- Fence intent is not visible before reader drain, post-intent readers can start external work, a prior operation lacks cancellation, or managed attach still uses `exec`.
- The source-derived inventory finds an unmapped drain/resume/inject/turn/process callsite, or lower-level APIs remain callable without a private `ReentryGuard`.
- Codex first SessionStart can neither atomically bind its runtime id nor reject conflicting/replayed identity; duplicate/resume semantics differ from the table.
- GC removes or makes unreachable any non-releasable worker, pending claim, session binding, tombstone, fence marker, lifecycle lock, proof, or audit surface.
- `finish_fence` accepts root/process/protocol evidence for a recorded WorkerTree requirement, or any tracked-tree path returns confirmed.
- App-server proof omits child-thread recursion, complete pagination, exact persisted already-terminal turn status, live terminal cleanup, or daemon-escape handling.
- A1 can pass with fabricated booleans, A6 does not prove isolated hooks loaded, A7 never starts real writers, or A9 uses a fixed expected count.
- Managed attach performs GC/register/marker/drain before the single claim transaction, deadline formula exceeds 20s, or global lock timeout is lengthened.
- Shared-server loss has neither actionable status/reconcile nor explicit audited abandonment, or abandonment is presented as quiescence.
- Three attempts repeat the same test/lint failure without a new diagnosis; append `## Mistakes & Dead Ends` and reassess.

## Open questions

### atomic-non-pidfd-signaling-policy

- **Type:** choice — NEEDS CLARIFICATION; custom allowed.
- **Context:** PID/start-time revalidation does not close the signal TOCTOU on Darwin or non-pidfd Linux recovery.
- **Options:**
  1. **Never raw-signal after recovery (recommended):** act only through live pidfd, unreaped supervisor Child, or verified confined cgroup; otherwise remain unconfirmed.
  2. Permit best-effort raw signaling after two checks (unsafe; collateral PID/PGID reuse remains possible).
  3. Disable managed process fencing entirely on platforms without recoverable stable handles.

### cgroup-anti-migration-threat-model

- **Type:** choice — NEEDS CLARIFICATION; custom allowed.
- **Context:** same-user delegation permits escape unless namespace/mount/sandbox policy denies ancestor/sibling migration and alternate cgroupfs access.
- **Options:**
  1. **Require namespace-root plus read-only/hidden cgroupfs and adversarial escape tests (recommended):** downgrade to unconfirmed when unavailable.
  2. Accept sandbox-denied cgroupfs writes as the boundary when the exact sandbox contract is runtime-verified.
  3. Treat plain delegated cgroup as strong (unsafe; rejected by Draft-2 threat model).

### codex-pending-id-binding

- **Type:** choice — NEEDS CLARIFICATION; custom allowed.
- **Context:** Codex runtime session id appears only inside first SessionStart.
- **Options:**
  1. **Pending token-hash index + atomic first-id claim (recommended):** retain claimed hash only for exact duplicate idempotency; resume later uses session binding without requiring token.
  2. Key lifecycle by cwd marker until id appears (unsafe in shared dirs and races another session).
  3. Disable hook-born managed Codex and require app-server pre-known thread ids.

### appserver-child-thread-policy

- **Type:** choice — NEEDS CLARIFICATION; custom allowed.
- **Context:** interrupting one turn does not stop child/subagent threads or daemonized writers.
- **Options:**
  1. **Recursive lineage proof plus dedicated confined server for WorkerTree (recommended):** shared server earns protocol-only evidence.
  2. Runtime-disable child-agent spawning and process tools, but only if a current enforceable app-server contract is verified.
  3. Treat root interruption as worker quiescence (unsafe).

### fencing-unconfirmed-release-policy

- **Type:** choice — NEEDS CLARIFICATION; custom allowed.
- **Context:** shared-server loss or observation-only recovery can retain capacity indefinitely without operator action.
- **Options:**
  1. **Status + safe reconcile + explicit audited abandonment (recommended):** only abandonment may knowingly release without proof and must say NOT QUIESCENCE-PROVEN.
  2. Never release without proof (safest but can permanently leak capacity/resources).
  3. Auto-release after age/timeout (unsafe; time is not quiescence evidence).

### darwin-containment-policy

- **Type:** choice — NEEDS CLARIFICATION; custom allowed.
- **Context:** `proc_bsdinfo` supplies observations, not an atomic signal handle or descendant containment.
- **Options:**
  1. **Observation-only Darwin after supervisor recovery (recommended):** live unreaped Child may be acted on process-only; hard WorkerTree consumers refuse Darwin.
  2. Disable all managed lifecycle features on Darwin.
  3. Expand scope to a separately approved privileged/launchd containment helper.

### background-terminal-policy

- **Type:** choice — NEEDS CLARIFICATION; custom allowed.
- **Context:** clean + paginated list-empty is necessary but insufficient until child threads and daemonized descendants are addressed.
- **Options:**
  1. **Require terminal-empty + recursive child lineage + authoritative process containment for WorkerTree (recommended).**
  2. Accept terminal-empty + lineage as ProtocolTree only; consumers explicitly choose whether protocol scope suffices.
  3. Treat root terminal-empty as WorkerTree proof (unsafe).

## Cold-handoff checklist

1. **File manifest:** present — each step names exact existing/new paths and current line ranges for cited callsites.
2. **Environment & commands:** present — base, versions, four targets, isolated real-runtime setup, measured deadline formula, and exact gates are specified.
3. **Interface & data contracts:** present — worker/session identity, pending claim, transitions, re-entry guards, fence intent, stable handles, scopes, proof types, lineage, GC, and operator APIs are explicit.
4. **Executable acceptance:** present — A0–A18 are command + expected evidence, including adversarial matrices and source-derived counts.
5. **Out of scope:** present — fan-out specifics, unsafe raw signaling, privileged helpers, arbitrary clients, shared-server kill, binaries/releases, and unrelated changes are excluded.
6. **Decision rationale:** present — every non-obvious choice is tied to a red-team defect and failure mode.
7. **Known gotchas:** present — all TOCTOU, migration, starvation/CLOEXEC, identity, GC, child-thread, terminal, drain, and timing traps are explicit.
8. **Global constraints verbatim:** present — feasibility-first, no external work under locks, targets, and honest tiering are carried forward.
9. **No undefined terms / forward refs:** present — every state, scope, guard, proof, receipt, test harness, and question is defined; no TODO/TBD remains.

Adversarial cold-read result: a cold executor can implement each step without choosing an identity key, signal primitive, confinement claim, admission order, duplicate-token behavior, GC exemption, proof promotion, app-server recovery query, drain policy, or operator release rule. Remaining product/policy decisions are structured above and default to the fail-closed recommended option until answered.

## Self-review

Score: **94/100** · trajectory **56→78→88→92→94→94→94→94** · stopped: **plateau (K=3)**.

Weighted result: standalone executability **21/22**; actionability **15/16**; dependency order **12/12**; evidence re-verify **10/10**; goal coverage **11/12**; executable acceptance **11/12**; failure mode **9/10**; assumption→question **5/6**. Deductions remain because physical WorkerTree proof is intentionally unavailable on Darwin, recovered non-pidfd processes, tracked trees, and shared app-server; seven policy choices remain for the parent/user.

The final three no-improvement rounds re-anchored on the rubric and independently checked: frontmatter/spine/A0–A18/question structure; one-to-one closure of nine HIGH plus two MED findings; and fallback-scope/residual/GC/operator contracts. All three held at 94 with no new plan defect.

Draft-2 closure log:

1. **HIGH-1 closed:** removed check-then-raw-kill; recovery acts only through pidfd-open-before-validation, unreaped Child, or verified cgroup; Darwin/non-pidfd is observation-only. A4 forces reuse between observation and action.
2. **HIGH-2 closed:** cgroup proof now requires namespace/permission anti-migration, exact mount/dev/inode/path/generation binding, retained control fd, and adversarial escape tests; plain delegation is unconfirmed.
3. **HIGH-3 closed:** fence intent publishes before drain; post-intent readers refuse; prior operations cancel boundedly; managed attach uses spawn+wait under guard, never exec. A3 covers starvation, long pump/wake, and exec lifetime.
4. **HIGH-4 closed:** added `bus.rs`/`channel.rs`; inventory covers every drain and mutating app-server/process call, including WatchAck and wake fallback; lower APIs require a private `ReentryGuard`. A9 count is source-derived, A10 verifies mailbox bytes.
5. **HIGH-5 closed:** separated worker/runtime ids, pending token-hash index, atomic Codex claim, session binding, and exact duplicate/resume/replay/expiry semantics. A2 is the full matrix.
6. **HIGH-6 closed:** all non-releasable managed states and lifecycle surfaces are non-GCable; only TerminalReleasable + receipt may age out. A11 ages records 30 days.
7. **HIGH-7 closed:** proofs are scope-bound and exhaustively validated; ProcessOnly/ProtocolOnly cannot satisfy WorkerTree; tracked trees always unconfirmed, including stable snapshots. A5/A13 enforce.
8. **HIGH-8 closed:** app-server proof recursively paginates child lineage/turns/terminals to a two-pass fixed point; recovery uses exact persisted turn status; real child/background/daemon sentinels distinguish ProtocolTree from WorkerTree. Shared server is never physical proof.
9. **HIGH-9 closed:** A1 executes a committed harness with code/raw hashes and the full capability matrix; A4–A10 are adversarial, isolated, externally observable, and source-derived rather than fabricated booleans/counts.
10. **MED-1 closed:** managed claim is the first single short transaction; GC/register/marker/drain defer until Active; global lock remains three seconds; deadline is derived from 10 cold starts plus sequential contention and capped below 30 seconds.
11. **MED-2 closed:** durable status/reconcile/abandon gives exact recovery handoff and an explicit audited risk-release path that never masquerades as quiescence. A12 covers both safe and risk-accepting paths.

## Notes

- Step 1 appends the committed harness git-blob hash, raw artifact hashes, exact runtime versions, 10-run timing samples, derived deadline, and capability verdicts here. Large raw protocol/hook transcripts remain in the harness-owned temporary artifact directory, not pasted into the plan.
- Draft-1 independent red-team score: 56/100, not dispatch-ready. Draft-2 treats all nine high and two medium findings as must-fix and retains the confirmed foundation without new API speculation.

## Sources

- `docs/plans/active/relay-worker-fanout.md:456-473` — final red-team splits general primitives (this plan) from fan-out-specific recovery.
- `plugins/session-relay/rust/src/appserver.rs:50-76,84-164,198-241,573-617` — current id/start/pump wrapper; deliver/status/ack resume threads and start turns without cancellation/proof/guard contracts.
- `plugins/session-relay/rust/src/bus.rs:283-315` — MCP inbox drains directly.
- `plugins/session-relay/rust/src/channel.rs:174-195` — channel drains then emits context directly.
- `plugins/session-relay/rust/src/cli.rs:269-367,885-903,925-1031` — attach exec replaces relay (dropping CLOEXEC guard); CLI inbox/wake drain and resume/start paths.
- `plugins/session-relay/rust/src/hook.rs:109-117,195-240` — hook always exits 0; current managed-relevant work runs GC→marker→register→drain.
- `plugins/session-relay/rust/src/spawn.rs:337-495,662-790` — app-server pump and CLI birth; Codex id is unknown until hook registration; parent owns Child only while this process lives.
- `plugins/session-relay/rust/src/store.rs:446-482,485-545,1023-1205,1208-1292` — three-second flock, Entry shape, age-based GC with no managed exemption, and register transaction.
- `plugins/session-relay/rust/src/watch.rs:245-310,555-640` — pending acknowledgement, mailbox drain/deliver, and wake fallback are distinct re-entry paths.
- `plugins/session-relay/rust/src/main.rs:14-59` — multi-call routing to extend with lifecycle reconcile and hidden managed launcher.
- [Codex hooks](https://learn.chatgpt.com/docs/hooks#common-output-fields) — independently reconfirmed SessionStart/common stop and UserPromptSubmit behavior; timeout failures are fail-open.
- [Codex app-server](https://learn.chatgpt.com/docs/app-server#api-overview) — independently reconfirmed interrupt, persisted thread/turn reads, lineage filters, and background-terminal APIs.
- [Codex interrupt example](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md#example-interrupt-an-active-turn) — exact interrupt request and terminal event; background terminals survive interrupt.
- [Linux pidfd](https://man7.org/linux/man-pages/man2/pidfd_open.2.html) and [`/proc/pid/stat`](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html) — stable fd vs observation-only start generation.
- [Linux cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html) — kill/populated semantics; Draft-2 adds the required anti-migration boundary rather than over-reading those primitives.
- [Apple XNU process info](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/proc_info.h) and [`libproc.h`](https://github.com/apple-oss-distributions/xnu/blob/main/libsyscall/wrappers/libproc/libproc.h) — Darwin observation fields/private enumeration, not an atomic signal handle.

## Review

*(filled by plan-review on completion)*
