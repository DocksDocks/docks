---
name: roadmap-init
description: Use when bootstrapping the docs/roadmap/ convention in a new or existing project — creating planned/ongoing/finished/ subdirectories with .gitkeep files, writing a roadmap-local CLAUDE.md teaching tri-state checkbox tracking and auto-compact resilience, and adding a Roadmap section to the project's root CLAUDE.md. Idempotent — re-running on a project that already has docs/roadmap/ is a no-op for existing files.
user-invocable: false
metadata:
  pattern: tool-wrapper
  updated: "2026-05-06"
---

# Roadmap Bootstrapper

<constraint>
All paths are RELATIVE to the project working directory at invoke time. Never write to absolute kit paths or to a different project. If `git rev-parse --show-toplevel` succeeds, prefer that as the project root; otherwise use the current working directory.
</constraint>

<constraint>
Idempotency is the recovery mechanism. For each target (the 4 scaffolding paths plus the project root `CLAUDE.md`), check existence FIRST. Targets that already exist are SKIP and never get touched. Re-running on a fully-bootstrapped project must be a complete no-op — `git status --short` after the run must show nothing new for skipped targets.
</constraint>

<constraint>
Detection is read-only. Before any write, classify every target with `Read`/`Glob`/`Grep` and read-only `Bash` (`test`, `ls`, `stat`, `git status`/`rev-parse`). Only after the classification table is produced do you switch to `Write`/`Edit`/`mkdir`/`touch`. Never write blindly.
</constraint>

## When to Use

- Setting up a new project that will accumulate multi-commit work plans
- Adding the roadmap convention to an existing project that doesn't have one
- Re-running on a project that already has partial scaffolding (the run is idempotent)
- The user says "set up roadmap", "bootstrap roadmap", "add the docs/roadmap convention"

## Workflow

### Step 1 — Resolve project root

```bash
git rev-parse --show-toplevel 2>/dev/null || pwd
```

All subsequent paths are relative to this. If the working directory is not a git repo, the command falls back to `pwd` and the bootstrap proceeds — the convention works in non-git directories too, the lifecycle just relies on filesystem moves instead of `git mv`.

### Step 2 — Detect existing state (read-only)

For each of the four scaffolding targets, classify as `CREATE` or `SKIP (exists)`:

```bash
test -d docs/roadmap/planned    && echo "SKIP planned/"        || echo "CREATE planned/"
test -d docs/roadmap/ongoing    && echo "SKIP ongoing/"        || echo "CREATE ongoing/"
test -d docs/roadmap/finished   && echo "SKIP finished/"       || echo "CREATE finished/"
test -f docs/roadmap/CLAUDE.md  && echo "SKIP roadmap CLAUDE.md" || echo "CREATE roadmap CLAUDE.md"
```

For the project's root `CLAUDE.md`, the classification has three branches:

- File MISSING → `CREATE STUB` (write a minimal CLAUDE.md whose only content is the Root Snippet below)
- File EXISTS, contains literal `docs/roadmap` → `SKIP (already references)`
- File EXISTS, no match → `APPEND ROADMAP SECTION`

Use `grep -l 'docs/roadmap' CLAUDE.md` to discriminate the second case.

### Step 3 — Show the user a 5-row classification table

```
| Target                          | Action  | Reason                       |
|---------------------------------|---------|------------------------------|
| docs/roadmap/planned/.gitkeep   | CREATE  | not present                  |
| docs/roadmap/ongoing/.gitkeep   | CREATE  | not present                  |
| docs/roadmap/finished/.gitkeep  | CREATE  | not present                  |
| docs/roadmap/CLAUDE.md          | CREATE  | not present                  |
| CLAUDE.md (root)                | APPEND  | exists, no docs/roadmap ref  |
```

No separate approval gate — the work is mechanical and idempotent. Proceed to Step 4 in the same turn.

### Step 4 — Apply (writes happen here)

For each target classified `CREATE` / `CREATE STUB` / `APPEND ROADMAP SECTION`:

1. **Lifecycle directories + `.gitkeep`** — for each of `planned/`, `ongoing/`, `finished/`:
   ```bash
   mkdir -p docs/roadmap/<folder>
   touch docs/roadmap/<folder>/.gitkeep
   ```
2. **`docs/roadmap/CLAUDE.md`** — write the verbatim content from `references/roadmap-claude-md-template.md`, substituting `{{ISO_DATE}}` placeholders with the output of `date +"%Y-%m-%dT%H:%M:%S%:z"`.
3. **Project root `CLAUDE.md`** —
   - `CREATE STUB`: write the file with exactly the **Root Snippet** below (nothing else).
   - `APPEND ROADMAP SECTION`: read the file, append one blank line + the Root Snippet, write back.
   - `SKIP`: no action.

Skip any target that Step 2 classified `SKIP`.

### Step 5 — Verify and report

```bash
ls -la docs/roadmap/ docs/roadmap/planned docs/roadmap/ongoing docs/roadmap/finished
git status --short
```

Final report: a single bullet list of created vs skipped paths, followed by the captured `ls` and `git status --short` outputs. No prose narration.

## Root Snippet

The exact text to write as a stub or append to an existing `CLAUDE.md`:

```markdown
## Roadmap

Multi-commit work plans live in `docs/roadmap/` and move between `planned/` →
`ongoing/` → `finished/` via `git mv` so history is preserved. Tracking uses
tri-state checkboxes (`[ ]` planned, `[~]` active scratch, `[x]` landed); only
`[x]` is a binding commit claim. See `docs/roadmap/CLAUDE.md` for the full
convention.
```

When appending to an existing file, prepend a single blank line for visual separation. When creating a stub, the snippet IS the entire file.

## Common Traps

| Trap | Wrong fix | Right fix |
|---|---|---|
| Writing to `~/projects/public/` because that's where the kit lives | Hardcoded absolute path | Always resolve `git rev-parse --show-toplevel` or `pwd` first; treat that as the root |
| Overwriting an existing `docs/roadmap/CLAUDE.md` with a fresh template | Re-running the bootstrap rewrites in-flight customizations | `test -f` check before writing; never overwrite a file the user has touched |
| Appending the Roadmap section twice on a re-run | `Edit` without checking for existing `docs/roadmap` token | `grep -l 'docs/roadmap' CLAUDE.md` first; SKIP if matched |
| Creating an empty stub when the user has a CLAUDE.md but it's small | Treating "small" as "missing" | Existence check is the only gate — file size doesn't matter |
| Skipping verification at the end | Trusting the writes worked | `test -f` each created path and grep `docs/roadmap/CLAUDE.md` for the literal heading `## Real-time task tracking — tri-state checkboxes` |

## Anti-Hallucination Checks

- Before reporting "created", run `test -f <path>` and confirm exit 0
- Before reporting "skipped", confirm Step 2 classified it as `SKIP` — do not invent skips
- Do not claim the root `CLAUDE.md` was updated unless `grep "docs/roadmap" CLAUDE.md` matches a line you actually added in this run
- The `git status --short` output at the end MUST show only the paths you created/edited; if it shows others, investigate before reporting "done"

## References

- `references/roadmap-claude-md-template.md` — the verbatim `docs/roadmap/CLAUDE.md` content with tri-state checkbox convention, lifecycle transitions, and auto-compact resilience guidance
- Companion: when working a plan that lives in `docs/roadmap/ongoing/`, re-read the plan file at the start of each session — it's the source of truth, immune to auto-compact (see the auto-compact resilience section of the template)
