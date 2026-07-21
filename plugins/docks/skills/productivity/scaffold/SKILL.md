---
name: scaffold
description: "Use when spinning up a new docks-style plugin project, or capturing the current repo's structure for reuse — generates a cross-tool plugin skeleton (context-tree AGENTS.md/CLAUDE.md nodes, plugin manifests, manager/reviewer Codex plan wrappers, bundled skills, validator scripts) from docs/scaffold/spec.yaml. Modes: `scaffold setup` writes the spec from this repo; `scaffold target-path` seeds a new greenfield project. Not for non-plugin repos, non-empty targets, or generic file templating."
user-invocable: true
metadata:
  pattern: generative-skill
  updated: "2026-07-21"
  content_hash: "0d40faf199d34d360f902183d9d82f42bb30e0652643730ee47291766047c47d"
---

# Scaffold — capture a repo's shape, seed new projects from it

`scaffold` turns a project's structure into a reusable, versioned spec (`docs/scaffold/spec.yaml` + `templates/`) and seeds brand-new projects from it. One skill, two modes selected by the argument. The pattern is a generic skill consuming per-repo config captured once (mattpocock/skills). The output is a context-tree-shaped plugin — AGENTS.md/CLAUDE.md node pairs, plugin manifests, exactly the repo-local `plan-manager`/`plan-reviewer` Codex wrappers, bundled skills, and validator scripts — so a new project starts green from the same baseline.

Historical `plan-improver` is not a live skill; `plan-repairer` returns one exact patch or `cannot_repair`, and `plan-manager` alone validates, applies, and persists the result.

<constraint>
**Seed writes only into an empty target, never `docks`.** Before writing in seed mode, verify the target path is empty or non-existent (greenfield); refuse if it contains files. Refuse the plugin name `docks` (marketplace-collision guard). Run `git init` in the target only if it isn't already a repo.
</constraint>

<constraint>
**Approval gate before any write (cross-tool, NOT Plan Mode).** Both modes MUST show what will be written — setup shows the proposed spec; seed shows the full file manifest + every resolved variable value — then print it as your final message and END THE TURN. Do not call Write/Edit until the user replies. Do NOT call `ExitPlanMode` (Claude-only); the turn-ending gate works identically on Codex.
</constraint>

<constraint>
**Scaffolding does not imply plan review.** Setup or seed completion MUST NOT automatically create or review a plan. Invoke the plan workflow only when the current user's explicit request requires it; direct implementation and simple one-commit work stay outside the plan skills.
</constraint>

<constraint>
**Fill every `{{ var }}`; never emit a raw placeholder.** Substitution is skill-driven: as you write each templated file, replace every `{{ variable }}` token with its resolved value. After writing, grep the target for `{{` — any leftover means an unmapped variable; fix it before reporting done. No templating dependency, no sed step.
</constraint>

## Modes

| Invocation | Mode | What it does | Writes |
|---|---|---|---|
| `scaffold setup` | setup | Walk the current repo, propose `spec.yaml` (structure, nodes, bundled skills, variables), await approval, write `docs/scaffold/spec.yaml` + `templates/`. | `docs/scaffold/` |
| `scaffold <target-path>` | seed | Load `docs/scaffold/spec.yaml`, interview for variables, show file manifest + resolved values, await approval, write the new project, `git init`. | `<target-path>/` |
| `scaffold` (bare) | — | If `docs/scaffold/spec.yaml` is absent → offer setup. If present → ask for a target path to seed. | — |

## The spec (docs/scaffold/spec.yaml)

The spec is the single source of truth for what a scaffolded project contains: `plugin` metadata, `templated_files` (variable-substituted manifests + root files), `tree_nodes` (context-tree pairs to create), `bundled_skills` (copied from the source repo, pinned), `scripts` (validators to copy), and `variables` (prompted, with `{{ name }}` placeholders). Full schema + every field: [`references/spec-schema.md`](references/spec-schema.md).

```yaml
version: 1
plugin: { name_placeholder: "{{ plugin_name }}", license: MIT }
templated_files:
  - { template: plugin.json.template, dest: "plugins/{{ plugin_name }}/.claude-plugin/plugin.json" }
  - { template: root-AGENTS.md.template, dest: "AGENTS.md" }
  - { template: codex-plan-manager.toml.template, dest: ".codex/agents/plan-manager.toml" }
  - { template: codex-plan-reviewer.toml.template, dest: ".codex/agents/plan-reviewer.toml" }
tree_nodes:
  - { path: docs/plans, seed_from_skill: plan-workspace }
  - { path: "plugins/{{ plugin_name }}/skills", template: node-templates/skills-AGENTS.md }
bundled_skills:
  - { source: plugins/docks/skills/productivity/context-tree }
  - { source: plugins/docks/skills/productivity/plan-workspace }
  - { source: plugins/docks/skills/productivity/plan-creator }
  - { source: plugins/docks/skills/productivity/plan-manager }
  - { source: plugins/docks/skills/productivity/plan-reviewer }
  - { source: plugins/docks/skills/productivity/plan-repairer }
variables:
  plugin_name:        { prompt: "Plugin name (kebab-case)" }
  plugin_description: { prompt: "Short description" }
  author_name:        { prompt: "Author name",  default_from: "git config user.name" }
```

## BAD / GOOD — variable substitution

```text
# BAD — raw placeholder shipped into the new project
plugins/{{ plugin_name }}/.claude-plugin/plugin.json     ← literal "{{ plugin_name }}" on disk

# GOOD — resolved at write time
plugins/acme-tools/.claude-plugin/plugin.json            ← plugin_name = "acme-tools"
```

## Workflow — setup mode (`scaffold setup`)

1. **Acknowledge state.** Check for an existing `docs/scaffold/spec.yaml`. If present, this is a re-capture — diff against it, don't blind-overwrite.
2. **Walk the repo.** Detect context-tree nodes (reuse `context-tree audit`), plugin manifests, skill categories, and the validator scripts in `scripts/`.
3. **Choose templates.** For each file a new project needs parameterized (manifests, root AGENTS.md, node AGENTS.md), create `templates/<name>.template` with `{{ var }}` placeholders where repo-specific values appear.
4. **Propose.** Show the spec (variables, tree_nodes, bundled_skills, scripts) + the template file list. **STOP for confirmation** (constraint 2).
5. **Write.** Create `docs/scaffold/spec.yaml`, `docs/scaffold/templates/`, and the `docs/scaffold/` context-tree node pair (AGENTS.md + CLAUDE.md).
6. **Verify.** `node scripts/scaffold/guard-spec.mjs` (spec parses; every referenced template + bundled-skill path resolves).

## Workflow — seed mode (`scaffold <target-path>`)

1. **Greenfield check.** Target must be empty/absent; refuse otherwise. Refuse name `docks` (constraint 1).
2. **Load spec.** Read `docs/scaffold/spec.yaml`. If absent, stop and suggest `scaffold setup`.
3. **Interview.** Prompt for each `variable`; pull `default_from` via `git config` where set. (Use `AskUserQuestion` on Claude; plain prompts elsewhere.)
4. **Resolve + manifest.** Compute every output path and substitute variables into a preview. Show the full file manifest + resolved variable values. **STOP for confirmation** (constraint 2).
5. **Write the project.** For each entry: copy bundled skills/scripts verbatim; render templates with `{{ var }}` filled; create tree-node pairs; seed `docs/plans/` via the bundled `plan-workspace`; bundle all five exact plan skills (`plan-workspace`, `plan-creator`, `plan-manager`, `plan-reviewer`, `plan-repairer`); render only `.codex/agents/plan-manager.toml` and `.codex/agents/plan-reviewer.toml` as project-local Codex wrappers. Do not invent wrappers for workspace, creator, or repairer. The seeded entrypoints are `.mjs` (`scripts/ci.mjs`, `scripts/release.mjs`), run via `node` — no exec bit to set.
6. **Init + verify.** `git init` if needed. Run `corepack enable && pnpm install --frozen-lockfile`, then the generated validators such as `node <target>/scripts/skills/guard.mjs <target>/plugins/<name>/skills` and `node <target>/scripts/tree/guard.mjs <target>`. Then grep for stray `{{` (constraint 3).

## Gotchas

| Gotcha | Fix |
|---|---|
| Seeded into a non-empty dir and clobbered files | Greenfield-only — check the target is empty/absent BEFORE writing. |
| Left a raw `{{ plugin_name }}` in an output file | Unmapped variable. Grep the target for `{{` after writing; every token must resolve. |
| Bundled-skill path in spec is stale (`tree`, old `agents`) | Detect bundled skills from the LIVE repo during setup; don't copy a hand-written example. |
| Wrote a node AGENTS.md without its CLAUDE.md | Tree nodes are pairs. Seed both; CLAUDE.md = `@AGENTS.md` (see `context-tree`). |
| Put Codex plan wrappers in plugin manifests, or emitted wrappers beyond manager/reviewer | They are repo-local `.codex/agents/plan-manager.toml` and `plan-reviewer.toml`, not plugin payload; workspace/creator/repairer have no wrappers. |
| New project's validators fail on cold start | The spec/templates are wrong. Fix until the generated skill and tree guards are green — that's the acceptance bar. |
| Used `ExitPlanMode` for the gate | Claude-only. Use a conversational confirm so Codex works too. |

## When NOT to use

- Non-plugin repos — scaffold seeds the docks-style plugin shape (manifests, skills, context-tree), not arbitrary projects.
- A non-empty target, or "apply to my existing project" — greenfield only this version.
- Generic file templating / a Yeoman-cookiecutter replacement — scaffold is spec-driven and plugin-specific.

## References

- [`references/spec-schema.md`](references/spec-schema.md) — full `spec.yaml` schema: every field, `seed_from_skill` vs `template` vs `bundled_skills`, `default_from`, variable rules.
- Companion skills: `context-tree` (the node pairs seed mode writes) · `plan-workspace` (seeds `docs/plans/`) · `plan-creator`, `plan-manager`, `plan-reviewer`, and `plan-repairer` (the other exact bundled plan phases) · `write-skill` (author new skills in the seeded project).
