# Authoring skills (plugins/docks/skills/)

Skills are the cross-tool payload — every skill here surfaces in Claude Code, Codex, and any agentskills.io runtime. Each skill is a directory `<category>/<name>/SKILL.md` (+ optional `references/`). Categories: `engineering/`, `productivity/`. The description is surfaced in the session listing (loaded every session); the body loads only on activation — spend the effort on the description.

<constraint>
Run `bash scripts/ci.sh` after any skill change — it must be green before commit. Don't loosen validator floors to make a file pass; fix the file. The validator/CI contract lives in `scripts/AGENTS.md`.
</constraint>

<constraint>
After changing a skill's meaning, bump `metadata.updated` (today) and re-sync the hash: `bash scripts/skills/content-hash.sh --backfill`. CI's idempotency check fails if a stored `content_hash` drifts from the body + references. Editing only `updated:` does not change the hash.
</constraint>

<constraint>
Shipped skill bodies (SKILL.md + `references/`) are consumer-facing — never name docks plugin-author scripts (`scripts/ci.sh`, `scripts/skills/*`, `scripts/tree/*`, `scripts/agents/*`, `scripts/release.sh`, `scripts/config/*`, `scripts/lib/*`, `scripts/scaffold/*`) as a step. They are author-side only (`scripts/AGENTS.md`) and absent from a consumer's project, so the instruction breaks the moment the skill runs anywhere but this repo. Make verification SELF-CONTAINED (an inline check) or refer GENERICALLY to "the project's CI / validators, if present". `scripts/skills/no-author-scripts.sh` enforces this; only the tooling-authoring skills that seed/describe that tooling (`scaffold`, `write-skill`) are allowlisted. This applies to plugin-shipped agent bodies too.
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
| `metadata.content_hash` | auto-managed by `scripts/skills/content-hash.sh --backfill` |
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

## Data preservation for transforming skills

A skill that **moves, splits, migrates, or rewrites existing content** (root → nodes, `CLAUDE.md` → `AGENTS.md`, `SKILL.md` → `references/`, code refactors) can drop content with no error. The kit standard lives in `productivity/write-skill/references/data-preservation.md` (10-point checklist + 3 copy-paste templates). Two non-negotiables, both **copied inline** into the skill (never cross-linked — a sibling-skill reference is a dangling pointer; agentskills.io says keep references one level deep):

1. A preservation `<constraint>` near the top of the body (survives the 5,000-token post-compaction window).
2. A `## Verification` block doing **per-section presence** + a net-shrink tripwire — NOT a byte-percentage floor, which is backwards for a split (scaffolding makes output ≥100% of input, so a lost section hides under it).

`scripts/skills/transform-guard.sh` enforces both across the curated transformer list (`scripts/AGENTS.md`).

## Cross-tool wording (Claude Code + Codex)

Skills run in both runtimes; phrase for both. Verified 2026-05-28 against the live docs.

1. **Constraints at the top.** After compaction Claude Code re-attaches only the first ~5,000 tokens of each invoked skill (25,000-token shared budget, oldest-invoked dropped first). Put non-negotiable/safety rules in `<constraint>` blocks near the top — a rule at the bottom is dropped first.
2. **Turn-ending approval gates.** No runtime "pause" primitive exists for skills (`disable-model-invocation` only gates auto-invoke). The only enforceable pause is ending the turn: "print the proposal as your final message and STOP; don't call Write/Edit until the user replies." "STOP and await" alone gets bypassed (Opus 4.7/4.8 follow instructions literally).
3. **Front-load the description.** Codex shortens the skills *catalog* tail-first when it overflows (~8,000 chars ≈ 2% of context); the per-skill `description` cap is still 1,024. Primary trigger in the first ~100 chars (Claude truncates the listing at 1,536 too).
4. **Codex reads bodies as plain markdown** — it does not weight `<constraint>` XML. A safety rule must read correctly as plain prose, not lean on the tag for emphasis.
5. **`isolation: worktree` is Claude-only.** Don't rely on it (or plugin-subagent `hooks`/`mcpServers`/`permissionMode`) for cross-tool safety.

## Scoring

`bash scripts/skills/score.sh --per-file | grep <name>` — max 16. Per-file floor by category: **engineering 10, productivity 8** (`scripts/config/scoring.json`). Aim 14+ on new skills. Structural gate: `bash scripts/skills/guard.sh`. To author a new skill from scratch, use the `write-skill` skill.

## Namespace

Artifacts surface as `<plugin>:<name>` (e.g. `docks:security`, `docks:write-skill`) from `name` in `.claude-plugin/plugin.json`.

## Sources

- Skills: <https://code.claude.com/docs/en/skills>
- agentskills.io spec: <https://agentskills.io/specification>
