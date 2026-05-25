# Phase 4b — Pattern Extractor (Claude Code only)

> Claude-specific. Produces agent system-prompt content. Skip on Codex / other runtimes.

Extract concrete patterns, workflows, and constraints for each proposed agent role's system prompt — referencing skills rather than inlining their content.

<constraint>
Reference, do not duplicate. Instead of inlining 150 lines of route patterns, write "Read `.claude/skills/api-context/references/routes.md` for the full pattern." The system prompt is a workflow guide, not a knowledge dump. Inlined skill content rots the moment the skill changes.
</constraint>

## Per agent role candidate — extract 7 dimensions

Derive role candidates independently from the Phase 3 Skills Plan (don't wait for the Role Mapper — Phase 4 reconciles in Phase 5).

| Dimension | Content |
|---|---|
| Critical constraints | non-negotiable rules for `<constraint>` blocks |
| Workflow steps | numbered procedure with conditions/branching |
| Key file paths | files the agent reads/writes (concrete, from Phase 2b) |
| Patterns with code | short excerpts with `file:line` refs |
| Gotchas | concrete failure scenarios — what breaks, how, why silently |
| Skill references | which SKILL.md + references/ to read (Phase 3 paths; explicit Read instruction) |
| Integration points | when to hand off, to which agent |

## Sizing

Target 100–200 lines per agent system prompt (excl. frontmatter). Flag any role that would exceed 200.

## Output (write under `## Phase 4b: Pattern Extractor Content`)

Per role: `### Agent: <name>`, estimated size, then the 7 dimensions as labeled blocks (see the agent-builder reference for the assembled shape).

## Gotcha

| Gotcha | Fix |
|---|---|
| Inlining a skill's body into the prompt | Replace with a Read pointer to the Phase 3 path |
| Skill ref to a pre-existing path | Confirm the path is in the Phase 3 Skills Plan, not just on disk |
