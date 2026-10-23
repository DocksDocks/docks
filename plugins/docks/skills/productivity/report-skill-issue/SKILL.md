---
name: report-skill-issue
description: "Use when reporting a problem with a docks or plan-lifecycle skill, reviewer agent, hook, or script: a wrong, outdated, or unsafe instruction, or a shipped script that fails. Drafts a redacted, reproducible issue for DocksDocks/docks and files it with gh only after the user approves the exact text. Not for fixing the skill in place (use write-skill or skill-maintenance) or bugs in the user's own code (use fix-workflow). A security problem never becomes a public issue."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-10-23"
  content_hash: "b47f863afd7b99bac74a711c9e03c5c88e64975a8df0d218cd841dd223d5eb3b"
---

# Report a Skill Issue

The docks and plan-lifecycle plugins come from the public GitHub repository DocksDocks/docks. When one of their skills, reviewer agents, hooks, or scripts gives a wrong, outdated, or unsafe instruction, or a shipped script fails, this skill turns what you saw into one issue there. A useful report lets a maintainer reproduce the problem without access to the user's project. It identifies the exact skill text, quotes the instruction, and shows what happened. It contains nothing private, because anyone can read it.

<constraint>
DocksDocks/docks is a public repository. Anyone can read its issues and comments, and search engines index them. File no issue and post no comment until the user has read and approved the exact title and body that you will send. Show the draft, ask for approval, and end your turn. Do not run `gh issue create` or `gh issue comment` in the turn that shows the draft. If the user changes the draft, show the new text and get approval again. An approval that the user gave before they saw the final text does not count. In a run where you cannot ask the user (a headless run, a scheduled job, or a subagent with no way to reach the user), print the draft and the prefilled URL as your final message and stop. The URL files nothing by itself: the user reads the draft and files it from the form. Give no prefilled URL for a security problem. File nothing in that run.
</constraint>

<constraint>
Keep private data out of the title and the body. Leave out secret values and tokens (name the variable only, for example `GH_TOKEN`), names of private repositories, organizations, customers, and people, internal hostnames and URLs, absolute machine paths (write a path relative to the project or the plugin root), proprietary code or data, and titles of private plans and issues. Describe each one generically instead, for example "a private repository" or "a plan issue in a private repository". A security problem is a skill, agent, hook, or script that exposes secrets, runs unsafe commands, or weakens access control. A security problem never goes into a public issue or comment, not even in redacted form. Give the user the draft and tell them to send it privately to the repository owner. If a credential was exposed, tell the user to rotate it now, whether or not they send the report.
</constraint>

## Scope

Report problems in what ships with the docks or plan-lifecycle plugins: skills, reviewer agents, hooks, and scripts. A shipped skill sits at `<plugin-root>/skills/<category>/<skill>/SKILL.md`. The plugin root holds `.claude-plugin/plugin.json` or `.codex-plugin/plugin.json`, and its `name` is `docks` or `plan-lifecycle`.

| The problem is in | Do this |
|---|---|
| A shipped skill, reviewer agent, hook, or script | Use this skill |
| A shipped item, and it exposes secrets, runs unsafe commands, or weakens access control | Write a private draft (see "Security problems"); file no issue |
| The user's own project code | Not a skill problem; use `fix-workflow` |
| Your own run: you skipped a step, changed a command, or acted on an assumption that the skill does not state | Not a report; correct the run and tell the user |
| A skill from another source: another plugin, a project-local skill in `.agents/skills/` or `.claude/skills/`, or a personal skill | Not a DocksDocks report; tell the user which source owns it |
| The skill text in a checkout of DocksDocks/docks that you were asked to change | Edit it with `write-skill` or `skill-maintenance`; no issue |

## Workflow

The goal is one approved, redacted, reproducible report. Each stage below states what it must establish; choose the commands that fit the runtime. Do every stage in order, also in a text-only run. Never skip the search in stage 3, because a duplicate report splits the evidence across two issues.

### 1. Confirm that the problem is in the skill

Re-read the instruction or the file that failed. Copy the instruction exactly, with the heading that it sits under. For a script, note its path relative to the plugin root and the command that failed. Then rule out the other causes:

- The user's environment: a missing tool, an old CLI, a permission or network failure, or a project setting that the skill does not cover.
- Your own deviation: compare what you did with the quoted text, word by word.

Report when the instruction, followed as written, gives a wrong or unsafe result, names a command or option that does not exist, or contradicts another shipped instruction. Also report a shipped script that fails on valid input. If you cannot find the cause, say so in the draft. Do not guess a cause.

### 2. Identify the exact skill text

The plugin root is the folder that holds `skills/<category>/<skill>/SKILL.md`. For an agent, hook, or script, it is the folder that holds `.claude-plugin/` or `.codex-plugin/`. Collect these facts. Write `unknown` for any fact that you cannot read; never guess a version or a hash.

| Fact | Where to read it |
|---|---|
| `<plugin>:<skill>` | `name` in the plugin root's `plugin.json`, and `name` in the skill's frontmatter. For an agent, hook, or script, use its path relative to the plugin root |
| Plugin version | `version` in `.claude-plugin/plugin.json` or `.codex-plugin/plugin.json` in the plugin root |
| Skill metadata | `metadata.updated` and the first 12 characters of `metadata.content_hash` in the skill's frontmatter |
| Runtime | Claude Code, Codex, OpenCode, VS Code Copilot, or omp, and its version (for example from its `--version` output) |
| Model | The model name, if the runtime shows it |

```bash
# Run in the plugin root.
grep -m1 '"name"' .claude-plugin/plugin.json .codex-plugin/plugin.json
grep -m1 '"version"' .claude-plugin/plugin.json .codex-plugin/plugin.json
grep -E '^  (updated|content_hash):' skills/<category>/<skill>/SKILL.md
```

The version and the hash tell the maintainer which text you read. Release tags have the form `<plugin>--v<version>` (`gh release list --repo DocksDocks/docks` lists them). If the user's version is older than the latest release, say so in the draft.

### 3. Search for an existing report

Search open and closed issues with the skill name and two or three words from the symptom. Use only public words, because the query goes to GitHub.

```bash
gh issue list --repo DocksDocks/docks --state all --search "<skill name> <key words>"
gh issue view <n> --repo DocksDocks/docks --comments
```

| Search result | Action |
|---|---|
| An open issue describes the same problem | Draft a comment that adds only new facts: another version, another runtime, or a new reproduction |
| A closed issue fixed it in a later plugin version | File nothing; tell the user to update the plugin |
| A closed issue matches, and the problem is still in the latest version | Draft a new issue that links the closed one |
| No match | Draft a new issue |

### 4. Draft the report

Fill the template below. Put one problem in each issue. If you found two problems, draft two reports and get approval for each. Keep the quote of the instruction exact. Trim command output to the lines that show the failure. Give times in UTC. Then check the draft against the redaction rule and the list in "Check before filing".

### 5. Get approval

Show the user, as the final message of your turn:

- the target: a new issue in DocksDocks/docks, or a comment on issue #n there;
- the exact title and body;
- the command that you will run, and the GitHub account that it files under (`gh auth status` shows it).

Ask the user to approve or change the text, then end your turn. A security problem stops before this step: give the private draft instead (see "Security problems").

### 6. File the approved text

Write the approved body, unchanged, to a new temporary file. Run the scan from "Check before filing" on it. File it, remove the file, and give the user the URL that gh prints.

```bash
body=$(mktemp)
# Write the approved body to "$body" with your file tool, then:
gh issue create --repo DocksDocks/docks --title "<approved title>" --body-file "$body"
# Or, for a comment on an existing issue:
gh issue comment <n> --repo DocksDocks/docks --body-file "$body"
rm -- "$body"
```

If your shell does not keep variables between commands, use the path that `mktemp` printed. Use `--body-file`, not `--body`, because the shell can change backticks, `$`, and quotes in inline text. Do not add labels or assignees; the maintainer triages the issue.

### Without gh

If `gh` is not installed, or `gh auth status` reports no login, do not install gh and do not ask for a token. Give the user a link that opens the new-issue form with the text filled in:

`https://github.com/DocksDocks/docks/issues/new?title=<url-encoded title>&body=<url-encoded body>`

Encode the exact title and body that you show, unchanged, as URL query components, for example with `encodeURIComponent` in Node. If the full URL is longer than about 6,000 characters, give the title and the body as text instead, for the user to paste at `https://github.com/DocksDocks/docks/issues/new`. For a comment on an existing issue, give the text and the issue URL, `https://github.com/DocksDocks/docks/issues/<n>`. Show the draft and the link in the same message. The user files the issue from the form.

## Security problems

A skill, agent, hook, or script that exposes secrets, runs unsafe commands, or weakens access control has a security problem. Do not file it, comment on it, or describe it in any public place, not even in redacted form. Instead:

1. Tell the user to rotate every credential that was exposed, now.
2. Draft the report with every section of the template below, and put "Private security report" above the title. A private report needs the same facts as a public one.
3. Give the draft to the user, to send privately to the repository owner (the DocksDocks account on GitHub). A private channel is not an issue, a comment, a discussion, or a pull request. Give no prefilled issue URL.
4. If the repository accepts private vulnerability reports, the user can send the draft there instead. `gh api repos/DocksDocks/docks/private-vulnerability-reporting` prints `{"enabled":true}` when it does; the form is in the repository's Security tab.

## Template

The first line is the title. The body starts at `## Summary`. Write `none` in a section that has nothing to say; do not drop the section.

```markdown
Title: <plugin>:<skill>: <symptom in one line>

## Summary

<Two or three sentences: what the skill told the agent to do, what went wrong, and the effect on the work.>

## Skill

- Skill: `<plugin>:<skill>` (or the agent, hook, or script path relative to the plugin root)
- Plugin version: <x.y.z or unknown>
- Skill metadata: updated <YYYY-MM-DD>, content_hash <first 12 characters>
- Runtime: <Claude Code, Codex, OpenCode, VS Code Copilot, or omp> <version or unknown>
- Model: <model name or unknown>

## What the skill says

Under "<heading>":

> <the instruction, quoted exactly>

## What happened

<What the agent did when it followed the instruction as written. The exact error text and trimmed output in fenced blocks. A UTC timeline table when timing matters.>

## Expected

<What the instruction should have produced.>

## How to reproduce

1. <Minimal steps in a generic project, with no private names.>

## Workaround

<What worked instead, or none.>

## Suggested change

<Optional: the change to the skill text or script that would fix the problem.>
```

## BAD / GOOD

```text
BAD title:   plan-manager is broken
GOOD title:  plan-lifecycle:plan-manager: reopen right after a partial merge can leave the plan issue closed with reason REOPENED

BAD body:    Seen in acme-corp/billing-api issue #123 (plan "Invoice export for Contoso").
GOOD body:   Seen in a plan issue in a private repository.

BAD body:    gh failed with token ghp_1a2b... for jdoe on build-01.corp.internal
GOOD body:   gh failed with an authentication error (token from GH_TOKEN).

BAD action:  a public issue "docks:<skill>: prints the GH_TOKEN value to the log", value redacted
GOOD action: no public issue; a private draft for the repository owner, and advice to rotate the token
```

The good title names the plugin, the skill, and one observable symptom, so a maintainer can find it and a duplicate search can match it.

## Gotchas

| Gotcha | Do instead |
|---|---|
| A redacted secret still shows a prefix or a length (`ghp_1a2b...`) | Name the variable only (`GH_TOKEN`); show no part of the value |
| Full command output carries paths, hostnames, and user names | Trim to the failing lines; make paths relative to the project or the plugin root |
| The search query carries private words | Search with the skill name and words from the instruction only |
| A paraphrase in "What the skill says" | Quote the instruction exactly, with its heading |
| Two problems in one issue | One problem per issue, each with its own approval |
| The reproduction needs the user's private project | Reduce it to a generic project, or describe the minimal setup |
| A guessed version or hash | Read it from the files, or write `unknown` |
| Local times in the timeline | Convert every time to UTC |
| The temporary body file stays on disk | Remove the temporary file after filing |

## Check before filing

Check the draft before you show it, and again before you file it:

- The title has the form `<plugin>:<skill>: <symptom>` and names one problem.
- Every template section is present; an empty section says `none`.
- "What the skill says" quotes the instruction exactly, with its heading.
- You searched for an existing report (stage 3). A draft that adds to an existing issue is a comment on that issue.
- Your message names the target, the command that you will run, and the GitHub account (stage 5). In a run where you cannot ask, it gives the prefilled URL instead.
- The title and the body contain no secret value or token, no private repository, organization, customer, or person name, no internal hostname, no absolute machine path, no proprietary code or data, and no private plan or issue title.
- The problem is not a security problem. If it is, give a private draft only.
- The user approved this exact title and body after they saw it.

This scan prints nothing when the body file contains no machine path and no token-shaped string. Read the title for the same patterns.

```bash
grep -nE '/home/[^/ ]+/|/Users/[^/ ]+/|[A-Za-z]:\\Users\\|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|AKIA[0-9A-Z]{16}|xox[abprs]-|BEGIN [A-Z ]*PRIVATE KEY' "$body"
```

The scan finds only patterns. It does not find a private name or a hostname; read the text for those.

## Sources

- `gh issue create`: <https://cli.github.com/manual/gh_issue_create>
- `gh issue list`: <https://cli.github.com/manual/gh_issue_list>
- `gh issue comment`: <https://cli.github.com/manual/gh_issue_comment>
- Creating an issue from a URL query: <https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-an-issue>

## Report a problem with this skill

When this skill gives a wrong, outdated, or unsafe instruction, or a script that it ships fails, report the problem in the public DocksDocks/docks repository. Use the docks `report-skill-issue` skill for the report. If that skill is not installed, do not file anything: give the user a draft instead. The draft names this skill and its plugin version, quotes the instruction, and states what happened and what you expected. Leave out secrets and private names.
