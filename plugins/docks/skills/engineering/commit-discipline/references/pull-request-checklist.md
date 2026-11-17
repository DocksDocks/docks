# Pull-request checklist

The `## Checklist` section of a pull-request description holds top-level task
items (`- [ ] <text>` or `- [x] <text>`), so that GitHub shows its progress as
`k of n tasks`. Do not nest items: GitHub does not document how it counts
nested items.

## Items

`gh pr create --body-file` uses the file as given and copies no template, so
build the items in this order:

1. The task items of the repository's pull-request template, as written. GitHub
   reads a `pull_request_template` file (`.md` or `.txt`, in any letter case)
   in the root, in `docs/`, or in `.github/`, or a `PULL_REQUEST_TEMPLATE/`
   folder. When there is no template, use the defaults:
   "`<check command>` passes" (from the root instruction file, or "Checks
   pass" when it names none), "Tested locally with the `verify` skill", and
   "Code review passed".
2. One item for each check that the repository instructions require, as
   "`<command>` passes".
3. "Tested locally with the `verify` skill" when the change touches a surface
   that a user or another program drives.
4. "Code review passed".

Skip an item of 2 to 4 when a template item or a default item already covers
it, so that no check and no review shows twice.

## Ticks

Tick an item (`- [x]`) only when its check passed on the head that you push
now, or, for the code-review item, when a review passed on that head.
Otherwise leave it unticked and end its line with ` - <reason>`.

After each push, untick each item whose evidence is for an older head, with the
reason `not checked on <short-sha>`, until it passes again on the new head.
Update the body with `gh pr edit <pr> --body-file <file>` right after the push,
before any wait for checks.

## Sources

- GitHub Docs, "Creating a pull request template for your repository":
  <https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository>
- GitHub Docs, "About issue and pull request templates" (names are not case
  sensitive; `.md` or `.txt`):
  <https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates>
- GitHub Docs, "About tasklists" (`- [ ]` and `- [x]` task items):
  <https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/about-tasklists>
- `gh pr create` manual (`--body-file` takes the body as given):
  <https://cli.github.com/manual/gh_pr_create>
