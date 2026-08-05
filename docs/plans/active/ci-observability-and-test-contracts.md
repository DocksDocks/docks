---
title: Make CI timing and test ownership authoritative
goal: Measure every CI command correctly and establish one discoverable owner for each versioned test contract without changing test selection or release evidence.
plan_hash_mode: status-excluded-v1
status: ongoing
created: "2026-08-05T03:40:58.144Z"
updated: "2026-08-05T15:58:12.134Z"
started_at: "2026-08-05T15:58:12.135Z"
finished_at: null
assignee: null
tags: [ci, testing, observability, contracts]
affected_paths:
  - .github/AGENTS.md
  - .github/workflows/ci.yml
  - package.json
  - plugins/session-relay/test/fixtures/rust-test-inventory.json
  - plugins/session-relay/test/release-evidence-contract.mjs
  - plugins/session-relay/test/rust-test-inventory.mjs
  - plugins/session-relay/test/selftest.mjs
  - scripts/AGENTS.md
  - scripts/ci.mjs
  - scripts/config/test-contracts.json
  - scripts/lib/ci-background-task.mjs
  - scripts/lib/session-relay-release-preparation.mjs
  - scripts/tests/ci-observability.mjs
  - scripts/tests/ci-plugin-targeting.mjs
  - scripts/tests/test-contracts.mjs
  - scripts/tests/unit/ci-background-task.test.mjs
related_plans: []
---

# Make CI timing and test ownership authoritative

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"171f2386dc2e1ef9a74283ce968187c2fe0a8c97cb5a06b0303c8fca5cd7a830","invocations":1,"result_sha256":"55551440d4af84254a7eee76dd14ca13f82bfca2c0dc2f60d963e1af70297e0a","state":"passed"},"execution_parent":"7bd5228aba869059ca8e8b04f55896c50c14428c","goal_id":"213aef20-2306-4f43-bcb2-80f7591665e9","implementation_commit":null,"plan_path":"docs/plans/active/ci-observability-and-test-contracts.md","plan_sha256":"b51bb7838c0d518564463064fd01008ad14eada0ac0d18376227443c400c6561","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"c7eb2a1a-4736-43ee-a57c-0841cbcafadf","schema":1,"source_base":"7bd5228aba869059ca8e8b04f55896c50c14428c","source_sha256":"eaced36d618f40809eb4ad0512a15b0013c36c2e8e63d09d715c35cd9e653fdf"}

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
| 2 | fix_command_telemetry | Record every orchestrated command at actual spawn and exit with argv identity, status, duration, overlap, and retained artifact metadata. | `scripts/lib/ci-background-task.mjs`; `scripts/ci.mjs`; `scripts/tests/ci-plugin-targeting.mjs` | 1 | `local` | `planned` | Timing JSON reconstructs observed local wall time, distinguishes phase and child intervals, and never reports an unfinished child as passed; failure leaves authoritative logs. |
| 3 | capture_hosted_costs | Emit and upload success or failure timing artifacts for checkout-adjacent install, cache, Claude materialization, Rust provisioning, and gate steps without changing trigger topology. | `.github/workflows/ci.yml`; `.github/AGENTS.md`; `scripts/ci.mjs`; `scripts/AGENTS.md`; `scripts/tests/ci-plugin-targeting.mjs`; `scripts/lib/session-relay-release-preparation.mjs`; `plugins/session-relay/test/release-evidence-contract.mjs` | 2 | `local` | `planned` | Every current workflow lane retains its gate and publishes exactly one bound timing artifact; cache hit, miss, bytes, and step duration are explicit where GitHub exposes them; the workflow census, the Session Relay source-CI job model, and its negative-case anchors move with the workflow, and the replacement upload rule admits only that named timing artifact while still rejecting every other upload and any `contents: write` permission. |
| 4 | define_contract_inventory | Create a closed, versioned test-contract inventory and validator with one suite owner per normative contract and any distinct boundary cases. | `scripts/config/test-contracts.json`; `scripts/tests/test-contracts.mjs`; `scripts/AGENTS.md` | 2 | `local` | `planned` | Each row names contract/version, owner, stable selectors, layer, platforms/toolchains, transitive inputs, acceptance/release role, and replacement dependencies; unknown fields and duplicate ownership fail. |
| 5 | register_existing_surfaces | Register existing Relay A01–A29 inventory, omitted Rust targets, unit-test policy, JavaScript semantic labels, and exact release-evidence exclusions without deleting tests. | `plugins/session-relay/test/fixtures/rust-test-inventory.json`; `plugins/session-relay/test/rust-test-inventory.mjs`; `plugins/session-relay/test/selftest.mjs`; `scripts/config/test-contracts.json` | 4 | `local` | `planned` | Discovery proves `discovered = registered`, nonzero `selected = expected`, and `executed = selected`; every skip, ignore, or filter has owner, reason, and expiry; frozen release contracts remain non-selectable. |
| 6 | integrate_authoritative_gate | Run timing and contract validation through the current CI composition while preserving all existing full and targeted gates. | `package.json`; `scripts/ci.mjs`; `scripts/tests/ci-observability.mjs`; `scripts/tests/test-contracts.mjs`; `scripts/tests/ci-plugin-targeting.mjs` | 3, 5 | `local` | `planned` | Focused tests, the CI targeting contract, and the unchanged full gate pass; no PR, tag, manual, platform, checksum, attestation, or publication prerequisite is weakened. |

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
- Do not delete, merge, retry-mask, skip, or narrow any current test or release-evidence contract, with exactly one bounded replacement: the validate workflow may publish its own timing artifact, and the CI targeting contract replaces its blanket upload ban with a rule that allows that single named timing artifact and rejects every other upload and any `contents: write` permission.
- Do not add SQLite-, Relay-vNext-, planctl-, or optional Relay-review tests before those protocols exist.
- Do not use coverage or mutation score as a universal gate.

## STOP conditions

1. Timing evidence cannot distinguish child exit from await/finalization or cannot reconstruct observed wall time.
2. Automatic discovery cannot map every current acceptance owner and semantic label without silently dropping a contract.
3. Any release producer can publish an asset whose exact digest did not pass its same-run platform and evidence checks, or the validate workflow gains an upload beyond the single named timing artifact or any `contents: write` permission.
4. Any selector can pass after selecting zero tests, or an ignored/filtered test lacks an owner and expiry.
5. Full CI or a currently authoritative targeted plugin gate regresses.

## Open questions

None. Bazel remains rejected until a separate evidence-gated pilot satisfies the measured thresholds recorded in this plan’s context and conclusions. Two predecessors under-declared the workflow blast radius. The first omitted `scripts/tests/ci-plugin-targeting.mjs`. The second still omitted the Session Relay source-CI job model in `scripts/lib/session-relay-release-preparation.mjs` and its fixture in `plugins/session-relay/test/release-evidence-contract.mjs`, which the Relay plugin gate proved by rejecting the changed workflow. This successor owns all three. Its blanket upload ban is replaced, not removed: the successor rule admits exactly one named timing artifact per lane and still rejects every other upload and any `contents: write` permission, so validate stays a read-only gate.

## Review

Plan-attempt-history: {"authorization_source_sha256":"896b5a45804a4f2f18d7c49189e50a0413f497c7169a7ccb1581dbb7dfffa2d7","plan_bytes_sha256":"a94b73db4df681371f627ed699fd8b82fb986fb5ec46d7c8f113234e76fc8be3","replacement_run_id":"01d4c7d0-1bca-4fb3-ae61-9f6fc89f9f17","run":{"acceptance":null,"blocker":{"evidence_sha256":"ec0d6ad6cb489f59d2f67cc1e17b094294590c2ca4caefaf8ee0d259e649bc63","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"429729c55c63bf10c16ba135de8fa5a761469602331e2871dfd2e259d989bea1","invocations":1,"result_sha256":"56a2788a9a5ba24ab2e9e51dc774d758f6c77d81d0a116903086c93336e9f48d","state":"passed"},"execution_parent":null,"goal_id":"213aef20-2306-4f43-bcb2-80f7591665e9","implementation_commit":null,"plan_path":"docs/plans/active/ci-observability-and-test-contracts.md","plan_sha256":"ea72392d52b2905318fd2abc8435e0818ab39ea3d664a6a50a1937d906e153be","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"bd2d28c3-5b5c-4c4b-bbe3-8427aa1f260a","schema":1,"source_base":"672246bd388d3f34475be70857e3ec0dcb222b23","source_sha256":"3711a030437cb98b6a98e2ae783934cfccb987fd8e980e9e0284b49f6d554c93"},"schema":1,"status":"blocked","successor_run_sha256":"13d83aecc437b1380122a594190cdc94ba390f901cde853ecabcf035a9b617f9"}

Plan-attempt-history: {"authorization_source_sha256":"896b5a45804a4f2f18d7c49189e50a0413f497c7169a7ccb1581dbb7dfffa2d7","plan_bytes_sha256":"dd2e80233a2a96dd8c3012c4968555b99b2eb82dc4e009934a118f2f1f24b82d","replacement_run_id":"c7eb2a1a-4736-43ee-a57c-0841cbcafadf","run":{"acceptance":null,"blocker":{"evidence_sha256":"6ba0e99013c9334ffe372704d068470b0e77ba23387c552cdde52b68203137ec","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":["v1_contract_contradiction"],"input_sha256":"055648447f148c4d58236b977488d62ddf3de09d1d2a9fd9fbaba36947ea0b4e","invocations":2,"result_sha256":"0316ae9f6e322e7ebcb2d6b7d220fb9e66498cd3121b8d886f462301d23d3e4e","state":"passed"},"execution_parent":"535ad4f8232ee7aeb345c2531ea67f7d41ff8884","goal_id":"213aef20-2306-4f43-bcb2-80f7591665e9","implementation_commit":null,"plan_path":"docs/plans/active/ci-observability-and-test-contracts.md","plan_sha256":"a9c94636f0dc96845bec0ad45060bdcf77e78d61708719342b3c60745381b7d5","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"01d4c7d0-1bca-4fb3-ae61-9f6fc89f9f17","schema":1,"source_base":"535ad4f8232ee7aeb345c2531ea67f7d41ff8884","source_sha256":"97b673f9bc6a5c1f5a81f7b6763dc0a0384987f59bcf4c0662efc54be498ba99"},"schema":1,"status":"blocked","successor_run_sha256":"52062d1856de53588e37e99e6516c4d8676371e7629e5c9b60c825b7449298f4"}

The first predecessor passed draft review but omitted the CI targeting contract from its owned paths. The second passed review with that path added, started implementation, and was blocked when the Session Relay plugin gate rejected the changed workflow: the source-CI job model and its fixture anchors are owned by two further files. This successor owns the complete workflow blast radius.

## Verification Results

N/A — implementation and acceptance have not run.
