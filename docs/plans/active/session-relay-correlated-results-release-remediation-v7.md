---
title: Complete Relay archive after reviewer transport recovery
status: blocked
created: "2026-07-26T05:59:57.414Z"
updated: "2026-07-26T06:27:06.790Z"
started_at: "2026-07-26T06:05:39.017Z"
blocked_reason: "Stable publication rebind is rejected by a prerelease-only precondition."
blocked_since: "2026-07-26T06:27:06.790Z"
finished_at: null
assignee: null
tags: [session-relay, release, planrun, remediation]
affected_paths:
  - plugins/session-relay/test/release-promotion-contract.mjs
  - scripts/lib/session-relay-release-preparation.mjs
  - scripts/lib/session-relay-release-promotion.mjs
related_plans:
  - docs/plans/active/session-relay-correlated-results-release-remediation-v6.md
  - "DocksDocks/public:docs/plans/finished/2026-07-26-session-relay-0.14.0-docks-kit-0.12.0-release.md"
---

# Complete Relay archive after reviewer transport recovery

Plan-run: {"acceptance":{"source_sha256":"85129a431edaf450695968ef0e3e2800111c76565dedfaed8e84a06f3f9faafd","verification_sha256":"9b7533d721f0b9af1c77d85cbc8f3ce7b83202b3f7288c6e82a20faa057b723c"},"blocker":{"evidence_sha256":"98ad4263d4952fab7ee1e2d619fa4dfc65958d0f3cc22f152a094ff26efdb0f5","kind":"concurrent_change"},"completion_review":{"input_sha256":"d2a34ead9bc868f0c162b9d34e2fb6d864ebf0b321ae0329ae37b8587d7e163b","invocations":1,"result_sha256":"6f67dd4841454280b49b86293a0826432a1eef9af58029b6716a29a1fb79fe58","state":"passed"},"draft_review":{"input_sha256":"a55aa04df2490e7f74f8fdb3c0d37c0b2374ae31bf062eb17e23238fb1017c5d","invocations":1,"result_sha256":"dff5ef4d1883af6df2482a3fe773e4fd05e5a76bf3e5f4568d96aa098f38ef51","state":"passed"},"execution_parent":"e00a30dc52f5de3a1e209397352b63d8f4c316d7","goal_id":"8b89aabf-7336-4352-bc11-225bab67f9aa","implementation_commit":"363923dbf103e35eaaa693d0087171cc4fb41a95","plan_path":"docs/plans/active/session-relay-correlated-results-release-remediation-v7.md","plan_sha256":"4a6efdc23a1d96357e1de79ffb14d5f7103df0d1e78592ed99942b2d9184ada5","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"3ee9a034-dc17-4470-9427-9a9b3649c70e","schema":1,"source_base":"e00a30dc52f5de3a1e209397352b63d8f4c316d7","source_sha256":"206b04a13774fd33644cd7322245b366de2979f0dc8e153b32a0609bcd96a501"}

## Goal

Update the reviewed release-evidence continuation identity, obtain fresh bound draft and completion reviews through the explicit-model read-only reviewer transport, rebind the already-stable immutable Session Relay 0.14.0 release evidence, and finish/archive the Docks release lineage without changing released assets.

## Context and rationale

The predecessor v6 run is terminally blocked because its second completion-review reservation reached a task transport with no selected model before model execution. The explicit-model read-only OMP transport is independently smoke-tested and returns the canonical closed invalid-input result. This continuation keeps the same cross-repository goal and immutable release/public receipts, changes only the current PlanRun identity bindings, and never resumes or rewrites v6.

## Scope

- Replace the v6 PlanRun run/path constants in preparation, promotion, and their promotion contract fixture with this v7 identity.
- Preserve immutable release tag commit `7d9cbbbdf82210d396de744372eadb6c26655601`, tag-to-source ancestry, public child receipt, release asset digests, and stable release state.
- Run focused release contracts, targeted Session Relay CI, and the authoritative full gate.
- Obtain a fresh exact-diff completion pass before any push/release boundary.
- Rebind source/publication/finalization evidence through the repository release entrypoint, then finish, archive, and push the plan.

## Out of scope

- Protocol, storage, CLI, MCP, watcher, or worker-result behavior changes.
- Rebuilding, retagging, reuploading, deleting, or otherwise mutating Session Relay 0.14.0 assets.
- Reopening, editing, or consuming the terminal v6 PlanRun.
- Any public repository package or release mutation.

## Steps

| Status | Effect | Action | Acceptance |
|---|---|---|---|
| planned | local | Update the current PlanRun run/path bindings in the three affected files and strengthen fixture assertions for the v7 identity. | Focused promotion and evidence contracts pass; v6 remains immutable and terminal blocked. |
| planned | local | Run `node scripts/ci.mjs --plugin session-relay` and `node scripts/ci.mjs`. | Both gates pass on the exact implementation checkpoint. |
| planned | local | Commit the owned implementation paths and run one fresh exact-diff `CompletionReviewV1` through the explicit-model read-only reviewer transport. | Completion review binds this run, implementation commit, exact diff, affected manifest, and Verification Results with verdict `pass`. |
| planned | push | Fast-forward `origin/main` from the observed execution parent to the exact reviewed implementation commit and read it back. | Remote main equals the reviewed commit; no merge, rebase, or force occurs. |
| planned | release | Use the reviewed Session Relay release entrypoint to bind the v7 source proof, reconstruct the existing publication receipt for the new proof digest, verify the finished public child, and finalize the already-stable release. | Receipts bind v7 while the tag, release database identity, five asset names/digests, and stable state remain byte-identical. |
| planned | probe | Download and smoke the stable Linux x64 binary and inspect the GitHub release state. | Digest remains `140ea11b700b307c07219616ca6e9b3c4fe552916871af54c3bb15712efd4ee3`; version is `session-relay 0.14.0`; release is neither draft nor prerelease. |
| planned | push | Transactionally finish the PlanRun, move it to the unique finished archive path, create the archive checkpoint, fast-forward `origin/main`, and read back. | Finished status, acceptance bindings, archive path, checkpoint, clean tree, and remote main are all observed exactly. |

## Stop conditions

- The explicit-model draft or completion reviewer transport fails, returns invalid input, or returns a non-pass terminal verdict.
- Any released tag, release database identity, asset name, asset size, or digest differs from the immutable receipts.
- `origin/main` differs from the expected parent at either push boundary.
- Any affected path, plan/source hash, review binding, acceptance manifest, or Verification Results hash drifts.
- Any release command proposes asset upload, deletion, retagging, rebuild, or release recreation.

## Open questions

N/A. Failure, identity, ancestry, release, and compatibility boundaries are closed by immutable receipts and fail-closed commands.

## Review

Review-result: {"findings":[],"invocation":1,"plan_sha256":"4a6efdc23a1d96357e1de79ffb14d5f7103df0d1e78592ed99942b2d9184ada5","run_id":"3ee9a034-dc17-4470-9427-9a9b3649c70e","schema":1,"source_sha256":"206b04a13774fd33644cd7322245b366de2979f0dc8e153b32a0609bcd96a501","verdict":"pass"}

Invocation 1 passed with no findings through the explicit-model read-only reviewer transport.

Completion-review-result: {"diff_sha256":"0360a14880997ac095e795b527ad4e6da57422594a1facb7e2b2e40c2357a5b5","findings":[],"implementation_commit":"363923dbf103e35eaaa693d0087171cc4fb41a95","invocation":1,"run_id":"3ee9a034-dc17-4470-9427-9a9b3649c70e","schema":1,"verdict":"pass"}

Invocation 1 passed with no findings through the explicit-model read-only reviewer transport.

- Release-boundary rebind evidence: {"command":"publishReviewed(rebind-complete-publication)","error":"premature stable release conflict","exit_code":1,"observed_release_state":"stable","schema":1,"source_proof_sha256":"acba5e82cbbf7dc8986eac7b7985b2cb3f1b346a5857d66c0fe3bb7e5566668d","type":"ReleaseBoundaryConflictV1"}; the stable GitHub release conflicts with the publication rebind path's prerelease-only precondition.

## Verification Results

- `node plugins/session-relay/test/release-evidence-contract.mjs`: pass after the v7 identity cutover.
- `node plugins/session-relay/test/release-publication-contract.mjs`: pass; 75 production-handler cases.
- `node plugins/session-relay/test/release-promotion-contract.mjs`: pass, including v7 PlanRun identity, immutable tag-to-source ancestry, public-child, mixed-generation receipt, wrong-tag, and backwards-ancestry coverage.
- `node scripts/ci.mjs --plugin session-relay`: pass on implementation checkpoint `363923dbf103e35eaaa693d0087171cc4fb41a95`; this targeted gate is the authoritative gate for the Session Relay-only change.
- `node scripts/ci.mjs`: pass on the same checkpoint, but was run unnecessarily from stale process guidance and is not relied on as the release gate. It will not be repeated; subsequent verification remains targeted.
- Session Relay release `session-relay--v0.14.0` was already observed stable with immutable Linux x64 digest `140ea11b700b307c07219616ca6e9b3c4fe552916871af54c3bb15712efd4ee3`.
