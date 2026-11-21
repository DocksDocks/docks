### Plan review round 1

Plan-review: repair

- research_gap - Research decision 3; Steps `settle_refusal_tests`; Acceptance a5 - Changing a status label cannot trigger the specified refusal without violating “Do not touch: the behavior of `plan.mjs`.” In `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs`, `statusFromIssue` (lines 443–453) derives a closed issue’s status from `stateReason`, ignoring labels; `reopenPlan` (lines 1227–1242) therefore still sees `finished` and the same close. The proposed label-change test expects exit 1 and no write, but the unchanged helper reopens the issue successfully. - Schedule a change from `stateReason: 'COMPLETED'` to `'NOT_PLANNED'` during the settle wait, preserving the closed state and latest closure. Assert the specified refusal and no helper writes, and use that case for a5.

