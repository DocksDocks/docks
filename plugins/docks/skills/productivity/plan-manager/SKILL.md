---
name: plan-manager
description: Use when the user asks to list, show, create, review, start, block, schedule, complete, or ship a Docks plan. Main-context public orchestrator for strong-default X/S review, canonical receipts, and status-as-field lifecycle transitions. Not for bootstrapping plans (use plan-init) or acting as an evidence-only reviewer (use plan-review internally).
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-07-15"
  content_hash: "56875b345c781b4db124679751b186227859a05be5ff412d5426a08b9b8786d0"
---

# Plan Manager

Own the public plan lifecycle over `docs/plans/active/` and `finished/`.
Main-context plan-manager is the sole review dispatcher, finding reconciler,
receipt writer, status writer, and intent applier. `plan-review` is internal and
returns typed evidence only.

<constraint>
**Review before execution.** Every newly drafted plan receives strong-default independent review. `new` commits `planned` or `scheduled` first; `start`, schedule fire, and `auto_execute` call `prepare(intent) → main-context review dispatch → apply`. Missing, stale, mismatched, or blocked evidence never enters `ongoing`. One eligible intent is consumed once.
</constraint>

<constraint>
**Sole-writer protocol.** Main-context plan-manager alone resolves policy, asks consent/zero-review questions, dispatches review, reproduces/reconciles findings, writes receipts, and changes lifecycle state. A plan-manager subagent may prepare or apply a caller-supplied typed result, but cannot dispatch another agent; it returns `NeedsMainReviewDispatch` to main context.
</constraint>

<constraint>
**Consent is not host authority.** Resolve cross-company consent (`always | ask | never`) independently from zero-review progression (`ask | proceed | block`). `always` suppresses Docks' X-consent picker only. Never bypass or retry an authoritative host denial through another transport. One successful reviewer is sufficient with exact degradation recorded, so a missing second subscription is not a hard block.
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

The runtime-global record is closed. Preserve each selector for attribution;
only its expanded candidates are execution input:

```text
Docks-workflow-models: {"implementer":{"candidates":[{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"}],"selector":"codex:gpt-5.6-sol@xhigh"},"orchestrator":{"candidates":[{"company":"anthropic","effort":"high","model":"fable","tool":"claude"},{"company":"anthropic","effort":"xhigh","model":"opus","tool":"claude"}],"selector":"profile:claude-best"},"review":{"max_rounds":3,"minimum_score":90},"reviewer":{"candidates":[{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"}],"selector":"codex:gpt-5.6-sol@xhigh"},"schema":1}
```

Each role is closed to `selector` plus one to three ordered candidates closed to
`company`, `tool`, `model`, and `effort`. Review bounds are strict integers:
`minimum_score` 0..100 and `max_rounds` 1..10. The named profile and exact-target
grammar are `profile:<name>` and `<tool>:<model>@<effort>`; Docks does not reparse
or expand them.

Defaults (2026-07):

```text
orchestrator: profile:claude-best = claude:fable@high, claude:opus@xhigh
reviewer: codex:gpt-5.6-sol@xhigh
implementer: codex:gpt-5.6-sol@xhigh
minimum_score: 90
max_rounds: 3
cross_company_consent: ask
zero_reviewer_policy: ask
orchestrator_preference: auto
openai_tiers: gpt-5.6-sol/xhigh [in_session,cli]
anthropic_tiers: fable/high, opus/xhigh [in_session,cli]
```

New preparation emits closed `ResolvedReviewPolicy` schema 2, including
`minimum_score`, `max_rounds`, both company tier lists, and one provenance value
for every preceding policy field. Historical policy-v1 requests and receipts
remain valid only for historical verification. Re-resolve before receipt reuse
and apply; any value, provenance, candidate/tier order, effort, or transport
change invalidates old evidence. A current user can override standing consent
without changing zero-review policy.
Use `validateDraftReviewReuse` for current draft apply/reuse; direct
`validateDraftReceipt` without the resolved policy is historical structural
verification only.

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
`unknown` before the first review and persist the answer. For an Anthropic author,
the OpenAI reviewer candidates supply X and fresh Anthropic orchestrator
candidates supply S. For an OpenAI author, Anthropic orchestrator candidates
supply X and OpenAI reviewer candidates supply S. Filter candidates by the
required company; never relabel a same-company candidate as X. An empty required
company chain degrades that leg as unavailable.

A waiver is strict one-line JCS in `review_waivers` and binds `phase`, canonical
`input_sha256`, normalized unique `legs:[X|S]`, actor, non-empty reason, and ISO
time. Write it only from an explicit current-user decision. Duplicate/conflicting
`(phase,input_sha256,leg)` entries STOP. Consent `never` records X
`not_authorized`; it is not a waiver.

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
local weighted self-review pass; it is author feedback, not canonical X/S
evidence. Every unresolved guess becomes a structured `## Open question` and is
surfaced through the native picker.

Once the candidate is ready:

1. Record author identity and `review_waivers: []`.
2. Commit `planned`, or `scheduled` with trigger fields. Do not execute.
3. Call `prepare(none)` and dispatch ordered X then S over the same sealed bundle;
   S never receives X output.
4. Independently reproduce every finding against the sealed bundle/source.
5. Partition all reproduced X/S ids into accepted and rejected (reason required),
   preserve disagreements, repair accepted findings, commit, destroy the stale
   bundle, and prepare a fresh request.
6. Stop early only when every passed leg is `ready`, its score is at least the
   resolved `minimum_score`, and the reconciled candidate remains current. One
   unavailable leg still permits a score-qualified `single` outcome.
7. Run at most `max_rounds` per user-authorized batch. After the cap ask exactly
   `Run up to <max_rounds> more rounds` or `Stop and keep the plan planned`.
   Substitute the resolved integer for `<max_rounds>` and present the two choices
   through the runtime-native picker. Approval covers one additional bounded
   batch only; resumed work asks again.
8. A `ready` result below the floor with no reproducible finding consumes the
   round: destroy the bundle and create a fresh request id over the unchanged
   commit/input. No score waiver is inferred.
9. Write one canonical receipt only after input/policy/bundle revalidation.

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
4. Resolve and JCS-hash policy; validate matching waivers/decisions.
5. Fix immutable commit/head, seal the non-git bundle, verify every file/hash/mode,
   and compute bundle hash. Raw source-plan export is forbidden; reviewers see
   only `plan.review.md`.
6. Create one `ReviewRequestEnvelope` carrying phase, intent, immutable input,
   canonical/bundle/policy hashes, persisted author identity, and full policy
   snapshot. Draft-only completion fields are null. Completion additionally
   binds `planned_at_commit`, `execution_base_commit`, canonical binary
   `diff_sha256`, and the canonical acceptance-inventory hash.
7. Return `NeedsMainReviewDispatch` containing the exact request and X/S dispatch
   descriptions. If already in main context, proceed to dispatch once.

No lifecycle field changes during prepare. Any escape, submodule, dirty scoped
path, seal mutation, duplicate, unsupported file, or request mismatch is a STOP.

## Dispatch and decisions

The outer `ReviewRequestEnvelope` remains schema 1 while its resolved policy is
schema 2. Both legs are fresh, findings-only, explicit-model/effort, and consume
the same bundle in X-then-S order without seeing one another. Select one
execution-enforced read-only in-session or direct CLI transport before attempts.
Session-relay is invalid review transport under either policy version.

Use binary lookup and auth status only as cheap preflight; the real review launch
is the model probe. One review attempt operation means one sealed X-then-S round.
Under policy v2 attempt each candidate at most once in that operation.
Advance only on structured or version-pinned evidence of a candidate-specific
model-not-found/retired/entitlement denial, explicit model quota, or terminal
model overload/unavailability. Authentication, billing, shared session/weekly
quota, generic 429, invalid/request-size, transport, and ambiguous failures stop
that leg with exact degradation; never rotate blindly. Historical policy v1
retains its bounded transient retry solely for receipt compatibility.

An already-running interactive parent cannot be silently retargeted. On a
parent-only model failure, surface exact `/model <model>` plus
`/effort <effort>` commands or equivalent relaunch guidance for the next
candidate; never claim that the parent switched automatically.

When `cross_company_consent=ask`, ask once before X export and persist closed
decision evidence bound to request id/input hash. `always` attempts X without a
Docks picker. `never` records X not-authorized and still attempts S.

Degradation:

| Passed legs | Outcome |
|---|---|
| X and S | `dual`, eligible after reconciliation |
| one | `single`, exact other outcome recorded, eligible |
| zero + proceed | `zero_degraded`, eligible with decision evidence |
| zero + ask | Surface decision; preserve planned/scheduled/in_review |
| zero + block | `blocked`, ineligible; preserve planned/scheduled/in_review |

Standing/configured choices use policy+provenance and null decision evidence.
Prompted choices include actor, reason, ISO time, request id, and input hash.

## `apply`

Accept only the exact typed run result returned for the prepared request.

1. Re-read and re-hash canonical input, bundle, resolved policy, provenance,
   decisions, and waivers. Require byte-identical request echoes from both legs.
2. Validate attempt bounds/results, finding hashes, reconciliation partition, and
   outcome. A passed raw leg preserves the exact reviewer verdict, score,
   confirmations, and structured-output hash. Under policy v2, every passed leg
   requires `verdict=ready` and `score >= minimum_score`; `not_ready` and a
   low-score `ready` result are ineligible. Plan-review returns one round's typed
   evidence and never supplies reconciliation; plan-manager owns bounded batches.
3. Write compact JCS `Review-receipt:` (draft) or
   `Completion-review-receipt:` (completion) into the appropriate plan section.
4. For intent `none`, leave status unchanged. For eligible `start`,
   `schedule_fire`, or `auto_execute`, mark the intent consumed and commit only
   the plan with `ongoing`/first `started_at`. Capture that exact commit SHA,
   then record it as `execution_base_commit` in a second plan-only commit before
   implementation or assignee dispatch.
5. If evidence is ineligible/stale, write only the exact degraded evidence when
   allowed and leave the non-executing status unchanged.
6. Auto-commit the plan-only receipt/transition and render Tier 3.

Draft receipt binds schema, phase, exact request, reviewed commit, canonical
input, author, policy/hash, persisted X/S raw+reconciliation, reproduced evidence,
decision evidence, outcome, eligibility, and review time. Completion binds the
same author and reproduced evidence plus planned/start/head identities, exact
diff hash, nonempty ordered acceptance inventory/hash, primary evidence, and the
derived `completion_verdict`. Evidence must cover every inventory row once in
the same order with identical ID/command/expected. `passed` requires goal met,
every acceptance met, CI exit 0, no recorded regression, no high primary
finding, and no passed X/S result below the resolved score gate. Policy-v1
completion retains its historical ready-only meaning; a passed X/S `not_ready`
fails both versions. A later
ordinary prose or policy edit invalidates it;
excluded lifecycle fields and its own exact line do not.

## Implementation role dispatch

After eligible start and the execution-base identity commit, resolve the first
available implementer candidate. Same-tool/current-model work stays in main
context. A selected different provider MUST use exactly one depth-0 managed
worktree worker, pinned to the selected model and effort:

```text
relay spawn <repo> --fanout --from <invoker-session> --tool <tool> --model <model> --effort <effort> -- "<bounded implementation task>"
relay handback --from <worker-session> --status completed --note "ready"
relay collect <worker-session> --from <invoker-session>
```

Treat the real worker launch as the model probe. Before any worker is accepted,
candidate-specific terminal model failure advances through the ordered
implementer chain, attempting each candidate once. Provider-wide, authentication,
billing, shared-quota, relay, clean-parent, or ambiguous launch failure stops
rotation and records degradation. Once a worker is created, do not launch
another candidate.

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

1. Use one writer per shared worktree; plan-manager alone writes plan prose, receipts, lifecycle fields, and lifecycle commits.
2. Parallelize separate read-only audits only over the same immutable input.
3. Gate syntax/structure and direct acceptance → focused regressions → one required broad/full pre-commit gate; any later relevant edit invalidates it.
4. Reuse evidence only while every bound canonical input, author, policy/provenance, decision/waiver, bundle, commit/head/tree, diff, ordered inventory, and compatibility identity matches; restart at the earliest changed rung.
5. Never skip X/S, the nonempty ordered inventory and one-to-one evidence, start plus `execution_base_commit` identity commits, plan-only `in_review`, the broad gate, or final completion/receipt/reuse; completion runs each inventory row exactly once in order.

Acceptance inventories remain nonempty and task-specific. Omit a broad check
only when the plan records the exact project CI command and retains a fast
independent acceptance row that proves that command's composition or strict
containment of the omitted surface; if containment is uncertain or the
independent proof is absent, retain the row. Newly authored inventories omit
the project CI command itself because completion executes that exact recorded
command separately once after the ordered inventory. This is
plan-manager/plan-review evidence only; schema-v1 validators and receipts remain
unchanged.

Completion-review repairs remain `in_review`, preserve the original
`in_review_since`, reopen affected Step rows, and invalidate prior completion
input without inventing an undocumented lifecycle transition.

## Completion review

When all initial or reopened steps are `done`:

1. If needed, set `status: in_review` and `in_review_since` once; a repair keeps
   both existing values. Commit only the plan.
2. Assert `planned_at_commit` and `execution_base_commit` are exact full SHAs;
   validate the latter is the plan-only first-start commit, is descended from
   the former, and is an ancestor of `reviewed_head`. Assert plan+affected paths clean and snapshot original tracked modes/blobs,
   untracked bytes, and complete Git metadata digest.
3. `prepare(none)` at the committed `reviewed_head`; seal canonical
   `execution_base_commit..reviewed_head` binary diff bytes plus the exact
   acceptance inventory into the bundle, and dispatch X/S findings-only
   reviewers. Re-verify the sealed bundle before and after each leg.
4. In writable main context—not a read-only X/S wrapper—create the sentinel-bound
   unlinked clone. Main-context completion runs any plan-documented repository setup inside the disposable checkout before acceptance/CI; setup failure stops without a receipt; the generic helper never selects a package manager or copies/symlinks dependencies.
   Then run every inventory acceptance row exactly once in order plus CI and
   record exit/output evidence. Reproduce X/S and primary findings,
   reconcile ids, and require original
   snapshot/cleanliness unchanged.
5. Apply the completion result, write one idempotent `## Review` plus compact
   completion receipt, set `review_status` to the receipt's derived
   `passed|partial|regressed` verdict, and commit only the plan.

The Review block records Goal met, Regressions, CI, Follow-ups, Filed by, and
the X/S cross-check. Re-runs replace it. Never auto-create follow-up plans.
Ship reuses the receipt only if canonical input, policy, execution base, diff,
acceptance inventory, original snapshot, reviewed head, and frontmatter `review_status` match the receipt except for the
later plan-only receipt commit.

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
Cross-check (<date>): [X: <company> <model> <effort>] ... accepted/rejected X ids
  with reasons; [S: <company> <model> <effort>] ... accepted/rejected S ids;
  [<orchestrator>] independently verified ids.
DISAGREEMENT: <topic> — [Xn] ... / [Sn] ... Kept: ... — decided by ..., because ...
```

IDs are leg-namespaced and the accepted/rejected sets exactly partition every
reproduced finding. Never silently drop or average a disagreement. Escalate only
when it changes scope, behavior, or a user decision.

## Anti-Hallucination checks

- Before dispatch, confirm immutable input/bundle/policy hashes from the helper.
- Before apply, confirm both legs and the run result echo the same request.
- Never label ambiguous failure `platform_denied` or retry an authoritative
  denial through another transport.
- Never report a review without the expected receipt and typed terminal outcomes.
- Before ship, revalidate completion receipt reuse and the exact reviewed diff.
- Before cleanup, require the helper-returned prepare identity under fixed
  `/tmp/docks-plan-verify`; never accept a caller-selected cleanup root.
- Destroy stale review bundles only through `destroy-bundle` with the request's
  expected hash under fixed `/tmp/docks-plan-review`.
- Re-read every changed frontmatter/receipt line after writing.

## Success criteria

- Every plan gets current X/S evidence or an explicit availability/waiver/zero-
  review outcome before execution.
- One subscription can progress; standing consent never overrides host policy.
- Main-context plan-manager is the only dispatcher, reconciler, receipt writer,
  and lifecycle writer.
- Planned/scheduled/in-review state is preserved on ask, block, stale evidence,
  or failed review.
- Completion verification cannot mutate the original repo.
- Status-as-field, auto-commit, open-question picker, Tier-3 render, and ship gate
  remain intact.

## Staleness check

`docs/plans/AGENTS.md` is the project contract. If it lacks author identity,
strong-default X/S review, consent/zero-review separation, canonical receipts,
or prepare/dispatch/apply, offer to refresh it through `plan-init`; never silently
run the old optional-picker workflow.
