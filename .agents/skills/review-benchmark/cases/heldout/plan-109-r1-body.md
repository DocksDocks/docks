<!-- plan-contract: v4 -->

## Goal

Plan #100 measured the released plan-reviewer prompts with `openai-codex/gpt-6.1-sol` at effort `xhigh` and the priority tier on 13 held-out plan cases: the 0.16.0 prompt found 0.85 known defects per run and the 0.17.1 prompt found 0.69, and the current 0.17.1 prompt is not shown to be not worse (escaped interval [-1.19, 8.89] per 50 known, recall interval [-0.18, 0.02]). Find the causes, write candidate plan-reviewer prompts, and measure them against the 0.16.0 and 0.17.1 prompts at effort `xhigh` with the `default` service tier (fast mode off for these tests). Choose the best prompt with a decision rule that is fixed before the deciding runs, and ship it as the plan reviewer of plan-lifecycle. Keep the delta mode of 0.17.1. Add plan cases where the record allows, so that the decision has enough power.

Yolo: the user delegated every decision except the merge to the agent.

Mode: plan-and-implement

## Research

### Evidence

- #100 step 6 (held-out plan cases, `xhigh` with the priority tier, single rounds, 3 runs per case): the 0.16.0 prompt (P0) found 0.85 known defects per run, escaped 27.70 per 50 known, 126 s median; the 0.17.1 prompt (P1) found 0.69, escaped 32.00, 154 s. P1 against P0: escaped interval [-1.19, 8.89], recall interval [-0.18, 0.02]. Both intervals include zero.
- In the #100 grid, the same 0.17.1 prompt on the same held-out plan cases found 0.83 known defects per run with the priority tier and 0.79 with the default tier. So two batches of one prompt differ about as much as P0 and P1 differ.
- Experiment (this plan, `bench-109/dev` under the review scratch folder): `openai-codex/gpt-6.1-sol`, effort `xhigh`, default tier, 3 runs; P0 on the 8 dev plan cases, P1 on the 6 dev `plan` cases, and the 0.17.1 delta mode on the 2 dev `plan-delta` cases. P0 found 0.79 known defects per run and P1 0.78; P1 against P0 on the 6 shared cases: recall interval [-0.13, 0.08], escaped interval [-3.92, 6.25]. P1 gave more valid extra findings (0.94 against 0.54 per run) and fewer wrong findings (0.00 against 0.04), took longer (218 s against 188 s median), and used fewer tokens. Every transcript showed effort `xhigh` and the served tier `default`.

### Prompt differences from 0.16.0 to 0.17.1

A line-by-line comparison of `plugins/plan-lifecycle/agents/plan-reviewer.md`, the `plan-reviewer` skill and its references, and the plan-review parts of the contract found these differences that can change recall:

- Recorded decisions: 0.17.1 puts the plan's recorded decisions before the repository instruction files when rules conflict (agent, skill Precedence), and its finding bar says "It does not dispute a decision that the plan records". About 7 of the 18 dev plan defects attack a recorded decision or its premise.
- Finding bar: a list of six conditions that every finding must meet, applied two times (agent step 7 and the anti-hallucination checks, and the skill Verification). Its first condition leaves out defects of Acceptance checks.
- Evidence: every finding must cite the repository file or the official URL and give a scenario with the expected and the actual result. 0.16.0 asked the reviewer to re-read each cited locator.
- Unverified claims: the 0.17.1 BAD example ("The claim about retries can be wrong - Verify it") teaches that an unproven premise is not a finding unless the reviewer proves it false.
- Positive rules: 0.16.0 told the reviewer, in the agent and the skill, to report a temporary workaround and a missing Acceptance check that the repository instructions require. In 0.17.1 they sit in the skill and the checklist, under the finding bar.
- Also changed: the one-pass rule ("List every qualifying finding in one pass"), the new checklist (Files cells, commands, documentation semantics), the reading order, wider finding kinds, merged findings for one defect class, and the delta mode. The delta mode does not explain the gap, because P0 and P1 ran full rounds.

Hypotheses, most likely first: H0, much of the gap is batch noise; H1, the rule that a recorded decision is settled; H2, the strict finding bar, its second pass, and the BAD example; H3, the positive rules moved under the bar; H4, the checklist and the contract reads take attention from the premises.

### New plan cases

The plan-review rounds after the corpus have 8 findings, all repaired: #100 round 1 (4 findings) and round 5 (1 finding, a delta round on a branch commit), #102 round 1 (already the dev case `plan-102-r1`), and #103 rounds 1 and 2 (2 findings). #106 round 1 passed. The #103 plan body describes the fix of D96-D2, which the corpus keeps without a case file (Do not touch), so #103 stays out. So 2 new cases with 5 known defects can join the held-out split.

### Decisions

1. **Candidates.** Three nested changes against 0.17.1, each for one group of hypotheses. Each keeps `references/delta.md`, the Output Format sections, and the `## Finding bar` heading, because the plan helper and `delta.md` depend on them.
   - A (H1): repository instruction files and the plan contract rank above the plan's recorded decisions; a recorded decision settles the choice, not the facts that it states or relies on, and not its effects; the checklist gets an item for the premises and effects of each decision.
   - B (A, H2, H3): a lighter finding bar (a load-bearing defect of the plan with cited evidence; a labeled inference with cited evidence qualifies); the 0.16.0 workaround rule and Acceptance rule come back into the agent and the skill; a finding is dropped only when the re-read shows its evidence false or it is cosmetic; a scenario is needed only when the cited lines do not show the effect; the BAD example for unverified claims shows real vagueness instead.
   - C (B, H4): list the load-bearing claims first and verify each one; then use the checklist as a second pass; a full round loads only the references of its mode.
   - Rejected: returning to the 0.16.0 text (it has no delta mode and lacks the checklist items that found the #98 seeded defects); one large rewrite (a result could not show which change helps).
2. **Variants in the harness.** `prepare.mjs agents --variants <name>=<git ref>[,...]` writes one plan-reviewer agent per variant and configuration (`review-bench-variant-<name>-plan-<config>`) and exports each variant's `plugins/plan-lifecycle` from its ref, so the read-scope rule treats that skill folder as the reviewer's own. `--full-only <name,...>` marks variants without a delta mode. Arms are `V<name>`. `score.mjs report --reference <folder>` sets the column that the intervals compare with. The candidates live on local refs until step 6 applies the winner. The variants are V16 (`plan-lifecycle--v0.16.0`, full only), V17 (`plan-lifecycle--v0.17.1`), Va, Vb, and Vc.
3. **Configuration.** `openai-codex/gpt-6.1-sol`, effort `xhigh`, service tier `default`. The user turned fast mode off in the deployed omp config for these tests (`docks-kit omp --fast`, `tier.openai` from `priority` to `none`); each reviewer agent also has a `default` tier override, and its transcript proves the served tier. At most 16 agents run at a time.
4. **Dev check, then held-out once.** On the dev plan cases, 3 runs per variant, check that each candidate change works as intended: A should find P102-1, P89-1, P89-3, P96-1, and P96-2; B also P57-5, P96-4, P96-6, and P83-1; C also P57-4. A candidate gets at most one revision on dev. Then run every variant on the held-out plan cases (the 14 of #100 and the 2 new cases), 5 runs per variant, with the arms mixed in one dispatch queue. A model of another family than the reviewers judges, and a second judge re-judges a random 10%.
5. **Decision rule, fixed before the held-out runs.** A variant replaces V17 only when, on the held-out cases, all of these hold: its escaped known defects per 50 known are fewer than V17's; against V17, its escaped-difference 90% interval stays below 2 per 50 and its round-1 recall interval stays above -0.05 (the bounds of #100); and its wrong findings per run are at most 0.10 more than V17's. Among the variants that pass, the one with the fewest escaped defects wins, and a tie goes to the lower median time. When no variant passes, V17 stays, and the results log records the measured differences. A V16 win ships the 0.16.0 text with the 0.17.1 delta mode added, and the results log says that this combination was not measured as a whole.
6. **Blind rule.** Prompt design and the dev revision do not read held-out cases or held-out reports. The 2 new held-out cases keep their keys outside the repository until the decision.
7. **Shipping.** The winner's files replace the plan-reviewer files of plan-lifecycle on the plan branch, and the content hashes are refreshed. When the winner contains candidate A, the contract sentence "Reviewers treat a recorded decision as settled" (Yolo runs) changes for plan reviewers only: they treat the choice as settled and report a false premise or a broken effect. Code reviewers keep the current rule, because the code reviewer is not under test. A release follows only after the merge, with its own question.
8. **Fast mode after the tests.** The production setting stays `xhigh-fast`, so after the last benchmark run, `docks-kit omp --fast` turns fast mode back on.

### Request corrections

Asked: "improve the reviewer itself". Did: improve the plan reviewer; the code reviewer stays out of scope. Reason: in #100 step 6, the 0.17.1 code prompt beat the 0.16.0 code prompt, and only the plan prompt was not shown to be not worse.

Asked: "it is better in the previous prompt for reviewing". Did: test the 0.16.0 prompt again as a control in the same batch, instead of taking it as better. Reason: the same 0.17.1 prompt found 0.83 and 0.69 known defects per run in two batches on the same cases, and the dev experiment found no difference (0.79 against 0.78).

### Engineering standards

- Step `harness_variants`: `tdd-workflow` (the variant tests are written first and fail), `code-clarity`, `commit-discipline`.
- Step `plan_cases`: `commit-discipline`.
- Steps `candidates` and `ship_prompt`: `code-clarity` (instructions say what the reviewer does and why), `commit-discipline`; after a skill change, the content-hash backfill that `plugins/plan-lifecycle/skills/AGENTS.md` requires.
- Before code review round 1: `code-review` self-review with `code-clarity`.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | harness_variants | Implement decision 2 in the benchmark harness: `agents --variants` and `--full-only`, arms `V<name>`, a variant plugin root for the read scope, `report --reference`, and the SKILL text | .agents/skills/review-benchmark/scripts/prepare.mjs, .agents/skills/review-benchmark/scripts/score.mjs, .agents/skills/review-benchmark/SKILL.md, scripts/tests/unit/review-benchmark.test.mjs, scripts/config/test-contracts.json | - | local | planned | unit tests show one agent per variant and configuration, a plan case built for several variant arms in full and delta mode, a full-only variant on a plan-delta case, and a report against a named reference; the red baseline is recorded |
| 2 | plan_cases | Build the held-out cases of #100 round 1 and round 5 with a builder agent that reports only counts, with the keys outside the repository | .agents/skills/review-benchmark/cases/heldout/ | - | local | planned | both cases build with `prepare.mjs case --keys` |
| 3 | candidates | Write candidates A, B, and C of decision 1 as commits on local refs from `main` | plugins/plan-lifecycle/agents/plan-reviewer.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/references/checklist.md | - | local | planned | three refs exist; each changes only its items of decision 1; the plan-review block and `delta.md` are unchanged |
| 4 | dev_runs | Run V16, V17, Va, Vb, and Vc on the dev plan cases (decision 4), check each candidate change, and revise a candidate at most once | .agents/skills/review-benchmark/results.md | 1, 3 | local | planned | the dev table and the check of each change are in the results log |
| 5 | heldout_runs | Run the five variants on the held-out plan cases (decision 4), judge, run the second judge, make the reports against V17, and apply decision 5 | .agents/skills/review-benchmark/results.md | 2, 4 | local | planned | the results log holds the tables, the intervals against V17, and the decision |
| 6 | ship_prompt | Apply the winner to plan-lifecycle, with the contract sentence when the winner contains candidate A, and refresh the content hashes; or record that 0.17.1 stays | plugins/plan-lifecycle/agents/plan-reviewer.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/references/checklist.md, plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md | 5 | local | planned | the shipped files equal the winner's files, and `bun scripts/ci.mjs` exits 0 |
| 7 | keys_and_fast | After the held-out runs, add the new held-out keys to the repository, and turn fast mode back on with `docks-kit omp --fast` | .agents/skills/review-benchmark/cases/heldout/ | 5 | local | planned | the keys are committed, and `tier.openai` is `priority` in the deployed omp config |
| 8 | release_plan_lifecycle | After the merge and only with its own question, release plan-lifecycle when step 6 changed it | plugins/plan-lifecycle/.claude-plugin/plugin.json, plugins/plan-lifecycle/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 6 | release | planned | the release tag CI passes, or the step is skipped with the user's answer recorded |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| a1 | `bun scripts/ci.mjs` | exits 0 for the repo-wide checks and both plugins |
| a2 | `bun test ./scripts/tests/unit/review-benchmark.test.mjs` | passes, including the variant tests |
| a3 | `score.mjs report` on the dev and held-out workspaces | no invalid run, or each invalid run named with its reason; every valid run shows model `openai-codex/gpt-6.1-sol`, effort `xhigh`, and served tier `default` |
| a4 | `.agents/skills/review-benchmark/results.md` | the dev check, the held-out tables, the intervals of each variant against V17, and the decision under decision 5 |
| a5 | `git diff <winner ref> HEAD -- <plan-reviewer files>` | prints nothing, or the files equal 0.17.1 when it stays |
| a6 | `bun scripts/ci.mjs --plugin plan-lifecycle` | exits 0 when step 6 changed the plugin |

## Do not touch

- The code-reviewer agent and skill, and the code-review loop.
- The plan-review block, the verdict words, and the plan helper.
- The decision rule of #100 and its entry in `results.md`.
- D96-D2: no case file describes it, so the #103 rounds stay out of the corpus.

## Open questions

## Verification Results
