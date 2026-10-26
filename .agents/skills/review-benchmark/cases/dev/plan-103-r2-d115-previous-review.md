### Plan review round 1

Plan-review: repair

- security_risk - Research decisions 2–3; Step `visibility_check` - The argument-free visibility lookup need not inspect the user’s project: [GitHub’s environment documentation](https://cli.github.com/manual/gh_help_environment) says `GH_REPO` overrides local-repository selection. [INFERENCE] In a private checkout with `GH_REPO=DocksDocks/docks`, the proposed command returns the public reporting repository’s identity and visibility. The project can consequently miss the private-project redaction rule, allowing its branch names or issue titles into the draft instead of excluding them as Goal requires. The lookup-derived owner/name scan does not correct that mismatch. - Resolve the user project’s repository identity from its remote independently of gh’s ambient target, query that explicit repository, and bind the scan to that identity. Treat an unresolved or mismatched identity as non-public.

