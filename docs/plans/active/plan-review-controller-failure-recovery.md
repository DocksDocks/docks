---
title: Add typed review-controller failure recovery
goal: Persist exact invalid-controller evidence as a terminal stuck orchestration, release Docks 0.13.1, and leave candidate-plan repair to its owning workflow.
status: planned
created: "2026-07-19T11:24:58-03:00"
updated: "2026-07-19T11:24:58-03:00"
started_at: null
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
  - plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs
  - plugins/docks/skills/productivity/plan-workspace/references/codex-agent-templates.md
  - plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md
  - scripts/tests/plan-review-policy-regressions.mjs
related_plans:
  - plan-workflow-phases-and-loop-escape
  - session-relay-prebuilt-cli-release
review_status: null
planned_at_commit: 41e61f4fdd677556c31de3e89343071d7ac67172
execution_base_commit: null
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

Add this closed current-only record:

```text
ReviewOrchestrationAbortV1 = {
  schema: 1,
  type: "ReviewOrchestrationAbortV1",
  plan_path: string,
  phase: "draft" | "completion",
  lifecycle_intent: "none" | "start" | "schedule_fire" | "auto_execute",
  orchestration_series_id: uuid,
  orchestration_state_sha256: 64hex,
  request_ids: [uuid] | [uuid, uuid],
  reason: "controller_contract_failure",
  observed_attempts: [{
    request_id: uuid,
    attempt: {
      schema: 6,
      candidate: CurrentCandidateV6,
      started: boolean,
      output_started: boolean,
      child_id: string | null,
      timeout_mode: "gnu_timeout" | "orchestrator_tool" | null,
      timeout_seconds: integer | null,
      result: CurrentAttemptResultV6,
      exit_code: integer | null,
      signal: string | null,
      denial_source: "sandbox" | "managed_policy" | "runtime_policy" | null,
      reason: string,
      stdout_sha256: 64hex | null,
      stderr_sha256: 64hex | null
    },
    validation_error: string
  }],
  recorded_at: ISO-8601-with-offset
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
validation only and are never newly emitted.

Add:

```text
abortReviewOrchestration({state, failure}) -> ReviewOrchestrationStateV2
```

The function accepts only an `active` state. Failure identities and request IDs
must exactly equal the state, every observed attempt must be closed and must
actually fail the normal current-attempt validator with the exact recorded error,
and the observations must cover the state's request IDs once in order. It emits
the abort-terminal V2 variant above. It does not construct a series or receipt.

The plan machine line is exactly:

```text
Review-orchestration-abort: <compact JCS ReviewOrchestrationAbortV1>
```

`canonicalPlanView` validates and excludes the record and enforces one bijective
pair: an abort exists iff exactly one state V2 has its digest in `abort_sha256`;
the pair's plan path, phase, lifecycle intent, series identity, and request IDs
match, and `abort.orchestration_state_sha256` equals only the state's
`aborted_from_state_sha256`. The paired state must have the exact abort-terminal
tuple above, including `transitioned_from_state_sha256:null`, and no schema-6
receipt may reference that series. Reject an orphan abort or abort digest, more
than one abort or paired state, active/stopped/passed/ordinary-stuck pairing,
non-null `series_sha256` or transition hash, a mismatched
identity/request/abort-source/digest, any
ReviewSeries substitution, or any receipt-backed variant. Existing state V1 and
historical review schema-1–5 bytes remain valid for validation only.

## Steps

| # | Task | Files | Depends | Status | Done when / failure action |
|---|---|---|---|---|---|
| 1 | Add red contract and mutation tests for controller-failure abort, state-V2 identity and abort-source binding, disjoint transition semantics, every normal begin/repair-advance/settle/consume/apply-reject emitter producing state V2 with both abort fields null, exact invalid-attempt proof, canonical exclusion, duplicate/orphan/passed/receipt rejection, changed-input-only recovery, and an explicit `DOCKS_REVIEW_POLICY_HELPER` import path for rerunning the same oracle against an installed helper. | `scripts/tests/plan-review-policy-regressions.mjs` | — | planned | The focused oracle fails only because `abortReviewOrchestration`/abort record support is absent; preserve the failure. A prematurely passing or setup-failing test STOPs. |
| 2 | Implement the closed abort validator, state-V2 terminal reducer, and bijective machine-record validation without loosening the exact 600-second normal-attempt contract, emitting state V1, or overloading `transitioned_from_state_sha256`. | `plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs` | 1 | planned | Focused oracle and abort mutation cases pass; valid 600-second evidence, stale state, missing/duplicate observation, forged error, orphan/multiple/mismatched pairs, active/stopped/passed/ordinary-stuck or receipt-backed pairs, non-null abort transition hashes, and ReviewSeries substitution are rejected without input mutation. |
| 3 | Document manager ownership and generated-wrapper parity, then regenerate changed skill hashes. | `docs/plans/AGENTS.md`; `plugins/docks/skills/productivity/plan-manager/SKILL.md`; `plugins/docks/agents/plan-manager.md`; `.codex/agents/plan-manager.toml`; `docs/scaffold/templates/{codex-plan-manager.toml,root-AGENTS.md}.template`; `plugins/docks/skills/productivity/plan-workspace/references/{codex-agent-templates.md,plans-agents-md-template.md}` | 2 | planned | Live/generated manager contracts say abort is terminal evidence only: no receipt, retry, repair, lifecycle apply, or candidate edit. Changed hashes are generator-produced. |
| 4 | Bind the implementation commit durably, then run focused oracle, mutation suite, Docks-targeted gate, and one full gate. | All changed implementation/docs/tests; `/tmp/docks-plan-review-controller-failure-recovery-implementation.sha` (collision-specific acceptance artifact); `refs/docks/release/docks-0.13.1-tested` (repository-local durable source of truth) | 3 | planned | A7 requires a clean index/worktree, captures the exact implementation HEAD in the collision-specific file and repository-local ref before full CI, full CI exits 0, and HEAD/file/ref remain identical. A8 and A9 must resolve the bound commit from the ref, read the same file, and require exact parity; A8 proves dry-run cleanliness/no mutation from that SHA, and A9 proves the release commit has exactly one parent equal to it. Any failure is fixed at source before release; do not lower guards or suppress diagnostics. |
| 5 | Patch-release and verify Docks `0.13.1`. | `.claude-plugin/marketplace.json`; `plugins/docks/.claude-plugin/plugin.json`; `plugins/docks/.codex-plugin/plugin.json` | 4 | planned | Run A8–A11 exactly: dry run resolves `0.13.0 → 0.13.1` without mutation; actual release succeeds; the annotated tag peels to the release commit tested by successful tag CI; GitHub Release is published non-draft/non-prerelease; freshly updated `0.13.1` caches match tagged helper bytes and pass the abort oracle plus five-phase catalog check. |
| 6 | Prepare this plan's completion handoff without touching either related active plan. | This plan read-only; release artifacts read-only | 5 | planned | A12 proves the release commit retains reviewed-head `8962626229c1a56aafc282c10c6d5f7de34015a5` blob/SHA-256 baselines `722dc5f331d8350faf2a773cb5ed7e285340ff12`/`a0ee64f34cbe00fb1920c0f0793e61f1bd0a1b5799bf29315fff0e79ff26b717` for Session Relay and `be2097a8716195dc0002baaead5bd4222fbb34c4`/`9d772025a513b5100caef105ce4d72af639ccb6891f26ff64ca1d6b4ff441bd3` for workflow phases; exact commits, focused/full gate output, tag/CI/Release identities, and A1–A12 are ready for manager completion. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `env DOCKS_REVIEW_POLICY_ORCHESTRATION_ORACLE=1 node scripts/tests/plan-review-policy-regressions.mjs --orchestration-oracle` | Exit 0; typed abort emits only state V2 stuck/failed_unparseable/none with `series_sha256:null`, `abort_sha256:sha256(JCS(abort))`, `aborted_from_state_sha256` equal to the source active-state hash, and `transitioned_from_state_sha256:null`; rejects valid/forged evidence and every orphan, multiple, mismatched, active/stopped/passed/ordinary-stuck, ReviewSeries, or receipt-backed pair; preserves inputs; and allows only materially changed input to start attempt 1. |
| A2 | `node scripts/tests/plan-review-policy-regressions.mjs --self-test` | Exit 0; mutation coverage kills removal or weakening of abort export, identity/error binding, disjoint series/abort digests, distinct abort-source binding, V1 transition semantics, schema-2/null-abort-field emission by begin, repair advance, settle, consume, and apply-reject, bijective pairing, malformed-record rejection, and canonical exclusion. |
| A3 | `node scripts/tests/plan-review-policy.mjs --case surfaces` | Exit 0; current schema-6/state-V2 and validation-only state-V1/historical review schema-1–5 surfaces remain closed and byte-compatible; every non-abort V2 has null abort fields and preserves V1 transition semantics. |
| A4 | `node scripts/tests/plan-skill-phases.mjs` | Exit 0; exact five-skill ownership and generated wrapper parity remain intact. |
| A5 | `node scripts/skills/content-hash.mjs --check-only` | Exit 0; every changed skill hash matches generated content. |
| A6 | `node scripts/ci.mjs --plugin docks` | Exit 0; Docks plus repo-wide targeted release gate is green. |
| A7 | `IMPLEMENTATION_SHA_FILE=/tmp/docks-plan-review-controller-failure-recovery-implementation.sha IMPLEMENTATION_REF=refs/docks/release/docks-0.13.1-tested && git diff --quiet && git diff --cached --quiet && git rev-parse HEAD > "$IMPLEMENTATION_SHA_FILE" && git update-ref "$IMPLEMENTATION_REF" "$(cat "$IMPLEMENTATION_SHA_FILE")" && node scripts/ci.mjs && test "$(git rev-parse HEAD)" = "$(cat "$IMPLEMENTATION_SHA_FILE")" && test "$(git rev-parse "$IMPLEMENTATION_REF")" = "$(cat "$IMPLEMENTATION_SHA_FILE")" && git diff --quiet && git diff --cached --quiet` | Exit 0 once after A1–A6; requires clean tracked state, captures the exact pre-CI implementation HEAD in the collision-specific file and durable repository-local ref, all three plugins and repo-wide gates pass, and HEAD/file/ref remain identical with tracked state still clean. |
| A8 | `IMPLEMENTATION_SHA_FILE=/tmp/docks-plan-review-controller-failure-recovery-implementation.sha IMPLEMENTATION_REF=refs/docks/release/docks-0.13.1-tested && FILE_IMPLEMENTATION_COMMIT=$(cat "$IMPLEMENTATION_SHA_FILE") && IMPLEMENTATION_COMMIT=$(git rev-parse "$IMPLEMENTATION_REF") && test "$FILE_IMPLEMENTATION_COMMIT" = "$IMPLEMENTATION_COMMIT" && test "$(git rev-parse HEAD)" = "$IMPLEMENTATION_COMMIT" && git diff --quiet && git diff --cached --quiet && node scripts/release.mjs --dry-run --plugin docks patch && test "$(git rev-parse HEAD)" = "$IMPLEMENTATION_COMMIT" && test "$(git rev-parse "$IMPLEMENTATION_REF")" = "$IMPLEMENTATION_COMMIT" && test "$(cat "$IMPLEMENTATION_SHA_FILE")" = "$IMPLEMENTATION_COMMIT" && git diff --quiet && git diff --cached --quiet` | Exit 0; resolves the durable ref as source of truth, reads the exact A7-captured file and requires parity before the dry run, requires current HEAD to equal the bound SHA, reports `0.13.0 → 0.13.1`, prints destructive actions only, and changes neither HEAD, ref, file, nor tracked bytes. |
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

- `series_sha256` always binds a valid ReviewSeries. Abort evidence uses only
  state-V2 `abort_sha256`, while `aborted_from_state_sha256` alone binds the
  source active-state hash; receipt validation must never accept either as a
  series, and `transitioned_from_state_sha256` retains only its V1 lifecycle
  transition meaning.
- `canonicalPlanView` must validate machine records before excluding them;
  exclusion without validation would let forged aborts reset input invisibly.
- A controller output can be semantically useful yet inadmissible evidence. The
  abort records observed bytes and the validator error; it never adopts findings.
- Patch release `0.13.1` supersedes helper behavior only. Public migration and
  Session Relay candidate repair remain separate reviewed work.

## Global constraints

- Exact normal reviewer deadline remains 600 seconds.
- At most two orchestration attempts and two review rounds remain unchanged.
- Abort is nonretryable for the same substantive input.
- No current review schema below 6 or orchestration state schema below 2 is
  emitted; state V1 and historical review schemas remain validation-only.
- Every non-abort state V2 has both abort fields null and preserves V1
  `transitioned_from_state_sha256` semantics; every abort state V2 has a distinct
  abort source hash and a null transition hash.
- Every write is plan-only or within this plan's affected paths and is committed
  atomically by its owning phase.

## STOP conditions

- The test cannot reproduce rejection of the exact observed 650-second attempt.
- The proposed abort can accept any normally valid current attempt.
- Abort changes candidate input, creates a receipt, consumes intent, overloads
  `transitioned_from_state_sha256`, or permits same-input retry/reset.
- Existing current state records or historical fixtures fail validation.
- Any related active plan must be edited to make helper tests pass.
- Targeted or full CI fails, version triples disagree, tag CI fails, or release
  verification cannot bind the exact commit.

## Self-review

One cold-read critique found and fixed two scope defects before creation:

- The first draft mixed Session Relay A6 repair into the helper patch. It now
  explicitly leaves candidate repair and a new review series to the owning plan.
- The first interface idea overloaded normal attempt validation. The final
  contract keeps exact-600 validation unchanged and uses a distinct closed abort
  record that cannot become a review receipt.

All twelve criteria are covered: exact paths/commands make the plan standalone and
actionable; red→green→docs→gates→release ordering is acyclic; acceptance proves
the interface and release; STOP conditions cover unsafe broadening; no unresolved
human decision remains.

## Open questions

N/A — the user selected typed recovery plus Docks `0.13.1`, and the ownership
boundary requires Session Relay candidate repair to remain separate.

## Cold-handoff checklist

- [ ] Every step names exact files and one owner.
- [ ] Node, setup assumptions, focused commands, gates, and release command are explicit.
- [ ] Abort input/output, digest, source-state, canonicalization, and disjoint
  transition invariants are closed without overloading V1 fields.
- [ ] A1–A12 are ordered, executable, and have concrete expected results.
- [ ] Related active plans, candidate repair, public work, and release semantics are protected.
- [ ] Exact-600 preservation and separate-plan rationale are recorded.
- [ ] Invalid-attempt, canonical-record, version, and release gotchas are explicit.
- [ ] No undefined forward reference, placeholder, or unresolved question remains.

## Sources

- `plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs:1233-1261,1664-1898` — current attempt/state/settlement invariants.
- `scripts/tests/plan-review-policy-regressions.mjs:443-803` — current no-progress oracle and mutation surface.
- `docs/plans/AGENTS.md:7-35,295-307` — five-phase ownership, current schema, canonical records, and atomic writes.
- `docs/plans/active/plan-workflow-phases-and-loop-escape.md:426-456` — released workflow plan and blocked Session Relay handoff boundary.

## Review

(filled by main-context plan-manager after completion evidence)

Review-orchestration-state: {"apply_state":"none","current_input_sha256":"c7f6274ec557319c99592f2b9cf3c4ab46f0897168ac466bd43085a66b16ac16","initial_input_sha256":"c7f6274ec557319c99592f2b9cf3c4ab46f0897168ac466bd43085a66b16ac16","lifecycle_intent":"none","orchestration_attempt":1,"phase":"draft","plan_path":"docs/plans/active/plan-review-controller-failure-recovery.md","request_ids":["89c85980-2722-4211-a99e-a6f2d196f3e2"],"retry_authorization":null,"round_index":1,"schema":1,"series_id":"280101bb-957f-422f-a9d0-2e6ea22a7b8c","series_sha256":"f8b9facdff3f0f6e93a4beab04e8f7dcf900fd7df57b91791e9ce3c198589042","state_sha256":"2a8d139f333f938267c76b4f5fb6294305aa52cacefa2983adadf8dcd0ea68f5","status":"passed","stop_reason":null,"transitioned_from_state_sha256":null}
Review-receipt: {"input_sha256":"c7f6274ec557319c99592f2b9cf3c4ab46f0897168ac466bd43085a66b16ac16","outcome":"passed","phase":"draft","policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"322986392d1ee2afbb13a1b002114ce1894753b0893fd4cdc91692d099eebd4b","diff_sha256":null,"execution_base_commit":null,"input_sha256":"c7f6274ec557319c99592f2b9cf3c4ab46f0897168ac466bd43085a66b16ac16","lifecycle_intent":"none","orchestration_series_id":"280101bb-957f-422f-a9d0-2e6ea22a7b8c","orchestration_state_sha256":"843d2c31035a73d96796ded2d423dbf31010f67deac32751b7fcddfced931508","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"89c85980-2722-4211-a99e-a6f2d196f3e2","review_mode":"full","reviewed_commit_or_head":"8e728fcd88c1af2d27a1ee063073968b4e3531e0","round_index":1,"schema":6},"reviewed_at":"2026-07-19T15:56:10.273Z","reviewed_commit":"8e728fcd88c1af2d27a1ee063073968b4e3531e0","reviewer":{"accepted_finding_ids":[],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"019f7b0e-a79c-7941-9765-ec629e714030","denial_source":null,"exit_code":0,"output_started":true,"reason":"Reviewer completed with valid typed output.","result":"passed","schema":6,"signal":null,"started":true,"stderr_sha256":"1fd6cb1a892c09dffa1ded0c791d394f6f6752583be1b8839d2fee0dcf643b58","stdout_sha256":"f8c690ea99da21544cc09ac550cabbdfe9fdbfc4783a28a934caedcb0bda0377","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"322986392d1ee2afbb13a1b002114ce1894753b0893fd4cdc91692d099eebd4b","diff_sha256":null,"execution_base_commit":null,"input_sha256":"c7f6274ec557319c99592f2b9cf3c4ab46f0897168ac466bd43085a66b16ac16","lifecycle_intent":"none","orchestration_series_id":"280101bb-957f-422f-a9d0-2e6ea22a7b8c","orchestration_state_sha256":"843d2c31035a73d96796ded2d423dbf31010f67deac32751b7fcddfced931508","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"89c85980-2722-4211-a99e-a6f2d196f3e2","review_mode":"full","reviewed_commit_or_head":"8e728fcd88c1af2d27a1ee063073968b4e3531e0","round_index":1,"schema":6},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Pass. Steps 1–6 name concrete tasks, affected files, dependencies, completion conditions, and failure actions. The plan provides exact focused, mutation, CI, release, installed-cache, and protected-file verification commands A1–A12.","status":"pass"},"dependency_order":{"evidence":"Pass. The sequence is acyclic and operationally sound: red tests precede implementation; implementation precedes documentation/hash regeneration; focused and full gates precede the dry run; the tested implementation commit is bound before release; release precedes remote, cache, and protected-plan verification.","status":"pass"},"evidence_reverification":{"evidence":"Pass. The plan requires fresh focused and mutation tests, targeted and full CI, commit/file/ref parity across A7–A9, successful tag CI and published-release checks in A10, tagged-helper versus installed-cache byte comparison in A11, and exact blob plus SHA-256 checks for protected related plans in A12. The sealed source confirms the current validator enforces timeout_seconds === 600 and currently emits schema-1 orchestration states, matching the stated change basis.","status":"pass"},"executable_acceptance":{"evidence":"Pass. A1–A12 each provide an executable command and observable expected result covering abort behavior, mutations, compatibility, generated artifacts, targeted/full CI, commit binding, dry-run and actual release, tag CI, GitHub Release state, installed cache bytes, installed-helper behavior, catalogs, and protected-plan bytes.","status":"pass"},"failure_modes":{"evidence":"Pass. The interface and tests explicitly reject normally valid attempts, forged validation errors, stale or mismatched identities, missing/duplicate/out-of-order observations, orphan or multiple abort records, invalid state variants, ReviewSeries substitution, receipt-backed aborts, non-null incompatible hashes, input mutation, same-input retry, related-plan edits, compatibility regressions, failed CI, version drift, and unverifiable release identity. STOP conditions forbid weakening these safeguards.","status":"pass"},"goal_coverage":{"evidence":"Pass. The plan covers the full stated goal: a closed ReviewOrchestrationAbortV1 record, ReviewOrchestrationStateV2, an active-only abort reducer, canonical bijective validation and exclusion, preservation of the exact 600-second contract and historical validation, manager/generated-wrapper updates, Docks 0.13.1 release, installed-artifact verification, and protection of the two related plans.","status":"pass"},"open_questions":{"evidence":"Pass. The plan records the selected typed-recovery and 0.13.1 release direction, explicitly assigns Session Relay candidate repair to its separate owning workflow, bounds all adjacent work as out of scope, and leaves no unresolved implementation choice requiring user input.","status":"pass"},"standalone_executability":{"evidence":"Pass. The plan identifies the repository, branch, Node version, dependency assumption, exact affected paths, current source anchors, commands, interface schemas, invariants, protected files, release mechanism, failure boundaries, and completion evidence needed by a fresh executor without conversation context.","status":"pass"}},"findings":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"322986392d1ee2afbb13a1b002114ce1894753b0893fd4cdc91692d099eebd4b","diff_sha256":null,"execution_base_commit":null,"input_sha256":"c7f6274ec557319c99592f2b9cf3c4ab46f0897168ac466bd43085a66b16ac16","lifecycle_intent":"none","orchestration_series_id":"280101bb-957f-422f-a9d0-2e6ea22a7b8c","orchestration_state_sha256":"843d2c31035a73d96796ded2d423dbf31010f67deac32751b7fcddfced931508","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"89c85980-2722-4211-a99e-a6f2d196f3e2","review_mode":"full","reviewed_commit_or_head":"8e728fcd88c1af2d27a1ee063073968b4e3531e0","round_index":1,"schema":6},"role":"primary","schema":6,"verdict":"pass"},"role":"primary","schema":6,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":6,"series":{"current_input_sha256":"c7f6274ec557319c99592f2b9cf3c4ab46f0897168ac466bd43085a66b16ac16","initial_input_sha256":"c7f6274ec557319c99592f2b9cf3c4ab46f0897168ac466bd43085a66b16ac16","orchestration_series_id":"280101bb-957f-422f-a9d0-2e6ea22a7b8c","policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","repairs":[],"rounds":[{"kind":"draft","outcome":"passed","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"322986392d1ee2afbb13a1b002114ce1894753b0893fd4cdc91692d099eebd4b","diff_sha256":null,"execution_base_commit":null,"input_sha256":"c7f6274ec557319c99592f2b9cf3c4ab46f0897168ac466bd43085a66b16ac16","lifecycle_intent":"none","orchestration_series_id":"280101bb-957f-422f-a9d0-2e6ea22a7b8c","orchestration_state_sha256":"843d2c31035a73d96796ded2d423dbf31010f67deac32751b7fcddfced931508","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"89c85980-2722-4211-a99e-a6f2d196f3e2","review_mode":"full","reviewed_commit_or_head":"8e728fcd88c1af2d27a1ee063073968b4e3531e0","round_index":1,"schema":6},"reviewer":{"accepted_finding_ids":[],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"019f7b0e-a79c-7941-9765-ec629e714030","denial_source":null,"exit_code":0,"output_started":true,"reason":"Reviewer completed with valid typed output.","result":"passed","schema":6,"signal":null,"started":true,"stderr_sha256":"1fd6cb1a892c09dffa1ded0c791d394f6f6752583be1b8839d2fee0dcf643b58","stdout_sha256":"f8c690ea99da21544cc09ac550cabbdfe9fdbfc4783a28a934caedcb0bda0377","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"322986392d1ee2afbb13a1b002114ce1894753b0893fd4cdc91692d099eebd4b","diff_sha256":null,"execution_base_commit":null,"input_sha256":"c7f6274ec557319c99592f2b9cf3c4ab46f0897168ac466bd43085a66b16ac16","lifecycle_intent":"none","orchestration_series_id":"280101bb-957f-422f-a9d0-2e6ea22a7b8c","orchestration_state_sha256":"843d2c31035a73d96796ded2d423dbf31010f67deac32751b7fcddfced931508","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"89c85980-2722-4211-a99e-a6f2d196f3e2","review_mode":"full","reviewed_commit_or_head":"8e728fcd88c1af2d27a1ee063073968b4e3531e0","round_index":1,"schema":6},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Pass. Steps 1–6 name concrete tasks, affected files, dependencies, completion conditions, and failure actions. The plan provides exact focused, mutation, CI, release, installed-cache, and protected-file verification commands A1–A12.","status":"pass"},"dependency_order":{"evidence":"Pass. The sequence is acyclic and operationally sound: red tests precede implementation; implementation precedes documentation/hash regeneration; focused and full gates precede the dry run; the tested implementation commit is bound before release; release precedes remote, cache, and protected-plan verification.","status":"pass"},"evidence_reverification":{"evidence":"Pass. The plan requires fresh focused and mutation tests, targeted and full CI, commit/file/ref parity across A7–A9, successful tag CI and published-release checks in A10, tagged-helper versus installed-cache byte comparison in A11, and exact blob plus SHA-256 checks for protected related plans in A12. The sealed source confirms the current validator enforces timeout_seconds === 600 and currently emits schema-1 orchestration states, matching the stated change basis.","status":"pass"},"executable_acceptance":{"evidence":"Pass. A1–A12 each provide an executable command and observable expected result covering abort behavior, mutations, compatibility, generated artifacts, targeted/full CI, commit binding, dry-run and actual release, tag CI, GitHub Release state, installed cache bytes, installed-helper behavior, catalogs, and protected-plan bytes.","status":"pass"},"failure_modes":{"evidence":"Pass. The interface and tests explicitly reject normally valid attempts, forged validation errors, stale or mismatched identities, missing/duplicate/out-of-order observations, orphan or multiple abort records, invalid state variants, ReviewSeries substitution, receipt-backed aborts, non-null incompatible hashes, input mutation, same-input retry, related-plan edits, compatibility regressions, failed CI, version drift, and unverifiable release identity. STOP conditions forbid weakening these safeguards.","status":"pass"},"goal_coverage":{"evidence":"Pass. The plan covers the full stated goal: a closed ReviewOrchestrationAbortV1 record, ReviewOrchestrationStateV2, an active-only abort reducer, canonical bijective validation and exclusion, preservation of the exact 600-second contract and historical validation, manager/generated-wrapper updates, Docks 0.13.1 release, installed-artifact verification, and protection of the two related plans.","status":"pass"},"open_questions":{"evidence":"Pass. The plan records the selected typed-recovery and 0.13.1 release direction, explicitly assigns Session Relay candidate repair to its separate owning workflow, bounds all adjacent work as out of scope, and leaves no unresolved implementation choice requiring user input.","status":"pass"},"standalone_executability":{"evidence":"Pass. The plan identifies the repository, branch, Node version, dependency assumption, exact affected paths, current source anchors, commands, interface schemas, invariants, protected files, release mechanism, failure boundaries, and completion evidence needed by a fresh executor without conversation context.","status":"pass"}},"findings":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"322986392d1ee2afbb13a1b002114ce1894753b0893fd4cdc91692d099eebd4b","diff_sha256":null,"execution_base_commit":null,"input_sha256":"c7f6274ec557319c99592f2b9cf3c4ab46f0897168ac466bd43085a66b16ac16","lifecycle_intent":"none","orchestration_series_id":"280101bb-957f-422f-a9d0-2e6ea22a7b8c","orchestration_state_sha256":"843d2c31035a73d96796ded2d423dbf31010f67deac32751b7fcddfced931508","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":6},"policy_sha256":"bb95e1516f9fc1b6f4d8a75991d4650428428dc35d842db1710f4d64dc082a1b","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"89c85980-2722-4211-a99e-a6f2d196f3e2","review_mode":"full","reviewed_commit_or_head":"8e728fcd88c1af2d27a1ee063073968b4e3531e0","round_index":1,"schema":6},"role":"primary","schema":6,"verdict":"pass"},"role":"primary","schema":6,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":6}],"schema":6},"settled_orchestration_state_sha256":"2a8d139f333f938267c76b4f5fb6294305aa52cacefa2983adadf8dcd0ea68f5"}
