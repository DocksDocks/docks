# Plugin-author tooling (scripts/)

These scripts validate and release the repo's plugins. They are **author-side only** — never shipped to consumers. All tooling is Node `.mjs` — including `release.mjs` (`--dry-run` supported) and the cross-tool `context-tree-nudge` PostToolUse hook. The repo has **zero** bash. `ci.mjs` is the local gate, and `.github/workflows/ci.yml` runs that same `ci.mjs` — true local↔CI parity.

<constraint>
`node scripts/ci.mjs` must be green before any commit — it exits non-zero on any failure. Don't loosen validator floors to make a problematic file pass; fix the file.
</constraint>

## Multi-plugin model (`scripts/lib/plugins.mjs`)

The repo hosts **multiple plugins** (`docks`, `session-relay`, …) under `plugins/`. `scripts/lib/plugins.mjs` is the **single source of truth**: a `PLUGINS` array of descriptors, each declaring paths + capabilities. **Adding a plugin = adding one descriptor** — no edits to `ci.mjs`/`release.mjs`.

| Descriptor field | Meaning |
|---|---|
| `name` | marketplace + tag identity (`claude plugin tag` → `<name>--v<ver>`) |
| `root` | plugin dir under the repo (`plugins/<name>`) |
| `skills` | skills root, or `null` (skills-only checks self-skip when absent) |
| `agents` | agents root, or `null` (agents guard+score run only when set) |
| `codex` | `true` when a `.codex-plugin/` mirror + Codex marketplace entry ship |
| `selftest` | path to a runnable self-test, or `null` |
| `extraJson` | extra JSON configs to validate (hooks/mcp/etc.) |
| `transformGuard` | run `transform-guard.mjs` (curated transformers) |
| `install` | the consumer install snippet for the GitHub Release notes |

`ci.mjs` is **registry-driven**: it runs repo-wide checks **once** (workflow YAML, both marketplace catalogs, tree/guard, idempotency, shellcheck over all plugins, scaffold), then a **capability-driven per-plugin gate** (`gatePlugin`) for each present plugin — a check fires only when its capability is declared, so a skills-only plugin and a skills+agents+selftest plugin share one code path. Flags: `-q` (quiet), `--list` (print the registry + presence), `--plugin <name>` (gate just that one; repo-wide checks still run). Versions are **per-plugin and independent** — `release.mjs` targets exactly one plugin via `--plugin` (default `docks`).

## Validators (orchestrated by ci.mjs)

| Script | Purpose | Floor |
|---|---|---|
| `ci.mjs` | the full gate — repo-wide checks once + a per-plugin `gatePlugin` (manifest/version validation, `claude plugin validate`, codex parity, the checks below) for every entry in `lib/plugins.mjs`; `ci.yml` runs this same file | — |
| `skills/guard.mjs` | runs the skill frontmatter validators (codex + claude via `lib/validate-skills.mjs`) + `codex-facts.mjs` + `refs-guard.mjs` | pass/fail |
| `lib/validate-skills.mjs` | skill frontmatter per runtime — name/description, 1024-char cap, no `#` truncation, CSO `Use when` prefix, `user-invocable`, `metadata.updated`, `references/` one level deep | pass/fail |
| `skills/codex-facts.mjs` | pins canonical Codex model ids / `sandbox_mode` / `model_reasoning_effort` + the `agents.max_depth` fact in the skill-agent-pipeline refs (self-skips when absent) | pass/fail |
| `skills/refs-guard.mjs` | reference hygiene: broken local `references/`/`assets/` links, orphan reference files, missing `## Contents` TOC on `references/*.md` > 100 lines with ≥3 doc-level headings | pass/fail |
| `skills/content-hash.mjs` | `metadata.updated` idempotency baseline | `--check-only` gate |
| `skills/transform-guard.mjs` | curated transformers carry a preservation `<constraint>` + `## Verification`; pending-allowlist warns, regression fails | pass/warn |
| `skills/no-author-scripts.mjs` | shipped SKILL.md + references/ + agent bodies must not name docks author scripts; allowlist: `scaffold`, `write-skill`. Takes `<skills-dir> [agents-dir]` args so `gatePlugin` scopes it per-plugin (agents scanned only when given) | pass/fail |
| `agents/guard.mjs` | agent frontmatter, "Use when…"/"Not…" CSO, model declared | pass/fail |
| `agents/score.mjs` | agent quality (max 15) | per-file ≥14; total = N×14 |
| `tree/guard.mjs` | context-tree node pairs (AGENTS.md + one-line CLAUDE.md, ≤500) | pass/fail |
| `config/read-floor.mjs` | reads per-file floors from `scoring.json` | — |
| `scaffold/guard-spec.mjs` · `scaffold/test.mjs` | scaffold spec coherence + a full seed starts green | pass/fail |
| `tests/skill-trigger-collision.mjs` | cross-skill trigger-overlap audit — fails on a ≥5-token unrouted pair (`--report` prints the matrix) | pass/fail |
| `tests/idempotency.mjs` | content-hash determinism + every stored hash in sync | pass/fail |
| shellcheck (repo-wide) | `-S warning` over every plugin's `hooks/*.sh` (via `shellHooks(p)`); currently a no-op (zero bash in the repo) — kept so a future shell hook is still linted | pass/warn |

`--per-file` prints `<category>/<name> <score>`. Total floors are count-derived (`artifact_count × per-file_floor`) — adding/removing an artifact moves the floor automatically. Per-file floors are the true gate. Skill frontmatter parsing uses Node + the npm `yaml` package (`corepack enable && pnpm install --frozen-lockfile`).

**Shared author-side libs (`scripts/lib/`):** `skills-walk.mjs` (SKILL.md traversal — `findSkillFiles`/`eachSkillDir`/`findSkillByName`) and `skills-parse.mjs` (frontmatter/body line helpers — `bodyAfterFrontmatter`/`slopCount`/`metaUpdated`/…) are imported by the author-side validators so the walk + body-line method live once. The bundled `write-skill/scripts/skill-guard.mjs` keeps its OWN copies on purpose — it ships standalone into consumer repos where `scripts/lib/` doesn't exist; its body-line method must stay byte-identical to `skills-parse.mjs`'s or scores shift. `skills-walk.mjs` is seeded (the seeded validators import it); `skills-parse.mjs` is not (no seeded script imports it).

**Single-source scorer:** the 16-pt skill scorer lives ONCE, in the bundled `plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs` (`score [--per-file]`). The kit's `ci.mjs` scores with that same shipped file over `plugins/docks/skills`, and consumers run it on their own skills (`validate` / `score`) — one rubric, no author-side mirror, no sync contract. Bundled `scripts/` aren't content-hashed; bump write-skill's `metadata.updated` when the rubric changes.

## Edit → release workflow

1. Edit files inside the target plugin (`plugins/<name>/{skills,agents,…}/`).
2. `node scripts/ci.mjs` — green before commit (gates **all** present plugins; `--plugin <name>` narrows the per-plugin gate while iterating).
3. Local Claude Code test (no push): `claude --plugin-dir ./plugins/<name>` (then `/reload-plugins`).
4. PR to main → PR-CI gates the merge.
5. After merge, release **one plugin**: `node scripts/release.mjs [--plugin <name>] patch|minor|major|<X.Y.Z>` (`--plugin` defaults to `docks`; add `--dry-run` to preview).

## Release flow (double-layered gating)

```text
edit → node scripts/ci.mjs                   (LAYER 1 — local, fast, ALL plugins)
     → node scripts/release.mjs [--plugin <name>] <bump>   (one plugin)
        ├── runs ci.mjs -q again as precondition (full repo + all plugins)
        ├── bumps THIS plugin's plugin.json (+ codex mirror) + its marketplace entry
        ├── commits + pushes  (chore(release): <name> v<version>)
        ├── claude plugin tag --push          (creates <name>--v<version>)
        ├── waits for tag-CI on GitHub        (LAYER 2 — authoritative)
        ├── tag-CI passes → gh release create
        └── tag-CI fails  → exits non-zero, prints recovery
```

Two layers: `ci.mjs` catches local issues fast (no burned tag); tag-CI catches contributor-machine drift and is the authoritative gate that decides whether the GitHub Release is created. `release.mjs` is **registry-driven and single-plugin** (`--plugin <name>`, default `docks`; `--dry-run` previews the bump + manifest diff without tagging): it bumps only the selected plugin's manifests + marketplace entry (matched by `name`), so the other plugins' versions never move. It orchestrates version bump → commit → `claude plugin tag` → tag-CI wait → `gh release create`, calling `node scripts/ci.mjs` as its local gate.

<constraint>
Run `node scripts/ci.mjs` manually before `node scripts/release.mjs` — iterating on failures is easier without the script's clean-tree requirement. The local ci.mjs must pass before any push that goes near a tag.
</constraint>

## Versioning

Versions are **per-plugin and independent** — `docks` and `session-relay` bump separately, and the Claude marketplace catalog holds one entry per plugin (matched by `name`). Within a single plugin, both its `plugin.json`s (`.claude-plugin/`, `.codex-plugin/`) and its marketplace entry carry a `version` that must agree — `release.mjs` keeps that plugin's triple in lockstep, and `ci.mjs`'s per-plugin gate fails on disagreement; `claude plugin tag` validates it too. The Codex marketplace catalog has no plugin version field but is still validated for JSON shape. Without an explicit plugin `version`, every commit counts as a new "update" to consumers (noisy prompts), so always tag explicit semver bumps. Tag format: `<name>--v<X.Y.Z>` (e.g. `docks--v0.6.5`, `session-relay--v0.1.0`; double-dash separator from `claude plugin tag`).
