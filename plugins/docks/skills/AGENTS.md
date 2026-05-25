# Authoring skills (plugins/docks/skills/)

Skills are the cross-tool payload — every skill here surfaces in Claude Code, Codex, and any agentskills.io runtime. Each skill is a directory `<category>/<name>/SKILL.md` (+ optional `references/`). Categories: `engineering/`, `productivity/`. The description is surfaced in the session listing (loaded every session); the body loads only on activation — spend the effort on the description.

<constraint>
Run `bash scripts/ci.sh` after any skill change — it must be green before commit. Don't loosen validator floors to make a file pass; fix the file. The validator/CI contract lives in `scripts/AGENTS.md`.
</constraint>

<constraint>
After changing a skill's meaning, bump `metadata.updated` (today) and re-sync the hash: `bash scripts/skill-content-hash.sh --backfill`. CI's idempotency check fails if a stored `content_hash` drifts from the body + references. Editing only `updated:` does not change the hash.
</constraint>

## Description (the thing that gets matched)

1. **Lead with "Use when …"** — the guard enforces this prefix.
2. **Key use case first** — the combined description is truncated at 1,536 chars in the listing; the first ~100 chars matter most.
3. **≤500 chars** for full scorer credit (≤500 = 2 pts, ≤1,000 = 1, else 0; hard cap 1,024).
4. **Concrete trigger keywords**, not capability prose. "Use when running pnpm audit, pip-audit…" beats "Use when working with dependency security." Move "Covers X, Y, Z" enumerations into the body.
5. **No slop words** (`comprehensive`, `robust`, `elegant`, `seamless`) — −1 pt each (max −2).

## Frontmatter

| Field | Rule |
|---|---|
| `name` | optional (dir-name fallback); ≤64 chars, `[a-z0-9-]+`, must match parent dir |
| `description` | recommended; ≤1,024 hard cap; ≤500 for full credit; starts "Use when" |
| `user-invocable` | `true` for slash-command-style skills, else `false` |
| `metadata.updated` | `YYYY-MM-DD`; bump only on a real content change |
| `metadata.content_hash` | auto-managed by `skill-content-hash.sh --backfill` |
| `allowed-tools` | pre-approves tools while the skill is active |
| third-party | add an `upstream:` block (`source`/`license`/`vendored_at`) to relax kit checks for vendored skills |

## Body (loads on activation — every line is a recurring cost)

Conciseness test: "would removing this line cause Claude to make mistakes? If not, cut it." Don't restate what Claude already knows.

| Pattern | When |
|---|---|
| `<constraint>` block | non-negotiable rule; scorer rewards up to 3 |
| Lookup table | high-density mapping (smell→fix, before→after) |
| BAD/GOOD code blocks | fragile decisions; scorer rewards both idioms |
| Gotchas | concrete corrections to repeat mistakes |
| Validation loop | do → run validator → fix → repeat |
| `references/<topic>.md` | when body crosses ~310 lines, split detail out (30–150 lines each) |

Body sweet spot **80–310 lines** (scorer; ≤500 hard cap). Past ~310, post-compaction re-attachment (~5,000 tokens) may silently drop content.

## Scoring

`bash scripts/score-skills.sh --per-file | grep <name>` — max 16. Per-file floor by category: **engineering 10, productivity 8** (`scripts/scoring.config.json`). Aim 14+ on new skills. Structural gate: `bash scripts/guard-skills.sh`. To author a new skill from scratch, use the `write-skill` skill.

## Namespace

Artifacts surface as `<plugin>:<name>` (e.g. `docks:security`, `docks:write-skill`) from `name` in `.claude-plugin/plugin.json`.

## Sources

- Skills: <https://code.claude.com/docs/en/skills>
- agentskills.io spec: <https://agentskills.io/specification>
