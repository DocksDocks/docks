---
title: Correct the Session Relay correction-plan terminal status contradiction
goal: Preserve a durable successor correction for the immutable Session Relay 0.16.0 terminal-evidence correction plan, bind its false all-steps-done promise to the already observed terminal publication evidence, and validate that exact promise without weakening generic PlanRun validation.
plan_hash_mode: status-excluded-v1
status: ongoing
created: "2026-08-05T00:33:50.874+00:00"
updated: "2026-08-05T01:09:29.098+00:00"
started_at: "2026-08-05T01:09:29.098+00:00"
finished_at: null
assignee: null
tags: [plans, session-relay, evidence-correction, lifecycle]
affected_paths:
  - docs/release-evidence/session-relay-0.16.0-terminal-correction-successor.md
  - scripts/tests/plan-orchestration/session-relay-terminal-correction-successor.mjs
related_plans:
  - docs/plans/finished/2026-08-04-session-relay-0.16.0-terminal-evidence-correction.md
---

# Correct the Session Relay correction-plan terminal status contradiction

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":["v1_contract_contradiction"],"input_sha256":"3e2635567ff4b7169cb73d52377ad66ab68f3cfc63933b751c20ba5ca0b1a43e","invocations":2,"result_sha256":"64c48733c5e514a786e1578d3e78d7e83bccac114468b2fd6f35555a38004123","state":"passed"},"execution_parent":"0f858b307fc5b15062fb68c18f06594557a73a14","goal_id":"4550fa07-cf4a-4fb7-a3c1-e7a011908f70","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-0.16.0-correction-plan-terminal-evidence.md","plan_sha256":"4cc1ef30af8d5b6e36683c80055e4b5b5954eafacbd8f8fc515cd347509215ab","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push"],"risk":"external","run_id":"a8147a98-a154-4e8f-aac0-106250378a19","schema":1,"source_base":"0f858b307fc5b15062fb68c18f06594557a73a14","source_sha256":"80984ac199be36f886aa09eadac2975145b026077c0f5db66cf7020b956cecea"}

## Goal

Record the exact contradiction in the immutable correction-plan archive and bind the terminal evidence that makes its intended Step 5 outcome true. The successor must not edit either predecessor record.

## Why this plan exists

The finished predecessor archive has a passed CompletionReviewV1 and accepted PlanRun, but its `bind_and_publish_correction` row remains `planned`. That row explicitly requires all five statuses to be `done`. Generic PlanRun validity therefore does not prove this plan-specific promise.

## Correction mechanism {mechanism}

Create one closed successor evidence record. It binds the predecessor archive and evidence bytes, the exact promised and recorded Step 5 states, the reviewed correction implementation, the archive publication commit, and a live remote observation. A plan-specific validator must reject any changed predecessor digest, row identity, state, promise, terminal commit, or closed record key set.

The predecessor plan and evidence remain immutable. This plan uses `status-excluded-v1`, so verified progress can mark every row `done` before the terminal archive checkpoint without changing `plan_sha256`. After the local archive checkpoint contains all five `done` rows, terminal lifecycle acceptance uses live ExternalAuthorityV1 to push that exact commit and read back remote main. The push and readback are acceptance effects, not a Steps-row done condition.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | inspect_predecessor | Bind the immutable predecessor contradiction and prior evidence. | `docs/release-evidence/session-relay-0.16.0-terminal-correction-successor.md` | - | `local` | `planned` | Exact bytes show archive SHA-256 `5616f8060401f17bf150108ad9d00fae7eb109602d5f46dc3ffb4a790701a30d`, run `b0cd4072-9703-4b98-9e5f-2f1cba6ac5d2`, completion result `415187f5332880e6482306ad8ca261a90fe7c7e90d540fc55599caccb127af4f`, predecessor row Id `bind_and_publish_correction`, recorded status `planned`, and the explicit promise that all five statuses are `done`; any mismatch blocks. |
| 2 | write_successor_record | Write the closed successor correction record and bounded validator. | `docs/release-evidence/session-relay-0.16.0-terminal-correction-successor.md`, `scripts/tests/plan-orchestration/session-relay-terminal-correction-successor.mjs` | inspect_predecessor | `local` | `planned` | One `SessionRelayTerminalEvidenceCorrectionSuccessorV1` object binds the predecessor plan, predecessor evidence SHA-256 `e0c9363e06d434250c398e5b8987e943f2ed11c04bb525a7236f67173a13f775`, reviewed implementation `98ea3821689bdfb04c919023cccac9401ff61c63`, archive publication commit `ef625042b7db018cb60def998a31b165b08b87ef`, and the exact contradiction. |
| 3 | validate_successor_record | Run the plan-specific closed-record validator. | `docs/release-evidence/session-relay-0.16.0-terminal-correction-successor.md`, `scripts/tests/plan-orchestration/session-relay-terminal-correction-successor.mjs` | write_successor_record | `local` | `planned` | The validator reparses both immutable predecessors and the successor, rejects extra or missing keys, proves the exact `bind_and_publish_correction` promise fails in the predecessor, and proves the successor binds the terminal evidence. A negative mutation of the recorded status or promise must fail. |
| 4 | reobserve_predecessor_remote | Re-observe the prior correction publication without mutation. | `docs/release-evidence/session-relay-0.16.0-terminal-correction-successor.md` | validate_successor_record | `probe` | `planned` | With live probe authority, remote main contains commit `ef625042b7db018cb60def998a31b165b08b87ef`, serves both immutable predecessor paths at their bound digests, and omits the old active predecessor path; any mismatch blocks before completion review. |
| 5 | review_archive_publish | Bind completion review and prepare the terminal archive checkpoint. | all affected paths in frontmatter | reobserve_predecessor_remote | `local` | `planned` | CompletionReviewV1 passes on the exact implementation checkpoint, all implementation and verification evidence is bound, and the row becomes `done` before the local archive commit. |

## Acceptance criteria

1. The two immutable predecessor files remain byte-identical.
2. The successor record is closed, canonical, and bound to exact predecessor and terminal identities.
3. A plan-specific positive check passes and negative status or promise mutations fail.
4. The live read-only rehearsal completes before completion review.
5. CompletionReviewV1 passes on the exact implementation checkpoint.
6. The archived successor has five `done` rows before the authorized push.
7. Remote main reads back the exact terminal checkpoint without any release, tag, asset, or package mutation.

## Verification commands

1. Run `node scripts/tests/plan-orchestration/session-relay-terminal-correction-successor.mjs --mode=positive`.
2. Run `node scripts/tests/plan-orchestration/session-relay-terminal-correction-successor.mjs --mode=status-mutation`.
3. Run `node scripts/tests/plan-orchestration/session-relay-terminal-correction-successor.mjs --mode=promise-mutation`.
4. Run `git diff --check`.
5. Run `node plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs check docs/plans/active/session-relay-0.16.0-correction-plan-terminal-evidence.md`.
6. Before completion review, use an authorized read-only remote check for the predecessor archive commit and exact bytes.
7. After the authorized push, require `refs/heads/main` to equal the terminal checkpoint.

## Protected scope

- Do not edit `docs/plans/finished/2026-08-04-session-relay-0.16.0-terminal-evidence-correction.md`.
- Do not edit `docs/release-evidence/session-relay-0.16.0-terminal-correction.md`.
- Do not change PlanRunV1, CompletionReviewV1, ExternalAuthorityV1, or release receipt schemas.
- Do not create or mutate a release, tag, asset, package, or preflight ref.

## Stop conditions

1. Either predecessor digest differs.
2. The recorded Step 5 row or promise differs from the bound contradiction.
3. The terminal publication commit is not an ancestor of remote main.
4. The plan-specific validator can pass after status or promise mutation.
5. Completion review reports a reproducible defect.
6. Live probe or push authority is absent at its exact boundary.
7. Any action would change an immutable predecessor or a release object.

## Review

N/A — manager-written after draft and completion review.

Plan-attempt-history: {"authorization_source_sha256":"8f8550c24403f68175a0310de0eda441775e1bb2df0bf288657e9981866efd20","plan_bytes_sha256":"9fe085479c527b8499f633e044a34f8777422fde28632abfed5602fb126d5365","replacement_run_id":"a8147a98-a154-4e8f-aac0-106250378a19","run":{"acceptance":null,"blocker":{"evidence_sha256":"6b67045f1417773a0031987aae354f3a45ffd73ab72e9684c70234a17f68e605","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":["v1_acceptance_command_not_runnable","v1_affected_paths_incomplete"],"input_sha256":"3d3ccf99802571521b8da62a9295fc668bd8b8fed207c48e5d2d14ed77b25fa3","invocations":3,"result_sha256":"6b67045f1417773a0031987aae354f3a45ffd73ab72e9684c70234a17f68e605","state":"blocked"},"execution_parent":null,"goal_id":"4550fa07-cf4a-4fb7-a3c1-e7a011908f70","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-0.16.0-correction-plan-terminal-evidence.md","plan_sha256":"6766dc5d440a7d0059be59e3896a4d0f057216addab8ef4c0ad278aef2b79c84","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push"],"risk":"external","run_id":"91c9960e-cc7d-4b51-ba81-e8ea079d60df","schema":1,"source_base":"0f858b307fc5b15062fb68c18f06594557a73a14","source_sha256":"80984ac199be36f886aa09eadac2975145b026077c0f5db66cf7020b956cecea"},"schema":1,"status":"blocked","successor_run_sha256":"b662a1300423cdb53172f87393e23afb5e50236311243166603028ec35a24e94"}

Plan-review-result: {"findings":[{"class":"v1_contract_contradiction","defect":"The review_archive_publish row cannot truthfully be done before push because its completion requires the push and remote readback, while acceptance requires all five rows done before that push. This recreates the terminal-status contradiction.","fix":"Limit the final row to review and local archive preparation that completes before push. Keep the authorized push and remote readback as terminal lifecycle acceptance after all row statuses are done.","id":"F1","kind":"contradiction","locator":"plan.md:35,45,54-55"}],"invocation":1,"plan_sha256":"6766dc5d440a7d0059be59e3896a4d0f057216addab8ef4c0ad278aef2b79c84","run_id":"a8147a98-a154-4e8f-aac0-106250378a19","schema":1,"source_sha256":"80984ac199be36f886aa09eadac2975145b026077c0f5db66cf7020b956cecea","verdict":"repair"}

## Verification Results

N/A — manager-written after execution.
