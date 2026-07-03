# Authoring skills (plugins/effect-kit/skills/)

Skills are the cross-tool payload — each surfaces in Claude Code, Codex, and any agentskills.io runtime. Each skill is a directory `<category>/<name>/SKILL.md` (+ optional `references/`). Sole category: `engineering/` (the Effect payload). Plan-lifecycle and authoring skills come from the sibling docks plugin — don't re-bundle them here. **Effect-only scope:** every skill in this plugin targets the Effect ecosystem (the `effect` package and official `@effect/*` / `@effect-atom/*` packages); non-Effect skills belong in docks or their own plugin.

- Description starts "Use when …" (CSO); ≤500 chars for full scorer credit.
- `name` matches the parent directory; kebab-case.
- Body ≤500 lines (sweet spot 80–310) — every line loads on activation.
- Run `node scripts/ci.mjs --plugin effect-kit` before commit (repo-wide checks still run).
- After changing a skill's meaning, bump `metadata.updated` and re-sync the hash: `node scripts/skills/content-hash.mjs --backfill plugins/effect-kit/skills`.

The Effect skills (`engineering/effect-ts-setup`, `engineering/effect-ts-port`, `engineering/effect-ts-specialist`) target **Effect 3.x stable**. Keep version-specific API claims (Schema in `effect/Schema`, `@effect/platform` HttpApi, `@effect-atom/atom-react`) grounded — verify against current docs before changing them.

Use the `write-skill` skill (from the sibling docks plugin) to author new skills from scratch. Full authoring contract (frontmatter, CSO, scoring, content-hash idempotency, durable-anchors grammar): see `plugins/docks/skills/AGENTS.md`.
