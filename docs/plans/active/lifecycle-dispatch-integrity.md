---
title: Make the plan lifecycle fail mechanical defects at dispatch instead of in review
goal: Close three measured gaps in the dispatch and replacement path so a mechanically decidable defect aborts before a review permit is reserved, rather than being discovered by a reviewer and charged to the run.
status: drafting
created: "2026-08-01T21:40:30-03:00"
updated: "2026-08-01T21:40:30-03:00"
started_at: null
finished_at: null
assignee: null
tags: [plans, plan-manager, lifecycle, integrity, registered-idea]
affected_paths:
  - plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs
  - plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs
  - scripts/tests/plan-dispatch-probes.mjs
  - docs/plans/AGENTS.md
related_plans: []
---

# Make the plan lifecycle fail mechanical defects at dispatch instead of in review

## Goal

A defect a program can decide fails at dispatch and costs nothing. Only defects
requiring judgement reach a reviewer and consume a permit.

## Context & rationale

Each gap below was found by running the lifecycle, not by reading it, and each was
worked around by hand during the session that found it. Every claim carries the
command or line that produced it.

The governing principle, stated once so the individual fixes are not read as
unrelated repairs: **a mechanically decidable defect must fail at dispatch, never
in review.** A reviewer permit is scarce and is meant to buy judgement. Spending
one to learn that two digests disagree is waste that compounds, because a repair
verdict also consumes the round.

### Gap 1: the sealed bundle is not self-consistent by construction

`dispatch-review.mjs:171` seals `planBytes: Buffer.from(candidateText)` — the
author's body, whose embedded record is whatever the author last wrote. The
manifest and binding are computed fresh at lines 161 to 164, and the reserve
transition rebinds `plan_sha256`, `source_base`, and `source_sha256` at lines 369
to 371, which is **after** the seal. So a reviewer can be handed a bundle whose
`plan.md` contradicts its own `manifest.json`.

Measured: this fired as finding `PRV1-001` on run `ff2125bd`, where the bundle's
`source_sha256` read `521f0e36…` against `ba16f51f…` in the manifest. Two of the
three fields agreed only because HEAD had not moved between the record write and
the dispatch. The cost was a review permit spent on a driver artifact rather than
a plan defect.

The naive fix is circular: the reserve event takes `bundle.sha256` as its
`input_sha256`, so the bundle must exist before the reserved record does. The
workable fix applies only the three rebindable fields to the record embedded in
`plan.md` before sealing, and leaves `draft_review` in its pre-reserve state,
which the reviewer contract already expects.

### Gap 2: replacement can reopen an archived plan the contract forbids

`replacePlanRunInPlace` takes `file` as a caller argument and nothing ties it to
the record's `plan_path`; `validatePlanRun` does not check it either. Meanwhile
`docs/plans/AGENTS.md` states that a finished plan file never reopens, and that
replacement installs in the same file at the same `plan_path`.

Measured: during this session the blocked predecessor was briefly archived, and
the mechanism would have accepted a replacement against the copy under
`finished/`. The contract forbids what the code permits.

### Gap 3: no pre-reserve assertion, so the permit is spent before the check

Even with Gap 1 fixed, nothing verifies bundle self-consistency before the permit
is reserved. This session the operator performed that comparison **by hand twice**
— reading the sealed `plan.md` record and comparing `plan_sha256`, `source_base`,
and `source_sha256` against `manifest.json` before allowing a dispatch to proceed.
It caught a real divergence both times. That check exists nowhere in code, so the
next author repeats the manual step or pays a permit.

### Deliberately not in scope: the reviewer's own integrity check

Recorded because the session first suspected it and measurement refuted that, and
a future reader should not re-litigate it. `plan-reviewer/scripts/review-policy.mjs`
already enforces bundle integrity: line 16 requires `binding.json`,
`manifest.json`, and `plan.md`; lines 513 to 516 parse the binding and assert it
closed; lines 526 to 527 throw on plan and manifest hash mismatch; lines 530 to
532 validate the plan bytes and manifest against the binding. `plan-reviewer/SKILL.md`
lines 74 to 75 map those failures to `bundle_integrity_failed` and
`bundle_binding_mismatch`.

The earlier observation — a reviewer returning a content verdict over a flat `.md`
file with no manifest — was an operator bypass, not a code gap: a hand-rolled
dispatch never invoked that code. That bypass was closed by documentation in
commit `92a20b3`. Adding a step here would be a check that cannot fail, which is
precisely the defect class this plan exists to remove.

## Environment & how-to-run

Run every command from the repository root of this checkout. Do not write an
absolute machine path into plan text: `plan-skill-phases.mjs --case
bounded-workflows` fails any active plan citing an absolute checkout path.

```bash
corepack enable && pnpm install --frozen-lockfile   # Node 24
node scripts/tests/plan-orchestration.mjs           # reaches the dispatch probes
node scripts/ci.mjs --plugin docks                  # authoritative gate for this plan
```

The dispatch probes exercise the driver without reserving a real permit, so this
work is verifiable without spending review budget.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Seal the rebound record into the bundle so `plan.md` and `manifest.json` agree by construction | `lifecycle/dispatch-review.mjs` | — | `local` | `planned` | For a candidate body whose embedded record is deliberately stale, the sealed bundle's record carries the same `plan_sha256`, `source_base`, and `source_sha256` as the manifest and binding, while `draft_review` stays pre-reserve. Failure: STOP; do not resolve the circularity by moving the reserve before the seal, because the reserve event consumes the bundle digest. |
| 2 | Assert bundle self-consistency before reserving, and abort if it fails | `lifecycle/dispatch-review.mjs` | 1 | `local` | `planned` | With step 1 reverted, a dispatch attempt exits non-zero naming the disagreeing field and the phase state is unchanged, so no permit is reserved. With step 1 applied, the same dispatch proceeds. Failure: STOP; an assertion that runs after reservation has already spent what it was meant to protect. |
| 3 | Tie the replacement transaction's file argument to the record's `plan_path` | `scripts/plan-run.mjs` | — | `local` | `planned` | A replacement whose `file` resolves to a path other than the record's `plan_path` is rejected before any write. Failure: STOP; the guard must reject rather than normalise, because silently rewriting the target is how an archived plan gets reopened. |
| 4 | Add one probe per gap, each proven to fail when its fix is reverted | `scripts/tests/plan-dispatch-probes.mjs` | 1, 2, 3 | `local` | `planned` | Each probe fails with its corresponding fix reverted and passes with it applied, demonstrated by reverting one fix at a time. Failure: STOP; a probe that passes both ways proves nothing. |
| 5 | Record the now-enforced requirements in the contract | `docs/plans/AGENTS.md` | 4 | `local` | `planned` | The contract states that the sealed bundle is self-consistent by construction, that dispatch aborts before reserving on a self-consistency failure, and that replacement binds the file to `plan_path`. Failure: STOP; an enforced rule that is not written down drifts back out. |
| 6 | Archive this plan | this plan record | 5 | `local` | `planned` | Plan is `finished` at the dated archive path with a local commit. Failure: leave `ongoing`. |

## Acceptance criteria

Each row names a command and the output shape that satisfies it, and each fix
carries a revert check, because a guard that passes with its fix removed proves
nothing.

1. `node scripts/tests/plan-orchestration.mjs` exits 0. This is the suite that
   reaches the dispatch probes, so it is the gate covering this work.
2. `node scripts/ci.mjs --plugin docks` exits 0 with a clean working tree.
3. For a candidate body whose embedded record is deliberately stale, the sealed
   bundle's `plan.md` record equals the manifest and binding on `plan_sha256`,
   `source_base`, and `source_sha256`. Non-vacuity: with the seal fix reverted, the
   same comparison reports a difference.
4. With the seal fix reverted, a dispatch exits non-zero and the phase state is
   unchanged, proving no permit was reserved. Non-vacuity: with the fix applied,
   the same dispatch reserves and proceeds.
5. A replacement call whose `file` differs from the record's `plan_path` is
   rejected. Non-vacuity: with the guard reverted, the same call succeeds, which is
   the defect.
6. Every line citation in the Context section still resolves to the construct it
   describes, verified by re-reading those lines rather than trusting this document.

Every row is anchored to a command and an output shape rather than to a row
number, so renumbering the Steps table cannot desync it.

## Out of scope / do-NOT-touch

- The review permit budget, the number of permits, and any class-repetition rule.
  Those are a separate goal; this plan only stops mechanical defects from
  consuming permits.
- The reviewer's own bundle-integrity verification, which measurement shows is
  already enforced. See the Context note.
- The blocked 0.15.0 release run and its successor. This plan neither repairs nor
  replaces it.
- Extracting the lifecycle into its own plugin. Separate registered plan.
- Every plan under `docs/plans/finished/` — historical records stay
  byte-identical.
- Validator floors and frozen censuses. Fix the file, never the threshold.

## STOP conditions

1. Any row whose `Effect` column is not `local` is reached. This plan requests
   local effects only, so a step needing to publish, push, or release means the
   scope changed and the plan must be re-drafted with new effects and live
   authority.
2. A fix is landed without a probe that fails when it is reverted.
3. The reserve transition is moved before the bundle seal to resolve the
   circularity. The reserve event consumes the bundle digest, so that ordering
   cannot work and would trade one integrity gap for another.
4. The replacement guard normalises a mismatched path instead of rejecting it.
5. The gate needs a floor lowered, a census edited to match a scan, or a golden
   hand-edited to pass. Any of these means the change is wrong, not the check.
6. `dispatch-review.mjs` is edited while any live run holds a reserved permit on
   that driver. A driver defect would then cost the run rather than the suite.

## Open questions

1. Whether the three rebindable fields should be applied by a shared helper also
   used by the reserve transition, so the two cannot drift apart again. Measure the
   duplication before choosing.
2. Whether the replacement guard belongs in `replacePlanRunInPlace` or in
   `validatePlanRun`, given that the latter already receives the identity and could
   compare it against the file it read.
3. Whether the pre-reserve assertion should compare all record fields the reserve
   transition may touch, or only the three currently rebound. Enumerate them from
   the transition rather than assuming three.

## Review

Not dispatched. This plan is registered so measured defects in shipped code
survive the session that found them, and it holds a full review budget. No permit
has been reserved or spent.

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"execution_parent":null,"goal_id":"87343789-e7fe-474b-aad4-afb4289ef4a0","implementation_commit":null,"plan_path":"docs/plans/active/lifecycle-dispatch-integrity.md","plan_sha256":"9bc268a47e922c6d2f46b9efb7bf99ced956e2f77c5fa7980df690a8c6da1014","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"8f85332a-00e5-49d2-9d55-7222fe74048e","schema":1,"source_base":"d2a151f39cf9d3096569d2de6921ef12c068b11d","source_sha256":"376dbe101726f0a5a3eb7d6bf440cf2ddabf6dd517cd56ee5ba6e68cdf19af20"}

## Verification Results

Manager-written after execution. Empty at registration time.
