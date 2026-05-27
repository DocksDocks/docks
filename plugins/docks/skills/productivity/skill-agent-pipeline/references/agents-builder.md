# Phase 5 — Agents Builder

> Cross-tool. Drafts the Claude `.claude/agents/*.md` for each agent; its Codex `.codex/agents/*.toml` twin comes from `codex-agents-builder.md`. Run both — every agent ships in both forms.

Assemble complete agent file content (frontmatter + system prompt) for every create/update/regenerate action from the Role Mapper, using Pattern Extractor content for the bodies.

<constraint>
Before writing system-prompt content that references a library / framework / external API, fetch current docs (context7 `resolve-library-id` → `query-docs`, plus official docs). Agent prompts persist across sessions; a hallucinated API propagates to every future interaction that agent handles.
</constraint>

## Agent frontmatter

```yaml
---
name: kebab-case-name
description: <CSO, 3rd person, ≤1024 chars, includes scope exclusion>
tools: <minimal — only what the agent needs>
model: opus
maxTurns: 100
---
```

## System prompt structure (100–200 lines, excl. frontmatter)

`# Role` → one-sentence summary → `<constraint>` (3–5 rules) → `## Context` (skill Read pointers) → `## Workflow` (numbered) → `## Patterns` (code w/ file:line) → `## Integration` (hand-offs) → `## Gotchas`.

## AI-optimization rules

Constraints at START, gotchas at END. Bullets/tables, no prose. Every claim has a `file:line` OR a skill reference. Positive framing. Codebase code only. No slop. `| Good | Bad | Why |` tables for complex rules. Skill-reference paths MUST be Phase 3 proposed paths.

## Special actions

| Action | Handling |
|---|---|
| regenerate | draft fresh file; back up original to `<name>.md.bak` (note in output) |
| delete | draft a stub with `disable-model-invocation: true` + empty description — do NOT omit the file |

## Output (write under `## Phase 5: Agents Plan`)

Per agent: `### File: .claude/agents/<name>.md` + full content; then its Codex `.codex/agents/<name>.toml` twin per `codex-agents-builder.md` (for an `Agent`-dispatching agent the `.toml` still ships — note the `agents.max_depth: 1` single-level-dispatch caveat).

## Gotcha

| Gotcha | Fix |
|---|---|
| System prompt >200 lines | Move detail into the referenced skills; the prompt is a workflow guide |
| Skill ref to a removed path | Use Phase 3 proposed paths only |
