# AGENTS.md

docks is a cross-tool engineering skill kit and plugin marketplace. It ships **skills** for agentskills.io-compliant runtimes (Codex, Claude Code, OpenCode, VS Code Copilot), including the sequential `security`, `refactor`, and `skill-agent-pipeline` pipelines. Pipeline approval uses the `docs/plans/` lifecycle instead of runtime-specific Plan Mode; the lifecycle itself ships as the self-versioned `plan-lifecycle` plugin. That plugin's sole Claude-specific plan subagent is the read-only `plan-reviewer`; this source repo has the matching reviewer-only Codex wrapper under `.codex/agents/`.

This root file stays **repo-wide**. Per-area authoring details — skill/agent frontmatter, scoring, the release flow, CI triggers — live in nested `AGENTS.md` nodes, loaded lazily when you work in that folder. See **Context tree** below for the map.

## Commands

```bash
corepack enable && pnpm install --frozen-lockfile   # one-time setup (Node 24, matching CI's node-version; pnpm via corepack)
node scripts/ci.mjs --plugin <name>                  # authoritative gate for one plugin and its owned release tooling
node scripts/ci.mjs                                  # full gate for repo-wide, shared, or multi-plugin changes
```

## Repository scope

```
.
├── plugins/docks/                    plugin payload (shipped to consumers)
│   ├── .claude-plugin/plugin.json    Claude plugin manifest
│   ├── .codex-plugin/plugin.json     Codex plugin manifest (skills + hooks — near-parity with Claude)
│   ├── skills/   (cross-tool)        surfaced in every runtime — incl. security/refactor/skill-agent-pipeline pipelines
│   └── hooks/    (cross-tool)        context-tree-nudge PostToolUse hook (Claude + Codex)
├── plugins/plan-lifecycle/           plan lifecycle plugin (cross-tool): plan-workspace / plan-manager / plan-reviewer skills, shipped PlanRunV1 machinery, one read-only Claude plan-reviewer wrapper under agents/; self-versioned with a closed compatibility.json checked by its self-test
├── plugins/session-relay/            2nd plugin (cross-tool: Claude + Codex): cross-session/cross-project/cross-tool agent message bus — MCP bus server + shared SessionStart hook + relay CLI; self-versioned, gated by its own ci.mjs section
├── plugins/effect-kit/               3rd plugin (cross-tool): Effect-TS skill kit — effect-ts-setup / effect-ts-specialist / effect-ts-port (skills-only; depends on docks for plan-lifecycle + authoring skills); self-versioned
├── .claude-plugin/marketplace.json   Claude marketplace catalog
├── .agents/plugins/marketplace.json  Codex marketplace catalog
├── .agents/skills/                   project-local skills (canonical, multi-tool)
├── .codex/agents/                    repo-local Codex plan-reviewer wrapper (not plugin payload)
├── .claude/skills/                   Claude Code-visible symlinks → ../../.agents/skills/
├── docs/plans/                       active/finished lifecycle planning (maintained by plan-workspace)
├── scripts/                          plugin-author tooling (NOT shipped to consumers)
└── .github/workflows/                gh-side CI on PR + tag push
```

## Context tree

Per-area conventions load lazily from nested `AGENTS.md` nodes. Each is paired with a one-line `CLAUDE.md` (`@AGENTS.md`) because Claude Code descends `CLAUDE.md`, not `AGENTS.md`. Drill into the node for the local rules — this root carries only repo-wide concerns:

| Node | Covers |
|---|---|
| `docs/plans/AGENTS.md` | three-skill routing, PlanRunV1, review budgets, transactions, effects, lifecycle |
| `plugins/docks/skills/AGENTS.md` | skill authoring — description CSO, frontmatter, body rules, scoring |
| `plugins/session-relay/AGENTS.md` | the relay plugin — layout, binary-release discipline, its CI gates |
| `plugins/effect-kit/skills/AGENTS.md` | effect-kit skill authoring — Effect 3.x plus version-gated Effect v4 conventions |
| `plugins/plan-lifecycle/skills/AGENTS.md` | plan-lifecycle skill authoring — the three lifecycle skills, contract sync, fail-loud routing |
| `scripts/AGENTS.md` | validators, edit→release workflow, double-layer gating, versioning |
| `.github/AGENTS.md` | CI trigger model, keep-in-sync with `ci.mjs` |

The `context-tree` skill (`plugins/docks/skills/productivity/context-tree/`) scaffolds, audits, and refreshes these nodes; `scripts/tree/guard.mjs` enforces the pair convention in CI.

## Authoring agents

Project-local Codex agents live in `.codex/agents/*.toml`. They are for working
on this repository with Codex and are not part of the installable Docks plugin.
Keep them thin: load the matching canonical skill, add only Codex-specific
dispatch/sandbox guidance, and avoid duplicating full skill bodies.

Plugin-shipped agents are not Codex-visible (Codex does not consume plugin-shipped subagents), but they are **not Claude-exclusive**: omp discovers Claude plugin `agents/` dirs too, so this payload has two consuming runtimes and must stay portable across both. `plugins/plan-lifecycle/agents/` holds the repository's one thin read-only `plan-reviewer` wrapper for inter-agent `Agent(subagent_type=…)` dispatch. It is the flat file `agents/plan-reviewer.md`; main context invokes the canonical `plan-manager` skill directly.

The `agents/` folder deliberately carries **no context-tree node** (hence its absence from the table above): `claude plugin validate` lints every `*.md` under `agents/` as a subagent, so an `AGENTS.md`/`CLAUDE.md` pair there fails `validate --strict` with "No frontmatter". Neither relocating the files into a subdir nor declaring an `agents` array in the manifest avoids that scan (both tried and ruled out). These authoring rules therefore live in this root file instead of a nested node.

- **Description (CSO):** lead with "Use when …" AND include a "Not …" exclusion clause (both required by `scripts/agents/guard.mjs`); ≥80 and ≤500 chars; concrete triggers; no slop words.
- **Frontmatter:** `name` (required, kebab-case, matches filename, no `anthropic`/`claude` substring); `description` (required, with the "Not …" clause); **no `model` key** — `scripts/agents/guard.mjs` rejects any value, `inherit` included. Claude Code documents `model` as defaulting to `inherit`, and omp falls back to the parent session model, so omission is the only spelling both runtimes agree on; every literal (`inherit`, `sonnet`, `claude-*`) is handed to omp as a model ID, resolves to nothing, and kills the spawn with "No model selected" (verified: a plugin agent carrying `model: inherit` fails in ~200 ms; the identical file without the key runs). Consumers pin per-agent models their own way — Claude via `CLAUDE_CODE_SUBAGENT_MODEL` (which outranks frontmatter), omp via `task.agentModelOverrides.<agent>` (which outranks both). `tools` (allowlist; omitted = inherit all). For plugin-shipped agents, `hooks`/`mcpServers`/`permissionMode` are silently ignored for security — use `.claude/agents/` when you need those.
- **Body (≤500; sweet spot 60–300):** same patterns as skills (`<constraint>` blocks — up to 2 rewarded — lookup tables, BAD/GOOD, gotchas, validation loop); structure as context-acknowledgment (step 1), then `## Workflow`, `## Output Format`, `## Anti-Hallucination Checks`, `## Success Criteria`.
- **No author-script refs (consumer-safety):** a plugin-shipped agent body must not name docks plugin-author scripts (`scripts/ci.mjs`, `scripts/skills/*`, `scripts/agents/*`, `scripts/tree/*`, …) as a step — they don't ship to a consumer's project. Refer to "the project's CI / validators, if present", or make the check self-contained. `scripts/skills/no-author-scripts.mjs` scans agent bodies alongside shipped skills (verify: append a line naming `node scripts/ci.mjs` to a non-allowlisted skill body → the guard run must FAIL naming that file; revert).
- **Validators:** `node scripts/agents/guard.mjs` (structural) + `node scripts/agents/score.mjs --per-file` (max 15, per-file floor 14 — one point of slack total, so 2 `<constraint>` blocks are the safe default: the constraint bucket caps at 2 pts and a single block already spends the slack); both run inside `scripts/ci.mjs`. Floors detailed in `scripts/AGENTS.md`.
- **Sources:** [sub-agents](https://code.claude.com/docs/en/sub-agents) · [plugins-reference](https://code.claude.com/docs/en/plugins-reference).

## Plans

Use direct implementation for one clear, reversible, low-risk local diff with
one bounded acceptance path; it creates no tracked plan, reviewer, or automatic
commit. Use a canonical plan for explicit planning, multi-commit or
cross-repository work, scheduling, cold handoff, unresolved decisions,
cross-subsystem/public-contract changes, security-sensitive or destructive work,
or an external effect.

The optional `docs/plans/QUEUE.md` is only a discovery and prioritization view: its goal id is the row identity, and eligibility requires the complete direct and transitive dependency closure to be finished. It grants no lifecycle or execution authority.

<constraint>
Canonical plans live in `docs/plans/active/`; status is frontmatter and
`docs/plans/finished/` is terminal. Exactly three skills own the workflow:
`plan-workspace` maintains the workspace; main-context `plan-manager` owns
classify → draft, self-check gate, review and one repair when risk requires it →
start → implement/delegate → observed acceptance → finish/archive; internal
`plan-reviewer` returns read-only `PlanReviewV1` evidence from one immutable
bundle. Only the reviewer has Claude/Codex wrappers.
</constraint>

The current record is one unfenced compact-JCS `Plan-run: PlanRunV1` line.
Exact current-user replacement authority binds the terminal predecessor and
exact successor PlanRun, keeps the stable `plan_path`, appends validated
`Plan-attempt-history`, and installs a fresh `run_id`; it never creates
`v2`/`vN` files or resets predecessor permits. PlanRunV1 binds
repository/path/run identity, cross-repository goal, effects/risk, commits,
hashes, and budgets. Review budgets are ≤2 substantive review permits per phase,
distinct from transport retries: a first transport-only failure refunds its
reservation and allows one fresh `transport_retried` dispatch; a second
transport failure degrades only local draft work and otherwise blocks. Cold
`reserved` or `transport_retried` state blocks without redispatch. At local risk
the deterministic self-check gate is the draft gate, so `draft_review` may be
`not_required`; local completion review is likewise not required. Sensitive and
external risk keep a passed substantive draft review and both completion permits.

Every mutation uses an exclusive preimage-checked per-plan transaction and
read-back. Checkpoint commits additionally lock the repository and verify HEAD,
index, and owned paths. Direct work has zero automatic commits; plan-only has
one; ordinary canonical implementation has start/final checkpoints; sensitive
or external implementation has start/implementation/archive checkpoints. There
are no per-round commits or automatic pushes.

Every Steps row has `Effect` exactly
`local|probe|production_access|publish|push|release|deploy`. Persisted effects
record intent only. Non-local actions require a live
`ExternalAuthorityV1 {scopes,mode,targets,source_sha256}` derived from the exact
current-user message and matching the exact boundary; probe is read-only and
non-transitive.

Schemas 1–6 are historical validation/quarantine only. List and audit scan
frontmatter first; active, prepared, committed, cancelled, crossed, malformed,
or otherwise unsettled legacy evidence is target-locally quarantined and never
blocks unrelated goals or authorizes dispatch. The complete closed status
matrix, review outputs, lock protocol, effects contract, GitHub issue preflights,
and migration rules live in `docs/plans/AGENTS.md`. Session Relay remains
optional transport/workspace custody, never plan-review evidence.

## Project-local skills

The repo's own `.agents/skills/` hosts skills useful only when working ON this plugin repo — they don't ship to consumers:

- **`codex-plugin-mirror`** — translates Claude plugin manifests (`.claude-plugin/plugin.json` + `marketplace.json`) into the Codex parallel forms (`.codex-plugin/plugin.json` + `.agents/plugins/marketplace.json`). Invoked when releasing a new version.

Claude Code sees these via the symlinks under `.claude/skills/`. Codex sees them directly at `.agents/skills/`.

## CI targeting

Pull requests and manual workflow dispatches run the full `node scripts/ci.mjs` gate. A release-tag push strictly resolves `<plugin>--v<version>` to a known registry plugin before Rust-specific work, then runs `node scripts/ci.mjs --plugin <name>` as the authoritative selected-plugin gate. That targeted invocation skips repo-wide workflow, standalone catalog, tree/durable-anchor, and CI-targeting checks; it runs only the named plugin's owned author checks, shell-hook lint, and plugin gate, including that plugin's marketplace/version coherence. The release command's local preflight targets that same selected plugin before creating and waiting on the tag.

CI caches pnpm data by `pnpm-lock.yaml` and restores Cargo dependencies/build outputs only for full runs or a resolved Rust-capable release target. Caches improve speed but carry no authority: frozen dependency resolution, pinned toolchains, and the gate result define correctness.

## Tool-agnostic rules

- Run focused checks while implementing. Before committing, pushing, or releasing a change owned by exactly one plugin, run `node scripts/ci.mjs --plugin <name>`; that selected-plugin gate is authoritative for the plugin payload and its descriptor-owned author, source, and release-contract tooling.
- Run full `node scripts/ci.mjs` for repo-wide validation/tooling, shared infrastructure used by multiple plugins, registry or CI-topology changes, changes spanning multiple plugins, and manual full-gate requests. Do not run it merely because a single-plugin release is imminent.
- Reuse a green gate only while its validated implementation bytes are unchanged. A relevant source change requires rerunning the same smallest authoritative gate; plan-only lifecycle changes do not.
- Don't loosen validator floors to pass; fix the file instead
- Manifest version numbers stay in lockstep across `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and the versioned Claude marketplace catalog — `ci.mjs`'s per-plugin gate and `release.mjs` both enforce this (verify: bump one manifest's version alone → `node scripts/ci.mjs --plugin <name>` must fail on the disagreement; revert)
- Skill bodies stay ≤500 lines per agentskills.io spec; sweet spot 80–310
- Agent scratch worktrees live under `$XDG_DATA_HOME/agent-worktrees/<repo>/<slug>` (default `~/.local/share/agent-worktrees/…`) — never as a sibling of the repository, and never under `/tmp` or `/var/tmp`, which are tmpfs on some hosts (a worktree there is a RAM claim, and `systemd-tmpfiles` ages out individual files, silently corrupting the checkout). Teardown is `git worktree remove` followed by `git worktree prune`; removing the directory by hand leaves an orphan admin record. The artifact set to delete before teardown is stack-dependent — `target/`, `node_modules/`, `dist/`, `.next/`, `__pycache__`, `.venv` — not a fixed `cargo clean`, because a worktree's reclaimable bytes are almost entirely build output. This rule binds agents working in **this** repository; cross-repository coverage requires your runtime's user-global agent file (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, or `~/.omp/agent/AGENTS.md`), each of which is outside every repository and therefore a user action.
- Other agent scratch follows the same principle as worktrees: **never the home root, never a repository sibling.** Review bundles belong in `<repo>/.git/docks-review` — the `dispatch-review.mjs` default, created mode `0700`, untracked, and discarded with the clone; a bundle written anywhere else is a sign the canonical driver was bypassed. One-shot drivers, candidate plan bodies, measurement output, and the cross-session handoff index belong under `$XDG_STATE_HOME/docks/…` (default `~/.local/state/docks/…`, mode `0700`), extending the release tooling's existing `~/.local/state/docks-release/<plugin>-<version>/run.<id>/`. Persisted authorization sources are **not** scratch: keep them in their own `authority/` directory, because a plan record binds them by `authorization_source_sha256`, and a cleanup reading `scratch/` as disposable would destroy a live run's provenance. Relocation asymmetry: an artifact cited by content hash may move, because the digest is of bytes; an artifact an **active** plan cites by path may not, because the citation is of the path. A finished plan is a historical record, so a path inside it describes what was true then and is stale by design once the artifact relocates — record the new location in the handoff index rather than editing archived bytes. Enumerate **both** spellings and skip frozen records, because a tilde citation is invisible to an expanded-path scan and `repository_id` inside a `Plan-run:` line is not a citation (verify: `grep -rhvE '^[A-Z][A-Za-z0-9-]*: *\{' docs/plans/active/*.md | grep -oE '(/home/[^ \`]+|~/[A-Za-z0-9._/-]+)'` — expected empty; the expanded-only form silently reports an empty immovable set even when a `~/…` citation exists).

## Security

- Don't expose secrets in plugin manifests, marketplace catalogs, or scripts
- Don't perform destructive git operations (force-push, hard reset, branch delete) without explicit user confirmation
- Treat third-party plugin sources and downloaded artifacts as untrusted

## What does NOT belong in this repo

- Consumer-side env vars / permissions / RTK config — those live in [DocksDocks/public](https://github.com/DocksDocks/public)
- `disable-claudeai-connectors.sh` — same reason, it's an opinionated user-machine hook
- Plugin version numbers in prose (CLAUDE.md, README) — let manifest files + GitHub Releases be the source of truth

(Cross-tool entry point. Per-area rules live in the Context tree nodes above.)
