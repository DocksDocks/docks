---
title: Replace Relay messaging with typed SQLite IRC
goal: Replace Relay file messaging with separate typed IRC and job protocols, durable SQLite transactions, artifact-first delivery, and a fenced forward-only migration.
plan_hash_mode: status-excluded-v1
status: planned
created: "2026-08-05T03:40:58.144Z"
updated: "2026-08-05T03:50:22.194+00:00"
started_at: null
finished_at: null
assignee: null
tags: [session-relay, sqlite, irc, protocol]
affected_paths:
  - plugins/session-relay/AGENTS.md
  - plugins/session-relay/bus.mcp.json
  - plugins/session-relay/rust/Cargo.lock
  - plugins/session-relay/rust/Cargo.toml
  - plugins/session-relay/rust/src/adapters.rs
  - plugins/session-relay/rust/src/appserver.rs
  - plugins/session-relay/rust/src/artifacts.rs
  - plugins/session-relay/rust/src/bus.rs
  - plugins/session-relay/rust/src/channel.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/irc.rs
  - plugins/session-relay/rust/src/jobs.rs
  - plugins/session-relay/rust/src/lib.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/rust/src/migration.rs
  - plugins/session-relay/rust/src/outbox.rs
  - plugins/session-relay/rust/src/protocol.rs
  - plugins/session-relay/rust/src/sqlite.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/src/supervisor.rs
  - plugins/session-relay/rust/tests/adapter_conformance.rs
  - plugins/session-relay/rust/tests/bus_smoke.rs
  - plugins/session-relay/rust/tests/protocol_v2.rs
  - plugins/session-relay/rust/tests/sqlite_store.rs
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - plugins/session-relay/test/fixtures/rust-test-inventory.json
  - plugins/session-relay/test/rust-test-inventory.mjs
  - plugins/session-relay/test/scenario-follow-doctor-mailbox.mjs
  - plugins/session-relay/test/scenario-spawn-wake-supervisor.mjs
  - plugins/session-relay/test/selftest.mjs
related_plans:
  - docs/plans/active/ci-observability-and-test-contracts.md
---

# Replace Relay messaging with typed SQLite IRC

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"80bf36604ea7c5b484c5a452fea0afe959a6d050cf8d7f5494637ca0d47a2edc","invocations":1,"result_sha256":"e69f2912804bd2bd887b86a1f85d22722fb5adedf3a7c91ca24d1a32276e9886","state":"passed"},"execution_parent":null,"goal_id":"30fee75d-a1f7-40a9-9fcb-952b18fb2f4a","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-typed-irc-sqlite.md","plan_sha256":"2ce954c1a86005858a2c11e1630ff1dd2904fdbb7b76bdfd64a3f109a67ce34b","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"f035cecb-9cde-49a6-97dd-7a38985b17c4","schema":1,"source_base":"672246bd388d3f34475be70857e3ec0dcb222b23","source_sha256":"111224375b0f7e8671c814c2922705890f1a149eaa7f9b35f3492635f07c9046"}

## Goal

Ship a clean Session Relay communication generation in which separate IRC and task protocols use one transactional SQLite authority, adapters expose honest wake outcomes, large payloads stay outside model context, and both known users cross a fenced forward-only migration.

## Context & rationale

Relay currently offers legacy send/inbox plus typed request/reply claims, durable correlation, authorization, idempotent terminal replies, crash recovery, and internal fanout/worker result records. It does not expose the parent/worker surface, direct wake from send, explicit sequence/ack/dead-letter behavior, or OMP-like separation between IRC, job results, and process control. Claude delivery polls and drains before emission; Codex injection works only for authorized Relay-owned threads and can have uncertain post-injection outcomes. OMP’s useful pattern is explicit child context, bounded messages, artifact references, wake/revival receipts, separate Task results, and separate process control. Compatibility shims are unnecessary for the two known users, but authority must switch only after every legacy writer is fenced.

## Environment & how-to-run

Run from the repository root with the pinned Rust toolchain. Source builds and tests must cover Linux x64/arm64 musl and Apple Silicon macOS release constraints. SQLite must be embedded in the Relay binary, use a private Relay-owned state directory, and refuse unsupported or unsafe storage before mutation.

## Protocol, storage, and delivery authority {mechanism}

Versioned IrcEvent and JobEvent unions define separate public state machines and exhaustive producer-to-router tables. SQLite owns durable communication intent, correlation, sequence numbers, claims, outbox leases, delivery attempts, acknowledgements, and terminal records. The process supervisor alone owns PIDs, sockets, signals, heartbeat acceptance, and termination.

A write transaction commits the event, recipient sequence, durable claim or job transition, and outbox intent together. A lease uses a token and conditional update; external adapter calls occur after the transaction and never while a database lock is held. The completion transaction records one explicit outcome. Stable delivery identifiers and terminal uniqueness prevent duplicate logical delivery across retries and crashes.

Payload bytes live in digest-addressed artifacts outside SQLite. IRC and job rows contain authorization-scoped references and capped summaries. Adapter capability records distinguish stored, queued, injected, woken, revived, unsupported, uncertain, and failed outcomes. The API never equates storage success with wake success.

Migration is fenced and forward-only. All legacy writers first learn and enforce an authority epoch. The migrator quiesces writers, snapshots source bytes, validates counts, hashes, ordering, claims, and references, exercises both clients, and commits the SQLite authority marker last. Before that marker, recovery restores file authority; afterward, recovery only completes or repairs vNext.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | freeze_protocols | Define closed versioned IRC events, job events, authority matrix, adapter capabilities, artifact references, and producer-to-dispatcher exhaustiveness before storage changes. | `plugins/session-relay/rust/src/protocol.rs`; `plugins/session-relay/rust/src/irc.rs`; `plugins/session-relay/rust/src/jobs.rs`; `plugins/session-relay/rust/src/adapters.rs`; `plugins/session-relay/rust/tests/protocol_v2.rs` | — | `local` | `planned` | Every event variant has one router and consumer or hard refusal; IRC, job, and process-control values cannot cross routes; auth, sequence, overflow, idempotency, and terminal rules are executable. |
| 2 | build_sqlite_authority | Add the private SQLite store with atomic enqueue, claims/jobs, per-recipient sequence, outbox leases, delivery attempts, and schema migration transactions. | `plugins/session-relay/rust/Cargo.toml`; `plugins/session-relay/rust/Cargo.lock`; `plugins/session-relay/rust/src/sqlite.rs`; `plugins/session-relay/rust/src/outbox.rs`; `plugins/session-relay/rust/tests/sqlite_store.rs` | 1 | `local` | `planned` | Rollback journal plus `synchronous=FULL`, bounded busy handling, mode-0700/0600 custody, integrity and backup rules, kill recovery, and lease-token conditional updates pass deterministic cross-process tests; WAL remains disabled. |
| 3 | expose_irc_api | Replace legacy bus send/inbox with typed roster, direct/broadcast, send, request/reply, bounded mailbox, ack, and wait operations backed by the new authority. | `plugins/session-relay/bus.mcp.json`; `plugins/session-relay/rust/src/bus.rs`; `plugins/session-relay/rust/src/irc.rs`; `plugins/session-relay/rust/src/cli.rs`; `plugins/session-relay/rust/tests/bus_smoke.rs` | 1, 2 | `local` | `planned` | Addressing, receipts, reply correlation, wake intent, broadcasts, bounds, acknowledgement, and wait behavior are closed and every old caller has a typed replacement. |
| 4 | expose_job_api | Expose parent/worker jobs, progress, result references, desired cancellation, and observation-age status while leaving PID custody and signals in the supervisor. | `plugins/session-relay/rust/src/jobs.rs`; `plugins/session-relay/rust/src/supervisor.rs`; `plugins/session-relay/rust/src/bus.rs`; `plugins/session-relay/rust/tests/protocol_v2.rs` | 1, 2 | `local` | `planned` | SQLite owns durable intent/relations/events; supervisor owns acceptance, heartbeat, control socket, signals, and termination; cancel transitions requested→accepted→terminal without DB-issued process control. |
| 5 | add_artifact_delivery | Store payload bytes outside SQLite and deliver only capped summaries plus immutable authorized digest references by default. | `plugins/session-relay/rust/src/artifacts.rs`; `plugins/session-relay/rust/src/irc.rs`; `plugins/session-relay/rust/src/jobs.rs`; `plugins/session-relay/rust/tests/protocol_v2.rs` | 2, 3, 4 | `local` | `planned` | Full bytes never auto-enter messages, summary limits are enforced, explicit fetch verifies digest and scope, and pins protect referenced artifacts from garbage collection. |
| 6 | close_delivery_adapters | Implement capability-declared Claude, Codex, and available OMP/session adapters with distinct queued/injected/woken/revived/unsupported/uncertain/failed outcomes. | `plugins/session-relay/rust/src/adapters.rs`; `plugins/session-relay/rust/src/channel.rs`; `plugins/session-relay/rust/src/appserver.rs`; `plugins/session-relay/rust/src/outbox.rs`; `plugins/session-relay/rust/tests/adapter_conformance.rs` | 2, 3, 4, 5 | `local` | `planned` | External calls run outside DB leases; stable delivery IDs deduplicate; uncertain post-injection is not blindly retried; storage success and wake success are separately observable for every supported and refused operation. |
| 7 | fence_legacy_writers | Ship a legacy-writer fence at every old registry, mailbox, and protocol write entry before authority migration. | `plugins/session-relay/rust/src/store.rs`; `plugins/session-relay/rust/src/protocol.rs`; `plugins/session-relay/rust/src/cli.rs`; `plugins/session-relay/rust/src/main.rs`; `plugins/session-relay/rust/src/migration.rs` | 3, 4, 5, 6 | `local` | `planned` | An authority epoch prevents file-only writers from mutating after cutover; both known clients prove the fence before import; no dual-write path exists. |
| 8 | import_and_switch | Quiesce writers, snapshot legacy bytes, import exact counts/digests/order/correlation, exercise both clients, then commit the SQLite authority marker last. | `plugins/session-relay/rust/src/migration.rs`; `plugins/session-relay/rust/src/sqlite.rs`; `plugins/session-relay/test/scenario-follow-doctor-mailbox.mjs`; `plugins/session-relay/test/scenario-spawn-wake-supervisor.mjs`; `plugins/session-relay/test/selftest.mjs` | 7 | `local` | `planned` | Zero unresolved or malformed rows remain, both-client restart flows pass, rollback works before the marker, and all post-marker recovery moves forward in vNext without claiming downgrade support. |
| 9 | delete_old_message_store | Migrate every caller and remove obsolete raw bus, JSONL mailbox, protocol-v1 claim, stale-file recovery, and duplicated writer code while retaining Git custody and OS control surfaces. | `plugins/session-relay/rust/src/store.rs`; `plugins/session-relay/rust/src/protocol.rs`; `plugins/session-relay/rust/src/bus.rs`; `plugins/session-relay/rust/src/lib.rs`; `plugins/session-relay/rust/src/main.rs`; `plugins/session-relay/skills/productivity/session-relay/SKILL.md`; `plugins/session-relay/AGENTS.md` | 8 | `local` | `planned` | No current caller or test references the removed authority; only SQLite owns communication state; worktrees, filesystem artifacts, supervisor sockets, and Git authority remain separate. |
| 10 | gate_vnext_release | Register exhaustive protocol, storage, adapter, artifact, migration, restart, and fresh-binary contracts in the existing selected plugin gate. | `plugins/session-relay/rust/tests/adapter_conformance.rs`; `plugins/session-relay/rust/tests/protocol_v2.rs`; `plugins/session-relay/rust/tests/sqlite_store.rs`; `plugins/session-relay/test/fixtures/rust-test-inventory.json`; `plugins/session-relay/test/rust-test-inventory.mjs`; `plugins/session-relay/test/selftest.mjs` | 9 | `local` | `planned` | All producer/dispatcher variants, crash boundaries, migrations, adapters, and both-client flows are selected non-vacuously; the authoritative Session Relay plugin gate passes. |

## Acceptance criteria

| ID | Command | Expected result |
|---|---|---|
| A1 | `cargo test --locked --manifest-path plugins/session-relay/rust/Cargo.toml --test protocol_v2` | Exit 0; closed IRC/job matrices, authority, sequence, bounds, idempotency, cancellation, and terminal result contracts pass. |
| A2 | `cargo test --locked --manifest-path plugins/session-relay/rust/Cargo.toml --test sqlite_store` | Exit 0; atomic enqueue/outbox leases, busy exhaustion, kill recovery, integrity, backup, and migration transactions pass on the selected rollback journal. |
| A3 | `cargo test --locked --manifest-path plugins/session-relay/rust/Cargo.toml --test adapter_conformance` | Exit 0; every Claude, Codex, and available OMP/session capability returns the exact supported or refused durable outcome, including uncertain effects. |
| A4 | `node plugins/session-relay/test/selftest.mjs` | Exit 0 against an explicit fresh binary; both known-client migration/restart, artifact-first delivery, typed IRC, jobs, and process cleanup pass with no zero-selected group. |
| A5 | `node scripts/ci.mjs --plugin session-relay` | Exit 0; source-built Rust, native-relevant contracts, skills, hooks, distribution, release evidence, and vNext protocol gates pass. |

## Out of scope / do-NOT-touch

- Do not merge IRC, Task job/result, and process-control protocols.
- Do not use Session Relay state as PlanRun or plan-review evidence.
- Do not store full artifact payloads in SQLite or auto-inject them into model context.
- Do not enable WAL without a later measured local-filesystem decision and SQLite >=3.51.3.
- Do not retain dual-write compatibility or promise downgrade after the authority marker.
- Do not perform unrelated workspace custody, lifecycle GC, cleanup replay, guardian, or Git broker refactors in this plan.
- Do not publish or release vNext in this plan.

## STOP conditions

1. Any event variant lacks an explicit producer, router, consumer/refusal, authorization rule, or non-vacuous test.
2. A crash can lose a committed message/job or create a second logical terminal reply across enqueue, lease, external effect, or acknowledgement.
3. A delivery adapter cannot distinguish storage success, wake outcome, and uncertain post-injection state.
4. Artifact bytes can enter model context without explicit authorized fetch or a referenced artifact can be garbage-collected while pinned.
5. A legacy writer can mutate after the authority switch, import has unresolved rows, or rollback is attempted after vNext-only state exists.
6. The source-built or selected plugin gate fails on any supported release platform contract.

## Open questions

None. The clean forward-only cutover is approved for the two known users; publication and unrelated custody refactors remain separate goals.

## Review

N/A — manager-written after draft review.

## Verification Results

N/A — plan-only request; implementation and acceptance have not run.
