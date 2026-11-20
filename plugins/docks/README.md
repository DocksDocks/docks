# docks

An engineering skill kit for omp, shipped as a native omp plugin. Sequential pipeline skills (security, refactor, skill-agent-pipeline) plus a library of engineering-convention skills.

## Install

```bash
omp plugin marketplace add DocksDocks/docks
omp plugin install docks@docks
```

To update an installed copy:

```bash
omp plugin marketplace update docks
omp plugin upgrade docks@docks
```

Restart omp after an update. omp loads the docks extensions only when a session starts, so an open session keeps the old ones.

## Extensions

The plugin ships two omp extensions:

- `verify-gate` checks each `git commit` that runs through the bash tool for a `Verified:` trailer. A commit that another tool makes does not pass through the gate. The `DOCKS_VERIFY_GATE` environment variable of omp selects the mode: `observe` (default), `enforce`, or `off`. The `commit-discipline` skill describes the trailer and the modes.
- `context-tree-nudge` adds a message after a file edit inside a context-tree node (a folder below the repository root with its own `AGENTS.md`). The message asks the agent to refresh that node.

## Platform support

The `docks` plugin supports Linux and macOS only.

For local development, start omp from the root of a checkout of the marketplace repository:

```bash
omp --plugin-dir ./plugins/docks
```

omp loads the plugin from that directory for the session. After edits, start a new session with the same flag.

## What's inside

### Pipeline skills

Each runs as one sequential pass in a single context. Approval gates through GitHub-issue plans managed by the `plan-manager` skill from the companion `plan-lifecycle` plugin, not a runtime-specific Plan Mode. Per-phase expertise lives in each skill's `references/`. The pipeline skills are `user-invocable` — trigger by name or natural language.

| Skill | Pipeline |
|---------|----------|
| `security` | Discovery → Vulnerability Scan → Logic Analysis → Adversarial Hunt → Synthesizer (challenges every finding). Read-only; pipe findings to `fix-workflow`. |
| `skill-agent-pipeline` | Detection → Exploration → \[Categorizer \| Content-Accuracy Audit \| Pattern Scanner\] → Skills Builder → \[Role Mapper \| Pattern Extractor\] → Agents Builder (`.omp/agents/*.md`) → Verifier |
| `refactor` | Exploration → \[Dead Code \| Duplication\] → SOLID Analyzer → Planner → Pre-Verifier → approve → implementation → Post-Verifier (catches NEW SOLID violations introduced while fixing old ones) |

The bracketed phases are independent lenses — a runtime with parallel workers MAY run them concurrently, but the portable default is sequential.

### Skills

Auto-trigger on matching tasks (all `user-invocable: false` except `make-interfaces-feel-better` and `code-guardrails`, which are also user-invocable). Names stay un-namespaced for invocation since they're model-invoked.

| Skill | Use when |
|---|---|
| `tdd-workflow` | Test-first development; tests as spec for code that doesn't exist yet |
| `test-coverage` | Adding tests to existing code; backfilling coverage |
| `code-review` | Reviewing a path / diff / working tree for bugs, security, perf, AI slop |
| `accessibility` | Focus management, keyboard handling, ARIA roles/states, accessible names, live regions, landmarks, reduced motion — APG patterns, WCAG 2.2 |
| `code-clarity` | Code that is hard to understand without narration — names, types, function boundaries, comments, docstrings, error messages, test names |
| `code-guardrails` | Strict linter rules for TypeScript (oxlint, anti-slop), Rust, Swift, Python, and Bash — plus one mapped source for constants, values, and test data |
| `commit-discipline` | Splitting work into atomic commits, commit messages, PR descriptions, squash vs merge vs rebase, fixup/autosquash cleanup |
| `fix-workflow` | Fixing a specific bug, dependency vuln, or finding from `security` / `code-review` |
| `design-tokenization` | Color/Tailwind work — semantic + brand tokens, no-hex, `:root`/`.dark` parity |
| `dep-vuln-workflow` | CVE/GHSA triage, audit response, package upgrade decisions |
| `lint-no-suppressions` | When tempted to add `eslint-disable` / `@ts-ignore` / `# noqa` |
| `make-interfaces-feel-better` | UI polish, micro-interactions, optical alignment *(vendored, MIT)* |
| `react-component-patterns` | React 19+ effects (3 acceptable categories) + composition (compound, slot/`asChild`, polymorphic, headless, provider+hook, cva variants) |
| `solid` | Generic SOLID for TS/Python/Go modules — strategy maps, discriminated unions, fat-interface splits, dependency injection |
| `type-safety-discipline` | Branded/newtype IDs, discriminated unions, parse-don't-validate — TS primary; references for Rust/Kotlin/Python |
| `ci-speed` | Slow or costly CI and test runs — queue time, checkout, installs, caches, lint, type check, tests, sharding, affected-only runs, pre-push hooks, Blacksmith runners with a GitHub-hosted fallback |
| `effect-ts` | TypeScript code that uses Effect v4 — services, layers, typed errors, `@effect/vitest` tests, Effect diagnostics as lint rules, agent rules that keep code on the installed version |

Plus `agent-first-setup`, `claude-md-migration`, `context-tree`, `report-skill-issue`, `skill-maintenance`, `write-skill`, and `zoom-out`.

### Plan lifecycle (companion plugin)

The plan lifecycle ships separately as the self-versioned `plan-lifecycle`
plugin in this same marketplace. It includes the lifecycle skills, an
explicit-only `yolo` skill that runs the whole lifecycle and asks only before
merge, the shipped `plan.mjs`, a marker-based plan contract, and the read-only
`plan-reviewer` and `code-reviewer` wrappers. Plan repairs are re-reviewed from fresh exports, and
code fixes are re-reviewed from fresh diffs, with a 10-round ceiling in each
review phase. Each reviewer returns one markdown block that the manager stores
as one issue comment. When implementation starts, the manager reuses or creates
the GitHub-linked plan branch. After code review passes, it commits and pushes
any remaining reviewed bytes, opens the closing pull request, waits for
repository CI, and asks `Merge now` or `Leave pull request open`. Without a
fresh `Merge now` answer, it leaves the pull request and issue open. After an
approved merge, `plan.mjs archive` verifies the merged closing pull request.
Every docks route into that lifecycle is fail-loud:

Prerequisite: `plan-lifecycle` must be installed. If `plan-workspace` or `plan-manager` is unavailable, STOP, name the missing `plan-lifecycle` plugin, and do not create or mutate a plan.

Install it alongside docks:

```bash
omp plugin install plan-lifecycle@docks
```

## Why sequential, single-context?

Earlier versions ran each pipeline as parallel Claude subagents. The kit now runs each pipeline as one sequential pass in a single context; that sequential path stays the reference. omp loads the agents that a plugin ships in its `agents/` folder. The plan issue (issue body + review comments) is the explicit handoff (inter-phase IPC, auto-compact resilience) and the approval record. Each pipeline still uses a **Builder-Verifier** shape: a verifier phase challenges the builder's output (recorded in the same plan issue) before anything is applied.

## Validators (plugin-author tooling)

Quality gates live in the marketplace repo's `scripts/` directory and are NOT shipped to user installs — they validate plugin authoring before release:

- `scripts/skills/guard.mjs` + the bundled `write-skill/scripts/skill-guard.mjs` (`score`) — skill frontmatter and quality (max 16)
- `scripts/agents/guard.mjs` / `scripts/agents/score.mjs` — structural + quality (max 15)

`bun scripts/ci.mjs` runs the full local gate. CI gates merges (PRs to main) and releases (`docks--v*` tag pushes). See [the marketplace repo](https://github.com/DocksDocks/docks) for contributor docs.

## License

MIT
