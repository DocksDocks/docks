---
name: yolo
description: "Use when the user explicitly invokes yolo with a request and wants the whole plan lifecycle run without questions: issue, linked branch, codebase and web research, plan review, implementation with docks engineering skills, code review until pass, and a pull request, then one merge question with a run summary. Not for runs that need user checkpoints (use plan-manager), workspace setup (use plan-workspace), or production deploys, publishing, and releases."
user-invocable: true
disable-model-invocation: true
metadata:
  pattern: pipeline
  updated: "2026-10-23"
  content_hash: "f5441d1460626cad3f626630927cf160a321696c3aaba551d753e440a839b3d8"
---

# Yolo

Run one user request through the whole plan lifecycle without questions. The
user invokes this skill, and that invocation answers every routine lifecycle
question before the merge. Ask the user once, after the pull request exists.

Read these files from this skill's directory before you start. They are in the
same installed `plan-lifecycle` plugin:

- `../plan-manager/SKILL.md` owns the six phases.
- `../plan-manager/references/plan-contract.md` owns the rules. Its Yolo runs
  section replaces the contract questions for this run.
- `../plan-manager/references/github-issue-publication.md` owns the preflight.

Run the helper `../plan-manager/scripts/plan.mjs` from the target repository
root. If these files are missing, stop and name the missing `plan-lifecycle`
plugin.

<constraint>
Start only when the user's own message invokes yolo: `/plan-lifecycle:yolo`,
`/skill:yolo`, `$yolo`, or a sentence that names the yolo skill. Otherwise stop
and use `plan-manager`. Do not call `ask` before the merge question. The only
exception is the stalled-review question in the contract's Yolo runs section.
After the merge, each production cleanup in the contract's Teardown needs its
own question. Resolve every unknown from the codebase, current official
documentation on the web, or a throwaway experiment.
</constraint>

<constraint>
Do not access production, deploy to production, publish, or release before the
merge. Do not force-push or rewrite history. Do not stash, move, commit, or
delete work that the user made. Do not merge without a fresh `Merge now` answer.
Do not run a production cleanup without its own question. This invocation does
not answer it.
Before each issue, comment, commit, or pull request write, remove secrets,
tokens, credentials, private hostnames, environment values, and absolute machine
paths. Name a secret by its variable name, not its value. The repository can be
public, so treat every published word as public.
</constraint>

<constraint>
Deliver the most durable solution to the goal behind the request. Fix the root
cause, move every caller, and remove obsolete paths. Do not use a temporary
workaround. Do not reduce scope without a record. When the request has a flaw,
record a correction, do the durable alternative, and continue. A flaw is a
wrong premise, a conflict with the repository, a security risk, or a weak
practice.
</constraint>

## Run order

| Phase | Yolo action | Done when |
|---|---|---|
| Decide | Apply Existing plans and incomplete requests below. Otherwise the path is a new plan with Mode `plan-and-implement`. Ask nothing. | The run adopted a plan, or the goal fits in one sentence |
| Draft | Skip when the run adopted a plan. Run the preflight, create the issue, and set up the linked branch | The run adopted a plan, or `show <n>` reads drafting and the branch is listed |
| Research | Follow Research and Engineering standards below | `status <n> planned` succeeds, or `show <n>` of an adopted plan already reads planned or ongoing. No advice needs a decision |
| Plan review | Run Review loops below | `show <n>` reads `plan=pass` |
| Implement | Follow plan-manager phase 5, Engineering standards (always with `code-clarity`), Red baseline, and Commits below | Verification Results hold real results, and the candidate is committed |
| Code review | Run Review loops below | `show <n>` reads `code=pass` |
| Land | Follow Landing below | The merge question has an answer, or no answer is possible |

## Existing plans and incomplete requests

Before Draft, run `list` and `gh pr list --repo <owner/repo> --state open`.

- When the request names an open plan issue, or an open pull request that
  closes one, adopt that plan. Do not run `new`.
- When the request text is incomplete, act on the one reading that the
  repository state supports, such as the only open plan. Record that reading as
  a request correction. When no reading or more than one reading has support,
  stop before any write and report the readings.
- Otherwise go to Draft.

To adopt a plan:

1. Run `show <n>`. Adopt only an open plan. When the helper reports that
   another login owns the plan, stop and report.
2. Export the plan. Add the delegation line to Goal when it is missing, and set
   `Mode: plan-and-implement`.
3. Replace each Goal or Do not touch line that conflicts with this run, such as
   "leave the pull request open". Record a request correction whose `Asked:`
   part quotes the old line.
4. When steps 2 or 3 changed the export, publish it with `edit`. A Goal change
   after `plan=pass` needs a new plan-review round.
5. Reuse the branch that `gh issue develop <n> --list` shows, or the head branch
   of the open pull request. When neither exists, use the contract's Linked
   branch steps.
6. Continue at the first Run order phase whose Done when is not met.

## Draft

1. Run the publication preflight. If it fails, stop and create nothing.
2. If the request would make an undisclosed vulnerability, credential location,
   or other sensitive finding public, stop before any write. Report that a yolo
   run never publishes sensitive findings. Suggest `plan-manager`.
3. Write the goal: outcome, scope, and this exact delegation line.

```text
Yolo: the user delegated every decision except the merge to the agent.
```

4. Create the issue with `new --title <t> --goal <g> --mode plan-and-implement`.
5. Set up the linked branch now, as the contract's Yolo runs section says.

## Research

Answer each open question in this order. Stop at the first step that settles it.

1. Codebase: read callers, tests, configuration, and local instructions. Use
   language server references before you change an exported symbol.
2. Web: read current official documentation, release notes, specifications, or
   upstream issues. Do this for every claim about a library, framework, API,
   tool, standard, or version. Record each URL.
3. Experiment: when sources disagree or say nothing, test the behavior in the
   scratch directory `$(git rev-parse --git-path docks-review)/yolo-<n>/`.
   Record the command and its output. Write the scratch expression, not its
   absolute path.

Record each decision in Research: the decision, its evidence, and the rejected
options. A repository fact needs no web source. Every other claim needs one.

Record each request correction under `### Request corrections` in Research:

```text
Asked: <what the request said>. Did: <what the run does>. Reason: <evidence>.
```

Read the instruction files that apply to each path in the Files cells:
`AGENTS.md`, `CLAUDE.md`, and `CONTRIBUTING.md` in that folder and its parent
folders. Add one Acceptance row for each check that they require for the change.

Decide whether code review round 1 is a `panel` round, as the contract's
Code-review rounds says. When the change is high risk, record that in Research
with its reason; otherwise round 1 is a `full` round.

## Engineering standards

Load each matching docks skill when the runtime has it. A runtime can show it as
`docks:<name>` or as `<name>`. Read each matching skill during Research, before
you write Steps. Under `### Engineering standards` in Research, record which
skill each step applies. When a standard defines completion, put it in that
step's `Done when`. Apply each step's skills again while you implement that
step. Run the `code-review` self-review during code review round 1, as Review
loops says.

Apply `code-clarity` to every step that changes code, tests, comments, or error
messages, together with the other matching skills. Record it for each such
step, and check its rules again in the self-review.

| Work in a step | docks skill |
|---|---|
| New behavior specified by inputs and outputs | `tdd-workflow` |
| Tests for code that already exists | `test-coverage` |
| A bug, regression, or review finding | `fix-workflow` |
| Module, class, or service boundaries | `solid` |
| Every change to code, tests, comments, or error messages | `code-clarity` |
| Identifier types, input parsing, tagged unions | `type-safety-discipline` |
| A linter or type-checker error | `lint-no-suppressions` |
| Lint rules or repeated literal values | `code-guardrails` |
| Dependency upgrades or advisories | `dep-vuln-workflow` |
| Commits | `commit-discipline` |
| React components | `react-component-patterns` |
| Colors, tokens, and themes | `design-tokenization` |
| Keyboard, focus, and ARIA | `accessibility` |
| Visual polish and motion | `make-interfaces-feel-better` |
| Self-review during code review round 1 | `code-review` |

Do not start `security`, `refactor`, or `skill-agent-pipeline`. Each one opens
its own plan. Put that work into the Steps of this plan.

When docks is not installed, apply these rules:

- Write a test only for behavior that a consumer sees: results, boundaries,
  errors, and transitions.
- Do not test wiring, copies, forwarding, mock echoes, or source text. Do not
  add a second test for the same path.
- Fix each lint or type error. Do not add a suppression comment.
- Reuse the pattern that the repository has. Do not add a second convention.
- Leave no dead code, compatibility alias, or shim.
- Name things with domain words. Write comments that give the reason, not the
  mechanics. Make each error name the failed operation, its subject, and the
  recovery.

## Red baseline

The main context owns the red baseline of each `tdd-workflow` step. A subagent
can write the spec tests.

1. Write the spec tests before the production code of the step.
2. Run them. Each new test must fail because the behavior is missing: on an
   assertion, or on an export or symbol that this step adds. A failure from any
   other import, setup, or syntax error is not a red baseline. Do not add an
   empty stub to change a missing export into an assertion failure.
3. Stage the spec tests with `git add`. Add this line to Verification Results:
   `Red baseline, step <id>: <command>: <k> failed, <m> passed`. When a missing
   export stops a test file, write `<file> failed: missing <symbol>` instead of
   the counts for that file.
4. Keep the staged spec tests unchanged while you write production code:
   `git diff -- <spec files>` prints nothing. When a spec test is wrong, record
   the reason in Verification Results, fix the test, and run the baseline again.
   This record replaces the user escalation that `tdd-workflow` asks for.
5. A review fix that changes a spec assertion follows item 4. Run the changed
   test against the code before the fix. It must fail on the changed assertion.
   Add this line to Verification Results:
   `Red baseline, step <id>, review round <r>: <command>: <k> failed, <m> passed`.

## Commits

1. Commit each step on the linked branch when its proof passes, as
   `commit-discipline` says. Each commit must pass the focused tests, the type
   check, and the lint for its files.
2. When you split finished work into commits, check each commit in a temporary
   worktree: `git worktree add --detach <path> <sha>`, run the checks, then
   `git worktree remove -- <path>` and `git worktree prune`. `<path>` is
   `${XDG_DATA_HOME:-$HOME/.local/share}/agent-worktrees/<repository-name>/check-<short-sha>`.
   Do not put it under `/tmp` or inside `.git`.
3. Commit the candidate before each code-review round, as the contract's
   Code-review rounds says. Leave no staged, unstaged, or untracked change of
   the candidate.
4. Add each review fix as a new commit. Do not amend, squash, or rebase.
5. The reviewed head is `HEAD` after the last passing code-review round.

## Checks that fail outside the goal

When a required check fails on files that the plan does not change:

1. Run `git fetch origin <default>`. Then run the same check on
   `origin/<default>` in a temporary worktree, as Commits item 2 says.
2. When it fails the same way there, it is a baseline failure. Record the
   command, the failing files, and the default-branch result in Verification
   Results. Do not fix it unless the Goal covers it.
3. When it passes there, this change causes the failure. Fix it in this plan.

## Review loops

Use the contract's review loop with its Yolo runs ceiling. Dispatch the
`plan-reviewer` and `code-reviewer` wrappers with fresh input in each round. If
a wrapper is missing, dispatch a fresh read-only agent with the matching
instructions. Post one comment per round, as the contract's review loop says.
That comment counts as one round of the ceiling.

Dispatch code review round 1 first. While it runs, run the `code-review`
self-review with `code-clarity` on the full candidate diff. Post its findings
as one issue comment whose first line is `Self-review`; write `No findings.`
when it finds nothing. The helper does not read that comment as a review.

After round 1 returns, fix the self-review findings together with the findings
of round 1. Use `fix-workflow`, and commit the fixes. When a finding names a
defect class, fix every instance, as the contract's Code-review rounds says.
When the self-review found anything, review again, also when round 1 passed.
That round is a `delta` round when the contract's Code-review rounds allows it.

While any round runs, do the work that does not depend on its verdict, such as
the acceptance records and the run summary draft.

After `plan=pass`, an `edit` that changes Goal, Research, Steps, Acceptance, or
Do not touch needs a new plan-review round before code that depends on it. The
helper prints advice for that case.

| Verdict | Yolo action |
|---|---|
| Plan `repair` | Reproduce each finding, repair a fresh export, and review again |
| Plan `blocked` | Decide the finding with Research, record the decision, and review again |
| Code `fixes-required` | Fix each reproduced finding, rerun its proof, and review again |
| Code `pass` with MEDIUM or LOW findings | Fix each reproduced finding and review again, as a `delta` round when the contract's Code-review rounds allows it |
| Code `pass` with no open finding | Go to Landing |

Reject a finding only with evidence, posted as the contract's review loop says.
Before you repair the same finding again, research it again and try a different
approach.

When a review phase stalls at the ceiling and the answer is `Leave plan
blocked`, or no answer is possible, run the contract's Teardown for an exit
without a merge. The contract's Round ceiling also says this.

## Landing

1. Confirm that `git status --porcelain` prints nothing. The reviewed head is
   `HEAD`.
2. Fetch the default branch. If it is not an ancestor of `HEAD`, merge
   `origin/<default>` into the linked branch. Do not rebase. Rerun acceptance,
   and run a code-review round on the result. Commit each repair.
3. Push the linked branch with a normal push.
4. Write the run summary from `references/run-summary.md` to a file in the
   review scratch directory. The run summary is the whole pull request
   description; do not add the `commit-discipline` description sections. Write
   `pending` for the pull request URL and the checks. Include Kept resources,
   as the template says. End the file with `Closes #<n>` on its own line.
5. When `gh pr list --repo <owner/repo> --head <branch> --state open` shows a
   pull request, update its body with `gh pr edit <pr> --repo <owner/repo>
   --body-file <file>`. Otherwise open the pull request with `gh pr create
   --repo <owner/repo> --base <default> --head <branch> --title <title>
   --body-file <file>`.
6. Wait for checks as the contract says. If a check fails, fix it, rerun
   acceptance, review again, push, and wait again.
7. Confirm that `gh pr view <pr> --repo <owner/repo> --json headRefOid` shows
   the reviewed head. Write the pull request URL and the check result into the
   summary file. Then update the body with `gh pr edit <pr> --repo <owner/repo>
   --body-file <file>`.
8. Print the run summary. In the same response, ask one question:
   `Merge pull request #<pr> into <default>?`, with the options `Merge now` and
   `Leave pull request open`. The `Merge now` option states the teardown, as the
   contract's Checks and merge says, including `git branch -d <branch>`.
9. On `Merge now`, merge and archive as the contract says. Then run the
   contract's Teardown and report Kept resources. Ask separately before each
   plan step that runs after the merge and before each production cleanup.
10. On any other answer, or when no answer is possible, leave the pull request
    and the issue open. Run Teardown's exit without a merge. Report both links
    and Kept resources.
11. When the message that answers the merge question also starts a new yolo
    run, finish this run first. On `Merge now`, follow step 9. On any other
    answer, follow step 10. Then start the new run.

## Run summary

Use the template in [`references/run-summary.md`](references/run-summary.md).

## Recover after compaction

The issue is the run record. Run `show <n>` for the status and verdicts. Run
`gh issue develop <n> --list --repo <owner/repo>` for the branch. After the pull
request exists, GitHub lists no branch there. Then read the pull request number
from `gh issue view <n> --repo <owner/repo> --json closedByPullRequestsReferences`,
and read the branch from `gh pr view <pr> --repo <owner/repo> --json headRefName`.
Run `git worktree list` for a worktree. Count review rounds from issue comments,
as Review loops says. One round comment can hold several lens blocks. A
`Self-review` comment is not a review round.

## BAD / GOOD

```text
BAD: Ask the user which library to use during research.
GOOD: Read the official docs, test both in scratch, and record the decision with its URL.

BAD: Write the requested test that checks source text.
GOOD: Record a correction and test the behavior that a consumer sees.

BAD: Stop after code review round 5 and ask whether to continue.
GOOD: Continue to the Yolo runs ceiling, then ask the one stalled-review question.

BAD: Paste an error log that contains a token into the issue.
GOOD: Remove the token and name its variable.
```

## Report a problem with this skill

When this skill gives a wrong, outdated, or unsafe instruction, or a script that it ships fails, report the problem in the public DocksDocks/docks repository. Use the docks `report-skill-issue` skill for the report. If that skill is not installed, do not file anything: give the user a draft instead. The draft names this skill and its plugin version, quotes the instruction, and states what happened and what you expected. Leave out secrets and private names.
