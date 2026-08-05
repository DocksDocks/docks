---
title: Promote the plan execution queue into the workspace contract
goal: Promote the temporary plan-order index into optional validated PlanQueueV1 support without making queue data lifecycle or execution authority.
plan_hash_mode: status-excluded-v1
status: planned
created: "2026-08-05T04:13:23.006Z"
updated: "2026-08-05T04:23:28.621+00:00"
started_at: null
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
  - scripts/tests/plan-queue.mjs
  - scripts/tests/plan-skill-phases.mjs
related_plans:
  - docs/plans/active/ci-observability-and-test-contracts.md
  - docs/plans/active/session-relay-typed-irc-sqlite.md
  - docs/plans/active/plan-lifecycle-review-and-authority-modules.md
  - docs/plans/active/session-relay-post-cutover-modules.md
---

# Promote the plan execution queue into the workspace contract

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"2d40e9cf0a783c1b430ee7e7fd0103bdbd08c8e8b8911b2adb1f852e8e5de30a","invocations":1,"result_sha256":"e98b44fa110964a44adb96bdde40df96c659fa3f7dd26996de6e0d90aa142a0b","state":"passed"},"execution_parent":null,"goal_id":"ba268ab2-a4d9-4b05-8041-d44188dadef5","implementation_commit":null,"plan_path":"docs/plans/active/plan-execution-queue-contract.md","plan_sha256":"08decb76958376de7b82a423e8ac3610741d12123fd76394f99d775b677d4234","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"9f5efad5-0a79-48a4-be86-5eb61d150309","schema":1,"source_base":"6c9ce4128cc26780b3fb998533b562fd958808f1","source_sha256":"37bba8189f3157aca1cfe07290e0fa6b65a7428ceeb23382da8e357f8cafdbb8"}

## Goal

Replace the explicitly temporary custom queue with an optional first-class PlanQueueV1 index that validates plan paths, parallel stages, dependencies, and next-plan selection while preserving PlanRunV1 and current user intent as the only execution authority.

## Context & rationale

The user authorized a temporary `docs/plans/QUEUE.md` so the current order is not lost: CI observability first; Session Relay SQLite vNext and Plan Lifecycle authority modules may proceed in parallel after CI; Relay post-cutover extraction waits for Relay vNext. The generated workspace currently has no queue marker, parser, setter, or ordering field, so the temporary file is deliberately custom. Initial verification rejected path-bound full coverage: ordinary new-plan creation and archive would invalidate the queue. The corrected contract uses stable PlanRun `goal_id` identity, resolves current paths across active and finished plans, permits an explicit subset, and gives plan-manager bounded lock/CAS setters. OptMem supplies only the separation principle that authority remains lossless while indexes are rebuildable; its unlicensed source is not copied.

## Environment & how-to-run

Run from the repository root with Node 24. Preserve every byte of the four existing planned files. Keep workspaces without `QUEUE.md` valid; bootstrap may seed an empty queue, and an explicit user request may add one. Update changed skill metadata and content hashes through the repository authoring workflow.

## Queue contract {mechanism}

`docs/plans/QUEUE.md` carries exactly one `Plan-queue: PlanQueueV1` marker and one `Stage | Goal ID | Plan | Depends on | Why` table. `goal_id` is the stable row identity; `Plan` is a human label; the validator resolves the current repository-relative path by scanning active and finished PlanRun records. Stages are positive integers, goal ids are unique UUIDs, dependencies name queued goal ids at lower stages, reasons are nonempty, and same-stage rows are parallel. The queue may be an explicit subset, so creating an unrelated plan does not invalidate it. A read-only `check|show|next` surface rejects malformed rows, duplicate or missing goals, invalid PlanRun records, same/later-stage dependencies, and cycles. `next` returns only the lowest-stage planned or scheduled goals whose dependencies resolve to finished records; ongoing, blocked, and finished rows remain visible but are not eligible. Manager-owned `add|move|remove` operations require an expected queue digest, take an exclusive queue lock, validate the complete successor, fsync a sibling, atomically rename, and read back. Only exact current-user prioritization permits a setter call. Queue data never grants start, review, scheduling, mutation, or external-effect authority. A missing queue remains compatible. Stable goal resolution means archive requires no queue path rewrite; stale or ambiguous goal evidence fails validation without changing plans.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | define_queue_schema | Define stable-goal PlanQueueV1 and implement read-only `check|show|next` operations. | `plugins/plan-lifecycle/skills/productivity/plan-manager/references/planqueuev1-schema.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-queue.mjs` | — | `local` | `planned` | The marker/table schema, stable goal lookup across active/finished, subset semantics, graph checks, lifecycle resolution, and next-stage selection are executable; creation and archive do not invalidate unrelated rows. |
| 2 | add_queue_setters | Add manager-owned `add|move|remove` transactions with exact preimage, exclusive lock, full-successor validation, fsync, atomic rename, and readback. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-queue.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/references/planqueuev1-schema.md` | 1 | `local` | `planned` | Concurrent or stale updates fail before write; setters change only queue bytes, require explicit prioritization authority, and cannot mutate or transition any PlanRun. |
| 3 | promote_current_queue | Convert the temporary queue into PlanQueueV1 while preserving the selected stages and bounded OptMem note. | `docs/plans/QUEUE.md` | 1, 2 | `local` | `planned` | The four stable goal ids encode CI stage 1, Relay vNext and Plan Lifecycle stage 2, and Relay cleanup stage 3 depending only on Relay vNext; existing plan digests remain unchanged. |
| 4 | integrate_workspace | Teach plan-workspace and its generated contract to recognize, bootstrap, audit, and explicitly add the optional queue without changing plan bytes. | `docs/plans/AGENTS.md`; `plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md`; `plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md` | 1, 2, 3 | `local` | `planned` | Existing no-queue workspaces remain current; bootstrap may seed an empty valid queue; audit validates a present queue and never rewrites it implicitly. |
| 5 | integrate_manager | Teach plan-manager and root routing to own explicit queue setters and consult a valid queue for list/next selection. | `AGENTS.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md` | 1, 2, 4 | `local` | `planned` | The manager records explicit priority through lock/CAS setters, proposes only eligible entries, resolves archive moves by goal id, reports stale queues, and never treats queue state as lifecycle authority. |
| 6 | close_queue_contracts | Add parser, setter, concurrency, archive-resolution, compatibility, ordering, workspace-copy, and authority fixtures to plan tests. | `plugins/plan-lifecycle/test/selftest.mjs`; `scripts/AGENTS.md`; `scripts/tests/plan-queue.mjs`; `scripts/tests/plan-skill-phases.mjs` | 1, 2, 3, 4, 5 | `local` | `planned` | Tests cover missing queue compatibility, empty bootstrap, subset creation, active-to-finished goal resolution, add/move/remove CAS, concurrent stale preimages, parallel stages, malformed graphs, and no queue-derived authority. |
| 7 | verify_public_cutover | Run focused queue contracts, plan-lifecycle self-test, selected plugin gate, and full shared gate against the final bytes. | all affected paths in frontmatter | 6 | `local` | `planned` | Every acceptance command passes; all pre-existing active plan digests match their inventory; plugin and repository-wide gates stay green. |

## Acceptance criteria

| ID | Command | Expected result |
|---|---|---|
| A1 | `node scripts/tests/plan-queue.mjs` | Exit 0; PlanQueueV1 parsing, ordering, dependency, compatibility, stale-data, coverage, and next-stage cases pass. |
| A2 | `node scripts/tests/plan-skill-phases.mjs --case plan-queue` | Exit 0; workspace, manager, template, root-routing, and queue contract copies remain synchronized. |
| A3 | `node plugins/plan-lifecycle/test/selftest.mjs` | Exit 0; the shipped plugin includes valid queue support without unsupported agents or altered PlanRun authority. |
| A4 | `node scripts/ci.mjs --plugin plan-lifecycle` | Exit 0; plan-lifecycle authoring, skills, agents, scripts, self-test, manifests, and queue contracts pass. |
| A5 | `node scripts/ci.mjs` | Exit 0; all plugin and repository-wide workflow, tooling, format, lint, and plan contracts pass. |

## Out of scope / do-NOT-touch

- Do not edit the four existing planned PlanRun files.
- Do not make queue data lifecycle, review, mutation, scheduling, or external-effect authority.
- Do not auto-start work or add a background queue runner.
- Do not make `QUEUE.md` mandatory for existing consumer workspaces.
- Do not copy OptMem code, install it, or add it as a dependency without explicit licensing permission.
- Do not store lossy summaries as Relay, PlanRun, review, CI, or acceptance authority.
- Do not implement the queued CI, Relay, Plan Lifecycle, or cleanup plans here.

## STOP conditions

1. Any existing active plan digest changes.
2. A queue operation can mutate a plan or authorize start, review, scheduling, or an external effect.
3. A workspace without a queue becomes invalid or requires implicit refresh.
4. Plan creation or archive invalidates an unchanged queued goal, or ambiguous goal resolution is accepted.
5. A setter lacks exact preimage, exclusive locking, full-successor validation, fsync, atomic rename, or readback.
6. The selected plugin gate or full repository gate fails.

## Open questions

None. Verification blocked the path-bound full-coverage draft; this successor uses stable goal identities, subset semantics, manager-owned setters, and archive-safe resolution.

## Review

Plan-attempt-history: {"authorization_source_sha256":"48860f766cbf9dde19f6c5ff82285858054b44f55284198f17755323c685e3ae","plan_bytes_sha256":"175598c1576e88a0a0e96d81dbfa1daab1f8ea82e070a8abfe87960d836e21db","replacement_run_id":"9f5efad5-0a79-48a4-be86-5eb61d150309","run":{"acceptance":null,"blocker":{"evidence_sha256":"d7cdaf9a541cd3c6502358ac376d555d415af316cb7fefeb9fe71b08b56ad2ca","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"e5e7119572b4dbed292c7919f065ef017529596dee4edf070c1515fca25e55bb","invocations":1,"result_sha256":"f82ea88c831616ff9dc7d1734cfc28fd3a65caa5844a465804d6f40f11653146","state":"passed"},"execution_parent":null,"goal_id":"ba268ab2-a4d9-4b05-8041-d44188dadef5","implementation_commit":null,"plan_path":"docs/plans/active/plan-execution-queue-contract.md","plan_sha256":"56221e04e289c5f789ef2ba422524701987cfeca150010d12b33b6d6367af2a9","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"8e73f457-7c26-45da-b93d-0f4cfa959505","schema":1,"source_base":"6c9ce4128cc26780b3fb998533b562fd958808f1","source_sha256":"37bba8189f3157aca1cfe07290e0fa6b65a7428ceeb23382da8e357f8cafdbb8"},"schema":1,"status":"blocked","successor_run_sha256":"5163f6b1b84a9060b243914dd6d055561d514f09e3706a2c79c9b115acf774a5"}

The predecessor passed draft review but verification exposed an incomplete queue lifecycle. It was blocked before checkpoint and replaced under the current user queue-scope decision.

## Verification Results

N/A — plan-only successor; implementation and acceptance have not run.
