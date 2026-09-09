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
`node scripts/ci.mjs` for the final implementation tree. Do not loosen validator
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

`plan-workspace` maintains workspace routing and reviewer setup; `new` creates
the repository plan labels. Main-context `plan-manager` runs decide, draft,
research, plan review, implement, and code review, with fresh review after
repairs and user decisions when review cannot progress;
`plan-reviewer` returns one read-only pre-implementation verdict block per
round. Two read-only reviewer wrappers ship: the plugin wrappers at
`../agents/plan-reviewer.md` and `../agents/code-reviewer.md`, with this source
repository's matching `.codex/agents/plan-reviewer.toml` and
`.codex/agents/code-reviewer.toml` pair. `plugins/plan-lifecycle/agents/`
deliberately carries no context-tree node (`claude plugin validate` lints every
`agents/*.md` as a subagent, so a node pair there fails validation).

## Plan-skill contract sync

`plan-manager/references/plan-contract.md` is canonical. Skill bodies,
workspace templates, project routing, and reviewer wrappers point to it rather
than repeat record grammar. Keep the six phases in the manager and the finding
vocabulary in the read-only reviewers.

Coordinate edits across those surfaces when concepts change. Refresh content
hashes after all reference edits finish. `scripts/tests/plan-cli.mjs` exercises
the helper's behavior; no test pins skill prose.

## Fail-loud routing (four external routes)

`refactor`, `security`, `context-tree`, and `skill-agent-pipeline` (docks) each
carry one byte-identical prerequisite paragraph naming this plugin, so a
runtime without `plan-lifecycle` stops instead of silently proceeding without
a plan. `test/selftest.mjs` asserts the exact prerequisite paragraph text;
change that paragraph only in lockstep across all four routes and the self-test.

## Scoring and namespace

Same rubric as every kit skill: `node
plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score
--per-file plugins/plan-lifecycle/skills` - per-file floor productivity 8
(`scripts/config/scoring.json`); agents floor 14. Skills surface as
`plan-lifecycle:<name>` from `name` in `.claude-plugin/plugin.json`.
