---
title: Repair stable publication evidence rebind
status: blocked
created: "2026-07-26T06:27:22.906Z"
updated: "2026-07-26T06:34:50.060Z"
started_at: null
blocked_reason: "Final draft-review result did not bind the persisted invocation."
blocked_since: "2026-07-26T06:34:50.060Z"
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
  - docs/plans/active/session-relay-correlated-results-release-remediation-v7.md
  - docs/plans/active/session-relay-correlated-results-release-remediation-v6.md
  - "DocksDocks/public:docs/plans/finished/2026-07-26-session-relay-0.14.0-docks-kit-0.12.0-release.md"
---

# Repair stable publication evidence rebind

Plan-run: {"acceptance":null,"blocker":{"evidence_sha256":"150cf076a89756ee5f44a42c6a2845c486a370e799ca57adf59e5d6d6db97020","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"7ccc08b4d21edfe1fcb71f3214a69eac7528c1d5c51665cecab1cf9bd2e7f6c8","invocations":2,"result_sha256":"150cf076a89756ee5f44a42c6a2845c486a370e799ca57adf59e5d6d6db97020","state":"blocked"},"execution_parent":null,"goal_id":"8b89aabf-7336-4352-bc11-225bab67f9aa","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-correlated-results-release-remediation-v8.md","plan_sha256":"af20080710244a6aa0bee8d7dfce47b4b1f2e56d6fabaab2e19d764f80bfcab4","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"7083d948-9ed7-48d3-ada7-7f46b90412ec","schema":1,"source_base":"08e40f57e32be9e9e8fa5ff6ec50415ec83beb74","source_sha256":"0e191f79cfcf4db6e7e84d8f28fd0e5c05331e2a8be6a7f565bfb30132a11cf8"}

## Goal

Permit the explicitly requested completed-publication rebind against an already-stable immutable Session Relay release, bind this continuation identity, regenerate the local evidence chain, and finish/archive the Docks release lineage without mutating released assets.

## Context and rationale

The v7 implementation and completion review passed, but its reviewed release entrypoint stopped at `premature stable release conflict`: `publishReviewed` rejects a stable release before entering its explicit `rebind-complete-publication` branch. This is a local ordering defect. Ordinary publication still must reject premature stable state; only the named completed-publication rebind may observe stable state and reconstruct evidence from the immutable tag, workflow, release, and asset identities.

## Scope

- Move the premature-stable rejection behind the explicit rebind branch while retaining the rejection for ordinary publication and resume modes.
- Add focused production-adapter coverage proving stable rebind succeeds and ordinary stable publication still fails.
- Cut current PlanRun run/path/source/review bindings from v7 to this v8 continuation.
- Run focused release contracts and only the authoritative targeted Session Relay gate.
- Obtain a fresh exact-diff completion pass before push/release actions.
- Rebind source, publication, public-release, and finalization evidence; smoke the unchanged stable binary; finish/archive/push.

## Out of scope

- Any protocol, package, public repository, tag, asset, workflow, or release-state mutation.
- Reopening or editing terminal v6/v7 PlanRuns.
- Full repository CI; the targeted Session Relay gate is authoritative for these Session Relay-owned paths.

## Steps

| Status | Effect | Action | Acceptance |
|---|---|---|---|
| planned | local | Add stable completed-publication rebind coverage, repair the precondition ordering, and update v8 PlanRun identity bindings. | Stable rebind succeeds; ordinary publication against stable still rejects; all release contracts pass. |
| planned | local | Run `node scripts/ci.mjs --plugin session-relay`. | The targeted authoritative gate passes on the exact implementation checkpoint; full CI is not run. |
| planned | local | Commit the five affected paths and run a fresh exact-diff `CompletionReviewV1` through the smoke-tested explicit-model read-only reviewer transport. | Review binds this run, implementation, diff, affected manifest, and Verification Results with verdict `pass`. |
| planned | push | Fast-forward `origin/main` to the reviewed implementation and read back. | Remote main equals the reviewed commit without force, merge, or rebase. |
| planned | release | Run the repository release entrypoint to bind v8 source proof, rebind completed publication, regenerate the public-release observation, and finalize the already-stable release. | Receipts bind v8; tag, release database identity, five asset names/sizes/digests, and stable state remain unchanged. |
| planned | probe | Download and smoke Linux x64, verify its immutable digest, and inspect release state. | Digest is `140ea11b700b307c07219616ca6e9b3c4fe552916871af54c3bb15712efd4ee3`, version is `session-relay 0.14.0`, and release is stable. |
| planned | push | Transactionally finish/archive the plan, commit the archive checkpoint, push, and read back. | Finished PlanRun, archive path, clean tree, local/remote commit, and release observations match exactly. |

## Stop conditions

- Either explicit-model reviewer transport fails or returns invalid/non-pass evidence.
- Stable rebind changes or proposes changing any tag, release, workflow, or asset identity.
- Ordinary publication no longer rejects premature stable state.
- Targeted CI, release contracts, affected manifests, hashes, remote ancestry, or receipt validation fails.

## Open questions

N/A. The failure is reproduced, the repair boundary is explicit, and release identities are immutable.

## Review

Reviewer output was captured, but it bound invocation 1 after the persisted transport retry had consumed invocation 2; the stale result was discarded and the final permit is terminally blocked.

Review-transport-failure: {"error_name":"OutputCaptureTruncated","input_sha256":"7ccc08b4d21edfe1fcb71f3214a69eac7528c1d5c51665cecab1cf9bd2e7f6c8","invocation":1,"message":"The valid reviewer result line exceeded the configured capture width and was not recoverable byte-for-byte.","phase":"draft_review","run_id":"7083d948-9ed7-48d3-ada7-7f46b90412ec","schema":1,"transport":"explicit-model-omp","type":"ReviewTransportFailureV1"}

Invocation 1 result bytes were not recoverable from the output transport; no verdict was consumed.

## Verification Results

Not run.
