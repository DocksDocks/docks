# spec.yaml schema

## Contents

- [Top-level keys](#top-level-keys)
- [`plugin`](#plugin)
- [`templated_files`](#templated_files)
- [`tree_nodes`](#tree_nodes)
- [Node template rules](#node-template-rules)
- [`bundled_skills`](#bundled_skills)
- [`scripts`](#scripts)
- [`variables`](#variables)
- [Substitution rules](#substitution-rules)

`docs/scaffold/spec.yaml` defines what a seeded project contains. Setup mode writes it; seed mode reads it. It must be stdlib-parseable YAML with no anchors or aliases. Setup verification checks the schema, all referenced sources, and a complete temporary render.

## Top-level keys

| Key | Type | Required | Purpose |
|---|---|---|---|
| `version` | int | yes | Schema version. Seed accepts only the versions this skill documents (`1`) and refuses any other. |
| `plugin` | map | yes | Plugin-level constants (`name_placeholder`, `license`). |
| `templated_files` | list | yes | Variable-substituted files rendered into the new project (manifests, root AGENTS.md, Codex project agents). |
| `tree_nodes` | list | yes | Context-tree nodes to create. |
| `bundled_skills` | list | no | Skills copied verbatim from the source repo (pinned to its revision). |
| `scripts` | list | no | Validator scripts copied verbatim into the new project's `scripts/`. |
| `variables` | map | yes | Prompted values; each name is a `{{ token }}` usable in any template or path. |

## `plugin`

```yaml
plugin:
  name_placeholder: "{{ plugin_name }}"   # token used wherever the plugin name appears
  license: MIT                            # literal default
```

## `templated_files`

Each entry is `{ template, dest }`. `template` is a path under `docs/scaffold/templates/`; `dest` is the output path (may contain `{{ var }}` tokens). The file content is rendered with `{{ var }}` substituted. The two Codex plan wrappers are the read-only reviewers `plan-reviewer` and `code-reviewer` under `.codex/agents/`; main context owns `plan-manager` directly.

```yaml
templated_files:
  - { template: plugin.json.template,            dest: "plugins/{{ plugin_name }}/.claude-plugin/plugin.json" }
  - { template: codex-plugin.json.template,      dest: "plugins/{{ plugin_name }}/.codex-plugin/plugin.json" }
  - { template: marketplace.json.template,       dest: ".claude-plugin/marketplace.json" }
  - { template: codex-marketplace.json.template, dest: ".agents/plugins/marketplace.json" }
  - { template: codex-plan-reviewer.toml.template, dest: ".codex/agents/plan-reviewer.toml" }
  - { template: codex-code-reviewer.toml.template, dest: ".codex/agents/code-reviewer.toml" }
  - { template: package.json.template,           dest: "package.json" }
  - { template: bun.lock.template,               dest: "bun.lock" }
  - { template: root-AGENTS.md.template,         dest: "AGENTS.md" }
```

This block shows the entry shape, not a complete inventory. Setup mode should copy the live spec's `templated_files` list after verifying each template exists.

The three versioned manifests (`plugin.json`, Codex `plugin.json`, Claude `marketplace.json`) must agree on `version`; setup verification checks the rendered output before accepting the spec.

## `tree_nodes`

Each entry is `{ path, <one seed source> }`. `path` may contain `{{ var }}` tokens. Exactly one seed source:

| Seed source | Meaning |
|---|---|
| `seed_from_skill: <skill-name>` | Run that bundled skill's bootstrap to populate the node (for `docs`, use `plan-workspace` to seed the plan label set plus `docs/AGENTS.md` and `docs/PLAN.md`). |
| `template: <file>` | Render `templates/<file>` into the node's `AGENTS.md`. |
| `seed: { type: self-reference }` | The folder documents the scaffold itself (e.g. `docs/scaffold`). |

Every node is a single `AGENTS.md` (see the `context-tree` skill). Never write a `CLAUDE.md`: a CLAUDE.md without an `@AGENTS.md` import makes Claude read it instead of AGENTS.md.

```yaml
tree_nodes:
  - { path: "docs", seed_from_skill: plan-workspace }
  - { path: "docs/scaffold", seed: { type: self-reference } }
  - { path: "plugins/{{ plugin_name }}/skills", template: "node-templates/skills-AGENTS.md" }
  - { path: "scripts", template: "node-templates/scripts-AGENTS.md" }
```

## Node template rules

Every `AGENTS.md` a seed writes (root `templated_files` entry and each `tree_nodes` template) is a durable doc: agents read it as current state. Setup applies these rules when it creates a template; seed verification checks the rendered output.

| Rule | Applies to | Check in seed mode |
|---|---|---|
| Carry the stale-tolerance line verbatim: "Pointers here name concepts, not coordinates — if a path or symbol moved, trust the stated purpose and re-locate it (grep the symbol) before acting." | every node | grep each `AGENTS.md` for the line |
| State build/test/lint commands and name the file that defines them (e.g. `package.json` scripts). Repo-wide rules only. | root | read |
| One `## Context tree` row per `tree_nodes` path: first cell `` `<path>/AGENTS.md` `` (an `@` inside the backticks is tolerated; a bare `@path` outside backticks is an eager import, do not use it) + one-line purpose. This table is the only list of nodes. | root | every nested `AGENTS.md` on disk is named; every named node exists |
| Hold only the rules for editing files in the node's folder. A fact owned by another file (commands, repo-wide policy, generated data) is a backticked repo-root-relative path, not a copy. | nested nodes | every backticked path resolves |
| No line-number anchors (`path:NN`), live versions, counts, sizes, dates, or "currently"/"recently". Name the file or config key that owns the value and add `(verify: <command>)`. | every node | grep for `path:NN` and the banned words |
| No `CLAUDE.md` anywhere. A CLAUDE.md without an `@AGENTS.md` import makes Claude read it instead of AGENTS.md. | whole target | `git ls-files` for `CLAUDE.md` is empty |

The seed-mode check commands are in the skill body (seed step 6).

## `bundled_skills`

```yaml
bundled_skills:
  - { source: plugins/docks/skills/productivity/context-tree }
  - { source: plugins/plan-lifecycle/skills/productivity/plan-workspace }
  - { source: plugins/plan-lifecycle/skills/productivity/plan-manager }
  - { source: plugins/plan-lifecycle/skills/productivity/plan-reviewer }
  - { source: plugins/docks/skills/productivity/write-skill }
```

The three plan skills are copied verbatim and keep separate ownership: workspace maintenance, main-context orchestration, and repository-grounded plan review. Scaffold generation does not create or review a plan. The read-only Codex wrappers are `plan-reviewer` and `code-reviewer`. Main context invokes `plan-manager` directly. Plans are GitHub issues, not tracked markdown files. Read `skills/productivity/plan-manager/references/plan-contract.md` inside the installed `plan-lifecycle` plugin for the plan contract.

- `source` - path in the source repo. Setup must read these from the live repo rather than copying a stale example.
- `destination` - optional; defaults to the same category path under `plugins/{{ plugin_name }}/`.
- Copied verbatim (pinned). A copy never re-syncs from the source repo. To update it, re-copy it from the source repo into the seeded project and release a new plugin version there; that project's consumers then receive it through `claude plugin update`.

## `scripts`

```yaml
scripts:
  - { source: scripts/check-project.mjs }
  - { source: scripts/release.mjs }
```

Each entry is a project-owned script copied verbatim to the same relative path.
Setup discovers the live list instead of assuming the examples above. Seed
verification runs the project's CI / validators, if present.

This block shows the script-entry shape, not a complete inventory. Setup mode should copy the live spec's script list after verifying each source exists.

Copied verbatim into the new project's `scripts/`. Each validator accepts a path argument, so the seeded project invokes them against its own `plugins/<name>/skills` (see the seeded `scripts/AGENTS.md`). The generated `package.json` and `bun.lock` provide the Node `yaml` dependency for parser-backed skill validation.

## `variables`

```yaml
variables:
  plugin_name:        { prompt: "Plugin name (kebab-case, not 'docks')" }
  plugin_description: { prompt: "Short description" }
  author_name:        { prompt: "Author name",  default_from: "git config user.name" }
  author_email:       { prompt: "Author email", default_from: "git config user.email" }
  license:            { prompt: "License", default: MIT }
```

| Field | Meaning |
|---|---|
| `prompt` | Question shown to the user when seeding (required). |
| `default_from` | Shell command whose stdout pre-fills the answer (e.g. `git config user.name`). |
| `default` | Literal fallback when no `default_from` and the user accepts the default. |

## Substitution rules

- A token is `{{ name }}` (spaces optional: `{{name}}` also matches). `name` must be a key under `variables`.
- Tokens are valid in template file CONTENT and in `templated_files[].dest`, `tree_nodes[].path`, `bundled_skills[].destination`.
- Substitution is literal find-and-replace done by the skill as it writes (no engine, no sed step). After writing, grep the target for `{{` - zero matches is the invariant.
- `plugin_name` must be kebab-case and must not be `docks`.
- JSON-escape values that contain quotes when rendering `.json` templates.
