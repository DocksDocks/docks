---
name: plan-reviewer
description: Use when plan-manager dispatches an internal read-only reviewer for typed evidence over one sealed bundle under schema 6, including a single exact repair round. Not for direct user invocation, plan writes, finding reconciliation, receipts, lifecycle transitions, retry authorization, or historical review creation.
user-invocable: false
metadata:
  pattern: tool-wrapper
  updated: "2026-07-22"
  content_hash: "58d205cb1e2075eec7994426e991420c78849ac9ac89a7429db8714091ff8877"
---

# Plan Reviewer

Produce read-only evidence for main-context `plan-manager`. The canonical
implementation is the exact bundled
`scripts/review-policy.mjs` beside this skill. It defines canonical plan views,
sealed bundles, schemas, compact-JCS hashing, collectors, persisted
orchestration validation, and historical validation.

<constraint>
**Evidence only.** Accept one typed request from main-context `plan-manager`
and return schema-valid reviewer evidence. Never edit the source plan, prepare
or commit a request/dispatch commitment, write a receipt or `## Review`,
reconcile findings, accept repair targets, authorize retry or abandonment,
apply an intent, create a follow-up plan, or change lifecycle state.
Main-context `plan-manager` is the sole dispatcher, reconciler, orchestration-
family/receipt writer, terminal-transition validator, and lifecycle writer.
</constraint>

<constraint>
**One sealed input and one fresh reviewer.** Read only the immutable non-git
bundle named by the exact schema-6 request. Each round launches a newly created
reviewer using the invoking runtime's current model, exactly bound to
`request.author`. Never read the moving source worktree, resume a reviewer
handle/session, use Session Relay, or switch transport, provider, or model.
Every launch pins company, tool, model, effort, service tier when applicable,
schema, request, and bundle.
</constraint>

<constraint>
**Persisted orchestration is authoritative.** A current request must bind the
latest committed/read-back active `Review-orchestration-state` and exact
`Review-orchestration-prepared-request`; the sole candidate process may start
only from a separately committed/read-back exact-600 dispatch commitment. The
reviewer echoes the request binding but never creates, advances, commits,
settles, retries, aborts, abandons, replaces, or consumes any family. Missing,
stale, substituted, or mismatched binding is invalid evidence.
</constraint>

## Ownership boundary

| Operation | Owner |
|---|---|
| Persist state, prepared request, sole-candidate commitment, or terminal family | `plan-manager` |
| Prepare and destroy the sealed bundle | `plan-manager` |
| Dispatch one newly created runtime-current reviewer | main-context `plan-manager` |
| Inspect one sealed bundle and return typed evidence | `plan-reviewer` |
| Reproduce and accept/reject findings | `plan-manager` |
| Produce the one accepted-blocker patch | `plan-repairer` |
| Apply a patch, receipt, status, or lifecycle intent | `plan-manager` |
| Persist abandonment authorized by exact current-user bytes | main-context `plan-manager` |

Historical `plan-improver` is not a live skill; `plan-repairer` returns one exact patch or `cannot_repair`, and `plan-manager` alone validates, applies, and persists the result.

The reviewer has no writable or dispatch fallback. A typed output or failure
returns once to the manager's total result reducer. It never permits a
transport, provider, model, or candidate switch, a plan mutation, Session Relay
review, or review by the same handle/session.

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

The current policy is exactly:

```text
{schema:6,role:"primary",fallback:"none",max_rounds:2,
 candidates:[runtimeCurrent],
 provenance:{role:"skill_default",fallback:"skill_default",
             max_rounds:"skill_default",candidates:"runtime_global"}}
```

`runtimeCurrent` exactly matches `request.author` company, tool, model, and
effort. A Codex candidate additionally has `service_tier:"default"`; a Claude
candidate has no `service_tier`. The request candidate identity must equal
`request.author`. The one candidate and primary role cannot be narrowed,
reordered, extended, or replaced by a user, wrapper, record, availability
failure, transport result, or reviewer result.

## Persisted orchestration binding

Before dispatch, the manager commits and reads back the active
`Review-orchestration-state`, seals the immutable bundle and constructs the
recursively closed request, then commits and reads back the exact
`Review-orchestration-prepared-request`. The request binds:

- the state's `series_id`;
- the state's latest `request_ids.at(-1)`;
- its `round_index`, phase, lifecycle intent, and current input hash;
- its computed `state_sha256`.

The active state is an eligible StateV1 or nonterminal StateV2 and records
attempt `1|2`, one series id, one or two request ids, round `1|2`, status,
stop reason, series digest, apply state, prior transition digest, and retry
authorization. `active` has no series digest. Settled state binds
`series_sha256 = sha256(JCS(ReviewSeriesV6))`.

Round 2 stays in the same orchestration series, advances the state hash, and
uses changed canonical input. It launches a newly created reviewer with the
same invoking runtime's current model; it never resumes the round-1 reviewer.
`RepairTransitionV6` binds the series id plus the previous and current
orchestration-state hashes. `ReviewSeriesV6` binds the same series id and every
round's request/state hash. A repeated state hash, changed series id, changed
policy, changed phase/intent, or completion execution-identity drift is invalid.

The reviewer does not interpret attempt renewal. Only the manager may begin
attempt 2 after a current-user authorization that exactly binds a retryable
attempt-1 stopped state and unchanged substantive input. Attempt 3, automatic
renewal, metadata-only progress, and retry after a nonretryable result are
forbidden.

`plan-structure` verification consists of frontmatter, parser, hash, plan-only
commit, and read-back checks for authoring, review, repair, receipt, and
lifecycle-only edits. It runs no implementation acceptance command, build,
lint, typecheck, test suite, or CI.

`targeted implementation` verification applies only after code changes and
uses the smallest acceptance reproduction or smoke path plus directly affected
tests. `expanded implementation` verification adds dependent or representative
consumer checks only for shared harness, configuration, generated,
public-contract, security, or release surfaces, or after a concrete targeted
failure. A `final repository gate` runs once only when repository policy
explicitly requires it for the final implementation tree. Plan-only and
lifecycle commits reuse prior green evidence while implementation bytes are
unchanged.

The plan acceptance table selects future implementation checks. The plan author,
reviewer, and repairer validate that selection but do not execute it. The
reviewer never runs an implementation acceptance command, build, lint,
typecheck, test suite, or CI, and never claims host command results.

The bound implementation identity remains SHA-256 of compact JCS over sorted
`affected_paths` entries. Each entry binds the exact repo-relative path, Git
kind/mode, and blob SHA-256, or an explicit tombstone for absence. Exclude the
plan/orchestration path unless it is itself an affected implementation path.
Before reuse, recompute and require exact digest equality. A plan-only metadata
or orchestration commit preserves the digest; any affected-path byte, mode,
kind, or presence change invalidates reuse and requires manager-owned
verification selected from the changed implementation surface. This contract
does not change closed review-policy schemas.

An active plan that changes the canonical review controller, `plan-manager`, or
`plan-reviewer` mechanism it would use for its own completion cannot be
same-checkout self-dispatched. The manager returns `NeedsUserAction` and uses
an independent trusted released or pinned bootstrap reviewer path, or waits for
a later fresh session using the invoking runtime's same current model with a
trustworthy controller. Never repair, reseal, or replace orchestration in place
to evade this boundary. A `stopped` or `stuck` result, including attempt-2
failure, returns `NeedsUserAction` without automatic reprepare or retry.

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

The reviewer cannot establish launch provenance. `buildReviewerArgv` is
derivation-only and never authorizes process creation. Before dispatch, the
manager has written/read back the exact prepared request and sole-candidate
`ReviewDispatchCommitmentV1` in separate plan-only commits.
Before a Codex commitment, the manager verifies the sealed bundle path/digest
and prepares a safe schema-6 workspace through `prepareReviewerWorkspace`. The
commitment deep-copies its complete non-secret record and JCS hash; Claude
requires `reviewer_workspace:null`.
The commitment persists recursively validated `prior_attempts:[]` and
`prior_attempts_sha256 = sha256(JCS([]))`; its `candidate_index` is exactly
`0`. Any nonempty prior attempts or other candidate index is invalid because
schema 6 has no candidate fallback.

Main context may create the new reviewer only through
`dispatchCommittedReviewer({repo,planPath,committedPlanCommit,
expectedPreparedRequestSha256,expectedDispatchCommitmentSha256,
proposedControllerConfig,controllerAdapter})`. The gate requires the supplied
commit to be exact current `HEAD`, single-parent, and plan-only; reads its plan
blob from Git; and validates expected request/commitment hashes, state/policy/
sole candidate, candidate identity equal to `request.author`,
`candidate_index:0`, `prior_attempts:[]` and its hash, sealed bundle
path/content digest, and committed workspace record/hash. For Codex it
independently validates workspace managed root/path, owner/mode, non-symlink
status, and request/leg sentinel before rederiving argv with committed workspace
and empty prior attempts. Claude requires null workspace. It verifies argv/hash
separately.

It also compares current worktree bytes at `planPath` byte-for-byte with
`git show <committedPlanCommit>:<planPath>` (or enforces equivalent plan-path
cleanliness) before dispatch. Uncommitted post-commit plan drift, nonempty prior
attempts, or a candidate index other than zero calls the adapter zero times.

Bundle/workspace identity is independently verified and never part of caller-
supplied controller config. Exact JCS comparison of
`ProposedControllerConfigV1` covers only candidate index, argv/hash, and fixed
`orchestrator_tool/600` timeout fields.

Only then does the gate call trusted
`controllerAdapter.dispatch({tool,argv,timeout_mode,timeout_seconds})` exactly
once using committed values to create the reviewer for this round. A
stale/substituted commit or record, non-plan-only or multi-parent history,
hash/argv/config mismatch, or proposed 650 calls the adapter zero times. No
result, handle, session, derived argv, or commitment is reusable launch
authorization.

Append the exact compact request to the findings-only prompt:

```text
REQUEST_JCS_BEGIN
<compact JCS ReviewRequestEnvelopeV6>
REQUEST_JCS_END
```

The output must echo that object exactly. The sole candidate receives the
provider-appropriate closed `ReviewerOutputV6` schema, read-only permissions,
and the invoking runtime's current model and effort bound by
`request.author`; Codex additionally receives `service_tier:"default"`. A
600-second monotonic deadline is terminal, not permission to launch another
candidate.

Any typed output or failure is terminal for this reviewer invocation and
returns once. Never switch transport, provider, model, or candidate after tool,
auth, or model unavailability, host denial, timeout, transport failure, signal,
nonzero exit, parse/schema failure, substantive output, a parsed finding, or a
parsed verdict. Ambiguous stderr is not denial or availability proof.

The sole run records its exact candidate, output-started state, child id,
deadline mode/seconds, exit or signal, raw stdout/stderr hashes, parsed result
or null, and typed result.

For `request.phase === "draft"`, `blocking_gap` is eligible only when implementation cannot safely and correctly start because of an unresolved required user decision, contradictory goal/scope/interface, unsafe or unauthorized action, impossible dependency order, missing first executable step, or absent/non-executable acceptance contract. Code style, optional refactors/docs, speculative performance, exhaustive implementation edge cases, exact internal symbol choices, and defects best established by running the implementation are `non_blocking_gap` with rejection/defer reason `defer_to_implementation_verification`. A complete simple plan may return `pass`; there is no finding quota and no instruction to improve until perfect.

For `request.phase === "completion"`, classify only defects observable in the
sealed plan, committed diff, and acceptance inventory: goal, scope,
public-contract, or safety contradictions; unreviewable diff coverage; or an
acceptance criterion missing from the inventory. Do not receive or infer
command results. Missing or failed required acceptance evidence and observed
runtime regressions remain manager-owned through the existing hash-bound
primary completion evidence and verdict derivation. Speculative concerns remain
nonblocking; never run tests or CI.

## Current-plan evidence provenance

The reviewer evidence boundary is the exact committed plan blob at the exact
plan path and `HEAD`, the committed blobs sealed into the immutable bundle, and
the managed reviewer-workspace identity already bound by schema 6. Uncommitted,
ignored, or generated bytes outside that sealed input are not reviewer evidence
and cannot become findings or repair targets.

An exact plan-path/`HEAD` or managed-workspace mismatch is pre-review provenance
drift. Main-context `plan-manager` returns one plain turn-terminal response;
never begin, prepare, dispatch, or repair, and do not invoke the reviewer. Do
not attribute drift to another session without a lease or session identity that
proves that attribution.

Mandatory leases, session-owned branches, an integration checkout, external
resource allocation, cleanup tooling, and a process-level race suite belong to
a separate architecture plan. Its first step must audit Docks, OMP, and
session-relay ownership to determine which layer can acquire a process-lifetime
lease. No `docks session` CLI is promised before that audit.

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

For draft review, apply the exact phase-specific blocker rubric above while
assessing cold-handoff executability, requirement coverage, dependency order,
the executability of selected future acceptance checks, failure modes, and
unresolved decisions.

For completion review, inspect only the exact sealed plan, committed diff, and
ordered acceptance inventory. Do not inspect implementation command output or
infer whether a command passed. Report only sealed-evidence defects within the
completion rubric above.

Round 2 inspects only the changed plan input, the exact accepted independently
reproduced blocking targets, and regressions introduced by their repair. This
changed-input round launches another newly created reviewer; it never reuses or
resumes the round-1 reviewer handle or session. Any accepted remaining target
or accepted repair-introduced blocker is terminal evidence. A rejected or
nonblocking finding is advisory and never a repair target. The reviewer never
decides whether a finding is accepted.

`RawReviewV6`, `DraftRunResultV6` or `CompletionRunResultV6`, and
`ReviewSeriesV6` preserve the exact request and reviewer output. The manager
independently reproduces findings, derives the run outcome, settles persisted
orchestration, and writes any receipt. A schema-6 draft/completion receipt adds
`settled_orchestration_state_sha256` and must match both the persisted settled
state and its embedded final series.

## Completion evidence boundary

The reviewer receives only sealed plan, committed diff, and acceptance
inventory evidence. It receives no command results and never claims setup,
execution, cleanup, reproduction, patch, or lifecycle work. The writable
manager owns missing or failed acceptance evidence, observed runtime
regressions, and `completion_verdict=passed|partial|regressed`.

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
Schema 5 alone retains availability-only fallback and its exact ordered
three-candidate policy: `openai/codex/gpt-5.6-sol/high` with
`service_tier:"default"`, then `anthropic/claude/fable/high`, then
`anthropic/claude/opus/xhigh`.

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
- Confirm the sole run has child/deadline/exit/raw-output evidence consistent
  with its typed result.
- Never classify ambiguous stderr as availability or host-denial evidence.
- Never launch a fallback reviewer after any output or failure.
- Never claim acceptance, CI, clone, cleanup, write, reconciliation, retry,
  receipt, or lifecycle work.
- Return typed failure evidence when review cannot run; never mutate state here.
- Never infer that stdout proves dispatch provenance, create terminal state, or
  authorize controller abort/abandonment; those are manager-only plan-family
  operations bound to committed source bytes.
- Require candidate index `0`, exact hashed `prior_attempts:[]`, and candidate
  identity equal to `request.author`.
- Require the commitment and gate to bind and independently verify exact sealed
  bundle path/digest plus workspace record/hash; Codex validates root/path,
  owner/mode, non-symlink, and sentinel, while Claude requires null.
- Treat `dispatchCommittedReviewer` as the sole consuming process boundary;
  never launch from derived argv or a commitment, and never accept caller
  replacement values after its Git/blob/config checks.

## Success criteria

- The exact `plan-reviewer` skill and adjacent helper define the current path.
- One newly created primary reviewer sees one sealed schema-6 input per round.
- Request, output, run, series, and settled-state bindings validate end to end.
- Schema-6 fallback is `none`; no reviewer handle/session, transport, provider,
  or model is reused or substituted.
- One newly created changed-input repair reviewer is the maximum within a
  series.
- Historical schemas 1–5 validate without becoming current creation paths.
- The repository and source plan remain unchanged.
- `plan-manager` receives typed evidence without writer, reconciliation,
  retry-authorization, receipt, or lifecycle authority.
