---
title: Complete Session Relay repository-grounded release binding
status: blocked
created: "2026-07-25T23:45:41.205Z"
updated: "2026-07-26T00:05:55.031Z"
started_at: "2026-07-25T23:50:57.277Z"
blocked_reason: "Reviewed affected-path equivalence contradicts the binder repair's own two post-review path changes."
blocked_since: "2026-07-26T00:05:55.031Z"
finished_at: null
assignee: null
tags: [session-relay, release, evidence, remediation]
affected_paths:
  - plugins/session-relay/test/release-evidence-contract.mjs
  - scripts/lib/session-relay-release-preparation.mjs
related_plans:
  - docs/plans/active/session-relay-release-binder-repository-proof.md
  - docs/plans/active/session-relay-correlated-results-release-remediation-v4.md
---

# Complete Session Relay repository-grounded release binding

Plan-run: {"acceptance":null,"blocker":{"evidence_sha256":"3b16adfe548513465f4b305f0f2e3c41daeb40220197cab8be42c667120c0fc8","kind":"verification_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"a9286c444176166acf346a23330e524009a77b7a90527cb6f480017161c5f5af","invocations":1,"result_sha256":"1119bf1afecee5b8cdeb036c774765956d23966ede75a9ba28eeb5fcd9266669","state":"passed"},"execution_parent":"c48a016e27d709703031d157d3c0426aeb93422c","goal_id":"8b89aabf-7336-4352-bc11-225bab67f9aa","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-release-binder-repository-proof-v2.md","plan_sha256":"d934c8d8e69ab2ac79d7a8938177e216411140b272483742ce64825357d07e7d","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"c66b088c-d786-497a-8782-d8d7fd993335","schema":1,"source_base":"c48a016e27d709703031d157d3c0426aeb93422c","source_sha256":"2e857c83b8ca50f67c91947832e9f79865f077ccba16d60d7a790edc538beb25"}

## Goal

Make the real, non-injected Session Relay completion binder reproduce the reviewed raw Git diff and implementation-time affected-path manifest after manager-owned plan-only commits advance repository HEAD, without weakening any passed v4 acceptance, ancestry, blob, path, or review binding.

## Context & rationale

The v4 implementation and invocation-2 CompletionReviewV1 passed. Its first real default `bindCompletion` call then failed with `stale CompletionReviewV1 diff_sha256 binding`: the default evidence adapter trims `git diff` text although review hashes exact binary/full-index bytes. `currentCompletionEvidence` also asks the live-manifest helper to treat the older implementation commit as current HEAD, so the required plan-only review checkpoint prevents binding.

The predecessor plan is terminal because a known unavailable wrapper consumed invocation 1 and the byte-identical retry bundle still bound invocation 1; this fresh run uses the repository-authorized generic read-only fallback on invocation 1. The fix is local author tooling only. The shipped Relay implementation and tag commit remain `7d9cbbbdf82210d396de744372eadb6c26655601`; v4 records remain immutable.

## Steps

| # | Step | Effect | Acceptance |
|---|---|---|---|
| 1 | Review this exact two-path plan through the generic read-only fallback, then create one test-only start checkpoint. | local | Bound PlanReviewV1 passes; no production bytes enter the red checkpoint. |
| 2 | Add release-evidence regressions for exact raw diff bytes and a plan-only HEAD descendant; capture their committed nonzero result. | local | The old adapter trims the reviewed diff and the old live-manifest check rejects the historical implementation source for the expected reasons. |
| 3 | Return raw Git bytes from the default evidence adapter. Require implementation→HEAD ancestry and `git diff --quiet` over the exact affected paths. Snapshot clean current worktree bytes/modes at current HEAD, rebind only manifest source identity/digest to the reviewed implementation commit, and validate the reconstructed manifest without pretending that commit is live HEAD. | local | Raw diff SHA matches CompletionReviewV1; unchanged affected paths reproduce accepted implementation evidence; ancestry, path, mode, byte, or digest drift fails closed. |
| 4 | Run focused evidence/publication/promotion contracts, plugin/full gates, and the real default binder against v4. Checkpoint the two paths plus evidence and run one exact completion review with at most one repair. | local | SourcePreparationProofV2 emits from the clean descendant; every check passes; CompletionReviewV1 binds the cumulative diff. |
| 5 | Finish/archive this local run and return to the separately reviewed v4 external boundary. | local | Finished PlanRunV1 is committed; this run performs no push, tag, release, asset, npm, or public-repository mutation. |

## Risks & mitigations

- Raw evidence: Buffer-returning Git execution preserves exact binary diff framing; scalar consumers decode and trim explicitly.
- Historical manifest: ancestor and exact path-diff preflights precede a live clean snapshot whose entries are rebound to the reviewed implementation identity and canonical digest.
- Scope: only the preparation module, focused contract, and this plan may change.
- Review: one accepted blocker repair only; invocation 2 blocking is terminal.

## STOP conditions

Stop on changed v4 candidate paths, altered v4 records, non-ancestor implementation, affected-path/mode/worktree drift, non-raw diff, failed checks, out-of-scope paths, or any external mutation. Never weaken validation, rewrite history, or infer release authority.

## Open questions

N/A.

## Review

Review-result: {"findings":[],"invocation":1,"plan_sha256":"d934c8d8e69ab2ac79d7a8938177e216411140b272483742ce64825357d07e7d","run_id":"c66b088c-d786-497a-8782-d8d7fd993335","schema":1,"source_sha256":"2e857c83b8ca50f67c91947832e9f79865f077ccba16d60d7a790edc538beb25","verdict":"pass"}

Invocation 1 passed with no findings through the repository-authorized generic read-only fallback; the canonical wrapper was known unavailable before model execution.

## Verification Results

Verification-blocker: {"defect":"The reviewed plan requires all v4 affected paths to remain byte-identical after implementation while the authorized repair itself commits two of those affected paths after immutable v4 implementation commit 7d9cbbbdf82210d396de744372eadb6c26655601.","red_receipt_sha256":"377a0f6fdbca577ef3ef1d33c20b07074f4ef95719a2fc0ec946572944b60c1a","required_repair":"Reconstruct the accepted manifest from the immutable implementation Git tree and allowlist only the bounded binder-repair and plan-lifecycle descendant paths; reject every other post-review path.","type":"verification_failed"}

- Both committed regressions failed for their intended reasons. Implementation exposed that the reviewed equivalence rule makes the real v4 binder impossible because this repair changes two v4 affected paths after the immutable reviewed commit.
