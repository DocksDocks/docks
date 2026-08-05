---
title: Promote the plan execution queue into the workspace contract
goal: Promote the temporary plan-order index into optional validated PlanQueueV1 support with explicit dependency gates and no lifecycle or execution authority.
plan_hash_mode: status-excluded-v1
status: ongoing
created: "2026-08-05T04:13:23.006Z"
updated: "2026-08-05T18:56:20.751Z"
started_at: "2026-08-05T18:56:20.751Z"
finished_at: null
assignee: null
tags: [plans, queue, plan-lifecycle, routing]
affected_paths:
  - AGENTS.md
  - docs/plans/AGENTS.md
  - docs/plans/QUEUE.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/references/planqueuev1-schema.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-queue.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md
  - plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md
  - plugins/plan-lifecycle/test/selftest.mjs
  - scripts/AGENTS.md
  - scripts/ci.mjs
  - scripts/config/test-contracts.json
  - scripts/tests/plan-queue.mjs
  - scripts/tests/plan-skill-phases.mjs
  - scripts/tests/test-contracts.mjs
related_plans:
  - docs/plans/finished/2026-08-05-ci-observability-and-test-contracts.md
  - docs/plans/active/session-relay-typed-irc-sqlite.md
  - docs/plans/active/plan-lifecycle-review-and-authority-modules.md
  - docs/plans/active/session-relay-post-cutover-modules.md
  - docs/plans/active/plan-lifecycle-review-dispatch-performance.md
  - docs/plans/active/plan-lifecycle-derived-history-navigation.md
---

# Promote the plan execution queue into the workspace contract

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"32305d2086dba70ecf63fd84c50716d5f05a9ae426cdd631596c6d46e6ebf2b4","invocations":1,"result_sha256":"9357e96a98fa7e75eee921c736c6862d39bb6763c949a6a426aa01dcd1752a19","state":"passed"},"execution_parent":"5c7148fad7dd12b6b620239e888f8a23fe5fe348","goal_id":"ba268ab2-a4d9-4b05-8041-d44188dadef5","implementation_commit":null,"plan_path":"docs/plans/active/plan-execution-queue-contract.md","plan_sha256":"db4b2c49c1db717761a4f7483e5aec837f112ab1f1442bb83f2b9cd63bcb2162","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"e5064d43-b9bd-40d5-a48f-3b180e21508f","schema":1,"source_base":"5c7148fad7dd12b6b620239e888f8a23fe5fe348","source_sha256":"0e93b788b9d79076417f5bb513a6691c7b8affe2d198ce25fe4433f61d82839b"}

## Goal

Replace the explicitly temporary custom queue with optional first-class PlanQueueV1 support that validates stable goal identities, explicit dependencies, priority stages, and next-plan selection while preserving PlanRunV1 and current user intent as the only execution authority.

## Context & rationale

The temporary queue now records seven plans: CI observability first; PlanQueueV1 after CI; Session Relay SQLite vNext and Plan Lifecycle authority modules after PlanQueueV1; Relay cleanup depends only on Relay vNext; review-dispatch performance depends on CI plus Plan Lifecycle authority; history navigation depends on the authority, review-performance, and queued PlanQueueV1 contracts. The prior successor fixed an unsafe lowest-stage rule with a global stage barrier. A later advisory showed that barrier overconstrained the requested graph by coupling Relay cleanup to unrelated Plan Lifecycle work. This successor preserves every valid row present at conversion and uses explicit dependencies for readiness while stages provide deterministic priority among otherwise eligible rows.

## Environment & how-to-run

Run from the repository root with Node 24. Preserve every byte of every other planned PlanRun. Keep workspaces without QUEUE.md valid; bootstrap may seed an empty queue, and an explicit user request may add one. Update changed skill metadata and content hashes through the repository authoring workflow. Treat the queue as a discovery and prioritization view only.

## Queue contract {mechanism}

Docs/plans/QUEUE.md carries exactly one Plan-queue: PlanQueueV1 marker and one Stage | Goal ID | Plan | Depends on | Why table. goal_id is the stable row identity; Plan is a human label; the validator resolves the current repository-relative path by scanning active and finished PlanRun records. Stages are positive integers, goal ids are unique UUIDs, dependencies name queued goal ids at lower stages, reasons are nonempty, and same-stage rows may run in parallel. The queue is an explicit subset, so unrelated plan creation does not invalidate it.

next resolves every explicit dependency to a finished PlanRun before it considers a row eligible. Among eligible planned or scheduled rows, it returns the lowest stage and preserves table order within that stage. A non-finished row does not block an independent higher-stage row. An ongoing or blocked dependency makes only its transitive dependents ineligible and produces a dependency report. Removing a referenced row or moving it to an invalid stage fails validation; every queue mutation requires explicit current-user intent, and lifecycle state never changes implicitly.

Read-only check, show, and next operations reject malformed rows, duplicate or missing goals, ambiguous active/finished identities, invalid PlanRun records, same-or-later-stage dependencies, cycles, stale labels, dangling dependencies, and dependency state that contradicts resolved PlanRun status. Manager-owned add, move, and remove setters use an exact preimage, one exclusive queue lock, full-successor validation, fsync, atomic rename, and readback. Setters change only queue bytes and never dispatch work, reserve review, transition plans, schedule time, or grant effects.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | define_queue_schema | Define stable-goal PlanQueueV1 with explicit dependency gates and implement read-only check, show, and next operations. | `plugins/plan-lifecycle/skills/productivity/plan-manager/references/planqueuev1-schema.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-queue.mjs` | — | `local` | `planned` | Schema, goal lookup, subset semantics, graph checks, archive resolution, dependency-closure checks, and deterministic eligible-row selection are executable; unrelated non-finished rows do not block a valid candidate. |
| 2 | add_queue_setters | Add manager-owned add, move, and remove transactions with exact preimage, exclusive lock, full-successor validation, fsync, atomic rename, and readback. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-queue.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/references/planqueuev1-schema.md` | 1 | `local` | `planned` | Concurrent or stale updates fail before write; setters require explicit prioritization authority, mutate only queue bytes, and cannot transition any PlanRun. |
| 3 | promote_current_queue | Convert every valid row in the temporary queue into PlanQueueV1 without assuming a fixed row count. | `docs/plans/QUEUE.md` | 1, 2 | `local` | `planned` | All seven current plans, including the queue-contract goal, retain their explicit dependency graph, dedicated queue-contract stage, parallel plugin stage, downstream priority stages, start-gate meaning, and stable goal ids; later explicit rows also survive a stale implementation preimage check rather than being dropped. |
| 4 | integrate_workspace | Teach plan-workspace and its generated contract to recognize, bootstrap, audit, and explicitly add the optional queue without changing plan bytes. | `docs/plans/AGENTS.md`; `plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md`; `plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md` | 1, 2, 3 | `local` | `planned` | Existing no-queue workspaces remain current; bootstrap may seed an empty valid queue; audit validates a present queue and never rewrites it implicitly. |
| 5 | integrate_manager | Teach plan-manager and root routing to own explicit queue setters and consult a valid queue for dependency-aware list and next selection. | `AGENTS.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md` | 1, 2, 4 | `local` | `planned` | The manager records explicit priority through lock/CAS setters, proposes the lowest-stage entry whose complete dependency closure is finished, resolves archive moves by goal id, reports blocked dependencies, and never treats queue state as authority. |
| 6 | close_queue_contracts | Add parser, setter, concurrency, archive, compatibility, dependency, dynamic-row, workspace-copy, and authority fixtures. | `plugins/plan-lifecycle/test/selftest.mjs`; `scripts/AGENTS.md`; `scripts/tests/plan-queue.mjs`; `scripts/tests/plan-skill-phases.mjs`; `scripts/ci.mjs`; `scripts/config/test-contracts.json`; `scripts/tests/test-contracts.mjs` | 1, 2, 3, 4, 5 | `local` | `planned` | Tests cover no-queue compatibility, empty bootstrap, subset growth, active-to-finished resolution, CAS setters, stale preimages, same-stage parallelism, blocked dependency closure, independent higher-stage eligibility, the queued queue-contract prerequisite and dedicated stage, malformed graphs, and no queue-derived authority. Both new queue contracts run inside the existing gate composition, and the test-contract registry records them so discovered, registered, and selected stay equal. |
| 7 | verify_public_cutover | Run focused queue contracts, plan-lifecycle self-test, selected plugin gate, and full shared gate against final bytes. | all affected paths in frontmatter | 6 | `local` | `planned` | Every acceptance command passes; all other active plan digests match their inventory; plugin and repository-wide gates stay green. |

## Acceptance criteria

| ID | Command | Expected result |
|---|---|---|
| A1 | `node scripts/tests/plan-queue.mjs` | Exit 0; parsing, deterministic priority, explicit dependency closure, the queued queue-contract prerequisite and dedicated stage, independent higher-stage eligibility, compatibility, stale-data, dynamic-row, and next-selection cases pass. |
| A2 | `node scripts/tests/plan-skill-phases.mjs --case plan-queue` | Exit 0; workspace, manager, template, root-routing, and queue contract copies remain synchronized. |
| A3 | `node plugins/plan-lifecycle/test/selftest.mjs` | Exit 0; the shipped plugin includes valid queue support without unsupported agents or altered PlanRun authority. |
| A4 | `node scripts/ci.mjs --plugin plan-lifecycle` | Exit 0; plan-lifecycle authoring, skills, agents, scripts, self-test, manifests, and queue contracts pass. |
| A5 | `node scripts/ci.mjs` | Exit 0; all plugin and repository-wide workflow, tooling, format, lint, and plan contracts pass. |

## Out of scope / do-NOT-touch

- Do not edit any other planned PlanRun file.
- Do not make queue data lifecycle, review, mutation, scheduling, or external-effect authority.
- Do not auto-start work or add a background queue runner.
- Do not make QUEUE.md mandatory for existing consumer workspaces.
- Do not copy OptMem code, install it, or add it as a dependency without explicit licensing permission.
- Do not store lossy summaries as Relay, PlanRun, review, CI, or acceptance authority.
- Do not implement the queued CI, Relay, Plan Lifecycle, review-performance, history-navigation, or cleanup plans here.

## STOP conditions

1. Any other active plan digest changes.
2. A row becomes eligible while any explicit direct or transitive dependency is not finished.
3. A queue operation can mutate a plan or authorize start, review, scheduling, or an external effect.
4. A workspace without a queue becomes invalid or requires implicit refresh.
5. Plan creation or archive invalidates an unchanged queued goal, or ambiguous goal resolution is accepted.
6. Conversion drops a valid row added after this plan was drafted instead of failing on the stale preimage.
7. A setter lacks exact preimage, exclusive locking, full-successor validation, fsync, atomic rename, or readback.
8. The selected plugin gate or full repository gate fails, or a new queue contract is added without a matching registry row so the discovered and registered suite sets diverge.

## Open questions

None. Earlier predecessors fixed path coverage, unsafe stage selection, a global barrier, and a missing queue-contract row. This successor gives that goal a dedicated stage before the two plugin branches, so the stated order is enforceable by explicit dependencies. It also owns the gate wiring, the suite registry, and the discovery selector, because the test-contract registry introduced by the CI observability plan derives its discovered set from the gate source.

## Review

Plan-attempt-history: {"authorization_source_sha256":"48860f766cbf9dde19f6c5ff82285858054b44f55284198f17755323c685e3ae","plan_bytes_sha256":"175598c1576e88a0a0e96d81dbfa1daab1f8ea82e070a8abfe87960d836e21db","replacement_run_id":"9f5efad5-0a79-48a4-be86-5eb61d150309","run":{"acceptance":null,"blocker":{"evidence_sha256":"d7cdaf9a541cd3c6502358ac376d555d415af316cb7fefeb9fe71b08b56ad2ca","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"e5e7119572b4dbed292c7919f065ef017529596dee4edf070c1515fca25e55bb","invocations":1,"result_sha256":"f82ea88c831616ff9dc7d1734cfc28fd3a65caa5844a465804d6f40f11653146","state":"passed"},"execution_parent":null,"goal_id":"ba268ab2-a4d9-4b05-8041-d44188dadef5","implementation_commit":null,"plan_path":"docs/plans/active/plan-execution-queue-contract.md","plan_sha256":"56221e04e289c5f789ef2ba422524701987cfeca150010d12b33b6d6367af2a9","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"8e73f457-7c26-45da-b93d-0f4cfa959505","schema":1,"source_base":"6c9ce4128cc26780b3fb998533b562fd958808f1","source_sha256":"37bba8189f3157aca1cfe07290e0fa6b65a7428ceeb23382da8e357f8cafdbb8"},"schema":1,"status":"blocked","successor_run_sha256":"5163f6b1b84a9060b243914dd6d055561d514f09e3706a2c79c9b115acf774a5"}

Plan-attempt-history: {"authorization_source_sha256":"13ff4bea26bef2d136234ca41fdefec4b4e9f533edbf1e78e0598c2012dc8cd9","plan_bytes_sha256":"539daa49f660910136f9446d5f6c9ae634bc4cf4fd1dbfafa5964762ecd1ba5a","replacement_run_id":"d6e11e98-5ab8-413e-adab-ab892154edea","run":{"acceptance":null,"blocker":{"evidence_sha256":"64f4de09382c038b09da42dbf7267daa91b61c88a99c1affb5e0534eb4194bce","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"2d40e9cf0a783c1b430ee7e7fd0103bdbd08c8e8b8911b2adb1f852e8e5de30a","invocations":1,"result_sha256":"e98b44fa110964a44adb96bdde40df96c659fa3f7dd26996de6e0d90aa142a0b","state":"passed"},"execution_parent":null,"goal_id":"ba268ab2-a4d9-4b05-8041-d44188dadef5","implementation_commit":null,"plan_path":"docs/plans/active/plan-execution-queue-contract.md","plan_sha256":"08decb76958376de7b82a423e8ac3610741d12123fd76394f99d775b677d4234","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"9f5efad5-0a79-48a4-be86-5eb61d150309","schema":1,"source_base":"6c9ce4128cc26780b3fb998533b562fd958808f1","source_sha256":"37bba8189f3157aca1cfe07290e0fa6b65a7428ceeb23382da8e357f8cafdbb8"},"schema":1,"status":"blocked","successor_run_sha256":"426af104bce6d4da59e894bac3206175b6bb0efb65ac66d392788d85387bf822"}

Plan-attempt-history: {"authorization_source_sha256":"13ff4bea26bef2d136234ca41fdefec4b4e9f533edbf1e78e0598c2012dc8cd9","plan_bytes_sha256":"9261b43ca6115c6bf003328366e38b173dabf2c0e969ad223caab0de867d551f","replacement_run_id":"50120d94-7013-43d5-94e3-9579a57b2c08","run":{"acceptance":null,"blocker":{"evidence_sha256":"f7355bc96a4a0a9df607d9daa147555b5a8c43554d1a8c66b306ba610dd248b1","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"0157ff5c50c9dd587ced96e93086a67a84ed3d625701f3edb90d3f1cc26abd3d","invocations":1,"result_sha256":"0e29b0e4cd40063e18e76f277bb03362151194d2bb88885aeeffbebe0be17b67","state":"passed"},"execution_parent":null,"goal_id":"ba268ab2-a4d9-4b05-8041-d44188dadef5","implementation_commit":null,"plan_path":"docs/plans/active/plan-execution-queue-contract.md","plan_sha256":"8dbf9b2c97ed0eff9a596886841753d5c586c4d779871fe9424818c4d5058e4d","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"d6e11e98-5ab8-413e-adab-ab892154edea","schema":1,"source_base":"f49c2852cb60e7741a354ef5c610486345b1796f","source_sha256":"af6de67845dd0fe8fffd545aad753316914546a548b54af111c86d0396d3a420"},"schema":1,"status":"blocked","successor_run_sha256":"347585bd878ba8fa59bf51bf50dfdfcd38894e6da2352842be2ded0ec66586ce"}

Plan-attempt-history: {"authorization_source_sha256":"13ff4bea26bef2d136234ca41fdefec4b4e9f533edbf1e78e0598c2012dc8cd9","plan_bytes_sha256":"bb4536e40bf0d22213a8b9cb041659ba845a187031ae4e798e2b6cda18506d7a","replacement_run_id":"86211dd3-80b8-4b84-9d0f-8c3122e8742d","run":{"acceptance":null,"blocker":{"evidence_sha256":"0759e2cbdb507802c804ee732cae945e9226c50ca8c9114b0196fc2cfac20f2f","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"39e2657e95dbb65babd05bcee1853ecd9f8ad865522a1c15fa91b119d2bedc57","invocations":1,"result_sha256":"1ac8ac221b9091f07928eb56bbb15df4ca5fc6ac561c9db78840465bab77ae0e","state":"passed"},"execution_parent":null,"goal_id":"ba268ab2-a4d9-4b05-8041-d44188dadef5","implementation_commit":null,"plan_path":"docs/plans/active/plan-execution-queue-contract.md","plan_sha256":"15398a655e21c912ac2c6b9e85f113da78ca57cdfdc20b8aee47e64d5f659010","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"50120d94-7013-43d5-94e3-9579a57b2c08","schema":1,"source_base":"f49c2852cb60e7741a354ef5c610486345b1796f","source_sha256":"af6de67845dd0fe8fffd545aad753316914546a548b54af111c86d0396d3a420"},"schema":1,"status":"blocked","successor_run_sha256":"278487338a9323a86cf77413e3a7bd1fc2998b20d36bf3dd5adf7a526f753b14"}

Plan-attempt-history: {"authorization_source_sha256":"13ff4bea26bef2d136234ca41fdefec4b4e9f533edbf1e78e0598c2012dc8cd9","plan_bytes_sha256":"d514853ad1402ba807ee386086cdc3bd728aa7673d9466cd32f51ad51230df11","replacement_run_id":"9b5aec8d-70bc-4367-ad3c-7227204ab93e","run":{"acceptance":null,"blocker":{"evidence_sha256":"e26d333e200b87ef12a7b171d7b66d6918a3500f09823f1d3efe813215bf5239","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"08a3962c77c7896532c1bf0282507300daaa3a011b7095368850db1c44ae0260","invocations":1,"result_sha256":"c3bfa3ffca00d57e0a25ec8cc8119edf69938e9e51b0733dafaa7f921733494d","state":"passed"},"execution_parent":null,"goal_id":"ba268ab2-a4d9-4b05-8041-d44188dadef5","implementation_commit":null,"plan_path":"docs/plans/active/plan-execution-queue-contract.md","plan_sha256":"c147e0c502d35751cc7f315788a8f4558fa2e29980b54add95637caa18af5b68","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"86211dd3-80b8-4b84-9d0f-8c3122e8742d","schema":1,"source_base":"dc18293cff533eb08a3a577466a75b6ad17efa47","source_sha256":"64bfee1bc1322439b4867f3229d58e916ca0388df1805b20714448052fa2dace"},"schema":1,"status":"blocked","successor_run_sha256":"a2c3f12b26c6d479fc7289e4e30baf754b65cf611d97a631df93caabdd730674"}

Plan-attempt-history: {"authorization_source_sha256":"13ff4bea26bef2d136234ca41fdefec4b4e9f533edbf1e78e0598c2012dc8cd9","plan_bytes_sha256":"f1839ad685d8b8c7f56c6472d514f4db1ca8b579a7b50e6c97acbc6eaf6dff49","replacement_run_id":"ea745436-60d4-41b6-a870-10db49f1cdbd","run":{"acceptance":null,"blocker":{"evidence_sha256":"6f34de1b4b1a03021b2ae60e8392a410209a5de7ed43b433c1db751be85b5ee6","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"9937d6078d60301e6c474349daa23d23d694d884b8253528fb6d8920d1c1fd73","invocations":1,"result_sha256":"7571eedf1a48d14dc3d097f34adf3489cf3f8163f56df8326bac84b0ec438fb7","state":"passed"},"execution_parent":null,"goal_id":"ba268ab2-a4d9-4b05-8041-d44188dadef5","implementation_commit":null,"plan_path":"docs/plans/active/plan-execution-queue-contract.md","plan_sha256":"32f54319fdf7e6a09cdfb04e320066e7100237a58ec1e54bb4a91ee5757f64b1","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"9b5aec8d-70bc-4367-ad3c-7227204ab93e","schema":1,"source_base":"dc18293cff533eb08a3a577466a75b6ad17efa47","source_sha256":"5159b797106560a8faeda932423562a7f6bbd63c73feb9fdb9666ec396efe8df"},"schema":1,"status":"blocked","successor_run_sha256":"fc6ebbf49a5d6ca62fda92bc25c4fcf935296deda1c93b8be52752e41868316e"}

Plan-attempt-history: {"authorization_source_sha256":"896b5a45804a4f2f18d7c49189e50a0413f497c7169a7ccb1581dbb7dfffa2d7","plan_bytes_sha256":"41f69ba1734feca32e3478c4978424455a4a49b51a84ddd6fee086b9cd662c72","replacement_run_id":"e5064d43-b9bd-40d5-a48f-3b180e21508f","run":{"acceptance":null,"blocker":{"evidence_sha256":"a89a6266a0c828825d7efe7b76e55ef4735d8ec9bee780b95cc849f4e195d28f","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"e17fe9d2ac91850571c15aad64a377c6cfac8e4839870a1621b6f6e9e0b1cce6","invocations":1,"result_sha256":"b372f0365747441d21ec7d779aecf7125d3119674fd0615d7f6ac818affe3e96","state":"passed"},"execution_parent":null,"goal_id":"ba268ab2-a4d9-4b05-8041-d44188dadef5","implementation_commit":null,"plan_path":"docs/plans/active/plan-execution-queue-contract.md","plan_sha256":"32f54319fdf7e6a09cdfb04e320066e7100237a58ec1e54bb4a91ee5757f64b1","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"ea745436-60d4-41b6-a870-10db49f1cdbd","schema":1,"source_base":"f49c2852cb60e7741a354ef5c610486345b1796f","source_sha256":"6f0d3110e1f8e24ff5f57c1cc058ab2d66c7943c4119e2d57ef8fedec1fcd7ab"},"schema":1,"status":"blocked","successor_run_sha256":"51b6840d592987720e5f63da0d4d0f96bcaa984d8b9ceaa310551f9a85484fca"}

Earlier predecessors repaired path coverage, stage selection, global-barrier overconstraint, the missing queue-contract row, its stage placement, and a squashed source_base. This successor additionally owns the gate wiring, the test-contract registry, and the discovery selector, because the CI observability plan finished first and made the discovered suite set derive from the gate source. Its related-plan reference to that finished plan now names the archive path.

## Verification Results

N/A — implementation and acceptance have not run.
