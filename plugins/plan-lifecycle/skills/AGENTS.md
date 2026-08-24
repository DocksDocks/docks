# Authoring the plan-lifecycle skills (plugins/plan-lifecycle/skills/)

This plugin ships exactly three skills - `productivity/plan-workspace`,
`productivity/plan-manager`, and `productivity/plan-reviewer` - plus one
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
After changing a skill's meaning, run `node scripts/skills/content-hash.mjs
--backfill plugins/plan-lifecycle/skills`. It re-syncs `content_hash` and stamps
`metadata.updated` in the same write, and it writes only when the hash actually
differs, so a formatting-only edit leaves both fields alone and the recorded date
keeps describing the last real change. Readers use `metadata.updated` to judge
staleness, so the date must never be bumped by a formatting pass. Shipped
`scripts/` sit outside the content-hash surface - bump `metadata.updated`
manually when only those change.
</constraint>

<constraint>
Shipped skill bodies (SKILL.md + `references/`) and the shipped agent body are
consumer-facing - never name docks plugin-author scripts (`scripts/ci.mjs`,
`scripts/skills/*`, `scripts/tree/*`, `scripts/agents/*`, `scripts/release.mjs`,
`scripts/config/*`, `scripts/lib/*`) as a step. Make verification
self-contained or refer generically to "the project's CI / validators, if
present". `scripts/skills/no-author-scripts.mjs` enforces this.
</constraint>

## Roles (closed set)

`plan-workspace` maintains the repository `plan*` labels, the `docs/PLAN.md`
standard, and its `docs/AGENTS.md`/`docs/CLAUDE.md` routing pair; main-context
`plan-manager` runs decide → draft → research → plan review → implement → code
review, with bounded repair and fresh re-review in both review phases; internal
`plan-reviewer` returns one read-only pre-implementation verdict block per
round. Two read-only reviewer wrappers ship: the plugin wrappers at
`../agents/plan-reviewer.md` and `../agents/code-reviewer.md`, with this source
repository's matching `.codex/agents/plan-reviewer.toml` and
`.codex/agents/code-reviewer.toml` pair. `plugins/plan-lifecycle/agents/`
deliberately carries no context-tree node (`claude plugin validate` lints every
`agents/*.md` as a subagent, so a node pair there fails validation).

## Plan-skill contract sync

The synchronized surface is the v3 first-line marker, no-frontmatter rule,
eight sections, both table headers, four open-work phases (`drafting`, `planned`,
`ongoing`, `blocked`), the GitHub `state` + `stateReason` derivation truth table,
the three plan-review kinds (`goal_fit`, `research_gap`, `security_risk`),
comment-backed review records, five-round plan and code review repair loops,
implement-start linked-branch publication, default pull-request landing,
explicit merge confirmation, lifecycle-tool ownership, issue write
preconditions, trusted latest-record selection with legacy-body fallback,
archive-as-verifier landing proof, and marker-only classification: any body
without the exact v3 opening is unreadable and no parser is attempted. Humans
may read frozen history, but no lifecycle command or workspace migration
operation opens or inventories it. Legacy workspace migration creates fresh
records only for user-restated goals.

When any part changes, synchronize the three skills,
`plan-manager/references/plan-contract.md`,
`productivity/plan-workspace/references/plan-md-template.md`, this repository's
`docs/PLAN.md`, both plugin and Codex wrapper pairs, and
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
--per-file plugins/plan-lifecycle/skills` - per-file floor productivity 8
(`scripts/config/scoring.json`); agents floor 14. Skills surface as
`plan-lifecycle:<name>` from `name` in `.claude-plugin/plugin.json`.
