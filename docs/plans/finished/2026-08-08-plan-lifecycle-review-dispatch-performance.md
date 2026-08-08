---
title: Measure and bound Plan Lifecycle review dispatch
goal: Make canonical review latency attributable and remove avoidable reviewer round trips through a lossless sealed input without weakening review evidence.
plan_hash_mode: status-excluded-v1
status: planned
created: "2026-08-05T04:41:00.091Z"
updated: "2026-08-05T04:53:40.088+00:00"
started_at: null
finished_at: null
assignee: null
tags: [plans, plan-lifecycle, review, performance, observability]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/review-observation.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md
  - plugins/plan-lifecycle/skills/productivity/plan-reviewer/scripts/review-policy.mjs
  - plugins/plan-lifecycle/test/selftest.mjs
  - scripts/AGENTS.md
  - scripts/tests/plan-dispatch-probes.mjs
  - scripts/tests/plan-skill-phases.mjs
related_plans:
  - docs/plans/active/ci-observability-and-test-contracts.md
  - docs/plans/active/plan-lifecycle-review-and-authority-modules.md
  - docs/plans/active/plan-execution-queue-contract.md
---

# Measure and bound Plan Lifecycle review dispatch

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"ab7e46a254814b4a51343f3eb788d80388b1f3eac7b279b4d3b7f968978b457c","invocations":1,"result_sha256":"0bccd0e9eefad8b5cd18dc3a30110299322f57173131c054b4dfd1bea3ddf6e5","state":"passed"},"execution_parent":null,"goal_id":"9790f738-c5c7-4b55-9ea3-897e046699d8","implementation_commit":null,"plan_path":"docs/plans/active/plan-lifecycle-review-dispatch-performance.md","plan_sha256":"09511820970ca5216a0f7c7862e3740dc75491996b82ca9a1096cb27c43fe51f","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"f5916e40-1191-4a40-b4f7-a6cf74348362","schema":1,"source_base":"f49c2852cb60e7741a354ef5c610486345b1796f","source_sha256":"5f1431adefd54cf454e8917495847fe8b51d538e26d14986fb61ee6562871eb9"}

## Goal

Instrument the complete canonical draft-review dispatch, preserve timing as non-authoritative observation, and replace the multi-file review bundle with one lossless hash-bound input so the reviewer needs fewer model/tool turns without receiving summaries in place of evidence.

## Context & rationale

The observed queue-plan review command took 135.89 seconds. Its captured OMP stream contains 11 sequential model responses whose reported request durations total 117,076 ms, plus a provider fallback and repeated reads or digest experiments. The driver exposes no complete timing contract, so the remaining local preflight, process, parse, and settlement time cannot be assigned. The durable fix is measurement first, then removal of structurally avoidable turns. The OptMem-derived principle is narrow: preserve full authoritative bytes and make navigation metadata disposable. No OptMem code, data format, dependency, or lossy summary enters this plugin.

## Environment & how-to-run

Run from the repository root with Node 24. Implement after the CI observability and Plan Lifecycle authority-module plans finish. Use monotonic clocks for durations and ISO 8601 only for human correlation. Keep PlanRunV1, PlanReviewV1, ReviewInvalidInputV1, and acceptance bytes unchanged. Treat provider latency as observed input, not a deterministic test threshold.

## Observation and input contract {mechanism}

A closed ReviewDispatchObservationV1 result records total, preflight, reserve, reviewer-process, output-parse, and settlement durations. Its optional route observation records model/provider labels, request count, the sum of provider-reported request durations and time-to-first-token values, fallback count, tool-result count, exit code, and signal when the selected route exposes them. The driver prints the summary and optionally writes compact JCS through an explicit --timings-json path using create-new or compare-and-swap semantics. Observation bytes are never written into PlanRun, review results, manifests, bundles, acceptance, or permit decisions; missing route detail is null, not invented.

PlanReviewInputV2 is one canonical, mode-0700 bundle directory containing one mode-0600 compact-JCS input file. That file carries the exact closed binding, affected-path manifest, complete UTF-8 plan bytes, and a deterministic heading/byte-range directory derived from those same bytes. The outer digest binds the single file. The reviewer verifies that digest once, reads the complete input, validates the closed fields, and reviews the full plan. The directory is navigation only: it may locate source ranges but cannot replace, summarize, filter, or authorize evidence. V1 bundles are ephemeral, so generation cuts over cleanly; historical result evidence remains valid and no V1 reader shim remains.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | define_dispatch_observation | Define closed ReviewDispatchObservationV1 timing and route-observation parsing as a non-authoritative module. | `docs/plans/AGENTS.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/review-observation.mjs` | — | `local` | `planned` | Stage durations use one monotonic clock, optional route fields never fabricate support, and observation failures cannot change lifecycle state or review evidence. |
| 2 | instrument_dispatch_driver | Measure every dispatch stage, print the terminal breakdown, and add explicit atomic --timings-json output. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/review-observation.mjs` | 1 | `local` | `planned` | Normal, repair-held, invalid-output, transport-failure, signal, and drift exits report attributable timings while preserving their existing reducer events and exit semantics. |
| 3 | seal_lossless_review_input | Replace generated V1 bundle members with one closed PlanReviewInputV2 file containing full plan, binding, manifest, and validated range directory. | `plugins/plan-lifecycle/skills/productivity/plan-reviewer/scripts/review-policy.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs` | 1, 2 | `local` | `planned` | One digest binds one lossless input; corruption, extra keys, bad ranges, invalid UTF-8, or binding drift fail before reservation; no V1 generation path or compatibility shim remains. |
| 4 | bound_reviewer_workflow | Update manager and reviewer contracts to verify once, read the complete V2 input once, avoid redundant digest reconstruction, and return one result. | `plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md`; `plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md` | 3 | `local` | `planned` | The workflow requires full evidence review but no directory probe, separate binding/manifest/plan reads, arbitrary digest framing, lossy summary, provider fallback authority, or worktree access. |
| 5 | prove_observation_and_input | Add controlled child-process probes for timing stages, route event extraction, V2 integrity, crash paths, and unchanged settlement behavior. | `scripts/tests/plan-dispatch-probes.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/review-observation.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-reviewer/scripts/review-policy.mjs` | 1, 2, 3, 4 | `local` | `planned` | Fixtures cover delayed children, missing route fields, fallback events, corrupt inputs, signals, held repairs, and pass settlement; every timing is bounded by the measured process wall clock within declared tolerance. |
| 6 | synchronize_review_contracts | Update plugin self-test, author rules, and phase contracts for the V2 cutover and non-authoritative timing boundary. | `plugins/plan-lifecycle/test/selftest.mjs`; `scripts/AGENTS.md`; `scripts/tests/plan-skill-phases.mjs` | 3, 4, 5 | `local` | `planned` | Shipped files, skill wording, generated contracts, and release validation reject split V1 generation or timing fields inside authority records. |
| 7 | verify_review_performance_cutover | Run focused dispatch probes, lifecycle contracts, the selected plugin gate, and the full shared gate on final bytes. | all affected paths in frontmatter | 6 | `local` | `planned` | All acceptance commands pass; a controlled dispatch emits a complete timing breakdown; unchanged review outcomes and PlanRun transitions match the pre-cutover fixtures. |

## Acceptance criteria

| ID | Command | Expected result |
|---|---|---|
| A1 | `node scripts/tests/plan-dispatch-probes.mjs --case review-observation` | Exit 0; complete, held, failed, signalled, and drifted dispatches report closed monotonic stage timings without changing reducer outcomes. |
| A2 | `node scripts/tests/plan-dispatch-probes.mjs --case review-input-v2` | Exit 0; one lossless input verifies, stale or corrupt bytes fail before reserve, and no V1 bundle is generated. |
| A3 | `node scripts/tests/plan-dispatch-probes.mjs --case route-observation` | Exit 0; synthetic OMP event streams report request, duration, token, tool, and fallback facts while unsupported routes return explicit null detail. |
| A4 | `node scripts/tests/plan-skill-phases.mjs --case bounded-review-input` | Exit 0; manager, reviewer, workspace rules, and helper contracts agree on full-byte authority and the V2 cutover. |
| A5 | `node plugins/plan-lifecycle/test/selftest.mjs` | Exit 0; the shipped plugin contains the V2 verifier and observation helper with no V1 generation path. |
| A6 | `node scripts/ci.mjs --plugin plan-lifecycle` | Exit 0; all plan-lifecycle authoring, skills, scripts, tests, manifests, and release contracts pass. |
| A7 | `node scripts/ci.mjs` | Exit 0; all shared and plugin gates pass against the same implementation bytes. |

## Out of scope / do-NOT-touch

- Do not set a provider wall-time service-level objective or fail a correct review because a model is slow.
- Do not write timing into PlanRunV1, PlanReviewV1, ReviewInvalidInputV1, attempt history, acceptance, or authorization records.
- Do not use a summary, embedding, cache, index, or range directory instead of complete plan and manifest bytes.
- Do not change review finding classes, permit budgets, reducer transitions, result acceptance, or external-effect authority.
- Do not add SQLite, OptMem code, a shared database, telemetry upload, or a resident service.
- Do not retain V1 bundle generation or add a compatibility shim for ephemeral review inputs.
- Do not implement general plan-history search or navigation in this plan.

## STOP conditions

1. Any observation value can affect a review verdict, lifecycle transition, permit, acceptance, or external action.
2. The V2 input omits or transforms plan or manifest evidence needed by the reviewer.
3. A signal, crash, malformed result, repair hold, or source drift changes its existing fail-closed successor state.
4. The implementation claims provider speed from deterministic fixtures or silently omits unsupported route timing.
5. Review output accepts moving-worktree bytes, an unbound cache, or a lossy derived summary.
6. The selected plugin gate or full repository gate fails.

## Open questions

None. The measured bottleneck is repeated model/tool turns, while the exact local stage split is missing; this plan instruments the full boundary and removes only structurally redundant input reads.

## Review

N/A — awaiting canonical draft review.

## Verification Results

N/A — plan-only draft; implementation and acceptance have not run.

## Retirement

The v2 plan-lifecycle redesign in `plan-lifecycle-redesign` supersedes this goal.
The goal is unreachable because the redesign deletes the modules this plan targets.
The frontmatter status remains deliberately unsettled because this run never completed.
