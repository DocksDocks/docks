---
name: context-tree
description: "Use when a repo's root CLAUDE.md/AGENTS.md grew too large and per-area conventions should load lazily — scaffolding, auditing, or refreshing nested AGENTS.md + one-line CLAUDE.md pairs per major folder (skills/, scripts/, .github/). Ops: init / audit / refresh folder / refresh all. Not for single-root-context repos, generic doc generation, or docs/plans/ which is already a node."
user-invocable: true
metadata:
  pattern: meta-skill
  updated: "2026-05-27"
  content_hash: "7c85dd3028b61dbebd4fc3dba84face97d8c6be4a0a9cf6abbbfeab511cd1ff4"
---

# Context Tree — lazy per-folder AGENTS.md + CLAUDE.md

A *context tree* is a repo where each major folder carries its own `AGENTS.md` (conventions for that area) plus a one-line `CLAUDE.md` that imports it. Both Codex (walks every `AGENTS.md` root→cwd) and Claude Code (descendant-loads `CLAUDE.md` when files in the subtree are read) load these lazily, so the **root context file stays sparse** and per-area rules attach only when you work in that area. This skill scaffolds, audits, and refreshes that structure. The pattern is canon, not invention — `docs/plans/` already runs it.

<constraint>
**Every node is a PAIR.** A node is `<folder>/AGENTS.md` (canonical content, both tools) + `<folder>/CLAUDE.md` containing exactly one line: `@AGENTS.md`. Claude Code's descendant discovery walks for `CLAUDE.md`, NOT `AGENTS.md` — without the pair, the nested AGENTS.md is invisible to Claude (Codex still walks it). Never write an AGENTS.md without its CLAUDE.md sibling. The `@AGENTS.md` import resolves relative to the CLAUDE.md's own directory.
</constraint>

<constraint>
**Each node is self-sufficient.** Descendant loading has known gaps (CC issues #3529, #4607) and `--continue` sessions don't reattach nested CLAUDE.md. A node must restate the rules it governs — never write "see root for X" or "refer to the parent." When the node loads in isolation, it must stand alone. Duplication across nodes is acceptable; a dangling pointer is not.
</constraint>

<constraint>
**Approval gate before writing (cross-tool, NOT Plan Mode).** `init` and full `refresh` MUST show the proposed node list as a table and wait for explicit user confirmation before writing any file. Do NOT call `ExitPlanMode` (Claude-only). The gate is a plain conversational "here's what I'll create/change — confirm?" so it works identically on Codex.
</constraint>

## Operations

| Op | What it does | Writes? |
|---|---|---|
| `context-tree init` | First-time scaffold: detect major folders, propose the node list, await approval, write every pair, insert the "Context tree" section into root `AGENTS.md`. Idempotent — re-running detects existing nodes and leaves them. | yes (after approval) |
| `context-tree audit` | Read-only. Report drift: nodes missing a CLAUDE.md pair, CLAUDE.md that isn't `@AGENTS.md`-only, AGENTS.md claims that no longer match disk, folders that newly qualify as nodes. | no |
| `context-tree refresh <folder>` | Regenerate one node from current disk state. Calls the `skill-maintainer` `--check-only` predicate first; if nothing semantic changed, it's a no-op (no write). | only if changed |
| `context-tree refresh` | Regenerate every node (use when the convention itself changes). Same approval gate as `init`. | yes (after approval) |

## What counts as a node

A folder earns a node when it has **its own conventions a reader needs before editing there** — distinct authoring rules, a distinct change axis, or tooling local to that folder. Trivial folders (a dir of leaf files with no local rules) do not. Full heuristics + the skip-list: [`references/major-folder-heuristics.md`](references/major-folder-heuristics.md).

## The node pair (the core pattern)

```text
plugins/docks/skills/
├── AGENTS.md      # canonical: the conventions for authoring skills in this folder
└── CLAUDE.md      # exactly one line, so Claude Code's walker finds AGENTS.md
```

```markdown
<!-- plugins/docks/skills/CLAUDE.md — the ENTIRE file -->
@AGENTS.md
```

The AGENTS.md skeleton (sections, the self-sufficiency checklist, optional `tree:` metadata) is in [`references/node-template.md`](references/node-template.md).

## BAD / GOOD — node content

```markdown
<!-- BAD — dangling pointer; useless when the node loads in isolation -->
# skills/ conventions
For authoring rules, see the root CLAUDE.md "Authoring skills" section.

<!-- GOOD — self-sufficient; restates what a reader needs here -->
# Authoring skills (plugins/docks/skills/)
Frontmatter: name matches dir, description starts "Use when…", ≤500 chars.
Body ≤500 lines (sweet spot 80–310). Run `bash scripts/ci.sh` before commit.
```

```markdown
<!-- BAD — AGENTS.md with no CLAUDE.md sibling: invisible to Claude Code -->
scripts/AGENTS.md          (alone)

<!-- GOOD — the pair; Claude's descendant walker finds it -->
scripts/AGENTS.md
scripts/CLAUDE.md          (contains only: @AGENTS.md)
```

## Workflow — `context-tree init`

1. **Acknowledge state.** Note whether a root `AGENTS.md`/`CLAUDE.md` exists and whether any nested pairs already exist (e.g. `docs/plans/`). Never clobber an existing node — detect and preserve it.
2. **Detect candidates.** Apply the heuristics (`references/major-folder-heuristics.md`) to enumerate major folders. Exclude already-existing nodes from the write set.
3. **Propose.** Render a table: `folder | new? | source files considered | one-line summary of the conventions that will go in its AGENTS.md`. **STOP and await explicit confirmation** (constraint 3).
4. **Write pairs.** For each approved folder: write `<folder>/AGENTS.md` (self-sufficient content per the template) + `<folder>/CLAUDE.md` (`@AGENTS.md` only).
5. **Relocate, don't duplicate.** When a node's content is being *moved out of* the root context file, delete it from root in the same pass so the root shrinks. Leave a one-line breadcrumb in the root "Context tree" section, not the full content.
6. **Root section.** Insert/update a "Context tree" section in root `AGENTS.md` listing the nodes (see `references/node-template.md`).
7. **Verify.** Run `bash scripts/tree/guard.sh` (every node is a complete pair; CLAUDE.md is `@AGENTS.md`-only; AGENTS.md ≤500 lines) then `bash scripts/ci.sh`.

## Workflow — `refresh` / `audit`

- `audit` walks tracked nodes, compares AGENTS.md claims to disk, and reports drift — it never writes. Use it to decide whether a `refresh` is warranted.
- `refresh <folder>` regenerates one node only if the maintainer's content predicate says something semantic changed (avoids hook write-loops). `refresh` (no arg) re-runs the full convention across every node behind the approval gate.

Drift handling, existing-file merges, and the already-a-node detection live in [`references/conflict-resolution.md`](references/conflict-resolution.md).

## Gotchas

| Gotcha | Fix |
|---|---|
| Wrote `AGENTS.md` but no `CLAUDE.md` | Claude Code can't see it. Always write the pair; CLAUDE.md = `@AGENTS.md`. |
| CLAUDE.md has extra content beyond `@AGENTS.md` | Move it into AGENTS.md. CLAUDE.md is a one-line import only — `scripts/tree/guard.sh` fails otherwise. |
| Node says "see root for the full rules" | Self-sufficiency violation. Inline the rules; the node must stand alone when loaded via `--continue`. |
| `init` clobbered `docs/plans/AGENTS.md` | Detect existing pairs first and exclude them from the write set. |
| Relocated a section into a node but left it in root too | Duplicated context loads twice. Delete from root when you move it; leave only a breadcrumb. |
| Hook fires `refresh` on every edit and rewrites unchanged nodes | `refresh <folder>` must call the maintainer `--check-only` predicate and no-op when nothing semantic changed. |
| AGENTS.md grew past 500 lines | Past the node-body ceiling. Split the folder or tighten; `scripts/tree/guard.sh` enforces ≤500. |

## When NOT to use

- A small repo with one root context file that fits comfortably — a tree adds indirection with no payoff.
- `docs/plans/` — it's already a node; `init` detects and leaves it.
- Generating generic docs/READMEs — this skill only manages the AGENTS.md+CLAUDE.md pair convention.
- Rewriting a consumer project's non-conforming AGENTS.md — `audit` surfaces them; it does not auto-rewrite.

## References

- [`references/major-folder-heuristics.md`](references/major-folder-heuristics.md) — what qualifies as a node, detection rules, the skip-list.
- [`references/node-template.md`](references/node-template.md) — the AGENTS.md skeleton, the CLAUDE.md one-liner, the root "Context tree" section, the self-sufficiency checklist.
- [`references/conflict-resolution.md`](references/conflict-resolution.md) — existing-file detection, drift/audit logic, merge-vs-overwrite, no-op refresh.
- Companion: `skill-maintainer` (`--check-only` content predicate the refresh op reuses) · `agents` (CLAUDE.md ↔ AGENTS.md classification, same split discipline).
