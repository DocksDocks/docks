# Embedded v2 Template — `docs/PLAN.md`
Copy the fenced block verbatim to `docs/PLAN.md`; write `docs/AGENTS.md` as its routing node and `docs/CLAUDE.md` as the single line `@AGENTS.md`.

````markdown
# PLAN.md — plan record standard

The plan record is a GitHub issue: its body carries the `plan_contract: v2` frontmatter and the eight `##` sections, its `plan:<status>` label mirrors the frontmatter `status`, and no plan markdown is tracked in the repository.

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
GitHub issue #<number>   the plan record: title, body, labels, assignee
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

The label set is created idempotently with `gh label create --force`: `plan`, `plan:drafting`, `plan:planned`, `plan:ongoing`, `plan:blocked`, `plan:finished`, plus the triage label `plan-scheduled`. Exactly one `plan:<status>` label is present at a time, and it mirrors the frontmatter `status`.

GitHub enforces no exclusion between labels, so any actor can leave two
`plan:<status>` labels on one issue. Every status write therefore removes every
`plan:<status>` label present except the one it applies, in the same edit.

A `plan`-labelled issue is a record, not an invitation. Another agent that finds
one does not start implementing it; only the manager run that owns the plan moves
it.

Every plan issue carries `plan`. Topic labels such as `security`, `auth`, or
`cookies` are project-owned: name them on `plan.mjs labels --extra` to create
them and on `plan.mjs new --label` to attach them. The `plan` namespace is
reserved: both commands reject a value that is `plan` or begins `plan:`, because
`new --label plan:ongoing` would otherwise put two status labels on one issue at
birth. `plan-scheduled` sits outside the reserved `plan:` namespace precisely so it is
never parsed as a status: no lifecycle transition applies it, and a status write
leaves it in place.

## Frontmatter

A v2 plan uses exactly this closed frontmatter map, at the top of the issue body:

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

`status: blocked` adds exactly one key, `blocked_reason: <non-empty text>`. No other status carries it.

`created` and `updated` are double-quoted ISO timestamps that carry an explicit offset. `updated` never precedes `created`.

The CLI reports `check 1: frontmatter keys and plan_contract must match the closed v2 map` when this closed-map contract fails.

Every v2 plan declares `plan_contract: v2` in a closed frontmatter map and carries exactly these eight `##` sections, in this order, each present once: `## Goal`, `## Research`, `## Steps`, `## Acceptance`, `## Do not touch`, `## Open questions`, `## Review`, `## Verification Results`.

`## Goal` contains exactly one `Mode: plan-and-implement` or `Mode: plan-only` line.

Once the plan leaves `drafting`, `## Research` must no longer carry the template placeholder `_Not researched yet._`.

The CLI reports `check 11: Research must be filled once the plan leaves drafting` when this research rule fails.

The body contains no absolute machine path. A plan is a cold handoff, and a path from one machine is not portable.

## Plan tables

The Steps table uses this exact header:

```text
| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
```

`#` is the positive display number. `Id` matches `[a-z][a-z0-9_]{0,63}` and is unique. `Task`, `Files`, and `Done when` are non-empty. `Depends` is `—` or a comma-separated list of lower display numbers from the same table. `Effect` is exactly one of `local`, `probe`, `production_access`, `publish`, `push`, `release`, or `deploy`. `Status` is exactly one of `planned`, `in-flight`, `done`, `blocked`, or `skipped`; `done` and `skipped` are terminal. `Done when` names one observable proof and carries no "or STOP" clause. Step citations use `step:<id>` and resolve to a declared id.

No Steps `Files` cell names the plan's own issue reference. Writing lifecycle state into the record is the CLI's job, not an implementation step.

When a step cannot complete, first run `plan.mjs step <issue> <step-id> blocked`, then record the reason with `plan.mjs status <issue> blocked --reason <text>`.

The Acceptance table uses this exact header:

```text
| ID | Command | Expected |
|---|---|---|
```

Acceptance IDs are unique. `Command` and `Expected` are non-empty.

## Lifecycle transitions

The legal plan status transitions are:

```text
drafting  -> planned | ongoing | blocked
planned   -> drafting | ongoing | blocked
ongoing   -> finished | blocked
blocked   -> drafting | planned | ongoing
finished  -> (terminal, no transition)
```

The `planned -> drafting` transition returns a plan to drafting after substantive review repair.

An absent plan begins at `drafting`. A finished plan is a closed issue carrying `plan:finished`.

The single exemption is `plan.mjs retire`: it sets `finished` from any non-`finished` status, writes a final `## Retirement` section with the reason, closes the issue as not planned, and is the only path to `finished` without a passed code review.

## Lifecycle commands

`plan.mjs` is plugin payload, not project payload. It ships inside the installed `plan-lifecycle` plugin at `skills/productivity/plan-manager/scripts/plan.mjs`. A project never vendors, copies, or re-creates it, and an unresolvable tool means the plugin is not installed. Never report it as a file missing from the repository. Resolve it from the loaded `plan-manager` skill directory, or from the runtime plugin cache. Run it with the repository root as the working directory, because it resolves the target repository from that checkout's GitHub remote.

`plan.mjs archive` verifies the landing pull request with one `gh api graphql`
query against the plan issue's `closedByPullRequestsReferences` connection. The
query pages both a plain selection and a `userLinkedOnly: true` selection, and
accepts a reference only when all three hold: `mergedAt` is set, `baseRefName`
equals the default branch of the repository that pull request lives in, and the
reference is absent from the user-linked set.

Each condition answers a way the check can be fooled. The connection returns
merged pull requests even though its description reads "List of open pull requests
referenced from this issue", so merge state must be read from `mergedAt` rather
than assumed. A reference names its own repository, so a closing pull request may
live outside the plan's repository and must be compared against that
repository's default branch. The connection also includes manually linked pull
requests, so a hand-linked merge would otherwise satisfy a check that the
contract says belongs to a `Closes #<issue>` keyword. `userLinkedOnly` is used
rather than `excludeUserLinked` because only the former appears in the published
GraphQL schema.

| Command | Semantics |
|---|---|
| `plan.mjs labels [--extra <name>]…` | Create or update the closed plan label set with `gh label create --force`, plus any extra topic labels named on the command line. |
| `plan.mjs new --title <t> --goal <g> [--mode plan-and-implement\|plan-only] [--label <name>]…` | Create the plan issue from the v2 template body with `status: drafting`, labels `plan` and `plan:drafting`, and the creating login as the issue assignee. |
| `plan.mjs claim <issue>` | Take single-writer ownership of an existing plan: assign the acting login, stay idempotent when it already owns the plan, and refuse when another login does. |
| `plan.mjs show <issue> [--body]` | Print the one-line header strip. `--body` prints the record to stdout with nothing else, sending the header strip to stderr, and is the only way to obtain the record. |
| `plan.mjs export <issue>` | Write the issue body verbatim to `plan-<issue>.md` inside the scratch directory `git rev-parse --git-path docks-review` resolves, creating it mode 0700 when missing, and print the absolute path. |
| `plan.mjs edit <issue> --file <path>` | Validate the file as the plan record, refuse on any failed check, replace the issue body, and print the header strip and the changed lines. |
| `plan.mjs check <issue \| --file <path>>` | Run the 13 byte-level validations and print `plan check passed: #<issue>` or `plan check passed: <path>`. |
| `plan.mjs status <issue> <status> [--reason <text>]` | Validate and apply one lifecycle transition, then swap the `plan:<status>` label. |
| `plan.mjs step <issue> <step-id> <status>` | Rewrite one Steps `Status` cell after checking the plan state and dependencies. |
| `plan.mjs list [--status <s>]` | Print `<status>\t#<issue>\t<title>` for every issue labeled `plan`, open issues first. The filter accepts `drafting`, `planned`, `ongoing`, `blocked`, `finished`, or `unreadable`. |
| `plan.mjs next` | Print startable plans, using the queue when it is present and valid. |
| `plan.mjs archive <issue>` | Require an ongoing plan, terminal steps, a passed code review, and a keyword-linked pull request merged into its own repository's default branch; set `finished`, apply `plan:finished`, and close the issue. |
| `plan.mjs retire <issue> --reason <text>` | Record abandonment in `## Retirement`, set `finished`, apply `plan:finished`, and close the issue as not planned. |

Legal step transitions are `planned → in-flight | done | blocked | skipped`, `in-flight → done | blocked | skipped`, and `blocked → in-flight | done | skipped`.

An issue labeled `plan` whose body does not parse as a v2 record lists as `unreadable`. `plan.mjs` reads no markdown plan file, so a pre-GitHub record is never classified, parsed, or migrated by a command.

## Writing the record

A plan-issue write is a read-modify-write, and the GitHub API offers no precondition for it. Every mutating command re-reads the issue body immediately before the edit, refuses when it differs from the body it read, and re-reads after the edit to confirm the pushed bytes.

One writer owns a plan issue at a time, recorded in the issue's own GitHub
assignee field. That field is not the frontmatter `assignee` key, which stays
`null` for every v2 plan. `plan.mjs new` claims ownership at creation and
`plan.mjs claim <issue>` claims an existing plan, idempotent for the current
owner. Ownership is a precondition, not advice: every mutating command refuses a
plan owned by another login, writes nothing when it refuses, and claims an
unassigned plan in the same write. Read-only commands never check ownership, so a
reviewer reads a plan it does not own. Taking a plan from another owner is a
deliberate manual GitHub action; no lifecycle command transfers ownership and
there is no override flag. Ownership narrows the writer set to one;
compare-before-write narrows the remaining window but does not close it, because
the read and the edit are separate API calls.

A conflict is not an error to retry blindly: re-read the record, re-apply the
intent, and run `plan.mjs check <issue>` before continuing.

## Reading the record

Render a plan body verbatim only when the user names that plan and asks to see it. After a write, report the one-line header strip and the changed lines only; a write never re-renders the body.

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

A `pass` record has no finding lines. Every other verdict has at least one finding line.

A plan-review finding is exactly one of `goal_fit`, `research_gap`, or `security_risk`; nothing else is a finding. A sufficient plan passes.

## Phases

1. **Decide.** Phase 1 asks exactly one question with exactly three options, in this order and wording: `Plan and implement now`, `Plan only, stop at planned`, `Implement directly` — and skips the question only when the request already settles the mode.
2. **Draft.** Create the plan issue, write the goal and research hypothesis, and keep provisional Steps and Acceptance tables while status remains `drafting`.
3. **Research.** Verify repository facts and external claims, record their sources, choose the durable fix, bind the exact files, complete Acceptance, pass `plan.mjs check`, and set the plan `planned`.
4. **Plan review.** Dispatch exactly one pre-implementation review. Append its verdict and findings. Fix reproduced findings before implementation. A user-only decision goes in `## Open questions`. A plan-only run stops at `planned` after this review.
5. **Implement.** Set the plan `ongoing`, move each step through its legal states, and record real Acceptance output in `## Verification Results`.
6. **Code review.** Review the declared change, fix every critical and high finding, and review again only after such a fix. Archive only after a passed code review.

Build the review diff from what actually changed: `git status --porcelain` names the paths and the diff covers exactly those. Name every changed path that no Steps `Files` cell mentions in the review request, so the reviewer judges undeclared scope instead of the manager blocking on bookkeeping.

If a code-review round returns the same finding-id set as the previous round and no file changed between the two rounds, stop, append `Code-review: blocked` naming that set, and set the plan `blocked`.

A step whose `Effect` is not `local` requires an in-session `ask` confirmation immediately before it runs; when `ask` is unavailable the step is set `blocked` with `blocked_reason` naming the unconfirmed effect.

This lifecycle creates zero commits and never pushes.

## Landing

Work lands through a pull request whose body carries `Closes #<issue>` and whose base is the repository default branch, because GitHub interprets a closing keyword only in a pull request that targets the default branch. `plan.mjs archive` verifies that merged pull request rather than performing the merge.

Only the pull request that lands the completed work carries `Closes #<issue>`. A
partial pull request carries a plain `Refs #<issue>` instead, because GitHub
closes the issue as soon as the first pull request carrying a closing keyword
merges into the default branch.

Landing sits outside the six phases. This lifecycle creates zero commits and
never pushes, so the branch, the commits, the push, the pull request, and the
merge are the user's to run, on request, under `docks:commit-discipline`. No
Steps row exists for them, and `archive` reads the result rather than causing
it. A plan that never lands is retired, not archived.

## Portability

Cite repository-relative paths only; acceptance rows run from the repository root and carry no `cd <absolute path>` prefix. A cross-repository reference names the other repository by its portable identifier, such as `DocksDocks/docks`, never a local checkout path. A cross-repository closing keyword is written `OWNER/REPO#<issue>`.

## Queue

`docs/PLAN-QUEUE.md` is optional and classification-neutral. Its table is `| Stage | Plan | Depends on | Why |`, with `Plan` holding the issue number. A row is eligible only when its full direct and transitive dependency closure is finished. Stages give deterministic priority. The queue is a discovery and prioritization view only and grants no lifecycle, review, mutation, or external-effect authority. A workspace without it stays valid.

A `Plan` cell that is not a positive issue number names a frozen pre-GitHub
record. Such a row, and any row depending on it, is skipped rather than treated
as a malformed queue.
````
