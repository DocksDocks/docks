# Plan contract v5
This is the canonical contract inside the installed `plan-lifecycle` plugin.
Agents use its lifecycle skills and this reference. The helper normalizes
records and protects ownership, concurrent edits, step state, and archive proof.
Resolve `skills/productivity/plan-manager/scripts/plan.mjs` within that installed plugin.
## Contents

- [Record and mode](#record-and-mode)
- [Steps, acceptance, and effects](#steps-acceptance-and-effects)
- [Status, ownership, and frozen state](#status-ownership-and-frozen-state)
- [Phases and review comments](#phases-and-review-comments)
- [Helper commands and output](#helper-commands-and-output)
- [Normalization, advice, and refusals](#normalization-advice-and-refusals)
- [Landing and archive proof](#landing-and-archive-proof)
- [Yolo runs](#yolo-runs)

## Record and mode

A plan is a GitHub issue that records a goal, research, ordered work, and evidence.
The issue number identifies it. GitHub owns title, assignees, labels, timestamps,
and completion. Reviews live in comments. Do not track plan bodies in repository
files. Frozen `docs/plans/finished/` history is not lifecycle input. Do not open
or inventory it.

Choose the path before any other work:

| Path | Use it when |
|---|---|
| Direct implementation | One clear, reversible, low-risk local change has one bounded acceptance path. It creates no plan issue, reviewer, or automatic commit, and it needs no Mode. |
| Plan | The work needs explicit planning, multiple commits, cross-repository work, scheduling, cold handoff, unresolved decisions, public-contract or cross-subsystem changes, security-sensitive or destructive work, or a non-local effect. |

Work that needs more than one landing pull request uses one parent plan and one
child plan per pull request. `new --parent <n>` creates each child as a GitHub
sub-issue of parent `<n>`; a parent holds at most 100 children
(<https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues>).
The parent holds the Goal, the shared Research and decisions, the Acceptance for
the whole goal, and one Steps row per child, with Files `-`, Effect `local`, and
Done when `child #<c> finished`. A plan has the parent row shape when every
Steps row has Files `-` and a Done when cell of exactly `child #<c> finished`.
It is a parent only when it also has children, every `<c>` is one of its
sub-issues, and each child is named once. Any other plan with children archives
with `--pr`. The parent gets plan
review, but no linked branch and no code review. Each child is a full plan with
its own review, linked branch, and `Closes #<c>` landing pull request. Start the first child only after
the parent's plan pass, and move the parent to ongoing then. Set each parent row
in-flight when its child starts, done when the child is finished, and
`skipped`, with the reason in the record, when the child is retired or a
duplicate. Then archive the parent (Archive).

Settle Mode with the user before implementation. A yolo invocation settles the
path and the Mode; see Yolo runs. `plan-and-implement` authorizes the full
lifecycle. `plan-only` stops after plan review. A defaulted Mode never
authorizes implementation. The settled Mode also covers routine issue
publication and landing work, which stay outside the Steps table.

Durable solution: solve the root cause, move every caller to the new path, and
remove obsolete paths. Use a temporary workaround only with user approval.
The body starts with `<!-- plan-contract: v5 -->`, then a blank line. It has no
frontmatter. Write these seven second-level sections in this order:

| Section | Agent content |
|---|---|
| Goal | Outcome, scope, and `Mode: plan-and-implement` or `Mode: plan-only` |
| Research | Repository facts, official sources, and decisions that support the work |
| Steps | Ordered work with dependencies, effects, state, and completion evidence |
| Acceptance | Commands and expected observable results for the whole goal |
| Do not touch | Explicit exclusions |
| Open questions | Unresolved decisions; put `Blocked: <reason>` first when blocked |
| Verification Results | Commands run, results, and relevant limitations |

Research also records tool facts. For each external program that a Step or an
Acceptance command runs, record its version and the source of that version:
its `--version` output with the date, or a repository pin, such as a lockfile,
`.tool-versions`, `mise.toml`, a CI workflow, or a Dockerfile. Reviewers do not
run commands, so this record lets them check a flag or a behavior against the
documentation of that version.

The helper reads v3, v4, and v5 records. It ignores the old Review section and drops
it on write. It inserts missing sections empty. Section headings and table
headers match without case sensitivity after trimming. The helper writes the
canonical spelling. Do not spend review effort on spelling that it normalizes.

## Steps, acceptance, and effects

Use these table headers:

```markdown
| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---|---|---|---|---|---|---|---|
| ID | Command | Expected |
|---|---|---|
```

Each Steps row describes one bounded task. `#` is its display number. `Id` is
its durable command identifier. `Files` defines scope as comma-separated
repository-relative paths; a path can be in backticks. `Depends` is `-` or
comma-separated display numbers or ids. The helper resolves ids to display
numbers on write. Two steps that list the same path need a Depends chain
between them, or one of them must own the shared edit. `Done when` names
observable completion, not activity. Acceptance rows identify a command and its
expected result. They cover the goal, not just individual steps. Acceptance also
holds one row for each check that the repository instructions require for the
paths in Files. Use repository-relative paths and portable commands.

When a step's Files cell changes the code or configuration of a surface that a
user or another program drives, such as a CLI command, a hook, a service, or a
UI, at least one Acceptance row runs that surface end to end. The row drives
the surface the way its user does and names the observable result. A test file
that starts the real surface and checks its output counts. A unit-test command
that only calls internal functions does not. A change to prose, a skill text, or
a reviewer prompt alone has no driven surface.

| Token | Meaning |
|---|---|
| `planned` | Work has not started |
| `in-flight` | Work is in progress |
| `done` | Completion evidence exists |
| `blocked` | A decision or prerequisite prevents work |
| `skipped` | The step will not run; explain why in the record |
| `local` | Local work with no external effect |
| `probe` | External observation or request |
| `production_access` | Access to production systems or data |
| `publish` | Publish an artifact or public content |
| `push` | Push repository changes |
| `release` | Create a release |
| `deploy` | Deploy a system |

Every non-local step requires an in-session `ask` immediately before it runs.
A yolo run uses the effect table in Yolo runs instead.
Persisted Effect values record intent, not permission. If `ask` is unavailable,
block the step and plan with a reason. Unknown tokens produce advice; they do
not authorize an effect. Finish dependencies before starting dependent work.

A non-production target is one that repository configuration or documentation
names local, development, dev, test, homolog, homologation, staging, or
preview. Every other target is production.

## Status, ownership, and frozen state

`new` creates missing `plan`, `plan:drafting`, `plan:planned`, `plan:ongoing`, and
`plan:blocked` with `gh label create` (without `--force`). Each plan carries
`plan`. Open status comes from phase labels; closed status ignores them.

| GitHub state | Derived status |
|---|---|
| Open, one phase label | `drafting`, `planned`, `ongoing`, or `blocked` |
| Open, no phase label | `unlabelled` |
| Open, multiple phase labels | `unreadable` |
| Closed, `COMPLETED` | `finished` |
| Closed, `NOT_PLANNED` | `retired` |
| Closed, `DUPLICATE` | `duplicate` |

Work has started when status is neither drafting nor planned, or label history
shows that `plan:ongoing` was ever applied. Before work starts, any open status
may move to any open status. After it starts, only ongoing and blocked are legal
targets. Status writes repair phase labels. Blocked requires a single-line
reason at the start of Open questions. Leaving blocked removes that line.

`planned` and `ongoing` require a filled Research section. The trimmed section
must not be empty and must not equal `_Not researched yet._`.

An open plan must be ongoing for `step`. Its done and skipped steps are immutable.
Other open step transitions are free. A finished plan permits only done or skipped
targets for terminal repair. To move a step of a finished plan to another status, reopen the issue first. Other closed plans do not permit step transitions.

After work starts, `edit` freezes each existing step's Id, display number,
Depends, Effect, Status, and presence. Task, Files, and Done when remain editable.
New rows must be planned and follow all existing rows. A closed plan cannot gain
rows. Use `step`, not `edit`, to change step state.

Scope also freezes when work starts. Put new work into a new child plan
(`new --parent <n>`), not into the started plan. On a started v5 plan, each
`edit` that adds a Steps row, adds a path to the Files cell of a row, or changes
the Task or Done when cell of a row prints
`advice: check for new scope; move new work into a child plan (new --parent <n>)`.
The helper cannot tell new scope from a repair, so it does not block. A fix
under Repairs, or a step for a new decision (Repairs item 4), is a repair: make
it, and say in its Repaired line why it is a repair. On the advice
`split into child plans: <reason>` (Normalization, advice, and refusals), move
the work that has not started into child plans, and set each moved step
`skipped`, with its child number in the record. A started plan that adds
children keeps its own landing pull request, and archives with `--pr`.

Mutations refuse foreign assignees. An unassigned plan is claimed by the acting
login inside the same write. Each write that claims a plan refuses with
`plan #<n> is owned by <login>`, and adds no assignee, when its read before the
write shows another assignee. Read the issue again before each write. The helper
compares remote state before writing and checks the body after an edit.

## Phases and review comments

The six phases are decide, draft, research, plan review, implement, and code review.
`plan-workspace` maintains workspace routing. Main-context `plan-manager` owns the
lifecycle. The explicit-only `yolo` skill runs the same lifecycle under Yolo
runs. Internal `plan-reviewer` reviews goal fit, research gaps, and security
risk. The two read-only wrappers are `plan-reviewer` and `code-reviewer`.

Run this review loop for plan review and for code review:

1. Give each round fresh input: a fresh export, the issue number, and the round
   number. Code review also gets the fresh diffs that Code-review rounds names.
2. Post the blocks that the round returned unchanged in one issue comment. Put
   the lens blocks of a panel round in the lens order of Code-review rounds.
   From round 2, put the manager response to the previous round after the
   blocks. Never store a review in the body.
3. Run `show <n>` and read the verdict. Stop on pass.
4. Otherwise reproduce each finding. Fix confirmed defects as Repairs says, and
   reject the others with evidence. Write the manager response to round k.
   Then start the next round.
5. When a finding returns after a repair, do not repeat its approach. Research
   the defect class again, pick a different approach, and record it under
   `Redesigned`. Outside a yolo run, ask the user to continue or block only for
   a fix that needs a tradeoff the user owns (accepting a known limit, changing
   the Goal or the scope, or a non-local effect), or on a stall: the same
   finding returns after two different approaches, round 10 ends without a
   pass, or dispatch fails twice without a relevant change. If no answer is
   available, record the reason and block. A yolo run uses only the redesign
   rule. It settles a tradeoff by its delegation line and the effect table of
   Yolo runs, and asks only the Round ceiling question.

Each round adds one issue comment. The manager response to round k starts with
the heading line `#### Manager response to round <k>`, exactly so, and holds
these lists:

- `Repaired`: one line per fixed finding. Name the finding by its round and
  locator, then the commit or plan line that fixes it. Under the line, list each
  class instance that the repair fixed (Repairs).
- `Rejected`: one line per rejected finding. Name the finding by its round and
  locator, then the evidence that rejects it.
- `Redesigned`: one entry per finding that returned after a repair (item 5):
  the new approach, the approaches that you rejected with their reasons, and
  the evidence. The finding also gets its `Repaired` line.

Write no bracketed severity in the response. When a run stops between rounds,
at a block or before the question of item 5 or of the Round ceiling, first post
the pending response as its own comment. A v4 plan can keep the separate
repair and rejection comments of contract v4.

Reviewers never fetch the issue. Save the review blocks of each round comment,
without the manager response, as `<phase>-<n>-round-<k>.md` in the review
scratch directory, where `<phase>` is `plan-review` or `code-review`. From the
manager response to round k, write its `Rejected` list as the rejection file
`<phase>-<n>-round-<k>-rejected.md`, with the first line
`Rejected review findings, round <k>`, and its `Repaired` and `Redesigned` lists as the repair
record file `<phase>-<n>-round-<k>-repairs.md`, with the first line
`Repaired review findings, round <k>`. Skip a file whose list is empty. A delta
reviewer reads these files.

A plan re-review after a repair may use the plan `delta` mode when the
`plan-reviewer` skill offers it in its `references/delta.md`. Give that round
the inputs that the file names. Otherwise each plan round reviews the whole
export. Every review round, plan or code and full or delta, runs at the
configured effort. In the plugin's benchmark, a plan or code delta round one
effort level lower did not stay within the escaped-defect bound on 20 delta
cases: the upper ends of its 90% intervals were 6.06 (plan) and 7.14 (code)
more escaped known defects per 50 known, against a bound of 2.

A plan pass covers the body that the reviewer read. After `plan=pass`, collect
the edits that change Goal, Research, Steps, Acceptance, or Do not touch.
Review them together in one plan-review round, in the `delta` mode when the
plan reviewer offers it, with a plan diff from the export that the pass
reviewed. Run that round before the first code that depends on an edit, or
before the next code-review round when that comes first. In recorded plans,
one round for each edit after a pass was a main cause of extra rounds, and
most of those rounds found nothing. These edits need no round:

- An edit that only sets the Mode line or adds the delegation line (Yolo runs)
  that a yolo invocation decides.
- An edit to Verification Results or Open questions, and a `step` state change.

Record user-only decisions in Open questions. Do not invent approval.

The helper finds review records in comments with these rules. The reviewer
agents define the exact block they return, and that block follows these rules.

- The first non-blank line names the kind: `plan review` or `code review`, in
  any case, after optional `#` heading markers. Any suffix, such as `round 2`
  or `round 2, lens correctness`, is allowed. An archive record (Archive) is
  not a review record.
- A comment holds one or more review blocks. A block starts at the first line,
  or at a later Markdown heading line (one or more `#`, indented by at most
  three spaces) that names the comment's kind. A quoted or list-item heading
  is prose and starts no block. A panel round comment holds one block per lens.
- A verdict line holds `plan-review:` or `code-review:`, then a verdict word.
  A space can replace the hyphen.
- On each line, the helper ignores Markdown emphasis (`*`, `_`), code marks,
  blockquote markers, and list markers when it reads a kind or a verdict.
- The helper reads blocks, verdicts, and severities only above the line
  `#### Manager response to round <k>`, in every contract version. So a finding
  that the response quotes cannot change the verdict.

| Verdict input | Plan result | Code result |
|---|---|---|
| `pass`, `ok`, `approved` | `pass` | `pass` |
| `repair`, `changes`, `fixes-required` | `repair` | `fixes-required` |
| `blocked` | `blocked` | `blocked` |

The verdict of a block is its first verdict line of the comment's kind. A later
verdict line in the same block is prose, such as a quoted verdict of an earlier
round. A verdict line of the other kind does not count. A later block without a
verdict line is part of the block before it. The first block needs a verdict
line; without one, the comment is not a review record. A block verdict line
with a word outside the table makes the comment unreadable as a review, so it
is not a review record. The most severe block verdict wins: `blocked`, then
`repair` or `fixes-required`, then `pass`.

A code pass derives as fixes-required when any line contains `[critical]` or
`[high]`, or starts with `critical:`, `high:`, `severity: critical`, or
`severity: high`, in any case. A bare severity word inside finding prose does
not count. Trust requires exactly one issue assignee and a comment author login
equal to that assignee. The latest trusted eligible comment per kind wins,
ordered by `createdAt`; API order breaks ties. Missing trusted reviews derive as
none. There is no body verdict fallback.

### Repairs

Complete each repair before you commit a code repair or publish a plan repair.
In recorded plans, a missed instance of a fixed class, a finding with neither a
repair nor a rejection, and a decision without a step each caused extra rounds.

1. For each finding that names a defect class (`class:`), search for every
   instance of that class: in the candidate for a code finding, and in the plan
   export and each source that the finding cites for a plan finding. Repair all
   instances together, in one commit for code.
2. Record the repairs of round k in the `Repaired` list of the manager response
   to round k (Phases and review comments): each finding that you fixed, with
   the plan line or the commit that fixes it, and under it each class instance
   that you repaired. The delta reviewer of the next round checks the repair
   record file that you write from that list.
3. Before round k+1, account for every finding of round k: fixed in the
   `Repaired` list, or rejected in the `Rejected` list. Repair or reject each
   finding that has neither.
4. When an edit adds a decision, add the step that carries it out, or extend
   the Task and Done when of a step that is not done yet. The helper keeps a
   done step done, so a decision that changes done work gets a new step.

The `plan-manager` skill (phase 6) adds the test rules of a code repair.

### Code-review rounds

Before each code-review round, commit the candidate on the linked branch. That
commit is the round's reviewed head. Name one mode in each dispatch:

| Mode | Reviewers | Input |
|---|---|---|
| `full` | One `code-reviewer` that covers every lens | The full diff, the base-instructions folder, the plan export, the issue number, and the round number |
| `panel` | Three `code-reviewer` dispatches in one message, one per lens: `correctness`, `spec-and-tests`, `text-and-safety` | The full diff, a focus diff for the lens, the base-instructions folder, the plan export, the issue number, and the round number |
| `delta` | One `code-reviewer` | The delta diff, the previous round's comment file, the rejection comment file and the repair record file of that round if they exist, the base-instructions folder, the plan export, the issue number, and the round number |

The full diff holds the candidate since the merge base with the default branch.
A focus diff holds the changed paths in the scope of its lens:

| Changed path | Focus diff |
|---|---|
| Test path: under a `test`, `tests`, `spec`, `__tests__`, or `fixtures` folder, or with `.test.` or `.spec.` in its name | `spec-and-tests` |
| Prose path: `.md`, `.txt`, or `.rst` | `text-and-safety` |
| Configuration path: `.json`, `.yml`, `.yaml`, or `.toml` | `correctness` and `spec-and-tests` |
| Every other path | `correctness` |

A path that matches more than one row goes into each of their focus diffs. When
no changed path falls in the scope of a lens, that lens gets the full diff as
its focus diff. The delta diff runs from the previous round's reviewed head to
the current reviewed head. The base-instructions folder holds the merge-base
copy of each `AGENTS.md`, `CLAUDE.md`, and `REVIEW.md` at the root and in each
parent folder of a changed path of the full diff, and a `MANIFEST` of the
checked paths. The `plan-manager` skill (phase 6) builds it. The
`code-reviewer` skill defines what each lens and the delta round check.

Round 1 is a `panel` round when the full diff changes 50 or more lines. Below
that, round 1 is a `full` round. A runtime that cannot run subagents at the
same time uses `full`. In the plugin's benchmark, a panel found more defects
than one reviewer in about the same round time, for about twice the tokens.
When the user asks to save tokens, round 1 is a `full` round. Count the size of
a diff as added plus removed lines, for example the sums of `git diff --numstat`.

Start every panel dispatch with the same shared text: the paths, the issue
number, the round number, and the plan export. Put the lens line last, so the
runtime can reuse the prompt prefix.

A later round k is a `delta` round only when all of these hold:

- Round k-1 completed: every reviewer of that round returned a block with a
  verdict line for the round's reviewed head, and no block returned `blocked`.
- Every change since that head repairs a finding of round k-1 or of the yolo
  self-review.
- The delta diff is at most half the size of the full diff.

Otherwise round k is a `panel` or a `full` round by the size rule of round 1. A
merge of the default branch into the linked branch always gets a `panel` or a
`full` round.

When a reviewer fails or returns no block with a verdict line, dispatch it
again before you post the round.

When a code reviewer returns `blocked` because it left hunks of the diff of its
mode unread (the `code-reviewer` skill, Round modes), dispatch it again before
you post the round, with the same inputs and the unread paths that its block
names. Count each such block as a failed dispatch. A second such block from
that reviewer on the same reviewed head is the second failed dispatch without a
relevant change: follow step 5 of the review loop, or in a yolo run the stall
rule of the Round ceiling. A `blocked` verdict for another input keeps the
route of plan-manager phase 6: resolve that input before you request a verdict.

Dispatch every lens and every delta round as the `code-reviewer` agent. A
per-agent model setting, such as omp `task.agentModelOverrides.code-reviewer`
or the `model` key of a Codex agent file, then applies to each of them.

## Helper commands and output

Run `node <installed-helper> <command>`. `<n>` is an issue number, optionally
prefixed with `#`. The header strip is `#<n> · <status> · <title> · <url>`.

| Command | Result on stdout |
|---|---|
| `new --title <t> --goal <g> [--mode <m>] [--label <name>]... [--parent <n>]` | `plan created: #<n> <url>`; assigns @me and labels plan plus drafting; with `--parent`, adds the plan as a sub-issue of `<n>`, an open plan that you own |
| `show <n> [--body]` | Header strip, then `reviews: plan=<verdict> code=<verdict>`, then one `child #<c> · <status> · <title>` line per child, then advice |
| `export <n>` | Absolute path to `plan-<n>.md` in the scratch directory |
| `edit <n> --file <path>` | Header strip, `changed: <k> line(s)`, `-old` and `+new` lines, then advice |
| `status <n> <status> [--reason <text>]` | `plan #<n> status: <old> -> <new>` |
| `step <n> <id> <status>` | `plan #<n> step <id>: <old> -> <new>` |
| `list [--status <s>]` | `<status>\t#<n>\t<title>`; open first, then closed, each in ascending number order; prints advice when it reaches 500 plans |
| `archive <n> --pr <pr>` | `plan #<n> finished (closed by <pr-url>)`; waits up to about 60 s for GitHub to close an open plan, closes it as completed when GitHub does not, removes stale phase labels, and posts the archive record |
| `archive <n>` | For a parent: `plan #<n> finished (all <k> children finished)`; claims an unassigned parent before its close, and posts the archive record |
| `retire <n> --reason <t>` | `plan #<n> retired`; closes as not planned and removes phase labels |
| `reopen <n> --pr <pr>` | Contract v3 and v4 only: `plan #<n> reopened: <status>`; `plan #<n> is open: <status>` when the plan is already open again; `pull request #<pr> does not close plan #<n>; nothing to reopen` when that pull request does not close the plan |

With `show --body`, only the body goes to stdout; both metadata lines go to stderr.
Render a body for the user only when they name the plan and ask to see it.
After a write, report the header strip and changed lines, not the full body.

Scratch lives at `git rev-parse --git-path docks-review`, with directory mode
0700. Export writes the body and a `.origin` sidecar containing its sha256 hex
plus newline, with sidecar mode 0600. The digest detects staleness; it grants no
permission. Edit validates provenance, normalizes the file, applies the freeze,
writes the remote body, and then refreshes the sidecar. A failed remote write
leaves the sidecar unchanged, so the same file stays valid for a retry.
Re-export after remote changes.
Keep scratch and machine paths out of durable records. No queue file is tool input.

## Normalization, advice, and refusals

Writes set the v5 marker until work starts. After that, a v5 plan keeps v5, and
a v3 or v4 plan gets v4. Writes also set canonical heading and token case, lowercase ids with
hyphens changed to underscores, and trimmed trailing whitespace. U+2014 becomes
` - ` with doubled spaces collapsed. Missing or unknown Mode becomes plan-only.
Unknown Effect and Status tokens remain in the record and produce advice. A
literal pipe inside a table cell is written `\|`. A row that does not parse to
eight cells is kept verbatim by `status`, and it blocks `edit` and `step`, so a
rewrite never drops the row. Once work has started, `edit` also refuses while
the current record holds such a row. A duplicate or unknown `##` heading blocks every body write; a retired `## Review` heading is dropped on the next write. An explicit `--mode` on `new` outranks any Mode line inside `--goal`; otherwise the last unfenced, unindented Mode line in Goal is the decision.

Advice prints `advice: <text>` on stdout and exits 0. It covers absolute machine
paths, a Research section that is empty or holds only `_Not researched yet._`
after drafting,
defaulted Mode, unknown Effect or Status, an unfinished dependency when a step
moves to in-flight or done, two steps that share a Files path with no Depends
chain, an `edit` that changes Goal, Research, Steps, Acceptance, or Do not touch
after a trusted plan pass (in a Goal that holds the yolo delegation line, the
Mode line and that line do not count), and every non-local Effect of a step
that is not `done` or `skipped` as an in-session permission reminder. A machine path
points into a user or root home, a mount, a named temporary or runtime
directory, a Windows drive, or a network share. Its advice is
`body contains an absolute machine path: <path>`, once per distinct path.
URL routes and portable system paths, such as `/usr/bin/env` or a bare `/tmp`,
get no advice. `show` also advises when a plan is closed as completed while a
step is not terminal, and names the closer. On a plan that is closed as
completed, it also advises:

- on every plan, once per linked child that is not terminal:
  `plan is closed as completed while child #<c> is <status>; run archive <n> again to reopen it safely`;
- on a plan whose latest trusted archive record (Archive) says
  `Archived as parent`, once per Steps
  row whose Done when is `child #<c> finished` while `<c>` is not a linked
  sub-issue:
  `plan names child #<c>, which is not linked; relink it or edit the row; run archive <n> again to reopen it safely`;
- on such a plan, when no named child is linked and finished:
  `plan is closed as completed but no child finished; run archive <n> again to reopen it safely`.

For an issue that GitHub left
closed with reason `REOPENED`, `show` advises
`GitHub left this issue closed with reason REOPENED and refuses every state change; ask GitHub Support to repair it, and record step results in an issue comment until then`.
The status of that issue stays `unreadable`. `list` advises when it reaches 500
plans. The scope advice of a started v5 plan is in Status, ownership, and
frozen state. `show` and `edit` advise `split into child plans: <reason>` when
the body passes 50,000 bytes, the Steps table passes 20 rows, or the issue holds
more than 60 comments. GitHub refuses an issue body or a comment above 262,144
characters. Advice is not approval.

Refusals exit 1. These stderr strings are exact, with angle brackets replaced:

```text
plan #<n> is owned by <login>
plan issue changed remotely; re-read and retry
plan issue body differs after edit
missing export provenance: <path>.origin does not exist; run `plan.mjs export <n>` and re-apply the edit
unreadable export provenance: <path>.origin
stale export: <path> was exported from a superseded body; run `plan.mjs export <n>` and re-apply the edit
step state is frozen once work starts: <detail>
plan #<n> is closed; status applies to open plans
illegal plan status transition: <from> -> <to>
status <status> requires a filled Research section
illegal step status transition: <from> -> <to>
plan #<n> is finished; reopen it before moving step <id> to <status>
plan status is <status>; expected ongoing
archive requires an issue and --pr
archive requires ongoing or finished status, found <status>
archive refused: non-terminal step <id>
archive refused: no Steps rows parsed
archive refused: no child of plan #<n> finished; retire the parent
archive refused: child #<c> is <status>
archive refused: plan #<n> has its own landing work; archive it with --pr
duplicate step id after normalization: <id>
Steps row <n> has <count> cells; expected 8. Escape a literal pipe as \| so the row is preserved.
duplicate section heading: <name>
unknown section heading: <title>; use only <the seven sections> or write it below an existing section as ### or plain text
archive requires Code-review: pass
pull request #<pr> merged into <base>; archive requires a merge into <nameWithOwner>:<branch>
pull request #<pr> has no closing keyword for plan #<n> in its description; ask the owner before you add `Closes #<n>` to the merged pull request, then run archive again
retire requires a single-line --reason
cannot retire a <status> plan
blocked status requires --reason as single-line text
reserved label namespace: <label>
parent #<n> is not an open plan
plan #<n> uses child plans; a partial pull request is not allowed (open a child plan with new --parent <n>)
pull request #<pr> is not merged
GitHub has not closed plan #<n> for pull request #<pr> yet; run reopen again once it has
plan #<n> was closed by <closer> after pull request #<pr> merged; reopen it by hand only if that close was a mistake
plan #<n> was closed by <closer> before pull request #<pr> merged; reopen it by hand only if that close was a mistake
plan #<n> changed during the settle wait; run reopen again
plan #<n> changed during the settle wait; run archive again
GitHub left plan #<n> closed with reason REOPENED and refuses every state change; ask GitHub Support to repair it
plan issue state differs after reopen; run status <n> ongoing to repair the phase labels
```

GitHub call failures exit 1 and print one of these messages on stderr. `edit`,
`status`, and `step` print their stdout result only after the write succeeds.

```text
gh <command> <subcommand> failed: <gh stderr, or exit <code>>
gh api graphql returned errors: <message>
```

A failure can be short-lived, such as
`GraphQL: Something went wrong while executing your query`. After such a
failure:

1. Run `show <n>` and check whether the change is on the issue.
2. If it is not, run the same command once more. For `edit`, use the same file.
3. If it is, do not run the command again. Run `export <n>` before the next body
   edit.
4. If the second run fails, stop the phase and report the message.

## Landing and archive proof

### Linked branch

Set up the linked branch after the plan is ongoing and before any code change.
A yolo run uses the timing and worktree rules in Yolo runs instead.

1. Run `git status --porcelain`. Continue only when it prints nothing. Never
   stash, move, or commit ambient work to make it clean.
2. If the checkout is dirty, run the checkout check of Worktree hooks. When it
   passes, ask through `ask` whether to use a separate clean worktree. On
   approval, set it up with Linked branch timing items 1 to 5, and skip items
   3 to 5 here. Otherwise block the plan. Report the dirty paths as Worktree
   hooks says.
3. Run `gh issue develop <n> --list --repo <owner/repo>`. Reuse a listed branch.
4. If no branch is listed, run
   `gh issue develop <n> --repo <owner/repo> --base <default> --checkout`.
5. If a call fails, list again. Continue only when the list shows the branch.
   Otherwise block the plan. Never work on an unlinked branch.

### Repository hooks

A repository hook, such as a pre-commit or pre-push hook, is a required check.
Never skip or turn it off. Do not pass `--no-verify`. Do not pass `-n` to
`git commit`. Do not change `core.hooksPath`. Do not set a variable that turns
hooks off, such as `HUSKY=0`. When a hook fails on a commit or a push:

1. When this plan causes the failure, fix it. Then run the command again.
2. Files that the plan did not make, such as untracked or modified files in
   the checkout, can make a hook fail. Record those files, and block as item 3
   says. Never delete, stash, or move those files. Do not run the command from
   another worktree to avoid them. A new worktree can run other hooks than the
   checkout (Worktree hooks).
3. Otherwise, run `git fetch origin <default>`. Then run the hook's check on
   `origin/<default>` in a clean worktree. When it fails the same way there, it
   is a baseline failure. Record the hook, the check, and both results in
   Verification Results. Block the plan with that reason. Then ask the user how
   to continue. A yolo run uses the hook row in Yolo runs instead of the
   question.
4. When the check passes on `origin/<default>`, this plan causes the failure.
   Fix it as item 1 says.

A block or a stall needs a commit and a push of current work (Round ceiling,
and `plan-manager` phase 6). When a hook refuses that commit or push, keep the
work where it is. List the branch under Kept resources as `not pushed`. Then
continue with the block or the stall question.

A step after the landing merge, such as a release, can also meet a failing
hook. Then leave that step `planned`, and keep the plan status. Record the
hook, the check, and the result in an issue comment. Report the failure to the
user. Ask again before you run that step again.

### Worktree hooks

A new worktree can run other hooks than the checkout, or none. For example,
Husky keeps its hook wrappers in an ignored directory, and its dispatcher skips
a hook script that is missing. A check of hook files cannot show that two
worktrees run the same hooks for every hook manager. So a plan uses a separate
worktree for a dirty checkout only when neither the checkout nor the new
worktree runs a hook.

This section is about hooks that can stop a commit, a merge, or a push. The
`core.fsmonitor` helper is not such a hook. Git uses it only to limit the
files that it checks, and git checks all files when the helper fails.

The hook check is this script. Run it with `sh` from the root of a checkout or
of a worktree:

```sh
hooks=$(git rev-parse --git-path hooks && echo .) || exit 1
hooks=${hooks%?.}
if [ -e "$hooks" ]; then
  find -L "$hooks" -mindepth 1 -maxdepth 1 ! -name '*.sample' -exec test -x {} \; -print || exit 1
fi
git config --get-regexp '^hook\..*\.command$'
[ $? -le 1 ]
```

Each line that it prints is a hook that git runs: an executable entry of the
hooks directory, or a hook from configuration. An executable directory at a
hook name also counts, because git tries to run it. The `echo .` keeps a hooks
path that ends in a newline. The check passes only when the script exits 0
and prints nothing.

1. The checkout check: before `git worktree add`, run the check in the
   checkout.
2. The worktree check: after `git worktree add`, run the check in the new
   worktree before any other work there. Configuration that depends on the
   branch, and a relative hooks path, can give the worktree a hook that the
   checkout lacks.
3. When a check fails or prints a hook, do not use the worktree. If you
   created it, go back to the checkout first. Then run
   `git worktree remove -- <worktree>` and `git worktree prune`. Never add
   `--force`. When git refuses, keep the worktree, and list it with the reason
   from git. Block the plan. Name the dirty paths, and the hooks or the error
   that the check printed. Under Kept resources, list the branch, and list no
   removed worktree. The user can commit or move their own changes, and run the
   plan again.

### Pull requests

Open every plan pull request from the linked branch, after code review passes.
Commit and push only reviewed bytes. The landing pull request completes the
plan. Its description holds the summary, then the `## Checklist` section
(Checklist below), then `Closes #<issue>` on its own line. `archive` needs
this keyword as proof.

A v5 plan has no partial pull request. Put each part of the work that lands on
its own into a child plan (Record and mode). `reopen` refuses a v5 plan.

Only a v4 plan whose work started keeps the partial-pull-request flow. A
partial pull request lands part of the work. Put `Refs #<issue>` in the
description. GitHub still links it to the issue through the branch, so its
merge into the default branch closes the issue. For a partial pull request:

1. Before the merge question, run
   `gh pr view <pr> --repo <owner/repo> --json closingIssuesReferences`. If the
   plan issue is listed, say in the merge question that the merge closes the
   issue and that you will reopen it.
2. After the merge, run `reopen <n> --pr <pr>`. The helper waits until GitHub
   records the close by that pull request, then waits 10 s more. It reopens the
   plan with the comment
   `Reopened: partial pull request #<pr> closed this plan through its linked branch. Work continues.`,
   claims an unassigned plan and restores `plan:ongoing` when the plan has no
   phase label, in the same write, and prints the status. Never
   reopen the issue by hand right after the merge.
3. Run `show <n>` again. Continue only when the status is `ongoing`.

GitHub closes the issue on that merge only while the repository setting "Auto-close
issues with merged linked pull requests" is on
(<https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-auto-closing-issues>).
When the setting is off, `reopen` reports that GitHub has not closed the plan
yet. Run `reopen` once more. When it reports the same again and `show <n>`
reads `ongoing`, the plan is still open, so continue without a reopen.

GitHub can leave an issue closed with reason `REOPENED`. It then refuses every
state change on the issue, also in the web page (DocksDocks/docks#90). Do not
retry the reopen. Record the remaining step results in one issue comment,
report the plan as stuck, and ask the repository owner to contact GitHub
Support. After GitHub repairs the issue, continue normally.

#### Checklist

The `## Checklist` section shows which required checks passed on the reviewed
head. GitHub shows the progress of its task items, for example `2 of 3 tasks`.
Write each item as a top-level task item: `- [ ] <text>` or `- [x] <text>`.
Do not nest items. GitHub does not document how it counts nested items.

Add the items in this order:

1. The task items of a usable pull-request template of the repository, with
   their text as written. GitHub reads a template from the root, from `docs/`,
   or from `.github/`: a file named `pull_request_template`, with an extension
   such as `.md` or `.txt`, in any letter case, or a `PULL_REQUEST_TEMPLATE/`
   folder that holds several templates
   (<https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates>).
   Find it with the detection in the `plan-workspace` skill's
   `references/pull-request-template.md`, and take items only from an entry
   that it reports as usable. Name each `unusable` entry, such as a broken
   symlink or an empty template folder, in the merge question. A detection
   error is not a missing template: report it in the merge question.
   `gh pr create --body-file` uses the file as given and copies no template,
   so copy the items yourself. When there are several templates, use the one
   that applies to the change, and name it in the merge question.
2. One item for each Acceptance row that a repository instruction requires,
   as "`<command>` passes".
3. "Tested locally with the `verify` skill" when an Acceptance row runs a
   driven surface end to end.
4. "Code review passed".

When the repository has no usable pull-request template, use these default
items in place of the template items: "`<check command>` passes", with the check
command from the root instruction file (for example `bun run check`); "Tested
locally with the `verify` skill"; and "Code review passed". When the root
instruction file names no check command, the first item reads "Checks pass"
and stays unticked, with the reason
`no check command in the repository instructions`. Skip an item of 2 to 4 when
a template item or a default item already covers it, so that no check and no
review shows twice.

Tick an item (`- [x]`) only when its evidence is for the reviewed head that you
push now:

- a command item: Verification Results record a pass of that command on that
  head;
- the tested-locally item: Verification Results record a pass of the `verify`
  skill flow on that head;
- the code-review item: `show <n>` reports `code=pass`, and the passing round
  reviewed that head;
- a template item: a Verification Results entry or the code-review verdict for
  that head proves it.

Otherwise keep the item unticked, and end its line with ` - <reason>`, for
example ``- [ ] Tested locally with the `verify` skill - the change touches no driven surface``.
A template item without proof gets the reason `not checked by the plan`.
After each push to the linked branch while the pull request is open, also a
push of current work before a block or a stall, build every tick again from
the evidence for the new head. Evidence for an older head ticks nothing: the
item stays unticked, with the reason `not checked on <short-sha>`, until it
passes on the new head. Update the body right after the push, before any wait
for checks, with `gh pr edit <pr> --repo <owner/repo> --body-file <file>`.

### Checks and merge

Wait up to five minutes for checks to appear. Then wait for every check to
finish, for example with `gh pr checks <pr> --repo <owner/repo> --watch`. A
failed or cancelled check blocks the merge question until its fix passes code
review. After you push the fix, update the body as Checklist says before you
wait for checks again. If the repository has no configured checks, use the
green local gate as the check result and say so in the merge question.

When the same check still fails after the third fix attempt on one plan, stop
fixing it. Outside a yolo run, ask with the options `Continue fixing` and
`Leave plan blocked`. `Continue fixing` gives the check three more fix
attempts. On `Leave plan blocked`, or without an answer, commit and push
current work to the linked branch, update the body as Checklist says, set the
status to `blocked` with the check name as the reason, run Teardown's exit
without a merge, and report. In a yolo
run, the third failure is a stall under Round ceiling.

Before the merge question, run the landing self-check. Read the pushed body
with `gh pr view <pr> --repo <owner/repo> --json body --jq .body`. For each
ticked item, find its evidence for the pushed head, as Checklist says. Untick
each item without that evidence, add its reason, and update the body with
`gh pr edit <pr> --repo <owner/repo> --body-file <file>`. The merge question
states `<k> of <n> checklist items ticked` and lists each unticked item with
its reason. An unticked item does not block the merge question; the user
decides.

Ask afresh with two options: `Merge now` and `Leave pull request open`. The
`Merge now` option states the teardown that follows the merge: the processes
and stacks to stop, the worktree to remove, the local branch to delete with
`git branch -d <branch>`, and each remote non-production resource to clean up.
A `Merge now` answer confirms that teardown, including the branch delete.
Without `Merge now`, leave the issue and the pull request open, and run
Teardown's exit without a merge. Merge with
`gh pr merge <pr> --repo <owner/repo> --match-head-commit <reviewed-head-sha>`
and the merge-method flag that the repository allows. A prior plan approval
never authorizes a merge.

### Steps after the landing merge

A step that must run after the merge, such as `deploy`, stays `planned` until
the landing pull request merges. It does not wait for GitHub to close the
plan, because GitHub can leave the plan open after that merge (Archive). After
the merge, ask in session, and run the step. Mark it `done` when it ran, or
`skipped` when the user declines it. Use `step` for both. An open plan is
`ongoing`, so `step` accepts either target. A finished plan accepts only these
two targets.

### Archive

Run `archive <n> --pr <pr>` after the landing merge, when every step is
terminal. `<pr>` is the landing pull request. Archive requires terminal steps
and a trusted latest Code-review pass. It also requires proof from that pull
request. The pull request merged into the default branch of this repository,
and its description carries a GitHub closing keyword for this issue. A title
or sidebar link is not proof. A merge into another branch is not proof. Archive
checks the base branch first, then the description, and names the failed check.
For a description without the keyword, ask the repository owner before you edit
the merged pull request. If the owner approves, add `Closes #<n>` to its
description, then run archive again. Otherwise, stop and report.

The plan must be `ongoing` or `finished`. GitHub can leave the plan open after
the landing merge, for example when the repository turns off its auto-close
setting (Pull requests). For an open plan, archive first waits up to about
60 s for GitHub's close. When GitHub does not close the plan, archive closes it
as completed, with the comment
`Closed by archive: pull request #<p> merged into <branch> and closes this plan, but GitHub left the plan open.`
and its archive record (below). Then archive removes
the phase labels. Do not close the plan by hand. A plan that someone already
closed as completed archives with the same proof. When archive fails after it
closed the plan, run the same command again. This rule replaces step 3 of the
retry steps in Normalization, advice, and refusals.

A child is terminal when it is closed as completed (`finished`), as not planned
(`retired`), or as a duplicate. Archive, with or without `--pr`, refuses a plan
that has a child that is not terminal, such as an open child, with
`archive refused: child #<c> is <status>`. Archive a parent with `archive <n>`,
without `--pr`, when every child is terminal, at least one child is finished,
and every parent step is terminal. When no child finished, archive refuses with
`archive refused: no child of plan #<n> finished; retire the parent`. The parent
must be `ongoing` or `finished`. It needs no pull request and no code review.
It closes an open parent as completed, removes the phase labels, and prints
`plan #<n> finished (all <k> children finished)`, where `<k>` counts every
child. On a plan without children, `archive` without `--pr` refuses. On a plan
with children that is not a parent (Record and mode), it refuses with
`archive refused: plan #<n> has its own landing work; archive it with --pr`.

Archive posts an archive record as the acting owner. A parent archive posts
`Archived as parent: children #<a>, #<b>`, in child order, as the comment of its
close, or alone when the parent was already closed. An `archive --pr` posts
`Archived with landing pull request #<p>`. When archive closed the plan itself,
the record is the last line of its close comment, after a blank line; when
GitHub already closed the plan, archive posts the record as a comment alone.
`archive <n>` claims an unassigned parent before its close, so its record is
trusted for the check after the close. That claim refuses a foreign assignee
with `plan #<n> is owned by <login>` before it writes. An `archive --pr` plan always has one
assignee, because it needs a trusted code-review pass. Archive skips a record,
or the `--pr` close comment, only when an identical trusted one comes after the
latest trusted `Reopened: ...` comment. The record is trusted as
a review comment is (Phases and review comments), the latest trusted record
wins, and a later trusted `Reopened: ...` comment ends it. Parent recovery below applies
only when the latest trusted record says `Archived as parent`. A plan with a
landing record or no record gets only the open-child rule.

After its own close, archive compares the plan with its read before the close.
Open work is a child that is not terminal. On a parent archive record, open
work is also a child added since that read, a child of that read that is no
longer linked, and child rows that named a finished child before the close and
name none after it. A state that existed before the close does not count. On open work,
archive waits for the close to settle, reads the plan again, and reopens it
through the same path as `reopen`, with the comment
`Reopened: child #<c> changed while plan #<n> closed; work continues.` Then it
refuses with `archive refused: child #<c> is <status>`, where `<status>` is
`unlinked` for a child that is not linked. A close with reason `REOPENED`
stops it as it stops `reopen` (Pull requests). When the plan changed during
the wait, archive refuses with
`plan #<n> changed during the settle wait; run archive again`. When the read
of the children after the close fails, archive exits 1 with the GitHub call
failure.

A retry of `archive <n>` or `archive <n> --pr` on a plan that is closed as
completed does the same safe reopen for the open work that `show` advises on:
a child that is not terminal on every plan, and on a parent archive record also
a named child that is not linked or no finished named child. The `--pr` retry checks this
right after the not-merged refusal, before its other refusals. Run the retry
when `show` advises it (Normalization, advice, and refusals). Each safe reopen,
by `reopen` or by `archive`, reads the labels right before its write. It adds
`plan:ongoing` only when that read shows no phase label, and it never replaces
the label set. After the reopen, it reads the plan again. Unless that read
shows an open plan with exactly one phase label, it refuses with
`plan issue state differs after reopen; run status <n> ongoing to repair the phase labels`
and prints no status; `status <n> ongoing` or `status <n> blocked` repairs it.
Otherwise it prints the status of that read, such as `reopened: blocked`.
Known limit: a phase label that someone else adds around the write can leave
two phase labels. The refusal reports it, and `status` repairs it. The write
removes no label, so no label is lost.

### Teardown

Teardown removes the resources that the plan created.

From the first step, track each resource that the plan creates or starts:
worktrees, local branches, servers, watchers, test runners, compose stacks, and
remote resources made through SSH or a provider CLI. Stop a process or stack
when the step or check that needed it ends. Never stop or remove a resource
that the plan did not create.

Run each compose command from the directory that started the stack, with the
same `-p` and `-f` options. First record the volume names from the container
mounts of the stack. Add the same options to `docker compose ps`, for example:

```sh
docker inspect --format '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} {{end}}{{end}}' $(docker compose ps -a -q)
```

This record includes anonymous volumes, which carry no project label. Then run
`docker compose down`. Never add `--volumes`. List the recorded volumes under
Kept resources.

A partial pull request merge (v4) does not end the plan. Do not run teardown
then.

#### After archive

Run these steps in order after `archive <n> --pr <pr>` succeeds:

1. Stop each process and compose stack that the plan started and that still
   runs.
2. Clean up each remote non-production resource that the merge question named.
   Follow Production resources for every other remote resource.
3. Run the next commands from the main worktree, not from the plan's worktree.
   A removal from inside the worktree leaves the shell in a deleted directory.
4. If the plan made a worktree, run `git worktree remove -- <worktree>`, then
   `git worktree prune`. Never add `--force`. When git refuses because of
   untracked or modified files or a lock, keep the worktree. List it with the
   reason from git.
5. If the plan used the user's checkout and `git status --porcelain` prints
   nothing, run `git switch <default>` and `git pull --ff-only origin <default>`.
6. Run `git branch -d <branch>`. When git refuses, keep the branch and list it.
   Git refuses after a squash or rebase merge once the remote branch is gone.
   Never run `git branch -D` or add `--force`, even when the git hint suggests it.
7. Report Kept resources.

#### Exit without a merge

The plan can stop without the landing merge: on `Leave pull request open`, on a
blocked plan, on a stalled yolo run, or without an answer. Then stop each local
process and compose stack that the plan started, as above. Keep the worktree,
the branch, and every remote resource. Report them under Kept resources with
the reason, such as `pull request open` or `plan blocked`.

#### Production resources

Local resources on the workstation are development resources: worktrees, local
branches, scratch files, local processes, and local compose stacks. Teardown
removes them without a question. A remote resource that an agent reaches
through SSH or a provider CLI is production, unless its target is
non-production. Examples are `wrangler`, `kubectl`, and a remote Docker host.
Steps, acceptance, and effects defines a non-production target. A command that
names no non-production target acts on production, such as `wrangler delete`
without `--env`.

Teardown never stops, removes, undeploys, or deletes a production resource on
its own. A production cleanup needs an in-session `ask` immediately before it.
Keep such cleanups rare. A yolo invocation does not answer that question. When
`ask` is unavailable, as in a subagent, do not run the cleanup. List the
resource under Kept resources with the reason `production`.

#### Kept resources

List each resource that teardown keeps, with its reason, or write `none`. Name
a worktree by its branch and directory name, a volume by its name, and a remote
resource by its provider and name. Do not write absolute machine paths.
`git worktree remove` also removes the review scratch of a linked worktree. The
scratch directory of the main checkout stays.

## Yolo runs

The user starts a yolo run by invoking the `yolo` skill with a request. The
invocation settles the path as a plan and the Mode as `plan-and-implement`. It
is the user's in-session answer for every routine action below, until the merge
question. All other contract rules stay in force.

| Contract question | Yolo rule |
|---|---|
| Path and Mode | Plan with `Mode: plan-and-implement` |
| Request that names an existing plan, or an incomplete request | The yolo skill's Existing plans and incomplete requests rule |
| Work that needs more than one landing pull request | A parent and its children (Record and mode). The run creates no linked branch for the parent and reviews it first, also an adopted parent without a trusted `plan=pass`. After that pass, it runs one child: the first open child in Steps order whose Depends are finished. A later yolo run that names the parent runs the next child |
| New scope or split advice after work starts | Move the work into a new child plan, as Status, ownership, and frozen state says, and list the child in the run summary |
| Non-local Effect step before the landing merge | The effect table below |
| Linked-branch timing | Right after `new`, while the plan is drafting; a parent gets no linked branch, and a child gets its branch when the run starts it |
| Dirty checkout at linked-branch setup | A separate clean worktree, without a question, when the checks of Worktree hooks pass; otherwise block (Linked branch timing) |
| Review-loop continuation | The round ceiling below |
| Plan-review `blocked` verdict | The manager decides with evidence |
| Code-review `blocked` verdict for unread hunks | Dispatch that reviewer again, as Code-review rounds says; a second such block on the same head stalls the phase (round ceiling below) |
| Public disclosure of a sensitive finding | Stop before any write |
| Production cleanup in Teardown | Its own question, like a step after the landing merge |
| Repository hook that blocks the plan (Repository hooks, items 2 and 3) | Record the failure. Set the plan `blocked` with the hook and the failing check. Run Teardown's exit without a merge. List the branch under Kept resources, with `not pushed` when the push failed |

### Delegation line

The Goal of a yolo plan contains this exact line:

`Yolo: the user delegated every decision except the merge to the agent.`

The manager records each decision in Research with its evidence. Open questions
holds only a `Blocked:` line. Plan reviewers and code reviewers treat the choice
of a recorded decision as settled, and report a false premise or a broken
effect.

### Effects before the landing merge

| Effect | Yolo rule |
|---|---|
| `local` | Run |
| `probe` | Run against a non-production target or a public read-only source |
| `push` | Run only to the plan's linked branch |
| `deploy` | Run only to a non-production environment |
| `production_access`, `publish`, `release` | Do not run before the landing merge |

Steps, acceptance, and effects defines a non-production target. A step that the
table does not permit stays `planned`. After the landing merge, it follows
Steps after the landing merge. Effect advice from the helper is met for each
effect that the table permits.

### Linked branch timing

Set up the linked branch right after `new`, before research; for a child, when
the run starts it, before its research. The status stays
`drafting`. Run Linked branch item 1. When the checkout is clean, continue with
items 3 to 5. When it is dirty, do not ask. Run the checkout check of Worktree
hooks. When it passes, use these commands instead:

1. If `gh issue develop <n> --list --repo <owner/repo>` lists no branch, run
   `gh issue develop <n> --repo <owner/repo> --base <default>`.
2. List again and read the branch name.
3. Run `git fetch origin <branch>`.
4. Run `git worktree add <worktree> <branch>`, where `<worktree>` is
   `${XDG_DATA_HOME:-$HOME/.local/share}/agent-worktrees/<repository-name>/issue-<n>`.
5. Run the worktree check of Worktree hooks in that worktree.

When a check of Worktree hooks fails or prints a hook, follow its item 3. Set
the plan `blocked` with that reason, run Teardown's exit without a merge, and
report. Otherwise do all later work in that worktree. Keep its path out of
durable records.

### Round ceiling

Each review phase gets 10 rounds without a question. In code review, fix every
reproduced finding of every severity before the next round. A code-review pass
lands with open findings only in the two cases below. Reject a finding only
with evidence, posted as the review loop says.

From code-review round 3, a pass whose open findings are all unreached LOW
findings lands. The code reviewer marks such a finding `Unreached:` when no
current caller, fixture, or documented input reaches the fault (the
`code-reviewer` skill, Severity and verdict). Check that claim when you
reproduce the finding; when something does reach the fault, fix it and review
again. Do not change reviewed bytes for the unreached findings. Before you
write the run summary, list them in one follow-up issue that links the plan
issue (`gh issue create --repo <owner/repo>`), and list them under Open
findings in the run summary. A replay on the plugin's benchmark that applied
this rule to every LOW finding, not only to unreached ones, removed at most 3
of 73 rounds in one arm and 0 to 2 rounds in the others, and no known defect
escaped.

A phase stalls as review loop item 5 says: round 10 ends without a pass, the
same finding returns after two different approaches, or dispatch fails twice
without a relevant change. Landing stalls when the same pull-request check
still fails after the third fix attempt, as Checks and merge says. When round
10 ends on a
code-review pass that still lists MEDIUM or LOW findings, land, and list those
findings in the run summary.

On a stall, commit and push current work to the linked branch first, when code
exists. When the pull request is open, update its body as Checklist says. A
hook that refuses them follows Repository hooks. Then ask once, with
the options `Continue yolo` and `Leave plan
blocked`. Keep the status unchanged while you ask, because the helper does not
move a blocked plan back to `drafting` or `planned`. `Continue yolo` gives the
phase 10 more rounds, or gives a failing check three more fix attempts. On
`Leave plan blocked`, or without an answer, set the
status to `blocked` with the stall reason, run Teardown's exit without a merge,
and report.

### Merge question

After checks pass, run the landing self-check in Checks and merge, and print the
run summary that the `yolo` skill defines. Then ask the question in Checks and
merge, with the checklist line. Each step after the landing merge needs its
own question.

### Published text

Before each issue, comment, commit, or pull request write, remove secrets,
tokens, credentials, private hostnames, environment values, and absolute machine
paths. Name a secret by its variable name, not its value. When the request would
make an undisclosed vulnerability, credential location, or other sensitive
finding public, stop before any write and report.
