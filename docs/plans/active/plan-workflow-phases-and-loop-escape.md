---
title: Cut over plan workflow to schema 6 and explicit phases
goal: Persist bounded review attempts, split the five plan phases cleanly, remove capability tuning, release Docks 0.13.0, and hand public its 0.10 boundary.
status: planned
created: "2026-07-19T03:36:13-03:00"
updated: "2026-07-19T03:36:13-03:00"
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
review_status: null
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

Current-only request, run, series, transition, bundle, receipt, completion, and
lifecycle branches become schema 6. Request fields add
`orchestration_series_id` and `orchestration_state_sha256`. Require:

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

Schemas 1–5 retain their exact historical builders, validators, fixtures,
request/receipt meanings, and byte behavior. Do not broad-replace schema
constants or upgrade historical records.

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

Derive state from validated evidence, never caller-provided result strings:

| Evidence/result | Attempt 1 | Explicit same-input attempt 2 |
|---|---|---|
| eligible pass | `passed`; `stop_reason:null` | `passed`; `stop_reason:null` |
| `unavailable_auth`, `unavailable_model`, `timed_out`, `unavailable_unknown`, `failed_unparseable` | `stopped`; one current-user retry may be authorized | `stuck`; no further same-input retry |
| `platform_denied`, `stale_input`, `cannot_repair`, `not_ready`, `apply_rejected` | `stuck`; no retry | unreachable as an authorized retry target |

Candidate fallback for authentication/model/transport availability remains
inside one orchestration attempt and never creates a series. Attempt 2 requires
`beginReviewOrchestration` to receive the exact current-user message bytes and
a matching `ReviewRetryAuthorizationV1`; it recomputes the source hash, requires
actor `user`, exact message-record time/path/phase/group/input/prior stopped hash,
and embeds the authorization once. Reject reuse, mismatch, nonretryable prior
reasons, or missing explicit user input.

## Steps

| # | Task | Files | Depends | Status | Done when / failure action |
|---|---|---|---|---|---|
| 1 | Confirm release and lifecycle prerequisites, then start only through the old manager's final schema-5 review/apply path. | `docs/plans/active/plan-workflow-phases-and-loop-escape.md` (plan-manager-only lifecycle fields); `docs/plans/active/session-relay-prebuilt-cli-release.md` (read-only prerequisite) | — | planned | Session Relay `0.12.0` is stable; its release plan is finished with reusable passed evidence; this plan has an eligible draft receipt, a committed `planned → ongoing` transition, and a second plan-only `execution_base_commit` identity commit. Otherwise STOP with no implementation edit or fresh automatic review series. |
| 2 | Write red tests for the phase split, current schema 6, orchestration attempt/state hashing, terminal result mapping, explicit retry, repair binding, intent consumption, and historical compatibility. | `scripts/tests/plan-skill-phases.mjs` (create); `scripts/tests/plan-review-convergence-repair.mjs`; `scripts/tests/plan-review-policy.mjs`; `scripts/tests/plan-review-policy-regressions.mjs`; `scripts/tests/ci-plugin-targeting.mjs` | 1 | planned | The new focused cases fail against schema 5 for the intended missing behavior before production changes; preserve the failure output. If they pass without implementation or fail for setup/syntax, STOP and correct the test. |
| 3 | Move the helper to `plan-reviewer` and add current-only schema 6 plus the persisted orchestration machine and atomic lifecycle consumption. | `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs` → `plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs`; `scripts/lib/session-relay-release-preparation.mjs`; `plugins/session-relay/test/release-evidence-contract.mjs`; the four plan test files from Step 2 | 2 | planned | All schema-6 request/bundle/run/series/repair/receipt/reuse/completion/apply bindings and four pure functions satisfy the data/state rules above; schemas 1–5 and historical fixtures validate unchanged. Any historical-byte or schema regression is STOP, not a fixture rewrite. |
| 4 | Perform the clean five-skill ownership cutover and remove all old live paths/names. | `plugins/docks/skills/productivity/plan-init/{SKILL.md,references/plans-agents-md-template.md,references/codex-agent-templates.md}` → matching `plan-workspace/` paths; create `plugins/docks/skills/productivity/plan-creator/SKILL.md`; update `plugins/docks/skills/productivity/plan-manager/SKILL.md`; rename `plan-review/{SKILL.md,scripts/review-policy.mjs}` → `plan-reviewer/`; rename `plan-improver/SKILL.md` → `plan-repairer/SKILL.md`; rename `plugins/docks/agents/plan-review.md` → `plan-reviewer.md`; rename `.codex/agents/plan-review.toml` → `plan-reviewer.toml`; update manager wrappers | 3 | planned | Exactly five skill names and ownership contracts resolve. Only manager/reviewer wrappers exist. Old directories/wrappers/imports/triggers are absent from live surfaces; historical strings alone remain. |
| 5 | Migrate every live contract, trigger, import, seed, cache/guard identifier, scaffold source, and author-check key; rename the author-check key exactly to `plan-reviewer`. | `AGENTS.md`; `README.md`; `docs/plans/AGENTS.md`; `plugins/docks/README.md`; `plugins/docks/skills/AGENTS.md`; `plugins/docks/skills/{engineering/refactor,engineering/security,productivity/context-tree,productivity/multi-tool-bridge,productivity/scaffold,productivity/skill-agent-pipeline}/SKILL.md`; `plugins/effect-kit/skills/engineering/effect-ts-port/SKILL.md`; `plugins/session-relay/skills/productivity/session-relay/SKILL.md`; `docs/scaffold/spec.yaml`; `docs/scaffold/templates/{root-AGENTS.md.template,codex-plan-manager.toml.template,codex-plan-review.toml.template,codex-plan-reviewer.toml.template}`; `plugins/docks/skills/productivity/scaffold/references/spec-schema.md`; `scripts/{AGENTS.md,ci.mjs,lib/plugins.mjs,skills/transform-guard.mjs}` | 4 | planned | Scaffold bundles all five exact skills and emits only manager/reviewer wrappers; current routes are disjoint; `authorChecks` uses `plan-reviewer`; generated/live content has no stale invocation path. Do not add creator/workspace/repairer wrappers. |
| 6 | Delete `capability-tuning` and prove retained Codex-fact enforcement remains live. | delete `plugins/docks/skills/productivity/capability-tuning/{SKILL.md,references/claude-code-config.md,references/codex-config.md}`; update `README.md`, `plugins/docks/README.md`, `.claude-plugin/marketplace.json`, `plugins/docks/.claude-plugin/plugin.json`, `plugins/docks/.codex-plugin/plugin.json`, `scripts/skills/codex-facts.mjs`, `scripts/tests/plan-skill-phases.mjs` | 5 | planned | Capability tuning is absent from discovery/catalog prose. The test mutates one retained skill-agent-pipeline effort token in a temporary fixture, observes `codex-facts.mjs` fail, restores it, then observes success. No historical file is edited. |
| 7 | Finish red→green, regenerate skill hashes, run focused checks, execute the helper-owned no-progress smoke, then run targeted and one full repository gate. | Every affected path; helper-owned disposable plan under `/tmp/docks-plan-review/` only | 6 | planned | Commands in Environment pass in order; the no-progress sequence proves stopped attempt 1, one explicit attempt 2, stuck on the second failure, refusal to prepare again, and new attempt 1 only after substantive input change; `platform_denied`/`cannot_repair` stick on attempt 1 and duplicate start apply is rejected. Then `node scripts/ci.mjs --plugin docks` and one `node scripts/ci.mjs` exit 0. Any later relevant edit invalidates the affected gates. |
| 8 | Release the breaking Docks name/schema surface as `0.13.0` while keeping this plan ongoing. | `.claude-plugin/marketplace.json`; `plugins/docks/.claude-plugin/plugin.json`; `plugins/docks/.codex-plugin/plugin.json` (release-generated version/description bytes); all changed skill catalog bytes (read-only release input) | 7 | planned | `node scripts/release.mjs --plugin docks minor` synchronizes `0.12.9 → 0.13.0`, pushes without force, leaves immutable `docks--v0.13.0` at the release commit, and targeted tag CI/GitHub Release succeed. Installed Claude/Codex catalogs expose the five new names and no old live name. Pre-existing/mismatched tag, Release, manifest, or workflow identity is STOP; never clobber. |
| 9 | Complete this plan through the new manager/reviewer path, then hand off—but do not execute—the public breaking migration. | `docs/plans/active/plan-workflow-phases-and-loop-escape.md` (plan-manager-only completion and ship); `/home/vagrant/projects/public/docs/plans/active/plan-workflow-name-migration.md` (created later only by public plan workflow through Session Relay; never from this worktree) | 8 | planned | New manager commits `in_review`, executes the ordered inventory plus CI in its disposable checkout, reconciles primary findings, records a schema-6 completion receipt, and archives this plan only on derived `passed`. Afterward Session Relay hands public the pinned Docks `0.13.0` boundary for its own independently reviewed docks-kit `0.10.0` plan. No public repository byte is part of this plan's execution range. |

## Acceptance criteria

The completion runner executes these rows exactly once in order. It then runs
the separately recorded project CI command `node scripts/ci.mjs` once; that full
CI command is intentionally not duplicated in this inventory.

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-skill-phases.mjs` | Exit 0; five exact skills and public/internal flags, disjoint triggers, wrapper limits, clean old-name removal, guard mutation, and no-progress behavior pass. |
| A2 | `node scripts/tests/plan-review-policy.mjs --case surfaces` | Exit 0; schema-6 state/request/receipt/lifecycle surfaces and historical validators pass. |
| A3 | `node scripts/tests/plan-review-convergence-repair.mjs --case repair-series` | Exit 0; one full plus at most one repair round remains bounded inside one orchestration series and state hashes bind the transition. |
| A4 | `node scripts/tests/plan-review-convergence-repair.mjs --case repair-artifacts` | Exit 0; full/repair bundles, prior-plan bytes, accepted targets, and orchestration-state identities verify. |
| A5 | `node scripts/tests/plan-review-policy-regressions.mjs --self-test` | Exit 0; attempt 3, nonretryable renewal, duplicate apply, state-hash substitution, and metadata-only progress mutants are killed; schemas 1–5 remain valid. |
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
- STOP on unavailable, platform-denied, stale, `cannot_repair`, not-ready, or
  rejected draft evidence according to the persisted result; never auto-prepare
  another series.
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
