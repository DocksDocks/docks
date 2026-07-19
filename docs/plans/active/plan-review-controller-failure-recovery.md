---
title: Add typed review-controller failure recovery
goal: Persist exact review requests before launch, reject invalid controller configuration before spawning, support user-authorized provenance-unavailable abandonment without fabricated review evidence, normalize StateV1 reducer outputs to StateV2, and release Docks 0.13.1.
status: blocked
created: "2026-07-19T11:24:58-03:00"
updated: "2026-07-19T20:15:00+00:00"
started_at: "2026-07-19T13:10:44-03:00"
blocked_reason: "The materially changed prepared-request, pre-dispatch controller-abort, and authorized-abandonment plan requires a fresh schema-6 draft review; implementation remains paused until a passed receipt and ordinary unblock."
blocked_since: "2026-07-19T14:06:11-03:00"
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
  argv: [string, ...],
  argv_sha256: sha256(JCS(argv)),
  controller_config: {
    timeout_mode: "orchestrator_tool",
    timeout_seconds: 600
  },
  committed_at: ISO-8601-with-offset
}
```

`buildReviewDispatchCommitment` validates the prepared request, requires the
candidate to equal `request.policy.candidates[candidate_index]`, derives exact
argv through the existing builder, and fixes the deadline at `600`. The manager
writes `Review-orchestration-dispatch-commitment: <compact JCS>` and reads it
back before the consuming dispatch boundary may spawn. `buildReviewerArgv` and
the launcher reject a missing, uncommitted, orphaned, stale, substituted,
candidate-mismatched, argv-mismatched, or non-600 commitment before process
creation. Availability-only fallback may replace the commitment with the next
candidate only after validated prior availability evidence; the parent Git blob
retains each prior commitment.

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
  request_ids: [uuid] | [uuid, uuid],
  prepared_request_sha256: 64hex,
  proposed_controller_config: ProposedControllerConfigV1,
  dispatch_status: "not_dispatched",
  reason: "controller_contract_failure",
  validation_error: string,
  recorded_at: ISO-8601-with-offset
}
```

`abortReviewControllerConfig({state,preparedRequest,proposedConfig,recordedAt})`
accepts only an active state plus its exact committed/read-back prepared request.
It first binds candidate position and derived argv to that request, then requires
the unchanged controller-config validator to reject the proposal and requires
the recomputed exact error to equal `validation_error`. The abort shape forbids
attempt, started, child, stdout/stderr, exit, signal, reviewer output, series,
receipt, and dispatch-commitment fields because no process ran. A normally valid
exact-600 proposal cannot abort.

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
  request_ids: [uuid] | [uuid, uuid],
  current_input_sha256: 64hex,
  round_index: 1 | 2,
  outcome: "abandoned",
  reason: "dispatch_provenance_unavailable",
  authorization: ReviewAbandonmentAuthorizationV1,
  recorded_at: ISO-8601-with-offset
}
```

`abandonReviewOrchestration({state,authorization,sourceTextBytes,recordedAt})`
accepts only an exact active StateV1 with no prepared-request or dispatch record.
Main context supplies the current-user bytes separately; the reducer recomputes
their digest, validates every authorization/state identity, deep-copies the
authorization, and returns a new abandonment/state pair without mutating any
input. The abandonment shape is recursively closed and forbids request, policy,
policy hash, candidate, config, argv, attempt, validation error, stdout/stderr,
reviewer result, series, receipt, retry, repair, verdict, or lifecycle-apply
authority. The authorization proves only the user's exact administrative
decision for that one state; it never proves what was dispatched.

### StateV2 and canonical families

```text
ReviewOrchestrationStateV2 =
  all ReviewOrchestrationStateV1 fields, with schema: 2, plus {
    terminal_evidence_sha256: 64hex | null,
    terminated_from_state_sha256: 64hex | null
  }
```

Every ordinary active/passed/stopped/stuck StateV2 has both terminal fields null
and retains all StateV1 status, stop, series, retry, apply, and transition
semantics. Direct otherwise eligible StateV1 inputs to
`beginReviewOrchestration`, `advanceReviewOrchestrationRepair`,
`settleReviewOrchestration`, `consumeReviewIntent`, and its apply-reject branch
emit the equivalent nonterminal StateV2 with null terminal fields only after the
existing transition preconditions pass. Invalid, wrong-status, wrong-round,
wrong-intent, stale, or otherwise ineligible inputs keep their exact existing
rejection or stale-terminalization behavior.

A config abort returns StateV2
`stuck/controller_contract_failure/none`; authorized abandonment returns
`stuck/authorized_abandonment/none`. Both have `series_sha256:null`,
`transitioned_from_state_sha256:null`, no retry authorization, and
`terminal_evidence_sha256:sha256(JCS(typed terminal record))` with
`terminated_from_state_sha256` equal to the source active-state hash. The two new
stop reasons exist only in StateV2 and are always nonretryable.

`MACHINE_RECORD` and `canonicalPlanView` recognize, recursively validate, then
exclude these exact unfenced records:

```text
Review-orchestration-prepared-request: <ReviewPreparedRequestV1 JCS>
Review-orchestration-dispatch-commitment: <ReviewDispatchCommitmentV1 JCS>
Review-orchestration-controller-abort: <ReviewControllerConfigAbortV1 JCS>
Review-orchestration-abandonment: <ReviewOrchestrationAbandonmentV1 JCS>
```

The current canonical families are disjoint:

- active state + one prepared request + zero/one valid dispatch commitment;
- controller-abort StateV2 + its prepared request + exactly one abort and no
  dispatch commitment;
- abandonment StateV2 + exactly one abandonment and no prepared request or
  dispatch commitment;
- ordinary state/series/receipt families with no terminal record.

Canonical read-back reconstructs the source active state and verifies its
self-hash, every record/state digest and identity, candidate/argv position,
request closure/hash, and permitted stop tuple before exclusion. It rejects
duplicates, orphans, half-null terminal fields, cross-pairs, record/reason
substitution, series-backed terminal states, and any completion/draft receipt
coexisting with either terminal record regardless of receipt series. Normal
settlement atomically removes prepared/dispatch records while writing terminal
state plus receipt.

Only materially changed canonical input permits plan-manager to compare-and-swap
an exact terminal family into one fresh active StateV2 with attempt 1, fresh
series/request IDs, null terminal/series/transition/retry fields, and no stale
receipt/prepared/dispatch record. The plan-only replacement validates against
the exact committed source blob, reads back before commit, and proves
`git show <replacement-parent>:<plan>` recovers the old family. It then commits
a separate fresh prepared request before any launch. Same-input or metadata-only
replacement, partial removal, dirty/concurrent source, reused identities, failed
read-back, retry, repair, settlement, or intent consumption rejects without
mutation.

Finished plans, archived paths, passed states, and existing completion receipts
are immutable and cannot enter abandonment, replacement, or reopened review.

## Steps

| # | Task | Files | Depends | Status | Done when / failure action |
|---|---|---|---|---|---|
| 1 | Add red contract and mutation tests for prepared-request commit/read-back, per-candidate exact-600 dispatch commitment, pre-dispatch invalid-config abort, target-bound authorized abandonment, generic terminal StateV2 pairing, changed-input CAS, finished-plan immutability, and direct eligible StateV1 inputs across begin/repair/settle/consume/apply-reject. | `scripts/tests/plan-review-policy-regressions.mjs`; `scripts/tests/plan-review-policy.mjs`; `scripts/tests/plan-skill-phases.mjs` | — | planned | The focused oracle fails only for missing new behavior. Tests prove no spawn precedes a committed/read-back request and valid commitment; a proposed 650 config aborts as `not_dispatched`; abandonment accepts only exact current-user authority and makes no request/controller claim; each reducer preserves old preconditions; the finished Session Relay archive cannot reopen. Setup/syntax failure is STOP. |
| 2 | Implement closed prepared-request, dispatch-commitment, controller-abort, abandonment-authorization/record validators and reducers; generalize StateV2 terminal fields; add canonical family validation and changed-input CAS; normalize only otherwise eligible direct StateV1 reducer outputs. | `plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs` | 1 | planned | A1–A3 pass. Exact-600 normal attempt validation and schemas 1–5 are unchanged. No invalid config spawns; no terminal record can produce a ReviewSeries/receipt/retry/apply; no input is mutated. |
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
| A1 | `env DOCKS_REVIEW_POLICY_ORCHESTRATION_ORACLE=1 node scripts/tests/plan-review-policy-regressions.mjs --orchestration-oracle` | Exit 0; prepared request and each candidate commitment bind exact state/request/policy/argv and precede launch; proposed timeout 650 produces only pre-dispatch `controller_contract_failure`; exact authorized no-provenance abandonment produces only `authorized_abandonment`; both terminal families are nonretryable, receiptless, canonically paired, input-preserving, and changed-input-only. |
| A2 | `node scripts/tests/plan-review-policy-regressions.mjs --self-test` | Exit 0; mutations kill missing commit/read-back, request/policy/candidate/argv/config substitution, spawn-before-commit, stdout self-attestation, missing/changed/replayed user bytes, extra abandonment provenance fields, half/orphan/cross terminal records, receipt/series substitution, same-input CAS, finished-plan reopen, and weakened V1 normalization/preconditions. |
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
- User authorization proves only abandonment of one exact active state. It is
  not a request, verdict, retry, repair, receipt, or general lifecycle grant.
- Candidate equality and argv are position-sensitive. Default fallback replaces
  commitments in exact order only after validated availability evidence; pinned
  policy permits index 0 only.
- `series_sha256` always binds a valid ReviewSeries. Terminal administrative
  evidence uses only the generic terminal/source digest pair; lifecycle
  transition hashes retain their StateV1 meaning.
- Current-only replacement removes the complete terminal family. Parent Git
  history, not an orphan current record, preserves it.
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
- A controller abort accepts an exact-600 valid config, contains process/attempt/
  output fields, lacks its prepared request, or follows a spawned process.
- Abandonment accepts missing/changed/replayed user bytes, a nonactive or
  StateV2 source, a prepared/dispatch record, or any request/policy/candidate/
  config/attempt/stdout/verdict/retry/receipt/apply field.
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

The material rewrite resolves every accepted round-two blocker:

- stdout is no longer an origin source;
- every future request and candidate launch is committed/read back before spawn;
- invalid controller configuration stops before dispatch and is not an attempt;
- provenance-unavailable closure is a separate request-free,
  current-user-authorized administrative record;
- StateV2 uses generic terminal/source digests and distinct nonretryable reasons;
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
exact-600 launch commitment, pre-dispatch config abort, and separate
target-bound user-authorized abandonment for a pre-feature active StateV1 with
unavailable provenance. The current Session Relay archive remains untouched.

## Cold-handoff checklist

- [ ] Every step names exact files, dependency, owner, command, and STOP action.
- [ ] Prepared request is recursively closed, deep-copied, committed, read back,
  and identity-bound before any config or launch.
- [ ] Each candidate commitment binds exact request/policy position, argv, and
  `600`; availability fallback preserves order and Git history.
- [ ] Invalid config aborts before spawn with no attempt/process/output fields.
- [ ] Abandonment requires exact current-user bytes and contains no dispatch or
  review provenance claims.
- [ ] StateV2 terminal/source digests, stop reasons, and canonical families are
  disjoint from series, receipts, retry, repair, and lifecycle apply.
- [ ] Eligible direct StateV1 normalization preserves every existing transition
  precondition and rejection/stale behavior.
- [ ] Changed-input CAS replaces the exact family, uses fresh identities,
  validates read-back, and proves the parent blob.
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

Review-orchestration-state: {"apply_state":"none","current_input_sha256":"501bc956cea00243bca9b6137f49a9c38458eec5d8324776f31e7cb7c1f5f6d3","initial_input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","lifecycle_intent":"none","orchestration_attempt":1,"phase":"draft","plan_path":"docs/plans/active/plan-review-controller-failure-recovery.md","request_ids":["d072ac64-0f37-4e3b-843a-77306385c048","c4e9845b-74ff-4c48-bbf7-fe1fd8c5f53b"],"retry_authorization":null,"round_index":2,"schema":1,"series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","series_sha256":"220312a451bcb6efe4d3f0518709444975abcef6f27237c19cd1d130587d441f","state_sha256":"bb18781dfd6b4972f5ba809748e55994cfedf3a55ee1d084743c4f09ba00ac68","status":"stuck","stop_reason":"not_ready","transitioned_from_state_sha256":null}
Review-receipt: {"input_sha256":"501bc956cea00243bca9b6137f49a9c38458eec5d8324776f31e7cb7c1f5f6d3","outcome":"not_ready","phase":"draft","policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","pre_execution_eligible":false,"reproduced":[{"id":"P1","reproduction":{"command":null,"evidence_sha256":"adc5c3e7ffe9fb2f703a06bc31a48ed860ba005d7ccc3c90d6d156b614165bc9","exit_code":null,"method":"read"}},{"id":"P2","reproduction":{"command":null,"evidence_sha256":"74189087934d9c0aecd455117eb5796316a53f33c1bf22aaeb65c2401f46a075","exit_code":null,"method":"read"}},{"id":"P3","reproduction":{"command":null,"evidence_sha256":"6cb1d4e922d14b267888c870ba3031bf6c36a44041b2d3dafb32c64f0ee4a5ba","exit_code":null,"method":"read"}}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"f68b1ad8a625225994b240e97a3965f14f0a2dd33445f342f4be87d422838fbe","diff_sha256":null,"execution_base_commit":null,"input_sha256":"501bc956cea00243bca9b6137f49a9c38458eec5d8324776f31e7cb7c1f5f6d3","lifecycle_intent":"none","orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","orchestration_state_sha256":"85d2569bd1f6550a99a226559c1036e8f8f2407554b88942db6a0b14d52d8731","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","repair_targets_sha256":"2cdd08e0df009c1f8f37a3c57cb284771c7781270ed945f7ac94ccddbcdc4e00","request_id":"c4e9845b-74ff-4c48-bbf7-fe1fd8c5f53b","review_mode":"repair","reviewed_commit_or_head":"c43274d108071d784d541e879cf10c2284aa519c","round_index":2,"schema":6},"reviewed_at":"2026-07-19T18:22:46.487Z","reviewed_commit":"c43274d108071d784d541e879cf10c2284aa519c","reviewer":{"accepted_finding_ids":["P1","P2","P3"],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"019f7b94-f8ec-70b0-8c8a-b1a680c63914","denial_source":null,"exit_code":0,"output_started":true,"reason":"Reviewer output validated after exact 600-second orchestrator-tool execution exited 0 without signal or authoritative denial.","result":"passed","schema":6,"signal":null,"started":true,"stderr_sha256":"74fcbfdcac6382538458f4ded40f3fd26d57695544c089926d90a5b8d706a4a6","stdout_sha256":"1effde596eb63c73f31cca61b85e2d61b561512af7b3cd78fac29ae55fb24929","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"6a0ad12a55f7b3b9cbbfa47ddff93a593cef34f38d240d83f97659281ecfd27c","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"f68b1ad8a625225994b240e97a3965f14f0a2dd33445f342f4be87d422838fbe","diff_sha256":null,"execution_base_commit":null,"input_sha256":"501bc956cea00243bca9b6137f49a9c38458eec5d8324776f31e7cb7c1f5f6d3","lifecycle_intent":"none","orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","orchestration_state_sha256":"85d2569bd1f6550a99a226559c1036e8f8f2407554b88942db6a0b14d52d8731","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","repair_targets_sha256":"2cdd08e0df009c1f8f37a3c57cb284771c7781270ed945f7ac94ccddbcdc4e00","request_id":"c4e9845b-74ff-4c48-bbf7-fe1fd8c5f53b","review_mode":"repair","reviewed_commit_or_head":"c43274d108071d784d541e879cf10c2284aa519c","round_index":2,"schema":6},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"The repaired plan names the affected files, closed data shapes, reducer behavior, test surfaces, exact commands, expected results, and STOP conditions sufficiently for implementation.","status":"pass"},"dependency_order":{"evidence":"Steps remain acyclic: red contract tests precede implementation, documentation and generated parity follow implementation, focused/full gates precede commit binding, and release/verification follows the bound implementation.","status":"pass"},"evidence_reverification":{"evidence":"A1–A8 specify focused oracle, mutation, surface, content-hash, targeted CI, full CI, commit-binding, and clean-worktree checks; the repaired persistence rule also requires canonical read-back and parent-blob recovery.","status":"pass"},"executable_acceptance":{"evidence":"A1–A3 test request and policy binding, but the legacy reviewer_stdout branch treats the response's self-reported request as independent origin evidence. Those tests therefore cannot reject a policy/candidate substitution consistently echoed in stdout with recomputed caller-provided hashes.","status":"blocking_gap"},"failure_modes":{"evidence":"The exact-evidence safety property still fails for the legacy output-started path: reviewer stdout is controller output under validation, so its embedded request cannot independently establish which request or policy the manager dispatched.","status":"blocking_gap"},"goal_coverage":{"evidence":"The repair securely binds pre-dispatch failures to a separately retained manager request, candidate index, and fallback prefix, but explicitly permits legacy expectedRequest recovery solely from reviewer stdout. That leaves the accepted exact-request-origin requirement incomplete.","status":"blocking_gap"},"open_questions":{"evidence":"The repaired plan selects a definite current-only lifecycle: atomically commit the abort/state pair, replace both only after changed canonical input, and retain prior evidence in the replacement parent Git blob.","status":"pass"},"standalone_executability":{"evidence":"Repository, runtime, affected paths, interfaces, execution order, focused checks, full gates, release commands, and protected out-of-scope plans are explicitly identified without requiring an unresolved implementation choice.","status":"pass"}},"findings":[{"criterion":"goal_coverage","defect":"The exact-invalid-controller-evidence requirement would fail for the legacy output-started branch because expectedRequest may be recovered solely from reviewer stdout. A malformed ReviewerOutputV6 can echo the active request ID while substituting another eligible policy and candidate; recomputing the failure policy/hash and stdout hashes then makes the substituted evidence internally consistent without proving what the manager dispatched.","evidence":"Under “Interfaces & data shapes,” pre_dispatch uses a manager-trusted request, but the legacy exception says expectedRequest may be recovered from raw stdout when the bytes hash to the failing attempt and parse as a closed ReviewerOutputV6. Those hashes bind the bytes only to caller-supplied failure fields; the response's request echo is not independent dispatch provenance.","fix":"Require manager-retained pre-dispatch expectedRequest or an independently persisted dispatch-time request/policy digest for the legacy path as well. If neither exists, reject the abort rather than authorizing it from reviewer output.","id":"P1","locator":"Interfaces & data shapes — legacy output-started expectedRequest recovery","path":"plan.review.md","section":"Interfaces & data shapes","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"The exact-origin acceptance step would fail because A1–A3 can pass while accepting a legacy stdout request that substitutes the originating policy/candidate. Changed-stdout and policy-drift mutations only test internal consistency, not equality to dispatch-time manager evidence.","evidence":"The added A1 clause proves exact-stdout legacy provenance, while A2 rejects changed raw stdout, policy-hash drift, and candidate substitutions. No legacy assertion compares the stdout request to a manager-retained request or independent dispatch-time digest, because the plan explicitly permits deriving expectedRequest from that same stdout.","fix":"Add a legacy mutation that preserves state identities, substitutes policy/candidate/request fields in stdout, and recomputes every failure/stdout hash; require rejection against separately retained dispatch evidence. Cover the no-dispatch-evidence case as a mandatory rejection.","id":"P2","locator":"Acceptance criteria — A1–A3 provenance clauses","path":"plan.review.md","section":"Acceptance criteria","status":"blocking_gap"},{"criterion":"failure_modes","defect":"The safety property requiring exact evidence for the originating request would fail when malformed reviewer output self-reports a substituted policy. Because the response being rejected is also used as the authority for expectedRequest, candidate membership and order are checked against the substituted policy rather than the dispatched one.","evidence":"The repaired failure matrix rejects request/policy/hash and raw-byte mismatches, but all legacy values can agree with one forged stdout payload. The manager-as-sole-writer statement does not supply an independent legacy request value to compare with that payload.","fix":"Make independent dispatch-time request provenance mandatory for every abort path and add a STOP/rejection case for legacy output whose request cannot be matched to it; preserve all inputs on rejection.","id":"P3","locator":"STOP conditions and legacy reviewer_stdout provenance","path":"plan.review.md","section":"Failure modes","status":"blocking_gap"}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"f68b1ad8a625225994b240e97a3965f14f0a2dd33445f342f4be87d422838fbe","diff_sha256":null,"execution_base_commit":null,"input_sha256":"501bc956cea00243bca9b6137f49a9c38458eec5d8324776f31e7cb7c1f5f6d3","lifecycle_intent":"none","orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","orchestration_state_sha256":"85d2569bd1f6550a99a226559c1036e8f8f2407554b88942db6a0b14d52d8731","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","repair_targets_sha256":"2cdd08e0df009c1f8f37a3c57cb284771c7781270ed945f7ac94ccddbcdc4e00","request_id":"c4e9845b-74ff-4c48-bbf7-fe1fd8c5f53b","review_mode":"repair","reviewed_commit_or_head":"c43274d108071d784d541e879cf10c2284aa519c","round_index":2,"schema":6},"role":"primary","schema":6,"verdict":"blocking_gap"},"role":"primary","schema":6,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":6,"series":{"current_input_sha256":"501bc956cea00243bca9b6137f49a9c38458eec5d8324776f31e7cb7c1f5f6d3","initial_input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","repairs":[{"accepted_finding_ids":["P1","P2","P3","P4","P5"],"current_input_sha256":"501bc956cea00243bca9b6137f49a9c38458eec5d8324776f31e7cb7c1f5f6d3","current_orchestration_state_sha256":"85d2569bd1f6550a99a226559c1036e8f8f2407554b88942db6a0b14d52d8731","from_round_index":1,"orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","previous_input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","previous_orchestration_state_sha256":"de002aa916bb0445fa99eef06ba027b8aefa3ccf593bd99ee58667f74162d143","repair_targets_sha256":"2cdd08e0df009c1f8f37a3c57cb284771c7781270ed945f7ac94ccddbcdc4e00","schema":6,"targets":[{"criterion":"goal_coverage","defect":"The plan cannot prove that an observed invalid attempt belongs to the request being aborted. ReviewOrchestrationAbortV1 carries request_id and a free-standing CurrentCandidateV6, but neither the exact ReviewRequestEnvelopeV6 nor policy_sha256/candidate position; abortReviewOrchestration accepts only {state,failure}. Consequently an arbitrary eligible candidate can be substituted while still producing the recorded validateCurrentAttempt error.","evidence":"In the proposed shape, observed_attempts entries contain only request_id, attempt, and validation_error. The bundled helper separates validateCurrentAttempt (shape/result validation at lines 1233–1261) from validateCurrentAttemptSequence (policy candidate-order binding at lines 1264–1277), while the plan requires only the former.","fix":"Bind each observation to the exact request or its policy digest and candidate index, validate the request identities against the state, and independently enforce candidate membership/order against request.policy before accepting invalid-attempt evidence. Add default-chain and pinned-policy substitution cases.","id":"P1","locator":"ReviewOrchestrationAbortV1 and abortReviewOrchestration({state, failure})","path":"plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs","reproduction":{"command":null,"evidence_sha256":"3eab6a8074b6dc40de003161ce37643d4583255990c5eb86ba4f217dc5efd881","exit_code":null,"method":"read"},"section":"Interfaces & data shapes","source":"primary","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"A1–A3 do not require rejection when an abort observation uses a candidate that was not authorized by the originating request policy. The exact-invalid-controller-evidence requirement could therefore pass while accepting fabricated candidate evidence.","evidence":"Step 1 and A1 enumerate identity/error, valid-attempt, orphan, digest, status, receipt, and changed-input cases, but no request-policy, pinned-policy, candidate-index, or fallback-order substitution. The bundled planned oracle constructs invalidAttempt() with a candidate directly and abortFailure() stores no request policy.","fix":"Add direct and mutation tests that substitute another eligible candidate, change candidate position, switch between pinned/default policies, or drift policy_sha256, and require abort rejection without input mutation.","id":"P2","locator":"A1–A3","path":"scripts/tests/plan-review-policy-regressions.mjs","reproduction":{"command":null,"evidence_sha256":"d2126755c2132acc142f607feae0be5474a62d6e6efbcc96638f4b8ddd179975","exit_code":null,"method":"read"},"section":"Acceptance criteria","source":"primary","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"The exact implementation-commit binding step claims to require a clean index/worktree, but A7 and A8 check only tracked differences. Untracked source or generated files can influence full CI or release preparation without being contained in the bound HEAD.","evidence":"A7 and A8 use git diff --quiet and git diff --cached --quiet. Both ignore untracked files, despite Step 4 and A7 stating that the worktree is clean and the tested implementation is exactly bound.","fix":"Before and after CI/dry-run, assert an empty porcelain status including untracked files, for example test -z \"$(git status --porcelain=v1 --untracked-files=all)\", while preserving the existing HEAD/file/ref checks.","id":"P3","locator":"A7 and A8","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"52f53ad46b5cf16ab6cfa46650707260506e4aa66bfc296abf1fc8b0223e8a33","exit_code":null,"method":"read"},"section":"Acceptance criteria","source":"primary","status":"blocking_gap"},{"criterion":"failure_modes","defect":"The exact-evidence safety property would fail when a malformed attempt for an unrelated but structurally eligible candidate is supplied with the active state's request ID. The proposed validator can recompute the same validation_error and terminalize the state even though the controller never attempted that candidate for that request.","evidence":"The plan binds plan/phase/intent/series/state/request IDs and recomputes validateCurrentAttempt errors, but supplies no originating request or policy to abortReviewOrchestration. Its forgedFailure matrix likewise omits candidate-policy substitution.","fix":"Make request-policy binding a mandatory abort precondition and add a STOP/rejection case for any candidate, policy, order, or provenance mismatch; preserve both state and failure inputs on rejection.","id":"P4","locator":"Failure identities and request IDs must exactly equal the state","path":"plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs","reproduction":{"command":null,"evidence_sha256":"591551521f95f3f381e2258e7f5f51b26d1e1baa2cf7eaafc30a48f643514c36","exit_code":null,"method":"read"},"section":"Interfaces & data shapes","source":"primary","status":"blocking_gap"},{"criterion":"open_questions","defect":"The persistence lifecycle after a changed-input restart is unresolved. The exact execution step that would fail is writing the owning workflow's new active orchestration while the current-only abort/state pair remains subject to one-record bijection and duplicate rejection.","evidence":"The plan simultaneously requires one bijective abort/state pair, rejection of more than one state, durable abort evidence, and changed-input-only restart. A1 exercises beginReviewOrchestration in memory after abort but does not canonicalize or read back the resulting plan record transition.","fix":"Specify whether the manager atomically replaces both current-only abort records and relies on committed Git history, or redesign the grammar to retain historical abort pairs alongside one current state. Add an end-to-end canonicalize, commit/read-back, and restart test for the selected rule.","id":"P5","locator":"Open questions: N/A; changed-input-only recovery","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"09fd601120d13f2ebe408a483a7d023c6e6cb5c384343dbbf283dfaf3dd1152a","exit_code":null,"method":"read"},"section":"Open questions","source":"primary","status":"blocking_gap"}]}],"rounds":[{"kind":"draft","outcome":"not_ready","pre_execution_eligible":false,"reproduced":[{"id":"P1","reproduction":{"command":null,"evidence_sha256":"3eab6a8074b6dc40de003161ce37643d4583255990c5eb86ba4f217dc5efd881","exit_code":null,"method":"read"}},{"id":"P2","reproduction":{"command":null,"evidence_sha256":"d2126755c2132acc142f607feae0be5474a62d6e6efbcc96638f4b8ddd179975","exit_code":null,"method":"read"}},{"id":"P3","reproduction":{"command":null,"evidence_sha256":"52f53ad46b5cf16ab6cfa46650707260506e4aa66bfc296abf1fc8b0223e8a33","exit_code":null,"method":"read"}},{"id":"P4","reproduction":{"command":null,"evidence_sha256":"591551521f95f3f381e2258e7f5f51b26d1e1baa2cf7eaafc30a48f643514c36","exit_code":null,"method":"read"}},{"id":"P5","reproduction":{"command":null,"evidence_sha256":"09fd601120d13f2ebe408a483a7d023c6e6cb5c384343dbbf283dfaf3dd1152a","exit_code":null,"method":"read"}}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"f3d6cedef9e6a60180ac1677b6a2c5c30babc9cb28e9539fa2dda51345555b91","diff_sha256":null,"execution_base_commit":null,"input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","lifecycle_intent":"none","orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","orchestration_state_sha256":"de002aa916bb0445fa99eef06ba027b8aefa3ccf593bd99ee58667f74162d143","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"d072ac64-0f37-4e3b-843a-77306385c048","review_mode":"full","reviewed_commit_or_head":"c989527e81a6dd0de534aeff762239b89dbe19aa","round_index":1,"schema":6},"reviewer":{"accepted_finding_ids":["P1","P2","P3","P4","P5"],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"019f7b63-6f15-7d20-adc7-bd92e6b409a0","denial_source":null,"exit_code":0,"output_started":true,"reason":"Reviewer output validated after exact 600-second orchestrator-tool execution exited 0 without signal or authoritative denial.","result":"passed","schema":6,"signal":null,"started":true,"stderr_sha256":"8de7343e2de140216a0c3b61ae322bd7aa8b144175134614f4967c845a87d907","stdout_sha256":"ab4c20e34c3a529df875bf0d050ecc578654abbc8aff35b233266212905baceb","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"d1320895c7acf3b74476443fe212802624c8d85aecbd03b86c2fcbbd2a3069b1","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"f3d6cedef9e6a60180ac1677b6a2c5c30babc9cb28e9539fa2dda51345555b91","diff_sha256":null,"execution_base_commit":null,"input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","lifecycle_intent":"none","orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","orchestration_state_sha256":"de002aa916bb0445fa99eef06ba027b8aefa3ccf593bd99ee58667f74162d143","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"d072ac64-0f37-4e3b-843a-77306385c048","review_mode":"full","reviewed_commit_or_head":"c989527e81a6dd0de534aeff762239b89dbe19aa","round_index":1,"schema":6},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Steps 1–6 identify concrete files, reducer behavior, documentation updates, release operations, completion conditions, and STOP actions. The implementation work is otherwise sufficiently specific.","status":"pass"},"dependency_order":{"evidence":"The red-contract → implementation → generated documentation/hash regeneration → focused and full gates → release → completion-handoff sequence is explicit, acyclic, and correctly keeps candidate-plan repair after the helper release.","status":"pass"},"evidence_reverification":{"evidence":"Bundled review-policy.mjs confirms the cited baseline: canonicalPlanView currently recognizes only Review-orchestration-state, validateCurrentAttempt enforces the 600-second deadline, state schema 1 is current, and begin/repair/settle/consume are the affected reducers. The plan requires focused oracle, mutation, surface, targeted-CI, full-CI, tag-CI, release, cache-byte, and protected-plan checks.","status":"pass"},"executable_acceptance":{"evidence":"Acceptance misses two release-safety checks: it does not test that abort attempts are bound to the originating request policy, and A7/A8 claim a clean worktree while using git diff checks that ignore untracked files.","status":"blocking_gap"},"failure_modes":{"evidence":"The proposed abort reducer can terminalize an active orchestration from an eligible but request-unauthorized candidate because its input contains no request or policy binding. That violates the exact-evidence safety property and is not covered by the forged-evidence cases.","status":"blocking_gap"},"goal_coverage":{"evidence":"The exact-controller-evidence requirement is not fully covered. ReviewOrchestrationAbortV1 stores request IDs and attempt candidates, but no request envelope, policy digest, candidate index, or candidate-order binding; abortReviewOrchestration receives only state and failure. Bundled code shows validateCurrentAttempt validates candidate shape, while validateCurrentAttemptSequence performs the missing policy-order binding.","status":"blocking_gap"},"open_questions":{"evidence":"The plan calls the abort record current-only, requires its bijective pairing with the sole state record, and permits changed-input restart, but does not decide how the manager persists the new active state: retaining the abort creates an orphan/duplicate conflict, while removing it relies on Git history for durability. That record-lifecycle decision must be explicit for the owning workflow handoff.","status":"blocking_gap"},"standalone_executability":{"evidence":"The plan specifies repository, branch, Node runtime, dependency assumption, exact affected paths, interfaces, focused commands, gates, release command, protected paths, and completion evidence. No additional source outside the sealed bundle is needed to understand the planned work.","status":"pass"}},"findings":[{"criterion":"goal_coverage","defect":"The plan cannot prove that an observed invalid attempt belongs to the request being aborted. ReviewOrchestrationAbortV1 carries request_id and a free-standing CurrentCandidateV6, but neither the exact ReviewRequestEnvelopeV6 nor policy_sha256/candidate position; abortReviewOrchestration accepts only {state,failure}. Consequently an arbitrary eligible candidate can be substituted while still producing the recorded validateCurrentAttempt error.","evidence":"In the proposed shape, observed_attempts entries contain only request_id, attempt, and validation_error. The bundled helper separates validateCurrentAttempt (shape/result validation at lines 1233–1261) from validateCurrentAttemptSequence (policy candidate-order binding at lines 1264–1277), while the plan requires only the former.","fix":"Bind each observation to the exact request or its policy digest and candidate index, validate the request identities against the state, and independently enforce candidate membership/order against request.policy before accepting invalid-attempt evidence. Add default-chain and pinned-policy substitution cases.","id":"P1","locator":"ReviewOrchestrationAbortV1 and abortReviewOrchestration({state, failure})","path":"plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs","section":"Interfaces & data shapes","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"A1–A3 do not require rejection when an abort observation uses a candidate that was not authorized by the originating request policy. The exact-invalid-controller-evidence requirement could therefore pass while accepting fabricated candidate evidence.","evidence":"Step 1 and A1 enumerate identity/error, valid-attempt, orphan, digest, status, receipt, and changed-input cases, but no request-policy, pinned-policy, candidate-index, or fallback-order substitution. The bundled planned oracle constructs invalidAttempt() with a candidate directly and abortFailure() stores no request policy.","fix":"Add direct and mutation tests that substitute another eligible candidate, change candidate position, switch between pinned/default policies, or drift policy_sha256, and require abort rejection without input mutation.","id":"P2","locator":"A1–A3","path":"scripts/tests/plan-review-policy-regressions.mjs","section":"Acceptance criteria","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"The exact implementation-commit binding step claims to require a clean index/worktree, but A7 and A8 check only tracked differences. Untracked source or generated files can influence full CI or release preparation without being contained in the bound HEAD.","evidence":"A7 and A8 use git diff --quiet and git diff --cached --quiet. Both ignore untracked files, despite Step 4 and A7 stating that the worktree is clean and the tested implementation is exactly bound.","fix":"Before and after CI/dry-run, assert an empty porcelain status including untracked files, for example test -z \"$(git status --porcelain=v1 --untracked-files=all)\", while preserving the existing HEAD/file/ref checks.","id":"P3","locator":"A7 and A8","path":"plan.review.md","section":"Acceptance criteria","status":"blocking_gap"},{"criterion":"failure_modes","defect":"The exact-evidence safety property would fail when a malformed attempt for an unrelated but structurally eligible candidate is supplied with the active state's request ID. The proposed validator can recompute the same validation_error and terminalize the state even though the controller never attempted that candidate for that request.","evidence":"The plan binds plan/phase/intent/series/state/request IDs and recomputes validateCurrentAttempt errors, but supplies no originating request or policy to abortReviewOrchestration. Its forgedFailure matrix likewise omits candidate-policy substitution.","fix":"Make request-policy binding a mandatory abort precondition and add a STOP/rejection case for any candidate, policy, order, or provenance mismatch; preserve both state and failure inputs on rejection.","id":"P4","locator":"Failure identities and request IDs must exactly equal the state","path":"plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs","section":"Interfaces & data shapes","status":"blocking_gap"},{"criterion":"open_questions","defect":"The persistence lifecycle after a changed-input restart is unresolved. The exact execution step that would fail is writing the owning workflow's new active orchestration while the current-only abort/state pair remains subject to one-record bijection and duplicate rejection.","evidence":"The plan simultaneously requires one bijective abort/state pair, rejection of more than one state, durable abort evidence, and changed-input-only restart. A1 exercises beginReviewOrchestration in memory after abort but does not canonicalize or read back the resulting plan record transition.","fix":"Specify whether the manager atomically replaces both current-only abort records and relies on committed Git history, or redesign the grammar to retain historical abort pairs alongside one current state. Add an end-to-end canonicalize, commit/read-back, and restart test for the selected rule.","id":"P5","locator":"Open questions: N/A; changed-input-only recovery","path":"plan.review.md","section":"Open questions","status":"blocking_gap"}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"f3d6cedef9e6a60180ac1677b6a2c5c30babc9cb28e9539fa2dda51345555b91","diff_sha256":null,"execution_base_commit":null,"input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","lifecycle_intent":"none","orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","orchestration_state_sha256":"de002aa916bb0445fa99eef06ba027b8aefa3ccf593bd99ee58667f74162d143","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"d072ac64-0f37-4e3b-843a-77306385c048","review_mode":"full","reviewed_commit_or_head":"c989527e81a6dd0de534aeff762239b89dbe19aa","round_index":1,"schema":6},"role":"primary","schema":6,"verdict":"blocking_gap"},"role":"primary","schema":6,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":6},{"kind":"draft","outcome":"not_ready","pre_execution_eligible":false,"reproduced":[{"id":"P1","reproduction":{"command":null,"evidence_sha256":"adc5c3e7ffe9fb2f703a06bc31a48ed860ba005d7ccc3c90d6d156b614165bc9","exit_code":null,"method":"read"}},{"id":"P2","reproduction":{"command":null,"evidence_sha256":"74189087934d9c0aecd455117eb5796316a53f33c1bf22aaeb65c2401f46a075","exit_code":null,"method":"read"}},{"id":"P3","reproduction":{"command":null,"evidence_sha256":"6cb1d4e922d14b267888c870ba3031bf6c36a44041b2d3dafb32c64f0ee4a5ba","exit_code":null,"method":"read"}}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"f68b1ad8a625225994b240e97a3965f14f0a2dd33445f342f4be87d422838fbe","diff_sha256":null,"execution_base_commit":null,"input_sha256":"501bc956cea00243bca9b6137f49a9c38458eec5d8324776f31e7cb7c1f5f6d3","lifecycle_intent":"none","orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","orchestration_state_sha256":"85d2569bd1f6550a99a226559c1036e8f8f2407554b88942db6a0b14d52d8731","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","repair_targets_sha256":"2cdd08e0df009c1f8f37a3c57cb284771c7781270ed945f7ac94ccddbcdc4e00","request_id":"c4e9845b-74ff-4c48-bbf7-fe1fd8c5f53b","review_mode":"repair","reviewed_commit_or_head":"c43274d108071d784d541e879cf10c2284aa519c","round_index":2,"schema":6},"reviewer":{"accepted_finding_ids":["P1","P2","P3"],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"019f7b94-f8ec-70b0-8c8a-b1a680c63914","denial_source":null,"exit_code":0,"output_started":true,"reason":"Reviewer output validated after exact 600-second orchestrator-tool execution exited 0 without signal or authoritative denial.","result":"passed","schema":6,"signal":null,"started":true,"stderr_sha256":"74fcbfdcac6382538458f4ded40f3fd26d57695544c089926d90a5b8d706a4a6","stdout_sha256":"1effde596eb63c73f31cca61b85e2d61b561512af7b3cd78fac29ae55fb24929","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"6a0ad12a55f7b3b9cbbfa47ddff93a593cef34f38d240d83f97659281ecfd27c","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"f68b1ad8a625225994b240e97a3965f14f0a2dd33445f342f4be87d422838fbe","diff_sha256":null,"execution_base_commit":null,"input_sha256":"501bc956cea00243bca9b6137f49a9c38458eec5d8324776f31e7cb7c1f5f6d3","lifecycle_intent":"none","orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","orchestration_state_sha256":"85d2569bd1f6550a99a226559c1036e8f8f2407554b88942db6a0b14d52d8731","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","repair_targets_sha256":"2cdd08e0df009c1f8f37a3c57cb284771c7781270ed945f7ac94ccddbcdc4e00","request_id":"c4e9845b-74ff-4c48-bbf7-fe1fd8c5f53b","review_mode":"repair","reviewed_commit_or_head":"c43274d108071d784d541e879cf10c2284aa519c","round_index":2,"schema":6},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"The repaired plan names the affected files, closed data shapes, reducer behavior, test surfaces, exact commands, expected results, and STOP conditions sufficiently for implementation.","status":"pass"},"dependency_order":{"evidence":"Steps remain acyclic: red contract tests precede implementation, documentation and generated parity follow implementation, focused/full gates precede commit binding, and release/verification follows the bound implementation.","status":"pass"},"evidence_reverification":{"evidence":"A1–A8 specify focused oracle, mutation, surface, content-hash, targeted CI, full CI, commit-binding, and clean-worktree checks; the repaired persistence rule also requires canonical read-back and parent-blob recovery.","status":"pass"},"executable_acceptance":{"evidence":"A1–A3 test request and policy binding, but the legacy reviewer_stdout branch treats the response's self-reported request as independent origin evidence. Those tests therefore cannot reject a policy/candidate substitution consistently echoed in stdout with recomputed caller-provided hashes.","status":"blocking_gap"},"failure_modes":{"evidence":"The exact-evidence safety property still fails for the legacy output-started path: reviewer stdout is controller output under validation, so its embedded request cannot independently establish which request or policy the manager dispatched.","status":"blocking_gap"},"goal_coverage":{"evidence":"The repair securely binds pre-dispatch failures to a separately retained manager request, candidate index, and fallback prefix, but explicitly permits legacy expectedRequest recovery solely from reviewer stdout. That leaves the accepted exact-request-origin requirement incomplete.","status":"blocking_gap"},"open_questions":{"evidence":"The repaired plan selects a definite current-only lifecycle: atomically commit the abort/state pair, replace both only after changed canonical input, and retain prior evidence in the replacement parent Git blob.","status":"pass"},"standalone_executability":{"evidence":"Repository, runtime, affected paths, interfaces, execution order, focused checks, full gates, release commands, and protected out-of-scope plans are explicitly identified without requiring an unresolved implementation choice.","status":"pass"}},"findings":[{"criterion":"goal_coverage","defect":"The exact-invalid-controller-evidence requirement would fail for the legacy output-started branch because expectedRequest may be recovered solely from reviewer stdout. A malformed ReviewerOutputV6 can echo the active request ID while substituting another eligible policy and candidate; recomputing the failure policy/hash and stdout hashes then makes the substituted evidence internally consistent without proving what the manager dispatched.","evidence":"Under “Interfaces & data shapes,” pre_dispatch uses a manager-trusted request, but the legacy exception says expectedRequest may be recovered from raw stdout when the bytes hash to the failing attempt and parse as a closed ReviewerOutputV6. Those hashes bind the bytes only to caller-supplied failure fields; the response's request echo is not independent dispatch provenance.","fix":"Require manager-retained pre-dispatch expectedRequest or an independently persisted dispatch-time request/policy digest for the legacy path as well. If neither exists, reject the abort rather than authorizing it from reviewer output.","id":"P1","locator":"Interfaces & data shapes — legacy output-started expectedRequest recovery","path":"plan.review.md","section":"Interfaces & data shapes","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"The exact-origin acceptance step would fail because A1–A3 can pass while accepting a legacy stdout request that substitutes the originating policy/candidate. Changed-stdout and policy-drift mutations only test internal consistency, not equality to dispatch-time manager evidence.","evidence":"The added A1 clause proves exact-stdout legacy provenance, while A2 rejects changed raw stdout, policy-hash drift, and candidate substitutions. No legacy assertion compares the stdout request to a manager-retained request or independent dispatch-time digest, because the plan explicitly permits deriving expectedRequest from that same stdout.","fix":"Add a legacy mutation that preserves state identities, substitutes policy/candidate/request fields in stdout, and recomputes every failure/stdout hash; require rejection against separately retained dispatch evidence. Cover the no-dispatch-evidence case as a mandatory rejection.","id":"P2","locator":"Acceptance criteria — A1–A3 provenance clauses","path":"plan.review.md","section":"Acceptance criteria","status":"blocking_gap"},{"criterion":"failure_modes","defect":"The safety property requiring exact evidence for the originating request would fail when malformed reviewer output self-reports a substituted policy. Because the response being rejected is also used as the authority for expectedRequest, candidate membership and order are checked against the substituted policy rather than the dispatched one.","evidence":"The repaired failure matrix rejects request/policy/hash and raw-byte mismatches, but all legacy values can agree with one forged stdout payload. The manager-as-sole-writer statement does not supply an independent legacy request value to compare with that payload.","fix":"Make independent dispatch-time request provenance mandatory for every abort path and add a STOP/rejection case for legacy output whose request cannot be matched to it; preserve all inputs on rejection.","id":"P3","locator":"STOP conditions and legacy reviewer_stdout provenance","path":"plan.review.md","section":"Failure modes","status":"blocking_gap"}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"f68b1ad8a625225994b240e97a3965f14f0a2dd33445f342f4be87d422838fbe","diff_sha256":null,"execution_base_commit":null,"input_sha256":"501bc956cea00243bca9b6137f49a9c38458eec5d8324776f31e7cb7c1f5f6d3","lifecycle_intent":"none","orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","orchestration_state_sha256":"85d2569bd1f6550a99a226559c1036e8f8f2407554b88942db6a0b14d52d8731","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","repair_targets_sha256":"2cdd08e0df009c1f8f37a3c57cb284771c7781270ed945f7ac94ccddbcdc4e00","request_id":"c4e9845b-74ff-4c48-bbf7-fe1fd8c5f53b","review_mode":"repair","reviewed_commit_or_head":"c43274d108071d784d541e879cf10c2284aa519c","round_index":2,"schema":6},"role":"primary","schema":6,"verdict":"blocking_gap"},"role":"primary","schema":6,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":6}],"schema":6},"settled_orchestration_state_sha256":"bb18781dfd6b4972f5ba809748e55994cfedf3a55ee1d084743c4f09ba00ac68"}
