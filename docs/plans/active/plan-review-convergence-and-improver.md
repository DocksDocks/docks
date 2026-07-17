---
title: Bound plan review and add a plan improver
goal: Make Docks plan review converge within five total rounds using evidence-backed blocking findings and a separate accepted-finding repair skill.
status: in_review
created: "2026-07-16T14:47:44-03:00"
updated: "2026-07-16T21:25:05-03:00"
started_at: "2026-07-16T15:13:44-03:00"
in_review_since: "2026-07-16T15:56:31-03:00"
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
  - scripts/tests/plan-review-convergence-repair.mjs
  - scripts/ci.mjs
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
review_status: passed
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
| 1 | Write failing schema, prompt, eligibility, convergence, compatibility, and surface-sync tests. Pin historical v1-v3 behavior, then specify new policy v4 / record schema 3 behavior: exact weighted rubric sum, finding priority/confidence/blocking/requirement fields, full versus repair review identity, five-round lifetime cap, no continuation batch, exact reviewer prompt criteria, and API-valid JSON Schemas whose `const`/`enum` properties carry explicit matching `type` declarations. Add mutation regressions for every new fail-closed branch. | `scripts/tests/plan-review-policy.mjs`; `scripts/tests/plan-review-policy-regressions.mjs` | — | done | The focused test commands fail only because policy v4, schema 3, convergence validation, API-valid typed schema declarations, and the new prompt/surfaces do not exist; the test diff is frozen before Step 2. |
| 2 | Implement versioned executable review contracts without changing historical meanings. Add policy v4 and outer record schema 3; schema-3 requests bind `review_mode: full\|repair`, one-based `round_index`, nullable prior-input identity, and accepted repair-target identity. Schema-3 reviewer output retains verdict and score but requires weighted rubric subscores whose exact sum equals score. Findings add integer priority 0..3, confidence 0..1, `blocking`, and a non-empty requirement/contract attribution. Enforce `not_ready` iff at least one blocking finding exists; ready results may carry non-blocking findings. Add a closed review-series validator requiring round 1 full, later rounds repair, contiguous indices, changed input after accepted repairs, and total rounds no greater than policy `max_rounds`. Generate and verify v3 reviewer schema files in sealed bundles. Make every generated reviewer schema accepted by the current Codex structured-output API by pairing each `const` and `enum` with an explicit JSON Schema `type`, without changing accepted historical payloads. Build a full reviewer prompt carrying the burden-of-proof, proportionality, scope, finding-limit, rubric, and repair-mode rules. | `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs` | 1 | done | Frozen schema/legs/bundle/regression tests pass, and a direct current Codex reviewer launch no longer fails with `invalid_json_schema`. Existing schema-1 and schema-2 fixtures and receipts still validate byte-for-byte under their original policy semantics. |
| 3 | Add the internal `plan-improver` skill and route repairs through it. The skill accepts the literal request, current canonical plan, exact accepted finding set, and current round identity; it returns a minimal section-level patch or a typed cannot-repair handback. It cannot review, accept/reject findings, add unrelated policy, write receipts, change lifecycle state, or expand beyond the request. Plan-manager applies the patch as sole writer, re-runs canonical validation, commits the repaired plan, and prepares the next repair request. | `plugins/docks/skills/productivity/plan-improver/SKILL.md`; `plugins/docks/skills/productivity/plan-manager/SKILL.md`; `plugins/docks/skills/productivity/plan-review/SKILL.md` | 2 | done | The new skill validates and scores at least 14/16; surface tests prove review and improvement ownership remain separate and plan-manager remains the sole writer. |
| 4 | Synchronize the consumer contract, dated defaults, wrappers, and scaffolded copies. Change newly resolved default `max_rounds` from 3 to 5. Define it as the policy-v4 lifetime cap and remove the continuation-batch question only for new policy. Preserve prose describing historical v1-v3 verification. Update plan-init's current marker so stale contracts are offered an explicit refresh. Ensure live and generated Claude/Codex wrappers load the canonical reviewer/improver ownership boundaries without gaining writer authority in plan-review. | `docs/plans/AGENTS.md`; `plugins/docks/skills/productivity/plan-init/SKILL.md`; `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md`; `plugins/docks/skills/productivity/plan-init/references/codex-agent-templates.md`; `plugins/docks/agents/plan-manager.md`; `plugins/docks/agents/plan-review.md`; `.codex/agents/plan-manager.toml`; `.codex/agents/plan-review.toml`; `docs/scaffold/templates/codex-plan-manager.toml.template`; `docs/scaffold/templates/codex-plan-review.toml.template`; `docs/scaffold/templates/root-AGENTS.md.template` | 3 | done | Surface tests prove exact contract/template/default parity, historical language remains explicit, the current marker detects the convergence contract, and every generated wrapper preserves main-context ownership. |
| 5 | Refresh changed skill metadata/content hashes, run the narrow-to-broad verification ladder, inspect the final diff, and complete the plan lifecycle. | Changed `SKILL.md` frontmatter; this plan only for lifecycle/receipt writes | 4 | done | All acceptance rows pass, `node scripts/ci.mjs --plugin docks` and full `node scripts/ci.mjs` exit 0, `git diff --check` is empty, and completion review derives `review_status: passed`. |
| 6 | Add a second frozen TDD file for the completion-review findings without changing the original semantic assertions. Specify repair bundles that expose an immutable previous canonical plan and exact accepted-target artifact, target-hash recomputation from reproduced evidence, terminal handling for a below-floor result with no actionable finding, and a disposable Codex reviewer work directory outside the sealed bundle. Correct only positive fixtures that encoded the rejected loopholes and record every resulting SHA-256. | `scripts/tests/plan-review-convergence-repair.mjs`; `scripts/tests/plan-review-policy.mjs` | 5 | done | The new test file fails on the reproduced gaps only, its SHA-256 is recorded, the regression-driver hash remains unchanged, and each original fixture correction is documented without weakening an assertion. |
| 7 | Implement the repair transition and reviewer workspace contracts. Add a closed repair-transition preimage whose hash is recomputed from sorted accepted ids plus exact reproduced defect/fix evidence; bind it to the prior and current canonical inputs. Seal `previous-plan.review.md` and `repair-targets.json` for repair rounds and verify their exact manifest/request identities. Run Codex reviewers from a helper-owned disposable work directory with `--ephemeral --ignore-user-config`, explicit model/effort/service tier/sandbox, and an absolute sealed-bundle instruction; never use the sealed bundle as Codex's working root. A below-floor ready result with no reproducible finding terminates as `convergence-exhausted` because there is no authorized repair delta. | `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs` | 6 | done | The new frozen tests pass; post-leg bundle verification remains byte-identical under current Codex CLI 0.144.4; target or prior-plan substitution fails closed; and the no-actionable-repair branch has one valid terminal result. |
| 8 | Synchronize the repaired executable contract across plan-manager, plan-review, plan-init/template, wrappers, scaffold copies, and the repository test gate; refresh content hashes; rerun focused and full CI; then repeat completion review from a fresh sealed bundle. | `docs/plans/AGENTS.md`; `plugins/docks/skills/productivity/plan-manager/SKILL.md`; `plugins/docks/skills/productivity/plan-review/SKILL.md`; `plugins/docks/skills/productivity/plan-init/SKILL.md`; `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md`; `plugins/docks/skills/productivity/plan-init/references/codex-agent-templates.md`; `plugins/docks/agents/plan-manager.md`; `plugins/docks/agents/plan-review.md`; `.codex/agents/plan-manager.toml`; `.codex/agents/plan-review.toml`; `docs/scaffold/templates/codex-plan-manager.toml.template`; `docs/scaffold/templates/codex-plan-review.toml.template`; `docs/scaffold/templates/root-AGENTS.md.template`; `scripts/ci.mjs` | 7 | done | Contract sync, frozen repair-suite CI integration, live isolated Codex smoke, focused A1-A9, and full three-plugin CI passed; the fresh completion reviewer returned four reproduced blocking gaps that are captured in Steps 9-11. |
| 9 | Add the next frozen red tests for the accepted completion findings. Require repair transitions to carry an exact X/S reconciliation partition and reject a reproduced-but-rejected target; require schema-3 command documentation to use the helper workspace and isolation flags; expand artifact tests to cover omission, consistently resealed previous-plan substitution, and request mismatches; split deterministic workspace proof from a credentialed live Codex acceptance case. Clarify confidence as binary `0\|1`, matching the implemented high/low signal. | `scripts/tests/plan-review-convergence-repair.mjs`; `scripts/tests/plan-review-policy.mjs`; this plan | 7 | done | Repair-series failed because `transition.reconciliation` was absent; surfaces failed because schema-3 docs still routed `-C` to the bundle. Artifact mutations already passed and are frozen as regressions. Frozen SHA-256: convergence `d728e870530e60e199d95225b9af159d1ef293542242cd7e243a770722ddb984`; policy `5fd4265053dbd8a4111987d4b5ad0afaaad9a1fc80aff37db7a1373ee2c5011f`. The independent driver changed only to copy the newly asserted plan surface into its isolated corpus; its post-fixture SHA-256 is `4a8d58b572f55d8de51d022a310f8cea3a57abe454363dac5d74aca55fab20aa`, and all mutation cases pass. |
| 10 | Implement the accepted repair. Extend the unreleased `ReviewRepairTransitionV1` with closed per-leg reconciliation, include it in the repair-target digest preimage/artifact, validate each leg as an exact partition of the prior raw findings, and require target ids to equal the accepted-id union as well as exact reproduced evidence. Update schema-3 command docs and add the explicit credentialed live reviewer test without putting it in ordinary CI. | `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs`; `plugins/docks/skills/productivity/plan-review/SKILL.md`; `scripts/tests/plan-review-convergence-repair.mjs`; `scripts/tests/plan-review-policy.mjs` | 9 | done | Frozen hashes stayed unchanged; matching reconciliation, rejected-target, artifact, CLI-transport, validation, leg, and surface cases pass. The transition digest now covers reconciliation plus targets, and schema-3 docs use the helper workspace with both isolation flags. |
| 11 | Refresh affected skill hashes and synchronized plan surfaces, run focused tests, the credentialed live acceptance command, Docks CI, full CI, and bounded repair-mode completion review. Repair any completion-series validator defect exposed by the real lifecycle before resealing. | `plugins/docks/skills/productivity/plan-review/SKILL.md`; `plugins/docks/skills/productivity/plan-manager/SKILL.md`; `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs`; `scripts/tests/plan-review-policy.mjs`; `scripts/tests/plan-review-policy-regressions.mjs`; `docs/plans/AGENTS.md`; `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md`; this plan | 10 | in-flight | A10 passed with current Codex credentials (exit 0; stdout SHA-256 `4a39eb03a6bcdfd95fb41bf6e6770f3c28836d8677b41574237b18532e85209f`). Completion series now select one immutable run kind and reject drift. Round 3 exposed missing fail-closed coverage; exact initial-kind and mixed-kind assertions plus mutation cases now pass. Updated hashes: policy `4ea47f2d326ca61fb1f0a17a01cf25c66efa98e30f15d0cf4a720df31cecf3f8`; mutation driver `a90c5ae0604be9cd18e470f9850ed47a474fa957429b6262fa530bda763ca65a`. The next repair-mode completion round must pass. |

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
  confidence: integer 0 | 1 (0=low, 1=high),
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
  rounds: (DraftRunResultV3 | CompletionRunResultV3)[],
  repairs: ReviewRepairTransitionV1[]
}

ReviewRepairTransitionV1 = {
  schema: 1,
  from_round_index,
  previous_input_sha256,
  current_input_sha256,
  reconciliation: {
    X: {accepted: string[], rejected: [{id, reason}]},
    S: {accepted: string[], rejected: [{id, reason}]}
  },
  targets: [{
    id, source, defect, fix,
    reproduction: {method, command, exit_code, evidence_sha256}
  }],
  repair_targets_sha256
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

For every repair round, the sealed bundle additionally contains
`previous-plan.review.md` and `repair-targets.json`. The latter is compact JCS
of the closed `ReviewRepairTransitionV1`, whose targets are sorted by finding
id. The target preimage SHA-256 must equal both the transition and request
`repair_targets_sha256`; the previous plan bytes must hash to
`previous_input_sha256`. `validateReviewSeries`
recomputes both identities and proves every target was present in the prior
round, independently reproduced, and accepted by plan-manager.

A below-floor `ready` result with no reproducible finding consumes its current
round and terminates as `convergence-exhausted`; it does not fabricate an
unchanged-input repair round.

Codex reviewers run from a helper-owned disposable directory outside the
sealed bundle. The argv includes `--ephemeral --ignore-user-config` plus every
explicit model, effort, service-tier, and sandbox value. The prompt names the
absolute sealed bundle path, and post-leg verification must prove the bundle
remained byte-identical before the helper removes the disposable workdir.

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
| A7 | `node scripts/tests/plan-review-convergence-repair.mjs --case repair-artifacts` | Exits 0 and proves prior-plan and accepted-target artifacts are sealed, request-bound, byte-verified, and rejected on omission/substitution. |
| A8 | `node scripts/tests/plan-review-convergence-repair.mjs --case repair-series` | Exits 0 and proves exact target preimages are recomputed from accepted reproduced findings, arbitrary hashes fail, and low-score/no-finding terminates without an invalid unchanged-input round. |
| A9 | `node scripts/tests/plan-review-convergence-repair.mjs --case reviewer-workdir` | Exits 0 and deterministically proves schema-3 Codex argv requires a helper-issued disposable workdir, explicit Standard tier, isolation flags, post-leg bundle verification, and sentinel-bound cleanup. |
| A10 | `DOCKS_LIVE_CODEX_REVIEW=1 node scripts/tests/plan-review-convergence-repair.mjs --case reviewer-live` | Exits 0 with current Codex credentials, validates typed schema-3 reviewer output and explicit Standard tier, leaves the sealed bundle byte-identical, and cleans only its bound workdir. |

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
- Codex CLI 0.144.4 may create empty `.git` and `.agents` directories in its
  working root before model-generated commands enter the read-only sandbox.
  Never set the sealed bundle as the Codex working root; post-leg verification
  remains mandatory.
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

Completion cross-check (2026-07-16): [X: anthropic fable high] unavailable
because Claude remains logged out; [S: openai gpt-5.6-sol high default] output
identified three blocking defects, but the leg is non-canonical because current
Codex created empty `.git` and `.agents` directories in the sealed working root.
[codex orchestrator] independently reproduced all three source defects plus the
transport mutation and accepted them as Steps 6-8. A separate TDD file preserved
the original assertions; positive fixtures were corrected only where they
encoded the rejected arbitrary-hash and non-repair-bundle loopholes.
Review-receipt: {"S":{"raw":{"attempts":[{"child_id":"019f6c1b-f8c9-7630-a6d9-ceb7d8751218","denial_source":null,"effort":"high","exit_code":1,"model":"gpt-5.6-sol","output_started":true,"reason":"Codex rejected reviewer output schema with invalid_json_schema at properties.leg","result":"nonzero_exit","retry_cause":null,"schema":2,"service_tier":"default","signal":null,"started":true,"stderr_sha256":"a6d201ab5c92aac11a3de51113a19983473e086ac945242e16dbb30bfc98a37d","stdout_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","timeout_mode":"orchestrator_tool","timeout_seconds":600,"transport":"cli"}],"decision_evidence":null,"findings":[],"findings_sha256":null,"leg":"S","reason":"Codex rejected reviewer output schema with invalid_json_schema at properties.leg","request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"2f036c297416e56d9aff212fdb994886bff8e40bf046f7f334819ec1ed089cea","diff_sha256":null,"execution_base_commit":null,"input_sha256":"d1afe87c9dc32651cafe4906d6713b717e33171c2b6b33d9cacdbf6ada9b7130","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"xhigh","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","max_rounds":3,"minimum_score":90,"openai_tiers":[{"effort":"high","model":"gpt-5.6-sol","service_tier":"default","transports":["cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"runtime_global","cross_company_consent":"runtime_global","max_rounds":"runtime_global","minimum_score":"runtime_global","openai_tiers":"runtime_global","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":3,"zero_reviewer_policy":"ask"},"policy_sha256":"c2beeab0ee239aa12a6e2ff882217be2cd3a53e72a0d4f972620b1330d665b64","request_id":"472dc099-6c9b-44d5-999c-3416c1888255","reviewed_commit_or_head":"d8af2b331213601e77f858e5ae9619694c53a6a9","schema":2},"result":"unavailable_unknown","reviewer_output":null,"schema":2,"selected":null,"severity_totals":{"high":0,"low":0,"medium":0},"waiver":null,"waiver_sha256":null},"reconciliation":{"accepted":[],"rejected":[]},"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"2f036c297416e56d9aff212fdb994886bff8e40bf046f7f334819ec1ed089cea","diff_sha256":null,"execution_base_commit":null,"input_sha256":"d1afe87c9dc32651cafe4906d6713b717e33171c2b6b33d9cacdbf6ada9b7130","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"xhigh","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","max_rounds":3,"minimum_score":90,"openai_tiers":[{"effort":"high","model":"gpt-5.6-sol","service_tier":"default","transports":["cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"runtime_global","cross_company_consent":"runtime_global","max_rounds":"runtime_global","minimum_score":"runtime_global","openai_tiers":"runtime_global","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":3,"zero_reviewer_policy":"ask"},"policy_sha256":"c2beeab0ee239aa12a6e2ff882217be2cd3a53e72a0d4f972620b1330d665b64","request_id":"472dc099-6c9b-44d5-999c-3416c1888255","reviewed_commit_or_head":"d8af2b331213601e77f858e5ae9619694c53a6a9","schema":2}},"X":{"raw":{"attempts":[],"decision_evidence":null,"findings":[],"findings_sha256":null,"leg":"X","reason":"Claude CLI is installed but reports loggedIn:false and authMethod:none","request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"2f036c297416e56d9aff212fdb994886bff8e40bf046f7f334819ec1ed089cea","diff_sha256":null,"execution_base_commit":null,"input_sha256":"d1afe87c9dc32651cafe4906d6713b717e33171c2b6b33d9cacdbf6ada9b7130","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"xhigh","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","max_rounds":3,"minimum_score":90,"openai_tiers":[{"effort":"high","model":"gpt-5.6-sol","service_tier":"default","transports":["cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"runtime_global","cross_company_consent":"runtime_global","max_rounds":"runtime_global","minimum_score":"runtime_global","openai_tiers":"runtime_global","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":3,"zero_reviewer_policy":"ask"},"policy_sha256":"c2beeab0ee239aa12a6e2ff882217be2cd3a53e72a0d4f972620b1330d665b64","request_id":"472dc099-6c9b-44d5-999c-3416c1888255","reviewed_commit_or_head":"d8af2b331213601e77f858e5ae9619694c53a6a9","schema":2},"result":"unavailable_auth","reviewer_output":null,"schema":2,"selected":null,"severity_totals":{"high":0,"low":0,"medium":0},"waiver":null,"waiver_sha256":null},"reconciliation":{"accepted":[],"rejected":[]},"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"2f036c297416e56d9aff212fdb994886bff8e40bf046f7f334819ec1ed089cea","diff_sha256":null,"execution_base_commit":null,"input_sha256":"d1afe87c9dc32651cafe4906d6713b717e33171c2b6b33d9cacdbf6ada9b7130","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"xhigh","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","max_rounds":3,"minimum_score":90,"openai_tiers":[{"effort":"high","model":"gpt-5.6-sol","service_tier":"default","transports":["cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"runtime_global","cross_company_consent":"runtime_global","max_rounds":"runtime_global","minimum_score":"runtime_global","openai_tiers":"runtime_global","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":3,"zero_reviewer_policy":"ask"},"policy_sha256":"c2beeab0ee239aa12a6e2ff882217be2cd3a53e72a0d4f972620b1330d665b64","request_id":"472dc099-6c9b-44d5-999c-3416c1888255","reviewed_commit_or_head":"d8af2b331213601e77f858e5ae9619694c53a6a9","schema":2}},"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"decision_evidence":{"actor":"repository owner in current conversation","at":"2026-07-16T15:06:50-03:00","decision":"proceed","input_sha256":"d1afe87c9dc32651cafe4906d6713b717e33171c2b6b33d9cacdbf6ada9b7130","kind":"zero_reviewer","reason":"User authorized run-to-completion after approving the plan-review convergence and release scope","request_id":"472dc099-6c9b-44d5-999c-3416c1888255","schema":1},"input_sha256":"d1afe87c9dc32651cafe4906d6713b717e33171c2b6b33d9cacdbf6ada9b7130","outcome":"zero_degraded","phase":"draft","policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"xhigh","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","max_rounds":3,"minimum_score":90,"openai_tiers":[{"effort":"high","model":"gpt-5.6-sol","service_tier":"default","transports":["cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"runtime_global","cross_company_consent":"runtime_global","max_rounds":"runtime_global","minimum_score":"runtime_global","openai_tiers":"runtime_global","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":3,"zero_reviewer_policy":"ask"},"policy_sha256":"c2beeab0ee239aa12a6e2ff882217be2cd3a53e72a0d4f972620b1330d665b64","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"2f036c297416e56d9aff212fdb994886bff8e40bf046f7f334819ec1ed089cea","diff_sha256":null,"execution_base_commit":null,"input_sha256":"d1afe87c9dc32651cafe4906d6713b717e33171c2b6b33d9cacdbf6ada9b7130","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"xhigh","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","max_rounds":3,"minimum_score":90,"openai_tiers":[{"effort":"high","model":"gpt-5.6-sol","service_tier":"default","transports":["cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"runtime_global","cross_company_consent":"runtime_global","max_rounds":"runtime_global","minimum_score":"runtime_global","openai_tiers":"runtime_global","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":3,"zero_reviewer_policy":"ask"},"policy_sha256":"c2beeab0ee239aa12a6e2ff882217be2cd3a53e72a0d4f972620b1330d665b64","request_id":"472dc099-6c9b-44d5-999c-3416c1888255","reviewed_commit_or_head":"d8af2b331213601e77f858e5ae9619694c53a6a9","schema":2},"reviewed_at":"2026-07-16T15:06:50-03:00","reviewed_commit":"d8af2b331213601e77f858e5ae9619694c53a6a9","schema":2}

## Review

- **Goal met:** yes
- **Regressions:** []
- **CI:** {"command":"node scripts\u002fci\u002emjs","exit_code":0,"first_failure":null,"output_sha256":"a0003b74958ff2ca8f135bf55372251dcd402e66e5a99d25da87713ddda60810"}
- **Follow-ups:** []
- **Filed by:** {"role":"plan-manager","receipt_author":{"company":"openai","tool":"codex","model":"gpt\u002d5\u002e6\u002dsol","effort":"high"},"reviewed_at":"2026\u002d07\u002d16T21\u003a25\u003a05\u002d03\u003a00"}
- **Cross-check:** (2026-07-16) [X: anthropic "fable" "high"; result=passed] 0 findings — accepted none / rejected none; [S: openai "gpt\u002d5\u002e6\u002dsol" "high"; result=passed] 0 findings — accepted none / rejected none; [orchestrator: openai "codex" "gpt\u002d5\u002e6\u002dsol" "high"] independently verified none against source before accepting.

Completion-review-receipt: {"S":{"raw":{"attempts":[{"child_id":"019f6d6b-0d00-72f0-a98e-4bcba589dd71","denial_source":null,"effort":"high","exit_code":0,"model":"gpt-5.6-sol","output_started":true,"reason":"completed","result":"passed","retry_cause":null,"schema":3,"service_tier":"default","signal":null,"started":true,"stderr_sha256":"62ab4f59915361669a3c2a3250443c13cc6dd0c4bf21a7c950fba02aed61cdac","stdout_sha256":"63e62c5ba1e6226ad5a408d8244c2b1c5e0d56010ee80e10b8b5cd31160e6562","timeout_mode":"orchestrator_tool","timeout_seconds":600,"transport":"cli"}],"decision_evidence":null,"findings":[],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","leg":"S","reason":null,"request":{"acceptance_inventory_sha256":"345cb009eb1d036aeb4003a284ce9560b4abe52693aa23444653d59c631ca19c","author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"59fe143086b5a138246222e7df808e0d321ea5dac218d3aa231a8537e5a86ac0","diff_sha256":"1cd3515e57018914efece80ed4c1290ec07e21a00b0bc4ec49cfa9a58da6710e","execution_base_commit":"214a518fe1fdfdcff578d3e6f07f0cb3318bc7bb","input_sha256":"cecf178c22f8ad3cb7583ded966f523df3f48fe9ba174504bd17129d3254e89c","lifecycle_intent":"none","phase":"completion","planned_at_commit":"abb48cbfe3c9842077812f2a54186a2dcfbe6412","policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["cli"]},{"effort":"xhigh","model":"opus","transports":["cli"]}],"cross_company_consent":"always","max_rounds":5,"minimum_score":90,"openai_tiers":[{"effort":"high","model":"gpt-5.6-sol","service_tier":"default","transports":["cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"runtime_global","cross_company_consent":"current_user","max_rounds":"skill_default","minimum_score":"runtime_global","openai_tiers":"runtime_global","orchestrator_preference":"skill_default","zero_reviewer_policy":"current_user"},"schema":4,"zero_reviewer_policy":"proceed"},"policy_sha256":"c861146256c236c90171a76db9d77a2dc563a7fa507e9529947a3b6b92e6b683","previous_input_sha256":"84b6887c0c41aa54f76c44af9ff29daff5ff0d158d0d1a17333df1d586ccb6b0","repair_targets_sha256":"bbcdc2e30757f666b4275c89534a813c7c02fdaf48d1afa80d5a969826781bca","request_id":"543ee403-612f-4eeb-ab68-a8a850f1c3c7","review_mode":"repair","reviewed_commit_or_head":"489b5429844c1730f58f03d36e603930b8068822","round_index":4,"schema":3},"result":"passed","reviewer_output":{"confirmations":["The accepted X1 repair target is resolved: Step 11 now includes both test files, records updated hashes, and states that invalid-initial-kind and mixed-kind assertions plus matching mutation cases pass.","The current-plan delta is limited to the accepted target and its round-3 evidence; no blocking regression was introduced."],"rubric":{"actionability":16,"assumption_to_question":6,"dependency_order":12,"evidence_reverify":10,"executable_acceptance":12,"failure_mode":10,"goal_coverage":12,"standalone_executability":22},"score":100,"structured_output_sha256":"578621e90d784bb538686fd961061a54d34161d51184dfc609d438b1f9207504","verdict":"ready"},"schema":3,"selected":{"effort":"high","model":"gpt-5.6-sol","service_tier":"default","transport":"cli"},"severity_totals":{"high":0,"low":0,"medium":0},"waiver":null,"waiver_sha256":null},"reconciliation":{"accepted":[],"rejected":[]},"request":{"acceptance_inventory_sha256":"345cb009eb1d036aeb4003a284ce9560b4abe52693aa23444653d59c631ca19c","author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"59fe143086b5a138246222e7df808e0d321ea5dac218d3aa231a8537e5a86ac0","diff_sha256":"1cd3515e57018914efece80ed4c1290ec07e21a00b0bc4ec49cfa9a58da6710e","execution_base_commit":"214a518fe1fdfdcff578d3e6f07f0cb3318bc7bb","input_sha256":"cecf178c22f8ad3cb7583ded966f523df3f48fe9ba174504bd17129d3254e89c","lifecycle_intent":"none","phase":"completion","planned_at_commit":"abb48cbfe3c9842077812f2a54186a2dcfbe6412","policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["cli"]},{"effort":"xhigh","model":"opus","transports":["cli"]}],"cross_company_consent":"always","max_rounds":5,"minimum_score":90,"openai_tiers":[{"effort":"high","model":"gpt-5.6-sol","service_tier":"default","transports":["cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"runtime_global","cross_company_consent":"current_user","max_rounds":"skill_default","minimum_score":"runtime_global","openai_tiers":"runtime_global","orchestrator_preference":"skill_default","zero_reviewer_policy":"current_user"},"schema":4,"zero_reviewer_policy":"proceed"},"policy_sha256":"c861146256c236c90171a76db9d77a2dc563a7fa507e9529947a3b6b92e6b683","previous_input_sha256":"84b6887c0c41aa54f76c44af9ff29daff5ff0d158d0d1a17333df1d586ccb6b0","repair_targets_sha256":"bbcdc2e30757f666b4275c89534a813c7c02fdaf48d1afa80d5a969826781bca","request_id":"543ee403-612f-4eeb-ab68-a8a850f1c3c7","review_mode":"repair","reviewed_commit_or_head":"489b5429844c1730f58f03d36e603930b8068822","round_index":4,"schema":3}},"X":{"raw":{"attempts":[{"child_id":"01bc55c1-794c-4f9d-82c0-140a5021fbbd","denial_source":null,"effort":"high","exit_code":0,"model":"fable","output_started":true,"reason":"completed","result":"passed","retry_cause":null,"schema":3,"signal":null,"started":true,"stderr_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","stdout_sha256":"c098a38e82a33feb6b41fdf0cbf2e00c6d940fcd349f7ca2a9306d48dca18383","timeout_mode":"orchestrator_tool","timeout_seconds":600,"transport":"cli"}],"decision_evidence":null,"findings":[],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","leg":"X","reason":null,"request":{"acceptance_inventory_sha256":"345cb009eb1d036aeb4003a284ce9560b4abe52693aa23444653d59c631ca19c","author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"59fe143086b5a138246222e7df808e0d321ea5dac218d3aa231a8537e5a86ac0","diff_sha256":"1cd3515e57018914efece80ed4c1290ec07e21a00b0bc4ec49cfa9a58da6710e","execution_base_commit":"214a518fe1fdfdcff578d3e6f07f0cb3318bc7bb","input_sha256":"cecf178c22f8ad3cb7583ded966f523df3f48fe9ba174504bd17129d3254e89c","lifecycle_intent":"none","phase":"completion","planned_at_commit":"abb48cbfe3c9842077812f2a54186a2dcfbe6412","policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["cli"]},{"effort":"xhigh","model":"opus","transports":["cli"]}],"cross_company_consent":"always","max_rounds":5,"minimum_score":90,"openai_tiers":[{"effort":"high","model":"gpt-5.6-sol","service_tier":"default","transports":["cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"runtime_global","cross_company_consent":"current_user","max_rounds":"skill_default","minimum_score":"runtime_global","openai_tiers":"runtime_global","orchestrator_preference":"skill_default","zero_reviewer_policy":"current_user"},"schema":4,"zero_reviewer_policy":"proceed"},"policy_sha256":"c861146256c236c90171a76db9d77a2dc563a7fa507e9529947a3b6b92e6b683","previous_input_sha256":"84b6887c0c41aa54f76c44af9ff29daff5ff0d158d0d1a17333df1d586ccb6b0","repair_targets_sha256":"bbcdc2e30757f666b4275c89534a813c7c02fdaf48d1afa80d5a969826781bca","request_id":"543ee403-612f-4eeb-ab68-a8a850f1c3c7","review_mode":"repair","reviewed_commit_or_head":"489b5429844c1730f58f03d36e603930b8068822","round_index":4,"schema":3},"result":"passed","reviewer_output":{"confirmations":["Bundle identity verified: completion.diff SHA-256 equals request.diff_sha256, plan.review.md SHA-256 equals request.input_sha256, and repair-targets.json recomputes to the sealed repair_targets_sha256 under JCS over {schema:1, reconciliation, targets}.","Repair delta is exactly scoped to accepted target X1: the reviewed-head commit 489b542 changes only docs/plans/active/plan-review-convergence-and-improver.md (+13/-2) plus +10-line additions to scripts/tests/plan-review-policy.mjs and scripts/tests/plan-review-policy-regressions.mjs; no production code or unrelated accepted design decisions were touched.","X1 fix delivered in full: exact-message assertion for an invalid rounds[0].kind (/review series run kind/), a mixed-kind fixture (draft round 1 followed by a completion-kind round 2) asserting /review series run kind drift/, and two matching mutation regressions ('schema-3 initial run-kind regression', 'schema-3 run-kind drift regression') targeting precisely the two new fail-closed branches in validateReviewSeries.","Both mutation regressions provably kill: replacing oneOf(kind,...) with 'void kind;' routes the draft-shaped fixture into validateCompletionRunResult whose closed-key error does not match /review series run kind/, and disabling the drift guard reaches validateDraftRunResult which throws 'draft run kind', not matching /review series run kind drift/ (verified against review-policy.mjs line 759 at the reviewed commit).","Plan-recorded frozen SHA-256 values re-verified against blobs at the reviewed commit 489b542: scripts/tests/plan-review-policy.mjs = 4ea47f2d326ca61fb1f0a17a01cf25c66efa98e30f15d0cf4a720df31cecf3f8 and scripts/tests/plan-review-policy-regressions.mjs = a90c5ae0604be9cd18e470f9850ed47a474fa957429b6262fa530bda763ca65a, exactly as Step 11 states.","Executable re-verification at the reviewed head on a clean worktree: 'node scripts/tests/plan-review-policy.mjs --case schemas' exited 0 printing 'schema closure, typed structured output, rubric, repair identity, and lifetime convergence goldens passed', and 'node scripts/tests/plan-review-policy-regressions.mjs --self-test' exited 0 with all mutation cases (including the two new run-kind regressions) killed.","Round 4 stays within the five-round lifetime cap; the plan narrative records the round-3 reconciliation (X1 accepted, none rejected) consistent with repair-targets.json."],"rubric":{"actionability":16,"assumption_to_question":6,"dependency_order":12,"evidence_reverify":10,"executable_acceptance":12,"failure_mode":10,"goal_coverage":12,"standalone_executability":22},"score":100,"structured_output_sha256":"b945bdfc18df8d5aeefccce0c6284259d6e4c03305c7f6a27d243e8648474639","verdict":"ready"},"schema":3,"selected":{"effort":"high","model":"fable","transport":"cli"},"severity_totals":{"high":0,"low":0,"medium":0},"waiver":null,"waiver_sha256":null},"reconciliation":{"accepted":[],"rejected":[]},"request":{"acceptance_inventory_sha256":"345cb009eb1d036aeb4003a284ce9560b4abe52693aa23444653d59c631ca19c","author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"59fe143086b5a138246222e7df808e0d321ea5dac218d3aa231a8537e5a86ac0","diff_sha256":"1cd3515e57018914efece80ed4c1290ec07e21a00b0bc4ec49cfa9a58da6710e","execution_base_commit":"214a518fe1fdfdcff578d3e6f07f0cb3318bc7bb","input_sha256":"cecf178c22f8ad3cb7583ded966f523df3f48fe9ba174504bd17129d3254e89c","lifecycle_intent":"none","phase":"completion","planned_at_commit":"abb48cbfe3c9842077812f2a54186a2dcfbe6412","policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["cli"]},{"effort":"xhigh","model":"opus","transports":["cli"]}],"cross_company_consent":"always","max_rounds":5,"minimum_score":90,"openai_tiers":[{"effort":"high","model":"gpt-5.6-sol","service_tier":"default","transports":["cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"runtime_global","cross_company_consent":"current_user","max_rounds":"skill_default","minimum_score":"runtime_global","openai_tiers":"runtime_global","orchestrator_preference":"skill_default","zero_reviewer_policy":"current_user"},"schema":4,"zero_reviewer_policy":"proceed"},"policy_sha256":"c861146256c236c90171a76db9d77a2dc563a7fa507e9529947a3b6b92e6b683","previous_input_sha256":"84b6887c0c41aa54f76c44af9ff29daff5ff0d158d0d1a17333df1d586ccb6b0","repair_targets_sha256":"bbcdc2e30757f666b4275c89534a813c7c02fdaf48d1afa80d5a969826781bca","request_id":"543ee403-612f-4eeb-ab68-a8a850f1c3c7","review_mode":"repair","reviewed_commit_or_head":"489b5429844c1730f58f03d36e603930b8068822","round_index":4,"schema":3}},"acceptance_inventory":{"criteria":[{"command":"node scripts/tests/plan-review-policy.mjs --case schemas","expected":"Exits 0 and proves policy v4 / record schema 3 are closed, rubric sums are exact, finding blocking semantics fail closed, new requests bind full/repair identity, every generated constrained scalar has an explicit matching type, and historical payload schemas remain valid.","id":"A1"},{"command":"node scripts/tests/plan-review-policy.mjs --case legs","expected":"Exits 0 and proves schema-3 eligibility distinguishes blocking from follow-up findings while preserving historical ready/score behavior.","id":"A2"},{"command":"node scripts/tests/plan-review-policy.mjs --case bundle","expected":"Exits 0 and proves sealed bundles contain and verify exact API-valid X/S v1, v2, and v3 reviewer schemas without weakening bundle mutation checks.","id":"A3"},{"command":"node scripts/tests/plan-review-policy.mjs --case surfaces","expected":"Exits 0 and proves the live contract, plan-init template, manager/reviewer/improver skills, wrappers, scaffold templates, five-round default, and no-continuation semantics agree.","id":"A4"},{"command":"node scripts/tests/plan-review-policy-regressions.mjs --self-test","expected":"Exits 0 and reports mutation regressions passed for rubric-sum, blocking/verdict, repair identity, lifetime cap, prompt burden-of-proof, and historical compatibility branches.","id":"A5"},{"command":"node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs validate plugins/docks/skills/productivity/plan-improver && node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file | grep 'productivity/plan-improver'","expected":"Validation exits 0 and the new internal skill scores at least 14.","id":"A6"},{"command":"node scripts/tests/plan-review-convergence-repair.mjs --case repair-artifacts","expected":"Exits 0 and proves prior-plan and accepted-target artifacts are sealed, request-bound, byte-verified, and rejected on omission/substitution.","id":"A7"},{"command":"node scripts/tests/plan-review-convergence-repair.mjs --case repair-series","expected":"Exits 0 and proves exact target preimages are recomputed from accepted reproduced findings, arbitrary hashes fail, and low-score/no-finding terminates without an invalid unchanged-input round.","id":"A8"},{"command":"node scripts/tests/plan-review-convergence-repair.mjs --case reviewer-workdir","expected":"Exits 0 and deterministically proves schema-3 Codex argv requires a helper-issued disposable workdir, explicit Standard tier, isolation flags, post-leg bundle verification, and sentinel-bound cleanup.","id":"A9"},{"command":"DOCKS_LIVE_CODEX_REVIEW=1 node scripts/tests/plan-review-convergence-repair.mjs --case reviewer-live","expected":"Exits 0 with current Codex credentials, validates typed schema-3 reviewer output and explicit Standard tier, leaves the sealed bundle byte-identical, and cleans only its bound workdir.","id":"A10"}],"schema":1},"acceptance_inventory_sha256":"345cb009eb1d036aeb4003a284ce9560b4abe52693aa23444653d59c631ca19c","author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"completion_verdict":"passed","decision_evidence":null,"diff_sha256":"1cd3515e57018914efece80ed4c1290ec07e21a00b0bc4ec49cfa9a58da6710e","execution_base_commit":"214a518fe1fdfdcff578d3e6f07f0cb3318bc7bb","outcome":"dual","phase":"completion","plan_input_sha256":"cecf178c22f8ad3cb7583ded966f523df3f48fe9ba174504bd17129d3254e89c","planned_at_commit":"abb48cbfe3c9842077812f2a54186a2dcfbe6412","policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["cli"]},{"effort":"xhigh","model":"opus","transports":["cli"]}],"cross_company_consent":"always","max_rounds":5,"minimum_score":90,"openai_tiers":[{"effort":"high","model":"gpt-5.6-sol","service_tier":"default","transports":["cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"runtime_global","cross_company_consent":"current_user","max_rounds":"skill_default","minimum_score":"runtime_global","openai_tiers":"runtime_global","orchestrator_preference":"skill_default","zero_reviewer_policy":"current_user"},"schema":4,"zero_reviewer_policy":"proceed"},"policy_sha256":"c861146256c236c90171a76db9d77a2dc563a7fa507e9529947a3b6b92e6b683","primary":{"acceptance":[{"actual_sha256":"09c87eced50d2d3d24789264a4bb52bbd7c7625958ece328bb3c4c5871b0a8cb","command":"node scripts/tests/plan-review-policy.mjs --case schemas","criterion_id":"A1","exit_code":0,"expected":"Exits 0 and proves policy v4 / record schema 3 are closed, rubric sums are exact, finding blocking semantics fail closed, new requests bind full/repair identity, every generated constrained scalar has an explicit matching type, and historical payload schemas remain valid.","met":true},{"actual_sha256":"6ce46f2d63d001d9d515eb04c65977c42d1f28d66d5f2471a34a422eb843da81","command":"node scripts/tests/plan-review-policy.mjs --case legs","criterion_id":"A2","exit_code":0,"expected":"Exits 0 and proves schema-3 eligibility distinguishes blocking from follow-up findings while preserving historical ready/score behavior.","met":true},{"actual_sha256":"ce02f42063890a43e33424f102307b0254394239cb7f9aabe9637636a1da6232","command":"node scripts/tests/plan-review-policy.mjs --case bundle","criterion_id":"A3","exit_code":0,"expected":"Exits 0 and proves sealed bundles contain and verify exact API-valid X/S v1, v2, and v3 reviewer schemas without weakening bundle mutation checks.","met":true},{"actual_sha256":"2b855a65805564e1cd03445316cdad2409dfcc36a87fb9926bf92bd2bcada2c5","command":"node scripts/tests/plan-review-policy.mjs --case surfaces","criterion_id":"A4","exit_code":0,"expected":"Exits 0 and proves the live contract, plan-init template, manager/reviewer/improver skills, wrappers, scaffold templates, five-round default, and no-continuation semantics agree.","met":true},{"actual_sha256":"6a409874b5ddd229f4812ace6c876af416e10d19285bc8322dbe1429b122dd6b","command":"node scripts/tests/plan-review-policy-regressions.mjs --self-test","criterion_id":"A5","exit_code":0,"expected":"Exits 0 and reports mutation regressions passed for rubric-sum, blocking/verdict, repair identity, lifetime cap, prompt burden-of-proof, and historical compatibility branches.","met":true},{"actual_sha256":"14d80ef5d92ebadf5e590fdbdeafa18699f85b581ae228c33b17a334091b48b4","command":"node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs validate plugins/docks/skills/productivity/plan-improver && node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file | grep 'productivity/plan-improver'","criterion_id":"A6","exit_code":0,"expected":"Validation exits 0 and the new internal skill scores at least 14.","met":true},{"actual_sha256":"52b13ce02635a8d90bd622589d24191d57307ca7c51b8296cd5003918f81dfa5","command":"node scripts/tests/plan-review-convergence-repair.mjs --case repair-artifacts","criterion_id":"A7","exit_code":0,"expected":"Exits 0 and proves prior-plan and accepted-target artifacts are sealed, request-bound, byte-verified, and rejected on omission/substitution.","met":true},{"actual_sha256":"7a99444a0f84f2e2e9dd72dd433f0166cee3b3d002b91771979ed8a4052f387d","command":"node scripts/tests/plan-review-convergence-repair.mjs --case repair-series","criterion_id":"A8","exit_code":0,"expected":"Exits 0 and proves exact target preimages are recomputed from accepted reproduced findings, arbitrary hashes fail, and low-score/no-finding terminates without an invalid unchanged-input round.","met":true},{"actual_sha256":"e384b9308df765bf6c54cf78ecbd526472e30bb1c290cf7565f6554d1dcc7b84","command":"node scripts/tests/plan-review-convergence-repair.mjs --case reviewer-workdir","criterion_id":"A9","exit_code":0,"expected":"Exits 0 and deterministically proves schema-3 Codex argv requires a helper-issued disposable workdir, explicit Standard tier, isolation flags, post-leg bundle verification, and sentinel-bound cleanup.","met":true},{"actual_sha256":"4a39eb03a6bcdfd95fb41bf6e6770f3c28836d8677b41574237b18532e85209f","command":"DOCKS_LIVE_CODEX_REVIEW=1 node scripts/tests/plan-review-convergence-repair.mjs --case reviewer-live","criterion_id":"A10","exit_code":0,"expected":"Exits 0 with current Codex credentials, validates typed schema-3 reviewer output and explicit Standard tier, leaves the sealed bundle byte-identical, and cleans only its bound workdir.","met":true}],"ci":{"command":"node scripts/ci.mjs","exit_code":0,"first_failure":null,"output_sha256":"a0003b74958ff2ca8f135bf55372251dcd402e66e5a99d25da87713ddda60810"},"findings":[],"followups":[],"goal_met":"yes","regressions":[]},"reproduced":[],"request":{"acceptance_inventory_sha256":"345cb009eb1d036aeb4003a284ce9560b4abe52693aa23444653d59c631ca19c","author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"59fe143086b5a138246222e7df808e0d321ea5dac218d3aa231a8537e5a86ac0","diff_sha256":"1cd3515e57018914efece80ed4c1290ec07e21a00b0bc4ec49cfa9a58da6710e","execution_base_commit":"214a518fe1fdfdcff578d3e6f07f0cb3318bc7bb","input_sha256":"cecf178c22f8ad3cb7583ded966f523df3f48fe9ba174504bd17129d3254e89c","lifecycle_intent":"none","phase":"completion","planned_at_commit":"abb48cbfe3c9842077812f2a54186a2dcfbe6412","policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["cli"]},{"effort":"xhigh","model":"opus","transports":["cli"]}],"cross_company_consent":"always","max_rounds":5,"minimum_score":90,"openai_tiers":[{"effort":"high","model":"gpt-5.6-sol","service_tier":"default","transports":["cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"runtime_global","cross_company_consent":"current_user","max_rounds":"skill_default","minimum_score":"runtime_global","openai_tiers":"runtime_global","orchestrator_preference":"skill_default","zero_reviewer_policy":"current_user"},"schema":4,"zero_reviewer_policy":"proceed"},"policy_sha256":"c861146256c236c90171a76db9d77a2dc563a7fa507e9529947a3b6b92e6b683","previous_input_sha256":"84b6887c0c41aa54f76c44af9ff29daff5ff0d158d0d1a17333df1d586ccb6b0","repair_targets_sha256":"bbcdc2e30757f666b4275c89534a813c7c02fdaf48d1afa80d5a969826781bca","request_id":"543ee403-612f-4eeb-ab68-a8a850f1c3c7","review_mode":"repair","reviewed_commit_or_head":"489b5429844c1730f58f03d36e603930b8068822","round_index":4,"schema":3},"reviewed_at":"2026-07-16T21:25:05-03:00","reviewed_head":"489b5429844c1730f58f03d36e603930b8068822","schema":3}

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

TDD red evidence was captured before implementation: schema, legs, bundle,
surface, and mutation cases failed on the absent policy-v4/schema-3 contract.
The first implementation cycle froze hashes
`c1bf65f7c6d48aa99984d20dd3ee8966710110164e9b9ba3646ac0efd50829c8`
and `a36539649df1c149397c73f31472dd4dcfa9fe607241fd7a9070c7291ccf3e49`.
The repair cycle froze
`scripts/tests/plan-review-convergence-repair.mjs` at
`90333eb0c483ab80436eb7703bb1a8f2a5abcdc7aa08ada49e19717085712987`.
Fixture-only corrections moved `scripts/tests/plan-review-policy.mjs` to
`6dda603ffa968ff901da4073200eef5f068d8c521f0ef3394604601f650caa86`;
the mutation driver remained byte-identical at
`a36539649df1c149397c73f31472dd4dcfa9fe607241fd7a9070c7291ccf3e49`.
Current Codex CLI 0.144.4 accepted the generated schema after constrained
scalars gained explicit types and unsupported `uniqueItems` was removed; the
live collector parsed five findings with no `invalid_json_schema`. Focused
Docks CI and full three-plugin CI passed before implementation commit
`26e201f523e2c55a80e5152c325a665c7dd24859`.

Completion dogfood reproduced four additional defects: repair bundles lacked
the previous plan and accepted-target evidence; the series accepted arbitrary
target digests; below-floor/no-finding could not form a valid next round; and
Codex mutated the sealed working root before its read-only command sandbox.
The invalidated bundle is preserved at
`/tmp/docks-plan-review/0683565a-85b3-4ede-9fd9-b3e17b85551f` because the safe
destroy helper correctly refused a mutated bundle.

Repair implementation commit
`80212a3b42cbf4e394518423b18e03a7738b3c2f` passed every A1-A9 focused
command, skill validation/content-hash checks, `node scripts/ci.mjs --plugin
docks`, `git diff --check`, and full three-plugin `node scripts/ci.mjs`.
A live Codex CLI 0.144.4 Standard-tier schema-3 leg exited 0 from the
helper-owned workspace with `--ephemeral --ignore-user-config`; its sealed
bundle SHA-256 remained
`c275deb50760da0eebb910815396dae3b6678e446d13b5d4418122fc823d0d04`
before and after the leg.

Fresh completion round at committed `b70d592990c8096fd51c92b34671fb778e186707`
passed A1-A9 and full CI in helper-owned checkout
`f8d63371-d317-41ec-86eb-908495dac7ca`. The isolated Standard-tier S reviewer
returned score 74/not-ready with accepted findings S1-S5: missing persisted
acceptance binding, stale schema-3 command prose, overstated A9 live coverage,
incomplete A7 mutation coverage, and a binary-confidence declaration mismatch.
Main context reproduced them with evidence SHA-256 values
`24337c82b95ea7ab665b5fccaa7b6d8e5aabc108fafa73f3707852b81c82763b`,
`cd535b927293b58d181deb59302f450984da325be93ec442ce616acb25542e8b`,
`e38a28f75a8af0b9a70235648a2b65af4b3756b946e72f7e8e54e4dd45a85adc`,
`628af1a4e61e10a41a511972739b6fd8691732272535fea9a3df5aa9accebebb`,
and `22435e76d2349390598f101a08089e19bda7fca755f0dfb0d2212551f509dbdf`.
Plan-improver scope is exactly those five ids; no unrelated plan section may
change.

Continuation review (2026-07-16): main-context plan-manager recovered the exact
prior S output and reproductions, built a helper-verified repair request over
only S1-S5 (`9bfe415e-19cd-45e6-ac88-69fe5953ba10`), and sealed bundle
`124bd210aa71a336c6fc6de0bf16718559a1f0a60b80875675d5b0ceca771ca3`.
The authorized OMP fresh-context X wrapper failed before reviewer contact with
`404 model: claude-opus-4-0`; this is wrapper model unavailability, not reviewer
evidence. OMP could not supply the request's CLI-only, explicit Standard-tier S
transport, and the prior elevated Codex CLI retry remains authoritatively
`platform_denied` as a private-repository export. No denied transport was
retried, Session Relay was not used, and zero reviewer legs passed. Completion
policy therefore forbids `review_status: passed`. The unused sealed bundle was
removed through `destroy-bundle` with its expected hash. Keep this plan
`in_review`; do not begin the dependent Session Relay plan or release Docks.

Authentication recovery (2026-07-16): Claude CLI 2.1.211 reported authenticated,
and the policy-owned `fable` alias resolved to `claude-fable-5`; the earlier
`claude-opus-4-0` error came only from OMP's stale task-wrapper resolution, not
this repository or the CLI review policy. Repair round 2 request
`ba30db48-f285-4b76-9535-1afa856479c2` produced a schema-valid X result with
score 89/not-ready and one blocking finding, X1: Step 11's stale
`platform_denied` A10 state could not satisfy the sealed boolean acceptance
inventory. Main context reproduced the contradiction, accepted X1 as a
plan-state repair within the existing S3 target, then reran A10 through the
non-elevated helper-owned workspace. It passed in 176.20 seconds with stdout
SHA-256 `4a39eb03a6bcdfd95fb41bf6e6770f3c28836d8677b41574237b18532e85209f`
and stderr SHA-256
`613dd026821dfc6354f5ad9b6ef62a9a34fc881ff215b8ce3a8704d4c11821b4`.
The same round's S leg timed out before output because the orchestrator left
stdin open; policy consumed that attempt as `timed_out` and did not retry it.
A fresh repair round over the corrected canonical input remains required.

Round-3 preparation exposed a separate executable-contract defect before a
reviewer launch: `validateReviewSeries` unconditionally called
`validateDraftRunResult`, so every completion repair series failed with
`draft run phase`. A new completion-series fixture failed on that exact route
before production code changed. The helper now selects `draft` or `completion`
once from round 1, rejects mixed-kind drift, and validates each round through
the matching typed validator; the focused schema case passes.

Repair round 3 request `b9070c87-5358-4b3c-bec2-c7a96297e04e`
completed both independent legs over the same verified bundle. X
(`claude-fable-5`, high) returned ready/99 with one priority-2, non-blocking
finding X1: the two new completion-series fail-closed branches lacked the
mutation coverage required by Step 1. S (`gpt-5.6-sol`, high, Standard)
returned ready/100 with no findings. Main context reproduced X1 from the live
test corpus and accepted it despite its non-blocking classification so the plan
does not close with a known explicit-contract gap. The policy suite now covers
an invalid initial kind and mixed-kind drift; the mutation driver proves both
guards independently. Round 4 remains within the five-round lifetime cap.

The follow-on plan for Session Relay will cover correlated `reply_to` /
`correlation_id`, `send --await`, `relay wait`, explicit delivery outcomes, and
typed immutable worker results. It must not begin until this plan's corrected
review lifecycle is active.
