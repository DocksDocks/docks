---
title: Add typed review-controller failure recovery
goal: Persist exact review requests before launch, reject invalid controller configuration before spawning, support user-authorized provenance-unavailable abandonment without fabricated review evidence, normalize StateV1 reducer outputs to StateV2, and release Docks 0.13.1.
status: ongoing
created: "2026-07-19T11:24:58-03:00"
updated: "2026-07-19T21:04:00.000Z"
started_at: "2026-07-19T13:10:44-03:00"
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
review_status: passed
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
| 1 | Add red contract and mutation tests for prepared-request commit/read-back, per-candidate exact-600 dispatch commitment, atomic round-two request/commitment cleanup, pre-dispatch invalid-config abort, exact-parent target-bound authorized abandonment, full source-state reconstruction, generic terminal StateV2 pairing, changed-input CAS, finished-plan immutability, and direct eligible StateV1 inputs across begin/repair/settle/consume/apply-reject. | `scripts/tests/plan-review-policy-regressions.mjs`; `scripts/tests/plan-review-policy.mjs`; `scripts/tests/plan-skill-phases.mjs` | — | planned | The focused oracle fails only for missing new behavior. Tests prove no spawn precedes a committed/read-back request and valid commitment; repair atomically leaves a record-free round-two active family before its distinct prepared-request commit; a proposed 650 config aborts as `not_dispatched`; abandonment accepts only exact parent bytes/current-user authority; attempt-two source reconstruction preserves retry lineage; neither terminal path can erase disqualifying source records. |
| 2 | Implement closed prepared-request, dispatch-commitment, controller-abort, abandonment-authorization/record validators and full-plan compare-and-swap reducers; generalize StateV2 terminal/source fields; add atomic repair-family cleanup, canonical family validation, and changed-input CAS; normalize only otherwise eligible direct StateV1 reducer outputs. | `plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs` | 1 | planned | A1–A3 pass. Exact-600 normal attempt validation and schemas 1–5 are unchanged. No invalid config spawns; stale round-one records cannot survive repair; no terminal record can produce a ReviewSeries/receipt/retry/apply; exact committed source bytes and attempt-two lineage remain auditable; no rejected input is mutated. |
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
| A1 | `env DOCKS_REVIEW_POLICY_ORCHESTRATION_ORACLE=1 node scripts/tests/plan-review-policy-regressions.mjs --orchestration-oracle` | Exit 0; prepared request and each candidate commitment bind exact state/request/policy/argv and precede launch; round-two advancement atomically removes round-one request/commitment before the distinct repair request; proposed timeout 650 produces only pre-dispatch `controller_contract_failure`; exact parent-bound authorized abandonment produces only `authorized_abandonment`; both terminal families preserve a reconstructible exact source state and are nonretryable, receiptless, canonically paired, input-preserving, and changed-input-only. |
| A2 | `node scripts/tests/plan-review-policy-regressions.mjs --self-test` | Exit 0; mutations kill missing commit/read-back, request/policy/candidate/argv/config substitution, spawn-before-commit, stale/reused round-one repair records, stdout self-attestation, missing/changed/replayed user bytes, noncanonical/invalid-UTF-8 base64, authorization text/hash drift, source-plan parent drift, erased prepared/dispatch evidence, post-dispatch abort, attempt-two source/retry reconstruction drift, extra abandonment provenance fields, half/orphan/cross terminal records, receipt/series substitution, same-input CAS, finished-plan reopen, and weakened V1 normalization/preconditions. |
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
Review-receipt: {"input_sha256":"be985c12405f29ebbc0e20f7947b01a91b25b3bca17c2d08e98d3f5ee826da25","outcome":"passed","phase":"draft","policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"56d21ebaaa50d7966b06de92bcf872d3fd4fb00f1e87c401ce06b2c7f59610b7","diff_sha256":null,"execution_base_commit":null,"input_sha256":"be985c12405f29ebbc0e20f7947b01a91b25b3bca17c2d08e98d3f5ee826da25","lifecycle_intent":"none","orchestration_series_id":"07b6c66d-fcb4-47a8-97f5-f49664d516a4","orchestration_state_sha256":"480bc7ecff641a7ae079c8df0c68417690d635a4614e160f08a09fe57ca9c17c","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"376da5a0d244e06a1e3c56c252120bc0d0929f8578af60f6bc39a7ba25bf1d65","repair_targets_sha256":"c5514a0ab6eccdac454385f460dc0153f532000ec644df4d22945f787a006bd8","request_id":"dcfd72ae-cc78-439d-ae5c-4eff40652f14","review_mode":"repair","reviewed_commit_or_head":"f1b5aa6fc0b34ed7923c31ef0b58ed24f400acb0","round_index":2,"schema":6},"reviewed_at":"2026-07-19T21:03:00.468Z","reviewed_commit":"f1b5aa6fc0b34ed7923c31ef0b58ed24f400acb0","reviewer":{"accepted_finding_ids":[],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"744590","denial_source":null,"exit_code":0,"output_started":true,"reason":"Repair reviewer output validated after exact 600-second orchestrator-tool launch.","result":"passed","schema":6,"signal":null,"started":true,"stderr_sha256":"c1ca1193dd02ebbb71710adcdd3039f8da57a624ff2732c4d18b713f5ade691a","stdout_sha256":"ad98958a239586eadbcae00a93b14d14531e0812898228ff90613d2915e4d409","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"56d21ebaaa50d7966b06de92bcf872d3fd4fb00f1e87c401ce06b2c7f59610b7","diff_sha256":null,"execution_base_commit":null,"input_sha256":"be985c12405f29ebbc0e20f7947b01a91b25b3bca17c2d08e98d3f5ee826da25","lifecycle_intent":"none","orchestration_series_id":"07b6c66d-fcb4-47a8-97f5-f49664d516a4","orchestration_state_sha256":"480bc7ecff641a7ae079c8df0c68417690d635a4614e160f08a09fe57ca9c17c","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"376da5a0d244e06a1e3c56c252120bc0d0929f8578af60f6bc39a7ba25bf1d65","repair_targets_sha256":"c5514a0ab6eccdac454385f460dc0153f532000ec644df4d22945f787a006bd8","request_id":"dcfd72ae-cc78-439d-ae5c-4eff40652f14","review_mode":"repair","reviewed_commit_or_head":"f1b5aa6fc0b34ed7923c31ef0b58ed24f400acb0","round_index":2,"schema":6},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Pass within repair scope. For P1, the plan now specifies exact reducer signatures, source-family predicates, compare-and-swap inputs, terminal outputs, and parent-blob bindings for both abortReviewControllerConfig and abandonReviewOrchestration. For P2, advanceReviewOrchestrationRepairFamily explicitly removes the round-one prepared request and dispatch commitment atomically, returns a record-free round-two family, and requires a separate prepared-request commit before commitment or spawn.","status":"pass"},"dependency_order":{"evidence":"Pass within repair scope. The repaired sequence is ordered as red contract/mutation tests, implementation of full-plan reducers and atomic repair cleanup, documentation/generated parity, focused and full gates, then release. The runtime transition order is also explicit: atomically commit/read back the record-free round-two state, then separately commit/read back its prepared request, then construct a commitment and launch.","status":"pass"},"evidence_reverification":{"evidence":"Pass within repair scope. Sealed hashes for plan.review.md and previous-plan.review.md match request.input_sha256 and request.previous_input_sha256 respectively. The repaired plan adds focused oracle coverage plus mutations for source-parent drift, erased prepared/dispatch evidence, post-dispatch abort, stale or reused round-one records, and attempt-two retry/source reconstruction drift.","status":"pass"},"executable_acceptance":{"evidence":"Pass within repair scope. A1 directly requires atomic round-two cleanup and reconstructible exact terminal source states; A2 enumerates mutations for every P1/P2 failure case; A3 covers StateV1-to-StateV2 closure. Commands, expected exit status, and observable invariants are explicit.","status":"pass"},"failure_modes":{"evidence":"Pass within repair scope. STOP conditions now forbid terminalization without exact parent/state evidence, erasure of disqualifying prepared/dispatch/launch records, post-commit or post-spawn abort, stale or separately deleted round-one records, and spawning before the record-free repair transition and later prepared request are independently committed and read back.","status":"pass"},"goal_coverage":{"evidence":"Pass within repair scope. P1 is covered by exact committed source-plan parsing, embedded self-hashed terminated_from_state including attempt-two retry authorization, and atomic terminal-family replacement. P2 is covered by the dedicated repair-family compare-and-swap, stale-record rejection, separate round-two request preparation, tests, acceptance criteria, gotchas, STOP conditions, and cold-handoff checklist.","status":"pass"},"open_questions":{"evidence":"Pass within repair scope. The plan declares no open questions, and the accepted repairs resolve the previously unspecified choices: terminal reducers operate on exact committed source families, source reconstruction persists the full active state, and repair advancement performs atomic old-record cleanup before a distinct round-two preparation commit.","status":"pass"},"standalone_executability":{"evidence":"Pass within repair scope. The repaired plan supplies exact interfaces, record shapes, canonical-family invariants, atomic write/read-back boundaries, affected files, dependency ordering, commands, expected results, and stop conditions needed to implement and verify P1 and P2 without relying on unstated session history.","status":"pass"}},"findings":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"56d21ebaaa50d7966b06de92bcf872d3fd4fb00f1e87c401ce06b2c7f59610b7","diff_sha256":null,"execution_base_commit":null,"input_sha256":"be985c12405f29ebbc0e20f7947b01a91b25b3bca17c2d08e98d3f5ee826da25","lifecycle_intent":"none","orchestration_series_id":"07b6c66d-fcb4-47a8-97f5-f49664d516a4","orchestration_state_sha256":"480bc7ecff641a7ae079c8df0c68417690d635a4614e160f08a09fe57ca9c17c","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"376da5a0d244e06a1e3c56c252120bc0d0929f8578af60f6bc39a7ba25bf1d65","repair_targets_sha256":"c5514a0ab6eccdac454385f460dc0153f532000ec644df4d22945f787a006bd8","request_id":"dcfd72ae-cc78-439d-ae5c-4eff40652f14","review_mode":"repair","reviewed_commit_or_head":"f1b5aa6fc0b34ed7923c31ef0b58ed24f400acb0","round_index":2,"schema":6},"role":"primary","schema":6,"verdict":"pass"},"role":"primary","schema":6,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":6,"series":{"current_input_sha256":"be985c12405f29ebbc0e20f7947b01a91b25b3bca17c2d08e98d3f5ee826da25","initial_input_sha256":"376da5a0d244e06a1e3c56c252120bc0d0929f8578af60f6bc39a7ba25bf1d65","orchestration_series_id":"07b6c66d-fcb4-47a8-97f5-f49664d516a4","policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","repairs":[{"accepted_finding_ids":["P1","P2"],"current_input_sha256":"be985c12405f29ebbc0e20f7947b01a91b25b3bca17c2d08e98d3f5ee826da25","current_orchestration_state_sha256":"480bc7ecff641a7ae079c8df0c68417690d635a4614e160f08a09fe57ca9c17c","from_round_index":1,"orchestration_series_id":"07b6c66d-fcb4-47a8-97f5-f49664d516a4","previous_input_sha256":"376da5a0d244e06a1e3c56c252120bc0d0929f8578af60f6bc39a7ba25bf1d65","previous_orchestration_state_sha256":"9348fc3336c8f7b96dc7a27e82ac95b68e8cbf182154f08caa2e727421d61501","repair_targets_sha256":"c5514a0ab6eccdac454385f460dc0153f532000ec644df4d22945f787a006bd8","schema":6,"targets":[{"criterion":"failure_modes","defect":"The new reducers cannot prove the exact source-family predicates they claim to enforce. abandonReviewOrchestration receives only state, authorization, sourceTextBytes, and recordedAt, so it cannot determine whether the committed source family contained a prepared request or dispatch commitment. abortReviewControllerConfig likewise receives no committed source family or existing dispatch record. In addition, both terminal states are specified to carry no retry authorization while canonical read-back promises to reconstruct and self-hash the source active state; an attempt-two StateV1 source cannot be reconstructed because its retry_authorization is part of its hash preimage.","evidence":"Interfaces & data shapes states that abandonment accepts only an active StateV1 with no prepared-request or dispatch record, controller abort is pre-dispatch, and canonical read-back reconstructs the source active state. The reducer signatures omit the committed plan family, while the StateV2 paragraph says both terminal outputs have no retry authorization. Therefore a caller can erase disqualifying source records during terminalization, and read-back lacks the bytes needed to verify an attempt-two source hash.","fix":"Define terminalization as an atomic compare-and-swap over the exact committed source plan blob/family. Require abandonment input to prove a state-only active StateV1 family and abort input to prove active state plus the exact prepared request with no dispatch commitment or launch evidence. Persist the full source state, or enough closed fields including historical retry_authorization, to recompute source_state_sha256; alternatively explicitly restrict a terminal path to source states whose complete preimage is reconstructible. Add mutations for prior prepared/dispatch records, attempted post-dispatch abort, and attempt-two source reconstruction.","id":"P1","locator":"Authorized provenance-unavailable abandonment; StateV2 and canonical families","path":"docs/plans/active/plan-review-controller-failure-recovery.md","reproduction":{"command":null,"evidence_sha256":"2bb0a894ed71bc926c0f7df182654cdbb7e5a18397d6afae3c60f07d4d893e49","exit_code":null,"method":"read"},"section":"Interfaces & data shapes","source":"primary","status":"blocking_gap"},{"criterion":"actionability","defect":"The round-one-to-round-two repair execution step does not specify how the old prepared request and dispatch commitment are removed when advanceReviewOrchestrationRepair replaces the active state. Those records bind the round-one state hash/request ID and become stale immediately, so the stated repair-state read-back cannot satisfy the plan's own canonical active-family rules.","evidence":"The canonical family permits one prepared request and at most one commitment bound to the active state. Reconciliation says to apply the patch, call advanceReviewOrchestrationRepair, and persist/read back the repair state, but only normal settlement explicitly removes prepared/dispatch records. No step or helper defines an atomic repair transition that removes the round-one records before a separate round-two prepared request is committed.","fix":"Specify and implement an atomic repair-family transition that replaces the round-one active state, removes its prepared request and commitment, and reads back a valid round-two active state with neither record. Then commit/read back the new round-two prepared request separately before any commitment or launch. Add oracle and mutation coverage proving stale round-one records cannot survive or be reused and that no spawn occurs during the record-free transition.","id":"P2","locator":"Canonical families; Reconciliation and repair; Steps 1–3","path":"docs/plans/active/plan-review-controller-failure-recovery.md","reproduction":{"command":null,"evidence_sha256":"a712d60f4ebfafe5ff56bf47d1bf28fa4df454f1acf791e580a4c02ea5855867","exit_code":null,"method":"read"},"section":"Interfaces & data shapes / Steps","source":"primary","status":"blocking_gap"}]}],"rounds":[{"kind":"draft","outcome":"not_ready","pre_execution_eligible":false,"reproduced":[{"id":"P1","reproduction":{"command":null,"evidence_sha256":"2bb0a894ed71bc926c0f7df182654cdbb7e5a18397d6afae3c60f07d4d893e49","exit_code":null,"method":"read"}},{"id":"P2","reproduction":{"command":null,"evidence_sha256":"a712d60f4ebfafe5ff56bf47d1bf28fa4df454f1acf791e580a4c02ea5855867","exit_code":null,"method":"read"}}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"13f76ad89f3ce65386c7049426204a94e38c6ee2cbc7285e012d605873de54b7","diff_sha256":null,"execution_base_commit":null,"input_sha256":"376da5a0d244e06a1e3c56c252120bc0d0929f8578af60f6bc39a7ba25bf1d65","lifecycle_intent":"none","orchestration_series_id":"07b6c66d-fcb4-47a8-97f5-f49664d516a4","orchestration_state_sha256":"9348fc3336c8f7b96dc7a27e82ac95b68e8cbf182154f08caa2e727421d61501","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"243596c2-b40c-4a40-bf53-ae6160bc9964","review_mode":"full","reviewed_commit_or_head":"c9962f760831cc8cdac78043502d3e98931b6330","round_index":1,"schema":6},"reviewer":{"accepted_finding_ids":["P1","P2"],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"737938","denial_source":null,"exit_code":0,"output_started":true,"reason":"Reviewer output validated after exact 600-second orchestrator-tool launch.","result":"passed","schema":6,"signal":null,"started":true,"stderr_sha256":"02ff56c08a6d3b8cf1fe618bc17e3657362406080ce589459f6c8be2394937bb","stdout_sha256":"352b1f0865cd607b0f441bafe98011ffd6b8b684227e0da4449ba30a1c769092","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"05bd2f1838ebf706f0cc4591b0af38f8e563a28f0bac1bb6f629bee57a411911","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"13f76ad89f3ce65386c7049426204a94e38c6ee2cbc7285e012d605873de54b7","diff_sha256":null,"execution_base_commit":null,"input_sha256":"376da5a0d244e06a1e3c56c252120bc0d0929f8578af60f6bc39a7ba25bf1d65","lifecycle_intent":"none","orchestration_series_id":"07b6c66d-fcb4-47a8-97f5-f49664d516a4","orchestration_state_sha256":"9348fc3336c8f7b96dc7a27e82ac95b68e8cbf182154f08caa2e727421d61501","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"243596c2-b40c-4a40-bf53-ae6160bc9964","review_mode":"full","reviewed_commit_or_head":"c9962f760831cc8cdac78043502d3e98931b6330","round_index":1,"schema":6},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Most tasks name concrete files, interfaces, and done conditions, but the repair-round transition omits the required atomic disposition of the prior prepared-request and dispatch-commitment records; persisting the round-two state as written would leave a stale canonical family.","status":"blocking_gap"},"dependency_order":{"evidence":"Steps 1–6 form an explicit acyclic red-tests → implementation → documentation → focused/full gates → patch release → handoff sequence, with numbered dependencies and A1–A12 ordered before release verification.","status":"pass"},"evidence_reverification":{"evidence":"The plan requires commit/read-back validation, JCS and SHA-256 binding, parent-blob recovery, clean-worktree checks, an exact HEAD/file/ref triplet, tag CI and GitHub Release checks, installed-cache byte comparison, and immutable protected-plan blob/hash baselines. The sealed plan input hash also matches both manifest.json and the measured plan.review.md SHA-256: 376da5a0d244e06a1e3c56c252120bc0d0929f8578af60f6bc39a7ba25bf1d65.","status":"pass"},"executable_acceptance":{"evidence":"A1–A12 provide concrete shell commands, expected exit status and observable invariants, covering focused orchestration behavior, mutations, schema surfaces, generated content, targeted/full CI, release ancestry, tag CI, publication, installed bytes, and protected baselines.","status":"pass"},"failure_modes":{"evidence":"The terminal-transition API shapes cannot enforce their stated source-family eligibility or support the promised cold reconstruction for every accepted source state. This breaks the fail-closed provenance boundary for abandonment and pre-dispatch abort.","status":"blocking_gap"},"goal_coverage":{"evidence":"The plan explicitly covers durable schema-6 request preparation, exact-600 per-candidate dispatch commitments, invalid-config abort, provenance-unavailable administrative abandonment, StateV1-to-StateV2 normalization, historical schema preservation, finished-plan immutability, and the Docks 0.13.1 release.","status":"pass"},"open_questions":{"evidence":"The plan records the selected administrative-abandonment contract and has no remaining human product decision. The identified blockers are technical contract omissions with deterministic repairs, not unresolved user choices.","status":"pass"},"standalone_executability":{"evidence":"The plan supplies repository location, branch, Node runtime, dependency state, affected paths, exact interfaces and record shapes, ordered steps, acceptance commands, protected paths, STOP conditions, gotchas, and source anchors suitable for a cold handoff.","status":"pass"}},"findings":[{"criterion":"failure_modes","defect":"The new reducers cannot prove the exact source-family predicates they claim to enforce. abandonReviewOrchestration receives only state, authorization, sourceTextBytes, and recordedAt, so it cannot determine whether the committed source family contained a prepared request or dispatch commitment. abortReviewControllerConfig likewise receives no committed source family or existing dispatch record. In addition, both terminal states are specified to carry no retry authorization while canonical read-back promises to reconstruct and self-hash the source active state; an attempt-two StateV1 source cannot be reconstructed because its retry_authorization is part of its hash preimage.","evidence":"Interfaces & data shapes states that abandonment accepts only an active StateV1 with no prepared-request or dispatch record, controller abort is pre-dispatch, and canonical read-back reconstructs the source active state. The reducer signatures omit the committed plan family, while the StateV2 paragraph says both terminal outputs have no retry authorization. Therefore a caller can erase disqualifying source records during terminalization, and read-back lacks the bytes needed to verify an attempt-two source hash.","fix":"Define terminalization as an atomic compare-and-swap over the exact committed source plan blob/family. Require abandonment input to prove a state-only active StateV1 family and abort input to prove active state plus the exact prepared request with no dispatch commitment or launch evidence. Persist the full source state, or enough closed fields including historical retry_authorization, to recompute source_state_sha256; alternatively explicitly restrict a terminal path to source states whose complete preimage is reconstructible. Add mutations for prior prepared/dispatch records, attempted post-dispatch abort, and attempt-two source reconstruction.","id":"P1","locator":"Authorized provenance-unavailable abandonment; StateV2 and canonical families","path":"docs/plans/active/plan-review-controller-failure-recovery.md","section":"Interfaces & data shapes","status":"blocking_gap"},{"criterion":"actionability","defect":"The round-one-to-round-two repair execution step does not specify how the old prepared request and dispatch commitment are removed when advanceReviewOrchestrationRepair replaces the active state. Those records bind the round-one state hash/request ID and become stale immediately, so the stated repair-state read-back cannot satisfy the plan's own canonical active-family rules.","evidence":"The canonical family permits one prepared request and at most one commitment bound to the active state. Reconciliation says to apply the patch, call advanceReviewOrchestrationRepair, and persist/read back the repair state, but only normal settlement explicitly removes prepared/dispatch records. No step or helper defines an atomic repair transition that removes the round-one records before a separate round-two prepared request is committed.","fix":"Specify and implement an atomic repair-family transition that replaces the round-one active state, removes its prepared request and commitment, and reads back a valid round-two active state with neither record. Then commit/read back the new round-two prepared request separately before any commitment or launch. Add oracle and mutation coverage proving stale round-one records cannot survive or be reused and that no spawn occurs during the record-free transition.","id":"P2","locator":"Canonical families; Reconciliation and repair; Steps 1–3","path":"docs/plans/active/plan-review-controller-failure-recovery.md","section":"Interfaces & data shapes / Steps","status":"blocking_gap"}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"13f76ad89f3ce65386c7049426204a94e38c6ee2cbc7285e012d605873de54b7","diff_sha256":null,"execution_base_commit":null,"input_sha256":"376da5a0d244e06a1e3c56c252120bc0d0929f8578af60f6bc39a7ba25bf1d65","lifecycle_intent":"none","orchestration_series_id":"07b6c66d-fcb4-47a8-97f5-f49664d516a4","orchestration_state_sha256":"9348fc3336c8f7b96dc7a27e82ac95b68e8cbf182154f08caa2e727421d61501","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"243596c2-b40c-4a40-bf53-ae6160bc9964","review_mode":"full","reviewed_commit_or_head":"c9962f760831cc8cdac78043502d3e98931b6330","round_index":1,"schema":6},"role":"primary","schema":6,"verdict":"blocking_gap"},"role":"primary","schema":6,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":6},{"kind":"draft","outcome":"passed","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"56d21ebaaa50d7966b06de92bcf872d3fd4fb00f1e87c401ce06b2c7f59610b7","diff_sha256":null,"execution_base_commit":null,"input_sha256":"be985c12405f29ebbc0e20f7947b01a91b25b3bca17c2d08e98d3f5ee826da25","lifecycle_intent":"none","orchestration_series_id":"07b6c66d-fcb4-47a8-97f5-f49664d516a4","orchestration_state_sha256":"480bc7ecff641a7ae079c8df0c68417690d635a4614e160f08a09fe57ca9c17c","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"376da5a0d244e06a1e3c56c252120bc0d0929f8578af60f6bc39a7ba25bf1d65","repair_targets_sha256":"c5514a0ab6eccdac454385f460dc0153f532000ec644df4d22945f787a006bd8","request_id":"dcfd72ae-cc78-439d-ae5c-4eff40652f14","review_mode":"repair","reviewed_commit_or_head":"f1b5aa6fc0b34ed7923c31ef0b58ed24f400acb0","round_index":2,"schema":6},"reviewer":{"accepted_finding_ids":[],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"744590","denial_source":null,"exit_code":0,"output_started":true,"reason":"Repair reviewer output validated after exact 600-second orchestrator-tool launch.","result":"passed","schema":6,"signal":null,"started":true,"stderr_sha256":"c1ca1193dd02ebbb71710adcdd3039f8da57a624ff2732c4d18b713f5ade691a","stdout_sha256":"ad98958a239586eadbcae00a93b14d14531e0812898228ff90613d2915e4d409","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"56d21ebaaa50d7966b06de92bcf872d3fd4fb00f1e87c401ce06b2c7f59610b7","diff_sha256":null,"execution_base_commit":null,"input_sha256":"be985c12405f29ebbc0e20f7947b01a91b25b3bca17c2d08e98d3f5ee826da25","lifecycle_intent":"none","orchestration_series_id":"07b6c66d-fcb4-47a8-97f5-f49664d516a4","orchestration_state_sha256":"480bc7ecff641a7ae079c8df0c68417690d635a4614e160f08a09fe57ca9c17c","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"376da5a0d244e06a1e3c56c252120bc0d0929f8578af60f6bc39a7ba25bf1d65","repair_targets_sha256":"c5514a0ab6eccdac454385f460dc0153f532000ec644df4d22945f787a006bd8","request_id":"dcfd72ae-cc78-439d-ae5c-4eff40652f14","review_mode":"repair","reviewed_commit_or_head":"f1b5aa6fc0b34ed7923c31ef0b58ed24f400acb0","round_index":2,"schema":6},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Pass within repair scope. For P1, the plan now specifies exact reducer signatures, source-family predicates, compare-and-swap inputs, terminal outputs, and parent-blob bindings for both abortReviewControllerConfig and abandonReviewOrchestration. For P2, advanceReviewOrchestrationRepairFamily explicitly removes the round-one prepared request and dispatch commitment atomically, returns a record-free round-two family, and requires a separate prepared-request commit before commitment or spawn.","status":"pass"},"dependency_order":{"evidence":"Pass within repair scope. The repaired sequence is ordered as red contract/mutation tests, implementation of full-plan reducers and atomic repair cleanup, documentation/generated parity, focused and full gates, then release. The runtime transition order is also explicit: atomically commit/read back the record-free round-two state, then separately commit/read back its prepared request, then construct a commitment and launch.","status":"pass"},"evidence_reverification":{"evidence":"Pass within repair scope. Sealed hashes for plan.review.md and previous-plan.review.md match request.input_sha256 and request.previous_input_sha256 respectively. The repaired plan adds focused oracle coverage plus mutations for source-parent drift, erased prepared/dispatch evidence, post-dispatch abort, stale or reused round-one records, and attempt-two retry/source reconstruction drift.","status":"pass"},"executable_acceptance":{"evidence":"Pass within repair scope. A1 directly requires atomic round-two cleanup and reconstructible exact terminal source states; A2 enumerates mutations for every P1/P2 failure case; A3 covers StateV1-to-StateV2 closure. Commands, expected exit status, and observable invariants are explicit.","status":"pass"},"failure_modes":{"evidence":"Pass within repair scope. STOP conditions now forbid terminalization without exact parent/state evidence, erasure of disqualifying prepared/dispatch/launch records, post-commit or post-spawn abort, stale or separately deleted round-one records, and spawning before the record-free repair transition and later prepared request are independently committed and read back.","status":"pass"},"goal_coverage":{"evidence":"Pass within repair scope. P1 is covered by exact committed source-plan parsing, embedded self-hashed terminated_from_state including attempt-two retry authorization, and atomic terminal-family replacement. P2 is covered by the dedicated repair-family compare-and-swap, stale-record rejection, separate round-two request preparation, tests, acceptance criteria, gotchas, STOP conditions, and cold-handoff checklist.","status":"pass"},"open_questions":{"evidence":"Pass within repair scope. The plan declares no open questions, and the accepted repairs resolve the previously unspecified choices: terminal reducers operate on exact committed source families, source reconstruction persists the full active state, and repair advancement performs atomic old-record cleanup before a distinct round-two preparation commit.","status":"pass"},"standalone_executability":{"evidence":"Pass within repair scope. The repaired plan supplies exact interfaces, record shapes, canonical-family invariants, atomic write/read-back boundaries, affected files, dependency ordering, commands, expected results, and stop conditions needed to implement and verify P1 and P2 without relying on unstated session history.","status":"pass"}},"findings":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"56d21ebaaa50d7966b06de92bcf872d3fd4fb00f1e87c401ce06b2c7f59610b7","diff_sha256":null,"execution_base_commit":null,"input_sha256":"be985c12405f29ebbc0e20f7947b01a91b25b3bca17c2d08e98d3f5ee826da25","lifecycle_intent":"none","orchestration_series_id":"07b6c66d-fcb4-47a8-97f5-f49664d516a4","orchestration_state_sha256":"480bc7ecff641a7ae079c8df0c68417690d635a4614e160f08a09fe57ca9c17c","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"376da5a0d244e06a1e3c56c252120bc0d0929f8578af60f6bc39a7ba25bf1d65","repair_targets_sha256":"c5514a0ab6eccdac454385f460dc0153f532000ec644df4d22945f787a006bd8","request_id":"dcfd72ae-cc78-439d-ae5c-4eff40652f14","review_mode":"repair","reviewed_commit_or_head":"f1b5aa6fc0b34ed7923c31ef0b58ed24f400acb0","round_index":2,"schema":6},"role":"primary","schema":6,"verdict":"pass"},"role":"primary","schema":6,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":6}],"schema":6},"settled_orchestration_state_sha256":"f9d70cee965780c2c62b23c9270b1a1a628e5d8c76c2c5a6a1b16c391b6bf042"}

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
exact-600 launch commitment, pre-dispatch config abort, and separate
target-bound user-authorized abandonment for a pre-feature active StateV1 with
unavailable provenance. The current Session Relay archive remains untouched.

## Cold-handoff checklist

- [ ] Every step names exact files, dependency, owner, command, and STOP action.
- [ ] Prepared request is recursively closed, deep-copied, committed, read back,
  and identity-bound before any config or launch.
- [ ] Each candidate commitment binds exact request/policy position, argv, and
  `600`; availability fallback preserves order and Git history.
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

Review-orchestration-state: {"apply_state":"none","current_input_sha256":"be985c12405f29ebbc0e20f7947b01a91b25b3bca17c2d08e98d3f5ee826da25","initial_input_sha256":"376da5a0d244e06a1e3c56c252120bc0d0929f8578af60f6bc39a7ba25bf1d65","lifecycle_intent":"none","orchestration_attempt":1,"phase":"draft","plan_path":"docs/plans/active/plan-review-controller-failure-recovery.md","request_ids":["243596c2-b40c-4a40-bf53-ae6160bc9964","dcfd72ae-cc78-439d-ae5c-4eff40652f14"],"retry_authorization":null,"round_index":2,"schema":1,"series_id":"07b6c66d-fcb4-47a8-97f5-f49664d516a4","series_sha256":"4e272c9d34bb1b1423f5c2d64d005a342cac1a0d70c4f8a043e4fca464d1742e","state_sha256":"f9d70cee965780c2c62b23c9270b1a1a628e5d8c76c2c5a6a1b16c391b6bf042","status":"passed","stop_reason":null,"transitioned_from_state_sha256":null}
