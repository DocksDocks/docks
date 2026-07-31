---
name: plan-workspace
description: "Use when bootstrapping, migrating, auditing, or explicitly refreshing a docs/plans workspace, its root routing, discovery shim, current PlanRunV1 contract, or missing reviewer-only Codex wrapper. Not for classifying/drafting/reviewing/implementing an individual goal (use plan-manager) or producing immutable-bundle evidence (use plan-reviewer internally)."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-07-31"
  content_hash: "4d338f5164d06c4d69fb8d869202d19a3244ce21601ba6ffab091e9b312eeef0"
---

# Plans Workspace

Maintain the project-level `docs/plans/` convention: `active/`, `finished/`, the
plans-local cross-tool contract, one-line Claude discovery shim, root routing,
and the optional project-local Codex reviewer wrapper. This skill never owns an
individual plan or implementation.

<constraint>
Resolve the project root and classify the requested operation before writing.
Audit is read-only. Bootstrap applies only to a missing workspace; migration only
to a recognizable legacy workspace; refresh only when the current user explicitly
requests it for a recognizable generated contract. A current workspace is a
no-op, and an ambiguous/custom workspace is a STOP. Never overwrite a
project-owned agent file or turn audit findings into an implicit refresh.
</constraint>

<constraint>
Migration and refresh must preserve every plan byte. Inventory source paths and
SHA-256 digests first; reject collisions; preserve `finished/` exactly; verify
every source/destination pair plus an equal-count tripwire before removing an
empty legacy directory or generated view. Any plan-byte delta is a STOP because
workspace maintenance has crossed into plan ownership.
</constraint>

## Ownership and adaptive entry

| Request | Owner |
|---|---|
| Bootstrap, migrate, audit, or explicit workspace refresh | `plan-workspace` |
| Decide direct work versus a canonical plan; draft/review/one repair; execute, verify, finish, archive, list/show, publish | main-context `plan-manager` |
| Read one immutable bundle and return `PlanReviewV1` | internal `plan-reviewer` |

These are the three live plan skills. Only `plan-reviewer` has Claude/Codex
wrappers. Main context invokes `plan-manager` directly; never seed manager,
workspace, creator, repairer, or improver wrappers.

A clear, reversible, low-risk local diff with one bounded acceptance path stays
direct: no tracked plan, reviewer, or automatic commit. Canonical planning is
for explicit planning, multi-commit/cross-repository work, scheduling, cold
handoff, unresolved decisions, cross-subsystem/public-contract changes,
security/destructive risk, or external effects.

## Resolve operation and root

Take the operation from the current user request; drift never implies mutation.
Resolve the repository root with the runtime's repository tools, falling back to
the current directory for a non-Git workspace. A non-Git directory may be
bootstrapped or audited, but migration/refresh still use byte-preserving
filesystem operations and report that no commit workflow is available.

## Read-only classification

Inspect directory names, tracked plan paths, the nested contract, root Plans
section, Claude shim, and `.codex/agents/plan-*.toml`. Scan plan frontmatter
first. Do not validate every legacy record family as an audit/list prerequisite.

| Class | Required evidence | Allowed result |
|---|---|---|
| `GREENFIELD` | `docs/plans/` absent | bootstrap |
| `LEGACY` | recognized status directories or generated views | migrate |
| `CURRENT` | two folders, three-skill PlanRunV1 contract, exact shim, reviewer-only wrapper topology | no-op or audit report |
| `STALE` | recognizable generated two-folder contract lacks a current marker | audit report; explicit refresh only |
| `AMBIGUOUS_CUSTOM` | any other shape or customized generated section | report and STOP |

Legacy markers win over current markers so an interrupted migration re-enters
preservation checks. Current markers are:

- exactly `plan-workspace`, public main-context `plan-manager`, and internal
  read-only `plan-reviewer`;
- one current unfenced compact-JCS `Plan-run: PlanRunV1` record, validated
  append-only `Plan-attempt-history` in Review, and schemas 1–6 historical only;
- adaptive direct-work threshold and no manual follow-up `start` handoff;
- draft/completion budgets of at most two reserved fresh invocations each;
- exclusive preimage/CAS transactions and major checkpoint commits only;
- step `Effect` values `local|probe|production_access|publish|push|release|deploy`;
- literal live external authority and target-local legacy quarantine;
- status as frontmatter plus complete cold-handoff/acceptance sections.

Wrappers are support files, not version evidence. Missing
`.codex/agents/plan-reviewer.toml` is reported separately; existing wrapper files
are project-owned and never overwritten. Any manager or unexpected plan-prefixed
wrapper is drift to report, not permission to delete it.

## Classification report

Before mutation, show a table such as:

```text
| Target | Action | Reason |
|---|---|---|
| docs/plans/active/ | CREATE | GREENFIELD bootstrap |
| docs/plans/AGENTS.md | OFFER REFRESH | recognizable STALE contract |
| docs/plans/finished/example.md | PRESERVE | archived plan bytes are out of scope |
| .codex/agents/plan-reviewer.toml | CREATE | missing wrapper during authorized bootstrap |
| .codex/agents/custom.toml | SKIP | project-owned file |
```

For audit, this report plus observed marker/digest evidence is final. Do not
continue into an apply path.

## Bootstrap

For `GREENFIELD` plus an explicit bootstrap request:

1. Create `docs/plans/active/` and `docs/plans/finished/`; retain empty folders
   with `.gitkeep` only when the repository needs it.
2. Copy the embedded contract from
   [`references/plans-agents-md-template.md`](references/plans-agents-md-template.md)
   verbatim to `docs/plans/AGENTS.md`.
3. Write `docs/plans/CLAUDE.md` as exactly `@AGENTS.md` plus trailing newline.
4. Write `docs/plans/.gitignore` with `*.html` and `.rendered/`.
5. Add the generated root Plans section below without altering unrelated rules.
6. Seed only a missing `.codex/agents/plan-reviewer.toml` from
   [`references/codex-agent-templates.md`](references/codex-agent-templates.md).

## Migrate a recognized legacy workspace

1. Capture the sorted source path/digest inventory for every plan.
2. Create `active/`. Map each non-finished plan to `active/<basename>` and STOP
   on duplicate basenames or a nonidentical destination.
3. Move mapped files without changing bytes. Leave `finished/` in place.
4. Prove the per-plan, net-count, and archive checks below.
5. Only then remove empty legacy status directories and disposable generated
   views/assets. Never remove a plan-bearing directory.
6. Replace the recognizable generated nested/root contracts, restore shim and
   ignore file, and seed only the missing reviewer wrapper.

Migration does not rewrite historical plan records. Current target-local
migration of record-free or settled terminal schema-1–6 evidence belongs to
`plan-manager`, not workspace migration. Active/prepared/commitment/cancelled/
crossed/malformed families remain visible as `legacy-quarantined`.

## Explicit refresh

A refresh request must be explicit in the current turn. Reclassify immediately
before writing. `CURRENT` is a no-op; any class other than `STALE` is a STOP.

Capture complete path/content inventories under `active/` and `finished/`.
Replace only the recognizable generated `docs/plans/AGENTS.md`, exact Claude
shim, recognizable root Plans section, missing support files, and missing
reviewer wrapper. Do not move, edit, normalize, or reformat a plan. Never delete
an obsolete project-owned wrapper automatically; report it for the user.

## Generated root Plans section

```markdown
## Plans

Use direct implementation for one clear reversible low-risk local diff with one bounded acceptance path; it creates no plan, reviewer, or automatic commit. Canonical plans live in `docs/plans/active/`; lifecycle is frontmatter, and `docs/plans/finished/` is terminal. Exactly three skills own the workflow: `plan-workspace` maintains the workspace, main-context `plan-manager` owns classify → draft/review/one repair → start → implement/delegate → observed acceptance → finish/archive, and internal `plan-reviewer` returns read-only `PlanReviewV1` evidence from one immutable bundle. Only the reviewer has wrappers.

The current record is one compact-JCS `Plan-run: PlanRunV1` line. Exact current-user authority may preserve a terminal predecessor as append-only `Plan-attempt-history` and install a fresh run at the same stable path; never create `v2`/`vN` plans to reset review. Schemas 1–6 are historical only. Every Steps row has `Effect: local|probe|production_access|publish|push|release|deploy`; persisted intent is never live authority. The complete contract lives in `docs/plans/AGENTS.md`; `docs/plans/CLAUDE.md` contains only `@AGENTS.md`.
```

## Verification

After migration moves and before deleting any legacy path:

- **Per-plan presence:** each inventoried non-finished source has exactly one
  mapped active destination with the same SHA-256 digest.
- **Net-count tripwire:** destination count equals inventoried non-finished
  source count; lower or higher is a STOP.
- **Archive preservation:** sorted path/digest inventory under `finished/` is
  byte-identical.
- **Removal safety:** no selected removal path contains a plan.

After bootstrap/migration/refresh, verify both folders, nested contract, exact
shim/ignore rules, root routing, and reviewer-only optional wrapper topology.
For refresh, compare complete before/after active/finished inventories; any delta
fails. Report observed paths and repository status without claiming a wrapper
ran merely because its file exists.

## BAD / GOOD

```text
BAD: Audit finds drift, so rewrite the generated contract immediately.
GOOD: Audit reports drift; only an explicit refresh may rewrite recognizable generated files.

BAD: Seed manager plus reviewer wrappers because both names are plan skills.
GOOD: Seed only a missing reviewer wrapper; main context owns plan-manager directly.

BAD: Validate every malformed legacy family and block unrelated plans.
GOOD: Frontmatter-scan globally; quarantine legacy evidence only for the requested target.
```

## References

- `references/plans-agents-md-template.md` — copy-only current workspace contract.
- `references/codex-agent-templates.md` — reviewer-only Codex wrapper default;
  existing files remain project-owned.
