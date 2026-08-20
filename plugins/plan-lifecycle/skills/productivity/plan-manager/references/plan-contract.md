# The v2 plan contract (exact)

This file is the single source of truth for the v2 plan record. The three plan
skills, the workspace template, both reviewer wrappers, and each project's
`docs/PLAN.md` defer to it rather than restating the shapes.

## Contents

- [Record backend](#record-backend)
- [Frontmatter](#frontmatter--closed-map-exactly-these-keys-in-this-order)
- [Labels](#labels)
- [Body sections](#body--exactly-these-eight--sections-in-this-order-each-present-once)
- [Steps table](#steps-table--exact-header-and-cell-grammar)
- [Acceptance table](#acceptance-table--exact-header)
- [Review records](#review-records--readable-markdown-no-hashes)
- [Lifecycle transitions](#lifecycle-transitions--closed)
- [Issue writes](#issue-writes)
- [Reading and output](#reading-and-output)
- [Landing](#landing)
- [Enforcement boundary](#enforcement-boundary)
- [What the lifecycle never does](#what-the-lifecycle-never-does)
- [Frozen pre-GitHub history](#frozen-pre-github-history)

## Record backend

The plan record is a GitHub issue: its body carries the `plan_contract: v2` frontmatter and the eight `##` sections, its `plan:<status>` label mirrors the frontmatter `status`, and no plan markdown is tracked in the repository.

The issue number is the plan identity. Commands accept a bare positive number or
the same number prefixed with `#`. The issue title, body, labels, and state are
one record; there is no slug or plan path.

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
deferred work stays `planned` and may be ordered by `docs/PLAN-QUEUE.md`.

## Labels

The label set is created idempotently with `gh label create --force`: `plan`, `plan:drafting`, `plan:planned`, `plan:ongoing`, `plan:blocked`, `plan:finished`, plus the triage label `plan-scheduled`. Exactly one `plan:<status>` label is present at a time, and it mirrors the frontmatter `status`.

Every plan issue also carries `plan`. Topic labels are project-owned and do not
belong in the closed frontmatter map. `plan-scheduled` sits outside the reserved
`plan:` namespace precisely so it is never parsed as a status: no lifecycle
transition applies it, and a status write leaves it in place.

Check 2 additionally enforces the label mirror when issue labels are available.
It reports `check 2: plan label must mirror the frontmatter status` unless
exactly one `plan:<status>` label matches the body status. A
`plan.mjs check --file <path>` run has no labels and skips this predicate.

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
| 1 | add_plan_cli | Add the plan CLI with new/check/status/step/list/next/archive | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs | — | `local` | `planned` | `plan.mjs check <issue>` exits 0 |
```

- `Id` matches `[a-z][a-z0-9_]{0,63}` and is unique within the plan. Every plan
  requires it; there is no grandfather set.
- The union of the `Files` cells is the plan's declared scope, and the review
  diff and any subset scope check read it from there.
- No `Files` cell names the plan's own issue reference. Writing lifecycle state
  into the record is the CLI's job, not an implementation step.
- `Depends` is `—` or a comma-separated list of lower display numbers from the
  same table.
- `Effect` is exactly one of `local`, `probe`, `production_access`, `publish`,
  `push`, `release`, `deploy`.
- `Status` is exactly one of `planned`, `in-flight`, `done`, `blocked`,
  `skipped`. `done` and `skipped` are terminal.
- `Done when` states one observable proof. It carries no "or STOP" clause. When
  a step cannot complete, first run
  `plan.mjs step <issue> <step-id> blocked`, then record the reason with
  `plan.mjs status <issue> blocked --reason <text>`.
- Step citations anywhere in the body are written `step:<id>` and must resolve to
  a declared id. A bare `step 3` is invalid.

Check 12 rejects a Steps `Files` entry equal to `#<issue>`, the bare issue
number, or the issue URL. It reports
`check 12: Steps Files contains the plan issue itself`. With
`plan.mjs check --file <path>` and no bound issue, this predicate passes by
construction.

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

Before dispatch, the manager runs `plan.mjs export <issue>` and passes the printed absolute path; the reviewer reads the export path the manager supplies.

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

An absent plan starts at `drafting`. A finished plan is a closed issue carrying
`plan:finished`.

One exemption, and only one: `plan.mjs retire` sets `finished` from any
non-`finished` status. It is the abandonment exit, it always writes a
`## Retirement` section carrying the reason, closes the issue as not planned,
and is the only way to reach `finished` without a passed code review. Everything
else follows the table.

## Issue writes

A plan-issue write is a read-modify-write, and the GitHub API offers no precondition for it. Every mutating command re-reads the issue body immediately before the edit, refuses when it differs from the body it read, and re-reads after the edit to confirm the pushed bytes.

A conflict is not permission to retry blindly. Re-read the issue, re-apply the
intended change, and run `plan.mjs check <issue>` before continuing.

## Reading and output

Render a plan body verbatim only when the user names that plan and asks to see it. After a write, report the one-line header strip and the changed lines only; a write never re-renders the body.

The header strip is `#<issue> · <status> · <title> · <url>`.

## Landing

Work lands through a pull request whose body carries `Closes #<issue>` and whose base is the repository default branch, because GitHub interprets a closing keyword only in a pull request that targets the default branch. `plan.mjs archive` verifies that merged pull request rather than performing the merge.

Only the pull request that lands the completed work carries `Closes #<issue>`. A partial pull request carries a plain `Refs #<issue>` instead, because GitHub closes the issue as soon as the first pull request carrying a closing keyword merges into the default branch.

One writer owns a plan issue at a time, recorded in the issue's own GitHub assignee field, never the frontmatter `assignee` key, which stays `null`. `plan.mjs new` claims ownership at creation and `plan.mjs claim <issue>` claims an existing plan. Ownership is a precondition, not advice: every mutating command refuses a plan owned by another login, writes nothing when it refuses, and claims an unassigned plan in the same write. Read-only commands never check ownership. Taking a plan from another owner is a deliberate manual GitHub action; no lifecycle command transfers ownership.

Landing sits outside the six phases. The branch, commits, push, pull request,
and merge are the user's to run, on request, under `docks:commit-discipline`.
No Steps row exists for them; `archive` reads the result rather than causing it.

## Enforcement boundary

`plan.mjs check` enforces record-shape and content predicates it can derive from
the body, plus the label mirror and own-issue-reference predicates when the
issue is bound. Mutating CLI commands additionally enforce preconditions visible
to them, such as lifecycle, step-transition, and dependency state. CLI silence
certifies only the checks that command performed; it never grants permission to
perform an external effect.

A step whose `Effect` is not `local` requires an in-session `ask` confirmation immediately before it runs; when `ask` is unavailable the step is set `blocked` with `blocked_reason` naming the unconfirmed effect.
The CLI cannot observe that confirmation, so moving such a step to `in-flight`
does not certify permission. There is deliberately no self-certifying
`--confirmed` flag: an agent asserting its own compliance is the proxy this
contract exists to avoid.

## What the lifecycle never does

No hashes, no permits, no run identity, no lock files, no bundle sealing, no
automatic commits, no automatic push, no external-authority object, and no
`v2`/`vN` plan files. The lifecycle does not weaken the agent-enforced boundary
above.

## Frozen pre-GitHub history

`docs/plans/finished/` is frozen pre-GitHub history. It is read-only historical
material, not a source of truth. No command reads, parses, classifies, lists, or
migrates it. There is no v1 classification on the issue backend: an issue
labeled `plan` whose body does not parse as v2 is `unreadable`.
