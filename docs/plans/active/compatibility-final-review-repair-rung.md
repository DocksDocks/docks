---
title: Add a bounded compatibility final-review repair rung
goal: Let legacy compatibility plans repair valid findings after Q and re-review exact repaired bytes without weakening E/R/B/Q or execution authority.
status: planned
created: "2026-07-14T01:52:16-03:00"
updated: "2026-07-14T03:21:37-03:00"
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
`Q → F` to `Q → D* → F`, where `D*` is zero to eight plan-manager-owned,
plan-only repair commits produced in response to valid final-review findings.
The existing no-repair and post-F completion-reuse paths remain byte-compatible.
Each D repair preserves the plan Goal, deliverable, implementation scope,
lifecycle identity, E/R/B/Q records, completed Step P state, and every protected
executable contract. F must
review the exact final D input (or Q when there is no D), and the unchanged
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

Why zero to eight D commits: zero preserves all existing compatible histories,
more than one supports the ordinary repair-and-repeat review loop, and eight
matches the plan authoring hard cap. A separate 4,096-commit Q→F inspection cap
bounds unrelated history. Unrelated commits that do not change the target plan
path are ignored by the path-specific snapshot, including the Docks policy
implementation and release that must land after the already-committed Q. A
commit that changes the target plan and any other path is never D or F.

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
Completion runs that exact project CI command once, separately, after A1–A8.
The release command is post-ship and is never completion acceptance evidence.

Before implementation dispatch, main-context plan-manager runs this exact
read-only baseline proof from the repository root. It verifies the current
target-plan blob is Q, extracts the plan's M1–M12 array, requires every selector
exactly once in order, applies it, and recomputes both declared D1 hashes:

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { canonicalPlanView, jcs, sha256 } from './plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs';
const q='2ebba5dda939ffd68594d505511cf142ea76ee66', target='docs/plans/active/relay-worker-lifecycle-primitives.md';
const blob='79769c6c7b5bfc4d65ac1adc88a591aaeb7bb674', qsha='ff99ebcf70b0aa4b45664068d38a2471e8e93b342736c636fb57361a59a8879b';
const d1sha='0980868eb835f9d76f058d14e79ae3ec4452a9d7f10cd93243eadc8f690ee4a5', canonical='4cb8542401835d7e384c97c999e34ba5bd3c600b9b34f15f1f07be6ce9a168b3';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
if(git('rev-parse',`${q}:${target}`)!==blob||git('rev-parse',`HEAD:${target}`)!==blob) throw Error('Q baseline blob drift');
const bytes=execFileSync('git',['show',`${q}:${target}`]);
if(sha256(bytes)!==qsha) throw Error('Q baseline byte drift');
const text=fs.readFileSync('docs/plans/active/compatibility-final-review-repair-rung.md','utf8');
const match=text.match(/### Exact D1 application[\s\S]*?```json\n(\[[\s\S]*?\n\])\n```/);
if(!match) throw Error('D1 mutation array missing');
const mutations=JSON.parse(match[1]), ids=Array.from({length:12},(_,i)=>`M${i+1}`);
if(JSON.stringify(mutations.map(({id})=>id))!==JSON.stringify(ids)) throw Error('D1 mutation order');
if(sha256(jcs(mutations))!=='8fc04a0279ebce363c140b5cc6e91e7c431a436ad4d9a33aeb5a278c498bf675') throw Error('D1 mutation-array hash');
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

### Findings-driven D loop

For input I0=Q, then Ii=Di:

1. Seal and dispatch a fresh ordinary schema-v1 review of Ii.
2. Main-context plan-manager reproduces every X/S finding and records an exact
   accepted/rejected partition with a reason for each rejection. Reviewer
   disagreement is preserved; any passed `not_ready` leg keeps the input
   ineligible.
3. Never apply or persist an ineligible receipt over Q's immutable R receipt.
   D1 is the one exception to the ordinary “accepted findings on this attempt”
   predicate: this committed plan durably records the already reproduced S1 and
   authorizes the exact mandatory M1–M12 application below even if the fresh Q
   reviewer does not repeat S1. Before D1, map every accepted fresh-Q finding to
   one or more M1–M12 replacements and prove those replacements fully resolve
   it. Any accepted Q finding not completely resolved by that exact mapping is
   a HARD STOP before D1; it is never carried transiently, silently dropped, or
   deferred hoping the D1 reviewer repeats it. From D1 onward, no accepted
   finding, no material repair, or the same input hash after a terminal review
   is STOP.
4. Apply exactly D1 first. Thereafter apply at most one plan-only D commit for
   all accepted findings that fit the closed D2–D8 transform, destroy the stale
   bundle, and return to step 1 with fresh bytes. A finding requiring a
   protected-contract, Goal, or deliverable change is a user HARD STOP, not a
   wider D.
5. After eight D commits, a ninth repair attempt is STOP. Only a fresh
   findings-free `ready` `dual|single` result applies F.

“Plan-manager-owned” is a process precondition enforced by the skill and main
context. Git validation proves the closed D byte transform and exact F review
binding; it does not infer authorship or reconstruct unpersisted negative-review
provenance.

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
  → D1 … Dn (0 <= n <= 8; each changes only PLAN_PATH)
  → zero or more unrelated commits that do not change PLAN_PATH
  → F (changes only PLAN_PATH; exact final receipt + attribution)
```

`execution_review_input_commit` is Q when `n=0`, otherwise Dn.
`execution_review_commit` is F. Existing E/R/B/Q SHA and receipt fields retain
their current meanings and values. Do not add request, bundle, receipt,
completion, cleanup, or execution-range schema keys.

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
the first valid F and classifies commits by whether
`changedPaths(parent, commit)` contains the target plan path. Inspect at most
4,096 total commits and at most eight D commits before F.

- Reject a merge/multiple-parent commit on the inspected ancestry.
- Ignore a commit whose changed paths exclude the target plan.
- Reject a target-plan commit whose changed paths are not exactly `[PLAN_PATH]`.
- Reject exactly 4,097 inspected commits and a ninth D before F.
- Reject no exact F before the bound or a reviewed head not descending from Q.
- Once F is found, return to the unchanged generic post-F
  execution-accounting/`in_review`/completion path; do not feed later plan
  commits into D/F classification or invent a compatibility allowlist for them.

The first qualifying target-plan commit is F only when its persisted findings-free
`dual|single` receipt reviews the exact preceding plan-changing commit and its
bytes equal only `replaceDraftReceipt(input, receipt)` followed by
`appendSelfReviewAttribution(...)` plus the already-supported optional
frontmatter `updated` normalization. Every earlier target-plan commit is D.

### D repair invariant

For each D, compare its preceding plan-changing input bytes with D bytes and
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
   protocol alignment required to make D/F prose truthful; they need not be
   rediscovered by the fresh Q reviewer. M11–M12 are the reproduced S1 repair.
   No plan-manager prose choice remains. D1 may append no other Self-review or
   Mistakes text.
5. D2–D8 may change only the unique `Adversarial cold-read result:` paragraph,
   the unique current `Author self-score:` paragraph, append non-machine
   Self-review prose, and append whole Mistakes bullets matching this
   repository's timestamp grammar. The D1 Environment/P migration is
   thereafter exact.
6. `## Goal`, `## Interfaces & data shapes`, `## Acceptance criteria`,
   `## Execution gate catalogue`, `## Out of scope / do-NOT-touch`,
   `## Global constraints`, `## STOP conditions`, and `## Review` are exact in
   every D. D1's explicit P fragments are the sole Steps exception.
7. Compare an ordered raw evidence vector before/after each D: every unfenced
   machine-record line; compatibility material/application/receipt and binding;
   the prerequisite fenced receipt; Review/Bootstrap/Completion records; and
   every Cross-check-family line. Add/delete/duplicate/reorder/mutate all fail.
8. At least one allowed non-`updated` byte changes. An updated-only, receipt-only,
   or evidence-only D is rejected.

### Exact D1 application

Each `before` and `after` below is an exact LF UTF-8 substring with no implicit
leading/trailing whitespace or newline. Each `before` occurs exactly once in Q;
apply M1→M12 in order, reject a missing/duplicate selector, and permit only one
independent ISO `updated` replacement. The compact JCS of this ordered array has
SHA-256 `8fc04a0279ebce363c140b5cc6e91e7c431a436ad4d9a33aeb5a278c498bf675`.

```json
[
  {"id":"M1","before":"Final ordinary review seals Q, then plan-manager commits only the mandatory derived Cross-check attribution, replacement schema-v1 `Review-receipt:`, and optional `updated` as F.","after":"Final ordinary review seals the current repair input I (Q when no repair is needed, otherwise Dn), then plan-manager commits only the mandatory derived Cross-check attribution, replacement schema-v1 `Review-receipt:`, and optional `updated` as F.","before_sha256":"604a6f8a94b680c7457cf61295232345364d081c5bf6e0d2b575874c5ac68bdc","after_sha256":"2e6ea3c6fe5db241377da4719005e4da7f22895d033c56b054d3e74a6c24ab5f"},
  {"id":"M2","before":"the receipt's `reviewed_commit=Q`, findings-free `dual|single`, and retained E/R/B/Q bytes.","after":"the receipt's `reviewed_commit=I`, findings-free `dual|single`, retained E/R/B/Q bytes, and every intervening D byte under the released repair policy.","before_sha256":"ee4eec41b37cb4fe224e79ca658509bb76b6944a16e5fbcd3f2e478d276ded07","after_sha256":"1bcad2184091ed6d8d1f503bbd591584d4c46a7a2007e8abc5e69eca7131e007"},
  {"id":"M3","before":"(5) ordinary findings-only review the exact Q blob, require `dual|single`, apply its mandatory attribution and replacement receipt, and commit F.","after":"(5) ordinary findings-only review the current input I0=Q or Ii=Di; on accepted findings, apply one exact plan-only D(i+1), discard the stale bundle, and repeat; require a fresh findings-free `dual|single` result on I, then apply only its mandatory attribution and replacement receipt and commit F.","before_sha256":"b2b7c9b91d77d933bfdda198a03df05a9e97d4d4b828343fd26e09429a1a0345","after_sha256":"49e2f6f70cef757887d19793c511070db9c8af36b62493a8b46919dee2e953c2"},
  {"id":"M4","before":"No implementation path changes in E/R/B/Q/F.","after":"No implementation path changes in E/R/B/Q/D*/F.","before_sha256":"860b8bc7a97179cdb5e852b573e21b8ebe0179f2a15f44502e411f8dca6dd509","after_sha256":"b52de2b0275931ab1b05d00d560fe3206fb6f19a41ae30b4b66fbd40832277fc"},
  {"id":"M5","before":"require the ordinary F receipt to bind reviewed commit Q with findings-free `dual|single`.","after":"require the ordinary F receipt to bind reviewed commit I (Q or Dn) with findings-free `dual|single`.","before_sha256":"2c094f692e57503f04de7f94cda079d2c6e4d796cb5717700d2d81b548e2f848","after_sha256":"07146906b5009d59efd4de4eeadb1602aa51a34587543241e6ecc2e035cf71d3"},
  {"id":"M6","before":"commit prerequisite closure Q with P `done`, then obtain findings-free final ordinary review F","after":"commit prerequisite closure Q with P `done`, repair accepted final-review findings only through D*, then obtain findings-free final ordinary review F","before_sha256":"d0c2f5df598522a07dae42806bb6fa43d9f862904a5b8912898be63fce546ad2","after_sha256":"8297e02831d4c74f38a81993ff274a0949b90a7038abd79a823ab2bb13615c0f"},
  {"id":"M7","before":"plan-manager-only E/R/B/Q/F writes","after":"plan-manager-only E/R/B/Q/D*/F writes","before_sha256":"d478a4b36cc0819c9701efb42dc6ab30161ae89f2dfd05399ee8917e7cd07399","after_sha256":"17a392707944387e20a045bcbf2286075a6ed9d97175576afd84e1282f9358ae"},
  {"id":"M8","before":"F's findings-free `dual|single` receipt reviews Q.","after":"F's findings-free `dual|single` receipt reviews Dn when repairs exist, otherwise Q.","before_sha256":"f4b38a2f8790df6fa4c68978e02f4cac73d2142f49ae9493a0b5c8baed67bf73","after_sha256":"a2608c3e23a438583ef52515c43fdbae3dcf59f2c2b82e30544590339e3cc50e"},
  {"id":"M9","before":"The current plan retains exact E material/receipt, immutable R review, B binding, Q prerequisite evidence, and F receipt.","after":"The current plan retains exact E material/receipt, immutable R review, B binding, Q prerequisite evidence, every validated D, and F receipt.","before_sha256":"5501857d0c8ab4788b1e263ab680bb1df4fa50a3bed3cbbf60aaa3696088dc99","after_sha256":"5927d4e9b3be8c993e6213275a43330f8c3e2514ae21913086671980a83d4bfe"},
  {"id":"M10","before":"E/R/B/Q/F gap","after":"E/R/B/Q/D*/F gap","before_sha256":"f0a893512debef727bc44d12569d78672a645bdaae4a562bdae67908daeef018","after_sha256":"2bfc1c726a6587c4a6932bbd8937c45907f8cc8c72e69b4de4c77cbf1227dc23"},
  {"id":"M11","before":"Execution stays paused until the related Docks compatibility policy is independently reviewed, released, installed, and this plan carries eligible compatibility evidence plus a fresh ordinary review receipt.","after":"The compatibility policy is independently reviewed, released, installed, and Q carries eligible compatibility evidence; execution stays paused only until accepted final-review findings are repaired and a fresh findings-free ordinary review receipt is applied as F.","before_sha256":"a525e95609c272329ae346fe7991da03bcb481e84bbd0385e5fa7730bf028703","after_sha256":"486411bb39e69efbbd732411be38eda812e070b673bb9e22c20fd85520a75d82"},
  {"id":"M12","before":"Author self-score: **99/100 (Draft-45 prerequisite-constructor alignment, blocked on exact-byte review and Step P)** · trajectory **97→fresh reviews NOT READY→99** · stopped: **plateau (K=3)**. Execution eligibility requires the released validator, exact E/R/B/Q/F chain, and F commit/blob as sole dispatch authority.","after":"Author self-score: **99/100 (Draft-45 prerequisite complete; blocked only on final-review repair and exact-byte re-review)** · trajectory **97→fresh reviews NOT READY→99** · stopped: **plateau (K=3)**. Execution eligibility requires the released validator, exact E/R/B/Q/D*/F chain, and F commit/blob as sole dispatch authority.\n\n**Draft-46 final-review repair (2026-07-14):** a fresh exact-Q S reviewer scored 94 NOT READY with one medium finding, S1; main-context reproduction accepted it. Step P and Docks 0.12.5 are complete, but the cold-read and author-score status remained stale. The released bounded repair policy permits this exact plan-only D1 migration: Environment and Step P now describe Q→D*→F, the stale status prose records the completed prerequisite and pending final review, and all E/R/B/Q evidence, implementation contracts, Goal, steps, acceptance schedule, and source-versus-packaged boundary remain exact. A fresh findings-free review of D1 must bind D1 before F can authorize execution.","before_sha256":"8365ebb88d0363e530237396294e2a15b4d9e0aeccfe8c43080cd2d2c97abdfa","after_sha256":"a3b3b0f092806064f608580b73bd232511133cf33efd0a693586207a91bc19c9"}
]
```

After normalizing D1's `updated` raw line back to Q's exact raw line, the full
D1 plan blob SHA-256 is
`0980868eb835f9d76f058d14e79ae3ec4452a9d7f10cd93243eadc8f690ee4a5`.
Its canonical plan input SHA-256 is
`4cb8542401835d7e384c97c999e34ba5bd3c600b9b34f15f1f07be6ce9a168b3`.
The sample fixture contains the exact Q fragments and the frozen compatibility
fixture stores both expected D1 hashes; duplicate/missing selector, order,
substring, Unicode, LF, and postimage mutations reject.

The helper proves this byte transform, not that Git authorship was plan-manager
or that a D corresponds to an unpersisted reviewer finding. Those remain the
findings-loop process preconditions above.

### Final receipt binding

F uses the existing schema-v1 draft receipt. Its `reviewed_commit`, request
`reviewed_commit_or_head`, and `input_sha256` must bind Dn (or Q) and that exact
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
golden byte-for-byte before any D positive is considered.

## Steps

| # | Task | Files | Depends | Status | Done condition / STOP trigger |
|---|---|---|---|---|---|
| 1 | Implement the bounded pre-authority plan-path traversal, exact D1/D2–D8 validators, and frozen goldens while preserving public schemas and the generic post-F lifecycle. | `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs`; `scripts/tests/fixtures/plan-review-policy/sample-plan.md`; `scripts/tests/fixtures/plan-review-policy/legacy-0.12.5-no-repair.json` | — | planned | Focused positives pass for Q→F and Q→D{1,8}→F at F, after a post-F unrelated commit, after real accounting/Step and `in_review` plan commits, and after completion receipt. Exact-bound histories pass; limit+1, mixed-path/merge, ninth-D, protected/evidence delta, stale/non-ready/finding F, altered attribution, and second-F fail. All frozen policy, Q/D1, and output hashes match exactly. If D/F cannot be distinguished without a schema or protected-contract change, STOP. |
| 2 | Update all source/shipped policy surfaces before mutation wiring so one exact Q→D*→F contract is available to the surface oracle. | `docs/plans/AGENTS.md`; `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md`; `plugins/docks/skills/productivity/plan-init/SKILL.md`; `plugins/docks/skills/productivity/plan-manager/SKILL.md`; `plugins/docks/skills/productivity/plan-review/SKILL.md` | 1 | planned | Source/template repair prose is byte-identical, the focused surface case proves parity, plan-manager remains sole writer/reconciler, plan-review remains read-only evidence-only, `docs/plans/AGENTS.md` stays at most 500 lines, its existing `CLAUDE.md` remains exactly `@AGENTS.md`, and only the three intentionally changed skill hashes require maintenance. `context-tree refresh docs/plans` is not run: the context-tree skill explicitly excludes `docs/plans/`, which is already a node. |
| 3 | Extend deterministic focused and mutation coverage without adding a second baseline, nested pool, or serial fallback. | `scripts/tests/plan-review-policy.mjs`; `scripts/tests/plan-review-policy-regressions.mjs` | 1, 2 | planned | A fast focused regression-contract case exact-checks the frozen 57-label prefix, 12-label suffix, full 69-label vector, uniqueness, hashes, selectors, and CI composition. Direct focused negatives cover every raw structural/evidence add, delete, duplicate, reorder, and mutate operation. The one separately required full CI run executes all 69 mutations once through the existing machine-aware pool with declaration-order output, first-failure reporting, and owned-root cleanup unchanged. |
| 4 | Independently verify the worker diff and ordered acceptance inventory, run the separately recorded full CI once, then complete-review and ship the plan. | This plan; the ten implementation paths above read-only during verification; lifecycle target path immutable evidence-only | 1, 2, 3 | planned | Main context reproduces every claim and A1–A8 in order, including A8's history-sensitive proof that the lifecycle target was never touched anywhere in this plan's execution range, `node scripts/ci.mjs` exits 0 once after them, completion review passes, and the plan archives with an exact `ship_commit`. Any target-plan change before post-ship handoff, unexplained scope expansion, weakened negative, or worker plan edit is STOP. |

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
| A2 | `node scripts/tests/plan-review-policy.mjs --case execution-compatibility` | Exit 0; frozen 0.12.5 Q→F outputs match byte-for-byte at F, a post-F unrelated head, an accounting/Step update, `in_review`, and completion receipt; exact D1 postimage plus Q→D*→F positives pass for 1/8 D and exact-bound histories; every closed pre-F ancestry/delta/evidence/receipt negative and every altered retained F/compatibility record rejects. A fresh-Q accepted finding not resolved by M1–M12 remains ineligible even when the D1 reviewer returns findings-free ready. |
| A3 | `node scripts/tests/plan-review-policy.mjs --case surfaces` | Exit 0; the Q→D*→F policy block is exact across source/template/plan-manager/plan-review surfaces, ownership/read-only boundaries remain exact, and CI contains exactly one focused surface call plus one regression-driver `--self-test` call. |
| A4 | `node scripts/tests/plan-review-policy.mjs --case regression-contract` | Exit 0 quickly without launching mutation children; the ordered legacy 57, new 12, and full unique 69 label vectors exact-match hashes `2f73fb7a6bcacd417867e83fb5ba767e10601fe4d1e8dc0c305b112c4201b102`, `e6c8b0ed8fc087ccbc885cb4619e1f985eb1f743d16ca585b9410c6eba8a514d`, and `7c21ace02c5769ae5e4ade2ddd37e5b63ef46e6fba39421797c84aadf7b18ee0`, and every new label maps to its required focused selector/anchor. The separately recorded full CI command owns the single 69-case execution. |
| A5 | `node scripts/skills/content-hash.mjs --check-only plugins/docks/skills` | Exit 0 after final metadata maintenance; all shipped skill content hashes are synchronized. |
| A6 | `node scripts/tree/guard.mjs` | Exit 0; context-tree node pairs are valid. Policy-block content parity is proved by A3. |
| A7 | `BASE="$(node --input-type=module -e 'import fs from "node:fs"; import { parsePlan } from "./plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs"; const x=parsePlan(fs.readFileSync("docs/plans/active/compatibility-final-review-repair-rung.md")).frontmatter.execution_base_commit; if(!/^[0-9a-f]{40}$/.test(x)) process.exit(1); process.stdout.write(x)')" && git diff --check "$BASE"..HEAD` | Exit 0; the exact committed execution range, not merely the worktree, has no whitespace errors. |
| A8 | `BASE="$(node --input-type=module -e 'import fs from "node:fs"; import { parsePlan } from "./plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs"; const x=parsePlan(fs.readFileSync("docs/plans/active/compatibility-final-review-repair-rung.md")).frontmatter.execution_base_commit; if(!/^[0-9a-f]{40}$/.test(x)) process.exit(1); process.stdout.write(x)')" && HISTORY="$(git rev-list "$BASE"..HEAD -- docs/plans/active/relay-worker-lifecycle-primitives.md)" && WORKTREE="$(git status --porcelain -- docs/plans/active/relay-worker-lifecycle-primitives.md)" && test -z "$HISTORY" && test -z "$WORKTREE"` | Exit 0 with empty history and worktree results; either Git failure propagates before the emptiness tests, the evidence-only target was never changed by any commit in the execution range even transiently and later reverted, and it has no current staged, unstaged, or untracked change. |

## Post-ship release and lifecycle handoff

This section is ordered operational work after this plan is archived; it is not
part of the completion acceptance inventory. From clean `main`, plan-manager:

1. Runs this exact publication/refresh proof; any failed assertion stops before
   lifecycle Q changes:

   ```bash
   set -euo pipefail
   test "$(git branch --show-current)" = main
   test -z "$(git status --porcelain)"
   test "$(jq -er '.version' plugins/docks/.claude-plugin/plugin.json)" = 0.12.5
   test "$(jq -er '.version' plugins/docks/.codex-plugin/plugin.json)" = 0.12.5
   test "$(jq -er '.plugins[] | select(.name == "docks") | .version' .claude-plugin/marketplace.json)" = 0.12.5
   node scripts/release.mjs --plugin docks 0.12.6
   RELEASE_COMMIT="$(git rev-parse HEAD)"
   RELEASE_VERSION="$(jq -er '.version' plugins/docks/.codex-plugin/plugin.json)"
   export RELEASE_TAG="docks--v$RELEASE_VERSION"
   test "$RELEASE_VERSION" = 0.12.6
   test "$(git rev-parse "$RELEASE_TAG^{commit}")" = "$RELEASE_COMMIT"
   test "$(git ls-remote --heads origin refs/heads/main | awk 'NR==1 {print $1}')" = "$RELEASE_COMMIT"
   test "$(git ls-remote origin "refs/tags/$RELEASE_TAG^{}" | awk 'NR==1 {print $1}')" = "$RELEASE_COMMIT"
   RELEASE_URL="$(gh release view "$RELEASE_TAG" --json isDraft,isPrerelease,tagName,url --jq 'select(.isDraft == false and .isPrerelease == false and .tagName == env.RELEASE_TAG) | .url')"
   test -n "$RELEASE_URL"
   codex plugin marketplace upgrade docks --json
   codex plugin add docks@docks --json
   claude plugin update docks@docks --scope user
   codex plugin list | grep -F 'docks@docks' | grep -F '0.12.6'
   claude plugin list | grep -A3 -F 'docks@docks' | grep -F 'Version: 0.12.6'
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
   const expected={schema:1};
   for(const [key,rel] of Object.entries(files)) {
     const sourcePath=path.join(source,rel), codexPath=path.join(codex,rel), claudePath=path.join(claude,rel);
     assert.ok(fs.statSync(sourcePath).isFile()&&fs.statSync(codexPath).isFile()&&fs.statSync(claudePath).isFile());
     expected[key]=sha(sourcePath);
     assert.equal(sha(codexPath),expected[key]);
     assert.equal(sha(claudePath),expected[key]);
   }
   expected.accepted_q_finding_mapping_required=true;
   expected.unresolved_q_finding_hard_stop_before_d1=true;
   const hex={type:'string',pattern:'^[0-9a-f]{64}$'};
   const schema={type:'object',additionalProperties:false,required:Object.keys(expected),properties:{
     schema:{const:1},review_policy_sha256:hex,plan_manager_sha256:hex,plan_review_sha256:hex,
     accepted_q_finding_mapping_required:{const:true},unresolved_q_finding_hard_stop_before_d1:{const:true}
   }};
   fs.writeFileSync('/tmp/docks-0.12.6-activation-expected.json',JSON.stringify(expected)+'\n',{mode:0o600});
   fs.writeFileSync('/tmp/docks-0.12.6-activation-schema.json',JSON.stringify(schema)+'\n',{mode:0o600});
   NODE
   ```

2. After step 1 has written the two mode-0600 `/tmp` inputs, launches this exact
   fresh, ephemeral, explicit-model,
   read-only Codex process after refresh. The flags are current Codex CLI
   surfaces verified from `codex exec --help` and the official non-interactive
   manual. The closed schema and expected keyed hash object come from step 1:

   ```bash
   codex exec --ephemeral --ignore-user-config --ignore-rules --strict-config \
     -C /home/vagrant/projects/docks -m gpt-5.6-sol \
     -c 'model_reasoning_effort="xhigh"' -s read-only \
     --output-schema /tmp/docks-0.12.6-activation-schema.json \
     -o /tmp/docks-0.12.6-activation-actual.json - <<'PROMPT'
   Read only these exact installed Docks 0.12.6 files under
   /home/vagrant/.codex/plugins/cache/docks/docks/0.12.6:
   skills/productivity/plan-review/scripts/review-policy.mjs,
   skills/productivity/plan-manager/SKILL.md, and
   skills/productivity/plan-review/SKILL.md. Hash each file's raw bytes with
   SHA-256. From the two installed skill contracts, determine whether every
   accepted fresh-Q finding must map completely to the authorized D1 mutations
   and whether any unresolved accepted Q finding is a HARD STOP before D1.
   Return only the required schema fields. Do not edit files or use network.
   PROMPT
   node --input-type=module <<'NODE'
   import assert from 'node:assert/strict';
   import fs from 'node:fs';
   const expected=JSON.parse(fs.readFileSync('/tmp/docks-0.12.6-activation-expected.json','utf8'));
   const actual=JSON.parse(fs.readFileSync('/tmp/docks-0.12.6-activation-actual.json','utf8'));
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
3. Discards the ephemeral current Q bundle as authority, seals a fresh ordinary
   schema-v1 review of lifecycle Q
   `2ebba5dda939ffd68594d505511cf142ea76ee66`, and follows the findings-driven
   loop above. Reproduce/reconcile each fresh finding; commit only exact M1–M12
   as mandatory D1 under this plan's durable accepted-S1 record; re-review D1;
   add D2–D8 only for new accepted material findings within the closed grammar;
   apply F only after a fresh findings-free `ready` `dual|single` result.
4. Runs this self-contained proof in one current shell immediately after F:

   ```bash
   set -euo pipefail
   CODEX_POLICY="$HOME/.codex/plugins/cache/docks/docks/0.12.6/skills/productivity/plan-review/scripts/review-policy.mjs"
   CLAUDE_POLICY="$HOME/.claude/plugins/cache/docks/docks/0.12.6/skills/productivity/plan-review/scripts/review-policy.mjs"
   PLAN_COMMIT="$(git rev-parse HEAD)"
   test -n "$PLAN_COMMIT" && test -f "$CODEX_POLICY" && test -f "$CLAUDE_POLICY"
   CODEX_RANGE="$(node "$CODEX_POLICY" execution-range . "$PLAN_COMMIT" docs/plans/active/relay-worker-lifecycle-primitives.md 12cf2ead208fe932084890b8e3fbd5c72591f3db de925e9bc046645a72f59bcd493da44d53adaf5a)"
   CLAUDE_RANGE="$(node "$CLAUDE_POLICY" execution-range . "$PLAN_COMMIT" docs/plans/active/relay-worker-lifecycle-primitives.md 12cf2ead208fe932084890b8e3fbd5c72591f3db de925e9bc046645a72f59bcd493da44d53adaf5a)"
   test "$CODEX_RANGE" = "$CLAUDE_RANGE"
   test "$(printf '%s' "$CODEX_RANGE" | jq -er '.execution_review_commit')" = "$PLAN_COMMIT"
   test "$(printf '%s' "$CODEX_RANGE" | jq -er '.execution_base_commit')" = de925e9bc046645a72f59bcd493da44d53adaf5a
   printf '%s\n' "$CODEX_RANGE"
   ```

   The compact-JCS output must name Dn as
   `execution_review_input_commit`, F as `execution_review_commit`, and the
   unchanged execution base. Only then may lifecycle implementation resume.

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
- The Docks policy source can land between Q and D. Therefore raw commit
  adjacency cannot replace path-specific ancestry; only target-plan commits
  form the compatibility tail.
- The existing R receipt in Q reviews E. D must preserve it until F replaces it
  with the receipt that reviews Dn/Q.
- `canonicalPlanView` excludes lifecycle fields and its own receipt line. Do not
  infer that a full plan edit is safe merely because the canonical hash ignores
  one field; validate the raw D partition delta separately.
- `docs/plans/AGENTS.md` currently sits at the 500-line budget. Rewrite/condense
  the compatibility subsection rather than increasing the file beyond 500.
- Mutation runs are already machine-parallel. Do not add a second baseline or
  nested pool; preserve one immutable source snapshot and the six-core cap.
- The current Q reviewer output is diagnostic evidence only. Its temporary
  bundle may disappear and it predates the released repair validator; the
  post-ship handoff always seals and reviews Q again.
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
- Any required change to this plan's Goal/deliverable or to the lifecycle
  primitive Goal/deliverable is a user HARD STOP.

## STOP conditions

- A repair commit cannot be validated without changing an existing public
  schema or accepting an unreviewed input.
- Path-specific traversal cannot reject pre-F merges, mixed-path commits, stale
  receipts, more than 4,096 inspected commits, or more than eight repairs; or it
  changes the generic post-F accounting/`in_review`/completion behavior.
- Preserving E/R/B/Q records conflicts with making F review exact Dn bytes.
- The 0.12.5 no-repair Q→F path or strict legacy corpus changes behavior.
- A worker needs to edit the lifecycle plan, Session Relay, Effect Kit, release
  manifests, or an unlisted path.
- Focused or mutation tests require weakening an existing negative or creating a
  second full baseline.
- A reviewer finds a change to Goal/deliverable or an unresolved execution
  ambiguity.

## Cold-handoff checklist

- [x] File manifest: all ten implementation paths and the plan are explicit.
- [x] Environment and commands: Node 24, focused/mutation/content/tree/full CI,
  committed-range whitespace, and post-ship release commands are exact.
- [x] Interface contract: Q→D*→F traversal, D invariant, F binding, and unchanged
  output schema/post-F completion reuse are defined.
- [x] Executable acceptance: A1–A8 are commands with binary expected results;
  project CI is recorded separately and release is post-ship.
- [x] Out of scope: lifecycle implementation, other plugins, schemas, strict
  start recognition, and worker release operations are excluded.
- [x] Decision rationale: D/total bounds, path-specific ancestry, frozen legacy
  evidence, and protected partitions explain the non-obvious choices.
- [x] Known gotchas: stale receipt, R-receipt retention, canonical/raw delta,
  line budget, parallel matrix, ephemeral Q evidence, and release CLI behavior
  are explicit.
- [x] Global constraints: sole writer, review eligibility, CI, release, and hard
  stops are copied into this file.
- [x] No undefined terms: Q, D, F, E/R/B records, PLAN_PATH, Dn, and both output
  commit fields are defined above.

Adversarial cold-read result: a fresh worker can implement only the Docks policy
and tests without touching lifecycle Q. A fresh orchestrator can verify frozen
0.12.5 no-repair/post-F behavior, the bounded repair path, the exact mutation
inventory, complete the plan, release one Docks patch, refresh both caches, then
fresh-review and repair/re-review lifecycle Q. No executor must guess whether
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
committed execution range; and make release/cache/fresh-Q D/F handoff durable.
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

The initial design considered silently treating the valid Q finding as
nonblocking, writing it into F, or inserting an ordinary plan commit. All three
are rejected: `not_ready` has no override, F would review different bytes, and
0.12.5 explicitly rejects an intervening commit. The selected repair rung is
the minimum general mechanism that preserves the normal repair-and-repeat
contract without broadening legacy start recognition.

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
  sealed exact Q bytes and valid S1 evidence; temporary evidence is not a
  committed plan input.

## Review

*(filled by plan-review on completion)*
