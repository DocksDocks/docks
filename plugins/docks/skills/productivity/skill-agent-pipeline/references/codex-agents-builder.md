# Phase 5 (companion) — Codex Agents Builder

> Cross-tool. For every agent the Role Mapper (4a) proposed, emit a Codex
> `.codex/agents/<name>.toml` ALONGSIDE the Claude `.claude/agents/<name>.md`
> from `agents-builder.md`. Same logical agent, two on-disk forms.

<constraint>
One agent per TOML file at `.codex/agents/<name>.toml` (project scope; `~/.codex/agents/` is personal). The `name` field is the identity — match it to the filename. Required keys: `name`, `description`, `developer_instructions`. A file missing any of the three is invalid and Codex ignores it.
</constraint>

<constraint>
`Agent`-tool dependency does NOT port. Codex subagents cannot spawn subagents. If the source Claude agent's `tools` include `Agent` (its purpose is inter-agent dispatch), still emit the `.md`, but for the `.toml` SURFACE the limitation to the user — do not write a `.toml` that silently can't do the agent's core job. Note it in the Phase 5 output, don't drop it silently.
</constraint>

## Codex `.codex/agents/*.toml` schema

| Key | Required | Type | Allowed / notes |
|---|---|---|---|
| `name` | yes | string | identity; match filename |
| `description` | yes | string | "when to use this agent" (the Claude CSO carries over) |
| `developer_instructions` | yes | string | the system prompt; TOML triple-quoted `"""…"""`; no documented length cap |
| `model` | no | string | see model map below; omit → inherits parent session |
| `model_reasoning_effort` | no | string | `"medium"` / `"high"` (agent-file scope); omit by default |
| `sandbox_mode` | no | string | `"read-only"` / `"workspace-write"` / `"danger-full-access"` |
| `nickname_candidates` | no | string[] | Codex-only display names; omit |
| `mcp_servers` | no | table | pass through only what the source agent already declares |
| `skills.config` | no | array of tables | `[[skills.config]]` with `path` + `enabled`; point at Phase-3 skill paths |

## Claude → Codex field translation

| Claude (`.claude/agents/*.md`) | Codex (`.codex/agents/*.toml`) | Rule |
|---|---|---|
| `name` | `name` | 1:1 (kebab-case) |
| `description` (CSO, 3rd person) | `description` | 1:1 |
| markdown system-prompt body | `developer_instructions` | wrap in `"""…"""` |
| `tools` incl. `Edit`/`Write` | `sandbox_mode = "workspace-write"` | agent writes files |
| `tools` read-only (`Read`/`Glob`/`Grep`) | `sandbox_mode = "read-only"` | |
| `tools` incl. `Agent` | — (no equivalent) | **hard-warn**; emit `.md` only-faithfully, surface the gap |
| `tools` incl. destructive `Bash` | never auto `danger-full-access` | surface for user to opt in |
| `maxTurns` | (drop) | no per-agent equivalent (global `agents.job_max_runtime_seconds`) |
| `model` | `model` | per the model map |
| — | `model_reasoning_effort` / `nickname_candidates` | optional Codex-only; omit unless asked |

### Model map (confirmed: `opus → gpt-5.5`; the rest are defaults — confirm per project)

| Claude `model` | Codex `model` | Note |
|---|---|---|
| `opus` | `gpt-5.5` | frontier tier (confirmed) |
| `sonnet` | `gpt-5.3-codex` | coding-tuned standard (alt `gpt-5.4`) — project-configurable |
| `haiku` | `gpt-5.4-mini` | mini tier — project-configurable |
| `inherit` / absent | omit `model` | inherits the parent Codex session |

Valid Codex model IDs: `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`, `gpt-5.3-codex-spark`, `gpt-5.2`. If the project pins a Codex model in `config.toml`, prefer that over the default map.

## Worked example

Claude `.claude/agents/explorer.md` frontmatter — `name: explorer`, `description: "Use when gathering evidence before a change. Not for editing."`, `tools: Read, Glob, Grep`, `model: sonnet`; body = the system prompt.

Codex `.codex/agents/explorer.toml`:

```toml
name = "explorer"
description = "Use when gathering evidence before a change. Not for editing."
model = "gpt-5.3-codex"
sandbox_mode = "read-only"
developer_instructions = """
<the Claude agent's markdown system-prompt body, verbatim>
"""
```

## Output (append under `## Phase 5: Agents Plan`, beside each Claude `.md`)

Per agent: `### File: .codex/agents/<name>.toml` + full TOML. For an `Agent`-tool-dependent agent, instead write `### Codex: <name> — NOT PORTABLE` + the one-line reason, so the gate surfaces it.

## Gotcha

| Gotcha | Fix |
|---|---|
| `description` with a bare `:`/`#` left unquoted in TOML | TOML strings need quotes — `description = "…"`; triple-quote the instructions |
| Guessing a Codex model not in the valid list | Use the model map / the project's pinned model; never invent an ID |
| Writing `sandbox_mode = "danger-full-access"` automatically | Never auto-select it — surface and let the user opt in |
| Emitting a `.toml` for an `Agent`-tool dispatcher | Surface "not portable"; the Claude `.md` stays the canonical form |
