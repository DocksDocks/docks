---
name: plan-workspace
description: "Use when bootstrapping, migrating, auditing, or explicitly refreshing a docs/plans workspace for the markdown-only v2 contract, six-phase flow, root routing, or two reviewer wrappers. Not for deciding, drafting, reviewing, or implementing an individual goal (use plan-manager or plan-reviewer)."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-08-10"
  content_hash: "595e88ee6760471f3b96456fbd0c78bb63b5017ab4c813bca6bec211c0e1fe0a"
---

# Plans Workspace

Maintain the project-level `docs/plans/` convention. This skill owns bootstrap,
migration, audit, and explicit refresh. It does not own an individual plan or
its implementation.

<constraint>
Resolve the project root and classify the operation before writing. Audit is
read-only. Bootstrap applies only to a missing workspace. Migration applies only
to a recognizable legacy workspace. Refresh applies only when the user requests
it explicitly for a recognizable generated contract. `CURRENT` is a no-op.
`AMBIGUOUS_CUSTOM` stops. Never overwrite project-owned agent files or turn an
audit finding into an implicit refresh.
</constraint>

<constraint>
Migration and refresh preserve every plan byte. Inventory source paths and
SHA-256 digests first. Reject collisions. Preserve `finished/` exactly. Verify
every source and destination pair plus an equal-count tripwire before removing
an empty legacy directory or generated view. Any plan-byte delta stops because
workspace maintenance has crossed into plan ownership.
</constraint>

## Ownership and operations

| Request | Owner |
|---|---|
| Bootstrap, migrate, audit, or explicit workspace refresh | `plan-workspace` |
| Decide the mode; draft, research, review, implement, verify, and archive | main-context `plan-manager` |
| Return one read-only pre-implementation plan verdict | internal `plan-reviewer` |

Two read-only reviewer roles exist: `plan-reviewer` and `code-reviewer`. Main
context invokes `plan-manager` directly. Do not seed manager, workspace,
creator, repairer, or improver wrappers.

## Lifecycle tool

`plan.mjs` is plugin payload, not project payload. It ships inside the installed
`plan-lifecycle` plugin at
`skills/productivity/plan-manager/scripts/plan.mjs`. A project never vendors,
copies, or re-creates it, and an unresolvable tool means the plugin is not
installed. Never report it as a file missing from the repository.

The tool is never a workspace marker. It lives in the plugin, so its absence is
never workspace drift and never a bootstrap, migration, or refresh action.

Resolve it from the loaded `plan-manager` skill directory. When that directory is
unknown, search the runtime plugin cache and take the highest version directory:

```sh
ls -d "$HOME"/.claude/plugins/cache/*/plan-lifecycle/*/skills/productivity/plan-manager/scripts/plan.mjs
ls -d "$HOME"/.codex/plugins/cache/*/plan-lifecycle/*/skills/productivity/plan-manager/scripts/plan.mjs
```

Every bootstrap, migration, refresh, and audit report states the resolved
absolute path of the tool, or states that the `plan-lifecycle` plugin is not
installed.

## Resolve operation and root

Take the operation from the current user request. Drift never implies mutation.
Resolve the repository root with the runtime's repository tools. Use the current
directory for a non-Git workspace. A non-Git directory may be bootstrapped or
audited. Migration and refresh still use byte-preserving filesystem operations.
Report that no commit workflow is available.

## Read-only classification

Inspect directory names, plan paths, `docs/plans/AGENTS.md`, the root Plans
section, the Claude shim, `.codex/agents/plan-reviewer.toml`, and
`.codex/agents/code-reviewer.toml`. Inspect plan frontmatter before reading a
plan body. Do not parse every historical plan as a classification prerequisite.

| Class | Required evidence | Allowed result |
|---|---|---|
| `GREENFIELD` | `docs/plans/` is absent | bootstrap |
| `LEGACY` | Recognizable status directories or generated views need the two-folder layout | migrate |
| `CURRENT` | Every current marker below matches | no-op or audit report |
| `STALE_V1` | A two-folder workspace whose `docs/plans/AGENTS.md` declares the PlanRunV1 contract by naming `Plan-run: PlanRunV1`, `plan_sha256`, or a review permit | audit report; explicit refresh replaces only the recognizable generated contract, shim, and root section |
| `STALE` | A recognizable generated v2 workspace misses a current marker | audit report; explicit refresh only |
| `AMBIGUOUS_CUSTOM` | Any other shape or customized generated section | report and stop |

Current markers are exactly:

- two folders, `docs/plans/active/` and `docs/plans/finished/`;
- `docs/plans/AGENTS.md` byte-identical to the embedded template;
- `docs/plans/CLAUDE.md` exactly `@AGENTS.md`;
- a v2 contract declaring `plan_contract: v2` frontmatter, the eight sections,
  both table headers, and the six-phase flow;
- the two reviewer wrappers and no other plan-prefixed wrapper;
- an optional classification-neutral `docs/plans/QUEUE.md`.

A missing marker makes a recognizable generated v2 workspace `STALE`. A present
queue may guide discovery and priority. Audit reports malformed queue bytes. It
does not repair them. Wrappers are support files, not version evidence. Existing
wrapper files are project-owned and never overwritten. Report an unexpected
plan-prefixed wrapper. Do not delete it.

## Classification report

Before mutation, report each target, proposed action, and observed reason.

```text
| Target | Action | Reason |
|---|---|---|
| docs/plans/active/ | CREATE | GREENFIELD bootstrap |
| docs/plans/AGENTS.md | OFFER REFRESH | recognizable STALE contract |
| docs/plans/finished/example.md | PRESERVE | historical plan bytes are out of scope |
| .codex/agents/code-reviewer.toml | CREATE | missing wrapper during authorized bootstrap |
| .codex/agents/custom.toml | SKIP | project-owned file |
```

For audit, this report and the observed marker and digest evidence are final. Do
not continue into an apply operation.

## Bootstrap

For `GREENFIELD` with an explicit bootstrap request:

1. Create `docs/plans/active/` and `docs/plans/finished/`. Retain empty folders
   with `.gitkeep` only when the repository needs it.
2. Copy
   [`references/plans-agents-md-template.md`](references/plans-agents-md-template.md)
   verbatim to `docs/plans/AGENTS.md`.
3. Write `docs/plans/CLAUDE.md` as exactly `@AGENTS.md` plus a trailing newline.
4. Write `docs/plans/.gitignore` with `*.html` and `.rendered/`.
5. Add the generated root Plans section below without altering unrelated rules.
6. Create an empty queue only when the current user requests one.
7. Seed each missing `.codex/agents/plan-reviewer.toml` and
   `.codex/agents/code-reviewer.toml` from
   [`references/codex-agent-templates.md`](references/codex-agent-templates.md).
   Overwrite neither existing file.

## Migrate a recognized legacy workspace

1. Capture the sorted source path and digest inventory for every plan.
2. Create `active/`. Map each non-finished plan to `active/<basename>`. Stop on a
   duplicate basename or a nonidentical destination.
3. Move mapped files without changing their bytes. Leave `finished/` in place.
4. Prove the per-plan, net-count, and archive checks in `## Verification`.
5. Remove only empty legacy status directories and disposable generated views.
   Never remove a plan-bearing directory.
6. Replace the recognizable generated nested and root contracts. Restore the
   shim and ignore file. Seed both missing reviewer wrappers without overwriting
   either existing file.

Migration changes workspace structure, not plan bodies. It has no plan-body
migration path in either direction.

## V1 plan handling

A plan carrying a `Plan-run:` line stays byte-identical. Report it as a v1 plan.
Never parse, migrate, or rewrite it. Finish it by hand: move the file
byte-unchanged to `docs/plans/finished/<YYYY-MM-DD>-<slug>.md`, then append a
`## Retirement` section. `plan.mjs` refuses to parse it, and `plan.mjs retire`
works only on v2 plans. If its goal is still wanted, carry the goal into a fresh
v2 plan. The audit report states these rules exactly.

## Explicit refresh

A refresh request must be explicit in the current turn. Reclassify immediately
before writing. `CURRENT` is a no-op. `STALE` and `STALE_V1` allow only the
bounded replacements in their classification rows. Every other class stops.

Capture complete path and content inventories under `active/` and `finished/`.
For `STALE_V1`, replace only the recognizable generated
`docs/plans/AGENTS.md`, exact Claude shim, and recognizable root Plans section
with the v2 template. For `STALE`, replace those generated files and missing
support files, and seed both missing reviewer wrappers. Do not move, edit,
normalize, or reformat a plan. Never delete an obsolete project-owned wrapper
automatically. Report it.

## Generated root Plans section

```markdown
## Plans

Use direct implementation for one clear, reversible, low-risk local diff with one
bounded acceptance path; it creates no tracked plan, reviewer, or automatic
commit. Use a canonical plan for explicit planning, multi-commit or
cross-repository work, cold handoff, an unresolved decision, a cross-subsystem or
public-contract change, security-sensitive or destructive work, or any
non-`local` effect.

<constraint>
Canonical plans live in `docs/plans/active/`; status is frontmatter and
`docs/plans/finished/` is terminal. Exactly three skills own the workflow:
`plan-workspace` maintains the workspace; main-context `plan-manager` runs six
phases — decide, draft, research, one plan review, implement, code review — and
archives; internal `plan-reviewer` returns a readable pre-implementation verdict.
Two read-only reviewer wrappers ship, `plan-reviewer` and `code-reviewer`, and
nothing else in the lifecycle has a wrapper.
</constraint>

The record is markdown only: `plan_contract: v2` frontmatter plus eight `##`
sections — `## Goal`, `## Research`, `## Steps`, `## Acceptance`,
`## Do not touch`, `## Open questions`, `## Review`, `## Verification Results`.
There are no hashes, permits, run identities, locks, bundles, or `v2`/`vN` plan
files, and the `plan.mjs` shipped inside the installed `plan-lifecycle` plugin
is the only lifecycle tool. This lifecycle creates zero commits and never
pushes; commit when the user asks, under `docks:commit-discipline`.

Every Steps row carries an `Effect` of exactly
`local|probe|production_access|publish|push|release|deploy`. A step whose
`Effect` is not `local` requires an in-session `ask` confirmation immediately
before it runs; when `ask` is unavailable the step is set `blocked` with
`blocked_reason` naming the unconfirmed effect. Persisted effects record intent
only.

A plan carrying a `Plan-run:` line is a v1 plan: render it, never parse or
migrate it, and finish it by hand by moving the file byte-unchanged to
`docs/plans/finished/<YYYY-MM-DD>-<slug>.md` with a `## Retirement` section
appended. The complete contract lives in `docs/plans/AGENTS.md`;
`docs/plans/CLAUDE.md` contains only `@AGENTS.md`.
```

## Verification

After migration moves and before deleting any legacy path:

- **Per-plan presence:** each inventoried non-finished source has exactly one
  mapped active destination with the same SHA-256 digest.
- **Net-count tripwire:** destination count equals inventoried non-finished
  source count. A lower or higher count stops.
- **Archive preservation:** the sorted path and digest inventory under
  `finished/` is byte-identical.
- **Removal safety:** no selected removal path contains a plan.
- **Lifecycle tool:** the report states the resolved absolute `plan.mjs` path, or
  states that the `plan-lifecycle` plugin is not installed. The tool is never
  proposed as a project file.

After bootstrap, migration, or refresh, verify both folders, nested contract,
exact shim and ignore rules, root routing, and reviewer-only wrapper topology.
For refresh, compare complete before and after inventories for `active/` and
`finished/`. Any delta fails. Report observed paths and repository status. Do
not claim a wrapper ran only because its file exists.

## BAD / GOOD

```text
BAD: Audit finds drift, so refresh the generated contract immediately.
GOOD: Audit reports drift; only an explicit refresh changes generated files.

BAD: Rewrite a v1 plan into the v2 body shape during workspace migration.
GOOD: Preserve the plan bytes and carry a wanted goal into a fresh v2 plan.

BAD: Overwrite an existing reviewer wrapper during bootstrap.
GOOD: Seed both reviewer wrappers only when their files are missing.

BAD: Report `plan.mjs` as missing from the repository and call the lifecycle manual.
GOOD: Resolve the tool inside the installed plugin and report its absolute path.
```

## References

- [`references/plans-agents-md-template.md`](references/plans-agents-md-template.md)
  is the copy-only current workspace contract.
- [`references/codex-agent-templates.md`](references/codex-agent-templates.md)
  supplies both read-only Codex reviewer wrapper defaults.
