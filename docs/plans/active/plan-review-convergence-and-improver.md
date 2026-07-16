---
title: Bound plan review and add a plan improver
goal: Make Docks plan review converge within five total rounds using evidence-backed blocking findings and a separate accepted-finding repair skill.
status: ongoing
created: "2026-07-16T14:47:44-03:00"
updated: "2026-07-16T15:13:44-03:00"
started_at: "2026-07-16T15:13:44-03:00"
assignee: codex
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: high
review_waivers: []
tags: [plans, review, convergence, skill]
affected_paths:
  - plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs
  - scripts/tests/plan-review-policy.mjs
  - scripts/tests/plan-review-policy-regressions.mjs
  - plugins/docks/skills/productivity/plan-improver/SKILL.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-review/SKILL.md
  - plugins/docks/skills/productivity/plan-init/SKILL.md
  - plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md
  - plugins/docks/skills/productivity/plan-init/references/codex-agent-templates.md
  - docs/plans/AGENTS.md
  - plugins/docks/agents/plan-manager.md
  - plugins/docks/agents/plan-review.md
  - .codex/agents/plan-manager.toml
  - .codex/agents/plan-review.toml
  - docs/scaffold/templates/codex-plan-manager.toml.template
  - docs/scaffold/templates/codex-plan-review.toml.template
  - docs/scaffold/templates/root-AGENTS.md.template
related_plans:
  - session-relay-prebuilt-cli-distribution
review_status: null
planned_at_commit: abb48cbfe3c9842077812f2a54186a2dcfbe6412
execution_base_commit: 214a518fe1fdfdcff578d3e6f07f0cb3318bc7bb
---

# Bound plan review and add a plan improver

## Goal

Replace Docks' open-ended review-batch loop with a schema-versioned review
contract that reaches one of two terminal states within five total rounds:
eligible evidence, or a clear convergence-exhausted handback to the user. Add a
separate internal `plan-improver` skill that repairs only findings accepted by
plan-manager, so reviewers remain read-only evidence producers and plan-manager
remains the sole canonical writer.

## Context & rationale

The current direct reviewer prompt in
`plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs` asks
only for findings and an echoed request. It does not carry Docks' weighted
rubric, a burden of proof, a distinction between blocking and non-blocking
findings, or a repair-review mode. The current prose contract permits another
user-authorized `max_rounds` batch after each cap, so novelty-seeking reviewers
can extend a plan indefinitely.

This change adopts the useful constraints found in Oh My Pi's current plan and
review contracts: detail must remove implementer decisions rather than reward
document size; findings must have provable impact, be actionable, avoid
unstated assumptions, and demand proportionate rigor; repeated automatic
refinement is bounded. Historical policy v1-v3 requests, outputs, runs, and
receipts keep their exact meanings. New behavior uses the next schemas.

The user explicitly selected a new dated default of `max_rounds: 5`. For the
new policy it is a lifetime cap across one full review and subsequent repair
reviews, not a renewable per-batch allowance.

## Environment & how-to-run

- Repository root: `/home/vagrant/projects/docks`
- Runtime: Node 24 as required by the repository CI; dependencies installed
  through the lockfile-backed pnpm setup when absent.
- Test-first order is mandatory: add and run failing tests, record the failure,
  freeze those assertions, then edit production or skill-contract surfaces.
- Focused commands:
  - `node scripts/tests/plan-review-policy.mjs --case schemas`
  - `node scripts/tests/plan-review-policy.mjs --case legs`
  - `node scripts/tests/plan-review-policy.mjs --case bundle`
  - `node scripts/tests/plan-review-policy.mjs --case surfaces`
  - `node scripts/tests/plan-review-policy-regressions.mjs --self-test`
- Skill maintenance after meaning changes:
  - `node scripts/skills/content-hash.mjs --backfill`
  - `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs validate plugins/docks/skills/productivity/plan-improver`
  - `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file`
- Plugin and repository gates:
  - `node scripts/ci.mjs --plugin docks`
  - `node scripts/ci.mjs`

## Steps

| # | Task | Files | Depends | Status | Done condition |
|---|---|---|---|---|---|
| 1 | Write failing schema, prompt, eligibility, convergence, compatibility, and surface-sync tests. Pin historical v1-v3 behavior, then specify new policy v4 / record schema 3 behavior: exact weighted rubric sum, finding priority/confidence/blocking/requirement fields, full versus repair review identity, five-round lifetime cap, no continuation batch, exact reviewer prompt criteria, and API-valid JSON Schemas whose `const`/`enum` properties carry explicit matching `type` declarations. Add mutation regressions for every new fail-closed branch. | `scripts/tests/plan-review-policy.mjs`; `scripts/tests/plan-review-policy-regressions.mjs` | — | planned | The focused test commands fail only because policy v4, schema 3, convergence validation, API-valid typed schema declarations, and the new prompt/surfaces do not exist; the test diff is frozen before Step 2. |
| 2 | Implement versioned executable review contracts without changing historical meanings. Add policy v4 and outer record schema 3; schema-3 requests bind `review_mode: full\|repair`, one-based `round_index`, nullable prior-input identity, and accepted repair-target identity. Schema-3 reviewer output retains verdict and score but requires weighted rubric subscores whose exact sum equals score. Findings add integer priority 0..3, confidence 0..1, `blocking`, and a non-empty requirement/contract attribution. Enforce `not_ready` iff at least one blocking finding exists; ready results may carry non-blocking findings. Add a closed review-series validator requiring round 1 full, later rounds repair, contiguous indices, changed input after accepted repairs, and total rounds no greater than policy `max_rounds`. Generate and verify v3 reviewer schema files in sealed bundles. Make every generated reviewer schema accepted by the current Codex structured-output API by pairing each `const` and `enum` with an explicit JSON Schema `type`, without changing accepted historical payloads. Build a full reviewer prompt carrying the burden-of-proof, proportionality, scope, finding-limit, rubric, and repair-mode rules. | `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs` | 1 | planned | Frozen schema/legs/bundle/regression tests pass, and a direct current Codex reviewer launch no longer fails with `invalid_json_schema`. Existing schema-1 and schema-2 fixtures and receipts still validate byte-for-byte under their original policy semantics. |
| 3 | Add the internal `plan-improver` skill and route repairs through it. The skill accepts the literal request, current canonical plan, exact accepted finding set, and current round identity; it returns a minimal section-level patch or a typed cannot-repair handback. It cannot review, accept/reject findings, add unrelated policy, write receipts, change lifecycle state, or expand beyond the request. Plan-manager applies the patch as sole writer, re-runs canonical validation, commits the repaired plan, and prepares the next repair request. | `plugins/docks/skills/productivity/plan-improver/SKILL.md`; `plugins/docks/skills/productivity/plan-manager/SKILL.md`; `plugins/docks/skills/productivity/plan-review/SKILL.md` | 2 | planned | The new skill validates and scores at least 14/16; surface tests prove review and improvement ownership remain separate and plan-manager remains the sole writer. |
| 4 | Synchronize the consumer contract, dated defaults, wrappers, and scaffolded copies. Change newly resolved default `max_rounds` from 3 to 5. Define it as the policy-v4 lifetime cap and remove the continuation-batch question only for new policy. Preserve prose describing historical v1-v3 verification. Update plan-init's current marker so stale contracts are offered an explicit refresh. Ensure live and generated Claude/Codex wrappers load the canonical reviewer/improver ownership boundaries without gaining writer authority in plan-review. | `docs/plans/AGENTS.md`; `plugins/docks/skills/productivity/plan-init/SKILL.md`; `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md`; `plugins/docks/skills/productivity/plan-init/references/codex-agent-templates.md`; `plugins/docks/agents/plan-manager.md`; `plugins/docks/agents/plan-review.md`; `.codex/agents/plan-manager.toml`; `.codex/agents/plan-review.toml`; `docs/scaffold/templates/codex-plan-manager.toml.template`; `docs/scaffold/templates/codex-plan-review.toml.template`; `docs/scaffold/templates/root-AGENTS.md.template` | 3 | planned | Surface tests prove exact contract/template/default parity, historical language remains explicit, the current marker detects the convergence contract, and every generated wrapper preserves main-context ownership. |
| 5 | Refresh changed skill metadata/content hashes, run the narrow-to-broad verification ladder, inspect the final diff, and complete the plan lifecycle. | Changed `SKILL.md` frontmatter; this plan only for lifecycle/receipt writes | 4 | planned | All acceptance rows pass, `node scripts/ci.mjs --plugin docks` and full `node scripts/ci.mjs` exit 0, `git diff --check` is empty, and completion review derives `review_status: passed`. |

## Interfaces & data shapes

New policy and records are additive versions. Exact field names are fixed here;
implementation may factor validators but must not rename these wire keys.

```text
ResolvedReviewPolicyV4 = {
  schema: 4,
  cross_company_consent,
  zero_reviewer_policy,
  orchestrator_preference,
  minimum_score: 0..100,
  max_rounds: 1..10,
  openai_tiers,
  anthropic_tiers,
  provenance
}

ReviewRequestEnvelopeV3 = {
  schema: 3,
  ...historical request identity fields,
  policy: ResolvedReviewPolicyV4,
  review_mode: "full" | "repair",
  round_index: 1..10,
  previous_input_sha256: null | 64hex,
  repair_targets_sha256: null | 64hex
}

ReviewerRubricV3 = {
  standalone_executability: 0..22,
  actionability: 0..16,
  dependency_order: 0..12,
  evidence_reverify: 0..10,
  goal_coverage: 0..12,
  executable_acceptance: 0..12,
  failure_mode: 0..10,
  assumption_to_question: 0..6
}

ReviewerFindingV3 = {
  id, severity, section, path, locator, defect, fix, evidence,
  priority: 0 | 1 | 2 | 3,
  confidence: number 0..1,
  blocking: boolean,
  requirement: non-empty string
}

ReviewerOutputV3 = {
  schema: 3,
  leg,
  request,
  verdict: "ready" | "not_ready",
  score: exact sum of rubric fields,
  rubric: ReviewerRubricV3,
  findings: ReviewerFindingV3[],
  confirmations: string[]
}

ReviewSeriesV3 = {
  schema: 3,
  policy_sha256,
  initial_input_sha256,
  current_input_sha256,
  rounds: DraftRunResultV3[]
}
```

All generated schema versions use explicit types for constrained scalar
properties, for example `{"type":"string","const":"S"}` and
`{"type":"string","enum":["ready","not_ready"]}`. This changes only the JSON
Schema declaration accepted by current structured-output APIs; it does not add,
remove, or reinterpret any historical payload field.

For schema 3, `repair_targets_sha256` is SHA-256 over JCS of the sorted accepted
finding IDs plus their exact reproduced defect/fix evidence. Full review uses
both nullable repair fields as `null`. Repair review requires both fields,
requires `round_index > 1`, and reviewers inspect only the current plan delta,
the accepted repair targets, and whether those repairs introduced a blocking
regression. A repair reviewer may not reopen unrelated previously accepted
design decisions.

The reviewer prompt is generated by one helper function used by both Codex and
Claude argv builders. It must state:

- Report only provable, actionable, unintentional defects with no unstated
  assumptions and proportionate rigor.
- A blocking finding must identify the exact user requirement, safety property,
  or execution step that would otherwise fail.
- P2/P3 and low-confidence issues are non-blocking follow-ups.
- Round 1 may return at most five findings; repair rounds at most three.
- `verdict=not_ready` requires at least one blocking finding.
- Score is the exact weighted rubric sum, not an impressionistic number.

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-review-policy.mjs --case schemas` | Exits 0 and proves policy v4 / record schema 3 are closed, rubric sums are exact, finding blocking semantics fail closed, new requests bind full/repair identity, every generated constrained scalar has an explicit matching type, and historical payload schemas remain valid. |
| A2 | `node scripts/tests/plan-review-policy.mjs --case legs` | Exits 0 and proves schema-3 eligibility distinguishes blocking from follow-up findings while preserving historical ready/score behavior. |
| A3 | `node scripts/tests/plan-review-policy.mjs --case bundle` | Exits 0 and proves sealed bundles contain and verify exact API-valid X/S v1, v2, and v3 reviewer schemas without weakening bundle mutation checks. |
| A4 | `node scripts/tests/plan-review-policy.mjs --case surfaces` | Exits 0 and proves the live contract, plan-init template, manager/reviewer/improver skills, wrappers, scaffold templates, five-round default, and no-continuation semantics agree. |
| A5 | `node scripts/tests/plan-review-policy-regressions.mjs --self-test` | Exits 0 and reports mutation regressions passed for rubric-sum, blocking/verdict, repair identity, lifetime cap, prompt burden-of-proof, and historical compatibility branches. |
| A6 | `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs validate plugins/docks/skills/productivity/plan-improver && node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file \| grep 'productivity/plan-improver'` | Validation exits 0 and the new internal skill scores at least 14. |

## Out of scope / do-NOT-touch

- Do not reinterpret policy v1, v2, or v3, or historical schema-1/schema-2
  requests, outputs, runs, receipts, and bundle paths.
- Do not use Session Relay as canonical plan-review evidence transport.
- Do not add a generic autonomous advisor/watchdog runtime to Docks.
- Do not alter implementation-role model selectors or service-tier behavior.
- Do not implement correlated Relay messaging in this plan; that receives its
  own plan after the convergence system is active.
- Do not edit or resume the active Session Relay binary-distribution plan except
  to list this plan as a prerequisite if plan-manager later determines that is
  necessary.
- Do not release generated binaries or any plugin from this plan without the
  normal completion review and release gate.

## Known gotchas

- `review-policy.mjs` is a shipped dependency-free helper. Tests must import and
  execute that exact copy rather than mirror its validators.
- The bundle manifest is historical schema 1. Adding generated reviewer schema
  files must not silently change the meaning of its existing
  `reviewer_schemas` field; extend the manifest through a versioned shape or an
  additive generated-file verification rule that remains unambiguous.
- Current schema selection maps policy v3 to record schema 2. Policy v4 must map
  only to record schema 3; do not widen `>=` checks that accidentally reinterpret
  old policy.
- Existing regression tests mutate exact source strings. Production edits must
  add corresponding mutation cases rather than weakening the driver when a
  target string changes.
- Codex CLI 0.144.4 rejects a structured-output schema when a `const` property
  omits `type` (`invalid_json_schema` at `properties.leg`). Preserve payload
  compatibility while making every emitted schema declaration API-valid.
- Skill meaning changes require `metadata.updated: "2026-07-16"` and refreshed
  content hashes. Bundled skill scripts are outside the content hash but still
  require an updated date when their behavior changes.
- The current workflow record supplied to this session still resolves
  `max_rounds: 3`; the new default of 5 applies only after this change lands.

## Global constraints

- Historical persisted schemas retain their original meanings.
- New dated reviewer and implementer defaults remain
  `codex:gpt-5.6-sol@high`; only `max_rounds` changes from 3 to 5.
- X and S remain fresh, ordered, independent, findings-only, and read-only.
- Plan-manager remains the sole dispatcher, reconciler, plan writer, receipt
  writer, and lifecycle writer.
- Session Relay remains invalid as review-evidence transport.
- Tests are written and observed failing before production implementation, then
  frozen until the feature is green.

## STOP conditions

- STOP if schema 3 cannot be added without changing validation of a historical
  policy/request/receipt fixture.
- STOP if repair review cannot be bound to exact previous/current input and
  accepted findings; do not rely on prose-only attribution.
- STOP if a direct reviewer transport cannot receive the complete rubric and
  mode-specific prompt through an argv-safe literal string.
- STOP if the new skill would need independent plan-writing authority or direct
  reviewer dispatch; keep those operations in main-context plan-manager.
- STOP if focused tests require changing their assertions after the failing
  baseline; report the contradictory specification rather than weakening it.

## Cold-handoff checklist

- **File manifest:** Present in `affected_paths` and every Step row.
- **Environment & commands:** Present with exact focused, skill, plugin, and full
  CI commands.
- **Interface & data contracts:** Present with fixed policy, request, finding,
  rubric, output, and review-series field names.
- **Executable acceptance:** Present as A1-A6 with commands and observable
  expected outcomes.
- **Out of scope:** Present with historical compatibility, Relay transport, and
  release boundaries.
- **Decision rationale:** Present in Context and the versioned/lifetime-cap
  choices.
- **Known gotchas:** Present for shipped-helper, bundle, schema mapping,
  mutation-driver, and skill-hash traps.
- **Global constraints verbatim:** Present, including five total rounds,
  historical preservation, X/S isolation, and TDD ordering.
- **No undefined terms / forward refs:** `policy v4`, `record schema 3`,
  `plan-improver`, `repair_targets_sha256`, and `ReviewSeriesV3` are defined
  above.

## Self-review

Score: 97/100 · one local pass · caught: separated Relay protocol work into a
later plan; made the five-round value a lifetime cap instead of another
renewable batch; added exact repair-target hashing and historical-schema STOP
conditions; removed any writer authority from the reviewer and improver.

Weighted result: standalone executability 22/22; actionability 16/16;
dependency order 12/12; evidence re-verify 8/10 because exact implementation
line anchors will move; goal coverage 12/12; executable acceptance 12/12;
failure mode 10/10; assumption-to-question 5/6 because bundle-manifest
versioning is intentionally left to the smallest compatible implementation
that satisfies the fixed observable contract.

Cross-check (2026-07-16): [X: anthropic fable high] unavailable because the
installed Claude CLI reports `loggedIn:false`; [S: openai gpt-5.6-sol high
default] unavailable because current Codex rejects the generated schema with
`invalid_json_schema` at `properties.leg`; [codex orchestrator] reproduced the
schema defect from the sealed bundle and added explicit typed constrained
scalars to Steps 1-2 and A1/A3. Zero-reviewer continuation is the user's
standing authorized run-to-completion choice, recorded canonically after this
repaired plan is resealed.
Review-receipt: {"S":{"raw":{"attempts":[{"child_id":"019f6c1b-f8c9-7630-a6d9-ceb7d8751218","denial_source":null,"effort":"high","exit_code":1,"model":"gpt-5.6-sol","output_started":true,"reason":"Codex rejected reviewer output schema with invalid_json_schema at properties.leg","result":"nonzero_exit","retry_cause":null,"schema":2,"service_tier":"default","signal":null,"started":true,"stderr_sha256":"a6d201ab5c92aac11a3de51113a19983473e086ac945242e16dbb30bfc98a37d","stdout_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","timeout_mode":"orchestrator_tool","timeout_seconds":600,"transport":"cli"}],"decision_evidence":null,"findings":[],"findings_sha256":null,"leg":"S","reason":"Codex rejected reviewer output schema with invalid_json_schema at properties.leg","request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"2f036c297416e56d9aff212fdb994886bff8e40bf046f7f334819ec1ed089cea","diff_sha256":null,"execution_base_commit":null,"input_sha256":"d1afe87c9dc32651cafe4906d6713b717e33171c2b6b33d9cacdbf6ada9b7130","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"xhigh","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","max_rounds":3,"minimum_score":90,"openai_tiers":[{"effort":"high","model":"gpt-5.6-sol","service_tier":"default","transports":["cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"runtime_global","cross_company_consent":"runtime_global","max_rounds":"runtime_global","minimum_score":"runtime_global","openai_tiers":"runtime_global","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":3,"zero_reviewer_policy":"ask"},"policy_sha256":"c2beeab0ee239aa12a6e2ff882217be2cd3a53e72a0d4f972620b1330d665b64","request_id":"472dc099-6c9b-44d5-999c-3416c1888255","reviewed_commit_or_head":"d8af2b331213601e77f858e5ae9619694c53a6a9","schema":2},"result":"unavailable_unknown","reviewer_output":null,"schema":2,"selected":null,"severity_totals":{"high":0,"low":0,"medium":0},"waiver":null,"waiver_sha256":null},"reconciliation":{"accepted":[],"rejected":[]},"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"2f036c297416e56d9aff212fdb994886bff8e40bf046f7f334819ec1ed089cea","diff_sha256":null,"execution_base_commit":null,"input_sha256":"d1afe87c9dc32651cafe4906d6713b717e33171c2b6b33d9cacdbf6ada9b7130","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"xhigh","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","max_rounds":3,"minimum_score":90,"openai_tiers":[{"effort":"high","model":"gpt-5.6-sol","service_tier":"default","transports":["cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"runtime_global","cross_company_consent":"runtime_global","max_rounds":"runtime_global","minimum_score":"runtime_global","openai_tiers":"runtime_global","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":3,"zero_reviewer_policy":"ask"},"policy_sha256":"c2beeab0ee239aa12a6e2ff882217be2cd3a53e72a0d4f972620b1330d665b64","request_id":"472dc099-6c9b-44d5-999c-3416c1888255","reviewed_commit_or_head":"d8af2b331213601e77f858e5ae9619694c53a6a9","schema":2}},"X":{"raw":{"attempts":[],"decision_evidence":null,"findings":[],"findings_sha256":null,"leg":"X","reason":"Claude CLI is installed but reports loggedIn:false and authMethod:none","request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"2f036c297416e56d9aff212fdb994886bff8e40bf046f7f334819ec1ed089cea","diff_sha256":null,"execution_base_commit":null,"input_sha256":"d1afe87c9dc32651cafe4906d6713b717e33171c2b6b33d9cacdbf6ada9b7130","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"xhigh","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","max_rounds":3,"minimum_score":90,"openai_tiers":[{"effort":"high","model":"gpt-5.6-sol","service_tier":"default","transports":["cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"runtime_global","cross_company_consent":"runtime_global","max_rounds":"runtime_global","minimum_score":"runtime_global","openai_tiers":"runtime_global","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":3,"zero_reviewer_policy":"ask"},"policy_sha256":"c2beeab0ee239aa12a6e2ff882217be2cd3a53e72a0d4f972620b1330d665b64","request_id":"472dc099-6c9b-44d5-999c-3416c1888255","reviewed_commit_or_head":"d8af2b331213601e77f858e5ae9619694c53a6a9","schema":2},"result":"unavailable_auth","reviewer_output":null,"schema":2,"selected":null,"severity_totals":{"high":0,"low":0,"medium":0},"waiver":null,"waiver_sha256":null},"reconciliation":{"accepted":[],"rejected":[]},"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"2f036c297416e56d9aff212fdb994886bff8e40bf046f7f334819ec1ed089cea","diff_sha256":null,"execution_base_commit":null,"input_sha256":"d1afe87c9dc32651cafe4906d6713b717e33171c2b6b33d9cacdbf6ada9b7130","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"xhigh","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","max_rounds":3,"minimum_score":90,"openai_tiers":[{"effort":"high","model":"gpt-5.6-sol","service_tier":"default","transports":["cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"runtime_global","cross_company_consent":"runtime_global","max_rounds":"runtime_global","minimum_score":"runtime_global","openai_tiers":"runtime_global","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":3,"zero_reviewer_policy":"ask"},"policy_sha256":"c2beeab0ee239aa12a6e2ff882217be2cd3a53e72a0d4f972620b1330d665b64","request_id":"472dc099-6c9b-44d5-999c-3416c1888255","reviewed_commit_or_head":"d8af2b331213601e77f858e5ae9619694c53a6a9","schema":2}},"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"decision_evidence":{"actor":"repository owner in current conversation","at":"2026-07-16T15:06:50-03:00","decision":"proceed","input_sha256":"d1afe87c9dc32651cafe4906d6713b717e33171c2b6b33d9cacdbf6ada9b7130","kind":"zero_reviewer","reason":"User authorized run-to-completion after approving the plan-review convergence and release scope","request_id":"472dc099-6c9b-44d5-999c-3416c1888255","schema":1},"input_sha256":"d1afe87c9dc32651cafe4906d6713b717e33171c2b6b33d9cacdbf6ada9b7130","outcome":"zero_degraded","phase":"draft","policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"xhigh","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","max_rounds":3,"minimum_score":90,"openai_tiers":[{"effort":"high","model":"gpt-5.6-sol","service_tier":"default","transports":["cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"runtime_global","cross_company_consent":"runtime_global","max_rounds":"runtime_global","minimum_score":"runtime_global","openai_tiers":"runtime_global","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":3,"zero_reviewer_policy":"ask"},"policy_sha256":"c2beeab0ee239aa12a6e2ff882217be2cd3a53e72a0d4f972620b1330d665b64","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"2f036c297416e56d9aff212fdb994886bff8e40bf046f7f334819ec1ed089cea","diff_sha256":null,"execution_base_commit":null,"input_sha256":"d1afe87c9dc32651cafe4906d6713b717e33171c2b6b33d9cacdbf6ada9b7130","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"xhigh","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","max_rounds":3,"minimum_score":90,"openai_tiers":[{"effort":"high","model":"gpt-5.6-sol","service_tier":"default","transports":["cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"runtime_global","cross_company_consent":"runtime_global","max_rounds":"runtime_global","minimum_score":"runtime_global","openai_tiers":"runtime_global","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":3,"zero_reviewer_policy":"ask"},"policy_sha256":"c2beeab0ee239aa12a6e2ff882217be2cd3a53e72a0d4f972620b1330d665b64","request_id":"472dc099-6c9b-44d5-999c-3416c1888255","reviewed_commit_or_head":"d8af2b331213601e77f858e5ae9619694c53a6a9","schema":2},"reviewed_at":"2026-07-16T15:06:50-03:00","reviewed_commit":"d8af2b331213601e77f858e5ae9619694c53a6a9","schema":2}

## Review

(filled by plan-review on completion)

## Sources

- `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs` —
  `buildReviewerArgv` currently emits only a two-sentence reviewer instruction;
  `reviewerSchema`, `validateReviewerOutput`, and `reviewerMeetsPolicy` carry the
  executable schema and eligibility behavior.
- `plugins/docks/skills/productivity/plan-manager/SKILL.md` — Draft review Steps
  6-8 currently define renewable bounded batches and low-score reruns.
- `docs/plans/AGENTS.md` — the weighted 100-point rubric and synchronized
  consumer review contract.
- `scripts/tests/plan-review-policy.mjs` — direct helper contract, bundle,
  wrapper, surface, and compatibility tests.
- `scripts/tests/plan-review-policy-regressions.mjs` — mutation-based fail-closed
  regression driver.
- `plugins/docks/skills/AGENTS.md` — plan-contract sync and skill
  metadata/content-hash requirements.
- [Oh My Pi plan mode](https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/prompts/system/plan-mode-active.md)
  — plans remove implementer decisions rather than accumulate decorative detail.
- [Oh My Pi reviewer](https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/prompts/agents/reviewer.md)
  — provable impact, actionability, no unstated assumptions, proportionate
  rigor, priority, and confidence.
- [Oh My Pi advisor/watchdog](https://github.com/can1357/oh-my-pi/blob/main/docs/advisor-watchdog.md)
  — bounded, deduplicated advice rather than unrestricted repeated interruption.

## Notes

The follow-on plan for Session Relay will cover correlated `reply_to` /
`correlation_id`, `send --await`, `relay wait`, explicit delivery outcomes, and
typed immutable worker results. It must not begin until this plan's corrected
review lifecycle is active.
