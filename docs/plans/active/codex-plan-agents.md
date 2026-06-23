---
title: Add repo-local Codex plan lifecycle agents
goal: Add project-scoped Codex custom agents that mirror the repo's Claude plan-manager and plan-review wrappers, then document the plugin-vs-project-agent boundary.
status: in_review
created: "2026-06-23T19:52:26-03:00"
updated: "2026-06-23T19:52:26-03:00"
started_at: "2026-06-23T19:52:26-03:00"
in_review_since: "2026-06-23T19:52:26-03:00"
assignee: null
tags: [codex, agents, plans]
affected_paths:
  - .codex/agents/plan-manager.toml
  - .codex/agents/plan-review.toml
  - AGENTS.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
related_plans: []
review_status: null
planned_at_commit: 1e56d8995ac0438472b317858a9b225e4e684d3f
---

# Add repo-local Codex plan lifecycle agents

## Goal

Give Codex the same focused plan-lifecycle delegation surface this repo already gives Claude Code, without pretending Codex plugins can ship subagents. The outcome is two project-local `.codex/agents/*.toml` wrappers for Docks maintainers, plus docs and skill wording that make the runtime boundary explicit.

## Context

Current Codex docs support project-scoped custom agents in `.codex/agents/`, with required `name`, `description`, and `developer_instructions`; Codex subagents are enabled by default but only spawn when explicitly requested. This repo ships Claude-only plan lifecycle wrappers in `plugins/docks/agents/`, while the Codex plugin manifest ships skills and hooks only. That means the right Codex equivalent is repo-local `.codex/agents`, not plugin payload.

## Steps

| # | Task | Depends | Status |
|---|---|---|---|
| 1 | Add `.codex/agents/plan-manager.toml` and `.codex/agents/plan-review.toml` with narrow descriptions, appropriate `model` / `model_reasoning_effort`, `sandbox_mode = "workspace-write"`, and `developer_instructions` that load the canonical plan skills instead of duplicating their full bodies. | -- | done |
| 2 | Update root `AGENTS.md` so the repository map distinguishes plugin-shipped Claude agents from project-local Codex agent equivalents, and makes clear that `.codex/agents` is for working on this repo rather than part of the installable plugin payload. | 1 | done |
| 3 | Update `plan-manager/SKILL.md` dispatch wording so auto-review via `plan-review` covers both Claude `Agent(subagent_type=...)` and Codex custom-agent dispatch when a project `.codex/agents/plan-review.toml` exists; keep inline execution as the fallback. Bump `metadata.updated` and resync `content_hash`. | 1 | done |
| 4 | Verify the TOML parses, the plan-manager skill hash is synchronized, and the full repo gate passes. | 1,2,3 | done |

## Acceptance criteria

- `.codex/agents/plan-manager.toml` and `.codex/agents/plan-review.toml` parse as TOML and each contain `name`, `description`, and `developer_instructions`.
- Root `AGENTS.md` states that `plugins/docks/agents/` remains Claude plugin payload, while `.codex/agents/` is a repo-local Codex convenience layer.
- `plan-manager/SKILL.md` no longer describes completion-review dispatch as Claude-only when a Codex custom agent is available.
- `node scripts/skills/content-hash.mjs --check-only` exits 0 after the plan-manager hash update.
- `node scripts/ci.mjs` exits 0.

## Out of scope

- Adding Codex agents to the plugin manifest; current Codex plugin docs list skills, apps, MCP servers, and hooks, not plugin-shipped subagents.
- Porting every plugin-shipped Claude agent pattern to consumer projects; `skill-agent-pipeline` already emits `.codex/agents/*.toml` for generated project agents.
- Changing plan lifecycle semantics, frontmatter fields, or the docs/plans contract template.

## STOP conditions

- If current Codex rejects project `.codex/agents/*.toml` with the documented required keys, stop and leave the plan in review with the exact parser error.
- If `node scripts/ci.mjs` fails outside the touched scope, do not broaden the fix; report the unrelated failure.

## Self-review

Score: 91/100 - trajectory 87->91 - stopped: single critique pass.

- Actionability: 18/20. Each step has a file-level done condition; Step 4 names concrete commands.
- Dependency order: 15/15. The docs and skill wording depend on the two new agent files existing.
- Evidence re-verify: 15/15. Sources below were opened this session and line references point at the specific claims.
- Goal coverage: 14/15. The plan gives Codex a repo-local equivalent for the Claude plan wrappers without changing installable plugin semantics.
- Checkable acceptance: 10/10. TOML parse, hash check, and CI are executable.
- Failure mode: 10/15. STOP conditions cover parser and CI failure; low risk because this adds isolated project config.
- Assumption to question: 9/10. No open question remains: docs define the right boundary, and the implementation can stay scoped.

## Sources

- `/tmp/openai-docs-cache/codex-manual.md:12375` - Codex subagents are enabled by default.
- `/tmp/openai-docs-cache/codex-manual.md:12382` - Codex only spawns subagents when explicitly asked, so adding files does not auto-delegate work.
- `/tmp/openai-docs-cache/codex-manual.md:12442` - project-scoped custom agents live under `.codex/agents/`.
- `/tmp/openai-docs-cache/codex-manual.md:12451` - custom agents require `name`, `description`, and `developer_instructions`.
- `/tmp/openai-docs-cache/codex-manual.md:10723` - Codex plugins are for shared workflows; local iteration can use local configuration first.
- `AGENTS.md:15` - current repo map marks `plugins/docks/agents/` as Claude-only wrappers.
- `AGENTS.md:42` - root docs already state Codex does not consume plugin-shipped subagents.
- `plugins/docks/.codex-plugin/plugin.json:21` - Codex plugin currently ships skills plus hooks, not agents.
- `plugins/docks/agents/plan-manager.md:10` - Claude plan-manager wrapper delegates to the canonical plan-manager skill.
- `plugins/docks/agents/plan-review.md:10` - Claude plan-review wrapper delegates to the canonical plan-review skill.
- `plugins/docks/skills/productivity/plan-manager/SKILL.md:74` - plan-manager already recognizes `.codex/agents/<name>.toml` as a project agent resolution path.
- `plugins/docks/skills/productivity/plan-manager/SKILL.md:121` - completion-review dispatch wording currently names Claude explicitly.

## Review

(filled by plan-review on completion)
