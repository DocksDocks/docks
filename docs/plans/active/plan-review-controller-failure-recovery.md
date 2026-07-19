---
title: Add typed review-controller failure recovery
goal: Persist exact review requests before launch, reject invalid controller configuration before spawning, support user-authorized provenance-unavailable abandonment without fabricated review evidence, normalize StateV1 reducer outputs to StateV2, and release Docks 0.13.1.
status: blocked
created: "2026-07-19T11:24:58-03:00"
updated: "2026-07-19T22:21:47.883Z"
started_at: "2026-07-19T13:10:44-03:00"
blocked_reason: "The passed draft receipt predates the required fallback-attempt persistence, parent-commitment ancestry, and worktree-drift dispatch guards; implementation remains isolated pending a refreshed changed-input review."
blocked_since: "2026-07-19T22:21:47.883Z"
assignee: null
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: high
review_waivers: []
tags: [plans, schema-6, orchestration, recovery, patch-release]
affected_paths:
  - .claude-plugin/marketplace.json
  - .codex/agents/plan-manager.toml
  - docs/plans/AGENTS.md
  - docs/scaffold/templates/codex-plan-manager.toml.template
  - docs/scaffold/templates/root-AGENTS.md.template
  - plugins/docks/.claude-plugin/plugin.json
  - plugins/docks/.codex-plugin/plugin.json
  - plugins/docks/agents/plan-manager.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-reviewer/SKILL.md
  - plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs
  - plugins/docks/skills/productivity/plan-workspace/references/codex-agent-templates.md
  - plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md
  - scripts/tests/plan-review-policy-regressions.mjs
  - scripts/tests/plan-review-policy.mjs
  - scripts/tests/plan-skill-phases.mjs
related_plans:
  - plan-workflow-phases-and-loop-escape
  - session-relay-prebuilt-cli-release
review_status: null
planned_at_commit: 41e61f4fdd677556c31de3e89343071d7ac67172
execution_base_commit: b8735e9aa1a3a2dff8df284e0c706860d3acc24f
---

# Add typed review-controller failure recovery

## Goal

Add one fail-closed current workflow that commits and reads back the exact
schema-6 request before any reviewer launch, rejects an invalid controller
configuration before spawning a process, and can administratively close a
legacy active orchestration only through fresh target-bound user authorization
without claiming request, policy, candidate, attempt, or reviewer-result
provenance that does not exist. Normalize every otherwise eligible direct
StateV1 reducer input to StateV2, preserve all historical review contracts, and
ship the correction as Docks `0.13.1`.

## Context & rationale

A Session Relay completion review once launched a controller with an evidenced
`650`-second ceiling even though current schema 6 requires exactly `600`. The
attempt was invalid as normal review evidence. More importantly, the manager had
not committed the exact request and launch configuration before dispatch.
Reviewer stdout could be internally self-consistent while substituting policy or
candidate fields, so it cannot independently prove what the manager sent.

The previous round-two plan review correctly rejected stdout-based recovery.
The user selected **audited abandonment, record outcome** rather than a silent
retry or a fabricated request. This revision therefore separates two paths:

1. Future launches persist an exact prepared request first. A controller
   configuration that is not exact-`600` terminalizes before dispatch with
   committed request provenance and no process/attempt/output fields.
2. A pre-feature active StateV1 that has no durable prepared request may be
   closed only by a distinct, request-free, current-user-authorized abandonment.
   It records the administrative decision, not a review verdict or controller
   fact.

The former Session Relay target is no longer live. It is finished at
`docs/plans/finished/2026-07-19-session-relay-prebuilt-cli-release.md` with a
passed completion receipt/state. This plan never reopens, edits, abandons, or
re-reviews that archive; its old `650` observation remains historical audit
context and a frozen generic regression fixture only.

This helper plan itself remains `blocked` with its original `started_at` and
`execution_base_commit`. The prior round-two `not_ready` receipt is terminal for
its old canonical input. After this substantive rewrite, plan-manager replaces
the stale draft state/receipt with one fresh attempt-one schema-6 review for the
changed input. Only a passed eligible receipt permits ordinary
`blocked → ongoing` unblock; `start`, same-input retry, metadata-only renewal,
or implementation before that unblock is forbidden.

## Environment & how-to-run

- Repository: `/home/vagrant/projects/docks`, branch `main`.
- Runtime: repository Node 24; `pnpm` dependencies already installed.
- Focused oracle:
  `env DOCKS_REVIEW_POLICY_ORCHESTRATION_ORACLE=1 node scripts/tests/plan-review-policy-regressions.mjs --orchestration-oracle`.
- Focused mutation suite:
  `node scripts/tests/plan-review-policy-regressions.mjs --self-test`.
- Release gates: `node scripts/ci.mjs --plugin docks`, then one
  `node scripts/ci.mjs`.
- Release only through `node scripts/release.mjs --plugin docks patch`; never
  hand-edit tags, Releases, or version triples.

## Interfaces & data shapes

Record-family versions are independent. Review requests, reviewer output, raw
reviews, runs, series, and receipts remain current schema 6; review schemas 1–5
remain validation-only and byte-compatible. `ReviewOrchestrationStateV2` is the
only newly emitted state. The new `...V1` records below are current version 1 of
their own closed families, not historical review schema 1.

### Prepared request and dispatch commitment

```text
ReviewPreparedRequestV1 = {
  schema: 1,
  type: "ReviewPreparedRequestV1",
  plan_path: string,
  phase: "draft" | "completion",
  lifecycle_intent: "none" | "start" | "schedule_fire" | "auto_execute",
  orchestration_series_id: uuid,
  orchestration_state_sha256: 64hex,
  request_ids: [uuid] | [uuid, uuid],
  request: ReviewRequestEnvelopeV6,
  request_sha256: sha256(JCS(request)),
  prepared_at: ISO-8601-with-offset
}
```

`prepareReviewRequest({state,request,preparedAt})` accepts only an active
StateV1/V2 and a recursively closed schema-6 request supplied by plan-manager.
It deep-copies the request and requires exact plan, phase, intent, current input,
round, series, state hash, ordered request lineage, and latest request ID
equality. Main-context plan-manager writes
`Review-orchestration-prepared-request: <compact JCS>` with the active state in
one plan-only commit, reads back the exact commit/blob, and reruns canonical
validation before constructing any launch.

`advanceReviewOrchestrationRepairFamily({sourcePlanBytes,
expectedStateSha256,expectedPreparedRequestSha256,
expectedDispatchCommitmentSha256,requestId,currentInputSha256})` parses one
exact committed round-one active family, requires the matching prepared request
and dispatch commitment that produced the accepted blocker set, and rejects any
terminal record, series, receipt, or launch outside that commitment. In one
pure compare-and-swap it removes both round-one records and replaces the state
through `advanceReviewOrchestrationRepair`, returning `{planBytes,state}` with
an active round-two state and no prepared request or commitment. Main-context
plan-manager writes that exact result in one plan-only commit, validates the
parent source blob and read-back family, then commits the distinct round-two
prepared request before constructing a new commitment or spawning. No process
may start during the record-free repair transition.

For each candidate launch:

```text
ReviewDispatchCommitmentV1 = {
  schema: 1,
  type: "ReviewDispatchCommitmentV1",
  plan_path: string,
  orchestration_state_sha256: 64hex,
  prepared_request_sha256: 64hex,
  candidate_index: integer,
  candidate: CurrentCandidateV6,
  prior_attempts: [CurrentAttemptV6, ...],
  prior_attempts_sha256: sha256(JCS(prior_attempts)),
  argv: [string, ...],
  argv_sha256: sha256(JCS(argv)),
  controller_config: {
    timeout_mode: "orchestrator_tool",
    timeout_seconds: 600
  },
  committed_at: ISO-8601-with-offset
}
```

`buildReviewDispatchCommitment({preparedRequest,candidateIndex,bundle,
reviewerWorkspace,leg,priorAttempts,committedAt})` validates and deep-copies the
exact ordered availability-only `priorAttempts`, requires
`candidate_index === prior_attempts.length` and the candidate to equal
`request.policy.candidates[candidate_index]`, stores
`prior_attempts_sha256`, derives exact argv through
`buildReviewerArgv({tool,bundle,reviewerWorkspace=null,model,effort,
serviceTier=null,leg,request,priorAttempts})`, and fixes the deadline at `600`.
Candidate zero requires an empty prior-attempt array. `buildReviewerArgv`
remains derivation-only and never authorizes spawn.
The manager writes
`Review-orchestration-dispatch-commitment: <compact JCS>` in a plan-only commit
and reads it back before dispatch.

`dispatchCommittedReviewer({repo,planPath,committedPlanCommit,
expectedPreparedRequestSha256,expectedDispatchCommitmentSha256,
proposedControllerConfig,controllerAdapter})` in
`plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs` is
the sole consuming process boundary. It requires `committedPlanCommit` to be
the exact current `HEAD`, a single-parent plan-only commitment commit, reads
`git show <commit>:<plan>`, requires the current worktree plan bytes to equal
that committed blob, and parses one active state + exact prepared request +
exact commitment. It verifies both expected hashes, request/state/policy/
candidate position, the closed prior-attempt array and its hash, rederived argv
and argv hash, and exact JCS equality of `proposedControllerConfig` to the
commitment's candidate index, argv, argv hash, and fixed
`orchestrator_tool/600` controller config.

For candidate index greater than zero, the gate additionally traverses parent
plan blobs and requires a matching earlier commitment for every prior candidate
under the same prepared-request/state lineage. Each persisted prior attempt
must be the corresponding validated availability-only result; missing,
reordered, substituted, or unhashed evidence and missing parent commitments
reject before dispatch.

Only after every check passes does the gate call the trusted host
`controllerAdapter.dispatch({tool,argv,timeout_mode,timeout_seconds})` exactly
once with values taken from the committed record; it returns the real child
handle/result and emits no reusable authorization. The adapter is the injected
host process primitive and receives no caller-supplied replacement values after
validation. Any stale HEAD/blob/worktree, unsafe logical path, non-plan commit,
missing/substituted record, fallback-evidence/config/argv mismatch, or
adapter-shape error rejects before that method is called. Availability-only
fallback commits the next candidate only after binding validated evidence and
the parent Git history retains every earlier commitment.

### Pre-dispatch controller configuration abort

```text
ProposedControllerConfigV1 = {
  candidate_index: integer,
  timeout_mode: string,
  timeout_seconds: integer,
  argv: [string, ...],
  argv_sha256: sha256(JCS(argv))
}

ReviewControllerConfigAbortV1 = {
  schema: 1,
  type: "ReviewControllerConfigAbortV1",
  plan_path: string,
  phase: "draft" | "completion",
  lifecycle_intent: "none" | "start" | "schedule_fire" | "auto_execute",
  orchestration_series_id: uuid,
  source_state_sha256: 64hex,
  source_plan_blob_sha256: sha256(exact committed parent plan bytes),
  request_ids: [uuid] | [uuid, uuid],
  prepared_request_sha256: 64hex,
  proposed_controller_config: ProposedControllerConfigV1,
  dispatch_status: "not_dispatched",
  reason: "controller_contract_failure",
  validation_error: string,
  recorded_at: ISO-8601-with-offset
}
```

`abortReviewControllerConfig({sourcePlanBytes,expectedStateSha256,
expectedPreparedRequestSha256,proposedConfig,recordedAt})` parses the exact
committed parent plan bytes and accepts only one active StateV1/V2 plus its
matching prepared request, with no dispatch commitment, launch evidence,
terminal record, series, or receipt. It first binds candidate position and
derived argv to that request, then requires the unchanged controller-config
validator to reject the proposal and the recomputed exact error to equal
`validation_error`. It returns `{planBytes,abort,state}` by atomically replacing
the active source family with its controller-abort family and binds
`source_plan_blob_sha256` to the supplied parent bytes. The abort shape forbids
attempt, started, child, stdout/stderr, exit, signal, reviewer output, series,
receipt, and dispatch-commitment fields because no process ran. A normally
valid exact-600 proposal cannot abort.

### Authorized provenance-unavailable abandonment

```text
ReviewAbandonmentAuthorizationV1 = {
  schema: 1,
  authorization_id: uuid,
  actor: "user",
  decision: "abandon_review_orchestration",
  authorized_at: ISO-8601-with-offset,
  plan_path: string,
  phase: "draft" | "completion",
  lifecycle_intent: "none" | "start" | "schedule_fire" | "auto_execute",
  input_sha256: 64hex,
  orchestration_series_id: uuid,
  source_state_sha256: 64hex,
  request_ids: [uuid] | [uuid, uuid],
  source_text_utf8_base64: base64(exact current-user UTF-8 bytes),
  source_text_sha256: sha256(exact current-user UTF-8 bytes)
}

ReviewOrchestrationAbandonmentV1 = {
  schema: 1,
  type: "ReviewOrchestrationAbandonmentV1",
  plan_path: string,
  phase: "draft" | "completion",
  lifecycle_intent: "none" | "start" | "schedule_fire" | "auto_execute",
  orchestration_series_id: uuid,
  source_state_sha256: 64hex,
  source_plan_blob_sha256: sha256(exact committed parent plan bytes),
  request_ids: [uuid] | [uuid, uuid],
  current_input_sha256: 64hex,
  round_index: 1 | 2,
  outcome: "abandoned",
  reason: "dispatch_provenance_unavailable",
  authorization: ReviewAbandonmentAuthorizationV1,
  recorded_at: ISO-8601-with-offset
}
```

`abandonReviewOrchestration({sourcePlanBytes,expectedStateSha256,
authorization,sourceTextBytes,recordedAt})` parses the exact committed parent
plan bytes and accepts only a state-only active StateV1/V2 family with no
prepared request, dispatch commitment, launch evidence, terminal record,
series, or receipt. Main context supplies the current-user bytes separately;
the reducer validates UTF-8, stores their canonical base64 encoding, recomputes
the digest, validates every authorization/state identity, and deep-copies the
authorization. It returns `{planBytes,abandonment,state}` by atomically
replacing that source family and binds `source_plan_blob_sha256` to the supplied
parent bytes without mutating any input. Canonical read-back decodes the
persisted base64, rejects noncanonical or invalid UTF-8 bytes, recomputes
`source_text_sha256`, and verifies the committed transition parent against
`source_plan_blob_sha256`; authorization is cold-auditable without session
history or an external mutable locator. The abandonment shape is recursively
closed and forbids request, policy, policy hash, candidate, config, argv,
attempt, validation error, stdout/stderr, reviewer result, series, receipt,
retry, repair, verdict, or lifecycle-apply authority. The authorization proves
only the user's exact administrative decision for that source family; it never
proves what was dispatched.

### StateV2 and canonical families

```text
ReviewOrchestrationStateV2 =
  all ReviewOrchestrationStateV1 fields, with schema: 2, plus {
    terminal_evidence_sha256: 64hex | null,
    terminated_from_state_sha256: 64hex | null,
    terminated_from_state:
      exact active ReviewOrchestrationStateV1 |
      exact active nonterminal ReviewOrchestrationStateV2 |
      null
  }
```

Every ordinary active/passed/stopped/stuck StateV2 has all three terminal fields
null and retains all StateV1 status, stop, series, retry, apply, and transition
semantics. Direct otherwise eligible StateV1 inputs to
`beginReviewOrchestration`, `advanceReviewOrchestrationRepair`,
`settleReviewOrchestration`, `consumeReviewIntent`, and its apply-reject branch
emit the equivalent nonterminal StateV2 with null terminal fields only after the
existing transition preconditions pass. Invalid, wrong-status, wrong-round,
wrong-intent, stale, or otherwise ineligible inputs keep their exact existing
rejection or stale-terminalization behavior.

A config abort returns StateV2
`stuck/controller_contract_failure/none`; authorized abandonment returns
`stuck/authorized_abandonment/none`. Both have `series_sha256:null` and
`terminal_evidence_sha256:sha256(JCS(typed terminal record))`.
`terminated_from_state` is a deep copy of the exact active source state,
including attempt-two `retry_authorization` and prior transition lineage, while
`terminated_from_state_sha256` equals that embedded state's valid
`state_sha256`. The terminal state preserves those historical lineage fields at
top level but remains nonretryable by its new stop reason. An embedded V2 source
must be active and have all terminal fields null, preventing recursive terminal
chains. The two new stop reasons exist only in StateV2 and are always
nonretryable.

`MACHINE_RECORD` and `canonicalPlanView` recognize, recursively validate, then
exclude these exact unfenced records:

```text
Review-orchestration-prepared-request: <ReviewPreparedRequestV1 JCS>
Review-orchestration-dispatch-commitment: <ReviewDispatchCommitmentV1 JCS>
Review-orchestration-controller-abort: <ReviewControllerConfigAbortV1 JCS>
Review-orchestration-abandonment: <ReviewOrchestrationAbandonmentV1 JCS>
```

The current canonical families are disjoint:

- active state plus zero/one prepared request plus zero/one valid dispatch
  commitment; a commitment requires its prepared request;
- controller-abort StateV2 + its prepared request + exactly one abort and no
  dispatch commitment;
- abandonment StateV2 + exactly one abandonment and no prepared request or
  dispatch commitment;
- ordinary state/series/receipt families with no terminal record.

Canonical read-back validates the embedded exact source active state and its
self-hash, the applicable parent-plan binding, every record/state digest and identity,
candidate/argv position, request closure/hash, and permitted stop tuple before
exclusion. It rejects duplicates, orphans, stale round-one request/commitment
records after repair advancement, half-null terminal fields, cross-pairs,
record/reason substitution, series-backed terminal states, and any completion
or draft receipt coexisting with either terminal record regardless of receipt
series. Normal settlement atomically removes prepared/dispatch records while
writing terminal state plus receipt. Repair advancement atomically removes the
round-one prepared request and commitment while writing only the round-two
active state; its new prepared request is a separate later commit.

`validateReviewTerminalFamily({currentPlanBytes,parentPlanBytes})` is the
parent-aware validator for either terminal family. It parses both closed plan
families, requires the parent to be exactly the eligible source family for the
current abort or abandonment, recomputes
`source_plan_blob_sha256=sha256(parentPlanBytes)`, and binds the current embedded
source state, prepared request when applicable, terminal record, and StateV2.
`canonicalPlanView(bytes)` remains the bytes-only structural canonicalizer and
does not claim parent provenance.

Before a terminal commit, main-context plan-manager calls the validator over the
exact committed `git show HEAD:<plan>` bytes and the reducer's candidate current
bytes. It then commits only the plan, resolves the single parent, reads
`git show <child>:<plan>` and `git show <parent>:<plan>`, calls the validator
again, and accepts the transition only if both validations and the plan-only
ancestry check pass. No worktree bytes or session transcript may substitute for
either read-back blob.

Only materially changed canonical input permits
`replaceReviewTerminalFamily({sourcePlanBytes,currentPlanBytes,seriesId,
requestId})` to compare-and-swap an exact committed terminal family retained in
the candidate current bytes into one fresh active StateV2 with attempt 1, fresh
series/request IDs, null terminal/series/transition/retry fields, and no stale
receipt/prepared/dispatch record. It returns `{planBytes,state}`. The plan-only
replacement validates against the exact committed source blob, reads back
before commit, and proves `git show <replacement-parent>:<plan>` recovers the
old family. It then commits a separate fresh prepared request before any
launch. Same-input or metadata-only replacement, partial removal, dirty or
concurrent source, reused identities, failed read-back, retry, repair,
settlement, or intent consumption rejects without mutation.

Finished plans, archived paths, passed states, and existing completion receipts
are immutable and cannot enter abandonment, replacement, or reopened review.

## Steps

| # | Task | Files | Depends | Status | Done when / failure action |
|---|---|---|---|---|---|
| 1 | Add red contract, integration-gate, and mutation tests for prepared-request commit/read-back, per-candidate exact-600 commitment with persisted/hash-bound prior attempts and parent-history proof, authoritative Git/read-back/config/spawn dispatch, worktree/path drift, atomic round-two cleanup, invalid-config abort, exact-parent authorized abandonment, full source reconstruction, generic terminal StateV2 pairing, changed-input CAS, finished immutability, and direct eligible StateV1 inputs. | `scripts/tests/plan-review-policy-regressions.mjs`; `scripts/tests/plan-review-policy.mjs`; `scripts/tests/plan-skill-phases.mjs` | — | planned | A temporary Git fixture and counting adapter prove candidate zero and a candidate-one fallback dispatch exactly once only with committed evidence; stale/missing/substituted commit/blob/worktree/path/config/argv/prior-attempt/history cases dispatch zero times. Other focused tests prove repair cleanup, terminal auditability, changed-input-only replacement, and unchanged historical behavior. |
| 2 | Implement closed prepared-request, prior-attempt-bound dispatch commitment, authoritative dispatch gate, controller-abort, abandonment-authorization/record validators and full-plan compare-and-swap reducers; generalize StateV2 terminal/source fields; add atomic repair-family cleanup, canonical family validation, changed-input CAS, and safe logical-path rejection; normalize only otherwise eligible direct StateV1 reducer outputs. | `plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs` | 1 | planned | A1–A3 pass. One gate verifies exact current HEAD, plan-only ancestry, committed/worktree byte equality, prior availability attempts plus earlier commitments, and actual proposed config before one adapter call. Invalid/substituted input never spawns; stale round-one records cannot survive repair; terminal records cannot produce series/receipt/retry/apply; schemas 1–5 and rejected inputs remain unchanged. |
| 3 | Document manager/reviewer ownership, commit-before-launch ordering, administrative abandonment authority, current record-family versions, generated-wrapper parity, and no-progress rules; regenerate changed skill hashes. | `docs/plans/AGENTS.md`; `plugins/docks/skills/productivity/plan-manager/SKILL.md`; `plugins/docks/skills/productivity/plan-reviewer/SKILL.md`; `plugins/docks/agents/plan-manager.md`; `.codex/agents/plan-manager.toml`; `docs/scaffold/templates/{codex-plan-manager.toml,root-AGENTS.md}.template`; `plugins/docks/skills/productivity/plan-workspace/references/{codex-agent-templates.md,plans-agents-md-template.md}` | 2 | planned | Live and generated contracts require plan-manager to commit/read back the request and commitment before launch; reviewer/repairer cannot abandon; `authorized_abandonment` offers only materially changed input; generated hashes pass check-only. |
| 4 | Bind the implementation commit durably, then run the focused oracle, mutation/surface/phase checks, Docks-targeted gate, and one full gate. | All changed implementation/docs/tests; `/tmp/docks-plan-review-controller-failure-recovery-implementation.sha`; `refs/docks/release/docks-0.13.1-tested` | 3 | planned | A1–A7 pass from empty porcelain including untracked files. A7 writes exact HEAD to the collision-specific file and repository-local ref, runs full CI once, and proves HEAD/file/ref/worktree remain identical. |
| 5 | Patch-release and verify Docks `0.13.1`. | `.claude-plugin/marketplace.json`; `plugins/docks/.claude-plugin/plugin.json`; `plugins/docks/.codex-plugin/plugin.json` | 4 | planned | A8–A11 pass: dry run resolves `0.13.0 → 0.13.1` without mutation; actual release is the direct child of the bound implementation commit; tag CI and GitHub Release pass; installed Claude/Codex helper bytes equal the tag and pass the oracle/catalog checks. |
| 6 | Prepare this plan's completion handoff while keeping both related plans read-only. | This plan read-only; Docks `0.13.1` artifacts; finished Session Relay and active workflow plan as read-only protected evidence | 5 | planned | A12 proves the release retained the exact protected finished Session Relay and workflow-plan baselines. Exact implementation/release/tag/CI/cache evidence plus A1–A12 is ready for manager completion. No related-plan lifecycle or public work occurred. |

Step 1 uses frozen generic fixtures derived from the historical no-provenance
shape; it never copies or mutates the finished Session Relay plan. This plan's
fresh changed-input draft review and ordinary unblock occur before Step 1 and
outside the step table as plan-manager lifecycle operations.

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `env DOCKS_REVIEW_POLICY_ORCHESTRATION_ORACLE=1 node scripts/tests/plan-review-policy-regressions.mjs --orchestration-oracle` | Exit 0; a temporary Git repository proves candidate zero dispatches once from empty prior attempts and candidate one dispatches once only after a matching parent candidate-zero commitment plus persisted/hash-bound availability evidence; `dispatchCommittedReviewer` reads exact current plan-only HEAD, compares worktree bytes, and calls its adapter only for matching committed argv and actual `orchestrator_tool/600`. Stale/missing/substituted commit/blob/worktree/path/config/argv/prior-attempt/history and proposed 650 cases call it zero times; terminal and repair invariants remain closed. |
| A2 | `node scripts/tests/plan-review-policy-regressions.mjs --self-test` | Exit 0; mutations kill missing commit/read-back, stale/non-plan/multi-parent commitment commits, uncommitted worktree drift, unsafe backslash/traversal paths, request/policy/candidate/argv/config substitution, missing/reordered/unhashed prior attempts, missing parent commitments, post-validation replacement, adapter double-call/spawn-before-gate, stale repair records, stdout self-attestation, user-byte/base64/hash drift, parent ancestry drift, terminal/receipt/series crossover, same-input CAS, finished reopen, and weakened V1 preconditions. |
| A3 | `node scripts/tests/plan-review-policy.mjs --case surfaces` | Exit 0; review schema 6, independent current V1 record families, StateV2, validation-only StateV1, and historical review schemas 1–5 remain closed; eligible V1 inputs normalize to equivalent nonterminal V2 only after existing preconditions, including unchanged stale settlement behavior. |
| A4 | `node scripts/tests/plan-skill-phases.mjs` | Exit 0; five-skill ownership and generated manager-wrapper parity require commit-before-launch and reserve abandonment authority to main-context plan-manager/current-user input. |
| A5 | `node scripts/skills/content-hash.mjs --check-only` | Exit 0; every changed skill hash matches generated content. |
| A6 | `node scripts/ci.mjs --plugin docks` | Exit 0; Docks plus repo-wide targeted release gate is green. |
| A7 | `IMPLEMENTATION_SHA_FILE=/tmp/docks-plan-review-controller-failure-recovery-implementation.sha IMPLEMENTATION_REF=refs/docks/release/docks-0.13.1-tested && test -z "$(git status --porcelain=v1 --untracked-files=all)" && git diff --quiet && git diff --cached --quiet && git rev-parse HEAD > "$IMPLEMENTATION_SHA_FILE" && git update-ref "$IMPLEMENTATION_REF" "$(cat "$IMPLEMENTATION_SHA_FILE")" && node scripts/ci.mjs && test "$(git rev-parse HEAD)" = "$(cat "$IMPLEMENTATION_SHA_FILE")" && test "$(git rev-parse "$IMPLEMENTATION_REF")" = "$(cat "$IMPLEMENTATION_SHA_FILE")" && test -z "$(git status --porcelain=v1 --untracked-files=all)" && git diff --quiet && git diff --cached --quiet` | Exit 0 once; full CI passes and exact clean implementation HEAD/file/ref remain identical. |
| A8 | `IMPLEMENTATION_SHA_FILE=/tmp/docks-plan-review-controller-failure-recovery-implementation.sha IMPLEMENTATION_REF=refs/docks/release/docks-0.13.1-tested && test "$(cat "$IMPLEMENTATION_SHA_FILE")" = "$(git rev-parse "$IMPLEMENTATION_REF")" && test "$(git rev-parse HEAD)" = "$(git rev-parse "$IMPLEMENTATION_REF")" && test -z "$(git status --porcelain=v1 --untracked-files=all)" && node scripts/release.mjs --dry-run --plugin docks patch && test "$(git rev-parse HEAD)" = "$(git rev-parse "$IMPLEMENTATION_REF")" && test -z "$(git status --porcelain=v1 --untracked-files=all)"` | Exit 0 without mutation and resolve `0.13.0 → 0.13.1`. |
| A9 | `IMPLEMENTATION_COMMIT=$(git rev-parse refs/docks/release/docks-0.13.1-tested) && test "$(git rev-parse HEAD)" = "$IMPLEMENTATION_COMMIT" && node scripts/release.mjs --plugin docks patch && RELEASE_COMMIT=$(git rev-parse 'docks--v0.13.1^{commit}') && test "$(git show -s --format='%P' "$RELEASE_COMMIT")" = "$IMPLEMENTATION_COMMIT"` | Exit 0; release commit is the direct child of the bound implementation commit and version triples are `0.13.1`. |
| A10 | `RELEASE_TAG=docks--v0.13.1 RELEASE_COMMIT=$(git rev-parse 'docks--v0.13.1^{commit}') && test "$RELEASE_COMMIT" = "$(git rev-parse HEAD)" && test "$(gh run list --repo DocksDocks/docks --commit "$RELEASE_COMMIT" --event push --json status,conclusion,headBranch,headSha --limit 20 --jq "map(select(.headBranch == \"$RELEASE_TAG\" and .headSha == \"$RELEASE_COMMIT\" and .status == \"completed\" and .conclusion == \"success\")) | length")" = 1 && test "$(gh release view "$RELEASE_TAG" --repo DocksDocks/docks --json isDraft --jq .isDraft)" = false && test "$(gh release view "$RELEASE_TAG" --repo DocksDocks/docks --json isPrerelease --jq .isPrerelease)" = false` | Exit 0; exactly one successful tag run and one published stable GitHub Release bind the release commit. |
| A11 | `RELEASE_COMMIT=$(git rev-parse 'docks--v0.13.1^{commit}') && codex plugin marketplace upgrade docks --json && codex plugin add docks@docks --json && claude plugin update docks@docks --scope user && CLAUDE_HELPER="$HOME/.claude/plugins/cache/docks/docks/0.13.1/skills/productivity/plan-reviewer/scripts/review-policy.mjs" CODEX_HELPER="$HOME/.codex/plugins/cache/docks/docks/0.13.1/skills/productivity/plan-reviewer/scripts/review-policy.mjs" && git show "$RELEASE_COMMIT:plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs" | cmp - "$CLAUDE_HELPER" && cmp "$CLAUDE_HELPER" "$CODEX_HELPER" && env DOCKS_REVIEW_POLICY_ORCHESTRATION_ORACLE=1 DOCKS_REVIEW_POLICY_HELPER="$CLAUDE_HELPER" node scripts/tests/plan-review-policy-regressions.mjs --orchestration-oracle && node scripts/tests/plan-skill-phases.mjs --case installed-catalogs --version 0.13.1` | Exit 0; both installed caches equal the tagged helper and pass the new oracle plus five-phase catalog contract. |
| A12 | `RELEASE_COMMIT=$(git rev-parse 'docks--v0.13.1^{commit}') && test "$(git rev-parse "$RELEASE_COMMIT:docs/plans/finished/2026-07-19-session-relay-prebuilt-cli-release.md")" = 824bb01733482c80eb1769f216791d8957c0039c && test "$(git show "$RELEASE_COMMIT:docs/plans/finished/2026-07-19-session-relay-prebuilt-cli-release.md" | sha256sum)" = "dac73a2ae909485cbfd11d7319cfc23d06cd6f5ff89249ec198c390db0545957  -" && test "$(git rev-parse "$RELEASE_COMMIT:docs/plans/active/plan-workflow-phases-and-loop-escape.md")" = b9723dd96bd1ea4231c619a7348f9c9bf92cf73b && test "$(git show "$RELEASE_COMMIT:docs/plans/active/plan-workflow-phases-and-loop-escape.md" | sha256sum)" = "164ee5727c4b80e9fbe2a6ea5e571695312fd15c4bce15fc6ecf900d2e45e4fc  -"` | Exit 0; the released helper leaves the finished Session Relay archive and completed workflow dependency exactly at baseline. |

## Out of scope / do-NOT-touch

- Do not edit, reopen, abandon, replace, or re-review
  `docs/plans/finished/2026-07-19-session-relay-prebuilt-cli-release.md`.
- Do not edit `docs/plans/active/plan-workflow-phases-and-loop-escape.md`; its
  Session Relay archive prerequisite is already complete.
- Do not reinterpret the historical `650` launch as valid, recover request or
  policy provenance from reviewer stdout, or hard-code Session Relay identity
  into the generic reducer.
- Do not loosen exact `timeout_seconds === 600`, fabricate a
  ReviewRun/ReviewSeries/receipt, or permit same-input retry/reset/apply.
- Do not change Session Relay release assets, publication/promotion semantics,
  public repository bytes, or the five-skill phase cutover.

## Known gotchas

- Prepared request and dispatch commitment are distinct. The request is durable
  before config construction; only a validated exact-600 commitment may spawn.
- The invalid proposal is structural data, not `CurrentAttemptV6`: it never
  launched and therefore must not acquire attempt/process/output fields.
- Reviewer stdout can corroborate bytes after launch but can never establish
  manager dispatch provenance.
- User authorization persists canonical base64 of the exact current-user UTF-8
  bytes plus their digest, so read-back can verify both without session history.
  It proves only abandonment of one exact active state, not a request, verdict,
  retry, repair, receipt, or general lifecycle grant.
- Candidate equality and argv are position-sensitive. Default fallback replaces
  commitments in exact order only after validated availability evidence; pinned
  policy permits index 0 only.
- `series_sha256` always binds a valid ReviewSeries. Terminal administrative
  evidence binds the applicable exact parent plan plus an embedded, self-hashed
  active source state; lifecycle transition hashes retain their StateV1 meaning.
- Repair advancement removes the old prepared request and commitment in the
  same plan-byte compare-and-swap as the round-two state. Parent Git history
  preserves them; no stale current record may survive.
- Current-only changed-input replacement removes the complete terminal family.
  Parent Git history, not an orphan current record, preserves it.
- Record `schema:1` is version 1 of its own family; it does not make historical
  review schema 1 current.
- The finished Session Relay archive is regression evidence, never a live target.

## Global constraints

- Normal reviewer deadline remains exactly 600 seconds.
- At most two orchestration attempts and two review rounds remain unchanged.
- Plan-manager/main context is the sole state/record committer. Reviewer and
  repairer remain read-only/patch-only and cannot abandon.
- Every future candidate launch requires committed/read-back prepared request
  and exact dispatch commitment.
- `controller_contract_failure` and `authorized_abandonment` are StateV2-only,
  stuck, nonretryable, receiptless, seriesless, and apply-ineligible.
- StateV1 and review schemas 1–5 remain validation-only and byte-compatible.
- Eligible V1 normalization occurs only after each reducer's existing
  preconditions; no invalid or stale input is repaired by normalization.
- Same-input restart is forbidden. Changed-input CAS uses fresh
  series/request identity and preserves the old family in its parent plan blob.
- Finished/archived plans and passed completion evidence cannot reopen.
- Every write is plan-only or within this plan's affected paths and is committed
  by its owning phase.

## STOP conditions

- Any reviewer process can start before prepared-request and exact commitment
  commits are read back, or a non-600 commitment can be formed.
- Any schema-6 reviewer process is created outside
  `dispatchCommittedReviewer`, the gate receives a noncurrent or non-plan-only
  commit, or its adapter is called before all Git/blob/config checks pass.
- Candidate fallback lacks exact persisted/hash-bound availability-only attempts,
  candidate index differs from their count, or parent history lacks the matching
  earlier candidate commitments under the same request/state lineage.
- Current worktree plan bytes differ from the exact committed plan blob, or an
  unsafe backslash, NUL, empty, `.` or `..` logical-path segment is accepted.
- A controller abort accepts an exact-600 valid config, lacks exact committed
  parent/state/prepared evidence, contains process/attempt/output fields, erases
  a disqualifying record, or follows a commitment or spawned process.
- Abandonment accepts missing/changed/replayed user bytes, a noncanonical or
  digest-mismatched persisted authorization text, a nonactive source, missing
  exact parent/source-state evidence, a prepared/dispatch/launch record, or any
  request/policy/candidate/config/attempt/stdout/verdict/receipt/apply field.
- Repair advancement leaves, reuses, or separately deletes the round-one
  prepared request/commitment, or any process can spawn before the round-two
  state-only family and later prepared request are separately committed/read back.
- A terminal reducer output can commit without pre-commit parent-aware
  validation, or committed child/parent plan blobs and single-parent plan-only
  ancestry are not read back and revalidated.
- A validated committed argv is returned as reusable launch authority, or the
  controller adapter can receive timeout/config/argv values not taken from the
  validated commitment.
- Any target/state/input/series/request-lineage/hash/candidate/argv/config/error
  mismatch is accepted, or rejection mutates inputs.
- Any terminal family coexists with a ReviewSeries or any draft/completion
  receipt, regardless of substituted series identity.
- Same-input/metadata-only CAS, partial removal, reused IDs, dirty/concurrent
  source, failed read-back, or a missing parent-blob proof can proceed.
- Existing reducer preconditions, exact stale-input behavior, StateV1, or review
  schemas 1–5 change.
- The finished Session Relay plan or the related workflow plan must be edited,
  reopened, or used as a live abandonment target.
- Targeted/full CI fails; version triples, tag CI, Release, cache bytes, or
  protected-plan baselines disagree.

## Self-review
Review-receipt: {"input_sha256":"6c0f054a239b1a78ece5523b36e3aee6f9f53e5e75534da65f35997efef7928b","outcome":"passed","phase":"draft","policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"6e80a4a8658a0db4752dbdd1508e55e0d38440bd283093c32436c7c316968c11","diff_sha256":null,"execution_base_commit":null,"input_sha256":"6c0f054a239b1a78ece5523b36e3aee6f9f53e5e75534da65f35997efef7928b","lifecycle_intent":"none","orchestration_series_id":"2a48a14e-62e4-4349-9e50-df38dfc4d578","orchestration_state_sha256":"14c0f83311a187ca186a574ea4cbb913ac05b8128b13321322c544ef018be5ff","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","repair_targets_sha256":"e227f3ecee9d0e59e2f321452820a8a77b2d5ebc4b0b04947693a67803371396","request_id":"7a8280b3-b6e6-4111-ba31-216e7d1a250b","review_mode":"repair","reviewed_commit_or_head":"4b1382cd19b43dad6589b65d76c4daa6a8b264d1","round_index":2,"schema":6},"reviewed_at":"2026-07-19T21:28:17.548Z","reviewed_commit":"4b1382cd19b43dad6589b65d76c4daa6a8b264d1","reviewer":{"accepted_finding_ids":[],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"6030","denial_source":null,"exit_code":0,"output_started":true,"reason":"Reviewer output validated after exact 600-second orchestrator-tool execution exited 0 without signal or authoritative denial.","result":"passed","schema":6,"signal":null,"started":true,"stderr_sha256":"28ac11bcee43083cd9295bf3e68d23b1653b68d855afed7c2f5cb52911949765","stdout_sha256":"e621cf6462d64795c88441bc642019f88ef722319b172a2070dabfa13c222bdf","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"6e80a4a8658a0db4752dbdd1508e55e0d38440bd283093c32436c7c316968c11","diff_sha256":null,"execution_base_commit":null,"input_sha256":"6c0f054a239b1a78ece5523b36e3aee6f9f53e5e75534da65f35997efef7928b","lifecycle_intent":"none","orchestration_series_id":"2a48a14e-62e4-4349-9e50-df38dfc4d578","orchestration_state_sha256":"14c0f83311a187ca186a574ea4cbb913ac05b8128b13321322c544ef018be5ff","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","repair_targets_sha256":"e227f3ecee9d0e59e2f321452820a8a77b2d5ebc4b0b04947693a67803371396","request_id":"7a8280b3-b6e6-4111-ba31-216e7d1a250b","review_mode":"repair","reviewed_commit_or_head":"4b1382cd19b43dad6589b65d76c4daa6a8b264d1","round_index":2,"schema":6},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"The repaired plan specifies the concrete `dispatchCommittedReviewer({repo,planPath,committedPlanCommit,expectedPreparedRequestSha256,expectedDispatchCommitmentSha256,proposedControllerConfig,controllerAdapter})` API, its owning `review-policy.mjs` file, exact validation inputs, rejection conditions, and adapter invocation semantics. This resolves P2 without relying on in-memory provenance claims.","status":"pass"},"dependency_order":{"evidence":"The repaired workflow is ordered as tests first, implementation second, documentation/generated parity third, focused and full verification fourth, release fifth, and completion handoff sixth. The separate lifecycle precondition requires a passed changed-input draft review before Step 1, and commitment/read-back precedes dispatch.","status":"pass"},"evidence_reverification":{"evidence":"The current sealed plan was rechecked against accepted targets P1-P6. It now binds dispatch to current plan-only Git HEAD, exact committed plan bytes, prepared-request and commitment hashes, actual proposed configuration, and a trusted adapter invoked only after validation. A1 and A2 explicitly reverify those properties with a temporary Git repository, counting adapter, zero-call rejection assertions, and substitution/TOCTOU mutations.","status":"pass"},"executable_acceptance":{"evidence":"A1 is an executable integration oracle around the repaired dispatch gate and requires one adapter call only for matching committed `orchestrator_tool/600`, with zero calls for stale HEAD, missing/substituted records, argv/config drift, and timeout 650. A2 covers post-validation replacement, double-call, and spawn-before-gate mutations; A3-A12 provide focused compatibility, documentation, CI, release, installed-cache, and protected-baseline checks.","status":"pass"},"failure_modes":{"evidence":"The repaired interface collapses validation and process creation into one consuming boundary and returns no reusable authorization. STOP conditions explicitly forbid any schema-6 spawn outside the gate, adapter invocation before Git/blob/config validation, reusable argv authority, or adapter values not taken from the validated commitment, addressing P5's substitution/TOCTOU failure mode.","status":"pass"},"goal_coverage":{"evidence":"The repaired plan covers the accepted requirements: exact request and exact-600 commitment are committed and read back before launch; the sole gate compares actual proposed configuration and performs dispatch; invalid configuration remains pre-dispatch and attempt-free; and the integration acceptance harness proves both successful and rejected launch behavior. No blocking regression from these repairs is evident.","status":"pass"},"open_questions":{"evidence":"The repaired Open questions section resolves P6 by assigning authoritative Git read-back, actual configuration validation, and adapter invocation to `dispatchCommittedReviewer`, while plan-manager remains the record committer and the injected controller adapter is only the host process primitive. No material ownership or trust-boundary choice remains unresolved.","status":"pass"},"standalone_executability":{"evidence":"The repaired plan names the repository, runtime, affected files, commands, record shapes, concrete dispatch-gate signature and owner, Git read-back rules, adapter contract, ordered implementation steps, acceptance commands, and STOP conditions. `dispatchCommittedReviewer` now directly consumes authoritative committed evidence and performs the spawn, resolving P1.","status":"pass"}},"findings":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"6e80a4a8658a0db4752dbdd1508e55e0d38440bd283093c32436c7c316968c11","diff_sha256":null,"execution_base_commit":null,"input_sha256":"6c0f054a239b1a78ece5523b36e3aee6f9f53e5e75534da65f35997efef7928b","lifecycle_intent":"none","orchestration_series_id":"2a48a14e-62e4-4349-9e50-df38dfc4d578","orchestration_state_sha256":"14c0f83311a187ca186a574ea4cbb913ac05b8128b13321322c544ef018be5ff","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","repair_targets_sha256":"e227f3ecee9d0e59e2f321452820a8a77b2d5ebc4b0b04947693a67803371396","request_id":"7a8280b3-b6e6-4111-ba31-216e7d1a250b","review_mode":"repair","reviewed_commit_or_head":"4b1382cd19b43dad6589b65d76c4daa6a8b264d1","round_index":2,"schema":6},"role":"primary","schema":6,"verdict":"pass"},"role":"primary","schema":6,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":6,"series":{"current_input_sha256":"6c0f054a239b1a78ece5523b36e3aee6f9f53e5e75534da65f35997efef7928b","initial_input_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","orchestration_series_id":"2a48a14e-62e4-4349-9e50-df38dfc4d578","policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","repairs":[{"accepted_finding_ids":["P1","P2","P3","P4","P5","P6"],"current_input_sha256":"6c0f054a239b1a78ece5523b36e3aee6f9f53e5e75534da65f35997efef7928b","current_orchestration_state_sha256":"14c0f83311a187ca186a574ea4cbb913ac05b8128b13321322c544ef018be5ff","from_round_index":1,"orchestration_series_id":"2a48a14e-62e4-4349-9e50-df38dfc4d578","previous_input_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","previous_orchestration_state_sha256":"104d33cff08397981127586f86deb166249cbcbb849ca0ee4852060915565732","repair_targets_sha256":"e227f3ecee9d0e59e2f321452820a8a77b2d5ebc4b0b04947693a67803371396","schema":6,"targets":[{"criterion":"standalone_executability","defect":"The plan never specifies a callable consuming dispatch boundary that both validates authoritative committed read-back evidence and controls the actual spawn. Record construction, Git commits, buildReviewerArgv, and main-context dispatch remain separate procedural actions.","evidence":"Plan lines 134-147 describe buildReviewerArgv as returning committed argv, while lines 333-339 describe Git read-back separately and Step 3 only updates agent documentation. No proposed interface accepts a commit/blob identity and then performs or authorizes the controller launch.","fix":"Add a concrete dispatch-gate interface and owning file. It must resolve or validate the exact committed plan blob containing the prepared request and commitment, accept the actual proposed controller configuration, compare all fields, and perform the spawn or return a single-use authorization consumed by the spawn boundary.","id":"P1","locator":"Lines 134-147, 333-339, and Steps 2-3","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","exit_code":null,"method":"read"},"section":"Prepared request and dispatch commitment / Steps","source":"primary","status":"blocking_gap"},{"criterion":"actionability","defect":"The stated buildReviewerArgv behavior is impossible with its proposed inputs: it cannot distinguish committed/read-back records from identical freshly constructed objects, and it cannot validate the timeout actually passed to the controller because ProposedControllerConfig is absent.","evidence":"The proposed signature at lines 141-143 contains preparedRequest and dispatchCommitment but no sourcePlanBytes, commit/blob reference, read-back proof, or proposedConfig. Nevertheless lines 144-147 claim it rejects an uncommitted or non-600 commitment before process creation.","fix":"Redesign the consuming API around authoritative read-back input and the actual launch configuration. Do not claim buildReviewerArgv alone proves commitment or controller configuration unless those authoritative values are supplied and verified at that boundary.","id":"P2","locator":"Lines 134-147","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","exit_code":null,"method":"read"},"section":"Prepared request and dispatch commitment","source":"primary","status":"blocking_gap"},{"criterion":"goal_coverage","defect":"The exact goal requirements—commit/read back the request before any launch and reject invalid controller configuration before spawn—are not enforced at the actual launch boundary. A caller may pass valid record objects to buildReviewerArgv and then launch with timeout 650 or without committing them.","evidence":"Goal lines 7-10 require both properties. ReviewDispatchCommitment fixes a recorded timeout at lines 126-130, but the actual orchestrator-tool timeout is external to argv; abortReviewControllerConfig is a separate optional reducer and no interface binds its ProposedControllerConfig to the subsequent spawn.","fix":"Make every launch flow through one fail-closed boundary that proves the records came from the designated committed read-back blob and compares the actual controller invocation, including timeout_mode and timeout_seconds, immediately before spawning.","id":"P3","locator":"Lines 7-10, 126-147, and 182-194","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","exit_code":null,"method":"read"},"section":"Goal / Interfaces & data shapes","source":"primary","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"A1 and A2 cannot prove the advertised commit-before-spawn and configuration-substitution properties against the proposed architecture because neither provenance nor actual spawn configuration is observable by the planned argv builder.","evidence":"A1 expects request/commitment to precede launch and timeout 650 to produce only not_dispatched. A2 expects mutations for missing commit/read-back, config substitution, and spawn-before-commit to die. Tests of record builders or documented call ordering can pass while an actual caller still skips Git persistence or supplies 650 after argv generation.","fix":"Add an integration acceptance harness around the real dispatch gate with an injected spawn/controller adapter. Mutate the read-back commit/blob and actual controller config, assert rejection, and assert the spawn adapter was called zero times; also prove an exact committed 600 configuration spawns once.","id":"P4","locator":"Acceptance criteria A1-A2","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","exit_code":null,"method":"read"},"section":"Acceptance criteria","source":"primary","status":"blocking_gap"},{"criterion":"failure_modes","defect":"The plan omits the post-validation substitution/TOCTOU failure mode between buildReviewerArgv returning and main context invoking the controller. This can recreate the historical 650-second launch despite a valid 600-second commitment.","evidence":"Lines 138-147 validate a commitment and return argv, while the actual controller invocation remains in main context. STOP lines 452-453 prohibit early or non-600 launch, but no mechanism prevents the caller from changing the external controller timeout or launching after validating uncommitted in-memory records.","fix":"Collapse validation and launch into one operation, or introduce an unforgeable/single-use launch authorization cryptographically bound to the committed plan blob, candidate, argv, and actual controller configuration and consumed by the only spawning path.","id":"P5","locator":"Lines 134-150 and 450-453","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","exit_code":null,"method":"read"},"section":"Prepared request and dispatch commitment / STOP conditions","source":"primary","status":"blocking_gap"},{"criterion":"open_questions","defect":"The plan declares no open questions while leaving a material architectural decision unresolved: whether the helper, main-context manager, or controller adapter owns authoritative Git read-back and atomic validation of the actual controller invocation.","evidence":"The Open questions section states N/A at lines 503-508. Elsewhere Git validation is assigned procedurally to main context, buildReviewerArgv validates only supplied records, and controller configuration abort is a separate reducer. No single owner or trust boundary is selected.","fix":"Resolve and document the owner and interface for the consuming dispatch boundary, including how it obtains authoritative commit/blob bytes, how the actual controller configuration is supplied, and how validation is kept atomic with process creation.","id":"P6","locator":"Lines 503-508","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","exit_code":null,"method":"read"},"section":"Open questions","source":"primary","status":"blocking_gap"}]}],"rounds":[{"kind":"draft","outcome":"not_ready","pre_execution_eligible":false,"reproduced":[{"id":"P1","reproduction":{"command":null,"evidence_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","exit_code":null,"method":"read"}},{"id":"P2","reproduction":{"command":null,"evidence_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","exit_code":null,"method":"read"}},{"id":"P3","reproduction":{"command":null,"evidence_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","exit_code":null,"method":"read"}},{"id":"P4","reproduction":{"command":null,"evidence_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","exit_code":null,"method":"read"}},{"id":"P5","reproduction":{"command":null,"evidence_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","exit_code":null,"method":"read"}},{"id":"P6","reproduction":{"command":null,"evidence_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","exit_code":null,"method":"read"}}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"4d834c0a4cbc9a9c77565e26dd68bb8a6331cda5a0a360cd34651556dd5efaa2","diff_sha256":null,"execution_base_commit":null,"input_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","lifecycle_intent":"none","orchestration_series_id":"2a48a14e-62e4-4349-9e50-df38dfc4d578","orchestration_state_sha256":"104d33cff08397981127586f86deb166249cbcbb849ca0ee4852060915565732","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"d2031968-312d-451e-881d-68953cb618c4","review_mode":"full","reviewed_commit_or_head":"e739ce27f1dcfaf047baf76c2f9ff87c99d50235","round_index":1,"schema":6},"reviewer":{"accepted_finding_ids":["P1","P2","P3","P4","P5","P6"],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"737938","denial_source":null,"exit_code":0,"output_started":true,"reason":"Reviewer output validated after exact 600-second orchestrator-tool execution exited 0 without signal or authoritative denial.","result":"passed","schema":6,"signal":null,"started":true,"stderr_sha256":"9e7827301f61342f91083c830f5192bc9a32888af53f4692bda2ca24ef4b0230","stdout_sha256":"9b821722300629250aa5629b33b196352974600e955e3c2fa21a6d6fcba250b8","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"10d491020e0440f5ef933a3ab4dec9cbb065389d9cb96bae3b2d30b3d2ade5ac","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"4d834c0a4cbc9a9c77565e26dd68bb8a6331cda5a0a360cd34651556dd5efaa2","diff_sha256":null,"execution_base_commit":null,"input_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","lifecycle_intent":"none","orchestration_series_id":"2a48a14e-62e4-4349-9e50-df38dfc4d578","orchestration_state_sha256":"104d33cff08397981127586f86deb166249cbcbb849ca0ee4852060915565732","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"d2031968-312d-451e-881d-68953cb618c4","review_mode":"full","reviewed_commit_or_head":"e739ce27f1dcfaf047baf76c2f9ff87c99d50235","round_index":1,"schema":6},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Blocking: the proposed public buildReviewerArgv signature receives only caller-supplied preparedRequest and dispatchCommitment objects. It receives neither committed Git read-back evidence nor the actual ProposedControllerConfig used by the spawning controller, so its claimed rejection of an uncommitted or substituted launch is not implementable as specified (P2).","status":"blocking_gap"},"dependency_order":{"evidence":"The plan supplies an acyclic red-tests → implementation → documentation/generated parity → focused/full gates → release → completion-handoff sequence, with explicit dependencies and pre-implementation lifecycle gating.","status":"pass"},"evidence_reverification":{"evidence":"The sealed bundle verified successfully with the bundled verify-bundle command against bundle SHA-256 4d834c0a4cbc9a9c77565e26dd68bb8a6331cda5a0a360cd34651556dd5efaa2; plan.review.md hashes to the request input SHA-256 0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97. Inspection also confirms the current helper's buildReviewerArgv is the relevant launch-argv surface.","status":"pass"},"executable_acceptance":{"evidence":"Blocking: A1 and A2 require tests to kill missing commit/read-back, controller-config substitution, and spawn-before-commit, but the planned gate cannot observe either Git provenance or the actual controller timeout supplied after argv construction. Those acceptance claims are therefore not executable against the described boundary (P4).","status":"blocking_gap"},"failure_modes":{"evidence":"Blocking: the plan does not close the post-validation substitution/TOCTOU path where valid in-memory records produce argv and the caller subsequently invokes the controller with timeout 650 or without having committed the records. This violates the fail-closed launch safety property (P5).","status":"blocking_gap"},"goal_coverage":{"evidence":"Blocking: the core requirements to persist/read back the exact request before every launch and reject an invalid controller configuration before spawning are represented as records, but are not bound to the actual consuming spawn operation. A caller can satisfy object validation while violating both requirements (P3).","status":"blocking_gap"},"open_questions":{"evidence":"Blocking: despite declaring N/A, the plan leaves unresolved which executable boundary obtains authoritative Git read-back evidence and the actual controller-tool configuration, and how that boundary atomically authorizes or performs spawn. That choice materially determines the safety design (P6).","status":"blocking_gap"},"standalone_executability":{"evidence":"Blocking: a cold implementer is given record builders and an argv builder, but no concrete callable dispatch gate that consumes committed read-back bytes plus the actual controller configuration before spawning. The required pre-dispatch execution step cannot be completed from the specified interfaces (P1).","status":"blocking_gap"}},"findings":[{"criterion":"standalone_executability","defect":"The plan never specifies a callable consuming dispatch boundary that both validates authoritative committed read-back evidence and controls the actual spawn. Record construction, Git commits, buildReviewerArgv, and main-context dispatch remain separate procedural actions.","evidence":"Plan lines 134-147 describe buildReviewerArgv as returning committed argv, while lines 333-339 describe Git read-back separately and Step 3 only updates agent documentation. No proposed interface accepts a commit/blob identity and then performs or authorizes the controller launch.","fix":"Add a concrete dispatch-gate interface and owning file. It must resolve or validate the exact committed plan blob containing the prepared request and commitment, accept the actual proposed controller configuration, compare all fields, and perform the spawn or return a single-use authorization consumed by the spawn boundary.","id":"P1","locator":"Lines 134-147, 333-339, and Steps 2-3","path":"plan.review.md","section":"Prepared request and dispatch commitment / Steps","status":"blocking_gap"},{"criterion":"actionability","defect":"The stated buildReviewerArgv behavior is impossible with its proposed inputs: it cannot distinguish committed/read-back records from identical freshly constructed objects, and it cannot validate the timeout actually passed to the controller because ProposedControllerConfig is absent.","evidence":"The proposed signature at lines 141-143 contains preparedRequest and dispatchCommitment but no sourcePlanBytes, commit/blob reference, read-back proof, or proposedConfig. Nevertheless lines 144-147 claim it rejects an uncommitted or non-600 commitment before process creation.","fix":"Redesign the consuming API around authoritative read-back input and the actual launch configuration. Do not claim buildReviewerArgv alone proves commitment or controller configuration unless those authoritative values are supplied and verified at that boundary.","id":"P2","locator":"Lines 134-147","path":"plan.review.md","section":"Prepared request and dispatch commitment","status":"blocking_gap"},{"criterion":"goal_coverage","defect":"The exact goal requirements—commit/read back the request before any launch and reject invalid controller configuration before spawn—are not enforced at the actual launch boundary. A caller may pass valid record objects to buildReviewerArgv and then launch with timeout 650 or without committing them.","evidence":"Goal lines 7-10 require both properties. ReviewDispatchCommitment fixes a recorded timeout at lines 126-130, but the actual orchestrator-tool timeout is external to argv; abortReviewControllerConfig is a separate optional reducer and no interface binds its ProposedControllerConfig to the subsequent spawn.","fix":"Make every launch flow through one fail-closed boundary that proves the records came from the designated committed read-back blob and compares the actual controller invocation, including timeout_mode and timeout_seconds, immediately before spawning.","id":"P3","locator":"Lines 7-10, 126-147, and 182-194","path":"plan.review.md","section":"Goal / Interfaces & data shapes","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"A1 and A2 cannot prove the advertised commit-before-spawn and configuration-substitution properties against the proposed architecture because neither provenance nor actual spawn configuration is observable by the planned argv builder.","evidence":"A1 expects request/commitment to precede launch and timeout 650 to produce only not_dispatched. A2 expects mutations for missing commit/read-back, config substitution, and spawn-before-commit to die. Tests of record builders or documented call ordering can pass while an actual caller still skips Git persistence or supplies 650 after argv generation.","fix":"Add an integration acceptance harness around the real dispatch gate with an injected spawn/controller adapter. Mutate the read-back commit/blob and actual controller config, assert rejection, and assert the spawn adapter was called zero times; also prove an exact committed 600 configuration spawns once.","id":"P4","locator":"Acceptance criteria A1-A2","path":"plan.review.md","section":"Acceptance criteria","status":"blocking_gap"},{"criterion":"failure_modes","defect":"The plan omits the post-validation substitution/TOCTOU failure mode between buildReviewerArgv returning and main context invoking the controller. This can recreate the historical 650-second launch despite a valid 600-second commitment.","evidence":"Lines 138-147 validate a commitment and return argv, while the actual controller invocation remains in main context. STOP lines 452-453 prohibit early or non-600 launch, but no mechanism prevents the caller from changing the external controller timeout or launching after validating uncommitted in-memory records.","fix":"Collapse validation and launch into one operation, or introduce an unforgeable/single-use launch authorization cryptographically bound to the committed plan blob, candidate, argv, and actual controller configuration and consumed by the only spawning path.","id":"P5","locator":"Lines 134-150 and 450-453","path":"plan.review.md","section":"Prepared request and dispatch commitment / STOP conditions","status":"blocking_gap"},{"criterion":"open_questions","defect":"The plan declares no open questions while leaving a material architectural decision unresolved: whether the helper, main-context manager, or controller adapter owns authoritative Git read-back and atomic validation of the actual controller invocation.","evidence":"The Open questions section states N/A at lines 503-508. Elsewhere Git validation is assigned procedurally to main context, buildReviewerArgv validates only supplied records, and controller configuration abort is a separate reducer. No single owner or trust boundary is selected.","fix":"Resolve and document the owner and interface for the consuming dispatch boundary, including how it obtains authoritative commit/blob bytes, how the actual controller configuration is supplied, and how validation is kept atomic with process creation.","id":"P6","locator":"Lines 503-508","path":"plan.review.md","section":"Open questions","status":"blocking_gap"}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"4d834c0a4cbc9a9c77565e26dd68bb8a6331cda5a0a360cd34651556dd5efaa2","diff_sha256":null,"execution_base_commit":null,"input_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","lifecycle_intent":"none","orchestration_series_id":"2a48a14e-62e4-4349-9e50-df38dfc4d578","orchestration_state_sha256":"104d33cff08397981127586f86deb166249cbcbb849ca0ee4852060915565732","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"d2031968-312d-451e-881d-68953cb618c4","review_mode":"full","reviewed_commit_or_head":"e739ce27f1dcfaf047baf76c2f9ff87c99d50235","round_index":1,"schema":6},"role":"primary","schema":6,"verdict":"blocking_gap"},"role":"primary","schema":6,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":6},{"kind":"draft","outcome":"passed","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"6e80a4a8658a0db4752dbdd1508e55e0d38440bd283093c32436c7c316968c11","diff_sha256":null,"execution_base_commit":null,"input_sha256":"6c0f054a239b1a78ece5523b36e3aee6f9f53e5e75534da65f35997efef7928b","lifecycle_intent":"none","orchestration_series_id":"2a48a14e-62e4-4349-9e50-df38dfc4d578","orchestration_state_sha256":"14c0f83311a187ca186a574ea4cbb913ac05b8128b13321322c544ef018be5ff","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","repair_targets_sha256":"e227f3ecee9d0e59e2f321452820a8a77b2d5ebc4b0b04947693a67803371396","request_id":"7a8280b3-b6e6-4111-ba31-216e7d1a250b","review_mode":"repair","reviewed_commit_or_head":"4b1382cd19b43dad6589b65d76c4daa6a8b264d1","round_index":2,"schema":6},"reviewer":{"accepted_finding_ids":[],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"6030","denial_source":null,"exit_code":0,"output_started":true,"reason":"Reviewer output validated after exact 600-second orchestrator-tool execution exited 0 without signal or authoritative denial.","result":"passed","schema":6,"signal":null,"started":true,"stderr_sha256":"28ac11bcee43083cd9295bf3e68d23b1653b68d855afed7c2f5cb52911949765","stdout_sha256":"e621cf6462d64795c88441bc642019f88ef722319b172a2070dabfa13c222bdf","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"6e80a4a8658a0db4752dbdd1508e55e0d38440bd283093c32436c7c316968c11","diff_sha256":null,"execution_base_commit":null,"input_sha256":"6c0f054a239b1a78ece5523b36e3aee6f9f53e5e75534da65f35997efef7928b","lifecycle_intent":"none","orchestration_series_id":"2a48a14e-62e4-4349-9e50-df38dfc4d578","orchestration_state_sha256":"14c0f83311a187ca186a574ea4cbb913ac05b8128b13321322c544ef018be5ff","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","repair_targets_sha256":"e227f3ecee9d0e59e2f321452820a8a77b2d5ebc4b0b04947693a67803371396","request_id":"7a8280b3-b6e6-4111-ba31-216e7d1a250b","review_mode":"repair","reviewed_commit_or_head":"4b1382cd19b43dad6589b65d76c4daa6a8b264d1","round_index":2,"schema":6},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"The repaired plan specifies the concrete `dispatchCommittedReviewer({repo,planPath,committedPlanCommit,expectedPreparedRequestSha256,expectedDispatchCommitmentSha256,proposedControllerConfig,controllerAdapter})` API, its owning `review-policy.mjs` file, exact validation inputs, rejection conditions, and adapter invocation semantics. This resolves P2 without relying on in-memory provenance claims.","status":"pass"},"dependency_order":{"evidence":"The repaired workflow is ordered as tests first, implementation second, documentation/generated parity third, focused and full verification fourth, release fifth, and completion handoff sixth. The separate lifecycle precondition requires a passed changed-input draft review before Step 1, and commitment/read-back precedes dispatch.","status":"pass"},"evidence_reverification":{"evidence":"The current sealed plan was rechecked against accepted targets P1-P6. It now binds dispatch to current plan-only Git HEAD, exact committed plan bytes, prepared-request and commitment hashes, actual proposed configuration, and a trusted adapter invoked only after validation. A1 and A2 explicitly reverify those properties with a temporary Git repository, counting adapter, zero-call rejection assertions, and substitution/TOCTOU mutations.","status":"pass"},"executable_acceptance":{"evidence":"A1 is an executable integration oracle around the repaired dispatch gate and requires one adapter call only for matching committed `orchestrator_tool/600`, with zero calls for stale HEAD, missing/substituted records, argv/config drift, and timeout 650. A2 covers post-validation replacement, double-call, and spawn-before-gate mutations; A3-A12 provide focused compatibility, documentation, CI, release, installed-cache, and protected-baseline checks.","status":"pass"},"failure_modes":{"evidence":"The repaired interface collapses validation and process creation into one consuming boundary and returns no reusable authorization. STOP conditions explicitly forbid any schema-6 spawn outside the gate, adapter invocation before Git/blob/config validation, reusable argv authority, or adapter values not taken from the validated commitment, addressing P5's substitution/TOCTOU failure mode.","status":"pass"},"goal_coverage":{"evidence":"The repaired plan covers the accepted requirements: exact request and exact-600 commitment are committed and read back before launch; the sole gate compares actual proposed configuration and performs dispatch; invalid configuration remains pre-dispatch and attempt-free; and the integration acceptance harness proves both successful and rejected launch behavior. No blocking regression from these repairs is evident.","status":"pass"},"open_questions":{"evidence":"The repaired Open questions section resolves P6 by assigning authoritative Git read-back, actual configuration validation, and adapter invocation to `dispatchCommittedReviewer`, while plan-manager remains the record committer and the injected controller adapter is only the host process primitive. No material ownership or trust-boundary choice remains unresolved.","status":"pass"},"standalone_executability":{"evidence":"The repaired plan names the repository, runtime, affected files, commands, record shapes, concrete dispatch-gate signature and owner, Git read-back rules, adapter contract, ordered implementation steps, acceptance commands, and STOP conditions. `dispatchCommittedReviewer` now directly consumes authoritative committed evidence and performs the spawn, resolving P1.","status":"pass"}},"findings":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"6e80a4a8658a0db4752dbdd1508e55e0d38440bd283093c32436c7c316968c11","diff_sha256":null,"execution_base_commit":null,"input_sha256":"6c0f054a239b1a78ece5523b36e3aee6f9f53e5e75534da65f35997efef7928b","lifecycle_intent":"none","orchestration_series_id":"2a48a14e-62e4-4349-9e50-df38dfc4d578","orchestration_state_sha256":"14c0f83311a187ca186a574ea4cbb913ac05b8128b13321322c544ef018be5ff","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"0a2148c542b5da822e78b7d8dcc9fc657b7365e0afaedb81506870f3a91f4a97","repair_targets_sha256":"e227f3ecee9d0e59e2f321452820a8a77b2d5ebc4b0b04947693a67803371396","request_id":"7a8280b3-b6e6-4111-ba31-216e7d1a250b","review_mode":"repair","reviewed_commit_or_head":"4b1382cd19b43dad6589b65d76c4daa6a8b264d1","round_index":2,"schema":6},"role":"primary","schema":6,"verdict":"pass"},"role":"primary","schema":6,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":6}],"schema":6},"settled_orchestration_state_sha256":"6149ca08643c0dde68d3d811a0a9151414c48765259182723aa24792d8e34f76"}

The material rewrite resolves every accepted round-two blocker:

- stdout is no longer an origin source;
- every future request and candidate launch is committed/read back before spawn;
- repair advancement atomically removes the old request and commitment before
  a distinct round-two prepared-request commit;
- invalid controller configuration stops before dispatch and is not an attempt;
- provenance-unavailable closure is a separate request-free,
  current-user-authorized administrative record bound to exact parent bytes;
- StateV2 embeds the exact self-hashed source state, including attempt-two retry
  lineage, and uses distinct nonretryable reasons;
- terminal/receipt families are disjoint and changed-input replacement is an
  exact plan-only CAS with parent-blob proof;
- direct eligible StateV1 inputs normalize uniformly without changing reducer
  preconditions; and
- the already-finished Session Relay plan is an immutable baseline, not a target.

The red→green→docs→gates→release DAG is acyclic. All commands and affected paths
are explicit. The helper plan keeps its existing execution identity, receives
one fresh changed-input draft review, and resumes only through ordinary unblock.

## Open questions

N/A. The selected contract is explicit: durable prepared request, committed
exact-600 launch commitment, one parent-aware terminal validator, and one
authoritative `dispatchCommittedReviewer` boundary that reads exact current
plan-only Git bytes, validates the actual proposed controller configuration,
and itself invokes the trusted host adapter. Pre-dispatch config abort and
separate target-bound user-authorized abandonment retain their closed roles.
The current Session Relay archive remains untouched.

## Cold-handoff checklist

- [ ] Every step names exact files, dependency, owner, command, and STOP action.
- [ ] Prepared request is recursively closed, deep-copied, committed, read back,
  and identity-bound before any config or launch.
- [ ] Each candidate commitment binds exact request/policy position, argv,
  `600`, and the deep-copied/hash-bound prior availability attempts; candidate
  zero has none and later candidates prove matching parent commitments.
- [ ] `dispatchCommittedReviewer` owns exact HEAD/plan-only ancestry,
  committed/worktree byte equality, fallback-history proof, and actual config
  checks before invoking its trusted adapter exactly once; derivation-only argv
  is never reusable spawn authority.
- [ ] Repair advancement atomically removes the old request/commitment, commits
  a state-only round-two family, then commits its distinct prepared request.
- [ ] Invalid config aborts from exact parent/state/prepared bytes before spawn
  with no commitment or attempt/process/output fields.
- [ ] Abandonment persists canonical base64 plus the digest of exact current-user
  bytes, verifies parent/source/authorization on read-back, and contains no
  dispatch/review provenance.
- [ ] StateV2 embeds and self-hashes the exact active source state, including
  attempt-two retry lineage; terminal families remain nonretryable and disjoint
  from series, receipts, repair, and lifecycle apply.
- [ ] Eligible direct StateV1 normalization preserves every existing transition
  precondition and rejection/stale behavior.
- [ ] Changed-input CAS replaces the exact family, uses fresh identities, and
  validates exact source/candidate bytes before commit plus child/parent Git
  blobs and plan-only ancestry after commit.
- [ ] Finished plans/passed receipts cannot reopen; both related plans stay
  read-only.
- [ ] A1–A12 are ordered, executable, clean-worktree-safe, and release-bound.
- [ ] No undefined placeholder, unresolved question, or old stdout-provenance
  route remains.

## Sources

- `plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs:393-424,946-1075,1664-1940` — current request/policy, exact attempt, state, reducer, settlement, and consume invariants.
- `scripts/tests/plan-review-policy-regressions.mjs:443-803` — current no-progress oracle and mutation surface.
- `docs/plans/AGENTS.md:7-35,224-260,295-307` — five-phase ownership, prepare/dispatch/settle, current schema, canonical records, and atomic writes.
- `docs/plans/finished/2026-07-19-session-relay-prebuilt-cli-release.md` — immutable passed archive and historical invalid-controller audit context.
- `docs/plans/active/plan-workflow-phases-and-loop-escape.md:426-456` — released workflow plan and completed Session Relay archive boundary.

## Review

(filled by main-context plan-manager after completion evidence)

Review-orchestration-state: {"apply_state":"none","current_input_sha256":"0c6340f4c92beb296a2719b4988071ae9f832d2f400e03d260139518e7c40972","initial_input_sha256":"0c6340f4c92beb296a2719b4988071ae9f832d2f400e03d260139518e7c40972","lifecycle_intent":"none","orchestration_attempt":1,"phase":"draft","plan_path":"docs/plans/active/plan-review-controller-failure-recovery.md","request_ids":["62b2b0ac-ac8b-4421-b766-d791ac7ff013"],"retry_authorization":null,"round_index":1,"schema":1,"series_id":"db18f139-10d8-4149-b752-2003c867cf0a","series_sha256":null,"state_sha256":"e986990c3e695ad9de8ee7a6b3b52b44fea7f55f1a817484ea9977677e5d9547","status":"active","stop_reason":null,"transitioned_from_state_sha256":null}
