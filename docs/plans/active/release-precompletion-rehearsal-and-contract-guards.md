---
title: Require pre-completion release rehearsals and contract-preservation checks
goal: Add durable, positively tested planning rules that move available live read-only release checks before completion review, preserve closed schemas unless a plan explicitly changes them, and keep every release identity role distinct.
status: planned
created: "2026-08-04T03:42:06-03:00"
updated: "2026-08-04T06:50:24.392+00:00"
started_at: null
finished_at: null
assignee: null
tags: [plans, plan-lifecycle, release-safety, contract-preservation]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md
  - plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md
  - plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md
  - scripts/tests/plan-skill-phases.mjs
related_plans:
  - docs/plans/active/session-relay-0.16.0-release.md
---

# Require pre-completion release rehearsals and contract-preservation checks

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"c964bdc9a2573298c4fe6cffba7a21e06fc3d953dbdabca87322d44c3b97aede","invocations":1,"result_sha256":"23aee97e6efd35f38f6ed44e338dc06b1b5dfe744563e3e32e690fa21d4aaeda","state":"passed"},"execution_parent":null,"goal_id":"08c02047-0941-4a0f-9d9a-2d9f12a08c58","implementation_commit":null,"plan_path":"docs/plans/active/release-precompletion-rehearsal-and-contract-guards.md","plan_sha256":"d7a2b7c3b2f678a78308b3a12f36717e86db142de7e9ce5acc4b78d429ded024","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"fe1da33a-65e8-4a60-9b5c-afdefb2f7667","schema":1,"source_base":"ae9a7a977c785ad3b8462df0f3a12ad152fb9c1c","source_sha256":"c43f7df36436cd5cb30002686e4d6a88c528d7f1172606501a8673759c878843"}

## Goal

Make late release blockers visible before completion review whenever the repository already has a read-only live verification path. Make plan authors and reviewers preserve closed schemas and state every release identity relation explicitly.

## Why this plan exists

The Session Relay 0.16.0 lane exposed four reusable failures:

1. A canonical child used valid RFC 3339 UTC as `+00:00`, while a live verifier accepted only `Z`.
2. A source-identity repair added a required field to a closed Version 3 receipt although the plan excluded schema changes.
3. Completion review passed before the final live read-only child verification exercised canonical public data.
4. The release source, plan source, execution parent, implementation commit, and tag commit were repeatedly easy to conflate.

The durable response belongs in the canonical plan skills and their positive tests. It does not belong in another release-specific workaround.

## Required contract {mechanism}

### Available read-only boundary rehearsal

For a plan that will mutate an external release boundary, the plan must place every available live read-only final-boundary check before completion-review reservation. The check must use the exact canonical identities and data spellings that the later mutation consumes.

“Available” means the repository already provides a read-only command or adapter path that can exercise the boundary without the pending mutation. This rule must not invent a network call, weaken external authority, or require a probe where no such path exists. If an available check needs probe authority and that authority is absent, the plan blocks before completion review instead of reviewing unexercised release assumptions.

### Closed-schema preservation

When affected code validates or emits a closed object, the plan must state whether the object shape is preserved or intentionally changed. A preserved shape needs an exact-key compatibility fixture. An intentional change must be in scope and must include migration, versioning, and historical-reader acceptance. A changed closed shape under an out-of-scope schema ban is a review blocker.

### Release identity matrix

A release plan with multiple commit identities must name each role, its producer, its consumers, and every required equality, distinction, or ancestry edge. At minimum, when present, this includes:

| Role | Meaning |
|---|---|
| release source | Immutable source that produced the staged tag and assets. |
| plan source | Source base of the current PlanRun. |
| execution parent | Commit from which current implementation execution began. |
| implementation commit | Exact reviewed implementation checkpoint. |
| tag commit | Commit resolved by the immutable release tag. |

A reviewer must reject an unstated equality, a contradictory role pin, or a later successor that keeps current-run fixtures bound to its predecessor.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | pin_missing_rules | Add failing positive assertions. | `scripts/tests/plan-skill-phases.mjs` | — | `local` | `planned` | The bounded-workflow case fails with a specific missing-clause error for early live rehearsal, closed-schema disposition, and explicit release identity roles; unrelated assertions stay green. |
| 2 | specify_manager_boundary | Define the manager boundary rule. | `plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md` | 1 | `local` | `planned` | The manager requires available read-only final-boundary checks before completion review, including canonical inputs and missing probe authority, but neither authorizes effects nor mandates a nonexistent check. |
| 3 | specify_reviewer_contracts | Define reviewer contract checks. | `plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md` | 1 | `local` | `planned` | Review guidance names reproducible blockers for out-of-scope schema drift, noncanonical live fixtures, conflated identity roles, and predecessor current-run pins. |
| 4 | sync_workspace_contract | Synchronize workspace policy. | `plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md`; `docs/plans/AGENTS.md` | 2, 3 | `local` | `planned` | The source template and generated policy carry the same concise rules; existing generation checks pass. |
| 5 | prove_rules_bite | Prove the rules and assertions. | all affected paths in frontmatter | 4 | `local` | `planned` | A1-A4 pass. Each one-clause mutation fails the named assertion and restoration returns green. Any weakened assertion or schema change is STOP. |
| 6 | checkpoint_and_archive | Review and archive implementation. | all affected paths in frontmatter | 5 | `local` | `planned` | The implementation commit and exact diff pass CompletionReviewV1; the final archive is valid and the active path is absent. |

## Acceptance

| ID | Command | Expected result |
|---|---|---|
| A1 | `node scripts/tests/plan-skill-phases.mjs --case bounded-workflows` | Exit 0; positive assertions pin pre-completion live rehearsal ordering, missing-authority behavior, closed-schema disposition, and explicit identity roles. |
| A2 | `node scripts/tests/plan-skill-phases.mjs --case plan-workspace-template` | Exit 0; the repository plan policy and source template remain synchronized. |
| A3 | `node scripts/skills/guard.mjs plugins/plan-lifecycle/skills/productivity/plan-manager && node scripts/skills/guard.mjs plugins/plan-lifecycle/skills/productivity/plan-reviewer` | Exit 0; both canonical skills satisfy structure, frontmatter, and size rules. |
| A4 | `node scripts/ci.mjs --plugin plan-lifecycle` | Exit 0; the complete authoritative plugin gate passes. |

## Protected scope

- Keep PlanRunV1, review result, completion review, affected-path manifest, and every release receipt schema byte-shape compatible.
- Preserve the closed two-permit review budget and the reserve-before-launch protocol.
- Preserve literal ExternalAuthorityV1 checks. Planning prose and read-only rehearsal intent never grant probe or mutation authority.
- Keep reviewer wrappers thin. Canonical behavior stays in the skills.
- Keep `docs/plans/AGENTS.md` synchronized with its source template.

## Out of scope / do-NOT-touch

- Session Relay release implementation or the blocked 0.16.0 plan.
- A new PlanRun field, receipt field, review verdict, lifecycle state, effect, or risk class.
- A mandatory network call for plans that have no existing read-only boundary path.
- Retrospective edits to finished plans or historical receipts.
- Automatic probe, push, publish, release, or deployment authority.
- Generic release orchestration or a new reusable framework.

## STOP conditions

1. The rule cannot distinguish an available read-only check from a nonexistent one without adding a new schema or runtime registry.
2. Any change broadens external authority or treats a planned probe as live authority.
3. Any PlanRun, review, manifest, or release receipt key changes.
4. The reviewer rule requires access outside its immutable read-only bundle.
5. The workspace template and generated policy cannot remain byte-aligned.
6. Focused tests can pass after removing the matching normative clause.
7. The change requires Session Relay release code or edits to the blocked release plan.

## Review

N/A - manager-written after review.

## Verification Results

N/A - manager-written after execution.
