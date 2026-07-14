---
title: Add reviewed legacy start-transition compatibility
goal: Make Docks source-ready for a narrow, independently reviewed legacy start validator while preserving strict validation for every ordinary plan.
status: in_review
created: "2026-07-13T06:10:09-03:00"
updated: "2026-07-13T23:13:38-03:00"
started_at: "2026-07-13T10:04:28-03:00"
in_review_since: "2026-07-13T17:16:13-03:00"
assignee: null
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: xhigh
review_waivers: []
tags: [docks, plans, compatibility, review-policy]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/docks/skills/productivity/plan-init/SKILL.md
  - plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-review/SKILL.md
  - plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs
  - scripts/ci.mjs
  - scripts/tests/fixtures/plan-review-policy/sample-plan.md
  - scripts/tests/plan-review-policy.mjs
  - scripts/tests/plan-review-policy-mutations.mjs
  - scripts/tests/plan-review-policy-regressions.mjs
related_plans:
  - relay-worker-lifecycle-primitives
review_status: null
planned_at_commit: "06a898abacfd57aad9dab0d48db8ad3c8e622318"
execution_base_commit: "dcf4b6aaa354e2671da2ec773a0a7538aa31d508"
---

# Add reviewed legacy start-transition compatibility

## Goal

Make the Docks source ready for release with the strict plan-only first-start contract preserved for every ordinary plan, while adding one explicit compatibility route for an older plan whose single-parent, plan-only start commit also resolved an already-present owner question and carried a uniquely resolvable abbreviated `planned_at_commit`. Compatibility must be machine-checked, owner-authorized, independently reviewed with findings-free evidence, and commit-bound.

Success means this source plan passes completion review and is ready for the already-authorized Docks patch release. The related lifecycle plan's prerequisite Step P owns the later immutable release, active Codex/Claude cache equality after restart, compatibility evidence/review/binding application, and final range validation. No Session Relay implementation resumes before P is done.

## Context & rationale

The current completion validator correctly rejects `relay-worker-lifecycle-primitives`: its historical start commit changed only the plan and made a valid `planned → ongoing` transition, but it also resolved the already-present `threat-model-scope` owner question. The plan's `planned_at_commit` was the uniquely resolvable abbreviation `12cf2ea` at both the start parent and start commit; a later plan-only identity commit backfilled the full SHA and `execution_base_commit`. Current strict validation requires canonical plan equality across start and exact full `planned_at_commit` at the start commit, so committed history cannot satisfy it.

Rewriting the start commit is forbidden. Blindly relaxing `validateExecutionRange` would let an arbitrary implementation or deliverable change hide inside a start commit. The safe boundary is therefore a separately visible compatibility record over the exact historical diff, followed by the ordinary X/S review mechanism in findings-only mode. At least one reviewer must pass and every passed reviewer must return `ready` with zero findings; zero-review degradation, waivers, and `not_ready` results are ineligible.

This belongs in Docks because plan lifecycle validation, canonical review inputs, completion receipts, and ship-time reuse are Docks contracts. `docks-kit` later refreshes the released plugin and owns consumer-global `AGENTS.md` generation in `/home/vagrant/projects/public`; it may propagate general execution-efficiency heuristics there, but it must not own or reinterpret compatibility eligibility. Separating source readiness here from release/activation in the related plan avoids claiming active runtime bytes before an immutable release exists.

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
- Run the non-overlapping direct probes first, then one full CI gate. The full
  CI gate owns the policy baseline, bounded mutation suite, Docks plugin gate,
  and repository-wide checks; do not launch those same broad surfaces again as
  separate acceptance rows:

  ```bash
  node scripts/tests/plan-review-policy.mjs --case surfaces
  node scripts/tests/plan-review-policy.mjs --case strict-differential --baseline 06a898abacfd57aad9dab0d48db8ad3c8e622318
  node scripts/ci.mjs
  ```

- Historical reproduction before implementation:

  ```bash
  node --input-type=module -e 'import { validateExecutionRange } from "./plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs"; validateExecutionRange({repo:process.cwd(),planPath:"docs/plans/active/relay-worker-lifecycle-primitives.md",plannedAtCommit:"12cf2ead208fe932084890b8e3fbd5c72591f3db",executionBaseCommit:"de925e9bc046645a72f59bcd493da44d53adaf5a",reviewedHead:"06a898abacfd57aad9dab0d48db8ad3c8e622318"})'
  ```

  Before this plan, it must exit nonzero with `execution base is not the plan-only first-start transition`. After implementation it must still fail until the lifecycle plan contains the exact compatibility application, eligible `Review-receipt`, and commit-bound compatibility binding; historical shape alone never grants compatibility.

- **Serialized execution precondition:** from this plan's first `ongoing` transition through its completion-review receipt, `main` is reserved to this plan's plan-only lifecycle commits and its eleven affected paths. Plan-manager verifies `git rev-list --parents execution_base_commit..HEAD` plus `execution-scope` before every implementation dispatch and before completion. If any unrelated or merge commit lands in that interval, STOP; do not rewrite history, broaden the manifest, or silently ignore the commit. This is a deliberate bounded exception to parallel-plan default because A5 proves the entire committed implementation range, and the related lifecycle plan remains paused until this prerequisite ships.

- Release, installation, active-cache equality, and lifecycle evidence application are deliberately downstream. This plan defines the exact released `compatibility-prerequisite` constructor, its fixed observation argv/projections, and Q receipt/application bytes; the related lifecycle plan's Step P executes that constructor after release/refresh. This source plan neither performs nor claims those downstream observations.

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

Historical transition bytes are exactly stdout bytes from this command, executed inside a freshly initialized private temporary Git repository after the validated parent/base plan blobs are copied byte-for-byte to `a/$PLAN_PATH` and `b/$PLAN_PATH`:

```bash
git --no-pager -c diff.algorithm=myers -c diff.context=3 -c diff.interHunkContext=0 -c diff.suppressBlankEmpty=false -c diff.indentHeuristic=false -c diff.renames=false diff --no-index --text --binary --full-index --no-renames --diff-algorithm=myers --unified=3 --inter-hunk-context=0 --no-indent-heuristic --no-ext-diff --no-textconv --no-color --no-prefix -- "a/$PLAN_PATH" "b/$PLAN_PATH"
```

The helper first runs `git init -q --template=` in the private directory, creates both copied artifacts exclusively with mode `0600`, and writes a private mode-`0600` `.git/info/attributes` containing exactly `a/$PLAN_PATH !diff` and `b/$PLAN_PATH !diff`. It invokes both Git children without a shell under a canonical environment that removes repository/worktree/index/object/config/diff overrides, sets global and system config to the null device, sets `GIT_CONFIG_COUNT=0`, and forces both `GIT_CONFIG_NOSYSTEM=1` and `GIT_ATTR_NOSYSTEM=1`. Real repository-local, committed, and global attribute fixtures prove that binary, `-diff`, and named-driver configuration cannot change the produced bytes; the capture wrapper separately proves every no-index child retains the `GIT_ATTR_NOSYSTEM=1` system-file isolation invariant. The diff child must exit exactly 1 with zero stderr, emit valid UTF-8 normalized to LF, end in one LF, and have SHA-256 `transition_diff_sha256`; any init output, other status, signal, child error, stderr, malformed output, or missing isolation invariant fails. A `finally` cleanup removes the private repository on success or failure. The remaining explicit CLI/`-c` values neutralize algorithm, context, inter-hunk fusion, blank-empty suppression, indent shifting, rename detection, pager, color, textconv, and external diff configuration. No contextual relabeling or synthetic section diff participates, generation plus every validation rerun the identical producer, and the copied-artifact boundary preserves the historical command's exact `a/$PLAN_PATH` and `b/$PLAN_PATH` labels and ordinary textual bytes.

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
    schema:1, kind:"legacy_start_transition_authorization",
    authorization_id, authorization_scope_sha256, decision:"allow",
    source:"current_user", source_text_sha256,
    target:{schema:1,plan_path,planned_at_commit,execution_base_commit}
  },
  receipt_sha256 }
```

The partition manifest preimage is exact JCS `PartitionManifestV1 {schema:1,partitions:[{ordinal,name,before_sha256,after_sha256,changed}]}` in body order, including ordinal 0 `__preamble__`; its JCS SHA-256 is `partition_manifest_sha256`. `changed_sections` is the nonempty UTF-16-key-sorted projection of `changed=true`; each `transition_sha256` is SHA-256 of exact JCS `{schema:1,name,before_sha256,after_sha256}`. The protected preimage is exact JCS `ProtectedSectionsV1 {schema:1,sections:[{ordinal,name,sha256}]}` in historical body order, filtered to the policy list; parent/base bytes must be equal and `sha256` hashes those exact section bytes. Its JCS SHA-256 is `protected_sections_sha256`. The creation commit must be an ancestor of `execution_parent`. `receipt_sha256` hashes JCS without itself.

`compatibility-evidence` emits one closed `ExecutionBaseCompatibilityApplicationV1 {schema:1,markdown,receipt_sha256,review_material_sha256,application_sha256}`. `markdown` is the exact application block above, including its terminal LF; `application_sha256` hashes JCS without itself. Plan-manager applies only this exact string.

The owner-confirmation record is hard-bound to target plan `docs/plans/active/relay-worker-lifecycle-primitives.md`, planned commit `12cf2ead208fe932084890b8e3fbd5c72591f3db`, and execution base `de925e9bc046645a72f59bcd493da44d53adaf5a`, with authorization id `owner-2026-07-13-remodel-and-review-plan`, decision `allow`, source `current_user`, and message SHA-256 `1979e51b8ae33cd1de3af5e820200e1988d56363a9b7af1cae9523c7c20ddc96`. `CompatibilityAuthorizationScopeV1` is the exact `owner_confirmation` projection above with `authorization_scope_sha256` omitted; its compact JCS SHA-256 is the pinned literal `1c5cb608957a4589a4ac2bba05f4df29a6255c45034f9b59ecfda36a73327e10`, stored as `authorization_scope_sha256`. Construction checks the id/message, plan path, planned commit, and execution base independently; direct validation, stored-payload validation, and repository reconstruction separately require the literal digest and the exact digest-free scope. The helper receives only the id and message digest, stores no conversation text, exposes no target override, rejects replay against another exact-shape plan or history, and cannot infer consent from standing cross-company review consent.

The separately scoped Docks prerequisite release is owner-authorized by `DocksCompatibilityReleaseAuthorizationV1` JCS `{"authorization_id":"owner-2026-07-13-four-release-order-docks-prerequisite","decision":"allow","operations":["non_force_push_main","docks_patch_release_after_compatibility_completion","codex_plugin_refresh","claude_plugin_refresh"],"plan_path":"docs/plans/active/legacy-start-transition-compatibility.md","recorded_at":"2026-07-13T06:44:36-03:00","repository":"DocksDocks/docks","schema":1,"source":"repository-owner-current-conversation","source_text_sha256":"2bb31558648994b7d4fbba15abf3ed981c556c91e5ead91712f281d18acbac92"}` with SHA-256 `f8f38319a72f258dd66d9b31f620cd13ec1968f1d1d169d94e3ebc6b55dde77a`. It permits only a Docks patch release after this plan passes completion and ships, plus the two runtime refreshes; it does not authorize force, an Effect Kit/Session Relay release, or release before completion.

### Docks prerequisite receipt

`DocksCompatibilityPrerequisiteReceiptV1` is recursively closed. `Object40` is a lowercase 40-hex Git object id; `Commit40` additionally resolves to a commit. `Sha256` is lowercase 64-hex, `CoreSemver` matches `^[0-9]+\.[0-9]+\.[0-9]+$`, and `FinishedCompatibilityPath` is a `safeLogical` path matching `^docs/plans/finished/[0-9]{4}-[0-9]{2}-[0-9]{2}-legacy-start-transition-compatibility\.md$`.

`DocksCompatibilityPrerequisiteObservationsV1` and every nested projection are closed. The constructor generates canonical ISO `observed_at` immediately before the first child command, captures each child with direct argv and no shell, requires exit 0, hashes exact stdout/stderr bytes, parses stdout, and retains only the projection below. `canonical_repository_url` is the literal `https://github.com/DocksDocks/docks.git`; ambient remote names/configuration are never authority. The two canonical remote Git children use the closed configuration-neutral environment defined below, while authenticated GitHub/Codex/Claude children retain their ordinary process environment. Command order is remote main, remote tag, GitHub Release, Codex plugin, Claude plugin, then source/cache reads:

```text
{
  schema:1,
  observed_at:ISO8601,
  remote_main:{
    schema:1,
    argv:["git","ls-remote","--exit-code","--branches","https://github.com/DocksDocks/docks.git","refs/heads/main"],
    exit_code:0,stdout_sha256:Sha256,stderr_sha256:Sha256,
    projection:{commit:Commit40,ref:"refs/heads/main"}
  },
  remote_tag:{
    schema:1,
    argv:["git","ls-remote","--exit-code","--tags","https://github.com/DocksDocks/docks.git","refs/tags/${release_tag}","refs/tags/${release_tag}^{}"],
    exit_code:0,stdout_sha256:Sha256,stderr_sha256:Sha256,
    projection:{ref:"refs/tags/${release_tag}",annotated:boolean,tag_object:Object40,peeled_commit:release_commit}
  },
  github_release:{
    schema:1,
    argv:["gh","release","view",release_tag,"--repo","DocksDocks/docks","--json","isDraft,isPrerelease,tagName,url"],
    exit_code:0,stdout_sha256:Sha256,stderr_sha256:Sha256,
    projection:{isDraft:false,isPrerelease:false,tagName:release_tag,url:release_url}
  },
  codex_plugin:{
    schema:1,
    argv:["codex","plugin","list","--marketplace","docks","--json"],
    exit_code:0,stdout_sha256:Sha256,stderr_sha256:Sha256,
    projection:{pluginId:"docks@docks",name:"docks",marketplaceName:"docks",version:release_version,installed:true,enabled:true,source:{source:"git-subdir",url:"https://github.com/DocksDocks/docks.git",path:"plugins/docks",ref:"main"}}
  },
  claude_plugin:{
    schema:1,
    argv:["claude","plugin","list","--json"],
    exit_code:0,stdout_sha256:Sha256,stderr_sha256:Sha256,
    projection:{id:"docks@docks",version:release_version,scope:"user",enabled:true,installPath:claude_cache_root}
  },
  source_policy:{schema:1,git_spec:release_commit+":plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs",sha256:Sha256},
  codex_cache:{schema:1,home_relative_path:codex_cache_relative,absolute_path:codex_policy_path,sha256:Sha256},
  claude_cache:{schema:1,home_relative_path:claude_cache_relative,absolute_path:claude_policy_path,sha256:Sha256},
  observations_sha256:Sha256
}
```

The remote-main stdout must be exactly `<release_commit>\trefs/heads/main\n`. The remote-tag command passes both literal patterns `refs/tags/${release_tag}` and `refs/tags/${release_tag}^{}` because an exact unpeeled pattern alone does not cause `ls-remote` to emit the peeled row for an annotated tag. Its stdout is exactly either lightweight `<release_commit>\trefs/tags/<release_tag>\n`, projecting `annotated:false` and `tag_object=peeled_commit=release_commit`, or annotated `<tag_object>\trefs/tags/<release_tag>\n<release_commit>\trefs/tags/<release_tag>^{}\n`, projecting `annotated:true`, distinct `tag_object`, and `peeled_commit=release_commit`; missing, extra, reordered, duplicate, unpeeled, or other-ref rows fail. GitHub stdout must parse to the exact four-key projection shown. Codex stdout must parse to one unique `installed` entry whose selected closed projection is shown; Claude stdout must parse to one unique array entry whose selected projection is shown. Extra entries and unselected volatile plugin fields are allowed only in raw stdout and remain bound by `stdout_sha256`; a missing/duplicate selected entry fails. `codex_cache_relative` is exactly `.codex/plugins/cache/docks/docks/${release_version}/skills/productivity/plan-review/scripts/review-policy.mjs`; `claude_cache_relative` substitutes `.claude`. Their absolute paths are `path.join(os.homedir(), relative)`, must be canonical non-symlink regular files at observation time, and `claude_cache_root`/the Claude projection's `installPath` are exactly `path.join(os.homedir(), ".claude/plugins/cache/docks/docks", release_version)`. `source_policy.sha256`, both cache hashes, and the three top-level policy hashes below must be equal. `observations_sha256` hashes UTF-8 RFC-8785 JCS of the observation object with only itself omitted, with no prefix or LF.

Production and the deterministic fixture share exactly one exported task boundary:

```text
buildDocksCompatibilityPrerequisiteApplication(
  input:DocksCompatibilityPrerequisiteInputV1,
  dependencies?:DocksCompatibilityPrerequisiteDependenciesV1
):DocksCompatibilityPrerequisiteApplicationV1

DocksCompatibilityPrerequisiteInputV1 = {
  repo:string,
  planPath:string,
  finishedPlanPath:string,
  finishedPlanCommit:Commit40,
  releaseVersion:CoreSemver,
  evidenceCommit:Commit40,
  compatibilityReviewCommit:Commit40,
  bindingCommit:Commit40,
  authorizationId:string,
  authorizationSha256:Sha256
}

DocksCompatibilityPrerequisiteDependenciesV1 = {
  runChild(argv:string[], options:{cwd:string}):{
    status:integer|null,
    signal:string|null,
    error:null|{code:string|null,message:string},
    stdout:Buffer,
    stderr:Buffer
  },
  now():string,
  homedir():string,
  lstat(absolutePath:string):{kind:"file"|"directory"|"other",symbolicLink:boolean},
  realpath(absolutePath:string):string,
  readFile(absolutePath:string):Buffer
}
```

Both objects reject missing or extra own keys and every dependency member must be a function. The constructor validates the closed input before using a dependency; any dependency throw fails without an application. It derives `repoRoot=path.resolve(input.repo)`, requires `dependencies.realpath(repoRoot)===repoRoot`, and passes the exact options object `{cwd:repoRoot}` to every constructor `runChild` call—repository validation, canonical remote observations, GitHub, Codex, Claude, and source-blob reads alike. The production default `runChild` uses the common spawn options `{cwd,encoding:"buffer",shell:false,stdio:["ignore","pipe","pipe"],timeout:30000,killSignal:"SIGTERM",maxBuffer:1048576,windowsHide:true}` and adds `env:canonicalRemoteGitEnv(process.env)` only for the two exact canonical `git ls-remote` argv arrays above. `canonicalRemoteGitEnv(source)` copies `source` so executable lookup, proxy variables, and TLS/CA environment remain available; deletes `GIT_CONFIG`, `GIT_CONFIG_PARAMETERS`, `GIT_COMMON_DIR`, `GIT_WORK_TREE`, and every key matching `^GIT_CONFIG_(KEY|VALUE)_[0-9]+$`; then sets `GIT_DIR=os.devNull`, `GIT_CONFIG_GLOBAL=os.devNull`, `GIT_CONFIG_SYSTEM=os.devNull`, `GIT_CONFIG_NOSYSTEM="1"`, and `GIT_CONFIG_COUNT="0"`. This removes repository-local, worktree, system, global, include-derived, and command-scope Git configuration from the two remote authority observations while leaving their exact public HTTPS URL and process `PATH` intact. The ordinary repository-validation Git children and authenticated GitHub/Codex/Claude children use the inherited environment. Production normalizes documented `status`/`signal`/`error` plus raw Buffer output into the closed result above; absent stdout/stderr on a spawn error normalize to empty Buffers. Every result must have `error===null`, `signal===null`, integer `status===0`, Buffer stdout, and Buffer stderr before any decode/projection; truncation or any other shape fails. For the five recorded observation children—remote main, remote tag, GitHub Release, Codex plugin, and Claude plugin—stderr may contain arbitrary Buffer bytes, is never parsed or forwarded, and its exact hash is stored in that observation row. Every other constructor child, including repository validation and source-blob reads whose result shape has no stderr hash, requires `stderr.length===0`. Production `now` is `new Date().toISOString()`, `homedir` is `os.homedir()`, and the three file functions adapt `fs.lstatSync`, `fs.realpathSync`, and Buffer-returning `fs.readFileSync`. Cache validation requires `lstat.kind==="file"`, `symbolicLink===false`, `realpath(absolutePath)===absolutePath`, and hashes the returned Buffer. All Git, GitHub, Codex, and Claude children used by this constructor pass through `runChild` as exact arrays; no shell string exists.

The public `compatibility-prerequisite` CLI calls the constructor with exactly the closed ten-field input and omits the second argument, so production dependencies cannot be selected through argv, stdin, JSON, or `run(argv)`. It rejects any extra positional value. Tests import this same constructor and supply a closed fake dependency object: the fake accepts only the exact argv plus `{cwd:path.resolve(input.repo)}`, returns raw Buffers/errors, a fixed ISO time/home, normalized lstat/realpath results, and raw file Buffers; the constructor—not the fake—decodes, parses, projects, validates, and hashes them. The fixture's `runChild` may delegate repository-local Git argv to its own direct `spawnSync` call with the same fixed options against the disposable repository, but it cannot inject an observation object, parsed projection, hash, release URL/tag/commit, cache/source path, or application Markdown. Regression fixtures must prove extra CLI values cannot select dependencies or supply time/path/raw/parsed observation state, every wrong child cwd fails, recorded nonempty stderr is accepted only with its constructor-derived hash, stale or partially recomputed stored hashes fail, and nonempty stderr from any unrecorded child fails. Opaque output digests are integrity fields under the trusted plan-manager constructor boundary, not signatures: a sole writer acting outside the trusted-constructor assumption could author an alternate fully self-consistent Q and matching F, which is outside this plan's model.

Before any remote observation, the constructor must reconstruct E's complete `ExecutionBaseCompatibilityApplicationV1` through that same injected raw-child repository seam, not merely validate stored self-hashes. It requires the stored receipt's `plan_path===input.planPath`, rederives the exact evidence parent, historical creation/start identities, blob ids, partition/protected/changed-section preimages, transition diff bytes, material, receipt, owner record, and application Markdown, then compares the reconstructed application byte-for-byte with E. The reconstruction uses no ambient/global Git helper outside `dependencies.runChild`; a fake dependency therefore observes every repository read and can prove a self-consistent but historically false application fails before release observations or Q output.

```text
{
  schema:1,
  authorization_id:"owner-2026-07-13-four-release-order-docks-prerequisite",
  authorization_sha256:"f8f38319a72f258dd66d9b31f620cd13ec1968f1d1d169d94e3ebc6b55dde77a",
  finished_plan_path:FinishedCompatibilityPath,
  finished_plan_commit:Commit40,
  release_version:CoreSemver,
  release_tag:string,
  release_commit:Commit40,
  release_url:string,
  source_policy_sha256:Sha256,
  codex_policy_sha256:Sha256,
  claude_policy_sha256:Sha256,
  observations:DocksCompatibilityPrerequisiteObservationsV1,
  evidence_commit:Commit40,
  compatibility_review_commit:Commit40,
  binding_commit:Commit40,
  binding_sha256:Sha256,
  receipt_sha256:Sha256
}
```

`authorization_sha256` must rederive from the exact compact JCS `DocksCompatibilityReleaseAuthorizationV1` above; matching only the stored literal is insufficient. `finished_plan_commit` must contain `finished_plan_path`, must not contain the active compatibility-plan path, and that archived plan must parse as `status: finished`, `review_status: passed` with its current derived-passed completion receipt. `release_commit` is the single-parent direct child of `finished_plan_commit`. Its raw committed delta changes only `plugins/docks/.claude-plugin/plugin.json`, `plugins/docks/.codex-plugin/plugin.json`, and the `docks` entry in `.claude-plugin/marketplace.json`; in each object only the version changes, all three resulting versions equal `release_version`, and it is the numeric patch successor of the parent version. Effect Kit and Session Relay manifest blobs remain byte-identical. `release_tag` is exactly `docks--v${release_version}`; both the local peel and canonical-remote `remote_tag.peeled_commit` equal `release_commit`. `release_url` is exactly `https://github.com/DocksDocks/docks/releases/tag/${release_tag}`.

`source_policy_sha256` is SHA-256 of exact blob bytes at `release_commit:plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs`; the two cache hashes are copied from the validated observation object. The read-only `compatibility-prerequisite` constructor below performs every external observation itself and emits `DocksCompatibilityPrerequisiteApplicationV1 {schema:1,markdown,receipt_sha256,observations_sha256,application_sha256}`. `markdown` is exactly the fenced replacement string; `observations_sha256` equals the nested observation hash; `application_sha256` hashes compact JCS without itself. Plan-manager applies only `markdown`. Later immutable validation rederives Git identities and source hash, revalidates the complete stored observation structure, self-hashes, constrained projections, and three-way policy equality; it deliberately does not re-read the network or mutable caches and therefore does not claim independent authenticity for opaque stdout/stderr digests beyond trusted constructor provenance plus immutable Q/F commits.

The commit identities are exact: `parent(evidence_commit)=release_commit`, `parent(compatibility_review_commit)=evidence_commit`, `parent(binding_commit)=compatibility_review_commit`, and `parent(Q)=binding_commit`. They must equal E, R, and B recovered from the validated application, review receipt, and binding. `binding_sha256` must equal the exact binding introduced at B and retained in Q. Each E/R/B/Q delta independently satisfies the plan-only rules below; a self-consistent receipt cannot authorize a fork, merge, intervening commit, different plan, or different binding. Let `preimage` be the receipt with only `receipt_sha256` omitted. `receipt_sha256` is SHA-256 of its UTF-8 RFC-8785 JCS bytes, with no prefix or LF; the rendered receipt is RFC-8785 JCS of the complete object.

In B's target-plan blob, the exact pending-marker bytes, including one LF, must occur once and have SHA-256 `b5474a78577308a6f844557778dd02a513b8f5bee404c46a88235d18fcb73ced`:

```text
Pending until exact Step-P E/R/B and Docks release/cache verification. In Q, plan-manager replaces only this sentence with one fenced, one-line compact-JCS `DocksCompatibilityPrerequisiteReceiptV1`, changes Step P `planned` to `done`, bumps `updated`, validates the resulting blob, and commits plan-only before final ordinary review F.
```

Plan-manager replaces exactly those bytes with `"```json\n" + jcs(receipt) + "\n```\n"`; the existing following blank line remains. In the same Q delta, the unique Step-P row changes exactly from the first line below to the second. Each displayed row includes its terminal LF; their SHA-256 values are respectively `cd9a017792436c305c5c7c3a8b3b62a9325c9d5951d2e571084e72942cb17174` and `1319228f952ab08c95122d98907a7654bf18ba31db7e6d21b015178cd7675aae`.

```text
| P | Complete the exact Docks-only compatibility prerequisite before any implementation worker resumes: finish/archive the compatibility plan, release/install/cache-verify Docks under the recorded authorization, commit contiguous E/R/B, commit prerequisite closure Q with P `done`, then obtain findings-free final ordinary review F and revalidate the range. | Plan-manager-returned `docs/plans/finished/<date>-legacy-start-transition-compatibility.md` (read-only), `docs/plans/active/relay-worker-lifecycle-primitives.md` (plan-manager-only E/R/B/Q/F writes), `$HOME/.codex/plugins/cache/docks/docks/$RELEASE_VERSION/skills/productivity/plan-review/scripts/review-policy.mjs` (read-only), `$HOME/.claude/plugins/cache/docks/docks/$RELEASE_VERSION/skills/productivity/plan-review/scripts/review-policy.mjs` (read-only) | 1, 3b | planned | The exact Step-P block above passes. Q embeds one valid `DocksCompatibilityPrerequisiteReceiptV1` and changes only its pending sentence, P status, and `updated`; F's findings-free `dual|single` receipt reviews Q. The current plan retains exact E material/receipt, immutable R review, B binding, Q prerequisite evidence, and F receipt. Both released cache helpers emit byte-identical schema-1 `LegacyExecutionRangeValidationV1`; only F becomes `PLAN_COMMIT`/`PLAN_BLOB`. Effect Kit and Session Relay versions are unchanged. Any other outcome, stale cache, absent release, E/R/B/Q/F gap, non-plan delta, or authorization mismatch is STOP. P appends no acceptance event or implementation-range receipt. |
| P | Complete the exact Docks-only compatibility prerequisite before any implementation worker resumes: finish/archive the compatibility plan, release/install/cache-verify Docks under the recorded authorization, commit contiguous E/R/B, commit prerequisite closure Q with P `done`, then obtain findings-free final ordinary review F and revalidate the range. | Plan-manager-returned `docs/plans/finished/<date>-legacy-start-transition-compatibility.md` (read-only), `docs/plans/active/relay-worker-lifecycle-primitives.md` (plan-manager-only E/R/B/Q/F writes), `$HOME/.codex/plugins/cache/docks/docks/$RELEASE_VERSION/skills/productivity/plan-review/scripts/review-policy.mjs` (read-only), `$HOME/.claude/plugins/cache/docks/docks/$RELEASE_VERSION/skills/productivity/plan-review/scripts/review-policy.mjs` (read-only) | 1, 3b | done | The exact Step-P block above passes. Q embeds one valid `DocksCompatibilityPrerequisiteReceiptV1` and changes only its pending sentence, P status, and `updated`; F's findings-free `dual|single` receipt reviews Q. The current plan retains exact E material/receipt, immutable R review, B binding, Q prerequisite evidence, and F receipt. Both released cache helpers emit byte-identical schema-1 `LegacyExecutionRangeValidationV1`; only F becomes `PLAN_COMMIT`/`PLAN_BLOB`. Effect Kit and Session Relay versions are unchanged. Any other outcome, stale cache, absent release, E/R/B/Q/F gap, non-plan delta, or authorization mismatch is STOP. P appends no acceptance event or implementation-range receipt. |
```

Missing or duplicate markers, CRLF, another fence language or length, indentation, whitespace around the JCS line, a non-JCS line, an extra blank line inside the fence, another Step-row change, or any additional plan byte fails before F review. Q is not stored inside its own receipt; `prerequisite_commit` is derived as the exact child of B carrying this validated delta.

### Exact review and commit chain

Let `E0` be clean `evidence_input_commit`, `E` the compatibility-application commit, `R` the compatibility-review receipt commit, `B` the binding commit, `Q` the target plan's plan-only prerequisite-closure commit, and `F` the fresh ordinary execution-review receipt commit. Plan-manager performs and later validation proves exactly:

1. `parent(E)=E0`; E is single-parent and changes only the plan; its raw plan diff is exactly insertion of `ExecutionBaseCompatibilityApplicationV1.markdown` before `## Review` plus the normal excluded `updated` field change. No compatibility material/receipt/binding existed at E0.
2. Ordinary `prepare(none) → X/S findings-only review → apply` reviews E. Outcome is exactly `dual` or `single`; at least one raw leg is `passed`, every passed leg returns `ready` with zero findings, and the other leg—if any—has its exact ordinary unavailable result. `zero_degraded`, `blocked`, waiver, `not_ready`, or a passed leg with findings is ineligible.
3. `parent(R)=E`; R is single-parent and changes only the plan. Its raw plan delta is exactly one mandatory attributed `Cross-check (...)` line appended inside `## Self-review`, one compact-JCS `Review-receipt:` line, and an optional excluded `updated` change. The attribution is rendered only by the compatibility renderer below; no free-form reason or identity participates and no other prose changes. The receipt's `reviewed_commit` is E and its input hash exact-matches `canonicalPlanView(E)`. `review_receipt_sha256` is SHA-256 of the compact JCS receipt payload bytes only—no `Review-receipt: ` prefix and no LF—and `review_attribution_sha256` is SHA-256 of the exact attribution line including its terminal LF.
4. `parent(B)=R`; B is single-parent and changes only the plan. `compatibility-binding` validates E/R plus their exact receipt/attribution delta and emits closed `ExecutionBaseCompatibilityBindingApplicationV1 {schema:1,markdown,binding_sha256,application_sha256}`; `markdown` is exactly `Execution-base-compatibility-binding: <compact JCS ExecutionBaseCompatibilityBindingV1>\n`, and the application self-hash omits itself. The binding is `ExecutionBaseCompatibilityBindingV1 {schema:1,compatibility_receipt_sha256,compatibility_evidence_commit:E,reviewed_commit:E,review_commit:R,review_receipt_sha256,review_attribution_sha256,binding_parent:R,binding_sha256}` and hashes JCS without itself. B's raw delta is exactly that emitted line plus an optional excluded `updated` change.
5. After the authorized release/refresh, plan-manager invokes the exact `compatibility-prerequisite` constructor against B's plan blob and the finished/release/E/R/B identities. `parent(Q)=B`; Q is single-parent and changes only the target plan. It applies only the returned `DocksCompatibilityPrerequisiteApplicationV1.markdown`, the exact Step-P row replacement defined above, and optional excluded `updated`; no other byte changes. This closes typed remote/release/plugin/cache/E/R/B observations before execution review.
6. Ordinary `prepare(none) → X/S findings-only review → apply` reviews the exact Q plan blob so reviewers see the binding and closed prerequisite. `parent(F)=Q`; F is single-parent and changes only the plan. Its raw delta is exactly a second mandatory line from the same compatibility renderer, replacement of R's one ordinary `Review-receipt:` with F's receipt, and an optional excluded `updated` change. Its outcome is exactly `dual|single` under the same findings-free eligibility rule, and its receipt binds reviewed commit Q. F is the only plan blob eligible to become execution authority.

The compatibility attribution renderer is a pure function of a validated eligible draft receipt. `reviewed_at` must be canonical ISO-8601 and `date` is exactly its first ten ASCII bytes. For each leg, `company` is the existing `companyForLeg(author.company, leg)` result; `model`/`effort` are `raw.selected.model`/`raw.selected.effort` when selected, otherwise the final attempt's model/effort when attempts are nonempty, otherwise the literals `none`/`none`. The orchestrator identity is exactly `author.company author.tool author.model author.effort`. Every interpolated identity token must match `^[a-z0-9][a-z0-9._/-]*$`; `raw.result` is its validated enum literal. Eligibility additionally requires `X.raw.findings`, `S.raw.findings`, both legs' `reconciliation.accepted` and `reconciliation.rejected`, and `receipt.reproduced` all to be empty arrays, so empty IDs and reasons always render as the literal `none`. The one-line UTF-8 string, including its terminal LF and no leading whitespace, is exactly:

```text
Cross-check (${date}): [X: ${X.company} ${X.model} ${X.effort}; result=${X.result}] 0 findings — accepted none / rejected none (none); [S: ${S.company} ${S.model} ${S.effort}; result=${S.result}] 0 findings — accepted none / rejected none (none); [orchestrator: ${author.company} ${author.tool} ${author.model} ${author.effort}] independently verified none against source before accepting.\n
```

The unique unfenced `## Self-review` partition must end in exactly two LF bytes immediately before the next level-2 heading. If `attribution` is the exact string above, apply computes `selfReview.slice(0, -1) + attribution + "\n"`; R therefore appends its line as the final nonblank line, and F retains R then appends its own line immediately after it. Missing/duplicate headings, a different separator, CRLF, token mismatch, nonempty IDs/reasons, a hand-authored line, or a missing/extra terminal LF fails before any write. `compatibility-binding` reconstructs this exact R line from R's validated receipt and accepts no caller-supplied attribution bytes.

E→R→B→Q→F is contiguous for this target. Intervening, merge, multi-path, extra prose, replacement-record, second-binding, or reordered commits fail. B is located as the unique first commit introducing the exact binding and must be an ancestor of `reviewed_head`. The current plan retains byte-identical application material, compatibility receipt, binding, and prerequisite receipt. Later ordinary `Review-receipt:` replacement is allowed because compatibility validation reads immutable R; execution begins only from F's receipt-bearing plan blob, and completion review still evaluates all later plan/implementation changes.

### Completion Review block renderer

`CompletionReviewBlockV1` is an internal-only pure projection of an already-successful `validateCompletionReceipt(receipt)`; it adds no receipt field or public command:

```text
{
  schema:1,
  goal_met:receipt.primary.goal_met,
  regressions:receipt.primary.regressions,
  ci:receipt.primary.ci,
  followups:receipt.primary.followups,
  filed_by:{role:"plan-manager",receipt_author:receipt.author,reviewed_at:receipt.reviewed_at},
  cross_check:null|{
    date,
    X:CompletionReviewLegV1,
    S:CompletionReviewLegV1,
    reproduced_ids,
    orchestrator:receipt.author
  }
}

CompletionReviewLegV1 = {
  company,model,effort,result,finding_count,
  accepted:[id],rejected:[{id,reason}]
}
```

`cross_check` is non-null exactly when `receipt.X.raw.result==="passed"`; a passed `not_ready` verdict still renders, while unavailable, denied, or waived X does not. `date` is the first ten ASCII bytes of canonical `receipt.reviewed_at`. Company uses `companyForLeg(receipt.author.company, leg)`. Model/effort use `raw.selected`, otherwise the last attempt, otherwise `none`. `finding_count` is `raw.findings.length`. Each leg's `accepted` is `receipt.<leg>.reconciliation.accepted.slice().sort(compareUtf16)`. Its `rejected` is `receipt.<leg>.reconciliation.rejected.map(({id,reason})=>({id,reason})).sort((a,b)=>compareUtf16(a.id,b.id))`; receipt validation already rejects duplicate IDs. `reproduced_ids` is `receipt.reproduced.filter(row=>row.source==="X"||row.source==="S").map(row=>row.id).sort(compareUtf16)`. Primary IDs are excluded. Regressions and follow-ups preserve receipt order. No byte derives from ambient executor identity or apply-time prose.

The renderer-local `q(value)` first rejects non-Unicode-scalar strings, then emits surrounding ASCII double quotes; ASCII alphanumerics and space remain literal, every other BMP scalar becomes lowercase `\\uXXXX`, and each astral scalar becomes its canonical lowercase UTF-16 surrogate-pair escapes. Validated enums, finding IDs, SHA-256 values, canonical ISO date, and canonical decimal integers render directly. `qArray` uses exact JSON-array punctuation with no spaces: `[]` or `[${q(a)},${q(b)}]`. This makes LF, CR, headings, fences, HTML/Markdown syntax, quotes, backslashes, bidi controls, U+2028/U+2029, and non-ASCII text structurally inert. The final receipt uses ordinary compact JCS, whose validated strings contain no physical CR/LF.

The exact core is these lines in order, joined by LF and ending in one LF. `optionalCrossCheckLine` is either the one line defined next or absent; absence contributes no blank placeholder. There is exactly one blank line immediately before the machine record.

```text
## Review

- **Goal met:** ${goal_met}
- **Regressions:** ${qArray(regressions)}
- **CI:** {"command":${q(ci.command)},"exit_code":${decimal(ci.exit_code)},"first_failure":${ci.first_failure===null?"null":q(ci.first_failure)},"output_sha256":"${ci.output_sha256}"}
- **Follow-ups:** ${qArray(followups)}
- **Filed by:** {"role":"plan-manager","receipt_author":{"company":"${author.company}","tool":${q(author.tool)},"model":${q(author.model)},"effort":${q(author.effort)}},"reviewed_at":${q(reviewed_at)}}
${optionalCrossCheckLine}

Completion-review-receipt: ${jcs(receipt)}
```

When present, `optionalCrossCheckLine` is exactly:

```text
- **Cross-check:** (${date}) [X: ${X.company} ${q(X.model)} ${q(X.effort)}; result=${X.result}] ${X.finding_count} findings — accepted ${ids(X.accepted)} / rejected ${rejections(X.rejected)}; [S: ${S.company} ${q(S.model)} ${q(S.effort)}; result=${S.result}] ${S.finding_count} findings — accepted ${ids(S.accepted)} / rejected ${rejections(S.rejected)}; [orchestrator: ${author.company} ${q(author.tool)} ${q(author.model)} ${q(author.effort)}] independently verified ${ids(reproduced_ids)} against source before accepting.
```

`ids([])` and `rejections([])` render `none`; otherwise IDs are comma-joined and rejected rows are `${id}=${q(reason)}`, comma-joined. The renderer requires exactly one unfenced exact `## Review` heading and replaces its whole level-2 partition, never individual bullets. Its core ends in exactly one LF; when another unfenced level-2 section follows, splice exactly one additional LF before that heading, while Review-at-EOF adds nothing. The receipt is the last nonblank Review line. Same-receipt reapply is byte-identical; a new receipt replaces the whole partition.

### Strict-first validation and completion reuse

`validateExecutionRange` preserves the strict path's current error ordering and exact schema-1 return bytes. It first evaluates the existing ancestry, single-parent, plan-only, status, `started_at`, canonical-start, and head identity checks and retains the first original error object without rewriting its bytes. Compatibility dispatch is considered only when that first error is exactly `execution base is not the plan-only first-start transition` **and** the closed legacy-shape predicate below passes; otherwise the original error is rethrown unchanged:

1. The status/`started_at`, ancestry, single-parent, and plan-only parts of the current start check pass; only canonical body equality fails.
2. `planned_at_commit` in both execution-parent and execution-base blobs is the same lowercase 7–39 hex abbreviation, uniquely resolves with `rev-parse --verify <value>^{commit}` to the supplied full `planned_at_commit`, and is the only frontmatter difference ignored while comparing the legacy bodies. A 40-hex value, missing value, unequal abbreviations, ambiguous resolution, or another ignored difference fails this predicate.
3. The head carries the exact supplied full `planned_at_commit` and exact `execution_base_commit`; the plan-creation ancestry/add-only facts pass; and heading vector, partition manifest, changed partitions, plus protected equality satisfy only the literal policy's `creation`, `legacy_planned_at`, `start`, and `body` rows. Owner confirmation and review evidence are deliberately not pre-evidence predicate inputs because neither exists before E.

When that predicate passes, absence of the application block yields exactly `execution compatibility evidence missing`. A present block must then validate its owner-confirmation id/digest, material, receipt, and policy hash before proceeding through E/R/B/Q/F; missing or wrong owner confirmation is a typed compatibility-evidence error, never a pre-evidence shape failure. A malformed/ineligible present block yields its typed compatibility error and never falls back to success. Every other fixture—including canonical drift with full identities and base/head identity mismatch—stays on the ordinary strict path and reproduces the original exit/stdout/stderr byte-for-byte.

Compatibility returns closed `LegacyExecutionRangeValidationV1 {schema:1,mode:"legacy_compatibility",planned_at_commit,execution_base_commit,reviewed_head,execution_parent,compatibility_receipt_sha256,compatibility_evidence_commit,compatibility_review_commit,compatibility_binding_commit,compatibility_binding_sha256,prerequisite_commit,prerequisite_receipt_sha256,execution_review_input_commit,execution_review_commit,execution_review_receipt_sha256,execution_review_attribution_sha256}`. For this target, prerequisite/execution-review identities are Q/Q/F and the execution receipt binds Q; F must be an ancestor of `reviewed_head`, and every E..F commit is plan-only/single-parent with exact deltas above. It is stored inside the already-existing prepared completion identity and recomputed byte-equal for that same `reviewed_head`; strict returns remain unchanged.

`ReviewRequest`, bundle manifest/completion, `Completion-review-receipt`, prepared top-level keys, and cleanup sentinel remain their existing closed schema-1 shapes. Compatibility is transitively bound because the application and binding remain canonical plan input, while `planned_at_commit` and `execution_base_commit` are already explicit completion identities. Completion prepare at head H validates compatibility at H. Completion receipt apply creates C and replaces the whole `## Review` partition with `CompletionReviewBlockV1`. For ship reuse, `completionStablePlanViewV1` parses unique unfenced level-2 sections, removes the complete Review partition at both H and C, and otherwise applies `canonicalPlanView`; those stable views must be byte-equal. Separately, C's Review partition must byte-equal the exact renderer output from C's validated receipt, and the application/binding lines at C must byte-equal H. It reads immutable R, avoiding any H→C reviewed-head hash cycle. Strict and compatibility fixtures exercise this same closed reuse rule; no existing schema-1 receipt gains a field.

The helper exposes five read-only commands:

```text
review-policy.mjs compatibility-evidence <repo> <reviewed-head> <plan-path> <planned-at> <execution-base> <authorization-id> <owner-message-sha256>
review-policy.mjs compatibility-binding <repo> <plan-path> <evidence-commit> <review-commit>
review-policy.mjs compatibility-prerequisite <repo> <plan-path> <finished-plan-path> <finished-plan-commit> <release-version> <evidence-commit> <compatibility-review-commit> <binding-commit> <authorization-id> <authorization-sha256>
review-policy.mjs execution-range <repo> <reviewed-head> <plan-path> <planned-at> <execution-base>
review-policy.mjs execution-scope <repo> <base> <head> <plan-path> <expected-allowed-paths-sha256>
```

Each accepts only the exact positional arity shown and emits one compact JCS line to stdout, zero stderr. `compatibility-evidence` emits `ExecutionBaseCompatibilityApplicationV1`; `compatibility-binding` emits `ExecutionBaseCompatibilityBindingApplicationV1`; `compatibility-prerequisite` generates `observed_at`, performs the fixed observation sequence above, derives `release_commit=parent(evidence_commit)`, `release_tag`, release URL and cache paths, validates the finished/release/E/R/B identities, and emits `DocksCompatibilityPrerequisiteApplicationV1`. It accepts no caller-supplied observation JSON, output hash, URL, tag, release commit, cache path, or time. Plan-manager alone applies exact Markdown and owns E/R/B/Q/F. `execution-range` emits the unchanged strict object or `LegacyExecutionRangeValidationV1`.

`execution-scope` requires clean exact full commits and a 64-hex `expected-allowed-paths-sha256`, then walks parents from `head` back to `base`, rejecting absence of `base`, merges, or a fork before reversing that list to oldest-first order. The allowed manifest preimage is exact `ExecutionScopeAllowedPathsV1 {schema:1,paths}` where `paths` is the UTF-16-key-sorted unique list of the exact plan path plus the head plan's eleven `affected_paths`; every entry must be valid UTF-8, pass `safeLogical`, and be unique before sorting. `allowed_paths_sha256` is SHA-256 of its compact JCS and must equal the independently sealed expected digest before any ledger path is trusted; for this plan that digest is `1afde4ed2a8e8f4601b97f07c3962fb14bde0e1f54b00bd3787d8b6c3e60afe3`. For each commit, the helper reads NUL-delimited paths from `git diff-tree --no-commit-id --name-only -r -z --no-renames <parent> <commit> --`, requires valid UTF-8 and `safeLogical`, rejects duplicates, sorts by UTF-16 key, and requires every path to occur in the sealed allowed manifest. The changed-ledger preimage is exact `ExecutionScopeChangedPathsV1 {schema:1,base,head,commits:[{ordinal,commit,parent,paths}]}` with contiguous one-based ordinals, the first parent equal to `base`, and each later parent equal to the preceding commit; it retains empty path arrays and therefore binds every commit rather than a union. `changed_paths_sha256` is SHA-256 of that compact JCS. The emitted closed result is `ExecutionScopeValidationV1 {schema:1,base,head,commit_count,allowed_paths_sha256,changed_paths_sha256,result_sha256}`, `commit_count` equals ledger length, and `result_sha256` is SHA-256 of compact JCS over every preceding result field. A plan edit that broadens `affected_paths`, config-dependent rename detection, endpoint-only union, omitted empty commit, alternate ordering, or caller-selected manifest fails.

`scripts/tests/plan-review-policy.mjs` accepts `--case execution-compatibility` and `--case strict-differential --baseline <40hex>`. The first builds a disposable exact-shape repository, applies E/R/B/Q/F through the real exported helpers and plan-manager deltas, validates compatibility plus strict and compatibility H→C completion reuse, removes the fixture, and prints `execution compatibility: strict-first evidence/review/binding/prerequisite/final-review and reuse passed`.

The strict differential corpus is exact JCS `{"cases":["strict-success","path-escape","planned-short","planned-missing","execution-short","execution-missing","reviewed-short","reviewed-missing","planned-to-base-ancestry","base-to-head-ancestry","base-multi-parent","base-extra-path","base-plan-missing","parent-plan-missing","head-plan-missing","base-status","base-started-at","parent-status","parent-started-at","canonical-start-drift","base-planned-at-identity","head-planned-at-identity","head-execution-base-identity"],"schema":1}` with SHA-256 `d87c62456967c5bd54dd0f3b7d564881164dd1fd5217fa00720d6c234bc01fd9`. The selector extracts the baseline helper by Git blob, exact-matches that ordered 23-case inventory and digest, executes baseline and candidate against every case, and requires byte-identical exit/stdout/stderr before printing `execution compatibility: strict differential passed cases=23`. `canonical-start-drift` uses correct full parent/base/head identities and changes one ordinary body byte at the base; `base-planned-at-identity` gives parent and base the same wrong full 40-hex commit while the supplied/head identity is correct; `head-planned-at-identity` changes only the head's full planned identity; `head-execution-base-identity` changes only the head's full execution-base identity. Those four never satisfy the 7–39-hex legacy predicate and must retain the baseline's original error bytes. Unknown, missing, extra, reordered, duplicate, or hand-modeled cases fail.

## Steps

| # | Task | Files | Depends | Status | Done when |
|---|---|---|---|---|---|
| 1 | Implement strict-first compatibility application/material/receipt/binding/prerequisite validation, attribute-independent exact textual transition material, exact `CompletionReviewBlockV1` plus completion-stable view, history scope validation, and the five public read-only helper commands. Preserve the existing strict schema-1 return and exact error order outside the closed legacy-shape predicate. | `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs:1-6,594-628,925-957` (current imports, Git/execution-range helpers, and CLI dispatch; place the new compatibility constructors/validators beside the execution-range boundary) | — | done | Direct A1–A2 probes pass. The historical legacy shape reaches the typed missing-evidence error without E/R/B/Q/F; full-identity drift and every other ordinary strict case retain original bytes; the owner authorization is bound to the exact target path/planned/base identity and rejects alternate-plan replay; the exported prerequisite constructor and closed production/fake dependency seam above are exact; validated UTF-8 plan blobs always yield the same textual transition despite ambient attribute rules; prerequisite observations, execution scope, and Review rendering are closed; helper outputs are read-only. |
| 2 | Add full positive and regression coverage for creation ancestry, start/history, exact diff material including real repository-local, committed, and global binary/`-diff`/named-driver attributes plus behavioral `GIT_ATTR_NOSYSTEM` isolation, owner target binding, constructor-bound remote/release/plugin/cache observations, release/archive prerequisite receipt, E/R/B/Q/F adjacency and attribution, findings-free `dual|single` eligibility, special-character-safe `CompletionReviewBlockV1`, strict/compatibility H→C reuse, exact 23-case differential behavior, sealed per-commit scope, and a fast source contract for the CI orchestrator. The mutation driver uses one immutable source snapshot, per-invocation namespaced owned roots, a bounded asynchronous child-process pool, focused selectors, declaration-order reconciliation, and signal-safe child/root cleanup without weakening any mutation. | `scripts/ci.mjs:94-98`; `scripts/tests/fixtures/plan-review-policy/sample-plan.md:1-50`; `scripts/tests/plan-review-policy.mjs:1-129,382-424,517-529,1275-1335`; `scripts/tests/plan-review-policy-regressions.mjs:1-205,400-860` | 1 | done | A4 passes independently; the immutable policy baseline runs only through the regression driver, whose baseline asserts the full named contract before admitting mutations; the driver defaults to `max(1,min(6,os.availableParallelism()))` jobs, keeps the validated `--jobs <N>` bound `1 <= N <= os.availableParallelism()`, and runs each of the closed 57 mutations exactly once; the immutable snapshot includes `scripts/ci.mjs`, the full baseline asserts zero no-argument direct full-harness launches, exactly one focused `--case surfaces` guard, and exactly one regression-driver `--self-test` launch, and independent mutations detect dropping the focused guard, dropping the driver call, or restoring the direct full-harness duplicate; exact argv contains the private copied-artifact `--no-index --text` producer, and attribute-regression fixtures remain byte-identical to the ordinary textual material during generation and reconstruction even when an ambient named driver changes the old direct producer; copied-artifact and child-isolation mutations fail; every owner source/target/digest field, alternate-history replay, scope self-broadening fails independently before acceptance; the positive fixture calls `buildDocksCompatibilityPrerequisiteApplication` with raw-result dependencies, while public-CLI negatives reject dependency/time/path/observation injection; the regression driver runs each declared mutation exactly once, reports deterministically, preserves stop-signal semantics, terminates and awaits its child group, cleans only its own UUID namespace, and leaves concurrent invocations untouched; no test fabricates a final boolean, hand-authors observations, invents Q/Review bytes, or accepts a missing/reordered corpus case. |
| 3 | Document the application/binding/prerequisite/final-review protocol, strict-first and completion-stable rules, unchanged closed schema-1 surfaces, exact typed review eligibility, source-ready boundary, cross-tool ownership, and the evidence-complete execution ladder in source and shipped plan contracts. The ladder requires one writer per shared worktree, parallel independent read-only audits, syntax/direct acceptance before regression suites or broad CI, one full CI at the pre-commit boundary, and reuse only for still-matching hashed input/policy evidence; it never skips required review, acceptance inventory, or lifecycle identity commits. | `docs/plans/AGENTS.md:296-348`; `plugins/docks/skills/productivity/plan-init/SKILL.md:1-12`; `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md:257-309`; `plugins/docks/skills/productivity/plan-manager/SKILL.md:192-214`; `plugins/docks/skills/productivity/plan-review/SKILL.md:164-207` | 1-2 | done | Source and shipped template are semantically aligned; plan-manager owns E/R/B/Q/F writes, plan-review remains evidence-only, only findings-free `dual|single` authorizes compatibility, and narrow-to-broad checks preserve all required evidence without redundant broad runs. Acceptance inventories stay nonempty and task-specific. Omit a broad check only when the plan records the exact project CI command and retains a fast independent acceptance row proving that command's composition and containment; if the proof is absent or uncertain, retain the row. Newly authored inventories omit the project CI command itself because completion executes and records that exact command separately once after the ordered inventory. This containment proof belongs to plan-manager and plan-review evidence; existing schema-v1 validators remain unchanged. Completion-review repairs remain `in_review`, preserve the original `in_review_since`, reopen affected Step rows, and invalidate prior completion input without inventing an undocumented lifecycle transition. The full policy baseline asserts this wording across the source contract, shipped template, plan-manager, and plan-review surfaces. Existing schema-v1 receipts and validators remain unchanged. Compatibility eligibility remains Docks-only, and the later docks-kit stage owns consumer-global `AGENTS.md` propagation plus immutable release refresh. |
| 4 | Run focused and full validation, verify committed plus worktree scope, and hand the source-ready plan to completion review. | Read-only: `docs/plans/AGENTS.md`; `plugins/docks/skills/productivity/plan-init/SKILL.md`; `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md`; `plugins/docks/skills/productivity/plan-manager/SKILL.md`; `plugins/docks/skills/productivity/plan-review/SKILL.md`; `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs`; `scripts/ci.mjs`; `scripts/tests/fixtures/plan-review-policy/sample-plan.md`; `scripts/tests/plan-review-policy.mjs`; `scripts/tests/plan-review-policy-regressions.mjs` | 1-3 | done | A1–A5 plus the separately recorded project CI pass; `context-tree refresh docs/plans` re-derives the edited node as a no-drift/no-op result; all Steps are `done`, and the plan remains `in_review` without changing plugin versions or claiming downstream activation. |

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs compatibility-evidence . "$(git rev-parse HEAD)" docs/plans/active/relay-worker-lifecycle-primitives.md 12cf2ead208fe932084890b8e3fbd5c72591f3db de925e9bc046645a72f59bcd493da44d53adaf5a owner-2026-07-13-remodel-and-review-plan "$(printf '%s' 'authorized to remodel the plan and review it to do it and follow it properly. please use agents to review your plan' \| sha256sum \| cut -d' ' -f1)"` | Exit 0, zero stderr, one compact-JCS `ExecutionBaseCompatibilityApplicationV1`; its receipt names exactly `Threat model`, `Environment & how-to-run`, and `Open questions`, its Markdown contains the exact generated Git diff, it binds the verified commits above, and it does not write the plan. |
| A2 | `node --input-type=module -e 'import { validateExecutionRange } from "./plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs"; try { validateExecutionRange({repo:process.cwd(),planPath:"docs/plans/active/relay-worker-lifecycle-primitives.md",plannedAtCommit:"12cf2ead208fe932084890b8e3fbd5c72591f3db",executionBaseCommit:"de925e9bc046645a72f59bcd493da44d53adaf5a",reviewedHead:process.argv[1]}); process.exit(1) } catch (error) { if (error.message!=="execution compatibility evidence missing") throw error }' "$(git rev-parse HEAD)"` | Exit 0 before lifecycle application/review/binding; the exact historical commits satisfy every closed legacy-shape predicate row and are rejected specifically because compatibility evidence is missing. |
| A3 | `node scripts/tests/plan-review-policy.mjs --case strict-differential --baseline 06a898abacfd57aad9dab0d48db8ad3c8e622318` | Exit 0 and print exactly `execution compatibility: strict differential passed cases=23`; the ordered corpus and digest exact-match this plan and every case has byte-identical exit/stdout/stderr against the baseline helper blob. |
| A4 | `node scripts/tests/plan-review-policy.mjs --case surfaces` | Exit 0 independently of `scripts/ci.mjs`; the surface contract proves zero no-argument direct full-harness launches, exactly one focused `--case surfaces` guard, and exactly one regression-driver `--self-test` launch, nonempty task-specific acceptance guidance with recorded containment, and source/template/plan-manager/plan-review parity. |
| A5 | `BASE="$(node --input-type=module -e 'import fs from "node:fs"; import { parsePlan } from "./plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs"; const x=parsePlan(fs.readFileSync("docs/plans/active/legacy-start-transition-compatibility.md")).frontmatter.execution_base_commit; if(!/^[0-9a-f]{40}$/.test(x)) process.exit(1); process.stdout.write(x)')" && test -z "$(git status --porcelain)" && git diff --check "$BASE"..HEAD && node plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs execution-scope . "$BASE" "$(git rev-parse HEAD)" docs/plans/active/legacy-start-transition-compatibility.md 1afde4ed2a8e8f4601b97f07c3962fb14bde0e1f54b00bd3787d8b6c3e60afe3` | Exit 0 and emit one compact-JCS `ExecutionScopeValidationV1` whose `allowed_paths_sha256` exact-matches the independently sealed literal before ledger validation; the checkout is clean, every commit in the non-merge execution chain is inspected, and no transient or endpoint path falls outside the plan plus closed eleven-file manifest. |

## Out of scope / do-NOT-touch

- `plugins/session-relay/**` — the compatibility implementation is Docks plan policy; Session Relay consumes the released result later.
- `plugins/effect-kit/**` — no Effect Kit payload changes or release are required.
- `/home/vagrant/projects/public/**` and docks-kit — out of scope for this plan. The ordered fourth release stage owns docks-kit's consumer-global `AGENTS.md` optimization defaults and immutable plugin refresh; it must not duplicate compatibility eligibility logic.
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
- Opaque observation hashes prove integrity of bytes seen by the trusted constructor; without replay or an external signature they do not authenticate a sole writer acting outside the trusted-constructor assumption who recomputes Q and F, which is outside scope.
- Execution optimization may remove redundant work only: one writer owns shared edits, independent read-only checks may run in parallel, broader gates follow successful narrower gates, and bound evidence is reused only while every input/policy identity still matches.
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
Review-receipt: {"S":{"raw":{"attempts":[{"child_id":"compat_formal_ready2","denial_source":null,"effort":"xhigh","exit_code":0,"model":"gpt-5.6-sol","output_started":true,"reason":"completed","result":"passed","retry_cause":null,"schema":1,"signal":null,"started":true,"stderr_sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","stdout_sha256":"1dbede0a4d51e36e289335cb67f140bb61e1607caccdcc2e5a9f1262e0e8a416","timeout_mode":"orchestrator_tool","timeout_seconds":600,"transport":"in_session"}],"decision_evidence":null,"findings":[],"findings_sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","leg":"S","reason":null,"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"fa6c421b11935b0ad46e5b0482e29c385419aa330c7aa6630993aec7de2a5ec1","diff_sha256":null,"execution_base_commit":null,"input_sha256":"7a80492dbc5ca72aca4536a2f5f1673abbe212d879fc99242b18f95d0e52d87c","lifecycle_intent":"start","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"max","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"skill_default","cross_company_consent":"current_user","openai_tiers":"skill_default","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"3c95e5e16578dbf7b675ed6324de50e5cd749744239d2b2bea45603cf766bee1","request_id":"e5f45793-41a6-4da3-bafd-328a12025332","reviewed_commit_or_head":"beccf060a2ba3e3ace1bff12fc52c9867d14539e","schema":1},"result":"passed","reviewer_output":{"confirmations":["The sealed bundle revalidated against bundle_sha256 fa6c421b11935b0ad46e5b0482e29c385419aa330c7aa6630993aec7de2a5ec1, and plan.review.md matched input_sha256 7a80492dbc5ca72aca4536a2f5f1673abbe212d879fc99242b18f95d0e52d87c.","The draft preserves strict-first behavior for ordinary plans and limits legacy dispatch to the exact abbreviated historical shape, with a byte-for-byte 23-case baseline differential check.","The E/R/B/Q/F chain, findings-free dual-or-single gates, owner and release authorizations, exact delta renderers, and immutable completion reuse are closed and commit-bound.","The prerequisite producer has a closed input and dependency seam, fixed no-shell child observations, raw-output hashes, canonical cache/source checks, and explicit mutation coverage.","All fixed policy, authorization, pending-marker, Step-P row, and strict-corpus SHA-256 constants reproduced from the sealed plan.","The four-step file manifest, A1-A9 acceptance commands, serialized execution precondition, STOP conditions, and downstream release boundary are sufficient for a cold executor."],"score":99,"structured_output_sha256":"c898eaf818232ef4919d35ca25cc12a5fd3b9e835678051c796f2e3e4a037293","verdict":"ready"},"schema":1,"selected":{"effort":"xhigh","model":"gpt-5.6-sol","transport":"in_session"},"severity_totals":{"high":0,"low":0,"medium":0},"waiver":null,"waiver_sha256":null},"reconciliation":{"accepted":[],"rejected":[]},"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"fa6c421b11935b0ad46e5b0482e29c385419aa330c7aa6630993aec7de2a5ec1","diff_sha256":null,"execution_base_commit":null,"input_sha256":"7a80492dbc5ca72aca4536a2f5f1673abbe212d879fc99242b18f95d0e52d87c","lifecycle_intent":"start","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"max","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"skill_default","cross_company_consent":"current_user","openai_tiers":"skill_default","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"3c95e5e16578dbf7b675ed6324de50e5cd749744239d2b2bea45603cf766bee1","request_id":"e5f45793-41a6-4da3-bafd-328a12025332","reviewed_commit_or_head":"beccf060a2ba3e3ace1bff12fc52c9867d14539e","schema":1}},"X":{"raw":{"attempts":[{"child_id":null,"denial_source":"managed_policy","effort":"high","exit_code":null,"model":"fable","output_started":false,"reason":"host policy declined outbound repository-content transfer before launch","result":"platform_denied","retry_cause":null,"schema":1,"signal":null,"started":false,"stderr_sha256":null,"stdout_sha256":null,"timeout_mode":null,"timeout_seconds":600,"transport":"cli"}],"decision_evidence":null,"findings":[],"findings_sha256":null,"leg":"X","reason":"host policy declined outbound repository-content transfer before launch","request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"fa6c421b11935b0ad46e5b0482e29c385419aa330c7aa6630993aec7de2a5ec1","diff_sha256":null,"execution_base_commit":null,"input_sha256":"7a80492dbc5ca72aca4536a2f5f1673abbe212d879fc99242b18f95d0e52d87c","lifecycle_intent":"start","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"max","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"skill_default","cross_company_consent":"current_user","openai_tiers":"skill_default","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"3c95e5e16578dbf7b675ed6324de50e5cd749744239d2b2bea45603cf766bee1","request_id":"e5f45793-41a6-4da3-bafd-328a12025332","reviewed_commit_or_head":"beccf060a2ba3e3ace1bff12fc52c9867d14539e","schema":1},"result":"platform_denied","reviewer_output":null,"schema":1,"selected":null,"severity_totals":{"high":0,"low":0,"medium":0},"waiver":null,"waiver_sha256":null},"reconciliation":{"accepted":[],"rejected":[]},"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"fa6c421b11935b0ad46e5b0482e29c385419aa330c7aa6630993aec7de2a5ec1","diff_sha256":null,"execution_base_commit":null,"input_sha256":"7a80492dbc5ca72aca4536a2f5f1673abbe212d879fc99242b18f95d0e52d87c","lifecycle_intent":"start","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"max","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"skill_default","cross_company_consent":"current_user","openai_tiers":"skill_default","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"3c95e5e16578dbf7b675ed6324de50e5cd749744239d2b2bea45603cf766bee1","request_id":"e5f45793-41a6-4da3-bafd-328a12025332","reviewed_commit_or_head":"beccf060a2ba3e3ace1bff12fc52c9867d14539e","schema":1}},"author":{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"},"decision_evidence":null,"input_sha256":"7a80492dbc5ca72aca4536a2f5f1673abbe212d879fc99242b18f95d0e52d87c","outcome":"single","phase":"draft","policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"max","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"skill_default","cross_company_consent":"current_user","openai_tiers":"skill_default","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"3c95e5e16578dbf7b675ed6324de50e5cd749744239d2b2bea45603cf766bee1","pre_execution_eligible":true,"reproduced":[],"request":{"acceptance_inventory_sha256":null,"author":{"company":"openai","effort":"xhigh","model":"gpt-5.6-sol","tool":"codex"},"bundle_sha256":"fa6c421b11935b0ad46e5b0482e29c385419aa330c7aa6630993aec7de2a5ec1","diff_sha256":null,"execution_base_commit":null,"input_sha256":"7a80492dbc5ca72aca4536a2f5f1673abbe212d879fc99242b18f95d0e52d87c","lifecycle_intent":"start","phase":"draft","planned_at_commit":null,"policy":{"anthropic_tiers":[{"effort":"high","model":"fable","transports":["in_session","cli"]},{"effort":"max","model":"opus","transports":["in_session","cli"]}],"cross_company_consent":"always","openai_tiers":[{"effort":"xhigh","model":"gpt-5.6-sol","transports":["in_session","cli"]}],"orchestrator_preference":"auto","provenance":{"anthropic_tiers":"skill_default","cross_company_consent":"current_user","openai_tiers":"skill_default","orchestrator_preference":"skill_default","zero_reviewer_policy":"skill_default"},"schema":1,"zero_reviewer_policy":"ask"},"policy_sha256":"3c95e5e16578dbf7b675ed6324de50e5cd749744239d2b2bea45603cf766bee1","request_id":"e5f45793-41a6-4da3-bafd-328a12025332","reviewed_commit_or_head":"beccf060a2ba3e3ace1bff12fc52c9867d14539e","schema":1},"reviewed_at":"2026-07-13T13:04:28.000Z","reviewed_commit":"beccf060a2ba3e3ace1bff12fc52c9867d14539e","schema":1}

The fresh pre-commit diff review found two medium defects, both independently reproduced. SIGINT terminated the mutation driver before JavaScript `finally` cleanup and left two owned roots, so the driver now tracks every child/root, stops admission on the first SIGINT/SIGTERM, terminates the detached child group with bounded TERM-to-KILL escalation, awaits closure, cleans its namespace, and re-raises the original signal; a nested child that deliberately ignores TERM proves that path. The authorization negatives also covered only a wrong id and alternate plan path, so source id, plan path, planned commit, execution-base commit, and stored scope digest now have independent production checks, direct negatives, and mutation cases. The production scope digest is a literal rather than a value derived from the object it is meant to check.

A parallel scheduler probe then found cross-invocation interference: two otherwise independent driver processes shared a broad temporary-root prefix, so one stop-check could observe or remove the other's fixtures. Each invocation now owns a validated random-UUID namespace, the nested interruption fixture receives an explicit separate namespace through a closed environment value, and all enumeration/removal is exact to one namespace. Concurrent jobs-1 and jobs-4 scheduler processes both pass and leave zero broad residue. This is test-harness isolation only; it changes no compatibility eligibility or product runtime behavior.

The third completion S leg returned 58/100 NOT READY with two high findings and one medium finding, and all three reproduced independently. The execution-scope allowlist was derived only from the mutable head plan, so a plan-only commit could authorize its own broadened path before a later commit changed that path; `execution-scope` now requires the independently sealed allowed-manifest digest `1afde4ed2a8e8f4601b97f07c3962fb14bde0e1f54b00bd3787d8b6c3e60afe3`. The owner message digest was reusable against another exact-shape plan, so the authorization record now binds the exact target path, planned commit, execution base, and scope digest at construction plus every validation boundary. Finally, the source had overstated a real system-attribute fixture; this revision claims and behaviorally enforces only the `GIT_ATTR_NOSYSTEM=1` child invariant while retaining real repository-local, committed, and global named-driver fixtures. The failed request and sealed bundle are stale and cannot authorize completion.

The regression-driver performance audit also found that interrupted mutation runs leaked private fixtures and serialized fifty independent child processes on one CPU. The first repair gave each run one immutable source snapshot and per-invocation UUID-namespaced owned roots, routed every child fixture through a private temp directory, added a bounded asynchronous pool capped at four, retargeted broad mutations to exact existing selectors, performed the full baseline only once per driver invocation, and buffered all outcomes for declaration-order reconciliation. A pre-follow-up default four-job run detected the then-50 mutations, printed the exact final record, left zero owned roots, and completed in 214.23 seconds; the inventory later reached 54 after independent owner-field mutations. A fresh stop-path review then reproduced two roots left by SIGINT, and a parallel jobs-1/jobs-4 probe exposed broad-prefix cross-invocation cleanup. The repaired driver tracks children and roots, preserves SIGINT/SIGTERM after bounded group shutdown, and restricts enumeration/removal to one validated random namespace; two concurrent scheduler self-tests pass with zero shared residue. On the current six-core VM, exact full 54-case measurements were 3m10.188s at six jobs and 3m47.725s at four, so this amendment raises only the default cap to six while retaining the explicit machine bound and deterministic semantics. The first CI-orchestrator repair added two fast mutations and an independent 56-case run completed in 197.44 seconds; fresh review then required a reciprocal focused guard plus a third mutation, and the final 57-case run detected all mutations in 196.75 seconds. Coverage, output order, namespace isolation, and one broad pre-commit CI gate remain mandatory.

The Step-1 fresh code review found three defects, and all three reproduced independently. The exact one-pattern tag query returned only the annotated tag object for `docks--v0.12.4`, so this revision passes both the tag and peel patterns. Repository-local and command-scope `url.*.insteadOf` configuration redirected the literal canonical URL to the current checkout, so the two remote authority children now use a closed Git-configuration-neutral environment grounded in `os.devNull` while keeping `PATH`, proxy, and TLS/CA environment. The prerequisite validator also accepted internally self-consistent E material without rederiving its historical application from repository bytes; Step 1 now requires full reconstruction under the injected raw-child seam and exact `receipt.plan_path===input.planPath`. No Goal or deliverable changed.

The second completion S leg returned 86/100 NOT READY with one medium finding: `--text` prevented binary output but did not neutralize a named diff driver's configured `xfuncname`, so identical historical blobs produced different reviewer-visible hunk headers. Direct reproduction confirmed the byte and digest change. This revision replaces the direct repository diff with a private copied-artifact `--no-index` boundary, private highest-precedence `!diff` attributes, a configuration- and system-attribute-neutral environment, exact exit/status/stderr rules, and unconditional cleanup; positive tests prove the old producer changes under each named-driver source while generation and reconstruction stay byte-identical, and regressions remove copied-artifact or system-attribute isolation. The failed request and bundle are stale and cannot authorize completion.

The next seam follow-up accepted the per-class stderr design but found its acceptance text inconsistent: A2 still named raw main/tag stderr changes as failures, and A5 exercised only Codex although five observation rows allow bound stderr. This revision removes the obsolete raw-stderr negative, keeps explicit stored-hash substitution, and makes A5 a five-run matrix with one nonempty recorded stderr row per run. The prior advisory hash is stale and cannot authorize start.

The Step-2 pre-implementation coverage audit found that A2 incorrectly treated JavaScript object insertion order as a closed-schema invariant. The production `assertClosed` contract validates exact key membership without ordering, and JCS intentionally canonicalizes object keys. A2 now requires reordered closed input/dependency/observation keys to produce canonical-identical success, while missing/extra keys, swapped values, operational call/argv order, and remote-output row order remain strict. No Goal or deliverable changed.

The Step-2 executable probe then showed that a fully recomputed opaque `stderr_sha256` plus every enclosing self-hash forms a different but internally valid Q; F necessarily binds whichever Q it reviews. Both the orchestrator and a fresh read-only reviewer reproduced that no E/R/B or later immutable check contains the raw bytes or an external authenticator. The contract now distinguishes stale/partial corruption, which self-hashes reject, from recomputation outside the trusted-constructor assumption, which would require replay or signatures and is outside the existing deliverable. The constructor, plan-manager-only Q write, Git commit identity, and fresh F remain the provenance boundary. No Goal or deliverable changed.

The owner asked that the execution optimizations used in this run become defaults without reducing review or code quality. Step 3 now carries only the plan-specific ladder into the source contract, shipped plan-manager behavior, and plan-init template: one writer, parallel read-only checks, narrow-to-broad gates, one required broad pre-commit run, and exact evidence reuse. Consumer-global `AGENTS.md` generation belongs to docks-kit in `/home/vagrant/projects/public` and is deferred to the ordered fourth release stage; this repository's root `AGENTS.md` remains outside the closed eleven-path scope.

The cross-plan follow-up found the universal empty-stderr rule was not buildable in the current runtime. Independent execution of the exact planned `codex plugin list --marketplace docks --json` child on Codex 0.144.1 returned status 0, valid JSON, and a 103-byte read-only-filesystem PATH-alias warning on stderr. This revision accepts and hashes arbitrary stderr only for the five observation rows that already carry `stderr_sha256`; unrecorded repository/source children still require empty stderr. A5 includes deterministic nonempty recorded stderr, while A2 rejects its stored-hash mutation and any unrecorded stderr. The prior advisory hash is stale and cannot authorize start.

The exact-seam advisory accepted the constructor/dependency repair but reproduced two remaining ambiguities: `runChild` carried a `cwd` without a rule, and stderr mutations were required to fail while no command was assigned a zero-stderr policy. This revision canonicalizes `repoRoot`, requires every constructor child to use exactly `{cwd:repoRoot}`, requires empty Buffer stderr for every child, and adds wrong-cwd/nonempty-stderr mutations. The prior advisory hash is stale and cannot authorize start.

The fresh formal sealed S leg returned 91/100 NOT READY with S1–S2, and both reproduced against the source and the plan convention. The plan required a real prerequisite constructor under deterministic child suppliers without naming the exported function or its raw child/time/home/filesystem seam, and the Steps claimed an exact file manifest while supplying only bare paths plus an indirect Step-4 reference. This revision defines the closed ten-field constructor input, six-function production/fake dependency boundary, direct no-shell Buffer process semantics, canonical file adapters, CLI non-injectability, and corresponding mutations. It also gives every edited file current line-range locators and enumerates all ten read-only Step-4 inputs. The failed request is stale and cannot authorize start.

The focused closure recheck accepted the rejected-row fix but found that remote main plus a local tag peel did not bind the published tag target. Direct reproduction confirmed ambient `origin` and local refs are not remote tag authority. This revision uses the canonical repository URL for both observations, adds exact lightweight/annotated remote-tag stdout grammars with peeled `release_commit`, hashes the child output, and requires mutation coverage for origin substitution and every missing/wrong/extra/unpeeled tag row.

The next fresh sealed S leg returned 84/100 NOT READY with S1–S2, and both reproduced. The Q receipt named release/cache outcomes without binding the external observations or a producer; the renderer sorted rejected objects without naming a key. This revision adds the fifth read-only `compatibility-prerequisite` constructor, fixed direct argv, closed parsed projections, stdout/stderr hashes, canonical cache paths, observation time/self-hash, exact application output, and caller-input prohibitions. It also defines accepted/rejected/reproduced filter-map-sort expressions explicitly by finding id and requires a golden whose receipt, reason/JCS, and id orders differ. The failed request is stale and cannot authorize start.

The fresh formal sealed S leg returned 72/100 NOT READY with S1–S2, and direct sealed/source reads reproduced both. The mandatory Q receipt delegated its fields and bytes to an unsealed related plan, while completion reuse demanded an exact Review block without a renderer. This revision inlines the recursively closed prerequisite schema, authorization/archive/release/cache/commit/hash proofs, exact marker/fence/Step-P row bytes and hashes, and mutation surface. It also defines `CompletionReviewBlockV1` as a whole-partition pure receipt projection with scalar escaping, exact line grammar, deterministic Cross-check inclusion, EOF/next-section splicing, idempotence, and hostile-string coverage without adding a receipt field. The failed request is stale and cannot authorize start.

The fresh exact-pair advisory reproduced one post-formal repair defect: the pre-E predicate required owner authorization even though `validateExecutionRange` receives no authorization input and the authorization record first exists inside E. This revision limits pre-evidence dispatch to structural policy rows and moves owner-confirmation validation to the present-application branch, making A4 reachable without weakening authorization once evidence exists. The stale zero-review request is superseded and cannot be applied.

The first formal sealed cross-company start leg returned 82/100 NOT READY with X1–X4. Direct source reproduction accepted all four: the strict fallback predicate contradicted A4/A6, exact transition bytes still honored ambient Git diff settings, the all-commit A9 proof lacked its necessary serialization precondition, and the machine-record sentence named only one of three existing records. This revision closes the 7–39-hex historical predicate and pins four near-miss fixtures, neutralizes every identified diff producer setting with literal argv, reserves the bounded execution range, and preserves the full existing machine-record set. The stale bundle/receipt cannot authorize start.

The exact-byte compatibility recheck accepted the historical facts, policy/authorization digests, and 23-case corpus but reproduced two construction gaps: the generic attributed-ingest prose left zero-finding/unavailable-leg rendering free-form, and the scope result hashes did not define a per-commit preimage. This revision adds a token-closed receipt-only renderer with exact date, leg result, empty ID/reason, orchestrator, insertion, and LF rules; it also binds a sorted allowed-path manifest plus an oldest-first commit/parent/path ledger and hashes the closed result without itself.

The first cold read rejected three weaker approaches: changing `execution_base_commit`, relaxing canonical equality globally, and treating later backfill commits as the historical start. Each either rewrote identity or broadened normal completion. This draft instead keeps strict-first validation and makes compatibility an explicit, canonical, reviewer-visible application with an immutable E/R/B chain, plan-only prerequisite closure Q, and fresh F review of the binding-bearing complete plan.

The review boundary is deliberately split: compatibility reviewers attest the historical exception, exact diff, and receipt at E; later completion reviewers still examine the current plan and full execution diff. This plan ships the closed prerequisite constructor and validator at source readiness, but the separately authorized release, refresh, observation, and Q application occur only in the related lifecycle plan's Step P.

Cold-handoff audit found no undefined write owner: the helper emits evidence, binding, and prerequisite application bytes; plan-manager commits E, applies R with exact attribution, commits B, applies the prerequisite constructor's exact Markdown as Q after release/refresh, then applies F with exact attribution. Later completion revalidates immutable R plus retained application/binding/prerequisite bytes through a Review-partition-aware stable view. No existing closed schema-1 surface gains a key. docks-kit owns only downstream refresh.

Score: **99/100** · trajectory **84→93→98→99→exact-byte NOT READY→99→formal X 82 NOT READY→99→formal S 72 NOT READY→99→formal S 84 NOT READY→99→formal S 91 NOT READY→99→completion S 82 NOT READY→99→completion S 86 NOT READY→99→completion S 58 NOT READY→99** · stopped: **repair pending fresh completion review**. The first passes exposed opaque historical evidence, ambiguous preimages, incomplete partitioning, and a non-adjacent chain. Fresh reviewers then caught attribution deltas, Review replacement, missing binding, typed-outcome ambiguity, underclosed strict/scope behavior, unreviewed binding bytes, free-form preimages, ambient diff configuration and attributes, undeclared serialization, stale machine-record wording, an unsealed Q receipt, renderer-free exact bytes, unbound external observations, object-sort ambiguity, an undefined prerequisite dependency seam, imprecise Step locators, the remaining named-driver hunk-header influence after `--text`, scope self-broadening, reusable owner authorization, an overstated system-fixture claim, partial authorization mutations, stop-signal leakage, and cross-invocation temporary-root interference. This draft closes E/R/B/Q/F, production evidence/binding/prerequisite constructors, exact Review rendering/reuse, the legacy predicate and differential corpus, deterministic Git/observation bytes through private copied-artifact isolation, receipt-only attribution, sealed per-commit scope, target-bound authorization, and deterministic resource-aware namespace-isolated regression execution; one point remains for inherent legacy-history complexity.

## Cold-handoff checklist

1. **File manifest:** present — edited files carry current line-range locators and Step 4 enumerates the exact ten read-only verification inputs.
2. **Environment & commands:** present — Node 24, non-overlapping focused probes, one full CI gate, historical probe, exact diff argv, and source-scope verification are literal.
3. **Interface & data contracts:** present — policy JCS/hash, identity domains, application/material/receipt/binding/prerequisite-observation records, the exact exported constructor plus raw dependency seam, E/R/B/Q/F protocol, exact attribution/reuse preimages, unchanged strict schema, and five CLI arities are closed.
4. **Executable acceptance:** present — A1–A5 are ordered, non-overlapping commands with expected outputs, an independent CI-composition contract, strict differential behavior, committed scope, and pre/post eligibility behavior; completion records the separately required project CI once after them.
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
- **2026-07-13T17:02:51-03:00**: Renaming the regression driver also changed `scripts/ci.mjs`, but the scope manifest omitted that path → A9 failed on the exact missing path; add it to affected paths, Step 2, and Step 4 before retrying the clean history proof.
- **2026-07-13T17:45:13-03:00**: Pinning diff algorithms and disabling text conversion did not override Git attributes, so an ambient binary rule replaced reviewer-visible hunks with a binary patch → require `--text` after strict UTF-8 blob validation and cover repository-local plus global attribute sources before resealing completion input.
- **2026-07-13T19:30:02-03:00**: `--text` still allowed an ambient named diff driver's `xfuncname` to change reviewer-visible hunk headings → compare copied blobs through a private no-index repository with exact `!diff` attributes, canonical config/attribute environment, and cleanup; prove real repository-local, committed, and global sources plus the system-file isolation invariant cannot alter the bytes.
- **2026-07-13T20:38:10-03:00**: Deriving the execution allowlist solely from the mutable head plan let a plan edit authorize a later path change → require the independently sealed `allowed_paths_sha256` before traversing the commit ledger.
- **2026-07-13T20:38:10-03:00**: Binding owner consent only to an id and message digest allowed replay against another exact-shape plan → bind and rederive the exact target path, planned commit, execution base, and authorization-scope digest.
- **2026-07-13T20:38:10-03:00**: Claiming a real system Git-attribute fixture exceeded what the runtime test could safely construct → enforce the child `GIT_ATTR_NOSYSTEM=1` invariant behaviorally and reserve real named-driver fixtures for repository-local, committed, and global sources.
- **2026-07-13T20:38:10-03:00**: Serial mutation children and success-only cleanup turned intentional failures into a long, disk-leaking gate → seal one source snapshot, use an owned-temp bounded process pool, reconcile deterministically, and clean in `finally` without reducing the mutation inventory.
- **2026-07-13T21:22:04-03:00**: `finally` cleanup does not run when the driver receives SIGINT/SIGTERM, and a direct reproduction left two roots → track children/roots, stop admission, terminate and await the child group, clean, then re-raise the original signal.
- **2026-07-13T21:22:04-03:00**: A shared root prefix let concurrent scheduler processes observe and clean one another's fixtures → assign each invocation and nested stop-check a separate validated random-UUID namespace and forbid broad-prefix enumeration/removal.

## Sources

- `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs:1-160` — current parser, excluded lifecycle frontmatter, machine-record stripping, and canonical JCS behavior.
- `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs:612-622` — current strict execution-range validation and exact rejection boundary.
- `plugins/docks/skills/productivity/plan-review/scripts/review-policy.mjs:681-710` — sealed canonical plan and completion bundle construction.
- `plugins/docks/skills/productivity/plan-manager/SKILL.md:155-220` — plan-manager owns review apply, start identity, completion execution, receipt, and reuse.
- `plugins/docks/skills/productivity/plan-review/SKILL.md:155-205` — plan-review remains read-only evidence-only and completion validates exact execution range.
- `scripts/tests/plan-review-policy.mjs:380-425` — current strict start fixture, bundle, disposable checkout, and cleanup tests.
- `docs/plans/AGENTS.md:45-105` — plan frontmatter and planned/start identity contract.
- `codex plugin list --help` and `claude plugin list --help` (verified 2026-07-13) — both expose structured `--json`; Codex also exposes `--marketplace`.
- `gh release view --help` (verified 2026-07-13) — `--json` supports `isDraft,isPrerelease,tagName,url`.
- [Node.js v24 `spawnSync`](https://nodejs.org/docs/latest-v24.x/api/child_process.html#child_processspawnsynccommand-args-options) — direct argv defaults to no shell; Buffer encoding and closed status/signal/error/output fields support the production adapter.
- [Node.js v24 synchronous filesystem APIs](https://nodejs.org/docs/latest-v24.x/api/fs.html#synchronous-api) — `lstatSync`, `realpathSync`, and Buffer-returning `readFileSync` support canonical non-symlink cache reads.
- [Node.js `os.devNull`](https://nodejs.org/download/release/latest-v24.x/docs/api/os.html#osdevnull) — stable platform-specific null-device path used to detach canonical remote observations from repository-local Git configuration.
- [Node.js v24 `os.availableParallelism`](https://nodejs.org/download/release/latest-v24.x/docs/api/os.html#osavailableparallelism) — machine-aware positive estimate used for the bounded mutation-child default and override ceiling.
- [Node.js v24 asynchronous child processes](https://nodejs.org/download/release/latest-v24.x/docs/api/child_process.html#asynchronous-process-creation) — `spawn` permits the outer pool to make progress without blocking the driver event loop; each child remains a direct no-shell process.
- [Node.js v24 `crypto.randomUUID`](https://nodejs.org/download/release/latest-v24.x/docs/api/crypto.html#cryptorandomuuidoptions) — generates the per-invocation UUID namespace that prevents concurrent driver roots from colliding.
- [Git command environment documentation](https://git-scm.com/docs/git#Documentation/git.txt-codeGITCONFIGGLOBALcodecodeGITCONFIGSYSTEMcode) — `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`, and `GIT_CONFIG_NOSYSTEM` support predictable configuration sources.
- [Git config environment documentation](https://git-scm.com/docs/git-config#Documentation/git-config.txt-codeGITCONFIGCOUNTcodecodeGITCONFIGKEYltngtcodecodeGITCONFIGVALUEltngtcode) — command-scope `GIT_CONFIG_COUNT`/key/value pairs override file configuration and therefore must be neutralized for canonical remote authority.
- [Git ls-remote documentation](https://git-scm.com/docs/git-ls-remote) — `--branches`, `--exit-code`, and exact `<oid> TAB <ref> LF` output contract.
- [Git diff documentation](https://git-scm.com/docs/git-diff) — explicit algorithm, context, inter-hunk, indent, and no-rename flags override configurable patch production.
- [Git diff configuration](https://git-scm.com/docs/diff-config) — ambient context, inter-hunk, algorithm, rename, and blank-empty settings that the literal producer neutralizes.
