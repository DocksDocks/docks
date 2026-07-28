---
title: Repair the accepted-PlanRun proof contract
goal: Make an accepted PlanRun transactable again by proving its affected-path manifest exactly once, when the acceptance is minted, instead of re-proving it against a live worktree that has since moved.
status: ongoing
blocked_reason: null
blocked_since: null
created: "2026-07-27T22:05:00-03:00"
updated: "2026-07-28T02:42:08-03:00"
started_at: "2026-07-28T02:42:08-03:00"
finished_at: null
assignee: null
tags: [plans, plan-manager, contract, acceptance, integrity]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs
  - plugins/docks/skills/productivity/plan-workspace/SKILL.md
  - plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md
  - scripts/tests/plan-orchestration/hashing-manifests.mjs
  - scripts/tests/plan-orchestration/mutations.mjs
  - scripts/tests/plan-skill-phases.mjs
related_plans: []
---

# Repair the accepted-PlanRun proof contract

## Goal

An accepted PlanRun can be finished, archived, and replaced again. The
affected-path manifest is proven live exactly once — at the moment the
acceptance is minted — and never re-demanded afterwards, because that proof is
not reproducible once HEAD moves.

## Context & rationale

`validateAcceptedPlanBindings` (`plan-run.mjs` ~806-840) contains two checks.
The first hashes `canonicalVerificationResults(bytes)` against
`run.acceptance.verification_sha256`; it is self-contained and re-checkable
forever. The second requires a complete live `{repo, paths, sourceBase}`
expectation and calls `validateAffectedPathManifest`, which re-snapshots live
worktree bytes and requires `readHead(root) === sourceBase`.

The second check is a category error. It proves the acceptance digest against
the worktree **at the instant of acceptance**, and that proof was already
discharged when the acceptance was written. Re-running it later against a
different HEAD cannot pass. This is measured, not argued: **all 7 accepted
records on disk fail it today — 100%**, including finished `remediation-v*`
records and the blocked `agent-worktree-lifecycle-strategy` run. The manifest
itself is never persisted (only its digest), and the sealed bundle is a reaped
`/tmp` artifact, so nothing surviving can reproduce it.

**Draft review F1 — accepted in part, conclusion disproven.** The reviewer
correctly observed that `recorded` skips two checks, not one: the live manifest
re-snapshot, and the comparison of `frontmatter.affected_paths` against the
manifest expectation paths — the only site in `plan-run.mjs` that reads
`affected_paths`. Its conclusion, that an `ongoing`→`finished` carry-forward
could therefore rewrite the path set, does not hold. `affected_paths` lives
inside `canonicalPlanView`, so editing it moves `plan_sha256`, and
`assertPersistedTransition` permits no ordinary transition to change that field.
Verified empirically both ways: with an explicit guard the attempt is refused by
the guard; with the guard removed it is refused anyway by
`persisted review event cannot change plan_sha256`. An explicit guard is
therefore unreachable code and was not kept; the protection is pinned by a
regression that fails precisely if `plan_sha256` ever becomes a permitted
changed field.

The skipped span was enumerated rather than sampled: presence of
`acceptanceManifest`/`acceptanceManifestExpectation` (live-supplied by
definition), the `affected_paths` comparison (durable, independently bound by
`plan_sha256` as above), the live re-snapshot (unreproducible), and the
`source_sha256` comparison (the unverifiable digest, by design). Everything
else in `validatePlanRun` — status, JCS canonicality, identity, attempt history,
`plan_sha256` — runs before the mode is consulted and is unaffected.

The consequences reach both write paths. `transactPlanRun` validates current and
next with bare `identity`, so any transition carrying acceptance forward fails —
freezing finish and archive. `replacePlanRunInPlace` fails the same way on its
predecessor, freezing replacement. `migrateLegacyPlan` does thread a manifest
but is gated to `nextStatus === 'ongoing'`, so it is not a way out.

That freeze is very likely what produced the nine `remediation-v2..v9` files
sharing one `goal_id`: the contract forbids `vN` files, but a run that cannot
move leaves a new file as the only way forward. Fixing the freeze removes the
incentive.

**Steps 1-3 are already implemented in the working tree, uncommitted**
(`~/orphan-evidence/contract-fix.patch`, 3 files, +141/-3), gate-green and
97/97 on the focused suite. They are recorded here as `planned` because nothing
has landed. This plan exists so the design is reviewed before it commits: four
separate safety arguments for this exact change failed under scrutiny while it
was being developed, each caught by review rather than by the author.

Step 5 is load-bearing, not documentation polish. `transactPlanRun` has **no
production callers** — its real caller is an agent following `SKILL.md`. If the
prose does not say to pass the manifest at completion reservation, finish still
fails closed and this plan would freeze at its own completion step.

## Environment & how-to-run

Repository `/home/vagrant/projects/docks` at `db50e915`. Node 24 with
`corepack enable && pnpm install --frozen-lockfile` already provisioned.

Focused suite: `node scripts/tests/plan-orchestration.mjs`.
Skill-body assertions: `node scripts/tests/plan-skill-phases.mjs`.
Authoritative gate: `node scripts/ci.mjs --plugin docks` (Node-only).

**Host constraint.** Do not run the full `node scripts/ci.mjs`, and do not run
concurrent Rust builds or synthetic CPU load. This host locked up under a
concurrent gate run on 2026-07-27 and lost uncommitted work; `cc9d5c6` exists
for the same reason. Every acceptance row below is deliberately bound to the
Node-only selected-plugin gate.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Add `expected.acceptanceProof` of `live\|recorded`, default `live`, allowlist-positive so unknown values fail closed. `recorded` skips exactly two checks — the live re-snapshot and the `affected_paths` comparison — and never the verification digest; the second is independently bound by `plan_sha256`, so no replacement guard is added (see F1 in Context) | `plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs` | — | `local` | `planned` | Default path throws unchanged; `recorded` validates the blocked record; a typo raises `acceptance proof must be live or recorded`. Else STOP |
| 2 | Thread `acceptanceManifest`/`acceptanceManifestExpectation` through `transactPlanRun`; select the mode from the transition (install or change ⇒ `live` pinned explicitly after the spread; carry-forward ⇒ `recorded`); read the immutable predecessor in `replacePlanRunInPlace` as `recorded` | `plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs` | 1 | `local` | `planned` | Install without a manifest rejects; carry-forward succeeds without one. Else STOP |
| 3 | Cover the boundary: `recorded` still rejects a tampered `verification_sha256`; default remains `live`; install fails closed; a weaker proof smuggled through `identity` is refused; and a carry-forward that edits `affected_paths` is refused by `plan_sha256` immutability | `scripts/tests/plan-orchestration/hashing-manifests.mjs`, `scripts/tests/plan-orchestration/mutations.mjs` | 2 | `local` | `planned` | A1-A3 and A10 pass. Else STOP |
| 4 | Document at the completion-reservation step that the caller passes `acceptanceManifest` and `acceptanceManifestExpectation`, since no in-repo caller exists to carry it; add a matching regex to `assertBoundedWorkflows` so the sentence is actually asserted; refresh that skill's `content_hash` in the same step, since editing `SKILL.md` bumps it and the per-plugin gate runs `content-hash.mjs --check-only`. Budget: the plan-manager body is 309 lines against a hard 310 cap (combined live plan-skill bodies 661 of 700), so the new sentence must be absorbed into an existing line or paid for by deleting one | `plugins/docks/skills/productivity/plan-manager/SKILL.md`, `scripts/tests/plan-skill-phases.mjs` | 2 | `local` | `planned` | A4, A7 and A9 pass AND A7's mutation probe fails while broken. Without the new assertion A7 is vacuous, which trips STOP condition 3 |
| 5 | State the acceptance-proof rule: minting or changing an acceptance requires live proof; carrying one forward, or reading an immutable terminal predecessor, does not — a point-in-time worktree proof is not a durable invariant. Make the identical edit in the `plan-workspace` template that `docs/plans/AGENTS.md` is generated from, or a later workspace refresh regenerates the prose away. That template edit forces a `content_hash` refresh in `plan-workspace/SKILL.md`, which the per-plugin gate enforces, so refresh it in the same step rather than treating it as drift. Add one assertion matching the rule in BOTH copies | `docs/plans/AGENTS.md`, `plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md`, `plugins/docks/skills/productivity/plan-workspace/SKILL.md`, `scripts/tests/plan-skill-phases.mjs` | 2 | `local` | `planned` | A4, A8, A9 and A12 pass, including A12 second half. Else STOP |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-orchestration.mjs` | Exit 0, all cases pass, count ≥ 97 |
| A2 | Replace `if (proof === 'recorded') return;` in `plan-run.mjs` with a no-op, run A1, restore | Mutated run exits non-zero; restored file is byte-identical and exits 0 |
| A3 | Delete the `acceptanceProof: 'live',` pin in the install branch, run A1, restore | Mutated run fails `mutations: acceptance proof is keyed to the transition, not the side being read`; restored exits 0 |
| A4 | `node scripts/ci.mjs --plugin docks` | Exit 0 |
| A5 | Read-only script validating `docs/plans/active/agent-worktree-lifecycle-strategy.md` with default, `recorded`, and a bogus mode | Default throws `final affected-path manifest`; `recorded` passes; bogus throws `acceptance proof must be live or recorded`; the file is unmodified |
| A7 | `node scripts/tests/plan-skill-phases.mjs --case bounded-workflows`, then break the reworded sentence in `SKILL.md`, re-run, restore | Passes; broken run fails naming `SKILL.md`; restored passes and is byte-identical; and `plan-manager/SKILL.md` measures at most 310 body lines. It is at 309 today, so the new sentence must not add a line — `assertLiveTopology` enforces this under both this command and the A4 gate |
| A8 | `node scripts/tree/guard.mjs` | Exit 0. Required because `--plugin docks` skips repo-wide tree checks, leaving step 5's `docs/plans/AGENTS.md` edit otherwise ungated |
| A9 | `node scripts/skills/durable-anchors.mjs` | Exit 0. Guards live `path:NN` anchors in the `SKILL.md` edit; also skipped by `--plugin docks` |
| A10 | Add `allowed.add('plan_sha256')` beside the phase loop in `assertPersistedTransition`, run A1, restore | Mutated run fails `mutations: acceptance proof is keyed to the transition, not the side being read`; restored is byte-identical and exits 0. Pins F1's disproof: this is exactly when the finding would become exploitable |
| A12 | Break the new acceptance-proof sentence in `docs/plans/AGENTS.md`, run `node scripts/tests/plan-skill-phases.mjs`, restore; then repeat the identical mutation against the `plan-workspace` template copy | Each mutation exits non-zero naming the file it broke; each restore is byte-identical and exits 0. Both halves are required: step 5 ships two coupled copies, and an assertion reading only the generated file lets the template drift and be regenerated away — the exact risk step 5 exists to prevent. The command must name the suite holding the assertion, not A1, which reads neither file |

## Out of scope / do-NOT-touch

- Any file under `docs/plans/active/` or `docs/plans/finished/` other than this
  plan's own record. The 7 accepted records stay byte-identical; this work makes
  them readable, it does not rewrite them.
- Legacy-record reclassification (the former step 4) and anything it touches:
  `legacy-review-records.mjs`, `legacy-quarantine.mjs`, and `classifyLegacyPlan`.
  It was dropped from this plan because it actively unlocks `migrateLegacyPlan`
  and that consequence was never authorized. It gets its own plan.
- Migrating, repairing, or finishing any quarantined plan.
- Persisting the manifest object in the record. It would not unblock anything
  already broken, since the lost manifests are unreconstructible.
- Widening or relaxing any deadline, and any change to Rust sources.
- The `separate_worktrees_both_hold_leases` custody timeout: characterised as an
  artefact of synthetic load, not a defect.

## STOP conditions

- Any acceptance row would need the full `node scripts/ci.mjs`, or any step
  would need concurrent Rust builds or synthetic CPU load.
- A non-vacuity probe (A2, A3, A7, A10, A12) passes while mutated, meaning the
  test does not bind the behaviour it claims. Every step now carries one: A2/A3
  for steps 1-2, A10 for step 3, A7 for step 4, A12 for step 5 — and A12 must
  break both of step 5 copies, not only the generated one.
- Making `'recorded'` reachable on a transition that mints or changes an
  acceptance.
- Any of the 7 accepted records changes bytes.

## Open questions

None. The two decisions this work depended on are settled: the change is
reviewed under a canonical plan rather than committed directly, and legacy
reclassification is deferred to its own plan rather than carried here on an
unauthorized migration-unlock.

## Review

Plan-attempt-history: {"authorization_source_sha256":"04dd9c7e9464019a848b69db2ed9a9b2a7def45b169e44627e7e613d67ff18ce","plan_bytes_sha256":"698ee95ac7be50113ba314347621e16a1416739f810105ab70947164a5dfd793","replacement_run_id":"a3539270-0cd5-45ed-aada-d3f56753f6d9","run":{"acceptance":null,"blocker":{"evidence_sha256":"e6e37c413ade19bc0e868e7d9a1a6825122210f768560514c649ed61a4d916ad","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"c60d5f04d841186e0830eb908b3abafd368d0e86b9238db7f3f46a678231901c","invocations":2,"result_sha256":"e6e37c413ade19bc0e868e7d9a1a6825122210f768560514c649ed61a4d916ad","state":"blocked"},"execution_parent":null,"goal_id":"fb3b1cf0-256e-4d59-b5d5-ac28f88d16f3","implementation_commit":null,"plan_path":"docs/plans/active/accepted-planrun-proof-contract.md","plan_sha256":"32d96aed130bbb6225a98d08ff4b62ee17fe509c6c6556e2a4f80ec50ad83ca1","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"8afa02f4-45c6-49f4-924f-2c73ec5a9506","schema":1,"source_base":"db50e915d75397e2b30160a120484889985b0c7e","source_sha256":"7596133a9911ee5340b22baf0bf764fce288ce948bd81b295e2d3f0485e586c2"},"schema":1,"status":"blocked","successor_run_sha256":"0441ac46782446b77fa43abcb5ab3a9585c8733308dcee16ea1453fca48f4b77"}
Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"0c3b1a2093fc26d406ab9acf69ebc5a0bd410a8755bf9569b757ab1458effdd3","invocations":2,"result_sha256":"ab8ab9ec8a7040752e2976f1b03d7ab5eecacbda8779fc8abcc6f5149e80063f","state":"passed"},"execution_parent":"db50e915d75397e2b30160a120484889985b0c7e","goal_id":"fb3b1cf0-256e-4d59-b5d5-ac28f88d16f3","implementation_commit":null,"plan_path":"docs/plans/active/accepted-planrun-proof-contract.md","plan_sha256":"ea818f5730212e1bb45f767e08bfd7cc9c63b4973453d3b73cd85634d5ba5136","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"a3539270-0cd5-45ed-aada-d3f56753f6d9","schema":1,"source_base":"db50e915d75397e2b30160a120484889985b0c7e","source_sha256":"de213b2de68dd547b1c06a81d4d71306f8bc4791c1b4e288051a9634342b1540"}

## Verification Results
