---
name: plan-manager
description: Use when an existing-plan needs list/show/lifecycle handling, review preparation and dispatch, start, block, unblock, schedule, complete, ship, or publish as a GitHub issue. Sole schema-6 orchestrator for reconciliation, receipts, persisted no-progress state, and lifecycle writes. Not for drafting a new plan (use plan-creator), workspace setup (use plan-workspace), or sealed-bundle evidence (use plan-reviewer internally).
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-07-18"
  content_hash: "fab18d63b79eef0cf0a56871e38f857e9522c8c9f5ccc7f4885174e67e14d623"
---

# Plan Manager

Own the public lifecycle of existing plans in `docs/plans/active/` and
`docs/plans/finished/`. Main-context plan-manager is the sole schema-6 review
dispatcher, finding reconciler, receipt/orchestration-state writer, lifecycle
writer, and intent applier. Internal `plan-reviewer` returns typed read-only
evidence; internal `plan-repairer` returns one exact repair or `cannot_repair`.

<constraint>
**Creation has a separate owner.** For a creation request, determine the
canonical active path and prove it does not exist, then route to public
`plan-creator`. Never draft, self-review, write, or commit the new plan.
`plan-creator` returns `PlanCreatedV1`; main context may separately invoke
manager review with intent `none`.
</constraint>

<constraint>
**Sole-writer orchestration.** The plan-manager role alone persists
orchestration, seals requests, writes receipts, settles attempts, and changes
status. Main context owns `plan-reviewer` dispatch, finding reconciliation, and
any `plan-repairer` call. A manager wrapper may prepare or apply exact
caller-supplied typed data but cannot decide or dispatch; it returns
`NeedsMainReviewDispatch`.
</constraint>

<constraint>
**No renewable review loop.** Persist and read back orchestration before
sealing. Same-input orchestration permits attempt 1 and at most one explicitly
user-authorized attempt 2 after a retryable stop. Stuck state, attempt-2
failure, nonretryable stop, duplicate apply, or metadata-only edits never open
another series.
</constraint>

<constraint>
**Status is a field; commits preserve handoff.** Every write is plan-only,
read back, and auto-committed. Move only on ship to
`finished/<date>-<slug>.md`. Never create status directories, force-push, or let
another live plan block a valid operation.
</constraint>

## Public operation split

| Intent | Manager behavior |
|---|---|
| list/show | Read active and finished plans; render the requested tier |
| create/new | Prove the canonical path missing, route to `plan-creator`, write nothing |
| review | Draft `prepare(none) → dispatch → reconcile → settle`; no status change |
| start | Review with `start`; consume one eligible intent into `ongoing` |
| block/unblock | Write/clear block fields; retain `started_at` once set |
| schedule | Persist a valid trigger on an existing nonexecuting plan |
| schedule fire/auto | Review with the exact intent; remain scheduled unless apply succeeds |
| complete | Enter `in_review`, run completion review/acceptance, write derived result |
| publish/--issues | Publish the existing canonical plan as a GitHub issue; no review or status change |
| ship | Require reusable schema-6 passed completion evidence; move once |

`plan-workspace` alone bootstraps, migrates, audits, or explicitly refreshes the
workspace. `plan-creator` alone creates a previously nonexistent plan.
`plan-reviewer` and `plan-repairer` are internal with no lifecycle authority.

For creation-shaped input, normalize `docs/plans/active/<slug>.md` and check
active/finished identities. Existing identity is an existing-plan request or
STOP, never overwrite permission. When absent, return a `plan-creator` route
without pre-creating a file. Accept only its closed
`PlanCreatedV1 {plan_path,creation_commit,planned_at_commit,plan_input_sha256,status}`;
never reconstruct it. Main context may then request review intent `none`.

```text
BAD: manager drafts or commits the missing plan, then asks creator to continue.
GOOD: manager proves the canonical path absent and returns the creator route.
```

## Current policy and historical boundary

Resolve policy by instruction precedence: current-turn user >
byte-deduplicated loaded `Docks-workflow-models:` records > skill defaults.
Never read a new consumer env var, config file, or mutable model catalog.
Conflicting valid runtime records STOP; ignore one internally invalid record as
a whole and warn once.

```text
CurrentReviewPolicyV6 = {
  schema:6, role:"primary", fallback:"availability_only", max_rounds:2,
  candidates:[
    {company:"openai",tool:"codex",model:"gpt-5.6-sol",
     effort:"high",service_tier:"default"},
    {company:"anthropic",tool:"claude",model:"fable",effort:"high"},
    {company:"anthropic",tool:"claude",model:"opus",effort:"xhigh"}
  ],
  provenance:{role,fallback,max_rounds,candidates}
}
```

Candidate order/objects are exact. A current-turn user may narrow one review to
one eligible candidate, never add another reviewer. Re-resolve before reuse and
apply; any policy/provenance/order/effort/tier/transport change invalidates
evidence.

Schemas 1–5 are validation-only. Preserve their exact policy, record, schema
filename, manifest, fixture, X/S, score/rubric, consent, zero-review, candidate,
and bounded-repair behavior. Never emit them for a current operation or rewrite
persisted historical evidence.

Read persisted author identity and `review_waivers`; do not claim those creation
fields. Ask once before first current review when legacy company is `unknown`.
Write a current waiver only from explicit current-user instruction as strict
one-line JCS bound to phase, canonical input, exactly `roles:["primary"]`,
actor, reason, and time. Duplicate/conflicting bindings STOP.

## Persisted orchestration

Persist exactly one validated unfenced line:

```text
Review-orchestration-state: <compact JCS ReviewOrchestrationStateV1>
```

The closed record binds plan path, `draft|completion`, lifecycle intent,
initial/current input hashes, orchestration attempt `1|2`, series UUID, unique
request IDs, round `1|2`, `active|passed|stopped|stuck`, stop reason, series
digest, `none|pending|consumed` apply state, transition hash, optional retry
authorization, and self-hash. Validate before excluding it from canonical input.

The renewable key is
`(plan_path,phase,intent_group,current_input_sha256)`. Map fire/auto to
`scheduled_execution`, completion to `completion`, and other draft intents
literally. Lifecycle metadata, timestamps, receipts, and this record are
excluded from substantive input; they cannot manufacture progress.

Use only `<plan-reviewer-skill-dir>/scripts/review-policy.mjs` for
canonicalization, hashing, schemas, sealing, and:

```text
beginReviewOrchestration(...)
advanceReviewOrchestrationRepair(...)
settleReviewOrchestration(...)
consumeReviewIntent(...)
```

Attempt 1 begins only with no same-key state or changed substantive input.
Attempt 2 requires one `ReviewRetryAuthorizationV1` bound to exact current-user
message bytes, actor, time, path, phase, intent group, input, and the retryable
attempt-1 stopped-state hash. Reject missing, reused, mismatched, nonretryable,
attempt-2, or stuck authorization.

Return without reprepare, sleep, prompt loop, or exception:

```text
NeedsUserAction {plan_path,phase,lifecycle_intent,current_input_sha256,
orchestration_attempt,stop_reason,state_sha256,allowed_next}
```

Only attempt-1 `unavailable_auth|unavailable_model|timed_out|
unavailable_unknown|failed_unparseable` may offer one explicit retry.
`platform_denied|stale_input|cannot_repair|not_ready|apply_rejected` are
immediately stuck; every attempt-2 failure is stuck.

## Prepare and dispatch

Valid draft intents: `none|start|schedule_fire|auto_execute`. Completion is
phase `completion`, intent `none`.

1. Confirm existing-plan state permits the operation; require clean plan and
   affected paths and validate the project contract.
2. Compute canonical input and inspect committed orchestration. Call
   `beginReviewOrchestration` only when no-progress rules permit.
3. Persist active state in a plan-only commit and read back exact bytes/hash.
4. Resolve/hash policy 6 and validate an exact primary-role waiver.
5. Seal full manifest `schema:5` or repair manifest `schema:6`, both with
   `review_schema:6` and
   `reviewer_schemas.primary:"reviewer-output.primary.v6.schema.json"`.
6. Build a closed schema-6 request whose request ID, round, input, phase,
   intent, `orchestration_series_id`, and `orchestration_state_sha256` equal
   the committed active state.
7. Return exact `NeedsMainReviewDispatch`; main context dispatches once.

Prepare changes no lifecycle field. Escape, submodule, dirty scope, duplicate/
malformed record, stale state, seal mutation, mismatch, invalid retry, attempt
3, or invalid repair transition STOP.

Main dispatches one internal `plan-reviewer` over the sealed bundle. Codex uses
the bundled v6 schema file; Claude requests the same closed `ReviewerOutputV6`.
Collectors validate `ReviewerOutputV6 → RawReviewV6 → ReviewRunV6 →
ReviewSeriesV6` and reject cross-schema pairs.

First valid output wins. Candidate fallback is allowed only for
`tool_unavailable|auth_failed|model_unavailable` before output and parsing.
Denial, deadline, transient transport, signal, nonzero exit, invalid output,
parsed finding/verdict, or substantive output is terminal. Session Relay is not
review evidence. Exhausted availability uses precedence
`auth_failed > model_unavailable > tool_unavailable`; validated evidence, never
caller labels, determines the stop reason.

## Reconciliation and repair

Reproduce every finding against sealed input/source. Accepted and rejected IDs
exactly partition findings, each rejection has a reason, and nonblocking gaps
never enter repair.

Only when every raw blocker is reproduced and accepted may main call
`plan-repairer` once with that complete exact set. It returns one minimal patch
or `cannot_repair`, never review/lifecycle writes. Manager applies the patch,
commits, destroys the stale bundle through the helper, then calls
`advanceReviewOrchestrationRepair` to bind changed input, previous/current state
hashes, same series ID, prior input, and accepted-target digest. Persist/read
back repair state before round 2.

Round 2 sees only accepted targets and repair-introduced blocking regressions.
No round 3, unchanged-input repair, expansion, reset, continuation, or candidate
rotation after output. Rejected blocker, `cannot_repair`, unchanged input,
invalid transition, or any round-2 blocker terminates.
Any `blocking_gap` makes the repair run `not_ready`; the patch is rejected
during reconciliation and the same-input series settles stuck.

## Settle and apply

`settleReviewOrchestration` accepts active state once and requires exact
`sha256(JCS(ReviewSeriesV6))`. Schema-6 draft/completion receipts bind
`settled_orchestration_state_sha256` to persisted state and embedded series;
reuse revalidates state, series, request, policy, bundle, author, waiver, input,
and phase.

Atomically persist terminal state plus receipt in one plan-only commit and read
back. Intent `none` keeps apply state `none`. Eligible executing intent settles
`passed/pending`; consume it only through `consumeReviewIntent`. Persist its one
applied `ongoing/consumed` or expected rejected
`stuck/apply_rejected/none` result atomically. Malformed, stale, hash-mismatched,
or duplicate consumption throws without mutation.

On first `ongoing`, set `started_at` and capture that plan-only commit, then
record it as `execution_base_commit` in a second plan-only commit before work.
Implementation edits only `affected_paths`; manager remains sole plan writer.

## Completion and lifecycle

When all initial/reopened steps are done:

1. Set `in_review`/`in_review_since` once and commit only the plan.
2. Validate plan/start/head ancestry, clean scope, and exact original snapshot.
3. Prepare completion over canonical execution-base..head binary diff and a
   nonempty ordered acceptance inventory; dispatch/reconcile as above.
4. In a helper-owned disposable clone, run documented setup, each inventory
   row once in order, and project CI once. Never mutate the original repo.
5. Settle; write one Review block and schema-6 completion receipt; derive
   `passed|partial|regressed`; commit only the plan.

Passed requires eligible evidence, goal and acceptance met, CI 0, no
regression, no high finding, and no unresolved accepted blocker.
Unavailable/not-ready evidence, CI failure, regression, or a high finding is
regressed; other complete results are partial. Repair stays `in_review`,
preserves its timestamp, reopens affected steps, and uses the same bounds.

Lifecycle writes: first ongoing sets `started_at`; block sets actor/input reason
and `blocked_since`; unblock clears block fields but retains start; schedule
validates trigger fields; in-review sets its timestamp once. Every transition
bumps `updated`, uses one turn timestamp, auto-commits only the plan, reads back,
renders Tier 3, and surfaces unresolved questions.

Ship only when `review_status: passed` and the schema-6 completion receipt still
matches canonical input, settled state, policy, execution base, head, diff,
inventory, snapshot, waivers, and series. Move once, set `finished` and
`ship_commit`, auto-commit, and return the selected finished path.

## Publishing a plan as a GitHub issue (`--issues`)

On `--issues` or `publish <slug> as an issue`, preflight `gh auth status`, a
GitHub remote, and `gh repo view --json visibility`; any failure publishes
nothing. For a public repository, warn that the issue is public and obtain
explicit confirmation before publishing a plan that names a vulnerability,
credential location, or other sensitive finding. Missing or declined
confirmation publishes nothing. Then run
`gh issue create --title "<plan title>" --body-file <plan path>`, record the
issue URL in `## Notes`, and auto-commit only the plan. Return success and the
URL only after that commit. Do not dispatch review or change lifecycle status;
the canonical Markdown plan remains the authoritative source of truth.

## Anti-Hallucination checks

- Creation routed only after missing-path proof; manager wrote no creation byte.
- One valid orchestration line was committed/read back before dispatch.
- Current records are schema 6; full/repair manifests are exactly schema 5/6.
- Attempt 2 has exact user authorization; stuck/attempt-2 never renews.
- Repair targets are the complete accepted/reproduced blocker set.
- Reviewer/repairer wrote no plan, receipt, or lifecycle state.
- Settle and intent consumption are distinct, once-only transitions.
- Every commit is plan-only; ship revalidates passed evidence and exact diff.

## Success criteria

- Public ownership is exactly existing-plan list/show/review/start/block/
  unblock/schedule/complete/ship/publish; creation routes to `plan-creator`.
- Main plan-manager alone dispatches, reconciles, persists orchestration/
  receipts, and writes lifecycle.
- Review has one full plus at most one repair round; same-input orchestration
  has at most two explicitly governed attempts.
- Terminal evidence returns `NeedsUserAction`; intent is consumed at most once.
- Schemas 1–5 remain validation-only; current records are schema 6.
- Plan-only commits/read-back, completion isolation, Tier 3, and ship gate hold.
