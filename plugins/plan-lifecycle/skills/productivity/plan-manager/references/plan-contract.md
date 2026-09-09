# Plan contract v4
This is the canonical contract inside the installed `plan-lifecycle` plugin.
Agents use its three lifecycle skills and this reference. The helper normalizes
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

## Record and mode

A plan is a GitHub issue that records a goal, research, ordered work, and evidence.
The issue number identifies it. GitHub owns title, assignees, labels, timestamps,
and completion. Reviews live in comments. Do not track plan bodies in repository
files. Frozen `docs/plans/finished/` history is not lifecycle input.
Use direct implementation for one clear, reversible, low-risk local change with
one bounded acceptance path. It creates no plan issue, reviewer, or automatic commit.
Use a plan for explicit planning, multiple commits, cross-repository work, scheduling,
cold handoff, unresolved decisions, public-contract or cross-subsystem changes,
security-sensitive or destructive work, or a non-local effect.
Settle Mode with the user. `plan-and-implement` authorizes the full lifecycle.
`plan-only` stops after plan review. A defaulted Mode never authorizes implementation.
Routine issue publication and landing use the settled mode, outside the Steps table.
Solve the root cause with a durable solution. Complete the caller cutover.
Remove obsolete paths. Do not substitute a temporary workaround without user approval.
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
Persisted Effect values record intent, not permission. If `ask` is unavailable,
block the step and plan with a reason. Unknown tokens produce advice; they do
not authorize an effect. Finish dependencies before starting dependent work.

## Status, ownership, and frozen state

`new` creates `plan`, `plan:drafting`, `plan:planned`, `plan:ongoing`, and
`plan:blocked` idempotently with `gh label create --force`. Each plan carries
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
targets for terminal repair. Other closed plans do not permit step transitions.

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
lifecycle. Internal `plan-reviewer` reviews goal fit, research gaps, and security
risk. The two read-only wrappers are `plan-reviewer` and `code-reviewer`.

Use a fresh export for each plan review and a fresh diff for each code review.
Post each review block as one issue comment. Stop on pass. On no progress, a
surviving finding, or a round-5 non-pass, `ask` the user to continue or block.
Record user-only decisions in Open questions. Do not invent approval.

An eligible comment starts on its first non-blank line with plan review or code
review, without case sensitivity. Any heading level and suffix are allowed.
A later verdict line uses `plan-review:` or `code-review:`; a space can replace
the hyphen. Finding lines are free text.

| Verdict input | Plan result | Code result |
|---|---|---|
| `pass`, `ok`, `approved` | `pass` | `pass` |
| `repair`, `changes`, `fixes-required` | `repair` | `fixes-required` |
| `blocked` | `blocked` | `blocked` |

A code pass with a whole-word critical or high severity token in its finding
lines derives as fixes-required, without case sensitivity. Trust requires exactly
one issue assignee and a comment author login equal to that assignee. The latest
trusted eligible comment per kind wins, ordered by `createdAt`; API order breaks
ties. Missing trusted reviews derive as none. There is no body verdict fallback.

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
| `list [--status <s>]` | `<status>\t#<n>\t<title>`; open first, then closed, each in ascending number order |
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
literal pipe inside a table cell is written `\|`; a row that does not parse to
eight cells blocks every write so the row is never dropped.

Advice prints `advice: <text>` on stdout and exits 0. It covers absolute machine
paths, `_Not researched yet._` after drafting, defaulted Mode, unknown Effect or
Status, an unfinished dependency when a step moves to in-flight or done, and
every non-local Effect as an in-session permission reminder. Advice is not approval.

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
plan status is <status>; expected ongoing
archive requires finished status, found <status>
archive refused: non-terminal step <id>
archive refused: no Steps rows parsed
duplicate step id after normalization: <id>
Steps row <n> has <count> cells; expected 8. Escape a literal pipe as \| so the row is preserved.
archive requires Code-review: pass
archive requires a closing pull request merged into <nameWithOwner>:<branch>
retire requires a single-line --reason
cannot retire a <status> plan
blocked status requires --reason as single-line text
reserved label namespace: <label>
```

## Landing and archive proof

Before `gh issue develop --checkout`, require clean `git status --porcelain`.
Never stash, move, or commit ambient work. Block with dirty paths or use an authorized
clean worktree. After setting ongoing, reuse or create the linked branch. Every
`gh issue develop` call includes `--repo`; creation uses `--base <default> --checkout`.
Re-list after failure. Stop without a verified link.
After code review passes, commit and push reviewed bytes and open a closing pull request.
Apply repository checks policy and wait up to five minutes for checks to appear.
Ask afresh: `Merge now` or `Leave pull request open`. Without `Merge now`, leave both
records open. Merge with `--match-head-commit` for the reviewed head.
A prior plan approval never authorizes merge.
Archive requires finished status, terminal steps, and a trusted latest Code-review pass.
Its latest closure must be a merged pull request into this repository's default branch,
or a commit associated with such a merged pull request. Use `excludeUserLinked: true`.
A merely linked pull request, another repository, or a non-default target is not proof.
