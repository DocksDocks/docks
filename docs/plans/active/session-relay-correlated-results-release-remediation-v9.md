---
title: Finish stable publication evidence rebind
status: blocked
created: "2026-07-26T06:35:04.802Z"
updated: "2026-07-26T20:12:41.031Z"
started_at: "2026-07-26T06:40:03.059Z"
finished_at: null
blocked_reason: "Authorized release completion stopped: the v9 binder rejects concurrent out-of-scope history, and stable finalization has no non-mutating promotion-receipt rebind."
blocked_since: "2026-07-26T20:12:41.031Z"
assignee: null
tags: [session-relay, release, planrun, remediation]
affected_paths:
  - plugins/session-relay/test/release-promotion-contract.mjs
  - plugins/session-relay/test/release-publication-contract.mjs
  - scripts/lib/session-relay-release-preparation.mjs
  - scripts/lib/session-relay-release-promotion.mjs
  - scripts/lib/session-relay-release-publication.mjs
related_plans:
  - docs/plans/active/session-relay-correlated-results-release-remediation-v8.md
  - docs/plans/active/session-relay-correlated-results-release-remediation-v7.md
  - "DocksDocks/public:docs/plans/finished/2026-07-26-session-relay-0.14.0-docks-kit-0.12.0-release.md"
---

# Finish stable publication evidence rebind

Plan-run: {"acceptance":{"source_sha256":"57bdadbe0dd7b294d57fd307bd2f9a702504a2757be25be3742db766d5b43ab0","verification_sha256":"4a27e5c053b486ed6d6e73bf7791f8fe0a4bfe60a075fe60d727642522616543"},"blocker":{"evidence_sha256":"bae30b80c7b82e66026b4c23d00a7545ce4f0b750aa7968ec7227ade84740520","kind":"concurrent_change"},"completion_review":{"input_sha256":"1548759c66a208b4b9b251329bf21ef545a1f08cde026f18d1d794b6b90c59d0","invocations":2,"result_sha256":"2f9f792bf40aecb9d1b45d7aa1d45f251a5cb25860484e21f229fc3725cbb6aa","state":"passed"},"draft_review":{"input_sha256":"7c405a59d5682335c3fe30cb2ec70515d0cfb084f2b201d7dd820e1e858a2d09","invocations":1,"result_sha256":"b806e166aa3cb5c27298512c6521835edadb99ec7be2568cc38931ec922a4421","state":"passed"},"execution_parent":"fc6d9c058379eaf4130f3a7dac7acf981306d10d","goal_id":"8b89aabf-7336-4352-bc11-225bab67f9aa","implementation_commit":"f151adbdcf5f6acf8e29b8e3f4c1a4975714d61e","plan_path":"docs/plans/active/session-relay-correlated-results-release-remediation-v9.md","plan_sha256":"e4fb7801e811bf943e8c018cafc6c899f6f182424ff6e18c1e5d2cc633209333","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"e61586f3-78ce-46c2-b324-fa6b753864da","schema":1,"source_base":"fc6d9c058379eaf4130f3a7dac7acf981306d10d","source_sha256":"5c87e951e339b9b388a944aadf93aec5f1731a8bcbefed2289060924c8bc7261"}

## Goal

Repair the explicit completed-publication rebind for an already-stable immutable Session Relay release, bind this continuation, regenerate the local evidence chain, and finish/archive/push the Docks release lineage without mutating released assets.

## Context and rationale

V7 reproduced `premature stable release conflict` before the named rebind branch. V8 was terminally blocked by reviewer-output transport bookkeeping, not by plan content or implementation. This continuation uses first-attempt file capture for reviewer output and keeps the code/release scope unchanged.

## External authority boundary

`requested_effects` records intent only. Before each non-local action, main context must derive a fresh live `ExternalAuthorityV1` from the exact current-user messages that explicitly require uninterrupted completion through final archive/push and authorize use of the release tooling. The authority must match only the instantaneous boundary:

- `push`, mode `write`: `DocksDocks/docks` `refs/heads/main`, fast-forward only, first to the reviewed implementation and later to the archive checkpoint.
- `release`, mode `write`: `DocksDocks/docks` release `session-relay--v0.14.0`, limited to completed-publication evidence rebind and already-stable finalization; asset/tag/release mutation is forbidden.
- `probe`, mode `read`: the same GitHub release and downloaded Linux x64 asset.

If the exact live message bytes, scope, mode, or target do not match at a boundary, stop with `missing_authority`; persisted plan text and old receipts grant no authority.

## Scope

- Move stable-state rejection after the explicit completed-publication rebind branch while preserving rejection for ordinary/resume publication.
- Add focused coverage for stable rebind success and ordinary stable rejection.
- Cut current PlanRun bindings from v7 to v9.
- Run focused contracts and only `node scripts/ci.mjs --plugin session-relay`.
- Obtain fresh bound completion review, then push, rebind/finalize evidence, smoke, finish/archive/push.

## Out of scope

- Protocol, package, public-repository, workflow, tag, asset, or release-state mutation.
- Reopening terminal v6-v8 runs.
- Full repository CI.

## Steps

| Status | Effect | Action | Acceptance |
|---|---|---|---|
| planned | local | Add stable completed-publication rebind coverage, repair the precondition ordering, and update v9 identity bindings. | Rebind succeeds against stable; ordinary publication still rejects; focused release contracts pass. |
| planned | local | Run `node scripts/ci.mjs --plugin session-relay`. | Targeted authoritative gate passes on the exact implementation checkpoint; full CI is not run. |
| planned | local | Commit five affected paths and run exact-diff `CompletionReviewV1` through the explicit-model read-only file-captured transport. | Review binds run, implementation, diff, manifest, and Verification Results with `pass`. |
| planned | push | Require matching live push authority, fast-forward `origin/main` to the reviewed implementation, and read back. | Remote main equals reviewed commit without force, merge, or rebase. |
| planned | release | Require matching live release authority; bind v9 source proof, rebind completed publication, regenerate public-release observation, and finalize already-stable evidence. | Receipts bind v9 and all immutable release identities remain unchanged. |
| planned | probe | Require matching live read authority; download/smoke Linux x64 and inspect release. | SHA-256 `140ea11b700b307c07219616ca6e9b3c4fe552916871af54c3bb15712efd4ee3`, version `session-relay 0.14.0`, stable release. |
| planned | push | Require matching live push authority; finish/archive transaction, archive checkpoint, push, and read back. | Finished archive, clean tree, local/remote commit, and release state observed exactly. |

## Stop conditions

- Required live authority is absent or mismatched at any external boundary.
- Reviewer transport fails or verdict is invalid/non-pass.
- Stable rebind changes/proposes changing release identity, or ordinary stable publication stops rejecting.
- Targeted CI, receipts, hashes, affected scope, or remote ancestry fails.

## Open questions

N/A. Authority is boundary-gated; the implementation failure and immutable release identities are closed.

## Review

Review-receipt: {"findings":[],"invocation":1,"plan_sha256":"e4fb7801e811bf943e8c018cafc6c899f6f182424ff6e18c1e5d2cc633209333","run_id":"e61586f3-78ce-46c2-b324-fa6b753864da","schema":1,"source_sha256":"5c87e951e339b9b388a944aadf93aec5f1731a8bcbefed2289060924c8bc7261","verdict":"pass"}

Invocation 1 passed with no findings.

Completion-review-attempt: {"diff_sha256":"a32d01257ba178b258443ae7d2c1eb209d284d701b4e2abd2ca5024a1d724fd0","findings":[{"defect":"PLANRUN_DOCKS_REVIEW_BASE is set to ecca5af56c5d39fc2319d77d4ad3d8ac4483c243, but binding.json fixes completion.diff's execution_base_commit at ecca5af3024aee3121a368dac68bf5002abb4244. The v9 preparation path therefore binds the completion review to a commit other than the immutable diff base, breaking the required exact review provenance during evidence rebind/finalization.","fix":"Set PLANRUN_DOCKS_REVIEW_BASE to ecca5af3024aee3121a368dac68bf5002abb4244, the execution_base_commit bound to this completion.diff.","id":"review-base-mismatch","kind":"provenance","locator":"scripts/lib/session-relay-release-preparation.mjs:116"}],"implementation_commit":"6a4304cbdf19b7ddb609976838c89188cb2de5ae","invocation":1,"run_id":"e61586f3-78ce-46c2-b324-fa6b753864da","schema":1,"verdict":"repair"}

Completion-review-receipt: {"diff_sha256":"a49a51f42c39b5b60039f81aa58366676faa2ab840e6ef71382571a8d6761555","findings":[],"implementation_commit":"f151adbdcf5f6acf8e29b8e3f4c1a4975714d61e","invocation":2,"run_id":"e61586f3-78ce-46c2-b324-fa6b753864da","schema":1,"verdict":"pass"}

Authority-blocker: {"kind":"missing_authority","required_scopes":["probe","release"],"schema":1,"source_sha256":"22ceaf01c2ff0e9d7601b1a2cbd6bd284fde00d0a352eed8d1fc91c1bee718c0","targets":["DocksDocks/docks release session-relay--v0.14.0 evidence rebind","DocksDocks/docks release session-relay--v0.14.0 Linux x64 asset"]}

Execution-blocker: {"authority_source_sha256":"fbef7f492024f4a99850ec924754e11e1989d618d13748f381d8c1b8ead8affc","binder_failures":[{"error":"current post-review history contains an unauthorized path: docs/plans/active/session-relay-correlated-results-release-completion.md","head":"85afd0b8455362c177c9194345c65d9c41064bb4"},{"error":"current reviewed diff contains out-of-scope affected-path drift: .codex/agents/plan-reviewer.toml","head":"f151adbdcf5f6acf8e29b8e3f4c1a4975714d61e"}],"probe":{"asset":"session-relay-x86_64-unknown-linux-musl","release_state":"stable","selftest":"passed","sha256":"140ea11b700b307c07219616ca6e9b3c4fe552916871af54c3bb15712efd4ee3","version":"session-relay 0.14.0","workspace_smoke":"docs-contract passed"},"promotion_conflict":{"live_release_state":"stable","reason":"No promotion-rebind mode exists; promote-reviewed requires a prerelease snapshot and mutates release state, while v9 forbids release-state mutation.","required_plan_run_id":"e61586f3-78ce-46c2-b324-fa6b753864da","retained_promotion_sha256":"7ffaa7967d9ca8cc7c53c3ca22efe932d3028ad3caf210cec8157aec7bbd1670","retained_source_proof_sha256":"c853e528411b881b2c551fb3b549146679eb76b10e8d8dde55627121a16c98cd"},"schema":1,"type":"PlanRunExecutionBlockerEvidenceV1"}

## Verification Results

- PASS — `node scripts/ci.mjs --plugin session-relay` at `f151adbdcf5f6acf8e29b8e3f4c1a4975714d61e` in an ext4 detached worktree; all checks passed.
