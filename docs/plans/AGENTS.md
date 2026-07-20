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
| Publish an existing canonical plan as a GitHub issue (`--issues` or `publish <slug> as an issue`) | `plan-manager` |
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
- publish an existing canonical plan as a guarded GitHub issue and record its URL;
- prepare a draft/completion review and return dispatch to main context;
- independently reproduce and partition findings;
- invoke one exact accepted-blocker repair;
- persist orchestration state and canonical receipts;
- persist and read back prepared requests and per-candidate dispatch commitments;
- validate and commit controller-abort or authorized-abandonment terminal families;
- apply an eligible intent once;
- write status, schedule, block, review, completion, or archive changes;
- commit a plan-only lifecycle change.

Every write is read back. Lifecycle transitions are status-field edits and
plan-only commits; terminal shipment alone moves the plan to a unique
`finished/<ship-date>-<slug>.md` path.

## GitHub issue publication

`--issues` and `publish <slug> as an issue` route only to `plan-manager`. This
operation publishes an existing canonical plan; it never dispatches review,
changes lifecycle status, or transfers creation ownership from `plan-creator`.
A missing canonical plan is a STOP, not a route to `plan-creator`.

Before publishing, plan-manager must preflight `gh auth status`, require a
GitHub remote, and run `gh repo view --json visibility`. If authentication,
the remote, or the visibility lookup fails, publish nothing and report the
failure. For a public repository, warn that the issue will be public and obtain
explicit confirmation before publishing a plan that names a vulnerability,
credential location, or other sensitive finding. Missing or declined required
confirmation publishes nothing.

Publish with
`gh issue create --title "<plan title>" --body-file <plan path>`. Record the
returned issue URL in `## Notes`, read the write back, and auto-commit only the
plan. Report the issue URL as a successful result only after that Notes commit
succeeds. The Markdown plan remains the source of truth; GitHub is a published
view, not a lifecycle or review record.

## Current schema-6 review orchestration

A current review series is one full round plus at most one changed-input repair
round. A retryable availability, timeout, or unparseable result settles attempt
1 as `stopped`; exactly one explicit current-user same-input authorization may
start attempt 2, where the same failure settles as `stuck` and permits no
further retry. Nonretryable results are `stuck` at either attempt. Model
fallback is availability-only within one attempt and never increments the
counter.

The no-progress key is
`(plan_path,phase,intent_group,current_input_sha256)`. Timestamps,
lifecycle-only frontmatter, review records/receipts, and the orchestration
record are excluded, so metadata-only edits cannot reset the counter; only
genuinely changed canonical input starts a new series at attempt 1. No
automatic reprepare, attempt 3, round 3, or continuation batch is valid.

Current schema-6 orchestration may persist these exact unfenced records:

```text
Review-orchestration-state: <compact JCS ReviewOrchestrationStateV1|V2>
Review-orchestration-prepared-request: <compact JCS ReviewPreparedRequestV1>
Review-orchestration-dispatch-commitment: <compact JCS ReviewDispatchCommitmentV1>
Review-orchestration-controller-abort: <compact JCS ReviewControllerConfigAbortV1>
Review-orchestration-abandonment: <compact JCS ReviewOrchestrationAbandonmentV1>
```

Main-context `plan-manager` writes the active state and exact deep-copied
prepared request in a plan-only commit and reads the committed plan blob back
before constructing controller configuration. Before a Codex commitment, it
verifies the sealed bundle's absolute safe path and request-bound digest, then
calls `prepareReviewerWorkspace` for a safe schema-6 workspace. It validates
managed root/path containment, owner/mode, non-symlink status, and request/leg
sentinel identity. Claude requires `reviewer_workspace:null`.

`buildReviewerArgv` derives argv only; it never authorizes a process. Each
candidate commitment binds the sealed bundle path/digest, derived argv and
`orchestrator_tool/600`, plus a deep copy of the complete non-secret workspace
record and its JCS hash. The manager writes it in a separate plan-only commit
and reads it back.
Every commitment also persists the exact recursively validated `prior_attempts`
and `prior_attempts_sha256 = sha256(JCS(prior_attempts))`. `candidate_index`
must equal
`prior_attempts.length`; candidate 0 requires `prior_attempts:[]`, and later
entries must be the ordered availability-only results for all earlier policy
candidates.

`dispatchCommittedReviewer({repo,planPath,committedPlanCommit,
expectedPreparedRequestSha256,expectedDispatchCommitmentSha256,
proposedControllerConfig,controllerAdapter})` is the sole consuming process
boundary. It requires the commitment commit to equal current `HEAD`, be
single-parent and plan-only, reads that exact Git plan blob, and revalidates the
expected request/commitment hashes, candidate position, exact prior-attempt
sequence/hash, sealed bundle path/content digest, and committed workspace
record/hash. For Codex it independently revalidates workspace root/path,
owner/mode, non-symlink status, and sentinel before rederiving argv with the
committed workspace and prior attempts; Claude requires a null workspace. It
verifies argv/hash separately.

Bundle/workspace identity is independently verified and never caller-supplied
controller configuration. Exact JCS comparison of `ProposedControllerConfigV1`
covers only candidate index, argv/hash, and fixed `orchestrator_tool/600`
timeout fields. Only then may the gate call trusted
`controllerAdapter.dispatch` exactly once with committed values. Any stale,
substituted, non-plan-only, multi-parent, or hash/argv/config mismatch calls the
adapter zero times; neither derived argv nor a commitment is reusable launch
authorization.

Before dispatch it also requires current worktree bytes at `planPath` to equal
`git show <committedPlanCommit>:<planPath>` byte-for-byte (or enforces
equivalent plan-path cleanliness); uncommitted post-commit plan drift calls the
adapter zero times. For every prior attempt, the gate requires the matching
earlier-candidate commitment in parent Git history. Missing/substituted prior
evidence, a non-availability prior result, or a missing parent commitment calls
the adapter zero times. Availability-only fallback requires validated prior
evidence, a new plan-only commitment commit/read-back, and a fresh gate call.

Repair advancement is one source-plan-bound compare-and-swap: it atomically
removes the round-one prepared request and commitment while writing only the
active round-two state. The manager commits and reads back that record-free
transition before a separate commit/read-back of the distinct round-two
prepared request; only the consuming dispatch gate may use a later exact-600 commitment.

A controller configuration abort is allowed only from the exact committed
active source family with its prepared request and with no commitment or
process evidence. Authorized abandonment is a separate request-free
administrative transition available only to main-context `plan-manager` from
explicit current-user authorization for that exact plan/state. It persists
canonical base64 of the exact current-user UTF-8 bytes plus their digest and
never fabricates a request, run, series, receipt, verdict, retry, repair, or
apply authority.

`canonicalPlanView(bytes)` remains structural. Before committing any reducer
terminal output, the manager calls
`validateReviewTerminalFamily({currentPlanBytes,parentPlanBytes})` against the
exact source-plan bytes. After the plan-only commit, it reads the committed
child plan blob and its single parent plan blob from Git and reruns the same
validator. Parent-hash drift, a missing or extra parent, or any child/parent
mismatch rejects the transition.

Terminal `ReviewOrchestrationStateV2` embeds a deep copy of the exact active
source StateV1/V2 and binds its self-hash. Controller-abort and abandonment
families are disjoint from each other and from series/receipts, use distinct
StateV2-only stuck reasons, and are nonretryable and apply-ineligible. Only
materially changed canonical input may replace a complete terminal family
through `replaceReviewTerminalFamily`; same-input reset or partial removal is
invalid.

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
Neither role may create, commit, abort, abandon, replace, or validate an
orchestration family. `plan-reviewer` remains evidence-only and
`plan-repairer` remains patch-only.

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
