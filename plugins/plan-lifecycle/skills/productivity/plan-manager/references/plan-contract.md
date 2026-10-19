# Plan contract v4
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

Settle Mode with the user before implementation. A yolo invocation settles the
path and the Mode; see Yolo runs. `plan-and-implement` authorizes the full
lifecycle. `plan-only` stops after plan review. A defaulted Mode never
authorizes implementation. The settled Mode also covers routine issue
publication and landing work, which stay outside the Steps table.

Durable solution: solve the root cause, move every caller to the new path, and
remove obsolete paths. Use a temporary workaround only with user approval.
The body starts with `<!-- plan-contract: v4 -->`, then a blank line. It has no
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

The helper reads v3 and v4 records. It ignores the old Review section and drops
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
its durable command identifier. `Files` defines scope. `Depends` is `-` or
comma-separated display numbers or ids. The helper resolves ids to display
numbers on write. `Done when` names observable completion, not activity.
Acceptance rows identify a command and its expected result. They cover the goal,
not just individual steps. Use repository-relative paths and portable commands.

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

An open plan must be ongoing for `step`. Its done and skipped steps are immutable.
Other open step transitions are free. A finished plan permits only done or skipped
targets for terminal repair. To move a step of a finished plan to another status, reopen the issue first. Other closed plans do not permit step transitions.

After work starts, `edit` freezes each existing step's Id, display number,
Depends, Effect, Status, and presence. Task, Files, and Done when remain editable.
New rows must be planned and follow all existing rows. A closed plan cannot gain
rows. Use `step`, not `edit`, to change step state.

Mutations refuse foreign assignees. An unassigned plan is claimed by the acting
login inside the same write. Read the issue again before each write. The helper
compares remote state before writing and checks the body after an edit.

## Phases and review comments

The six phases are decide, draft, research, plan review, implement, and code review.
`plan-workspace` maintains workspace routing. Main-context `plan-manager` owns the
lifecycle. The explicit-only `yolo` skill runs the same lifecycle under Yolo
runs. Internal `plan-reviewer` reviews goal fit, research gaps, and security
risk. The two read-only wrappers are `plan-reviewer` and `code-reviewer`.

Run this review loop for plan review and for code review:

1. Give each round fresh input: a fresh export, the issue number, and the round
   number. Code review also gets a fresh diff.
2. Post the returned block unchanged as one issue comment. Never store a review
   in the body.
3. Run `show <n>` and read the verdict. Stop on pass.
4. Otherwise reproduce each finding. Fix confirmed defects, record evidence for
   rejected findings, and start the next round.
5. Ask the user to continue or block when a round makes no progress, the same
   finding returns after a repair, round 5 does not pass, or dispatch fails again
   without a relevant change. If no answer is available, record the reason and
   block. A yolo run uses the round ceiling in Yolo runs instead.

Record user-only decisions in Open questions. Do not invent approval.

The helper finds review records in comments with these rules. The reviewer
agents define the exact block they return, and that block follows these rules.

- The first non-blank line names the kind: `plan review` or `code review`, in
  any case, after optional `#` heading markers. Any suffix, such as `round 2`,
  is allowed.
- A later line holds the verdict: `plan-review:` or `code-review:`, then a
  verdict word. A space can replace the hyphen.
- On each line, the helper ignores Markdown emphasis (`*`, `_`), code marks,
  blockquote markers, and list markers.

| Verdict input | Plan result | Code result |
|---|---|---|
| `pass`, `ok`, `approved` | `pass` | `pass` |
| `repair`, `changes`, `fixes-required` | `repair` | `fixes-required` |
| `blocked` | `blocked` | `blocked` |

A code pass derives as fixes-required when any line contains `[critical]` or
`[high]`, or starts with `critical:`, `high:`, `severity: critical`, or
`severity: high`, in any case. A bare severity word inside finding prose does
not count. Trust requires exactly one issue assignee and a comment author login
equal to that assignee. The latest trusted eligible comment per kind wins,
ordered by `createdAt`; API order breaks ties. Missing trusted reviews derive as
none. There is no body verdict fallback.

## Helper commands and output

Run `node <installed-helper> <command>`. `<n>` is an issue number, optionally
prefixed with `#`. The header strip is `#<n> · <status> · <title> · <url>`.

| Command | Result on stdout |
|---|---|
| `new --title <t> --goal <g> [--mode <m>] [--label <name>]...` | `plan created: #<n> <url>`; assigns @me and labels plan plus drafting |
| `show <n> [--body]` | Header strip, then `reviews: plan=<verdict> code=<verdict>`, then advice |
| `export <n>` | Absolute path to `plan-<n>.md` in the scratch directory |
| `edit <n> --file <path>` | Header strip, `changed: <k> line(s)`, `-old` and `+new` lines, then advice |
| `status <n> <status> [--reason <text>]` | `plan #<n> status: <old> -> <new>` |
| `step <n> <id> <status>` | `plan #<n> step <id>: <old> -> <new>` |
| `list [--status <s>]` | `<status>\t#<n>\t<title>`; open first, then closed, each in ascending number order; prints advice when it reaches 500 plans |
| `archive <n>` | `plan #<n> finished (closed by <pr-url>)`; removes stale phase labels |
| `retire <n> --reason <t>` | `plan #<n> retired`; closes as not planned and removes phase labels |

With `show --body`, only the body goes to stdout; both metadata lines go to stderr.
Render a body for the user only when they name the plan and ask to see it.
After a write, report the header strip and changed lines, not the full body.

Scratch lives at `git rev-parse --git-path docks-review`, with directory mode
0700. Export writes the body and a `.origin` sidecar containing its sha256 hex
plus newline, with sidecar mode 0600. The digest detects staleness; it grants no
permission. Edit validates provenance, normalizes the file, applies the freeze,
and refreshes the sidecar before the remote write. Re-export after remote changes.
Keep scratch and machine paths out of durable records. No queue file is tool input.

## Normalization, advice, and refusals

Writes set the v4 marker, canonical heading and token case, lowercase ids with
hyphens changed to underscores, and trimmed trailing whitespace. U+2014 becomes
` - ` with doubled spaces collapsed. Missing or unknown Mode becomes plan-only.
Unknown Effect and Status tokens remain in the record and produce advice. A
literal pipe inside a table cell is written `\|`. A row that does not parse to
eight cells is kept verbatim by `status`, and it blocks `edit` and `step`, so a
rewrite never drops the row. Once work has started, `edit` also refuses while
the current record holds such a row. A duplicate or unknown `##` heading blocks every body write; a retired `## Review` heading is dropped on the next write. An explicit `--mode` on `new` outranks any Mode line inside `--goal`; otherwise the last unfenced, unindented Mode line in Goal is the decision.

Advice prints `advice: <text>` on stdout and exits 0. It covers absolute machine
paths, `_Not researched yet._` after drafting, defaulted Mode, unknown Effect or
Status, an unfinished dependency when a step moves to in-flight or done, and
every non-local Effect as an in-session permission reminder. A machine path
points into a user or root home, a mount, a named temporary or runtime
directory, a Windows drive, or a network share. Its advice is
`body contains an absolute machine path: <path>`, once per distinct path.
URL routes and portable system paths, such as `/usr/bin/env` or a bare `/tmp`,
get no advice. `show` also advises when a plan is closed as completed while a
step is not terminal, and names the closer. `list` advises when it reaches 500
plans. Advice is not approval.

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
illegal step status transition: <from> -> <to>
plan #<n> is finished; reopen it before moving step <id> to <status>
plan status is <status>; expected ongoing
archive requires finished status, found <status>
archive refused: non-terminal step <id>
archive refused: no Steps rows parsed
duplicate step id after normalization: <id>
Steps row <n> has <count> cells; expected 8. Escape a literal pipe as \| so the row is preserved.
duplicate section heading: <name>
unknown section heading: <title>; use only <the seven sections> or write it below an existing section as ### or plain text
archive requires Code-review: pass
archive requires a closing pull request merged into <nameWithOwner>:<branch>
retire requires a single-line --reason
cannot retire a <status> plan
blocked status requires --reason as single-line text
reserved label namespace: <label>
```

## Landing and archive proof

### Linked branch

Set up the linked branch after the plan is ongoing and before any code change.
A yolo run uses the timing and worktree rules in Yolo runs instead.

1. Run `git status --porcelain`. Continue only when it prints nothing. Never
   stash, move, or commit ambient work to make it clean.
2. If the checkout is dirty, use a separate clean worktree only when the user
   approves it in this session through `ask`. Otherwise block the plan and
   report the dirty paths.
3. Run `gh issue develop <n> --list --repo <owner/repo>`. Reuse a listed branch.
4. If no branch is listed, run
   `gh issue develop <n> --repo <owner/repo> --base <default> --checkout`.
5. If a call fails, list again. Continue only when the list shows the branch.
   Otherwise block the plan. Never work on an unlinked branch.

### Pull requests

Open every plan pull request from the linked branch, after code review passes.
Commit and push only reviewed bytes.

- The landing pull request completes the plan. Put `Closes #<issue>` on its own
  line in the description. `archive` needs this keyword as proof.
- A partial pull request lands part of the work. Put `Refs #<issue>` in the
  description. GitHub still links it to the issue through the branch, so its
  merge into the default branch closes the issue.

For a partial pull request:

1. Before the merge question, run
   `gh pr view <pr> --repo <owner/repo> --json closingIssuesReferences`. If the
   plan issue is listed, say in the merge question that the merge closes the
   issue and that you will reopen it.
2. After the merge, run `show <n>`. If the status is `finished`, run
   `gh issue reopen <n> --repo <owner/repo> --comment "Reopened: partial pull request #<pr> closed this plan through its linked branch. Work continues."`.
3. Run `show <n>` again. Continue only when the status is `ongoing`.

### Checks and merge

Wait up to five minutes for checks to appear. Then wait for every check to
finish, for example with `gh pr checks <pr> --repo <owner/repo> --watch`. A
failed or cancelled check blocks the merge question until its fix passes code
review. If the repository has no configured checks, use the green local gate as
the check result and say so in the merge question.

Ask afresh with two options: `Merge now` and `Leave pull request open`. Without
`Merge now`, leave the issue and the pull request open. Merge with
`gh pr merge <pr> --repo <owner/repo> --match-head-commit <reviewed-head-sha>`
and the merge-method flag that the repository allows. A prior plan approval
never authorizes a merge.

### Steps after the landing merge

A step that must run after the merge, such as `deploy`, stays `planned` until
the landing merge closes the issue. Then ask in session, run the step, and mark
it `done` or `skipped` with `step`. A finished plan accepts only those targets.

### Archive

Run `archive <n>` after the landing merge, when every step is terminal.
Archive requires finished status, terminal steps, and a trusted latest Code-review pass.
Its latest closure must be a merged pull request into this repository's default branch,
or a commit associated with such a merged pull request. A pull-request closer must
carry a GitHub closing keyword for this issue in its description; a title or sidebar
link is not proof. A merely linked pull request, another repository, or a non-default
target is not proof.

## Yolo runs

The user starts a yolo run by invoking the `yolo` skill with a request. The
invocation settles the path as a plan and the Mode as `plan-and-implement`. It
is the user's in-session answer for every routine action below, until the merge
question. All other contract rules stay in force.

| Contract question | Yolo rule |
|---|---|
| Path and Mode | Plan with `Mode: plan-and-implement` |
| Non-local Effect step before the landing merge | The effect table below |
| Linked-branch timing | Right after `new`, while the plan is drafting |
| Dirty checkout at linked-branch setup | A separate clean worktree, without a question |
| Review-loop continuation | The round ceiling below |
| Plan-review `blocked` verdict | The manager decides with evidence |
| Public disclosure of a sensitive finding | Stop before any write |

### Delegation line

The Goal of a yolo plan contains this exact line:

`Yolo: the user delegated every decision except the merge to the agent.`

The manager records each decision in Research with its evidence. Open questions
holds only a `Blocked:` line. Reviewers treat a recorded decision as settled.

### Effects before the landing merge

| Effect | Yolo rule |
|---|---|
| `local` | Run |
| `probe` | Run against a non-production target or a public read-only source |
| `push` | Run only to the plan's linked branch |
| `deploy` | Run only to a non-production environment |
| `production_access`, `publish`, `release` | Do not run before the landing merge |

A non-production target is one that repository configuration or documentation
names local, development, dev, test, homolog, homologation, staging, or
preview. Every other target is production. A step that the table does not
permit stays `planned`. After the landing merge, it follows Steps after the
landing merge. Effect advice from the helper is met for each effect that the
table permits.

### Linked branch timing

Set up the linked branch right after `new`, before research. The status stays
`drafting`. Run Linked branch item 1. When the checkout is clean, continue with
items 3 to 5. When it is dirty, do not ask. Use these commands instead:

1. If `gh issue develop <n> --list --repo <owner/repo>` lists no branch, run
   `gh issue develop <n> --repo <owner/repo> --base <default>`.
2. List again and read the branch name.
3. Run `git fetch origin <branch>`.
4. Run `git worktree add <worktree> <branch>`, where `<worktree>` is
   `${XDG_DATA_HOME:-$HOME/.local/share}/agent-worktrees/<repository-name>/issue-<n>`.

Do all later work in that worktree. Keep its path out of durable records.

### Round ceiling

Each review phase gets 10 rounds without a question. In code review, fix every
reproduced finding of every severity before the next round. Reject a finding
only with evidence. Post that evidence as one issue comment whose first line is
`Rejected review findings, round <k>`.

A phase stalls when round 10 ends without a pass, when the same finding returns
after two different repairs, or when dispatch fails twice without a relevant
change. When round 10 ends on a code-review pass that still lists MEDIUM or LOW
findings, land, and list those findings in the run summary.

On a stall, commit and push current work to the linked branch first, when code
exists. Then ask once, with the options `Continue yolo` and `Leave plan
blocked`. Keep the status unchanged while you ask, because the helper does not
move a blocked plan back to `drafting` or `planned`. `Continue yolo` gives the
phase 10 more rounds. On `Leave plan blocked`, or without an answer, set the
status to `blocked` with the stall reason and report.

### Merge question

After checks pass, print the run summary that the `yolo` skill defines. Then ask
the question in Checks and merge. Each step after the landing merge needs its
own question.

### Published text

Before each issue, comment, commit, or pull request write, remove secrets,
tokens, credentials, private hostnames, environment values, and absolute machine
paths. Name a secret by its variable name, not its value. When the request would
make an undisclosed vulnerability, credential location, or other sensitive
finding public, stop before any write and report.
