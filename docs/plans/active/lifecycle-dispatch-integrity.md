---
title: Fail mechanical lifecycle defects before review
goal: Close three lifecycle integrity gaps so bundle mismatches and replacement-path mismatches fail before a write or review permit is reserved.
status: blocked
created: "2026-08-01T21:40:30-03:00"
updated: "2026-08-02T18:59:26.134+00:00"
started_at: "2026-08-02T17:55:37.799+00:00"
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

Plan-run: {"acceptance":{"source_sha256":"f220b8b4021878c3d6b7522c72f1ba023568fdd55ba388ae5e347ad10cdd2cd4","verification_sha256":"475869e7d45b233c6fae8c6e1ae1b3445d3d4834847357e37fee0eade875aa43"},"blocker":{"evidence_sha256":"431bd86bcb12b9adfb89857666dd9f80e5e44c756b74a13d898e19f4e18be6c2","kind":"review_failed"},"completion_review":{"input_sha256":"46937518d7b22f68107a25a868bcbf14326c454f2925169a45bb8e2022122873","invocations":2,"result_sha256":"431bd86bcb12b9adfb89857666dd9f80e5e44c756b74a13d898e19f4e18be6c2","state":"blocked"},"draft_review":{"input_sha256":"4169fc6aa2ba41d794eb49a9d50840b762cc72bf1b091409582c00019a5fd5ab","invocations":1,"result_sha256":"291193722502b3c57df6408227e2ccbefded1578a7596a7c5f61527397c8a111","state":"passed"},"execution_parent":"428ca586723eafa326c4dca495940f7a2bbe2ad9","goal_id":"87343789-e7fe-474b-aad4-afb4289ef4a0","implementation_commit":"74653fd06a852812bc5a57e24914f50eeba35aa5","plan_path":"docs/plans/active/lifecycle-dispatch-integrity.md","plan_sha256":"cbf4582cfcca83cc641842d4263dd74fddf27fb5186549b6d5b9c2d82d810043","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"8f85332a-00e5-49d2-9d55-7222fe74048e","schema":1,"source_base":"702383f504757336ebe6c3859db70384e82a814f","source_sha256":"58c413f485e13879fea6fcc36e7bb14c744bfc964fd635f8841714acded3e7d4"}

## Review

N/A — no review has been dispatched for this run.


Completion review invocation 1:

Completion-review-result: {"diff_sha256":"dc349f39fc2c2cd1b7c7d074af5ed21748acea5df95b1fe7467ca156ffa1247b","findings":[{"defect":"The new guard compares current.run.plan_path against fs.realpathSync(file), but the transaction later passes the original, unresolved file to writePlanBytes. writePlanBytes creates its temporary beside that original path and renameSyncs onto the original directory entry. A caller can therefore pass an alias (including an outside-repository symlink) that resolves to the legitimate plan, pass the guard, and have the successor written over the alias while the legitimate plan remains unchanged. The implementation consequently does not guarantee same-file replacement or rejection before an out-of-scope write.","fix":"Reject non-canonical/aliased file arguments before proceeding, or carry the verified canonicalFile through the CAS read and atomic write so the compared path and written path are identical; add a symlink-alias probe that proves both the alias and canonical plan bytes remain unchanged on rejection.","id":"CDI-001","kind":"unsafe_scope","locator":"plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs:1966-1968,1984; plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs:1789-1802"}],"implementation_commit":"1a7e68f8dc16d0193881bb27e10689c4710f1c23","invocation":1,"run_id":"8f85332a-00e5-49d2-9d55-7222fe74048e","schema":1,"verdict":"repair"}


Completion review invocation 2:

Completion-review-result: {"diff_sha256":"57a6614f68f80c85c88e7d56c30bf81e4f54613dc5679fda2bbd77be4e5cd69e","findings":[{"defect":"replacePlanRunInPlace still acquires its lock before resolving file and passes the caller's unresolved file to acquirePlanLock. acquirePlanLock reads path.resolve(file) and includes that unresolved absolute path in the lock key, while the guarded CAS read and rename now use realpathSync(file). A direct-path caller and a symlink-alias caller therefore acquire different locks for the same plan; this was reproduced by holding the direct lock and successfully acquiring the alias lock concurrently. They can enter replacement together and both cross the pre-rename CAS check, so the lock, CAS read, guard, and rename do not share the one resolved identity required by CDI-001.","fix":"Resolve the repository and canonical file before lock acquisition, pass canonicalFile to acquirePlanLock, and use that same value for lock preimage verification, CAS read, path guard, and writePlanBytes. Add a contention probe that holds/replaces through the canonical path while invoking through a symlink alias and proves only one lock/successor is admitted.","id":"CDI-002","kind":"unsafe_scope","locator":"plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs:1946-1953,1961-1971; plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs:1492-1500"},{"defect":"The implementation commit changes plugins/docks/skills/productivity/plan-workspace/SKILL.md even though it is absent from affected_paths, violating STOP condition 6 and excluding that change from the sealed affected-path diff/manifest. The disclosure is factually accurate: the only change is content_hash, and the repository's content-hash script computes the new stored value from the declared reference change. Its mechanical nature does not authorize an undeclared path or make the omitted artifact part of the reviewed scope.","fix":"Do not amend the already-bound path set. Block/replace this run with a fresh authorized PlanRun that declares both the reference and its derived SKILL.md artifact, then regenerate and bind both paths; alternatively remove the undeclared change only if the declared reference can be reverted with it.","id":"CDI-003","kind":"unsafe_scope","locator":"plan.md:11-18,131-139,210-221; plugins/docks/skills/productivity/plan-workspace/SKILL.md:8"}],"implementation_commit":"74653fd06a852812bc5a57e24914f50eeba35aa5","invocation":2,"run_id":"8f85332a-00e5-49d2-9d55-7222fe74048e","schema":1,"verdict":"repair"}

## Verification Results

### Implementation (2026-08-02)

Implementation commit `1a7e68f`, based on `execution_parent` `428ca586723eafa326c4dca495940f7a2bbe2ad9`.
The checkpoint is shared with `relay-fanout-reaper-reporting`, whose file set is disjoint; the
reviewed diff for this run is bounded to this plan's `affected_paths`.

**Gap 1 — the sealed bundle described a record it did not contain.** `dispatch-review.mjs` computed
the manifest and binding from fresh values but sealed a `plan.md` carrying the pre-reserve candidate
record, so a reviewer could read a plan whose digests did not describe it. One helper,
`rebindReviewSource`, now applies exactly `plan_sha256`, `source_base` and `source_sha256`, and is
called both when building the pre-seal candidate and when preparing the reserved successor, so the
two cannot drift. It deliberately does not touch phase fields: the sealed bundle retains the
pre-reserve `draft_review` by design.

**Gap 2 — nothing checked the bundle before a permit was spent.** Immediately before reservation the
driver now calls `policy.verifyPlanReviewBundle` with repository expectations and compares exactly
three cross-artifact pairs: record against binding for `plan_sha256`, record against binding for
`source_sha256`, and record against MANIFEST for `source_base`. The third pair is the detail the
plan's own earlier wording got wrong: the binding carries no `source_base` field, only the manifest
does, so comparing it to the binding would have been unsatisfiable. A mismatch aborts through the
existing preflight boundary with the bytes and the phase unchanged.

**Gap 3 — the replacement file was never tied to the record.** `replacePlanRunInPlace` locked on the
record's identity but wrote whatever `file` the caller passed. It now requires `repo`, resolves the
repository and current file canonically, derives the normalized repository-relative path, and
rejects a mismatch with `replacement file path does not match current PlanRun plan_path` before
successor validation or any write. It rejects rather than normalizing, so a caller cannot be
silently redirected. The guard lives here and not in `validatePlanRun`, which only ever sees content
and has no file to compare.

**Step 4 — one biting probe per gap.** Each fix was reverted in isolation, the named probe observed
failing with its diagnostic, and the shipped module restored and observed passing. Six observations
in total.

**Step 5 — contract updated in both copies.** `docs/plans/AGENTS.md` and the workspace skill's
template copy now state the three-field rebind, the exact binding/manifest comparisons, the
pre-reserve refusal, and the replacement-path rejection. `scripts/tests/plan-skill-phases.mjs`
asserts the new normative sentences positively rather than being relaxed to match them.

### Acceptance

| ID | Result |
|---|---|
| A1 | `node scripts/tests/plan-dispatch-probes.mjs dry-run` — exit 0; bytes identical, nothing reserved |
| A2 | `node scripts/tests/plan-dispatch-probes.mjs preflight-before-reserve` — exit 0; nine preflight refusals before reserve |
| A3 | `node scripts/tests/plan-orchestration.mjs --case locks-cas` — 16/16, including `replacement rejects a file outside current plan_path` |
| A4 | `node scripts/tests/plan-skill-phases.mjs --case bounded-workflows` — passed |
| A5 | `node scripts/tests/plan-orchestration.mjs` — 189/189 |
| A6 | `node scripts/ci.mjs` exits 0 across all three plugins and repo-wide |

### One undeclared path, disclosed

`plugins/docks/skills/productivity/plan-workspace/SKILL.md` changed and is not in this plan's
`affected_paths`. It is not independent content: its frontmatter `content_hash` is the derived
checksum of the skill directory, so editing the declared
`plan-workspace/references/plans-agents-md-template.md` necessarily moves it, and
`scripts/skills/content-hash.mjs --backfill` regenerated it. The plan should have declared the pair.
It is recorded here rather than amended away, because the acceptance table and `affected_paths` are
inside `plan_sha256` and both draft permits are spent.

This defect class — a derived artifact that a plan forgets to declare alongside its source — is the
same one that blocked an earlier run on the Session Relay 0.15.0 goal.

### Live-tooling safety

Both edited modules are load-bearing for every plan transition in this repository and were in use by
live `ongoing` runs throughout. After the change,
`import(plan-run.mjs)` resolves and `dispatch-review.mjs --help` runs; no review was dispatched and
no permit reserved during implementation.

### Completion review invocation 1 — one accepted finding, repaired

`CDI-001` (`unsafe_scope`) was reproducible and is accepted. The gap-3 guard added by this plan
compared `realpath(file)` to the record's `plan_path`, but `replacePlanRunInPlace` then performed
the CAS read and the atomic rename on the caller's UNRESOLVED `file`. A symlink whose realpath is
the legitimate plan therefore passed the guard, and the successor was renamed onto the alias
directory entry: a replacement that reports success while the real record survives untouched and the
terminal predecessor is never appended to history. The guard this plan exists to add had itself
shipped an alias gap.

The repair makes the compared path and the written path the same path by construction: resolve
before reading, then read and write only the resolved path. Amended implementation commit
`74653fd`.

A new probe, `locks-cas: replacement writes the resolved plan path, not the alias it was given`,
creates a symlink to the plan, performs a replacement through the alias, and requires the successor
bytes to land on the resolved plan while the alias remains a symlink. Pointing the write back at
`file` makes it fail with `the successor must be written to the resolved plan path`; restoring the
fix makes it pass. `node scripts/tests/plan-orchestration.mjs --case locks-cas` reports 17/17, and
the full `node scripts/ci.mjs` passes across all three plugins and repo-wide.

Acceptance was cleared by `replace_implementation` and rebound against `74653fd`, which is the
contract's shape for a completion repair: the amended checkpoint is the one that gets reviewed.
