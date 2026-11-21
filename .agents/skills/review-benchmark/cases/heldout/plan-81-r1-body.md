<!-- plan-contract: v4 -->

## Goal

Close three text gaps that remain in the plan-lifecycle plugin after #80: the yolo temporary-worktree teardown, the red baseline after a review fix changes a spec test, and the contract advice list for an empty Research section.

Mode: plan-and-implement

## Research

Repository facts (paths relative to the repository root):

- `plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md`, Commits item 2, ends the temporary worktree recipe with `git worktree remove -- <path>`. Landing step 9 continues with `git worktree prune`, and the root `AGENTS.md` says: "Teardown is `git worktree remove` followed by `git worktree prune`; removing the directory by hand leaves an orphan admin record."
- Same file, Red baseline item 4: "When a spec test is wrong, record the reason in Verification Results, fix the test, and run the baseline again." It does not say whether this applies to a review fix, or which line to record. In the #79 trial, a code-review fix changed a spec assertion, and the run wrote no new `Red baseline` line. The run quoted `tdd-workflow`: "Test assertions are read-only during Phases 3–5", and that skill says to escalate a wrong test to the user.
- `plugins/docks/skills/engineering/tdd-workflow/SKILL.md` (Phase 2): "A test that passes prematurely is broken - fix the test, then re-run." (Rules): "If a test is wrong ... STOP and escalate to the user."
- `plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md`, advice paragraph: "a Research section that holds only `_Not researched yet._` after drafting". The helper (`plan.mjs`, `researchFilled` and `printAdvice`) also prints that advice for an empty Research section. The #79 code review reported this mismatch as LOW.
- `node scripts/skills/content-hash.mjs --backfill plugins/plan-lifecycle/skills` refreshes `content_hash` in `yolo/SKILL.md` and `plan-manager/SKILL.md`.

Decisions:

- Worktree teardown: add `git worktree prune` after `git worktree remove` in Commits item 2, and set `<path>` to `$(git rev-parse --git-path docks-review)/check-<short-sha>`, so a worktree that a run fails to remove goes away with the clone. Rejected: leaving it to Landing, because Commits item 2 runs earlier and in a loop.
- Review fix that changes a spec test: Red baseline item 4 applies to it. Run the changed test against the code before the fix; it must fail on the changed assertion. Record `Red baseline, step <id>, review round <k>: <command>: <k> failed, <m> passed`. The contract's Yolo runs table already gives the manager the user escalation that `tdd-workflow` asks for; the record replaces it. Rejected: escalate to the user, because a yolo run asks only the merge question.
- Contract advice: say "a Research section that is empty or holds only" the placeholder. Rejected: change the helper to skip empty Research, because the status gate already refuses empty Research, and the advice should match the gate.
- Release: a patch, after the merge, because only text changes.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | yolo_text | Add worktree prune to Commits item 2 and the review-fix red baseline rule to Red baseline item 4 | plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md | - | local | planned | both texts present; content hash refreshed; fresh agent answer recorded; plugin gate green; committed |
| 2 | contract_advice | Name empty Research in the contract advice list | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md | 1 | local | planned | advice phrase names empty Research; content hash refreshed; plugin gate green; committed |
| 3 | release | Release plan-lifecycle as a patch after the landing merge | - | 2 | release | planned | release tag exists, or the user declined and the step is skipped |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/ci.mjs --plugin plan-lifecycle` per commit and on the reviewed head | Exit 0 |
| A2 | `grep -n "git worktree prune" plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md` | Two lines: Commits item 2 and Landing step 9 |
| A3 | A fresh read-only agent reads the new yolo text and gets the #79 trial situation: a code-review fix changes a spec assertion | It answers that the run records the reason, runs the changed test against the code before the fix, and adds a `Red baseline, step <id>, review round <k>` line, and it names no conflict with `tdd-workflow` |
| A4 | `grep -n "Research section that" plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md` | One line in the advice paragraph |

## Do not touch

Plugin manifest and marketplace version fields (`scripts/release.mjs` bumps them after the merge). `plan.mjs` behavior. Skills of the `docks` plugin.

## Open questions

## Verification Results
