---
name: plan-workspace
description: "Use when bootstrapping, migrating, auditing, or explicitly refreshing a GitHub-issue plan workspace, its labels, docs/PLAN.md standard, root routing, queue, or two reviewer wrappers. Not for deciding, drafting, reviewing, or implementing an individual goal (use plan-manager or plan-reviewer)."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-08-21"
  content_hash: "343de0f326f6a923217298985839b82cbcca492c895502ccb8438587342598d4"
---

# Plans Workspace

Maintain the project-level plan workspace: repository labels, the `docs/PLAN.md`
pair, root routing, an optional queue, and two read-only reviewer wrappers. This
skill owns bootstrap, migration, audit, and explicit refresh. It does not own an
individual plan or its implementation.

<constraint>
Resolve the repository and classify the operation before writing. Audit is
read-only. Bootstrap applies only to `GREENFIELD`; migration applies only to
`LEGACY_MARKDOWN`; refresh must be explicit and applies only to a recognizable
generated contract. `CURRENT` is a no-op. `AMBIGUOUS_CUSTOM` stops. Never
replace project-owned agent content or turn an audit finding into an implicit
refresh.
</constraint>

<constraint>
Migration preserves every legacy plan file by leaving it exactly where it is,
unmodified. Never open, parse, hash, copy, upload, delete, or rewrite one. Only
goals the user explicitly restates as a title and goal enter the lifecycle,
through fresh v3 issues. `docs/plans/finished/` is frozen pre-GitHub history:
never read, inventory, parse, migrate, delete, or rewrite it.
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
reviewer wrappers. Detect a recognizable legacy markdown workspace only from
generated scaffolding and paths; never open a legacy plan file or inspect
anything under `docs/plans/finished/`.

Apply the table in order; `LEGACY_MARKDOWN` takes precedence over `GREENFIELD`
while its old generated scaffolding is recognizable.

| Class | Required evidence | Allowed result |
|---|---|---|
| `LEGACY_MARKDOWN` | Recognizable generated scaffolding for a tracked-markdown plan workspace | preserve every plan file; migrate only user-restated goals into fresh issues |
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

The label set is created idempotently with `gh label create --force`: `plan`, `plan:drafting`, `plan:planned`, `plan:ongoing`, and `plan:blocked`. An open plan carries exactly one phase label. Closed-plan completion derives from GitHub `state` and `stateReason`; phase labels describe open work only.

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
| docs/plans/active/example.md | PRESERVE | LEGACY_MARKDOWN history; bytes untouched |
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

## Migrate a recognized legacy markdown workspace

For `LEGACY_MARKDOWN` with an explicit migration request, preserve the old plan
files as inert history and create current records only for goals the user still
wants:

1. Identify the recognizable generated standard, routing, shim, root section,
   queue, and `docs/plans/` support paths without opening a legacy plan file.
   Customized or ambiguous scaffolding stops migration.
2. Report every legacy plan path as `PRESERVE`. Do not read, hash, copy, upload,
   delete, rewrite, or derive metadata from any of those files.
3. Ask the user to name each goal that should remain live, supplying its exact
   title and goal. A goal the user does not restate stays only in inert history.
4. Resolve and name `OWNER/REPO`. After the repository-metadata confirmation,
   create the reserved plan labels with `plan.mjs labels`.
5. After the issue-write confirmation, run
   `plan.mjs new --title <user-title> --goal <user-goal>` once per restated
   goal. Every new record starts at `plan:drafting` with the normal v3 body and
   the template Research section. Never derive its title, goal, phase, or
   body from a legacy file.
6. Read each new issue back, run `plan.mjs check <issue>`, and verify its first
   line marker and `plan:drafting` label. Record the returned issue number and
   URL for the user.
7. Replace only the recognizable generated standard, routing, shim, and root
   surfaces with the current issue-backed versions; seed only missing reviewer
   wrappers. Remove only recognizable generated `docs/plans/AGENTS.md`,
   `docs/plans/CLAUDE.md`, and `docs/plans/.gitignore` scaffolding that advertised
   the tracked-plan contract. Leave all plan files and their directories in
   place.
8. Create a current `docs/PLAN-QUEUE.md` only when requested, using the fresh
   issue numbers. Never read or translate a legacy queue.

The issue number is the plan identity. Legacy files remain inert history, no
command reads them, and their paths never become lifecycle identity.

## Explicit refresh

A refresh request must be explicit in the current turn. Reclassify immediately
before writing. `CURRENT` is a no-op. `STALE` permits only repair of current
markers: confirmed label creation/update, the embedded standard, routing node,
exact shim, recognizable root section, optional requested queue, and missing
reviewer wrappers. It never edits an issue body.

`LEGACY_MARKDOWN` uses only the migration route above. It never makes an old file
readable or eligible for issue upload. Every other class stops. Never delete an
obsolete project-owned wrapper automatically.

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
The plan record is a GitHub issue. Its body starts with
`<!-- plan-contract: v3 -->`, then a blank line and the exact eight `##`
sections; it has no frontmatter. GitHub owns title, open-work phase, owner,
timestamps, and completion, and no plan markdown is tracked in the repository.
Exactly three skills own the workflow: `plan-workspace` maintains the workspace;
main-context `plan-manager` runs six phases — decide, draft, research, one plan
review, implement, code review — and archives; internal `plan-reviewer` returns
a readable pre-implementation verdict. Two read-only reviewer wrappers ship,
`plan-reviewer` and `code-reviewer`, and nothing else in the lifecycle has a
wrapper.
</constraint>

After the marker and blank line, the record carries exactly `## Goal`,
`## Research`, `## Steps`, `## Acceptance`, `## Do not touch`,
`## Open questions`, `## Review`, and `## Verification Results`, in that order
and once each. `## Goal` carries exactly one mode line. Open-work phase is one
of `drafting`, `planned`, `ongoing`, or `blocked` in a `plan:<phase>` label; a
blocked plan starts `## Open questions` with `Blocked: <one-line reason>`.
Closed completion derives from GitHub `state` and `stateReason`. There are no
hashes, permits, run identities, locks, or bundles, and the `plan.mjs` shipped
inside the installed `plan-lifecycle` plugin is the only lifecycle tool. This
lifecycle creates zero commits and never pushes. Commit when the user asks,
under `docks:commit-discipline`.

Every Steps row carries an `Effect` of exactly
`local|probe|production_access|publish|push|release|deploy`. A step whose
`Effect` is not `local` requires an in-session `ask` confirmation immediately
before it runs; when `ask` is unavailable the step is set `blocked` and the plan
reason becomes the first `## Open questions` line, `Blocked: <reason>`.
Persisted effects record intent only.

Work lands through a pull request whose body carries `Closes #<issue>` and whose
base is the repository default branch. `plan.mjs archive` is a verifier: it
requires completed closure, terminal steps, an exact `Code-review: pass` line,
and a merged closing pull request into that branch; it writes no status.

Render a plan body verbatim only when the user names that plan and asks to see it. After a write, report the one-line header strip and the changed lines only; a write never re-renders the body.

`docs/plans/finished/` is frozen pre-GitHub history: read it as history, never as
a source of truth, and never parse or migrate it. The complete contract lives in
`docs/PLAN.md`; `docs/AGENTS.md` routes to it and `docs/CLAUDE.md` contains only
`@AGENTS.md`.
```

## Verification

After migration issue creation and before changing generated scaffolding:

- **Legacy-file preservation:** no command opened, parsed, hashed, copied,
  uploaded, deleted, or rewrote a legacy plan file; every file remains at its
  original path.
- **Goal provenance:** every created issue has one exact user-supplied title and
  goal; no field came from a legacy file.
- **Fresh-record check:** every created issue starts with the v3 marker, carries
  `plan:drafting`, and passes `plan.mjs check <issue>`.
- **Frozen history:** no command listed, read, hashed, parsed, moved, or rewrote
  anything under `docs/plans/finished/`.

After bootstrap, migration, or refresh, verify the repository label set,
byte-identical `docs/PLAN.md`, routing node, exact Claude shim, exact root
section, optional queue behavior, and reviewer-only wrapper topology. Report
observed paths, issue numbers created by migration, and repository status. Do
not claim a wrapper ran only because its file exists.

## BAD / GOOD

```text
BAD: Audit finds drift, so refresh labels and generated files immediately.
GOOD: Audit reports drift; only an explicit refresh changes current markers.

BAD: Parse or upload a legacy plan file, then delete or rewrite the source.
GOOD: Leave every old file unopened and create only user-restated goals through plan.mjs new.

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
