# Plugin-author tooling (scripts/)

These scripts validate and release the plugin. They are **author-side only** — never shipped to consumers. All tooling is Node `.mjs` — including `release.mjs` (`--dry-run` supported); the only bash left in the repo is the shipped runtime `context-tree-nudge` hook. `ci.mjs` is the local gate, and `.github/workflows/ci.yml` runs that same `ci.mjs` — true local↔CI parity.

<constraint>
`node scripts/ci.mjs` must be green before any commit — it exits non-zero on any failure. Don't loosen validator floors to make a problematic file pass; fix the file.
</constraint>

## Validators (orchestrated by ci.mjs)

| Script | Purpose | Floor |
|---|---|---|
| `ci.mjs` | the full gate — every check below + manifest/version validation + `claude plugin validate`; `ci.yml` runs this same file | — |
| `skills/guard.mjs` | runs the skill frontmatter validators (codex + claude via `lib/validate-skills.mjs`) + `codex-facts.mjs` + `refs-guard.mjs` | pass/fail |
| `lib/validate-skills.mjs` | skill frontmatter per runtime — name/description, 1024-char cap, no `#` truncation, CSO `Use when` prefix, `user-invocable`, `metadata.updated`, `references/` one level deep | pass/fail |
| `skills/codex-facts.mjs` | pins canonical Codex model ids / `sandbox_mode` / `model_reasoning_effort` + the `agents.max_depth` fact in the skill-agent-pipeline refs (self-skips when absent) | pass/fail |
| `skills/refs-guard.mjs` | reference hygiene: broken local `references/`/`assets/` links, orphan reference files, missing `## Contents` TOC on `references/*.md` > 100 lines with ≥3 doc-level headings | pass/fail |
| `skills/content-hash.mjs` | `metadata.updated` idempotency baseline | `--check-only` gate |
| `skills/transform-guard.mjs` | curated transformers carry a preservation `<constraint>` + `## Verification`; pending-allowlist warns, regression fails | pass/warn |
| `skills/no-author-scripts.mjs` | shipped SKILL.md + references/ + agent bodies must not name docks author scripts; allowlist: `scaffold`, `write-skill` | pass/fail |
| `agents/guard.mjs` | agent frontmatter, "Use when…"/"Not…" CSO, model declared | pass/fail |
| `agents/score.mjs` | agent quality (max 15) | per-file ≥14; total = N×14 |
| `tree/guard.mjs` | context-tree node pairs (AGENTS.md + one-line CLAUDE.md, ≤500) | pass/fail |
| `config/read-floor.mjs` | reads per-file floors from `scoring.json` | — |
| `scaffold/guard-spec.mjs` · `scaffold/test.mjs` | scaffold spec coherence + a full seed starts green | pass/fail |
| `tests/skill-trigger-collision.mjs` | cross-skill trigger-overlap audit — fails on a ≥5-token unrouted pair (`--report` prints the matrix) | pass/fail |
| `tests/idempotency.mjs` | content-hash determinism + every stored hash in sync | pass/fail |
| `tests/parity.mjs` | dev tool — proves a `.mjs` port == its old `.sh` (the gate used during the bash→`.mjs` migration) | — |
| shellcheck (`ci.mjs` §3b) | `-S warning` over `plugins/docks/hooks/*.sh` (the only bash left — a shipped runtime hook); self-skips locally, CI enforces | pass/fail |

`--per-file` prints `<category>/<name> <score>`. Total floors are count-derived (`artifact_count × per-file_floor`) — adding/removing an artifact moves the floor automatically. Per-file floors are the true gate. Skill frontmatter parsing uses Node + the npm `yaml` package (`corepack enable && pnpm install --frozen-lockfile`).

**Single-source scorer:** the 16-pt skill scorer lives ONCE, in the bundled `plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs` (`score [--per-file]`). The kit's `ci.mjs` scores with that same shipped file over `plugins/docks/skills`, and consumers run it on their own skills (`validate` / `score`) — one rubric, no author-side mirror, no sync contract. Bundled `scripts/` aren't content-hashed; bump write-skill's `metadata.updated` when the rubric changes.

## Edit → release workflow

1. Edit files inside `plugins/docks/{skills,agents}/`.
2. `node scripts/ci.mjs` — green before commit.
3. Local Claude Code test (no push): `claude --plugin-dir ./plugins/docks` (then `/reload-plugins`).
4. PR to main → PR-CI gates the merge.
5. After merge: `node scripts/release.mjs patch|minor|major|<X.Y.Z>` (add `--dry-run` to preview).

## Release flow (double-layered gating)

```text
edit → node scripts/ci.mjs                   (LAYER 1 — local, fast)
     → node scripts/release.mjs <bump>
        ├── runs ci.mjs again as precondition
        ├── bumps plugin.json + marketplace.json versions
        ├── commits + pushes
        ├── claude plugin tag --push          (creates docks--v<version>)
        ├── waits for tag-CI on GitHub        (LAYER 2 — authoritative)
        ├── tag-CI passes → gh release create
        └── tag-CI fails  → exits non-zero, prints recovery
```

Two layers: `ci.mjs` catches local issues fast (no burned tag); tag-CI catches contributor-machine drift and is the authoritative gate that decides whether the GitHub Release is created. `release.mjs` (Node; `--dry-run` previews the bump + manifest diff without tagging) orchestrates the version bump → commit → `claude plugin tag` → tag-CI wait → `gh release create`; it calls `node scripts/ci.mjs` as its local gate.

<constraint>
Run `node scripts/ci.mjs` manually before `node scripts/release.mjs` — iterating on failures is easier without the script's clean-tree requirement. The local ci.mjs must pass before any push that goes near a tag.
</constraint>

## Versioning

Both `plugin.json`s (`.claude-plugin/`, `.codex-plugin/`) and the Claude marketplace catalog carry a `version` that must agree — `release.mjs` keeps them in lockstep; `claude plugin tag` validates it. The Codex marketplace catalog has no plugin version field but is still validated for JSON shape. Without an explicit plugin `version`, every commit counts as a new "update" to consumers (noisy prompts), so always tag explicit semver bumps. Tag format: `docks--v<X.Y.Z>` (double-dash separator from `claude plugin tag`).
