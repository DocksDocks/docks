---
title: Relay worker self-orchestration (fan-out sub-workers)
goal: Safely let an isolated relay worker fan out two depth-1 worktree children, receive atomic handbacks, integrate them idempotently, and collect their lifecycle records.
status: planned
created: "2026-07-10T22:57:23-03:00"
updated: "2026-07-11T02:50:17-03:00"
started_at: null
assignee: null
tags: [session-relay, orchestration, rust]
affected_paths:
  - plugins/session-relay/rust/src/fanout.rs
  - plugins/session-relay/rust/src/lib.rs
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/appserver.rs
  - plugins/session-relay/rust/src/hook.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/test/fanout-smoke.mjs
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/AGENTS.md
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
related_plans:
  - relay-live-view
  - relay-store-hygiene
review_status: null
planned_at_commit: c3d0564e3a7901934c31275829c4153d4ae2b87e
---

# Relay worker self-orchestration (fan-out sub-workers)

## Goal

Enable a spawned session-relay worker to decompose a task, run at most **two** isolated depth-1 child workers in parallel, receive durable machine-readable handbacks, integrate each result incrementally, and reclaim every worktree without corrupting a shared checkout or deleting unmerged work. Relay owns identity derivation, atomic reservations, lifecycle/lease enforcement, supervision, handback persistence, integration preflight, and fail-closed cleanup; the root worker still decides how to slice the task.

## Context & rationale

- The user chose the settled v1 design: **worktree per worker**, extend `relay spawn`, whole-tree active-descendant cap **2**, recursion depth **1**, same-repository write fan-out, cross-tool children, incremental integration, and fail-closed cleanup. Draft-4 hardens those choices without reopening them; the nine Draft-3 confirm-pass closures remain in force.
- Session-relay **0.10.0 is already shipped** on this base. Tag `session-relay--v0.10.0` points at `838fb40`; live-view merged at `e51ed8f`; this plan is based on current `main` `c3d0564`. `Entry.server`, `Entry.spawned_via`, app-server-native `thread/start`, and the detached app-server pump are present now, so they are inputs rather than future dependencies.
- Current ordinary spawn has asymmetric birth identity: Claude accepts a pre-minted session UUID, while Codex has no pre-set-id flag and is discovered from its SessionStart registration. App-server spawn receives its Codex UUID only from the `thread/start` response. A fan-out reservation therefore cannot use the future session UUID as its key.
- Current `with_lock` is a three-second, kernel-`flock`-protected registry critical section. The reservation count, ancestry validation, expected-state transition, and registry write must occur in one hold; a count followed by a later write would allow the cap to race.
- Current `store::gc` protects a fixed set of **flat regular files** with `O_NOFOLLOW`, snapshot validation, and dirfd-relative `unlinkat`. A git worktree is a recursive repository structure; it must be removed through validated `git worktree remove`, never passed to that flat-file deletion helper.
- Bus mail remains useful as a human notification, but it is opaque untrusted text. `relay collect` must consume an atomic store record written by `relay handback`, not parse an inbox message.

## Decisions (resolved)

| Topic | Dispatch contract | Why |
|---|---|---|
| Root isolation | `relay spawn <repo> --fanout --from <invoker-id>` **implies `--worktree`** and creates a new managed root at depth 0. A fan-out root is never launched in the caller's checkout. | The root integrates children; isolating only its children would leave that integration in the shared checkout. |
| Child isolation | A managed root invokes `relay spawn <repo> --worktree --from <root-id>`; membership, parent, root, and depth are derived from the stored parent Entry. | Callers cannot forge ancestry or escape the tree cap. |
| Cap | Fixed at **2 physically active depth-1 descendants** (`Reserved`, `Running`, or `Stopping`) for the entire root; stored once as `fanout_cap = 2` on the root Entry. The depth-0 root is never counted. Remove draft-2's `--max-parallel` and `AGENT_RELAY_MAX_DESCENDANTS` override. | A root-owned immutable cap cannot be raised by a descendant, and a timed-out-but-live execution continues consuming its slot until fenced and confirmed quiescent. |
| Depth | Root is typed `depth: 0u8`; its children are `depth: 1u8`; a depth-1 Entry cannot spawn a managed child. | This is the user-selected recursion bound and prevents geometric growth. |
| Reservation identity | Generate a UUIDv4 **reservation token** before worktree creation. It is not a session UUID and names the branch/worktree and a separate reservation record until birth attaches it to the born UUID. | Neither Codex CLI nor app-server has the final UUID at reservation time. |
| Supervision | Fan-out mode always launches a detached `__fanout-supervisor`; the foreground parent returns after valid birth/first-turn start, while the supervisor owns the reservation, child/pump handle, fenced lease renewal, and first-turn result. Persist CLI process-group or app-server thread identity before reporting started. | Ordinary `spawn` otherwise drops the child handle after birth; persisted execution identity lets a reaper fence physical work before releasing capacity. |
| Handback/integration | `relay handback` atomically records source commits; `relay collect` verifies and merges `base_sha..head_sha` with `git merge --no-ff --no-edit <head_sha>`. | A merge makes `head_sha` an ancestor of the parent, giving a crash-safe idempotency check that repeated cherry-picks cannot provide. |
| Cleanup | `relay collect` is clean/merged by default; `--delete-branch` is the only branch-deletion flag; `--force` is an explicit abandon path. A persisted `Collecting` intent precedes worktree/branch cleanup and final receipt. GC uses the same protocol in three phases with git outside every store lock. | The intent closes crashes after worktree removal or before branch deletion; store locks never cover slow git/process operations. |
| Cross-repo scope | Root and children must have the same git common-dir identity as their invoking parent. Ordinary non-fan-out spawn remains cross-project. | Canonical path strings can differ for the same repository and match misleadingly after moves; `(st_dev, st_ino)` of the canonical common dir is authoritative. |

## Environment & how-to-run

- **Checkout/base:** `/home/vagrant/projects/docks`, `main` at `c3d0564e3a7901934c31275829c4153d4ae2b87e`; session-relay manifests are `0.10.0`. Before editing, run the drift command in Acceptance criterion A0. Any source change under the affected paths is a STOP condition until this plan is reconciled.
- **Toolchain:** repository `rust-toolchain.toml`; committed `plugins/session-relay/rust/Cargo.lock`; Node 24 matches repository CI; git worktree commands require the installed git used by the repository.
- **Build and tests:**
  ```bash
  export PATH="$HOME/.cargo/bin:$PATH"
  cargo test --manifest-path plugins/session-relay/rust/Cargo.toml
  node plugins/session-relay/test/selftest.mjs
  node scripts/ci.mjs --plugin session-relay
  ```
- **Deterministic smoke:** `plugins/session-relay/test/fanout-smoke.mjs` creates its own `mkdtemp` relay home and git repository, uses stub Claude/Codex processes plus `fake-app-server.mjs`, and removes the sandbox in `finally`. It must never read or write `~/.agent-relay`.
- **Binary discipline:** do not rebuild or edit `plugins/session-relay/bin/`. Committed binaries come only from `.github/workflows/build-binaries.yml` artifacts; binary rebuild, manifest version bump, tag, and release are a later user-gated operation.
- A local `node scripts/ci.mjs --plugin session-relay` may print the documented host-rebuild-digest warning; the command must still exit 0. CI enforces byte identity in the producer environment.

## Interfaces & data shapes

### Store schema

Add `plugins/session-relay/rust/src/fanout.rs` for the typed state machine, repo/worktree preflight, supervisor configuration, handback, and collect operations; expose it from `lib.rs`. Keep registry I/O and locking in `store.rs`. Extend registry JSON from `{agents,names}` to `{agents,names,reservations}`; `parse_registry` must default a missing `reservations` object to empty. `relay list` must render both attached Entries and unattached reservations, keyed/displayed by requested name when present and otherwise by reservation token, so a failure before birth is never invisible or uncollectable.

```rust
pub enum FanoutLifecycle {
    Reserved, Running, Stopping, Completed, Failed, Collecting, Collected
}

pub enum LifecycleActor { Coordinator, Hook, AppServer, Supervisor, Child, Parent, Reaper }

pub struct ExecutionIdentity {
    pub supervisor_pid: u32,
    pub process_group_id: Option<i32>, // CLI child group; signal the negative pgid
    pub appserver_thread_id: Option<String>, // app-server thread/read identity
}

pub enum CollectionPhase { Prepared, WorktreeRemoved, BranchReconciled }

pub struct CollectionIntent {
    pub prior: FanoutLifecycle,       // Completed | Failed
    pub requested_by: String,         // authorized parent UUID or "gc"
    pub delete_branch: bool,          // persisted before any destructive action
    pub force_abandon: bool,          // parent-only; always false for GC
    pub expected_branch_head: String,
    pub phase: CollectionPhase,
}

pub struct CollectionReceipt {
    pub reservation_id: String,
    pub collected_at: String,
    pub delete_branch: bool,
    pub force_abandon: bool,
    pub branch_deleted: bool,
}

pub struct RepoIdentity {
    pub common_dir: String, // diagnostic/repair path, canonical at capture time
    pub dev: u64,           // stat identity; serialize losslessly as decimal string
    pub ino: u64,           // stat identity; serialize losslessly as decimal string
}

pub struct Handback {
    pub base_sha: String,   // captured before git worktree add; never caller supplied
    pub head_sha: String,   // git -C <worktree> rev-parse HEAD at handback time
    pub branch: String,     // stored branch; ref must still resolve to head_sha
    pub status: String,     // completed | failed | conflict
    pub note: String,
}

pub struct Reservation {
    pub reservation_id: String,       // UUIDv4 token; NOT the future session UUID
    pub parent: String,               // invoking registered session UUID
    pub root: Option<String>,         // None for a new root; root UUID for a child
    pub depth: u8,                    // derived: 0 for root, parent.depth + 1 for child
    pub lifecycle: FanoutLifecycle,   // may terminalize/collect before session birth
    pub lifecycle_actor: LifecycleActor,
    pub lifecycle_reason: Option<String>,
    pub attach_error: Option<String>,    // managed hook failure; hook stays blocked
    pub version: u64,                  // decimal-string JSON; increment every CAS/renewal
    pub lease_expires_at: String,     // RFC3339 UTC; supervisor-renewed
    pub execution: Option<ExecutionIdentity>,
    pub base_sha: String,
    pub repo: RepoIdentity,
    pub worktree: String,
    pub branch: String,               // relay/fanout-<reservation_id>
    pub requested_name: Option<String>,
    pub collection: Option<CollectionIntent>,
    pub collection_receipt: Option<CollectionReceipt>,
}
```

Extend `Entry` additively; retain `id`, `dir`, `name`, `tool`, `last_seen`, `server`, and `spawned_via` exactly. New fields are optional so an old row decodes without mutation. `depth` is `Option<u8>` and `lifecycle` is `Option<FanoutLifecycle>`, not strings. An old Entry with `lifecycle == None` is **legacy/unmanaged**: it is not counted, reaped, collected, or treated as a descendant. It may invoke `--fanout` to create a new isolated root, but it may not invoke managed `--worktree` as a child.

```rust
pub struct Entry {
    // existing fields unchanged
    pub parent: Option<String>,
    pub root: Option<String>,
    pub depth: Option<u8>,
    pub fanout_cap: Option<u8>,        // Some(2) only on a depth-0 root
    pub reservation_id: Option<String>,
    pub lease_expires_at: Option<String>,
    pub lifecycle: Option<FanoutLifecycle>,
    pub lifecycle_actor: Option<LifecycleActor>,
    pub lifecycle_reason: Option<String>,
    pub worktree: Option<String>,
    pub repo: Option<RepoIdentity>,
    pub branch: Option<String>,
    pub base_sha: Option<String>,
    pub handback: Option<Handback>,
    pub collected_at: Option<String>,
    pub version: Option<u64>,          // decimal-string JSON; None for legacy Entry
    pub execution: Option<ExecutionIdentity>,
    pub collection: Option<CollectionIntent>,
    pub collection_receipt: Option<CollectionReceipt>,
}
```

Registration refreshes (`register` and the ordinary hook path) must preserve every fan-out field from a prior Entry. Names remain aliases only; ancestry and authorization always store/compare resolved UUIDs.

### Trusted derivation and root initialization

Managed commands require explicit `--from <registered-session-id>`; names may be accepted at the CLI boundary but are immediately resolved to the UUID under the store lock. Do not use the cwd marker as managed authority.

1. **New root (`--fanout`):** require a registered invoking Entry. It may be legacy (`lifecycle=None`) because it sits outside the managed tree. Capture the invoker cwd and target repo identities and require equality. Derive `depth=0`, `root=None` in the reservation, and the fixed cap 2. On attach, set the born Entry atomically to `parent=<invoker UUID>`, `root=<born UUID>`, `depth=0`, `fanout_cap=2`, `lifecycle=Running`. `--fanout` implies `--worktree`; reject `--fanout --read-only` because the root must integrate commits.
2. **Leaf child (`--worktree` without `--fanout`):** require the resolved invoking Entry to be `Running`, unexpired, depth 0, and `root == id`; load cap from that root Entry and derive `root=<root UUID>`, `depth=1`, `fanout_cap=None`. Reject missing/failed/legacy parent, depth 1, mismatched root, or expired lease. Under the reservation lock, compute `active_descendant(root_id)` across both maps as: `(reservation.root == Some(root_id) && reservation.depth == 1 && lifecycle ∈ {Reserved,Running,Stopping}) || (entry.root == Some(root_id) && entry.id != root_id && entry.depth == Some(1) && lifecycle ∈ {Reserved,Running,Stopping})`. The depth-0 root (`id == root`) is excluded. Refuse a third matching record with exit **3** and `fanout cap reached (2 active descendants)`.
3. Reject caller flags/env for `root`, `parent`, `depth`, cap, reservation token, base SHA, branch, worktree path, or repo identity. Remove the proposed `--max-parallel` and `AGENT_RELAY_MAX_DESCENDANTS` surfaces entirely.

Adversarial tests must submit forged ancestry-like flags, stale cwd markers, aliases rebound to another UUID, and an expired/failed parent; all must fail before worktree creation. A concurrent reserve-vs-attach test must prove reservation→Entry rekey is one lock transaction and contributes exactly one active descendant before, during, and after rekey—never zero or two—and two leaves remain admissible while the root is Running.

### Repository/worktree contract

`repo_identity(cwd)` runs `git -C <cwd> rev-parse --path-format=absolute --git-common-dir`, canonicalizes the returned directory, and compares repositories by the canonical directory's `(st_dev, st_ino)`, not strings. Record its path only for diagnostics. Before reservation, capture `base_sha` with `git -C <source> rev-parse --verify HEAD`. Then:

```bash
git -C <source> worktree add -b relay/fanout-<reservation_id> <relay-home>/worktrees/<reservation_id> <base_sha>
```

The worktree root must be a new direct child of the canonical `<relay-home>/worktrees`; reject symlinked roots/components, an existing destination, a pre-existing branch, or a repo identity mismatch after creation. The same token names the reservation, worktree directory, spawn log before birth, and branch because no session UUID exists yet.

If the repo/common-dir or worktree path is missing/moved later, do not guess, scan the filesystem, delete the registry row, or run recursive removal. Return a fail-closed diagnostic naming the stored paths and `git worktree repair <worktree>` as the manual repair route. The sole missing-path recovery exception is a persisted `Collecting` intent whose exact worktree is also absent from `git worktree list --porcelain`; that combination proves an interrupted relay removal and may advance the intent without deleting unknown state. A root/parent cannot be collected while any descendant is `Reserved|Running|Stopping`; it also cannot be removed until every terminal/collecting descendant is `Collected`.

### Attachment, supervisor, and rollback

Pass `AGENT_RELAY_RESERVATION_ID=<token>` only in the launched hook-born child's environment; include `reservation_id` in the JSON config sent to the app-server supervisor. Implement one detached `__fanout-supervisor` path for both tool modes. It owns the reservation and process/app-server handle, persists `ExecutionIdentity`, renews the lease every 10 seconds through the fenced self-transition defined below, and reports `started` to the foreground only after a valid attach and initial-turn start. The foreground never waits for first-turn completion.

**Hook-born sequence and hard gate (Claude and Codex):** the supervisor launches the CLI in its own process group with the reservation token and persists the pgid before releasing its setup barrier. The synchronous SessionStart hook reads the token/session UUID; snapshots then provisionally writes the cwd marker; and performs the registry rekey, which is **the authoritative attach commit point**. It then verifies marker/name/tool publication. The tool cannot begin its first prompt until its SessionStart hook returns, and the managed hook returns 0 only after it observes its own committed `Running` Entry. On any pre-commit error the hook version-writes `attach_error` on the still-Reserved record and blocks instead of returning; on post-commit publication/verification failure it CASes `Running→Stopping` as actor Hook with the error and blocks. The supervisor polls the authoritative record, kills the entire CLI process group on either error, confirms it is gone, and terminalizes to Failed. This managed-only branch intentionally overrides the ordinary hook's catch-error/exit-0 behavior; ordinary hooks remain non-blocking/exit 0. No extra socket/FIFO surface is introduced: the synchronous hook process itself is the barrier, and the versioned registry record is supervisor notification.

Marker and registry are not cross-file atomic. Ordering is marker snapshot/provisional write → registry attach/rekey including name/tool (**commit**) → marker/name/tool verification → hook return (barrier release). If marker write succeeds but registry attach fails, the reservation remains `Reserved`; restore the prior marker only when the current marker still equals the failed born UUID, then keep the hook blocked while the supervisor fences and terminalizes the process. If registry commit succeeds but publication verification fails, never undo/recreate the reservation: keep the hook blocked, conditionally restore only the marker still owned by the failed UUID, persist `post_commit_registration_failed` via `Running→Stopping`, and fence before Failed. Never overwrite a newer marker owner. Tests must force both marker-write-then-attach-fail and post-commit-fail schedules.

**App-server-born sequence:** reserve → worktree → launch detached supervisor → `thread/start` returns the born UUID → persist `appserver_thread_id` → supervisor calls `attach_reservation` with actor `AppServer` (registry commit includes server + `spawned_via=app-server`) → `turn/start` → report `started` only on an acknowledged response → pump until `turn/completed|turn/failed` or timeout. A lost/error `turn/start` response is ambiguous: transition `Running→Stopping`, preserve the worktree, and poll `thread/read`; only confirmed `Idle` may advance to `Failed`. The shipped wrapper has no cancel/interrupt, so `Active`, unreachable, or unknown stays `Stopping` and consumes its cap slot; killing the local pump alone is not a fence and never authorizes cleanup.

| Failure point | Required rollback/terminal result |
|---|---|
| repository/base preflight | No reservation or filesystem mutation; return exit 1. |
| reservation write/cap CAS | No worktree; cap refusal exits 3; any other error exits 1. |
| `git worktree add` | CAS `Reserved→Failed` (`worktree_add_failed`); run `git worktree remove` only if git registered a clean partial tree; delete the new branch only when it still equals `base_sha`; retain the failed record for audit/collect. |
| supervisor launch/config write | CAS `Reserved→Failed` (`supervisor_launch_failed`); apply the same clean/unchanged rollback; retain record. |
| CLI child launch | Supervisor CAS `Reserved→Failed` (`child_launch_failed`); clean/unchanged rollback; retain log and record. |
| app-server `thread/start` | Supervisor CAS `Reserved→Failed` (`thread_start_failed`); clean/unchanged rollback; no session Entry exists. |
| hook/app-server attach before registry commit | Refuse token/UUID/name conflicts; keep hook gate closed or omit app-server turn; conditionally compensate a provisional marker; CAS `Reserved→Stopping`, fence/confirm the launched execution, then `Stopping→Failed` (`attach_failed`). Direct `Reserved→Failed` is allowed only when no execution identity was ever persisted. Exact token+UUID attach replay is idempotent. |
| hook marker publication after registry commit | Gate remains closed; conditionally restore prior marker; supervisor transitions `Running→Stopping`, kills the pgid, confirms `ESRCH`, then `Stopping→Failed` (`post_commit_registration_failed`). No cross-file atomicity claim. |
| app-server `turn/start` acknowledged failure before acceptance | If the protocol proves no turn was accepted, `Running→Stopping`; confirm thread `Idle`, then `Stopping→Failed`. Preserve dirty/advanced work for collection. |
| app-server `turn/start` timeout/lost/error response | Treat as possibly accepted: `Running→Stopping`; preserve worktree and cap slot until `thread/read` confirms `Idle`. Never clean up merely because the local pump exited or the tree looked clean. |
| birth or first-turn timeout/exit without valid handback | CLI: `Reserved|Running→Stopping`, terminate negative pgid, wait until the group is absent, then `Stopping→Failed`. App-server: `Running→Stopping`, retain slot/worktree until thread is confirmed `Idle`, then `Stopping→Failed`. |
| supervisor crash / lease expiry | Reaper claims the record as `Stopping` without freeing capacity. It fences the persisted prelaunch supervisor pid, CLI pgid, or app-server thread outside the lock; only confirmed process absence/thread Idle permits a terminal transition. Unknown/unreachable remains `Stopping` and blocks a third reserve. |

### Lifecycle/lease transition table

Every mutation calls one `transition(expected_state, expected_version, next_state, actor, reservation_id, reason)` while holding `store::with_lock`. The CAS operates on a reservation until attachment and on the rekeyed Entry afterward; each success increments `version`. It validates token, actor, ancestry, execution ownership, and lease before writing. Exact replay of a terminal transition with the same token/receipt is success; a different token, stale version/state, disallowed actor, conflicting born UUID, or superseded supervisor is a no-op error.

Lease renewal is **not** terminal-transition replay. `renew_lease(reservation_id, expected_version, supervisor_pid, new_expiry)` is a dedicated CAS using the `Reserved→Reserved` / `Running→Running` rows below: it requires the same persisted supervisor, an unexpired record, and `new_expiry > lease_expires_at`, then updates expiry and increments version. Renewal and reaping serialize on the same lock/version. If renewal wins, the reaper's stale version fails and it must re-read the live expiry; if reaper first claims `Stopping`, renewal is forbidden and the execution remains charged until fenced.

| Current | Next | Allowed actor | Additional precondition/effect |
|---|---|---|---|
| absent | `Reserved` | `Coordinator` | Trusted derivation + root cap check and reservation insert are one lock transaction. |
| `Reserved` | `Reserved` | `Supervisor` | Fenced renewal CAS: same supervisor + expected version, lease still live, strictly later expiry; increment version. |
| `Reserved` | `Reserved` | `Hook` | Record `attach_error` with expected version while keeping the synchronous hook blocked; does not renew or release capacity. |
| `Reserved` | `Running` | `Hook` or `AppServer` | Lease live; atomically remove reservation and create/update the born Entry. Root reservation rekeys `root` to born UUID. |
| `Reserved` | `Stopping` | `Supervisor` or `Reaper` | Expiry/failure with any launched execution identity; keep slot charged and record fence owner/version. |
| `Reserved` | `Failed` | `Supervisor` or `Reaper` | Allowed only when the versioned record proves no CLI child or app-server turn capable of writing was launched and every local supervisor/pump is confirmed absent; retains the failed reservation for collect. |
| `Running` | `Running` | `Supervisor` | Fenced renewal CAS with the same rules as Reserved renewal. |
| `Running` | `Running` | `Child` | Versioned `relay handback` write; store verified handback but keep execution identity/lease and capacity charged. Exact handback replay is idempotent. |
| `Running` | `Stopping` | `Hook`, `Supervisor`, or `Reaper` | Timeout, ambiguous app-server start, post-commit attach failure, or expired lease; preserve execution identity/worktree and keep slot charged. Hook actor is allowed only for managed post-commit publication failure. |
| `Stopping` | `Stopping` | `Supervisor` or `Reaper` | Fence/poll progress update; versioned ownership handoff is allowed, but capacity remains charged. |
| `Running` | `Completed` or `Failed` | `Supervisor` | Normal first-turn terminal event/pgid absence is confirmed and a verified handback exists; map `completed→Completed`, `failed|conflict→Failed`, then clear lease/execution and release slot. |
| `Stopping` | `Completed` or `Failed` | `Supervisor` or `Reaper` | Prelaunch supervisor pid, CLI pgid (`kill(-pgid,0) → ESRCH`), or app-server thread is confirmed absent/Idle as applicable; honor a verified handback status when present, otherwise Failed, then clear lease/execution and release slot. Unknown/unreachable is not terminal. |
| `Completed` | `Collecting` | `Parent` or `Reaper` | Versioned collection intent persisted only after integration + immediate branch/worktree preflight; no git runs under lock. |
| `Failed` | `Collecting` | `Parent` or `Reaper` | Versioned cleanup intent; explicit `--force` is persisted for parent actor, forbidden to Reaper. |
| `Collecting` | `Completed` or `Failed` | `Parent` or `Reaper` | External preflight failed before removal; revert to the recorded `prior` only when version/intent is unchanged. |
| `Collecting` | `Collecting` | `Parent` or `Reaper` | Advance persisted phase after verified external work; supports recovery when the worktree/branch is already absent as intended. |
| `Collecting` | `Collected` | `Parent` or `Reaper` | Worktree absence reconciled against git registry and requested branch handling reconciled; atomically write final receipt/time. |

Active-cap accounting is exactly the depth-1 predicate above with lifecycle `Reserved|Running|Stopping`; `Completed|Failed|Collecting|Collected` and the depth-0 root do not consume descendant execution capacity. An expired/crashed execution does **not** free a slot when it becomes `Stopping`; only confirmed physical quiescence permits `Stopping→Failed`. The opportunistic expiry reaper runs before reserve/list/collect and **before `store::gc` checks its six-hour stamp**. Legacy `lifecycle=None` entries remain untouched.

### Machine-readable handback and idempotent collect

Add these public CLI contracts and main/usage entries:

```text
relay handback --from <child-id> --status completed|failed|conflict --note <text>
relay collect <child-name-or-id-or-reservation-token> --from <parent-id> [--delete-branch] [--force]
```

`relay handback` authorizes `--from` against the current managed Entry, re-reads repo identity, verifies current branch equals the stored branch, derives `head_sha` via `git rev-parse --verify HEAD`, verifies the stored branch ref still equals it, and verifies `git merge-base --is-ancestor <base_sha> <head_sha>`. It uses a versioned `Running→Running` Child CAS to embed `{base_sha,head_sha,branch,status,note}` without releasing physical capacity. After the store write, it sends a best-effort human bus note to `parent`; mail failure is a warning and does not invalidate the handback. Only the supervisor/reaper may convert the recorded status to `Completed`/`Failed`, after it confirms the CLI pgid is absent or app-server thread is Idle/terminal.

`relay collect` resolves attached workers through the existing id/name indexes and pre-birth failures through the reservation token or unique `requested_name`. It authorizes the resolved `--from` UUID equals the record's `parent`, requires the caller's current repo identity equals the stored identity, and consumes only `Entry.handback` (never inbox text).

**Parent/integration preflight for `Completed`:** before any merge, require the parent worktree is clean (`git status --porcelain=v1` empty), `git rev-parse -q --verify MERGE_HEAD` exits 1, both recorded objects exist, `base_sha` is an ancestor of recorded `head_sha`, **and `base_sha` is an ancestor of current parent `HEAD`**. A rewritten/reset parent that no longer contains the base is a fail-closed exit 5; never merge stale history into it. If `base_sha == head_sha`, integration is an explicit no-op after the parent-base check. Otherwise, if `head_sha` is already an ancestor of parent `HEAD`, integration is already complete; else run the previously affirmed `git merge --no-ff --no-edit <head_sha>`. Treat nonzero as this operation's conflict only when `MERGE_HEAD` now exists: then `git merge --abort`, require the parent is clean/no-merge-in-progress again, leave `Completed`, report, and exit 4. A nonzero without `MERGE_HEAD` is an operational error, not a conflict, and also leaves `Completed`. After merge/no-op, re-check parent clean/no-merge and require recorded `head_sha` is an ancestor of current parent HEAD (the empty range satisfies this because `head_sha==base_sha`); only then may collection intent be created.

**Crash-safe collection protocol (both `Completed` and `Failed`):**

1. Outside the store lock, perform the integration/failed-work checks and resolve the branch to the expected `head_sha` (`base_sha` for an unchanged pre-birth failure). Immediately before intent creation, re-check parent clean/no-merge state, child clean state, repo identity, exact worktree registration, and branch==expected head.
2. Under `with_lock`, CAS `Completed|Failed→Collecting` with expected version and persist `CollectionIntent { prior, requested_by, delete_branch, force_abandon, expected_branch_head, phase=Prepared }`. This is the durable point of no return; no git runs under the lock.
3. Unlock, then immediately re-resolve branch==`expected_branch_head` again before `git worktree remove`. If it advanced after the earlier stale-head check, remove nothing and CAS the unchanged intent back to `prior`. Otherwise remove the exact clean worktree. After removal, CAS `Collecting→Collecting(WorktreeRemoved)`; a test failpoint crashes before this phase write.
4. On retry from `Collecting`, read `git worktree list --porcelain`. If the exact worktree remains registered, repeat the guarded removal. If its path is absent **and** the common-dir registry has no entry for it, treat removal as already completed and advance to `WorktreeRemoved`; path-missing while still registered remains fail-closed/manual repair.
5. Re-resolve the branch immediately before branch reconciliation/final CAS. With `delete_branch=false`, persist `BranchReconciled` while retaining the exact branch. With `delete_branch=true`, require the expected head is an ancestor of parent HEAD, then atomically compare-and-delete only that value with `git update-ref -d refs/heads/<branch> <expected_branch_head>`; treat an already-absent exact branch as successful retry. A moved ref makes compare-delete fail, is preserved, and leaves `Collecting` with a diagnostic. Only after branch handling succeeds CAS `Collecting→Collecting(BranchReconciled)` and then `Collecting→Collected` with receipt/time. Therefore neither a ref race nor a crash can leave `Collected` while requested branch cleanup is pending.
6. Repeated collect of `Collected` with the same reservation token/options returns the stored receipt and exit 0. Different cleanup options after the intent exists are rejected rather than silently changing destructive scope.

For `Failed`, including a failure that never attached to a session UUID, refuse a dirty worktree or a branch advanced beyond `base_sha` unless the user supplied `--force`; persist that force choice in the intent. Without force, `expected_branch_head=base_sha`; with force, snapshot the current branch ref as `expected_branch_head` immediately before intent creation so any later move is still protected by compare-and-delete. `--force` means abandon that work explicitly and never implies branch deletion. `--delete-branch` remains separately required. All paths validate token, exact worktree, repo identity, and non-symlink destination before invoking git. The normal parent-advance merge and conflict-abort-leaves-Completed retry from Draft-3 remain unchanged except for the added parent-base/cleanliness guards.

### GC contract

Keep existing O_NOFOLLOW/dirfd `unlinkat` logic unchanged for relay-owned flat files. **No git command, process signal/wait, app-server query, or worktree preflight may run inside `with_lock` or `with_gc_lock`.** `store::gc(now, self_id)` first calls the fan-out lease reaper/recovery path before reading `AGENT_RELAY_GC_DAYS` or the six-hour `gc-stamp`; therefore a fresh stamp may skip full stale-surface enumeration but can never skip fencing an expired execution or finishing a persisted GC-owned `Collecting` intent. Parent-owned intents remain visible for `relay collect` retry; GC never broadens their options or performs a requested branch deletion.

Fan-out reaping/collection uses this three-phase protocol, while the existing flat-file sweep remains inside its current no-git lock path:

1. **Select/claim under lock:** read records, select leaf-first candidates, record `version`, and CAS an eligible `Completed|Failed` record to `Collecting(Prepared)` with a GC intent. For lease expiry, CAS `Reserved|Running→Stopping` and persist fence ownership/identity. Release the lock. Selection never invokes git/process/app-server work.
2. **External work unlocked:** for each unchanged snapshot, perform process-group fencing or app-server `thread/read`, and run repo/branch/worktree preflight/removal. A `Completed` orphan is eligible only when its `head_sha` is already an ancestor of its stored parent's current HEAD, parent base/clean/no-merge checks pass, its branch equals recorded head, and its worktree is clean. A `Failed` orphan is eligible only when clean and branch equals `base_sha`; GC never uses `--force` and never deletes a branch. GC resumes only intents whose `requested_by == "gc"`; those intents always have `delete_branch=false` and use the same git-registry absence proof as CLI collect.
3. **Finalize under lock:** re-read reservation id + `version` + full intent/execution identity. If unchanged, advance `Stopping→Completed|Failed`, `Collecting→Collecting(WorktreeRemoved|BranchReconciled)`, or `Collecting→Collected` with receipt. If changed, discard the external result and preserve current state. If external preflight failed before removal, CAS unchanged `Collecting` back to its recorded prior terminal state; after removal, never roll back—leave/recover the intent.

A parent/root with any non-`Collected` descendant is preserved. Missing/moved repo, missing parent, dirty tree, unmerged head, changed branch, identity mismatch, symlink, active/unreachable execution, or git error preserves Entry + worktree and emits a diagnostic. Registry/name removal remains last. A lock-duration adversarial test injects a five-second fake git removal and proves a concurrent `relay send` completes in under one second, demonstrating the git leg is outside the global store lock.

## Steps

| # | Task | Files | Depends | Status | Done condition / failure trigger |
|---|---|---|---|---|---|
| 1 | Add versioned typed fan-out schema (`Stopping`/`Collecting`, execution identity, collection intent), backward-compatible registry parsing, visible reservation/list lookup, trusted ancestry helpers, renewal/transition CAS, and pre-stamp reaper entry point. | `rust/src/fanout.rs` (new), `rust/src/lib.rs:1-10`, `rust/src/store.rs:449-575,1028-1268`, `rust/src/cli.rs:1-132` | — | planned | Named tests prove old Entry→`None`, typed round-trip, immutable cap, fenced renewal ordering, full transition table, physical-stop-before-terminal, collecting recovery, and lookup of a pre-birth failure. If registration drops a fan-out field or a renewal bypasses version/supervisor fencing, STOP before Step 2. |
| 2 | Implement repo identity, base capture, reservation-under-lock, worktree creation/rollback, root initialization, the explicit depth-1 active predicate, and `--fanout`/`--worktree` parsing. | `rust/src/fanout.rs`, `rust/src/spawn.rs:45,544-793`, `rust/src/cli.rs:30-86` | 1 | planned | Race tests admit exactly two descendants, exclude the Running root, and keep count exactly one across reservation→Entry rekey; same-repo aliases pass; cross-repo/forged/depth-2/pre-existing-branch/symlink cases fail before unsafe mutation. Any path-string comparison or root-inclusive count is a STOP defect. |
| 3 | Route both birth modes through detached supervision; persist pgid/thread identity; add the managed hook gate, registry-first marker compensation, renewal, physical fencing, and ambiguous app-server quarantine. | `rust/src/spawn.rs:285-495,662-793`, `rust/src/appserver.rs:50-76,119-136,573-617`, `rust/src/hook.rs:109-117,195-224`, `rust/src/store.rs:1208-1268`, `rust/src/main.rs:1-59` | 1,2 | planned | Hook-born and app-server-born paths reach the same Running shape; neither prompt/turn starts before registry attach; supervisor crash/timeout retains a cap slot until pgid absent/thread Idle; lost turn response preserves tree in Stopping. If error context or pump exit is treated as a barrier/fence, STOP. |
| 4 | Implement atomic handback without early capacity release, guarded merge/no-op behavior, persisted Collecting intent, recoverable worktree/branch cleanup, parent authorization, `--delete-branch`, and explicit `--force`. | `rust/src/fanout.rs`, `rust/src/cli.rs:1-86`, `rust/src/main.rs:1-59` | 1-3 | planned | Tests cover store-before-mail, rewritten-parent/empty-range refusal, clean/no-merge preflight, stale head at both boundaries, normal merge, conflict abort, crash after removal, pending branch cleanup, already-ancestor retry, failed dirty refusal, force abandon, and branch retention/deletion. Any collect dependency on bus text or final receipt before branch reconciliation is a STOP defect. |
| 5 | Extend GC leaf-first through the three-phase fan-out cleanup/fence API without changing flat-file safety behavior or holding the store lock across external work. | `rust/src/fanout.rs`, `rust/src/store.rs:628-1206` | 1-4 | planned | Tests preserve active/Stopping, dirty, unmerged, moved, missing-parent, identity-mismatch, and parent-with-descendant cases; recover Collecting before stamp check; concurrent send stays under one second during five-second fake git. Any git/process/app-server call under `with_lock`/`with_gc_lock`, recursive unlink, or stamp-before-reaper path is a STOP defect. |
| 6 | Add depth-aware founding prompts: root gets decompose→spawn two leaves→wait for records→collect/integrate→report; leaf gets handback→report and no spawn instruction. Preserve ordinary prompt bytes. | `rust/src/spawn.rs:252-283`, `rust/src/fanout.rs` | 1-4 | planned | Snapshot/unit tests show ordinary prompt byte identity, cap/depth text, absolute relay handback command, explicit `--from`, and no fan-out instruction for depth-1 leaves. |
| 7 | Add deterministic end-to-end smoke and extend selftest/CLI coverage for both birth paths, adversarial races/crashes, physical cap, collect recovery, and unlocked GC. | `test/fanout-smoke.mjs` (new), `test/selftest.mjs`, existing `test/fake-app-server.mjs` (consume, do not modify unless protocol fixture needs a minimal extension) | 1-6 | planned | Acceptance A1-A17 pass in an isolated temp store/repo; the smoke's `finally` proves no registered worktree remains and prints the exact PASS line. |
| 8 | Document the shipped interface and run the full plugin gates; do not rebuild binaries or version/release. | `plugins/session-relay/AGENTS.md`, `skills/productivity/session-relay/SKILL.md`, `rust/src/main.rs:1-59` | 1-7 | planned | Docs state fixed physical cap/depth, explicit identity, hook gate, Stopping/Collecting recovery, handback/collect, cleanup flags, and three-phase GC; A18-A21 exit 0. If docs imply opaque mail is collectible, expired-live work frees a slot, or cap override exists, STOP. |

## Acceptance criteria

Run from repository root with `PATH="$HOME/.cargo/bin:$PATH"`. Each row is independently executable; an exit code other than the stated value fails the plan.

| ID | Criterion | Command | Expected output/result |
|---|---|---|---|
| A0 | Base is not stale before implementation. | `git diff --stat c3d0564e3a7901934c31275829c4153d4ae2b87e..HEAD -- plugins/session-relay/rust/src plugins/session-relay/test plugins/session-relay/AGENTS.md plugins/session-relay/skills/productivity/session-relay/SKILL.md` | Before source edits: empty stdout, exit 0. Any non-plan drift requires reconciliation before editing. |
| A1 | Entry/reservation compatibility and typed depth. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout_schema_ -- --nocapture` | Exit 0; all `fanout_schema_*` tests print `ok`; legacy Entry assertions show every new field `None`. |
| A2 | Trusted derivation, immutable cap, atomic race, depth. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout_reservation_ -- --nocapture` | Exit 0; forged inputs are rejected; exactly two depth-1 active descendants are admitted; root excluded; rekey count stable; third exits 3; depth-1 spawn rejected. |
| A3 | Versioned lifecycle, renewal, physical fencing, collect intent. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout_lifecycle_ -- --nocapture` | Exit 0; all table edges/actors pass; stale versions fail unchanged; renewal extends expiry; Stopping retains capacity until quiescence; Collecting phases/replays recover. |
| A4 | Both birth paths, hard hook gate, detached supervisor. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout_birth_ -- --nocapture` | Exit 0; hook/app-server attach token→UUID; no prompt/turn precedes registry commit; marker compensation is conditional; ambiguous app-server start stays Stopping; foreground remains nonblocking. |
| A5 | Worktree identity, rollback, and cleanup safety. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout_worktree_ -- --nocapture` | Exit 0; aliases pass; cross-repo/symlink/moved/dirty/unmerged/pre-existing branch fail closed; missing path recovers only from matching Collecting+git-registry absence. |
| A6 | Handback and crash-idempotent collect. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout_handback_ -- --nocapture` | Exit 0; handback does not free live capacity; parent-base/clean checks pass; empty range no-op; stale-head checks fail safely; merge/conflict semantics preserved; removal/branch crashes recover. |
| A7 | Fan-out prompt opt-in. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout_prompt_ -- --nocapture` | Exit 0; ordinary prompt fixture is byte-identical; root and leaf fixtures contain only their depth-appropriate commands/rules. |
| A8 | Supervisor crash cannot create a third physical writer. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout::tests::fanout_adversarial_supervisor_crash_live_child_blocks_third -- --exact --nocapture` | Exit 0; record is Stopping, child pgid remains live, and third reserve exits 3 until fence confirms pgid absent. |
| A9 | Root excluded and rekey count stable. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout::tests::fanout_adversarial_root_excluded_rekey_count_stable -- --exact --nocapture` | Exit 0; Running root + two leaves succeeds; count is 2 before/after concurrent reservation→Entry rekey; third exits 3. |
| A10 | Renewal and reaper serialize. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout::tests::fanout_adversarial_renewal_vs_reaper_ordering -- --exact --nocapture` | Exit 0; renewal-first invalidates stale reap; reap-first enters Stopping and rejects renewal; no direct live Running→Failed. |
| A11 | Empty child after rewritten parent fails closed. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout::tests::fanout_adversarial_empty_range_rewritten_parent_refused -- --exact --nocapture` | Exit 0; `base==head` performs no merge, parent-base check fails, lifecycle remains Completed, parent HEAD unchanged. |
| A12 | Crash after worktree removal is recoverable. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout::tests::fanout_adversarial_collect_recovers_after_remove_and_branch_pending -- --exact --nocapture` | Exit 0; retry proves git-registry absence, resumes Collecting, reconciles requested branch deletion, writes one receipt, and repeat exits 0. |
| A13 | Branch advance after initial stale-head check is fenced. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout::tests::fanout_adversarial_branch_advance_before_remove_refused -- --exact --nocapture` | Exit 0; failpoint advances ref between checks; no worktree/branch removal; unchanged intent reverts to prior terminal state. |
| A14 | Marker write/attach failure never releases first prompt. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout::tests::fanout_adversarial_marker_then_attach_fail_gate_closed -- --exact --nocapture` | Exit 0 for Claude and Codex fixtures; prompt sentinel absent, gate remains closed until pgid death, registry is authority, newer marker survives compensation. |
| A15 | Lost app-server turn/start response preserves live work. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout::tests::fanout_adversarial_lost_turn_start_response_quarantined -- --exact --nocapture` | Exit 0; Active/unknown thread remains Stopping, worktree untouched, third reserve exits 3; only later Idle permits terminal transition. |
| A16 | GC never holds store lock across git. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout::tests::fanout_adversarial_gc_git_outside_store_lock -- --exact --nocapture` | Exit 0; injected git sleeps 5s while concurrent enqueue/send completes <1s; reaper/Collecting recovery runs despite a fresh six-hour stamp. |
| A17 | Reproducible sandbox smoke across hook/app-server births. | `cargo build --manifest-path plugins/session-relay/rust/Cargo.toml && RELAY_BIN="$PWD/plugins/session-relay/rust/target/debug/relay" node plugins/session-relay/test/fanout-smoke.mjs` | Exit 0 and final line exactly `PASS: relay fanout smoke — hook-born + app-server-born, cap=2, worktrees=0`; script asserts only root repo remains and no active/Stopping/Collecting record is stranded. |
| A18 | Existing plugin selftest remains green. | `node plugins/session-relay/test/selftest.mjs` | Exit 0 and final line matches `PASS: session-relay self-test — <N> checks`; `<N>` is re-derived by the script and is greater than the pre-plan count. |
| A19 | Complete Rust suite. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml` | Exit 0; summary contains `test result: ok`; zero failed tests. |
| A20 | Plugin gate. | `node scripts/ci.mjs --plugin session-relay` | Exit 0 with no `FAIL`; fmt, clippy `-D warnings`, manifest/checksum, skill, launcher, and selftest gates pass. A documented local host-digest warning is allowed. |
| A21 | Source-only diff. | `git diff --exit-code c3d0564e3a7901934c31275829c4153d4ae2b87e..HEAD -- plugins/session-relay/bin` | Empty stdout and exit 0. |

## Out of scope / do-NOT-touch

- `plugins/session-relay/bin/**`, manifests, marketplace versions, checksums, tags, and releases: implementation is source-only; artifacts and a post-implementation version bump follow the repository's user-gated release flow.
- Codex/Claude product internals and in-session subagents: fan-out coordinates full relay sessions only; do not add an auto-decomposition model or scheduler verb.
- `appserver.rs` wire semantics outside birth observation: reuse shipped `thread/start`, `turn/start`, and pump behavior; do not redesign live-view/watch/channel delivery.
- Existing flat-file store GC safety: add a fan-out worktree branch alongside it; do not weaken `O_NOFOLLOW`, snapshot checks, held-lock checks, or registry-last deletion to accommodate directories.
- Cross-repository write fan-out, depth >1, configurable cap, automatic conflict resolution, branch auto-deletion, and GC force-abandon: each materially expands trust or deletion scope and remains excluded from v1.
- Unrelated skill/agent/docs cleanup: edit only the affected interface documentation needed to make the new commands executable cold.

## Known gotchas

- A reservation token is UUID-shaped but is **not** the later agent UUID. Never pass it to `--session-id`, index `agents` by it, or derive a branch from the born UUID.
- Claude CLI can premint, Codex CLI cannot, and app-server UUID exists only after `thread/start`; tests must cover all attachment orderings rather than generalize from Claude.
- `last_seen` is freshness; versioned lifecycle, lease, and execution identity are cap/liveness state. Do not count or reap from `last_seen`, and do not treat lease expiry as physical termination.
- `reply_to` is mutable routing; `parent` is immutable ownership. Never derive authorization from reply routing or a cwd marker. A pre-birth failure has no session UUID, so list/collect must retain its reservation-token address.
- `register_with_origin` currently preserves only existing fields it knows. Every registration path must preserve new fan-out metadata after attachment.
- A canonical path is not repository identity. Compare the canonical common-dir directory's device/inode and re-check it immediately before git mutations.
- `git worktree remove` does not delete branches. `--force` does not imply `--delete-branch`, GC never supplies either destructive override, and requested deletion uses expected-old `git update-ref -d` so a moved ref cannot be deleted by race.
- Merge conflict is not child lifecycle `Failed`: a child-declared `status=conflict` maps to Failed, while a parent-side merge conflict leaves the child's Completed record intact for retry after `git merge --abort`.
- `relay handback` is not proof that its process stopped. It records intent while Running; the supervisor/reaper releases capacity only after pgid absence or app-server Idle.
- A clean worktree is not safe to remove while an app-server turn may be live: a lost `turn/start` response is `Stopping`, not Failed, and killing the local pump is not cancellation.
- Marker publication is secondary to the registry and not atomic with it. The managed hook gate must stay closed across every attach/marker failure; error context alone is not a barrier.
- Store lock duration is capped at three seconds. Do not run git, signal/wait processes, or query app-server while holding it; select/version under lock, act outside, then CAS the unchanged snapshot.
- Worktree absence is normally fail-closed. Only a persisted Collecting intent plus absence from `git worktree list --porcelain` proves a relay removal completed before a crash.

## Global constraints

- **Whole-tree physically active depth-1 descendant cap: 2; the depth-0 root is excluded, and Stopping executions still count.**
- **Recursion depth: 1; depth-1 children are leaves.**
- **Worktree per root and child; `--fanout` implies root worktree isolation.**
- **Same-repository write fan-out only; compare git common-dir identity, not path strings.**
- **No secrets in committed config. Treat plugin marketplaces, installers, and downloaded artifacts as untrusted until verified.**
- **Committed binaries in `bin/` come ONLY from `.github/workflows/build-binaries.yml` artifacts — never from a local `cargo build`.**
- **Run `node scripts/ci.mjs` before any commit; do not loosen validator floors to pass.**
- **Fail closed: no automatic dirty/unmerged worktree deletion, branch deletion, force abandon, or conflict resolution.**
- **Never free capacity or remove a worktree until the persisted CLI process group is absent or the app-server thread is confirmed Idle/terminal.**
- **Never invoke git, process fencing/wait, or app-server RPC while `with_lock`/`with_gc_lock` is held.**

## STOP conditions

- Drift command A0 names a source/doc/test path changed after `c3d0564`: reconcile anchors/contracts before implementation.
- Current git or tool behavior cannot provide a stable common-dir device/inode, pre-birth token propagation, or supervisor-owned child handle for either tool: report the evidence; do not fall back to path equality, marker identity, or blocking parent `--watch`.
- Any rollback would require deleting a dirty/unmerged tree, a branch whose ref changed, or a path whose repo/symlink identity cannot be revalidated: retain it and report the exact manual recovery command.
- A CLI pgid cannot be confirmed absent, or an app-server thread is Active/unreachable/unknown after timeout/lost response: leave `Stopping`, preserve its cap slot and worktree, and report; do not force terminal state.
- Parent `base_sha` is no longer an ancestor of parent HEAD, parent is dirty/has `MERGE_HEAD`, or the branch moves at either collection boundary: leave/revert to the prior terminal state; do not merge/remove.
- A Collecting retry finds the path missing but still present in git's worktree registry, or requested branch cleanup finds a moved ref: keep the intent and report repair; do not finalize Collected.
- The implementation needs a cap/depth/config override, cross-repo write, recursion, or automatic conflict handling: stop as a scope change.
- A test requires the real user relay store, live production system, or committed locally-built binary: replace it with the sandbox/stub path before proceeding.

## Cold-handoff checklist

- **File manifest:** present in frontmatter and every Steps row, including new `fanout.rs` and `fanout-smoke.mjs`.
- **Environment & commands:** exact base, toolchain inputs, build/test/CI/smoke commands and expected outputs are present.
- **Interface/data contracts:** reservation token, typed version/ExecutionIdentity/CollectionIntent, Entry/Reservation/Handback/RepoIdentity, hook gate, CAS/renewal/fence table, collect recovery, and three-phase GC are specified.
- **Executable acceptance:** A0-A21 each provide one command and an exit/output assertion; the nine new adversarial schedules have dedicated filters; Cargo always uses `--manifest-path`.
- **Out of scope:** per-surface exclusions cover binaries/releases, product internals, live-view protocol, flat-file GC, cross-repo/deeper/configurable behavior, and unrelated cleanup.
- **Decision rationale:** every settled non-obvious choice is paired with its safety/idempotency reason.
- **Known gotchas:** identity asymmetry, logical-vs-physical liveness, owner/router, hook barrier/registry authority, app-server ambiguity, collect crash recovery, common-dir identity, conflict mapping, and lock duration are explicit.
- **Global constraints verbatim:** cap 2, depth 1, isolation, same-repo, secret/artifact/CI/fail-closed rules are copied into `## Global constraints`.
- **No undefined terms / forward references:** all types, actors, states, versions, fence identities, collection phases, commands, flags, exit codes, test filters, paths, and failure outcomes are defined here; no TBD/TODO remains.

## Open questions

*(none — Draft-4 closes correctness defects without introducing a new user-visible fork; safe indefinite `Stopping` quarantine is the specified fallback when app-server cancellation is unavailable.)*

## Self-review

**Status: dispatch-ready Draft-4.** Score: **97/100** · trajectory **59→82→91→95→97→97→97→97** · stopped: **plateau (K=3)**.

Weighted score: standalone executability **21/22**; actionability **16/16**; dependency order **12/12**; evidence re-verify **10/10**; goal coverage **12/12**; executable acceptance **12/12**; failure mode **8/10** (app-server has no shipped interrupt, so ambiguous/unreachable turns safely quarantine a slot and may require later operator recovery rather than guaranteeing progress); assumption→question **6/6**.

Draft-4 closure of the fresh independent red-team findings:

| Finding | Draft-4 closure |
|---|---|
| 1. Lease-renew CAS | Added versioned, supervisor-fenced `Reserved→Reserved` and `Running→Running` renewals with strict expiry extension and deterministic renewal-vs-reaper ordering. |
| 2. Collect crash holes | Added persisted `Collecting` intent/phases before removal, git-registry absence recovery, branch cleanup before final receipt, and idempotent same-options replay. |
| 3. Root counted in cap | Defined the predicate as depth 1 + `id != root` across reservations/Entries and required a rekey-boundary count test. |
| 4. Expiry exceeds physical cap | Added persisted pgid/thread identity and `Stopping`; it counts until CLI group absence/app-server Idle is confirmed. Handback alone also no longer releases capacity. |
| 5. Merge/collect edge cases | Added parent-base ancestry, empty-range no-op, clean/no-MERGE_HEAD preflight, conflict classification, and immediate branch checks at intent/removal/finalization boundaries. |
| 6. Hook attach not a barrier | Added a managed synchronous gate for both tools, registry-first authority, marker ordering/conditional compensation, and fenced Running failure after post-commit publication errors. |
| 7. Ambiguous app-server start | Lost/error response enters Stopping; local pump exit is not cancellation; worktree/slot persist until thread/read confirms Idle. |
| 8. GC lock across git | Added pre-stamp reaper/recovery and select-under-lock → git/process-unlocked → unchanged-version finalize-under-lock protocol. |
| 9. Adversarial tests | A8-A16 are dedicated command/output rows for every requested race, crash, rewrite, ambiguity, and lock-duration schedule. |

The hill-climb's first pass caught two implications beyond the literal list and retained them: a child handback cannot release the physical slot until its execution is terminal, and GC/CLI collect must share the same Collecting recovery semantics or one path could recreate the crash hole. The next passes tightened marker compensation, branch-boundary checks, and app-server quarantine; three final passes produced no ≥2-point improvement.

Prior review record: Draft-3's local 99/100 self-score was invalidated by the fresh independent red-team, which scored **59/100 NOT SAFE TO DISPATCH** and identified the findings above; all were accepted. The nine earlier Draft-2 confirm-pass closures were explicitly out of scope for this re-audit and remain preserved in the plan body. Earlier history: Draft-1 62/100; Draft-2 70/100 NOT-READY; user-settled cap=2/depth=1 unchanged.

## Sources

- `plugins/session-relay/rust/src/spawn.rs:1-13` — Claude premints a UUID; Codex has no preset-id and is born through a new marker; ordinary spawn detaches and returns at birth.
- `plugins/session-relay/rust/src/spawn.rs:252-283` — current founding prompt builder is at line 258 and carries the absolute relay reply path/guardrails.
- `plugins/session-relay/rust/src/spawn.rs:337-403` — app-server pump performs start-thread → register → initial turn → bounded event pump.
- `plugins/session-relay/rust/src/spawn.rs:418-495` — foreground app-server spawn launches a detached pump and only waits for completion under `--watch`.
- `plugins/session-relay/rust/src/spawn.rs:662-793` — ordinary CLI birth uses Claude premint vs Codex marker discovery, registers after birth, and otherwise drops the child handle unless `--watch`.
- `plugins/session-relay/rust/src/spawn.rs:424-431,713-724` — both pump and CLI child launch in independent process groups, so killing/losing the supervisor is not itself proof the execution stopped.
- `plugins/session-relay/rust/src/appserver.rs:50-76` — `SpawnedThread` exposes id, start, and pump but no interrupt/cancel operation; ambiguous start must quarantine until status is Idle.
- `plugins/session-relay/rust/src/appserver.rs:119-136` — `thread/start` response is where the app-server-born UUID becomes available.
- `plugins/session-relay/rust/src/appserver.rs:573-617` — pump observes `turn/completed|turn/failed` and times out without inventing a terminal event.
- `plugins/session-relay/rust/src/hook.rs:109-117` — the shipped hook catches `inner` errors and always exits 0, proving error context alone cannot gate a managed first prompt.
- `plugins/session-relay/rust/src/hook.rs:195-224` — SessionStart reads `session_id`/cwd, sets marker, and registers the hook-born session.
- `plugins/session-relay/rust/src/store.rs:449-482` — `with_lock` is the three-second kernel-flock registry critical section.
- `plugins/session-relay/rust/src/store.rs:485-545` — current Entry fields and old-shape defaulting; `server` and `spawned_via` are already shipped.
- `plugins/session-relay/rust/src/store.rs:693-761` — GC pins only named surface directories and opens regular entries with `O_NOFOLLOW`.
- `plugins/session-relay/rust/src/store.rs:994-1021` — current deletion primitive is dirfd-relative `unlinkat` for a validated flat surface.
- `plugins/session-relay/rust/src/store.rs:1028-1206` — current GC holds `.lock` across its sweep, checks the six-hour stamp at 1077-1085, and removes registry/name records last; fan-out external work must be split around that lock.
- `plugins/session-relay/rust/src/store.rs:1208-1268` — registration upsert preserves known prior fields, establishing where new fan-out fields must also survive refresh.
- `plugins/session-relay/rust/src/main.rs:1-59` — current multi-call verb dispatch/usage has spawn and hidden pumps but no handback/collect/supervisor.
- `plugins/session-relay/.claude-plugin/plugin.json:1-5` and `.codex-plugin/plugin.json:1-4` — both shipped manifests are version `0.10.0` on this base.
- `git show -s e51ed8f` / `git show -s 838fb40` / `git show -s c3d0564` — live-view merge, 0.10.0 release commit, and implementation base are present in this checkout.

## Review

*(pending completion review)*
