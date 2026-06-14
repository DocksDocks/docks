# Validator tooling (scripts/)

Author-side validators — never shipped to consumers. All Node `.mjs`; each accepts a path argument so it targets this project's plugin directory.

- `skills/guard.mjs <skills-dir>` — Codex + Claude skill compatibility (frontmatter) + reference hygiene + Codex facts
- the 16-pt quality scorer is the bundled `<skills-dir>/productivity/write-skill/scripts/skill-guard.mjs` (`score --per-file <skills-dir>`); per-category floor from `config/scoring.json`
- `tree/guard.mjs [repo-root]` — context-tree node-pair convention (AGENTS.md + one-line CLAUDE.md)
- `config/read-floor.mjs skills <category>` — reads the per-category score floor
- `ci.mjs` — local validation gate that runs all of the above; run before every commit
- `release.mjs <patch|minor|major|X.Y.Z>` — bump versions in lockstep, tag, push, create a GitHub Release

Run `corepack enable && pnpm install --frozen-lockfile` before the Node-backed guards. `ci.mjs` is the seeded gate — run it before every commit; `release.mjs` cuts a versioned release once the project has a GitHub remote.
