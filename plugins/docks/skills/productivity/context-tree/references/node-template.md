# Node template — the AGENTS.md node + the root section

## One file per node

A node is `<folder>/AGENTS.md` and nothing else. Do not write a `CLAUDE.md` beside it. Codex walks AGENTS.md natively. Claude Code (v2.1.277+) lazy-loads a subdirectory's AGENTS.md when it reads a file there, but only when no `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md` exists on the path. A legacy CLAUDE.md therefore hides the node from Claude Code: propose its deletion in the approval table (stub-only) or route it to `multi-tool-bridge` (real content).

## AGENTS.md skeleton

```markdown
# <Folder purpose> (<relative/path/>)

<One paragraph: what lives here and the one thing a reader must know before
editing.>

## Conventions
<The rules owned by this folder, stated in full. Tables and BAD/GOOD beat
prose. Anchor code by `path` — `symbol` — purpose (verify: `command`), never
by bare `path:NN` line numbers. For a volatile fact (count, version, size,
date), never write the value: write the identity + the rule that produces it
+ (verify: `command`).>

## Owned elsewhere
<One line per fact this folder depends on but does not own: what it is + the
owning file as a repo-root-relative backticked path, e.g.
"Validation commands: `scripts/AGENTS.md`". Never copy the fact.>

## Gotchas
<Concrete corrections specific to this folder, if any.>

Pointers here name concepts, not coordinates — if a path or symbol moved,
trust the stated purpose and re-locate it (grep the symbol) before acting.

<!-- machine-readable drift aid — `audit` reads `sources:` to scope its content check -->
## tree (metadata)
- sources: <every file this node's claims cite — `audit` pre-filters on this list>
```

Keep it ≤500 lines (Anthropic doc max; distinct from the SKILL.md 310 sweet spot). If it grows past that, the folder probably needs to split.

## Pre-write checklist (run before writing each node)

- [ ] Every rule owned by this folder is stated in THIS file (actionable when it is the only file loaded)
- [ ] Every fact owned elsewhere is a backticked repo-root-relative path, not a copy (no `duplicated-fact`)
- [ ] No "see root", "refer to parent", or "as described elsewhere" without a path; every backticked path resolves (no `dead-pointer`)
- [ ] No volatile value: no line number, live count, version, size, score, or date, no "currently" / "now has" / "recently" — identity + rule + `verify:` command instead (no `volatile-value`)
- [ ] No hand-kept list of things that change unless a check compares it with disk (no `unchecked-list`)
- [ ] No live `path:NN` line anchors — durable anchors only; the stale-tolerance line is present
- [ ] Every "X enforces/automates/blocks Y" claim carries a cue that EXERCISES the behavior (should-fail probe), not an existence check — or the claim is cut
- [ ] Reads correctly if it's the ONLY context file loaded (the `--continue` test)
- [ ] No `CLAUDE.md` or `.claude/CLAUDE.md` in this folder or above it (a legacy one suppresses AGENTS.md loading)
- [ ] AGENTS.md ≤500 lines
- [ ] `## tree` `sources:` lists every file this node's claims cite (so `audit` can verify them)

## Root "Context tree" section

Insert into the root `AGENTS.md`:

```markdown
## Context tree

Per-folder conventions live in nested `AGENTS.md` nodes and load lazily
(Codex walks AGENTS.md; Claude Code loads a folder's AGENTS.md when it reads
a file there). Do not add CLAUDE.md files: they suppress AGENTS.md loading.
Edit the node, not this list, when a folder's rules change. `context-tree audit`
checks this table against the AGENTS.md files on disk.

| Node | Governs |
|---|---|
| `<folder>/` | <one-line purpose> |
```

This table is the one allowed hand-kept list: it is the single home of the routing fact, and `audit` compares it with disk (a node missing from the table is an orphan; a row with no `<folder>/AGENTS.md` is a `dead-pointer`). Fill it from `find . -name AGENTS.md -not -path "*/node_modules/*" -not -path "./AGENTS.md"` (every hit is a node). Each row is a pointer only; the rules live in the node, so the root stays sparse.

## Per-section relocation table (the approval gate)

Alongside the node list, the gate shows a row for EVERY root `^#{1,3}` section so nothing moves (or drops) unseen. Full rules: [`data-preservation.md`](data-preservation.md).

```markdown
| Section (root heading)   | Destination                    | Reason                          |
|--------------------------|--------------------------------|---------------------------------|
| ## Authoring skills      | plugins/docks/skills/AGENTS.md | folder-local authoring rules    |
| ## CI triggers           | .github/AGENTS.md              | CI config change axis           |
| ## Repository purpose    | KEEP in root                   | cross-cutting; not folder-local |
| ## Legacy notes          | DROP (user-confirmed)          | obsolete                        |
```

Unclassified → `KEEP in root` (default safe). `DROP` only on an explicit user mark.
