---
name: codex-plugin-mirror
description: Use when adding Codex distribution to an existing Claude Code plugin — reads .claude-plugin/plugin.json and marketplace.json, generates parallel .codex-plugin/plugin.json and .agents/plugins/marketplace.json with translated schema, drops fields Codex plugins don't support (commands, subagents references), keeps versions in sync. Idempotent. Not for project-level skills setup (use plan-init or multi-tool-bridge) or porting Claude subagent files to .codex/agents/ TOML (separate concern).
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-06-14"
---

# Codex Plugin Mirror

Add Codex distribution alongside an existing Claude Code plugin by generating Codex-schema manifests that point at the same `skills/` directory. The result: one source of truth for skill content, parallel manifest files for each tool's plugin loader, and clear surfacing of features that don't port (slash commands, Claude subagents).

Scope note (verified 2026-06-10 against the openai/codex source): Codex natively discovers `.claude-plugin/plugin.json` as an alternate manifest path (`DISCOVERABLE_PLUGIN_MANIFEST_PATHS` in `codex-rs/utils/plugins/src/plugin_namespace.rs`), so a Claude plugin is loadable by Codex even with no `.codex-plugin/` directory. The mirror is NOT what makes the plugin discoverable — its value is (a) the Codex marketplace catalog (`.agents/plugins/marketplace.json`), (b) a Codex-tailored `description` + `interface` block with explicit "(skills only)" degradation surfacing, and (c) version lockstep across all four manifest files.

<constraint>
All paths are RELATIVE to the project working directory at invoke time. Never write to absolute kit paths or to a different project. If `git rev-parse --show-toplevel` succeeds, prefer that as the project root; otherwise use the current working directory.
</constraint>

<constraint>
Idempotency is the recovery mechanism. For each target (`.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`), check existence and CONTENT match FIRST. If a file exists AND its version/key fields already match the current Claude manifest, SKIP. Re-running on an already-mirrored project must be a complete no-op for in-sync targets.
</constraint>

<constraint>
Detection is read-only. Before any write, parse both Claude manifests with Read, compute the translation, and present the action table. Only after the table is shown (and approved for first-time creation) do you switch to Write. Never write blindly.
</constraint>

<constraint>
Always surface feature-surface degradation. If the source Claude plugin ships slash commands (`plugins/<name>/commands/*.md`) or subagents (`plugins/<name>/agents/*.md`), Codex installation WILL NOT include them — Codex plugins bundle Skills, Apps, MCP servers, and Hooks only. Count what's dropped, name it in the report, and reflect it in the Codex `description` field (e.g., "(skills only)").
</constraint>

## When to Use

- Adding Codex distribution to a repo that already ships a Claude Code plugin
- Re-syncing versions after a release that touched only `.claude-plugin/` files
- The user says "mirror the plugin for Codex", "add .codex-plugin/", or invokes `/docks:codex-plugin-mirror`

## Workflow

### Step 1 — Detect source manifests

```bash
test -f .claude-plugin/marketplace.json   && echo "OK marketplace"   || echo "MISSING marketplace.json (cannot mirror)"
# Plugin manifests can be at root or per-plugin (monorepo). Enumerate:
```

Use `Glob("**/.claude-plugin/plugin.json")` (capped to depth 4, exclude `node_modules`/`.git`). If zero matches → STOP with "no Claude plugin manifest found; nothing to mirror." If multiple matches → handle each as a separate mirror (one Codex plugin manifest per Claude plugin manifest).

### Step 2 — Parse both manifests

`Read` each `.claude-plugin/plugin.json` and the root `.claude-plugin/marketplace.json`. Validate JSON (`Bash("jq . <path>")` if `jq` is available, else manual `Read` + visual check). Extract these fields for translation:

| From plugin.json | Carry into Codex plugin.json |
|---|---|
| `name`, `version`, `description`, `author`, `license`, `keywords`, `homepage`, `repository` | All preserved 1:1 |
| `commands/` references (if any) | Drop — Codex plugins don't ship commands |
| `agents/` references (if any) | Drop — Codex plugins don't ship subagents |
| `mcpServers` | Carry if present (Codex supports MCP) |

### Step 3 — Detect feature-surface degradation

Count what won't ship in Codex:

```bash
ls plugins/<name>/commands/*.md 2>/dev/null | wc -l   # slash commands → DROPPED
ls plugins/<name>/agents/*.md   2>/dev/null | wc -l   # Claude subagents → DROPPED
ls plugins/<name>/skills/*/SKILL.md 2>/dev/null | wc -l   # skills → PORTED
```

If any commands or agents exist, add an explicit "(skills only)" suffix to the Codex plugin's `description` field so users installing in Codex see the subset upfront. Don't pretend feature parity.

### Step 4 — Build action table

```
| Target                                         | Action          | Reason                                |
|------------------------------------------------|-----------------|---------------------------------------|
| plugins/docks/.codex-plugin/plugin.json        | CREATE          | not present                           |
| .agents/plugins/marketplace.json               | CREATE          | not present                           |
| plugins/docks/description (Codex side)         | APPEND "(skills only)" | source ships commands + agents |
| Versions                                       | SYNC 0.3.0      | source plugin.json v0.3.0             |
```

### Step 5 — Approval gate

If any row is CREATE or has version-bumping behavior, present the table and wait for user approval. For pure version-sync updates on already-mirrored files (UPDATE), no gate needed — proceed.

### Step 6 — Apply

For each plugin manifest:

1. **Write `.codex-plugin/plugin.json`** at the same depth as the source `.claude-plugin/plugin.json`. Use `references/codex-plugin-template.md` as the structural scaffold; fill in fields from Step 2's translation.

2. **Write `.agents/plugins/marketplace.json`** at the repo root. Use `references/codex-marketplace-template.md`. The marketplace lists every Codex plugin (the array mirrors `.claude-plugin/marketplace.json`'s `plugins` array, schema-translated).

3. **`mkdir -p`** the target directories if they don't exist (`.codex-plugin/`, `.agents/plugins/`).

### Step 7 — Verify

```bash
# Both Codex JSONs parse
jq . plugins/<name>/.codex-plugin/plugin.json     >/dev/null && echo "plugin.json ok"
jq . .agents/plugins/marketplace.json             >/dev/null && echo "marketplace.json ok"

# Versions agree across the four files
v_claude_plugin=$(jq -r .version plugins/<name>/.claude-plugin/plugin.json)
v_codex_plugin=$(jq -r .version plugins/<name>/.codex-plugin/plugin.json)
v_claude_market=$(jq -r '.plugins[0].version' .claude-plugin/marketplace.json)
v_codex_market=$(jq -r '.plugins[0].version' .agents/plugins/marketplace.json 2>/dev/null || echo "n/a")
echo "$v_claude_plugin = $v_codex_plugin = $v_claude_market = $v_codex_market ?"
```

If versions disagree, STOP — report which file is out of sync. Never claim "mirrored" with version drift.

### Step 8 — Report + next-step guidance

1. Files created / updated (full paths)
2. Feature-surface degradation count (dropped commands, dropped subagents, ported skills)
3. Version sync state
4. Reminder to update CI (`scripts/ci.sh` or equivalent) to validate the new manifests on every release
5. Reminder to update the release script (`release.sh`) to bump BOTH `.claude-plugin/` and `.codex-plugin/` files in lockstep

## Common Traps

| Trap | Wrong fix | Right fix |
|---|---|---|
| Framing the mirror as required for Codex discovery | "Without .codex-plugin/ Codex can't see the plugin" | Codex discovers `.claude-plugin/plugin.json` natively (verified 2026-06-10) — pitch the mirror as marketplace catalog + Codex-tailored interface + version lockstep |
| Codex plugin description claims feature parity | Copy Claude description verbatim | Append "(skills only)" when source ships commands or subagents Codex won't include |
| Marketplace JSON schema confusion (Claude's `source: "./path"` vs Codex's `source: {source: "local", path: "./path"}`) | Naive string copy | Build the Codex `source` object explicitly per the Codex docs |
| Versions drift between `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` after a release | Bump only one file | Step 7 verification catches drift; release.sh should bump all four files |
| Generating Codex manifests in a repo with no `.claude-plugin/` | Treat empty plugin source as greenfield | STOP in Step 1 — this skill needs a Claude plugin as input, not a project skeleton |
| Translating `mcpServers` block incorrectly | Assume Claude's inline MCP config copies to Codex's `mcpServers: "./path-to-mcp-json"` | Read Codex's plugin-manifest reference; both tools point at `./.mcp.json` by convention — preserve the path |
| Auto-creating `.codex-plugin/` for a `plugins/<name>/` that doesn't have its own `.claude-plugin/` | Mirror a non-existent source | Step 1's Glob skips plugin dirs without manifests |
| Dropping `keywords` because Codex schema doesn't show them | Lossy translation | Codex plugin schema DOES support `keywords` — preserve them |

## Anti-Hallucination Checks

- Before reporting "mirrored", `jq . <each-Codex-file>` must exit 0 (or manual JSON-validity inspection if `jq` is unavailable)
- Versions must match across `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and both marketplace files — verify with explicit comparison in Step 7
- Do not claim "Codex plugin ready" without confirming the source `skills/` directory exists at the path the manifest references
- The "feature-surface degradation count" must come from real `Glob`/`ls` results in this turn, not from memory of the plugin's structure
- `git status --short` after must show exactly the paths this skill wrote — investigate any other entries

## References

- `references/codex-plugin-template.md` — verbatim Codex plugin.json scaffold (with field-by-field translation notes from Claude source)
- `references/codex-marketplace-template.md` — verbatim Codex marketplace.json scaffold (`.agents/plugins/marketplace.json`)
- Companion: when the user wants AGENTS.md + `.agents/skills/` symlink bridge in a consumer project (not a plugin distribution mirror), use the `multi-tool-bridge` skill instead. This skill is plugin-author-specific.
- External: [Codex Plugins — Build docs](https://developers.openai.com/codex/plugins/build) — canonical Codex manifest schema reference.
