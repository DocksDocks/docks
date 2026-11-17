# Pull-request template

Offer this template only when the repository has no pull-request template.
GitHub reads a template from the root, from `docs/`, or from `.github/`. A
template there is a file named `pull_request_template`, with an extension such
as `.md` or `.txt`, in any letter case, or a `PULL_REQUEST_TEMPLATE/` folder
that holds several templates
(<https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository>,
<https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates>).
The detection below matches only the names that these pages give:
`pull_request_template`, `pull_request_template.md`,
`pull_request_template.txt`, and the folder name `PULL_REQUEST_TEMPLATE`, in
any letter case. Each entry with one of these names counts as present: a
file, a folder, or a symlink, also a broken one. Other names, for example
`pull_request_template.md.bak`, are not templates.

Use this detection for the offer and for each check of the template. Copy the
`pr_templates` function word for word:

```bash
pr_templates() (
  root=$(git rev-parse --show-toplevel) && cd "$root" || exit 2
  for d in . docs .github; do
    test -d "$d" || continue
    hits=$(find "$d" -mindepth 1 -maxdepth 1 \( -iname pull_request_template -o -iname pull_request_template.md -o -iname pull_request_template.txt \) -print) || exit 2
    for p in $hits; do
      if test -L "$p"; then k=symlink; elif test -d "$p"; then k=folder; else k=file; fi
      echo "$p ($k)"
    done
  done
)
if t=$(pr_templates); then printf '%s\n' "${t:-none}" | sed 's/^/pull-request template: /'
else echo "ERROR pull-request template check failed (see the message above)"; fi
```

It prints one `pull-request template: <path> (<kind>)` line for each entry,
for example `pull-request template: .github/pull_request_template.md (symlink)`,
or `pull-request template: none`. When it prints a path, write nothing. Never
overwrite or edit an existing template, and never write through a symlink.
When it prints an `ERROR` line, for example outside a git repository, report
the error and write nothing. An error is not a missing template.

Write the terminal fenced block to `.github/pull_request_template.md` only
when the detection reports `none` right before the write, and only when
`test ! -L .github` passes, so that the write creates a new file and follows
no link. Replace
`<check command>` with the check command that the root instruction file names,
for example `bun run check`. When the root instruction file names no check
command, write the first item as `- [ ] Checks pass`. Keep each item a
top-level task item, so that GitHub shows the progress as `k of n tasks`. The
repository can add its own items later. GitHub uses the template only after it
is on the default branch. The `plan-manager` landing pull request copies these
items into its `## Checklist` section.

```markdown
## Checklist

- [ ] `<check command>` passes
- [ ] Tested locally with the `verify` skill
- [ ] Code review passed
```
