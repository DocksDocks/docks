# Validator tooling (scripts/)

Author-side validators — never shipped to consumers. Each accepts a path argument so it targets this project's plugin directory.

- `skills/guard.sh <skills-dir>` — runs both Codex and Claude skill compatibility checks
- `skills/codex.sh <skills-dir>` — Codex loader checks (YAML, name, description cap)
- `skills/claude.sh <skills-dir>` — Claude skill checks (CSO, metadata, body cap)
- `skills/score.sh <skills-dir>` — quality score (per-category floor from `config/scoring.json`)
- `tree/guard.sh [repo-root]` — context-tree node-pair convention (AGENTS.md + one-line CLAUDE.md)
- `config/read-floor.sh skills <category>` — reads the per-category score floor
- `ci.sh [-q]` — local validation gate that runs all of the above; run before every commit
- `release.sh <patch|minor|major|X.Y.Z>` — bump versions in lockstep, tag, push, create a GitHub Release

Run `corepack enable && pnpm install --frozen-lockfile` before the Node-backed skill guards. `ci.sh` is the seeded gate — run it before every commit; `release.sh` cuts a versioned release once the project has a GitHub remote.
