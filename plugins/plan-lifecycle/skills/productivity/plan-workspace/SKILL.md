---
name: plan-workspace
description: "Use when bootstrapping, migrating, auditing, or explicitly refreshing a GitHub-issue plan workspace, its labels, docs/PLAN.md standard, root routing, or two reviewer wrappers. Not for deciding, drafting, reviewing, or implementing an individual goal (use plan-manager or plan-reviewer)."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-11-19"
  content_hash: "40c754b33f9d9bb22910809901047b3ec50f46df8dc05722d10cc48e549c408c"
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

Inspect the standard, routing nodes, root Plans section, reviewer wrappers,
pull-request template, and project `verify` skill. Detect the template with the
detection in
[`references/pull-request-template.md`](references/pull-request-template.md).
A missing or unusable template is a report item, not drift: name each
`unusable` line. A detection error is not a missing template: report the error.
Detect the skill with the Detect block in
[`references/verify-skill-template.md`](references/verify-skill-template.md).
A missing skill, a `verify link:` line other than `present`, and a
`verify unverified:` line are report items, not drift. Report an `ERROR` line
as a failed check.
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

A legacy `docs/CLAUDE.md` is a second home for instructions. If it holds only
`@AGENTS.md`, it is redundant generated scaffolding: report it and propose its
removal. If it holds other content, report it as AMBIGUOUS_CUSTOM and leave it
in place. A `CLAUDE.md` without an `@AGENTS.md` import makes Claude read it
instead of `AGENTS.md`. A root `CLAUDE.md`, `.claude/CLAUDE.md`, or
`CLAUDE.local.md` without that import hides every `AGENTS.md` below it, so the
routing this skill writes would not load: report each one; do not remove it here.

Before mutation, report each target, proposed action, and observed reason.
For audit, that report is final.

## Bootstrap

1. Confirm the operation and resolved repository.
2. Copy the terminal fence from
   [`references/plan-md-template.md`](references/plan-md-template.md) into
   `docs/PLAN.md`. It is a short pointer to the canonical contract.
3. Add routing to `docs/AGENTS.md` that tells agents to read `docs/PLAN.md`
   before plan work. Preserve unrelated documentation rules. Never create
   `docs/CLAUDE.md`; Claude Code reads `docs/AGENTS.md` natively. Whether you
   create `docs/AGENTS.md` or add routing to an existing one, make sure it
   carries this line, and add it at the end if missing: "Pointers here name
   concepts, not coordinates — if a path or symbol moved, trust the stated
   purpose and re-locate it (grep the symbol) before acting." If the root
   `AGENTS.md` has a node table, add a `docs/AGENTS.md` row to it.
4. Add the root Plans section below without changing unrelated rules.
5. Seed only missing Codex reviewer files from
   [`references/codex-agent-templates.md`](references/codex-agent-templates.md).
   Never overwrite an existing wrapper or create a manager wrapper.
6. Offer to create the pull-request template from
   [`references/pull-request-template.md`](references/pull-request-template.md).
   Run its detection first. When it prints a usable template, make no change.
   When it prints an `ERROR` line, report the error and write nothing. Only on
   `pull-request template: none`, fill in the check command that the root
   instruction file names, print the draft with each `unusable` line, and ask.
   When the user accepts, run the reference's write gate, and write
   `.github/pull_request_template.md` only on `target free`. On
   `target occupied`, report the entry that occupies the path and write
   nothing; the user resolves it. Never write through a symlink.
7. Offer to create the project `verify` skill from
   [`references/verify-skill-template.md`](references/verify-skill-template.md).
   `plan-manager` runs the end-to-end Acceptance rows of a plan through its
   flows. Run its Create or re-verify section, which runs the Detect block
   first. That section changes nothing on a verified and linked skill, asks
   before each write, and writes nothing when the repository has no runnable
   surface.

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
Migration and refresh delete a legacy `docs/CLAUDE.md` only when it holds only
`@AGENTS.md`, and only after the pre-mutation report and user confirmation.

## Generated root Plans section

```markdown
## Plans

Read `docs/PLAN.md` before plan work; `docs/AGENTS.md` holds the docs-folder
rules. The installed `plan-lifecycle` plugin's
`plan-manager/references/plan-contract.md` is the canonical contract.
Use `plan-workspace` for setup, main-context `plan-manager` for the six phases,
and read-only `plan-reviewer` and `code-reviewer` wrappers for review.
Use direct implementation only for a clear, reversible, low-risk local diff
with one bounded acceptance path. Otherwise follow the plan-manager decision.
Plan issues are the live records. Leave `docs/plans/finished/` frozen.
```

## Verification

Check each changed section: standard pointer, docs routing, absence of a
legacy `docs/CLAUDE.md`, root routing, both reviewer wrappers, the
pull-request template, and the project `verify` skill. If generated
content shrinks, account for each removed section in the canonical reference or
record why it was obsolete.
Do not discard project-owned rules. Verify links resolve in the installed plugin.

Run these checks from the repository root. Each must print the expected result:

```bash
test -s docs/PLAN.md && echo "PLAN.md present"
grep -n 'docs/PLAN.md' docs/AGENTS.md          # docs routing
grep -n 'docs/AGENTS.md' AGENTS.md             # root routes to the docs node
grep -n '^## Plans' AGENTS.md                  # root Plans section
grep -c 'Pointers here name concepts' docs/AGENTS.md   # 1 or more
ls .codex/agents/plan-reviewer.toml .codex/agents/code-reviewer.toml
find . \( -name .git -o -name node_modules -o -path ./docs/plans/finished \) -prune -o \( -name CLAUDE.md -o -name CLAUDE.local.md \) -print   # no output
```

Run the template detection in
[`references/pull-request-template.md`](references/pull-request-template.md).
It prints a usable template, or `pull-request template: none` only when the
user declined the offer or an unusable entry occupies the target. Report an
`ERROR` line as a failed check.

Run the Detect block in
[`references/verify-skill-template.md`](references/verify-skill-template.md).
A complete run prints `verify skill: present`, `verify link: present`, and no
`verify unverified:` or `ERROR` line. Report each other result with its cause:

- `verify skill: missing`: the user declined the offer, the repository has no
  runnable surface, a question stopped the run, or the operation was a
  migration or a refresh, which make no offer.
- A `verify unverified:` line: the user declined to verify the skill again, or
  a command failed. Name the failed command and its output.
- `verify link: occupied`: name the entry at `.claude/skills/verify`; the user
  resolves it.
- An `ERROR` line: a failed check.

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

## Report a problem with this skill

When this skill gives a wrong, outdated, or unsafe instruction, or a script that it ships fails, report the problem in the public DocksDocks/docks repository. Use the docks `report-skill-issue` skill for the report. If that skill is not installed, do not file anything: give the user a draft instead. The draft names this skill and its plugin version, quotes the instruction, and states what happened and what you expected. Leave out secrets and private names.
