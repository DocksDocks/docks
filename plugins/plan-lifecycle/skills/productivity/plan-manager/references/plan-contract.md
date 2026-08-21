# The v3 plan contract (exact)

This file is the single source of truth for the v3 plan record. The three plan
skills, the workspace template, both reviewer wrappers, and each project's
`docs/PLAN.md` defer to it rather than restating the shapes.

## Contents

- [Record backend](#record-backend)
- [Body marker and GitHub-owned fields](#body-marker-and-github-owned-fields)
- [Labels](#labels)
- [Body sections](#body--exactly-these-eight--sections-in-this-order-each-present-once)
- [Steps table](#steps-table--exact-header-and-cell-grammar)
- [Acceptance table](#acceptance-table--exact-header)
- [Review records](#review-records--readable-markdown-no-hashes)
- [Lifecycle state](#lifecycle-state--derived-from-github)
- [Contract classification](#contract-classification)
- [Issue writes](#issue-writes)
- [Reading and output](#reading-and-output)
- [Landing](#landing)
- [Archive verification](#archive-verification)
- [Enforcement boundary](#enforcement-boundary)
- [What the lifecycle never does](#what-the-lifecycle-never-does)
- [Frozen pre-GitHub history](#frozen-pre-github-history)

## Record backend

The plan record is a GitHub issue. Its body opens with the v3 marker and carries
the eight `##` sections. GitHub owns the title, open-work phase, owner,
timestamps, and completion state. No plan markdown is tracked in the repository.

The issue number is the plan identity. Commands accept a bare positive number or
the same number prefixed with `#`. The issue title, body, labels, assignee,
timestamps, state, and state reason are one record; there is no slug or plan
path.

## Body marker and GitHub-owned fields

The body starts with exactly:

```markdown
<!-- plan-contract: v3 -->

## Goal
```

The marker is the first line and a blank line follows it. A v3 body has no YAML
frontmatter and no `---` fence anywhere.

| Machine field | Canonical GitHub field |
|---|---|
| Title | issue `title` |
| Open-work phase | the single `plan:<phase>` label |
| Owner | issue `assignees` |
| Created timestamp | issue `createdAt` |
| Updated timestamp | issue `updatedAt` |
| Completion | issue `state` plus `stateReason` |

The retired body keys are `plan_contract`, `title`, `goal`, `status`, `created`,
`updated`, `assignee`, and `blocked_reason`. They are not allowed in a v3
record. The format identity is the marker, not a frontmatter key or label.

`## Goal` still carries exactly one line `Mode: plan-and-implement` or
`Mode: plan-only`, because mode is not a GitHub field.

## Labels

The label set is created idempotently with `gh label create --force`: `plan`,
`plan:drafting`, `plan:planned`, `plan:ongoing`, and `plan:blocked`. These are
the complete reserved set; no completion or scheduling label exists.

Every open plan issue carries `plan` and exactly one phase label:
`plan:drafting`, `plan:planned`, `plan:ongoing`, or `plan:blocked`. Topic labels
are project-owned. Phase labels describe open work only. Every read of a closed
issue treats all phase labels as absent, even if a closing merge left one behind.

When a plan is blocked, the first line of `## Open questions` is exactly
`Blocked: <one-line text>`. No other phase may carry a `Blocked:` line there.

## Body — exactly these eight `##` sections, in this order, each present once

Every v3 plan opens with `<!-- plan-contract: v3 -->`, then a blank line, then
exactly these eight `##` sections, in this order, each present once: `## Goal`,
`## Research`, `## Steps`, `## Acceptance`, `## Do not touch`,
`## Open questions`, `## Review`, `## Verification Results`.

| Section | Contents |
|---|---|
| `## Goal` | The observable outcome, why it is needed now, and exactly one line `Mode: plan-and-implement` or `Mode: plan-only` recording the phase-1 decision. |
| `## Research` | What was verified and how: repository paths and symbols read, official-doc or web sources with URLs, the hypothesis stated and confirmed or refuted, and one line naming the durable fix chosen over the available temporary one. |
| `## Steps` | The Steps table below. |
| `## Acceptance` | The Acceptance table below. |
| `## Do not touch` | Paths and behaviors the change must leave alone. `None` when nothing applies. |
| `## Open questions` | Decisions only the user can make. `None` when there are none; a blocked plan starts with its `Blocked:` line. |
| `## Review` | Plan-review and code-review records, appended by the manager. |
| `## Verification Results` | Observed commands and their real output, written during implementation. |

The body contains no absolute machine path. A plan is a cold handoff, and a path
from one machine is not portable.

Once an open plan leaves `drafting`, `## Research` must no longer carry the
template placeholder `_Not researched yet._`.

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
  into GitHub is the CLI's job, not an implementation step.
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
- Step citations anywhere in the body are written `step:<id>` and must resolve
  to a declared id. A bare `step 3` is invalid.

Every Steps row must be terminal before the pull request carrying
`Closes #<issue>` merges. Once that merge closes the issue, step mutation is no
longer available. Post-merge work belongs to a named follow-up plan.

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

Before dispatch, the manager runs `plan.mjs export <issue>` and passes the
printed absolute path; the reviewer reads the export path the manager supplies.

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

A plan-review finding is exactly one of `goal_fit`, `research_gap`, or
`security_risk`; nothing else is a finding. A sufficient plan passes.

## Lifecycle state — derived from GitHub

The open-work phase enum is exactly `drafting`, `planned`, `ongoing`, and
`blocked`. Open phase transitions are:

```text
drafting -> planned | ongoing | blocked
planned  -> drafting | ongoing | blocked
ongoing  -> blocked
blocked  -> drafting | planned | ongoing
```

The `planned -> drafting` transition returns a plan to drafting after
substantive review repair. Completion is not a phase transition and never writes
a completion label or body field.

Status is derived with this closed truth table:

| GitHub state | State reason / phase label | Derived status |
|---|---|---|
| `OPEN` | exactly one phase label | that phase |
| `OPEN` | no phase label | `unlabelled` |
| `CLOSED` | `COMPLETED` | `finished` |
| `CLOSED` | `NOT_PLANNED` | `retired` |
| `CLOSED` | `DUPLICATE` | `duplicate` |

Phase labels on closed issues are ignored. Reopening returns the issue to
`OPEN`, where the phase-label rows apply again. `status` refuses a closed issue
with an error containing `is closed; status applies to open plans`.

## Contract classification

Classification follows the body bytes without guessing:

| Evidence | Classification |
|---|---|
| First line is exactly `<!-- plan-contract: v3 -->`, followed by one blank line | `record` |
| Anything else | `unreadable`; no parser is attempted |

## Issue writes

A plan-issue write is a read-modify-write, and the GitHub API offers no
precondition for it. Every mutating command re-reads the issue body immediately
before the edit, refuses when it differs from the body it read, and re-reads
after the edit to confirm the pushed bytes.

A conflict is not permission to retry blindly. Re-read the issue, re-apply the
intended change, and run `plan.mjs check <issue>` before continuing.

## Reading and output

Render a plan body verbatim only when the user names that plan and asks to see
it. After a write, report the one-line header strip and the changed lines only;
a write never re-renders the body.

The header strip is `#<issue> · <status> · <title> · <url>`.

## Landing

Work lands through a pull request whose body carries `Closes #<issue>` and whose
base is the target repository's default branch. `plan.mjs archive` verifies that
merged pull request rather than performing the merge or closing the issue.

Only the pull request that lands the completed work carries `Closes #<issue>`.
A partial pull request carries a plain `Refs #<issue>` instead. Landing sits
outside the six phases: branch, commits, push, pull request, and merge are the
user's to run, on request, under `docks:commit-discipline`.

One writer owns a plan issue at a time, recorded in the issue's GitHub assignee
field. `plan.mjs new` claims ownership at creation and `plan.mjs claim <issue>`
claims an existing plan. Ownership is a precondition, not advice: every mutating
command refuses a plan owned by another login, writes nothing when it refuses,
and claims an unassigned plan in the same write. Read-only commands never check
ownership.

## Archive verification

`archive` is a verifier, not a status writer. It requires the issue already
closed with `stateReason: COMPLETED`, every Steps row terminal (`done` or
`skipped`), and a line exactly `Code-review: pass` in `## Review`.

It also requires a merged closing pull request into the target repository's
default branch. It first reads the issue's
`closedByPullRequestsReferences` without `userLinkedOnly`. When that is empty,
it resolves the closing commit's `associatedPullRequests` and accepts only a
pull request whose `state` is `MERGED` and whose `baseRefName` equals that
repository's `defaultBranchRef.name`. A commit pushed straight to the default
branch has no associated merged pull request and is refused.

On success, `archive` removes any `plan:<phase>` label left by the closing merge
and prints `plan #<n> finished (closed by <url>)`. It writes no status and does
not close or merge anything. `retire` closes with `NOT_PLANNED` and likewise
removes every phase label.

## Enforcement boundary

`plan.mjs check` enforces record-shape and content predicates it can derive from
the body, plus issue-bound predicates when the issue is available. Mutating CLI
commands additionally enforce preconditions visible to them, such as open-work
phase, step-transition, dependency state, and ownership. CLI silence certifies
only the checks that command performed; it never grants permission to perform
an external effect.

A step whose `Effect` is not `local` requires an in-session `ask` confirmation
immediately before it runs. When `ask` is unavailable, set the step `blocked`
and set the plan phase with a single-line reason; the CLI writes that reason as
the first `## Open questions` line, `Blocked: <reason>`.
The CLI cannot observe that confirmation, so moving such a step to `in-flight`
does not certify permission. There is deliberately no self-certifying
`--confirmed` flag.

## What the lifecycle never does

The record carries no hash, no permit, no run identity, no lock file, no sealed
review bundle, no automatic commit, no automatic push, no external-authority
object, and no tracked plan file. The lifecycle does not weaken the
agent-enforced boundary above.

One digest exists, and it grants nothing. `export` writes the sha256 of the body
it copied beside the copy, and `edit` refuses a file derived from a superseded
body. The digest detects a stale copy. It never authorizes, seals, or ratifies a
record, and no reader consults it.

## Frozen pre-GitHub history

`docs/plans/finished/` is frozen pre-GitHub history. It is read-only historical
material, not a source of truth. No command reads, parses, classifies, lists, or
migrates it.
