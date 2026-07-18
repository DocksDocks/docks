---
title: Correlate Session Relay messages and worker results
goal: Add a backward-compatible correlated messaging protocol with bounded await/wait operations, explicit delivery outcomes, and immutable typed fanout worker results without making Session Relay a plan-review evidence transport.
status: planned
created: "2026-07-17T21:49:47-03:00"
updated: "2026-07-17T22:17:48-03:00"
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
  - plugins/session-relay/rust/src/channel.rs
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

Initial sends generate both `id` and `correlation_id` and set `reply_to:null`. A reply reuses the referenced envelope's `correlation_id` and sets `reply_to` to that exact envelope id. When `reply_to` is supplied without `correlation_id`, the authoritative message record supplies it. When both are supplied, they must agree. Unknown, malformed, cross-correlation, wrong-recipient, or self-forged references fail before enqueue.

Existing v1 rows without `schema`, `correlation_id`, or `reply_to` continue through inbox, hook, and watch paths unchanged. Old send calls require no new argument. New readers normalize v1 rows only in memory; they never rewrite historical mailbox bytes.

### Authoritative message record and derived mailbox

Every v2 enqueue first creates one mode-`0600` canonical-JCS authoritative record:

```text
MessageRecordV2 = {
  schema: 2,
  envelope: RelayEnvelopeV2,
  body_sha256: 64hex
}
```

`message-records/<recipient-id>/<message-id>.json` is the sole authority that a v2 message exists and contains the one plaintext body. The recipient mailbox JSONL contains only a derived queue hint for that record. Enqueue publishes and directory-syncs the create-once record before appending the hint. A crash before record rename means no send; a crash after rename leaves an authoritative pending message. Every store entry point first performs the same under-lock reconciliation for the one addressed recipient shard: add a missing hint for each pending unclaimed record, remove or quarantine hints whose record is absent or invalid, and finish interrupted derived-mailbox rewrites before serving data.

A selective claim publishes and directory-syncs one create-once `claims/<recipient-id>/<message-id>.json` record before removing its derived hint. The claim is the sole authority that the reply was consumed; a crash after claim publication is recovered by removing the stale hint, never by returning the reply twice. Failure injection covers process termination before and after every record, claim, hint append, and hint rewrite boundary followed by a fresh-process reconciliation. GC removes record, claim, delivery journal, and derived hint together only after retention and after correlation and worker-result references are quiescent; it never treats a hint as proof of liveness.

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
  attempt: positive integer,
  sequence: positive integer,
  state: DeliveryState,
  actor: "send" | "hook" | "watch" | "appserver" | "channel",
  detail: string | null,
  recorded_at: ISO-8601
}
```

`sequence` is the strictly increasing event sequence for one message; `attempt` groups events for one delivery attempt. Attempt 1 starts with `queued` after durable enqueue. Each attempt has exactly one `queued` event and at most one terminal event. An explicit later wake may create attempt $N+1$ only after attempt $N$ ended `refused` or `failed_before_inject`; it appends a new `queued` event under the same message and correlation. `injected`, `injected_ack_deferred`, and `ambiguous_after_inject` prohibit retry because duplicate delivery cannot be excluded. Concurrent actors use the store lock to admit one terminal event; duplicate or conflicting terminals fail without appending.

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

Timeout is a successful command result, not a transport error. Delivery failure does not fabricate recipient execution failure. Failure before an inject request is sent is `failed_before_inject`; loss of the inject response after send is `ambiguous_after_inject`; confirmed injection followed by settle or acknowledgement unavailability is `injected_ack_deferred`; confirmed injection plus acknowledgement is `injected`. Neither ambiguous nor confirmed delivery is re-enqueued.

Claude channel delivery has one exact no-ack mapping. Serialization failure before `send_frame` writes any byte is `failed_before_inject`; any stdout write or flush error is `ambiguous_after_inject` because a partial frame may have escaped; successful frame flush is `injected_ack_deferred` because the channel protocol supplies no recipient acknowledgement. Channel never records `injected`, and neither ambiguous nor flushed channel delivery is retried automatically.

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

The store performs one locked selective claim: return the earliest append-order matching reply, preserve every unrelated byte and ordering relation, and commit the authoritative claim only after the caller has a complete typed result. Timeout preserves all mail. A late reply remains available to a later `relay wait`. Concurrent waiters for the same direct reply resolve at most once; the winner receives `replied` and every loser remains bounded until the existing `timeout` outcome, never a duplicate payload or an undeclared race value.

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
  outcome: "succeeded" | "failed",
  summary: string,
  handback_commit: 40hex,
  created_at: ISO-8601
}
```

`spawn --fanout` generates the correlation UUID when it creates the reservation, stores it in the exact `FanoutRecord` generation, and surfaces it in the worker prompt. Handback cannot supply or override it; `WorkerResultV1.correlation_id` must equal that reservation value.

The record is canonical JCS, mode `0600`, written create-once under `worker-results/<worker_id>/<generation>/<result_id>.json`. Existing `handback --status completed|failed --note <text>` is the complete input: `completed` maps to `succeeded`, `failed` maps to `failed`, `summary` is the already bounded note (empty when omitted), and `handback_commit` is the clean exact worktree HEAD already resolved for both statuses. There is no aborted outcome and no artifact list. The lifecycle authority accepts one terminal result for each worker generation and rejects stale generation, parent/runtime mismatch, second terminal result, changed bytes, invalid status mapping, or a commit different from the authoritative handback HEAD.

`handback` creates the result from those existing inputs inside the same authority transition; it does not accept an arbitrary result file supplied by the worker. `collect` validates and returns the exact typed record plus digest. Asking for a decision remains ordinary correlated messaging and is not a terminal worker result.

## Authority and compatibility invariants

- `store.rs` remains sole writer for authoritative message records and claims, derived mailbox hints, delivery journals, selective claims, and worker-result bytes.
- `lifecycle.rs` remains sole authority for active worker generation and terminal transition eligibility.
- Bus, CLI, hook, watch, app-server, channel, spawn, handback, and collect call typed protocol APIs; they do not assemble ad hoc envelope or receipt maps.
- Additional v2 keys are backward-compatible for old JSONL readers. Legacy rows remain deliverable and drainable but cannot satisfy a correlation wait.
- Message, correlation, and result IDs are canonical UUIDs. All closed objects reject unknown keys when read through v2 APIs.
- Every durable creation uses exclusive mode-`0600` staging, flush, atomic rename, directory sync where supported, and exact-byte re-read before success.
- Body and result size caps are explicit and tested; no wait loop can grow memory with the mailbox size.
- Mail remains untrusted data. Hook, app-server, and channel rendering fence body plus surfaced metadata; correlation fields never become instructions.
- `send --await` is bounded, interruptible, and polling-efficient. It never starts or resumes a model session by itself.
- Session Relay cannot dispatch plan reviewers, carry canonical plan-review evidence, mutate Docks plan lifecycle, or invoke plan-improver. No affected path belongs to those systems.

## Steps

| # | Task | Files | Depends | Status | Done condition |
|---|---|---|---|---|---|
| 1 | Freeze complete protocol-v2 red tests before production edits. | `rust/tests/protocol_v2.rs`; `rust/tests/bus_smoke.rs`; `rust/tests/fanout.rs`; `test/selftest.mjs` | — | planned | Focused tests cover closed schemas, legacy reads, reply validation, selective waits, every outcome/attempt, concurrency, crash-and-restart reconciliation, immutable worker results, and CLI/MCP compatibility; the exact commands fail only because v2 behavior is absent. |
| 2 | Add closed protocol types, validation, canonical serialization, and size limits. | `rust/src/protocol.rs`; `rust/src/lib.rs` | 1 | planned | Unit tests reject malformed/unknown/mismatched identities and produce byte-stable canonical records. |
| 3 | Implement authoritative message/claim records, derived mailbox reconciliation, delivery journals, and selective correlation claims. | `rust/src/store.rs`; `rust/src/lifecycle.rs` | 2 | planned | Process-kill injection at every publication boundary plus fresh-process recovery proves record/claim sole authority, rebuilds derived hints, preserves unrelated mail, allows one waiter, leaves timeout non-mutating, and keeps GC reference-safe. |
| 4 | Expose backward-compatible MCP/CLI send, reply, await, and wait surfaces. | `rust/src/bus.rs`; `rust/src/cli.rs`; `rust/src/main.rs` | 3 | planned | Legacy calls retain behavior; v2 calls return closed typed results; CLI and MCP match exactly; unknown sender/recipient/correlation and invalid timeouts fail before mutation; losing concurrent waits deterministically time out. |
| 5 | Map hook, watch, app-server, and Claude channel delivery into durable explicit outcomes. | `rust/src/hook.rs`; `rust/src/watch.rs`; `rust/src/appserver.rs`; `rust/src/channel.rs` | 3, 4 | planned | Tests distinguish before-send failure, sent-without-response ambiguity, confirmed injection with deferred acknowledgement, confirmed acknowledgement, refusal, and channel's no-ack at-most-once mapping; each attempt has one terminal receipt and no unsafe retry. |
| 6 | Publish and collect one immutable typed result per fanout worker generation. | `rust/src/spawn.rs`; `rust/src/fanout/authority.rs`; `rust/src/lifecycle.rs`; `rust/src/store.rs` | 2, 3 | planned | Existing completed/failed plus note/head inputs deterministically create the result; collect verifies bytes/digest and exact worker authority; stale, duplicate, mutated, mismapped, or wrong-head results fail without changing terminal state. |
| 7 | Update skill and maintainer guidance without granting review authority. | `skills/productivity/session-relay/SKILL.md`; `plugins/session-relay/AGENTS.md` | 4–6 | planned | Guidance documents correlation/reply/await/wait/outcomes/results, keeps Session Relay invalid for plan-review evidence, and the skill content hash is current. |
| 8 | Run focused acceptance, plugin CI, and full repository CI. | all affected paths | 1–7 | planned | A1–A8 pass on the exact reviewed tree; no generated binary is committed; full CI is green. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --test protocol_v2` | Exit 0; closed envelope/record/claim/receipt/result schemas, legacy normalization, crash-and-restart reconciliation, selective wait, delivery attempts, deterministic waiter timeout, caps, and immutable-result cases pass. |
| A2 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --test bus_smoke` | Exit 0; MCP send/wait and CLI send/await/wait are behaviorally equivalent and preserve old no-flag calls. |
| A3 | `cargo +1.85.0 test --manifest-path plugins/session-relay/rust/Cargo.toml --locked --test fanout` | Exit 0; existing completed/failed handback inputs create one hash-bound `WorkerResultV1` with exact note/head mapping per worker generation and reject stale or duplicate terminal publication. |
| A4 | `cargo +1.85.0 build --manifest-path plugins/session-relay/rust/Cargo.toml --release --locked && SESSION_RELAY_TEST_BIN="$PWD/plugins/session-relay/rust/target/release/relay" node plugins/session-relay/test/selftest.mjs` | Exit 0; black-box register/send/reply/await/wait/inbox/hook/watch/channel behavior works through the fresh binary with isolated stores. |
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

- STOP if a reply cannot be matched while preserving unrelated mailbox entries and their ordering.
- STOP if a v2 mailbox hint or partial rewrite can override the authoritative message/claim records after fresh-process reconciliation.
- STOP if an inject request with no response is classified as definitely undelivered, or a confirmed inject is classified as ambiguous.
- STOP if two concurrent waiters can consume the same reply or produce different non-timeout loser outcomes.
- STOP if a worker can publish a terminal result for another worker, generation, runtime session, parent, status mapping, or handback HEAD.
- STOP if a terminal worker result can be overwritten, replaced, or rebound to different bytes.
- STOP if any implementation path treats correlation metadata or body text as trusted instructions.
- STOP if the design requires Session Relay to become canonical plan-review evidence transport.
- STOP if compatibility requires rewriting historical JSONL or lifecycle-v1 bytes.

## Cold-handoff checklist

- Repository, pinned toolchain, focused commands, and isolated-store requirements are explicit.
- Current envelope, delivery, fanout, and authority seams are named by exact paths and symbols.
- V2 envelope, authoritative message/claim record, derived mailbox, delivery attempt receipt, send/wait result, and worker result shapes are closed.
- Correlation and `reply_to` semantics distinguish conversation identity from exact-message linkage.
- Await/wait matching, timeout, late reply, unrelated mail, fresh-process recovery, and concurrent waiter behavior are binary.
- Delivery attempt outcome, recipient execution, channel no-ack semantics, and worker terminal result are separate concepts.
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
- Made the message record and claim the sole v2 authorities so reply validation and crash recovery never depend on a derived mailbox hint.
- Kept the existing plan-review transport prohibition as an explicit scope and authority invariant.

## Sources

- `plugins/session-relay/rust/src/store.rs` — current registry, JSONL mailbox, generated `id`/`ts`, drain receipts, rollback, and lock authority.
- `plugins/session-relay/rust/src/bus.rs` — current MCP send/inbox schemas and queue/watch response.
- `plugins/session-relay/rust/src/cli.rs` and `main.rs` — current send/inbox/wake/watch CLI grammar and dispatch.
- `plugins/session-relay/rust/src/watch.rs`, `appserver.rs`, and `channel.rs` — current push/wake/channel delivery outcomes and before/after-inject or no-ack ambiguity boundaries.
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
