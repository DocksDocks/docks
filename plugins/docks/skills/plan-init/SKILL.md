---
name: plan-init
description: Use when bootstrapping the docs/plans/ convention in a new or existing project — creates planned/ongoing/blocked/scheduled/finished subdirectories with .gitkeep, writes a plans-local AGENTS.md (5-category lifecycle, multi-occupancy rule, scheduled-date trigger, pretty-print contract) plus a one-line CLAUDE.md shim that does @AGENTS.md for Claude Code discovery, and appends a Plans section to the root AGENTS.md (or root CLAUDE.md if AGENTS.md is absent). Idempotent — re-running on a project that already has docs/plans/ is a no-op for existing files.
user-invocable: false
metadata:
  pattern: tool-wrapper
  updated: "2026-05-11"
---

# Plans Directory Bootstrapper

<constraint>
All paths are RELATIVE to the project working directory at invoke time. Never write to absolute kit paths or to a different project. If `git rev-parse --show-toplevel` succeeds, prefer that as the project root; otherwise use the current working directory.
</constraint>

<constraint>
Idempotency is the recovery mechanism. For each target (the 5 lifecycle directories, the local AGENTS.md, the local CLAUDE.md shim, and the project root config file), check existence FIRST. Targets that already exist are SKIP and never get touched. Re-running on a fully-bootstrapped project must be a complete no-op — `git status --short` after the run must show nothing new for skipped targets.
</constraint>

<constraint>
Detection is read-only. Before any write, classify every target with `Read`/`Glob`/`Grep` and read-only `Bash` (`test`, `ls`, `stat`, `git status`/`rev-parse`). Only after the classification table is produced do you switch to `Write`/`Edit`/`mkdir`/`touch`. Never write blindly.
</constraint>

## When to Use

- Setting up a new project that will accumulate multi-commit work plans
- Adding the plans convention to an existing project that doesn't have one
- Re-running on a project that already has partial scaffolding (the run is idempotent)
- The user says "set up plans", "bootstrap plans", "add the docs/plans convention", or the historical "set up roadmap" / "bootstrap roadmap" (this skill supersedes the older `roadmap-init`)

The convention is **cross-tool**: AGENTS.md is the source of truth (read by Codex, Claude Code via @import, OpenCode, VS Code Copilot, and any other agentskills.io / agents.md-compliant runtime). The `docs/plans/CLAUDE.md` shim exists only because Claude Code's nested-directory discovery natively reads CLAUDE.md, not AGENTS.md.

## Workflow

### Step 1 — Resolve project root

```bash
git rev-parse --show-toplevel 2>/dev/null || pwd
```

All subsequent paths are relative to this. If the working directory is not a git repo, the command falls back to `pwd` and the bootstrap proceeds — the convention works in non-git directories too, the lifecycle just relies on filesystem moves instead of `git mv`.

### Step 2 — Detect existing state (read-only)

For each of the five scaffolding directories and the two plans-local config files, classify as `CREATE` or `SKIP (exists)`:

```bash
test -d docs/plans/planned    && echo "SKIP planned/"   || echo "CREATE planned/"
test -d docs/plans/ongoing    && echo "SKIP ongoing/"   || echo "CREATE ongoing/"
test -d docs/plans/blocked    && echo "SKIP blocked/"   || echo "CREATE blocked/"
test -d docs/plans/scheduled  && echo "SKIP scheduled/" || echo "CREATE scheduled/"
test -d docs/plans/finished   && echo "SKIP finished/"  || echo "CREATE finished/"
test -f docs/plans/AGENTS.md  && echo "SKIP plans AGENTS.md" || echo "CREATE plans AGENTS.md"
test -f docs/plans/CLAUDE.md  && echo "SKIP plans CLAUDE.md shim" || echo "CREATE plans CLAUDE.md shim"
```

For the project's **root config file**, the classification picks AGENTS.md as the primary target (cross-tool source of truth) and falls back to CLAUDE.md only if AGENTS.md is absent:

- `AGENTS.md` EXISTS, contains literal `docs/plans` → `SKIP (already references)`
- `AGENTS.md` EXISTS, no match → `APPEND PLANS SECTION to AGENTS.md`
- `AGENTS.md` MISSING but `CLAUDE.md` EXISTS, contains `docs/plans` → `SKIP (already references)`
- `AGENTS.md` MISSING but `CLAUDE.md` EXISTS, no match → `APPEND PLANS SECTION to CLAUDE.md`
- Both MISSING → `CREATE STUB AGENTS.md` (write a minimal AGENTS.md whose only content is the Root Snippet below)

Use `grep -l 'docs/plans' AGENTS.md CLAUDE.md 2>/dev/null` to discriminate the existing-but-not-referencing cases.

### Step 3 — Show the user a classification table

```
| Target                            | Action | Reason                       |
|-----------------------------------|--------|------------------------------|
| docs/plans/planned/.gitkeep       | CREATE | not present                  |
| docs/plans/ongoing/.gitkeep       | CREATE | not present                  |
| docs/plans/blocked/.gitkeep       | CREATE | not present                  |
| docs/plans/scheduled/.gitkeep     | CREATE | not present                  |
| docs/plans/finished/.gitkeep      | CREATE | not present                  |
| docs/plans/AGENTS.md              | CREATE | not present                  |
| docs/plans/CLAUDE.md              | CREATE | @AGENTS.md shim              |
| AGENTS.md (root)                  | APPEND | exists, no docs/plans ref    |
```

No separate approval gate — the work is mechanical and idempotent. Proceed to Step 4 in the same turn.

### Step 4 — Apply (writes happen here)

For each target classified `CREATE` / `CREATE STUB` / `APPEND PLANS SECTION`:

1. **Lifecycle directories + `.gitkeep`** — for each of `planned/`, `ongoing/`, `blocked/`, `scheduled/`, `finished/`:
   ```bash
   mkdir -p docs/plans/<folder>
   touch docs/plans/<folder>/.gitkeep
   ```
2. **`docs/plans/AGENTS.md`** — write the verbatim content from `references/plans-agents-md-template.md`, substituting `{{ISO_DATE}}` placeholders with the output of `date +"%Y-%m-%dT%H:%M:%S%:z"`.
3. **`docs/plans/CLAUDE.md`** — write a one-line shim so Claude Code's nested-directory CLAUDE.md discovery finds the same content:
   ```markdown
   @AGENTS.md
   ```
   (Single line, no trailing newline ambiguity. Claude Code resolves the `@` import relative to the file's directory, so this picks up `docs/plans/AGENTS.md`.)
4. **Root config file** —
   - `CREATE STUB AGENTS.md`: write `AGENTS.md` with exactly the **Root Snippet** below (nothing else).
   - `APPEND PLANS SECTION to AGENTS.md`: read `AGENTS.md`, append one blank line + the Root Snippet, write back.
   - `APPEND PLANS SECTION to CLAUDE.md`: read `CLAUDE.md`, append one blank line + the Root Snippet, write back.
   - `SKIP`: no action.

Skip any target that Step 2 classified `SKIP`.

### Step 5 — Verify and report

```bash
ls -la docs/plans/ docs/plans/planned docs/plans/ongoing docs/plans/blocked docs/plans/scheduled docs/plans/finished
git status --short
```

Final report: a single bullet list of created vs skipped paths, followed by the captured `ls` and `git status --short` outputs. No prose narration.

## Root Snippet

The exact text to write as a stub or append to an existing `AGENTS.md` (or `CLAUDE.md` when AGENTS.md is absent):

```markdown
## Plans

<constraint>
Multi-commit work plans live in `docs/plans/{planned,ongoing,blocked,scheduled,finished}/`. Every plan file is a complete handoff document — `goal`, structured `Steps`, `Mistakes & Dead Ends`, `Sources`, `Review` — so any agent can pick one up cold without conversation context. Skills handle every operation: `plan-init` (bootstrap), `plan-manager` (list/show/resume/start/new/fire), `plan-review` (verification). Trigger by natural language ("create docs/plans", "list plans", "review plan <slug>") — there is no slash command. Every category is multi-occupancy.
</constraint>

The full convention (frontmatter schema, body section order, 3-tier pretty-print contract, category-specific age tokens) lives in `docs/plans/AGENTS.md`. `docs/plans/CLAUDE.md` is a one-line `@AGENTS.md` import for Claude Code's nested-directory discovery.
```

When appending to an existing file, prepend a single blank line for visual separation. When creating a stub, the snippet IS the entire file.

## Common Traps

| Trap | Wrong fix | Right fix |
|---|---|---|
| Writing to the wrong project root because that's where the user is | Hardcoded absolute path | Always resolve `git rev-parse --show-toplevel` or `pwd` first; treat that as the root |
| Overwriting an existing `docs/plans/AGENTS.md` with a fresh template | Re-running the bootstrap rewrites in-flight customizations | `test -f` check before writing; never overwrite a file the user has touched |
| Appending the Plans section twice on a re-run | `Edit` without checking for existing `docs/plans` token | `grep -l 'docs/plans' AGENTS.md CLAUDE.md 2>/dev/null` first; SKIP if matched |
| Creating an empty stub when the user has an AGENTS.md or CLAUDE.md but it's small | Treating "small" as "missing" | Existence check is the only gate — file size doesn't matter |
| Trying to migrate `docs/roadmap/` here | Mixing bootstrap with migration paths | Bootstrap only handles greenfield; for a `docs/roadmap/` directory, file a separate plan via `plan-manager` ("new plan migrate-roadmap") and migrate by hand |
| Enforcing single-occupancy in any category | Refusing to create a second ongoing plan because one already exists | Multi-occupancy is the rule everywhere — never block on destination count |
| Writing `docs/plans/CLAUDE.md` with the full template body | Duplicates the AGENTS.md content; drifts on edits | CLAUDE.md is a one-line `@AGENTS.md` shim only — single source of truth lives in AGENTS.md |
| Skipping verification at the end | Trusting the writes worked | `test -f` each created path and grep `docs/plans/AGENTS.md` for the literal heading `## Multi-occupancy` |

## Anti-Hallucination Checks

- Before reporting "created", run `test -f <path>` and confirm exit 0
- Before reporting "skipped", confirm Step 2 classified it as `SKIP` — do not invent skips
- Do not claim the root config file was updated unless `grep "docs/plans" AGENTS.md CLAUDE.md 2>/dev/null` matches a line you actually added in this run
- Do not claim `docs/plans/CLAUDE.md` was written unless its content is exactly `@AGENTS.md` (one line) — if it contains the full template body, the bootstrap is wrong
- The `git status --short` output at the end MUST show only the paths you created/edited; if it shows others, investigate before reporting "done"

## References

- `references/plans-agents-md-template.md` — the verbatim `docs/plans/AGENTS.md` content with the 5-category lifecycle, multi-occupancy rule, frontmatter schema (including `goal`, `started_at`, `tags`, `affected_paths`, `related_plans`, `review_status`), 12 canonical body sections, scheduled-date trigger spec, and 3-tier pretty-print contract with category-specific age tokens. The companion `docs/plans/CLAUDE.md` is always a one-line `@AGENTS.md` shim — not duplicated content.
- Sibling skill `plan-manager` — handles every runtime operation on plans (list/show/resume/start/new/fire/ship). Triggered by natural language; auto-dispatches plan-review on `→ finished/` moves.
- Sibling skill `plan-review` — verifies finished plans against their `ship_commit` diff, runs `scripts/ci.sh`, writes the `## Review` section. Auto-dispatched by plan-manager or manually via "review plan <slug>".
- This skill creates the directory structure and convention doc; runtime operations live in plan-manager + plan-review. There is no slash command for plan operations — everything is natural-language skill activation, which keeps Codex and Claude on the same source of truth.
