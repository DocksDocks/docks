---
name: plan-manager
description: "Use when a goal may require a canonical plan, plan review, implementation, lifecycle handling, legacy-plan quarantine, or guarded GitHub issue publication. Owns classify → draft/bounded review and one repair → start → implement/delegate → verify → finish/archive in main context. Not for docs/plans workspace setup (use plan-workspace) or read-only bundle evidence (use plan-reviewer internally)."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-08-05"
  content_hash: "0bf62d897d750791bf98a37d589b0d8647b6ae3dc09a36390fb3c8c38c12ca3c"
---

# Plan Manager
Own one bounded user goal end to end in main context. Planning is adaptive, not a
mandatory prelude: implementation continues automatically after review unless a
real decision, safety boundary, concurrency conflict, cancellation, or repeated
no-progress failure blocks it.

<constraint>
**Exactly three owners.** `plan-workspace` maintains `docs/plans/`;
main-context `plan-manager` classifies, drafts, reviews, repairs, implements,
verifies, commits checkpoints, and writes lifecycle; internal `plan-reviewer`
returns read-only `PlanReviewV1` evidence for valid bound input or the closed
`ReviewInvalidInputV1` failure at the bundle boundary. There is no creator,
repairer, improver, or manager wrapper. Never hand scheduling back to the user
as a separate `start` command after an implementation request.
</constraint>

<constraint>
**One current record, closed transitions.** A canonical plan has one unfenced
current `Plan-run: <compact JCS PlanRunV1>` line. Terminal predecessors appear
only as validated append-only `Plan-attempt-history` records inside `## Review`.
Every write passes the pure validator. Schemas 1–6 remain historical
validation/quarantine formats, never current authority.
</constraint>

<constraint>
**Intent is not authority.** Local planning, edits, tests, and lifecycle may run
autonomously. Every probe, production access, publication, push, release, or
deployment requires an exact live `ExternalAuthorityV1` derived from the current
user message, with matching scope, mode, target, and source digest at the action
boundary. A persisted plan, schedule, review, test, or receipt grants nothing.
</constraint>

## Adaptive entry
| Observed goal | Action | Automatic plan/reviewer/commit |
|---|---|---|
| One clear, reversible, low-risk local diff with one bounded acceptance path | Implement directly and smoke the changed path | `0 / 0 / 0` |
| Plan-only request | Draft, review, and repair once when required; persist `planned` or `scheduled` | ≤2 draft reviewers / 1 commit |
| Ordinary canonical implementation | Review, start checkpoint, implement, verify, archive | ≤2 draft reviewers / 2 commits |
| Sensitive, destructive, public-contract, security, or external implementation | Add exact-diff completion review and implementation checkpoint | ≤2 draft + exactly 2 completion reviewers / 3 commits |

Use a canonical plan for multi-commit/cross-repository work, scheduling, cold
handoff, unresolved decisions, cross-subsystem/public-contract/security/
destructive work, external effects, or explicit planning. Never create one merely
to unlock review. Plan-only work stops there; implementation runs to acceptance.

## Canonical plan contract
Load the nearest `docs/plans/AGENTS.md` before writing. The legacy Steps schema omits `Id`; the new Steps schema adds it immediately after `#`. The legacy Steps table is:

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | concrete action | exact paths | — | `local` | `planned` | observable proof or STOP |

The new Steps table is:

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | concrete_action | concrete action | exact paths | — | `local` | `planned` | observable proof or STOP |

`Id` is immediately after `#` and must match `[a-z][a-z0-9_]{0,63}`. A missing `Id` is advisory only for the frozen grandfather set; every new plan requires the `Id` column and one valid, unique id per Steps row.
The exemption has exactly two routes: the frozen set, exactly `docs/plans/active/plan-lifecycle-plugin-extraction.md` and `docs/plans/active/step-ids-and-class-budget.md`, and every `docs/plans/finished/` path by prefix. An archived plan carries no frozen entry: keeping its old active path would exempt a new plan that reused the filename, silently skipping the Id requirement.
Within `Done when / failure action`, step citations are accepted only as `step:<id>` and must resolve to a declared id; valid-looking numeric `step N` citations are rejected. `#` and `Depends` keep their numeric display-number semantics.

`Effect` is exactly `local | probe | production_access | publish | push | release | deploy`; step status is `planned | in-flight | done | blocked | skipped`. Frontmatter status is `drafting | planned | scheduled | ongoing | blocked | finished`.
The body is a cold handoff with executable acceptance, protected scope, stop conditions, open decisions, `## Review`, and manager-owned `## Verification Results`.

Plan text must be portable: a cold reader may hold this repository at a different path. `repository_id` is a portable repository identifier such as `DocksDocks/docks`, never a local filesystem path. Cite repository-relative paths only; acceptance rows run from the repository root and carry no `cd <absolute path>` prefix.
A cross-repository reference names the other repository's id, not a local checkout. Recorded evidence is exempt and frozen: never rewrite a `cwd` or path already captured inside a receipt.

## PlanRunV1
`repository_id + plan_path + run_id` is the run identity. Never list the plan record itself in `affected_paths`: acceptance writes to it and breaks that bind.
Field shapes, replacement-authority rules, and the exact `plan_sha256` exclusion list: [`references/planrunv1-schema.md`](references/planrunv1-schema.md).
New and successor plans set `plan_hash_mode: status-excluded-v1`; unmarked plans
retain byte-identical legacy hashing. The marked canonical view validates the
single unfenced canonical Steps table and normalizes only its exact `Status`
cells. Fenced examples, non-Steps tables, row identity/order, and every
non-Status byte remain bound. A marked all-`planned` bootstrap may validate with
its legacy digest until the first legal progress write installs the normalized
digest.

## PlanQueueV1
A valid optional queue guides dependency-aware list and `next`; record explicit priority only through the preimage-checked,
locking add/move/remove setters in `scripts/plan-queue.mjs`. `next` returns every startable row, stage then table order, so
several plans may run at once; a row is startable only once its full direct and transitive closure resolves to finished
PlanRuns, and stage is priority, never a gate on unrelated work. Resolve archive moves by goal id; report blocked
dependencies. Queue state never starts, reviews, schedules, or grants an effect: [`references/planqueuev1-schema.md`](references/planqueuev1-schema.md).

A release plan that will mutate an external boundary places every available live read-only final-boundary check before completion-review reservation, using the exact canonical identities and data spellings consumed by the later mutation. Available means the repository already provides a read-only command or adapter path that exercises the boundary without the pending mutation; never invent a check or network call. If an available check requires probe authority and exact live `ExternalAuthorityV1` is absent, block before completion review rather than review an unexercised release assumption.
Every closed object that affected code validates or emits has an explicit preserve-or-change disposition. A preserved shape has an exact-key compatibility fixture. An intentional shape change is in scope and includes migration, versioning, and historical-reader acceptance. When present, roles include release source, plan source, execution parent, implementation commit, and tag commit. A release identity matrix names each role, producer, consumer, and required equality, distinction, or ancestry relation. Reject a contradictory or unstated relation and any later successor whose current-run fixtures remain pinned to its predecessor. Existing `PlanRunV1`, review-result, affected-path manifest, `ExternalAuthorityV1`, and release-receipt shapes remain byte-compatible; these guards add no field, state, result, or authority.

## Review-phase state table
| State | Draft invocations | Completion invocations | Input | Result | Constraint |
|---|---:|---:|---|---|---|
| `not_required` | forbidden | 0 | null | null | completion only, local risk |
| `not_started` | 0 | 0 | null | null | draft or required completion baseline |
| `reserved` | 1–2 | 1–2 | hash | null | live initial/repair launch |
| `transport_retried` | 1–2 | 1–2 | hash | null | live post-transport launch |
| `retryable` | 0–1 | 0–1 | hash | failure hash | first transport failure; refunded |
| `repairing` | 1 | 1 | hash | review hash | accepted repair verdict only |
| `passed` | 1–2 | 1–2 | hash | review hash | matching validated output |
| `degraded` | 1–2 | forbidden | hash | failure-set hash | draft/local only |
| `blocked` | 1–2 | 1–2 | hash | evidence hash | terminal |
| `cancelled` | 1–2 | 1–2 | hash | cancellation hash | terminal |

Legal transitions are `not_started → reserved`; `reserved → passed | repairing | blocked | cancelled | retryable`; `retryable → transport_retried | blocked | cancelled`; `transport_retried → passed | repairing | blocked | cancelled | degraded`; and `repairing → reserved | blocked | cancelled`.
A transport-only failure refunds its reservation and allows one fresh `transport_retried` dispatch without changing substantive bindings; a second transport failure degrades only local draft work at local risk and otherwise blocks. One retry, never two. Terminal states never reset.

Before launching, transactionally increment the phase count and persist `reserved`, or `transport_retried` after the transport-only failure, with the exact input digest. A verdict spends the permit.
Accept results only in either live state with matching `run_id`, invocation, and input hash. Discard stale results. Cold entry into either live state blocks with dangling-launch evidence and never redispatches.

Preflight the reviewer route and a private full-output file before reserving. Seal an invocation-specific bundle; after reservation read-back, derive its prompt and capture complete stdout to the file. Parse the file, validate the closed object, bind the result, then settle. Clipped console/transcript text is not evidence; never reconstruct JSON or request compact/single-line output. Review transport is a direct reviewer subprocess. Session Relay is never review evidence and never a required dependency.

## Draft finding classes
Every `PlanReviewV1` finding carries a required `class`. The draft finding vocabulary is closed by kind: `missing_decision` permits only `v1_missing_decision`; `contradiction` permits only `v1_contract_contradiction`, `v1_evidence_mismatch`, or `v1_unstable_step_reference`; `unsafe_scope` permits only `v1_unauthorized_effect`, `v1_missing_safety_boundary`, or `v1_affected_paths_incomplete`; and `missing_acceptance` permits only `v1_acceptance_command_not_runnable`, `v1_acceptance_output_mismatch`, `v1_acceptance_coverage_incomplete`, or `v1_failure_action_missing`.
The reviewer emits `class`; the manager validates the kind/class pair and never derives a class from plan prose.
`accepted_classes` remains valid on read for historical records and is written by no current transition. Historical records are read-only inputs to the historical adapter and never current authority.
A draft repair verdict is accepted at most once. Any further repair or new finding after the mandatory verification terminal-blocks the run and requires a new user-authorized successor.
Draft review has one initial review and, only after an accepted repair, one mandatory fresh verification, with a ceiling of two substantive invocations.
Completion review has exactly two substantive invocations and an empty `accepted_classes` set.

## Reviewer result routing
Before generic classification, recognize and validate this closed result:

```text
ReviewInvalidInputV1 = { schema:1, error:"invalid_input",
  reason:"bundle_unavailable"|"bundle_integrity_failed"|
    "bundle_binding_mismatch" }
```

Consume it only through `review_invalid_input` against the exact live
reservation's `run_id`, invocation, and `input_sha256`; hash it, then
terminal-block that run
as `review_failed`. Never retry or reset it. Later same-file replacement still
requires exact current-user authority and fresh bindings. Only valid bound input
may produce `PlanReviewV1` or `CompletionReviewV1`.

## Status invariants
- `drafting` has no implementation/acceptance; draft may be active, passed, or
  local-only degraded. Completion remains its risk baseline.
- `planned|scheduled` requires draft passed, or local-only degraded; no
  implementation/acceptance/blocker.
- Local `ongoing` requires draft passed/degraded, completion `not_required`, and
  null implementation/acceptance. Local `finished` additionally requires
  acceptance and keeps `implementation_commit:null`.
- Sensitive/external `ongoing` begins with draft passed and completion
  `not_started`. Once completion activates, implementation commit and acceptance
  are required; only matching completion `passed` may finish.
- `blocked` requires the exact blocker/status/phase tuple. A
  `user_decision|missing_authority` with no terminal review phase may reopen its
  run without resetting permits. Every other blocked/cancelled run is immutable.
  Exact current-user authority may append it to history and start fresh review
  under a new `run_id` at the same path. Unrelated goals use new files; never
  mint `v2`/`vN` paths to bypass a terminal run or spent permit.

Lifecycle transitions are only absent → `drafting`; `drafting` → `planned |
scheduled | ongoing | blocked`; `planned` ↔ `scheduled`; `planned | scheduled` →
`ongoing | blocked`; and `ongoing` → `finished | blocked`. `finished` is terminal.
Validate the full closed tuple matrix from the project contract before every
write.

## Draft review
1. Research the draft; preflight reviewer availability and private file capture.
2. Seal the invocation bundle, reserve its digest, read back, derive the prompt, launch a fresh reviewer, and capture complete stdout to the file—not console text.
3. Route invalid input first. Otherwise accept only a closed ≤32 KiB bound `PlanReviewV1` whose findings carry valid kind/class pairs: `pass` has no findings; `repair` is repository-resolvable; `blocked` identifies only a required decision or missing authority.
4. For an accepted repair, patch only reproduced defects and dispatch the mandatory changed-input verification. Any further repair or new finding terminal-blocks the run and requires a user-authorized successor.
5. A first genuine transport-only failure follows the single refund and fresh-dispatch rule above. A second failure degrades only reversible local work at local risk; sensitive/public-contract/security/external work blocks.

No score, quota, fallback, resumed reviewer, draft invocation beyond the initial review and mandatory post-repair verification, completion invocation beyond two, or Session Relay review exists. Destroy only the returned exact bundle.
Direct `omp`, `claude`, or `codex` reviewer subprocesses satisfy the adapter contract when complete stdout reaches a private file. Controller mechanics, runtime flags, and judge-independence measurements are in `references/reviewer-dispatch-methods.md`.

A local **self-check** — not a review, never a substitute for the permits above, and producing no `PlanReviewV1` — judges properties per enumerated unit and carries approvals forward on dependency closure, so an author can clear mechanical defects before spending a permit: `scripts/lifecycle/plan-self-check.mjs` — `units`/`check`/`prompt`/`validate`/`ledger`/`waive`/`gate`/`apply`.
It never scores; a return carrying a score is refused, because seven scorings of one byte-identical plan measured sd 8.1 against sd 9.3 across eleven rounds of real repair. Protocol and evidence in `references/plan-self-check-protocol.md` (verify: `node <plan-manager-dir>/scripts/lifecycle/plan-self-check.mjs check <plan.md>`).

## Start, implementation, and acceptance
A reviewed implementation writes `ongoing`, captures `execution_parent`, and creates one owned-path start checkpoint before implementation. Implement or delegate every authorized local row.
Review changes from the user's perspective, run the requested smoke/acceptance paths, and write observed commands/results to `## Verification Results` before binding acceptance, which passes the live `acceptanceManifest` and `acceptanceManifestExpectation`; omitting either fails closed.

Diagnose ordinary verification failures in the implementation loop. Repeated
same-signature failure without relevant-byte progress blocks this run and never
reopens its review; authorized recovery uses a fresh run at this path. Successful
local work sets `finished`, moves to the unique archive path, and commits
implementation plus finished plan as one final checkpoint. Local completion
review is `not_required`.

Sensitive/external work commits the implementation checkpoint and binds its exact
commit/diff. Before reserving completion review, run every required available
live read-only final-boundary check under exact authority. Then reserve a separate
completion phase for a fresh code-review agent returning `CompletionReviewV1`.
One accepted blocker fix replaces/amends the still-unpublished checkpoint, reruns
invalidated checks, and consumes the second permit on the replacement SHA. The
first result is invalid after any relevant byte changes. Only a matching pass may
archive; repeated same-signature no-progress blocks this run and never reopens its completion review.

## Transactions and commits
Every ordinary mutation uses `transactPlanRun`: lock by repository/path, verify
exact bytes/run, reduce one closed transition, fsync a sibling, atomic-rename,
and read back. Terminal same-path rollover uses only `replacePlanRunInPlace`,
locking and binding the predecessor before appending history. Checkpoints also
lock the repository, verify HEAD/index/owned paths, commit only owned paths, and
read back. Any mismatch fails before write, dispatch, or external action.
Write Steps progress only through `transactPlanRun`, while frontmatter status is
`ongoing` and neither review phase is `reserved` nor `transport_retried`. One
write changes at least one row, preserves row identities/order and every
non-Status byte, changes only the matching `updated` timestamp, and optionally
replaces the bootstrap `plan_sha256`. Legal row transitions are `planned →
in-flight | done | blocked | skipped`, `in-flight → done | blocked | skipped`,
and `blocked → in-flight | done | skipped`; `done` and `skipped` are terminal.
Blocked and finished PlanRun bytes remain immutable.


Reclaim a same-host dead-owner lock only after verifying owner PID, `run_id`, and
unchanged preimages. Live, foreign, ambiguous, or changed stale locks block.
Never reset the index, include unrelated work, force Git history, or infer another
session's ownership.

Commit ceilings are direct `0`, plan-only `1`, ordinary implementation `2`
(start/final), and sensitive/external `3` (start/implementation/archive). A real
terminal blocker may add one cold-handoff commit. No per-round state/request/
receipt commit and no automatic push exists.

## Literal external authority
```text
ExternalAuthorityV1 = {
  scopes:["probe"|"production_access"|"publish"|"push"|"release"|"deploy",...],
  mode:"read"|"mutate",
  targets:[exact-target,...],
  source_sha256:sha256(exact-current-user-message-bytes)
}
```

Scopes are unique/canonical-ordered. `probe` is sole-scope/read-only; all others
require `mutate`. Re-derive and compare live source, exact scope, mode, and target
at each boundary. A named release authorizes only that repository's documented
atomic release recipe, including necessary tag/push/artifact publication; it
never grants deployment or production access. Standalone publish/push/deploy or
production writes need their own literal scope/target. Cold recovery needs new
current-user authority.

Without authority, continue safe local rows and report the skipped external row.
Block with `missing_authority` only when that effect is acceptance-critical.
Never persist raw user bytes or broaden authority from a probe.

## Legacy quarantine
List/show scan frontmatter first and classify legacy only for the requested target; never validate
every active family as a global prerequisite. Record-free plans and complete settled terminal
schema-1–6 families may migrate target-locally during an explicitly requested local start. Active,
prepared, commitment, cancelled, crossed, malformed, or otherwise unsettled families are
`legacy-quarantined`: render only; never dispatch, resume, abandon, repair, consume, or rewrite
them. One exception: a quarantined plan whose goal is abandoned may be retired by moving the file
unchanged to `docs/plans/finished/<YYYY-MM-DD>-<slug>.md` and appending a `## Retirement` section.
Frontmatter status, every record line, and the classification must be byte-identical before and
after; flipping status to `finished` is prohibited because it relabels an unsettled family
`settled-terminal` and unlocks migration. A fresh unrelated local goal may create a new PlanRunV1
and run normally; legacy bytes grant no authority.

## GitHub issue publication
Publishing a canonical plan as a GitHub issue — scope, preflights, and what it never changes:
[`references/github-issue-publication.md`](references/github-issue-publication.md).

## BAD / GOOD
```text
BAD: draft a plan, ask for a separate lifecycle command, then resume in another turn.
GOOD: review once, checkpoint ongoing, implement, verify, and archive the same requested goal.
BAD: spend a run's permits, then mint `plan-v2.md`.
GOOD: keep one plan path; append terminal history, then explicitly authorize a fresh run.
BAD: infer deploy permission from requested_effects or an old release receipt.
GOOD: require a matching live ExternalAuthorityV1 at the deploy boundary.
```

## Final checks
- Exact repository/path/current-run identity, append-only attempt history, and exact plan/source/final-manifest/verification hashes.
- Closed phase/lifecycle/status tuple, one initial draft review plus the mandatory post-repair verification, exactly two completion permits, and one transport retry—never two.
- Transaction and owned checkpoint read-backs; unrelated paths excluded.
- Fresh reviewer bindings; stale or cold-live-reservation output ignored.
- Invalid reviewer input terminal-blocked through `review_invalid_input`; no retry, degrade, repair, or authority.
- External actions matched live scope/mode/target/source; skipped otherwise.
- Historical schemas quarantined target-locally and finished history untouched.
