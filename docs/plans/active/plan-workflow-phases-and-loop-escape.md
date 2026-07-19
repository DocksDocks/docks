---
title: Cut over plan workflow to schema 6 and explicit phases
goal: Persist bounded review attempts, split the five plan phases cleanly, remove capability tuning, release Docks 0.13.0, and hand public its 0.10 boundary.
status: ongoing
created: "2026-07-19T03:36:13-03:00"
updated: "2026-07-19T09:07:03-03:00"
started_at: "2026-07-19T05:58:12-03:00"
assignee: codex
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
  - docs/plans/active/session-relay-prebuilt-cli-release.md
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
execution_base_commit: 79017fd146f8bcec104ffa6740bba63538f4a88f
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

This plan is the old schema-5 workflow's final creation operation, amended once
after the completed Session Relay release exposed a circular lifecycle
dependency. Its original passed draft receipt is stale and cannot be reused.
This materially changed input receives exactly one fresh full round-1
schema-5 draft series with intent `none`; there is no same-input retry, reseal,
repair continuation, or further old-flow series after that result. No workflow
implementation file changes before an eligible `planned → ongoing` transition
and the separately recorded `execution_base_commit`.

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

Execution is release-ordered, but Session Relay completion is no longer a
prerequisite for starting. Step 1 instead consumes the immutable stable
Session Relay `0.12.0` and public docks-kit `0.9.0` artifacts and receipts plus
the preserved schema-5 terminal STOP. All seven Session Relay release-plan rows
are already `done`; its lifecycle alone remains `in_review` because repair
bundle `/tmp/docks-plan-review/f775263c-3d68-4436-9786-4aaf5af8d302`
failed exact-head verification before any command ran: the sealed reviewer
schema did not match the request. The canonical audit record is
`/tmp/session-relay-final-completion-evidence-f775263c-3d68-4436-9786-4aaf5af8d302/terminal-stop.json`
with SHA-256
`61de5c26e25dd50d3aadc24c07d3cac4c33b9f9ce5b30795af0f70c4fa0fa9e0`;
no retry, reseal, or review followed.

This ordering is intentional: schema 6 must ship in Docks `0.13.0` before the
new manager can resume and archive the exact Session Relay release plan. That
post-release lifecycle step reuses the stable release evidence and never
replays source binding, publication, public release, promotion, or
finalization. Docks then prepares its own terminal evidence. Only after this
plan's later completion/archive may Session Relay hand the public repository a
separate reviewed `plan-workflow-name-migration.md` for docks-kit `0.10.0`.

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
| 1 | Confirm immutable release evidence and the preserved lifecycle STOP, then start only through the old manager's final schema-5 review/apply path. | `docs/plans/active/plan-workflow-phases-and-loop-escape.md` (plan-manager-only lifecycle fields); `docs/plans/active/session-relay-prebuilt-cli-release.md` (read-only prerequisite); `/home/vagrant/.local/state/docks-release/session-relay-0.12.0/run.UA6vob/{source-proof-rebind-1,publication-rebind-1,public-release,promotion-repair-1,final-publication}.json` (read-only); `/tmp/session-relay-final-completion-evidence-f775263c-3d68-4436-9786-4aaf5af8d302/terminal-stop.json` (read-only audit evidence) | — | done | All seven Session Relay rows remain `done`; stable `0.12.0`/public `0.9.0` receipts match SHA-256 `9f4cf4fb49bbacbbea65ad91a0e883845a67ef5f66d0b3fd443846b68eb9576f`, `2735fbcbc250d052da91e8a849a377a748105281177e88ff99f09874984b0c53`, `93d2aeae17d9f6ea95763339d442c9d9e1a64a64e3b1ddc33a0ae81b3f6f2891`, `81fa9eb183703c5a8f1900a04e34f07b747b8c7aa5eb07e11d4f76089ab213e1`, and `87cdcd295951795cede4946a8d6e177652bb5f82a9ff9334c920a1d81ecbe8b2`; the terminal STOP matches its recorded SHA and remains unretried; this plan has the one fresh changed-input eligible draft receipt, a committed `planned → ongoing` transition, and a second plan-only `execution_base_commit` identity commit. Otherwise STOP with no implementation edit, Session Relay schema-5 retry/reseal, or further old-flow draft series. |
| 2 | Write red tests for the phase split, current schema 6, orchestration attempt/state hashing, terminal result mapping, explicit retry, repair binding, intent consumption, and historical compatibility. | `scripts/tests/plan-skill-phases.mjs` (create); `scripts/tests/plan-review-convergence-repair.mjs`; `scripts/tests/plan-review-policy.mjs`; `scripts/tests/plan-review-policy-regressions.mjs`; `scripts/tests/ci-plugin-targeting.mjs` | 1 | done | The new focused cases fail against schema 5 for the intended missing behavior before production changes; preserve the failure output. If they pass without implementation or fail for setup/syntax, STOP and correct the test. |
| 3 | Move the helper to `plan-reviewer` and add current-only schema 6 plus the persisted orchestration machine and atomic lifecycle consumption. | `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs` → `plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs`; `scripts/lib/session-relay-release-preparation.mjs`; `plugins/session-relay/test/release-evidence-contract.mjs`; the four plan test files from Step 2 | 2 | done | Exit 0: schema-6 policy surfaces, repair series/artifacts, the 20-class no-progress mutation harness, moved helper imports, and the Session Relay release contract. Historical schema-1–5 surfaces passed. |
| 4 | Perform the clean five-skill ownership cutover and remove all old live paths/names. | `plugins/docks/skills/productivity/plan-init/{SKILL.md,references/plans-agents-md-template.md,references/codex-agent-templates.md}` → matching `plan-workspace/` paths; create `plugins/docks/skills/productivity/plan-creator/SKILL.md`; update `plugins/docks/skills/productivity/plan-manager/SKILL.md`; rename `plan-review/SKILL.md` → `plan-reviewer/SKILL.md`, retaining the Step 3 destination `plan-reviewer/scripts/review-policy.mjs` as an existing input; rename `plan-improver/SKILL.md` → `plan-repairer/SKILL.md`; rename `plugins/docks/agents/plan-review.md` → `plan-reviewer.md`; rename `.codex/agents/plan-review.toml` → `plan-reviewer.toml`; update manager wrappers | 3 | done | Exact `plan-workspace`, `plan-creator`, `plan-manager`, `plan-reviewer`, and `plan-repairer` directories/contracts resolve; only manager/reviewer wrappers exist, and old source/wrapper paths are absent. Strict skill guards pass at 15/16, 15/16, 16/16, 16/16, and 16/16; the agent guard passes and manager/reviewer score 14/15 each. `node scripts/tests/plan-skill-phases.mjs` reaches only the expected Step-6 failure: `capability-tuning must not resolve as a live skill`. |
| 5 | Migrate every live contract, trigger, import, seed, cache/guard identifier, scaffold source, and author-check key; rename the author-check key exactly to `plan-reviewer`. | `AGENTS.md`; `README.md`; `docs/plans/AGENTS.md`; `plugins/docks/README.md`; `plugins/docks/skills/AGENTS.md`; `plugins/docks/skills/{engineering/refactor,engineering/security,productivity/context-tree,productivity/multi-tool-bridge,productivity/scaffold,productivity/skill-agent-pipeline}/SKILL.md`; `plugins/effect-kit/skills/engineering/effect-ts-port/SKILL.md`; `plugins/session-relay/skills/productivity/session-relay/SKILL.md`; `docs/scaffold/spec.yaml`; `docs/scaffold/templates/{root-AGENTS.md.template,codex-plan-manager.toml.template,codex-plan-review.toml.template,codex-plan-reviewer.toml.template}`; `plugins/docks/skills/productivity/scaffold/references/spec-schema.md`; `scripts/{AGENTS.md,ci.mjs,lib/plugins.mjs,skills/transform-guard.mjs}` | 4 | done | Five live doc/skill routes migrated; docs/plans contract/template parity and the exact reviewer wrapper template verified. Scaffold guard, author-check unit, and transform guard passed. Only the Step-6 capability assertion and Step-7 stale hashes remain. |
| 6 | Delete `capability-tuning` and prove retained Codex-fact enforcement remains live. | delete `plugins/docks/skills/productivity/capability-tuning/{SKILL.md,references/claude-code-config.md,references/codex-config.md}`; update `README.md`, `plugins/docks/README.md`, `.claude-plugin/marketplace.json`, `plugins/docks/.claude-plugin/plugin.json`, `plugins/docks/.codex-plugin/plugin.json`, `scripts/skills/codex-facts.mjs`, `scripts/tests/plan-skill-phases.mjs` | 5 | done | Capability source/references are absent and live catalogs no longer advertise `capability-tuning`; `codex-facts.mjs` pins only `skill-agent-pipeline`. `node scripts/tests/plan-skill-phases.mjs` and `node scripts/skills/codex-facts.mjs` exit 0, proving the mutation fixture fails before restore and the restored/real guards pass. `docs/plans/finished/2026-06-10-capability-tuning-research-rollout.md` is unchanged. |
| 7 | Finish red→green, regenerate skill hashes, run focused checks, execute the helper-owned no-progress smoke, then run targeted and one full repository gate. | Every affected path; helper-owned disposable plan under `/tmp/docks-plan-review/` only | 6 | done | Implementation commit `c1dc938c7245b0662ed5fec1ac673faa00c2c41e`; repair commit `18dd99545efb7e69e44eb6714b559bdd1e5ca5db` restored guarded existing-plan GitHub issue publication. The pre-release advisory prevented that operation loss from shipping. After affected skill-hash regeneration, the exact ordered A1–A9 focused ladder and targeted Docks CI exited 0; final `node scripts/ci.mjs` passed all three plugins and repo-wide checks. The prior helper-owned disposable no-progress smoke remains valid because the publication-only repair did not change helper/orchestration bytes: it observed retryable stopped attempt 1, authorized attempt 2, stuck second failure, same-input refusal, changed-input attempt 1, immediate `platform_denied`/`cannot_repair` stops, duplicate-start apply rejection, and 17 compact-JCS readbacks; its fixture was removed with no repository writes. |
| 8 | Release the breaking Docks name/schema surface as `0.13.0` while keeping this plan ongoing. | `.claude-plugin/marketplace.json`; `plugins/docks/.claude-plugin/plugin.json`; `plugins/docks/.codex-plugin/plugin.json` (release-generated version/description bytes); all changed skill catalog bytes (read-only release input) | 7 | done | Dry run resolved `0.12.9 → 0.13.0` without mutation. Actual release commit `ccd1e8750dae05e7a0d8b369c0e9adf5d81dcde6` was pushed to `main`; annotated tag `docks--v0.13.0` peels to that exact commit; tag CI run `29686206466` passed. The GitHub Release at `https://github.com/DocksDocks/docks/releases/tag/docks--v0.13.0` is published with `isDraft: false` and `isPrerelease: false`. `node scripts/tests/plan-skill-phases.mjs --case installed-catalogs --version 0.13.0` exited 0: fresh installed catalogs expose exactly the five plan phases `plan-workspace`, `plan-creator`, `plan-manager`, `plan-reviewer`, and `plan-repairer`. |
| 9 | After the Docks `0.13.0` release, resume the exact Session Relay release plan through schema-6 completion and archive it without replaying release mutations. | `docs/plans/active/session-relay-prebuilt-cli-release.md` → the plan-manager-returned unique `docs/plans/finished/<ship-date>-session-relay-prebuilt-cli-release.md`; preserved schema-5 terminal bundle/evidence and stable release receipts from Step 1 (read-only) | 8 | planned | The new manager starts the first schema-6 completion orchestration for the unchanged executed Session Relay plan, preserving the schema-5 mismatch as terminal audit evidence rather than continuing or resealing that series. It runs only completion acceptance/CI in the disposable checkout, writes a structurally and input-valid schema-6 `passed` completion receipt, and ships the single source plan to the manager-selected current ship-date path; that returned path is the exact evidence input for Step 10 and A14. It does not invoke source-binding, publish, public-release, promotion, or finalization mutation modes; the seven canonical receipt filenames and hashes remain unchanged. Any release replay, schema-5 retry, receipt mismatch, non-passed result, or non-unique archive suffix is STOP. |
| 10 | Prepare the implementation/release evidence for this plan's terminal manager review while this plan remains ongoing. | `docs/plans/active/plan-workflow-phases-and-loop-escape.md` (read-only handoff input); released Docks `0.13.0` artifacts and the exact plan-manager-returned `docs/plans/finished/<ship-date>-session-relay-prebuilt-cli-release.md` from Step 9 (read-only evidence) | 9 | planned | Steps 1–9 evidence is read back, the immutable Docks tag/Release and installed-catalog boundary are verified, exactly one archived Session Relay plan suffix resolves and has a valid schema-6 passed completion receipt, the ordered A1–A15 inventory plus separate full-CI command is ready for a disposable completion checkout, and no lifecycle transition, completion receipt, or archive for this plan and no public `0.10.0` handoff/write has occurred. |

## Terminal lifecycle and public handoff

Only after every Steps row, including the post-release Session Relay archive, is
`done`, the new manager performs this plan's lifecycle sequence outside the
all-steps-done gate: commit `ongoing → in_review`, execute A1–A15 in order plus
the separately recorded full CI once in a disposable checkout, reconcile the
primary completion review, and record the schema-6 completion receipt. Only a
derived `passed` receipt permits ship/archive to `docs/plans/finished/`; any
other derived result follows the state-machine STOP rules without marking a
Steps row incomplete.

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
| A14 | `node --input-type=module -e 'import fs from "node:fs"; import assert from "node:assert/strict"; import {execFileSync} from "node:child_process"; import {canonicalPlanView,sha256,validateCompletionReceipt} from "./plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs"; const paths=execFileSync("git",["ls-files","docs/plans/finished"],{encoding:"utf8"}).trim().split("\n").filter((value)=>value.endsWith("-session-relay-prebuilt-cli-release.md")); assert.equal(paths.length,1); const bytes=fs.readFileSync(paths[0],"utf8"); assert.match(bytes,/^status: finished$/m); assert.match(bytes,/^review_status: passed$/m); const rows=bytes.split("\n"); const bar=String.fromCharCode(124); for(let n=1;n<=7;n++){const row=rows.find((value)=>value.startsWith(bar+" "+n+" ")); assert.ok(row); assert.ok(row.includes(bar+" done "+bar));} const line=rows.find((value)=>value.startsWith("Completion-review-receipt: ")); assert.ok(line); const receipt=JSON.parse(line.slice("Completion-review-receipt: ".length)); assert.equal(receipt.schema,6); assert.equal(receipt.phase,"completion"); assert.equal(receipt.completion_verdict,"passed"); assert.equal(receipt.outcome,"passed"); const active="docs/plans/active/session-relay-prebuilt-cli-release.md"; const reviewed=execFileSync("git",["show",receipt.reviewed_head+":"+active]); validateCompletionReceipt(receipt,{reviewed_head:receipt.reviewed_head,plan_input_sha256:sha256(canonicalPlanView(reviewed)),review_status:"passed"},{waivers:[]}); const dir="/home/vagrant/.local/state/docks-release/session-relay-0.12.0/run.UA6vob"; assert.deepEqual(fs.readdirSync(dir).sort(),["final-publication.json","promotion-initial.json","promotion-repair-1.json","public-release-request.json","public-release.json","publication-rebind-1.json","source-proof-rebind-1.json"].sort()); const expected={"final-publication.json":"87cdcd295951795cede4946a8d6e177652bb5f82a9ff9334c920a1d81ecbe8b2","promotion-initial.json":"d273e350b948ca39b43d84f01801a8013e7343878d5435dcd01e4c102d1ac389","promotion-repair-1.json":"81fa9eb183703c5a8f1900a04e34f07b747b8c7aa5eb07e11d4f76089ab213e1","public-release-request.json":"a9eafbb16b72825b44be6cfa8819373b539ac4d0016028c2a01c4c6d0cb41ea1","public-release.json":"93d2aeae17d9f6ea95763339d442c9d9e1a64a64e3b1ddc33a0ae81b3f6f2891","publication-rebind-1.json":"2735fbcbc250d052da91e8a849a377a748105281177e88ff99f09874984b0c53","source-proof-rebind-1.json":"9f4cf4fb49bbacbbea65ad91a0e883845a67ef5f66d0b3fd443846b68eb9576f"}; for(const [name,digest] of Object.entries(expected)) assert.equal(sha256(fs.readFileSync(dir+"/"+name)),digest);'` | Exit 0; exactly one ship-date-prefixed archived Session Relay release plan resolves, rows 1–7 are `done`, its schema-6 passed completion receipt validates against its exact reviewed input and receipt-bound policy, and the complete canonical release-receipt set is byte-identical with no replay artifact. |
| A15 | `git -C /home/vagrant/projects/public status --short` | Exit 0 with no output at the Docks completion boundary; public migration is a later separately reviewed `plan-workflow-name-migration.md`, not a Docks worktree edit. |

## Out of scope / do-NOT-touch

- Do not edit any pre-existing file under `docs/plans/finished/`, including
  historical old skill attribution strings, fixed bundle/hash fixtures, or
  receipt bytes. Step 9's plan-manager-owned move of the exact Session Relay
  source plan to one ship-date-prefixed finished path is the sole new archive
  write in scope.
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
- Active-plan multi-occupancy means the Session Relay plan's terminal
  `in_review` state is preserved audit evidence, not a missing release
  prerequisite. Resume that lifecycle only after Docks `0.13.0` supplies schema
  6, and never reinterpret it as authorization to replay release operations.

## Global constraints

- "This materially changed contingency receives exactly one fresh full
  schema-5 draft series with intent none; no same-input retry, reseal, repair
  continuation, or further old-flow series follows its terminal result."
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
- "Stable Session Relay 0.12.0/public 0.9.0 receipts are immutable Step-1
  evidence; schema 6 resumes only completion/lifecycle and never replays a
  mutating release operation."

## STOP conditions

- STOP before any implementation edit unless the five stable Session
  Relay/public receipt hashes and the preserved terminal STOP hash match, all
  seven Session Relay rows remain `done`, and this plan has the one fresh
  changed-input eligible schema-5 draft receipt plus required start/identity
  commits. Session Relay need not yet be finished.
- STOP if the current old plan-manager cannot represent or review this complete
  cold handoff; do not shorten the contract or start implementation.
- STOP if the preserved Session Relay schema-5 bundle is retried, resealed, or
  reviewed, or if another old-flow draft series is prepared after this
  materially changed full round 1.
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
- STOP if Step 9 begins before immutable `docks--v0.13.0` is verified, invokes
  any source-binding/publication/public-release/promotion/finalization mutation,
  changes a canonical release receipt byte/name, or cannot validate and archive
  exactly one ship-date-prefixed Session Relay plan.
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
4. **Executable acceptance — present & specific.** A1–A15 are ordered commands
   with observable expected results, including exact Session Relay schema-6
   archive/receipt and no-replay proof; project CI is separately recorded for
   the completion runner.
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
Review-receipt: {"input_sha256":"cccfde52cdca7ba61c86dd16a13f517352a3e558c8cf1c894fd296d2f1ea44ce","outcome":"passed","phase":"draft","policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"4ab5a2c12ccd3fcd8857bb88e53d2298164d3721bd513d000e657de58bdf6e50","diff_sha256":null,"execution_base_commit":null,"input_sha256":"cccfde52cdca7ba61c86dd16a13f517352a3e558c8cf1c894fd296d2f1ea44ce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"230f5d460ff6a6d26dc58235d0f4e804429ab32f9224291847f35d67b703f7e8","repair_targets_sha256":"5e495bf4f92c1385e86f66a3287d7e721fd50be75fa6ef573add32490e4c8fdd","request_id":"55158b52-d280-4e0b-a16a-35f5a8dbb694","review_mode":"repair","reviewed_commit_or_head":"9694bd1cc61c3a30bf5afe61a508223fa2386fc7","round_index":2,"schema":5},"reviewed_at":"2026-07-19T08:54:33.660Z","reviewed_commit":"9694bd1cc61c3a30bf5afe61a508223fa2386fc7","reviewer":{"accepted_finding_ids":[],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"WorkflowCutoverDuplicateMoveReview","denial_source":null,"exit_code":0,"output_started":true,"reason":"schema-5 primary repair reviewer returned valid structured output","result":"passed","schema":5,"signal":null,"started":true,"stderr_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","stdout_sha256":"6f74aad15ecfa8237685c0680cdf731dbb317088a075b105ed60a5a6b95b20f6","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"4ab5a2c12ccd3fcd8857bb88e53d2298164d3721bd513d000e657de58bdf6e50","diff_sha256":null,"execution_base_commit":null,"input_sha256":"cccfde52cdca7ba61c86dd16a13f517352a3e558c8cf1c894fd296d2f1ea44ce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"230f5d460ff6a6d26dc58235d0f4e804429ab32f9224291847f35d67b703f7e8","repair_targets_sha256":"5e495bf4f92c1385e86f66a3287d7e721fd50be75fa6ef573add32490e4c8fdd","request_id":"55158b52-d280-4e0b-a16a-35f5a8dbb694","review_mode":"repair","reviewed_commit_or_head":"9694bd1cc61c3a30bf5afe61a508223fa2386fc7","round_index":2,"schema":5},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Accepted blocker P1 is repaired exactly as requested: the prior Step 4 duplicate `plan-review/{SKILL.md,scripts/review-policy.mjs}` rename is replaced by `plan-review/SKILL.md` → `plan-reviewer/SKILL.md`, with the Step 3 helper destination retained as existing input.","status":"pass"},"dependency_order":{"evidence":"Step 4 still depends on Step 3 and no longer requires a source helper path that Step 3 has already moved; Step 3 remains the sole review-policy.mjs move owner.","status":"pass"},"evidence_reverification":{"evidence":"The schema-4 repair manifest, exact request, and repair-targets agree on schema 5 round 2, previous input 230f5d460ff6a6d26dc58235d0f4e804429ab32f9224291847f35d67b703f7e8, current input cccfde52cdca7ba61c86dd16a13f517352a3e558c8cf1c894fd296d2f1ea44ce, accepted target P1, and target digest 5e495bf4f92c1385e86f66a3287d7e721fd50be75fa6ef573add32490e4c8fdd.","status":"pass"},"executable_acceptance":{"evidence":"Direct comparison of previous-plan.review.md lines 353–354 with plan.review.md lines 353–354 shows only Step 4's duplicate helper rename was removed and replaced by explicit consumption of the existing Step 3 destination.","status":"pass"},"failure_modes":{"evidence":"The former absent-source/populated-destination collision at Step 4 is eliminated; Step 4 now states that plan-reviewer/scripts/review-policy.mjs already exists from Step 3 and does not move it again.","status":"pass"},"goal_coverage":{"evidence":"The only accepted repair target is P1, and the current Steps 3–4 establish the requested single-valued helper ownership without changing the clean five-skill cutover goal.","status":"pass"},"open_questions":{"evidence":"No open question remains for P1: ownership, order, source, destination, and existing-input treatment are explicit, and the previous/current canonical metadata retain the same affected_paths inventory.","status":"pass"},"standalone_executability":{"evidence":"Literal sequential execution is now coherent: Step 3 alone moves review-policy.mjs, and Step 4 explicitly consumes the existing Step 3 destination while renaming only plan-review/SKILL.md and the listed agent/wrapper files.","status":"pass"}},"findings":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"4ab5a2c12ccd3fcd8857bb88e53d2298164d3721bd513d000e657de58bdf6e50","diff_sha256":null,"execution_base_commit":null,"input_sha256":"cccfde52cdca7ba61c86dd16a13f517352a3e558c8cf1c894fd296d2f1ea44ce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"230f5d460ff6a6d26dc58235d0f4e804429ab32f9224291847f35d67b703f7e8","repair_targets_sha256":"5e495bf4f92c1385e86f66a3287d7e721fd50be75fa6ef573add32490e4c8fdd","request_id":"55158b52-d280-4e0b-a16a-35f5a8dbb694","review_mode":"repair","reviewed_commit_or_head":"9694bd1cc61c3a30bf5afe61a508223fa2386fc7","round_index":2,"schema":5},"role":"primary","schema":5,"verdict":"pass"},"role":"primary","schema":5,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":5,"series":{"current_input_sha256":"cccfde52cdca7ba61c86dd16a13f517352a3e558c8cf1c894fd296d2f1ea44ce","initial_input_sha256":"230f5d460ff6a6d26dc58235d0f4e804429ab32f9224291847f35d67b703f7e8","policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","repairs":[{"accepted_finding_ids":["P1"],"current_input_sha256":"cccfde52cdca7ba61c86dd16a13f517352a3e558c8cf1c894fd296d2f1ea44ce","from_round_index":1,"previous_input_sha256":"230f5d460ff6a6d26dc58235d0f4e804429ab32f9224291847f35d67b703f7e8","repair_targets_sha256":"5e495bf4f92c1385e86f66a3287d7e721fd50be75fa6ef573add32490e4c8fdd","schema":5,"targets":[{"criterion":"actionability","defect":"Step 3 moves plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs to plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs. Step 4 depends on Step 3 but again instructs the executor to rename plan-review/{SKILL.md,scripts/review-policy.mjs} to plan-reviewer. Literal sequential execution therefore reaches Step 4 with the scripts source absent and destination populated, so the clean-cutover step cannot execute as written.","evidence":"The sealed Steps table states in Step 3: `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs` → `plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs`; the immediately dependent Step 4 repeats `rename plan-review/{SKILL.md,scripts/review-policy.mjs}` → `plan-reviewer/`.","fix":"Make the ownership split single-valued: retain the helper move only in Step 3, and change Step 4 to rename only plan-review/SKILL.md to plan-reviewer/SKILL.md plus the agent/wrapper files, explicitly treating the helper destination from Step 3 as an existing input. Keep the affected-path inventory unchanged.","id":"P1","locator":"Step 3 and Step 4 rows, lines 353-354","path":"plan.review.md","reproduction":{"command":null,"evidence_sha256":"230f5d460ff6a6d26dc58235d0f4e804429ab32f9224291847f35d67b703f7e8","exit_code":null,"method":"read"},"section":"Steps","source":"primary","status":"blocking_gap"}]}],"rounds":[{"kind":"draft","outcome":"not_ready","pre_execution_eligible":false,"reproduced":[{"id":"P1","reproduction":{"command":null,"evidence_sha256":"230f5d460ff6a6d26dc58235d0f4e804429ab32f9224291847f35d67b703f7e8","exit_code":null,"method":"read"}}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"fedda17302c25e224c52031d8776590f709baed708615b45f50fb267a8f37569","diff_sha256":null,"execution_base_commit":null,"input_sha256":"230f5d460ff6a6d26dc58235d0f4e804429ab32f9224291847f35d67b703f7e8","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"386797dc-0711-4fc8-8c7c-a6d5ea72c86b","review_mode":"full","reviewed_commit_or_head":"ca10bd597e4291e4e816474e03f7dcf3ecf99b9f","round_index":1,"schema":5},"reviewer":{"accepted_finding_ids":["P1"],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"WorkflowCutoverContingencyReview","denial_source":null,"exit_code":0,"output_started":true,"reason":"schema-5 primary reviewer returned valid structured output","result":"passed","schema":5,"signal":null,"started":true,"stderr_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","stdout_sha256":"fddc9a7e1bc08db3105c99bb476cc5df4cfd826e0b5ae45e76e7515a071534cf","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"7306f828f7da786d68c23635ff915d7f18e50fa859f5fbac81b415e684364c75","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"fedda17302c25e224c52031d8776590f709baed708615b45f50fb267a8f37569","diff_sha256":null,"execution_base_commit":null,"input_sha256":"230f5d460ff6a6d26dc58235d0f4e804429ab32f9224291847f35d67b703f7e8","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"386797dc-0711-4fc8-8c7c-a6d5ea72c86b","review_mode":"full","reviewed_commit_or_head":"ca10bd597e4291e4e816474e03f7dcf3ecf99b9f","round_index":1,"schema":5},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Steps 3 and 4 assign the same non-idempotent helper move twice: Step 3 moves plan-review/scripts/review-policy.mjs to plan-reviewer/scripts/review-policy.mjs, while dependent Step 4 again directs renaming plan-review/{SKILL.md,scripts/review-policy.mjs} to plan-reviewer. After Step 3 succeeds, Step 4's stated scripts source no longer exists and its destination already exists.","status":"blocking_gap"},"dependency_order":{"evidence":"Apart from the separately reported duplicate operation, the dependency chain is explicit and safe: stable Session Relay 0.12.0/public 0.9.0 receipts plus the preserved schema-5 terminal STOP gate start; tests precede production; schema 6 and the clean cutover precede Docks 0.13.0; only then does the exact Session Relay plan run fresh schema-6 completion and archive without release replay; that archive precedes this plan's completion evidence and archive, which alone unlocks the separate public docks-kit 0.10.0 handoff.","status":"pass"},"evidence_reverification":{"evidence":"Step 1 binds five immutable receipt hashes and the terminal-STOP hash, requires seven done rows and committed lifecycle identities, and forbids old-flow reseal/retry. Later steps require read-back, exact tag/Release identities, generated content hashes, receipt validation, byte-identical historical schemas and release artifacts, clean disposable completion execution, and rerunning invalidated gates after relevant edits.","status":"pass"},"executable_acceptance":{"evidence":"A1-A15 are ordered executable commands with observable results, followed by the separately recorded full CI exactly once. A14 resolves exactly one finished Session Relay plan suffix, checks finished/passed state and all seven done rows, requires receipt schema 6 with completion/outcome passed, validates the receipt against the exact reviewed active-plan bytes, and verifies the complete release-evidence directory names and SHA-256 values, so it proves the intended schema-6 archive and detects replay artifacts without depending on public 0.10.0 work.","status":"pass"},"failure_modes":{"evidence":"The plan defines a total ordered outcome reducer, retryable versus nonrenewable reasons, attempt-1/attempt-2 terminal conversion, fallback precedence, once-only apply, hash and stale-input fail-closed behavior, release collision handling, gate invalidation, historical-byte protection, Session Relay no-replay enforcement, and explicit STOP behavior for every unsafe lifecycle or publication condition.","status":"pass"},"goal_coverage":{"evidence":"The plan covers bounded orchestration attempts, the independent two-round review-series bound, persisted JCS state and hashes, one-shot intent consumption, five-skill ownership, historical schema preservation, capability-tuning deletion with retained fact enforcement, Docks 0.13.0 release, Session Relay completion recovery, and the later public 0.10.0 boundary. The materially changed old-flow input is explicitly limited at lines 27-34, Global constraints lines 462-464, and STOP conditions lines 488-497 to exactly this full round-1 schema-5 series with no same-input retry, reseal, repair continuation, or further old-flow series.","status":"pass"},"open_questions":{"evidence":"No design decision is left to the executor: phase ownership, schemas and manifest rows, lifecycle transitions, retry authorization, release versions, Session Relay recovery semantics, acceptance order, archive boundary, and later public handoff are fixed. The duplicate helper move is a concrete plan defect rather than an unanswered product or architecture question.","status":"pass"},"standalone_executability":{"evidence":"The sealed bundle reverified at SHA-256 fedda17302c25e224c52031d8776590f709baed708615b45f50fb267a8f37569 and the echoed request matches it. The plan supplies repository/runtime/setup facts, exact affected paths, closed state and request/receipt contracts, ownership boundaries, commands, STOP conditions, and the post-release lifecycle boundary without relying on mutable source context.","status":"pass"}},"findings":[{"criterion":"actionability","defect":"Step 3 moves plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs to plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs. Step 4 depends on Step 3 but again instructs the executor to rename plan-review/{SKILL.md,scripts/review-policy.mjs} to plan-reviewer. Literal sequential execution therefore reaches Step 4 with the scripts source absent and destination populated, so the clean-cutover step cannot execute as written.","evidence":"The sealed Steps table states in Step 3: `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs` → `plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs`; the immediately dependent Step 4 repeats `rename plan-review/{SKILL.md,scripts/review-policy.mjs}` → `plan-reviewer/`.","fix":"Make the ownership split single-valued: retain the helper move only in Step 3, and change Step 4 to rename only plan-review/SKILL.md to plan-reviewer/SKILL.md plus the agent/wrapper files, explicitly treating the helper destination from Step 3 as an existing input. Keep the affected-path inventory unchanged.","id":"P1","locator":"Step 3 and Step 4 rows, lines 353-354","path":"plan.review.md","section":"Steps","status":"blocking_gap"}],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"fedda17302c25e224c52031d8776590f709baed708615b45f50fb267a8f37569","diff_sha256":null,"execution_base_commit":null,"input_sha256":"230f5d460ff6a6d26dc58235d0f4e804429ab32f9224291847f35d67b703f7e8","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":null,"repair_targets_sha256":null,"request_id":"386797dc-0711-4fc8-8c7c-a6d5ea72c86b","review_mode":"full","reviewed_commit_or_head":"ca10bd597e4291e4e816474e03f7dcf3ecf99b9f","round_index":1,"schema":5},"role":"primary","schema":5,"verdict":"blocking_gap"},"role":"primary","schema":5,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":5},{"kind":"draft","outcome":"passed","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"4ab5a2c12ccd3fcd8857bb88e53d2298164d3721bd513d000e657de58bdf6e50","diff_sha256":null,"execution_base_commit":null,"input_sha256":"cccfde52cdca7ba61c86dd16a13f517352a3e558c8cf1c894fd296d2f1ea44ce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"230f5d460ff6a6d26dc58235d0f4e804429ab32f9224291847f35d67b703f7e8","repair_targets_sha256":"5e495bf4f92c1385e86f66a3287d7e721fd50be75fa6ef573add32490e4c8fdd","request_id":"55158b52-d280-4e0b-a16a-35f5a8dbb694","review_mode":"repair","reviewed_commit_or_head":"9694bd1cc61c3a30bf5afe61a508223fa2386fc7","round_index":2,"schema":5},"reviewer":{"accepted_finding_ids":[],"raw":{"attempts":[{"candidate":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"child_id":"WorkflowCutoverDuplicateMoveReview","denial_source":null,"exit_code":0,"output_started":true,"reason":"schema-5 primary repair reviewer returned valid structured output","result":"passed","schema":5,"signal":null,"started":true,"stderr_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","stdout_sha256":"6f74aad15ecfa8237685c0680cdf731dbb317088a075b105ed60a5a6b95b20f6","timeout_mode":"orchestrator_tool","timeout_seconds":600}],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"4ab5a2c12ccd3fcd8857bb88e53d2298164d3721bd513d000e657de58bdf6e50","diff_sha256":null,"execution_base_commit":null,"input_sha256":"cccfde52cdca7ba61c86dd16a13f517352a3e558c8cf1c894fd296d2f1ea44ce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"230f5d460ff6a6d26dc58235d0f4e804429ab32f9224291847f35d67b703f7e8","repair_targets_sha256":"5e495bf4f92c1385e86f66a3287d7e721fd50be75fa6ef573add32490e4c8fdd","request_id":"55158b52-d280-4e0b-a16a-35f5a8dbb694","review_mode":"repair","reviewed_commit_or_head":"9694bd1cc61c3a30bf5afe61a508223fa2386fc7","round_index":2,"schema":5},"result":"passed","reviewer_output":{"checklist":{"actionability":{"evidence":"Accepted blocker P1 is repaired exactly as requested: the prior Step 4 duplicate `plan-review/{SKILL.md,scripts/review-policy.mjs}` rename is replaced by `plan-review/SKILL.md` → `plan-reviewer/SKILL.md`, with the Step 3 helper destination retained as existing input.","status":"pass"},"dependency_order":{"evidence":"Step 4 still depends on Step 3 and no longer requires a source helper path that Step 3 has already moved; Step 3 remains the sole review-policy.mjs move owner.","status":"pass"},"evidence_reverification":{"evidence":"The schema-4 repair manifest, exact request, and repair-targets agree on schema 5 round 2, previous input 230f5d460ff6a6d26dc58235d0f4e804429ab32f9224291847f35d67b703f7e8, current input cccfde52cdca7ba61c86dd16a13f517352a3e558c8cf1c894fd296d2f1ea44ce, accepted target P1, and target digest 5e495bf4f92c1385e86f66a3287d7e721fd50be75fa6ef573add32490e4c8fdd.","status":"pass"},"executable_acceptance":{"evidence":"Direct comparison of previous-plan.review.md lines 353–354 with plan.review.md lines 353–354 shows only Step 4's duplicate helper rename was removed and replaced by explicit consumption of the existing Step 3 destination.","status":"pass"},"failure_modes":{"evidence":"The former absent-source/populated-destination collision at Step 4 is eliminated; Step 4 now states that plan-reviewer/scripts/review-policy.mjs already exists from Step 3 and does not move it again.","status":"pass"},"goal_coverage":{"evidence":"The only accepted repair target is P1, and the current Steps 3–4 establish the requested single-valued helper ownership without changing the clean five-skill cutover goal.","status":"pass"},"open_questions":{"evidence":"No open question remains for P1: ownership, order, source, destination, and existing-input treatment are explicit, and the previous/current canonical metadata retain the same affected_paths inventory.","status":"pass"},"standalone_executability":{"evidence":"Literal sequential execution is now coherent: Step 3 alone moves review-policy.mjs, and Step 4 explicitly consumes the existing Step 3 destination while renaming only plan-review/SKILL.md and the listed agent/wrapper files.","status":"pass"}},"findings":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"high","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"4ab5a2c12ccd3fcd8857bb88e53d2298164d3721bd513d000e657de58bdf6e50","diff_sha256":null,"execution_base_commit":null,"input_sha256":"cccfde52cdca7ba61c86dd16a13f517352a3e558c8cf1c894fd296d2f1ea44ce","lifecycle_intent":"none","phase":"draft","planned_at_commit":null,"policy":{"candidates":[{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"fallback":"availability_only","max_rounds":2,"provenance":{"candidates":"skill_default","fallback":"skill_default","max_rounds":"skill_default","role":"skill_default"},"role":"primary","schema":5},"policy_sha256":"9629d2b08ff15aa63e30f6177f537c7d0f804d8d7847093c251169253fdf07ab","previous_input_sha256":"230f5d460ff6a6d26dc58235d0f4e804429ab32f9224291847f35d67b703f7e8","repair_targets_sha256":"5e495bf4f92c1385e86f66a3287d7e721fd50be75fa6ef573add32490e4c8fdd","request_id":"55158b52-d280-4e0b-a16a-35f5a8dbb694","review_mode":"repair","reviewed_commit_or_head":"9694bd1cc61c3a30bf5afe61a508223fa2386fc7","round_index":2,"schema":5},"role":"primary","schema":5,"verdict":"pass"},"role":"primary","schema":5,"selected":{"company":"openai","effort":"high","model":"gpt-5.6-sol","service_tier":"default","tool":"codex"},"waiver":null,"waiver_sha256":null},"rejected":[]},"schema":5}],"schema":5}}

Checked `standalone_executability`, `actionability`, `dependency_order`,
`evidence_reverification`, `goal_coverage`, `executable_acceptance`,
`failure_modes`, and `open_questions` once after the contingency amendment.
The pass retained the earlier counter, rename, wrapper, and public-boundary
fixes, then removed the lifecycle cycle: immutable stable release/STOP evidence
now starts Docks; schema-6 Session Relay completion/archive follows the Docks
release; and this plan's terminal lifecycle plus public `0.10.0` handoff remain
outside the all-rows gate. It also invalidated the stale receipt, prohibited
every further old-flow series, and added executable schema-6 archive/no-replay
acceptance. There are no open questions and no N/A checklist shortcuts.

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
  remains blocked and untouched. The Session Relay release plan's schema-5
  terminal STOP is preserved at the exact evidence path/hash above; it proves
  why schema 6 must precede lifecycle completion and authorizes neither retry
  nor release replay.
- Step 1 closure revalidated the five receipt hashes above, terminal STOP SHA-256
  `61de5c26e25dd50d3aadc24c07d3cac4c33b9f9ce5b30795af0f70c4fa0fa9e0`,
  all seven prerequisite rows, the passed receipt input/payload/bundle, and the
  plan-only start `79017fd146f8bcec104ffa6740bba63538f4a88f` plus identity
  `0ca56db254039b7718ae277f52fcad954011862d` commits.
- Step 2 red baseline: current `{plan-init, plan-manager, plan-review, plan-improver}` versus required `{plan-workspace, plan-creator, plan-manager, plan-reviewer, plan-repairer}`; missing exports `beginReviewOrchestration`, `advanceReviewOrchestrationRepair`, `settleReviewOrchestration`, and `consumeReviewIntent`; `reviewSchema: 6` rejected; the author check remained keyed `plan-review`. All five test files parsed and their existing historical assertions passed before the six intended reds.
- Attempt-counter limits are project policy informed by vendor guidance on
  maximum iterations and blocker checkpoints; the exact two-attempt rule and
  substantive-input fingerprint are Docks decisions, not vendor-prescribed
  values.
