# docks

Claude Code + Codex plugin marketplace publishing the **docks** plugin — a cross-tool engineering skill kit. Pipeline skills (security audit, refactor, skill-agent-pipeline) run sequentially on any agentskills.io runtime; a library of convention skills covers test-first, coverage, fix, review, human-docs, design tokens, SOLID, type-safety, and React patterns; and a `docs/plans/` lifecycle tracks multi-commit work.

## Install

```bash
/plugin marketplace add DocksDocks/docks
/plugin install docks@docks
/reload-plugins
```

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

### Plan lifecycle

| Phase | Skill | Invocation | Ownership |
|---|---|---|---|
| Workspace | `plan-workspace` | Public | Bootstrap, migrate, audit, or explicitly refresh `docs/plans/`; never draft a plan |
| Create | `plan-creator` | Public | Draft, self-review, and commit one previously nonexistent `planned` or `scheduled` plan |
| Manage | `plan-manager` | Public | Every existing-plan operation, review dispatch/reconciliation, receipt, and lifecycle write |
| Review | `plan-reviewer` | Internal | Return typed read-only evidence over one sealed bundle |
| Repair | `plan-repairer` | Internal | Apply one patch for the exact accepted blocking set or return `cannot_repair` |

Creation returns the committed, read-back `PlanCreatedV1 {plan_path,creation_commit,planned_at_commit,plan_input_sha256,status}` handoff; the creator never reviews or edits that path again. Current review records use schema 6. The manager persists the exact `Review-orchestration-state: <compact JCS object>` record, permits one full round plus at most one repair round per attempt, and returns retryable attempt-1 failures as `stopped`. Only explicit current-user authorization can start same-input attempt 2; another failure is `stuck`, with no automatic reprepare or third attempt. A substantive canonical-input change starts a new attempt 1; metadata-only changes do not count as progress.

Skills are canonical. Only `plan-manager` and `plan-reviewer` ship as thin opus-tier Claude subagents in `plugins/docks/agents/`; only those two may be seeded as project-local Codex wrappers by `plan-workspace` or `scaffold`. The manager is the sole dispatcher/reconciler and lifecycle writer; the reviewer is sealed-bundle evidence-only. Schemas 1–5 remain historical validation/audit-only, and Session transport is never canonical review evidence.

## Repository layout

```
.
├── .claude-plugin/marketplace.json   ← marketplace catalog (this file is what /plugin marketplace add reads)
├── .codex/agents/                     ← repo-local Codex plan wrappers for maintainers
├── plugins/
│   └── docks/                         ← the plugin itself (only this gets cached on user install)
│       ├── .claude-plugin/plugin.json
│       ├── skills/                    ← cross-tool skills
│       ├── agents/                    ← Claude-only plan-lifecycle wrappers
│       └── README.md                  ← plugin-facing docs
├── scripts/                           ← plugin-author tooling (NOT shipped to users)
│   ├── ci.mjs / release.mjs           ← orchestrators (the gate ci.yml runs)
│   ├── skills/guard.mjs, agents/guard.mjs + score.mjs
│   └── scaffold/ + tree/ + config/ + lib/
└── .github/workflows/ci.yml           ← validator CI on push/PR
```

**What ships to users**: only `plugins/docks/`. Files at the repo root (`scripts/`, `.github/`, this `README.md`, `LICENSE`) stay in the marketplace repo for development + CI but are NOT copied to `~/.claude/plugins/cache/` on install. This is enforced by the marketplace `source` boundary, not by an ignore-file mechanism — Claude Code's plugin cache copies only the directory pointed at by `source`.

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

CI runs all of these on every PR to `main` and on every `docks--v*` release tag (see `.github/workflows/ci.yml`; full trigger model below).

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

CI runs only on (a) PRs to main, (b) tag pushes matching `docks--v*`, and (c) manual `workflow_dispatch`. Pushes to main don't re-trigger CI — PR validation gates merges, tag-CI gates releases.

Manually: `claude plugin tag --push ./plugins/docks` (tag only, no GitHub Release).

## License

MIT — see `LICENSE` at the repo root.
