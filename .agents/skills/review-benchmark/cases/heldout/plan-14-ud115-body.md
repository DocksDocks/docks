---
plan_contract: v2
title: Move plan record state into GitHub fields
goal: Records that the changed helper writes carry no frontmatter, GitHub fields own title, status, owner, timestamps and completion, and archive requires a merged pull request.
status: planned
created: "2026-08-21T00:14:10.922+00:00"
updated: "2026-08-21T00:19:40.832+00:00"
assignee: null
---

## Goal

Every plan record that the changed helper creates or writes carries no frontmatter. GitHub fields own the title, status, owner, timestamps, and completion. Archive requires a merged pull request. A blocked plan keeps its reason as the first line of `## Open questions`, written `Blocked: <reason>`.

User request (in session, 2026-08-21): "Move the plan record state into GitHub fields. The record carries no frontmatter. GitHub owns title, status, owner, timestamps and completion, and archive requires a merged pull request. Also delete the dead labels plan:finished and plan-scheduled from the repository."

Scope: the v3 record contract, the shipped helper `plan.mjs`, the three lifecycle skill bodies, the instruction files and descriptors that describe the record, and the plan author tests. Issues #12 and #14 keep their v2 bytes (decision 1). The plan-lifecycle release and the cleanup of the live labels belong to a follow-up plan (decision 3 and the request correction).

Mode: plan-and-implement

## Research

### Facts at this commit

- F1. The stored state drifts from GitHub. Issue #12 closed with `state=CLOSED` and `stateReason=COMPLETED` after pull request #13 merged, but its body kept `status: ongoing` and its label kept `plan:ongoing` (observed on 2026-08-21). `ISSUE_FIELDS` requests `stateReason` (plan.mjs:33) and `archive` writes it with `--reason` (plan.mjs:812), but no code reads it.
- F2. Six of the seven frontmatter keys hold no fact of their own. `title` copies the issue title, `goal` copies `## Goal`, and `created` and `updated` copy `createdAt` and `updatedAt`. Check 1 pins `assignee: null` (plan.mjs:176-181), while ownership is the issue assignee (plan.mjs:391-395). `status` copies the `plan:<status>` label that check 2 compares (plan.mjs:190-195) and that `status` and `archive` write in the same call (plan.mjs:643, :811). Only `plan_contract` states a fact that GitHub does not hold.
- F3. GitHub renders the v2 frontmatter as Markdown, not as metadata. The opening `---` is a thematic break, and the closing `---` turns the seven `key: value` lines into a setext heading. An HTML comment is hidden from the rendered body, so a first line `<!-- plan-contract: v3 -->` carries the version and renders as nothing.
- F4. The helper reads only v2 bodies: `readPlanIssue` refuses a body without `plan_contract: v2` (plan.mjs:387-389). `show`, `status`, `step`, and `archive` take the status from the frontmatter, and `list` takes it from the labels (`statusFromLabels`, plan.mjs:456-461).
- F5. `step` requires `ongoing` (plan.mjs:652), and `archive` refuses a non-terminal step (plan.mjs:769-770). When completion comes from GitHub, the merge of the closing pull request makes the plan `finished`, so a step that waits for that merge can never move. Every step must be terminal before the closing merge.
- F6. `archive` reads `closedByPullRequestsReferences` in two selections, plain and `userLinkedOnly: true` (plan.mjs:35-48). It accepts a merged reference into the default branch of the reference's repository when the user-linked set does not hold it (plan.mjs:778-795). The schema documents that the connection lists open pull requests and that `includeClosedPrs` defaults to `false`. `docs/PLAN.md:148-150` records that it returned merged references anyway. With `includeClosedPrs: true` on both selections, the proof rests on the documented argument, and the `mergedAt` filter still drops a closed reference that did not merge.
- F7. Issue #12 has no closing reference in either selection, because the keyword `Closes #12` is in the message of commit `adbb40a910cdb75617c2b7a041f2ae66aacf9b25`. GitHub documents this case: a keyword in a commit message closes the issue when the commit reaches the default branch, and the pull request that holds the commit is not listed as linked. The latest `ClosedEvent` of #12 has a `closer` of type `Commit` with that oid. The `associatedPullRequests` of that commit returns pull request 13 with `state=MERGED` and `baseRefName=main`, and the default branch of the repository is `main` (read with `gh api graphql`). A commit pushed straight to the default branch has no merged pull request in that connection, so a direct push cannot satisfy this proof.
- F8. `plan.mjs labels` creates seven labels with `gh label create --force` (`PLAN_LABELS`, plan.mjs:18, :481). `plan:finished` exists only to mirror the stored status. No lifecycle transition applies `plan-scheduled` (plan-contract.md:70-72).
- F9. The plan-lifecycle plugin is 0.5.0 in both manifests and in its marketplace entry, and the `plan.mjs` of the installed plugin is the only lifecycle tool (AGENTS.md:88-89). This plan runs its own lifecycle on the installed 0.5.0 helper until its archive. #14 therefore stays a v2 record, and the 0.5.0 `archive` writes `status: finished`, adds `plan:finished`, and closes it (plan.mjs:806-812).
- F10. Readers of the record text. The `MARKDOWN_V2` route of plan-workspace runs `plan.mjs check --file` on each v2 source and creates byte-preserving issues that take their title and label from the frontmatter (plan-workspace SKILL.md:150-167). `scripts/tests/plan-skill-phases.mjs` pins the `record-backend`, `label-mirror`, `contract-v2-sections`, and `nonlocal-effect-confirmation` sentences verbatim in the skills, the contract, `docs/PLAN.md`, and the template (`V2_PINNED_CLAUSES`, :20-110). It also requires `docs/PLAN.md` to equal the terminal fence of the template (:320-336) and each skill body to stay within 310 lines (:211). `scripts/tests/plan-cli.mjs` runs the helper. `plugins/plan-lifecycle/test/selftest.mjs` pins the contract link of plan-manager and the two exports `checkPlan` and `machinePathCitations` (:22-29), and its link message names the v2 contract. Root `AGENTS.md` `## Plans` (lines 71-106) equals the generated section in plan-workspace SKILL.md (lines 200-237), which the workspace audit uses as a current marker (:99). The four reviewer wrappers name no record field.
- F11. Surfaces that teach the v2 record as current: root `AGENTS.md` (the repository-scope line and `## Plans`), `docs/AGENTS.md:7-9`, `plugins/plan-lifecycle/skills/AGENTS.md:59-64`, `scripts/AGENTS.md:53` and :95, `plugins/docks/skills/AGENTS.md:73`, `plugins/docks/skills/productivity/scaffold/references/spec-schema.md:88`, `README.md:73`, :91-92, and :112, `plugins/docks/README.md:63`, plan-reviewer SKILL.md:60, plan-manager SKILL.md (:26-34, :148, :170-182, :204), and the description "a markdown-only v2 issue-body record" in both plan-lifecycle manifests and in its marketplace entry (`.claude-plugin/marketplace.json:69`).
- F12. Instruction files for the changed paths. A change to the meaning of a skill or of its `references/` needs `node scripts/skills/content-hash.mjs --backfill` on its tree (plugins/plan-lifecycle/skills/AGENTS.md:24-33, plugins/docks/skills/AGENTS.md:10). The backfill rewrites the `SKILL.md` frontmatter of each changed skill. Long-lived docs and context nodes use the durable grammar and carry no `path:line` anchors (docs/AGENTS.md:24-26). A change that spans two plugins and repo-wide files needs the full gate `node scripts/ci.mjs` (AGENTS.md:125).

### Record design

- The body opens with `<!-- plan-contract: v3 -->` and a blank line, then the eight `##` sections. It has no frontmatter.
- The helper reads the title, `createdAt`, `updatedAt`, and the assignee from the issue. `new` checks `--title` (at most 70 characters) and `--goal` (at most 200) and writes the goal into `## Goal`.
- The label set is `plan`, `plan:drafting`, `plan:planned`, `plan:ongoing`, and `plan:blocked`.
- Status truth table. An open issue takes its status from its one phase label, under decision 2. An open issue with zero or several phase labels reads `unreadable`. A closed issue reads `finished` for `COMPLETED`, `retired` for `NOT_PLANNED`, `duplicate` for `DUPLICATE`, and `unreadable` for any other reason. The helper ignores the phase labels of a closed issue.
- The transitions among the open statuses stay as they are, without `ongoing -> finished`. Only GitHub closes a plan. `status` refuses a closed issue.
- `status <n> blocked --reason <text>` writes `Blocked: <text>` as the first line of `## Open questions`, and a move out of `blocked` removes that line. The eight-section set stays closed.
- `archive` is a verifier. It requires `finished`, terminal steps, and `Code-review: pass`. It accepts a keyword-linked pull request merged into the default branch of its repository (F6), or a latest closing commit whose `associatedPullRequests` holds a pull request of this repository merged into its default branch (F7). It removes the phase labels that the merge left, and it writes no body. `retire` closes the issue as not planned and appends `## Retirement`.

Durable fix: derive every state that GitHub holds from GitHub fields, and delete the stored copies and their writers. The temporary fix, an `archive` that rewrites `status: finished` after each merge, keeps two writers for each field and is rejected.

### Decisions

1. The user chose to keep the v2 frontmatter parser as legacy input and to convert a v2 body to v3 on its next write by the changed helper, instead of converting issues #12 and #14 in this plan. The user's reasons: plan-lifecycle 0.5.0 shipped the v2 issue record (F9), so the open v2 plans of a consumer who upgrades must stay readable and writable; the `MARKDOWN_V2` route still feeds v2 sources to `plan.mjs check --file` (F10); and #14 runs on the 0.5.0 helper, which refuses a body without `plan_contract: v2` (F4, F9), so a converted #14 would stop its own lifecycle. Rejected: convert #12 and #14 now, because that takes two production writes and the 0.5.0 helper could no longer read #14. Rejected: read v2 bodies as read-only, because an open v2 plan could then never move. The Goal covers the records that the changed helper creates or writes. step:cli_record and step:skill_bodies carry this decision out.
2. The user chose to read the phase label of an open issue only while its `stateReason` is null, and to report an open issue with any `stateReason` as `unreadable`. The user's reason: GitHub sets `stateReason` when it closes an issue and clears it when the issue reopens, so a reason on an open issue is left over from a close that did not complete, and the helper must not guess a status for it. Rejected: take the label whatever `stateReason` holds, because a half-closed record would then accept writes. step:cli_statuses carries this decision out.
3. The user chose to leave the `version` of both plan-lifecycle manifests and of its marketplace entry at 0.5.0. A follow-up plan runs `node scripts/release.mjs --plugin plan-lifecycle minor` after the merge (scripts/AGENTS.md:171). That command writes all three values in one run (`runGenericPluginRelease`, scripts/lib/plugin-release.mjs:256), and tag CI gates its bump commit (scripts/lib/ci-targeting.mjs:386-391). The 0.5.0 release took this path: feature commit `b976562` changed only the descriptions, and release commit `ed0b254` moved the three versions. Rejected: bump to 0.6.0 here, because the release run would then re-cut a number that the manifests already carry, which plugin-release.mjs treats as the recovery path after a failed tag CI (:283-288, :397-401).

Request correction. Asked: "Also delete the dead labels plan:finished and plan-scheduled from the repository." Did: the changed helper stops creating, applying, and reading both labels, and the contract no longer names them (step:contract_text, step:cli_statuses). The two live labels stay until the follow-up plan has released the changed helper, and that plan deletes them with its own confirmation. Reason: until that release the installed helper is 0.5.0 (F9, decision 3). Its `archive` and `retire` add `plan:finished` (plan.mjs:811), and `gh issue edit --add-label` fails with `'<name>' not found` when the label does not exist (gh 2.86.0 `LabelsToIDs`). A deletion now breaks every 0.5.0 archive in this repository, the archive of this plan included. The 0.5.0 `labels` command also creates both labels again (plan.mjs:481).

### Acceptance conventions

In Acceptance, `plan.mjs` means `node plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs`, run from the repository root. A row marked "stub" runs against the gh stub state that `scripts/tests/plan-cli.mjs` builds, and that suite holds the row as an assertion. The other rows read the live repository or the working tree and write nothing.

### Tool facts

- Node 24: `.github/workflows/ci.yml` sets `node-version: '24'`, and AGENTS.md:15 names Node 24 as the validator runtime.
- gh: the repository pins no version. The research used gh 2.86.0 (`gh --version`, 2026-08-21), and the label lookup claim cites the source of that tag.

### Sources

- https://github.github.com/gfm/#thematic-breaks and https://github.github.com/gfm/#setext-headings
- https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#hiding-content-with-comments
- https://docs.github.com/en/graphql/reference/enums#issuestatereason
- https://docs.github.com/en/graphql/reference/objects#issue (`closedByPullRequestsReferences`: "List of open pull requests referenced from this issue", `includeClosedPrs` with default `false`, and `userLinkedOnly`; `timelineItems` with `itemTypes` and `last`)
- https://docs.github.com/en/graphql/reference/objects#closedevent and https://docs.github.com/en/graphql/reference/unions#closer (`closer` is a `Commit`, a `ProjectV2`, or a `PullRequest`)
- https://docs.github.com/en/graphql/reference/objects#commit (`associatedPullRequests`: "The merged Pull Request that introduced the commit to the repository")
- https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue (a keyword in a commit message closes the issue when the commit merges into the default branch, and the pull request is not listed as linked)
- https://github.com/cli/cli/blob/v2.86.0/api/queries_repo.go (`LabelsToIDs`) and https://github.com/cli/cli/blob/v2.86.0/pkg/cmd/pr/shared/editable_http.go (`--add-label` resolves each name before the edit)

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | contract_text | Define the v3 record in the contract reference, `docs/PLAN.md`, and the template fence, as Record design says: the marker line and no frontmatter, the fields that the helper reads from the issue, the five labels, the status truth table under decision 2, the `Blocked:` line, legacy v2 input that the next write converts and that `export` writes in its v3 form (decision 1), archive as a verifier with both proofs, the rule that every step is terminal before the closing merge (F5), and an effect-confirmation sentence that blocks the plan with a `Blocked:` line instead of `blocked_reason`. Update the Contents list of the contract to match its sections | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, docs/PLAN.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plan-md-template.md | — | local | planned | the three files describe the v3 record and its truth table, and `docs/PLAN.md` equals the terminal fence of the template byte for byte |
| 2 | cli_record | Parse a v3 body by its marker line. Make `new`, `status`, `step`, `edit`, and `retire` write the marker and no frontmatter. Read the title, the timestamps, and the owner from the issue, and check the `--title` and `--goal` lengths in `new`. Keep the v2 frontmatter parser as legacy input for `check`, `show`, `export`, and every read, and convert a legacy body to v3 on its next write, with `blocked_reason` moved to the `Blocked:` line (decision 1). Make `export` write the v3 form of a legacy body. Replace checks 1, 3, and 4 with the marker check, and keep the closed-map check for legacy input. Keep the two exports that `selftest.mjs` pins | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs | 1 | local | planned | a body that `new` writes opens with the marker and holds no frontmatter, and a legacy v2 body passes `check` and comes back as v3 after one `status` write |
| 3 | cli_statuses | Derive the status from GitHub fields by the truth table, and read an open issue whose `stateReason` is not null as `unreadable` (decision 2). Remove `finished` from the open statuses and `ongoing -> finished` from the transitions. Make `status` refuse a closed issue with `plan #<n> is closed; status applies to open plans`. Replace check 2 with the phase-label rule: an open issue carries one phase label, and its `## Open questions` opens with `Blocked:` exactly when that label is `plan:blocked`, and for legacy input the `blocked_reason` key counts as that line. Make `status` write and remove the `Blocked:` line. Drop `plan:finished` and `plan-scheduled` from `PLAN_LABELS`. Let `list --status` accept `retired` and `duplicate`, and let `next` read closure from `state` alone. Make check 11 use the derived status, and skip it for a v3 file that has no issue | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs | 2 | local | planned | `list` reports a `COMPLETED` issue as finished, a `NOT_PLANNED` issue as retired, and a `DUPLICATE` issue as duplicate without a stored status, and `status` refuses a closed issue |
| 4 | cli_archive | Make `archive` a verifier that requires `finished`, terminal steps, and `Code-review: pass`. Query both `closedByPullRequestsReferences` selections with `includeClosedPrs: true`, and keep the user-linked exclusion and its refusal. Accept a keyword-linked reference merged into the default branch of its repository, or a latest `ClosedEvent` whose closer is a commit whose `associatedPullRequests` holds a pull request of this repository merged into its default branch. Otherwise refuse with `archive requires a closing pull request merged into <nameWithOwner>:<branch>`. Remove each phase label left on the issue, and write no body and no close. Make `retire` close the issue as not planned, append `## Retirement`, remove the phase labels, and refuse a closed plan with `cannot retire a <status> plan` | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs | 3 | local | planned | `archive` accepts a commit closer through its merged pull request, refuses a direct-push commit closer, and leaves the issue with `plan` and no phase label |
| 5 | skill_bodies | Align the three skill bodies with the v3 record. In plan-manager, change the record-backend and effect-confirmation constraints, the contract summary, the command table, and the ownership paragraph. In plan-workspace, change the label-set clause, the generated root `## Plans` section, and the `MARKDOWN_V2` route: v2 sources are legacy input, each new issue converts on its first helper write, and a source whose status is `finished` stops the migration (decision 1). In plan-reviewer, replace the v2 contract wording. Keep the `references/plan-contract.md` link. Then run `node scripts/skills/content-hash.mjs --backfill plugins/plan-lifecycle/skills` | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md | 1 | local | planned | no shipped skill body presents frontmatter as the current record, each body stays within 310 lines, and `node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills` exits 0 |
| 6 | descriptor_text | Replace the v2 record wording in each surface of F11: the repository-scope line and `## Plans` in root `AGENTS.md`, which stays equal to the generated section of plan-workspace; `docs/AGENTS.md`; the synchronized surface in `plugins/plan-lifecycle/skills/AGENTS.md`; the plan suite lines in `scripts/AGENTS.md`; `plugins/docks/skills/AGENTS.md`; the record-backend clause in the scaffold `spec-schema.md`; both READMEs; and the description of both plan-lifecycle manifests and of its marketplace entry. Write no `path:line` anchors. Then run `node scripts/skills/content-hash.mjs --backfill plugins/docks/skills` | AGENTS.md, docs/AGENTS.md, plugins/plan-lifecycle/skills/AGENTS.md, scripts/AGENTS.md, plugins/docks/skills/AGENTS.md, plugins/docks/skills/productivity/scaffold/references/spec-schema.md, plugins/docks/skills/productivity/scaffold/SKILL.md, README.md, plugins/docks/README.md, plugins/plan-lifecycle/.claude-plugin/plugin.json, plugins/plan-lifecycle/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 5 | local | planned | no instruction file or descriptor presents a v2 record as current, root `## Plans` equals the generated section, and `node scripts/skills/content-hash.mjs --check-only plugins/docks/skills` exits 0 |
| 7 | tests | Rewrite the plan suites for the v3 record. In `plan-cli.mjs`, cover the `new` body, the frontmatter refusal, legacy input and its conversion on write, the truth table, the closed-issue refusal, the `Blocked:` line, the five labels, both archive proofs, the direct-push refusal, the manual-link refusal, and `retire`. In `plan-skill-phases.mjs`, move the four pinned sentences of F10 to their new text and name the v3 contract in its messages. In `selftest.mjs`, name the v3 contract in the link message | scripts/tests/plan-cli.mjs, scripts/tests/plan-skill-phases.mjs, plugins/plan-lifecycle/test/selftest.mjs | 4, 5 | local | planned | `plan-cli.mjs`, both `plan-skill-phases.mjs` cases, and the self-test exit 0, and each new assertion of a changed behavior fails against the helper at this commit |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| a1 | stub: `plan.mjs new --title "Exercise v3" --goal "The v3 plan completes"`, then `plan.mjs show <n> --body` | the body opens with `<!-- plan-contract: v3 -->` and a blank line and holds no `---` fence and no `title:`, `goal:`, `status:`, `created:`, `updated:`, or `assignee:` line, and the header strip on stderr shows the issue title `Exercise v3` |
| a2 | stub: `plan.mjs check --file` on a body whose first line is the v3 marker and whose next lines are a `---` frontmatter block | exits 1, and check 1 names frontmatter as not allowed in a v3 record |
| a3 | stub: `plan.mjs check --file` on a v2 source file, then `plan.mjs status <n> ongoing` on an issue that holds the same v2 body and `plan:planned` | `check` passes and names the file as legacy v2 input, and after the write the body opens with the v3 marker and holds no frontmatter, and the issue carries `plan:ongoing` |
| a4 | `plan.mjs list` | prints `finished`, a tab, and `#12` for issue #12, which still carries `plan:ongoing` and `status: ongoing` |
| a5 | stub: `plan.mjs list` over an issue closed as `NOT_PLANNED`, an issue closed as `DUPLICATE`, and an open issue with two phase labels | prints `retired`, `duplicate`, and `unreadable` for them |
| a6 | stub: `plan.mjs status <n> ongoing` on an issue closed as `COMPLETED` | exits 1 with `plan #<n> is closed; status applies to open plans`, and the labels stay unchanged |
| a7 | stub: `plan.mjs status <n> blocked` without `--reason` | exits 1 with `blocked status requires --reason as single-line text`, which proves that the reason is written as the first `Blocked:` line of `## Open questions` and not as a `blocked_reason` key |
| a8 | stub: `plan.mjs archive <n>` on a `COMPLETED` issue with `plan:ongoing`, terminal steps, `Code-review: pass`, no closing reference, and a latest closing commit whose associated pull request merged into `main` | prints `plan #<n> finished (closed by <pr-url>)`, removes `plan:ongoing`, and leaves the body unchanged |
| a9 | stub: the same archive, with a latest closing commit that no pull request holds | exits 1 with `archive requires a closing pull request merged into DocksDocks/fixture:main`, and the labels stay unchanged |
| a10 | stub: `plan.mjs archive <n>` where the only merged reference is manually linked | exits 1 and names the manual link, as it does at this commit |
| a11 | stub: `plan.mjs labels` | creates exactly `plan`, `plan:drafting`, `plan:planned`, `plan:ongoing`, and `plan:blocked` |
| a12 | `grep -rn -e plan:finished -e plan-scheduled plugins/plan-lifecycle/skills docs/PLAN.md AGENTS.md` | prints nothing |
| a13 | `grep -rln 'v2 issue-body record' .claude-plugin plugins/plan-lifecycle/.claude-plugin plugins/plan-lifecycle/.codex-plugin` | prints nothing |
| a14 | `node scripts/tests/plan-cli.mjs` | exits 0 |
| a15 | `node scripts/tests/plan-skill-phases.mjs --case bounded-workflows` and `node scripts/tests/plan-skill-phases.mjs --case plan-workspace-template` | both exit 0 |
| a16 | `node plugins/plan-lifecycle/test/selftest.mjs` | exits 0 |
| a17 | `node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills` and `node scripts/skills/content-hash.mjs --check-only plugins/docks/skills` | both exit 0 |
| a18 | `node scripts/ci.mjs` | exits 0, the full gate that a change across two plugins and repo-wide files needs (AGENTS.md:125) |

## Do not touch

- `docs/plans/finished/`, the frozen pre-GitHub history that no command parses.
- The bodies and labels of issues #12 and #14 (decision 1). #12 is the live exhibit for a4 and F7.
- The live `plan:finished` and `plan-scheduled` labels (request correction).
- The `version` of both plan-lifecycle manifests and of its marketplace entry, and `plugins/plan-lifecycle/compatibility.json` (decision 3).
- The four reviewer wrappers under `plugins/plan-lifecycle/agents/` and `.codex/agents/`, which name no record field.
- The zero-commit and never-push rules. Landing stays outside the Steps.
- `docs/PLAN-QUEUE.md`.

## Open questions

None

## Review

_No review yet._

## Verification Results

_Not implemented yet._
