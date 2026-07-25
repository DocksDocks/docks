---
title: Continue correlated Session Relay results release
goal: Release Session Relay 0.14.0 with crash-safe correlated replies and immutable fanout results after the independently reviewed docks-kit 0.12.0 companion is published.
status: ongoing
created: "2026-07-25T13:24:00.000Z"
updated: "2026-07-25T13:38:39.988Z"
started_at: "2026-07-25T13:38:39.988Z"
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
  - docs/plans/active/session-relay-correlated-results-release.md
  - docs/plans/active/session-relay-correlated-messaging-and-worker-results.md
  - docs/plans/active/session-relay-linux-workspace-release.md
  - docs/plans/active/session-relay-linux-workspace-publication.md
  - "DocksDocks/public:docs/plans/active/session-relay-0.14.0-docks-kit-0.12.0-release.md"
---

# Continue correlated Session Relay results release

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"68c9312dbcbbce69d32fe86f4d7c36dda95b91ecfe3bcc3e779ceb6394490a55","invocations":2,"result_sha256":"0a65944703ad10ea19342b88b10d169ea90d962a28721ae30dbe5018b65129b8","state":"passed"},"execution_parent":"141e2d84e30ee8d97934ecbe178c54d5d83c05a2","goal_id":"8b89aabf-7336-4352-bc11-225bab67f9aa","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-correlated-results-release-continuation.md","plan_sha256":"7e53668c7a54fe84d3659d0c18862d6dcfa1566b7208d6b3ecf2712299ce0fb5","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"9349cb79-232f-48fc-a7de-5da7eae64e84","schema":1,"source_base":"141e2d84e30ee8d97934ecbe178c54d5d83c05a2","source_sha256":"a6a01c679898f4e9a1c114a32f6df2280a776c97be63f3aac96ef5f50ec5c9c3"}

## Goal

Ship Session Relay 0.14.0 with one durable logical terminal reply per correlation, one immutable typed result per newly created fanout generation, strict collection validation, and byte-compatible legacy behavior. Push the reviewed Docks implementation, stage Relay as a prerelease, observe the separately reviewed public child publish and archive docks-kit 0.12.0, then promote the same five Relay assets to stable.

## Context & rationale

The predecessor `session-relay-correlated-results-release.md` is terminally blocked after its first draft-review permit failed before model selection and its second review found three execution defects. This continuation uses a new run id and accepts exactly those repairs: Docks push and release are separate effect boundaries; the public child alone owns public/npm/tag/archive writes; and Docks accepts that child only after repository-qualified red commands, expected failures, exit codes, output/blob hashes, and ordering prove tests preceded public edits. Commit `141e2d84e30ee8d97934ecbe178c54d5d83c05a2` separately repaired the lifecycle hasher so required `blocked_reason` metadata is excluded from plan identity and passed the full repository gate.

Current Relay source/manifests remain 0.13.0. Read-only probes established that `session-relay--v0.14.0`, `cli-v0.12.0`, and `docks-kit@0.12.0` do not exist. Three older Session Relay plans are target-locally `legacy-quarantined`; never edit, resume, consume, delete, or use their schema-1–6 records as authority. Their carried obligations are additive compatibility, four native binaries plus `SHA256SUMS`, no Windows, red tests before implementation, exact ancestry and hashes, and no Session Relay transport for canonical review.

### Fixed protocol contract

`MessageV2` is a closed canonical JCS object at most 16 KiB with required schema 2, lowercase UUID-v4 message/correlation/from/to ids, exact existing UTC timestamp shape, kind `request|terminal_reply|worker_result`, nullable reply/status/digest fields, and a 1..4096-byte UTF-8 no-NUL body. Requests have all three variant fields null; terminal replies bind the exact request id and `completed|failed`; worker results bind the fanout request plus an exact `WorkerResultV1` SHA-256. Legacy JSONL rows remain on their old parser and renderer.

`ClaimStatusV1` is one closed mode-0600 canonical record under `protocol-v1/{pending,open,terminal}/<correlation>.json`. It embeds exact request/reply envelopes and digests. Legal states are `RequestPending`, `Open`, `ReplyPending`, `ReplyEnqueued`, and `ReplyConsumed`; directory, delivery values, origin (`message|fanout`), exact requester/responder ids, and nullability must agree. The existing kernel lock owns append/find/drain and state transitions; no second lock hierarchy. Recovery scans only pending records, appends embedded exact bytes only when absent by message id, and advances. One exact responder claim wins; byte-identical retry is idempotent; any other claimant or changed payload is `correlation_conflict` without enqueue.

`WorkerResultV1` is a closed canonical object at most 1 MiB embedded once in its owning fanout generation with digest beside it. It binds result/correlation/reservation/root/worker/generation/runtime identities, repository common-dir/dev/ino/object format, base and handback commits, `completed|failed`, bounded summary, at most 4096 sorted unique normalized UTF-8 paths derived from the exact diff, and timestamp. Handback atomically writes the result with `Running -> HandedBack` and claims its worker-result envelope. Supervisor cannot fence, terminate, or release capacity before matching `ReplyEnqueued|ReplyConsumed`. Collection verifies all bytes, identities, commits, paths, child ordering, and custody before merge. Pre-upgrade fanout records retain absent optional fields and old behavior.

Public additions are CLI `request`, `reply`, `collect --result-json`; MCP `request`, `reply`; fanout opt-in correlation JSON; prompt final handback command; and typed hook/watch/channel rendering. Existing `send`, inbox/peek, handback, human spawn, default collect bytes, six MCP schemas, and selftest jobs remain unchanged. CLI validation/domain errors exit 1 except competing claims exit 2 with `correlation_conflict`; exact retry exits 0. MCP malformed input stays `-32602`; domain failures are `isError:true` with only `unknown_correlation|unauthorized_responder|correlation_conflict|protocol_store_error`.

## Environment & how-to-run

- Repository `/home/vagrant/projects/docks`; source base `141e2d84e30ee8d97934ecbe178c54d5d83c05a2`; pinned Rust toolchain and `cargo --locked`.
- Every test uses a fresh `AGENT_RELAY_HOME`; black-box paths use an explicit absolute freshly built binary.
- Focused Rust inventories: `--test protocol`, `--test fanout`, `--test bus_smoke`, and `--test lifecycle_supervisor` against the crate manifest.
- Run selftest with `SESSION_RELAY_TEST_JOBS=1` and `4`, compare stdout bytes, then both explicit-binary workspace smoke cases.
- Focused/full gates: `node scripts/ci.mjs --plugin session-relay`, then `node scripts/ci.mjs`.
- Release only through the reviewed Session Relay prepare/publication/promotion/finalization entrypoints beginning `node scripts/release.mjs --prepare --plugin session-relay 0.14.0`.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Freeze legacy bytes and add protocol, fanout, CLI/MCP, workspace, automatic-delivery, and release red tests before production edits. | Rust tests; relay scenarios/contracts | — | `local` | `planned` | Every new test fails only for missing behavior; record command, exit, signature, output hash, and test blob hash. Harness/setup failure stops. |
| 2 | Implement closed protocol types, claim authority, recovery, and request/reply APIs. | `protocol.rs`; `protocol/authority.rs`; `store.rs`; CLI | 1 | `local` | `planned` | Variant/state/bounds/race/failpoint/tamper tests pass and an isolated two-session request/reply/race smoke yields one terminal digest. |
| 3 | Implement immutable fanout results and custody/order gates. | fanout/spawn/supervisor source and tests | 2 | `local` | `planned` | One result per generation; corrupt/stale/unordered inputs fail before merge and retain custody; no premature release. |
| 4 | Add CLI/MCP/result-json and typed automatic rendering while preserving old surfaces. | bus/CLI/hook/watch/channel; scenarios | 2 | `local` | `planned` | Exactly two MCP tools are added; typed identity survives every path; frozen legacy fixtures and jobs 1/4 bytes are unchanged. |
| 5 | Update current docs, release contracts, versions, and companion bindings without changing historical receipts. | docs/manifests/catalogs/Cargo/release scripts/contracts | 2, 3, 4 | `local` | `planned` | Current bindings are 0.14/0.12, old 0.13 receipts remain immutable history, and release contracts pass. |
| 6 | Run all focused/full verification and direct release-binary smokes. | all affected paths | 5 | `local` | `planned` | Format, clippy, exact inventories, selftest parity, workspace smoke, plugin CI, full CI, request/reply, and result-json pass on exact bytes. |
| 7 | Commit the owned implementation and obtain exact-diff CompletionReviewV1, repairing at most once. | affected paths; this plan | 6 | `local` | `planned` | Matching completion review passes the exact unpublished implementation commit/diff and acceptance bindings. |
| 8 | Probe remote/tag/release/npm absence and exact remote-main ancestry. | GitHub/npm read-only endpoints | 7 | `probe` | `planned` | Targets remain absent and remote main equals reviewed execution parent; ambiguity or divergence stops. |
| 9 | Fast-forward only the reviewed Docks implementation commit to remote main. | Docks main | 8 | `push` | `planned` | Exact reviewed commit is remotely readable as main; no merge/rebase/force/substitution. |
| 10 | Stage one native five-asset Relay prerelease through the reviewed entrypoint. | Relay tag/prerelease/four binaries/SHA256SUMS | 9 | `release` | `planned` | One run produced all assets; independent hashes match; release is prerelease; no Windows asset. |
| 11 | Probe the independently executed public child and accept it only after its red-first and release evidence is complete. | repository-qualified public child evidence | 10 | `probe` | `planned` | Before any public edited blob/commit, the child records each red command, expected failure, exit, stable signature, output hash, and test blob hash; its finished PlanRunV1, reviewed commits, tag, npm, assets, and four Relay pins are remotely readable. Missing/misordered evidence stops; Docks performs no public write. |
| 12 | Bind that finished public child and promote the byte-identical Relay prerelease to stable. | promotion/finalization receipts; stable release | 11 | `release` | `planned` | Verifier matches current main, five staged assets, public identities, and hashes; no replacement, retag, or conflicting retry. |
| 13 | Download/smoke stable Relay, archive this continuation, and push the exact archive checkpoint. | stable asset; finished plan | 12 | `push` | `planned` | Linux x64 reports 0.14.0 and passes selftest/docs/correlated smoke; finished plan and archive commit read back from origin. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | Existing legacy fixtures, CLI/MCP tests, selftest jobs 1/4, and default collect | Old stores load and all frozen output bytes remain identical. |
| A2 | `cargo test --locked --manifest-path plugins/session-relay/rust/Cargo.toml --test protocol` | Closed matrices, malformed/bounds, responder, idempotence, races, failpoints, recovery, and tamper pass. |
| A3 | Same command with `--test fanout`, `--test bus_smoke`, `--test lifecycle_supervisor` | Result/custody/order and MCP mappings pass without premature release. |
| A4 | Fresh-binary request/reply/result-json and both workspace smoke cases | Correlation/result identity and old single-session behavior pass end to end. |
| A5 | Hook/watch/channel scenarios plus byte comparison | Typed identity survives and legacy rendering bytes do not change. |
| A6 | Release contracts, `cargo fmt --check`, clippy with `-D warnings`, focused CI, full CI | All exit 0 on the exact implementation tree. |
| A7 | Docks push receipt and native prerelease evidence | Remote main is the reviewed commit; exactly four native binaries plus matching SHA256SUMS exist as prerelease; no Windows. |
| A8 | Public child Verification Results and Git ancestry | Repository-qualified red commands/exits/signatures/output hashes/test blob hashes precede every public edit commit; finished child binds review, acceptance, release commit/tag/npm/assets and four Relay digests. |
| A9 | Stable release APIs, independent hashes, downloaded Linux x64 smoke | Same five prerelease bytes are stable and smoke reports 0.14.0 with correlated results working. |
| A10 | PlanRunV1 validators in both repositories | Children share only goal_id; repository/path/run/commit/effect/acceptance identities are qualified; public finishes before Docks promotion; legacy plan bytes remain unchanged. |

## Out of scope / do-NOT-touch

- Never mutate the blocked predecessor, any schema-1–6 plan family, finished plan, v0.13 tag/release/assets, or historical receipt.
- Do not change old send/inbox/peek/handback/default-collect schemas or bytes, add Windows, create another lock hierarchy, make Relay a review transport, or promise exactly-once process execution.
- Docks never publishes npm, public tags/assets, or the public plan. Never deploy, force-push, rebase around divergence, delete/retag, replace assets, or use a generic plugin release path.

## STOP conditions

- Stop on target identity collision, remote divergence, concurrent owned-path/index/HEAD change, or absent exact live authority at any push/release boundary.
- Stop rather than weaken a fixed assertion; block after repeated same-signature failure without relevant-byte progress.
- Stop on duplicate terminal result, missing recovery bytes, dropped automatic identity, premature supervisor release, mutable result, pre-validation merge, changed legacy bytes/jobs parity, missing or misordered public red evidence, native asset/digest/run mismatch, Windows asset, or recovery requiring force/delete/retag/reupload.

## Open questions

N/A — versions, protocol matrices, error surfaces, repository ownership, effect boundaries, evidence ordering, supported platforms, and release sequence are fixed.

## Review

Continuation draft review invocation 1 ended before model selection. Invocation 2 passed.

Review-result: {"findings":[],"invocation":2,"plan_sha256":"7e53668c7a54fe84d3659d0c18862d6dcfa1566b7208d6b3ecf2712299ce0fb5","run_id":"9349cb79-232f-48fc-a7de-5da7eae64e84","schema":1,"source_sha256":"a6a01c679898f4e9a1c114a32f6df2280a776c97be63f3aac96ef5f50ec5c9c3","verdict":"pass"}

## Verification Results

- Prerequisite lifecycle-hash fix: focused hashing-manifests 14/14 passed, then authoritative node scripts/ci.mjs passed on commit 141e2d84e30ee8d97934ecbe178c54d5d83c05a2.
- Reviewed source-base fast-forward: origin/main 7d8577f577f1b2252f7873d8d91ca7cbcf96e01c -> 141e2d84e30ee8d97934ecbe178c54d5d83c05a2; readback matched. ExternalAuthorityV1 source SHA-256 73f77e6060cc5cca1faa7fc4e9b1fd7c6a6a8f8ff78ce793332025225480740a.
