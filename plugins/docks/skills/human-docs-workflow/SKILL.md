---
name: human-docs-workflow
description: Use when generating, fixing, or auditing project-level prose documentation — README.md, AGENTS.md, CLAUDE.md, docs/**/*.md, .env.example, API references, JSDoc/TSDoc. Distinguishes human-readable docs (prose, runnable commands, API specs) from AI-optimized docs (AGENTS.md as cross-tool source of truth, CLAUDE.md as Claude-specific extension, agent context). Every claim grounded in source code with file:line evidence. Not for project skill / agent authoring (use /docs which has irreducible 8-phase pipeline value for that).
user-invocable: false
metadata:
  pattern: tool-wrapper
  updated: "2026-05-06"
---

# Human Docs Workflow

<constraint>
Every concrete claim in documentation MUST be verifiable against current source code. API endpoints must exist as actual route handlers (not constants in a config file). Env vars must be referenced in source somewhere. File paths must resolve. CLI commands must run. A doc that says "the /healthz endpoint returns server status" without a real handler at that route is wrong on day one — and worse on day 90 when someone trusts it.
</constraint>

<constraint>
Format follows audience. Human-readable docs (README.md, docs/**/*.md, CONTRIBUTING.md) are prose-led: explain WHY, then HOW, with copy-paste-runnable commands and screenshots when helpful. AI-optimized docs (AGENTS.md, CLAUDE.md, agent context files) are dense bullets, tables, file:line references, and constraints — no narrative paragraphs, no marketing language. Mixing the two formats produces docs that are bad at both jobs.
</constraint>

<constraint>
No "AI slop" — phrases that signal generated-without-grounding text. See `references/slop-words.md` for the banned-phrase list and the rewrite pattern. If a sentence could appear in any project's README without modification, it doesn't belong in this project's README. Replace with project-specific facts (concrete numbers, real file paths, actual stack components).
</constraint>

## When to Use

- Bootstrapping documentation for a new project (README.md doesn't exist or is the framework's default)
- Auditing existing docs for accuracy after a refactor / migration / dependency upgrade
- Specific doc surface needs work — README, AGENTS.md, CLAUDE.md, docs/, .env.example, JSDoc
- Onboarding gap reported ("new contributors can't get the dev env running")
- Pre-release sweep — make sure docs match what shipped

NOT for:
- Project skill / agent authoring — use `/docs` command (8-phase pipeline with skill-maintenance generation, structural validators, cross-layer reference checks — irreducible value)
- Public marketing pages or blog posts (different writing constraints)
- API reference generation FROM source (use the language's standard tool — TypeDoc, Sphinx, godoc — and link to its output from the README)

## Doc Categories

Every `.md` file in the project belongs to one of three categories. Treat them differently.

| Category | Audience | Format | Examples |
|---|---|---|---|
| Human-readable | Developers, contributors, end-users | Prose + commands + screenshots | `README.md`, `docs/getting-started.md`, `CONTRIBUTING.md`, `CHANGELOG.md` |
| AI-optimized (cross-tool) | Any agent (Codex, Claude Code, OpenCode, Copilot…) via AGENTS.md spec | Dense bullets, tables, file:line, constraints, no narrative | `AGENTS.md`, `.agents/skills/*/SKILL.md`, agent definition files |
| AI-optimized (Claude-specific) | Claude Code only — uses Plan Mode, subagent_type, Anthropic harness features | Same density, plus Claude-specific syntax | `CLAUDE.md`, `.claude/skills/*/SKILL.md`, `.claude/agents/*.md`, `.claude/commands/*.md` |
| Keep-as-is | Generated, vendored, or owned by another tool | Don't touch | `pnpm-lock.yaml` adjacent docs, vendored README copies, generated API references |

Inspect every `.md` and classify before writing. Mis-categorizing turns AGENTS.md/CLAUDE.md into marketing copy or README.md into a constraint dump — both fail their audience. **AGENTS.md is the source of truth for cross-tool projects**; CLAUDE.md either inherits it via `@AGENTS.md` import (preferred) or holds Claude-only additions below the import.

## The Six-Step Procedure

### Step 1 — Catalog

```bash
# Find every .md and inventory
find . -name "*.md" -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./dist/*"

# Note presence of these specific surfaces
test -f README.md && echo "README.md exists" || echo "README MISSING"
test -f AGENTS.md && echo "AGENTS.md exists (cross-tool source of truth)" || echo "AGENTS.md MISSING"
test -f CLAUDE.md && echo "CLAUDE.md exists" || echo "CLAUDE.md MISSING"
[ -f CLAUDE.md ] && grep -q '^@AGENTS\.md' CLAUDE.md && echo "  ↳ CLAUDE.md is a @AGENTS.md import"
test -f .env.example && echo ".env.example exists" || echo ".env.example MISSING"
test -d docs && ls docs/ | head -10 || echo "no docs/ dir"
```

For each file, capture: path, current size (lines), last-modified date (`git log -1 --format=%ai -- <file>`).

### Step 2 — Sniff project stack

```bash
# Detect what the project actually IS
test -f package.json && jq -r '.name, .description, .scripts' package.json
test -f pyproject.toml && head -20 pyproject.toml
test -f Cargo.toml && head -20 Cargo.toml
test -f go.mod && head -3 go.mod
```

This is what the docs need to describe. Skip this and you'll write generic descriptions of "a Node.js project" instead of "a Vite + React 19 + TypeScript electron app with vitest".

### Step 3 — Categorize each .md

Apply the three-category rule from "Doc Categories" above. Build a table:

```text
| File                     | Category            | Last touched  | Action       |
|--------------------------|---------------------|---------------|--------------|
| README.md                | human               | 2025-09-12    | UPDATE       |
| AGENTS.md                | ai-optimized cross  | 2026-05-11    | KEEP         |
| CLAUDE.md                | ai-optimized claude | 2026-04-30    | KEEP         |
| docs/architecture.md     | human               | 2024-11-03    | REWRITE      |
| docs/api/v1.md           | human               | 2026-05-01    | UPDATE       |
| .env.example             | (special)           | 2026-02-14    | UPDATE       |
| pnpm-lock.yaml           | keep-as-is          | n/a           | LEAVE        |
```

For each `UPDATE` / `REWRITE` action, identify the specific deficiency: missing API route, stale env var list, broken command, version mismatch, lack of screenshots, prose in AGENTS.md/CLAUDE.md, etc.

### Step 4 — Draft (per category)

Write drafts using the format that matches the category. Don't write into the live files yet — drafts go in scratch (or in your output) so Step 5 can verify them before they land.

**Human-readable drafts** — prose-led, command-runnable. README structure that works:

```text
# <Project name>

<one-paragraph description: what + why, ≤3 sentences>

## Quick start

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

## Stack
<bullet list with versions: React 19, Vite 6, TypeScript 5.4, …>

## Common commands
<table: command | purpose>

## Project layout
<2-level tree of important folders, with one-line descriptions>

## Environment
<link to .env.example, mention the variables that gate dev>

## Contributing
<link to CONTRIBUTING.md or 1-paragraph workflow>
```

**AI-optimized drafts** (AGENTS.md, CLAUDE.md, skills, agents) — dense, evidence-backed:

```text
## <Section>

<bullet list with file:line refs>

| <attribute> | <value> |
|-----------|---------|
| <fact>    | <fact>  |

<constraint>
<binding rule>
</constraint>
```

Never write narrative paragraphs in AI-optimized docs — they waste token budget and dilute the rule density that any agent (Codex, Claude Code, etc.) actually reads.

**.env.example drafts** — grouped by purpose, every var commented with what it gates:

```text
# === Database ===
# PostgreSQL connection string used by src/db/client.ts. Required.
DATABASE_URL=postgres://user:pass@localhost:5432/myapp

# === Auth ===
# Secret used to sign session JWTs in src/auth/session.ts. 32+ random bytes.
SESSION_SECRET=
```

### Step 5 — Pre-verify drafts against source

For each draft, validate every concrete claim:

| Claim type | How to verify |
|---|---|
| API route exists | `grep -rn "router.<method>(\"/<path>\"" src/` returns the handler |
| Env var is used | `grep -rn "<VAR_NAME>" src/` shows usage |
| File path exists | `test -f <path>` exits 0 |
| CLI command works | Try-run if safe (e.g., `pnpm test --help`); else cite the script entry from `package.json` |
| Version cited | Matches `package.json` / lockfile |
| Stack component | Listed in dependencies, not just description |

Spot-check at least 5 file:line references per draft. If any are wrong, redo the draft — partial inaccuracy is contagious.

Scan for AI slop terms in the draft. If found, replace with project-specific facts.

### Step 6 — Apply, then post-verify

Write each pre-verified draft to its destination using `Write` (new file) or `Edit` (targeted change). Don't rewrite drafts from memory at apply-time — apply the verified text exactly.

After applying:

```bash
git diff --stat                  # confirm scope of changes
git diff <file>                  # spot-check each updated file
```

Re-run the verification queries from Step 5 against the live files. If any claim that was true in the draft is now wrong (because the diff drifted, or because the draft cited an in-progress feature that didn't ship), revert that section immediately with `git restore` or another `Edit`.

## Common Traps

| Trap | Wrong fix | Right fix |
|---|---|---|
| README written without reading the code | "It's a TypeScript project that helps developers be more productive" | Read `package.json`, name the actual stack components, cite real entry points |
| AI slop terms in AGENTS.md/CLAUDE.md | Marketing-style phrases (see `references/slop-words.md` for the list) | "Auth uses JWT in `src/auth/session.ts:42`; sessions expire after 1h." |
| Stale API docs after a route rename | Search-replace the old path everywhere | Re-grep for the route handler in source; update docs to match what's actually wired |
| Documenting features that don't ship yet | Adding planned APIs to `docs/api/v1.md` | Document only what's in `main` (or whatever the docs branch tracks); planned work goes to `docs/plans/` (see `plan-init` skill) |
| .env.example without comments | Bare `DATABASE_URL=` line | Group + describe what each var gates, cite source files that read it |
| README with marketing language | "World-class developer experience" | Concrete facts: "Hot reload via Vite. Type-checks on save via tsc-watch." |
| Mixing prose + bullets in AGENTS.md/CLAUDE.md | Two paragraphs of context before a constraint | These are reference material — bullets, tables, file:line. Save prose for human-readable docs. |
| Doc says "TODO: explain this" | Ship the TODO | Either explain it now or remove the section. TODOs in shipped docs become permanent. |

## Anti-Hallucination Checks

- For every API endpoint cited, verify the route handler exists in code (`grep`/`Read`)
- For every env var cited, verify it's referenced in source (`grep`)
- For every CLI command cited, verify it's defined (script in `package.json`, target in `Makefile`, etc.)
- For every version number cited, verify it matches the lockfile (not just the description's claim)
- After writing, run `git diff` and re-read the change — drift between draft and applied text happens silently

## References

- Companion skills: `plan-init` (for the `docs/plans/` 5-category lifecycle convention — multi-commit work plans don't belong inline in `docs/`); `lint-no-suppressions` (when CI greps a doc check rule and you're tempted to silence it)
- Companion command: `/docs` — for `.claude/skills/` and `.claude/agents/` authoring (different audience, different validators, irreducible 8-phase pipeline value)
- Kit-level `## Agentic Harness Heuristics`: rule #3 (multi-pass search) for Step 1 cataloging, rule #4 (trace symbols) before citing them
