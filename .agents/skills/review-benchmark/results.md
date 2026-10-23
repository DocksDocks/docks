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

## Run 2026-10-23: plan #98 candidates against the 0.16.0 reviewers

Baseline ref `e09d273f` (plan-lifecycle 0.16.0). Every arm ran as an omp project agent on `openai-codex/gpt-6.1-sol` at the agent's default reasoning effort, two runs per arm, arms interleaved, dispatched through omp's eval `agent()`. A blind judge on another model family (the omp `task` agent) matched and adjudicated every finding. Seconds: first prompt to final answer, the slowest reviewer of a round. Tokens: input plus cached input plus cache writes plus output, summed over a round's reviewers. Every finding in every run was rated valid; no arm had a wrong finding.

Candidate iterations: `it0` is the first `code-reviewer` skill; `it1` stops a `full` round from loading all three lens references (to cut its time); `it2` adds the coverage stance ("report every defect, also LOW; the manager reproduces each finding") and a shorter finding line. Iterations used the dev cases only.

### Dev cases

| Case | Arm | Recall (mean of 2) | Valid extras | Seconds | Tokens (M) |
|---|---|---:|---:|---:|---:|
| code-96 (7 known) | B0, one reviewer, old prompt | 0.00 | 0.0 | 126 | 1.03 |
| code-96 | B1, panel, old prompt with lens text in the dispatch | 0.57 | 1.5 | 139 | 2.49 |
| code-96 | C1 it0 / it1 / it2, one reviewer, new skill | 0.14 / 0.14 / 0.14 | 1.0 | 180 / 180 / 158 | 1.01 / 1.07 / 1.11 |
| code-96 | C3 it0 / it2, panel, new skill | 0.36 / 0.21 | 1.0 | 156 / 149 | 2.61 / 2.64 |
| code-89 (6 known) | B0 | 0.67 | 0.0 | 145 | 1.17 |
| code-89 | B1 | 0.67 | 2.0 | 159 | 2.35 |
| code-89 | C1 it0 / it1 / it2 | 0.67 / 0.67 / 0.67 | 0.0 | 217 / 167 / 139 | 1.37 / 1.16 / 1.25 |
| code-89 | C3 it0 / it2 | 0.67 / 0.83 | 0.5 | 149 / 136 | 2.87 / 2.62 |
| code-96-delta-planted (1 known) | B0, full re-review | 1.00 | 0.0 | 150 | 1.01 |
| code-96-delta-planted | Cd, delta round | 1.00 | 0.0 | 85 | 0.30 |
| code-96-delta-real (0 known) | B0, full re-review | - | 0.5 | 170 | 1.59 |
| code-96-delta-real | Cd | - | 0.0 | 76 | 0.32 |
| plan-96 (6 known) | P0, old prompt | 0.17 | 0.0 | 120 | 0.81 |
| plan-96 | P1, new skill | 0.17 | 0.0 | 129 | 0.60 |
| plan-89 (3 known) | P0 | 0.00 | 1.0 | 126 | 0.69 |
| plan-89 | P1 | 0.17 | 0.5 | 103 | 0.49 |
| plan-96-delta (0 known) | P0, full re-review | - | 0.0 | 104 | 0.90 |
| plan-96-delta | Pd, delta round | - | 0.0 | 69 | 0.26 |
| plan-96-delta-planted (1 known) | P0, full re-review | 0.00 | 0.0 | 139 | 0.95 |
| plan-96-delta-planted | Pd | 1.00 | 0.0 | 74 | 0.27 |

### Held-out cases (one run of the final candidates, keys closed until scoring)

| Case | Arm | Recall (mean of 2) | Valid extras | Seconds | Tokens (M) |
|---|---|---:|---:|---:|---:|
| code-H1 (6 seeded) | B0 | 1.00 | 0.0 | 93 | 0.54 |
| code-H1 | B1 | 1.00 | 1.0 | 148 | 1.40 |
| code-H1 | C1 it2 | 1.00 | 0.0 | 116 | 0.52 |
| code-H1 | C3 it2 | 1.00 | 1.5 | 151 | 1.54 |
| plan-H1 (5 seeded) | P0 | 0.60 | 0.0 | 81 | 0.44 |
| plan-H1 | P1 | 0.70 | 0.0 | 89 | 0.37 |

### Decisions under the rule

| Candidate | Evidence | Decision |
|---|---|---|
| Code prompt (C1 it2 against B0) | Dev recall 0.40 against 0.33; held-out 1.00 against 1.00; time +9% on dev and +24% on held-out; tokens +7% and -4%; no wrong findings | Kept |
| Panel policy (C3 it2 against C1 it2) | Dev recall 0.52 against 0.40; held-out 1.00 against 1.00; modeled loop tokens +19% for #89 and -10% for #96, loop time -29% and -31% against B0 | Kept |
| Code delta mode (Cd) | Planted repair defect caught 2 of 2, as by the full re-review; 43 to 55% less time and 70 to 80% fewer tokens | Kept |
| Plan prompt (P1 against P0) | Dev recall 0.17 against 0.08; held-out 0.70 against 0.60; time -6% on dev and +9% on held-out; tokens -26% and -17% | Kept |
| Plan delta mode (Pd) | Planted repair defect caught 2 of 2, against 0 of 2 for the full re-review; 34 to 47% less time and about 70% fewer tokens | Kept |

### Limits and leads

- `code-H1` sat at the ceiling: every arm found all 6 seeded defects, so it separates arms only by cost and extras. The next held-out code case needs harder defects, for example escaped defects from real plans.
- The seeded `code-89` defects and the `plan-89` findings were known to the prompt author, and the lens texts of both B1 and the new skill name defect kinds that benchmark 1 found in `code-96`, so the dev cases favor both lens setups.
- B1 (old prompt, lens text in the dispatch) found more on dev than C3 (lens text in a reference that the reviewer loads): 0.62 against 0.52, driven by `code-96`. Next experiment: put each lens's scope sentences in the panel dispatch as well as in the reference, and compare with C3.
- Two runs per arm detect only large differences; recall on `code-96` and `plan-96` varied between runs of one arm.
- Reasoning effort changes both recall and time: benchmark 1 dispatched at the task tool's highest effort and took 250 to 577 s per lens, against 136 to 159 s here at the default effort. Compare arms only at one effort.

### Correction to the panel decision (2026-10-23)

The "Panel policy: Kept" row above credited the delta rounds' savings to the panel: its modeled loop paired a panel round 1 and delta follow-ups against B0 with full re-reviews. Delta rounds are a separate kept change that also follows a single reviewer, so the like-for-like loop pairs both policies with delta follow-ups (Cd, 0.31 M tokens each):

| Loop | One reviewer (C1 it2) + delta | Panel (C3 it2) + delta | Panel extra |
|---|---:|---:|---:|
| #89 code review (1 follow-up) | 1.25 + 0.31 = 1.56 M | 2.62 + 0.31 = 2.93 M | +88% |
| #96 code review (2 follow-ups) | 1.11 + 0.62 = 1.73 M | 2.64 + 0.62 = 3.26 M | +88% |

The panel found more only on `code-96` (dev, 0.21 to 0.57 against 0.00 to 0.14 for one reviewer), tied on `code-89` and on held-out `code-H1` at the ceiling, and B1 beat C3 on dev, so the new prompt did not help a panel. Decision: round 1 is a single `full` reviewer by default; the panel stays an option for a change that the user or Research marks as high risk. The new code prompt, both delta modes, and the new plan prompt stay kept.

### Correction to the panel evidence (2026-10-23, plan review round 6)

The entry above says that the panel tied on `code-89`. That holds for B1 and C3 it0 (0.67 each), not for C3 it2: with the new skill, the panel found more than one reviewer on both dev cases, `code-96` 0.21 against 0.14 for C1 it2 and `code-89` 0.83 against 0.67, where one of its two runs found two more defects. The decision stays: the panel buys a modest recall gain for about 88% more loop tokens, so it is an option for high-risk changes.
