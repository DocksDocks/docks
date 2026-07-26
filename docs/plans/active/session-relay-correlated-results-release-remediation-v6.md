---
title: Finish PlanRun-native Relay promotion
status: blocked
created: "2026-07-26T02:00:00.000Z"
updated: "2026-07-26T05:54:12.590Z"
started_at: "2026-07-26T02:05:45.881Z"
blocked_reason: "Final completion-review transport failed before model execution; invocation 2 consumed the last permit."
blocked_since: "2026-07-26T05:54:12.590Z"
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
  - docs/plans/active/session-relay-correlated-results-release-remediation-v5.md
  - docs/plans/active/session-relay-correlated-results-release-remediation-v4.md
  - "DocksDocks/public:docs/plans/finished/2026-07-26-session-relay-0.14.0-docks-kit-0.12.0-release.md"
---

# Finish PlanRun-native Relay promotion

Plan-run: {"acceptance":{"source_sha256":"c9b409f075ef9f20a6bf38f3e8309729a033cb15108af44ecdfef2fa1b554665","verification_sha256":"87102ac0a29c0a70bc55f7100d9d2e9b3dd9a8a665fccd33c157d9ffdae5da0f"},"blocker":{"evidence_sha256":"4b0755b9be5d4c1b8236f67e7cca39306b0adf768145fe546b01ab0722d9ca0e","kind":"review_failed"},"completion_review":{"input_sha256":"1e770bb2c0efa56f1444e6b26096dfad068e59a4a7f16b0fe6a975f2e1e50798","invocations":2,"result_sha256":"4b0755b9be5d4c1b8236f67e7cca39306b0adf768145fe546b01ab0722d9ca0e","state":"blocked"},"draft_review":{"input_sha256":"2df8eb71edfa0e9c705cf49be6323669be317e73441961e74944899a9fb78670","invocations":1,"result_sha256":"85ef0aded3e015859e6ab8f75e3d79f65f058a03c3d695b079bf1ca588408711","state":"passed"},"execution_parent":"6d794a9d2380ea74c0b67a0b90e8f3825c9d0148","goal_id":"8b89aabf-7336-4352-bc11-225bab67f9aa","implementation_commit":"114432b642fd89497f8e1d1fde0a0c30fdd22f7b","plan_path":"docs/plans/active/session-relay-correlated-results-release-remediation-v6.md","plan_sha256":"3d224d109d12563ec364dd21ff164f683d43c18b3957854609e95a833d0c0358","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"1adc1590-49ee-42e6-93ab-8062e580d250","schema":1,"source_base":"6d794a9d2380ea74c0b67a0b90e8f3825c9d0148","source_sha256":"e35c783e7feec7f2031d1bf437f4450f5ea0e938aa784efed841426efbe45f58"}

## Goal

Validate the finished current PlanRunV1 public child without an impossible self-referential archive record, bind the already-pushed prerelease recovery repair, promote the unchanged Session Relay 0.14.0 assets to stable, and archive the release lineage.

## Context & rationale

`session-relay--v0.14.0` is a verified prerelease at Relay commit `7d9cbbbdf82210d396de744372eadb6c26655601`. Publication recovery commit `327c0d1e8ecb580dafa6b8fa4ea21aabbe5bbf50` repaired an interrupted same-candidate GitHub publication after v4 completion review and is already pushed. Public child run `1f801952-705e-4c7e-a533-91026c013383` released docks-kit 0.12.0 at `88ab1911490edad83b387514bb8e899f02338d69`, archived immutable PlanRun bytes at `2c914e1aae125f17bd9660f2accca009643ddb2a`, and was read back from origin.

The promotion verifier rejected that valid child because it requires an embedded `Public-release-evidence` record whose `archive_commit` equals the Git commit containing the record. This fixed-point requirement is unsatisfiable because the commit hash includes the tree containing its own asserted hash. The current PlanRunV1 already provides closed repository/path/run identity, execution parent, implementation commit, passed reviews, acceptance hashes, finished status, and canonical Verification Results. v4 is terminal blocked on SHA-256 `700b046dc91b0658d7fdca65203750f45087a91650058f0e21caa4c7eb2c6ce9`; v5 is terminal blocked after two reviewer-adapter failures before model selection. This fresh run uses the same configured `openai-codex/gpt-5.6-sol` model through a fresh explicit read-only OMP transport, not a fallback provider/model or resumed reviewer.

No released identity may change. Relay tag/commit/assets/checksums and docks-kit tag/package/assets/finished plan are immutable inputs.

## Environment & how to run

- Repository `/home/vagrant/projects/docks`; source base `6d794a9d2380ea74c0b67a0b90e8f3825c9d0148`; shared goal `8b89aabf-7336-4352-bc11-225bab67f9aa`.
- Public finished path `docs/plans/finished/2026-07-26-session-relay-0.14.0-docks-kit-0.12.0-release.md`; archive `2c914e1`; release `88ab191`; completion result SHA-256 `8034b252d665e71271e932384318585e14cdc0f3ed9452e911a6136aff5739cb`.
- Focused checks: release promotion and publication contracts plus exact `--verify-public-release` production invocation.
- Full checks: `node scripts/ci.mjs --plugin session-relay` and authoritative `node scripts/ci.mjs`.

## Steps

| # | Step | Effect | Acceptance |
|---|---|---|---|
| 1 | Seal the exact five-path bundle and dispatch one fresh canonical plan-reviewer with explicit same-model read-only OMP transport. Preserve every predecessor and public finished byte. | local | Bound PlanReviewV1 passes, or one repository-grounded repair and invocation 2 passes. |
| 2 | Add red promotion coverage using a real current PlanRunV1-shaped finished public plan and observed public Git ancestry. | local | Focused promotion contract fails only on the impossible embedded evidence requirement. |
| 3 | Start with one checkpoint containing only this plan and the red test. Audit cumulative `8afd7e0..327c0d1` publication recovery and retain or strengthen its assertions. | local | No production fix enters the start commit; completion scope explicitly includes the pushed recovery delta. |
| 4 | Add a closed PlanRunV1 verifier branch by reusing canonical plan-run parsing. Require finished status; exact repository/path/run/goal identity; passed draft/completion reviews; exact execution parent and implementation commit; canonical plan and Verification Results hashes; acceptance manifest recomputed from the public implementation commit; immutable archive bytes; release/archive ancestry and remote read-back. Keep legacy evidence verification strict and unchanged. | local | Current public child passes; blocked, stale, malformed, mismatched, tampered, unhashed, or ancestry-invalid children fail closed; legacy fixtures remain unchanged. |
| 5 | Run focused/full gates, create one implementation checkpoint, and review cumulative `8afd7e0..implementation` plus the final five-path manifest. | local | CompletionReviewV1 passes with no blocking findings and covers both publication recovery and PlanRun validation. |
| 6 | With live exact authority, fast-forward Docks main, emit/verify the public receipt, and run reviewed promotion against the existing Relay prerelease. | push | Origin main equals the reviewed checkpoint; receipt binds public release/archive/completion evidence; promotion changes prerelease metadata only and reports identical assets with `isPrerelease=false`. |
| 7 | Download/hash all stable Relay assets, compare with prerelease receipt and `SHA256SUMS`, smoke Linux x64 version plus request/reply/result-json, finish/archive this plan, commit/push the archive, and read it back. | release | Stable bytes are identical; smoke passes; PlanRunV1 is finished and the dated archive exists at origin main. |

## Dependencies

- Existing Relay prerelease, public stable release, public finished PlanRun, and exact current-user push/release authority.
- Immutable v4/v5 terminal evidence and source commit `6d794a9d2380ea74c0b67a0b90e8f3825c9d0148`.

## Risks & mitigations

- Supply-chain weakening: PlanRunV1 is an additional closed branch; legacy parsing remains fail-closed.
- Unreviewed recovery bytes: completion review binds cumulative `8afd7e0..implementation`, not only the new parent diff.
- Release mutation: promotion may change prerelease metadata only; tag, commit, assets, and checksums cannot change.
- Cross-repository confusion: clone origin and prove exact commit ancestry/plan bytes instead of trusting the sibling worktree.

## STOP conditions

Review blocks; red misses the observed failure; PlanRun validation cannot fail closed; focused/full checks fail; cumulative review omits `327c0d1`; origin diverges; any public/Relay identity or asset differs; or completion requires force, delete, retag, reupload, rebase, or release recreation.

## Open questions

N/A. Failure, identities, ancestry, releases, and the compatibility boundary are observed.

## Review

Review-result: {"findings":[],"invocation":1,"plan_sha256":"3d224d109d12563ec364dd21ff164f683d43c18b3957854609e95a833d0c0358","run_id":"1adc1590-49ee-42e6-93ab-8062e580d250","schema":1,"source_sha256":"e35c783e7feec7f2031d1bf437f4450f5ea0e938aa784efed841426efbe45f58","verdict":"pass"}

Invocation 1 passed with no findings through the explicit same-model read-only transport.

Completion-review-result: {"diff_sha256":"c4483d757bfcbf54d69d041c9b244721b18ebc2eb2d153f64102ed0b15791bfe","findings":[{"defect":"The new PlanRun binder passes a run whose source_base is fixed to 6d794a9d2380ea74c0b67a0b90e8f3825c9d0148 into currentCompletionEvidence, which computes the reviewed diff from run.source_base. binding.json and plan Steps 3/5 instead require the exact cumulative 8afd7e04c4d3bf7951188b83a47f82147d839cc6..implementation diff, including the pushed publication-recovery delta. SourcePreparationProofV3 therefore cannot bind the sealed CompletionReviewV1 digest: it will either reject that result or attest a different, incomplete range.","fix":"Give the V3 binder an exact review-base input pinned to 8afd7e04c4d3bf7951188b83a47f82147d839cc6, compute both changed paths and the diff SHA-256 over that range, and require equality with the completion-review result before emitting the proof.","id":"completion-diff-base-mismatch","kind":"acceptance","locator":"changes.diff:481-537 (scripts/lib/session-relay-release-preparation.mjs, currentCompletionEvidence/bindPlanRunCompletion)"},{"defect":"bindPlanRunCompletion sets tagCommit equal to the Docks implementation commit and emits it as tag_commit. For this bundle that is d5c62605721e9a2a0733047e7250a0595cf71270, while plan.md pins the existing immutable session-relay--v0.14.0 tag to 7d9cbbbdf82210d396de744372eadb6c26655601. The V3 proof therefore cannot describe the shipped prerelease identity and will either fail downstream tag/workflow-head checks or falsely rebind the release tag to the remediation implementation.","fix":"Resolve the authoritative existing CURRENT_RELEASE_TAG commit, require it to equal 7d9cbbbdf82210d396de744372eadb6c26655601, keep the Docks implementation commit as a separate identity, and model/test the post-tag remediation ancestry without assigning the implementation commit to tag_commit.","id":"immutable-tag-commit-rebound","kind":"public-contract","locator":"changes.diff:537-554 (scripts/lib/session-relay-release-preparation.mjs, bindPlanRunCompletion)"}],"implementation_commit":"d5c62605721e9a2a0733047e7250a0595cf71270","invocation":1,"run_id":"1adc1590-49ee-42e6-93ab-8062e580d250","schema":1,"verdict":"repair"}

Invocation 1 found two release-evidence binding defects; both were accepted for the one permitted repair.

Completion-review-transport-failure: {"error_name":"NoModelSelected","input_sha256":"1e770bb2c0efa56f1444e6b26096dfad068e59a4a7f16b0fe6a975f2e1e50798","invocation":2,"launch_consumed":true,"message":"No model selected.","phase":"completion_review","run_id":"1adc1590-49ee-42e6-93ab-8062e580d250","schema":1,"transport":"task:plan-reviewer","type":"ReviewTransportFailureV1"}

Invocation 2 failed before model execution because the selected plan-reviewer transport reported `No model selected`. The second reservation consumed the final permit; external/release work cannot degrade. A same-input generic retry was cancelled and no retry output was consumed.

## Verification Results

- `node plugins/session-relay/test/release-evidence-contract.mjs`: pass after the completion-review repair.
- `node plugins/session-relay/test/release-publication-contract.mjs`: pass; 75 production-handler cases.
- `node plugins/session-relay/test/release-promotion-contract.mjs`: pass, including the closed V3 immutable-tag-to-source ancestry, PlanRunV1 public-child, mixed-generation receipt, and wrong-tag/backwards-ancestry rejection cases.
- `node scripts/ci.mjs --plugin session-relay`: pass at implementation checkpoint `114432b642fd89497f8e1d1fde0a0c30fdd22f7b`; Rust format/clippy, seven exact inventories, workspace smokes, all release contracts, JavaScript quality, and byte-identical selftest jobs 1/4 passed.
- `node scripts/ci.mjs`: pass at implementation checkpoint `114432b642fd89497f8e1d1fde0a0c30fdd22f7b`; all three plugins and repository-wide guards passed.
- Public release verification receipt SHA-256 `05b08d34e62b58dcbbda214bbcef4cb0658ef6781ca3e696abdfa1b3f43f5091` bound the finished public child, release commit `88ab1911490edad83b387514bb8e899f02338d69`, archive commit `2c914e1aae125f17bd9660f2accca009643ddb2a`, and completion result SHA-256 `8034b252d665e71271e932384318585e14cdc0f3ed9452e911a6136aff5739cb`.
- Promotion receipt SHA-256 `7ffaa7967d9ca8cc7c53c3ca22efe932d3028ad3caf210cec8157aec7bbd1670` and stable finalization receipt SHA-256 `2432a3e601aa93d602b4e0a071ef0609a6a8f4cc9d914cd606dca99eaa6e6ce3` were emitted by the reviewed release entrypoint.
- GitHub release `session-relay--v0.14.0`: observed `isDraft=false`, `isPrerelease=false`; tag and five assets remained unchanged.
- Downloaded `session-relay-x86_64-unknown-linux-musl` SHA-256 `140ea11b700b307c07219616ca6e9b3c4fe552916871af54c3bb15712efd4ee3` matched the staged receipt and reported `session-relay 0.14.0`.
- Downloaded-binary workspace smokes `single-session-compat` and `docs-contract`: pass.
- Local implementation checkpoint `114432b642fd89497f8e1d1fde0a0c30fdd22f7b` contains only the three accepted repair paths; `origin/main` remains at reviewed predecessor `d5c62605721e9a2a0733047e7250a0595cf71270` pending the fresh completion verdict.
