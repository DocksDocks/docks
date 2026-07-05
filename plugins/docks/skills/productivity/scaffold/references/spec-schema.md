# spec.yaml schema

## Contents

- [Top-level keys](#top-level-keys)
- [`plugin`](#plugin)
- [`templated_files`](#templated_files)
- [`tree_nodes`](#tree_nodes)
- [`bundled_skills`](#bundled_skills)
- [`scripts`](#scripts)
- [`variables`](#variables)
- [Substitution rules](#substitution-rules)

`docs/scaffold/spec.yaml` defines what a seeded project contains. Setup mode writes it; seed mode reads it. Stdlib-parseable YAML, no anchors/aliases. `scripts/scaffold/guard-spec.mjs` validates it; `scripts/scaffold/test.mjs` renders it.

## Top-level keys

| Key | Type | Required | Purpose |
|---|---|---|---|
| `version` | int | yes | Schema version. Currently `1`. Seed refuses an unknown version. |
| `plugin` | map | yes | Plugin-level constants (`name_placeholder`, `license`). |
| `templated_files` | list | yes | Variable-substituted files rendered into the new project (manifests, root AGENTS.md, Codex project agents). |
| `tree_nodes` | list | yes | Context-tree node pairs to create. |
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

Each entry is `{ template, dest }`. `template` is a path under `docs/scaffold/templates/`; `dest` is the output path (may contain `{{ var }}` tokens). The file content is rendered with `{{ var }}` substituted. Codex custom agents are plain templated files under `.codex/agents/`; they are project-local wrappers, not plugin-shipped agents.

```yaml
templated_files:
  - { template: plugin.json.template,            dest: "plugins/{{ plugin_name }}/.claude-plugin/plugin.json" }
  - { template: codex-plugin.json.template,      dest: "plugins/{{ plugin_name }}/.codex-plugin/plugin.json" }
  - { template: marketplace.json.template,       dest: ".claude-plugin/marketplace.json" }
  - { template: codex-marketplace.json.template, dest: ".agents/plugins/marketplace.json" }
  - { template: codex-plan-manager.toml.template, dest: ".codex/agents/plan-manager.toml" }
  - { template: codex-plan-review.toml.template,  dest: ".codex/agents/plan-review.toml" }
  - { template: package.json.template,           dest: "package.json" }
  - { template: pnpm-lock.yaml.template,         dest: "pnpm-lock.yaml" }
  - { template: root-AGENTS.md.template,         dest: "AGENTS.md" }
```

This block shows the entry shape, not a complete inventory. Setup mode should copy the live spec's `templated_files` list after verifying each template exists.

The three versioned manifests (`plugin.json`, codex `plugin.json`, claude `marketplace.json`) must agree on `version` — `scripts/scaffold/test.mjs` enforces this on the rendered output.

## `tree_nodes`

Each entry is `{ path, <one seed source> }`. `path` may contain `{{ var }}` tokens. Exactly one seed source:

| Seed source | Meaning |
|---|---|
| `seed_from_skill: <skill-name>` | Run that bundled skill's bootstrap to populate the folder (e.g. `plan-init` for `docs/plans`). |
| `template: <file>` | Render `templates/<file>` into the node's `AGENTS.md`, then add the one-line `CLAUDE.md` (`@AGENTS.md`). |
| `seed: { type: self-reference }` | The folder documents the scaffold itself (e.g. `docs/scaffold`). |

Every node is written as the **pair** `AGENTS.md` + `CLAUDE.md` (see the `context-tree` skill). `CLAUDE.md` is always exactly `@AGENTS.md`.

```yaml
tree_nodes:
  - { path: "docs/plans", seed_from_skill: plan-init }
  - { path: "docs/scaffold", seed: { type: self-reference } }
  - { path: "plugins/{{ plugin_name }}/skills", template: "node-templates/skills-AGENTS.md" }
  - { path: "scripts", template: "node-templates/scripts-AGENTS.md" }
```

## `bundled_skills`

```yaml
bundled_skills:
  - { source: plugins/docks/skills/productivity/context-tree }
  - { source: plugins/docks/skills/productivity/plan-init, destination: plugins/{{ plugin_name }}/skills/productivity/plan-init }
```

- `source` — path in the SOURCE repo. Setup must read these from the LIVE repo (don't hand-copy a stale example — the skill is `context-tree`, not `tree`; the old `agents` skill was removed).
- `destination` — optional; defaults to the same category path under `plugins/{{ plugin_name }}/`.
- Copied verbatim (pinned). Consumers update them later via `claude plugin update`.

## `scripts`

```yaml
scripts:
  - { source: scripts/lib/skills-walk.mjs }
  - { source: scripts/lib/validate-skills.mjs }
  - { source: scripts/skills/guard.mjs }
  - { source: scripts/skills/refs-guard.mjs }
  - { source: scripts/skills/codex-facts.mjs }
  - { source: scripts/skills/content-hash.mjs }
  - { source: scripts/config/read-floor.mjs }
  - { source: scripts/config/scoring.json }
  - { source: scripts/tree/guard.mjs }
```

This block shows the script-entry shape, not a complete inventory. Setup mode should copy the live spec's script list after verifying each source exists.

Copied verbatim into the new project's `scripts/`. Each validator accepts a path argument, so the seeded project invokes them against its own `plugins/<name>/skills` (see the seeded `scripts/AGENTS.md`). The generated `package.json` and `pnpm-lock.yaml` provide the Node `yaml` dependency for parser-backed skill validation.

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
- Substitution is literal find-and-replace done by the skill as it writes (no engine, no sed step). After writing, grep the target for `{{` — zero matches is the invariant.
- `plugin_name` must be kebab-case and must not be `docks`.
- JSON-escape values that contain quotes when rendering `.json` templates.
