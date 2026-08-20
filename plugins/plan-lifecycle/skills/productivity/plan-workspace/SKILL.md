---
name: plan-workspace
description: "Use when bootstrapping, migrating, auditing, or explicitly refreshing a GitHub-issue plan workspace, its labels, docs/PLAN.md standard, root routing, queue, or two reviewer wrappers. Not for deciding, drafting, reviewing, or implementing an individual goal (use plan-manager or plan-reviewer)."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-08-20"
  content_hash: "5bb1957c88d0eaf4e7bffe5f65dc1be86f33942b002c0d124f57c6e32573783d"
---

# Plans Workspace

Maintain the project-level plan workspace: repository labels, the `docs/PLAN.md`
pair, root routing, an optional queue, and two read-only reviewer wrappers. This
skill owns bootstrap, migration, audit, and explicit refresh. It does not own an
individual plan or its implementation.

<constraint>
Resolve the repository and classify the operation before writing. Audit is
read-only. Bootstrap applies only to `GREENFIELD`; migration applies only to
`MARKDOWN_V2`; refresh must be explicit and applies only to a recognizable
generated contract. `CURRENT` is a no-op. `AMBIGUOUS_CUSTOM` stops. Never
replace project-owned agent content or turn an audit finding into an implicit
refresh.
</constraint>

<constraint>
Migration preserves every active-plan byte. Inventory sorted source paths,
byte counts, and SHA-256 digests first; reject collisions; verify a unique issue
destination for every source and the equal-count tripwire before deleting any
source. Any source/destination byte delta stops. `docs/plans/finished/` is frozen
pre-GitHub history: never read, inventory, parse, migrate, delete, or rewrite it.
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

`plan.mjs` is plugin payload, not project payload. It ships inside the installed `plan-lifecycle` plugin at `skills/productivity/plan-manager/scripts/plan.mjs`. A project never vendors, copies, or re-creates it, and an unresolvable tool means the plugin is not installed. Never report it as a file missing from the repository.

Resolve it from the loaded `plan-manager` skill directory. When that directory
is unknown, search the runtime plugin cache and take the highest version. Run it
from the repository root so it resolves the target GitHub repository from that
checkout's remote. The tool is not a workspace marker.

Every bootstrap, migration, refresh, and audit report states its resolved
absolute path, or states that the `plan-lifecycle` plugin is not installed.

## Resolve operation and repository

Take the operation from the current request; drift never implies mutation.
Resolve the repository root with the runtime's repository tools, then resolve
and report the explicit `OWNER/REPO` using
`gh repo view --json nameWithOwner,visibility,defaultBranchRef`. Stop before a
write if the directory has no GitHub repository or the repository cannot be
named. Audit may still report local markers and the unresolved remote.

Repository label changes and issue creation are remote writes. Obtain the
required in-session confirmation immediately before each authorized write step,
naming `OWNER/REPO` and the effect. A missing confirmation makes the step
`blocked`; an audit never asks because it never writes.

## Read-only classification

Inspect `docs/PLAN.md`, `docs/AGENTS.md`, `docs/CLAUDE.md`, the root `## Plans`
section, `docs/PLAN-QUEUE.md`, the repository's `plan*` labels, and the two Codex
reviewer wrappers. Detect a recognizable old workspace from generated markers
and paths, but do not inspect anything under `docs/plans/finished/`.

Apply the table in order; `MARKDOWN_V2` and `STALE_V1` take precedence over
`GREENFIELD` when an old generated workspace is recognizable.

| Class | Required evidence | Allowed result |
|---|---|---|
| `MARKDOWN_V2` | A recognizable generated `docs/plans/` v2 workspace with `docs/plans/active/` | migrate to issues |
| `STALE_V1` | A recognizable generated PlanRunV1 workspace naming `Plan-run: PlanRunV1`, `plan_sha256`, or a review permit | audit report; explicit refresh of generated support only |
| `GREENFIELD` | No `docs/PLAN.md` and no repository label whose name is `plan` or starts `plan:` | bootstrap |
| `CURRENT` | Every current marker below matches | no-op or audit report |
| `STALE` | A recognizable issue-backed workspace misses or drifts from a current marker | audit report; explicit refresh only |
| `AMBIGUOUS_CUSTOM` | Any other shape or customized generated section | report and stop |

Current markers are exactly:

- the repository label set described below;
- `docs/PLAN.md` byte-identical to the terminal fence in the embedded template;
- `docs/AGENTS.md` routing plan work to `docs/PLAN.md` without replacing other
  project-owned documentation rules;
- `docs/CLAUDE.md` exactly `@AGENTS.md` plus a trailing newline;
- the generated root `## Plans` section below;
- the two reviewer wrappers and no other plan-prefixed wrapper;
- an optional, classification-neutral `docs/PLAN-QUEUE.md`.

The label set is created idempotently with `gh label create --force`: `plan`, `plan:drafting`, `plan:planned`, `plan:ongoing`, `plan:blocked`, `plan:finished`, plus the triage label `plan-scheduled`. Exactly one `plan:<status>` label is present at a time, and it mirrors the frontmatter `status`.

A missing marker makes a recognizable issue-backed workspace `STALE`. Audit
reports malformed queue bytes but does not repair them. Existing wrapper files
and unrelated `docs/AGENTS.md` content are project-owned and never overwritten.
Report unexpected plan-prefixed wrappers; do not delete them.

## Classification report

Before mutation, report every target, proposed action, and observed reason:

```text
| Target | Action | Reason |
|---|---|---|
| OWNER/REPO labels | CREATE/UPDATE | GREENFIELD bootstrap after confirmation |
| docs/PLAN.md | OFFER REFRESH | recognizable STALE standard |
| docs/plans/active/example.md | MIGRATE | MARKDOWN_V2 source; bytes preserved |
| docs/plans/finished/ | FREEZE | pre-GitHub history; contents not read |
| .codex/agents/code-reviewer.toml | CREATE | missing wrapper during bootstrap |
```

For audit, this report plus observed marker evidence is final. Do not continue
into an apply operation.

## Bootstrap

For `GREENFIELD` with an explicit bootstrap request:

1. Resolve and name `OWNER/REPO`. After the repository-metadata confirmation,
   run `plan.mjs labels` from that repository root.
2. Copy the terminal fence in
   [`references/plan-md-template.md`](references/plan-md-template.md) byte-for-byte
   to `docs/PLAN.md`.
3. Write or extend `docs/AGENTS.md` as the routing node: it must tell agents to
   read `docs/PLAN.md` before filing or updating a plan issue. Preserve unrelated
   project-owned rules. Write `docs/CLAUDE.md` as exactly `@AGENTS.md` plus a
   trailing newline.
4. Add the generated root `## Plans` section below without altering unrelated
   root rules.
5. Seed each missing `.codex/agents/plan-reviewer.toml` and
   `.codex/agents/code-reviewer.toml` from
   [`references/codex-agent-templates.md`](references/codex-agent-templates.md).
   Overwrite neither existing file.
6. Create `docs/PLAN-QUEUE.md` only when the user asks for a queue.

## Migrate a recognized markdown-v2 workspace

For `MARKDOWN_V2` with an explicit migration request:

1. Inventory every regular file directly under `docs/plans/active/` by sorted
   path, byte count, and SHA-256 digest. Run `plan.mjs check --file <path>` for
   each; a file that is not a valid v2 record stops migration. Do not list or
   hash `docs/plans/finished/`.
2. List existing plan-labeled issues before creating anything. Reject a body
   already matching a source, duplicate destination mapping, repeated issue
   number, or any other non-one-to-one collision.
3. Resolve and name `OWNER/REPO`. After confirmation, create the closed plan
   labels with `plan.mjs labels`.
4. After the issue-write confirmation, create exactly one issue per source with
   `gh issue create --repo OWNER/REPO --title <frontmatter-title> --body-file
   <source> --label plan --label plan:<frontmatter-status>`. Record the returned
   issue number and URL; never use `plan.mjs new`, because it renders a new body.
5. Read each new issue body back without adding or removing a byte. Verify its
   byte count and SHA-256 digest equal its source, then run
   `plan.mjs check <issue>`. Stop on any byte or check failure.
6. Prove that source count equals new destination count, every issue number is
   unique, and every source has exactly one verified destination. Do not delete
   a source yet.
7. Copy the embedded standard to `docs/PLAN.md`; write the `docs/AGENTS.md`
   routing node and exact `docs/CLAUDE.md` shim; replace the recognizable root
   section; and seed only missing reviewer wrappers.
8. Only after steps 5–7 succeed, delete the migrated active files. Remove
   generated `docs/plans/AGENTS.md`, `docs/plans/CLAUDE.md`, and
   `docs/plans/.gitignore`; remove `docs/plans/active/` only when empty. Leave
   `docs/plans/finished/` in place and untouched. Create `docs/PLAN-QUEUE.md`
   only when requested; translate an authorized old queue's `Plan` cells to the
   recorded issue numbers without changing lifecycle authority.

The issue number is the plan identity. No migrated slug or plan path survives as
lifecycle identity, and no command reads frozen history.

## Explicit refresh

A refresh request must be explicit in the current turn. Reclassify immediately
before writing. `CURRENT` is a no-op. `STALE` permits only repair of current
markers: confirmed label creation/update, the embedded standard, routing node,
exact shim, recognizable root section, optional requested queue, and missing
reviewer wrappers. It never edits an issue body.

`STALE_V1` preserves all plan records and permits only replacement of a
recognizable generated standard/routing/shim/root surface plus missing wrappers.
It does not parse v1 records, create replacement issues, or relabel them. Use
`MARKDOWN_V2` migration only for valid v2 active records. Every other class
stops. Never delete an obsolete project-owned wrapper automatically.

## Generated root Plans section

```markdown
## Plans

Use direct implementation for one clear, reversible, low-risk local diff with one
bounded acceptance path; it creates no plan issue, reviewer, or automatic
commit. Use a canonical plan for explicit planning, multi-commit or
cross-repository work, cold handoff, an unresolved decision, a cross-subsystem or
public-contract change, security-sensitive or destructive work, or any
non-`local` effect.

<constraint>
The plan record is a GitHub issue: its body carries the `plan_contract: v2` frontmatter and the eight `##` sections, its `plan:<status>` label mirrors the frontmatter `status`, and no plan markdown is tracked in the repository. Exactly three skills own the workflow: `plan-workspace` maintains the workspace; main-context `plan-manager` runs six phases — decide, draft, research, one plan review, implement, code review — and archives; internal `plan-reviewer` returns a readable pre-implementation verdict. Two read-only reviewer wrappers ship, `plan-reviewer` and `code-reviewer`, and nothing else in the lifecycle has a wrapper.
</constraint>

The record is markdown inside the issue body: `plan_contract: v2` frontmatter
plus eight `##` sections — `## Goal`, `## Research`, `## Steps`,
`## Acceptance`, `## Do not touch`, `## Open questions`, `## Review`,
`## Verification Results`. There are no hashes, permits, run identities, locks,
or bundles, and the `plan.mjs` shipped inside the installed `plan-lifecycle`
plugin is the only lifecycle tool. This lifecycle creates zero commits and never pushes.
Commit when the user asks, under `docks:commit-discipline`.

Every Steps row carries an `Effect` of exactly
`local|probe|production_access|publish|push|release|deploy`. A step whose
`Effect` is not `local` requires an in-session `ask` confirmation immediately
before it runs; when `ask` is unavailable the step is set `blocked` with
`blocked_reason` naming the unconfirmed effect. Persisted effects record intent
only.

Work lands through a pull request whose body carries `Closes #<issue>` and whose base is the repository default branch, because GitHub interprets a closing keyword only in a pull request that targets the default branch. `plan.mjs archive` verifies that merged pull request rather than performing the merge.

Render a plan body verbatim only when the user names that plan and asks to see it. After a write, report the one-line header strip and the changed lines only; a write never re-renders the body.

`docs/plans/finished/` is frozen pre-GitHub history: read it as history, never as
a source of truth, and never parse or migrate it. The complete contract lives in
`docs/PLAN.md`; `docs/AGENTS.md` routes to it and `docs/CLAUDE.md` contains only
`@AGENTS.md`.
```

## Verification

After migration issue creation and before deleting any active source:

- **Per-plan round-trip:** each inventoried source has exactly one issue body
  with the same byte count and SHA-256 digest, and `plan.mjs check <issue>` passes.
- **Equal-count tripwire:** verified destination count equals inventoried source
  count; every issue number is unique. A lower or higher count stops.
- **Frozen history:** no command listed, read, hashed, parsed, moved, or rewrote
  anything under `docs/plans/finished/`.
- **Removal safety:** only verified active sources and recognizable generated
  support files are selected for removal.

After bootstrap, migration, or refresh, verify the repository label set,
byte-identical `docs/PLAN.md`, routing node, exact Claude shim, exact root
section, optional queue behavior, and reviewer-only wrapper topology. Report
observed paths, issue numbers created by migration, and repository status. Do
not claim a wrapper ran only because its file exists.

## BAD / GOOD

```text
BAD: Audit finds drift, so refresh labels and generated files immediately.
GOOD: Audit reports drift; only an explicit refresh changes current markers.

BAD: Re-render an active v2 file with plan.mjs new and delete the source.
GOOD: Create an issue from the source bytes, prove the round-trip, then delete.

BAD: Hash docs/plans/finished/ to prove that frozen history was preserved.
GOOD: Never read frozen history; preserve the directory by leaving it untouched.

BAD: Overwrite an existing reviewer wrapper during bootstrap.
GOOD: Seed both reviewer wrappers only when their files are missing.

BAD: Report plan.mjs as a missing project file and recreate it locally.
GOOD: Resolve the installed plugin tool and report its absolute path.
```

## References

- [`references/plan-md-template.md`](references/plan-md-template.md) supplies the
  byte-identical `docs/PLAN.md` standard and routing/shim instructions.
- [`references/codex-agent-templates.md`](references/codex-agent-templates.md)
  supplies both read-only Codex reviewer wrapper defaults.
