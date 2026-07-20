# Authoring skills (plugins/effect-kit/skills/)

Skills are the cross-tool payload — each surfaces in Claude Code, Codex, and any agentskills.io runtime. Each skill is a directory `<category>/<name>/SKILL.md` (+ optional `references/`). Sole category: `engineering/` (the Effect payload). Plan-lifecycle and authoring skills come from the sibling docks plugin — don't re-bundle them here. **Effect-only scope:** every skill in this plugin targets the Effect ecosystem (the `effect` package and official `@effect/*` / `@effect-atom/*` packages); non-Effect skills belong in docks or their own plugin.

- Description starts "Use when …" (CSO); ≤500 chars for full scorer credit.
- `name` matches the parent directory; kebab-case.
- Body ≤500 lines (sweet spot 80–310) — every line loads on activation.
- During skill iteration, run the narrow validators and checks relevant to the change; after a meaningful batch, optionally run `node scripts/ci.mjs --plugin effect-kit`. Reserve full `node scripts/ci.mjs` for the final relevant implementation tree before commit, push, or release.
- After changing a skill's meaning, bump `metadata.updated` and re-sync the hash: `node scripts/skills/content-hash.mjs --backfill plugins/effect-kit/skills`.

The existing skills (`engineering/effect-ts-setup`, `engineering/effect-ts-port`, `engineering/effect-ts-specialist`) target **Effect 3.x stable**. The separate `engineering/effect-v4` skill provides version-gated **Effect v4 beta/prerelease** guidance: it must inspect `package.json` and the lockfile before version-specific code and must never emit v4 APIs into an Effect 3.x project. Keep every version-specific API claim grounded in the installed package and current official sources.

Adapted upstream skills use `metadata.pattern: upstream-adapted` and a `metadata.upstream` block recording repository, immutable commit, source path/URL, license, vendoring date, and intentional patches. Preserve useful progressive-disclosure references; never require mutable guidance downloads at skill runtime.

Use the `write-skill` skill (from the sibling docks plugin) to author new skills from scratch. Full authoring contract (frontmatter, CSO, scoring, content-hash idempotency, durable-anchors grammar): see `plugins/docks/skills/AGENTS.md`.
