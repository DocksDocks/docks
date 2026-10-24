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
- The first judge was a Claude model, from another model family than the reviewers. A second judge (gpt-6.1-sol, effort high) judged a random 10% of the answers again.
- Table terms: escaped per 50 known is the escaped known defects per 50 known defects. Seconds is the slowest reviewer of a round. Loop seconds add the rounds of a loop and leave out the fixer. An interval row gives the 90% paired bootstrap interval of the difference from xhigh-fast. A dash means no value.

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
| Loop seconds difference from xhigh-fast, 90% interval | [-562.9, -264.9] | [-604.4, -289.1] | [-484.2, -206.1] | [-555.2, -266.9] | [-219.0, -55.5] | [-435.9, -177.6] | [197.7, 449.9] | - |

#### Code loops

| Measure | low | low-fast | medium | medium-fast | high | high-fast | xhigh | xhigh-fast |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Runs | 24 | 24 | 24 | 23 | 22 | 24 | 24 | 22 |
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
| Round 3 seconds max | 38.5 | 26.0 | 68.2 | 52.0 | 244.5 | 103.0 | 431.2 | 293.5 |
| Round 3 modes | delta 3 | delta 3 | delta 10, panel 1 | delta 9 | delta 9 | delta 10 | delta 11, panel 1 | delta 13, panel 1 |
| Round 3 known found per run | 0.67 | 0.33 | 0.27 | 0.33 | 0.22 | 0.20 | 0.33 | 0.43 |
| Round 4 seconds median | - | - | 45.3 | 34.3 | 105.1 | 43.5 | 352.3 | 116.7 |
| Round 4 seconds min | - | - | 37.9 | 23.9 | 102.5 | 30.9 | 200.3 | 64.6 |
| Round 4 seconds max | - | - | 52.6 | 44.8 | 145.6 | 56.0 | 467.7 | 219.3 |
| Round 4 modes | - | - | delta 2 | delta 2 | delta 3 | delta 2 | delta 4 | delta 7 |
| Round 4 known found per run | - | - | 0.50 | 0.50 | 0.33 | 1.00 | 0.25 | 0.43 |
| Round 5 seconds median | - | - | 38.5 | 32.4 | 142.4 | 69.3 | 425.3 | 260.6 |
| Round 5 seconds min | - | - | 38.5 | 32.4 | 93.9 | 69.3 | 191.6 | 44.2 |
| Round 5 seconds max | - | - | 38.5 | 32.4 | 192.9 | 69.3 | 505.5 | 324.2 |
| Round 5 modes | - | - | delta 1 | delta 1 | delta 3 | delta 1 | delta 4 | delta 5 |
| Round 5 known found per run | - | - | 0.00 | 0.00 | 0.33 | 0.00 | 0.25 | 0.40 |
| Rounds median | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 | 2.5 | 3.0 |
| Rounds max | 3 | 3 | 5 | 5 | 5 | 5 | 5 | 5 |
| Loop seconds median | 86.7 | 59.3 | 152.1 | 87.9 | 276.5 | 161.7 | 580.0 | 368.3 |
| Known found per run | 0.75 | 0.75 | 1.13 | 1.04 | 0.95 | 1.17 | 1.38 | 1.55 |
| Escaped per run | 3.00 | 3.00 | 2.63 | 2.78 | 2.59 | 2.58 | 2.38 | 2.09 |
| Valid extras per run | 2.04 | 2.63 | 3.88 | 3.52 | 6.68 | 4.83 | 9.38 | 10.23 |
| Extra-only rounds per run | 0.63 | 0.75 | 0.88 | 0.87 | 1.09 | 0.92 | 1.17 | 1.45 |
| Wrong per run | 0.00 | 0.04 | 0.00 | 0.04 | 0.32 | 0.17 | 0.08 | 0.14 |
| Unjudged per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Unknown ratings per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.14 | 0.04 | 0.04 | 0.00 |
| Unknown pairs per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Tokens median | 1354261 | 1502456 | 1700505 | 1701543 | 2754015 | 2554582 | 3554469 | 3913839 |
| Side-call tokens median | 0 | 0 | 0 | 0 | 231778 | 0 | 482119 | 387837 |
| Loops with a fixer | 20 | 23 | 22 | 20 | 21 | 22 | 22 | 22 |
| Fixer seconds median | 75.0 | 70.6 | 96.7 | 90.7 | 98.2 | 91.8 | 126.5 | 152.6 |
| Known found per loop minute | 0.49 | 0.73 | 0.41 | 0.64 | 0.16 | 0.36 | 0.10 | 0.19 |

#### Single reviews

| Measure | low | low-fast | medium | medium-fast | high | high-fast | xhigh | xhigh-fast |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Runs | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 |
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
| Known found per run | 0.35 | 0.39 | 0.54 | 0.61 | 0.69 | 0.63 | 0.78 | 0.89 |
| Escaped per run | 2.11 | 2.07 | 1.92 | 1.85 | 1.76 | 1.83 | 1.68 | 1.57 |
| Escaped per 50 known | 42.94 | 42.09 | 38.98 | 37.57 | 35.88 | 37.29 | 34.18 | 31.92 |
| Model | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol | openai-codex/gpt-6.1-sol |
| Effort | low | low | medium | medium | high | high | xhigh | xhigh |
| Served tier | default | priority | default | priority | default | priority | default | priority |
| Round 1 recall difference from xhigh-fast, 90% interval | [-0.26, -0.10] | [-0.24, -0.07] | [-0.17, -0.04] | [-0.14, -0.03] | [-0.11, 0.00] | [-0.12, -0.03] | [-0.03, 0.02] | - |
| Escaped per 50 known difference from xhigh-fast, 90% interval | [5.75, 14.90] | [4.17, 14.35] | [2.43, 10.70] | [2.17, 8.25] | [0.78, 6.37] | [2.04, 7.83] | [-0.41, 4.35] | - |
| Loop seconds difference from xhigh-fast, 90% interval | [-390.2, -148.2] | [-444.8, -194.0] | [-304.0, -119.6] | [-401.5, -177.6] | [-142.9, -9.5] | [-315.7, -118.7] | [124.9, 339.8] | - |

#### Code loops

| Measure | low | low-fast | medium | medium-fast | high | high-fast | xhigh | xhigh-fast |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Runs | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 |
| Round 1 seconds median | 69.8 | 35.0 | 79.3 | 45.4 | 160.6 | 85.7 | 319.1 | 170.3 |
| Round 1 seconds min | 40.0 | 25.5 | 43.1 | 26.8 | 59.6 | 36.4 | 138.9 | 85.9 |
| Round 1 seconds max | 106.0 | 97.4 | 193.9 | 113.8 | 473.8 | 215.0 | 706.9 | 436.4 |
| Round 1 modes | panel 30 | panel 30 | panel 30 | panel 30 | panel 30 | panel 30 | panel 30 | panel 30 |
| Round 1 known found per run | 0.27 | 0.20 | 0.37 | 0.40 | 0.53 | 0.53 | 0.73 | 0.73 |
| Round 2 seconds median | 37.8 | 20.2 | 49.8 | 29.4 | 76.0 | 42.4 | 145.6 | 89.2 |
| Round 2 seconds min | 16.8 | 15.0 | 25.5 | 18.6 | 37.6 | 25.0 | 84.8 | 46.8 |
| Round 2 seconds max | 108.8 | 85.8 | 173.2 | 106.1 | 490.1 | 209.9 | 620.3 | 413.8 |
| Round 2 modes | delta 17, panel 3 | delta 18, panel 2 | delta 18, panel 5 | delta 18, panel 4 | delta 18, panel 5 | delta 21, panel 5 | delta 22, panel 6 | delta 21, panel 7 |
| Round 2 known found per run | 0.05 | 0.05 | 0.09 | 0.14 | 0.17 | 0.08 | 0.04 | 0.25 |
| Round 3 seconds median | 32.4 | 19.1 | 64.3 | 34.8 | 144.9 | 42.0 | 169.4 | 177.8 |
| Round 3 seconds min | 24.4 | 12.4 | 31.7 | 30.7 | 42.8 | 26.8 | 63.4 | 66.0 |
| Round 3 seconds max | 42.5 | 25.8 | 123.6 | 50.5 | 201.2 | 83.6 | 392.1 | 286.4 |
| Round 3 modes | delta 4 | delta 2 | delta 6 | delta 3 | delta 5 | delta 7 | delta 7 | delta 7 |
| Round 3 known found per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Round 4 seconds median | - | - | 43.6 | 21.7 | 113.0 | - | 138.4 | 82.8 |
| Round 4 seconds min | - | - | 32.3 | 20.0 | 56.6 | - | 103.6 | 34.6 |
| Round 4 seconds max | - | - | 54.9 | 23.4 | 153.6 | - | 344.2 | 201.5 |
| Round 4 modes | - | - | delta 2 | delta 2 | delta 3 | - | delta 3 | delta 6 |
| Round 4 known found per run | - | - | 0.00 | 0.00 | 0.00 | - | 0.00 | 0.00 |
| Round 5 seconds median | - | - | - | - | 133.6 | - | 123.6 | 70.6 |
| Round 5 seconds min | - | - | - | - | 133.6 | - | 123.6 | 39.7 |
| Round 5 seconds max | - | - | - | - | 133.6 | - | 123.6 | 101.5 |
| Round 5 modes | - | - | - | - | delta 1 | - | delta 1 | delta 2 |
| Round 5 known found per run | - | - | - | - | 0.00 | - | 0.00 | 0.00 |
| Rounds median | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 |
| Rounds max | 3 | 3 | 4 | 4 | 5 | 3 | 5 | 5 |
| Loop seconds median | 93.8 | 49.2 | 123.5 | 70.2 | 229.7 | 127.4 | 447.8 | 262.9 |
| Known found per run | 0.30 | 0.23 | 0.43 | 0.50 | 0.67 | 0.60 | 0.77 | 0.97 |
| Escaped per run | 3.00 | 3.07 | 2.87 | 2.80 | 2.63 | 2.70 | 2.53 | 2.33 |
| Valid extras per run | 1.63 | 1.37 | 2.47 | 2.20 | 3.37 | 3.60 | 5.07 | 5.30 |
| Extra-only rounds per run | 0.57 | 0.50 | 0.70 | 0.60 | 0.63 | 0.73 | 0.97 | 1.03 |
| Wrong per run | 0.20 | 0.20 | 0.27 | 0.23 | 0.30 | 0.33 | 0.30 | 0.40 |
| Unjudged per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Unknown ratings per run | 0.03 | 0.00 | 0.03 | 0.00 | 0.10 | 0.00 | 0.07 | 0.03 |
| Unknown pairs per run | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Tokens median | 981364 | 955989 | 1122810 | 1075931 | 1509396 | 1636417 | 2493684 | 2536651 |
| Side-call tokens median | 0 | 0 | 0 | 0 | 136936 | 0 | 334809 | 182625 |
| Loops with a fixer | 18 | 16 | 22 | 20 | 21 | 26 | 28 | 28 |
| Fixer seconds median | 48.4 | 53.9 | 41.4 | 44.8 | 53.8 | 61.0 | 60.8 | 60.8 |
| Known found per loop minute | 0.17 | 0.25 | 0.17 | 0.36 | 0.13 | 0.24 | 0.08 | 0.16 |

#### Single reviews

| Measure | low | low-fast | medium | medium-fast | high | high-fast | xhigh | xhigh-fast |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Runs | 42 | 42 | 42 | 42 | 42 | 42 | 42 | 42 |
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

The second judge agreed with 606 of 611 answers (0.99).

### Decision under the rule

xhigh-fast has the fewest escaped known defects on the held-out cases (31.92 per 50 known), so it is the best configuration. The interval bounds below come from the held-out decision table.

| Configuration | Escaped per 50 known | Escaped-per-50 interval upper bound | Round 1 recall interval lower bound | Not worse than the best |
|---|---:|---|---|---|
| low | 42.94 | 14.90, not below 2 | -0.26, not above -0.05 | No |
| low-fast | 42.09 | 14.35, not below 2 | -0.24, not above -0.05 | No |
| medium | 38.98 | 10.70, not below 2 | -0.17, not above -0.05 | No |
| medium-fast | 37.57 | 8.25, not below 2 | -0.14, not above -0.05 | No |
| high | 35.88 | 6.37, not below 2 | -0.11, not above -0.05 | No |
| high-fast | 37.29 | 7.83, not below 2 | -0.12, not above -0.05 | No |
| xhigh | 34.18 | 4.35, not below 2 | -0.03, above -0.05 | No |
| xhigh-fast | 31.92 | reference | reference | Yes (the best) |

No other configuration is not worse than xhigh-fast. xhigh passes the recall bound but fails the escaped-defect bound. The recommended configuration is xhigh-fast, with a median loop time of 262.9 s on the held-out code loops. This is the production setting, so the reviewer setting stays as it is.

### Observations

- The priority tier cuts round time by about 40-50% at each effort, with the same model and effort. Held-out round 1 seconds median: low 69.8 to 35.0, medium 79.3 to 45.4, high 160.6 to 85.7, xhigh 319.1 to 170.3. Held-out single reviews: 61.6 to 32.0, 80.4 to 45.3, 141.1 to 71.6, 248.3 to 143.3.
- Recall rises with effort. Held-out round 1 known found per run: 0.27 and 0.20 at low, 0.37 and 0.40 at medium, 0.53 and 0.53 at high, 0.73 and 0.73 at xhigh (default and priority tier).
- Valid extra findings rise with effort. Held-out valid extras per run: 1.63 and 1.37 at low, 5.07 and 5.30 at xhigh. Extra-only rounds per run: 0.57 and 0.50 at low, 0.97 and 1.03 at xhigh.
- Known found per loop minute on the held-out code loops is highest at medium-fast (0.36). On the dev code loops it is highest at low-fast (0.73).
- The tier changes tokens little. Held-out code-loop tokens median: xhigh 2493684, xhigh-fast 2536651; low 981364, low-fast 955989.
- xhigh (default tier) is the slowest configuration: its held-out loop seconds interval against xhigh-fast is [124.9, 339.8], and its median loop time is 447.8 s.

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
