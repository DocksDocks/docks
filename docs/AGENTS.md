# Documentation conventions (`docs/`)

Read `docs/PLAN.md` before filing or updating a plan issue.

## Plan records

The canonical plan record is a GitHub issue, not a tracked markdown file.
Read `skills/productivity/plan-manager/references/plan-contract.md` inside the
installed `plan-lifecycle` plugin for the record and lifecycle contract.
`docs/PLAN.md` provides local routing. Do not duplicate the contract here.

## Records

`docs/` holds only `AGENTS.md` and `PLAN.md` (verify: `ls docs`). Record plans,
audits, and release evidence in GitHub issues and pull requests. Do not add
them as files under `docs/`.

Long-lived documentation and context-tree nodes must use the durable grammar:
`` `path` - `symbol/config key` - purpose (verify: `command`) ``. Do not use
`file:line` anchors in them.

Pointers here name concepts, not coordinates — if a path or symbol moved, trust the stated purpose and re-locate it (grep the symbol) before acting.
