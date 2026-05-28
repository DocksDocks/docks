# Conflict resolution — existing files, drift, no-op refresh

## Existing-node detection (run first, always)

Before writing anything, find folders that already have the pair:

```bash
# a folder is an existing node when BOTH exist
test -f <folder>/AGENTS.md && test -f <folder>/CLAUDE.md
```

Existing nodes are PRESERVED by `init` — never clobbered. `docs/plans/` is the canonical example: `init` detects it and excludes it from the write set. Only an explicit `refresh <folder>` touches an existing node.

## Half-pairs (drift to fix)

| Found | Fix |
|---|---|
| `AGENTS.md` but no `CLAUDE.md` | Add `CLAUDE.md` (`@AGENTS.md`). Don't touch AGENTS.md content. |
| `CLAUDE.md` but no `AGENTS.md` | Either the folder isn't a node (delete the orphan CLAUDE.md) or generate the AGENTS.md. Ask. |
| `CLAUDE.md` with content beyond `@AGENTS.md` | Move that content into AGENTS.md; reduce CLAUDE.md to the one-line import. |

## Merge vs overwrite

When `refresh` targets a node that already has hand-written content:

- **Preserve** human-authored rules — `refresh` updates machine-derived parts (the `tree:` metadata, drift-corrected claims), not the prose a person wrote. Treat the existing AGENTS.md as the base; surface proposed changes as a diff at the approval gate.
- **Never** silently overwrite a node whose content diverged intentionally.

## Per-section relocation (init / full refresh)

When content moves *out of* the root into nodes, route it **per section**, not per folder. Full algorithm + verification: [`data-preservation.md`](data-preservation.md). Classification rules:

| Root section looks like | Route to |
|---|---|
| Folder-local authoring/tooling rules (matches one node's scope) | that node's `AGENTS.md` (verbatim) |
| Cross-cutting / repo-wide (purpose, security, tool-agnostic rules) | KEEP in root |
| Obsolete, user-confirmed | `DROP` (explicit only) |
| Can't confidently classify | **KEEP in root** (default safe — never silently move) |

MIXED sections (part folder-local, part cross-cutting) split paragraph-by-paragraph; the unclassified remainder stays in root. The relocation table at the gate must list every `^#{1,3}` root section — no section is left unaccounted. Prune root only in Phase B, after nodes are written and `tree/guard.sh` passes.

## Drift detection (`audit`)

For each node, compare AGENTS.md claims to disk:

- Does a referenced file/path still exist?
- Does a count ("5 validators") still match?
- Did a new file appear that the node's rules don't cover?

Report drift; do not auto-fix in `audit`. The user decides whether to `refresh`.

## No-op refresh (hook safety)

`refresh <folder>` is called by the `PostToolUse` hook on every edit inside a node. It MUST be a no-op when nothing semantic changed, or the hook write-loops. Reuse the `skill-maintenance` content-predicate pattern:

```bash
# only rewrite when the derived content actually differs from disk
new=$(render_node <folder>)
old=$(cat <folder>/AGENTS.md 2>/dev/null)
[ "$new" = "$old" ] && exit 0   # no write, no churn
```

This mirrors the skill-maintenance idempotency pattern: compute the would-be content, compare to disk, write only on a real difference.
