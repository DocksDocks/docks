---
title: Default plan review to one GPT reviewer
goal: Make Docks use one bounded gpt-5.6-sol high Standard reviewer lane by default, with no cross-company launch and no renewable review batches.
status: planned
created: "2026-07-16T22:13:24-03:00"
updated: "2026-07-16T23:08:00-03:00"
assignee: codex
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: high
review_waivers: []
tags: [plans, review, single-reviewer, convergence]
affected_paths:
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-review/SKILL.md
  - plugins/docks/skills/productivity/plan-improver/SKILL.md
  - plugins/docks/skills/productivity/plan-init/SKILL.md
  - plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md
  - plugins/docks/skills/productivity/plan-init/references/codex-agent-templates.md
  - docs/plans/AGENTS.md
  - AGENTS.md
  - README.md
  - plugins/docks/README.md
  - plugins/docks/skills/AGENTS.md
  - plugins/docks/agents/plan-manager.md
  - plugins/docks/agents/plan-review.md
  - .codex/agents/plan-manager.toml
  - .codex/agents/plan-review.toml
  - docs/scaffold/templates/codex-plan-manager.toml.template
  - docs/scaffold/templates/codex-plan-review.toml.template
  - docs/scaffold/templates/root-AGENTS.md.template
  - scripts/tests/plan-review-policy.mjs
  - scripts/tests/plan-review-convergence-repair.mjs
  - scripts/tests/plan-review-policy-regressions.mjs
related_plans:
  - plan-review-convergence-and-improver
review_status: null
planned_at_commit: ead53b7ecf3890aaaff23337316f00366319e008
execution_base_commit: null
---

# Default plan review to one GPT reviewer

## Goal

Use exactly one normal plan-review model by default: OpenAI Codex
`gpt-5.6-sol` at `high` effort and Standard service tier. Do not launch a
cross-company reviewer. Keep review-and-repair bounded by the existing single
five-round lifetime cap and stop as soon as the GPT reviewer is ready with no
blocking finding.

## Context and rationale

The current policy-v4 validators already represent this safely without a new
schema. With `cross_company_consent: never`, X is a persisted
`not_authorized` outcome with zero attempts; S is the sole launched reviewer.
A ready, score-qualified S result validates as `outcome: single`. Historical
X/S policy and receipt records keep their embedded meaning.

The correction is therefore a default and dispatch change, not a wire-format
rewrite. `plan-improver` remains accepted-findings-only. A repair round may
inspect only the accepted S findings and the resulting delta. The series cannot
renew after `max_rounds`.


## Environment and commands

Repository: `/home/vagrant/projects/docks`

```bash
node scripts/tests/plan-review-policy.mjs --case schemas
node scripts/tests/plan-review-policy.mjs --case legs
node scripts/tests/plan-review-policy.mjs --case surfaces
node scripts/tests/plan-review-convergence-repair.mjs --case repair-series
node scripts/tests/plan-review-policy-regressions.mjs --self-test
node scripts/ci.mjs --plugin docks
node scripts/ci.mjs
```

## Steps

| # | Task | Files | Depends | Status | Done condition |
|---|---|---|---|---|---|
| 1 | Add frozen failing tests for the new review default. | `scripts/tests/plan-review-policy.mjs` (`schemas`, `legs`, `surfaces`); `scripts/tests/plan-review-convergence-repair.mjs` (`repair-series`); `scripts/tests/plan-review-policy-regressions.mjs` (mutation fixtures) | — | pending | Tests fail because current surfaces default to consent `ask` and promise two launched reviewers. |
| 2 | Change the current default and public dispatch contract to one S lane. | `plugins/docks/skills/productivity/plan-manager/SKILL.md` (`Policy resolution`, dispatch); `plugins/docks/skills/productivity/plan-review/SKILL.md` (`Input contract`, launch); `plugins/docks/skills/productivity/plan-init/SKILL.md` (`Root Snippet`, agent defaults); `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md` (review contract); `plugins/docks/skills/productivity/plan-init/references/codex-agent-templates.md` (both TOML blocks); `docs/plans/AGENTS.md` (review protocol); `AGENTS.md`, `README.md`, `plugins/docks/README.md`, `plugins/docks/skills/AGENTS.md` (public routing prose); `plugins/docks/agents/plan-manager.md`, `plugins/docks/agents/plan-review.md`, `.codex/agents/plan-manager.toml`, `.codex/agents/plan-review.toml`, `docs/scaffold/templates/codex-plan-manager.toml.template`, `docs/scaffold/templates/codex-plan-review.toml.template`, `docs/scaffold/templates/root-AGENTS.md.template` (live/generated wrappers) | 1 | pending | Resolved default is consent `never`; X has zero attempts and `not_authorized`; only S launches as `gpt-5.6-sol`/`high`/`default`; every live/generated surface agrees. |
| 3 | Keep accepted-finding repair and convergence exact. | `plugins/docks/skills/productivity/plan-manager/SKILL.md` (`Repair rounds`); `plugins/docks/skills/productivity/plan-review/SKILL.md` (`Repair review`); `plugins/docks/skills/productivity/plan-improver/SKILL.md` (`Input contract`); `scripts/tests/plan-review-policy.mjs` (`schemas`, `legs`, `surfaces`); `scripts/tests/plan-review-convergence-repair.mjs` (`repair-series`); `scripts/tests/plan-review-policy-regressions.mjs` (lifetime mutations) | 2 | pending | Accepted S findings alone become repair targets; ready terminates immediately; the lifetime cap cannot renew. |
| 4 | Synchronize skill metadata/hashes and verify. | `plugins/docks/skills/productivity/plan-manager/SKILL.md`; `plugins/docks/skills/productivity/plan-review/SKILL.md`; `plugins/docks/skills/productivity/plan-improver/SKILL.md`; `plugins/docks/skills/productivity/plan-init/SKILL.md`; `scripts/tests/plan-review-policy.mjs`; `scripts/tests/plan-review-convergence-repair.mjs`; `scripts/tests/plan-review-policy-regressions.mjs` | 2, 3 | pending | Focused gates, targeted Docks CI, the separate full project CI gate, and one GPT-only completion review pass. |

## Interfaces and invariants

- Current default: `cross_company_consent: never`.
- Sole launched review candidate: `openai / gpt-5.6-sol / high / default / cli`.
- X remains present only as the historical schema-required `not_authorized`
  raw leg with zero attempts, findings, selected reviewer, and decision evidence.
- S is the only attempted reviewer and is independently fresh, read-only,
  findings-only, request-bound, and bundle-verified.
- One passed S leg yields `outcome: single`; readiness still requires score at
  least 90 and no blocking finding.
- Repair targets equal the exact accepted S finding set. Rejected findings do
  not reach `plan-improver`.
- The lifetime series remains capped at five rounds. No continuation batch or
  reset is permitted.
- Historical policy v1-v4 records retain their persisted meanings.

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-review-policy.mjs --case schemas` | Exits 0; historical schemas remain valid and the current single-lane policy is closed. |
| A2 | `node scripts/tests/plan-review-policy.mjs --case legs` | Exits 0; X `not_authorized` has no attempt and sole S readiness produces `outcome: single`. |
| A3 | `node scripts/tests/plan-review-policy.mjs --case surfaces` | Exits 0; every live/generated contract, including both copy-only Codex templates, names GPT-only default dispatch and no cross-company launch. |
| A4 | `node scripts/tests/plan-review-convergence-repair.mjs --case repair-series` | Exits 0; only accepted S findings become repair targets and the series stops ready or at the cap. |
| A5 | `node scripts/tests/plan-review-policy-regressions.mjs --self-test` | Exits 0; mutations cannot restore cross-company default launch or renewable batches. |

## Project CI completion gate

After A1-A5 pass, run `node scripts/ci.mjs` once as the separate full repository
completion gate. Do not duplicate it inside the ordered acceptance inventory.

## Out of scope

- Do not remove X/S fields from historical schemas or rewrite old receipts.
- Do not change the implementation/assignee model policy.
- Do not add Session Relay as review evidence transport.
- Do not implement Session Relay distribution or messaging work here.
- Do not move or delete the failed immutable `docks--v0.12.8` tag.

## Failure modes and STOP conditions

- STOP if single-S operation requires changing historical receipt validation.
- STOP if any path can launch X while consent is `never`.
- STOP if accepted repair targets can include rejected or unreviewed findings.
- STOP if a later review round can reset or extend the five-round lifetime cap.
- A missing sole GPT reviewer never fabricates passed evidence.

## Cold-handoff checklist

- Exact files and commands are listed.
- Single-lane policy and historical compatibility are explicit.
- Acceptance covers dispatch suppression, model pinning, repair identity, and lifetime convergence.
- Release recovery uses a new patch after green CI; the failed tag is not moved.

## Self-review

Score: 98/100. The smallest compatible change reuses the existing validated
`X=not_authorized`, `S=passed`, `outcome=single` representation instead of
inventing a new schema. The plan preserves the hard convergence cap and keeps
`plan-improver` narrower than plan-manager.

## Review

(filled by plan-review on completion)

## Sources

- `plugins/docks/skills/productivity/plan-manager/SKILL.md:34-73` — dated
  reviewer/default policy and bounded `max_rounds` before the correction.
- `plugins/docks/skills/productivity/plan-review/SKILL.md:35-85` — schema-3
  full/repair identity, company-leg attribution, and direct Codex CLI transport.
- `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs:540-583`
  — company routing and bounded attempt sequence.
- `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs:742-755`
  — one passed, score-qualified leg yields the validated `single` outcome.
- `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs:790-909`
  — accepted-target equality and the one-series lifetime cap.
- `plugins/docks/skills/productivity/plan-init/SKILL.md:169-217` — the copy-only
  Codex wrapper source and generation path.
- `scripts/tests/plan-review-policy.mjs:1936-1955` — exact focused dispatch for
  `schemas`, `legs`, and `surfaces`.
- `scripts/tests/plan-review-convergence-repair.mjs:619-631` — closed repair
  case map and `repair-series` entrypoint.
- `scripts/tests/plan-review-policy-regressions.mjs:949-978` — mutation result
  oracle and self-test dispatcher.

## Notes

The previous completion review implemented its explicit X/S contract correctly,
but that contract did not match the user's intended single-GPT workflow. This
plan is the clean correction and does not reopen unrelated implementation work.

The first sole-S draft attempt returned one real scope omission but encoded it
as `blocking: true` with binary `confidence: 0`, so the shipped validator
correctly rejected the reviewer output. Main context independently reproduced
the omission in the public-surface assertions and added the four missing paths.
No invalid reviewer evidence or receipt was persisted.

The validated sole-S draft review reported S1-S4. Main context reproduced and
accepted all four: the missing copy-only Codex template, category-only step
paths, absent code-derived Sources evidence, and duplicated full-CI acceptance
entry. This repair changes only those accepted findings. The user's later
plugin-targeting request is tracked in a separate plan so it cannot expand this
bounded review series.

Repair round 2 reported S1-S2. Main context accepted both: restore the command
fence accidentally removed during the first repair, and cite all three affected
test entrypoints required by accepted round-1 finding S3. No other section or
design decision changed.
