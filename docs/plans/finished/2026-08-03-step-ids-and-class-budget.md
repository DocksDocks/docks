---
title: Give steps stable identifiers and charge permits by defect class
goal: Make step references stable, catch decidable guard defects before review, and continue draft review only for unseen closed defect classes.
status: finished
created: "2026-08-01T22:11:43-03:00"
updated: "2026-08-03T13:45:31.981+00:00"
started_at: "2026-08-03T03:19:58.502+00:00"
finished_at: "2026-08-03T13:45:31.981+00:00"
assignee: null
tags: [plans, plan-manager, plan-reviewer, review-budget, registered-idea]
affected_paths:
  - .codex/agents/plan-reviewer.toml
  - docs/plans/AGENTS.md
  - plugins/docks/agents/plan-reviewer.md
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

Plan-run: {"acceptance":{"source_sha256":"9bf87dbb5ad0fa482b62ea0147dbba3e39e5a4dd980d3c7be4f14d1d4fdc9de0","verification_sha256":"7ad55fc1c0cd056ab40fe37f60831628a3e7733d54fd5d1802cd878eb517bc0e"},"blocker":null,"completion_review":{"accepted_classes":[],"input_sha256":"f9da4a0bc3664428c082ed75e50c09cab2b57e96a4dee57bbdbfa539c7657076","invocations":2,"result_sha256":"28abe99e8c4531b9caf7036663e3da8358d22eed0694bb2bd314251271229247","state":"passed"},"draft_review":{"accepted_classes":["v1_acceptance_coverage_incomplete","v1_affected_paths_incomplete"],"input_sha256":"0a6642ffb5b88b25e060a703f8e913df481e74e7c5848dcaa66b4f587426786f","invocations":2,"result_sha256":"d35d4efb88c7b3d13c9a0c7d539571cca94e816cb384e8fc9ba3ca91778983ea","state":"passed"},"execution_parent":"7328cb569e1f2578733a02915a1068435d437785","goal_id":"4f091bda-6643-437e-84d0-8d4ca0118bb7","implementation_commit":"426860f53336ee1d58c45e093715aaf99b23d12e","plan_path":"docs/plans/active/step-ids-and-class-budget.md","plan_sha256":"e46d921ab7b5189cc0034156a5628652d3a3fbd814ee750d45ff4fed832f40fe","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"1b06c547-4ea7-42a4-8166-44b0192a5c64","schema":1,"source_base":"219e900ba7d828bcaa117f015555cd25c22fbd10","source_sha256":"539539e124309e16180e71e53d033f3ab9adbb890fa25ed3a61971a80ec09419"}

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

> **Successor note - why the implementation rows read `done` on a run that has not started.**
> This run replaces terminal predecessor `2ab6fc4b`, blocked `review_failed` after a repair verdict
> at completion invocation 2, which is terminal by contract. Five findings were returned across the
> two invocations. All five were real. Four are already fixed in the world; the fifth needed paths
> the predecessor could not declare and is declared and fixed by this successor.
>
> `F1`/`F2` (invocation 1) - the default-route prompt still specified the pre-`class` finding shape
> while its own validator required `class`, so every default-route review would have emitted an
> object the validator rejects; and the grandfather rule never engaged, because the record lookup
> read `structuralScope` output, which truncates at `## Review` - exactly where the `Plan-run:` line
> lives. Both fixed at `e11e82c`.
>
> `F1`/`F2` (invocation 2) - two latent defects in the shipped feature. The accepted-class guard sat
> above the unchanged-phase early return, so any transaction leaving `draft_review` in `repairing`
> failed with an unsatisfiable atomicity error, reaching completion reserves, records and finishes.
> The class sweep validated the ledger against the record-injected text rather than the `--body`
> bytes it was built from, making draft repair reservation impossible for any plan whose record sits
> in a level-two section. Both fixed at `ae3e912`.
>
> `F3` (invocation 1) - IN SCOPE, not deferred. The two shipped reviewer wrappers still documented the
> pre-`class` finding shape. The predecessor could not declare them, because `affected_paths` is
> inside `plan_sha256` and a `repairing` completion phase cannot move it. This successor is
> `drafting`, where that table may legally change, so the wrappers are declared here and fixed with
> the rest of the contract. A shipped consumer left documenting a contract this plan replaced is
> incomplete scope, not a follow-up.
>
> Two probes in this work were measured against their own re-introduced defect and found blind
> before being replaced. Steps 1-6 describe world state inherited across `9107d10`, `e11e82c` and
> `ae3e912`, with `node scripts/ci.mjs` passing. Step 7 stays `planned`.

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Add an optional `Id` column after `#`, using `[a-z][a-z0-9_]{0,63}`, and parse Steps columns by header name so `#` stays numeric and `Depends` keeps its numeric semantics. Accept guard citations only as `step:<id>`; reject duplicate or unknown ids and valid-looking `step N` citations in the guard cell. Freeze the current active plan paths as the grandfather set described in D1. | `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs`, `scripts/tests/plan-orchestration/plan-self-check.mjs` | — | `local` | `done` | Focused tests show new plans without ids fail, every frozen active plan receives only an advisory for a missing column, known ids pass, duplicate/unknown ids and numeric guard citations fail, and numeric `Depends` ordering behaves exactly as before. Failure: STOP before changing the plan contract. |
| 2 | Add the closed v1 `class` field to `PlanReviewV1`, enforce the kind-to-class mapping in reviewer output validation, and update reviewer instructions and all current review fixtures. | `plugins/docks/skills/productivity/plan-reviewer/SKILL.md`, `plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs`, `scripts/tests/plan-dispatch-probes.mjs`, `scripts/tests/plan-evidence-probes.mjs`, `scripts/tests/plan-orchestration/review-budget.mjs`, `plugins/docks/agents/plan-reviewer.md`, `.codex/agents/plan-reviewer.toml` | — | `local` | `done` | Policy tests accept every declared kind/class pair and reject a missing, unknown, wrong-version, or kind-incompatible class; no manager path infers a class. Failure: STOP rather than accepting free-form reviewer output. Both shipped reviewer wrappers state the `class` key and defer the closed mapping to the canonical skill; a wrapper still documenting the pre-`class` shape fails A9. |
| 3 | Persist sorted unique accepted draft classes, replace the draft-only flat ceiling with the finite class budget, block the first repeated or mixed repeated result, and preserve completion review's two-invocation and transport-refund behavior. Treat a missing `accepted_classes` field on an existing record as empty and emit the field on its next legal draft transition. | `plugins/docks/skills/productivity/plan-manager/references/planrunv1-schema.md`, `plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs`, `scripts/tests/plan-orchestration/fixtures/plan-run-v1.mjs`, `scripts/tests/plan-orchestration/mutations.mjs`, `scripts/tests/plan-orchestration/review-budget.mjs`, `scripts/tests/plan-orchestration/state-matrix.mjs` | 2 | `local` | `done` | Reducer tests prove an unseen-only result reaches `repairing`, any repeated class blocks immediately, a mixed result blocks, the accepted set is present after read-back before redispatch, the finite upper bound rejects overflow, and completion/transport cases retain their current outcomes. Failure: STOP on any reset, inferred class, unbounded invocation, or completion-budget drift. |
| 4 | Extend the self-check ledger with exact accepted-class sweep coverage and enforce it in `dispatch-review.mjs` against the candidate body before bundle creation and `reserve_review`. Add a dispatch probe that supplies clear, missing, stale, incomplete, and failing ledgers and observes the reservation state. | `plugins/docks/skills/productivity/plan-manager/references/plan-self-check-protocol.md`, `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs`, `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs`, `scripts/tests/plan-dispatch-probes.mjs`, `scripts/tests/plan-orchestration.mjs` | 1, 3 | `local` | `done` | Only the clear ledger reaches `reserved`; every other case exits nonzero while `draft_review`, the plan bytes, and the bundle directory remain unchanged. Failure: STOP if any path can reserve first and sweep later. |
| 5 | Synchronize the optional legacy/new Steps schemas, draft class budget, closed reviewer vocabulary, and reservation-time sweep across the live contract, manager/workspace skills, generated contract template, and verbatim assertions. | `docs/plans/AGENTS.md`, `plugins/docks/skills/productivity/plan-manager/SKILL.md`, `plugins/docks/skills/productivity/plan-workspace/SKILL.md`, `plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md`, `scripts/tests/plan-skill-phases.mjs` | 1, 2, 3, 4 | `local` | `done` | The bounded-workflows case passes and still fails when the new-id rule, repeated-class rule, or pre-reservation sweep sentence is removed from any pinned contract copy. Failure: STOP on contract/template drift or a relaxed assertion. |
| 6 | Run focused and full orchestration, prove historical finished plans are untouched, then run the Docks plugin gate. | `docs/plans/AGENTS.md`, `plugins/docks/skills/productivity/plan-manager/SKILL.md`, `plugins/docks/skills/productivity/plan-manager/references/plan-self-check-protocol.md`, `plugins/docks/skills/productivity/plan-manager/references/planrunv1-schema.md`, `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs`, `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs`, `plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs`, `plugins/docks/skills/productivity/plan-reviewer/SKILL.md`, `plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs`, `plugins/docks/skills/productivity/plan-workspace/SKILL.md`, `plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md`, `scripts/tests/plan-dispatch-probes.mjs`, `scripts/tests/plan-evidence-probes.mjs`, `scripts/tests/plan-orchestration.mjs`, `scripts/tests/plan-orchestration/fixtures/plan-run-v1.mjs`, `scripts/tests/plan-orchestration/mutations.mjs`, `scripts/tests/plan-orchestration/plan-self-check.mjs`, `scripts/tests/plan-orchestration/review-budget.mjs`, `scripts/tests/plan-orchestration/state-matrix.mjs`, `scripts/tests/plan-skill-phases.mjs` | 5 | `local` | `done` | Every A1-A8 command produces its expected result. Failure: keep the plan `ongoing`, record the failing command and output, and STOP before archive. |
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
| A7 | `git diff --exit-code $(git rev-parse HEAD) -- docs/plans/finished` run from the implementation checkpoint, and `git diff --exit-code <execution_parent>..<implementation_commit> -- docs/plans/finished` | Exit 0 for both. The working-tree form alone cannot see a committed historical change, so the range form over `execution_parent..implementation_commit` is the binding one and must be run before Step 7. |
| A8 | `node scripts/ci.mjs --plugin docks` | Exit 0 for the Docks plugin gate. |
| A9 | `grep -n 'id,kind,class,locator,defect,fix' plugins/docks/agents/plan-reviewer.md .codex/agents/plan-reviewer.toml` | Exit 0 with one match in each shipped wrapper, proving neither still documents the pre-`class` finding shape the validator rejects. |

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

- D1 — Decided: the `Id` column is optional for the plans that were already active
  when it was introduced, and required for every later plan. The validator
  grandfathers two things: every `docs/plans/finished/` path by prefix, and the
  frozen normalized `PlanRunV1.plan_path` values still active at introduction,
  namely `docs/plans/active/plan-lifecycle-plugin-extraction.md` and
  `docs/plans/active/step-ids-and-class-budget.md`. An archived plan is covered by
  the prefix and therefore carries no frozen entry; leaving its old active path in
  the set would exempt a NEW plan that happened to reuse the filename, which is
  the opposite of the intent. A plan is new exactly when its normalized active
  `plan_path` is absent from the frozen set. Missing ids are advisory for those
  plans and errors for new ones, avoiding timestamp or Git-history inference.
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


Completion review invocation 1:

Completion-review-result: {"diff_sha256":"b5885fc9515bc1254f729d6bb99a97b9f4c854bed2b6dbc999ed0712016e0b8e","findings":[{"defect":"buildPlanReviewPrompt still instructs the reviewer with 'Each finding has exactly: id, kind, locator, defect, fix.' and 'Allowed finding kinds: ...', while validatePlanReview in the same module (line 174-175, keys.splice(2,0,'class')) now makes `class` a required closed key. The generated prompt is the whole specification the reviewer receives on the default route: DEFAULT_REVIEWER in dispatch-review.mjs:46 is ['omp','--model','openai-codex/gpt-5.6-sol','-p','--mode','json','{{PROMPT}}'], which loads no skill and no wrapper, and createPlanReviewBundle seals only binding.json, manifest.json and plan.md — no instructions. Verified by constructing the exact object the prompt specifies and validating it: `PlanReviewV1 finding 1 is missing class`. In dispatch-review.mjs that raises ReviewerOutputError and prints 'INVALID REVIEWER OUTPUT' with a refund, so every `repair` and `blocked` draft verdict is now unusable and only a zero-finding `pass` can ever settle. This defeats the plan's own mechanism: D2 states 'the reviewer emits and output validation checks it', but the reviewer is never told to emit it. No acceptance criterion covers the prompt — A5 pins contract prose, and the review-budget class test calls validatePlanReview directly with hand-written `class` values, so the producing side is never exercised against the consuming side.","fix":"In buildPlanReviewPrompt, replace line 621 with 'Each finding has exactly: id, kind, class, locator, defect, fix.' and add the closed kind-to-class mapping after line 622, e.g. 'Allowed class by kind: missing_decision=v1_missing_decision; contradiction=v1_contract_contradiction|v1_evidence_mismatch|v1_unstable_step_reference; unsafe_scope=v1_unauthorized_effect|v1_missing_safety_boundary|v1_affected_paths_incomplete; missing_acceptance=v1_acceptance_command_not_runnable|v1_acceptance_output_mismatch|v1_acceptance_coverage_incomplete|v1_failure_action_missing.' Derive the text from the exported PLAN_FINDING_CLASSES rather than a fourth hand-written copy, so the prompt cannot drift from the validator. The prompt is ~600 bytes against the 4 KiB cap at line 625, so there is room. Add a probe in scripts/tests/plan-orchestration/review-budget.mjs (already in affected_paths) that feeds buildPlanReviewPrompt output shape through validatePlanReview — i.e. assert the prompt names every key validateFinding requires — so the two sides stay bound. review-policy.mjs is in affected_paths under Step 2, whose task text already covers 'update reviewer instructions'; no sealed content changes.","id":"F1","kind":"contradiction","locator":"plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs:621-622"},{"defect":"stepIdentifierDiagnosticsFromContext resolves the grandfather decision from context.record, but structuralContext builds its lines from structuralScope(planText) (line 856), and structuralScope truncates the document at the first '## Review' or '## Verification Results' heading (line 704). The canonical position of the `Plan-run:` record line is inside '## Review' — that is precisely why plan_sha256 excludes both. So context.record is null for most real plans, planPath is null, `grandfathered` is false, and a frozen-set plan receives the new-plan error instead of the required advisory. Verified against the live repository: docs/plans/active/plan-lifecycle-plugin-extraction.md — an active plan named verbatim in D1's frozen set — went from `RULES enforcing 18 checked, 0 finding(s)` exit 0 at parent 7328cb5 to `RULES enforcing 18 checked, 1 finding(s) / R10 fail Steps table has no Id column; new plans require Id immediately after #` exit 1 at 9107d10. Its record sits at line 241, after '## Review' at line 237. Relocating only that line above '## Goal' in memory flips the result to the intended `advisories: [Steps table has no Id column for docs/plans/active/plan-lifecycle-plugin-extraction.md; grandfathered plan keeps numeric display identifiers]` with zero errors, proving record position — not plan identity — decides grandfathering. This is STOP condition 2 verbatim: 'A current active plan becomes invalid solely because it lacks the new Id column, rather than receiving the required grandfather advisory.' docs/plans/finished/2026-08-02-session-relay-0.15.0-release.md and docs/plans/finished/2026-08-02-relay-fanout-reaper-reporting.md, both in the frozen set, likewise get the error rather than the advisory (counting-only, so exit stays 0 and A7 is unaffected). The same null record also propagates into validateAcceptedClassSweep, which recomputes stepIdentifierDiagnostics for v1_unstable_step_reference, so a grandfathered plan carrying that accepted class can never produce a clear sweep and its repair reservation is permanently refused. The focused tests miss this because the fixture() helper in scripts/tests/plan-orchestration/plan-self-check.mjs injects the `Plan-run:` line into the '## Goal' section, a position no real plan uses.","fix":"Resolve the record from the untruncated plan text rather than from structuralScope output: in structuralContext, replace the `lines.find((line) => line.startsWith('Plan-run: '))` lookup at line 904 with a scan over planText.split('\\n'), or add a dedicated helper and call it from stepIdentifierDiagnosticsFromContext. Then extend the grandfather case in scripts/tests/plan-orchestration/plan-self-check.mjs so fixture() can place the record under '## Review' (add a `recordInReview` option) and assert the frozen paths still yield errors: [] with exactly one advisory in that layout — the current fixture passes with the bug present, so it must be made to bite. Both files are in affected_paths under Step 1; no Steps row, acceptance criterion, or affected path changes.","id":"F2","kind":"contradiction","locator":"plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs:936-939"},{"defect":"Both shipped reviewer wrappers still assert a closed finding shape that the patch invalidated: 'For `repair` or `blocked`, each finding is exactly `{id,kind,locator,defect,fix}`.' Step 2 updated plan-reviewer/SKILL.md with the class table, but neither wrapper was touched, so a reviewer dispatched through the Claude or Codex wrapper route is told to emit exactly the object that validatePlanReview now rejects. Impact is lower than F1 because the wrappers are not the default route (dispatch-review.mjs:46 uses a bare model invocation) and because each wrapper defers its kind list to 'the canonical skill', which is correct — but the quoted sentence is an independent closed assertion, not a deferral, and it will contradict the prompt even after F1 is fixed. No gate binds wrapper text to the skill: plan-skill-phases.mjs assertBoundedWorkflows reads plan-manager/SKILL.md and plan-reviewer/SKILL.md only (line 223-224), and the docks agents checks in scripts/ci.mjs score quality rather than contract agreement.","fix":"Amend both sentences to `{id,kind,class,locator,defect,fix}` and add one line pointing at the canonical skill's kind-to-class table, e.g. 'class is closed to the v1 vocabulary compatible with kind, as defined by the canonical skill.' These two wrapper files are outside affected_paths, so if this run may not touch them, record the correction as a follow-up under the plan-workspace wrapper-maintenance path; the functional defect is fully closed by F1 inside affected_paths, so this does not require reopening sealed plan content.","id":"F3","kind":"contradiction","locator":"plugins/docks/agents/plan-reviewer.md:77-78 and .codex/agents/plan-reviewer.toml:74-75"}],"implementation_commit":"9107d10cd1346d6309644d6cc45d654e9f890f0a","invocation":1,"run_id":"b6167972-c6ae-40b6-9738-849e21364b81","schema":1,"verdict":"repair"}


Completion review invocation 2:

Completion-review-result: {"diff_sha256":"227769717f53d82e7b669f6f7c0729c9c5335e392bd2d2f709b50ac52b1479a6","findings":[{"defect":"The accepted-class sweep is unsatisfiable for any plan whose `Plan-run:` line sits inside a level-two section, so no draft repair round can ever be reserved for such a plan. Step 4 and the reference this patch adds both state that dispatch verifies the ledger against the candidate body ('the exact `--body` bytes'; plan-self-check-protocol.md:269-272 'against the exact candidate body'), and the ledger is in fact built from that file: `plan-self-check.mjs ledger <result.json> <ledger.json> <plan.md>` -> mergeLedger -> createAcceptedClassSweep(..., planText) (plan-self-check.mjs:1737-1739, 1463-1465, 1000-1023). But dispatch validates against `candidateText` (dispatch-review.mjs:216), which is the body with its `Plan-run:` line replaced by the rebound record (`withRecord`, dispatch-review.mjs:163-174, 188). enumerateUnits emits one `document_sections` unit per level-two heading whose text is the raw line span (plan-self-check.mjs:531-546), so the section holding the record line hashes differently on the two sides, and validateAcceptedClassSweep reports it stale (plan-self-check.mjs:1047-1049). A repair necessarily moves `plan_sha256`, so the rebind is never a no-op. Verified against the live active plan docs/plans/active/plan-lifecycle-plugin-extraction.md (record inside `## Review`): a ledger built from a repaired body validates clean against that body ([]) and fails against dispatch's rebound text with [\"accepted-class sweep unit document_sections:review is stale\"], which the preflight turns into exit 2 before bundle creation. That is 1 of the 2 live active plans, plus most recent archived plans (record under `## Review` or `## Open questions`) and the probe fixture itself (record under `## Acceptance criteria`, plan-dispatch-probes.mjs:121-124). The new probe stays green only because its clear case copies the plan file unmodified (plan-dispatch-probes.mjs 'clear' block), so the rebound record is byte-identical; its script-failing case does hit the stale-unit problem but only asserts the later script-check substring.","fix":"Validate the ledger against the exact `--body` bytes: pass `candidateSourceText` instead of `candidateText` at dispatch-review.mjs:216 (planSha256, acceptedClasses and reviewResultSha256 bindings are unaffected, and stepIdentifierDiagnostics still resolves the record from the body). Alternatively, make the unit digests record-insensitive by hashing a Plan-run-line-excluded view in acceptedClassSweepUnitDigests (plan-self-check.mjs:989-996). Then strengthen the probe so the clear case uses a genuinely repaired body (as the script-failing case does) — the current clear case cannot fail on the real input shape.","id":"F1","kind":"contradiction","locator":"plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs:188,216-220"},{"defect":"The new draft accepted-class guard runs before the unchanged-phase early return, so it rejects every persisted transaction that leaves `draft_review` in `repairing`. assertPersistedTransition calls assertPersistedReviewTransition for both phases on every transaction (plan-run.mjs:1762-1766); when the draft phase is unchanged, `before` and `after` are the same object, `after.state === 'repairing'` matches at line 1682, and `afterAcceptedClasses.length <= beforeAcceptedClasses.length` is true, so it fails with 'draft repair transition must atomically add only unseen accepted classes' before reaching the `before.state === after.state` return at line 1693. This kills the 'draft preparation' transaction that the same module explicitly authorises while repairing: plan-run.mjs:1818-1821 permits a `drafting -> drafting` plan-content/`plan_sha256` rebind exactly when `draft_review.state` is `not_started` or `repairing`, and the `repairing` arm of that allow-list is now dead code. Verified by running one identical drafting-content transaction through transactPlanRun twice with the shipped fixtures: `not_started` -> ACCEPTED (persisted), `repairing` -> REJECTED: 'draft repair transition must atomically add only unseen accepted classes'. Nothing in the sealed plan asks for that path to be closed, no test covers it (no orchestration case exercises a drafting-content mutation while repairing), and the diagnostic misdescribes the transaction, which carries no repair result at all.","fix":"Gate the accepted-classes comparison on a real state change, e.g. wrap the block at plan-run.mjs:1679-1692 in `if (phaseName === 'draft_review' && before.state !== after.state)`, or move it below the `before.state === after.state` early return at 1693-1696 so an unchanged phase is compared only by the existing jcs identity check. Add a case asserting that a `drafting -> drafting` plan_sha256 rebind still succeeds while draft_review is `repairing` and that accepted_classes is carried unchanged.","id":"F2","kind":"contradiction","locator":"plugins/docks/skills/productivity/plan-run.mjs:1679-1693"}],"implementation_commit":"e11e82c003c59d54a61b38e5a3ecbc6a9b91af39","invocation":2,"run_id":"b6167972-c6ae-40b6-9738-849e21364b81","schema":1,"verdict":"repair"}


Plan-attempt-history: {"authorization_source_sha256":"0889cde97525945382fbfa4f98b7f726fca77bdb38221c558412b63fb9ae6641","plan_bytes_sha256":"42c1d00351720a807b933b0d5f08054fb5c9d5617ff8d7ca6648d91ca9f8f1e3","replacement_run_id":"1b06c547-4ea7-42a4-8166-44b0192a5c64","run":{"acceptance":{"source_sha256":"0662f180e6196ea53f514f64ae2f82ebada878a3a34d5f0661c62e141fbb6cfe","verification_sha256":"3114e9188f2a8bcdff8dc1acf02a3f38c44f251c2b4962e846b9aa615bcaa511"},"blocker":{"evidence_sha256":"7a6aec5e70339e15b0059f9069553b9270b25e108724518683ed40fdfc5eda02","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":"d9e80ef76b2c6caad7c6b69cbd08da30895c27cfd7f594a57a41ad69dfc9fa80","invocations":2,"result_sha256":"7a6aec5e70339e15b0059f9069553b9270b25e108724518683ed40fdfc5eda02","state":"blocked"},"draft_review":{"input_sha256":"67dea20241cab99329f4c75f1b04c3daab06b9095aad8616bec55af72e7c08e9","invocations":1,"result_sha256":"760f7c79aa716319981f7d8fce7a4e1f92427f25960a9cc6c397e85ebf8f279d","state":"passed"},"execution_parent":"7328cb569e1f2578733a02915a1068435d437785","goal_id":"4f091bda-6643-437e-84d0-8d4ca0118bb7","implementation_commit":"e11e82c003c59d54a61b38e5a3ecbc6a9b91af39","plan_path":"docs/plans/active/step-ids-and-class-budget.md","plan_sha256":"da5f735f0337588df69c15a8fc9396e34bb7d198d87f10421a51098c14f83768","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"b6167972-c6ae-40b6-9738-849e21364b81","schema":1,"source_base":"702383f504757336ebe6c3859db70384e82a814f","source_sha256":"acab5a01791fda0b130e39b1072f2b99f020b5caec7fefccc4b741e3d737a25e"},"schema":1,"status":"blocked","successor_run_sha256":"c40a34d33b71b7bf47b9836e28594e1893ab33571e221c8d56c2704c4cb8a1d5"}


Completion review invocation 1:

Completion-review-result: {"diff_sha256":"7e23607ebc1ce919681b6672f4a9cdf401fa28e1d02f33a2bc4d83bb6e3f4ad6","findings":[{"defect":"All four shipped contract copies still state \"The frozen set is exactly `docs/plans/active/lifecycle-dispatch-integrity.md`, `docs/plans/active/plan-lifecycle-plugin-extraction.md`, `docs/plans/active/relay-fanout-reaper-reporting.md`, `docs/plans/finished/2026-08-02-session-relay-0.15.0-release.md`, and `docs/plans/active/step-ids-and-class-budget.md`\", but `GRANDFATHERED_STEP_ID_PLAN_PATHS` holds exactly two entries (`plan-lifecycle-plugin-extraction.md`, `step-ids-and-class-budget.md`), and sealed decision D1 names exactly those two. The three dropped entries were removed at 219e900 precisely to close the archived-filename-reuse hole (`scripts/tests/plan-orchestration/plan-self-check.mjs` asserts `docs/plans/active/relay-fanout-reaper-reporting.md` and `docs/plans/active/lifecycle-dispatch-integrity.md` now `must be treated as a new plan`), yet the contract a cold author reads still promises those two active paths an exemption the validator will refuse with `new plans require Id immediately after #`. Worse, `scripts/tests/plan-skill-phases.mjs` pins the three stale strings as required clauses (`grandfather-path-dispatch-integrity`, `grandfather-path-fanout-reaper`, `grandfather-path-release`), so A5 is green while certifying the wrong set — it now blocks the correction instead of catching the drift. This defeats Step 5 (\"Synchronize the optional legacy/new Steps schemas … across the live contract, manager/workspace skills, generated contract template, and verbatim assertions\") whose failure action is \"STOP on contract/template drift\". Verified: `docs/plans/active/` contains only the two plans the code lists; the other two files do not exist as active plans.","fix":"In `docs/plans/AGENTS.md`, `plan-manager/SKILL.md`, `plan-workspace/SKILL.md` and `plan-workspace/references/plans-agents-md-template.md`, reduce the enumerated frozen set to the two paths in `GRANDFATHERED_STEP_ID_PLAN_PATHS` and state D1's second route explicitly (every `docs/plans/finished/` path is grandfathered by prefix, so an archived plan carries no frozen entry and its old active path is treated as new). Keep the node and the template's fenced block byte-identical. In `scripts/tests/plan-skill-phases.mjs`, delete the `grandfather-path-dispatch-integrity`, `grandfather-path-fanout-reaper` and `grandfather-path-release` clauses and add a positive clause for the finished-prefix route, so the pinned copies match `plan-self-check.mjs`. Refresh the two `metadata.content_hash` values and re-run `node scripts/tests/plan-skill-phases.mjs --case bounded-workflows` and `node scripts/ci.mjs --plugin docks`.","id":"C1","kind":"contradiction","locator":"docs/plans/AGENTS.md:110-115; plugins/docks/skills/productivity/plan-manager/SKILL.md:73; plugins/docks/skills/productivity/plan-workspace/SKILL.md:109-114; plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md:117-122; scripts/tests/plan-skill-phases.mjs:28-43 (vs plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs:75-82)"},{"defect":"`validateInvocation` still enforces `if (value !== 1 && value !== 2) throw new Error(...)` for every `PlanReviewV1` binding and result, while this patch raised the draft budget to `DRAFT_REVIEW_INVOCATION_LIMIT = 12` in `plan-run.mjs:43` and `dispatch-review.mjs:129`, and the contract copies this patch wrote declare `PlanReviewV1 = { schema:1, run_id:uuid, invocation:1..12, … }` (`docs/plans/AGENTS.md:357`, `plans-agents-md-template.md:364`). `dispatch-review.mjs` computes `invocation = phase.invocations + 1` and passes it to `policy.createPlanReviewBundle` (dispatch-review.mjs:232), which calls `validatePlanBinding` → `validateInvocation`; a third draft round therefore dies before sealing a bundle, and `validatePlanReview` would reject any invocation-3 result as well. Confirmed by direct call: `validatePlanReview({… invocation:3 …}, {… invocation:3 …})` throws `expected plan review binding invocation must be 1 or 2`. The effective draft ceiling is still the flat two the plan set out to replace, so D3 and Step 3 (\"replace the draft-only flat ceiling with the finite class budget\") are unreachable end to end. A3's `finite draft class budget allows twelve invocations` case (`scripts/tests/plan-orchestration/review-budget.mjs`) drives only the `plan-run.mjs` reducer and never binds the reviewer policy, which is why 208/208 passes over a broken path.","fix":"In `review-policy.mjs`, split the bound: derive the plan-review maximum from the closed vocabulary (`1 + Object.values(PLAN_FINDING_CLASSES).flat().length`) and accept `1..that` in `validatePlanBinding`/`validateReviewEnvelope` for `PlanReviewV1`, while `validateCompletionBinding`/`validateCompletionReview` keep `1|2` (the plan's out-of-scope list fixes completion review at two). Then add a case to `scripts/tests/plan-orchestration/review-budget.mjs` that seals a bundle and validates a result at the twelfth draft invocation and still rejects thirteen, so the reviewer-policy bound and `DRAFT_REVIEW_INVOCATION_LIMIT` cannot drift apart again; both files are already declared in `affected_paths` and named by Steps 2 and 3.","id":"C2","kind":"contradiction","locator":"plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs:108-110 (vs plan-run.mjs:43, dispatch-review.mjs:129,232, docs/plans/AGENTS.md:357)"}],"implementation_commit":"882e54fc1ba891b23114f047f008c1fd814f6997","invocation":1,"run_id":"1b06c547-4ea7-42a4-8166-44b0192a5c64","schema":1,"verdict":"repair"}


Completion review invocation 2:

Completion-review-result: {"diff_sha256":"db4f120faddbea3bb5d28bb24293ab15c93d4c85fc815c43134c879e2042cdc9","findings":[],"implementation_commit":"426860f53336ee1d58c45e093715aaf99b23d12e","invocation":2,"run_id":"1b06c547-4ea7-42a4-8166-44b0192a5c64","schema":1,"verdict":"pass"}

## Verification Results

### Implementation (2026-08-02)

Implementation spans `9107d10`, `e11e82c`, `ae3e912`, `068131f`, `219e900` and `426860f`, on ancestry from
`7328cb5`, this run's `execution_parent`. Every path this work
touched is inside the twenty-two `affected_paths`; the only other modified file is the plan record
itself, which lifecycle transitions own and which is correctly absent from `affected_paths`.

**Stable step identifiers.** Steps rows now carry identifiers, and a guard citation must name
`step:<id>` instead of a display position. The defect this closes is silent, not loud: renumbering a
table repointed a guard at whatever row inherited the number, and nothing failed. `plan-self-check`
enforces identifiers on new plans, rejects a numeric guard citation with `numeric guard citation
step 1; use step:<id>`, and grandfathers existing plans as advisories so the rollout does not
invalidate live records. Numeric `Depends` still accepts an earlier display number and rejects
missing, equal or forward references.

**Closed finding-class vocabulary and budget.** Reviewer findings carry a closed
`ReviewerFindingClassV1` class. A draft phase records `accepted_classes`; on read an absent field is
the empty set, and every legal draft transition emits it. A repeated accepted class enters terminal
`review_failed` rather than spending another permit — the budget exists to bound judgement, not to
re-buy the same finding. A mixed repeated-and-unseen set blocks rather than accepting a partial
union, because a partial union would silently drop the repeated half.

**The sweep happens before anything is at stake.** Dispatch verifies the accepted-class ledger
before sealing the bundle and before reserving the permit. A missing, stale, incomplete or
script-failing ledger refuses with exit 2, with the record and the permit untouched. Ordering is the
whole point: a check after reservation has already spent what it was protecting.

**The contract exceeded its cap, and the fix was to remove a duplicate rather than raise the cap.**
Adding the new clauses pushed `docs/plans/AGENTS.md` to 543 lines against the context-tree cap of
500. Lowering the cap is a STOP condition and thinning the contract would lose the clauses. The
inline 44-line record-shape fence was a second copy of what
`plan-manager/references/planrunv1-schema.md` already defines — and the two copies had drifted into
two different spellings of one schema, so the duplication was already costing correctness. The
reference is now the single source of truth for field names, types and enum members; the node states
the rules and cites the shapes. `PlanAttemptHistoryV1`, `PlanRunReplacementAuthorityV1` and the
`source_base`/`execution_parent`/`successor_run_sha256` field constraints moved there with it. The
node is 498 lines and `tree/guard` passes.

**A verbatim-generation invariant that was not holding.** `docs/plans/AGENTS.md` is generated
verbatim from the plan-workspace template, and `plan-skill-phases.mjs` binds clauses in both copies
precisely because a rule written into one silently drifts. The two had nonetheless diverged: three
lines present only in the node, and one sentence worded differently. Both are now aligned, and the
template's fenced block is byte-identical to the node — verified by extracting the block and
comparing, not by eye.

**Probes.** Every fix has one that fails with the fix reverted and names its diagnostic:

| Fix | Reverted failure |
|---|---|
| new-plan identifier enforcement | `not ok - plan-self-check: new plans require stable step identifiers` |
| numeric guard citation rejection | `numeric guard citation step 1; use step:<id>` |
| kind/class compatibility | `review-budget: ... Missing expected exception: operation must reject` |
| repeated and mixed repeated class blocking | 2 of 23 review-budget cases fail |
| accepted-class sweep before bundle/reservation | `script-failing: sweep refusal must exit 2`, `0 !== 2` |
| contract-copy clauses | each pinned clause removed in memory produces its named missing-clause failure |

**Three findings from completion invocation 1, all reproducible and all now fixed.**

`F1` — the default-route prompt contradicted its own validator. `validatePlanReview` made `class` a
required closed key, but `buildPlanReviewPrompt`, in the same module, still stated the finding shape
as exactly `{id,kind,locator,defect,fix}`. That prompt is the entire specification a reviewer
receives on the default route: `DEFAULT_REVIEWER` is a bare model invocation that loads no skill and
no wrapper, and the sealed bundle carries only the binding, the manifest and the plan. Every
default-route review would therefore have emitted an object its own validator rejects — the class
budget would have failed closed on first contact. The prompt now requires `class` and renders the
kind-to-class mapping directly from `PLAN_FINDING_CLASSES` instead of restating it, so the two
cannot drift. Proven by round trip: a finding built exactly as the amended prompt instructs is
accepted by `validatePlanReview`. Revert-sensitive test: `plan review prompt must require the class
finding key`.

`F2` — the grandfather rule never engaged, so the non-breaking rollout was breaking.
`structuralContext` resolved the record from `structuralScope` output, and `structuralScope`
truncates at `## Review`. The canonical position of the `Plan-run` line is inside `## Review` —
which is exactly why `plan_sha256` excludes it. `context.record` was therefore null for essentially
every real plan, `grandfathered` was false, and a frozen plan received the hard new-plan error
instead of the required advisory. The lookup now scans the untruncated plan text; `structuralScope`
keeps its deliberate truncation, because other callers depend on it. Verified against a real
archived plan on disk, which now emits `R10 advisory ... grandfathered plan keeps numeric display
identifiers`.

The pre-existing grandfather fixture could not have caught `F2`: it places the record line in the
Goal body and has no `## Review` section at all, so it exercised a document shape no real plan has.
The replacement fixture puts the record where records actually live. A test that cannot fail on the
real input shape is not coverage, and this one had been green throughout.

`F3` — the two shipped reviewer wrappers still documented the pre-`class` finding shape. The
predecessor could not fix this and said so: `affected_paths` is inside `plan_sha256`, and a
`repairing` completion phase cannot move it, so declaring the wrappers was unreachable from there.
This successor is `drafting`, where that table may legally change. See the draft-review section
below: the finding was re-raised, the deferral was overruled, and the wrappers are fixed here.

**Two further defects from completion invocation 2, both latent in the feature this plan shipped.**

The accepted-class guard sat above the unchanged-phase early return, so it compared `draft_review`
against itself. The lengths are then equal, the `after <= before` check holds, and every persisted
transaction that merely left the draft phase in `repairing` failed with an atomicity error no caller
could satisfy — reaching completion reserves, records and finishes, not only draft work. Moved
below that return at `ae3e912`, with a comment pinning the ordering and a probe that fails with
`draft repair transition must atomically add only unseen accepted classes`.

The class sweep validated the ledger against `candidateText`, which carries an injected record line,
rather than the exact `--body` bytes the ledger was built from and that `planSha256` already binds.
For any plan whose `Plan-run:` sits inside a level-two section — where every real plan keeps it —
the comparison was unsatisfiable by construction, so no draft repair round could ever reserve. Fixed
at `ae3e912`.

The existing class-sweep probe was measured against that re-introduced defect and PASSED, because
its fixture placed the record in the Acceptance section where rebinding is a no-op. It was blind.
The replacement case places the record in `## Review` and fails with `accepted-class sweep unit
document_sections:review is stale`. That is the second fixture in this plan found to be incapable of
failing on the shape it claimed to cover.

**Two defects the accepted-class sweep found before any reviewer did.**

The sweep is the gate this plan added: before buying another repair permit you must judge every
enumerated unit against every class you already accepted. Running it for real, rather than
rubber-stamping it, surfaced two things.

First, the mechanical `affected_paths` audit. Every repo-relative path the plan names in backticks
was checked against the declared set. Three are named but undeclared, and all three are correct:
`plan-lifecycle-plugin-extraction.md` and `step-ids-and-class-budget.md` are D1 *data values* — the
frozen grandfather entries — not files this plan edits, and the latter is the plan record itself,
which must never appear in `affected_paths` because acceptance writes to it. `legacy-review-records.mjs`
is cited as read-only evidence for a criteria count and is not modified. Verdict clear, with
evidence rather than assertion.

Second, a real defect. Two of the five frozen grandfather paths pointed at plans archived earlier in
this same session. The caller already grandfathers every `docs/plans/finished/` path by prefix, so
those entries were redundant — and worse than redundant: a NEW plan reusing an archived filename
would have inherited the exemption and silently skipped the Id requirement this rule exists to
impose. The set now holds only the two plans still active when the Id column landed, and D1 states
both routes to the exemption. Fixed at `219e900`, with a probe that fails with
`must be treated as a new plan` when the stale entries are restored.

**Draft review of this successor returned two findings; both were right and both are fixed.**

The first overruled the predecessor's deferral of `F3`, correctly. The plan changes the required
`PlanReviewV1` finding shape, and both shipped reviewer wrappers still instructed a reviewer to emit
the pre-`class` object the validator rejects. The predecessor genuinely could not fix that —
`affected_paths` is inside `plan_sha256` and a `repairing` completion phase cannot move it — but
this successor is `drafting`, where that table may legally change. Both wrapper paths are declared,
Step 2 carries them, and `A9` greps each wrapper for the new shape. A shipped consumer left
documenting a contract this plan replaced is incomplete scope, not a follow-up.

The second found that `A7` could not do its job: `git diff --exit-code -- docs/plans/finished`
compares only the working tree with the index, so a committed change to a historical finished plan
was invisible to it — and Steps 1-6 commit. `A7` is now a range diff over
`execution_parent..implementation_commit`, which is the form that can actually fail.

**Two contradictions from completion invocation 1, both fixed at `426860f`.**

`C2` — the feature could not run past its second draft round. `review-policy.mjs` still enforced
`invocation !== 1 && invocation !== 2` for every `PlanReviewV1` binding and result, while the draft
budget had become one initial round plus the closed vocabulary. `dispatch-review.mjs` computes
`invocation = phase.invocations + 1` and hands it to `createPlanReviewBundle`, so a third draft
round — precisely what the class budget exists to permit — would have thrown inside the reviewer
policy before any review happened. The plan shipped a budget its own validator forbade spending.

The bound is now split by review type and derived from `PLAN_FINDING_CLASS_VOCABULARY`, so no
literal ceiling exists to drift from the vocabulary; completion review keeps `1..2`. The obvious
wrong fix is tested against: widening the shared bound for both paths instead of splitting it fails
the case requiring `CompletionReviewV1` at invocation 3 to be rejected, which is STOP condition 7.

`C1` — all four shipped contract copies still enumerated the stale five-path frozen grandfather set
while the validator holds two. They now state both routes and why an archived plan carries no frozen
entry. `docs/plans/AGENTS.md` is 499 lines against its 500 cap, and the template still generates it
byte-for-byte, verified by extracting the fenced block and comparing digests rather than by eye.

**A clarity change deliberately NOT made here.** Correcting the wrappers for `class` left them
stating that "each finding" carries it. Both wrappers are draft-only — neither mentions
`CompletionReviewV1` — so the claim is true in scope, but it reads as universal and naming
`PlanReviewV1` would be clearer. That is a clarity improvement, not a correctness fix, and the
contract allows exactly one implementation replacement per repair, already spent on `426860f` for
the two real findings. Rather than spend a second checkpoint on wording, the change is held as a
patch for `plan-lifecycle-plugin-extraction`, which declares both wrapper files and the
`codex-agent-templates.md` copy carrying the same stale shape, so all three land together.

**A claim checked and rejected, recorded because the check is the evidence.** It was put to me that
`dispatch-review.mjs` builds the class-bearing prompt for both phases, so any completion review
returning `repair` would emit an unrecordable result through the shipped path. Measured: `PHASE` is
the hard-coded constant `'draft_review'` at `dispatch-review.mjs:44`, and `completion_review` never
appears in that file. The driver is draft-only, `buildPlanReviewPrompt` only ever serves the draft
path, and `class` is required there. There is no shipped path on which that prompt reaches
`validateCompletionReview`. No change was made, because none was warranted.

**A real drift this plan may not touch, with a named owner.**
`plugins/docks/skills/productivity/plan-workspace/references/codex-agent-templates.md:80-81` still
documents the pre-`class` draft finding shape, which now contradicts the wrappers this plan
corrected. It is outside these twenty-two `affected_paths`, and this run is `ongoing`, so the path
set can no longer move: declaring it would require another replacement, and editing it undeclared is
STOP condition 6. It is already declared by `docs/plans/active/plan-lifecycle-plugin-extraction.md`,
which owns and relocates that file, so the correction belongs there. Recorded rather than silently
carried or quietly fixed.

**One harness error, recorded because it was mine and not the code's.** My first completion dispatch
required a `class` key on `CompletionReviewV1` findings. The validator rejected it with
`CompletionReviewV1 finding contains unknown field class`, and it was right: the class vocabulary is
scoped to draft review by design, and extending it to completion review is explicitly out of scope.
The verdict and its two findings were unaffected; the field was stripped and the result recorded
unchanged.

### Acceptance

| ID | Result |
|---|---|
| A1 | `node scripts/tests/plan-orchestration.mjs --case plan-self-check` — exit 0, `plan-orchestration: 27/27 passed`; grandfather advisories, new-plan identifier enforcement, and known/unknown/duplicate guard citations all named |
| A2 | `node scripts/tests/plan-orchestration.mjs --case plan-self-check` — exit 0, `plan-orchestration: 27/27 passed`; numeric `Depends` accepts an earlier display number and rejects missing, equal and forward references. Same command as A1 by the plan's own text; recorded separately because the criteria table lists it twice |
| A3 | `node scripts/tests/plan-orchestration.mjs --case review-budget` — exit 0, `plan-orchestration: 25/25 passed`, including the class-derived draft bound |
| A4 | `node scripts/tests/plan-orchestration.mjs --case dispatch-driver` — exit 0, `plan-orchestration: 12/12 passed`, including `ok - plan-dispatch-probes: class-sweep-before-reserve`, whose realistic Review-body case now bites |
| A5 | `node scripts/tests/plan-skill-phases.mjs --case bounded-workflows` — exit 0, `three-skill, one-wrapper bounded plan workflows passed` |
| A6 | `node scripts/tests/plan-orchestration.mjs` — exit 0, `plan-orchestration: 209/209 passed`. It was 205/205 at `9107d10`; the repairs added the Review-section grandfather case, the repairing-transaction case, and the archived-path reuse case |
| A7 | `git diff --exit-code 7328cb5..<implementation_commit> -- docs/plans/finished` — exit 0, no output. The range form is the binding one; the working-tree form the predecessor used could not see a committed historical change |
| A8 | `node scripts/ci.mjs --plugin docks` — exit 0, `All ci.mjs checks passed — plugin 'docks'; safe to release.` The full `node scripts/ci.mjs` also passes across all three plugins and repo-wide |
| A9 | `grep -n 'id,kind,class,locator,defect,fix' plugins/docks/agents/plan-reviewer.md .codex/agents/plan-reviewer.toml` — exit 0, one match in each shipped wrapper |

### Live-tooling safety

`plan-run.mjs`, `dispatch-review.mjs`, `plan-self-check.mjs` and `review-policy.mjs` drive every plan
transition in this repository, including the transitions of this run. After each change
`import(plan-run.mjs)` resolves and `dispatch-review.mjs --help` runs, now listing
`--class-sweep-ledger=<file>` before `--commit`.

### A reliability observation outside this plan's scope

Two full-gate runs during this work failed on `session-relay self-test failed (jobs-1)` — an exit
status, not output drift — out of roughly nine. The direct reproduction attempt did not reproduce it:
26 consecutive jobs-1 runs against a prebuilt release binary all exited 0, and a six-iteration
jobs-1-versus-jobs-4 comparison was byte-identical 6/6. The distinguishing factor is that the gate
builds a fresh binary and runs under concurrent load. Nothing under `plugins/session-relay/` is in
this plan's `affected_paths` and nothing there was modified by this run, so this is recorded as an
observation for a successor rather than treated as this plan's defect. It is stated because a
release gate that fails roughly one time in five is a real risk, and omitting it would hide that.
