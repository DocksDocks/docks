---
title: Release correlated Session Relay results
goal: Release Session Relay 0.14.0 with crash-safe correlated replies and immutable fanout results after the docks-kit 0.12.0 companion is published.
status: blocked
created: "2026-07-25T12:54:02.572Z"
updated: "2026-07-25T13:17:53.769Z"
blocked_since: "2026-07-25T13:17:53.769Z"
started_at: null
finished_at: null
assignee: null
tags: [session-relay, protocol, fanout, release]
affected_paths:
  - .agents/plugins/marketplace.json
  - .claude-plugin/marketplace.json
  - README.md
  - plugins/session-relay/AGENTS.md
  - plugins/session-relay/.claude-plugin/plugin.json
  - plugins/session-relay/.codex-plugin/plugin.json
  - plugins/session-relay/rust/Cargo.lock
  - plugins/session-relay/rust/Cargo.toml
  - plugins/session-relay/rust/src/bus.rs
  - plugins/session-relay/rust/src/channel.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/fanout.rs
  - plugins/session-relay/rust/src/fanout/authority.rs
  - plugins/session-relay/rust/src/hook.rs
  - plugins/session-relay/rust/src/lib.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/rust/src/protocol.rs
  - plugins/session-relay/rust/src/protocol/authority.rs
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/src/supervisor.rs
  - plugins/session-relay/rust/src/watch.rs
  - plugins/session-relay/rust/tests/bus_smoke.rs
  - plugins/session-relay/rust/tests/fanout.rs
  - plugins/session-relay/rust/tests/lifecycle_supervisor.rs
  - plugins/session-relay/rust/tests/protocol.rs
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - plugins/session-relay/skills/productivity/session-relay/references/fanout.md
  - plugins/session-relay/skills/productivity/session-relay/references/workspace.md
  - plugins/session-relay/test/companion-distribution-contract.mjs
  - plugins/session-relay/test/distribution-contract.mjs
  - plugins/session-relay/test/release-evidence-contract.mjs
  - plugins/session-relay/test/release-promotion-contract.mjs
  - plugins/session-relay/test/release-publication-contract.mjs
  - plugins/session-relay/test/rust-test-inventory.mjs
  - plugins/session-relay/test/scenario-appserver.mjs
  - plugins/session-relay/test/scenario-core.mjs
  - plugins/session-relay/test/scenario-follow-doctor-mailbox.mjs
  - plugins/session-relay/test/scenario-hooks-identity.mjs
  - plugins/session-relay/test/scenario-spawn-wake-supervisor.mjs
  - plugins/session-relay/test/selftest-fixture.mjs
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/test/workspace-smoke.mjs
  - scripts/lib/session-relay-release-cli.mjs
  - scripts/lib/session-relay-release-core.mjs
  - scripts/lib/session-relay-release-fixture.mjs
  - scripts/lib/session-relay-release-preparation.mjs
  - scripts/lib/session-relay-release-promotion.mjs
  - scripts/lib/session-relay-release-publication.mjs
  - scripts/release.mjs
  - scripts/verify-session-relay-preflight.mjs
related_plans:
  - docs/plans/active/session-relay-correlated-messaging-and-worker-results.md
  - docs/plans/active/session-relay-linux-workspace-release.md
  - docs/plans/active/session-relay-linux-workspace-publication.md
  - "DocksDocks/public:docs/plans/active/session-relay-0.14.0-docks-kit-0.12.0-release.md"
---

# Release correlated Session Relay results

Plan-run: {"acceptance":null,"blocker":{"evidence_sha256":"8e1aaab70f5459f7740c648c977cb41ddd9f242c2fa8dd60a09eebd7ec678871","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"f5edd8a0c62036cab5cce959714ef843b094e15705fccc63e6d66fe94948d02e","invocations":2,"result_sha256":"8e1aaab70f5459f7740c648c977cb41ddd9f242c2fa8dd60a09eebd7ec678871","state":"blocked"},"execution_parent":null,"goal_id":"8b89aabf-7336-4352-bc11-225bab67f9aa","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-correlated-results-release.md","plan_sha256":"bd4d382d251f0b0b5e59a211fac9551ccfcea0df7d843b90b566634701f01490","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"aec80dc5-37da-42b7-8a01-8f30a58c08c1","schema":1,"source_base":"7d8577f577f1b2252f7873d8d91ca7cbcf96e01c","source_sha256":"c218f418d697c9c3e6bd6abcaba2c39c80c3532d003a76da6c48c04e50609ce3"}

## Goal

Ship Session Relay 0.14.0 with one durable logical terminal reply per correlation, one immutable typed result per newly created fanout generation, strict collection validation, and byte-compatible legacy behavior. Stage Relay as a prerelease, publish and archive the public docks-kit 0.12.0 child, then promote the same five Relay assets to stable.

## Context & rationale

Current source and manifests are 0.13.0 at repository commit `7d8577f577f1b2252f7873d8d91ca7cbcf96e01c`. The target release/tag and companion release/tag/npm version were probed before drafting and did not exist: `session-relay--v0.14.0`, `cli-v0.12.0`, and `docks-kit@0.12.0` all returned HTTP 404.

Three active Session Relay plan families are immutable historical evidence and are `legacy-quarantined`, never current authority:

- `session-relay-correlated-messaging-and-worker-results.md`, bytes SHA-256 `c4bb333dcd6f1a5b19a527fbf6b7a5e7c3d725e85957c09a0f63aea04e3d4a56`, has an unsettled schema-5 not-ready review family.
- `session-relay-linux-workspace-release.md`, bytes SHA-256 `2db72f1f46fe05ee9b1d26cd72483267f98b24de3b0fe9d17a5196b3d96ead39`, has a malformed/crossed schema-6 family.
- `session-relay-linux-workspace-publication.md`, bytes SHA-256 `1035b32217869d4bc2ebb17bc04fa63db47d47b552eb2d145312cb018f683018`, has active/prepared/crossed schema-6 evidence.

Their still-relevant obligations are copied here: additive legacy compatibility; four native targets plus `SHA256SUMS`; no Windows; red tests before production changes; exact source/asset/companion ancestry; no publication before the public child; and Relay remains excluded from canonical plan-review transport. Their bytes, refs, tags, releases, and receipts must not be edited, resumed, consumed, deleted, or reused.

### Fixed protocol contract

`MessageV2` is a closed canonical JCS object no larger than 16 KiB. Every key is required: `schema:2`; lowercase UUID-v4 `id` and `correlation_id`; exact existing 24-byte UTC `created_at`; exact registered lowercase UUIDs `from_session_id` and `to_session_id`; `kind:request|terminal_reply|worker_result`; nullable `reply_to`, `terminal_status`, and `result_sha256`; and UTF-8 `body` of 1..4096 bytes without NUL. Legal variants are only:

| kind | reply_to | terminal_status | result_sha256 |
|---|---|---|---|
| `request` | `null` | `null` | `null` |
| `terminal_reply` | exact request id | `completed|failed` | `null` |
| `worker_result` | exact fanout request id | `completed|failed` | exact WorkerResultV1 digest |

Legacy records lacking the schema/correlation fields retain their existing mailbox parser and renderer.

`ClaimStatusV1` is one closed canonical mode-0600 object at `protocol-v1/{pending,open,terminal}/<correlation_id>.json`. Required fields are `schema:1`, correlation, `origin:message|fanout`, `state:RequestPending|Open|ReplyPending|ReplyEnqueued|ReplyConsumed`, exact requester/responder ids, the complete request and digest, request delivery, nullable complete reply/digest/delivery, and exact created/updated timestamps. The directory and object state must agree. The complete legal matrix is:

| origin/state | request delivery | reply / digest / delivery |
|---|---|---|
| `message/RequestPending` | `pending` | all null |
| `message/Open` | `enqueued|consumed` | all null |
| `fanout/Open` | `not_applicable` | all null |
| `*/ReplyPending` | message `enqueued|consumed`; fanout `not_applicable` | terminal envelope/digest plus `pending` |
| `*/ReplyEnqueued` | unchanged | same bytes/digest plus `enqueued` |
| `*/ReplyConsumed` | message `enqueued|consumed`; fanout `not_applicable` | same bytes/digest plus `consumed` |

Request creation writes `RequestPending` with the full envelope, appends those exact bytes under the existing kernel lock, then moves to `Open/enqueued`. Terminal claim writes `ReplyPending` with the winning full envelope, appends exact bytes, then moves to `ReplyEnqueued`. Recovery scans only `protocol-v1/pending`, finds by exact message id, appends only if absent, and advances. Locked inbox drain marks matching typed delivery consumed before mailbox removal. One exact responder claim wins; byte-identical retry is idempotent; any other claimant or changed payload returns `correlation_conflict` without enqueue.

`WorkerResultV1` is a closed canonical object no larger than 1 MiB embedded in the owning fanout record. Required fields: schema, UUID-v4 result/correlation/reservation/root reservation ids; exact parent, worker, generation, runtime ids; canonical repository common-dir/dev/ino/object format; matching 40- or 64-hex base and handback commits; `completed|failed`; bounded no-NUL summary; at most 4096 sorted unique normalized UTF-8 Git-relative changed paths derived from `base_commit..handback_commit`; and exact timestamp. Its SHA-256 is stored beside, not inside, the result. A non-UTF-8 changed path fails before handback mutation. Pre-upgrade fanout records keep absent optional fields and legacy behavior; every 0.14.0 reservation requires correlation, attach-time authority request, and typed result.

`protocol.rs` owns closed types, validation, canonical encoding, digests, and public APIs. `protocol/authority.rs` owns crash-safe claim persistence/recovery and exposes no-lock helpers only to callers holding the existing kernel lock. `store.rs` retains legacy mailbox/registry ownership and exposes only minimal crate-private exact-id append/find/drain primitives. No second lock hierarchy is allowed.

Handback computes clean HEAD/changed paths and atomically writes WorkerResultV1 with `Running -> HandedBack`, then claims/enqueues its worker-result envelope idempotently. Supervisor must verify the result is `ReplyEnqueued|ReplyConsumed` with matching digest before fencing, termination, or capacity release. Collection validates result bytes/digest plus worker, generation, repository, base/head, paths, and child ordering before `Collecting`; corruption retains custody and fails before merge. Depth-0 handback remains blocked until depth-1 children are `Collected|FailedNoProcess`. The durable promise is one logical terminal claim, not impossible exactly-once consumer process execution.

Public surfaces are additive: CLI `request`, `reply`, and `collect --result-json`; MCP `request` and `reply`; fanout opt-in JSON correlation output; prompt correlation/final handback command; and typed hook/watch/channel rendering with correlation, exact reply command, terminal status, result digest, and collection identity. Existing six MCP schemas, `send`, inbox/peek, handback, human spawn, and default collect bytes remain unchanged. CLI validation/domain failures exit 1 except competing terminal claims exit 2 with stable `correlation_conflict`; exact retry exits 0. MCP malformed arguments remain JSON-RPC `-32602`; valid domain failures use `isError:true` and exactly `unknown_correlation|unauthorized_responder|correlation_conflict|protocol_store_error`.

## Environment & how-to-run

- Repository: `/home/vagrant/projects/docks`; source base: `7d8577f577f1b2252f7873d8d91ca7cbcf96e01c`.
- Rust uses `plugins/session-relay/rust/rust-toolchain.toml`, `cargo --locked`, isolated `AGENT_RELAY_HOME`, and an explicit fresh binary for black-box tests.
- Focused Rust: `cargo test --locked --manifest-path plugins/session-relay/rust/Cargo.toml --test protocol`, `--test fanout`, `--test bus_smoke`, and `--test lifecycle_supervisor`.
- Determinism: run `SESSION_RELAY_TEST_JOBS=1 node plugins/session-relay/test/selftest.mjs` and jobs 4, then compare stdout bytes.
- Workspace smoke: `node plugins/session-relay/test/workspace-smoke.mjs --case single-session-compat --bin <absolute-fresh-binary>` and `--case docs-contract`.
- Release entrypoint: `node scripts/release.mjs --prepare --plugin session-relay 0.14.0`; later modes are the reviewed Session Relay preparation/publication/promotion/finalization flow, never generic plugin release.
- Full gates: `node scripts/ci.mjs --plugin session-relay`, then `node scripts/ci.mjs`.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Freeze legacy output bytes and add all protocol, fanout, CLI/MCP, workspace, automatic-delivery, and release-contract tests before production edits. | Rust tests; `plugins/session-relay/test/*` fixtures/contracts | — | `local` | `planned` | Each new test is observed failing only for the missing contract; record command, exit, signature, output hash, and test blob hash. Harness/setup failures STOP. |
| 2 | Implement closed MessageV2, ClaimStatusV1, WorkerResultV1 validation/JCS/digests. | `protocol.rs`; `lib.rs` | 1 | `local` | `planned` | Closed variant/state/boundary tests pass without changing frozen assertions. |
| 3 | Implement crash-safe claim authority and minimal locked mailbox primitives. | `protocol/authority.rs`; `store.rs` | 2 | `local` | `planned` | Request/reply race and every failpoint converge to one logical terminal record from embedded exact bytes. |
| 4 | Implement public request/reply APIs and run an actual isolated two-session CLI/race smoke. | `protocol.rs`; `cli.rs`; `main.rs` | 3 | `local` | `planned` | Request, drain, reply, drain, exact retry, and competitor race produce one terminal digest and fixed exit codes. |
| 5 | Implement correlation and immutable results across reservation, attachment, handback, supervisor, and collection. | fanout/spawn/supervisor source and tests | 4 | `local` | `planned` | One result per generation; corrupt/stale/unordered collection fails before merge and retains custody; supervisor never releases early. |
| 6 | Add CLI/MCP request/reply and result-json while preserving existing surfaces. | `bus.rs`; `cli.rs`; `main.rs`; selftest modules | 4 | `local` | `planned` | `tools/list` adds exactly two tools; legacy output fixtures and jobs 1/4 bytes remain equal. |
| 7 | Add typed automatic rendering on hook, watch, app-server, and channel paths. | `hook.rs`; `watch.rs`; `channel.rs`; automatic-delivery tests | 4 | `local` | `planned` | Every typed path retains correlation/reply/result identity and the legacy `mail_block` fixture is byte-identical. |
| 8 | Update current docs and release contracts without changing historical receipts. | skill/references/AGENTS/README; release scripts/contracts | 4 | `local` | `planned` | Current docs match 0.14 behavior; new contracts bind public `cli-v0.12.0`; old 0.13 identities remain immutable fixtures. |
| 9 | Bump all Session Relay current version bindings to 0.14.0 and run focused/full gates plus release-binary smoke. | manifests/catalogs/Cargo/release current constants | 5, 6, 7, 8 | `local` | `planned` | Format, clippy, exact Rust inventory, selftest parity, workspace smoke, release contracts, plugin CI, full CI, request/reply, and result-json all pass. |
| 10 | Commit the owned implementation and run one exact-diff completion review, repairing at most once. | all affected paths; this plan | 9 | `local` | `planned` | Matching CompletionReviewV1 passes for the exact unpublished implementation commit and diff. |
| 11 | Verify exact remote/tag/release/npm nonexistence and current remote-main ancestry. | GitHub/npm read-only endpoints | 10 | `probe` | `planned` | Targets are absent and remote main equals the reviewed execution parent; ambiguity or divergence STOP. |
| 12 | Fast-forward the reviewed implementation and stage one native five-asset Relay prerelease through the reviewed entrypoint. | Docks main/tag/release and five assets | 11 | `release` | `planned` | Exact reviewed commit is remote, four binaries plus SHA256SUMS share one run, independent hashes match, release is prerelease, and no Windows asset exists. |
| 13 | Wait for the related public child to record red proof, publish `cli-v0.12.0` and npm 0.12.0, archive, and push its finished PlanRunV1. | related public child identity | 12 | `probe` | `planned` | Finished public child, commits, tag, npm, assets, and four Relay pins are remotely readable and repository-qualified; otherwise STOP. |
| 14 | Bind the public child and promote the byte-identical Relay prerelease to stable. | promotion/finalization receipts and stable release | 13 | `release` | `planned` | Reviewed verifier matches current main, all five staged assets, public release, tags, commits, and hashes; no asset replacement/retag/retry conflict. |
| 15 | Download and smoke the stable asset, bind acceptance, archive this plan, and push the exact archive checkpoint. | stable release; finished plan | 14 | `push` | `planned` | Downloaded Linux x64 reports 0.14.0 and passes selftest/docs/correlated result smoke; finished plan and archive commit are read back from origin. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | Legacy fixtures, existing CLI/MCP tests, and default collect fixture | Old stores load and all legacy command/default bytes remain identical. |
| A2 | `cargo test --locked --manifest-path plugins/session-relay/rust/Cargo.toml --test protocol` | Closed matrices, malformed input, bounds, exact responder, idempotence, races, failpoints, recovery, and tamper tests pass. |
| A3 | Same command with `--test fanout` | Legacy record compatibility, attach claim, result digest/paths, idempotence, failed result, custody/order/corruption/restart tests pass. |
| A4 | Same command with `--test bus_smoke` and `--test lifecycle_supervisor` | MCP mapping and no-premature-release behavior pass. |
| A5 | Selftest jobs 1 and 4 with byte comparison | Both exit 0 and stdout is byte-identical. |
| A6 | Fresh-binary workspace smoke for single-session compatibility and docs contract | Prompt correlation, result notification, unchanged default collect, exact result-json, and old state pass. |
| A7 | Hook/watch/channel automatic delivery tests | Typed identity survives every path; legacy rendering bytes do not change. |
| A8 | Release contract Node scripts | New 0.14/0.12 bindings pass and historical 0.13 receipts remain accepted only as immutable history. |
| A9 | `cargo fmt --check` and `cargo clippy --all-targets --all-features -- -D warnings` in the crate | Exit 0. |
| A10 | `node scripts/ci.mjs --plugin session-relay` then `node scripts/ci.mjs` | Both exit 0 on the exact implementation tree. |
| A11 | GitHub release/tag/API, downloaded assets, and independent SHA-256 verification | Stable Relay has exactly four supported binaries plus SHA256SUMS, all matching, no Windows, and downloaded smoke passes. |
| A12 | PlanRunV1 validators in both repositories | Public finishes/pushes before Docks consumes it; both finished children share only goal_id and bind repository-qualified reviews, commits, acceptance, and releases; legacy plan bytes retain their recorded hashes. |

## Out of scope / do-NOT-touch

- Do not edit, migrate, resume, consume, delete, abandon, or rewrite any schema-1–6 active or finished plan family, preflight ref, v0.13 tag/release/asset, or historical receipt.
- Do not change legacy send/inbox/peek/handback/default-collect schemas or bytes, add Windows, make Relay a plan-review transport, create a second lock hierarchy, or promise exactly-once process consumption.
- Do not deploy, force-push, rebase around divergence, delete/retag, replace assets, or publish outside the named Docks release recipe and public companion recipe.

## STOP conditions

- Any target version/tag/npm identity already exists, remote main diverges, an owned path/index/HEAD changes concurrently, or external authority no longer exactly covers the boundary.
- A test assertion contradicts the fixed approved contract; do not weaken it. A repeated same-signature verification failure without relevant-byte progress blocks.
- More than one logical terminal reply/result appears; recovery lacks exact bytes; automatic delivery drops identity; supervisor releases early; existing result mutates; or collect merges before complete validation.
- Legacy behavior/output or jobs parity changes; required red proof is missing; a focused/full gate fails; native asset count/digest/run identity differs; Windows appears; public child is not finished/remotely readable; or recovery would require force/delete/retag/reupload.

## Open questions

N/A — versions, protocol matrices, error surfaces, sequencing, supported platforms, and companion release are fixed by the approved cross-repository design.

## Review

Draft review invocation 1 ended in a pre-model transport failure; its bound failure digest is retained in PlanRunV1.

Draft review invocation 2:

Review-result: {"findings":[{"defect":"Step 13 directs this Docks plan to publish cli-v0.12.0/npm, archive, and push DocksDocks/public while declaring only probe; those writes are outside repository_id DocksDocks/docks and its sealed affected-path scope.","fix":"Make Step 13 probe-only and require the separately reviewed public child to perform its own release/archive/push; bind and verify that child before Step 14, with exact push/release authority for each external write.","id":"step-13-public-release-scope","kind":"unsafe_scope","locator":"plan.md:149; manifest.json:paths"},{"defect":"Step 12 fast-forwards reviewed code to remote main and stages a prerelease but declares only release, so its remote push is not an explicit push boundary despite requested_effects including push.","fix":"Split the fast-forward into an explicit push step and the prerelease into a release step, each gated by exact remote identity and external authority.","id":"step-12-write-effect","kind":"contradiction","locator":"plan.md:148"},{"defect":"Step 13 says to record public red proof, but its done condition and A12 check only verify finished-child and release identities; they do not verify red assertions and hashes preceded public edits.","fix":"Require the public child’s repository-qualified red-test commands, expected failures, exits, output/blob hashes, and ordering evidence before accepting any public pin/package/docs/golden/release change; stop if absent or mismatched.","id":"step-13-red-proof-acceptance","kind":"missing_acceptance","locator":"plan.md:149,168"}],"invocation":2,"plan_sha256":"bd4d382d251f0b0b5e59a211fac9551ccfcea0df7d843b90b566634701f01490","run_id":"aec80dc5-37da-42b7-8a01-8f30a58c08c1","schema":1,"source_sha256":"c218f418d697c9c3e6bd6abcaba2c39c80c3532d003a76da6c48c04e50609ce3","verdict":"repair"}

## Verification Results

Not run. Manager will record exact commands, exits, hashes, commits, release identities, and observed results here.
