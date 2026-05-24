---
title: Dual-emit Codex .toml agents from /docs
status: planned
goal: Translate every project-level Claude .md agent into a Codex .toml at .agents/agents/, symlinked from .codex/agents/, via the extended agents bridge skill
created: 2026-05-24
updated: 2026-05-24
started_at: null
assignee: null
blockers: []
blocked_reason: null
blocked_since: null
ship_commit: null
tags: [codex, agents, docs-command, bridge]
affected_paths:
  - plugins/docks/skills/productivity/agents/SKILL.md
  - plugins/docks/skills/productivity/agents/references/codex-agent-translation.md
  - plugins/docks/agents/docs-agents-builder.md
  - plugins/docks/agents/docs-verifier.md
  - plugins/docks/commands/docs.md
  - scripts/guard-codex-agents.sh
  - scripts/guard-codex-symlinks.sh
  - scripts/ci.sh
related_plans: [foundation-categorization-scoring, skill-maintainer-fixes, tree-skill]
review_status: null
---

# Dual-emit Codex .toml agents from /docs

## Goal

Extend `/docs` so every Claude `.md` agent it generates gets a Codex `.toml` mirror. Canonical TOML files live at `.agents/agents/<name>.toml`; `.codex/agents/<name>.toml` is a symlink to the canonical (so Codex's native auto-discovery picks them up transparently). The existing `agents` bridge skill extends to manage these symlinks the same way it already manages `.claude/skills/` ↔ `.agents/skills/`. Model fields are deliberately omitted (Codex uses session defaults); orchestration agents and internal forked-* wrappers are deliberately skipped (no cross-tool equivalent for `Agent(subagent_type=…)` dispatch or `context: fork`).

## Context

Today the project-level `/docs` command writes `.claude/agents/<name>.md` and stops. Codex users on the same project only see the cross-tool skills. Adding the `.toml` mirror lets them dispatch named subagents by hand ("spawn the docs-explorer agent on this branch"). The Builder-Verifier orchestration commands stay Claude-only — Codex has no `Agent(subagent_type=…)` equivalent.

**Why `.agents/agents/` as canonical.** Codex auto-discovers `.codex/agents/<name>.toml` at the project level. It does NOT auto-discover `.agents/agents/` (there's an [open proposal](https://github.com/openai/codex/issues/5881) to standardize `.agents` alongside `.codex` but it isn't merged). The symlink bridge sidesteps this: canonical TOML files live at `.agents/agents/<name>.toml`; `.codex/agents/<name>.toml` is a symlink. Codex follows the symlink transparently and reads the canonical file. Same pattern this repo already runs for `.claude/skills/` ↔ `.agents/skills/`. Zero new convention.

**Why model names are dropped.** Locked decision: no Codex model mapping. Translated agents omit `model` and `model_reasoning_effort` so Codex uses session defaults. Simpler, no model-rename maintenance, no ongoing translation churn when Codex versions land.

**Why orchestration agents are skipped.** Builder-Verifier commands rely on `Agent(subagent_type=…)` and `Skill(context: fork)`. Codex has neither. Translating an orchestration agent would create false equivalence — the agent would exist on the Codex side but never be invoked the same way. Surface in the `/docs` report, don't translate.

## Steps

| # | Task | Depends | Parallel | Status | Owner |
|---|---|---|---|---|---|
| 1 | Extend `agents` bridge skill (Step 4b — bridge `.agents/agents/` → `.codex/agents/` symlinks; same safety as skills bridge) | — | with #2 | planned | self |
| 2 | Add `plugins/docks/skills/productivity/agents/references/codex-agent-translation.md` with the contract table | — | with #1 | planned | self |
| 3 | Add `docs-codex-agent-translator` helper (or extend `docs-agents-builder` Phase 5) — emits TOML per non-skipped agent | 1, 2 | — | planned | self |
| 4 | Update `/docs` Phase 5 to plan TOML emissions alongside `.md` | 3 | with #5 | planned | self |
| 5 | Update `/docs` Phase 8 to write TOML and trigger bridge symlinking | 3 | with #4 | planned | self |
| 6 | Add `scripts/guard-codex-agents.sh` — TOML parses, required fields present, `developer_instructions` ≥80 chars | 5 | with #7 | planned | self |
| 7 | Add `scripts/guard-codex-symlinks.sh` — every `.codex/agents/*.toml` is a symlink that resolves | 5 | with #6 | planned | self |
| 8 | Update `/docs` Phase 6 Verifier — re-run translator, diff against on-disk TOML; mismatch means `.md` was edited but TOML wasn't regenerated | 3 | — | planned | self |
| 9 | `bash scripts/ci.sh` green with new guards | 6, 7, 8 | — | planned | self |
| 10 | `./scripts/release.sh minor` (new `/docs` capability) | 9 | — | planned | self |

### Step details

- **#1** — Mirror the existing skills bridge logic: detect, classify, propose, await approval, write. If `.codex/agents/<name>.toml` is already a symlink to the correct target → SKIP. If it's a real file → ABORT and ask the user (never silently overwrite).
- **#2** — Translation contract:
  | Claude `.md` | Codex `.toml` | Notes |
  |---|---|---|
  | `name:` frontmatter | `name = "..."` | direct |
  | `description:` frontmatter | `description = "..."` | direct |
  | markdown body | `developer_instructions = """ ... """` | escape `"""` if present in body |
  | `model:` | (omitted) | Codex uses session defaults — locked decision |
  | `tools:` allowlist | (omitted) | Codex agents inherit parent sandbox |
  | `permissionMode:` | `sandbox_mode = "read-only"` *iff* read-only-like | best-effort; default omit |
  | `mcpServers:` | `[mcp_servers.<name>]` TOML table | direct if present |
  | `disable-model-invocation: true` | skip generation | stub on Claude side; no Codex equivalent needed |
  | orchestration agents (dispatched via `Agent(subagent_type=…)`) | skip generation | surface in `/docs` report |
  | `internal/forked-*` | skip generation | `context: fork` is Claude-only |
- **#3** — Generated TOML has a top-of-file source comment:
  ```toml
  # Generated from .claude/agents/<name>.md by /docs on YYYY-MM-DD.
  # Source of truth: edit the .md file and re-run /docs to regenerate.
  name = "..."
  description = "..."
  developer_instructions = """
  ...
  """
  ```
- **#6** — TOML parse via `python3 -c 'import tomllib; tomllib.load(open(sys.argv[1], "rb"))'` (Python 3.11+).
- **#8** — Phase 6 check catches drift: someone edits the .md and forgets to regenerate. Translator output should match on-disk TOML byte-for-byte (minus the generation timestamp comment).

## Acceptance criteria

- [ ] `.agents/agents/<name>.toml` exists for every non-skipped Claude `.md` agent after `/docs` runs
- [ ] Every `.codex/agents/<name>.toml` is a symlink that resolves through to `.agents/agents/`
- [ ] `scripts/guard-codex-agents.sh` green
- [ ] `scripts/guard-codex-symlinks.sh` green — no real files in `.codex/agents/`
- [ ] `/docs` Phase 6 fails if a Claude `.md` was edited without TOML regeneration
- [ ] Codex session can spawn a translated agent by name (manual smoke-test in dogfood)
- [ ] `bash scripts/ci.sh` green

## Out of scope

- Model name translation. No mapping table; translated agents omit `model` and `model_reasoning_effort`
- Orchestration command translation. `/docs`, `/refactor`, `/security` stay Claude-only
- Internal `forked-*` agent translation. `context: fork` is Claude-only
- Plugin-bundled agent distribution. Codex plugin manifests don't accept `agents` — translation is project-local only
- A parallel `.agents/agents/<name>.md` canonical for the Claude side. Defer until agents.md spec extends to subagents

## Mistakes & Dead Ends

(none yet — plan freshly written)

## Sources

- https://developers.openai.com/codex/subagents — Codex subagent TOML schema, required fields (name/description/developer_instructions), optional model/sandbox_mode/mcp_servers
- https://developers.openai.com/codex/plugins/build — confirms Codex plugin manifest does NOT accept `agents` (only skills/mcpServers/apps), so translation must be project-local
- https://github.com/openai/codex/issues/5881 — `.agents` workspace standardization proposal (not merged); informs why symlinks are needed today
- `plugins/docks/skills/agents/SKILL.md` (repo) — the bridge pattern this extends
- `plugins/docks/agents/docs-agents-builder.md` (repo) — Phase 5 brief this extends

## Blockers

(none — actionable after foundation-categorization-scoring and skill-maintainer-fixes land)

## Notes

- Open questions:
  - Extend the existing `agents` skill or create a sibling `codex-agents-bridge` skill? Lean: extend `agents` — symmetry with skills bridge is obvious; one skill easier than two.
  - Codex plugin manifest may gain an `agents` field in the future. Design the translator so it could later emit into the plugin instead of the project (with a flag)?
  - `.agents/agents/` becomes a tree node automatically once tree-skill ships. Coordinate so the node describes the translation contract concisely.
- Locked decisions reaffirmed here: drop `model` field; skip orchestration agents; skip forked-* internal agents.
- Codex surface after this: skills (already cross-tool) + named subagents. Orchestration commands remain Claude-only.

## Review

(filled by plan-review on completion)
