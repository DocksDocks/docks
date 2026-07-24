# docks

A cross-tool engineering skill kit for any agentskills.io runtime (Claude Code, Codex, OpenCode), packaged as a Claude Code plugin. Sequential pipeline skills (security, refactor, skill-agent-pipeline) plus a library of engineering-convention skills.

## Install

```bash
/plugin marketplace add DocksDocks/docks
/plugin install docks@docks
/reload-plugins
```

## Platform support

The `docks` plugin supports Linux and macOS only.

For local development:

```bash
claude --plugin-dir /path/to/docks/plugins/docks
```

When a `--plugin-dir` plugin shares a name with an installed marketplace plugin, the local copy wins for that session. After edits, run `/reload-plugins` — no Claude Code restart needed.

## What's inside

### Pipeline skills

Each runs as one sequential pass in a single context. Approval gates through the `docs/plans/` lifecycle (the `plan-manager` skill), not a runtime-specific Plan Mode. Per-phase expertise lives in each skill's `references/`. The pipeline skills are `user-invocable` — trigger by name or natural language.

| Skill | Pipeline |
|---------|----------|
| `security` | Discovery → Vulnerability Scan → Logic Analysis → Adversarial Hunt → Synthesizer (challenges every finding). Read-only; pipe findings to `fix-workflow`. |
| `skill-agent-pipeline` | Detection → Exploration → \[Categorizer \| Pattern Scanner\] → Skills Builder → \[Role Mapper \| Pattern Extractor\] → Agents Builder (`.md` + `.toml`) → Verifier |
| `refactor` | Exploration → \[Dead Code \| Duplication\] → SOLID Analyzer → Planner → Pre-Verifier → approve → implementation → Post-Verifier (catches NEW SOLID violations introduced while fixing old ones) |

The bracketed phases are independent lenses — a runtime with parallel workers MAY run them concurrently, but the portable default is sequential.

### Skills

Auto-trigger on matching tasks (all `user-invocable: false`). Names stay un-namespaced for invocation since they're model-invoked.

| Skill | Use when |
|---|---|
| `tdd-workflow` | Test-first development; tests as spec for code that doesn't exist yet |
| `test-coverage` | Adding tests to existing code; backfilling coverage |
| `code-review` | Reviewing a path / diff / working tree for bugs, security, perf, AI slop |
| `fix-workflow` | Fixing a specific bug, dependency vuln, or finding from `security` / `code-review` |
| `design-tokenization` | Color/Tailwind work — semantic + brand tokens, no-hex, `:root`/`.dark` parity |
| `dep-vuln-workflow` | CVE/GHSA triage, audit response, package upgrade decisions |
| `lint-no-suppressions` | When tempted to add `eslint-disable` / `@ts-ignore` / `# noqa` |
| `make-interfaces-feel-better` | UI polish, micro-interactions, optical alignment *(vendored, MIT)* |
| `react-component-patterns` | React 19+ effects (3 acceptable categories) + composition (compound, slot/`asChild`, polymorphic, headless, provider+hook, cva variants) |
| `solid` | Generic SOLID for TS/Python/Go modules — strategy maps, discriminated unions, fat-interface splits, dependency injection |
| `type-safety-discipline` | Branded/newtype IDs, discriminated unions, parse-don't-validate — TS primary; references for Rust/Kotlin/Python |

Plus `write-skill`, `multi-tool-bridge`, and `zoom-out` under `productivity/`.

### Plan lifecycle

Directly implement one clear, reversible, low-risk local diff with one bounded
acceptance path; it creates no tracked plan, reviewer, or automatic commit. Use
a canonical plan for explicit planning, multi-commit/cross-repository work,
scheduling, cold handoff, unresolved decisions, cross-subsystem/public-contract
changes, security-sensitive/destructive work, or an external effect.

| Owner | Skill | Invocation | Responsibility |
|---|---|---|---|
| Workspace | `plan-workspace` | Public | Bootstrap, migrate, audit, or explicitly refresh `docs/plans/`; never mutate an individual plan |
| Orchestration | `plan-manager` | Public, main context | Classify → draft/review/one repair → start → implement/delegate → observed acceptance → finish/archive; list/show/lifecycle and guarded issue publication |
| Draft evidence | `plan-reviewer` | Internal, read-only | Return bound `PlanReviewV1` evidence over one immutable bundle |

These are the only live plan skills. Only `plan-reviewer` ships/gets seeded as a
thin Claude/Codex wrapper; main context invokes `plan-manager` directly.

Current plans contain one unfenced compact-JCS `Plan-run: PlanRunV1` line.
PlanRunV1 binds repository/path/run identity, shared cross-repository `goal_id`,
canonical requested effects/risk, plan/source hashes, separate two-permit
draft/completion phases, execution/implementation identities, acceptance
hashes, and at most one typed blocker. Reviews reserve before fresh launch;
stale output is ignored and cold reserved state blocks. Ordinary local work has
no completion reviewer; sensitive/external exact-diff review is bounded to one
review plus one blocker-fix re-review.

Plan writes use exclusive preimage-checked transactions and major checkpoint
commits only. Steps use `Effect` exactly
`local|probe|production_access|publish|push|release|deploy`; persisted intent is
never external authority. Each non-local action needs matching exact live
current-user scope/mode/target authority. Schemas 1–6 are historical
validation/quarantine-only and never block unrelated goals.

## Why sequential, single-context?

Earlier versions ran each pipeline as parallel Claude subagents. The kit now runs each pipeline as one sequential pass so the *same* skill works on every runtime. Plugin-shipped subagents remain Claude-only; Codex can use project-local `.codex/agents/*.toml` custom agents when explicitly delegated, with inline skill execution as the portable fallback. The plan file remains the explicit handoff (inter-phase IPC, auto-compact resilience) and the approval artifact. Each pipeline still uses a **Builder-Verifier** shape: a verifier phase challenges the builder's output (written to the same plan file) before anything is applied.

## Validators (plugin-author tooling)

Quality gates live in the marketplace repo's `scripts/` directory and are NOT shipped to user installs — they validate plugin authoring before release:

- `scripts/skills/guard.mjs` + the bundled `write-skill/scripts/skill-guard.mjs` (`score`) — Codex + Claude compatibility and quality (max 16)
- `scripts/agents/guard.mjs` / `scripts/agents/score.mjs` — structural + quality (max 15)

`node scripts/ci.mjs` runs the full local gate. CI gates merges (PRs to main) and releases (`docks--v*` tag pushes). See [the marketplace repo](https://github.com/DocksDocks/docks) for contributor docs.

## License

MIT
