---
title: Add typed review-controller failure recovery
goal: Persist exact invalid-controller evidence as a terminal stuck orchestration, release Docks 0.13.1, and leave candidate-plan repair to its owning workflow.
status: blocked
created: "2026-07-19T11:24:58-03:00"
updated: "2026-07-19T18:22:46.487Z"
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

Review-orchestration-state: {"apply_state":"none","current_input_sha256":"501bc956cea00243bca9b6137f49a9c38458eec5d8324776f31e7cb7c1f5f6d3","initial_input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","lifecycle_intent":"none","orchestration_attempt":1,"phase":"draft","plan_path":"docs/plans/active/plan-review-controller-failure-recovery.md","request_ids":["d072ac64-0f37-4e3b-843a-77306385c048","c4e9845b-74ff-4c48-bbf7-fe1fd8c5f53b"],"retry_authorization":null,"round_index":2,"schema":1,"series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","series_sha256":"220312a451bcb6efe4d3f0518709444975abcef6f27237c19cd1d130587d441f","state_sha256":"bb18781dfd6b4972f5ba809748e55994cfedf3a55ee1d084743c4f09ba00ac68","status":"stuck","stop_reason":"not_ready","transitioned_from_state_sha256":null}
Review-receipt: {"input_sha256":"501bc956cea00243bca9b6137f49a9c38458eec5d8324776f31e7cb7c1f5f6d3","outcome":"not_ready","phase":"draft","policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","pre_execution_eligible":false,"reproduced":[{"id":"P1","reproduction":{"command":null,"evidence_sha256":"adc5c3e7ffe9fb2f703a06bc31a48ed860ba005d7ccc3c90d6d156b614165bc9","exit_code":null,"method":"read"}},{"id":"P2","reproduction":{"command":null,"evidence_sha256":"74189087934d9c0aecd455117eb5796316a53f33c1bf22aaeb65c2401f46a075","exit_code":null,"method":"read"}},{"id":"P3","reproduction":{"command":null,"evidence_sha256":"6cb1d4e922d14b267888c870ba3031bf6c36a44041b2d3dafb32c64f0ee4a5ba","exit_code":null,"method":"read"}}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"f68b1ad8a625225994b240e97a3965f14f0a2dd33445f342f4be87d422838fbe","diff_sha256":null,"execution_base_commit":null,"input_sha256":"501bc956cea00243bca9b6137f49a9c38458eec5d8324776f31e7cb7c1f5f6d3","lifecycle_intent":"none","orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","orchestration_state_sha256":"85d2569bd1f6550a99a226559c1036e8f8f2407554b88942db6a0b14d52d8731","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","repair_targets_sha256":"2cdd08e0df009c1f8f37a3c57cb284771c7781270ed945f7ac94ccddbcdc4e00","request_id":"c4e9845b-74ff-4c48-bbf7-fe1fd8c5f53b","review_mode":"repair","reviewed_commit_or_head":"c43274d108071d784d541e879cf10c2284aa519c","round_index":2,"schema":6},"reviewed_at":"2026-07-19T18:22:46.487Z","reviewed_commit":"c43274d108071d784d541e879cf10c2284aa519c","reviewer":{"accepted_finding_ids":["P1","P2","P3"],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"019f7b94-f8ec-70b0-8c8a-b1a680c63914","denial_source":null,"exit_code":0,"output_started":true,"reason":"Reviewer output validated after exact 600-second orchestrator-tool execution exited 0 without signal or authoritative denial.","result":"passed","schema":6,"signal":null,"started":true,"stderr_sha256":"74fcbfdcac6382538458f4ded40f3fd26d57695544c089926d90a5b8d706a4a6","stdout_sha256":"1effde596eb63c73f31cca61b85e2d61b561512af7b3cd78fac29ae55fb24929","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"6a0ad12a55f7b3b9cbbfa47ddff93a593cef34f38d240d83f97659281ecfd27c","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"f68b1ad8a625225994b240e97a3965f14f0a2dd33445f342f4be87d422838fbe","diff_sha256":null,"execution_base_commit":null,"input_sha256":"501bc956cea00243bca9b6137f49a9c38458eec5d8324776f31e7cb7c1f5f6d3","lifecycle_intent":"none","orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","orchestration_state_sha256":"85d2569bd1f6550a99a226559c1036e8f8f2407554b88942db6a0b14d52d8731","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","repair_targets_sha256":"2cdd08e0df009c1f8f37a3c57cb284771c7781270ed945f7ac94ccddbcdc4e00","request_id":"c4e9845b-74ff-4c48-bbf7-fe1fd8c5f53b","review_mode":"repair","reviewed_commit_or_head":"c43274d108071d784d541e879cf10c2284aa519c","round_index":2,"schema":6},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"The repaired plan names the affected files, closed data shapes, reducer behavior, test surfaces, exact commands, expected results, and STOP conditions sufficiently for implementation.","status":"pass"},"dependency_order":{"evidence":"Steps remain acyclic: red contract tests precede implementation, documentation and generated parity follow implementation, focused/full gates precede commit binding, and release/verification follows the bound implementation.","status":"pass"},"evidence_reverification":{"evidence":"A1–A8 specify focused oracle, mutation, surface, content-hash, targeted CI, full CI, commit-binding, and clean-worktree checks; the repaired persistence rule also requires canonical read-back and parent-blob recovery.","status":"pass"},"executable_acceptance":{"evidence":"A1–A3 test request and policy binding, but the legacy reviewer_stdout branch treats the response's self-reported request as independent origin evidence. Those tests therefore cannot reject a policy/candidate substitution consistently echoed in stdout with recomputed caller-provided hashes.","status":"blocking_gap"},"failure_modes":{"evidence":"The exact-evidence safety property still fails for the legacy output-started path: reviewer stdout is controller output under validation, so its embedded request cannot independently establish which request or policy the manager dispatched.","status":"blocking_gap"},"goal_coverage":{"evidence":"The repair securely binds pre-dispatch failures to a separately retained manager request, candidate index, and fallback prefix, but explicitly permits legacy expectedRequest recovery solely from reviewer stdout. That leaves the accepted exact-request-origin requirement incomplete.","status":"blocking_gap"},"open_questions":{"evidence":"The repaired plan selects a definite current-only lifecycle: atomically commit the abort/state pair, replace both only after changed canonical input, and retain prior evidence in the replacement parent Git blob.","status":"pass"},"standalone_executability":{"evidence":"Repository, runtime, affected paths, interfaces, execution order, focused checks, full gates, release commands, and protected out-of-scope plans are explicitly identified without requiring an unresolved implementation choice.","status":"pass"}},"findings":[{"criterion":"goal_coverage","defect":"The exact-invalid-controller-evidence requirement would fail for the legacy output-started branch because expectedRequest may be recovered solely from reviewer stdout. A malformed ReviewerOutputV6 can echo the active request ID while substituting another eligible policy and candidate; recomputing the failure policy/hash and stdout hashes then makes the substituted evidence internally consistent without proving what the manager dispatched.","evidence":"Under “Interfaces & data shapes,” pre_dispatch uses a manager-trusted request, but the legacy exception says expectedRequest may be recovered from raw stdout when the bytes hash to the failing attempt and parse as a closed ReviewerOutputV6. Those hashes bind the bytes only to caller-supplied failure fields; the response's request echo is not independent dispatch provenance.","fix":"Require manager-retained pre-dispatch expectedRequest or an independently persisted dispatch-time request/policy digest for the legacy path as well. If neither exists, reject the abort rather than authorizing it from reviewer output.","id":"P1","locator":"Interfaces & data shapes — legacy output-started expectedRequest recovery","path":"plan.review.md","section":"Interfaces & data shapes","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"The exact-origin acceptance step would fail because A1–A3 can pass while accepting a legacy stdout request that substitutes the originating policy/candidate. Changed-stdout and policy-drift mutations only test internal consistency, not equality to dispatch-time manager evidence.","evidence":"The added A1 clause proves exact-stdout legacy provenance, while A2 rejects changed raw stdout, policy-hash drift, and candidate substitutions. No legacy assertion compares the stdout request to a manager-retained request or independent dispatch-time digest, because the plan explicitly permits deriving expectedRequest from that same stdout.","fix":"Add a legacy mutation that preserves state identities, substitutes policy/candidate/request fields in stdout, and recomputes every failure/stdout hash; require rejection against separately retained dispatch evidence. Cover the no-dispatch-evidence case as a mandatory rejection.","id":"P2","locator":"Acceptance criteria — A1–A3 provenance clauses","path":"plan.review.md","section":"Acceptance criteria","status":"blocking_gap"},{"criterion":"failure_modes","defect":"The safety property requiring exact evidence for the originating request would fail when malformed reviewer output self-reports a substituted policy. Because the response being rejected is also used as the authority for expectedRequest, candidate membership and order are checked against the substituted policy rather than the dispatched one.","evidence":"The repaired failure matrix rejects request/policy/hash and raw-byte mismatches, but all legacy values can agree with one forged stdout payload. The manager-as-sole-writer statement does not supply an independent legacy request value to compare with that payload.","fix":"Make independent dispatch-time request provenance mandatory for every abort path and add a STOP/rejection case for legacy output whose request cannot be matched to it; preserve all inputs on rejection.","id":"P3","locator":"STOP conditions and legacy reviewer_stdout provenance","path":"plan.review.md","section":"Failure modes","status":"blocking_gap"}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"f68b1ad8a625225994b240e97a3965f14f0a2dd33445f342f4be87d422838fbe","diff_sha256":null,"execution_base_commit":null,"input_sha256":"501bc956cea00243bca9b6137f49a9c38458eec5d8324776f31e7cb7c1f5f6d3","lifecycle_intent":"none","orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","orchestration_state_sha256":"85d2569bd1f6550a99a226559c1036e8f8f2407554b88942db6a0b14d52d8731","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","repair_targets_sha256":"2cdd08e0df009c1f8f37a3c57cb284771c7781270ed945f7ac94ccddbcdc4e00","request_id":"c4e9845b-74ff-4c48-bbf7-fe1fd8c5f53b","review_mode":"repair","reviewed_commit_or_head":"c43274d108071d784d541e879cf10c2284aa519c","round_index":2,"schema":6},"role":"primary","schema":6,"verdict":"blocking_gap"},"role":"primary","schema":6,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":6,"series":{"current_input_sha256":"501bc956cea00243bca9b6137f49a9c38458eec5d8324776f31e7cb7c1f5f6d3","initial_input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","repairs":[{"accepted_finding_ids":["P1","P2","P3","P4","P5"],"current_input_sha256":"501bc956cea00243bca9b6137f49a9c38458eec5d8324776f31e7cb7c1f5f6d3","current_orchestration_state_sha256":"85d2569bd1f6550a99a226559c1036e8f8f2407554b88942db6a0b14d52d8731","from_round_index":1,"orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","previous_input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","previous_orchestration_state_sha256":"de002aa916bb0445fa99eef06ba027b8aefa3ccf593bd99ee58667f74162d143","repair_targets_sha256":"2cdd08e0df009c1f8f37a3c57cb284771c7781270ed945f7ac94ccddbcdc4e00","schema":6,"targets":[{"criterion":"goal_coverage","defect":"The plan cannot prove that an observed invalid attempt belongs to the request being aborted. ReviewOrchestrationAbortV1 carries request_id and a free-standing CurrentCandidateV6, but neither the exact ReviewRequestEnvelopeV6 nor policy_sha256/candidate position; abortReviewOrchestration accepts only {state,failure}. Consequently an arbitrary eligible candidate can be substituted while still producing the recorded validateCurrentAttempt error.","evidence":"In the proposed shape, observed_attempts entries contain only request_id, attempt, and validation_error. The bundled helper separates validateCurrentAttempt (shape/result validation at lines 1233–1261) from validateCurrentAttemptSequence (policy candidate-order binding at lines 1264–1277), while the plan requires only the former.","fix":"Bind each observation to the exact request or its policy digest and candidate index, validate the request identities against the state, and independently enforce candidate membership/order against request.policy before accepting invalid-attempt evidence. Add default-chain and pinned-policy substitution cases.","id":"P1","locator":"ReviewOrchestrationAbortV1 and abortReviewOrchestration({state, failure})","path":"plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs","reproduction":{"command":null,"evidence_sha256":"3eab6a8074b6dc40de003161ce37643d4583255990c5eb86ba4f217dc5efd881","exit_code":null,"method":"read"},"section":"Interfaces & data shapes","source":"primary","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"A1–A3 do not require rejection when an abort observation uses a candidate that was not authorized by the originating request policy. The exact-invalid-controller-evidence requirement could therefore pass while accepting fabricated candidate evidence.","evidence":"Step 1 and A1 enumerate identity/error, valid-attempt, orphan, digest, status, receipt, and changed-input cases, but no request-policy, pinned-policy, candidate-index, or fallback-order substitution. The bundled planned oracle constructs invalidAttempt() with a candidate directly and abortFailure() stores no request policy.","fix":"Add direct and mutation tests that substitute another eligible candidate, change candidate position, switch between pinned/default policies, or drift policy_sha256, and require abort rejection without input mutation.","id":"P2","locator":"A1–A3","path":"scripts/tests/plan-review-policy-regressions.mjs","reproduction":{"command":null,"evidence_sha256":"d2126755c2132acc142f607feae0be5474a62d6e6efbcc96638f4b8ddd179975","exit_code":null,"method":"read"},"section":"Acceptance criteria","source":"primary","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"The exact implementation-commit binding step claims to require a clean index/worktree, but A7 and A8 check only tracked differences. Untracked source or generated files can influence full CI or release preparation without being contained in the bound HEAD.","evidence":"A7 and A8 use git diff --quiet and git diff --cached --quiet. Both ignore untracked files, despite Step 4 and A7 stating that the worktree is clean and the tested implementation is exactly bound.","fix":"Before and after CI/dry-run, assert an empty porcelain status including untracked files, for example test -z \"$(git status --porcelain=v1 --untracked-files=all)\", while preserving the existing HEAD/file/ref checks.","id":"P3","locator":"A7 and A8","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"52f53ad46b5cf16ab6cfa46650707260506e4aa66bfc296abf1fc8b0223e8a33","exit_code":null,"method":"read"},"section":"Acceptance criteria","source":"primary","status":"blocking_gap"},{"criterion":"failure_modes","defect":"The exact-evidence safety property would fail when a malformed attempt for an unrelated but structurally eligible candidate is supplied with the active state's request ID. The proposed validator can recompute the same validation_error and terminalize the state even though the controller never attempted that candidate for that request.","evidence":"The plan binds plan/phase/intent/series/state/request IDs and recomputes validateCurrentAttempt errors, but supplies no originating request or policy to abortReviewOrchestration. Its forgedFailure matrix likewise omits candidate-policy substitution.","fix":"Make request-policy binding a mandatory abort precondition and add a STOP/rejection case for any candidate, policy, order, or provenance mismatch; preserve both state and failure inputs on rejection.","id":"P4","locator":"Failure identities and request IDs must exactly equal the state","path":"plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs","reproduction":{"command":null,"evidence_sha256":"591551521f95f3f381e2258e7f5f51b26d1e1baa2cf7eaafc30a48f643514c36","exit_code":null,"method":"read"},"section":"Interfaces & data shapes","source":"primary","status":"blocking_gap"},{"criterion":"open_questions","defect":"The persistence lifecycle after a changed-input restart is unresolved. The exact execution step that would fail is writing the owning workflow's new active orchestration while the current-only abort/state pair remains subject to one-record bijection and duplicate rejection.","evidence":"The plan simultaneously requires one bijective abort/state pair, rejection of more than one state, durable abort evidence, and changed-input-only restart. A1 exercises beginReviewOrchestration in memory after abort but does not canonicalize or read back the resulting plan record transition.","fix":"Specify whether the manager atomically replaces both current-only abort records and relies on committed Git history, or redesign the grammar to retain historical abort pairs alongside one current state. Add an end-to-end canonicalize, commit/read-back, and restart test for the selected rule.","id":"P5","locator":"Open questions: N/A; changed-input-only recovery","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"09fd601120d13f2ebe408a483a7d023c6e6cb5c384343dbbf283dfaf3dd1152a","exit_code":null,"method":"read"},"section":"Open questions","source":"primary","status":"blocking_gap"}]}],"rounds":[{"kind":"draft","outcome":"not_ready","pre_execution_eligible":false,"reproduced":[{"id":"P1","reproduction":{"command":null,"evidence_sha256":"3eab6a8074b6dc40de003161ce37643d4583255990c5eb86ba4f217dc5efd881","exit_code":null,"method":"read"}},{"id":"P2","reproduction":{"command":null,"evidence_sha256":"d2126755c2132acc142f607feae0be5474a62d6e6efbcc96638f4b8ddd179975","exit_code":null,"method":"read"}},{"id":"P3","reproduction":{"command":null,"evidence_sha256":"52f53ad46b5cf16ab6cfa46650707260506e4aa66bfc296abf1fc8b0223e8a33","exit_code":null,"method":"read"}},{"id":"P4","reproduction":{"command":null,"evidence_sha256":"591551521f95f3f381e2258e7f5f51b26d1e1baa2cf7eaafc30a48f643514c36","exit_code":null,"method":"read"}},{"id":"P5","reproduction":{"command":null,"evidence_sha256":"09fd601120d13f2ebe408a483a7d023c6e6cb5c384343dbbf283dfaf3dd1152a","exit_code":null,"method":"read"}}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"f3d6cedef9e6a60180ac1677b6a2c5c30babc9cb28e9539fa2dda51345555b91","diff_sha256":null,"execution_base_commit":null,"input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","lifecycle_intent":"none","orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","orchestration_state_sha256":"de002aa916bb0445fa99eef06ba027b8aefa3ccf593bd99ee58667f74162d143","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"d072ac64-0f37-4e3b-843a-77306385c048","review_mode":"full","reviewed_commit_or_head":"c989527e81a6dd0de534aeff762239b89dbe19aa","round_index":1,"schema":6},"reviewer":{"accepted_finding_ids":["P1","P2","P3","P4","P5"],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"019f7b63-6f15-7d20-adc7-bd92e6b409a0","denial_source":null,"exit_code":0,"output_started":true,"reason":"Reviewer output validated after exact 600-second orchestrator-tool execution exited 0 without signal or authoritative denial.","result":"passed","schema":6,"signal":null,"started":true,"stderr_sha256":"8de7343e2de140216a0c3b61ae322bd7aa8b144175134614f4967c845a87d907","stdout_sha256":"ab4c20e34c3a529df875bf0d050ecc578654abbc8aff35b233266212905baceb","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"d1320895c7acf3b74476443fe212802624c8d85aecbd03b86c2fcbbd2a3069b1","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"f3d6cedef9e6a60180ac1677b6a2c5c30babc9cb28e9539fa2dda51345555b91","diff_sha256":null,"execution_base_commit":null,"input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","lifecycle_intent":"none","orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","orchestration_state_sha256":"de002aa916bb0445fa99eef06ba027b8aefa3ccf593bd99ee58667f74162d143","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"d072ac64-0f37-4e3b-843a-77306385c048","review_mode":"full","reviewed_commit_or_head":"c989527e81a6dd0de534aeff762239b89dbe19aa","round_index":1,"schema":6},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Steps 1–6 identify concrete files, reducer behavior, documentation updates, release operations, completion conditions, and STOP actions. The implementation work is otherwise sufficiently specific.","status":"pass"},"dependency_order":{"evidence":"The red-contract → implementation → generated documentation/hash regeneration → focused and full gates → release → completion-handoff sequence is explicit, acyclic, and correctly keeps candidate-plan repair after the helper release.","status":"pass"},"evidence_reverification":{"evidence":"Bundled review-policy.mjs confirms the cited baseline: canonicalPlanView currently recognizes only Review-orchestration-state, validateCurrentAttempt enforces the 600-second deadline, state schema 1 is current, and begin/repair/settle/consume are the affected reducers. The plan requires focused oracle, mutation, surface, targeted-CI, full-CI, tag-CI, release, cache-byte, and protected-plan checks.","status":"pass"},"executable_acceptance":{"evidence":"Acceptance misses two release-safety checks: it does not test that abort attempts are bound to the originating request policy, and A7/A8 claim a clean worktree while using git diff checks that ignore untracked files.","status":"blocking_gap"},"failure_modes":{"evidence":"The proposed abort reducer can terminalize an active orchestration from an eligible but request-unauthorized candidate because its input contains no request or policy binding. That violates the exact-evidence safety property and is not covered by the forged-evidence cases.","status":"blocking_gap"},"goal_coverage":{"evidence":"The exact-controller-evidence requirement is not fully covered. ReviewOrchestrationAbortV1 stores request IDs and attempt candidates, but no request envelope, policy digest, candidate index, or candidate-order binding; abortReviewOrchestration receives only state and failure. Bundled code shows validateCurrentAttempt validates candidate shape, while validateCurrentAttemptSequence performs the missing policy-order binding.","status":"blocking_gap"},"open_questions":{"evidence":"The plan calls the abort record current-only, requires its bijective pairing with the sole state record, and permits changed-input restart, but does not decide how the manager persists the new active state: retaining the abort creates an orphan/duplicate conflict, while removing it relies on Git history for durability. That record-lifecycle decision must be explicit for the owning workflow handoff.","status":"blocking_gap"},"standalone_executability":{"evidence":"The plan specifies repository, branch, Node runtime, dependency assumption, exact affected paths, interfaces, focused commands, gates, release command, protected paths, and completion evidence. No additional source outside the sealed bundle is needed to understand the planned work.","status":"pass"}},"findings":[{"criterion":"goal_coverage","defect":"The plan cannot prove that an observed invalid attempt belongs to the request being aborted. ReviewOrchestrationAbortV1 carries request_id and a free-standing CurrentCandidateV6, but neither the exact ReviewRequestEnvelopeV6 nor policy_sha256/candidate position; abortReviewOrchestration accepts only {state,failure}. Consequently an arbitrary eligible candidate can be substituted while still producing the recorded validateCurrentAttempt error.","evidence":"In the proposed shape, observed_attempts entries contain only request_id, attempt, and validation_error. The bundled helper separates validateCurrentAttempt (shape/result validation at lines 1233–1261) from validateCurrentAttemptSequence (policy candidate-order binding at lines 1264–1277), while the plan requires only the former.","fix":"Bind each observation to the exact request or its policy digest and candidate index, validate the request identities against the state, and independently enforce candidate membership/order against request.policy before accepting invalid-attempt evidence. Add default-chain and pinned-policy substitution cases.","id":"P1","locator":"ReviewOrchestrationAbortV1 and abortReviewOrchestration({state, failure})","path":"plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs","section":"Interfaces & data shapes","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"A1–A3 do not require rejection when an abort observation uses a candidate that was not authorized by the originating request policy. The exact-invalid-controller-evidence requirement could therefore pass while accepting fabricated candidate evidence.","evidence":"Step 1 and A1 enumerate identity/error, valid-attempt, orphan, digest, status, receipt, and changed-input cases, but no request-policy, pinned-policy, candidate-index, or fallback-order substitution. The bundled planned oracle constructs invalidAttempt() with a candidate directly and abortFailure() stores no request policy.","fix":"Add direct and mutation tests that substitute another eligible candidate, change candidate position, switch between pinned/default policies, or drift policy_sha256, and require abort rejection without input mutation.","id":"P2","locator":"A1–A3","path":"scripts/tests/plan-review-policy-regressions.mjs","section":"Acceptance criteria","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"The exact implementation-commit binding step claims to require a clean index/worktree, but A7 and A8 check only tracked differences. Untracked source or generated files can influence full CI or release preparation without being contained in the bound HEAD.","evidence":"A7 and A8 use git diff --quiet and git diff --cached --quiet. Both ignore untracked files, despite Step 4 and A7 stating that the worktree is clean and the tested implementation is exactly bound.","fix":"Before and after CI/dry-run, assert an empty porcelain status including untracked files, for example test -z \"$(git status --porcelain=v1 --untracked-files=all)\", while preserving the existing HEAD/file/ref checks.","id":"P3","locator":"A7 and A8","path":"plan.review.md","section":"Acceptance criteria","status":"blocking_gap"},{"criterion":"failure_modes","defect":"The exact-evidence safety property would fail when a malformed attempt for an unrelated but structurally eligible candidate is supplied with the active state's request ID. The proposed validator can recompute the same validation_error and terminalize the state even though the controller never attempted that candidate for that request.","evidence":"The plan binds plan/phase/intent/series/state/request IDs and recomputes validateCurrentAttempt errors, but supplies no originating request or policy to abortReviewOrchestration. Its forgedFailure matrix likewise omits candidate-policy substitution.","fix":"Make request-policy binding a mandatory abort precondition and add a STOP/rejection case for any candidate, policy, order, or provenance mismatch; preserve both state and failure inputs on rejection.","id":"P4","locator":"Failure identities and request IDs must exactly equal the state","path":"plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs","section":"Interfaces & data shapes","status":"blocking_gap"},{"criterion":"open_questions","defect":"The persistence lifecycle after a changed-input restart is unresolved. The exact execution step that would fail is writing the owning workflow's new active orchestration while the current-only abort/state pair remains subject to one-record bijection and duplicate rejection.","evidence":"The plan simultaneously requires one bijective abort/state pair, rejection of more than one state, durable abort evidence, and changed-input-only restart. A1 exercises beginReviewOrchestration in memory after abort but does not canonicalize or read back the resulting plan record transition.","fix":"Specify whether the manager atomically replaces both current-only abort records and relies on committed Git history, or redesign the grammar to retain historical abort pairs alongside one current state. Add an end-to-end canonicalize, commit/read-back, and restart test for the selected rule.","id":"P5","locator":"Open questions: N/A; changed-input-only recovery","path":"plan.review.md","section":"Open questions","status":"blocking_gap"}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"f3d6cedef9e6a60180ac1677b6a2c5c30babc9cb28e9539fa2dda51345555b91","diff_sha256":null,"execution_base_commit":null,"input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","lifecycle_intent":"none","orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","orchestration_state_sha256":"de002aa916bb0445fa99eef06ba027b8aefa3ccf593bd99ee58667f74162d143","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"d072ac64-0f37-4e3b-843a-77306385c048","review_mode":"full","reviewed_commit_or_head":"c989527e81a6dd0de534aeff762239b89dbe19aa","round_index":1,"schema":6},"role":"primary","schema":6,"verdict":"blocking_gap"},"role":"primary","schema":6,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":6},{"kind":"draft","outcome":"not_ready","pre_execution_eligible":false,"reproduced":[{"id":"P1","reproduction":{"command":null,"evidence_sha256":"adc5c3e7ffe9fb2f703a06bc31a48ed860ba005d7ccc3c90d6d156b614165bc9","exit_code":null,"method":"read"}},{"id":"P2","reproduction":{"command":null,"evidence_sha256":"74189087934d9c0aecd455117eb5796316a53f33c1bf22aaeb65c2401f46a075","exit_code":null,"method":"read"}},{"id":"P3","reproduction":{"command":null,"evidence_sha256":"6cb1d4e922d14b267888c870ba3031bf6c36a44041b2d3dafb32c64f0ee4a5ba","exit_code":null,"method":"read"}}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"f68b1ad8a625225994b240e97a3965f14f0a2dd33445f342f4be87d422838fbe","diff_sha256":null,"execution_base_commit":null,"input_sha256":"501bc956cea00243bca9b6137f49a9c38458eec5d8324776f31e7cb7c1f5f6d3","lifecycle_intent":"none","orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","orchestration_state_sha256":"85d2569bd1f6550a99a226559c1036e8f8f2407554b88942db6a0b14d52d8731","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","repair_targets_sha256":"2cdd08e0df009c1f8f37a3c57cb284771c7781270ed945f7ac94ccddbcdc4e00","request_id":"c4e9845b-74ff-4c48-bbf7-fe1fd8c5f53b","review_mode":"repair","reviewed_commit_or_head":"c43274d108071d784d541e879cf10c2284aa519c","round_index":2,"schema":6},"reviewer":{"accepted_finding_ids":["P1","P2","P3"],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"019f7b94-f8ec-70b0-8c8a-b1a680c63914","denial_source":null,"exit_code":0,"output_started":true,"reason":"Reviewer output validated after exact 600-second orchestrator-tool execution exited 0 without signal or authoritative denial.","result":"passed","schema":6,"signal":null,"started":true,"stderr_sha256":"74fcbfdcac6382538458f4ded40f3fd26d57695544c089926d90a5b8d706a4a6","stdout_sha256":"1effde596eb63c73f31cca61b85e2d61b561512af7b3cd78fac29ae55fb24929","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"6a0ad12a55f7b3b9cbbfa47ddff93a593cef34f38d240d83f97659281ecfd27c","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"f68b1ad8a625225994b240e97a3965f14f0a2dd33445f342f4be87d422838fbe","diff_sha256":null,"execution_base_commit":null,"input_sha256":"501bc956cea00243bca9b6137f49a9c38458eec5d8324776f31e7cb7c1f5f6d3","lifecycle_intent":"none","orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","orchestration_state_sha256":"85d2569bd1f6550a99a226559c1036e8f8f2407554b88942db6a0b14d52d8731","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","repair_targets_sha256":"2cdd08e0df009c1f8f37a3c57cb284771c7781270ed945f7ac94ccddbcdc4e00","request_id":"c4e9845b-74ff-4c48-bbf7-fe1fd8c5f53b","review_mode":"repair","reviewed_commit_or_head":"c43274d108071d784d541e879cf10c2284aa519c","round_index":2,"schema":6},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"The repaired plan names the affected files, closed data shapes, reducer behavior, test surfaces, exact commands, expected results, and STOP conditions sufficiently for implementation.","status":"pass"},"dependency_order":{"evidence":"Steps remain acyclic: red contract tests precede implementation, documentation and generated parity follow implementation, focused/full gates precede commit binding, and release/verification follows the bound implementation.","status":"pass"},"evidence_reverification":{"evidence":"A1–A8 specify focused oracle, mutation, surface, content-hash, targeted CI, full CI, commit-binding, and clean-worktree checks; the repaired persistence rule also requires canonical read-back and parent-blob recovery.","status":"pass"},"executable_acceptance":{"evidence":"A1–A3 test request and policy binding, but the legacy reviewer_stdout branch treats the response's self-reported request as independent origin evidence. Those tests therefore cannot reject a policy/candidate substitution consistently echoed in stdout with recomputed caller-provided hashes.","status":"blocking_gap"},"failure_modes":{"evidence":"The exact-evidence safety property still fails for the legacy output-started path: reviewer stdout is controller output under validation, so its embedded request cannot independently establish which request or policy the manager dispatched.","status":"blocking_gap"},"goal_coverage":{"evidence":"The repair securely binds pre-dispatch failures to a separately retained manager request, candidate index, and fallback prefix, but explicitly permits legacy expectedRequest recovery solely from reviewer stdout. That leaves the accepted exact-request-origin requirement incomplete.","status":"blocking_gap"},"open_questions":{"evidence":"The repaired plan selects a definite current-only lifecycle: atomically commit the abort/state pair, replace both only after changed canonical input, and retain prior evidence in the replacement parent Git blob.","status":"pass"},"standalone_executability":{"evidence":"Repository, runtime, affected paths, interfaces, execution order, focused checks, full gates, release commands, and protected out-of-scope plans are explicitly identified without requiring an unresolved implementation choice.","status":"pass"}},"findings":[{"criterion":"goal_coverage","defect":"The exact-invalid-controller-evidence requirement would fail for the legacy output-started branch because expectedRequest may be recovered solely from reviewer stdout. A malformed ReviewerOutputV6 can echo the active request ID while substituting another eligible policy and candidate; recomputing the failure policy/hash and stdout hashes then makes the substituted evidence internally consistent without proving what the manager dispatched.","evidence":"Under “Interfaces & data shapes,” pre_dispatch uses a manager-trusted request, but the legacy exception says expectedRequest may be recovered from raw stdout when the bytes hash to the failing attempt and parse as a closed ReviewerOutputV6. Those hashes bind the bytes only to caller-supplied failure fields; the response's request echo is not independent dispatch provenance.","fix":"Require manager-retained pre-dispatch expectedRequest or an independently persisted dispatch-time request/policy digest for the legacy path as well. If neither exists, reject the abort rather than authorizing it from reviewer output.","id":"P1","locator":"Interfaces & data shapes — legacy output-started expectedRequest recovery","path":"plan.review.md","section":"Interfaces & data shapes","status":"blocking_gap"},{"criterion":"executable_acceptance","defect":"The exact-origin acceptance step would fail because A1–A3 can pass while accepting a legacy stdout request that substitutes the originating policy/candidate. Changed-stdout and policy-drift mutations only test internal consistency, not equality to dispatch-time manager evidence.","evidence":"The added A1 clause proves exact-stdout legacy provenance, while A2 rejects changed raw stdout, policy-hash drift, and candidate substitutions. No legacy assertion compares the stdout request to a manager-retained request or independent dispatch-time digest, because the plan explicitly permits deriving expectedRequest from that same stdout.","fix":"Add a legacy mutation that preserves state identities, substitutes policy/candidate/request fields in stdout, and recomputes every failure/stdout hash; require rejection against separately retained dispatch evidence. Cover the no-dispatch-evidence case as a mandatory rejection.","id":"P2","locator":"Acceptance criteria — A1–A3 provenance clauses","path":"plan.review.md","section":"Acceptance criteria","status":"blocking_gap"},{"criterion":"failure_modes","defect":"The safety property requiring exact evidence for the originating request would fail when malformed reviewer output self-reports a substituted policy. Because the response being rejected is also used as the authority for expectedRequest, candidate membership and order are checked against the substituted policy rather than the dispatched one.","evidence":"The repaired failure matrix rejects request/policy/hash and raw-byte mismatches, but all legacy values can agree with one forged stdout payload. The manager-as-sole-writer statement does not supply an independent legacy request value to compare with that payload.","fix":"Make independent dispatch-time request provenance mandatory for every abort path and add a STOP/rejection case for legacy output whose request cannot be matched to it; preserve all inputs on rejection.","id":"P3","locator":"STOP conditions and legacy reviewer_stdout provenance","path":"plan.review.md","section":"Failure modes","status":"blocking_gap"}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"f68b1ad8a625225994b240e97a3965f14f0a2dd33445f342f4be87d422838fbe","diff_sha256":null,"execution_base_commit":null,"input_sha256":"501bc956cea00243bca9b6137f49a9c38458eec5d8324776f31e7cb7c1f5f6d3","lifecycle_intent":"none","orchestration_series_id":"f31cf23f-0df8-4778-8121-f17a8bc5c443","orchestration_state_sha256":"85d2569bd1f6550a99a226559c1036e8f8f2407554b88942db6a0b14d52d8731","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":"69bcc32d9ae4a5d930917d3837f2e266047d39b8aa6d90bff43b5638766208e2","repair_targets_sha256":"2cdd08e0df009c1f8f37a3c57cb284771c7781270ed945f7ac94ccddbcdc4e00","request_id":"c4e9845b-74ff-4c48-bbf7-fe1fd8c5f53b","review_mode":"repair","reviewed_commit_or_head":"c43274d108071d784d541e879cf10c2284aa519c","round_index":2,"schema":6},"role":"primary","schema":6,"verdict":"blocking_gap"},"role":"primary","schema":6,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":6}],"schema":6},"settled_orchestration_state_sha256":"bb18781dfd6b4972f5ba809748e55994cfedf3a55ee1d084743c4f09ba00ac68"}
