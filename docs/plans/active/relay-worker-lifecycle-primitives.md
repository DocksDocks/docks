---
title: Build relay worker lifecycle primitives
goal: Add verified managed first-prompt admission, stable-handle process control, and lifecycle-gated worker quiescence without allowing fallback tiers to claim false confirmation.
status: ongoing
created: "2026-07-11T03:31:53-03:00"
updated: "2026-07-12T01:48:04-03:00"
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
  - plugins/session-relay/rust/src/runtime_install.rs
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/src/supervisor.rs
  - plugins/session-relay/rust/src/watch.rs
  - plugins/session-relay/rust/tests/lifecycle_supervisor.rs
  - plugins/session-relay/rust/tests/lifecycle_turn_cancellation.rs
  - plugins/session-relay/rust/tests/lifecycle_managed.rs
  - plugins/session-relay/rust/tests/lifecycle_admission.rs
  - plugins/session-relay/rust/tests/lifecycle_controller.rs
  - plugins/session-relay/rust/tests/process_identity.rs
  - plugins/session-relay/rust/tests/lifecycle_proof.rs
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
  - plugins/session-relay/test/runtime-hook-upgrade.mjs
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/test/supervisor-custody.mjs
  - plugins/session-relay/test/appserver-schema-contract.mjs
  - plugins/session-relay/test/wip-snapshot.mjs
  - plugins/session-relay/test/rust-test-inventory.mjs
  - plugins/session-relay/test/final-scope.mjs
  - plugins/session-relay/test/fixtures/lifecycle-capability-schema.json
  - plugins/session-relay/test/fixtures/runtime-doctor-schema.json
  - plugins/session-relay/test/fixtures/runtime-doctor-goldens/
  - plugins/session-relay/test/fixtures/process-signal-inventory.json
  - plugins/session-relay/test/fixtures/reentry-inventory.json
  - plugins/session-relay/test/fixtures/appserver-server-requests.json
  - plugins/session-relay/test/fixtures/wip-step-allowlist.json
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
planned_at_commit: 12cf2ea
---

# Build relay worker lifecycle primitives

## Goal

Build three general, independently testable relay capabilities: (A) prevent a managed hook-born Claude CLI **or relay-owned Codex app-server thread** from processing its first prompt when attach fails—Claude through the required `UserPromptSubmit` barrier and Codex through direct lifecycle binding after `thread/start` but before the first `turn/start`; (B) signal processes only through a kernel-stable handle or an unreaped supervisor-owned child, and confirm the cooperatively launched worker tree only behind the bounded confinement contract in this plan; and (C) cancel and prove app-server lineage only after a verified graceful stop/reap plus durable protocol flush, while capability-binding every relay drain, resume, injection, turn start, process launch, attach, interrupt, clean, and signal to the exact lifecycle/binding/fence epoch.

The result must distinguish **process-only**, **protocol-only**, and **worker-tree** evidence. Observation-only PID/start-time data, stable-looking descendant snapshots, any live shared-server scan, a single interrupted turn, `thread/read idle`, root-process exit, frozen-but-unflushed protocol artifacts, or `cgroup.events populated 0` outside the stated cooperative-worker boundary can never release a worker-tree capacity slot. ProtocolTree proof requires a verified graceful stop/reap whose durability contract flushes every accepted lineage/turn/terminal mutation before a complete offline scan; freezing is only a temporary WorkerTree snapshot aid and must end in kill plus `populated 0`, never thaw/release. Unsupported or lost capabilities remain `FencingUnconfirmed`, refuse every re-entry/drain, survive GC, and expose bounded reconcile/abandon paths.

## Context & rationale

- `relay-worker-fanout` is blocked on three general relay-core primitives. Its lifecycle-specific recovery/collection items remain out of scope; this plan provides only reusable attach, admission, process, quiescence, and reconciliation contracts.
- **Owner-approved Draft-13 boundary (2026-07-12):** after review proved that `hooks/list` is a snapshot with no expected-hash-bound child launch, the owner approved replacing the strict “hook-born Codex CLI” deliverable with relay-owned app-server birth. `thread/start` may discover the Codex runtime id, but relay must complete the direct lifecycle claim before it sends any `turn/start`. Managed Codex CLI fallback and direct human/third-party resume are outside the managed guarantee; unmanaged compatibility remains.
- **Observed upgrade failure (2026-07-12):** a long-lived Codex process retained an absolute hook command into a pruned versioned plugin cache and emitted repeated SessionStart/UserPromptSubmit exit 127 after `docks-kit sync codex`; the current trusted 0.10.0 hooks and binary passed when invoked directly, and a fresh ephemeral Codex session registered successfully. Draft-13 therefore treats executable-path durability across N→N+1 refresh as a separate capability from hook trust and adds a stable monotonic relay runtime plus live-upgrade acceptance.
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

## Threat model

These primitives defend a **cooperative worker**: the relay launches the user's own task under the user's own credentials and must contain accidental runaway descendants, crashes, PID/PGID reuse, signal TOCTOU, stale re-entry, and capacity overrun. `WorkerTree` means every process in the relay-controlled launch boundary that a cooperative task creates directly under the isolated wrapper. Its proof is authoritative only for that bounded set and only while the exact manager cgroup fd, namespace/setup receipt, kill result, and `populated 0` evidence remain valid.

A deliberately adversarial same-UID worker is outside this guarantee. In particular, it can ask a same-user broker such as `systemd-run --user` / D-Bus `StartTransientUnit` to create or move a process into a sibling cgroup, or pass work/authority through an already-reachable same-user service or `SCM_RIGHTS`. That broker-assisted writer can survive `cgroup.kill` while the worker leaf reports `populated 0`; neither seccomp on the worker nor its cgroup namespace can revoke authority already held by the broker. The fan-out hard cap accepts this bounded cooperative scope; tests must not relabel broker escape as covered WorkerTree evidence.

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

- **Plan source:** the orchestrator and every worker read `/home/vagrant/projects/docks/docs/plans/active/relay-worker-lifecycle-primitives.md` from the main worktree at dispatch time; the older implementation-branch copy is non-authoritative. Dispatch records `PLAN_COMMIT` and `PLAN_BLOB` from that path. The first repaired Step 3b runs A0b-bootstrap. After Step 3b commits clean, the orchestrator records its exact `STEP3B_HEAD`; the first Step-1b worker runs A0c-step1b-bootstrap before creating the helper and closed step allowlist. After Step 1b commits them, every later step runs reusable A0b. Unrelated main commits do not invalidate a path-specific snapshot; a changed plan commit/blob does.
- **Implementation checkout/base:** the registered checkout is `/tmp/docks-primitives-collab` on branch `codex/primitives-collab`, based on `701cea7e671bc40ee23d69abf79ff102e0eecb20`, and currently contains preserved in-flight Step-3b WIP. The first repair uses the fixed A0b-bootstrap below. After Step 1b, every redispatch records `WIP_PATCH_SHA256` over `git diff --binary HEAD` plus `WIP_UNTRACKED_SHA256` over a sorted path/mode/content-hash manifest generated by committed `test/wip-snapshot.mjs`; the helper enforces the step allowlist and rejects any unexpected path/mode/byte. Clean checkouts use canonical empty hashes. A new worker independently verifies hashes before editing. `/home/vagrant/projects` and `/tmp` are different filesystems, so `git worktree move` is invalid. Before final handoff, commit and verify all intended work, require clean status, record branch/full HEAD, run non-forced `git worktree remove /tmp/docks-primitives-collab`, then `git worktree add /home/vagrant/projects/docks-primitives-collab codex/primitives-collab`, and verify the same branch/HEAD. Never remove a dirty checkout. Drift base remains `12cf2ea`; completion runs in the implementation worktree against its recorded tip, never main HEAD.
- **One-time preserved-WIP bootstrap (orchestrator-observed 2026-07-12 before Draft-14 edits):** before the missing reusable helper exists, A0b-bootstrap independently binds the checkout to `HEAD=701cea7e671bc40ee23d69abf79ff102e0eecb20`, NUL status hash `2911f30fa11a2b6b49cbb3ad4635bddc0bdc6d96a31c8204bdfea279bf226afd`, tracked binary-patch hash `20a63f01d8bd4580aa03a46d368c16b2e27741170bae67b2e98f8f6b15ec0a9a`, and canonical sorted untracked-manifest hash `905f7207f73273efc2b24fd016acaa9fd04548bf6cb9c2414867fc1105968587`. The five sorted `path|100644|sha256` lines are: `plugins/session-relay/rust/src/supervisor.rs|100644|be15fc6f22fa8d327df6dde9428c4e2600ed05dc8fefbe7e0634405adac433f1`; `plugins/session-relay/rust/tests/lifecycle_supervisor.rs|100644|6978cf1be1a010b58c0dc8e2b61e1842d9fced1e4ac74f8eafdbd015bdd5dbc5`; `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/child-cancel-reentry.rs|100644|8744fc369ab9ab3c25025b718dd60ab244f617e6b7e4fe5a7579087e492e3946`; `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fabricated-owned-proof.rs|100644|d4c220f679dd0fee706b4d8f637f5c64a966ee6c5d20bbe2b6a64a9fec4fd2fd`; `plugins/session-relay/test/supervisor-custody.mjs|100644|2068054bf8bc2d91b93978cea1c32384b24c3aba07b91a4d349bc9ab9c940f21`. A0b-bootstrap verifies exact paths/digests, non-symlink/non-executable modes, and exact status before any edit. The worker repairs/commits Step 3b to clean status first. Step 1b then creates `wip-snapshot.mjs` and proves canonical empty hashes plus negative tracked/staged/unstaged/untracked/symlink/executable/rename/delete fixtures. All later dispatches use A0b with `--allow-step "$STEP_ID"`; the hard-coded initial manifest is never reused after Step 3b.
- **Exact A0b-bootstrap command (run once, before any Step-3b edit):** from `/tmp/docks-primitives-collab`, run:
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
- **Confirmed-source rule:** Step 1 preserves original evidence; Step 1b migrates stale verdicts and adds raw app-server ordering (feasibility-only), stable-generation, hook-health, and experimental-capability evidence. Production direct claim/controller behavior is Step 5/A6. No row may substitute hand-written booleans or re-argue docs.
- **Local commands:**
  ```bash
  export PATH="$HOME/.cargo/bin:$PATH"
  (cd plugins/session-relay/rust && cargo test --locked)
  node plugins/session-relay/test/selftest.mjs
  node plugins/session-relay/test/lifecycle-smoke.mjs --case reentry-matrix
  node plugins/session-relay/test/reentry-inventory.mjs
  node scripts/ci.mjs --plugin session-relay
  ```
- **Exact A0c-step1b-bootstrap command (run once, before any Step-1b edit):** only after Step 3b is committed and the orchestrator has independently recorded its full tip, dispatch `PLAN_COMMIT`, `PLAN_BLOB`, and `STEP3B_HEAD`; from `/tmp/docks-primitives-collab`, run:
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
  This one-time bridge authenticates the clean post-3b tip before `wip-snapshot.mjs` exists. Step 1b must commit both the helper and `test/fixtures/wip-step-allowlist.json`; the fixture is recursively closed, enumerates every remaining step and its allowed paths/modes, and CI rejects missing/extra/overlapping step ids. A0c is never reused after Step 1b.
- **Real runtime:** `runtime-hook-abort.mjs`, `runtime-hook-upgrade.mjs`, `runtime-appserver-quiescence.mjs`, and `feasibility-probe.mjs` create isolated temporary `HOME`, `CODEX_HOME`, plugin config, relay store, cwd, and sentinels. They record exact hook health and stable-runtime manifest/digest plus runtime version. Missing auth/runtime is failure for the real-runtime gate, never skip/pass.
- **Authentication preflight:** before isolated-home tests, run `claude -p 'Print exactly RELAY_AUTH_OK'` and `codex exec --sandbox read-only 'Print exactly RELAY_AUTH_OK'`; each must exit 0 and print only the marker. Step 1 records, from current runtime docs/probes, the exact credential artifact or allowlisted secret-environment variable each CLI supports. The harness creates a mode-0700 temporary home/config, installs only test hook/plugin files, and either read-only references the supported credential artifact at its runtime-defined location or forwards the allowlisted secret variable by name. It never copies credential bytes into artifacts, logs paths/values/hashes, or broad-copies the user's config. If neither safe mechanism is available, STOP and report the runtime row unavailable; do not skip/pass or weaken home isolation.
- **Pre-dispatch owner gate:** RESOLVED 2026-07-11 — owner selected Option 1 (`CooperativeWorkerV1`). Implementation may proceed.
- **Probe evidence contract:** each capability row contains `runtime`, `runtime_version`, `platform`, `argv`, `started_at`, `finished_at`, `exit_status`, base64 or artifact-path `stdout`/`stderr`, artifact SHA-256, parser rule, and derived verdict. The harness rejects a verdict without matching raw evidence, rejects unknown/missing schema fields, verifies its own committed git-blob hash, and emits the raw-record hash chain. There is no editable pass/fail fixture.
- **Independent cgroup feasibility verdicts:** Step 1b migrates the evidence schema from stale `strong_cgroup` to two independent verdicts. `cooperative_cgroup` depends only on a fresh domain leaf, gated placement, retained manager authority, `cgroup.kill`, and `populated 0`; freeze is optional. `filtered_hardening` depends on the namespace/seccomp/legacy-clone real-spawn probe and is Claude-only. Failure of either verdict never changes the other. The raw filter row still proves `clone3` returns `-1/ENOSYS` without creating a child and requires a real shell/tool child+wait sentinel for each runtime on which filtered hardening is advertised.
- **Measured attach deadline:** the probe runs 10 isolated cold starts per runtime including sequential store-lock contention. Set `managed_attach_deadline_ms = max_observed_ms + max(2000, ceil(max_observed_ms / 2))`; it must be `<= 20_000`, preserving at least 10 seconds inside the project's explicitly configured 30-second UserPromptSubmit hook budget. If the formula exceeds 20 seconds, STOP. Never lengthen the three-second global store lock.
- **Hook budget:** set `timeout: 30` explicitly on both runtimes' SessionStart and UserPromptSubmit command handlers. Timeout is fail-open and is tested as such; 30 seconds is a configured project budget, not a runtime minimum.
- **Codex hook health and runtime durability:** query `hooks/list` for the exact target cwd and record the two required rows as `HookHealthSnapshot`; missing/untrusted/drifted rows degrade diagnostics/re-entry but are not the managed first-turn linearization point. The app-server direct claim is authoritative. Hook commands use the monotonic stable runtime contract from §5. Production never writes Codex's internal trust state and never uses `--dangerously-bypass-hook-trust`; the feasibility harness may use the bypass only inside its isolated allowlisted home and labels it `test_only_bypass=true`. A live-upgrade matrix starts an N session, validates/installs N+1, prunes the N plugin cache, then proves both the old session's UserPromptSubmit and a new/subagent SessionStart execute through the stable runtime. Lower-version concurrency cannot downgrade; same-version digest mismatch and symlink/owner/mode/tamper failures fail closed for the installing invocation.
- **Cancellation/control bounds:** `managed_cancel_poll_ms = 100`, `managed_cancel_grace_ms = 5_000`, `supervisor_control_bind_deadline_ms = 5_000`, `watchdog_heartbeat_interval_ms = 250`, and `watchdog_stale_after_ms = 1_000`. Every admitted blocking loop checks a nonblocking generation/epoch-specific marker at least once per poll interval; it must not acquire the three-second global store lock merely to poll. At grace expiry, the guard must have either completed its external operation or exact-CAS transferred retained authority/evidence to a typed cancellation handoff before releasing. If exact turn identity, exact fence epoch/version, or live child custody cannot be transferred, exact-CAS the still-active operation to `FencingUnconfirmed`, retain it for status/reconcile, and stop waiting; never extend the grace to obtain a green test. `pending_attach.expires_at` is launch time plus the measured `managed_attach_deadline_ms`, so claim-vs-expiry is decided by the one atomic claim transaction. A caller that receives bootstrap data but never binds Control is killed/reaped or durably handed off by the fixed control-bind deadline; no retry resets it.
- **Protocol scan bound:** `protocol_lineage_deadline_ms = 20_000` is one monotonic deadline for all lineage/turn/terminal pages, verified graceful shutdown/reap/flush, and final offline scan. A page, continuous spawner, graceful stop/flush, or offline read that exhausts it returns `ProtocolIncomplete`; no retry loop may extend the same proof attempt. Freeze/kill is a separate physical-containment path and never upgrades protocol evidence.
- **Native platform matrix:** re-verify runner labels in Step 1, then run Darwin process probes natively on `macos-15-intel` and `macos-15`; cross-linking x86_64 on arm64 is not semantic verification.
- **Remote mutation gate:** A16 is the only acceptance criterion that dispatches external CI. Before it, ask the owner to authorize pushing the exact implementation SHA and dispatching the workflow; do neither implicitly. If approval is withheld, the remote ref mismatches, or GitHub is unavailable, STOP with A16 unverified and do not claim the plan complete. `run-build-matrix.mjs` never pushes; it only verifies the already-authorized remote SHA and dispatches/watches that exact run.
- **Binary discipline:** do not edit `plugins/session-relay/bin/`, manifest versions, marketplace versions, tags, or releases. A6b uses isolated source-built synthetic payloads because the committed binaries predate these commands. After implementation is accepted, a separate owner-gated producer/release workflow must rebuild actual target binaries and rerun the same live N/N+1 hook matrix against those packaged artifacts before any release; implementation evidence is never relabeled shipped-package evidence.

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

pub struct FenceProofRecord {
    worker_id: String,
    generation: String,
    fence_epoch: String,
    fencing_version: String,
    scope: RequiredScope,
    backend: ExecutionBackend,
    evidence_sha256: String,
    completed_at: String,
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

The table applies to every enumerated `LostAuthorityReason`; reason-specific code may not invent strings or another transition. One supervisor/watchdog/controller failure is processed as one atomic batch across every matching operation, so later current reports see an already-fail-closed row rather than an undefined intermediate state. A claim arriving after pre-bind loss transfers the original typed evidence; only expiry of still-live cancellation authority adds `CancelDeadline`. Closed unmanaged transitions are `Unmanaged@N→UnmanagedCanceling@N`; exact reap with a durable waiting claim `UnmanagedCanceling@N→Claiming@N+1`; exact reap/reconcile without one `→Unmanaged@N+1`; exact live cancel deadline with a durable waiter `→Managed@N+1` paired with exceptional `Attaching→FencingUnconfirmed(CancelDeadline)`; risk-accepted `abandon-session→Unmanaged@N+1` with `NOT QUIESCENCE-PROVEN` receipt. No other transitions exist. Only releasable managed records and terminal unmanaged-operation tombstones with their required receipt may age out. Binding GC alone may exact-CAS plain `Unmanaged→GcDeleting→removed`; `UnmanagedCanceling` is never GC-eligible. Failed pre-delete lock acquisition restores untouched Unmanaged; once deletion starts `GcDeleting` is crash-resumable. `Claiming` and `Managed` never age independently.

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

pub enum ChildLaunchSpec {
    AttachResume(AttachOptions),
    WakeDoorbell(DoorbellMessage),
    WatchWakeFallback(DoorbellMessage),
    ManagedCodexAppServer(ManagedCodexBirthOptions),
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

Before a later process can construct the wire envelope, the matching in-process sealed capability mints exactly one random `ManagedCommandAuthorizationRecord` in the store. The wire carries only its id/version. The supervisor atomically re-resolves and consumes the exact `Issued` record before emitting any app-server byte; a replay, wrong command discriminant, wrong controller/operation/version, expired record, or cross-family substitution writes only `Refused` and emits zero bytes. The closed family matrix is:

| Command | Required persisted authority |
|---|---|
| `ReadThread` | `Reentry { operation_kind: ControllerRead }`; result is snapshot-only and cannot guide a later mutation after that operation goes stale. |
| `InjectItems` | `Reentry { operation_kind: InjectItems }` for the same binding/controller. |
| `StartTurn` | `Reentry { operation_kind: StartTurn }` for the same binding/controller. |
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

The committed `appserver-server-requests.json` is recursively closed: `{schema:1,codex_version,targets:[{target,executable_sha256}],generator_argv:[string],schema_bundle_sha256,methods:[{method,params_schema_sha256,response_schema_sha256,policy,response_template_sha256}]}`. Targets and methods are UTF-8 byte-sorted and unique; policy is `decline|cancel|unsupported_loss`; no extra key/result exists. `node plugins/session-relay/test/appserver-schema-contract.mjs --regenerate --codex <absolute-native-codex-path> --out <sentinel-temp>` lstat/opens/hashes the native file, then invokes the production Rust fd-exec helper so that same open fd runs exact argv `codex app-server generate-json-schema --experimental --out <temp>/schema`; it hashes a sorted path/mode/content manifest, extracts the generated request union/response schemas, and emits the fixture candidate. `--verify-current --codex <absolute-native-codex-path>` regenerates in its own sentinel-bearing temp directory, byte-compares version/target/executable/schema/method/response-template hashes, and cleans only its temp. It never edits the fixture. Step 5's supervisor runs the same production fd-exec generator from the retained executable fd before managed server spawn, retains that fd for actual app-server launch, and refuses before pending creation/Active when any identity or schema hash differs.

For the currently researched contract the methods are `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/tool/requestUserInput`, `mcpServer/elicitation/request`, `item/permissions/requestApproval`, `item/tool/call`, `account/chatgptAuthTokens/refresh`, `attestation/generate`, `currentTime/read`, and legacy `applyPatchApproval`/`execCommandApproval`. The managed controller advertises no interactive/dynamic/auth-refresh/attestation/current-time capability. Approval/permission/legacy rows use exact hashed schema-valid decline/cancel templates; MCP elicitation uses its real `cancel` variant. `ToolRequestUserInputResponse` has no cancel variant in 0.144.1, so `item/tool/requestUserInput` is `unsupported_loss`: send the fixture's exact JSON-RPC error `{code:-32601,message:"unsupported managed controller request: item/tool/requestUserInput"}` for the same typed `RpcId`, then atomically mark matching in-flight operations `LostAuthority(CustodyLost)`. Dynamic tool/auth refresh/attestation/current-time and any unknown method follow the same method-specific hashed error+loss policy. Never emit `{answers:{}}` as an invented cancellation, accept command/file/permission, fabricate input, supply tokens/attestation, or hang. A Codex version, target executable digest, generated schema, method set, or response/error template that differs is `unavailable` until the fixture and policy are re-reviewed.

Controller-pump exit while the supervisor remains live, app-server stdio EOF, malformed/ambiguous response, request-map corruption, or an unhandled/unknown server request batch-marks its in-flight operations `LostAuthority(CustodyLost)` and applies the closed lifecycle transition; it never swaps in a new connection or guesses a response. The supervisor may continue to use its retained cgroup fd only for physical fencing. A later relay process can wake an idle Active worker only through the same controller instance/control epoch and typed admitted command; a stale controller/socket/sequence emits zero app-server bytes. Tests keep the original launcher dead, then use a second relay process for read/inject/start/interrupt; separately kill only the controller pump, only the app-server child, and only the initiating caller, and exercise concurrent numeric/string request ids, cross-thread terminal substitution, every source-derived server-request policy, and unknown methods.

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

`ProcessIdentityRecord` is durable observation/recovery input. `SignalHandle` is live sealed authority: pidfd is local; supervisor variants are usable only through the matching live supervisor instance, which retains the actual Child/cgroup fd. Step 4 extends the closed supervisor protocol with `SupervisorFenceCommand`; immediately before action the supervisor re-resolves exact operation plus Fencing generation/epoch/version and privately mints `SupervisorFencePermit`. Stale commands emit zero signal/state bytes. Linux pidfd recovery order is **open pidfd first, then read/compare the generation while the fd pins the task**, then signal via pidfd. If pidfd open fails or the pinned observation mismatches, do not raw-signal. `PidFdExitProof` additionally requires a sealed whole-process exit receipt from pidfd `POLLIN` (or `waitid(P_PIDFD)` where the supervisor also owns the child); identity alone is never exit proof. On Darwin and Linux without pidfd, recovery produces `ObservationOnly` and returns unconfirmed. A live supervisor may safely act through its unreaped `Child` only when its instance id and operation version match; once reaped/restarted, that authority is gone. `killpg` is permitted only inside the supervisor while its unreaped owned group leader prevents PGID reuse, and it proves group scope only—not escaped descendants or WorkerTree.

Managed launch uses `__managed-child-exec` with this executable cgroup setup contract (mandatory cooperative steps + optional Claude-only `FilteredCgroupHardening`):

1. **Preflight or fail closed (cooperative = mandatory; filter = optional Claude-only).** For the **cooperative** tier (both runtimes) require Linux cgroup v2, a newly created **`domain`** worker leaf with empty `cgroup.subtree_control` and writable `cgroup.kill`, a writable delegation permitting create/move at both destination and common ancestor, and at least one independently proven gated-placement capability. Classify direct `CLONE_INTO_CGROUP` failure exactly: `EACCES` means placement/delegation restrictions failed; `EBUSY` means a domain controller is enabled in the target; `EOPNOTSUPP` means domain-invalid; `ENOSYS` means the syscall path is unavailable. `EINVAL` means unsupported `CLONE_INTO_CGROUP` only when a same-binary control proves the `clone_args` size/base clone3 call valid and a disposable-leaf probe reproduces failure with the exact otherwise-valid flag/fd; malformed size/flags/fd remain implementation errors and STOP. Do not generic-retry clone3; use stop/GO only if its own capability probe already passed. If neither path is available, record `ObservationOnly`/`Unconfirmed` and never label the backend `ConfinedCgroupCooperative`. The **`FilteredCgroupHardening`** add-on additionally requires cgroup+mount+PID namespaces, either current-user-namespace `CAP_SYS_ADMIN` or enabled unprivileged user namespaces with uid/gid mapping, fresh proc mounting, `no_new_privs`, and seccomp filtering; if any of these fail, record `filtered_hardening: None` — this never reduces the cooperative WorkerTree.
2. **Create and retain manager authority.** Derive `<manager-root>` from the active cgroup2 mount plus this process's exact unified `0::` membership row; an optional `RELAY_CGROUP_ROOT` override is accepted only after the same mount-id/dev/inode/common-ancestor and delegation validation. Require create/move permission at destination and common ancestor before launch. The manager creates `<manager-root>/<worker_id>-<generation>/`, opens the exact directory `O_PATH|O_DIRECTORY|O_CLOEXEC`, records mount/dev/inode/uid/mode/path/generation, and keeps that fd private. All `cgroup.procs`, optional `cgroup.freeze`, `cgroup.kill`, `cgroup.subtree_control`, and `cgroup.events` access uses `openat` from this fd; no later path lookup is signaling authority.
3. **Pin executable bytes, gate placement, and stop at successful exec before target code (mandatory, both runtimes).** Resolve the final native executable once; reject symlinks, scripts, and dispatch launchers for the authoritative confined path. Open the regular executable `O_RDONLY|O_NOFOLLOW|O_CLOEXEC`, fstat/hash that fd, and retain it through launch. The minimal trusted wrapper creates the final execing task (for the filtered path, after creating the PID namespace), reports that task's host PID over a one-shot private pipe, and blocks the task on a second private release pipe before untrusted exec. The supervisor is its ancestor and sole tracer; it uses `PTRACE_SEIZE` with `PTRACE_O_TRACEEXEC` on that blocked exact task, verifies the seize, and either created it in the leaf through `clone3(CLONE_INTO_CGROUP)` or moves/verifies it through the retained cgroup fd for the separately proven stop/GO fallback. Only then does the supervisor release the trusted task to finish namespace/seccomp setup and call `execveat(fd, "", argv, envp, AT_EMPTY_PATH)` on the retained fd—never a pathname lookup. Successful exec produces exact `PTRACE_EVENT_EXEC` before the new program begins execution. While stopped there, the supervisor opens `/proc/<host-pid>/exe` no-follow, compares dev/ino/size/content identity with the retained fd, revalidates leaf membership/domain/kill authority, binds both identities into the placement receipt, then `PTRACE_DETACH` with signal 0; detach is final GO. Any PID-handoff mismatch, seize/event timeout, wrong event/status, ptrace loss, exec failure, identity/membership mismatch, or early exit kills/waits/reaps and refuses without target code. The final task is single-threaded at seize/exec; PID handoff/release fds close before detach; no external attach/adoption is allowed. **(Claude-only `FilteredCgroupHardening` continues from the blocked final task:)** it must already be in the leaf when it calls `unshare(CLONE_NEWCGROUP)`, so `/` inside that namespace is the worker leaf rather than an ancestor.
4. **Build an isolated view (Claude-only `FilteredCgroupHardening`; Codex skips this and stays cooperative).** For the rootless path, the wrapper first creates a user namespace, pauses while the manager installs `setgroups=deny` and uid/gid maps, then creates private mount+cgroup+PID namespaces and forks the namespace PID 1. It makes mounts private, enumerates and detaches **every inherited procfs and cgroup2 mount**, mounts one fresh `/proc` for the new PID namespace, proves `/proc/<host-pid>/{fd,fdinfo,root,cwd}` grants no host authority, and mounts exactly one cgroup2 view at `/sys/fs/cgroup`, rooted at the worker leaf and remounted read-only/nosuid/nodev/noexec. The privileged path must produce the identical observable view/receipt.
5. **Remove alternate authority before untrusted exec (Claude-only `FilteredCgroupHardening`).** Explicitly close every non-allowlisted fd (including manager/cgroup/mount namespace fds) with close-range plus fresh-`/proc/self/fd` verification; retain only stdio and the pinned target fd until `execveat`. The parent-owned ptrace relationship is already established before seccomp. Set `no_new_privs`, drop namespace capabilities, then install an architecture-validating seccomp filter. It accepts only `AUDIT_ARCH_X86_64` or `AUDIT_ARCH_AARCH64` matching the compiled target; on x86_64 it rejects every syscall number carrying `__X32_SYSCALL_BIT`. Because classic seccomp BPF cannot dereference the `clone3` pointer argument, deny `clone3` wholesale with **exactly `SECCOMP_RET_ERRNO | (ENOSYS & SECCOMP_RET_DATA)`**, never `EPERM`, kill, trap, or a generic deny action. This makes glibc `posix_spawn` take its verified legacy-`clone` fallback. On that legacy path, allow ordinary child flags but deny every namespace-creating flag. Deny later `mount`, `umount2`, `fsopen`, `fsmount`, `open_tree`, `move_mount`, `mount_setattr`, `fsconfig`, `fspick`, `pivot_root`, `chroot`, `setns`, `unshare`, namespace-creating legacy `clone` flags, tracee-side `ptrace`, `process_vm_readv`, `process_vm_writev`, and `pidfd_getfd`; allow the one fd-based `execveat` required to reach the exec stop. Most controls are defense-in-depth after capability drop and the fresh PID/proc view; failure of the architecture/x32/clone3-return/exec-stop checks is independently fatal to the filtered hardening layer only, never to cooperative WorkerTree.
6. **Adversarial and compatibility gates, then GO.** Preserve the raw-syscall namespace-denial fixture in the exact namespaces: it must prove `clone3` creates no child and returns `-1/ENOSYS`; namespace flags through legacy `clone` remain denied; wrong-arch and x32 actions are asserted exactly; ancestor/sibling write, remount, new namespace, inherited-fd, alternate proc/cgroup mount, and `/proc/<pid>/{fd,fdinfo,root,cwd}` attacks fail in the filtered layer. A deterministic barrier replaces the executable pathname after the fd hash and before exec; the pinned original reaches `PTRACE_EVENT_EXEC` or launch refuses, and the receipt never describes the replacement. Negative rows inject forged/wrong host-PID handoff, release-before-seize, seize denial, missing/wrong exec event, exec timeout/failure, ptrace detach failure, and identity replacement; all kill/reap before target sentinel. Separately, A5b drives each real runtime through blocked final task→seize→gated leaf→fd exec→exec-event identity→detach GO, then real sandbox tool child plus nested double-fork/fork storm and `cgroup.kill`→`populated 0`. Optional freeze is not a GO/proof prerequisite. Only a runtime passing this cooperative gate may receive `ConfinedCgroupCooperative`; inability to establish the ancestor tracer, fd-bound exec stop, placement, or leaf containment records it unavailable. Claude additionally attempts filtered hardening; Codex is expected filtered-unavailable. The manager constructs the receipt at the exec stop and sends GO only by validated detach.

The detached lifecycle supervisor is the cgroup manager and retains the exact directory fd until terminal release. Ordinary CLI exit/restart asks that supervisor to act; it does not reopen the path. Each production launch privately constructs its own `CgroupPlacementReceipt` from the live host boot id, kernel, runtime binary/version, exact leaf fd, and gated placement; each fence constructs its own matching `CgroupKillReceipt`. A5b is CI/release regression evidence only and never authorizes a later host, runtime, or worker. Any cached capability/status record is explicitly non-authoritative diagnostic input, is bound to host boot id+kernel+runtime binary digest, and is invalidated on any change. If the supervisor or fd is lost, mount/dev/inode/path revalidation is observation only because the path/inode could have been recycled; this plan defines no fd-reconstruction/transfer path, so recovery remains `FencingUnconfirmed`. A **cooperative** failure — gated-placement/leaf-membership loss, non-domain/non-empty-subtree leaf, non-writable `cgroup.kill`, typed-placement fallback failure, kill/`populated 0` failure, surviving host PID, retained-fd loss, or supervisor-authority loss — makes WorkerTree unavailable for that runtime. A **filtered-hardening** failure records `filtered_hardening: None` and disables only the Claude-only layer. This direct boundary does not claim to stop a deliberately adversarial same-user broker or service from creating a sibling process; every `CgroupTreeProof` is stamped `CooperativeWorkerV1` and diagnostics repeat that scope.

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

All `CgroupBoundary`, placement/kill/filtered receipt, and `CgroupTreeProof` fields are private. Public methods are read-only accessors returning copies/borrows; no mutable accessor or public constructor exists. A5b produces CI/release regression evidence only. Every production worker constructs fresh placement evidence on its actual host/runtime/leaf; no cached attestation authorizes GO or proof. Only the live matching supervisor may construct the final `CgroupTreeProof`, after re-resolving its private `SupervisorFencePermit`, writing kill, observing populated-zero, validating every in-model membership row, and binding the exact placement receipt plus fence epoch/version. Compile-fail fixtures reject construction and field mutation; runtime tests prove a stale supervisor or altered serialized observation cannot enter `FenceEvidence::WorkerTree`.

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
/bin/sh -c 'plugin=$1; shift; root=${XDG_DATA_HOME:-${HOME:?HOME required}/.local/share}/docks/session-relay/runtime; if test -d "$plugin" && test ! -L "$plugin"; then launcher=$plugin/bin/relay; if test -f "$launcher" && test ! -L "$launcher" && test -x "$launcher"; then "$launcher" __install-stable --plugin-root "$plugin" --json >/dev/null; rc=$?; if test "$rc" -ne 0 && test -e "$plugin"; then exit "$rc"; fi; elif test -e "$plugin"; then exit 4; fi; elif test -e "$plugin"; then exit 4; fi; exec "$root/current/relay" hook codex "$@"' relay-hook "${CLAUDE_PLUGIN_ROOT}"
/bin/sh -c 'plugin=$1; shift; root=${XDG_DATA_HOME:-${HOME:?HOME required}/.local/share}/docks/session-relay/runtime; if test -d "$plugin" && test ! -L "$plugin"; then launcher=$plugin/bin/relay; if test -f "$launcher" && test ! -L "$launcher" && test -x "$launcher"; then "$launcher" __install-stable --plugin-root "$plugin" --json >/dev/null; rc=$?; if test "$rc" -ne 0 && test -e "$plugin"; then exit "$rc"; fi; elif test -e "$plugin"; then exit 4; fi; elif test -e "$plugin"; then exit 4; fi; exec "$root/current/relay" hook codex "$@"' relay-hook "${CLAUDE_PLUGIN_ROOT}" --event prompt
```

Shell/argv quoting is emitted literally by `codex-hooks.json`; neither cwd nor hook input is interpolated into code. Installer JSON is redirected so complete hook stdout contains exactly one hook response object. When N's cached plugin root remains an exact real directory, the launcher must be a non-symlink regular executable and validate/install; any failure while the root still exists propagates. If the root disappears after the directory check, before launcher exec, or during manifest/checksum reads, the command rechecks `test -e "$plugin"` after the failure and falls through only when the whole root is now absent/dangling; it then execs stable `current/relay`. A present non-directory/symlinked root or missing/nonexec launcher fails. Missing/invalid `current` fails visibly; it never searches cache directories. A6b uses deterministic barriers for every prune point and parses complete stdout as exactly one event-correct hook JSON object.

The runtime root is same-owner mode 0700 and contains `install.lock` (same-owner regular mode 0600), immutable `generations/<plugin_version>-<binary_sha256>/{relay,runtime.json}`, a staging directory, and an intentional relative `current` symlink to one complete generation. From the exact supplied plugin root, the installer lstat-parses both `.codex-plugin/plugin.json` and `.claude-plugin/plugin.json`, requires matching `name=session-relay` and identical strict-semver `version`, then parses exact `bin/SHA256SUMS`. Target mapping is closed: `Linux x86_64→relay-x86_64-unknown-linux-musl`, `Linux aarch64→relay-aarch64-unknown-linux-musl`, `Darwin x86_64→relay-x86_64-apple-darwin`, `Darwin arm64→relay-aarch64-apple-darwin`; every checksum entry is unique lowercase SHA-256 plus basename, exactly the four expected entries, and selected `bin/<basename>` is a non-symlink regular executable matching its digest. `bin/relay` is only the validated dispatcher used to invoke the installer; stable generation copies the selected native binary, never that shell launcher. Never use Cargo package version. The installer then locks `install.lock` across current-state read, source validation, generation staging, every fsync, and pointer commit. It lstat-validates every parent/source/generation object; hostile symlinks are rejected, while managed `current` is allowed only when its target is one same-root immutable generation with matching regular 0755 binary and closed record. Exact portable commit sequence: write+fsync binary and record in staging; fsync staging generation directory; rename staging into `generations/`; fsync `generations/`; create temporary relative symlink in runtime root; fsync runtime root; rename it over `current`; fsync root again. Never fsync the symlink inode. Crash selects complete old or new pair; partial staging is never selected and is cleaned under next lock. Keep current+previous; delete older unselected only after pointer durability. Higher semver replaces; same version+digest no-op; lower no-op; same version+different digest fatal. Lock serialization prevents downgrade. Core standalone hooks bootstrap this contract; docks-kit may proactively invoke the same interface but is not required for safety.

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

Every object is recursively closed in the committed JSON schema. Doctor capability keys are exactly `stable_runtime`, `hook_session_start`, `hook_user_prompt_submit`, `managed_appserver`, `cooperative_cgroup`, and `filtered_hardening`; values are `available|unavailable|unknown`. Result reason codes are exactly `ready`, `hook_health_degraded`, `capability_unavailable`, `stable_runtime_absent`, and `unsupported_runtime_contract`; install reason codes are `installed`, `already_current`, `lower_version_ignored`, and `previous_retained`. Error reason codes are exactly `usage`, `schema_mismatch`, `unsupported_target`, `unsupported_install_source`, `validation_failed`, `tamper_detected`, `owner_mode_invalid`, `lock_failed`, and `io_failed`. Unknown keys/codes/extra fields fail validation. `ready|degraded|unavailable` are normal exit-0 `RuntimeDoctorResult` readiness states; exit 3 is reserved for command inability such as an unsupported install target and emits `RuntimeToolError`. Exit 2 is usage/schema, 4 validation/tamper, and 5 I/O/lock. JSON-mode nonzero paths, including usage once `--json` is recognized, emit exactly one schema-valid `RuntimeToolError` on stdout; stderr is human diagnostic only. Golden fixtures cover doctor ready/degraded/unavailable, install changed/no-op/lower-no-op, and every error exit, and the schema and implementation are independently checked against them. `plugin_payload_sha256` is a canonical sorted path/mode/content manifest over the installed plugin payload excluding the mutable stable runtime root; `hook_definitions_sha256` is the canonical normalized shipped SessionStart/UserPromptSubmit definition set. They drive diagnostics/restart delta only, never lifecycle proof.

The Codex plugin manager's installed plugin root is the standalone bootstrap trust input. `SHA256SUMS` proves package-internal corruption/target selection, not authenticity against a malicious same-UID actor who rewrites both binary and checksum; that actor is outside the cooperative same-user threat boundary already stated. The installer never claims signature verification. A higher-assurance docks-kit proactive path must compare the target binary digest to an immutable reviewed Docks contract/release fixture **before** executing cache bytes; it cannot treat self-reported cache checksums as an external anchor.

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

GC eligibility is lifecycle-aware before surface deletion. `Attaching|Active|Fencing|FencingUnconfirmed|Fenced|TerminalRetained`, pending attaches, `SessionBinding::Claiming|Managed`, versioned unresolved `ActiveOperationRecord`, `CancellationHandoff`, live/lost `SupervisorRecord` and socket identity, generation tombstones, fence-intent markers, activity locks, stale-event audits, and proof records are non-GCable regardless of `last_seen` or mtime. `SessionBinding::GcDeleting` is non-admissible and is processed only by exact-epoch GC resume. Only `TerminalReleasable` with a valid `ReleaseReceipt` can enter the ordinary managed age check.

`SessionOperationTombstone` is keyed by runtime session plus operation. Reaped and risk-accepted outcomes carry distinct receipt hashes; `gc_eligible_at` is `terminal_at +` the existing ordinary age cutoff, never a new shorter cutoff. Even after that time it is deletable only when no pending attach, Claiming/Managed/UnmanagedCanceling binding, unresolved operation/custody, handoff, supervisor/watchdog record, proof, or audit reference points to the session/operation. Risk-accepted deletion never upgrades its `NOT QUIESCENCE-PROVEN` meaning.

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
relay lifecycle reconcile-session <session> --binding-epoch <n> --operation <uuid> --cancellation-epoch <uuid> --expected-operation-version <n> --json
relay lifecycle release <worker> --generation <uuid> --expected-version <n> --proof-sha256 <hex>
relay lifecycle abandon <worker> --generation <uuid> --expected-version <n> --reason <text> --i-understand-processes-may-still-be-running
relay lifecycle abandon-session <session> --binding-epoch <n> --operation <uuid> --cancellation-epoch <uuid> --expected-operation-version <n> --reason <text> --i-understand-processes-may-still-be-running
```

`status` reports state/version/fence epoch, operation/handoff/supervisor authority, backend/scope, proof gap, last attempts, and an exact version-bound recovery command. Worker `reconcile` behaves as before. `reconcile-session` acts only on exact `UnmanagedCanceling` session/binding/cancellation epoch, operation, current operation version, and the still-live matching supervisor; successful reap writes a terminal tombstone and advances binding epoch. `abandon-session` requires the same exact selectors, reason, and acknowledgement, advances the binding epoch with a risk-accepted tombstone, and prints **“NOT QUIESCENCE-PROVEN”**. Neither session command raw-signals observation-only PIDs or invents a worker. Shared servers cannot reconcile to ProtocolTree. Worker release/abandon remain exact generation/version/proof operations. Any stale selector changes nothing.

## Steps

| # | Task | Files | Depends | Status | Done condition / STOP trigger |
|---|---|---|---|---|---|
| 1 | Codify the original feasibility foundation in a committed probe harness: runtime/hook/process rows, explicit absence of a current durable app-server flush contract, raw `clone3→ENOSYS`, and per-runtime ordinary-spawn probes. Emit raw-record hashes and measure attach/protocol bounds. | `plugins/session-relay/test/feasibility-probe.mjs`, `plugins/session-relay/test/fixtures/lifecycle-capability-schema.json`, `docs/plans/active/relay-worker-lifecycle-primitives.md:Notes` | — | done | Commit `c32aafa17d1408157f87de5b616135212f33a2ed` established the original evidence, but its stale `strong_cgroup`/freeze coupling is superseded by Step 1b and cannot by itself advertise Option-A cooperative containment. |
| 1b | After preserved Step 3b is clean/committed, run the one-time A0c handoff, create the reusable WIP snapshot helper plus closed per-step allowlist, and migrate feasibility evidence to independent `cooperative_cgroup` and Claude-only `filtered_hardening`; prototype raw Codex `thread/start→controller claim candidate→turn/start` ordering (not production Rust claim), inventory experimental capability, define semantic hook-health snapshots, and prove stable-runtime generation/pointer feasibility. | `plugins/session-relay/test/feasibility-probe.mjs`, `plugins/session-relay/test/fixtures/lifecycle-capability-schema.json`, `plugins/session-relay/test/fixtures/wip-step-allowlist.json` (new), `plugins/session-relay/test/runtime-hook-abort.mjs` (new), `plugins/session-relay/test/runtime-hook-upgrade.mjs` (new), `plugins/session-relay/test/wip-snapshot.mjs` (new), `docs/plans/active/relay-worker-lifecycle-primitives.md:Notes` | 1, 3b | planned | A0c/A0b/A1/A1b pass. Helper reproduces empty state and rejects every dirty class; source-derived fixture closes every remaining step/path/mode mapping. Raw trace proves SessionStart-before-thread-response and zero turn before a prototype claim decision without pretending JS is shipped lifecycle logic. Stable generation/pointer survives pruning/crash/races. |
| 2 | Add binding epochs/states, two-phase pending-token claim, binding/activity serialization, exact duplicate/resume rules, versioned lifecycle transitions, tombstones, receipts, and GC exclusions plus exact `GcDeleting` CAS/resume. Claiming publication remains the first short hook transaction; Active waits for older unmanaged guards to drain. | `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/rust/src/hook.rs`, `plugins/session-relay/rust/src/lib.rs`, `plugins/session-relay/rust/Cargo.toml`, `plugins/session-relay/rust/Cargo.lock`, `plugins/session-relay/rust/tests/lifecycle_managed.rs` | 1 | done | Commit `066262feda00cd416aad748cf89b4b4a28eb773a` independently passed the Step-2 managed lifecycle suite. Later steps may extend types but may not weaken the verified transition/GC invariants. |
| 3a | Retain the delivered capability-bound admission and publish-first fencing foundation, limited to its verified surface: target-free lower APIs, closed `ChildLaunchSpec`, no lifecycle-sensitive `exec`, exact guard target/kind/binding re-resolution, and the existing four compile boundaries. Do not call cancellation or inventories complete yet. | `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/rust/src/appserver.rs`, `plugins/session-relay/rust/src/bus.rs`, `plugins/session-relay/rust/src/channel.rs`, `plugins/session-relay/rust/src/cli.rs`, `plugins/session-relay/rust/src/hook.rs`, `plugins/session-relay/rust/src/watch.rs`, `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/tests/lifecycle_admission.rs`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/**` | 2 | done | Checkpoint `701cea7e671bc40ee23d69abf79ff102e0eecb20` independently passed A3a's narrowed existing guard/compile suite. The false-green cancellation/inventory claims are explicitly deferred to 3b–3d. |
| 3b | First run A0b-bootstrap against untouched preserved WIP; then repair/commit the detached watchdog-first supervisor and versioned operation substrate. Watchdog/supervisor each form independent sessions; explicit bootstrap pipes close before Ready; watchdog owns/reaps supervisor; stable control epoch/private nonce bind CLI Control; global Ready, ControlBound, child spawn, proxy startup follow closed phases. Preserve pipe/PTY behavior. Add durable typed loss batches/waiting claims/UnmanagedCanceling, exact disconnect transfer, private child permit, versions/receipts/tombstones/recovery, and create the minimal source-derived nonzero Rust target inventory before running A2/A3b. No pidfd/cgroup/app-server controller/user-facing recovery yet. | `plugins/session-relay/rust/Cargo.toml`, `plugins/session-relay/rust/Cargo.lock`, `plugins/session-relay/rust/src/supervisor.rs` (new), `plugins/session-relay/rust/src/main.rs`, `plugins/session-relay/rust/src/lib.rs`, `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/rust/src/hook.rs`, `plugins/session-relay/rust/tests/lifecycle_managed.rs`, `plugins/session-relay/rust/tests/lifecycle_supervisor.rs` (new), `plugins/session-relay/test/rust-test-inventory.mjs` (new), `plugins/session-relay/test/supervisor-custody.mjs` (new), `plugins/session-relay/test/reentry-inventory.mjs`, `plugins/session-relay/test/fixtures/reentry-inventory.json`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.toml`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.lock`, `plugins/session-relay/test/selftest.mjs`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/child-cancel-reentry.rs` (new), `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fabricated-owned-proof.rs` (new) | 3a | in-flight | A0b-bootstrap first; then the inventory helper proves nonzero `lifecycle_managed|lifecycle_admission|lifecycle_supervisor` targets and A2/A3b pass. WIP becomes one reviewed commit/clean status before 1b. Tests prove loss batches/reasons, caller-death/bootstrap/zero-fd/source-phase coverage, stable control vs operation version, interactive compatibility, reap, and stale zero bytes. Failure to preserve behavior/custody: STOP unbuildable. |
| 3c | Add exact turn/child cancellation on the 3b substrate: persist `TurnStartSentUnknown` before send and exact returned `turn.id` before pump; add `TurnCancellationPermit`, exact terminal observation, versioned `CancellationHandoff`, nonblocking 100 ms polling, fixed 5s guard resolution/handoff, and apply every authority loss only through the source-state×reason table. A child handoff remains owned by the detached supervisor. | `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/src/appserver.rs`, `plugins/session-relay/rust/src/supervisor.rs`, `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/rust/tests/lifecycle_turn_cancellation.rs` (new), `plugins/session-relay/test/fake-app-server.mjs`, `plugins/session-relay/test/lifecycle-smoke.mjs`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.toml`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.lock`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/cancel-reentry.rs` (new), `plugins/session-relay/test/reentry-inventory.mjs` | 3b | planned | A3c passes deterministic send/response/terminal, child-ignore-kill, every source/reason/crash row, and operation-version winner/loser races. Any direct Active→FencingUnconfirmed, latest-turn guess, stale mutation, >100 ms individual block, guard held after 5s, dropped child authority, or unresolved operation disappearance: STOP. |
| 3d | Close the source-derived admission surface: make wake/watch mutation-guiding status guard-aware, map every generic outbound mutation primitive and caller to an executed unique behavior test, invoke every production `OperationKind` wrapper, and replace all placeholder/name-only counts. Include first-birth collision and wrong/stale/mid-block-fence rows. | `plugins/session-relay/rust/src/appserver.rs`, `plugins/session-relay/rust/src/cli.rs`, `plugins/session-relay/rust/src/watch.rs`, `plugins/session-relay/rust/tests/lifecycle_admission.rs`, `plugins/session-relay/test/reentry-inventory.mjs`, `plugins/session-relay/test/fixtures/reentry-inventory.json`, `plugins/session-relay/test/lifecycle-smoke.mjs`, `plugins/session-relay/test/selftest.mjs` | 3c | planned | A3d/A9/A10 pass with no placeholder behavior ids. Any mutation-guiding RPC precedes admission, a stale response guides a later mutation, or an inventory row lacks an executed production-wrapper test: STOP. |
| 4 | Extend the Step-3b supervisor with pidfd and `ConfinedCgroupCooperative`: fd-pin/hash/fd-exec the exact native runtime; gated placement into a fresh delegated domain leaf; retained generation-bound fd; setup-only placement receipt; post-kill same-fence termination receipt; exact domain/empty-subtree/kill checks; `cgroup.kill`→`populated 0`; fail-closed fd loss. Classify `CLONE_INTO_CGROUP` `EACCES|EBUSY|EOPNOTSUPP|ENOSYS` plus narrowly validated unsupported-feature `EINVAL`; use stop/GO only when independently proven. Add Claude-only best-effort filtered hardening and inventory every signal callsite. | `plugins/session-relay/rust/src/process_identity.rs` (new), `plugins/session-relay/rust/tests/process_identity.rs` (new), `plugins/session-relay/rust/src/supervisor.rs`, `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/src/main.rs`, `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/test/process-signal-inventory.mjs` (new), `plugins/session-relay/test/fixtures/process-signal-inventory.json` (new), `plugins/session-relay/test/runtime-hook-abort.mjs` (new), `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.toml`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.lock`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fabricated-pidfd-proof.rs` (new), `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/tampered-cgroup-proof.rs` (new), `plugins/session-relay/test/reentry-inventory.mjs`, `.github/workflows/build-binaries.yml` | 1b-3d | planned | A4/A5/A5b prove stable signaling, hash-to-exec race closure, gated membership, typed fallback, phase-correct kill/populated-0 with no surviving in-model PID for both runtimes, and independently labeled Claude-only filtered hardening. A pre-kill boundary can never become WorkerTree proof. |
| 5 | Implement managed first-prompt admission and durable controller. Claude uses Claiming-first SessionStart plus UserPromptSubmit. Codex supervisor generates/holds the raw token, creates the pending record, pins and schema-probes the exact app-server executable, retains Child/stdio/request map/source-derived server-request policy/notification pump, persists ControllerReady, and alone claims the non-claiming `thread/start` identity before first turn. Later processes mint one-time store-backed command authorizations from the exact sealed capability before typed controller commands. Add two exact durable shell hook bootstraps, locked generation/pointer installer, doctor/install schemas+goldens, literal hook health, numeric timeouts/dead-man, and unmanaged compatibility. | `plugins/session-relay/rust/src/appserver.rs`, `plugins/session-relay/rust/src/hook.rs`, `plugins/session-relay/rust/src/runtime_install.rs` (new), `plugins/session-relay/rust/src/main.rs`, `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/rust/src/supervisor.rs`, `plugins/session-relay/rust/tests/lifecycle_controller.rs` (new), `plugins/session-relay/hooks/hooks.json`, `plugins/session-relay/hooks/codex-hooks.json`, `plugins/session-relay/test/appserver-schema-contract.mjs` (new), `plugins/session-relay/test/fixtures/appserver-server-requests.json` (new), `plugins/session-relay/test/fixtures/runtime-doctor-schema.json` (new), `plugins/session-relay/test/fixtures/runtime-doctor-goldens/` (new), `plugins/session-relay/test/runtime-hook-abort.mjs` (new), `plugins/session-relay/test/runtime-hook-upgrade.mjs` (new), `plugins/session-relay/test/selftest.mjs` | 1b-4 | planned | A6/A6a/A6b/A6c prove token secrecy, production claim ordering, schema-bound controller startup, every command-authority and server/caller/request-policy failure row, later-process wake, source-built real cached hook events, crash-atomic selection, independently schema-valid golden output, Claude barrier, and health degradation. Managed CLI fallback, pre-Active turn, arbitrary JSON/target forwarding, auth-record replay, reconnect guessing, or non-atomic runtime pair: STOP. |
| 6 | Consume Step-5 controller and Step-3c exact-turn handoffs through post-drain `FencePermit`; initialize with experimental API capability; implement finite recursive lineage/turn pagination and exact sealed-ref background-terminal list/terminate; mint one sealed `ProtocolProofAttempt` and require its binding on every nested receipt/evidence hash before `FenceEvidence` construction. The real current Codex adapter must always return `MissingDurableFlushContract`; positive graceful reject/flush/watermark/reap/offline remains fake/future-only; shared scans stay observation-only; physical fallback is cgroup kill. | `plugins/session-relay/rust/src/appserver.rs`, `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/tests/lifecycle_proof.rs` (new), `plugins/session-relay/test/fake-app-server.mjs`, `plugins/session-relay/test/runtime-appserver-quiescence.mjs` (new), `plugins/session-relay/test/lifecycle-smoke.mjs`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.toml`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/Cargo.lock`, `plugins/session-relay/test/fixtures/lifecycle-capability-bypass/src/bin/fabricated-protocol-proof.rs` (new), `plugins/session-relay/test/reentry-inventory.mjs`, `plugins/session-relay/test/fixtures/reentry-inventory.json` | 3c-5 | planned | A7/A8/A13 prove typed experimental-method failure, real runtime ProtocolIncomplete, private attempt-bound fake proof construction, N/N+1 nested-receipt mix rejection, finite pagination, exact terminal termination, later-fence replay rejection, late/continuous writer rejection, and physical fallback. |
| 7 | Add version-CAS lifecycle status/reconcile/release/abandon, cancellation-handoff diagnostics, immutable fence-proof records, crash-resumable `Fenced→TerminalRetained`, stale-fencer rejection, receipts, and explicit release. Every cancellation/fence transition consumes exact generation+binding/fence epoch+version authority. | `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/src/cli.rs`, `plugins/session-relay/rust/src/main.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/test/lifecycle-smoke.mjs` | 2-6 | planned | A12/A13 prove crash-after-proof retention resumes exactly once, stale cancellation/fence completion loses, unresolved custody is non-GCable, and release matches the stored proof hash. Any proved worker is stranded in Fenced or any late actor overwrites newer state: STOP. |
| 8 | Complete adversarial unit/cross-process/real-runtime matrices and source-inventory enforcement; preserve all existing relay tests and isolated cleanup. Extend the Step-3b Rust inventory to every later exact target and make compile-fail auto-enumerating. Include watchdog/supervisor failures, authority races, every loss source/reason, cancellation, controller claim/command authorization, GC, exec-stop/cgroup receipts, hook-health/stable-runtime race/tamper, protocol-attempt mixing, proof-retention crash, and missing-flush rows. | `plugins/session-relay/rust/src/appserver.rs`, `plugins/session-relay/rust/src/hook.rs`, `plugins/session-relay/rust/src/lifecycle.rs`, `plugins/session-relay/rust/src/process_identity.rs`, `plugins/session-relay/rust/src/runtime_install.rs`, `plugins/session-relay/rust/src/supervisor.rs`, `plugins/session-relay/rust/src/spawn.rs`, `plugins/session-relay/rust/src/store.rs`, `plugins/session-relay/test/rust-test-inventory.mjs`, `plugins/session-relay/test/feasibility-probe.mjs`, `plugins/session-relay/test/supervisor-custody.mjs`, `plugins/session-relay/test/lifecycle-smoke.mjs`, `plugins/session-relay/test/process-signal-inventory.mjs`, `plugins/session-relay/test/reentry-inventory.mjs`, `plugins/session-relay/test/runtime-hook-abort.mjs`, `plugins/session-relay/test/runtime-hook-upgrade.mjs`, `plugins/session-relay/test/runtime-appserver-quiescence.mjs`, `plugins/session-relay/test/fake-app-server.mjs`, `plugins/session-relay/test/selftest.mjs` | 2-7 | planned | A1/A1b through A14 pass; every named Rust target executes a source-derived nonzero required set; every compile-fail bin is enumerated and fails at intended authority boundary; helpers clean children/stores in `finally`; external sentinels/kernel/protocol evidence establish results. Cooperative-scope and runtime provenance are machine-checked. |
| 9 | Document guarantee tiers, relay-owned Codex app-server admission, stable hook runtime/diagnostic health, `CooperativeWorkerV1`, cancellation, current ProtocolTree unavailability, cgroup evidence, GC, and recovery; remove the stale non-authoritative implementation-branch copy of this plan so the final range contains zero `docs/plans/**`; add exact-SHA Darwin matrix, disposable final-scope negatives, and full gates without binary/release changes. | `plugins/session-relay/AGENTS.md`, `plugins/session-relay/skills/productivity/session-relay/SKILL.md`, `plugins/session-relay/rust/src/main.rs`, `plugins/session-relay/test/run-build-matrix.mjs` (new), `plugins/session-relay/test/final-scope.mjs` (new), `.github/workflows/build-binaries.yml` | 1b-8 | planned | A15-A18 pass. Main plan remains source of truth; implementation range has no plan/docs delta. Darwin runs portable behavior; final-scope rejects dirty/forbidden/plan classes; native dispatch refuses unpushed/mismatched SHA. |

## Acceptance criteria

Run Node commands from repository root with `PATH="$HOME/.cargo/bin:$PATH"`; every Cargo command explicitly changes directory to `plugins/session-relay/rust/` first so `rust-toolchain.toml` pins Rust 1.85.0. A criterion passes only with its stated evidence; skips, placeholder behavior labels, self-authored booleans, or empty fixtures fail.

`rust-test-inventory.mjs` owns a closed source-derived map for `lifecycle_managed`, `lifecycle_admission`, `lifecycle_supervisor`, `lifecycle_turn_cancellation`, `lifecycle_controller`, `process_identity`, and `lifecycle_proof`. For each target it parses `cargo test --test <target> -- --list`, requires a nonzero set, compares every required production behavior id to the listed tests, and then parses the executed test summary to require the same nonzero count with zero ignored/filtered required ids. `reentry-inventory.mjs --compile-fail` enumerates the actual sorted `lifecycle-capability-bypass/src/bin/*.rs` set from disk, compares it to its closed expected-boundary fixture, and accepts only the intended privacy/type/trait failure signature for each bin. Cargo exit 0 with zero tests is a hard failure everywhere.

| ID | Criterion | Command | Expected output/result |
|---|---|---|---|
| A0 | Verify the one-time clean bootstrap checkpoint before first implementation dispatch. | `test "$(pwd)" = /tmp/docks-primitives-collab && test "$(git branch --show-current)" = codex/primitives-collab && test "$(git rev-parse HEAD)" = 701cea7e671bc40ee23d69abf79ff102e0eecb20 && test -z "$(git status --porcelain)"` | Exit 0 once before implementation. This historical bootstrap precondition is not rerun after work advances or dirties the checkout. |
| A0b-bootstrap | Authenticate the preserved dirty Step-3b checkout before its missing helper can exist. | Run the exact multi-line **A0b-bootstrap command** in Environment from `/tmp/docks-primitives-collab`. | Exit 0 before any new edit. HEAD, NUL status, binary patch, five explicit untracked paths/modes/digests, and aggregate manifest match the orchestrator-observed values. Any staged/unstaged/untracked path, byte, symlink, or executable-mode change fails. This gate is used only to finish Step 3b. |
| A0c-step1b-bootstrap | Authenticate the first clean post-Step-3b handoff before the reusable helper exists. | Run the exact multi-line **A0c-step1b-bootstrap command** from Environment with orchestrator-recorded `PLAN_COMMIT`, `PLAN_BLOB`, and `STEP3B_HEAD`. | Exit 0 before the first Step-1b edit. Exact main plan snapshot, implementation branch/tip, clean status, and diff check match. Step 1b then commits the helper plus closed step allowlist; A0c is never reused. |
| A0b | After Step 1b creates the helper, bind every dispatch to plan snapshot, implementation tip, step allowlist, and exact WIP bytes. | `test -n "$PLAN_COMMIT" && test -n "$PLAN_BLOB" && test -n "$IMPL_HEAD" && test -n "$STEP_ID" && test -n "$WIP_PATCH_SHA256" && test -n "$WIP_UNTRACKED_SHA256" && test "$(git -C /home/vagrant/projects/docks log -1 --format=%H -- docs/plans/active/relay-worker-lifecycle-primitives.md)" = "$PLAN_COMMIT" && test "$(git -C /home/vagrant/projects/docks show "$PLAN_COMMIT:docs/plans/active/relay-worker-lifecycle-primitives.md" | git hash-object --stdin)" = "$PLAN_BLOB" && test "$(git -C /home/vagrant/projects/docks hash-object docs/plans/active/relay-worker-lifecycle-primitives.md)" = "$PLAN_BLOB" && test "$(git rev-parse HEAD)" = "$IMPL_HEAD" && node plugins/session-relay/test/wip-snapshot.mjs --verify --patch-sha256 "$WIP_PATCH_SHA256" --untracked-sha256 "$WIP_UNTRACKED_SHA256" --allow-step "$STEP_ID"` | Exit 0 before each post-1b worker step. Helper hashes binary HEAD diff and sorted path/git-mode/content manifest, rejects unexpected tracked/staged/unstaged/untracked/symlink/executable/rename/delete entries, and defines canonical clean hashes. New workers review verified WIP before edits. |
| A1 | Full feasibility evidence comes from the migrated committed harness. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/feasibility-probe.mjs --verify-current` | Exit 0; validates raw schema/hash chain; records protocol unavailability, 20s deadline, native process rows, and independent `cooperative_cgroup=<available|unavailable>` plus `filtered_hardening=<available|unavailable>` per runtime/platform. Cooperative requires fresh domain/gated placement/manager authority/kill/populated-zero and never requires freeze or seccomp. Filtered hardening records raw clone3 ENOSYS/no-child, legacy denial, policy hash, and real spawn/wait only where advertised. No stale `strong_cgroup` verdict can drive availability. |
| A1b | Raw Codex API ordering, hook health, stable generation switching, and experimental capability are feasible. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/feasibility-probe.mjs --case codex-managed-boundary` | Exit 0 with raw transcript: managed SessionStart runs before `thread/start` response and returns non-claiming success; returned id becomes a prototype claim candidate; no `turn/start` is sent before the prototype decision. This JS row is explicitly `feasibility_only`, not production binding. Hook snapshots record normalized expected/observed command digests+mismatch; generation/pointer crash/race prototype and experimental negotiation pass or typed unavailable. Production Rust claim is A6 only. |
| A2 | Core pending identity, unmanaged cancellation, and multi-operation lost-authority transitions are atomic, durable, typed, and controller-independent. | `node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_managed && (cd plugins/session-relay/rust && cargo test --locked --test lifecycle_managed -- --nocapture)` | Exit 0 with nonzero source-derived required IDs. Token hashing/pending creation, two-phase generic claim, durable waiter, exact duplicate/refusal, UnmanagedCanceling transfer, crash/reload, worker-only pre-binding refusal, and every typed multi-operation loss/source-state row pass without a Codex controller, app-server, or non-claiming hook assumption. Foreign bindings remain byte-identical; terminal/stale rows are audit-only. |
| A3a | Capabilities bind authority and preserve publish-first fencing/attach lifetime. | `node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_admission && (cd plugins/session-relay/rust && cargo test --locked --test lifecycle_admission -- --nocapture) && node plugins/session-relay/test/reentry-inventory.mjs --compile-fail` | All exit 0 with nonzero required IDs. Wrong target is inexpressible and wrong `OperationKind` refuses at use; source finds zero lifecycle-sensitive `exec`; closed launch specs have no raw authority selectors; guard A cannot operate on B. Compile-fail enumerates every `src/bin/*.rs`, fails if one is skipped, and proves each fails at the expected capability boundary rather than an unrelated compiler error. |
| A3b | Detached watchdog/supervisor own each transition-capable CLI child from birth and preserve attach/wake I/O without depending on the later app-server controller. | `node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_supervisor && (cd plugins/session-relay/rust && cargo test --locked --test lifecycle_supervisor -- --nocapture) && node plugins/session-relay/test/supervisor-custody.mjs --matrix && node plugins/session-relay/test/reentry-inventory.mjs --compile-fail` | Exit 0 with nonzero required IDs. Source-derived portable startup phases inject before/after failure. Rows prove both bootstrap pipes, zero bootstrap fds, independent SID/custody, numeric bind/heartbeat deadlines, CLI Control bind/EOF cancellation, caller death before/after spawn, exact operation/handoff versions, pipe/PTY proxy, kill/wait/reap, compatibility, and zero-byte stale events. No managed Codex token, `ControllerReady`, non-claiming SessionStart, or app-server behavior is required before Step 5. |
| A3c | Exact-turn and supervisor-owned-child cancellation close the guard-drain cycle within fixed bounds. | `node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_turn_cancellation && (cd plugins/session-relay/rust && cargo test --locked --test lifecycle_turn_cancellation -- --nocapture) && node plugins/session-relay/test/lifecycle-smoke.mjs --case cancellation-custody && node plugins/session-relay/test/reentry-inventory.mjs --compile-fail` | Exit 0 with nonzero required IDs. Send/response/terminal/child-ignore barriers and every lost-authority source/reason/crash row pass. Each custody/handoff CAS checks exact versions; delayed losers audit only. Cancellation interrupts exactly the persisted turn and accepts only matching terminal. Every wait ≤100 ms; one 5s deadline ends terminal/reap/handoff or applies the closed state-specific Unconfirmed path. Guard releases while supervisor retains child authority. |
| A3d | Every production re-entry wrapper is guarded before any mutation-guiding observation and has executed behavior evidence. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case reentry-matrix && node plugins/session-relay/test/reentry-inventory.mjs --behavior-evidence` | Exit 0; wake/watch admission precedes the first mutation-guiding status RPC, a fence during status discards the stale response and emits no later mutation, and fenced first-read preserves mailbox. Every source-derived generic mutator/caller and every `OperationKind` names a unique executed behavior-test id covering success, wrong kind/epoch, pre-fence, and mid-block fence; no placeholder/rationale/fixed-count/name-only PASS remains. First-birth collision with an existing fenced id refuses registration and never starts a turn. |
| A4 | No check-then-kill path can signal a recycled identity, and exit proof requires terminal handle evidence. | `node plugins/session-relay/test/rust-test-inventory.mjs --case process_identity && node plugins/session-relay/test/process-signal-inventory.mjs && (cd plugins/session-relay/rust && cargo test --locked --test process_identity -- --nocapture)` | All exit 0 with nonzero required IDs. Inventory rejects ObservationOnly/start-check+kill; deterministic PID substitution receives zero signal; real pidfd-open-before-validation targets only the pinned task; `PidFdExitProof` cannot construct before terminal evidence; live unreaped-Child signaling affects only its child; Darwin/no-pidfd returns Unconfirmed. |
| A5 | Tree proof requires fd-bound exec-stop production placement and same-fence kill evidence; filtered hardening remains separate. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case containment` | Exit 0; exact supervisor `launch_confined` verifies private host-PID handoff, seizes the blocked final task with `PTRACE_O_TRACEEXEC`, verifies gated leaf placement, releases only trusted setup, observes exact `PTRACE_EVENT_EXEC`, matches retained-fd and stopped-child kernel executable identity, and only then detaches/GO. Hash→path replacement executes pinned original or refuses. Forged PID, early release, seize/event timeout, exec/detach failure, scripts/symlinks, membership mismatch, and target sentinel before detach all fail. Same constructor mints kill receipt; stale/cache/boot/leaf changes refuse. |
| A5b | CI/release regression drives BOTH real runtimes through the exact production confined launcher; captured receipts never authorize another launch. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/runtime-hook-abort.mjs --case cgroup-cooperative-child-spawn --matrix` | Exit 0. Harness calls production supervisor/`launch_confined`, captures private PID-handoff/seize/exec-event/fd+kernel identity/placement and same-fence kill receipts, then creates real child/grandchild/storm under leaf and reaches populated-zero. A target sentinel proves no target instruction before detach. A second worker mints a distinct receipt. Rows state `authoritative_for_production=false`; fixture/cached path cannot reach GO. Claude filtered hardening remains separate. |
| A6 | Real production managed admission and durable controller are runtime-correct. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/runtime-hook-abort.mjs --matrix` | Exit 0. Claude barriers pass. Codex SessionStart-before-response/skipped/timeout rows return without claim; supervisor-local token creates pending and controller alone claims Active. Captured controller stdio transcript has zero `turn/start` frames before the durable Active record—not merely zero model output. Expired/foreign-Active/foreign-Fenced/pre-publication/controller-loss rows preserve foreign state and fence only owned custody. After caller exit, a second invocation uses one typed envelope/result. Numeric/string ID collision, cross-thread terminal ref, every generated server-request row, unknown method, ambiguous response, and controller/server/supervisor death follow typed loss/zero-byte rules. No CLI fallback/bypass. |
| A6a | Managed Codex controller unit/cross-process authority is complete after Step 5. | `node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_controller && (cd plugins/session-relay/rust && cargo test --locked --test lifecycle_controller -- --nocapture) && node plugins/session-relay/test/appserver-schema-contract.mjs --verify-current --codex "$(command -v codex)"` | Exit 0 with nonzero required IDs. Supervisor-local token secrecy, pending→thread/start→claim→ControllerReady ordering, caller death before/after takeover, exact retries/refusals/loss, every command→persisted-authority row, auth-record single consumption, cross-family/replay/expiry zero-byte behavior, numeric/string RPC ids, sealed terminal refs, and generated server-request policies pass without relying on real-model output. Same retained native fd supplies the fixture probe and managed launch; exact supported Codex schema/version/target/executable identity matches before pending creation or Active. |
| A6b | Source-built N/N+1 payloads exercise the actual committed Codex hook definitions through real runtime events and crash-atomic monotonic selection. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/runtime-hook-upgrade.mjs --matrix` | Exit 0. Isolated authenticated real Codex uses source-built target plus synthetic N/N+1 payloads with exact hook JSON, both lockstep manifests, and `bin/SHA256SUMS`. Old live UserPromptSubmit and new/subagent SessionStart sentinels prove event names/stable current; complete stdout parses as exactly one hook JSON (installer JSON suppressed). Barriers delete root after directory test, before launcher exec, and during manifest/checksum reads; each falls back only after exact root absence. Present missing/nonexec/symlink launcher and validation failure with root present fail. Lock/generation/pointer crash/races pass. Implementation evidence is not packaged evidence; direct command/helper invocation cannot satisfy it. |
| A6c | Installer and doctor expose the exact closed consumer contract without promoting diagnostics to proof. | `node plugins/session-relay/test/runtime-hook-upgrade.mjs --case doctor-schema` | Exit 0; implementation and schema independently validate every committed golden: doctor ready/degraded/unavailable exit 0; install changed/current/lower-no-op exit 0; typed command inability exit 3; usage/schema 2; validation/tamper 4; I/O/lock 5. Unknown capability/reason/extra/malformed field fails. Both payload/hook digests and literal hook inventory fields match; human stderr cannot classify state. |
| A7 | Real app-server fencing distinguishes exact cancellation, shared observation, current ProtocolTree unavailability, and physical kill. | `RELAY_REAL_RUNTIME_TEST=1 node plugins/session-relay/test/runtime-appserver-quiescence.mjs --matrix` | Exit 0; initialize advertises `experimentalApi=true` before descendant/turn/item/terminal methods and records runtime/method availability; unsupported methods fail typed. Exact interrupt reaches matching terminal; each terminal is paged and terminated only through its sealed same-attempt reference. Shared rows remain observation; current dedicated rows report MissingDurableFlushContract. Physical cgroup kill produces only WorkerTree. |
| A8 | Protocol recovery is attempt-bound, terminal-boundary, and finite, with a fake/future positive adapter only. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case appserver-recovery` | Exit 0; fake positive proof requires one attempt binding across flush, thread, turn, terminal, boundary, and evidence hashes plus mutation rejection/watermark/reap/offline pagination. Mixing any nested N receipt into N+1 is rejected before FenceEvidence. Missing/partial evidence and all prior negative rows return ProtocolIncomplete ≤20s. Real Codex cannot construct DurableFlushReceipt. |
| A9 | Every mutator has a concrete matching capability and executed behavior evidence. | `node plugins/session-relay/test/reentry-inventory.mjs` | Exit 0; scans generic outbound app-server request primitives plus all callers, every drain/resume/inject/start/interrupt/list/terminate, process create/exec/signal, and pending acknowledgement. Each maps to target-free `ReentryGuard`, exact-owned-turn `TurnCancellationPermit`, or sealed post-drain `FencePermit`, plus a unique executed behavior-test id. Pure reads are source-verified and cannot guide later mutation after their guard goes stale. First-birth process/thread creation remains a source-verified non-reentry class only when its collision path proves it cannot attach to an existing fenced id. Source-derived N is reported, never fixed in a fixture; no rationale/name-only row passes. |
| A10 | Every production re-entry surface enforces target/kind/binding/cancellation epoch at use. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case reentry-matrix` | Exit 0; one production-wrapper row per source-derived `OperationKind` covers success, wrong kind, stale binding, pre-fence, and mid-block fence with externally observable no-mutation evidence. Wake/watch mutation-guiding status is inside admission and stale responses are discarded. Fenced rows emit no context/RPC/process; queue/peek remain allowed. No row prints a generic placeholder label. |
| A11 | GC cannot erase durable authority/custody and preserves legacy Unmanaged aging. | `node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_managed && (cd plugins/session-relay/rust && cargo test --locked --test lifecycle_managed -- --nocapture)` | Exit 0 with nonzero required GC IDs. Aged lifecycle states plus `UnmanagedCanceling`, pending/Claiming/Managed binding, tombstone, lock, proof, unresolved custody, supervisor/watchdog/socket/heartbeat, handoff, and stale audit survive. Only plain old Unmanaged enters `GcDeleting`; deterministic crash/race barriers preserve exact bytes and Entry/binding removal remains last. |
| A12 | Operator transitions, retention recovery, session-operation recovery, supervisor reports, custody CAS, and competing fencers are exact-version. | `node plugins/session-relay/test/lifecycle-smoke.mjs --case reconcile` | Exit 0; injected crash after durable FenceProofRecord/Fenced resumes exactly once to TerminalRetained; release rejects a different proof hash. Session reconcile uses exact binding/operation/current custody version plus stable cancellation epoch; abandonment prints NOT QUIESCENCE-PROVEN. Stale completions are audit-only. Tombstone aging obeys the explicit reference and ordinary-cutoff rule. |
| A13 | Proof validation and capability families are exhaustive, sealed, scope-safe, epoch/attempt-bound, phase-correct, and threat-model-labeled. | `node plugins/session-relay/test/rust-test-inventory.mjs --case lifecycle_proof && (cd plugins/session-relay/rust && cargo test --locked --test lifecycle_proof -- --nocapture) && node plugins/session-relay/test/reentry-inventory.mjs --compile-fail` | All exit 0 with nonzero required IDs. Backend×scope×evidence rows pass. Process/protocol/boundary/kill/fence fields are private. Compile-fail auto-enumeration rejects fabrication/mutation at expected boundaries; runtime rows reject later-fence replay, nested attempt mixing, cached authorization, pre-kill promotion, serialized tamper, stale controller/supervisor, cross-thread terminal refs, and host/runtime executable mismatch. Current Codex cannot build offline boundary. |
| A14 | Existing behavior remains green. | `(cd plugins/session-relay/rust && cargo test --locked) && node plugins/session-relay/test/selftest.mjs` | Exit 0; all Rust tests pass and selftest ends with its runtime-derived PASS count. Ordinary unmanaged hook/output/mailbox bytes remain compatible; attach output remains compatible except the intentional guarded spawn+wait behavior. |
| A15 | Formatting and warnings are clean. | `(cd plugins/session-relay/rust && cargo fmt --check && cargo clippy --locked --all-targets -- -D warnings)` | Exit 0, no format diff, no warnings. |
| A16 | Four architectures compile; the portable supervisor runs natively on both Darwin architectures. | `node plugins/session-relay/test/run-build-matrix.mjs --ref codex/primitives-collab --sha "$(git rev-parse HEAD)"` | **Owner approval is still required immediately before push/dispatch.** Exact clean remote SHA only. Linux targets compile; macos-15-intel and macos-15 run the portable A3b subset including getpeereid, new session, PTY, resize, signals, EOF, health/control, and watchdog. Any compile-only architecture is not advertised filtered-hardened without a native probe. |
| A17 | Full plugin/repo gates pass. | `node scripts/ci.mjs` | Exit 0 with all repo/plugin guards, Rust, selftest, hooks, skills, and manifests green; documented local binary digest warning only. |
| A18 | The exact clean implementation tip is scoped and contains no binary/release/docs mutation. | `test "$(git branch --show-current)" = codex/primitives-collab && test "$(git rev-parse HEAD)" = "$IMPL_TIP" && test -z "$(git status --porcelain)" && git diff --check 12cf2ea.."$IMPL_TIP" && test -z "$(git diff --name-only 12cf2ea.."$IMPL_TIP" | rg -v '^(plugins/session-relay/(rust/src/.*|rust/tests/.*|rust/Cargo\.(toml|lock)|hooks/.*|test/.*|AGENTS\.md|skills/productivity/session-relay/SKILL\.md)|\.github/workflows/build-binaries\.yml)$')" && test -z "$(git diff --name-only 12cf2ea.."$IMPL_TIP" -- docs/plans)" && node plugins/session-relay/test/final-scope.mjs --negative-matrix --base 12cf2ea --tip "$IMPL_TIP"` | Exit 0 with exact reviewed HEAD/clean status. Sentinel disposable helper proves staged/unstaged/untracked, forbidden binary/manifest/version, any `docs/plans/**`, rename, and deletion classes fail independently. The historical branch-added plan copy is removed so its net range is empty; main plan is untouched. Concurrent main-plan commits are outside range. |

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
- A new process group is not a new session. On Rust 1.85 use the reviewed async-signal-safe `pre_exec(libc::setsid)` path; `process_group(0)` alone does not detach custody.
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
- Cgroup placement evidence exists before GO; kill/populated-zero evidence exists only after fencing. Never put terminal booleans into the immutable live boundary or reuse the A5b fixture transcript as per-worker action proof.
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
- Target x86_64+aarch64 musl-linux and Darwin builds.
- Fallback tiers can never claim a stronger scope than their evidence.
- Keep primitives general and independently testable; fan-out is only the first consumer.
- WorkerTree guarantees are bounded to the explicit cooperative-worker threat model unless the owner chooses a future adversarial-isolation expansion.
- Claude managed full-access requires the UserPromptSubmit barrier plus numeric supervisor deadline; Codex managed full-access requires controller-withheld first turn. Any WorkerTree claim additionally requires that runtime's fd-bound physical-containment capability. Hook health remains diagnostic for Codex.
- Never weaken validators, security fences, test assertions, or binary provenance.

## STOP conditions

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
- The source-derived inventory finds an unmapped generic mutator/caller, a rationale-only mutation, a placeholder/name-only behavior row, a mutation-guiding status RPC before admission, or a lower API callable without matching sealed `ReentryGuard`/`TurnCancellationPermit`/`FencePermit`.
- Claude first SessionStart or Codex direct app-server claim cannot publish Claiming/increment epoch first, drain older guards, exact-CAS Managed, or reject conflicting/replayed identity/server/controller; duplicate semantics differ from the table; or Codex emits `turn/start` before Active.
- GC removes or makes unreachable any non-releasable worker, pending claim, active operation/custody handoff/supervisor record, session binding, tombstone, fence marker, lifecycle lock, proof, or audit surface.
- Unmanaged GC deletes any surface before exact `GcDeleting` publication, permits pending/Claiming/admission across that state, rolls back after deletion begins, or cannot idempotently resume an exact `gc_epoch` after crash.
- `finish_fence` accepts root/process/protocol evidence for a recorded WorkerTree requirement, or any tracked-tree path returns confirmed.
- A confirmed fence lacks an immutable fence-bound proof record, `Fenced→TerminalRetained` has no idempotent crash-resume path, release accepts a different proof hash, or a setup-time cgroup boundary constructs proof without a same-fence post-kill receipt.
- Any custody/supervisor/fence action or finish/timeout/reconcile/release/abandon transition omits exact operation+handoff+generation+claim/fence epoch+version validation/CAS, or a stale actor changes newer state.
- `FenceIntent`, pidfd-exit/owned-child-reap/cgroup proof is caller-constructible or proof-critical cgroup fields are externally mutable without the private matching supervisor constructor.
- The installed current-Codex adapter constructs `ProtocolTreeProof` or `DurableFlushReceipt`; app-server proof uses live shared/equal scan, `clean {}`, stdio EOF, internal shutdown, freeze, process kill, or unflushed offline artifacts; exact terminal pagination is incomplete; or the 20s deadline expires without `ProtocolIncomplete`.
- Any protocol proof-critical field is publicly constructible/mutable, omits worker/generation/server/supervisor/fence binding, replays across reconcile, or experimental list/filter methods run without negotiated `experimentalApi=true`.
- A1 can pass with fabricated booleans, A5b does not run both real runtimes in recorded host delegation context, A6 omits Claude timeout/block or Codex pre-Active zero-turn evidence, A6b omits old+new session cache-prune/tamper rows, A7 never starts real writers, or A9 uses a fixed count/placeholder test id.
- Managed attach performs GC/register/marker/mailbox drain before Claiming publication, waits while holding the global lock, deadline formula exceeds 20s, or global lock timeout is lengthened.
- Managed Codex uses CLI/TUI fallback, treats a hook-health snapshot as atomic spawn authority, uses the hook-trust bypass in production, emits a first turn before direct Active claim, or runs a hook from a pruned versioned path instead of the valid stable runtime.
- The committed Codex hook command begins with a versioned plugin executable, old cached command is not executed verbatim after deleting its whole plugin root, stable install lacks the exclusive owner-checked lock/immutable generation/single atomic pointer, concurrent lower install can overwrite higher, or any crash selects mismatched binary/record bytes.
- Managed Codex SessionStart claims/waits/blocks `thread/start`; the original caller owns the active app-server transport; later relay invocation cannot issue a typed guarded command; arbitrary JSON/target forwarding exists; or controller/server/caller failure can reconnect/guess instead of typed loss.
- A supervisor/watchdog failure updates only one of multiple matching operations, rewrites an original typed reason, has no already-UnmanagedCanceling/FencingUnconfirmed/terminal row, or a current terminal report mutates lifecycle/custody.
- A0b-bootstrap hashes differ before first repair, the first Step-3b edit precedes that gate, Step 1b starts before Step 3b is clean/committed, or final A18 accepts dirty/non-current HEAD.
- Shared-server loss has neither actionable status/reconcile nor explicit audited abandonment, or abandonment is presented as quiescence.
- Three attempts repeat the same test/lint failure without a new diagnosis; append `## Mistakes & Dead Ends` and reassess.

## Cold-handoff checklist

1. **File manifest:** present — each step names exact existing/new paths; cited baseline callsites carry checkpoint/path evidence in Sources.
2. **Environment & commands:** present — path-specific plan/blob, exact helper-free preserved-WIP command, later helper hashes/step manifest, cross-filesystem handoff, versions, four targets, shell-first stable runtime, isolated real-runtime setup, measured deadline, and exact gates are specified.
3. **Interface & data contracts:** present — non-claiming SessionStart plus controller-only claim, durable app-server controller, typed multi-operation loss batches, stable cancellation/custody versions, explicit nonce pipes/control epoch, source-derived startup phases, executable-bound cgroup receipts, attempt-bound protocol proof, locked immutable runtime generations, doctor/install schemas, tombstone GC, and operator APIs are explicit.
4. **Executable acceptance:** present — A0/A0b-bootstrap/A0b–A18 plus A1b/A3a–A3d/A6b/A6c are command + expected evidence, including real cached-command upgrade, later-process controller wake, doctor schema, bootstrap FDs, multi-operation reason retention, attempt replay, production cgroup path, native Darwin, dirty final diff, and source-derived behavior ids.
5. **Out of scope:** present — fan-out specifics, unsafe raw signaling, adversarial same-UID broker isolation, privileged helpers, arbitrary clients, shared-server kill, binaries/releases, and unrelated changes are excluded.
6. **Decision rationale:** present — every non-obvious choice is tied to a red-team defect and failure mode.
7. **Known gotchas:** present — TOCTOU, Unmanaged attach transition, capability substitution, fence epoch, namespace/remount/proc/fd/ABI escape, freeze/unflushed lineage, broker scope, GC, and timing traps are explicit.
8. **Global constraints verbatim:** present — feasibility-first, no external work under locks, targets, and honest tiering are carried forward.
9. **No undefined terms / forward refs:** present — every state, scope, guard, proof, receipt, test harness, and structured question is defined; no TODO/TBD remains.

Adversarial cold-read result: Draft-16 closes Draft-15's remaining dependency and wire gaps: controller assertions move wholly after Step 5; the nonzero inventory is born in Step 3b; PTRACE_SEIZE+TRACEEXEC creates a real pre-target exec stop; every controller command consumes one persisted capability-family authorization; the exact Codex schema/executable fixture is regenerable; hook stdout is one JSON document and cache-prune races recheck; hooks/list nullability/error placement and user-input error policy match generated 0.144.1; installer manifest/checksum/target paths are exact; and final range forbids all plan docs. No owner decision remains open; immutable dual re-review is pending. Implementation stays paused; remote push/dispatch and packaged producer/release gates remain owner approvals.

## Decision log

- **Resolved 2026-07-11** — `threat-model-scope`: owner selected **Option 1, `CooperativeWorkerV1`**. Implementation and acceptance adopt the cooperative model; broker-assisted same-UID evasion is out of scope. See ## Threat model.

- **Resolved 2026-07-11** — `codex-cooperative-cgroup-tier`: the filtered candidate passes Claude but blocks Codex's normal `bwrap` namespace/mount path, so the owner selected **Option A**: a `ConfinedCgroupCooperative` WorkerTree tier for both runtimes and a separate Claude-only `FilteredCgroupHardening` best-effort layer. Primary-source re-review preserves the decision but tightens it: the cooperative proof is gated placement into a fresh domain leaf with empty `cgroup.subtree_control`, retained fd, `cgroup.kill=1`, and `populated=0`; freeze is optional observation. Direct placement classifies `EACCES|EBUSY|EOPNOTSUPP|ENOSYS` plus narrowly validated unsupported-feature `EINVAL` and falls back only to separately proven stop/GO. In-model ordinary/nested descendants must remain in the leaf; intentional same-UID migration/brokers are diagnostic and outside `CooperativeWorkerV1`. Option B and Option C remain rejected.

- **Resolved 2026-07-12** — `codex-managed-boundary`: owner approved replacing managed hook-born Codex CLI with relay-owned dedicated app-server birth. The controller binds the exact `thread/start` id before first `turn/start`; CLI/TUI/third-party fallback is unmanaged and never inherits the guarantee.

- **Resolved 2026-07-12** — `stable-hook-runtime-ownership`: Docks/session-relay owns the standalone monotonic stable-runtime installer and hook command because plugin safety cannot depend on another repo. docks-kit may proactively deploy/verify that same interface and expose status, but cannot become the sole safety owner.

## Self-review

Score: **95/100 (Draft-16 author candidate; independent re-review pending)** · trajectory **95 Draft-15 author → 82 architecture / 72 acceptance NOT READY → 95 dependency/exec-stop/wire-schema repair** · stopped: **candidate will be frozen for fresh review; implementation remains paused**.

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
