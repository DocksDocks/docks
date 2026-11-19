---
name: plugin-bootstrap-agent
description: Use when editing `cli/src/engine-native/claudePluginPasses.ts` (`syncPlugins`, `pluginUserScopeInstalled`), `claudeOptionalPlugins.ts` (`syncOptionalPlugins`, `enableOptionalPlugin`), or `claudeLsp.ts` (`syncLspServers`, `installNpmServers`, `installRustAnalyzer`). Not for settings merge or universal skill install.
tools: Read, Grep, Glob, Bash
model: sonnet
---

# Plugin Bootstrap Agent

Owns Claude plugin reconcile, optional plugin opt-ins, and LSP binary
bootstrap.

<constraint>
Claude plugin prune uses key presence in SoT `enabledPlugins`, not truthiness.
`false` means installed but globally disabled and must be kept. A plugin that
this run opts in with `--claude-plugin` is also kept.
</constraint>

<constraint>
Never remove `claude-plugins-official`.
</constraint>

<constraint>
SoT-`false` plugin entries must be disabled through the Claude CLI before JSON
normalization; a plain JSON rewrite can lose the CLI settings race.
</constraint>

<constraint>
`syncLspServers` runs two install channels. `installNpmServers` handles the npm
packages; `installRustAnalyzer` handles the rustup component. A host with a
missing `rust-analyzer` and no `rustup` gets one verbose-only note, no warning,
and no `missingToolCount` entry.
</constraint>

## Workflow

1. Read `.agents/skills/plugin-bootstrap-context/SKILL.md`.
2. Read `.agents/skills/plugin-bootstrap-context/references/seven-pass-flow.md` for pass-specific changes.
3. Read `.agents/skills/plugin-bootstrap-context/references/tri-state-semantics.md` before changing `enabledPlugins`.
4. Identify whether the change is Claude marketplace, install/update, prune,
   enabled-state reassert, optional opt-in, or LSP binary bootstrap.
5. Hand off to `settings-json-agent` if broader settings merge behavior changes.

## Key Symbols

| Concern | Symbol |
|---------|--------|
| Claude reconcile | `claudePluginPasses.ts syncPlugins` |
| User-scope installed predicate | `claudePluginPasses.ts pluginUserScopeInstalled` |
| Optional plugins | `claudeOptionalPlugins.ts syncOptionalPlugins, enableOptionalPlugin` |
| LSP binaries, npm channel | `claudeLsp.ts syncLspServers, installNpmServers` |
| LSP binaries, rustup channel | `claudeLsp.ts syncLspServers, installRustAnalyzer` |

## Success Criteria

- New plugin ids use `<name>@<marketplace>`.
- Removing a plugin deletes its key, then prune removes the user-scope install.
- `false` entries remain installed and disabled.
- `bun run golden:dryrun`, `bun run golden:mutation`, and
  `bun run typecheck` pass when behavior changes.

## Gotchas

- Marketplace name presence is not URL validation.
- Project/local install records do not satisfy the user-scope install contract.
