---
title: Classify schema-6-declared records carrying the schema-5 policy shape
goal: Stop quarantining five plan records whose only defect is reviewer-selection metadata that drifted, by narrowing the classification path alone and leaving receipt validation globally unchanged.
status: drafting
created: "2026-07-28T04:10:00-03:00"
updated: "2026-07-28T04:06:23-03:00"
started_at: null
finished_at: null
assignee: null
tags: [plans, plan-manager, legacy, classification, quarantine]
affected_paths:
  - plugins/docks/skills/productivity/plan-manager/scripts/legacy-review-records.mjs
  - plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs
  - scripts/tests/plan-orchestration/fixtures/legacy-plans.mjs
  - scripts/tests/plan-orchestration/legacy-quarantine.mjs
related_plans: []
---

# Classify schema-6-declared records carrying the schema-5 policy shape

## Goal

Five plan records stop classifying as `legacy-quarantined`. Receipt validation
is byte-for-byte unchanged for every caller, so the release binder still rejects
legacy schema-6 receipts exactly as it does today.

## Context & rationale

`validateCurrentPolicy` (`legacy-review-records.mjs`) enforces three rules for a
policy declaring `schema: 6`: `fallback` must be `none`, there must be exactly
one runtime candidate, and `provenance.candidates` must be `runtime_global`.
Five records on disk declare schema 6 while carrying the schema-5 shape —
`fallback: "availability_only"`, three ordered candidates, and
`provenance.candidates: "skill_default"` — verified directly on
`session-relay-linux-workspace-release.md`. All three diverge, so narrowing any
two changes nothing.

Those fields select **which reviewer model would have been used**. They say
nothing about whether work ran or an effect fired, so quarantining on them is
metadata drift, not evidence of a problem.

**Measured effect, enumerated.** Exactly five records currently fail with
`schema-6 current policy fallback must be none` and would change classification:

- `docs/plans/active/plan-review-controller-failure-recovery.md`
- `docs/plans/active/session-relay-linux-workspace-release.md`
- `docs/plans/finished/2026-07-19-session-relay-prebuilt-cli-release.md`
- `docs/plans/finished/2026-07-22-session-relay-workspace-isolation.md`
- `docs/plans/finished/2026-07-23-session-relay-linux-workspace-recertification.md`

Nothing else moves. Of the 32 currently quarantined records, 22 fail on an
unrelated frontmatter-scalar parse error and 5 on other family defects; those
are out of scope.

**Why this is deliberately not implemented in `validateCurrentPolicy`.** That
function is reached by two callers with different jobs. `classifyLegacyPlan`
uses it to decide whether a *plan record* is quarantined. `validateDraftReceipt`
uses it to decide whether a *receipt* is acceptable evidence, and
`scripts/lib/session-relay-release-preparation.mjs` imports that for release
binding. The active plan `session-relay-linux-workspace-publication.md` states
the constraint explicitly: recognition of this legacy shape must be
"binder-local and exact-artifact-only", and "current schema-6 emission and
validation remain globally `fallback:"none"`". Relaxing the shared validator
would violate that. Narrowing classification does not, because classification
answers a different question than acceptance — and this plan proves that
separation with a test rather than asserting it.

**This reclassification unlocks migration, and that is intended.**
`classifyLegacyPlan` gates `migrateLegacyPlan`, so the five records become
migration-eligible. The user authorized that consequence explicitly. This plan
does not migrate any record; it only changes classification.

## Environment & how-to-run

Repository `/home/vagrant/projects/docks` at `13d293d`. Node 24, dependencies
already provisioned.

Focused suite: `node scripts/tests/plan-orchestration.mjs`.
Authoritative gate: `node scripts/ci.mjs --plugin docks` (Node-only).

`scripts/` inside a skill is not covered by `content-hash.mjs` (verified
empirically: touching `plan-run.mjs` alone leaves `--check-only` green), so no
`SKILL.md` refresh is coupled to this work.

**Host constraint.** Do not run the full `node scripts/ci.mjs`, and do not run
concurrent Rust builds or synthetic CPU load. This host locked up under a
concurrent gate run on 2026-07-27 and lost uncommitted work.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Thread an explicit classification-only option from `classifyLegacyPlan` down to `validateCurrentPolicy`, so a policy declaring `schema: 6` that carries the complete schema-5 shape — `fallback: "availability_only"` AND three ordered candidates AND `provenance.candidates: "skill_default"` — is accepted for classification. A partial match keeps today's rejection. Default the option off, so every other caller including `validateDraftReceipt` is byte-for-byte unchanged | `plugins/docks/skills/productivity/plan-manager/scripts/legacy-review-records.mjs`, `plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs` | — | `local` | `planned` | A1, A2 and A3 pass. If the option cannot be threaded without altering the default path, STOP rather than relaxing the shared rule |
| 2 | Add a positive fixture carrying the complete schema-5 shape under a schema-6 declaration, asserted to classify as settled rather than `legacy-quarantined`; a partial-shape fixture asserted to stay quarantined; and a genuine schema-6 policy asserted to still fail `validateCurrentPolicy` for its non-classification callers | `scripts/tests/plan-orchestration/fixtures/legacy-plans.mjs`, `scripts/tests/plan-orchestration/legacy-quarantine.mjs` | 1 | `local` | `planned` | A1 and A4 pass. A negative-only test set is vacuous and trips STOP condition 2 |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-orchestration.mjs` | Exit 0, all cases pass, count ≥ 98 |
| A2 | Read-only script classifying every `docs/plans/{active,finished}/*.md` before and after | Exactly the five records enumerated in Context change from `legacy-quarantined` to settled; the other 27 quarantined records are unchanged; no plan file is modified |
| A3 | Read-only script calling `validateDraftReceipt` on the companion `Review-receipt` in `docs/plans/active/session-relay-linux-workspace-publication.md` | Still rejects, with the same error as before the change — proves receipt acceptance was not widened and the binder-local constraint holds |
| A4 | Remove the narrowing branch, run A1, restore | Mutated run exits non-zero naming the new positive classification case; restored is byte-identical and exits 0 |
| A5 | `node scripts/ci.mjs --plugin docks` | Exit 0 |

## Out of scope / do-NOT-touch

- Migrating, resuming, repairing or finishing any reclassified record. This plan
  changes classification only; the five become migration-eligible and none is
  migrated here.
- `scripts/lib/session-relay-release-preparation.mjs` and its binder-local
  exact-artifact recognition. A3 exists to prove it is untouched.
- The 22 records failing on `unsupported frontmatter scalar` and the 5 failing
  on other family defects.
- Any change to `validateCurrentPolicy`'s default behaviour.

## STOP conditions

- The narrowing cannot be threaded without changing the default path, i.e. any
  caller other than classification observes different behaviour.
- A3 shows receipt validation newly accepting anything it previously rejected.
- A2's measured delta is not exactly the five enumerated records.
- A4 passes while mutated, meaning the positive case does not bind.
- Any plan record's bytes change.

## Open questions

None. The migration-unlock consequence is authorized, and the layering
constraint is settled by the publication plan's binder-local requirement.

## Review

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"4640a1c509a73c3fae2e54cdf3e31cfc772702cab732cbd4b3d0da01bb42821e","invocations":1,"result_sha256":"6a19ed6265f11d1728a88d85df43d1b1a8a5b91309d4b9c137b98b567fc7277a","state":"repairing"},"execution_parent":null,"goal_id":"0824417a-f37d-4260-a823-b1ed4fbd54ee","implementation_commit":null,"plan_path":"docs/plans/active/legacy-schema6-policy-classification.md","plan_sha256":"77c94942098f85c393e7b353fb7158b359f0ae16d0a2f3a67069c57b1ac1bd0a","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"296a6721-08c5-4fb5-a2c9-a19d68c39c0a","schema":1,"source_base":"13d293dca8d686530f825062712b31aabd0f33fd","source_sha256":"622d4de3bb1956c0187848de873b6351c9cbdaaf3ee689377f7fa77115e6fd73"}

## Verification Results
