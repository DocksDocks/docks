---
name: plan-manager
description: Use when an existing-plan needs list/show/lifecycle handling, review preparation and dispatch, start, block, unblock, schedule, complete, ship, or publish as a GitHub issue. Sole schema-6 orchestrator for reconciliation, receipts, persisted no-progress state, and lifecycle writes. Not for drafting a new plan (use plan-creator), workspace setup (use plan-workspace), or sealed-bundle evidence (use plan-reviewer internally).
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-07-22"
  content_hash: "a790ff05221a21875b1dd082759640c3818434096785a17edb281008c9074f12"
---

# Plan Manager

Own the public lifecycle of existing plans in `docs/plans/active/` and
`docs/plans/finished/`. Main-context plan-manager is the sole schema-6 review
dispatcher, finding reconciler, orchestration-family/receipt writer, lifecycle
writer, intent applier, and sole persister of current-user-authorized
administrative abandonment. Internal `plan-reviewer` returns typed read-only
evidence.

Historical `plan-improver` is not a live skill; `plan-repairer` returns one exact patch or `cannot_repair`, and `plan-manager` alone validates, applies, and persists the result.

Use direct implementation for a clear low-risk change describable as one concrete diff with one bounded acceptance path. Use a canonical plan for multi-commit work, scheduling, cold handoff, an unresolved approach, a cross-subsystem or public-contract change, destructive or security-sensitive work, or an explicit user request. Never create a placeholder plan merely to unlock review.

<constraint>
**Creation has a separate owner.** For a creation request, determine the
canonical active path and prove it does not exist, then route to public
`plan-creator`. Never draft, self-review, write, or commit the new plan.
`plan-creator` returns `PlanCreatedV1`. Main must treat it as turn-terminal
unless the same current-user request explicitly asked to create and review.
</constraint>

<constraint>
**Sole-writer orchestration.** The plan-manager role alone commits and reads
back orchestration state, prepared requests, single-candidate commitments, terminal
families, receipts, attempt settlement, and lifecycle changes. Main context
alone owns `plan-reviewer` dispatch, finding reconciliation, user-authorized
abandonment, and any `plan-repairer` call. A manager wrapper may prepare or
apply exact caller-supplied typed data but cannot decide, abandon, or dispatch;
it returns the exact main-context handoff.
</constraint>

<constraint>
**No renewable review loop.** Persist and read back orchestration before
sealing. Same-input orchestration permits attempt 1 and at most one explicitly
user-authorized administrative attempt 2 after a retryable stop. Every
authorized dispatch creates a new reviewer with the same runtime-current
identity; no handle or session is resumed. Stuck state, attempt-2 failure,
nonretryable stop, duplicate apply, or metadata-only edits never open another
series.
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

## Pre-review routing and caller terminals

|Observed condition|Owner and next action|Forbidden action|
|---|---|---|
|No plan identity; clear low-risk direct task|main implements and runs targeted verification|create/review/repair a canonical plan|
|New canonical plan requested/required|creator drafts, self-reviews once, returns `PlanCreatedV1`|automatic manager review|
|Planned/scheduled explicit review or lifecycle start/fire|manager runs the existing bounded schema-6 operation|more than one full + one repair round|
|`ongoing`; only catalog/generated-manifest/external snapshot/pin/hash/count changed; nine authority boundaries unchanged|implementation rebinds observed execution inputs and reruns the failed gate once|begin/prepare/dispatch/repair plan review|
|Goal, scope, affected paths, safety authority, budget/resources, architecture/interfaces, acceptance contract, lifecycle intent, or settled user decision changed|plain turn-terminal response to block and explicitly amend; later review the amended blocked plan|infer amendment, create orchestration evidence, or review stale plan|
|Ambiguous pre-review drift|plain turn-terminal response naming the unresolved boundary and allowed amendment action|emit orchestration `NeedsUserAction` or default to review|
|Exact caller-held schema-6 result|manager settles immediately through the atomic family reducer; pass may consume one eligible intent, non-pass stops|fresh bundle/reviewer/repairer|
|Attempt-1 retryable `stopped` plus exact current-user authorization|begin same-key attempt 2 once|automatic retry, attempt 3, or retry from `stuck`/nonretryable state|
|Other terminal result for the same `(phase,intent_group,input_sha256)`|render/stop or consume the one eligible intent|reprepare, redispatch, or metadata reset|
|Completion requested after implementation|completion review only|another draft review|

Execution rebind is operation-local: one rebind plus one rerun of the failed command. If observations do not change or the same mismatch remains, return one plain turn-terminal user action; never repeat rebind or open review.

`turn-terminal` is the final user response for this turn: no later tool, subagent, review, repair, retry, reprepare, plan, or lifecycle action. `invocation-terminal` is the final result of the current child skill or wrapper; main may consume it in the same turn. `candidate-terminal` is any typed output or failure from the sole runtime-current reviewer. It ends that reviewer invocation and returns once; no transport, provider, model, or candidate fallback follows.

Every completed main manager operation—successful settlement, intent application, no-op result, or user action—is turn-terminal. Reviewer outputs, repairer results, `PlanCreatedV1`, and delegated wrapper handoffs are invocation-terminal. Direct helper returns inside main are intermediate.

An exact caller-held schema-6 result settles immediately through the atomic family reducer: pass may consume one eligible intent, while non-pass stops. It never creates a fresh bundle or dispatches a reviewer or repairer. Any other terminal result for the same `(phase,intent_group,input_sha256)` stops or consumes the one eligible intent without reprepare, redispatch, or metadata reset. Attempt 2 begins only from an attempt-1 retryable `stopped` result plus exact current-user authorization; it is never automatic, never attempt 3, and never available from `stuck` or nonretryable state. Completion requested after implementation routes only to completion review, never another draft review.

Emit concise progress text only, not `PlanProgressV1`: `Plan review: attempt A/2, round R/2, stage <full|repair|settling>`. Update only on stage changes; schema 6 has no candidate-fallback stage.

`plan-workspace` alone maintains the workspace; `plan-creator` alone creates a
missing plan. Normalize `docs/plans/active/<slug>.md` and check active/finished
identities: an existing identity is an existing-plan request or STOP, never
overwrite permission. Accept only the creator's closed
`PlanCreatedV1 {plan_path,creation_commit,planned_at_commit,plan_input_sha256,status}`.
Review intent `none` is valid only when the same current-user request asked for it.

```text
BAD: manager drafts or commits the missing plan, then asks creator to continue.
GOOD: manager proves the canonical path absent and returns the creator route.
```

## Current policy and historical boundary

Resolve `runtimeCurrent` from the invoking runtime's current model identity.
Never substitute from an environment variable, config, mutable catalog,
`Docks-workflow-models:` record, wrapper override, or user preference.

```text
CurrentReviewPolicyV6 = {schema:6,role:"primary",fallback:"none",max_rounds:2,candidates:[runtimeCurrent],provenance:{role:"skill_default",fallback:"skill_default",max_rounds:"skill_default",candidates:"runtime_global"}}
```

`runtimeCurrent` exactly matches `request.author` company, tool, model, and
effort. Codex additionally has `service_tier:"default"`; Claude has no
`service_tier`. Request candidate identity must equal `request.author`. There
is exactly one candidate; no user, wrapper, record, transport failure, or
reviewer failure may add, narrow, reorder, or replace it. Re-resolve before
preparation and apply; identity or policy drift invalidates evidence.

Schemas 1–5 are validation-only. Schema 5 retains availability-only fallback
and exact ordered candidates `openai/codex/gpt-5.6-sol/high` with default
service tier, `anthropic/claude/fable/high`, and
`anthropic/claude/opus/xhigh`. Preserve every historical byte and behavior;
never emit an old schema currently or rewrite persisted historical evidence.

Read persisted author identity and `review_waivers`; do not claim those creation
fields. Ask once before first current review when legacy company is `unknown`.
Write a current waiver only from explicit current-user instruction as strict
one-line JCS bound to phase, canonical input, exactly `roles:["primary"]`,
actor, reason, and time. Duplicate/conflicting bindings STOP.

## Persisted orchestration

Persist only recursively closed, helper-validated unfenced records:

```text
Review-orchestration-state: <compact JCS ReviewOrchestrationStateV1|V2>
Review-orchestration-prepared-request: <compact JCS ReviewPreparedRequestV1>
Review-orchestration-dispatch-commitment: <compact JCS ReviewDispatchCommitmentV1>
Review-orchestration-controller-abort: <compact JCS ReviewControllerConfigAbortV1>
Review-orchestration-abandonment: <compact JCS ReviewOrchestrationAbandonmentV1>
```

The active StateV1/V2 binds plan path, phase, lifecycle intent, input hashes,
attempt `1|2`, series/request identities, round `1|2`, status, stop reason,
series/apply/transition/retry fields, and its self-hash. A terminal StateV2
additionally embeds and self-hashes a deep copy of the exact active source
state. Controller-abort and abandonment use distinct StateV2-only
`stuck`/nonretryable reasons, are apply-ineligible, and are disjoint from each
other and from ReviewSeries/receipt families.

The renewable key is
`(plan_path,phase,intent_group,current_input_sha256)`. Map fire/auto to
`scheduled_execution`, completion to `completion`, and other draft intents
literally. Lifecycle metadata, timestamps, receipts, and all validated machine
records are excluded from substantive input; they cannot manufacture progress.

Use only `<plan-reviewer-skill-dir>/scripts/review-policy.mjs` for
canonicalization, hashing, schemas, sealing, and:

```text
beginReviewOrchestration; advanceReviewOrchestrationRepair
settleReviewOrchestration; settleReviewOrchestrationFamily; consumeReviewIntent
prepareReviewRequest; buildReviewDispatchCommitment; prepareReviewerWorkspace
dispatchCommittedReviewer({repo,planPath,committedPlanCommit,
 expectedPreparedRequestSha256,expectedDispatchCommitmentSha256,
 proposedControllerConfig,controllerAdapter})
advanceReviewOrchestrationRepairFamily; abortReviewControllerConfig
abandonReviewOrchestration; validateReviewTerminalFamily({currentPlanBytes,parentPlanBytes})
replaceReviewTerminalFamily
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
`controller_contract_failure|authorized_abandonment` are StateV2-only,
nonretryable, seriesless, receiptless, and apply-ineligible. They never offer
attempt 2, repair, settlement, or intent consumption.

`plan-structure` verification consists of frontmatter, parser, hash, plan-only commit, and read-back checks for authoring, review, repair, receipt, and lifecycle-only edits. It runs no implementation acceptance command, build, lint, typecheck, test suite, or CI.

`targeted implementation` verification applies only after code changes: run the
smallest acceptance reproduction or smoke path plus directly affected tests.
Expand only for shared/generated/public/security/release surfaces or a concrete
targeted failure. Run a `final repository gate` once only when project policy
requires it for the final implementation tree. Plan-only commits reuse green
evidence while implementation bytes are unchanged. Completion review consumes
the sealed plan, committed diff, and acceptance inventory; manager-owned
observations supply only missing implementation/CI contract proof.

The bound implementation identity is SHA-256 of compact JCS over sorted
`affected_paths` entries. Each entry binds the exact repo-relative path, Git
kind/mode, and blob SHA-256, or an explicit tombstone for absence. Exclude the
plan/orchestration path unless it is itself an affected implementation path.
Before reuse, recompute and require exact digest equality. A plan-only metadata
or orchestration commit preserves the digest. Any affected-path byte, mode,
kind, or presence change invalidates reuse and requires verification selected
from the changed implementation surface. This contract does not change closed
review-policy schemas.

When the active plan changes the canonical review controller, `plan-manager`,
or `plan-reviewer` mechanism it would use for its own completion, same-checkout
self-dispatch is forbidden. Return `NeedsUserAction`; require an independent
trusted released or pinned bootstrap reviewer path, or a later fresh session
using the invoking runtime's same current model with a trustworthy controller.
Never repair, reseal, or replace orchestration in place to evade this boundary.
A `stopped` or `stuck` result, including any attempt-2 failure, returns
`NeedsUserAction` without automatic reprepare or retry.

## Current-plan evidence provenance

Reviewer evidence is limited to the exact committed plan blob/path/`HEAD`,
committed sealed-bundle blobs, and bound managed-workspace identity. Uncommitted,
ignored, or generated out-of-bundle bytes cannot become findings or repair targets.
Before begin, prepare, dispatch, or repair, require those exact bindings; mismatch
is pre-review provenance drift and returns one plain turn-terminal corrective
action with no review operation.
Never attribute drift to another session without a proving lease/session identity.
Mandatory leases, session branches, integration checkout, cleanup tooling, and a
race suite require a separate ownership audit; no `docks session` CLI is promised.

## Prepare and dispatch

Valid draft intents: `none|start|schedule_fire|auto_execute`. Completion is
phase `completion`, intent `none`.

1. Confirm existing-plan state permits the operation; require clean plan and
   affected paths and validate the project contract.
2. Compute canonical input and inspect committed orchestration. Call
   `beginReviewOrchestration` only when no-progress rules permit.
3. Persist the active state in a plan-only commit and read back exact bytes/hash.
4. Resolve/hash policy 6, validate an exact primary-role waiver, seal manifest
   schema 5/6, and build the closed request matching committed active state.
5. Call `prepareReviewRequest` with explicit continuation evidence: initial
   rounds pass `null`/`null`; repair passes exact active state/series; attempt 2
   passes exact stopped state/series. Commit the deep copy plan-only, read back,
   and revalidate before constructing controller configuration or argv.
6. Verify the sealed bundle's absolute safe path and request-bound digest. For
   Codex, call `prepareReviewerWorkspace` before commitment and validate exact
   request/leg/path/sentinel identity plus managed root/path containment,
   owner/mode, and non-symlink status; Claude uses `null`.
7. Require the request candidate identity to equal `request.author`. Call
   derivation-only `buildReviewerArgv`, then `buildReviewDispatchCommitment`.
   The record binds state/request/sole candidate, exact bundle path/digest,
   derived argv/hash, `orchestrator_tool/600`, exact
   `prior_attempts:[]` plus `sha256(JCS([]))`, and a deep copy of the complete
   non-secret `reviewer_workspace` plus its JCS hash. Require
   `candidate_index === 0`.
8. Write that commitment in a separate plan-only commit and read back its plan
   blob before returning `NeedsMainReviewDispatch` with exact commit, expected
   request/commitment hashes, and proposed config. The envelope is gate input,
   never reusable launch authorization.

Prepare changes no lifecycle field. Escape, submodule, dirty scope, duplicate/
malformed record, stale state, seal mutation, mismatch, invalid retry, attempt
3, or invalid repair transition STOP.

Main context creates one new reviewer for the round only through
`dispatchCommittedReviewer({repo,planPath,committedPlanCommit,
expectedPreparedRequestSha256,expectedDispatchCommitmentSha256,
proposedControllerConfig,controllerAdapter})`. This is the sole consuming
process boundary. Never resume a reviewer handle/session and never use Session
Relay. The gate requires `committedPlanCommit` to equal current `HEAD` and be a
single-parent plan-only commit, reads the exact plan blob from Git, then
validates expected hashes, state/request/policy/sole candidate,
`candidate_index:0`, `prior_attempts:[]` and its hash, sealed bundle
path/content digest, and committed workspace record/hash. For Codex it
independently validates workspace root/path, owner/mode, non-symlink status,
and sentinel before rederiving argv with the committed workspace and empty
prior attempts; Claude requires null workspace. It verifies argv/hash
separately.

Before dispatch the gate also compares current worktree bytes at `planPath`
byte-for-byte with
`git show <committedPlanCommit>:<planPath>` (or requires equivalent plan-path
cleanliness). Uncommitted post-commit plan drift, nonempty prior attempts, or a
candidate index other than zero calls the adapter zero times.
Bundle/workspace identity is not caller-supplied controller configuration.
Exact JCS comparison of `proposedControllerConfig` covers only candidate index,
argv/hash, and fixed `orchestrator_tool/600` timeout fields.

Only after all checks pass may the gate call trusted
`controllerAdapter.dispatch({tool,argv,timeout_mode,timeout_seconds})` exactly
once using only committed values. Stale HEAD, missing/substituted records,
non-plan-only or multi-parent commit, argv/config/hash drift, or proposed
timeout 650 calls the adapter zero times. `buildReviewerArgv` is derivation-only
and neither its output nor the commitment is reusable process authority.
Collectors validate `ReviewerOutputV6 → RawReviewV6 → ReviewRunV6 →
ReviewSeriesV6` and reject cross-schema pairs.

The sole runtime-current reviewer is launched once. Its typed output or failure
is terminal for that invocation and returns once. Never switch transport,
provider, model, or candidate after any result, including tool, auth, or model
unavailability, denial, timeout, transport failure, signal, nonzero exit,
invalid output, substantive output, parsed findings, or a parsed verdict.
Validated evidence, never caller labels, determines the stop reason.

For `request.phase === "draft"`, `blocking_gap` is eligible only when implementation cannot safely and correctly start because of an unresolved required user decision, contradictory goal/scope/interface, unsafe or unauthorized action, impossible dependency order, missing first executable step, or absent/non-executable acceptance contract. Code style, optional refactors/docs, speculative performance, exhaustive implementation edge cases, exact internal symbol choices, and defects best established by running the implementation are `non_blocking_gap` with rejection/defer reason `defer_to_implementation_verification`. A complete simple plan may return `pass`; there is no finding quota and no instruction to improve until perfect.

For `request.phase === "completion"`, the read-only reviewer classifies only
defects observable in the sealed plan, committed diff, and acceptance inventory:
goal, scope, public-contract, or safety contradictions; unreviewable diff
coverage; or an acceptance criterion missing from the inventory. It does not
receive or infer command results. Missing or failed required acceptance evidence
and observed runtime regressions remain manager-owned through the existing
hash-bound primary completion evidence and verdict derivation. Speculative
concerns remain nonblocking; the reviewer never runs tests or CI.

## Reconciliation and repair

For schema 6, main-context `plan-manager` accepts only blockers it independently
reproduced against the sealed input and source. Accepted and rejected IDs exactly
partition the raw findings; accepted IDs name reproduced `blocking_gap`
findings. Every rejected finding uses exactly one schema-6 reason:
`not_plan_blocking`, `not_reproduced`, or
`defer_to_implementation_verification`. A rejected finding never opens repair.

Only when the accepted blocking set is nonempty may main call `plan-repairer`,
and it calls the repairer once with exactly that set. The repairer returns one
minimal patch or `cannot_repair`, never review or lifecycle writes. After a
changed-input patch commit, call
`advanceReviewOrchestrationRepairFamily` against the exact committed round-one
source family. Its single plan-byte compare-and-swap atomically removes both the
prepared request and dispatch commitment while writing only the active
round-two state. Commit and read back that state-only family; then prepare and
commit/read back the distinct round-two request separately. Main creates a new
reviewer for round 2 through a later exact-600 commitment consumed by
`dispatchCommittedReviewer`; it uses the same invoking runtime's current model
and never resumes the round-one reviewer handle or session.

Round 2 sees only the changed canonical plan input, accepted targets, and
repair-introduced blocking regressions. No round 3, unchanged-input repair,
expansion, reset, continuation, provider/model rotation, or Session Relay
review is allowed. `cannot_repair`, unchanged input, invalid transition, or an
accepted round-two blocker terminates the series. Rejected findings remain
result-neutral and never become repair targets.

## Controller terminal recovery

`abortReviewControllerConfig` accepts only exact committed source-plan bytes
containing an active state plus its matching prepared request, with no
commitment, process evidence, terminal record, series, or receipt. It binds the
proposed candidate/argv to the request and may terminalize only when the
unchanged controller validator rejects the proposal. A valid exact-600 proposal
cannot abort, and no process/attempt/output evidence may be fabricated.

On cold re-entry, a state-only active family may continue normal preparation.
Prepared-only and prepared-plus-commitment families have lost disposable
bundle/workspace or process evidence and never dispatch automatically; do not
invent cold reconstruction.

Only main-context `plan-manager`, acting on explicit current-user bytes, may
call `abandonReviewOrchestration`. First settle any exact caller-held series.
With no series, the helper accepts an exact state-only, prepared-only, or
prepared-plus-commitment active source, removes whichever preparation records
exist, and writes the unchanged `ReviewOrchestrationAbandonmentV1` plus StateV2
`authorized_abandonment` in one CAS. Authorization proves only administrative
abandonment, never absence of uncommitted output, dispatch provenance, a review
verdict, series, receipt, retry, repair, or lifecycle apply authority.

`canonicalPlanView(bytes)` is structural and never proves transition
provenance. Before committing reducer output from either terminal path, call
`validateReviewTerminalFamily({currentPlanBytes,parentPlanBytes})` with the
candidate child and exact source-plan bytes. After the plan-only commit, read
the committed child plan blob and its single parent plan blob from Git and
rerun the validator. Parent-hash drift, missing/extra parents, source-state
substitution, or any family mismatch rejects the transition.

`replaceReviewTerminalFamily` receives the target `phase` and
`lifecycleIntent`. An `authorized_abandonment` source may be replaced only when
canonical input materially changed or target `(phase,intent_group)` differs;
the abandoned same key remains forbidden even after metadata-only edits. A
`controller_contract_failure` source still requires materially changed
canonical input; a different intent does not prove the controller fixed. Every
replacement uses fresh series/request ids, attempt 1, exact-parent CAS, and the
current canonical input hash.

## Settle and apply

`settleReviewOrchestrationFamily` is the source-plan-bound atomic boundary for
caller-held evidence. Against the exact prepared-plus-commitment parent it
validates expected state/request/commitment hashes, exact `ReviewSeriesV6`, and
the matching draft/completion receipt; calls `settleReviewOrchestration`;
removes both preparation records; writes settled StateV2 plus receipt; and
validates the child against the exact parent. Replay accepts only that exact
settled child with the same series/receipt identities and returns
`replayed:true`; same key with different bytes fails.

Pass may then consume one eligible intent through `consumeReviewIntent`;
non-pass is turn-terminal. With no caller-held series there is zero settlement
and zero redispatch. Persist one applied `ongoing/consumed` or expected rejected
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
   nonempty ordered acceptance inventory; dispatch the reviewer, which sees only
   the sealed plan, committed diff, and inventory, then reconcile as above.
4. Outside the reviewer, collect manager-owned observed acceptance and runtime
   evidence using the verification scope selected from the changed surface.
   Never duplicate a full repository gate already required and observed for the
   unchanged final implementation tree.
5. Settle; write one Review block and schema-6 completion receipt; derive
   `passed|partial|regressed`; commit only the plan.

Passed requires eligible observed evidence, goal and acceptance met, no
regression, no high finding, and no unresolved accepted blocker. Missing or
failed required acceptance evidence, an observed runtime regression, or a high
finding is regressed; other complete results are partial. Repair stays
`in_review`, preserves its timestamp, reopens affected steps, and uses the same
bounds.

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
- Prepared request and exact-600 candidate commitment commits were read back
  before any configuration construction or process spawn.
- Schema-6 candidate index was `0`, hashed `prior_attempts` was exactly `[]`,
  request candidate identity equaled `request.author`, and argv was rederived
  with that empty array.
- Commitment bound exact sealed bundle path/digest and deep-copied workspace
  record/hash; Codex workspace independently passed root/path, owner/mode,
  non-symlink, and sentinel checks, while Claude workspace was null.
- `buildReviewerArgv` remained derivation-only; only
  `dispatchCommittedReviewer` consumed current-HEAD, single-parent plan-only Git
  bytes and called its trusted adapter once, while every invalid path called it
  zero times and returned no reusable launch authorization.
- Round-two advancement atomically removed both round-one preparation records;
  its distinct prepared request was a later commit.
- Terminal reducer output passed
  `validateReviewTerminalFamily({currentPlanBytes,parentPlanBytes})` before
  commit and again on the committed child plus exact single-parent plan blobs.
- Only main context used exact current-user UTF-8 bytes to authorize
  abandonment; reviewer/repairer never committed or abandoned.
- Settle and intent consumption are distinct, once-only transitions.
- Every commit is plan-only; ship revalidates passed evidence and exact diff.

## Success criteria

- Public ownership is exactly existing-plan list/show/review/start/block/
  unblock/schedule/complete/ship/publish; creation routes to `plan-creator`.
- Main plan-manager alone dispatches, reconciles, persists orchestration/
  receipts, and writes lifecycle.
- Review has one newly created runtime-current reviewer for the full round and
  at most one newly created reviewer for a changed-input repair round;
  same-input orchestration has at most two explicitly governed attempts.
- Terminal evidence returns `NeedsUserAction`; intent is consumed at most once.
- Schemas 1–5 remain validation-only; current records are schema 6.
- Plan-only commits/read-back, completion isolation, Tier 3, and ship gate hold.
