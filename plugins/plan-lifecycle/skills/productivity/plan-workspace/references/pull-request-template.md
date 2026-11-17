# Pull-request template

Offer this template only when the repository has no pull-request template.
GitHub reads a file named `pull_request_template.md` (any letter case, `.md` or
`.txt`) in the root, in `docs/`, or in `.github/`, or a
`PULL_REQUEST_TEMPLATE/` folder in one of these places
(<https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository>).
This command prints each one that exists:

```bash
find . .github docs -maxdepth 1 -iname 'pull_request_template*' 2>/dev/null
```

When it prints a path, write nothing. Never overwrite or edit an existing
template.

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
