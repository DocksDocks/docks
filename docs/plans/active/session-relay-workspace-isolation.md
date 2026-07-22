---
title: Isolate managed writing sessions with Relay worktrees
goal: Prevent concurrent Docks writing sessions from sharing a checkout, Git index, refs, or mutable external resources while preserving bounded review behavior.
status: in_review
created: "2026-07-21T20:58:22-03:00"
updated: "2026-07-22T22:39:44.381Z"
started_at: "2026-07-22T03:16:32.285Z"
in_review_since: "2026-07-22T22:39:44.181Z"
assignee: null
review_author_company: openai
review_author_tool: omp
review_author_model: gpt-5.6-sol
review_author_effort: high
review_waivers: []
tags:
  - session-relay
  - worktrees
  - concurrency
  - isolation
affected_paths:
  - plugins/session-relay/
  - AGENTS.md
  - scripts/ci.mjs
  - scripts/lib/plugins.mjs
  - scripts/verify-session-relay-preflight.mjs
  - scripts/AGENTS.md
  - .github/workflows/ci.yml
  - .github/workflows/build-binaries.yml
  - .github/AGENTS.md
related_plans:
  - docs/plans/active/plan-workflow-phases-and-loop-escape.md
  - docs/plans/active/plan-review-controller-failure-recovery.md
review_status: null
planned_at_commit: fc466f5a5784bb434108928d69aadef4877a6f5a
execution_base_commit: 21eda3c9137b1b44b652738f6f53a0237b403fb5
---

## Goal

Deliver a planned, multi-commit Session Relay workspace-isolation implementation that gives every supported writing session a deterministic Git worktree, exclusive branch, capability-brokered Git mutation, isolated mutable resources, and a process-lifetime lease whose release is proven only after the Linux worker tree is empty. Preserve existing Relay `spawn`/fan-out behavior behind a shared repository gate, keep Docks as policy and guidance rather than runtime authority, and leave Docks schema-6 review semantics unchanged.

Success is a cold handoff in which a fresh executor can preserve current WIP before creating the implementation worktree, implement the exact nine-command API and module boundary, prove Linux/ext4 custody with real hostile processes, retain macOS/APFS as an explicit negative admission, wire exact tests/inventories, Relay documentation, focused CI, and native evidence, and stop without publishing or releasing anything.

## Context & rationale

Two writers in one checkout share files, index, branch, `HEAD`, caches, ports, and other mutable resources. Git worktrees separate files/index/`HEAD`, but they do not by themselves provide branch ownership, shared-ref serialization, descendant-process custody, path-claim enforcement, resource isolation, crash recovery, or safe integration. The design therefore makes Session Relay the single runtime authority and treats Claude, Codex, and OMP as untrusted children.

The first action is preservation, not worktree creation: a new worktree does not contain another checkout's uncommitted or untracked bytes. The owner must first create a retained WIP ref/receipt while proving the source `HEAD`, index, status, and worktree bytes unchanged; only then may an implementation worktree be created and that WIP deliberately applied.

The runtime uses two different exclusion concepts:

- `RepositoryGateV1` is a short-lived, per-common-Git-directory gate for authority publication and every supported shared-ref/worktree/merge/remove mutation, including legacy fan-out.
- `WorkspaceLease` is a lifetime-held authority precondition retained by the guardian and supervisor. It is deliberately **not** a member of one total lock order.

Linux is the only implementable production custody backend. A delegated cgroup-v2 leaf supplies durable descendant membership, `cgroup.kill` supplies fork-safe termination, recursive `cgroup.events populated 0` supplies empty proof, pidfds supply exact root/custodian identities, and Landlock supplies inherited filesystem restrictions. The proposed macOS process-group/kqueue/libproc approach is not durable containment: descendants can call `setsid`, kqueue observes registered PIDs rather than a non-escapable membership object, and dual-custodian loss leaves no documented atomic enumerate/kill/empty primitive. Therefore `macos_pgroup_libproc` is not activated; the macOS module and native test return the frozen STOP reason until a documented public containment primitive is established and process-tested.

The plan prepares release evidence but contains no release step. Cross-platform managed-workspace release remains stopped by the macOS custody gap. This plan neither versions nor publishes Relay or Docks.

## Environment & how-to-run

- Repository: Docks checkout; run all implementation commands from the dedicated `IMPL_ROOT` produced below, never from the owner's source checkout.
- Rust build contract: Cargo lockfile respected; the existing fresh-binary check uses `cargo +1.85.0 build --manifest-path plugins/session-relay/rust/Cargo.toml --release --locked`.
- Linux production/native-test admission: exact ext4 by FD mount identity; unified cgroup v2; admin-provisioned, EUID-owned `/sys/fs/cgroup/session-relay-<euid>` delegation; mandatory `cgroup.kill`; recursive `cgroup.events`; pidfd support; Landlock ABI at least 3. No prerequisite may be skipped.
- macOS: negative admission only. Keep the existing target/name inventory, but the native macOS case must assert the exact durable-containment STOP and must not count process-group/libproc smoke as production evidence.
- Authority home comes only from `getpwuid_r(euid)`, never `HOME`, `XDG_*`, or test environment variables. Rust tests inject a root only through `AuthorityRootProvider`.
- Planning is read-only. The following command is for the future executor's S0 and must run before the first implementation edit.

```bash
set -euo pipefail
REPO="$(pwd -P)"
PRESERVE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/docks-workspace-preserve.XXXXXX")"
chmod 700 "$PRESERVE_DIR"
s0_on_exit() { status=$?; if test "$status" -ne 0; then printf >&2 'S0 failed: status=%s PRESERVE_DIR=%s PRESERVE_REF=%s WIP_COMMIT=%s IMPL_ROOT=%s\n' "$status" "${PRESERVE_DIR:-unset}" "${PRESERVE_REF:-unset}" "${WIP_COMMIT:-unset}" "${IMPL_ROOT:-unset}"; printf 'status=%s\nPRESERVE_DIR=%s\nPRESERVE_REF=%s\nWIP_COMMIT=%s\nIMPL_ROOT=%s\n' "$status" "${PRESERVE_DIR:-unset}" "${PRESERVE_REF:-unset}" "${WIP_COMMIT:-unset}" "${IMPL_ROOT:-unset}" >"$PRESERVE_DIR/failure-receipt.env" || true; chmod 600 "$PRESERVE_DIR/failure-receipt.env" || true; fi; exit "$status"; }
trap s0_on_exit EXIT
SESSION_ID="$(node -e 'console.log(require("node:crypto").randomUUID())')"
SLUG=workspace-isolation
BASE="$(git -C "$REPO" rev-parse --verify HEAD)"
OBJECT_FORMAT="$(git -C "$REPO" rev-parse --show-object-format)"
case "$OBJECT_FORMAT" in sha1|sha256) ;; *) exit 1;; esac
INDEX="$(git -C "$REPO" rev-parse --path-format=absolute --git-path index)"
printf '%s\n' "$BASE" >"$PRESERVE_DIR/before.head"
git -C "$REPO" status --porcelain=v2 -z --untracked-files=all >"$PRESERVE_DIR/before.status"
if test -f "$INDEX"; then
  shasum -a 256 "$INDEX" | cut -d ' ' -f 1 >"$PRESERVE_DIR/before.index"
else
  printf 'absent\n' >"$PRESERVE_DIR/before.index"
fi
GIT_INDEX_FILE="$PRESERVE_DIR/index" git -C "$REPO" read-tree "$BASE"
GIT_INDEX_FILE="$PRESERVE_DIR/index" git -C "$REPO" add -A -- .
TREE="$(GIT_INDEX_FILE="$PRESERVE_DIR/index" git -C "$REPO" write-tree)"
WIP_COMMIT="$(printf 'Docks preserved WIP %s\n' "$SESSION_ID" |
  GIT_AUTHOR_NAME='Docks WIP Preservation' GIT_AUTHOR_EMAIL='docks-wip@invalid' \
  GIT_COMMITTER_NAME='Docks WIP Preservation' GIT_COMMITTER_EMAIL='docks-wip@invalid' \
  git -C "$REPO" commit-tree "$TREE" -p "$BASE")"
PRESERVE_REF="refs/docks/preserve/$SESSION_ID"
! git -C "$REPO" show-ref --verify --quiet "$PRESERVE_REF"
git -C "$REPO" update-ref "$PRESERVE_REF" "$WIP_COMMIT"
IMPL_ROOT="$(dirname "$REPO")/docks-$SESSION_ID-$SLUG"
test ! -e "$IMPL_ROOT"
git -C "$REPO" worktree add -b "docks/$SESSION_ID/$SLUG" "$IMPL_ROOT" "$BASE"
git -C "$IMPL_ROOT" cherry-pick --allow-empty "$WIP_COMMIT"
APPLIED_WIP_COMMIT="$(git -C "$IMPL_ROOT" rev-parse HEAD)"
test "$(git -C "$REPO" rev-parse HEAD)" = "$BASE"
git -C "$REPO" status --porcelain=v2 -z --untracked-files=all >"$PRESERVE_DIR/after.status"
cmp "$PRESERVE_DIR/before.status" "$PRESERVE_DIR/after.status"
if test -f "$INDEX"; then
  shasum -a 256 "$INDEX" | cut -d ' ' -f 1 >"$PRESERVE_DIR/after.index"
else
  printf 'absent\n' >"$PRESERVE_DIR/after.index"
fi
cmp "$PRESERVE_DIR/before.index" "$PRESERVE_DIR/after.index"
GIT_INDEX_FILE="$PRESERVE_DIR/after-tree.index" git -C "$REPO" read-tree "$BASE"
GIT_INDEX_FILE="$PRESERVE_DIR/after-tree.index" git -C "$REPO" add -A -- .
AFTER_TREE="$(GIT_INDEX_FILE="$PRESERVE_DIR/after-tree.index" git -C "$REPO" write-tree)"
test "$AFTER_TREE" = "$TREE"
test "$(git -C "$IMPL_ROOT" rev-parse "$APPLIED_WIP_COMMIT^")" = "$BASE"
test "$(git -C "$IMPL_ROOT" rev-parse "$APPLIED_WIP_COMMIT^{tree}")" = "$TREE"
printf 'REPO=%s\nPRESERVE_DIR=%s\nSESSION_ID=%s\nOBJECT_FORMAT=%s\nBASE=%s\nPRESERVE_REF=%s\nWIP_COMMIT=%s\nIMPL_ROOT=%s\nAPPLIED_WIP_COMMIT=%s\nAFTER_TREE=%s\n' \
  "$REPO" "$PRESERVE_DIR" "$SESSION_ID" "$OBJECT_FORMAT" "$BASE" \
  "$PRESERVE_REF" "$WIP_COMMIT" "$IMPL_ROOT" "$APPLIED_WIP_COMMIT" "$AFTER_TREE" \
  >"$PRESERVE_DIR/owner-receipt.env"
chmod 600 "$PRESERVE_DIR/owner-receipt.env"
shasum -a 256 "$PRESERVE_DIR/owner-receipt.env"
trap - EXIT
```

Retain `PRESERVE_REF` and `PRESERVE_DIR` until integration/retention is proven. Then `cd "$IMPL_ROOT"`; every later commit and command runs there.

The frozen Rust target inventory is exactly:

- `workspace_identity`
- `workspace_lease_process`
- `workspace_coordination_process`
- `workspace_resources`

Attachment cases A1-A17 retain their exact owners and test names: `two_writers_same_worktree_exactly_one_lease`, `separate_worktrees_both_hold_leases`, `read_only_spawn_coexists_with_writer`, `crashed_writer_recovers_only_after_empty_proof`, `symlink_relative_case_aliases_share_one_identity`, `unexpected_branch_switch_is_refused`, `unexpected_head_or_base_drift_is_refused`, `unowned_dirty_path_blocks_handback`, `worker_merge_rebase_reset_and_force_push_are_refused`, `overlapping_path_claims_are_atomic_and_refused`, `coordinator_integrates_commits_serially`, `conflicting_commits_settle_once_needs_user_action`, the existing schema-6 orchestration oracle, `all_six_resource_kinds_are_isolated_and_receipted`, `cleanup_refuses_dirty_or_unretained_work`, `integration_checkout_refuses_supported_writer`, and `failed_preflight_or_lease_changes_no_source_bytes`. Keep the additional frozen names for preservation, applied-WIP order, gate/object-format/bootstrap/recovery, Linux hostile custody, and macOS negative admission. Invent no fifth target and rename no inventory case independently of its fixture.

## Threat model

- **Alias/replacement attacks:** canonical paths alone are insufficient. Open with no-follow directory FDs; bind repository/worktree/lease identity to EUID, device, inode, actual private Git directory, branch, and generation; revalidate before mutation.
- **Unauthorized coordinator/worker actions:** a session UUID or path is not authority. Coordinator and worker secrets are generation-bound, action-scoped, revocable, stored mode 0600, digest-checked in constant time, and request/replay bound.
- **Direct Git bypass:** the generated shim is UX, not the security boundary. Landlock denies common-Git, authority, integration-root, other-workspace, and cgroupfs writes even if the worker invokes `/usr/bin/git` or changes `GIT_DIR`. Only `add`, `rm --cached`, `restore --staged`, and `commit` mutate through the authenticated broker.
- **Concurrent shared-Git mutation:** workspace preserve/provision/broker/integrate/cleanup and legacy fan-out prepare/handback/collect share one repository identity and gate. The persistent workspace authority/marker creates a one-way managed-mode transition; old binaries are an explicit STOP because flock is advisory.
- **Lost or omitted dirty WIP:** preserve must leave source bytes unchanged, retain a create-once ref or hashed artifact set, and make the deliberately applied WIP commit produced/integrated element zero even when empty.
- **Claim bypass:** normalize UTF-8 repository-relative slash paths; reject absolute, NUL, `.`, `..`, case aliases, unenforceable file replacement, and overlapping prefixes; validate both rename/copy endpoints from `git diff --name-status -z`.
- **Resource collision/leak:** all six resource kinds are explicitly requested or explicitly unused. Ports are Relay-held loopback FDs; directories are private; database schemas use digest-pinned authenticated providers; create/inspect/delete receipts make cleanup idempotent.
- **Crash/PID reuse/fork escape:** pidfds identify roots/custodians, but cgroup membership defines the descendant tree. Guardian and supervisor independently fence on peer loss; `cgroup.kill` plus recursive `populated 0` is the only authoritative Linux kill/empty proof.
- **FD leakage:** the worker must inherit no lease, custody socket, key, cgroup, pidfd, journal, or authority FD. Before worker exec, close every FD except stdio, the CLOEXEC activation-barrier read end, and each held resource FD identified one-to-one by a validated `ResourceAllocationV1.env` entry named `DOCKS_RESOURCE_<UPPER_NAME>_FD` whose decimal value equals that FD. The broker is reached through `WorkerCapabilityV1.broker_socket` and is not inherited as an FD. Reject duplicate, unregistered, or extra inherited FDs.
- **IPC forgery/replay:** custody uses authenticated `SOCK_SEQPACKET`, exact credentials/start tokens, closed packet kinds, strict per-sender sequence, exact ACKs, bounded frames, and fatal rejection of malformed/truncated/extra-FD traffic.
- **Integration corruption:** only the coordinator integrates under `IntegrationQueueLock -> RepositoryGate`; conflict aborts to the exact clean pre-head, emits `IntegrationBlocked/needs_user_action`, retains work, and never retries or invokes plan review automatically.
- **Premature lease release:** both custodians keep the same open-file-description lock until capability revocation, broker drain, empty proof, retention/Git/resource cleanup, authenticated close, and an independent lock probe. `Closed` is fsynced while the coordinator's probe and authority exclusion prevent a new writer.
- **Unsupported storage/platform:** NFS, SMB, FUSE, overlay, cloud/removable/unknown storage and any unverifiable mount identity fail closed. On Linux, ext-family magic is not ext4 proof.
- **Unmanaged same-UID writers:** arbitrary shells, IDEs, raw Git, or independently launched agents can ignore advisory coordination and are outside the managed security boundary. Docks policy must not claim otherwise.
- **macOS descendant escape:** process groups are voluntarily leaveable and kqueue/libproc provide observation, not durable membership. macOS managed writing and release therefore remain stopped rather than degraded.

## Ownership decision

| Layer | Sole owner | Boundary |
|---|---|---|
| Docks policy | Docks | User guidance, marker/identity interpretation, refusal of supported direct integration-checkout writing, and the unchanged schema-6 review lifecycle. No runtime lease, Git, process, or resource authority. |
| Workspace coordinator | Session Relay `workspace.rs` plus schema/authority/capability | Nine-command routing, repository/session authority, state/journal CAS, capability bootstrap/rotation, claims, recovery, and closure. State mutates only in the authority root. |
| Repository/Git | Session Relay `workspace/git.rs`, `workspace/repository_gate.rs`, existing fan-out | Repository identity, WIP preservation/application, deterministic branch/worktree, brokered Git, shared-ref exclusion, integration, retention, cleanup. Git/shared refs mutate only under the common gate. |
| Custody/platform | Session Relay `workspace/custody.rs`, `workspace/platform*.rs`, lifecycle/supervisor seams | Lifetime lease, guardian/supervisor, worker-tree containment, sandbox, activation, kill/empty/release evidence. Linux only; macOS returns the frozen STOP. |
| Claims/resources | Session Relay `workspace/authority.rs`, `workspace/resources.rs` | Exact path admission and six closed resource kinds/providers/receipts. |
| Worker adapters | Existing Session Relay spawn/hook/CLI/watch/app-server plus Claude/Codex/OMP launch adapters | Launch only Relay-contained children; refuse mutation-capable reentry/shared app-server paths that cannot prove WorkerTree custody. |
| Evidence | Rust/process/smoke inventories, CI, native workflow, preflight verifier | Prove implementation and unchanged V1 evidence contracts; never publish or release in this plan. |
| Worker tools | Claude, Codex, OMP | Untrusted Relay-launched workers. They receive only the worker capability/broker/resource environment and never coordinator authority. |

There is no Docks executable, `docks session`, `spawn --workspace`, or use of OMP's worktree manager. Existing top-level `spawn`, `handback`, and `collect`, including `spawn --fanout|--worktree`, keep their public grammar, depth/cap, and observable behavior except mandatory pre-mutation safety refusal.

## Interfaces & data shapes

### Public CLI

The public surface is exactly:

```text
session-relay workspace preserve
session-relay workspace start
session-relay workspace list
session-relay workspace inspect
session-relay workspace handback
session-relay workspace integrate
session-relay workspace recover
session-relay workspace finish
session-relay workspace abort
```

- `preserve` is the owner, pre-coordinator route and is serialized by `RepositoryGate`.
- First `start` alone may omit `--coordinator-capability-file`, subject to the atomic bootstrap rules below. Every later coordinator route requires the current exact capability path.
- `list --repository <canonical-root> --coordinator-capability-file <absolute-file>` and `inspect <session-id> --repository ... --coordinator-capability-file ...` are authenticated reads and report `unproven` rather than inferring live custody from JSON.
- Worker-only `handback` requires `--request-file`, `--request-sha256`, and `--worker-capability-file`; it uses the private broker socket and never opens the authority root.
- `integrate|recover|finish|abort` require a canonical request file, its digest, and the current coordinator capability. `finish` means coordinator cleanup/closure, not worker commit return.

### Module layout

```text
plugins/session-relay/rust/src/
├── workspace.rs                         # only workspace router/coordinator and child-module parent
└── workspace/
    ├── schema.rs
    ├── authority.rs
    ├── capability.rs
    ├── git.rs
    ├── custody.rs
    ├── resources.rs
    ├── repository_gate.rs
    ├── platform.rs
    └── platform/
        ├── linux.rs
        └── macos.rs                     # frozen negative admission only
```

Do not create `workspace/mod.rs`, `workspace/cli.rs`, or `workspace/coordinator.rs`.

### Encoding and primitives

All workspace request/record files are recursively closed RFC 8785 JCS objects, UTF-8, with exactly one final LF; SHA-256 covers that LF. Reject unknown/missing/duplicate keys, invalid Unicode, duplicate set members, alternate enum case, noncanonical bytes, and trailing bytes.

```text
LowerUuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
Sha256      = /^[0-9a-f]{64}$/
Decimal     = /^(0|[1-9][0-9]*)$/
Timestamp   = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
```

`AbsPath` is canonical UTF-8 absolute, non-NUL, and non-symlink at the consumed boundary. `RelPath` is normalized, nonempty UTF-8 slash form with no absolute, empty, `.`, `..`, or NUL component. Git OIDs are lowercase 40 hex for repository-reported SHA-1 and 64 hex for repository-reported SHA-256.

### Identity, authority, and capabilities

```text
RepositoryIdentityV1 = {
  schema, repository_id, common_dir_realpath, common_dir_dev, common_dir_ino,
  common_dir_owner_euid, euid, object_format:"sha1"|"sha256"
}
repository_id = sha256("session-relay/repository/v1\0" || euid || "\0" || dev || "\0" || ino)

WorktreeIdentityV1 = {
  schema, identity_sha256, root_realpath, root_dev, root_ino, root_owner_euid,
  private_git_dir_realpath, private_git_dir_dev, private_git_dir_ino, branch_ref
}
```

`worktree_identity` is `null` in Reserved/early Provisioning and is filled only after `git worktree add` plus secure reopen of the canonical root and actual private Git directory.

```text
CoordinatorCapabilityV1 = {
  schema, capability_id, repository_id, generation,
  actions:["abort","finish","inspect","integrate","list","recover","start"],
  secret_b64url, issued_at
}
WorkerCapabilityV1 = {
  schema, capability_id, repository_id, session_id, generation,
  actions:["git_index","git_commit","handback"],
  secret_b64url, broker_socket, issued_at, expires_at
}
CapabilityRecordV1 = { capability_id, secret_sha256, generation, actions, revoked_at:null|Timestamp }
```

Secrets are exactly 32 random bytes encoded as 43 unpadded base64url characters. Authority retains only the digest/actions/generation/revocation. Actions are sorted and unique.

On Linux, `A=<pw_dir>/.local/state/session-relay/workspace-authority-v1` and `D=<pw_dir>/.local/share/session-relay/workspaces-v1`. On macOS, `A=<pw_dir>/Library/Application Support/session-relay/workspace-authority-v1` and `D=<pw_dir>/Library/Application Support/session-relay/workspaces-v1`. Resolve `<pw_dir>` only with `getpwuid_r(euid)`. The persistent repository gate is exactly `A/repository-gates/<repository_id>.lock`; it is never replaced or deleted. Acquire `LOCK_EX|LOCK_NB` with bounded retry for at most three seconds; contention at the deadline is a hard no-mutation refusal. Coordinator generation `g` is exactly `A/repositories/<repository_id>/coordinator-capabilities/<g as 20 decimal digits>.json`.

First-start bootstrap occurs only after full request/WIP validation and while holding RepositoryGate when `A/repositories/<repository_id>` does not exist. Create a mode-0700 sibling staging directory containing `repository-authority-v1.json`, generation `00000000000000000001.json`, and required empty session/journal directories; write mode-0600 JCS+LF records; fsync files and staging directory; publish create-once with `renameat2(RENAME_NOREPLACE)` on Linux; fsync `A/repositories`. `EEXIST` loses without mutation and never returns the winner's secret. A durable bootstrap followed by later start failure must name the deterministic capability path and retry flag.

```text
WorkspaceStartResultV1 = {
  schema, session_id, repository_id, worktree_root, branch_ref,
  coordinator_capability_file, coordinator_generation,
  bootstrap:"created"|"existing"
}
```

All later coordinator authentication securely opens the exact current-generation path, validates repository/action/generation/canonical bytes, and constant-time compares the decoded-secret digest. `recover` retains its request-file transport and adds the closed action `rotate_coordinator`; rotation publishes/fsyncs `g+1` before CAS-replacing authority. Lost/corrupt current secret is unrecoverable and never rebootstrap-authorized.

After authority publication, create/validate `<common-git-dir>/docks/workspace-admission-v1.json` under the gate with exact repository ID, `mode:"workspace"`, `gate_protocol:"RepositoryGateV1"`, minimum Relay version, authority repository path, and creation time. Authority first, marker second; either surviving indicator activates cross-mode refusal in new binaries.

### Preservation, launch, claims, and resources

```text
PreserveRequestV1 = { schema, request_id, repository_path, base_commit, mode:"commit"|"artifact", label, created_at }
WipReceiptV1 = {
  schema, receipt_id, request_sha256, repository, source_root, base_commit,
  mode, before:SourceSnapshotV1, after:SourceSnapshotV1,
  payload:CommitWipV1|ArtifactWipV1, created_at
}
SourceSnapshotV1 = { head_oid, index_sha256:null|Sha256, status_sha256, tracked_untracked_inventory_sha256 }
CommitWipV1 = { kind:"commit", temporary_index_sha256, tree_oid, preserved_commit, preserve_ref }
ArtifactWipV1 = { kind:"artifact", binary_diff, untracked_inventory, untracked_archive, archive_format:"pax", entries }
```

`before == after` byte-for-byte. Artifact inventory is raw-byte path ordered and must match archive membership exactly; reject hard links, devices, FIFOs, sockets, absolute/escaping symlinks, duplicate paths, and un-inventoried members.

```text
ToolLaunchV1 = {
  kind:"claude"|"codex"|"omp", executable_path, executable_sha256,
  model:null|string, effort:null|string, service_tier:null|"default"|"fast"
}
```

Launch grammar is fixed: Claude `-p --session-id <session> --permission-mode auto [--model] [--effort] -- <prompt>`; Codex `exec --sandbox workspace-write [-m] [-c model_reasoning_effort=] [-c service_tier=] -- <prompt>`; OMP 17.0.6 `-p --cwd <root> --approval-mode write --append-system-prompt <generated-policy> [--model] [--thinking] -- <prompt>`. Refuse unsupported option combinations or executable-digest drift.

```text
PathClaimRequestV1 = { path:RelPath, path_type:"file"|"directory", mode:"exclusive" }
CoordinatorOwnedOverrideV1 = { path:RelPath, reason:string }
ResourceKind = "port"|"temp_dir"|"build_dir"|"database_schema"|"log_dir"|"cache_dir"
ResourceDecisionV1 =
  { kind, name, state:"requested", provider_id:null|string } |
  { kind, name, state:"unused", reason:"task_does_not_use_resource" }
WorkspaceStartRequestV1 = {
  schema, request_id, repository_path, integration_root, base_commit, task_slug,
  task, tool, wip_receipt_path, wip_receipt_sha256, owned_paths,
  coordinator_owned_paths, coordinator_owned_overrides, resources, created_at
}
session_id = request_id
```

Every start request has exactly one decision for each resource kind. Resource names match `[a-z][a-z0-9_]{0,31}`. Built-ins project port as `DOCKS_RESOURCE_<UPPER_NAME>_FD`, temp as `TMPDIR/TMP/TEMP`, and build/log/cache as `DOCKS_BUILD_DIR/DOCKS_LOG_DIR/DOCKS_CACHE_DIR`. `database_schema` uses the closed digest-pinned provider registry and `--session-relay-resource-provider-v1 create|inspect|delete` JCS+LF protocol. Unsupported provider, digest, response, timeout, or outcome refuses without state advance.

### Manifest, state, Git, integration, and cleanup

```text
WorkspaceState = "Reserved"|"Provisioning"|"LeaseHeld"|"Ready"|"Running"|
  "HandbackReady"|"IntegrationQueued"|"Integrated"|"IntegrationBlocked"|
  "Rejected"|"AbortedRetained"|"Releasing"|"Closed"
```

`WorkspaceManifestV1` carries the exact repository/integration/worktree identities, deterministic root/ref, base and WIP digests, `applied_wip_commit`, `worker_base_commit`, task/tool/claims/resources, state, ordered produced/integration commits, lease/custody/capability/retention evidence, last error, journal sequence/head hash, and timestamps. State controls nullability; fields are never omitted.

Journal events are immutable create-once `journal/<20-digit-sequence>.json` JCS+LF files, hash chained and fsynced before atomic manifest replacement. Keep the closed states and event family; custody fault/readiness/empty/release evidence is digest-bound rather than inferred from enum names.

Provision under RepositoryGate, then release every short lock before acquiring the lifetime lease. Deterministic values are:

```text
branch_ref    = refs/heads/docks/<lowercase-session-uuid>/<task-slug>
worktree_root = D/<repository_id>/<session-id>-<task-slug>
task_slug     = [a-z0-9]+(?:-[a-z0-9]+)*, length 1..48
```

Use `git worktree add --lock --reason session-relay:<session-id> -b docks/<session-id>/<task-slug> <root> <base_commit>`. Never use `-B`, force, or a numeric root suffix. Discover the actual private Git directory afterward with `git rev-parse --path-format=absolute --git-dir`; Git may suffix only that administrative directory.

With the lease held, reacquire RepositoryGate, materialize validated WIP, create exactly one fixed-identity/message/timestamp `git commit-tree` commit even for a clean tree, CAS only the owned branch, fsync `WipApplied`, and set:

```text
applied_wip_commit = worker_base_commit = produced_commits[0].oid
produced_commits[0].source = "applied_wip"
produced_commits[0].parent_oid = base_commit
```

Every later produced commit is merge-free, linear, and source `worker`.

Worker private-Git assets are exact: `session-relay/broker-v1.sock` mode 0600, `session-relay/bin/git` mode 0500, and immutable `session-relay/worker-capabilities/<20-digit-generation>.json` mode 0600 under mode-0700 directories. Publish capability bytes first, register its digest second, start/verify the broker, prepend the shim, and pass only `SESSION_RELAY_WORKER_CAPABILITY_FILE` to the worker.

`GitBrokerRequestV1` remains `{schema,request_id,session_id,generation,operation:"git_index"|"git_commit",argv,cwd,capability_id,request_sha256}`. Digest domain is `session-relay/broker-request/v1\0`; the JCS+LF envelope is HMAC-bound under `session-relay/broker-envelope/v1\0`, request digest, and a 32-byte nonce. Same request ID/digest returns byte-identical durable response; changed replay refuses.

`HandbackRequestV1`, `HandbackReceiptV1`, `IntegrateRequestV1`, `IntegrationReceiptV1`, `RecoverRequestV1`, `AbortRequestV1`, `FinishRequestV1`, `RetentionProofV1`, and `CleanupReceiptV1` retain the first-blueprint closed fields and outcomes. `RecoverRequestV1.action` is closed over `inspect|resume_prelaunch|retain_abort|rotate_coordinator`. Integration records one output OID per produced OID in order; conflict records unchanged pre/post head, sorted nonempty conflict paths, no partial integration chain, and outcome `needs_user_action`.

### Lock graph

`WorkspaceLease` is acquired only while **none** of `RepositoryGate`, `FanoutCollectionLock`, `IntegrationQueueLock`, `RelayStoreLock`, or `WorkspaceJournalLock` is held. No short-lived lock may wait for it. After acquisition, custodians retain it while broker/integration/cleanup take short locks.

The only short-lived acquisition edges are:

```text
workspace integration: IntegrationQueueLock -> RepositoryGate -> RelayStoreLock -> WorkspaceJournalLock
legacy collect:         FanoutCollectionLock -> RepositoryGate -> RelayStoreLock
reserve/provision/
broker/cleanup:         RepositoryGate -> RelayStoreLock -> WorkspaceJournalLock
preservation Git:       RepositoryGate
```

Queue and Collection locks are never co-held. Store/Journal may not acquire Queue, Collection, or Gate. Release Store/Journal around Git subprocesses while retaining the outer Queue/Collection/Gate; reacquire only forward and CAS/revalidate before publication.

### Linux custody protocol and macOS negative encoding

Writable custody records may mint only `backend:"linux_cgroup_v2_pidfd"`. The `macos_pgroup_libproc` token is non-admissible and no live evidence may be emitted for it until the STOP is amended.

The coordinator locks the canonical lease, creates a private `AF_UNIX/SOCK_SEQPACKET|SOCK_CLOEXEC` pair and sealed 32-byte control-key memfd, then execs hidden guardian. Guardian inherits exactly lease/socket/key/journal-append FDs, creates/opens the session cgroup, execs hidden supervisor, and transfers duplicate lease, cgroup-directory, `cgroup.events`, and `cgroup.procs` FDs in one authenticated `SCM_RIGHTS` bootstrap packet. Supervisor alone creates the worker.

Every open uses `O_CLOEXEC`, every socket `SOCK_CLOEXEC`, and every receive `MSG_CMSG_CLOEXEC`. Clear CLOEXEC only for enumerated guardian/supervisor bootstrap inputs and restore it immediately. Before worker exec, close every FD except stdio, the CLOEXEC activation-barrier read end, and each held resource FD identified one-to-one by a validated `ResourceAllocationV1.env` entry named `DOCKS_RESOURCE_<UPPER_NAME>_FD` whose decimal value equals that FD. The broker is reached through `WorkerCapabilityV1.broker_socket` and is not inherited as an FD. Reject duplicate, unregistered, or extra inherited FDs. EOF before activation is failure.

Custody control packets are canonical JCS **without** a trailing LF, at most 16 KiB:

```text
{v:1,session_id,generation,sender:"guardian"|"supervisor",seq,kind,payload,mac}
mac = HMAC-SHA256(control_key, JCS(the same object without mac))
```

Per-sender sequence begins at 1 and increments exactly by one. Enable `SO_PASSCRED`; require exactly one `SCM_CREDENTIALS` with expected PID/EUID/GID and validate `/proc/<pid>/stat` start token. Reject duplicate/gap, malformed/unknown/truncated (`MSG_TRUNC`) packets, bad MAC, wrong credentials/PID, and wrong FD count/type as fatal.

Closed kinds are `BOOTSTRAP`, `GUARDIAN_READY`, `SUPERVISOR_READY`, `WORKER_PREPARED`, `ACTIVATE`, `ACTIVATED`, `HEARTBEAT`, `HEARTBEAT_ACK`, `QUIESCE`, `QUIESCED`, `TERMINATE`, `EMPTY`, `PREPARE_RELEASE`, `RELEASE_PREPARED`, `CLOSE_LEASE`, `LEASE_CLOSED`, `CLOSED_COMMITTED`, and `FAULT`. Every non-heartbeat command gets exactly one ACK carrying matching `ack_seq` and `status:"ok"|"fault"`; evidence ACKs carry the durable evidence SHA-256. Heartbeats are every 250 ms; three missed ACK deadlines (750 ms), EOF, peer exit, credential/start-token drift, malformed control, or unexpected membership fences the session.

Create one non-threaded leaf with no child cgroups. Prefer `clone3(CLONE_PIDFD|CLONE_INTO_CGROUP)`; fallback is fork with the child blocked before tool code, parent obtains pidfd, writes PID once to `cgroup.procs`, then reopens `/proc/<pid>/cgroup` and proves exact membership before progress. There is no best-effort move. In the single-threaded pre-exec child, require Landlock ABI >=3 and handle `EXECUTE,WRITE_FILE,READ_FILE,READ_DIR,REMOVE_DIR,REMOVE_FILE,MAKE_CHAR,MAKE_DIR,MAKE_REG,MAKE_SOCK,MAKE_FIFO,MAKE_BLOCK,MAKE_SYM,REFER,TRUNCATE`; grant write/create/remove/refer/truncate only under the opened workspace and allocated resources. Set `PR_SET_NO_NEW_PRIVS`, enforce, close rule FDs, then signal prepared.

`WORKER_PREPARED` requires exact root pidfd, cgroup membership, and sandbox-prepared byte. Guardian independently checks `cgroup.events` and `/proc/<pid>/cgroup` before ACKing `ACTIVATE`; supervisor writes `0x01`, proves exec via CLOEXEC EOF plus executable identity/start token, and sends `ACTIVATED`. Only then may `Ready -> Running` and worker mutation capabilities become visible.

Termination revokes Git/handback and closes broker acceptance first. Accepted handback drains the broker, revokes mutation, reaps worker root, and requires `populated 0`. Abort/crash requires mandatory `cgroup.kill`, recursive `populated 0`, and direct-child pidfd/waitid reap; `cgroup.procs` scans are diagnostic only. Guardian loss leaves supervisor fencing/retaining the lease; supervisor loss is symmetric; coordinator loss does not affect custody; dual-custodian loss requires explicit RepositoryGate-serialized authority+cgroup recovery and never automatic Running continuation.

Release order is exact: durable capability revocation; broker drain/close; durable `EMPTY`; retention/Git/resource cleanup; `PREPARE_RELEASE` with both ACKs; supervisor close/ACK; guardian last-close/`LEASE_CLOSED`; coordinator independently acquires the same OFD lock while RepositoryGate and authority exclusion remain held; journal/fsync `LeaseReleased` and `Closed` while that probe excludes a race; release probe; send `CLOSED_COMMITTED`; custodians exit; only then remove socket/key/cgroup-leaf files.

### Release evidence

`SourceCiReceiptV1`, `ProducerPreflightReceiptV1`, and `SessionRelayBinaryAttestationV1` remain byte-compatible and exact-key. Add native job/step-order verification and bump only verifier producer identity. Add no `PolicyBindingV1`, preflight V2, workspace review receipt, test-artifact field, generated binary, or SHA256SUMS commit.

## Steps

Each implementation row is one reviewable commit boundary unless splitting is required to keep a commit buildable; dependencies are strict. There is intentionally no release/version/publication step.

| # | Task | Files | Depends | Status | Done when / failure action |
|---|---|---|---|---|---|
| S0 | Preserve owner WIP and create the dedicated implementation worktree using the command above before any implementation edit. | N/A — precondition only; no repository file is created or modified by the plan implementation. | — | planned | **Done:** command exits 0, prints receipt hash, the post-creation source HEAD/status/index/tree comparison matches the original snapshot, the create-once preserve ref exists, and the applied WIP commit has parent `BASE` and tree `TREE`. **Failure:** stop before editing; retain `PRESERVE_DIR`/ref; never delete an ambiguous/dirty root or unreachable evidence. |
| S1 | Implement the sole workspace router, closed JCS+LF schema, authority/CAS, atomic coordinator bootstrap/rotation, capability auth, fixed state graph, and exact nine-command parsing without changing legacy dispatch. | **CREATE** `plugins/session-relay/rust/src/workspace.rs`<br>**CREATE** `plugins/session-relay/rust/src/workspace/schema.rs`<br>**CREATE** `plugins/session-relay/rust/src/workspace/authority.rs`<br>**CREATE** `plugins/session-relay/rust/src/workspace/capability.rs`<br>**MODIFY** `plugins/session-relay/rust/src/main.rs`<br>**MODIFY** `plugins/session-relay/rust/src/lib.rs`<br>**MODIFY** `plugins/session-relay/rust/src/sha256.rs` | S0 | planned | **Done:** canonical fixtures round-trip exactly; bad keys/case/nullability/digest/OID/state refuse; bootstrap race yields one generation-1 authority and deterministic loser guidance; all nine commands and actor/capability grammars parse; legacy verbs are unchanged. **Failure:** revert this commit only, retain S0 evidence, and stop rather than add alternate modules, env authority roots, owner/session-ID bypass, or noncanonical bytes. |
| S2 | Implement `RepositoryGateV1`, exact FD-to-mount-ID ext4 admission, managed-mode marker, SHA-1/SHA-256 identity, corrected short-lock graph, and one-way legacy fan-out exclusion. | **CREATE** `plugins/session-relay/rust/src/workspace/repository_gate.rs`<br>**CREATE** `plugins/session-relay/rust/src/workspace/git.rs`<br>**MODIFY** `plugins/session-relay/rust/src/fanout.rs`<br>**MODIFY** `plugins/session-relay/rust/src/fanout/authority.rs`<br>**MODIFY** `plugins/session-relay/rust/src/fanout/git.rs`<br>**MODIFY** `plugins/session-relay/rust/tests/fanout.rs` | S1 | planned | **Done:** workspace and fan-out operations contend on the same persistent gate; permitted acquisition graphs and forbidden reverse edges are process-tested; exact mountinfo `ext4` and 40/64 OID behavior pass; mixed mode refuses before Git/store mutation; legacy grammar/cap/topology remain unchanged. **Failure:** RepositoryGate contention beyond three seconds refuses without authority, store, Git, ref, worktree, or resource mutation. Keep workspace start disabled; never accept marker-only enforcement, old binaries, ext-family magic, or Gate→WorkspaceLease. |
| S3 | Implement future `workspace preserve`, deterministic provision, actual private-Git-dir discovery, lifetime-lease acquisition with no short locks held, deliberate commit/artifact WIP application, worker capability publication, Git broker/shim, claims admission, and handback diff parsing. | **MODIFY** `plugins/session-relay/rust/src/workspace.rs`<br>**MODIFY** `plugins/session-relay/rust/src/workspace/schema.rs`<br>**MODIFY** `plugins/session-relay/rust/src/workspace/authority.rs`<br>**MODIFY** `plugins/session-relay/rust/src/workspace/capability.rs`<br>**MODIFY** `plugins/session-relay/rust/src/workspace/git.rs`<br>**MODIFY** `plugins/session-relay/rust/src/workspace/repository_gate.rs` | S2 | planned | **Done:** both preservation modes hash/read back exactly without source mutation; root/ref are deterministic and collision-refusing; lease is acquired only after short locks release; even clean WIP is produced element zero; broker mutates only the owned branch; absolute Git bypass is denied; rename/copy source and destination claims are checked. **Failure:** retain preserve/session evidence at the last durable prelaunch state and disable launch; never suffix, force, clean, delete a WIP ref, or infer provenance. |
| S4 | Implement the exact Linux guardian/supervisor custody protocol, WorkerTree lifecycle consumers, activation barrier, cgroup-v2/pidfd/Landlock containment, crash fencing, empty proof, and close/probe/Closed handshake. Keep macOS as an exact negative adapter. | **CREATE** `plugins/session-relay/rust/src/workspace/custody.rs`<br>**CREATE** `plugins/session-relay/rust/src/workspace/platform.rs`<br>**CREATE** `plugins/session-relay/rust/src/workspace/platform/linux.rs`<br>**CREATE** `plugins/session-relay/rust/src/workspace/platform/macos.rs`<br>**MODIFY** `plugins/session-relay/rust/src/lifecycle.rs`<br>**MODIFY** `plugins/session-relay/rust/src/supervisor.rs`<br>**MODIFY** `plugins/session-relay/rust/src/hook.rs` | S3 | planned | **Done:** exact packet/FD/credential/sequence/ACK rejection passes; no worker/grandchild inherits custody FDs; no tool byte precedes `ACTIVATED`; clone3 and forced fork paths prove membership; hostile Linux descendants cannot outlive `EMPTY`; one custodian survives peer loss with lease; release probe excludes a new writer through Closed; macOS returns the frozen STOP. **Failure:** revoke, fence/kill, retain surviving lease, journal fault evidence, require recover/abort; never use current ProcessOnly enums as proof, PID scans, newline streams, path reconnection, optional ACKs, or macOS degradation. |
| S5 | Implement exact path defaults/overrides, all six resource decisions and receipts, held-FD ports, private directories, pinned database provider, Claude/Codex/OMP adapters, and refusal of unsupported spawn/wake/attach/watch/app-server mutation paths. | **CREATE** `plugins/session-relay/rust/src/workspace/resources.rs`<br>**MODIFY** `plugins/session-relay/rust/src/workspace/authority.rs`<br>**MODIFY** `plugins/session-relay/rust/src/workspace.rs`<br>**MODIFY** `plugins/session-relay/rust/src/spawn.rs`<br>**MODIFY** `plugins/session-relay/rust/src/cli.rs`<br>**MODIFY** `plugins/session-relay/rust/src/watch.rs`<br>**MODIFY** `plugins/session-relay/rust/src/appserver.rs`<br>**MODIFY** `plugins/session-relay/rust/src/hook.rs` | S4 | planned | **Done:** every request decides all six kinds; collisions/provider drift/descriptor-handshake loss refuse; allocations are distinct/receipted/idempotently releasable; claims enforce exact defaults/prefix/atomic-replacement rules; supported mutation entrypoints are contained or refused while read-only/bus/legacy behavior remains. **Failure:** inspect-then-delete only proven allocations; retain ambiguous resources/state; never use a numeric port race, shared directory/app-server, unregistered provider, or prompt-only enforcement. |
| S6 | Complete handback quiescence, ordered integration/rejection, conflict rollback, explicit recovery/rotation, retention, abort, cleanup, capability revocation, resource release, actual lease close, and terminal Closed. | **MODIFY** `plugins/session-relay/rust/src/workspace.rs`<br>**MODIFY** `plugins/session-relay/rust/src/workspace/schema.rs`<br>**MODIFY** `plugins/session-relay/rust/src/workspace/authority.rs`<br>**MODIFY** `plugins/session-relay/rust/src/workspace/capability.rs`<br>**MODIFY** `plugins/session-relay/rust/src/workspace/git.rs`<br>**MODIFY** `plugins/session-relay/rust/src/workspace/custody.rs`<br>**MODIFY** `plugins/session-relay/rust/src/workspace/resources.rs`<br>**MODIFY** `plugins/session-relay/rust/src/workspace/repository_gate.rs` | S5 | planned | **Done:** every actor/state transition is authenticated and durable; conflict restores exact clean pre-head and settles once; no recovery invents proof; dirty/unintegrated work is retained; lease stays contended through empty/cleanup, then closes/probes before Closed; Closed is terminal. **Failure:** remain in the last durable state, retain branch/root/resources/lock/recovery surfaces, and never auto-retry IntegrationBlocked, invoke plan review, force cleanup, or declare Closed. |
| S7 | Add the four exact Rust targets/support, workspace smoke, inventory/reentry fixtures, legacy fan-out coverage, silent single-session compatibility, all A1-A17 owners, WIP/order/object-format/bootstrap/recovery cases, exact Linux custody cases, and macOS negative admission. | **CREATE** `plugins/session-relay/rust/tests/workspace_identity.rs`<br>**CREATE** `plugins/session-relay/rust/tests/workspace_lease_process.rs`<br>**CREATE** `plugins/session-relay/rust/tests/workspace_coordination_process.rs`<br>**CREATE** `plugins/session-relay/rust/tests/workspace_resources.rs`<br>**CREATE** `plugins/session-relay/rust/tests/support/workspace.rs`<br>**CREATE** `plugins/session-relay/test/workspace-smoke.mjs`<br>**MODIFY** `plugins/session-relay/rust/tests/support/mod.rs`<br>**MODIFY** `plugins/session-relay/rust/tests/fanout.rs`<br>**MODIFY** `plugins/session-relay/test/rust-test-inventory.mjs`<br>**MODIFY** `plugins/session-relay/test/fixtures/rust-test-inventory.json`<br>**MODIFY** `plugins/session-relay/test/reentry-inventory.mjs`<br>**MODIFY** `plugins/session-relay/test/fixtures/reentry-inventory.json`<br>**MODIFY** `plugins/session-relay/test/selftest.mjs`<br>**MODIFY** `plugins/session-relay/test/distribution-contract.mjs` | S6 | planned | **Done:** every target has a nonzero exact set, zero ignored/filtered tests, A1-A17 each has one owner, process tests use real subprocesses, custody rejects every malformed frame/FD/ACK case, Linux hostile fork/crash/release-order cases pass, macOS asserts the exact STOP, and jobs 1/4 preserve byte-identical 133-label output. **Failure:** fix implementation; never suppress/skip, rename independently of fixtures, count mocks/cross-builds as native custody, or change the canonical selftest hash to hide drift. |
| S8 | Document Relay workspace UX, all commands/actors, preservation, lease inspection, crash recovery, handback/integration, read-only coexistence, resources, clone-vs-worktree, managed/unmanaged boundary, Linux support, macOS STOP, and six precedents. | **CREATE** `plugins/session-relay/skills/productivity/session-relay/references/workspace.md`<br>**MODIFY** `plugins/session-relay/skills/productivity/session-relay/SKILL.md`<br>**MODIFY** `plugins/session-relay/AGENTS.md`<br>**MODIFY** `AGENTS.md` | S7 | planned | **Done:** semantic docs smoke agrees with runtime help and contains every required topic/refusal/precedent; it contains no `docks session`, `spawn --workspace`, direct-writer guarantee, macOS support claim, or review binding. **Failure:** keep docs unadvertised and repair runtime/prose drift rather than documenting nonexistent enforcement. |
| S9 | Make the registry-driven source gate build once, run every exact inventory/process/smoke contract with the explicit fresh binary, provision/clean Linux test delegation, and recursively guard new process/Git sites. | **MODIFY** `scripts/lib/plugins.mjs`<br>**MODIFY** `scripts/ci.mjs`<br>**MODIFY** `.github/workflows/ci.yml`<br>**MODIFY** `plugins/session-relay/test/rust-test-inventory.mjs`<br>**MODIFY** `plugins/session-relay/test/reentry-inventory.mjs` | S7, S8 | planned | **Done:** `node scripts/ci.mjs --plugin session-relay` builds once and runs all exact Rust/process/smoke contracts against that binary; Linux delegation is owned and cleaned; no ambient/committed binary or hidden skip is accepted. **Failure:** keep release readiness blocked; never make containment optional/continue-on-error or substitute host cross-build evidence. |
| S10 | Wire native producer/preflight evidence while retaining unchanged V1 receipt shapes: Linux positive custody, macOS exact negative admission, ordered fresh-binary smoke, job/runner/step verification, and fixture rejection. This is evidence preparation, not release. | **MODIFY** `.github/workflows/build-binaries.yml`<br>**MODIFY** `.github/workflows/ci.yml`<br>**MODIFY** `.github/AGENTS.md`<br>**MODIFY** `scripts/AGENTS.md`<br>**MODIFY** `scripts/verify-session-relay-preflight.mjs`<br>**MODIFY** `plugins/session-relay/test/release-evidence-contract.mjs` | S9 | planned | **Done:** Linux native legs run positive custody and explicit-target smoke before unchanged attestation/upload; macOS legs run the frozen refusal and cannot be represented as production custody; verifier rejects missing/reordered/skipped/cross-built evidence and keeps exact V1 keys while managed-workspace release remains STOPPED. **Failure:** stop release readiness; if closed V1 consumers require key/inventory change, amend and independently review before any version bump. Do not dispatch publication. |

Future Docks workspace-isolation policy is a separate canonical plan, gated on an independently reviewed stable Relay release and the resolution of the macOS release STOP; this plan creates or advertises no Docks workspace-isolation skill.

## Out of scope / do-NOT-touch

- Do not control, kill, or claim guarantees for arbitrary unmanaged same-UID shells, IDEs, raw Git, or independently launched Claude/Codex/OMP.
- Do not add a `docks` executable, `docks session`, `spawn --workspace`, OMP worktree integration, or a replacement Relay fan-out API.
- Do not support Windows, containers/overlayfs, NFS/SMB/FUSE, network/cloud/removable filesystems, cross-UID/shared-service workspaces, or remote `WorkspaceV1` workers.
- Do not implement macOS process-group/kqueue/libproc custody. `workspace/platform/macos.rs` is a frozen refusal until a durable public primitive exists and passes hostile native tests.
- Do not add automatic conflict resolution, IntegrationBlocked retry, workspace-triggered plan review/repair, `PolicyBindingV1`, or any schema-6 review/lifecycle change.
- Do not enable shared Codex app-server writing or mutation-capable wake/attach/watch reentry without full WorkerTree custody.
- Do not add Supabase preview branches or provider kinds beyond `port,temp_dir,build_dir,database_schema,log_dir,cache_dir`.
- Do not commit generated binaries/SHA256SUMS, accept ambient binaries as evidence, alter V1 release receipt/attestation properties, bump versions, publish assets, promote a release, sync manifests/catalogs, or release Relay/Docks.
- Do not delete/force-update ambiguous WIP refs, retained branches/bundles, dirty worktrees, provider allocations, or old-binary surfaces.
- Do not change unrelated plugins, plan-manager/reviewer/repairer schemas, canonical review evidence, lifecycle files, or the plan itself during implementation.

## Known gotchas

- Workspace record files are JCS+one-LF; custody control packets are JCS with **no** LF; broker envelopes remain JCS+LF. Mixing the framing contracts is a fatal protocol defect.
- `WorkspaceLease` is lifetime-held and outside the short-lock graph. The old proposed total order is impossible and must not appear in code/comments/tests.
- `EXT4_SUPER_MAGIC` and `stat -f -c %T` text are not authoritative ext4 evidence; ext2/ext3 share the magic. Use FD `STATX_MNT_ID` and exact mountinfo type `ext4` for every authoritative/storage FD.
- Git may numerically suffix its private administrative worktree directory. The user-visible workspace root and branch never get a suffix; discover/reopen the private Git directory after creation.
- A clean source still produces an empty applied-WIP commit at produced/integration index zero. Do not optimize it away.
- The generated Git shim cannot stop `/usr/bin/git`; Landlock/common-dir write denial is the enforcement boundary.
- File claims do not safely permit atomic replacement without an exclusive parent-directory claim. Nonexistent paths require the exclusive nearest-existing ancestor.
- First-start omission of the coordinator capability is one atomic bootstrap exception, not an owner shortcut. Once authority exists, omission only reports the deterministic current path and mutates nothing.
- Old Relay and arbitrary same-UID Git can ignore advisory flock. The marker is diagnostic/cutover state, not retroactive enforcement.
- Worker exit is not handback. Without an accepted capability-bound handback, remain Running/faulted, revoke mutation, prove empty, and require explicit retain-abort.
- `IntegrationBlocked` is terminal for that session's integration attempt; no retry, review, or repair loop may move it back.
- `cgroup.procs` enumeration is diagnostic. Only mandatory `cgroup.kill` and recursive `cgroup.events populated 0` establish kill/empty proof.
- The worker receives no custody/lease/key/cgroup/pidfd/journal/authority FD. Descriptor inventory must include grandchildren.
- `Closed` is not cleanup intent. It follows revocation, broker drain, empty proof, retention/Git/resource cleanup, both custodian closes, an independent successful lease probe, and durable journaling while exclusion remains held.
- The macOS test name/target inventory remains frozen even though its expected behavior is negative admission; never relabel a process-group/libproc smoke as support.
- Top-level legacy `handback` and `workspace handback` are distinct existing/new routes; preserve the former's grammar and semantics.

## Global constraints

- Canonical plan metadata is `status: planned`; creation parent is `fc466f5a5784bb434108928d69aadef4877a6f5a`; created and updated are both `2026-07-21T20:58:22-03:00`.
- This plan is the sole implementation baseline. Its embedded interfaces, state machine, lock graph, platform gates, capability bootstrap, and custody protocol are normative; scratch research artifacts are not execution inputs.
- Public workspace commands are exactly nine; legacy top-level commands remain backward-compatible.
- Session Relay owns all runtime authority. Docks owns policy/guidance and unchanged schema-6. Worker tools are untrusted.
- Production roots come from `getpwuid_r(euid)`. Directories are EUID-owned 0700; regular JSON/receipt/metadata/lock files are EUID-owned, nlink 1, 0600; components are opened relative to trusted FDs without symlink traversal.
- Linux is the only currently implementable custody backend. macOS/APFS managed-writing implementation and cross-platform release are explicit STOPs.
- No worker bytes or mutation capability may become visible before durable `WipApplied` and `ACTIVATED` evidence.
- Every destructive Git/resource/cleanup action revalidates repository/worktree/capability/lease identity and is create-once, CAS-bound, or idempotent with durable evidence.
- Existing `SourceCiReceiptV1`, `ProducerPreflightReceiptV1`, and `SessionRelayBinaryAttestationV1` shapes remain unchanged.
- This is a comprehensive cold handoff, not implementation, a review request/receipt, or a release procedure. No open human questions remain.

## STOP conditions

1. **Initial custody of work:** stop before any implementation edit unless S0 preserves current bytes, retains the full ref/receipt, creates the dedicated branch/worktree, deliberately applies WIP, proves the post-creation source HEAD/index/status/tree unchanged, and verifies the applied WIP commit has parent `BASE` and tree `TREE`.
2. **Authority/identity:** stop if authority/common-Git/integration/workspace components cannot be no-follow opened and validated for EUID, type, mode, link count, stable device/inode, and supported object format.
3. **Exact Linux filesystem:** stop unless every authority/storage FD maps via `statx(...STATX_MNT_ID)` to a consistent `/proc/self/mountinfo` entry whose filesystem type is literal `ext4`. Never fall back to magic, path prefixes, `/proc/mounts`, or generic local-filesystem checks.
4. **Linux custody prerequisites:** stop before worker exec if delegation is absent/movable/unowned, leaf is threaded, `cgroup.kill` or recursive `populated` is absent, pidfd/membership is unverifiable, Landlock ABI <3/right insertion/restriction fails, or the activation barrier is ambiguous.
5. **Custody protocol:** stop on any FD, credential, MAC, sequence, ACK, PID/start-token, heartbeat, cgroup, barrier, sandbox, or empty-proof ambiguity. Revoke capability, fence/kill, retain the surviving lease, journal evidence, and require explicit recover/abort.
6. **Forbidden custody shortcuts:** stop if implementation uses `SOCK_STREAM`/newline control, path reconnection, PID-only identity, worker-inherited custody FDs, optional/implicit ACKs, PID enumeration as empty proof, or journals Closed before proving the last lifetime reference closed.
7. **macOS:** stop macOS managed-workspace activation and cross-platform managed-workspace release until a documented public kernel containment primitive provides non-escapable descendant membership plus atomic kill/empty proof across custodian crashes and passes native hostile fork/setsid/orphan/dual-crash tests. A successful cross-build or libproc scan is not evidence.
8. **Coordinator secret/bootstrap:** stop rather than rebootstrap or use owner/session identity when the current coordinator secret is missing/corrupt. Stop on create-once/fsync/nofollow/peer-credential/HMAC failure.
9. **Locking:** stop any acquisition that creates Store/Journal→Gate, Gate→Queue, Gate→Collection, or Gate→WorkspaceLease. Never block in a forbidden direction.
10. **Cross-mode:** stop workspace and legacy shared-ref mutation when an old Relay/live fan-out process may bypass `RepositoryGateV1`, when any active legacy record is nonterminal at bootstrap, or when workspace authority/marker already exists for a new fan-out mutation.
11. **Pre-mutation validation:** stop before Git/resource mutation on noncanonical request/receipt bytes, digest mismatch, identity or mount drift, dirty integration root, branch/base/head drift, claim overlap, provider drift/failure, stale/revoked capability, or unverifiable live lease.
12. **Partial publication/provenance:** stop and retain the last durable state/work on ambiguity after authority, marker, branch/root, WIP CAS, handback, integration abort, recovery, retention, cleanup, or lease publication. Never suffix, force/reset/remove, or declare Closed.
13. **Integration conflict:** stop same-session integration at `IntegrationBlocked/needs_user_action`; do not retry, auto-resolve, dispatch plan review/repair, or change input under the same session.
14. **Cleanup/release of lease:** remain Releasing if capability revocation, broker drain, `EMPTY`, retention, resource deletion, worktree/ref state, both custodian closes, or independent lease acquisition cannot be proven. Do not write Closed.
15. **Evidence:** stop release readiness if any required exact inventory/process/smoke case fails, is ignored/filtered, uses an ambient binary, jobs 1/4 differ, native evidence is cross-built, step order is wrong, or unchanged V1 consumers cannot accept verifier-side job checks.
16. **No release:** do not version, publish, promote, install as plan activity, or advertise managed workspaces. This plan has no release step; macOS currently keeps release stopped.
17. **Boundary honesty:** stop any Docks/Relay docs or UX that claim control of arbitrary unmanaged same-UID shells, Git, Claude, Codex, or OMP.

## Acceptance criteria

These commands are future implementation checks, executed in order from the repository root unless a command changes directory. Run A1-A22 and A24-A34, in order, on the native Linux/ext4 implementation runner. Run A23 and A35, in order, on a native macOS 15/APFS runner at the same tested commit. A27 produces the explicit binary consumed by A28-A29. A passing Linux implementation is not release authorization: macOS managed-workspace support and the cross-platform Session Relay/Docks release remain stopped by A23 and A35.

| ID | Command | Expected |
|---|---|---|
| A1 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_lease_process two_writers_same_worktree_exactly_one_lease -- --exact --nocapture` | Attachment test 1: two real processes race for one securely reopened canonical worktree identity; exactly one reaches `LeaseHeld`, and the loser hard-refuses with `Workspace already owned by session <session-id>. Open a separate worktree or continue in read-only mode.` |
| A2 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_lease_process separate_worktrees_both_hold_leases -- --exact --nocapture` | Two real workspace workers reach `Running` concurrently in distinct deterministic roots/branches, each commits a different claimed file through its own broker while both are live, neither can observe or mutate the other root/index/ref/resource allocation, and both produce accepted handbacks while retaining independent lifetime leases. |
| A3 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_lease_process read_only_spawn_coexists_with_writer -- --exact --nocapture` | Attachment test 3: a Relay-launched read-only process coexists with the writer and cannot mutate the writer worktree. |
| A4 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_lease_process crashed_writer_recovers_only_after_empty_proof -- --exact --nocapture` | Attachment test 4: custodian failure revokes capabilities, kills the Linux cgroup when activated, proves recursive `populated 0`, retains the surviving lease reference, and permits only explicit recovery; no stale or prematurely released lock remains. |
| A5 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_identity symlink_relative_case_aliases_share_one_identity -- --exact --nocapture` | Attachment test 5: every supported symlink, relative-path, and case alias resolves to the same opened EUID/device/inode identity and cannot obtain a second lease. |
| A6 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_coordination_process unexpected_branch_switch_is_refused -- --exact --nocapture` | Attachment test 6: the Git broker and handback path reject an unexpected symbolic-branch change before state, object, index, or shared-ref mutation. |
| A7 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_identity unexpected_head_or_base_drift_is_refused -- --exact --nocapture` | Attachment test 7: exact HEAD, base, object-format, and ancestry drift is detected and no journal or Git mutation follows. |
| A8 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_identity unowned_dirty_path_blocks_handback -- --exact --nocapture` | Attachment test 8: clean/index checks and exact NUL-delimited rename/copy endpoint parsing reject every dirty path outside the admitted claims. |
| A9 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_lease_process worker_merge_rebase_reset_and_force_push_are_refused -- --exact --nocapture` | Attachment test 9: merge, rebase, reset, force-push, every other forbidden mutator, and absolute-real-Git bypass fail, while the closed broker still permits an owned commit. |
| A10 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_coordination_process overlapping_path_claims_are_atomic_and_refused -- --exact --nocapture` | Attachment test 10: simultaneous overlapping file, directory, prefix, case-alias, and coordinator-default claims yield one atomic winner and no partial claim. |
| A11 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_coordination_process coordinator_integrates_commits_serially -- --exact --nocapture` | Attachment test 11: the coordinator alone advances one integration queue, imports each worker chain oldest-first, and preserves `applied_wip_commit` at index zero. |
| A12 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_coordination_process conflicting_commits_settle_once_needs_user_action -- --exact --nocapture` | Attachment test 12: a conflict restores the exact clean pre-integration HEAD/index/tree, records no partial integration chain, settles as `IntegrationBlocked`/`needs_user_action`, and refuses same-session automatic retry. |
| A13 | `DOCKS_REVIEW_POLICY_ORCHESTRATION_ORACLE=1 DOCKS_REVIEW_POLICY_ORCHESTRATION_FIXTURE_NAMESPACE="$(node -e 'console.log(require("node:crypto").randomUUID())')" node scripts/tests/plan-review-policy-regressions.mjs --orchestration-oracle` | Attachment test 13: the existing schema-6 process oracle proves one full review, at most one changed-input repair round, and repeated/no-progress settlement to `NeedsUserAction`; Session Relay adds no review schema, `PolicyBindingV1`, or automatic review dispatch. |
| A14 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_resources all_six_resource_kinds_are_isolated_and_receipted -- --exact --nocapture` | Attachment test 14: `port,temp_dir,build_dir,database_schema,log_dir,cache_dir` decisions are complete, distinct, projected, durable, inspectable, and idempotently released; held-port FD and provider-digest handshakes are real. |
| A15 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_coordination_process cleanup_refuses_dirty_or_unretained_work -- --exact --nocapture` | Attachment test 15: `finish`/`abort` retains dirty, unintegrated, identity-ambiguous, or unreceipted work and refuses `Closed` without custody, resource, retention, Git, and lease-close proof. |
| A16 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_identity integration_checkout_refuses_supported_writer -- --exact --nocapture` | Attachment test 16: Relay/Docks-supported writing in the integration checkout hard-refuses with the exact workspace-start remedy; no claim is made about arbitrary unmanaged same-UID shells. |
| A17 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_identity failed_preflight_or_lease_changes_no_source_bytes -- --exact --nocapture` | Attachment test 17: invalid preserve receipt, repository/platform admission, coordinator or worker capability, and losing-lease paths leave source HEAD, index, worktree bytes, refs, authority state, and resources unchanged. |
| A18 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_identity preserve_commit_mode_uses_temp_index_ref_and_no_source_mutation -- --exact --nocapture` | Commit-mode WIP uses a temporary index, `read-tree`/`add -A`/`write-tree`, `commit-tree`, and a create-once full preserve ref; exact before/after source snapshots match and the receipt hashes verify. |
| A19 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_identity preserve_artifact_mode_round_trips_binary_and_untracked_pax -- --exact --nocapture` | Artifact-mode WIP round-trips the full-index binary diff, NUL inventory, and PAX archive; traversal, duplicate/type/hash drift, unsafe symlinks, hard links, devices, FIFOs, and sockets refuse. |
| A20 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_coordination_process applied_wip_is_first_produced_and_integrated_commit -- --exact --nocapture` | Commit, artifact, and clean preservation each create exactly one applied-WIP commit before worker execution; `worker_base`, `produced_commits[0]`, and `integration_commits[0]` preserve that ordering. |
| A21 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_coordination_process workspace_and_legacy_fanout_share_repository_gate -- --exact --nocapture` | Workspace preserve/provision/broker/integrate/cleanup and legacy fanout prepare/handback/collect share the persistent repository gate. The test proves the corrected short-lock graphs, forbids every reverse edge and every `Gate -> WorkspaceLease` wait, and refuses mixed/old mode before mutation without changing legacy public semantics. |
| A22 | `set -euo pipefail && test "$(uname -s)" = Linux && CURRENT_CGROUP="$(sed -n 's/^0:://p' /proc/self/cgroup)" && test -n "$CURRENT_CGROUP" && CGROUP="/sys/fs/cgroup${CURRENT_CGROUP%/}/session-relay-test-$(id -u)-$$" && trap 'sudo rmdir "$CGROUP" 2>/dev/null \|\| true' EXIT && sudo mkdir "$CGROUP" && sudo chown "$(id -u):$(id -g)" "$CGROUP" && sudo -n chown "$(id -u):$(id -g)" "$CGROUP/cgroup.procs" "$CGROUP/cgroup.threads" "$CGROUP/cgroup.subtree_control" && (test_pid=$BASHPID && sudo -n tee "$CGROUP/cgroup.procs" >/dev/null <<<"$test_pid" && SESSION_RELAY_TEST_BIN="$RUNNER_TEMP/session-relay/$TARGET/$ASSET_NAME" SESSION_RELAY_TEST_CGROUP_ROOT="$CGROUP" cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --test workspace_lease_process linux_cgroup_pidfd_guardian_kills_hostile_descendants -- --exact --nocapture) && sudo -n rmdir "$CGROUP"` | On a native official Linux/ext4 runner, every opened authority/common-Git/integration/workspace FD maps by `statx(..., STATX_MNT_ID)` to a `/proc/self/mountinfo` record whose literal filesystem type is `ext4`; ext2/ext3 sharing `0xEF53` is rejected. The real delegated non-threaded cgroup-v2 leaf, mandatory `cgroup.kill`, recursive `cgroup.events populated 0`, pidfds, Landlock ABI >=3, authenticated `SOCK_SEQPACKET` custody, activation barrier, no worker custody-FD inheritance, hostile fork/session changes, guardian/supervisor loss, and post-close independent lease probe all pass. |
| A23 | `set -euo pipefail && test "$(uname -s)" = Darwin && PRODUCT_VERSION="$(sw_vers -productVersion)" && test "${PRODUCT_VERSION%%.*}" -ge 15 && filesystem_device="$(df -P . \| awk 'END { print $1 }')" && test -n "$filesystem_device" && filesystem_info="$RUNNER_TEMP/session-relay-filesystem-$TARGET.plist" && diskutil info -plist "$filesystem_device" > "$filesystem_info" && filesystem_type="$(/usr/libexec/PlistBuddy -c 'Print :FilesystemType' "$filesystem_info")" && rm -f "$filesystem_info" && echo "workspace filesystem: $filesystem_device ($filesystem_type)" && test "$filesystem_type" = apfs && cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --test workspace_lease_process macos_process_group_recursive_guardian_kills_hostile_descendants -- --exact --nocapture` | This is a native negative-admission test, not positive custody evidence: `macos_pgroup_libproc` remains inactive and returns the frozen STOP reason because process groups are escapable, kqueue is PID observation rather than durable containment, and no documented public primitive provides crash-durable descendant membership plus atomic kill/empty proof. |
| A24 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_identity sha1_and_sha256_object_formats_validate_reported_oid_width -- --exact --nocapture` | Repositories initialized as SHA-1 and with `git init --object-format=sha256` accept only the repository-reported 40/64-character lowercase OID width through preserve, broker, handback, and integration. |
| A25 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_coordination_process coordinator_bootstrap_worker_scope_and_replay_are_closed -- --exact --nocapture` | Under RepositoryGate, exactly one first `start` atomically publishes generation 1 and the deterministic coordinator-capability path; the racing loser mutates nothing and names that path. Later routes require the current exact capability; UUID/path possession, copied/stale/revoked generations, wrong actions, and changed replay refuse, while identical replay is byte-stable. |
| A26 | `cd plugins/session-relay/rust && cargo test --locked --test workspace_coordination_process recovery_matrix_has_no_unproven_progress -- --exact --nocapture` | Every nonterminal state, partial bootstrap/publication cut, capability generation, and guardian/supervisor/coordinator crash has one explicit resume, retain, or refuse outcome; missing current coordinator secret, `IntegrationBlocked`, ambiguous cgroup/identity, and ambiguous last-close evidence never auto-progress. |
| A27 | `set -euo pipefail && cargo +1.85.0 build --manifest-path plugins/session-relay/rust/Cargo.toml --release --locked && BIN="$PWD/plugins/session-relay/rust/target/release/relay" && OUT="$(mktemp -d "${TMPDIR:-/tmp}/relay-selftest-parity.XXXXXX")" && trap 'rm -rf "$OUT"' EXIT && SESSION_RELAY_TEST_BIN="$BIN" SESSION_RELAY_TEST_JOBS=1 node plugins/session-relay/test/selftest.mjs >"$OUT/jobs1" && SESSION_RELAY_TEST_BIN="$BIN" SESSION_RELAY_TEST_JOBS=4 node plugins/session-relay/test/selftest.mjs >"$OUT/jobs4" && cmp "$OUT/jobs1" "$OUT/jobs4"` | The fresh release binary succeeds with jobs 1 and 4 and preserves byte-identical existing 133-label stdout; no ambient binary or ignored `--jobs` pseudo-argument is accepted. |
| A28 | `set -euo pipefail && BIN="$PWD/plugins/session-relay/rust/target/release/relay" && test -x "$BIN" && node plugins/session-relay/test/workspace-smoke.mjs --case single-session-compat --bin "$BIN"` | Existing ordinary spawn/bus behavior and top-level `spawn`, `handback`, `collect`, `spawn --fanout`, and `spawn --worktree` grammar/semantics remain unchanged; there is no Docks executable, `docks session`, or `spawn --workspace`. |
| A29 | `set -euo pipefail && BIN="$PWD/plugins/session-relay/rust/target/release/relay" && test -x "$BIN" && node plugins/session-relay/test/workspace-smoke.mjs --case docs-contract --bin "$BIN"` | Runtime help and shipped Relay documentation agree on all nine `session-relay workspace preserve\|start\|list\|inspect\|handback\|integrate\|recover\|finish\|abort` commands and actors; separate-checkout rationale, automatic allocation, active session/lease inspection, crash recovery, commit integration, read-only operation, external resources, clone-versus-worktree guidance, the managed/unmanaged boundary, Linux support, the macOS STOP, and all six precedent links are present. |
| A30 | `node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_identity && node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_lease_process && node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_coordination_process && node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_resources && node plugins/session-relay/test/reentry-inventory.mjs` | All four exact Rust target inventories execute nonempty frozen sets with zero ignored/filtered cases. Every nested process birth, FD transfer, signal, broker, Git mutation, filesystem probe, and platform operation is classified; attachment tests 1–17 have exactly one matrix owner. |
| A31 | `node scripts/ci.mjs --plugin session-relay` | The authoritative Relay-focused gate builds one fresh explicit binary and runs format/clippy, legacy contracts, all four Rust inventories, process/smoke/reentry checks, unchanged V1 release contracts, and selftest. Linux prerequisites fail closed rather than skip; macOS remains a tested refusal, not a mocked pass. |
| A32 | `node plugins/session-relay/test/release-evidence-contract.mjs` | Fixtures preserve the exact keys and inventories of `SourceCiReceiptV1`, `ProducerPreflightReceiptV1`, and `SessionRelayBinaryAttestationV1`, reject missing/reordered/non-success native evidence, and reject any attestation, upload, publication, or promotion that represents the stopped macOS backend as supported. Only verifier producer identity may change. |
| A33 | `set -euo pipefail && test ! -e plugins/docks/skills/productivity/workspace-isolation && node scripts/skills/guard.mjs plugins/docks/skills && node scripts/skills/content-hash.mjs --check-only plugins/docks/skills && node scripts/ci.mjs --plugin docks` | The Docks-focused gates remain green while schema-6 contracts stay byte-compatible. Until the macOS STOP is resolved and a stable Relay is independently released/installed, no workspace-isolation skill, README advertisement, manifest promotion, or catalog promotion is accepted. |
| A34 | `node scripts/ci.mjs` | Full repository CI passes on the reviewed Linux-capable implementation commit, including the Relay and unchanged Docks plugin gates; this is source quality evidence only and does not override the release STOP. |
| A35 | `set -euo pipefail && test "$(uname -s)" = Darwin && PRODUCT_VERSION="$(sw_vers -productVersion)" && test "${PRODUCT_VERSION%%.*}" -ge 15 && filesystem_device="$(df -P . \| awk 'END { print $1 }')" && test -n "$filesystem_device" && filesystem_info="$RUNNER_TEMP/session-relay-filesystem-$TARGET.plist" && diskutil info -plist "$filesystem_device" > "$filesystem_info" && filesystem_type="$(/usr/libexec/PlistBuddy -c 'Print :FilesystemType' "$filesystem_info")" && rm -f "$filesystem_info" && echo "workspace filesystem: $filesystem_device ($filesystem_type)" && test "$filesystem_type" = apfs && cargo test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --test workspace_lease_process macos_process_group_recursive_guardian_kills_hostile_descendants -- --exact --nocapture && node plugins/session-relay/test/release-evidence-contract.mjs` | Explicit release refusal: both checks pass only by proving the exact macOS admission STOP and rejecting release evidence/publication. Do not dispatch `build-binaries.yml`, create source/preflight receipts for release, version/promote Relay, run `docks-kit sync` as release proof, or land/advertise Docks policy. Release work resumes only after the canonical plan is amended and independently reviewed with a documented durable descendant-containment primitive that passes native hostile-process and custodian-crash tests, or with an explicitly reviewed scope change dropping macOS managed writing. |

## Attachment requirement matrix

Each attachment test has one—and only one—observable test owner. `workspace_lease_process`, `workspace_identity`, `workspace_coordination_process`, and `workspace_resources` are the four exact Rust targets; test 13 intentionally remains the existing schema-6 Node process oracle because Session Relay does not own review semantics.

| Attachment test | Exact proposed test owner | Acceptance | One-to-one proof |
|---:|---|---|---|
| 1 | `workspace_lease_process::two_writers_same_worktree_exactly_one_lease` | A1 | One canonical worktree, two real writer processes, one lease winner. |
| 2 | `workspace_lease_process::separate_worktrees_both_hold_leases` | A2 | Two live workers in distinct opened worktree identities commit different claimed files through independent brokers and produce accepted handbacks while retaining separate lifetime leases. |
| 3 | `workspace_lease_process::read_only_spawn_coexists_with_writer` | A3 | Read-only process coexists without mutation authority. |
| 4 | `workspace_lease_process::crashed_writer_recovers_only_after_empty_proof` | A4 | Crash recovery requires retained custody and authoritative empty proof. |
| 5 | `workspace_identity::symlink_relative_case_aliases_share_one_identity` | A5 | Supported aliases cannot mint a second identity or lease. |
| 6 | `workspace_coordination_process::unexpected_branch_switch_is_refused` | A6 | Branch drift refuses before mutation. |
| 7 | `workspace_identity::unexpected_head_or_base_drift_is_refused` | A7 | HEAD/base/ancestry drift refuses before mutation. |
| 8 | `workspace_identity::unowned_dirty_path_blocks_handback` | A8 | Exact claims and both rename/copy endpoints are enforced. |
| 9 | `workspace_lease_process::worker_merge_rebase_reset_and_force_push_are_refused` | A9 | Forbidden Git mutation and real-Git bypass are denied. |
| 10 | `workspace_coordination_process::overlapping_path_claims_are_atomic_and_refused` | A10 | Concurrent overlap has one atomic winner. |
| 11 | `workspace_coordination_process::coordinator_integrates_commits_serially` | A11 | Coordinator integrates one ordered worker chain at a time. |
| 12 | `workspace_coordination_process::conflicting_commits_settle_once_needs_user_action` | A12 | Conflict rolls back exactly and settles once. |
| 13 | `scripts/tests/plan-review-policy-regressions.mjs --orchestration-oracle` | A13 | Existing schema-6 process oracle proves the bounded review/repair limit. |
| 14 | `workspace_resources::all_six_resource_kinds_are_isolated_and_receipted` | A14 | Per-session port/temp/build/database plus log/cache allocations are isolated. |
| 15 | `workspace_coordination_process::cleanup_refuses_dirty_or_unretained_work` | A15 | Dirty or unretained work cannot be removed. |
| 16 | `workspace_identity::integration_checkout_refuses_supported_writer` | A16 | Supported worker implementation in the primary checkout is refused. |
| 17 | `workspace_identity::failed_preflight_or_lease_changes_no_source_bytes` | A17 | Every failed preflight/lease path is no-mutation. |

Coverage beyond the attachment is owned without remapping tests 1–17: A18–A20 preserve both WIP modes and applied-WIP ordering; A21 proves legacy/workspace cross-mode exclusion and the corrected lock graph; A22 proves Linux ext4 and lifetime custody natively; A23 and A35 prove the macOS/release STOP; A24 proves SHA-1/SHA-256 object formats; A25 proves create-once coordinator bootstrap, capability scope, generation, and replay; A26 proves recovery; A27–A28 prove fresh-binary and single-session compatibility; A29 proves Relay documentation topics before the focused gate; A30 freezes inventory/reentry coverage; A31–A34 prove the focused, release-contract, unchanged-Docks, and repository-wide gates without claiming release eligibility; and A33 proves the forbidden Docks workspace-isolation skill was not created.

## Cold-handoff checklist

- [ ] **Plan identity:** treat this as the `planned` canonical plan created from parent `fc466f5a5784bb434108928d69aadef4877a6f5a` with `created` and `updated` both `2026-07-21T20:58:22-03:00`; do not treat this draft as implementation evidence or a review receipt.
- [ ] **Preserve before editing:** execute S0’s currently available Git temporary-index/create-once-ref bootstrap verbatim—not the future `workspace preserve` command—record its receipt hash/ref, create the dedicated `docks/<uuid>/workspace-isolation` branch/worktree, deliberately apply the WIP, then prove source HEAD/index/status/worktree bytes unchanged and verify the applied commit’s parent/tree. Stop before editing on any mismatch.
- [ ] **Commit boundaries:** keep the implementation reviewable and dependency-ordered: schemas/authority/capabilities/router; repository gate plus legacy fanout retrofit; preservation/provisioning/broker; Linux custody plus macOS refusal; claims/resources/tool adapters; lifecycle/integration/recovery/cleanup; exact tests/inventories; Relay documentation; focused CI; native evidence. Do not collapse these into one implementation commit.
- [ ] **Ownership:** Docks owns policy/guidance and unchanged schema-6 review lifecycle. Session Relay owns workspace authority, repository/Git coordination, leases, custody, resources, integration, recovery, and cleanup. Claude, Codex, and OMP remain untrusted Relay-launched workers.
- [ ] **Public surface:** implement exactly `session-relay workspace preserve|start|list|inspect|handback|integrate|recover|finish|abort`; retain existing top-level `spawn`, `handback`, `collect`, `spawn --fanout`, and `spawn --worktree`; add no Docks executable, `docks session`, or `spawn --workspace` alias.
- [ ] **Schema and module freeze:** preserve this plan’s recursively closed RFC 8785 JCS schemas and one-final-LF record encoding, exact actor/capability actions, object-format-dependent OID widths, state transitions, seven-module ownership, and four Rust test targets. `workspace.rs` remains the sole coordinator/router; do not create `workspace/mod.rs`, `workspace/cli.rs`, or `workspace/coordinator.rs`.
- [ ] **Coordinator bootstrap:** implement the final create-once repository-authority directory publication under RepositoryGate, deterministic 20-digit capability generation path, exact `WorkspaceStartResultV1`, loser-with-no-mutation behavior, rotation semantics, and irrecoverable-current-secret STOP. A session UUID or path is never authority.
- [ ] **Correct lock graph:** never implement the superseded global order containing the lifetime lease. Acquire `WorkspaceLease` only while no short-lived lock is held; prohibit `Gate -> Lease`. Implement only `IntegrationQueueLock -> RepositoryGate -> RelayStoreLock -> WorkspaceJournalLock`, `FanoutCollectionLock -> RepositoryGate -> RelayStoreLock`, and `RepositoryGate -> RelayStoreLock -> WorkspaceJournalLock`, with queue and collection locks never co-held and store/journal released around Git subprocesses followed by CAS revalidation.
- [ ] **Filesystem admission:** on Linux, validate each already-open relevant FD using `statx` mount ID joined to `/proc/self/mountinfo` and require literal `ext4`; never accept `EXT4_SUPER_MAGIC` alone. Retain no-follow, EUID, mode, inode/device, non-removable, cgroup-v2, pidfd, and Landlock predicates.
- [ ] **Linux custody:** implement only `linux_cgroup_v2_pidfd`: authenticated bounded `SOCK_SEQPACKET` JCS/HMAC frames, exact ACK/sequence/credential/FD checks, guardian/supervisor duplicate references to one OFD lease, no worker custody FDs, pre-exec activation barrier, cgroup placement before tool code, Landlock ABI >=3, mandatory `cgroup.kill`, recursive `populated 0`, symmetric single-custodian takeover, explicit dual-crash recovery, and independent post-close lease acquisition before journaling `Closed`.
- [ ] **macOS STOP:** `workspace/platform/macos.rs` returns the frozen negative-admission reason. Do not activate `macos_pgroup_libproc`, treat process-group/kqueue/libproc smoke as custody evidence, attest or upload managed-workspace binaries, publish/promote Relay, install it as release proof, or land/advertise Docks policy. macOS is a STOP condition, not an unanswered design question.
- [ ] **WIP and Git invariants:** source preservation never changes source HEAD/index/worktree; branch/root allocation is deterministic and suffix-refusing; no worker byte runs before durable `WipApplied`; even clean input creates the applied-WIP commit at produced/integration index zero; all supported Git mutation goes through the capability broker under RepositoryGate.
- [ ] **Resources and claims:** decide each of the six closed resource kinds exactly once; use held loopback FDs and digest-pinned provider receipts; enforce exact file/directory/default claims and both rename/copy endpoints; retain ambiguous resources/work rather than force-cleaning.
- [ ] **Test discipline:** register the exact four Rust targets and every exact test name in `rust-test-inventory.json`; run real subprocess/cgroup tests with zero ignored or filtered cases; classify every nested process/Git/platform site in the reentry fixture; do not suppress, mock away, or rename a failing custody case independently of the frozen inventory.
- [ ] **Compatibility and docs:** preserve fresh-binary jobs-1/jobs-4 133-label parity and ordinary single-session/fanout behavior. Document all nine Relay commands, the eight attachment UX topics, managed/unmanaged limits, Linux support, macOS refusal, and six precedents; do not promise enforcement over arbitrary same-UID unmanaged processes.
- [ ] **Evidence boundary:** keep `SourceCiReceiptV1`, `ProducerPreflightReceiptV1`, and `SessionRelayBinaryAttestationV1` byte-compatible. Run A1–A22 and A24–A34 on the native Linux/ext4 implementation runner, then A23 and A35 on the native macOS 15/APFS runner at the same tested commit; treat all outputs as implementation evidence only. A35 must continue to prove release refusal.
- [ ] **Handoff payload:** return the ordered implementation commits, exact base/head SHAs, preservation receipt/ref, changed-path manifest, A1–A35 outputs, Linux runner/kernel/ext4/cgroup/Landlock evidence, macOS exact STOP output, retained-work/resource inventory, and any failure state. Do not dispatch plan review or release workflows from the implementation handoff.

## Self-review

- `standalone_executability` — caught/fixed: removed the post-release Docks step and stated exact A/D roots.
- `actionability` — caught/fixed: closed the inherited-FD set, three-second gate behavior, and affected-path manifest.
- `dependency_order` — caught/fixed: documentation now precedes the gate that executes its smoke contract.
- `evidence_reverification` — caught/fixed: reopened cited repository/platform sources, corrected unsupported/broken anchors, and added direct Rust/selftest anchors.
- `goal_coverage` — caught/fixed: S0 now proves final source bytes and A2 proves two concurrent isolated writers end to end.
- `executable_acceptance` — caught/fixed: assigned native hosts and made A23/A35/A33 commands prove their stated outcomes.
- `failure_modes` — caught/fixed: S0 now emits a partial-state failure receipt and gate timeout is fail-closed.
- `open_questions` — pass: no human decision remains; macOS stays an explicit future-amendment STOP.

## Open questions

None. This plan freezes owner, CLI, schemas, state, module ownership, test ownership, lock graph, exact Linux ext4 predicate, coordinator capability bootstrap, and lifetime-custody protocol. macOS is deliberately not represented as a question: the absence of a documented durable descendant-containment primitive is an explicit implementation and cross-platform release STOP requiring a future canonical-plan amendment and independent review, not permission for an executor to choose a weaker backend.

## Sources

### Required design inputs

- The user-provided “Docks Worktree Isolation and Multi-Agent Coordination” brief is fully embedded in this plan’s goal, constraints, interfaces, one-to-one requirement matrix, and A1–A35 acceptance contract; no session-local artifact is required by a cold executor.
- `docs/plans/AGENTS.md:1-188` — schema-6 ownership, canonical cold-handoff body, ordered executable acceptance, checklist, self-review, and open-question contract.

### Current repository evidence

- `plugins/session-relay/rust/src/main.rs:1-70` and `plugins/session-relay/rust/src/lib.rs:1-14` — current top-level command/module surface has no workspace dispatcher or workspace module.
- `plugins/session-relay/rust/src/fanout.rs:26-77,131-184,186-296,299-345`, `plugins/session-relay/rust/src/fanout/authority.rs:402-467`, and `plugins/session-relay/rust/src/fanout/git.rs:30-43,73-97,100-169` — legacy reservation/handback/collect behavior, ungated Git seams, collection locking, common-dir identity, and current SHA-1-only validation.
- `plugins/session-relay/rust/src/store.rs:244-289,446-495,498-540` — existing flock crash-release and file-fsync/rename/directory-fsync persistence patterns.
- `plugins/session-relay/rust/src/lifecycle.rs:92-157,1232-1258,1325-1346` — `WorkerTree`, `ConfinedCgroup`, and `TrackedTree` are currently serialized vocabulary; live custody admits only `ProcessOnly` plus `SupervisorOwnedProcess`.
- `plugins/session-relay/rust/src/supervisor.rs:1-6,111-145,240-280` — current `UnixStream`/newline watchdog protocol is a conceptual reuse seam, not WorkerTree custody proof.
- `plugins/session-relay/rust/src/spawn.rs:1-20,413-474,918-959,970-1062,1228-1437` — current Claude/Codex launch arguments, legacy fanout supervisor, and process-only custody.
- `plugins/session-relay/AGENTS.md:30-47` — current fanout boundary and release-test discipline.
- `scripts/lib/plugins.mjs:61-93` and `scripts/ci.mjs:372-439` — current registry-driven Relay build, release-contract, and selftest gate to extend with workspace inventory/process checks.
- `plugins/session-relay/rust/rust-toolchain.toml:1-3` — pinned Rust 1.85.0 with rustfmt and clippy.
- `plugins/session-relay/test/selftest.mjs:746-762,793-798` — immutable 133-label catalog/output and success contract.
- `.github/workflows/build-binaries.yml:128-245` — four native build/attest/upload legs currently lack workspace process evidence.
- `scripts/verify-session-relay-preflight.mjs:23-35,619-659,799-848`, `scripts/lib/session-relay-release-preparation.mjs:368-371`, and `scripts/lib/session-relay-release-cli.mjs:19-110,122-169` — existing four-target verification and closed V1 preflight/release consumers.
- `AGENTS.md:70-84` and `docs/plans/AGENTS.md` — Docks schema-6 remains manager-owned, bounded, and independent of Session Relay outcomes.

### Official platform, Git, and precedent references

- Git worktrees: https://git-scm.com/docs/git-worktree
- Linux cgroup v2, including inherited membership, `cgroup.kill`, and recursive `populated`: https://docs.kernel.org/admin-guide/cgroup-v2.html
- Linux `pidfd_open(2)`: https://man7.org/linux/man-pages/man2/pidfd_open.2.html
- Linux Landlock: https://docs.kernel.org/userspace-api/landlock.html
- Linux OFD-associated advisory `flock(2)`: https://man7.org/linux/man-pages/man2/flock.2.html
- Linux secure lookup with `openat2(2)`: https://man7.org/linux/man-pages/man2/openat2.2.html
- Linux FD mount identity and mountinfo: https://man7.org/linux/man-pages/man2/statx.2.html and https://man7.org/linux/man-pages/man5/proc_pid_mountinfo.5.html
- Linux create-once rename and durability: https://man7.org/linux/man-pages/man2/renameat2.2.html and https://man7.org/linux/man-pages/man2/fsync.2.html
- Linux ext4 documentation: https://docs.kernel.org/filesystems/ext4/index.html
- Apple `kevent(2)` observation limits: https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/kevent.2.html
- Apple process-group creation and escape: https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man3/posix_spawnattr_setpgroup.3.html and https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/setsid.2.html
- Apple create-once rename, advisory locking, and APFS inspection: https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/stat.h, https://raw.githubusercontent.com/apple-oss-distributions/xnu/main/bsd/man/man2/flock.2, and https://raw.githubusercontent.com/apple-oss-distributions/xnu/main/bsd/man/man2/statfs.2
- Conductor isolated workspaces: https://conductor.build/
- OpenAI Codex worktrees: https://developers.openai.com/codex/app/
- Claude Code worktree workflows: https://code.claude.com/docs/en/common-workflows
- Cursor Background Agents: https://docs.cursor.com/en/background-agent
- GitHub Copilot coding agent: https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent

## Review

(filled by main-context plan-manager after completion evidence)

Review-orchestration-state: {"apply_state":"none","current_input_sha256":"f5164f6dbedf3e1657976ee8ecf6cd701e31eeeb545b0b7ea78e3caf015214c1","initial_input_sha256":"f5164f6dbedf3e1657976ee8ecf6cd701e31eeeb545b0b7ea78e3caf015214c1","lifecycle_intent":"none","orchestration_attempt":1,"phase":"completion","plan_path":"docs/plans/active/session-relay-workspace-isolation.md","request_ids":["9caea682-b9cb-4370-bcdd-d96f23888a12"],"retry_authorization":null,"round_index":1,"schema":2,"series_id":"aec97bd7-7519-406c-bd47-2ddd72520072","series_sha256":null,"state_sha256":"373beefa32c889d60736e133b80855bfb1a2a9cfc95d3a3be767deeff2a50cfd","status":"active","stop_reason":null,"terminal_evidence_sha256":null,"terminated_from_state":null,"terminated_from_state_sha256":null,"transitioned_from_state_sha256":null}
Review-orchestration-prepared-request: {"lifecycle_intent":"none","orchestration_series_id":"aec97bd7-7519-406c-bd47-2ddd72520072","orchestration_state_sha256":"373beefa32c889d60736e133b80855bfb1a2a9cfc95d3a3be767deeff2a50cfd","phase":"completion","plan_path":"docs/plans/active/session-relay-workspace-isolation.md","prepared_at":"2026-07-22T22:39:44.381Z","request":{"acceptance_inventory_sha256":"2df927a06aa798b4b6cbd82adaad6617666aa00fa18c03e01a4c22271589ab4b","author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"omp"},"bundle_sha256":"2bea945470fc07f83ad17deb9688142123ea2c0d38aedc6beb1f5fbc7d4dc5c5","diff_sha256":"393194d78c7958de89830fde50e8b410a8bd5af0680d7fe8ec7d23756fa008e0","execution_base_commit":"21eda3c9137b1b44b652738f6f53a0237b403fb5","input_sha256":"f5164f6dbedf3e1657976ee8ecf6cd701e31eeeb545b0b7ea78e3caf015214c1","lifecycle_intent":"none","orchestration_series_id":"aec97bd7-7519-406c-bd47-2ddd72520072","orchestration_state_sha256":"373beefa32c889d60736e133b80855bfb1a2a9cfc95d3a3be767deeff2a50cfd","phase":"completion","planned_at_commit":"fc466f5a5784bb434108928d69aadef4877a6f5a","policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"9caea682-b9cb-4370-bcdd-d96f23888a12","review_mode":"full","reviewed_commit_or_head":"4873d69b5b73add1e4ecd1720855b5c9b13414b7","round_index":1,"schema":6},"request_ids":["9caea682-b9cb-4370-bcdd-d96f23888a12"],"request_sha256":"9f028ff6dc36d262cd7b43fff1e132462460c8b992f64e52c48889d25b444955","schema":1,"type":"ReviewPreparedRequestV1"}
