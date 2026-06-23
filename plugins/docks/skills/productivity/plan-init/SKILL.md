---
name: plan-init
description: Use when bootstrapping the docs/plans/ convention in a new or existing project, or migrating an old 5-folder/HTML-sidecar docs/plans to the current model — creates active/ + finished/, writes a plans-local AGENTS.md (two-folder, status-as-field, self-review loop) plus a one-line CLAUDE.md @AGENTS.md shim, and appends a Plans section to the root AGENTS.md (or root CLAUDE.md if absent). Idempotent — re-running on a current-model project is a no-op. Not for per-plan operations (use plan-manager).
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-06-23"
  content_hash: "d1cbd2ecf2f042299dfee38e99ffd54e7579eddc22ccac971f773fc572efca74"
---

# Plans Directory Bootstrapper

Bootstraps (or migrates to) the `docs/plans/` convention: two folders —
`active/` + `finished/` — with a plan's lifecycle stage carried in its `status:`
frontmatter field, not its directory. The `.md` is the only tracked artifact;
views render on demand. The full contract is `references/plans-agents-md-template.md`.

<constraint>
All paths are RELATIVE to the project working directory at invoke time. Never write to absolute kit paths or to a different project. Prefer `git rev-parse --show-toplevel` as the root; otherwise the current working directory.
</constraint>

<constraint>
Idempotency is the recovery mechanism. Classify the target FIRST: a greenfield project (no `docs/plans/`), a current-model project (`active/` + `finished/` + a v2 contract → complete no-op), or an old-model project (`planned/ongoing/blocked/scheduled/` dirs, `_views/`, `_assets/`, `index.html`, or a contract saying status "must match the directory" → migrate). Re-running on a current-model project writes nothing.
</constraint>

<constraint>
Detection is read-only. Before any write, classify every target with `Read`/`Glob`/`Grep` and read-only `Bash` (`test`, `ls`, `git status`/`rev-parse`). Only after the classification table is produced do you switch to `Write`/`Edit`/`git mv`/`git rm`.
</constraint>

<constraint>
**Migration must not lose a plan.** A v1→v2 migration MOVES files; a halt mid-migration or a wrong glob can drop one. Move EVERY non-finished plan into `active/` preserving its `status:` field, leave `finished/` intact, and verify per-file presence (see `## Verification`) BEFORE deleting any old directory or derived artifact. The migration preserves all plan content verbatim — only locations and the contract change.
</constraint>

## When to Use

- Setting up a new project that will accumulate multi-commit work plans.
- Adding the plans convention to a project that doesn't have one.
- **Migrating an old 5-folder / HTML-sidecar `docs/plans/`** to the current two-folder, status-as-field model.
- The user says "set up plans", "bootstrap plans", "add the docs/plans convention", or "migrate my plans".

The convention is cross-tool: `AGENTS.md` is the source of truth; the `docs/plans/CLAUDE.md` shim exists only because Claude Code's nested discovery reads CLAUDE.md, not AGENTS.md.

## Workflow

### Step 1 — Resolve project root

```bash
git rev-parse --show-toplevel 2>/dev/null || pwd
```

All subsequent paths are relative to this. Non-git directories work too — the lifecycle just uses filesystem moves instead of `git mv`.

### Step 2 — Detect state (read-only)

```bash
test -d docs/plans                         || echo "GREENFIELD"
test -d docs/plans/active && test -d docs/plans/finished && echo "maybe V2"
test -d docs/plans/planned || test -d docs/plans/ongoing || test -d docs/plans/_views || test -f docs/plans/index.html && echo "V1 — migrate"
grep -l 'must match the containing directory' docs/plans/AGENTS.md 2>/dev/null && echo "V1 contract"
```

Resolve to exactly one class:

- **GREENFIELD** — no `docs/plans/` → bootstrap (Step 4a).
- **V2** — `active/` + `finished/` exist AND `docs/plans/AGENTS.md` already describes the two-folder model → SKIP everything (no-op); only seed a genuinely-missing file.
- **V1** — any old-model marker present → migrate (Step 4b).

For the project root config: `AGENTS.md` is the primary target; fall back to `CLAUDE.md` only if `AGENTS.md` is absent. `grep -l 'docs/plans' AGENTS.md CLAUDE.md` discriminates already-referenced from needs-append.

### Step 3 — Show the user a classification table

```
| Target                     | Action | Reason                       |
|----------------------------|--------|------------------------------|
| docs/plans/active/.gitkeep | CREATE | not present                  |
| docs/plans/finished/       | SKIP   | exists (holds 19 plans)      |
| docs/plans/AGENTS.md       | WRITE  | V1 contract → rewrite to v2  |
| docs/plans/_views/ + _assets/ + index.html | GIT RM | derived artifacts, no longer tracked |
| AGENTS.md (root)           | APPEND | exists, no docs/plans ref    |
```

The work is mechanical and idempotent — proceed to Step 4 in the same turn.

### Step 4a — Apply (greenfield bootstrap)

1. `mkdir -p docs/plans/active docs/plans/finished` + a `.gitkeep` in each.
2. Write `docs/plans/AGENTS.md` from the embedded block in `references/plans-agents-md-template.md` (verbatim).
3. Write `docs/plans/CLAUDE.md` containing exactly `@AGENTS.md` (one line).
4. Write `docs/plans/.gitignore` = `*.html` + `.rendered/` (ephemeral visual-question renders are never tracked).
5. Append the **Root Snippet** to the root `AGENTS.md` (or create a stub; or `CLAUDE.md` if AGENTS.md is absent).

### Step 4b — Apply (V1 → V2 migration)

1. `mkdir -p docs/plans/active`; `git mv` every plan `.md` from `planned/ ongoing/ blocked/ scheduled/` into `active/` — its `status:` field already records the stage, so nothing else changes. Leave `finished/` exactly as-is.
2. Run the `## Verification` count check.
3. `git rm -r docs/plans/_views docs/plans/_assets docs/plans/index.html docs/plans/_open_questions` and the now-empty `planned/ ongoing/ blocked/ scheduled/` (with their `.gitkeep`s).
4. Overwrite `docs/plans/AGENTS.md` with the v2 contract; ensure `CLAUDE.md` = `@AGENTS.md`; write `docs/plans/.gitignore`.
5. Update the root `AGENTS.md` Plans section if it describes the 5-folder model.

### Step 5 — Verify and report

```bash
ls -la docs/plans docs/plans/active docs/plans/finished
git status --short
```

Report created/migrated/skipped paths + the captured `git status`. No prose narration.

## Root Snippet

Write as a stub or append to the root `AGENTS.md` (or `CLAUDE.md` when AGENTS.md is absent):

```markdown
## Plans

<constraint>
Multi-commit work plans live in `docs/plans/active/` (status is a frontmatter field) and `docs/plans/finished/` (archive). Every plan file is a complete handoff document — `goal`, `Steps`, `Acceptance criteria`, `Review` — so any agent can pick one up cold. Skills handle every operation: `plan-init` (bootstrap/migrate), `plan-manager` (list/show/start/block/ship/new, auto-commit on transition, self-review on draft), `plan-review` (verification). Trigger by natural language or the matching `plan-*` skill. `active/` is multi-occupancy.
</constraint>

The full convention (frontmatter schema, body sections, self-review loop, open-questions, age tokens) lives in `docs/plans/AGENTS.md`. `docs/plans/CLAUDE.md` is a one-line `@AGENTS.md` import for Claude Code's nested discovery.
```

## Verification

After Step 4b's `git mv`s, BEFORE deleting any old directory:

- **Per-file presence:** every `.md` that was under `planned/ ongoing/ blocked/ scheduled/` now resolves under `active/`. `git status --short` shows each as a rename (`R`), never a delete (`D`) without a matching add.
- **Net-count tripwire:** `(count of active/*.md after) == (count of non-finished plans before)`. If fewer, STOP — a plan was dropped; do not `git rm` anything.
- **finished/ untouched:** `git status` shows no change under `finished/`.

Only when all three hold do you proceed to `git rm` the empty old dirs and derived artifacts.

## Common Traps

| Trap | Wrong fix | Right fix |
|---|---|---|
| Writing to the wrong project root | Hardcoded absolute path | Resolve `git rev-parse --show-toplevel` or `pwd` first |
| Overwriting a user-customized `docs/plans/AGENTS.md` on a re-run | Re-running rewrites a v2 contract | V2-class detection → no-op; only a V1 contract is rewritten |
| Deleting old dirs before verifying the moves | `git rm planned/` then discover a plan was missed | Run `## Verification` first — net-count tripwire gates the delete |
| Re-creating `active/`/`finished/` on a re-run | Treating "exists" as "rewrite" | Existence check is the only gate — V2 is a complete no-op |
| Migrating `finished/` plans too | Rewriting their frontmatter | `finished/` is an archive — leave it untouched |
| Committing the throwaway visual-question HTML | Tracking `docs/plans/*.html` | `docs/plans/.gitignore` excludes `*.html` + `.rendered/` |

## Anti-Hallucination Checks

- Before reporting "created"/"migrated", `test -f <path>` and confirm exit 0.
- Before any `git rm` in a migration, confirm the `## Verification` net-count tripwire passed.
- Do not claim the root config was updated unless `grep "docs/plans" AGENTS.md CLAUDE.md` matches a line you added this run.
- Do not claim `docs/plans/CLAUDE.md` was written unless its content is exactly `@AGENTS.md`.

## References

- `references/plans-agents-md-template.md` — the verbatim `docs/plans/AGENTS.md` contract (two-folder model, status-as-field, frontmatter schema, lean body spine, self-review rubric, open-questions, age tokens, audit-first). The source of every project's plans contract — a contract change in any plan-* skill lands here too.
- Sibling `plan-manager` — every runtime operation on plans (list/show/start/block/ship/new, self-review on draft, auto-commit on transition, deprecation detection). Triggered by natural language.
- Sibling `plan-review` — verifies finished plans against `ship_commit`; also the draft-review pass plan-manager runs on big plans.
