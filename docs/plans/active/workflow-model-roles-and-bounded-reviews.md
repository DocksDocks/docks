---
title: Add workflow model roles and bounded plan reviews
goal: Ship profile-backed workflow model roles and a three-round, 90-point plan-review gate without weakening sealed review evidence or single-provider degradation.
status: in_review
created: "2026-07-15T12:40:17-03:00"
updated: "2026-07-15T16:28:46-03:00"
started_at: "2026-07-15T15:24:24-03:00"
assignee: null
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: xhigh
review_waivers: []
tags:
  - plans
  - model-policy
  - cross-company
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/docks/skills/AGENTS.md
  - plugins/docks/skills/productivity/plan-init/SKILL.md
  - plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-review/SKILL.md
  - plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs
  - scripts/tests/plan-review-policy.mjs
  - scripts/tests/plan-review-policy-regressions.mjs
related_plans: []
review_status: null
planned_at_commit: "63015013ee695f967b3fcae35808170730969b5d"
execution_base_commit: "261c3d17ef144463d3f5fdfba294b40fe40686ca"
in_review_since: "2026-07-15T16:26:40-03:00"
---

# Add workflow model roles and bounded plan reviews

## Goal

Ship the Docks half of a cross-repository workflow policy that defaults to the
ordered `profile:claude-best` orchestrator (`claude:fable@high`, then
`claude:opus@xhigh`), a GPT-5.6 Sol independent reviewer and implementer, and
the first available fresh Claude candidate for same-company review. A
plan-review operation must stop early when every available reviewer is ready at
90/100 or higher, stop after three rounds otherwise, and ask the user before
authorizing another bounded batch.

The review transport remains the existing sealed, read-only direct CLI or an
execution-enforced read-only in-session reviewer. Session-relay is reserved for
one managed cross-provider implementation handoff after a plan starts; it is
not made a schema review transport.

## Context & rationale

The user made these decisions:

- `profile:claude-best` is the default orchestrator selector. It resolves to
  `claude:fable@high` first and `claude:opus@xhigh` second; the profile name is
  not a model ID and must remain distinct from Claude's native `best` alias.
- GPT-5.6 Sol reviews the Fable-authored plan first; a fresh Claude reviewer then
  supplies the independent author-company leg over the same immutable input,
  falling through the configured Claude candidates when a fresh launch proves
  one candidate unavailable.
- Both available legs target 90/100, with at most three repair/review rounds per
  user-authorized batch. If the target is still missed, use the runtime's native
  user-question UI to ask whether to run another bounded batch.
- The downstream kit may override both defaults with strict bounded integers:
  `--review-min-score=<0..100>` and `--review-max-rounds=<1..10>`.
- GPT-5.6 Sol is the default implementation worker unless a higher-precedence
  workflow-role override selects another kit-verified model.
- Provider availability is detected at runtime. A missing Claude or Codex
  subscription records exact degradation and does not make the other provider
  unusable.
- `docks-kit` in `/home/vagrant/projects/public` will supply strict
  `--model-orchestrator`, `--model-reviewer`, and `--model-implementer`
  deployment overrides after this Docks contract is released. Workflow
  selectors use `profile:<name>` for named chains and
  `<tool>:<model>@<effort>` for exact targets.
- The helper surfaces the same selector registry through
  `docks-kit models workflow [--json]`; a bare workflow-role flag prints the
  strict catalog, exact grammar, and fully expanded candidate chain.
- Availability is model-agnostic and operation-scoped. Static catalog and auth
  checks run first, but the real review/worker launch is the authoritative model
  probe. A recognized candidate-specific failure warns once and advances once;
  provider-wide or ambiguous failures never trigger blind model rotation.

Current Docks already seals one immutable bundle, records a 0-100 score, probes
`claude auth status` / `codex login status`, and allows one successful review
leg. Its missing pieces are a score threshold in the bound policy, a bounded
round contract, a workflow-role record shared with `docks-kit`, and an explicit
implementation handoff. Current `public` guidance says every Sol one-shot uses
session-relay, while schema-v1 Docks review correctly rejects relay because its
spawn path is a writable resumable worker. The new contract resolves that
conflict by using direct CLI for evidence-only review and session-relay only for
writable cross-provider implementation.

This is stage one of the multi-repository delivery. After the Docks plugin is
released and both local plugin caches resolve the same release, create a linked
`public` plan named `workflow-model-role-overrides` to implement the CLI/catalog
producer. The repositories cannot share one executable plan because Docks'
bundle and completion diff intentionally bind one Git repository and reject
path escapes.

## Environment & how-to-run

- Repository: `/home/vagrant/projects/docks`, branch `main`.
- Planning base: `63015013ee695f967b3fcae35808170730969b5d`.
- Node: the repository's Node 24 CI contract; install with
  `corepack enable && pnpm install --frozen-lockfile` only if dependencies are
  absent.
- Focused policy tests:
  `node scripts/tests/plan-review-policy.mjs` and
  `node scripts/tests/plan-review-policy-regressions.mjs`.
- Plugin gate: `node scripts/ci.mjs --plugin docks`.
- Required project CI: `node scripts/ci.mjs`.
- Release preview: `node scripts/release.mjs --dry-run --plugin docks patch`.
- Release after the completion receipt passes:
  `node scripts/release.mjs --plugin docks patch`.
- Runtime probes used by plan-review remain `claude auth status` and
  `codex login status`; model entitlement remains attempt-as-probe with an
  explicit model and effort.
- No new dependency or external API is introduced.

## Interfaces & data shapes

### Runtime-global workflow record

`docks-kit` will place exactly one compact-JCS line in both already-loaded global
instruction files. Docks consumes it through existing instruction precedence;
the plugin does not read a new environment variable or config file.

```text
Docks-workflow-models: {"implementer":{"candidates":[{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"}],"selector":"codex:gpt-5.6-sol@xhigh"},"orchestrator":{"candidates":[{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"selector":"profile:claude-best"},"review":{"max_rounds":3,"minimum_score":90},"reviewer":{"candidates":[{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"}],"selector":"codex:gpt-5.6-sol@xhigh"},"schema":1}
```

Each role is closed to `selector` and an ordered nonempty `candidates` array of
one to three objects closed to `company`, `tool`, `model`, and `effort`.
`review` is closed to integer `minimum_score` and `max_rounds` within the
policy-v2 ranges. The selector is preserved for user-facing attribution, while
the expanded candidates are the only execution input; Docks never reparses a
profile name or consults a mutable external catalog at operation time.
Current-turn user instructions override the record; the record overrides dated
skill defaults. Multiple byte-identical records are deduplicated because Claude
and Codex receive parallel global instruction files; two valid records with
different JCS values are a conflicting duplicate and STOP policy resolution.
An invalid or internally inconsistent record is ignored as a whole with one
surfaced warning, never partially applied.

For an Anthropic-authored plan, the first available preferred-reviewer candidate
supplies X and the first available fresh orchestrator-tier Claude candidate
supplies S. For an OpenAI-authored plan, company identity still controls X/S:
the first available Anthropic orchestrator candidate supplies X and the first
available OpenAI reviewer candidate supplies S. The cross-company invariant
wins over a role name when configured candidates name the same company.

### Workflow selector and helper contract

The downstream `docks-kit` producer owns a strict workflow registry separate
from its permissive deploy-time model flags. Its accepted forms are:

```text
profile:<profile-name>
<tool>:<model>@<effort>

profile:claude-best
  1. claude:fable@high
  2. claude:opus@xhigh
```

`tool` is exactly `claude` or `codex`; a model and effort must both exist in the
kit-verified catalog for that tool. Workflow selectors do not inherit the
existing "unknown but well-formed model with warning" behavior used by
`--claude-model` and `--codex-model`. `claude:best@high` names Claude's native
single alias, while `profile:claude-best` names the Docks two-candidate profile;
they are intentionally different values.

`docks-kit models workflow` prints every profile, every expanded candidate, the
exact-target grammar, supported per-tool effort values, and
`live availability: checked when used`. `--json` emits the same closed registry
without prose. Bare `--model-orchestrator`, `--model-reviewer`, or
`--model-implementer` prints that helper output plus the missing-value usage and
exits 2 without mutation. Root help names all three role flags and both bounded
review controls. Invalid selectors, unknown profiles, invalid model/effort
pairs, and explicit empty values fail before either global instruction file is
changed.

### Candidate availability and fallback

Do not launch a disposable prompt merely to test a candidate: it spends quota,
can mutate session state, and races the real task. Validate selector/catalog,
tool installation, and `claude auth status` or `codex login status` first, then
use the real fresh review or worker launch as the authoritative probe. Existing
Claude `rate_limits` status input and `/usage` may warn about shared allowance,
but are advisory and cannot prove a specific candidate will accept the next
request. The helper therefore reports configured candidates, never "available"
candidates.

Attempt each candidate at most once per operation, in order, applying that
candidate's own effort. Advance with one visible warning only when structured
or version-pinned terminal evidence identifies a candidate-scoped condition:
model not found/retired, account or organization denial for that model, an
explicit model-specific quota such as an Opus limit, or terminal model overload
or unavailability after the tool's own bounded retries. The warning names the
exact failed selector, classified reason/reset time when supplied, and next
candidate. Never advance on authentication, billing, shared session/weekly
quota, generic 429/rate limit, request-size/invalid-request, transport, or
unclassified failure; record the provider degradation and STOP or use the
already-authorized single-provider/inline path as applicable.

Claude's native fallback chain may handle overload/unavailability, but it does
not encode a different effort per fallback and does not switch for generic rate
limits. Docks-managed operations therefore launch each expanded candidate
explicitly rather than collapsing `profile:claude-best` into one
`--fallback-model` invocation. A Docks skill cannot silently replace the model
of its already-running interactive parent: on a parent-only failure it surfaces
the exact `/model <model>` plus `/effort <effort>` or relaunch guidance for the
next candidate instead of claiming an automatic switch.

### Review policy v2

New requests bind this closed policy shape:

```text
ResolvedReviewPolicyV2 = {
  schema: 2,
  cross_company_consent: always|ask|never,
  zero_reviewer_policy: ask|proceed|block,
  orchestrator_preference: auto|in_session|cli,
  minimum_score: 0..100,
  max_rounds: 1..10,
  openai_tiers: [{model,effort,transports:[in_session|cli]}...],
  anthropic_tiers: [{model,effort,transports:[in_session|cli]}...],
  provenance: {<one source for every preceding policy field>}
}
```

New defaults are `minimum_score: 90` and `max_rounds: 3`. The runtime-global
record may override either independently after `docks-kit` validates its strict
integer range; current-turn instructions retain highest precedence. Existing
schema-v1 requests and receipts remain valid for historical verification and
shipping; new preparation emits policy v2. A schema-v1 receipt is not reusable
against a resolved v2 policy.

A passed leg satisfies the score gate only when `verdict=ready` and
`score >= minimum_score`. Eligibility requires every successfully available
leg to satisfy that gate. One unavailable provider preserves the existing
`single` outcome; the one passed leg must still satisfy the gate. Zero passed
legs retain the separately resolved zero-review policy.

### Bounded review operation

One round is X then S over the same verified bundle. The launches remain
independent: S does not receive X's output. Main-context plan-manager then
reproduces and reconciles findings. If repair changes canonical input, it commits
the new candidate, destroys the stale bundle, and prepares the next round.

Stop early when all passed legs satisfy the score gate and the reconciled
candidate remains current. After `max_rounds` without that result, leave the
plan non-executing and ask exactly two choices: `Run up to <max_rounds> more
rounds` or `Stop and keep the plan planned`, substituting the resolved positive
integer. Approval authorizes one additional bounded batch only; a resume without
current-turn approval asks again instead of continuing automatically. No score
waiver is inferred.

When a round returns `ready` below `minimum_score` with no reproducible finding,
there is nothing to repair. Count the round, destroy its bundle, prepare a new
request id over the same immutable commit/input, and launch fresh independent
reviewers. The unchanged canonical input is intentional; request and attempt
evidence remain distinct. The batch cap still applies.

### Implementation dispatch

After an eligible start and execution-base identity commit, resolve the first
available implementer candidate and compare it with the current writer.
Same-tool/current-model work stays in main context. A different available
provider uses exactly one session-relay depth-0 managed worktree worker pinned
to the selected model/effort:

```text
relay spawn <repo> --fanout --from <invoker-session> --tool <tool> --model <model> --effort <effort> -- "<bounded implementation task>"
relay handback --from <worker-session> --status completed --note "ready"
relay collect <worker-session> --from <invoker-session>
```

The worker edits only `affected_paths`, never edits the plan, commits everything,
and proves its worktree clean before `handback`. The exact stored parent alone
collects. A dirty tree, changed post-handback HEAD, or merge conflict is refused;
a merge conflict is aborted and remains a retryable handback. The worker starts
no leaves or nested relay roots and writes nothing after handback. If relay, the
selected provider, clean parent, or exact collection protocol is unavailable,
record degradation and use the current eligible writer inline rather than
opening a worker loop.

## Steps

| # | Task | Files | Depends | Status | Done condition |
|---|---|---|---|---|---|
| 1 | Define workflow-role precedence, the `profile:claude-best` candidate chain, Sol defaults, configurable score/round bounds, model-agnostic availability classification, single-provider degradation, direct review transport, and one-worker implementation dispatch. | `plugins/docks/skills/productivity/plan-manager/SKILL.md`; `plugins/docks/skills/productivity/plan-review/SKILL.md` | none | done | Both skills describe the exact expanded runtime-global record, X/S mapping, once-per-candidate availability behavior, resolved bounded-batch native question, interactive-parent limitation, and session-relay implementation-only boundary without contradictory transport guidance. |
| 2 | Add policy-v2 validation and score-gated eligibility while preserving historical schema-v1 request/receipt validation. | `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs`; `scripts/tests/plan-review-policy.mjs`; `scripts/tests/plan-review-policy-regressions.mjs` | 1 | done | New fixtures prove 89 fails under the default, 90 passes, ordered candidates and configured score/round bounds/provenance are enforced, candidate-specific versus provider-wide failures diverge correctly, every candidate is attempted at most once, policy changes invalidate reuse, unknown v2 keys fail closed, and representative v1 receipts still validate. |
| 3 | Replace the unbounded/self-review loop contract with configurable bounded-batch semantics, defaulting to 90 points and three rounds, in the repo contract and consumer template. | `docs/plans/AGENTS.md`; `plugins/docks/skills/AGENTS.md`; `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md` | 1, 2 | done | Source and template agree on resolved target, cap, early stop, continuation question, and the distinction between self-review iteration and sealed X/S evidence; the skill-author sync rule names the new bounded contract instead of the obsolete hill-climb constants. |
| 4 | Add an explicit `plan-init refresh` path for a two-folder contract that predates author identity and strong-default receipts, without moving plans or overwriting Codex agent customizations. | `plugins/docks/skills/productivity/plan-init/SKILL.md`; `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md` | 3 | done | Read-only classification reports `STALE_V2`; refresh requires explicit user intent, rewrites only the canonical plans contract/root Plans snippet and missing support files, leaves `active/`, `finished/`, and existing `.codex/agents/*.toml` unchanged, and is idempotent. |
| 5 | Run focused tests and the Docks plugin gate, then inspect the diff for schema compatibility and transport regressions. | all affected source/test paths | 1-4 | done | Every acceptance row passes and `node scripts/ci.mjs --plugin docks` exits 0; no review argv or transport enum admits relay. |
| 6 | Prove the implementation is completion-ready and preserve the exact downstream interface/release handoff in this plan. | all affected source/test paths; `docs/plans/active/workflow-model-roles-and-bounded-reviews.md` (plan-manager-only status/evidence writes) | 5 | done | A1-A4 and required project CI are green, every source/template role and review-policy statement agrees, all implementation steps are `done`, and no release/cache claim is made before completion review. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-review-policy.mjs` | Exits 0 and reports the plan-review policy suite passed, including policy-v2 score boundaries, ordered workflow candidates, candidate-specific fallback, and v1 compatibility cases. |
| A2 | `node scripts/tests/plan-review-policy-regressions.mjs` | Exits 0 and reports the regression suite passed, including stale-policy, closed-schema, low-score ineligibility, once-per-candidate attempts, and provider-wide/ambiguous failure STOP cases. |
| A3 | `node scripts/ci.mjs --plugin docks` | Exits 0 with the Docks plugin skills, agents, plan-policy tests, and manifest gates green. |
| A4 | `node -e "const fs=require('node:fs');const p=fs.readFileSync('plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs','utf8');if(/transports.*relay\|in_session.*cli.*relay/.test(p))process.exit(1);if(!p.includes('minimum_score')\|\|!p.includes('max_rounds'))process.exit(1)"` | Exits 0, proving the bound score/cap fields exist and relay was not added to reviewer transport enums. |
The required project CI is `node scripts/ci.mjs`; completion runs it once after
the ordered acceptance inventory rather than duplicating it as an acceptance
row.

## Post-ship release and downstream gate

This section runs only after plan-manager has produced a passed completion
receipt and moved this plan to `finished/`. It is not a Step-row prerequisite
for completion and does not place release-manifest mutations inside the reviewed
implementation range.

```bash
node scripts/release.mjs --dry-run --plugin docks patch
node scripts/release.mjs --plugin docks patch

export RELEASE_COMMIT="$(git rev-parse HEAD)"
export RELEASE_VERSION="$(jq -er '.version' plugins/docks/.codex-plugin/plugin.json)"
export RELEASE_TAG="docks--v$RELEASE_VERSION"
test "$(git rev-parse "$RELEASE_TAG^{commit}")" = "$RELEASE_COMMIT"
test "$(git ls-remote --heads origin refs/heads/main | awk 'NR==1 {print $1}')" = "$RELEASE_COMMIT"
gh release view "$RELEASE_TAG" --json isDraft,isPrerelease,tagName --jq 'select(.isDraft == false and .isPrerelease == false and .tagName == env.RELEASE_TAG) | .tagName'

codex plugin marketplace upgrade docks --json
codex plugin add docks@docks --json
claude plugin update docks@docks --scope user
export SOURCE_POLICY=plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs
export CODEX_POLICY="$HOME/.codex/plugins/cache/docks/docks/$RELEASE_VERSION/skills/productivity/plan-review/scripts/review-policy.mjs"
export CLAUDE_POLICY="$HOME/.claude/plugins/cache/docks/docks/$RELEASE_VERSION/skills/productivity/plan-review/scripts/review-policy.mjs"
test -f "$CODEX_POLICY" && test -f "$CLAUDE_POLICY"
test "$(sha256sum "$SOURCE_POLICY" | cut -d' ' -f1)" = "$(sha256sum "$CODEX_POLICY" | cut -d' ' -f1)"
test "$(sha256sum "$SOURCE_POLICY" | cut -d' ' -f1)" = "$(sha256sum "$CLAUDE_POLICY" | cut -d' ' -f1)"
codex plugin list | grep -F "docks@docks" | grep -F "$RELEASE_VERSION"
claude plugin list | grep -A3 -F "docks@docks" | grep -F "Version: $RELEASE_VERSION"
```

Every command must exit 0. Only then refresh the `public` plans contract and
create/start `docs/plans/active/workflow-model-role-overrides.md` there. That
downstream plan must inspect and cover the current ownership seams in
`SoT/models.json`, `cli/src/commands/models.ts`, `cli/src/main.ts`,
`cli/src/efforts.ts`, `cli/src/engine-native/models.ts`,
`cli/src/engine-native/parseArgs.ts`, generated SoT payload, CLI/golden tests,
and user-facing help/docs. It must add `docks-kit models workflow [--json]`, the
three root role flags, the two bounded review flags, strict pre-mutation
validation, fully expanded helper output, and fixture coverage for model-specific
fallback versus provider-wide STOP. A long-lived session never claims its
already-loaded skill bytes changed; start a fresh session for released behavior.

## Out of scope / do-NOT-touch

- `plugins/session-relay/rust/**`: no new relay reviewer mode or Rust lifecycle
  behavior is needed; direct CLI already supplies the required read-only review
  boundary.
- `plugins/session-relay/bin/**`: no binary rebuild/release is part of this plan.
- `/home/vagrant/projects/public/**`: stage two starts only after the Docks
  release and cache-equality gate; this single-repository plan must not write an
  external worktree.
- Legacy Docks `E/R/B/Q/F` compatibility predicates: policy-v1 receipts must
  continue to validate; do not broaden or reinterpret the legacy eligibility
  exception while adding policy v2.
- General code-review, security, refactor, or non-plan agent model selection:
  workflow roles apply only to the plan lifecycle described here.
- Arbitrary model IDs in Docks: strict key-to-model validation belongs to the
  downstream `docks-kit` producer; Docks consumes only a closed resolved record.

## Known gotchas

- Claude authentication is configured on this machine as of completion prep;
  `claude auth status --json` reports `loggedIn: true`. The real review launch
  remains the model-availability probe; authentication does not guarantee a
  selected candidate has quota.
- Local Claude Code `2.1.209` accepts `fable` and `claude-fable-5`, while public
  Anthropic documentation can lag entitlement-gated aliases. Runtime attempt is
  the final availability probe.
- Claude exposes shared usage windows through `/usage` and status-line
  `rate_limits`, but there is no cross-tool, side-effect-free preflight that
  proves an arbitrary model can accept the next request. Do not scrape TUI text
  or spend a probe request to manufacture certainty.
- Claude's fallback models share one session effort and generic rate limits do
  not trigger fallback. Preserve candidate-specific effort by launching each
  Docks candidate explicitly and distinguish an explicit model quota from
  shared session/weekly exhaustion.
- A score is already part of `ReviewerOutput`; changing eligibility without
  binding `minimum_score` into the policy hash would permit stale receipt reuse.
- Existing schemas are recursively closed. Adding fields to policy schema 1 in
  place would silently change its meaning; new preparation must emit v2 while
  legacy validation remains explicit.
- Sequential X then S does not mean S sees X. Supplying X output to S would
  destroy the independent-perspective property.
- The Docks release command commits and pushes manifest bumps, tags the commit,
  waits for tag CI, and creates the GitHub Release. Run it only from a clean tree
  after this plan has passed completion review and shipped.

## Global constraints

- "Research the codebase before editing. Never change code you have not read."
- "No secrets in committed config."
- "Run `node scripts/ci.mjs` before any commit — guards + scorers must be green."
- "Don't loosen validator floors to pass; fix the file instead."
- "Manifest version numbers stay in lockstep across `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and the versioned Claude marketplace catalog."
- "Skill bodies stay ≤500 lines per agentskills.io spec; sweet spot 80–310."
- Review workers are fresh, findings-only, explicit-model/effort, read-only, and
  consume one byte-identical sealed bundle.
- One writer owns the shared worktree and plan lifecycle state.
- No review operation runs more than the resolved `max_rounds` without a new
  current-user continuation decision; the default remains three.
- No workflow operation attempts one candidate more than once or describes a
  catalog entry as live-available before the real operation proves it.

## STOP conditions

- STOP if a representative schema-v1 request or receipt no longer validates;
  do not release a migration that strands active or finished plans.
- STOP if meeting the score gate requires adding `relay` to reviewer transport
  enums or exposing the mutable source worktree to a reviewer.
- STOP if `plan-init refresh` would overwrite active/finished plan content or an
  existing customized `.codex/agents/*.toml` file.
- STOP if the resolved workflow record names an unknown company/tool pairing,
  contains duplicate candidates/records, has a selector/expansion mismatch, or
  can only be partially parsed.
- STOP if candidate advancement depends on fuzzy error text, an extra quota-
  consuming probe, or treating shared/auth/billing/ambiguous failures as
  model-specific availability.
- STOP if the selected implementation worker cannot be isolated to one managed
  worktree/commit; use the current writer inline instead of sharing writes.
- STOP before the public stage if Docks release/tag CI or Claude/Codex cache
  equality is not proven.

## Cold-handoff checklist

- [x] File manifest: every Docks source, test, and contract file is named in
  `affected_paths` and the Steps table; post-ship release mutations are kept
  outside the reviewed implementation range.
- [x] Environment & commands: repository, base commit, setup, focused tests,
  plugin CI, full CI, preview, and release commands are exact.
- [x] Interface & data contracts: selector grammar, expanded workflow record,
  helper output, availability classification, policy v2, score eligibility,
  round semantics, X/S mapping, and implementation dispatch are closed above.
- [x] Executable acceptance: A1-A4 are ordered commands with binary expected
  outcomes; full CI is separately recorded for completion.
- [x] Out of scope: session-relay Rust/binaries, public source, legacy predicate
  reinterpretation, and unrelated model routing are excluded explicitly.
- [x] Decision rationale: direct review CLI preserves immutable evidence while
  session-relay is reserved for the one writable implementation handoff.
- [x] Known gotchas: local Claude auth, alias versus profile names, quota
  observability, candidate effort, schema versioning, reviewer independence,
  and release mutation are recorded.
- [x] Global constraints: repository and user constraints are copied verbatim or
  stated as exact operational invariants.
- [x] No undefined terms / forward refs: the downstream public plan slug and its
  creation gate are defined; no implementation type or file is left as TBD.

## Self-review
Review-receipt: {"S":{"raw":{"attempts":[{"child_id":null,"denial_source":"sandbox","effort":"xhigh","exit_code":null,"model":"gpt-5.6-sol","output_started":false,"reason":"host security denied sealed bundle export to an external model service","result":"platform_denied","retry_cause":null,"schema":1,"signal":null,"started":false,"stderr_sha256":null,"stdout_sha256":null,"timeout_mode":null,"timeout_seconds":600,"transport":"cli"}],"decision_evidence":null,"findings":[],"findings_sha256":null,"leg":"S","reason":"host security denied sealed bundle export to an external model service","request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"470275ecfcfdd60056238e4e106223a3f293f88d1126fac379412fe171970b6a","diff_sha256":null,"execution_base_commit":null,"input_sha256":"b2d829f639b64b4258e36faf6e850fbd98636fb21a4cd602f150649caf45c7ba","lifecycle_intent":"start","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"xhigh","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"current_user","cross_company_consent":"runtime_global","openai_tiers":"current_user","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"03e2a58f1e76fc1874129c51c4f41071c15280ab967eb99c54a386de475a451a","request_id":"ba396957-f1cb-4af9-8736-d0ed2ab1d21a","reviewed_commit_or_head":"aeb96a872fa7a3fc94c7ff91fd140aa0edf408f6","schema":1},"result":"platform_denied","reviewer_output":null,"schema":1,"selected":null,"severity_totals":{"high":0,"low":0,"medium":0},"waiver":null,"waiver_sha256":null},"reconciliation":{"accepted":[],"rejected":[]},"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"470275ecfcfdd60056238e4e106223a3f293f88d1126fac379412fe171970b6a","diff_sha256":null,"execution_base_commit":null,"input_sha256":"b2d829f639b64b4258e36faf6e850fbd98636fb21a4cd602f150649caf45c7ba","lifecycle_intent":"start","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"xhigh","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"current_user","cross_company_consent":"runtime_global","openai_tiers":"current_user","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"03e2a58f1e76fc1874129c51c4f41071c15280ab967eb99c54a386de475a451a","request_id":"ba396957-f1cb-4af9-8736-d0ed2ab1d21a","reviewed_commit_or_head":"aeb96a872fa7a3fc94c7ff91fd140aa0edf408f6","schema":1}},"X":{"raw":{"attempts":[],"decision_evidence":null,"findings":[],"findings_sha256":null,"leg":"X","reason":"authentication unavailable","request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"470275ecfcfdd60056238e4e106223a3f293f88d1126fac379412fe171970b6a","diff_sha256":null,"execution_base_commit":null,"input_sha256":"b2d829f639b64b4258e36faf6e850fbd98636fb21a4cd602f150649caf45c7ba","lifecycle_intent":"start","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"xhigh","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"current_user","cross_company_consent":"runtime_global","openai_tiers":"current_user","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"03e2a58f1e76fc1874129c51c4f41071c15280ab967eb99c54a386de475a451a","request_id":"ba396957-f1cb-4af9-8736-d0ed2ab1d21a","reviewed_commit_or_head":"aeb96a872fa7a3fc94c7ff91fd140aa0edf408f6","schema":1},"result":"unavailable_auth","reviewer_output":null,"schema":1,"selected":null,"severity_totals":{"high":0,"low":0,"medium":0},"waiver":null,"waiver_sha256":null},"reconciliation":{"accepted":[],"rejected":[]},"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"470275ecfcfdd60056238e4e106223a3f293f88d1126fac379412fe171970b6a","diff_sha256":null,"execution_base_commit":null,"input_sha256":"b2d829f639b64b4258e36faf6e850fbd98636fb21a4cd602f150649caf45c7ba","lifecycle_intent":"start","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"xhigh","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"current_user","cross_company_consent":"runtime_global","openai_tiers":"current_user","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"03e2a58f1e76fc1874129c51c4f41071c15280ab967eb99c54a386de475a451a","request_id":"ba396957-f1cb-4af9-8736-d0ed2ab1d21a","reviewed_commit_or_head":"aeb96a872fa7a3fc94c7ff91fd140aa0edf408f6","schema":1}},"author":{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"},"decision_evidence":{"actor":"repository owner","at":"2026-07-15T15:24:24-03:00","decision":"proceed","input_sha256":"b2d829f639b64b4258e36faf6e850fbd98636fb21a4cd602f150649caf45c7ba","kind":"zero_reviewer","reason":"Explicit current-turn authorization to start after Claude authentication was unavailable and host policy denied the Codex review export","request_id":"ba396957-f1cb-4af9-8736-d0ed2ab1d21a","schema":1},"input_sha256":"b2d829f639b64b4258e36faf6e850fbd98636fb21a4cd602f150649caf45c7ba","outcome":"zero_degraded","phase":"draft","policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"xhigh","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"current_user","cross_company_consent":"runtime_global","openai_tiers":"current_user","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"03e2a58f1e76fc1874129c51c4f41071c15280ab967eb99c54a386de475a451a","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"470275ecfcfdd60056238e4e106223a3f293f88d1126fac379412fe171970b6a","diff_sha256":null,"execution_base_commit":null,"input_sha256":"b2d829f639b64b4258e36faf6e850fbd98636fb21a4cd602f150649caf45c7ba","lifecycle_intent":"start","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"xhigh","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"current_user","cross_company_consent":"runtime_global","openai_tiers":"current_user","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"03e2a58f1e76fc1874129c51c4f41071c15280ab967eb99c54a386de475a451a","request_id":"ba396957-f1cb-4af9-8736-d0ed2ab1d21a","reviewed_commit_or_head":"aeb96a872fa7a3fc94c7ff91fd140aa0edf408f6","schema":1},"reviewed_at":"2026-07-15T15:24:24-03:00","reviewed_commit":"aeb96a872fa7a3fc94c7ff91fd140aa0edf408f6","schema":1}

Score: 92/100 · trajectory 64→92 · stopped: target reached in 2 rounds.

- The fresh cold-read scored the first written candidate 64/100 and found a
  completion/release deadlock, ambiguous duplicate records, an incomplete relay
  worktree protocol, a repairless low-score gap, and missing release/cache
  evidence. The revision moved release after plan ship, defined identical-record
  deduplication, copied the exact fanout/handback/collect contract, made unchanged
  input reviewable under a fresh request id, and added executable post-release
  verification.
- The earlier author pass did not distinguish the requested session-relay handoff from
  schema review transport; the revision made review direct/read-only and limited
  relay to one implementation worktree.
- The first pass treated a static catalog as proof of subscription availability;
  the revision retained auth preflight plus model attempt-as-probe.
- The workflow-profile pass separated named profiles from native model aliases,
  expanded every role to an immutable ordered candidate list, and made the real
  operation—not a quota-consuming ping—the definitive availability probe.
- The first pass lacked historical receipt compatibility and a safe public-plan
  bootstrap; the revision added policy v2/v1 validation and explicit stale-v2
  `plan-init refresh` before the downstream plan.
- Residual eight points reflect the unavailable Claude leg at draft time and
  the fact that exact `public` CLI files belong in the linked downstream plan,
  not this repository-sealed plan.

## Review

(filled by plan-review on completion)

## Mistakes & Dead Ends

- **2026-07-15T12:40:17-03:00**: Considered one plan with absolute paths into
  `/home/vagrant/projects/public` → the review helper rejects repository escapes
  and cannot bind two Git heads → stage Docks first, then create a linked public
  plan after the released contract can refresh its stale plans node.
- **2026-07-15T16:24:35-03:00**: The first mutation rerun routed the new
  max-round lower-bound mutation through `validation-matrix` even though the
  boundary assertion lives in `schemas` → the mutated artifact passed for the
  wrong reason → added a focused `schemas` selector and kept the assertion
  unchanged.
- **2026-07-15T16:28:46-03:00**: First completion-bundle preparation rejected
  A4 with `acceptance table column mismatch` → the JavaScript alternation and
  logical-or pipes were not escaped for Markdown table parsing → escaped those
  table delimiters while preserving the extracted command byte-for-byte.

## Sources

- `plugins/docks/skills/productivity/plan-manager/SKILL.md:34` — policy currently
  resolves from current user, loaded global guidance, then dated skill default.
- `plugins/docks/skills/productivity/plan-manager/SKILL.md:103` — draft review
  currently repeats after accepted findings without a numeric round cap.
- `plugins/docks/skills/productivity/plan-manager/SKILL.md:138` — reviewer
  dispatch is explicitly read-only and rejects session-relay in schema v1.
- `plugins/docks/skills/productivity/plan-review/SKILL.md:35` — the request binds
  author, immutable inputs, policy, and policy hash.
- `plugins/docks/skills/productivity/plan-review/SKILL.md:123` — provider auth and
  model entitlement already use preflight plus bounded attempt-as-probe.
- `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs:280` —
  current closed policy schema has no score threshold or round cap.
- `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs:569` —
  current eligibility checks `ready` but does not use the persisted score.
- `plugins/docks/skills/productivity/plan-init/SKILL.md:68` — any two-folder
  contract is currently classified as V2 and skipped, even when it predates the
  strong-default receipt schema.
- `docs/plans/AGENTS.md:216` — current self-review can run to an eight-round cap,
  which conflicts with the requested bounded three-round workflow.
- `plugins/session-relay/skills/productivity/session-relay/SKILL.md:408` — relay
  spawn is a writable resumable worker and is deliberately rejected for
  canonical schema review.
- `/home/vagrant/projects/public/SoT/models.json` — the current kit catalog
  already distinguishes Claude/Codex aliases and IDs but is permissive for
  unknown deploy-time model values; workflow selectors require a stricter layer.
- `/home/vagrant/projects/public/cli/src/commands/models.ts` — the existing
  `docks-kit models [tool] [--json]` helper is the extension seam for `workflow`.
- `/home/vagrant/projects/public/cli/src/engine-native/parseArgs.ts` — current
  bare model/effort flags print catalogs and reject missing values before sync;
  workflow-role flags must preserve that behavior.
- `/home/vagrant/projects/public/SoT/.claude/bin/statusline.mjs` — current Claude
  status rendering consumes shared five-hour/seven-day `rate_limits`; it does
  not expose a generic per-candidate availability contract.
- [Claude Code model configuration](https://code.claude.com/docs/en/model-config)
  — `best` is a native alias, fallback chains are availability-scoped and
  session-effort-bound, and effort support/defaults vary by model.
- [Claude Code error reference](https://code.claude.com/docs/en/errors) — model-
  specific limits can permit a manual model switch, while shared session/weekly
  limits, generic throttles, authentication, and billing require different
  handling.
- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks) —
  `StopFailure` supplies typed terminal error categories for notification but
  cannot control or transparently restart an interactive session.
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents) — fresh
  subagents have isolated context and model selection can be explicitly pinned.
- [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference#configtoml)
  — Codex supports explicit model and reasoning-effort configuration consumed by
  the direct reviewer CLI.

## Notes

- Downstream public plan name: `workflow-model-role-overrides`.
- Downstream defaults: orchestrator `profile:claude-best` expanding to
  `claude:fable@high` then `claude:opus@xhigh`; reviewer and implementer
  `codex:gpt-5.6-sol@xhigh`.
- Downstream CLI shorthand: `docks-kit --model-orchestrator=<selector>`,
  `docks-kit --model-reviewer=<selector>`, and
  `docks-kit --model-implementer=<selector>`; selectors are either
  `profile:<name>` or `<tool>:<model>@<effort>`.
- Downstream helper: `docks-kit models workflow [--json]`; bare role flags print
  the same strict selector registry and fully expanded candidates, state that
  live availability is checked when used, then exit 2 without mutation.
- Downstream review controls: `docks-kit --review-min-score=<0..100>` and
  `docks-kit --review-max-rounds=<1..10>`; omitted values retain defaults 90 and
  3, and invalid/non-integer values fail before either global file is changed.
