# Plan execution queue

Status: validated project-owned `PlanQueueV1` discovery and prioritization view.

Plan-queue: PlanQueueV1

This file records selection order only. It grants no review, lifecycle, mutation,
or external-effect authority. `PlanRunV1`, current user intent, and observed
acceptance remain authoritative.

The goal id is the row identity; the validator resolves its current path by scanning active and finished records, so
archiving a plan does not invalidate the queue.
The `Plan` column is a rendered copy of the record title and carries no authority.

| Stage | Goal ID | Plan | Depends on | Why |
|---:|---|---|---|---|
| 1 | 213aef20-2306-4f43-bcb2-80f7591665e9 | `Make CI timing and test ownership authoritative` | — | This plan is finished. |
| 2 | ba268ab2-a4d9-4b05-8041-d44188dadef5 | `Promote the plan execution queue into the workspace contract` | 213aef20-2306-4f43-bcb2-80f7591665e9 | CI observability is finished and its full gate is green; this plan is finished, so PlanQueueV1 manages the remaining queue. |
| 3 | 30fee75d-a1f7-40a9-9fcb-952b18fb2f4a | `Replace Relay messaging with typed SQLite IRC` | ba268ab2-a4d9-4b05-8041-d44188dadef5 | PlanQueueV1 is finished and the CI observability gate remains green. |
| 3 | 248e3f50-2528-4dd3-b92c-d0373f702d65 | `Consolidate Plan Lifecycle authority and bound reviews` | ba268ab2-a4d9-4b05-8041-d44188dadef5 | PlanQueueV1 is finished; this may run in parallel with Relay vNext. |
| 4 | d3d2f5b2-81f7-4a3a-8660-20dfc76b4e72 | `Split Relay custody modules after the vNext cutover` | 30fee75d-a1f7-40a9-9fcb-952b18fb2f4a | Relay vNext is finished and its selected plugin gate is green. |
| 4 | 9790f738-c5c7-4b55-9ea3-897e046699d8 | `Measure and bound Plan Lifecycle review dispatch` | 213aef20-2306-4f43-bcb2-80f7591665e9, 248e3f50-2528-4dd3-b92c-d0373f702d65 | CI observability and Plan Lifecycle authority modules are finished. |
| 5 | ed7622b8-ecca-4024-b732-d7dc0f2ad0a4 | `Add rebuildable Plan Lifecycle history navigation` | 248e3f50-2528-4dd3-b92c-d0373f702d65, 9790f738-c5c7-4b55-9ea3-897e046699d8, ba268ab2-a4d9-4b05-8041-d44188dadef5 | Plan Lifecycle authority modules, review dispatch performance, and PlanQueueV1 are finished. |

## OptMem design input

[OptMem](https://github.com/VictorTaelin/OptMem) supports one useful boundary:
lossless append-only records remain authoritative while summaries and indexes are
rebuildable. Apply that idea to CI evidence, Relay event indexes, and Plan
Lifecycle history navigation. Never use lossy summaries as authority or evidence.

No license file or GitHub license metadata was present when checked. Study its
concepts only; do not copy its code or add it as a dependency without permission.
