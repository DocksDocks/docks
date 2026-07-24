---
title: Sample review plan
goal: Prove canonical policy behavior.
status: planned
created: "2026-07-12T00:00:00-03:00"
updated: "2026-07-12T00:00:00-03:00"
started_at: null
assignee: null
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: xhigh
review_waivers: []
tags: [review-policy]
affected_paths:
  - src/example.js
related_plans: []
review_status: null
planned_at_commit: "0000000000000000000000000000000000000000"
execution_base_commit: null
---

# Sample review plan

## Goal

Prove canonical policy behavior.

## Interfaces & data shapes

The fixture has one stable protected interface.

## Threat model

Threat model scope is unresolved.

## Environment & how-to-run

Run the fixture before owner resolution.

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | Verify | `src/example.js` | — | planned |
| P | Complete the exact Docks-only compatibility prerequisite before any implementation worker resumes: finish/archive the compatibility plan, release/install/cache-verify Docks under the recorded authorization, commit contiguous E/R/B, commit prerequisite closure Q with P `done`, then obtain findings-free final ordinary review F and revalidate the range. | Plan-manager-returned `docs/plans/finished/<date>-legacy-start-transition-compatibility.md` (read-only), `docs/plans/active/relay-worker-lifecycle-primitives.md` (plan-manager-only E/R/B/Q/F writes), `$HOME/.codex/plugins/cache/docks/docks/$RELEASE_VERSION/skills/productivity/plan-review/scripts/review-policy.mjs` (read-only), `$HOME/.claude/plugins/cache/docks/docks/$RELEASE_VERSION/skills/productivity/plan-review/scripts/review-policy.mjs` (read-only) | 1, 3b | planned | The exact Step-P block above passes. Q embeds one valid `DocksCompatibilityPrerequisiteReceiptV1` and changes only its pending sentence, P status, and `updated`; F's findings-free `dual|single` receipt reviews Q. The current plan retains exact E material/receipt, immutable R review, B binding, Q prerequisite evidence, and F receipt. Both released cache helpers emit byte-identical schema-1 `LegacyExecutionRangeValidationV1`; only F becomes `PLAN_COMMIT`/`PLAN_BLOB`. Effect Kit and Session Relay versions are unchanged. Any other outcome, stale cache, absent release, E/R/B/Q/F gap, non-plan delta, or authorization mismatch is STOP. P appends no acceptance event or implementation-range receipt. |

Pending until exact Step-P E/R/B and Docks release/cache verification. In Q, plan-manager replaces only this sentence with one fenced, one-line compact-JCS `DocksCompatibilityPrerequisiteReceiptV1`, changes Step P `planned` to `done`, bumps `updated`, validates the resulting blob, and commits plan-only before final ordinary review F.

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node --test` | exit 0 |
| A2 | `node --check fixture.js` | exit 0 |

## Out of scope / do-NOT-touch

- Do not change the protected fixture contract.

## STOP conditions

- Stop if the historical transition cannot be reconstructed.

## Open questions

- `threat-model-scope`: owner decision pending.

## Self-review

Review-receipt: {"schema":1}

Ordinary self-review prose remains canonical.

## Cold-handoff checklist

- [ ] The fixture is complete and independently reproducible.

## Review

*(filled by plan-review on completion)*
