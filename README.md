# docks

Claude Code plugin marketplace publishing the **docks** plugin — a multi-agent pipeline kit with 3 slash commands (where parallel-agent value is irreducible), 14 engineering-convention skills, and 20 specialized subagents tiered between Opus and Sonnet per phase.

## Install

```bash
/plugin marketplace add DocksDocks/docks
/plugin install docks@docks
/reload-plugins
```

After install, commands are namespaced as `/docks:security`, `/docks:docs`, `/docks:refactor`. Skills auto-trigger as before (they're `user-invocable: false`, namespacing is invisible at runtime).

## What's in v0.2

The 3 commands kept their multi-agent pipeline:

| Command | Why kept as command |
|---|---|
| `/security` | 3 parallel scanners (vulnerability + logic + adversarial-hunter) + synthesizer challenging every finding — adversarial perspective doesn't compress to a skill |
| `/docs` | 8-phase pipeline for `.claude/skills/` and `.claude/agents/` authoring with structural validators, cross-layer reference checks, skill-maintenance generation |
| `/refactor` | Parallel dead-code + duplication + per-principle SOLID scanners; post-verifier checks for *new* SOLID violations introduced while fixing old ones |

The skills cover everything `/fix`, `/review`, `/test`, `/human-docs`, and `/roadmap-init` used to:

| Skill | Use when |
|---|---|
| `tdd-workflow` | Test-first development; tests as spec for code that doesn't exist yet |
| `test-coverage` | Adding tests to existing code; backfilling coverage |
| `code-review` | Reviewing a path / diff / working tree for bugs, security, perf, AI slop |
| `fix-workflow` | Fixing a specific bug, dependency vuln, or finding from `/security` / `code-review` |
| `human-docs-workflow` | README, CLAUDE.md, docs/, .env.example, JSDoc — every claim grounded in source |
| `design-tokenization` | Color/Tailwind work — semantic + brand tokens, no-hex, `:root`/`.dark` parity |
| `roadmap-init` | Bootstrap `docs/roadmap/` lifecycle convention in a project |
| `dep-vuln-workflow` | CVE/GHSA triage, audit response, package upgrade decisions |
| `lint-no-suppressions` | When tempted to add `eslint-disable` / `@ts-ignore` / `# noqa` |
| `make-interfaces-feel-better` | UI polish, micro-interactions, optical alignment |
| `nextjs-conventions` | Next.js 14+ patterns |
| `react-effect-policy` | React 19 useEffect discipline |
| `react-solid` | SOLID for React component design |
| `typescript-typing` | TS generics, narrowing, branded types |

## Repository layout

```
.
├── .claude-plugin/marketplace.json   ← marketplace catalog (this file is what /plugin marketplace add reads)
├── plugins/
│   └── docks/                         ← the plugin itself (only this gets cached on user install)
│       ├── .claude-plugin/plugin.json
│       ├── skills/, commands/, agents/
│       └── README.md                  ← plugin-facing docs
├── scripts/                           ← plugin-author tooling (NOT shipped to users)
│   ├── guard-skills.sh / score-skills.sh
│   ├── guard-commands.sh / score-commands.sh
│   └── guard-agents.sh / score-agents.sh
└── .github/workflows/ci.yml           ← validator CI on push/PR
```

**What ships to users**: only `plugins/docks/`. Files at the repo root (`scripts/`, `.github/`, this `README.md`, `LICENSE`) stay in the marketplace repo for development + CI but are NOT copied to `~/.claude/plugins/cache/` on install. This is enforced by the marketplace `source` boundary, not by an ignore-file mechanism — Claude Code's plugin cache copies only the directory pointed at by `source`.

## Develop locally

Test changes without pushing to GitHub:

```bash
claude --plugin-dir ./plugins/docks
```

When a `--plugin-dir` plugin shares a name with an installed marketplace plugin, the local copy wins for that session.

After edits, run `/reload-plugins` in the running session — no Claude Code restart needed.

## Validate before pushing

Six validators mirror the kit-side conventions:

```bash
bash scripts/guard-skills.sh     # structural — frontmatter, ≤500 lines, name-matches-dir
bash scripts/score-skills.sh     # quality score (max 16) — Use-when prefix, freshness, BAD/GOOD ratio
bash scripts/guard-commands.sh   # subagent_type cross-refs resolve to plugins/docks/agents/*.md
bash scripts/score-commands.sh   # quality score (max 20) — Plan Mode, Phase Transition, slop
bash scripts/guard-agents.sh     # frontmatter, "Use when…" / "Not…" CSO, model declared
bash scripts/score-agents.sh     # quality score (max 15) — model, tools, Workflow + Success Criteria
```

`--per-file` flag on score scripts prints one `<name> <score>` line per item — useful for spotting drift after an edit.

CI runs all six on every push to `main` and every PR (see `.github/workflows/ci.yml`).

## Versioning + releases

`version` in `marketplace.json` and `plugins/docks/.claude-plugin/plugin.json` controls update propagation:

- **With explicit version**: users only receive updates when this field bumps. Bump on every release.
- **Without version**: the git commit SHA is used; every commit counts as a new version (noisier but auto-tracking).

`scripts/release.sh` wraps the full dance in one command:

```bash
./scripts/release.sh patch    # 0.1.0 → 0.1.1
./scripts/release.sh minor    # 0.1.0 → 0.2.0
./scripts/release.sh major    # 0.1.0 → 1.0.0
./scripts/release.sh 0.2.0    # explicit
```

The script bumps both manifests, commits + pushes, runs `claude plugin tag --push` for the `docks--v<version>` tag, **waits for the tag-CI run to pass** (`.github/workflows/ci.yml` is triggered by tag pushes), then calls `gh release create` with notes auto-generated from `git log` since the previous tag. If CI fails, the GitHub Release is NOT created — the tag stays as a marker that the release was attempted, and the script prints recovery steps. Released versions appear at https://github.com/DocksDocks/docks/releases.

CI runs only on (a) PRs to main, (b) tag pushes matching `docks--v*`, and (c) manual `workflow_dispatch`. Pushes to main don't re-trigger CI — PR validation gates merges, tag-CI gates releases.

Manually: `claude plugin tag --push ./plugins/docks` (tag only, no GitHub Release).

## License

MIT — see `LICENSE` at the repo root.
