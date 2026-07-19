---
title: Add typed review-controller failure recovery
goal: Persist exact invalid-controller evidence as a terminal stuck orchestration, release Docks 0.13.1, and leave candidate-plan repair to its owning workflow.
status: blocked
created: "2026-07-19T11:24:58-03:00"
updated: "2026-07-19T14:13:39-03:00"
started_at: "2026-07-19T13:10:44-03:00"
blocked_reason: "Implementation paused after the reviewed execution scope omitted two required paths and State-V2 V1-input normalization coverage; the materially changed plan requires a fresh main-context primary review before any implementation resumes."
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
related_plans:
  - plan-workflow-phases-and-loop-escape
  - session-relay-prebuilt-cli-release
review_status: null
planned_at_commit: 41e61f4fdd677556c31de3e89343071d7ac67172
execution_base_commit: b8735e9aa1a3a2dff8df284e0c706860d3acc24f
---

# Add typed review-controller failure recovery

## Goal

Add one fail-closed schema-6 path that records exact reviewer-controller contract
failures, terminalizes the active orchestration without fabricating a review
series or receipt, and ships the correction as Docks `0.13.1`.

## Context & rationale

A Session Relay completion review produced substantive reviewer output, but its
controller used an evidenced `650`-second ceiling while current schema 6 requires
exactly `600`. The exact attempts therefore fail `validateCurrentAttempt`; they
cannot truthfully become `ReviewRunV6`, `ReviewSeriesV6`, or a completion receipt.
The current helper also cannot terminalize an active state from exact malformed
controller evidence, leaving a durable active record with no valid settlement.

This is a helper defect, not a reason to alter the reviewed Session Relay
candidate. That plan remains fail-closed at reviewed head
`41e61f4fdd677556c31de3e89343071d7ac67172`. Its A6 command defect and any new
changed-input completion series belong to the owning workflow only after this
independently reviewed helper patch is released.

The recovery keeps the existing exact-`600` attempt contract. It adds a distinct
closed abort record for evidence that is intentionally invalid as a normal
attempt. No invalid attempt is reclassified as passed, no receipt is emitted,
and no same-input retry is authorized.

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

Add this closed current-only record. `ReviewRequestEnvelopeV6` and
`CurrentPolicyV6` name the existing recursively closed schema-6 request and
policy contracts enforced by `validateRequest`/`currentReviewerSchema(6)` and
`validateCurrentPolicy`; `CurrentAttemptV6` and `CurrentCandidateV6` retain their
existing closed meanings.

```text
ControllerContractFailureV1 = {
  plan_path: string,
  phase: "draft" | "completion",
  lifecycle_intent: "none" | "start" | "schedule_fire" | "auto_execute",
  orchestration_series_id: uuid,
  orchestration_state_sha256: 64hex,
  request_ids: [uuid] | [uuid, uuid],
  failed_request_id: uuid,
  policy: CurrentPolicyV6,
  policy_sha256: 64hex,
  request_provenance: "pre_dispatch" | "reviewer_stdout",
  reviewer_stdout_sha256: 64hex | null,
  reason: "controller_contract_failure",
  attempt_sequence: {
    preceding: [{candidate_index: integer, attempt: CurrentAttemptV6}],
    failing: {
      candidate_index: integer,
      attempt: CurrentAttemptV6,
      validation_error: string
    }
  },
  recorded_at: ISO-8601-with-offset
}

ReviewOrchestrationAbortV1 = all ControllerContractFailureV1 fields, plus {
  schema: 1,
  type: "ReviewOrchestrationAbortV1",
  expected_request: ReviewRequestEnvelopeV6,
  expected_request_sha256: sha256(JCS(expected_request))
}

ReviewOrchestrationStateV2 = all ReviewOrchestrationStateV1 fields, with `schema` replaced by `2`, plus {
  schema: 2,
  abort_sha256: 64hex | null,
  aborted_from_state_sha256: 64hex | null
}
```

State V2 keeps every V1 non-abort invariant and adds one disjoint abort variant.
Every active, passed, stopped, and ordinary stuck state has `abort_sha256:null`
and `aborted_from_state_sha256:null`; `series_sha256` and
`transitioned_from_state_sha256` retain exactly their V1 meanings, including
transition hashes used only by consumed/apply-rejected lifecycle transitions. An
abort terminal has `status:"stuck"`, `stop_reason:"failed_unparseable"`,
`apply_state:"none"`, `series_sha256:null`,
`abort_sha256:sha256(JCS(abort))`,
`aborted_from_state_sha256:abort.orchestration_state_sha256`, and
`transitioned_from_state_sha256:null`. Schema-1 state records remain accepted for
validation only and are never newly emitted. Request/policy provenance is not
added to state V1 or V2, so eligible V1-to-V2 normalization remains exact.

Add:

```text
abortReviewOrchestration({
  state,
  expectedRequest,
  failure,
  reviewer_stdout_bytes = null
}) -> {
  state: ReviewOrchestrationStateV2,
  abort: ReviewOrchestrationAbortV1
}
```

`expectedRequest` is the manager-trusted exact closed `ReviewRequestEnvelopeV6`
resolved independently of `failure`; a request or policy originating only in the
caller-controlled failure cannot authorize abort. `failure` must be the exact
closed `ControllerContractFailureV1`; it contains no request envelope. The
builder deep-copies `expectedRequest` into a newly constructed `abort` and never
retains a caller-mutable reference. `validateRequest(expectedRequest)` must pass;
the returned embedded copy must be recursively closed and JCS-equal; and
canonical read-back reruns `validateRequest(abort.expected_request)`. Its
`failure.plan_path` must equal `state.plan_path`; request phase/intent/series/
state/request identities must exactly equal the active state and failure; its
`input_sha256` and `round_index` must equal
`state.current_input_sha256` and `state.round_index`; and its
previous-input/repair-target fields retain the existing full-versus-repair
invariants. The reducer recomputes
`sha256(JCS(expectedRequest)) === sha256(JCS(abort.expected_request)) ===
abort.expected_request_sha256` and
`sha256(JCS(expectedRequest.policy)) === expectedRequest.policy_sha256 ===
abort.expected_request.policy_sha256 === failure.policy_sha256`, requires
`failure.policy` to JCS-equal both request policies, and validates that policy as
the exact default chain or one current-user-pinned candidate. Future managers
resolve and retain this exact envelope before dispatch. For the existing
output-started legacy failure, `expectedRequest` may be recovered only from
supplied exact raw reviewer stdout bytes: the bytes must hash to both the failing
attempt's `stdout_sha256` and `failure.reviewer_stdout_sha256`, parse as the one
closed `ReviewerOutputV6`, and contain a request JCS-equal to `expectedRequest`.
`pre_dispatch` requires `reviewer_stdout_sha256:null`; no other post-dispatch
provenance is valid.

The function accepts only an `active` state. `failure.request_ids` must exactly
equal the state; `failure.failed_request_id` and `expectedRequest.request_id`
must equal `state.request_ids.at(-1)`. The returned
`abort.expected_request.request_id` must equal the same latest ID.
Thus on round 2 all prior request IDs and round-1 evidence are lineage only: only
the latest request may fail, and no observation for an earlier round is required
or interpreted as a failure.

Candidate provenance is checked independently before the expected malformed
attempt. `failing.candidate_index` must be in range and its candidate must
JCS-equal `expectedRequest.policy.candidates[index]`. A pinned one-candidate
policy permits only index 0 with an empty `preceding` array. Under the default
policy, `preceding` must contain exactly indices `0..index-1`, each candidate
must equal that policy position, and every attempt must pass normal attempt
validation with an availability-only fallback result, `output_started:false`,
and the exact launch/process evidence its result requires. The failing attempt
is checked last: it must be closed and must fail the normal current-attempt
validator with the exact recorded error. Any skipped/reordered/substituted
candidate, policy/request/hash drift, non-fallback predecessor, or provenance
mismatch rejects without mutating `state`, `expectedRequest`, `failure`, or
stdout bytes. Success returns a new deep-copied abort and its digest-bound
abort-terminal StateV2; it never mutates inputs or constructs a series/receipt.

The plan machine line is exactly:

```text
Review-orchestration-abort: <compact JCS ReviewOrchestrationAbortV1>
```

`canonicalPlanView` validates and excludes the record and enforces one bijective
pair: an abort exists iff exactly one state V2 has its digest in `abort_sha256`;
the pair's plan path, phase, lifecycle intent, series identity, request lineage,
latest failed request, policy shape/hash, candidate positions, source-state
identity, and provenance fields are self-consistent. Read-back revalidates the
embedded request as closed, recomputes its request and policy hashes, and binds
its plan path, phase, lifecycle intent, input, round, series, state hash, and
latest request ID to the paired state and abort. The abort's
`orchestration_state_sha256` equals only the state's
`aborted_from_state_sha256`. The paired state must have the exact abort-terminal
tuple above, including `transitioned_from_state_sha256:null`, and no schema-6
receipt may reference that series. Reject an orphan abort or abort digest; more
than one abort or state; active/stopped/passed/ordinary-stuck pairing; non-null
`series_sha256` or transition hash; a mismatched identity/request/policy/
candidate/source/digest; any ReviewSeries substitution; or any receipt-backed
variant. The manager-as-sole-writer boundary is the authority for the persisted
`expected_request`; the reducer may deep-copy it only from the independently
supplied trusted envelope under the two provenance rules above, and canonical
read-back never trusts its digest without revalidating the embedded envelope.
Existing state V1 and historical review schema-1–5 bytes remain valid for
validation only.

The abort and terminal state are current-only. The manager commits the returned
abort and paired terminal StateV2 atomically. Only after canonical input bytes
materially change may the owning workflow atomically replace exactly both
records with one fresh active StateV2 carrying a new series ID, attempt-1 request
ID, and hashes. The parent Git commit and plan blob remain the durable old abort
evidence; current content retains no historical pair. The manager resolves a new
exact request before dispatch. Canonicalize-and-read-back must succeed after the
abort commit and after replacement, and `git show` of the replacement parent must
recover the exact old pair; same-input replacement, partial removal, reuse of an
old series/request, or dispatch without fresh request identity is rejected.

## Steps

| # | Task | Files | Depends | Status | Done when / failure action |
|---|---|---|---|---|---|
| 1 | Add red contract and mutation tests for controller-failure abort, state-V2 identity and abort-source binding, disjoint transition semantics, and direct StateV1-input cases for begin, repair advance, settle, consume, and apply-reject: every input that satisfies that reducer's existing transition preconditions normalizes to state V2 with both abort fields null, while each reducer's exact existing rejection or stale-terminalization behavior remains unchanged; also cover exact invalid-attempt proof, canonical exclusion, duplicate/orphan/passed/receipt rejection, changed-input-only recovery, and an explicit `DOCKS_REVIEW_POLICY_HELPER` import path for rerunning the same oracle against an installed helper. | `scripts/tests/plan-review-policy-regressions.mjs`; `scripts/tests/plan-review-policy.mjs` | — | planned | The focused oracle fails only because `abortReviewOrchestration`, abort-record support, and the required precondition-preserving V1-input-to-V2 normalization are absent; preserve the failure. A prematurely passing or setup-failing test STOPs. |
| 2 | Implement the closed abort validator, state-V2 terminal reducer, bijective machine-record validation, and one shared normalization boundary so begin, repair advance, settle, consume, and apply-reject preserve their existing transition preconditions and, when an otherwise eligible direct StateV1 input is accepted, emit only its equivalent non-abort StateV2 form with both abort fields null; exact existing handling of invalid, transition-ineligible, or stale inputs remains unchanged, including settlement's validated `stale_input` terminalization, the exact 600-second normal-attempt contract remains unchanged, and `transitioned_from_state_sha256` is not overloaded. | `plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs` | 1 | planned | Focused oracle, surface cases, and abort mutations pass; each named transition normalizes only eligible direct V1 input without changing V1 validation or transition semantics, and wrong-status, wrong-round, wrong-intent, mismatched, or otherwise ineligible inputs retain their exact existing rejection or terminalization behavior; specifically, an internally valid stale settlement series still emits terminal `stale_input`, while invalid stale evidence still rejects, all without input mutation. |
| 3 | Document reviewer and manager ownership plus generated-wrapper parity, then regenerate changed skill hashes. | `docs/plans/AGENTS.md`; `plugins/docks/skills/productivity/plan-manager/SKILL.md`; `plugins/docks/skills/productivity/plan-reviewer/SKILL.md`; `plugins/docks/agents/plan-manager.md`; `.codex/agents/plan-manager.toml`; `docs/scaffold/templates/{codex-plan-manager.toml,root-AGENTS.md}.template`; `plugins/docks/skills/productivity/plan-workspace/references/{codex-agent-templates.md,plans-agents-md-template.md}` | 2 | planned | Live reviewer/manager and generated manager contracts describe V1-input normalization to non-abort V2 and say abort is terminal evidence only: no receipt, retry, repair, lifecycle apply, or candidate edit. Changed hashes are generator-produced. |
| 4 | Bind the implementation commit durably, then run focused oracle, mutation suite, Docks-targeted gate, and one full gate. | All changed implementation/docs/tests; `/tmp/docks-plan-review-controller-failure-recovery-implementation.sha` (collision-specific acceptance artifact); `refs/docks/release/docks-0.13.1-tested` (repository-local durable source of truth) | 3 | planned | A7 requires a clean index/worktree, captures the exact implementation HEAD in the collision-specific file and repository-local ref before full CI, full CI exits 0, and HEAD/file/ref remain identical. A8 and A9 must resolve the bound commit from the ref, read the same file, and require exact parity; A8 proves dry-run cleanliness/no mutation from that SHA, and A9 proves the release commit has exactly one parent equal to it. Any failure is fixed at source before release; do not lower guards or suppress diagnostics. |
| 5 | Patch-release and verify Docks `0.13.1`. | `.claude-plugin/marketplace.json`; `plugins/docks/.claude-plugin/plugin.json`; `plugins/docks/.codex-plugin/plugin.json` | 4 | planned | Run A8–A11 exactly: dry run resolves `0.13.0 → 0.13.1` without mutation; actual release succeeds; the annotated tag peels to the release commit tested by successful tag CI; GitHub Release is published non-draft/non-prerelease; freshly updated `0.13.1` caches match tagged helper bytes and pass the abort oracle plus five-phase catalog check. |
| 6 | Prepare this plan's completion handoff without touching either related active plan. | This plan read-only; release artifacts read-only | 5 | planned | A12 proves the release commit retains reviewed-head `8962626229c1a56aafc282c10c6d5f7de34015a5` blob/SHA-256 baselines `722dc5f331d8350faf2a773cb5ed7e285340ff12`/`a0ee64f34cbe00fb1920c0f0793e61f1bd0a1b5799bf29315fff0e79ff26b717` for Session Relay and `be2097a8716195dc0002baaead5bd4222fbb34c4`/`9d772025a513b5100caef105ce4d72af639ccb6891f26ff64ca1d6b4ff441bd3` for workflow phases; exact commits, focused/full gate output, tag/CI/Release identities, and A1–A12 are ready for manager completion. |

Step 1's red oracle additionally constructs the expected request independently of
`failure` and covers exact embedded-request/state/policy/candidate-index binding,
default fallback prefixes, pinned index 0, round-2 latest-request-only failure,
legacy raw-stdout provenance, input preservation, and canonical two-record
changed-input replacement/read-back with parent-blob proof. Step 2 implements
that closed seam before malformed-attempt validation; Step 3 documents manager
ownership of the separately retained pre-dispatch request. These clauses are
conjunctive with existing StateV1-normalization and exact-600 requirements.

## Acceptance criteria

A1–A3 are also conjunctive with these provenance clauses:

- A1 proves both `pre_dispatch` and exact-stdout legacy provenance, the exact
  embedded request closure/JCS and policy hash, state/series/phase/input/round/
  latest-request identities, candidate equality/index, exact default
  availability-only prefix, pinned index 0, input preservation, and atomic
  two-record changed-input replacement with canonical read-back and parent-plan-
  blob evidence.
- A2 mutations must reject another eligible candidate, a changed position,
  skipped/reordered predecessor, pinned/default switch, policy-hash drift,
  embedded-request drift, changed raw stdout, or a prior-round request, without
  mutating any input.
- A3 keeps the abort and expected-request API recursively closed, requires the
  manager-trusted expected request separately from failure, returns a newly constructed
  deep-copied abort/state pair, revalidates the abort on canonical read-back, and preserves every existing
  V1/V2 transition behavior.

| ID | Command | Expected |
|---|---|---|
| A1 | `env DOCKS_REVIEW_POLICY_ORCHESTRATION_ORACLE=1 node scripts/tests/plan-review-policy-regressions.mjs --orchestration-oracle` | Exit 0; typed abort emits only state V2 stuck/failed_unparseable/none with `series_sha256:null`, `abort_sha256:sha256(JCS(abort))`, `aborted_from_state_sha256` equal to the source active-state hash, and `transitioned_from_state_sha256:null`; rejects valid/forged evidence and every orphan, multiple, mismatched, active/stopped/passed/ordinary-stuck, ReviewSeries, or receipt-backed pair; preserves inputs; and allows only materially changed input to start attempt 1. |
| A2 | `node scripts/tests/plan-review-policy-regressions.mjs --self-test` | Exit 0; mutation coverage kills removal or weakening of abort export, identity/error binding, disjoint series/abort digests, distinct abort-source binding, V1 transition semantics, eligible direct StateV1-input normalization by begin, repair advance, settle, consume, and apply-reject into schema-2 states with null abort fields, each reducer's existing preconditions and exact rejection-or-terminalization behavior, bijective pairing, malformed-record rejection, and canonical exclusion. |
| A3 | `node scripts/tests/plan-review-policy.mjs --case surfaces` | Exit 0; current schema-6/state-V2 and validation-only state-V1/historical review schema-1–5 surfaces remain closed and byte-compatible; begin, repair advance, settle, consume, and apply-reject preserve their existing transition preconditions, normalize only otherwise eligible StateV1 inputs to non-abort V2 with null abort fields, and preserve exact handling of wrong-status, wrong-round, wrong-intent, mismatched, stale, or otherwise ineligible inputs, including validated stale settlement producing terminal `stale_input` and invalid stale evidence remaining rejected. |
| A4 | `node scripts/tests/plan-skill-phases.mjs` | Exit 0; exact five-skill ownership and generated wrapper parity remain intact. |
| A5 | `node scripts/skills/content-hash.mjs --check-only` | Exit 0; every changed skill hash matches generated content. |
| A6 | `node scripts/ci.mjs --plugin docks` | Exit 0; Docks plus repo-wide targeted release gate is green. |
| A7 | `IMPLEMENTATION_SHA_FILE=/tmp/docks-plan-review-controller-failure-recovery-implementation.sha IMPLEMENTATION_REF=refs/docks/release/docks-0.13.1-tested && test -z "$(git status --porcelain=v1 --untracked-files=all)" && git diff --quiet && git diff --cached --quiet && git rev-parse HEAD > "$IMPLEMENTATION_SHA_FILE" && git update-ref "$IMPLEMENTATION_REF" "$(cat "$IMPLEMENTATION_SHA_FILE")" && node scripts/ci.mjs && test "$(git rev-parse HEAD)" = "$(cat "$IMPLEMENTATION_SHA_FILE")" && test "$(git rev-parse "$IMPLEMENTATION_REF")" = "$(cat "$IMPLEMENTATION_SHA_FILE")" && git diff --quiet && git diff --cached --quiet && test -z "$(git status --porcelain=v1 --untracked-files=all)"` | Exit 0 once after A1–A6; requires empty porcelain including untracked files, captures the exact pre-CI implementation HEAD in the collision-specific file and durable repository-local ref, all three plugins and repo-wide gates pass, and HEAD/file/ref remain identical with the entire worktree still clean. |
| A8 | `IMPLEMENTATION_SHA_FILE=/tmp/docks-plan-review-controller-failure-recovery-implementation.sha IMPLEMENTATION_REF=refs/docks/release/docks-0.13.1-tested && FILE_IMPLEMENTATION_COMMIT=$(cat "$IMPLEMENTATION_SHA_FILE") && IMPLEMENTATION_COMMIT=$(git rev-parse "$IMPLEMENTATION_REF") && test "$FILE_IMPLEMENTATION_COMMIT" = "$IMPLEMENTATION_COMMIT" && test "$(git rev-parse HEAD)" = "$IMPLEMENTATION_COMMIT" && test -z "$(git status --porcelain=v1 --untracked-files=all)" && git diff --quiet && git diff --cached --quiet && node scripts/release.mjs --dry-run --plugin docks patch && test "$(git rev-parse HEAD)" = "$IMPLEMENTATION_COMMIT" && test "$(git rev-parse "$IMPLEMENTATION_REF")" = "$IMPLEMENTATION_COMMIT" && test "$(cat "$IMPLEMENTATION_SHA_FILE")" = "$IMPLEMENTATION_COMMIT" && git diff --quiet && git diff --cached --quiet && test -z "$(git status --porcelain=v1 --untracked-files=all)"` | Exit 0; resolves the durable ref as source of truth, requires parity with the A7 file and empty porcelain including untracked files before the dry run, reports `0.13.0 → 0.13.1`, prints destructive actions only, and changes neither HEAD, ref, file, tracked bytes, nor untracked state. |
| A9 | `IMPLEMENTATION_SHA_FILE=/tmp/docks-plan-review-controller-failure-recovery-implementation.sha IMPLEMENTATION_REF=refs/docks/release/docks-0.13.1-tested && FILE_IMPLEMENTATION_COMMIT=$(cat "$IMPLEMENTATION_SHA_FILE") && IMPLEMENTATION_COMMIT=$(git rev-parse "$IMPLEMENTATION_REF") && test "$FILE_IMPLEMENTATION_COMMIT" = "$IMPLEMENTATION_COMMIT" && test "$(git rev-parse HEAD)" = "$IMPLEMENTATION_COMMIT" && node scripts/release.mjs --plugin docks patch && RELEASE_COMMIT=$(git rev-parse 'docks--v0.13.1^{commit}') && test "$(git show -s --format='%P' "$RELEASE_COMMIT")" = "$IMPLEMENTATION_COMMIT"` | Exit 0; resolves the durable ref as source of truth, reads the exact A7-captured file and requires parity, requires pre-release HEAD to equal the bound SHA, creates/pushes the one version commit and annotated tag, waits for green tag CI, publishes the Release, and proves the release commit has exactly one parent equal to that tested implementation SHA. |
| A10 | `RELEASE_TAG=docks--v0.13.1 RELEASE_COMMIT=$(git rev-parse 'docks--v0.13.1^{commit}') && test "$RELEASE_COMMIT" = "$(git rev-parse HEAD)" && test "$(gh run list --repo DocksDocks/docks --commit "$RELEASE_COMMIT" --event push --json databaseId,status,conclusion,headBranch,headSha --limit 20 --jq "map(select(.headBranch == \"$RELEASE_TAG\" and .headSha == \"$RELEASE_COMMIT\" and .status == \"completed\" and .conclusion == \"success\")) \| length")" = 1 && test "$(gh release view "$RELEASE_TAG" --repo DocksDocks/docks --json tagName --jq .tagName)" = "$RELEASE_TAG" && test "$(gh release view "$RELEASE_TAG" --repo DocksDocks/docks --json isDraft --jq .isDraft)" = false && test "$(gh release view "$RELEASE_TAG" --repo DocksDocks/docks --json isPrerelease --jq .isPrerelease)" = false` | Exit 0; tag peels to HEAD, exactly one successful completed tag-push CI run tested that commit, and GitHub Release `docks--v0.13.1` is published non-draft/non-prerelease. |
| A11 | `RELEASE_COMMIT=$(git rev-parse 'docks--v0.13.1^{commit}') && codex plugin marketplace upgrade docks --json && codex plugin add docks@docks --json && claude plugin update docks@docks --scope user && CLAUDE_HELPER="$HOME/.claude/plugins/cache/docks/docks/0.13.1/skills/productivity/plan-reviewer/scripts/review-policy.mjs" CODEX_HELPER="$HOME/.codex/plugins/cache/docks/docks/0.13.1/skills/productivity/plan-reviewer/scripts/review-policy.mjs" && git show "$RELEASE_COMMIT:plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs" \| cmp - "$CLAUDE_HELPER" && cmp "$CLAUDE_HELPER" "$CODEX_HELPER" && env DOCKS_REVIEW_POLICY_ORCHESTRATION_ORACLE=1 DOCKS_REVIEW_POLICY_HELPER="$CLAUDE_HELPER" node scripts/tests/plan-review-policy-regressions.mjs --orchestration-oracle && node scripts/tests/plan-skill-phases.mjs --case installed-catalogs --version 0.13.1` | Exit 0; fresh Claude/Codex `0.13.1` caches equal the tagged helper bytes, the installed helper passes the abort oracle, and both catalogs expose five exact plan phases. |
| A12 | `RELEASE_COMMIT=$(git rev-parse 'docks--v0.13.1^{commit}') && test "$(git rev-parse "$RELEASE_COMMIT:docs/plans/active/session-relay-prebuilt-cli-release.md")" = 722dc5f331d8350faf2a773cb5ed7e285340ff12 && test "$(git show "$RELEASE_COMMIT:docs/plans/active/session-relay-prebuilt-cli-release.md" \| sha256sum)" = "a0ee64f34cbe00fb1920c0f0793e61f1bd0a1b5799bf29315fff0e79ff26b717  -" && test "$(git rev-parse "$RELEASE_COMMIT:docs/plans/active/plan-workflow-phases-and-loop-escape.md")" = be2097a8716195dc0002baaead5bd4222fbb34c4 && test "$(git show "$RELEASE_COMMIT:docs/plans/active/plan-workflow-phases-and-loop-escape.md" \| sha256sum)" = "9d772025a513b5100caef105ce4d72af639ccb6891f26ff64ca1d6b4ff441bd3  -"` | Exit 0; both protected related-plan blobs and exact bytes at the release commit equal reviewed-head `8962626229c1a56aafc282c10c6d5f7de34015a5` baselines. |

## Out of scope / do-NOT-touch

- Do not edit `docs/plans/active/session-relay-prebuilt-cli-release.md` or claim
  its failed completion settled while implementing this plan.
- Do not repair or rerun Session Relay A6 here. Its owner must later use read-only
  `gh api repos/DocksDocks/docks/releases/tags/session-relay--v0.12.0` and a new
  changed-input series; the already-failed inventory is never resumed.
- Do not edit `docs/plans/active/plan-workflow-phases-and-loop-escape.md`; its
  Step 9 remains blocked on this independent helper release.
- Do not loosen `timeout_seconds === 600`, reinterpret 650 as 600, fabricate a
  ReviewSeries/receipt, or permit same-input reset.
- Do not change Session Relay publication, promotion, release assets, or public
  repository bytes.

## Known gotchas

- A request or policy originating only inside caller-controlled `failure` is
  self-consistent, not origin evidence. The reducer receives the exact expected
  request separately from the manager-as-sole-writer boundary, deep-copies it
  into the abort, and revalidates that embedded copy on read-back; the sole
  legacy recovery path derives it from exact reviewer stdout bytes.
- Candidate equality is position-sensitive. Default candidate index `i` is
  admissible only with the exact availability-only prefix `0..i-1`; a pinned
  policy never falls through and permits only index 0.
- On round 2, prior request IDs and round-1 evidence remain lineage. Treating all
  state request IDs as malformed observations would reject a lawful latest-round
  abort and falsely relabel prior evidence.
- `series_sha256` always binds a valid ReviewSeries. Abort evidence uses only
  state-V2 `abort_sha256`, while `aborted_from_state_sha256` alone binds the
  source active-state hash; receipt validation must never accept either as a
  series, and `transitioned_from_state_sha256` retains only its V1 lifecycle
  transition meaning.
- `canonicalPlanView` must validate machine records before excluding them;
  exclusion without validation would let forged aborts reset input invisibly.
- Current-only means changed-input restart replaces the abort and terminal state
  together. Their durable historical proof is the parent Git plan blob, not an
  orphan record retained in current canonical content.
- A controller output can be semantically useful yet inadmissible evidence. The
  abort records observed bytes and the validator error; it never adopts findings.
- Patch release `0.13.1` supersedes helper behavior only. Public migration and
  Session Relay candidate repair remain separate reviewed work.

## Global constraints

- Exact normal reviewer deadline remains 600 seconds.
- At most two orchestration attempts and two review rounds remain unchanged.
- Abort is nonretryable for the same substantive input.
- The manager-trusted expected request remains a separate API input and is
  deep-copied into the newly returned abort; no request, policy, candidate, or
  provenance fields are added to orchestration state merely to make a
  caller-controlled failure self-consistent.
- A round-2 abort binds only the latest request; prior request IDs remain lineage.
- No current review schema below 6 or orchestration state schema below 2 is
  emitted; state V1 and historical review schemas remain validation-only.
- Every non-abort state V2 has both abort fields null and preserves V1
  `transitioned_from_state_sha256` semantics; every abort state V2 has a distinct
  abort source hash and a null transition hash.
- Same-input restart remains forbidden. Changed-input restart uses a fresh
  series/request and atomically replaces exactly the abort and terminal state;
  the parent plan blob preserves the old evidence.
- Every write is plan-only or within this plan's affected paths and is committed
  atomically by its owning phase.

## STOP conditions

- The test cannot reproduce rejection of the exact observed 650-second attempt.
- The proposed abort can accept any normally valid current attempt.
- The expected request is sourced from caller-controlled failure data rather than
  supplied separately by the manager, is not deep-copied into a newly returned
  abort, the API does not return the abort/state pair, or the abort cannot be
  fully revalidated after canonical read-back.
- The one legacy output-started case cannot be tied to exact stdout bytes and a
  JCS-equal parsed reviewer request.
- Any request/state/policy hash, embedded-request field, candidate position/
  equality, fallback prefix, latest-request, raw-byte, or provenance mismatch is
  accepted, or rejection mutates any supplied input.
- A round-2 abort requires earlier request IDs to be restated as failed attempts.
- Abort changes candidate input, creates a receipt, consumes intent, overloads
  `transitioned_from_state_sha256`, or permits same-input retry/reset.
- Changed-input restart leaves an orphan old record, does not replace exactly the
  abort/state pair atomically, reuses a series/request, lacks canonical read-back,
  or cannot prove the parent plan blob retains the exact pair.
- Existing current state records or historical fixtures fail validation.
- Any related active plan must be edited to make helper tests pass.
- Targeted or full CI fails, version triples disagree, tag CI fails, or release
  verification cannot bind the exact commit.

## Self-review

The original cold-read critique fixed two scope defects before creation:

- The first draft mixed Session Relay A6 repair into the helper patch. It now
  explicitly leaves candidate repair and a new review series to the owning plan.
- The first interface idea overloaded normal attempt validation. The contract
  keeps exact-600 validation unchanged and uses a distinct closed abort record
  that cannot become a review receipt.

Independent provenance-design critiques rejected both a request/policy originating
only inside caller-controlled failure and policy fields added to StateV2: the
former does not prove origin and the latter breaks exact V1 normalization. The
repaired seam receives the manager-trusted exact request separately, deep-copies
it plus its recomputed digest and complete validated policy/candidate evidence
into the self-validating abort, revalidates that embedded envelope on canonical
read-back, uses exact reviewer stdout as the only legacy bridge, binds candidate
order before checking the expected malformed attempt, treats only the latest
round-2 request as failing, and atomically replaces the two current-only records
with parent Git history as durable abort evidence.

All twelve criteria are covered: exact paths/commands make the plan standalone and
actionable; red→green→docs→gates→release ordering is acyclic; acceptance proves
the closed abort/request API, persisted-envelope read-back, provenance mutations,
canonical replacement/read-back, parent-blob evidence, untracked cleanliness,
and release; STOP conditions cover unsafe broadening; no unresolved human
decision remains.

## Open questions

N/A — the selected persistence rule is current-only replacement: commit the
provenance-bound abort (including its revalidatable exact expected request) and
terminal StateV2 pair, then only for materially changed canonical input replace
exactly both with a fresh active StateV2 and new series/request; verify canonical
read-back and retain the old pair only in the replacement parent Git plan blob.
The user-selected typed recovery plus Docks `0.13.1` and the ownership boundary
keep Session Relay candidate repair separate.

## Cold-handoff checklist

- [ ] Every step names exact files and one owner.
- [ ] Node, setup assumptions, focused commands, gates, and release command are explicit.
- [ ] Abort input/output and the separately supplied expected request are closed;
  the builder returns a new deep-copied abort/state pair, and read-back revalidates the envelope's closure/JCS,
  state/series/phase/input/round, policy digest, latest request, and state hash.
- [ ] Default fallback requires exact preceding availability-only evidence;
  pinned policy permits index 0 only; round 2 fails only its latest request.
- [ ] State-V2 digest, abort-source, canonicalization, and disjoint transition
  invariants remain closed without overloading V1 fields.
- [ ] Changed-input restart atomically replaces exactly abort/state, canonical
  read-back succeeds, and the parent plan blob retains the old pair.
- [ ] A1–A12 are ordered, executable, and have concrete expected results; A7/A8
  require empty porcelain including untracked files before and after their gates.
- [ ] Related active plans, candidate repair, public work, and release semantics are protected.
- [ ] Exact-600 preservation and separate-plan rationale are recorded.
- [ ] Provenance, invalid-attempt, canonical-record, version, and release gotchas are explicit.
- [ ] No undefined forward reference, placeholder, or unresolved question remains.

## Sources

- `plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs:1233-1261,1664-1898` — current attempt/state/settlement invariants.
- `scripts/tests/plan-review-policy-regressions.mjs:443-803` — current no-progress oracle and mutation surface.
- `docs/plans/AGENTS.md:7-35,295-307` — five-phase ownership, current schema, canonical records, and atomic writes.
- `docs/plans/active/plan-workflow-phases-and-loop-escape.md:426-456` — released workflow plan and blocked Session Relay handoff boundary.

## Review

(filled by main-context plan-manager after completion evidence)

Review-orchestration-state: {"apply_state":"none","current_input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","initial_input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","lifecycle_intent":"none","orchestration_attempt":1,"phase":"draft","plan_path":"docs/plans/active/plan-review-controller-failure-recovery.md","request_ids":["d072ac64-0f37-4e3b-843a-77306385c048"],"retry_authorization":null,"round_index":1,"schema":1,"series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","series_sha256":null,"state_sha256":"de002aa916bb0445fa99eef06ba027b8aefa3ccf593bd99ee58667f74162d143","status":"active","stop_reason":null,"transitioned_from_state_sha256":null}
Review-receipt: {"input_sha256":"c7f6274ec557319c99592f2b9cf3c4ab46f0897168ac466bd43085a66b16ac16","outcome":"passed","phase":"draft","policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"2cfdf58e76e3c9358df945f006d159d3d759664994afc328268250c7ab7619b4","diff_sha256":null,"execution_base_commit":null,"input_sha256":"c7f6274ec557319c99592f2b9cf3c4ab46f0897168ac466bd43085a66b16ac16","lifecycle_intent":"start","orchestration_series_id":"a669c90a-be9c-4a8b-8e80-f440ee6f997a","orchestration_state_sha256":"414fd88a6f4f7c27b49e3d6073b9e6a339295d74f94a39c89f75c8ea5bdcb968","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"d587dce5-8b40-4eb5-9d99-51390d839fb8","review_mode":"full","reviewed_commit_or_head":"5ef97a1dd0e1be6bd7009e450bb3f09177e90e2d","round_index":1,"schema":6},"reviewed_at":"2026-07-19T13:10:44-03:00","reviewed_commit":"5ef97a1dd0e1be6bd7009e450bb3f09177e90e2d","reviewer":{"accepted_finding_ids":[],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"019f7b1c-c4cc-7a12-9030-16fd59967336","denial_source":null,"exit_code":0,"output_started":true,"reason":"Reviewer output validated after exact 600-second orchestrator-tool execution exited 0 without signal or authoritative denial.","result":"passed","schema":6,"signal":null,"started":true,"stderr_sha256":"82c6088075691fda5bde5292911ceec071aa51ef48d57ea055006f3f58c5d3ef","stdout_sha256":"254e0eb80bfd779ca6bba8c68002438f3de7440a6e3979d892f28c1d549e6e72","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"2cfdf58e76e3c9358df945f006d159d3d759664994afc328268250c7ab7619b4","diff_sha256":null,"execution_base_commit":null,"input_sha256":"c7f6274ec557319c99592f2b9cf3c4ab46f0897168ac466bd43085a66b16ac16","lifecycle_intent":"start","orchestration_series_id":"a669c90a-be9c-4a8b-8e80-f440ee6f997a","orchestration_state_sha256":"414fd88a6f4f7c27b49e3d6073b9e6a339295d74f94a39c89f75c8ea5bdcb968","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"d587dce5-8b40-4eb5-9d99-51390d839fb8","review_mode":"full","reviewed_commit_or_head":"5ef97a1dd0e1be6bd7009e450bb3f09177e90e2d","round_index":1,"schema":6},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Steps 1–6 name exact files, dependencies, implementation responsibilities, completion predicates, and failure actions; the interface section closes the abort/state shapes and reducer behavior sufficiently for implementation.","status":"pass"},"dependency_order":{"evidence":"The plan follows an acyclic red-tests → helper implementation → documentation/generated parity → focused and full gates → dry-run/actual release → completion-handoff sequence, with each step’s dependency declared.","status":"pass"},"evidence_reverification":{"evidence":"A1–A12 reverify focused behavior, mutation resistance, compatibility surfaces, generated hashes, targeted/full CI, bound commit identity, dry-run cleanliness, release parent/tag CI/GitHub Release identity, installed cache bytes, installed-helper behavior, and protected related-plan baselines.","status":"pass"},"executable_acceptance":{"evidence":"The acceptance table supplies twelve ordered shell commands with explicit exit-code and observable identity/hash/state expectations, including pre-release binding, post-release verification, and installed-artifact checks.","status":"pass"},"failure_modes":{"evidence":"The STOP conditions and mutation cases explicitly fail closed on invalid 650-second evidence handling, normally valid attempts, candidate/input mutation, fabricated series or receipts, same-input renewal, transition-field overloading, compatibility regressions, CI/version/tag failures, and protected-plan edits.","status":"pass"},"goal_coverage":{"evidence":"The plan covers the typed abort record, state-V2 terminal variant, exact invalid-attempt/error binding, canonical bijection and receipt exclusion, changed-input-only recovery, manager/generated-wrapper documentation, Docks 0.13.1 release, cache verification, and isolation of the two related plans.","status":"pass"},"open_questions":{"evidence":"The Open questions section records no unresolved decision and explains that typed recovery plus Docks 0.13.1 was selected while Session Relay candidate repair remains with its owning workflow; no step depends on an unspecified human choice.","status":"pass"},"standalone_executability":{"evidence":"The plan identifies the repository, branch, Node version, dependency assumption, focused and release commands, exact affected paths, complete data shapes, invariants, protected scope, source anchors, and concrete A1–A12 execution sequence.","status":"pass"}},"findings":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"2cfdf58e76e3c9358df945f006d159d3d759664994afc328268250c7ab7619b4","diff_sha256":null,"execution_base_commit":null,"input_sha256":"c7f6274ec557319c99592f2b9cf3c4ab46f0897168ac466bd43085a66b16ac16","lifecycle_intent":"start","orchestration_series_id":"a669c90a-be9c-4a8b-8e80-f440ee6f997a","orchestration_state_sha256":"414fd88a6f4f7c27b49e3d6073b9e6a339295d74f94a39c89f75c8ea5bdcb968","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"d587dce5-8b40-4eb5-9d99-51390d839fb8","review_mode":"full","reviewed_commit_or_head":"5ef97a1dd0e1be6bd7009e450bb3f09177e90e2d","round_index":1,"schema":6},"role":"primary","schema":6,"verdict":"pass"},"role":"primary","schema":6,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":6,"series":{"current_input_sha256":"c7f6274ec557319c99592f2b9cf3c4ab46f0897168ac466bd43085a66b16ac16","initial_input_sha256":"c7f6274ec557319c99592f2b9cf3c4ab46f0897168ac466bd43085a66b16ac16","orchestration_series_id":"a669c90a-be9c-4a8b-8e80-f440ee6f997a","policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","repairs":[],"rounds":[{"kind":"draft","outcome":"passed","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"2cfdf58e76e3c9358df945f006d159d3d759664994afc328268250c7ab7619b4","diff_sha256":null,"execution_base_commit":null,"input_sha256":"c7f6274ec557319c99592f2b9cf3c4ab46f0897168ac466bd43085a66b16ac16","lifecycle_intent":"start","orchestration_series_id":"a669c90a-be9c-4a8b-8e80-f440ee6f997a","orchestration_state_sha256":"414fd88a6f4f7c27b49e3d6073b9e6a339295d74f94a39c89f75c8ea5bdcb968","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"d587dce5-8b40-4eb5-9d99-51390d839fb8","review_mode":"full","reviewed_commit_or_head":"5ef97a1dd0e1be6bd7009e450bb3f09177e90e2d","round_index":1,"schema":6},"reviewer":{"accepted_finding_ids":[],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"019f7b1c-c4cc-7a12-9030-16fd59967336","denial_source":null,"exit_code":0,"output_started":true,"reason":"Reviewer output validated after exact 600-second orchestrator-tool execution exited 0 without signal or authoritative denial.","result":"passed","schema":6,"signal":null,"started":true,"stderr_sha256":"82c6088075691fda5bde5292911ceec071aa51ef48d57ea055006f3f58c5d3ef","stdout_sha256":"254e0eb80bfd779ca6bba8c68002438f3de7440a6e3979d892f28c1d549e6e72","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"2cfdf58e76e3c9358df945f006d159d3d759664994afc328268250c7ab7619b4","diff_sha256":null,"execution_base_commit":null,"input_sha256":"c7f6274ec557319c99592f2b9cf3c4ab46f0897168ac466bd43085a66b16ac16","lifecycle_intent":"start","orchestration_series_id":"a669c90a-be9c-4a8b-8e80-f440ee6f997a","orchestration_state_sha256":"414fd88a6f4f7c27b49e3d6073b9e6a339295d74f94a39c89f75c8ea5bdcb968","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"d587dce5-8b40-4eb5-9d99-51390d839fb8","review_mode":"full","reviewed_commit_or_head":"5ef97a1dd0e1be6bd7009e450bb3f09177e90e2d","round_index":1,"schema":6},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Steps 1–6 name exact files, dependencies, implementation responsibilities, completion predicates, and failure actions; the interface section closes the abort/state shapes and reducer behavior sufficiently for implementation.","status":"pass"},"dependency_order":{"evidence":"The plan follows an acyclic red-tests → helper implementation → documentation/generated parity → focused and full gates → dry-run/actual release → completion-handoff sequence, with each step’s dependency declared.","status":"pass"},"evidence_reverification":{"evidence":"A1–A12 reverify focused behavior, mutation resistance, compatibility surfaces, generated hashes, targeted/full CI, bound commit identity, dry-run cleanliness, release parent/tag CI/GitHub Release identity, installed cache bytes, installed-helper behavior, and protected related-plan baselines.","status":"pass"},"executable_acceptance":{"evidence":"The acceptance table supplies twelve ordered shell commands with explicit exit-code and observable identity/hash/state expectations, including pre-release binding, post-release verification, and installed-artifact checks.","status":"pass"},"failure_modes":{"evidence":"The STOP conditions and mutation cases explicitly fail closed on invalid 650-second evidence handling, normally valid attempts, candidate/input mutation, fabricated series or receipts, same-input renewal, transition-field overloading, compatibility regressions, CI/version/tag failures, and protected-plan edits.","status":"pass"},"goal_coverage":{"evidence":"The plan covers the typed abort record, state-V2 terminal variant, exact invalid-attempt/error binding, canonical bijection and receipt exclusion, changed-input-only recovery, manager/generated-wrapper documentation, Docks 0.13.1 release, cache verification, and isolation of the two related plans.","status":"pass"},"open_questions":{"evidence":"The Open questions section records no unresolved decision and explains that typed recovery plus Docks 0.13.1 was selected while Session Relay candidate repair remains with its owning workflow; no step depends on an unspecified human choice.","status":"pass"},"standalone_executability":{"evidence":"The plan identifies the repository, branch, Node version, dependency assumption, focused and release commands, exact affected paths, complete data shapes, invariants, protected scope, source anchors, and concrete A1–A12 execution sequence.","status":"pass"}},"findings":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"2cfdf58e76e3c9358df945f006d159d3d759664994afc328268250c7ab7619b4","diff_sha256":null,"execution_base_commit":null,"input_sha256":"c7f6274ec557319c99592f2b9cf3c4ab46f0897168ac466bd43085a66b16ac16","lifecycle_intent":"start","orchestration_series_id":"a669c90a-be9c-4a8b-8e80-f440ee6f997a","orchestration_state_sha256":"414fd88a6f4f7c27b49e3d6073b9e6a339295d74f94a39c89f75c8ea5bdcb968","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"d587dce5-8b40-4eb5-9d99-51390d839fb8","review_mode":"full","reviewed_commit_or_head":"5ef97a1dd0e1be6bd7009e450bb3f09177e90e2d","round_index":1,"schema":6},"role":"primary","schema":6,"verdict":"pass"},"role":"primary","schema":6,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":6}],"schema":6},"settled_orchestration_state_sha256":"8f4a4bb9f57b6f236d5267ba5bfee96510457ffc86cb7790f2409d2004dfa5d6"}
