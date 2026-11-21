<!-- plan-contract: v3 -->

## Goal

Make plan.mjs prove each GitHub write that it reports, finish a half-done `retire` on a plain rerun, refuse bad `new` input before the issue exists, refuse every absolute machine path in `check`, and validate each record before `status`, `step`, and `claim` write it. Cover each change with behavioral tests. Keep this work apart from the workflow wording of plan #22.

User request (in session, 2026-08-24): "Harden plan.mjs. Confirm every assignee and label write after it lands, make a failed retire recoverable by running it again, reject bad new input such as an over-long title or a blank goal before anything is created, detect every absolute machine path, run the full validation before every mutating write, and cover each fix with tests. Keep it out of the workflow wording of plan #22."

Outcomes:

- `new` and `claim` exit 1 unless a read after the write shows the acting login as the sole assignee. `new` also requires the `plan` and `plan:drafting` labels in that read.
- After each label write, a read shows exactly the target phase label, or no phase label after the cleanup of `archive` and `retire`. Any other set makes the command exit 1.
- A `retire` whose label cleanup failed finishes on a plain rerun. A fully retired plan stays refused.
- `new` refuses a title that check 3 would refuse, and it creates nothing. A whitespace-only goal never yields a plan that passes `check`.
- `check` refuses every absolute machine path on every body line: a slash-rooted path under any root except exactly `/dev/null`, a drive-letter path including a bare drive root, and a UNC path.
- `status`, `step`, and `claim` refuse a record that fails the 13 checks, and they write nothing.

Mode: plan-and-implement

## Research

Hypothesis: the CLI trusts several GitHub writes without a read-back, strands a half-done `retire`, accepts `new` input that its own checks refuse later, misses most absolute paths, and lets three mutators write malformed records. Each point is confirmed below at this commit.

Short names: `plan.mjs` is `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs`. `plan-contract.md` is `plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md`. `plan-cli.mjs` is `scripts/tests/plan-cli.mjs`. `gh-stub` is `scripts/tests/fixtures/gh-stub/gh`.

### Facts

- `claimPlan` (plan.mjs:678-691) reads the plan without the write flag (680). It adds the assignee with a direct `gh issue edit` (689). It has no body-unchanged guard and no read after the write, so a dropped assignment still prints `claimed`. `createPlan` (plan.mjs:643-676) passes the two lifecycle labels and `--assignee @me` (662-667). It checks only the returned issue URL (673-674).
- GitHub silently drops the assignees and labels of a new issue, and assignee changes on an existing issue, when the author has no push access (https://docs.github.com/en/rest/issues/issues#create-an-issue, https://docs.github.com/en/rest/issues/issues#update-an-issue). A zero exit from gh therefore does not prove the write.
- `editIssueBodyIfUnchanged` (plan.mjs:551-567) reads the body back after the edit (565-566), but not the labels or the assignees. `editIssueLabelsIfBodyUnchanged` (plan.mjs:569-584) reads nothing after its edit. The contract requires a read after every mutating write (plan-contract.md:264-267). A check of only the added and removed labels misses a phase label that a concurrent write added. `check` then fails on two phase labels (check 2, plan.mjs:181-183).
- In retire mode, `archivePlan` (plan.mjs:967-1034) closes the issue as not planned (1015-1027). Then it removes the phase labels through the same call that `archive` uses (1028). The closed-issue guard (973) refuses every rerun, so a failed cleanup leaves a stale `plan:<phase>` label that no CLI command removes. The closed issue still derives `retired`, because closed reads ignore phase labels (plan.mjs:609-617, plan-contract.md:74-75).
- `createPlan` checks presence, mode, newlines, and labels (plan.mjs:645-652). A title of 71 or more characters creates an issue that check 3 then refuses (plan.mjs:193-200).
- `machinePathCitations` (plan.mjs:159-163) flags a line only when it holds the home root followed by a lowercase letter, or the Users root followed by a letter. It skips every line that starts with a capitalized key, a colon, and an opening brace. Slash-rooted paths under other roots, digit-leading user names, drive-letter paths, and UNC paths all pass. The contract forbids every absolute machine path in the body (plan-contract.md:103-104). Check 10 (plan.mjs:256) does not name the path.
- `scripts/tests/plan-skill-phases.mjs` imports `machinePathCitations` (7). It expects one hit for a slash-rooted path in an Acceptance row and zero hits for a capitalized key line with a JSON value (582-585). It expects zero hits in `docs/PLAN.md` and in the workspace template (587-590). Both files cite `/dev/null` (docs/PLAN.md:370, plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plan-md-template.md:374) and no other slash-rooted path.
- POSIX requires `/dev/null` on every conforming system (https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap10.html). A Windows path is absolute when it has a drive letter, the colon volume separator, and a directory separator, and a UNC path starts with two backslashes followed by a server name (https://learn.microsoft.com/en-us/dotnet/standard/io/file-path-formats).
- `setPlanStatus` (plan.mjs:829-850), `setStepStatus` (plan.mjs:852-878), and `claimPlan` write after only the marker gate (`readPlanIssue`, plan.mjs:503-526), the ownership check, and their own state preconditions. `edit` already runs the 13 checks on its new body (plan.mjs:800). `status` may start from `unlabelled` or `unreadable` (plan.mjs:841). That is the CLI repair for a missing or doubled phase label.
- The tests run plan.mjs with gh-stub first on `PATH` (plan-cli.mjs:12, 80-85). The stub fails every `issue edit` while `issueEditError` is set (gh-stub:394). It has no switch that drops an assignee or a label, or that adds a label during an edit.
- Test inventory: plan-cli.mjs covers claim idempotency and the foreign-owner refusal (275-290), the home-root check 10 case (444-450), and one retire with a refused second retire (1931-1949). It covers no read-back, no retire rerun after a failed cleanup, no `new` title refusal, no other path form, and no mutator refusal.
- Gates: `scripts/ci.mjs` runs plan-cli.mjs and both plan-skill-phases.mjs cases when it selects an owner of the `plan-reviewer` author check (scripts/ci.mjs:372-385). Both docks and plan-lifecycle own that check (scripts/lib/plugins.mjs:66, 111). Shipped scripts sit outside the content hash, so a change to them alone needs a manual `metadata.updated` bump (plugins/plan-lifecycle/skills/AGENTS.md:30-32).
- Tool facts: Node 24 (AGENTS.md:15, `.github/workflows/ci.yml` `node-version: '24'`), Bun 1.4.0 (`package.json` `packageManager`), Biome 2.5.4 (`package.json` `devDependencies`). The Acceptance commands run gh only through gh-stub.

### Decisions

1. Durable fix: read every write back and fail closed, finish `retire` on a rerun, validate in the command that writes, and detect absolute paths by shape. This replaces the temporary option of a longer list of known roots.
2. Path shape: a token is a machine path when it starts the line or follows whitespace, a quote, a backtick, an opening bracket or parenthesis, an equals sign, or a colon that is not part of a URL scheme separator, and it is one of these: a slash followed by a path character; a URL with the `file` scheme; a drive letter, a colon, and a slash or backslash, with or without more path; two backslashes followed by a name. Exactly `/dev/null` as a whole token is exempt. A longer token that starts with `/dev/null` is not. A slash-rooted markdown link destination or URL route is refused too; write the full URL instead. The capitalized-key line exemption goes: `planTemplate` writes no such line (plan.mjs:272-274), and the contract allows no machine path anywhere in the body.
3. The user chose that `new` and `claim` exit 1 when the read-back shows another login next to the acting login, and that they leave every assignment in place. They remove neither the other login nor their own new assignment. Reason: removing another login takes ownership from it, and no lifecycle command transfers ownership (docs/PLAN.md:107-112). Removing the own assignment is a second write without a precondition (plan-contract.md:264-265), so the same race can defeat it. The two-assignee state is safe while a human resolves it: every mutating command refuses it (plan.mjs:510-512), and no review record is trusted until one assignee remains (plan-contract.md:191-192).
4. The user chose to keep the close-then-cleanup order of `retire` and to let a rerun finish the cleanup. A rerun on a closed not-planned plan that still carries a recognized phase label skips the close and removes the labels. A closed plan without a phase label stays refused. Reason: after the close, a stale label does not change the derived status (`retired`, plan-contract.md:74-75), and `retire` keeps the one cleanup call that `archive` uses (plan.mjs:1028). With cleanup first, a failed close leaves an open plan with no phase label. That plan derives `unlabelled` and fails check 2 (plan.mjs:181-183) until a rerun.
5. Request correction. Asked: "run the full validation before every mutating write". Did: `status`, `step`, and `claim` run the 13 checks on the record as their write leaves it: the new body with the labels after the write. `edit` keeps its check of the new body. `archive` and `retire` keep their own preconditions. Reason: a check of the record before the write fails check 2 on every `unlabelled` or `unreadable` plan (plan.mjs:181-183), so it blocks the label repair that `status` allows (plan.mjs:841). `archive` is a verifier with its own proof rules (plan-contract.md:366-397), and `retire` must stay able to abandon a plan whose body will never be fixed. An unlabelled plan cannot be claimed after this change, but `status` claims an unassigned plan in the same write (plan.mjs:513, 576-579), so `status <n> <phase>` repairs both.
6. Request correction. Asked: "reject bad new input such as an over-long title or a blank goal before anything is created". Did: `new` applies the check 3 title rule before the create call. It adds no goal check. Reason: `planTemplate` writes the goal on its own line above the `Mode:` line (plan.mjs:272-274), and check 13 refuses a Goal section whose only content is the Mode line (plan.mjs:267-268). A whitespace-only goal therefore already fails the first `check` and every `edit`.
7. Implementation follows `docks:code-clarity` (plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md:147-148). Each step writes its plan-cli.mjs cases first and records their failing run against the unchanged plan.mjs in Verification Results.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | assignee_verify | Route the `claim` assignee write through `editIssueLabelsIfBodyUnchanged` with the write flag of `readPlanIssue`. After the `new` and `claim` writes, read the issue back. Exit 1 with the issue number and the defect unless the acting login is the sole assignee; for `new`, also unless the `plan` and `plan:drafting` labels are present. Add gh-stub switches that drop an assignee write or a label write | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs, scripts/tests/fixtures/gh-stub/gh | — | `local` | `planned` | plan-cli.mjs shows `new` and `claim` exit 1 after a dropped assignee, a dropped label, or an extra assignee, and print success only after the read-back |
| 2 | label_verify | After every label write of `status`, `archive`, and `retire`, read the labels back. Require the recognized phase labels to be exactly the target phase, or none after cleanup. Otherwise exit 1 and name the labels found. Add a gh-stub switch that adds a phase label during an edit | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs, scripts/tests/fixtures/gh-stub/gh | 1 | `local` | `planned` | plan-cli.mjs shows `status` exit 1 naming both phase labels after an injected concurrent label, and every normal transition and cleanup still exit 0 |
| 3 | retire_rerun | Implement decision 4 in `archivePlan` | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | 2 | `local` | `planned` | plan-cli.mjs shows `retire` exit 1 while `issueEditError` blocks the cleanup, a plain rerun exit 0 with only the `plan` label left, and a third run exit 1 |
| 4 | new_title | Implement decision 6: refuse a `--title` that check 3 would refuse before the `gh issue create` call, with an error that names the 1 to 70 character rule | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | 3 | `local` | `planned` | plan-cli.mjs shows `new` with a 71-character title and with a blank title exit 1 naming the rule, and gh-stub records no `issue create` call |
| 5 | path_detector | Implement decision 2. Rename the export `machinePathCitations` to `machinePaths`, because it now returns each distinct offending path instead of whole lines. Print the path in check 10 as `check 10: body contains an absolute machine path: <path>`. Move the import and the capitalized-key line assertion in plan-skill-phases.mjs to the new name and to one hit | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs, scripts/tests/plan-skill-phases.mjs | 4 | `local` | `planned` | plan-cli.mjs shows `check` refuse each form of decision 2 and pass repository-relative paths, full URLs, and `/dev/null` alone; plan-skill-phases.mjs `--case bounded-workflows` exits 0 |
| 6 | mutator_validation | Implement decision 5 in `setPlanStatus`, `setStepStatus`, and `claimPlan`. Refuse with the check messages and write nothing | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | 5 | `local` | `planned` | plan-cli.mjs shows each mutator exit 1 on a malformed record with no `issue edit` call in gh-stub, and `status` still repairs an `unlabelled` plan |
| 7 | skill_date | Set `metadata.updated` of the plan-manager skill to the implementation date, because only its shipped script changes | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md | 6 | `local` | `planned` | `metadata.updated` holds the implementation date and A4 exits 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-cli.mjs` | Exit 0 with the cases that the Done when cells name. The same file fails each new case against plan.mjs at the merge base; that red run is in Verification Results |
| A2 | `node scripts/tests/plan-skill-phases.mjs --case bounded-workflows` | Exit 0. The capitalized-key line now reports one machine path, which fails against plan.mjs at the merge base |
| A3 | `node plugins/plan-lifecycle/test/selftest.mjs` | Exit 0 |
| A4 | `node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills` | Exit 0 |
| A5 | `node scripts/ci.mjs --plugin plan-lifecycle` | Exit 0 (AGENTS.md:163, scripts/AGENTS.md:6) |
| A6 | `node scripts/ci.mjs` | Exit 0. The plan suites and gh-stub are shared author tooling of docks and plan-lifecycle (AGENTS.md:164) |

## Do not touch

- `docs/plans/finished/`: frozen history.
- Plan #22's settled workflow wording: review loops, linked-branch flow, and comment-backed records, across the contract, skills, wrappers, templates, and mirrors.
- The text of `plan-contract.md`, `docs/PLAN.md`, the workspace template, and the pinned clause list in `scripts/tests/plan-skill-phases.mjs`. The change brings the CLI in line with the current contract text and needs no new wording.
- `plugins/docks/` and `plugins/effect-kit/` skill bodies.

## Open questions

None

## Review

_Review records are stored in issue comments._

## Verification Results

_Not implemented yet._
