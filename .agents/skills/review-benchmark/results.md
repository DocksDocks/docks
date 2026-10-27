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
- An interval row gives the 90% paired bootstrap interval of the difference from V17-xhigh. A script copied the tables from the final held-out report. That report has the overlay runs below in place of the first runs on 5 cases.

Contract overlay: code review round 1 found that the benchmark prompt sent every reviewer to the plan contract of the case's snapshot. Thus the first held-out runs measured candidates A, B, and C without their change to the contract sentence "Reviewers treat a recorded decision as settled". All 104 runs of each variant (24 dev runs and 80 held-out runs) read the snapshot contract. The sentence is in the snapshot contract of 5 of the 16 cases: `plan-100-r1`, `plan-100-r5`, `plan-98-r1`, `plan-98-r4`, and `plan-98-r6`. On the other 11 cases the sentence is absent, so nothing counteracted the candidates there. On those 5 cases, all five variants ran again in one batch (5 runs each). Each candidate's contract change was applied to a copy of the snapshot contract, and the prompt of the candidate named that copy. The change applied in every run. All 25 re-run transcripts of each candidate read their copy, and 20 of 25 also read the snapshot contract. Decision 5 was applied again, unchanged, with these runs in place of the first runs on the 5 cases.

The first runs gave these values. Escaped per 50 known: V16 23.36, V17 27.10, Va 23.23, Vb 20.32, Vc 21.29. Wrong per run: 0.08, 0.10, 0.06, 0.33, 0.49. Under decision 5 they gave the same decision as the final runs.

#### Decision

| Measure | V16-xhigh | V17-xhigh | Va-xhigh | Vb-xhigh | Vc-xhigh |
|---|---:|---:|---:|---:|---:|
| Runs | 78 | 80 | 80 | 80 | 80 |
| Cases | 16 | 16 | 16 | 16 | 16 |
| Known found per run | 0.97 | 0.82 | 1.06 | 1.13 | 1.14 |
| Escaped per run | 0.97 | 1.11 | 0.88 | 0.81 | 0.80 |
| Escaped per 50 known | 25.00 | 28.71 | 22.58 | 20.97 | 20.65 |
| Model | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol |
| Effort | xhigh | xhigh | xhigh | xhigh | xhigh |
| Served tier | default | default | default | default | default |
| Cases shared with V17-xhigh | 16 | - | 16 | 16 | 16 |
| Round 1 recall difference from V17-xhigh, 90% interval | [0.02, 0.13] | - | [0.05, 0.19] | [0.08, 0.23] | [0.08, 0.25] |
| Escaped per 50 known difference from V17-xhigh, 90% interval | [-6.58, -1.07] | - | [-9.43, -2.50] | [-11.29, -3.87] | [-12.33, -3.81] |
| Loop seconds difference from V17-xhigh, 90% interval | - | - | - | - | - |

#### Single reviews

| Measure | V16-xhigh | V17-xhigh | Va-xhigh | Vb-xhigh | Vc-xhigh |
|---|---:|---:|---:|---:|---:|
| Runs | 78 | 80 | 80 | 80 | 80 |
| Model | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol |
| Effort | xhigh | xhigh | xhigh | xhigh | xhigh |
| Served tier | default | default | default | default | default |
| Seconds median | 187.9 | 232.6 | 259.4 | 271.4 | 315.4 |
| Seconds min | 82.5 | 63.7 | 70.2 | 91.4 | 99.0 |
| Seconds max | 413.7 | 541.8 | 539.3 | 681.7 | 864.0 |
| Known found per run | 0.97 | 0.82 | 1.06 | 1.13 | 1.14 |
| Escaped per run | 0.97 | 1.11 | 0.88 | 0.81 | 0.80 |
| Valid extras per run | 0.76 | 0.96 | 1.21 | 1.52 | 1.51 |
| Wrong per run | 0.12 | 0.10 | 0.16 | 0.38 | 0.47 |
| Unjudged per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Unknown ratings per run | 0.00 | 0.00 | 0.00 | 0.01 | 0.01 |
| Unknown pairs per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Tokens median | 624846 | 527959 | 594345 | 639642 | 801540 |

Invalid runs: 2 of 80 V16 runs. Their reviewers read the omp harness documentation through `omp://`, on `plan-74-r1` (run 4) and `plan-98-r1` (run 4). The tables leave out these runs, so V16 has 78 runs.

The second judge agreed with 277 of 289 answers (0.96).

### Decision under the rule (plan #109)

The rule of decision 5 has three conditions against V17: fewer escaped known defects per 50 known than V17 (28.71); an escaped-per-50 interval upper bound below 2 and a round-1 recall interval lower bound above -0.05; and at most 0.10 more wrong findings per run than V17 (0.10), thus at most 0.20. The values come from the final held-out tables above.

| Variant | Escaped per 50 known | Escaped-per-50 interval upper bound | Round 1 recall interval lower bound | Wrong per run | Passes |
|---|---:|---|---|---|---|
| V16 | 25.00 | -1.07, below 2 | 0.02, above -0.05 | 0.12, at most 0.20 | Yes |
| V17 | 28.71 | reference | reference | 0.10, reference | Reference |
| Va | 22.58 | -2.50, below 2 | 0.05, above -0.05 | 0.16, at most 0.20 | Yes |
| Vb | 20.97 | -3.87, below 2 | 0.08, above -0.05 | 0.38, not at most 0.20 | No |
| Vc | 20.65 | -3.81, below 2 | 0.08, above -0.05 | 0.47, not at most 0.20 | No |

- V16 and Va pass all three conditions.
- Vb fails on wrong findings (0.38 per run), although it lets few known defects escape (20.97 per 50 known).
- Vc fails on wrong findings (0.47 per run), although it lets the fewest known defects escape (20.65 per 50 known).
- Of V16 and Va, Va has fewer escaped defects (22.58 against 25.00). Thus candidate A wins and replaces the 0.17.1 plan reviewer, as in the first runs.
- Va against V16 shows no proven difference: round-1 recall difference 90% interval [-0.00, 0.09], escaped per 50 known difference 90% interval [-4.32, 0.11] (held-out report of Va against V16, with the overlay runs). Thus the gain over 0.17.1 comes from the one change group of candidate A: a recorded decision settles the choice but not its premises or its effects, and the repository instructions and the plan contract rank above the decisions of the plan.

### Observations

- The lighter finding bar of candidates B and C found the most known defects (1.13 and 1.14 per run), but it also gave 3 to 5 times the wrong findings of V17 (0.38 and 0.47 against 0.10 per run).
- The time per review rises from V16 to Vc. Seconds median: V16 187.9, V17 232.6, Va 259.4, Vb 271.4, Vc 315.4.
- V17 had the lowest recall of the five variants on the held-out cases (0.82 known found per run), as the 0.17.1 plan prompt did against the 0.16.0 prompt in plan #100 step 6.
- Tokens median: V16 624846, V17 527959, Va 594345, Vb 639642, Vc 801540. Va used more tokens than V17 and fewer than V16. Vc used the most.
- The dev check pointed the same way: on dev, Va, Vb, and Vc also had fewer escaped defects than V17, with intervals that exclude zero.

## Run 2026-10-25: plan-reviewer candidates with web evidence (plan #111)

### Setup

- Model: `openai-codex/gpt-6.1-sol`. Efforts: `xhigh` and `high`. Service tier: `default`. The user turned fast mode off for these tests.
- Web evidence (plan #111 decision 1): the benchmark opening tells every reviewer to take repository evidence only from the snapshot and the named files. The reviewer may read official documentation on the web, but no page of the benchmark repository. Both judges get the same evidence: a judge may read official documentation pages to decide a claim about an external tool, library, or API, but no page of the benchmark repository.
- The plan #100 and #109 comparisons ran without web evidence for every prompt except 0.16.0. Thus their absolute numbers for the current prompts are lower bounds.
- Variants (arm `V<name>-<effort>`). The variant refs are local:
  - `Vac`: candidate A of plan #109 plus the plan finding field `class:` and omp's `web_search` in the tools. Ref `bench-111/cand-ac`. It ran at `xhigh` and at `high`.
  - `Vd1`: Ac plus the parts of candidate B that keep A's precision, plus three safeguards (plan #111 decision 2). Ref `bench-111/cand-d1`.
  - `Vd2`: D1 plus the external-behavior check: for each external tool, command, library, or API that a step relies on, name the behavior that the step needs, read the official page, and report a contradiction or a gap. Ref `bench-111/cand-d2`.
- One run is a single review.
- The diff of each variant against the `reviewer_tools` commit `b040c3bd` is kept as the record in `variants/plan-111-cand-ac.patch`, `plan-111-cand-d1.patch`, and `plan-111-cand-d2.patch`, because the local refs are removed after the merge.

### Decision rule (plan #111, fixed before the held-out runs)

At `xhigh`, default tier, with the arms mixed in one dispatch queue, D2 replaces Ac only when all of these are true. On the new held-out cases: D2 has fewer escaped known defects per 50 known than Ac; against Ac, its escaped-per-50 difference 90% interval stays below 2 and its round-1 recall difference interval stays above -0.05; and its wrong findings per run and its unknown findings per run are each at most 0.10 more than Ac's. On the #109 held-out cases: its escaped-per-50 difference interval against Ac stays below 2 and its recall difference interval stays above -0.05. When D2 does not pass, Ac ships. The same bounds compare Ac-high with Ac-xhigh (decision 3). The recommended effort becomes `high` only when Ac ships and Ac-high is not worse than Ac-xhigh. When D2 wins, the recommendation stays `xhigh`, because D2 is not measured at `high`.

### Dev check

The four arms ran 3 times on each of the 7 dev plan cases: `plan-102-r1`, `plan-23-r1`, `plan-57-r1`, `plan-83-r1`, `plan-89-r1`, `plan-96-delta-planted`, and `plan-96-r1`. Every run is valid. Every valid run shows the model `openai-codex/gpt-6.1-sol`, its effort, and the served tier `default`.

#### Arms

A script computed this table from the Runs table of the dev report, because the configuration tables of the report group the runs by effort, not by variant.

| Measure | Vac-xhigh | Vac-high | Vd1-xhigh | Vd2-xhigh |
|---|---:|---:|---:|---:|
| Runs | 21 | 21 | 21 | 21 |
| Cases | 7 | 7 | 7 | 7 |
| Effort | xhigh | high | xhigh | xhigh |
| Known found per run | 1.62 | 1.62 | 1.57 | 1.81 |
| Escaped per run | 1.10 | 1.10 | 1.14 | 0.90 |
| Escaped per 50 known | 20.18 | 20.18 | 21.05 | 16.67 |
| Valid extras per run | 1.38 | 0.95 | 1.48 | 1.52 |
| Wrong per run | 0.05 | 0.10 | 0.10 | 0.05 |
| Unknown ratings per run | 0.00 | 0.00 | 0.00 | 0.00 |
| Seconds median | 377.9 | 200.9 | 384.7 | 484.5 |
| Seconds min | 177.3 | 94.8 | 153.3 | 192.1 |
| Seconds max | 530.4 | 313.9 | 609.4 | 799.9 |
| Tokens median | 842168 | 525164 | 881696 | 1207052 |

#### Efforts

The decision table of the dev report compares the efforts. Its `xhigh` column pools Vac-xhigh, Vd1-xhigh, and Vd2-xhigh (63 runs), so it is not Vac-xhigh alone. The `high` column is Vac-high (21 runs). An interval row gives the 90% paired bootstrap interval of the difference from `xhigh`.

| Measure | xhigh | high |
|---|---:|---:|
| Runs | 63 | 21 |
| Known found per run | 1.67 | 1.62 |
| Escaped per 50 known | 19.30 | 20.18 |
| Seconds median | 401.5 | 200.9 |
| Round 1 recall difference from xhigh, 90% interval | - | [-0.04, 0.04] |
| Escaped per 50 known difference from xhigh, 90% interval | - | [-2.08, 2.22] |

#### Known defects found

Each cell gives the number of runs, out of 3, that found the known defect. A script counted the `Found` column of the run table of the dev report. The table leaves out the known defects that no arm found.

| Case | Known defect | Vac-high | Vac-xhigh | Vd1 | Vd2 |
|---|---|---:|---:|---:|---:|
| plan-102-r1 | P102-1 | 3 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |
| plan-23-r1 | P23-1 | 3 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |
| plan-57-r1 | P57-1 | 0 of 3 | 0 of 3 | 1 of 3 | 2 of 3 |
| plan-57-r1 | P57-2 | 2 of 3 | 1 of 3 | 3 of 3 | 3 of 3 |
| plan-57-r1 | P57-3 | 3 of 3 | 3 of 3 | 2 of 3 | 3 of 3 |
| plan-57-r1 | P57-5 | 3 of 3 | 3 of 3 | 2 of 3 | 3 of 3 |
| plan-83-r1 | P83-1 | 3 of 3 | 3 of 3 | 3 of 3 | 1 of 3 |
| plan-83-r1 | P83-2 | 3 of 3 | 3 of 3 | 2 of 3 | 3 of 3 |
| plan-89-r1 | P89-1 | 0 of 3 | 0 of 3 | 0 of 3 | 1 of 3 |
| plan-89-r1 | P89-2 | 3 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |
| plan-96-delta-planted | PPD96-1 | 3 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |
| plan-96-r1 | P96-2 | 3 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |
| plan-96-r1 | P96-4 | 2 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |
| plan-96-r1 | P96-5 | 3 of 3 | 3 of 3 | 1 of 3 | 3 of 3 |
| plan-96-r1 | P96-6 | 0 of 3 | 0 of 3 | 1 of 3 | 1 of 3 |

#### Check of each change

- Web evidence: with web evidence, Vac finds P83-2, P57-3, and P57-5 in 3 of 3 runs at both efforts. In plan #109, no current prompt (V17, Va, Vb, Vc) found these defects.
- D1: Vd1 found no more known defects than Vac-xhigh (1.57 against 1.62 per run), with more wrong findings (0.10 against 0.05 per run). Thus D1 left the comparison: a plan edit after plan-review round 2 removed it, and plan-review round 3 reviewed that edit. D2 holds all of D1.
- D2: the external-behavior check found these defects more often than Vac-xhigh: P57-1 (2 of 3 against 0 of 3), P57-2 (3 of 3 against 1 of 3), P89-1 (1 of 3 against 0 of 3), and P96-6 (1 of 3 against 0 of 3). It lost P83-1 (1 of 3 against 3 of 3). D2 is not revised: a revision aimed at one defect in three runs would fit the prompt to a dev case. Its median time is the longest (484.5 s).
- Effort: Vac-high found as many known defects as Vac-xhigh (1.62 per run each) at about half the median time (200.9 s against 377.9 s). It gave fewer valid extras (0.95 against 1.38 per run) and 0.05 more wrong findings per run.

### Capacity

- At the `default` tier, the model service refused more than about 4 to 8 parallel reviewers with `turn_rate_limit_exceeded`.
- The dev runs completed about 20 runs per hour.
- Thus the held-out plan was cut to 3 arms (Vac-xhigh, Vac-high, and Vd2-xhigh) and to 2 runs on the #109 held-out cases. The new held-out cases keep 5 runs.

### Held-out runs

The three arms ran in one mixed dispatch queue: 5 runs on each of the 8 new held-out cases (`plan-109-r1`, `plan-109-r2`, and the seeded cases `plan-106-r1`, `plan-85-r1`, `plan-81-r1`, `plan-76-r1`, `plan-72-r1`, and `plan-69-r1`; 32 known defects), and 2 runs on each of the 16 held-out cases of plan #109. Every valid run shows the model `openai-codex/gpt-6.1-sol`, its effort, and the served tier `default`. An interval row gives the 90% paired bootstrap interval of the difference from Vac-xhigh.

Read scope: the first report marked 9 of 216 runs invalid. The scorer followed the query rule that `SKILL.md` documented then: a web search whose query names the owner `DocksDocks` anywhere is outside. Seven runs searched with queries that name `DocksDocks/public`, the consumer repository that documents `docks-kit`, and some of these queries excluded the benchmark repository with `-site:`: `plan-109-r1/Vd2-xhigh` runs 1, 4, and 5, `plan-76-r1/Vd2-xhigh` runs 1, 2, and 4, and `plan-109-r1/Vac-high/run-3`. One run (`plan-109-r1/Vac-xhigh/run-1`) read a snapshot file with a JSON query selector (`<file>?q=<filter>`). After the first report, plan #111 step `scope_fix` narrowed the query rule: a query is outside only when it targets the benchmark repository, and each URL that a search result cites is checked; code review round 1 of plan #111 then also put pages of other sites that name the repository outside. These changes made the 8 runs valid; one run stays invalid: `plan-72-r1/Vd2-xhigh/run-3` read `agents/*` of its plugin root. The rule changed after the deciding runs, so the decisions were checked on both tables: with the first report (Vac-xhigh 39, Vd2-xhigh 33, and Vac-high 39 runs on the new cases), D2's escaped-difference interval was [-5.42, 3.96] and Ac-high's was [0.00, 4.44], so decisions 3 and 5 are the same with or without the 8 runs.

#### New held-out cases

| Measure | Vac-xhigh | Vd2-xhigh | Vac-high |
|---|---:|---:|---:|
| Runs | 40 | 39 | 40 |
| Known found per run | 2.88 | 2.92 | 2.70 |
| Escaped per 50 known | 14.06 | 13.46 | 16.25 |
| Round 1 recall difference from Vac-xhigh, 90% interval | - | [-0.08, 0.11] | [-0.09, 0.00] |
| Escaped per 50 known difference from Vac-xhigh, 90% interval | - | [-5.39, 4.08] | [0.00, 4.44] |
| Valid extras per run | 0.53 | 0.54 | 0.28 |
| Wrong per run | 0.03 | 0.08 | 0.03 |
| Unknown ratings per run | 0.00 | 0.03 | 0.00 |
| Seconds median | 233.3 | 462.0 | 120.9 |

#### Held-out cases of plan #109

| Measure | Vac-xhigh | Vd2-xhigh | Vac-high |
|---|---:|---:|---:|
| Runs | 32 | 32 | 32 |
| Known found per run | 1.09 | 1.16 | 1.00 |
| Escaped per 50 known | 21.77 | 20.16 | 24.19 |
| Round 1 recall difference from Vac-xhigh, 90% interval | - | [-0.08, 0.16] | [-0.13, 0.03] |
| Escaped per 50 known difference from Vac-xhigh, 90% interval | - | [-7.76, 3.91] | [-1.35, 6.25] |
| Valid extras per run | 1.41 | 1.31 | 1.13 |
| Wrong per run | 0.22 | 0.09 | 0.09 |
| Unknown ratings per run | 0.00 | 0.00 | 0.00 |
| Seconds median | 322.8 | 417.3 | 168.9 |

The second judge agreed with 169 of 170 answers on the new held-out cases (0.99) and with 70 of 73 answers on the #109 held-out cases (0.96).

### Decision

- D2 against Ac: D2 let fewer known defects escape on both sets (13.46 against 14.06, and 20.16 against 21.77 per 50 known), but its escaped-difference intervals reach 4.08 and 3.91, above the bound 2, and its recall interval on the new cases reaches -0.08, below -0.05. So D2 does not pass, and Ac ships. D2 also took about twice the median time on the new cases (462.0 s against 233.3 s).
- Effort: Ac-high against Ac-xhigh fails the same bounds (escaped interval [0.00, 4.44] on the new cases, recall interval [-0.13, 0.03] on the #109 cases). So the recommended plan-reviewer effort stays `xhigh`. Ac-high takes about half the time and lets about 2 more known defects per 50 escape.
- Hybrid effort (the user's decision after these results): plan-review round 1 and every full plan-review round run at the configured effort, and plan `delta` rounds run one level lower where the runtime has a per-dispatch effort (omp `effort: med`, which maps to the middle level of the model's range and which a probe mapped to `high` for `gpt-6.1-sol`, sent only when it is one level below the effort of round 1; Claude Code v2.1.292 or later, the invocation `effort`). The plan contract records the rule. Code-review rounds keep the configured effort. Lead for a later plan: measure code `delta` rounds at one level lower on the loop replay, with the known defects that rounds 2 to 5 find and the loop seconds, before the rule covers code review.
- Where the efforts differ: on the new held-out cases, Ac-xhigh found more often the defects of the real case `plan-109-r1` (P109-1 2 of 5 against 0 of 5, P109-2 2 of 5 against 0 of 5, P109-3 5 of 5 against 4 of 5) and the seeded S72-1 (5 against 3) and S106-3 (2 against 1); Ac-high found S81-1 more often (2 against 1). Each of these defects breaks a step or a measurement. On the one plan-delta case (`plan-109-r2`), both efforts found 2 of 2 known defects per run, Ac-high in 80 s against 194 s (median). Lead for a later plan: measure effort `xhigh` for round 1 and `high` for delta re-reviews on more plan-delta cases; one case is too little evidence for a rule.
- With web evidence, Ac lets fewer known defects escape on the #109 held-out cases (21.77 per 50 known) than candidate A did there without web evidence in plan #109 (22.58). The two runs differ in the run count and the judges, so this comparison is a direction, not a measured difference.

### LOW rule simulation (plan #111 step `loop_sim`)

The rule under test: from code-review round 3, a `pass` whose open findings are all LOW findings lands, and the manager does not repair them. A script applied the rule to the recorded code-review loops of plan #100. It counted a round as a LOW-only pass when every block of the round passed and every open finding of the round (each repaired known defect, at the highest severity of its matching findings, and each valid extra) is LOW. The recorded findings do not say whether a fault has a current reach, so the simulation applies the rule to every LOW finding: the shipped rule, which covers only unreached LOW findings, removes at most these rounds.

| Workspace and arm | Loops | Rounds | Loops that stop earlier | Rounds removed | Seconds removed | Known defects that escape |
|---|---:|---:|---:|---:|---:|---:|
| held-out grid, 8 configurations of `C1` | 240 | 491 | 0 | 0 | 0 | 0 |
| `step6c`, `C3-xhigh-fast` | 30 | 73 | 2 | 3 | 454 of 13,801 | 0 |
| `step6c`, `C1-xhigh-fast` | 30 | 69 | 2 | 2 | 231 of 13,426 | 0 |
| `step6c`, `B0-xhigh-fast` | 30 | 63 | 0 | 0 | 0 | 0 |
| `step6d`, `C3-xhigh-fast` | 30 | 70 | 0 | 0 | 0 | 0 |
| `step6d`, `B1-xhigh-fast` | 30 | 86 | 1 | 1 | 175 of 16,065 | 0 |

From round 2 instead of round 3, the rule would remove 7 rounds (1,042 s) in `step6c` `C3-xhigh-fast` and 4 rounds (438 s) in `step6d` `C3-xhigh-fast`, also with no known defect that escapes. The rule ships from round 3, because the real history shows faults in the repairs of rounds 2 and 3 (plans #100 and #102). No known defect escapes, so the rule ships (plan #111 decision 6). The saving is small in the replay; the real history estimates 3 rounds in 7 plans.

## Run 2026-10-25: reviewer candidates from other vendors' review techniques (plan #113)

### Setup

- Model: `openai-codex/gpt-6.1-sol`. Effort: `xhigh`. Service tier: `default`. The user turned fast mode off for these tests (plan #113 decision 4). The arms of each reviewer ran mixed in one dispatch queue.
- Arms. The candidate refs are local and start from `main` commit `398b6a57`:
  - `Vmain`: the plan reviewer on `main`.
  - `Vp1`: candidate P1. It adds two plan checklist items: each Acceptance row that checks a Goal outcome can fail (the reviewer predicts the result of the row before the steps and on a partial change), and each changed format, location, key, default, or rule is traced to its readers. Ref `bench-113/cand-p1`.
  - `B3`: the code reviewer on `main` as a panel, with the prompt shape of the candidate arm.
  - `C3`: candidate C1 as a panel. C1 adds the precedence of #109 (instruction files and the plan contract above recorded decisions), a repository-rules section (quote the rule and cite `path:line`; apply the text of a changed instruction file as of the base and review the new text as changed text), a restatement search, a per-form check for parsers and formats that another tool also reads, compatibility surfaces, fail-open gates as Bug or Security findings, and a search for the guard before a finding is reported. Ref `bench-113/cand-c1`.
  - `Bd` and `Cd`: the delta arms of `main` and of C1 on the code-delta case.
- `B3` and `Bd` are new arms of this plan (plan #113 decision 2). The earlier baseline arms `B1` and `B0` add the old lens description to the prompt (`buildTail`), so `B1` against `C3` did not compare only the reviewer files. `B3` and `Bd` have the same prompt tail as `C3` and `Cd`. Thus `B3`/`Bd` against `C3`/`Cd` compares only the reviewer files at `--baseline-ref main` and in the candidate tree.
- Judge rubric (plan #113 decision 2): the Adjudication pass of `references/judge.md` now rates a finding `valid` when the finding shows that a recorded intent breaks a repository instruction file, the plan contract, or correctness, and its rule or effect holds. A finding is `wrong` because the plan records the behavior as intended only when it does not show this. The rule applies to every arm of this run. The earlier entries used the rubric before this change.
- One run is a single review.
- The diff of each candidate against `main` is kept as the record in `variants/plan-113-cand-p1.patch` and `variants/code-113-cand-c1.patch`, because the local refs are removed after the merge.

### Decision rule (plan #113 decision 5, fixed before the held-out runs)

For each reviewer on its new held-out cases: the candidate replaces `main` only when its escaped known defects per 50 known are fewer than `main`'s, its escaped-difference 90% interval against `main` stays below 2 and its round-1 recall difference interval stays above -0.05, and its wrong findings per run and its unknown findings per run are each at most 0.10 more than `main`'s. A candidate that does not pass is recorded with its measured differences and does not ship.

### Dev check

All dev cases are published cases (plan #113 decision 6). Plan: `Vmain` and `Vp1` ran 2 times on each of 6 plan cases with always-missed defects: `plan-27-r1`, `plan-42-r1`, `plan-57-r1`, `plan-72-r1`, `plan-85-r1`, and `plan-96-r1`. Code: `B3` and `C3` ran 1 time on each of 4 code cases: `code-102-r1`, `code-44-r1`, `code-74-pr75`, and `code-98-r1`. No run is invalid. Every run shows the model `openai-codex/gpt-6.1-sol`, the effort `xhigh`, and the served tier `default`.

#### Arms

The dev report splits these cases into its `dev` and `heldout` groups by the folder of each case. Thus a script computed this table from the Runs table of the dev report.

| Measure | Vmain | Vp1 | B3 | C3 |
|---|---:|---:|---:|---:|
| Runs | 12 | 12 | 4 | 4 |
| Cases | 6 | 6 | 4 | 4 |
| Known found per run | 2.75 | 3.00 | 2.00 | 1.50 |
| Escaped per 50 known | 19.44 | 16.67 | 34.62 | 38.46 |
| Valid extras per run | 0.58 | 0.67 | 3.75 | 4.00 |
| Wrong per run | 0.00 | 0.08 | 1.25 | 0.75 |
| Unknown ratings per run | 0.00 | 0.00 | 0.00 | 0.25 |
| Seconds median | 222.9 | 257.6 | 341.8 | 388.0 |

#### Known defects found

Each cell gives the number of runs that found the known defect. The table shows only the known defects whose count differs between the two arms of a reviewer.

| Case | Known defect | `main` arm | Candidate arm |
|---|---|---:|---:|
| plan-27-r1 | P27-2 | 1 of 2 | 0 of 2 |
| plan-27-r1 | P27-3 | 2 of 2 | 1 of 2 |
| plan-57-r1 | P57-1 | 2 of 2 | 0 of 2 |
| plan-57-r1 | P57-5 | 1 of 2 | 2 of 2 |
| plan-72-r1 | S72-3 | 0 of 2 | 1 of 2 |
| plan-85-r1 | S85-2 | 0 of 2 | 2 of 2 |
| plan-96-r1 | P96-5 | 1 of 2 | 2 of 2 |
| plan-96-r1 | P96-6 | 0 of 2 | 2 of 2 |
| code-102-r1 | C102-2 | 1 of 1 | 0 of 1 |
| code-44-r1 | C44-9 | 1 of 1 | 0 of 1 |

#### Check of each change

- P1: P1 found the Acceptance defects that can fail more often: P96-6 (2 of 2 against 0 of 2), S72-3 (1 against 0), and S85-2 (2 against 0). It lost P57-1 (0 of 2 against 2 of 2), P27-2 (0 against 1), and P27-3 (1 against 2). Its wrong findings rose from 0.00 to 0.08 per run.
- C1: each code arm ran once per case, so the dev check did not decide. C3 found fewer known defects than B3 (1.50 against 2.00 per run), with fewer wrong findings (0.75 against 1.25 per run).
- No candidate was revised.

### Held-out runs

The arms ran 3 times on each of 12 new held-out cases (plan #113 decision 3). A builder agent that did not see the candidates wrote the seeded cases, and the keys stayed outside the repository until the decision.

- Plan, 7 cases, 25 known defects: `plan-111-r1` (4), `plan-111-r6` (plan delta, 1), and the seeded cases `plan-103-r1`, `plan-40-r1`, `plan-65-r1`, `plan-79-r1`, and `plan-87-r1` (4 each).
- Code panel, 4 cases, 21 known defects: `code-111-r1` (12), `code-111-r4` (1), and the seeded cases `code-72-pr73` and `code-83-pr84` (4 each).
- Code delta, 1 case, 2 known defects: `code-111-r3-delta`.

No run is invalid. Every run shows the model `openai-codex/gpt-6.1-sol`, the effort `xhigh`, and the served tier `default`. An interval row gives the 90% paired bootstrap interval of the difference from the `main` arm.

#### Plan reviewer

| Measure | Vmain | Vp1 |
|---|---:|---:|
| Runs | 21 | 21 |
| Cases | 7 | 7 |
| Known found per run | 2.52 | 2.81 |
| Escaped per 50 known | 14.67 | 10.67 |
| Round 1 recall difference from Vmain, 90% interval | - | [0.00, 0.16] |
| Escaped per 50 known difference from Vmain, 90% interval | - | [-8.00, 0.00] |
| Valid extras per run | 0.90 | 0.90 |
| Wrong per run | 0.05 | 0.00 |
| Unknown ratings per run | 0.00 | 0.00 |
| Seconds median | 279.6 | 259.2 |
| Tokens median | 739207 | 766622 |

#### Code reviewer, panel

| Measure | B3 | C3 |
|---|---:|---:|
| Runs | 12 | 12 |
| Cases | 4 | 4 |
| Known found per run | 2.58 | 2.67 |
| Escaped per 50 known | 25.40 | 24.60 |
| Round 1 recall difference from B3, 90% interval | - | [0.00, 0.03] |
| Escaped per 50 known difference from B3, 90% interval | - | [-1.25, 0.00] |
| Valid extras per run | 1.08 | 1.08 |
| Wrong per run | 0.00 | 0.00 |
| Unknown ratings per run | 0.00 | 0.00 |
| Seconds median | 276.0 | 280.5 |
| Tokens median | 1880728 | 2054085 |

#### Code reviewer, delta

| Measure | Bd | Cd |
|---|---:|---:|
| Runs | 3 | 3 |
| Cases | 1 | 1 |
| Known found per run | 1.00 | 1.33 |
| Escaped per 50 known | 25.00 | 16.67 |
| Valid extras per run | 0.00 | 0.00 |
| Wrong per run | 0.00 | 0.00 |
| Unknown ratings per run | 0.00 | 0.00 |
| Seconds median | 185.1 | 216.0 |
| Tokens median | 497507 | 641613 |

With one case, each interval of the delta arms has one value (recall difference [0.17, 0.17], escaped difference [-8.33, -8.33]) and shows no spread, so this table is a diagnostic: the code decision pools the five code cases (see Decision).

#### Known defects that differ

Each cell gives the number of runs, out of 3, that found the known defect. A script counted the `Found` column of the run table of the held-out report. The table shows only the known defects whose count differs between the two arms of a reviewer.

| Case | Known defect | `main` arm | Candidate arm |
|---|---|---:|---:|
| plan-111-r1 | P111-3 | 2 of 3 | 3 of 3 |
| plan-103-r1 | PS103-4 | 0 of 3 | 3 of 3 |
| plan-65-r1 | PS65-2 | 0 of 3 | 3 of 3 |
| plan-79-r1 | PS79-1 | 1 of 3 | 0 of 3 |
| code-111-r1 | SR111-7 | 0 of 3 | 1 of 3 |
| code-111-r3-delta | B111-5 | 0 of 3 | 1 of 3 |

#### Real `*-111-*` cases alone (does not decide)

A script computed this table from the run table of the held-out report. A known-run is one known defect in one run.

| Reviewer | Cases | Known-runs per arm | Escaped per 50 known, `main` arm | Escaped per 50 known, candidate arm |
|---|---|---:|---:|---:|
| Plan (`Vmain`, `Vp1`) | `plan-111-r1`, `plan-111-r6` | 15 | 10.00 | 6.67 |
| Code panel (`B3`, `C3`) | `code-111-r1`, `code-111-r4` | 39 | 38.46 | 37.18 |
| Code delta (`Bd`, `Cd`) | `code-111-r3-delta` | 6 | 25.00 | 16.67 |

The second judge agreed with 105 of 105 answers (1.00).

### Decision

- P1 against `main`: P1 let fewer known defects escape (10.67 against 14.67 per 50 known). Its escaped-difference interval [-8.00, 0.00] stays below 2, its recall interval [0.00, 0.16] stays above -0.05, its wrong findings are 0.00 against 0.05 per run, and its unknown findings are 0.00 against 0.00 per run. So P1 passes decision 5 and ships. P1 gives the main gain of this plan: 4.00 fewer escaped known defects per 50 known. Its median time was shorter on the held-out cases (259.2 s against 279.6 s) and longer on the dev cases (257.6 s against 222.9 s).
- C1 against `main`, first runs: on the four panel cases, C3 let fewer known defects escape (24.60 against 25.40 per 50 known; interval [-1.25, 0.00]; recall [0.00, 0.03]; wrong and unknown 0.00 per run in both arms). On all five code cases of decision 5 (the panel cases and the delta case, pooled; 90% interval from 20,000 case resamples), C1 let 23.91 escape against 25.36 (interval [-3.33, 0.00]; recall [0.000, 0.067]). The measured gain was small: one more known defect (SR111-7) in 12 panel runs and one in 3 delta runs.
- C1 with the contract sentence (plan #113 decision 8): code review round 1 found that the plan contract still told code reviewers to treat a recorded decision as settled, which conflicts with C1's precedence, and that C1 was measured without the change of that sentence. The sentence is in the snapshot contract of `code-111-r1`, `code-111-r3-delta`, and `code-111-r4`, so these three cases ran again in one batch with C1 and the changed sentence (`agents --candidate-contract-overlay`; `B3`/`C3` and `Bd`/`Cd`, 3 runs; workspace `bench-113/ov`; every run valid; the second judge agreed with 8 of 8 answers). On these three cases, `main` found 1.83 known defects per panel run against 1.50 (escaped 35.90 against 38.46 per 50 known) and 1.33 per delta run against 1.00. On the five code cases with these runs and the first runs of `code-72-pr73` and `code-83-pr84`, C1 let 25.36 known defects per 50 escape against 23.19 for `main` (interval [0.00, 3.70]; recall [-0.074, 0.000]; wrong 0.07 against 0.00 per run). C1 then has more escaped defects than `main`, so it does not pass decision 5. Neither C1 nor the sentence ships: the code reviewer and the plan contract stay as on `main`, and the diff of C1 stays in `variants/code-113-cand-c1.patch`.
- What the two code batches show together: on `code-111-r1`, the `main` arm found 3.00 of 12 known defects per run in the first batch and 3.67 in the second, and C1 found 3.33 and 3.00, so the run-to-run spread of one arm is larger than C1's measured effect. The repository-rules and base-text review of C1 is therefore not shown to help, and its safety value stays a lead for a plan that adds corpus cases of that kind.

### Sources of the techniques

The research reports of plans #111 and #113 (kept outside the repository) give these sources. The candidate text is written in this repository's own words and copies no vendor text, so no license notice is needed (plan #113 decision 1).

| Candidate | Technique | Vendor | Source |
|---|---|---|---|
| P1 | Acceptance row that can fail | Anthropic (Claude Code) | `skill-creator` grader: https://github.com/anthropics/skills/blob/main/skills/skill-creator/agents/grader.md |
| P1 | Acceptance row that can fail | OpenAI (Codex) | `code-review-testing` skill: https://github.com/openai/codex/tree/5e96aabd68dc6194f5ad928cb7f5d0bc71b72df9/.codex/skills; label review prompt (whole-value assertions): https://github.com/openai/codex/blob/main/.github/codex/labels/codex-rust-review.md |
| P1 | Acceptance row that can fail | poteto (pstack in `cursor/plugins`) | `interrogate` rubric, Verification lens: https://github.com/cursor/plugins/blob/main/pstack/skills/interrogate/references/rubric.md; `blast-radius` proof ladder: https://github.com/cursor/plugins/blob/main/pstack/skills/blast-radius/SKILL.md |
| P1 | Readers of a changed form | Anthropic (Claude Code) | `feature-dev` `code-architect` data flow: https://github.com/anthropics/claude-plugins-official/tree/main/plugins/feature-dev |
| P1 | Readers of a changed form | OpenAI (Codex) | `maintainer-review` changed-behavior pass: https://github.com/openai/openai-agents-python/blob/main/.agents/skills/maintainer-review/SKILL.md, https://github.com/openai/openai-agents-python/blob/main/.agents/skills/maintainer-review/references/evaluation-framework.md |
| P1 | Readers of a changed form | poteto (pstack in `cursor/plugins`) | `blast-radius`, breakage past grep: https://github.com/cursor/plugins/blob/main/pstack/skills/blast-radius/SKILL.md |
| C1 | Precedence: a recorded decision does not excuse a rule violation | Cursor (Bugbot) | Bugbot release notes, week of 2026-10-12: https://cursor.com/docs/release-notes/bugbot |
| C1 | Precedence: the intent settles the choice, not its effects | Cursor | `thermo-nuclear-review`: https://github.com/cursor/plugins/blob/main/thermos/skills/thermo-nuclear-review/SKILL.md |
| C1 | Repository rules quoted by path | Anthropic (Claude Code) | `/code-review` command: https://github.com/anthropics/claude-code/blob/main/plugins/code-review/commands/code-review.md |
| C1 | Repository rules quoted by path | OpenAI (Codex) | `/review` rubric (rule attribution, PR #34637): https://github.com/openai/codex/blob/main/codex-rs/prompts/templates/review/rubric.md; blog "Custom Code Review rules for Codex": https://developers.openai.com/blog/custom-code-review-rules-for-codex |
| C1 | Repository rules quoted by path | CodeRabbit | Code guidelines: https://docs.coderabbit.ai/knowledge-base/code-guidelines |
| C1 | Repository rules quoted by path | Cursor (Bugbot) | Bugbot documentation (`.cursor/BUGBOT.md` of each changed path): https://cursor.com/docs/bugbot |
| C1 | Base text of changed instruction files | Anthropic (Claude Code Review) | https://code.claude.com/docs/en/code-review |
| C1 | Base text of changed instruction files | Cursor (Bugbot) | https://cursor.com/docs/bugbot |
| C1 | Restatement search | CodeRabbit | Custom check "Agent guidance structure" of `coderabbitai/skills`: https://github.com/coderabbitai/skills/blob/main/.coderabbit.yaml |
| C1 | Parser and format forms | Anthropic (Claude Code) | `security-guidance` plugin, parser and validator differentials: https://github.com/anthropics/claude-plugins-official/tree/main/plugins/security-guidance |
| C1 | Compatibility surfaces | OpenAI (Codex) | `code-review-breaking-changes` skill: https://github.com/openai/codex/tree/5e96aabd68dc6194f5ad928cb7f5d0bc71b72df9/.codex/skills; root `AGENTS.md` Code Review Rules: https://github.com/openai/codex/blob/5c18cc0acc3734f0e78e422a7fd94ea4a2be652e/AGENTS.md#L85-L110 |
| C1 | Fail-open gates | Anthropic (Claude Code) | `security-guidance` plugin, fail-open state drift and control regression: https://github.com/anthropics/claude-plugins-official/tree/main/plugins/security-guidance |
| C1 | Search for the guard | CodeRabbit | Verification scripts: https://www.coderabbit.ai/blog/context-engineering-ai-code-reviews |
| C1 | Search for the guard | Cursor | `thermo-nuclear-review` (no finding with unfinished research when the code is readable): https://github.com/cursor/plugins/blob/main/thermos/skills/thermo-nuclear-review/SKILL.md |
| C1 | Search for the guard | Anthropic (Claude Code) | `security-guidance` plugin, self-refute stage with cited evidence: https://github.com/anthropics/claude-plugins-official/tree/main/plugins/security-guidance; `/security-review` false-positive filtering: https://github.com/anthropics/claude-code-security-review/blob/main/.claude/commands/security-review.md |

### Leads

- The code-reviewer techniques of C1 (the sources above) did not pass once the contract sentence that they need was measured with them. A later plan needs more code cases of the repository-rules and restated-text kinds, and more runs per arm, to separate their effect from the run-to-run spread.
- A second reviewer model family. It needs a judge from a family outside both reviewer families, and only two families run here.
- Web search for the code reviewer.
- A coverage verdict for hunks that the reviewer did not read.
- State and ordering checks (the mutators of shared state, overlapping operations, stale completions).
- The remaining plan techniques: one owner per rule, steps that leave no decision to the implementer, and quoted gates.

## Run 2026-10-26: follow-ups of plan #113 (plan #115)

### Setup

- Model: `openai-codex/gpt-6.1-sol`. Effort: `xhigh`, and `high` for the effort comparisons. Service tier: `default`. The user turned fast mode off for these runs, as in plans #109 to #113. The Claude reviewer is `anthropic/claude-opus-5-5` at `xhigh` with no service tier (plan #115 decision 3: a non-OpenAI configuration gets no tier).
- Judges: Claude task agents judged the findings of the GPT reviewers (one judge per case). A GPT judge agent (`openai-codex/gpt-6.1-sol`, thinking level `high`) judged the findings of the Claude reviewer. Each second judge came from the other family than the first judge.
- Candidates. The local refs start from `main` commit `f82c9601` (plan-lifecycle 0.18.0):
  - D2': the D1 and D2 changes of plan #111, ported onto the current plan reviewer. The load-bearing bullet adds "it checks a Goal outcome and", so that the regression-guard exemption of plan #113 holds. Ref `bench-115/cand-d2p`.
  - C1': `variants/code-113-cand-c1.patch`, the code-reviewer agent part of commit `38b6f1c7`, and the contract sentence of commit `5f262a01`. Ref `bench-115/cand-c1p`.
  - Cweb: web tools for the code reviewer and a rule to read official documentation. Ref `bench-115/cand-web`.
  - Cblk: an unread hunk of the diff of the mode is a missing input. The reviewer returns `blocked` and never `pass` on a partial read. Ref `bench-115/cand-blk`.
- Arm labels in the reports: `Vmain` and `Vd2p` for the plan reviewer, `B3` (`main`) and `C3` (the candidate of the batch) for the code reviewer, `Vmain` and `Bd` at `xhigh` and `high` for the delta rounds.
- Batches. Batch A used the agent set of the C1' tree with `--candidate-contract-overlay` and the variants `main` and `d2p` (workspaces `bench-115/A` plan, claude, ud, delta, code, and cdelta). Batch B used the agent set of the Cweb tree and the variant `main` (`bench-115/Bw` code and ud115). Batch C used the agent set of the Cblk tree (`bench-115/Cb` code and large). Each code batch had its own `B3` control: the user chose a control per batch over the reuse of the batch A control.
- The C1' contract overlay applied on `code-113-r1` and `code-113-r2`. It was "not applicable" on the 6 seeded code cases, because their snapshot contracts (v2 and v3) do not hold the sentence.
- One run is a single review. Agents that did not see the candidates built all new cases. The diffs of the candidates against `main` are kept as the record in `variants/plan-115-cand-d2p.patch`, `variants/code-115-cand-c1p.patch`, `variants/code-115-cand-web.patch`, and `variants/code-115-cand-blk.patch`, because the local refs are removed after the merge.

### Decision rule (plan #115 decision 5, fixed before the deciding runs)

- (1) User decisions. Stage 1 runs `main` on the protected set, 3 runs. When `main` re-argues at least 0.10 protected decisions per run, a candidate Vud (a protected-decision rule in the plan reviewer) is written from the stage-1 data and decided on a fresh seeded protected set. Vud ships only when its re-argued decisions per run are at most half of `main`'s on that set, and on the fresh general plan set its escaped-difference interval against `main` stays below 2, its recall interval above -0.05, and its wrong findings at most 0.10 more per run. Below 0.10, the result is recorded and nothing changes.
- (2) C1', (4) D2', and (6b) Cweb against `main`: the rule of plan #113 decision 5 on all new held-out cases of the candidate. The candidate has fewer escaped known defects per 50 known than `main`; its escaped-difference 90% interval stays below 2; its round-1 recall difference interval stays above -0.05; its wrong findings and its unknown findings per run are each at most 0.10 more. C1' runs with its contract sentence through `--candidate-contract-overlay`.
- (3) Hybrid effort. On the plan-delta set, `high` against `xhigh` (3 runs): when the escaped-difference interval of `high` stays below 2, its recall interval above -0.05, and its wrong findings at most 0.10 more per run, the plan rule stays. Otherwise the plan delta rule reverts to the configured effort. On the code-delta set, the same bounds decide whether the rule extends to code delta rounds.
- (6a) Second family. The contract option "the manager may add a plan reviewer of a second model family in round 1" ships only when the union of one GPT run and one Claude run lets fewer known defects escape than the union of two GPT runs, with the escaped-difference interval below 0, and the wrong findings per run of the union stay within 0.10 of the two-GPT union.
- (6c) Coverage verdict. Cblk ships only when it returns no `blocked` verdict on the large readable cases and meets the bounds of (2) against `main`.
- (5) LOW rule. No decision: the results log records each code review of plans #113 and #115 that reached round 3, whether the rule applied, and the follow-up issue when it did.

### Cases

- Protected dev set (stage 1): 9 cases `ud-96-r1`, `ud-98-r1`, `ud-98-r8`, `ud-100-r1`, `ud-102-r1`, `ud-106-r1`, `ud-109-r1`, `ud-111-r1`, and `ud-111-r7`; 23 known defects; 34 protected decisions (10 user choices, 14 request corrections, 10 yolo decisions).
- Fresh held-out protected set: 6 cases `plan-12-ud115`, `plan-14-ud115`, `plan-16-ud115`, `plan-18-ud115`, `plan-19-ud115`, and `plan-23-ud115`; 14 known defects; 19 protected decisions (10 user choices, 9 request corrections). Five known defects are decoys: a recorded user choice or request correction with a false premise or a broken effect, which a reviewer must report. The bodies use the plan format of the snapshot contract of each case (v2 or v3).
- Fresh held-out plan set: 7 cases, 22 known defects (5 of them external-behavior defects), 20 protected decisions in the keys: `plan-113-r1` (2 known), `plan-113-r4` (plan delta, 2), and the seeded `plan-20-s115` (4), `plan-22-s115` (4), `plan-31-s115` (3), `plan-39-s115` (3), and `plan-89-s115` (4).
- Fresh held-out code set: 8 cases, 34 known defects: `code-113-r1` (11 known, 734 changed lines), `code-113-r2` (5, 809 changed lines), and seeded cases of three kinds: repository rules and text (`code-101-s115`, `code-46-s115`, `code-27-s115`), external behavior (`code-16-s115`, `code-12-s115`), and general (`code-42-s115`), 3 known each. The large readable case for Cblk is the published `code-111-r1` (12 known).
- Plan-delta set: 12 cases, 12 known defects. The new dev cases `plan-100-r3-d115`, `plan-102-r2-d115`, `plan-103-r2-d115` (real), `plan-109-r3-d115`, `plan-111-r2-d115`, and `plan-98-r7-d115`, plus `plan-96-delta`, `plan-96-delta-planted`, and the published held-out `plan-100-r5`, `plan-109-r2`, `plan-111-r6`, and `plan-33-r2`.
- Code-delta set: 8 cases, 13 known defects. The new dev cases `code-98-r2-d115` (real), `code-100-r3-d115` (real, 4 known), `code-100-r4-d115` (real), `code-102-r4-d115` (2), and `code-109-r3-d115` (2), plus `code-96-delta-planted`, `code-96-delta-real`, and `code-111-r3-delta`.

### Runs

- Runs per case and arm: D2' and `main` 8 runs on the fresh plan set and 3 on the protected dev set; C1' and `B3` 5 runs; Cweb, Cblk, and their `B3` controls 3 runs; the delta comparisons 3 runs per effort; the Claude reviewer 3 runs; `main` on the fresh protected set 3 runs.
- Totals and capacity: 547 reviews in batch A, 162 in batch B, and 162 in batch C (871). Batch A ran about 48 reviews per hour, with many capacity refusals ("Codex is at capacity", `turn_rate_limit_exceeded`) that were dispatched again. Batches B and C ran about 75 to 100 reviews per hour with no refusals.
- Invalid runs and their handling:
  - The omp process restarted during batch A. Four reviewer dispatches that omp resumed ran without the `default` tier (served tier null): `ud-106-r1` Vd2p run 3, `plan-100-r3-d115` `high` run 3, `code-12-s115` `B3` run 4 (text-and-safety), and `code-46-s115` `B3` run 2 (spec-and-tests). They ran again, and the judges judged their cases again.
  - Two runs read outside their inputs and ran again: `plan-113-r1` Vd2p run 6 (a web search query named the benchmark repository) and a Claude run of `plan-31-s115` (a path under the case folder without `snapshot/`).
  - Four Claude replies wrapped the review block in a code fence (one after a sentence of preamble). The fence was removed, as the JSON wrapper of other replies is; the review text did not change. The judges judged those cases again.
  - `plan-14-ud115` run 3 returned `Plan-review: blocked`: it returned the user decision D14-1 to the user, because its premise is false. The report leaves this run out as "no review (blocked)". It did not run again. After these repairs, no other run is invalid. Every valid run shows its configured model and effort and the served tier `default` (Claude: none).
- The second judge checked 10% of the `matches` and `adjudications` answers, every `reargued` match, and 10% of the other `reargued` answers. It agreed with 235 of 235 answers in `bench-115/A` plan, 55 of 55 in claude, 126 of 128 (0.98) in ud, 12 of 12 in delta, 126 of 126 in code, 10 of 10 in cdelta, 78 of 78 in `bench-115/Bw` code, 33 of 33 in ud115, 76 of 76 in `bench-115/Cb` code, and 13 of 13 in large.

In the tables, an interval row gives the 90% interval of the difference from the first column of the pair. The intervals of a single report are its paired bootstrap intervals. The pooled delta and family intervals are case-resample intervals (20,000 resamples) from the run tables of the reports. Seconds median comes from the single-review table of each report.

### User decisions

| Measure | `main`, protected dev set | `main`, fresh protected set |
|---|---:|---:|
| Runs | 27 | 17 (1 blocked) |
| Cases | 9 | 6 |
| Protected decisions | 34 | 19 |
| Re-argued decisions per run | 0.00 | 0.00 |
| Known found per run | 1.56 | 1.94 |
| Escaped per 50 known | 19.57 | 7.69 |
| Wrong per run | 0.11 | 0.12 |
| Seconds median | 437.5 | 306.5 |

- `main` re-argued 0.00 protected decisions per run on the dev set (D2' also 0.00), on the fresh plan set (20 protected decisions, 112 runs of both arms), for the Claude reviewer (21 runs), and on the fresh protected set. Before the re-run of `ud-106-r1` was judged, the judge had answered `match` for findings on UD106-2 (a yolo decision, `git diff -D`), which gave 0.07 per run. The case judged again gives none. The second-judge sample takes every `match` answer of the decision pass but only 10% of the other answers, so it did not have to include those UD106-2 pairs. Under either reading, the rate stays below 0.10.
- By kind of protected decision, the rate is 0.00 per run for user choices, for request corrections, and for yolo decisions, on each set that holds the kind (the fresh protected set holds no yolo decisions).
- Decoys on the fresh protected set: 11 of 14 valid decoy-runs found the decoy (D12-1 3 of 3, D14-1 2 of 2 valid, D16-1 3 of 3, D19-1 0 of 3, D23-1 3 of 3). Every run missed D19-1, a user choice to merge with `--delete-branch`. The run of `plan-14-ud115` that the report leaves out returned `blocked` because it challenged the false premise of D14-1, so with that run 12 of 15 runs reported the decoy. The report counts a `blocked` plan block as no review, so this hand count is outside its tables.
- Decision: 0.00 is below 0.10, so Vud was not written (step `user_fix` skipped), and the plan reviewer does not change.

### Code reviewer: C1'

| Measure | `B3` (`main`) | C1' |
|---|---:|---:|
| Runs | 40 | 40 |
| Cases | 8 | 8 |
| Known found per run | 2.52 | 2.65 |
| Escaped per 50 known | 20.29 | 18.82 |
| Round 1 recall difference, 90% interval | - | [0.00, 0.06] |
| Escaped per 50 known difference, 90% interval | - | [-3.24, 0.00] |
| Wrong per run | 0.00 | 0.03 |
| Seconds median | 375.6 | 425.2 |

Target subset and rest. The target subset is the three seeded repository-rules-and-text cases (`code-101-s115`, `code-46-s115`, `code-27-s115`, 9 known); the rest is the other 5 cases (25 known).

| Measure | `B3`, target | C1', target | `B3`, rest | C1', rest |
|---|---:|---:|---:|---:|
| Runs | 15 | 15 | 25 | 25 |
| Known found per run | 2.13 | 2.33 | 2.76 | 2.84 |
| Escaped per 50 known | 14.44 | 11.11 | 22.40 | 21.60 |

Decision: C1' lets fewer known defects escape, both intervals stay inside their bounds, its wrong findings are 0.03 more per run, and its unknown findings are 0.00 in both arms. C1' passes and ships with its contract sentence.

### Delta-round effort

| Measure | Plan, `xhigh` | Plan, `high` | Code, `xhigh` | Code, `high` |
|---|---:|---:|---:|---:|
| Runs | 36 | 36 | 24 | 24 |
| Cases | 12 | 12 | 8 | 8 |
| Known found per run | 0.89 | 0.83 | 1.21 | 1.13 |
| Escaped per 50 known | 5.56 | 8.33 | 12.82 | 15.38 |
| Round 1 recall difference, 90% interval | - | [-0.13, 0.00] | - | [-0.12, 0.00] |
| Escaped per 50 known difference, 90% interval | - | [0.00, 6.06] | - | [0.00, 7.14] |
| Wrong per run | 0.03 | 0.00 | 0.00 | 0.00 |
| Seconds median, dev group | 169.9 | 104.9 | 233.7 | 133.0 |

- The dev cases alone show no difference: 7.14 against 7.14 escaped per 50 known for plan delta (8 cases), and 13.64 against 13.64 for code delta (7 cases). The published held-out cases carry the whole difference: plan delta 3.33 at `xhigh` against 10.00 at `high` (4 cases), and code delta 8.33 against 25.00 (`code-111-r3-delta`).
- Decision: for plan delta rounds, the escaped interval of `high` reaches 6.06, above 2, and its recall interval reaches -0.13, below -0.05. So the plan delta rule reverts to the configured effort. For code delta rounds, `high` fails the same bounds ([0.00, 7.14] and [-0.12, 0.00]), so the rule does not extend to code delta rounds. `high` took about 40% less time.

### Plan reviewer: D2'

| Measure | `Vmain`, fresh plan set | D2', fresh plan set | `Vmain`, protected dev set | D2', protected dev set |
|---|---:|---:|---:|---:|
| Runs | 56 | 56 | 27 | 27 |
| Cases | 7 | 7 | 9 | 9 |
| Known found per run | 2.86 | 2.86 | 1.56 | 1.41 |
| Escaped per 50 known | 4.55 | 4.55 | 19.57 | 22.46 |
| Round 1 recall difference, 90% interval | - | [-0.03, 0.03] | - | [-0.12, -0.01] |
| Escaped per 50 known difference, 90% interval | - | [-1.56, 1.56] | - | [0.69, 6.25] |
| Wrong per run | 0.00 | 0.00 | 0.11 | 0.15 |
| Seconds median | 427.5 | 456.3 | 437.5 | 505.2 |

Target subset and rest. The target subset is the 5 external-behavior defects of the fresh plan set (`PS20-1`, `PS20-2`, `PS22-1`, `PS31-1`, `PS89-1`); the rest is the other 17 known defects.

| Measure | `Vmain`, target | D2', target | `Vmain`, rest | D2', rest |
|---|---:|---:|---:|---:|
| Runs | 56 | 56 | 56 | 56 |
| Known found per run | 0.71 | 0.71 | 2.14 | 2.14 |
| Escaped per 50 known | 0.00 | 0.00 | 5.88 | 5.88 |

Both arms found each external-behavior defect in all 8 runs, so this set could not show a gain of D2' on its target kind.

Decision: on the fresh plan set, D2' does not let fewer known defects escape (4.55 against 4.55 per 50 known), so it fails and does not ship. On the protected dev set, which does not decide, D2' was worse.

### Second model family

| Measure | GPT, one run | Claude, one run | Union, GPT and Claude | Union, two GPT runs |
|---|---:|---:|---:|---:|
| Runs | 56 | 21 | - | - |
| Cases | 7 | 7 | 7 | 7 |
| Known found per run | 2.86 | 2.76 | - | - |
| Escaped per 50 known | 4.55 | 6.06 | 3.50 | 2.27 |
| Escaped per 50 known difference from the two-GPT union, 90% interval | - | - | [0.04, 3.62] | - |
| Wrong per run | 0.00 | 0.19 | 0.19 | 0.00 |
| Seconds median | 427.5 | 644.4 | - | - |

The union script gives only the escaped and wrong rates of the unions, and no recall interval. Decision: the union of one GPT run and one Claude run lets more known defects escape than the union of two GPT runs, and its interval does not stay below 0. A second family adds less than a second GPT run, so the optional contract rule does not ship.

### Code reviewer: web search (Cweb)

| Measure | `B3` (`main`) | Cweb |
|---|---:|---:|
| Runs | 24 | 24 |
| Cases | 8 | 8 |
| Known found per run | 2.63 | 2.63 |
| Escaped per 50 known | 19.12 | 19.12 |
| Round 1 recall difference, 90% interval | - | [-0.06, 0.08] |
| Escaped per 50 known difference, 90% interval | - | [-4.17, 2.92] |
| Wrong per run | 0.13 | 0.04 |
| Seconds median | 341.1 | 356.0 |

Target subset and rest. The target subset is the two seeded external-behavior cases (`code-16-s115`, `code-12-s115`, 6 known); the rest is the other 6 cases (28 known).

| Measure | `B3`, target | Cweb, target | `B3`, rest | Cweb, rest |
|---|---:|---:|---:|---:|
| Runs | 6 | 6 | 18 | 18 |
| Known found per run | 3.00 | 2.83 | 2.50 | 2.56 |
| Escaped per 50 known | 0.00 | 2.78 | 23.21 | 22.62 |

On its target cases, Cweb missed one known defect in one run that `B3` found in every run.

Decision: Cweb does not let fewer known defects escape, and its escaped interval reaches 2.92, above 2. It fails and does not ship. Its web searches went only to official documentation pages.

### Code reviewer: blocked on unread hunks (Cblk)

| Measure | `B3` (`main`) | Cblk | `B3`, `code-111-r1` | Cblk, `code-111-r1` |
|---|---:|---:|---:|---:|
| Runs | 24 | 24 | 3 | 3 |
| Cases | 8 | 8 | 1 | 1 |
| Known found per run | 2.75 | 2.79 | 3.67 | 3.00 |
| Escaped per 50 known | 17.65 | 17.16 | 34.72 | 37.50 |
| Round 1 recall difference, 90% interval | - | [-0.03, 0.03] | - | [-0.06, -0.06] |
| Escaped per 50 known difference, 90% interval | - | [-1.67, 1.39] | - | [2.78, 2.78] |
| Wrong per run | 0.21 | 0.04 | 0.00 | 0.00 |
| Seconds median | 311.4 | 294.8 | 378.2 | 293.0 |

Decision: no Cblk run returned a `blocked` verdict, also on the large readable case `code-111-r1`. On the 8 held-out cases, Cblk lets fewer known defects escape, both intervals stay inside their bounds, and its unknown findings are 0.00 in both arms. Cblk passes and ships. The large case has one case and 3 runs, so it does not decide.

### LOW rule in real runs

- Plan #113: the code review passed in round 3 with no open finding, so the LOW rule did not apply.
- Plan #115: code-review round 1 passed in all three lenses. Its findings and those of the self-review gave 11 distinct findings, the highest MEDIUM. The manager repaired 9 of them before round 2. Round 2 (delta) passed with 3 LOW findings: the 2 round-1 findings that the first repair missed (a stale skill date and the a6 expected tree) and a wrong count in this record. The manager repaired them before round 3. The final round of the review is outside these reviewed bytes, so the Verification Results of plan #115 and its run summary record it, with whether the LOW rule applied.

### Limits

- C1' and Cblk both change the code reviewer. They apply in the order of plan #115 decision 6 (C1', then Cblk), and their diffs did not conflict apart from the `content_hash` field of the code-reviewer skill. The combination was not measured as a whole.
- C1' ran without its contract sentence on 6 of the 8 code cases, because the snapshot contracts of the seeded cases do not hold the sentence.
- The family comparison includes a judge difference: a GPT judge judged the Claude findings and Claude judges judged the GPT findings. No third family ran here.
- The fresh plan set was easy: `main` found 2.86 of 3.14 known defects per run, so it left little room for D2' to show a gain.
- The control spread across batches: `B3` (the same `main` reviewer) let 20.29, 19.12, and 17.65 known defects per 50 known escape in batches A, B, and C on the same 8 cases. This spread is larger than the measured gain of each code candidate.
- Cblk on the large case: on `code-111-r1` (3 runs per arm), Cblk let 37.50 known defects per 50 known escape against 34.72, with a median round time of 293.0 s against 378.2 s. Shorter rounds with lower recall on the largest diff can mean that lenses skim, which Cblk is meant to stop. Pooled with the 8 deciding cases, Cblk lets about 22.5 escape against 22.1 per 50. The rule of decision 5 (6c) used this case only for the `blocked` check, and one case with 3 runs cannot separate the difference from the spread between runs. Issue #117 measures Cblk on more large diffs.
- Six of the new delta dev cases show, in their previous review, findings that are known defects of published held-out cases (`code-98-r1`, `code-102-r3`, `plan-103-r1`, `plan-109-r2`, `plan-111-r1`, and `plan-98-r6`).

### What shipped

- C1' with its contract sentence, then Cblk, applied to `main` in that order. The plan delta effort rule is reverted: every review round runs at the configured effort.
- Code review of plan #115 repaired two gaps of Cblk that the benchmark did not measure: the code-reviewer skill now defines the diff of each mode (the full diff, the lens's focus diff in a panel round, the delta diff), and the plan contract, the plan-manager skill, and the yolo skill dispatch a code reviewer again when it returns `blocked` for unread hunks.
- D2', Cweb, the second-family option, and the code delta effort rule did not ship.
- The candidate diffs stay in `variants/plan-115-cand-d2p.patch`, `variants/code-115-cand-c1p.patch`, `variants/code-115-cand-web.patch`, and `variants/code-115-cand-blk.patch`.

## Run 2026-10-27: Cblk on large diffs (plan #119)

### Setup

- Issue #117 asked for this run. In plan #115, Cblk passed its rule on 8 held-out cases, but on the large case `code-111-r1` (3 runs) it let more known defects escape and finished faster (see the Limits of plan #115).
- Arms: `B3` is the code reviewer of `main` with Cblk, as a panel. `C3` is the same reviewer with only the Cblk trigger removed (the unread-hunk sentences of agent step 11 and of the skill's Severity and verdict section), on the local ref `bench-119/cand-nocblk`. Its diff is `variants/code-119-cand-nocblk.patch`. The definition of the diff of each mode stays in both arms.
- Cases: every code case with at least 1,400 changed lines and at least 4 known defects: `code-44-r1` (8116 changed lines, 14 known), `code-111-r1` (1464, 12), `code-96-r1` (1405, 6), `code-89` (3478 plus its seeded patch, 6), and `code-14-pr15` (3279, 4); 42 known defects. All are published cases; the candidate removes a rule and was not tuned on any case.
- 5 runs per case and arm, 150 lens reviews, arms mixed in one dispatch queue. Model `openai-codex/gpt-6.1-sol`, effort `xhigh`, service tier `default`; the user turned fast mode off for these runs. Every run is valid.
- Judges: one Claude task agent per case. A GPT second judge agreed with 232 of 235 sampled answers (0.99): with 18 of 19 sampled `match` answers and with 28 of 30 sampled ratings.
- New harness fact (plan #119 decision 2): `transcripts` records `diffCoverage`, the share of the lines of a reviewer's own diff that its read results showed, and `report` gives `Diff read mean` and `Diff read`. It is an observation and does not decide.

### Decision rule (plan #119 decision 3, fixed before the runs)

Cblk stays only when all of these hold on the 5 cases, pooled with a 90% case-resample interval: (a) the escaped known defects per 50 known of `B3` minus those of `C3` have an upper bound below 2; (b) the round-1 recall of `B3` minus that of `C3` has a lower bound above -0.05; (c) the wrong findings per run of `B3` are at most 0.10 more than those of `C3`; (d) at most 1 in 20 `B3` lens reviews returns `blocked`. Otherwise Cblk is removed.

### Results

| Measure | `B3` (Cblk) | `C3` (no Cblk) |
|---|---:|---:|
| Runs | 25 | 25 |
| Cases | 5 | 5 |
| Known found per run | 2.84 | 2.72 |
| Escaped per 50 known | 33.10 | 33.81 |
| Escaped per 50 known difference (`B3` minus `C3`), 90% interval | [-2.81, 0.52] | - |
| Round 1 recall difference (`B3` minus `C3`), 90% interval | [0.00, 0.07] | - |
| Wrong per run | 0.04 | 0.04 |
| Unknown per run | 0.00 | 0.00 |
| `blocked` lens reviews | 0 of 75 | 0 of 75 |
| Seconds median | 460.8 | 424.6 |
| Diff read mean | 1.00 | 0.98 |
| Lens reviews that read their whole own diff | 75 of 75 | 73 of 75 |

- Escaped known defects per run, `B3` against `C3`: `code-44-r1` 10.0 against 9.6, `code-111-r1` 8.6 against 8.8, `code-96-r1` 4.4 against 4.8, `code-89` 1.8 against 1.8, `code-14-pr15` 3.0 against 3.4.
- The report splits the cases by folder: on the 3 dev cases `B3` let 28.75 escape against 31.25 (interval [-4.29, -1.11]); on the 2 held-out cases 35.77 against 35.38 ([-0.83, 1.43]). The pooled numbers above come from a case-resample script over the run table of the report, as in plan #115.
- Coverage: with Cblk, every lens read its whole focus diff. Without it, 2 of 25 `spec-and-tests` reviews read only part of theirs (the lowest 8% of the lines).

### Decision

All four conditions hold, so Cblk stays. The signal of plan #115 on `code-111-r1` did not repeat: with 5 runs, Cblk let 8.6 of 12 known defects escape per run there against 8.8, and Cblk rounds took longer, not shorter (460.8 s against 424.6 s median over the 5 cases).

### Limits

- The cases are published, and one case (`code-44-r1`, 14 known) carries a third of the known defects.
- `diffCoverage` counts read results only. A reviewer that searched its diff with grep, or read it through another file, shows a lower share than it saw.
- This run also corrected the contract sentence on delta-round effort: a delta round one effort level lower did not stay within the escaped-defect bound of plan #115 (upper interval ends 6.06 and 7.14 against 2), which is not a proof that it is worse.
