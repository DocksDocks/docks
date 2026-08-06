# docks

Claude Code + Codex plugin marketplace publishing the **docks** plugin — a cross-tool engineering skill kit. Pipeline skills (security audit, refactor, skill-agent-pipeline) run sequentially on any agentskills.io runtime; a library of convention skills covers test-first, coverage, fix, review, human-docs, design tokens, SOLID, type-safety, and React patterns; and a `docs/plans/` lifecycle tracks multi-commit work.

## Install

```bash
/plugin marketplace add DocksDocks/docks
/plugin install docks@docks
/reload-plugins
```

## Platform support

All three marketplace plugins support Linux and macOS only:

| Plugin | Supported hosts |
|---|---|
| `docks` | Linux and macOS only |
| `session-relay` | Linux and macOS only; official prebuilts are available for x64 and arm64 |
| `effect-kit` | Linux and macOS only |

After install, the pipeline skills are user-invocable — ask "run a security audit", "refactor `src/`", or "audit my skills", or invoke `security` / `refactor` / `skill-agent-pipeline` directly. Every other skill auto-triggers by description match; namespacing is invisible at runtime.

## What's inside

### Pipeline skills (sequential, cross-tool)

Each runs as one sequential pass in a single context and gates approval through the `docs/plans/` lifecycle (the `plan-manager` skill), not a runtime-specific Plan Mode. Per-phase expertise lives in each skill's `references/`.

| Skill | Pipeline |
|---|---|
| `security` | discovery → vulnerability scan → logic analysis → adversarial hunt → synthesis that challenges every finding. Read-only; pipe findings to `fix-workflow`. |
| `refactor` | exploration → dead-code + duplication + per-principle SOLID analysis → tiered plan → approve → test-guarded one-change-at-a-time implementation → post-verify SOLID delta. |
| `skill-agent-pipeline` | explore → categorize skills → pattern-scan → build SKILL.md + references/ → build agents (`.claude/agents/*.md` + `.codex/agents/*.toml`) → verify → approve → implement. |

### Convention skills

Auto-trigger on matching tasks (all `user-invocable: false`):

| Skill | Use when |
|---|---|
| `tdd-workflow` | Test-first development; tests as spec for code that doesn't exist yet |
| `test-coverage` | Adding tests to existing code; backfilling coverage |
| `code-review` | Reviewing a path / diff / working tree for bugs, security, perf, AI slop |
| `fix-workflow` | Fixing a specific bug, dependency vuln, or finding from `security` / `code-review` |
| `human-docs-workflow` | README, CLAUDE.md, docs/, .env.example, JSDoc — every claim grounded in source |
| `design-tokenization` | Color/Tailwind work — semantic + brand tokens, no-hex, `:root`/`.dark` parity |
| `dep-vuln-workflow` | CVE/GHSA triage, audit response, package upgrade decisions |
| `lint-no-suppressions` | When tempted to add `eslint-disable` / `@ts-ignore` / `# noqa` |
| `make-interfaces-feel-better` | UI polish, micro-interactions, optical alignment |
| `react-component-patterns` | React 19+ effects (3 acceptable categories) + composition (compound, slot/`asChild`, polymorphic, headless, provider+hook, cva variants) |
| `solid` | Generic SOLID for TS/Python/Go modules — strategy maps, discriminated unions, fat-interface splits, dependency injection |
| `type-safety-discipline` | Branded/newtype IDs, discriminated unions, parse-don't-validate — TS primary; references for Rust/Kotlin/Python |

Plus `write-skill`, `multi-tool-bridge` (CLAUDE.md ↔ AGENTS.md ↔ skills bridging), `zoom-out`, and `caveman` under `productivity/`.

### Plan lifecycle (the `plan-lifecycle` plugin)

Directly implement one clear, reversible, low-risk local diff with one bounded
acceptance path; it creates no tracked plan, reviewer, or automatic commit. Use
a canonical plan for explicit planning, multi-commit/cross-repository work,
scheduling, cold handoff, unresolved decisions, cross-subsystem/public-contract
changes, security-sensitive/destructive work, or an external effect.

The three lifecycle skills, their shipped PlanRunV1 machinery, and the
read-only Claude reviewer wrapper ship as the self-versioned `plan-lifecycle`
plugin (`plugins/plan-lifecycle/`), installable from this same marketplace.

| Owner | Skill | Invocation | Responsibility |
|---|---|---|---|
| Workspace | `plan-workspace` | Public | Bootstrap, migrate, audit, or explicitly refresh `docs/plans/`; never mutate an individual plan |
| Orchestration | `plan-manager` | Public, main context | Classify → draft/review/one repair → start → implement/delegate → observed acceptance → finish/archive; list/show/lifecycle and guarded issue publication |
| Draft evidence | `plan-reviewer` | Internal, read-only | Return bound `PlanReviewV1` evidence over one immutable bundle |

These are the only live plan skills. Only `plan-reviewer` ships/gets seeded as a
thin Claude/Codex wrapper; main context invokes `plan-manager` directly. The
docks pipelines route to these skills and stop, naming the missing
`plan-lifecycle` plugin, when they are unavailable.

Current plans contain one current compact-JCS `Plan-run: PlanRunV1` line.
Exact current-user same-domain recovery keeps the stable plan path, appends the
terminal predecessor as validated `Plan-attempt-history`, and installs a fresh
`run_id`; it never creates `v2`/`vN` files or resets predecessor permits.
PlanRunV1 binds repository/path/run identity, cross-repository `goal_id`,
effects/risk, plan/source and acceptance hashes, commits, review budgets, and one blocker.
Reviews reserve before fresh launch; cold reserved state blocks. Every canonical
implementation ends in a bounded exact-diff completion review: one substantive
invocation at local risk, two at sensitive or external risk.

Plan writes use exclusive preimage-checked transactions and major checkpoint
commits only. Every Steps row has `Effect` exactly
`local|probe|production_access|publish|push|release|deploy`; persisted intent is
never external authority. Each non-local action requires exact live current-user
scope/mode/target authority. Schemas 1–6 are historical
validation/quarantine-only, target-locally isolated from unrelated goals.

The complete contract lives in `docs/plans/AGENTS.md`.

## Repository layout

```
.
├── .claude-plugin/marketplace.json   ← marketplace catalog (this file is what /plugin marketplace add reads)
├── .codex/agents/                     ← repo-local Codex plan-reviewer wrapper
├── plugins/
│   ├── docks/                         ← the engineering kit plugin (only plugin dirs get cached on user install)
│   │   ├── .claude-plugin/plugin.json
│   │   ├── skills/                    ← cross-tool skills
│   │   └── README.md                  ← plugin-facing docs
│   ├── plan-lifecycle/                ← docs/plans lifecycle plugin (three plan skills + agents/plan-reviewer.md wrapper)
│   ├── session-relay/                 ← cross-session message-bus plugin
│   └── effect-kit/                    ← Effect-TS skill kit plugin
├── scripts/                           ← plugin-author tooling (NOT shipped to users)
│   ├── ci.mjs / release.mjs           ← orchestrators (the gate ci.yml runs)
│   ├── skills/guard.mjs, agents/guard.mjs + score.mjs
│   └── tree/ + config/ + lib/
└── .github/workflows/ci.yml           ← validator CI on push/PR
```

**What ships to users**: only the `plugins/<name>/` directory of each installed plugin. Files at the repo root (`scripts/`, `.github/`, this `README.md`, `LICENSE`) stay in the marketplace repo for development + CI but are NOT copied to `~/.claude/plugins/cache/` on install. This is enforced by the marketplace `source` boundary, not by an ignore-file mechanism — Claude Code's plugin cache copies only the directory pointed at by `source`.

## Develop locally

Test changes without pushing to GitHub:

```bash
claude --plugin-dir ./plugins/docks
```

When a `--plugin-dir` plugin shares a name with an installed marketplace plugin, the local copy wins for that session. After edits, run `/reload-plugins` in the running session — no Claude Code restart needed.

## Validate before pushing

Four validators mirror the kit-side conventions:

```bash
corepack enable
pnpm install --frozen-lockfile
node scripts/skills/guard.mjs    # Codex + Claude skill compatibility + reference hygiene
node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file   # skill quality score (max 16)
node scripts/agents/guard.mjs    # frontmatter, "Use when…" / "Not…" CSO, model declared
node scripts/agents/score.mjs    # quality score (max 15) — model, tools, Workflow + Success Criteria
```

`--per-file` on a scorer prints one `<name> <score>` line per item — useful for spotting drift after an edit. `node scripts/ci.mjs` runs the full local gate (guards + scorers + manifest + idempotency); `ci.yml` runs that same file on CI.

On a PR to `main`, CI runs only the shards the changed paths resolve to — the repo-wide checks always, plus the lane owning any plugin you touched. On a `<plugin>--v<version>` release tag (docks, session-relay, plan-lifecycle and effect-kit each tag independently), it runs the repo-wide shard plus that plugin's own gate. See `.github/workflows/ci.yml`; full trigger model below.

## Versioning + releases

`version` in `marketplace.json` and `plugins/docks/.claude-plugin/plugin.json` controls update propagation:

- **With explicit version**: users only receive updates when this field bumps. Bump on every release.
- **Without version**: the git commit SHA is used; every commit counts as a new version (noisier but auto-tracking).

`scripts/release.mjs` wraps the full dance in one command (`--dry-run` previews the bump + manifest diff without tagging):

```bash
node scripts/release.mjs patch    # 0.1.0 → 0.1.1
node scripts/release.mjs minor    # 0.1.0 → 0.2.0
node scripts/release.mjs major    # 0.1.0 → 1.0.0
node scripts/release.mjs 0.2.0    # explicit
```

The script bumps the Claude and Codex plugin manifests plus the versioned Claude marketplace catalog, commits + pushes, runs `claude plugin tag --push` for the `docks--v<version>` tag, **waits for the tag-CI run to pass** (`.github/workflows/ci.yml` is triggered by tag pushes), then calls `gh release create` with notes auto-generated from `git log` since the previous tag. If CI fails, the GitHub Release is NOT created — the tag stays as a marker that the release was attempted, and the script prints recovery steps. Released versions appear at https://github.com/DocksDocks/docks/releases.

CI runs only on (a) PRs to main, (b) tag pushes matching `<plugin>--v<version>`, and (c) manual `workflow_dispatch`. Pushes to main don't re-trigger CI — PR validation gates merges, tag-CI gates releases.

Manually: `claude plugin tag --push ./plugins/docks` (tag only, no GitHub Release).

## License

MIT — see `LICENSE` at the repo root.
