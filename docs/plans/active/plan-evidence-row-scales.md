---
title: Bind plan evidence to the bytes that produced it at row, sample and measurement scale
goal: Extend the run-scale rule PlanRunV1 already enforces - evidence is bound to the bytes that produced it and is absent when those bytes move - down to the acceptance row, the review sample, and the quantitative claim.
status: ongoing
created: "2026-07-29T21:40:00-03:00"
updated: "2026-07-31T14:39:14.950+00:00"
started_at: "2026-07-31T14:39:14.950+00:00"
finished_at: null
assignee: null
tags: [plans, plan-manager, evidence, review, tooling]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs
  - plugins/docks/skills/productivity/plan-workspace/SKILL.md
  - plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md
  - scripts/tests/plan-evidence-probes.mjs
  - scripts/tests/plan-orchestration.mjs
  - scripts/tests/plan-skill-phases.mjs
related_plans: [docs/plans/finished/2026-07-30-plan-dispatch-driver.md]
---

# Bind plan evidence to the bytes that produced it at row, sample and measurement scale

## Goal

An acceptance row carries a proof keyed to its own command bytes, a free review
pre-check reports agreement across samples over *unchanged* bytes, and a cited
quantity is re-derived from a committed producer. Each is the run-scale rule
PlanRunV1 already enforces, applied one scale down.

The machinery that does this is already shipped. This run closes the two defects a
completion reviewer found in it that its predecessor could not repair.

## Context & rationale

### What is already shipped, and why this run exists

The predecessor run built and shipped the whole mechanism: the falsifiability
record and its writer, the enforcing/counting mode split, the committed measurement
producer, the K-sample aggregator, the excluded repair section, seven probes, and
eighteen structural rules. That work is in `main` and gated green. This run adds no
new capability.

It exists because the predecessor's completion review returned `repair` with two
findings, and they arrived after `replace_implementation` had already been spent.
That event may be used once per run and refuses a second use once `acceptance` is
null, so the frozen implementation commit could not absorb either fix. The run was
blocked deliberately on `user_decision` rather than failed, and this successor
carries the two repairs under exact current-user replacement authority. The plan
path, goal and goal identity are unchanged; the predecessor is recorded in
`Plan-attempt-history` under `## Review`.

Two consequences a reader must not misread. The predecessor's record shows a
completion count of two, but only one reviewer ever assessed it live: the second
reservation existed only to re-mint the acceptance a blocked tuple requires. And
both findings came from *free* review rounds run against scratch worktree copies,
which spend a permit on the copy and none on the live record.

### The first defect: a rule suppressed instead of reported

`plan-self-check.mjs` classifies each plan status into one of two modes, and only
`drafting` enforces. Every later status counts findings and reports them without
failing. Rule R7, which names an active plan path a producer cites but the body
never resolves, additionally returns early when the status is `finished`. That
early return is redundant with the mode map and lossy: it removes the finding from
the report rather than declining to fail on it.

Measured on scratch copies, with a single unresolved active path planted inside a
producer block. The shipped script reports one finding at `drafting` and exits 1;
at `finished` it reports zero findings and exits 0. With the early return deleted,
`drafting` is unchanged, and `finished` reports one finding and still exits 0.

That last cell is the whole fix, and it is why deleting the line is safe rather
than merely tidy. The command's exit status is derived from the mode, not from the
finding count: a non-zero exit requires enforcing mode with at least one finding.
`finished` is counting-only, so no `finished` invocation can begin to fail because
a finding became visible. The defect is that an archived plan citing a path that no
longer exists reports clean today, which is the "declared but unbound" shape this
plan family exists to remove, present in the family's own tooling.

### The second defect: the contract contradicts its own code

`plan_sha256` is documented twice in each of the two lifecycle contract copies. One
paragraph describes the non-authoritative repair section and says it is excluded
from the digest. A second sentence enumerates the exclusions exhaustively, and its
own wording is `only`: it names lifecycle status and timestamps, the record line,
`## Review`, and `## Verification Results`. It omits the repair section that the
paragraph above it and the shipped code both exclude.

The code is the accurate side. The single declaration of the excluded-section set
carries the repair section already. So the enumeration is a direct
documentation-versus-code contradiction in the sentence that claims to be complete,
in a contract whose whole purpose is to say precisely which bytes a digest binds.

The repair is one sentence in each copy. Both copies matter, and the paired-clause
test already asserts four clauses of the paragraph above in both files, so the fix
also binds the corrected enumeration there. Editing the template forces a content
hash refresh in the owning skill manifest, which the plugin gate enforces.

### A third defect, measured and deliberately out of this run

The strictest mode of the falsifiability gate cannot be reached by a newly authored
row set. Enforcing mode is `drafting` only, but the proof writer refuses any status
except `ongoing`, and at `drafting` the probes a proof would observe do not exist
yet. The predecessor's own body asserted the opposite and called it what makes
enforcing at `drafting` implementable rather than circular. That sentence was false
against its own shipped code, and this body does not repeat it.

Nothing runs the self-check against a live plan inside the gate, so no check is red
today, and this run leaves the mode map untouched. It is recorded here because it
was found while drafting this body and belongs to a reader's understanding of the
gate, not because it is in scope. It needs its own plan and its own decision: the
coherent fix moves enforcement to where proofs can be written, which changes a
shipped contract that a probe pins per status.

## Environment & how-to-run

Repository `DocksDocks/docks`, Node 24 with pnpm through corepack:

```
corepack enable && pnpm install --frozen-lockfile
node scripts/ci.mjs --plugin docks
```

The selected-plugin gate is authoritative. Every path in scope is plugin payload or
its owned tests, except the lifecycle contract, which is documentation. No step
contacts GitHub, npm, or any remote, and every step's effect is `local`.

Acceptance proofs are recorded after the implementation exists and before the
completion review is reserved, because the writer requires `ongoing` status with the
completion phase still unstarted. That ordering is a constraint of the shipped
writer, not a preference.

### Falsifiability record {mechanism}

A row's proof is a record whose key is four fields: a digest of the row's Command
cell, a digest of its Expected cell, the owning Steps row, and the commit the claim
was made against. The remaining fields are payload - which observable was read, its
value, and the named mutation that would falsify it. A row counts as proven when its
record exists and every key field equals the live plan's; any key moving makes the
row unproven, because the proof belonged to bytes that no longer exist.

The checker compares keys and never executes a row's command. Observation drift is
caught where the observation is made: the probes run inside the plugin gate, so a
recorded exit that stops reproducing fails the gate rather than the checker. This run
relies on that mechanism rather than changing it, and step 3 is the only step that
writes a record.

Recording is constrained twice by the shipped writer, which is why step 3 is last and
separate. The writer requires `ongoing` status, so proofs cannot be written while this
body is still being repaired. It also requires the completion phase to be unstarted,
so they must be written before that reservation. Both constraints are the writer's,
and neither is negotiable from here.

## Steps

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Delete the `finished` early return from rule R7 so a finished plan reports the finding instead of dropping it, leaving the mode map untouched. Add a probe case named `r7-finished` covering both cells of the fix, and register it in the orchestration suite. | `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs`, `scripts/tests/plan-evidence-probes.mjs`, `scripts/tests/plan-orchestration.mjs` | — | `local` | `planned` | A finished-status plan carrying one unresolved active producer path reports one finding and exits 0; the same plan at drafting still reports it and exits 1. If deleting the line makes any finished-status invocation exit non-zero, STOP: the exit status is not derived from the mode as measured, and the mode map is load-bearing in a way this step did not establish. |
| 2 | Add the repair section to the exhaustive exclusion enumeration in both lifecycle contract copies, extend the paired-clause assertion to bind the corrected enumeration in both files, and refresh the owning skill manifest's content hash. | `docs/plans/AGENTS.md`, `plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md`, `plugins/docks/skills/productivity/plan-workspace/SKILL.md`, `scripts/tests/plan-skill-phases.mjs` | — | `local` | `planned` | Both copies enumerate the repair section, the paired-clause assertion fails if either copy loses the new clause, and the plugin gate accepts the refreshed hash. If a single assertion cannot distinguish one copy from the other, STOP: a check that passes when one file drifts is the defect, not the fix. |
| 3 | Record this plan's acceptance proofs into `## Verification Results` through the shipped writer, using its `report` subcommand to read them back, after both repairs land and before the completion review is reserved. The section it writes belongs to this plan's own record, which is deliberately absent from `affected_paths` because acceptance binds those bytes and listing them would break that bind. | `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs` | 1, 2 | `local` | `planned` | Every acceptance row below carries a proof record keyed to its own command and expectation bytes, and reading them back prints one line per row. If the writer refuses the transition, STOP and record the refusal rather than writing the section directly: a hand-written proof is exactly the unbacked evidence this plan removes. |

## Acceptance criteria

Each row names the single step that owns it. Change-demonstrating rows fail against
the untouched tree; invariant rows carry a named mutation, because a gate demanding
pre-state failure would flag correct invariant rows and get switched off.

| ID | Step | Command | Expected |
|---|---:|---|---|
| A1 | 1 | `node scripts/tests/plan-evidence-probes.mjs r7-finished` | Change-demonstrating. Exit 0. Fails today because the case does not exist, so the probe script exits non-zero on an unknown case rather than reporting a passing assertion. The case builds one scratch plan carrying a single unresolved active path inside a producer block and asserts all four measured cells: at `finished` the shipped behaviour reports zero findings, the repaired behaviour reports one, and both exit 0; at `drafting` both report one and exit 1. Asserting the `finished` exit status is what proves the repair adds visibility without adding a failure. |
| A2 | 2 | `node scripts/tests/plan-skill-phases.mjs --case bounded-workflows` | Invariant under mutation. Exit 0. The case is named explicitly because it is the one the plugin gate runs, so an assertion placed anywhere else would leave the gate green while a copy drifted. Probe: delete the new enumeration clause from the template copy alone, then run `node scripts/ci.mjs --plugin docks` - the gate must exit non-zero naming the template. Routing the probe through the gate rather than this script is what proves CI catches the drift, not merely that a local run can. The case asserts each file separately rather than testing their union, because one assertion spanning both passes while either one drifts. |
| A3 | 2 | `node scripts/ci.mjs --plugin docks` | Invariant. Exit 0, including the refreshed content hash for the edited template. Probe: revert the hash alone and rerun - the gate must exit non-zero naming the stale hash, proving the manifest coupling is enforced rather than conventional. |
| A4 | 3 | `node plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs report docs/plans/active/plan-evidence-row-scales.md` | Change-demonstrating on its output, not its exit code. Prints one proof line per acceptance row in this table. Before step 3 the section carries no proof records, so the count is zero and disagrees with the row count. The observable is the line count rather than the exit status, because `report` prints without judging and would exit 0 having printed nothing. |

## Out of scope / do-NOT-touch

- The mode map, and the unreachable enforcing mode described above. Recorded, not
  repaired; it needs its own plan and a decision that changes a shipped contract.
- Every capability the predecessor shipped. No record field, event, status,
  transition, rule, probe or subcommand is added, removed or renamed. Rule R7 loses
  one status test; its detection logic is untouched.
- The predecessor's frozen implementation commit and its plan record. Both are
  historical evidence, appended to attempt history, and are never rewritten.
- Reconciling the wider drift between the two lifecycle contract copies. This run
  puts its own sentence in both so the deliverable survives a later refresh;
  repairing the remaining divergence, and replacing clause enumeration with one
  byte-equality assertion, is separate work.
- `plugins/session-relay/` and `plugins/effect-kit/`. No behaviour there changes.

## STOP conditions

1. Deleting the early return makes any non-drafting invocation exit non-zero. The
   exit status is then not derived from the mode as measured, and the change is
   larger than a visibility repair.
2. A single paired-clause assertion cannot fail on one copy drifting. A check that
   passes while one file loses the sentence is worse than no check, because it
   reports agreement it never tested.
3. The proof writer refuses the recording transition. Record the refusal and stop;
   writing the section directly would manufacture the unbacked evidence this plan
   set out to remove.
4. `node scripts/ci.mjs --plugin docks` fails twice with the same signature and no
   change in the relevant bytes between attempts.

## Open questions

None. The scope is the two reviewer-found defects; the third defect is recorded
above as explicitly out of scope with its reason, and the recording order for
proofs is fixed by the shipped writer rather than open to choice.


Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"8d69c8158a0852ce57119c17477159c4145276354112bec4546ecd6fb16e3da1","invocations":1,"result_sha256":"185f38fb4c723f6633e1938e782bedcde8e99239a659de895ed14ab5670381cd","state":"passed"},"execution_parent":"db09c1b52f6b35fef41cecc85be47eae2575e27a","goal_id":"3a1b14a3-1e58-4ede-92a8-ea3034793c3d","implementation_commit":null,"plan_path":"docs/plans/active/plan-evidence-row-scales.md","plan_sha256":"c6550bdedad8eeee2973d33add3ad843909574a46a6b72f668fdbc3137798b69","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"bf8ca878-7e23-47aa-b563-81e8c5c40106","schema":1,"source_base":"db09c1b52f6b35fef41cecc85be47eae2575e27a","source_sha256":"7e8650937b9693af58e44338825ee1c6673c107bd24b45df982ae74d9468e583"}

## Review

Plan-attempt-history: {"authorization_source_sha256":"7fe265131d26d2993b9b11c6266e1b67354990ef5405ef37c91b4da618220369","plan_bytes_sha256":"b0873bd33128c31ee034b87432b4f9f6e0eca4447e90b378820b6a3e18657f5c","replacement_run_id":"2492b60a-9166-4c89-81d9-3cee5f2da5a8","run":{"acceptance":null,"blocker":{"evidence_sha256":"a16f17b388e6ed12e23f3b2cfcdd914ac80725579a5e41d94564f155489e4b16","kind":"concurrent_change"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"a9de10f5cd5c4bdae6b4c9a83444a48da3127b5a54e6aa206e2c5716134de4fc","invocations":2,"result_sha256":"e500729df02717a912400a1ab9ed02233a171f2be1e5237bb065334cec22753f","state":"passed"},"execution_parent":null,"goal_id":"3a1b14a3-1e58-4ede-92a8-ea3034793c3d","implementation_commit":null,"plan_path":"docs/plans/active/plan-evidence-row-scales.md","plan_sha256":"b5c10b2159362e8b01197b7328872dc050f55249301d25ca10cb75b2291e8dcb","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"0eff10d5-c904-4390-91f5-de766e89c2c1","schema":1,"source_base":"3d7b9b0047b58f1dfa5756fec19ea803496e78eb","source_sha256":"0c004bc7e79b2a7696f127674ab7e141d9575186505c8c8a1a573d1408ab65e2"},"schema":1,"status":"blocked","successor_run_sha256":"ff8247bc420d264f3709d1666759c58692d1bd62e8e5c79a77f7701d0698fc51"}

Plan-attempt-history: {"authorization_source_sha256":"7827561b2bf7acde515a2a5652d8ebcec36f4c2961cd8dd79bb17917296bfe53","plan_bytes_sha256":"6cfee264cdb083e7a0360c205f9e8451ce5e67675f1578e6766aa1c2a83b3094","replacement_run_id":"bf8ca878-7e23-47aa-b563-81e8c5c40106","run":{"acceptance":{"source_sha256":"a13f8b5342bab8e585abb3ec6fd0478bc34b4256acae35212796d1cd9dced62c","verification_sha256":"ea14812ce39d8dac2f2d4f04d25506ef815127c5cff099bde948c4283a23a2c8"},"blocker":{"evidence_sha256":"2d3c6570abea0a1c889a9b14f7f010c9074c431f364de79e8cdccb26d2be7e0d","kind":"user_decision"},"completion_review":{"input_sha256":"51f97be67866b34ab4e0b82f52fdef918b4f3abcfade6ec780d3aed8dd0a2e77","invocations":2,"result_sha256":"2d3c6570abea0a1c889a9b14f7f010c9074c431f364de79e8cdccb26d2be7e0d","state":"blocked"},"draft_review":{"input_sha256":"33565c793806ef3aa7604b6effefec63171ddafa2c32e14377252f6e96f3114b","invocations":1,"result_sha256":"effb0f89c32d46022959c5fcd3616a26ff61b16bffada6271e1818bb300f8101","state":"passed"},"execution_parent":"0b7d3ed31aacf60b1c1f47ccc3837ba388a96be0","goal_id":"3a1b14a3-1e58-4ede-92a8-ea3034793c3d","implementation_commit":"5badc54309d653db4f868b5c97a6e58596aa273c","plan_path":"docs/plans/active/plan-evidence-row-scales.md","plan_sha256":"2f5eeec2e4317e759f0ef5bd249459d336076620c262684947617765f411f545","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"2492b60a-9166-4c89-81d9-3cee5f2da5a8","schema":1,"source_base":"a3462e201707fd75fc3dbb122e1905c76383c45e","source_sha256":"0e5c236d2b1303aec340814a4617cccad709e5ba98c763f144baa03e59ed0c9b"},"schema":1,"status":"blocked","successor_run_sha256":"2c52a777a8473c400e258c9b1a377ec98205445d838b7b59d2467e83bb9a5f87"}

This run is a same-path successor minted under exact current-user replacement
authority. The predecessor is terminal and immutable: status `blocked`, blocker
`user_decision`, completion review `blocked` at two invocations, with a frozen
implementation commit and re-minted acceptance. Its full record is preserved in the
attempt history above, together with the authorizing message digest and the exact
predecessor plan bytes.

Review budgets are fresh because a replacement never inherits permits or evidence.
Nothing from the predecessor's reviews carries over, and no finding recorded against
it is treated as adjudicated here.

## Verification Results

Not yet started.
