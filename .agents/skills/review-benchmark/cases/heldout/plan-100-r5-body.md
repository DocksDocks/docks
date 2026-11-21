<!-- plan-contract: v4 -->

## Goal

Build a review benchmark that can judge reviewer setups, as a follow-up to #98 (pull request #99). The #98 benchmark had 13 known dev code defects and 6 seeded held-out code defects. Every arm found all held-out defects, and one defect moved recall by 0.14 to 0.17, so the benchmark showed that delta rounds are faster but could not show whether the new prompts find more defects. Collect 50 or more defects from four sources: escaped defects (fixed after a reviewed merge), yolo self-review findings, defects that reviewers missed (found by a later round, another lens, or after the review passed), and seeded defects. Run each configuration 3 times, keep a held-out split closed until the decision, and then judge again the #98 code and plan prompts, the three-lens panel, and the lead from #98 that lens text in the dispatch message found more than lens text in a reference file. Token cost is not a limit; defects found, round time, review-loop rounds, and loop time decide.

Measure the reviewer model at every reasoning effort, with and without OpenAI's priority service tier (omp's fast mode): for `openai-codex/gpt-6.1-sol`, the efforts `low`, `medium`, `high`, and `xhigh`, each with the `priority` tier and with the `default` tier. The report shows, for each of the eight configurations, the time and the defects found per round, and the rounds and the time that a whole review loop takes. The benchmark documents how to run the same grid for a new model, so that each new reviewer model gets the same table.

Also answer these leads from #98:

- The yolo self-review set the time of code review round 1 (504 s, against 261 s for the slowest lens). Measure whether a split self-review, or no self-review when a panel runs, keeps its unique findings and finishes sooner.
- A finding without a match and without an adjudication shows only in the per-run `Unjudged` column. Decide whether the report must stop on it, as it stops on a missing pair answer.
- The code reviewer reports every evidenced defect, also a LOW one, and yolo fixes every reproduced finding before the next round. Count the extra findings and the rounds they cause, so the benchmark can show whether this stance adds rounds.
- The judges rated no finding `wrong` in either #98 wave. Spot-check a sample of match and adjudication answers against the snapshots, and record the agreement.

Yolo: the user delegated every decision except the merge to the agent.

Mode: plan-and-implement

## Research

### Defect sources

Two inventories ran on `main` at `936ad562` with read-only git and gh commands. They recorded identifiers only, so that the plan author does not see the defects and a blind held-out split stays possible. The lists are in the review scratch directory, `plan-100-research/`.

- Escaped defects: 98 fix commits screened; 32 defects qualify (introduced by a reviewed plan pull request, with a fix that isolates to the defect in 20 cases and partly in 12). Categories: 15 shipped skill text, 12 code, 4 test, 1 docs. They come from 16 plan pull requests.
- Review record: 148 issue comments read; 45 unique defects qualify with a fix: 10 self-review findings, 14 findings that only one lens of a panel reported, 21 defects that a later round found in code that an earlier round had reviewed, and 7 defects found after a plan's review passed (D3 to D7 of #96 and the parser regression that pull request #101 fixed). The fix isolates in 16 cases and partly in 36 rows.
- The two lists share 8 fixing commits, so the real candidates are about 69 defects before the case builder removes duplicates and defects without a usable snapshot. That covers the 50-defect target without seeded defects; seeded defects fill categories with few real defects (for example docs).
- D2 of #96 is out of scope for public case files: the user chose a neutral public fix for it in #103.

### Reviewer model settings

- The user's omp config routes `code-reviewer` and `plan-reviewer` to the `reviewer` role, `openai-codex/gpt-6.1-sol:xhigh`, and sets `tier.openai: priority` for every OpenAI request. `defaultThinkingLevel` is `high`. Production reviews therefore run as `xhigh-fast`, which is the baseline column of the grid. The config also sets `retry.usageAwareFallback: true` with `anthropic/claude-opus-5-5:xhigh` as the `reviewer` fallback, so a long sweep that reaches a usage limit can move a run to another model without an error.
- The #98 benchmark agents (`review-bench-*`) had their own `model` line, so they did not get the role's effort: the transcripts of those runs record `thinkingLevel: high` and the service tier `priority`. The #98 numbers therefore describe `high`, not the `xhigh` that production reviews use. A scan of the #98 reviewer transcripts found no assistant message from another model; one plan run holds a `model_usage` side call of `gpt-6-luna` (362 tokens), which `parseTranscript` does not count.
- omp sets the effort of an agent-file subagent with the frontmatter key `thinking-level` (or `thinking`), and a model selector can carry a `:<level>` suffix (`omp://task-agent-discovery.md`, `omp://models.md`). The tier of a spawned agent comes from `tier.subagent` (default `inherit`) or `task.agentServiceTierOverrides.<agent>`; one `omp -p` run takes `--service-tier <tier>` (`omp://settings.md`, the `tier.*` and `task.agentServiceTierOverrides` rows; `omp --help`).
- Experiment (omp 18.12.6): `omp -p --model openai-codex/gpt-6.1-sol:low --service-tier default` and `...:xhigh --service-tier priority`, each with a one-word prompt. Each transcript records the requested effort (`thinking_level_change`, `thinkingLevel`), the requested tier (`service_tier_change`), and, on the assistant message, the tier that the response reports (`serviceTier: "default"` with `premiumRequests: 0`, and `serviceTier: "priority"` with `premiumRequests: 1`). A run can therefore prove which effort it asked for and which tier served it.
- Benchmark 1 of #98 dispatched lens reviewers at the task tool's highest effort and took 250 to 577 s per lens, against 136 to 159 s at `high`, and found more on `code-96`. Effort changes both recall and time, so the grid needs both.
- The user is not sure that the priority tier makes reviews faster; the grid measures it at each effort.

### Harness facts

- `prepare.mjs agents` writes one baseline and one candidate agent per role with one shared `--model`; it writes no effort and no tier (`prepareAgents`, `renderAgent`).
- `score.mjs transcripts` records only seconds and tokens per reviewer (`parseTranscript`, `transcriptsCommand`); the report has no column for model, effort, or tier.
- Case files have no field for a defect's fix patch (`KIND_FIELDS`, `FILE_FIELDS`, `validateCase`), so a review loop cannot be replayed.
- #98 decision 9 rejected effort tuning because omp needs `task.enableEffort` and other runtimes differ. The user now asks for the sweep; the sweep sets effort per agent file or per run, not through `task.enableEffort`, and the recommended setting stays a user setting (the plugin's agents carry no `model` key, root `AGENTS.md`).
- Reviewers run as subagents whose working directory is the live checkout on `main`, which holds the fixes of every corpus defect, dev and held-out. A reviewer that reads the live tree (a path under it, or a Grep or Glob without a path) would see fixed code, and recall would measure leakage. A scan of the 96 #98 reviewer transcripts found no such read: every read named the workspace, the reviewer's own skill and agent files, `skill://` URIs, `artifact://` output, or public web pages. omp gives a task subagent no working directory of its own, so the harness detects the reads instead of preventing them.

### Statistics

- With 50 or more defects and 3 runs, a recall difference of about 15 points between two configurations is detectable; one defect moves recall by 2 points or less.
- Configurations run on the same cases, so comparisons are paired: a bootstrap over cases (10,000 resamples) gives a 90% interval for each difference in recall and in loop time.

### Decisions

1. **Corpus.** A separate case-builder agent builds the cases from the two inventories and from seeded defects, and returns only paths and counts. Each code case is the reviewed candidate of the introducing change (its base and the reviewed head, or the round head), the plan export of that time, and a key with each defect's id, locator, category, source, and fix patch. The builder removes duplicates, keeps at least 50 defects, and splits by case into dev (about 40%) and held-out (about 60%), balanced by category and source. Plan cases come from historical plan-review findings in the same way, without fix patches. During the runs, the held-out keys live outside the repository (`$XDG_STATE_HOME/docks/review-bench/keys/`, mode 0700), because reviewers can search the checkout; `score.mjs` (`readKnown`, the `pairs`, `report`, and loop commands) and `prepare.mjs` (the loop command) take a `--keys <dir>` option that reads them there, `references/judge.md` names that input for the judge, and the keys are added to the repository after the decision. Seeded defects come from a different agent than the one that writes reviewer prompts.
2. **Configuration grid.** A configuration is a model, an effort, and a tier. The first grid is `openai-codex/gpt-6.1-sol` with `low`, `medium`, `high`, and `xhigh`, each with the tiers `priority` (named `<effort>-fast`) and `default` (named `<effort>`): eight configurations. Each uses the production reviewer setup of plan-lifecycle 0.17.1: the current prompts, a panel round 1 for 50 or more changed lines and a full round below that, and delta rounds for repairs. Step 1 picks the dispatch mechanism that applies the effort and the tier to each reviewer (agent files with `thinking-level` plus a per-agent tier override that the harness writes and removes, or one `omp -p` process per reviewer with `--model <model>:<effort> --service-tier <tier>`), and every run must prove its configuration from its transcript. The harness takes any list of models, efforts, and tiers, so a later model runs the same grid.
3. **Loop replay.** Each run of a code case is a whole review loop that follows the production loop; the key scores the run and does not end it. Round 1 reviews the candidate. The judge matches the findings to the key and adjudicates the rest. Then the fix step repairs every finding that stands: a matched known defect gets its fix patch, and a valid extra finding gets a fix that one fixed fixer agent writes (the same model, effort, and tier for every configuration, so that only the reviewer setup varies); a finding rated wrong goes into a rejection file with the judge's evidence, as the contract's rejection comment does. The harness commits the repaired tree as the next reviewed head and picks the next round's mode by the production rules of plan-lifecycle 0.17.1 (`plan-contract.md`, Code-review rounds): a `delta` round only when the previous round completed, every change since its head repairs one of its findings, and the delta diff is at most half the full diff; otherwise a `panel` or `full` round by the size rule. The loop ends when a round returns no open finding (every previous finding fixed, no new finding that stands), or at 5 rounds. The record of each run keeps every round: its mode, its time (the slowest reviewer), its tokens, its findings, and the known defects it found; the loop record adds the rounds, the total time (review rounds only; the fixer's time is reported apart), the total tokens, the known defects found by the end, the known defects that escaped the loop, the valid extra findings, and the rounds that only extra findings caused. Plan cases run one round per run.
4. **Report.** For each case group (dev, held-out) the report gives one column per configuration, named as in decision 2 (`low`, `low-fast`, `medium`, `medium-fast`, `high`, `high-fast`, `xhigh`, `xhigh-fast`; `xhigh-fast` is the production baseline), and these rows: for each round index (round 1, round 2, and so on) its time (median, minimum, maximum), its mode counts, and the known defects that it found; then the loop rows: rounds (median and maximum), loop time (median), known defects found by the end, escaped defects, valid extra findings, rounds caused only by extra findings, wrong findings, unjudged and unknown answers, tokens, fixer time, and the model, effort, and served tier that the transcripts show. It adds the 90% bootstrap interval of each configuration's difference from the best one, and the known defects found per loop minute. Time and tokens come only from the assistant messages of the configured model; side calls such as `model_usage` records of a helper model are reported apart. A run is invalid and leaves the table when any of its assistant messages comes from another model than its configuration (for example after a usage fallback), when its transcript shows another effort or served tier, or when a reviewer read outside its inputs: every tool-call target must be the run's workspace files or tree copies, the reviewer's own skill folder and agent file, a `skill://` URI of the reviewer's skills, an `artifact://` URI, or a web page that is not part of the benchmark repository; a Grep, Glob, or find call without a path counts as outside. Every reviewer prompt says that the working directory is not the snapshot.
5. **Decision rule, fixed before any run.** Among the eight configurations, the best is the one with the fewest escaped defects at loop end on the held-out cases. A configuration is not worse than the best when the 90% interval of its escaped-defect difference stays below 2 defects per 50 and its round-1 recall interval stays above -0.05. Among the configurations that are not worse, the recommended one has the lowest median loop time; tokens are reported but do not decide. The same rule then compares, at the recommended configuration: the 0.16.0 and the 0.17.1 code prompts, the panel and one full reviewer, the lens text in the dispatch and in a reference, and the 0.16.0 and 0.17.1 plan prompts on plan cases (round-1 recall for plan cases). Dev runs may change the harness, not the decision rule.
6. **Leads from #98.** The self-review lead runs the yolo self-review (the `reviewer` agent with the docks `code-review` and `code-clarity` skills) on the same round-1 candidates at the recommended configuration, as one agent and split by lens, and reports its time and the defects that only it found. The report stops on a finding with neither a match nor an adjudication, as it stops on a missing pair answer. The loop replay counts valid extra findings per round, which measures the extra rounds of the report-every-LOW stance. A second judge from another model family re-judges a random 10% of the match and adjudication answers, and the report gives the agreement rate.
7. **Reusable procedure.** The benchmark skill gets a section that tells how to run the grid for a new model: the commands with the model, efforts, and tiers as parameters, the proof that each run used its configuration, the report, the decision rule, and where to append the results in `results.md`. The recommended reviewer setting (effort and tier for the `reviewer` role) goes into `results.md` and the run summary as a user setting, with the omp config lines that set it.

### Request corrections

Asked: "test all efforts for gpt 6.1 sol ... low, medium, high, xhigh", "compare with and without the --fast too". Did: the grid has the four efforts, each with the `priority` tier (the user's fast mode) and the `default` tier. Reason: the user named fast as OpenAI's priority tier; omp's `--service-tier` and `tier.openai` set it, and the transcripts record the served tier.

Asked (in #98 decision 9, rejected then): no reasoning-effort tuning. Did: the effort sweep runs, with the effort set per agent file or per run. Reason: the user asked for it, and the #98 numbers came from `high` while production reviews use `xhigh`.

### Engineering standards

- Steps 1 to 3: `tdd-workflow` for new scorer behavior (bootstrap intervals, the configuration table, loop aggregation, the unjudged stop), `test-coverage` for the existing scorer paths that the change touches, and `code-clarity`.
- Step 4: the blind-split rule of decision 1 (the plan author does not read held-out keys).
- Step 8: `write-skill` rules for the skill text and `code-clarity`.
- Commits: `commit-discipline`. Self-review during code review round 1: `code-review` with `code-clarity`.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | dispatch_grid | Implement decision 2 in the harness: arms from lists of models, efforts, and tiers; the dispatch mechanism; a probe that runs one reviewer per configuration | .agents/skills/review-benchmark/scripts/prepare.mjs, .agents/skills/review-benchmark/SKILL.md, .gitignore | - | local | done | a probe of the eight configurations writes `meta.json` files whose transcripts show the requested effort and the served tier of each configuration |
| 2 | scorer_report | Implement decisions 4 and 6 (report parts) and the external keys of decision 1 in the scorer: model, effort, requested and served tier per run in `meta.json`; time and tokens from the configured model's assistant messages only; the invalid-run rule for another model, effort, or served tier; round-indexed scores and timing; the configuration table; bootstrap intervals; the stop on unjudged findings; the judge agreement rate; `--keys <dir>` for `pairs` and `report`, and the judge reference text for it | .agents/skills/review-benchmark/scripts/score.mjs, .agents/skills/review-benchmark/references/judge.md, scripts/tests/unit/review-benchmark.test.mjs, scripts/config/test-contracts.json | 1 | local | done | the unit tests cover each new report part, round indexing, external keys, a run with a fallback-model message (invalid), and a run with a helper side call (not counted), and pass, with the red baseline recorded |
| 3 | loop_replay | Implement decision 3: fix-patch fields in case files, the fix step with the fixed fixer agent and the rejection file, production round-mode selection, a `loop` command (with `--keys <dir>`) that builds round k+1 from the round-k judgments, and loop aggregation in the scorer | .agents/skills/review-benchmark/scripts/prepare.mjs, .agents/skills/review-benchmark/scripts/score.mjs, scripts/tests/unit/review-benchmark.test.mjs | 2 | local | done | a dev case runs a loop end to end through a repair of a known defect and of a valid extra finding, the round modes follow the production rules, and the unit tests cover the mode selection and the aggregation |
| 4 | corpus | Implement decision 1 with a separate case-builder agent | .agents/skills/review-benchmark/cases/ | 3 | local | done | at least 50 defects in dev and held-out cases with fix patches for code defects, `prepare.mjs` builds every case, and the held-out keys are outside the repository |
| 5 | grid_runs | Run the eight configurations, 3 loops each, on dev, then once on held-out | .agents/skills/review-benchmark/results.md | 4 | local | planned | the report of decision 4 exists for dev and held-out, with every run proved by its transcript |
| 6 | setup_runs | At the recommended configuration, run the comparisons of decision 5 and the leads of decision 6 | .agents/skills/review-benchmark/results.md | 5 | local | planned | the results log holds each comparison and lead with its decision |
| 7 | keys_public | After the decision, add the held-out keys to the repository and record the corpus counts | .agents/skills/review-benchmark/cases/ | 6 | local | planned | the keys are committed and the results log names the split |
| 8 | procedure_docs | Implement decision 7 | .agents/skills/review-benchmark/SKILL.md, .agents/skills/review-benchmark/results.md | 6 | local | planned | a fresh agent follows the new section on one dev case with one extra configuration and gets a report row without help |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| a1 | `bun scripts/ci.mjs` | exits 0 for the repo-wide checks and both plugins |
| a2 | `bun test ./scripts/tests/unit/review-benchmark.test.mjs` | passes, including the new cases for the configuration table, bootstrap intervals, loop aggregation, served-tier checks, and the unjudged stop |
| a3 | the step 1 probe | eight `meta.json` files whose effort and served tier equal their configuration |
| a4 | `node .agents/skills/review-benchmark/scripts/prepare.mjs case` for every case | each case builds; held-out keys are read from outside the repository |
| a5 | `.agents/skills/review-benchmark/results.md` | the configuration table of decision 4 for dev and held-out, the decision under decision 5, the comparisons of step 6, the leads, and the recommended reviewer setting with its omp config lines |
| a6 | step 8 check | a fresh agent produces a report row for one extra configuration from the skill text alone |

## Do not touch

- The plugins: this plan changes the project-local benchmark and its tests; the recommended reviewer setting is a user setting.
- D2 of #96: no case file describes it.
- The held-out keys before the decision.

## Open questions

## Verification Results
