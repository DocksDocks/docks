# Scaffold spec (docs/scaffold/)

The `scaffold` skill's source of truth for seeding new docks-style plugin projects. `spec.yaml` declares what a seeded project contains; `templates/` holds the `{{ var }}`-parameterized files rendered into the new project.

## Files

- `spec.yaml` — the scaffold definition. Schema: the `scaffold` skill's `references/spec-schema.md`.
- `templates/*.template` — manifest + root AGENTS.md files with `{{ plugin_name }}`-style placeholders.
- `templates/node-templates/` — per-folder AGENTS.md bodies for the seeded context tree.

## Rules

- Every `{{ var }}` token in a template must correspond to a key under `spec.yaml` `variables`.
- Bundled-skill `source` paths and `scripts` paths in `spec.yaml` must resolve in this repo — `scripts/scaffold/guard-spec.sh` enforces this.
- `scripts/scaffold/test.sh` renders the templates with test values into a temp dir and asserts the output is a structurally valid skeleton: JSON manifests parse, the three versioned manifests agree, every context-tree node is a valid pair, and no `{{ }}` placeholder leaks through.
- Detect bundled paths from the LIVE repo when editing `spec.yaml` — don't hand-copy stale examples (the skill is `context-tree`, not `tree`).
- Editing `spec.yaml` or `templates/` re-runs both guards via `bash scripts/ci.sh`.
