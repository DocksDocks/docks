---
title: Adopt one bounded primary plan reviewer
goal: Make new Docks plan reviews use one GPT-first reviewer role with Claude availability fallback, evidence-backed checklist findings, and at most one repair.
status: ongoing
created: "2026-07-16T22:13:24-03:00"
updated: "2026-07-17T00:21:34-03:00"
started_at: "2026-07-17T00:21:34-03:00"
assignee: codex
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: high
review_waivers: [{"actor":"user","at":"2026-07-17T00:21:34-03:00","input_sha256":"85b8c23c01242fcb4305952149839a47194dfd75d27dbf3c91f88155891746d5","legs":["X","S"],"phase":"draft","reason":"User explicitly approved the single-primary checklist recommendation and autonomous execution."}]
tags: [plans, review, single-reviewer, convergence]
affected_paths:
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-review/SKILL.md
  - plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs
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
  - target-plugin-ci-and-release-gates
review_status: null
planned_at_commit: 3d8e1c531fc65d4ebd50ee9cae5a51a34d4ab1f5
execution_base_commit: bc352e2e308e5b812903c2fdd553b6ece9528baa
---

# Adopt one bounded primary plan reviewer

## Goal

Use one logical `primary` reviewer for every substantive Docks plan. Try OpenAI
Codex `gpt-5.6-sol` at `high` effort and Standard service tier first. Advance to
Claude Fable and then Opus only when the earlier candidate is genuinely
unavailable before producing review output. Replace numeric readiness scoring
with an evidence-backed checklist. Permit one initial review and at most one
accepted-blocker repair review; never renew or reset the series.

## Context and rationale

The current policy-v4/schema-3 contract is safe but solves the wrong problem: it
models parallel X/S company legs, a 90-point gate, and up to five rounds. That
machinery made normal plan work slow and encouraged score/repair iteration. The
user explicitly wants one good GPT review, no routine cross-company review, and
a Claude best-model fallback when GPT cannot run.

This is a clean current-contract cutover, not a reinterpretation of old evidence.
Policy/request/output/run/receipt schema 5 is additive. Historical policy v1-v4,
record schemas 1-3, X/S receipts, numeric rubrics, consent records, and
compatibility fixtures keep their persisted meanings and validators. New records
contain one `primary` role and no X/S, numeric score, or cross-company-consent
fields.

The rubric categories remain useful, but weights do not. Each criterion instead
records `pass`, `non_blocking_gap`, or `blocking_gap` plus exact evidence.
`plan-improver` receives only independently reproduced, explicitly accepted
blocking findings. Non-blocking gaps stay advisory unless the user separately
changes scope. User approval remains execution authority; reviewer evidence is a
bounded quality gate, not recursive planner authority.

## Environment and commands

Repository: `/home/vagrant/projects/docks`

```bash
node scripts/tests/plan-review-policy.mjs --case current-single-lane
node scripts/tests/plan-review-policy.mjs --case current-receipts
node scripts/tests/plan-review-policy.mjs --case historical-schemas
node scripts/tests/plan-review-convergence-repair.mjs --case single-repair
node scripts/tests/plan-review-policy.mjs --case surfaces
node scripts/tests/plan-review-policy-regressions.mjs --self-test
node scripts/ci.mjs --plugin docks --timings-json /tmp/docks-review-ci.json
node scripts/ci.mjs
```

## Steps

| # | Task | Files | Depends | Status | Done condition |
|---|---|---|---|---|---|
| 1 | Freeze the new current contract before production edits. | `scripts/tests/plan-review-policy.mjs` (`current-single-lane`, `current-receipts`, `historical-schemas`, `surfaces`); `scripts/tests/plan-review-convergence-repair.mjs` (`single-repair`); `scripts/tests/plan-review-policy-regressions.mjs` (schema/fallback/checklist/round mutations) | — | pending | Tests fail because current schemas require X/S, numeric score, and the five-round policy-v4 series. |
| 2 | Add isolated schema-5 policy, request, reviewer, run, receipt, and waiver validation. | `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs` (`reviewRecordSchema`, `validatePolicy`, `validateRequest`, current reviewer schema/output, attempt classification, run/receipt validation); `scripts/tests/plan-review-policy.mjs`; `scripts/tests/plan-review-policy-regressions.mjs` | 1 | pending | New records use one primary role and the exact candidate/checklist contract; historical branches and fixtures remain byte-valid. |
| 3 | Replace current dispatch and receipt prose across every live/generated surface. | `plugins/docks/skills/productivity/plan-manager/SKILL.md`; `plugins/docks/skills/productivity/plan-review/SKILL.md`; `plugins/docks/skills/productivity/plan-init/SKILL.md`; both plan-init references; `docs/plans/AGENTS.md`; both plugin agents; both Codex agents; three scaffold templates; root/plugin READMEs and AGENTS files | 2 | pending | Every current surface says GPT-first single primary reviewer, Claude availability fallback, checklist evidence, and no default dual launch; X/S/score/five-round language is explicitly historical only. |
| 4 | Restrict improvement to one accepted-blocker repair and prove convergence. | `plugins/docks/skills/productivity/plan-improver/SKILL.md`; `plugins/docks/skills/productivity/plan-manager/SKILL.md`; `plugins/docks/skills/productivity/plan-review/SKILL.md`; `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs`; convergence and regression tests | 2, 3 | pending | Round 1 is full; round 2 exists only after accepted reproduced blockers and a changed input; a third round, reset, continuation, nonblocking target, or fallback after output is rejected. |
| 5 | Synchronize hashes and verify the current and historical contracts. | Changed skills and references; all three plan-review test drivers; `scripts/ci.mjs` | 3, 4 | pending | Focused current/historical/surface/mutation gates, targeted Docks CI, the separate full repository CI gate, and one live GPT completion review pass. |

## Interfaces and data shapes

```text
CurrentReviewPolicyV5 = {
  schema: 5,
  role: "primary",
  fallback: "availability_only",
  max_rounds: 2,
  candidates: [
    {company:"openai", tool:"codex", model:"gpt-5.6-sol",
     effort:"high", service_tier:"default"},
    {company:"anthropic", tool:"claude", model:"fable", effort:"high"},
    {company:"anthropic", tool:"claude", model:"opus", effort:"xhigh"}
  ],
  provenance: {role, fallback, max_rounds, candidates}
}
```

The candidate array and every candidate object are closed, ordered, and
nonempty. Current defaults require exactly the three rows above. A user may pin
one eligible candidate for one review; that narrows the array and does not add a
second reviewer.

```text
CurrentReviewerOutputV5 = {
  schema: 5,
  role: "primary",
  request: <exact echoed request>,
  verdict: "pass" | "non_blocking_gap" | "blocking_gap",
  checklist: {
    standalone_executability: {status, evidence},
    actionability: {status, evidence},
    dependency_order: {status, evidence},
    evidence_reverification: {status, evidence},
    goal_coverage: {status, evidence},
    executable_acceptance: {status, evidence},
    failure_modes: {status, evidence},
    open_questions: {status, evidence}
  },
  findings: [{id, criterion, status, section, path, locator,
              defect, fix, evidence}]
}
```

Every checklist status is the same three-value enum and every evidence string is
nonempty. The verdict equals the strongest checklist status. Every gap criterion
has at least one matching finding; every finding matches its criterion/status.
`pass` has no findings. A blocking finding names the exact user requirement,
safety property, or execution step that would fail.

```text
CurrentReviewReceiptV5 = {
  schema: 5,
  phase: "draft" | "completion",
  request, input_sha256, reviewed_commit,
  policy, policy_sha256,
  reviewer: {raw, accepted_finding_ids, rejected:[{id, reason}]},
  reproduced: [{id, reproduction}],
  outcome: "passed" | "not_ready" | "unavailable" | "waived",
  pre_execution_eligible: boolean,
  reviewed_at: ISO
}
```

New per-plan waivers bind `phase`, canonical input hash,
`roles:["primary"]`, actor, reason, and time. Historical waivers retain
`legs:["X","S"]`. Zero successful candidates never fabricate `passed`; the
plan stays put unless the current user explicitly waives the exact primary role
and input.

## Dispatch and convergence invariants

- Candidate order is GPT → Fable → Opus. The first valid output wins.
- Advance only after `tool_unavailable`, `auth_failed`, or `model_unavailable`
  with `output_started:false` and no parsed reviewer result.
- `platform_denied`, deadline, transient transport, signal, nonzero exit,
  unparseable/invalid output, any parsed finding, or a substantive verdict is
  terminal. Never route around host policy or shop for a favorable verdict.
- The main context independently reproduces findings and records exact accepted
  and rejected partitions. Rejected findings never become repair targets.
- `non_blocking_gap` is advisory and does not enter the repair loop.
- Accepted reproduced `blocking_gap` findings invoke `plan-improver` once.
- Repair review binds changed input, prior input, and exact repair-target digest;
  it may inspect only those targets and blocking regressions introduced by them.
- The series is exactly full round 1 plus optional repair round 2. No round 3,
  continuation batch, reset, candidate rotation after output, or hidden retry.

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-review-policy.mjs --case current-single-lane` | Exits 0; schema 5 accepts the exact GPT/Fable/Opus primary chain and only availability-class fallback before output. |
| A2 | `node scripts/tests/plan-review-policy.mjs --case current-receipts` | Exits 0; closed checklist/receipt/waiver shapes reject X/S, score, numeric rubric, missing evidence, verdict mismatch, and fallback after output. |
| A3 | `node scripts/tests/plan-review-policy.mjs --case historical-schemas` | Exits 0; policy v1-v4, record schemas 1-3, X/S receipts, and numeric rubric fixtures retain their prior validation results. |
| A4 | `node scripts/tests/plan-review-convergence-repair.mjs --case single-repair` | Exits 0; only accepted reproduced blockers reach one repair; unchanged input, nonblocking targets, reset, or round 3 fail closed. |
| A5 | `node scripts/tests/plan-review-policy.mjs --case surfaces` | Exits 0; all live/generated surfaces describe the same current single-primary contract and label old X/S/score/five-round records historical. |
| A6 | `node scripts/tests/plan-review-policy-regressions.mjs --self-test` | Exits 0; mutations cannot restore dual launch, numeric current gating, permissive fallback, nonblocking repair, or renewable rounds. |
| A7 | `node scripts/ci.mjs --plugin docks --timings-json /tmp/docks-review-ci.json` | Exits 0; all Docks-owned current/historical gates and skill/hash validators pass. |

## Project CI completion gate

After A1-A7 pass, run `node scripts/ci.mjs` once as the separate full repository
completion gate. Do not duplicate that expensive command inside the ordered
acceptance inventory.

## Out of scope / do-NOT-touch

- Do not rewrite finished plans, historical receipts, policy v1-v4, record
  schemas 1-3, legacy compatibility constants, or their byte-level fixtures.
- Do not add a routine second reviewer, cross-company consent flow, numeric score
  threshold, risk-tier dual launch, or renewable review loop.
- Do not change implementation/assignee model selection.
- Do not use Session Relay as canonical review evidence or implement Relay work.
- Do not release plugins or move/delete the failed immutable `docks--v0.12.8`
  tag in this implementation plan.

## Failure modes and STOP conditions

- STOP if the new single-role schema cannot be added without changing a
  historical fixture's result.
- STOP if fallback can occur after output starts or after host/platform denial.
- STOP if a nonblocking, rejected, or unreproduced finding can reach the improver.
- STOP if round 2 can occur without changed input and exact accepted targets, or
  if any path can create round 3.
- STOP if no reviewer succeeds and no exact current-user waiver exists; preserve
  plan state and report unavailable rather than inventing evidence.

## Cold-handoff checklist

- Exact current and historical schema boundaries are named.
- Candidate order and terminal/fallback outcomes are closed.
- Eight checklist criteria and finding linkage are explicit.
- One-repair convergence and improver scope are executable.
- Every live/generated surface and focused test entrypoint is listed.
- Release and Session Relay work remain outside this plan.

## Self-review

All eight readiness criteria pass for the revised plan. It is standalone, names
exact paths and symbols, orders schema before surfaces and convergence, preserves
historical validators, gives executable current/historical acceptance rows, and
turns the user's reviewer/fallback/rubric decisions into closed invariants. No
numeric score is used as authority.

## Review

(filled by plan-review on completion)

## Sources

- `plugins/docks/skills/productivity/plan-manager/SKILL.md` — current policy
  resolution, dispatch, reconciliation, receipt, and lifecycle ownership.
- `plugins/docks/skills/productivity/plan-review/SKILL.md` — current X/S request,
  reviewer-output, and repair-series contract to replace for new records.
- `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs` —
  `validatePolicy`, `validateRequest`, `reviewerSchema`,
  `validateReviewerOutput`, run/receipt validators, and attempt classification.
- `plugins/docks/skills/productivity/plan-improver/SKILL.md` — accepted-finding
  transformation boundary.
- `docs/plans/finished/2026-07-16-plan-review-convergence-and-improver.md` —
  historical policy-v4/schema-3 semantics that remain immutable.
- OMP plan documentation — one read-only planner, explicit user approval,
  planning skipped for trivial changes: https://omp.sh/docs/plan

## Notes

The previous completion work correctly implemented its explicit X/S contract,
but that contract did not match the user's desired normal workflow. Three
bounded sole-S draft attempts on the old schema found and repaired real plan
omissions; no invalid reviewer output or receipt was persisted, and the prepared
fourth round was never launched. Temporary bundles were destroyed.

The user approved the replacement on 2026-07-16/17: one GPT-5.6-sol high
Standard reviewer, Claude Fable then Opus availability fallback, evidence-backed
checklist statuses instead of a numeric gate, one repair maximum, and autonomous
execution. The separate targeted-CI plan was completed first, reducing full gate
wall time and preventing unrelated plugin release failures.
