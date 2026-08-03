---
name: plan-workspace
description: "Use when bootstrapping, migrating, auditing, or explicitly refreshing a docs/plans workspace, its root routing, discovery shim, current PlanRunV1 contract, or missing reviewer-only Codex wrapper. Not for classifying/drafting/reviewing/implementing an individual goal (use plan-manager) or producing immutable-bundle evidence (use plan-reviewer internally)."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-08-02"
  content_hash: "c4b83562972360b2acaba0b70bef185f912ea830feefee04c3588c8c8c956cca"
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
| Decide direct work versus a canonical plan; draft/review/class-bounded repair; execute, verify, finish, archive, list/show, publish | main-context `plan-manager` |
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
- a new Steps schema with stable ids, while only the frozen grandfather set may
  retain the legacy schema with an advisory;
- a draft limit of one initial round plus the closed v1 class vocabulary,
  repeated or mixed repeated classes terminal-blocked, and completion fixed at
  two substantive invocations;
- an exact accepted-class sweep before repair-bundle creation or reservation;
- exclusive preimage/CAS transactions and major checkpoint commits only;
- step `Effect` values `local|probe|production_access|publish|push|release|deploy`;
- literal live external authority and target-local legacy quarantine;
- status as frontmatter plus complete cold-handoff/acceptance sections.

Wrappers are support files, not version evidence. Missing
`.codex/agents/plan-reviewer.toml` is reported separately; existing wrapper files
are project-owned and never overwritten. Any manager or unexpected plan-prefixed
wrapper is drift to report, not permission to delete it.

## Stable step and draft-review contract

The legacy Steps schema omits `Id`; the new Steps schema adds it immediately
after `#`.

The legacy Steps schema is `# | Task | Files | Depends | Effect | Status | Done
when / failure action`; the new schema is `# | Id | Task | Files | Depends |
Effect | Status | Done when / failure action`. `Id` is immediately after `#` and
must match `[a-z][a-z0-9_]{0,63}`. A missing `Id` is advisory only for the frozen
grandfather set; every new plan requires the `Id` column and one valid, unique id
per Steps row. The frozen set is exactly
`docs/plans/active/lifecycle-dispatch-integrity.md`,
`docs/plans/active/plan-lifecycle-plugin-extraction.md`,
`docs/plans/active/relay-fanout-reaper-reporting.md`,
`docs/plans/finished/2026-08-02-session-relay-0.15.0-release.md`, and
`docs/plans/active/step-ids-and-class-budget.md`. Within `Done when / failure
action`, step citations are accepted only as `step:<id>` and must resolve to a
declared id; valid-looking numeric `step N` citations are rejected. `#` and
`Depends` keep their numeric display-number semantics.

Every `PlanReviewV1` finding carries a required `class`. The draft finding
vocabulary is closed by kind: `missing_decision` permits only
`v1_missing_decision`; `contradiction` permits only
`v1_contract_contradiction`, `v1_evidence_mismatch`, or
`v1_unstable_step_reference`; `unsafe_scope` permits only
`v1_unauthorized_effect`, `v1_missing_safety_boundary`, or
`v1_affected_paths_incomplete`; and `missing_acceptance` permits only
`v1_acceptance_command_not_runnable`, `v1_acceptance_output_mismatch`,
`v1_acceptance_coverage_incomplete`, or `v1_failure_action_missing`. The
reviewer emits `class`; the manager validates the kind/class pair and never
derives a class from plan prose.

For draft review only, `accepted_classes` is sorted and unique; an absent field
on an existing record reads as empty, and the next legal draft transition writes
it. An accepted repair atomically unions only unseen validated classes. Any
draft result containing an already accepted class, including a mixed seen/unseen
result, terminal-blocks the run; only an unseen-only class set may enter
`repairing`. The draft limit is one initial round plus the closed v1 vocabulary
cardinality (12 substantive invocations). Completion review keeps exactly two
substantive invocations and an empty accepted-class set.

Before creating a draft repair bundle or reserving its permit, verify the exact
accepted-class sweep against the candidate plan bytes; an absent, stale,
incomplete, or non-clear sweep fails before bundle creation and leaves the phase
unchanged. The sweep is bound to the candidate `plan_sha256`, preceding
reviewer-result digest, every accepted class, and every enumerated Steps row,
acceptance row, named mechanism, and level-two document section. Waivers and
wildcard units never satisfy it.

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

Use direct implementation for one clear reversible low-risk local diff with one bounded acceptance path; it creates no plan, reviewer, or automatic commit. Canonical plans live in `docs/plans/active/`; lifecycle is frontmatter, and `docs/plans/finished/` is terminal. Exactly three skills own the workflow: `plan-workspace` maintains the workspace, main-context `plan-manager` owns classify → draft/class-bounded review and repair → start → implement/delegate → observed acceptance → finish/archive, and internal `plan-reviewer` returns read-only `PlanReviewV1` evidence from one immutable bundle. Only the reviewer has wrappers.

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
