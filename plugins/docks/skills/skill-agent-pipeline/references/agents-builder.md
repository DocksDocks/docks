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
maxTurns: 100   # volatile key — re-verify against the sub-agents doc (code.claude.com/docs/en/sub-agents) before emitting
---
```

Omit `model` by default. Claude Code defaults a missing `model` to `inherit`, and omp falls back to the parent session model, so omission is the only spelling both runtimes agree on. omp treats any literal — `inherit` included — as a model ID, so the spawn dies with "No model selected"; a pinned model ID also goes stale. Add `model` only when the user pins one; the value then feeds the Codex model map in `codex-agents-builder.md` (absent → omit `model` there too).

## System prompt structure (100–200 lines, excl. frontmatter)

`# Role` → one-sentence summary → `<constraint>` (3–5 rules) → `## Context` (skill Read pointers) → `## Workflow` (numbered) → `## Patterns` (code w/ file:line) → `## Integration` (hand-offs) → `## Gotchas`.

## AI-optimization rules

Constraints at START, gotchas at END. Bullets/tables, no prose. Every claim has a `file:line` OR a skill reference. Positive framing. Codebase code only. No slop. `| Good | Bad | Why |` tables for complex rules. Skill-reference paths MUST be Phase 3 proposed paths.

## Special actions

| Action | Handling |
|---|---|
| regenerate | draft fresh file; back up original to `<name>.md.bak` (note in output) |
| delete | list the file under "files to delete" in the plan with the reason; remove it in Phase 7 only after explicit user approval |

## Output (write under `### Phase 5: Agents Plan`)

Write this subheading inside `## Research`. Use `####` or lower for every block inside it; never write a `##` heading (the plan helper rejects it).

Per agent: `#### File: .claude/agents/<name>.md`, then put the full content in a fenced block whose fence is longer than any fence inside the content (for example four backticks), so the plan helper ignores the file's own `##` headings; then its Codex `.codex/agents/<name>.toml` twin per `codex-agents-builder.md` (for an `Agent`-dispatching agent the `.toml` still ships — put its delegation in `developer_instructions` and flag nested delegation for the user to verify).

## Gotcha

| Gotcha | Fix |
|---|---|
| System prompt >200 lines | Move detail into the referenced skills; the prompt is a workflow guide |
| Skill ref to a removed path | Use Phase 3 proposed paths only |
