@AGENTS.md

# docks — Claude Code plugin marketplace

This repo is **both a marketplace and a plugin** in the Claude Code plugin system. The marketplace catalog lives at `.claude-plugin/marketplace.json` and points at the plugin under `plugins/docks/` (the only directory cached on user install). Author-side tooling (validators, CI) lives at the repo root and never ships to users.

> **Note:** This file covers Claude-Code-specific authoring. Cross-tool concerns (project purpose, generic engineering rules, the Codex distribution mirror) live in `AGENTS.md` (auto-imported above). For project-local skills used during release flow, see `.agents/skills/`.

## Layout

```
.
├── .claude-plugin/marketplace.json    marketplace catalog (publishes the plugin)
├── plugins/docks/                     the plugin (cached on user install)
│   ├── .claude-plugin/plugin.json     plugin manifest
│   ├── skills/                         auto-trigger on relevant tasks
│   ├── commands/                       slash command orchestrators
│   └── agents/                         per-phase Opus/Sonnet tiering
├── scripts/                           plugin-author tooling (NOT shipped)
│   ├── ci.sh                          local mirror of GH CI
│   ├── release.sh                     end-to-end release flow
│   └── guard-*.sh / score-*.sh        validators
└── .github/workflows/ci.yml           gh-side CI on PR + tag push
```

## Release flow (double-layered gating)

```
edit → bash scripts/ci.sh    (LAYER 1 — local, fast)
     → ./scripts/release.sh patch|minor|major|<X.Y.Z>
        ├── runs ci.sh again as precondition
        ├── bumps plugin.json + marketplace.json versions
        ├── commits + pushes
        ├── claude plugin tag --push      (creates docks--v<version>)
        ├── waits for tag-CI on GitHub    (LAYER 2 — authoritative)
        ├── tag-CI passes → gh release create
        └── tag-CI fails  → exits non-zero, prints recovery steps
```

The two layers exist because each catches different failure modes: `ci.sh` catches local-stage issues fast (no burned tag), tag-CI catches contributor-machine drift (different OS, missing tools, dirty checkout) and is the **authoritative gate** that decides whether the GitHub Release object gets created.

<constraint>
Run `bash scripts/ci.sh` before invoking `./scripts/release.sh` — even though release.sh runs ci.sh as a precondition, running it manually first lets you iterate on failures without the script's clean-tree requirement getting in the way. ci.sh exits non-zero on any failure; do NOT release if it fails locally. The local ci.sh must pass before any push that goes near a tag.
</constraint>

## Validators (called by ci.sh)

| Script | Purpose | Floor |
|---|---|---|
| `scripts/guard-skills.sh` | structural — frontmatter, ≤500 lines, name-matches-dir | n/a (pass/fail) |
| `scripts/score-skills.sh` | quality score (max 16) | per-file ≥8; total = N×8 (count-derived) |
| `scripts/guard-commands.sh` | subagent_type cross-refs resolve to plugins/docks/agents/*.md | n/a |
| `scripts/score-commands.sh` | quality score (max 21) | per-file ≥21; total = N×21 (count-derived) |
| `scripts/guard-agents.sh` | frontmatter, "Use when…" / "Not…" CSO, model declared | n/a |
| `scripts/score-agents.sh` | quality score (max 15) | per-file ≥14; total = N×14 (count-derived) |

`--per-file` flag on score scripts prints `<name> <score>` lines for drift inspection.

Total floors are computed at CI time as `artifact_count × per-file_floor` — adding or removing a skill/command/agent moves the floor automatically (see `93db77e`). Per-file floors are the true gate; total floors are derived.

## When editing skills/commands/agents

1. Edit files inside `plugins/docks/{skills,commands,agents}/`
2. Run `bash scripts/ci.sh` — must be green before commit
3. For local Claude Code testing without push: `claude --plugin-dir ./plugins/docks` (and `/reload-plugins` after each edit)
4. PR to main → PR-CI runs and gates the merge
5. After merge, run `./scripts/release.sh patch` to publish

<constraint>
Skills, commands, and agents inside `plugins/docks/` follow the structural rules enforced by the guards. New file → must pass `bash scripts/ci.sh` before commit. Don't loosen the validator floors to make a problematic file pass — fix the file.
</constraint>

## Authoring skills, commands & agents

Claude Code surfaces every skill / command / agent description in the listing it shows the model at session start. When the listing exceeds the budget (default 1% of context, fallback 8,000 chars; override with `SLASH_COMMAND_TOOL_CHAR_BUDGET`) descriptions get silently dropped — names stay, keywords vanish, semantic matching breaks. Per-entry descriptions are also silently truncated at 1,536 chars. The scorers in `scripts/score-*.sh` defend that budget by rewarding tight, CSO-formatted descriptions; bloat costs points before it costs matches.

### Description format (all artifact types)

1. **Lead with "Use when …"** — Anthropic's doc examples and our guards enforce this prefix. For agents we additionally require a "Not for …" exclusion clause to prevent delegation collisions.
2. **Put the key use case first.** Per the skills doc: "the combined `description` and `when_to_use` text is truncated at 1,536 characters in the skill listing"; first 100 chars matter most for matching.
3. **Stay ≤500 chars** to earn full scorer credit. Tier (skills + commands): ≤500 = 2 pts, ≤1,000 = 1 pt, else 0. Agents: ≥80 and ≤500 = 1 pt.
4. **Use concrete trigger keywords**, not abstract capability prose. "Use when running pnpm audit, pip-audit, …" beats "Use when working with dependency security." Move "Covers X, Y, Z…" enumerations into the body — the body loads only on activation; the description loads every session.
5. **Avoid slop words** (`comprehensive`, `robust`, `elegant`, `seamless`) — `score-*.sh` deducts 1 pt per occurrence (max −2).
6. **For agents that should fire automatically**, include "Use proactively …" or specific trigger phrases — Anthropic recommends this for delegation reliability.

### Frontmatter quick reference

| Field | Skills (`SKILL.md`) | Commands (`commands/<name>.md`) | Agents (`agents/<name>.md`) |
|---|---|---|---|
| `name` | optional (dir name fallback); ≤64 chars, `[a-z0-9-]+`, must match parent dir per agentskills.io spec | n/a (filename = name) | required; ≤64 chars, `[a-z0-9-]+`, must match filename, must NOT contain `anthropic`/`claude` |
| `description` | recommended; ≤1,024 hard cap; ≤500 for full scorer credit | required; ≤500 for full credit | required; must contain a "Not …" clause; ≤500 for full credit |
| `model` | optional override per turn; values: `sonnet` / `opus` / `haiku` / full ID / `inherit` | optional override | optional; defaults to `inherit`. Resolution: env `CLAUDE_CODE_SUBAGENT_MODEL` → per-invocation param → frontmatter → parent |
| `tools` / `allowed-tools` | `allowed-tools` pre-approves tools while skill is active | `allowed-tools` is the auto-approve list | `tools` is allowlist (omitted = inherit ALL parent tools); `disallowedTools` is denylist |
| Other supported fields | `disable-model-invocation`, `user-invocable`, `argument-hint`, `arguments`, `paths`, `effort`, `context: fork`, `agent`, `hooks`, `shell`, `when_to_use` (counts toward the 1,536-char cap) | `argument-hint` (autocomplete only); `$ARGUMENTS` placeholder in body | `permissionMode`, `maxTurns`, `skills` (preloaded), `mcpServers`, `hooks`, `memory` (`user`/`project`/`local`), `background`, `effort`, `isolation: worktree`, `color`, `initialPrompt` |

For **plugin-shipped agents**, `hooks`, `mcpServers`, and `permissionMode` are silently ignored for security — use `.claude/agents/` (not the plugin) when you need those features.

### Body authoring rules

The body (post-frontmatter content) loads at activation and stays in context across turns — every line is a recurring token cost. Anthropic's [best-practices conciseness test](https://code.claude.com/docs/en/best-practices): "Would removing this line cause Claude to make mistakes? If not, cut it." Don't include things Claude already knows ("PDF is a document format", "TypeScript is a typed superset") — the skill's value is project-specific knowledge the agent lacks.

| Pattern | When to use |
|---|---|
| `<constraint>` block | Non-negotiable rule the agent must follow. Scorer rewards up to 3 per skill / up to 2 per agent — promote prose rules to constraints where emphasis matters. |
| Quick-reference / lookup table | High-density mapping (smell → fix, before → after, anti-pattern → replacement). Agents pattern-match better against tables than prose. |
| BAD/GOOD code blocks | Concrete pattern matching for fragile decisions. Scorer rewards presence of both idioms. |
| Decision Tree (numbered) | "When stuck, check these in order" — favor procedures over declarations per [agentskills.io best-practices](https://agentskills.io/skill-creation/best-practices). |
| Gotchas section | Highest-value content per agentskills.io — concrete corrections to mistakes the agent makes without being told. Add a gotcha each time you correct the agent on the same kind of mistake twice. |
| Validation loop | "Do work → run validator → fix → repeat." Pair with a script in `scripts/` that returns useful error messages so the agent can self-correct. |
| External `references/<topic>.md` | When body crosses ~310 lines, split detail into on-demand files referenced from `SKILL.md` (Anthropic doc tip: keep main SKILL.md ≤500 lines). |

Body sweet spot: **80–310 lines** (scorer; ≤500 per Anthropic). Compaction re-attaches the first 5,000 tokens of each invoked skill (25K shared budget across skills) — content past that may be dropped after auto-compaction. Match specificity to fragility: prescriptive for fragile/sequential operations, flexible (with WHY explained) for rules that tolerate variation.

### Plugin namespace

All plugin artifacts surface as `<plugin-name>:<artifact-name>` (e.g., `docks:fix`, `docks:security-vulnerability-scanner`). The namespace comes from `name` in `.claude-plugin/plugin.json`. If `version` is omitted from `plugin.json`, the git commit SHA acts as the version, so every commit becomes a new "update" for installed users — always tag explicit semver bumps via `release.sh`.

<constraint>
When adding or editing a description, run `bash scripts/ci.sh` and check that per-file scores didn't regress. Length bloat past 500 chars costs scorer points before it costs listing matches; don't paper over it by raising floors. Move enumerations and topic lists into the body, not the description.
</constraint>

### Sources

- Skills: <https://code.claude.com/docs/en/skills>
- Subagents: <https://code.claude.com/docs/en/sub-agents>
- Plugins: <https://code.claude.com/docs/en/plugins>
- Plugins reference: <https://code.claude.com/docs/en/plugins-reference>
- agentskills.io spec: <https://agentskills.io/specification>

## Versioning

Both `plugins/docks/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` carry a `version` field — `claude plugin tag` validates they agree. `release.sh` keeps them in sync automatically. Without an explicit `version`, every commit counts as a new "version" to consumers (noisy `/plugin update` prompts), so always tag releases with explicit semver bumps.

Tag format: `docks--v<X.Y.Z>` (the double-dash separator is what `claude plugin tag` produces).

## Trigger model for `.github/workflows/ci.yml`

Only three events trigger CI:
- `pull_request` to main → gate merges
- `push` of tags matching `docks--v*` → gate releases (release.sh waits for this)
- `workflow_dispatch` → manual

**No** `push: branches: [main]` — main pushes don't re-run CI; PR validation already covers it.

## What does NOT belong in this repo

- Consumer-side env vars / permissions / RTK config — those live in [DocksDocks/public](https://github.com/DocksDocks/public) (the kit)
- `disable-claudeai-connectors.sh` — same reason, it's an opinionated user-machine hook
- Plugin version numbers in CLAUDE.md or README prose — those drift; let `plugin.json` + `marketplace.json` + GitHub Releases be the source of truth
