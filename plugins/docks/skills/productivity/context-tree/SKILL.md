---
name: context-tree
description: "Use when a repo's root CLAUDE.md/AGENTS.md grew too large and per-area conventions should load lazily — scaffolding, auditing, or refreshing nested AGENTS.md + one-line CLAUDE.md pairs per major folder (skills/, scripts/, .github/). Ops: init / audit / refresh folder / refresh all. Not for single-root-context repos, CLAUDE.md↔AGENTS.md canonicalization/multi-tool setup (use multi-tool-bridge), generic doc generation, or docs/plans/ workspace setup/refresh (use plan-workspace)."
user-invocable: true
metadata:
  pattern: meta-skill
  updated: "2026-07-18"
  content_hash: "8a71e3c6002b1080e27e393aea9be19eb9ca2d05419ea4de6044f3bc41f6e2aa"
---

# Context Tree — lazy per-folder AGENTS.md + CLAUDE.md

A *context tree* is a repo where each major folder carries its own `AGENTS.md` (conventions for that area) plus a one-line `CLAUDE.md` that imports it. Both Codex (walks every `AGENTS.md` root→cwd) and Claude Code (descendant-loads `CLAUDE.md` when files in the subtree are read) load these lazily, so the **root context file stays sparse** and per-area rules attach only when you work in that area. This skill scaffolds, audits, and refreshes that structure. The pattern is canon, not invention — `docs/plans/` already runs it, and it converges with Google's Open Knowledge Format (OKF: markdown + YAML-frontmatter knowledge directories) and Karpathy's LLM-Wiki (schema layer + a Lint maintenance op, which the `audit` graph Lint adapts).

<constraint>
**Every node is a PAIR.** A node is `<folder>/AGENTS.md` (canonical content, both tools) + `<folder>/CLAUDE.md` containing exactly one line: `@AGENTS.md`. Claude Code's descendant discovery walks for `CLAUDE.md`, NOT `AGENTS.md` — without the pair, the nested AGENTS.md is invisible to Claude (Codex still walks it). Never write an AGENTS.md without its CLAUDE.md sibling. The `@AGENTS.md` import resolves relative to the CLAUDE.md's own directory.
</constraint>

<constraint>
**Each node is self-sufficient.** Descendant loading has known gaps (CC issues #3529, #4607) and `--continue` sessions don't reattach nested CLAUDE.md. A node must restate the rules it governs — never write "see root for X" or "refer to the parent." When the node loads in isolation, it must stand alone. Duplication across nodes is acceptable; a dangling pointer is not.
</constraint>

<constraint>
**Approval gate — turn-ending, cross-tool, NOT Plan Mode.** `init` and full `refresh` MUST render the proposal (the node list AND the per-section relocation table from constraint 4), then **end the turn** — print it as your final message and STOP. Do NOT call Write/Edit/git-mv until the user replies. Do NOT call `ExitPlanMode` (Claude-only). Silence is not consent; an ambiguous reply re-shows the table. ("STOP and await" alone gets bypassed by eager/literal models — the enforceable pause is ending the turn.)
</constraint>

<constraint>
**No content loss when relocating — per-section, NOT byte-percentage.** A split *adds* scaffolding (imports, CLAUDE.md files, node headings, breadcrumbs), so output is normally ≥100% of input — a byte-% floor is the wrong primary check (a lost section hides under added bytes). Instead: (1) inventory every source `^#{1,3}` section before writing; (2) the approval table accounts for EACH section → a destination or an explicit user `DROP` (unclassified → KEEP in root); (3) relocate verbatim (reformat OK, reword NOT); (4) two-phase write — nodes first + the pair check (every CLAUDE.md exactly `@AGENTS.md`, every AGENTS.md non-empty, ≤500 lines), prune root LAST after a second confirmation; (5) the `## Verification` block then confirms every source section survives downstream + flags any net shrink. On a miss: stop, restore, locate it — do NOT report success. Full algorithm: [`references/data-preservation.md`](references/data-preservation.md).
</constraint>

## Operations

| Op | What it does | Writes? |
|---|---|---|
| `context-tree init` | First-time scaffold: detect major folders, propose the node list, await approval, write every pair, insert the "Context tree" section into root `AGENTS.md`. Idempotent — re-running detects existing nodes and leaves them. | yes (after approval) |
| `context-tree audit` | Read-only. Report drift: nodes missing a CLAUDE.md pair, CLAUDE.md that isn't `@AGENTS.md`-only, AGENTS.md claims that no longer match **current source** (every path/snippet/identifier/count verified by reading — not just file existence), folders that newly qualify as nodes — plus the graph **Lint**: contradictions between nodes, orphan nodes with no inbound link, concepts mentioned but lacking a node, missing cross-references, web-fillable data gaps. | no |
| `context-tree refresh <folder>` | Regenerate one node from current disk state. First re-derive whether anything SEMANTIC changed in the folder (compare the node's claims against current source, the same check `audit` runs); if nothing did, it's a no-op (no write). | only if changed |
| `context-tree refresh` | Regenerate every node (use when the convention itself changes). Same approval gate as `init`. | yes (after approval) |

## Plan lifecycle handoff

`context-tree` is not a plan operator, but user-triggered fixes can be risky
enough to need the plan lifecycle. Keep `audit` read-only. For `init`, full
`refresh`, or "fix the audit findings", route a missing canonical plan to
`plan-creator`, then route review, `start`, and later lifecycle work to
`plan-manager` before writing when the change affects more than one node,
moves/prunes root content, changes conventions, or needs multi-step
verification. Trivial half-pair repairs (`AGENTS.md` exists but `CLAUDE.md` is
missing, or vice versa) may be applied directly after the normal approval gate.

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
Body ≤500 lines (sweet spot 80–310). Run the repo's own lint + tests before commit.
```

**Durable anchors — how a node references code.** Nodes are long-lived: a bare `path:42`
line anchor rots on the next edit above it and then misleads. Anchor by
`` `path` — `symbol/config key` — purpose (verify: `command`) ``; give every volatile fact
(count, floor, version, path) the command that re-derives it; line numbers survive only in
clearly-fictional teaching examples. Each emitted node carries one stale-tolerance line:
"Pointers here name concepts, not coordinates — if a path or symbol moved, trust the stated
purpose and re-locate it (grep the symbol) before acting."

**Behavior claims need an exercising cue.** "Guard X enforces Y" / "Z is automated" is the
drift that hides longest: the tool exists, runs, and passes while doing less than the
sentence says. Its cue must EXERCISE the behavior — a should-fail probe ("add a violating
line → the guard run must fail naming it; revert"), never an existence check. A behavior
claim with no probe is not written into a node.

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
3. **Inventory + propose (per-section).** Snapshot every source `^#{1,3}` section of the root context file (`cp` it aside — e.g. `/tmp/root.before` — for the Verification step). Render TWO tables: (a) node list — `folder | new? | sources | one-line summary`; (b) **relocation table — `Section | Destination | Reason`** covering EVERY root section; unclassified → `KEEP in root` (the user may mark any row `DROP`). Then **end the turn** (constraint 3). `--dry-run` / "preview only" stops here for good — also print the post-prune root preview + each node preview, and write nothing.
4. **Phase A — write nodes (root untouched).** For each approved folder: write `<folder>/AGENTS.md` (self-sufficient, sections relocated **verbatim** per the table) + `<folder>/CLAUDE.md` (`@AGENTS.md` only). Confirm every pair is well-formed (each `CLAUDE.md` is exactly `@AGENTS.md`; each `AGENTS.md` is non-empty and ≤500 lines). Root is still fully intact — a halt here leaves duplication (recoverable), never loss.
5. **Phase B — prune root (second confirmation).** Show the exact lines to be removed from root (the relocated sections) and confirm before deleting. Never delete a section whose content you cannot point to in an already-written node. Leave a one-line breadcrumb per node in the "Context tree" section.
6. **Root section.** Insert/update the "Context tree" breadcrumb table in root `AGENTS.md` (see `references/node-template.md`).
7. **Verify (fail loud).** Run the `## Verification` block below (per-section presence + net-shrink tripwire), then re-confirm each node pair is well-formed and run the project's own checks (lint / tests / CI), if it has any. Any `LOST SECTION` / `NET SHRINK` line ⇒ restore from the snapshot, do NOT report success.

## Workflow — `refresh` / `audit`

- `audit` walks tracked nodes and verifies every source-anchored claim (path, symbol, snippet, identifier, count — and any live `path:NN` line anchor, which is itself a `line-anchor` finding: convert to the durable form, don't just re-point the number) against **current source** — content, not just existence — re-derived from disk and ignoring git history; it reports drift with the count of claims checked, and never writes. After the per-claim pass it runs the cross-node **graph Lint**: contradictions between nodes (two nodes asserting incompatible rules), orphan nodes with no inbound link (unreferenced by the root Context-tree table or any sibling), concepts mentioned but lacking a node, missing cross-references, and web-fillable data gaps. Full procedure: [`references/conflict-resolution.md`](references/conflict-resolution.md). Use it to decide whether a `refresh` is warranted.
- `refresh <folder>` regenerates one node only if the maintainer's content predicate says something semantic changed (avoids hook write-loops). `refresh` (no arg) re-runs the full convention across every node behind the approval gate.

Drift handling, existing-file merges, and the already-a-node detection live in [`references/conflict-resolution.md`](references/conflict-resolution.md).

## Verification (run after any relocation — fail loud)

```bash
# Phase A copied the original root aside first, e.g.  cp root-AGENTS.md /tmp/root.before
# 1. per-section presence — every original section must survive somewhere downstream
while IFS= read -r h; do
  grep -rqF "$h" <written-nodes> root-AGENTS.md || echo "LOST SECTION: $h"
done < <(grep -E '^#{1,3} ' /tmp/root.before)
# 2. net-shrink tripwire — a split ADDS scaffolding, so total should be >= original
before=$(wc -c < /tmp/root.before)
after=$(cat root-AGENTS.md <every-written-node> | wc -c)
awk -v b="$before" -v a="$after" 'BEGIN{ if (a < b) print "NET SHRINK — a section was dropped, investigate" }'
```

Any `LOST SECTION` / `NET SHRINK` line ⇒ restore root from `/tmp/root.before`, locate the content; never report the tree complete with an open miss. This per-section check (not a byte-% floor) is the safeguard every content-transforming skill must carry.

## Gotchas

| Gotcha | Fix |
|---|---|
| Wrote `AGENTS.md` but no `CLAUDE.md` | Claude Code can't see it. Always write the pair; CLAUDE.md = `@AGENTS.md`. |
| CLAUDE.md has extra content beyond `@AGENTS.md` | Move it into AGENTS.md. CLAUDE.md is a one-line import only — anything else breaks the pair. |
| Node says "see root for the full rules" | Self-sufficiency violation. Inline the rules; the node must stand alone when loaded via `--continue`. |
| `init` tried to clobber `docs/plans/AGENTS.md` | Detect existing pairs first and exclude them; route plans-workspace setup or refresh to `plan-workspace`. |
| Fixed a multi-node audit directly in chat | Risky fix path. Create the missing plan through `plan-creator`, then use `plan-manager` for review and `start`, unless it is a trivial half-pair repair. |
| Relocated a section into a node but left it in root too | Duplicated context loads twice. Delete from root when you move it; leave only a breadcrumb. |
| Pruned a section from root before it was written to a node | Content lost. Two-phase only: write nodes (Phase A) + the pair check, prune root LAST (Phase B). |
| Used a byte-% "didn't shrink more than X%" as the loss check | Backwards for a split — scaffolding inflates output. Use per-section presence; byte-delta is only a net-shrink tripwire. |
| Hook fires `refresh` on every edit and rewrites unchanged nodes | `refresh <folder>` must first re-derive whether anything semantic changed and no-op when nothing did. |
| `audit` passed a node as "no drift" on a file-exists check | Existence ≠ accuracy — a renamed validator or changed floor sails through. `audit` verifies every claim's content against current source and states the count checked. |
| Node cites a live `path:NN` line anchor | It rots on the next edit. Convert to the durable form — `` `path` — `symbol` — purpose (verify: `command`) `` — and keep line numbers only on fictional example paths. |
| AGENTS.md grew past 500 lines | Past the node-body ceiling (Anthropic's doc max). Split the folder or tighten to keep every node ≤500 lines. |

## When NOT to use

- A small repo with one root context file that fits comfortably — a tree adds indirection with no payoff.
- `docs/plans/` workspace setup or refresh — use `plan-workspace`; context-tree `init` detects an existing plans node and leaves it.
- Generating generic docs/READMEs — this skill only manages the AGENTS.md+CLAUDE.md pair convention.
- Rewriting a consumer project's non-conforming AGENTS.md — `audit` surfaces them; it does not auto-rewrite.

## References

- [`references/major-folder-heuristics.md`](references/major-folder-heuristics.md) — what qualifies as a node, detection rules, the skip-list.
- [`references/node-template.md`](references/node-template.md) — the AGENTS.md skeleton, the CLAUDE.md one-liner, the root "Context tree" section, the self-sufficiency checklist.
- [`references/conflict-resolution.md`](references/conflict-resolution.md) — existing-file detection, drift/audit logic, merge-vs-overwrite, no-op refresh.
- [`references/data-preservation.md`](references/data-preservation.md) — the section-inventory algorithm, per-section relocation table, two-phase write, and the verbatim verification snippet (self-contained; the kit pattern is in `write-skill/references/data-preservation.md`).
- Companion: `plan-creator` (create the missing durable plan) · `plan-manager` (review, start, and lifecycle for that plan) · `skill-maintenance` (the update-only-when-meaning-changed discipline the refresh op mirrors) · `multi-tool-bridge` (CLAUDE.md ↔ AGENTS.md classification, same split discipline).
