---
title: Add rebuildable Plan Lifecycle history navigation
goal: Add a disposable digest-bound history index and exact-source navigation without making derived data lifecycle, review, or effect authority.
plan_hash_mode: status-excluded-v1
status: planned
created: "2026-08-05T04:41:00.098Z"
updated: "2026-08-05T04:56:14.583+00:00"
started_at: null
finished_at: null
assignee: null
tags: [plans, plan-lifecycle, history, navigation, index]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/references/planhistoryviewv1-schema.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-history.mjs
  - plugins/plan-lifecycle/test/selftest.mjs
  - scripts/AGENTS.md
  - scripts/tests/plan-history.mjs
  - scripts/tests/plan-skill-phases.mjs
related_plans:
  - docs/plans/active/plan-lifecycle-review-and-authority-modules.md
  - docs/plans/active/plan-lifecycle-review-dispatch-performance.md
  - docs/plans/active/plan-execution-queue-contract.md
---

# Add rebuildable Plan Lifecycle history navigation

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":["v1_acceptance_coverage_incomplete","v1_acceptance_output_mismatch"],"input_sha256":"f582d391a886554c675f33dc7e665d2acd5f0638c2eebed5381f01d1413b9422","invocations":2,"result_sha256":"64fb876e5fa1d712efd75d0290f1f997508984590cde6f79006941572d0d5c75","state":"passed"},"execution_parent":null,"goal_id":"ed7622b8-ecca-4024-b732-d7dc0f2ad0a4","implementation_commit":null,"plan_path":"docs/plans/active/plan-lifecycle-derived-history-navigation.md","plan_sha256":"f84d11ad9e594f424f7b46ea69679c6e95750d348920218bdf054c087c0466ef","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"0e7867ea-a7c2-4621-a198-a21b1668d163","schema":1,"source_base":"f49c2852cb60e7741a354ef5c610486345b1796f","source_sha256":"0c3aa25e45ac072f4725995696a26f1f397e1f29ce42cd3480e7f3935ece3741"}

## Goal

Add optional read-only history navigation for active and finished canonical plans through a disposable deterministic index that always verifies and returns exact source bytes, while Markdown, PlanRun, attempt history, review evidence, and acceptance remain the only authority.

## Context & rationale

Plan Lifecycle already preserves immutable finished plans and append-only Plan-attempt-history, but it has no bounded history-navigation surface. The useful OptMem concept is separation, not implementation: a lossless source remains authoritative while a derived tree or index can be deleted and rebuilt. This plugin should apply that principle with its existing Node runtime and repository-scoped records. It must not copy OptMem code, adopt its fixed-width file format, share Relay SQLite, or generate model summaries.

## Environment & how-to-run

Run from the repository root with Node 24. Implement after the Plan Lifecycle authority-module, review-dispatch performance, and PlanQueueV1 plans finish. Store derived bytes under the repository Git directory at .git/docks-history/ with mode 0700 directories and mode 0600 files. Workspaces without this directory remain fully functional. Never edit active or finished plan bytes during build, check, query, deletion, or rebuild.

## PlanHistoryViewV1 contract {mechanism}

PlanHistoryViewV1 is compact JCS with no creation timestamp. It binds repository identity, generator/schema version, and a sorted source manifest for every canonical active and finished PlanRun: repository-relative path, file SHA-256, goal_id, run_id, status, title, tags, and exact heading byte ranges. Build scans frontmatter first, applies target-local legacy quarantine, validates each current PlanRun through the canonical parser, and writes one index by create-new temporary file, fsync, atomic rename, directory fsync, and readback. Unchanged source bytes produce byte-identical index bytes. Delete and rebuild are always safe.

The plan-history command exposes build, check, list, search, and show. Check compares the full live source manifest and refuses missing, added, moved, modified, malformed, or ambiguous records. List and search return only deterministic metadata plus source locators. Show reopens the named source, verifies its path and digest, and returns exact requested source sections under a caller-supplied byte budget; truncation is explicit and never presented as complete. No operation writes a plan, dispatches a reviewer, reserves a permit, changes lifecycle state, selects a queue entry, or grants an effect.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | define_history_view_schema | Define PlanHistoryViewV1 source manifest, stable sorting, range validation, storage permissions, and non-authority rules. | `plugins/plan-lifecycle/skills/productivity/plan-manager/references/planhistoryviewv1-schema.md`; `docs/plans/AGENTS.md` | — | `local` | `planned` | The schema has one closed spelling, binds every indexed source digest and identity, contains no volatile timestamp or model summary, and permits complete deletion. |
| 2 | implement_history_build_check | Implement deterministic build and strict stale-index check over active and finished canonical records. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-history.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/references/planhistoryviewv1-schema.md` | 1 | `local` | `planned` | Identical sources produce identical bytes; atomic write/readback and permissions hold; source-set, digest, identity, range, or schema drift requires explicit rebuild, while malformed canonical source makes build, check, and query fail until source correction and then rebuild. |
| 3 | implement_bounded_navigation | Add list, search, and exact-source show operations with stable ordering, explicit byte budgets, and source revalidation. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-history.mjs` | 2 | `local` | `planned` | Queries never scan outside active/finished, never return stale excerpts, identify every result by goal/run/path/digest, and label truncation without synthesizing omitted content. |
| 4 | integrate_history_manager | Teach plan-manager to build or consult the optional view only for discovery and cold-handoff navigation. | `plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md`; `docs/plans/AGENTS.md` | 2, 3 | `local` | `planned` | Missing or stale indexes fall back to canonical frontmatter-first reads; query output cannot authorize review, start, mutation, queue selection, acceptance, or effects. |
| 5 | prove_rebuild_and_non_authority | Add deterministic rebuild, delete/rebuild, stale-source, archive-move, malformed-record, bounded-output, permission, and no-plan-write tests. | `scripts/tests/plan-history.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-history.mjs` | 1, 2, 3, 4 | `local` | `planned` | Tests compare bytes across rebuilds, assert mode 0700 directories and mode 0600 files, verify explicit stale refusal, preserve every source digest, and prove no query output reaches lifecycle reducers or queue setters. |
| 6 | synchronize_history_contracts | Register the shipped helper and align plugin self-test, author rules, and plan skill contracts. | `plugins/plan-lifecycle/test/selftest.mjs`; `scripts/AGENTS.md`; `scripts/tests/plan-skill-phases.mjs` | 4, 5 | `local` | `planned` | Packaging, skill wording, schema ownership, and focused test routing agree; no Relay, SQLite, or model-summary dependency appears. |
| 7 | verify_history_navigation | Run focused history tests, lifecycle phase contracts, the selected plugin gate, and the full shared gate on final bytes. | all affected paths in frontmatter | 6 | `local` | `planned` | All acceptance commands pass; deletion and deterministic rebuild work; all active and finished source bytes remain unchanged. |

## Acceptance criteria

| ID | Command | Expected result |
|---|---|---|
| A1 | `node scripts/tests/plan-history.mjs --case deterministic-rebuild` | Exit 0; unchanged sources produce byte-identical index bytes before and after deletion, with mode 0700 directories and mode 0600 files. |
| A2 | `node scripts/tests/plan-history.mjs --case stale-and-archive` | Exit 0; source mutation, addition, removal, archive move, and schema drift refuse queries until explicit rebuild; malformed current records make build, check, and queries fail until source correction and then rebuild. |
| A3 | `node scripts/tests/plan-history.mjs --case bounded-navigation` | Exit 0; list/search ordering is stable and show returns only digest-verified exact source ranges with explicit truncation. |
| A4 | `node scripts/tests/plan-history.mjs --case non-authority` | Exit 0; build and every query preserve plan bytes and cannot call lifecycle, review, queue, or external-effect mutation surfaces. |
| A5 | `node scripts/tests/plan-skill-phases.mjs --case plan-history-view` | Exit 0; manager, workspace rules, schema, and helper agree on optional derived-only history navigation. |
| A6 | `node plugins/plan-lifecycle/test/selftest.mjs` | Exit 0; the shipped plugin contains the history helper and schema with correct permissions and no unowned runtime dependency. |
| A7 | `node scripts/ci.mjs --plugin plan-lifecycle` | Exit 0; plan-lifecycle authoring, skills, scripts, tests, manifests, and release contracts pass. |
| A8 | `node scripts/ci.mjs` | Exit 0; all shared and plugin gates pass against the same implementation bytes. |

## Out of scope / do-NOT-touch

- Do not copy OptMem code, commands, fixed-width records, installer behavior, or storage format.
- Do not add SQLite, embeddings, vector search, model summaries, a resident service, or a shared cross-plugin database.
- Do not make the index a source for PlanRun, review, acceptance, queue, authorization, or external-effect decisions.
- Do not edit, normalize, migrate, repair, archive, or delete canonical plan files while building or querying.
- Do not index unrelated repository files, review scratch bundles, raw model transcripts, or Session Relay data.
- Do not weaken legacy quarantine, active-record validation, path safety, permissions, or immutable finished history.
- Do not implement review-dispatch timing or bundle optimization in this plan.

## STOP conditions

1. An index can survive source drift without explicit stale refusal and rebuild.
2. A query returns cached prose or ranges without checking the current source digest.
3. Identical source inputs produce different index bytes.
4. Any command writes a plan or can influence lifecycle, review, queue, acceptance, authorization, or external effects.
5. The implementation couples Plan Lifecycle to Relay, SQLite, OptMem, a model provider, or an unlicensed dependency.
6. The selected plugin gate or full repository gate fails.

## Open questions

None. Use a repository-local disposable JCS index, exact source ranges, and explicit rebuild; do not introduce a second authority or a cross-plugin store.

## Review

N/A — awaiting canonical draft review.

## Verification Results

N/A — plan-only draft; implementation and acceptance have not run.
