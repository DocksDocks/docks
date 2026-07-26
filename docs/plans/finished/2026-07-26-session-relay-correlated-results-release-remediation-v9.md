---
title: Rebind stable promotion evidence without mutation
status: finished
created: "2026-07-26T20:46:47.887Z"
updated: "2026-07-26T22:56:56.118Z"
started_at: "2026-07-26T20:50:29.701Z"
finished_at: "2026-07-26T22:56:56.118Z"
blocked_reason: null
blocked_since: null
assignee: null
tags: [session-relay, release, planrun, remediation]
affected_paths:
  - plugins/session-relay/test/release-evidence-contract.mjs
  - plugins/session-relay/test/release-promotion-contract.mjs
  - plugins/session-relay/test/release-publication-contract.mjs
  - scripts/lib/session-relay-release-cli.mjs
  - scripts/lib/session-relay-release-preparation.mjs
  - scripts/lib/session-relay-release-promotion.mjs
  - scripts/lib/session-relay-release-publication.mjs
related_plans:
  - docs/plans/finished/2026-07-26-session-relay-correlated-results-release-remediation-v8.md
  - "DocksDocks/public:docs/plans/finished/2026-07-26-session-relay-0.14.0-docks-kit-0.12.0-release.md"
---

# Rebind stable promotion evidence without mutation

Plan-run: {"acceptance":{"source_sha256":"7f2d01284f41430e2edf01c97c73f5010a38f1e26fbea914e9f030e51c7e417c","verification_sha256":"e6304d7abea47c274339297f9ca15aea5a14830a118540e4579ddd11ff1abcdd"},"blocker":null,"completion_review":{"input_sha256":"df9378204656613706a9d691c173458f1095978b4ebcc5dceb05995770d0897b","invocations":2,"result_sha256":"25fe248d5377e206dde7f8a1c1de662c61b9e49ae830fa8c9d7461daf86eadfd","state":"passed"},"draft_review":{"input_sha256":"9c66f71590e627cb2c2c00e1f4bf41eb3bac325ef5fce58e02eae6182af9610f","invocations":1,"result_sha256":"05fb7192d422f5e3b3a45317c70af5c09c5d980768f12b9e91e93397d90bafc2","state":"passed"},"execution_parent":"de4f8305ac9351cbbea4549503f2684f67fbcde9","goal_id":"8b89aabf-7336-4352-bc11-225bab67f9aa","implementation_commit":"c6b1c6eed1244de9d15aac37fe1926b080fb1113","plan_path":"docs/plans/active/session-relay-correlated-results-release-remediation-v9.md","plan_sha256":"885fab172a0d0db08c5701447ccfdfa12119294c8ce671edaaa97d447cdc6c7b","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"5e00cc28-4e27-42cb-9cf9-c3630006d8c0","schema":1,"source_base":"de4f8305ac9351cbbea4549503f2684f67fbcde9","source_sha256":"2b6021d534115ea2e0f4298b5c5022aaa85d665bdd2e2f6d72d4f59edcf55dea"}

## Goal

Repair the bounded source-proof continuation check and add a read-only promotion-evidence rebind so the already-stable immutable Session Relay 0.14.0 release can be bound to this fresh PlanRun, finalized, probed, archived, and pushed without changing the tag, release body, assets, or release state.

## Context and rationale

The predecessor passed both reviews but failed during authorized execution. Its source-proof binder mixed an old review range with unrelated repository history, and stable finalization required a fresh promotion receipt even though the only producer performed the already-completed prerelease-to-stable mutation. This successor uses the current clean checkpoint as its source base, admits only its own plan checkpoint after implementation, and represents reconciliation as a distinct evidence type rather than fabricating another promotion.

## Decisions and invariants

- The successor source and completion ranges begin at its exact start checkpoint. Historical v9 review bases remain evidence only and are never reused as current diff bases.
- The source-proof binder receives an explicit successor continuation set. It permits the current plan path after implementation and rejects every unrelated path; legacy branches retain their frozen compatibility behavior.
- Add release mode `--rebind-promotion-evidence` with adjacent fresh source-proof, publication, public-release, and retained-promotion path/SHA-256 pairs plus an exclusive receipt output.
- Emit closed schema 4 `PromotionEvidenceRebindReceiptV1`. It embeds and hashes the retained successful promotion, binds the fresh proof/publication/public-release receipts, records a current read-only stable snapshot, and records reconciliation time separately from the original promotion time.
- Chronology uses immutable underlying events: publication workflow completion precedes the public child's finished time, which precedes the retained promotion completion. Fresh receipt emission times are observations and never substitute for those events.
- The rebind adapter may read receipts, the live release, and output custody only. Calling promotion, release editing, ref mutation, workflow dispatch, retry, or repair surfaces is forbidden and test-failed.
- Finalization accepts schema 4 only after revalidating the retained promotion, fresh bindings, public child, release database ID, tag commit, workflow run/attempt, stable body, and all asset identities/digests. The existing ordinary promotion and stable rejection paths remain unchanged.

## External authority boundary

Requested effects record intent only. Each non-local boundary requires a live exact authority derived from the current user's explicit successor-repair selection and earlier end-to-end release authorization:

- `push`, mutate: `DocksDocks/docks` `refs/heads/main`, fast-forward only, for the reviewed implementation checkpoint and final archive checkpoint.
- `release`, mutate: `DocksDocks/docks` release `session-relay--v0.14.0`, limited to receipt rebind/finalization. Tag, release body, asset set/bytes, and stable state must remain unchanged.
- `probe`, read: the same release and Linux x64 asset.

If live message bytes, scope, mode, target, ancestry, or immutable release identity differ at a boundary, stop with `missing_authority` or `concurrent_change` as applicable.

## Scope

- Repair successor source-proof binding without broadening historical allowlists.
- Add the closed read-only promotion-evidence rebind mode and schema.
- Teach stable finalization to consume the new evidence while remaining mutation-free.
- Add red/positive contract coverage, run the Session Relay targeted gate, obtain fresh exact-diff completion review, execute the authorized evidence chain and probe, then finish/archive/push.

## Out of scope

- Rebuilding binaries, changing release assets/checksums/body/tag/state, republishing npm, changing the public repository, rewriting terminal predecessor evidence, or widening generic release behavior.

## Steps

| Status | Effect | Action | Acceptance |
|---|---|---|---|
| planned | local | Add red contracts for exact successor continuation and read-only stable promotion-evidence reconciliation. | Binder accepts only the successor plan checkpoint and rejects unrelated paths; rebind tests fail because the mode/schema do not yet exist. |
| planned | local | Thread explicit continuation paths through source-proof reconstruction and bind the successor from its current source base. | SourcePreparationProofV3 binds the fresh run, exact seven-path implementation range, and plan-only post-review checkpoint. |
| planned | local | Implement schema 4 promotion-evidence rebind, closed CLI parsing, retained-promotion validation, immutable chronology checks, and stable finalizer support. | Positive reconciliation emits fresh bound evidence without any promotion/edit/ref/dispatch call; every identity, chronology, custody, and mutation negative fails closed. |
| planned | local | Run focused release contracts and `node scripts/ci.mjs --plugin session-relay`. | All targeted checks pass at the exact implementation checkpoint. |
| planned | local | Commit exactly the seven affected paths and obtain fresh exact-diff CompletionReviewV1. | Review binds this run, implementation, diff, final manifest, and Verification Results with pass and no findings. |
| planned | push | Fast-forward `origin/main` to the reviewed implementation and read back. | Remote main is an exact descendant and equals the reviewed checkpoint without merge, rebase, or force. |
| planned | release | Bind source proof; rebind completed publication and public release; rebind retained promotion evidence; finalize already-stable evidence. | Fresh canonical receipts bind this run and immutable release/public identities; live release identity and bytes are unchanged. |
| planned | probe | Download/checksum/version/smoke Linux x64 and inspect the stable release. | SHA-256 is `140ea11b700b307c07219616ca6e9b3c4fe552916871af54c3bb15712efd4ee3`, version is `session-relay 0.14.0`, selftest/workspace smoke pass, release is stable. |
| planned | push | Finish/archive transaction, commit the archive checkpoint, fast-forward push, and read back. | Unique finished archive, clean tree, local/remote commit equality, and stable release state are observed. |

## Stop conditions

- Draft or completion review is invalid/non-pass, or either permit budget is exhausted.
- Any implementation/review range includes a path outside this plan's exact seven affected paths plus the plan record.
- Rebind evidence cannot prove the immutable original promotion chronology from underlying events.
- Any code path proposes/calls tag, asset, body, release-state, ref, workflow, npm, or public-repository mutation.
- Receipt custody, digests, source/public bindings, live assets, tag ancestry, targeted CI, probe, or remote ancestry differ.

## Open questions

N/A. The receipt type, chronology source, mutation prohibition, scope, authority targets, and failure actions are closed.

## Review

Plan-attempt-history: {"authorization_source_sha256":"c96396613cb29e85bf9a0a7c9bb871450071ae6d6b006551eb7b583e08835702","plan_bytes_sha256":"104a6f8b43b114a94537bad752dfd56b4ca6c2a720411a0036051a0326337348","replacement_run_id":"c74c59cf-bb0f-4457-8833-f4346f3b09c6","run":{"acceptance":{"source_sha256":"57bdadbe0dd7b294d57fd307bd2f9a702504a2757be25be3742db766d5b43ab0","verification_sha256":"4a27e5c053b486ed6d6e73bf7791f8fe0a4bfe60a075fe60d727642522616543"},"blocker":{"evidence_sha256":"bae30b80c7b82e66026b4c23d00a7545ce4f0b750aa7968ec7227ade84740520","kind":"concurrent_change"},"completion_review":{"input_sha256":"1548759c66a208b4b9b251329bf21ef545a1f08cde026f18d1d794b6b90c59d0","invocations":2,"result_sha256":"2f9f792bf40aecb9d1b45d7aa1d45f251a5cb25860484e21f229fc3725cbb6aa","state":"passed"},"draft_review":{"input_sha256":"7c405a59d5682335c3fe30cb2ec70515d0cfb084f2b201d7dd820e1e858a2d09","invocations":1,"result_sha256":"b806e166aa3cb5c27298512c6521835edadb99ec7be2568cc38931ec922a4421","state":"passed"},"execution_parent":"fc6d9c058379eaf4130f3a7dac7acf981306d10d","goal_id":"8b89aabf-7336-4352-bc11-225bab67f9aa","implementation_commit":"f151adbdcf5f6acf8e29b8e3f4c1a4975714d61e","plan_path":"docs/plans/active/session-relay-correlated-results-release-remediation-v9.md","plan_sha256":"e4fb7801e811bf943e8c018cafc6c899f6f182424ff6e18c1e5d2cc633209333","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"e61586f3-78ce-46c2-b324-fa6b753864da","schema":1,"source_base":"fc6d9c058379eaf4130f3a7dac7acf981306d10d","source_sha256":"5c87e951e339b9b388a944aadf93aec5f1731a8bcbefed2289060924c8bc7261"},"schema":1,"status":"blocked","successor_run_sha256":"b58c8740bda816623f1d367e5e9628cf427283353180d7c6d61d11cf18d08ce6"}

Review-transport-failure: {"error_name":"NoModelSelected","input_sha256":"4d6028d6b828c670fd49c7f98e1584c108caca471768e04846d16b79abe817f2","invocation":1,"launch_consumed":true,"message":"No model selected.","phase":"draft_review","run_id":"c74c59cf-bb0f-4457-8833-f4346f3b09c6","schema":1,"transport":"task:plan-reviewer","type":"ReviewTransportFailureV1"}

Invocation 1 failed before model execution. The same bound plan-reviewer candidate was retried once with a fresh invocation-bound input.

Review-transport-failure: {"error_name":"NoModelSelected","input_sha256":"e27cfc44bb55848a661083883ba1ecb2b96143fe5d45d635ace5040e290b01a6","invocation":2,"launch_consumed":true,"message":"No model selected.","phase":"draft_review","run_id":"c74c59cf-bb0f-4457-8833-f4346f3b09c6","schema":1,"transport":"task:plan-reviewer","type":"ReviewTransportFailureV1"}

Invocation 2 failed before model execution and exhausted this run's draft-review permits.

Plan-attempt-history: {"authorization_source_sha256":"c96396613cb29e85bf9a0a7c9bb871450071ae6d6b006551eb7b583e08835702","plan_bytes_sha256":"293d23fdb3610a2ec56ee6492bdb3a474dae2b8c280c314d2af94c98f29dfb4b","replacement_run_id":"5e00cc28-4e27-42cb-9cf9-c3630006d8c0","run":{"acceptance":null,"blocker":{"evidence_sha256":"8eb2e3b0dec31c2b81d01e6502d6519c5782674c3663c16166eff96f36433178","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"e27cfc44bb55848a661083883ba1ecb2b96143fe5d45d635ace5040e290b01a6","invocations":2,"result_sha256":"8eb2e3b0dec31c2b81d01e6502d6519c5782674c3663c16166eff96f36433178","state":"blocked"},"execution_parent":null,"goal_id":"8b89aabf-7336-4352-bc11-225bab67f9aa","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-correlated-results-release-remediation-v9.md","plan_sha256":"90c7f8bbc86ab5f8dc3f8de1e7f3f0d43ddacf439e059777cc1519d150cd77cf","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push","release"],"risk":"external","run_id":"c74c59cf-bb0f-4457-8833-f4346f3b09c6","schema":1,"source_base":"de4f8305ac9351cbbea4549503f2684f67fbcde9","source_sha256":"2b6021d534115ea2e0f4298b5c5022aaa85d665bdd2e2f6d72d4f59edcf55dea"},"schema":1,"status":"blocked","successor_run_sha256":"5c367e8020bc1c67e5afbf39f82805b0a3815a954575f9748cad33fb37c2fd19"}

Review-receipt: {"findings":[],"invocation":1,"plan_sha256":"885fab172a0d0db08c5701447ccfdfa12119294c8ce671edaaa97d447cdc6c7b","run_id":"5e00cc28-4e27-42cb-9cf9-c3630006d8c0","schema":1,"source_sha256":"2b6021d534115ea2e0f4298b5c5022aaa85d665bdd2e2f6d72d4f59edcf55dea","verdict":"pass"}

Invocation 1 passed with no findings through the explicit configured gpt-5.6-sol plan-reviewer transport.

Completion-review-transport-failure: {"error_name":"SchemaViolation","input_sha256":"04d6140cbc1952cf5ef92056861de7ddc5cb347dda8cd07be62f957278d13bc4","invocation":1,"launch_consumed":true,"message":"Reviewer completed the bound analysis but yielded a string instead of CompletionReviewV1.","phase":"completion_review","run_id":"5e00cc28-4e27-42cb-9cf9-c3630006d8c0","schema":1,"transport":"task:reviewer","type":"ReviewTransportFailureV1"}

Invocation 1 completed analysis but failed result-shape validation; one fresh transport retry remains.

Completion-review-result: {"diff_sha256":"44bf1fe95251361544743a9a2546c523f954d711426dbbd692d97aeb5815df0c","findings":[],"implementation_commit":"c6b1c6eed1244de9d15aac37fe1926b080fb1113","invocation":2,"run_id":"5e00cc28-4e27-42cb-9cf9-c3630006d8c0","schema":1,"verdict":"pass"}

Invocation 2 passed with no findings after the one permitted transport retry.

Release-evidence-result: {"completed_at":"2026-07-26T22:56:56.118Z","finalization_transition":"already_stable","implementation_commit":"c6b1c6eed1244de9d15aac37fe1926b080fb1113","outcome":"success","promotion_evidence_rebind_sha256":"d1300237a3864fcdc2c4077f32c00306b4c3a42875f541ec10601650d2a05542","public_release_receipt_sha256":"05b08d34e62b58dcbbda214bbcef4cb0658ef6781ca3e696abdfa1b3f43f5091","publication_receipt_sha256":"54f55781fd42c10928ac5a5a8319b6c0fd8bbdf1b84fea291d0232aed2733373","release_database_id":359891507,"release_tag_commit":"7d9cbbbdf82210d396de744372eadb6c26655601","retained_promotion_receipt_sha256":"7ffaa7967d9ca8cc7c53c3ca22efe932d3028ad3caf210cec8157aec7bbd1670","run_id":"5e00cc28-4e27-42cb-9cf9-c3630006d8c0","schema":1,"source_proof_sha256":"3c66f69475b22a6de12ab14bb3b5881415507030f376491343f88f3978bbdab3","stable_finalization_receipt_sha256":"70eb029d591fbce006a9646da71e8f3e8ad1990175cf1df59e3f61a6825bcf65","type":"SessionRelayEvidenceRebindCompletionV1"}

The reviewed entrypoints rebound the completed stable release without promotion, asset, tag, ref, workflow, or release-state mutation; finalization returned `already_stable`.

## Verification Results

- Red contracts: the final binder, promotion, and publication tests were overlaid on start checkpoint `6cef558`; they failed on the missing fresh PlanRun identity and missing schema-4 exports/adapter as intended.
- Focused green: `node plugins/session-relay/test/release-evidence-contract.mjs`, `release-promotion-contract.mjs`, and `release-publication-contract.mjs` passed after implementation and review repairs.
- Authoritative gate: `node scripts/ci.mjs --plugin session-relay` passed every Session Relay contract, Rust format/clippy/inventory/smoke/selftest check, and JavaScript format/lint check at implementation `c6b1c6eed1244de9d15aac37fe1926b080fb1113`.
- Read-only diff review reported the implementation correct against the active plan. Its use-before-validation, duplicate descriptor/timestamp helper, redundant retained-receipt predicate, and coupled continuation allowlist findings were repaired and the focused contracts rerun.
- The observed release-created-at rule intentionally applies to explicit rebind receipts for every generation, including legacy V1; ordinary publication behavior and immutable historical receipt digests remain unchanged.
