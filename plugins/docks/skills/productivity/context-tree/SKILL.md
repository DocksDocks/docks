---
name: context-tree
description: "Use when a repo's root AGENTS.md grew too large and per-area conventions should load lazily — scaffolding, auditing, or refreshing nested AGENTS.md nodes per major folder (skills/, scripts/, .github/). Ops: init / audit / refresh folder / refresh all. Not for single-root-context repos, legacy CLAUDE.md migration/multi-tool setup (use multi-tool-bridge), generic doc generation, plan workspace setup/refresh (use plan-workspace), or one-shot full repo setup (use agent-first-setup)."
user-invocable: true
metadata:
  pattern: meta-skill
  updated: "2026-09-23"
  content_hash: "3476a34b28de0aa6889b12920e1c87c85fbc8a61f8525e39b7b023cf948ef367"
---

# Context Tree — lazy per-folder AGENTS.md

A *context tree* is a repo where each major folder carries its own `AGENTS.md` (conventions for that area). Codex walks every `AGENTS.md` root→cwd natively. Claude Code (v2.1.277+) lazy-loads a subdirectory's `AGENTS.md` when it reads a file there, as long as no `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md` exists on the path. Both tools load these lazily, so the **root context file stays sparse** and per-area rules attach only when you work in that area. This skill scaffolds, audits, and refreshes that structure. The pattern is canon, not invention — `docs/` already runs it as the plan-record routing node, and it converges with Google's Open Knowledge Format (OKF: markdown + YAML-frontmatter knowledge directories) and Karpathy's LLM-Wiki (schema layer + a Lint maintenance op, which the `audit` graph Lint adapts).

<constraint>
**A node is a single `<folder>/AGENTS.md`. Never write a `CLAUDE.md`.** A legacy CLAUDE.md (any `CLAUDE.md` or `.claude/CLAUDE.md` in the project, root or nested) suppresses native AGENTS.md loading in Claude Code: when one exists on the path, Claude reads only the CLAUDE.md files and ignores AGENTS.md. `CLAUDE.local.md` suppresses it too. Claude-specific content belongs in `.claude/rules/claude-code.md`, not in CLAUDE.md. A stub-only legacy CLAUDE.md (only `@AGENTS.md` / `@../AGENTS.md`) is deleted behind the approval gate; a CLAUDE.md with real content routes to `multi-tool-bridge`.
</constraint>

<constraint>
**One fact, one home — a node is actionable alone.** Lazy nested loading has gaps (a node loads only after a file in its folder is read, and `--continue` sessions may not reattach nested context), so a node must be actionable when it is the only file loaded. It states the rules owned by ITS folder (what an agent needs to edit files there). A fact owned elsewhere (a command defined in another folder, repo-wide policy, generated data) is a pointer: the owning file's repo-root-relative path in backticks, e.g. `scripts/AGENTS.md`. Never restate that fact, and never write "see root" or "refer to the parent" without a path. Use an `@path` import only when the target must always be in context (Claude expands it on every load). Copy a fact into a second file only when you delete it from the first. A pointer must resolve: a dead pointer is worse than a stale copy.
</constraint>

<constraint>
**Durable facts only.** A node is read as current state, so it never holds a value that changes when code changes: no line numbers (`file.ts:42`), no live counts, versions, sizes, scores, or dates, no "currently" / "as of today" / "now has" / "recently". Write the durable identity (symbol, file name, constant, config key) + the rule that produces the value + `(verify: <command>)` that re-derives it. A stable policy threshold that IS the rule (e.g. "a node is at most 500 lines") is durable in the file that owns the rule. A hand-kept list of things that change is allowed only when it is the single home of that fact AND a check compares it with disk: the root Context-tree routing table qualifies because `audit` checks it against the AGENTS.md files on disk; any other enumeration is an `unchecked-list` finding.
</constraint>

<constraint>
**Intent gate — cross-tool, NOT Plan Mode.** `audit`, `--dry-run`, and an explicit preview/proposal request are read-only and end after the report. An explicit `init`, `refresh`, or "fix the audit findings" request continues through proposal, review, writes, and verification in the same orchestration. Render the node list and per-section relocation table before writing; when a canonical plan is warranted, the unified `plan-manager` creates and freshly reviews it, then records the reviewed start checkpoint. No additional user lifecycle command is required. Ask only for a genuinely unresolved relocation or explicit `DROP` decision; absent such a decision, keep the section in root.
</constraint>

Prerequisite: `plan-lifecycle` must be installed. If `plan-workspace` or `plan-manager` is unavailable, STOP, name the missing `plan-lifecycle` plugin, and do not create or mutate a plan.

<constraint>
**No content loss when relocating — per-section, NOT byte-percentage.** A split *adds* scaffolding (node headings, breadcrumbs, `## tree` metadata), so output is normally ≥100% of input — a byte-% floor is the wrong primary check (a lost section hides under added bytes). Instead: (1) inventory every source `^#{1,3}` section before writing; (2) the relocation table accounts for EACH section → a destination or an explicit user `DROP` (unclassified → KEEP in root); (3) relocate verbatim (reformat OK, reword NOT); (4) two-phase write — nodes first + the node check (every AGENTS.md non-empty, ≤500 lines, no CLAUDE.md written), then re-read the source preimage and prune root LAST; (5) the `## Verification` block confirms every source section survives downstream + flags any net shrink. On a miss: stop, restore, locate it — do NOT report success. Full algorithm: [`references/data-preservation.md`](references/data-preservation.md).
</constraint>

## Operations

| Op | What it does | Writes? |
|---|---|---|
| `context-tree init` | First-time scaffold: detect major folders, build the node and relocation tables, run manager review when canonical, write every node, propose deletion of legacy stub CLAUDE.md files, insert the "Context tree" section into root `AGENTS.md`. Idempotent — re-running detects existing nodes and leaves them. | yes |
| `context-tree audit` | Read-only. Report drift: legacy CLAUDE.md files (any `CLAUDE.md` or `.claude/CLAUDE.md`, root or nested — they suppress AGENTS.md loading in Claude Code), AGENTS.md claims that no longer match **current source** (every path/snippet/identifier verified by reading — not just file existence), volatile values, duplicated facts, dead pointers, unchecked lists, folders that newly qualify as nodes — plus the graph **Lint**: contradictions between nodes, orphan nodes with no inbound link, concepts mentioned but lacking a node, missing cross-references, web-fillable data gaps. | no |
| `context-tree refresh <folder>` | Regenerate one node from current disk state. First re-derive whether anything SEMANTIC changed in the folder (compare the node's claims against current source, the same check `audit` runs); if nothing did, it's a no-op (no write). | only if changed |
| `context-tree refresh` | Regenerate every node (use when the convention itself changes). Same intent-aware manager handoff as `init`; an implementation request continues after review. | yes |

## Plan lifecycle handoff

`context-tree` is not a plan operator, but multi-node writing can warrant a canonical plan. Keep `audit`, dry runs, and preview-only requests read-only. For an explicit `init`, full `refresh`, or "fix the audit findings" request, route missing-workspace bootstrap to `plan-workspace`; the unified `plan-manager` owns any canonical-plan creation, fresh review, start checkpoint, lifecycle, and finish/archive. Continue writing after that reviewed checkpoint without a second user command. Deleting a stub-only legacy `CLAUDE.md` (only `@AGENTS.md`) is a small repair, but it still goes through the approval table; never delete a CLAUDE.md with other content — route it to `multi-tool-bridge`. Stop only for an actual unresolved section destination, explicit `DROP`, concurrent change, or verification failure.

## What counts as a node

A folder earns a node when it has **its own conventions a reader needs before editing there** — distinct authoring rules, a distinct change axis, or tooling local to that folder. Trivial folders (a dir of leaf files with no local rules) do not. Full heuristics + the skip-list: [`references/major-folder-heuristics.md`](references/major-folder-heuristics.md).

## The node (the core pattern)

```text
plugins/docks/skills/
└── AGENTS.md      # the conventions for authoring skills in this folder; Codex and Claude Code both load it
```

No sibling file. Codex walks it; Claude Code lazy-loads it when it reads a file in `plugins/docks/skills/`, provided no CLAUDE.md sits on the path.

The AGENTS.md skeleton (sections, the pre-write checklist, optional `tree:` metadata) is in [`references/node-template.md`](references/node-template.md).

## BAD / GOOD — node content

```markdown
<!-- BAD — pathless pointer, a copied fact, and a volatile value -->
# skills/ conventions
For authoring rules, see root.
Validate with `node scripts/validate.mjs --strict` (copied from scripts/).
The folder currently holds 42 skills.

<!-- GOOD — states the folder's own rules; points at facts owned elsewhere -->
# Authoring skills (plugins/docks/skills/)
Frontmatter: name matches dir, description starts "Use when…", ≤1024 chars.
Body ≤500 lines (sweet spot 80–310).
Validation commands: owned by `scripts/AGENTS.md`.
Skill count (verify: `find plugins/docks/skills -name SKILL.md | wc -l`).
```

**Durable anchors — how a node references code.** Nodes are long-lived: a bare `path:42`
line anchor rots on the next edit above it and then misleads. Anchor by
`` `path` — `symbol/config key` — purpose (verify: `command`) ``. For a volatile fact
(count, floor, version), never write the value: write its identity, the rule that produces
it, and the `verify:` command that re-derives it. Line numbers survive only in
clearly-fictional teaching examples. Each emitted node carries one stale-tolerance line:
"Pointers here name concepts, not coordinates — if a path or symbol moved, trust the stated
purpose and re-locate it (grep the symbol) before acting."

**Behavior claims need an exercising cue.** "Guard X enforces Y" / "Z is automated" is the
drift that hides longest: the tool exists, runs, and passes while doing less than the
sentence says. Its cue must EXERCISE the behavior — a should-fail probe ("add a violating
line → the guard run must fail naming it; revert"), never an existence check. A behavior
claim with no probe is not written into a node.

```markdown
<!-- BAD — legacy stub next to the node: Claude Code reads CLAUDE.md files only and ignores AGENTS.md -->
scripts/AGENTS.md
scripts/CLAUDE.md          (contains only: @AGENTS.md)

<!-- GOOD — the node alone; both tools load it natively -->
scripts/AGENTS.md
```

## Workflow — `context-tree init`

1. **Acknowledge state.** Note whether a root `AGENTS.md` exists, whether any nested nodes already exist (e.g. `docs/`), and list every legacy CLAUDE.md (`CLAUDE.md` / `.claude/CLAUDE.md`, root or nested). Never clobber an existing node — detect and preserve it. A legacy CLAUDE.md with content beyond `@AGENTS.md` is out of scope: route it to `multi-tool-bridge` before `init` continues.
2. **Detect candidates.** Apply the heuristics (`references/major-folder-heuristics.md`) to enumerate major folders. Exclude already-existing nodes from the write set.
3. **Inventory + propose (per-section).** Snapshot every source `^#{1,3}` section of the root context file (`cp` it aside — e.g. `/tmp/root.before` — for the Verification step). Render TWO tables: (a) node list — `folder | new? | sources | one-line summary`; (b) **relocation table — `Section | Destination | Reason`** covering EVERY root section; unclassified → `KEEP in root` (only an explicit user instruction may mark a row `DROP`). Add one row per stub-only legacy CLAUDE.md: `<path>/CLAUDE.md | DELETE (legacy stub) | suppresses AGENTS.md loading`. A `--dry-run` or preview-only request stops here after also printing the post-prune root preview + each node preview. For an implementation request, resolve only genuine open decisions, route the complete proposal through `plan-manager` when canonical, and continue after its reviewed start checkpoint.
4. **Phase A — write nodes (root untouched).** For each reviewed folder: write `<folder>/AGENTS.md` (actionable alone, sections relocated **verbatim** per the table). Never write a `CLAUDE.md`. Delete the legacy stub CLAUDE.md files approved in the table. Confirm each `AGENTS.md` is non-empty and ≤500 lines. Root is still fully intact — a halt here leaves duplication (recoverable), never loss.
5. **Phase B — prune root after preimage verification.** Re-read the root and verify it still matches the snapshotted preimage, show the exact lines assigned to written nodes, and confirm those sections are present there before deleting them from root. Never delete a section whose content you cannot point to in an already-written node. Leave a one-line breadcrumb per node in the "Context tree" section.
6. **Root section.** Insert/update the "Context tree" breadcrumb table in root `AGENTS.md` (see `references/node-template.md`).
7. **Verify (fail loud).** Run the `## Verification` block below (per-section presence + net-shrink tripwire), then re-confirm each node is well-formed, confirm no `CLAUDE.md` / `.claude/CLAUDE.md` remains that the table marked for deletion, and run the project's own checks (lint / tests / CI), if it has any. Any `LOST SECTION` / `NET SHRINK` line ⇒ restore from the snapshot and do NOT report success.

## Workflow — `refresh` / `audit`

- `audit` first lists every legacy CLAUDE.md (`CLAUDE.md` / `.claude/CLAUDE.md`, root or nested) as a `legacy-claude-md` finding: it suppresses AGENTS.md loading in Claude Code. Fix for a stub-only file (`@AGENTS.md` / `@../AGENTS.md`): delete it behind the approval gate. Fix for a file with real content: route to `multi-tool-bridge`. Then `audit` walks tracked nodes and verifies every source-anchored claim (path, symbol, snippet, identifier, and any live `path:NN` line anchor, which is itself a `line-anchor` finding: convert to the durable form, don't just re-point the number) against **current source** — content, not just existence — re-derived from disk and ignoring git history; it reports drift with the count of claims checked, and never writes. The same pass reports the durable-docs findings, each with its fix: `volatile-value` (a line number, live count/version/size/date, or "currently" / "now has" — replace with identity + rule + `verify:` command), `duplicated-fact` (a fact restated from its owning file — replace with a backticked path to the owner), `dead-pointer` (a backticked repo path that does not resolve — re-locate the owner by its stated purpose and fix the path, or cut the pointer), `unchecked-list` (a hand-kept enumeration of changing things with no check against disk — replace with the rule + the `find`/`grep` command that lists them). After the per-claim pass it runs the cross-node **graph Lint**: contradictions between nodes (two nodes asserting incompatible rules), orphan nodes with no inbound link (unreferenced by the root Context-tree table or any sibling), concepts mentioned but lacking a node, missing cross-references, and web-fillable data gaps. Full procedure: [`references/conflict-resolution.md`](references/conflict-resolution.md). Use it to decide whether a `refresh` is warranted.
- `refresh <folder>` regenerates one node only if the maintainer's content predicate says something semantic changed (avoids hook write-loops). `refresh` (no arg) re-runs the full convention across every node behind the intent-aware manager handoff.

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
| Wrote a `CLAUDE.md` next to a node | It suppresses AGENTS.md loading in Claude Code. Never write one; delete it. |
| Legacy CLAUDE.md is only `@AGENTS.md` | Propose deletion in the approval table; Claude Code reads AGENTS.md natively. |
| Legacy CLAUDE.md has real content | Do not delete it here. A CLAUDE.md with real content, root or nested → `multi-tool-bridge` (it migrates nested files into the folder AGENTS.md and a path-scoped `.claude/rules/` file). |
| Node says "see root for the full rules" | Pathless pointer. State the folder's own rules in the node; for a fact owned elsewhere, name the owning file as a backticked path. |
| Node restates a command or policy owned by another file | `duplicated-fact`. Replace the copy with the owner's backticked path; one fact, one home. |
| Node writes "currently 12 validators" or "v2.3" | `volatile-value`. Write the identity + rule + `verify:` command, never the value. |
| Node keeps a hand list of files, skills, or nodes | `unchecked-list`, unless a check compares it with disk (the root Context-tree table is checked by `audit`). Replace with the rule + the command that lists them. |
| `init` tried to clobber `docs/AGENTS.md` | Detect existing nodes first and exclude them; route setup or refresh of `docs/AGENTS.md` + `docs/PLAN.md` to `plan-workspace`. |
| Fixed a multi-node audit directly without a reviewed handoff | Risks unbound relocation and root pruning. Route the implementation request through unified `plan-manager`; continue automatically after its reviewed checkpoint. |
| Relocated a section into a node but left it in root too | Duplicated context loads twice. Delete from root when you move it; leave only a breadcrumb. |
| Pruned a section from root before it was written to a node | Content lost. Two-phase only: write nodes (Phase A) + the node check, prune root LAST (Phase B). |
| Used a byte-% "didn't shrink more than X%" as the loss check | Backwards for a split — scaffolding inflates output. Use per-section presence; byte-delta is only a net-shrink tripwire. |
| Hook fires `refresh` on every edit and rewrites unchanged nodes | `refresh <folder>` must first re-derive whether anything semantic changed and no-op when nothing did. |
| `audit` passed a node as "no drift" on a file-exists check | Existence ≠ accuracy — a renamed validator or changed rule sails through. `audit` verifies every claim's content against current source and states the count checked. |
| Node cites a live `path:NN` line anchor | It rots on the next edit. Convert to the durable form — `` `path` — `symbol` — purpose (verify: `command`) `` — and keep line numbers only on fictional example paths. |
| AGENTS.md grew past 500 lines | Past the node-body ceiling (Anthropic's doc max). Split the folder or tighten to keep every node ≤500 lines. |

## When NOT to use

- A small repo with one root context file that fits comfortably — a tree adds indirection with no payoff.
- Plan workspace setup or refresh for `docs/AGENTS.md` + `docs/PLAN.md` — use `plan-workspace`; context-tree `init` detects the existing `docs/` node and leaves it.
- Generating generic docs/READMEs — this skill only manages the nested AGENTS.md node convention.
- Rewriting a consumer project's non-conforming AGENTS.md — `audit` surfaces them; it does not auto-rewrite.

## References

- [`references/major-folder-heuristics.md`](references/major-folder-heuristics.md) — what qualifies as a node, detection rules, the skip-list.
- [`references/node-template.md`](references/node-template.md) — the AGENTS.md skeleton, the root "Context tree" section, the pre-write checklist.
- [`references/conflict-resolution.md`](references/conflict-resolution.md) — existing-file detection, drift/audit logic, merge-vs-overwrite, no-op refresh.
- [`references/data-preservation.md`](references/data-preservation.md) — the section-inventory algorithm, per-section relocation table, two-phase write, and the verbatim verification snippet (self-contained; references stay one level deep).
- Companion: `plan-manager` (create, review, execute, and finish a durable plan) · `skill-maintenance` (the update-only-when-meaning-changed discipline the refresh op mirrors) · `multi-tool-bridge` (legacy CLAUDE.md migration, same split discipline).
