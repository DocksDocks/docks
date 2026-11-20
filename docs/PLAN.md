# Plans

A plan records a goal, research, ordered work, and verification evidence.
The canonical record is a GitHub issue. Each review round adds one comment to
it. Work that needs more than one landing pull request uses a parent plan with
one child plan (a sub-issue) per pull request. GitHub owns its title, assignee,
labels, timestamps, and completion state.
Do not track plan bodies as repository files.

Read `skill://plan-manager/references/plan-contract.md` for the plan contract
and helper commands. In a normal session, this path resolves to the installed
`plan-lifecycle` plugin. In a session that loads this checkout with
`--plugin-dir` (the README "Develop locally" section), it resolves to the
checkout copy under change. Read the contract by this path, not by a file path.

Use `plan-workspace` to maintain workspace routing, main-context `plan-manager`
to run the lifecycle, and internal `plan-reviewer` for plan review.
The two read-only wrappers are `plan-reviewer` and `code-reviewer`.
If the plugin is missing, report that prerequisite. Do not invent a local copy.
