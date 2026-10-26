<!-- plan-contract: v4 -->

## Goal

Make the docks report-skill-issue skill keep private repositories out of public reports by checking, not by memory. Before a draft names a repository, the agent reads its visibility with gh; the user's own project, when it is not public, contributes no owner, repository name, issue or pull request title, branch name, or #-reference to the draft. The pre-filing scan then checks the draft for those names. Also read the approved title from a file in stage 6 and in the prefilled-link scripts, as the body already is, so the shell passes the approved text unchanged.

Yolo: the user delegated every decision except the merge to the agent.

Mode: plan-and-implement

## Research

### Facts

- Repository fact: the skill's redaction rule (`plugins/docks/skills/productivity/report-skill-issue/SKILL.md`, second constraint and "Check before filing") lists "names of private repositories, organizations, customers, and people" and "titles of private plans and issues", but it gives no way to decide whether a repository is private, and its scan finds only machine paths and token shapes ("It does not find a private name or a hostname; read the text for those.").
- Repository fact: three earlier issues in this repository named private repositories and a private plan title in their "Observed" sections; the user had them redacted in this session. Each named the repository that the reporting agent worked in.
- Repository fact: `gh issue develop` names a linked branch `<n>-<slug of the issue title>` (for example this plan's branch), so a branch name from a private project carries a private issue title.
- GitHub renders `#26` in an issue as a link to issue 26 of the same repository, and `owner/repo#26` as a link to the named repository (https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/autolinked-references-and-urls). A number from a private project written as `#123` in a DocksDocks/docks issue therefore links to DocksDocks/docks#123, a different issue.
- `gh repo view <owner/repo> --json visibility` prints the visibility (https://cli.github.com/manual/gh_repo_view). Experiment in the review scratch directory: it printed `PRIVATE` for a private repository that the account can read, `PUBLIC` for DocksDocks/docks, and `GraphQL: Could not resolve to a Repository with the name '<owner>/<name>'` for a repository that does not exist; GitHub gives the same answer for a private repository that the account cannot read. With an explicit `<owner>/<repo>` argument, the lookup named that repository also with `GH_REPO` set to another one. A bare `<owner>/<repo>` takes its host from gh's default host, which `GH_HOST` sets (https://cli.github.com/manual/gh_help_environment): with `GH_HOST=example.invalid`, `gh repo view DocksDocks/docks` tried to connect to that host, while `gh repo view github.com/DocksDocks/docks` printed `DocksDocks/docks PUBLIC`.
- Without an argument, `gh repo view` resolves the repository from gh's own choice, not from a stated remote: `GH_REPO` can select another repository for commands that operate on a local repository (https://cli.github.com/manual/gh_help_environment), and `gh repo set-default` picks which remote gh queries in a checkout with several remotes (https://cli.github.com/manual/gh_repo_set-default). In gh 2.102.0 the argument-free `gh repo view` still showed the local repository with `GH_REPO` set (experiment), but the default-remote choice can still name an upstream repository instead of the project's own remote.
- GitHub keeps every revision of an edited issue or comment, and anyone who can read the issue can open them; a user with write access can delete a revision in the web UI, and the API has no call for it (https://docs.github.com/en/communities/moderating-comments-and-conversations/tracking-changes-in-a-comment; the GraphQL schema has no mutation for content edits).
- Repository fact: stage 6 runs `gh issue create --repo DocksDocks/docks --title "<approved title>" --body-file "$body"`, and the prefilled-link scripts take `"<approved title>"` as an argument. The skill already says to use `--body-file` "because the shell can change backticks, `$`, and quotes in inline text"; the title has the same problem, so gh can file a title that differs from the one the user approved. Experiment with a fake `gh` that prints its arguments: a title with a word in backticks arrived without that word. With the title in a file and `--title "$(cat "$title")"`, a title with a word in backticks and `$HOME` arrived unchanged, because Bash does not expand the result of a command substitution again (https://www.gnu.org/software/bash/manual/html_node/Command-Substitution.html).

### Decisions

1. **Read the title from a file.** Stage 6 writes the approved title to a temporary file, as it writes the body, and runs `gh issue create --repo DocksDocks/docks --title "$(cat "$title")" --body-file "$body"`; both files are removed after filing. The Node and Python prefilled-link scripts take the title file path instead of the title text. Rejected: a single-quoted inline title (an apostrophe in the title breaks it); `gh api` with `-F title=@<file>` (another command and another output, while `gh issue create` already prints the URL).
2. **Look up visibility before the draft names a repository.** A new paragraph in stage 4 tells the agent to resolve the user's project from its remotes, not from gh's defaults: list `git remote -v` in the project, take the host, owner, and name from each remote URL, and for each `github.com` remote run `gh repo view github.com/<owner>/<repo> --json visibility --jq .visibility`, with the host written out so that neither `GH_REPO` nor `GH_HOST` can change the target. The project counts as public only when it has at least one remote, every remote is on `github.com`, and no lookup prints `PRIVATE`. No remote, a remote on another host, a URL that does not parse, or a failed lookup counts as not public. When the project is not public, the draft leaves out every remote's owner and name, the project's issue and pull request titles, and its branch names, and writes its issue and pull request numbers without `#` (for example "issue 123 in a private repository"). Every other repository that the draft names keeps its name only when the same host-qualified lookup prints `PUBLIC`; a repository on another host, or a failed lookup, counts as private. Without gh, every repository other than DocksDocks/docks counts as private. The second constraint and the Report section at the end of the skill each add one sentence: decide visibility with that lookup, not from memory. Rejected: the argument-free `gh repo view` (it follows gh's default-repository choice, not the project's remotes) and a bare `<owner>/<repo>` (it follows `GH_HOST`).
3. **Scan the draft for the project's names.** "Check before filing" adds two commands next to the existing scan: one prints each line of the title and body files that holds an owner or repository name from the project's remotes, as stage 4 resolved them (for a private project it must print nothing); one lists every GitHub repository reference (`github.com/<owner>/<repo>` and `<owner>/<repo>#<n>`) for the visibility lookup. The checklist item for private names points to them.
4. **Repair a filed issue that names a private repository.** A short paragraph after stage 6: edit the issue or comment to remove the name, then tell the user to delete the old revision in the web UI ("edited", then the revision, then "Delete revision from history"), because GitHub keeps every revision and no API call deletes one.
5. **Gotchas.** Two rows: a branch name from a private project carries a private issue title; a `#123` from a private project links to DocksDocks/docks#123, so write `GH-123`, which GitHub does not link.

### Engineering standards

- Steps 1 and 2: `write-skill` (body limits, the baseline check, and the trigger check) and `code-clarity` for the wording; step 1 also `fix-workflow` (the experiment above is the reproduction).
- Commits: `commit-discipline`. Self-review during code review round 1: `code-review` with `code-clarity`.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | title_from_file | Implement decision 1 | plugins/docks/skills/productivity/report-skill-issue/SKILL.md | - | local | planned | the stage 6 command and both link scripts read the title from a file, and the fake-gh experiment passes a title with backticks and `$` unchanged |
| 2 | visibility_check | Implement decisions 2 to 5, then backfill the content hash | plugins/docks/skills/productivity/report-skill-issue/SKILL.md | 1 | local | planned | the skill guard and scorer pass, the body stays at or under 310 lines, and the baseline check (a5) passes |
| 3 | release_docks | After the merge and only with its own question: run `bun scripts/release.mjs --plugin docks patch` from a clean `main` | plugins/docks/.claude-plugin/plugin.json, plugins/docks/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 2 | release | planned | the docks release tag CI passes and `gh release view` shows the release, or the step is skipped with the user's answer recorded |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| a1 | `bun scripts/ci.mjs --plugin docks` | exits 0 (root `AGENTS.md`: the gate for a change owned by one plugin) |
| a2 | `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file plugins/docks/skills` | `productivity/report-skill-issue` scores at or above its value before the change (15) |
| a3 | the fake-gh experiment from Research with the title `docks:report-skill-issue: don't drop the title`, run with the new stage 6 command and with each link script | the title arrives unchanged |
| a4 | `wc -l plugins/docks/skills/productivity/report-skill-issue/SKILL.md` | at most 310 body lines (`plugins/docks/skills/AGENTS.md`, body sweet spot) |
| a5 | Baseline check from `write-skill`: three fresh subagents each get one report scenario from a private project (repository name, branch name, issue numbers, and a second private repository in the error text; the gh visibility answers are given) and the skill text; once with the skill before this plan and once after | after the change, no draft contains a private owner, repository name, branch name, private title, or `#`-number of the private project; the run before the change is recorded as the baseline |
| a6 | pull request checks | every check passes |

## Do not touch

- The skill's description and its trigger behavior.
- Files outside `plugins/docks/skills/productivity/report-skill-issue/` before the release step.

## Open questions

## Verification Results
