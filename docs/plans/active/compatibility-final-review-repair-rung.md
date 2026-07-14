---
title: Add a bounded compatibility final-review repair rung
goal: Let one legacy lifecycle plan apply its closed authorized repair after Q and re-review exact D1 bytes without weakening E/R/B/Q or execution authority.
status: planned
created: "2026-07-14T01:52:16-03:00"
updated: "2026-07-14T04:28:19-03:00"
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
---

# Add a bounded compatibility final-review repair rung

## Goal

Extend only Docks' closed legacy-start compatibility tail from fixed
`Q → F` to `Q → [D1] → F`, where `[D1]` is one optional, exact,
plan-manager-owned plan-only repair commit for the already reproduced S1.
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
3. Seal one fresh ordinary schema-v1 review of exact D1. Main-context
   plan-manager reproduces every X/S finding and records the complete accepted
   and rejected partition with a reason for each rejection. A findings-free
   `ready` `dual|single` result applies F.
4. Any D1 finding, `not_ready`, or other schema-valid but
   compatibility-ineligible outcome appends one closed `Compatibility-repair-stop-receipt:`
   carrying that complete persisted draft evidence, sets the lifecycle plan
   `blocked` with request/input/accepted ids, and commits plan-only T. Malformed
   or mismatched output produces no T and must be recollected for exact D1.
   T is terminal and can never classify as D1 or F; D2 does not exist. A later
   session sees the blocked state and T; only a separately owner-authorized
   policy plan may define recovery.

“Plan-manager-owned” is a process precondition enforced by the skill and main
context. Git validation proves the one closed D1 byte transform and exact F
review binding. T persists every failed-attempt obligation; no discretionary
D2–D8 provenance exists to reconstruct.

## Interfaces & data shapes

### Path-specific compatibility tail

Keep `validateExecutionRange(...)` and
`LegacyExecutionRangeValidationV1` public shapes unchanged. Freeze
`LEGACY_START_TRANSITION_COMPATIBILITY_POLICY` and its SHA-256
`b224d8fc3f8ba6921aec38e834ec2f812954aff79859734e988fb03caf9f1253`
byte-for-byte; repair rules live in a separate internal
`LEGACY_FINAL_REVIEW_REPAIR_POLICY` constant with its own asserted JCS hash.
The pre-authority tail is:

```text
Q prerequisite plan commit
  → zero or more unrelated commits that do not change PLAN_PATH
  → optional D1 (exact M1–M12 plus optional updated; changes only PLAN_PATH)
  → zero or more unrelated commits that do not change PLAN_PATH
  → F (changes only PLAN_PATH; exact final receipt + attribution)
```

`execution_review_input_commit` is Q on the no-repair path, otherwise D1.
`execution_review_commit` is F. Existing E/R/B/Q SHA and receipt fields retain
their current meanings and values. Do not add request, bundle, receipt,
completion, cleanup, or execution-range schema keys.

### Durable terminal stop

`Compatibility-repair-stop-receipt: <compact JCS>` is a compatibility-local
machine record whose value is the ordinary schema-v1 `DraftReceipt` validated
against the exact D1 canonical input, including raw legs, full
accepted/rejected reconciliation, reproduced evidence, policy, and request.
Plan-manager writes it at most once only when a typed D1 result cannot authorize
F: any raw D1 finding, a passed `not_ready` leg, or a valid but
compatibility-ineligible outcome. In the same plan-only T commit it sets normal `blocked` lifecycle fields
with request id, input hash, and accepted ids. T deliberately has no success
grammar: the compatibility classifier rejects it before F, and a later session
must not re-review past it. A malformed/mismatched reviewer output yields no T;
it stops before any plan write and must be recollected for exact D1.

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
schema 1, the three exact source SHA-256 values, and the four true activation
booleans. Source, Codex, and Claude hashes must be equal for every named file.
On success it emits exactly the expected object's compact JCS plus LF; any path,
mode, symlink, containment, schema, hash, or extra-key mismatch exits nonzero
before an installed helper is executed.

### Restart classifier

Add one internal read-only CLI surface:

```text
review-policy.mjs repair-state <repo> <reviewed-head> <plan-path>
  <prerequisite-commit>
```

It runs the same bounded linear target-path traversal and emits one closed
`LegacyFinalReviewRepairStateV1` compact-JCS object:

```json
{"execution_review_commit":null,"prerequisite_commit":"<Q>","repair_commit":null,"schema":1,"state":"q","terminal_commit":null}
```

`state` is exactly `q|d1|terminal|f`. Q has all three nullable commits null; D1
sets only `repair_commit`; terminal sets `repair_commit=D1` and
`terminal_commit=T`; F sets `execution_review_commit=F` and sets
`repair_commit=D1` only on the repair path. The command validates exact Q,
authorization-bound D1, typed terminal T, or findings-free F bytes before
returning the state; mixed paths, merges, a second repair/F, malformed T/F,
unknown target bytes, a non-descendant head, or more than 4,096 inspected
commits fail without output. This is an internal operational projection, not a
change to `LegacyExecutionRangeValidationV1` or any public receipt schema.

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

Add one internal traversal that walks the linear ancestry from Q exclusive until
the first valid F or the requested pre-F head and classifies commits by whether
`changedPaths(parent, commit)` contains the target plan path. Inspect at most
4,096 total commits and at most one D1 before F.

- Reject a merge/multiple-parent commit on the inspected ancestry.
- Ignore a commit whose changed paths exclude the target plan.
- Reject a target-plan commit whose changed paths are not exactly `[PLAN_PATH]`.
- Reject exactly 4,097 inspected commits and a second target-plan repair before F.
- Final `execution-range` validation rejects no exact F before the bound.
  Read-only `repair-state` instead permits only an exact validated incomplete
  Q, D1, or terminal-T prefix at the requested head and returns that state; it
  never grants execution authority without F. Both reject a head not descending
  from Q.
- Once F is found, return to the unchanged generic post-F
  execution-accounting/`in_review`/completion path; do not feed later plan
  commits into D/F classification or invent a compatibility allowlist for them.

The first qualifying target-plan commit is F only when its persisted findings-free
`dual|single` receipt reviews the exact preceding plan-changing commit and its
bytes equal only `replaceDraftReceipt(input, receipt)` followed by
`appendSelfReviewAttribution(...)` plus the already-supported optional
frontmatter `updated` normalization. The sole earlier target-plan commit may be
exact D1; any second target-plan commit, T, or other delta rejects.

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
| 1 | Implement the bounded pre-authority plan-path traversal and restart classifier, closed repair-authorization and exact optional-D1 validators, terminal-T rejection, canonical release-cache-set validator, and frozen goldens while preserving public schemas and the generic post-F lifecycle. | `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs`; `scripts/tests/fixtures/plan-review-policy/sample-plan.md`; `scripts/tests/fixtures/plan-review-policy/legacy-0.12.5-no-repair.json` | — | planned | Focused positives pass for Q→F and authorized Q→D1→F at F, after a post-F unrelated commit, after real accounting/Step and `in_review` plan commits, and after completion receipt; `repair-state` emits exact q/d1/terminal/f objects for every restart point. Exact-bound histories pass; wrong/missing/extra authorization key/hash/evidence, limit+1, mixed-path/merge, second D, T, protected/evidence delta, stale/non-ready/finding F, altered attribution, and second F fail. Canonical cache-set positives pass; insecure expected files/directories and symlinked/noncanonical manager/review/helper files in either cache fail. All frozen policy, authorization, Q/D1, state, and output hashes match exactly. If D1/F cannot be distinguished without a schema or protected-contract change, STOP. |
| 2 | Update all source/shipped policy surfaces before mutation wiring so one exact Q→[D1]→F plus terminal-T contract is available to the surface oracle. | `docs/plans/AGENTS.md`; `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md`; `plugins/docks/skills/productivity/plan-init/SKILL.md`; `plugins/docks/skills/productivity/plan-manager/SKILL.md`; `plugins/docks/skills/productivity/plan-review/SKILL.md` | 1 | planned | Source/template repair prose is byte-identical, the focused surface case proves parity, plan-manager remains sole writer/reconciler and persists terminal T, plan-review remains read-only evidence-only, `docs/plans/AGENTS.md` stays at most 500 lines, its existing `CLAUDE.md` remains exactly `@AGENTS.md`, and only the three intentionally changed skill hashes require maintenance. `context-tree refresh docs/plans` is not run: the context-tree skill explicitly excludes `docs/plans/`, which is already a node. |
| 3 | Extend deterministic focused and mutation coverage without adding a second baseline, nested pool, or serial fallback. | `scripts/tests/plan-review-policy.mjs`; `scripts/tests/plan-review-policy-regressions.mjs` | 1, 2 | planned | A fast focused regression-contract case exact-checks the frozen 57-label prefix, 12-label suffix, full 69-label vector, uniqueness, hashes, selectors, and CI composition. Direct focused negatives cover every raw D1 structural/evidence add, delete, duplicate, reorder, mutate; wrong authorization; terminal-T success attempt; cache symlink/noncanonical/mode/path-swap; predictable-file replacement; and silent/partial-output Git-preflight failure. The one separately required full CI run executes all 69 mutations once through the existing machine-aware pool with declaration-order output, first-failure reporting, and owned-root cleanup unchanged. |
| 4 | Independently verify the worker diff and ordered acceptance inventory, run the separately recorded full CI once, then complete-review and ship the plan. | This plan; the ten implementation paths above read-only during verification; lifecycle target path immutable evidence-only | 1, 2, 3 | planned | Main context reproduces every claim and A1–A9 in order, including A8's history-sensitive execution-range proof and A9's Q-tail ancestry/merge/touch/budget proof, `node scripts/ci.mjs` exits 0 once after them, completion review passes, and the plan archives with an exact `ship_commit`. Any target-plan change before post-ship handoff, unexplained scope expansion, weakened negative, or worker plan edit is STOP. |

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
| A1 | `node --check plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs` | Exit 0 with no syntax error. |
| A2 | `node scripts/tests/plan-review-policy.mjs --case execution-compatibility` | Exit 0; frozen 0.12.5 Q→F outputs match byte-for-byte at F, a post-F unrelated head, an accounting/Step update, `in_review`, and completion receipt; exact authorization→D1→F and exact-bound positives pass; `repair-state` exact-matches closed q/d1/terminal/f outputs at every restart point; missing/wrong/extra authorization evidence, second D, terminal T as success, every closed pre-F ancestry/delta/evidence/receipt negative, every altered retained F/compatibility record, and every cache symlink/noncanonical/mode/private-file negative reject. Exact Q is never re-reviewed on the repair path; any D1 finding or typed incompatibility produces validated terminal T and can never reach F, while malformed output produces no T. Silent or expected-partial-output Git failures propagate before publication. |
| A3 | `node scripts/tests/plan-review-policy.mjs --case surfaces` | Exit 0; the Q→[D1]→F plus terminal-T policy block is exact across source/template/plan-manager/plan-review surfaces, ownership/read-only boundaries remain exact, and CI contains exactly one focused surface call plus one regression-driver `--self-test` call. |
| A4 | `node scripts/tests/plan-review-policy.mjs --case regression-contract` | Exit 0 quickly without launching mutation children; the ordered legacy 57, new 12, and full unique 69 label vectors exact-match hashes `2f73fb7a6bcacd417867e83fb5ba767e10601fe4d1e8dc0c305b112c4201b102`, `e6c8b0ed8fc087ccbc885cb4619e1f985eb1f743d16ca585b9410c6eba8a514d`, and `7c21ace02c5769ae5e4ade2ddd37e5b63ef46e6fba39421797c84aadf7b18ee0`, and every new label maps to its required focused selector/anchor. The separately recorded full CI command owns the single 69-case execution. |
| A5 | `node scripts/skills/content-hash.mjs --check-only plugins/docks/skills` | Exit 0 after final metadata maintenance; all shipped skill content hashes are synchronized. |
| A6 | `node scripts/tree/guard.mjs` | Exit 0; context-tree node pairs are valid. Policy-block content parity is proved by A3. |
| A7 | `BASE="$(node --input-type=module -e 'import fs from "node:fs"; import { parsePlan } from "./plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs"; const x=parsePlan(fs.readFileSync("docs/plans/active/compatibility-final-review-repair-rung.md")).frontmatter.execution_base_commit; if(!/^[0-9a-f]{40}$/.test(x)) process.exit(1); process.stdout.write(x)')" && git diff --check "$BASE"..HEAD` | Exit 0; the exact committed execution range, not merely the worktree, has no whitespace errors. |
| A8 | `BASE="$(node --input-type=module -e 'import fs from "node:fs"; import { parsePlan } from "./plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs"; const x=parsePlan(fs.readFileSync("docs/plans/active/compatibility-final-review-repair-rung.md")).frontmatter.execution_base_commit; if(!/^[0-9a-f]{40}$/.test(x)) process.exit(1); process.stdout.write(x)')" && HISTORY="$(git rev-list "$BASE"..HEAD -- docs/plans/active/relay-worker-lifecycle-primitives.md)" && WORKTREE="$(git status --porcelain -- docs/plans/active/relay-worker-lifecycle-primitives.md)" && test -z "$HISTORY" && test -z "$WORKTREE"` | Exit 0 with empty history and worktree results; either Git failure propagates before the emptiness tests, the evidence-only target was never changed by any commit in the execution range even transiently and later reverted, and it has no current staged, unstaged, or untracked change. |
| A9 | `Q=2ebba5dda939ffd68594d505511cf142ea76ee66 && git merge-base --is-ancestor "$Q" HEAD && MERGES="$(git rev-list --merges "$Q"..HEAD)" && TOUCHES="$(git rev-list "$Q"..HEAD -- docs/plans/active/relay-worker-lifecycle-primitives.md)" && COUNT="$(git rev-list --count "$Q"..HEAD)" && test -z "$MERGES" && test -z "$TOUCHES" && test "$COUNT" -le 4091` | Exit 0; Git failures propagate, Q is an ancestor, the whole Q→completion-head tail is linear and target-untouched, and at least five of the 4,096 inspected-commit slots remain for completion receipt, archive, release, D1, and F. |

## Post-ship release and lifecycle handoff

This section is ordered operational work after this plan is archived; it is not
part of the completion acceptance inventory. From clean `main`, plan-manager:

Steps 2–5 run in one current shell so the private activation paths remain
available. After any restart following publication, rerun steps 2 and 3; both
are idempotent and step 2 proves the exact immutable release before refreshing.
Before a target-plan write, run step 4's exact `repair-state` command over the
Q→HEAD target-path tail: exact Q applies D1 once; exact D1 skips application and
proceeds to its one review; terminal T stops; exact F skips review and proceeds
to step 5; any other state fails before output. A restart never reruns step 1,
reapplies D1, recollects past T, or creates a second F.

1. Runs this exact publication proof; any failed assertion stops before
   lifecycle Q changes:

   ```bash
   set -euo pipefail
   BRANCH="$(git branch --show-current)"
   STATUS="$(git status --porcelain)"
   CLAUDE_VERSION="$(jq -er '.version' plugins/docks/.claude-plugin/plugin.json)"
   CODEX_VERSION="$(jq -er '.version' plugins/docks/.codex-plugin/plugin.json)"
   CATALOG_VERSION="$(jq -er '.plugins[] | select(.name == "docks") | .version' .claude-plugin/marketplace.json)"
   test "$BRANCH" = main && test -z "$STATUS"
   test "$CLAUDE_VERSION" = 0.12.5 && test "$CODEX_VERSION" = 0.12.5 && test "$CATALOG_VERSION" = 0.12.5
   Q=2ebba5dda939ffd68594d505511cf142ea76ee66
   git merge-base --is-ancestor "$Q" HEAD
   MERGES="$(git rev-list --merges "$Q"..HEAD)"
   TOUCHES="$(git rev-list "$Q"..HEAD -- docs/plans/active/relay-worker-lifecycle-primitives.md)"
   COUNT="$(git rev-list --count "$Q"..HEAD)"
   test -z "$MERGES" && test -z "$TOUCHES" && test "$COUNT" -le 4093
   node scripts/release.mjs --plugin docks 0.12.6
   RELEASE_COMMIT="$(git rev-parse HEAD)"
   RELEASE_VERSION="$(jq -er '.version' plugins/docks/.codex-plugin/plugin.json)"
   export RELEASE_TAG="docks--v$RELEASE_VERSION"
   test "$RELEASE_VERSION" = 0.12.6
   TAG_COMMIT="$(git rev-parse "$RELEASE_TAG^{commit}")"
   REMOTE_MAIN="$(git ls-remote --heads origin refs/heads/main | awk 'NR==1 {print $1}')"
   REMOTE_TAG="$(git ls-remote origin "refs/tags/$RELEASE_TAG^{}" | awk 'NR==1 {print $1}')"
   test "$TAG_COMMIT" = "$RELEASE_COMMIT"
   test "$REMOTE_MAIN" = "$RELEASE_COMMIT" && test "$REMOTE_TAG" = "$RELEASE_COMMIT"
   RELEASE_URL="$(gh release view "$RELEASE_TAG" --json isDraft,isPrerelease,tagName,url --jq 'select(.isDraft == false and .isPrerelease == false and .tagName == env.RELEASE_TAG) | .url')"
   test -n "$RELEASE_URL"
   ```

2. Runs this idempotent publication-verification, refresh, and activation-setup
   stage immediately after step 1 or after any restart once `0.12.6` exists.
   It never invokes the release command:

   ```bash
   set -euo pipefail
   BRANCH="$(git branch --show-current)"
   STATUS="$(git status --porcelain)"
   RELEASE_VERSION="$(jq -er '.version' plugins/docks/.codex-plugin/plugin.json)"
   CLAUDE_VERSION="$(jq -er '.version' plugins/docks/.claude-plugin/plugin.json)"
   CATALOG_VERSION="$(jq -er '.plugins[] | select(.name == "docks") | .version' .claude-plugin/marketplace.json)"
   HEAD_COMMIT="$(git rev-parse HEAD)"
   export RELEASE_TAG="docks--v$RELEASE_VERSION"
   RELEASE_COMMIT="$(git rev-parse "$RELEASE_TAG^{commit}")"
   REMOTE_MAIN="$(git ls-remote --heads origin refs/heads/main | awk 'NR==1 {print $1}')"
   REMOTE_TAG="$(git ls-remote origin "refs/tags/$RELEASE_TAG^{}" | awk 'NR==1 {print $1}')"
   RELEASE_URL="$(gh release view "$RELEASE_TAG" --json isDraft,isPrerelease,tagName,url --jq 'select(.isDraft == false and .isPrerelease == false and .tagName == env.RELEASE_TAG) | .url')"
   test "$BRANCH" = main && test -z "$STATUS"
   test "$RELEASE_VERSION" = 0.12.6 && test "$CLAUDE_VERSION" = 0.12.6 && test "$CATALOG_VERSION" = 0.12.6
   git merge-base --is-ancestor "$RELEASE_COMMIT" "$HEAD_COMMIT"
   test "$REMOTE_MAIN" = "$RELEASE_COMMIT" && test "$REMOTE_TAG" = "$RELEASE_COMMIT"
   test -n "$RELEASE_URL"
   codex plugin marketplace upgrade docks --json
   codex plugin add docks@docks --json
   claude plugin update docks@docks --scope user
   codex plugin list | grep -F 'docks@docks' | grep -F '0.12.6'
   claude plugin list | grep -A3 -F 'docks@docks' | grep -F 'Version: 0.12.6'
   export ACTIVATION_DIR="$(mktemp -d /tmp/docks-0.12.6-activation.XXXXXX)"
   ACTIVATION_MODE="$(stat -c '%a' "$ACTIVATION_DIR")"
   test "$ACTIVATION_MODE" = 700
   node --input-type=module <<'NODE'
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
   expected.restart_classifier_closed=true;
   const hex={type:'string',pattern:'^[0-9a-f]{64}$'};
   const schema={type:'object',additionalProperties:false,required:Object.keys(expected),properties:{
     schema:{const:1},review_policy_sha256:hex,plan_manager_sha256:hex,plan_review_sha256:hex,
     d1_requires_closed_authorization:{const:true},any_d1_finding_terminal_t:{const:true},
     second_repair_forbidden:{const:true},restart_classifier_closed:{const:true}
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
   manual. The closed schema and expected keyed hash object come from step 2:

   ```bash
   codex exec --ephemeral --ignore-user-config --ignore-rules --strict-config \
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
   requires the closed persisted authorization, any D1 finding writes terminal
   blocked T, a second repair is forbidden, and restart classification is the
   closed q/d1/terminal/f state machine.
   Return only the required schema fields. Do not edit files or use network.
   PROMPT
   node --input-type=module <<'NODE'
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
   Q=2ebba5dda939ffd68594d505511cf142ea76ee66
   CACHE_PROOF="$(node plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs cache-set plugins/docks "$HOME/.codex/plugins/cache/docks/docks/0.12.6" "$HOME/.claude/plugins/cache/docks/docks/0.12.6" "$ACTIVATION_EXPECTED")"
   REPAIR_STATE="$(node plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs repair-state . HEAD docs/plans/active/relay-worker-lifecycle-primitives.md "$Q")"
   REPAIR_KIND="$(printf '%s' "$REPAIR_STATE" | jq -er '.state')"
   test -n "$CACHE_PROOF"
   case "$REPAIR_KIND" in q|d1|terminal|f) ;; *) exit 1 ;; esac
   printf '%s\n' "$REPAIR_STATE"
   ```

   The source `cache-set` command fail-closes on a missing, symlinked,
   noncanonical, wrong-mode, outside-root, or hash-mismatched helper/skill/cache
   file and emits exact compact JCS equal to the expected activation object.
   For `q`, plan-manager validates the committed closed repair authorization,
   commits only exact M1–M12 as D1 without another Q review, then reruns the
   classifier and requires `d1`. For `d1`, it discards every Q bundle and
   reviews exact D1 once. `terminal` is immediate STOP; `f` skips directly to
   step 5. Any D1 finding or
   compatibility-ineligible typed result writes T and stops; malformed output
   writes nothing and is recollected. Only a fresh findings-free `ready`
   `dual|single` result applies F.
5. Runs this self-contained proof in one current shell immediately after F:

   ```bash
   set -euo pipefail
   CODEX_POLICY="$HOME/.codex/plugins/cache/docks/docks/0.12.6/skills/productivity/plan-review/scripts/review-policy.mjs"
   CLAUDE_POLICY="$HOME/.claude/plugins/cache/docks/docks/0.12.6/skills/productivity/plan-review/scripts/review-policy.mjs"
   CACHE_PROOF="$(node plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs cache-set plugins/docks "$HOME/.codex/plugins/cache/docks/docks/0.12.6" "$HOME/.claude/plugins/cache/docks/docks/0.12.6" "$ACTIVATION_EXPECTED")"
   PLAN_COMMIT="$(git rev-parse HEAD)"
   EXPECTED_REVIEW_INPUT="$(git rev-list -1 "$PLAN_COMMIT^" -- docs/plans/active/relay-worker-lifecycle-primitives.md)"
   test -n "$CACHE_PROOF" && test -n "$PLAN_COMMIT" && test -n "$EXPECTED_REVIEW_INPUT"
   CODEX_RANGE="$(node "$CODEX_POLICY" execution-range . "$PLAN_COMMIT" docs/plans/active/relay-worker-lifecycle-primitives.md 12cf2ead208fe932084890b8e3fbd5c72591f3db de925e9bc046645a72f59bcd493da44d53adaf5a)"
   CLAUDE_RANGE="$(node "$CLAUDE_POLICY" execution-range . "$PLAN_COMMIT" docs/plans/active/relay-worker-lifecycle-primitives.md 12cf2ead208fe932084890b8e3fbd5c72591f3db de925e9bc046645a72f59bcd493da44d53adaf5a)"
   test "$CODEX_RANGE" = "$CLAUDE_RANGE"
   RANGE_REVIEW_COMMIT="$(printf '%s' "$CODEX_RANGE" | jq -er '.execution_review_commit')"
   RANGE_REVIEW_INPUT="$(printf '%s' "$CODEX_RANGE" | jq -er '.execution_review_input_commit')"
   RANGE_PREREQUISITE="$(printf '%s' "$CODEX_RANGE" | jq -er '.prerequisite_commit')"
   RANGE_EXECUTION_BASE="$(printf '%s' "$CODEX_RANGE" | jq -er '.execution_base_commit')"
   test "$RANGE_REVIEW_COMMIT" = "$PLAN_COMMIT"
   test "$RANGE_REVIEW_INPUT" = "$EXPECTED_REVIEW_INPUT"
   test "$RANGE_PREREQUISITE" = 2ebba5dda939ffd68594d505511cf142ea76ee66
   test "$RANGE_EXECUTION_BASE" = de925e9bc046645a72f59bcd493da44d53adaf5a
   printf '%s\n' "$CODEX_RANGE"
   ```

   The compact-JCS output must name exact D1 (or Q) as
   `execution_review_input_commit`, Q as `prerequisite_commit`, F as
   `execution_review_commit`, and the unchanged execution base. Only then may
   lifecycle implementation resume.

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
- `node scripts/release.mjs --help` is not a help command; it enters CI before
  rejecting the argument. Use only the documented `--dry-run --plugin docks
  patch` form for a deliberate preview, or the exact authorized release command
  in the post-ship handoff.

## Global constraints

- Plan-manager is the sole plan writer, review dispatcher, finding reconciler,
  lifecycle mutator, and release operator.
- Workers never push, tag, publish, release, or edit either active plan.
- No destructive Git, force, history rewrite, or branch deletion.
- Every passed reviewer must be `ready` with zero findings; `not_ready` has no
  override.
- Preserve standing cross-company consent, host-policy degradation recording,
  and the no-session-relay schema-v1 review boundary.
- Run `node scripts/ci.mjs` before every commit.
- Do not loosen validator floors, mutation oracles, output ordering, cleanup,
  or exact hash/ancestry checks to make tests pass.
- Any further change to this plan's Goal/deliverable or to the lifecycle
  primitive Goal/deliverable is a user HARD STOP. The explicit owner
  authorization recorded in Self-review covers only this reviewed reduction
  from speculative D2–D8 repairs to optional exact D1 plus terminal T.

## STOP conditions

- A repair commit cannot be validated without changing an existing public
  schema or accepting an unreviewed input.
- Path-specific traversal cannot reject pre-F merges, mixed-path commits, stale
  receipts, more than 4,096 inspected commits, or a second repair; or it
  changes the generic post-F accounting/`in_review`/completion behavior.
- Preserving E/R/B/Q records conflicts with making F review exact D1 bytes.
- The 0.12.5 no-repair Q→F path or strict legacy corpus changes behavior.
- A worker needs to edit the lifecycle plan, Session Relay, Effect Kit, release
  manifests, or an unlisted path.
- Focused or mutation tests require weakening an existing negative or creating a
  second full baseline.
- A reviewer finds a change to Goal/deliverable or an unresolved execution
  ambiguity.

## Cold-handoff checklist

- [x] File manifest: all ten implementation paths, this plan, and the
  evidence-only lifecycle target are explicit.
- [x] Environment and commands: Node 24, focused/mutation/content/tree/full CI,
  committed-range whitespace, and post-ship release commands are exact.
- [x] Interface contract: Q→[D1]→F traversal, terminal T, D1 invariant, F
  binding, and unchanged output schema/post-F completion reuse are defined.
- [x] Executable acceptance: A1–A9 are commands with binary expected results;
  project CI is recorded separately and release is post-ship.
- [x] Out of scope: lifecycle implementation, other plugins, schemas, strict
  start recognition, and worker release operations are excluded.
- [x] Decision rationale: optional D1/terminal T, total bound, path-specific
  ancestry, frozen legacy evidence, and protected partitions explain the
  non-obvious choices.
- [x] Known gotchas: stale receipt, R-receipt retention, canonical/raw delta,
  line budget, parallel matrix, ephemeral Q evidence, and release CLI behavior
  are explicit.
- [x] Global constraints: sole writer, review eligibility, CI, release, and hard
  stops are copied into this file.
- [x] No undefined terms: Q, D1, T, F, E/R/B records, PLAN_PATH, I, and both
  output commit fields are defined above.

Adversarial cold-read result: a fresh worker can implement only the Docks policy
and tests without touching lifecycle Q. A fresh orchestrator can verify frozen
0.12.5 no-repair/post-F behavior, the optional D1 path, terminal T, the exact mutation
inventory, complete the plan, release one Docks patch, refresh both caches, then
validate the closed authorization, apply exact D1, and review exact D1. No executor must guess whether
unrelated commits count, which plan bytes may change, what binds F, how many
commits/repairs are allowed, what evidence is durable, or who may release.

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
Codex writes. Typed D1 incompatibility alone writes T; malformed output writes
nothing. Fresh review is required.

Their closure passes then found five concrete leftovers: the authorization's
M12 selector digest had one transposed nibble; restart verification equated
post-D1/F `HEAD` with the release tag; the restart classifier had no executable
surface; Known gotchas still instructed a second Q review; and an undefined
“same-input anomaly” straddled the T/no-T boundary. The record now carries the
recomputed exact selector and JCS digest; step 2 derives the immutable release
commit from its tag and accepts local descendants; `repair-state` defines and
drives a closed q/d1/terminal/f projection; the stale Q instruction is removed;
and only schema-valid compatibility-ineligible D1 results write T. Fresh review
is required. The final executable closure pass also separated `repair-state`'s
validated incomplete Q/D1/T prefixes from `execution-range`'s mandatory F, so
the restart projection cannot accidentally grant execution authority.

The initial design considered silently treating the valid Q finding as
nonblocking, writing it into F, or inserting an ordinary plan commit. All three
are rejected: `not_ready` has no override, F would review different bytes, and
0.12.5 explicitly rejects an intervening commit. The selected repair rung is
now intentionally specific rather than general: exact optional D1 solves the
only durable finding, terminal T preserves any incompatible review obligation,
and neither broadens legacy start recognition nor invents discretionary repair
authority.

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
