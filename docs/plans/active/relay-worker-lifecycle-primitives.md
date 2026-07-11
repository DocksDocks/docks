---
title: Build relay worker lifecycle primitives
goal: Add verified hook abort, stable-handle process control, and lifecycle-gated worker quiescence without allowing fallback tiers to claim false confirmation.
status: planned
created: "2026-07-11T03:31:53-03:00"
updated: "2026-07-11T05:04:02-03:00"
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
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.toml
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/guardless.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/wrong-target.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fence-reentry.rs
  - plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/reentry-fence.rs
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

Build three general, independently testable relay capabilities: (A) prevent a managed hook-born Claude or Codex CLI from processing its first prompt when attach fails; (B) signal processes only through a kernel-stable handle or an unreaped supervisor-owned child, and confirm a worker tree only behind an escape-proof containment boundary; and (C) cancel and prove app-server lineage only behind an authoritative mutation barrier or stopped exclusive writer, while capability-binding every relay drain, resume, injection, turn start, process launch, attach, interrupt, clean, and signal to the exact lifecycle/binding/fence epoch.

The result must distinguish **process-only**, **protocol-only**, and **worker-tree** evidence. Observation-only PID/start-time data, stable-looking descendant snapshots, any live shared-server scan, a single interrupted turn, `thread/read idle`, root-process exit, or `cgroup.events populated 0` without anti-migration confinement can never release a worker-tree capacity slot. This plan implements ProtocolTree proof only for a stopped/frozen exclusive dedicated writer; a future server-side barrier needs a separate verified acquire/hold/release design. Unsupported or lost capabilities remain `FencingUnconfirmed`, refuse every re-entry/drain, survive GC, and expose bounded reconcile/abandon paths.

## Context & rationale

- `relay-worker-fanout` is blocked on three general relay-core primitives. Its lifecycle-specific recovery/collection items remain out of scope; this plan provides only reusable attach, admission, process, quiescence, and reconciliation contracts.
- Independent red-team verification confirmed the feasibility foundation: Codex app-server has `turn/interrupt {threadId,turnId}` and terminal completion; Claude and Codex support SessionStart stop and UserPromptSubmit block; hook timeout is fail-open; Linux has pidfd, `/proc` field-22, cgroup v2 kill/populated; rustix gates pidfd to Linux; Darwin exposes observation APIs. Draft-3 preserves the sound Draft-2 signal, publish-first, attach-lifetime, watchdog, GC, proof-scope, and operator work while closing binding-capability, protocol-barrier, fence-epoch, and cgroup-setup gaps.
- A start-time comparison followed by raw `kill`/`killpg` is check-then-act: the target can exit and its PID/PGID can recycle between operations. Darwin `proc_bsdinfo` and Linux start-time fallback are therefore **observation only**, not generation-safe signal handles.
- A delegated cgroup writable by the same user is not automatically a confinement boundary. A descendant can migrate to an ancestor/sibling before `cgroup.kill`; the worker cgroup then reports `populated 0` while the escaped process remains live. Strong cgroup proof requires a tested namespace/permission/sandbox boundary that denies escape, plus generation-bound path identity.
- A read/write flock alone cannot bound fencing. A writer may starve behind new readers, and a reader may hold through a 300-second pump, unbounded wake, or `attach --exec`; CLOEXEC then drops the guard while the resumed CLI continues. Fence intent must publish before drain, new admissions must refuse without joining the reader queue, and every admitted operation must be cancelable and bounded.
- Re-entry is broader than `watch --auto-turn`: current drains exist in CLI inbox, MCP inbox, channel, hook, watch, and wake. Current app-server status/ack/deliver call `thread/resume`; pending acknowledgement is its own turn-start path. The inventory must be mechanically complete, not a hand-counted list.
- Codex CLI has no pre-minted session id. Managed state therefore needs a pre-launch `worker_id`, a pending token-hash index, and an atomic first-SessionStart binding to the discovered `runtime_session_id`. Duplicate SessionStart and resume are idempotent only for the exact bound identity; token replay to another identity is refused.
- Admission authority is time-sensitive: an Unmanaged guard issued before first SessionStart cannot remain valid after the same runtime id becomes Managed. Binding epoch, Claiming publication, prior-guard drain, target-free lower APIs, and use-time re-resolution are one mandatory invariant.
- Two equal asynchronous app-server scans are not a fixed point, and a shared second client can create lineage after the final page. Shared scans are observation-only unless the server supplies a held mutation-rejecting barrier; otherwise only a stopped/frozen relay-owned dedicated writer can support final offline protocol proof.
- Every fence attempt has its own epoch/version. Interrupt, clean, signal, timeout, finish, reconcile, release, and abandon must CAS or re-resolve that exact epoch so a late fencer cannot overwrite newer state.
- Current GC ages out registry entries and relay surfaces without a managed-state exemption. Every non-releasable managed record, pending attach, generation tombstone, fence marker, and lifecycle lock must be preserved regardless of age.

## Feasibility and guarantee tiers

| Capability | Confirmed buildable path | What can never be claimed |
|---|---|---|
| Hook abort | Managed Claiming publication is the first short locked transaction; SessionStart returns structured stop on failure; UserPromptSubmit independently blocks non-Active workers; a detached supervisor retains an unreaped child handle and a measured deadline below the 30-second minimum. | If both hooks are skipped/regress, the supervisor watchdog is a bounded best effort, not a hard scheduler guarantee. On a platform without worker-tree containment, killing the owned root does not prove descendants absent. |
| Process signal | Linux: open pidfd **before** validating start generation, then signal that pinned task. Live supervisor: signal/kill an unreaped `Child` it still owns. Strong Linux tree: generation-bound, escape-proof cgroup boundary, then `cgroup.kill` and `populated 0`. | Darwin or Linux without pidfd after supervisor recovery must not raw-signal. PID/start-time is observation only. Process exit or owned process-group exit never proves an arbitrary worker tree. |
| Cgroup tree | Execute the ordered move-before-cgroup-unshare setup; retain the exact manager fd; isolate user/mount/PID/cgroup/proc views; close inherited authority; deny remount/setns/unshare; prove escapes fail before/during fence. | Plain delegation, reordered/partial setup, or manager-fd loss is unconfirmed even if kill succeeds and populated 0 is observed. |
| App-server protocol | Stop/freeze the exclusive stdio-only dedicated writer before a complete finite offline scan; interrupt/clean only through the exact fence permit. Step 1 records any future server barrier but does not enable it. | Equal async scans and every live shared-server scan, idle, root interruption, or list-empty observation never construct ProtocolTree proof. |
| Worker-tree release | Exhaustive proof validation accepts only a strong confined-cgroup proof, or compound app-server lineage proof plus an authoritative process-containment proof for a relay-owned dedicated server. | Shared app-server, tracked descendant trees, stable snapshots, observation-only identities, and root-only proofs remain `FencingUnconfirmed`. |

## Environment & how-to-run

- **Checkout/base:** `/home/vagrant/projects/docks-primitives`, branch `codex/relay-worker-lifecycle-primitives`; Draft-3 starts from Draft-2 commit `e80edc3`; drift/review base remains `12cf2ea` as required by the originating plan. Run A0 before implementation.
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
- **Protocol scan bound:** `protocol_lineage_deadline_ms = 20_000` is one monotonic deadline for all lineage/turn/terminal pages, dedicated-writer stop/freeze, and final offline scan. A page, continuous spawner, writer-stop, or offline read that exhausts it returns `ProtocolIncomplete`; no retry loop may extend the same proof attempt.
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
    pub binding_epoch: String, // canonical checked u64 decimal string
    pub state: BindingState,
}

pub enum BindingState {
    Unmanaged,
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

Every runtime session, including a not-yet-managed Codex id, has a persisted monotonically increasing `binding_epoch`. Admission and the first SessionStart claim serialize through that record; this is a mandatory invariant, not a policy choice.

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

The closed transitions are `Attaching→Active|Fencing`; `Active→Fencing`; `Fencing→Fenced|FencingUnconfirmed`; `FencingUnconfirmed→Fencing` only through reconcile; `Fenced→TerminalRetained`; `TerminalRetained→TerminalReleasable` only through explicit owner release; `FencingUnconfirmed→TerminalReleasable` only through audited risk-accepting abandonment. No other transitions exist. Only `TerminalReleasable` may age out.

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
    AttachManaged,
    Deliver,
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
pub struct CancelToken { path: PathBuf, worker_or_session_epoch: String }

pub struct ReentryGuard {
    target: GuardTarget,             // private; lower APIs derive target from here
    allowed: OperationKind,          // exactly one operation family
    lifecycle_version: Option<String>,
    binding_guard: SharedFileLock,   // retained for the guard lifetime
    activity_guard: Option<SharedFileLock>,
    deadline: Instant,
    cancel: CancelToken,
    _sealed: lifecycle::Sealed,
}

pub enum Admission {
    Unmanaged(ReentryGuard),
    Managed(ReentryGuard),
    Refused { worker_id: String, state: ManagedState, reason: String },
}

pub fn admit_operation(session_or_worker: &str, kind: OperationKind) -> Result<Admission, String>;
pub fn publish_fence(worker_id: &str, generation: &str, reason: &str) -> Result<FenceIntent, String>;
pub fn drain_prior_operations(intent: FenceIntent) -> Result<FencePermit, DrainError>;
```

`ReentryGuard` construction, fields, target resolution, and seal remain private to `lifecycle.rs`. Immediately before every lower mutation, `authorize_use(&mut guard, expected_kind)` re-reads the binding and lifecycle under one short `with_lock`; it rejects a changed epoch/state/generation/version or wrong kind, then releases the global lock before the external action. Because the guard still holds the shared binding/activity locks, a Claiming transition cannot finalize Managed and a Fencing transition cannot finish drain while that authorized action remains live.

Lower APIs take **no independently supplied session, worker, server, thread, cwd, tool, or process target**. They derive it from the capability; only non-authority payload is separate:

```rust
store::drain_with_guard(&mut ReentryGuard)
appserver::resume_with_guard(&mut ReentryGuard)
appserver::inject_with_guard(&mut ReentryGuard, items)
appserver::start_turn_with_guard(&mut ReentryGuard, prompt)
spawn::run_child_with_guard(&mut ReentryGuard, non_authority_args)
```

No public/internal target-taking drain/re-entry mutator remains. A guard admitted for unmanaged A cannot name managed B; a guard for `CliInboxDrain` cannot start a turn; and a guard from binding epoch N fails after Claiming increments to N+1. Queue, peek, registry reads, and pure observation may remain allowed.

The committed source-derived inventory maps every drain, app-server mutation, process creation/exec/signal, and pending acknowledgement callsite to a concrete `ReentryGuard` or `FencePermit` API. `FenceControl` is not a manifest-only exception and `UnmanagedOnly` is not a bypass: unmanaged mutations still require a bound `ReentryGuard`. Only pure `ReadOnly` observations may lack a capability. CI fails on any unmapped/stale callsite or rationale-only mutating class.

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
    pub confinement: CgroupConfinementReceipt,
}

pub struct CgroupConfinementReceipt {
    pub moved_before_cgroup_unshare: bool,
    pub cgroup_root_is_worker_leaf: bool,
    pub new_user_mount_pid_cgroup_namespaces: bool,
    pub fresh_proc_mount: bool,
    pub single_read_only_cgroup2_mount: bool,
    pub inherited_control_fds: u32, // must be 0 in workload
    pub no_new_privs: bool,
    pub namespace_mount_seccomp_sha256: String,
    pub pre_go_escape_probe_sha256: String,
    pub setup_transcript_sha256: String,
    _sealed: lifecycle::Sealed,
}
```

`ProcessIdentityRecord` is durable observation/recovery input; `SignalHandle` is live, non-serializable authority. Linux pidfd recovery order is **open pidfd first, then read/compare the generation while the fd pins the task**, then signal via pidfd. If pidfd open fails or the pinned observation mismatches, do not raw-signal. On Darwin and Linux without pidfd, recovery produces `ObservationOnly` and returns unconfirmed. A live supervisor may safely act through its unreaped `Child` only when its instance id matches the record; once reaped/dropped/restarted, that authority is gone. `killpg` is permitted only while an unreaped owned group leader prevents PGID reuse, and it proves group scope only—not escaped descendants or WorkerTree.

Managed launch uses `__managed-child-exec` with this executable strong-cgroup setup contract:

1. **Preflight or fail closed.** Require Linux cgroup v2 with `cgroup.kill`, a writable delegation that permits create/move, cgroup+mount+PID namespaces, either current-user-namespace `CAP_SYS_ADMIN` or enabled unprivileged user namespaces with uid/gid mapping, fresh proc mounting, `no_new_privs`, and seccomp filtering. If any probe fails, record `ObservationOnly`/`Unconfirmed`; never partially label the backend `ConfinedCgroup`.
2. **Create and retain manager authority.** The manager creates `<manager-root>/<worker_id>-<generation>/`, opens the exact directory `O_PATH|O_DIRECTORY|O_CLOEXEC`, records mount/dev/inode/uid/mode/path/generation, and keeps that fd private. All `cgroup.procs`, `cgroup.freeze`, `cgroup.kill`, and `cgroup.events` access uses `openat` from this fd; no later path lookup is signaling authority.
3. **Move before namespace root.** Spawn a trusted wrapper blocked on a private handshake pipe. Before the wrapper creates its cgroup namespace, the manager writes its pinned pid through the retained fd into the worker leaf and verifies membership. The wrapper must already be in the leaf when it calls `unshare(CLONE_NEWCGROUP)`, so `/` inside that namespace is the worker leaf rather than an ancestor.
4. **Build an isolated view.** For the rootless path, the wrapper first creates a user namespace, pauses while the manager installs `setgroups=deny` and uid/gid maps, then creates private mount+cgroup+PID namespaces and forks the namespace PID 1. It makes mounts private, mounts a fresh `/proc` that cannot expose host `/proc/<pid>/root`, enumerates/detaches every inherited cgroup2 mount, and mounts exactly one cgroup2 view at `/sys/fs/cgroup`, rooted at the worker leaf and remounted read-only/nosuid/nodev/noexec. The privileged path must produce the identical observable view/receipt.
5. **Remove alternate authority before untrusted exec.** Explicitly close every non-allowlisted fd (including manager/cgroup/mount namespace fds) with close-range plus `/proc/self/fd` verification; retain only stdio and the GO pipe. Set `no_new_privs`, drop namespace capabilities, and install a seccomp filter denying `mount`, `umount2`, `fsopen`, `fsmount`, `open_tree`, `move_mount`, `setns`, `unshare`, and namespace-creating clone flags while permitting ordinary child creation. The restriction is inherited by all descendants.
6. **Adversarial gate, then GO.** Before exec, a fixture in the exact namespaces must fail to write ancestor/sibling `cgroup.procs`, remount/mount cgroup2 read-write, create a new user/mount/cgroup namespace, use an inherited fd, or reach host cgroupfs via alternate mounts or `/proc/*/root`. The manager re-verifies leaf membership and the receipt, then sends GO. Repeat the cooperative escape attempts during fencing before using `cgroup.kill` and requiring `populated 0`.

The detached lifecycle supervisor is the cgroup manager and retains the exact directory fd until terminal release. Ordinary CLI exit/restart asks that supervisor to act; it does not reopen the path. If the supervisor or fd is lost, mount/dev/inode/path revalidation is observation only because the path/inode could have been recycled; this plan defines no fd-reconstruction/transfer path, so recovery remains `FencingUnconfirmed`. Any setup, fd-closure, namespace-root, alternate-mount, seccomp, escape-probe, or supervisor-authority failure makes WorkerTree unavailable.

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
    pub boundary: DedicatedOfflineBoundaryProof,
    pub completed_before_deadline: bool,
}

pub struct DedicatedOfflineBoundaryProof {
    supervisor_instance_id: String,
    no_listener_evidence_sha256: String,
    stop_or_freeze_evidence_sha256: String,
    complete_offline_artifact_set_sha256: String,
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
    pub worker_id: String,
    pub generation: String,
    pub fence_epoch: String, // UUIDv4, new for every reconcile attempt
    pub fencing_version: String,
}

pub struct FenceTurnRef {
    thread_id: String,
    turn_id: String,
    fence_epoch: String,
    _sealed: lifecycle::Sealed,
}

pub struct FenceTerminalRef {
    thread_id: String,
    terminal_id: String,
    fence_epoch: String,
    _sealed: lifecycle::Sealed,
}

pub enum FenceAction { InterruptKnownTurn, CleanKnownTerminal, SignalRecordedHandle }

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

`FencePermit` construction/seal and `FenceTurnRef`/`FenceTerminalRef` construction remain private. Every fence mutation re-resolves exact `Fencing + worker_id + generation + fence_epoch + fencing_version` immediately before use. The only lower mutators that accept it are:

```rust
appserver::interrupt_with_fence(&mut FencePermit, &FenceTurnRef)
appserver::clean_terminal_with_fence(&mut FencePermit, &FenceTerminalRef)
process_identity::signal_recorded_with_fence(&mut FencePermit, FenceSignal) // no pid/pgid/path argument
```

The bound refs are emitted only by enumeration under the same permit epoch. There is deliberately no resume/start/inject/drain/spawn overload for `FencePermit`, and no interrupt/clean/signal overload without the matching sealed capability. Every call also verifies its `FenceAction`; a process-only permit cannot clean a terminal and an app-server permit cannot signal an unrelated handle.

`drain_prior_operations` cannot mint `FencePermit` until it holds all bound-session locks plus worker activity exclusively. `finish_fence` consumes that permit and, in one `with_lock`, exhaustively validates evidence then CASes only the exact current `Fencing` fence epoch/version to `Fenced` or `FencingUnconfirmed`. `mark_fence_unconfirmed` consumes the exact intent after any binding/activity drain timeout and does the same version CAS. A stale completion returns `StateChanged` and writes nothing.

Reconcile, release, and abandon are also exact-version operations. Reconcile CASes `FencingUnconfirmed@version N` to `Fencing@version N+1` with a new `fence_epoch`; release CASes only `TerminalRetained@expected_version`; abandon CASes only `FencingUnconfirmed@expected_version`. Thus an old fencer cannot signal, finish, release, or overwrite state after reconcile or audited abandonment.

Proof scope remains exhaustive: `ProcessProof` satisfies only `ProcessOnly`; `ProtocolTreeProof` only `ProtocolTree`; only `WorkerTreeProof` satisfies `WorkerTree`. A `TrackedTree` backend always returns `Unconfirmed`, root exit never promotes to tree proof, and unknown evidence/backend variants fail closed.

### 5. Hook attach and measured dead-man

Managed SessionStart performs only the short atomic Claiming publication first, drains old binding-epoch guards outside the global lock, then CASes Claiming→Managed/Active. It does not run GC, marker, ordinary register, or mailbox drain before Active. On claim/drain/CAS failure it returns exit-0 JSON with top-level `continue:false`/`stopReason`, records the error, and notifies the detached supervisor. UserPromptSubmit admits a binding-bound `UserPromptDrain`; non-Active/Claiming state blocks without draining. Ordinary unmanaged behavior remains byte-compatible and fail-open, but unmanaged mutations still require a session/epoch-bound guard.

The supervisor holds the unreaped root child and, where available, strong cgroup control. Its deadline comes from the measured formula in Environment—not a hard-coded four seconds. Sequential contention tests queue multiple near-timeout store users and prove the attach claim is still first; failure blocks the prompt and fences, never lengthens `with_lock` beyond three seconds.

The bounded race is explicit. When the installed hooks execute under their verified contracts, SessionStart stop or the 30-second-minimum UserPromptSubmit block keeps the prompt behind a watchdog deadline of at most 20 seconds, leaving at least 10 seconds for owned-child termination and wait. If the runtime skips both hooks or violates that contract, prompt execution may begin any time from CLI exec until the watchdog acts; the residual window is at most `managed_attach_deadline_ms` for a scheduled supervisor with a live owned-child handle, but it is not zero and cannot be a hard scheduler guarantee. Root termination is only ProcessOnly unless strong containment proves the tree.

### 6. App-server lineage, authoritative barrier, and physical scope

Persist every `turnId`. Fencing first blocks relay re-entry. Async repeated scans are observations, not a fixed point: equality of two scans cannot construct `ProtocolTreeProof`.

1. Under the exact `FencePermit`, interrupt every discovered active turn and clean every discovered background terminal; persist matching terminal events/status. Enumerate descendants/turns/terminals through all pages under one `protocol_lineage_deadline_ms` deadline. `thread/read idle` alone remains forbidden.
2. A **shared socket server** always yields `ProtocolObservation`, never `ProtocolTreeProof`, and cannot transition a ProtocolTree worker to Fenced. Two sequence reads or a snapshot without durable mutation rejection are insufficient. Step 1 records whether a future authoritative barrier exists, but this plan does not add unverified acquire/hold/release mutators; adopting it requires a separately reviewed capability contract.
3. A **relay-owned dedicated server** has no listener and only supervisor-owned stdio. After the initial interrupt/clean scans, stop the sole writer source before final evidence: either reap the owned app-server process or freeze the already-verified confined cgroup and observe `frozen 1`. Then perform a finite offline scan of a Step-1-verified complete persisted artifact set. No live server/client can create lineage during that scan. If the artifact set is not proven complete/current for child edges, turns, and terminals, return `ProtocolIncomplete`.
4. For notification-loss recovery, accept only exact persisted turn terminal state from the complete stopped/frozen offline artifact set. Live `includeTurns`/`turns/list` on a shared server is supporting observation only.
5. A real child-agent test creates a child-thread writer; a real background terminal writes another sentinel; queued-after-parent and continuous-spawner fixtures create descendants after the second equal live scan. Every writer must be visible and stopped behind the exclusive offline boundary. If the deadline expires, a writer continues, or a child appears outside the bounded snapshot, return `ProtocolIncomplete`.

WorkerTree proof requires the relay-owned dedicated stdio server plus escape-proof cgroup containment; the cgroup proof can still confirm WorkerTree when stopped-server offline protocol evidence is incomplete, but no ProtocolTree proof is fabricated. The live app-server Child/stdio authority is tied to `supervisor_instance_id`; after supervisor loss, only the still-retained exact cgroup fd can prove the tree. Shared servers are observation-only and killing one is forbidden.

### 7. GC retention and durable reconciliation

GC eligibility is lifecycle-aware before surface deletion. `Attaching|Active|Fencing|FencingUnconfirmed|Fenced|TerminalRetained`, pending attaches, session bindings, generation tombstones, fence-intent markers, activity locks, and proof/audit records are non-GCable regardless of `last_seen` or mtime. Only `TerminalReleasable` with a valid `ReleaseReceipt` can enter the ordinary age check. Registry/session binding removal remains last, and tombstone removal is part of the same explicitly releasable candidate.

Add CLI surfaces:

```text
relay lifecycle status <worker|session> --json
relay lifecycle reconcile <worker> --generation <uuid> --expected-version <n> --json
relay lifecycle release <worker> --generation <uuid> --expected-version <n> --proof-sha256 <hex>
relay lifecycle abandon <worker> --generation <uuid> --expected-version <n> --reason <text> --i-understand-processes-may-still-be-running
```

`status` reports state/version/fence epoch, backend/scope, retained handles, proof gap, last attempts, and an exact version-bound recovery command. `reconcile` CASes only the named version, republishes a new fence epoch, and retries authoritative evidence; it never raw-signals observation-only PIDs. A shared server cannot reconcile to ProtocolTree proof in this plan. Pidfd reopen, owned-child wait, or the still-retained exact cgroup fd may succeed. Successful proof produces `Fenced`; closing retained handles/resources produces `TerminalRetained`. `release` requires exact generation/version and matching proof hash. `abandon` requires exact generation/version, reason, and acknowledgement, appends a risk-accepted receipt, and prints **“NOT QUIESCENCE-PROVEN”**. A stale version changes nothing.

## Steps

| # | Task | Files | Depends | Status | Done condition / STOP trigger |
|---|---|---|---|---|---|
| 1 | Codify the confirmed feasibility foundation in a committed probe harness and minimum evidence schema: existing runtime/hook/process rows, informational presence/absence of any app-server lineage-mutation barrier, offline artifact completeness after a dedicated writer stop/freeze, and every strong-cgroup prerequisite/setup probe. Emit raw-record hashes and measure attach/protocol bounds. | `plugins/session-relay/test/feasibility-probe.mjs` (new), `plugins/session-relay/test/fixtures/lifecycle-capability-schema.json` (new), `docs/plans/active/relay-worker-lifecycle-primitives.md:Notes` | — | planned | A1 passes without editable verdicts. Shared protocol remains observation-only in this plan even if a new barrier is discovered; incomplete offline artifacts disable ProtocolTree proof; any failed cgroup prerequisite disables ConfinedCgroup. If measured attach deadline exceeds 20s or raw evidence validation fails, STOP before Rust. |
| 2 | Add binding epochs/states, two-phase pending-token claim, binding/activity serialization, exact duplicate/resume rules, versioned lifecycle transitions, tombstones, receipts, and GC exemptions. Claiming publication remains the first short hook transaction; Active waits for older unmanaged guards to drain. | `rust/src/lifecycle.rs` (new), `rust/src/store.rs:1023-1205,1208-1292`, `rust/src/hook.rs:195-240`, `rust/src/lib.rs`, `rust/Cargo.toml`, `rust/Cargo.lock` | 1 | planned | A2/A3/A11 prove atomic Claiming→Managed, stale unmanaged invalidation/drain, duplicates/replay/expiry, and aged retention. Any older binding epoch remains usable after Managed or any pre-Claiming GC/register/drain occurs: STOP. |
| 3 | Implement capability-bound admission, publish-first Fencing, bounded cancellation, sealed `ReentryGuard`/`FencePermit`, target-free lower APIs, complete source inventory, and managed attach spawn+wait. Add committed compile-fail bins for guardless, independent-target, FencePermit-as-reentry, and ReentryGuard-as-fence calls; wrong `OperationKind` is a runtime authorization failure. | `rust/src/lifecycle.rs`, `rust/src/store.rs`, `rust/src/appserver.rs`, `rust/src/bus.rs:283-315`, `rust/src/channel.rs:174-195`, `rust/src/cli.rs:269-367,885-903,925-1105`, `rust/src/hook.rs:195-240`, `rust/src/watch.rs:245-310,555-640`, `rust/src/spawn.rs`, `test/fixtures/lifecycle-capability-bypass/Cargo.toml` (new), `test/fixtures/lifecycle-capability-bypass/src/bin/guardless.rs` (new), `test/fixtures/lifecycle-capability-bypass/src/bin/wrong-target.rs` (new), `test/fixtures/lifecycle-capability-bypass/src/bin/fence-reentry.rs` (new), `test/fixtures/lifecycle-capability-bypass/src/bin/reentry-fence.rs` (new), `test/reentry-inventory.mjs` (new), `test/fixtures/reentry-inventory.json` (new) | 2 | planned | A3/A9/A10 pass binding/fence races, compile boundaries, starvation, 100ms polling/5s grace, exec lifetime, all drains/mutators. Any independent authority target, rationale-only FenceControl, or wrong-capability mutation compiles/runs: STOP. |
| 4 | Implement stable handles plus the ordered strong-cgroup wrapper: retained manager fd, move-before-cgroup-unshare, user/mount/PID/cgroup namespaces, single read-only cgroup2 view, fresh proc, fd closure, capability drop/seccomp, pre/during escape probes, and fail-closed fd-loss recovery. Inventory every signal callsite. | `rust/src/process_identity.rs` (new), `rust/src/spawn.rs:337-495,662-793`, `rust/src/main.rs:14-59`, `rust/src/lifecycle.rs`, `rust/src/store.rs`, `test/process-signal-inventory.mjs` (new), `test/fixtures/process-signal-inventory.json` (new), `.github/workflows/build-binaries.yml` | 1-3 | planned | A4/A5 prove stable signaling and every setup/remount/userns/inherited-fd/alternate-path variant. Any setup probe fails, exact manager fd is lost, replacement receives a signal, worker escapes, or tracked tree confirms: STOP/downgrade to Unconfirmed. |
| 5 | Implement managed hook abort with Claiming publication first, bounded old-epoch drain, exact idempotent resume, structured SessionStart stop, binding-bound UserPromptSubmit drain gate, measured dead-man, and ordinary behavior compatibility. | `rust/src/hook.rs`, `rust/src/spawn.rs`, `rust/src/store.rs`, `hooks/hooks.json`, `hooks/codex-hooks.json`, `test/runtime-hook-abort.mjs` (new), `test/selftest.mjs` | 1-4 | planned | A2/A6 prove the two-phase claim plus full Claude/Codex event×timeout matrix from isolated loaded hooks, absent sentinels, duplicates, sequential contention. Any first-prompt sentinel or pre-Claiming hook work appears: STOP. |
| 6 | Implement exact-turn interruption and terminal clean only through `FencePermit`, finite recursive pagination, and dedicated-writer stop/freeze plus final complete offline scan. Every shared-server scan stays observation-only. Add after-second-pass and continuous-spawner sentinels. | `rust/src/appserver.rs:50-76,84-241,537-617`, `rust/src/spawn.rs:337-495`, `rust/src/lifecycle.rs`, `test/fake-app-server.mjs`, `test/runtime-appserver-quiescence.mjs` (new), `test/lifecycle-smoke.mjs` (new) | 1-4 | planned | A7/A8 prove real writers stop behind the exclusive offline boundary, scan deadline, notification recovery, and shared observation-only behavior. Any two equal async scans construct ProtocolTree proof, or late/continuous child writes after Fenced: STOP. |
| 7 | Add version-CAS lifecycle status/reconcile/release/abandon, stale-fencer rejection, receipts, diagnostics, and explicit release. Every fence transition consumes exact generation+fence epoch+version authority. | `rust/src/lifecycle.rs`, `rust/src/cli.rs`, `rust/src/main.rs`, `rust/src/store.rs`, `test/lifecycle-smoke.mjs` | 2-6 | planned | A12/A13 prove stale fence completion loses to reconcile/abandon and writes nothing; proof-bound release/abandon use expected version. Any late fencer overwrites a newer epoch or terminal state: STOP. |
| 8 | Add adversarial unit/cross-process/real-runtime matrices and source-inventory enforcement; preserve all existing relay tests and isolated cleanup. | `rust/src/appserver.rs`, `rust/src/hook.rs`, `rust/src/lifecycle.rs`, `rust/src/process_identity.rs`, `rust/src/spawn.rs`, `rust/src/store.rs`, `test/feasibility-probe.mjs`, `test/lifecycle-smoke.mjs`, `test/process-signal-inventory.mjs`, `test/reentry-inventory.mjs`, `test/runtime-hook-abort.mjs`, `test/runtime-appserver-quiescence.mjs`, `test/fake-app-server.mjs`, `test/selftest.mjs` | 2-7 | planned | A1-A14 pass; helpers clean children/stores in `finally`; externally observable sentinels and kernel/protocol evidence, not elapsed time alone, establish results. |
| 9 | Document guarantee tiers, binding/capability/epoch invariants, strong-cgroup setup, shared protocol observation-only fallback, GC, and operator recovery; run native/full gates without binary/release changes. | `plugins/session-relay/AGENTS.md`, `skills/productivity/session-relay/SKILL.md`, `rust/src/main.rs`, `.github/workflows/build-binaries.yml` | 1-8 | planned | A15-A18 pass. Docs never call Darwin/start-time/tracked-tree/shared async scans generation-safe or quiescence proof. |

## Acceptance criteria

Run from repository root with `PATH="$HOME/.cargo/bin:$PATH"`. A criterion passes only with its stated evidence; skips, self-authored booleans, or empty fixtures fail.

| ID | Criterion | Command | Expected output/result |
|---|---|---|---|
| A0 | Reconcile source drift before implementation. | `git diff --stat 12cf2ea..HEAD -- plugins/session-relay/rust plugins/session-relay/hooks plugins/session-relay/test plugins/session-relay/AGENTS.md plugins/session-relay/skills/productivity/session-relay/SKILL.md .github/workflows/build-binaries.yml` | Before implementation stdout is empty; plan-only commits are outside this path set. Any source drift is reconciled first. |
| A1 | Full feasibility evidence comes from the committed harness. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/feasibility-probe.mjs --verify-current` | Exit 0; validates raw schema/hash chain and existing 12 hook rows; records any app-server barrier method as informational, stopped/frozen offline artifact completeness, 20s protocol deadline, cgroup v2 kill/freeze, namespace/user-map/mount/proc/seccomp prerequisites, and all native process rows. Always prints `shared_protocol=observation_only`; any cgroup prerequisite failure prints `strong_cgroup=unavailable`; no editable verdict overrides raw evidence. |
| A2 | Pending identity binding is atomic, epoch-serialized, and exact. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked managed_attach_ -- --nocapture` | Exit 0; rows pass for Claude prebound id, Codex unknown→Claiming→Managed, concurrent exact duplicate, resume, replay, wrong id/tool/cwd/generation, expiry, conflicting binding, and claim-drain timeout. Claiming increments binding epoch once; new admission refuses; Active is published only after every older unmanaged shared guard releases; exactly one claim finalizes. |
| A3 | Capabilities bind authority and preserve publish-first fencing/attach lifetime. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked lifecycle_admission_ -- --nocapture && node plugins/session-relay/test/reentry-inventory.mjs --compile-fail` | Both exit 0; wrong target is inexpressible and wrong `OperationKind` refuses at use; admit-unmanaged-S→publish Claiming→fence W proves epoch-N guard cannot start after transition; an already-authorized epoch-N long operation prevents FencePermit until it cancels/releases or forces FencingUnconfirmed; guard A cannot operate on B; managed attach cancel-reaps. Four bins fail: guardless, independent target, FencePermit-as-reentry, ReentryGuard-as-fence. |
| A4 | No check-then-kill path can signal a recycled identity. | `node plugins/session-relay/test/process-signal-inventory.mjs && cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked stable_signal_ -- --nocapture` | Both exit 0; source-derived inventory classifies every raw signal callsite and rejects ObservationOnly/start-check+kill; a deterministic syscall race fixture exits the observed target and substitutes a sentinel identity before action, with zero signal attempts and unchanged sentinel bytes; real pidfd-open-before-validation targets only the pinned task; live unreaped-Child signaling affects only its owned child; Darwin/no-pidfd recovery returns Unconfirmed without signaling. |
| A5 | Tree proof requires the complete ordered anti-migration setup. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case containment` | Exit 0; transcript proves leaf move precedes cgroup-namespace creation, namespace root is leaf, fresh proc hides host roots, only one read-only cgroup2 mount exists, control fds are absent in workload, capabilities are dropped, and seccomp is installed before GO. Ancestor/sibling write, remount, fsopen/open_tree, new user/mount/cgroup namespace, inherited-fd, alternate-mount, and `/proc/*/root` attacks fail before/during fence. Plain delegation, reordered setup, any missing prerequisite, or manager-fd loss is Unconfirmed; every TrackedTree case remains `UnconfirmedDescendants`. |
| A6 | Both real CLIs block every managed first-prompt failure mode. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/runtime-hook-abort.mjs --matrix` | Exit 0; for Claude and Codex, isolated logs prove exact hook file/hash loaded and rows pass for SessionStart attach failure, SessionStart timeout, UserPromptSubmit lifecycle block, UserPromptSubmit timeout + supervisor fence, duplicate SessionStart, and sequential lock contention; every sentinel is absent; final `PASS: 12 managed hook-abort rows`. |
| A7 | Real app-server fencing distinguishes shared observation from exclusive offline proof. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/runtime-appserver-quiescence.mjs --matrix` | Exit 0; starts root, child-agent, background-terminal, queued-late-child, and daemon writers. Every shared-server row stays `ProtocolObservation`/not Fenced even after equal scans. Dedicated stdio/no-listener row stops or freezes the sole writer source before a complete final offline scan; when strong cgroup exists, compound WorkerTree passes. All sentinels stop only behind the exclusive boundary. |
| A8 | Protocol recovery is exclusive-boundary and finite. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case appserver-recovery` | Exit 0; exact persisted terminal evidence succeeds only in a complete stopped/frozen dedicated offline artifact set. Fake after-second-pass spawn and continuous-spawner sentinels defeat equal live scans; all shared rows remain observation-only, partial/missing pages and idle-only fail, and page/spawner exhaustion returns `ProtocolIncomplete` within 20s without Fenced. |
| A9 | Every mutator has a concrete matching capability. | `node plugins/session-relay/test/reentry-inventory.mjs` | Exit 0; scans every drain, resume/inject/start/interrupt/clean, process creation/exec/signal, and pending-ack callsite. Each mutator maps to a target-free `ReentryGuard` API or one of the three sealed `FencePermit` APIs; no rationale-only `FenceControl`/`UnmanagedOnly` mutator exists; pure ReadOnly exceptions are source-verified; source-derived N has no stale/missing rows. |
| A10 | Every re-entry surface enforces target/kind/binding epoch at use. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case reentry-matrix` | Exit 0; one row per `OperationKind` proves guard target is internally derived, wrong kind refuses, wrong session cannot be supplied, binding epoch is re-resolved immediately at use, and stale unmanaged-before-claim guard preserves mailbox/turn/process state after Claiming/Fencing. Fenced rows emit no context/RPC/process; queue/peek remain allowed. |
| A11 | GC cannot erase a durable fence. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked managed_gc_ -- --nocapture` | Exit 0; 30-day-old Attaching/Active/Fencing/FencingUnconfirmed/Fenced/TerminalRetained plus pending/binding/tombstone/lock/fence/proof surfaces survive; only TerminalReleasable with valid receipt ages out atomically; registry/binding removal is last. |
| A12 | Operator transitions and competing fencers are exact-version CAS. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case reconcile` | Exit 0; status emits exact version-bound commands; race rows pause old fencer N, reconcile N→N+1/new epoch or abandon N, then release old completion: it returns StateChanged and changes no state/audit/mail/process bytes. Shared observation cannot reconcile to ProtocolTree. Release/abandon reject stale version; valid abandon alone prints `NOT QUIESCENCE-PROVEN`. |
| A13 | Proof validation and fence capabilities are exhaustive, scope-safe, and epoch-bound. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked fence_proof_ -- --nocapture` | Exit 0; every backend×scope×evidence row passes; no permit mints without all bound-session plus activity exclusives; `finish_fence` consumes matching permit and CASes exact epoch/version; timeout/reconcile/release/abandon CAS exact versions; stale permit cannot act/finish; FencePermit cannot resume/start/inject/drain, ReentryGuard cannot interrupt/clean/signal, mismatched generation/boundary fails, unknown variant fails closed. |
| A14 | Existing behavior remains green. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked && node plugins/session-relay/test/selftest.mjs` | Exit 0; all Rust tests pass and selftest ends with its runtime-derived PASS count. Ordinary unmanaged hook/output/CLI bytes remain compatible. |
| A15 | Formatting and warnings are clean. | `cargo fmt --manifest-path plugins/session-relay/rust/Cargo.toml --check && cargo clippy --manifest-path plugins/session-relay/rust/Cargo.toml --locked --all-targets -- -D warnings` | Exit 0, no format diff, no warnings. |
| A16 | Four architectures compile; Darwin observation semantics run natively. | `gh workflow run build-binaries.yml --ref codex/relay-worker-lifecycle-primitives && gh run watch --exit-status "$(gh run list --workflow build-binaries.yml --branch codex/relay-worker-lifecycle-primitives --limit 1 --json databaseId --jq '.[0].databaseId')"` | Linux x86_64/aarch64 musl builds green; native `macos-15-intel` and `macos-15` build/probe jobs green; Darwin reports observation-only after supervisor recovery. No artifacts are committed. |
| A17 | Full plugin/repo gates pass. | `node scripts/ci.mjs` | Exit 0 with all repo/plugin guards, Rust, selftest, hooks, skills, and manifests green; documented local binary digest warning only. |
| A18 | Diff is scoped and contains no binary/release mutation. | `git diff --check 12cf2ea..HEAD && git diff --name-only 12cf2ea..HEAD | rg '^(plugins/session-relay/(rust/src|rust/Cargo\.(toml|lock)|hooks|test|AGENTS\.md|skills/productivity/session-relay/SKILL\.md)|\.github/workflows/build-binaries\.yml|docs/plans/active/relay-worker-lifecycle-primitives\.md)$' -v` | First exits 0; second prints nothing/exits 1; no `plugins/session-relay/bin`, manifest version, marketplace version, or unrelated path changes. |

## Out of scope / do-NOT-touch

- Fan-out-specific recovery for never-Idle `Stopping`, partial `git worktree remove`, fence-owner lease/steal, cap/depth, handback, merge, and collection remains in `relay-worker-fanout` Draft-5.
- No raw kill fallback is added for Darwin/recovered non-pidfd Linux. Observation-only cleanup is intentionally incomplete and must remain unconfirmed.
- No claim that a merely delegated or partially isolated cgroup is authoritative; privileged/system-wide cgroup setup, root helper, launchd service, kernel extension, or system daemon requires separate approval.
- No claim that relay controls direct human/third-party app-server clients. Relay gates all of its own surfaces; external mutation remains outside the trust boundary. Only a relay-owned stdio-only dedicated server plus physical containment proves exclusivity.
- Do not kill a shared app-server or promote any of its scans to ProtocolTree proof in this plan. A future barrier API requires a separate acquire/hold/release capability review. Dedicated stdio containment is explicit, never inferred.
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
- An Unmanaged guard is not timeless. First SessionStart must publish Claiming/increment binding epoch, drain older guards, and finalize Managed only after they release; every use re-resolves the epoch.
- Capability targets and kinds cannot be caller arguments. If a lower mutator accepts both a guard and an independent session/thread/process selector, the guard is forgeable by substitution.
- `thread_state` currently calls `thread/resume`; status must use pure `thread/read` or an admitted resume.
- `turn/interrupt` completion does not stop background terminals or child threads. Every thread/page/terminal needs evidence.
- A daemonized process can evade app-server terminal bookkeeping. Without authoritative process containment, protocol proof is not WorkerTree proof.
- Two identical lineage passes prove neither completeness nor exclusion. A shared server needs a held mutation-rejecting barrier; a dedicated server must stop/freeze its sole writer before the final offline scan.
- A `FencePermit` from an older fence epoch is hostile stale authority after timeout, reconcile, release, or abandon; every fence action and terminal transition must re-resolve/CAS exact version.
- A read-only cgroup mount is bypassable through inherited fds, alternate mounts, `/proc/<host-pid>/root`, new namespaces, or remount syscalls unless the ordered namespace/proc/fd/seccomp contract closes every route.
- A SessionStart token inherited or repeated for the exact bound session is an idempotency key, not a globally reusable attach credential.
- Managed hook claim must precede current GC/marker/register/drain work. One nearly exhausted three-second lock attempt cannot be followed by more pre-Active lock paths.
- Queue/peek are safe while fenced; drains are not. Refused drains must preserve mailbox bytes exactly.
- GC must inspect lifecycle before deleting **any** candidate surface; preserving only the registry row after deleting locks/tombstones is insufficient.
- Wall-clock stability of a sentinel is supporting evidence only; terminal/process exit and complete pagination remain authoritative.

## Global constraints

- **“FEASIBILITY FIRST. Step 1 must be a research/feasibility spike; design only what the platforms actually allow.”** Draft-3 preserves confirmed facts and makes absent barrier/cgroup capabilities explicit unavailability, never optimistic proof.
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
- Strong cgroup setup moves the wrapper after cgroup-namespace creation, exposes host proc/alternate cgroupfs, leaks a control fd, permits namespace/remount syscalls, or tries to recover proof after losing the exact manager fd.
- Fence intent is not visible before reader drain, post-intent readers can start external work, a prior operation lacks cancellation, or managed attach still uses `exec`.
- Admission returns a capability with an independently supplied authority target, fails to bind kind/epoch, or lets an old Unmanaged guard cross Claiming→Managed/Fencing.
- The source-derived inventory finds an unmapped mutator, a rationale-only `FenceControl`/`UnmanagedOnly` mutation, or a lower API callable without matching sealed `ReentryGuard`/`FencePermit`.
- Codex first SessionStart cannot publish Claiming/increment epoch first, drain older guards, exact-CAS Managed, or reject conflicting/replayed identity; duplicate/resume semantics differ from the table.
- GC removes or makes unreachable any non-releasable worker, pending claim, session binding, tombstone, fence marker, lifecycle lock, proof, or audit surface.
- `finish_fence` accepts root/process/protocol evidence for a recorded WorkerTree requirement, or any tracked-tree path returns confirmed.
- Any fence action or finish/timeout/reconcile/release/abandon transition omits exact generation+fence epoch+version validation/CAS, or a stale fencer changes newer state.
- App-server proof uses any live shared/equal async scan instead of a stopped/frozen exclusive writer, omits complete bounded pagination/offline artifacts, or exceeds the 20s lineage deadline without `ProtocolIncomplete`.
- A1 can pass with fabricated booleans, A6 does not prove isolated hooks loaded, A7 never starts real writers, or A9 uses a fixed expected count.
- Managed attach performs GC/register/marker/mailbox drain before Claiming publication, waits while holding the global lock, deadline formula exceeds 20s, or global lock timeout is lengthened.
- Shared-server loss has neither actionable status/reconcile nor explicit audited abandonment, or abandonment is presented as quiescence.
- Three attempts repeat the same test/lint failure without a new diagnosis; append `## Mistakes & Dead Ends` and reassess.

## Cold-handoff checklist

1. **File manifest:** present — each step names exact existing/new paths and current line ranges for cited callsites.
2. **Environment & commands:** present — base, versions, four targets, isolated real-runtime setup, measured deadline formula, and exact gates are specified.
3. **Interface & data contracts:** present — binding epoch/Claiming, target-free re-entry guards, sealed fence permits/refs, exact fence CAS, strong-cgroup handshake, protocol barriers/observations, proofs, GC, and operator APIs are explicit.
4. **Executable acceptance:** present — A0–A18 are command + expected evidence, including adversarial matrices and source-derived counts.
5. **Out of scope:** present — fan-out specifics, unsafe raw signaling, privileged helpers, arbitrary clients, shared-server kill, binaries/releases, and unrelated changes are excluded.
6. **Decision rationale:** present — every non-obvious choice is tied to a red-team defect and failure mode.
7. **Known gotchas:** present — TOCTOU, binding transition, capability substitution, fence epoch, namespace/remount/fd escape, async lineage, starvation/CLOEXEC, GC, and timing traps are explicit.
8. **Global constraints verbatim:** present — feasibility-first, no external work under locks, targets, and honest tiering are carried forward.
9. **No undefined terms / forward refs:** present — every state, scope, guard, proof, receipt, test harness, and question is defined; no TODO/TBD remains.

Adversarial cold-read result: a cold executor need not invent binding serialization, authority targets, allowed operations, fence epochs/CAS, strong-cgroup namespace order, protocol boundaries, scan deadlines, GC exemptions, proof promotion, or operator release rules. No unresolved question remains: non-pidfd/Darwin recovery is observation-only, shared app-server scans are observation-only, and unconfirmed capacity release requires explicit audited abandonment.

## Self-review

Score: **94/100** · trajectory **74→84→89→94→94→94→94** · stopped: **plateau (K=3)**.

Weighted result: standalone executability **20/22**; actionability **15/16**; dependency order **12/12**; evidence re-verify **10/10**; goal coverage **11/12**; executable acceptance **11/12**; failure mode **9/10**; assumption→question **6/6**. Deductions remain because strong cgroup/protocol proof is deliberately unavailable when platform probes fail and shared servers intentionally remain observation-only; the plan does not paper over either limitation.

The final three no-improvement rounds re-anchored on the rubric and checked: target/kind/binding-epoch capability substitution; fence-permit action/state/version exhaustion; and cgroup setup plus late/continuous app-server writers against A1–A13. All three held at 94.

Draft-3 closure log:

1. **MUST-FIX 1 closed — binding-safe capability admission:** `SessionBinding` now has `Unmanaged|Claiming|Managed` plus monotonic epoch; first SessionStart publishes Claiming, drains older guards, then exact-CASes Active. `ReentryGuard` owns its target/kind/epoch and lower APIs accept no independent authority selector. A2/A3/A10 cover wrong target, wrong kind, and unmanaged-before-claim/fence.
2. **MUST-FIX 2 closed — authoritative protocol boundary:** equal async scans are observations and every shared server remains `ProtocolObservation` in this plan; a future server barrier needs separate capability design. Dedicated proof stops/freezes its sole writer before a complete bounded offline scan. A7/A8 add after-second-pass and continuous-spawner sentinels plus 20s `ProtocolIncomplete`.
3. **MUST-FIX 3 closed — fence epoch/version CAS:** every fence attempt has a UUID epoch/version; all actions re-resolve it and `finish_fence` consumes its permit. Timeout/reconcile/release/abandon exact-CAS state/version. A12/A13 race stale fencers against reconcile and abandonment.
4. **MUST-FIX 4 closed — sealed FencePermit:** inventory exceptions no longer authorize mutations. Only bound interrupt, terminal clean, and recorded-handle signal accept `FencePermit`; resume/start/inject/drain/spawn cannot. Compile/runtime matrices cover guardless and both wrong-capability directions.
5. **MEDIUM 1 closed — executable strong-cgroup setup:** the plan fixes privilege preflight, create/move/unshare/mount/proc order, inherited-fd closure, capability drop/seccomp, alternate-mount/userns/remount probes, GO barrier, and exact manager-fd loss behavior. Any missing property makes strong WorkerTree unavailable.

Affirmed Draft-2 invariants are intentionally unchanged: publish-first Fencing prevents reader starvation; managed attach stays spawn+wait under guard; the measured watchdog remains `<=20s` with a 10s UserPromptSubmit margin; the both-hooks-skipped scheduler race remains an explicit unsupported-contract residual; global/activity lock ordering remains acyclic; pidfd/cgroup signal tiers, GC retention, proof scopes, evidence harness, and operator abandonment remain fail-closed.

## Notes

- Step 1 appends the committed harness git-blob hash, raw artifact hashes, exact runtime versions, 10-run timing samples, derived deadline, and capability verdicts here. Large raw protocol/hook transcripts remain in the harness-owned temporary artifact directory, not pasted into the plan.
- Independent red-team trajectory: Draft-1 **56/100**; Draft-2 re-red-team **74/100**. Draft-3 addresses only the four remaining correctness invariants and one cgroup actionability gap while preserving the explicitly affirmed Draft-2 design.

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
- [Linux cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html) — namespace delegation reachability, `cgroup.freeze`/`frozen`, `cgroup.kill`, `populated`, and the fact that freeze alone still permits migration.
- [Linux cgroup namespaces](https://man7.org/linux/man-pages/man7/cgroup_namespaces.7.html), [mount namespaces](https://man7.org/linux/man-pages/man7/mount_namespaces.7.html), and [user namespaces](https://man7.org/linux/man-pages/man7/user_namespaces.7.html) — namespace root is the creator's current cgroup; private cgroupfs mounts and user-namespace capabilities/mappings establish the setup order and prerequisites.
- [Linux seccomp filters](https://www.kernel.org/doc/html/latest/userspace-api/seccomp_filter.html) and [`no_new_privs`](https://www.kernel.org/doc/html/latest/userspace-api/no_new_privs.html) — filter installation prerequisites and fork/exec inheritance used to deny remount/setns/unshare escape after setup.
- [Apple XNU process info](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/proc_info.h) and [`libproc.h`](https://github.com/apple-oss-distributions/xnu/blob/main/libsyscall/wrappers/libproc/libproc.h) — Darwin observation fields/private enumeration, not an atomic signal handle.

## Review

*(filled by plan-review on completion)*
