# Phase 5 (companion) — Codex Agents Builder

> Cross-tool. For every agent the Role Mapper (4a) proposed, emit a Codex
> `.codex/agents/<name>.toml` ALONGSIDE the Claude `.claude/agents/<name>.md`
> from `agents-builder.md`. Same logical agent, two on-disk forms.

<constraint>
One agent per TOML file at `.codex/agents/<name>.toml` (project scope; `~/.codex/agents/` is personal). The `name` field is the identity — match it to the filename. Required keys: `name`, `description`, `developer_instructions`. A file missing any of the three is invalid and Codex ignores it.
</constraint>

<constraint>
`Agent`-tool dispatch ports ONE level. Codex allows a direct child agent by default (`agents.max_depth: 1`; root = depth 0), so a Claude agent whose `tools` include `Agent` for single-level dispatch DOES translate — emit the `.toml` and route its delegation to a built-in `worker`/`explorer` (or a custom child agent). What the default cap blocks is DEEPER nesting — a child that spawns its own children (depth ≥ 2); raising `agents.max_depth` enables it, at the fan-out/latency/cost penalty Codex deliberately warns about. Surface the depth caveat in the Phase 5 output — do not label the agent unportable.
</constraint>

## Codex `.codex/agents/*.toml` schema

| Key | Required | Type | Allowed / notes |
|---|---|---|---|
| `name` | yes | string | identity; match filename |
| `description` | yes | string | "when to use this agent" (the Claude CSO carries over) |
| `developer_instructions` | yes | string | the system prompt; TOML triple-quoted `"""…"""`; no documented length cap |
| `model` | no | string | see model map below; omit → inherits parent session |
| `model_reasoning_effort` | no | string | `"minimal"`/`"low"`/`"medium"`/`"high"`/`"xhigh"` (`"none"` is no longer in this set — it survives only on `plan_mode_reasoning_effort`; `xhigh` is the ceiling — Claude's `max` maps to `xhigh`, per Codex's own external-agent migration); omit by default |
| `sandbox_mode` | no | string | `"read-only"` / `"workspace-write"` / `"danger-full-access"` |
| `nickname_candidates` | no | string[] | Codex-only display names; omit |
| `mcp_servers` | no | table | pass through only what the source agent already declares |
| `skills.config` | no | array of tables | `[[skills.config]]` (`path` + `enabled`) is the per-skill enable/DISABLE switch — Codex auto-discovers skills from `.agents/skills` (CWD→repo-root walk); it does NOT "wire" a skill to an agent |

## Claude → Codex field translation

| Claude (`.claude/agents/*.md`) | Codex (`.codex/agents/*.toml`) | Rule |
|---|---|---|
| `name` | `name` | 1:1 (kebab-case) |
| `description` (CSO, 3rd person) | `description` | 1:1 |
| markdown system-prompt body | `developer_instructions` | wrap in `"""…"""` |
| `tools` incl. `Edit`/`Write` | `sandbox_mode = "workspace-write"` | agent writes files |
| `tools` read-only (`Read`/`Glob`/`Grep`) | `sandbox_mode = "read-only"` | |
| `tools` incl. `Agent` (single-level dispatch) | built-in `worker`/`explorer` child + `agents.max_depth ≥ 1` | one dispatch level ports (default `max_depth: 1`); only deeper nesting is capped — note it, don't call it unportable |
| `tools` incl. destructive `Bash` | never auto `danger-full-access` | surface for user to opt in |
| `maxTurns` (turn cap) | (drop — no analog) | Codex has no per-agent turn count; `agents.job_max_runtime_seconds` is a wall-clock timeout for `spawn_agents_on_csv` workers, not a turn cap |
| `model` | `model` | per the model map |
| — | `model_reasoning_effort` / `nickname_candidates` | optional Codex-only; omit unless asked |

### Model map (confirmed: `opus → gpt-5.5`; the rest are defaults — confirm per project)

| Claude `model` | Codex `model` | Note |
|---|---|---|
| `opus` | `gpt-5.5` | frontier tier (confirmed) |
| `sonnet` | `gpt-5.4` | mainline standard — absorbed the codex line at 5.4 (alt `gpt-5.3-codex`, being sunset) — project-configurable |
| `haiku` | `gpt-5.4-mini` | mini tier — project-configurable |
| `inherit` / absent | omit `model` | inherits the parent Codex session |

Valid Codex model IDs: `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`, `gpt-5.3-codex-spark`, `gpt-5.2` (`gpt-5.3-codex` and `gpt-5.2` are now flagged deprecated on the models page — historical mentions only, never recommend them in emitted TOML; mainline 5.4+ absorbed the codex tuning). If the project pins a Codex model in `config.toml`, prefer that over the default map.

## Worked example

Claude `.claude/agents/explorer.md` frontmatter — `name: explorer`, `description: "Use when gathering evidence before a change. Not for editing."`, `tools: Read, Glob, Grep`, `model: sonnet`; body = the system prompt.

Codex `.codex/agents/explorer.toml`:

```toml
name = "explorer"
description = "Use when gathering evidence before a change. Not for editing."
model = "gpt-5.4"
sandbox_mode = "read-only"
developer_instructions = """
<the Claude agent's markdown system-prompt body, verbatim>
"""
```

## Output (append under `## Phase 5: Agents Plan`, beside each Claude `.md`)

Per agent: `### File: .codex/agents/<name>.toml` + full TOML. For an `Agent`-dispatching agent, STILL emit the `.toml`; add a one-line note that single-level dispatch maps to a Codex `worker`/`explorer` child under `agents.max_depth: 1`, and flag only if it needs deeper nesting.

## Gotcha

| Gotcha | Fix |
|---|---|
| `description` with a bare `:`/`#` left unquoted in TOML | TOML strings need quotes — `description = "…"`; triple-quote the instructions |
| Guessing a Codex model not in the valid list | Use the model map / the project's pinned model; never invent an ID |
| Writing `sandbox_mode = "danger-full-access"` automatically | Never auto-select it — surface and let the user opt in |
| Labeling an `Agent`-dispatching agent "not portable" | One dispatch level ports (Codex `agents.max_depth: 1`) — emit the `.toml`, route delegation to `worker`/`explorer`, flag only deeper-than-1 nesting |

## Sources

Codex facts confirmed against the official docs (2026-05-27; effort set + model map re-verified 2026-07-05 against the live docs) — re-verify here before editing the schema / translation / model tables above:

- <https://developers.openai.com/codex/subagents> — `.codex/agents/*.toml` schema: required `name`/`description`/`developer_instructions`; optional keys; built-in `default`/`worker`/`explorer`; one agent per file; project `.codex/agents/` vs personal `~/.codex/agents/`.
- <https://developers.openai.com/codex/config-reference> — `agents.max_depth` (default 1 → single-level child dispatch ports, deeper nesting capped), `agents.max_threads` (6), `agents.job_max_runtime_seconds` (1800, `spawn_agents_on_csv` wall-clock), `model_reasoning_effort` set (`minimal`/`low`/`medium`/`high`/`xhigh`).
- <https://developers.openai.com/codex/sandbox> — canonical `sandbox_mode` values (`read-only`/`workspace-write`/`danger-full-access`).
- <https://developers.openai.com/codex/models> — valid model IDs (`gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`, `gpt-5.3-codex-spark`, `gpt-5.2`).
- <https://developers.openai.com/codex/skills> — Codex discovers agentskills.io skills from `.agents/skills` (CWD→repo-root walk); `[[skills.config]]` in `config.toml` enables/disables them.
- <https://code.claude.com/docs/en/sub-agents> — the source Claude `.claude/agents/*.md` frontmatter (`name`/`description`/`tools`/`model`/`maxTurns`) this translation reads from; note Claude's own one-level subagent limit is a Claude-side fact that does NOT transfer to Codex, which dispatches one level via `agents.max_depth: 1`.

These model-id / `sandbox_mode` / `model_reasoning_effort` sets and the `agents.max_depth` fact are pinned to the canonical Codex sources above and verified in CI, so this doc can't silently drift.
