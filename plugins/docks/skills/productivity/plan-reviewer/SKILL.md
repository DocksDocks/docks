---
name: plan-reviewer
description: Use when plan-manager dispatches an internal read-only reviewer for typed evidence over one sealed bundle under schema 6, including a single exact repair round. Not for direct user invocation, plan writes, finding reconciliation, receipts, lifecycle transitions, retry authorization, or historical review creation.
user-invocable: false
metadata:
  pattern: tool-wrapper
  updated: "2026-07-18"
  content_hash: "f9f9e4a2289b6936697685bb5345a2eeef9c09ad9f6a43df2241a2f3a2c16b2e"
---

# Plan Reviewer

Produce read-only evidence for main-context `plan-manager`. The canonical
implementation is the exact bundled
`scripts/review-policy.mjs` beside this skill. It defines canonical plan views,
sealed bundles, schemas, compact-JCS hashing, collectors, persisted
orchestration validation, and historical validation.

<constraint>
**Evidence only.** Accept one typed request from `plan-manager` and return
schema-valid reviewer evidence. Never edit the source plan, write a receipt or
`## Review`, reconcile findings, accept repair targets, authorize a retry,
apply an intent, create a follow-up plan, or change lifecycle state.
`plan-manager` is the sole dispatcher, reconciler, receipt writer, orchestration
writer, and lifecycle writer.
</constraint>

<constraint>
**One sealed input.** Read only the immutable non-git bundle named by the exact
schema-6 request. Never read the moving source worktree, resume an old reviewer,
inherit ambient model/effort/Fast state, or use Session Relay as review
evidence. Every launch pins company, tool, model, effort, service tier when
applicable, schema, request, and bundle.
</constraint>

<constraint>
**Persisted orchestration is authoritative.** A current request must bind the
latest committed, read-back `Review-orchestration-state` by series id and state
hash. The reviewer validates and echoes that binding but never creates,
advances, settles, retries, or consumes it. Any missing, stale, substituted, or
mismatched binding is invalid evidence.
</constraint>

## Ownership boundary

| Operation | Owner |
|---|---|
| Persist orchestration before sealing | `plan-manager` |
| Prepare and destroy the sealed bundle | `plan-manager` |
| Dispatch the selected reviewer candidate | main context |
| Inspect one sealed bundle and return typed evidence | `plan-reviewer` |
| Reproduce and accept/reject findings | `plan-manager` |
| Produce the one accepted-blocker patch | `plan-repairer` |
| Apply a patch, receipt, status, or lifecycle intent | `plan-manager` |

The reviewer has no writable fallback. A read-only failure is evidence for the
manager's total result reducer, not permission to switch transports, mutate the
plan, or start another orchestration attempt.

## Current schema-6 request

The current request is recursively closed:

```text
ReviewRequestEnvelopeV6 = {
  schema: 6,
  request_id: uuid,
  phase: draft|completion,
  lifecycle_intent: none|start|schedule_fire|auto_execute,
  reviewed_commit_or_head: 40hex,
  planned_at_commit: null|40hex,
  execution_base_commit: null|40hex,
  diff_sha256: null|64hex,
  acceptance_inventory_sha256: null|64hex,
  input_sha256: 64hex,
  bundle_sha256: 64hex,
  author: {company:openai|anthropic,tool,model,effort},
  policy: CurrentReviewPolicyV6,
  policy_sha256: 64hex,
  review_mode: full|repair,
  round_index: 1|2,
  previous_input_sha256: null|64hex,
  repair_targets_sha256: null|64hex,
  orchestration_series_id: uuid,
  orchestration_state_sha256: 64hex
}
```

Full review is round 1 with both repair hashes null. Repair review is round 2
with changed canonical input, the round-1 input hash, and the digest of the
exact independently reproduced and explicitly accepted blocking targets.
Nonblocking, rejected, unreproduced, empty, duplicate, or stale targets are
invalid.

The current policy is schema 6, role `primary`, availability-only fallback,
`max_rounds:2`, and this closed ordered candidate list:

```text
[
  {company:"openai",tool:"codex",model:"gpt-5.6-sol",effort:"high",
   service_tier:"default"},
  {company:"anthropic",tool:"claude",model:"fable",effort:"high"},
  {company:"anthropic",tool:"claude",model:"opus",effort:"xhigh"}
]
```

A current-turn user may narrow this to one eligible candidate for one review.
That never adds a second reviewer or changes the single primary role. Author
identity is request-bound but does not select a same-company or
cross-company leg.

## Persisted orchestration binding

Before the manager seals a current bundle, it persists exactly one unfenced
`Review-orchestration-state: <compact JCS>` line, commits it, reads it back, and
binds the request to:

- the state's `series_id`;
- the state's latest `request_ids.at(-1)`;
- its `round_index`, phase, lifecycle intent, and current input hash;
- its computed `state_sha256`.

The active state uses orchestration schema 1 and records attempt `1|2`, one
series id, one or two request ids, round `1|2`, status
`active|passed|stopped|stuck`, stop reason, series digest, apply state, prior
transition digest, and retry authorization. `active` has no series digest.
Settled state binds `series_sha256 = sha256(JCS(ReviewSeriesV6))`.

Round 2 stays in the same orchestration series and advances the state hash.
`RepairTransitionV6` binds the series id plus the previous and current
orchestration-state hashes. `ReviewSeriesV6` binds the same series id and every
round's request/state hash. A repeated state hash, changed series id, changed
policy, changed phase/intent, or completion execution-identity drift is invalid.

The reviewer does not interpret attempt renewal. Only the manager may begin
attempt 2 after a current-user authorization that exactly binds a retryable
attempt-1 stopped state and unchanged substantive input. Attempt 3, automatic
renewal, metadata-only progress, and retry after a nonretryable result are
forbidden.

## Sealed bundle

The manager uses the adjacent helper to produce and verify the immutable bundle:

1. Parse the closed plan grammar and render canonical `plan.review.md`.
2. Export sorted `affected_paths` from the exact commit/head. Missing CREATE
   and deleted paths become explicit tombstones; symlinks contribute link
   bytes and are never followed.
3. For schema 6, include only
   `reviewer-output.primary.v6.schema.json`. A full manifest has schema 5; a
   repair manifest has schema 6 and additionally seals
   `previous-plan.review.md` and `repair-targets.json`. Both carry
   `review_schema:6` and
   `reviewer_schemas.primary:"reviewer-output.primary.v6.schema.json"`.
4. Completion also seals canonical binary `completion.diff` and a nonempty,
   ordered `acceptance-inventory.json`.
5. Hash canonical manifest bytes plus length-prefixed file bytes, make the
   bundle read-only, and verify manifest, bytes, modes, commit/tree identity,
   and directory immutability before and after review.

The raw source plan is never exported through `affected_paths`; only canonical
`plan.review.md` is reviewer-visible. Mutation, path escape, duplicate,
submodule, unsupported file type, tree mismatch, or schema mismatch is a STOP.

The manager invokes current sealing with `--review-schema=6` and destroys only
the exact verified bundle:

```text
node <plan-reviewer-skill-dir>/scripts/review-policy.mjs
  destroy-bundle <bundle-path> <expected-bundle-sha256>
```

The reviewer never changes permissions or performs cleanup.

## Launch contract

Append the exact compact request to the findings-only prompt:

```text
REQUEST_JCS_BEGIN
<compact JCS ReviewRequestEnvelopeV6>
REQUEST_JCS_END
```

The output must echo that object exactly. Current Codex receives
`reviewer-output.primary.v6.schema.json`, an ephemeral read-only sandbox,
GPT-5.6-sol/high, and `service_tier:"default"`. Current Claude receives the
equivalent closed `ReviewerOutputV6` JSON schema, plan permission mode, and the
explicit Fable/high or Opus/xhigh tuple. A 600-second monotonic deadline is a
terminal result, not candidate availability.

Candidate advancement is allowed only after typed `tool_unavailable`,
`auth_failed`, or `model_unavailable`, with `output_started:false` and no parsed
result. Stop after host denial, timeout, transport failure, signal, nonzero
exit, parse/schema failure, substantive output, any parsed finding, or any
parsed verdict. Ambiguous stderr is not denial or availability proof. Each
candidate is attempted at most once and the first valid output wins.

Each attempt records its exact candidate, output-started state, child id,
deadline mode/seconds, exit or signal, raw stdout/stderr hashes, parsed result
or null, and typed result. A failed raw result cannot discard a prior valid
passed attempt; that contradiction is invalid evidence.

## Reviewer evidence

`ReviewerOutputV6` is recursively closed:

```text
{
  schema:6,
  role:"primary",
  request:<exact ReviewRequestEnvelopeV6>,
  verdict:"pass"|"non_blocking_gap"|"blocking_gap",
  checklist:{
    standalone_executability:{status,evidence},
    actionability:{status,evidence},
    dependency_order:{status,evidence},
    evidence_reverification:{status,evidence},
    goal_coverage:{status,evidence},
    executable_acceptance:{status,evidence},
    failure_modes:{status,evidence},
    open_questions:{status,evidence}
  },
  findings:[{id,criterion,status,section,path,locator,defect,fix,evidence}]
}
```

Every checklist status is
`pass|non_blocking_gap|blocking_gap`; each evidence string is nonempty. Verdict
equals the strongest status. Every gap has a matching finding and every finding
matches its criterion and status. `pass` has no findings. Unknown keys,
duplicate finding ids, request mismatch, bad hashes, or output outside the
structured object are invalid evidence.

For draft review, assess cold-handoff executability, requirement coverage,
dependency order, acceptance commands, failure modes, and unresolved
decisions. For completion review, inspect the exact sealed diff, ordered
acceptance inventory, implementation evidence, and goal/regression evidence.
The reviewer never clones a checkout or runs acceptance/CI.

Round 2 inspects only the changed plan input, the exact accepted reproduced
blocking targets, and regressions introduced by their repair. Any remaining or
new blocker is terminal evidence. A nonblocking finding is advisory and never a
repair target. The reviewer never decides whether a finding is accepted.

`RawReviewV6`, `DraftRunResultV6` or `CompletionRunResultV6`, and
`ReviewSeriesV6` preserve the exact request and reviewer output. The manager
independently reproduces findings, derives the run outcome, settles persisted
orchestration, and writes any receipt. A schema-6 draft/completion receipt adds
`settled_orchestration_state_sha256` and must match both the persisted settled
state and its embedded final series.

## Completion evidence boundary

The writable manager prepares a disposable detached checkout, runs each
acceptance row once in order plus project CI once, records exact results, and
supplies closed evidence in the bundle. The reviewer judges only those bytes
and never claims setup, execution, cleanup, reproduction, patch, or lifecycle
work. The manager derives `completion_verdict=passed|partial|regressed`.

## Historical schemas 1–5

Schemas 1–5 are validation-only. Preserve their exact request, policy,
reviewer-output, attempt, raw-run, series, repair-transition, waiver, receipt,
bundle, manifest, argv, cleanup, and byte behavior. Never create a new
historical review, upgrade a persisted record, or add schema-6 fields to a
closed historical object.

Historical X/S legs, author-company rules, numeric scores and weighted rubrics,
cross-company consent, zero-review decisions, service-tier variants, rounds
through ten, policy-v4 lifetime series, and schema-5 primary series retain only
their persisted validation meanings. They do not authorize a current X/S run,
schema-5 run, repair continuation, reset, retry, receipt, or lifecycle action.

Docks-only legacy execution-range evidence remains helper-gated and
byte-authoritative for historical validation. A plan cannot opt in through
prose, frontmatter, or waiver. Do not reinterpret that compatibility path as a
current review mode.

## BAD / GOOD

```text
BAD: read the live plan, repair a blocker, then mark the plan reviewed.
GOOD: read only the sealed bundle and return exact request-bound evidence.

BAD: treat a schema-5 receipt as permission to start another current review.
GOOD: validate it historically and require a new schema-6 orchestration.
```

## Anti-hallucination checks

- Re-hash and match the exact request, bundle, policy, series id, and active
  orchestration-state hash before evaluating content.
- Re-read every cited bundle locator before returning a finding.
- Confirm the request id is the persisted state's latest request id.
- Confirm repair mode has changed input and exact accepted reproduced blockers.
- Confirm every started attempt has child/deadline/exit/raw-output evidence
  consistent with its typed result.
- Never classify ambiguous stderr as availability or host-denial evidence.
- Never advance after output starts or any parsed result exists.
- Never claim acceptance, CI, clone, cleanup, write, reconciliation, retry,
  receipt, or lifecycle work.
- Return typed failure evidence when review cannot run; never mutate state here.

## Success criteria

- The exact `plan-reviewer` skill and adjacent helper define the current path.
- One fresh primary reviewer sees one sealed schema-6 input.
- Request, output, run, series, and settled-state bindings validate end to end.
- Fallback is limited to the three pre-output availability classes.
- One changed-input repair round is the maximum within a series.
- Historical schemas 1–5 validate without becoming current creation paths.
- The repository and source plan remain unchanged.
- `plan-manager` receives typed evidence without writer, reconciliation,
  retry-authorization, receipt, or lifecycle authority.
