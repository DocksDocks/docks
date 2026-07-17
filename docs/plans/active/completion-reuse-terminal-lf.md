---
title: Accept terminal-LF normalization in completion receipt reuse
goal: Let the canonical completion-reuse gate validate a reviewed plan whose source blob lacks a final LF without weakening receipt, plan-delta, or review-block binding.
status: planned
created: "2026-07-17T05:30:00-03:00"
updated: "2026-07-17T05:30:00-03:00"
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
planned_at_commit: null
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
| 2 | Normalize one missing terminal LF only at completion Review application/stable-view boundaries and verify all contracts. | `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs`; focused tests; `scripts/ci.mjs` | 1 | pending | The real-plan shape passes receipt reuse, malformed UTF-8/frontmatter/section and substantive delta checks still fail, focused tests and full repository CI exit 0. |

## Interfaces and data shapes

No persisted schema changes. The helper-local normalization is:

```text
completionReviewBytes(bytes) =
  exact LF UTF-8 bytes when already LF-terminated
  otherwise the same exact bytes plus one final LF
```

`applyCompletionReviewBlock` and `completionStablePlanViewV1` consume that
normalized view. Receipt hashes and `plan_input_sha256` remain derived from the
original reviewed blob through `canonicalPlanView`.

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-review-policy.mjs --case completion-reuse` | Exits 0; schema-5 reuse accepts an exact reviewed plan blob missing only terminal LF and still rejects receipt, reviewed-head, machine-record, stable-body, and unapproved-frontmatter drift. |
| A2 | `node scripts/tests/plan-review-policy-regressions.mjs --self-test` | Exits 0; an isolated mutation that removes completion terminal-LF normalization restores the missing-LF regression and is detected. |
| A3 | `node scripts/ci.mjs --plugin docks --timings-json /tmp/docks-terminal-lf-ci.json` | Exits 0; all Docks schema, historical, mutation, skill, and plan-review gates pass. |

After A1-A3, run the separate full repository gate once with
`CI="" node scripts/ci.mjs --timings-json /tmp/docks-terminal-lf-full-ci.json`.

## Failure modes and STOP conditions

- STOP if the fix changes bytes other than appending one missing final LF.
- STOP if invalid UTF-8, malformed frontmatter, duplicate/missing `## Review`,
  substantive plan-body drift, or unapproved frontmatter drift becomes valid.
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
