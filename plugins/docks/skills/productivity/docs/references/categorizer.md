# Phase 2a — Skills Categorization

Audit every existing skill and propose the full skill-set delta: create / update / split / merge / refresh / rewrite-description.

<constraint>
CSO identifier rule: every proposed description must start `Use when…` and contain ≥5 identifiers specific to THIS project — exported names, config keys, env vars, error types, CLI commands, route patterns, version-specific symptom synonyms. Generic phrases ("module boundaries", "error propagation", "API integration", "database operations") count for nothing. A description failing this is rewritten before approval.
</constraint>

## Audit each existing skill (5 checks)

| Check | Trigger → action |
|---|---|
| Size | SKILL.md >500 lines → split; <50 lines, no references/, <3 claims → merge into nearest sibling |
| Staleness | source file changed since `metadata.updated` (check git history per `source_files` entry) → refresh |
| Coverage | a Phase-1 knowledge area with no skill's `source_files` covering it → new skill |
| CSO | description not `Use when…` or <5 project identifiers → rewrite-description |
| Deleted source | `source_files` paths that no longer exist → remove from array |

## Design new skills

For each uncovered knowledge area large enough to warrant one: name (kebab-case), description (≥5 identifiers), body plan (section outline), references plan (files + target sizes), `source_files` list. Use standard domains only when they fit (`architecture-context`, `conventions-context`, `api-context`, `testing-context`, `dependencies-context`, `deployment-context`, `data-context`). Too small → explicit "too small to warrant a skill" decision with reason.

## Maintenance skill rule

If Phase 0 reported no `skill-maintenance` skill, always propose creating `.claude/skills/skill-maintenance/SKILL.md` (`pattern: reviewer`, `user-invocable: false`). If it exists but frontmatter drifted, propose a fix.

## Output (write under `## Phase 2a: Categorizer Proposals`)

`Skill Audit` (per skill: 5-check results + action + reason) · `New Skill Proposals` · `Existing Skill Modifications` · `Maintenance Skill` · `Skipped Knowledge Areas`.

## Gotcha

| Gotcha | Fix |
|---|---|
| Proposing agent-role changes here | Phase 4 owns roles; mixing scopes corrupts the Phase 3 builder's `source_files` |
| Accepting a description with generic terms | Re-count project identifiers; <5 → rewrite before approval |
