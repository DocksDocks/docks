# Embedded Template — `docs/plans/AGENTS.md`

Copy the fenced block verbatim to `docs/plans/AGENTS.md`. Also write
`docs/plans/CLAUDE.md` as the one line `@AGENTS.md`. Example timestamps are
illustrative and remain part of the template.

````markdown
# AGENTS.md — docs/plans/

Multi-commit work lives here as complete cold-handoff plan files. A fresh agent
must be able to execute a plan without conversation context. The Markdown plan
is the only tracked artifact; rendered views are disposable.

<constraint>
The five ownership boundaries are disjoint. `plan-workspace` maintains this workspace; `plan-creator` may add one missing canonical active plan; `plan-manager` is the sole public owner of every existing-plan operation, review dispatch/reconciliation, receipt, and lifecycle write; `plan-reviewer` returns read-only typed evidence over one sealed bundle; `plan-repairer` may apply one patch for the exact accepted blocking set or return `cannot_repair`. Never transfer authority between phases because one phase is unavailable.
</constraint>

<constraint>
Current records use schema 6. Schemas 1–5 are historical validation-only: preserve their bytes and validation results, but never emit a new request, output, run, receipt, waiver, manifest, or orchestration record under an old schema. A malformed, stale, unclosed, duplicate, or hash-mismatched current record fails closed before any plan mutation.
</constraint>

## Skill routing

| User intent | Skill |
|---|---|
| Bootstrap, migrate, audit, or explicitly refresh the workspace | `plan-workspace` |
| Draft and commit one previously nonexistent canonical active plan | `plan-creator` |
| List/show/review or change the lifecycle of an existing plan | `plan-manager` |
| Produce internal read-only evidence from a sealed review bundle | `plan-reviewer` |
| Apply the one accepted-blocker repair requested by the manager | `plan-repairer` |

The first three are public skills. The reviewer and repairer are internal.

## Runtime agent dispatch

Skills are canonical. Optional thin Claude/Codex wrappers exist only for
`plan-manager` and `plan-reviewer`. A manager wrapper may prepare/apply but must
return reviewer dispatch to main context. A reviewer wrapper is read-only and
returns typed evidence only. There is no workspace, creator, or repairer
wrapper. If an allowed wrapper does not resolve, run its canonical skill in the
proper context; never invent or seed another wrapper family.

## Directory layout

```text
docs/plans/
├── AGENTS.md
├── CLAUDE.md      # exactly @AGENTS.md
├── active/        # every nonterminal plan; status is frontmatter
└── finished/      # terminal archive with ship-date filename prefix
```

`active/` is multi-occupancy. There is no current-plan slot and one plan never
blocks unrelated work merely by existing. Status lives in exactly one place:
frontmatter. Only terminal shipment moves a file to `finished/`.

## Frontmatter

Every plan starts with a closed frontmatter map:

```yaml
---
title: Short imperative title, ≤70 chars
goal: One precise sentence, ≤200 chars
status: planned | ongoing | blocked | scheduled | in_review | finished
created: "2026-07-18T12:00:00+00:00"
updated: "2026-07-18T12:00:00+00:00"
started_at: null
assignee: null
review_author_company: openai | anthropic | unknown
review_author_tool: <string>
review_author_model: <string>
review_author_effort: <string>
review_waivers: []
tags: []
affected_paths: []
related_plans: []
review_status: null
planned_at_commit: <full 40-hex creation parent>
execution_base_commit: null
---
```

Status-specific fields exist only while applicable:

| Status | Additional fields |
|---|---|
| `blocked` | `blocked_reason`, `blocked_since` |
| `scheduled` | `trigger: date | manual-approval`, date trigger's `scheduled_date`, `auto_execute` |
| `in_review` | `in_review_since` set once |
| `finished` | `ship_commit` full SHA |

All times are quoted ISO 8601 with offset, captured at the write. `started_at`
is set once on the first transition to `ongoing`. `planned_at_commit` is the
parent of the plan-only add commit and the draft/drift base.
`execution_base_commit` is the plan-only first-start commit; a second plan-only
identity commit records that SHA before implementation.

## Creation boundary

`plan-creator` acts only when `docs/plans/active/<slug>.md` is absent. It writes
`planned` or `scheduled`, runs one local self-review, commits only that added
path, reads the committed bytes back, and returns exactly:

```text
PlanCreatedV1 {
  plan_path,
  creation_commit,
  planned_at_commit,
  plan_input_sha256,
  status
}
```

It never reviews, dispatches, edits the committed plan, implements a step, or
changes lifecycle beyond the initial status. Main context may later ask
`plan-manager` to review that existing plan with intent `none`.

## Body spine

Every plan contains:

- `## Goal`
- `## Steps`
- `## Acceptance criteria`
- `## Cold-handoff checklist`
- `## Review` with `(filled by main-context plan-manager after completion evidence)`

Substantive, multi-commit, or handoff plans also contain, or explicitly justify
`N/A — <reason>` for:

- `## Context & rationale`
- `## Environment & how-to-run`
- `## Interfaces & data shapes` when work crosses boundaries
- `## Out of scope / do-NOT-touch`
- `## Known gotchas` and `## Global constraints` when applicable
- `## STOP conditions` for risky assumptions
- `## Self-review`
- `## Open questions` for unresolved human decisions
- `## Sources` for evidence anchors

| Section | Contract |
|---|---|
| Goal | observable success and why it matters |
| Context & rationale | why now and why each non-obvious decision was chosen |
| Environment & how-to-run | repository, runtime, setup, exact commands and flags |
| Steps | `# | Task | Files | Depends | Status | Done when / failure action` |
| Interfaces & data shapes | exact signatures, schemas, and neighboring handoffs |
| Acceptance criteria | ordered nonempty `ID | Command | Expected` table |
| Out of scope | adjacent work and protected files stated positively |
| STOP conditions | evidence that forbids improvisation or mutation |
| Review | manager-owned completion record only |

Step status is exactly `planned|in-flight|done|blocked|skipped`. Every row names
exact paths and a verifiable done condition. Acceptance ids are unique `A1…` in
execution order. `TBD`, `TODO`, vague follow-ups, and undefined forward
references are not cold handoffs.

## Cold-handoff checklist

Each item is present and specific or carries a reason proving it is genuinely
inapplicable:

1. File manifest — every step names exact paths.
2. Environment and commands — versions, setup, variables, commands, flags.
3. Interface and data contracts — exact cross-step signatures and shapes.
4. Executable acceptance — ordered commands with expected observable output.
5. Out of scope — protected adjacent work and its blast-radius rationale.
6. Decision rationale — the why behind every non-obvious choice.
7. Known gotchas — traps otherwise available only in conversation.
8. Global constraints — exact values and limits copied from the request.
9. No undefined terms or forward references.

Then cold-read only the plan as a weaker executor and list every unanswered
decision. Repair it or make it an open question; a generic `N/A` is a defect.

## Local self-review

Before creation, critique once against exactly:

1. `standalone_executability`
2. `actionability`
3. `dependency_order`
4. `evidence_reverification`
5. `goal_coverage`
6. `executable_acceptance`
7. `failure_modes`
8. `open_questions`

Record specific passes and caught/fixed gaps in `## Self-review`. A genuine
unknown is never silently defaulted. This one-pass author check has no score and
is not canonical reviewer evidence.

## Open questions and native picker

Each unresolved entry has an id, context, and either `choice` with bounded
options, one `(recommended)`, and `custom allowed`, or `text` for a genuinely
open answer. Whenever a plan with unresolved questions is presented after a
write, surface every entry through the runtime's native question UI in the same
turn. If the user defers, retain `NEEDS CLARIFICATION` plus the matching STOP
condition. When no native UI exists, ask one concise numbered question and end
the turn without making a dependent mutation.

## Existing-plan ownership

Only `plan-manager` may:

- select or render an existing plan;
- prepare a draft/completion review and return dispatch to main context;
- independently reproduce and partition findings;
- invoke one exact accepted-blocker repair;
- persist orchestration state and canonical receipts;
- apply an eligible intent once;
- write status, schedule, block, review, completion, or archive changes;
- commit a plan-only lifecycle change.

Every write is read back. Lifecycle transitions are status-field edits and
plan-only commits; terminal shipment alone moves the plan to a unique
`finished/<ship-date>-<slug>.md` path.

## Current schema-6 review orchestration

A current review series is one full round plus at most one changed-input repair
round. A persisted orchestration attempt is `1|2`; attempt 2 requires explicit
current-user retry after attempt 1 ended with an allowed retryable stop. Model
fallback is availability-only within one attempt and never increments that
counter. No automatic reprepare, attempt 3, round 3, continuation batch, or
metadata-only progress is valid.

The exact one-line record is:

```text
Review-orchestration-state: <compact JCS object>
```

It binds schema 6, phase, lifecycle intent, canonical input, attempt, status,
stop reason, state hash, prior state when applicable, and apply state. Only a
validated `passed` or `pending` state may be consumed. Intent `none` never
changes lifecycle. A rejected lifecycle precondition persists a terminal
`apply_rejected` result without retrying.

Terminal non-executing work returns:

```text
NeedsUserAction {
  plan_path,
  phase,
  lifecycle_intent,
  current_input_sha256,
  orchestration_attempt,
  stop_reason,
  state_sha256,
  allowed_next
}
```

It returns normally without a prompt loop, sleep, hidden retry, or automatic
reprepare. Only the schema-6 policy implementation may derive stop reasons from
validated collector evidence; callers never supply a result string.

## Reviewer and repairer boundaries

`plan-reviewer` receives one sealed immutable bundle and exact current request.
It reads no moving source worktree and returns recursively closed typed evidence
for the eight checklist criteria. It never edits, reconciles, writes a receipt,
changes lifecycle, applies an intent, creates a follow-up, or dispatches an
agent.

`plan-repairer` receives only the manager-accepted, independently reproduced
blocking set and its bound prior/current input identities. It applies one
minimal section-level patch or returns `cannot_repair`. It never expands scope,
repairs advisory findings, reviews its own patch, dispatches, writes receipts,
or changes lifecycle.

Main-context `plan-manager` is the sole dispatcher and reconciler. Session
transport is never canonical review evidence.

## Canonical input and receipts

Canonical plan input excludes only the lifecycle/frontmatter and exact machine
records recognized by the installed schema-6 policy implementation. Ordinary
plan prose, including Self-review and Review prose, remains input. Never
re-create the exclusion list in a caller.

Current requests, bundles, outputs, attempt ledgers, orchestration states,
waivers, and receipts are closed and hash-bound. Draft evidence binds the exact
plan input and immutable commit/head. Completion additionally binds the exact
planned/start identities, canonical diff, and nonempty ordered acceptance
inventory with one-to-one evidence. Every write is atomic, read back, and
committed plan-only.

Historical schemas 1–5 may be validated only by their historical branches.
Their fixed schemas, manifests, fixtures, receipts, names, and canonicalization
results remain byte-compatible and never become current aliases.

## On-demand views

A status view reads every active plan, computes age/progress without writing,
and labels status with tokens such as `2d in flight`, `blocked 47d`, or
`shipped 4d ago`. Rendered HTML belongs under ignored disposable paths. The plan
Markdown and frontmatter remain the source of truth.

## Audit checks

Before claiming a plan operation succeeded, verify the exact path, closed
frontmatter, required body sections, plan-only commit path set, and relevant
hash/parent identities. Never claim a wrapper ran merely because its file
exists, never claim review passed from preparation, and never translate invalid
evidence into a lifecycle mutation.
````
