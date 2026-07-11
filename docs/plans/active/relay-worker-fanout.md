---
title: Relay worker self-orchestration (fan-out sub-workers)
goal: Safely let an isolated relay worker fan out two depth-1 worktree children, receive atomic handbacks, integrate them idempotently, and collect their lifecycle records.
status: planned
created: "2026-07-10T22:57:23-03:00"
updated: "2026-07-11T01:49:41-03:00"
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

- The user chose the settled v1 design: **worktree per worker**, extend `relay spawn`, whole-tree active-descendant cap **2**, recursion depth **1**, same-repository write fan-out, cross-tool children, incremental integration, and fail-closed cleanup. Draft-3 must harden those choices, not reopen them.
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
| Cap | Fixed at **2 active descendants** (`reserved` or `running`) for the entire root; stored once as `fanout_cap = 2` on the root Entry. Remove draft-2's `--max-parallel` and `AGENT_RELAY_MAX_DESCENDANTS` override. | A root-owned immutable cap cannot be raised by a descendant or per-invocation flag. |
| Depth | Root is typed `depth: 0u8`; its children are `depth: 1u8`; a depth-1 Entry cannot spawn a managed child. | This is the user-selected recursion bound and prevents geometric growth. |
| Reservation identity | Generate a UUIDv4 **reservation token** before worktree creation. It is not a session UUID and names the branch/worktree and a separate reservation record until birth attaches it to the born UUID. | Neither Codex CLI nor app-server has the final UUID at reservation time. |
| Supervision | Fan-out mode always launches a detached `__fanout-supervisor`; the foreground parent returns after valid birth/first-turn start, while the supervisor owns the reservation, child/pump handle, lease renewal, and first-turn result. | Ordinary `spawn` otherwise drops the child handle after birth; `--watch` would block the parent and defeat fan-out. |
| Handback/integration | `relay handback` atomically records source commits; `relay collect` verifies and merges `base_sha..head_sha` with `git merge --no-ff --no-edit <head_sha>`. | A merge makes `head_sha` an ancestor of the parent, giving a crash-safe idempotency check that repeated cherry-picks cannot provide. |
| Cleanup | `relay collect` is clean/merged by default; `--delete-branch` is the only branch-deletion flag; `--force` is an explicit abandon path. GC invokes the same worktree preflight and git command, leaf-first. | Worktree removal and branch deletion are distinct destructive operations; stale ancestry alone is never authority to destroy work. |
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
pub enum FanoutLifecycle { Reserved, Running, Completed, Failed, Collected }

pub enum LifecycleActor { Coordinator, Hook, AppServer, Supervisor, Child, Parent, Reaper }

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
    pub lifecycle: FanoutLifecycle,   // Reserved until attachment
    pub lifecycle_actor: LifecycleActor,
    pub lifecycle_reason: Option<String>,
    pub lease_expires_at: String,     // RFC3339 UTC; supervisor-renewed
    pub base_sha: String,
    pub repo: RepoIdentity,
    pub worktree: String,
    pub branch: String,               // relay/fanout-<reservation_id>
    pub requested_name: Option<String>,
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
}
```

Registration refreshes (`register` and the ordinary hook path) must preserve every fan-out field from a prior Entry. Names remain aliases only; ancestry and authorization always store/compare resolved UUIDs.

### Trusted derivation and root initialization

Managed commands require explicit `--from <registered-session-id>`; names may be accepted at the CLI boundary but are immediately resolved to the UUID under the store lock. Do not use the cwd marker as managed authority.

1. **New root (`--fanout`):** require a registered invoking Entry. It may be legacy (`lifecycle=None`) because it sits outside the managed tree. Capture the invoker cwd and target repo identities and require equality. Derive `depth=0`, `root=None` in the reservation, and the fixed cap 2. On attach, set the born Entry atomically to `parent=<invoker UUID>`, `root=<born UUID>`, `depth=0`, `fanout_cap=2`, `lifecycle=Running`. `--fanout` implies `--worktree`; reject `--fanout --read-only` because the root must integrate commits.
2. **Leaf child (`--worktree` without `--fanout`):** require the resolved invoking Entry to be `Running`, unexpired, depth 0, and `root == id`; load cap from that root Entry and derive `root=<root UUID>`, `depth=1`, `fanout_cap=None`. Reject missing/failed/legacy parent, depth 1, mismatched root, or expired lease. Count all reservations/Entries for that root whose lifecycle is `Reserved|Running` in the same lock hold that inserts the reservation; refuse the third with exit **3** and `fanout cap reached (2 active descendants)`.
3. Reject caller flags/env for `root`, `parent`, `depth`, cap, reservation token, base SHA, branch, worktree path, or repo identity. Remove the proposed `--max-parallel` and `AGENT_RELAY_MAX_DESCENDANTS` surfaces entirely.

Adversarial tests must submit forged ancestry-like flags, stale cwd markers, aliases rebound to another UUID, and an expired/failed parent; all must fail before worktree creation.

### Repository/worktree contract

`repo_identity(cwd)` runs `git -C <cwd> rev-parse --path-format=absolute --git-common-dir`, canonicalizes the returned directory, and compares repositories by the canonical directory's `(st_dev, st_ino)`, not strings. Record its path only for diagnostics. Before reservation, capture `base_sha` with `git -C <source> rev-parse --verify HEAD`. Then:

```bash
git -C <source> worktree add -b relay/fanout-<reservation_id> <relay-home>/worktrees/<reservation_id> <base_sha>
```

The worktree root must be a new direct child of the canonical `<relay-home>/worktrees`; reject symlinked roots/components, an existing destination, a pre-existing branch, or a repo identity mismatch after creation. The same token names the reservation, worktree directory, spawn log before birth, and branch because no session UUID exists yet.

If the repo/common-dir or worktree path is missing/moved later, do not guess, scan the filesystem, delete the registry row, or run recursive removal. Return a fail-closed diagnostic naming the stored paths and `git worktree repair <worktree>` as the manual repair route. A root/parent cannot be collected while any descendant is `Reserved|Running`; it also cannot be removed until every terminal descendant is `Collected`.

### Attachment, supervisor, and rollback

Pass `AGENT_RELAY_RESERVATION_ID=<token>` only in the launched hook-born child's environment; include `reservation_id` in the JSON config sent to the app-server supervisor. Implement one detached `__fanout-supervisor` path for both tool modes. It owns the reservation and process/app-server handle, renews the lease every 10 seconds to `now + max(timeout_secs, 30) + 30 seconds`, and reports `started` to the foreground only after a valid attach and initial-turn start. The foreground never waits for first-turn completion.

**Hook-born sequence:** reserve → worktree → launch detached supervisor → supervisor launches Claude/Codex CLI → SessionStart hook reads the token and born `session_id` → `attach_reservation` atomically rekeys reservation metadata into the born Entry and registers marker/name/tool → supervisor observes `Running` → first turn proceeds. The hook must emit a fail-closed context/error on token mismatch; the supervisor terminates the child process group and records `Failed` if attachment never becomes valid.

**App-server-born sequence:** reserve → worktree → launch detached supervisor → `thread/start` returns the born UUID → supervisor calls `attach_reservation` with actor `AppServer` (registering server + `spawned_via=app-server`) → `turn/start` → report `started` → pump until `turn/completed|turn/failed` or timeout.

| Failure point | Required rollback/terminal result |
|---|---|
| repository/base preflight | No reservation or filesystem mutation; return exit 1. |
| reservation write/cap CAS | No worktree; cap refusal exits 3; any other error exits 1. |
| `git worktree add` | CAS `Reserved→Failed` (`worktree_add_failed`); run `git worktree remove` only if git registered a clean partial tree; delete the new branch only when it still equals `base_sha`; retain the failed record for audit/collect. |
| supervisor launch/config write | CAS `Reserved→Failed` (`supervisor_launch_failed`); apply the same clean/unchanged rollback; retain record. |
| CLI child launch | Supervisor CAS `Reserved→Failed` (`child_launch_failed`); clean/unchanged rollback; retain log and record. |
| app-server `thread/start` | Supervisor CAS `Reserved→Failed` (`thread_start_failed`); clean/unchanged rollback; no session Entry exists. |
| hook/app-server attach or registration | Refuse token/UUID/name conflicts; terminate child/close thread before a turn; CAS `Reserved→Failed` (`attach_failed`); clean/unchanged rollback. An exact same token+UUID replay is idempotent. |
| app-server `turn/start` | CAS `Running→Failed` (`turn_start_failed`); close pump; remove only a clean/unchanged worktree. |
| birth or first-turn timeout/exit without valid handback | Supervisor CAS `Reserved|Running→Failed` (`birth_timeout`, `first_turn_timeout`, or `no_handback`); terminate process group/close pump; preserve dirty or committed work for explicit collection. |
| supervisor crash | No unsafe cleanup. Lease expiry reaper later CASes `Reserved|Running→Failed` (`lease_expired`) and preserves artifacts. |

### Lifecycle/lease transition table

Every mutation calls one `transition(expected_state, next_state, actor, reservation_id, reason)` while holding `store::with_lock`. The CAS operates on a reservation until attachment and on the rekeyed Entry afterward; it validates token, actor, ancestry, and lease before writing. Exact replay of an already-applied token/state/actor is success; a different token, stale expected state, disallowed actor, or conflicting born UUID is a no-op error.

| Current | Next | Allowed actor | Additional precondition/effect |
|---|---|---|---|
| absent | `Reserved` | `Coordinator` | Trusted derivation + root cap check and reservation insert are one lock transaction. |
| `Reserved` | `Running` | `Hook` or `AppServer` | Lease live; atomically remove reservation and create/update the born Entry. Root reservation rekeys `root` to born UUID. |
| `Reserved` | `Failed` | `Supervisor` or `Reaper` | Launch/birth failure or expired lease; immediately frees a cap slot but retains the reservation record/artifacts addressable by token or requested name. |
| `Running` | `Completed` | `Child` | `relay handback --status completed`; atomically writes a verified Handback and clears lease. |
| `Running` | `Failed` | `Child`, `Supervisor`, or `Reaper` | Child status `failed|conflict`, no valid handback on exit/timeout, or expired lease; clears lease. Handback status `conflict` maps to lifecycle `Failed` with reason `child_conflict`. |
| `Completed` | `Collected` | `Parent` | Recorded head integrated/ancestor, cleanup preflight passed, worktree removed; store collection receipt/time. |
| `Failed` | `Collected` | `Parent` | No integration; clean/unchanged worktree, or explicit `--force`; store collection receipt/time. |

Active-cap accounting is exactly `Reserved|Running`. A failed/crashed child is not deleted or returned to `Reserved`; it frees the slot by the terminal `Failed` transition and is later collected. The opportunistic expiry reaper runs before reserve/list/collect and from existing hook/bus GC entry points. Legacy `lifecycle=None` entries remain untouched.

### Machine-readable handback and idempotent collect

Add these public CLI contracts and main/usage entries:

```text
relay handback --from <child-id> --status completed|failed|conflict --note <text>
relay collect <child-name-or-id-or-reservation-token> --from <parent-id> [--delete-branch] [--force]
```

`relay handback` authorizes `--from` against the current managed Entry, re-reads repo identity, verifies current branch equals the stored branch, derives `head_sha` via `git rev-parse --verify HEAD`, verifies the stored branch ref still equals it, and verifies `git merge-base --is-ancestor <base_sha> <head_sha>`. It then CASes `Running` to `Completed` for `completed`, or `Failed` for `failed|conflict`, atomically embedding `{base_sha,head_sha,branch,status,note}` in the Entry. After the store write, it sends a best-effort human bus note to `parent`; mail failure is a warning and does not invalidate the handback.

`relay collect` resolves attached workers through the existing id/name indexes and pre-birth failures through the reservation token or unique `requested_name`. It authorizes the resolved `--from` UUID equals the record's `parent`, requires the caller's current repo identity equals the stored identity, and consumes only `Entry.handback` (never inbox text). For `Completed`:

1. Re-resolve the stored branch and require it still equals recorded `head_sha` (**stale-head check**); require `base_sha` is an ancestor of `head_sha` and both objects exist.
2. If `git merge-base --is-ancestor <head_sha> HEAD` exits 0, integration already happened; skip merge (idempotent retry after a crash).
3. Otherwise run `git merge --no-ff --no-edit <head_sha>`. This integrates exactly the verified `base_sha..head_sha` history. If it conflicts, run `git merge --abort`, require the parent worktree returns clean, leave lifecycle `Completed` and handback unchanged, print/report the conflict, and exit 4. Never auto-resolve.
4. Re-check `head_sha` is an ancestor of parent `HEAD`; then preflight child status is clean and invoke `git worktree remove <worktree>`. If cleanup fails, leave `Completed` so retry skips the already-integrated merge and retries cleanup.
5. Only after worktree removal CAS `Completed→Collected`. If `--delete-branch` is present, delete with `git branch -d <branch>` only after the ancestor check; without the flag, retain it. A repeated collect of the same collected token returns the stored receipt and exit 0.

For `Failed`, including a failure that never attached to a session UUID, refuse a dirty worktree or a branch advanced beyond `base_sha` unless the user supplied `--force`; `--force` means abandon that work explicitly and never implies branch deletion. `--delete-branch` remains separately required. After removal, CAS the failed reservation/Entry to `Collected`; keep a minimal collection receipt keyed by reservation token so an exact retry returns exit 0. All paths validate token, exact worktree, repo identity, and non-symlink destination before invoking git.

### GC contract

Keep existing O_NOFOLLOW/dirfd `unlinkat` logic unchanged for relay-owned flat files. Fan-out GC calls the same `collect_preflight`/`git worktree remove` functions as the CLI and processes descendants leaf-first:

- Skip `Reserved|Running` except to run the lease reaper; never collect an active record.
- A `Completed` orphan is removable only when its `head_sha` is already an ancestor of its stored parent's current HEAD, its branch still equals the recorded head, and its worktree is clean.
- A `Failed` orphan is removable only when clean and branch equals `base_sha`; GC never behaves as `--force` and never deletes branches.
- A parent/root with any non-`Collected` descendant is preserved. Missing/moved repo, missing parent, dirty tree, unmerged head, changed branch, identity mismatch, symlink, or git error preserves Entry + worktree and emits a diagnostic. Registry/name removal remains last.

## Steps

| # | Task | Files | Depends | Status | Done condition / failure trigger |
|---|---|---|---|---|---|
| 1 | Add typed fan-out schema, backward-compatible registry parsing, visible reservation/list lookup, trusted ancestry helpers, and CAS transition/reaper functions. | `rust/src/fanout.rs` (new), `rust/src/lib.rs:1-10`, `rust/src/store.rs:449-575,1028-1268`, `rust/src/cli.rs:1-132` | — | planned | Named unit tests prove old Entry→`None`, typed round-trip, immutable cap, forged ancestry refusal, transition table, replay idempotency, lease expiry, and lookup/collection of a pre-birth failure by token/name. If existing registration drops a fan-out field, STOP and fix preservation before Step 2. |
| 2 | Implement repo identity, base capture, reservation-under-lock, worktree creation/rollback, root initialization, child derivation, cap 2/depth 1, and `--fanout`/`--worktree` parsing. | `rust/src/fanout.rs`, `rust/src/spawn.rs:45,544-793`, `rust/src/cli.rs:30-86` | 1 | planned | Race test admits exactly two descendants; same-repo aliases pass by `(dev,ino)`; cross-repo/forged/depth-2/pre-existing-branch/symlink cases fail before unsafe mutation. Any path-string repo comparison is a STOP defect. |
| 3 | Route both birth modes through detached supervision and implement attach/rekey plus every rollback row. | `rust/src/spawn.rs:285-495,662-793`, `rust/src/appserver.rs:119-136,573-617`, `rust/src/hook.rs:195-224`, `rust/src/store.rs:1208-1268`, `rust/src/main.rs:1-59` | 1,2 | planned | Hook-born and app-server-born tests reach the same `Running` shape; foreground returns before completion; exit/timeout/no-handback reaches `Failed`; no turn starts after attach failure. If either mode bypasses the supervisor or token CAS, STOP. |
| 4 | Implement atomic `relay handback`, parent authorization, verified merge/abort, idempotent retry, `relay collect`, `--delete-branch`, and explicit `--force`. | `rust/src/fanout.rs`, `rust/src/cli.rs:1-86`, `rust/src/main.rs:1-59` | 1-3 | planned | Tests cover store-before-mail, stale head, exact merge range, already-ancestor retry, merge-conflict abort, cleanup retry, failed dirty refusal, force abandon, and branch retention/deletion. Any collect dependency on bus text is a STOP defect. |
| 5 | Extend GC leaf-first through the fan-out cleanup API without changing flat-file safety behavior. | `rust/src/fanout.rs`, `rust/src/store.rs:628-1206` | 1,2,4 | planned | Tests preserve active, dirty, unmerged, moved, missing-parent, identity-mismatch, and parent-with-descendant cases; clean eligible leaves use `git worktree remove`; existing flat-file GC tests remain green. Any recursive `unlinkat`/`remove_dir_all` is a STOP defect. |
| 6 | Add depth-aware founding prompts: root gets decompose→spawn two leaves→wait for records→collect/integrate→report; leaf gets handback→report and no spawn instruction. Preserve ordinary prompt bytes. | `rust/src/spawn.rs:252-283`, `rust/src/fanout.rs` | 1-4 | planned | Snapshot/unit tests show ordinary prompt byte identity, cap/depth text, absolute relay handback command, explicit `--from`, and no fan-out instruction for depth-1 leaves. |
| 7 | Add deterministic end-to-end smoke and extend selftest/CLI coverage for both birth paths, race, lifecycle, integration, and GC refusal. | `test/fanout-smoke.mjs` (new), `test/selftest.mjs`, existing `test/fake-app-server.mjs` (consume, do not modify unless protocol fixture needs a minimal extension) | 1-6 | planned | Acceptance A1-A9 pass in an isolated temp store/repo; the smoke's `finally` proves no registered worktree remains and prints the exact PASS line. |
| 8 | Document the shipped interface and run the full plugin gates; do not rebuild binaries or version/release. | `plugins/session-relay/AGENTS.md`, `skills/productivity/session-relay/SKILL.md`, `rust/src/main.rs:1-59` | 1-7 | planned | Docs state fixed cap/depth, explicit identity, root isolation, handback/collect, cleanup flags, and failure behavior; A10-A12 exit 0. If docs imply opaque mail is collectible or cap override exists, STOP. |

## Acceptance criteria

Run from repository root with `PATH="$HOME/.cargo/bin:$PATH"`. Each row is independently executable; an exit code other than the stated value fails the plan.

| ID | Criterion | Command | Expected output/result |
|---|---|---|---|
| A0 | Base is not stale before implementation. | `git diff --stat c3d0564e3a7901934c31275829c4153d4ae2b87e..HEAD -- plugins/session-relay/rust/src plugins/session-relay/test plugins/session-relay/AGENTS.md plugins/session-relay/skills/productivity/session-relay/SKILL.md` | Before source edits: empty stdout, exit 0. Any non-plan drift requires reconciliation before editing. |
| A1 | Entry/reservation compatibility and typed depth. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout_schema_ -- --nocapture` | Exit 0; all `fanout_schema_*` tests print `ok`; legacy Entry assertions show every new field `None`. |
| A2 | Trusted derivation, immutable cap, atomic race, depth. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout_reservation_ -- --nocapture` | Exit 0; forged inputs are rejected; concurrent test records exactly 2 active descendants and one exit-3 refusal; depth-1 spawn is rejected. |
| A3 | Lifecycle CAS, lease reaping, crash mapping. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout_lifecycle_ -- --nocapture` | Exit 0; every allowed transition succeeds, every disallowed transition is unchanged, exact replay succeeds, expired reserved/running records become failed, conflict maps to failed. |
| A4 | Both birth paths and detached supervisor. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout_birth_ -- --nocapture` | Exit 0; hook and app-server cases attach token→UUID, reach running, return foreground before first-turn completion, and produce failed on attach/turn/exit/timeout faults. |
| A5 | Worktree identity, rollback, and cleanup safety. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout_worktree_ -- --nocapture` | Exit 0; common-dir aliases pass; cross-repo/symlink/moved/dirty/unmerged/pre-existing branch cases fail closed; clean rollback/collect uses git worktree removal. |
| A6 | Handback and idempotent collect. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout_handback_ -- --nocapture` | Exit 0; atomic record survives mail failure; stale head fails; completed history merges once; retry is a no-op success; conflict aborts with clean parent; branch deletes only with `--delete-branch`. |
| A7 | Fan-out prompt opt-in. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml fanout_prompt_ -- --nocapture` | Exit 0; ordinary prompt fixture is byte-identical; root and leaf fixtures contain only their depth-appropriate commands/rules. |
| A8 | Reproducible sandbox smoke across hook/app-server births. | `cargo build --manifest-path plugins/session-relay/rust/Cargo.toml && RELAY_BIN="$PWD/plugins/session-relay/rust/target/debug/relay" node plugins/session-relay/test/fanout-smoke.mjs` | Exit 0 and final line exactly `PASS: relay fanout smoke — hook-born + app-server-born, cap=2, worktrees=0`; script asserts temp `git worktree list --porcelain` has only its root repo and temp relay store has no active reservation. |
| A9 | Existing plugin selftest remains green. | `node plugins/session-relay/test/selftest.mjs` | Exit 0 and final line matches `PASS: session-relay self-test — <N> checks`; `<N>` is re-derived by the script and is greater than the pre-plan count. |
| A10 | Complete Rust suite. | `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml` | Exit 0; summary contains `test result: ok`; zero failed tests. |
| A11 | Plugin gate. | `node scripts/ci.mjs --plugin session-relay` | Exit 0 with no `FAIL`; fmt, clippy `-D warnings`, manifest/checksum, skill, launcher, and selftest gates pass. A documented local host-digest warning is allowed. |
| A12 | Source-only diff. | `git diff --exit-code c3d0564e3a7901934c31275829c4153d4ae2b87e..HEAD -- plugins/session-relay/bin` | Empty stdout and exit 0. |

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
- `last_seen` is freshness; `lifecycle` plus a renewed lease is cap/liveness state. Do not count or reap from `last_seen`.
- `reply_to` is mutable routing; `parent` is immutable ownership. Never derive authorization from reply routing or a cwd marker. A pre-birth failure has no session UUID, so list/collect must retain its reservation-token address.
- `register_with_origin` currently preserves only existing fields it knows. Every registration path must preserve new fan-out metadata after attachment.
- A canonical path is not repository identity. Compare the canonical common-dir directory's device/inode and re-check it immediately before git mutations.
- `git worktree remove` does not delete branches. `--force` does not imply `--delete-branch`, and GC never supplies either destructive override.
- Merge conflict is not child lifecycle `Failed`: a child-declared `status=conflict` maps to Failed, while a parent-side merge conflict leaves the child's Completed record intact for retry after `git merge --abort`.
- Store lock duration is capped at three seconds. Do not run git or wait for processes while holding it; capture/validate filesystem facts outside, then CAS the immutable snapshot under lock and revalidate before mutation.

## Global constraints

- **Whole-tree active descendant cap: 2.**
- **Recursion depth: 1; depth-1 children are leaves.**
- **Worktree per root and child; `--fanout` implies root worktree isolation.**
- **Same-repository write fan-out only; compare git common-dir identity, not path strings.**
- **No secrets in committed config. Treat plugin marketplaces, installers, and downloaded artifacts as untrusted until verified.**
- **Committed binaries in `bin/` come ONLY from `.github/workflows/build-binaries.yml` artifacts — never from a local `cargo build`.**
- **Run `node scripts/ci.mjs` before any commit; do not loosen validator floors to pass.**
- **Fail closed: no automatic dirty/unmerged worktree deletion, branch deletion, force abandon, or conflict resolution.**

## STOP conditions

- Drift command A0 names a source/doc/test path changed after `c3d0564`: reconcile anchors/contracts before implementation.
- Current git or tool behavior cannot provide a stable common-dir device/inode, pre-birth token propagation, or supervisor-owned child handle for either tool: report the evidence; do not fall back to path equality, marker identity, or blocking parent `--watch`.
- Any rollback would require deleting a dirty/unmerged tree, a branch whose ref changed, or a path whose repo/symlink identity cannot be revalidated: retain it and report the exact manual recovery command.
- The implementation needs a cap/depth/config override, cross-repo write, recursion, or automatic conflict handling: stop as a scope change.
- A test requires the real user relay store, live production system, or committed locally-built binary: replace it with the sandbox/stub path before proceeding.

## Cold-handoff checklist

- **File manifest:** present in frontmatter and every Steps row, including new `fanout.rs` and `fanout-smoke.mjs`.
- **Environment & commands:** exact base, toolchain inputs, build/test/CI/smoke commands and expected outputs are present.
- **Interface/data contracts:** reservation token, typed Entry/Reservation/Handback/RepoIdentity, CLI flags, supervisor config, attach sequences, CAS table, collect algorithm, and GC policy are specified.
- **Executable acceptance:** A0-A12 each provide one command and an exit/output assertion; Cargo always uses `--manifest-path`.
- **Out of scope:** per-surface exclusions cover binaries/releases, product internals, live-view protocol, flat-file GC, cross-repo/deeper/configurable behavior, and unrelated cleanup.
- **Decision rationale:** every settled non-obvious choice is paired with its safety/idempotency reason.
- **Known gotchas:** identity asymmetry, freshness/liveness, owner/router, common-dir identity, registration preservation, git cleanup, conflict mapping, and lock duration are explicit.
- **Global constraints verbatim:** cap 2, depth 1, isolation, same-repo, secret/artifact/CI/fail-closed rules are copied into `## Global constraints`.
- **No undefined terms / forward references:** all new types, actors, states, commands, flags, exit codes, test filters, paths, and failure outcomes are defined here; no TBD/TODO remains.

## Open questions

*(none — Draft-3 introduces no new user-visible fork and keeps every settled design choice.)*

## Self-review

**Status: dispatch-ready Draft-3.** Score: **99/100** · trajectory **70→94→97→99→99→99→99** · stopped: **plateau (K=3)**.

Weighted score: standalone executability **22/22**; actionability **16/16**; dependency order **12/12**; evidence re-verify **10/10**; goal coverage **12/12**; executable acceptance **12/12**; failure mode **9/10** (the explicit `--force` abandon remains inherently destructive but is isolated, separately authorized, and tested); assumption→question **6/6**.

Draft-3 closed the confirm-pass gaps as follows:

| Confirm-pass gap | Draft-3 closure |
|---|---|
| 1. Reservation vs birth | Separate `reservations` map keyed by a token; root/child attach-rekey sequences; token transport; stage-by-stage rollback table. |
| 2. Trusted derivation | Explicit invoking identity; stored parent/root derivation; typed depth; root-only fixed cap 2; no override. |
| 3. Lifecycle/lease | Typed state/actor, reservation_id, renewed expiry, under-lock transition table, idempotent CAS, expiry reaping, crash/conflict/legacy mapping. |
| 4. Detached supervisor | One `__fanout-supervisor` owns both CLI-hook and app-server paths through first-turn terminal state without blocking the parent. |
| 5. Machine handback | Atomic `relay handback`; store record is authoritative; verified base/head/branch; merge/abort/stale-head/idempotent collect algorithm. |
| 6. Root isolation | `--fanout` implies a fresh root worktree and explicitly initializes the born root Entry before it can spawn leaves. |
| 7. Worktree/repo/GC | Pre-add base SHA, token branch, common-dir device/inode, named `--delete-branch`, executable ancestor checks, git removal only, moved/missing/active-descendant policy. |
| 8. Executable acceptance | A0-A12 are command/output pairs, use Cargo manifest path, add a deterministic smoke script, and prove `bin/` diff is empty. |
| 9. De-stale | Base is `c3d0564`; live-view/0.10.0 is shipped (`e51ed8f`/`838fb40`); anchors refreshed to Entry `store.rs:485` and `build_prompt` `spawn.rs:258`; no release speculation remains. |

Adversarial cold-read found and fixed three residual decisions after the first rewrite: root creation from a legacy external parent is now the only managed-parent exception; parent-side merge conflict is distinguished from child-declared conflict; and cleanup failure after a successful merge now leaves `Completed` so ancestry-based retry is safe.

Prior review record: Cross-check (2026-07-10): [codex gpt-5.6-sol xhigh] draft-1 scored 62/100; all accepted findings were folded into Draft-2 and the user settled cap=2/depth=1. Cross-check (2026-07-11): [codex gpt-5.6-sol xhigh] Draft-2 confirm-pass scored 70/100 NOT-READY; all nine implementation-contract findings are mapped above and independently re-verified against current source before this rewrite.

## Sources

- `plugins/session-relay/rust/src/spawn.rs:1-13` — Claude premints a UUID; Codex has no preset-id and is born through a new marker; ordinary spawn detaches and returns at birth.
- `plugins/session-relay/rust/src/spawn.rs:252-283` — current founding prompt builder is at line 258 and carries the absolute relay reply path/guardrails.
- `plugins/session-relay/rust/src/spawn.rs:337-403` — app-server pump performs start-thread → register → initial turn → bounded event pump.
- `plugins/session-relay/rust/src/spawn.rs:418-495` — foreground app-server spawn launches a detached pump and only waits for completion under `--watch`.
- `plugins/session-relay/rust/src/spawn.rs:662-793` — ordinary CLI birth uses Claude premint vs Codex marker discovery, registers after birth, and otherwise drops the child handle unless `--watch`.
- `plugins/session-relay/rust/src/appserver.rs:119-136` — `thread/start` response is where the app-server-born UUID becomes available.
- `plugins/session-relay/rust/src/appserver.rs:573-617` — pump observes `turn/completed|turn/failed` and times out without inventing a terminal event.
- `plugins/session-relay/rust/src/hook.rs:195-224` — SessionStart reads `session_id`/cwd, sets marker, and registers the hook-born session.
- `plugins/session-relay/rust/src/store.rs:449-482` — `with_lock` is the three-second kernel-flock registry critical section.
- `plugins/session-relay/rust/src/store.rs:485-545` — current Entry fields and old-shape defaulting; `server` and `spawned_via` are already shipped.
- `plugins/session-relay/rust/src/store.rs:693-761` — GC pins only named surface directories and opens regular entries with `O_NOFOLLOW`.
- `plugins/session-relay/rust/src/store.rs:994-1021` — current deletion primitive is dirfd-relative `unlinkat` for a validated flat surface.
- `plugins/session-relay/rust/src/store.rs:1028-1206` — GC is all-surfaces-old, held-lock safe, and removes registry/name records last.
- `plugins/session-relay/rust/src/store.rs:1208-1268` — registration upsert preserves known prior fields, establishing where new fan-out fields must also survive refresh.
- `plugins/session-relay/rust/src/main.rs:1-59` — current multi-call verb dispatch/usage has spawn and hidden pumps but no handback/collect/supervisor.
- `plugins/session-relay/.claude-plugin/plugin.json:1-5` and `.codex-plugin/plugin.json:1-4` — both shipped manifests are version `0.10.0` on this base.
- `git show -s e51ed8f` / `git show -s 838fb40` / `git rev-parse HEAD` — live-view merge, 0.10.0 release commit, and current plan base are present in this checkout.

## Review

*(pending completion review)*
