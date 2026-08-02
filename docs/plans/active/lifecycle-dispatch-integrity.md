---
title: Fail mechanical lifecycle defects before review
goal: Close three lifecycle integrity gaps so bundle mismatches and replacement-path mismatches fail before a write or review permit is reserved.
status: drafting
created: "2026-08-01T21:40:30-03:00"
updated: "2026-08-02T17:40:38.169+00:00"
started_at: null
finished_at: null
assignee: null
tags: [plans, plan-manager, lifecycle, integrity, registered-idea]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs
  - plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs
  - plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md
  - scripts/tests/plan-dispatch-probes.mjs
  - scripts/tests/plan-orchestration/locks-cas.mjs
  - scripts/tests/plan-skill-phases.mjs
related_plans: []
---

# Fail mechanical lifecycle defects before review

## Goal

A mechanically decidable bundle or replacement-path defect fails before a write
or review reservation. Reviewer permits remain available for judgement.

## Context & rationale

The governing rule is that mechanical identity contradictions belong at the
dispatch or transaction boundary, not in reviewer findings.

### Gap 1: the sealed plan record is stale {mechanism}

`plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs:146-175`
computes a fresh manifest, plan digest, and binding, but seals `candidateText`
without first rebinding its embedded run. The binding created at lines 163-164
contains `plan_sha256` and `source_sha256`, not `source_base`. The reserve
successor receives all three rebound fields only at lines 364-379, after the
bundle has already been sealed. One shared helper must apply exactly
`plan_sha256`, `source_base`, and `source_sha256` both to the pre-seal candidate
run and to the reserved successor; it must not alter either review phase.

This rebinding is non-circular. The bundle digest remains the reservation input,
while the sealed plan intentionally retains the pre-reserve `draft_review`.
`plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs:301-355`
excludes the `Plan-run` line and lifecycle frontmatter from the canonical plan
view, so rebinding those three record fields does not move `plan_sha256`.

### Gap 2: replacement does not bind the file path {mechanism}

`plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs:862-890`
validates content and optional record identities but receives no file path.
`replacePlanRunInPlace` reads and eventually writes the caller-supplied `file` at
lines 1933-1981 while its replacement assertion at lines 1736-1743 checks the
successor record's `plan_path`, not the resolved file path. A caller can therefore
lock under one logical identity while targeting another file. The guard belongs
inside `replacePlanRunInPlace`, after the current bytes and record are validated
and before any write: resolve the explicit repository root, derive the normalized
repository-relative path of `file`, and reject unless it equals
`current.run.plan_path`.

### Gap 3: no explicit pre-reserve cross-artifact assertion {mechanism}

The bundle policy already defines the three required files at
`plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs:16`
and verifies their canonical JSON and digests at lines 506-551. Its closed review
binding has only `run_id`, `invocation`, `plan_sha256`, and `source_sha256` at
lines 108-114; manifest validation binds `source_sha256` at lines 287-293.
Dispatch must invoke that existing verifier again immediately before reservation,
then assert exactly three pairs: record `plan_sha256` equals binding
`plan_sha256`, record `source_sha256` equals binding `source_sha256`, and record
`source_base` equals manifest `source_base`. It must not compare pre-reserve
bundle phase fields with the post-reserve run.

### Historical attribution correction

The surviving incident record does not establish that the canonical driver
produced finding `PRV1-001`. `docs/plans/finished/2026-08-02-session-relay-0.15.0-release.md`
rejects that finding as not reproducible against the live record, although the
bundle contradiction itself was real. Lines 435-452 separately attribute a flat
`.md` bundle to a hand-sealed operator bypass that did not use the canonical
driver. This plan relies on the current source gaps and revert-sensitive probes,
not on that historical attribution or on unreproducible incident counts.

The reviewer-side verifier is therefore out of scope: its file inventory and
inspection are present at the current citations above. The missing guarantees
are construction, dispatch ordering, and replacement target identity.

## Environment & how-to-run

Run commands from the repository root. The checked environment uses Node
`v24.15.0`; `package.json:4` pins pnpm `11.5.1`. Install dependencies when needed
with `corepack pnpm install --frozen-lockfile`. Focused probes use disposable
temporary repositories and do not consume a live plan permit.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Add one shared run-rebinding helper and use it for both the pre-seal candidate and reserved successor | `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs` | — | `local` | `planned` | The helper writes exactly `plan_sha256`, `source_base`, and `source_sha256`; the sealed record carries those values while retaining pre-reserve `draft_review`, and the reserve event still consumes the completed bundle digest. STOP if the helper touches a phase field or sealing is moved after reservation. |
| 2 | Verify the sealed bundle and assert the three decided cross-artifact pairs before reservation | `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs` | 1 | `local` | `planned` | The existing reviewer-policy verifier succeeds, then record/binding `plan_sha256`, record/binding `source_sha256`, and record/manifest `source_base` are equal before any reserve transaction. A mismatch exits non-zero with `PREFLIGHT FAILED - no permit reserved, no reviewer dispatched.` and names the field. STOP if the check occurs after reservation or compares `source_base` to the binding. |
| 3 | Reject replacement when the resolved file does not equal the current run's normalized `plan_path` | `plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs` | — | `local` | `planned` | `replacePlanRunInPlace` accepts an explicit repository root, validates the current record, derives the normalized repository-relative `file` path, and throws `replacement file path does not match current PlanRun plan_path` before writing on mismatch. STOP if the target is rewritten, the check is placed in `validatePlanRun`, or the mismatch changes bytes. |
| 4 | Add one revert-sensitive probe for each fix | `scripts/tests/plan-dispatch-probes.mjs`, `scripts/tests/plan-orchestration/locks-cas.mjs` | 1, 2, 3 | `local` | `planned` | `dry-run` checks the three rebound record fields and, with step 1 reverted, fails with `sealed plan record plan_sha256 must equal binding plan_sha256`; `preflight-before-reserve` exercises a deliberately stale sealed record and, with step 2 reverted, fails with `bundle mismatch must be refused before reserve`; the `locks-cas` replacement-path case and, with step 3 reverted, fails with `replacement file/path mismatch must reject`. Each control also proves the original file bytes and review phase are unchanged on rejection. STOP if any probe passes with its fix reverted. |
| 5 | Record the guarantees in both contract copies and pin their distinguishing clauses | `docs/plans/AGENTS.md`, `plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md`, `scripts/tests/plan-skill-phases.mjs` | 1, 2, 3, 4 | `local` | `planned` | Both contract copies state the three-field pre-seal rebound, the exact binding-versus-manifest comparisons, pre-reserve failure, and replacement file-path rejection; `node scripts/tests/plan-skill-phases.mjs --case bounded-workflows` exits 0, while reverting any pinned clause produces its named missing-clause assertion. STOP if the assertion is relaxed instead of positively pinning the new contract. |
| 6 | Run focused suites and the authoritative plugin gate | `docs/plans/AGENTS.md`, `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs`, `plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs`, `plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md`, `scripts/tests/plan-dispatch-probes.mjs`, `scripts/tests/plan-orchestration/locks-cas.mjs`, `scripts/tests/plan-skill-phases.mjs` | 4, 5 | `local` | `planned` | Every acceptance command exits 0 with the stated output. STOP on any failure; do not lower a floor, weaken an assertion, or update expected output to conceal a regression. |
| 7 | Archive the finished plan | docs/plans/finished/<finish-date>-<slug>.md | 6 | `local` | `planned` | The lifecycle archive transaction moves the finished record to the unique path where `<finish-date>` is the UTC date on which the archive transaction runs and `<slug>` is `lifecycle-dispatch-integrity`; read-back succeeds and the final owned-path checkpoint is clean. Failure: leave the plan `ongoing` at its active path. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-dispatch-probes.mjs dry-run` | Exits 0 and prints `ok - plan-dispatch-probes: dry-run`; reverting the shared pre-seal rebound makes this same command exit 1 with `sealed plan record plan_sha256 must equal binding plan_sha256`. |
| A2 | `node scripts/tests/plan-dispatch-probes.mjs preflight-before-reserve` | Exits 0 and prints `ok - plan-dispatch-probes: preflight-before-reserve`; reverting the pre-reserve assertion makes this same command exit 1 with `bundle mismatch must be refused before reserve`. |
| A3 | `node scripts/tests/plan-orchestration.mjs --case locks-cas` | Exits 0 and prints `ok - locks-cas: replacement rejects a file outside current plan_path`; reverting the replacement path guard makes this same command exit 1 with `replacement file/path mismatch must reject`. |
| A4 | `node scripts/tests/plan-skill-phases.mjs --case bounded-workflows` | Exits 0 and prints `three-skill, one-wrapper bounded plan workflows passed`. |
| A5 | `node scripts/tests/plan-orchestration.mjs --case dispatch-driver` | Exits 0 and every registered dispatch probe prints an `ok - dispatch-driver:` line. |
| A6 | `node scripts/tests/plan-orchestration.mjs` | Exits 0 and its final line matches `plan-orchestration: [0-9]+/[0-9]+ passed` with equal numerator and denominator. |
| A7 | `node scripts/ci.mjs --plugin docks` | Exits 0 with the docks plugin gate reporting no failure. |

## Out of scope / do-NOT-touch

- Review permit counts, refund semantics, and finding-class budgets.
- Reviewer-side bundle inspection or invalid-input routing.
- Any active or finished plan other than this plan's lifecycle archive transaction.
- The blocked session-relay release run or any successor run.
- Lifecycle plugin extraction, release, publication, push, deployment, or production access.
- Validator floors, historical censuses, or golden outputs unrelated to the new positive assertions.

## STOP conditions

1. Any required effect is not `local`.
2. A fix lacks a probe that fails with the fix reverted and names the expected diagnostic.
3. Reservation moves before bundle sealing, or a mismatch is checked after reservation.
4. Any assertion compares record `source_base` to the binding instead of the manifest.
5. The replacement path mismatch is normalized by rewriting the target rather than rejected.
6. A test is made green by lowering a floor, weakening a positive assertion, changing an unrelated golden, or touching an unlisted path.
7. A live run is already `reserved` or `transport_retried` on the driver when implementation begins; do not change dispatch code under an active reviewer invocation.

## Open questions

1. **DECIDED — one shared rebound helper.** It applies exactly `plan_sha256`, `source_base`, and `source_sha256` to a run for both the pre-seal candidate and reserved successor, preventing drift while leaving phase fields untouched so the sealed bundle retains pre-reserve `draft_review`.
2. **DECIDED — guard inside `replacePlanRunInPlace`.** After validating current bytes, resolve the explicit repository root and normalized repository-relative `file` path, require equality with `current.run.plan_path`, and reject a mismatch; `validatePlanRun` cannot own a rule for a path it never receives.
3. **DECIDED — three pre-reserve pairs plus existing digest verification.** Compare record/binding `plan_sha256`, record/binding `source_sha256`, and record/manifest `source_base`, and re-run the reviewer-policy verifier; post-reserve phase fields intentionally are not compared with a pre-reserve bundle.

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"4169fc6aa2ba41d794eb49a9d50840b762cc72bf1b091409582c00019a5fd5ab","invocations":1,"result_sha256":"291193722502b3c57df6408227e2ccbefded1578a7596a7c5f61527397c8a111","state":"passed"},"execution_parent":null,"goal_id":"87343789-e7fe-474b-aad4-afb4289ef4a0","implementation_commit":null,"plan_path":"docs/plans/active/lifecycle-dispatch-integrity.md","plan_sha256":"cbf4582cfcca83cc641842d4263dd74fddf27fb5186549b6d5b9c2d82d810043","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"8f85332a-00e5-49d2-9d55-7222fe74048e","schema":1,"source_base":"702383f504757336ebe6c3859db70384e82a814f","source_sha256":"58c413f485e13879fea6fcc36e7bb14c744bfc964fd635f8841714acded3e7d4"}

## Review

N/A — no review has been dispatched for this run.

## Verification Results

N/A — manager-written after execution.
