# Review benchmark results

This log records the decision rule and every run of the review benchmark. Append new entries at the end. Do not edit earlier entries.

## Decision rule

Plan #98 (decision 8) fixed this rule before any candidate ran. The current workflow is the baseline.

| Comparison | Arms | Kept when |
|---|---|---|
| Prompt change | C1 against B0; P1 against P0 | Mean recall is higher on the dev cases and at least equal on the held-out cases. Wrong findings do not increase. Median round time and median tokens stay within 25% of the baseline. |
| Panel policy | C3 against C1; B1 against B0 when the prompt change loses | Recall is higher on the dev cases and at least equal on the held-out cases. Wrong findings do not increase. The modeled loop cost is within 25% of B0's tokens and below B0's time. |
| Code delta mode | Cd against B0 on code-delta cases | It catches the planted repair defects at least as often as the full re-review, and it costs less. |
| Plan delta mode | Pd against P0 on plan-delta cases | It catches the planted repair defects at least as often as the full re-review, and it costs less. |

- The modeled loop is round 1 plus the follow-up rounds of the historical loops: 1 follow-up for the #89 code review and 2 for #96. A follow-up round costs one measured delta round (Cd) for the new policy and one measured full re-review (B0 on a code-delta case) for B0.
- A losing candidate gets at most two more dev iterations. Base each iteration on the transcripts of its misses. If it still loses, drop it, and keep today's prompt, single reviewer, or full re-review for that part of the workflow.

## Benchmark 1 (2026-10-23, before this harness)

Benchmark 1 replayed plan #96 on frozen snapshots with the released `code-reviewer` and `plan-reviewer` agents on gpt-6.1-sol. Fifteen reviewers ran at the same time. Each lens run named its lens in the dispatch. Round time runs from the first prompt to the final answer (for a panel, the slowest lens). Tokens are input plus cached input plus output.

Code review of `093c13f0` (case `code-96`, 7 known defects):

| Setup | Run | Round time (s) | Tokens (M) | Known defects found |
|---|---|---:|---:|---:|
| One reviewer | A | 393 | 2.04 | 0 of 7 |
| One reviewer | B | 309 | 1.50 | 2 of 7 |
| Three lenses | A | 577 | 3.76 | 4 of 7 |
| Three lenses | B | 316 | 3.74 | 5 of 7 |

Every finding of these four runs was a real defect. No run found the endless "run reopen again" message (`Da`), which the #96 self-review found.

Review of the #96 round-2 repair (cases `code-96-delta-real` and `code-96-delta-planted`):

| Setup | Round time (s) | Tokens (M) | Result |
|---|---:|---:|---|
| Full re-review (#96 round 2 as it ran) | 180 | about 1.5 | pass |
| Delta round, real repair | 108 | 0.38 | pass; the round-1 finding is fixed |
| Delta round, planted defect, run A | 119 | 0.31 | fixes-required; found the planted HIGH |
| Delta round, planted defect, run B | 123 | 0.34 | fixes-required; found the planted HIGH |

The delta rounds took 108 to 123 s against 180 s for the full re-review, and they caught the planted defect 2 of 2 times.

Plan review of #96 round 1 (case `plan-96`, 6 known findings):

| Setup | Round time (s) | Tokens (M) | Known findings found |
|---|---:|---:|---:|
| One reviewer | 307 | 1.20 | 2 of 6 |
| Two lenses | 220 | 2.50 | 2 of 6 |

A delta plan round on the round-2 body (case `plan-96-delta`) took 246 s and 0.81 M tokens, against 200 s and about 0.95 M tokens for the historical full round 2.
