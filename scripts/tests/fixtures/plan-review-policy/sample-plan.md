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

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | Verify | `src/example.js` | — | planned |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node --test` | exit 0 |
| A2 | `node --check fixture.js` | exit 0 |

## Self-review

Review-receipt: {"schema":1}

Ordinary self-review prose remains canonical.

## Review

*(filled by plan-review on completion)*
