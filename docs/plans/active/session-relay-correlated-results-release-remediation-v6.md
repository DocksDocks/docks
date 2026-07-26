---
title: Finish PlanRun-native Relay promotion
status: ongoing
created: "2026-07-26T02:00:00.000Z"
updated: "2026-07-26T02:05:45.881Z"
started_at: "2026-07-26T02:05:45.881Z"
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

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"2df8eb71edfa0e9c705cf49be6323669be317e73441961e74944899a9fb78670","invocations":1,"result_sha256":"85ef0aded3e015859e6ab8f75e3d79f65f058a03c3d695b079bf1ca588408711","state":"passed"},"execution_parent":"6d794a9d2380ea74c0b67a0b90e8f3825c9d0148","goal_id":"8b89aabf-7336-4352-bc11-225bab67f9aa","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-correlated-results-release-remediation-v6.md","plan_sha256":"3d224d109d12563ec364dd21ff164f683d43c18b3957854609e95a833d0c0358","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"1adc1590-49ee-42e6-93ab-8062e580d250","schema":1,"source_base":"6d794a9d2380ea74c0b67a0b90e8f3825c9d0148","source_sha256":"e35c783e7feec7f2031d1bf437f4450f5ea0e938aa784efed841426efbe45f58"}

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

## Verification Results

Not run.
