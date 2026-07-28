---
name: plan-manager
description: "Use when a goal may require a canonical plan, plan review, implementation, lifecycle handling, legacy-plan quarantine, or guarded GitHub issue publication. Owns classify → draft/review/one repair → start → implement/delegate → verify → finish/archive in main context. Not for docs/plans workspace setup (use plan-workspace) or read-only bundle evidence (use plan-reviewer internally)."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-07-28"
  content_hash: "9bbc87006426cf5c0abb9554143db65f45e1fe08a4428a523af14438a5bc7cf0"
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
| Plan-only request | Draft, review, optionally repair once, persist `planned` or `scheduled` | 1–2 draft reviewers / 1 commit |
| Ordinary canonical implementation | Review, start checkpoint, implement, verify, archive | 1–2 draft reviewers / 2 commits |
| Sensitive, destructive, public-contract, security, or external implementation | Add exact-diff completion review and implementation checkpoint | ≤2 draft + ≤2 completion reviewers / 3 commits |

Use a canonical plan for multi-commit/cross-repository work, scheduling, cold
handoff, unresolved decisions, cross-subsystem/public-contract/security/
destructive work, external effects, or explicit planning. Never create one merely
to unlock review. Plan-only work stops there; implementation runs to acceptance.

## Canonical plan contract

Load the nearest `docs/plans/AGENTS.md` before writing. Current steps use:

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | concrete action | exact paths | — | `local` | `planned` | observable proof or STOP |

`Effect` is exactly `local | probe | production_access | publish | push |
release | deploy`; step status is `planned | in-flight | done | blocked |
skipped`. Frontmatter status is `drafting | planned | scheduled | ongoing |
blocked | finished`. The body is a cold handoff with executable acceptance,
protected scope, stop conditions, open decisions, `## Review`, and manager-owned
`## Verification Results`.

Plan text must be portable: a cold reader may hold this repository at a different
path. `repository_id` is a portable repository identifier such as
`DocksDocks/docks`, never a local filesystem path. Cite repository-relative paths
only; acceptance rows run from the repository root and carry no `cd <absolute
path>` prefix. A cross-repository reference names the other repository's id, not a
local checkout. Recorded evidence is exempt and frozen: never rewrite a `cwd` or
path already captured inside a receipt.

## PlanRunV1

`repository_id + plan_path + run_id` is the run identity. Never list the plan
record itself in `affected_paths`: acceptance writes to it and breaks that bind.
Field shapes, replacement-authority rules, and the exact `plan_sha256` exclusion
list: [`references/planrunv1-schema.md`](references/planrunv1-schema.md).

## Review-phase state table

| State | Invocations | Input | Result | Constraint |
|---|---:|---|---|---|
| `not_required` | 0 | null | null | completion only, local risk |
| `not_started` | 0 | null | null | draft or required completion baseline |
| `reserved` | 1–2 | hash | null | live initial/repair launch |
| `transport_retried` | 1–2 | hash | null | live post-transport launch |
| `retryable` | 0–1 | hash | failure hash | first transport failure; refunded |
| `repairing` | 1 | hash | review hash | accepted repair verdict only |
| `passed` | 1–2 | hash | review hash | matching validated output |
| `degraded` | 1–2 | hash | failure-set hash | draft/local only |
| `blocked` | 1–2 | hash | evidence hash | terminal |
| `cancelled` | 1–2 | hash | cancellation hash | terminal |

Legal transitions are `not_started → reserved`; `reserved → passed | repairing |
blocked | cancelled | retryable`; `retryable → transport_retried | blocked |
cancelled`; `transport_retried → passed | repairing | blocked | cancelled |
degraded`; and `repairing → reserved | blocked | cancelled`.
A transport failure from `reserved` refunds one invocation. Re-reservation
consumes it into `transport_retried`; a second transport failure keeps that
count and degrades only local draft review, otherwise blocks. Invocation-2
repair blocks. Terminal states never reset.

Before launching, transactionally increment the phase count and persist
`reserved`, or `transport_retried` after the first transport failure, with the
exact input digest. A verdict spends the permit; only the first transport
failure refunds it. Accept results only in either live state with matching
`run_id`, invocation, and input hash. Discard stale results. Cold entry into
either live state blocks with dangling-launch evidence and never redispatches.

Preflight the reviewer route and a private full-output file before reserving.
Seal an invocation-specific bundle; after reservation read-back, derive its
prompt and capture complete stdout to the file. Clipped console/transcript text
is not evidence; never reconstruct JSON or request compact/single-line output.
Parse the file, validate the closed object, then hash canonical JCS.
A transport retry preserves substantive bindings but seals a fresh bundle with
a different input digest and persists `transport_retried`; reuse is stale.

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
2. Seal invocation 1, reserve its digest, read back, derive the prompt, launch a
   fresh reviewer, and capture complete stdout to the file—not console text.
3. Route invalid input first. Otherwise accept only a closed ≤32 KiB bound
   `PlanReviewV1`: `pass` has no findings; `repair` is repository-resolvable;
   `blocked` identifies only a required decision or missing authority.
4. For one accepted repair, patch only reproduced defects, then seal/reserve/
   read-back/dispatch a changed invocation-2 bundle and fresh prompt.
5. A first genuine transport failure refunds its permit. Seal a fresh bundle
   with a different input digest, persist `transport_retried`, and dispatch once
   more without changing substantive bindings. A second failure degrades only
   reversible local work; sensitive/public-contract/security/external work blocks.

No score, quota, fallback, resumed reviewer, third invocation, or Session Relay review exists. Destroy only the returned exact bundle.

## Start, implementation, and acceptance

A reviewed implementation writes `ongoing`, captures `execution_parent`, and
creates one owned-path start checkpoint before implementation. Implement or
delegate every authorized local row. Review changes from the user's perspective,
run the requested smoke/acceptance paths, and write observed commands/results to
`## Verification Results` before binding acceptance, which passes the live
`acceptanceManifest` and `acceptanceManifestExpectation`; omitting either fails closed.

Diagnose ordinary verification failures in the implementation loop. Repeated
same-signature failure without relevant-byte progress blocks this run and never
reopens its review; authorized recovery uses a fresh run at this path. Successful
local work sets `finished`, moves to the unique archive path, and commits
implementation plus finished plan as one final checkpoint. Local completion
review is `not_required`.

Sensitive/external work commits the implementation checkpoint, binds its exact
commit/diff, and reserves a separate completion phase for a fresh code-review
agent returning `CompletionReviewV1`. One accepted blocker fix replaces/amends
the still-unpublished checkpoint, reruns invalidated checks, and consumes the
second permit on the replacement SHA. The first result is invalid after any
relevant byte changes. Only a matching pass may archive; repeated same-signature
no-progress blocks this run and never reopens its completion review.

## Transactions and commits

Every ordinary mutation uses `transactPlanRun`: lock by repository/path, verify
exact bytes/run, reduce one closed transition, fsync a sibling, atomic-rename,
and read back. Terminal same-path rollover uses only `replacePlanRunInPlace`,
locking and binding the predecessor before appending history. Checkpoints also
lock the repository, verify HEAD/index/owned paths, commit only owned paths, and
read back. Any mismatch fails before write, dispatch, or external action.

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
- Closed phase/lifecycle/status tuple, ≤2 substantive permits per phase, and at most one transport retry.
- Transaction and owned checkpoint read-backs; unrelated paths excluded.
- Fresh reviewer bindings; stale or cold-live-reservation output ignored.
- Invalid reviewer input terminal-blocked through `review_invalid_input`; no retry, degrade, repair, or authority.
- External actions matched live scope/mode/target/source; skipped otherwise.
- Historical schemas quarantined target-locally and finished history untouched.
