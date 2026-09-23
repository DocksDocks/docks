---
name: scaffold
description: "Use when spinning up a new docks-style plugin project, or capturing the current repo's structure for reuse — generates a cross-tool plugin skeleton (context-tree AGENTS.md nodes, plugin manifests, two read-only Codex reviewer wrappers, bundled skills, validator scripts) from docs/scaffold/spec.yaml. Modes: `scaffold setup` writes the spec from this repo; `scaffold target-path` seeds a new greenfield project. Not for non-plugin repos, non-empty targets, generic file templating, or one-shot full repo setup (use agent-first-setup)."
user-invocable: true
metadata:
  pattern: generative-skill
  updated: "2026-09-23"
  content_hash: "881d0ee5a5da31b2b4fdf5ab04784bacb69420aac291e528e7d90b3dafca22b8"
---

# Scaffold — capture a repo's shape, seed new projects from it

`scaffold` turns a project's structure into a reusable, versioned spec (`docs/scaffold/spec.yaml` + `templates/`) and seeds brand-new projects from it. One skill, two modes selected by the argument. The pattern is a generic skill consuming per-repo config captured once (mattpocock/skills). The output is a context-tree-shaped plugin — single-file AGENTS.md nodes, plugin manifests, two repo-local read-only Codex reviewer wrappers, `plan-reviewer` and `code-reviewer`, bundled skills, and validator scripts — so a new project starts green from the same baseline.

`docs/scaffold/` is opt-in, project-owned generated state, not part of this skill's payload. Its absence is normal: `scaffold setup` creates a project-specific spec and templates only after the approval gate; seed mode is available after that setup.

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

<constraint>
**Seeded nodes are durable docs.** Every `AGENTS.md` template (root and `tree_nodes`) carries the stale-tolerance line, holds only rules for its own folder (pointers, not copies, for facts owned elsewhere), and contains no line-number anchors, live versions, counts, dates, or "currently". The root template states the commands (build/test/lint) and routes to every `tree_nodes` path through one `## Context map` table; seed verification compares that table with disk. Full rules: [`references/spec-schema.md`](references/spec-schema.md) § Node template rules.
</constraint>

## Modes

| Invocation | Mode | What it does | Writes |
|---|---|---|---|
| `scaffold setup` | setup | Walk the current repo, propose `spec.yaml` (structure, nodes, bundled skills, variables), await approval, write `docs/scaffold/spec.yaml` + `templates/`. | `docs/scaffold/` |
| `scaffold <target-path>` | seed | Load `docs/scaffold/spec.yaml`, interview for variables, show file manifest + resolved values, await approval, write the new project, `git init`. | `<target-path>/` |
| `scaffold` (bare) | — | If `docs/scaffold/spec.yaml` is absent → offer setup. If present → ask for a target path to seed. | — |

## The spec (docs/scaffold/spec.yaml)

The spec is the single source of truth for what a scaffolded project contains: `plugin` metadata, `templated_files` (variable-substituted manifests + root files), `tree_nodes` (context-tree nodes to create), `bundled_skills` (copied from the source repo, pinned), `scripts` (validators to copy), and `variables` (prompted, with `{{ name }}` placeholders). Full schema + every field: [`references/spec-schema.md`](references/spec-schema.md).

```yaml
version: 1
plugin: { name_placeholder: "{{ plugin_name }}", license: MIT }
templated_files:
  - { template: plugin.json.template, dest: "plugins/{{ plugin_name }}/.claude-plugin/plugin.json" }
  - { template: root-AGENTS.md.template, dest: "AGENTS.md" }
  - { template: codex-plan-reviewer.toml.template, dest: ".codex/agents/plan-reviewer.toml" }
  - { template: codex-code-reviewer.toml.template, dest: ".codex/agents/code-reviewer.toml" }
tree_nodes:
  - { path: docs, seed_from_skill: plan-workspace }
  - { path: "plugins/{{ plugin_name }}/skills", template: node-templates/skills-AGENTS.md }
bundled_skills:
  - { source: plugins/docks/skills/productivity/context-tree }
  - { source: plugins/plan-lifecycle/skills/productivity/plan-workspace }
  - { source: plugins/plan-lifecycle/skills/productivity/plan-manager }
  - { source: plugins/plan-lifecycle/skills/productivity/plan-reviewer }
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
3. **Choose templates.** For each file a new project needs parameterized (manifests, root AGENTS.md, node AGENTS.md), create `templates/<name>.template` with `{{ var }}` placeholders where repo-specific values appear. Node templates follow constraint 5: replace any volatile value from the source repo (version, count, line anchor) with the owning file plus `(verify: <command>)`, and give `root-AGENTS.md.template` one `## Context map` row per `tree_nodes` path.
4. **Propose.** Show the spec (variables, tree_nodes, bundled_skills, scripts) + the template file list. **STOP for confirmation** (constraint 2).
5. **Write.** Create `docs/scaffold/spec.yaml`, `docs/scaffold/templates/`, and the `docs/scaffold/` context-tree node (`AGENTS.md` only).
6. **Verify.** Parse the spec as YAML; reject anchors, aliases, unknown schema versions, missing sources, and missing templates. Render every template with fixed test values into a temporary directory, require zero unresolved `{{` tokens, require the rendered root `AGENTS.md` to name every rendered `tree_nodes` path, and validate the temporary render. Defer generated-project validator execution to seed mode, after writing a complete project.

## Workflow — seed mode (`scaffold <target-path>`)

1. **Greenfield check.** Target must be empty/absent; refuse otherwise. Refuse name `docks` (constraint 1).
2. **Load spec.** Read `docs/scaffold/spec.yaml`. If absent, stop and suggest `scaffold setup`.
3. **Interview.** Prompt for each `variable`; pull `default_from` via `git config` where set. (Use `AskUserQuestion` on Claude; plain prompts elsewhere.)
4. **Resolve + manifest.** Compute every output path and substitute variables into a preview. Show the full file manifest + resolved variable values. **STOP for confirmation** (constraint 2).
5. **Write the project.** For each entry: copy bundled skills/scripts verbatim; render templates with `{{ var }}` filled; create tree nodes (one `AGENTS.md` each, no `CLAUDE.md`); use the bundled `plan-workspace` to seed the plan label set plus `docs/AGENTS.md` and `docs/PLAN.md`; bundle the three exact plan skills (`plan-workspace`, `plan-manager`, `plan-reviewer`); render `.codex/agents/plan-reviewer.toml` and `.codex/agents/code-reviewer.toml` as the two project-local read-only reviewer wrappers. Main context owns `plan-manager` directly; do not invent wrappers for manager, workspace, creator, repairer, or improver. The seeded entrypoints are `.mjs` files run via `node` — no exec bit to set.
6. **Init + verify.** `git init` if needed. Run `bun install --frozen-lockfile`, then every validator the spec's `scripts` list copies, for example `node <target>/scripts/skills/guard.mjs <target>/plugins/<name>/skills` and `node <target>/scripts/tree/guard.mjs <target>` (the seeded `scripts/AGENTS.md` owns the full list). Then grep for stray `{{` (constraint 3) and run the agent-first check from the target root (every line printed is a failure):

   ```bash
   git ls-files -co --exclude-standard -- ':(glob)*/**/AGENTS.md' \
     | while IFS= read -r p; do grep -qF "\`$p\`" AGENTS.md || echo "UNROUTED: $p"; done
   grep -oE '`[^`]*AGENTS\.md`' AGENTS.md | tr -d '`' \
     | while IFS= read -r p; do test -f "$p" || echo "DEAD POINTER: $p"; done
   git ls-files -co --exclude-standard -- ':(glob)**/AGENTS.md' | while IFS= read -r p; do
     grep -qF 'Pointers here name concepts, not coordinates' "$p" || echo "NO STALE-TOLERANCE LINE: $p"
     grep -nEi '[A-Za-z0-9_./-]+\.[a-z]{1,5}:[0-9]+|\b(currently|as of today|recently)\b' "$p" | sed "s|^|VOLATILE: $p:|"
   done
   git ls-files -co --exclude-standard -- ':(glob)**/CLAUDE.md' | sed 's/^/CLAUDE.md PRESENT: /'
   ```

## Gotchas

| Gotcha | Fix |
|---|---|
| Seeded into a non-empty dir and clobbered files | Greenfield-only — check the target is empty/absent BEFORE writing. |
| Left a raw `{{ plugin_name }}` in an output file | Unmapped variable. Grep the target for `{{` after writing; every token must resolve. |
| Bundled-skill path in spec is stale (`tree`, old `agents`) | Detect bundled skills from the LIVE repo during setup; don't copy a hand-written example. |
| Wrote a CLAUDE.md next to a node AGENTS.md | A CLAUDE.md suppresses native AGENTS.md loading in Claude Code; write AGENTS.md only (see `context-tree`). |
| Seeded root `AGENTS.md` misses a `tree_nodes` folder, or a template copies a version/count from the source repo | One `## Context map` row per node in `root-AGENTS.md.template`; name the owning file plus `(verify: …)` instead of the value. The seed-mode check prints `UNROUTED` / `VOLATILE` until fixed. |
| Put a Codex plan wrapper in plugin manifests, or emitted anything except the two read-only reviewers | The only plan wrappers are repo-local `.codex/agents/plan-reviewer.toml` and `.codex/agents/code-reviewer.toml`; main context owns `plan-manager` directly. |
| New project's validators fail on cold start | The spec/templates are wrong. Fix until the generated skill and tree guards are green — that's the acceptance bar. |
| Used `ExitPlanMode` for the gate | Claude-only. Use a conversational confirm so Codex works too. |

## When NOT to use

- Non-plugin repos — scaffold seeds the docks-style plugin shape (manifests, skills, context-tree), not arbitrary projects.
- A non-empty target, or "apply to my existing project" — greenfield only this version.
- Generic file templating / a Yeoman-cookiecutter replacement — scaffold is spec-driven and plugin-specific.

## References

- [`references/spec-schema.md`](references/spec-schema.md) — full `spec.yaml` schema: every field, `seed_from_skill` vs `template` vs `bundled_skills`, `default_from`, variable rules.
- Companion skills: `context-tree` (the nodes seed mode writes) · `plan-workspace`, `plan-manager`, and `plan-reviewer` (the exact bundled plan owners) · `write-skill` (author new skills in the seeded project).
