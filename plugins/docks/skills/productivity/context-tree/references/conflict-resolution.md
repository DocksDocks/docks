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

## Drift detection (`audit`) — content-accuracy, not existence

`audit` verifies that each node's **source-anchored claims still match current source**, re-derived from disk. Existence is not accuracy: a path can resolve while the node describes it wrongly, and a renamed validator or a changed scoring floor sails through a file-exists check untouched. Read-only — report drift, never auto-fix; the user decides whether to `refresh`.

<constraint>
Vertical accuracy, not horizontal change. A node's `## tree` `refreshed:` date and the file's git history prove only that text changed — never that it matches source. Ignore both here; open and read the cited source for every claim. Re-derive from disk as it is now: pre-baseline drift (a claim already wrong before the last refresh) is invisible to any date- or diff-based check.
</constraint>

<constraint>
No node may be reported drift-free without stating how many claims were opened and verified — a "no drift" verdict with zero claims checked is a fail, not a pass. Reproduce every drift finding against the cited source before recording it; drop any you cannot reproduce, with a reason.
</constraint>

### What counts as a checkable claim

| Claim type | Example in a node | Verify by |
|---|---|---|
| path / file:line ref | `` `src/db.ts:42` ``, `` `Makefile:18` `` | read it; confirm it says what the node asserts — not just that it resolves |
| code / command snippet | a fenced `bash`/`md` block, a CLI invocation | grep or run it; confirm it still appears / still works |
| named identifier | a validator, script target, env var, config key, function | grep the symbol; confirm it is DEFINED, not merely named |
| count / threshold | "5 validators", "floor 8", "≤500 lines" | re-derive the number from source; confirm it still matches |
| coverage | a new file/folder the node's rules don't mention | flag as a coverage gap (candidate `refresh`) |

Soft prose (rationale, "prefer X" advice) has no source anchor — mark it `unverifiable`, never drift.

### Verdict per claim

`confirmed` · `broken-ref` (path/line gone) · `stale-snippet` (snippet/command drifted) · `fictional-identifier` (named thing not defined) · `drifted-claim` (count/threshold/behaviour wrong) · `unverifiable`. A node is **CLEAN** only at zero drift AND a non-zero stated claim count; otherwise report it as a `refresh` candidate with its top finding.

### Pre-filter (cheap, not authoritative)

Scope the read with the node's `## tree` `sources:` list (the files its claims cite); `refreshed:`/git-delta narrows where to look first. Neither substitutes for opening every claim — they only order the work.

Output per node: `claims checked | confirmed | broken-ref | stale-snippet | fictional-identifier | drifted-claim | verdict`, plus a dropped-on-failed-reproduction list. Report drift; do not auto-fix in `audit`. The user decides whether to `refresh`.

## No-op refresh (hook safety)

`refresh <folder>` is called by the `PostToolUse` hook on every edit inside a node. It MUST be a no-op when nothing semantic changed, or the hook write-loops. Reuse the `skill-maintenance` content-predicate pattern:

```bash
# only rewrite when the derived content actually differs from disk
new=$(render_node <folder>)
old=$(cat <folder>/AGENTS.md 2>/dev/null)
[ "$new" = "$old" ] && exit 0   # no write, no churn
```

This mirrors the skill-maintenance idempotency pattern: compute the would-be content, compare to disk, write only on a real difference.
