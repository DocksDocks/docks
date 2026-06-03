# Node template — the pair + the root section

## CLAUDE.md (every node, verbatim)

The entire file is one line:

```markdown
@AGENTS.md
```

No frontmatter, no heading, nothing else. `scripts/tree/guard.sh` fails any CLAUDE.md that isn't exactly this. The `@AGENTS.md` import resolves relative to the file's own directory.

## AGENTS.md skeleton

```markdown
# <Folder purpose> (<relative/path/>)

<One paragraph: what lives here and the one thing a reader must know before
editing.>

## Conventions
<The rules that govern this folder — restated, not referenced. Tables and
BAD/GOOD beat prose.>

## Gotchas
<Concrete corrections specific to this folder, if any.>

<!-- machine-readable drift aid — `audit` reads `sources:` to scope its content check -->
## tree (metadata)
- refreshed: YYYY-MM-DD
- sources: <every file this node's claims cite — the cited-sources floor `audit` pre-filters on>
```

Keep it ≤500 lines (Anthropic doc max; distinct from the SKILL.md 310 sweet spot). If it grows past that, the folder probably needs to split.

## Self-sufficiency checklist (run before writing each node)

- [ ] No "see root", "refer to parent", or "as described elsewhere" pointers
- [ ] Every rule a reader needs to edit here is stated in THIS file
- [ ] Reads correctly if it's the ONLY context file loaded (the `--continue` test)
- [ ] CLAUDE.md sibling exists and is `@AGENTS.md`-only
- [ ] AGENTS.md ≤500 lines
- [ ] `## tree` `sources:` lists every file this node's claims cite (so `audit` can verify them)

## Root "Context tree" section

Insert into the root `AGENTS.md` (not CLAUDE.md — keep CLAUDE.md thin):

```markdown
## Context tree

Per-folder conventions live in nested `AGENTS.md` + `CLAUDE.md` pairs and
load lazily (Codex walks AGENTS.md; Claude Code descendant-loads CLAUDE.md).
Edit the node, not this list, when a folder's rules change.

| Node | Governs |
|---|---|
| `docs/plans/` | plan lifecycle + frontmatter schema |
| `plugins/docks/skills/` | skill authoring + scoring |
| `plugins/docks/agents/` | agent authoring |
| `scripts/` | validator / CI tooling contract |
| `.github/` | CI workflow triggers |
```

The list is breadcrumbs only — the authoritative content is in each node, so the root stays sparse.

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
