---
title: Add bounded relay worktree fan-out
goal: Let one managed relay worker run two isolated depth-1 children and collect their committed handbacks with process-only lifecycle proof.
status: ongoing
created: "2026-07-10T22:57:23-03:00"
updated: "2026-07-14T18:52:55-03:00"
started_at: "2026-07-14T18:52:31-03:00"
assignee: null
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: xhigh
review_waivers: []
tags: [session-relay, orchestration, rust]
affected_paths:
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/fanout.rs
  - plugins/session-relay/rust/src/lib.rs
  - plugins/session-relay/rust/src/lifecycle.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/tests/fanout.rs
  - plugins/session-relay/test/fanout-smoke.mjs
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/AGENTS.md
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
related_plans:
  - docs/plans/finished/2026-07-14-relay-worker-lifecycle-primitives-continuation.md
review_status: null
planned_at_commit: f0f32b14fa7ede042d85ebf00c0dd1dc30c27e7e
execution_base_commit: 649f8e93ee2994e8ef5da089bec10b742c09920b
---

# Add bounded relay worktree fan-out

## Goal

Add one deliberately small orchestration layer on top of Session Relay 0.11's
managed lifecycle: a registered session may spawn an isolated depth-0 root, the
root may run at most two isolated depth-1 children, every worker returns a clean
committed handback, and its parent explicitly collects that commit. A slot is
released only after a detached supervisor has reaped the exact child process and
the existing lifecycle authority has made the worker `TerminalReleasable`.

## Context & rationale

The prior Draft-4 combined fan-out with worker-tree confinement, app-server
cancellation, lease stealing, automatic GC, and historical recovery. The user
explicitly reset that scope: ship the lifecycle behavior safely, use a small
plan and concise reviews, and treat historical recovery as context rather than a
product guarantee.

Session Relay 0.11 now supplies exact managed birth, re-entry fencing, durable
`lifecycle-v1.json` authority, supervisor-owned process evidence, and fail-closed
`FencingUnconfirmed`. Fan-out will extend that authority instead of adding
lifecycle fields to the legacy discovery registry. The supported guarantee is
`RequiredScope::ProcessOnly`; a reaped CLI child does not prove that an escaped
descendant is gone.

## Environment & how-to-run

- Repository: `/home/vagrant/projects/docks`, `main` at `f0f32b14fa7ede042d85ebf00c0dd1dc30c27e7e` when drafted.
- Rust toolchain and lockfile: `plugins/session-relay/rust/rust-toolchain.toml`
  and `plugins/session-relay/rust/Cargo.lock`.
- Focused Rust commands run from `plugins/session-relay/rust/`; Node tests and
  project CI run from the repository root.
- Project CI command: `node scripts/ci.mjs` (run once after the focused ladder).
- Committed binaries come only from `.github/workflows/build-binaries.yml`.

## Interfaces & data shapes

### CLI

```text
relay spawn <repo> --fanout --from <session> [existing CLI spawn flags] -- <task>
relay spawn <repo> --worktree --from <root-session> [existing CLI spawn flags] -- <task>
relay handback --from <managed-session> --status completed|failed [--note <text>]
relay collect <managed-session> --from <parent-session>
```

`--fanout` creates an isolated depth-0 root. `--worktree` without `--fanout`
creates a depth-1 leaf and is accepted only from the active root. Both reject
`--server`, `--read-only`, forged ancestry flags, non-git repositories, and a
source session from a different git common directory. The cap is fixed at two;
there is no flag or environment override.

### Durable fan-out authority

Add `$AGENT_RELAY_HOME/fanout-v1.json` with schema `1` and a `records` map.
Fan-out and lifecycle operations read both authorities under the existing
`.lock`, but keep the files separate so a still-running v0.11 relay never sees
an unknown lifecycle state key. Cross-file mutations use fail-closed ordering:
reserve first, create/bind the managed worker second, and release lifecycle
capacity before making a record non-counting. A crash between writes therefore
retains a slot or an uncollected record; it never frees capacity early.

```rust
pub enum FanoutState { Reserved, Running, HandedBack, Collecting, Collected, FailedNoProcess }
pub enum CollectionPhase { Prepared, Merged, WorktreeRemoved }

pub struct FanoutRecord {
    pub reservation_id: String,       // UUIDv4; key before runtime birth
    pub parent_session_id: String,    // resolved registered UUID
    pub root_reservation_id: String,  // self for depth 0; parent's root for depth 1
    pub depth: u8,                    // only 0 or 1
    pub state: FanoutState,
    pub version: String,              // decimal CAS version
    pub repo_common_dir: String,      // canonical diagnostic path
    pub repo_dev: String,             // lossless decimal stat identity
    pub repo_ino: String,
    pub worktree: String,
    pub branch: String,               // relay/fanout-<reservation_id>
    pub base_sha: String,
    pub worker_id: Option<String>,
    pub generation: Option<String>,
    pub runtime_session_id: Option<String>,
    pub handback_head: Option<String>,
    pub handback_status: Option<String>,
    pub handback_note: Option<String>,
    pub collection_phase: Option<CollectionPhase>,
    pub last_error: Option<String>,
}
```

The two-slot count is one locked read of every depth-1 record belonging to the
root. `Reserved`, `Running`, and any record whose managed worker is missing or
not `TerminalReleasable` consume a slot. `TerminalRetained` and
`FencingUnconfirmed` therefore remain counted. `FailedNoProcess` is a
non-counting terminal state allowed only after the supervisor proves spawn
never returned a child and relay removes the exact clean, unchanged worktree;
if either proof or removal fails, the record stays `Reserved` and counted.
`Collected` is terminal.

### Process ownership and handback

Fan-out spawn starts a detached `__fanout-supervisor`. The supervisor creates
the pending managed birth with `ProcessOnly` + `SupervisorOwnedProcess`, owns the
unreaped `Child`, publishes its exact PID/start observation to a fan-out custody
operation, waits for birth, and attaches the runtime UUID to the reservation.
The foreground command reports success only after the record is `Running` and
the managed worker is exactly `Active`.

`relay handback` is parent-authorized data, not inbox text. It requires a clean
worktree, captures `HEAD` itself, rejects a depth-0 handback while any leaf is
uncollected, and atomically records `HandedBack`. The supervisor then publishes
the existing lifecycle fence, drains prior operations, terminates and reaps its
exact child process, seals the reap proof, and terminalizes the worker. Any
uncertain step retains the record and slot; it never guesses quiescence.

`relay collect` requires the exact stored parent, `HandedBack`,
`TerminalReleasable`, matching repository identity, a clean parent checkout,
and a clean child worktree. It persists `Collecting/Prepared`, merges the stored
head with `git merge --no-ff --no-edit <head>`, persists `Merged`, removes only
the exact registered worktree with `git worktree remove`, persists
`WorktreeRemoved`, then marks `Collected`. A retry skips phases already proven;
the relay branch is retained for manual audit and is never auto-deleted. If the
merge fails, relay runs `git merge --abort`, verifies the parent is clean, and
CASes back to `HandedBack`. If abort or cleanliness proof fails, it retains
`Collecting/Prepared` and prints the exact parent path plus manual
`git merge --abort`/cleanup guidance; retry remains refused until the parent is
clean.

## Steps

| # | Task | Files | Depends | Status | Done condition / revert trigger |
|---|---|---|---|---|---|
| 1 | Write failing tests for authority parsing, atomic ancestry/cap checks, fail-closed slot accounting, and process-reap release. | `rust/tests/fanout.rs`, `rust/src/lifecycle.rs` test helpers | — | planned | Focused tests compile and fail for missing behavior. Freeze their behavioral assertions before production edits. Reassess after three repeats of one failure. |
| 2 | Implement the separate fan-out authority, git worktree preflight, managed birth association, detached process ownership, handback, and retryable collection. | `rust/src/{fanout,lifecycle,spawn,lib}.rs` | 1 | planned | A1 and A2 pass; v0.11 lifecycle reads remain compatible; a third leaf is refused before worktree creation; uncertain custody remains counted; proven no-launch rollback is the only non-counting pre-birth failure; collection never removes an unmerged or dirty tree. Revert trigger: ordinary spawn or unmanaged lifecycle semantics change. |
| 3 | Expose the four CLI surfaces and add a deterministic black-box smoke using a temporary relay home, temporary git repo, and stub tool. | `rust/src/{main,cli,spawn}.rs`, `test/{fanout-smoke,selftest}.mjs` | 2 | planned | A3 and A4 pass without touching `~/.agent-relay`; forged parent/depth/cap input and a third concurrent reservation fail closed. |
| 4 | Document the bounded guarantee, run the focused ladder and one full plugin gate, then perform one concise completion review with at most one reproduced-finding repair pass. | `plugins/session-relay/{AGENTS.md,skills/productivity/session-relay/SKILL.md}`, this plan | 3 | planned | A1-A6 and project CI pass; review confirms the stated process-only guarantee and exclusions without reopening stronger containment or recovery scope. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `cd plugins/session-relay/rust && cargo test --locked --test fanout authority_` | Exit 0; separate-file v0.11 compatibility, atomic cap/ancestry, proven no-launch rollback, and fail-closed slot tests pass. |
| A2 | `cd plugins/session-relay/rust && cargo test --locked --test fanout custody_` | Exit 0; exact owned-child reap is required for release and uncertain custody stays counted. |
| A3 | `cd plugins/session-relay/rust && cargo test --locked --test fanout worktree_` | Exit 0; clean handback, idempotent collect phases, and dirty/unmerged refusal pass. |
| A4 | `node plugins/session-relay/test/fanout-smoke.mjs` | Exit 0 and print `fanout smoke: PASS`; two leaves hand back and collect, while a third is refused before worktree creation. |
| A5 | `node plugins/session-relay/test/selftest.mjs` | Exit 0 with the runtime-derived Session Relay PASS summary. |
| A6 | `cd plugins/session-relay/rust && cargo fmt --check && cargo clippy --locked --all-targets -- -D warnings` | Exit 0 with no formatting diff or warning. |

The project CI command recorded above runs once after A1-A6 and is not repeated
inside the acceptance inventory.

## Out of scope / do-NOT-touch

- Do not implement cgroups, pidfds, escaped-descendant detection, or
  `WorkerTree` release proof. This version guarantees the supervised CLI
  process only.
- Do not add app-server fan-out or change existing app-server spawn behavior;
  fan-out flags reject `--server`.
- Do not add automatic GC, lease stealing, historical reconstruction, branch
  deletion, cross-repository collection, depth greater than one, or a
  configurable cap.
- Do not add fan-out fields to `registry.json` or change existing `Entry`
  decoding; lifecycle-v1 remains the new authority boundary.
- Do not touch Docks plan-review policy, docks-kit, Effect Kit, marketplace
  manifests, versions, tags, or committed binaries during source implementation.

## Known gotchas

- Claude can use a pre-minted runtime id; Codex CLI is discovered after its
  SessionStart marker changes. The reservation UUID is therefore not a session
  UUID.
- A detached supervisor crash after process launch but before custody
  publication is ambiguous. Retain `Reserved` and its slot for manual repair.
- `lifecycle-v1.json` rejects unknown state keys by design. Fan-out authority
  must stay in `fanout-v1.json` while sharing the same store lock.
- A handback is valid only after all intended changes are committed and the
  worktree is clean. Inbox prose is never merge authority.
- Git worktree removal is recursive repository administration and must use
  `git worktree remove`; never pass it to the relay store's flat-file GC.
- Process reap is not descendant-tree proof. Documentation and state names must
  preserve that distinction.

## STOP conditions

- If the foreground can report a fan-out worker before exact `Active` birth,
  stop and fix the birth gate.
- If a third depth-1 reservation can create a branch or directory before cap
  refusal, stop and fix the locked reservation transaction.
- If collection can run without `TerminalReleasable`, a clean child, a clean
  parent, and matching stored repository identity, stop before removal.
- If supervisor loss or drain timeout could release a slot, retain the record
  and report the uncertainty instead.

## Cold-handoff checklist

- [x] Every step names exact production and test paths.
- [x] Toolchain, focused commands, project CI, and binary provenance are explicit.
- [x] CLI, authority record, cap, custody, handback, and collection contracts are defined.
- [x] Six ordered executable acceptance rows cover the stated behavior.
- [x] Stronger containment, app-server, GC, recovery, and adjacent plugins are excluded.
- [x] The reason for the smaller process-only contract is recorded.
- [x] Birth identity, ambiguous custody, git removal, and evidence traps are recorded.
- [x] Fixed cap `2`, depth `1`, schema `1`, and `ProcessOnly` are copied exactly.
- [x] No unresolved user decision, TODO, or undefined future dependency remains.

## Self-review

Score: 92/100 · one weighted score + single critique · stopped after the small-plan pass.

The critique removed automatic GC, app-server fan-out, force collection, branch
deletion, configurable caps, and whole-worker-tree claims. It also made the
supervisor-owned reap a prerequisite for slot release and made the third-worker
refusal precede every git mutation.

Cross-check (2026-07-14): [S: openai gpt-5.6-sol xhigh] 3 findings — accepted
S1/S2/S3: separate fan-out authority for v0.11 compatibility, proven clean
no-launch rollback before a non-counting terminal state, and verified
merge-abort recovery. One repair pass applied; no further draft-review leg was
opened.

## Review

(filled by plan-review on completion)

## Sources

- `plugins/session-relay/rust/src/spawn.rs:900` — ordinary spawn currently creates managed birth and waits for exact Active registration.
- `plugins/session-relay/rust/src/lifecycle.rs:957` — `LifecycleStore` owns locked lifecycle-v1 transactions.
- `plugins/session-relay/rust/src/lifecycle.rs:1333` — terminal release requires a fenced worker and exact owned-process evidence.
- `plugins/session-relay/rust/src/lifecycle.rs:4268` — release evidence is explicitly limited to `ProcessOnly` + `SupervisorOwnedProcess`.
- `plugins/session-relay/rust/src/lifecycle.rs:4456` — lifecycle-v1 rejects unknown state keys, requiring a separate fan-out authority for rolling compatibility.
- `plugins/session-relay/rust/src/supervisor.rs:95` — the shipped supervisor already models detached exact-child custody and reap.
- `plugins/session-relay/AGENTS.md` — producer-built binary and plugin verification rules.

## Mistakes & Dead Ends

- **2026-07-14T18:42:12-03:00**: Draft-4 treated historical recovery and stronger containment as first-release guarantees -> review expanded into unresolved platform primitives -> Draft-5 limits the product to exact supervised-process evidence and explicit collection.
