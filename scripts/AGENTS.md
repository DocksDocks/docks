# Plugin-author tooling (scripts/)

These scripts validate and release the plugin. They are **author-side only** — never shipped to consumers. `ci.sh` is the local mirror of GitHub CI; run it before every commit.

<constraint>
`bash scripts/ci.sh` must be green before any commit — it exits non-zero on any failure. Don't loosen validator floors to make a problematic file pass; fix the file.
</constraint>

## Validators (called by ci.sh)

| Script | Purpose | Floor |
|---|---|---|
| `skills/guard.sh` | Runs Codex + Claude skill guards | pass/fail |
| `skills/codex.sh` | Codex loader compatibility — YAML frontmatter via Node `yaml`, name/description, 1024-char cap, no truncating plain scalars | pass/fail |
| `skills/claude.sh` | Claude compatibility — Codex checks plus CSO prefix, `user-invocable`, `metadata.updated` | pass/fail |
| `skills/codex-facts.sh` | Pins canonical Codex model ids / `sandbox_mode` / `model_reasoning_effort` + the `agents.max_depth` nesting fact in the skill-agent-pipeline reference docs (run by `skills/guard.sh`; self-skips when absent) | pass/fail |
| `skills/score.sh` | quality (max 16) | per-file ≥ category floor (engineering 10, productivity 8) |
| `skills/content-hash.sh` | `metadata.updated` idempotency baseline | `--check-only` gate |
| `agents/guard.sh` | frontmatter, "Use when…"/"Not…" CSO, model declared | pass/fail |
| `agents/score.sh` | quality (max 15) | per-file ≥14; total = N×14 |
| `tree/guard.sh` | context-tree node pairs (AGENTS.md + one-line CLAUDE.md, ≤500) | pass/fail |
| `skills/transform-guard.sh` | curated content-transforming skills carry a preservation `<constraint>` + `## Verification` block; shrinking pending-allowlist warns during rollout, fails on regression | pass/warn |
| `skills/no-author-scripts.sh` | shipped SKILL.md + references/ + agent bodies must not name docks author scripts (`scripts/ci.sh`, `scripts/{skills,agents,tree,scaffold,config,lib}/…`, `release.sh`) — they don't ship to consumers; allowlist: `scaffold`, `write-skill` | pass/fail |

`--per-file` on score scripts prints `<name> <score>`. Total floors are count-derived (`artifact_count × per-file_floor`) — adding/removing an artifact moves the floor automatically. Per-file floors are the true gate. Skill YAML parsing uses Node + pnpm (`corepack enable && pnpm install --frozen-lockfile`) so local checks match Codex-oriented tooling without requiring PyYAML.

## Edit → release workflow

1. Edit files inside `plugins/docks/{skills,agents}/`.
2. `bash scripts/ci.sh` — green before commit.
3. Local Claude Code test (no push): `claude --plugin-dir ./plugins/docks` (then `/reload-plugins`).
4. PR to main → PR-CI gates the merge.
5. After merge: `./scripts/release.sh patch|minor|major|<X.Y.Z>`.

## Release flow (double-layered gating)

```text
edit → bash scripts/ci.sh                    (LAYER 1 — local, fast)
     → ./scripts/release.sh <bump>
        ├── runs ci.sh again as precondition
        ├── bumps plugin.json + marketplace.json versions
        ├── commits + pushes
        ├── claude plugin tag --push          (creates docks--v<version>)
        ├── waits for tag-CI on GitHub        (LAYER 2 — authoritative)
        ├── tag-CI passes → gh release create
        └── tag-CI fails  → exits non-zero, prints recovery
```

Two layers: `ci.sh` catches local issues fast (no burned tag); tag-CI catches contributor-machine drift and is the authoritative gate that decides whether the GitHub Release is created.

<constraint>
Run `bash scripts/ci.sh` manually before `./scripts/release.sh` — iterating on failures is easier without the script's clean-tree requirement. The local ci.sh must pass before any push that goes near a tag.
</constraint>

## Versioning

Both `plugin.json`s (`.claude-plugin/`, `.codex-plugin/`) and the Claude marketplace catalog carry a `version` that must agree — `release.sh` keeps them in lockstep; `claude plugin tag` validates it. The Codex marketplace catalog has no plugin version field but is still validated for JSON shape. Without an explicit plugin `version`, every commit counts as a new "update" to consumers (noisy prompts), so always tag explicit semver bumps. Tag format: `docks--v<X.Y.Z>` (double-dash separator from `claude plugin tag`).
