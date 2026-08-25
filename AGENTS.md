# AGENTS.md

docks is a cross-tool engineering skill kit and plugin marketplace. It ships **skills** for agentskills.io-compliant runtimes (Codex, Claude Code, OpenCode, VS Code Copilot), including the sequential `security`, `refactor`, and `skill-agent-pipeline` pipelines. Pipeline approval uses the GitHub-issue plan lifecycle instead of runtime-specific Plan Mode; the lifecycle itself ships as the self-versioned `plan-lifecycle` plugin. That plugin ships two read-only reviewer wrappers, `plan-reviewer` and `code-reviewer`; this source repository has the matching Codex wrapper pair under `.codex/agents/`.

This root file stays **repo-wide**. Per-area authoring details — skill/agent frontmatter, scoring, the release flow, CI triggers — live in nested `AGENTS.md` nodes, loaded lazily when you work in that folder. See **Context tree** below for the map.

## Commands

```bash
bun install --frozen-lockfile                         # one-time setup
node scripts/ci.mjs --plugin <name>                  # authoritative gate for one plugin and its owned release tooling
node scripts/ci.mjs                                  # full gate for repo-wide, shared, or multi-plugin changes
```

Node 24 remains the validator runtime and matches CI's `node-version`; Bun 1.4.0 is the package manager pinned through `packageManager`.

## Repository scope

```
.
├── plugins/docks/                    plugin payload (shipped to consumers)
│   ├── .claude-plugin/plugin.json    Claude plugin manifest
│   ├── .codex-plugin/plugin.json     Codex plugin manifest (skills + hooks — near-parity with Claude)
│   ├── skills/   (cross-tool)        surfaced in every runtime — incl. security/refactor/skill-agent-pipeline pipelines
│   └── hooks/    (cross-tool)        context-tree-nudge PostToolUse hook (Claude + Codex)
├── plugins/plan-lifecycle/           GitHub-issue plan lifecycle plugin (cross-tool): three skills, shipped plan.mjs, v3 contract reference, and two read-only reviewer wrappers under agents/; self-versioned with a closed compatibility.json checked by its self-test
├── .claude-plugin/marketplace.json   Claude marketplace catalog
├── .agents/plugins/marketplace.json  Codex marketplace catalog
├── .agents/skills/                   project-local skills (canonical, multi-tool)
├── .codex/agents/                    repo-local Codex plan-reviewer and code-reviewer wrappers (not plugin payload)
├── .claude/skills/                   Claude Code-visible symlinks → ../../.agents/skills/
├── docs/                             PLAN.md record standard, optional PLAN-QUEUE.md priority view, and frozen plans/finished/ pre-GitHub archive
├── scripts/                          plugin-author tooling (NOT shipped to consumers)
└── .github/workflows/                gh-side CI on PR + tag push
```

## Context tree

Per-area conventions load lazily from nested `AGENTS.md` nodes. Each is paired with a one-line `CLAUDE.md` (`@AGENTS.md`) because Claude Code descends `CLAUDE.md`, not `AGENTS.md`. Drill into the node for the local rules — this root carries only repo-wide concerns:

| Node | Covers |
|---|---|
| `docs/AGENTS.md` | plan-record routing, GitHub issue backend, frozen pre-GitHub archive |
| `plugins/docks/skills/AGENTS.md` | skill authoring — description CSO, frontmatter, body rules, scoring |
| `plugins/plan-lifecycle/skills/AGENTS.md` | plan-lifecycle skill authoring — the three lifecycle skills, contract sync, fail-loud routing |
| `scripts/AGENTS.md` | validators, edit→release workflow, double-layer gating, versioning |
| `.github/AGENTS.md` | CI trigger model, keep-in-sync with `ci.mjs` |

The `context-tree` skill (`plugins/docks/skills/productivity/context-tree/`) scaffolds, audits, and refreshes these nodes; `scripts/tree/guard.mjs` enforces the pair convention in CI.

## Authoring agents

Project-local Codex agents live in `.codex/agents/*.toml`. They are for working
on this repository with Codex and are not part of the installable Docks plugin.
Keep them thin: load the matching canonical skill, add only Codex-specific
dispatch/sandbox guidance, and avoid duplicating full skill bodies.

Plugin-shipped agents are not Codex-visible (Codex does not consume plugin-shipped subagents), but they are **not Claude-exclusive**: omp discovers Claude plugin `agents/` dirs too, so this payload has two consuming runtimes and must stay portable across both. `plugins/plan-lifecycle/agents/` holds two thin read-only reviewer wrappers for inter-agent `Agent(subagent_type=…)` dispatch: the flat files `agents/plan-reviewer.md` and `agents/code-reviewer.md`. Main context invokes the canonical `plan-manager` skill directly.

The `agents/` folder deliberately carries **no context-tree node** (hence its absence from the table above): `claude plugin validate` lints every `*.md` under `agents/` as a subagent, so an `AGENTS.md`/`CLAUDE.md` pair there fails `validate --strict` with "No frontmatter". Neither relocating the files into a subdir nor declaring an `agents` array in the manifest avoids that scan (both tried and ruled out). These authoring rules therefore live in this root file instead of a nested node.

- **Description (CSO):** lead with "Use when …" AND include a "Not …" exclusion clause (both required by `scripts/agents/guard.mjs`); ≥80 and ≤500 chars; concrete triggers; no slop words.
- **Frontmatter:** `name` (required, kebab-case, matches filename, no `anthropic`/`claude` substring); `description` (required, with the "Not …" clause); **no `model` key** — `scripts/agents/guard.mjs` rejects any value, `inherit` included. Claude Code documents `model` as defaulting to `inherit`, and omp falls back to the parent session model, so omission is the only spelling both runtimes agree on; every literal (`inherit`, `sonnet`, `claude-*`) is handed to omp as a model ID, resolves to nothing, and kills the spawn with "No model selected" (verified: a plugin agent carrying `model: inherit` fails in ~200 ms; the identical file without the key runs). Consumers pin per-agent models their own way — Claude via `CLAUDE_CODE_SUBAGENT_MODEL` (which outranks frontmatter), omp via `task.agentModelOverrides.<agent>` (which outranks both). `tools` (allowlist; omitted = inherit all). For plugin-shipped agents, `hooks`/`mcpServers`/`permissionMode` are silently ignored for security — use `.claude/agents/` when you need those.
- **Body (≤500; sweet spot 60–300):** same patterns as skills (`<constraint>` blocks — up to 2 rewarded — lookup tables, BAD/GOOD, gotchas, validation loop); structure as context-acknowledgment (step 1), then `## Workflow`, `## Output Format`, `## Anti-Hallucination Checks`, `## Success Criteria`.
- **No author-script refs (consumer-safety):** a plugin-shipped agent body must not name docks plugin-author scripts (`scripts/ci.mjs`, `scripts/skills/*`, `scripts/agents/*`, `scripts/tree/*`, …) as a step — they don't ship to a consumer's project. Refer to "the project's CI / validators, if present", or make the check self-contained. `scripts/skills/no-author-scripts.mjs` scans agent bodies alongside shipped skills (verify: append a line naming `node scripts/ci.mjs` to a non-allowlisted skill body → the guard run must FAIL naming that file; revert).
- **Validators:** `node scripts/agents/guard.mjs` (structural) + `node scripts/agents/score.mjs --per-file` (max 15, reachable in any harness; per-file floor 14; one genuine point of slack). Use up to two `<constraint>` blocks when they express distinct load-bearing invariants, not to manage score slack. Both validators run inside `scripts/ci.mjs`. Floors are detailed in `scripts/AGENTS.md`.
- **Sources:** [sub-agents](https://code.claude.com/docs/en/sub-agents) · [plugins-reference](https://code.claude.com/docs/en/plugins-reference).

## Plans

Use direct implementation for one clear, reversible, low-risk local diff with one
bounded acceptance path; it creates no plan issue, reviewer, or automatic
commit. Use a canonical plan for explicit planning, multi-commit or
cross-repository work, cold handoff, an unresolved decision, a cross-subsystem or
public-contract change, security-sensitive or destructive work, or any
non-`local` effect.

<constraint>
The plan record is a GitHub issue. Its body starts with
`<!-- plan-contract: v3 -->`, then a blank line and the exact eight `##`
sections; it has no frontmatter. GitHub owns title, open-work phase, owner,
timestamps, and completion, and no plan markdown is tracked in the repository.
Exactly three skills own the workflow: `plan-workspace` maintains the workspace;
main-context `plan-manager` runs six phases — decide, draft, research, plan
review, implement, code review — with bounded repair and fresh re-review in both
review phases, then archives; internal `plan-reviewer` returns one readable
pre-implementation verdict block per round. Two read-only reviewer wrappers
ship, `plan-reviewer` and `code-reviewer`, and nothing else in the lifecycle has
a wrapper.
</constraint>

After the marker and blank line, the record carries exactly `## Goal`,
`## Research`, `## Steps`, `## Acceptance`, `## Do not touch`,
`## Open questions`, `## Review`, and `## Verification Results`, in that order
and once each. `## Goal` carries exactly one mode line. Open-work phase is one
of `drafting`, `planned`, `ongoing`, or `blocked` in a `plan:<phase>` label; a
blocked plan starts `## Open questions` with `Blocked: <one-line reason>`.
Closed completion derives from GitHub `state` and `stateReason`. `## Review`
contains exactly `_Review records are stored in issue comments._`. Each reviewer
returns one markdown block, and the manager posts that whole block as one issue
comment. The latest trusted well-formed record per review kind wins; its author
must equal the plan's sole assignee. A legacy body verdict is consulted only
when no trusted comment record exists for that kind. Both review phases use
fresh inputs and run at most five rounds, stopping on pass, no progress, a
finding surviving its fix, or `repair` or `fixes-required` in round five. A
plan-review `blocked` verdict always routes its user-only decision through
`## Open questions` and `ask`.

The record carries no hash, permit, run identity, lock, or bundle, and the
`plan.mjs` shipped inside the installed `plan-lifecycle` plugin is the only
lifecycle tool. An `export` writes the sha256 of the body it copied beside the
copy so a stale copy cannot revert the record; that digest detects staleness and
authorizes nothing. Routine plan issue publication, implement-start linked
branch creation, commits, normal pushes, and the closing pull request carry the
settled mode's authorization and need no repeated prompt. Before any branch
checkout, including `gh issue develop --checkout`, require
`git status --porcelain` to be empty. If it is dirty, never stash, move, or
commit ambient work; set the plan `blocked` and name the dirty paths, or use an
authorized clean worktree.
Immediately after setting the plan `ongoing`, every `gh issue develop` call uses
`--repo`; the manager reuses a linked branch or creates one with
`--base <default> --checkout`, then re-lists and recovers after failure.
Implementation stops when no linked branch can be verified; there is no local
fallback. After the checks policy passes, the manager asks immediately before
merge. Without a fresh `Merge now` answer, it leaves the pull request and issue
open. `plan.mjs archive` verifies the latest trusted code-review result and
merged closing pull request after landing.

Every Steps row carries an `Effect` of exactly
`local|probe|production_access|publish|push|release|deploy`. A step whose
`Effect` is not `local` requires an in-session `ask` confirmation immediately
before it runs; when `ask` is unavailable the step is set `blocked` and the plan
reason becomes the first `## Open questions` line, `Blocked: <reason>`.
Persisted effects record intent only. Routine issue publication and landing
actions are outside the Steps table.

Render a plan body verbatim only when the user names that plan and asks to see it. After a write, report the one-line header strip and the changed lines only; a write never re-renders the body.

`docs/plans/finished/` is frozen pre-GitHub history. Humans may read it as
history, but it is not a source of truth. No lifecycle command or workspace
migration operation opens or inventories it. The complete contract lives in
`docs/PLAN.md`; `docs/AGENTS.md` routes to it and `docs/CLAUDE.md` contains only
`@AGENTS.md`.

## Project-local skills

The repo's own `.agents/skills/` hosts skills useful only when working ON this plugin repo — they don't ship to consumers:

- **`codex-plugin-mirror`** — translates Claude plugin manifests (`.claude-plugin/plugin.json` + `marketplace.json`) into the Codex parallel forms (`.codex-plugin/plugin.json` + `.agents/plugins/marketplace.json`). Invoked when releasing a new version.

Claude Code sees these via the symlinks under `.claude/skills/`. Codex sees them directly at `.agents/skills/`.

## CI targeting

A pull request resolves its changed paths into a shard set and runs `node scripts/ci.mjs --lane <shard>` per lane (`repo` always, plus `core` when the diff touches a plugin it owns), alongside an independent targeting-contracts job; the `validate` job joins those prerequisites and does not rerun the gate. Manual workflow dispatches run the full `node scripts/ci.mjs` gate. A release-tag push strictly resolves `<plugin>--v<version>` to a known registry plugin, then runs `node scripts/ci.mjs --plugin <name>` as the authoritative selected-plugin gate. That targeted invocation skips repo-wide workflow, standalone catalog, tree/durable-anchor, and CI-targeting checks; it runs only the named plugin's owned author checks, shell-hook lint, and plugin gate, including that plugin's marketplace/version coherence. The release command's local preflight targets that same selected plugin before creating and waiting on the tag.

CI uses an explicit `actions/cache` step over `~/.bun/install/cache`, with the key bound to `bun.lock` and `package.json`. `oven-sh/setup-bun` caches only the Bun executable, not dependencies. Caches improve speed but carry no authority: frozen dependency resolution, pinned toolchains, and the gate result define correctness.

## Tool-agnostic rules

- Run focused checks while implementing. Before committing, pushing, or releasing a change owned by exactly one plugin, run `node scripts/ci.mjs --plugin <name>`; that selected-plugin gate is authoritative for the plugin payload and its descriptor-owned author, source, and release-contract tooling.
- Run full `node scripts/ci.mjs` for repo-wide validation/tooling, shared infrastructure used by multiple plugins, registry or CI-topology changes, changes spanning multiple plugins, and manual full-gate requests. Do not run it merely because a single-plugin release is imminent.
- Reuse a green gate only while its validated implementation bytes are unchanged. A relevant source change requires rerunning the same smallest authoritative gate; plan-issue-only lifecycle changes do not.
- Don't loosen validator floors to pass; fix the file instead
- Manifest version numbers stay in lockstep across `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and the versioned Claude marketplace catalog — `ci.mjs`'s per-plugin gate and `release.mjs` both enforce this (verify: bump one manifest's version alone → `node scripts/ci.mjs --plugin <name>` must fail on the disagreement; revert)
- Skill bodies stay ≤500 lines per agentskills.io spec; sweet spot 80–310
- Agent scratch worktrees live under `$XDG_DATA_HOME/agent-worktrees/<repo>/<slug>` (default `~/.local/share/agent-worktrees/…`) — never as a sibling of the repository, and never under `/tmp` or `/var/tmp`, which are tmpfs on some hosts (a worktree there is a RAM claim, and `systemd-tmpfiles` ages out individual files, silently corrupting the checkout). Teardown is `git worktree remove` followed by `git worktree prune`; removing the directory by hand leaves an orphan admin record. The artifact set to delete before teardown is stack-dependent — `target/`, `node_modules/`, `dist/`, `.next/`, `__pycache__`, `.venv` — not a fixed `cargo clean`, because a worktree's reclaimable bytes are almost entirely build output. This rule binds agents working in **this** repository; cross-repository coverage requires your runtime's user-global agent file (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, or `~/.omp/agent/AGENTS.md`), each of which is outside every repository and therefore a user action.
- Other agent scratch follows the same principle as worktrees: **never the home root, never a repository sibling.** Review bundles and plan-body exports belong in the `docks-review` directory that `git rev-parse --git-path docks-review` resolves — `.git/docks-review` in a plain clone, the worktree-private equivalent in a linked worktree, whose `.git` is a file that makes a literal `.git/…` path fail with `ENOTDIR`. `plan-manager` writes the diff bundle there in phase 6 and `plan.mjs export` writes `plan-<issue>.md` there, both created mode `0700`, untracked, and discarded with the clone or worktree; scratch written anywhere else falls outside the lifecycle's contract. One-shot drivers, candidate plan bodies, measurement output, and the cross-session handoff index belong under `$XDG_STATE_HOME/docks/…` (default `~/.local/state/docks/…`, mode `0700`), extending the release tooling's existing `~/.local/state/docks-release/<plugin>-<version>/run.<id>/`.

## Security

- Don't expose secrets in plugin manifests, marketplace catalogs, or scripts
- Don't perform destructive git operations (force-push, hard reset, branch delete) without explicit user confirmation
- Treat third-party plugin sources and downloaded artifacts as untrusted

## What does NOT belong in this repo

- Consumer-side env vars / permissions / RTK config — those live in [DocksDocks/public](https://github.com/DocksDocks/public)
- `disable-claudeai-connectors.sh` — same reason, it's an opinionated user-machine hook
- Plugin version numbers in prose (CLAUDE.md, README) — let manifest files + GitHub Releases be the source of truth

(Cross-tool entry point. Per-area rules live in the Context tree nodes above.)
