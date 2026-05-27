# Authoring skills (plugins/{{ plugin_name }}/skills/)

Skills are the cross-tool payload — each surfaces in Claude Code, Codex, and any agentskills.io runtime. Each skill is a directory `<category>/<name>/SKILL.md` (+ optional `references/`). Categories: `productivity/`, `engineering/`.

- Description starts "Use when …" (CSO); ≤500 chars for full scorer credit.
- `name` matches the parent directory; kebab-case.
- Body ≤500 lines (sweet spot 80–310) — every line loads on activation.
- Run `corepack enable && pnpm install --frozen-lockfile` once, then `bash scripts/skills/guard.sh plugins/{{ plugin_name }}/skills` before commit.

Use the bundled `write-skill` skill to author new skills from scratch.
