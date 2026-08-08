# Plan execution queue

Status: project-owned discovery and prioritization view.

This file records selection order only. It grants no review, lifecycle, mutation,
or external-effect authority. Canonical plan records, current user intent, and
observed acceptance remain authoritative.

| Stage | Plan | Depends on | Why |
|---:|---|---|---|
| 1 | ci-observability-and-test-contracts | — | This plan is finished. |
| 2 | plan-execution-queue-contract | ci-observability-and-test-contracts | CI observability is finished and its full gate is green; this plan is finished, so the queue now orders the remaining work. |

## OptMem design input

[OptMem](https://github.com/VictorTaelin/OptMem) supports one useful boundary:
lossless append-only records remain authoritative while summaries and indexes are
rebuildable. Apply that idea to CI evidence, Relay event indexes, and Plan
Lifecycle history navigation. Never use lossy summaries as authority or evidence.

No license file or GitHub license metadata was present when checked. Study its
concepts only; do not copy its code or add it as a dependency without permission.
