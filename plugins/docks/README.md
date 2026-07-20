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

| Phase | Skill | Invocation | Ownership |
|---|---|---|---|
| Workspace | `plan-workspace` | Public | Bootstrap, migrate, audit, or explicitly refresh `docs/plans/`; never draft a plan |
| Create | `plan-creator` | Public | Draft, self-review, and commit one previously nonexistent `planned` or `scheduled` plan |
| Manage | `plan-manager` | Public | Every existing-plan operation, review dispatch/reconciliation, receipt, and lifecycle write |
| Review | `plan-reviewer` | Internal | Return typed read-only evidence over one sealed bundle |
| Repair | `plan-repairer` | Internal | Apply one patch for the exact accepted blocking set or return `cannot_repair` |

Creation returns the committed, read-back `PlanCreatedV1 {plan_path,creation_commit,planned_at_commit,plan_input_sha256,status}` handoff; the creator never reviews or edits that path again. Current review records use schema 6. The manager persists the exact `Review-orchestration-state: <compact JCS object>` record, permits one full round plus at most one repair round per attempt, and returns retryable attempt-1 failures as `stopped`. Only explicit current-user authorization can start same-input attempt 2; another failure is `stuck`, with no automatic reprepare or third attempt. A substantive canonical-input change starts a new attempt 1; metadata-only changes do not count as progress.

Skills are canonical. Only `plan-manager` and `plan-reviewer` ship as thin opus-tier Claude subagents; only those two may be seeded as project-local Codex wrappers by `plan-workspace` or `scaffold`. The manager is the sole dispatcher/reconciler and lifecycle writer; the reviewer is sealed-bundle evidence-only. Schemas 1–5 remain historical validation/audit-only, and Session transport is never canonical review evidence. In Claude, force-invoke the public manager with `@agent-plan-manager`.

## Why sequential, single-context?

Earlier versions ran each pipeline as parallel Claude subagents. The kit now runs each pipeline as one sequential pass so the *same* skill works on every runtime. Plugin-shipped subagents remain Claude-only; Codex can use project-local `.codex/agents/*.toml` custom agents when explicitly delegated, with inline skill execution as the portable fallback. The plan file remains the explicit handoff (inter-phase IPC, auto-compact resilience) and the approval artifact. Each pipeline still uses a **Builder-Verifier** shape: a verifier phase challenges the builder's output (written to the same plan file) before anything is applied.

## Validators (plugin-author tooling)

Quality gates live in the marketplace repo's `scripts/` directory and are NOT shipped to user installs — they validate plugin authoring before release:

- `scripts/skills/guard.mjs` + the bundled `write-skill/scripts/skill-guard.mjs` (`score`) — Codex + Claude compatibility and quality (max 16)
- `scripts/agents/guard.mjs` / `scripts/agents/score.mjs` — structural + quality (max 15)

`node scripts/ci.mjs` runs the full local gate. CI gates merges (PRs to main) and releases (`docks--v*` tag pushes). See [the marketplace repo](https://github.com/DocksDocks/docks) for contributor docs.

## License

MIT
