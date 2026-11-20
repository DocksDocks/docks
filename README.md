# docks

Native omp plugin marketplace that publishes two plugins:

- **docks** - an engineering skill kit for omp. Pipeline skills (security audit, refactor, skill-agent-pipeline) run sequentially; a library of convention skills covers test-first, coverage, fix, review, design tokens, SOLID, type-safety, and React patterns; two omp extensions check commits and context-tree nodes.
- **plan-lifecycle** - a GitHub-issue plan lifecycle that tracks multi-commit work, with read-only plan and code reviewers.

## Install

```bash
omp plugin marketplace add DocksDocks/docks
omp plugin install docks@docks
omp plugin install plan-lifecycle@docks
```

To update installed copies:

```bash
omp plugin marketplace update docks
omp plugin upgrade docks@docks
omp plugin upgrade plan-lifecycle@docks
```

`omp plugin marketplace update docks` refreshes the catalog only; `omp plugin upgrade` installs the new version. `omp plugin upgrade --dry-run` lists the installed plugins that have a newer version.

After an update, `/reload-plugins` refreshes the skills and task agents of an open session. omp loads the extensions of a plugin only when a session starts, so restart omp after an update that changes an extension.

## Platform support

The two plugins that ship from this repository support Linux and macOS only:

| Plugin | Supported hosts |
|---|---|
| `docks` | Linux and macOS only |
| `plan-lifecycle` | Linux and macOS only |

After install, the pipeline skills are user-invocable - ask "run a security audit", "refactor `src/`", or "audit my skills", or invoke `/skill:security`, `/skill:refactor`, or `/skill:skill-agent-pipeline` directly. Every other skill triggers when its description matches the task. omp keeps the bare skill name: `/skill:<name>` invokes a skill and `skill://<name>` reads it.

## What's inside

### Pipeline skills (sequential)

Each runs as one sequential pass in a single context and gates approval through GitHub plan issues managed by the `plan-manager` skill, not the omp plan mode. Per-phase expertise lives in each skill's `references/`.

| Skill | Pipeline |
|---|---|
| `security` | discovery → vulnerability scan → logic analysis → adversarial hunt → synthesis that challenges every finding. Read-only; pipe findings to `fix-workflow`. |
| `refactor` | exploration → dead-code + duplication scans → SOLID analysis (evidenced smells only) → tiered plan → pre-verify → approve → test-guarded one-change-at-a-time implementation → post-verify SOLID delta. |
| `skill-agent-pipeline` | state detection → explore → categorize skills → content-accuracy audit → pattern-scan → build SKILL.md + references/ → map agent roles → extract agent patterns → build agents (`.omp/agents/*.md`) → verify → report, or implement through `plan-manager`. |

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
| `ci-speed` | Slow or costly CI and test runs - queue time, checkout, installs, caches, lint, type check, tests, sharding, affected-only runs, pre-push hooks, Blacksmith runners with a GitHub-hosted fallback |
| `effect-ts` | TypeScript code that uses Effect v4 - services, layers, typed errors, `@effect/vitest` tests, Effect diagnostics as lint rules, agent rules that keep code on the installed version |

The kit also ships `agent-first-setup`, `claude-md-migration`, `context-tree`, `report-skill-issue`, `skill-maintenance`, `write-skill`, and `zoom-out`.

### Extensions (the `docks` plugin)

`verify-gate` checks each `git commit` that runs through the bash tool for a `Verified:` trailer. The `DOCKS_VERIFY_GATE` environment variable selects the mode: `observe` (default; writes metadata-only lines to `${XDG_STATE_HOME:-~/.local/state}/docks/verify-gate.jsonl`), `enforce`, or `off`. `context-tree-nudge` adds a message after an edit inside a context-tree node. `plugins/docks/README.md` describes both.

### Plan lifecycle (the `plan-lifecycle` plugin)

Directly implement one clear, reversible, low-risk local diff with one bounded
acceptance path; it creates no plan issue, reviewer, or automatic commit. Use
a canonical plan for explicit planning, multi-commit/cross-repository work,
scheduling, cold handoff, unresolved decisions, cross-subsystem/public-contract
changes, security-sensitive/destructive work, or an external effect.

The self-versioned `plan-lifecycle` plugin ships the helper and the canonical
contract. Plans live in GitHub issues, with reviews in issue comments.
Do not track plan bodies as repository files.

| Owner | Responsibility |
|---|---|
| `plan-workspace` skill | Maintain workspace routing |
| Main-context `plan-manager` skill | Decide, draft, research, plan review, implement, code review |
| Internal `plan-reviewer` skill | Review goal fit, research gaps, and security risk |
| Internal `code-reviewer` skill | Review code by lens: correctness, spec and tests, text and safety |
| Read-only `plan-reviewer` and `code-reviewer` wrappers | Run the two review roles as omp task agents; a large code-review round runs three lens reviewers at once, and a round that only checks repairs reviews the changes alone |
| Explicit-only `yolo` skill | Run the whole lifecycle with the grant of the contract's Delegated decisions and without questions; ask only before merge |

Settle Mode before implementation. `plan-only` stops after plan review;
`plan-and-implement` permits the full lifecycle. A defaulted Mode permits no implementation.
Each non-local step requires an in-session `ask` immediately before it runs.
A user-invoked `yolo` run replaces these asks with the contract's Yolo runs section and asks only before merge.
A delegation grant hands the design and tradeoff decisions of a plan to the agent (the contract's Delegated decisions). Its authority comes only from a trusted `Delegation grant:` comment; the Goal's `Delegated:` line mirrors it. It does not replace these asks or the merge question; a `yolo` run includes that grant.
Merge requires a fresh `Merge now` answer. Without it, leave the pull request open.

Read `skill://plan-manager/references/plan-contract.md` in omp for the complete
contract and helper commands of the installed `plan-lifecycle` plugin.
If the plugin is missing, report it. Do not invent a substitute workflow.

## Repository layout

```
.
├── .omp-plugin/marketplace.json       ← marketplace catalog (this file is what omp plugin marketplace add reads)
├── plugins/
│   ├── docks/                         ← the engineering kit plugin (only plugin dirs get cached on user install)
│   │   ├── package.json               ← native omp package manifest (name, version, `omp` object with the extensions)
│   │   ├── skills/                    ← omp skills
│   │   ├── extensions/                ← omp extensions: verify-gate and context-tree-nudge
│   │   └── README.md                  ← plugin-facing docs
│   └── plan-lifecycle/                ← GitHub-issue plan lifecycle plugin
│       ├── package.json               ← native omp package manifest
│       ├── skills/                    ← lifecycle skills, internal reviewer skills, explicit-only yolo skill, plan.mjs, plan contract
│       ├── agents/                    ← two read-only reviewer wrappers (omp task agents)
│       └── test/ + compatibility.json ← self-test and the minimum docks major version
├── scripts/                           ← plugin-author tooling (NOT shipped to users)
│   ├── ci.mjs / release.mjs           ← orchestrators (the gate ci.yml runs)
│   ├── skills/ + agents/ + tree/      ← validators and scorers
│   └── config/ + lib/ + tests/
├── tests/                             ← repo-wide checks (idempotency, skill trigger collisions)
├── .agents/skills/                    ← project skills for this repository: verify (end-to-end omp check), review-benchmark
├── docs/                              ← plan routing (PLAN.md)
├── REVIEW.md                          ← review rules for pull requests
└── .github/workflows/
    ├── ci.yml                         ← validator CI on PR, release tag, and manual dispatch
    └── dependency-integrity.yml       ← weekly npm audit signatures
```

**What ships to users**: only the `plugins/<name>/` directory of each installed plugin. Files at the repo root (`scripts/`, `.github/`, this `README.md`, `LICENSE`) stay in the marketplace repo for development + CI but are NOT copied to the omp plugin cache on install. This is enforced by the marketplace `source` boundary, not by an ignore-file mechanism - the plugin cache copies only the directory pointed at by `source`.

## Develop locally

Test changes without pushing to GitHub. Run the commands from the checkout root. They need `omp`, `node`, `bun`, and `docks-kit`.

The end-to-end check is the `verify` project skill (`.agents/skills/verify/SKILL.md`):

```bash
bun .agents/skills/verify/scripts/omp-smoke.mjs         # install both plugins from this checkout; list versions, skills, task agents, warnings
bun .agents/skills/verify/scripts/omp-smoke.mjs hooks   # drive the verify-gate and context-tree-nudge extensions
```

The smoke installs this checkout into isolated omp state in a docks-kit scratch folder, so it does not change your omp install.

To use the changed plugins in one interactive session, disable the installed `docks@docks` first and enable it again after the session:

```bash
omp plugin disable docks@docks
omp --plugin-dir ./plugins/docks --plugin-dir ./plugins/plan-lifecycle -e ./plugins/docks
omp plugin enable docks@docks
```

`--plugin-dir` loads the skills and task agents of a plugin directory, but not its extensions; `-e ./plugins/docks` loads the extensions that the `omp` object of `plugins/docks/package.json` names. If `docks@docks` stays enabled, omp loads the docks extensions two times, and the gate writes two log lines for each commit. `omp plugin list --json` shows `"enabled": false` for a disabled plugin. After edits, start a new session with the same flags.

## Validate before pushing

```bash
bun install --frozen-lockfile
bun scripts/ci.mjs --plugin <name>   # a change in one plugin
bun scripts/ci.mjs                   # a repo-wide change: both plugins and the repo-wide checks
```

`bun scripts/ci.mjs` is the full local gate: the skill and agent guards, the scorers, the native package checks, and the idempotency check. `ci.yml` runs the same file on CI. `scripts/AGENTS.md` lists each validator with its command and what it checks; each scorer's rubric is in its script. `node plugins/docks/skills/write-skill/scripts/skill-guard.mjs score --per-file` prints one `<name> <score>` line for each docks skill, to find drift after an edit.

Bun runs this repository's own tooling: `scripts/`, `tests/`, and the plan-lifecycle selftest. Bun is also the package manager. Its version is the `packageManager` pin in `package.json`.

Node runs the shipped plugin files that consumers run with `node`, also inside the gate. The `skill-guard.mjs` scorer command above is one of them. Node's version is the `node-version` in `.github/workflows/ci.yml`. The docks omp extensions are the exception: omp loads them into its own process, so the gate tests them on Bun.

On a PR to `main`, CI runs only the shards the changed paths resolve to - the repo-wide checks always, plus the lane owning any plugin you touched. On a `<plugin>--v<version>` release tag (docks and plan-lifecycle tag independently), CI resolves the tag to one registry plugin, runs `bun scripts/ci.mjs --lane repo` once over the released bytes, then runs `bun scripts/ci.mjs --plugin <name>` as the authoritative gate. The `--plugin` gate alone skips repo-wide checks. See `.github/workflows/ci.yml`; full trigger model below.

## Versioning + releases

Versions are per plugin. Each plugin's `version` in `plugins/<name>/package.json` and its entry in `.omp-plugin/marketplace.json` stay in lockstep. omp compares the catalog version when it checks for updates and when it upgrades all plugins:

- **With a version**: users receive an update only when this field changes to a newer version. Bump it on every release.
- **Without a version**: omp does not compare the entry, so it does not find or install updates for that plugin. Every catalog entry in this repository declares a version.

`scripts/release.mjs` releases one plugin per run and wraps the full dance in one command (`--plugin` defaults to `docks`; `--dry-run` previews the bump + manifest diff without tagging):

```bash
bun scripts/release.mjs patch                          # docks: next patch version
bun scripts/release.mjs minor                          # docks: next minor version
bun scripts/release.mjs --plugin plan-lifecycle major  # plan-lifecycle: next major version
bun scripts/release.mjs --plugin docks <X.Y.Z>         # docks: explicit version
```

The script runs `bun scripts/ci.mjs --plugin <name>` as a preflight, bumps that plugin's `package.json` plus its entry in the `.omp-plugin/marketplace.json` catalog, commits + pushes, creates the annotated `<name>--v<version>` tag with `git tag -a` and pushes it, **waits for the tag-CI run to pass** (`.github/workflows/ci.yml` is triggered by tag pushes), then calls `gh release create`. The release notes hold the `git log` subjects since the previous tag and an `## Install` block with the new-install and update commands for that plugin (`releaseInstallText` in `scripts/lib/plugins.mjs`). If CI fails, the GitHub Release is NOT created - the tag stays as a marker that the release was attempted, and the script prints recovery steps. Released versions appear at https://github.com/DocksDocks/docks/releases.

CI runs only on (a) PRs to main, (b) tag pushes matching `<plugin>--v<version>`, and (c) manual `workflow_dispatch`. Pushes to main don't re-trigger CI - PR validation gates merges, tag-CI gates releases.

Manually, from a clean checkout of the release commit (tag only, no GitHub Release):

```bash
v=$(node -p "require('./plugins/<name>/package.json').version")
git tag -a "<name>--v$v" -m "<name> plugin v$v" && git push origin "<name>--v$v"
```

Tag CI fails when the tag version differs from the `package.json` version or from the catalog entry version at the tagged commit.

## License

MIT - see `LICENSE` at the repo root.
