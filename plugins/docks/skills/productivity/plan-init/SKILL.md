---
name: plan-init
description: Use when bootstrapping or migrating docs/plans, or when the user explicitly requests `plan-init refresh` for a stale known v2 contract — maintains active/ + finished/, the plans-local contract/shim, root Plans section, and missing Codex plan wrappers without overwriting project-owned agents. Not for per-plan operations (use plan-manager).
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-07-17"
  content_hash: "ae7a501123cd1c3b259577b691a2a647e98bed812533844dca3d84bb02077cc3"
---

# Plans Directory Bootstrapper

Bootstraps (or migrates to) the `docs/plans/` convention: two folders —
`active/` + `finished/` — with a plan's lifecycle stage carried in its `status:`
frontmatter field, not its directory. The `.md` is the only tracked artifact;
views render on demand. The full contract is `references/plans-agents-md-template.md`,
including author identity and the bounded single-primary schema-5 review gate.
When missing, it also seeds thin project-local Codex wrappers in `.codex/agents/`
for plan-manager and plan-review; those wrappers point back to the canonical
skills and are not plugin payload.

<constraint>
All paths are RELATIVE to the project working directory at invoke time. Never write to absolute kit paths or to a different project. Prefer `git rev-parse --show-toplevel` as the root; otherwise the current working directory.
</constraint>

<constraint>
Idempotency is the recovery mechanism. Classify the target FIRST as GREENFIELD,
V1, CURRENT_V2, STALE_V2, or AMBIGUOUS/custom. V1 markers win over all v2
markers. Ordinary STALE_V2 invocation reports the drift and offers exactly
`plan-init refresh`; only explicit user intent in the current turn authorizes
that refresh. CURRENT_V2 is a contract no-op. Never rewrite an AMBIGUOUS/custom
contract, active/finished plan content, or existing `.codex/agents/` files.
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
test -d docs/plans/active && test -d docs/plans/finished && echo "two-folder"
test -d docs/plans/planned || test -d docs/plans/ongoing || test -d docs/plans/_views || test -f docs/plans/index.html && echo "V1 — migrate"
grep -l 'must match the containing directory' docs/plans/AGENTS.md 2>/dev/null && echo "V1 contract"
grep -l 'fallback: "availability_only"' docs/plans/AGENTS.md 2>/dev/null && echo "current schema-5 primary workflow marker"
grep -l 'review_mode: full' docs/plans/AGENTS.md 2>/dev/null && echo "current bounded primary review-series marker"
grep -l 'previous-plan.review.md' docs/plans/AGENTS.md 2>/dev/null && echo "current one-repair sealed-artifact marker"
test -f .codex/agents/plan-manager.toml || echo "missing Codex plan-manager agent"
test -f .codex/agents/plan-review.toml || echo "missing Codex plan-review agent"
```

Resolve to exactly one class:

- **V1** — any old-model marker exists; this class wins even when v2 folders or
  markers also exist → migrate (Step 4b).
- **GREENFIELD** — no `docs/plans/` → bootstrap (Step 4a).
- **CURRENT_V2** — two folders plus the workflow, bounded primary review-series,
  and sealed repair-artifact markers → no contract rewrite; seed only genuinely
  missing support.
- **STALE_V2** — two folders and the recognizable Docks v2 status-as-field
  contract, but one or both current workflow markers are absent → report the
  exact stale markers. Refresh only after the current turn explicitly requests
  `plan-init refresh` (Step 4c).
- **AMBIGUOUS/custom** — every other existing shape → STOP with the observed
  markers; do not rewrite or move anything.

For the project root config: `AGENTS.md` is primary; fall back to `CLAUDE.md`
only when absent. Recognize the generated Plans section by its Docks wording,
not merely any `docs/plans` mention. A customized Plans section makes the root
target AMBIGUOUS/custom even when the nested contract is known.

### Step 3 — Show the user a classification table

```
| Target                     | Action | Reason                       |
|----------------------------|--------|------------------------------|
| docs/plans/active/.gitkeep | CREATE | not present                  |
| docs/plans/finished/       | SKIP   | exists (holds 19 plans)      |
| docs/plans/AGENTS.md       | WRITE  | V1 contract → rewrite to v2  |
| docs/plans/AGENTS.md       | OFFER  | STALE_V2; requires explicit `plan-init refresh` |
| docs/plans/AGENTS.md       | STOP   | AMBIGUOUS/custom contract     |
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

### Step 4c — Apply (explicit STALE_V2 refresh)

Only a current-turn `plan-init refresh` request enters this step.

1. Reconfirm STALE_V2 and a clean, recognizable generated Plans section in the
   root config. If either became CURRENT_V2, do only missing-support seeding. If
   either is AMBIGUOUS/custom, STOP.
2. Replace only `docs/plans/AGENTS.md` with the embedded current contract,
   restore an exact one-line `docs/plans/CLAUDE.md` shim, and update only the
   recognizable generated root Plans section.
3. Seed genuinely missing support files and missing Codex wrappers. Never
   overwrite existing `.codex/agents/` files.
4. Do not edit, move, or reformat any file under `docs/plans/active/` or
   `docs/plans/finished/`.

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

The full convention (frontmatter schema, body sections, one-pass local checklist self-review, schema-5 role `primary`, GPT-5.6-sol/high/`service_tier:"default"` (Standard) → Fable/high → Opus/xhigh availability-only fallback, exact eight-criterion evidence checklist, primary-role waivers, one full round plus at most one accepted-blocker repair, open questions, and age tokens) lives in `docs/plans/AGENTS.md`. `docs/plans/CLAUDE.md` is a one-line `@AGENTS.md` import for Claude Code's nested discovery. If `.codex/agents/plan-manager.toml` and `.codex/agents/plan-review.toml` exist, Codex may use them for explicit subagent delegation; otherwise run the matching `plan-*` skill inline.
```

## Codex Agent Defaults

The copy-only TOML templates for `.codex/agents/plan-manager.toml` and
`.codex/agents/plan-review.toml` live in [`references/codex-agent-templates.md`](references/codex-agent-templates.md) — read it at Step 4a.6 / 4b.6 and write each block verbatim.
Write a file only when it is missing; existing files are project-owned customization points, never overwritten.

## Verification

After Step 4b's `git mv`s, BEFORE deleting any old directory:

- **Per-file presence:** every `.md` that was under `planned/ ongoing/ blocked/ scheduled/` now resolves under `active/`. `git status --short` shows each as a rename (`R`), never a delete (`D`) without a matching add.
- **Net-count tripwire:** `(count of active/*.md after) == (count of non-finished plans before)`. If fewer, STOP — a plan was dropped; do not `git rm` anything.
- **finished/ untouched:** `git status` shows no change under `finished/`.

Only when all three hold do you proceed to `git rm` the empty old dirs and derived artifacts.

For Step 4c, capture sorted path+content hashes for every tracked file under
`active/` and `finished/` before writing, then compare them afterward. Any
difference is a failed refresh: STOP and report the changed path. Confirm
`git diff --name-only` contains only the nested contract/shim, a recognizable
root Plans section, and genuinely missing support files.

## Common Traps

| Trap | Wrong fix | Right fix |
|---|---|---|
| Writing to the wrong project root | Hardcoded absolute path | Resolve `git rev-parse --show-toplevel` or `pwd` first |
| Overwriting a user-customized `docs/plans/AGENTS.md` on a re-run | Treating every two-folder contract as generated | CURRENT_V2 no-ops; STALE_V2 needs explicit `plan-init refresh`; AMBIGUOUS/custom stops |
| Deleting old dirs before verifying the moves | `git rm planned/` then discover a plan was missed | Run `## Verification` first — net-count tripwire gates the delete |
| Re-creating `active/`/`finished/` on a re-run | Treating "exists" as "rewrite" | V2 skips docs/plans rewrites; seed only genuinely missing support files |
| Migrating `finished/` plans too | Rewriting their frontmatter | `finished/` is an archive — leave it untouched |
| Committing the throwaway visual-question HTML | Tracking `docs/plans/*.html` | `docs/plans/.gitignore` excludes `*.html` + `.rendered/` |
| Overwriting customized Codex agents | Rewriting `.codex/agents/*.toml` every run | Seed only when missing; existing agent files are project-owned |
| Refreshing plan content with the contract | Reformatting `active/*.md` to match new prose | Hash active/finished before and after; refresh touches no plan |

## Anti-Hallucination Checks

- Before reporting "created"/"migrated", `test -f <path>` and confirm exit 0.
- Before any `git rm` in a migration, confirm the `## Verification` net-count tripwire passed.
- Do not claim the root config was updated unless `grep "docs/plans" AGENTS.md CLAUDE.md` matches a line you added this run.
- Do not claim `docs/plans/CLAUDE.md` was written unless its content is exactly `@AGENTS.md`.
- Do not claim Codex plan agents were seeded unless both `.codex/agents/plan-manager.toml` and `.codex/agents/plan-review.toml` exist, and do not claim they ran unless the user explicitly delegated to them.
- Do not claim STALE_V2 was refreshed without a current-turn `plan-init refresh`
  request and a post-write active/finished hash match.

## References

- `references/plans-agents-md-template.md` — the verbatim `docs/plans/AGENTS.md` contract (two-folder model, status-as-field, frontmatter schema, cold-handoff body spine + checklist, one-pass local self-review, bounded single-primary review, workflow roles, open questions, age tokens, audit-first). The source of every project's plans contract — a contract change in any plan-* skill lands here too.
- `references/codex-agent-templates.md` — the copy-only `.codex/agents/plan-manager.toml` + `plan-review.toml` seed templates (written only when the file is missing).
- Sibling `plan-manager` — every runtime operation on plans, including sole primary-review dispatch, finding reconciliation, receipts, and lifecycle writes. Triggered by natural language.
- Sibling `plan-review` — returns evidence-only schema-5 primary draft/completion review results; historical schemas remain validation-only.
- Codex custom agents — project-local TOML files under `.codex/agents/` are optional dispatch helpers; the plan skills remain canonical.
