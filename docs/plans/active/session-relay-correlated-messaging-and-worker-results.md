---
title: Correlate Session Relay messages and worker results
goal: Add a backward-compatible correlated messaging protocol with bounded await/wait operations, explicit delivery outcomes, and immutable typed fanout worker results without making Session Relay a plan-review evidence transport.
status: planned
created: "2026-07-17T21:49:47-03:00"
updated: "2026-07-17T21:53:39-03:00"
assignee: null
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: high
review_waivers: []
tags: [session-relay, messaging, correlation, workers, protocol]
affected_paths:
  - plugins/session-relay/AGENTS.md
  - plugins/session-relay/rust/src/appserver.rs
  - plugins/session-relay/rust/src/bus.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/fanout/authority.rs
  - plugins/session-relay/rust/src/hook.rs
  - plugins/session-relay/rust/src/lib.rs
  - plugins/session-relay/rust/src/lifecycle.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/rust/src/protocol.rs
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/src/watch.rs
  - plugins/session-relay/rust/tests/bus_smoke.rs
  - plugins/session-relay/rust/tests/fanout.rs
  - plugins/session-relay/rust/tests/protocol_v2.rs
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - plugins/session-relay/test/selftest.mjs
related_plans:
  - session-relay-prebuilt-cli-distribution
  - plan-review-convergence-and-improver
review_status: null
planned_at_commit: 8d62f36ca33f4ae81a6928747cfc45ba369d5e84
execution_base_commit: null
---

# Correlate Session Relay messages and worker results

## Goal

Give cross-session callers the same useful coordination properties that Oh My Pi's in-session Agent Hub provides without copying its unsafe ephemeral assumptions. Every new Relay message gets stable message and correlation identities; replies explicitly name the message they answer; `send --await` and `relay wait` select only the matching reply and leave unrelated mail untouched; delivery and reply outcomes are separate closed values; and each fanout worker generation can publish one create-once typed terminal result.

The protocol remains a local cross-session coordination mechanism. It is never a canonical transport for Docks plan-review requests, reviewer outputs, receipts, lifecycle evidence, or plan-improver patches.

## Context and rationale

Current Relay mail is an append-only JSONL object assembled independently by the MCP bus and CLI. `store::enqueue` adds only `id` and `ts`; senders add `from`, `fromName`, `to`, `toName`, and `body`. A sender can queue and optionally wake a recipient, but cannot distinguish a reply to this request from the next unrelated message from the same session. CLI and MCP send results report a queue success plus a watcher snapshot, while watch/app-server paths use separate `Delivered`, `AckDeferred`, `Refused`, and failure enums that are not durable protocol receipts.

`spawn --fanout` already records parent, worker, generation, runtime session, branch, and handback state. Its prompt-level `reply_to` is only a destination hint; it is not a message linkage field. `collect` therefore cannot consume a closed immutable result value comparable to OMP's typed `SingleResult` metadata.

OMP provides three patterns worth reusing:

- `hub send` has a message id, `replyTo`, explicit delivery receipts, and optional bounded await.
- Unified `hub wait` consumes one matching buffered message without dropping other messages and treats timeout as a normal result.
- Task results separate worker identity, lifecycle outcome, output metadata, and artifact locations.

Relay must strengthen those patterns for a durable cross-process store. OMP's sender-only await matching, process-global ephemeral mailbox, drop-oldest cap, and non-cryptographic file-backed results are not sufficient here.

## Environment and commands

- Repository: `/home/vagrant/projects/docks`.
- Rust toolchain: `cargo +1.85.0`; never depend on the workstation default.
- Node runtime: Node 24 for repository tests and `scripts/ci.mjs`.
- Existing host binary smoke pattern: build `plugins/session-relay/rust/target/release/relay`, then pass it through `SESSION_RELAY_TEST_BIN`.
- TDD order: add `protocol_v2.rs`, bus, fanout, and black-box self-test cases first; run the focused commands and capture their expected failures before production edits. Do not rewrite assertions during implementation.
- Store isolation: every test sets a fresh `AGENT_RELAY_HOME`; no test may inspect or mutate the developer's real `~/.agent-relay`.

## Interfaces and data shapes

### RelayEnvelopeV2

New sends write a closed logical envelope while legacy JSONL rows remain readable:

```text
RelayEnvelopeV2 = {
  schema: 2,
  id: UUID,                    // unique envelope id
  ts: ISO-8601,
  correlation_id: UUID,        // stable request/reply conversation id
  reply_to: UUID | null,       // exact prior envelope id
  from: SessionId | null,
  fromName: string | null,
  to: SessionId,
  toName: string | null,
  body: string
}
```

Initial sends generate both `id` and `correlation_id` and set `reply_to:null`. A reply reuses the referenced envelope's `correlation_id` and sets `reply_to` to that exact envelope id. When `reply_to` is supplied without `correlation_id`, the immutable message index supplies it. When both are supplied, they must agree. Unknown, malformed, cross-correlation, wrong-recipient, or self-forged references fail before enqueue.

Existing v1 rows without `schema`, `correlation_id`, or `reply_to` continue through inbox, hook, and watch paths unchanged. Old send calls require no new argument. New readers normalize v1 rows only in memory; they never rewrite historical mailbox bytes.

### Immutable message index

Every v2 enqueue creates one mode-`0600` canonical-JCS metadata record under the Relay store before appending the mailbox row:

```text
MessageIndexV1 = {
  schema: 1,
  message_id: UUID,
  correlation_id: UUID,
  reply_to: UUID | null,
  from: SessionId | null,
  to: SessionId,
  body_sha256: 64hex,
  created_at: ISO-8601
}
```

The index is create-once and contains a body digest rather than a second plaintext body. Enqueue and index publication occur under the existing global store lock with rollback on failure, so neither can become authoritative alone. GC removes an index only after its mailbox row, correlation wait state, delivery journal, and worker-result references are quiescent under the existing retention policy.

### DeliveryReceiptV1 and result separation

Delivery is distinct from recipient execution and from reply arrival. A per-message append-only journal records closed transitions:

```text
DeliveryState = queued
  | injected
  | injected_ack_deferred
  | refused
  | failed_before_inject
  | ambiguous_after_inject

DeliveryReceiptV1 = {
  schema: 1,
  message_id: UUID,
  correlation_id: UUID,
  sequence: positive integer,
  state: DeliveryState,
  actor: "send" | "hook" | "watch" | "appserver",
  detail: string | null,
  recorded_at: ISO-8601
}
```

`queued` is always first after durable enqueue. `injected`, `injected_ack_deferred`, `refused`, `failed_before_inject`, and `ambiguous_after_inject` are terminal for one delivery attempt. A terminal state cannot be overwritten; a later explicit wake attempt appends a new attempt identity rather than rewriting history. Watcher liveness remains an observation in the send result, not proof of delivery.

```text
SendResultV2 = {
  schema: 2,
  outcome: "queued" | "replied" | "timeout" | "recipient_unknown" | "rejected" | "failed",
  message_id: UUID | null,
  correlation_id: UUID | null,
  delivery: DeliveryReceiptV1 | null,
  reply: RelayEnvelopeV2 | null,
  error: string | null
}

WaitResultV1 = {
  schema: 1,
  outcome: "replied" | "timeout" | "sender_unknown" | "correlation_unknown" | "rejected" | "failed",
  correlation_id: UUID,
  awaited_message_id: UUID | null,
  reply: RelayEnvelopeV2 | null,
  error: string | null
}
```

Timeout is a successful command result, not a transport error. Delivery failure does not fabricate recipient execution failure. An after-inject error is explicitly ambiguous and never re-enqueues the message as certainly undelivered.

### Send, await, reply, and wait

CLI additions:

```text
session-relay send <to> [--from <self>] [--correlation-id <uuid>]
  [--reply-to <message-id>] [--await] [--timeout-ms <1..600000>] -- <body>

session-relay wait --from <self> --correlation-id <uuid>
  [--reply-to <message-id>] [--timeout-ms <1..600000>]
```

MCP `send` gains optional `correlation_id`, `reply_to`, `await`, and `timeout_ms`; MCP adds a `wait` tool with the same matching fields. MCP may derive `from` from its registered session. CLI `--await` and `wait` require an explicit registered `--from` identity so the return mailbox cannot be guessed from a shared-directory marker.

Await matching requires all of:

1. the waiting session is the reply recipient;
2. the envelope has the exact `correlation_id`;
3. when an awaited message id is known, `reply_to` equals it;
4. for `send --await`, the reply sender equals the original target.

The store performs one locked selective claim: return the earliest append-order matching reply, preserve every unrelated byte and ordering relation, and commit removal only after the caller has a complete typed result. Timeout preserves all mail. A late reply remains available to a later `relay wait`. Concurrent waiters for the same direct reply resolve at most once; losers receive timeout or correlation-without-pending-reply, never a duplicate payload.

### WorkerResultV1

Fanout handback publishes one immutable result per worker generation:

```text
WorkerResultV1 = {
  schema: 1,
  type: "SessionRelayWorkerResultV1",
  result_id: UUID,
  correlation_id: UUID,
  parent_session_id: SessionId,
  worker_id: string,
  generation: positive integer,
  runtime_session_id: SessionId,
  outcome: "succeeded" | "failed" | "aborted",
  summary: string,
  handback_commit: 40hex | null,
  artifacts: [{ path: safe relative path, sha256: 64hex }],
  created_at: ISO-8601
}
```

The record is canonical JCS, mode `0600`, written create-once under `worker-results/<worker_id>/<generation>/<result_id>.json`. `FanoutRecord` stores the exact `result_id` and `result_sha256` when it enters a terminal handback state. The lifecycle authority accepts one terminal result for each worker generation and rejects stale generation, parent/runtime mismatch, second terminal result, changed bytes, unsafe artifact paths, duplicate artifacts, or a commit where the outcome does not permit one.

`handback` creates the result from its existing branch/commit/status inputs; it does not accept an arbitrary result file supplied by the worker. `collect` validates and returns the exact typed record plus digest. Asking for a decision remains ordinary correlated messaging and is not a terminal worker result.

## Authority and compatibility invariants

- `store.rs` remains sole writer for mail, indexes, delivery journals, selective claims, and worker-result bytes.
- `lifecycle.rs` remains sole authority for active worker generation and terminal transition eligibility.
- Bus, CLI, hook, watch, app-server, spawn, handback, and collect call typed protocol APIs; they do not assemble ad hoc envelope or receipt maps.
- Additional v2 keys are backward-compatible for old JSONL readers. Legacy rows remain deliverable and drainable but cannot satisfy a correlation wait.
- Message, correlation, and result IDs are canonical UUIDs. All closed objects reject unknown keys when read through v2 APIs.
- Every durable creation uses exclusive mode-`0600` staging, flush, atomic rename, directory sync where supported, and exact-byte re-read before success.
- Body and result size caps are explicit and tested; no wait loop can grow memory with the mailbox size.
- Mail remains untrusted data. Hook and app-server rendering fence body plus surfaced metadata; correlation fields never become instructions.
- `send --await` is bounded, interruptible, and polling-efficient. It never starts or resumes a model session by itself.
- Session Relay cannot dispatch plan reviewers, carry canonical plan-review evidence, mutate Docks plan lifecycle, or invoke plan-improver. No affected path belongs to those systems.

## Steps

| # | Task | Files | Depends | Status | Done condition |
|---|---|---|---|---|---|
| 1 | Freeze complete protocol-v2 red tests before production edits. | `rust/tests/protocol_v2.rs`; `rust/tests/bus_smoke.rs`; `rust/tests/fanout.rs`; `test/selftest.mjs` | — | planned | Focused tests cover closed schemas, legacy reads, reply validation, selective waits, every outcome, concurrency, crash rollback, immutable worker results, and CLI/MCP compatibility; the exact commands fail only because v2 behavior is absent. |
| 2 | Add closed protocol types, validation, canonical serialization, and size limits. | `rust/src/protocol.rs`; `rust/src/lib.rs` | 1 | planned | Unit tests reject malformed/unknown/mismatched identities and produce byte-stable canonical records. |
| 3 | Implement atomic message indexes, delivery journals, and selective correlation claims. | `rust/src/store.rs`; `rust/src/lifecycle.rs` | 2 | planned | Failure injection proves no index/mail split authority, unrelated mailbox bytes survive waits, one concurrent waiter wins, timeout is non-mutating, and GC respects live references. |
| 4 | Expose backward-compatible MCP/CLI send, reply, await, and wait surfaces. | `rust/src/bus.rs`; `rust/src/cli.rs`; `rust/src/main.rs` | 3 | planned | Legacy calls retain behavior; v2 calls return closed typed results; CLI and MCP match exactly; unknown sender/recipient/correlation and invalid timeouts fail before mutation. |
| 5 | Map hook, watch, and app-server delivery into durable explicit outcomes. | `rust/src/hook.rs`; `rust/src/watch.rs`; `rust/src/appserver.rs` | 3, 4 | planned | Before-inject rollback, after-inject ambiguity, refusal, deferred acknowledgement, and successful injection append the correct receipt without trusting mail metadata. |
| 6 | Publish and collect one immutable typed result per fanout worker generation. | `rust/src/spawn.rs`; `rust/src/fanout/authority.rs`; `rust/src/lifecycle.rs`; `rust/src/store.rs` | 2, 3 | planned | Handback creates the result; collect verifies bytes/digest and exact worker authority; stale, duplicate, mutated, or unsafe results fail without changing terminal state. |
| 7 | Update skill and maintainer guidance without granting review authority. | `skills/productivity/session-relay/SKILL.md`; `plugins/session-relay/AGENTS.md` | 4–6 | planned | Guidance documents correlation/reply/await/wait/outcomes/results, keeps Session Relay invalid for plan-review evidence, and the skill content hash is current. |
| 8 | Run focused acceptance, plugin CI, and full repository CI. | all affected paths | 1–7 | planned | A1–A8 pass on the exact reviewed tree; no generated binary is committed; full CI is green. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --test protocol_v2` | Exit 0; closed envelope/index/receipt/result schemas, legacy normalization, atomic rollback, selective wait, timeout, concurrency, caps, and immutable-result cases pass. |
| A2 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --test bus_smoke` | Exit 0; MCP send/wait and CLI send/await/wait are behaviorally equivalent and preserve old no-flag calls. |
| A3 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --test fanout` | Exit 0; handback/collect return one hash-bound `WorkerResultV1` per exact worker generation and reject every stale or duplicate terminal publication. |
| A4 | `cargo +1.85.0 build --manifest-path plugins/session-relay/rust/Cargo.toml --release --locked && SESSION_RELAY_TEST_BIN="$PWD/plugins/session-relay/rust/target/release/relay" node plugins/session-relay/test/selftest.mjs` | Exit 0; black-box register/send/reply/await/wait/inbox/hook/watch behavior works through the fresh binary with isolated stores. |
| A5 | `node scripts/skills/content-hash.mjs --check-only plugins/session-relay/skills` | Exit 0 with no stale Session Relay skill hash. |
| A6 | `git ls-files plugins/session-relay/bin` | Output remains exactly `plugins/session-relay/bin/relay`; no compiled executable or protocol fixture secret is committed. |
| A7 | `node scripts/ci.mjs --plugin session-relay` | Exit 0; Rust formatting, clippy, release build, protocol contracts, launcher, skill, and black-box self-test pass. |
| A8 | `node scripts/ci.mjs` | Exit 0; every plugin and repository-wide guard passes on the final tree. |

## Out of scope / do-NOT-touch

- Do not use Session Relay for Docks plan-review requests, reviewer output, review receipts, completion evidence, lifecycle writes, or plan-improver patches.
- Do not duplicate plan-improver's accepted-finding reconciliation, bounded review rounds, canonical plan patching, or sole-writer policy.
- Do not add Windows support, remote/network relay transport, cloud persistence, encryption-at-rest, or multi-host routing.
- Do not change model selection, wake cost policy, collab semantics, plan review, release publication, or plugin installation.
- Do not infer that message delivery means task execution succeeded.
- Do not resume a session automatically while waiting; explicit `wake` remains separate.
- Do not rewrite legacy mailbox rows or lifecycle records in place.

## Failure modes and STOP conditions

- STOP if a reply cannot be matched without draining or reordering unrelated mailbox entries.
- STOP if enqueue can leave a valid message index without mailbox bytes, or mailbox bytes without the required index.
- STOP if an after-inject transport failure is classified as definitely undelivered.
- STOP if two concurrent waiters can consume the same reply.
- STOP if a worker can publish a terminal result for another worker, generation, runtime session, or parent.
- STOP if a terminal worker result can be overwritten, replaced, or rebound to different artifact bytes.
- STOP if any implementation path treats correlation metadata or body text as trusted instructions.
- STOP if the design requires Session Relay to become canonical plan-review evidence transport.
- STOP if compatibility requires rewriting historical JSONL or lifecycle-v1 bytes.

## Cold-handoff checklist

- Repository, pinned toolchain, focused commands, and isolated-store requirements are explicit.
- Current envelope, delivery, fanout, and authority seams are named by exact paths and symbols.
- V2 envelope, message index, delivery receipt, send/wait result, and worker result shapes are closed.
- Correlation and `reply_to` semantics distinguish conversation identity from exact-message linkage.
- Await/wait matching, timeout, late reply, unrelated mail, and concurrent waiter behavior are binary.
- Delivery outcome, recipient execution, and worker terminal result are separate concepts.
- Legacy rows and old send calls have a clean compatibility path without mutation.
- TDD ordering and immutable assertions are explicit.
- Security fencing, identity validation, atomic persistence, size caps, and GC ownership are explicit.
- Session Relay's plan-review and plan-improver exclusions are explicit and testable by scope.

## Self-review

All eight schema-5 readiness criteria pass for this draft. The plan is standalone and names the exact repository, toolchain, files, commands, protocol objects, authority boundaries, and STOP conditions. Dependencies proceed from frozen red tests to types, storage, surfaces, delivery, worker results, docs, and CI. Acceptance is executable and covers normal, boundary, concurrency, crash, compatibility, and security behavior. The design deliberately separates durable Relay semantics from OMP's ephemeral sender-only waits, and it reuses only Docks' typed/hash-bound authority patterns rather than duplicating plan-improver or plan review.

Caught and fixed during self-review:

- Split `correlation_id` from `reply_to`; one groups a conversation and the other names the exact answered envelope.
- Required `--from` for CLI waits so shared-directory markers cannot select a return mailbox.
- Separated watcher liveness, durable delivery, reply arrival, and worker completion.
- Made late replies durable and timeout non-mutating instead of treating timeout as cancellation.
- Bound worker results to parent, worker, generation, and runtime session and prohibited arbitrary worker-supplied result files.
- Added an immutable message index so replies can validate references after the original mailbox row is drained.
- Kept the existing plan-review transport prohibition as an explicit scope and authority invariant.

## Sources

- `plugins/session-relay/rust/src/store.rs` — current registry, JSONL mailbox, generated `id`/`ts`, drain receipts, rollback, and lock authority.
- `plugins/session-relay/rust/src/bus.rs` — current MCP send/inbox schemas and queue/watch response.
- `plugins/session-relay/rust/src/cli.rs` and `main.rs` — current send/inbox/wake/watch CLI grammar and dispatch.
- `plugins/session-relay/rust/src/watch.rs` and `appserver.rs` — current push/wake delivery outcomes and before/after-inject ambiguity boundary.
- `plugins/session-relay/rust/src/lifecycle.rs` — current typed managed-worker, release-receipt, generation, fence, and operation authority patterns.
- `plugins/session-relay/rust/src/spawn.rs` and `fanout/authority.rs` — current prompt-level `reply_to`, parent/worker/generation identity, and handback state.
- `omp://tools/hub.md` — OMP replyTo, await, explicit receipts, wait race, buffering, timeout, and lifecycle semantics.
- `omp://tools/task.md` — OMP worker identity, typed `SingleResult`, artifact metadata, failure, abort, and lifecycle semantics.
- `omp://rpc.md` — request id echo and pending-request correlation.
- `omp://mcp-protocol-transports.md` — per-request IDs, pending maps, timeout, cancellation, malformed payload, and disconnect handling.
- `plugins/docks/skills/productivity/plan-improver/SKILL.md` — reusable closed request/result and hash-binding patterns plus explicit non-authority boundaries.
- `plugins/docks/skills/productivity/plan-manager/SKILL.md` and `plan-review/SKILL.md` — sole-writer review ownership and the prohibition on Session Relay evidence transport.

## Notes

This plan is intentionally independent of the blocked Session Relay prebuilt-source completion series. It may be reviewed and refined while that plan is blocked, but implementation and release must use their own reviewed lifecycle and must not be folded into the prebuilt-source plan or its immutable evidence.
