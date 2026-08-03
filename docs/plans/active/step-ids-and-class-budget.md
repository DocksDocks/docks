---
title: Give steps stable identifiers and charge permits by defect class
goal: Make step references stable, catch decidable guard defects before review, and continue draft review only for unseen closed defect classes.
status: ongoing
created: "2026-08-01T22:11:43-03:00"
updated: "2026-08-02T23:55:38.576+00:00"
started_at: "2026-08-02T23:55:38.576+00:00"
finished_at: null
assignee: null
tags: [plans, plan-manager, plan-reviewer, review-budget, registered-idea]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-manager/references/plan-self-check-protocol.md
  - plugins/docks/skills/productivity/plan-manager/references/planrunv1-schema.md
  - plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs
  - plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs
  - plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs
  - plugins/docks/skills/productivity/plan-reviewer/SKILL.md
  - plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs
  - plugins/docks/skills/productivity/plan-workspace/SKILL.md
  - plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md
  - scripts/tests/plan-dispatch-probes.mjs
  - scripts/tests/plan-evidence-probes.mjs
  - scripts/tests/plan-orchestration.mjs
  - scripts/tests/plan-orchestration/fixtures/plan-run-v1.mjs
  - scripts/tests/plan-orchestration/mutations.mjs
  - scripts/tests/plan-orchestration/plan-self-check.mjs
  - scripts/tests/plan-orchestration/review-budget.mjs
  - scripts/tests/plan-orchestration/state-matrix.mjs
  - scripts/tests/plan-skill-phases.mjs
related_plans: []
---

# Give steps stable identifiers and charge permits by defect class

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"67dea20241cab99329f4c75f1b04c3daab06b9095aad8616bec55af72e7c08e9","invocations":1,"result_sha256":"760f7c79aa716319981f7d8fce7a4e1f92427f25960a9cc6c397e85ebf8f279d","state":"passed"},"execution_parent":"7328cb569e1f2578733a02915a1068435d437785","goal_id":"4f091bda-6643-437e-84d0-8d4ca0118bb7","implementation_commit":null,"plan_path":"docs/plans/active/step-ids-and-class-budget.md","plan_sha256":"da5f735f0337588df69c15a8fc9396e34bb7d198d87f10421a51098c14f83768","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"b6167972-c6ae-40b6-9738-849e21364b81","schema":1,"source_base":"702383f504757336ebe6c3859db70384e82a814f","source_sha256":"acab5a01791fda0b130e39b1072f2b99f020b5caec7fefccc4b741e3d737a25e"}

## Goal

A Steps row keeps the same identifier when its display number changes, mechanical
step-reference defects are rejected before review reservation, and an accepted
draft-review defect class can never consume another review round.

## Context & rationale

The current parser makes the display number carry two jobs. `enumerateUnits`
recognizes a Steps row only when cell 0 is a one-to-three-digit number
(`plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs:484-522`),
and `stepRows` repeats that numeric test
(`plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs:592-606`).
The structural parser and the ordering rule repeat the same assumption at
`plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs:801-819`
and `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs:1039-1049`.
An additive `Id` column therefore preserves the numeric first cell and the
ascending display-order check while giving guards a stable target.

The existing rules do handle numeric references, but not the defect this plan
must catch. R10 checks prose for an unknown `step N` reference
(`plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs:975-982`),
R15 inspects numeric subcommand claims in Task cells
(`plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs:1022-1038`),
and R18 validates a numeric Step column when an acceptance table has one
(`plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs:1058-1067`).
None rejects a still-valid but renumber-sensitive `step N` citation in the
`Done when / failure action` guard cell. The new rule is limited to that cell;
it does not claim numeric step references are absent elsewhere.

Draft review is currently a flat invocation budget. `ReviewPhaseV1` accepts only
zero through two invocations
(`plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs:420-470`),
reservation refuses at two and increments the count
(`plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs:958-1016`),
and a repair verdict at invocation two blocks
(`plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs:1042-1051`).
The reservation performed by
`plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs:136-176`
is the point where a permit is actually put at risk, and its transaction occurs
at `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs:364-379`.
The accepted-class sweep must therefore be verified there before bundle creation
and reservation, not merely documented or exposed as an optional self-check.

`PlanReviewV1` currently closes each finding to `id, kind, locator, defect, fix`
and accepts only `missing_decision`, `contradiction`, `unsafe_scope`, and
`missing_acceptance`
(`plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs:11-13`,
`plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs:161-220`).
It has no defect-class field. The legacy module is not a substitute vocabulary:
its `CURRENT_CRITERIA` array contains eight legacy criteria
(`plugins/docks/skills/productivity/plan-manager/scripts/legacy-review-records.mjs:1694-1705`).
The earlier draft's incident counts and cross-plan censuses are not reproducible
from the current repository, so this plan does not rely on them.

The reviewer policy module will own this closed, self-versioning class vocabulary:

| Kind | Allowed `class` values |
|---|---|
| `missing_decision` | `v1_missing_decision` |
| `contradiction` | `v1_contract_contradiction`, `v1_evidence_mismatch`, `v1_unstable_step_reference` |
| `unsafe_scope` | `v1_unauthorized_effect`, `v1_missing_safety_boundary`, `v1_affected_paths_incomplete` |
| `missing_acceptance` | `v1_acceptance_command_not_runnable`, `v1_acceptance_output_mismatch`, `v1_acceptance_coverage_incomplete`, `v1_failure_action_missing` |

Each `PlanReviewV1` finding gains exactly one `class`, validated against the row
for its coarse `kind`. The `v1_` prefix is the vocabulary version; adding or
renaming a value requires a repository contract change. The reviewer emits the
class. The manager may reproduce and accept a finding, but it never derives a
class from plan prose.

For draft review only, `ReviewPhaseV1` gains a sorted unique
`accepted_classes` set. Existing records without that optional field read as an
empty set; the next legal draft-review transition writes it. Completion review
keeps its two-invocation budget and an empty set. An accepted `repair` unions
only unseen validated classes into the set in the same transaction that enters
`repairing`. If any finding in a later result carries a class already in the
set, including a mixed seen/unseen result, the reducer immediately enters the
existing terminal `review_failed` block. A result containing only unseen
classes may enter `repairing`. Draft invocation validation is bounded by one
initial round plus the finite v1 vocabulary cardinality; transport refund and
retry semantics remain unchanged.

Before a repair reservation, `plan-self-check.mjs` will validate a closed class
sweep ledger bound to the candidate `plan_sha256`, the preceding reviewer-result
digest, every accepted class, and every enumerated Steps row, acceptance row,
named mechanism, and level-two document section. Script-decidable classes are
recomputed; other classes require a clear verdict for every enumerated unit.
Waivers and wildcard units do not clear this gate. `dispatch-review.mjs` verifies
that ledger against the exact `--body` bytes before it creates a bundle or calls
`reserve_review`; an absent, stale, incomplete, or non-clear ledger exits
nonzero with the phase and plan bytes unchanged.

## Environment & how-to-run

Run commands from the repository root. The package manager is pinned by
`package.json`. Setup mutates the local tool environment and is intentionally
kept out of acceptance:

```bash
corepack enable && pnpm install --frozen-lockfile
```

Use focused orchestration cases while implementing. The final repository gate is:

```bash
node scripts/ci.mjs --plugin docks
```

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Add an optional `Id` column after `#`, using `[a-z][a-z0-9_]{0,63}`, and parse Steps columns by header name so `#` stays numeric and `Depends` keeps its numeric semantics. Accept guard citations only as `step:<id>`; reject duplicate or unknown ids and valid-looking `step N` citations in the guard cell. Freeze the current active plan paths as the grandfather set described in D1. | `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs`, `scripts/tests/plan-orchestration/plan-self-check.mjs` | — | `local` | `planned` | Focused tests show new plans without ids fail, every frozen active plan receives only an advisory for a missing column, known ids pass, duplicate/unknown ids and numeric guard citations fail, and numeric `Depends` ordering behaves exactly as before. Failure: STOP before changing the plan contract. |
| 2 | Add the closed v1 `class` field to `PlanReviewV1`, enforce the kind-to-class mapping in reviewer output validation, and update reviewer instructions and all current review fixtures. | `plugins/docks/skills/productivity/plan-reviewer/SKILL.md`, `plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs`, `scripts/tests/plan-dispatch-probes.mjs`, `scripts/tests/plan-evidence-probes.mjs`, `scripts/tests/plan-orchestration/review-budget.mjs` | — | `local` | `planned` | Policy tests accept every declared kind/class pair and reject a missing, unknown, wrong-version, or kind-incompatible class; no manager path infers a class. Failure: STOP rather than accepting free-form reviewer output. |
| 3 | Persist sorted unique accepted draft classes, replace the draft-only flat ceiling with the finite class budget, block the first repeated or mixed repeated result, and preserve completion review's two-invocation and transport-refund behavior. Treat a missing `accepted_classes` field on an existing record as empty and emit the field on its next legal draft transition. | `plugins/docks/skills/productivity/plan-manager/references/planrunv1-schema.md`, `plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs`, `scripts/tests/plan-orchestration/fixtures/plan-run-v1.mjs`, `scripts/tests/plan-orchestration/mutations.mjs`, `scripts/tests/plan-orchestration/review-budget.mjs`, `scripts/tests/plan-orchestration/state-matrix.mjs` | 2 | `local` | `planned` | Reducer tests prove an unseen-only result reaches `repairing`, any repeated class blocks immediately, a mixed result blocks, the accepted set is present after read-back before redispatch, the finite upper bound rejects overflow, and completion/transport cases retain their current outcomes. Failure: STOP on any reset, inferred class, unbounded invocation, or completion-budget drift. |
| 4 | Extend the self-check ledger with exact accepted-class sweep coverage and enforce it in `dispatch-review.mjs` against the candidate body before bundle creation and `reserve_review`. Add a dispatch probe that supplies clear, missing, stale, incomplete, and failing ledgers and observes the reservation state. | `plugins/docks/skills/productivity/plan-manager/references/plan-self-check-protocol.md`, `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs`, `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs`, `scripts/tests/plan-dispatch-probes.mjs`, `scripts/tests/plan-orchestration.mjs` | 1, 3 | `local` | `planned` | Only the clear ledger reaches `reserved`; every other case exits nonzero while `draft_review`, the plan bytes, and the bundle directory remain unchanged. Failure: STOP if any path can reserve first and sweep later. |
| 5 | Synchronize the optional legacy/new Steps schemas, draft class budget, closed reviewer vocabulary, and reservation-time sweep across the live contract, manager/workspace skills, generated contract template, and verbatim assertions. | `docs/plans/AGENTS.md`, `plugins/docks/skills/productivity/plan-manager/SKILL.md`, `plugins/docks/skills/productivity/plan-workspace/SKILL.md`, `plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md`, `scripts/tests/plan-skill-phases.mjs` | 1, 2, 3, 4 | `local` | `planned` | The bounded-workflows case passes and still fails when the new-id rule, repeated-class rule, or pre-reservation sweep sentence is removed from any pinned contract copy. Failure: STOP on contract/template drift or a relaxed assertion. |
| 6 | Run focused and full orchestration, prove historical finished plans are untouched, then run the Docks plugin gate. | `docs/plans/AGENTS.md`, `plugins/docks/skills/productivity/plan-manager/SKILL.md`, `plugins/docks/skills/productivity/plan-manager/references/plan-self-check-protocol.md`, `plugins/docks/skills/productivity/plan-manager/references/planrunv1-schema.md`, `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs`, `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs`, `plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs`, `plugins/docks/skills/productivity/plan-reviewer/SKILL.md`, `plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs`, `plugins/docks/skills/productivity/plan-workspace/SKILL.md`, `plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md`, `scripts/tests/plan-dispatch-probes.mjs`, `scripts/tests/plan-evidence-probes.mjs`, `scripts/tests/plan-orchestration.mjs`, `scripts/tests/plan-orchestration/fixtures/plan-run-v1.mjs`, `scripts/tests/plan-orchestration/mutations.mjs`, `scripts/tests/plan-orchestration/plan-self-check.mjs`, `scripts/tests/plan-orchestration/review-budget.mjs`, `scripts/tests/plan-orchestration/state-matrix.mjs`, `scripts/tests/plan-skill-phases.mjs` | 5 | `local` | `planned` | Every A1-A8 command produces its expected result. Failure: keep the plan `ongoing`, record the failing command and output, and STOP before archive. |
| 7 | Archive this plan after manager-written verification and acceptance are bound. | `docs/plans/finished/<finish-date>-step-ids-and-class-budget.md` | 6 | `local` | `planned` | The lifecycle transaction sets `finished_at`, moves the record to the named archive path, and commits only owned paths; `<finish-date>` is the UTC date on which the archive transaction runs. Failure: leave the plan `ongoing` at its active path. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-orchestration.mjs --case plan-self-check` | Exit 0 with named cases proving grandfather advisories, new-plan identifier enforcement, known/unknown/duplicate guard identifiers, and numeric guard-citation rejection. |
| A2 | `node scripts/tests/plan-orchestration.mjs --case plan-self-check` | Exit 0 with a named case proving numeric `Depends` accepts an earlier display number and rejects missing, equal, or later numbers exactly as before the `Id` column. |
| A3 | `node scripts/tests/plan-orchestration.mjs --case review-budget` | Exit 0 with named cases for unseen-only repair, repeated-class block, mixed-result block, atomic accepted-set persistence, finite draft bound, and unchanged completion/transport behavior. |
| A4 | `node scripts/tests/plan-orchestration.mjs --case dispatch-driver` | Exit 0 with a named class-sweep probe showing only a complete clear ledger reaches reservation and every refused case leaves the prior repairing invocation count unchanged and creates no bundle. |
| A5 | `node scripts/tests/plan-skill-phases.mjs --case bounded-workflows` | Exit 0 after asserting the identifier rollout, closed class vocabulary, repeated-class block, and sweep-before-reserve clauses in every live contract copy. |
| A6 | `node scripts/tests/plan-orchestration.mjs` | Exit 0 with all registered orchestration, state-matrix, policy, self-check, and dispatch cases passing. |
| A7 | `git diff --exit-code -- docs/plans/finished` | Exit 0 with no tracked historical finished-plan byte changes. |
| A8 | `node scripts/ci.mjs --plugin docks` | Exit 0 for the Docks plugin gate. |

## Out of scope / do-NOT-touch

- Migrating `Depends` from numeric display numbers to stable identifiers. Numeric
  dependency parsing and ordering remain unchanged.
- Applying class-based continuation to `CompletionReviewV1`; its two-invocation
  repair budget and transport behavior remain unchanged.
- Editing, relabelling, or reformatting any existing file under
  `docs/plans/finished/`.
- Repairing the release plan or reconstructing unavailable historical reviewer
  runs and censuses.
- The separate lifecycle dispatch-integrity and lifecycle-plugin-extraction
  plans.
- Any probe, production access, publication, push, release, or deployment.

## STOP conditions

1. Any implementation row requires an effect other than `local`.
2. A current active plan becomes invalid solely because it lacks the new `Id`
   column, rather than receiving the required grandfather advisory.
3. Cell 0 stops being the ascending numeric display number or numeric `Depends`
   behavior changes.
4. A reviewer class is free-form, supplied by the author, inferred from plan
   prose, or incompatible with its coarse kind.
5. A repeated accepted class, including one member of a mixed result, can enter
   another repair round.
6. A class sweep can be waived, can omit an enumerated unit, or can run after
   bundle creation or reservation.
7. Completion review exceeds or falls short of its existing two substantive
   invocations, or transport refund behavior changes.
8. A tracked historical finished-plan byte changes or any acceptance command
   exits unexpectedly.

## Open questions

- D1 — Decided: the `Id` column is optional for the frozen current active set and
  required for every later plan. The validator freezes these normalized
  `PlanRunV1.plan_path` values as grandfathered:
  `docs/plans/active/lifecycle-dispatch-integrity.md`,
  `docs/plans/active/plan-lifecycle-plugin-extraction.md`,
  `docs/plans/active/relay-fanout-reaper-reporting.md`,
  `docs/plans/finished/2026-08-02-session-relay-0.15.0-release.md`, and
  `docs/plans/active/step-ids-and-class-budget.md`. A plan is new exactly when
  its normalized active `plan_path` is absent from that frozen set; finished
  paths cannot reopen. Missing ids are advisory for the frozen set and errors
  for new plans, avoiding timestamp or Git-history inference.
- D2 — Decided: the reviewer defect-class vocabulary is the closed v1 mapping in
  Context, owned by `review-policy.mjs`. Repository code must change to add a
  class; the reviewer emits and output validation checks it, and the manager
  never infers it from author text.
- D3 — Decided: repetition blocks on the first subsequent result containing any
  already accepted class. An unseen-only result may repair; any mixed result
  blocks. The sorted accepted set is persisted atomically when findings are
  accepted, before any later dispatch, so a crash cannot forget prior classes.
- D4 — Decided: `Depends` migration is deferred. The `Id` parser is header-aware
  while `Depends` continues to use earlier numeric display numbers, and A2
  proves that behavior is unchanged so stable dependencies remain a separate
  design change.

## Review

N/A — no review has been dispatched for this run.

## Verification Results

N/A — manager-written after execution.
