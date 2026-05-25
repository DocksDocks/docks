# Authoring agents (plugins/docks/agents/)

Agents are **Claude-only** (Codex does not consume plugin-shipped subagents). This folder holds only two: `plan-manager` and `plan-review` — thin opus-tier wrappers around their cross-tool skills, for inter-agent `Agent(subagent_type=…)` dispatch. Each agent is a flat `<name>.md` file (the plugin manifest auto-discovers at depth-1 and rejects an `agents` subdir field).

<constraint>
Run `bash scripts/ci.sh` after any agent change — must be green before commit. Structural gate: `bash scripts/guard-agents.sh`. Quality: `bash scripts/score-agents.sh --per-file` (max 15, per-file floor 14). The per-file ≥14 floor mechanically requires 2 `<constraint>` blocks per agent.
</constraint>

## Description (CSO)

1. **Lead with "Use when …"** AND **include a "Not …" exclusion clause** (prevents delegation collisions) — the guard requires both.
2. **≥80 and ≤500 chars** for scorer credit.
3. Concrete triggers; for auto-firing agents add "Use proactively …".
4. No slop words (`comprehensive`/`robust`/`elegant`/`seamless`).

## Frontmatter

| Field | Rule |
|---|---|
| `name` | required; ≤64 chars, `[a-z0-9-]+`, matches filename; must NOT contain `anthropic`/`claude` |
| `description` | required; must contain a "Not …" clause; ≤500 for full credit |
| `model` | `sonnet`/`opus`/`haiku`/full-ID/`inherit`. Resolution: env `CLAUDE_CODE_SUBAGENT_MODEL` → per-invocation → frontmatter → parent |
| `tools` | allowlist (omitted = inherit ALL parent tools); `disallowedTools` is a denylist |
| other | `permissionMode`, `maxTurns`, `skills` (preloaded), `memory`, `effort`, `isolation: worktree`, `color` |

For **plugin-shipped agents**, `hooks`, `mcpServers`, and `permissionMode` are silently ignored for security — use `.claude/agents/` (not the plugin) when you need those.

## Body (≤500; sweet spot 60–300)

Same patterns as skills (`<constraint>` blocks — up to 2 rewarded — lookup tables, BAD/GOOD, gotchas, validation loop). Structure: context-acknowledgment as step 1, then `## Workflow`, `## Output Format`, `## Anti-Hallucination Checks`, `## Success Criteria`.

## Sources

- Subagents: <https://code.claude.com/docs/en/sub-agents>
- Plugins reference: <https://code.claude.com/docs/en/plugins-reference>
