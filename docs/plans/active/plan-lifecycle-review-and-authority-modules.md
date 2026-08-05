---
title: Consolidate Plan Lifecycle authority and bound reviews
goal: Consolidate current PlanRun authority, freeze historical readers, move deterministic checks before review, and allow only one repair plus mandatory verification.
plan_hash_mode: status-excluded-v1
status: planned
created: "2026-08-05T03:40:58.144Z"
updated: "2026-08-05T03:50:22.216+00:00"
started_at: null
finished_at: null
assignee: null
tags: [plan-lifecycle, review, authority, refactor]
affected_paths:
  - .codex/agents/plan-reviewer.toml
  - AGENTS.md
  - docs/plans/AGENTS.md
  - plugins/plan-lifecycle/agents/plan-reviewer.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/references/planrunv1-schema.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/legacy-review-records.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/current-codec.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/git-preimage.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/historical-adapter.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/live-review-records.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/plan-state.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/transaction.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md
  - plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md
  - plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md
  - plugins/plan-lifecycle/test/selftest.mjs
  - scripts/AGENTS.md
  - scripts/tests/plan-orchestration.mjs
  - scripts/tests/plan-skill-phases.mjs
  - scripts/tests/plan-orchestration/historical-characterization.mjs
  - scripts/tests/plan-orchestration/review-budget.mjs
  - scripts/tests/plan-orchestration/state-matrix.mjs
related_plans:
  - docs/plans/active/ci-observability-and-test-contracts.md
---

# Consolidate Plan Lifecycle authority and bound reviews

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"ad499dab126c39ca5969494cd2fa5d9dad6a502d3c4657bcd5438304a3bc40d5","invocations":1,"result_sha256":"654e7d293ee0a07a2407232695262809dd0dddb06841539532d35e08de9bd819","state":"passed"},"execution_parent":null,"goal_id":"248e3f50-2528-4dd3-b92c-d0373f702d65","implementation_commit":null,"plan_path":"docs/plans/active/plan-lifecycle-review-and-authority-modules.md","plan_sha256":"489b1c50d933843c0314eb3989a6c95066b866c11ea1ee9acf163ef7993f830e","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"2ac1d5f2-4bf1-4185-a911-7d087c357a42","schema":1,"source_base":"672246bd388d3f34475be70857e3ec0dcb222b23","source_sha256":"9535302dca0e75019ab39b611cc3a1290eb9c7b52aecc435fef30f9a89ba9a59"}

## Goal

Reduce Plan Lifecycle review time and state-machine drift without a Rust rewrite: one current Node authority, one frozen historical adapter, deterministic pre-permit checks, one substantive repair followed by mandatory fresh verification, and a direct transport controller that remains independent of Session Relay.

## Context & rationale

Historical plans show review work taking roughly 32 minutes, 1h19m, 1h53m, and 10h25m. Most findings were real, including repair-introduced defects, path identity errors, dead fixtures, scope omissions, and invalid evidence handling. The problem is renewable and mechanically repetitive review, not review itself. Current PlanRun state, validation, reducer, and persisted-edge rules are repeated within one large module; live and historical review families share codecs and ambient drift modes. No measured Node transaction bottleneck, correctness failure, or non-Node consumer justifies a Rust CLI now. A clean initial review may pass; any accepted repair must receive one fresh verification because historical second passes caught real defects.

## Environment & how-to-run

Run from the repository root with Node 24 and the installed Plan Lifecycle plugin machinery. Keep canonical Markdown, Git checkpoints, filesystem CAS, private reviewer bundles, and direct `omp|claude|codex` subprocess transport. Update every contract copy named by the plan-lifecycle authoring rules in one cutover.

## Current authority and bounded review {mechanism}

One current PlanRun state Module owns the closed status and review-state vocabularies, tuple validity, substantive permit count, transport refund, reducer transitions, and persisted-edge legality. Separate Modules own current codecs, Git/source preimages, filesystem locks and compare-and-swap transactions, live review records, and read-only historical adaptation. Policy calls mechanics with already-authorized successor bytes; mechanics never decide lifecycle transitions.

Before any permit reservation, deterministic checks validate syntax, paths, manifests, step references, fixture registration, and bundle bindings. The reviewer receives one sealed bundle for judgment-only checks. A clean first result can pass. An accepted repair installs exact candidate bytes, then requires one fresh sealed-bundle verification. Any finding after that verification records terminal evidence and requires a new user-authorized successor rather than another automatic repair.

Review transport remains a direct subprocess Adapter. Reserve, dispatch, complete stdout capture, schema validation, result binding, and settle occur in one crash-aware controller. A transport-only failure can refund according to the closed state machine. Session Relay may carry an optional reference later, but no Relay row or receipt can become plan authority or review evidence.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | freeze_historical_corpus | Inventory every supported historical family and drift exception with immutable input bytes and expected codec, hash, classification, and validation outcomes. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/legacy-review-records.mjs`; `scripts/tests/plan-orchestration/historical-characterization.mjs`; `scripts/tests/plan-orchestration.mjs` | — | `local` | `planned` | Schemas 1–6 and the five known drifted records have explicit golden outcomes; any byte/hash/classification delta fails before module extraction. |
| 2 | consolidate_current_state | Create one current PlanRun state Module that owns state names, phase ceilings, reducer edges, persisted transition legality, and tuple validation. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/plan-state.mjs`; `scripts/tests/plan-orchestration/state-matrix.mjs`; `scripts/tests/plan-orchestration/review-budget.mjs` | 1 | `local` | `planned` | One exported authority decides current transitions and persistence edges; deletion or mutation of an edge is detected in one state-matrix suite; no second live transition table remains. |
| 3 | version_codecs_and_history | Extract shared byte/frontmatter scanning, explicit current codec, live review records, and a closed read-only historical adapter with no ambient classification mode. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/legacy-review-records.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/current-codec.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/historical-adapter.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/live-review-records.mjs` | 1, 2 | `local` | `planned` | Current validation is context-free; historical drift exceptions are reachable only through the adapter; finished bytes are never rewritten; golden corpus output is identical. |
| 4 | extract_transaction_mechanics | Separate Git preimages, affected manifests, lock/CAS/fsync/readback, and immutable bundle mechanics from lifecycle policy and reviewer subprocess control. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/git-preimage.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/transaction.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs` | 2, 3 | `local` | `planned` | Mechanics accept already-authorized successor bytes and return evidence; policy owns when and why; exact locks, preimages, fsync, atomic rename, readback, and private raw output remain unchanged. |
| 5 | frontload_deterministic_checks | Move every script-decidable schema, path, step-reference, manifest, fixture-registration, and bundle-binding property before permit reservation and remove it from model prompts. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs`; `scripts/tests/plan-orchestration.mjs`; `plugins/plan-lifecycle/test/selftest.mjs` | 2, 3, 4 | `local` | `planned` | Known path, dead-fixture, record-placement, scope, and binding defects fail deterministically before reserve; reviewer input contains only judgment work and a sealed bundle reference. |
| 6 | bound_repair_verification | Replace the renewable draft class budget with one comprehensive review and, only after an accepted repair, one mandatory fresh sealed-bundle verification; preserve transport refunds. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/runtime/plan-state.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/references/planrunv1-schema.md`; `scripts/tests/plan-orchestration/review-budget.mjs`; `scripts/tests/plan-orchestration/state-matrix.mjs` | 5 | `local` | `planned` | A clean first pass plans; an accepted repair consumes one fresh verification; any repeated or new finding after repair terminally records evidence and requires a successor; transport failure refunds without spending either substantive invocation. |
| 7 | keep_direct_transport | Keep direct reviewer subprocess dispatch normative and formalize a transport Adapter contract without adding a Relay dependency. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md`; `plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md`; `plugins/plan-lifecycle/agents/plan-reviewer.md`; `.codex/agents/plan-reviewer.toml` | 4, 5, 6 | `local` | `planned` | Reserve→dispatch→capture→validate→settle works without Relay; raw output is persisted and re-read; no transport status can mutate PlanRun without validated bound bytes. |
| 8 | synchronize_public_contract | Update the three skills, workspace template, repository plan contract, wrappers, root routing, and validators as one byte-consistent review-budget cutover. | `AGENTS.md`; `docs/plans/AGENTS.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md`; `plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md`; `plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md`; `plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md`; `plugins/plan-lifecycle/agents/plan-reviewer.md`; `.codex/agents/plan-reviewer.toml`; `scripts/AGENTS.md`; `scripts/tests/plan-skill-phases.mjs` | 6, 7 | `local` | `planned` | Every normative copy states one initial review plus one repair verification, transport-only retry, historical isolation, and direct transport; validators fail on any copy drift. |
| 9 | prove_plan_lifecycle | Run historical, current-state, dispatch, self-check, wrapper, plugin, and full shared-tooling gates against the final bytes. | all affected paths in frontmatter | 8 | `local` | `planned` | All named acceptance commands pass; a golden historical delta, duplicate live authority, unverified repair, dead fixture, or hidden Relay dependency makes its owner test fail. |

## Acceptance criteria

| ID | Command | Expected result |
|---|---|---|
| A1 | `node scripts/tests/plan-orchestration.mjs --case historical` | Exit 0; every supported historical family and drift exception retains exact codec, hash, classification, and validation outcomes. |
| A2 | `node scripts/tests/plan-orchestration.mjs --case review-budget` | Exit 0; clean pass, one repair plus mandatory verification, repeated/new post-repair findings, and transport refunds follow the new closed state matrix. |
| A3 | `node scripts/tests/plan-orchestration.mjs --case plan-self-check && node scripts/tests/plan-orchestration.mjs --case dispatch-driver` | Exit 0; deterministic properties fail before reserve, judgment-only bundles remain private, direct dispatch captures complete raw output, and no Relay dependency exists. |
| A4 | `node scripts/tests/plan-skill-phases.mjs --case bounded-workflows && node plugins/plan-lifecycle/test/selftest.mjs` | Exit 0; all skill/template/wrapper copies and shipped PlanRun machinery agree on the closed review and historical contracts. |
| A5 | `node scripts/ci.mjs` | Exit 0; repository-wide plan tooling, all four plugins, format, lint, and routing contracts pass after the public-contract cutover. |

## Out of scope / do-NOT-touch

- Do not implement or distribute a Rust `planctl` CLI in this plan.
- Do not add a Session Relay dependency or accept Relay state as review evidence.
- Do not rewrite, auto-canonicalize, or delete finished historical plan bytes.
- Do not remove fresh verification after any accepted repair.
- Do not relax filesystem lock, CAS, fsync, atomic rename, Git preimage, authority, or private-output guarantees.
- Do not add review scores, finding quotas, automatic provider fallbacks, or renewable successor loops.

## STOP conditions

1. The historical golden corpus is incomplete or any supported byte/hash/classification outcome changes.
2. More than one current Module can authorize the same PlanRun transition or persisted edge.
3. A script-decidable defect can still spend a reviewer permit or a model check duplicates deterministic output.
4. An accepted repair can pass without a fresh sealed-bundle verification or a post-repair finding can renew automatically.
5. Direct subprocess review fails when Relay is unavailable or any unvalidated transport status can settle PlanRun.
6. Full CI fails after focused plan-lifecycle checks pass.

## Open questions

None. Rust remains a future pilot only after a reproducible Node contention/correctness defect or committed non-Node consumer; any optional Relay transport requires a separate plan after Relay vNext.

## Review

N/A — manager-written after draft review.

## Verification Results

N/A — plan-only request; implementation and acceptance have not run.
