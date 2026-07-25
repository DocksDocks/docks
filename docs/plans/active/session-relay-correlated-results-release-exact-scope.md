---
title: Finalize exact-scope correlated Session Relay release
goal: Finalize, review, and release the already verified Session Relay 0.14.0 implementation under its exact changed-path set, then complete the independently reviewed docks-kit 0.12.0 companion and byte-identical stable promotion.
status: blocked
created: "2026-07-25T22:40:00.000Z"
updated: "2026-07-25T22:50:00.000Z"
started_at: null
blocked_reason: "Second draft-review launch received an invocation-1 sealed bundle; closed as ReviewInvalidInputV1 bundle_binding_mismatch."
blocked_since: "2026-07-25T22:50:00.000Z"
finished_at: null
assignee: null
tags: [session-relay, protocol, fanout, release, scope-repair]
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
  - "DocksDocks/public:docs/plans/active/session-relay-0.14.0-docks-kit-0.12.0-release.md"
---

# Finalize exact-scope correlated Session Relay release

Plan-run: {"acceptance":null,"blocker":{"evidence_sha256":"6b67045f1417773a0031987aae354f3a45ffd73ab72e9684c70234a17f68e605","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"c073b0dd6eb270d07da7ca8033050f36e1137f8b24438320a418aca331ce97f9","invocations":2,"result_sha256":"6b67045f1417773a0031987aae354f3a45ffd73ab72e9684c70234a17f68e605","state":"blocked"},"execution_parent":null,"goal_id":"8b89aabf-7336-4352-bc11-225bab67f9aa","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-correlated-results-release-exact-scope.md","plan_sha256":"9ad5e6985878e066c7fd6fb68b6bbc1f235bcc737edebd7cc02bb32a5cc48f72","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"4560f5ac-cde4-4a94-a481-e77f2d37c06c","schema":1,"source_base":"7b733f15862d7f01cd7eb55a1ad045aedccb7eae","source_sha256":"37228f32b14be3efefabf90074bc38f86ea80cc3a603a64857eacc100f8dd176"}

## Goal

Close the predecessor's reviewed affected-path omission without changing the approved product or release contract. Bind every currently changed implementation and validator path, checkpoint the already green 0.14.0 candidate, obtain exact-diff completion review, then execute the same staged prerelease → public child → stable promotion sequence.

## Context & rationale

The preceding continuation passed draft review and drove red-first implementation, but its affected paths omitted seven files required by the resulting implementation and validator inventory. It is terminally blocked with typed verification evidence rather than broadening its reviewed ownership after start. This fresh run carries the same goal id, fixed protocol/release contract, public child, source base, and external boundaries, but owns the exact 49-path candidate tree.

Observed local evidence before this plan: focused Session Relay CI passed; authoritative full repository CI passed; the release binary reported `session-relay 0.14.0`; a fresh temp relay home delivered one request and one completed terminal reply; the explicit fresh-binary workspace smoke validated correlated `collect --result-json`. This evidence does not substitute for this run's bound acceptance and completion review.

The fixed product contract remains: closed canonical `MessageV2`, crash-safe one-winner request/reply claims, immutable `WorkerResultV1`, custody until terminal delivery, strict pre-merge collection validation, additive CLI/MCP/rendering, unchanged legacy send/inbox/peek/handback/default-collect bytes, exactly four native binaries plus `SHA256SUMS`, no Windows, Relay prerelease before the separately reviewed public child, and byte-identical stable promotion only after that child finishes.

## Environment & how-to-run

- Repository `/home/vagrant/projects/docks`; source base `7b733f15862d7f01cd7eb55a1ad045aedccb7eae`; pinned Rust toolchain and `cargo --locked`.
- Candidate verification: `node scripts/ci.mjs --plugin session-relay`, then `node scripts/ci.mjs`.
- Release binary: `plugins/session-relay/rust/target/release/relay`; fresh `AGENT_RELAY_HOME` for request/reply and result-json smoke.
- Release only through `node scripts/release.mjs --prepare --plugin session-relay 0.14.0` and its reviewed publication/promotion/finalization handlers.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Review and start this exact-scope continuation. | this plan; all affected paths | — | `local` | `planned` | Bound draft review passes; execution parent is captured without changing candidate bytes. |
| 2 | Re-run exact candidate verification and release-binary smoke. | all affected paths | 1 | `local` | Focused CI, full CI, version, request/reply, and result-json all pass on the bound manifest. |
| 3 | Commit only the exact affected paths and obtain exact-diff completion review, repairing at most once. | all affected paths; plan lifecycle | 2 | `local` | Unpublished implementation commit, acceptance hashes, and completion evidence bind exactly. |
| 4 | Probe absence and ancestry, then fast-forward the reviewed Docks commit. | GitHub readback; Docks main | 3 | `probe` | Targets remain absent and origin/main equals the execution parent; divergence stops. |
| 5 | Stage one five-asset Relay prerelease through the reviewed entrypoint. | tag; prerelease; four binaries; SHA256SUMS | 4 | `release` | One run produced independently verified native assets; no Windows; release remains prerelease. |
| 6 | Accept the independently executed public child only after red-first, review, release, and archive evidence is remotely readable. | repository-qualified public evidence | 5 | `probe` | Finished public PlanRunV1, commits, tag, npm package, assets, and four Relay pins match. |
| 7 | Bind the public release, promote the byte-identical Relay release stable, smoke the download, archive, and push the Docks terminal checkpoint. | promotion/finalization receipts; finished plan | 6 | `release` | Stable five-asset bytes match prerelease; Linux x64 smoke passes; archive commit reads back. |

## Acceptance criteria

| ID | Command / evidence | Expected |
|---|---|---|
| A1 | Source manifest and checkpoint path set | Exactly the 49 listed implementation/validator paths; no unreviewed path enters the commit. |
| A2 | `node scripts/ci.mjs --plugin session-relay` and `node scripts/ci.mjs` | Both exit 0 on the exact candidate tree. |
| A3 | Fresh release binary request/reply and workspace correlated result smoke | One terminal reply and one digest-bound `collect --result-json`; legacy compatibility remains green. |
| A4 | CompletionReviewV1 | Passes the exact unpublished implementation commit/diff and acceptance bindings. |
| A5 | Docks push and native prerelease evidence | Remote main is the reviewed commit; exactly four native binaries plus matching SHA256SUMS; no Windows. |
| A6 | Public child evidence | Repository-qualified red commands/hashes precede edits; finished child binds reviewed release identities and four Relay digests. |
| A7 | Stable release and archive evidence | Same prerelease bytes are stable; downloaded Linux x64 reports 0.14.0 and passes correlated smoke; finished plan commit is remotely readable. |

## Out of scope / do-NOT-touch

- Never mutate blocked or schema-1–6 predecessors, finished plans, v0.13 identities/assets, or historical receipts.
- Do not change the fixed protocol, legacy output, supported platform matrix, public ownership boundary, or release sequence while repairing plan scope.
- No force-push, rebase around divergence, retag, asset replacement, Windows asset, npm/public write from Docks, or generic release path.

## STOP conditions

Stop on candidate-byte drift before checkpoint, path-set mismatch, target collision, remote divergence, missing exact live authority, completion-review blocker after one repair, public evidence misordering, asset/run/digest mismatch, or any need to force/delete/retag/reupload.

## Open questions

N/A — this continuation changes plan ownership only; product, evidence, authority, and release contracts remain fixed.

## Review

Pending.

## Verification Results

- Pre-plan candidate: focused Session Relay gate passed; full repository gate passed; release binary 0.14.0 request/reply smoke passed; exact fresh-binary result-json smoke passed inside the plugin gate.
