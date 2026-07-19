---
title: Cut over plan workflow to schema 6 and explicit phases
goal: Persist bounded review attempts, split the five plan phases cleanly, remove capability tuning, release Docks 0.13.0, and hand public its 0.10 boundary.
status: planned
created: "2026-07-19T03:36:13-03:00"
updated: "2026-07-19T04:18:19-03:00"
started_at: null
assignee: null
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: high
review_waivers: []
tags: [plans, schema-6, lifecycle, clean-cutover, release]
affected_paths:
  - .claude-plugin/marketplace.json
  - .codex/agents/plan-manager.toml
  - .codex/agents/plan-review.toml
  - .codex/agents/plan-reviewer.toml
  - AGENTS.md
  - README.md
  - docs/plans/AGENTS.md
  - docs/scaffold/spec.yaml
  - docs/scaffold/templates/codex-plan-manager.toml.template
  - docs/scaffold/templates/codex-plan-review.toml.template
  - docs/scaffold/templates/codex-plan-reviewer.toml.template
  - docs/scaffold/templates/root-AGENTS.md.template
  - plugins/docks/.claude-plugin/plugin.json
  - plugins/docks/.codex-plugin/plugin.json
  - plugins/docks/README.md
  - plugins/docks/agents/plan-manager.md
  - plugins/docks/agents/plan-review.md
  - plugins/docks/agents/plan-reviewer.md
  - plugins/docks/skills/AGENTS.md
  - plugins/docks/skills/engineering/refactor/SKILL.md
  - plugins/docks/skills/engineering/security/SKILL.md
  - plugins/docks/skills/productivity/capability-tuning/SKILL.md
  - plugins/docks/skills/productivity/capability-tuning/references/claude-code-config.md
  - plugins/docks/skills/productivity/capability-tuning/references/codex-config.md
  - plugins/docks/skills/productivity/context-tree/SKILL.md
  - plugins/docks/skills/productivity/multi-tool-bridge/SKILL.md
  - plugins/docks/skills/productivity/plan-creator/SKILL.md
  - plugins/docks/skills/productivity/plan-improver/SKILL.md
  - plugins/docks/skills/productivity/plan-init/SKILL.md
  - plugins/docks/skills/productivity/plan-init/references/codex-agent-templates.md
  - plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-repairer/SKILL.md
  - plugins/docks/skills/productivity/plan-review/SKILL.md
  - plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs
  - plugins/docks/skills/productivity/plan-reviewer/SKILL.md
  - plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs
  - plugins/docks/skills/productivity/plan-workspace/SKILL.md
  - plugins/docks/skills/productivity/plan-workspace/references/codex-agent-templates.md
  - plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md
  - plugins/docks/skills/productivity/scaffold/SKILL.md
  - plugins/docks/skills/productivity/scaffold/references/spec-schema.md
  - plugins/docks/skills/productivity/skill-agent-pipeline/SKILL.md
  - plugins/effect-kit/skills/engineering/effect-ts-port/SKILL.md
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - plugins/session-relay/test/release-evidence-contract.mjs
  - scripts/AGENTS.md
  - scripts/ci.mjs
  - scripts/lib/plugins.mjs
  - scripts/lib/session-relay-release-preparation.mjs
  - scripts/skills/codex-facts.mjs
  - scripts/skills/transform-guard.mjs
  - scripts/tests/ci-plugin-targeting.mjs
  - scripts/tests/plan-review-convergence-repair.mjs
  - scripts/tests/plan-review-policy-regressions.mjs
  - scripts/tests/plan-review-policy.mjs
  - scripts/tests/plan-skill-phases.mjs
related_plans:
  - session-relay-prebuilt-cli-release
  - session-relay-correlated-messaging-and-worker-results
review_status: passed
planned_at_commit: 42e2dfa157771d2482aa9f0e55ee223b97c0b68d
execution_base_commit: null
---

# Cut over plan workflow to schema 6 and explicit phases

## Goal

Replace the renewable review loop with a persisted, plan-bound orchestration
state that permits no more than two same-input orchestration attempts and no
more than two review rounds per series. Split repository setup, plan creation,
existing-plan management, read-only review, and accepted-blocker repair into
five unambiguous skills; remove the stale `capability-tuning` surface without
weakening retained Codex-fact guards; ship the breaking Docks contract as
`0.13.0`; and leave an exact Session Relay boundary for the later public
`docks-kit 0.10.0` migration.

## Context & rationale

Schema 5 bounds one review series to full round 1 plus at most one repair round
2, but it does not bind the caller's next orchestration epoch. A caller can
prepare a fresh request after unavailable or stale evidence, `cannot_repair`, or
apply rejection and silently reset to round 1. The current
`applyLifecycleState({intentUsed})` also accepts caller-reconstructed
consumption state. Rubrics grade one artifact; they do not prove progress or
prevent a renewable loop. The correction is durable compact-JCS state keyed to
the canonical plan input and lifecycle intent, not a timeout or another prompt.

This plan is the old schema-5 workflow's final creation operation. Its creation
and mandatory draft review use the released current `plan-manager`; no workflow
implementation file changes before an eligible `planned → ongoing` transition
and the separately recorded `execution_base_commit`. A terminal draft-review
result leaves this plan non-executing and returns control. It never authorizes
automatic preparation of another full review.

The five names and ownership boundaries are fixed:

| Phase | Skill | Public | Ownership |
|---|---|---:|---|
| Workspace | `plan-workspace` | yes | Bootstrap, migrate, audit, or explicitly refresh `docs/plans`; never draft an individual plan. |
| Create | `plan-creator` | yes | Draft, self-review, and commit one previously nonexistent plan as `planned` or `scheduled`; never edit an existing plan or dispatch review. |
| Manage | `plan-manager` | yes | Existing-plan list/show/lifecycle, review preparation and dispatch, finding reconciliation, receipt/status writes, and one-shot apply. |
| Review | `plan-reviewer` | no | Read-only typed evidence over one sealed bundle; no write, reconciliation, receipt, or lifecycle authority. |
| Repair | `plan-repairer` | no | One patch for the exact accepted blocking set or `cannot_repair`; no review dispatch or lifecycle authority. |

Only `plan-manager` and `plan-reviewer` receive Claude/Codex dispatch wrappers.
`plan-workspace`, `plan-creator`, and `plan-repairer` are skills only. This is a
clean cutover: no aliases, forwarding wrappers, re-exports, duplicate trigger
claims, or live old directories remain. Historical plan/receipt/fixture strings
retain their persisted names and bytes.

`capability-tuning` has no live runtime importer or registry. Its volatile Codex
facts duplicate `skill-agent-pipeline`; deletion reduces drift, provided
`scripts/skills/codex-facts.mjs` continues to fail when a retained
`skill-agent-pipeline/references/codex-agents-builder.md` effort token is
corrupted.

Execution is release-ordered. Do not start this plan's implementation until
Session Relay `0.12.0` is stable and its release plan is finished with valid
completion evidence. The Docks work ends with released `docks--v0.13.0` and
this plan's completion lifecycle. Only afterward may Session Relay hand the
public repository a separate reviewed `plan-workflow-name-migration.md` for the
breaking docks-kit `0.10.0` consumer migration.

## Environment & how-to-run

- Repository: `/home/vagrant/projects/docks`, branch `main`, Node 24, pnpm
  `11.5.1`; commands run from the repository root.
- Creation base: `42e2dfa157771d2482aa9f0e55ee223b97c0b68d` with a clean
  worktree. Active plans are multi-occupancy; another `in_review` or blocked plan
  does not block this plan.
- Required setup inside completion's disposable checkout: `corepack enable &&
  pnpm install --frozen-lockfile`.
- Project CI command, run exactly once after the ordered completion acceptance
  inventory: `node scripts/ci.mjs`.
- Focused commands, in order after direct red/green work:

  ```bash
  node scripts/tests/plan-skill-phases.mjs
  node scripts/tests/plan-review-policy.mjs --case surfaces
  node scripts/tests/plan-review-convergence-repair.mjs --case repair-series
  node scripts/tests/plan-review-convergence-repair.mjs --case repair-artifacts
  node scripts/tests/plan-review-policy-regressions.mjs --self-test
  node scripts/skills/codex-facts.mjs
  node scripts/skills/content-hash.mjs --check-only
  node scripts/scaffold/guard-spec.mjs
  node scripts/scaffold/test.mjs
  node scripts/ci.mjs --plugin docks
  ```

- Content hashes are generated, never hand-written: after bumping
  `metadata.updated` for each changed skill, run
  `node scripts/skills/content-hash.mjs --backfill`, then the check-only command.
- Release only after focused and full gates pass from a clean reviewed tree:
  `node scripts/release.mjs --plugin docks minor`. It must synchronize
  `0.12.9 → 0.13.0`, create immutable tag `docks--v0.13.0`, push without force,
  and bind targeted tag CI plus the GitHub Release.
- GitHub authentication and the canonical `origin` remote must already be valid.
  Never rewrite credentials, bypass branch protections, force-push, or recreate
  an existing tag/Release.

## Interfaces & data shapes

### Persisted orchestration state

Persist exactly one unfenced line in the plan:

```text
Review-orchestration-state: <compact JCS ReviewOrchestrationStateV1>
```

`MACHINE_RECORD`, extraction, and duplicate rejection recognize that exact
record. `canonicalPlanView` excludes it only after validation; malformed or
duplicate lines fail closed. The closed state is:

```json
{
  "schema": 1,
  "plan_path": "docs/plans/active/<slug>.md",
  "phase": "draft|completion",
  "lifecycle_intent": "none|start|schedule_fire|auto_execute",
  "initial_input_sha256": "<64 lowercase hex>",
  "current_input_sha256": "<64 lowercase hex>",
  "orchestration_attempt": 1,
  "series_id": "<uuid>",
  "request_ids": ["<uuid>"],
  "round_index": 1,
  "status": "active|passed|stopped|stuck",
  "stop_reason": null,
  "series_sha256": null,
  "apply_state": "none|pending|consumed",
  "transitioned_from_state_sha256": null,
  "retry_authorization": null,
  "state_sha256": "<sha256 of compact JCS without state_sha256>"
}
```

`stop_reason` is null exactly for `active|passed`; otherwise it is the closed
`StopReason` union:

```text
unavailable_auth|unavailable_model|timed_out|unavailable_unknown|
failed_unparseable|platform_denied|stale_input|cannot_repair|not_ready|
apply_rejected
```

`retry_authorization` is null or the closed value:

```json
{
  "schema": 1,
  "authorization_id": "<uuid>",
  "actor": "user",
  "authorized_at": "<ISO 8601 with offset>",
  "plan_path": "docs/plans/active/<slug>.md",
  "phase": "draft|completion",
  "intent_group": "none|start|scheduled_execution|completion",
  "input_sha256": "<64 lowercase hex>",
  "stopped_state_sha256": "<64 lowercase hex>",
  "source_text_sha256": "<sha256 of exact current-user message bytes>"
}
```

`state_sha256` is SHA-256 of compact JCS with only `state_sha256` omitted.
`orchestration_attempt` and `round_index` are independently restricted to
`1|2`. `request_ids.length === round_index`; request IDs are unique.
`initial_input_sha256` is immutable within one series. Repair round 2 changes
only `current_input_sha256`, appends one request ID, and retains `series_id` and
`orchestration_attempt`.

The renewable key is
`(plan_path,phase,intent_group,current_input_sha256)`. Map
`schedule_fire|auto_execute` to `scheduled_execution`; completion uses
`completion`; other draft intents retain their literal group. A stopped or
stuck scheduled execution blocks both automatic intents. A genuinely changed
canonical input starts a new series at attempt 1. Timestamps, lifecycle-only
frontmatter, review records/receipts, and this orchestration record are excluded
from substantive input and cannot manufacture progress.

### Schema-6 review bindings

Every current record that embeds or validates a request uses one row of this
closed matrix; no validator may infer a row from filenames alone:

| Request / mode | Embedded record schemas | Structured-output schema | Bundle manifest |
|---|---|---|---|
| schema 5 full | `ReviewerOutput`, raw review, run, series, draft/completion receipt, completion/lifecycle branch = 5; repair transition absent | `reviewer-output.primary.v5.schema.json` | `schema:3`, `review_schema:5`, `reviewer_schemas.primary:"reviewer-output.primary.v5.schema.json"` |
| schema 5 repair | all preceding records plus repair transition = 5 | `reviewer-output.primary.v5.schema.json` | `schema:4`, `review_schema:5`, `reviewer_schemas.primary:"reviewer-output.primary.v5.schema.json"` |
| schema 6 full | `ReviewerOutputV6`, `RawReviewV6`, `ReviewRunV6`, `ReviewSeriesV6`, draft/completion receipt, completion/lifecycle branch = 6; repair transition absent | `reviewer-output.primary.v6.schema.json` | `schema:5`, `review_schema:6`, `reviewer_schemas.primary:"reviewer-output.primary.v6.schema.json"` |
| schema 6 repair | all preceding schema-6 records plus `RepairTransitionV6` = 6 | `reviewer-output.primary.v6.schema.json` | `schema:6`, `review_schema:6`, `reviewer_schemas.primary:"reviewer-output.primary.v6.schema.json"` |

Schema-6 request fields add `orchestration_series_id` and
`orchestration_state_sha256`. Require:

- `request.request_id === state.request_ids.at(-1)`;
- request round, input, phase, intent, series ID, and state hash equal the
  persisted, committed, read-back active state;
- schema-6 repair transitions bind previous/current orchestration-state hashes
  and preserve the series ID;
- `ReviewSeriesV6` binds the series ID and each round's request/state hash;
- active state has `series_sha256:null`;
- `settleReviewOrchestration` accepts an active state once, requires exact
  `sha256(JCS(ReviewSeriesV6))`, and stores that digest;
- schema-6 draft/completion receipts add
  `settled_orchestration_state_sha256` and match both persisted settled state and
  embedded final series; bundle manifests/verifiers and receipt reuse enforce
  the same bindings.

For schema 6, full and repair bundle builders write the v6 schema file above.
Codex dispatch passes that exact bundled file as its structured-output schema;
Claude dispatch requests the same `ReviewerOutputV6` envelope. Both collectors
validate `ReviewerOutputV6 → RawReviewV6 → ReviewRunV6 → ReviewSeriesV6`, select
the exact full/repair manifest row, and reject any v5/v6 cross-pair before
receipt creation or reuse. Tests traverse both tools in full and repair modes.

Schemas 1–5 retain their exact historical builders, validators, schema-file and
manifest bytes, fixtures, request/receipt meanings, and byte behavior. Schema-6
builders and validators are separate current branches. Do not broad-replace
schema constants or upgrade historical records.

### Pure transition functions and typed handoff

Expose:

```text
beginReviewOrchestration(...)
advanceReviewOrchestrationRepair(...)
settleReviewOrchestration(...)
consumeReviewIntent(...)
```

Replace the old
`applyLifecycleState({state,intent,eligible,intentUsed})` input with the closed
`applyLifecycleState({state,intent,eligible,orchestration})`; reject the old key.
`consumeReviewIntent` requires a validated `passed`/`pending` state and returns
exactly one of:

```json
{"kind":"applied","state":"ongoing","orchestration":{"apply_state":"consumed","transitioned_from_state_sha256":"<settled state hash>"}}
{"kind":"rejected","state":"<unchanged>","orchestration":{"status":"stuck","stop_reason":"apply_rejected","apply_state":"none","transitioned_from_state_sha256":"<settled state hash>"}}
```

Only an expected lifecycle-precondition rejection returns `rejected`.
Malformed or hash-mismatched state throws without mutation. Manager atomically
persists active state before sealing, repair state before round 2, every settled
terminal series plus receipt, and the consumed/rejected lifecycle result in
plan-only commits; each write is read back before proceeding. Intent `none`
always has `apply_state:"none"` and null transition.

A terminal non-executing handoff is:

```text
NeedsUserAction {plan_path,phase,lifecycle_intent,current_input_sha256,
orchestration_attempt,stop_reason,state_sha256,allowed_next}
```

It returns without exception, prompt loop, sleep, or automatic reprepare.
`PlanCreatedV1` is the closed create result:

```text
PlanCreatedV1 {plan_path,creation_commit,planned_at_commit,
plan_input_sha256,status}
```

`plan-creator` returns it only after creating and committing a nonexistent
canonical plan path; it never reviews or edits that path again.

### State-machine result rules

Derive state from validated evidence, never caller-provided result strings.
First derive exactly one result by this total, ordered reducer:

1. A committed request/input/state identity mismatch yields `stale_input` before
   dispatch. A validated repair `cannot-repair` result or rejected repair
   transition yields `cannot_repair` before a new series can settle.
2. Otherwise reduce the validated raw/attempt evidence by the table below. For
   an exhausted availability fallback, inspect all attempts and choose the first
   present class in precedence `auth_failed` > `model_unavailable` >
   `tool_unavailable`; this yields `unavailable_auth`, `unavailable_model`, or
   `unavailable_unknown`, respectively. Candidate order never changes that
   precedence.
3. Otherwise a validated raw `passed` with an eligible run, or a validated raw
   `waived`, yields an eligible pass. A passed raw review with a blocking
   checklist, draft `pre_execution_eligible:false`, or completion
   `partial|regressed` yields `not_ready`.
4. `apply_rejected` is considered only after a settled eligible pass with
   `apply_state:"pending"`; it cannot overwrite an earlier terminal reason.
   Malformed, unclosed, or hash-mismatched evidence throws with no state or plan
   mutation and therefore is never normalized into a stop reason.

| Validated raw/attempt evidence | Derived result |
|---|---|
| `passed` and collector eligible, or `waived` | eligible pass |
| exhausted `auth_failed` / `model_unavailable` / `tool_unavailable` fallback | precedence mapping above |
| terminal `deadline_exceeded` | `timed_out` |
| terminal `transient_transport` | `unavailable_unknown` |
| terminal `nonzero_exit`, `signaled`, or `output_invalid` | `failed_unparseable` |
| terminal `platform_denied` | `platform_denied` |
| validated collector not eligible | `not_ready` |

Apply the derived result identically at both attempt numbers:

| Derived result | Attempt 1 | Explicit same-input attempt 2 |
|---|---|---|
| eligible pass | `passed`; `stop_reason:null` | `passed`; `stop_reason:null` |
| `unavailable_auth`, `unavailable_model`, `timed_out`, `unavailable_unknown`, `failed_unparseable` | `stopped`; one current-user retry may be authorized | `stuck`; no further same-input retry |
| `platform_denied`, `stale_input`, `cannot_repair`, `not_ready`, `apply_rejected` | `stuck`; no retry | `stuck`; no retry |

`active` requires null `stop_reason`, null `series_sha256`, and
`apply_state:"none"`. Attempt 1 carries no retry authorization; attempt 2 and
all of its later states preserve exactly the one authorization bound to the
prior stopped-state hash. Every settled state stores the exact series digest.
`passed` requires null `stop_reason`; before intent consumption it has
`apply_state:"pending"` only for an eligible executing intent and otherwise
`none`. `stopped|stuck` require a non-null `StopReason` and
`apply_state:"none"`. Their transition hash is null except that
`apply_rejected` stores the settled passed-state hash. Intent consumption is
once-only: `pending → consumed` retains `passed`, stores the settled-state hash,
and permits no second apply; expected rejection yields
`stuck/apply_rejected/none`. Only a retryable attempt-1 `stopped` state may
authorize the one attempt-2 transition; no attempt-2 or `stuck` state may
accept another authorization, and neither consume path may re-enter review.

Candidate fallback remains inside one orchestration attempt and never creates a
series. Attempt 2 requires `beginReviewOrchestration` to receive the exact
current-user message bytes and a matching `ReviewRetryAuthorizationV1`; it
recomputes the source hash, requires actor `user`, exact message-record
time/path/phase/group/input/prior stopped hash, and embeds the authorization
once. Reject reuse, mismatch, nonretryable prior reasons, or missing explicit
user input. Red/green tests kill one mutant for each reducer row, fallback
precedence, attempt-1/attempt-2 status conversion, and apply/retry invariant.

## Steps

| # | Task | Files | Depends | Status | Done when / failure action |
|---|---|---|---|---|---|
| 1 | Confirm release and lifecycle prerequisites, then start only through the old manager's final schema-5 review/apply path. | `docs/plans/active/plan-workflow-phases-and-loop-escape.md` (plan-manager-only lifecycle fields); `docs/plans/active/session-relay-prebuilt-cli-release.md` (read-only prerequisite) | — | planned | Session Relay `0.12.0` is stable; its release plan is finished with reusable passed evidence; this plan has an eligible draft receipt, a committed `planned → ongoing` transition, and a second plan-only `execution_base_commit` identity commit. Otherwise STOP with no implementation edit or fresh automatic review series. |
| 2 | Write red tests for the phase split, current schema 6, orchestration attempt/state hashing, terminal result mapping, explicit retry, repair binding, intent consumption, and historical compatibility. | `scripts/tests/plan-skill-phases.mjs` (create); `scripts/tests/plan-review-convergence-repair.mjs`; `scripts/tests/plan-review-policy.mjs`; `scripts/tests/plan-review-policy-regressions.mjs`; `scripts/tests/ci-plugin-targeting.mjs` | 1 | planned | The new focused cases fail against schema 5 for the intended missing behavior before production changes; preserve the failure output. If they pass without implementation or fail for setup/syntax, STOP and correct the test. |
| 3 | Move the helper to `plan-reviewer` and add current-only schema 6 plus the persisted orchestration machine and atomic lifecycle consumption. | `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs` → `plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs`; `scripts/lib/session-relay-release-preparation.mjs`; `plugins/session-relay/test/release-evidence-contract.mjs`; the four plan test files from Step 2 | 2 | planned | Every schema-6 request-embedding record, exact v6 schema filename, full/repair manifest value, Codex/Claude dispatch/collection path, receipt/reuse branch, and four pure functions satisfy the data/state rules above; schemas 1–5, their schema/manifest bytes, and historical fixtures validate unchanged. Any historical-byte or schema regression is STOP, not a fixture rewrite. |
| 4 | Perform the clean five-skill ownership cutover and remove all old live paths/names. | `plugins/docks/skills/productivity/plan-init/{SKILL.md,references/plans-agents-md-template.md,references/codex-agent-templates.md}` → matching `plan-workspace/` paths; create `plugins/docks/skills/productivity/plan-creator/SKILL.md`; update `plugins/docks/skills/productivity/plan-manager/SKILL.md`; rename `plan-review/{SKILL.md,scripts/review-policy.mjs}` → `plan-reviewer/`; rename `plan-improver/SKILL.md` → `plan-repairer/SKILL.md`; rename `plugins/docks/agents/plan-review.md` → `plan-reviewer.md`; rename `.codex/agents/plan-review.toml` → `plan-reviewer.toml`; update manager wrappers | 3 | planned | Exactly five skill names and ownership contracts resolve. Only manager/reviewer wrappers exist. Old directories/wrappers/imports/triggers are absent from live surfaces; historical strings alone remain. |
| 5 | Migrate every live contract, trigger, import, seed, cache/guard identifier, scaffold source, and author-check key; rename the author-check key exactly to `plan-reviewer`. | `AGENTS.md`; `README.md`; `docs/plans/AGENTS.md`; `plugins/docks/README.md`; `plugins/docks/skills/AGENTS.md`; `plugins/docks/skills/{engineering/refactor,engineering/security,productivity/context-tree,productivity/multi-tool-bridge,productivity/scaffold,productivity/skill-agent-pipeline}/SKILL.md`; `plugins/effect-kit/skills/engineering/effect-ts-port/SKILL.md`; `plugins/session-relay/skills/productivity/session-relay/SKILL.md`; `docs/scaffold/spec.yaml`; `docs/scaffold/templates/{root-AGENTS.md.template,codex-plan-manager.toml.template,codex-plan-review.toml.template,codex-plan-reviewer.toml.template}`; `plugins/docks/skills/productivity/scaffold/references/spec-schema.md`; `scripts/{AGENTS.md,ci.mjs,lib/plugins.mjs,skills/transform-guard.mjs}` | 4 | planned | Scaffold bundles all five exact skills and emits only manager/reviewer wrappers; current routes are disjoint; `authorChecks` uses `plan-reviewer`; generated/live content has no stale invocation path. Do not add creator/workspace/repairer wrappers. |
| 6 | Delete `capability-tuning` and prove retained Codex-fact enforcement remains live. | delete `plugins/docks/skills/productivity/capability-tuning/{SKILL.md,references/claude-code-config.md,references/codex-config.md}`; update `README.md`, `plugins/docks/README.md`, `.claude-plugin/marketplace.json`, `plugins/docks/.claude-plugin/plugin.json`, `plugins/docks/.codex-plugin/plugin.json`, `scripts/skills/codex-facts.mjs`, `scripts/tests/plan-skill-phases.mjs` | 5 | planned | Capability tuning is absent from discovery/catalog prose. The test mutates one retained skill-agent-pipeline effort token in a temporary fixture, observes `codex-facts.mjs` fail, restores it, then observes success. No historical file is edited. |
| 7 | Finish red→green, regenerate skill hashes, run focused checks, execute the helper-owned no-progress smoke, then run targeted and one full repository gate. | Every affected path; helper-owned disposable plan under `/tmp/docks-plan-review/` only | 6 | planned | Commands in Environment pass in order; the no-progress sequence proves stopped attempt 1, one explicit attempt 2, stuck on the second failure, refusal to prepare again, and new attempt 1 only after substantive input change; `platform_denied`/`cannot_repair` stick on attempt 1 and duplicate start apply is rejected. Then `node scripts/ci.mjs --plugin docks` and one `node scripts/ci.mjs` exit 0. Any later relevant edit invalidates the affected gates. |
| 8 | Release the breaking Docks name/schema surface as `0.13.0` while keeping this plan ongoing. | `.claude-plugin/marketplace.json`; `plugins/docks/.claude-plugin/plugin.json`; `plugins/docks/.codex-plugin/plugin.json` (release-generated version/description bytes); all changed skill catalog bytes (read-only release input) | 7 | planned | `node scripts/release.mjs --plugin docks minor` synchronizes `0.12.9 → 0.13.0`, pushes without force, leaves immutable `docks--v0.13.0` at the release commit, and targeted tag CI/GitHub Release succeed. Installed Claude/Codex catalogs expose the five new names and no old live name. Pre-existing/mismatched tag, Release, manifest, or workflow identity is STOP; never clobber. |
| 9 | Prepare the implementation/release evidence for terminal manager review while this plan remains ongoing. | `docs/plans/active/plan-workflow-phases-and-loop-escape.md` (read-only handoff input); released Docks `0.13.0` artifacts (read-only evidence) | 8 | planned | Steps 1–8 evidence is read back, the immutable tag/Release and installed-catalog boundary are verified, the ordered A1–A14 inventory plus separate full-CI command is ready for a disposable completion checkout, and no lifecycle transition, completion receipt, archive, Session Relay handoff, or public-repository write has occurred. |

## Terminal lifecycle and public handoff

Only after every Steps row is `done`, the new manager performs the lifecycle
sequence outside the all-steps-done gate: commit `ongoing → in_review`, execute
A1–A14 in order plus the separately recorded full CI once in a disposable
checkout, reconcile the primary completion review, and record the schema-6
completion receipt. Only a derived `passed` receipt permits ship/archive to
`docs/plans/finished/`; any other derived result follows the state-machine STOP
rules without marking a Steps row incomplete.

Only after that archive, Session Relay may hand the pinned Docks `0.13.0`
boundary to `/home/vagrant/projects/public` for its separately created,
independently reviewed `plan-workflow-name-migration.md` and docks-kit `0.10.0`
work. No public repository byte or public lifecycle action is in this plan's
execution range, and Session Relay is transport rather than canonical review
evidence.

## Acceptance criteria

The completion runner executes these rows exactly once in order. It then runs
the separately recorded project CI command `node scripts/ci.mjs` once; that full
CI command is intentionally not duplicated in this inventory.

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-skill-phases.mjs` | Exit 0; five exact skills and public/internal flags, disjoint triggers, wrapper limits, clean old-name removal, guard mutation, and no-progress behavior pass. |
| A2 | `node scripts/tests/plan-review-policy.mjs --case surfaces` | Exit 0; the exact v5/v6 record, schema-filename, full/repair manifest, receipt/reuse, and lifecycle matrix passes; every v5 schema/manifest fixture remains byte-identical. |
| A3 | `node scripts/tests/plan-review-convergence-repair.mjs --case repair-series` | Exit 0; one full plus at most one repair round remains bounded inside one orchestration series, state hashes bind the transition, and the total outcome-to-stop reducer produces the required attempt-1/attempt-2 states. |
| A4 | `node scripts/tests/plan-review-convergence-repair.mjs --case repair-artifacts` | Exit 0; schema-6 Codex and Claude output validation traverses full and repair bundle/collector paths with the exact v6 manifests; prior-plan bytes, accepted targets, and orchestration-state identities verify. |
| A5 | `node scripts/tests/plan-review-policy-regressions.mjs --self-test` | Exit 0; one mutant per attempt/raw/collector mapping class and fallback precedence, plus attempt 3, nonretryable renewal, duplicate apply, state-hash substitution, and metadata-only progress, is killed; schemas 1–5 remain byte-identical. |
| A6 | `node scripts/skills/codex-facts.mjs` | Exit 0 and reports retained `skill-agent-pipeline` Codex facts; no capability-tuning dependency remains. |
| A7 | `node scripts/skills/content-hash.mjs --check-only` | Exit 0; every changed skill has a generated current content hash and updated metadata. |
| A8 | `node scripts/scaffold/guard-spec.mjs && node scripts/scaffold/test.mjs` | Exit 0; scaffold bundles all five skill names and only manager/reviewer wrappers with no stale seed path. |
| A9 | `node scripts/ci.mjs --plugin docks` | Exit 0; focused Docks author checks, including author-check key `plan-reviewer`, pass before the full gate. |
| A10 | `node scripts/release.mjs --dry-run --plugin docks minor` | Exit 0 without mutation and resolves the synchronized next Docks version as `0.13.0`. |
| A11 | `git ls-remote --tags origin refs/tags/docks--v0.13.0` | Exactly one 40-hex object resolves to the recorded canonical Docks release commit. |
| A12 | `gh release view docks--v0.13.0 --repo DocksDocks/docks --json tagName,isDraft,isPrerelease,targetCommitish` | Exit 0; tag is `docks--v0.13.0`, not draft/prerelease, and release identity matches the immutable release commit. |
| A13 | `node scripts/tests/plan-skill-phases.mjs --case installed-catalogs --version 0.13.0` | Exit 0; fresh Claude/Codex installed catalogs expose only `plan-workspace`, `plan-creator`, `plan-manager`, `plan-reviewer`, and `plan-repairer`; no old live identifier resolves. |
| A14 | `git -C /home/vagrant/projects/public status --short` | Exit 0 with no output at the Docks completion boundary; public migration is a later separately reviewed `plan-workflow-name-migration.md`, not a Docks worktree edit. |

## Out of scope / do-NOT-touch

- Do not edit any file under `docs/plans/finished/`, including historical old
  skill attribution strings, fixed bundle/hash fixtures, or receipt bytes.
- Do not rewrite `scripts/tests/fixtures/plan-review-policy/sample-plan.md` to
  make current tests pass. Historical schemas 1–5 dispatch through their
  existing branches and fixtures byte-unchanged.
- Do not implement correlation, `send --await`, `relay wait`, delivery outcomes,
  or worker-result protocol work; it remains under
  `session-relay-correlated-messaging-and-worker-results`.
- Do not change Session Relay publication/promotion/finalization semantics. The
  two live helper imports are renamed only because the review helper moves.
- Do not edit `/home/vagrant/projects/public` from this worktree, create its
  `cli-v0.10.0` tag/Release, or mark its future plan reviewed. Session Relay
  transports the later request; it never supplies canonical review evidence.
- Do not leave compatibility aliases, deprecated re-exports, forwarding wrapper
  files, or extra Claude/Codex wrappers. Historical persisted strings are not
  live aliases and remain untouched.
- Do not refresh `capability-tuning`, copy its volatile facts elsewhere, or
  weaken `skill-agent-pipeline` fact checks.
- Do not add elapsed-time semantics. Deadlines remain transport backstops; only
  validated outcomes and attempt counters control renewal.

## Known gotchas

- `round_index` counts full/repair rounds within one series;
  `orchestration_attempt` counts fresh same-input series. Both are `1|2`, but
  they are independent and must never share one counter.
- Availability candidate fallback happens inside an attempt. It is not the
  explicit current-user retry and must not increment `orchestration_attempt`.
- Lifecycle metadata, receipts, and the orchestration record are excluded from
  the substantive input hash. Treating their writes as progress recreates the
  loop this plan removes.
- The orchestration line is excluded only after closed validation. Excluding an
  arbitrary prefix before validation creates a review-input bypass.
- Settle and intent consumption are separate transitions. A passed settled
  series has `pending` only for an eligible executing intent; intent `none`
  remains `none` with no transition.
- A stale or expected lifecycle-precondition rejection is evidence, not an
  exception to retry around. Persist the derived terminal state and return
  `NeedsUserAction`.
- Renames touch cache/import/fixture assertions across Docks, Session Relay, and
  Effect Kit. Old strings in historical fixtures may be correct while the same
  string in a live import is a defect; never use a broad textual replacement.
- Plugin Claude agents and repo-local Codex agents are distinct surfaces. Only
  manager/reviewer exist in either wrapper family.
- `scripts/release.mjs --plugin docks minor` performs the version write/release;
  do not hand-edit a divergent version before invoking it.
- Active-plan multi-occupancy means the unrelated stopped/in-review Session
  Relay lifecycle cannot be used as a reason to block creation, review, or later
  execution once this plan's explicit release prerequisite is met.

## Global constraints

- "This is the old workflow's final creation operation: one initial series, at
  most its existing repair round, and no fresh series after a terminal result."
- "Write failing tests before production changes."
- "Do not broad-replace historical schema constants."
- "Persist exactly one unfenced `Review-orchestration-state: <compact JCS>`
  line."
- "No elapsed-time threshold is semantic; timeouts are transport backstops."
- "Delete old directories, wrappers, names, imports, and trigger claims. Do not
  leave aliases or re-exports."
- "Scaffold's bundled skill set must contain all five exact names; only
  manager/reviewer need dispatch wrappers."
- "Preserve historical schemas, fixed schema-3 bundle/hash fixtures, and every
  file under `docs/plans/finished/` byte-for-byte."
- "Bump `metadata.updated` on each changed skill and run
  `node scripts/skills/content-hash.mjs --backfill`; never hand-write hashes."
- "Capability tuning is deleted, not refreshed."
- "Names are a clean cutover."
- "The 0.x public wrapper change is breaking, so docks-kit advances to
  `0.10.0`, not `0.9.1`."

## STOP conditions

- STOP before any implementation edit unless Session Relay `0.12.0` is stable,
  its release plan has passed/finished evidence, and this plan has both the
  eligible schema-5 draft receipt and required start/identity commits.
- STOP if the current old plan-manager cannot represent or review this complete
  cold handoff; do not shorten the contract or start implementation.
- STOP on every derived `stopped|stuck` result. Only attempt-1
  `unavailable_auth|unavailable_model|timed_out|unavailable_unknown|failed_unparseable`
  may accept one explicit current-user retry; every other `StopReason` and every
  attempt-2 failure is nonrenewable and must never auto-prepare another series.
- STOP if a red test does not fail for the intended absent schema/state/phase
  behavior, or if production code changes precede the recorded red evidence.
- STOP if any schemas 1–5 validation result, fixed schema-3 fixture/hash, or
  `docs/plans/finished/` byte changes.
- STOP if a live old invocation/import/wrapper survives, or if removing it
  requires editing historical bytes. Report the exact classification instead
  of broad-replacing.
- STOP if attempt 3, a second retry authorization, nonretryable renewal,
  orchestration-state substitution, duplicate intent consumption, or
  metadata-only progress is accepted.
- STOP if a state/series/receipt hash mismatch, duplicate machine record, stale
  committed state, or malformed lifecycle input would otherwise mutate a plan.
- STOP if the retained Codex-fact mutation does not make the guard fail.
- STOP on any focused or full gate failure; after a relevant edit, rerun from
  the earliest invalidated rung.
- STOP if `docks--v0.13.0` or its GitHub Release exists with a mismatched commit,
  state, or manifest, or if release would require force/clobber.
- STOP if Docks completion would write the public repository directly or treat
  Session Relay as canonical review evidence.

## Cold-handoff checklist

1. **File manifest — present & specific.** Frontmatter enumerates every old/new
   skill, wrapper, helper, contract, scaffold, guard, manifest, and test path;
   each step names its exact subset.
2. **Environment & commands — present & specific.** Repository, runtime,
   setup, focused gates, full CI, release, and remote verification commands are
   explicit.
3. **Interface & data contracts — present & specific.** Closed orchestration
   state, retry authorization, schema-6 bindings, pure functions, lifecycle
   results, create result, and terminal handoff are defined.
4. **Executable acceptance — present & specific.** A1–A14 are ordered commands
   with observable expected results; project CI is separately recorded for the
   completion runner.
5. **Out of scope — present & specific.** Historical bytes, unrelated relay
   protocol work, public-repository writes, compatibility aliases, and guard
   weakening are prohibited.
6. **Decision rationale — present & specific.** Persisted attempt state replaces
   renewable caller state; clean ownership names and capability deletion are
   justified.
7. **Known gotchas — present & specific.** Independent counters, fallback vs
   retry, canonical hashing, settle/consume, wrapper families, and rename traps
   are called out.
8. **Global constraints verbatim — present & specific.** Exact limits, names,
   deletion, fixture preservation, hash generation, and release boundary are
   copied above.
9. **No undefined terms / forward refs — present & specific.** Every type,
   result, phase, intent group, status, command, and later public boundary used
   by a step is defined in this file.

Adversarial cold-read result: a fresh executor can determine the precondition,
red/green order, exact write set, data/state invariants, terminal outcomes,
release gate, and cross-repository stopping boundary without conversation
context. No unresolved decision remains.

## Self-review
Review-receipt: {"input_sha256":"8ff8afc43cef79622bf3320a1630d8c635c1c55872a405da6f4cfcf614474dce","outcome":"passed","phase":"draft","policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"0793f3ba7b5ba2bc4a8bebfd95a52b1e872c6d8d5cd8d5b190a30caf2e8575d4","diff_sha256":null,"execution_base_commit":null,"input_sha256":"8ff8afc43cef79622bf3320a1630d8c635c1c55872a405da6f4cfcf614474dce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"67486ad79105c145c9a0b3988909a812f6b46129dec981190a744ca41d7e3d54","repair_targets_sha256":"b311e008c10e785a808e569b7ceb89d38a8d2e29be08586ba1b17eaf5acbcb47","request_id":"48a2fc29-5733-4b98-b0ba-5e85a0402aed","review_mode":"repair","reviewed_commit_or_head":"cff6f27749a11151c98577d94da5c0c8ad2d57d2","round_index":2,"schema":5},"reviewed_at":"2026-07-19T04:18:19-03:00","reviewed_commit":"cff6f27749a11151c98577d94da5c0c8ad2d57d2","reviewer":{"accepted_finding_ids":[],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"WorkflowCutoverRepairReview","denial_source":null,"exit_code":0,"output_started":true,"reason":"schema-5 primary repair reviewer returned valid structured output","result":"passed","schema":5,"signal":null,"started":true,"stderr_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","stdout_sha256":"bcc27b46151ada15108b7f7fffe0b08eb2417cc798730dd3df67f6f1b485572a","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"0793f3ba7b5ba2bc4a8bebfd95a52b1e872c6d8d5cd8d5b190a30caf2e8575d4","diff_sha256":null,"execution_base_commit":null,"input_sha256":"8ff8afc43cef79622bf3320a1630d8c635c1c55872a405da6f4cfcf614474dce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"67486ad79105c145c9a0b3988909a812f6b46129dec981190a744ca41d7e3d54","repair_targets_sha256":"b311e008c10e785a808e569b7ceb89d38a8d2e29be08586ba1b17eaf5acbcb47","request_id":"48a2fc29-5733-4b98-b0ba-5e85a0402aed","review_mode":"repair","reviewed_commit_or_head":"cff6f27749a11151c98577d94da5c0c8ad2d57d2","round_index":2,"schema":5},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"P2 is addressed at plan.review.md lines 183-188 with exact v5/v6 full/repair record, structured-output filename, manifest schema, review_schema, and reviewer_schemas values; lines 207-217 require separate v6 builders/validators, both Codex and Claude collector traversal, cross-pair rejection, and unchanged schema-1-through-5 bytes.","status":"pass"},"dependency_order":{"evidence":"P1 is addressed by Step 9 at plan.review.md line 343, whose done condition stops before lifecycle work, followed by the external terminal sequence at lines 345-359: all rows finish first, then in_review/completion/receipt/archive, then the Session Relay public handoff.","status":"pass"},"evidence_reverification":{"evidence":"The sealed bundle reverified at SHA-256 0793f3ba7b5ba2bc4a8bebfd95a52b1e872c6d8d5cd8d5b190a30caf2e8575d4. Manifest schema 4/review_schema 5, request round 2 hashes, previous/current plan hashes, repair-target hash, reviewed commit, and accepted IDs P1/P2/P3 all match the exact handoff and repair-targets.json.","status":"pass"},"executable_acceptance":{"evidence":"Plan acceptance rows A2-A5 at lines 371-374 separately verify the exact v5/v6 surface matrix and byte-identical v5 artifacts, total reducer states, Codex/Claude full-and-repair collector paths with exact manifests, and one killed mutant per mapping/precedence class plus retry/apply invariants.","status":"pass"},"failure_modes":{"evidence":"P3 is addressed at plan.review.md lines 136-143 and 271-329: the closed StopReason union and ordered reducer cover stale input, repair rejection, exhausted auth/model/tool fallback with precedence, deadline, transport, process/output failure, platform denial, collector ineligibility, and lifecycle apply rejection, then map every result at attempts 1 and 2 with settled-state, apply, and retry invariants.","status":"pass"},"goal_coverage":{"evidence":"The current plan directly covers all and only the accepted repair targets: terminal lifecycle sequencing for P1, complete v6 transport/schema/manifest compatibility for P2, and total outcome-to-stop derivation plus retry/apply invariants for P3; the diff introduces no unrelated repair scope.","status":"pass"},"open_questions":{"evidence":"No P1-P3 execution decision remains open: lifecycle placement and ordering are explicit, all v5/v6 transport and manifest values are fixed, and outcome precedence, malformed-evidence behavior, retry eligibility, attempt exhaustion, and apply-state transitions are closed.","status":"pass"},"standalone_executability":{"evidence":"The sealed previous/current diff is confined to P1-P3 and makes each repair executable: current plan.review.md lines 343-360 removes completion/archive/handoff from the all-steps-done table, lines 180-217 closes the v6 review transport graph, and lines 266-329 defines the outcome reducer and state invariants.","status":"pass"}},"findings":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"0793f3ba7b5ba2bc4a8bebfd95a52b1e872c6d8d5cd8d5b190a30caf2e8575d4","diff_sha256":null,"execution_base_commit":null,"input_sha256":"8ff8afc43cef79622bf3320a1630d8c635c1c55872a405da6f4cfcf614474dce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"67486ad79105c145c9a0b3988909a812f6b46129dec981190a744ca41d7e3d54","repair_targets_sha256":"b311e008c10e785a808e569b7ceb89d38a8d2e29be08586ba1b17eaf5acbcb47","request_id":"48a2fc29-5733-4b98-b0ba-5e85a0402aed","review_mode":"repair","reviewed_commit_or_head":"cff6f27749a11151c98577d94da5c0c8ad2d57d2","round_index":2,"schema":5},"role":"primary","schema":5,"verdict":"pass"},"role":"primary","schema":5,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":5,"series":{"current_input_sha256":"8ff8afc43cef79622bf3320a1630d8c635c1c55872a405da6f4cfcf614474dce","initial_input_sha256":"67486ad79105c145c9a0b3988909a812f6b46129dec981190a744ca41d7e3d54","policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","repairs":[{"accepted_finding_ids":["P1","P2","P3"],"current_input_sha256":"8ff8afc43cef79622bf3320a1630d8c635c1c55872a405da6f4cfcf614474dce","from_round_index":1,"previous_input_sha256":"67486ad79105c145c9a0b3988909a812f6b46129dec981190a744ca41d7e3d54","repair_targets_sha256":"b311e008c10e785a808e569b7ceb89d38a8d2e29be08586ba1b17eaf5acbcb47","schema":5,"targets":[{"criterion":"dependency_order","defect":"Step 9 is impossible to complete under the plan lifecycle it invokes. Its done condition requires the new manager to enter in_review, execute completion review, record the receipt, and archive the plan, but the lifecycle contract permits Steps complete → review only when every Steps row is already done. Step 9 therefore must be done before the operation that makes Step 9 done, so the plan cannot legally reach completion or the subsequent public handoff.","evidence":"plan.review.md Step 9 says the new manager commits in_review, records a schema-6 completion receipt, and archives this plan as that row's completion. The sealed docs/plans/AGENTS.md transition table states: “When every ## Steps row is done: status: in_review” and allows Ship only after the passed completion receipt.","fix":"End the executable Steps table with an implementation/release-readiness row whose done state is attainable while the plan is ongoing. Move manager completion review, ship/archive, and the post-archive Session Relay public handoff into an explicit terminal lifecycle/handoff section outside the rows gated by all-steps-done (or into a separately executable follow-on plan), with the public repository remaining outside this execution range.","id":"P1","locator":"Step 9 (line 270) and sealed docs/plans/AGENTS.md Lifecycle transitions lines 411-414","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"01809455e6d4633d1a8f045ad12cbb60313b5a56376e8947f2e14915891c76dc","exit_code":null,"method":"read"},"section":"Steps / lifecycle completion","source":"primary","status":"blocking_gap"},{"criterion":"actionability","defect":"The schema-6 cutover does not close the reviewer transport and persistence record graph. It names request, run, series, transition, bundle, receipt, completion, and lifecycle branches, but does not specify schema-6 ReviewerOutput or raw-review envelopes, the structured-output schema filename, or the full/repair manifest schema and review_schema values. Those records embed the request, so leaving them at schema 5 would either reject schema-6 requests or silently change historical schema-5 semantics, contrary to the byte-preservation requirement.","evidence":"The sealed helper hard-codes output.schema === 5 in validateCurrentReviewerOutput (lines 1179-1182), raw.schema === 5 in validateCurrentRawReview (lines 1287-1290), reviewer-output.primary.v5.schema.json in bundle/workspace/argv paths (lines 3042-3044, 3121-3122, 3282-3284, 3358), and review_schema === 5 for current manifests. The plan supplies no replacement contract for these schema-6 request consumers.","fix":"Add an explicit schema-version matrix for every current record that embeds or validates a request: reviewer output/schema file, raw review, run, repair transition, series, receipts, full/repair manifests, dispatch/collector paths, and reuse. Give schema-6 files and manifest values exact names/numbers, keep every schema-5 builder/validator/schema byte unchanged, and add red/green coverage that a v6 request traverses Codex and Claude output validation plus full and repair collection while v5 fixtures remain byte-identical.","id":"P2","locator":"lines 169-191 and Step 3 line 264","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"779a565b0920a1ecf34b47b94fe530c55be05fd7b61b3938c0d340c409eebe4f","exit_code":null,"method":"read"},"section":"Interfaces & data shapes / Schema-6 review bindings","source":"primary","status":"blocking_gap"},{"criterion":"failure_modes","defect":"The two-attempt stop rule is not a total derivation from validated evidence. The plan introduces unavailable_auth, unavailable_model, timed_out, unavailable_unknown, failed_unparseable, not_ready, and other stop reasons, but never maps the existing attempt/raw outcomes to them or defines precedence after candidate exhaustion. The purported closed state also shows stop_reason only as null, unlike its explicit unions for status and apply_state. Different implementers can therefore classify the same failed series as retryable stopped or nonretryable stuck.","evidence":"The plan table (lines 244-248) starts from already-normalized reason names. The sealed helper instead validates attempt results passed, platform_denied, auth_failed, model_unavailable, tool_unavailable, deadline_exceeded, transient_transport, nonzero_exit, signaled, and output_invalid (lines 1198-1240), then reduces raw review to passed/unavailable/failed/waived (lines 1287-1321). No plan text connects these domains, and ReviewOrchestrationStateV1 lists stop_reason:null.","fix":"Define a closed StopReason union and a total mapping, with precedence, from every validated attempt/raw/collector outcome to status and stop_reason for attempt 1 and attempt 2. Include auth_failed, model_unavailable, tool_unavailable, deadline_exceeded, transient_transport, nonzero_exit, signaled, output_invalid, platform_denied, stale input, repair failure, and lifecycle rejection; specify exhausted-fallback aggregation and state/apply/retry invariants, then kill one mutant per mapping class.","id":"P3","locator":"lines 114-168 and 240-256","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"4279aabd69501d655b9d58b94b49eb2985f788dce444fac67587c35d18d413da","exit_code":null,"method":"read"},"section":"Persisted orchestration state / State-machine result rules","source":"primary","status":"blocking_gap"}]}],"rounds":[{"kind":"draft","outcome":"not_ready","pre_execution_eligible":false,"reproduced":[{"id":"P1","reproduction":{"command":null,"evidence_sha256":"01809455e6d4633d1a8f045ad12cbb60313b5a56376e8947f2e14915891c76dc","exit_code":null,"method":"read"}},{"id":"P2","reproduction":{"command":null,"evidence_sha256":"779a565b0920a1ecf34b47b94fe530c55be05fd7b61b3938c0d340c409eebe4f","exit_code":null,"method":"read"}},{"id":"P3","reproduction":{"command":null,"evidence_sha256":"4279aabd69501d655b9d58b94b49eb2985f788dce444fac67587c35d18d413da","exit_code":null,"method":"read"}}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"d132cc199e9913d06a1f54d2e80da1c3c85749123a418f410110049aa7567003","diff_sha256":null,"execution_base_commit":null,"input_sha256":"67486ad79105c145c9a0b3988909a812f6b46129dec981190a744ca41d7e3d54","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"8a9036a3-3df6-42b5-91b4-0f23a71424a2","review_mode":"full","reviewed_commit_or_head":"a787d7820f33543620ec941b28fa84fc28b56e3d","round_index":1,"schema":5},"reviewer":{"accepted_finding_ids":["P1","P2","P3"],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"WorkflowCutoverDraftReview","denial_source":null,"exit_code":0,"output_started":true,"reason":"schema-5 primary reviewer returned valid structured output","result":"passed","schema":5,"signal":null,"started":true,"stderr_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","stdout_sha256":"f993ea48e6a0fb3338e7ea81f313b5ef4538782cee801397de2b4bb968323d53","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"765ffe99602f89aca09d6d3136f9d030f3f9ba77fb6df93fc053cf3cb250895b","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"d132cc199e9913d06a1f54d2e80da1c3c85749123a418f410110049aa7567003","diff_sha256":null,"execution_base_commit":null,"input_sha256":"67486ad79105c145c9a0b3988909a812f6b46129dec981190a744ca41d7e3d54","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"8a9036a3-3df6-42b5-91b4-0f23a71424a2","review_mode":"full","reviewed_commit_or_head":"a787d7820f33543620ec941b28fa84fc28b56e3d","round_index":1,"schema":5},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"The Schema-6 review bindings section and Step 3 do not define the versioned reviewer-output/raw-review/bundle-schema path needed to carry a schema-6 request while preserving schema-5 bytes; finding P2 identifies the hard-coded sealed-source contracts.","status":"blocking_gap"},"dependency_order":{"evidence":"Step 9 makes completion review and archive its own done condition, while the sealed docs/plans lifecycle contract permits entry to in_review only after every Steps row is already done; finding P1 is a circular prerequisite.","status":"blocking_gap"},"evidence_reverification":{"evidence":"Step 1 rechecks Session Relay 0.12.0, passed/finished evidence, draft receipt, start commit, and execution-base identity before edits; later steps require red evidence, read-back persistence, focused gates after invalidation, one full CI run, immutable tag/Release checks, and completion review from a disposable checkout.","status":"pass"},"executable_acceptance":{"evidence":"A1-A14 are ordered, command-bearing checks with observable exit/output expectations for phase names and wrappers, schema/state and repair bindings, no-progress mutants, capability deletion, hashes, scaffold, targeted CI, release identity, installed catalogs, and the untouched public worktree; full node scripts/ci.mjs is separately required exactly once.","status":"pass"},"failure_modes":{"evidence":"The plan has extensive STOP conditions, but its terminal state machine cannot be implemented deterministically because it does not map the existing validated collector/attempt outcomes to the new stop-reason classes and its closed state does not define the stop_reason union; finding P3 details the gap.","status":"blocking_gap"},"goal_coverage":{"evidence":"The plan covers the five exact skills (plan-workspace, plan-creator, plan-manager, plan-reviewer, plan-repairer), manager/reviewer-only wrapper families, schema-6 orchestration, two same-input attempts, historical preservation, capability-tuning deletion with retained Codex-fact mutation proof, Docks 0.13.0, and the later public docks-kit 0.10.0 boundary.","status":"pass"},"open_questions":{"evidence":"No product or user-policy choice is intentionally deferred: limits, skill names, wrapper ownership, clean-cutover policy, release versions, and public handoff ownership are fixed. The omitted record and failure mappings are specification defects captured as blockers, not questions requiring user preference.","status":"pass"},"standalone_executability":{"evidence":"The plan supplies repository/runtime/setup details, exact affected paths, closed phase ownership, state shapes, ordered steps, commands, release prerequisites, and a public-repository boundary; the execution-order defect is recorded under dependency_order rather than treated as missing ambient context.","status":"pass"}},"findings":[{"criterion":"dependency_order","defect":"Step 9 is impossible to complete under the plan lifecycle it invokes. Its done condition requires the new manager to enter in_review, execute completion review, record the receipt, and archive the plan, but the lifecycle contract permits Steps complete → review only when every Steps row is already done. Step 9 therefore must be done before the operation that makes Step 9 done, so the plan cannot legally reach completion or the subsequent public handoff.","evidence":"plan.review.md Step 9 says the new manager commits in_review, records a schema-6 completion receipt, and archives this plan as that row's completion. The sealed docs/plans/AGENTS.md transition table states: “When every ## Steps row is done: status: in_review” and allows Ship only after the passed completion receipt.","fix":"End the executable Steps table with an implementation/release-readiness row whose done state is attainable while the plan is ongoing. Move manager completion review, ship/archive, and the post-archive Session Relay public handoff into an explicit terminal lifecycle/handoff section outside the rows gated by all-steps-done (or into a separately executable follow-on plan), with the public repository remaining outside this execution range.","id":"P1","locator":"Step 9 (line 270) and sealed docs/plans/AGENTS.md Lifecycle transitions lines 411-414","path":"plan.review.md","section":"Steps / lifecycle completion","status":"blocking_gap"},{"criterion":"actionability","defect":"The schema-6 cutover does not close the reviewer transport and persistence record graph. It names request, run, series, transition, bundle, receipt, completion, and lifecycle branches, but does not specify schema-6 ReviewerOutput or raw-review envelopes, the structured-output schema filename, or the full/repair manifest schema and review_schema values. Those records embed the request, so leaving them at schema 5 would either reject schema-6 requests or silently change historical schema-5 semantics, contrary to the byte-preservation requirement.","evidence":"The sealed helper hard-codes output.schema === 5 in validateCurrentReviewerOutput (lines 1179-1182), raw.schema === 5 in validateCurrentRawReview (lines 1287-1290), reviewer-output.primary.v5.schema.json in bundle/workspace/argv paths (lines 3042-3044, 3121-3122, 3282-3284, 3358), and review_schema === 5 for current manifests. The plan supplies no replacement contract for these schema-6 request consumers.","fix":"Add an explicit schema-version matrix for every current record that embeds or validates a request: reviewer output/schema file, raw review, run, repair transition, series, receipts, full/repair manifests, dispatch/collector paths, and reuse. Give schema-6 files and manifest values exact names/numbers, keep every schema-5 builder/validator/schema byte unchanged, and add red/green coverage that a v6 request traverses Codex and Claude output validation plus full and repair collection while v5 fixtures remain byte-identical.","id":"P2","locator":"lines 169-191 and Step 3 line 264","path":"plan.review.md","section":"Interfaces & data shapes / Schema-6 review bindings","status":"blocking_gap"},{"criterion":"failure_modes","defect":"The two-attempt stop rule is not a total derivation from validated evidence. The plan introduces unavailable_auth, unavailable_model, timed_out, unavailable_unknown, failed_unparseable, not_ready, and other stop reasons, but never maps the existing attempt/raw outcomes to them or defines precedence after candidate exhaustion. The purported closed state also shows stop_reason only as null, unlike its explicit unions for status and apply_state. Different implementers can therefore classify the same failed series as retryable stopped or nonretryable stuck.","evidence":"The plan table (lines 244-248) starts from already-normalized reason names. The sealed helper instead validates attempt results passed, platform_denied, auth_failed, model_unavailable, tool_unavailable, deadline_exceeded, transient_transport, nonzero_exit, signaled, and output_invalid (lines 1198-1240), then reduces raw review to passed/unavailable/failed/waived (lines 1287-1321). No plan text connects these domains, and ReviewOrchestrationStateV1 lists stop_reason:null.","fix":"Define a closed StopReason union and a total mapping, with precedence, from every validated attempt/raw/collector outcome to status and stop_reason for attempt 1 and attempt 2. Include auth_failed, model_unavailable, tool_unavailable, deadline_exceeded, transient_transport, nonzero_exit, signaled, output_invalid, platform_denied, stale input, repair failure, and lifecycle rejection; specify exhausted-fallback aggregation and state/apply/retry invariants, then kill one mutant per mapping class.","id":"P3","locator":"lines 114-168 and 240-256","path":"plan.review.md","section":"Persisted orchestration state / State-machine result rules","status":"blocking_gap"}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"d132cc199e9913d06a1f54d2e80da1c3c85749123a418f410110049aa7567003","diff_sha256":null,"execution_base_commit":null,"input_sha256":"67486ad79105c145c9a0b3988909a812f6b46129dec981190a744ca41d7e3d54","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"8a9036a3-3df6-42b5-91b4-0f23a71424a2","review_mode":"full","reviewed_commit_or_head":"a787d7820f33543620ec941b28fa84fc28b56e3d","round_index":1,"schema":5},"role":"primary","schema":5,"verdict":"blocking_gap"},"role":"primary","schema":5,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":5},{"kind":"draft","outcome":"passed","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"0793f3ba7b5ba2bc4a8bebfd95a52b1e872c6d8d5cd8d5b190a30caf2e8575d4","diff_sha256":null,"execution_base_commit":null,"input_sha256":"8ff8afc43cef79622bf3320a1630d8c635c1c55872a405da6f4cfcf614474dce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"67486ad79105c145c9a0b3988909a812f6b46129dec981190a744ca41d7e3d54","repair_targets_sha256":"b311e008c10e785a808e569b7ceb89d38a8d2e29be08586ba1b17eaf5acbcb47","request_id":"48a2fc29-5733-4b98-b0ba-5e85a0402aed","review_mode":"repair","reviewed_commit_or_head":"cff6f27749a11151c98577d94da5c0c8ad2d57d2","round_index":2,"schema":5},"reviewer":{"accepted_finding_ids":[],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"WorkflowCutoverRepairReview","denial_source":null,"exit_code":0,"output_started":true,"reason":"schema-5 primary repair reviewer returned valid structured output","result":"passed","schema":5,"signal":null,"started":true,"stderr_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","stdout_sha256":"bcc27b46151ada15108b7f7fffe0b08eb2417cc798730dd3df67f6f1b485572a","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"0793f3ba7b5ba2bc4a8bebfd95a52b1e872c6d8d5cd8d5b190a30caf2e8575d4","diff_sha256":null,"execution_base_commit":null,"input_sha256":"8ff8afc43cef79622bf3320a1630d8c635c1c55872a405da6f4cfcf614474dce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"67486ad79105c145c9a0b3988909a812f6b46129dec981190a744ca41d7e3d54","repair_targets_sha256":"b311e008c10e785a808e569b7ceb89d38a8d2e29be08586ba1b17eaf5acbcb47","request_id":"48a2fc29-5733-4b98-b0ba-5e85a0402aed","review_mode":"repair","reviewed_commit_or_head":"cff6f27749a11151c98577d94da5c0c8ad2d57d2","round_index":2,"schema":5},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"P2 is addressed at plan.review.md lines 183-188 with exact v5/v6 full/repair record, structured-output filename, manifest schema, review_schema, and reviewer_schemas values; lines 207-217 require separate v6 builders/validators, both Codex and Claude collector traversal, cross-pair rejection, and unchanged schema-1-through-5 bytes.","status":"pass"},"dependency_order":{"evidence":"P1 is addressed by Step 9 at plan.review.md line 343, whose done condition stops before lifecycle work, followed by the external terminal sequence at lines 345-359: all rows finish first, then in_review/completion/receipt/archive, then the Session Relay public handoff.","status":"pass"},"evidence_reverification":{"evidence":"The sealed bundle reverified at SHA-256 0793f3ba7b5ba2bc4a8bebfd95a52b1e872c6d8d5cd8d5b190a30caf2e8575d4. Manifest schema 4/review_schema 5, request round 2 hashes, previous/current plan hashes, repair-target hash, reviewed commit, and accepted IDs P1/P2/P3 all match the exact handoff and repair-targets.json.","status":"pass"},"executable_acceptance":{"evidence":"Plan acceptance rows A2-A5 at lines 371-374 separately verify the exact v5/v6 surface matrix and byte-identical v5 artifacts, total reducer states, Codex/Claude full-and-repair collector paths with exact manifests, and one killed mutant per mapping/precedence class plus retry/apply invariants.","status":"pass"},"failure_modes":{"evidence":"P3 is addressed at plan.review.md lines 136-143 and 271-329: the closed StopReason union and ordered reducer cover stale input, repair rejection, exhausted auth/model/tool fallback with precedence, deadline, transport, process/output failure, platform denial, collector ineligibility, and lifecycle apply rejection, then map every result at attempts 1 and 2 with settled-state, apply, and retry invariants.","status":"pass"},"goal_coverage":{"evidence":"The current plan directly covers all and only the accepted repair targets: terminal lifecycle sequencing for P1, complete v6 transport/schema/manifest compatibility for P2, and total outcome-to-stop derivation plus retry/apply invariants for P3; the diff introduces no unrelated repair scope.","status":"pass"},"open_questions":{"evidence":"No P1-P3 execution decision remains open: lifecycle placement and ordering are explicit, all v5/v6 transport and manifest values are fixed, and outcome precedence, malformed-evidence behavior, retry eligibility, attempt exhaustion, and apply-state transitions are closed.","status":"pass"},"standalone_executability":{"evidence":"The sealed previous/current diff is confined to P1-P3 and makes each repair executable: current plan.review.md lines 343-360 removes completion/archive/handoff from the all-steps-done table, lines 180-217 closes the v6 review transport graph, and lines 266-329 defines the outcome reducer and state invariants.","status":"pass"}},"findings":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"0793f3ba7b5ba2bc4a8bebfd95a52b1e872c6d8d5cd8d5b190a30caf2e8575d4","diff_sha256":null,"execution_base_commit":null,"input_sha256":"8ff8afc43cef79622bf3320a1630d8c635c1c55872a405da6f4cfcf614474dce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"67486ad79105c145c9a0b3988909a812f6b46129dec981190a744ca41d7e3d54","repair_targets_sha256":"b311e008c10e785a808e569b7ceb89d38a8d2e29be08586ba1b17eaf5acbcb47","request_id":"48a2fc29-5733-4b98-b0ba-5e85a0402aed","review_mode":"repair","reviewed_commit_or_head":"cff6f27749a11151c98577d94da5c0c8ad2d57d2","round_index":2,"schema":5},"role":"primary","schema":5,"verdict":"pass"},"role":"primary","schema":5,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":5}],"schema":5}}

Checked `standalone_executability`, `actionability`, `dependency_order`,
`evidence_reverification`, `goal_coverage`, `executable_acceptance`,
`failure_modes`, and `open_questions` once. The pass caught and fixed four gaps:
(1) separated orchestration attempts from repair rounds; (2) added live
cross-plugin helper imports and old/new rename tombstones to the manifest; (3)
made the wrapper decision explicit—manager/reviewer only; and (4) separated
Docks completion from the later public `0.10.0` execution boundary. There are no
open questions and no N/A checklist shortcuts.

## Review

*(filled by main-context plan-manager after completion evidence)*

## Sources

- `local://session-relay-release-recovery-plan.md:221-325` — approved Step 9
  schema-6 state machine, clean five-skill rename inventory, capability deletion,
  tests/gates, Docks `0.13.0`, and Step 10 public `0.10.0` boundary.
- `local://session-relay-release-recovery-plan.md:327-387` — critical paths,
  executable verification, no-progress smoke, release acceptance, contingencies,
  and fixed rationale.
- `docs/plans/AGENTS.md:50-201` — frontmatter, cold-handoff spine, ordered
  executable acceptance, binary checklist, and local self-review contract.
- `docs/plans/AGENTS.md:203-288` — current schema-5 single-primary review and
  historical validation-preservation requirements used for this final old-flow
  creation/review.
- `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs:13-30`
  — current excluded-frontmatter/machine-record and live helper-path anchors.
- `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs:3383-3390`
  — current caller-trusted `intentUsed` lifecycle function that schema 6
  replaces.
- `scripts/skills/codex-facts.mjs:2-16` — live capability-tuning coupling and
  retained `skill-agent-pipeline` fact source.
- `docs/scaffold/spec.yaml:15-39` — current wrapper templates, plan-init seed,
  and bundled plan skills to migrate.
- `scripts/ci.mjs:96-170` and `scripts/lib/plugins.mjs:52-55` — current
  `plan-review` author-check key and focused policy gate wiring.

## Notes

- Active multi-occupancy is intentional. The separate correlated-messaging plan
  remains blocked and untouched; the Session Relay release plan's terminal
  schema-5 STOP does not invalidate this plan's creation or draft review.
- Attempt-counter limits are project policy informed by vendor guidance on
  maximum iterations and blocker checkpoints; the exact two-attempt rule and
  substantive-input fingerprint are Docks decisions, not vendor-prescribed
  values.
