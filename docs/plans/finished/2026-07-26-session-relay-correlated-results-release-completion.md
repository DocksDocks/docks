---
title: Complete exact review and release of Session Relay 0.14.0
goal: Review the sealed implementation diff for commit 32ae6b4, then release that already-verified candidate through the staged Relay, public companion, and stable promotion sequence.
status: blocked
created: "2026-07-25T23:22:00.000Z"
updated: "2026-07-25T19:44:25.790Z"
started_at: "2026-07-25T23:32:00.000Z"
blocked_reason: "Terminal completion review invocation 2 found typed mailbox drains can persist partial claim consumption before a later row fails, permanently suppressing legitimate delivery on retry; no review permit remains."
blocked_since: "2026-07-25T19:44:25.790Z"
finished_at: null
assignee: null
tags: [session-relay, protocol, release, completion-rescue]
affected_paths:
  - .claude-plugin/marketplace.json
  - plugins/session-relay/.claude-plugin/plugin.json
  - plugins/session-relay/.codex-plugin/plugin.json
  - plugins/session-relay/AGENTS.md
  - plugins/session-relay/README.md
  - plugins/session-relay/rust/Cargo.lock
  - plugins/session-relay/rust/Cargo.toml
  - plugins/session-relay/rust/src/bus.rs
  - plugins/session-relay/rust/src/channel.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/fanout.rs
  - plugins/session-relay/rust/src/fanout/authority.rs
  - plugins/session-relay/rust/src/fanout/git.rs
  - plugins/session-relay/rust/src/hook.rs
  - plugins/session-relay/rust/src/lib.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/rust/src/protocol.rs
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/src/watch.rs
  - plugins/session-relay/rust/tests/bus_smoke.rs
  - plugins/session-relay/rust/tests/fanout.rs
  - plugins/session-relay/rust/tests/protocol.rs
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - plugins/session-relay/skills/productivity/session-relay/references/fanout.md
  - plugins/session-relay/skills/productivity/session-relay/references/workspace.md
  - plugins/session-relay/test/companion-distribution-contract.mjs
  - plugins/session-relay/test/distribution-contract.mjs
  - plugins/session-relay/test/fanout-smoke.mjs
  - plugins/session-relay/test/fixtures/reentry-inventory.json
  - plugins/session-relay/test/fixtures/rust-test-inventory.json
  - plugins/session-relay/test/reentry-inventory.mjs
  - plugins/session-relay/test/release-evidence-contract.mjs
  - plugins/session-relay/test/release-promotion-contract.mjs
  - plugins/session-relay/test/release-publication-contract.mjs
  - plugins/session-relay/test/rust-test-inventory.mjs
  - plugins/session-relay/test/scenario-appserver.mjs
  - plugins/session-relay/test/scenario-core.mjs
  - plugins/session-relay/test/scenario-follow-doctor-mailbox.mjs
  - plugins/session-relay/test/scenario-hooks-identity.mjs
  - plugins/session-relay/test/selftest-fixture.mjs
  - plugins/session-relay/test/workspace-smoke.mjs
  - scripts/lib/plugins.mjs
  - scripts/lib/session-relay-release-cli.mjs
  - scripts/lib/session-relay-release-core.mjs
  - scripts/lib/session-relay-release-preparation.mjs
  - scripts/lib/session-relay-release-promotion.mjs
  - scripts/lib/session-relay-release-publication.mjs
  - scripts/verify-session-relay-preflight.mjs
related_plans:
  - docs/plans/active/session-relay-correlated-results-release-continuation.md
  - docs/plans/active/session-relay-correlated-results-release-exact-scope-v2.md
  - "DocksDocks/public:docs/plans/active/session-relay-0.14.0-docks-kit-0.12.0-release.md"
---

# Complete exact review and release of Session Relay 0.14.0

Plan-run: {"acceptance":{"source_sha256":"eb46783d6f5bbf20fecbce1b1e567aa681253e53ed9ba313a4147f5b0ddcd17d","verification_sha256":"f49dd406007ce4bbca074a045e406be934c0da9911c66edb13db64e22d07f0c3"},"blocker":{"evidence_sha256":"f887017925795f10a9b8706e7eb39f178a865b2d8ada3210d65b4a13a6538b94","kind":"review_failed"},"completion_review":{"input_sha256":"2e1f602155ab546d881e2a276343ca07d1824ea55a75fb89157d75c4ead71ab1","invocations":2,"result_sha256":"f887017925795f10a9b8706e7eb39f178a865b2d8ada3210d65b4a13a6538b94","state":"blocked"},"draft_review":{"input_sha256":"48fd1dd553ac13ce6b976e905a4de7833ae6e27934fd2b85cd23ca95a178f1ec","invocations":1,"result_sha256":"fdf6de69a8cd514a6e38c9d0bb06970e466a38cebf1e801a28e2e95382f7ea9a","state":"passed"},"execution_parent":"32ae6b4cf72cce2fe58085a4e3e332752a100e4f","goal_id":"8b89aabf-7336-4352-bc11-225bab67f9aa","implementation_commit":"c2ae0bca106d09f32cb989adcc44ed56489fcc58","plan_path":"docs/plans/active/session-relay-correlated-results-release-completion.md","plan_sha256":"a4e9341324e4fc0f8822fec81759501d8ec00bff26ba913169b7fe451ef25c95","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"a69dcd97-d1bd-46fc-9b6b-70e349e353fc","schema":1,"source_base":"32ae6b4cf72cce2fe58085a4e3e332752a100e4f","source_sha256":"843016ce1f97b4c71bccb08b57f78ff659c98336a420f64cb823d6b520f852b1"}

## Goal

Close only the prior completion-review dispatch error. The implementation is already checkpointed at `32ae6b4cf72cce2fe58085a4e3e332752a100e4f`; its exact 49-path diff from `7b733f15862d7f01cd7eb55a1ad045aedccb7eae` has SHA-256 `f04bfea63bf0d7a5a6b34f04420514cc423c9e849dc30b42ceb781124b7bcae6`. Obtain one correctly bound completion review over that sealed diff, then execute the unchanged reviewed staged-release contract.

## Context & rationale

The predecessor passed draft review and all candidate verification. Its completion bundle was internally sound, but the dispatch text named `f34e…` instead of the bundle's actual `f04b…`; the reviewer correctly returned terminal `ReviewInvalidInputV1` without reviewing code. This fresh run neither changes nor re-checkpoints implementation bytes. It binds the already-created commit and exact historical diff explicitly so review cannot silently shrink to an empty post-checkpoint diff.

## Environment & how-to-run

- Repository `/home/vagrant/projects/docks`; pinned Rust toolchain and `cargo --locked`.
- Candidate commit `32ae6b4cf72cce2fe58085a4e3e332752a100e4f`; reviewed baseline `7b733f15862d7f01cd7eb55a1ad045aedccb7eae`.
- Gates: `node scripts/ci.mjs --plugin session-relay`, then `node scripts/ci.mjs`.
- Release binary: `plugins/session-relay/rust/target/release/relay`; use fresh `AGENT_RELAY_HOME` for request/reply and result-json smoke.

## Steps

| # | Step | Effect | Acceptance |
|---|---|---|---|
| 1 | Seal `7b733f1..32ae6b4` over exactly the 49 affected paths; require diff SHA-256 `f04bfea63bf0d7a5a6b34f04420514cc423c9e849dc30b42ceb781124b7bcae6`; reserve and dispatch one exact completion review bound to commit `32ae6b4`. | local | Bundle files and prompt agree on run, invocation, commit, and diff digest; a pass has zero findings. |
| 2 | Reuse the observed focused/full gates and fresh-binary smokes only while affected bytes equal commit `32ae6b4`; otherwise rerun every invalidated check and reseal before review. | local | Final manifest binds all 49 paths; canonical Verification Results hash binds the observed commands. |
| 3 | Commit this plan lifecycle checkpoint without changing candidate paths. | local | Candidate commit and affected-path bytes remain exact. |
| 4 | With matching live authority, require `origin/main` at the reviewed parent, fast-forward exact reviewed commits, run the documented Relay preparation/publication flow, verify four native assets plus `SHA256SUMS`, and stage `session-relay--v0.14.0` as prerelease. | push | Remote read-back, tag/release/asset digests, and prerelease state match; no collision or divergence. |
| 5 | Complete the separately reviewed public child for docks-kit `0.12.0`; require its release/tag/assets and archived plan before binding its receipt in Docks. | release | Public package, archive, catalog, smoke, completion review, release, and plan archive all pass in the public repository. |
| 6 | Bind the exact public receipt, promote the unchanged Relay asset set stable, download and smoke a stable binary, then finish/archive this plan and push exact lifecycle commits. | release | Stable assets are byte-identical to prerelease assets; direct request/reply and result-json pass; final PlanRun hashes and remote read-back match. |

## Dependencies

- Immutable implementation commit `32ae6b4cf72cce2fe58085a4e3e332752a100e4f` and its already-observed verification.
- Separately reviewed public child plan with the same `goal_id`.
- Current exact `ExternalAuthorityV1` at every push/release boundary.

## Risks & mitigations

- Wrong-diff review: stop unless raw diff, binding file, bundle descriptor, lifecycle reservation, and dispatch all say `f04b…`.
- Candidate drift: compare all affected working bytes to `32ae6b4` before reuse; any drift invalidates checks and review input.
- Release ordering: prerelease Relay only, then public completion/archive, then byte-identical stable promotion.
- Remote or target divergence: fail closed; never force, rebase, delete, retag, replace assets, or upload through a collision.

## STOP conditions

Stop on any binding mismatch, candidate byte drift, review finding after the one permitted repair, failed gate/smoke, missing live authority, target collision, remote divergence, public evidence misordering, or asset/run/digest mismatch.

## Open questions

N/A.

## Review

Review-result: {"findings":[],"invocation":1,"plan_sha256":"a4e9341324e4fc0f8822fec81759501d8ec00bff26ba913169b7fe451ef25c95","run_id":"a69dcd97-d1bd-46fc-9b6b-70e349e353fc","schema":1,"source_sha256":"843016ce1f97b4c71bccb08b57f78ff659c98336a420f64cb823d6b520f852b1","verdict":"pass"}

Completion-review-result: {"diff_sha256":"f04bfea63bf0d7a5a6b34f04420514cc423c9e849dc30b42ceb781124b7bcae6","findings":[{"defect":"ProtocolStore::move_claim can crash after writing the destination but before unlinking the source, leaving duplicate Open/Pending claims that recovery advances without removing the stale earlier copy and permanently wedging the correlation.","fix":"Reconcile identical duplicate claims with later state authoritative and cover the mid-move crash window with a failpoint recovery test.","id":"protocol-claim-move-crash-window","kind":"crash_recovery","locator":"plugins/session-relay/rust/src/protocol.rs: ProtocolStore::move_claim, reply_locked, recover_pending_locked"},{"defect":"Typed renderable drain and peek accept rows without authoritative claims, and drain marks claims Consumed before injection; documented pre-inject raw requeue then silently drops the typed row on retry.","fix":"Require claims for typed rows and restore or defer delivery state across pre-inject requeue, with an injection-failure redelivery test.","id":"typed-delivery-claim-authority-and-requeue-loss","kind":"protocol_delivery","locator":"plugins/session-relay/rust/src/protocol.rs: drain_renderable_locked, consume_message_locked, peek_typed; plugins/session-relay/rust/src/store.rs: drain_authorized_mailbox"},{"defect":"CLI request/reply hard-require --from and request ignores accepted --json, contradicting the shipped optional identity fallback and complete canonical MessageV2 JSON contract.","fix":"Implement self-identity fallback and canonical --json output, with scenario coverage.","id":"cli-request-reply-contract-mismatch","kind":"public_contract","locator":"plugins/session-relay/rust/src/cli.rs: request and reply arms; plugins/session-relay/README.md; session-relay SKILL.md"},{"defect":"Current production receipt descriptors are normalized as schema 1, promotion makes the release stable before finalization that rejects stable state, and release preparation pins the predecessor run instead of this passed completion run.","fix":"Normalize V2 descriptors correctly with production-adapter coverage, make stable promotion/finalization sequencing executable and receipt-bound, and bind release identity to this completion plan run.","id":"release-flow-unexecutable","kind":"release_safety","locator":"scripts/lib/session-relay-release-promotion.mjs: CURRENT_PRODUCTION_ADAPTER, promoteCurrentReviewed; scripts/lib/session-relay-release-core.mjs: readCanonical; scripts/lib/session-relay-release-publication.mjs: finalizeCurrentReviewed; scripts/lib/session-relay-release-preparation.mjs: bindCurrentCompletion"}],"implementation_commit":"32ae6b4cf72cce2fe58085a4e3e332752a100e4f","invocation":1,"run_id":"a69dcd97-d1bd-46fc-9b6b-70e349e353fc","schema":1,"verdict":"repair"}

Completion-review-result: {"diff_sha256":"84166041b91a2b13c0f452c223ae0cbf231816b5c85b66918f62a2f74bb60b90","findings":[{"defect":"ProtocolStore::drain_renderable_locked and ProtocolStore::drain_typed persist earlier valid rows as Consumed before validating every later row. If a later typed row is unclaimed or claim-mismatched, the drain returns an error while leaving the raw mailbox intact, so retries suppress the earlier legitimate rows as already consumed and permanently lose their logical delivery.","fix":"Pre-parse and authority-check the complete mailbox without mutation, then apply consumption transitions only after every row passes; use strict canonical JCS parsing for renderable typed rows and add valid-row-then-invalid-row regression cases for both drains.","id":"typed-drain-partial-consumption","kind":"protocol_delivery","locator":"plugins/session-relay/rust/src/protocol.rs: ProtocolStore::drain_renderable_locked and ProtocolStore::drain_typed"}],"implementation_commit":"c2ae0bca106d09f32cb989adcc44ed56489fcc58","invocation":2,"run_id":"a69dcd97-d1bd-46fc-9b6b-70e349e353fc","schema":1,"verdict":"repair"}

## Verification Results

- Repair verification: 35 protocol integration tests pass; canonical CLI request/reply scenario passes; release promotion, publication, and evidence contracts pass.
- Repair gates: Session Relay focused gate and authoritative full repository gate pass; selftest jobs 1/4 remain byte-identical at 133 checks.
- Replacement implementation: `c2ae0bca106d09f32cb989adcc44ed56489fcc58`; cumulative exact diff: `84166041b91a2b13c0f452c223ae0cbf231816b5c85b66918f62a2f74bb60b90`.
