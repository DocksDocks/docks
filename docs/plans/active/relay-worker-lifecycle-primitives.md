---
title: Build relay worker lifecycle primitives
goal: Add verified hook abort, generation-safe process control, and lifecycle-gated app-server quiescence, with explicit fail-closed residuals on every target.
status: planned
created: "2026-07-11T03:31:53-03:00"
updated: "2026-07-11T03:31:53-03:00"
started_at: null
assignee: null
tags: [session-relay, lifecycle, rust, safety]
affected_paths:
  - plugins/session-relay/rust/src/appserver.rs
  - plugins/session-relay/rust/src/watch.rs
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/hook.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/rust/src/lib.rs
  - plugins/session-relay/rust/src/lifecycle.rs
  - plugins/session-relay/rust/src/process_identity.rs
  - plugins/session-relay/rust/Cargo.toml
  - plugins/session-relay/rust/Cargo.lock
  - plugins/session-relay/hooks/hooks.json
  - plugins/session-relay/hooks/codex-hooks.json
  - plugins/session-relay/test/fake-app-server.mjs
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/test/lifecycle-smoke.mjs
  - plugins/session-relay/test/runtime-hook-abort.mjs
  - plugins/session-relay/test/runtime-appserver-quiescence.mjs
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

Build three general, independently testable session-relay capabilities: (A) a real-runtime-verified managed SessionStart failure path that prevents a hook-born Claude or Codex CLI from processing its first prompt; (B) process identities that cannot signal a reused PID and that terminate every descendant the platform can authoritatively contain or identify; and (C) app-server turn interruption with confirmed quiescence plus a durable managed lifecycle consulted by every relay re-entry surface. Preserve ordinary unmanaged session behavior.

Success is deliberately capability-qualified. Linux with delegated cgroup v2 can provide authoritative descendant-tree quiescence. Darwin and Linux without cgroup delegation can provide generation-safe signaling and a tracked-descendant proof, but cannot prove that an already daemonized/reparented descendant was never missed. A shared external Codex app-server cannot safely be process-killed when its protocol is unreachable. Those cases must remain `FencingUnconfirmed`, refuse relay re-entry, retain capacity/resources, and report the exact operator action; they must never be described as quiescent.

## Context & rationale

- `docs/plans/active/relay-worker-fanout.md` is blocked on its final red-team items 1–3: runtime-verified hook abort, reuse-safe execution identity including process-group escape, and durable app-server quiescence plus lifecycle-gated re-entry. This plan supplies general relay-core primitives; fan-out is only the first consumer.
- The current app-server wrapper is behind the protocol: `SpawnedThread` exposes only id/start/pump and discards the `turn/start` turn id. Current official Codex app-server documentation exposes `turn/interrupt {threadId,turnId}`, requires the client to wait for `turn/completed` with `status: "interrupted"`, and warns that interruption does not stop background terminals. This makes protocol-first cancellation buildable, but only after a version/schema and real-runtime spike.
- Current ordinary SessionStart behavior is fail-open: `hook::run` catches every inner error and always exits 0. Current Codex hooks accept top-level `continue:false` for SessionStart; current Claude hooks say SessionStart exit 2 is non-blocking, while the universal JSON `continue:false` stops processing. Both runtimes time out command hooks and continue on hook failure, so an unbounded hook hang is not a gate.
- Both plugins already install `UserPromptSubmit`. The managed design uses it as a second lifecycle check immediately before prompt processing: SessionStart must attach or return structured stop; UserPromptSubmit blocks any managed prompt whose lifecycle is not `Active`. A detached-supervisor dead-man fence is the last fallback. Ordinary sessions retain the existing log-and-exit-0 behavior.
- Linux pidfds solve PID reuse only while the file descriptor remains open; a restarted supervisor still needs persisted generation evidence. `/proc/<pid>/stat` field 22 plus the kernel boot id supplies that evidence. On Darwin, Apple exposes pid, ppid, pgid, and start seconds/microseconds through `proc_bsdinfo`, but the `libproc` header labels these interfaces private and subject to change.
- A process group is not a containment boundary: a descendant can call `setsid`/`setpgid`, and an exited parent reparents its children. Linux cgroup v2 `cgroup.kill` handles concurrent forks/migrations and `cgroup.events populated 0` proves the subtree empty. Darwin has no equivalent public unprivileged API. The portable fallback can only kill generation-verified members it observed.
- Lifecycle gating needs a per-worker lock separate from the three-second global registry flock. A shared re-entry guard spans the external operation; fencing takes the exclusive guard, then performs short registry CAS operations. No process, git, sleep, or app-server RPC may execute while `store::with_lock` or `with_gc_lock` is held.

### Feasibility verdict to carry into implementation

| Primitive | Buildable contract | Irreducible residual / bounded blast radius |
|---|---|---|
| A. Hook abort | **Conditionally yes.** Managed SessionStart returns exit-0 JSON with `continue:false` on attach failure; managed UserPromptSubmit independently blocks unless lifecycle is `Active`; a detached-supervisor dead-man kills the generation-safe CLI execution if attach does not commit before a 4-second deadline. Step 1 must prove actual Claude and Codex ordering/output behavior before retaining this design. | A runtime that skips/disables both hooks or changes their contracts can start the prompt before the supervisor fence. The engineered fallback window is **≤4 seconds nominal**, not a real-time scheduler guarantee. Managed fallback mode forbids full-access and confines writes to the worker sandbox/worktree; the supervisor retains the lifecycle slot until generation-safe quiescence is confirmed. |
| B. Process identity | **Yes for a process; capability-dependent for a tree.** Linux uses live pidfd + persisted `(boot_id,pid,start_ticks)`; Darwin uses persisted `(pid,start_tvsec,start_tvusec)` after runtime/SDK verification. Every signal revalidates the generation. Linux cgroup v2 supplies authoritative descendant containment when delegated. | Darwin and non-delegated Linux cannot detect a descendant that daemonizes/reparents before the first observation. The tracked-tree fallback must return `UnconfirmedDescendants`, never `Quiescent`; consumers needing a hard physical cap must refuse that capability tier. Apple `libproc` is private and may force a future compatibility stop. |
| C. App-server quiescence | **Yes while the current protocol and server are reachable.** Persist the `turnId`, send `turn/interrupt`, wait for the matching `turn/completed interrupted`, clean/list background terminals when the generated schema supports those experimental methods, then persist `Fenced`. Every relay re-entry takes a lifecycle guard and refuses `Fencing|Fenced|Terminal`. | Interruption does not stop background terminals. If terminal cleanup is unavailable/unconfirmed, or a shared external app-server is unreachable, relay cannot safely kill that shared server; state remains `FencingUnconfirmed`. Direct non-relay clients can still unarchive/start a Codex thread, so the guarantee is for relay-managed surfaces, not arbitrary app-server clients. |

## Environment & how-to-run

- **Base/worktree:** repository root `/home/vagrant/projects/docks-primitives`, branch `codex/relay-worker-lifecycle-primitives`, plan base `12cf2ea`. Run acceptance A0 before implementation; reconcile any affected-path drift before editing.
- **Toolchain:** Rust `1.85.0` from `plugins/session-relay/rust/rust-toolchain.toml`; locked `rustix 1.1.4`; Node 24 as used by repository CI. The four shipped targets are `x86_64-unknown-linux-musl`, `aarch64-unknown-linux-musl`, `x86_64-apple-darwin`, and `aarch64-apple-darwin`.
- **Current-runtime evidence:** Step 1 records `codex --version`, `claude --version`, `uname -a`, generated Codex app-server JSON schema, effective hook timeout/config, cgroup v2 delegation, and Darwin SDK/libproc availability in this plan's `## Notes` before implementation continues.
- **Local commands:**
  ```bash
  export PATH="$HOME/.cargo/bin:$PATH"
  cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked
  node plugins/session-relay/test/selftest.mjs
  node plugins/session-relay/test/lifecycle-smoke.mjs
  node scripts/ci.mjs --plugin session-relay
  ```
- **Real-runtime probes:** require authenticated local `claude` and `codex` installations and use isolated temporary `HOME`/`CODEX_HOME`/relay stores. They must never use a production project or `~/.agent-relay`. Run them explicitly with `RELAY_REAL_RUNTIME_TEST=1`; absence of either runtime is a release blocker for this primitive, not a skipped pass.
- **Platform matrix:** Linux unit/smoke tests run locally. Darwin behavior must run natively on both macOS target architectures: current GitHub labels are `macos-15-intel` for x86_64 and `macos-15` for arm64. Add native probe jobs to the producer workflow; its existing arm64-hosted cross-build of x86_64 alone does not validate `libproc` semantics. Step 1 re-verifies labels before editing because hosted images are time-sensitive.
- **Binary discipline:** do not build or edit committed files under `plugins/session-relay/bin/` during implementation. The later artifact/release flow remains user-gated.

## Interfaces & data shapes

### 1. Managed lifecycle and linearizable re-entry

Add `rust/src/lifecycle.rs`; keep registry serialization and short CAS operations in `store.rs`. Existing entries without `managed` deserialize as unmanaged and preserve all current behavior.

```rust
pub enum ManagedState {
    Attaching,
    Active,
    Fencing,
    FencingUnconfirmed,
    Fenced,
    Terminal,
}

pub enum ReentryKind {
    SessionStart,
    UserPromptSubmit,
    WatchInject,
    WatchAutoTurn,
    WakeAppServer,
    WakeCli,
    AttachPreview,
    AttachExec,
    Deliver,
    InitialTurn,
}

pub struct ManagedLifecycle {
    pub generation: String,       // UUIDv4; changes when a logical worker id is reused
    pub version: u64,             // JSON decimal string; increment on every CAS
    pub state: ManagedState,
    pub reason: Option<String>,
    pub attach: Option<ManagedAttach>,
    pub execution: Option<ExecutionIdentity>,
    pub appserver: Option<AppServerExecution>,
}

pub struct ManagedAttach {
    pub token_sha256: String,    // raw UUIDv4 token exists only in child env
    pub generation: String,
    pub expected_tool: String,   // claude | codex
    pub expected_dir: String,    // canonical launch cwd
    pub expires_at: String,      // RFC3339; rejected after deadline
}

pub struct AppServerExecution {
    pub server: String,
    pub thread_id: String,
    pub turn_id: Option<String>,
    pub server_process: Option<ProcessIdentity>, // only when relay owns a dedicated server
    pub shared_server: bool,
}

pub enum ReentryDecision {
    Unmanaged,
    Allowed { generation: String, version: u64 },
    Refused { state: ManagedState, reason: String },
}

pub struct ReentryGuard { /* owns a shared flock on lifecycle/<id>.lock */ }
pub struct FenceGuard { /* owns the exclusive flock on lifecycle/<id>.lock */ }

pub fn acquire_reentry(id: &str, kind: ReentryKind) -> Result<(ReentryDecision, Option<ReentryGuard>), String>;
pub fn begin_fence(id: &str, expected_generation: &str, reason: &str) -> Result<FenceGuard, String>;
pub fn finish_fence(guard: FenceGuard, proof: QuiescenceProof) -> Result<(), String>;
```

Lock order is fixed: acquire per-worker lifecycle flock first; call `with_lock` only for read/CAS; release the global lock; perform process or RPC work while retaining only the per-worker guard. No code may acquire a lifecycle flock from inside `with_lock`/`with_gc_lock`. `WatchInject` is gated even though it does not start a turn, because it mutates managed thread history after a fence. `send` may still queue mail; delivery/drain/re-entry may not consume it while fenced.

The transition table is closed: `Attaching→Active|Fencing`; `Active→Fencing`; `Fencing→Fenced` only with `QuiescenceProof`, otherwise `Fencing→FencingUnconfirmed`; `FencingUnconfirmed→Fencing` only for a new fence attempt; `Fenced→Terminal` only for the owning consumer's logical completion; `Terminal` has no outgoing transition. Normal re-entry is allowed only in `Active`. SessionStart's token-bound attach CAS is the sole special operation allowed in `Attaching`; it is not a general `ReentryGuard` bypass. `FencingUnconfirmed` is physically unproven but remains logically fenced: it refuses every re-entry exactly like `Fenced|Terminal`.

The supervisor generates the raw attach UUID, stores only its SHA-256 plus expected generation/tool/canonical cwd/deadline, and passes the raw token through `RELAY_MANAGED_ATTACH_TOKEN`. The hook hashes the presented token with the existing internal SHA-256 helper, then atomically verifies every binding before attach CAS. A token is single-use after `Attaching→Active`; replay, tool/cwd mismatch, expiry, or generation mismatch is a managed stop. Never write the raw token to registry, logs, CLI output, or prompt context.

### 2. Generation-safe process identity and containment tiers

Add `rust/src/process_identity.rs`; enable rustix's current `process` feature only if Step 1 confirms the locked API on both musl architectures. The serializable identity is distinct from live OS handles.

```rust
pub enum StartGeneration {
    Linux { boot_id: String, start_ticks: u64 },
    Darwin { start_tvsec: u64, start_tvusec: u64 },
}

pub struct ProcessIdentity {
    pub pid: u32,
    pub pgid: Option<i32>,
    pub start: StartGeneration,
}

pub enum Containment {
    LinuxCgroupV2 { relative_path: String },
    TrackedTree { members: Vec<ProcessIdentity> },
}

pub struct ExecutionIdentity {
    pub supervisor: ProcessIdentity,
    pub root: ProcessIdentity,
    pub containment: Containment,
}

pub struct IdentityMismatch {
    pub expected: ProcessIdentity,
    pub observed: Option<ProcessIdentity>, // None means PID absent
}

pub struct LiveProcess { /* owns Linux pidfd; Darwin/fallback keeps verified identity */ }

pub enum QuiescenceProof {
    ProcessExited { identity: ProcessIdentity },
    CgroupEmpty { relative_path: String },
    AppServerInterrupted { thread_id: String, turn_id: String, background_terminals_empty: bool },
}

pub enum QuiescenceResult {
    Confirmed(QuiescenceProof),
    UnconfirmedDescendants { observed: Vec<ProcessIdentity>, reason: String },
}

pub fn capture(pid: u32, pgid: Option<i32>) -> Result<ProcessIdentity, String>;
pub fn open_live(identity: &ProcessIdentity) -> Result<LiveProcess, IdentityMismatch>;
pub fn refresh_descendants(root: &ProcessIdentity, known: &[ProcessIdentity]) -> Result<Vec<ProcessIdentity>, String>;
pub fn terminate_and_confirm(execution: &ExecutionIdentity, grace: Duration) -> Result<QuiescenceResult, String>;
```

On Linux, `LiveProcess` owns a pidfd and signals only through `pidfd_send_signal`; recovery first compares boot id/start ticks, then opens a new pidfd. If pidfd is unavailable (`ENOSYS`/unsupported kernel), generation comparison before and after `kill` is mandatory and the capability reports fallback. A delegated cgroup is created before the child can fork, `cgroup.kill` is used for fencing, and `cgroup.events populated 0` is the only authoritative tree proof. Never accept an arbitrary persisted cgroup path without verifying it remains beneath the discovered delegated base.

There must be no spawn→cgroup race. Add a hidden `relay __managed-child-exec` barrier used by managed CLI launch: the wrapper starts in its own process group with a control pipe, performs no fork, and blocks before exec. The parent captures/persists its generation-safe identity, moves that PID into the prepared cgroup (when available), verifies membership, then writes one `GO` byte; only then does the wrapper `exec` the exact Claude/Codex argv. EOF or any non-`GO` byte exits without exec. On Darwin/non-cgroup Linux the same barrier persists root identity before exec. The wrapper receives argv through already-constructed `Command` arguments, not through a shell or reparsed string.

On Darwin, Step 1 must compile and run a tiny `proc_pidinfo(PROC_PIDTBSDINFO)` probe before choosing FFI. Every signal compares `pbi_pid` and start timeval immediately beforehand; descendants are enumerated with `proc_listchildpids`, recursively captured by generation, then signaled individually plus by process group. The result remains unconfirmed if any observed generation changes, enumeration errors, or a root exits before a stable two-pass snapshot. Do not use a raw pid/pgid after mismatch.

### 3. Hook abort protocol

Refactor `hook::run` into ordinary and managed result handling without changing ordinary output bytes:

```rust
pub enum HookDisposition {
    Continue(Option<String>),
    Stop { reason: String },
}

fn inner(tool: &str, event: HookEvent, input: &str) -> Result<HookDisposition, String>;
fn managed_gate(id: &str, event: HookEvent, token: &str) -> Result<HookDisposition, String>;
```

- A valid supervisor-issued `RELAY_MANAGED_ATTACH_TOKEN` selects managed behavior. Do not infer managed mode from cwd/name or accept an unbound token.
- SessionStart completes the token-bound `Attaching→Active` store CAS, verifies publication, disarms the supervisor dead-man, then emits context. Any attach error emits exit-0 JSON with top-level `continue:false`, `stopReason`, and the existing `hookSpecificOutput` shape, and requests immediate generation-safe fencing.
- UserPromptSubmit calls `acquire_reentry(...UserPromptSubmit)`. For `Attaching|Fencing|FencingUnconfirmed|Fenced|Terminal`, emit the runtime's documented block JSON and do not drain mail. This is the second first-prompt barrier and also prevents a later resume from reviving a fenced worker.
- Ordinary sessions continue to log inner errors and exit 0 exactly as today. Managed hook parse/token/store errors fail closed.
- `hooks.json` and `codex-hooks.json` receive an explicit timeout only after Step 1 proves both parsers accept the same value. The dead-man deadline must be at least 1 second below the minimum verified platform timeout.

The dead-man is owned by the detached managed supervisor, not the hook or CLI group. It waits for the exact generation to become `Active`; attach error triggers immediate fence, while no commit triggers fence at 4 seconds. This keeps the guard alive if the hook or CLI group crashes. The 4-second value is a nominal product bound and may be increased only from Step 1 measurements while retaining the one-second hook-timeout margin and updating every acceptance fixture/documented residual.

### 4. App-server interruption and quiescence

Change `SpawnedThread::start_initial_turn` and acknowledgement turn start to retain the returned turn id. Generate the exact schema from the installed minimum-supported Codex in Step 1; do not hand-author method names or params beyond the verified schema.

```rust
pub struct StartedTurn {
    ws: WsConn,
    thread_id: String,
    turn_id: String,
}

pub enum InterruptOutcome {
    Interrupted(QuiescenceProof),
    AlreadyTerminal(QuiescenceProof),
    Unconfirmed(String),
}

pub enum TurnTerminal {
    Completed { status: String },
    Failed { status: String },
    Interrupted,
}

impl StartedTurn {
    pub fn pump(&mut self, timeout_ms: u64) -> Result<TurnTerminal, String>;
    pub fn interrupt_and_confirm(&mut self, timeout_ms: u64) -> Result<InterruptOutcome, String>;
}

pub fn interrupt_thread(
    server: &str,
    thread_id: &str,
    turn_id: &str,
    timeout_ms: u64,
) -> Result<InterruptOutcome, String>;
```

The live connection sends `turn/interrupt`, waits for the matching `turn/completed`, requires terminal status `interrupted` (or a separately verified already-terminal state), and only then handles background terminals. If generated schema includes `thread/backgroundTerminals/clean` and `list`, opt into `capabilities.experimentalApi`, clean, then list until empty. If those methods are absent/rejected or the list cannot be confirmed empty, return `Unconfirmed`; do not infer quiescence from `thread/read idle`, socket closure, pump exit, or elapsed time. After proof, optionally `thread/archive` and persist `Fenced`; archive is defense in depth, not the lifecycle authority.

Recovery reconnects, resumes/subscribes, interrupts the persisted exact turn id, and waits for its terminal event. Only a recorded relay-owned **dedicated** app-server process may fall back to `terminate_and_confirm`. A shared external app-server (`shared_server=true`, the current common case) must never be killed because it can host unrelated threads.

## Steps

| # | Task | Files | Depends | Status | Done condition / failure trigger |
|---|---|---|---|---|---|
| 1 | **Feasibility spike before implementation:** record current/minimum Claude and Codex versions; generate Codex app-server schema; verify `turn/interrupt`, terminal notification shape, background-terminal clean/list, SessionStart/UserPromptSubmit ordering, `continue:false`/block behavior, timeout fail-open behavior, pidfd on both Linux musl architectures, cgroup delegation, and Darwin `libproc` generation/child enumeration on both Darwin architectures. Append the evidence and capability table to `## Notes`; resolve or escalate every conditional interface below before Rust edits. | `docs/plans/active/relay-worker-lifecycle-primitives.md` (Notes only), `/tmp/relay-lifecycle-spike-*` (untracked fixtures) | — | planned | Each probe has command, version, raw result path, and verdict. If either runtime cannot stop the first prompt through SessionStart + UserPromptSubmit, or the generated app-server lacks `turn/interrupt`, STOP and rewrite the plan around the best achievable substitute before editing Rust. |
| 2 | Add backward-compatible managed lifecycle serialization, per-worker shared/exclusive flock guards, version/generation CAS, transition table, and fail-closed re-entry decisions. | `rust/src/lifecycle.rs` (new), `rust/src/store.rs:446-570,1208-1292`, `rust/src/lib.rs:1-10`, `rust/Cargo.toml`, `rust/Cargo.lock` | 1 | planned | Unit/race tests prove legacy entries are unmanaged, only `Active` admits normal re-entry, an exclusive fence linearizes after prior shared guards and before later ones, and global store lock remains available during a five-second guarded fake RPC. Any lifecycle-lock/global-lock inversion is a STOP defect. |
| 3 | Implement generation-safe process capture/open/signal/wait and capability-tiered descendant termination: pidfd + persisted Linux generation, cgroup v2 strong containment, Darwin/non-cgroup tracked-tree fallback, and the barriered `__managed-child-exec` wrapper. Wire the detached supervisor and CLI child launch to capture identity/containment before `GO` and before reporting birth/start. | `rust/src/process_identity.rs` (new), `rust/src/spawn.rs:337-495,662-793`, `rust/src/main.rs:14-59`, `rust/src/store.rs`, `rust/src/lib.rs`, `rust/Cargo.toml`, `rust/Cargo.lock`, `.github/workflows/build-binaries.yml` | 1,2 | planned | Tests reject injected PID reuse, never signal a mismatched generation, prove the wrapper cannot exec/fork before identity+cgroup publication, kill a setsid descendant under delegated cgroup and prove `populated 0`, and return `UnconfirmedDescendants` (not success) for an escaped/reparented tracked-tree gap. Native Darwin tests validate start-time and child enumeration. If the child can fork before containment/identity publication, STOP. |
| 4 | Implement managed hook abort: token-bound attach CAS, structured SessionStart stop, managed UserPromptSubmit lifecycle barrier, 4-second dead-man, and ordinary fail-open byte compatibility. | `rust/src/hook.rs:22-257`, `rust/src/spawn.rs`, `rust/src/store.rs`, `hooks/hooks.json`, `hooks/codex-hooks.json`, `test/runtime-hook-abort.mjs`, `test/selftest.mjs` | 1-3 | planned | Real Claude and Codex probes show attach failure and hook timeout never create the sentinel first-prompt side effect; unit tests prove ordinary sessions still exit 0/log errors and managed sessions do not drain mail while non-Active. If a real runtime reaches the sentinel, STOP and keep the primitive unshipped. |
| 5 | Implement protocol-first app-server interruption: retain `turnId`, interrupt exact turn, wait for matching terminal notification, clean/list background terminals when supported, and use generation-safe process fallback only for a relay-owned dedicated server. | `rust/src/appserver.rs:50-76,84-164,198-241,537-617`, `rust/src/spawn.rs:337-495`, `test/fake-app-server.mjs`, `test/runtime-appserver-quiescence.mjs` | 1-3 | planned | Fake and real app-server tests prove `turn/interrupt` request shape/order, matching `turn/completed interrupted`, empty background terminal list, recovery reconnect, and `Unconfirmed` on unreachable shared server. `thread/read idle`, pump exit, or socket close alone must fail the proof. |
| 6 | Gate every relay re-entry surface with the typed guard: hook start/prompt, watch inject/auto-turn/ack, app-server deliver, wake app-server/CLI resume, attach preview/exec, and initial turn. Queueing mail remains allowed. | `rust/src/watch.rs:186-330,555-605`, `rust/src/cli.rs:198-367,726-1075`, `rust/src/appserver.rs:84-164`, `rust/src/spawn.rs`, `rust/src/hook.rs`, `rust/src/main.rs:1-59`, `rust/src/lifecycle.rs` | 2,4,5 | planned | A table-driven test covers every `ReentryKind`; lifecycle smoke races fence against each surface and records zero post-fence `thread/resume`, `thread/inject_items`, `turn/start`, `codex exec resume`, `claude --resume`, or attach exec. If any caller can invoke `deliver` without a guard, STOP. |
| 7 | Add deterministic cross-process/adversarial coverage for PID reuse, setsid/pgid escape, dead-man timeout, interrupt recovery, background terminals, fence/re-entry races, and global-lock non-blocking; extend existing selftest without weakening prior assertions. | `test/lifecycle-smoke.mjs` (new), `test/runtime-hook-abort.mjs` (new), `test/runtime-appserver-quiescence.mjs` (new), `test/fake-app-server.mjs`, `test/selftest.mjs`, `rust/src/*` unit tests | 2-6 | planned | Acceptance A1-A11 pass in isolated temp stores. Every helper cleans up in `finally`; a failed proof leaves diagnostic state but no untracked process. Wall-clock assertions are used only for lock exclusion, never as quiescence proof. |
| 8 | Document capability tiers, managed lifecycle/refusal diagnostics, hook residual, app-server interruption/background-terminal caveat, and operator recovery; run full plugin and four-target gates. Do not rebuild committed binaries or release. | `plugins/session-relay/AGENTS.md`, `skills/productivity/session-relay/SKILL.md`, `rust/src/main.rs:1-59`, `.github/workflows/build-binaries.yml` | 1-7 | planned | Docs never call tracked-tree fallback or unreachable shared app-server quiescent; CLI errors name state/reason/recovery; A12-A15 pass. Any documentation promise stronger than the runtime capability table is a STOP defect. |

## Acceptance criteria

Run from repository root with `PATH="$HOME/.cargo/bin:$PATH"`. Each criterion is independently executable after its dependency step; any unstated skip is failure.

| ID | Criterion | Command | Expected output/result |
|---|---|---|---|
| A0 | Plan base and affected paths are reconciled before implementation. | `git diff --stat 12cf2ea..HEAD -- plugins/session-relay/rust/src plugins/session-relay/rust/Cargo.toml plugins/session-relay/rust/Cargo.lock plugins/session-relay/hooks plugins/session-relay/test plugins/session-relay/AGENTS.md plugins/session-relay/skills/productivity/session-relay/SKILL.md .github/workflows/build-binaries.yml` | Before source edits: only this plan is outside the path set, so stdout is empty and exit is 0. Later drift must match completed plan steps. |
| A1 | Current protocol and hook contracts are captured, not assumed. | `test -f docs/plans/.relay-lifecycle-feasibility.json && jq -e '.codex.turn_interrupt == true and .codex.turn_completed_interrupted == true and .hooks.claude.first_prompt_blocked == true and .hooks.codex.first_prompt_blocked == true' docs/plans/.relay-lifecycle-feasibility.json` | Exit 0 and stdout `true`. The file is an untracked/generated local artifact referenced by Notes; false/missing stops implementation. |
| A2 | Lifecycle schema and transition table are backward-compatible and fail closed. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked lifecycle_ -- --nocapture` | Exit 0; every `lifecycle_*` test is `ok`, including legacy-unmanaged, allowed-state table, stale generation/version, and refused-state diagnostics. |
| A3 | Per-worker locks linearize fencing without holding the global store lock. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked lifecycle_lock_ -- --nocapture` | Exit 0; race tests show pre-fence shared guard completes before exclusive fence, post-fence guards refuse, and a concurrent store operation completes during a five-second fake RPC. |
| A4 | PID reuse can never redirect a signal. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked process_identity_reuse_ -- --nocapture` | Exit 0; injected start-generation mismatch returns `IdentityMismatch`; fake signal recorder contains no signal for the replacement process. |
| A5 | Descendant containment reports only proofs the platform supports. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked process_identity_descendants_ -- --nocapture` | Exit 0; delegated-cgroup fixture proves `CgroupEmpty`; tracked fallback kills observed setsid children but returns `UnconfirmedDescendants` when a fixture reparents before capture. |
| A6 | Managed hook failure and timeout stop the first real prompt on both CLIs. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/runtime-hook-abort.mjs` | Exit 0 and exact final lines `PASS: claude managed attach failure stopped before first prompt`, `PASS: codex managed attach failure stopped before first prompt`, and `PASS: managed hook timeout stopped before first prompt`; sentinel files are absent. |
| A7 | App-server interruption is a terminal-event proof, including background terminals. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/runtime-appserver-quiescence.mjs` | Exit 0 and final line `PASS: app-server turn interrupted, terminals empty, lifecycle fenced`; captured frames contain `turn/interrupt`, matching `turn/completed` status `interrupted`, terminal clean/list, then no later turn start. |
| A8 | Fake app-server exercises success, ambiguity, and recovery deterministically. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case appserver` | Exit 0 and final line `PASS: lifecycle app-server cases`; unreachable shared server remains `FencingUnconfirmed`, reconnect interrupts the persisted turn id, and idle-only fixture is rejected. |
| A9 | Every relay re-entry surface refuses after the fence linearization point. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case reentry` | Exit 0 and final line `PASS: 10 managed re-entry surfaces fenced`; captured process/RPC log contains zero post-fence starts, resumes, attaches, injections, or deliveries while queued mail remains present. |
| A10 | Hook/process adversarial cases clean up without relying on time as proof. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case process` | Exit 0 and final line `PASS: lifecycle process cases`; no fixture PID/generation remains live; non-authoritative fallback is reported unconfirmed. |
| A11 | Existing relay behavior remains green. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked && node plugins/session-relay/test/selftest.mjs` | Exit 0; Rust reports all tests passed and selftest ends `PASS: session-relay self-test — <N> checks (binary: rust/target/debug/relay)` with the runtime-derived count. |
| A12 | Formatting and warnings are clean. | `cargo fmt --manifest-path plugins/session-relay/rust/Cargo.toml --check && cargo clippy --manifest-path plugins/session-relay/rust/Cargo.toml --locked --all-targets -- -D warnings` | Both exit 0 with no formatting diff and no clippy warnings. |
| A13 | All four shipped architectures compile and Darwin process probes run natively. | `gh workflow run build-binaries.yml --ref codex/relay-worker-lifecycle-primitives && gh run watch --exit-status "$(gh run list --workflow build-binaries.yml --branch codex/relay-worker-lifecycle-primitives --limit 1 --json databaseId --jq '.[0].databaseId')"` | Dispatch succeeds; Linux x86_64/aarch64 musl builds are green, `macos-15` arm64 builds/probes natively, and `macos-15-intel` x86_64 builds/probes natively. Do not download/commit artifacts in this plan. |
| A14 | Plugin gates pass without touching committed binaries. | `node scripts/ci.mjs --plugin session-relay` | Exit 0 with session-relay Rust, hook JSON, skill, checksum, and selftest gates green; a documented local binary-byte warning is allowed, no failure is. |
| A15 | The diff contains only planned source/tests/docs and no binary/release mutation. | `git diff --check 12cf2ea..HEAD && git diff --name-only 12cf2ea..HEAD | rg '^(plugins/session-relay/(rust/src|rust/Cargo\.(toml|lock)|hooks|test|AGENTS\.md|skills/productivity/session-relay/SKILL\.md)|\.github/workflows/build-binaries\.yml|docs/plans/active/relay-worker-lifecycle-primitives\.md)$' -v` | First command exits 0. Second prints nothing and exits 1 because there are no out-of-scope paths; no file under `plugins/session-relay/bin/` or manifest version is changed. |

## Out of scope / do-NOT-touch

- **Fan-out lifecycle items 4–6:** do not design or implement recovery for never-Idle `Stopping`, partial `git worktree remove`, or fence-owner lease/steal here. Those remain in `relay-worker-fanout` Draft-5 because their state machine and cleanup semantics are fan-out-specific.
- **Fan-out cap/depth/handback/collection:** do not add reservation, cap, worktree, merge, handback, or collection code. This plan exposes general lifecycle/process/quiescence primitives only.
- **Arbitrary-client enforcement:** do not claim relay can stop a human or third-party app-server client from directly unarchiving or starting a fenced Codex thread. Gate every relay-owned surface and document the boundary.
- **Killing shared app-server:** do not terminate a server unless its exact generation-safe process identity is recorded as relay-owned and dedicated. A shared server may host unrelated threads.
- **New privileged daemon/helper:** do not install a launchd service, systemd unit, root helper, kernel extension, or system-wide cgroup. Only use an already delegated user-writable cgroup v2 subtree.
- **Committed binaries/version/release:** do not edit `plugins/session-relay/bin/`, plugin/marketplace versions, tags, or releases. Producer artifacts and release happen in a later user-authorized change.
- **Unrelated store/GC/mail semantics:** preserve existing mailbox trust fencing, flat-file GC, lock timeout, discovery, and ordinary session behavior; do not refactor them opportunistically.

## Known gotchas

- `turn/interrupt` success response only means cancellation was requested; the matching terminal event is the completion proof. `thread/read idle` is a transient sample and insufficient.
- App-server turn interruption does not terminate background terminals. Experimental clean without list/empty confirmation is also insufficient.
- The current acknowledgement path starts a turn inside `deliver`; both the caller's pre-check and the internal post-settle start must carry the same lifecycle guard.
- A pidfd is live, non-serializable supervisor state. Durable recovery always rechecks the persisted start generation before opening a new pidfd.
- `Command::spawn` followed by a parent-side cgroup write is racy because the child can fork first. Managed launches must go through the blocking `__managed-child-exec` wrapper and verify membership before `GO`.
- `/proc/<pid>/stat` parsing must locate the final `)` of `comm` before indexing field 22; process names can contain spaces and parentheses.
- PID plus wall-clock start seconds is not enough on fast PID reuse. Linux uses boot-id + start ticks; Darwin uses seconds + microseconds and fails closed if unavailable.
- Process groups do not include descendants after `setsid`; recursive PPID walks miss children that already reparented. Only cgroup v2 earns an authoritative tree proof in this plan.
- Apple labels `libproc` process enumeration APIs private and subject to change. Native runtime tests are mandatory; successful cross-linking is not evidence of semantics.
- Multiple matching hooks can run concurrently. The lifecycle gate must tolerate duplicate SessionStart/UserPromptSubmit invocations through versioned idempotent CAS.
- The raw managed attach token is a bearer secret for one attach transition. Store only its SHA-256 and never place it in logs, plan artifacts, or prompts.
- A command-hook timeout/failure is fail-open in both runtimes. Keep the managed dead-man below the verified timeout, and never weaken UserPromptSubmit's second gate.
- Do not drain mail before the lifecycle decision; a refused wake/watch must leave queued mail durable.
- `with_lock` gives up after three seconds. The 4-second dead-man budget leaves only one second beyond worst-case store contention; Step 1 must measure cold runtime startup and may increase both values while preserving at least a one-second margin below platform hook timeout.

## Global constraints

- **“FEASIBILITY FIRST. Step 1 must be a research/feasibility spike; design only what the platforms actually allow.”**
- Target all four shipped builds: **x86_64 + aarch64 musl-linux and x86_64 + aarch64 Darwin**.
- **“never call git/process/RPC while holding with_lock/with_gc_lock.”** Sleeps and blocking waits are likewise forbidden under those global locks.
- Preserve the three-second global store-flock critical-section contract.
- Keep the primitives general and independently testable; fan-out is only a consumer.
- Hook-born managed workers may not use full-access while fallback abort remains possible; the residual must stay confined to the worker sandbox/worktree.
- Never treat raw pid/pgid, pump exit, socket close, elapsed time, or `thread/read idle` as quiescence proof.
- Never weaken validator floors, existing security fencing, or binary provenance to pass CI.

## STOP conditions

- Step 1 cannot demonstrate that both current supported Claude and Codex runtimes prevent the sentinel first-prompt effect using the documented SessionStart/UserPromptSubmit outputs. STOP before Rust edits and record the best achievable supervisor-only substitute plus its unbounded scheduler residual.
- Generated minimum-supported Codex schema lacks `turn/interrupt`, omits `turnId`, or does not emit a matching terminal status. STOP and re-scope C to a dedicated-server process fence; do not invent RPCs.
- Background-terminal clean/list is unavailable and a test can leave a terminal alive after interrupt. STOP the confirmed-quiescence claim; retain `FencingUnconfirmed` and resolve Open question `background-terminal-policy`.
- A managed CLI can fork before its cgroup/process generation is persisted, or PID-reuse tests record any signal to the replacement generation. STOP; no consumer may release capacity on that path.
- Darwin start generation or child enumeration is unavailable on either native architecture. STOP the Darwin confirmed-process claim and resolve Open question `darwin-containment-policy`.
- Any re-entry caller can reach `thread/inject_items`, `turn/start`, a resume CLI, or attach exec without a lifecycle guard, or can use a stale guard after exclusive fencing. STOP before docs/CI.
- Any app-server/process operation, sleep, or test double is called while `with_lock`/`with_gc_lock` is held. STOP and split select/CAS from external work.
- Recovery proposes killing an unowned/shared app-server. STOP; keep the lifecycle fenced and surface operator recovery.
- The only available “proof” is timeout, process-group absence, transient Idle, or clean worktree. STOP; persist unconfirmed state instead.
- More than three attempts hit the same test/lint failure without a new diagnosis. STOP the loop, append `## Mistakes & Dead Ends`, and reassess.

## Open questions

### darwin-containment-policy

- **Type:** choice — NEEDS CLARIFICATION; custom allowed.
- **Context:** Darwin offers generation-safe individual process control through private `libproc`, but no public unprivileged cgroup-equivalent. A child that daemonizes before observation cannot be proven absent.
- **Options:**
  1. **Ship tracked-tree as explicitly unconfirmed (recommended):** support ordinary process cleanup, but consumers requiring a hard physical cap (including fan-out) refuse Darwin unless a future authoritative containment backend exists.
  2. Disable all managed worker lifecycle features on Darwin; keep only unmanaged relay behavior.
  3. Expand scope to a separately approved launchd/privileged containment helper (not implementable under this plan's constraints).

### background-terminal-policy

- **Type:** choice — NEEDS CLARIFICATION after Step 1 schema/runtime probe; custom allowed.
- **Context:** `turn/interrupt` explicitly leaves background terminals running. Current docs expose experimental clean/list methods, but minimum-version availability and stable opt-in must be verified.
- **Options:**
  1. **Require clean + list-empty for confirmed quiescence (recommended):** otherwise remain `FencingUnconfirmed` and retain capacity until operator recovery/upgrade.
  2. Treat interrupted turn as sufficient and document terminals as outside worker lifecycle (not recommended; weakens physical quiescence).
  3. Require a relay-owned dedicated app-server for managed workers so protocol failure can fall back to process fencing (higher resource cost; separate scope decision).

## Cold-handoff checklist

1. **File manifest:** present — every step names exact files and current line ranges where editing an existing file.
2. **Environment & commands:** present — base, toolchain, runtime prerequisites, local commands, real-runtime flags, and native target matrix are explicit.
3. **Interface & data contracts:** present — lifecycle, guard, process identity, containment, proof, hook disposition, and app-server interruption shapes are defined.
4. **Executable acceptance:** present — A0–A15 each specify a command and expected result.
5. **Out of scope:** present — fan-out-specific items 4–6, shared-server kill, arbitrary clients, privileged helpers, binaries/releases, and unrelated cleanup are excluded with rationale.
6. **Decision rationale:** present — protocol-first interrupt, dual hook gate, token binding, per-worker flock, barriered exec, pidfd+persistent generation, cgroup strong tier, and fail-closed residuals are justified.
7. **Known gotchas:** present — timeout fail-open, terminal survival, pidfd persistence, `/proc` parsing, Darwin private API, process-group escape, duplicate hooks, and mail ordering are explicit.
8. **Global constraints verbatim:** present — feasibility first, four targets, and no external work under store locks are copied from the task.
9. **No undefined terms / forward refs:** present — every named state, proof, guard, capability tier, generated test, and open decision is defined here; no TODO/TBD placeholder remains.

Adversarial cold-read result: a cold executor can start with Step 1 and knows which facts are provisional, which interfaces must be rewritten if probes disagree, what constitutes proof on each platform, and when to stop. The only decisions intentionally left unresolved are Darwin policy and background-terminal minimum support, both structured above rather than guessed.

## Self-review

Score: **96/100** · trajectory **79→88→93→95→96→96→96→96** · stopped: **plateau (K=3)**.

Weighted result: standalone executability **22/22**; actionability **16/16**; dependency order **12/12**; evidence re-verify **10/10**; goal coverage **11/12**; executable acceptance **12/12**; failure mode **9/10**; assumption→question **4/6**. The residual deductions are intentional: no portable Darwin descendant containment, no safe process-kill fallback for an unreachable shared app-server, hook watchdog timing is not a hard real-time guarantee, and two policy choices require the parent/user after the runtime spike.

The scored loop caught and corrected: (1) the initial design wrongly assumed app-server had no cancel RPC — current docs prove `turn/interrupt`; (2) interruption alone leaves background terminals, so clean/list-empty became part of proof; (3) pre-checking lifecycle before `deliver` left an Idle→turn-start TOCTOU, so a shared per-worker guard now spans the operation and fencing takes exclusive ownership; (4) pidfd alone was incorrectly treated as durable, so boot/start generation is persisted; (5) process-group kill was incorrectly treated as tree containment, so cgroup v2 is the only strong tree tier and portable fallbacks return unconfirmed; (6) SessionStart output alone did not cover hook timeout/crash, so UserPromptSubmit and a detached-supervisor dead-man were added; (7) a parent-side post-spawn cgroup move left a fork race, so managed launch now blocks in `__managed-child-exec` until identity and containment are published; (8) the attach token was initially unbound bearer state, so only a hash plus generation/tool/canonical-cwd/deadline is persisted; (9) the first interface omitted lifecycle transitions and named `IdentityMismatch`/`TurnTerminal` without shapes, so the closed table and missing types were added; (10) killing an unreachable shared app-server would affect unrelated threads, so that path is forbidden; (11) acceptance initially used fake hooks only, so authenticated real-runtime probes became release gates; (12) the Darwin matrix only cross-built Intel on arm64, so native `macos-15-intel` and `macos-15` probes became required; (13) a generated feasibility artifact was accidentally implied to be tracked, so A1 and Environment now identify it as untracked evidence summarized in Notes.

## Notes

Step 1 appends a dated capability table here before implementation. Record exact versions, commands, output artifact paths, and one of `supported | fallback | impossible` for: Claude SessionStart stop, Claude UserPromptSubmit block, Codex SessionStart stop, Codex UserPromptSubmit block, hook timeout behavior, app-server interrupt, terminal event correlation, background terminal clean/list, Linux pidfd, Linux cgroup delegation, and Darwin generation/child enumeration. Do not paste large generated schemas into this plan.

## Sources

- `docs/plans/active/relay-worker-fanout.md:456-473` — final red-team items 1–3 define these general primitives; items 4–6 remain fan-out-specific and item 7 requires shared strengthening.
- `plugins/session-relay/rust/src/appserver.rs:50-76` — verified source fact: `SpawnedThread` currently has id/start/pump and no interrupt/cancel.
- `plugins/session-relay/rust/src/appserver.rs:84-112,198-241,573-617` — delivery samples Idle then starts/pumps a turn; pump completion is event-based but does not retain terminal status or turn id.
- `plugins/session-relay/rust/src/watch.rs:558-590` — verified source fact: watch drains/injects and may auto-start through `deliver` without lifecycle/version gating.
- `plugins/session-relay/rust/src/cli.rs:269-367,925-1031` — attach preview/exec and app-server wake are independent re-entry surfaces; wake checks transient Idle then calls `deliver` with auto-turn.
- `plugins/session-relay/rust/src/hook.rs:109-117,195-257` — verified source fact: hook catches inner errors and always exits 0; SessionStart currently registers/drains and emits context only.
- `plugins/session-relay/rust/src/spawn.rs:337-495,424-431,662-793,713-724` — verified source fact: app-server pump and CLI child use independent process groups; the current supervisor retains only raw child handles while alive.
- `plugins/session-relay/rust/src/store.rs:446-482,485-545,1208-1292` — verified source fact: global `with_lock` is a three-second kernel-flock critical section; Entry lacks lifecycle/execution identity; register is a locked read-modify-write.
- `plugins/session-relay/rust/src/main.rs:14-59` — current multi-call routing identifies every CLI surface that must remain wired/documented.
- [Codex hooks — common output and SessionStart](https://learn.chatgpt.com/docs/hooks#common-output-fields) — SessionStart supports `continue:false`; default command-hook timeout is 600 seconds and hook failures continue.
- [Codex app-server API overview](https://learn.chatgpt.com/docs/app-server#api-overview) — current methods include `turn/interrupt`, thread archive/unsubscribe, and experimental background-terminal clean/list.
- [OpenAI Codex app-server README — interrupt example](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md#example-interrupt-an-active-turn) — exact `{threadId,turnId}` request; rely on `turn/completed interrupted`; background terminals survive interruption.
- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks) — SessionStart exit 2 is non-blocking, universal `continue:false` stops processing, UserPromptSubmit can block, and command hooks time out rather than forming an unbounded gate.
- [Linux `pidfd_open(2)`](https://man7.org/linux/man-pages/man2/pidfd_open.2.html) — pidfd is a pollable stable task reference (Linux 5.3+) and can be signaled with `pidfd_send_signal`.
- [Linux `/proc/pid/stat(5)`](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html) — field 22 is process start time after boot in clock ticks.
- [Linux cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html) — `cgroup.kill` handles descendant trees/concurrent forks and `cgroup.events populated 0` is recursive emptiness evidence.
- [rustix process API 1.1.4](https://docs.rs/rustix/1.1.4/rustix/process/) — `pidfd_open`/`pidfd_send_signal` require the `process` feature and are Linux-only; verify locked version during Step 1.
- [Apple XNU `proc_bsdinfo`](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/proc_info.h) — exposes pid/ppid/pgid and start seconds/microseconds.
- [Apple XNU `libproc.h`](https://github.com/apple-oss-distributions/xnu/blob/main/libsyscall/wrappers/libproc/libproc.h) — exposes process/child enumeration but labels the interfaces private and subject to change.
- [Apple `killpg(2)`](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/killpg.2.html) — signals only the named process group, not descendants that leave it.
- [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) — current native macOS labels are `macos-15-intel` for x86_64 and `macos-15` for arm64; Step 1 re-verifies before workflow edits.

## Review

*(filled by plan-review on completion)*
