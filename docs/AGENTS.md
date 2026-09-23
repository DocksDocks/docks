# Documentation conventions (`docs/`)

Read `docs/PLAN.md` before filing or updating a plan issue.

## Plan records

The canonical plan record is a GitHub issue, not a tracked markdown file.
Read `skills/productivity/plan-manager/references/plan-contract.md` inside the
installed `plan-lifecycle` plugin for the record and lifecycle contract.
`docs/PLAN.md` provides local routing. Do not duplicate the contract here.

`docs/PLAN-QUEUE.md` may remain as a human discovery and priority note.
No lifecycle helper reads it.

`docs/plans/finished/` is frozen pre-GitHub history. Never parse, migrate, or use
it as the current source of truth.

## Point-in-time records

Every file under `docs/` except `AGENTS.md`, `PLAN.md`, and `PLAN-QUEUE.md` is a
point-in-time record: release evidence, dated audits, and the frozen archive
(verify: `ls docs`). Preserve their historical claims and context when editing
them.

`file:line` anchors are allowed only in those point-in-time records. Long-lived
documentation and context-tree nodes must use the durable grammar:
`` `path` - `symbol/config key` - purpose (verify: `command`) ``.

Pointers here name concepts, not coordinates — if a path or symbol moved, trust the stated purpose and re-locate it (grep the symbol) before acting.
