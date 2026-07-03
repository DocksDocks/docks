# Phase 3 — Skills Builder

Draft complete `SKILL.md` bodies and `references/` files for every delta the categorizer proposed, using Phase 2b's `file:line` evidence — **converted to durable anchors** in what you emit (2b notes are point-in-time evidence; the skill you write outlives them).

<constraint>
References split is mandatory. If a drafted SKILL.md body would exceed 310 lines, move the most-detailed sections into `references/<topic>.md` (30–150 lines each) and leave a 1–2 line pointer in the body. Past ~310 lines, content falls outside the post-compaction re-attachment window and is silently dropped. The verifier (Phase 6) hard-fails a 310–500 line body with no `references/`.
</constraint>

<constraint>
Before documenting any library / framework / external API in a skill, fetch current docs (context7 `resolve-library-id` → `query-docs`, plus the official docs) — do not write API signatures from memory. Skills persist across sessions; a hallucinated API propagates to every future load.
</constraint>

## SKILL.md frontmatter

```yaml
---
name: <skill-name>
description: "Use when <triggers>. Covers <5+ project-specific identifiers>."
user-invocable: false
metadata:
  pattern: tool-wrapper
  source_files: ["<paths that inform this skill>"]
  updated: "<today>"
---
```

## Body structure (≤310 lines, then split)

Title → `<constraint>` block (2–4 rules) → `## When to Use` → `## Core Patterns` (tables, code, durable anchors) → `## Key Decisions` → `## Gotchas` → `## References`.

## AI-optimization rules

Critical constraints at START, gotchas at END (U-shaped attention). Tables for comparisons, bullets for sequences — no prose paragraphs. Every claim carries a durable anchor (below). Positive framing ("Use `const`, not `var`"). Code blocks from actual source. No slop ("important to note", inflated adjectives). `| Good | Bad | Why |` tables for fragile rules.

## Durable anchors (what the emitted body cites)

A generated skill outlives the commit it was written at, so bare `file:line` anchors rot on the next edit and then mislead. Emit the durable form instead:

```text
`<path>` — `<symbol or config key>` — <one-line purpose> (verify: `<command that re-derives it>`)
```

- Convert every 2b `file:line` note to this grammar; line numbers survive ONLY inside clearly-fictional teaching examples (paths that don't exist in the project).
- Volatile facts (versions, counts, thresholds, ports, flag defaults) always carry their `verify:` command — a reader re-derives before relying.
- Include one stale-tolerance line in each generated body: "Pointers here name concepts, not coordinates — if a path or symbol has moved, trust the stated purpose and re-locate it (grep the symbol) before acting."
- Self-check before handing to Phase 6: `grep -nE '[A-Za-z0-9_./-]+\.[a-z]{1,5}:[0-9]+'` over the drafted files; any hit whose path exists in the project is a live line anchor — convert it.

## Codex + Claude frontmatter rules

Generated skills must load in both Codex and Claude Code:

| Rule | Why |
|---|---|
| Quote every `description` string | YAML treats `: ` as a mapping and `#` as a comment in plain scalars |
| Keep `description` ≤1024 chars | Codex rejects longer descriptions |
| Avoid `<` and `>` in `description` | Codex skill validation rejects angle brackets |
| Put concrete triggers first | The body loads only after the skill triggers |
| Move enumerations to `references/` | Prevent overlong descriptions and session-listing bloat |

```yaml
# BAD — invalid YAML
description: Use when editing routes: checkout, account, webhook.

# GOOD — one YAML string, under the hard cap
description: "Use when editing checkout routes, STRIPE_WEBHOOK_SECRET handling, CartExpiredError, order state transitions, or pnpm seed:orders fixtures. Not for generic React UI work."
```

## Maintenance skill (if proposed)

Prefer the plugin-provided `docks:skill-maintenance`. Create a local `skill-maintenance` only for project-specific behavior not covered by the plugin. If proposed: `pattern: reviewer`, body ≤100 lines, quoted description ≤1024 chars. Workflow: identify modified files → cross-reference skill `source_files` → update affected skills → bump `metadata.updated` ONLY when the skill's meaning changed (normalized body or any `references/*.md` differs). Re-running on an unchanged skill MUST be a no-op. Describe checks as inline read/search/list steps — do NOT reference kit-internal validators, which don't ship to downstream projects.

## Output (write under `## Phase 3: Skills Plan`)

Per skill, a delimited block: `### File: .claude/skills/<name>/SKILL.md` + full content, then each `### File: .../references/<topic>.md` + content.

## Gotcha

| Gotcha | Fix |
|---|---|
| Body restates what the model already knows ("TypeScript is typed…") | Cut — the body is for project-specific knowledge only |
| `name:` ≠ directory name | Rename so they match (kebab-case) — guards fail otherwise |
| Touching AGENTS.md / CLAUDE.md | Out of scope here — use the `multi-tool-bridge` skill |
| Unquoted description with `: ` or `#` | Quote it before the plan reaches approval — Codex will skip the skill |
