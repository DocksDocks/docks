---
name: plan-workspace
description: "Use when bootstrapping, migrating, auditing, or explicitly refreshing a docs/plans workspace and its contract, root routing, discovery shim, or missing manager/reviewer Codex wrappers. Not for drafting individual plans (use plan-creator), existing-plan lifecycle or review work (use plan-manager), sealed-bundle evidence (use plan-reviewer), or accepted-blocker repair (use plan-repairer)."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-07-18"
  content_hash: "2db9af459596dfbbaa3e77c4a38929e9a15e1c32b007bc0d718e02b0ed7e6855"
---

# Plans Workspace

Maintain the project-level `docs/plans/` convention: `active/` plus
`finished/`, a plans-local cross-tool contract, a one-line Claude discovery
shim, root routing, and optional project-local Codex wrappers for the manager
and reviewer. This skill owns the workspace only. It never drafts, reviews,
repairs, transitions, or archives an individual plan.

<constraint>
Resolve the project root first, then classify the requested operation and every target before writing. Audit is always read-only. Bootstrap applies only to a missing workspace; migration only to a recognizable legacy workspace; refresh only when the current user explicitly requests it for a recognizable stale generated contract. A current workspace is a no-op, and an ambiguous or customized workspace is a STOP. Never overwrite project-owned agent files or silently turn an audit into a refresh.
</constraint>

<constraint>
Migration must not lose or rewrite a plan. Inventory every source plan and its digest before moving anything; reject destination collisions; preserve plan bytes and `finished/` exactly; verify every source-to-destination pair plus the net-count tripwire before removing legacy directories or derived views. Refresh likewise compares path-and-content digests for `active/` and `finished/` before and after. Any mismatch is a STOP because contract maintenance has crossed into plan ownership.
</constraint>

## Ownership boundary

| Request | Owner |
|---|---|
| Bootstrap, migrate, audit, or explicit workspace refresh | `plan-workspace` |
| Draft and commit one previously nonexistent plan | `plan-creator` |
| Existing-plan operations, review orchestration, receipts, and lifecycle | `plan-manager` |
| Read-only typed evidence over one sealed bundle | `plan-reviewer` |
| One bounded patch for the accepted blocking set | `plan-repairer` |

Only `plan-manager` and `plan-reviewer` have Claude/Codex dispatch wrappers.
Do not seed wrappers for the other three skills.

## Resolve the operation and root

Take the operation from the current request; do not infer a mutating operation
from workspace drift.

```bash
git rev-parse --show-toplevel 2>/dev/null || pwd
```

All paths below are relative to that result. A non-git directory may be
bootstrapped or audited, but migration and refresh must still use byte-preserving
filesystem operations and must report that no commit workflow is available.

## Read-only classification

Inspect directory names, tracked plan paths, the nested contract, the root
Plans section, the Claude shim, and `.codex/agents/plan-*.toml`. Classify once:

| Class | Required evidence | Allowed result |
|---|---|---|
| `GREENFIELD` | `docs/plans/` is absent | bootstrap |
| `LEGACY` | recognized status directories or tracked generated views exist | migrate |
| `CURRENT` | two folders, current schema-6 contract, exact five-skill routing, exact shim | no-op or audit report |
| `STALE` | recognizable generated two-folder contract lacks one or more current markers | audit report; explicit refresh only |
| `AMBIGUOUS_CUSTOM` | any other existing shape or customized generated section | report and STOP |

Legacy markers win over current markers so an interrupted migration resumes
through the preservation checks instead of being mistaken for current. Current
contract markers include all five exact skill names, current schema 6,
historical schemas 1–5 marked validation-only, status-as-field, the cold-handoff
spine, the local self-review checklist, and native open-question picker rules.

Wrappers are support files, not contract-version evidence. Missing
`.codex/agents/plan-manager.toml` or `.codex/agents/plan-reviewer.toml` is
reported separately; an existing file is always treated as project-owned.
Unexpected plan-prefixed wrappers are drift to report, never files to delete.

## Classification report

Before any mutation, print a table such as:

```text
| Target | Action | Reason |
|---|---|---|
| docs/plans/active/ | CREATE | GREENFIELD bootstrap |
| docs/plans/AGENTS.md | OFFER REFRESH | recognizable STALE contract |
| docs/plans/finished/example.md | PRESERVE | archived plan bytes are out of scope |
| .codex/agents/plan-reviewer.toml | CREATE | missing wrapper during authorized bootstrap |
| .codex/agents/custom.toml | SKIP | project-owned file |
```

For an audit, this report plus observed marker/digest evidence is the final
result. Do not continue to an apply section.

## Bootstrap

For `GREENFIELD` plus a bootstrap request:

1. Create `docs/plans/active/` and `docs/plans/finished/`, retaining each empty
   folder with `.gitkeep` when the repository needs it.
2. Copy the embedded contract from
   [`references/plans-agents-md-template.md`](references/plans-agents-md-template.md)
   verbatim to `docs/plans/AGENTS.md`.
3. Write `docs/plans/CLAUDE.md` as exactly `@AGENTS.md` plus a trailing newline.
4. Write `docs/plans/.gitignore` with `*.html` and `.rendered/`; rendered views
   are disposable.
5. Add the generated root Plans section below without altering unrelated root
   rules.
6. Seed only missing manager/reviewer Codex wrappers from
   [`references/codex-agent-templates.md`](references/codex-agent-templates.md).

## Migrate a recognized legacy workspace

1. Capture the sorted source-path inventory and SHA-256 digest of every plan.
2. Create `active/`. Map every non-finished plan to `active/<basename>` and STOP
   on duplicate basenames or an existing nonidentical destination.
3. Move each mapped plan without changing its bytes. Leave `finished/` in place.
4. Run the migration checks in `## Verification`.
5. Only after those checks pass, remove empty legacy status directories and
   tracked generated views/assets. Never remove a plan-bearing directory.
6. Replace the recognizable legacy nested contract and root generated section,
   restore the shim and ignore file, and seed only missing manager/reviewer
   wrappers.

## Explicitly refresh a stale workspace

A refresh request must be explicit in the current turn. Reclassify immediately
before writing. If the result is now `CURRENT`, report a no-op; if it is not
`STALE`, STOP.

Capture sorted path-and-content digests under `active/` and `finished/`. Replace
only the recognizable generated `docs/plans/AGENTS.md`, exact Claude shim,
recognizable generated root Plans section, missing support files, and missing
manager/reviewer wrappers. Do not move, edit, normalize, or reformat a plan.

## Generated root Plans section

```markdown
## Plans

Multi-commit plans live in `docs/plans/active/`; lifecycle is a frontmatter field. `docs/plans/finished/` is the terminal archive. Every plan is a complete cold handoff. `plan-workspace` owns bootstrap/migrate/audit/explicit refresh, `plan-creator` owns creation of one nonexistent plan, `plan-manager` owns every existing-plan and lifecycle operation, `plan-reviewer` returns sealed-bundle evidence only, and `plan-repairer` may apply one accepted-blocker repair. `active/` is multi-occupancy.

The complete schema-6 contract lives in `docs/plans/AGENTS.md`; schemas 1–5 are historical validation-only. `docs/plans/CLAUDE.md` contains only `@AGENTS.md`. Optional project-local dispatch wrappers exist only for `plan-manager` and `plan-reviewer`; the five skills remain canonical.
```

## Verification

After migration moves and before deleting any legacy path:

- **Per-plan presence:** every inventoried non-finished source has exactly one
  mapped `active/` destination with the same SHA-256 digest.
- **Net-count tripwire:** destination count equals the inventoried non-finished
  source count. A lower or higher count is a STOP.
- **Archive preservation:** the sorted path-and-digest inventory under
  `finished/` is byte-identical.
- **Removal safety:** no path selected for removal contains a plan.

After bootstrap, migration, or refresh, verify the two folders, nested contract,
exact shim, ignore rules, root routing, and only the two optional wrapper names.
For refresh, compare the complete before/after active and finished inventories;
any delta fails the operation. Report the observed paths and repository status,
without claiming a wrapper ran merely because its file exists.

## BAD / GOOD boundaries

```text
BAD: Audit finds drift, so rewrite the contract immediately.
GOOD: Audit reports drift; only an explicit current-turn refresh may rewrite a recognizable stale generated contract.

BAD: Seed wrappers for every plan phase.
GOOD: Seed only missing plan-manager and plan-reviewer wrappers; the other phases remain skills only.

BAD: Delete legacy directories after a total count looks plausible.
GOOD: Prove every source-to-destination digest, equal net counts, and untouched finished bytes first.
```

## References

- `references/plans-agents-md-template.md` — copy-only current workspace
  contract for `docs/plans/AGENTS.md`.
- `references/codex-agent-templates.md` — copy-only manager/reviewer wrapper
  defaults; existing files remain project-owned.
