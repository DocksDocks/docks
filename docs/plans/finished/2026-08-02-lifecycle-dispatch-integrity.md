---
title: Fail mechanical lifecycle defects before review
goal: Close three lifecycle integrity gaps so bundle mismatches and replacement-path mismatches fail before a write or review permit is reserved.
status: finished
created: "2026-08-01T21:40:30-03:00"
updated: "2026-08-02T23:48:55.904+00:00"
started_at: "2026-08-02T22:29:16.267+00:00"
finished_at: "2026-08-02T23:48:55.904+00:00"
assignee: null
tags: [plans, plan-manager, lifecycle, integrity, registered-idea]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs
  - plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs
  - plugins/docks/skills/productivity/plan-workspace/SKILL.md
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

> **Successor note - why steps 1-6 read `done` on a run that has not started.**
> This run replaces terminal predecessor `469d3195`, blocked `review_failed`. Its completion review
> returned four findings. Two were real and are fixed in the world; two were artifacts of a defect in
> the orchestrator's own reservation driver and are not defects of this work.
>
> `CDI-004` - REAL, fixed at `57bbff0`. `acquirePlanLock` resolves symlinks to build its key while
> the CAS read and `fs.renameSync` used the caller's raw path, so a transaction through an alias
> locked the target and wrote the alias. The predecessor fixed this in `replacePlanRunInPlace` only;
> `transactPlanRun` - the path every start, reserve, record and finish takes - still had it. Both
> call sites now resolve once, before the lock, and use that single value for the key, the read and
> the rename. Probe: `locks-cas: a transaction through an alias writes the resolved plan path`.
>
> `CDI-005` - REAL, fixed. Removing the reserved-successor `rebindReviewSource` call left every
> dispatch probe passing. Probe `plan-dispatch-probes: reserved-rebind` now drives a real
> reservation from a stale record and asserts the persisted record carries all three rebound fields.
>
> `CDI-006` - REAL, fixed here. `affected_paths` declared `plan-workspace/SKILL.md`, but the step 5
> Files cell did not inventory it. The Steps table is inside `plan_sha256`, so replacement was the
> only mechanism; the cell now lists it.
>
> `CDI-007` - NOT a defect of this work. The reviewer read a stale `## Verification Results`. The
> orchestrator's reservation driver sealed the pre-update bytes while binding the post-update
> digests, so the bundle disagreed with the record it described - the very Gap-1 shape this plan
> closes, reproduced in the driver. The driver now seals exactly the installed bytes and reads them
> back, requiring byte equality with the live record before returning.
>
> Steps 1-6 describe world state inherited across `1a7e68f`, `74653fd`, `055c6ae` and `57bbff0`,
> with `node scripts/ci.mjs` passing. Step 7 stays `planned`.

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Add one shared run-rebinding helper and use it for both the pre-seal candidate and reserved successor | `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs` | — | `local` | `done` | The helper writes exactly `plan_sha256`, `source_base`, and `source_sha256`; the sealed record carries those values while retaining pre-reserve `draft_review`, and the reserve event still consumes the completed bundle digest. STOP if the helper touches a phase field or sealing is moved after reservation. |
| 2 | Verify the sealed bundle and assert the three decided cross-artifact pairs before reservation | `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs` | 1 | `local` | `done` | The existing reviewer-policy verifier succeeds, then record/binding `plan_sha256`, record/binding `source_sha256`, and record/manifest `source_base` are equal before any reserve transaction. A mismatch exits non-zero with `PREFLIGHT FAILED - no permit reserved, no reviewer dispatched.` and names the field. STOP if the check occurs after reservation or compares `source_base` to the binding. |
| 3 | Reject replacement when the resolved file does not equal the current run's normalized `plan_path` | `plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs` | — | `local` | `done` | `replacePlanRunInPlace` accepts an explicit repository root, validates the current record, derives the normalized repository-relative `file` path, and throws `replacement file path does not match current PlanRun plan_path` before writing on mismatch. STOP if the target is rewritten, the check is placed in `validatePlanRun`, or the mismatch changes bytes. |
| 4 | Add one revert-sensitive probe for each fix | `scripts/tests/plan-dispatch-probes.mjs`, `scripts/tests/plan-orchestration/locks-cas.mjs` | 1, 2, 3 | `local` | `done` | `dry-run` checks the three rebound record fields and, with step 1 reverted, fails with `sealed plan record plan_sha256 must equal binding plan_sha256`; `preflight-before-reserve` exercises a deliberately stale sealed record and, with step 2 reverted, fails with `bundle mismatch must be refused before reserve`; the `locks-cas` replacement-path case and, with step 3 reverted, fails with `replacement file/path mismatch must reject`. Each control also proves the original file bytes and review phase are unchanged on rejection. STOP if any probe passes with its fix reverted. |
| 5 | Record the guarantees in both contract copies and pin their distinguishing clauses | `docs/plans/AGENTS.md`, `plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md`, `plugins/docks/skills/productivity/plan-workspace/SKILL.md`, `scripts/tests/plan-skill-phases.mjs` | 1, 2, 3, 4 | `local` | `done` | Both contract copies state the three-field pre-seal rebound, the exact binding-versus-manifest comparisons, pre-reserve failure, and replacement file-path rejection; `node scripts/tests/plan-skill-phases.mjs --case bounded-workflows` exits 0, while reverting any pinned clause produces its named missing-clause assertion. STOP if the assertion is relaxed instead of positively pinning the new contract. |
| 6 | Run focused suites and the authoritative plugin gate | `docs/plans/AGENTS.md`, `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs`, `plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs`, `plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md`, `scripts/tests/plan-dispatch-probes.mjs`, `scripts/tests/plan-orchestration/locks-cas.mjs`, `scripts/tests/plan-skill-phases.mjs` | 4, 5 | `local` | `done` | Every acceptance command exits 0 with the stated output. STOP on any failure; do not lower a floor, weaken an assertion, or update expected output to conceal a regression. |
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

Plan-run: {"acceptance":{"source_sha256":"ce458aef24f6f5ec1019bc01d7966f93412a7d40467d226d401125ee1105003b","verification_sha256":"805b7d74689fd554377483dd3ef59481d6c1465ae6211ae47ac1b0df0e62011f"},"blocker":null,"completion_review":{"input_sha256":"d41ffc1e246f4ea4bdd8c460aab65af3784ad62fc96ee0c2e068a80007938673","invocations":2,"result_sha256":"cff7695e700d52affc302a71bc5a546bbe9b02c1f7c649ffa8fc34dcd74b2580","state":"passed"},"draft_review":{"input_sha256":"8a5df752d09ea6a0950cb3e74215be2fdb6048538f7958c129f7187e4b8db351","invocations":1,"result_sha256":"8fe75223258f2143c11aba2360249980af318e69a26a3c64239ac0247621f90b","state":"passed"},"execution_parent":"428ca586723eafa326c4dca495940f7a2bbe2ad9","goal_id":"87343789-e7fe-474b-aad4-afb4289ef4a0","implementation_commit":"c14070f141e58a91296ee24f99e82c808455ada4","plan_path":"docs/plans/active/lifecycle-dispatch-integrity.md","plan_sha256":"10983fdb9218b326b0d65238f0f7639b12b365e84bf1d014a82041522cc85bc8","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"23c9abdb-1227-4f42-bdfd-0a048bdc0421","schema":1,"source_base":"b73ffadc67cbc29722ccbbc64754e9be859d2e6d","source_sha256":"f202336d79d5a435a7db682a85399f1bb0976c38212697d43647d4e779880360"}

## Review

No review has been dispatched for this run. The predecessor run `8f85332a` and its
completion-review evidence are recorded below as append-only attempt history.


Plan-attempt-history: {"authorization_source_sha256":"0889cde97525945382fbfa4f98b7f726fca77bdb38221c558412b63fb9ae6641","plan_bytes_sha256":"9732fa21e47394acfcbe46afa4f4ae7dbd8fe631c6c120728761adec8f622287","replacement_run_id":"469d3195-f9d1-423e-a10d-96994d7ccba9","run":{"acceptance":{"source_sha256":"f220b8b4021878c3d6b7522c72f1ba023568fdd55ba388ae5e347ad10cdd2cd4","verification_sha256":"475869e7d45b233c6fae8c6e1ae1b3445d3d4834847357e37fee0eade875aa43"},"blocker":{"evidence_sha256":"431bd86bcb12b9adfb89857666dd9f80e5e44c756b74a13d898e19f4e18be6c2","kind":"review_failed"},"completion_review":{"input_sha256":"46937518d7b22f68107a25a868bcbf14326c454f2925169a45bb8e2022122873","invocations":2,"result_sha256":"431bd86bcb12b9adfb89857666dd9f80e5e44c756b74a13d898e19f4e18be6c2","state":"blocked"},"draft_review":{"input_sha256":"4169fc6aa2ba41d794eb49a9d50840b762cc72bf1b091409582c00019a5fd5ab","invocations":1,"result_sha256":"291193722502b3c57df6408227e2ccbefded1578a7596a7c5f61527397c8a111","state":"passed"},"execution_parent":"428ca586723eafa326c4dca495940f7a2bbe2ad9","goal_id":"87343789-e7fe-474b-aad4-afb4289ef4a0","implementation_commit":"74653fd06a852812bc5a57e24914f50eeba35aa5","plan_path":"docs/plans/active/lifecycle-dispatch-integrity.md","plan_sha256":"cbf4582cfcca83cc641842d4263dd74fddf27fb5186549b6d5b9c2d82d810043","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"8f85332a-00e5-49d2-9d55-7222fe74048e","schema":1,"source_base":"702383f504757336ebe6c3859db70384e82a814f","source_sha256":"58c413f485e13879fea6fcc36e7bb14c744bfc964fd635f8841714acded3e7d4"},"schema":1,"status":"blocked","successor_run_sha256":"67709376e33b6163a93dd5221a8c7c7ba2307f14342ba2c7ae61046114d085c9"}
Plan-attempt-history: {"authorization_source_sha256":"0889cde97525945382fbfa4f98b7f726fca77bdb38221c558412b63fb9ae6641","plan_bytes_sha256":"492548c51bc2c6fc4f04a0daf83d32ae2e768982795a2eba254f4a045307e000","replacement_run_id":"23c9abdb-1227-4f42-bdfd-0a048bdc0421","run":{"acceptance":{"source_sha256":"2227325f4ac58d11287c2feb5e559d609dea74806f73e37db6e9d9ac1b792d03","verification_sha256":"77f46b609f73399295f0ab6a221eb78c074a1537320714ba937809e1feb4a208"},"blocker":{"evidence_sha256":"5f419b84de65a420018b903541be1da6dae2f9a21ed805cffcd504977beabd08","kind":"review_failed"},"completion_review":{"input_sha256":"29a6f965fd918fe2c05036d1d56b2bf9af8911e4c4ccadbc8e810c7eaa466bc4","invocations":1,"result_sha256":"5f419b84de65a420018b903541be1da6dae2f9a21ed805cffcd504977beabd08","state":"blocked"},"draft_review":{"input_sha256":"f269965471f13b8547eb30f692743daa2cdbb56ef34308c6deb5915e0835eb1d","invocations":1,"result_sha256":"12478cfc0fa39d24c3d16f160da4df1a688abbcdea1a4e13c9c168102712a26c","state":"passed"},"execution_parent":"428ca586723eafa326c4dca495940f7a2bbe2ad9","goal_id":"87343789-e7fe-474b-aad4-afb4289ef4a0","implementation_commit":"5e1d94bbd5fb4da0d15c9f2fc51f116ce3c7bb36","plan_path":"docs/plans/active/lifecycle-dispatch-integrity.md","plan_sha256":"4ff14bde408affe23dba48a3b49860a35cdb3b15c2d0c009c79f5885701991e0","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"469d3195-f9d1-423e-a10d-96994d7ccba9","schema":1,"source_base":"07432faf38462bcd2db8c115b01751b1c5543e9e","source_sha256":"6aa7cf83946f54427e997d715061174075a1cb86a8e7a6cd6bb5bdadfe0edcf1"},"schema":1,"status":"blocked","successor_run_sha256":"53cb39db89820d64e7dfd4c7b51b6880c5d2523223991b44bd7c416c8a00c852"}



Completion review invocation 1:

Completion-review-result: {"diff_sha256":"caf8be7c688d4ee0123854b50e5e978f70796344f70ae4d0baf2a0c42a6bcac9","findings":[{"defect":"replacePlanRunInPlace does not resolve the plan path once. acquirePlanLock resolves file for the lock key, then after the awaited acquisition replacePlanRunInPlace independently resolves repo and file again for the CAS, guard, and rename. I reproduced the race by holding locks on targets A and B, starting replacement through a repository symlink aimed at A, retargeting it to B while acquisition waited, and releasing only A: replacement wrote B while B's canonical plan lock remained held.","fix":"Resolve the repository and plan file once before lock acquisition, pass that canonical file to a lock primitive that does not resolve again, and use the same value for the lock key, CAS read, logical-path guard, and rename. Add the held-A/held-B retarget probe.","id":"CDI-004","kind":"unsafe_scope","locator":"plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs:1956-1982"},{"defect":"The claimed Step-1 revert sensitivity does not cover the required reserved-successor use of rebindReviewSource: dry-run exits before reservation. Removing only reserved.run = rebindReviewSource(reserved.run, rebound) from a temporary driver left every registered dispatch probe passing, so a regression that persists stale plan/source bindings after a successful repaired reservation is undetected.","fix":"Add a committed successful-reservation probe with both repaired plan bytes and moved source HEAD, assert the persisted reserved record has all three rebound fields while retaining the intended phase, and prove that removing the reserved-successor rebind fails with a named assertion.","id":"CDI-005","kind":"missing_acceptance","locator":"plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs:273-275,410-423; scripts/tests/plan-dispatch-probes.mjs:431-487"},{"defect":"The successor added plan-workspace/SKILL.md to affected_paths but did not add it to any Step Files cell. Running the repository's scriptChecks over the sealed plan reproduces P13 fail: \"0 path(s) used but undeclared; 1 declared but untouched (plugins/docks/skills/productivity/plan-workspace/SKILL.md)\". The correction therefore remains mechanically inconsistent with the plan's exact declared-versus-touched path rule.","fix":"Assign plugins/docks/skills/productivity/plan-workspace/SKILL.md to the step that refreshes the derived content_hash (and to the gate step if its Files cell inventories all gated artifacts), then rebind the successor plan.","id":"CDI-006","kind":"contradiction","locator":"docs/plans/active/lifecycle-dispatch-integrity.md:11-19,125-133 (sealed plan.md)"},{"defect":"Verification Results do not agree with the seven-row acceptance table: A5 records the full orchestration command that belongs to A6, A6 records an unscoped CI command instead of the A6 orchestration command, and there is no A7 row for the docks plugin gate. The section also stops before the final 18/18 locks-cas state, so Step 6's done status is not backed by correctly keyed successor evidence.","fix":"Record a successor acceptance section keyed exactly A1-A7, including A5 dispatch-driver, A6 full orchestration, A7 the docks plugin gate, and the final locks-cas result after both alias repairs.","id":"CDI-007","kind":"missing_acceptance","locator":"docs/plans/active/lifecycle-dispatch-integrity.md:137-145,223-232 (sealed plan.md)"}],"implementation_commit":"5e1d94bbd5fb4da0d15c9f2fc51f116ce3c7bb36","invocation":1,"run_id":"469d3195-f9d1-423e-a10d-96994d7ccba9","schema":1,"verdict":"repair"}


Completion review invocation 1:

Completion-review-result: {"diff_sha256":"243d882bb55602fe561efd70edbba01eb5c6b76a0cb96bac6e951aa67e939a9c","findings":[{"defect":"The `reserved-rebind` probe this patch adds is never executed by any gate, so the reserved-successor half of Step 1's fix has no automated regression protection. The only dispatcher of `plan-dispatch-probes.mjs` is `DISPATCH_PROBES` in `scripts/tests/plan-orchestration.mjs:41-56`, which spawns one child per registered name at lines 684-688; `reserved-rebind` is not in that list, and `scripts/tests/plan-orchestration.mjs` is outside `affected_paths` and was not touched (`git diff --stat 428ca58 a5094d3` shows only the eight affected paths plus the disjoint session-relay run). `scripts/ci.mjs:355-358` runs only `plan-orchestration.mjs` and `plan-skill-phases.mjs`, so nothing in `node scripts/ci.mjs` reaches the probe. Measured on a scratch mirror of the tree: deleting `reserved.run = rebindReviewSource(reserved.run, rebound);` (dispatch-review.mjs:415) still yields `node scripts/tests/plan-orchestration.mjs --case dispatch-driver` -> `plan-orchestration: 11/11 passed`, while the unregistered probe run by hand does fail with `driver exited before persisting reserved: plan_sha256 remained stale`. The sealed record's CDI-005 note states the defect as 'removing the reserved-successor rebindReviewSource call left every registered dispatch probe passing ... undetectable' and declares it 'Closed by plan-dispatch-probes: reserved-rebind'; measured, every registered dispatch probe still passes, so the stated condition is unchanged. Everything else in the plan is satisfied: A1 exit 0 `ok - plan-dispatch-probes: dry-run`; A2 exit 0 `ok - plan-dispatch-probes: preflight-before-reserve`; A3 exit 0 with `ok - locks-cas: replacement rejects a file outside current plan_path` (19/19); A4 exit 0 `three-skill, one-wrapper bounded plan workflows passed`; A5 exit 0 with every registered probe printing `ok - dispatch-driver:` (11/11); A6 exit 0 `plan-orchestration: 192/192 passed`; A7 exit 0 'All ci.mjs checks passed'. The three named revert clauses were each reproduced on the scratch mirror: reverting the pre-seal rebound fails `dry-run` with `sealed plan record plan_sha256 must equal binding plan_sha256`; deleting the pre-reserve preflight block fails `preflight-before-reserve` with `bundle mismatch must be refused before reserve`; deleting the `logicalFile !== current.run.plan_path` guard fails locks-cas with `replacement file/path mismatch must reject`.","fix":"Keep the coverage inside an affected path: put the stale-record reservation assertions into a probe `DISPATCH_PROBES` already registers, rather than leaving them in an unregistered probe. Concretely, in `scripts/tests/plan-dispatch-probes.mjs` add to `probes['preflight-before-reserve']` (registered) a final block alongside its existing `valid-control` case at lines 1125-1135 that builds a world, writes a repaired `--body`, commits a new `tracked.txt` so HEAD moves, drives the driver to `RESERVED`, and then asserts via the patch's own `recordOf(world)` helper that `plan_sha256`, `source_base` and `source_sha256` equal the freshly computed `api.sha256(api.canonicalPlanView(repairedBytes))` and `api.createAffectedPathManifest({repo, sourceBase: HEAD, paths:['tracked.txt']})` values -- the staling step is required, because `valid-control` as written reserves from an already-current record and the comparison would be vacuous. Equivalently, have that registered probe `await probes['reserved-rebind']()` and update its summary line. Either edit is confined to `scripts/tests/plan-dispatch-probes.mjs`, which is inside `affected_paths`; no change to `scripts/tests/plan-orchestration.mjs`, the Steps table, or the acceptance criteria is needed.","id":"CDI-008","kind":"unenforced_probe","locator":"scripts/tests/plan-dispatch-probes.mjs:577-712"}],"implementation_commit":"a5094d3c2d8259d1dc7701f477ae4f59a687a893","invocation":1,"run_id":"23c9abdb-1227-4f42-bdfd-0a048bdc0421","schema":1,"verdict":"repair"}


Completion review invocation 2:

Completion-review-result: {"diff_sha256":"b5adc71343c2136d30727cc16089f68d39d79189f2863eacedf7f4533e79f5c4","findings":[],"implementation_commit":"c14070f141e58a91296ee24f99e82c808455ada4","invocation":2,"run_id":"23c9abdb-1227-4f42-bdfd-0a048bdc0421","schema":1,"verdict":"pass"}

## Verification Results

### Implementation (2026-08-02)

Implementation spans `1a7e68f`, `74653fd`, `055c6ae` and `57bbff0` on ancestry from `428ca58`, this
run's `execution_parent`. The first checkpoint is shared with `relay-fanout-reaper-reporting`, whose
file set is disjoint; the reviewed diff for this run is bounded to this plan's eight
`affected_paths`.

**Gap 1 — the sealed bundle described a record it did not contain.** `dispatch-review.mjs` computed
the manifest and binding from fresh values but sealed a `plan.md` carrying the pre-reserve candidate
record, so a reviewer could read a plan whose digests did not describe it. One helper,
`rebindReviewSource`, applies exactly `plan_sha256`, `source_base` and `source_sha256`, and is called
both when building the pre-seal candidate and when preparing the reserved successor, so the two
cannot drift. It deliberately does not touch phase fields: the sealed bundle retains the pre-reserve
`draft_review` by design, because the reviewer judges the candidate body and the permit bookkeeping
is not part of what it reads.

**Gap 2 — nothing checked the bundle before a permit was spent.** Immediately before reservation the
driver calls `policy.verifyPlanReviewBundle` with repository expectations and compares exactly three
cross-artifact pairs: record against binding for `plan_sha256`, record against binding for
`source_sha256`, and record against MANIFEST for `source_base`. The third pair is the detail the
plan's own earlier wording got wrong — the binding carries no `source_base` field, only the manifest
does, so comparing it to the binding would have been unsatisfiable by construction. A mismatch
aborts through the existing preflight boundary with the bytes and the phase unchanged.

**Gap 3 — the replacement file was never tied to the record.** `replacePlanRunInPlace` locked on the
record's identity but wrote whatever `file` the caller passed. It now resolves the repository and
current file canonically, derives the normalized repository-relative path, and rejects a mismatch
with `replacement file path does not match current PlanRun plan_path` before successor validation or
any write. It rejects rather than normalizing, so a caller cannot be silently redirected. The guard
lives here and not in `validatePlanRun`, which only ever sees content and has no file to compare.

**Four defects this work's own completion reviews found. Three were real; all are fixed.**

`CDI-001` — the gap-3 guard compared `realpath(file)` while the CAS read and the atomic rename still
used the caller's unresolved `file`. A symlink whose realpath is the legitimate plan passed the
guard, and the successor was renamed onto the ALIAS entry: a replacement reporting success while the
real record survived untouched. Fixed at `74653fd`.

`CDI-002` — `acquirePlanLock` still keyed on `path.resolve(file)`, which resolves `.` and `..` but
not symlinks, so an alias and its target took two different locks on one plan and could enter the
same transaction together. Fixed at `055c6ae`.

`CDI-004` — the same defect a third time, and in the path that matters most. `transactPlanRun` is
what every `start`, reserve, record and finish goes through; it passed the caller's raw `file` to
`acquirePlanLock`, which resolves internally, and then to `writePlanBytes`, which does not. It
locked the target and wrote the alias. Both call sites now resolve ONCE, before the lock, and use
that single value for the key, the CAS read and the rename. Resolving after `await
acquirePlanLock` would have reopened the window it was meant to close: a symlink retargeted during
acquisition would leave the key describing one record and the write landing on another. Fixed at
`57bbff0`.

Three appearances of one shape — a path compared in one place and used in another. The guard this
plan exists to add had shipped that shape three times; single resolution is the durable form.

`CDI-005` — coverage, not behaviour: removing `reserved.run = rebindReviewSource(reserved.run,
rebound)` from the driver left every registered dispatch probe passing, so a regression persisting
stale bindings after a successful reservation was undetectable. Closed by
`plan-dispatch-probes: reserved-rebind`.

`CDI-006` — real, and repaired by this replacement rather than in code. `affected_paths` declared
`plugins/docks/skills/productivity/plan-workspace/SKILL.md`, but the step 5 Files cell did not
inventory it. The Steps table is inside `plan_sha256`, so no in-phase repair could reach it. The
cell now lists it. The path is not independent content: its frontmatter `content_hash` is the
derived checksum of the skill directory, so editing the declared reference necessarily moves it and
`scripts/skills/content-hash.mjs --backfill` regenerates it.

`CDI-007` — NOT a defect of this work, and the finding is instructive. The reviewer read a stale
`## Verification Results` and reported it disagreeing with the acceptance table. The cause was the
orchestrator's own reservation driver: it sealed the pre-update bytes while binding the post-update
digests — this plan's Gap-1 shape, reproduced one level up, in the tool driving the plan. The driver
now computes the reserved timestamp once, seals exactly the bytes it installs, and reads the sealed
copy back, refusing unless it is byte-identical to the live record. This record was sealed under
that fix.

**Probes — one per fix, each observed failing with its fix reverted.**

| Fix | Probe | Failure observed when reverted |
|---|---|---|
| Gap 1 pre-seal rebind | `plan-dispatch-probes: dry-run` | sealed digests disagree with the sealed record |
| Gap 2 pre-reserve assertion | `plan-dispatch-probes: preflight-before-reserve` | reservation proceeds past a mismatched bundle |
| Gap 3 replacement path | `locks-cas: replacement rejects a file outside current plan_path` | mismatched target accepted |
| `CDI-001` | `locks-cas: replacement writes the resolved plan path, not the alias it was given` | `the successor must be written to the resolved plan path` |
| `CDI-002` | `locks-cas: an alias and its target contend for the same plan lock` | both callers hold a lock at once |
| `CDI-004` | `locks-cas: a transaction through an alias writes the resolved plan path` | `the transaction must be written to the resolved plan path` |
| `CDI-005` / `CDI-008` | `plan-dispatch-probes: preflight-before-reserve` (gate-registered; the rebind assertions were folded in) | `driver exited before persisting reserved: plan_sha256 remained stale` |

`CDI-008` — accepted from completion invocation 1 and repaired here. The `reserved-rebind` probe
added for `CDI-005` was DEAD: the only dispatcher of `plan-dispatch-probes.mjs` is `DISPATCH_PROBES`
in `scripts/tests/plan-orchestration.mjs`, which is outside this plan's `affected_paths`, so a probe
absent from that list is never executed by any gate. Coverage that no gate runs is not coverage. The
assertions now live in a private `assertReservedRebind` invoked from the registered
`preflight-before-reserve` probe, which the gate does run, keeping the fix inside an affected path
instead of reaching for a file this plan may not touch. The nine preflight refusals that probe
already proved are unchanged. Committed at `c14070f`.

That finding is worth stating plainly: two earlier probes were accepted on the strength of being
observed failing by hand. This one proves the gate itself executes them.

**Step 5 — contract updated in both copies.** `docs/plans/AGENTS.md` and the workspace skill's
template copy state the three-field rebind, the exact binding-versus-manifest comparisons, the
pre-reserve refusal, and the replacement-path rejection. `scripts/tests/plan-skill-phases.mjs`
asserts the new normative sentences positively rather than being relaxed to match them.

### Acceptance

| ID | Result |
|---|---|
| A1 | `node scripts/tests/plan-dispatch-probes.mjs dry-run` — exit 0; bytes identical, nothing reserved |
| A2 | `node scripts/tests/plan-dispatch-probes.mjs preflight-before-reserve` — exit 0; nine preflight refusals before reserve |
| A3 | `node scripts/tests/plan-orchestration.mjs --case locks-cas` — exit 0, 19/19, including all three alias probes |
| A4 | `node scripts/tests/plan-skill-phases.mjs --case bounded-workflows` — exit 0, `three-skill, one-wrapper bounded plan workflows passed` |
| A5 | `node scripts/tests/plan-orchestration.mjs --case dispatch-driver` — exit 0, 11/11; every registered dispatch probe prints `ok`, including `ok - dispatch-driver: preflight-before-reserve`, which now carries the reserved-rebind assertions |
| A6 | `node scripts/tests/plan-orchestration.mjs` — exit 0, `plan-orchestration: 192/192 passed` |
| A7 | `node scripts/ci.mjs --plugin docks` — exit 0; the full `node scripts/ci.mjs` also passes at `c14070f`: "All ci.mjs checks passed — 3 plugin(s) + repo-wide" |

### Live-tooling safety

Both edited modules are load-bearing for every plan transition in this repository and were in use by
live runs throughout, including the runs that installed this record. After each change
`import(plan-run.mjs)` resolves and `dispatch-review.mjs --help` runs. The `CDI-004` fix was made
while live plans held reserved permits; the alias probes were written against disposable temporary
repositories so no live permit was spent proving them.
