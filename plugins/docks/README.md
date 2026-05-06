# docks

A Claude Code plugin packaging the multi-agent pipeline kit: 8 slash commands, 7 engineering-convention skills, and 41 specialized subagents with per-phase Opus/Sonnet model tiering.

## Install

```bash
/plugin marketplace add <github-handle>/docks
/plugin install docks@docks
/reload-plugins
```

For local development:

```bash
claude --plugin-dir /path/to/docks
```

## What's inside

### Commands (8)

All commands are namespaced as `/docks:<name>` once installed.

| Command | Pipeline |
|---------|----------|
| `/docks:security` | Discovery → \[Scanner \| Analyzer \| Hunter\] → Synthesizer |
| `/docks:fix` | Exploration → \[Code Scanner \| Dependency Scanner\] → Planner → Verifier |
| `/docks:review` | Exploration → Analyzer → Verifier |
| `/docks:test` | Exploration → Analyzer → Generator → Verifier |
| `/docks:docs` | Detection → Exploration → \[Categorizer \| Scanner\] → Skills Builder → \[Role Mapper \| Pattern Extractor\] → Agents Builder → Verifier |
| `/docks:human-docs` | Exploration → Analyzer → Writer → Verifier |
| `/docks:refactor` | Exploration → \[Dead Code \| Duplication\] → SOLID Analyzer → Planner → Verifier |
| `/docks:roadmap-init` | Single-session scaffolder for `docs/roadmap/` lifecycle folders |

All analysis commands enforce **Plan Mode** — read-only analysis first, user approval gate via `ExitPlanMode`, then implementation.

### Skills (7)

Auto-trigger on matching tasks (all `user-invocable: false`). Names stay un-namespaced for invocation since they're model-invoked.

- `dep-vuln-workflow` — `pnpm/npm audit`, CVE/GHSA advisories, peer-dep conflicts
- `lint-no-suppressions` — eslint-disable / @ts-ignore / # noqa decision tree
- `nextjs-conventions` — Next.js 13/14/15/16 App Router, Server Components, `proxy.ts`
- `react-effect-policy` — 6 useEffect anti-patterns + React 19 replacements
- `solid` — Generic SOLID for TS/Python/Go modules — strategy maps, discriminated unions, fat-interface splits, dependency injection
- `react-reuse-components` — React composition patterns: compound components, slots/`asChild`, polymorphic `as`, headless hooks, provider+hook, variant systems (cva)
- `typescript-typing` — `any` vs `unknown`, discriminated unions, branded IDs, parse-don't-assert
- `make-interfaces-feel-better` *(vendored, MIT)* — UI polish: concentric radius, optical alignment, motion

### Agents (41)

12 Opus + 29 Sonnet, one per phase of each command. Synthesizers, analyzers with semantic reasoning, planners, and creative/adversarial work run on Opus 4.7. Exploration, pattern scanning, and mechanical verification run on Sonnet 4.6.

Force-invoke any agent directly with `@agent-<name>` (e.g. `@agent-refactor-solid-analyzer audit src/services/`).

## Why pipelines and not single-session?

The kit deliberately uses sequential subagent pipelines despite Anthropic's general guidance against them, because:

1. **Files-as-handoff** — the plan file IS the explicit context-passing mechanism, not an inherited compressed summary
2. **Per-phase model tiering** saves ~70% vs. all-Opus single session
3. **No summary compression** — subagents bootstrap from the plan file rather than inheriting a compressed parent context

Most pipelines use a **Builder-Verifier pattern** for quality assurance.

## Validators

Quality gates for kit hygiene (kept in the upstream config repo, not bundled with the plugin):

- `bash guard-skills.sh` — structural checks (frontmatter, name-matches-dir, body ≤500 lines)
- `bash score-skills.sh` — quality score (max 16)
- `bash guard-commands.sh` / `score-commands.sh` — same for commands
- `bash guard-agents.sh` / `score-agents.sh` — same for agents

## License

MIT
