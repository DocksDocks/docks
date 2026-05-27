# CI workflows (.github/)

`workflows/ci.yml` runs the same guards + scorers as local `scripts/ci.sh`, plus YAML / manifest validation, on GitHub. Skill YAML/frontmatter guards use Node + pnpm (`corepack enable`, then `pnpm install --frozen-lockfile`) before running `scripts/skills/guard.sh`, which covers Codex and Claude compatibility checks.

## Trigger model

Only three events trigger CI:
- `pull_request` to main → gate merges
- `push` of tags matching `docks--v*` → gate releases (`release.sh` waits for this)
- `workflow_dispatch` → manual

<constraint>
**No** `push: branches: [main]` trigger — main pushes don't re-run CI; PR validation already covers it. The tag-push CI is the authoritative release gate (it decides whether the GitHub Release object is created).
</constraint>

## Keep in sync with scripts/ci.sh

`ci.yml` mirrors `scripts/ci.sh` — when you add or remove a validator under `scripts/`, update both. Local `ci.sh` is LAYER 1 (fast feedback); tag-CI here is LAYER 2 (authoritative, catches contributor-machine drift). See `scripts/AGENTS.md` for the validator list and release flow.
