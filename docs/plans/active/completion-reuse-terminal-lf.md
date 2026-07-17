---
title: Accept terminal-LF normalization in completion receipt reuse
goal: Let the canonical completion-reuse gate validate a reviewed plan whose source blob lacks a final LF without weakening receipt, plan-delta, or review-block binding.
status: planned
created: "2026-07-17T05:30:00-03:00"
updated: "2026-07-17T11:27:25-03:00"
started_at: null
in_review_since: null
assignee: codex
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: high
review_waivers: []
tags: [plans, review, compatibility, terminal-lf]
affected_paths:
  - plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs
  - scripts/tests/plan-review-policy.mjs
  - scripts/tests/plan-review-policy-regressions.mjs
related_plans:
  - single-gpt-plan-review-default
review_status: null
planned_at_commit: 1005aa7e5ace531669d34d003d36d5762fe44eec
execution_base_commit: null
---

# Accept terminal-LF normalization in completion receipt reuse

## Goal

Let `validateCompletionReviewReuse` validate the exact schema-5 completion
receipt for a reviewed plan blob that lacks a terminal LF. Preserve every
existing receipt, reviewed-head, canonical-input, stable-plan, and allowed
frontmatter-delta check.

## Context and rationale

The bounded schema-5 repair round passed, but the mandatory ship-reuse gate then
failed in `completionStablePlanViewV1`: the reviewed source plan blob did not end
in LF, while completion preparation and `canonicalPlanView` had accepted and
sealed it. `applyCompletionReviewBlock` and the stable-view comparison currently
require LF before they can partition `## Review`.

This is a byte-compatibility fix, not another repair round for the parent plan.
Normalize at most one missing terminal LF at the completion Review application
boundary. Do not relax UTF-8, frontmatter, unique-section, machine-receipt,
reviewed-head, plan-only-child, or allowed-frontmatter-delta validation.

## Environment and how to run

- Repository: `/home/vagrant/projects/docks`
- Runtime: Node 24 with frozen pnpm dependencies
- Focused tests run from repository root.
- Full gate: `CI="" node scripts/ci.mjs`

## Steps

| # | Task | Files | Depends | Status | Done condition |
|---|---|---|---|---|---|
| 1 | Add a real missing-terminal-LF completion-reuse regression and mutation. | `scripts/tests/plan-review-policy.mjs`; `scripts/tests/plan-review-policy-regressions.mjs` | — | pending | The focused test fails against the current helper because the reviewed plan blob lacks LF; the mutation driver can restore that failure if normalization is removed. |
| 2 | Normalize one missing terminal LF across completion Review application, stable-view comparison, and every reuse-time structural read of the reviewed blob; then verify all contracts. | `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs`; focused tests; `scripts/ci.mjs` | 1 | pending | The real-plan shape passes receipt reuse through optional compatibility-application and binding extraction; malformed UTF-8/frontmatter/section, substantive delta, and compatibility-record changes still fail; focused tests and full repository CI exit 0. |

## Interfaces and data shapes

No persisted schema changes. The helper-local normalization is:

```text
completionReviewBytes(bytes) =
  exact LF UTF-8 bytes when already LF-terminated
  otherwise the same exact bytes plus one final LF
```

`applyCompletionReviewBlock`, `completionStablePlanViewV1`, and every
`validateCompletionReviewReuse` structural read that requires row boundaries
consume that normalized pre-receipt view. This includes optional compatibility
application and binding extraction. Receipt hashes and `plan_input_sha256`
remain derived from the original reviewed blob through `canonicalPlanView`;
the completed plan remains strictly LF-terminated.

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-review-policy.mjs --case completion-reuse` | Exits 0; schema-5 reuse accepts an exact reviewed plan blob missing only terminal LF, exercises absent and present optional compatibility application/binding paths without byte drift, and still rejects receipt, reviewed-head, machine-record, stable-body, and unapproved-frontmatter drift. |
| A2 | `node scripts/tests/plan-review-policy-regressions.mjs --self-test` | Exits 0; an isolated mutation that removes completion terminal-LF normalization restores the missing-LF regression and is detected. |
| A3 | `node scripts/ci.mjs --plugin docks --timings-json /tmp/docks-terminal-lf-ci.json` | Exits 0; all Docks schema, historical, mutation, skill, and plan-review gates pass. |

After A1-A3, run the separate full repository gate once with
`CI="" node scripts/ci.mjs --timings-json /tmp/docks-terminal-lf-full-ci.json`.

## Failure modes and STOP conditions

- STOP if the fix changes bytes other than appending one missing final LF.
- STOP if invalid UTF-8, malformed frontmatter, duplicate/missing `## Review`,
  substantive plan-body drift, changed compatibility application/binding bytes,
  or unapproved frontmatter drift becomes valid.
- STOP if historical policy/receipt/bundle fixtures change meaning or bytes.
- STOP if the parent plan would need a third repair round; this plan owns only
  the newly discovered completion-reuse compatibility defect.

## Out of scope / do-NOT-touch

- Do not change schema 5, reviewer candidate order, repair convergence, or
  receipt rendering.
- Do not edit the parent plan's implementation or reviewer evidence.
- Do not release Docks or start Session Relay work until this plan and the
  parent plan both pass their lifecycle gates.

## Cold-handoff checklist

- The failing reviewed blob is the exact pre-receipt parent-plan commit shape.
- The normalization boundary and one-byte maximum are explicit.
- Positive, negative, mutation, targeted CI, and full CI gates are named.
- Parent-plan review evidence remains immutable and no third repair is created.

## Self-review
Review-receipt: {"input_sha256":"0cde2d2990a79a2b2c9b0d3db27760bd102cb4740af48497d6e8ddbec8e71857","outcome":"passed","phase":"draft","policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"118651100dc9116b5589a3b8813c564e343809443f7b6841071af2c3856bb5bf","diff_sha256":null,"execution_base_commit":null,"input_sha256":"0cde2d2990a79a2b2c9b0d3db27760bd102cb4740af48497d6e8ddbec8e71857","lifecycle_intent":"start","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"31b6b990-21b1-473b-9ec8-364dc29a50ee","review_mode":"full","reviewed_commit_or_head":"a634785575e98a4872f23533b5b336f76de5341b","round_index":1,"schema":5},"reviewed_at":"2026-07-17T11:27:25-03:00","reviewed_commit":"a634785575e98a4872f23533b5b336f76de5341b","reviewer":{"accepted_finding_ids":[],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"plan-review-4","denial_source":null,"exit_code":0,"output_started":true,"reason":"review completed","result":"passed","schema":5,"signal":null,"started":true,"stderr_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","stdout_sha256":"2acb76941e293a3b60a7e46fdd719fc0fc7d7d7ab1a687dd26afb312cca70b7d","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"118651100dc9116b5589a3b8813c564e343809443f7b6841071af2c3856bb5bf","diff_sha256":null,"execution_base_commit":null,"input_sha256":"0cde2d2990a79a2b2c9b0d3db27760bd102cb4740af48497d6e8ddbec8e71857","lifecycle_intent":"start","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"31b6b990-21b1-473b-9ec8-364dc29a50ee","review_mode":"full","reviewed_commit_or_head":"a634785575e98a4872f23533b5b336f76de5341b","round_index":1,"schema":5},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Steps 1-2 identify the exact production seams and tests. The plan defines completionReviewBytes, directs applyCompletionReviewBlock and completionStablePlanViewV1 to consume it, requires every validateCompletionReviewReuse row-boundary read of the reviewed blob—including optional compatibility application and binding extraction—to use the normalized pre-receipt view, and preserves canonicalPlanView over the original bytes.","status":"pass"},"dependency_order":{"evidence":"The table makes the missing-LF regression and mutation Step 1 with no dependency, then gates the implementation and verification in Step 2 on Step 1. Acceptance is ordered as focused reuse, isolated mutation, targeted Docks CI, then one separate full-repository gate.","status":"pass"},"evidence_reverification":{"evidence":"The plan requires fresh post-change evidence at four levels: A1 direct completion-reuse behavior, A2 an independent mutation that removes normalization, A3 the targeted Docks gate, and a final full repository gate after A1-A3. The named negative cases reverify that adjacent receipt, structural, compatibility-record, and frontmatter invariants remain closed.","status":"pass"},"executable_acceptance":{"evidence":"A1 and A2 are concrete existing CLI entrypoints in the sealed tests (--case completion-reuse and --self-test), each has an observable exit-code contract, and the plan specifies the new positive, absent/present optional-record, drift-negative, and mutation outcomes. A3 and the separate full gate provide exact Node commands with timing-output paths and exit-0 expectations.","status":"pass"},"failure_modes":{"evidence":"The STOP section forbids any change beyond one appended LF and explicitly retains rejection of invalid UTF-8, malformed frontmatter, duplicate/missing Review, substantive body drift, changed compatibility application/binding bytes, unapproved frontmatter drift, and historical fixture changes. Scope also stops rather than reopening a third parent repair round.","status":"pass"},"goal_coverage":{"evidence":"The Goal, Interfaces and data shapes, and Step 2 cover the reproduced missing-terminal-LF failure without changing persisted schemas or hashes. They explicitly cover Review application, stable-view comparison, optional compatibility application/binding reads, original canonical receipt input, and strict LF termination of the completed plan.","status":"pass"},"open_questions":{"evidence":"No implementation decision is left unresolved: the normalization boundary, maximum byte change, original-hash source, affected functions, positive/negative tests, mutation target, gate order, and do-not-touch surfaces are all stated. Parent-plan evidence, schema 5, reviewer selection, receipt rendering, release, and Session Relay work are explicitly out of scope.","status":"pass"},"standalone_executability":{"evidence":"The sealed manifest binds reviewed commit a634785575e98a4872f23533b5b336f76de5341b, input 0cde2d2990a79a2b2c9b0d3db27760bd102cb4740af48497d6e8ddbec8e71857, and the three affected files; the request and assignment agree on bundle SHA-256 118651100dc9116b5589a3b8813c564e343809443f7b6841071af2c3856bb5bf. The plan supplies repository, runtime, focused/full commands, exact functions, and the one-byte normalization contract.","status":"pass"}},"findings":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"118651100dc9116b5589a3b8813c564e343809443f7b6841071af2c3856bb5bf","diff_sha256":null,"execution_base_commit":null,"input_sha256":"0cde2d2990a79a2b2c9b0d3db27760bd102cb4740af48497d6e8ddbec8e71857","lifecycle_intent":"start","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"31b6b990-21b1-473b-9ec8-364dc29a50ee","review_mode":"full","reviewed_commit_or_head":"a634785575e98a4872f23533b5b336f76de5341b","round_index":1,"schema":5},"role":"primary","schema":5,"verdict":"pass"},"role":"primary","schema":5,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":5,"series":{"current_input_sha256":"0cde2d2990a79a2b2c9b0d3db27760bd102cb4740af48497d6e8ddbec8e71857","initial_input_sha256":"0cde2d2990a79a2b2c9b0d3db27760bd102cb4740af48497d6e8ddbec8e71857","policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","repairs":[],"rounds":[{"kind":"draft","outcome":"passed","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"118651100dc9116b5589a3b8813c564e343809443f7b6841071af2c3856bb5bf","diff_sha256":null,"execution_base_commit":null,"input_sha256":"0cde2d2990a79a2b2c9b0d3db27760bd102cb4740af48497d6e8ddbec8e71857","lifecycle_intent":"start","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"31b6b990-21b1-473b-9ec8-364dc29a50ee","review_mode":"full","reviewed_commit_or_head":"a634785575e98a4872f23533b5b336f76de5341b","round_index":1,"schema":5},"reviewer":{"accepted_finding_ids":[],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"plan-review-4","denial_source":null,"exit_code":0,"output_started":true,"reason":"review completed","result":"passed","schema":5,"signal":null,"started":true,"stderr_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","stdout_sha256":"2acb76941e293a3b60a7e46fdd719fc0fc7d7d7ab1a687dd26afb312cca70b7d","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"118651100dc9116b5589a3b8813c564e343809443f7b6841071af2c3856bb5bf","diff_sha256":null,"execution_base_commit":null,"input_sha256":"0cde2d2990a79a2b2c9b0d3db27760bd102cb4740af48497d6e8ddbec8e71857","lifecycle_intent":"start","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"31b6b990-21b1-473b-9ec8-364dc29a50ee","review_mode":"full","reviewed_commit_or_head":"a634785575e98a4872f23533b5b336f76de5341b","round_index":1,"schema":5},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Steps 1-2 identify the exact production seams and tests. The plan defines completionReviewBytes, directs applyCompletionReviewBlock and completionStablePlanViewV1 to consume it, requires every validateCompletionReviewReuse row-boundary read of the reviewed blob—including optional compatibility application and binding extraction—to use the normalized pre-receipt view, and preserves canonicalPlanView over the original bytes.","status":"pass"},"dependency_order":{"evidence":"The table makes the missing-LF regression and mutation Step 1 with no dependency, then gates the implementation and verification in Step 2 on Step 1. Acceptance is ordered as focused reuse, isolated mutation, targeted Docks CI, then one separate full-repository gate.","status":"pass"},"evidence_reverification":{"evidence":"The plan requires fresh post-change evidence at four levels: A1 direct completion-reuse behavior, A2 an independent mutation that removes normalization, A3 the targeted Docks gate, and a final full repository gate after A1-A3. The named negative cases reverify that adjacent receipt, structural, compatibility-record, and frontmatter invariants remain closed.","status":"pass"},"executable_acceptance":{"evidence":"A1 and A2 are concrete existing CLI entrypoints in the sealed tests (--case completion-reuse and --self-test), each has an observable exit-code contract, and the plan specifies the new positive, absent/present optional-record, drift-negative, and mutation outcomes. A3 and the separate full gate provide exact Node commands with timing-output paths and exit-0 expectations.","status":"pass"},"failure_modes":{"evidence":"The STOP section forbids any change beyond one appended LF and explicitly retains rejection of invalid UTF-8, malformed frontmatter, duplicate/missing Review, substantive body drift, changed compatibility application/binding bytes, unapproved frontmatter drift, and historical fixture changes. Scope also stops rather than reopening a third parent repair round.","status":"pass"},"goal_coverage":{"evidence":"The Goal, Interfaces and data shapes, and Step 2 cover the reproduced missing-terminal-LF failure without changing persisted schemas or hashes. They explicitly cover Review application, stable-view comparison, optional compatibility application/binding reads, original canonical receipt input, and strict LF termination of the completed plan.","status":"pass"},"open_questions":{"evidence":"No implementation decision is left unresolved: the normalization boundary, maximum byte change, original-hash source, affected functions, positive/negative tests, mutation target, gate order, and do-not-touch surfaces are all stated. Parent-plan evidence, schema 5, reviewer selection, receipt rendering, release, and Session Relay work are explicitly out of scope.","status":"pass"},"standalone_executability":{"evidence":"The sealed manifest binds reviewed commit a634785575e98a4872f23533b5b336f76de5341b, input 0cde2d2990a79a2b2c9b0d3db27760bd102cb4740af48497d6e8ddbec8e71857, and the three affected files; the request and assignment agree on bundle SHA-256 118651100dc9116b5589a3b8813c564e343809443f7b6841071af2c3856bb5bf. The plan supplies repository, runtime, focused/full commands, exact functions, and the one-byte normalization contract.","status":"pass"}},"findings":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"118651100dc9116b5589a3b8813c564e343809443f7b6841071af2c3856bb5bf","diff_sha256":null,"execution_base_commit":null,"input_sha256":"0cde2d2990a79a2b2c9b0d3db27760bd102cb4740af48497d6e8ddbec8e71857","lifecycle_intent":"start","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"31b6b990-21b1-473b-9ec8-364dc29a50ee","review_mode":"full","reviewed_commit_or_head":"a634785575e98a4872f23533b5b336f76de5341b","round_index":1,"schema":5},"role":"primary","schema":5,"verdict":"pass"},"role":"primary","schema":5,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":5}],"schema":5}}

The plan is standalone and one-purpose. Test-first ordering is explicit. The
fix is bounded to completion Review parsing, preserves the original canonical
receipt input, and names fail-closed checks for every adjacent invariant.

## Review

(filled by plan-review)

## Sources

- `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs` —
  `applyCompletionReviewBlock`, `completionStablePlanViewV1`, and
  `validateCompletionReviewReuse`.
- `scripts/tests/plan-review-policy.mjs` — strict completion-reuse fixtures.
- `scripts/tests/plan-review-policy-regressions.mjs` — isolated mutation suite.

## Notes

Authorized by the user after the parent plan's second and final repair review
passed but the mandatory receipt-reuse check reproduced `plan body must end in
LF` against the exact reviewed source blob.
