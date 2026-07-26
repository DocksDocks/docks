---
title: Complete PlanRun-native Relay promotion
status: blocked
created: "2026-07-26T01:50:00.000Z"
updated: "2026-07-26T01:55:00.000Z"
blocked_since: "2026-07-26T01:55:00.000Z"
started_at: null
finished_at: null
assignee: null
tags: [session-relay, release, planrun, remediation]
affected_paths:
  - plugins/session-relay/test/release-promotion-contract.mjs
  - plugins/session-relay/test/release-publication-contract.mjs
  - scripts/lib/session-relay-release-preparation.mjs
  - scripts/lib/session-relay-release-promotion.mjs
  - scripts/lib/session-relay-release-publication.mjs
related_plans:
  - docs/plans/active/session-relay-correlated-results-release-remediation-v4.md
  - "DocksDocks/public:docs/plans/finished/2026-07-26-session-relay-0.14.0-docks-kit-0.12.0-release.md"
---

# Complete PlanRun-native Relay promotion

Plan-run: {"acceptance":null,"blocker":{"evidence_sha256":"92453b144bf5bfb04fe5a0ad4c3426fe45a80ac48d321d7299d60b057162ad99","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"20be85a1c1a620f08aa37f9f706c045952add987577958745aaa3abe0e2617d4","invocations":2,"result_sha256":"92453b144bf5bfb04fe5a0ad4c3426fe45a80ac48d321d7299d60b057162ad99","state":"blocked"},"execution_parent":null,"goal_id":"8b89aabf-7336-4352-bc11-225bab67f9aa","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-correlated-results-release-remediation-v5.md","plan_sha256":"06c890ba284238f253d9408a0f0d71a0f531a7a5ac9c1c6d94f04a26c6997a80","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"755e7d93-1102-4c39-b545-d4ec36cee23d","schema":1,"source_base":"327c0d1e8ecb580dafa6b8fa4ea21aabbe5bbf50","source_sha256":"32d44a9df080ef4e3f4b1d6d0227de195bbbcc52f198f8b8306457386ac1e91e"}

## Goal

Make the Session Relay promotion verifier consume the finished current PlanRunV1 public child without requiring an impossible self-referential archive-commit record, review the already-pushed prerelease recovery repair, then promote the unchanged Session Relay 0.14.0 prerelease assets to stable and archive the release lineage.

## Context & rationale

The reviewed v4 implementation staged `session-relay--v0.14.0` as a prerelease. A same-candidate publication recovery at `327c0d1e8ecb580dafa6b8fa4ea21aabbe5bbf50` repaired an interrupted GitHub publication and is already pushed but was not included in v4's passed completion-review diff. The separately reviewed public child then released docks-kit 0.12.0 at `88ab1911490edad83b387514bb8e899f02338d69`, archived at `2c914e1aae125f17bd9660f2accca009643ddb2a`, and was read back from origin.

The v4 verifier rejected that valid child because it requires one `Public-release-evidence` record inside the finished plan and requires the record's `archive_commit` to equal the Git commit containing the record. Git commit identity hashes the tree containing that identity, so this is a circular fixed-point requirement that production cannot satisfy. The public child instead carries the canonical current `PlanRunV1`: exact repository/path/run identity, execution parent, implementation commit, passed draft/completion phases, acceptance hashes, canonical Verification Results, finished status, and immutable archived bytes. Blocker evidence is SHA-256 `700b046dc91b0658d7fdca65203750f45087a91650058f0e21caa4c7eb2c6ce9`.

No released identity may change. Relay tag, commit, four binaries, and `SHA256SUMS` remain byte-identical. docks-kit 0.12.0, its tag, npm package, assets, and finished plan remain immutable.

## Environment & how to run

- Repository `/home/vagrant/projects/docks`; source base `327c0d1e8ecb580dafa6b8fa4ea21aabbe5bbf50`; shared goal `8b89aabf-7336-4352-bc11-225bab67f9aa`.
- Relay prerelease `session-relay--v0.14.0` targets `7d9cbbbdf82210d396de744372eadb6c26655601`; its four assets and checksum file were independently downloaded and hashed.
- Public release `cli-v0.12.0` targets `88ab1911490edad83b387514bb8e899f02338d69`; finished public child path is `docs/plans/finished/2026-07-26-session-relay-0.14.0-docks-kit-0.12.0-release.md` at `2c914e1aae125f17bd9660f2accca009643ddb2a`.
- Focused checks: `node plugins/session-relay/test/release-promotion-contract.mjs`, `node plugins/session-relay/test/release-publication-contract.mjs`, and the exact `--verify-public-release` production command.
- Full checks: `node scripts/ci.mjs --plugin session-relay` and authoritative `node scripts/ci.mjs`.

## Steps

| # | Step | Effect | Acceptance |
|---|---|---|---|
| 1 | Review this exact five-path source manifest and the cumulative publication recovery obligation. Preserve v4 and the public finished plan immutably. | local | One bound PlanReviewV1 passes, or one bounded repair changes the plan and invocation 2 passes. |
| 2 | Add red promotion-contract coverage using a real current PlanRunV1-shaped finished public plan and the observed public Git ancestry. | local | The focused promotion contract fails only because the current verifier requires the impossible embedded `Public-release-evidence` record. |
| 3 | Start this run with one checkpoint containing only the plan and red test. Audit `327c0d1` against `8afd7e0` and retain the publication recovery assertions unchanged or strengthen them if a defect is found. | local | The start checkpoint contains no production fix; the review scope explicitly includes the already-pushed preparation/publication delta. |
| 4 | Add a closed PlanRunV1 verification branch. Reuse canonical plan-run parsing, verify finished status, exact repository/path/run identity, passed draft and completion phases, execution parent and implementation commit, acceptance source/Verification Results hashes, exact affected-path manifest at the public implementation commit, immutable plan bytes at the archive commit, and Git ancestry through release/archive. Keep the legacy evidence branch strict and unchanged. | local | The current public child passes; malformed, blocked, stale, mismatched, tampered, unhashed, or ancestry-invalid PlanRun children fail closed; legacy fixtures retain byte-for-byte behavior. |
| 5 | Run focused/full gates, create one implementation checkpoint, and review the cumulative `8afd7e0..implementation` diff plus the exact final manifest. | local | CompletionReviewV1 passes with no blocking findings and explicitly covers the pushed publication recovery and new PlanRun verifier. |
| 6 | With live exact authority, fast-forward Docks main, emit and verify the public companion receipt, run the reviewed promotion entrypoint against `session-relay--v0.14.0`, and require stable promotion without tag or asset mutation. | push | Origin main equals the reviewed checkpoint; the receipt binds public release/archive/completion evidence; promotion reports the existing assets unchanged and `isPrerelease=false`. |
| 7 | Download all stable Relay assets, compare every digest with the prerelease receipt and `SHA256SUMS`, smoke the Linux x64 binary through version and request/reply/result-json, finish/archive this plan, commit the archive checkpoint, push, and read back. | release | Stable release bytes are identical, smoke succeeds, PlanRunV1 is finished with observed acceptance, and the dated archive is present at origin main. |

## Dependencies

- Immutable v4 completion review and implementation evidence, plus the separately recorded post-review publication recovery commit `327c0d1e8ecb580dafa6b8fa4ea21aabbe5bbf50`.
- Immutable public child release commit `88ab1911490edad83b387514bb8e899f02338d69`, archive commit `2c914e1aae125f17bd9660f2accca009643ddb2a`, and passed completion result SHA-256 `8034b252d665e71271e932384318585e14cdc0f3ed9452e911a6136aff5739cb`.
- Current-user authority to push Docks main and promote the exact existing Relay 0.14.0 prerelease.

## Risks & mitigations

- Weakening supply-chain proof: accept only a fully validated current PlanRunV1 branch; do not make the legacy branch optional or trust prose fields.
- Reviewing already-pushed recovery bytes: completion review binds the cumulative range from `8afd7e0` and the final five-path manifest, not only the new checkpoint parent.
- Release mutation: promotion may change prerelease metadata only; tag, commit, assets, checksums, and published public package are immutable inputs.
- Cross-repository confusion: every public identity and commit is exact; verifier clones origin and proves ancestry/read-back rather than trusting the local sibling worktree.

## STOP conditions

- Draft or completion review blocks; red does not fail for the impossible embedded-record requirement; current PlanRun validation cannot fail closed; focused/full checks fail; cumulative review omits `327c0d1`; origin main diverges; public identities differ; Relay assets/tag differ; or promotion requires retagging, reupload, force, delete, rebase, or release recreation.

## Open questions

N/A. The failing production command, current public archive, release identities, Git ancestry, and required compatibility boundary are observed.

## Review

Invocation 1 transport failed before review: `task:plan-reviewer` returned `No model selected`; evidence SHA-256 `e37898b62573f8e3f9949fb1ff7d79a9cf1a96ce28eeb7ce7a78740e6106c9b8`. The immutable bundle remained unchanged for invocation 2.

Invocation 2 transport also failed before review: `eval:agent:plan-reviewer` returned `No model selected`; evidence SHA-256 `92453b144bf5bfb04fe5a0ad4c3426fe45a80ac48d321d7299d60b057162ad99`. Sensitive/external review cannot degrade, so this run is terminal blocked.

## Verification Results

Not run.
