---
name: plan-creator
description: "Use when drafting, self-reviewing, and committing one previously nonexistent canonical active plan as `planned` or `scheduled`. Not for workspace setup (use plan-workspace), existing-plan edits or review dispatch (use plan-manager), sealed-bundle evidence (use plan-reviewer), or accepted-blocker patch production (use plan-repairer)."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-07-22"
  content_hash: "345f347c1ea4644152c1a4ff9c933facbb3f5bff1110759660f07952cd6ee5e5"
---

# Create One Plan

Create one cold-handoff plan at a missing canonical path under
`docs/plans/active/`. The result is a plan-only creation commit and a closed
`PlanCreatedV1` handoff. Creation ends there.

## Planning entry rule

Use direct implementation for a clear low-risk change describable as one concrete diff with one bounded acceptance path. Use a canonical plan for multi-commit work, scheduling, cold handoff, an unresolved approach, a cross-subsystem or public-contract change, destructive or security-sensitive work, or an explicit user request. Never create a placeholder plan merely to unlock review.

Creation performs exactly one local self-review. `PlanCreatedV1` is invocation-terminal for `plan-creator` and turn-terminal at main unless the same current-user request explicitly asked to create and review. Main must not infer or automatically append an intent-`none` review. When review was explicitly requested, only main-context `plan-manager` may continue: it launches a newly created reviewer for the round using the invoking runtime's current model, with no reviewer resume, Session Relay review, provider/model switch, or candidate fallback.

<constraint>
Creation is an add-only boundary. Resolve exactly one canonical `docs/plans/active/<slug>.md` path and prove it does not exist immediately before the write and immediately before the commit. Create only `status: planned` or `status: scheduled`. If the path exists, the workspace contract is absent or stale, the slug is ambiguous, or the request targets an existing plan, return the conflict and STOP; never inspect the file as an invitation to edit, merge, replace, resume, or repair it.
</constraint>

<constraint>
The creation commit contains exactly the new plan path and has `planned_at_commit` as its parent. Read the committed bytes back, validate the status and canonical input hash, then return exactly `PlanCreatedV1`. Do not dispatch review, write a receipt or orchestration record, apply a lifecycle intent, transition beyond the initial status, implement a step, create a wrapper, or edit the plan after that commit. A failed add/parent/path/hash check is a hard failure, not a partial success.
</constraint>

## Phase boundary

| Concern | Owner |
|---|---|
| Workspace bootstrap, migration, audit, explicit refresh | `plan-workspace` |
| One missing canonical plan creation | `plan-creator` |
| Existing plan, review orchestration, receipts, lifecycle | `plan-manager` |
| Read-only sealed-bundle evidence | `plan-reviewer` |
| Return one exact patch for the accepted blocking set, or `cannot_repair` | `plan-repairer` |

Historical `plan-improver` is not a live skill; `plan-repairer` returns one exact patch or `cannot_repair`, and `plan-manager` alone validates, applies, and persists the result.

Only the manager and reviewer have dispatch wrappers. Run this skill inline.
Creator never selects a review candidate. Current schema 6 binds the sole
runtime-current candidate to the request author and uses `fallback:"none"`;
that later manager operation remains outside this skill.

## Inputs

Require enough information to determine:

- a lower-kebab-case slug and one canonical active path;
- a precise goal and why the work matters;
- initial status `planned` or `scheduled`;
- for `scheduled`, `trigger`, `scheduled_date` when date-triggered, and
  `auto_execute`;
- author company/tool/model/effort, affected paths, related plans, tags, and
  constraints;
- repository/runtime facts and commands that a cold executor can re-run.

Read `docs/plans/AGENTS.md` first. If it does not expose the current schema-6
contract and exact five-skill ownership, route workspace maintenance to
`plan-workspace` and STOP without creating a plan.

## Canonical path and preimage

Normalize the slug once; reject path separators, date prefixes, empty segments,
uppercase, dot segments, and aliases. The only output path is:

```text
docs/plans/active/<slug>.md
```

Check the literal path without fuzzy selection. Similar titles are context to
cite or list in `related_plans`; they do not authorize editing another path.
Capture the full current `HEAD` before writing as `planned_at_commit`. It is the
creation commit's required parent and the draft/drift base recorded in
frontmatter.

## Research before drafting

Read every cited source and affected path needed to make the plan executable.
Do not invent file names, commands, versions, interfaces, or acceptance output.
A claim that cannot be established becomes an open question or a STOP
condition. Unrelated working-tree changes belong to the user and remain
untouched.

## Required plan body

Every plan contains this base spine:

1. `## Goal`
2. `## Steps`
3. `## Acceptance criteria`
4. `## Cold-handoff checklist`
5. `## Review` with the untouched manager-owned placeholder

A substantive, multi-commit, or handoff plan also contains, or explicitly marks
`N/A — <specific reason>`:

- `## Context & rationale`
- `## Environment & how-to-run`
- `## Interfaces & data shapes` when work crosses boundaries
- `## Out of scope / do-NOT-touch`
- `## Known gotchas` and `## Global constraints` when applicable
- `## STOP conditions` for risky assumptions
- `## Self-review`
- `## Open questions` when a human decision remains
- `## Sources` for evidence anchors

The Steps table names exact paths, dependencies, statuses, and observable done
conditions. Acceptance is a nonempty ordered `ID | Command | Expected` table,
not a prose judgment. Do not create placeholders such as `TBD`, `TODO`, or
"implement later."

## Frontmatter

Use the project contract's closed fields. At creation time:

```yaml
status: planned # or scheduled
created: "<ISO-8601 with offset>"
updated: "<same creation time>"
started_at: null
review_waivers: []
review_status: null
planned_at_commit: "<full pre-write HEAD>"
execution_base_commit: null
```

Record author identity explicitly. A scheduled plan also carries only the
contract-defined schedule fields. Do not add blocked, in-review, finished,
receipt, waiver, or orchestration state.

## One local self-review

Draft in produce mode, then run exactly one evidence-backed critique pass over:

| Criterion | Required check |
|---|---|
| `standalone_executability` | a fresh weaker executor can act using only the plan and cited sources |
| `actionability` | every step has exact paths and a verifiable done condition |
| `dependency_order` | no step requires a later step's output |
| `evidence_reverification` | every cited fact was re-opened and supports the claim |
| `goal_coverage` | steps and acceptance jointly prove the goal |
| `executable_acceptance` | ordered commands have concrete expected results |
| `failure_modes` | risky assumptions have STOP or revert conditions |
| `open_questions` | no decision is silently guessed |

Repair defects found in this one pass and record a short caught/fixed list under
`## Self-review`. This is author feedback, not independent review evidence. Do
not assign a score, create a receipt, or loop until a preferred verdict.

## Open-question picker

Every genuine unresolved decision becomes a structured `## Open questions`
entry with an id, context, and either:

- `choice`: bounded options, one marked `(recommended)`, plus `custom allowed`;
- `text`: only when bounded choices would distort the decision.

Before creation, surface every entry through the runtime's native question UI
in the same turn. Incorporate answers into the draft and remove resolved
entries. If the user explicitly defers an answer, retain it as
`NEEDS CLARIFICATION` and add the corresponding STOP condition. If no native
picker exists, ask one concise numbered question and end the turn without
writing; resume only after the reply. Never hide unresolved questions in prose.

## Commit and verify

`plan-structure` verification consists of frontmatter, parser, hash, plan-only commit, and read-back checks for authoring, review, repair, receipt, and lifecycle-only edits. It runs no implementation acceptance command, build, lint, typecheck, test suite, or CI. The acceptance table selects future implementation checks; do not execute them during authoring.

1. Recheck that the canonical path is absent and `HEAD` still equals
   `planned_at_commit`; otherwise STOP and redraft against the new base.
2. Write exactly the plan path. Stage and commit only that path with an
   imperative creation message.
3. Set `creation_commit` to the resulting full `HEAD`. Verify its parent equals
   `planned_at_commit`, its changed-path set is exactly the new path, and the
   name-status is an add.
4. Read the committed plan from `creation_commit`, validate the initial status,
   closed frontmatter, required spine, self-review, acceptance table, and
   unresolved-question handling.
5. Compute `plan_input_sha256` with the canonical plan-input implementation
   supplied by the installed current policy tooling. Do not invent or duplicate
   its lifecycle-field or machine-record exclusion list.

Other staged or unstaged user changes may remain, but none may enter the
creation commit. If a plan-only commit cannot be guaranteed, STOP before
committing.

## Return

Return only this closed object after all verification succeeds:

```text
PlanCreatedV1 {
  plan_path,
  creation_commit,
  planned_at_commit,
  plan_input_sha256,
  status
}
```

All three hashes are lowercase full-width values: Git commits are 40 hex and
the input digest is 64 hex. `status` is exactly `planned|scheduled`. Do not add
review eligibility, receipt, next-action, wrapper, or lifecycle fields.

## BAD / GOOD boundaries

```text
BAD: The target exists, so update its Steps section and call that creation.
GOOD: Return the canonical-path conflict; plan-manager owns every existing plan.

BAD: Create, dispatch a reviewer, then return a richer status object.
GOOD: Commit the plan only, verify it, and return exactly PlanCreatedV1.

BAD: Guess an unanswered deployment region to keep drafting moving.
GOOD: Surface bounded options in the native picker or stop before writing.
```
