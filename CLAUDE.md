# docks — Claude Code plugin marketplace

This repo is **both a marketplace and a plugin** in the Claude Code plugin system. The marketplace catalog lives at `.claude-plugin/marketplace.json` and points at the plugin under `plugins/docks/` (the only directory cached on user install). Author-side tooling (validators, CI) lives at the repo root and never ships to users.

## Layout

```
.
├── .claude-plugin/marketplace.json    marketplace catalog (publishes the plugin)
├── plugins/docks/                     the plugin (cached on user install)
│   ├── .claude-plugin/plugin.json     plugin manifest
│   ├── skills/   (7 skills)           auto-trigger on relevant tasks
│   ├── commands/ (8 commands)         /docks:security, /docks:fix, …
│   └── agents/   (41 subagents)       per-phase Opus/Sonnet tiering
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
| `scripts/score-skills.sh` | quality score (max 16) | total ≥90, per-file ≥8 |
| `scripts/guard-commands.sh` | subagent_type cross-refs resolve to plugins/docks/agents/*.md | n/a |
| `scripts/score-commands.sh` | quality score (max 20) | total ≥150, per-file ≥17 |
| `scripts/guard-agents.sh` | frontmatter, "Use when…" / "Not…" CSO, model declared | n/a |
| `scripts/score-agents.sh` | quality score (max 15) | total ≥560, per-file ≥11 |

`--per-file` flag on score scripts prints `<name> <score>` lines for drift inspection.

## When editing skills/commands/agents

1. Edit files inside `plugins/docks/{skills,commands,agents}/`
2. Run `bash scripts/ci.sh` — must be green before commit
3. For local Claude Code testing without push: `claude --plugin-dir ./plugins/docks` (and `/reload-plugins` after each edit)
4. PR to main → PR-CI runs and gates the merge
5. After merge, run `./scripts/release.sh patch` to publish

<constraint>
Skills, commands, and agents inside `plugins/docks/` follow the structural rules enforced by the guards. New file → must pass `bash scripts/ci.sh` before commit. Don't loosen the validator floors to make a problematic file pass — fix the file.
</constraint>

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
