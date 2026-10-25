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

### Decision change: the panel is the default again (2026-10-23)

After the run, the user removed the token limit: more tokens are acceptable when the reviews find more defects or finish sooner. The panel found more defects than one reviewer (C3 it2 against C1 it2 on both dev cases; B1 against B0 on `code-96`) at about the same round time (C3 it2 136 to 151 s against C1 it2 116 to 158 s), so round 1 is a panel again for a diff of 50 or more changed lines. A user who wants to save tokens can ask for a full round. In later decisions, recall and round time decide; tokens are reported but do not block a change.

## Run 2026-10-24: reviewer efforts and service tiers (plan #100)

### Decision rule (plan #100, fixed before any run)

The best configuration is the one with the fewest escaped known defects at loop end on the held-out cases. A configuration is not worse than the best when the 90% interval of its escaped-defect difference stays below 2 defects per 50 known and its round-1 recall interval stays above -0.05. Among the configurations that are not worse, the recommended one has the lowest median loop time. Tokens are reported but do not decide. Dev runs may change the harness, not this rule.

### Setup

- Model: `openai-codex/gpt-6.1-sol`. Efforts: low, medium, high, xhigh. Each effort ran with the OpenAI `priority` service tier (named `<effort>-fast`, the fast mode of omp) and with the `default` tier (named `<effort>`). `xhigh-fast` is the production setting.
- Prompts: the reviewer prompts of plan-lifecycle 0.17.1. Round 1 is a panel for 50 or more changed lines and a full round below that. Repairs get delta rounds.
- Each code case runs as a whole review loop. The judge matches the findings to the key. Known defects get their fix patch. One fixer agent repairs the valid extra findings of a round. The fixer is the same for every configuration: gpt-6.1-sol, effort high, priority tier. The loop ends at a round with no open finding or at 5 rounds.
- Plan cases and the dev code-delta cases run one round.
- Corpus: 18 dev cases and 24 held-out cases (10 code loops, 14 plan cases). Each configuration ran 3 times on each case.
- At most 16 agents ran at a time (the limit of the user for the machine), so every timed run had the same load.
- Limit (plan #100 decision 4): the reviewer's own agent file and skill folder stay allowed also when a case changes them. On such a case the reviewer can read a newer version of a file under review, for example on the held-out cases that change the `code-reviewer` skill. These runs stay valid.
- The first judge was a Claude model, from another model family than the reviewers. A second judge (gpt-6.1-sol, effort high) judged a random 10% of the answers again.
- Table terms: escaped per 50 known is the escaped known defects per 50 known defects. Seconds is the slowest reviewer of a round. Loop seconds add the rounds of a loop and leave out the fixer. An interval row gives the 90% paired bootstrap interval of the difference from xhigh-fast. A dash means no value.

Rescoring after code review round 1: the review found three faults in `loop`. It ended a round when a review was missing, it accepted incomplete judge answers, and it dropped a defect that a later repair brought back. In 7 runs (6 held-out, 1 dev), a reviewer block had no review. Those reviewers ran again, and their loops ran again from that round. Then every loop was checked again under the corrected rules: 15 dev loops got more rounds (12 of them on `code-23-pr26`), and no held-out loop changed apart from the 6 runs that ran again. The transcript facts of each run were also checked again, now per message for the effort and also for the fixer. The held-out decision did not change.

### Dev cases

#### Decision

| Measure | low | low-fast | medium | medium-fast | high | high-fast | xhigh | xhigh-fast |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Runs | 54 | 54 | 54 | 53 | 52 | 54 | 54 | 52 |
| Known found per run | 0.63 | 0.63 | 0.85 | 0.81 | 0.77 | 0.91 | 1.02 | 1.06 |
| Escaped per run | 2.15 | 2.15 | 1.93 | 1.98 | 1.88 | 1.87 | 1.76 | 1.63 |
| Escaped per 50 known | 38.67 | 38.67 | 34.67 | 35.47 | 35.51 | 33.67 | 31.67 | 30.36 |
| Model | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol |
| Effort | low | low | medium | medium | high | high | xhigh | xhigh |
| Served tier | default | priority | default | priority | default | priority | default | priority |
| Round 1 recall difference from xhigh-fast, 90% interval | [-0.22, -0.05] | [-0.21, -0.06] | [-0.15, 0.01] | [-0.15, -0.01] | [-0.11, 0.00] | [-0.08, 0.01] | [-0.07, 0.04] | - |
| Escaped per 50 known difference from xhigh-fast, 90% interval | [3.06, 15.19] | [3.13, 14.92] | [0.38, 8.79] | [1.39, 9.85] | [0.44, 9.85] | [-0.24, 8.33] | [-1.04, 4.94] | - |
| Loop seconds difference from xhigh-fast, 90% interval | [-563.8, -272.4] | [-598.6, -297.3] | [-475.6, -213.1] | [-555.8, -274.8] | [-231.0, -72.8] | [-424.1, -189.5] | [193.6, 445.0] | - |

#### Code loops

| Measure | low | low-fast | medium | medium-fast | high | high-fast | xhigh | xhigh-fast |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Runs | 24 | 24 | 24 | 23 | 22 | 24 | 24 | 22 |
| Model | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol |
| Effort | low | low | medium | medium | high | high | xhigh | xhigh |
| Served tier | default | priority | default | priority | default | priority | default | priority |
| Round 1 seconds median | 52.3 | 33.6 | 77.9 | 46.4 | 160.4 | 93.8 | 335.3 | 178.5 |
| Round 1 seconds min | 38.4 | 27.6 | 59.0 | 35.6 | 104.5 | 61.9 | 243.8 | 127.9 |
| Round 1 seconds max | 81.1 | 64.0 | 100.0 | 73.6 | 299.8 | 209.8 | 554.1 | 268.4 |
| Round 1 modes | panel 24 | panel 24 | panel 24 | panel 23 | panel 22 | panel 24 | panel 24 | panel 22 |
| Round 1 known found per run | 0.75 | 0.75 | 1.00 | 1.00 | 0.95 | 1.17 | 1.29 | 1.27 |
| Round 2 seconds median | 34.0 | 21.8 | 56.0 | 34.3 | 102.4 | 51.5 | 230.2 | 127.8 |
| Round 2 seconds min | 21.5 | 13.7 | 27.6 | 20.8 | 47.7 | 28.7 | 91.9 | 66.7 |
| Round 2 seconds max | 85.0 | 34.7 | 113.1 | 48.1 | 223.1 | 137.5 | 476.3 | 292.7 |
| Round 2 modes | delta 21 | delta 24 | delta 21, panel 3 | delta 19, panel 3 | delta 19, panel 3 | delta 23, panel 1 | delta 22, panel 2 | delta 18, panel 4 |
| Round 2 known found per run | 0.10 | 0.13 | 0.25 | 0.18 | 0.14 | 0.13 | 0.29 | 0.36 |
| Round 3 seconds median | 37.5 | 19.6 | 45.8 | 26.6 | 57.4 | 33.8 | 134.7 | 91.1 |
| Round 3 seconds min | 23.9 | 18.0 | 28.6 | 20.9 | 46.7 | 27.3 | 84.3 | 50.6 |
| Round 3 seconds max | 38.5 | 28.6 | 68.2 | 52.0 | 244.5 | 90.0 | 431.2 | 293.5 |
| Round 3 modes | delta 3 | delta 5 | delta 10, panel 1 | delta 9 | delta 9 | delta 10 | delta 11, panel 1 | delta 13, panel 1 |
| Round 3 known found per run | 0.67 | 0.40 | 0.27 | 0.33 | 0.22 | 0.30 | 0.33 | 0.43 |
| Round 4 seconds median | 50.8 | 30.1 | 38.3 | 41.8 | 105.1 | 56.0 | 221.3 | 112.3 |
| Round 4 seconds min | 35.5 | 12.5 | 31.2 | 23.9 | 102.5 | 30.9 | 102.4 | 64.6 |
| Round 4 seconds max | 66.0 | 47.7 | 52.6 | 44.8 | 145.6 | 83.2 | 467.7 | 219.3 |
| Round 4 modes | delta 2 | delta 1, panel 1 | delta 4 | delta 3 | delta 3 | delta 3 | delta 6 | delta 8 |
| Round 4 known found per run | 0.50 | 0.00 | 0.50 | 0.67 | 0.33 | 0.67 | 0.17 | 0.38 |
| Round 5 seconds median | 17.8 | 63.2 | 38.5 | 31.6 | 142.4 | 69.8 | 425.3 | 94.3 |
| Round 5 seconds min | 17.8 | 63.2 | 34.2 | 26.2 | 93.9 | 69.3 | 191.6 | 44.2 |
| Round 5 seconds max | 17.8 | 63.2 | 46.7 | 32.4 | 192.9 | 105.0 | 505.5 | 324.2 |
| Round 5 modes | delta 1 | panel 1 | delta 3 | delta 3 | delta 3 | delta 3 | delta 4 | delta 7 |
| Round 5 known found per run | 0.00 | 1.00 | 0.00 | 0.33 | 0.33 | 0.67 | 0.25 | 0.29 |
| Rounds median | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 | 2.5 | 3.0 |
| Rounds max | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| Loop seconds median | 86.7 | 59.3 | 152.1 | 87.9 | 276.5 | 161.7 | 580.0 | 368.3 |
| Known found per run | 0.75 | 0.75 | 1.13 | 1.04 | 0.95 | 1.17 | 1.38 | 1.55 |
| Escaped per run | 3.00 | 3.00 | 2.63 | 2.78 | 2.59 | 2.58 | 2.38 | 2.09 |
| Valid extras per run | 2.04 | 2.83 | 3.88 | 3.57 | 6.68 | 5.29 | 9.38 | 10.27 |
| Extra-only rounds per run | 0.63 | 0.79 | 0.88 | 0.87 | 1.09 | 0.96 | 1.17 | 1.50 |
| Wrong per run | 0.00 | 0.04 | 0.00 | 0.04 | 0.32 | 0.17 | 0.08 | 0.14 |
| Unjudged per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Unknown ratings per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.14 | 0.04 | 0.04 | 0.00 |
| Unknown pairs per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Tokens median | 1404015 | 1527077 | 1700505 | 1701543 | 2754015 | 2554582 | 3554469 | 3913839 |
| Side-call tokens median | 0 | 0 | 0 | 0 | 231778 | 0 | 482119 | 387837 |
| Loops with a fixer | 20 | 23 | 22 | 20 | 21 | 22 | 22 | 22 |
| Fixer seconds median | 75.0 | 70.6 | 96.7 | 90.7 | 98.2 | 91.8 | 126.5 | 152.6 |
| Fixer tokens median | 453046 | 509326 | 594997 | 539923 | 560024 | 579273 | 949399 | 895093 |
| Known found per loop minute | 0.46 | 0.66 | 0.39 | 0.61 | 0.16 | 0.34 | 0.10 | 0.18 |

#### Single reviews

| Measure | low | low-fast | medium | medium-fast | high | high-fast | xhigh | xhigh-fast |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Runs | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 |
| Model | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol |
| Effort | low | low | medium | medium | high | high | xhigh | xhigh |
| Served tier | default | priority | default | priority | default | priority | default | priority |
| Seconds median | 42.8 | 26.4 | 56.2 | 35.3 | 90.7 | 53.0 | 181.8 | 101.1 |
| Seconds min | 22.5 | 13.1 | 42.0 | 18.1 | 48.4 | 31.4 | 99.5 | 59.8 |
| Seconds max | 73.3 | 46.1 | 83.5 | 48.7 | 212.3 | 89.6 | 306.8 | 198.5 |
| Known found per run | 0.53 | 0.53 | 0.63 | 0.63 | 0.63 | 0.70 | 0.73 | 0.70 |
| Escaped per run | 1.47 | 1.47 | 1.37 | 1.37 | 1.37 | 1.30 | 1.27 | 1.30 |
| Valid extras per run | 0.37 | 0.43 | 0.47 | 0.50 | 0.47 | 0.47 | 0.73 | 0.73 |
| Wrong per run | 0.03 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Unjudged per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Unknown ratings per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Unknown pairs per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Tokens median | 206077 | 179609 | 235054 | 251079 | 301042 | 324554 | 554261 | 466490 |

Invalid runs: 5. Each invalid run has a reviewer that read docks skill files (`code-review` references or the `code-clarity` skill) in the repository that holds the reviewer's own agent files. These files are outside the inputs of the run. The runs are `code-102-r1` and `code-89` at high, `code-14-pr15` and `code-89` at xhigh-fast, and `code-57-pr58` at medium-fast. The configuration tables leave out these runs, so high and xhigh-fast have 52 runs and medium-fast has 53 runs.

The second judge agreed with 402 of 418 answers (0.96).

### Held-out cases

#### Decision

| Measure | low | low-fast | medium | medium-fast | high | high-fast | xhigh | xhigh-fast |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Runs | 72 | 72 | 72 | 72 | 72 | 72 | 72 | 72 |
| Known found per run | 0.35 | 0.39 | 0.54 | 0.61 | 0.71 | 0.63 | 0.78 | 0.89 |
| Escaped per run | 2.11 | 2.07 | 1.92 | 1.85 | 1.75 | 1.83 | 1.68 | 1.57 |
| Escaped per 50 known | 42.94 | 42.09 | 38.98 | 37.57 | 35.59 | 37.29 | 34.18 | 31.92 |
| Model | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol |
| Effort | low | low | medium | medium | high | high | xhigh | xhigh |
| Served tier | default | priority | default | priority | default | priority | default | priority |
| Round 1 recall difference from xhigh-fast, 90% interval | [-0.26, -0.10] | [-0.24, -0.07] | [-0.17, -0.04] | [-0.14, -0.03] | [-0.10, 0.00] | [-0.12, -0.03] | [-0.03, 0.02] | - |
| Escaped per 50 known difference from xhigh-fast, 90% interval | [5.75, 14.90] | [4.17, 14.35] | [2.43, 10.70] | [2.17, 8.25] | [0.78, 5.88] | [2.04, 7.83] | [-0.41, 4.35] | - |
| Loop seconds difference from xhigh-fast, 90% interval | [-389.9, -147.1] | [-444.4, -193.0] | [-303.9, -118.7] | [-400.4, -175.7] | [-148.5, -17.6] | [-315.2, -117.7] | [126.1, 340.4] | - |

#### Code loops

| Measure | low | low-fast | medium | medium-fast | high | high-fast | xhigh | xhigh-fast |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Runs | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 |
| Model | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol |
| Effort | low | low | medium | medium | high | high | xhigh | xhigh |
| Served tier | default | priority | default | priority | default | priority | default | priority |
| Round 1 seconds median | 69.8 | 35.0 | 79.3 | 44.4 | 160.6 | 85.7 | 319.1 | 170.3 |
| Round 1 seconds min | 40.0 | 25.5 | 43.1 | 26.8 | 59.6 | 36.4 | 138.9 | 85.9 |
| Round 1 seconds max | 106.0 | 97.4 | 193.9 | 113.8 | 473.8 | 215.0 | 706.9 | 436.4 |
| Round 1 modes | panel 30 | panel 30 | panel 30 | panel 30 | panel 30 | panel 30 | panel 30 | panel 30 |
| Round 1 known found per run | 0.27 | 0.20 | 0.37 | 0.40 | 0.57 | 0.53 | 0.73 | 0.73 |
| Round 2 seconds median | 37.8 | 20.2 | 49.8 | 28.5 | 76.0 | 42.4 | 145.6 | 89.2 |
| Round 2 seconds min | 16.8 | 15.0 | 25.5 | 18.6 | 37.6 | 25.0 | 84.8 | 46.8 |
| Round 2 seconds max | 108.8 | 85.8 | 173.2 | 106.1 | 490.1 | 209.9 | 620.3 | 413.8 |
| Round 2 modes | delta 17, panel 3 | delta 18, panel 2 | delta 18, panel 5 | delta 19, panel 4 | delta 18, panel 5 | delta 21, panel 5 | delta 22, panel 6 | delta 22, panel 6 |
| Round 2 known found per run | 0.05 | 0.05 | 0.09 | 0.13 | 0.17 | 0.08 | 0.04 | 0.25 |
| Round 3 seconds median | 32.4 | 19.1 | 64.3 | 34.8 | 144.9 | 42.0 | 169.4 | 177.8 |
| Round 3 seconds min | 24.4 | 12.4 | 31.7 | 30.7 | 42.8 | 26.8 | 63.4 | 66.0 |
| Round 3 seconds max | 42.5 | 25.8 | 123.6 | 50.5 | 201.2 | 83.6 | 392.1 | 286.4 |
| Round 3 modes | delta 4 | delta 2 | delta 6 | delta 3 | delta 5 | delta 7 | delta 7 | delta 7 |
| Round 3 known found per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Round 4 seconds median | - | - | 43.6 | 21.7 | 60.1 | - | 138.4 | 82.8 |
| Round 4 seconds min | - | - | 32.3 | 20.0 | 56.6 | - | 103.6 | 34.6 |
| Round 4 seconds max | - | - | 54.9 | 23.4 | 113.0 | - | 344.2 | 201.5 |
| Round 4 modes | - | - | delta 2 | delta 2 | delta 3 | - | delta 3 | delta 6 |
| Round 4 known found per run | - | - | 0.00 | 0.00 | 0.00 | - | 0.00 | 0.00 |
| Round 5 seconds median | - | - | - | - | - | - | 123.6 | 70.6 |
| Round 5 seconds min | - | - | - | - | - | - | 123.6 | 39.7 |
| Round 5 seconds max | - | - | - | - | - | - | 123.6 | 101.5 |
| Round 5 modes | - | - | - | - | - | - | delta 1 | delta 2 |
| Round 5 known found per run | - | - | - | - | - | - | 0.00 | 0.00 |
| Rounds median | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 |
| Rounds max | 3 | 3 | 4 | 4 | 4 | 3 | 5 | 5 |
| Loop seconds median | 93.8 | 49.2 | 123.5 | 70.2 | 229.7 | 127.4 | 447.8 | 262.9 |
| Known found per run | 0.30 | 0.23 | 0.43 | 0.50 | 0.70 | 0.60 | 0.77 | 0.97 |
| Escaped per run | 3.00 | 3.07 | 2.87 | 2.80 | 2.60 | 2.70 | 2.53 | 2.33 |
| Valid extras per run | 1.63 | 1.37 | 2.47 | 2.27 | 3.40 | 3.60 | 5.07 | 5.30 |
| Extra-only rounds per run | 0.57 | 0.50 | 0.70 | 0.63 | 0.60 | 0.73 | 0.97 | 1.03 |
| Wrong per run | 0.20 | 0.20 | 0.27 | 0.23 | 0.33 | 0.33 | 0.30 | 0.40 |
| Unjudged per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Unknown ratings per run | 0.03 | 0.00 | 0.03 | 0.00 | 0.10 | 0.00 | 0.07 | 0.03 |
| Unknown pairs per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Tokens median | 981364 | 955989 | 1093212 | 1075931 | 1509396 | 1636417 | 2493684 | 2536651 |
| Side-call tokens median | 0 | 0 | 0 | 0 | 136936 | 0 | 334809 | 182625 |
| Loops with a fixer | 18 | 16 | 22 | 21 | 21 | 26 | 28 | 28 |
| Fixer seconds median | 48.4 | 53.9 | 41.4 | 45.2 | 53.8 | 61.0 | 60.8 | 60.8 |
| Fixer tokens median | 254379 | 214968 | 265957 | 248254 | 307809 | 286160 | 331467 | 315410 |
| Known found per loop minute | 0.17 | 0.25 | 0.17 | 0.36 | 0.14 | 0.24 | 0.08 | 0.16 |

#### Single reviews

| Measure | low | low-fast | medium | medium-fast | high | high-fast | xhigh | xhigh-fast |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Runs | 42 | 42 | 42 | 42 | 42 | 42 | 42 | 42 |
| Model | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol |
| Effort | low | low | medium | medium | high | high | xhigh | xhigh |
| Served tier | default | priority | default | priority | default | priority | default | priority |
| Seconds median | 61.6 | 32.0 | 80.4 | 45.3 | 141.1 | 71.6 | 248.3 | 143.3 |
| Seconds min | 32.7 | 19.6 | 45.4 | 25.7 | 53.1 | 36.9 | 87.4 | 49.8 |
| Seconds max | 117.4 | 52.4 | 137.0 | 74.8 | 331.5 | 154.3 | 489.7 | 246.0 |
| Known found per run | 0.38 | 0.50 | 0.62 | 0.69 | 0.71 | 0.64 | 0.79 | 0.83 |
| Escaped per run | 1.48 | 1.36 | 1.24 | 1.17 | 1.14 | 1.21 | 1.07 | 1.02 |
| Valid extras per run | 0.79 | 0.57 | 0.69 | 0.76 | 0.88 | 0.88 | 0.86 | 0.95 |
| Wrong per run | 0.05 | 0.07 | 0.07 | 0.07 | 0.07 | 0.10 | 0.07 | 0.07 |
| Unjudged per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Unknown ratings per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Unknown pairs per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Tokens median | 206936 | 201420 | 257731 | 248255 | 374114 | 320499 | 526010 | 583906 |

Invalid runs: none.

The second judge agreed with 591 of 596 answers (0.99).

### Decision under the rule

xhigh-fast has the fewest escaped known defects on the held-out cases (31.92 per 50 known), so it is the best configuration. The interval bounds below come from the held-out decision table.

| Configuration | Escaped per 50 known | Escaped-per-50 interval upper bound | Round 1 recall interval lower bound | Not worse than the best |
|---|---:|---|---|---|
| low | 42.94 | 14.90, not below 2 | -0.26, not above -0.05 | No |
| low-fast | 42.09 | 14.35, not below 2 | -0.24, not above -0.05 | No |
| medium | 38.98 | 10.70, not below 2 | -0.17, not above -0.05 | No |
| medium-fast | 37.57 | 8.25, not below 2 | -0.14, not above -0.05 | No |
| high | 35.59 | 5.88, not below 2 | -0.10, not above -0.05 | No |
| high-fast | 37.29 | 7.83, not below 2 | -0.12, not above -0.05 | No |
| xhigh | 34.18 | 4.35, not below 2 | -0.03, above -0.05 | No |
| xhigh-fast | 31.92 | reference | reference | Yes (the best) |

No other configuration is not worse than xhigh-fast. xhigh passes the recall bound but fails the escaped-defect bound. The recommended configuration is xhigh-fast, with a median loop time of 262.9 s on the held-out code loops. This is the production setting, so the reviewer setting stays as it is.

### Observations

- The priority tier cuts round time by about 40-50% at each effort, with the same model and effort. Held-out round 1 seconds median: low 69.8 to 35.0, medium 79.3 to 44.4, high 160.6 to 85.7, xhigh 319.1 to 170.3. Held-out single reviews: 61.6 to 32.0, 80.4 to 45.3, 141.1 to 71.6, 248.3 to 143.3.
- Recall rises with effort. Held-out round 1 known found per run: 0.27 and 0.20 at low, 0.37 and 0.40 at medium, 0.57 and 0.53 at high, 0.73 and 0.73 at xhigh (default and priority tier).
- Valid extra findings rise with effort. Held-out valid extras per run: 1.63 and 1.37 at low, 5.07 and 5.30 at xhigh. Extra-only rounds per run: 0.57 and 0.50 at low, 0.97 and 1.03 at xhigh.
- Known found per loop minute on the held-out code loops is highest at medium-fast (0.36). On the dev code loops it is highest at low-fast (0.66).
- The tier changes tokens little. Held-out code-loop tokens median: xhigh 2493684, xhigh-fast 2536651; low 981364, low-fast 955989.
- xhigh (default tier) is the slowest configuration: its held-out loop seconds interval against xhigh-fast is [126.1, 340.4], and its median loop time is 447.8 s.

### Recommended reviewer setting

The recommended configuration is `xhigh-fast`: the model `openai-codex/gpt-6.1-sol`, the effort `xhigh`, and the OpenAI `priority` service tier. This is the production setting, so keep it. These lines of the omp `config.yml` set it for the `reviewer` model role:

```yaml
modelRoles:
  reviewer: openai-codex/gpt-6.1-sol:xhigh
task:
  agentModelOverrides:
    code-reviewer: "@reviewer"
    plan-reviewer: "@reviewer"
tier:
  openai: priority
```

- `modelRoles.reviewer` holds the model selector of the custom role `reviewer`. The suffix `:xhigh` sets the effort.
- The plan-lifecycle agents `code-reviewer` and `plan-reviewer` set no model, so they run on the model of the parent session unless `task.agentModelOverrides` gives them one. The entries above give each agent the role alias `@reviewer`. Put quotes around an `@` alias in YAML.
- `tier.openai: priority` applies to every OpenAI request of the session, not only to the reviewers. A subagent uses the tier of the main agent while `tier.subagent` has its default value `inherit`. To set the tier of the reviewer agents only, use `task.agentServiceTierOverrides` in place of `tier.openai`:

  ```yaml
  task:
    agentServiceTierOverrides:
      code-reviewer: priority
      plan-reviewer: priority
  ```

### Setup comparisons at xhigh-fast (plan #100 step 6)

#### What ran

- Every arm ran at xhigh-fast: the model `openai-codex/gpt-6.1-sol`, the effort `xhigh`, and the `priority` tier. Each arm ran 3 times on each case.
- Code comparisons: each run is a whole review loop on one of the 10 held-out code cases. The loop rules are the rules of the grid run above (see Setup). The fixer is the same for every arm: gpt-6.1-sol, effort high, priority tier. The arms differ as follows:
  - `B0`: the released 0.16.0 `code-reviewer`. Every round is a full round, because 0.16.0 had no panel and no delta round.
  - `C1`: the 0.17.1 agent. It runs a full round where the 0.17.1 rules select a panel, and it runs delta rounds for repairs. Thus `B0` and `C1` differ in the prompt version and in the round policy (`B0` has no delta rounds).
  - `C3`: the 0.17.1 agent with the 0.17.1 rules (panel, full, and delta rounds). This is the production policy. `C1` and `C3` differ only in the panel.
  - `B1`: the same 0.17.1 agent and round policy as `C3` (the released 0.17.1 files), with the lens scope text added to its panel dispatches. `B1` and `C3` differ only in the dispatch.
- `B0`, `C1`, and `C3` ran in workspace `step6c`, with agents written from baseline 0.16.0. `B1` and a second `C3` ran in workspace `step6d`, with agents written from baseline 0.17.1.
- Plan arms: each run is one round-1 review, because plan cases have one round. `P0` ran on the 14 held-out plan cases. `P1` ran on the 13 plan cases apart from the plan-delta case `plan-33-r2`. `Pd` ran on `plan-33-r2` only. `P0` uses the released 0.16.0 agent. `P1` and `Pd` use the 0.17.1 agents.
- Self-review arms: each run is one review, because the self-review runs once, before round 1. `S1` and `S3` ran on the 10 held-out code cases in workspace `step6b` and are compared with the round-1 reviews of `C3` in that workspace. They run an agent that loads the docks `code-review` and `code-clarity` skills, as the yolo self-review does. `S1` is one agent on the full diff. `S3` is one agent per lens on the focus diff of that lens.
- The decision rule of plan #100 above decides each comparison. The reference of a comparison is the arm with fewer escaped known defects per 50 known. The other arm is not worse when the upper bound of its escaped-per-50 difference interval is below 2 and the lower bound of its round 1 recall difference interval is above -0.05.

#### Loop comparisons

Each cell with a slash gives the first arm, then the second arm. The interval columns give the 90% interval of the difference of the other arm from the reference. Loop seconds add the rounds of a loop and leave out the fixer. A dash means no value.

| Comparison | Runs | Known found per run | Escaped per 50 known | Reference | Round 1 recall difference, 90% interval | Escaped per 50 known difference, 90% interval | Loop seconds median | Loop seconds difference, 90% interval | Rounds median | Rounds max | Valid extras per run | Extra-only rounds per run | Wrong per run | Tokens median |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| B0 (0.16.0, full rounds) / C3 (0.17.1, production) | 29 / 30 | 0.62 / 0.80 | 40.63 / 37.88 | C3 | [-0.17, 0.00] | [0.00, 5.73] | 241.4 / 270.9 | [-81.8, 113.9] | 2 / 2 | 5 / 5 | 1.86 / 5.10 | 0.66 / 1.03 | 0.10 / 0.43 | 1131258 / 2519623 |
| C1 (one full reviewer) / C3 (panel) | 30 / 30 | 0.63 / 0.80 | 40.40 / 37.88 | C3 | [-0.05, 0.00] | [0.00, 4.39] | 248.1 / 270.9 | [-49.2, 76.1] | 2 / 2 | 5 / 5 | 3.27 / 5.10 | 0.93 / 1.03 | 0.20 / 0.43 | 1083180 / 2519623 |
| B0 / C1 (prompt version and round policy differ: 0.16.0 full rounds only / 0.17.1 with delta rounds) | 29 / 30 | 0.62 / 0.63 | 40.63 / 40.40 | C1 | [-0.14, 0.00] | [-2.33, 5.26] | 241.4 / 248.1 | [-64.4, 94.8] | 2 / 2 | 5 / 5 | 1.86 / 3.27 | 0.66 / 0.93 | 0.10 / 0.20 | 1131258 / 1083180 |
| B1 (lens text also in the dispatch) / C3 (lens text in the reference only), same 0.17.1 agent | 30 / 30 | 0.70 / 0.77 | 39.39 / 38.38 | C3 | [-0.05, 0.04] | [-1.75, 2.42] | 304.6 / 229.3 | [34.4, 140.2] | 2 / 2 | 5 / 5 | 7.70 / 5.20 | 1.47 / 0.93 | 0.40 / 0.33 | 2400015 / 2171104 |

The `C3` of the last row is the second `C3` from workspace `step6d`, so its values differ from the `C3` of the other rows (workspace `step6c`).

#### Round-1 comparisons

Seconds is the round 1 time of the slowest reviewer. The `C3` of the self-review rows is the round-1 review of `C3` in workspace `step6b`.

| Comparison | Runs | Known found per run | Escaped per 50 known | Reference | Recall difference, 90% interval | Escaped per 50 known difference, 90% interval | Seconds median | Valid extras per run | Wrong per run | Tokens median |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 (self-review, one agent) / C3 | 30 / 30 | 0.50 / 0.60 | 42.42 / 40.91 | C3 | [-0.06, 0.02] | [-0.79, 2.78] | 184.8 / 203.6 | 1.63 / 3.63 | 0.23 / 0.27 | 618591 / 1696123 |
| S3 (self-review, one agent per lens) / C3 | 30 / 30 | 0.67 / 0.60 | 39.90 / 40.91 | S3 | [-0.11, 0.02] | [-0.78, 5.26] | 198.1 / 203.6 | 4.57 / 3.63 | 0.57 / 0.27 | 1471180 / 1696123 |
| S1 / S3 | 30 / 30 | 0.50 / 0.67 | 42.42 / 39.90 | S3 | [-0.11, -0.02] | [0.98, 5.26] | 184.8 / 198.1 | 1.63 / 4.57 | 0.23 / 0.57 | 618591 / 1471180 |
| P0 (0.16.0 plan) / P1 (0.17.1 plan) | 39 / 39 | 0.85 / 0.69 | 27.70 / 32.00 | P0 | [-0.18, 0.02] | [-1.19, 8.89] | 126.3 / 153.7 | 0.87 / 1.00 | 0.13 / 0.08 | 614921 / 591010 |

#### Decision under the rule

The code prompt, panel, and lens-text rows come from the loop comparisons. The self-review and plan rows come from the round-1 comparisons.

| Comparison | Reference | Escaped-per-50 interval upper bound | Recall interval lower bound | Result | Decision |
|---|---|---|---|---|---|
| 0.16.0 against 0.17.1 code prompt (B0 against C3) | C3 | 5.73, not below 2 | -0.17, not above -0.05 | B0 is not shown not worse than C3. | The 0.17.1 code prompt and its rules stay. |
| Full reviewer against panel (C1 against C3) | C3 | 4.39, not below 2 | -0.05, not above -0.05 | C1 is not shown not worse than C3. | The panel stays for round 1. The loop seconds difference interval includes zero. |
| Prompt version and round policy: 0.16.0 full rounds only against 0.17.1 with delta rounds (B0 against C1) | C1 | 5.26, not below 2 | -0.14, not above -0.05 | B0 is not shown not worse than C1. | No separate decision. This row agrees with the first row. |
| Lens text in the dispatch against in a reference (B1 against C3) | C3 | 2.42, not below 2 | -0.05, not above -0.05 | B1 is not shown not worse than C3. B1 loops are also slower: the loop seconds difference interval is [34.4, 140.2] s. | The lens text stays in a reference. Limit: the 0.17.1 agent loads the lens reference in both arms, and B1 adds the short lens scope summary to the dispatch. So this row compares the reference plus a dispatch summary against the reference only. |
| One self-reviewer against panel (S1 against C3) | C3 | 2.78, not below 2 | -0.06, not above -0.05 | S1 is not shown not worse than C3. | The self-review runs before code-review round 1 and does not replace it. See Leads from #98. |
| Split self-review against panel (C3 against S3) | S3 | 5.26, not below 2 | -0.11, not above -0.05 | C3 is not shown not worse than S3. | The self-review runs before code-review round 1 and does not replace it. See Leads from #98. |
| One self-reviewer against split self-review (S1 against S3) | S3 | 5.26, not below 2 | -0.11, not above -0.05 | S1 is worse than S3. Both intervals exclude zero. | See Leads from #98. |
| 0.16.0 against 0.17.1 plan prompt (P1 against P0) | P0 | 8.89, not below 2 | -0.18, not above -0.05 | P0 has fewer escaped defects, and P1 is not shown not worse. Both intervals include zero, so the data also shows no proven loss. | The rule names P0 the better plan prompt. This plan does not change the plugins (they are under Do not touch), so the 0.17.1 plan prompt stays for now. Record this as a lead for a follow-up plan that examines what changed in the 0.17.x `plan-reviewer`. |

#### Leads from #98

- Self-review. The self-review keeps unique findings, so it stays. On the 10 code cases, S1 found 2 known defects in 2 cases that no C3 run found (`code-102-r3`: `B102-4`; `code-98-r1`: `B98-1`). S3 found 1 such defect (`code-98-r1`: `B98-1`).
- Split self-review. S3 found more known defects than one self-reviewer: 0.67 against 0.50 per run, and S1 is worse than S3 under the rule. The round time is about the same: 198.1 s against 184.8 s median. But S3 has more wrong findings (0.57 against 0.23 per run) and more tokens (1471180 against 618591 median). Record this as a lead for a follow-up yolo change, because this plan does not change the plugins.
- Unjudged stop. The report stops on a finding with neither a match nor an adjudication. Step 2 of this plan added this stop. No run in this benchmark stopped.
- Extra findings of the report-every-LOW stance. See the loop comparisons above. `Valid extras per run` is 5.10 for C3 (0.17.1, production), 3.27 for C1, and 1.86 for B0 (0.16.0). `Extra-only rounds per run` is 1.03 for C3, 0.93 for C1, and 0.66 for B0.
- Second judge. The second judge agreed with 402 of 418 answers on the dev cases (0.96) and with 591 of 596 answers on the held-out cases (0.99). The run of plan #98 rated every finding valid. In plan #100, wrong ratings are no longer zero. See the Wrong rows of the tables above.

#### Invalid and discarded runs

- Code loops: 1 of 30 `B0` loops is invalid. The `B0` reviewer of `code-79-pr80` run 1 read its case folder. The comparisons leave out this loop, so `B0` has 29 runs. The lens loops (`B1` and the second `C3`) have no invalid runs.
- Incomplete rounds: a round with a reviewer block that holds no review ran again before scoring. This occurred 2 times in `step6c` and 3 times in `step6d`.
- Round-1 code run (`step6b`, the source of the self-review rows): 1 of 180 runs is invalid. The `B0` reviewer of `code-35-pr36` run 3 read the case folder itself.
- Plan arms: 3 of 42 `P0` runs are invalid. Their reviewers read the omp harness documentation through `omp://`, on `plan-74-r1` (runs 1 and 2) and `plan-98-r1` (run 3). The comparisons leave out these runs, so `P0` has 39 runs.
- The first step 6 code run (workspace `step6`) is discarded, because its 0.16.0 reviewers read the installed 0.17.1 `code-reviewer` skill through `skill://`. The plan comparisons come from `step6`.
- The single-round code comparison of workspace `step6b` is superseded by the loops for the prompt, panel, and lens-text decisions. It stays the source of the self-review lead.

### Corpus (plan #100 step 7)

The held-out keys and inputs are now in `cases/heldout/`: 24 key files and their fix patches. The held-out case files no longer list `external` inputs. So every case builds and scores without `--keys`.

| |dev|held-out|
|---|---|---|
|Cases|18: code 8, code-delta 2, plan 6, plan-delta 2|24: code 10, plan 13, plan-delta 1|
|Known defects|50: code 30, code-delta 1, plan 18, plan-delta 1|59: code 33, plan 25, plan-delta 1|
|Code categories|code 13, test 11, shipped-skill-text 6, docs 1|code 16, shipped-skill-text 13, test 4|
|Plan categories|research_gap 11, goal_fit 7, security_risk 1|goal_fit 14, research_gap 12|
|Source: escaped|9|15|
|Source: self-review|4|2|
|Source: review rounds|30|42|
|Source: seeded|7|0|

- "Review rounds" groups the key sources `round`, `missed-by-round`, `single-lens`, `after-pass`, and `review-round`. Dev: 15, 7, 2, 5, and 1. Held-out: 20, 18, 3, 1, and 0.
- The dev cases `code-96-delta-real` and `plan-96-delta` have no known defects. The planted defect of `plan-96-delta-planted` counts as seeded.

## Run 2026-10-25: plan-reviewer prompts at xhigh (plan #109)

### Setup

- Model: `openai-codex/gpt-6.1-sol`. Effort: `xhigh`. Service tier: `default`. The user turned fast mode off for these tests.
- At most 16 agents ran at a time.
- Variants (arm `V<name>-xhigh`):
  - `V16`: the plan reviewer of plan-lifecycle 0.16.0. It has no delta mode, so it runs full rounds only, also on the plan-delta cases.
  - `V17`: the plan reviewer of plan-lifecycle 0.17.1, with its delta mode.
  - `Va`, `Vb`, `Vc`: the nested candidates A, B, and C of plan #109 decision 1. Each also has the plan-reviewer contract sentence of decision 7: plan reviewers treat the choice of a recorded decision as settled and report a false premise or a broken effect. The candidates are on local refs.
- One run is a single review.

### Decision rule (plan #109, fixed before the held-out runs)

A variant replaces V17 only when all of these are true on the held-out cases: it has fewer escaped known defects per 50 known than V17; against V17, its escaped-per-50 difference 90% interval stays below 2 and its round-1 recall difference interval stays above -0.05; and it has at most 0.10 more wrong findings per run than V17. Among the variants that pass, the variant with the fewest escaped defects wins. A tie goes to the lower median time. When no variant passes, V17 stays, and this log records the measured differences. A V16 win ships the 0.16.0 text with the 0.17.1 delta mode added, on a named local ref. This log then names the ref and records that the combination was not measured as a whole.

### Dev check

Dev P0/P1 experiment (before the candidates; 3 runs per case): the 0.16.0 prompt (P0) found 0.79 known defects per run, and the 0.17.1 prompt (P1) found 0.78. P1 against P0 on the 6 shared cases: recall difference 90% interval [-0.13, 0.08], escaped per 50 known difference 90% interval [-3.92, 6.25]. Both intervals include zero.

The five variants ran 3 times on each of the 8 dev plan cases. Every run is valid. An interval row gives the 90% paired bootstrap interval of the difference from V17-xhigh.

#### Decision

| Measure | V16-xhigh | V17-xhigh | Va-xhigh | Vb-xhigh | Vc-xhigh |
|---|---:|---:|---:|---:|---:|
| Runs | 24 | 24 | 24 | 24 | 24 |
| Cases | 8 | 8 | 8 | 8 | 8 |
| Known found per run | 0.83 | 0.63 | 1.00 | 1.08 | 1.08 |
| Escaped per run | 1.54 | 1.75 | 1.38 | 1.29 | 1.29 |
| Escaped per 50 known | 32.46 | 36.84 | 28.95 | 27.19 | 27.19 |
| Model | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol |
| Effort | xhigh | xhigh | xhigh | xhigh | xhigh |
| Served tier | default | default | default | default | default |
| Cases shared with V17-xhigh | 8 | - | 8 | 8 | 8 |
| Round 1 recall difference from V17-xhigh, 90% interval | [-0.10, 0.24] | - | [0.10, 0.20] | [0.12, 0.24] | [0.12, 0.24] |
| Escaped per 50 known difference from V17-xhigh, 90% interval | [-11.90, 4.76] | - | [-9.80, -4.76] | [-11.90, -6.06] | [-11.90, -6.06] |
| Loop seconds difference from V17-xhigh, 90% interval | - | - | - | - | - |

#### Single reviews

| Measure | V16-xhigh | V17-xhigh | Va-xhigh | Vb-xhigh | Vc-xhigh |
|---|---:|---:|---:|---:|---:|
| Runs | 24 | 24 | 24 | 24 | 24 |
| Model | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol |
| Effort | xhigh | xhigh | xhigh | xhigh | xhigh |
| Served tier | default | default | default | default | default |
| Seconds median | 211.9 | 178.3 | 228.6 | 192.9 | 241.8 |
| Seconds min | 95.0 | 98.9 | 114.0 | 94.2 | 125.0 |
| Seconds max | 368.0 | 322.7 | 397.8 | 350.1 | 422.2 |
| Known found per run | 0.83 | 0.63 | 1.00 | 1.08 | 1.08 |
| Escaped per run | 1.54 | 1.75 | 1.38 | 1.29 | 1.29 |
| Valid extras per run | 0.54 | 0.67 | 0.96 | 1.29 | 1.25 |
| Wrong per run | 0.00 | 0.00 | 0.00 | 0.08 | 0.00 |
| Unjudged per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Unknown ratings per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.04 |
| Unknown pairs per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Tokens median | 949928 | 546686 | 570110 | 574674 | 688530 |

#### Known defects found

Each cell gives the number of runs, out of 3, that found the known defect. A script counted the `Found` column of the run table of the dev report.

| Case | Known defect | V16 | V17 | Va | Vb | Vc |
|---|---|---:|---:|---:|---:|---:|
| plan-102-r1 | P102-1 | 3 of 3 | 3 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |
| plan-23-r1 | P23-1 | 3 of 3 | 3 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |
| plan-57-r1 | P57-1 | 1 of 3 | 0 of 3 | 2 of 3 | 3 of 3 | 3 of 3 |
| plan-57-r1 | P57-2 | 0 of 3 | 0 of 3 | 0 of 3 | 0 of 3 | 0 of 3 |
| plan-57-r1 | P57-3 | 0 of 3 | 0 of 3 | 0 of 3 | 0 of 3 | 0 of 3 |
| plan-57-r1 | P57-4 | 0 of 3 | 0 of 3 | 0 of 3 | 0 of 3 | 0 of 3 |
| plan-57-r1 | P57-5 | 0 of 3 | 0 of 3 | 0 of 3 | 0 of 3 | 0 of 3 |
| plan-83-r1 | P83-1 | 3 of 3 | 2 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |
| plan-83-r1 | P83-2 | 3 of 3 | 0 of 3 | 0 of 3 | 0 of 3 | 0 of 3 |
| plan-89-r1 | P89-1 | 2 of 3 | 0 of 3 | 0 of 3 | 1 of 3 | 1 of 3 |
| plan-89-r1 | P89-2 | 0 of 3 | 1 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |
| plan-89-r1 | P89-3 | 0 of 3 | 0 of 3 | 0 of 3 | 0 of 3 | 0 of 3 |
| plan-96-delta-planted | PPD96-1 | 0 of 3 | 3 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |
| plan-96-r1 | P96-1 | 0 of 3 | 0 of 3 | 0 of 3 | 0 of 3 | 0 of 3 |
| plan-96-r1 | P96-2 | 2 of 3 | 1 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |
| plan-96-r1 | P96-3 | 0 of 3 | 0 of 3 | 0 of 3 | 0 of 3 | 0 of 3 |
| plan-96-r1 | P96-4 | 3 of 3 | 2 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |
| plan-96-r1 | P96-5 | 0 of 3 | 0 of 3 | 1 of 3 | 1 of 3 | 1 of 3 |
| plan-96-r1 | P96-6 | 0 of 3 | 0 of 3 | 0 of 3 | 0 of 3 | 0 of 3 |

- Some targets of candidate A improved. P96-2: V17 1 of 3, Va, Vb, and Vc 3 of 3. P57-1 (V17 0 of 3, Va 2 of 3, Vb and Vc 3 of 3) and P89-2 (V17 1 of 3, Va, Vb, and Vc 3 of 3) also improved.
- No variant found the targets P89-3, P96-1, P57-4, P57-5, and P96-6.
- V16 found defects that the other variants missed or found less often. P83-2: V16 3 of 3, the other variants 0 of 3. P89-1: V16 2 of 3, Vb and Vc 1 of 3, V17 and Va 0 of 3.
- No candidate was revised on dev. The targets that no variant found need deeper checks of external tools, and the dev check could not attribute them to one change.

### Held-out cases

- Cases: the 16 held-out plan cases. These are the 14 held-out plan cases of plan #100 and the new cases `plan-100-r1` and `plan-100-r5`.
- Each variant ran 5 times on each case. The runs of all arms were mixed in one dispatch queue.
- Model: `openai-codex/gpt-6.1-sol`. Effort: `xhigh`. Service tier: `default`.
- An interval row gives the 90% paired bootstrap interval of the difference from V17-xhigh. A script copied the tables from the held-out report.

#### Decision

| Measure | V16-xhigh | V17-xhigh | Va-xhigh | Vb-xhigh | Vc-xhigh |
|---|---:|---:|---:|---:|---:|
| Runs | 78 | 80 | 80 | 80 | 80 |
| Cases | 16 | 16 | 16 | 16 | 16 |
| Known found per run | 1.04 | 0.89 | 1.04 | 1.15 | 1.11 |
| Escaped per run | 0.91 | 1.05 | 0.90 | 0.79 | 0.82 |
| Escaped per 50 known | 23.36 | 27.10 | 23.23 | 20.32 | 21.29 |
| Model | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol |
| Effort | xhigh | xhigh | xhigh | xhigh | xhigh |
| Served tier | default | default | default | default | default |
| Cases shared with V17-xhigh | 16 | - | 16 | 16 | 16 |
| Round 1 recall difference from V17-xhigh, 90% interval | [0.03, 0.13] | - | [0.02, 0.12] | [0.06, 0.19] | [0.04, 0.17] |
| Escaped per 50 known difference from V17-xhigh, 90% interval | [-6.25, -1.43] | - | [-6.05, -0.95] | [-9.74, -3.18] | [-8.60, -1.92] |
| Loop seconds difference from V17-xhigh, 90% interval | - | - | - | - | - |

#### Single reviews

| Measure | V16-xhigh | V17-xhigh | Va-xhigh | Vb-xhigh | Vc-xhigh |
|---|---:|---:|---:|---:|---:|
| Runs | 78 | 80 | 80 | 80 | 80 |
| Model | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol |
| Effort | xhigh | xhigh | xhigh | xhigh | xhigh |
| Served tier | default | default | default | default | default |
| Seconds median | 183.1 | 229.8 | 245.7 | 264.5 | 280.2 |
| Seconds min | 82.5 | 63.7 | 70.2 | 91.4 | 99.0 |
| Seconds max | 351.8 | 548.8 | 529.5 | 497.6 | 674.3 |
| Known found per run | 1.04 | 0.89 | 1.04 | 1.15 | 1.11 |
| Escaped per run | 0.91 | 1.05 | 0.90 | 0.79 | 0.82 |
| Valid extras per run | 0.78 | 0.99 | 1.26 | 1.54 | 1.59 |
| Wrong per run | 0.08 | 0.10 | 0.06 | 0.33 | 0.49 |
| Unjudged per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Unknown ratings per run | 0.01 | 0.00 | 0.00 | 0.00 | 0.03 |
| Unknown pairs per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Tokens median | 615571 | 568083 | 587798 | 633236 | 759048 |

Invalid runs: 2 of 80 V16 runs. Their reviewers read the omp harness documentation through `omp://`, on `plan-74-r1` (run 4) and `plan-98-r1` (run 4). The tables leave out these runs, so V16 has 78 runs.

The second judge agreed with 278 of 289 answers (0.96).

### Decision under the rule (plan #109)

The rule of decision 5 has three conditions against V17: fewer escaped known defects per 50 known than V17 (27.10); an escaped-per-50 interval upper bound below 2 and a round-1 recall interval lower bound above -0.05; and at most 0.10 more wrong findings per run than V17 (0.10), thus at most 0.20. The values come from the held-out tables above.

| Variant | Escaped per 50 known | Escaped-per-50 interval upper bound | Round 1 recall interval lower bound | Wrong per run | Passes |
|---|---:|---|---|---|---|
| V16 | 23.36 | -1.43, below 2 | 0.03, above -0.05 | 0.08, at most 0.20 | Yes |
| V17 | 27.10 | reference | reference | 0.10, reference | Reference |
| Va | 23.23 | -0.95, below 2 | 0.02, above -0.05 | 0.06, at most 0.20 | Yes |
| Vb | 20.32 | -3.18, below 2 | 0.06, above -0.05 | 0.33, not at most 0.20 | No |
| Vc | 21.29 | -1.92, below 2 | 0.04, above -0.05 | 0.49, not at most 0.20 | No |

- V16 and Va pass all three conditions.
- Vb fails on wrong findings (0.33 per run), although it lets the fewest known defects escape (20.32 per 50 known).
- Vc fails on wrong findings (0.49 per run).
- Of V16 and Va, Va has fewer escaped defects (23.23 against 23.36). Thus candidate A wins and replaces the 0.17.1 plan reviewer.
- Va against V16 shows no proven difference: round-1 recall difference 90% interval [-0.08, 0.06], escaped per 50 known difference 90% interval [-3.13, 3.80] (held-out report of Va against V16). Thus the gain over 0.17.1 comes from the one change group of candidate A: a recorded decision settles the choice but not its premises or its effects, and the repository instructions and the plan contract rank above the decisions of the plan.

### Observations

- The lighter finding bar of candidates B and C found the most known defects (1.15 and 1.11 per run), but it also gave 3 to 5 times the wrong findings of V17 (0.33 and 0.49 against 0.10 per run).
- The time per review rises from V16 to Vc. Seconds median: V16 183.1, V17 229.8, Va 245.7, Vb 264.5, Vc 280.2.
- V17 had the lowest recall of the five variants on the held-out cases (0.89 known found per run), as the 0.17.1 plan prompt did against the 0.16.0 prompt in plan #100 step 6.
- Tokens median: V16 615571, V17 568083, Va 587798, Vb 633236, Vc 759048. Va used more tokens than V17 and fewer than V16. Vc used the most.
- The dev check pointed the same way: on dev, Va, Vb, and Vc also had fewer escaped defects than V17, with intervals that exclude zero.
