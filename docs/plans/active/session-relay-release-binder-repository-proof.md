---
title: Repair Session Relay repository-grounded release binding
status: blocked
created: "2026-07-25T23:40:13.961Z"
updated: "2026-07-25T23:44:50.931Z"
started_at: null
blocked_reason: "Draft-review retry input was invalid: the immutable bundle binds invocation 1 while the reserved retry binds invocation 2."
blocked_since: "2026-07-25T23:44:50.931Z"
finished_at: null
assignee: null
tags: [session-relay, release, evidence, remediation]
affected_paths:
  - plugins/session-relay/test/release-evidence-contract.mjs
  - scripts/lib/session-relay-release-preparation.mjs
related_plans:
  - docs/plans/active/session-relay-correlated-results-release-remediation-v4.md
---

# Repair Session Relay repository-grounded release binding

Plan-run: {"acceptance":null,"blocker":{"evidence_sha256":"6b67045f1417773a0031987aae354f3a45ffd73ab72e9684c70234a17f68e605","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"695a0756bd7454d16aa61c50f178f82d7cedd6155bddc8ac9fa565de493a9785","invocations":2,"result_sha256":"6b67045f1417773a0031987aae354f3a45ffd73ab72e9684c70234a17f68e605","state":"blocked"},"execution_parent":null,"goal_id":"8b89aabf-7336-4352-bc11-225bab67f9aa","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-release-binder-repository-proof.md","plan_sha256":"a870a9478ae2bf648c4fbe605f49078d3fcbb361c0f70a43258709e7efff15e2","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"456205d7-f0f5-4540-a719-c7935092333e","schema":1,"source_base":"e1c62d35849c9b534a6c283745190db8038cd38c","source_sha256":"cc6035e3e4a441896a2d4dbe8e62d829f3db2ba470be3ecfe4f95888c752fa0a"}

## Goal

Make the real, non-injected Session Relay completion binder reproduce the reviewed raw Git diff and the implementation-time affected-path manifest after manager-owned plan-only commits advance repository HEAD, without weakening any v4 acceptance, ancestry, blob, path, or review binding.

## Context & rationale

The reviewed v4 candidate and its invocation-2 CompletionReviewV1 passed. The first real default `bindCompletion` call then failed with `stale CompletionReviewV1 diff_sha256 binding`: the default evidence adapter trims `git diff` into text while the review hashes exact binary/full-index bytes. A second latent problem is that `currentCompletionEvidence` asks the live-manifest helper to use the older implementation commit as if it were current HEAD, so any required plan-only lifecycle checkpoint makes binding impossible.

The fix is author tooling only. The shipped Relay implementation and reviewed tag commit remain `7d9cbbbdf82210d396de744372eadb6c26655601`. This run must preserve that v4 plan, receipt, acceptance, and review verbatim.

## Steps

| # | Step | Effect | Acceptance |
|---|---|---|---|
| 1 | Review this two-path plan and create one test-only start checkpoint. | local | Bound PlanReviewV1 passes; no production bytes enter the red checkpoint. |
| 2 | Add focused release-evidence regressions for exact raw diff bytes and plan-only HEAD descendants, then capture their committed nonzero result. | local | The default adapter trims the reviewed diff and the live-manifest source-base check rejects the older implementation commit for the expected reasons. |
| 3 | Make the default evidence adapter return raw Git bytes; require implementation→current-HEAD ancestry and an exact affected-path Git diff; snapshot current worktree bytes at current HEAD, then rebind only the manifest source identity/digest to the reviewed implementation commit and validate it without treating that commit as live HEAD. | local | Exact raw diff SHA matches CompletionReviewV1; unchanged affected bytes/modes reproduce the accepted implementation manifest; any affected-path drift, non-ancestor, dirty affected file, mode change, or digest mismatch fails closed. |
| 4 | Run the focused release evidence, publication, promotion, plugin, and full repository gates; call the real default binder against v4; checkpoint only the two affected paths plus plan evidence; run one exact completion review with at most one repair. | local | A canonical SourcePreparationProofV2 is emitted from the clean repository descendant, every gate passes, and CompletionReviewV1 binds the exact cumulative diff. |
| 5 | Finish and archive this local repair, then return control to the separately reviewed v4 external release boundary. | local | Finished PlanRunV1 is committed; no push, tag, release, asset, npm, or public-repository mutation occurs in this run. |

## Risks & mitigations

- Diff evidence corruption: use Buffer-returning Git execution for every evidence command; text consumers explicitly decode and trim only scalar outputs.
- Historical-manifest forgery: require the reviewed implementation commit to be an ancestor of current HEAD, require `git diff --quiet` over the exact affected path set, and derive path bytes/modes from the clean current worktree before rebinding the manifest source identity.
- Scope drift: only the preparation module, focused release-evidence contract, and this lifecycle plan may change.
- Review exhaustion: one accepted blocker repair is the only permitted implementation replacement; invocation 2 blocking is terminal.

## STOP conditions

Stop on any changed v4 candidate path, altered v4 plan/review/receipt, non-ancestor implementation commit, affected-path or mode drift, non-raw diff hash, test/gate failure, out-of-scope path, or external mutation. Never weaken validation, rewrite reviewed history, or infer release authority from this local repair.

## Open questions

N/A. The two failures were observed through the real default binder after v4 completion review, and the required immutable identities are fixed above.

## Review

Review-invalid-input: {"error":"invalid_input","reason":"bundle_binding_mismatch","schema":1}

## Verification Results

Not run. Manager will record red receipt, exact commands, hashes, implementation commit, and completion review evidence here.
