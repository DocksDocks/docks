# AGENTS.md

docks is a cross-tool engineering skill kit and plugin marketplace. It ships **skills** for any agentskills.io-compliant runtime (Codex, Claude Code, OpenCode, VS Code Copilot), including three sequential **pipeline skills** — `security`, `refactor`, and `skill-agent-pipeline` — that fold what used to be Claude-only Builder-Verifier slash commands into a single-context, runtime-portable form. Each pipeline runs its phases in order, keeps per-phase expertise in `references/`, and gates approval through the `docs/plans/` lifecycle instead of Plan Mode. The only Claude-specific extras are two thin plan-lifecycle subagents (`plan-manager`, `plan-review`).

This root file stays **repo-wide**. Per-area authoring details — skill/agent frontmatter, scoring, the release flow, CI triggers — live in nested `AGENTS.md` nodes, loaded lazily when you work in that folder. See **Context tree** below for the map.

## Repository scope

```
.
├── plugins/docks/                    plugin payload (shipped to consumers)
│   ├── .claude-plugin/plugin.json    Claude plugin manifest
│   ├── .codex-plugin/plugin.json     Codex plugin manifest (skills + hooks — near-parity with Claude)
│   ├── skills/   (cross-tool)        surfaced in every runtime — incl. security/refactor/skill-agent-pipeline pipelines
│   ├── agents/   (Claude-only)       plan-manager + plan-review thin opus plan-lifecycle wrappers
│   └── hooks/    (cross-tool)        context-tree-nudge PostToolUse hook (Claude + Codex)
├── .claude-plugin/marketplace.json   Claude marketplace catalog
├── .agents/plugins/marketplace.json  Codex marketplace catalog
├── .agents/skills/                   project-local skills (canonical, multi-tool)
├── .claude/skills/                   Claude Code-visible symlinks → ../../.agents/skills/
├── docs/plans/                       5-category lifecycle planning (bootstrapped by plan-init skill)
├── scripts/                          plugin-author tooling (NOT shipped to consumers)
└── .github/workflows/                gh-side CI on PR + tag push
```

## Context tree

Per-area conventions load lazily from nested `AGENTS.md` nodes. Each is paired with a one-line `CLAUDE.md` (`@AGENTS.md`) because Claude Code descends `CLAUDE.md`, not `AGENTS.md`. Drill into the node for the local rules — this root carries only repo-wide concerns:

| Node | Covers |
|---|---|
| `docs/plans/AGENTS.md` | plan frontmatter schema, lifecycle transitions, 3-tier pretty-print contract |
| `docs/scaffold/AGENTS.md` | scaffold spec + templates — what the `scaffold` skill seeds into new projects |
| `plugins/docks/skills/AGENTS.md` | skill authoring — description CSO, frontmatter, body rules, scoring |
| `scripts/AGENTS.md` | validators, edit→release workflow, double-layer gating, versioning |
| `.github/AGENTS.md` | CI trigger model, keep-in-sync with `ci.sh` |

The `context-tree` skill (`plugins/docks/skills/productivity/context-tree/`) scaffolds, audits, and refreshes these nodes; `scripts/tree/guard.sh` enforces the pair convention in CI.

## Authoring agents (Claude-only)

Agents are **Claude-only** (Codex does not consume plugin-shipped subagents). `plugins/docks/agents/` holds only two — `plan-manager` and `plan-review`, thin opus-tier wrappers around their cross-tool skills for inter-agent `Agent(subagent_type=…)` dispatch. Each is a flat `agents/<name>.md`.

The `agents/` folder deliberately carries **no context-tree node** (hence its absence from the table above): `claude plugin validate` lints every `*.md` under `agents/` as a subagent, so an `AGENTS.md`/`CLAUDE.md` pair there fails `validate --strict` with "No frontmatter". Neither relocating the files into a subdir nor declaring an `agents` array in the manifest avoids that scan (both tried and ruled out). These authoring rules therefore live in this root file instead of a nested node.

- **Description (CSO):** lead with "Use when …" AND include a "Not …" exclusion clause (both required by `scripts/agents/guard.sh`); ≥80 and ≤500 chars; concrete triggers; no slop words.
- **Frontmatter:** `name` (required, kebab-case, matches filename, no `anthropic`/`claude` substring); `description` (required, with the "Not …" clause); `model` (`sonnet`/`opus`/`haiku`/full-ID/`inherit` — resolution: env `CLAUDE_CODE_SUBAGENT_MODEL` → per-invocation → frontmatter → parent); `tools` (allowlist; omitted = inherit all). For plugin-shipped agents, `hooks`/`mcpServers`/`permissionMode` are silently ignored for security — use `.claude/agents/` when you need those.
- **Body (≤500; sweet spot 60–300):** same patterns as skills (`<constraint>` blocks — up to 2 rewarded — lookup tables, BAD/GOOD, gotchas, validation loop); structure as context-acknowledgment (step 1), then `## Workflow`, `## Output Format`, `## Anti-Hallucination Checks`, `## Success Criteria`.
- **No author-script refs (consumer-safety):** a plugin-shipped agent body must not name docks plugin-author scripts (`scripts/ci.sh`, `scripts/skills/*`, `scripts/agents/*`, `scripts/tree/*`, …) as a step — they don't ship to a consumer's project. Refer to "the project's CI / validators, if present", or make the check self-contained. `scripts/skills/no-author-scripts.sh` scans agent bodies alongside shipped skills.
- **Validators:** `bash scripts/agents/guard.sh` (structural) + `bash scripts/agents/score.sh --per-file` (max 15, per-file floor 14 — mechanically needs 2 `<constraint>` blocks); both run inside `scripts/ci.sh`. Floors detailed in `scripts/AGENTS.md`.
- **Sources:** [sub-agents](https://code.claude.com/docs/en/sub-agents) · [plugins-reference](https://code.claude.com/docs/en/plugins-reference).

## Plans

<constraint>
Multi-commit work plans live in `docs/plans/{planned,ongoing,blocked,scheduled,finished}/`. Every plan file is a complete handoff document — `goal`, structured `Steps`, `Mistakes & Dead Ends`, `Sources`, `Review` — so any agent can pick one up cold without conversation context. Skills handle every operation: `plan-init` (bootstrap), `plan-manager` (list/show/resume/start/new/fire/ship), `plan-review` (verification). Trigger by natural language ("create docs/plans", "list plans", "review plan <slug>") or the matching `plan-*` skill directly. Every category is multi-occupancy.
</constraint>

The full convention (frontmatter schema, body section order, 3-tier pretty-print contract, category-specific age tokens like `2d in flight` / `blocked 47d` / `shipped 4d ago`) lives in `docs/plans/AGENTS.md` (cross-tool source of truth). Claude agents `plan-manager` and `plan-review` exist as thin opus-tier wrappers around their skills, for inter-agent `Agent(subagent_type=...)` dispatch — not for direct user invocation.

## Project-local skills

The repo's own `.agents/skills/` hosts skills useful only when working ON this plugin repo — they don't ship to consumers:

- **`codex-plugin-mirror`** — translates Claude plugin manifests (`.claude-plugin/plugin.json` + `marketplace.json`) into the Codex parallel forms (`.codex-plugin/plugin.json` + `.agents/plugins/marketplace.json`). Invoked when releasing a new version.

Claude Code sees these via the symlinks under `.claude/skills/`. Codex sees them directly at `.agents/skills/`.

## Tool-agnostic rules

- Run `bash scripts/ci.sh` before any commit — guards + scorers must be green
- Don't loosen validator floors to pass; fix the file instead
- Manifest version numbers stay in lockstep across `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and the versioned Claude marketplace catalog — `release.sh` enforces this
- Skill bodies stay ≤500 lines per agentskills.io spec; sweet spot 80–310

## Security

- Don't expose secrets in plugin manifests, marketplace catalogs, or scripts
- Don't perform destructive git operations (force-push, hard reset, branch delete) without explicit user confirmation
- Treat third-party plugin sources and downloaded artifacts as untrusted

## What does NOT belong in this repo

- Consumer-side env vars / permissions / RTK config — those live in [DocksDocks/public](https://github.com/DocksDocks/public)
- `disable-claudeai-connectors.sh` — same reason, it's an opinionated user-machine hook
- Plugin version numbers in prose (CLAUDE.md, README) — let manifest files + GitHub Releases be the source of truth

(Cross-tool entry point. Per-area rules live in the Context tree nodes above.)
