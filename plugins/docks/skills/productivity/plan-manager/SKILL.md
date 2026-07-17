---
name: plan-manager
description: Use when the user asks to list, show, create, review, start, block, schedule, complete, or ship a Docks plan. Main-context public orchestrator for one bounded primary review, canonical receipts, and status-as-field lifecycle transitions. Not for bootstrapping plans (use plan-init) or acting as an evidence-only reviewer (use plan-review internally).
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-07-17"
  content_hash: "a3747fc4b1e05a62ae54727c2e91940b7f28e3248d907dd2d79c3c4b11b50c2c"
---

# Plan Manager

Own the public plan lifecycle over `docs/plans/active/` and `finished/`.
Main-context plan-manager is the sole review dispatcher, finding reconciler,
receipt writer, status writer, and intent applier. `plan-review` is internal and
returns typed evidence only.

<constraint>
**Review before execution.** Every newly drafted plan receives one bounded independent primary review. `new` commits `planned` or `scheduled` first; `start`, schedule fire, and `auto_execute` call `prepare(intent) → main-context review dispatch → apply`. Missing, stale, mismatched, unavailable, or blocked evidence never enters `ongoing`. One eligible intent is consumed once.
</constraint>

<constraint>
**Sole-writer protocol.** Main-context plan-manager alone resolves policy, dispatches the primary reviewer, reproduces and reconciles findings, writes receipts, and changes lifecycle state. A plan-manager subagent may prepare or apply a caller-supplied typed result, but cannot dispatch another agent; it returns `NeedsMainReviewDispatch` to main context.
</constraint>

<constraint>
**Availability fallback is narrow.** Try the ordered primary candidates only until the first valid output. Advance only for `tool_unavailable`, `auth_failed`, or `model_unavailable` before output starts and before a parsed result exists. Host denial and every failure after substantive output are terminal; never retry through another transport or candidate.
</constraint>

<constraint>
**Status is a field; commits preserve handoff.** Transitions edit frontmatter and auto-commit the plan. `git mv` happens only on ship to `finished/<date>-<slug>.md`. Never create old status directories or force-push. After any write, render Tier 3 and surface unresolved questions through the native picker.
</constraint>

## Policy resolution

Resolve workflow roles through ordinary instruction precedence: current-turn
user > byte-deduplicated, already-loaded `Docks-workflow-models:` records > dated
skill defaults. Do not read a new consumer env var, config file, or mutable model
catalog. Identical compact-JCS records from parallel global instruction files are
one record. Two valid records with different values STOP. Ignore an invalid or
internally inconsistent record as a whole and surface one warning.

New review preparation emits this recursively closed policy:

```text
CurrentReviewPolicyV5 = {
  schema: 5,
  role: "primary",
  fallback: "availability_only",
  max_rounds: 2,
  candidates: [
    {company:"openai", tool:"codex", model:"gpt-5.6-sol",
     effort:"high", service_tier:"default"},
    {company:"anthropic", tool:"claude", model:"fable", effort:"high"},
    {company:"anthropic", tool:"claude", model:"opus", effort:"xhigh"}
  ],
  provenance: {role, fallback, max_rounds, candidates}
}
```

Candidate order and every candidate object are exact. The array is closed,
ordered, and nonempty. A current-turn user may pin one eligible candidate for
one review; that narrows the array and never adds a second reviewer. Every
provenance value is exactly `current_user | runtime_global | skill_default`.
Re-resolve before receipt reuse and apply; any value, provenance, candidate
order, effort, service tier, or transport change invalidates old evidence.

Historical compatibility is validation-only. Policy v1-v4, request/output/run/
receipt schemas 1-3, X/S legs, numeric `minimum_score` and rubric fields,
cross-company consent, zero-review progression, and the five-round policy-v4
series retain their persisted meanings and validation results. Historical
workflow model record schemas 1-2 retain their closed
`company/tool/model/effort[/service_tier]` candidate grammar, selector bytes,
integer score/round bounds, and `profile:<name>` /
`<tool>:<model>@<effort>[+fast]` selectors. Do not emit those fields in a new
schema-5 policy, request, output, run, or receipt. Direct
`validateDraftReceipt` without a resolved current policy remains historical
structural verification only.

## Author identity and waivers

New plan frontmatter records:

```text
review_author_company: openai|anthropic|unknown
review_author_tool: non-empty string
review_author_model: non-empty string
review_author_effort: non-empty string
review_waivers: []
```

Capture identity at creation; never infer it after handoff. Ask once for legacy
`unknown` before the first review and persist the answer. Current schema 5 does
not derive reviewer company from author identity: it always uses the resolved
ordered primary candidate chain.

A new waiver is strict one-line JCS in `review_waivers` and binds `phase`,
canonical `input_sha256`, exactly `roles:["primary"]`, actor, non-empty reason,
and ISO time. Write it only from an explicit current-user decision.
Duplicate/conflicting `(phase,input_sha256,role)` entries STOP. Historical
waivers with normalized unique `legs:[X|S]` retain their persisted policy-v1-v4
meaning; never rewrite them into current waivers.

## Operations

| User intent | Operation |
|---|---|
| list/show | Read active+finished and render the requested tier |
| new plan | Draft, self-review, commit non-executing state, then review with intent `none` |
| review plan | Public alias to main-context `prepare(none) → dispatch → apply` without state change |
| start | Review with intent `start`, then apply once if eligible |
| block/unblock | Edit status/block fields; auto-commit; `started_at` remains set once |
| schedule fire | Review with `schedule_fire`; keep scheduled on ask/block/stale evidence |
| auto execute | Review with `auto_execute`; keep scheduled until eligible apply |
| all steps done | Commit plan-only `in_review`, then completion review |
| ship | Require current `review_status: passed` and reusable completion receipt; move once |

Detect deprecated five-folder layouts and STOP with an offer to run `plan-init`.
`active/` is multi-occupancy; another live plan never blocks this operation.

## Draft and cold-handoff review

Before writing a new plan, read every cited source/affected path. Include the
required spine and cold-handoff sections from `docs/plans/AGENTS.md`. Run one
local evidence-backed checklist pass; it is author feedback, not canonical
primary-review evidence. Every unresolved guess becomes a structured
`## Open question` and is surfaced through the native picker.

Once the candidate is ready:

1. Record author identity and `review_waivers: []`.
2. Commit `planned`, or `scheduled` with trigger fields. Do not execute.
3. Call `prepare(none)` and dispatch one primary review over the sealed bundle.
4. Independently reproduce every finding against the sealed bundle/source.
5. Partition all reproduced ids into accepted and rejected, with a reason for
   every rejection. `non_blocking_gap` is advisory and never enters repair.
6. If and only if every raw `blocking_gap` is independently reproduced and
   explicitly accepted, invoke `plan-improver` once with that complete blocker
   set. Apply its minimal section-level patch as sole writer, commit,
   destroy the stale bundle, and seal `previous-plan.review.md` plus compact-JCS
   `repair-targets.json`. The round-2 request must bind a changed input, the
   previous input hash, and the exact accepted-repair-target digest.
7. Dispatch optional repair round 2 only after the helper validates that
   transition. It may inspect only the accepted targets and blocking regressions
   introduced by their repair. There is no round 3, reset, continuation batch,
   unchanged-input repair, or candidate rotation after output.
8. A `pass` or `non_blocking_gap` verdict is terminal without repair. Any
   `blocking_gap` makes that run `not_ready`, even when rejected during
   reconciliation. Repair may proceed only when every raw blocker is accepted;
   one rejected blocker terminates the series. At round 2, every remaining or
   new blocker is terminal `not_ready`; only a blocker-free repair output may
   pass.
9. Write one canonical schema-5 receipt only after input/policy/bundle
   revalidation. Embed the complete validated `ReviewSeriesV5`; its final round
   must equal the receipt-derived run exactly. Completion rounds retain the
   same `planned_at_commit` and `execution_base_commit`.

The current reviewer checklist is closed to
`standalone_executability`, `actionability`, `dependency_order`,
`evidence_reverification`, `goal_coverage`, `executable_acceptance`,
`failure_modes`, and `open_questions`. Each criterion is
`{status:pass|non_blocking_gap|blocking_gap,evidence:<nonempty>}`. The verdict
equals the strongest criterion status; every gap criterion maps to at least one
matching finding, every finding matches its criterion and status, and `pass`
has no findings.

For each current Codex attempt, main context runs
`reviewer-workspace-prepare <request-id> primary`, passes that closed result and
the validated prior-attempt ledger to the argv builder, verifies the sealed
bundle again after the attempt, then runs
`reviewer-workspace-cleanup <request-id> primary <prepared-json>`. The builder
derives and enforces the exact next policy candidate; it rejects substituted or
skipped tool/model/effort/service-tier tuples. The disposable workdir is outside
the bundle; Codex receives `--ephemeral --ignore-user-config` plus explicit
model, effort, `service_tier:"default"` (Standard), and read-only sandbox values.

For either stale-bundle case, plan-manager main context must invoke exactly one
policy-owned cleanup command using the path and hash from the current request:
`node <plan-review-skill-dir>/scripts/review-policy.mjs destroy-bundle <bundle-path> <expected-bundle-sha256>`.
Never use shell `chmod` or `rm` for review-bundle cleanup. A cleanup rejection is
a STOP; preserve the bundle and report the helper error.

## `prepare(intent)`

Valid intents are `none | start | schedule_fire | auto_execute`.

1. Confirm the plan's current non-executing state permits the intent.
2. Re-read the plan and contract; require clean plan+affected paths.
3. Compute canonical plan view through plan-review's bundled
   `scripts/review-policy.mjs`. Lifecycle fields, waivers, and exact one-line
   machine records are excluded; ordinary Self-review/Review prose remains.
4. Resolve and JCS-hash schema-5 policy; validate matching primary-role waiver.
5. Fix immutable commit/head and seal manifest schema 3 (full) or 4 (repair),
   with `review_schema:5` and only
   `reviewer_schemas:{primary:"reviewer-output.primary.v5.schema.json"}`.
   Verify every file/hash/mode and compute the bundle hash. Raw source-plan
   export is forbidden; reviewers see only `plan.review.md`. Historical
   manifest schemas 1/2 and their X/S files remain byte-compatible.
6. Create one schema-5 `ReviewRequestEnvelope` carrying phase, intent,
   immutable input, canonical/bundle/policy hashes, persisted author identity,
   full policy snapshot, `review_mode: full|repair`, and `round_index: 1|2`.
   Round 1 binds null previous-input and repair-target hashes. Round 2 requires
   the changed input plus nonnull previous-input and exact accepted-target
   hashes. Draft-only completion fields are null. Completion additionally binds
   `planned_at_commit`, `execution_base_commit`, canonical binary `diff_sha256`,
   and the canonical acceptance-inventory hash.
7. Return `NeedsMainReviewDispatch` containing the exact request and ordered
   primary candidate dispatch description. If already in main context, proceed
   to dispatch once.

No lifecycle field changes during prepare. Any escape, submodule, dirty scoped
path, seal mutation, duplicate, unsupported file, request mismatch, round 3, or
invalid repair transition is a STOP.

## Dispatch and decisions

Current `ReviewRequestEnvelope`, attempts, reviewer output, run result, and
receipt use schema 5; the policy and reviewer output carry role `primary`. They
contain no X/S leg, numeric score or rubric, cross-company-consent decision, or
zero-review field. Session Relay is invalid review transport under every policy
version.

Select one execution-enforced read-only transport for each ordered candidate.
Codex runs at `gpt-5.6-sol`, `high`, explicit
`service_tier:"default"` (Standard); then Claude Fable/high; then Claude
Opus/xhigh.
The first valid reviewer output wins.

A raw `failed` result cannot discard an attempt that actually passed.
Candidate advancement is allowed only when the typed result is exactly
`tool_unavailable`, `auth_failed`, or `model_unavailable`, with
`output_started:false` and no parsed reviewer result. `platform_denied`, timeout
or deadline, transient transport failure, signal, nonzero exit, output/parse/
schema failure, any parsed finding, or any substantive output/verdict is
terminal. Never change transport after authoritative host denial, rotate after
output starts, retry a terminal candidate, or shop for a favorable verdict.

Current outcomes are:

| Evidence | Outcome |
|---|---|
| valid `pass` or `non_blocking_gap` output | `passed`, eligible after reconciliation |
| valid `blocking_gap` output | `not_ready`, eligible only after a successful allowed repair review |
| all candidates exhausted by allowed pre-output availability outcomes | `unavailable`, ineligible |
| exact current-user primary-role/input waiver | `waived`, eligible as explicitly authorized |

Zero successful candidates never fabricate `passed`; absent an exact waiver,
preserve `planned`/`scheduled`/`in_review` and report `unavailable`.

Historical policy v1-v4 dispatch remains validation-only with its persisted X/S
order, consent and zero-review decisions, candidate advancement rules, typed
degradation, bounded policy-v1 transient retry, score gates, and
`dual|single|zero_degraded|blocked` outcomes. Never reinterpret a historical
record as schema 5.

## `apply`

Accept only the exact typed run result returned for the prepared request.

1. Re-read and re-hash canonical input, bundle, resolved policy, provenance,
   decisions, and waivers. Require a byte-identical schema-5 request echo.
2. Validate attempt bounds/results, the checklist/verdict/finding linkage,
   finding hashes, the independently reproduced accepted/rejected partition,
   outcome, and complete bounded review series. The series final round must
   equal the receipt-derived run exactly. Plan-review returns evidence only and
   never supplies reconciliation; plan-manager owns the bounded series.
3. Write compact JCS `Review-receipt:` (draft) or
   `Completion-review-receipt:` (completion), including that series, into the
   appropriate plan section.
4. For intent `none`, leave status unchanged. For eligible `start`,
   `schedule_fire`, or `auto_execute`, mark the intent consumed and commit only
   the plan with `ongoing`/first `started_at`. Capture that exact commit SHA,
   then record it as `execution_base_commit` in a second plan-only commit before
   implementation or assignee dispatch.
5. If evidence is ineligible/stale, write only the exact terminal evidence when
   allowed and leave the non-executing status unchanged.
6. Auto-commit the plan-only receipt/transition and render Tier 3.

Current draft receipt schema 5 binds phase, exact request, reviewed commit,
canonical input, policy/hash, raw primary review, accepted/rejected partition,
reproduced evidence, outcome, eligibility, and review time. Completion binds the
same review evidence plus planned/start/head identities, exact diff hash,
nonempty ordered acceptance inventory/hash, primary completion evidence, and
the derived `completion_verdict`. Evidence covers every inventory row once in
the same order with identical ID/command/expected. `passed` requires the goal
met, every acceptance met, CI exit 0, no recorded regression, no high primary
completion finding, and no unresolved accepted blocking review finding. A later
ordinary prose or policy edit invalidates reuse; excluded lifecycle fields and
the receipt's own exact line do not.

Historical schemas 1-3 keep their existing raw X/S verdict, score,
confirmation, rubric, completion, and receipt-validation meanings. Policy-v1
completion retains its historical ready-only rule.

## Implementation role dispatch

After eligible start and the execution-base identity commit, resolve the first
available implementer candidate. If the same interactive tool is selected but
its effective model or effort does not match, ask the user to run
`/model <model>` and `/effort <effort>` rather than silently retargeting the
parent session. Same-tool/current-model work stays in main
context only when its required effective service tier is positively known and
matches. Unknown or mismatched tier isolates through Relay or records explicit
degradation; ambient Fast is never inherited. A selected different provider MUST use exactly one depth-0 managed
worktree worker, pinned to the selected model and effort:

```text
relay spawn <repo> --fanout --from <invoker-session> --tool <tool> --model <model> --effort <effort> [--service-tier default|fast for Codex] -- "<bounded implementation task>"
relay handback --from <worker-session> --status completed --note "ready"
relay collect <worker-session> --from <invoker-session>
```

Treat the real worker launch as the model probe. Before any worker is accepted,
candidate-specific terminal model failure advances through the ordered
implementer chain, attempting each candidate once. Provider-wide, authentication,
billing, shared-quota, relay, clean-parent, or ambiguous launch failure stops
rotation and records degradation. Once a worker is created, do not launch
another candidate.

Every Codex Relay launch includes `--service-tier fast` for a Fast candidate or
`--service-tier default` for an unsuffixed candidate. Never pass this flag to
Claude. A Codex orchestrator selector is supported only when the current-context
tier is provably the requested tier; otherwise reject that candidate clearly or
run an isolated tier-pinned orchestrator. Never claim an ambient tier satisfies it.

The worker edits only `affected_paths`, never the plan, commits everything,
proves its worktree clean before handback, starts no leaves, and writes nothing
after handback. Only the stored parent collects. Refuse a dirty tree, changed
post-handback HEAD, or merge conflict; abort the conflicted collection. If relay,
the selected provider chain, a clean parent, or exact collection protocol is
unavailable, record degradation and continue with the current eligible writer
inline. Never open a worker loop.

## Docks-only legacy start compatibility

Strict validation runs first; only the helper's exact abbreviated historical Docks predicate enters compatibility. Prose, frontmatter, waivers, or similar starts cannot opt in, and closed schema-v1 request/bundle/prepared/completion/cleanup shapes gain no keys.

Plan-manager alone writes `E → R → B → Q → F`: E applies helper-generated history/diff/receipt; R ordinarily reviews E; B binds exact E/R; Q applies the helper prerequisite only after the authorized Docks release and both caches match; F freshly reviews Q.
R/F require `dual|single`, at least one passed leg, and every passed leg `ready` with zero findings; waiver, `zero_degraded`, `blocked`, `not_ready`, or findings are ineligible. Plan-review returns evidence only and writes nothing.

Retain exact application/binding/prerequisite/attribution as canonical input. Completion revalidates the immutable chain and full range; reuse removes only the exact rendered `## Review` partition. Source readiness is not activation: Docks release/refresh owns immutable release/cache equality, and docks-kit may propagate only the generic ladder—not eligibility—to consumer-global `AGENTS.md`.

## Evidence-complete execution ladder

1. Use one writer per shared worktree; plan-manager alone writes plan prose,
   receipts, lifecycle fields, and lifecycle commits.
2. Run separate read-only audits only over the same immutable input.
3. Gate syntax/structure and direct acceptance → focused regressions → one
   required broad/full pre-commit gate; any later relevant edit invalidates it.
4. Reuse evidence only while every bound canonical input, author, policy/
   provenance, waiver, bundle, commit/head/tree, diff, ordered inventory, and
   compatibility identity matches; restart at the earliest changed rung.
5. Never skip the current primary review, nonempty ordered inventory and
   one-to-one evidence, start plus `execution_base_commit` identity commits,
   plan-only `in_review`, broad gate, or final completion/receipt/reuse.
   Historical compatibility retains its required X/S evidence. Completion runs
   each inventory row exactly once in order.

Acceptance inventories remain nonempty and task-specific. Omit a broad check
only when the plan records the exact project CI command and retains a fast
independent acceptance row that proves that command's composition or strict
containment of the omitted surface; if containment is uncertain or the
independent proof is absent, retain the row. Newly authored inventories omit
the project CI command itself because completion executes that exact recorded
command separately once after the ordered inventory. This is
plan-manager/plan-review evidence only; historical validators and receipts
remain unchanged.

Completion-review repairs remain `in_review`, preserve the original
`in_review_since`, reopen affected Step rows, and invalidate prior completion
input without inventing an undocumented lifecycle transition.

## Completion review

When all initial or reopened steps are `done`:

1. If needed, set `status: in_review` and `in_review_since` once; a repair keeps
   both existing values. Commit only the plan.
2. Assert `planned_at_commit` and `execution_base_commit` are exact full SHAs;
   validate the latter is the plan-only first-start commit, is descended from
   the former, and is an ancestor of `reviewed_head`. Assert plan+affected paths
   clean and snapshot original tracked modes/blobs, untracked bytes, and
   complete Git metadata digest.
3. `prepare(none)` at the committed `reviewed_head`; seal canonical
   `execution_base_commit..reviewed_head` binary diff bytes plus the exact
   acceptance inventory into the bundle, and dispatch the current primary
   findings-only reviewer. Re-verify the sealed bundle around the attempt.
4. In writable main context—not the read-only review wrapper—create the
   sentinel-bound unlinked clone. Main-context completion runs any plan-documented
   repository setup inside the disposable checkout before acceptance/CI; setup
   failure stops without a receipt; the generic helper never selects a package
   manager or copies/symlinks dependencies. Run every inventory row exactly once in order
   plus CI and record exit/output evidence. Reproduce primary review and
   completion findings, reconcile ids, and require the original snapshot/
   cleanliness unchanged.
5. Apply the completion result, write one idempotent `## Review` plus compact
   schema-5 completion receipt, set `review_status` to the receipt's derived
   `passed|partial|regressed` verdict, and commit only the plan.

The completion verdict is `regressed` when the primary review is unavailable or
not-ready, CI fails, a regression is recorded, or a primary high completion finding
exists. `passed` requires a passed/waived primary outcome, goal met, every
acceptance row met, CI exit 0, no regression, and no primary high completion
finding; every other completed result is `partial`.

The Review block records Goal met, Regressions, CI, Follow-ups, Filed by, and a
schema-5 primary-review summary containing the selected candidate, result,
verdict, finding count, accepted/rejected partition, reproduced ids, and
orchestrator. Historical receipts retain the exact X/S Cross-check rendering.
Every schema-5 generic-series, draft/completion reuse, render, and apply path
receives and revalidates the exact authoritative waiver set.
Re-runs replace the block. Never auto-create follow-up plans. Ship reuses the
receipt only if canonical input, policy, execution base, diff, acceptance
inventory, original snapshot, reviewed head, complete series, and frontmatter
`review_status` match the receipt except for the later plan-only receipt commit.

## Publishing a plan as a GitHub issue (`--issues`)

On `--issues` or `publish <slug> as an issue`, preflight `gh auth status` and a
GitHub remote; if either fails, publish nothing and report the failure. Run
`gh repo view --json visibility`. For a public repository, warn that the issue
is public and obtain explicit confirmation before publishing a plan that names a
vulnerability, credential location, or other sensitive finding. Then run
`gh issue create --title "<plan title>" --body-file <plan path>`, record the issue
URL in `## Notes`, auto-commit the plan, and keep the `.md` as source of truth.

## Status transitions

- First `→ ongoing`: set `started_at` once.
- `→ blocked`: set `blocked_reason` naming actor/input and `blocked_since`.
- Unblock: clear block fields; retain `started_at`.
- `→ in_review`: set `in_review_since`; do not move the file.
- `→ finished`: only with passed current completion evidence; `git mv` to the
  dated finished filename and set `ship_commit`.

Every transition bumps `updated`, auto-commits the plan file, and renders Tier 3.
One timestamp anchor per turn supplies every field.

## Attribution

```text
Primary review (<date>): [primary: <company> <model> <effort>] <verdict>;
  accepted/rejected ids with reasons; [<orchestrator>] independently reproduced
  accepted blocking ids.
```

Accepted and rejected sets exactly partition every reproduced finding. Never
silently drop a finding. Escalate only when it changes scope, behavior, or a
user decision. Historical policy-v1-v4 receipts retain their leg-namespaced X/S
attribution and disagreement grammar unchanged.

## Anti-Hallucination checks

- Before dispatch, confirm immutable input/bundle/policy hashes from the helper.
- Before apply, confirm the primary output and run result echo the same request.
- Never label ambiguous failure `platform_denied`, advance after output starts,
  or retry an authoritative denial through another transport.
- Never report a review without the expected schema-5 receipt and typed terminal
  outcome.
- Before repair, require changed input and exact independently reproduced,
  accepted blocking targets; never target a nonblocking or rejected finding.
- Before ship, revalidate completion receipt reuse and the exact reviewed diff.
- Before cleanup, require the helper-returned prepare identity under fixed
  `/tmp/docks-plan-verify`; never accept a caller-selected cleanup root.
- Destroy stale review bundles only through `destroy-bundle` with the request's
  expected hash under fixed `/tmp/docks-plan-review`.
- Re-read every changed frontmatter/receipt line after writing.

## Success criteria

- Every new plan gets current single-primary evidence or an exact primary-role/
  input waiver before execution.
- Candidate fallback occurs only for the three allowed pre-output availability
  results; all other outcomes are terminal.
- Main-context plan-manager is the only dispatcher, reconciler, receipt writer,
  and lifecycle writer.
- Planned/scheduled/in-review state is preserved on unavailable, not-ready,
  stale, or invalid evidence.
- Current review is one full round plus at most one accepted-blocker repair.
- Completion verification cannot mutate the original repo.
- Status-as-field, auto-commit, open-question picker, Tier-3 render, and ship gate
  remain intact.

## Staleness check

`docs/plans/AGENTS.md` is the project contract. If it lacks current schema-5
single-primary review, the GPT/Fable/Opus availability-only chain, the closed
eight-item checklist, one optional accepted-blocker repair, current primary-role
waivers, canonical receipts, or prepare/dispatch/apply ownership, offer to
refresh it through `plan-init`; never silently run a historical X/S,
numeric-score, consent, zero-review, or five-round workflow.
