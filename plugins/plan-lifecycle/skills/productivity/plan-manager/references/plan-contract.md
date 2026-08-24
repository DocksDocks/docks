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

When a plan is blocked, `## Open questions` starts with exactly
`Blocked: <one-line text>`. Only a blocked plan may open that section with
`Blocked:`.

A body carries no phase. `check <issue>` enforces every rule; `check --file
<path>` enforces only body-readable rules and skips the phase-label rule, both
`Blocked:` rules, and the filled-Research rule rather than assuming a phase.

## Body - exactly these eight `##` sections, in this order, each present once

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
| `## Open questions` | Decisions only the user can make. `None` when there are none. Only a blocked plan starts with `Blocked:`. |
| `## Review` | Exactly `_Review records are stored in issue comments._`; legacy v3 bodies may still contain the retired body-appended records described below. |
| `## Verification Results` | Observed commands and their real output, written during implementation. |

The body contains no absolute machine path. A plan is a cold handoff, and a path
from one machine is not portable. A plan body contains no U+2014 em dash character anywhere.

Every plan delivers a durable solution: fix the root cause and complete the cutover in one pass. Temporary fixes, stopgaps, workarounds, and solutions that schedule future maintenance are prohibited unless the user explicitly requested a temporary fix, and the plan records that request in `## Goal` or `## Open questions`. Reviewers treat an unrequested temporary fix as a finding: `goal_fit` in plan review, `Spec` in code review.

Once an open plan leaves `drafting`, `## Research` must no longer carry the
template placeholder `_Not researched yet._`.

## Steps table - exact header and cell grammar

```text
| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | add_plan_cli | Add the plan CLI with new/check/status/step/list/next/archive | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs | - | `local` | `planned` | `plan.mjs check <issue>` exits 0 |
```

- `Id` matches `[a-z][a-z0-9_]{0,63}` and is unique within the plan. Every plan
  requires it; there is no grandfather set.
- The union of the `Files` cells is the plan's declared scope, and the review
  diff and any subset scope check read it from there.
- No `Files` cell names the plan's own issue reference. Writing lifecycle state
  into GitHub is the CLI's job, not an implementation step.
- `Depends` is `-` or a comma-separated list of lower display numbers from the
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

## Acceptance table - exact header

```text
| ID | Command | Expected |
|---|---|---|
| A1 | `node --test test/` | Exit 0, 0 failing |
```

Ids are unique. Commands run from the repository root and carry no
`cd <absolute path>` prefix.

## Review records - one issue comment per reviewer report

`## Review` is a static pointer, not a review log:

```markdown
_Review records are stored in issue comments._
```

Before every dispatch, the manager runs `plan.mjs export <issue>` and passes the
printed absolute path; the reviewer reads the export path the manager supplies.
For code review, the manager also supplies the fresh round diff described by the
manager skill.

The reviewer returns exactly one markdown block. The manager posts that whole
block as one issue comment without editing it. The two exact shapes are:

```markdown
### Plan review - <YYYY-MM-DD>
Plan-review: pass
- [goal_fit] `## Steps` row 4 - the step deletes the validator but no step adds its replacement - add a step that installs the replacement before the deletion
```

```markdown
### Code review round <n> - <YYYY-MM-DD>
Code-review: fixes-required
- HIGH · Security · plugins/x/y.mjs:41 - user input reaches `execSync` unquoted - pass argv array to `spawnSync`
```

A well-formed record occupies the whole trimmed comment. It has the exact
matching heading with a UTC `YYYY-MM-DD` date, then exactly one allowed verdict
line, then only finding lines valid for that review kind. Extra prose, multiple
records, a missing heading, or an invalid verdict makes the comment ineligible.
`Plan-review:` is exactly `pass`, `repair`, or `blocked`. A plan-review `pass`
has no finding lines; `repair` and `blocked` have at least one line in the shape
`- [goal_fit|research_gap|security_risk] <locator> - <defect> - <fix>`, with
exactly one of the three bracketed kinds.
`Code-review:` is exactly `pass`, `fixes-required`, or `blocked`. Each finding
uses `- <CRITICAL|HIGH|MEDIUM|LOW> · <Bug|Security|Performance|Maintainability|Spec> · <locator> - <defect> - <fix>` on one line. `fixes-required` and `blocked` have at least one finding.

A record is trusted only when the issue has exactly one assignee and the
comment's author login equals that assignee. For each review kind independently,
the latest trusted well-formed comment wins, ordered by `createdAt` with API
order as the tie-break. Foreign-authored, malformed, and superseded comments
never establish current review state. A legacy verdict in the body is consulted
for one review kind only when there is no trusted well-formed comment record of
that kind.

A code-review `pass` means no `CRITICAL` or `HIGH` finding stands unfixed; it
carries only advisory `MEDIUM` and `LOW` lines, or none. After a pass, record
each advisory as follow-up work and do not change reviewed bytes; advisory
findings never trigger another review. `fixes-required` names at least one
evidenced `CRITICAL` or `HIGH` defect.

A plan-review finding is exactly one of `goal_fit`, `research_gap`, or
`security_risk`; nothing else is a finding. A sufficient plan passes.

Both review phases run at most five rounds. Each round uses a fresh plan export;
each code-review round also uses a fresh complete-candidate diff. On rounds 1
through 4, a `repair` or `fixes-required` verdict requires every reproduced or
named finding to be fixed, followed by a fresh export or diff and a fresh
review. A repair that changes no relevant bytes is no progress. A finding
repeated in the next round survived its fix. Either condition stops the loop,
as does `repair` or `fixes-required` in round 5; there is no sixth-round repair.

A plan-review `blocked` verdict routes its user-only decision through
`## Open questions` and `ask`; the verdict alone is not a lifecycle block. A
technical code-review `blocked` verdict stops immediately. After implementation
has started, a technical block or any terminal repair failure requires the
manager to commit and normally push all current work to the verified linked
branch before recording the blocker, setting the plan `blocked`, and stopping.

## Lifecycle state - derived from GitHub

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
after the edit to confirm the pushed bytes. Review-record publication is
instead one append-only issue-comment write of the reviewer's unchanged block;
it never enters the export/edit body cycle.

A conflict is not permission to retry blindly. Re-read the issue, re-apply the
intended change, and run `plan.mjs check <issue>` before continuing.

`export` writes the body to `<git-dir>/docks-review/plan-<n>.md`. It writes the
body digest to `plan-<n>.md.origin` as one lowercase SHA-256 line. The sidecar
uses mode `0600`.

`edit` requires this provenance for every body change. It refuses a missing
sidecar, an unreadable digest, or a digest from a superseded body revision.
After validation, `edit` refreshes the digest before the remote body write.
A local sidecar failure fails closed and requires one re-export.
A phase-only status change leaves the body and sidecar valid.

For every body edit, export the record. Edit the export. Run
`plan.mjs check <issue>`. Delete the export and its `.origin` sidecar.
Never carry an edit across an intervening body write.

## Reading and output

Render a plan body verbatim only when the user names that plan and asks to see
it. After a write, report the one-line header strip and the changed lines only;
a write never re-renders the body.

The header strip is `#<issue> · <status> · <title> · <url>`. `show` prints
`reviews: plan=<pass|repair|blocked|none> code=<pass|fixes-required|blocked|none>`
on the next line. With `show --body`, the record alone goes to stdout and both
metadata lines go to stderr, header first.

## Landing

One writer owns a plan issue at a time, recorded in the issue's GitHub assignee
field. `plan.mjs new` claims ownership at creation and `plan.mjs claim <issue>`
claims an existing plan. Ownership is a precondition, not advice: every mutating
command refuses a plan owned by another login, writes nothing when it refuses,
and claims an unassigned plan in the same write. Read-only commands never check
ownership.

Routine linked-branch creation, commits, and normal pushes are authorized when
the settled `plan-and-implement` run enters phase 5. They are not Steps rows and
need no separate effect confirmation. A `plan-only` run stops before phase 5 and
never creates a branch.

Immediately after setting the plan `ongoing`, resolve the target repository's
`nameWithOwner` and `defaultBranchRef.name`.

Before any branch checkout, and specifically before any `gh issue develop
--checkout`, require `git status --porcelain` to be empty. If it is dirty, never
stash, move, or commit the ambient work. Set the plan `blocked` and name the
dirty paths, or continue only in an authorized clean worktree.

Pass `--repo <nameWithOwner>` to every `gh issue develop` call. First run
`gh issue develop <issue> --repo <nameWithOwner> --list`. If it reports a
linked branch, verify that branch belongs to the resolved repository, fetch it,
and check it out. Otherwise run `gh issue develop <issue> --repo
<nameWithOwner> --base <default-branch> --checkout`. After either path, verify
that the checked-out branch is the issue's linked branch.

After any list, create, fetch, or checkout failure, re-run the repository-scoped
`--list`. If it reports a linked branch, verify that branch belongs to the
resolved repository, fetch it, and check it out. If recovery cannot verify and
check out a linked branch, record the blocker, set the plan `blocked`, and stop.
There is no local or unlinked fallback, and implementation never starts on an
unverified branch.

After `Code-review: pass`, commit and push any remaining reviewed bytes, then
create or update one pull request carrying `Closes #<issue>` and targeting the
repository default branch. This landing work needs no additional prompt.

Never treat an empty first checks result as success. Retry
`gh pr checks --json name,bucket` at most 12 times with a 10-second delay until
checks appear. If required checks exist, run
`gh pr checks --watch --required`; if CI checks exist but none are required,
run `gh pr checks --watch` to wait for all reported CI. Any failed check blocks
merge. If no checks appear, continue only when repository inspection confirms
that no pull-request CI is configured; otherwise leave the pull request open
with a named no-checks blocker and do not show the merge prompt.

When the checks policy passes and GitHub reports the pull request mergeable,
ask immediately with exactly two options: `Merge now` or
`Leave pull request open`. Merge only on that fresh answer. If the user
declines, or `ask` is unavailable, leave the pull request and the issue open
and report the pull request URL. Never auto-merge, force-push, bypass branch
protection, or merge on a stale or assumed answer.

Immediately before merge, re-read `headRefOid` and `gh pr diff`. If the head SHA
or diff changed, block merge. Invoke `gh pr merge` with
`--match-head-commit <reviewed-head-sha>` and the repository's configured merge
strategy only after the fresh `Merge now` answer.

Only the pull request that lands the completed work carries `Closes #<issue>`.
A partial pull request carries plain `Refs #<issue>`. `archive` verifies the
merged result rather than causing it.

## Archive verification

`archive` is a verifier, not a status writer. It requires the issue already
closed with `stateReason: COMPLETED`, every Steps row terminal (`done` or
`skipped`), and the latest trusted well-formed code-review comment to carry
`Code-review: pass`. It accepts an exact legacy body line
`Code-review: pass` only when no trusted well-formed code-review comment exists.
A pass may carry advisory `MEDIUM` and `LOW` finding lines; an unfixed
`CRITICAL` or `HIGH` keeps a plan from archiving.

`archive` also requires a merged closing pull request into the target
repository's default branch. It reads `closedByPullRequestsReferences` with
`excludeUserLinked: true`. Therefore, a manually linked pull request never
proves a landing.

Any one proof suffices. `archive` first seeks an eligible keyword closer. Only
when that connection holds none does it examine the latest closure. GitHub may
classify a same-repository keyword closer as user-linked and exclude it, so the
`ClosedEvent` closer covers that case. A pull-request closer is itself verified
as a candidate closing pull request. A commit closer supplies its
`associatedPullRequests`. Any other latest closer supplies no fallback proof.
An ineligible keyword reference, such as one still open, never hides a valid
closure proof.
An issue closed by a commit, reopened, then closed by hand has no closure proof.

Every accepted pull request has `state: MERGED`.
Its `baseRefName` matches that repository's `defaultBranchRef.name`.
A commit pushed straight to the default branch has no associated merged pull
request and is refused.

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

A step with a non-`local` `Effect` requires in-session `ask` confirmation
immediately before execution. When `ask` is unavailable, set the step and plan
to `blocked`. Give `status` a single-line reason. The CLI opens
`## Open questions` with `Blocked: <reason>`. Only a blocked plan may open that
section with `Blocked:`.

The CLI cannot observe that confirmation, so moving such a step to `in-flight`
does not certify permission. There is deliberately no self-certifying
`--confirmed` flag.

## What the lifecycle never does

The record carries no hash, no permit, no run identity, no lock file, no sealed
review bundle, no external-authority object, and no tracked plan file. The
lifecycle never auto-merges, force-pushes, or bypasses branch protection. It
does not weaken the agent-enforced boundary above.

One digest exists, and it grants nothing. `export` writes the sha256 of the body
it copied beside the copy, and `edit` refuses a file derived from a superseded
body. The digest detects a stale copy. It never authorizes, seals, or ratifies a
record, and no reader consults it.

## Frozen pre-GitHub history

`docs/plans/finished/` is frozen pre-GitHub history. Humans may read it as
history, but it is not a source of truth for this lifecycle. No lifecycle
command or workspace migration operation opens, inventories, parses,
classifies, lists, or migrates it.
