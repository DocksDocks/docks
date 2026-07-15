---
title: Add workflow model roles and bounded plan reviews
goal: Ship configurable workflow model roles and a three-round, 90-point plan-review gate without weakening sealed review evidence or single-provider degradation.
status: planned
created: "2026-07-15T12:40:17-03:00"
updated: "2026-07-15T12:40:17-03:00"
started_at: null
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
execution_base_commit: null
---

# Add workflow model roles and bounded plan reviews

## Goal

Ship the Docks half of a cross-repository workflow policy that defaults to a
Fable Claude orchestrator, a GPT-5.6 Sol independent reviewer and implementer,
and fresh Fable same-company review. A plan-review operation must stop early
when every available reviewer is ready at 90/100 or higher, stop after three
rounds otherwise, and ask the user before authorizing another bounded batch.

The review transport remains the existing sealed, read-only direct CLI or an
execution-enforced read-only in-session reviewer. Session-relay is reserved for
one managed cross-provider implementation handoff after a plan starts; it is
not made a schema review transport.

## Context & rationale

The user made these decisions:

- Fable is the preferred interactive orchestrator and plan author.
- GPT-5.6 Sol reviews the Fable-authored plan first; a fresh Fable reviewer then
  supplies the independent author-company leg over the same immutable input.
- Both available legs target 90/100, with at most three repair/review rounds per
  user-authorized batch. If the target is still missed, use the runtime's native
  user-question UI to ask whether to run another bounded batch.
- GPT-5.6 Sol is the default implementation worker unless a higher-precedence
  workflow-role override selects another kit-verified model.
- Provider availability is detected at runtime. A missing Claude or Codex
  subscription records exact degradation and does not make the other provider
  unusable.
- `docks-kit` in `/home/vagrant/projects/public` will supply strict
  `--model-orchestrator`, `--model-reviewer`, and `--model-implementer`
  deployment overrides after this Docks contract is released.

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
Docks-workflow-models: {"implementer":{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"},"orchestrator":{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},"reviewer":{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"},"schema":1}
```

Each role is closed to `company`, `tool`, `model`, and `effort`. Current-turn
user instructions override the record; the record overrides dated skill
defaults. Multiple byte-identical records are deduplicated because Claude and
Codex receive parallel global instruction files; two valid records with
different JCS values are a conflicting duplicate and STOP policy resolution.
An invalid or internally inconsistent record is ignored as a whole with one
surfaced warning, never partially applied.

For an Anthropic-authored plan, the preferred reviewer supplies X and a fresh
orchestrator-tier Claude supplies S. For an OpenAI-authored plan, company
identity still controls X/S: the Anthropic orchestrator tier supplies X and the
OpenAI reviewer tier supplies S. The cross-company invariant wins over a role
name when both configured roles name the same company.

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

New defaults are `minimum_score: 90` and `max_rounds: 3`. Existing schema-v1
requests and receipts remain valid for historical verification and shipping;
new preparation emits policy v2. A schema-v1 receipt is not reusable against a
resolved v2 policy.

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
plan non-executing and ask exactly two choices: `Run up to 3 more rounds` or
`Stop and keep the plan planned`. Approval authorizes one additional bounded
batch only; a resume without current-turn approval asks again instead of
continuing automatically. No score waiver is inferred.

When a round returns `ready` below `minimum_score` with no reproducible finding,
there is nothing to repair. Count the round, destroy its bundle, prepare a new
request id over the same immutable commit/input, and launch fresh independent
reviewers. The unchanged canonical input is intentional; request and attempt
evidence remain distinct. The batch cap still applies.

### Implementation dispatch

After an eligible start and execution-base identity commit, compare the selected
implementer role with the current writer. Same-tool/current-model work stays in
main context. A different available provider uses exactly one session-relay
depth-0 managed worktree worker pinned to the selected model/effort:

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
| 1 | Define workflow-role precedence, Fable/Sol defaults, single-provider degradation, direct review transport, and one-worker implementation dispatch. | `plugins/docks/skills/productivity/plan-manager/SKILL.md`; `plugins/docks/skills/productivity/plan-review/SKILL.md` | none | planned | Both skills describe the exact runtime-global record, X/S mapping, three-round native-question stop, and session-relay implementation-only boundary without contradictory transport guidance. |
| 2 | Add policy-v2 validation and score-gated eligibility while preserving historical schema-v1 request/receipt validation. | `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs`; `scripts/tests/plan-review-policy.mjs`; `scripts/tests/plan-review-policy-regressions.mjs` | 1 | planned | New fixtures prove 89 fails, 90 passes, single-provider score gating works, policy changes invalidate reuse, unknown v2 keys fail closed, and representative v1 receipts still validate. |
| 3 | Replace the unbounded/self-review loop contract with the same 90-point, three-round bounded-batch semantics in the repo contract and consumer template. | `docs/plans/AGENTS.md`; `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md` | 1, 2 | planned | Source and template agree on target, cap, early stop, continuation question, and the distinction between self-review iteration and sealed X/S evidence. |
| 4 | Add an explicit `plan-init refresh` path for a two-folder contract that predates author identity and strong-default receipts, without moving plans or overwriting Codex agent customizations. | `plugins/docks/skills/productivity/plan-init/SKILL.md`; `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md` | 3 | planned | Read-only classification reports `STALE_V2`; refresh requires explicit user intent, rewrites only the canonical plans contract/root Plans snippet and missing support files, leaves `active/`, `finished/`, and existing `.codex/agents/*.toml` unchanged, and is idempotent. |
| 5 | Run focused tests and the Docks plugin gate, then inspect the diff for schema compatibility and transport regressions. | all affected source/test paths | 1-4 | planned | Every acceptance row passes and `node scripts/ci.mjs --plugin docks` exits 0; no review argv or transport enum admits relay. |
| 6 | Prove the implementation is completion-ready and preserve the exact downstream interface/release handoff in this plan. | all affected source/test paths; `docs/plans/active/workflow-model-roles-and-bounded-reviews.md` (plan-manager-only status/evidence writes) | 5 | planned | A1-A4 and required project CI are green, every source/template role and review-policy statement agrees, all implementation steps are `done`, and no release/cache claim is made before completion review. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-review-policy.mjs` | Exits 0 and reports the plan-review policy suite passed, including policy-v2 score boundary and v1 compatibility cases. |
| A2 | `node scripts/tests/plan-review-policy-regressions.mjs` | Exits 0 and reports the regression suite passed, including stale-policy, closed-schema, and low-score ineligibility cases. |
| A3 | `node scripts/ci.mjs --plugin docks` | Exits 0 with the Docks plugin skills, agents, plan-policy tests, and manifest gates green. |
| A4 | `node -e "const fs=require('node:fs');const p=fs.readFileSync('plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs','utf8');if(/transports.*relay|\['in_session', 'cli', 'relay'\]/.test(p))process.exit(1);if(!p.includes('minimum_score')||!p.includes('max_rounds'))process.exit(1)"` | Exits 0, proving the bound score/cap fields exist and relay was not added to reviewer transport enums. |
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
create/start `docs/plans/active/workflow-model-role-overrides.md` there. A
long-lived session never claims its already-loaded skill bytes changed; start a
fresh session for released behavior.

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

- Claude is currently installed but unauthenticated on this machine;
  `claude auth status --json` reports `loggedIn: false`. Canonical review may
  therefore degrade to the OpenAI S leg during this plan. That is an expected
  availability outcome, not permission to fake a Fable score.
- Local Claude Code `2.1.209` accepts `fable` and `claude-fable-5`, while public
  Anthropic documentation can lag entitlement-gated aliases. Runtime attempt is
  the final availability probe.
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
- No review operation runs more than three rounds without a new current-user
  continuation decision.

## STOP conditions

- STOP if a representative schema-v1 request or receipt no longer validates;
  do not release a migration that strands active or finished plans.
- STOP if meeting the score gate requires adding `relay` to reviewer transport
  enums or exposing the mutable source worktree to a reviewer.
- STOP if `plan-init refresh` would overwrite active/finished plan content or an
  existing customized `.codex/agents/*.toml` file.
- STOP if the resolved workflow record names an unknown company/tool pairing,
  contains duplicate records, or can only be partially parsed.
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
- [x] Interface & data contracts: workflow record, policy v2, score eligibility,
  round semantics, X/S mapping, and implementation dispatch are closed above.
- [x] Executable acceptance: A1-A4 are ordered commands with binary expected
  outcomes; full CI is separately recorded for completion.
- [x] Out of scope: session-relay Rust/binaries, public source, legacy predicate
  reinterpretation, and unrelated model routing are excluded explicitly.
- [x] Decision rationale: direct review CLI preserves immutable evidence while
  session-relay is reserved for the one writable implementation handoff.
- [x] Known gotchas: local Claude auth, alias availability, schema versioning,
  reviewer independence, and release mutation are recorded.
- [x] Global constraints: repository and user constraints are copied verbatim or
  stated as exact operational invariants.
- [x] No undefined terms / forward refs: the downstream public plan slug and its
  creation gate are defined; no implementation type or file is left as TBD.

## Self-review

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
- The first pass lacked historical receipt compatibility and a safe public-plan
  bootstrap; the revision added policy v2/v1 validation and explicit stale-v2
  `plan-init refresh` before the downstream plan.
- Residual eight points reflect the unavailable Claude leg in this environment and
  the fact that exact `public` CLI files belong in the linked downstream plan,
  not this repository-sealed plan.

## Review

(filled by plan-review on completion)

## Mistakes & Dead Ends

- **2026-07-15T12:40:17-03:00**: Considered one plan with absolute paths into
  `/home/vagrant/projects/public` → the review helper rejects repository escapes
  and cannot bind two Git heads → stage Docks first, then create a linked public
  plan after the released contract can refresh its stale plans node.

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
- [Claude Code model configuration](https://code.claude.com/docs/en/model-config)
  — `--model` accepts aliases or full model names and runtime/account policy can
  restrict actual availability.
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents) — fresh
  subagents have isolated context and model selection can be explicitly pinned.
- [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference#configtoml)
  — Codex supports explicit model and reasoning-effort configuration consumed by
  the direct reviewer CLI.

## Notes

- Downstream public plan name: `workflow-model-role-overrides`.
- Downstream defaults: orchestrator `claude-fable`, reviewer
  `gpt-5.6-sol`, implementer `gpt-5.6-sol`.
- Downstream CLI shorthand: `docks-kit --model-orchestrator=<key>`,
  `docks-kit --model-reviewer=<key>`, and
  `docks-kit --model-implementer=<key>`; bare flags print the strict
  kit-verified workflow selector list.
