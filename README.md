# docks

Claude Code + Codex plugin marketplace publishing the **docks** plugin - a cross-tool engineering skill kit. Pipeline skills (security audit, refactor, skill-agent-pipeline) run sequentially on any agentskills.io runtime; a library of convention skills covers test-first, coverage, fix, review, design tokens, SOLID, type-safety, and React patterns; and a GitHub-issue lifecycle tracks multi-commit work.

## Install

```bash
/plugin marketplace add DocksDocks/docks
/plugin install docks@docks
/reload-plugins
```

## session-relay moved out

session-relay is no longer part of this kit. It lives at
https://github.com/DocksDocks/session-relay and is installed from that repository's own
catalog, in both Claude Code and Codex. This marketplace no longer lists it, and the skills
here neither depend on it nor reference it.

## Platform support

The two plugins that ship from this repository support Linux and macOS only:

| Plugin | Supported hosts |
|---|---|
| `docks` | Linux and macOS only |
| `plan-lifecycle` | Linux and macOS only |

After install, the pipeline skills are user-invocable - ask "run a security audit", "refactor `src/`", or "audit my skills", or invoke `security` / `refactor` / `skill-agent-pipeline` directly. Every other skill auto-triggers by description match; namespacing is invisible at runtime.

## What's inside

### Pipeline skills (sequential, cross-tool)

Each runs as one sequential pass in a single context and gates approval through GitHub plan issues managed by the `plan-manager` skill, not a runtime-specific Plan Mode. Per-phase expertise lives in each skill's `references/`.

| Skill | Pipeline |
|---|---|
| `security` | discovery → vulnerability scan → logic analysis → adversarial hunt → synthesis that challenges every finding. Read-only; pipe findings to `fix-workflow`. |
| `refactor` | exploration → dead-code + duplication scans → SOLID analysis (evidenced smells only) → tiered plan → pre-verify → approve → test-guarded one-change-at-a-time implementation → post-verify SOLID delta. |
| `skill-agent-pipeline` | state detection → explore → categorize skills → content-accuracy audit → pattern-scan → build SKILL.md + references/ → map agent roles → extract agent patterns → build agents (`.claude/agents/*.md` + `.codex/agents/*.toml`) → verify → report, or implement through `plan-manager`. |

### Convention skills

Auto-trigger on matching tasks (all `user-invocable: false` except `make-interfaces-feel-better` and `code-guardrails`, which are also user-invocable):

| Skill | Use when |
|---|---|
| `tdd-workflow` | Test-first development; tests as spec for code that doesn't exist yet |
| `test-coverage` | Adding tests to existing code; backfilling coverage |
| `code-review` | Reviewing a path / diff / working tree for bugs, security, perf, AI slop |
| `accessibility` | Focus management, keyboard handling, ARIA roles/states, accessible names, live regions, landmarks, reduced motion - APG patterns, WCAG 2.2 |
| `code-clarity` | Code that is hard to understand without narration - names, types, function boundaries, comments, docstrings, error messages, test names |
| `code-guardrails` | Strict linter rules for TypeScript (oxlint, anti-slop), Rust, Swift, Python, and Bash - plus one mapped source for constants, values, and test data |
| `commit-discipline` | Splitting work into atomic commits, commit messages, PR descriptions, squash vs merge vs rebase, fixup/autosquash cleanup |
| `fix-workflow` | Fixing a specific bug, dependency vuln, or finding from `security` / `code-review` |
| `design-tokenization` | Color/Tailwind work - semantic + brand tokens, no-hex, `:root`/`.dark` parity |
| `dep-vuln-workflow` | CVE/GHSA triage, audit response, package upgrade decisions |
| `lint-no-suppressions` | When tempted to add `eslint-disable` / `@ts-ignore` / `# noqa` |
| `make-interfaces-feel-better` | UI polish, micro-interactions, optical alignment |
| `react-component-patterns` | React 19+ effects (3 acceptable categories) + composition (compound, slot/`asChild`, polymorphic, headless, provider+hook, cva variants) |
| `solid` | Generic SOLID for TS/Python/Go modules - strategy maps, discriminated unions, fat-interface splits, dependency injection |
| `type-safety-discipline` | Branded/newtype IDs, discriminated unions, parse-don't-validate - TS primary; references for Rust/Kotlin/Python |

The `productivity/` category contains `agent-first-setup`, `context-tree`, `multi-tool-bridge`, `report-skill-issue`, `scaffold`, `skill-agent-pipeline`, `skill-maintenance`, `write-skill`, and `zoom-out`.

### Plan lifecycle (the `plan-lifecycle` plugin)

Directly implement one clear, reversible, low-risk local diff with one bounded
acceptance path; it creates no plan issue, reviewer, or automatic commit. Use
a canonical plan for explicit planning, multi-commit/cross-repository work,
scheduling, cold handoff, unresolved decisions, cross-subsystem/public-contract
changes, security-sensitive/destructive work, or an external effect.

The self-versioned `plan-lifecycle` plugin ships the helper and the canonical
v4 contract. Plans live in GitHub issues, with reviews in issue comments.
Do not track plan bodies as repository files.

| Owner | Responsibility |
|---|---|
| `plan-workspace` skill | Maintain workspace routing |
| Main-context `plan-manager` skill | Decide, draft, research, plan review, implement, code review |
| Internal `plan-reviewer` skill | Review goal fit, research gaps, and security risk |
| Internal `code-reviewer` skill | Review code by lens: correctness, spec and tests, text and safety |
| Read-only `plan-reviewer` and `code-reviewer` wrappers | Run the two review roles; a large code-review round runs three lens reviewers at once, and a round that only checks repairs reviews the changes alone |
| Explicit-only `yolo` skill | Run the whole lifecycle without questions; ask only before merge |

Settle Mode before implementation. `plan-only` stops after plan review;
`plan-and-implement` permits the full lifecycle. A defaulted Mode permits no implementation.
Each non-local step requires an in-session `ask` immediately before it runs.
A user-invoked `yolo` run replaces these asks with the contract's Yolo runs section and asks only before merge.
Merge requires a fresh `Merge now` answer. Without it, leave the pull request open.

Read `skills/productivity/plan-manager/references/plan-contract.md` inside the
installed `plan-lifecycle` plugin for the complete contract and helper commands.
If the plugin is missing, report it. Do not invent a substitute workflow.

## Repository layout

```
.
├── .claude-plugin/marketplace.json   ← marketplace catalog (this file is what /plugin marketplace add reads)
├── .codex/agents/                     ← repo-local Codex plan-reviewer and code-reviewer wrappers
├── plugins/
│   ├── docks/                         ← the engineering kit plugin (only plugin dirs get cached on user install)
│   │   ├── .claude-plugin/plugin.json
│   │   ├── skills/                    ← cross-tool skills
│   │   └── README.md                  ← plugin-facing docs
│   └── plan-lifecycle/                ← GitHub-issue plan lifecycle plugin (lifecycle skills + internal plan-reviewer and code-reviewer skills + explicit-only yolo skill + plan.mjs + marker contract + two read-only reviewer wrappers)
├── scripts/                           ← plugin-author tooling (NOT shipped to users)
│   ├── ci.mjs / release.mjs           ← orchestrators (the gate ci.yml runs)
│   ├── skills/guard.mjs, agents/guard.mjs + score.mjs
│   └── tree/ + config/ + lib/
└── .github/workflows/ci.yml           ← validator CI on PR, release tag, and manual dispatch
```

**What ships to users**: only the `plugins/<name>/` directory of each installed plugin. Files at the repo root (`scripts/`, `.github/`, this `README.md`, `LICENSE`) stay in the marketplace repo for development + CI but are NOT copied to `~/.claude/plugins/cache/` on install. This is enforced by the marketplace `source` boundary, not by an ignore-file mechanism - Claude Code's plugin cache copies only the directory pointed at by `source`.

## Develop locally

Test changes without pushing to GitHub:

```bash
claude --plugin-dir ./plugins/docks
```

When a `--plugin-dir` plugin shares a name with an installed marketplace plugin, the local copy wins for that session. After edits, run `/reload-plugins` in the running session - no Claude Code restart needed.

## Validate before pushing

Four validators mirror the kit-side conventions:

```bash
bun install --frozen-lockfile
bun scripts/skills/guard.mjs    # Codex + Claude skill compatibility + reference hygiene
node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file   # skill quality score (max 16)
bun scripts/agents/guard.mjs    # frontmatter, "Use when…" / "Not…" CSO, no `model` key, tools declared, Workflow + Success Criteria
bun scripts/agents/score.mjs    # quality score (max 15) - no `model` key, tools declared, Workflow + Success Criteria
```

Bun runs this repository's own tooling: `scripts/`, `tests/`, and the plan-lifecycle selftest. Bun is also the package manager. Its version is the `packageManager` pin in `package.json`.

Node runs the shipped plugin files, also inside the gate, because consumers run them with `node`. The `skill-guard.mjs` scorer line above is one of them. Node's version is the `node-version` in `.github/workflows/ci.yml`.

`--per-file` on a scorer prints one `<name> <score>` line per item - useful for spotting drift after an edit. `bun scripts/ci.mjs` runs the full local gate (guards + scorers + manifest + idempotency); `ci.yml` runs that same file on CI.

On a PR to `main`, CI runs only the shards the changed paths resolve to - the repo-wide checks always, plus the lane owning any plugin you touched. On a `<plugin>--v<version>` release tag (docks and plan-lifecycle tag independently), CI resolves the tag to one registry plugin, runs `bun scripts/ci.mjs --lane repo` once over the released bytes, then runs `bun scripts/ci.mjs --plugin <name>` as the authoritative gate. The `--plugin` gate alone skips repo-wide checks. See `.github/workflows/ci.yml`; full trigger model below.

## Versioning + releases

Versions are per plugin. Each plugin's `version` in `plugins/<name>/.claude-plugin/plugin.json`, its `.codex-plugin/plugin.json` mirror, and its entry in `.claude-plugin/marketplace.json` stay in lockstep and control update propagation:

- **With explicit version**: users only receive updates when this field bumps. Bump on every release.
- **Without version**: the git commit SHA is used; every commit counts as a new version (noisier but auto-tracking).

`scripts/release.mjs` releases one plugin per run and wraps the full dance in one command (`--plugin` defaults to `docks`; `--dry-run` previews the bump + manifest diff without tagging):

```bash
bun scripts/release.mjs patch                          # docks: 0.1.0 → 0.1.1
bun scripts/release.mjs minor                          # docks: 0.1.0 → 0.2.0
bun scripts/release.mjs --plugin plan-lifecycle major  # plan-lifecycle: 0.1.0 → 1.0.0
bun scripts/release.mjs --plugin docks 0.2.0           # explicit
```

The script runs `bun scripts/ci.mjs --plugin <name>` as a preflight, bumps that plugin's Claude and Codex manifests plus its entry in the versioned Claude marketplace catalog, commits + pushes, runs `claude plugin tag --push` for the `<name>--v<version>` tag, **waits for the tag-CI run to pass** (`.github/workflows/ci.yml` is triggered by tag pushes), then calls `gh release create` with notes generated from `git log` since the previous tag. If CI fails, the GitHub Release is NOT created - the tag stays as a marker that the release was attempted, and the script prints recovery steps. Released versions appear at https://github.com/DocksDocks/docks/releases.

CI runs only on (a) PRs to main, (b) tag pushes matching `<plugin>--v<version>`, and (c) manual `workflow_dispatch`. Pushes to main don't re-trigger CI - PR validation gates merges, tag-CI gates releases.

Manually: `claude plugin tag --push ./plugins/<name>` (tag only, no GitHub Release).

## License

MIT - see `LICENSE` at the repo root.
