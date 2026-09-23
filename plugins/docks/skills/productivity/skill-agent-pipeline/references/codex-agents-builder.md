# Phase 5 (companion) — Codex Agents Builder

> Cross-tool. For every agent the Role Mapper (4a) proposed, emit a Codex
> `.codex/agents/<name>.toml` ALONGSIDE the Claude `.claude/agents/<name>.md`
> from `agents-builder.md`. Same logical agent, two on-disk forms.

<constraint>
One agent per TOML file at `.codex/agents/<name>.toml` (project scope; `~/.codex/agents/` is personal). The `name` field is the identity and the source of truth; match the filename to it (the simplest convention). Every file must define `name`, `description`, and `developer_instructions`. A file without all three is invalid.
</constraint>

<constraint>
An agent whose Claude `tools` include `Agent` still ports. Emit the `.toml` and put its delegation rules in `developer_instructions`: name the built-in `worker` / `explorer` or a custom agent to spawn. Codex delegates when the prompt or the applicable `AGENTS.md` / skill instructions ask for it. The Codex docs name no key that limits nesting depth, and they do not say whether a spawned agent can spawn its own children. Do not write a depth key, and do not label the agent unportable. In the Phase 5 output, flag nested delegation (a child that delegates again) as a point the user must verify.
</constraint>

## Contents

- [Codex `.codex/agents/*.toml` schema](#codex-codexagentstoml-schema)
- [Claude → Codex field translation](#claude--codex-field-translation)
- [Worked example](#worked-example)
- [Output](#output-append-under--phase-5-agents-plan-beside-each-claude-md)
- [Gotcha](#gotcha)
- [Sources](#sources)

## Codex `.codex/agents/*.toml` schema

| Key | Required | Type | Allowed / notes |
|---|---|---|---|
| `name` | yes | string | identity; match filename |
| `description` | yes | string | "when to use this agent" (the Claude CSO carries over) |
| `developer_instructions` | yes | string | the system prompt; TOML triple-quoted `"""…"""`; no documented length cap |
| `model` | no | string | see model map below; omit → resolved from the spawn request, then `[agents]` defaults, then the parent session |
| `model_reasoning_effort` | no | string | `"low"` / `"medium"` / `"high"` / `"xhigh"` / `"max"` / `"ultra"` — a level the selected model advertises (levels depend on the model and client); omit by default |
| `sandbox_mode` | no | string | `"read-only"` / `"workspace-write"` / `"danger-full-access"`; omit → inherits the parent |
| `mcp_servers` | no | table | pass through only what the source agent already declares |
| `skills.config` | no | array of tables | `[[skills.config]]` (`path` + `enabled`) is the per-skill enable/DISABLE switch — Codex auto-discovers skills from `.agents/skills` (CWD→repo-root walk); it does NOT "wire" a skill to an agent |

An agent file can also set other `config.toml` keys; it is a config layer for the spawned session. Emit only the keys above.

## Claude → Codex field translation

| Claude (`.claude/agents/*.md`) | Codex (`.codex/agents/*.toml`) | Rule |
|---|---|---|
| `name` | `name` | 1:1 (kebab-case) |
| `description` (CSO, 3rd person) | `description` | 1:1 |
| markdown system-prompt body | `developer_instructions` | wrap in `"""…"""` |
| `tools` incl. `Edit`/`Write` | `sandbox_mode = "workspace-write"` | agent writes files |
| `tools` read-only (`Read`/`Glob`/`Grep`) | `sandbox_mode = "read-only"` | |
| `tools` incl. `Agent` | delegation rules in `developer_instructions` (built-in `worker`/`explorer` or a custom agent) | no documented depth key; flag nested delegation for the user to verify |
| `tools` incl. destructive `Bash` | never auto `danger-full-access` | surface for user to opt in |
| `maxTurns` (turn cap) | (drop) | the Codex docs name no per-agent turn cap |
| `model` | `model` | per the model map |
| — | `model_reasoning_effort` | set it when you set `model` (see Gotcha); else omit |

### Model map (defaults — confirm per project)

| Claude `model` | Codex `model` | Note |
|---|---|---|
| `opus` | `gpt-6-sol` | docs: start here for demanding agents; `gpt-6-astra` (most capable, not in Codex cloud) only if the project pins it |
| `sonnet` | `gpt-6-sol` | docs: start with Sol for most tasks |
| `haiku` | `gpt-6-luna` | fast, lower-cost; narrow, repeatable work |
| `inherit` / absent | omit `model` | inherits (spawn value → `[agents]` default → parent session) |

Current Codex model IDs: `gpt-6-sol`, `gpt-6-luna`, `gpt-6-astra`.

Retired or deprecated in Codex with ChatGPT sign-in — never emit them: `gpt-5.5` (retires 2026-10-14), `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`, `gpt-5.2`. The GPT-5.6 Sol / Terra / Luna models stay available only during the GPT-6 rollout; do not emit them either.

If the project pins a Codex model in `config.toml` (`model` or `agents.default_subagent_model`), prefer that over the default map.

## Worked example

Claude `.claude/agents/explorer.md` frontmatter — `name: explorer`, `description: "Use when gathering evidence before a change. Not for editing."`, `tools: Read, Glob, Grep`, `model: sonnet`; body = the system prompt.

Codex `.codex/agents/explorer.toml`:

```toml
name = "explorer"
description = "Use when gathering evidence before a change. Not for editing."
model = "gpt-6-sol"
model_reasoning_effort = "medium"
sandbox_mode = "read-only"
developer_instructions = """
<the Claude agent's markdown system-prompt body, verbatim>
"""
```

A custom agent named `explorer` takes precedence over the built-in `explorer`. Rename the agent if the project still wants the built-in one.

## Output (append under `### Phase 5: Agents Plan`, beside each Claude `.md`)

The Phase 5 subheading is inside `## Research`. Use `####` or lower for every block inside it; never write a `##` heading (the plan helper rejects it).

Per agent: `#### File: .codex/agents/<name>.toml`, then put the full TOML in a fenced block whose fence is longer than any fence inside the content (for example four backticks). For an `Agent`-dispatching agent, STILL emit the `.toml`; add a one-line note that names the child agents its `developer_instructions` delegate to, and flag nested delegation for the user to verify.

## Gotcha

| Gotcha | Fix |
|---|---|
| `description` with a bare `:`/`#` left unquoted in TOML | TOML strings need quotes — `description = "…"`; triple-quote the instructions |
| Guessing a Codex model not in the current list | Use the model map / the project's pinned model; never invent an ID |
| Setting `model` without `model_reasoning_effort` | The agent keeps the effort resolved before the file applies; the new model may not support it. Set both (docs start points: `medium` for `gpt-6-sol`, `high` for `gpt-6-luna`, `low` for `gpt-6-astra`) |
| Writing `sandbox_mode = "danger-full-access"` automatically | Never auto-select it — surface and let the user opt in |
| Trusting `sandbox_mode = "read-only"` as a hard limit | Codex reapplies the parent turn's live sandbox and approval overrides (`/permissions`, `--yolo`) when it spawns a child, even over the agent file. Say so in the Phase 5 output |
| Labeling an `Agent`-dispatching agent "not portable" | Emit the `.toml`, put delegation in `developer_instructions`, flag only nested delegation |

## Sources

Codex facts checked against the official docs on 2026-09-23. The `developers.openai.com/codex/*` URLs redirect to `learn.chatgpt.com/docs/*`. Re-verify here before you edit the schema, translation, or model tables above:

- <https://developers.openai.com/codex/subagents> — custom agent schema: required `name`/`description`/`developer_instructions`; other `config.toml` keys allowed (`model`, `model_reasoning_effort`, `sandbox_mode`, `mcp_servers`, `skills.config`); built-in `default`/`worker`/`explorer`; one agent per file; project `.codex/agents/` vs personal `~/.codex/agents/`; model and effort resolution order; parent runtime overrides reapplied to children; `[agents]` keys (`enabled`, `max_concurrent_threads_per_session`, `default_subagent_model`, `default_subagent_reasoning_effort`, `interrupt_message`).
- <https://developers.openai.com/codex/config-reference> — `model_reasoning_effort` ("such as `low`, `medium`, `high`, `xhigh`, `max`, or `ultra`"; levels depend on the model and client); `sandbox_mode` type `read-only | workspace-write | danger-full-access`.
- <https://developers.openai.com/codex/sandbox> — sandbox modes and approval policy (redirects to the "Agent approvals & security" page).
- <https://developers.openai.com/codex/models> — current IDs `gpt-6-sol`, `gpt-6-luna`, `gpt-6-astra`; `gpt-5.5` retires 2026-10-14; `gpt-5.4`/`gpt-5.4-mini` retired 2026-08-31; `gpt-5.2`/`gpt-5.3-codex` deprecated (all for ChatGPT sign-in).
- <https://developers.openai.com/codex/skills> — Codex discovers agentskills.io skills from `.agents/skills` (CWD→repo-root walk); `[[skills.config]]` in `config.toml` enables/disables them.
- <https://code.claude.com/docs/en/sub-agents> — the source Claude `.claude/agents/*.md` frontmatter (`name`/`description`/`tools`/`model`/`maxTurns`) this translation reads from. Claude's own subagent nesting rule is a Claude-side fact; do not carry it over to Codex.

The docks kit's own CI (author-side, not shipped) pins this file to hard-coded sets: the current and retired model IDs, the `model_reasoning_effort` and `sandbox_mode` value sets, and a ban on undocumented keys. It does not fetch the docs. When the docs change, update this file and the guard sets together.
