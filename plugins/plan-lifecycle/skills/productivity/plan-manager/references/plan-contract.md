# The v2 plan contract (exact)

This file is the single source of truth for the v2 plan record. The three plan
skills, the workspace template, both reviewer wrappers, and each project's
`docs/plans/AGENTS.md` defer to it rather than restating the shapes.

## Contents

- [Frontmatter](#frontmatter--closed-map-exactly-these-keys-in-this-order)
- [Body sections](#body--exactly-these-eight--sections-in-this-order-each-present-once)
- [Steps table](#steps-table--exact-header-and-cell-grammar)
- [Acceptance table](#acceptance-table--exact-header)
- [Review records](#review-records--readable-markdown-no-hashes)
- [Lifecycle transitions](#lifecycle-transitions--closed)
- [Enforcement boundary](#enforcement-boundary)
- [What the lifecycle never does](#what-the-lifecycle-never-does)
- [Classifying an older record](#classifying-an-older-record)

## Frontmatter — closed map, exactly these keys in this order

```yaml
---
plan_contract: v2
title: Short imperative title, at most 70 characters
goal: One observable sentence, at most 200 characters
status: drafting | planned | ongoing | blocked | finished
created: "2026-08-08T12:00:00+00:00"
updated: "2026-08-08T12:00:00+00:00"
assignee: null
---
```

`status: blocked` adds exactly one key, `blocked_reason: <non-empty text>`,
immediately after `status`. No other status may carry it.

`created` and `updated` are double-quoted ISO timestamps that carry an explicit
offset. `updated` never precedes `created`.

Check 1 enforces both key membership and displayed order. When the order is
wrong, its error names the first key found out of position.

Removed and not replaced: `plan_hash_mode`, `started_at`, `finished_at`, `tags`,
`related_plans`, `scheduled`/`trigger`/`scheduled_date`/`auto_execute`,
`blocked_since`, and every hash, UUID, `repository_id`, `plan_path`, `run_id`,
`goal_id`, `risk`, and review-phase field.

`risk` is deleted deliberately: it existed to decide whether a draft review was
required, and the plan review is now unconditional for every canonical plan. The
`scheduled` status is deleted because nothing consumed its trigger fields;
deferred work stays `planned` and is ordered by `docs/plans/QUEUE.md`.

## Body — exactly these eight `##` sections, in this order, each present once

Every v2 plan declares `plan_contract: v2` in a closed frontmatter map and carries exactly these eight `##` sections, in this order, each present once: `## Goal`, `## Research`, `## Steps`, `## Acceptance`, `## Do not touch`, `## Open questions`, `## Review`, `## Verification Results`.

| Section | Contents |
|---|---|
| `## Goal` | The observable outcome, why it is needed now, and exactly one line `Mode: plan-and-implement` or `Mode: plan-only` recording the phase-1 decision. |
| `## Research` | What was verified and how: repository paths and symbols read, official-doc or web sources with URLs, the hypothesis stated and confirmed or refuted, and one line naming the durable fix chosen over the available temporary one. |
| `## Steps` | The Steps table below. |
| `## Acceptance` | The Acceptance table below. |
| `## Do not touch` | Paths and behaviors the change must leave alone. `None` when nothing applies. |
| `## Open questions` | Decisions only the user can make. `None` when there are none. |
| `## Review` | Plan-review and code-review records, appended by the manager. |
| `## Verification Results` | Observed commands and their real output, written during implementation. |

One optional ninth section, `## Retirement`, is allowed only as the last section.
It is what the abandonment exit appends, and a retired plan must still validate.

The body contains no absolute machine path. A plan is a cold handoff, and a path
from one machine is not portable.

Once the plan leaves `drafting`, `## Research` must no longer carry the template
placeholder `_Not researched yet._`.

The CLI reports `check 11: Research must be filled once the plan leaves drafting` when this research rule fails.

## Steps table — exact header and cell grammar

```text
| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | add_plan_cli | Add the plan CLI with new/check/status/step/list/next/archive | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs | — | `local` | `planned` | `plan.mjs check <plan>` exits 0 |
```

- `Id` matches `[a-z][a-z0-9_]{0,63}` and is unique within the plan. Every plan
  requires it; there is no grandfather set.
- The union of the `Files` cells is the plan's declared scope, and the review
  diff and any subset scope check read it from there.
- No `Files` cell names the plan's own path. Writing lifecycle state into the
  record is the CLI's job, not an implementation step.
- `Depends` is `—` or a comma-separated list of lower display numbers from the
  same table.
- `Effect` is exactly one of `local`, `probe`, `production_access`, `publish`,
  `push`, `release`, `deploy`.
- `Status` is exactly one of `planned`, `in-flight`, `done`, `blocked`,
  `skipped`. `done` and `skipped` are terminal.
- `Done when` states one observable proof. It carries no "or STOP" clause. When
  a step cannot complete, first run
  `plan.mjs step <slug> <step-id> blocked`, then record the reason with
  `plan.mjs status <slug> blocked --reason <text>`.
- Step citations anywhere in the body are written `step:<id>` and must resolve to
  a declared id. A bare `step 3` is invalid.

## Acceptance table — exact header

```text
| ID | Command | Expected |
|---|---|---|
| A1 | `node --test test/` | Exit 0, 0 failing |
```

Ids are unique. Commands run from the repository root and carry no
`cd <absolute path>` prefix.

## Review records — readable markdown, no hashes

The manager appends to `## Review`. Two record shapes, exactly:

```markdown
### Plan review — 2026-08-08
Plan-review: pass
- [goal_fit] `## Steps` row 4 — the step deletes the validator but no step adds its replacement — add a step that installs the replacement before the deletion
```

```markdown
### Code review round 1 — 2026-08-08
Code-review: fixes-required
- HIGH · Security · plugins/x/y.mjs:41 — user input reaches `execSync` unquoted — pass argv array to `spawnSync`
```

`Plan-review:` is exactly `pass`, `repair`, or `blocked`. `Code-review:` is
exactly `pass`, `fixes-required`, or `blocked`. `pass` has no finding lines; the
others have at least one.

A plan-review finding is exactly one of `goal_fit`, `research_gap`, or `security_risk`; nothing else is a finding. A sufficient plan passes.

## Lifecycle transitions — closed

```text
drafting  -> planned | ongoing | blocked
planned   -> drafting | ongoing | blocked
ongoing   -> finished | blocked
blocked   -> drafting | planned | ongoing
finished  -> (terminal, no transition)
```

The `planned -> drafting` transition returns a plan to drafting after substantive
review repair.

An absent plan starts at `drafting`. A finished plan lives in
`docs/plans/finished/`.

One exemption, and only one: `plan.mjs retire` sets `finished` from any
non-`finished` status. It is the abandonment exit, it always writes a
`## Retirement` section carrying the reason, and it is the only way to reach
`finished` without a passed code review. Everything else follows the table.

## Enforcement boundary

`plan.mjs check` enforces only record-shape and content predicates it can derive
from the plan bytes and supplied path. Mutating CLI commands additionally
enforce preconditions visible to them, such as lifecycle, step-transition, and
dependency state. CLI silence certifies only the checks that command performed;
it never grants permission to perform an external effect.

The agent, not the CLI, enforces the execution boundary. A step whose `Effect`
is not `local` requires an in-session `ask` confirmation immediately before it
runs; when `ask` is unavailable the step is set `blocked` with `blocked_reason`
naming the unconfirmed effect. The CLI cannot observe that confirmation, so
moving such a step to `in-flight` does not certify permission, and there is
deliberately no self-certifying `--confirmed` flag: an agent asserting its own
compliance is the proxy this contract exists to avoid.

## What the lifecycle never does

No hashes, no permits, no run identity, no lock files, no bundle sealing, no
automatic commits, no automatic push, no external-authority object, and no
`v2`/`vN` plan files. The lifecycle does not weaken the agent-enforced boundary
above.

## Classifying an older record

A file whose frontmatter does not declare `plan_contract: v2` is a v1 plan. Every
command reports it as `v1` and none parses it further, so 130 archived records
stay listable without a migration path. `unreadable` is reserved for a plan that
declares v2 and then fails to parse, because that is the only case an author can
act on.
