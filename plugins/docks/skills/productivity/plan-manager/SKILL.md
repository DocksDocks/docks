---
name: plan-manager
description: "Use when a goal may require a canonical plan, plan review, implementation, lifecycle handling, legacy-plan quarantine, or guarded GitHub issue publication. Owns classify → draft/review/one repair → start → implement/delegate → verify → finish/archive in main context. Not for docs/plans workspace setup (use plan-workspace) or read-only bundle evidence (use plan-reviewer internally)."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-07-24"
  content_hash: "79916641dad8618bf73bbcde3e903da85a5a2fdf5e7f686013e7f44a7b1555a8"
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
**One current record, closed transitions.** A current canonical plan contains
one unfenced `Plan-run: <compact JCS PlanRunV1>` line. Every tuple, transition,
review result, and write must pass the installed pure validator. Schemas 1–6 are
historical validation/quarantine formats only; never emit or consume them as
current authority.
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

Use a canonical plan for multi-commit or cross-repository work, scheduling, cold
handoff, unresolved approach/decision, cross-subsystem/public-contract work,
security-sensitive/destructive work, an external effect, or an explicit plan
request. Never create a placeholder plan merely to unlock review. A plan-only or
assessment-only request stops after its reviewed deliverable; an implementation
or remediation request continues through observed acceptance without a second
user command.

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

## PlanRunV1

```text
ReviewPhaseV1 = {
  state:"not_required"|"not_started"|"reserved"|"retryable"|"repairing"|"passed"|"degraded"|"blocked"|"cancelled",
  invocations:0|1|2,
  input_sha256:null|64hex,
  result_sha256:null|64hex
}

PlanRunV1 = {
  schema:1, goal_id:uuid, run_id:uuid,
  repository_id:string, plan_path:normalized-relative-path,
  requested_effects:["local", ...("probe"|"production_access"|"publish"|"push"|"release"|"deploy")],
  risk:"local"|"sensitive"|"external",
  plan_sha256:64hex, source_base:null|40hex, source_sha256:64hex,
  draft_review:ReviewPhaseV1,
  execution_parent:null|40hex,
  implementation_commit:null|40hex,
  completion_review:ReviewPhaseV1,
  acceptance:null|{source_sha256:64hex,verification_sha256:64hex},
  blocker:null|{kind:"user_decision"|"missing_authority"|"concurrent_change"|"user_cancelled"|"verification_failed"|"review_failed"|"legacy_invalid",evidence_sha256:64hex}
}
```

`repository_id + plan_path + run_id` is the run identity. Cross-repository goals
have one child run per repository joined by `goal_id`; never use an unqualified
commit id across repositories. Effects are unique and canonical-ordered, always
starting with `local`.

`plan_sha256` excludes only lifecycle status/timestamps, `Plan-run`, `## Review`,
and `## Verification Results`. Goal, scope, paths, steps, effects, safety,
acceptance, and decisions stay bound. `source_base + source_sha256` binds a
sorted existence/kind/mode/content manifest of every affected path at review
time, including dirty/untracked bytes and tombstones. Acceptance binds the final
affected-path manifest and canonical Verification Results bytes.

## Review-phase state table

| State | Invocations | Input | Result | Constraint |
|---|---:|---|---|---|
| `not_required` | 0 | null | null | completion only, local risk |
| `not_started` | 0 | null | null | draft or required completion baseline |
| `reserved` | 1–2 | hash | null | exactly one live launch |
| `retryable` | 1 | hash | failure hash | transport failure only |
| `repairing` | 1 | hash | review hash | accepted repair verdict only |
| `passed` | 1–2 | hash | review hash | matching validated output |
| `degraded` | 2 | hash | failure-set hash | draft/local only |
| `blocked` | 1–2 | hash | evidence hash | terminal |
| `cancelled` | 1–2 | hash | cancellation hash | terminal |

Legal transitions are only `not_started → reserved`; `reserved → passed |
repairing | blocked | cancelled | retryable | degraded`; `retryable → reserved |
blocked | cancelled`; `repairing → reserved | blocked | cancelled`.
`reserved → retryable` is invocation 1 only; `reserved → degraded` is invocation
2 draft/local transport failure only. The second `reserved` consumes the last
permit. Terminal states never reset.

Before any fresh agent starts, transactionally increment the phase count and
persist `reserved` with its exact input digest. Lost output consumes the permit.
Accept a result only while the same phase is still `reserved` with matching
`run_id`, invocation, and input hash. Discard stale results. On cold entry,
`reserved` becomes terminal `blocked` with dangling-launch evidence; never
redispatch it.

## Reviewer result routing

Before generic classification, recognize and validate this closed result:

```text
ReviewInvalidInputV1 = { schema:1, error:"invalid_input",
  reason:"bundle_unavailable"|"bundle_integrity_failed"|
    "bundle_binding_mismatch" }
```

Consume it only through `review_invalid_input` against the exact reserved
`run_id`, invocation, and `input_sha256`; hash it, then terminal-block the
phase and plan as `review_failed`. Never retry, degrade, repair, change another
lifecycle state, or infer authority. Only a valid, fully bound bundle may
produce `PlanReviewV1` or `CompletionReviewV1`.

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
- `blocked` requires a blocker and the exact status/phase tuple in the project
  contract. A pre-dispatch baseline `user_decision|missing_authority` blocker may
  resume after new current-user input without resetting permits. Every other
  blocked/cancelled run is terminal; continuation creates a new `run_id`.

Lifecycle transitions are only absent → `drafting`; `drafting` → `planned |
scheduled | ongoing | blocked`; `planned` ↔ `scheduled`; `planned | scheduled` →
`ongoing | blocked`; and `ongoing` → `finished | blocked`. `finished` is terminal.
Validate the full closed tuple matrix from the project contract before every
write.

## Draft review

1. Research repository facts and produce a complete draft. Bind immutable plan
   bytes and the affected-path manifest in a private temporary bundle.
2. Reserve invocation 1 before launch. Create one fresh `plan-reviewer`; its
   prompt carries only bundle path, `run_id`, invocation, `plan_sha256`, and
   `source_sha256`, never plan bytes or prior review JSON.
3. Classify the closed invalid-input result first as above. For valid, fully
   bound input, accept only a closed ≤32 KiB `PlanReviewV1` matching all four
   bindings. `pass` has no findings. `repair` contains only defects resolvable
   from already grounded facts. `blocked` contains only a required user decision
   or missing safety authority.
4. Reproduce findings. For one accepted repair set, patch only those defects,
   change the bound input, reserve invocation 2, and launch a fresh reviewer.
   Do not add advisory work or reopen review after implementation.
5. A first genuine transport failure—never `ReviewInvalidInputV1`—may use
   invocation 2 as one retry instead of a repair. A second transport failure may
   degrade only reversible local work; sensitive, destructive, public-contract,
   security, or external work blocks.

There is no score, finding quota, provider/model fallback, resumed reviewer,
more than two draft-review invocations, or Session Relay review. Always verify and destroy only
the exact temporary bundle after the result returns.

## Start, implementation, and acceptance

A reviewed implementation writes `ongoing`, captures `execution_parent`, and
creates one owned-path start checkpoint before implementation. Implement or
delegate every authorized local row. Review changes from the user's perspective,
run the requested smoke/acceptance paths, and write observed commands/results to
`## Verification Results` before binding acceptance.

Diagnose and fix ordinary verification failures inside the implementation loop.
If the same failure signature repeats without relevant-byte progress, block with
`verification_failed`; never restart draft review. Local work then atomically
sets `finished`, moves to the unique archive path, and commits implementation
plus finished plan as one final checkpoint. Local completion review is
`not_required`.

Sensitive/external work commits the implementation checkpoint, binds its exact
commit/diff, and reserves a separate completion phase for a fresh code-review
agent returning `CompletionReviewV1`. One accepted blocker fix replaces/amends
the still-unpublished checkpoint, reruns invalidated checks, and consumes the
second permit on the replacement SHA. The first result is invalid after any
relevant byte changes. Only a matching pass may archive; repeated same-signature
no-progress blocks and never reopens draft review.

## Transactions and commits

Every mutation uses one exclusive per-plan transaction: acquire an atomic lock
keyed by repository and normalized path; verify exact bytes/run preimage; reduce
one closed transition; write and fsync a sibling; atomic-rename; read back;
release. A checkpoint additionally acquires the repository lock, verifies exact
HEAD, index, and owned-path preimage, commits only owned paths, and reads back.
Any mismatch fails before write, dispatch, or external action.

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

List/show scan frontmatter first and never validate every active family as a
global prerequisite. Classify legacy only for the requested target. Record-free
plans and complete settled terminal schema-1–6 families may migrate target-
locally during an explicitly requested local start. Active, prepared,
commitment, cancelled, crossed, malformed, or otherwise unsettled families are
`legacy-quarantined`: render only; never dispatch, resume, abandon, repair,
consume, or rewrite them.

A fresh unrelated local goal may create a new PlanRunV1 and run normally;
legacy bytes grant no authority. Never edit historical finished plans. External
recovery still requires new live authority.

## GitHub issue publication

Treat `--issues` / `publish <slug> as an issue` as scope `publish`. Require an
existing canonical plan and exact live publish authority for the repository.
Preflight `gh auth status`, a GitHub remote, and
`gh repo view --json visibility`. If the repository is public, warn that the
issue is public and obtain explicit confirmation before publishing a plan that
names a vulnerability, credential location, or other sensitive finding.

Any failed preflight, absent authority, or declined confirmation creates no issue
and writes nothing. Create the issue from the canonical title/body, transactionally
record its URL in `## Notes`, checkpoint only the owned plan, and read back.
Publication never changes lifecycle, dispatches review, or makes the issue the
source of truth.

## BAD / GOOD

```text
BAD: draft a plan, ask for a separate lifecycle command, then resume in another turn.
GOOD: review once, checkpoint ongoing, implement, verify, and archive the same requested goal.

BAD: infer deploy permission from requested_effects or an old release receipt.
GOOD: require a matching live ExternalAuthorityV1 at the deploy boundary.
```

## Final checks

- Exact repository/path/run identity and one compact Plan-run line.
- Closed phase/lifecycle/status tuple and ≤2 permits per phase.
- Exact plan/source/final-manifest/verification hashes.
- Transaction and owned checkpoint read-backs; unrelated paths excluded.
- Fresh reviewer bindings; stale or cold-reserved output ignored.
- Invalid reviewer input terminal-blocked through `review_invalid_input`; no retry, degrade, repair, or authority.
- External actions matched live scope/mode/target/source; skipped otherwise.
- Historical schemas quarantined target-locally and finished history untouched.
