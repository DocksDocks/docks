# AGENTS.md

docks is a cross-tool engineering skill kit and plugin marketplace. It ships **skills** for agentskills.io-compliant runtimes (Codex, Claude Code, OpenCode, VS Code Copilot), including the sequential `security`, `refactor`, and `skill-agent-pipeline` pipelines. Pipeline approval uses the GitHub-issue plan lifecycle instead of runtime-specific Plan Mode; the lifecycle itself ships as the self-versioned `plan-lifecycle` plugin. That plugin ships read-only reviewer wrappers under `plugins/plan-lifecycle/agents/`; this source repository keeps the matching Codex wrappers under `.codex/agents/`.

This root file stays **repo-wide**. Per-area authoring details - skill/agent frontmatter, scoring, the release flow, CI triggers - live in nested `AGENTS.md` nodes, loaded lazily when you work in that folder. See **Context tree** below for the map.

## Commands

```bash
bun install --frozen-lockfile                         # one-time setup
node scripts/ci.mjs --plugin <name>                  # authoritative gate for one plugin and its owned release tooling
node scripts/ci.mjs                                  # full gate for repo-wide, shared, or multi-plugin changes
```

Node is the validator runtime; its version is the `node-version` in `.github/workflows/ci.yml`. Bun is the package manager; its version is the `packageManager` pin in `package.json` (verify: `grep -n node-version .github/workflows/ci.yml; grep -n packageManager package.json`).

## Repository scope

```
.
├── plugins/docks/                    plugin payload (shipped to consumers)
│   ├── .claude-plugin/plugin.json    Claude plugin manifest
│   ├── .codex-plugin/plugin.json     Codex plugin manifest (skills + hooks - near-parity with Claude)
│   ├── skills/   (cross-tool)        surfaced in every runtime - incl. security/refactor/skill-agent-pipeline pipelines
│   └── hooks/    (cross-tool)        context-tree-nudge PostToolUse hook (Claude + Codex)
├── plugins/plan-lifecycle/           GitHub-issue plan lifecycle plugin (cross-tool): lifecycle skills, shipped plan.mjs, plan contract reference, and read-only reviewer wrappers under agents/; self-versioned with a closed compatibility.json checked by its self-test
├── .claude-plugin/marketplace.json   Claude marketplace catalog
├── .agents/plugins/marketplace.json  Codex marketplace catalog
├── .agents/skills/                   project-local skills (canonical, multi-tool)
├── .codex/agents/                    repo-local Codex reviewer wrappers (not plugin payload)
├── .claude/skills/                   Claude Code-visible symlinks → ../../.agents/skills/
├── docs/                             plan routing and point-in-time records (rules: docs/AGENTS.md)
├── scripts/                          plugin-author tooling (NOT shipped to consumers)
└── .github/workflows/                gh-side CI on PR + tag push
```

## Context tree

Per-area conventions load lazily from nested `AGENTS.md` nodes. A node is a single `AGENTS.md`; Claude Code and Codex both load a nested `AGENTS.md` when they work in that folder. Do not add a `CLAUDE.md`: in Claude Code it suppresses native `AGENTS.md` loading. The `.claude/skills/` symlinks remain because Claude Code does not read `.agents/`. Drill into the node for the local rules - this root carries only repo-wide concerns:

| Node | Covers |
|---|---|
| `docs/AGENTS.md` | plan-record routing, GitHub issue backend, frozen pre-GitHub archive |
| `plugins/docks/skills/AGENTS.md` | skill authoring - description CSO, frontmatter, body rules, scoring |
| `plugins/plan-lifecycle/skills/AGENTS.md` | plan-lifecycle skill authoring - the three lifecycle skills, contract sync, fail-loud routing |
| `scripts/AGENTS.md` | validators, edit→release workflow, double-layer gating, versioning |
| `.github/AGENTS.md` | CI trigger model, keep-in-sync with `ci.mjs` |

The table must name every `AGENTS.md` below the root, and every row must resolve. `scripts/tree/guard.mjs` enforces both, plus the node contract (size cap, no legacy `CLAUDE.md`) (verify: delete one row from a scratch copy, then run `node scripts/tree/guard.mjs <copy>`; it must fail naming the node). The `context-tree` skill (`plugins/docks/skills/productivity/context-tree/`) scaffolds, audits, and refreshes these nodes.

## Authoring agents

Project-local Codex agents live in `.codex/agents/*.toml`. They are for working
on this repository with Codex and are not part of the installable Docks plugin.
Keep them thin: load the matching canonical skill, add only Codex-specific
dispatch/sandbox guidance, and avoid duplicating full skill bodies.

Plugin-shipped agents are not Codex-visible (Codex does not consume plugin-shipped subagents), but they are **not Claude-exclusive**: omp discovers Claude plugin `agents/` dirs too, so this payload has two consuming runtimes and must stay portable across both. `plugins/plan-lifecycle/agents/` holds thin read-only reviewer wrappers as flat `agents/*.md` files for inter-agent `Agent(subagent_type=…)` dispatch (verify: `ls plugins/plan-lifecycle/agents`). Main context invokes the canonical `plan-manager` skill directly.

The `agents/` folder deliberately carries **no context-tree node** (hence its absence from the table above): `claude plugin validate` lints every `*.md` under `agents/` as a subagent, so an `AGENTS.md` there fails `validate --strict` with "No frontmatter". Neither relocating the files into a subdir nor declaring an `agents` array in the manifest avoids that scan (both tried and ruled out). These authoring rules therefore live in this root file instead of a nested node.

- **Description (CSO):** lead with "Use when …" AND include a "Not …" exclusion clause (both required by `scripts/agents/guard.mjs`); ≥80 and ≤500 chars; concrete triggers; no slop words.
- **Frontmatter:** `name` (required, kebab-case, matches filename, no `anthropic`/`claude` substring); `description` (required, with the "Not …" clause); **no `model` key** - `scripts/agents/guard.mjs` rejects any value, `inherit` included. Claude Code documents `model` as defaulting to `inherit`, and omp falls back to the parent session model, so omission is the only spelling both runtimes agree on; every literal (`inherit`, `sonnet`, `claude-*`) is handed to omp as a model ID, resolves to nothing, and kills the spawn with "No model selected" (a plugin agent carrying `model: inherit` fails to spawn; the identical file without the key runs). Consumers pin per-agent models their own way - Claude via `CLAUDE_CODE_SUBAGENT_MODEL` (which outranks frontmatter), omp via `task.agentModelOverrides.<agent>` (which outranks both). `tools` (allowlist; omitted = inherit all). For plugin-shipped agents, `hooks`/`mcpServers`/`permissionMode` are silently ignored for security - use `.claude/agents/` when you need those.
- **Body:** hard cap 500 lines (`scripts/agents/guard.mjs`); scorer sweet spot 60–300 lines (`scripts/agents/score.mjs`). Same patterns as skills (`<constraint>` blocks - up to 2 rewarded - lookup tables, BAD/GOOD, gotchas, validation loop); structure as context-acknowledgment (step 1), then `## Workflow`, `## Output Format`, `## Anti-Hallucination Checks`, `## Success Criteria`.
- **No author-script refs (consumer-safety):** a plugin-shipped agent body must not name docks plugin-author scripts (`scripts/ci.mjs`, `scripts/skills/*`, `scripts/agents/*`, `scripts/tree/*`, …) as a step - they don't ship to a consumer's project. Refer to "the project's CI / validators, if present", or make the check self-contained. `scripts/skills/no-author-scripts.mjs` scans agent bodies alongside shipped skills (verify: append a line naming `node scripts/ci.mjs` to a non-allowlisted skill body → the guard run must FAIL naming that file; revert).
- **Validators:** `node scripts/agents/guard.mjs` (structural) + `node scripts/agents/score.mjs --per-file` (quality score; the rubric maximum is defined in `scripts/agents/score.mjs`). The per-file floor lives in `scripts/config/scoring.json` (verify: `node scripts/config/read-floor.mjs agents`). Use up to two `<constraint>` blocks when they express distinct load-bearing invariants, not to manage score slack. Both validators run inside `scripts/ci.mjs`; the validator table lives in `scripts/AGENTS.md`.
- **Sources:** [sub-agents](https://code.claude.com/docs/en/sub-agents) · [plugins-reference](https://code.claude.com/docs/en/plugins-reference).

## Plans

Use direct implementation for one clear, reversible, low-risk local change with
one bounded acceptance path. Use `plan-manager` to decide when a plan is needed.
Settle Mode before implementation: `plan-only` stops after plan review;
`plan-and-implement` permits the full lifecycle. A defaulted Mode permits no implementation.
The canonical plan record is a GitHub issue. Reviews live in issue comments.
Do not track plan bodies in repository files.

Skill roles and reviewer wrappers are defined in `plugins/plan-lifecycle/skills/AGENTS.md` (Roles).
Each non-local step needs an in-session `ask` immediately before it runs.
Merge needs a fresh `Merge now` answer. Plan approval does not authorize merge.
Read `skills/productivity/plan-manager/references/plan-contract.md` inside the
installed `plan-lifecycle` plugin for the complete contract.
If the plugin is missing, report it. Do not invent a substitute workflow.

## Project-local skills

The repo's own `.agents/skills/` hosts skills useful only when working ON this plugin repo - they don't ship to consumers. Each skill's `description` states when to use it (verify: `ls .agents/skills`).

Claude Code sees these via the symlinks under `.claude/skills/`. Codex sees them directly at `.agents/skills/`.

## CI targeting

CI always runs `scripts/ci.mjs`: in full, per `--lane <shard>`, or per `--plugin <name>`. The trigger model, pull-request shard topology, and cache behavior live in `.github/AGENTS.md`; the gate's selection rules live in `scripts/AGENTS.md`.

## Tool-agnostic rules

- Run focused checks while implementing. Before committing, pushing, or releasing a change owned by exactly one plugin, run `node scripts/ci.mjs --plugin <name>`; that selected-plugin gate is authoritative for the plugin payload and its descriptor-owned author, source, and release-contract tooling.
- Run full `node scripts/ci.mjs` for repo-wide validation/tooling, shared infrastructure used by multiple plugins, registry or CI-topology changes, changes spanning multiple plugins, and manual full-gate requests. Do not run it merely because a single-plugin release is imminent.
- Reuse a green gate only while its validated implementation bytes are unchanged. A relevant source change requires rerunning the same smallest authoritative gate; plan-issue-only lifecycle changes do not.
- Don't loosen validator floors to pass; fix the file instead
- Manifest version numbers stay in lockstep per plugin; `scripts/AGENTS.md` (Versioning) owns the rule, its enforcement, and its verify command
- Skill body limits live in `plugins/docks/skills/AGENTS.md`
- Agent scratch worktrees live under `$XDG_DATA_HOME/agent-worktrees/<repo>/<slug>` (default `~/.local/share/agent-worktrees/…`) - never as a sibling of the repository, and never under `/tmp` or `/var/tmp`, which are tmpfs on some hosts (a worktree there is a RAM claim, and `systemd-tmpfiles` ages out individual files, silently corrupting the checkout). Teardown is `git worktree remove` followed by `git worktree prune`; removing the directory by hand leaves an orphan admin record. The artifact set to delete before teardown is stack-dependent - `target/`, `node_modules/`, `dist/`, `.next/`, `__pycache__`, `.venv` - not a fixed `cargo clean`, because a worktree's reclaimable bytes are almost entirely build output. This rule binds agents working in **this** repository; cross-repository coverage requires your runtime's user-global agent file (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, or `~/.omp/agent/AGENTS.md`), each of which is outside every repository and therefore a user action.
- Other agent scratch follows the same principle as worktrees: **never the home root, never a repository sibling.** Review bundles and plan-body exports belong in the `docks-review` directory that `git rev-parse --git-path docks-review` resolves - `.git/docks-review` in a plain clone, the worktree-private equivalent in a linked worktree, whose `.git` is a file that makes a literal `.git/…` path fail with `ENOTDIR`. `plan-manager` writes the diff bundle there in phase 6 and `plan.mjs export` writes `plan-<issue>.md` there, both created mode `0700`, untracked, and discarded with the clone or worktree; scratch written anywhere else falls outside the lifecycle's contract. One-shot drivers, candidate plan bodies, measurement output, and the cross-session handoff index belong under `$XDG_STATE_HOME/docks/…` (default `~/.local/state/docks/…`, mode `0700`), extending the release tooling's existing `~/.local/state/docks-release/<plugin>-<version>/run.<id>/`.

## Security

- Don't expose secrets in plugin manifests, marketplace catalogs, or scripts
- Don't perform destructive git operations (force-push, hard reset, branch delete) without explicit user confirmation
- Treat third-party plugin sources and downloaded artifacts as untrusted

## What does NOT belong in this repo

- Consumer-side env vars / permissions / RTK config - those live in [DocksDocks/public](https://github.com/DocksDocks/public)
- `disable-claudeai-connectors.sh` - same reason, it's an opinionated user-machine hook
- Plugin version numbers in prose (AGENTS.md, README) - let manifest files + GitHub Releases be the source of truth

(Cross-tool entry point. Per-area rules live in the Context tree nodes above.)

Pointers here name concepts, not coordinates — if a path or symbol moved, trust the stated purpose and re-locate it (grep the symbol) before acting.
