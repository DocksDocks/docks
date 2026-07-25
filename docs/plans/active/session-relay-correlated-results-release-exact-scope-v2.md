---
title: Finalize reviewed Session Relay exact-scope candidate
goal: Review, checkpoint, and release the verified Session Relay 0.14.0 exact-scope candidate, then complete the separately reviewed docks-kit 0.12.0 companion and byte-identical stable promotion.
status: blocked
created: "2026-07-25T22:52:00.000Z"
updated: "2026-07-25T23:20:00.000Z"
started_at: "2026-07-25T23:00:00.000Z"
finished_at: null
blocked_reason: "Completion review input named a diff digest that disagreed with the sealed bundle; ReviewInvalidInputV1 is terminal."
blocked_since: "2026-07-25T23:20:00.000Z"
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
  - docs/plans/active/session-relay-correlated-results-release-exact-scope.md
  - "DocksDocks/public:docs/plans/active/session-relay-0.14.0-docks-kit-0.12.0-release.md"
---

# Finalize reviewed Session Relay exact-scope candidate

Plan-run: {"acceptance":{"source_sha256":"843016ce1f97b4c71bccb08b57f78ff659c98336a420f64cb823d6b520f852b1","verification_sha256":"2dfbea82f41dec78e07bbc1be77d828388a818c535f07afe0b5c3ab4423ccbd8"},"blocker":{"evidence_sha256":"6b67045f1417773a0031987aae354f3a45ffd73ab72e9684c70234a17f68e605","kind":"review_failed"},"completion_review":{"input_sha256":"7e699f5b36bc828df7c4f390688eb43aaaf4fd1cbbc3919571d1b65102dd69fb","invocations":1,"result_sha256":"6b67045f1417773a0031987aae354f3a45ffd73ab72e9684c70234a17f68e605","state":"blocked"},"draft_review":{"input_sha256":"30392307bc3dcab2cb7bd5b715204ba14c9f01301c3cbff50fb630d698b05cee","invocations":1,"result_sha256":"bede486a40a03d9f1e1cb3997d12fd6d13cacff19b4ebbc9fcc5f335c7d6fbc1","state":"passed"},"execution_parent":"7b733f15862d7f01cd7eb55a1ad045aedccb7eae","goal_id":"8b89aabf-7336-4352-bc11-225bab67f9aa","implementation_commit":"32ae6b4cf72cce2fe58085a4e3e332752a100e4f","plan_path":"docs/plans/active/session-relay-correlated-results-release-exact-scope-v2.md","plan_sha256":"39f6e4b15b4254a623c2f3964c485c45d20b2de856a2cef4f4969e7abb1f3152","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"20c1ee49-e26b-4d49-ae62-be6f1858a7fc","schema":1,"source_base":"7b733f15862d7f01cd7eb55a1ad045aedccb7eae","source_sha256":"37228f32b14be3efefabf90074bc38f86ea80cc3a603a64857eacc100f8dd176"}

## Goal

Finalize the already red-first, implemented, and locally verified 0.14.0 candidate under the exact 49 changed implementation/validator paths. This run replaces only failed plan custody: the predecessor omitted paths after start, and the first exact-scope run was terminally closed when its second reviewer received a stale invocation-1 bundle.

## Fixed contract

No product decision changes. `MessageV2`, request/reply claim recovery, `WorkerResultV1`, custody, collection, CLI/MCP/rendering, legacy byte compatibility, native asset matrix, public ownership, prerelease ordering, and stable byte identity remain exactly as reviewed by the predecessor. Docks owns its implementation/push/Relay release only; the public child alone owns public repository, npm, tag, asset, and plan writes.

Current observed evidence is not adopted as review authority: focused Session Relay CI and full repository CI exited 0; the release binary reported 0.14.0; a fresh relay home delivered one request and one completed terminal reply; the explicit fresh-binary smoke produced a digest-bound `collect --result-json` result. This run rebinds those checks after review and before checkpoint.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Review and start the exact 49-path run. | this plan; affected paths | — | `local` | `planned` | Fresh sealed invocation-1 bundle passes; start captures current HEAD. |
| 2 | Re-run focused/full gates and release-binary request/reply/result-json smoke. | affected paths | 1 | `local` | Exact candidate passes without byte drift. |
| 3 | Commit only affected paths, bind acceptance, and run exact-diff completion review with at most one repair. | affected paths; lifecycle | 2 | `local` | Unpublished implementation commit and CompletionReviewV1 pass exactly. |
| 4 | Probe target absence and remote-main ancestry, then fast-forward the reviewed Docks commit. | GitHub readback; Docks main | 3 | `probe` | No collision/divergence; exact reviewed commit is remote main. |
| 5 | Stage one five-asset native Relay prerelease through the reviewed entrypoint. | Relay tag/release/assets | 4 | `release` | Four binaries plus matching SHA256SUMS, one run, no Windows, prerelease true. |
| 6 | Accept only the separately reviewed and finished public child with red-first and release evidence. | repository-qualified public evidence | 5 | `probe` | Finished PlanRunV1, commits, tag, npm, assets, and Relay pins match remotely. |
| 7 | Bind public evidence, promote the same assets stable, smoke download, archive, and push terminal Docks state. | promotion/finalization; finished plan | 6 | `release` | Stable bytes equal prerelease; Linux x64 smoke passes; archive commit reads back. |

## Acceptance criteria

| ID | Evidence | Expected |
|---|---|---|
| A1 | Affected manifest/checkpoint | Exactly the 49 listed paths; plan lifecycle files handled separately; no extra implementation path. |
| A2 | Focused/full CI | `node scripts/ci.mjs --plugin session-relay` and `node scripts/ci.mjs` exit 0. |
| A3 | Release binary smoke | 0.14.0 version, one authoritative terminal reply, one digest-bound result-json, frozen legacy compatibility. |
| A4 | Completion review | Exact unpublished commit/diff and acceptance hashes pass. |
| A5 | Docks push/prerelease | Remote main is reviewed; exactly five native artifacts; independent checksums match; no Windows. |
| A6 | Public child | Red evidence precedes edits; finished reviewed release identities and four Relay digests are remote. |
| A7 | Stable/archive | Stable assets are byte-identical; downloaded Linux x64 smoke passes; finished plan checkpoint is remote. |

## Out of scope / STOP

Never reopen blocked predecessors, mutate historical v0.13 receipts/assets, change protocol or legacy bytes, add Windows, write public/npm state from Docks, force/rebase/retag/replace assets, or proceed through target collision, divergence, path drift, failed review, misordered public evidence, digest mismatch, or absent exact live authority.

## Open questions

N/A.

## Review

Review-result: {"findings":[],"invocation":1,"plan_sha256":"39f6e4b15b4254a623c2f3964c485c45d20b2de856a2cef4f4969e7abb1f3152","run_id":"20c1ee49-e26b-4d49-ae62-be6f1858a7fc","schema":1,"source_sha256":"37228f32b14be3efefabf90074bc38f86ea80cc3a603a64857eacc100f8dd176","verdict":"pass"}

Completion-review-invalid-input: {"error":"invalid_input","reason":"bundle_binding_mismatch","schema":1}

## Verification Results

- Pre-plan observation only: focused and full CI green; direct 0.14.0 request/reply green; explicit fresh-binary result-json green.
