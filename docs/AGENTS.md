# Documentation conventions (`docs/`)

Read `docs/PLAN.md` before filing or updating a plan issue.

## Plan records

Plan records are GitHub issues whose bodies start with
`<!-- plan-contract: v3 -->` and carry no frontmatter. Every plan issue carries
`plan`; an open plan carries exactly one of `plan:drafting`, `plan:planned`,
`plan:ongoing`, or `plan:blocked`. Closed completion derives from GitHub
`state` and `stateReason`, and every closed read ignores stale phase labels. The
issue number is the plan identity; do not create a tracked markdown plan record.

`docs/PLAN-QUEUE.md` is an optional, authority-free discovery and priority view.
Its `Plan` cells hold issue numbers. The complete record standard and lifecycle
contract live in `docs/PLAN.md`.

`docs/plans/finished/` is frozen pre-GitHub history. Never parse, migrate, or use
it as the current source of truth.

## Point-in-time records

`docs/release-evidence/`, `docs/authoring-audits.md`, and
`docs/optimization-audit-may-2026.md` are point-in-time records. Preserve their
historical claims and context when editing them.

`file:line` anchors are allowed only in those point-in-time records. Long-lived
documentation and context-tree nodes must use the durable grammar:
`` `path` — `symbol/config key` — purpose (verify: `command`) ``.

Pointers here name concepts, not coordinates — if a path or symbol moved, trust
the stated purpose and re-locate it (grep the symbol) before acting.
