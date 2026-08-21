# PLAN.md — plan record standard

The plan record is a GitHub issue. Its body carries the v3 byte contract and the
human-authored plan, while GitHub fields carry the machine state GitHub already
owns. No plan markdown is tracked in the repository.

Use direct implementation for one clear, reversible, low-risk local diff with one
bounded acceptance path; it creates no plan issue, reviewer, or automatic
commit. Use a canonical plan for explicit planning, multi-commit or
cross-repository work, cold handoff, an unresolved decision, a cross-subsystem or
public-contract change, security-sensitive or destructive work, or any
non-`local` effect.

## Skill routing

| Request | Owner |
|---|---|
| Maintain, bootstrap, migrate, audit, or explicitly refresh the workspace | `plan-workspace` |
| Run the six phases and archive the plan | main-context `plan-manager` |
| Return a readable pre-implementation verdict | internal `plan-reviewer` |

The two read-only wrappers are `plan-reviewer` and `code-reviewer`. Main context invokes `plan-manager` directly. A missing wrapper never creates another role. Dispatch one fresh read-only subagent with the same three-kind contract.

## Where the record lives

```text
GitHub issue #<number>   the plan record: title, body, labels, assignee, state
GitHub timestamps        the record's creation and last-update times
docs/PLAN.md             this standard
docs/PLAN-QUEUE.md       optional discovery and priority view
docs/plans/finished/     frozen pre-GitHub history, read-only, never parsed
```

The issue number is the plan identity. There is no slug, no plan path, and no
tracked plan file. `docs/plans/finished/` holds records written before the
lifecycle moved to issues; it is history, never a source of truth, and no
command reads it.

This backend is a deliberate trade. An issue body has no reviewable diff, no
`git blame`, no CODEOWNERS, and no presubmit validation, which is why large
open-source projects keep long design records in tracked files. The plan record
accepts that loss because the reviewed artifact here is the pull request diff,
and the plan issue is the tracker that points at it.

## Labels

The exact closed lifecycle label set is created idempotently with `gh label create --force`: `plan`, `plan:drafting`, `plan:planned`, `plan:ongoing`, and `plan:blocked`. The four open-work statuses are exactly `drafting`, `planned`, `ongoing`, and `blocked`; `finished` is not a writable status. The retired names `plan:finished` and `plan-scheduled` are deleted and are not created, parsed, or applied.

Every plan issue carries `plan`. Every open plan normally carries exactly one
phase label. GitHub enforces no exclusion between labels, so every status write
removes all phase labels present except the one it applies. An open issue with
no phase label derives `unlabelled` rather than guessing a status.

Phase labels describe open work only. Every read of a closed issue ignores all phase labels and derives completion from `stateReason`. `plan.mjs status` refuses a closed issue with a message containing `is closed; status applies to open plans`. `plan.mjs archive` and `plan.mjs retire` strip every phase label that a closing merge or earlier edit left behind.

A `plan`-labelled issue is a record, not an invitation. Another agent that finds
one does not start implementing it; only the manager run that owns the plan moves
it.

Topic labels such as `security`, `auth`, or `cookies` are project-owned: name
them on `plan.mjs labels --extra` to create them and on `plan.mjs new --label`
to attach them. The `plan` namespace is reserved: both commands reject `plan`
and every value beginning `plan:` so a caller cannot forge lifecycle state.

## Body contract

A v3 issue body starts with the exact line `<!-- plan-contract: v3 -->`, followed
by one blank line. The marker travels with the bytes whose format it identifies.
It is not a label: a triage-capable actor can delete a label independently, and
a body must not become unreadable because its separately stored version was
removed. Labels carry lifecycle classification, not body-format identity.

After the marker, the body contains exactly these eight `##` sections, once each and in this order: `## Goal`, `## Research`, `## Steps`, `## Acceptance`, `## Do not touch`, `## Open questions`, `## Review`, `## Verification Results`.

A v3 body has no frontmatter and contains no `---` fence anywhere. These keys are
retired and never live fields in a v3 record: `plan_contract`, `title`, `goal`,
`status`, `created`, `updated`, `assignee`, and `blocked_reason`.

`## Goal` still contains exactly one `Mode: plan-and-implement` or `Mode: plan-only` line. Mode stays in the body because GitHub has no field that owns this plan-specific choice. Once an open plan leaves `drafting`, `## Research` must no longer carry the template placeholder `_Not researched yet._`.

A blocked plan carries its reason as the first content line of `## Open questions`.
Spell it `Blocked: <one-line text>`. Only a blocked plan may open that section
with `Blocked:`. No other body field stores the reason.

The body contains no absolute machine path. A plan is a cold handoff, and a path
from one machine is not portable.

Contract classification is byte-driven and deliberately does not guess:

| Body evidence | Classification | Handling |
|---|---|---|
| First line is exactly `<!-- plan-contract: v3 -->`, followed by one blank line | record | Parsed as the current contract |
| Anything else | unreadable | Refused; no parser is attempted |

## GitHub-owned fields

The issue title owns the plan title. The one `plan:<phase>` label on an open
issue owns its status. The issue assignee owns the single-writer owner.
`createdAt` and `updatedAt` own the timestamps. The issue `state` together with
`stateReason` owns completion. The body does not duplicate any of those values.

One writer owns a plan issue at a time. `plan.mjs new` assigns the creating
login, and `plan.mjs claim <issue>` claims an unassigned plan or stays idempotent
for its current owner. Every mutating command refuses a plan assigned to another
login. Read-only commands never check ownership. Taking a plan from another
owner is a deliberate manual GitHub action; no lifecycle command transfers
ownership and there is no override flag.

## Plan tables

The Steps table uses this exact header:

```text
| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
```

`#` is the positive display number. `Id` matches `[a-z][a-z0-9_]{0,63}` and is unique. `Task`, `Files`, and `Done when` are non-empty. `Depends` is `—` or a comma-separated list of lower display numbers from the same table. `Effect` is exactly one of `local`, `probe`, `production_access`, `publish`, `push`, `release`, or `deploy`. `Status` is exactly one of `planned`, `in-flight`, `done`, `blocked`, or `skipped`; `done` and `skipped` are terminal. `Done when` names one observable proof and carries no "or STOP" clause. Step citations use `step:<id>` and resolve to a declared id.

Every Steps row must be terminal before the closing pull request merges. Once
that merge closes the issue as completed, the derived state is `finished` and
step mutation is no longer legal. Post-merge work belongs to a named follow-up
plan.

No Steps `Files` cell names the plan's own issue reference. Writing lifecycle
state into the record is the CLI's job, not an implementation step.

When a step cannot complete, first run `plan.mjs step <issue> <step-id> blocked`, then record the reason with `plan.mjs status <issue> blocked --reason <text>`; the latter writes `Blocked: <one-line text>` as the first content line of `## Open questions` and applies `plan:blocked`.

The Acceptance table uses this exact header:

```text
| ID | Command | Expected |
|---|---|---|
```

Acceptance IDs are unique. `Command` and `Expected` are non-empty.

## Derived state and transitions

State is derived by this closed truth table:

| Issue state | Phase label / state reason | Derived status |
|---|---|---|
| `OPEN` | exactly one phase label | that phase: `drafting`, `planned`, `ongoing`, or `blocked` |
| `OPEN` | no phase label | `unlabelled` |
| `CLOSED` | `COMPLETED` | `finished` |
| `CLOSED` | `NOT_PLANNED` | `retired` |
| `CLOSED` | `DUPLICATE` | `duplicate` |

A closed issue's phase labels are absent for derivation even when GitHub still
returns them. Reopening returns the issue to `OPEN`; its status is again derived
only from the phase labels then present.

Phase lives in the labels, so a body alone carries no phase. `check <issue>`
enforces every rule. `check --file <path>` enforces only the rules that read the
body: it skips the phase-label rule, both `Blocked:` rules, and the filled-Research
rule instead of assuming a phase.

The legal open-status transitions are:

```text
drafting  -> planned | ongoing | blocked
planned   -> drafting | ongoing | blocked
ongoing   -> blocked
blocked   -> drafting | planned | ongoing
```

The `planned -> drafting` transition returns a plan to drafting after
substantive review repair. Completion and retirement are issue closure results,
not status transitions. `plan.mjs archive` does not close the issue;
`plan.mjs retire` closes it as not planned.

## Lifecycle commands

`plan.mjs` is plugin payload, not project payload. It ships inside the installed
`plan-lifecycle` plugin at
`skills/productivity/plan-manager/scripts/plan.mjs`. A project never vendors,
copies, or re-creates it, and an unresolvable tool means the plugin is not
installed. Never report it as a file missing from the repository. Resolve it
from the loaded `plan-manager` skill directory, or from the runtime plugin
cache. Run it with the repository root as the working directory, because it
resolves the target repository from that checkout's GitHub remote.

| Command | Semantics |
|---|---|
| `plan.mjs labels [--extra <name>]…` | Create or update the exact five-label lifecycle set with `gh label create --force`, plus any extra topic labels named on the command line. |
| `plan.mjs new --title <t> --goal <g> [--mode plan-and-implement\|plan-only] [--label <name>]…` | Create a v3 issue whose body starts with the marker, with labels `plan` and `plan:drafting`, and assign the creating login. |
| `plan.mjs claim <issue>` | Take single-writer ownership of an existing plan: assign the acting login, stay idempotent when it already owns the plan, and refuse when another login does. |
| `plan.mjs show <issue> [--body]` | Print the one-line header strip. `--body` prints the record to stdout with nothing else, sending the header strip to stderr, and is the only way to obtain the record. |
| `plan.mjs export <issue>` | Write the issue body verbatim to `plan-<issue>.md` inside the scratch directory `git rev-parse --git-path docks-review` resolves, creating it mode 0700 when missing, and print the absolute path. |
| `plan.mjs edit <issue> --file <path>` | Validate the file as the plan record, refuse on any failed check, replace the issue body, and print the header strip and the changed lines. |
| `plan.mjs check <issue \| --file <path>>` | Validate a v3 record and print the pass result. |
| `plan.mjs status <issue> <status> [--reason <text>]` | Validate and apply one open-status transition, then replace all phase labels with the target phase label. Refuse closed issues. |
| `plan.mjs step <issue> <step-id> <status>` | Rewrite one Steps `Status` cell after checking the plan state and dependencies. |
| `plan.mjs list [--status <s>]` | Print `<status>\t#<issue>\t<title>` for every issue labelled `plan`, deriving `unlabelled`, `finished`, `retired`, and `duplicate` rather than reading them from the body. |
| `plan.mjs next` | Print startable open plans, using the queue when it is present and valid. |
| `plan.mjs archive <issue>` | Verify terminal steps, passed code review, completed closure, and an eligible merged closing pull request; strip stale phase labels and write no status. |
| `plan.mjs retire <issue> --reason <text>` | Close the issue as not planned and strip all phase labels; completion derives as `retired`. |

Legal step transitions are `planned → in-flight | done | blocked | skipped`, `in-flight → done | blocked | skipped`, and `blocked → in-flight | done | skipped`.

## Archive verification

`plan.mjs archive` is a verifier, not a writer of lifecycle state. It requires
all Steps rows to be terminal (`done` or `skipped`), a line matching exactly
`Code-review: pass` in `## Review`, and an issue already closed as completed by
an eligible merged pull request. It writes no status. On success it removes any
stale phase label and prints `plan #<n> finished (closed by <url>)`. The pass
line may carry advisory `MEDIUM` and `LOW` finding lines beneath it; only an
unfixed `CRITICAL` or `HIGH` keeps a plan from archiving.

The verifier reads the issue's `closedByPullRequestsReferences` with
`excludeUserLinked: true`. It accepts only keyword-linked merged pull requests.
A manually linked pull request never proves a landing.

Either proof suffices, and the verifier tries them in one order. It first looks
for an eligible keyword closer. Only when that connection holds none does it
examine the latest closure. A commit closer supplies its `associatedPullRequests`.
Any other latest closer supplies no commit fallback proof. An ineligible keyword
reference, such as one still open, therefore never hides a valid commit proof.
The verifier accepts only merged pull requests whose base matches that
repository's default branch.

Earlier closure events do not count. An issue closed by a commit, reopened, then
closed by hand has no commit proof. A commit pushed straight to the default
branch has no associated merged pull request. Archive refuses both cases.
It never performs the merge or closes the issue.

## Writing the record

A plan-issue write is a read-modify-write, and the GitHub API offers no
precondition for it. Every mutating command re-reads the issue body immediately
before the edit, refuses when it differs from the body it read, and re-reads
after the edit to confirm the pushed bytes.

Ownership narrows the writer set to one; compare-before-write narrows the
remaining window but does not close it, because the read and the edit are
separate API calls. A conflict is not an error to retry blindly: re-read the
record, re-apply the intent, and run `plan.mjs check <issue>` before continuing.

An export copy is a snapshot of one body revision, not a live view. The `step`
and `edit` commands rewrite body bytes. A status change also rewrites body bytes
when it adds or clears the blocked reason. These body writes supersede every
existing export.

`plan.mjs edit` requires the export digest in `<file>.origin` for every body
edit. It refuses a missing digest, an unreadable digest, or a digest for a
superseded body. These refusals prevent stale or unverified copies from
replacing recorded state.

After validation, `edit` refreshes the digest before it writes the remote body.
A local digest failure fails closed before the remote write and requires one
re-export. The `claim`, `archive`, and `retire` commands do not rewrite body
bytes. A successful phase-only status change writes labels only and leaves the
body and digest valid. The guard compares body bytes, not the issue timestamp.

Re-export immediately before every body edit. Edit the export. Run
`plan.mjs check <issue>`. Delete the export and its `.origin` sidecar. Never
carry an edit across an intervening body write.

## Reading the record

Render a plan body verbatim only when the user names that plan and asks to see
it. After a write, report the one-line header strip and the changed lines only;
a write never re-renders the body.

A read-only reviewer never fetches the record. Before dispatch the manager runs
`plan.mjs export <issue>` and passes the issue number together with the printed
absolute path; a reviewer opens exactly that path and never a hardcoded one,
because the scratch directory is `.git/docks-review/` in a plain clone and a
worktree-private directory in a linked worktree. The export is scratch: never
tracked and never the record. The manager may edit its own export as the staging
file for a body write; a reviewer never edits it. Every dispatch re-exports
first, so a reviewer always reads the current record rather than a half-staged
edit.

The header strip is one line: `#<issue> · <status> · <title> · <url>`.

## Review records

Append review records to `## Review` in these readable shapes:

```markdown
### Plan review — <date>
Plan-review: pass|repair|blocked
- [goal_fit] `## Steps` row 4 — the step removes the validator without replacing it — add the replacement before removal

### Code review round <n> — <date>
Code-review: pass|fixes-required|blocked
- HIGH · Security · plugins/x/y.mjs:41 — user input reaches a shell command unquoted — pass an argument array
```

A code-review `pass` means no `CRITICAL` or `HIGH` finding stands unfixed; it
carries only advisory `MEDIUM` and `LOW` lines, or none. Record each advisory as
a follow-up and do not change reviewed bytes after a pass; an advisory never
triggers a re-review.
`fixes-required` names at least one evidenced `CRITICAL` or `HIGH` defect and
forces exactly one repair re-review;
if that re-review still returns `fixes-required`, the manager appends
`Code-review: blocked` and sets the plan `blocked`. A `blocked` verdict has at
least one finding line. A plan-review finding is exactly one of `goal_fit`,
`research_gap`, or `security_risk`; nothing else is a finding. A sufficient plan
passes.

## Phases

1. **Decide.** Phase 1 asks exactly one question with exactly three options, in this order and wording: `Plan and implement now`, `Plan only, stop at planned`, `Implement directly` — and skips the question only when the request already settles the mode.
2. **Draft.** Create the plan issue, write the goal and research hypothesis, and keep provisional Steps and Acceptance tables while status remains `drafting`.
3. **Research.** Verify repository facts and external claims, record their sources, choose the durable fix, bind the exact files, complete Acceptance, pass `plan.mjs check`, and set the plan `planned`.
4. **Plan review.** Dispatch exactly one pre-implementation review. Append its verdict and findings. Fix reproduced findings before implementation. A user-only decision goes in `## Open questions`. A plan-only run stops at `planned` after this review.
5. **Implement.** Set the plan `ongoing`, move each step through its legal states, and record real Acceptance output in `## Verification Results` before the closing merge.
6. **Code review.** Review the declared change, fix every critical and high finding, and run exactly one repair re-review after such a fix; if that re-review still returns fixes-required, append `Code-review: blocked` and set the plan `blocked`. Every step must be terminal and code review must pass before the closing merge; archive verifies those facts afterward.

Build the review diff from the complete candidate pull request, not only the
dirty worktree. Resolve and fetch the repository default branch, then compute
`<merge-base>` with `git merge-base <default-remote-ref> HEAD`. Cover one net
tracked candidate with `git diff <merge-base> -- <changed paths>`. Add one
`git diff --no-index /dev/null <path>` hunk for each untracked path.
`git status --porcelain` still names dirty paths. Name every changed path that
no Steps `Files` cell mentions in the review request.

After pull-request creation, record `headRefOid` and compare the changed paths
and hunks from `gh pr diff` with the reviewed net candidate. Any mismatch
invalidates the pass and blocks merge.

If that repair re-review again returns `fixes-required`, stop: append
`Code-review: blocked` naming the surviving findings, and set the plan
`blocked`.

A step whose `Effect` is not `local` requires an in-session `ask` confirmation
immediately before it runs; when `ask` is unavailable the step is set `blocked`
and `Blocked: <unconfirmed effect>` is recorded first in `## Open questions`.

Routine plan issue publication is authorized by the settled mode and needs no
repeated repository picker.

## Landing

Work lands through a pull request whose body carries `Closes #<issue>` and whose
base is the repository default branch.

After `Code-review: pass`, the manager runs landing without another prompt:
ensure a non-default branch, commit exactly the reviewed bytes under
`docks:commit-discipline`, push normally, and create or update one pull request
that carries `Closes #<issue>` and targets the repository default branch.

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
merged result rather than causing it. A plan that never lands is retired, not
archived.

## Portability

Cite repository-relative paths only; acceptance rows run from the repository root and carry no `cd <absolute path>` prefix. A cross-repository reference names the other repository by its portable identifier, such as `DocksDocks/docks`, never a local checkout path. A cross-repository closing keyword is written `OWNER/REPO#<issue>`.

## Queue

`docs/PLAN-QUEUE.md` is optional and classification-neutral. Its table is `| Stage | Plan | Depends on | Why |`, with `Plan` holding the issue number. A row is eligible only when its full direct and transitive dependency closure is finished. Stages give deterministic priority. The queue is a discovery and prioritization view only and grants no lifecycle, review, mutation, or external-effect authority. A workspace without it stays valid.

A `Plan` cell that is not a positive issue number names a frozen pre-GitHub
record. Such a row, and any row depending on it, is skipped rather than treated
as a malformed queue.
