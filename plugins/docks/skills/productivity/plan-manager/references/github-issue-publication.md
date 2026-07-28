# GitHub issue publication

Treat `--issues` / `publish <slug> as an issue` as scope `publish`. Require an
existing canonical plan and exact live publish authority for the repository.
Preflight `gh auth status`, a GitHub remote, and `gh repo view --json visibility`.
If the repository is public, warn that the issue is public and obtain explicit
confirmation before publishing a plan that names a vulnerability, credential
location, or other sensitive finding. Any failed preflight, absent authority, or
declined confirmation creates no issue and writes nothing. Create the issue from the
canonical title/body, transactionally record its URL in `## Notes`, checkpoint only
the owned plan, and read back. Publication never changes lifecycle, dispatches
review, or makes the issue the source of truth.
