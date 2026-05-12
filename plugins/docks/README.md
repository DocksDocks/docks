# docks

A Claude Code plugin packaging the multi-agent pipeline kit: slash commands where parallel-agent value is irreducible, engineering-convention skills, and specialized subagents with per-phase Opus/Sonnet model tiering.

## Install

```bash
/plugin marketplace add DocksDocks/docks
/plugin install docks@docks
/reload-plugins
```

For local development:

```bash
claude --plugin-dir /path/to/docks/plugins/docks
```

When a `--plugin-dir` plugin shares a name with an installed marketplace plugin, the local copy wins for that session. After edits, run `/reload-plugins` — no Claude Code restart needed.

## What's inside

### Commands

All commands are namespaced as `/docks:<name>` once installed. The kit deliberately keeps only commands where parallel-agent orchestration adds structural value the model can't compress into a single session.

| Command | Pipeline |
|---------|----------|
| `/docks:security` | Discovery → \[Vulnerability Scanner \| Logic Analyzer \| Adversarial Hunter\] → Synthesizer (challenges every finding) |
| `/docks:docs` | Detection → Exploration → \[Categorizer \| Pattern Scanner\] → Skills Builder → \[Role Mapper \| Pattern Extractor\] → Agents Builder → Verifier |
| `/docks:refactor` | Exploration → \[Dead Code \| Duplication\] → SOLID Analyzer → Planner → Pre-Verifier → (implementation) → Post-Verifier (catches NEW SOLID violations introduced while fixing old ones) |

Each command enforces **Plan Mode** — read-only analysis first, user approval gate via `ExitPlanMode`, then implementation.

### Skills

Auto-trigger on matching tasks (all `user-invocable: false`). Names stay un-namespaced for invocation since they're model-invoked.

| Skill | Use when |
|---|---|
| `tdd-workflow` | Test-first development; tests as spec for code that doesn't exist yet |
| `test-coverage` | Adding tests to existing code; backfilling coverage |
| `code-review` | Reviewing a path / diff / working tree for bugs, security, perf, AI slop |
| `fix-workflow` | Fixing a specific bug, dependency vuln, or finding from `/security` / `code-review` |
| `human-docs-workflow` | README, AGENTS.md, CLAUDE.md, docs/, .env.example, JSDoc — every claim grounded in source |
| `design-tokenization` | Color/Tailwind work — semantic + brand tokens, no-hex, `:root`/`.dark` parity |
| `plan-init` | Bootstrap `docs/plans/` 5-category lifecycle (planned/ongoing/blocked/scheduled/finished) in a project |
| `dep-vuln-workflow` | CVE/GHSA triage, audit response, package upgrade decisions |
| `lint-no-suppressions` | When tempted to add `eslint-disable` / `@ts-ignore` / `# noqa` |
| `make-interfaces-feel-better` | UI polish, micro-interactions, optical alignment *(vendored, MIT)* |
| `react-component-patterns` | React 19+ effects (3 acceptable categories) + composition (compound, slot/`asChild`, polymorphic, headless, provider+hook, cva variants) |
| `solid` | Generic SOLID for TS/Python/Go modules — strategy maps, discriminated unions, fat-interface splits, dependency injection |
| `type-safety-discipline` | Branded/newtype IDs, discriminated unions, parse-don't-validate — TS primary; references for Rust/Kotlin/Python |

### Agents

Model tiering is per phase. Synthesizers, planners, semantic analyzers, and adversarial work run on Opus 4.7 (creative + judgment-heavy). Exploration, pattern scanning, and mechanical verification run on Sonnet 4.6 (faster + cheaper for enumeration work).

Force-invoke any agent directly with `@agent-<name>` (e.g. `@agent-refactor-solid-analyzer audit src/services/`).

## Why pipelines and not single-session?

The kit deliberately uses sequential subagent pipelines despite Anthropic's general guidance against them, because:

1. **Files-as-handoff** — the plan file IS the explicit context-passing mechanism, not an inherited compressed summary
2. **Per-phase model tiering** saves tokens vs. an all-Opus single session
3. **No summary compression** — subagents bootstrap from the plan file rather than inheriting a compressed parent context

Most pipelines use a **Builder-Verifier pattern** for quality assurance: the verifier sees the same plan file the builder consumed and challenges its output before it's applied.

## Validators (plugin-author tooling)

Quality gates live in the marketplace repo's `scripts/` directory and are NOT shipped to user installs — they validate plugin authoring before release:

- `guard-skills.sh` / `score-skills.sh` — structural + quality (max 16)
- `guard-commands.sh` / `score-commands.sh` — structural + quality (max 21)
- `guard-agents.sh` / `score-agents.sh` — structural + quality (max 15)

CI gates merges (PRs to main) and releases (`docks--v*` tag pushes). See [the marketplace repo](https://github.com/DocksDocks/docks) for contributor docs.

## License

MIT
