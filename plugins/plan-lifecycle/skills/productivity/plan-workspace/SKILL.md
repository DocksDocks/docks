---
name: plan-workspace
description: "Use when bootstrapping, migrating, auditing, or explicitly refreshing a GitHub-issue plan workspace, its labels, docs/PLAN.md standard, root routing, or two reviewer wrappers. Not for deciding, drafting, reviewing, or implementing an individual goal (use plan-manager or plan-reviewer)."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-09-09"
  content_hash: "60059d6b6efaa3cdea571e4906546d6d3cc53e198077506cc89f5f29328cc9e9"
---

# Plans Workspace

Maintain repository-level plan routing and the two read-only reviewer wrappers.
This skill owns bootstrap, migration, audit, and explicit refresh, not an
individual goal. Read the `plan-manager` skill's
`references/plan-contract.md` for the canonical lifecycle contract.

<constraint>
Classify before writing. Audit is read-only. Refresh requires an explicit
request. Preserve project-owned rules and wrapper content. Never turn drift
into permission to overwrite a customized workspace.
</constraint>

<constraint>
Preserve all legacy plan files at their original paths without opening,
parsing, hashing, copying, uploading, deleting, or rewriting them. Never open
or inventory `docs/plans/finished/`. Create fresh issues only for titles and
goals the user restates; derive no content from legacy files.
</constraint>

## Resolve the repository and tool

Resolve the repository root and name the target with
`gh repo view --json nameWithOwner,visibility,defaultBranchRef`.
Stop before writing if the target is unresolved. Audit may report that fact.
Resolve `plan.mjs` from the installed `plan-manager` skill or runtime cache.
It is plugin payload, not a missing project file. Never vendor or recreate it.
Report its resolved path or that the plugin is unavailable.

## Classify

Inspect the standard, routing nodes, root Plans section, and reviewer wrappers.
Use generated scaffolding outside frozen history to recognize legacy workspaces.

| Class | Evidence | Action |
|---|---|---|
| LEGACY_MARKDOWN | Recognizable generated tracked-plan scaffolding | Explicit migration only |
| GREENFIELD | No plan standard or existing issue-backed workspace | Bootstrap |
| CURRENT | Standard, routing, and wrappers match current guidance | No-op or audit |
| STALE | Recognizable generated workspace has drift | Explicit refresh only |
| AMBIGUOUS_CUSTOM | Customized or unrecognized content | Report and stop |

Legacy classification takes precedence over greenfield. Labels are not a
bootstrap prerequisite: `new` creates the reserved labels when a plan is filed.
Do not create a queue. Existing project queues remain outside this lifecycle.

Before mutation, report each target, proposed action, and observed reason.
For audit, that report is final.

## Bootstrap

1. Confirm the operation and resolved repository.
2. Copy the terminal fence from
   [`references/plan-md-template.md`](references/plan-md-template.md) into
   `docs/PLAN.md`. It is a short pointer to the canonical contract.
3. Add routing to `docs/AGENTS.md` that tells agents to read `docs/PLAN.md`
   before plan work. Preserve unrelated documentation rules. Write
   `docs/CLAUDE.md` as `@AGENTS.md` with a trailing newline.
4. Add the root Plans section below without changing unrelated rules.
5. Seed only missing Codex reviewer files from
   [`references/codex-agent-templates.md`](references/codex-agent-templates.md).
   Never overwrite an existing wrapper or create a manager wrapper.

## Migrate or refresh

For explicit migration, identify only recognizable generated scaffolding.
Leave all legacy plans and directories in place. Ask for the title and goal of
each goal that should remain live. Use the publication preflight and `new` in
`plan-manager` for those fresh records. Read each created issue with `show`
and report its number, URL, and drafting state.

Replace only recognized generated standard and routing sections. Seed missing
reviewer wrappers. Do not translate legacy plans or queues. Ambiguous content
stops migration rather than becoming an inferred contract.

Explicit refresh repairs only recognized stale generated surfaces. Reclassify
before writing. CURRENT remains a no-op. Refresh never edits issue bodies.

## Generated root Plans section

```markdown
## Plans

Read `docs/PLAN.md` before plan work. The installed `plan-lifecycle` plugin's
`plan-manager/references/plan-contract.md` is the canonical contract.
Use `plan-workspace` for setup, main-context `plan-manager` for the six phases,
and read-only `plan-reviewer` and `code-reviewer` wrappers for review.
Use direct implementation only for a clear, reversible, low-risk local diff
with one bounded acceptance path. Otherwise follow the plan-manager decision.
Plan issues are the live records. Leave `docs/plans/finished/` frozen.
```

## Verification

Check each changed section: standard pointer, docs routing, Claude shim, root
routing, and both reviewer wrappers. If generated content shrinks, account for
each removed section in the canonical reference or record why it was obsolete.
Do not discard project-owned rules. Verify links resolve in the installed plugin.

For migration, confirm each issue uses a user-restated title and goal, and
read back its drafting state. Confirm no operation touched or inventoried
legacy plan files or frozen history. Do not inspect those files to prove this.
Report changed paths and created issues. File presence does not prove a wrapper
ran. An audit reports missing or stale surfaces without repairing them.

## BAD / GOOD

```text
BAD: Audit finds drift and overwrites the standard.
GOOD: Report drift and wait for an explicit refresh request.

BAD: Parse a legacy plan to create a fresh issue.
GOOD: Preserve the file and use only the user's restated title and goal.
```
