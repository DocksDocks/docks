# Validator tooling (scripts/)

Author-side validators — never shipped to consumers. Each accepts a path argument so it targets this project's plugin directory.

- `guard-skills.sh <skills-dir>` — structural skill checks (frontmatter, ≤500 lines, name matches dir)
- `score-skills.sh <skills-dir>` — quality score (per-category floor from `scoring.config.json`)
- `guard-tree.sh [repo-root]` — context-tree node-pair convention (AGENTS.md + one-line CLAUDE.md)
- `read-floor.sh skills <category>` — reads the per-category score floor

Run these before every commit. Wire them into a `ci.sh` as the project grows.
