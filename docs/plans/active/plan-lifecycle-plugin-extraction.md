---
title: Extract the plan lifecycle into its own cross-tool plugin
goal: Move the three lifecycle skills and reviewer into a registered plan-lifecycle plugin while preserving routing safety, history, and full-gate coverage.
status: drafting
created: "2026-08-01T21:18:16-03:00"
updated: "2026-08-03T14:59:26.338+00:00"
started_at: null
finished_at: null
assignee: null
tags: [plans, plugins, architecture, registered-idea]
affected_paths:
  - .agents/plugins/marketplace.json
  - .claude-plugin/marketplace.json
  - .codex/agents/plan-reviewer.toml
  - AGENTS.md
  - README.md
  - docs/plans/AGENTS.md
  - package.json
  - plugins/docks/.claude-plugin/plugin.json
  - plugins/docks/.codex-plugin/plugin.json
  - plugins/docks/README.md
  - plugins/docks/agents/plan-reviewer.md
  - plugins/docks/skills/AGENTS.md
  - plugins/docks/skills/engineering/refactor/SKILL.md
  - plugins/docks/skills/engineering/security/SKILL.md
  - plugins/docks/skills/productivity/context-tree/SKILL.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-manager/references/github-issue-publication.md
  - plugins/docks/skills/productivity/plan-manager/references/plan-self-check-protocol.md
  - plugins/docks/skills/productivity/plan-manager/references/planrunv1-schema.md
  - plugins/docks/skills/productivity/plan-manager/references/reviewer-dispatch-methods.md
  - plugins/docks/skills/productivity/plan-manager/scripts/legacy-review-records.mjs
  - plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs
  - plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-measurements.mjs
  - plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-properties.json
  - plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs
  - plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/sample-review.mjs
  - plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs
  - plugins/docks/skills/productivity/plan-reviewer/SKILL.md
  - plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs
  - plugins/docks/skills/productivity/plan-workspace/SKILL.md
  - plugins/docks/skills/productivity/plan-workspace/references/codex-agent-templates.md
  - plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md
  - plugins/docks/skills/productivity/scaffold/SKILL.md
  - plugins/docks/skills/productivity/scaffold/references/spec-schema.md
  - plugins/docks/skills/productivity/skill-agent-pipeline/SKILL.md
  - plugins/effect-kit/.claude-plugin/plugin.json
  - plugins/effect-kit/.codex-plugin/plugin.json
  - plugins/effect-kit/skills/engineering/effect-ts-port/SKILL.md
  - plugins/effect-kit/skills/engineering/effect-ts-setup/SKILL.md
  - plugins/plan-lifecycle/.claude-plugin/plugin.json
  - plugins/plan-lifecycle/.codex-plugin/plugin.json
  - plugins/plan-lifecycle/agents/plan-reviewer.md
  - plugins/plan-lifecycle/compatibility.json
  - plugins/plan-lifecycle/skills/AGENTS.md
  - plugins/plan-lifecycle/skills/CLAUDE.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/references/github-issue-publication.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-self-check-protocol.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/references/planrunv1-schema.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/references/reviewer-dispatch-methods.md
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/legacy-review-records.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-measurements.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-properties.json
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/sample-review.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md
  - plugins/plan-lifecycle/skills/productivity/plan-reviewer/scripts/review-policy.mjs
  - plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md
  - plugins/plan-lifecycle/skills/productivity/plan-workspace/references/codex-agent-templates.md
  - plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md
  - plugins/plan-lifecycle/test/selftest.mjs
  - plugins/session-relay/test/release-evidence-contract.mjs
  - plugins/session-relay/test/release-promotion-contract.mjs
  - plugins/session-relay/test/remediation-contract.mjs
  - scripts/ci.mjs
  - scripts/lib/plugins.mjs
  - scripts/lib/session-relay-release-preparation.mjs
  - scripts/lib/session-relay-release-promotion.mjs
  - scripts/skills/transform-guard.mjs
  - scripts/tests/ci-plugin-targeting.mjs
  - scripts/tests/fixtures/structural-plan.md
  - scripts/tests/plan-dispatch-probes.mjs
  - scripts/tests/plan-evidence-probes.mjs
  - scripts/tests/plan-orchestration.mjs
  - scripts/tests/plan-orchestration/fixtures/historical-inventory.json
  - scripts/tests/plan-orchestration/historical-characterization.mjs
  - scripts/tests/plan-orchestration/legacy-quarantine.mjs
  - scripts/tests/plan-skill-phases.mjs
related_plans: []
---

# Extract the plan lifecycle into its own cross-tool plugin

## Goal

Move `plan-manager`, `plan-workspace`, `plan-reviewer`, their shipped machinery,
and the Claude reviewer wrapper from `docks` into a self-versioned
`plan-lifecycle` plugin. Preserve history, keep every current route fail-loud when
the new plugin is absent, and keep the repository-wide gate authoritative.

## Context & rationale

The lifecycle is already a cohesive subsystem: three skills share the PlanRunV1
contract, transaction and lock machinery, reviewer policy, workspace template,
and the repository's only plugin-shipped agent. The split lets `docks` remain a
generic engineering kit while the lifecycle versions independently.

The current coupling is concrete:

- `scripts/lib/plugins.mjs:1-3` identifies the registry as the single source of
  truth and says adding a plugin requires a descriptor there, not an edit to
  `scripts/ci.mjs`; `scripts/ci.mjs:3-6` confirms that its gate is registry-driven.
- `.codex/agents/plan-reviewer.toml:8-9` hardcodes the current reviewer skill path.
- `plugins/docks/README.md:69-74` and
  `plugins/docks/skills/AGENTS.md:73-92` advertise the three lifecycle skills as
  part of `docks`.
- The five full lifecycle routes are at
  `plugins/docks/skills/engineering/refactor/SKILL.md:68`,
  `plugins/docks/skills/engineering/security/SKILL.md:63`,
  `plugins/docks/skills/productivity/skill-agent-pipeline/SKILL.md:63`,
  `plugins/docks/skills/productivity/context-tree/SKILL.md:42`, and
  `plugins/effect-kit/skills/engineering/effect-ts-port/SKILL.md:58`.
  `plugins/effect-kit/skills/engineering/effect-ts-setup/SKILL.md:134` is a sixth
  route because it sends large implementations to `plan-manager`.
- `plugins/effect-kit/.claude-plugin/plugin.json:12-16` declares a dependency on
  `docks`, while `plugins/effect-kit/.codex-plugin/plugin.json:1-15` has no
  dependency declaration. The manifests currently report effect-kit `0.4.0`
  and docks `0.15.0`, so their versions already move independently.

A Codex install therefore cannot rely on dependency installation to make a named
lifecycle skill available. The move is safe only after all six routes carry one
identical prerequisite paragraph and a validator asserts that exact text. Claude
manifests should still declare supported dependencies, but that does not replace
the cross-tool guard.

The implementation stays in Node. It is file transactions, canonical JSON,
digests, and locks rather than a long-lived cross-process service; adding a
compiled binary would add unrelated build and release machinery without helping
the extraction.

### Extraction invariants {mechanism}

The route validator makes absence fail-loud before relocation; the plugin self-test
binds registry, catalog, manifest, and compatibility declarations; `git mv` plus
`git log --follow` proves continuity; focused tests prove live consumers resolve
the new paths; and the full gate plus the owned archive transaction closes the
change without relying on publication or ambient working-tree state.

## Environment & how-to-run

Run commands from the repository root with Node 24 and the lockfile-backed pnpm
installation:

```bash
corepack enable
pnpm install --frozen-lockfile
node scripts/ci.mjs
```

This change spans the registry and multiple plugins, so the final gate is the
full `node scripts/ci.mjs`, not a selected-plugin gate.

## Steps

> **Successor note - why the implementation rows read `done` on a run that has not started.**
> This run replaces terminal predecessor blocked `verification_failed`. Its implementation is
> complete and committed at `8416733`; every gate is green except two, and both fail for the same
> reason: the predecessor's `affected_paths` did not declare the file that had to change.
>
> `scripts/skills/transform-guard.mjs` holds a curated repo-wide list of six transforming-skill
> NAMES and hard-fails when one is absent under the scanned root. `scripts/ci.mjs` invokes it once
> per plugin over that plugin's own `skills` root, so after the move `plan-workspace` cannot resolve
> under `plugins/docks/skills`. `findSkillByName` recurses, so one repo-wide invocation resolves all
> six with the curated list untouched - but that needs `scripts/ci.mjs`, which was undeclared.
> Repointing the docks descriptor's `skills` field was rejected: that field also feeds content-hash,
> scoring, skill-guard and no-author-scripts, so widening it would make the docks gate validate
> plan-lifecycle's skills and break per-plugin targeting. `transformGuard:false` is validator
> weakening and a STOP condition.
>
> `plugins/session-relay/test/release-promotion-contract.mjs` imports the moved module by the
> relative spelling `../../docks/...`, which is why every `plugins/docks/...` sweep missed it while
> its two sibling contracts were correctly declared and repointed.
>
> Both paths plus `scripts/ci.mjs` are declared here and closed by the final Steps row. Two
> historical citations that the move wrongly repointed were already restored in `8416733`: a
> committed measurement producer and the structural fixture's producer block are both read at a
> commit predating the extraction, so their paths must name the tree as it was then.

| # | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|
| 1 | Add one byte-identical absent-lifecycle prerequisite paragraph to every route and assert it as text in the existing lifecycle validator. | `plugins/docks/skills/engineering/refactor/SKILL.md`; `plugins/docks/skills/engineering/security/SKILL.md`; `plugins/docks/skills/productivity/context-tree/SKILL.md`; `plugins/docks/skills/productivity/skill-agent-pipeline/SKILL.md`; `plugins/effect-kit/skills/engineering/effect-ts-port/SKILL.md`; `plugins/effect-kit/skills/engineering/effect-ts-setup/SKILL.md`; `scripts/tests/plan-skill-phases.mjs` | — | `local` | `planned` | The validator finds the exact paragraph in all six files and fails when it is removed or changed in any one file. Failure: STOP; do not move a lifecycle skill while a route can proceed silently without it. |
| 2 | Register `plan-lifecycle` and create its cross-tool skeleton. Start it at `0.1.0`, add both marketplace entries, declare `minimum_docks_major: 0` in a closed compatibility file, and make the plugin self-test validate that declaration plus both manifests. Add `plan-lifecycle` to effect-kit's Claude dependencies and bump effect-kit manifests/catalog to `0.5.0`. | `.agents/plugins/marketplace.json`; `.claude-plugin/marketplace.json`; `plugins/effect-kit/.claude-plugin/plugin.json`; `plugins/effect-kit/.codex-plugin/plugin.json`; `plugins/plan-lifecycle/.claude-plugin/plugin.json`; `plugins/plan-lifecycle/.codex-plugin/plugin.json`; `plugins/plan-lifecycle/compatibility.json`; `plugins/plan-lifecycle/skills/AGENTS.md`; `plugins/plan-lifecycle/skills/CLAUDE.md`; `plugins/plan-lifecycle/test/selftest.mjs`; `scripts/lib/plugins.mjs` | 1 | `local` | `planned` | `node plugins/plan-lifecycle/test/selftest.mjs` exits 0 after proving the compatibility object is closed, its minimum major is an integer met by docks, both new manifests agree at `0.1.0`, effect-kit manifests/catalog agree at `0.5.0`, and both catalogs and the registry contain exactly one `plan-lifecycle` entry. Failure: STOP; never replace an explicit compatibility declaration with an untestable same-major convention. |
| 3 | Move the complete `plan-manager` tree with `git mv` and update its internal repository path literals. | `plugins/docks/skills/productivity/plan-manager/SKILL.md`; `plugins/docks/skills/productivity/plan-manager/references/github-issue-publication.md`; `plugins/docks/skills/productivity/plan-manager/references/plan-self-check-protocol.md`; `plugins/docks/skills/productivity/plan-manager/references/planrunv1-schema.md`; `plugins/docks/skills/productivity/plan-manager/references/reviewer-dispatch-methods.md`; `plugins/docks/skills/productivity/plan-manager/scripts/legacy-review-records.mjs`; `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs`; `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-measurements.mjs`; `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-properties.json`; `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs`; `plugins/docks/skills/productivity/plan-manager/scripts/lifecycle/sample-review.mjs`; `plugins/docks/skills/productivity/plan-manager/scripts/plan-run.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/references/github-issue-publication.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-self-check-protocol.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/references/planrunv1-schema.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/references/reviewer-dispatch-methods.md`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/legacy-review-records.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/dispatch-review.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-measurements.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-properties.json`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/plan-self-check.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/lifecycle/sample-review.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan-run.mjs` | 2 | `local` | `planned` | `git log --follow` from the new `SKILL.md` contains the old path's last pre-move commit, the old tree is absent, and every internal current-path assertion names `plugins/plan-lifecycle`. Failure: STOP; do not use copy-then-delete or leave duplicate owners. |
| 4 | Move the complete `plan-reviewer` tree with `git mv`. | `plugins/docks/skills/productivity/plan-reviewer/SKILL.md`; `plugins/docks/skills/productivity/plan-reviewer/scripts/review-policy.mjs`; `plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md`; `plugins/plan-lifecycle/skills/productivity/plan-reviewer/scripts/review-policy.mjs` | 3 | `local` | `planned` | `git log --follow` from the new `SKILL.md` contains the old path's last pre-move commit and the old tree is absent. Failure: STOP; do not copy or duplicate the reviewer. |
| 5 | Move the complete `plan-workspace` tree and Claude reviewer wrapper with `git mv`. | `plugins/docks/agents/plan-reviewer.md`; `plugins/docks/skills/productivity/plan-workspace/SKILL.md`; `plugins/docks/skills/productivity/plan-workspace/references/codex-agent-templates.md`; `plugins/docks/skills/productivity/plan-workspace/references/plans-agents-md-template.md`; `plugins/plan-lifecycle/agents/plan-reviewer.md`; `plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md`; `plugins/plan-lifecycle/skills/productivity/plan-workspace/references/codex-agent-templates.md`; `plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plans-agents-md-template.md` | 4 | `local` | `planned` | `git log --follow` from the new workspace `SKILL.md` and agent wrapper contains each old path's last pre-move commit, and both old paths are absent. Failure: STOP; do not copy or duplicate either owner. |
| 6 | Repoint live imports, wrappers, scaffold sources, author-tooling paths, fixtures, and contract prose to the new plugin while preserving frozen release-instance and finished-plan bytes. | `.codex/agents/plan-reviewer.toml`; `AGENTS.md`; `README.md`; `docs/plans/AGENTS.md`; `package.json`; `plugins/docks/README.md`; `plugins/docks/skills/AGENTS.md`; `plugins/docks/skills/productivity/scaffold/SKILL.md`; `plugins/docks/skills/productivity/scaffold/references/spec-schema.md`; `plugins/session-relay/test/release-evidence-contract.mjs`; `plugins/session-relay/test/remediation-contract.mjs`; `scripts/lib/plugins.mjs`; `scripts/lib/session-relay-release-preparation.mjs`; `scripts/lib/session-relay-release-promotion.mjs`; `scripts/tests/ci-plugin-targeting.mjs`; `scripts/tests/fixtures/structural-plan.md`; `scripts/tests/plan-dispatch-probes.mjs`; `scripts/tests/plan-evidence-probes.mjs`; `scripts/tests/plan-orchestration.mjs`; `scripts/tests/plan-orchestration/fixtures/historical-inventory.json`; `scripts/tests/plan-orchestration/historical-characterization.mjs`; `scripts/tests/plan-orchestration/legacy-quarantine.mjs`; `scripts/tests/plan-skill-phases.mjs` | 5 | `local` | `planned` | All live imports and generated-source pointers resolve under `plugins/plan-lifecycle`, focused orchestration and targeting tests exit 0, and no file under `docs/plans/finished/` or `scripts/lib/session-relay-release-instances/` changes. Failure: STOP and repair the reference; do not weaken a test or rewrite frozen evidence. |
| 7 | Remove lifecycle claims from docks manifests, bump docks manifests and its Claude catalog entry to `0.16.0`, run A1-A5, and bind the sensitive implementation checkpoint to a findings-free completion review. | `.claude-plugin/marketplace.json`; `plugins/docks/.claude-plugin/plugin.json`; `plugins/docks/.codex-plugin/plugin.json` | 6 | `local` | `planned` | A1-A5 pass, both docks manifests and its Claude catalog entry agree at `0.16.0`, both docks descriptions omit the removed lifecycle, and the required completion review passes on the exact implementation checkpoint. Failure: STOP; do not lower validator floors, edit expected censuses to fit a broken scan, or archive after a failed check/review. |
| 8 | Archive this plan through the lifecycle transaction, then confirm the tree is clean. | `docs/plans/finished/<finish-date>-plan-lifecycle-plugin-extraction.md` | 7 | `local` | `planned` | Step 7 already committed and reviewed the implementation, so this checkpoint owns the archive transition alone: `<finish-date>` is replaced by the UTC date on which the archive transaction runs; the manager verifies HEAD/index and owned-path preimages, writes `finished`, moves the plan, commits exactly the two plan paths and nothing else, and reads the checkpoint back. A6 runs after that commit, which is the only point at which a clean tree is observable. Any unowned change or read-back mismatch leaves the plan `ongoing` and STOPS. |
| 9 | Route the repo-wide transforming-skill guard over every registered plugin root and repoint the release-promotion contract at the moved module. | `scripts/ci.mjs`, `scripts/skills/transform-guard.mjs`, `plugins/session-relay/test/release-promotion-contract.mjs` | 8 | `local` | `planned` | `node scripts/skills/transform-guard.mjs` resolves all six curated names across both plugin roots with the curated list unchanged, and `node plugins/session-relay/test/release-promotion-contract.mjs` exits 0. Failure: STOP; do not set `transformGuard:false`, do not widen a descriptor's `skills` field, and do not drop a curated name.|

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/ci.mjs` | Exits 0; this is the authoritative full multi-plugin and registry gate. |
| A2 | `node scripts/tests/plan-orchestration.mjs` | Exits 0 with the lifecycle imports, dispatch probes, PlanRunV1 contracts, and workspace-template assertions resolving at their new paths. |
| A3 | `node plugins/plan-lifecycle/test/selftest.mjs` | Exits 0 and reports successful routing-prerequisite, manifest/catalog, registry, and minimum-docks-major assertions. |
| A4 | `test ! -e plugins/docks/skills/productivity/plan-manager && test ! -e plugins/docks/skills/productivity/plan-workspace && test ! -e plugins/docks/skills/productivity/plan-reviewer && test ! -e plugins/docks/agents/plan-reviewer.md` | Exits 0; the exact four old payload paths are absent. |
| A5 | `sh -c 'set -- plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md plugins/docks/skills/productivity/plan-manager/SKILL.md plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md plugins/docks/skills/productivity/plan-workspace/SKILL.md plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md plugins/docks/skills/productivity/plan-reviewer/SKILL.md plugins/plan-lifecycle/agents/plan-reviewer.md plugins/docks/agents/plan-reviewer.md; while [ "$#" -gt 0 ]; do new=$1; old=$2; shift 2; before=$(git log -1 --format=%H HEAD^ -- "$old"); test -n "$before" || exit 1; case "$(git log --follow --format=%H -- "$new")" in *"$before"*) ;; *) exit 1;; esac; done'` | Exits 0; each new path's followed history contains its old path's last pre-move commit. |
| A6 | `test -z "$(git status --porcelain)"` | Exits 0 with no output after the archive checkpoint; the gate itself is not claimed to enforce cleanliness. |
| A7 | `node scripts/skills/transform-guard.mjs` and `node plugins/session-relay/test/release-promotion-contract.mjs` | Both exit 0. The guard resolves all six curated transforming-skill names across every registered plugin root, and the release contract loads the moved module. |

## Out of scope / do-NOT-touch

- Publishing, pushing, releasing, installing, or deploying any plugin. This plan
  only prepares local versioned payloads and gates.
- Changing either review phase's two-permit budget, lifecycle tuple rules, or
  external-authority contract.
- Compiling the lifecycle into a binary or adding a binary release lane.
- Changing `session-relay` or effect-kit behavior beyond import/routing paths,
  effect-kit's explicit dependency, and the shared fail-loud prerequisite.
- Any file under `docs/plans/finished/` or
  `scripts/lib/session-relay-release-instances/`; those records remain
  byte-identical even when they contain historical old paths.
- Editing `scripts/ci.mjs`; the registry descriptor and plugin-owned self-test
  are the intended extension points.

## STOP conditions

1. Any step requires `probe`, `production_access`, `publish`, `push`, `release`,
   or `deploy`; re-draft with the required effect and live authority.
2. Any of the six routes lacks the identical prerequisite paragraph or the
   validator does not fail after that paragraph is removed from one route.
3. Compatibility cannot remain an explicit closed declaration checked by the
   plan-lifecycle self-test; do not substitute prose or an implicit same-major
   convention.
4. A move would require copy-then-delete, duplicate old/new owners, or history
   that `git log --follow` cannot connect to the pre-move commit.
5. A validator floor, expected census, historical fixture, finished plan, or
   release-instance record would need weakening or rewriting to pass.
6. The checkpoint sees an unowned index/worktree path, changed preimage, stale
   HEAD, or failed read-back.
7. Full CI, acceptance, or the required sensitive completion review does not
   pass on the final implementation bytes.

## Open questions

1. **DECIDED — plugin name:** `plan-lifecycle`. It names the subsystem rather
   than one operation, collides with none of `plan-manager`, `plan-reviewer`, or
   `plan-workspace`, and is absent from current plugin and skill names.
2. **DECIDED — compatibility:** add
   `plugins/plan-lifecycle/compatibility.json` with the closed declaration
   `{"schema":1,"minimum_docks_major":0}` and verify it in the plugin self-test
   against both manifests and docks' parsed major. This is machine-checkable and
   allows plan-lifecycle, effect-kit, and docks versions to move independently.
3. **DECIDED — absent-lifecycle guard:** add this exact paragraph to all six
   routes: “Prerequisite: `plan-lifecycle` must be installed. If
   `plan-workspace` or `plan-manager` is unavailable, STOP, name the missing
   `plan-lifecycle` plugin, and do not create or mutate a plan.” Skill bodies are
   Markdown and have no shared runtime preflight, so the observable is an exact
   text assertion in the validator rather than an emitted runtime message.

## Review

N/A — no review has been dispatched for this run.

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"execution_parent":null,"goal_id":"2ee17ed0-f3e0-483a-9c79-15bc68bf39a8","implementation_commit":null,"plan_path":"docs/plans/active/plan-lifecycle-plugin-extraction.md","plan_sha256":"16c65ac336f6025c82f81db4fc9b7c1231e787bb3a88b329df5628c6b7096721","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"ef96ce9c-6bf3-435c-b768-eab04b29e0c5","schema":1,"source_base":"8416733a349e65b211fafa47832d3782624f0444","source_sha256":"0e3308f90c3016fd0d420d48f34dd18a50a822b39d18b5e03eba6e1b23def234"}


Plan-attempt-history: {"authorization_source_sha256":"0889cde97525945382fbfa4f98b7f726fca77bdb38221c558412b63fb9ae6641","plan_bytes_sha256":"5e077c279d15e38d4093913448119f8b79c1e9b3644ea041512d6fe38eca998c","replacement_run_id":"ef96ce9c-6bf3-435c-b768-eab04b29e0c5","run":{"acceptance":null,"blocker":{"evidence_sha256":"30b5e05e0097ba524a66b1af1471883f7a811e958f92940627d127fd6eff3add","kind":"verification_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"2b3239ca896c0a05edcba368dc593521f6bb6af6c85f03b9f8eae3f1ee9bf57c","invocations":2,"result_sha256":"527e00f24051d43acfa1f59d8d219bbee94cb0097978fbf12796414602c75f1e","state":"passed"},"execution_parent":"010237580158992e736e224d674b374076db16fe","goal_id":"2ee17ed0-f3e0-483a-9c79-15bc68bf39a8","implementation_commit":null,"plan_path":"docs/plans/active/plan-lifecycle-plugin-extraction.md","plan_sha256":"2ae0f0058712006dd326845dd8fef5e888fc4447fcde0032cd9f82c3c1e71a0a","repository_id":"docks:/home/vagrant/projects/docks","requested_effects":["local"],"risk":"sensitive","run_id":"84b7d04d-b23a-4313-9793-a330a4f65a4d","schema":1,"source_base":"702383f504757336ebe6c3859db70384e82a814f","source_sha256":"c8855e7b66d4d150f208bbe3e8a7320618279ad0a311c2e1ac9b198cbed1c89f"},"schema":1,"status":"blocked","successor_run_sha256":"fdeadb4437b5508e8741b840e454f3b3ec13569dbc7669af56377985712ffd5f"}

## Verification Results

N/A - manager-written after execution.
