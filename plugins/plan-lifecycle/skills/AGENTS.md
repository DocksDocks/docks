# Authoring the plan-lifecycle skills (plugins/plan-lifecycle/skills/)

This plugin ships exactly three skills — `productivity/plan-workspace`,
`productivity/plan-manager`, and `productivity/plan-reviewer` — plus one
`plan-manager/scripts/plan.mjs` lifecycle tool, one
`plan-manager/references/plan-contract.md` contract reference, and two read-only
reviewer wrappers at `../agents/plan-reviewer.md` and
`../agents/code-reviewer.md`, with this source repository's matching
`.codex/agents/plan-reviewer.toml` and `.codex/agents/code-reviewer.toml` pair.
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
`plan-manager` runs decide → draft → research → one plan review → implement →
code review; internal `plan-reviewer` returns a read-only pre-implementation
verdict. Two read-only reviewer wrappers ship: the plugin wrappers at
`../agents/plan-reviewer.md` and `../agents/code-reviewer.md`, with this source
repository's matching `.codex/agents/plan-reviewer.toml` and
`.codex/agents/code-reviewer.toml` pair. `plugins/plan-lifecycle/agents/`
deliberately carries no context-tree node (`claude plugin validate` lints every
`agents/*.md` as a subagent, so a node pair there fails validation).

## Plan-skill contract sync

The synchronized surface is the v2 frontmatter, the eight sections, both table
headers, the three plan-review kinds (`goal_fit`, `research_gap`,
`security_risk`), the two review-record shapes, and the zero-commit rule.

When any part changes, synchronize the three skills,
`plan-manager/references/plan-contract.md`, the workspace template, this
repository's `docs/plans/AGENTS.md`, both plugin and Codex wrapper pairs, and
`scripts/tests/plan-skill-phases.mjs`. Main owns one content-hash backfill after
a coordinated multi-file cutover. The skill bodies are asserted verbatim by
`scripts/tests/plan-skill-phases.mjs`; the CLI is exercised by
`scripts/tests/plan-cli.mjs`. Update positive assertions in the same change as
their normative sentences; never relax an assertion to make a copy drift pass.

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
