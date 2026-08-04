---
title: Require release guards and status-only plan progress
goal: Require release pre-completion guards, detect stale workspace contracts, and add a backward-compatible status-excluded plan hash mode with validated status-only progress.
plan_hash_mode: status-excluded-v1
status: ongoing
created: "2026-08-04T03:42:06-03:00"
updated: "2026-08-04T23:51:32.328+00:00"
started_at: "2026-08-04T23:51:08.826+00:00"
finished_at: null
assignee: null
tags: [plans, plan-lifecycle, release-safety, contract-preservation]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/references/planrunv1-schema.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md
  - plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md
  - plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md
  - scripts/tests/plan-skill-phases.mjs
  - scripts/tests/plan-orchestration/hashing-manifests.mjs
  - scripts/tests/plan-orchestration/locks-cas.mjs
  - scripts/tests/plan-orchestration/mutations.mjs
related_plans:
  - docs/plans/active/session-relay-0.16.0-release.md
---

# Require release guards and status-only plan progress

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"9c690b2cfe3d27261bc1147cae20fd68d8a89bb72080fc4c7904b3951e42ce50","invocations":1,"result_sha256":"f717d4a4befd704a39ea9259b917f2b401014baf53338bd891a0cc838ddab1ed","state":"passed"},"execution_parent":"0026f38bc074996c1b8f54e022573cc6fb8d8ac3","goal_id":"08c02047-0941-4a0f-9d9a-2d9f12a08c58","implementation_commit":null,"plan_path":"docs/plans/active/release-precompletion-rehearsal-and-contract-guards.md","plan_sha256":"5474ba3cc199d5e5eb9d89ca5228d447b43c6903d06aa0496769bad725ce4c88","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"08b8ef53-a1ce-49aa-9181-e873d5e55678","schema":1,"source_base":"0026f38bc074996c1b8f54e022573cc6fb8d8ac3","source_sha256":"5e53ae1afa29f79345e72fbed1000971a3cd1483b279c22e300dc77d13d2fd99"}

## Goal

Make late release blockers visible before completion review. Preserve closed schemas and release identity relations. Make machine-readable step progress possible without weakening any task, path, dependency, effect, or done-condition binding, while every historical plan keeps its existing digest behavior.

## Why this plan exists

The Session Relay 0.16.0 lane exposed four reusable failures:

1. A canonical child used valid RFC 3339 UTC as `+00:00`, while a live verifier accepted only `Z`.
2. A source-identity repair added a required field to a closed Version 3 receipt although the plan excluded schema changes.
3. Completion review passed before the final live read-only child verification exercised canonical public data.
4. The release source, plan source, execution parent, implementation commit, and tag commit were repeatedly easy to conflate.

The durable response belongs in the canonical plan skills and their positive tests. It does not belong in another release-specific workaround.

## Required contract {mechanism}

### Available read-only boundary rehearsal

For a plan that will mutate an external release boundary, the plan must place every available live read-only final-boundary check before completion-review reservation. The check must use the exact canonical identities and data spellings that the later mutation consumes.

“Available” means the repository already provides a read-only command or adapter path that can exercise the boundary without the pending mutation. This rule must not invent a network call, weaken external authority, or require a probe where no such path exists. If an available check needs probe authority and that authority is absent, the plan blocks before completion review instead of reviewing unexercised release assumptions.

### Closed-schema preservation

When affected code validates or emits a closed object, the plan must state whether the object shape is preserved or intentionally changed. A preserved shape needs an exact-key compatibility fixture. An intentional change must be in scope and must include migration, versioning, and historical-reader acceptance. A changed closed shape under an out-of-scope schema ban is a review blocker.

### Release identity matrix

A release plan with multiple commit identities must name each role, its producer, its consumers, and every required equality, distinction, or ancestry edge. At minimum, when present, this includes:

| Role | Meaning |
|---|---|
| release source | Immutable source that produced the staged tag and assets. |
| plan source | Source base of the current PlanRun. |
| execution parent | Commit from which current implementation execution began. |
| implementation commit | Exact reviewed implementation checkpoint. |
| tag commit | Commit resolved by the immutable release tag. |

A reviewer must reject an unstated equality, a contradictory role pin, or a later successor that keeps current-run fixtures bound to its predecessor.

### Status-only plan progress

New and successor plans declare frontmatter `plan_hash_mode: status-excluded-v1`. Historical plans without the marker retain their exact current digest behavior. A marked all-`planned` bootstrap may carry its legacy full-body digest until the first progress transaction.

For the marked mode, `plan_sha256` normalizes only the exact `Status` cell in each validated Steps row. It still binds the marker, table header and row order, `#`, `Id`, task, files, depends, effect, and done/failure text. Fenced examples, non-Steps tables, malformed rows, unknown states, and any non-status byte change remain bound or rejected.

A status-only progress transaction validates each row transition, permits only the matching `updated` timestamp change, and atomically installs the normalized digest on bootstrap. `done` and `skipped` are terminal; blocked and finished PlanRun bytes remain immutable.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | pin_missing_rules | Pin release-boundary and workspace-version rules with positive mutation assertions. | `scripts/tests/plan-skill-phases.mjs` | — | `local` | `done` | Bounded-workflow tests fail for every removed release guard or missing workspace current marker, then pass after restoration. |
| 2 | specify_manager_boundary | Define the manager boundary rule. | `plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md` | 1 | `local` | `done` | The manager requires available read-only final-boundary checks before completion review without granting authority or inventing a check. |
| 3 | specify_reviewer_contracts | Define reviewer contract checks. | `plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md` | 1 | `local` | `done` | Review guidance blocks schema drift, noncanonical fixtures, conflated identities, and predecessor current-run pins from sealed evidence only. |
| 4 | sync_workspace_contract | Synchronize compact workspace policy and make the new contract a current-version marker. | `plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md`; `plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md`; `docs/plans/AGENTS.md`; `scripts/tests/plan-skill-phases.mjs` | 2, 3 | `local` | `done` | The generated policy remains under 500 lines and byte-synchronized; a recognizable pre-change workspace classifies STALE and explicit refresh installs the guards. |
| 5 | implement_status_progress | Add the backward-compatible marked hash mode and validated status-only transaction. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/references/planrunv1-schema.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md`; `docs/plans/AGENTS.md`; `plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md`; `scripts/tests/plan-orchestration/hashing-manifests.mjs`; `scripts/tests/plan-orchestration/mutations.mjs` | 4 | `local` | `done` | Marked plans exclude only valid Steps Status cells, bootstrap atomically, accept legal progress, reject all other byte drift, and every unmarked historical digest stays exact. |
| 6 | prove_rules_bite | Run focused, plugin, and full gates, then record Steps 1-6 through the status-only transition. | all affected paths in frontmatter | 5 | `local` | `done` | A1-A6 passed; mutation probes reject removed guards and widened exclusions; the validated transition read back Steps 1-6 done. |
| 7 | enforce_step_identity | Reject duplicate display numbers and duplicate stable Ids independently. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs`; `scripts/tests/plan-orchestration/hashing-manifests.mjs` | 6 | `local` | `done` | Identified tables reject either collision; legacy tables still reject duplicate display numbers; composite row identities remain transition bindings. |
| 8 | require_successor_marker | Require every same-file successor to declare the selected hash mode. | `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs`; `scripts/tests/plan-orchestration/locks-cas.mjs` | 6 | `local` | `done` | Replacement rejects an unmarked successor without changing predecessor bytes, while marked replacement passes. |
| 9 | pin_excluded_drift | Prove status progress cannot carry excluded-section drift. | `scripts/tests/plan-orchestration/mutations.mjs` | 6 | `local` | `done` | A legal row transition combined with Review evidence drift is rejected by the raw-byte comparison and leaves bytes unchanged. |
| 10 | rerun_checks | Apply the three repairs and rerun every invalidated acceptance path. | all affected paths in frontmatter | 7, 8, 9 | `local` | `done` | A1-A6 pass on repaired bytes and the replacement implementation checkpoint is bound. |
| 11 | checkpoint_and_archive | Run one valid bound completion review and archive. | all affected paths in frontmatter | 10 | `local` | `planned` | Fresh CompletionReviewV1 passes; this row becomes done through the validated transition before the finished archive commit; the active path is absent. |
## Acceptance

| ID | Command | Expected result |
|---|---|---|
| A1 | `node scripts/tests/plan-skill-phases.mjs --case bounded-workflows` | Exit 0; release guards, workspace version marker, and mutation assertions are pinned. |
| A2 | `node scripts/tests/plan-skill-phases.mjs --case plan-workspace-template` | Exit 0; repository policy and source template remain synchronized and below the context-node cap. |
| A3 | `node scripts/skills/guard.mjs plugins/plan-lifecycle/skills/productivity/plan-manager && node scripts/skills/guard.mjs plugins/plan-lifecycle/skills/productivity/plan-reviewer && node scripts/skills/guard.mjs plugins/plan-lifecycle/skills/productivity/plan-workspace` | Exit 0; all changed skills satisfy structure, references, metadata, and content hashes. |
| A4 | `node scripts/tests/plan-orchestration.mjs --case hashing-manifests && node scripts/tests/plan-orchestration.mjs --case locks-cas && node scripts/tests/plan-orchestration.mjs --case mutations` | Exit 0; legacy digests stay exact, marked progress is narrow, and same-file successors require the selected hash mode. |
| A5 | `node scripts/ci.mjs --plugin plan-lifecycle` | Exit 0; the authoritative plugin gate passes. |
| A6 | `node scripts/ci.mjs` | Exit 0; repository-wide context, orchestration, release, format, and lint contracts pass. |

## Protected scope

- Keep PlanRunV1, review result, completion review, affected-path manifest, and every release receipt schema byte-shape compatible.
- Preserve the closed two-permit review budget and the reserve-before-launch protocol.
- Preserve literal ExternalAuthorityV1 checks. Planning prose and read-only rehearsal intent never grant probe or mutation authority.
- Keep reviewer wrappers thin. Canonical behavior stays in the skills.
- Keep `docs/plans/AGENTS.md` synchronized with its source template and below 500 lines.
- Preserve every unmarked plan digest. In marked mode, exclude only validated Steps Status cells; bind every other byte.

## Out of scope / do-NOT-touch

- Session Relay release implementation or the blocked 0.16.0 plan.
- A new PlanRun field, receipt field, review verdict, lifecycle state, effect, or risk class. The selected frontmatter hash-mode marker is the only new protocol discriminator.
- A mandatory network call for plans that have no existing read-only boundary path.
- Retrospective edits to finished plans or historical receipts.
- Automatic probe, push, publish, release, or deployment authority.
- Generic release orchestration or a new reusable framework.

## STOP conditions

1. The rule cannot distinguish an available read-only check from a nonexistent one without adding a new schema or runtime registry.
2. Any change broadens external authority or treats a planned probe as live authority.
3. Any PlanRun, review, manifest, or release receipt key changes.
4. The reviewer rule requires access outside its immutable read-only bundle.
5. The workspace template and generated policy cannot remain byte-aligned.
6. Focused tests can pass after removing the matching normative clause.
7. The change requires Session Relay release code or retrospective edits to any finished plan.
8. A marked mode changes any non-Status Steps cell, any unmarked digest, or blocked/finished immutability.

## Open decisions

None. The user selected the backward-compatible status-excluded Steps mode.

## Review

N/A - manager-written after review.

Plan-attempt-history: {"authorization_source_sha256":"6a3e9b6dd36d7be02f7529cc13369608d54c8c0fae360eed0d3e57e57cc806dd","plan_bytes_sha256":"5af4918515fcc4261769b4b57cb538aa8f6f81a5c8dd4f023b71b9989ce3be30","replacement_run_id":"bd54c043-ef65-4343-8494-7d531b61b3b2","run":{"acceptance":null,"blocker":{"evidence_sha256":"8d624040999d022fc6a1a55f40a45c7b2e6d4325bd5e86abe76868422be07678","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"c964bdc9a2573298c4fe6cffba7a21e06fc3d953dbdabca87322d44c3b97aede","invocations":1,"result_sha256":"23aee97e6efd35f38f6ed44e338dc06b1b5dfe744563e3e32e690fa21d4aaeda","state":"passed"},"execution_parent":null,"goal_id":"08c02047-0941-4a0f-9d9a-2d9f12a08c58","implementation_commit":null,"plan_path":"docs/plans/active/release-precompletion-rehearsal-and-contract-guards.md","plan_sha256":"d7a2b7c3b2f678a78308b3a12f36717e86db142de7e9ce5acc4b78d429ded024","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"fe1da33a-65e8-4a60-9b5c-afdefb2f7667","schema":1,"source_base":"ae9a7a977c785ad3b8462df0f3a12ad152fb9c1c","source_sha256":"c43f7df36436cd5cb30002686e4d6a88c528d7f1172606501a8673759c878843"},"schema":1,"status":"blocked","successor_run_sha256":"f16b308cb0ea071dbd2f40807d02f3c3b5c5b0bbf7f8fbec2ce2f35e9e6c9140"}

Plan-attempt-history: {"authorization_source_sha256":"6a3e9b6dd36d7be02f7529cc13369608d54c8c0fae360eed0d3e57e57cc806dd","plan_bytes_sha256":"191dbe57b27a157dc33faff56d609c0b9ffe417ba7a420a9aa14350f1ed087cb","replacement_run_id":"ee3afd7f-2056-40a9-b947-a0a46d4afcc8","run":{"acceptance":null,"blocker":{"evidence_sha256":"76e3cb7ffba7ba0caaa07a01cfb00de14c96860071deb6e12828031600bc7a9c","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"1888b1f56870fefe33a007cc750da5abd21e60e5775b4828f00afdb246f1fa03","invocations":1,"result_sha256":"76e3cb7ffba7ba0caaa07a01cfb00de14c96860071deb6e12828031600bc7a9c","state":"blocked"},"execution_parent":null,"goal_id":"08c02047-0941-4a0f-9d9a-2d9f12a08c58","implementation_commit":null,"plan_path":"docs/plans/active/release-precompletion-rehearsal-and-contract-guards.md","plan_sha256":"0c18b8274b14882bb9f83abe77aab8e1e302d347a998dab962d12bfd9c6dcffb","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"bd54c043-ef65-4343-8494-7d531b61b3b2","schema":1,"source_base":"c1c3c5b3928ea50a8efd15ed88ec3ba899a49471","source_sha256":"d0540eed2960d4e3c126dfc69d6f6591ec9fb1b43bf14576116f6f5c15809a70"},"schema":1,"status":"blocked","successor_run_sha256":"344cb20e7a8f26822e1daef6fe3435d664b00ee7883601e31d47542d3a328eee"}

Plan-attempt-history: {"authorization_source_sha256":"fc62261898c1b4befe209e12c7d849dcb47954a3043c5cfb5b7627a01c21ce95","plan_bytes_sha256":"13eda5958167ed7dcbbcabc0d8beb372466d046ce62a96bcedf3d03ac93f1e4b","replacement_run_id":"dc79320a-1358-40c4-aecb-3e2d48693266","run":{"acceptance":{"source_sha256":"ecc34250a7ed1768e86395a7ee8f533a9075c988db6ec317bb0f3eda59e95c16","verification_sha256":"70e810478819a7cc84a2729a2346b4a77c552e3c48f441f698d8e45387aa2635"},"blocker":{"evidence_sha256":"1fe73d346093513e657afbf5d1a0cddf7e47fdbd8cc945a4a72b60d952618bdb","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":"2856ccc6e0f5f259e0a087b180b9c0c8aa7522bd33a3bd712b360b2e7c4fb52f","invocations":1,"result_sha256":"1fe73d346093513e657afbf5d1a0cddf7e47fdbd8cc945a4a72b60d952618bdb","state":"blocked"},"draft_review":{"accepted_classes":[],"input_sha256":"7a9d3092ce9469be7e4c7263fc61f00294b91ad344e15378963c9db8607adda8","invocations":1,"result_sha256":"895ffbbb363af56baea29561543db6dd5a3899ea60631107c642ad86846beb4b","state":"passed"},"execution_parent":"c1c3c5b3928ea50a8efd15ed88ec3ba899a49471","goal_id":"08c02047-0941-4a0f-9d9a-2d9f12a08c58","implementation_commit":"6b1acc962be2b96b803d1d5b082230f11d4ab3a6","plan_path":"docs/plans/active/release-precompletion-rehearsal-and-contract-guards.md","plan_sha256":"0c18b8274b14882bb9f83abe77aab8e1e302d347a998dab962d12bfd9c6dcffb","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"ee3afd7f-2056-40a9-b947-a0a46d4afcc8","schema":1,"source_base":"c1c3c5b3928ea50a8efd15ed88ec3ba899a49471","source_sha256":"d0540eed2960d4e3c126dfc69d6f6591ec9fb1b43bf14576116f6f5c15809a70"},"schema":1,"status":"blocked","successor_run_sha256":"3b273219e38db83bfc4ab3a8f45ddd69853dd67e1fe112b60b853f06da02ab19"}

Plan-attempt-history: {"authorization_source_sha256":"fc62261898c1b4befe209e12c7d849dcb47954a3043c5cfb5b7627a01c21ce95","plan_bytes_sha256":"987422a43834a51549f273e939164be6742d8b2f002cc2be9874dd1491b82a6e","replacement_run_id":"54291ea8-cfda-4bec-a0e8-4da4aeab0066","run":{"acceptance":{"source_sha256":"f35603f6be425aa51469aa1fcdff93e524073d08b31a9cd5d81a8b159eee7578","verification_sha256":"7c131678703973b6dbda425fcdb36820f10bf96cff3f873e09cc59983b2a29ee"},"blocker":{"evidence_sha256":"8a157998e56c9580829f05953f05628197a20b3869498f1f1a31fcb99564f30b","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":"e9391559fb457a14a7c51f23dde4ca80017f6241ae74680d4b7a7a31eb12c433","invocations":1,"result_sha256":"8a157998e56c9580829f05953f05628197a20b3869498f1f1a31fcb99564f30b","state":"blocked"},"draft_review":{"accepted_classes":[],"input_sha256":"3dbf7b48d61b040c782786ac6591adf5320e1c50fc5bf1897be83c2e1d847f0c","invocations":1,"result_sha256":"b6d73b832ed9bf953f13ee0aa857071207a1621a291a65fff927bb0fbb6be068","state":"passed"},"execution_parent":"ef625042b7db018cb60def998a31b165b08b87ef","goal_id":"08c02047-0941-4a0f-9d9a-2d9f12a08c58","implementation_commit":"4f0cdd84ae57c90e887cf2b9ed827f29718d430f","plan_path":"docs/plans/active/release-precompletion-rehearsal-and-contract-guards.md","plan_sha256":"5dc396be295c235c61d8b661e9bbab7be640fa02222b695acf31299da3444dfa","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"dc79320a-1358-40c4-aecb-3e2d48693266","schema":1,"source_base":"ef625042b7db018cb60def998a31b165b08b87ef","source_sha256":"bf8f51f7629b516553d0a911ad0aa8e03efcc5cc3f7b791eed3d50c7ee2872cd"},"schema":1,"status":"blocked","successor_run_sha256":"81522bc81c6e38ff59515a6b680858174d4f5554b5c87c38f8f277e55d778a6c"}

Plan-attempt-history: {"authorization_source_sha256":"fc62261898c1b4befe209e12c7d849dcb47954a3043c5cfb5b7627a01c21ce95","plan_bytes_sha256":"3ff52dcbcc6d825c2622330e0e31d5179f643f7dcd1e333fbc2274dd37cb2e57","replacement_run_id":"08b8ef53-a1ce-49aa-9181-e873d5e55678","run":{"acceptance":{"source_sha256":"5e53ae1afa29f79345e72fbed1000971a3cd1483b279c22e300dc77d13d2fd99","verification_sha256":"ea4f9937e9aa6041be3e4a53b107ae4ad32c9e0cff32cb0d160e6435bbf4093a"},"blocker":{"evidence_sha256":"6cc1106764ab6111ad4f4d77417f0476055828e26812058685649008e3a81d0b","kind":"concurrent_change"},"completion_review":{"accepted_classes":[],"input_sha256":"bfee3f9a46c6695f787e4398746cc2619d573494df61d25cbdc6ff8a6e2b8ea8","invocations":1,"result_sha256":"d2c8f7a338f5b3b26066e98ef28a1da3ba0956635a2585827055bb8b177f260b","state":"passed"},"draft_review":{"accepted_classes":[],"input_sha256":"575e6a661f580ed9f1805391d3f9e123257907262604b29581efce5dd4f18de1","invocations":1,"result_sha256":"3d8ef09a751f97cb79784d243cddafa21f2e25ce09584585ab1fa419e64df206","state":"passed"},"execution_parent":"4f0cdd84ae57c90e887cf2b9ed827f29718d430f","goal_id":"08c02047-0941-4a0f-9d9a-2d9f12a08c58","implementation_commit":"0026f38bc074996c1b8f54e022573cc6fb8d8ac3","plan_path":"docs/plans/active/release-precompletion-rehearsal-and-contract-guards.md","plan_sha256":"5474ba3cc199d5e5eb9d89ca5228d447b43c6903d06aa0496769bad725ce4c88","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"54291ea8-cfda-4bec-a0e8-4da4aeab0066","schema":1,"source_base":"4f0cdd84ae57c90e887cf2b9ed827f29718d430f","source_sha256":"7292e9844964a08d4bca3cb4f38a822e2dd764d57dc25fa21d54cb8a06caa540"},"schema":1,"status":"blocked","successor_run_sha256":"de7ceb14585abb099c3a7de5b50b9a2851bf4fb542f3dcdde7a2860daa64b545"}

## Verification Results

N/A - manager-written after execution.
