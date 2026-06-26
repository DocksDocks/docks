---
name: plan-init
description: Use when bootstrapping the docs/plans/ convention in a new or existing project, or migrating an old 5-folder/HTML-sidecar docs/plans to the current model — creates active/ + finished/, writes a plans-local AGENTS.md plus CLAUDE.md shim, appends a root Plans section, and seeds missing Codex plan-manager/plan-review project agents. Idempotent. Not for per-plan operations (use plan-manager).
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-06-26"
  content_hash: "a52a5b05422e9ba927a892548e536a547b896d5b2cc6afcd596b771ec4b0d0e3"
---

# Plans Directory Bootstrapper

Bootstraps (or migrates to) the `docs/plans/` convention: two folders —
`active/` + `finished/` — with a plan's lifecycle stage carried in its `status:`
frontmatter field, not its directory. The `.md` is the only tracked artifact;
views render on demand. The full contract is `references/plans-agents-md-template.md`.
When missing, it also seeds thin project-local Codex wrappers in `.codex/agents/`
for plan-manager and plan-review; those wrappers point back to the canonical
skills and are not plugin payload.

<constraint>
All paths are RELATIVE to the project working directory at invoke time. Never write to absolute kit paths or to a different project. Prefer `git rev-parse --show-toplevel` as the root; otherwise the current working directory.
</constraint>

<constraint>
Idempotency is the recovery mechanism. Classify the target FIRST: a greenfield project (no `docs/plans/`), a current-model project (`active/` + `finished/` + a v2 contract → no docs/plans rewrite), or an old-model project (`planned/ongoing/blocked/scheduled/` dirs, `_views/`, `_assets/`, `index.html`, or a contract saying status "must match the directory" → migrate). Re-running on a current-model project only seeds genuinely missing support files; it never overwrites an existing plan contract or customized Codex agent.
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

The convention is cross-tool: `AGENTS.md` is the source of truth; the `docs/plans/CLAUDE.md` shim exists only because Claude Code's nested discovery reads CLAUDE.md, not AGENTS.md. Codex project agents are optional repo-local dispatch helpers; when present, skills still gate subagent use on explicit delegation or runtime policy and fall back to inline execution.

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
test -f .codex/agents/plan-manager.toml || echo "missing Codex plan-manager agent"
test -f .codex/agents/plan-review.toml || echo "missing Codex plan-review agent"
```

Resolve to exactly one class:

- **GREENFIELD** — no `docs/plans/` → bootstrap (Step 4a).
- **V2** — `active/` + `finished/` exist AND `docs/plans/AGENTS.md` already describes the two-folder model → SKIP docs/plans rewrites; only seed a genuinely missing support file (`.gitkeep`, `.gitignore`, `CLAUDE.md`, root snippet, or default Codex plan-agent file).
- **V1** — any old-model marker present → migrate (Step 4b).

For the project root config: `AGENTS.md` is the primary target; fall back to `CLAUDE.md` only if `AGENTS.md` is absent. `grep -l 'docs/plans' AGENTS.md CLAUDE.md` discriminates already-referenced from needs-append.

### Step 3 — Show the user a classification table

```
| Target                     | Action | Reason                       |
|----------------------------|--------|------------------------------|
| docs/plans/active/.gitkeep | CREATE | not present                  |
| docs/plans/finished/       | SKIP   | exists (holds 19 plans)      |
| docs/plans/AGENTS.md       | WRITE  | V1 contract → rewrite to v2  |
| .codex/agents/plan-review.toml | CREATE | not present, Codex wrapper missing |
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
6. `mkdir -p .codex/agents`; write the **Codex Agent Defaults** for `plan-manager.toml` and `plan-review.toml` only if each file is missing. Existing files are user-customized; never overwrite them.

### Step 4b — Apply (V1 → V2 migration)

1. `mkdir -p docs/plans/active`; `git mv` every plan `.md` from `planned/ ongoing/ blocked/ scheduled/` into `active/` — its `status:` field already records the stage, so nothing else changes. Leave `finished/` exactly as-is.
2. Run the `## Verification` count check.
3. `git rm -r docs/plans/_views docs/plans/_assets docs/plans/index.html docs/plans/_open_questions` and the now-empty `planned/ ongoing/ blocked/ scheduled/` (with their `.gitkeep`s).
4. Overwrite `docs/plans/AGENTS.md` with the v2 contract; ensure `CLAUDE.md` = `@AGENTS.md`; write `docs/plans/.gitignore`.
5. Update the root `AGENTS.md` Plans section if it describes the 5-folder model.
6. Seed missing `.codex/agents/plan-manager.toml` and `.codex/agents/plan-review.toml` from **Codex Agent Defaults**; skip existing files.

### Step 5 — Verify and report

```bash
ls -la docs/plans docs/plans/active docs/plans/finished
test -f .codex/agents/plan-manager.toml && test -f .codex/agents/plan-review.toml
git status --short
```

Report created/migrated/skipped paths + the captured `git status`. No prose narration.

## Root Snippet

Write as a stub or append to the root `AGENTS.md` (or `CLAUDE.md` when AGENTS.md is absent):

```markdown
## Plans

<constraint>
Multi-commit work plans live in `docs/plans/active/` (status is a frontmatter field) and `docs/plans/finished/` (archive). Every plan file is a complete cold-handoff document — goal, context & rationale, environment & how-to-run, steps with exact paths, executable acceptance criteria, and a binary cold-handoff checklist — so any agent (or a weaker model) can pick one up cold without guessing. Skills handle every operation: `plan-init` (bootstrap/migrate), `plan-manager` (list/show/start/block/ship/new, auto-commit on transition, self-review on draft), `plan-review` (verification). Trigger by natural language or the matching `plan-*` skill. `active/` is multi-occupancy.
</constraint>

The full convention (frontmatter schema, body sections, self-review loop, open-questions, age tokens) lives in `docs/plans/AGENTS.md`. `docs/plans/CLAUDE.md` is a one-line `@AGENTS.md` import for Claude Code's nested discovery. If `.codex/agents/plan-manager.toml` and `.codex/agents/plan-review.toml` exist, Codex may use them for explicit subagent delegation; otherwise run the matching `plan-*` skill inline.
```

## Codex Agent Defaults

Write these only when the target file is missing. Do not overwrite existing
`.codex/agents/*.toml`; those are project-local customization points.

`.codex/agents/plan-manager.toml`:

```toml
name = "plan-manager"
description = "Use when Docks plan operations need isolated Codex context: list/show/start/block/ship/scaffold/fire scheduled plans in docs/plans. Not for plan-review verification."
model = "gpt-5.5"
model_reasoning_effort = "high"
sandbox_mode = "workspace-write"
developer_instructions = """
# Plan Manager (Codex project agent)

You are the repo-local Codex wrapper for the `plan-manager` skill. Load and
follow the matching skill instructions before acting. If a project-local bundled
copy exists under `plugins/*/skills/productivity/plan-manager/SKILL.md`, prefer
that file; otherwise use the available `plan-manager` skill from the runtime.
Treat the skill as canonical; this file only defines the project-agent shell.

<constraint>
Operate only on this repository's `docs/plans/active/` and
`docs/plans/finished/` lifecycle unless the user explicitly provides another
project path. Status lives in plan frontmatter; `git mv` happens only on ship.
</constraint>

<constraint>
Do not spawn subagents unless the user explicitly asks for Codex subagent
workflow. If the skill calls for fresh-context review and no explicit
delegation was requested, perform the check inline or surface the exact
dispatch needed back to the main thread.
</constraint>

## Workflow

1. Read the plan-manager skill and the target plan file before editing.
2. Anchor time once with `date '+%Y-%m-%dT%H:%M:%S%:z'`.
3. Apply the skill's lifecycle workflow exactly: enumerate, transition,
   draft+self-review, surface open questions, render Tier-3 previews, and
   commit plan-file transitions when required.
4. Keep edits scoped to plan files unless the plan itself instructs
   implementation and has no unresolved open questions.
5. When a completion review is needed, dispatch or hand back to the
   repo-local `plan-review` Codex agent only when explicit subagent delegation
   is allowed; otherwise run the plan-review skill inline.

## Anti-Hallucination Checks

- Re-read changed frontmatter after every edit.
- Never claim a plan-review ran unless the plan has a `## Review` block and
  `review_status` is `passed`, `partial`, or `regressed`.
- If a command needs approval or fails due to sandboxing, report the exact
  command and reason instead of changing the lifecycle rule.
"""
```

`.codex/agents/plan-review.toml`:

```toml
name = "plan-review"
description = "Use when a Docks plan needs isolated Codex verification: draft review, completion review at in_review, or finished-plan review. Not for general code review."
model = "gpt-5.5"
model_reasoning_effort = "high"
sandbox_mode = "workspace-write"
developer_instructions = """
# Plan Review (Codex project agent)

You are the repo-local Codex wrapper for the `plan-review` skill. Load and
follow the matching skill instructions before acting. If a project-local bundled
copy exists under `plugins/*/skills/productivity/plan-review/SKILL.md`, prefer
that file; otherwise use the available `plan-review` skill from the runtime.
Treat the skill as canonical; this file only defines the project-agent shell.

<constraint>
Review only the plan requested by the caller. Do not create follow-up plans;
surface suggested slugs under the Review block's `Follow-ups` line instead.
</constraint>

<constraint>
Every finding needs fresh reproduction in this thread: re-read cited lines,
run the narrow relevant test or CI command when present, and drop findings
that cannot be reproduced.
</constraint>

## Workflow

1. Read the plan-review skill and the target plan file.
2. Select mode by plan `status`: draft review for active non-`in_review`,
   completion review for active `in_review`, finished review for archived
   plans with `ship_commit`.
3. For completion/finished review, compare goal and acceptance criteria
   against the planned diff base, run the project's CI command when present,
   and write the idempotent five-line `## Review` block plus `review_status`.
4. Render the Tier-3 preview after writing.
5. Return concise evidence: diff base, CI command and result, and any
   reproduced findings.

## Anti-Hallucination Checks

- Do not infer goal completion from checked boxes alone; verify changed files.
- Quote the first failing CI line verbatim when CI fails.
- Re-read the final plan frontmatter and `## Review` block before reporting
  success.
"""
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
| Re-creating `active/`/`finished/` on a re-run | Treating "exists" as "rewrite" | V2 skips docs/plans rewrites; seed only genuinely missing support files |
| Migrating `finished/` plans too | Rewriting their frontmatter | `finished/` is an archive — leave it untouched |
| Committing the throwaway visual-question HTML | Tracking `docs/plans/*.html` | `docs/plans/.gitignore` excludes `*.html` + `.rendered/` |
| Overwriting customized Codex agents | Rewriting `.codex/agents/*.toml` every run | Seed only when missing; existing agent files are project-owned |

## Anti-Hallucination Checks

- Before reporting "created"/"migrated", `test -f <path>` and confirm exit 0.
- Before any `git rm` in a migration, confirm the `## Verification` net-count tripwire passed.
- Do not claim the root config was updated unless `grep "docs/plans" AGENTS.md CLAUDE.md` matches a line you added this run.
- Do not claim `docs/plans/CLAUDE.md` was written unless its content is exactly `@AGENTS.md`.
- Do not claim Codex plan agents were seeded unless both `.codex/agents/plan-manager.toml` and `.codex/agents/plan-review.toml` exist, and do not claim they ran unless the user explicitly delegated to them.

## References

- `references/plans-agents-md-template.md` — the verbatim `docs/plans/AGENTS.md` contract (two-folder model, status-as-field, frontmatter schema, cold-handoff body spine + checklist, scored self-review rubric, open-questions, age tokens, audit-first). The source of every project's plans contract — a contract change in any plan-* skill lands here too.
- Sibling `plan-manager` — every runtime operation on plans (list/show/start/block/ship/new, self-review on draft, auto-commit on transition, deprecation detection). Triggered by natural language.
- Sibling `plan-review` — verifies finished plans against `ship_commit`; also the draft-review pass plan-manager runs on big plans.
- Codex custom agents — project-local TOML files under `.codex/agents/` are optional dispatch helpers; the plan skills remain canonical.
