# Conflict resolution — existing files, drift, no-op refresh

## Contents

- [Existing-node detection](#existing-node-detection-run-first-always) · [Half-pairs](#half-pairs-drift-to-fix) · [Merge vs overwrite](#merge-vs-overwrite) · [Per-section relocation](#per-section-relocation-init--full-refresh)
- [Drift detection (`audit`)](#drift-detection-audit--content-accuracy-not-existence) — checkable claims, per-claim verdicts, [Graph Lint](#graph-lint-cross-node-health--after-the-per-claim-pass), pre-filter
- [No-op refresh (hook safety)](#no-op-refresh-hook-safety)

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

MIXED sections (part folder-local, part cross-cutting) split paragraph-by-paragraph; the unclassified remainder stays in root. The relocation table at the gate must list every `^#{1,3}` root section — no section is left unaccounted. Prune root only in Phase B, after nodes are written and the pair check passes (every CLAUDE.md exactly `@AGENTS.md`, every AGENTS.md non-empty and ≤500 lines — via the project's validators when it has them).

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
| path / file:line ref | `` `src/db.ts:42` ``, `` `Makefile:18` `` | read it; confirm it says what the node asserts — not just that it resolves. A live `path:NN` whose path exists is ALSO a `line-anchor` finding in its own right (see verdicts) even when currently accurate |
| durable anchor | `` `path` — `symbol` — purpose (verify: `cmd`) `` | grep the symbol (defined, matching purpose) and RUN the `verify:` command — confirm it re-derives the stated fact |
| code / command snippet | a fenced `bash`/`md` block, a CLI invocation | grep or run it; confirm it still appears / still works |
| named identifier | a validator, script target, env var, config key, function | grep the symbol; confirm it is DEFINED, not merely named |
| count / threshold | "5 validators", "floor 8", "≤500 lines" | re-derive the number from source; confirm it still matches |
| coverage | a new file/folder the node's rules don't mention | flag as a coverage gap (candidate `refresh`) |

Soft prose (rationale, "prefer X" advice) has no source anchor — mark it `unverifiable`, never drift.

### Verdict per claim

`confirmed` · `broken-ref` (path/line gone) · `stale-snippet` (snippet/command drifted) · `fictional-identifier` (named thing not defined) · `drifted-claim` (count/threshold/behaviour wrong) · `line-anchor` (live `path:NN` in the node — even if accurate today it rots on the next edit; fix = convert to the durable `` `path` — `symbol` — purpose (verify: `cmd`) `` form, never just re-point the number; fictional example paths exempt) · `unverifiable`. A node is **CLEAN** only at zero drift AND a non-zero stated claim count; otherwise report it as a `refresh` candidate with its top finding.

### Graph Lint (cross-node health — after the per-claim pass)

The per-claim checks above judge one node at a time; these five judge the tree as a graph. Same rules apply: read-only, report findings, never auto-fix. (Checklist adapted from Karpathy's LLM-Wiki Lint op.)

| Lint check | Verify by |
|---|---|
| Contradictions between nodes | Compare rules that govern the same file/tool/threshold across nodes AND the root; two nodes giving incompatible instructions for the same case is a finding, whichever is "right" |
| Orphan node — no inbound link | A node's folder missing from the root Context-tree table and unreferenced by any sibling node; it still loads lazily but is invisible to a reader navigating from the root |
| Concept mentioned but lacking a node | A folder/subsystem repeatedly named across nodes (or in root) that qualifies as a node under "What counts as a node" yet has no pair |
| Missing cross-references | Node A restates or depends on a convention canonically held by node B without naming it; add-a-link is the `refresh` fix, not silent duplication drift |
| Web-fillable data gap | A claim that needs an external fact the repo cannot supply (a version, an upstream URL, a spec value) left vague where a source could pin it |

Output: append the graph findings to the per-node report as `graph: <check> — <finding>` lines; each is a `refresh` candidate (or a root Context-tree table fix), decided by the user.

### Pre-filter (cheap, not authoritative)

Scope the read with the node's `## tree` `sources:` list (the files its claims cite); `refreshed:`/git-delta narrows where to look first. Neither substitutes for opening every claim — they only order the work.

Output per node: `claims checked | confirmed | broken-ref | stale-snippet | fictional-identifier | drifted-claim | verdict`, plus a dropped-on-failed-reproduction list. Report drift; do not auto-fix in `audit`. The user decides whether to `refresh`.

## No-op refresh (hook safety)

The `PostToolUse` hook nudges the agent (via injected context) to run `refresh <folder>` after every edit inside a node — it never invokes refresh itself. `refresh` MUST therefore be a no-op when nothing semantic changed, or the nudge-refresh cycle write-loops. Reuse the `skill-maintenance` update-only-when-meaning-changed pattern:

```bash
# only rewrite when the derived content actually differs from disk
new=$(render_node <folder>)
old=$(cat <folder>/AGENTS.md 2>/dev/null)
[ "$new" = "$old" ] && exit 0   # no write, no churn
```

This mirrors the skill-maintenance idempotency pattern: compute the would-be content, compare to disk, write only on a real difference.
