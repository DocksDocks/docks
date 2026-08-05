---
title: Make CI timing and test ownership authoritative
goal: Measure every CI command correctly and establish one discoverable owner for each versioned test contract without changing test selection or release evidence.
plan_hash_mode: status-excluded-v1
status: planned
created: "2026-08-05T03:40:58.144Z"
updated: "2026-08-05T03:48:07.577+00:00"
started_at: null
finished_at: null
assignee: null
tags: [ci, testing, observability, contracts]
affected_paths:
  - .github/AGENTS.md
  - .github/workflows/ci.yml
  - package.json
  - plugins/session-relay/test/fixtures/rust-test-inventory.json
  - plugins/session-relay/test/rust-test-inventory.mjs
  - plugins/session-relay/test/selftest.mjs
  - scripts/AGENTS.md
  - scripts/ci.mjs
  - scripts/config/test-contracts.json
  - scripts/lib/ci-background-task.mjs
  - scripts/tests/ci-observability.mjs
  - scripts/tests/test-contracts.mjs
  - scripts/tests/unit/ci-background-task.test.mjs
related_plans: []
---

# Make CI timing and test ownership authoritative

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"429729c55c63bf10c16ba135de8fa5a761469602331e2871dfd2e259d989bea1","invocations":1,"result_sha256":"56a2788a9a5ba24ab2e9e51dc774d758f6c77d81d0a116903086c93336e9f48d","state":"passed"},"execution_parent":null,"goal_id":"213aef20-2306-4f43-bcb2-80f7591665e9","implementation_commit":null,"plan_path":"docs/plans/active/ci-observability-and-test-contracts.md","plan_sha256":"ea72392d52b2905318fd2abc8435e0818ab39ea3d664a6a50a1937d906e153be","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"bd2d28c3-5b5c-4c4b-bbe3-8427aa1f260a","schema":1,"source_base":"672246bd388d3f34475be70857e3ec0dcb222b23","source_sha256":"3711a030437cb98b6a98e2ae783934cfccb987fd8e980e9e0284b49f6d554c93"}

## Goal

Make local and hosted CI produce trustworthy command-level timing evidence. Add a closed test-contract inventory that proves every selected test is registered, executed, owned, and non-vacuous while preserving current PR, release, and artifact gates.

## Context & rationale

A clean local full gate measured 372.879 seconds, with the Session Relay plugin phase at 333.512 seconds. A focused Relay gate measured 321.286 seconds. Isolated JavaScript quality took 0.89 seconds, but the timing report recorded 321–372 seconds because background-task duration currently ends when the task is awaited rather than when its process exits. Hosted checkout, dependency install, Claude materialization, cache, and queue costs remain unmeasured. The Rust inventory owns A01–A29 and rejects ignored or filtered cases, while the JavaScript self-test owns fresh-binary, stream, artifact, cleanup, and 133-result contracts. This plan records those authorities; it authorizes no deletion or selector narrowing.

## Environment & how-to-run

Run from the repository root with Node 24, frozen pnpm dependencies, the pinned Rust toolchain, and the same host prerequisites used by `node scripts/ci.mjs`. The implementation must keep the existing `core` and `relay` PR lanes, tag-targeted gates, manual full gate, and native release producer semantics.

## Evidence collection and contract registry {mechanism}

The CI runner emits one schema-versioned record per child command at process start and completes it at process exit. Each record carries stable command identity, timestamps, exit state, overlap, cache facts when available, and a retained-output reference. A full-run summary must be derivable from these records rather than from await timing.

The test registry is declarative data. It maps each normative contract to one suite owner, exact discovery and selection rules, supported platforms, release relevance, and replacement dependencies. The validator computes discovered, registered, selected, and executed sets and rejects unknown, duplicate, expired, ignored, or zero-selected entries. It does not choose tests or authorize deletions.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | characterize_timing | Add deterministic red contracts for child spawn/exit duration, concurrent task accounting, failed-log retention, and full wall-time reconstruction. | `scripts/tests/unit/ci-background-task.test.mjs`; `scripts/tests/ci-observability.mjs` | — | `local` | `planned` | Fixtures reproduce the current await-lifetime error and prove actual monotonic process start/exit accounting within `max(1 s, 1%)`; failure preserves complete output. |
| 2 | fix_command_telemetry | Record every orchestrated command at actual spawn and exit with argv identity, status, duration, overlap, and retained artifact metadata. | `scripts/lib/ci-background-task.mjs`; `scripts/ci.mjs` | 1 | `local` | `planned` | Timing JSON reconstructs observed local wall time, distinguishes phase and child intervals, and never reports an unfinished child as passed; failure leaves authoritative logs. |
| 3 | capture_hosted_costs | Emit and upload success or failure timing artifacts for checkout-adjacent install, cache, Claude materialization, Rust provisioning, and gate steps without changing trigger topology. | `.github/workflows/ci.yml`; `.github/AGENTS.md`; `scripts/ci.mjs`; `scripts/AGENTS.md` | 2 | `local` | `planned` | Every current workflow lane retains its gate and publishes one bound timing artifact; cache hit, miss, bytes, and step duration are explicit where GitHub exposes them. |
| 4 | define_contract_inventory | Create a closed, versioned test-contract inventory and validator with one suite owner per normative contract and any distinct boundary cases. | `scripts/config/test-contracts.json`; `scripts/tests/test-contracts.mjs`; `scripts/AGENTS.md` | 2 | `local` | `planned` | Each row names contract/version, owner, stable selectors, layer, platforms/toolchains, transitive inputs, acceptance/release role, and replacement dependencies; unknown fields and duplicate ownership fail. |
| 5 | register_existing_surfaces | Register existing Relay A01–A29 inventory, omitted Rust targets, unit-test policy, JavaScript semantic labels, and exact release-evidence exclusions without deleting tests. | `plugins/session-relay/test/fixtures/rust-test-inventory.json`; `plugins/session-relay/test/rust-test-inventory.mjs`; `plugins/session-relay/test/selftest.mjs`; `scripts/config/test-contracts.json` | 4 | `local` | `planned` | Discovery proves `discovered = registered`, nonzero `selected = expected`, and `executed = selected`; every skip, ignore, or filter has owner, reason, and expiry; frozen release contracts remain non-selectable. |
| 6 | integrate_authoritative_gate | Run timing and contract validation through the current CI composition while preserving all existing full and targeted gates. | `package.json`; `scripts/ci.mjs`; `scripts/tests/ci-observability.mjs`; `scripts/tests/test-contracts.mjs` | 3, 5 | `local` | `planned` | Focused tests and the unchanged full gate pass; no PR, tag, manual, platform, checksum, attestation, or publication prerequisite is weakened. |

## Acceptance criteria

| ID | Command | Expected result |
|---|---|---|
| A1 | `node --test scripts/tests/unit/ci-background-task.test.mjs` | Exit 0; controlled clocks prove start/exit timing, overlap accounting, and failed-output retention. |
| A2 | `node scripts/tests/ci-observability.mjs` | Exit 0; timing artifacts account for every child and reconstruct fixture wall time within `max(1 s, 1%)`. |
| A3 | `node scripts/tests/test-contracts.mjs` | Exit 0; discovered, registered, selected, and executed sets agree and no unowned or expired skip exists. |
| A4 | `node scripts/ci.mjs --plugin session-relay` | Exit 0; current Relay test, fresh-binary, release-evidence, and no-hidden-skip contracts remain intact. |
| A5 | `node scripts/ci.mjs` | Exit 0; all four plugin gates and repository-wide workflow, tooling, format, and lint contracts pass. |

## Out of scope / do-NOT-touch

- Do not adopt Bazel, remote execution, or a remote cache in this plan.
- Do not change PR, default-branch, tag, manual, or release trigger topology.
- Do not delete, merge, retry-mask, skip, or narrow any current test or release-evidence contract.
- Do not add SQLite-, Relay-vNext-, planctl-, or optional Relay-review tests before those protocols exist.
- Do not use coverage or mutation score as a universal gate.

## STOP conditions

1. Timing evidence cannot distinguish child exit from await/finalization or cannot reconstruct observed wall time.
2. Automatic discovery cannot map every current acceptance owner and semantic label without silently dropping a contract.
3. Any release producer can publish an asset whose exact digest did not pass its same-run platform and evidence checks.
4. Any selector can pass after selecting zero tests, or an ignored/filtered test lacks an owner and expiry.
5. Full CI or a currently authoritative targeted plugin gate regresses.

## Open questions

None. Bazel remains rejected until a separate evidence-gated pilot satisfies the measured thresholds recorded in this plan’s context and conclusions.

## Review

N/A — manager-written after draft review.

## Verification Results

N/A — plan-only request; implementation and acceptance have not run.
