# Pull-request template

Offer this template only when the repository has no usable pull-request
template. GitHub reads a template from the root, from `docs/`, or from
`.github/`. A template there is a file named `pull_request_template`, with an
extension such as `.md` or `.txt`, in any letter case, or a
`PULL_REQUEST_TEMPLATE/` folder that holds several templates
(<https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository>,
<https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates>).
The detection below looks only at the names that these pages give:
`pull_request_template`, `pull_request_template.md`, and
`pull_request_template.txt`, in any letter case. The folder name
`PULL_REQUEST_TEMPLATE` is the first of these. Other names, for example
`pull_request_template.md.bak`, are not templates.

The detection answers two questions apart:

- Is there a usable template? A usable entry is a regular file with a supported
  name, a symlink with a supported name that resolves to a regular file, or a
  `PULL_REQUEST_TEMPLATE` folder (or a symlink to one) that holds at least one
  regular `.md` or `.txt` file. This answer drives the offer, each check of the
  template, and the checklist items.
- Is the target path occupied? Any entry with a supported name occupies its
  path, also an unusable one: a broken symlink, a folder with a file name, or
  an empty template folder. This answer guards each write.

Copy the `pr_templates` function and its report lines word for word:

```bash
pr_templates() (
  root=$(git rev-parse --show-toplevel) && cd "$root" || exit 2
  usable=0
  for d in . docs .github; do
    test -d "$d" || continue
    hits=$(find "$d" -mindepth 1 -maxdepth 1 \( -iname pull_request_template -o -iname pull_request_template.md -o -iname pull_request_template.txt \) -print) || exit 2
    for p in $hits; do
      n=$(printf '%s' "${p##*/}" | tr '[:upper:]' '[:lower:]'); l=; test -L "$p" && l='symlink to '
      if test -f "$p"; then usable=1; echo "pull-request template: $p (${l}file)"
      elif test -d "$p" && [ "$n" = pull_request_template ]; then
        f=$(find "$p/" -mindepth 1 -maxdepth 1 -type f \( -iname '*.md' -o -iname '*.txt' \) -print) || exit 2
        if [ -n "$f" ]; then usable=1; echo "pull-request template: $p (${l}folder)"
        else echo "pull-request template: unusable $p (${l}folder without a .md or .txt file)"; fi
      elif test -d "$p"; then echo "pull-request template: unusable $p (${l}folder with a file name)"
      elif test -L "$p"; then echo "pull-request template: unusable $p (broken symlink)"
      else echo "pull-request template: unusable $p (not a regular file)"; fi
    done
  done
  [ "$usable" = 1 ] || echo "pull-request template: none"
)
if t=$(pr_templates); then printf '%s\n' "$t"; else echo "ERROR pull-request template check failed (see the message above)"; fi
```

It prints one `pull-request template: <path> (<kind>)` line for each usable
entry, for example
`pull-request template: .github/pull_request_template.md (symlink to file)`,
and one `pull-request template: unusable <path> (<reason>)` line for each
unusable entry. It prints `pull-request template: none` when no usable entry
exists, also when unusable entries exist. When it prints an `ERROR` line, for
example outside a git repository, report the error and write nothing. An
error is not a missing template.

Offer the template only on `pull-request template: none`. Never overwrite or
edit an existing entry, and never write through a symlink. Right before the
write, run this gate from the repository root, after the `pr_templates`
function. Copy it word for word:

```bash
if t=$(pr_templates); then
  if printf '%s\n' "$t" | grep -qiE '^pull-request template: (unusable )?\.github/pull_request_template\.md \('; then echo "target occupied: write nothing"
  elif [ "$t" != "${t%pull-request template: none}" ] && test ! -L .github; then echo "target free"
  else echo "no write: a usable template exists, or .github is a symlink"; fi
else echo "ERROR pull-request template check failed (see the message above)"; fi
```

Write only on `target free`. On `target occupied`, report the entry that
occupies `.github/pull_request_template.md` and write nothing; the user
resolves it.

Write the terminal fenced block to `.github/pull_request_template.md`. Replace
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
