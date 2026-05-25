# Phase 3 — Skills Builder

Draft complete `SKILL.md` bodies and `references/` files for every delta the categorizer proposed, using Phase 2b's `file:line` evidence.

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
description: Use when <triggers>. Covers <5+ project-specific identifiers>.
user-invocable: false
metadata:
  pattern: tool-wrapper
  source_files: ["<paths that inform this skill>"]
  updated: "<today>"
---
```

## Body structure (≤310 lines, then split)

Title → `<constraint>` block (2–4 rules) → `## When to Use` → `## Core Patterns` (tables, code, file:line) → `## Key Decisions` → `## Gotchas` → `## References`.

## AI-optimization rules

Critical constraints at START, gotchas at END (U-shaped attention). Tables for comparisons, bullets for sequences — no prose paragraphs. Every claim has a `file:line`. Positive framing ("Use `const`, not `var`"). Code blocks from actual source. No slop ("important to note", inflated adjectives). `| Good | Bad | Why |` tables for fragile rules.

## Maintenance skill (if proposed)

`pattern: reviewer`, body ≤100 lines. Workflow: identify modified files → cross-reference skill `source_files` → update affected skills → bump `metadata.updated` ONLY when the skill's meaning changed (normalized body or any `references/*.md` differs). Re-running on an unchanged skill MUST be a no-op. Describe checks as inline read/search/list steps — do NOT reference kit-internal validators (`guard-skills.sh`, `score-skills.sh`), which don't ship to downstream projects.

## Output (write under `## Phase 3: Skills Plan`)

Per skill, a delimited block: `### File: .claude/skills/<name>/SKILL.md` + full content, then each `### File: .../references/<topic>.md` + content.

## Gotcha

| Gotcha | Fix |
|---|---|
| Body restates what the model already knows ("TypeScript is typed…") | Cut — the body is for project-specific knowledge only |
| `name:` ≠ directory name | Rename so they match (kebab-case) — guards fail otherwise |
| Touching AGENTS.md / CLAUDE.md | Out of scope here — use the `agents` bridge skill |
