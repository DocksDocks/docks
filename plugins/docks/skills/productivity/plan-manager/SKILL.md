---
name: plan-manager
description: Use when the user asks to list, show, create, review, start, block, schedule, complete, or ship a Docks plan. Main-context public orchestrator for strong-default X/S review, canonical receipts, and status-as-field lifecycle transitions. Not for bootstrapping plans (use plan-init) or acting as an evidence-only reviewer (use plan-review internally).
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-07-12"
  content_hash: "fdfe8ef45efe943f552a3e834b1193f6858d3f283e8710a8656e36458d4f08c4"
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

Resolve one closed `ResolvedReviewPolicy` through ordinary instruction
precedence: current-turn user > already-loaded runtime-global guidance > dated
skill default. Do not read a new consumer env var or config file.

Defaults (2026-07):

```text
cross_company_consent: ask
zero_reviewer_policy: ask
orchestrator_preference: auto
openai_tiers: gpt-5.6-sol/xhigh [in_session,cli]
anthropic_tiers: fable/high, opus/max [in_session,cli]
```

Persist provenance separately for every field. Tier/transport order is semantic.
Re-resolve policy before receipt reuse and apply; any value, provenance, tier, or
transport change invalidates old evidence. A current user can override standing
consent (`always` for the requesting user) without changing zero-review policy.

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
`unknown` before the first review and persist the answer. X is the other company;
S is an independent author-company reviewer selected from its resolved tiers.

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
required spine and cold-handoff sections from `docs/plans/AGENTS.md`. Run the
weighted rubric once; hill-climb when first score <85, big/risky, or requested.
For big/risky drafts, a fresh reviewer returns a rewrite/trajectory when allowed;
plan-manager remains the writer. Every unresolved guess becomes a structured
`## Open question` and is surfaced through the native picker.

Once the candidate is ready:

1. Record author identity and `review_waivers: []`.
2. Commit `planned`, or `scheduled` with trigger fields. Do not execute.
3. Call `prepare(none)` and dispatch both review legs from main context.
4. Independently reproduce every finding against the sealed bundle/source.
5. Partition all reproduced X/S ids into accepted and rejected (reason required),
   preserve disagreements, update substantive plan prose for accepted findings,
   commit, destroy the stale bundle, and repeat until current evidence exists.
6. Write one canonical receipt only after input/policy/bundle revalidation.

## `prepare(intent)`

Valid intents are `none | start | schedule_fire | auto_execute`.

1. Confirm the plan's current non-executing state permits the intent.
2. Re-read the plan and contract; require clean plan+affected paths.
3. Compute canonical plan view through plan-review's bundled
   `scripts/review-policy.mjs`. Lifecycle fields, waivers, and exact one-line
   machine records are excluded; ordinary Self-review/Review prose remains.
4. Resolve and JCS-hash policy; validate matching waivers/decisions.
5. Fix immutable commit/head, seal the non-git bundle, and compute bundle hash.
6. Create one `ReviewRequestEnvelope` carrying phase, intent, immutable input,
   canonical/bundle/policy hashes, persisted author identity, and full policy snapshot.
7. Return `NeedsMainReviewDispatch` containing the exact request and X/S dispatch
   descriptions. If already in main context, proceed to dispatch once.

No lifecycle field changes during prepare. Any escape, submodule, dirty scoped
path, seal mutation, duplicate, unsupported file, or request mismatch is a STOP.

## Dispatch and decisions

Both legs are fresh, findings-only, explicit-model/effort, and consume the same
bundle. Use an execution-enforced read-only in-session reviewer when available,
otherwise the portable CLI selected by policy. Schema v1 rejects session-relay.

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
   outcome. Plan-review never supplies reconciliation.
3. Write compact JCS `Review-receipt:` (draft) or
   `Completion-review-receipt:` (completion) into the appropriate plan section.
4. For intent `none`, leave status unchanged. For eligible `start`,
   `schedule_fire`, or `auto_execute`, atomically mark the intent consumed and
   set `ongoing`/`started_at` as the existing lifecycle requires.
5. If evidence is ineligible/stale, write only the exact degraded evidence when
   allowed and leave the non-executing status unchanged.
6. Auto-commit the plan-only receipt/transition and render Tier 3.

Draft receipt binds schema, phase, exact request, reviewed commit, canonical
input, author, policy/hash, persisted X/S raw+reconciliation, reproduced evidence,
decision evidence, outcome, and review time. Completion binds the same author and
reproduced evidence plus planned/head/diff/primary evidence. A later ordinary prose or policy edit invalidates it;
excluded lifecycle fields and its own exact line do not.

## Completion review

When all steps are `done`:

1. Set `status: in_review` and `in_review_since` once; commit only the plan.
2. Assert plan+affected paths clean and snapshot original tracked modes/blobs,
   untracked bytes, and complete Git metadata digest.
3. `prepare(none)` at the committed `reviewed_head`; dispatch evidence-only
   plan-review with acceptance/CI writes confined to an unlinked disposable
   clone.
4. Reproduce X/S and primary findings, reconcile ids, and require original
   snapshot/cleanliness unchanged.
5. Apply the completion result, write one idempotent `## Review` plus compact
   completion receipt, set `review_status=passed|partial|regressed`, and commit
   only the plan.

The Review block records Goal met, Regressions, CI, Follow-ups, Filed by, and
the X/S cross-check. Re-runs replace it. Never auto-create follow-up plans.
Ship reuses the receipt only if canonical input, policy, diff, original snapshot,
and reviewed head remain current except for the later plan-only receipt commit.

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
