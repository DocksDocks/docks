---
title: Add a bounded compatibility final-review repair rung
goal: Let one legacy lifecycle plan apply its closed authorized repair after Q and re-review exact D1 bytes without weakening E/R/B/Q or execution authority.
status: finished
created: "2026-07-14T01:52:16-03:00"
updated: "2026-07-14T09:34:54-03:00"
started_at: null
assignee: null
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: xhigh
review_waivers: []
tags: [docks, plan-review, compatibility, lifecycle]
affected_paths:
  - docs/plans/active/relay-worker-lifecycle-primitives.md
  - plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs
  - scripts/tests/plan-review-policy.mjs
  - scripts/tests/plan-review-policy-regressions.mjs
  - scripts/release.mjs
  - scripts/repair-plan-worktree.mjs
  - scripts/tests/fixtures/plan-review-policy/sample-plan.md
  - scripts/tests/fixtures/plan-review-policy/legacy-0.12.5-no-repair.json
  - plugins/docks/skills/productivity/plan-review/SKILL.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-init/SKILL.md
  - plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md
  - docs/plans/AGENTS.md
related_plans:
  - docs/plans/active/relay-worker-lifecycle-primitives.md
  - docs/plans/finished/2026-07-14-legacy-start-transition-compatibility.md
review_status: null
planned_at_commit: 2ebba5dda939ffd68594d505511cf142ea76ee66
execution_base_commit: null
ship_commit: "3e6486e45859cfeccd7b1ecf6d7c539c163a4ab5"
---

# Add a bounded compatibility final-review repair rung

> **Superseded by `relay-worker-lifecycle-primitives-continuation` on
> 2026-07-14.** This detour was never started, implemented, or released. Its
> complete draft and review history are retained for provenance; the successor
> preserves the Session Relay Goal and existing implementation branch while
> establishing a normal current-lifecycle execution base.

## Goal

Extend only Docks' closed legacy-start compatibility tail from fixed
`Q → F` to `Q → [D1 → W] → F`, where `[D1 → W]` is one optional, exact,
plan-manager-owned plan-only repair commit for the already reproduced S1 plus
one empty write-ahead commit that arms its single prepared review.
The existing no-repair and post-F completion-reuse paths remain byte-compatible.
The exact D1 repair preserves the plan Goal, deliverable, implementation scope,
lifecycle identity, E/R/B/Q records, completed Step P state, and every protected
executable contract. F must review exact D1 (or Q when there is no repair), and the unchanged
`LegacyExecutionRangeValidationV1` records that input in its existing
`execution_review_input_commit` field.

Success unblocks the independently reproduced S1 finding against lifecycle Q
`2ebba5dda939ffd68594d505511cf142ea76ee66` without rewriting history,
discarding valid review evidence, or permitting unreviewed plan prose to become
execution authority.

## Context & rationale

The Docks 0.12.5 compatibility release correctly closed a historical start
transition through exact plan-only E/R/B/Q/F commits. Q for the lifecycle plan
is committed and independently validated:

- E `9797e0e454d6f67205a2c01be6c493367a4ac871`
- R `d72d38ead012967da5b77b122f6a1d47fdf39694`
- B `3d8f5c0e198298689c1b091cfdeb38c0b1e5ea99`
- Q `2ebba5dda939ffd68594d505511cf142ea76ee66`
- Docks prerequisite receipt `4bbc70801fb2ea7cfe2653e8f3838d748c137ccc17ef7ce10d39883177080b46`

The fresh Q bundle has request
`fb6ed096-002a-4f34-a04a-9e7ed5d0e444`, bundle SHA-256
`2d86599dc69d68b0e2636c7bf9d7a1f4d1a0d55021a84dbe5d3391bfc47cebc2`,
and input SHA-256
`e8fdb079ea34271f7fa513ed0d0bd265a19c25e02482c54e6a87d6fef186f7a0`.
Its valid S reviewer returned `not_ready` 94/100 with one medium finding:
the current cold-handoff result still says compatibility review/release/install
are pending, and the current author score still says Step P is pending although
Q marks P done. The orchestrator reproduced both statements against Q.

This committed plan persists the closed repair authority; no later session must
reconstruct or compare a run-local finding id:

Compatibility-repair-authorization: {"accepted":[{"defect":"Q still reports the completed Docks compatibility prerequisite and Step P as pending.","fix":"Apply exactly M11 and M12 together with M1-M10 protocol alignment, then review exact D1.","reproduction":{"method":"exact-q","q_step_p_status":"done","selectors":[{"before_sha256":"a525e95609c272329ae346fe7991da03bcb481e84bbd0385e5fa7730bf028703","mutation":"M11"},{"before_sha256":"8365ebb88d0363e530237396294e2a15b4d9e0aeccfe8c43080cd2d2c97abdfa","mutation":"M12"}]},"severity":"medium","stable_id":"q-stale-status-s1"}],"d1_canonical_sha256":"e6d9d3b571d268603a282dfa9edeb01e09c2e73f4137eed752e935e7009f56bc","d1_raw_sha256":"7eb0b926d5d56fa993dde7663df6dded9a9dd51b87b451714f47d6e15dcc847e","kind":"legacy-final-review-repair-authorization","mutation_array_sha256":"a8634397344fe9f5c9ca05422ce41be2bd1a418a275b8c3791b63f1595af6cf0","prerequisite_blob":"79769c6c7b5bfc4d65ac1adc88a591aaeb7bb674","prerequisite_commit":"2ebba5dda939ffd68594d505511cf142ea76ee66","prerequisite_input_sha256":"e8fdb079ea34271f7fa513ed0d0bd265a19c25e02482c54e6a87d6fef186f7a0","prerequisite_raw_sha256":"ff99ebcf70b0aa4b45664068d38a2471e8e93b342736c636fb57361a59a8879b","schema":1,"source_review":{"bundle_sha256":"2d86599dc69d68b0e2636c7bf9d7a1f4d1a0d55021a84dbe5d3391bfc47cebc2","input_sha256":"e8fdb079ea34271f7fa513ed0d0bd265a19c25e02482c54e6a87d6fef186f7a0","leg":"S","request_id":"fb6ed096-002a-4f34-a04a-9e7ed5d0e444","score":94,"verdict":"not_ready"},"target_plan":"docs/plans/active/relay-worker-lifecycle-primitives.md"}

The line is RFC-8785 JCS and has SHA-256
`2c70b6ba8cf1abd5d323a4345e83c58805951855e476a5df6fa735c8c6da409a`.
The released repair policy freezes that hash and validates its closed keys,
exact Q identities, one normalized accepted/reproduced finding, M11/M12 selector
hashes, ordered mutation-program hash, and D1 postimage hashes before D1. The
source review's temporary bundle is provenance only; this machine record and
the independently reviewable Q bytes are the durable authorization.

The durable Q baseline is not the temporary bundle. At this plan's current
reviewed head, `docs/plans/active/relay-worker-lifecycle-primitives.md` has the
same Git blob as Q: `79769c6c7b5bfc4d65ac1adc88a591aaeb7bb674`, with raw-byte SHA-256
`ff99ebcf70b0aa4b45664068d38a2471e8e93b342736c636fb57361a59a8879b`.
Every formal review of this plan must request that target-plan path into the
sealed read-only bundle and recheck both identities against Q. A missing or
different baseline is STOP; constants or the temporary Q bundle alone are not
review evidence. The target appears in `affected_paths` only because schema-v1
seals that closed list; it is an immutable evidence input, not an implementation
path. Any execution-range change to it before this plan is archived and the
post-ship handoff begins is STOP.

This is a policy gap, not permission to weaken review. Generic plan-manager
policy says to repair every valid `not_ready` finding and review again, while
0.12.5 deliberately rejects Q extra prose, any intervening Q→F commit, and F
extra prose. F cannot honestly include the repair because its receipt would
review bytes that do not contain it. A typed repair rung reconciles those two
contracts while retaining fail-closed validation.

Why zero or one D1: zero preserves all existing compatible histories; one exact
postimage is sufficient for the only durable accepted finding; and forbidding a
second repair removes unpersisted negative-review provenance across restarts.
A separate 4,096-commit Q→F inspection cap bounds unrelated history. Unrelated
commits that do not change the target plan path are ignored by the path-specific
snapshot, including the Docks policy implementation and release that must land
after the already-committed Q. A commit that changes the target plan and any
other path is never D1 or F.

## Environment & how-to-run

- Repository: `/home/vagrant/projects/docks`, branch `main`.
- Required runtime: Node.js 24, the version pinned by CI.
- Exact local live process-recovery proof runtime: Node.js 24.15.0, GNU Bash
  5.2.37, GNU coreutils `env` 9.7, Debian `cc` 14.2.0, and glibc 2.41. The compiler is used only by A2
  to pause the installed Git process at its real atomic index-publication seam;
  neither the shipped plugin nor tag CI gains a compiler dependency.
- Linux post-ship lock supervision requires exact installed util-linux 2.41
  `flock`/`setpriv --pdeathsig` and Git 2.47.3, matching the versions under which
  A2 proves parent-death ordering and ref-lock cleanup. Absence, version drift,
  or a failed parent-death/transaction-cleanup probe is STOP before D1. The
  exact-host mode runs only as local A2; default/tag CI runs the deterministic
  portable compatibility mode and statically proves the live mode remains
  composed, because GitHub's `ubuntu-latest` tool versions are not this host's
  pinned recovery environment.
- Install once if necessary: `corepack enable && pnpm install --frozen-lockfile`.
- Current source helper:
  `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs`.
- Current released helper in both caches: Docks 0.12.5, SHA-256
  `9eba4f8f80b95915fa0b69ce1b1451cbe62f598f6ae7e4b12c831de6cd65681b`.
- Focused compatibility gate:
  `node scripts/tests/plan-review-policy.mjs --case execution-compatibility`.
- Mutation gate:
  `node scripts/tests/plan-review-policy-regressions.mjs --self-test`.
- Documentation/content gates:
  `node scripts/skills/content-hash.mjs --check-only plugins/docks/skills`
  and `node scripts/tree/guard.mjs`.
- Full pre-commit gate: `node scripts/ci.mjs`.
- Cargo is not part of this policy implementation. Full CI may invoke Session
  Relay checks; do not run Cargo from the repository root.

Implementation occurs on a worker branch/worktree. The worker never pushes or
releases. Plan-manager independently verifies the focused gates and full CI,
then performs completion review. Only after the plan is shipped may the already
authorized Docks patch release workflow publish the next patch and refresh both
plugin caches. The lifecycle plan remains paused throughout.

The ordered completion inventory below intentionally omits `node scripts/ci.mjs`.
Completion runs that exact project CI command once, separately, after A1–A9.
The release command is post-ship and is never completion acceptance evidence.

Before implementation dispatch, main-context plan-manager runs this exact
read-only baseline proof from the repository root. It verifies Q ancestry, a
linear target-untouched Q→HEAD tail, a 32-commit reserve under the 4,096 cap, and
the current target-plan blob identity; then it extracts the plan's M1–M12 array,
requires every selector exactly once in order, applies it, and recomputes both
declared D1 hashes:

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { canonicalPlanView, jcs, sha256 } from './plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs';
const q='2ebba5dda939ffd68594d505511cf142ea76ee66', target='docs/plans/active/relay-worker-lifecycle-primitives.md';
const blob='79769c6c7b5bfc4d65ac1adc88a591aaeb7bb674', qsha='ff99ebcf70b0aa4b45664068d38a2471e8e93b342736c636fb57361a59a8879b';
const d1sha='7eb0b926d5d56fa993dde7663df6dded9a9dd51b87b451714f47d6e15dcc847e', canonical='e6d9d3b571d268603a282dfa9edeb01e09c2e73f4137eed752e935e7009f56bc';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
git('merge-base','--is-ancestor',q,'HEAD');
if(git('rev-list','--merges',`${q}..HEAD`)!=='') throw Error('Q tail contains merge');
if(git('rev-list',`${q}..HEAD`,'--',target)!=='') throw Error('Q tail already touched target');
if(Number(git('rev-list','--count',`${q}..HEAD`))>4064) throw Error('Q tail lacks 32-commit reserve');
if(git('rev-parse',`${q}:${target}`)!==blob||git('rev-parse',`HEAD:${target}`)!==blob) throw Error('Q baseline blob drift');
const bytes=execFileSync('git',['show',`${q}:${target}`]);
if(sha256(bytes)!==qsha) throw Error('Q baseline byte drift');
const text=fs.readFileSync('docs/plans/active/compatibility-final-review-repair-rung.md','utf8');
const match=text.match(/### Exact D1 application[\s\S]*?```json\n(\[[\s\S]*?\n\])\n```/);
if(!match) throw Error('D1 mutation array missing');
const mutations=JSON.parse(match[1]), ids=Array.from({length:12},(_,i)=>`M${i+1}`);
if(JSON.stringify(mutations.map(({id})=>id))!==JSON.stringify(ids)) throw Error('D1 mutation order');
if(sha256(jcs(mutations))!=='a8634397344fe9f5c9ca05422ce41be2bd1a418a275b8c3791b63f1595af6cf0') throw Error('D1 mutation-array hash');
for(const {id,before,after,before_sha256,after_sha256} of mutations) {
  if(sha256(before)!==before_sha256||sha256(after)!==after_sha256) throw Error(`${id} entry hash`);
}
let d1=bytes.toString('utf8');
for(const {id,before,after} of mutations) { if(d1.split(before).length!==2) throw Error(`${id} selector count`); d1=d1.replace(before,after); }
if(sha256(d1)!==d1sha) throw Error('D1 blob hash mismatch');
if(sha256(canonicalPlanView(Buffer.from(d1)))!==canonical) throw Error('D1 canonical hash mismatch');
process.stdout.write(JSON.stringify({schema:1,q_blob:blob,q_sha256:qsha,d1_sha256:d1sha,d1_canonical_sha256:canonical})+'\n');
NODE
```

Expected: exit 0 and exactly the four identities above. Failure stops before a
worker receives the plan. This proof is setup evidence, not a completion row;
the implemented A2 focused case re-proves the same transform independently.

### Findings-driven optional D1

1. Validate the committed `Compatibility-repair-authorization:` as a closed
   JCS record with the exact hash, Q identities, normalized reproduced finding,
   M11/M12 selectors, mutation-program hash, and D1 postimage hashes above.
   Do not seal or dispatch another Q review: fresh reviewer ids and wording are
   run-local, while exact D1 is already authorized by durable evidence.
2. Apply exactly D1 without replacing Q's immutable R receipt, commit plan-only
   D1, and destroy every stale Q bundle. There is no findings equivalence test,
   no ordinary receipt persisted over Q, and no ineligible-result override.
3. Prepare and seal one fresh ordinary schema-v1 review of exact D1, select the
   complete X/S dispatch plan, and validate both before any write-ahead commit.
   With clean index/worktree and `HEAD=D1`, create exactly one empty, single-parent
   write-ahead commit W through an expected-D1 compare-and-swap. Its sole exact
   commit-message record binds D1, the full request, both leg dispatch plans,
   and their JCS hashes. Only the process whose compare-and-swap created W gets
   one process-local authority to launch that prepared review cycle. Merely
   classifying an existing W never authorizes a launch.
4. Immediately revalidate W and the sealed bundle, then launch that one bounded
   schema-v1 review cycle. Main-context plan-manager reproduces every X/S
   finding and records the complete accepted and rejected partition with a
   reason for each rejection. A findings-free `ready` `dual|single` result
   applies F as W's direct target-plan-changing child, while F's receipt still
   reviews D1 because W changes no tree bytes.
5. Any other outcome after W—including a D1 finding, `not_ready`, a
   compatibility-ineligible result, malformed/mismatched/unparseable/lost
   output, launch uncertainty, or an interrupted result commit—applies one
   terminal plan-only T as W's direct child. A typed result persists its full
   DraftReceipt/reconciliation; an uncertain result persists the exact W-bound
   indeterminate variant without inventing a verdict or findings. A restart
   that observes W always applies indeterminate T and never relaunches. Only a
   failure before W may repeat prepare/seal work. T can never classify as D1 or
   F; D2 does not exist. Only a separately owner-authorized policy plan may
   define recovery.

“Plan-manager-owned” is a process precondition enforced by the skill and main
context. Git validation proves the one closed D1 byte transform, W's atomic
creator-only launch edge, and exact F/T review binding. T persists every
completed or indeterminate attempt obligation; no discretionary D2–D8
provenance exists to reconstruct.

## Interfaces & data shapes

### Path-specific compatibility tail

Keep `validateExecutionRange(...)` and
`LegacyExecutionRangeValidationV1` public shapes unchanged. Freeze
`LEGACY_START_TRANSITION_COMPATIBILITY_POLICY` and its SHA-256
`b224d8fc3f8ba6921aec38e834ec2f812954aff79859734e988fb03caf9f1253`
byte-for-byte; repair rules live in a separate internal
`LEGACY_FINAL_REVIEW_REPAIR_POLICY` constant with its own asserted JCS hash.
The no-repair branch remains the frozen 0.12.5 raw adjacency exactly:

```text
Q → immediate plan-only F
```

Only when the closed authorization matches exact Q may the repair branch use:

```text
Q prerequisite plan commit
  → zero or more unrelated commits that do not change PLAN_PATH
  → D1 (exact M1–M12 plus optional updated; changes only PLAN_PATH)
  → exactly one empty write-ahead W commit
  → F or terminal T (changes only PLAN_PATH)
```

`execution_review_input_commit` is Q on the no-repair path, otherwise D1.
`execution_review_commit` is F. Existing E/R/B/Q SHA and receipt fields retain
their current meanings and values. Do not add request, bundle, receipt,
completion, cleanup, or execution-range schema keys.

### Durable write-ahead attempt and terminal stop

Before W, the helper validates one closed `RepairReviewDispatchV1`:

```text
{
  schema: 1, request_sha256: 64hex,
  X: {company: anthropic, transport: in_session|cli,
      tiers: [{model: nonempty-string, effort: nonempty-string}],
      timeout_seconds: 600},
  S: {company: openai, transport: in_session|cli,
      tiers: [{model: nonempty-string, effort: nonempty-string}],
      timeout_seconds: 600}
}
```

No extra key is legal and both tier arrays are nonempty. The arrays and
transports are the exact resolved, preselected dispatch
plans for both legs; model fallback and the one permitted transient retry still
occur only inside this single armed review cycle. The full request validates as
schema-v1 draft/`lifecycle_intent=none`, has null completion fields, names D1 as
`reviewed_commit_or_head`, binds D1's canonical input and sealed bundle, and
matches the persisted author/policy. `request_sha256` is SHA-256 of its JCS.

Add one internal read-only builder surface:

```text
review-policy.mjs repair-arm-record <repo> <D1> <plan-path> <Q>
  <request-json> <bundle-dir> <dispatch-json>
```

It revalidates D1, authorization, request, dispatch, and sealed bundle, then
emits exactly one LF-terminated commit-message line:

```text
Compatibility-repair-review-attempt: <CompatibilityRepairAttemptV1 JCS>
```

`CompatibilityRepairAttemptV1` is closed with this exact key vector and types:

```text
{
  schema: 1, kind: "legacy-final-review-repair-attempt",
  target_plan: string, prerequisite_commit: 40hex,
  repair_commit: 40hex, repair_plan_blob: 40hex,
  repair_raw_sha256: 64hex, repair_input_sha256: 64hex,
  request: ReviewRequestEnvelope, request_sha256: 64hex,
  dispatch: RepairReviewDispatchV1, dispatch_sha256: 64hex
}
```

`request_sha256=sha256(JCS(request))` and
`dispatch_sha256=sha256(JCS(dispatch))`. Plan-manager requires clean
index/worktree and `HEAD=D1`, creates an empty commit object with D1's exact tree
and parent plus that exact message, then atomically updates HEAD from expected
D1 to W. A failed compare-and-swap creates no referenced W and grants no launch.
After success it revalidates W: one parent D1, identical tree, empty changed-path
vector, exact reserved-prefix message with no trailer/extra byte, and exact
record/request/dispatch bindings. Only that successful call site returns one
process-local launch authority. An already-existing W is never launch authority.
Any malformed reserved-prefix commit, nonempty/duplicate W, W before D1, W on
the no-repair path, or W after T/F rejects instead of being ignored.

`Compatibility-repair-stop-receipt: <compact JCS>` is a compatibility-local
machine record whose value is this exact closed `CompatibilityRepairStopV1`:

```text
{
  schema: 1, kind: "legacy-final-review-repair-stop",
  variant: "typed_negative" | "indeterminate_attempt",
  armed_commit: 40hex, repair_commit: 40hex,
  request_id: uuid, input_sha256: 64hex,
  request_sha256: 64hex, dispatch_sha256: 64hex,
  draft_receipt: DraftReceipt | null,
  indeterminate_reason: null |
    "recovery_observed_armed" | "launch_failed" |
    "output_unparseable" | "output_mismatched" |
    "output_lost" | "result_commit_interrupted" |
    "candidate_ci_failed",
  accepted_ids: [Xn|Sn], stop_sha256: 64hex
}
```

`stop_sha256` hashes JCS of the object without `stop_sha256`; accepted ids are
strings matching `^(X|S)[1-9][0-9]*$`, unique in X-then-S numeric order. Both
variants bind W, D1, exact request and
dispatch hashes, and are permanently ineligible for F:

- `typed_negative` embeds the ordinary validated DraftReceipt with exact W
  request, raw legs, complete accepted/rejected reconciliation, reproduced
  evidence, policy, and request; its indeterminate reason is null and
  `accepted_ids` exactly matches the receipt's accepted reconciliation ids.
- `indeterminate_attempt` carries no verdict, findings, or DraftReceipt and has
  one reason from `recovery_observed_armed|launch_failed|output_unparseable|output_mismatched|output_lost|result_commit_interrupted|candidate_ci_failed`; its `accepted_ids` is empty.

In the same W-direct-child plan-only T commit, the sole result builder replaces
`status` with `blocked`, uses one timestamp for `updated` and `blocked_since`,
and renders `blocked_reason` exactly as
`compatibility D1 review stopped at <W>: <variant>/<reason-or-typed>; request <id>; input <sha>; accepted <comma-ids-or-none>`.
`<W>` is the full 40-hex armed commit; `<reason-or-typed>` is the exact
indeterminate enum or literal `typed`; the YAML scalar is double quoted.
It inserts exactly one stop record immediately before `## Mistakes & Dead Ends`
and changes no other D1 byte. T deliberately has no success
grammar: the classifier rejects it before F and no session may review past it.
Crashes before launch, during either leg, after valid negative or positive
output, and before T/F commit all recover from W to indeterminate T. Only
prepare/seal failures before W may retry.

Add three internal evidence-only builder/validator surfaces; none updates Git
or the source worktree:

```text
review-policy.mjs repair-d1-application <repo> <HEAD> <plan-path> <Q>
  <private-output-dir>
review-policy.mjs repair-result-application <repo> <W> <plan-path> <Q>
  <f|typed-t|indeterminate-t> <evidence-json> <private-output-dir>
review-policy.mjs repair-worktree-state <repo> <HEAD> <plan-path> <Q>
```

The result builder's `<evidence-json>` is one canonical mode-0600 regular file
containing exactly one closed `RepairResultEvidenceV1` variant:

```text
{
  schema: 1, kind: "f" | "typed-t", armed_commit: 40hex,
  run_result: DraftRunResult, draft_receipt: DraftReceipt
}
|
{
  schema: 1, kind: "indeterminate-t", armed_commit: 40hex,
  reason: "recovery_observed_armed" | "launch_failed" |
    "output_unparseable" | "output_mismatched" | "output_lost" |
    "result_commit_interrupted" | "candidate_ci_failed"
}
```

No extra key is legal. The `kind` must equal the CLI variant. Both review
variants must carry the exact validated run result and its byte-equivalent
validated receipt: request, raw X/S attempts, selected tiers, reproduced
evidence, reconciliation, policy, outcome, eligibility, and review time all
bind W. `f` additionally requires findings-free `ready` `dual|single` and
`pre_execution_eligible:true`; `typed-t` requires any schema-valid result that
fails that closed compatibility predicate. `indeterminate-t` has no run result,
receipt, verdict, findings, or accepted ids; the builder derives every identity
from W and accepts only the named reason.

Main-context plan-manager serializes this object as compact JCS plus LF into a
new exclusive no-follow mode-0600 `evidence.json` inside a private mode-0700
directory, rereads its mode/realpath/bytes, and sets
`REPAIR_RESULT_EVIDENCE` to that canonical path. For `f`/`typed-t`, it copies
only the exact already-validated run result and receipt objects; for
`indeterminate-t`, it copies only W plus the selected closed reason. No prose,
stdout, partial output, guessed finding, or reconstructed past result may enter
the file.

Each application builder writes only canonical mode-0600 `plan.md`,
`commit-message.txt`, and
`application.json` inside a newly created canonical mode-0700 output directory.
`application.json` is compact-JCS `RepairPlanApplicationV1` with the exact keys

```text
{
  schema: 1, kind: "d1" | "f" | "typed-t" | "indeterminate-t",
  plan_path: string, expected_parent: 40hex,
  expected_parent_tree: 40hex, result_plan_sha256: 64hex,
  commit_message_sha256: 64hex, expected_state: "d1" | "f" | "terminal",
  request_sha256: null | 64hex, dispatch_sha256: null | 64hex
}
```

Only D1 has null request/dispatch hashes; all result variants bind W's exact
hashes. No extra key or output file is legal.
The LF-terminated commit message is exactly
`docs(plans): repair lifecycle final-review input` for D1,
`docs(plans): record lifecycle final review` for F, and
`docs(plans): stop lifecycle compatibility review` for either T variant.
The D1 builder binds current expected parent, Q/authorization, exact M1–M12
bytes, and resulting D1 identities. The result builder binds W, expected
parent/tree, result plan bytes/hash,
commit-message bytes/hash, request/dispatch hashes, variant, and F/T expected
state. `f` applies only the existing receipt replacement + attribution + optional
`updated`; typed/indeterminate T uses the exact union/rendering above. The
builder validates each X/S raw attempt ledger and selected tier as an exact
realization of W's leg transport and ordered tier plan, including permitted
fallback/retry; ordinary schema validity alone is insufficient. Typed T uses
the same realization check. The worktree validator emits only the closed
`RepairWorktreeStateV1` object:

```text
{
  schema: 1, head: 40hex, plan_path: string,
  state: "q" | "d1" | "armed" | "terminal" | "f",
  action: "clean" | "sync_head", index_plan_blob: 40hex,
  worktree_raw_sha256: 64hex, expected_plan_blob: 40hex,
  expected_plan_raw_sha256: 64hex
}
```

No extra key is legal. Let `P` be the validated direct parent's exact plan blob
and raw hash, and `H` the current q/d1/armed/terminal/f HEAD pair. The closed
pair table is: `H/H → clean`; `P/P → sync_head`; and `P/H → sync_head`. When P
and H are byte-identical, the state is simply clean. The reverse `H/P` pair is
never produced by worktree-first/index-second synchronization and rejects as
outside-protocol mutation. Every status entry must name only PLAN_PATH and have
the exact status/mode implied by the selected row. Any other pair, dirty byte,
path, mode, untracked file, conflict, missing index entry, or state rejects.

The caller—not the child process—creates and sets each fresh
`APPLICATION_DIR`, writes the exact JCS evidence file when applicable, and then
uses one of these literal invocations:

```bash
APPLICATION_DIR="$("$MKTEMP_BIN" -d /tmp/docks-repair-application.XXXXXX)"
test "$("$STAT_BIN" -c '%a' "$APPLICATION_DIR")" = 700
BUILDER_STDOUT="$(run_repair_policy repair-d1-application . "$CURRENT_HEAD" "$PLAN_PATH" "$Q" "$APPLICATION_DIR")"
test -z "$BUILDER_STDOUT"

APPLICATION_DIR="$("$MKTEMP_BIN" -d /tmp/docks-repair-application.XXXXXX)"
test "$("$STAT_BIN" -c '%a' "$APPLICATION_DIR")" = 700
BUILDER_STDOUT="$(run_repair_policy repair-result-application . "$W" "$PLAN_PATH" "$Q" f "$REPAIR_RESULT_EVIDENCE" "$APPLICATION_DIR")"
test -z "$BUILDER_STDOUT"

APPLICATION_DIR="$("$MKTEMP_BIN" -d /tmp/docks-repair-application.XXXXXX)"
test "$("$STAT_BIN" -c '%a' "$APPLICATION_DIR")" = 700
BUILDER_STDOUT="$(run_repair_policy repair-result-application . "$W" "$PLAN_PATH" "$Q" typed-t "$REPAIR_RESULT_EVIDENCE" "$APPLICATION_DIR")"
test -z "$BUILDER_STDOUT"

APPLICATION_DIR="$("$MKTEMP_BIN" -d /tmp/docks-repair-application.XXXXXX)"
test "$("$STAT_BIN" -c '%a' "$APPLICATION_DIR")" = 700
BUILDER_STDOUT="$(run_repair_policy repair-result-application . "$W" "$PLAN_PATH" "$Q" indeterminate-t "$REPAIR_RESULT_EVIDENCE" "$APPLICATION_DIR")"
test -z "$BUILDER_STDOUT"
```

Each command exits 0 with no stdout only after writing and rereading the three
closed outputs. A nonzero exit, any stdout, wrong evidence kind, mode, path,
key, hash, request, dispatch realization, or compatibility predicate writes no
Git state and grants no publication authority.

### Repository lock and atomic plan commits

The repair path is Linux-only operational compatibility and requires util-linux
`flock`; absence is STOP. It uses two advisory locks on already-existing,
canonical directory inodes—never mutable lock files. The primary transaction
lock is the shared Git common directory. The secondary writer fence is that
common directory's canonical `objects/` directory. Both are opened once as
fixed Bash descriptors, then the opened descriptor's realpath and device/inode
are validated before `flock` receives that same descriptor number. No
stat-then-reopen split is legal; descriptor/path ABA fixtures must fail.

Before the first Git derivation, the launcher rejects every inherited repository,
common-dir, worktree, index, object, alternate, quarantine, namespace,
shallow/graft, configuration-parameter, attribute-source, or discovery-routing
environment input. The closed input set contains every name emitted by exact Git
2.47.3 `rev-parse --local-env-vars` plus the system/global/config-key, attribute,
namespace, quarantine, literal-pathspec, optional-lock, and discovery overrides
used by this protocol. It then binds exact canonical `GIT_DIR`, `GIT_COMMON_DIR`,
`GIT_WORK_TREE`, and `GIT_OBJECT_DIRECTORY`, disables system/global config,
replacement objects, optional locks, and hooks, and revalidates repo root,
per-worktree Git dir, common dir, object dir, target path, and controlled config
before every writer. Only the generic application's exact private index may set
`GIT_INDEX_FILE`, paired with an equal exported `REPAIR_PRIVATE_INDEX`; all other
writers require both unset. Any inherited or later redirect is STOP rather than
permission to mutate a different object store, ref namespace, index, or worktree.

Commands whose purpose is outside this repository run through exact coreutils
`env -u` with that entire Git-routing set removed. Read-only plugin inventory,
private activation evidence, and portable X/S reviewer commands use
`run_repair_unrouted_reader`, receive neither descriptor, and have no repository
publication authority. The three plugin-cache mutations use
`run_repair_unrouted_shared_writer`: they receive the parent-bound fd-9 fence but
not fd 8 or any Git-routing variable, so an old generation cannot continue
changing a supported cache after a new owner begins classification. In-session
review dispatch is outside the streamed shell and inherits neither descriptor nor
its controlled Git environment.

Before restart recovery or classification, one Bash holder opens the primary on
fd 8, validates `/proc/$BASHPID/fd/8`, acquires it through util-linux's open-fd
form, and records its PID/start-time/executable. It launches installed
`setpriv --pdeathsig KILL` plus a fresh noninteractive
`bash --noprofile --norc -s` child with fd 8 explicitly closed. The child
revalidates the same holder identity before work. This capture →
parent-death-signal → recheck sequence closes the documented pre-`prctl` parent
death race. Steps 2–5 run only inside that child. Only the Bash holder owns the
primary descriptor; no reviewer, activation, supervised child, or writer can
inherit it.

The primary holder serializes live recovery, classification, D1, W, the entire
prepared X/S cycle, F/T publication, synchronization, and post-result
validation. A second process that cannot acquire it exits without classifying,
launching, or writing T. Holder death closes fd 8 and delivers uncatchable
`KILL` to the supervised Bash. Because release and descendant signals are not
ordered, the writer fence supplies the handoff. Every new primary owner drains
fd 9 through `wait_repair_state_writers` before recovery or classification.

`run_repair_state_writer` rejects Bash subshells, captures its own identity,
opens and validates fd 9, and acquires the writer fence **in the original
supervised Bash before it forks any writer child**. It then revalidates the
fd-8 holder identity while fd 9 is held; a delayed shell from an earlier holder
must close fd 9 and fail before writer creation. Only then does it launch a
`TERM`-bound child;
the child rechecks both parent identity and inherited fd 9, then directly
`exec`s the requested Git command. Per `flock(2)`, locks are shared by duplicated
descriptors, preserved across `execve`, and released only when all duplicates
close. Thus there is no pre-fence late entrant: before acquisition there is no
writer child, and afterward both Bash and the actual Git process retain the
fence. Holder death kills Bash, Git receives `TERM`, Git removes prepared
ref/index locks through its 2.47.3 common signal cleanup, and fd 9 remains held
until Git and any inheriting child exit. A new owner either drains after that
boundary or times out before classification. Residual `*.lock` beneath the
common directory is STOP and is never deleted automatically.

Every external command that can change the shared object database, HEAD, the
main index, the worktree, or either supported plugin cache uses the writer fence:
W/result `commit-tree`, result
`hash-object --no-filters -w`/`write-tree`, W/D1/F/T `update-ref`, exact index-only
`restore`, the author-side atomic worktree helper, and the three cache-update
commands. Git object-id stdout is
redirected by the original Bash to private mode-0600 files and read back with
shell builtins, never by wrapping the function in a pipeline or command
substitution. Every status read uses exact Git 2.47.3
`--no-optional-locks` under exported `GIT_OPTIONAL_LOCKS=0`, so it cannot refresh
the main index. Read-only activation/reviewer descendants inherit neither lock;
cache-mutating descendants inherit only fd 9 through the closed wrapper. None
inherits fd 8 or repository routing, and none has repository-state publication
authority.

D1, F, and both T variants use one generic atomic plan-commit recipe. It consumes
only a validated private application, builds the result blob/tree/commit through
a private temporary index without touching the main index/worktree, then runs
`run_repair_state_writer "$GIT_BIN" update-ref HEAD <result> <expected-parent>`
as the sole publication CAS.
D1's expected parent is the captured current q-state HEAD; F/T's expected parent
is W. A failed CAS leaves the visible ref, main index, and worktree unchanged and
grants no authority. After a successful CAS, validate the exact commit/state,
then synchronize only PLAN_PATH from that result and require clean status. If
the process ends after CAS but before synchronization, the next lock owner first
runs `repair-worktree-state`; only its exact `sync_head` output authorizes the
same closed two-operation synchronization function. That function atomically
replaces the worktree file first, then invokes exact Git with
`restore --source=<HEAD> --staged -- PLAN_PATH` to update only the index. At every
boundary, index and worktree each equal either the validated parent or current
HEAD identity already accepted by `RepairWorktreeStateV1`; the combined
non-atomic `--staged --worktree` form is forbidden. No ordinary edit/stage/commit
is used for D1/F/T.

The repository-wide pre-commit rule applies to these CAS-created commits too.
Before publishing D1 or either F/T candidate, plan-manager runs the full bare
`node scripts/ci.mjs -q` against that exact candidate plan in a fresh
`git clone --no-local --no-hardlinks` of current expected-parent `main`; the
clone receives the candidate `plan.md` bytes/mode and a validated read-only
symlink to the current canonical `node_modules`, but no repository routing, fd
8, or fd 9. The clone's HEAD, candidate raw hash, only-dirty target path, source
helper hashes, and full-CI exit 0 are revalidated immediately before the
expected-parent CAS. The private clone is removed only through an exact
canonical owned-prefix cleanup. A restart has no durable CI authority and reruns
the candidate gate. After D1 is visible and synchronized, the same full gate is
run once more against exact current D1 immediately before empty W, because the
HEAD/history identity changed even though W's tree will not. No relevant edit,
ref change, helper/tool drift, or worktree/index change may occur between a
passing candidate gate and its CAS.

Before W, candidate-CI failure stops without D1/W publication. After W, an F or
typed-T candidate-CI failure is non-authorizing and selects deterministic
indeterminate T with reason `candidate_ci_failed`; that T receives its own exact
candidate gate before CAS. If the T gate itself is unavailable or failing, the
process writes nothing and stops at W; restart never relaunches review and
retries only the same recovery-T candidate gate. Thus no commit bypasses full
CI, and transient CI failure cannot be mistaken for a review verdict.

The worktree operation is owned by the new author-side executable
`scripts/repair-plan-worktree.mjs`, never by the shipped evidence-only helper.
Its sole production CLI is literal:

```text
node scripts/repair-plan-worktree.mjs sync . <40hex-HEAD> <PLAN_PATH> <canonical-mode-0600-source>
```

It requires the controlled canonical `GIT_DIR`, `GIT_COMMON_DIR`,
`GIT_WORK_TREE`, and `GIT_OBJECT_DIRECTORY` environment described below, exact
source bytes/mode from the named commit, a regular mode-100644 target, and equal
device ids for the per-worktree Git directory and target parent. It prints
nothing. Before touching the target it creates and fsyncs the reserved canonical
mode-0700 `$GIT_DIR/docks-repair-plan-sync/` directory and an exclusive,
no-follow, mode-0600 `intent.json` containing compact JCS with exactly:

```text
{
  schema: 1, kind: "docks-repair-plan-sync", head: 40hex,
  plan_path: string, source_raw_sha256: 64hex, target_mode: "100644"
}
```

Only `intent.json` and optional regular `plan.tmp` are legal entries. The helper
writes/fsyncs `plan.tmp`, changes it to mode 0644, fsyncs the staging directory,
and atomically renames that same-filesystem file over PLAN_PATH, then fsyncs the
target parent and removes/fsyncs its intent directory. On restart, an existing
staging directory is recoverable only when its realpath, owner, modes, exact
closed intent, allowed entry set, named HEAD/source, and old-or-new exact target
all match the current invocation; then the helper removes only those reserved
artifacts and deterministically retries or returns already-current. A symlink,
extra entry, wrong intent, cross-device target, partial target, or unrelated
identity is STOP. This durable intent authorizes cleanup of its own partial temp
without authorizing repair of any worktree byte.

The caller obtains the source with exact read-only
`git cat-file blob <HEAD>:<PLAN_PATH>` redirected by the original Bash into a
fresh private mode-0700 directory/mode-0600 file, verifies its Git mode/raw hash,
runs the Node helper through `run_repair_state_writer`, then runs index-only Git
restore through the same wrapper and rechecks `repair-worktree-state` plus clean
status. Focused fixtures pause before fence acquisition, after Bash owns fd 9
but before writer fork, at every durable worktree-helper transition, and at the
real Git index-lock publication seam. An immediate competing primary owner
cannot pass fd 9 until the prior command and inheriting children exit and Git
removes its lock; exact retry then proves every interrupted boundary recoverable.
Tests also
require T winning W's CAS to make a late F CAS fail, both competing T CASes to
have at most one winner, and no visible orphaned terminal state.

### Canonical release-cache set

Add one internal CLI surface:

```text
review-policy.mjs cache-set <source-root> <codex-cache-root>
  <claude-cache-root> <expected-json>
```

It requires all four roots/files to be absolute canonical objects after
resolution; every root is a regular non-symlink directory; every expected file
is a regular non-symlink file whose realpath equals its absolute path and stays
inside its named root; `expected-json` is a canonical mode-0600 regular file in
a canonical mode-0700 directory; and the closed expected object contains only
schema 1, the three exact source SHA-256 values, and the eight true activation
booleans. Source, Codex, and Claude hashes must be equal for every named file.
On success it emits exactly the expected object's compact JCS plus LF; any path,
mode, symlink, containment, schema, hash, or extra-key mismatch exits nonzero
before an installed helper is executed.

### Resumable release publication

Extend the existing author-side release entry point without changing its normal
non-resume behavior:

```text
node scripts/release.mjs --resume [--dry-run] --plugin <name> <X.Y.Z>
```

`--resume` requires an explicit semver. Before full CI, any file write, or any
local/remote mutation, it resolves each direct `node`, `git`, `claude`, `gh`,
and `sleep` executable to one absolute realpath and reuses those identities
throughout. If `DOCKS_RELEASE_EXPECT_NODE`, `DOCKS_RELEASE_EXPECT_GIT`,
`DOCKS_RELEASE_EXPECT_CLAUDE`, `DOCKS_RELEASE_EXPECT_GH`, or
`DOCKS_RELEASE_EXPECT_SLEEP` is present, the resolved identity must equal that
absolute realpath. It rejects inherited Git routing/configuration and requires
the caller's canonical repository/worktree/object directory, disabled hooks and
attribute file, literal pathspecs, disabled optional locks, and explicit release
identity before it classifies state. In particular, every `GIT_AUTHOR_*`,
`GIT_COMMITTER_*`, and `EMAIL` override is absent, and both effective `git var`
identities match the controlled release name/email before any commit object is
created. It also requires exactly one origin fetch
URL and effective push URL equal to
`git@github.com:DocksDocks/docks.git`, the canonical main tracking configuration,
and GitHub repository `DocksDocks/docks`; every `gh` call uses explicit
`--repo DocksDocks/docks` and every Git push uses an explicit source:destination
refspec. Every singleton tracking key is read with `git config --get-all` and
must contain exactly one LF-free value equal to the canonical value; a duplicate
expected or additional value rejects. It accepts only this ordered closed state
machine for the selected plugin:

```text
clean previous version
  → exact ordered dirty projection prefix 1…N
  → exact complete dirty version projection
  → exact fully staged version projection
  → exact single-parent release commit
  → remote main at that commit
  → exact local tag (optional interrupted state)
  → remote tag at that commit
  → tag CI pending/running
  → tag CI success
  → non-draft, non-prerelease GitHub Release at that tag
  → released linear descendant with release paths unchanged
```

The clean prior state and every later state are classified before running the
next arrow. The ordered release-path vector is the selected plugin's Claude
manifest, its one Claude marketplace row, then its Codex manifest when present.
Each JSON file publication uses an exclusive same-directory regular temporary,
preserves the exact committed mode, writes and fsyncs the complete expected
bytes, atomically renames, and fsyncs the parent directory. Every exact vector
prefix from one changed path through the complete projection is a resumable
state. For ordinal `i`, the sole reserved temporary is the same-directory path
`.<target-basename>.docks-release-<plugin>-<version>-<i>.tmp`; no glob, random
suffix, or alternate name is legal. It is created with `O_EXCL|O_NOFOLLOW`, is
a regular non-symlink one-link file owned by the effective uid/gid, and after
write has the target's exact committed mode and expected complete bytes. On
restart it is accepted only when every earlier ordinal is already published,
its own target is still the exact parent bytes, and no other reserved release
temporary exists in any affected directory; that exact state finishes the
rename/fsync transition. A target already at new bytes plus a surviving temp,
wrong name/ordinal, duplicate, symlink, owner, link count, mode, byte, or
unexpected reserved temp rejects without cleanup or mutation. Any out-of-order
path or non-version delta also rejects. Before any projection write, each closed
release path must have an
empty `git check-attr -a` result under the controlled environment. The release
commit must have the
existing exact subject, one parent, and only those paths/deltas. Remote main may
be exactly the parent only before the guarded push, then must equal the release
commit. The local tag must be one annotated tag object whose header names the
exact release commit/type/tag, whose tagger has the controlled name/email, and
whose message is exactly `<plugin> plugin <version>` plus LF. The remote
unpeeled `refs/tags/<tag>` OID must equal that local tag-object OID, and the
separately queried local/remote peeled OIDs must equal the release commit. A
lightweight tag or same-name/same-commit tag object with any different tagger or
message rejects; matching only the peeled commit is never release identity.

After the complete worktree projection, exact `git add -- <ordered-release-paths>`
has one separately classified result: HEAD remains the prior commit, all and
only the ordered release paths are staged with the exact new bytes/modes, and
the worktree has no difference from that index. The pre-add complete-dirty and
post-add fully-staged pairs are both resumable; any partial stage, other index
entry, worktree/index disagreement, untracked path, or residual `index.lock`
rejects. A restart from the staged state reruns local CI, revalidates the exact
index/worktree/HEAD triple, and executes only the release commit arrow. Focused
fault injection covers before/after add and before/after commit, so an
interruption cannot force the implementer to invent index recovery policy.

Every real invocation whose state precedes remote-tag publication runs the full
local `node scripts/ci.mjs -q` exactly once after classification, binds the
passing result to the re-read exact candidate projection/tree, reclassifies, and
permits only that process to advance the next mutation. Every restart before
remote-tag publication repeats local CI; no process-local prior result is
trusted. Once the remote tag exists, only its authoritative tag CI may authorize
GitHub Release creation, and local CI does not substitute for it.

Resolve the exact `ci.yml` workflow database id in repository
`DocksDocks/docks`, then select CI by that workflow id, exact tag commit SHA,
`event=push`, and `headBranch=TAG_NAME`. Exactly one database id may match;
reruns are later attempts of that same id and only its latest terminal attempt
counts. A different tag at the same commit, a second matching database id,
wrong workflow/repository/branch/event/SHA, or any terminal conclusion other
than `success` is STOP. The resume path never
moves/deletes a tag, force-pushes, silently bumps again, or creates a release
without green tag CI. If CI is green and the GitHub Release is absent, it
reconstructs the existing release script's deterministic notes and creates it
once. Exact already-released state exits 0 before full CI and without writes.
An exact released descendant is also read-only/idempotent: the immutable release
commit is derived from the tag; it is an ancestor of current `main`; remote main
equals either that release commit or current HEAD and is never any third value;
the Q tail is linear and within budget; no selected release path changed in the
release-commit→HEAD range; and every selected release path is clean in the index
and worktree. For Docks 0.12.6, a local descendant while remote main remains at
the release commit is accepted only when the separately pinned `repair-state`
helper validates current HEAD as one exact `d1|armed|terminal|f` Q-tail state;
`q` is legal only when current HEAD is the release commit. Non-release dirt may
exist only for later lifecycle recovery and is not release authority. Before release completion,
unrelated dirt, divergent
remote, wrong commit/tag, duplicate/mismatched release, or any unknown
intermediate state exits before the next mutation.

`--dry-run --resume` performs the same classification and prints exactly the
current state plus next closed action without running full CI or changing files,
refs, remotes, CI, or releases. Focused tests use a disposable Git
repository/bare remote and closed fake Claude/GitHub commands to interrupt
after each arrow, then prove the identical invocation converges to released;
fault injection also covers before/after every per-file temp/write/fsync/rename/
directory-fsync boundary. Every invalid prefix/cross-product rejects. The test
also proves each expected-tool identity mismatch, release-path attribute,
inherited Git redirect, wrong origin/GitHub repository, same-commit wrong-tag CI,
duplicate run id, rerun attempt, and missing/failing local CI rejects before the
next mutation.
This generic path is used first by Docks 0.12.6 and later by the
already-authorized Session Relay release, giving the release sequence a tested
restart boundary instead of a one-shot command.

### Closed compatibility test modes

`testExecutionCompatibility(mode)` accepts only the internal literals `live`
and `portable`. The explicit existing selector
`--case execution-compatibility` always passes `live`; a new
`--case execution-compatibility-portable` selector always passes `portable`.
The no-argument harness and every mutation-driver child invoke only the portable
selector, so default/full/tag CI has no host-version dependency. Local A2 alone
invokes the live selector. Portable mode runs every deterministic shared case
and source-proves the exact ordered live-only case vector remains composed;
live mode adds the pinned Git/util-linux/Bash/coreutils/compiler/glibc recovery
probes. No environment variable, host autodetection, missing argument, or
fallback chooses the mode, and malformed/duplicate selectors reject.

### Pinned helper Git subprocess

The review-policy helper adds one closed internal environment input,
`DOCKS_REVIEW_POLICY_GIT_BIN`. When present it must be one absolute canonical
regular executable path and every helper Git subprocess uses only that path;
when absent, existing portable author-tool behavior remains unchanged. The live
handoff passes the already validated `$GIT_BIN` on every source and installed
helper invocation, rechecks the path/version before classification/application,
and never relies on `PATH` for helper Git. A PATH-shadow fixture proves
`repair-state`, all D1/F/T builders, `cache-set`, and `execution-range` either use
the pinned Git or reject before an output can authorize a write.

### Restart classifier

Add one internal read-only CLI surface:

```text
review-policy.mjs repair-state <repo> <reviewed-head> <plan-path>
  <prerequisite-commit>
```

It runs the same bounded linear target-path traversal and emits one closed
`LegacyFinalReviewRepairStateV1` compact-JCS object:

```json
{"attempt_commit":null,"execution_review_commit":null,"prerequisite_commit":"<Q>","repair_commit":null,"schema":1,"state":"q","terminal_commit":null}
```

`state` is exactly `q|d1|armed|terminal|f`. Q has all four nullable commits
null; D1 sets only `repair_commit`; armed sets `repair_commit=D1` and
`attempt_commit=W`; terminal adds `terminal_commit=T`; repair-path F instead
adds `execution_review_commit=F`. No-repair F sets only
`execution_review_commit=F`. The command validates exact Q,
authorization-bound D1, the unique closed W, either T variant, or findings-free
F bytes before returning the state. Existing W always returns `armed` and never
launch authority. Mixed paths, merges, a second repair/W/F, malformed W/T/F,
wrong request/dispatch binding, unknown target bytes, a non-descendant head, or
more than 4,096 inspected commits fail without output. This is an internal
operational projection, not a change to `LegacyExecutionRangeValidationV1` or
any public receipt schema.

The D/F classifier stops at the first exact valid F. Commits after F are not D,
and this compatibility feature neither authorizes nor rejects their plan deltas.
It preserves the existing generic plan-manager path: implementation accounting
and Step/evidence updates retain F and compatibility records, plan-manager makes
the plan-only `in_review` transition, completion preparation validates that
post-F reviewed head, and the exact completion receipt may then be applied.
Generic execution-scope, lifecycle, completion-diff, receipt-reuse, and review
checks continue to govern those bytes. The frozen no-repair golden records
complete compact-JCS execution-range output at F, after a real plan-only
execution-accounting/Step update, at `in_review`, and after the exact completion
receipt; every output retains the original F identity.

### Commit traversal

Strict/frozen no-repair validation runs first and still requires F to be Q's
immediate raw child; its existing intervening-empty/unrelated-commit negatives
remain byte-for-byte. Only the exact authorization-bound repair branch uses an
internal traversal from Q exclusive until the first valid F/T or requested
pre-F head. It classifies every commit by both
`changedPaths(parent, commit)` and its raw commit message so W cannot hide among
otherwise unrelated empty commits. Inspect at most 4,096 total repair-branch
commits, at most one D1, and at most one W before F/T.

- Reject a merge/multiple-parent commit on the inspected ancestry.
- On the repair branch, ignore a commit whose changed paths exclude the target plan only after
  rejecting any malformed/duplicate/misplaced reserved W prefix. Exact W counts
  toward the traversal bound and must be D1's direct empty child.
- Reject a target-plan commit whose changed paths are not exactly `[PLAN_PATH]`.
- Reject exactly 4,097 inspected repair-branch commits, a second target-plan repair/W before
  F/T, W on the no-repair path, and F/T whose direct parent is not W on the
  repair path.
- Final `execution-range` validation rejects no exact F before the bound.
  Read-only `repair-state` instead permits only an exact validated incomplete
  Q, D1, armed-W, or terminal-T prefix at the requested head and returns that
  state; it never grants launch or execution authority. Both reject a head not
  descending from Q.
- Once F is found, return to the unchanged generic post-F
  execution-accounting/`in_review`/completion path; do not feed later plan
  commits into D/F classification or invent a compatibility allowlist for them.

The first qualifying target-plan commit is F only when its persisted
findings-free `dual|single` receipt reviews the exact preceding plan-changing
commit and its bytes equal only `replaceDraftReceipt(input, receipt)` followed
by `appendSelfReviewAttribution(...)` plus the already-supported optional
frontmatter `updated` normalization. On the repair path, F is W's direct child
and its request/dispatch hashes equal W while `reviewed_commit=D1`; on the
  no-repair path, F remains Q's immediate raw child and W/intervening commits
  retain the frozen rejection. The
sole earlier target-plan commit may be exact D1; terminal T or any other second
target-plan delta rejects as success.

### D1 repair invariant

Compare Q bytes with D1 bytes and
require all of the following from parsed raw structure, not broad regex:

1. The raw frontmatter key vector/order is exact. Parsed values and raw lines are
   exact except one valid ISO `updated` replacement.
2. The ordered unique H2 heading vector, preamble, and every unlisted partition
   are exact. Added, deleted, duplicated, or reordered headings fail.
3. The Steps table header, row identifiers/count/order, and every non-P row are
   exact. P remains unique with Files, Depends, Status=`done`, command/path/hash
   tokens, receipt tokens, STOP clauses, and no-acceptance-event clause exact.
4. D1 must apply the exact Q-byte policy migration M1–M10 below together with
   the accepted stale-status repair M11–M12. M1–M10 are separately authorized
   protocol alignment required to make D/F prose truthful; they are bound by
   the closed authorization rather than rediscovered by a later reviewer.
   M11–M12 are the reproduced S1 repair.
   No plan-manager prose choice remains. D1 may append no other Self-review or
   Mistakes text.
5. `## Goal`, `## Interfaces & data shapes`, `## Acceptance criteria`,
   `## Execution gate catalogue`, `## Out of scope / do-NOT-touch`,
   `## Global constraints`, `## STOP conditions`, and `## Review` are exact in
   D1. Its explicit P fragments are the sole Steps exception.
6. Compare an ordered raw evidence vector before/after D1: every unfenced
   machine-record line; compatibility material/application/receipt and binding;
   the prerequisite fenced receipt; Review/Bootstrap/Completion records; and
   every Cross-check-family line. Add/delete/duplicate/reorder/mutate all fail.
7. At least one allowed non-`updated` byte changes. An updated-only, receipt-only,
   or evidence-only D1 is rejected.

### Exact D1 application

Each `before` and `after` below is an exact LF UTF-8 substring with no implicit
leading/trailing whitespace or newline. Each `before` occurs exactly once in Q;
apply M1→M12 in order, reject a missing/duplicate selector, and permit only one
independent ISO `updated` replacement. The compact JCS of this ordered array has
SHA-256 `a8634397344fe9f5c9ca05422ce41be2bd1a418a275b8c3791b63f1595af6cf0`.

```json
[
  {"id":"M1","before":"Final ordinary review seals Q, then plan-manager commits only the mandatory derived Cross-check attribution, replacement schema-v1 `Review-receipt:`, and optional `updated` as F.","after":"Final ordinary review seals the exact final-review input I (Q when no repair is needed, otherwise D1), then plan-manager commits only the mandatory derived Cross-check attribution, replacement schema-v1 `Review-receipt:`, and optional `updated` as F.","before_sha256":"604a6f8a94b680c7457cf61295232345364d081c5bf6e0d2b575874c5ac68bdc","after_sha256":"ae443fe3c4c27fc13bd63143191cfa18e4432d4007a49205d7e1c4e787eb7e9a"},
  {"id":"M2","before":"the receipt's `reviewed_commit=Q`, findings-free `dual|single`, and retained E/R/B/Q bytes.","after":"the receipt's `reviewed_commit=I`, findings-free `dual|single`, retained E/R/B/Q bytes, and exact D1 bytes when present under the released single-repair policy.","before_sha256":"ee4eec41b37cb4fe224e79ca658509bb76b6944a16e5fbcd3f2e478d276ded07","after_sha256":"c21e1faa86cb8108e4db7890ff5e8f8a3e41c083c0e1cedca2cb2ba0808c15e0"},
  {"id":"M3","before":"(5) ordinary findings-only review the exact Q blob, require `dual|single`, apply its mandatory attribution and replacement receipt, and commit F.","after":"(5) when the released closed repair authorization applies to exact Q, apply exact D1 without an intervening Q review, review exact D1 once, and commit F only from a fresh findings-free `dual|single` result; any other D1 review result commits terminal blocked T and stops; when the repair authorization does not apply, preserve the no-repair Q→F path.","before_sha256":"b2b7c9b91d77d933bfdda198a03df05a9e97d4d4b828343fd26e09429a1a0345","after_sha256":"329e9174530b20c98370eb70eddf12df026922a309c29b17e8ed53926efc1594"},
  {"id":"M4","before":"No implementation path changes in E/R/B/Q/F.","after":"No implementation path changes in E/R/B/Q/[D1]/F.","before_sha256":"860b8bc7a97179cdb5e852b573e21b8ebe0179f2a15f44502e411f8dca6dd509","after_sha256":"60dc385193c5bac3767cddb79d12b3748bad394ee92a45b6851347cb2a004cb6"},
  {"id":"M5","before":"require the ordinary F receipt to bind reviewed commit Q with findings-free `dual|single`.","after":"require the ordinary F receipt to bind reviewed commit I (Q or D1) with findings-free `dual|single`.","before_sha256":"2c094f692e57503f04de7f94cda079d2c6e4d796cb5717700d2d81b548e2f848","after_sha256":"d8e18964e02b1949226424f5646478bb6b10cd34bbe7fefe1ed042e8a1b7abb6"},
  {"id":"M6","before":"commit prerequisite closure Q with P `done`, then obtain findings-free final ordinary review F","after":"commit prerequisite closure Q with P `done`, apply the exact authorized final-review repair only through optional D1, then obtain findings-free final ordinary review F","before_sha256":"d0c2f5df598522a07dae42806bb6fa43d9f862904a5b8912898be63fce546ad2","after_sha256":"3a7dc9e3e9f64c557e9b58d58bc7ddb8ea50379c70b49962282fe46dc4acba3d"},
  {"id":"M7","before":"plan-manager-only E/R/B/Q/F writes","after":"plan-manager-only E/R/B/Q/[D1]/F writes","before_sha256":"d478a4b36cc0819c9701efb42dc6ab30161ae89f2dfd05399ee8917e7cd07399","after_sha256":"b0e8e961b2e3ce37e44a705063dcbbff278beacdee84e7c02fdea59e878635fa"},
  {"id":"M8","before":"F's findings-free `dual|single` receipt reviews Q.","after":"F's findings-free `dual|single` receipt reviews D1 when the exact authorized repair exists, otherwise Q.","before_sha256":"f4b38a2f8790df6fa4c68978e02f4cac73d2142f49ae9493a0b5c8baed67bf73","after_sha256":"58bbbf7c979ad4bb050dd0529d1a91fc610073cd9f1e34da1540bee399918d94"},
  {"id":"M9","before":"The current plan retains exact E material/receipt, immutable R review, B binding, Q prerequisite evidence, and F receipt.","after":"The current plan retains exact E material/receipt, immutable R review, B binding, Q prerequisite evidence, exact validated D1 when present, and F receipt.","before_sha256":"5501857d0c8ab4788b1e263ab680bb1df4fa50a3bed3cbbf60aaa3696088dc99","after_sha256":"2a831695dcc1ffd07ee7f5a1411218d8a5e1b53b87961a0c62badfc44a4a423c"},
  {"id":"M10","before":"E/R/B/Q/F gap","after":"E/R/B/Q/[D1]/F gap","before_sha256":"f0a893512debef727bc44d12569d78672a645bdaae4a562bdae67908daeef018","after_sha256":"3cccfc4350b7dda362f4c58a562f2b6b1666b21966dae94ad5d693d3c41eaefa"},
  {"id":"M11","before":"Execution stays paused until the related Docks compatibility policy is independently reviewed, released, installed, and this plan carries eligible compatibility evidence plus a fresh ordinary review receipt.","after":"The compatibility policy is independently reviewed, released, installed, and Q carries eligible compatibility evidence; execution stays paused only until exact D1 repairs the durable stale-status finding and a fresh findings-free ordinary review receipt is applied as F.","before_sha256":"a525e95609c272329ae346fe7991da03bcb481e84bbd0385e5fa7730bf028703","after_sha256":"d614a10a4055d7a2af0b308c87f07e8f5f51b54df677b3cf83282bffee56a5e9"},
  {"id":"M12","before":"Author self-score: **99/100 (Draft-45 prerequisite-constructor alignment, blocked on exact-byte review and Step P)** · trajectory **97→fresh reviews NOT READY→99** · stopped: **plateau (K=3)**. Execution eligibility requires the released validator, exact E/R/B/Q/F chain, and F commit/blob as sole dispatch authority.","after":"Author self-score: **99/100 (Draft-45 prerequisite complete; blocked only on final-review repair and exact-byte re-review)** · trajectory **97→fresh reviews NOT READY→99** · stopped: **plateau (K=3)**. Execution eligibility requires the released validator, exact E/R/B/Q/[D1]/F chain, and F commit/blob as sole dispatch authority.\n\n**Draft-46 final-review repair (2026-07-14):** a fresh exact-Q S reviewer scored 94 NOT READY with one medium finding, S1; main-context reproduction accepted it. Step P and Docks 0.12.5 are complete, but the cold-read and author-score status remained stale. The released single-repair policy permits this exact plan-only D1 migration: Environment and Step P now describe Q→[D1]→F, the stale status prose records the completed prerequisite and pending final review, and all E/R/B/Q evidence, implementation contracts, Goal, steps, acceptance schedule, and source-versus-packaged boundary remain exact. A fresh findings-free review of D1 must bind D1 before F can authorize execution; any other D1 review result writes terminal blocked T and stops.","before_sha256":"8365ebb88d0363e530237396294e2a15b4d9e0aeccfe8c43080cd2d2c97abdfa","after_sha256":"d48deb3130b60d21acf7b3a537bd9e0f2ad9b5e7d74d6d0614e17ce09d1e14d1"}
]
```

After normalizing D1's `updated` raw line back to Q's exact raw line, the full
D1 plan blob SHA-256 is
`7eb0b926d5d56fa993dde7663df6dded9a9dd51b87b451714f47d6e15dcc847e`.
Its canonical plan input SHA-256 is
`e6d9d3b571d268603a282dfa9edeb01e09c2e73f4137eed752e935e7009f56bc`.
The sample fixture contains the exact Q fragments and the frozen compatibility
fixture stores both expected D1 hashes; duplicate/missing selector, order,
substring, Unicode, LF, and postimage mutations reject.

The helper proves this deterministic byte transform, not Git authorship. D1 is
authorized only by the durable S1 in this plan; any other valid negative result
is preserved by terminal T instead of authorizing another repair.

### Final receipt binding

F uses the existing schema-v1 draft receipt. Its `reviewed_commit`, request
`reviewed_commit_or_head`, and `input_sha256` must bind D1 (or Q) and that exact
canonical plan view. Every passed reviewer is `ready` with zero findings; the
outcome is `dual|single`. The F delta remains receipt replacement, canonical
attribution append, and optional `updated` only.

### Frozen compatibility evidence

`scripts/tests/fixtures/plan-review-policy/legacy-0.12.5-no-repair.json`
contains the immutable 0.12.5 policy JCS/hash, a deterministic no-D E/R/B/Q/F
fixture identity, and exact compact-JCS `LegacyExecutionRangeValidationV1`
outputs for F head, an unrelated non-plan descendant, a real plan-only
execution-accounting/Step update, the subsequent `in_review` transition, and
the existing accepted completion-reuse head. It also stores the normalized D1
blob and canonical-input hashes above. The new helper must reproduce every
golden byte-for-byte before the D1 positive is considered.

## Steps

| # | Task | Files | Depends | Status | Done condition / STOP trigger |
|---|---|---|---|---|---|
| 1 | Implement the bounded pre-authority traversal and restart classifier, closed repair authorization, exact D1, creator-only empty-W arm, lock-held D1/W/F/T CAS protocol, typed/indeterminate T union, atomic-worktree recovery, dispatch-realization and cache-set validators, resumable release publication, and frozen goldens while preserving public schemas and generic post-F lifecycle. | `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs`; `scripts/release.mjs`; `scripts/repair-plan-worktree.mjs`; `scripts/tests/fixtures/plan-review-policy/sample-plan.md`; `scripts/tests/fixtures/plan-review-policy/legacy-0.12.5-no-repair.json` | — | planned | Frozen no-repair Q→F immediate adjacency and negatives remain exact. Repair positives pass Q→unrelated→D1→W→F at F, at an unrelated post-F descendant, after real accounting/Step and `in_review`, and after completion receipt; `repair-state` exact-matches q/d1/armed/terminal/f. A validated fixed fd 8 on the common-directory inode serializes the live transaction and is closed in every descendant; each exact shared-object/ref/index/worktree/cache writer acquires validated fixed fd 9 on the canonical `objects/` inode before any writer child exists, then gives the actual command a fresh parent-death binding while Bash and the command retain the same fence. A new primary owner drains fd 9 before classification, so holder death cannot race a surviving writer, and TERM cleanup leaves no ref/index lock. Worktree synchronization uses the dedicated durable-intent helper for an atomic same-filesystem replacement, then exact Git performs an index-only atomic restore; only old/old, old-index/new-worktree, and new/new are accepted, while the reverse pair and arbitrary partial/missing bytes reject. Every application blob is raw-hashed and written with `--no-filters`. Generic `release.mjs --resume` validates and advances only exact clean-bump/dirty-bump/local-commit/pushed/local-tag/remote-tag/green-CI/released states without moving a tag or repeating a release. W is D1's direct empty CAS child; its complete request and X/S dispatch plan must be exactly realized by F or typed T; existing W never launches. D1/F/T use the exact result-evidence union, literal builder invocations, private-index expected-parent CAS, and exact `clean|sync_head` recovery. q/d1/armed count checks reserve 3/2/1 commits immediately before writes. Crash/uncertainty intervals become T; T winning rejects late F; wrong authorization/W/result key/hash/evidence, stale CAS, primary/fence contention, inode/descriptor/holder-death/writer-cleanup behavior, Git environment/filter redirection, dirty-path escape, dispatch deviation, malformed/nonempty/duplicate/misplaced W, limit+1, mixed-path/merge, second D/W, T as success, protected/evidence delta, stale/non-ready/finding F, altered attribution, and second F fail. Canonical cache-set and all explicit activation predicates pass; invalid file/cache cases fail. If D1/W/F/T cannot be distinguished without a public-schema or protected-contract change, STOP. |
| 2 | Update all source/shipped policy surfaces after the internal primitives exist, so frozen immediate Q→F and exact repair Q→…→D1→W→F/T contracts are available before tests or release. | `docs/plans/AGENTS.md`; `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md`; `plugins/docks/skills/productivity/plan-init/SKILL.md`; `plugins/docks/skills/productivity/plan-manager/SKILL.md`; `plugins/docks/skills/productivity/plan-review/SKILL.md` | 1 | planned | Source/template repair prose is byte-identical, the focused surface case proves parity, plan-manager remains sole writer/reconciler and alone owns the repository lock, D1/W/result compare-and-swaps, creator-local launch authority, worktree synchronization, and terminal T; plan-review/helper builders remain evidence-only and never update Git/source; `docs/plans/AGENTS.md` stays at most 500 lines; its `CLAUDE.md` remains exactly `@AGENTS.md`; and only the three intentionally changed skill hashes require maintenance. `context-tree refresh docs/plans` is not run because the skill excludes the existing `docs/plans/` node. |
| 3 | Extend deterministic focused and mutation coverage without adding a second baseline, nested pool, or serial fallback. | `scripts/tests/plan-review-policy.mjs`; `scripts/tests/plan-review-policy-regressions.mjs` | 1, 2 | planned | A fast focused regression-contract case exact-checks the frozen 57-label prefix, 12-label suffix, full 69-label vector, uniqueness, hashes, selectors, and CI composition. Direct focused cases cover every raw D1 structural/evidence mutation; frozen no-repair raw adjacency; wrong authorization; fixed-fd contention/release and delayed-generation rejection; every shared writer; ambient Git routing/config/hook/filter redirection; raw `--no-filters` blob identity; all four index/worktree pairings with the reverse pair rejected; atomic worktree-intent recovery at every helper boundary; real index-only Git publication/cleanup; W CAS/shape/message/request/dispatch/order/duplicate negatives; dispatch-ledger deviation; state-count q/d1/armed boundaries; T-wins/late-F and competing-T CAS; pre/post-CAS crashes with staged/unstaged/untracked/path/mode recovery negatives; exact resumable-release states and invalid mixed states; both T variants; every post-W uncertainty interval; terminal-T success attempt; F/current/unrelated-descendant identity on no-repair and repair histories; cache schema predicate/file negatives; standalone `set -e` assertions; and silent/partial-output Git-preflight failure. Default/full/tag CI runs the portable compatibility mode and source-proves exact live-mode composition; local A2 alone runs the pinned live-host probes. The one separately required full CI run executes all 69 mutations once through the existing machine-aware pool with declaration-order output, first-failure reporting, and owned-root cleanup unchanged. |
| 4 | Independently verify the worker diff and ordered acceptance inventory, run the separately recorded full CI once, then complete-review and ship the plan. | This plan; the twelve implementation paths above read-only during verification; lifecycle target path immutable evidence-only | 1, 2, 3 | planned | Main context reproduces every claim and A1–A9 in order, including A8's history-sensitive execution-range proof and A9's Q-tail ancestry/merge/touch/budget proof, `node scripts/ci.mjs` exits 0 once after them, completion review passes, and the plan archives with an exact `ship_commit`. Any target-plan change before post-ship handoff, unexplained scope expansion, weakened negative, or worker plan edit is STOP. |

For Step 3, “exact resumable-release states and invalid mixed states” includes
closed release-path attribute rejection, every expected-tool identity mismatch,
every inherited Git-routing/configuration input, interruption after each state
arrow, every invalid state cross-product, and exact already-released idempotence
without full CI or a write. It also includes the actual fresh-Bash boundary under
a shadowed `PATH`; duplicate values for every singleton Git configuration key;
wrong-name/duplicate/symlink/owner/link/mode/byte release temporaries; every
pre/post-add and pre/post-commit staged-index boundary; candidate-bound full CI
before D1, W, F, and both T variants, including deterministic
`candidate_ci_failed` recovery after W; lightweight and same-commit/different-
object annotated tags; and remote main at either the immutable release commit or
the exact validated local q/d1/armed/terminal/f descendant, with every other
remote/local cross-product rejected.
These are focused subcases under the existing relevant mutation labels, not new
top-level labels: the frozen 57-label prefix, 12-label suffix, 69-label total,
and their three hashes do not change.

The mandatory existing mutation prefix is exactly:

```json
["passed not_ready regression","vacuous acceptance inventory","acceptance command substitution","raw source plan ancestor defenses","sealed plan-view semantic binding","sealed reviewer-schema semantic binding","requested-row coverage binding","sealed file hash regression","execution range validator regression","planned-base completion diff regression","read-only wrapper claims primary writes","Claude evidence wrapper regains Bash","JCS lone-surrogate value regression","JCS lone-surrogate key regression","GitHub publishing contract loss","CI focused surfaces call removed","CI regression-driver call removed","CI no-argument full policy-harness duplicate restored","compatibility authorization-id regression","compatibility authorization-plan regression","compatibility authorization-planned regression","compatibility authorization-execution regression","compatibility stored authorization-digest regression","prerequisite failed-child regression","canonical cache file regression","remote main exact-row regression","remote tag exact-row regression","release projection regression","Codex plugin uniqueness regression","observation self-hash regression","prerequisite receipt self-hash regression","canonical remote config count regression","canonical remote tag loses peeled pattern","Completion Review accepted-order regression","Completion Review rejected-order regression","Completion Review reproduced-order regression","Completion Review special-character quoting regression","completion-stable Review removal regression","execution scope transient-path regression","execution scope sealed-manifest regression","legacy creation and start shape regression","legacy section-vector and transition-diff regression","compatibility copied-artifact isolation regression","compatibility GIT_ATTR_NOSYSTEM child-isolation regression","compatibility E reconstruction regression","compatibility findings-free regression","compatibility adjacency and plan-only regression","compatibility binding record regression","prerequisite Q marker and delta regression","final F receipt and delta regression","stored prerequisite closure regression","completion Review reuse byte checks regression","execution scope chronological empty-ledger regression","strict corpus identity regression","strict raw result comparison regression","closed selector fallback regression","malformed acceptance source table"]
```

It has 57 unique labels and compact-JSON SHA-256
`2f73fb7a6bcacd417867e83fb5ba767e10601fe4d1e8dc0c305b112c4201b102`.
No legacy label may be deleted, replaced, or reordered. The mandatory new
suffix is exactly:

```json
["tail commit bound","repair count bound","repair plan-only path","repair structural partitions","repair evidence vector","final receipt input binding","final ready findings-free gate","legacy no-repair golden","post-F completion reuse","legacy policy constant freeze","repair policy surface parity","material repair requirement"]
```

Its compact-JSON SHA-256 is
`e6c8b0ed8fc087ccbc885cb4619e1f985eb1f743d16ca585b9410c6eba8a514d`.
The exact unique 69-label concatenation has compact-JSON SHA-256
`7c21ace02c5769ae5e4ade2ddd37e5b63ef46e6fba39421797c84aadf7b18ee0`.

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node --check plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs && node --check scripts/repair-plan-worktree.mjs` | Exit 0 with no syntax error in either executable. |
| A2 | `node scripts/tests/plan-review-policy.mjs --case execution-compatibility` | This explicit live-host selector exits 0 only under exact Git 2.47.3, util-linux 2.41 `flock`/`setpriv`, Node 24.15.0, Bash 5.2.37, coreutils `env` 9.7, Debian `cc` 14.2.0, and glibc 2.41; injected version drift fails before recovery or classification, and Git's exact 15-name `rev-parse --local-env-vars` vector is frozen. Default/full/tag CI instead runs the deterministic portable compatibility mode and proves this live selector remains composed. Frozen 0.12.5 no-repair Q→F immediate-raw-child outputs and intervening-empty/unrelated negatives match byte-for-byte; repair authorization→unrelated→D1→W→F and exact-bound positives pass; `repair-state` exact-matches q/d1/armed/terminal/f. Direct disposable-repository fixtures prove primary fd 8 and writer fd 9 identify and lock the opened canonical directory inodes, reject path/descriptor replacement ABA, prevent primary inheritance, retain fd 9 in the actual writer and any child through `exec`, and reject a delayed old generation after it acquires fd 9 but before it creates a child. The wrapper rejects subshell/pipeline/background invocation and is paused deterministically before fd 9 acquisition, after acquisition/holder recheck but before writer fork, and after the child installs TERM/rechecks parent+fd but before command `exec`; both parent-race edges fail closed and every nonzero fence/child status propagates. Every Git-local input plus quarantine, namespace, system/global/config-key, attribute, literal-pathspec, optional-lock, discovery, and hook overrides fail before the first write; mutation after setup also fails the per-writer canonical repo/git-dir/common-dir/object-dir/worktree recheck. Unrouted fixtures prove the reader and shared-writer wrappers clear that full set, readers inherit neither fd, and only the three cache mutations retain fd 9 through descendant exit while receiving no repository routing. Every shared writer is exercised through the wrapper: W/result `commit-tree`, result `hash-object --no-filters -w`/`write-tree`, W/D1/F/T `update-ref`, the atomic worktree helper, index-only restore, and all three cache updates. A repository-local clean filter matching only temporary `plan.md` is never invoked; pre-write and written raw blob OIDs are equal. Real `git update-ref --stdin` cases stop after `prepare` with real ref locks. `scripts/repair-plan-worktree.mjs` is fault-injected through each durable-intent/create/write/fsync/rename/cleanup boundary: before rename the target remains the exact parent/current version, rename changes it atomically to the exact HEAD version, the reserved Git-dir staging directory is either absent or closed-valid/recoverable, and identical retry converges without accepting another path/byte/mode. The real exact `git restore --source=<commit> --staged -- <path>` is paused by an A2-only compiled interposer at Git's actual `rename(index.lock,index)` seam; the normal index and lock index respectively prove old/new exact plan blobs, target already equals the new exact bytes, TERM removes the lock, fd-9 drain completes only after Git/children exit, and retry converges to `clean`. Production contains no combined `--staged --worktree` restore; a control reproduces its target-missing partial state and proves the closed validator rejects it. An immediate new owner acquires only fd 8 and blocks on fd 9 until the prior command and inheriting children exit; no `*.lock`, partial target, late entrant, or late mutation remains. KILL leaves stale ref locks in the negative control and is forbidden. A stale-index control proves ordinary status may refresh index bytes, while the exact controlled environment plus `--no-optional-locks status` leaves index bytes and metadata unchanged. Further fixtures cover q/d1/armed count limits; stale D1/W result CAS; T-wins/late-F and competing-T; private-index pre-CAS cleanliness; old/old, old-index/new-worktree, and new/new atomic states plus mandatory rejection of the reverse new-index/old-worktree pair; staged/unstaged/untracked/conflict/mode/path dirty rejection; immutable source-helper blob/mode checks before first execution; exact resumable-release states and invalid cross-products; exact Attempt/Dispatch/Stop/ResultEvidence/Application/Worktree key vectors, hashes, literal builder invocations, wrong-kind negatives, and armed-restart W extraction/evidence/builder/publication data flow; dispatch realization/fallback/retry and deviation; every post-W crash/output interval; both T variants; duplicate/nonempty/malformed/misplaced W; W on no-repair; second D/W; terminal T as success; closed ancestry/delta/evidence/receipt negatives; altered retained records; HEAD equal to F or an unrelated descendant on both branches; and all eight activation predicates plus cache file negatives. Exact Q is never re-reviewed; existing W never launches; any non-authorizing post-W state becomes T and cannot reach F. Silent/partial Git failures and standalone shell assertions propagate. |
| A3 | `node scripts/tests/plan-review-policy.mjs --case surfaces` | Exit 0; frozen immediate Q→F and repair Q→…→D1→W→F/T policy blocks are exact across source/template/plan-manager/plan-review surfaces, lock/CAS/worktree ownership and evidence-only builder boundaries remain exact, and CI contains exactly one focused surface call plus one regression-driver `--self-test` call. |
| A4 | `node scripts/tests/plan-review-policy.mjs --case regression-contract` | Exit 0 quickly without launching mutation children; the ordered legacy 57, new 12, and full unique 69 label vectors exact-match hashes `2f73fb7a6bcacd417867e83fb5ba767e10601fe4d1e8dc0c305b112c4201b102`, `e6c8b0ed8fc087ccbc885cb4619e1f985eb1f743d16ca585b9410c6eba8a514d`, and `7c21ace02c5769ae5e4ade2ddd37e5b63ef46e6fba39421797c84aadf7b18ee0`, and every new label maps to its required focused selector/anchor. The separately recorded full CI command owns the single 69-case execution. |
| A5 | `node scripts/skills/content-hash.mjs --check-only plugins/docks/skills` | Exit 0 after final metadata maintenance; all shipped skill content hashes are synchronized. |
| A6 | `node scripts/tree/guard.mjs` | Exit 0; context-tree node pairs are valid. Policy-block content parity is proved by A3. |
| A7 | `BASE="$(node --input-type=module -e 'import fs from "node:fs"; import { parsePlan } from "./plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs"; const x=parsePlan(fs.readFileSync("docs/plans/active/compatibility-final-review-repair-rung.md")).frontmatter.execution_base_commit; if(!/^[0-9a-f]{40}$/.test(x)) process.exit(1); process.stdout.write(x)')" && git diff --check "$BASE"..HEAD` | Exit 0; the exact committed execution range, not merely the worktree, has no whitespace errors. |
| A8 | `BASE="$(node --input-type=module -e 'import fs from "node:fs"; import { parsePlan } from "./plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs"; const x=parsePlan(fs.readFileSync("docs/plans/active/compatibility-final-review-repair-rung.md")).frontmatter.execution_base_commit; if(!/^[0-9a-f]{40}$/.test(x)) process.exit(1); process.stdout.write(x)')" && HISTORY="$(git rev-list "$BASE"..HEAD -- docs/plans/active/relay-worker-lifecycle-primitives.md)" && WORKTREE="$(git --no-optional-locks status --porcelain -- docs/plans/active/relay-worker-lifecycle-primitives.md)" && test -z "$HISTORY" && test -z "$WORKTREE"` | Exit 0 with empty history and worktree results; either Git failure propagates before the emptiness tests, the evidence-only target was never changed by any commit in the execution range even transiently and later reverted, and it has no current staged, unstaged, or untracked change. |
| A9 | `Q=2ebba5dda939ffd68594d505511cf142ea76ee66 && git merge-base --is-ancestor "$Q" HEAD && MERGES="$(git rev-list --merges "$Q"..HEAD)" && TOUCHES="$(git rev-list "$Q"..HEAD -- docs/plans/active/relay-worker-lifecycle-primitives.md)" && COUNT="$(git rev-list --count "$Q"..HEAD)" && test -z "$MERGES" && test -z "$TOUCHES" && test "$COUNT" -le 4090` | Exit 0; Git failures propagate, Q is an ancestor, the whole Q→completion-head tail is linear and target-untouched, and at least six of the 4,096 inspected-commit slots remain for completion receipt, archive, release, D1, W, and F. |

## Post-ship release and lifecycle handoff

This section is ordered operational work after this plan is archived; it is not
part of the completion acceptance inventory. From `main` in one of the exact
closed publication/recovery states below, plan-manager:

Step 1 runs in its own controlled subshell. Steps 2–5 run in one persistent
supervised shell so the lock-held Git identity and private activation paths
remain available. After any restart, rerun step 1 with the same `--resume`
invocation, then steps 2 and 3; all three are idempotent, and step 2 proves the
exact immutable release before refreshing.
Before a target-plan write, run step 4's exact `repair-state` command over the
Q→HEAD tail: exact Q applies D1 once; exact D1 may prepare and atomically arm W
once; only the W-creating process launches that prepared review; existing
`armed` always applies indeterminate T without launch; terminal T stops; exact F
skips review and proceeds to step 5; any other state fails before output. A
restart may reclassify/finish release publication, but never repeats a completed
release, reapplies D1, relaunches past W, recollects past T, or creates a second
F.

1. Runs this exact resumable publication proof in a subshell, so its closed Git
   environment cannot leak into the lock-held lifecycle stage. Any failed
   assertion stops before lifecycle Q changes:

   ```bash
   (
     set -euo pipefail
     Q=2ebba5dda939ffd68594d505511cf142ea76ee66
     PLAN_PATH=docs/plans/active/relay-worker-lifecycle-primitives.md
     GIT_ROUTING_INPUTS=(
       GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_CONFIG GIT_CONFIG_PARAMETERS
       GIT_CONFIG_COUNT GIT_OBJECT_DIRECTORY GIT_DIR GIT_WORK_TREE
       GIT_IMPLICIT_WORK_TREE GIT_GRAFT_FILE GIT_INDEX_FILE
       GIT_NO_REPLACE_OBJECTS GIT_REPLACE_REF_BASE GIT_PREFIX GIT_SHALLOW_FILE
       GIT_COMMON_DIR GIT_QUARANTINE_PATH GIT_NAMESPACE
       GIT_CONFIG_NOSYSTEM GIT_CONFIG_SYSTEM GIT_CONFIG_GLOBAL
       GIT_ATTR_NOSYSTEM GIT_ATTR_SOURCE GIT_CEILING_DIRECTORIES
       GIT_DISCOVERY_ACROSS_FILESYSTEM GIT_LITERAL_PATHSPECS GIT_OPTIONAL_LOCKS
       GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE
       GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_COMMITTER_DATE EMAIL
     )
     for GIT_ROUTING_INPUT in "${GIT_ROUTING_INPUTS[@]}"; do
       if [[ -v $GIT_ROUTING_INPUT ]]; then exit 1; fi
     done
     GIT_DYNAMIC_CONFIG_INPUTS=("${!GIT_CONFIG_KEY_@}" "${!GIT_CONFIG_VALUE_@}")
     test "${#GIT_DYNAMIC_CONFIG_INPUTS[@]}" -eq 0
     REALPATH_BIN=/usr/bin/realpath
     NODE_BIN=/home/vagrant/.nvm/versions/node/v24.15.0/bin/node
     GIT_BIN=/usr/bin/git
     JQ_BIN=/usr/bin/jq
     GH_BIN=/usr/bin/gh
     CLAUDE_BIN=/home/vagrant/.local/share/claude/versions/2.1.207
     SLEEP_BIN=/usr/bin/sleep
     for RELEASE_TOOL_BIN in "$REALPATH_BIN" "$NODE_BIN" "$GIT_BIN" "$JQ_BIN" \
       "$GH_BIN" "$CLAUDE_BIN" "$SLEEP_BIN"; do
       test -f "$RELEASE_TOOL_BIN"
       test -x "$RELEASE_TOOL_BIN"
       test ! -L "$RELEASE_TOOL_BIN"
       test "$("$REALPATH_BIN" "$RELEASE_TOOL_BIN")" = "$RELEASE_TOOL_BIN"
     done
     REPO_ROOT="$(pwd -P)"
     test "$("$REALPATH_BIN" "$REPO_ROOT")" = "$REPO_ROOT"
     test "$REPO_ROOT" = /home/vagrant/projects/docks
     GIT_DIR_ABS="$("$GIT_BIN" rev-parse --absolute-git-dir)"
     GIT_COMMON_DIR="$("$GIT_BIN" rev-parse --path-format=absolute --git-common-dir)"
     GIT_OBJECTS_DIR="$("$GIT_BIN" rev-parse --path-format=absolute --git-path objects)"
     test "$("$REALPATH_BIN" "$GIT_DIR_ABS")" = "$GIT_DIR_ABS"
     test "$("$REALPATH_BIN" "$GIT_COMMON_DIR")" = "$GIT_COMMON_DIR"
     test "$("$REALPATH_BIN" "$GIT_OBJECTS_DIR")" = "$GIT_OBJECTS_DIR"
     for RELEASE_SOURCE_REL in scripts/release.mjs scripts/lib/plugins.mjs scripts/lib/rust-bin.mjs plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs; do
       RELEASE_SOURCE_ABS="$REPO_ROOT/$RELEASE_SOURCE_REL"
       test -f "$RELEASE_SOURCE_ABS"
       test ! -L "$RELEASE_SOURCE_ABS"
       test "$("$REALPATH_BIN" "$RELEASE_SOURCE_ABS")" = "$RELEASE_SOURCE_ABS"
       RELEASE_SOURCE_TREE="$("$GIT_BIN" ls-tree HEAD -- "$RELEASE_SOURCE_REL")"
       test "${RELEASE_SOURCE_TREE%% *}" = 100644
       RELEASE_SOURCE_EXPECTED="$("$GIT_BIN" rev-parse "HEAD:$RELEASE_SOURCE_REL")"
       RELEASE_SOURCE_ACTUAL="$("$GIT_BIN" hash-object --no-filters -- "$RELEASE_SOURCE_ABS")"
       test "$RELEASE_SOURCE_ACTUAL" = "$RELEASE_SOURCE_EXPECTED"
     done
     export GIT_DIR="$GIT_DIR_ABS" GIT_COMMON_DIR GIT_WORK_TREE="$REPO_ROOT"
     export GIT_OBJECT_DIRECTORY="$GIT_OBJECTS_DIR"
     export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_COUNT=4
     export GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null
     export GIT_CONFIG_KEY_1=core.attributesFile GIT_CONFIG_VALUE_1=/dev/null
     export GIT_CONFIG_KEY_2=user.name GIT_CONFIG_VALUE_2=DocksDocks
     export GIT_CONFIG_KEY_3=user.email
     export GIT_CONFIG_VALUE_3=55303379+DocksDocks@users.noreply.github.com
     export GIT_ATTR_NOSYSTEM=1 GIT_NO_REPLACE_OBJECTS=1
     export GIT_LITERAL_PATHSPECS=1 GIT_OPTIONAL_LOCKS=0
     require_single_git_config() {
       if test "$#" -ne 2; then return 1; fi
       local values
       values="$("$GIT_BIN" config --get-all "$1")" || return 1
       test -n "$values" || return 1
       test "${values#*$'\n'}" = "$values" || return 1
       test "$values" = "$2" || return 1
     }
     require_single_git_config core.hooksPath /dev/null
     require_single_git_config core.attributesFile /dev/null
     require_single_git_config user.name DocksDocks
     require_single_git_config user.email 55303379+DocksDocks@users.noreply.github.com
     AUTHOR_IDENT="$("$GIT_BIN" var GIT_AUTHOR_IDENT)"
     COMMITTER_IDENT="$("$GIT_BIN" var GIT_COMMITTER_IDENT)"
     [[ "$AUTHOR_IDENT" =~ ^DocksDocks\ \<55303379\+DocksDocks@users\.noreply\.github\.com\>\ [0-9]+\ [+-][0-9]{4}$ ]]
     [[ "$COMMITTER_IDENT" =~ ^DocksDocks\ \<55303379\+DocksDocks@users\.noreply\.github\.com\>\ [0-9]+\ [+-][0-9]{4}$ ]]
     test "$("$GIT_BIN" branch --show-current)" = main
     ORIGIN_FETCH_URL="$("$GIT_BIN" remote get-url --all origin)"
     ORIGIN_PUSH_URL="$("$GIT_BIN" remote get-url --push --all origin)"
     test -n "$ORIGIN_FETCH_URL"
     test -n "$ORIGIN_PUSH_URL"
     test "${ORIGIN_FETCH_URL#*$'\n'}" = "$ORIGIN_FETCH_URL"
     test "${ORIGIN_PUSH_URL#*$'\n'}" = "$ORIGIN_PUSH_URL"
     test "$ORIGIN_FETCH_URL" = git@github.com:DocksDocks/docks.git
     test "$ORIGIN_PUSH_URL" = git@github.com:DocksDocks/docks.git
     require_single_git_config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
     require_single_git_config branch.main.remote origin
     require_single_git_config branch.main.merge refs/heads/main
     export GH_REPO=DocksDocks/docks
     "$GIT_BIN" merge-base --is-ancestor "$Q" HEAD
     MERGES="$("$GIT_BIN" rev-list --merges "$Q"..HEAD)"
     TOUCHES="$("$GIT_BIN" rev-list "$Q"..HEAD -- "$PLAN_PATH")"
     COUNT="$("$GIT_BIN" rev-list --count "$Q"..HEAD)"
     HEAD_VERSION="$("$GIT_BIN" show HEAD:plugins/docks/.codex-plugin/plugin.json | "$JQ_BIN" -er '.version')"
     test -z "$MERGES"
     case "$HEAD_VERSION" in
       0.12.5)
         test -z "$TOUCHES"
         test "$COUNT" -le 4092
         ;;
       0.12.6) test "$COUNT" -le 4096 ;;
       *) exit 1 ;;
     esac
     export DOCKS_RELEASE_EXPECT_NODE="$NODE_BIN"
     export DOCKS_RELEASE_EXPECT_GIT="$GIT_BIN"
     export DOCKS_RELEASE_EXPECT_GH="$GH_BIN"
     export DOCKS_RELEASE_EXPECT_CLAUDE="$CLAUDE_BIN"
     export DOCKS_RELEASE_EXPECT_SLEEP="$SLEEP_BIN"
     "$NODE_BIN" scripts/release.mjs --resume --plugin docks 0.12.6
     CURRENT_HEAD="$("$GIT_BIN" rev-parse --verify 'HEAD^{commit}')"
     RELEASE_VERSION="$("$JQ_BIN" -er '.version' plugins/docks/.codex-plugin/plugin.json)"
     CLAUDE_VERSION="$("$JQ_BIN" -er '.version' plugins/docks/.claude-plugin/plugin.json)"
     CATALOG_VERSION="$("$JQ_BIN" -er '.plugins[] | select(.name == "docks") | .version' .claude-plugin/marketplace.json)"
     export RELEASE_TAG="docks--v$RELEASE_VERSION"
     LOCAL_TAG_OBJECT="$("$GIT_BIN" rev-parse "refs/tags/$RELEASE_TAG")"
     RELEASE_COMMIT="$("$GIT_BIN" rev-parse "$RELEASE_TAG^{commit}")"
     test "$("$GIT_BIN" cat-file -t "$LOCAL_TAG_OBJECT")" = tag
     TAG_OBJECT_TEXT="$("$GIT_BIN" cat-file -p "$LOCAL_TAG_OBJECT")"
     mapfile -t TAG_LINES <<<"$TAG_OBJECT_TEXT"
     test "${#TAG_LINES[@]}" -eq 6
     test "${TAG_LINES[0]}" = "object $RELEASE_COMMIT"
     test "${TAG_LINES[1]}" = 'type commit'
     test "${TAG_LINES[2]}" = "tag $RELEASE_TAG"
     [[ "${TAG_LINES[3]}" =~ ^tagger\ DocksDocks\ \<55303379\+DocksDocks@users\.noreply\.github\.com\>\ [0-9]+\ [+-][0-9]{4}$ ]]
     test -z "${TAG_LINES[4]}"
     test "${TAG_LINES[5]}" = 'docks plugin 0.12.6'
     RELEASE_PATHS=(
       plugins/docks/.claude-plugin/plugin.json
       .claude-plugin/marketplace.json
       plugins/docks/.codex-plugin/plugin.json
     )
     RELEASE_STATUS="$("$GIT_BIN" --no-optional-locks status --porcelain=v1 -- "${RELEASE_PATHS[@]}")"
     RELEASE_TOUCHES="$("$GIT_BIN" rev-list "$RELEASE_COMMIT".."$CURRENT_HEAD" -- "${RELEASE_PATHS[@]}")"
     REMOTE_MAIN_RECORD="$("$GIT_BIN" ls-remote --heads origin refs/heads/main)"
     REMOTE_TAG_OBJECT_RECORD="$("$GIT_BIN" ls-remote origin "refs/tags/$RELEASE_TAG")"
     REMOTE_TAG_PEELED_RECORD="$("$GIT_BIN" ls-remote origin "refs/tags/$RELEASE_TAG^{}")"
     test -n "$REMOTE_MAIN_RECORD"
     test -n "$REMOTE_TAG_OBJECT_RECORD"
     test -n "$REMOTE_TAG_PEELED_RECORD"
     test "${REMOTE_MAIN_RECORD#*$'\n'}" = "$REMOTE_MAIN_RECORD"
     test "${REMOTE_TAG_OBJECT_RECORD#*$'\n'}" = "$REMOTE_TAG_OBJECT_RECORD"
     test "${REMOTE_TAG_PEELED_RECORD#*$'\n'}" = "$REMOTE_TAG_PEELED_RECORD"
     REMOTE_MAIN="${REMOTE_MAIN_RECORD%%$'\t'*}"
     REMOTE_TAG_OBJECT="${REMOTE_TAG_OBJECT_RECORD%%$'\t'*}"
     REMOTE_TAG_PEELED="${REMOTE_TAG_PEELED_RECORD%%$'\t'*}"
     RELEASE_URL="$("$GH_BIN" release view "$RELEASE_TAG" --repo "$GH_REPO" --json isDraft,isPrerelease,tagName,url --jq 'select(.isDraft == false and .isPrerelease == false and .tagName == env.RELEASE_TAG) | .url')"
     test -z "$RELEASE_STATUS"
     test -z "$RELEASE_TOUCHES"
     test "$RELEASE_VERSION" = 0.12.6
     test "$CLAUDE_VERSION" = 0.12.6
     test "$CATALOG_VERSION" = 0.12.6
     "$GIT_BIN" merge-base --is-ancestor "$RELEASE_COMMIT" "$CURRENT_HEAD"
     case "$REMOTE_MAIN" in "$RELEASE_COMMIT"|"$CURRENT_HEAD") ;; *) exit 1 ;; esac
     test "$REMOTE_TAG_OBJECT" = "$LOCAL_TAG_OBJECT"
     test "$REMOTE_TAG_PEELED" = "$RELEASE_COMMIT"
     REVIEW_POLICY_BIN="$REPO_ROOT/plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs"
     REPAIR_STATE="$(DOCKS_REVIEW_POLICY_GIT_BIN="$GIT_BIN" "$NODE_BIN" "$REVIEW_POLICY_BIN" repair-state . "$CURRENT_HEAD" "$PLAN_PATH" "$Q")"
     REPAIR_KIND="$(printf '%s' "$REPAIR_STATE" | "$JQ_BIN" -er '.state')"
     if test "$CURRENT_HEAD" = "$RELEASE_COMMIT"; then
       test "$REPAIR_KIND" = q
     else
       case "$REPAIR_KIND" in d1|armed|terminal|f) ;; *) exit 1 ;; esac
     fi
     test -n "$RELEASE_URL"
     COUNT="$("$GIT_BIN" rev-list --count "$Q"..HEAD)"
     test "$COUNT" -le 4096
   )
   ```

2. Runs this idempotent publication-verification, refresh, and activation-setup
   stage immediately after step 1 or after any restart once `0.12.6` exists.
   It never invokes the release command:

   ```bash
   set -euo pipefail
   PLAN_PATH=docs/plans/active/relay-worker-lifecycle-primitives.md
   Q=2ebba5dda939ffd68594d505511cf142ea76ee66
   GIT_ROUTING_INPUTS=(
     GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_CONFIG GIT_CONFIG_PARAMETERS
     GIT_CONFIG_COUNT GIT_OBJECT_DIRECTORY GIT_DIR GIT_WORK_TREE
     GIT_IMPLICIT_WORK_TREE GIT_GRAFT_FILE GIT_INDEX_FILE
     GIT_NO_REPLACE_OBJECTS GIT_REPLACE_REF_BASE GIT_PREFIX GIT_SHALLOW_FILE
     GIT_COMMON_DIR GIT_QUARANTINE_PATH GIT_NAMESPACE
     GIT_CONFIG_NOSYSTEM GIT_CONFIG_SYSTEM GIT_CONFIG_GLOBAL
     GIT_ATTR_NOSYSTEM GIT_ATTR_SOURCE
     GIT_CEILING_DIRECTORIES GIT_DISCOVERY_ACROSS_FILESYSTEM
     GIT_LITERAL_PATHSPECS GIT_OPTIONAL_LOCKS
     GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE
     GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_COMMITTER_DATE EMAIL
   )
   for GIT_ROUTING_INPUT in "${GIT_ROUTING_INPUTS[@]}"; do
     if [[ -v $GIT_ROUTING_INPUT ]]; then exit 1; fi
   done
   GIT_DYNAMIC_CONFIG_INPUTS=("${!GIT_CONFIG_KEY_@}" "${!GIT_CONFIG_VALUE_@}")
   test "${#GIT_DYNAMIC_CONFIG_INPUTS[@]}" -eq 0
   REALPATH_BIN=/usr/bin/realpath
   STAT_BIN=/usr/bin/stat
   READLINK_BIN=/usr/bin/readlink
   CUT_BIN=/usr/bin/cut
   DIRNAME_BIN=/usr/bin/dirname
   MKTEMP_BIN=/usr/bin/mktemp
   FIND_BIN=/usr/bin/find
   GREP_BIN=/usr/bin/grep
   WC_BIN=/usr/bin/wc
   FLOCK_BIN=/usr/bin/flock
   SETPRIV_BIN=/usr/bin/setpriv
   GIT_BIN=/usr/bin/git
   BASH_BIN=/usr/bin/bash
   NODE_BIN=/home/vagrant/.nvm/versions/node/v24.15.0/bin/node
   CC_BIN=/usr/bin/x86_64-linux-gnu-gcc-14
   GETCONF_BIN=/usr/bin/getconf
   ENV_BIN=/usr/bin/env
   RM_BIN=/usr/bin/rm
   JQ_BIN=/usr/bin/jq
   GH_BIN=/usr/bin/gh
   CODEX_BIN=/home/vagrant/.codex/packages/standalone/releases/0.144.3-x86_64-unknown-linux-musl/bin/codex
   CLAUDE_BIN=/home/vagrant/.local/share/claude/versions/2.1.207
   for REPAIR_TOOL_BIN in "$REALPATH_BIN" "$STAT_BIN" "$READLINK_BIN" \
     "$CUT_BIN" "$DIRNAME_BIN" "$MKTEMP_BIN" "$FIND_BIN" "$GREP_BIN" \
     "$WC_BIN" "$FLOCK_BIN" "$SETPRIV_BIN" "$GIT_BIN" "$BASH_BIN" \
     "$NODE_BIN" "$CC_BIN" "$GETCONF_BIN" "$ENV_BIN" "$RM_BIN" "$JQ_BIN" \
     "$GH_BIN" "$CODEX_BIN" "$CLAUDE_BIN"; do
     test -f "$REPAIR_TOOL_BIN"
     test -x "$REPAIR_TOOL_BIN"
     test ! -L "$REPAIR_TOOL_BIN"
     test "$("$REALPATH_BIN" "$REPAIR_TOOL_BIN")" = "$REPAIR_TOOL_BIN"
   done
   realpath() { "$REALPATH_BIN" "$@"; }
   stat() { "$STAT_BIN" "$@"; }
   readlink() { "$READLINK_BIN" "$@"; }
   cut() { "$CUT_BIN" "$@"; }
   dirname() { "$DIRNAME_BIN" "$@"; }
   mktemp() { "$MKTEMP_BIN" "$@"; }
   find() { "$FIND_BIN" "$@"; }
   grep() { "$GREP_BIN" "$@"; }
   wc() { "$WC_BIN" "$@"; }
   require_single_git_config() {
     if test "$#" -ne 2; then return 1; fi
     local values
     values="$("$GIT_BIN" config --get-all "$1")" || return 1
     test -n "$values" || return 1
     test "${values#*$'\n'}" = "$values" || return 1
     test "$values" = "$2" || return 1
   }
   test "$("$FLOCK_BIN" --version)" = 'flock from util-linux 2.41'
   test "$("$SETPRIV_BIN" --version)" = 'setpriv from util-linux 2.41'
   test "$("$GIT_BIN" --version)" = 'git version 2.47.3'
   test "$("$NODE_BIN" --version)" = 'v24.15.0'
   BASH_VERSION_TEXT="$("$BASH_BIN" --version)"
   BASH_VERSION_LINE="${BASH_VERSION_TEXT%%$'\n'*}"
   test "$BASH_VERSION_LINE" = 'GNU bash, version 5.2.37(1)-release (x86_64-pc-linux-gnu)'
   CC_VERSION_TEXT="$("$CC_BIN" --version)"
   CC_VERSION_LINE="${CC_VERSION_TEXT%%$'\n'*}"
   test "$CC_VERSION_LINE" = 'cc (Debian 14.2.0-19) 14.2.0'
   test "$("$GETCONF_BIN" GNU_LIBC_VERSION)" = 'glibc 2.41'
   ENV_VERSION_TEXT="$("$ENV_BIN" --version)"
   ENV_VERSION_LINE="${ENV_VERSION_TEXT%%$'\n'*}"
   test "$ENV_VERSION_LINE" = 'env (GNU coreutils) 9.7'
   GIT_LOCAL_ENV_VARS="$("$GIT_BIN" rev-parse --local-env-vars)"
   test "$GIT_LOCAL_ENV_VARS" = $'GIT_ALTERNATE_OBJECT_DIRECTORIES\nGIT_CONFIG\nGIT_CONFIG_PARAMETERS\nGIT_CONFIG_COUNT\nGIT_OBJECT_DIRECTORY\nGIT_DIR\nGIT_WORK_TREE\nGIT_IMPLICIT_WORK_TREE\nGIT_GRAFT_FILE\nGIT_INDEX_FILE\nGIT_NO_REPLACE_OBJECTS\nGIT_REPLACE_REF_BASE\nGIT_PREFIX\nGIT_SHALLOW_FILE\nGIT_COMMON_DIR'
   REPO_ROOT="$(pwd -P)"
   test "$(realpath "$REPO_ROOT")" = "$REPO_ROOT"
   test "$("$GIT_BIN" rev-parse --path-format=absolute --show-toplevel)" = "$REPO_ROOT"
   GIT_DIR_ABS="$("$GIT_BIN" rev-parse --absolute-git-dir)"
   test "$(realpath "$GIT_DIR_ABS")" = "$GIT_DIR_ABS"
   GIT_COMMON_DIR="$("$GIT_BIN" rev-parse --path-format=absolute --git-common-dir)"
   test "$(realpath "$GIT_COMMON_DIR")" = "$GIT_COMMON_DIR"
   GIT_WRITER_FENCE_DIR="$("$GIT_BIN" rev-parse --path-format=absolute --git-path objects)"
   test "$GIT_WRITER_FENCE_DIR" = "$GIT_COMMON_DIR/objects"
   test -d "$GIT_WRITER_FENCE_DIR"
   test "$(realpath "$GIT_WRITER_FENCE_DIR")" = "$GIT_WRITER_FENCE_DIR"
   PLAN_ABS="$REPO_ROOT/$PLAN_PATH"
   test -f "$PLAN_ABS"
   test ! -L "$PLAN_ABS"
   test "$(realpath "$PLAN_ABS")" = "$PLAN_ABS"
   test "$(stat -Lc '%d' "$GIT_DIR_ABS")" = "$(stat -Lc '%d' "$(dirname "$PLAN_ABS")")"
   WORKTREE_SYNC_BIN="$REPO_ROOT/scripts/repair-plan-worktree.mjs"
   REVIEW_POLICY_REL=plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs
   WORKTREE_SYNC_REL=scripts/repair-plan-worktree.mjs
   REVIEW_POLICY_BIN="$REPO_ROOT/$REVIEW_POLICY_REL"
   test -f "$WORKTREE_SYNC_BIN"
   test ! -L "$WORKTREE_SYNC_BIN"
   test "$(realpath "$WORKTREE_SYNC_BIN")" = "$WORKTREE_SYNC_BIN"
   test -f "$REVIEW_POLICY_BIN"
   test ! -L "$REVIEW_POLICY_BIN"
   test "$(realpath "$REVIEW_POLICY_BIN")" = "$REVIEW_POLICY_BIN"
   for SOURCE_HELPER_REL in "$REVIEW_POLICY_REL" "$WORKTREE_SYNC_REL"; do
     SOURCE_HELPER_ABS="$REPO_ROOT/$SOURCE_HELPER_REL"
     SOURCE_HELPER_TREE="$("$GIT_BIN" ls-tree HEAD -- "$SOURCE_HELPER_REL")"
     test "${SOURCE_HELPER_TREE%% *}" = 100644
     SOURCE_HELPER_EXPECTED="$("$GIT_BIN" rev-parse "HEAD:$SOURCE_HELPER_REL")"
     SOURCE_HELPER_ACTUAL="$("$GIT_BIN" hash-object --no-filters -- "$SOURCE_HELPER_ABS")"
     test "$SOURCE_HELPER_ACTUAL" = "$SOURCE_HELPER_EXPECTED"
   done
   export GIT_DIR="$GIT_DIR_ABS" GIT_COMMON_DIR GIT_WORK_TREE="$REPO_ROOT"
   export GIT_OBJECT_DIRECTORY="$GIT_WRITER_FENCE_DIR"
   export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_COUNT=4
   export GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null
   export GIT_CONFIG_KEY_1=core.attributesFile GIT_CONFIG_VALUE_1=/dev/null
   export GIT_CONFIG_KEY_2=user.name GIT_CONFIG_VALUE_2=DocksDocks
   export GIT_CONFIG_KEY_3=user.email
   export GIT_CONFIG_VALUE_3=55303379+DocksDocks@users.noreply.github.com
   export GIT_ATTR_NOSYSTEM=1 GIT_NO_REPLACE_OBJECTS=1 GIT_LITERAL_PATHSPECS=1
   export GIT_OPTIONAL_LOCKS=0
   test "$("$GIT_BIN" rev-parse --path-format=absolute --show-toplevel)" = "$REPO_ROOT"
   test "$("$GIT_BIN" rev-parse --absolute-git-dir)" = "$GIT_DIR_ABS"
   test "$("$GIT_BIN" rev-parse --path-format=absolute --git-common-dir)" = "$GIT_COMMON_DIR"
   test "$("$GIT_BIN" rev-parse --path-format=absolute --git-path objects)" = "$GIT_WRITER_FENCE_DIR"
   require_single_git_config core.hooksPath /dev/null
   require_single_git_config core.attributesFile /dev/null
   require_single_git_config user.name DocksDocks
   require_single_git_config user.email 55303379+DocksDocks@users.noreply.github.com
   AUTHOR_IDENT="$("$GIT_BIN" var GIT_AUTHOR_IDENT)"
   COMMITTER_IDENT="$("$GIT_BIN" var GIT_COMMITTER_IDENT)"
   [[ "$AUTHOR_IDENT" =~ ^DocksDocks\ \<55303379\+DocksDocks@users\.noreply\.github\.com\>\ [0-9]+\ [+-][0-9]{4}$ ]]
   [[ "$COMMITTER_IDENT" =~ ^DocksDocks\ \<55303379\+DocksDocks@users\.noreply\.github\.com\>\ [0-9]+\ [+-][0-9]{4}$ ]]
   test "$("$GIT_BIN" branch --show-current)" = main
   ORIGIN_FETCH_URL="$("$GIT_BIN" remote get-url --all origin)"
   ORIGIN_PUSH_URL="$("$GIT_BIN" remote get-url --push --all origin)"
   test -n "$ORIGIN_FETCH_URL"
   test -n "$ORIGIN_PUSH_URL"
   test "${ORIGIN_FETCH_URL#*$'\n'}" = "$ORIGIN_FETCH_URL"
   test "${ORIGIN_PUSH_URL#*$'\n'}" = "$ORIGIN_PUSH_URL"
   test "$ORIGIN_FETCH_URL" = git@github.com:DocksDocks/docks.git
   test "$ORIGIN_PUSH_URL" = git@github.com:DocksDocks/docks.git
   require_single_git_config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
   require_single_git_config branch.main.remote origin
   require_single_git_config branch.main.merge refs/heads/main
   export GH_REPO=DocksDocks/docks
   export REALPATH_BIN STAT_BIN READLINK_BIN CUT_BIN DIRNAME_BIN MKTEMP_BIN FIND_BIN GREP_BIN WC_BIN
   export FLOCK_BIN SETPRIV_BIN GIT_BIN BASH_BIN NODE_BIN CC_BIN GETCONF_BIN ENV_BIN RM_BIN
   export JQ_BIN GH_BIN CODEX_BIN CLAUDE_BIN GH_REPO
   export REPO_ROOT GIT_DIR_ABS GIT_WRITER_FENCE_DIR PLAN_PATH PLAN_ABS Q
   export WORKTREE_SYNC_BIN WORKTREE_SYNC_REL REVIEW_POLICY_BIN REVIEW_POLICY_REL
   (
     set -euo pipefail
     test "$(readlink -f "/proc/$BASHPID/fd/8")" = "$GIT_COMMON_DIR"
     GIT_COMMON_ID="$(stat -Lc '%d:%i' "/proc/$BASHPID/fd/8")"
     test "$(stat -Lc '%d:%i' "$GIT_COMMON_DIR")" = "$GIT_COMMON_ID"
     exec 7<"$GIT_WRITER_FENCE_DIR"
     test "$(readlink -f "/proc/$BASHPID/fd/7")" = "$GIT_WRITER_FENCE_DIR"
     GIT_WRITER_FENCE_ID="$(stat -Lc '%d:%i' "/proc/$BASHPID/fd/7")"
     test "$(stat -Lc '%d:%i' "$GIT_WRITER_FENCE_DIR")" = "$GIT_WRITER_FENCE_ID"
     exec 7<&-
     "$FLOCK_BIN" --exclusive --nonblock 8
     REPAIR_LOCK_HOLDER_PID="$BASHPID"
     REPAIR_LOCK_HOLDER_START="$(cut -d ' ' -f 22 "/proc/$BASHPID/stat")"
     REPAIR_LOCK_HOLDER_EXE="$(readlink -f "/proc/$BASHPID/exe")"
     test "$REPAIR_LOCK_HOLDER_EXE" = "$BASH_BIN"
     export GIT_COMMON_ID GIT_WRITER_FENCE_ID
     export REPAIR_LOCK_HOLDER_PID REPAIR_LOCK_HOLDER_START REPAIR_LOCK_HOLDER_EXE
     "$SETPRIV_BIN" --pdeathsig KILL "$BASH_BIN" --noprofile --norc -s 8<&-
   ) 8<"$GIT_COMMON_DIR"
   ```

   Launch the preceding command as a persistent non-PTY stdin session and wait
   until it is running. Stream this exact second script, followed by every
   remaining Step 2–5 command, to that same child; do not continue in the parent
   shell or close stdin early:

   ```bash
   set -euo pipefail
   umask 077
   unset GIT_INDEX_FILE
   unset REPAIR_PRIVATE_INDEX
   realpath() { "$REALPATH_BIN" "$@"; }
   stat() { "$STAT_BIN" "$@"; }
   readlink() { "$READLINK_BIN" "$@"; }
   cut() { "$CUT_BIN" "$@"; }
   dirname() { "$DIRNAME_BIN" "$@"; }
   mktemp() { "$MKTEMP_BIN" "$@"; }
   find() { "$FIND_BIN" "$@"; }
   grep() { "$GREP_BIN" "$@"; }
   wc() { "$WC_BIN" "$@"; }
   require_single_git_config() {
     if test "$#" -ne 2; then return 1; fi
     local values
     values="$("$GIT_BIN" config --get-all "$1")" || return 1
     test -n "$values" || return 1
     test "${values#*$'\n'}" = "$values" || return 1
     test "$values" = "$2" || return 1
   }
   validate_repair_toolchain() {
     local tool_bin version_text version_line
     for tool_bin in "$REALPATH_BIN" "$STAT_BIN" "$READLINK_BIN" "$CUT_BIN" \
       "$DIRNAME_BIN" "$MKTEMP_BIN" "$FIND_BIN" "$GREP_BIN" "$WC_BIN" \
       "$FLOCK_BIN" "$SETPRIV_BIN" "$GIT_BIN" "$BASH_BIN" "$NODE_BIN" \
       "$CC_BIN" "$GETCONF_BIN" "$ENV_BIN" "$RM_BIN" "$JQ_BIN" "$GH_BIN" \
       "$CODEX_BIN" "$CLAUDE_BIN"; do
       test -f "$tool_bin" || return 1
       test -x "$tool_bin" || return 1
       test ! -L "$tool_bin" || return 1
       test "$("$REALPATH_BIN" "$tool_bin")" = "$tool_bin" || return 1
     done
     test "$("$FLOCK_BIN" --version)" = 'flock from util-linux 2.41' || return 1
     test "$("$SETPRIV_BIN" --version)" = 'setpriv from util-linux 2.41' || return 1
     test "$("$GIT_BIN" --version)" = 'git version 2.47.3' || return 1
     test "$("$NODE_BIN" --version)" = 'v24.15.0' || return 1
     version_text="$("$BASH_BIN" --version)" || return 1
     version_line="${version_text%%$'\n'*}"
     test "$version_line" = 'GNU bash, version 5.2.37(1)-release (x86_64-pc-linux-gnu)' || return 1
     version_text="$("$CC_BIN" --version)" || return 1
     version_line="${version_text%%$'\n'*}"
     test "$version_line" = 'cc (Debian 14.2.0-19) 14.2.0' || return 1
     test "$("$GETCONF_BIN" GNU_LIBC_VERSION)" = 'glibc 2.41' || return 1
     version_text="$("$ENV_BIN" --version)" || return 1
     version_line="${version_text%%$'\n'*}"
     test "$version_line" = 'env (GNU coreutils) 9.7' || return 1
   }
   validate_repair_source_helper() {
     if test "$#" -ne 2; then return 1; fi
     local helper_rel helper_abs tree_record expected_blob actual_blob
     helper_rel="$1"
     helper_abs="$2"
     test -f "$helper_abs" || return 1
     test ! -L "$helper_abs" || return 1
     test "$(realpath "$helper_abs")" = "$helper_abs" || return 1
     tree_record="$("$GIT_BIN" ls-tree HEAD -- "$helper_rel")" || return 1
     test -n "$tree_record" || return 1
     test "${tree_record%% *}" = 100644 || return 1
     expected_blob="$("$GIT_BIN" rev-parse "HEAD:$helper_rel")" || return 1
     actual_blob="$("$GIT_BIN" hash-object --no-filters -- "$helper_abs")" || return 1
     test "$actual_blob" = "$expected_blob" || return 1
   }
   validate_repair_git_routing() {
     local -a git_config_names
     local author_ident committer_ident origin_fetch_url origin_push_url
     git_config_names=("${!GIT_CONFIG_KEY_@}" "${!GIT_CONFIG_VALUE_@}")
     test "$GIT_DIR" = "$GIT_DIR_ABS" || return 1
     test "$GIT_COMMON_DIR" = "$(realpath "$GIT_COMMON_DIR")" || return 1
     test "$GIT_WORK_TREE" = "$REPO_ROOT" || return 1
     test "$GIT_OBJECT_DIRECTORY" = "$GIT_WRITER_FENCE_DIR" || return 1
     test "$GIT_CONFIG_NOSYSTEM" = 1 || return 1
     test "$GIT_CONFIG_GLOBAL" = /dev/null || return 1
     test "$GIT_CONFIG_COUNT" = 4 || return 1
     test "$GIT_CONFIG_KEY_0" = core.hooksPath || return 1
     test "$GIT_CONFIG_VALUE_0" = /dev/null || return 1
     test "$GIT_CONFIG_KEY_1" = core.attributesFile || return 1
     test "$GIT_CONFIG_VALUE_1" = /dev/null || return 1
     test "$GIT_CONFIG_KEY_2" = user.name || return 1
     test "$GIT_CONFIG_VALUE_2" = DocksDocks || return 1
     test "$GIT_CONFIG_KEY_3" = user.email || return 1
     test "$GIT_CONFIG_VALUE_3" = 55303379+DocksDocks@users.noreply.github.com || return 1
     test "${#git_config_names[@]}" -eq 8 || return 1
     test "${git_config_names[0]}" = GIT_CONFIG_KEY_0 || return 1
     test "${git_config_names[1]}" = GIT_CONFIG_KEY_1 || return 1
     test "${git_config_names[2]}" = GIT_CONFIG_KEY_2 || return 1
     test "${git_config_names[3]}" = GIT_CONFIG_KEY_3 || return 1
     test "${git_config_names[4]}" = GIT_CONFIG_VALUE_0 || return 1
     test "${git_config_names[5]}" = GIT_CONFIG_VALUE_1 || return 1
     test "${git_config_names[6]}" = GIT_CONFIG_VALUE_2 || return 1
     test "${git_config_names[7]}" = GIT_CONFIG_VALUE_3 || return 1
     test "$GIT_ATTR_NOSYSTEM" = 1 || return 1
     test "$GIT_NO_REPLACE_OBJECTS" = 1 || return 1
     test "$GIT_LITERAL_PATHSPECS" = 1 || return 1
     test "$GIT_OPTIONAL_LOCKS" = 0 || return 1
     for GIT_FORBIDDEN_INPUT in GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_CONFIG GIT_CONFIG_PARAMETERS GIT_IMPLICIT_WORK_TREE GIT_GRAFT_FILE GIT_REPLACE_REF_BASE GIT_PREFIX GIT_SHALLOW_FILE GIT_QUARANTINE_PATH GIT_NAMESPACE GIT_CONFIG_SYSTEM GIT_ATTR_SOURCE GIT_CEILING_DIRECTORIES GIT_DISCOVERY_ACROSS_FILESYSTEM GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_COMMITTER_DATE EMAIL; do
       if [[ -v $GIT_FORBIDDEN_INPUT ]]; then return 1; fi
     done
     if [[ -v GIT_INDEX_FILE ]]; then
       test -n "${REPAIR_PRIVATE_INDEX:-}" || return 1
       test "$GIT_INDEX_FILE" = "$REPAIR_PRIVATE_INDEX" || return 1
       test "$(realpath "$GIT_INDEX_FILE")" = "$GIT_INDEX_FILE" || return 1
     else
       test -z "${REPAIR_PRIVATE_INDEX:-}" || return 1
     fi
     test "$("$GIT_BIN" rev-parse --path-format=absolute --show-toplevel)" = "$REPO_ROOT" || return 1
     test "$("$GIT_BIN" rev-parse --absolute-git-dir)" = "$GIT_DIR_ABS" || return 1
     test "$("$GIT_BIN" rev-parse --path-format=absolute --git-common-dir)" = "$GIT_COMMON_DIR" || return 1
     test "$("$GIT_BIN" rev-parse --path-format=absolute --git-path objects)" = "$GIT_WRITER_FENCE_DIR" || return 1
     require_single_git_config core.hooksPath /dev/null || return 1
     require_single_git_config core.attributesFile /dev/null || return 1
     require_single_git_config user.name DocksDocks || return 1
     require_single_git_config user.email 55303379+DocksDocks@users.noreply.github.com || return 1
     author_ident="$("$GIT_BIN" var GIT_AUTHOR_IDENT)" || return 1
     committer_ident="$("$GIT_BIN" var GIT_COMMITTER_IDENT)" || return 1
     [[ "$author_ident" =~ ^DocksDocks\ \<55303379\+DocksDocks@users\.noreply\.github\.com\>\ [0-9]+\ [+-][0-9]{4}$ ]] || return 1
     [[ "$committer_ident" =~ ^DocksDocks\ \<55303379\+DocksDocks@users\.noreply\.github\.com\>\ [0-9]+\ [+-][0-9]{4}$ ]] || return 1
     test "$("$GIT_BIN" branch --show-current)" = main || return 1
     origin_fetch_url="$("$GIT_BIN" remote get-url --all origin)" || return 1
     origin_push_url="$("$GIT_BIN" remote get-url --push --all origin)" || return 1
     test "$origin_fetch_url" = git@github.com:DocksDocks/docks.git || return 1
     test "$origin_push_url" = git@github.com:DocksDocks/docks.git || return 1
     require_single_git_config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*' || return 1
     require_single_git_config branch.main.remote origin || return 1
     require_single_git_config branch.main.merge refs/heads/main || return 1
     test "$(realpath "$PLAN_ABS")" = "$PLAN_ABS" || return 1
     test "$(realpath "$WORKTREE_SYNC_BIN")" = "$WORKTREE_SYNC_BIN" || return 1
     validate_repair_source_helper "$REVIEW_POLICY_REL" "$REVIEW_POLICY_BIN" || return 1
     validate_repair_source_helper "$WORKTREE_SYNC_REL" "$WORKTREE_SYNC_BIN" || return 1
   }
   validate_repair_toolchain
   validate_repair_git_routing
   test "$PPID" = "$REPAIR_LOCK_HOLDER_PID"
   test "$(cut -d ' ' -f 22 "/proc/$PPID/stat")" = "$REPAIR_LOCK_HOLDER_START"
   test "$(readlink -f "/proc/$PPID/exe")" = "$REPAIR_LOCK_HOLDER_EXE"
   test "$REPAIR_LOCK_HOLDER_EXE" = "$BASH_BIN"
   test "$(readlink -f "/proc/$PPID/fd/8")" = "$GIT_COMMON_DIR"
   test "$(stat -Lc '%d:%i' "/proc/$PPID/fd/8")" = "$GIT_COMMON_ID"
   test "$("$GIT_BIN" rev-parse --path-format=absolute --git-common-dir)" = "$GIT_COMMON_DIR"
   test "$(stat -Lc '%d:%i' "$GIT_COMMON_DIR")" = "$GIT_COMMON_ID"
   validate_repair_lock_holder() {
     validate_repair_toolchain || return 1
     test "$PPID" = "$REPAIR_LOCK_HOLDER_PID" || return 1
     test "$(cut -d ' ' -f 22 "/proc/$PPID/stat")" = "$REPAIR_LOCK_HOLDER_START" || return 1
     test "$(readlink -f "/proc/$PPID/exe")" = "$REPAIR_LOCK_HOLDER_EXE" || return 1
     test "$(readlink -f "/proc/$PPID/fd/8")" = "$GIT_COMMON_DIR" || return 1
     test "$(stat -Lc '%d:%i' "/proc/$PPID/fd/8")" = "$GIT_COMMON_ID" || return 1
     test "$(stat -Lc '%d:%i' "$GIT_COMMON_DIR")" = "$GIT_COMMON_ID" || return 1
     validate_repair_git_routing || return 1
   }
   run_repair_policy() {
     if test "$#" -eq 0; then return 1; fi
     validate_repair_lock_holder || return 1
     DOCKS_REVIEW_POLICY_GIT_BIN="$GIT_BIN" "$NODE_BIN" "$REVIEW_POLICY_BIN" "$@"
   }
   run_repair_policy_file() {
     if test "$#" -lt 2; then return 1; fi
     local policy_file
     policy_file="$1"
     shift
     test -f "$policy_file" || return 1
     test ! -L "$policy_file" || return 1
     test "$(realpath "$policy_file")" = "$policy_file" || return 1
     validate_repair_lock_holder || return 1
     DOCKS_REVIEW_POLICY_GIT_BIN="$GIT_BIN" "$NODE_BIN" "$policy_file" "$@"
   }
   validate_repair_worktree_scope() {
     if test "$BASHPID" != "$$"; then return 1; fi
     local status_file record count
     status_file="$(mktemp /tmp/docks-repair-status.XXXXXX)" || return 1
     if test "$(stat -c '%a' "$status_file")" != 600; then
       "$RM_BIN" -f -- "$status_file"
       return 1
     fi
     if ! "$GIT_BIN" --no-optional-locks status --porcelain=v1 -z >"$status_file"; then
       "$RM_BIN" -f -- "$status_file"
       return 1
     fi
     count=0
     while IFS= read -r -d '' record; do
       count=$((count + 1))
       case "$record" in
         "M  $PLAN_PATH"|"MM $PLAN_PATH") ;;
         *)
           "$RM_BIN" -f -- "$status_file"
           return 1
           ;;
       esac
     done <"$status_file"
     "$RM_BIN" -f -- "$status_file"
     test "$count" -le 1 || return 1
   }
   open_repair_writer_fence() {
     if test "$BASHPID" != "$$" || test -e "/proc/$BASHPID/fd/9"; then return 1; fi
     validate_repair_lock_holder || return 1
     exec 9<"$GIT_WRITER_FENCE_DIR"
     if test "$(readlink -f "/proc/$BASHPID/fd/9")" = "$GIT_WRITER_FENCE_DIR" &&
       test "$(stat -Lc '%d:%i' "/proc/$BASHPID/fd/9")" = "$GIT_WRITER_FENCE_ID" &&
       test "$(stat -Lc '%d:%i' "$GIT_WRITER_FENCE_DIR")" = "$GIT_WRITER_FENCE_ID"; then
       return 0
     fi
     exec 9<&-
     return 1
   }
   wait_repair_state_writers() {
     local status
     open_repair_writer_fence || return 1
     if "$FLOCK_BIN" --exclusive --timeout 30 9; then
       if validate_repair_lock_holder; then
         exec 9<&-
         return 0
       fi
       exec 9<&-
       return 1
     else
       status=$?
       exec 9<&-
       return "$status"
     fi
   }
   run_repair_state_writer() {
     if test "$BASHPID" != "$$" || test "$#" -eq 0; then return 1; fi
     local status writer_parent_pid writer_parent_start writer_parent_exe
     writer_parent_pid="$BASHPID"
     writer_parent_start="$(cut -d ' ' -f 22 "/proc/$writer_parent_pid/stat")" || return 1
     writer_parent_exe="$(readlink -f "/proc/$writer_parent_pid/exe")" || return 1
     test "$writer_parent_exe" = "$BASH_BIN" || return 1
     open_repair_writer_fence || return 1
     if "$FLOCK_BIN" --exclusive --nonblock 9; then
       if ! validate_repair_lock_holder; then
         exec 9<&-
         return 1
       fi
     else
       status=$?
       exec 9<&-
       return "$status"
     fi
     if "$SETPRIV_BIN" --pdeathsig TERM "$BASH_BIN" --noprofile --norc -c '
       set -eu
       require_single_config() {
         test "$#" -eq 2 || return 1
         values="$("$GIT_BIN" config --get-all "$1")" || return 1
         test -n "$values" || return 1
         test "${values#*$'"'"'\n'"'"'}" = "$values" || return 1
         test "$values" = "$2" || return 1
       }
       expected_pid="$1"
       expected_start="$2"
       expected_exe="$3"
       shift 3
       test "$#" -gt 0 || exit 1
       test "$PPID" = "$expected_pid" || exit 1
       test "$("$CUT_BIN" -d " " -f 22 "/proc/$PPID/stat")" = "$expected_start" || exit 1
       test "$("$READLINK_BIN" -f "/proc/$PPID/exe")" = "$expected_exe" || exit 1
       test "$("$READLINK_BIN" -f /proc/self/fd/9)" = "$GIT_WRITER_FENCE_DIR" || exit 1
       test "$("$STAT_BIN" -Lc "%d:%i" /proc/self/fd/9)" = "$GIT_WRITER_FENCE_ID" || exit 1
       test "$GIT_DIR" = "$GIT_DIR_ABS" || exit 1
       test "$GIT_COMMON_DIR" = "$("$REALPATH_BIN" "$GIT_COMMON_DIR")" || exit 1
       test "$GIT_WORK_TREE" = "$REPO_ROOT" || exit 1
       test "$GIT_OBJECT_DIRECTORY" = "$GIT_WRITER_FENCE_DIR" || exit 1
       test "$GIT_CONFIG_COUNT:$GIT_CONFIG_KEY_0:$GIT_CONFIG_VALUE_0" = "4:core.hooksPath:/dev/null" || exit 1
       test "$GIT_CONFIG_KEY_1:$GIT_CONFIG_VALUE_1" = "core.attributesFile:/dev/null" || exit 1
       test "$GIT_CONFIG_KEY_2:$GIT_CONFIG_VALUE_2" = "user.name:DocksDocks" || exit 1
       test "$GIT_CONFIG_KEY_3:$GIT_CONFIG_VALUE_3" = "user.email:55303379+DocksDocks@users.noreply.github.com" || exit 1
       [[ "$("$GIT_BIN" var GIT_AUTHOR_IDENT)" =~ ^DocksDocks\ \<55303379\+DocksDocks@users\.noreply\.github\.com\>\ [0-9]+\ [+-][0-9]{4}$ ]] || exit 1
       [[ "$("$GIT_BIN" var GIT_COMMITTER_IDENT)" =~ ^DocksDocks\ \<55303379\+DocksDocks@users\.noreply\.github\.com\>\ [0-9]+\ [+-][0-9]{4}$ ]] || exit 1
       test "$("$GIT_BIN" branch --show-current)" = main || exit 1
       test "$("$GIT_BIN" remote get-url --all origin)" = git@github.com:DocksDocks/docks.git || exit 1
       test "$("$GIT_BIN" remote get-url --push --all origin)" = git@github.com:DocksDocks/docks.git || exit 1
       require_single_config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*" || exit 1
       require_single_config branch.main.remote origin || exit 1
       require_single_config branch.main.merge refs/heads/main || exit 1
       if test "${GIT_INDEX_FILE+x}" = x; then
         test -n "${REPAIR_PRIVATE_INDEX:-}" || exit 1
         test "$GIT_INDEX_FILE" = "$REPAIR_PRIVATE_INDEX" || exit 1
       else
         test -z "${REPAIR_PRIVATE_INDEX:-}" || exit 1
       fi
       exec "$@"
     ' docks-repair-writer "$writer_parent_pid" "$writer_parent_start" "$writer_parent_exe" "$@"; then
       exec 9<&-
       return 0
     else
       status=$?
       exec 9<&-
       return "$status"
     fi
   }
   REPAIR_GIT_UNSET_ARGS=(
     -u GIT_ALTERNATE_OBJECT_DIRECTORIES -u GIT_CONFIG
     -u GIT_CONFIG_PARAMETERS -u GIT_CONFIG_COUNT
     -u GIT_CONFIG_KEY_0 -u GIT_CONFIG_VALUE_0
     -u GIT_CONFIG_KEY_1 -u GIT_CONFIG_VALUE_1
     -u GIT_CONFIG_KEY_2 -u GIT_CONFIG_VALUE_2
     -u GIT_CONFIG_KEY_3 -u GIT_CONFIG_VALUE_3
     -u GIT_OBJECT_DIRECTORY -u GIT_DIR -u GIT_WORK_TREE
     -u GIT_IMPLICIT_WORK_TREE -u GIT_GRAFT_FILE -u GIT_INDEX_FILE
     -u GIT_NO_REPLACE_OBJECTS -u GIT_REPLACE_REF_BASE -u GIT_PREFIX
     -u GIT_SHALLOW_FILE -u GIT_COMMON_DIR -u GIT_QUARANTINE_PATH
     -u GIT_NAMESPACE -u GIT_CONFIG_NOSYSTEM -u GIT_CONFIG_SYSTEM
     -u GIT_CONFIG_GLOBAL -u GIT_ATTR_NOSYSTEM -u GIT_ATTR_SOURCE
     -u GIT_CEILING_DIRECTORIES -u GIT_DISCOVERY_ACROSS_FILESYSTEM
     -u GIT_LITERAL_PATHSPECS -u GIT_OPTIONAL_LOCKS
     -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_AUTHOR_DATE
     -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL -u GIT_COMMITTER_DATE
     -u EMAIL -u DOCKS_REVIEW_POLICY_GIT_BIN
   )
   run_repair_unrouted_reader() {
     if test "$BASHPID" != "$$" || test "$#" -eq 0 ||
       test -e "/proc/$BASHPID/fd/9" || [[ -v GIT_INDEX_FILE ]] ||
       [[ -v REPAIR_PRIVATE_INDEX ]]; then
       return 1
     fi
     validate_repair_lock_holder || return 1
     "$ENV_BIN" "${REPAIR_GIT_UNSET_ARGS[@]}" "$@"
   }
   run_repair_unrouted_shared_writer() {
     if test "$BASHPID" != "$$" || test "$#" -eq 0 ||
       [[ -v GIT_INDEX_FILE ]] || [[ -v REPAIR_PRIVATE_INDEX ]]; then
       return 1
     fi
     run_repair_state_writer "$ENV_BIN" "${REPAIR_GIT_UNSET_ARGS[@]}" "$@"
   }
   run_repair_candidate_ci() {
     if test "$BASHPID" != "$$" || test "$#" -ne 3; then return 1; fi
     local expected_parent result_plan expected_status current_head source_modules
     local ci_root ci_repo candidate_target observed_status ci_status cleanup_status
     expected_parent="$1"
     result_plan="$2"
     expected_status="$3"
     case "$expected_status" in clean|changed) ;; *) return 1 ;; esac
     validate_repair_lock_holder || return 1
     validate_repair_worktree_scope || return 1
     current_head="$("$GIT_BIN" rev-parse --verify 'HEAD^{commit}')" || return 1
     test "$current_head" = "$expected_parent" || return 1
     test -f "$result_plan" || return 1
     test ! -L "$result_plan" || return 1
     test "$(realpath "$result_plan")" = "$result_plan" || return 1
     case "$expected_status" in
       clean) test "$(stat -c '%a' "$result_plan")" = 644 || return 1 ;;
       changed) test "$(stat -c '%a' "$result_plan")" = 600 || return 1 ;;
     esac
     source_modules="$REPO_ROOT/node_modules"
     test -d "$source_modules" || return 1
     test ! -L "$source_modules" || return 1
     test "$(realpath "$source_modules")" = "$source_modules" || return 1
     ci_root="$(mktemp -d /tmp/docks-repair-candidate-ci.XXXXXX)" || return 1
     test "$(stat -c '%a' "$ci_root")" = 700 || return 1
     ci_repo="$ci_root/repo"
     ci_status=0
     run_repair_unrouted_reader "$ENV_BIN" \
       GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null \
       "$GIT_BIN" -c core.hooksPath=/dev/null -c core.attributesFile=/dev/null \
       clone --quiet --no-local --no-hardlinks --single-branch --branch main \
       "$REPO_ROOT" "$ci_repo" || ci_status=$?
     if test "$ci_status" -eq 0; then
       test "$(run_repair_unrouted_reader "$GIT_BIN" -C "$ci_repo" rev-parse --verify 'HEAD^{commit}')" = "$expected_parent" || ci_status=1
     fi
     candidate_target="$ci_repo/$PLAN_PATH"
     if test "$ci_status" -eq 0; then
       run_repair_unrouted_reader "$ENV_BIN" \
         CANDIDATE_SOURCE="$result_plan" CANDIDATE_TARGET="$candidate_target" \
         CANDIDATE_STATUS="$expected_status" \
         SOURCE_MODULES="$source_modules" CI_MODULES="$ci_repo/node_modules" \
         "$NODE_BIN" --input-type=module -e '
           import assert from "node:assert/strict"; import fs from "node:fs";
           const source=fs.realpathSync(process.env.CANDIDATE_SOURCE);
           const target=fs.realpathSync(process.env.CANDIDATE_TARGET);
           const sourceStat=fs.lstatSync(source),targetStat=fs.lstatSync(target);
           assert.ok(sourceStat.isFile()&&!sourceStat.isSymbolicLink());
           assert.equal(sourceStat.mode&0o777,process.env.CANDIDATE_STATUS==="clean"?0o644:0o600);
           assert.ok(targetStat.isFile()&&!targetStat.isSymbolicLink());
           const bytes=fs.readFileSync(source);
           const fd=fs.openSync(target,fs.constants.O_WRONLY|fs.constants.O_TRUNC|fs.constants.O_NOFOLLOW);
           try { fs.writeFileSync(fd,bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
           fs.chmodSync(target,0o644);
           const modules=fs.realpathSync(process.env.SOURCE_MODULES);
           const modulesStat=fs.lstatSync(modules); assert.ok(modulesStat.isDirectory()&&!modulesStat.isSymbolicLink());
           fs.symlinkSync(modules,process.env.CI_MODULES,"dir");
           assert.ok(fs.lstatSync(process.env.CI_MODULES).isSymbolicLink());
           assert.equal(fs.realpathSync(process.env.CI_MODULES),modules);
         ' || ci_status=$?
     fi
     if test "$ci_status" -eq 0; then
       observed_status="$(run_repair_unrouted_reader "$GIT_BIN" -C "$ci_repo" --no-optional-locks status --porcelain=v1)" || ci_status=$?
       case "$expected_status" in
         clean) test -z "$observed_status" || ci_status=1 ;;
         changed) test "$observed_status" = " M $PLAN_PATH" || ci_status=1 ;;
       esac
     fi
     if test "$ci_status" -eq 0; then
       run_repair_unrouted_reader "$ENV_BIN" -C "$ci_repo" "$NODE_BIN" scripts/ci.mjs -q || ci_status=$?
     fi
     if test "$ci_status" -eq 0; then
       validate_repair_lock_holder || ci_status=$?
       test "$("$GIT_BIN" rev-parse --verify 'HEAD^{commit}')" = "$expected_parent" || ci_status=1
       validate_repair_worktree_scope || ci_status=1
     fi
     cleanup_status=0
     run_repair_unrouted_reader "$ENV_BIN" OWNED_CI_ROOT="$ci_root" "$NODE_BIN" --input-type=module -e '
       import assert from "node:assert/strict"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
       const root=path.resolve(process.env.OWNED_CI_ROOT),tmp=fs.realpathSync(os.tmpdir());
       assert.equal(path.dirname(root),tmp); assert.ok(path.basename(root).startsWith("docks-repair-candidate-ci."));
       const stat=fs.lstatSync(root); assert.ok(stat.isDirectory()&&!stat.isSymbolicLink()); assert.equal(fs.realpathSync(root),root);
       fs.rmSync(root,{recursive:true,force:true}); assert.equal(fs.existsSync(root),false);
     ' || cleanup_status=$?
     test "$cleanup_status" -eq 0 || return "$cleanup_status"
     return "$ci_status"
   }
   sync_repair_plan_path() {
     if test "$BASHPID" != "$$" || test "$#" -ne 1; then return 1; fi
     local expected_head sync_dir sync_source expected_blob actual_blob expected_mode tree_record
     local post_state post_action post_status
     expected_head="$1"
     test "${#expected_head}" -eq 40 || return 1
     case "$expected_head" in *[!0-9a-f]*) return 1 ;; esac
     test "$("$GIT_BIN" rev-parse --verify 'HEAD^{commit}')" = "$expected_head" || return 1
     sync_dir="$(mktemp -d /tmp/docks-repair-plan-source.XXXXXX)" || return 1
     test "$(stat -c '%a' "$sync_dir")" = 700 || return 1
     sync_source="$sync_dir/plan.md"
     "$GIT_BIN" cat-file blob "$expected_head:$PLAN_PATH" >"$sync_source" || return 1
     test "$(stat -c '%a' "$sync_source")" = 600 || return 1
     expected_blob="$("$GIT_BIN" rev-parse "$expected_head:$PLAN_PATH")" || return 1
     actual_blob="$("$GIT_BIN" hash-object --no-filters -- "$sync_source")" || return 1
     test "$actual_blob" = "$expected_blob" || return 1
     tree_record="$("$GIT_BIN" ls-tree "$expected_head" -- "$PLAN_PATH")" || return 1
     expected_mode="${tree_record%% *}"
     test "$expected_mode" = 100644 || return 1
     run_repair_state_writer "$NODE_BIN" "$WORKTREE_SYNC_BIN" sync . "$expected_head" "$PLAN_PATH" "$sync_source" || return 1
     run_repair_state_writer "$GIT_BIN" restore --source="$expected_head" --staged -- "$PLAN_PATH" || return 1
     post_state="$(run_repair_policy repair-worktree-state . "$expected_head" "$PLAN_PATH" "$Q")" || return 1
     post_action="$(printf '%s' "$post_state" | "$JQ_BIN" -er '.action')" || return 1
     post_status="$("$GIT_BIN" --no-optional-locks status --porcelain)" || return 1
     test "$post_action" = clean || return 1
     test -z "$post_status" || return 1
   }
   wait_repair_state_writers
   LOCK_RESIDUE="$(find "$GIT_COMMON_DIR" -type f -name '*.lock' -print -quit)"
   test -z "$LOCK_RESIDUE"
   validate_repair_worktree_scope
   PLAN_ATTRIBUTES="$("$GIT_BIN" check-attr -a -- "$PLAN_PATH")"
   test -z "$PLAN_ATTRIBUTES"
   HEAD_COMMIT="$("$GIT_BIN" rev-parse --verify 'HEAD^{commit}')"
   WORKTREE_STATE="$(run_repair_policy repair-worktree-state . "$HEAD_COMMIT" "$PLAN_PATH" "$Q")"
   WORKTREE_ACTION="$(printf '%s' "$WORKTREE_STATE" | "$JQ_BIN" -er '.action')"
   case "$WORKTREE_ACTION" in
     clean) ;;
     sync_head) sync_repair_plan_path "$HEAD_COMMIT" ;;
     *) exit 1 ;;
   esac
   BRANCH="$("$GIT_BIN" branch --show-current)"
   STATUS="$("$GIT_BIN" --no-optional-locks status --porcelain)"
   RELEASE_VERSION="$("$JQ_BIN" -er '.version' plugins/docks/.codex-plugin/plugin.json)"
   CLAUDE_VERSION="$("$JQ_BIN" -er '.version' plugins/docks/.claude-plugin/plugin.json)"
   CATALOG_VERSION="$("$JQ_BIN" -er '.plugins[] | select(.name == "docks") | .version' .claude-plugin/marketplace.json)"
   HEAD_COMMIT="$("$GIT_BIN" rev-parse --verify 'HEAD^{commit}')"
   export RELEASE_TAG="docks--v$RELEASE_VERSION"
   LOCAL_TAG_OBJECT="$("$GIT_BIN" rev-parse "refs/tags/$RELEASE_TAG")"
   RELEASE_COMMIT="$("$GIT_BIN" rev-parse "$RELEASE_TAG^{commit}")"
   test "$("$GIT_BIN" cat-file -t "$LOCAL_TAG_OBJECT")" = tag
   TAG_OBJECT_TEXT="$("$GIT_BIN" cat-file -p "$LOCAL_TAG_OBJECT")"
   mapfile -t TAG_LINES <<<"$TAG_OBJECT_TEXT"
   test "${#TAG_LINES[@]}" -eq 6
   test "${TAG_LINES[0]}" = "object $RELEASE_COMMIT"
   test "${TAG_LINES[1]}" = 'type commit'
   test "${TAG_LINES[2]}" = "tag $RELEASE_TAG"
   [[ "${TAG_LINES[3]}" =~ ^tagger\ DocksDocks\ \<55303379\+DocksDocks@users\.noreply\.github\.com\>\ [0-9]+\ [+-][0-9]{4}$ ]]
   test -z "${TAG_LINES[4]}"
   test "${TAG_LINES[5]}" = 'docks plugin 0.12.6'
   RELEASE_PATHS=(
     plugins/docks/.claude-plugin/plugin.json
     .claude-plugin/marketplace.json
     plugins/docks/.codex-plugin/plugin.json
   )
   RELEASE_TOUCHES="$("$GIT_BIN" rev-list "$RELEASE_COMMIT".."$HEAD_COMMIT" -- "${RELEASE_PATHS[@]}")"
   REMOTE_MAIN_RECORD="$("$GIT_BIN" ls-remote --heads origin refs/heads/main)"
   REMOTE_TAG_OBJECT_RECORD="$("$GIT_BIN" ls-remote origin "refs/tags/$RELEASE_TAG")"
   REMOTE_TAG_PEELED_RECORD="$("$GIT_BIN" ls-remote origin "refs/tags/$RELEASE_TAG^{}")"
   test -n "$REMOTE_MAIN_RECORD"
   test -n "$REMOTE_TAG_OBJECT_RECORD"
   test -n "$REMOTE_TAG_PEELED_RECORD"
   test "${REMOTE_MAIN_RECORD#*$'\n'}" = "$REMOTE_MAIN_RECORD"
   test "${REMOTE_TAG_OBJECT_RECORD#*$'\n'}" = "$REMOTE_TAG_OBJECT_RECORD"
   test "${REMOTE_TAG_PEELED_RECORD#*$'\n'}" = "$REMOTE_TAG_PEELED_RECORD"
   REMOTE_MAIN="${REMOTE_MAIN_RECORD%%$'\t'*}"
   REMOTE_TAG_OBJECT="${REMOTE_TAG_OBJECT_RECORD%%$'\t'*}"
   REMOTE_TAG_PEELED="${REMOTE_TAG_PEELED_RECORD%%$'\t'*}"
   RELEASE_URL="$("$GH_BIN" release view "$RELEASE_TAG" --repo "$GH_REPO" --json isDraft,isPrerelease,tagName,url --jq 'select(.isDraft == false and .isPrerelease == false and .tagName == env.RELEASE_TAG) | .url')"
   test "$BRANCH" = main
   test -z "$STATUS"
   test "$RELEASE_VERSION" = 0.12.6
   test "$CLAUDE_VERSION" = 0.12.6
   test "$CATALOG_VERSION" = 0.12.6
   "$GIT_BIN" merge-base --is-ancestor "$RELEASE_COMMIT" "$HEAD_COMMIT"
   test -z "$RELEASE_TOUCHES"
   case "$REMOTE_MAIN" in "$RELEASE_COMMIT"|"$HEAD_COMMIT") ;; *) exit 1 ;; esac
   test "$REMOTE_TAG_OBJECT" = "$LOCAL_TAG_OBJECT"
   test "$REMOTE_TAG_PEELED" = "$RELEASE_COMMIT"
   REPAIR_STATE="$(run_repair_policy repair-state . "$HEAD_COMMIT" "$PLAN_PATH" "$Q")"
   REPAIR_KIND="$(printf '%s' "$REPAIR_STATE" | "$JQ_BIN" -er '.state')"
   if test "$HEAD_COMMIT" = "$RELEASE_COMMIT"; then
     test "$REPAIR_KIND" = q
   else
     case "$REPAIR_KIND" in d1|armed|terminal|f) ;; *) exit 1 ;; esac
   fi
   test -n "$RELEASE_URL"
   ACTIVATION_DIR="$(mktemp -d /tmp/docks-0.12.6-activation.XXXXXX)"
   export ACTIVATION_DIR
   ACTIVATION_MODE="$(stat -c '%a' "$ACTIVATION_DIR")"
   test "$ACTIVATION_MODE" = 700
   run_repair_unrouted_shared_writer "$CODEX_BIN" plugin marketplace upgrade docks --json
   run_repair_unrouted_shared_writer "$CODEX_BIN" plugin add docks@docks --json
   run_repair_unrouted_shared_writer "$CLAUDE_BIN" plugin update docks@docks --scope user
   CODEX_PLUGIN_LIST="$ACTIVATION_DIR/codex-plugin-list.txt"
   CLAUDE_PLUGIN_LIST="$ACTIVATION_DIR/claude-plugin-list.txt"
   run_repair_unrouted_reader "$CODEX_BIN" plugin list >"$CODEX_PLUGIN_LIST"
   run_repair_unrouted_reader "$CLAUDE_BIN" plugin list >"$CLAUDE_PLUGIN_LIST"
   test "$(stat -c '%a' "$CODEX_PLUGIN_LIST")" = 600
   test "$(stat -c '%a' "$CLAUDE_PLUGIN_LIST")" = 600
   grep -F 'docks@docks' "$CODEX_PLUGIN_LIST" | grep -F '0.12.6'
   grep -A3 -F 'docks@docks' "$CLAUDE_PLUGIN_LIST" | grep -F 'Version: 0.12.6'
   run_repair_unrouted_reader "$NODE_BIN" --input-type=module <<'NODE'
   import assert from 'node:assert/strict';
   import crypto from 'node:crypto';
   import fs from 'node:fs';
   import path from 'node:path';
   const source='plugins/docks';
   const codex=`${process.env.HOME}/.codex/plugins/cache/docks/docks/0.12.6`;
   const claude=`${process.env.HOME}/.claude/plugins/cache/docks/docks/0.12.6`;
   const files={
     review_policy_sha256:'skills/productivity/plan-review/scripts/review-policy.mjs',
     plan_manager_sha256:'skills/productivity/plan-manager/SKILL.md',
     plan_review_sha256:'skills/productivity/plan-review/SKILL.md'
   };
   const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
   const canonicalRoot=root=>{
     const absolute=path.resolve(root), stat=fs.lstatSync(absolute);
     assert.ok(stat.isDirectory()&&!stat.isSymbolicLink());
     assert.equal(fs.realpathSync(absolute),absolute);
     return absolute;
   };
   const canonicalFile=(root,rel)=>{
     const absolute=path.resolve(root,rel), inside=path.relative(root,absolute), stat=fs.lstatSync(absolute);
     assert.ok(inside!==''&&!inside.startsWith(`..${path.sep}`)&&!path.isAbsolute(inside));
     assert.ok(stat.isFile()&&!stat.isSymbolicLink());
     assert.equal(fs.realpathSync(absolute),absolute);
     return absolute;
   };
   const writePrivate=(root,name,data)=>{
     const file=path.join(root,name);
     const flags=fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW;
     const fd=fs.openSync(file,flags,0o600);
     try { fs.writeSync(fd,data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
     const stat=fs.lstatSync(file);
     assert.ok(stat.isFile()&&!stat.isSymbolicLink());
     assert.equal(stat.mode&0o777,0o600);
     assert.equal(fs.realpathSync(file),file);
     return file;
   };
   const roots={source:canonicalRoot(source),codex:canonicalRoot(codex),claude:canonicalRoot(claude),activation:canonicalRoot(process.env.ACTIVATION_DIR)};
   const expected={schema:1};
   for(const [key,rel] of Object.entries(files)) {
     const sourcePath=canonicalFile(roots.source,rel), codexPath=canonicalFile(roots.codex,rel), claudePath=canonicalFile(roots.claude,rel);
     expected[key]=sha(sourcePath);
     assert.equal(sha(codexPath),expected[key]);
     assert.equal(sha(claudePath),expected[key]);
   }
   expected.d1_requires_closed_authorization=true;
   expected.any_d1_finding_terminal_t=true;
   expected.second_repair_forbidden=true;
   expected.review_attempt_write_ahead=true;
   expected.creator_only_launch_authority=true;
   expected.existing_w_never_relaunches=true;
   expected.all_post_w_non_authorizing_terminal_t=true;
   expected.restart_classifier_closed=true;
   const hex={type:'string',pattern:'^[0-9a-f]{64}$'};
   const schema={type:'object',additionalProperties:false,required:Object.keys(expected),properties:{
     schema:{const:1},review_policy_sha256:hex,plan_manager_sha256:hex,plan_review_sha256:hex,
     d1_requires_closed_authorization:{const:true},any_d1_finding_terminal_t:{const:true},
     second_repair_forbidden:{const:true},review_attempt_write_ahead:{const:true},
     creator_only_launch_authority:{const:true},existing_w_never_relaunches:{const:true},
     all_post_w_non_authorizing_terminal_t:{const:true},
     restart_classifier_closed:{const:true}
   }};
   writePrivate(roots.activation,'expected.json',JSON.stringify(expected)+'\n');
   writePrivate(roots.activation,'schema.json',JSON.stringify(schema)+'\n');
   writePrivate(roots.activation,'actual.json','');
   NODE
   export ACTIVATION_EXPECTED="$ACTIVATION_DIR/expected.json"
   export ACTIVATION_SCHEMA="$ACTIVATION_DIR/schema.json"
   export ACTIVATION_ACTUAL="$ACTIVATION_DIR/actual.json"
   ```

3. After step 2 has exclusively created a private mode-0700 directory and three
   canonical mode-0600 regular files, launches this exact
   fresh, ephemeral, explicit-model,
   read-only Codex process after refresh. The flags are current Codex CLI
   surfaces verified from `codex exec --help` and the official non-interactive
   manual. `run_repair_unrouted_reader` clears the controlled repository routing
   and passes neither fd 8 nor fd 9; only the private activation output may
   change. The closed schema and expected keyed hash object come from step 2:

   ```bash
   run_repair_unrouted_reader "$CODEX_BIN" exec \
     --ephemeral --ignore-user-config --ignore-rules --strict-config \
     -C /home/vagrant/projects/docks -m gpt-5.6-sol \
     -c 'model_reasoning_effort="xhigh"' -s read-only \
     --output-schema "$ACTIVATION_SCHEMA" \
     -o "$ACTIVATION_ACTUAL" - <<'PROMPT'
   Read only these exact installed Docks 0.12.6 files under
   /home/vagrant/.codex/plugins/cache/docks/docks/0.12.6:
   skills/productivity/plan-review/scripts/review-policy.mjs,
   skills/productivity/plan-manager/SKILL.md, and
   skills/productivity/plan-review/SKILL.md. Hash each file's raw bytes with
   SHA-256. From the two installed skill contracts, determine whether exact D1
   requires the closed persisted authorization, every review launch requires
   the creator-only empty write-ahead W, any non-authorizing post-W state writes
   terminal blocked T, an existing W can never relaunch, a second repair is
   forbidden, and restart classification is the closed
   q/d1/armed/terminal/f state machine.
   Return only the required schema fields. Do not edit files or use network.
   PROMPT
   run_repair_unrouted_reader "$NODE_BIN" --input-type=module <<'NODE'
   import assert from 'node:assert/strict';
   import fs from 'node:fs';
   const canonicalPrivate=p=>{
     const stat=fs.lstatSync(p);
     assert.ok(stat.isFile()&&!stat.isSymbolicLink());
     assert.equal(stat.mode&0o777,0o600);
     assert.equal(fs.realpathSync(p),p);
     return p;
   };
   const expected=JSON.parse(fs.readFileSync(canonicalPrivate(process.env.ACTIVATION_EXPECTED),'utf8'));
   const actual=JSON.parse(fs.readFileSync(canonicalPrivate(process.env.ACTIVATION_ACTUAL),'utf8'));
   canonicalPrivate(process.env.ACTIVATION_SCHEMA);
   assert.deepEqual(actual,expected);
   process.stdout.write(JSON.stringify(actual)+'\n');
   NODE
   ```

   Any nonzero exit, prose-only output, schema error, hash mismatch, missing or
   extra field, or false boolean is STOP before D1. This is activation evidence
   only; the existing main context never claims its already-loaded skill
   discovery hot-reloaded. Main-context plan-manager remains the only writer and
   invokes the explicit installed helper paths below, so no user restart is
   required.
4. Revalidates the canonical cache set immediately before any installed helper
   is used:

   ```bash
   set -euo pipefail
   PLAN_PATH=docs/plans/active/relay-worker-lifecycle-primitives.md
   Q=2ebba5dda939ffd68594d505511cf142ea76ee66
   test "$("$GIT_BIN" rev-parse --path-format=absolute --git-common-dir)" = "$GIT_COMMON_DIR"
   test "$(stat -Lc '%d:%i' "$GIT_COMMON_DIR")" = "$GIT_COMMON_ID"
   CACHE_PROOF="$(run_repair_policy cache-set plugins/docks "$HOME/.codex/plugins/cache/docks/docks/0.12.6" "$HOME/.claude/plugins/cache/docks/docks/0.12.6" "$ACTIVATION_EXPECTED")"
   CURRENT_HEAD="$("$GIT_BIN" rev-parse --verify 'HEAD^{commit}')"
   REPAIR_STATE="$(run_repair_policy repair-state . "$CURRENT_HEAD" "$PLAN_PATH" "$Q")"
   REPAIR_KIND="$(printf '%s' "$REPAIR_STATE" | "$JQ_BIN" -er '.state')"
   COUNT="$("$GIT_BIN" rev-list --count "$Q".."$CURRENT_HEAD")"
   test -n "$CACHE_PROOF"
   case "$REPAIR_KIND" in
     q) test "$COUNT" -le 4093 ;;
     d1) test "$COUNT" -le 4094 ;;
     armed) test "$COUNT" -le 4095 ;;
     terminal|f) ;;
     *) exit 1 ;;
   esac
   printf '%s\n' "$REPAIR_STATE"
   ```

   The source `cache-set` command fail-closes on a missing, symlinked,
   noncanonical, wrong-mode, outside-root, or hash-mismatched helper/skill/cache
   file and emits exact compact JCS equal to the expected activation object.
   These state-specific checks run under the held lock immediately before every
   write: q reserves D1/W/F-or-T, d1 reserves W/F-or-T, and armed reserves
   F-or-T. For `q`, plan-manager validates the committed closed repair authorization,
   uses `repair-d1-application` plus the generic CAS recipe for exact M1–M12
   without another Q review, synchronizes PLAN_PATH, then reruns the
   classifier and requires `d1`. For `d1`, it discards every Q bundle, prepares
   one fresh exact-D1 request and closed dispatch, then runs the creator-only
   arm sequence below. `armed` observed by any later process applies
   indeterminate T without review; `terminal` is immediate STOP; `f` skips
   directly to step 5.

   Main-context plan-manager dispatches the one prepared D1 request under its
   ordinary schema-v1 policy. In-session X/S dispatch is outside this shell. If
   a portable CLI leg is selected, its exact read-only Codex or Claude command
   is streamed through `run_repair_unrouted_reader`; it receives no repository
   routing or lock descriptor and writes only its prepared private output.
   Cache mutation is not part of either review leg.

   The D1-creating current process exports private canonical
   `REPAIR_REQUEST`, `REPAIR_BUNDLE`, and `REPAIR_DISPATCH` paths from the
   ordinary prepare result, then executes:

   ```bash
   set -euo pipefail
   PLAN_PATH=docs/plans/active/relay-worker-lifecycle-primitives.md
   Q=2ebba5dda939ffd68594d505511cf142ea76ee66
   D1="$("$GIT_BIN" rev-parse --verify 'HEAD^{commit}')"
   ARM_LINE="$(run_repair_policy repair-arm-record . "$D1" "$PLAN_PATH" "$Q" "$REPAIR_REQUEST" "$REPAIR_BUNDLE" "$REPAIR_DISPATCH")"
   test -n "$ARM_LINE"
   STATUS="$("$GIT_BIN" --no-optional-locks status --porcelain)"
   HEAD_BEFORE="$("$GIT_BIN" rev-parse --verify 'HEAD^{commit}')"
   test -z "$STATUS"
   test "$HEAD_BEFORE" = "$D1"
   TREE="$("$GIT_BIN" rev-parse --verify "$D1^{tree}")"
   ARM_DIR="$(mktemp -d /tmp/docks-repair-arm.XXXXXX)"
   test "$(stat -c '%a' "$ARM_DIR")" = 700
   run_repair_candidate_ci "$D1" "$PLAN_ABS" clean
   ARM_MESSAGE="$ARM_DIR/commit-message.txt"
   W_OID_FILE="$ARM_DIR/commit.oid"
   printf '%s\n' "$ARM_LINE" >"$ARM_MESSAGE"
   test "$(stat -c '%a' "$ARM_MESSAGE")" = 600
   run_repair_state_writer "$GIT_BIN" commit-tree "$TREE" -p "$D1" -F "$ARM_MESSAGE" >"$W_OID_FILE"
   test "$(stat -c '%a' "$W_OID_FILE")" = 600
   test "$(wc -l <"$W_OID_FILE")" -eq 1
   IFS= read -r W <"$W_OID_FILE"
   test "${#W}" -eq 40
   case "$W" in *[!0-9a-f]*) exit 1 ;; esac
   test "$PPID" = "$REPAIR_LOCK_HOLDER_PID"
   test "$(cut -d ' ' -f 22 "/proc/$PPID/stat")" = "$REPAIR_LOCK_HOLDER_START"
   test "$("$GIT_BIN" rev-parse --path-format=absolute --git-common-dir)" = "$GIT_COMMON_DIR"
   test "$(stat -Lc '%d:%i' "$GIT_COMMON_DIR")" = "$GIT_COMMON_ID"
   run_repair_state_writer "$GIT_BIN" update-ref -m 'docks: arm exact D1 review' HEAD "$W" "$D1"
   HEAD_AFTER="$("$GIT_BIN" rev-parse --verify 'HEAD^{commit}')"
   test "$HEAD_AFTER" = "$W"
   ARMED_STATE="$(run_repair_policy repair-state . "$W" "$PLAN_PATH" "$Q")"
   ARMED_KIND="$(printf '%s' "$ARMED_STATE" | "$JQ_BIN" -er '.state')"
   ARMED_D1="$(printf '%s' "$ARMED_STATE" | "$JQ_BIN" -er '.repair_commit')"
   ARMED_W="$(printf '%s' "$ARMED_STATE" | "$JQ_BIN" -er '.attempt_commit')"
   test "$ARMED_KIND" = armed
   test "$ARMED_D1" = "$D1"
   test "$ARMED_W" = "$W"
   ```

   Plan-manager sets each fresh `APPLICATION_DIR` before invoking its D1/F/T
   builder, then runs this same lock-held publication recipe without modifying
   the main index or worktree before the CAS:

   ```bash
   REPAIR_CANDIDATE_CI_FAILED=0
   publish_repair_application() {
   set -euo pipefail
   PLAN_PATH=docs/plans/active/relay-worker-lifecycle-primitives.md
   Q=2ebba5dda939ffd68594d505511cf142ea76ee66
   test "$("$GIT_BIN" rev-parse --path-format=absolute --git-common-dir)" = "$GIT_COMMON_DIR"
   test "$(stat -Lc '%d:%i' "$GIT_COMMON_DIR")" = "$GIT_COMMON_ID"
   APPLICATION_JSON="$APPLICATION_DIR/application.json"
   RESULT_PLAN="$APPLICATION_DIR/plan.md"
   RESULT_MESSAGE="$APPLICATION_DIR/commit-message.txt"
   EXPECTED_PARENT="$("$JQ_BIN" -er '.expected_parent' "$APPLICATION_JSON")"
   EXPECTED_PARENT_TREE="$("$JQ_BIN" -er '.expected_parent_tree' "$APPLICATION_JSON")"
   EXPECTED_PLAN_SHA="$("$JQ_BIN" -er '.result_plan_sha256' "$APPLICATION_JSON")"
   EXPECTED_MESSAGE_SHA="$("$JQ_BIN" -er '.commit_message_sha256' "$APPLICATION_JSON")"
   EXPECTED_STATE="$("$JQ_BIN" -er '.expected_state' "$APPLICATION_JSON")"
   STATUS_BEFORE="$("$GIT_BIN" --no-optional-locks status --porcelain)"
   CURRENT_HEAD="$("$GIT_BIN" rev-parse --verify 'HEAD^{commit}')"
   CURRENT_TREE="$("$GIT_BIN" rev-parse --verify "$EXPECTED_PARENT^{tree}")"
   test -z "$STATUS_BEFORE"
   test "$CURRENT_HEAD" = "$EXPECTED_PARENT"
   test "$CURRENT_TREE" = "$EXPECTED_PARENT_TREE"
   RESULT_PLAN_SHA="$("$NODE_BIN" -e 'const fs=require("node:fs"),c=require("node:crypto");process.stdout.write(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))' "$RESULT_PLAN")"
   RESULT_MESSAGE_SHA="$("$NODE_BIN" -e 'const fs=require("node:fs"),c=require("node:crypto");process.stdout.write(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))' "$RESULT_MESSAGE")"
   test "$RESULT_PLAN_SHA" = "$EXPECTED_PLAN_SHA"
   test "$RESULT_MESSAGE_SHA" = "$EXPECTED_MESSAGE_SHA"
   REPAIR_CANDIDATE_CI_FAILED=0
   if ! run_repair_candidate_ci "$EXPECTED_PARENT" "$RESULT_PLAN" changed; then
     REPAIR_CANDIDATE_CI_FAILED=1
     return 70
   fi
   TEMP_INDEX="$APPLICATION_DIR/index"
   test ! -e "$TEMP_INDEX"
   GIT_INDEX_FILE="$TEMP_INDEX" "$GIT_BIN" read-tree "$EXPECTED_PARENT^{tree}"
   test "$(stat -c '%a' "$TEMP_INDEX")" = 600
   RESULT_BLOB_OID_FILE="$APPLICATION_DIR/result-blob.oid"
   RESULT_TREE_OID_FILE="$APPLICATION_DIR/result-tree.oid"
   RESULT_COMMIT_OID_FILE="$APPLICATION_DIR/result-commit.oid"
   RESULT_BLOB_EXPECTED="$("$GIT_BIN" hash-object --no-filters -- "$RESULT_PLAN")"
   run_repair_state_writer "$GIT_BIN" hash-object --no-filters -w -- "$RESULT_PLAN" >"$RESULT_BLOB_OID_FILE"
   test "$(stat -c '%a' "$RESULT_BLOB_OID_FILE")" = 600
   test "$(wc -l <"$RESULT_BLOB_OID_FILE")" -eq 1
   IFS= read -r RESULT_BLOB <"$RESULT_BLOB_OID_FILE"
   test "${#RESULT_BLOB}" -eq 40
   case "$RESULT_BLOB" in *[!0-9a-f]*) return 1 ;; esac
   test "$RESULT_BLOB" = "$RESULT_BLOB_EXPECTED"
   TREE_RECORD="$("$GIT_BIN" ls-tree "$EXPECTED_PARENT" -- "$PLAN_PATH")"
   MODE="${TREE_RECORD%% *}"
   test "$MODE" = 100644
   GIT_INDEX_FILE="$TEMP_INDEX" "$GIT_BIN" update-index --cacheinfo "$MODE,$RESULT_BLOB,$PLAN_PATH"
   export REPAIR_PRIVATE_INDEX="$TEMP_INDEX"
   export GIT_INDEX_FILE="$REPAIR_PRIVATE_INDEX"
   run_repair_state_writer "$GIT_BIN" write-tree >"$RESULT_TREE_OID_FILE"
   unset GIT_INDEX_FILE REPAIR_PRIVATE_INDEX
   test "$(stat -c '%a' "$RESULT_TREE_OID_FILE")" = 600
   test "$(wc -l <"$RESULT_TREE_OID_FILE")" -eq 1
   IFS= read -r RESULT_TREE <"$RESULT_TREE_OID_FILE"
   test "${#RESULT_TREE}" -eq 40
   case "$RESULT_TREE" in *[!0-9a-f]*) return 1 ;; esac
   run_repair_state_writer "$GIT_BIN" commit-tree "$RESULT_TREE" -p "$EXPECTED_PARENT" -F "$RESULT_MESSAGE" >"$RESULT_COMMIT_OID_FILE"
   test "$(stat -c '%a' "$RESULT_COMMIT_OID_FILE")" = 600
   test "$(wc -l <"$RESULT_COMMIT_OID_FILE")" -eq 1
   IFS= read -r RESULT_COMMIT <"$RESULT_COMMIT_OID_FILE"
   test "${#RESULT_COMMIT}" -eq 40
   case "$RESULT_COMMIT" in *[!0-9a-f]*) return 1 ;; esac
   test "$PPID" = "$REPAIR_LOCK_HOLDER_PID"
   test "$(cut -d ' ' -f 22 "/proc/$PPID/stat")" = "$REPAIR_LOCK_HOLDER_START"
   test "$("$GIT_BIN" rev-parse --path-format=absolute --git-common-dir)" = "$GIT_COMMON_DIR"
   test "$(stat -Lc '%d:%i' "$GIT_COMMON_DIR")" = "$GIT_COMMON_ID"
   run_repair_state_writer "$GIT_BIN" update-ref -m 'docks: apply compatibility repair state' HEAD "$RESULT_COMMIT" "$EXPECTED_PARENT"
   POST_STATE="$(run_repair_policy repair-state . "$RESULT_COMMIT" "$PLAN_PATH" "$Q")"
   POST_KIND="$(printf '%s' "$POST_STATE" | "$JQ_BIN" -er '.state')"
   test "$POST_KIND" = "$EXPECTED_STATE"
   sync_repair_plan_path "$RESULT_COMMIT"
   STATUS="$("$GIT_BIN" --no-optional-locks status --porcelain)"
   test -z "$STATUS"
   }
   test "$REPAIR_CANDIDATE_CI_FAILED" -eq 0
   ```

   If and only if the earlier classifier returned `armed`, run this literal
   recovery branch after defining `publish_repair_application`; it never enters
   the creator-only arm or review blocks:

   ```bash
   if test "$REPAIR_KIND" = armed; then
     W="$(printf '%s' "$REPAIR_STATE" | "$JQ_BIN" -er '.attempt_commit')"
     D1="$(printf '%s' "$REPAIR_STATE" | "$JQ_BIN" -er '.repair_commit')"
     test "$(printf '%s' "$W" | wc -c)" -eq 40
     test "$(printf '%s' "$D1" | wc -c)" -eq 40
     case "$W$D1" in *[!0-9a-f]*) exit 1 ;; esac
     test "$("$GIT_BIN" rev-parse --verify 'HEAD^{commit}')" = "$W"
     printf '%s' "$REPAIR_STATE" | "$JQ_BIN" -e '.execution_review_commit == null and .terminal_commit == null' >/dev/null
     EVIDENCE_DIR="$(mktemp -d /tmp/docks-repair-evidence.XXXXXX)"
     test "$(stat -c '%a' "$EVIDENCE_DIR")" = 700
     export W REPAIR_RESULT_EVIDENCE="$EVIDENCE_DIR/evidence.json"
     "$NODE_BIN" --input-type=module <<'NODE'
   import assert from 'node:assert/strict';
   import fs from 'node:fs';
   import { jcs } from './plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs';
   assert.match(process.env.W,/^[0-9a-f]{40}$/);
   const value={schema:1,kind:'indeterminate-t',armed_commit:process.env.W,reason:'recovery_observed_armed'};
   const flags=fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW;
   const fd=fs.openSync(process.env.REPAIR_RESULT_EVIDENCE,flags,0o600);
   try { fs.writeFileSync(fd,`${jcs(value)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
   const stat=fs.lstatSync(process.env.REPAIR_RESULT_EVIDENCE);
   assert.ok(stat.isFile()&&!stat.isSymbolicLink());
   assert.equal(stat.mode&0o777,0o600);
   assert.equal(fs.realpathSync(process.env.REPAIR_RESULT_EVIDENCE),process.env.REPAIR_RESULT_EVIDENCE);
   assert.equal(fs.readFileSync(process.env.REPAIR_RESULT_EVIDENCE,'utf8'),`${jcs(value)}\n`);
   NODE
     APPLICATION_DIR="$(mktemp -d /tmp/docks-repair-application.XXXXXX)"
     test "$(stat -c '%a' "$APPLICATION_DIR")" = 700
     BUILDER_STDOUT="$(run_repair_policy repair-result-application . "$W" "$PLAN_PATH" "$Q" indeterminate-t "$REPAIR_RESULT_EVIDENCE" "$APPLICATION_DIR")"
     test -z "$BUILDER_STDOUT"
     publish_repair_application
     exit 1
   fi
   ```

   W's expected-D1 `git update-ref` under the held primary lock and pre-fork
   fd-9 writer fence is the only launch-authority compare-and-swap. A stale D1 exits
   before launch. The same process
   re-verifies the sealed bundle and starts the already prepared bounded X/S
   cycle once; it never calls `repair-state` to obtain permission. A
   findings-free `ready` `dual|single` result builds F and publishes it only by
   expected-W CAS. If that F/typed-T publication returns status 70 with
   `REPAIR_CANDIDATE_CI_FAILED=1`, plan-manager discards the failed candidate,
   writes exact `candidate_ci_failed` indeterminate evidence, builds T, and
   invokes the same publication function once for that T; a second status 70
   stops at W for restart-only recovery and never bypasses CI. Every other post-W state builds typed or indeterminate T and
   publishes it only by the same expected-W CAS. T winning makes every late F
   CAS fail; competing results have at most one visible winner. No post-W error
   is recollected.
5. Runs this self-contained proof in one current shell immediately after F:

   ```bash
   set -euo pipefail
   SOURCE_POLICY="$REVIEW_POLICY_BIN"
   CODEX_POLICY="$HOME/.codex/plugins/cache/docks/docks/0.12.6/skills/productivity/plan-review/scripts/review-policy.mjs"
   CLAUDE_POLICY="$HOME/.claude/plugins/cache/docks/docks/0.12.6/skills/productivity/plan-review/scripts/review-policy.mjs"
   PLAN_PATH=docs/plans/active/relay-worker-lifecycle-primitives.md
   PLANNED_AT=12cf2ead208fe932084890b8e3fbd5c72591f3db
   EXECUTION_BASE=de925e9bc046645a72f59bcd493da44d53adaf5a
   Q=2ebba5dda939ffd68594d505511cf142ea76ee66
   CURRENT_HEAD="$("$GIT_BIN" rev-parse --verify 'HEAD^{commit}')"
   CACHE_PROOF="$(run_repair_policy_file "$SOURCE_POLICY" cache-set plugins/docks "$HOME/.codex/plugins/cache/docks/docks/0.12.6" "$HOME/.claude/plugins/cache/docks/docks/0.12.6" "$ACTIVATION_EXPECTED")"
   test -n "$CACHE_PROOF"
   test -n "$CURRENT_HEAD"
   REPAIR_STATE="$(run_repair_policy_file "$SOURCE_POLICY" repair-state . "$CURRENT_HEAD" "$PLAN_PATH" "$Q")"
   CODEX_RANGE="$(run_repair_policy_file "$CODEX_POLICY" execution-range . "$CURRENT_HEAD" "$PLAN_PATH" "$PLANNED_AT" "$EXECUTION_BASE")"
   CLAUDE_RANGE="$(run_repair_policy_file "$CLAUDE_POLICY" execution-range . "$CURRENT_HEAD" "$PLAN_PATH" "$PLANNED_AT" "$EXECUTION_BASE")"
   test "$CODEX_RANGE" = "$CLAUDE_RANGE"
   STATE_SCHEMA="$(printf '%s' "$REPAIR_STATE" | "$JQ_BIN" -er '.schema')"
   STATE_KIND="$(printf '%s' "$REPAIR_STATE" | "$JQ_BIN" -er '.state')"
   STATE_Q="$(printf '%s' "$REPAIR_STATE" | "$JQ_BIN" -er '.prerequisite_commit')"
   STATE_F="$(printf '%s' "$REPAIR_STATE" | "$JQ_BIN" -er '.execution_review_commit')"
   STATE_REPAIR="$(printf '%s' "$REPAIR_STATE" | "$JQ_BIN" -er 'if .repair_commit == null then "" else .repair_commit end')"
   STATE_ATTEMPT="$(printf '%s' "$REPAIR_STATE" | "$JQ_BIN" -er 'if .attempt_commit == null then "" else .attempt_commit end')"
   STATE_TERMINAL="$(printf '%s' "$REPAIR_STATE" | "$JQ_BIN" -er 'if .terminal_commit == null then "" else .terminal_commit end')"
   RANGE_SCHEMA="$(printf '%s' "$CODEX_RANGE" | "$JQ_BIN" -er '.schema')"
   RANGE_MODE="$(printf '%s' "$CODEX_RANGE" | "$JQ_BIN" -er '.mode')"
   RANGE_HEAD="$(printf '%s' "$CODEX_RANGE" | "$JQ_BIN" -er '.reviewed_head')"
   RANGE_Q="$(printf '%s' "$CODEX_RANGE" | "$JQ_BIN" -er '.prerequisite_commit')"
   RANGE_PLANNED_AT="$(printf '%s' "$CODEX_RANGE" | "$JQ_BIN" -er '.planned_at_commit')"
   RANGE_EXECUTION_BASE="$(printf '%s' "$CODEX_RANGE" | "$JQ_BIN" -er '.execution_base_commit')"
   F="$(printf '%s' "$CODEX_RANGE" | "$JQ_BIN" -er '.execution_review_commit')"
   I="$(printf '%s' "$CODEX_RANGE" | "$JQ_BIN" -er '.execution_review_input_commit')"
   test "$STATE_SCHEMA" = 1
   test "$STATE_KIND" = f
   test -z "$STATE_TERMINAL"
   test "$RANGE_SCHEMA" = 1
   test "$RANGE_MODE" = legacy_compatibility
   test "$RANGE_HEAD" = "$CURRENT_HEAD"
   test "$RANGE_PLANNED_AT" = "$PLANNED_AT"
   test "$RANGE_EXECUTION_BASE" = "$EXECUTION_BASE"
   test "$STATE_Q" = "$Q"
   test "$RANGE_Q" = "$Q"
   test "$STATE_F" = "$F"
   if test -n "$STATE_REPAIR"; then
     test -n "$STATE_ATTEMPT"
     EXPECTED_I="$STATE_REPAIR"
   else
     test -z "$STATE_ATTEMPT"
     EXPECTED_I="$Q"
   fi
   test "$I" = "$EXPECTED_I"
   "$GIT_BIN" merge-base --is-ancestor "$F" "$CURRENT_HEAD"
   printf '%s\n' "$CODEX_RANGE"
   exit
   ```

   The compact-JCS output must name exact D1 (or Q) as
   `execution_review_input_commit`, Q as `prerequisite_commit`, F as
   `execution_review_commit`, the current HEAD separately as `reviewed_head`,
   and the unchanged execution base. It must pass when HEAD equals F and when
   HEAD is any allowed unrelated descendant of F, on both repair and no-repair
   paths. Every assignment and assertion is standalone so `set -e` cannot be
   masked by an `&&` list. The final `exit` ends the child shell, causing the
   fd-8-owning Bash holder to exit and release the common-directory lock. Only
   then may lifecycle implementation resume.

## Out of scope / do-NOT-touch

- `docs/plans/active/relay-worker-lifecycle-primitives.md`: do not repair it in
  this implementation plan. Its Q bytes and valid S1 evidence remain immutable
  until the new Docks release is installed.
- Session Relay Rust, JavaScript, hooks, binaries, manifests, and version: this
  policy patch must not resume or alter lifecycle implementation.
- Effect Kit payload or version: no dependency exists.
- Schema-v1 reviewer request/output, draft/completion receipts, bundle,
  prepared checkout, cleanup, or completion result: no new keys or versions.
- Strict historical start recognition and the 23-case strict differential
  corpus: the repair rung starts only after already-validated Q.
- Generic plan lifecycle outside the Docks-only legacy compatibility branch.
- Release/tag/push operations by the worker. Plan-manager handles them only
  after completion and under the existing owner authorization.

## Known gotchas

- The current 0.12.5 helper and both caches must continue rejecting Q with
  `stale draft receipt`; that is the correct pre-repair behavior.
- The Docks policy source can land between Q and D1. Therefore raw commit
  adjacency cannot replace path-specific ancestry; only target-plan commits
  form the compatibility tail.
- W is deliberately an empty Git commit, not a file or target-plan delta. It is
  related state that full ancestry must recognize; path-only traversal would
  silently discard the write-ahead guarantee. Only its successful expected-D1
  compare-and-swap call site may launch. Classification of W is recovery-only.
- The lock holder must run as a persistent non-PTY stdin session. Piping the
  whole block, using an interactive shell that ignores `errexit`, or closing
  stdin before the final `exit` invalidates crash/release behavior and is STOP.
- `PR_SET_PDEATHSIG` has a documented race when the parent is already gone
  before it is installed. The one-shot child must capture the actual fd-8 Bash
  holder PID/start-time/executable before `setpriv`, and Bash must recheck all three;
  setting the signal without both sides of that check is not sufficient.
- The parent-death setting is cleared in a forked child. Merely calling an
  ordinary external repository writer from the pdeath-bound Bash
  still forks an unbound writer. Every visible repository-state command must use
  `run_repair_state_writer`, whose actual writer receives `TERM`, rechecks the
  original Bash PID/start-time/executable, and inherits the already-locked fd 9
  open-file description before it `exec`s Git or Node. The wrapper requires `BASHPID=$$`; never
  invoke it through command substitution, `(...)`, backgrounding, a pipeline,
  or another shell.
- Combined Git `restore --staged --worktree` is not atomic: Git 2.47.3 can unlink
  the old target before producing the replacement while its index update remains
  uncommitted. The protocol therefore atomically replaces the target under a
  closed durable intent first and runs only index-only Git restore second. Never
  reintroduce the combined form or teach `RepairWorktreeStateV1` to accept a
  missing/partial target.
- Ambient Git environment can redirect object writes or the worktree while
  `rev-parse --git-common-dir` still names the expected repository. The launcher
  rejects Git's exact local-environment vector plus the protocol's additional
  routing/config inputs, installs one closed canonical Git environment with
  hooks disabled, and rechecks it before every writer. Plugin and portable
  reviewer commands must instead clear that complete set through exact `env -u`;
  do not let repository routing leak outward or replace the checks with a
  one-time common-dir assertion.
- Killing a prepared `git update-ref` with `KILL` leaves real `HEAD.lock` and ref
  lock files, so the actual writer must not use the Bash holder's uncatchable
  signal. `TERM` plus the retained writer fence lets Git clean normally while a
  new primary owner waits. A drain timeout or any residual `*.lock` is STOP;
  never infer ownership and delete it.
- The existing R receipt in Q reviews E. D1 must preserve it until F replaces it
  with the receipt that reviews D1/Q.
- `canonicalPlanView` excludes lifecycle fields and its own receipt line. Do not
  infer that a full plan edit is safe merely because the canonical hash ignores
  one field; validate the raw D partition delta separately.
- `docs/plans/AGENTS.md` currently sits at the 500-line budget. Rewrite/condense
  the compatibility subsection rather than increasing the file beyond 500.
- Mutation runs are already machine-parallel. Do not add a second baseline or
  nested pool; preserve one immutable source snapshot and the six-core cap.
- The current Q reviewer output is diagnostic evidence only. Its temporary
  bundle may disappear and it predates the released repair validator. The
  post-ship handoff validates the committed closed authorization, applies exact
  D1 without another Q review, and reviews only exact D1.
- The current `node scripts/release.mjs --help` is not a help command; it enters
  CI before rejecting the argument. The implementation must preserve ordinary
  release behavior but add the closed `--dry-run --resume --plugin <name>
  <X.Y.Z>` classifier and the exact resumable invocation in the post-ship
  handoff. Never retry a partially published version through the one-shot path.

## Global constraints

- Plan-manager is the sole plan writer, review dispatcher, finding reconciler,
  lifecycle mutator, and release operator.
- Workers never push, tag, publish, release, or edit either active plan.
- No destructive Git, force, history rewrite, or branch deletion.
- Every passed reviewer must be `ready` with zero findings; `not_ready` has no
  override.
- After W, exactly one prepared review cycle may run; every restart, malformed
  output, launch ambiguity, or interrupted result commit applies indeterminate
  T and never relaunches.
- A validated fd-8 common-directory lock spans recovery through final validation
  and passes no descriptor to descendants. Every actual command that can change
  the shared object database, ref, main index, worktree, or supported plugin
  caches inherits the
  already-locked canonical `objects/` fd 9 across `exec`, receives `TERM` when
  Bash dies, and releases that fence only after it and inheriting children
  cleanup/exit. Every new primary owner drains fd 9 before
  classification, so primary release never authorizes work concurrent with an
  earlier writer. Cache writers first clear all repository routing; read-only
  activation/reviewer commands clear the same routing and inherit no descriptor.
  Every D1/F/T publication remains an expected-parent ref CAS.
- Target synchronization is worktree-first/index-second and individually atomic:
  only closed `RepairPlanWorktreeIntentV1` may clean its reserved Git-dir temp,
  and exact Git updates only the index. The uncontrolled combined restore form
  and every ambient Git routing/config/hook override are forbidden.
- Dirty recovery is authorized only by exact `RepairWorktreeStateV1`; no other
  path, byte, mode, index state, conflict, or untracked state may be repaired.
- Preserve standing cross-company consent, host-policy degradation recording,
  and the no-session-relay schema-v1 review boundary.
- Run `node scripts/ci.mjs` before every commit.
- Do not loosen validator floors, mutation oracles, output ordering, cleanup,
  or exact hash/ancestry checks to make tests pass.
- Any further change to this plan's Goal/deliverable or to the lifecycle
  primitive Goal/deliverable is a user HARD STOP. The explicit owner
  authorization recorded in Self-review covers only this reviewed reduction
  from speculative D2–D8 repairs to optional exact D1, one empty write-ahead W,
  and terminal T.

## STOP conditions

- A repair commit cannot be validated without changing an existing public
  schema or accepting an unreviewed input.
- Full traversal cannot reject pre-F merges, mixed-path commits, stale receipts,
  more than 4,096 inspected commits, malformed/duplicate/nonempty W, a second
  repair/W, stale-parent arm, or W/request/dispatch mismatch; or it changes the
  generic post-F accounting/`in_review`/completion behavior.
- A creator-only compare-and-swap plus terminal recovery cannot close the
  D1-review result/commit crash window without a public-schema change.
- The repository lock cannot distinguish a live creator from recovery, or
  expected-W result CAS cannot make a terminal T defeat every late F/T result.
- The primary lock requires a mutable/reopenable path or reaches any descendant
  fd table; the secondary fence reaches a read-only reviewer/activation
  descendant or any unlisted non-repository command, or is not retained by the
  exact repository/cache writer through `exec`.
- Holder death lets a new primary owner pass the writer fence before the prior
  Git writer and inheriting children exit, either parent-death-signal race is
  open, TERM cleanup leaves a lock file, or the exact Git/util-linux surfaces
  are unavailable.
- Any D1/W/F/T object/ref publication or recovery synchronization bypasses the
  verified parent binding plus pre-fork, validated fd-9 writer fence.
- Interrupted post-CAS state cannot be classified and synchronized from exact
  Git bytes without accepting unrelated dirty state.
- Atomic worktree replacement cannot keep the target old-or-new at every
  interruption boundary, its durable intent cannot distinguish its own reserved
  temp from unrelated state, index-only Git is not old-or-new atomic, or any Git
  routing/config/hook override can escape the bound repository.
- Attempt, dispatch, stop, application, or worktree-state records require an
  implementer-selected key, value, rendering, hash, or commit message.
- Preserving E/R/B/Q records conflicts with making F review exact D1 bytes.
- The 0.12.5 no-repair Q→F path or strict legacy corpus changes behavior.
- A worker needs to edit the lifecycle plan, Session Relay, Effect Kit, release
  manifests, or an unlisted path.
- Focused or mutation tests require weakening an existing negative or creating a
  second full baseline.
- A reviewer finds a change to Goal/deliverable or an unresolved execution
  ambiguity.

## Cold-handoff checklist

- [x] File manifest: all twelve implementation paths, this plan, and the
  evidence-only lifecycle target are explicit.
- [x] Environment and commands: exact local Node/Bash/Git/util-linux/cc/glibc,
  focused/mutation/content/tree/full CI, committed-range whitespace, and
  post-ship release commands are explicit.
- [x] Interface contract: Q→[D1→W]→F target-path traversal, creator-only W,
  typed/indeterminate T, exact Attempt/Dispatch/Stop/Application/Worktree key
  vectors, D1 invariant, F binding, and unchanged public output schema/post-F
  completion reuse are defined.
- [x] Executable acceptance: A1–A9 are commands with binary expected results;
  project CI is recorded separately and release is post-ship.
- [x] Out of scope: lifecycle implementation, other plugins, schemas, strict
  start recognition, and worker release operations are excluded.
- [x] Decision rationale: optional D1, empty write-ahead W, terminal T, total
  bound, full-versus-target ancestry, frozen legacy evidence, and protected
  partitions explain the non-obvious choices.
- [x] Known gotchas: stale receipt, R-receipt retention, canonical/raw delta,
  line budget, parallel matrix, ephemeral Q evidence, release CLI behavior,
  primary/writer-fence lifetime, Git TERM cleanup, result CAS, and post-CAS
  worktree recovery are explicit.
- [x] Global constraints: sole writer, review eligibility, CI, release, and hard
  stops are copied into this file.
- [x] No undefined terms: Q, D1, W, typed/indeterminate T, F, E/R/B records,
  PLAN_PATH, I, request/dispatch hashes, and all state/output commit fields are
  defined above.

Adversarial cold-read result: a fresh worker can implement only the Docks policy
and tests without touching lifecycle Q. A fresh orchestrator can verify frozen
0.12.5 no-repair/post-F behavior, optional D1, creator-only W, both T variants,
and the exact mutation inventory; complete the plan; release one Docks patch;
refresh both caches; validate the closed authorization; apply exact D1; arm one
prepared review; and either commit F or terminal T. No executor must guess
whether unrelated commits count, which plan bytes may change, what binds W/F,
how crash recovery behaves, how many commits/repairs/reviews are allowed, what
evidence is durable, or who may release.

## Self-review

Author score: **99/100** — standalone 22/22, actionability 16/16, dependency
12/12, evidence 10/10, goal coverage 12/12, executable acceptance 12/12,
failure mode 10/10, assumption-to-question 5/6. Deduction: the 4,096
total-commit cap is a conservative policy choice rather than a measured
repository-history limit.

Two independent pre-commit cold reviews returned `not_ready`. All reproduced
findings were accepted and incorporated: preserve existing post-F completion
reuse; freeze the legacy policy/hash plus golden outputs; replace broad D prose
allowances with exact raw partitions/cells/evidence vectors; define the failed
review reconciliation loop; add total and repair bounds; separate process
authorship from Git-provable invariants; use a fixed mutation count/list/hash;
remove project CI and release from the completion inventory; validate the
committed execution range; and make the release/cache/D1/F handoff durable.
The second two-reviewer pass found that the first revision still duplicated the
69-case driver through acceptance plus CI, failed to freeze the legacy 57 labels,
left D1 postimage bytes implicit, under-tested the real post-F `in_review` path,
and left publication/cache commands too prose-heavy. All were reproduced and
accepted. One suggestion to run `context-tree refresh docs/plans` was rejected:
the current context-tree skill explicitly excludes `docs/plans/` because it is
already a node; A3 proves content parity and A6 proves the existing pair. One
reviewer suggested rejecting arbitrary post-F plan edits, while the other traced
the real completion sequence and showed that accounting/Step plus `in_review`
plan commits are mandatory before a receipt exists. The orchestrator kept the
source-backed behavior: D/F classification stops at F, and unchanged generic
lifecycle/completion validators govern later bytes. The revised exact bytes
then received two findings-free final re-reviews (`ready` 100/100 and `ready`).
The architecture leg's last pass caught and closed an insertion-order-JSON
versus repository-JCS digest mismatch and cross-shell helper-variable leakage;
both reviewers independently recomputed the corrected JCS hash and
self-contained installed-helper proof before this planned-state commit.

Cross-check (2026-07-14): [X: anthropic fable high] 0 findings — accepted none / rejected none (Claude authentication preflight unavailable); [S: openai gpt-5.6-sol xhigh] 2 findings — accepted S1,S2 / rejected none (none); [orchestrator] independently verified S1,S2 against the sealed plan and release source before accepting.

The first formal sealed S review scored 82/100 `not_ready`. S1 showed that an
extra accepted Q-only finding could disappear when exact D1 forbids its bytes
and D2 previously handled only later findings; the revised loop now requires an
exact M1–M12 resolution map or HARD STOP before D1, with a focused non-repetition
negative. S2 showed that version drift was checked only after publication; the
release block now asserts all three 0.12.5 source catalog identities and invokes
the explicit 0.12.6 target before any external write. Fresh review is required.

Cross-check (2026-07-14): [X: anthropic fable high] 0 findings — accepted none / rejected none (Claude authentication preflight unavailable); [S: openai gpt-5.6-sol xhigh] 2 findings — accepted S1,S2 / rejected none (none); [orchestrator] independently verified S1,S2 against the sealed manifest, Q Git blob, and cache-refresh contract before accepting.

The second formal sealed S review, request
`00c97e5d-3cbe-4bb1-b368-548b8d7c9dd6`, scored 90/100 `not_ready`. S1 showed
that the review bundle omitted the still-identical 548,777-byte Q target-plan
blob, so selector uniqueness and whole-plan hashes were not independently
reproducible from sealed evidence. The revised plan makes that target path a
mandatory requested input, binds its Git/raw hashes, and supplies an executable
pre-dispatch transform proof. S2 showed that only the helper, not the two shipped
workflow skills carrying the accepted-finding rule, had cache-equality
assertions. The release proof now byte-compares all three files across source,
Codex cache, and Claude cache, and the fresh activation result is closed and
binary. Fresh review is required.

Two fresh read-only precommit reviewers then exercised those fixes. Their first
passes found three further cold-handoff issues: schema-v1 seals only
`affected_paths`; a correct D1 postimage alone did not reject commuting M1/M2;
and making the Q target sealable also admitted it to generic execution scope.
The plan now lists the Q target as explicitly evidence-only, validates the exact
ordered M1–M12 ID/JCS/entry-hash program, and adds A8 to reject every historical
target touch plus current worktree drift. A8 captures Git output before testing
emptiness so command failures cannot be masked. The activation handoff now has
keyed source/cache hashes, a closed schema, an exact ephemeral
`gpt-5.6-sol`/`xhigh`/read-only invocation, and machine equality validation.
Both follow-up reviewers returned `READY`; the exact baseline proof passed, an
M1/M2 swap was rejected, valid A8 exited 0, and an invalid base propagated Git
exit 128. Fresh formal sealed review is still required.

Cross-check (2026-07-14): [X: anthropic fable high] 0 findings — accepted none / rejected none (Claude CLI reported `loggedIn:false`); [S: openai gpt-5.6-sol xhigh] 4 findings — accepted S1,S2,S3,S4 / rejected none (none); [orchestrator] independently verified S1–S4 against the sealed Q bytes, Git ancestry, cache validator source, and execution-range output before accepting.

The third formal sealed S review, request
`062c1dc6-cc37-4a29-8a61-1de0843b7a6b`, scored 64/100 `not_ready`. S1 proved
that successful D2–D8 repairs could lose unpersisted review provenance across a
restart. Under the owner's standing plan-remodel authorization, two fresh
architecture agents independently selected the smaller sound deliverable:
preserve Q→F, permit only exact optional D1 for durable S1, persist any other
typed negative result in terminal blocked T, and forbid D2. S2 found that
current-byte equality did not prove the whole Q→HEAD tail was linear,
target-untouched, or below budget; the pre-dispatch, A9, and pre-release gates now
prove those properties with explicit reserved slots. S3 found that `stat` and
`readFile` followed cache symlinks; the canonical cache-set proof now uses
`lstat`, non-symlink regular-file checks, root containment, and exact realpaths,
with focused negatives. S4 found the post-F proof omitted the central reviewed
input and prerequisite assertions; it now computes the last pre-F target commit
and checks both fields exactly. Fresh formal sealed review is required.

Two fresh read-only precommit reviewers then scored the single-D1 remodel
82/100 and 78/100 `not_ready`. Both independently found that a repeated S1 on a
fresh Q review simultaneously authorized D1 and required terminal T, while S1
had no stable closed identity because reviewer ids are run-local. The repair
path now dispatches no second Q review: one committed
`Compatibility-repair-authorization:` binds exact Q, the normalized reproduced
finding, selectors, mutation program, and D1 hashes; it authorizes exact D1
directly, and only exact D1 receives a fresh review. The executable reviewer
also reproduced masked command-substitution failures in publication preflight,
cache identity reuse after the initial activation, and predictable activation
files whose existing mode or symlink could survive `writeFileSync`. Every
publication probe is now captured by a top-level assignment before comparison;
the source `cache-set` validator revalidates canonical installed bytes before D1
and again before post-F helper execution; and activation uses a private
mode-0700 directory with exclusive no-follow mode-0600 files validated after
Codex writes. That revision still left malformed post-launch output
unpersisted; the later W protocol below closes that gap. Fresh review is
required.

Their closure passes then found five concrete leftovers: the authorization's
M12 selector digest had one transposed nibble; restart verification equated
post-D1/F `HEAD` with the release tag; the restart classifier had no executable
surface; Known gotchas still instructed a second Q review; and an undefined
“same-input anomaly” straddled the T/no-T boundary. The record now carries the
recomputed exact selector and JCS digest; step 2 derives the immutable release
commit from its tag and accepts local descendants; `repair-state` defines and
drives a closed q/d1/armed/terminal/f projection; the stale Q instruction is removed;
and only schema-valid compatibility-ineligible D1 results write T. Fresh review
is required. The final executable closure pass also separated `repair-state`'s
validated incomplete Q/D1/T prefixes from `execution-range`'s mandatory F, so
the restart projection cannot accidentally grant execution authority.

Cross-check (2026-07-14): [X: anthropic fable high] 0 findings — accepted none / rejected none (Claude CLI reported `loggedIn:false`); [S: openai gpt-5.6-sol xhigh] 2 findings — accepted S1,S2 / rejected none (none); [orchestrator] independently verified S1,S2 against the sealed plan, exact target Git history, and shell behavior before accepting.

The fourth formal sealed S review, request
`1ef2105f-62f6-4d00-8905-463f9ea3bcfc`, scored 76/100 `not_ready`. S1 proved an
unavoidable crash window between a D1 review result and F/T: a restart saw only
`d1`, could relaunch, and could discard a prior negative result. Two fresh
read-only design agents independently reviewed the repair. The closed solution
adds exactly one empty write-ahead W after D1: its expected-D1 compare-and-swap
binds the complete request and both dispatch plans and grants creator-local
launch authority once; classification of existing W is recovery-only and
applies indeterminate T. Typed negative T, indeterminate T, and findings-free F
are W's direct target-plan-changing children and bind the same request; no-repair
Q→F remains W-free. Focused cases cover every arm, crash, output, binding, and
restart boundary. S2 proved step 5 equated F with current HEAD even though the
contract permits unrelated descendants, and a separate executable reviewer
also reproduced `set -e` surviving a failed non-final `&&` term. The replacement
keeps current HEAD, F, and review input I separate, cross-checks repair-state
against execution-range for repair and no-repair histories, proves F ancestry,
and uses standalone assignments/assertions throughout. Commit-slot reserves now
include W. Fresh formal sealed review is required.

Two fresh read-only reviewers then audited the first exact-W revision. The
architecture reviewer scored it 68/100 `not_ready` and the execution reviewer
76/100 `not_ready`. All eight findings were reproduced and accepted. Result
publication now uses expected-W CAS, so T defeats late F and competing results
have one winner; a shared-Git-dir `flock` held across recovery, arm, review, and
publication separates a live creator from a restart; q/d1/armed checks reserve
3/2/1 commits immediately before writes; and frozen no-repair Q→F retains raw
adjacency while only the authorization-bound repair branch traverses unrelated
commits. F and typed T now validate each raw leg as a realization of W's exact
dispatch. Exact Attempt, Dispatch, Stop, Application, and WorktreeState key
vectors remove implementer-chosen bytes. D1/F/T are built in a private index and
published by expected-parent CAS; restart recovery accepts only a closed
`clean|sync_head` proof over the target path. Finally, activation now attests all
eight launch/restart predicates explicitly. Focused acceptance covers lock
contention/release, every count boundary, dispatch deviation, T-wins/late-F,
competing T, pre/post-CAS interruption, dirty-state rejection, and the frozen
no-repair adjacency negative. Fresh re-review of these exact revised bytes is
required.

Their closure review verified all eight prior findings fixed against raw plan
SHA-256 `19695a056edf93e9ed6d3342844df5cd6bffd599e99d8890511626715afd2757`,
then found two remaining executable gaps. Both independently showed that the
single `<evidence-json>` argument had no closed input union or literal
F/typed-T/indeterminate-T invocation; the execution reviewer additionally
proved that validating and closing a lock file before Bash reopened it left an
inode race, while Bash descendants inherited the descriptor and could retain
it after owner death. Both findings were reproduced and accepted. The result
builder now consumes exact closed `RepairResultEvidenceV1` JCS with literal
per-variant invocations and caller-owned `APPLICATION_DIR`. Locking now targets
the validated shared Git common-directory inode directly: a waiting util-linux
`flock --close` parent owns the only descriptor while a fresh child shell runs
steps 2–5, so no activation/reviewer descendant can inherit the lock and child
death releases it. Focused acceptance covers wrong evidence kinds, exact
invocations, path/inode mismatch, descriptor non-inheritance, contention, and
child-shell release. Fresh re-review is required.

The next closure pass confirmed the result-evidence union and descriptor
non-inheritance, then found two final live-recovery gaps. The execution reviewer
showed that restart classified `armed` without extracting W or running the
literal indeterminate-T path. The architecture reviewer showed that killing the
descriptor-owning `flock` wrapper could orphan its descriptor-free Bash child,
allowing work after lock release. Both were reproduced and accepted. The armed
branch now exact-extracts W/D1, writes canonical `recovery_observed_armed`
evidence, invokes the indeterminate builder, publishes through the shared CAS
function, and exits. The lock wrapper now captures its exact holder
PID/start-time/executable, installs util-linux `setpriv --pdeathsig KILL`, and
rechecks that identity in Bash, closing the documented already-dead-parent race.
A narrow installed-util-linux probe reproduced holder-death child termination
and immediate lock reacquisition. Focused acceptance requires both edges.
Fresh re-review is required.

Two final read-only reviewers examined raw plan SHA-256
`a5822213bfcd37fa597d65f58cf16a982907cf1f738674cd84d26d6192ec86fb`.
The architecture reviewer scored it 8.5/10 `not_ready`; the execution reviewer
scored it 90/100 `not_ready`. Both closed the armed-restart data flow and
independently reproduced one remaining high-severity process-boundary defect:
ordinary external `git update-ref` and `git restore` commands fork from Bash,
and Linux clears the Bash parent-death setting in those children. Killing the
`flock` holder could therefore kill Bash and release the lock while an orphaned
Git writer later changed HEAD, the main index, or the worktree. The finding was
accepted. The exact `run_repair_state_writer` wrapper now rejects forked-Bash
call sites, captures the original Bash PID/start-time/executable, installs a new
parent-death signal on the actual command child, rechecks that identity, and
then `exec`s Git. Every W/F/T CAS plus recovery and post-CAS restore uses it.
Focused tests stall the exact W, F/T, and restore argument vectors in the bound
writer, kill the holder, reacquire the lock, and prove no later ref/index/worktree
change. Fresh re-review of these exact revised bytes is required.

Two fresh reviewers then examined raw plan SHA-256
`4b51355280da8d8ce4fdfa017deebda0db957446383e7b72e3b798252794de6a`.
The architecture reviewer scored it 78/100 `not_ready`; the execution reviewer
scored it 72/100 `not_ready`. Both reproduced the same remaining ordering gap:
the primary descriptor closed as soon as its holder died, while Bash and the
second-generation writer received signals asynchronously, so an immediate new
owner could acquire and mutate before the old writer exited. The finding was
accepted. An independent real `git update-ref --stdin` transaction probe found
that `KILL` after `prepare` left `HEAD.lock` and a branch ref lock and made the
next CAS fail, whereas `TERM` removed both locks and allowed the exact retry.
The replacement two-fence design keeps the primary descriptor out of every
descendant but makes the actual Git writer inherit a separate canonical
`objects/` fence through util-linux `flock --no-fork`; the writer receives TERM,
and every new primary owner drains that fence before classification. A live
holder-death probe with a prepared real ref transaction proved primary and
writer-fence contention, TERM cleanup with no residual lock, unchanged
pre-transaction HEAD, and a successful exact retry. Focused acceptance now
requires those same boundaries for W, F/T, and both restore paths. Fresh
re-review is required.

Two subsequent fresh reviewers examined raw plan SHA-256
`23b9797dd0984ea065d6661cf97c91a5fc465d55492e51411764fbf581b7530e`.
The architecture reviewer scored it 45/100 `not_ready`; the execution reviewer
scored it 64/100 `not_ready`. All reproduced findings were accepted. A one-shot
fence drain still allowed a delayed old writer to enter after the drain; the
revised wrapper now acquires and validates fd 9 in the original supervised Bash
before any writer child exists and rechecks the fd-8 holder after acquisition.
Primary and writer locks now bind the exact descriptors whose path and inode
were validated, eliminating stat/open ABA. Every shared-object writer
(`hash-object --no-filters -w`, `write-tree`, and both `commit-tree` paths) now uses the same
fence and captures stdout through private mode-0600 files. Every status read in
the live protocol is both environment- and flag-disabled for optional locking.
The restore acceptance now requires the real Git command to expose a real
index lock and first target-path mutation through a disposable controlled seam,
not a stopped lookalike. Finally, the live stage rejects any Git or util-linux
version drift before recovery. A shell audit also found and corrected two
false-success branches that read `$?` after a completed `if`, and split the
holder launcher from the exact script streamed to its child. Fresh re-review of
these revised bytes is required.

Two fresh execution reviewers then examined raw plan SHA-256
`68cd594666e8887f757bfdba5e7ada0033903d9faeb06f83f641ceb5f112afa6`.
Both returned `not_ready` and independently reproduced the same high-severity
production defect: exact Git 2.47.3 can unlink the tracked target while combined
index/worktree restore still holds an uncommitted index lock, so interruption
leaves a missing target that the deliberately closed worktree classifier cannot
repair. The proposed blocking filter also contradicted the attribute-free
production gate and could leave its filter child retaining fd 9. The protocol
now forbids combined restore: a new author-side durable-intent helper atomically
renames an exact same-filesystem worktree file first, then exact Git updates only
the index. Thus every interruption is old/old, old-index/new-worktree, or
new/new, all already distinguishable without broadening repair authority. The
writer reviewer also proved ambient Git environment could redirect object writes
or the worktree while preserving the same common-dir answer. The launcher now
rejects inherited routing/config inputs, installs exact canonical Git/worktree/
object identities with hooks disabled, and rechecks them before every writer.
All findings were accepted; fresh review of the redesigned bytes is required.

The main-context follow-up audit found that the closed repository Git
environment would otherwise leak into plugin-manager and portable reviewer
processes. Exact Git 2.47.3 now freezes all 15 names from
`rev-parse --local-env-vars`; the launcher additionally rejects the protocol's
config-key, attribute, namespace, quarantine, pathspec, optional-lock, and
discovery inputs, including every numbered config-key/value name. Repository
helpers keep the validated environment. Read-only plugin inventory, private
activation evidence, and portable review commands run through an exact
coreutils `env -u` wrapper with neither fd, while the three shared cache updates
use the same cleared environment but retain only the parent-bound writer fence
through descendant exit. Canonical Codex, Claude, Git, and Node executable paths
replace PATH lookups in the live stage. All eleven Bash fences pass `bash -n`
and ShellCheck at warning severity; the only informational diagnostics are the
three intentional fd 8 read/lock observations and the literal single-quoted
writer-child script. The exact Q→D1 baseline proof still emits the four declared
identities. Fresh independent review of these bytes remains required.

Two independent fresh reviewers then examined raw plan SHA-256
`72247c82d03be43f3b786de24c8c274b566970cb2378e86747b1f4b54335d4fa`.
Both returned `not_ready`; all six findings were independently reproduced and
accepted. The architecture leg showed that application publication used
attribute-sensitive `git hash-object`, so a repository or user clean filter
could change the object bytes, and that the worktree classifier admitted the
unreachable reverse new-index/old-worktree pair. Publication now uses
`--no-filters` for both the expected raw OID and the object write, requires the
written OID to equal the expected OID, freezes the three reachable H/H, P/P,
and P/H pairs, and rejects H/P. The cold-execution leg showed that exact local
tool versions cannot run on GitHub's moving `ubuntu-latest`, that the existing
release command mutates before a closed preflight, that its same-version guard
makes every interrupted publication non-resumable, and that recovery trusted
mutable helpers and unrelated worktree state too early. A2 now separates exact
live-host recovery proof from deterministic portable tag CI; generic
`release.mjs --resume` preflights canonical tools and Git state before CI or
mutation and advances one closed idempotent publication state at a time; the
post-ship shell uses that interface under a controlled identity; and the
lock-held stage raw-verifies both source helpers plus the whole-worktree status
before first execution. Fresh review of this redesigned revision is required.

Two fresh read-only reviewers then examined raw plan SHA-256
`5af0eb176c8c08272688761602293b1324f506eb20078a07373c402c270b44e6`.
The recovery reviewer scored it 86/100 `not_ready`; the release reviewer scored
it 62/100 `not_ready`. All ten findings were independently reproduced and
accepted. Every review-policy Git subprocess now consumes one canonical
`DOCKS_REVIEW_POLICY_GIT_BIN`; inherited author/committer/date/email overrides
are rejected and effective `git var` identities are checked; and Step 2's
dependency text now follows the actual internal-primitives-before-surfaces
order. Release projection publication is atomic per file and classifies every
ordered prefix/temp boundary. Each pre-remote-tag invocation reacquires full
local-CI authority after classification; authoritative tag CI is bound to the
exact repository, workflow id, tag branch, SHA, event, unique run id, and latest
attempt. Live-host and portable compatibility selectors are closed and
separate. Every safety-critical external helper has a literal canonical path,
the immutable release commit comes from the tag while current `main` may be an
allowed descendant, and origin/tracking/GitHub repository identities are
checked before mutation and on restart. Focused negative cases cover every new
boundary under the frozen existing mutation labels. Fresh independent review
of these exact revised bytes is required.

Two further fresh read-only reviewers examined raw plan SHA-256
`5b8799d0fe9aa2cec8ea5ac6534bfc7365c353d63640eed7f0fcd2c5ee1f09f7`.
The architecture leg scored 84/100 `not_ready`; the cold-execution leg scored
62/100 `not_ready`. Their overlap reduced eight attributed reports to seven
unique reproduced findings, all accepted. The fresh Bash now recreates every
pinned utility wrapper before first use. Release publication defines exact
fully-staged index/worktree recovery and exclusive per-target temporary
identities. A validated local D1/W/F/T descendant may restart while remote main
remains the immutable release commit. Exact candidate-tree full CI precedes
every D1/W/F/T CAS and maps a post-W candidate failure to typed recovery without
bypassing CI. Local and remote release identity binds the full annotated tag
object separately from its peeled commit. Every singleton Git configuration key
uses `--get-all` and rejects duplicates. Both post-ship executable blocks now
enforce the same tag, remote-main, and repair-state contract. Fresh independent
review of these exact revised bytes is required.

## Notes

- Superseded without execution because the proposed Docks policy/release change
  grew disproportionate to its sole purpose: correcting two stale status
  statements in one historical Session Relay plan. Docks `0.12.5` remains the
  released policy version; no `0.12.6` source or release state was created by
  this plan.
- The clean implementation branch `codex/primitives-collab` at `22b754a` is
  preserved. Its commits belong to the Session Relay continuation and are not
  artifacts of this Docks detour.

The initial design considered silently treating the valid Q finding as
nonblocking, writing it into F, or inserting an ordinary plan commit. All three
are rejected: `not_ready` has no override, F would review different bytes, and
0.12.5 explicitly rejects an intervening commit. The selected repair rung is
now intentionally specific rather than general: exact optional D1 solves the
only durable finding, empty W closes the one-review crash window, terminal T
preserves any incompatible or indeterminate review obligation, and none of them
broadens legacy start recognition or invents discretionary repair authority.

## Mistakes & Dead Ends

- **2026-07-14T01:52:16-03:00**: Invoked `node scripts/release.mjs --help`
  expecting usage output → the script treats it as a version argument only
  after running full CI → use the documented header syntax and only run
  `--dry-run --plugin docks patch` when the release-readiness gate is due.

## Sources

- `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs`
  `applyPrerequisiteClosure`: Q currently changes only the pending marker and
  Step P status.
- Same file `validateLegacyCompatibilityRange`: 0.12.5 requires immediate Q/F
  plan commits, validates F against Q, and emits the existing execution input
  and review commit fields.
- `scripts/tests/plan-review-policy.mjs` `commitQFVariant` and
  `testCompatibilityChainNegatives`: existing positives and negatives for Q/F
  adjacency, extra prose/path, stale/non-ready receipts, and attribution.
- `scripts/tests/plan-review-policy-regressions.mjs`: mutation oracles protect
  exact prerequisite and final-review deltas through the bounded pool.
- `scripts/release.mjs`: the current path performs CI, version writes, commit,
  main push, tag push, tag-CI wait, and GitHub Release creation in one process;
  its same-version guard and recovery text prove why a closed `--resume` state
  machine is required.
- `.github/workflows/ci.yml`: tag validation runs on `ubuntu-latest` with Node
  24 and the full `scripts/ci.mjs`, so the deterministic portable compatibility
  mode—not this workstation's exact Git/util-linux/glibc tuple—is the tag gate.
- Official [`git hash-object`](https://git-scm.com/docs/git-hash-object):
  `--no-filters` hashes the bytes as-is and ignores input filters and line-ending
  conversion; both the pre-write and `-w` application paths require it.
- Official GitHub
  [`ubuntu-latest` runner image](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)
  and [runner-image policy](https://github.com/actions/runner-images): the label
  currently maps to Ubuntu 24.04 and its preinstalled Git/Bash versions differ
  from the pinned live recovery host; image contents also change over time.
- Installed `setpriv(1)` and Linux `PR_SET_PDEATHSIG(2const)` manuals: the
  parent-death setting survives ordinary exec, is cleared for forked children,
  and requires an explicit already-dead-parent recheck for race closure.
- Installed Linux `flock(2)` and util-linux 2.41 `flock(1)` manuals: the
  descriptor form locks its already-open file description; duplicates across
  `fork` share the lock, `execve` preserves it, and release occurs only after all
  duplicates close. The protocol therefore validates and locks fd 8/fd 9 rather
  than asking `flock` to reopen a pathname.
- Git v2.47.3
  [`tempfile.c`](https://github.com/git/git/blob/v2.47.3/tempfile.c) and
  [`sigchain.c`](https://github.com/git/git/blob/v2.47.3/sigchain.c): active
  lockfiles use the common signal-cleanup chain, whose common set includes
  `SIGTERM`; the exact installed version is part of the recovery proof.
- Git v2.47.3
  [`builtin/checkout.c`](https://github.com/git/git/blob/v2.47.3/builtin/checkout.c)
  and [`entry.c`](https://github.com/git/git/blob/v2.47.3/entry.c): path restore
  holds `index.lock`, updates the worktree before committing the index, and may
  unlink the old target before producing replacement bytes. This is why the
  combined restore form cannot satisfy closed crash recovery.
- Git v2.47.3
  [`run-command.c`](https://github.com/git/git/blob/v2.47.3/run-command.c) and
  [`convert.c`](https://github.com/git/git/blob/v2.47.3/convert.c): ordinary
  single-file filter children are not universally registered for parent signal
  cleanup, so a filter is not a valid writer-fence handoff fixture.
- Official [Git environment variables](https://git-scm.com/docs/git#_environment_variables):
  repository, worktree, index, object, alternate, namespace, quarantine, and
  config inputs can redirect command behavior; the live launcher must reject
  inherited values and install one canonical closed environment.
- Official [`git` options](https://git-scm.com/docs/git):
  `--no-optional-locks` is the command-line equivalent of
  `GIT_OPTIONAL_LOCKS=0`, preventing optional index refresh writes during status
  observations.
- Installed Bash manual `BASHPID`: it identifies the current Bash process and
  differs from `$$` in a subshell, which makes the wrapper's no-subshell guard
  directly testable.
- `docs/plans/AGENTS.md` Docks-only compatibility and plan-manager review loop:
  valid findings require repair and fresh review; current special tail is fixed
  E/R/B/Q/F.
- Q review bundle
  `/tmp/docks-plan-review/6fcf4130-4765-46b2-911c-405973fd71d1`:
  original sealed Q bytes and S1 source provenance. The temporary directory is
  not required for execution; the closed authorization record above is the
  committed evidence input and Q is independently reconstructed from Git.

## Review

*(filled by plan-review on completion)*
