# Plan execution queue

Status: temporary project-owned index. Canonical support is planned in
[`plan-execution-queue-contract.md`](active/plan-execution-queue-contract.md).

This file records selection order only. It grants no review, lifecycle, mutation,
or external-effect authority. `PlanRunV1`, current user intent, and observed
acceptance remain authoritative.

| Stage | Plan | Start gate |
|---:|---|---|
| 1 | [`2026-08-05-ci-observability-and-test-contracts.md`](finished/2026-08-05-ci-observability-and-test-contracts.md) | Finished. |
| 2 | [`plan-execution-queue-contract.md`](active/plan-execution-queue-contract.md) | CI observability is finished and its full gate is green; implement next so PlanQueueV1 manages the remaining queue. |
| 3 | [`session-relay-typed-irc-sqlite.md`](active/session-relay-typed-irc-sqlite.md) | PlanQueueV1 is finished and the CI observability gate remains green. |
| 3 | [`plan-lifecycle-review-and-authority-modules.md`](active/plan-lifecycle-review-and-authority-modules.md) | PlanQueueV1 is finished; this may run in parallel with Relay vNext. |
| 4 | [`session-relay-post-cutover-modules.md`](active/session-relay-post-cutover-modules.md) | Relay vNext is finished and its selected plugin gate is green. |
| 4 | [`plan-lifecycle-review-dispatch-performance.md`](active/plan-lifecycle-review-dispatch-performance.md) | CI observability and Plan Lifecycle authority modules are finished. |
| 5 | [`plan-lifecycle-derived-history-navigation.md`](active/plan-lifecycle-derived-history-navigation.md) | Plan Lifecycle authority modules, review dispatch performance, and PlanQueueV1 are finished. |

## OptMem design input

[OptMem](https://github.com/VictorTaelin/OptMem) supports one useful boundary:
lossless append-only records remain authoritative while summaries and indexes are
rebuildable. Apply that idea to CI evidence, Relay event indexes, and Plan
Lifecycle history navigation. Never use lossy summaries as authority or evidence.

No license file or GitHub license metadata was present when checked. Study its
concepts only; do not copy its code or add it as a dependency without permission.
