# Authoring the plan-lifecycle skills (plugins/plan-lifecycle/skills/)

This plugin ships exactly three skills — `productivity/plan-workspace`,
`productivity/plan-manager`, and `productivity/plan-reviewer` — plus the
manager's shipped PlanRunV1 machinery (`plan-manager/scripts/`) and the
reviewer's canonical policy helper (`plan-reviewer/scripts/review-policy.mjs`).
It is self-versioned: manifests live in `.claude-plugin/` and `.codex-plugin/`,
and `compatibility.json` is the closed declaration
`{"schema":1,"minimum_docks_major":0}` verified by `test/selftest.mjs` against
docks' parsed major. Do not replace it with prose or a same-major convention.

<constraint>
During skill iteration, run the narrow validators relevant to the change. After
a meaningful batch, you may run the owning plugin gate
(`node scripts/ci.mjs --plugin plan-lifecycle` here); reserve full
`node scripts/ci.mjs` for the final implementation tree. Don't loosen validator
floors to make a file pass; fix the file. The validator/CI contract lives in
`scripts/AGENTS.md`.
</constraint>

<constraint>
After changing a skill's meaning, bump `metadata.updated` (today) and re-sync
the hash: `node scripts/skills/content-hash.mjs --backfill
plugins/plan-lifecycle/skills`. Shipped `scripts/` sit outside the content-hash
surface — bump `metadata.updated` manually when they change.
</constraint>

<constraint>
Shipped skill bodies (SKILL.md + `references/`) and the shipped agent body are
consumer-facing — never name docks plugin-author scripts (`scripts/ci.mjs`,
`scripts/skills/*`, `scripts/tree/*`, `scripts/agents/*`, `scripts/release.mjs`,
`scripts/config/*`, `scripts/lib/*`) as a step. Make verification
self-contained or refer generically to "the project's CI / validators, if
present". `scripts/skills/no-author-scripts.mjs` enforces this.
</constraint>

## Roles (closed set)

`plan-workspace` maintains the `docs/plans/` workspace; main-context
`plan-manager` owns classify → draft/review/one repair → start →
implement/delegate → observed acceptance → finish/archive; internal
`plan-reviewer` returns read-only `PlanReviewV1` evidence over one immutable
bundle. Only the reviewer has wrappers: the plugin-shipped Claude wrapper at
`../agents/plan-reviewer.md` and this source repo's Codex wrapper at
`.codex/agents/plan-reviewer.toml`. `plugins/plan-lifecycle/agents/`
deliberately carries no context-tree node (`claude plugin validate` lints every
`agents/*.md` as a subagent, so a node pair there fails validation).

## Plan-skill contract sync

The convention lives in exactly these three skills, each consumer project's
`docs/plans/AGENTS.md`, and the embedded
`plan-workspace/references/plans-agents-md-template.md`.

The current contract moves as one PlanRunV1 surface: one unfenced compact-JCS
record; repository/path/run and cross-repository goal identity; canonical
plan/source/acceptance hashes; separate draft/completion phases holding two
draft permits and one local or two nonlocal completion permits; exclusive
preimage/CAS transactions; major checkpoint commits; an exact-diff completion
review at every risk; target-local legacy quarantine; literal live external
authority; and Steps `Effect` values
`local|probe|production_access|publish|push|release|deploy`. Schemas 1–6 are
historical validation/quarantine only.

When any part changes, synchronize the three skills, the workspace template,
this repository's `docs/plans/AGENTS.md`, reviewer wrappers, and public routing
prose. Main owns one content-hash backfill after a coordinated multi-file
cutover. The skill bodies are asserted verbatim by
`scripts/tests/plan-skill-phases.mjs`; the machinery is exercised by
`scripts/tests/plan-orchestration.mjs`. Update positive assertions in the same
change as their normative sentences; never relax an assertion to make a copy
drift pass.

## Fail-loud routing (six external routes)

`refactor`, `security`, `context-tree`, and `skill-agent-pipeline` (docks) plus
`effect-ts-port` and `effect-ts-setup` (effect-kit) each carry one
byte-identical prerequisite paragraph naming this plugin, so a runtime without
`plan-lifecycle` stops instead of silently proceeding without a plan.
`test/selftest.mjs` and `scripts/tests/plan-skill-phases.mjs` assert the exact
text; change it only in lockstep across all six routes and both validators.

## Scoring and namespace

Same rubric as every kit skill: `node
plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score
--per-file plugins/plan-lifecycle/skills` — per-file floor productivity 8
(`scripts/config/scoring.json`); agents floor 14. Skills surface as
`plan-lifecycle:<name>` from `name` in `.claude-plugin/plugin.json`.
