# Embedded Template — `.codex-plugin/plugin.json`

Verbatim scaffold to write at `<plugin-root>/.codex-plugin/plugin.json` when mirroring a Claude Code plugin to Codex. Substitute `{{VAR}}` placeholders with values translated from the source `.claude-plugin/plugin.json`. See the Codex plugin-build docs for the canonical schema: <https://developers.openai.com/codex/plugins/build>.

```json
{
  "name": "{{NAME}}",
  "version": "{{VERSION}}",
  "description": "{{DESCRIPTION_WITH_SKILLS_ONLY_SUFFIX_IF_DEGRADED}}",
  "author": {{AUTHOR_OBJECT}},
  "homepage": "{{HOMEPAGE}}",
  "repository": "{{REPOSITORY}}",
  "license": "{{LICENSE}}",
  "keywords": {{KEYWORDS_ARRAY}},
  "skills": "./skills/",
  "interface": {
    "displayName": "{{NAME}}",
    "shortDescription": "{{SHORT_DESC_120_CHAR_MAX}}",
    "category": "Productivity"
  }
}
```

## Field-by-field translation from Claude `plugin.json`

| Codex field | Source (Claude plugin.json) | Translation rule |
|---|---|---|
| `name` | `name` | Verbatim (kebab-case, ≤64 chars per Codex spec) |
| `version` | `version` | Verbatim — versions must stay in lockstep |
| `description` | `description` | Append " (skills only)" if source plugin ships commands or subagents Codex won't include |
| `author` | `author` | Verbatim (Codex accepts the same `{ "name": "...", "email": "...", "url": "..." }` shape) |
| `homepage` | `homepage` | Verbatim |
| `repository` | `repository` | Verbatim |
| `license` | `license` | Verbatim |
| `keywords` | `keywords` | Verbatim (JSON array of short strings) |
| `skills` | (derived) | Always `"./skills/"` — both tools read the same directory inside the plugin |
| `interface.displayName` | `name` | Use the plugin name; user can later rebrand for marketplace listing |
| `interface.shortDescription` | first 120 chars of `description` | Trim — Codex's listing shows shortDescription in tighter UI |
| `interface.category` | `category` (if present in Claude marketplace.json) | Otherwise default to "Productivity" |

## Fields the mirror DROPS

| Source field / dir | Reason |
|---|---|
| `commands/` (Claude `plugins/<name>/commands/*.md`) | Codex plugins don't include slash commands |
| `agents/` (Claude `plugins/<name>/agents/*.md`) | Codex plugins don't include subagents — separate concern, format mismatch (TOML vs MD) |
| `tags` (from Claude marketplace.json plugin entry) | No Codex equivalent; use `keywords` for searchability |

## Optional Codex-only fields

These can be added to the Codex manifest if/when the user wants to ship additional Codex-specific features:

- `mcpServers: "./.mcp.json"` — if the plugin includes MCP server configs
- `apps: "./.app.json"` — if integrating Codex's App connector system (Gmail, Slack, etc.)
- `hooks: "./hooks/hooks.json"` — if the plugin defines Codex-specific lifecycle hooks
- `interface.brandColor`, `interface.composerIcon`, `interface.logo`, `interface.screenshots` — branding for marketplace UI

The base mirror skill leaves these out; add them in a follow-up edit if needed.

## Worked example (docks)

Source `plugins/docks/.claude-plugin/plugin.json` snippet:

```json
{
  "name": "docks",
  "description": "Multi-agent pipeline kit for Claude Code — 3 Builder-Verifier commands…",
  "version": "0.3.0",
  "author": { "name": "Eduardo Marquez" },
  "license": "MIT",
  "keywords": ["pipeline", "multi-agent", "skills", "agents", "security", "refactor", "test", "review"]
}
```

Mirrored `plugins/docks/.codex-plugin/plugin.json`:

```json
{
  "name": "docks",
  "version": "0.3.0",
  "description": "Multi-agent pipeline kit (skills only) — 25 portable engineering-convention skills covering test-first / coverage / fix workflows, code review, SOLID, React patterns, dep-vuln triage, design tokens, and more.",
  "author": { "name": "Eduardo Marquez" },
  "homepage": "https://github.com/DocksDocks/docks",
  "repository": "https://github.com/DocksDocks/docks",
  "license": "MIT",
  "keywords": ["pipeline", "multi-agent", "skills", "agents", "security", "refactor", "test", "review"],
  "skills": "./skills/",
  "interface": {
    "displayName": "docks",
    "shortDescription": "25 portable engineering-convention skills (skills only).",
    "category": "Productivity"
  }
}
```

The description was rewritten to (a) drop the "Builder-Verifier commands" mention (those don't ship in Codex), (b) reflect the actual skill count, (c) signal the subset to Codex users browsing the marketplace.
