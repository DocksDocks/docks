### Plan review round 1

Plan-review: repair

- research_gap - Research decision 1; #90, “Workaround that worked” - The successful workaround waited approximately 10 seconds **after observing both `CLOSED` and the matching close event**. Decision 1 requires only the event and measures settling from `createdAt`, which [GitHub documents](https://docs.github.com/en/graphql/reference/issues#closedevent---object) as event creation time, not stabilization. These are not equivalent safeguards - Require both observations, then a full elapsed settle interval before reopening; distinguish a confirmed subsequent reopen from a close still being observed.

- research_gap - Research decision 1; `plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md:138-140`; `plan.mjs` — `readPlanIssue`, `writeIssueIfUnchanged` - “No claim, because the reopen writes no body” contradicts the contract: mutations claim unassigned plans, including bodyless writes. The proposed sequence also lacks a fresh ownership check after waiting - Preserve claim-on-mutation behavior and re-read ownership, state, and closure immediately before reopening. Keep genuine no-op outcomes mutation-free.

- security_risk - Research decisions 4–5; step 3 - The standalone reporting skill prohibits private-data disclosure and public security reports, but the no-docks fallback specifies only a minimum draft and approval rule. That fallback cannot load the missing skill’s safeguards - Make the byte-identical section explicitly carry the public-destination warning, redaction requirements, security-report prohibition, and exact-text approval gate; otherwise restrict that fallback to a private draft without publication.

- goal_fit - Acceptance a9; `plugins/docks/skills/AGENTS.md:41,115` - A single report dry run does not cover the mandatory manual sibling-collision check or baseline check on the smallest targeted model/runtime. The full gate’s mechanical collision audit does not replace these - Include the required three near-miss routing checks and fresh-instance without/with-skill baseline comparison in Acceptance.

- research_gap - Steps 5–6, Files; `scripts/lib/plugin-release.mjs` — `runGenericPluginRelease` - Both release steps declare `none`, although the command writes and commits the selected plugin’s Claude manifest, Codex manifest, and `.claude-plugin/marketplace.json` - List those three paths for each release. Retain the existing dependency from step 6 to step 5 for the shared catalog.

- research_gap - Acceptance a7; `scripts/tests/test-contracts.mjs` — `REPO`, `readJson`, registry initialization - The validator always reads the registry relative to its own script location; the proposed command provides no way to select a standalone scratch registry - Specify running the copied validator from a complete scratch repository containing the altered registry, so the negative check actually exercises the intended input.

