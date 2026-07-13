---
title: Add reviewed legacy start-transition compatibility
goal: Make Docks source-ready for a narrow, independently reviewed legacy start validator while preserving strict validation for every ordinary plan.
status: planned
created: "2026-07-13T06:10:09-03:00"
updated: "2026-07-13T08:22:40-03:00"
started_at: null
assignee: null
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: xhigh
review_waivers: []
tags: [docks, plans, compatibility, review-policy]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-review/SKILL.md
  - plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs
  - scripts/tests/fixtures/plan-review-policy/sample-plan.md
  - scripts/tests/plan-review-policy.mjs
  - scripts/tests/plan-review-policy-mutations.mjs
related_plans:
  - relay-worker-lifecycle-primitives
review_status: null
planned_at_commit: "06a898abacfd57aad9dab0d48db8ad3c8e622318"
execution_base_commit: null
---

# Add reviewed legacy start-transition compatibility

## Goal

Make the Docks source ready for release with the strict plan-only first-start contract preserved for every ordinary plan, while adding one explicit compatibility route for an older plan whose single-parent, plan-only start commit also resolved an already-present owner question and carried a uniquely resolvable abbreviated `planned_at_commit`. Compatibility must be machine-checked, owner-authorized, independently reviewed with findings-free evidence, and commit-bound.

Success means this source plan passes completion review and is ready for the already-authorized Docks patch release. The related lifecycle plan's prerequisite Step P owns the later immutable release, active Codex/Claude cache equality after restart, compatibility evidence/review/binding application, and final range validation. No Session Relay implementation resumes before P is done.

## Context & rationale

The current completion validator correctly rejects `relay-worker-lifecycle-primitives`: its historical start commit changed only the plan and made a valid `planned → ongoing` transition, but it also resolved the already-present `threat-model-scope` owner question. The plan's `planned_at_commit` was the uniquely resolvable abbreviation `12cf2ea` at both the start parent and start commit; a later plan-only identity commit backfilled the full SHA and `execution_base_commit`. Current strict validation requires canonical plan equality across start and exact full `planned_at_commit` at the start commit, so committed history cannot satisfy it.

Rewriting the start commit is forbidden. Blindly relaxing `validateExecutionRange` would let an arbitrary implementation or deliverable change hide inside a start commit. The safe boundary is therefore a separately visible compatibility record over the exact historical diff, followed by the ordinary X/S review mechanism in findings-only mode. At least one reviewer must pass and every passed reviewer must return `ready` with zero findings; zero-review degradation, waivers, and `not_ready` results are ineligible.

This belongs in Docks because plan lifecycle validation, canonical review inputs, completion receipts, and ship-time reuse are Docks contracts. `docks-kit` may refresh the released plugin in user environments, but it must not own or reinterpret compatibility eligibility. Separating source readiness here from release/activation in the related plan avoids claiming active runtime bytes before an immutable release exists.

Verified repository facts:

- `planned_at_commit` is `12cf2ead208fe932084890b8e3fbd5c72591f3db`.
- `07ad2df486f35fabed0b0ee18bd95134e3d70ab7` is a single-parent plan-only creation commit whose parent is the planned base and where the plan path is added.
- `de925e9bc046645a72f59bcd493da44d53adaf5a` is a single-parent plan-only start commit whose parent is `8879d898bab2b3156f536a0515e185446f488473`.
- Both start-parent and start blobs contain `planned_at_commit: 12cf2ea`, which uniquely resolves to the full planned base.
- The start diff changes lifecycle frontmatter plus only the `Threat model`, `Environment & how-to-run`, and `Open questions` sections; Goal, Steps, Acceptance criteria, interfaces, exclusions, STOP conditions, and cold-handoff contract remain unchanged.
- `b8ebc968` later backfilled the full planned/start identities; that later repair is evidence, not a replacement start commit.

## Environment & how-to-run

- Repository: `/home/vagrant/projects/docks`, branch `main`.
- Runtime: Node 24, pnpm through Corepack, Git with the current repository object database.
- Primary helper: `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs`.
- Narrow tests first, then plugin CI, then full CI:

  ```bash
  node scripts/tests/plan-review-policy.mjs
  node scripts/tests/plan-review-policy-mutations.mjs
  node scripts/ci.mjs --plugin docks
  node scripts/ci.mjs
  ```

- Historical reproduction before implementation:

  ```bash
  node --input-type=module -e 'import { validateExecutionRange } from "./plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs"; validateExecutionRange({repo:process.cwd(),planPath:"docs/plans/active/relay-worker-lifecycle-primitives.md",plannedAtCommit:"12cf2ead208fe932084890b8e3fbd5c72591f3db",executionBaseCommit:"de925e9bc046645a72f59bcd493da44d53adaf5a",reviewedHead:"06a898abacfd57aad9dab0d48db8ad3c8e622318"})'
  ```

  Before this plan, it must exit nonzero with `execution base is not the plan-only first-start transition`. After implementation it must still fail until the lifecycle plan contains the exact compatibility application, eligible `Review-receipt`, and commit-bound compatibility binding; historical shape alone never grants compatibility.

- **Serialized execution precondition:** from this plan's first `ongoing` transition through its completion-review receipt, `main` is reserved to this plan's plan-only lifecycle commits and its eight affected paths. Plan-manager verifies `git rev-list --parents execution_base_commit..HEAD` plus `execution-scope` before every implementation dispatch and before completion. If any unrelated or merge commit lands in that interval, STOP; do not rewrite history, broaden the manifest, or silently ignore the commit. This is a deliberate bounded exception to parallel-plan default because A9 proves the entire committed implementation range, and the related lifecycle plan remains paused until this prerequisite ships.

- Release, installation, active-cache equality, and lifecycle evidence application are deliberately downstream. The related lifecycle plan's Step P contains their exact commands and receipts; this source plan neither executes nor claims them.

## Interfaces & data shapes

### Compatibility policy

The exact RFC-8785 JCS policy object is:

```json
{"body":{"changed_sections_receipt_bound":true,"duplicate_headings_forbidden":true,"heading_set_and_order_identical":true,"preamble_name":"__preamble__","protected_sections":["Acceptance criteria","Cold-handoff checklist","Goal","Interfaces & data shapes","Out of scope / do-NOT-touch","STOP conditions","Steps"],"section_add_delete_forbidden":true},"creation":{"must_be_ancestor_of_execution_parent":true,"path_absent_at_planned_at_commit":true,"plan_only_add":true,"single_parent_equals_planned_at_commit":true},"legacy_planned_at":{"min_hex_length":7,"must_equal_before_and_at_base":true,"must_uniquely_resolve_to_full":true},"review":{"minimum_passed_legs":1,"passed_legs_must_be_ready":true,"passed_legs_must_have_zero_findings":true,"waivers_forbidden":true,"zero_reviewer_forbidden":true},"schema":1,"start":{"allowed_frontmatter_changes":["started_at","status","updated"],"base_single_parent":true,"changed_path_only_plan":true,"from_started_at":null,"from_status":["planned","scheduled"],"to_started_at":"non-null","to_status":"ongoing"}}
```

Its SHA-256 is `b224d8fc3f8ba6921aec38e834ec2f812954aff79859734e988fb03caf9f1253`. The implementation exports the literal and checks its hash in tests; changing it is a policy change requiring a new schema, not a silent broadening.

The normalized body is partitioned completely. `__preamble__` is the exact bytes before the first unfenced `^## <name>$` heading; every later section is the exact bytes from one such heading through the byte before the next. Both blobs must have the same nonempty, unique heading vector in the same order; duplicate, added, deleted, or reordered headings fail. The helper computes the changed partition names between start parent and start commit. Every changed partition must appear once in the receipt, no protected section or preamble may change, and every unlisted partition must be byte-identical.

### Compatibility application and evidence

No frontmatter field and no existing closed completion/review schema changes. Instead, two canonical lines plus an exact historical diff remain visible in `canonicalPlanView`, so ordinary draft reviewers and later completion input hashes bind the exception:

```text
Compatibility-review-material: <compact JCS CompatibilityReviewMaterialV1>
<generated backtick fence with language diff>
<exact historical transition diff bytes>
<matching generated backtick fence>
Execution-base-compatibility-receipt: <compact JCS ExecutionBaseCompatibilityReceiptV1>
Execution-base-compatibility-binding: <compact JCS ExecutionBaseCompatibilityBindingV1; added only after review>
```

The first two records and diff fence form one application block inserted immediately before `## Review`. None of the three compatibility record names is added to `MACHINE_RECORD`; existing stripping of `Bootstrap-review-record:`, `Review-receipt:`, and `Completion-review-receipt:` remains unchanged. The diff fence uses the smallest backtick length `N >= 3` greater than every backtick run in the exact diff, opening with exactly `N` backticks plus `diff` and closing with exactly `N` backticks.

Historical transition bytes are exactly stdout bytes from:

```bash
git --no-pager -c diff.algorithm=myers -c diff.context=3 -c diff.interHunkContext=0 -c diff.suppressBlankEmpty=false -c diff.indentHeuristic=false -c diff.renames=false diff --binary --full-index --no-renames --diff-algorithm=myers --unified=3 --inter-hunk-context=0 --no-indent-heuristic --no-ext-diff --no-textconv --no-color --src-prefix=a/ --dst-prefix=b/ "$EXECUTION_PARENT" "$EXECUTION_BASE_COMMIT" -- "$PLAN_PATH"
```

It must exit 0, emit valid UTF-8 normalized to LF, end in one LF, and have SHA-256 `transition_diff_sha256`. The helper passes that literal argv directly with no shell and removes `GIT_DIFF_OPTS`; explicit CLI/`-c` values neutralize algorithm, context, inter-hunk fusion, blank-empty suppression, indent shifting, rename detection, pager, color, textconv, and external diff configuration. No contextual relabeling or synthetic section diff participates, and generation plus every validation rerun the identical producer.

`CompatibilityReviewMaterialV1` is closed:

```text
{ schema:1, plan_path, planned_at_commit, plan_creation_commit,
  execution_parent, execution_base_commit, parent_plan_blob, base_plan_blob,
  policy_sha256, partition_manifest_sha256, transition_diff_sha256,
  review_material_sha256 }
```

`review_material_sha256` hashes JCS of `{schema:1,material:<all preceding fields except review_material_sha256>,transition_diff:<exact UTF-8 diff string>}`. This makes the visible diff independently verifiable without changing the sealed review-bundle schema: it is part of `plan.review.md` itself.

All identity domains are literal. `plan_path` is the normalized repo-relative path accepted by `safeLogical`. Every `*_commit`, `execution_parent`, and `planned_at_commit` is an exact lowercase 40-hex commit object id. `parent_plan_blob`, `base_plan_blob`, and `evidence_input_plan_blob` are exact lowercase 40-hex blob object ids returned by `git rev-parse <commit>:<plan_path>`. Every `*_sha256` is lowercase 64-hex SHA-256 over the preimage named here. The normalized body is exactly `parsePlan(bytes).body`: valid UTF-8, original internal bytes preserved, trailing newlines normalized to one LF.

`ExecutionBaseCompatibilityReceiptV1` is recursively closed:

```text
{ schema:1, kind:"legacy_start_transition", policy_sha256,
  plan_path, planned_at_commit, plan_creation_commit, plan_creation_parent,
  execution_parent, execution_base_commit, legacy_planned_at_value,
  evidence_input_commit, evidence_input_plan_blob,
  parent_plan_blob, base_plan_blob, transition_diff_sha256,
  partition_manifest_sha256,
  changed_sections:[{
    name, before_sha256, after_sha256, transition_sha256
  }],
  protected_sections_sha256, review_material_sha256,
  owner_confirmation:{
    schema:1, authorization_id, decision:"allow", source:"current_user",
    source_text_sha256
  },
  receipt_sha256 }
```

The partition manifest preimage is exact JCS `PartitionManifestV1 {schema:1,partitions:[{ordinal,name,before_sha256,after_sha256,changed}]}` in body order, including ordinal 0 `__preamble__`; its JCS SHA-256 is `partition_manifest_sha256`. `changed_sections` is the nonempty UTF-16-key-sorted projection of `changed=true`; each `transition_sha256` is SHA-256 of exact JCS `{schema:1,name,before_sha256,after_sha256}`. The protected preimage is exact JCS `ProtectedSectionsV1 {schema:1,sections:[{ordinal,name,sha256}]}` in historical body order, filtered to the policy list; parent/base bytes must be equal and `sha256` hashes those exact section bytes. Its JCS SHA-256 is `protected_sections_sha256`. The creation commit must be an ancestor of `execution_parent`. `receipt_sha256` hashes JCS without itself.

`compatibility-evidence` emits one closed `ExecutionBaseCompatibilityApplicationV1 {schema:1,markdown,receipt_sha256,review_material_sha256,application_sha256}`. `markdown` is the exact application block above, including its terminal LF; `application_sha256` hashes JCS without itself. Plan-manager applies only this exact string.

The owner-confirmation record for this plan is authorization id `owner-2026-07-13-remodel-and-review-plan`, decision `allow`, source `current_user`, and message SHA-256 `1979e51b8ae33cd1de3af5e820200e1988d56363a9b7af1cae9523c7c20ddc96`. The helper receives the id and digest, stores no conversation text, and cannot infer consent from standing cross-company review consent.

The separately scoped Docks prerequisite release is owner-authorized by `DocksCompatibilityReleaseAuthorizationV1` JCS `{"authorization_id":"owner-2026-07-13-four-release-order-docks-prerequisite","decision":"allow","operations":["non_force_push_main","docks_patch_release_after_compatibility_completion","codex_plugin_refresh","claude_plugin_refresh"],"plan_path":"docs/plans/active/legacy-start-transition-compatibility.md","recorded_at":"2026-07-13T06:44:36-03:00","repository":"DocksDocks/docks","schema":1,"source":"repository-owner-current-conversation","source_text_sha256":"2bb31558648994b7d4fbba15abf3ed981c556c91e5ead91712f281d18acbac92"}` with SHA-256 `f8f38319a72f258dd66d9b31f620cd13ec1968f1d1d169d94e3ebc6b55dde77a`. It permits only a Docks patch release after this plan passes completion and ships, plus the two runtime refreshes; it does not authorize force, an Effect Kit/Session Relay release, or release before completion.

### Exact review and commit chain

Let `E0` be clean `evidence_input_commit`, `E` the compatibility-application commit, `R` the compatibility-review receipt commit, `B` the binding commit, `Q` the target plan's plan-only prerequisite-closure commit, and `F` the fresh ordinary execution-review receipt commit. Plan-manager performs and later validation proves exactly:

1. `parent(E)=E0`; E is single-parent and changes only the plan; its raw plan diff is exactly insertion of `ExecutionBaseCompatibilityApplicationV1.markdown` before `## Review` plus the normal excluded `updated` field change. No compatibility material/receipt/binding existed at E0.
2. Ordinary `prepare(none) → X/S findings-only review → apply` reviews E. Outcome is exactly `dual` or `single`; at least one raw leg is `passed`, every passed leg returns `ready` with zero findings, and the other leg—if any—has its exact ordinary unavailable result. `zero_degraded`, `blocked`, waiver, `not_ready`, or a passed leg with findings is ineligible.
3. `parent(R)=E`; R is single-parent and changes only the plan. Its raw plan delta is exactly one mandatory attributed `Cross-check (...)` line appended inside `## Self-review`, one compact-JCS `Review-receipt:` line, and an optional excluded `updated` change. The attribution is rendered only by the compatibility renderer below; no free-form reason or identity participates and no other prose changes. The receipt's `reviewed_commit` is E and its input hash exact-matches `canonicalPlanView(E)`. `review_receipt_sha256` is SHA-256 of the compact JCS receipt payload bytes only—no `Review-receipt: ` prefix and no LF—and `review_attribution_sha256` is SHA-256 of the exact attribution line including its terminal LF.
4. `parent(B)=R`; B is single-parent and changes only the plan. `compatibility-binding` validates E/R plus their exact receipt/attribution delta and emits closed `ExecutionBaseCompatibilityBindingApplicationV1 {schema:1,markdown,binding_sha256,application_sha256}`; `markdown` is exactly `Execution-base-compatibility-binding: <compact JCS ExecutionBaseCompatibilityBindingV1>\n`, and the application self-hash omits itself. The binding is `ExecutionBaseCompatibilityBindingV1 {schema:1,compatibility_receipt_sha256,compatibility_evidence_commit:E,reviewed_commit:E,review_commit:R,review_receipt_sha256,review_attribution_sha256,binding_parent:R,binding_sha256}` and hashes JCS without itself. B's raw delta is exactly that emitted line plus an optional excluded `updated` change.
5. `parent(Q)=B`; Q is single-parent and changes only the target plan. For `relay-worker-lifecycle-primitives`, Q changes Step P `planned→done`, replaces its one pending prerequisite-evidence sentence with one compact-JCS `DocksCompatibilityPrerequisiteReceiptV1` defined in Step P, and may change excluded `updated`; no other byte changes. This closes release/cache/E/R/B facts before execution review.
6. Ordinary `prepare(none) → X/S findings-only review → apply` reviews the exact Q plan blob so reviewers see the binding and closed prerequisite. `parent(F)=Q`; F is single-parent and changes only the plan. Its raw delta is exactly a second mandatory line from the same compatibility renderer, replacement of R's one ordinary `Review-receipt:` with F's receipt, and an optional excluded `updated` change. Its outcome is exactly `dual|single` under the same findings-free eligibility rule, and its receipt binds reviewed commit Q. F is the only plan blob eligible to become execution authority.

The compatibility attribution renderer is a pure function of a validated eligible draft receipt. `reviewed_at` must be canonical ISO-8601 and `date` is exactly its first ten ASCII bytes. For each leg, `company` is the existing `companyForLeg(author.company, leg)` result; `model`/`effort` are `raw.selected.model`/`raw.selected.effort` when selected, otherwise the final attempt's model/effort when attempts are nonempty, otherwise the literals `none`/`none`. The orchestrator identity is exactly `author.company author.tool author.model author.effort`. Every interpolated identity token must match `^[a-z0-9][a-z0-9._/-]*$`; `raw.result` is its validated enum literal. Eligibility additionally requires `X.raw.findings`, `S.raw.findings`, both legs' `reconciliation.accepted` and `reconciliation.rejected`, and `receipt.reproduced` all to be empty arrays, so empty IDs and reasons always render as the literal `none`. The one-line UTF-8 string, including its terminal LF and no leading whitespace, is exactly:

```text
Cross-check (${date}): [X: ${X.company} ${X.model} ${X.effort}; result=${X.result}] 0 findings — accepted none / rejected none (none); [S: ${S.company} ${S.model} ${S.effort}; result=${S.result}] 0 findings — accepted none / rejected none (none); [orchestrator: ${author.company} ${author.tool} ${author.model} ${author.effort}] independently verified none against source before accepting.\n
```

The unique unfenced `## Self-review` partition must end in exactly two LF bytes immediately before the next level-2 heading. If `attribution` is the exact string above, apply computes `selfReview.slice(0, -1) + attribution + "\n"`; R therefore appends its line as the final nonblank line, and F retains R then appends its own line immediately after it. Missing/duplicate headings, a different separator, CRLF, token mismatch, nonempty IDs/reasons, a hand-authored line, or a missing/extra terminal LF fails before any write. `compatibility-binding` reconstructs this exact R line from R's validated receipt and accepts no caller-supplied attribution bytes.

E→R→B→Q→F is contiguous for this target. Intervening, merge, multi-path, extra prose, replacement-record, second-binding, or reordered commits fail. B is located as the unique first commit introducing the exact binding and must be an ancestor of `reviewed_head`. The current plan retains byte-identical application material, compatibility receipt, binding, and prerequisite receipt. Later ordinary `Review-receipt:` replacement is allowed because compatibility validation reads immutable R; execution begins only from F's receipt-bearing plan blob, and completion review still evaluates all later plan/implementation changes.

### Strict-first validation and completion reuse

`validateExecutionRange` preserves the strict path's current error ordering and exact schema-1 return bytes. It first evaluates the existing ancestry, single-parent, plan-only, status, `started_at`, canonical-start, and head identity checks and retains the first original error object without rewriting its bytes. Compatibility dispatch is considered only when that first error is exactly `execution base is not the plan-only first-start transition` **and** the closed legacy-shape predicate below passes; otherwise the original error is rethrown unchanged:

1. The status/`started_at`, ancestry, single-parent, and plan-only parts of the current start check pass; only canonical body equality fails.
2. `planned_at_commit` in both execution-parent and execution-base blobs is the same lowercase 7–39 hex abbreviation, uniquely resolves with `rev-parse --verify <value>^{commit}` to the supplied full `planned_at_commit`, and is the only frontmatter difference ignored while comparing the legacy bodies. A 40-hex value, missing value, unequal abbreviations, ambiguous resolution, or another ignored difference fails this predicate.
3. The head carries the exact supplied full `planned_at_commit` and exact `execution_base_commit`; the plan-creation ancestry/add-only facts pass; and heading vector, partition manifest, changed partitions, plus protected equality satisfy only the literal policy's `creation`, `legacy_planned_at`, `start`, and `body` rows. Owner confirmation and review evidence are deliberately not pre-evidence predicate inputs because neither exists before E.

When that predicate passes, absence of the application block yields exactly `execution compatibility evidence missing`. A present block must then validate its owner-confirmation id/digest, material, receipt, and policy hash before proceeding through E/R/B/Q/F; missing or wrong owner confirmation is a typed compatibility-evidence error, never a pre-evidence shape failure. A malformed/ineligible present block yields its typed compatibility error and never falls back to success. Every other fixture—including canonical drift with full identities and base/head identity mismatch—stays on the ordinary strict path and reproduces the original exit/stdout/stderr byte-for-byte.

Compatibility returns closed `LegacyExecutionRangeValidationV1 {schema:1,mode:"legacy_compatibility",planned_at_commit,execution_base_commit,reviewed_head,execution_parent,compatibility_receipt_sha256,compatibility_evidence_commit,compatibility_review_commit,compatibility_binding_commit,compatibility_binding_sha256,prerequisite_commit,prerequisite_receipt_sha256,execution_review_input_commit,execution_review_commit,execution_review_receipt_sha256,execution_review_attribution_sha256}`. For this target, prerequisite/execution-review identities are Q/Q/F and the execution receipt binds Q; F must be an ancestor of `reviewed_head`, and every E..F commit is plan-only/single-parent with exact deltas above. It is stored inside the already-existing prepared completion identity and recomputed byte-equal for that same `reviewed_head`; strict returns remain unchanged.

`ReviewRequest`, bundle manifest/completion, `Completion-review-receipt`, prepared top-level keys, and cleanup sentinel remain their existing closed schema-1 shapes. Compatibility is transitively bound because the application and binding remain canonical plan input, while `planned_at_commit` and `execution_base_commit` are already explicit completion identities. Completion prepare at head H validates compatibility at H. Completion receipt apply creates C and deterministically replaces `## Review`. For ship reuse, `completionStablePlanViewV1` parses unique unfenced level-2 sections, removes the complete `Review` partition at both H and C, and otherwise applies `canonicalPlanView`; those stable views must be byte-equal. Separately, C's one Review block must equal the exact deterministic block derived from C's validated completion receipt, and the application/binding lines at C must byte-equal H. It reads immutable R, avoiding any H→C reviewed-head hash cycle. Strict and compatibility fixtures exercise this same closed reuse rule; no existing schema-1 receipt gains a field.

The helper exposes four read-only commands:

```text
review-policy.mjs compatibility-evidence <repo> <reviewed-head> <plan-path> <planned-at> <execution-base> <authorization-id> <owner-message-sha256>
review-policy.mjs compatibility-binding <repo> <plan-path> <evidence-commit> <review-commit>
review-policy.mjs execution-range <repo> <reviewed-head> <plan-path> <planned-at> <execution-base>
review-policy.mjs execution-scope <repo> <base> <head> <plan-path>
```

Each accepts only the exact positional arity shown and emits one compact JCS line to stdout, zero stderr. `compatibility-evidence` emits `ExecutionBaseCompatibilityApplicationV1`; `compatibility-binding` emits `ExecutionBaseCompatibilityBindingApplicationV1`; plan-manager alone applies their exact Markdown and owns E/R/B/Q/F. `execution-range` emits the unchanged strict object or `LegacyExecutionRangeValidationV1`.

`execution-scope` requires clean exact full commits and walks parents from `head` back to `base`, rejecting absence of `base`, merges, or a fork, then reverses that list to oldest-first order. The allowed manifest preimage is exact `ExecutionScopeAllowedPathsV1 {schema:1,paths}` where `paths` is the UTF-16-key-sorted unique list of the exact plan path plus the head plan's eight `affected_paths`; every entry must be valid UTF-8, pass `safeLogical`, and be unique before sorting. `allowed_paths_sha256` is SHA-256 of its compact JCS. For each commit, the helper reads NUL-delimited paths from `git diff-tree --no-commit-id --name-only -r -z --no-renames <parent> <commit> --`, requires valid UTF-8 and `safeLogical`, rejects duplicates, sorts by UTF-16 key, and requires every path to occur in the allowed manifest. The changed-ledger preimage is exact `ExecutionScopeChangedPathsV1 {schema:1,base,head,commits:[{ordinal,commit,parent,paths}]}` with contiguous one-based ordinals, the first parent equal to `base`, and each later parent equal to the preceding commit; it retains empty path arrays and therefore binds every commit rather than a union. `changed_paths_sha256` is SHA-256 of that compact JCS. The emitted closed result is `ExecutionScopeValidationV1 {schema:1,base,head,commit_count,allowed_paths_sha256,changed_paths_sha256,result_sha256}`, `commit_count` equals ledger length, and `result_sha256` is SHA-256 of compact JCS over every preceding result field. Any config-dependent rename detection, endpoint-only union, omitted empty commit, alternate ordering, or caller-supplied manifest fails.

`scripts/tests/plan-review-policy.mjs` accepts `--case execution-compatibility` and `--case strict-differential --baseline <40hex>`. The first builds a disposable exact-shape repository, applies E/R/B/Q/F through the real exported helpers and plan-manager deltas, validates compatibility plus strict and compatibility H→C completion reuse, removes the fixture, and prints `execution compatibility: strict-first evidence/review/binding/prerequisite/final-review and reuse passed`.

The strict differential corpus is exact JCS `{"cases":["strict-success","path-escape","planned-short","planned-missing","execution-short","execution-missing","reviewed-short","reviewed-missing","planned-to-base-ancestry","base-to-head-ancestry","base-multi-parent","base-extra-path","base-plan-missing","parent-plan-missing","head-plan-missing","base-status","base-started-at","parent-status","parent-started-at","canonical-start-drift","base-planned-at-identity","head-planned-at-identity","head-execution-base-identity"],"schema":1}` with SHA-256 `d87c62456967c5bd54dd0f3b7d564881164dd1fd5217fa00720d6c234bc01fd9`. The selector extracts the baseline helper by Git blob, exact-matches that ordered 23-case inventory and digest, executes baseline and candidate against every case, and requires byte-identical exit/stdout/stderr before printing `execution compatibility: strict differential passed cases=23`. `canonical-start-drift` uses correct full parent/base/head identities and changes one ordinary body byte at the base; `base-planned-at-identity` gives parent and base the same wrong full 40-hex commit while the supplied/head identity is correct; `head-planned-at-identity` changes only the head's full planned identity; `head-execution-base-identity` changes only the head's full execution-base identity. Those four never satisfy the 7–39-hex legacy predicate and must retain the baseline's original error bytes. Unknown, missing, extra, reordered, duplicate, or hand-modeled cases fail.

## Steps

| # | Task | Files | Depends | Status | Done when |
|---|---|---|---|---|---|
| 1 | Implement strict-first compatibility application/material/receipt/binding validation, exact completion-stable view, history scope validation, and the four public read-only helper commands. Preserve the existing strict schema-1 return and exact error order outside the closed legacy-shape predicate. | `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs` | — | planned | Direct A3–A4 probes pass. The historical legacy shape reaches the typed missing-evidence error without E/R/B/Q/F; full-identity drift and every other ordinary strict case retain original bytes; helper outputs are closed and read-only. |
| 2 | Add full positive and mutation coverage for creation ancestry, start/history, complete body partitioning, exact diff material, owner evidence, E/R/B/Q/F adjacency and attribution, findings-free `dual|single` eligibility, strict/compatibility H→C reuse, exact 23-case differential behavior, and per-commit scope. | `scripts/tests/fixtures/plan-review-policy/sample-plan.md`, `scripts/tests/plan-review-policy.mjs`, `scripts/tests/plan-review-policy-mutations.mjs` | 1 | planned | A1, A2, A5, and A6 pass against the real exported helpers and commit chains; no test fabricates a final boolean or accepts a missing/reordered corpus case. |
| 3 | Document the application/binding/prerequisite/final-review protocol, strict-first and completion-stable rules, unchanged closed schema-1 surfaces, exact typed review eligibility, source-ready boundary, and cross-tool ownership in source and shipped plan contracts. | `docs/plans/AGENTS.md`, `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md`, `plugins/docks/skills/productivity/plan-manager/SKILL.md`, `plugins/docks/skills/productivity/plan-review/SKILL.md` | 1-2 | planned | Source and shipped template are semantically aligned; plan-manager owns E/R/B/Q/F writes, plan-review remains evidence-only, only findings-free `dual|single` authorizes compatibility, no existing schema-1 receipt changes, and docks-kit remains refresh-only. |
| 4 | Run focused and full validation, verify committed plus worktree scope, and hand the source-ready plan to completion review. | Read-only verification over every affected path above | 1-3 | planned | A1–A9 pass, all Steps are `done`, and plan-manager moves this plan to `in_review` without changing plugin versions or claiming downstream activation. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-review-policy.mjs` | Exit 0; existing policy/reviewer/lifecycle/completion checks plus named strict-first compatibility checks pass. |
| A2 | `node scripts/tests/plan-review-policy-mutations.mjs` | Exit 0; every creation/partition/material/E-R-B-Q-F/attribution/review/reuse/scope mutation family is rejected; legacy-predicate near misses rethrow the original strict bytes; structurally eligible missing evidence reaches the missing-evidence error while missing/wrong owner confirmation in a present application reaches a typed evidence error; diff-config, attribution token/LF, and scope-ledger substitutions fail; semantic-output assertions cover exact errors and closed objects. |
| A3 | `node plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs compatibility-evidence . "$(git rev-parse HEAD)" docs/plans/active/relay-worker-lifecycle-primitives.md 12cf2ead208fe932084890b8e3fbd5c72591f3db de925e9bc046645a72f59bcd493da44d53adaf5a owner-2026-07-13-remodel-and-review-plan "$(printf '%s' 'authorized to remodel the plan and review it to do it and follow it properly. please use agents to review your plan' \| sha256sum \| cut -d' ' -f1)"` | Exit 0, zero stderr, one compact-JCS `ExecutionBaseCompatibilityApplicationV1`; its receipt names exactly `Threat model`, `Environment & how-to-run`, and `Open questions`, its Markdown contains the exact generated Git diff, it binds the verified commits above, and it does not write the plan. |
| A4 | `node --input-type=module -e 'import { validateExecutionRange } from "./plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs"; try { validateExecutionRange({repo:process.cwd(),planPath:"docs/plans/active/relay-worker-lifecycle-primitives.md",plannedAtCommit:"12cf2ead208fe932084890b8e3fbd5c72591f3db",executionBaseCommit:"de925e9bc046645a72f59bcd493da44d53adaf5a",reviewedHead:process.argv[1]}); process.exit(1) } catch (error) { if (error.message!=="execution compatibility evidence missing") throw error }' "$(git rev-parse HEAD)"` | Exit 0 before lifecycle application/review/binding; the exact historical commits satisfy every closed legacy-shape predicate row and are rejected specifically because compatibility evidence is missing. |
| A5 | `node scripts/tests/plan-review-policy.mjs --case execution-compatibility` | Exit 0 and print `execution compatibility: strict-first evidence/review/binding/prerequisite/final-review and reuse passed`; the disposable positive returns schema-1 `LegacyExecutionRangeValidationV1`, an ordinary fixture returns the exact pre-change schema-1 strict object with no added key, strict and compatibility H→C reuse validate the derived Review block, and every ineligible E/R/B/Q/F mutation fails. |
| A6 | `node scripts/tests/plan-review-policy.mjs --case strict-differential --baseline 06a898abacfd57aad9dab0d48db8ad3c8e622318` | Exit 0 and print exactly `execution compatibility: strict differential passed cases=23`; the ordered corpus and digest exact-match this plan and every case has byte-identical exit/stdout/stderr against the baseline helper blob. |
| A7 | `node scripts/ci.mjs --plugin docks` | Exit 0 with skill/agent/plan policy guards and tests green; validator floors remain unchanged. |
| A8 | `node scripts/ci.mjs` | Exit 0 for all plugins and repository guards; only the documented local Session Relay binary digest warning may appear. |
| A9 | `BASE="$(node --input-type=module -e 'import fs from "node:fs"; import { parsePlan } from "./plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs"; const x=parsePlan(fs.readFileSync("docs/plans/active/legacy-start-transition-compatibility.md")).frontmatter.execution_base_commit; if(!/^[0-9a-f]{40}$/.test(x)) process.exit(1); process.stdout.write(x)')" && test -z "$(git status --porcelain)" && git diff --check "$BASE"..HEAD && node plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs execution-scope . "$BASE" "$(git rev-parse HEAD)" docs/plans/active/legacy-start-transition-compatibility.md` | Exit 0 and emit one compact-JCS `ExecutionScopeValidationV1`; the checkout is clean, every commit in the non-merge execution chain is inspected, and no transient or endpoint path falls outside the plan plus closed eight-file manifest. |

## Out of scope / do-NOT-touch

- `plugins/session-relay/**` — the compatibility implementation is Docks plan policy; Session Relay consumes the released result later.
- `plugins/effect-kit/**` — no Effect Kit payload changes or release are required.
- `/home/vagrant/projects/public/**` and docks-kit — docks-kit refreshes immutable releases only; it must not duplicate eligibility logic.
- Plugin manifests, marketplace versions, tags, and release records — source plan completion precedes the separately authorized release workflow.
- Existing strict review availability policy — standing consent suppresses only the consent prompt; host denial remains denial, and one available reviewer remains sufficient for ordinary review.
- Historical Git commits — never amend, rebase, replace, or synthesize a new execution base.

## Known gotchas

- `canonicalPlanView` currently strips only named review machine records. The compatibility record must remain visible in canonical review input; do not add it to `MACHINE_RECORD` stripping.
- Both mandatory Cross-check attribution lines remain canonical prose. R validates the first as an exact derived apply delta; B binds its hash; F reviews B and adds the second exact derived line. Do not pretend R or F canonical bytes equal their reviewed parent.
- The binding is written after R and remains canonical input. It avoids a hash cycle by pointing back to immutable E/R while Q closes downstream prerequisite facts and F reviews the binding-bearing, prerequisite-complete Q blob.
- Git abbreviations are accepted only for the legacy value already present in both historical plan blobs, minimum seven lowercase hex, and only when `rev-parse --verify` uniquely resolves to the supplied full planned base.
- A findings-free compatibility review is not a permanent approval of later implementation changes. Completion still performs ordinary current-head X/S plus executable acceptance over the full execution diff.
- Existing `ReviewRequest`, review bundle, completion receipt, prepared top-level keys, and cleanup sentinel are closed schema-1 contracts; compatibility is carried by canonical plan bytes and the already-existing `prepared.execution` value, not by appending keys.

## Global constraints

- Strict validation runs first and remains byte-for-byte behaviorally authoritative for normal plans.
- Compatibility cannot convert ancestry, multiparent, multi-path, non-start, Goal, Steps, Acceptance criteria, or protected-section failures into success.
- No zero-review result, waiver, standing consent, or `not_ready` reviewer can authorize compatibility.
- Plan-manager owns every lifecycle/evidence write and commit; plan-review remains read-only evidence-only.
- No release, version bump, tag, or push occurs inside this plan's implementation steps.
- Do not loosen validator floors or test assertions to make compatibility pass.

## STOP conditions

- The exact historical lifecycle plan shape cannot be represented by the closed policy without allowing Goal, Steps, Acceptance criteria, protected sections, another path, or a non-start transition to change.
- Completion prepare/reuse/ship cannot rederive the exact application and binding without breaking strict-mode receipts or requiring history rewrite.
- The normal strict path changes result for a fixture with no compatibility record.
- An unrelated or merge commit lands on `main` after this plan's execution base and before completion scope verification.
- Any outcome other than findings-free `dual|single`, or any waived/`not_ready`/finding-bearing passed leg, can reach `mode:"legacy_compatibility"` at R or F.

## Open questions

*(none — the owner authorized plan remodeling, independent agent review, and the ordered release work; standing cross-company consent remains subject to host availability.)*

## Self-review

The fresh exact-pair advisory reproduced one post-formal repair defect: the pre-E predicate required owner authorization even though `validateExecutionRange` receives no authorization input and the authorization record first exists inside E. This revision limits pre-evidence dispatch to structural policy rows and moves owner-confirmation validation to the present-application branch, making A4 reachable without weakening authorization once evidence exists. The stale zero-review request is superseded and cannot be applied.

The first formal sealed cross-company start leg returned 82/100 NOT READY with X1–X4. Direct source reproduction accepted all four: the strict fallback predicate contradicted A4/A6, exact transition bytes still honored ambient Git diff settings, the all-commit A9 proof lacked its necessary serialization precondition, and the machine-record sentence named only one of three existing records. This revision closes the 7–39-hex historical predicate and pins four near-miss fixtures, neutralizes every identified diff producer setting with literal argv, reserves the bounded execution range, and preserves the full existing machine-record set. The stale bundle/receipt cannot authorize start.

The exact-byte compatibility recheck accepted the historical facts, policy/authorization digests, and 23-case corpus but reproduced two construction gaps: the generic attributed-ingest prose left zero-finding/unavailable-leg rendering free-form, and the scope result hashes did not define a per-commit preimage. This revision adds a token-closed receipt-only renderer with exact date, leg result, empty ID/reason, orchestrator, insertion, and LF rules; it also binds a sorted allowed-path manifest plus an oldest-first commit/parent/path ledger and hashes the closed result without itself.

The first cold read rejected three weaker approaches: changing `execution_base_commit`, relaxing canonical equality globally, and treating later backfill commits as the historical start. Each either rewrote identity or broadened normal completion. This draft instead keeps strict-first validation and makes compatibility an explicit, canonical, reviewer-visible application with an immutable E/R/B chain, plan-only prerequisite closure Q, and fresh F review of the binding-bearing complete plan.

The review boundary is deliberately split: compatibility reviewers attest the historical exception, exact diff, and receipt at E; later completion reviewers still examine the current plan and full execution diff. Release and active-cache validation belong only to the related lifecycle plan's Step P, so this plan's Goal and acceptance end at Docks source readiness.

Cold-handoff audit found no undefined write owner: the helper emits application/binding bytes only; plan-manager commits E, dispatches and applies R with exact attribution, commits B from the binding constructor, then dispatches and applies F with exact attribution. Later completion revalidates immutable R plus retained application/binding bytes through a Review-partition-aware stable view. No existing closed schema-1 surface gains a key. docks-kit owns only downstream refresh.

Score: **99/100** · trajectory **84→93→98→99→exact-byte NOT READY→99→formal X 82 NOT READY→99** · stopped: **plateau (K=3)**. The first passes exposed opaque historical evidence, ambiguous preimages, incomplete partitioning, and a non-adjacent chain. Fresh reviewers then caught mandatory attribution deltas, completion Review-block replacement, missing binding construction, typed-outcome ambiguity, an underclosed strict corpus, endpoint-only scope, the unreviewed binding-bearing plan, a free-form attribution preimage, a union-only scope hash, an underclosed strict fallback, ambient diff configuration, undeclared serialization, and stale machine-record wording. This draft closes E/R/B/Q/F, a production binding constructor, Review-partition-aware reuse, the literal legacy predicate and 23-case differential corpus, deterministic Git diff bytes, the receipt-only attribution renderer, and the per-commit scope ledger; one point remains for the inherent complexity of committed legacy-history validation.

## Cold-handoff checklist

1. **File manifest:** present — four Steps name the exact eight implementation/test/documentation files.
2. **Environment & commands:** present — Node 24, focused tests, plugin/full CI, historical probe, exact diff argv, and source-scope verification are literal.
3. **Interface & data contracts:** present — policy JCS/hash, identity domains, application/material/receipt/binding records, E/R/B/Q/F protocol, exact attribution/reuse preimages, unchanged strict schema, and four CLI arities are closed.
4. **Executable acceptance:** present — A1–A9 are ordered commands with expected outputs, strict differential behavior, committed scope, and pre/post eligibility behavior.
5. **Out of scope:** present — Session Relay, Effect Kit, docks-kit logic, releases, manifests, and history rewriting are excluded.
6. **Decision rationale:** present — strict-first plus reviewed evidence is justified against three rejected alternatives.
7. **Known gotchas:** present — canonical visibility, attribution deltas, cycle-free E/R/B/Q/F timing, abbreviations, closed schema-1 surfaces, and completion re-review are explicit.
8. **Global constraints verbatim:** present — strict authority, protected failures, typed findings-free review, write ownership, no release, and no floor weakening are explicit.
9. **No undefined terms / forward refs:** present — every record, mode, hash, command, write owner, and release-activation check is defined here or points to an existing exact path.

Adversarial cold-read result: a fresh executor can reproduce the current rejection, inspect the exact historical diff, implement the narrow compatibility path without choosing its own eligibility, prove byte-identical strict behavior, update both source and shipped contracts, verify committed scope, and stop at source readiness. A later orchestrator can apply the lifecycle evidence after release without asking docks-kit to reinterpret plan policy.

## Review

*(filled by plan-review on completion)*

## Mistakes & Dead Ends

- **2026-07-13T06:10:09-03:00**: Treating the later full-SHA backfill as a replacement start identity would falsify history → keep the original execution base and bind the later compatibility evidence separately.
- **2026-07-13T06:10:09-03:00**: Excluding the compatibility record from canonical review input would let reviewers miss the exception they authorize → retain the application and binding in canonical input while validating the immutable review receipt at R.
- **2026-07-13T06:44:36-03:00**: Adding compatibility keys to closed schema-1 completion records would invalidate existing receipts → keep those shapes unchanged and carry compatibility through canonical plan input plus the existing prepared execution value.
- **2026-07-13T07:47:58-03:00**: Treating every canonical-start failure as a compatibility candidate would change ordinary strict errors → dispatch only for the closed abbreviated historical shape and pin full-identity near misses to baseline bytes.

## Sources

- `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs:1-160` — current parser, excluded lifecycle frontmatter, machine-record stripping, and canonical JCS behavior.
- `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs:612-622` — current strict execution-range validation and exact rejection boundary.
- `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs:681-710` — sealed canonical plan and completion bundle construction.
- `plugins/docks/skills/productivity/plan-manager/SKILL.md:155-220` — plan-manager owns review apply, start identity, completion execution, receipt, and reuse.
- `plugins/docks/skills/productivity/plan-review/SKILL.md:155-205` — plan-review remains read-only evidence-only and completion validates exact execution range.
- `scripts/tests/plan-review-policy.mjs:380-425` — current strict start fixture, bundle, disposable checkout, and cleanup tests.
- `docs/plans/AGENTS.md:45-105` — plan frontmatter and planned/start identity contract.
- [Git diff documentation](https://git-scm.com/docs/git-diff) — explicit algorithm, context, inter-hunk, indent, and no-rename flags override configurable patch production.
- [Git diff configuration](https://git-scm.com/docs/diff-config) — ambient context, inter-hunk, algorithm, rename, and blank-empty settings that the literal producer neutralizes.
