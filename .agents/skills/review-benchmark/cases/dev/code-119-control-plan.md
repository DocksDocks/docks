<!-- plan-contract: v4 -->

## Goal

Do the remaining follow-ups of plan #115: (1) issue #117, measure the Cblk code-review rule (a code reviewer that leaves a hunk of the diff of its mode unread returns blocked, never pass) on more large readable diffs with more runs, with a decision rule fixed before the runs, and keep or remove Cblk by the result; record whether lenses read their whole diff; (2) correct the contract sentence on delta-round effort, which says that one level lower "let more known defects escape" although its intervals include zero. Keep fast mode off during benchmark dispatches, as the user asked for testing. No release in this plan before the merge; a release after the merge gets its own question.

Yolo: the user delegated every decision except the merge to the agent.

Mode: plan-and-implement

## Research

### Evidence

- **Cblk today.** plan-lifecycle 0.19.0 tells a code reviewer that a hunk of the diff of its mode that it did not read is a missing input: it returns `blocked`, names the unread paths, and never returns `pass` on a partial read (`plugins/plan-lifecycle/agents/code-reviewer.md` step 11; `skills/productivity/code-reviewer/SKILL.md`, Severity and verdict). The plan contract (Code-review rounds, Yolo runs table), plan-manager phase 6, and the yolo verdict table dispatch such a reviewer again. The code-reviewer skill's Round modes section defines the diff of each mode, and Repository rules and Evidence use that definition too.
- **Why measure again (#117).** In plan #115, Cblk passed its rule on 8 held-out cases (17.16 against 17.65 escaped per 50 known; [-1.67, 1.39]), but on the large case `code-111-r1` (3 runs) it let 37.50 escape against 34.72, with a median round time of 293.0 s against 378.2 s; pooled with the 8 cases it lets about 22.5 escape against 22.1 (`.agents/skills/review-benchmark/results.md`, plan #115 Limits). Shorter rounds with lower recall on a large diff can mean skimming, which Cblk is meant to stop.
- **Large readable code cases in the corpus** (changed lines outside the benchmark skill, known defects): `code-44-r1` (8116, 14), `code-111-r1` (588 as the harness counts them, 12; plan #115 and issue #117 gave 1464; it joins as the case of the plan #115 signal), `code-96-r1` (1405, 6), `code-89` (3478 plus its seeded patch, 6), `code-14-pr15` (3279, 4); smaller ones (`code-22-pr24` 1732/2, `code-98-r1` 1905/2) have 2 known defects each. All are published cases. The candidate removes a rule and is not tuned on any case, so published cases do not favor an arm.
- **Read coverage.** `score.mjs transcripts` records the targets of tool calls outside the run inputs (`readScope`) but not how much of its diff a reviewer read, so the benchmark cannot show skimming today. omp transcripts hold each read call with its path and line selector and the tool result with the lines it showed.
- **Capacity.** At the `default` tier, plan #115 ran about 75 to 100 reviews per hour without capacity refusals once the queue was at most 6 reviewers; large diffs take longer per review.
- **Delta-effort sentence.** The contract's review-loop paragraph says that a delta round one effort level lower "let more known defects escape on 20 delta cases". The measured means were higher (8.33 against 5.56 and 15.38 against 12.82 per 50 known), but both 90% intervals include 0 ([0.00, 6.06], [0.00, 7.14]): the lower effort failed the fixed bound and was not shown to be worse.

### Decisions

1. **Arms and cases.** `B3`: the code reviewer of `main` (with Cblk) as a panel. `C3`: the same reviewer with only the Cblk trigger removed (the unread-hunk sentences of agent step 11 and of the skill's Severity and verdict section; the definition of the diff of each mode stays), on a local ref. Cases: `code-44-r1`, `code-111-r1`, `code-96-r1`, `code-89`, `code-14-pr15` (42 known defects). 5 runs per case and arm (150 reviews), arms mixed in one dispatch queue. Model `openai-codex/gpt-6.1-sol`, effort `xhigh`, tier `default`, fast mode off only while these dispatches run. Judge: Claude task agents, one per case; second judge: a GPT agent on a 10% sample.
2. **Read coverage in the harness.** `score.mjs transcripts` adds to each reviewer entry `diffCoverage`: the share of the lines of the reviewer's own diff (the focus diff of a panel lens, the full diff of a full round, the delta diff of a delta round) that its read tool results showed. `report` gives its mean per arm. It is an observation; it does not decide. A read of a list of paths (`a;b`) counts none of its lines, also when it names the own diff: omp keeps no per-part line data for a list read, only its text, and code review showed that matching that text to diff lines fails for repeated lines. None of the 150 measured reviews read a diff that way, so the rule only undercounts a path that this run does not use. The user answered `Continue yolo` to the stall of code review on this point.
3. **Decision rule (fixed before the runs).** Cblk stays only when all hold on the 5 cases, pooled with a 90% case-resample interval: (a) `B3`'s escaped known defects per 50 known minus `C3`'s has an upper bound below 2; (b) `B3`'s round-1 recall minus `C3`'s has a lower bound above -0.05; (c) `B3`'s wrong findings per run are at most 0.10 more than `C3`'s; (d) at most 1 in 20 `B3` lens reviews returns `blocked`. Otherwise Cblk is removed: the trigger in the agent and the skill, and its manager route in the contract (Code-review rounds and Yolo runs table), plan-manager phase 6, and the yolo verdict table. The definition of the diff of each mode stays in both cases.
4. **Delta-effort sentence.** Replace it with a sentence that says what the data shows: in plan #115, a delta round one effort level lower did not stay within the escaped-defect bound on 20 delta cases.
5. **Review effort in this run.** The installed plugin is 0.18.0, whose contract runs a plan delta round one level lower; this run keeps every review round at the configured effort, as 0.19.0 does after plan #115 measured it.
6. **Records.** The candidate diff goes to `variants/code-119-cand-nocblk.patch`. The results log gets one section with the rule, the tables, the coverage observation, and the decision. The pull request closes #117 and this plan.

### Request corrections

Asked: "do the follow up remaining". Did: issue #117 (the only open follow-up issue) and the delta-effort sentence that the last report listed as not changed. Reason: `gh issue list --state open` shows only #117, and the report after plan #115 named these two remaining items.

### Engineering standards

- Step `coverage`: `tdd-workflow`, `code-clarity`, `commit-discipline`.
- Step `candidate`: `code-clarity`, `commit-discipline`.
- Steps `ship` and `sentence`: `code-clarity`, `commit-discipline`; the content-hash backfill of `plugins/plan-lifecycle/skills/AGENTS.md`.
- Step `results_log`: `commit-discipline`.
- Code review round 1: one `code-review` self-review per lens, with `code-clarity`.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | coverage | Implement decision 2: `diffCoverage` per reviewer in `score.mjs transcripts` and its mean per arm in `report` | .agents/skills/review-benchmark/scripts/score.mjs, .agents/skills/review-benchmark/SKILL.md, scripts/tests/unit/review-benchmark.test.mjs, scripts/config/test-contracts.json | - | local | done | spec tests fail before and pass after: coverage from read results with and without line selectors, the reviewer's own diff per mode, and the report mean |
| 2 | candidate | Write the `C3` candidate of decision 1 as one commit on a local ref from the `coverage` commit | plugins/plan-lifecycle/agents/code-reviewer.md, plugins/plan-lifecycle/skills/productivity/code-reviewer/SKILL.md | 1 | local | done | the ref changes only the Cblk trigger sentences and the content hash; `bun scripts/ci.mjs --plugin plan-lifecycle` exits 0 on it |
| 3 | runs | Run decision 1 (fast mode off), judge, second judge, and apply decision 3 | - | 2 | local | done | each table, interval, coverage mean, `blocked` count, and the decision are in Verification Results |
| 4 | ship | Apply decision 3: keep Cblk, or remove its trigger and its manager route; keep the candidate diff in `variants/` | plugins/plan-lifecycle/agents/code-reviewer.md, plugins/plan-lifecycle/skills/productivity/code-reviewer/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md, .agents/skills/review-benchmark/variants/ | 3 | local | done | the shipped files match the decision; no text names the removed rule when Cblk is removed; `bun scripts/ci.mjs --plugin plan-lifecycle` exits 0 |
| 5 | sentence | Apply decision 4 to the contract's review-loop paragraph, and refresh the plan-manager content hash | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md | 4 | local | done | the paragraph states the bound result of plan #115, no other text claims that the lower effort was shown to be worse, and the plan-manager content hash is in sync |
| 6 | results_log | Write the results-log section of decision 6, and turn fast mode back on after checking its state | .agents/skills/review-benchmark/results.md | 3, 4, 5 | local | done | the section holds the rule, tables, intervals, coverage, and decision; `tier.openai` is `priority` |
| 7 | release_plan_lifecycle | After the merge and only with its own question, release plan-lifecycle | plugins/plan-lifecycle/.claude-plugin/plugin.json, plugins/plan-lifecycle/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 4, 5 | release | done | the release tag CI passes, or the step is skipped with the user's answer recorded |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| a1 | `bun scripts/ci.mjs` | exits 0 |
| a2 | `bun test ./scripts/tests/unit/review-benchmark.test.mjs` | passes |
| a3 | `score.mjs report` on the workspace | every valid run shows `openai-codex/gpt-6.1-sol`, effort `xhigh`, served tier `default`; each invalid run is named |
| a4 | `bun scripts/ci.mjs --plugin plan-lifecycle` | exits 0 |
| a5 | `git grep -n "partial read" -- plugins/plan-lifecycle` | prints the Cblk lines when Cblk stays, and nothing when it is removed |

## Do not touch

- The review block headings, the verdict words, the lens names, and the plan helper's review parsing.
- The earlier entries of `results.md`.

## Open questions

## Verification Results

- Red baseline, step coverage: `bun test ./scripts/tests/unit/review-benchmark.test.mjs`: 10 failed, 122 passed
- Step `coverage`: the spec tests pass after the change (132 tests); full gate exit 0 on `6de7e0a9`.
- Step `candidate`: `bench-119/cand-nocblk` (`8449b632`) changes only the Cblk trigger sentences of the code-reviewer agent and skill and the skill's content hash; `bun scripts/ci.mjs --plugin plan-lifecycle` exit 0. Diff kept as `variants/code-119-cand-nocblk.patch`.
- Step `runs`: 150 lens reviews (5 cases, 5 runs, `B3` and `C3`), every run valid (model `openai-codex/gpt-6.1-sol`, effort `xhigh`, served tier `default`), fast mode off during the dispatches. Second judge 232 of 235 (0.99).

| Measure | `B3` (Cblk) | `C3` (no Cblk) |
|---|---:|---:|
| Escaped per 50 known (42 known) | 33.10 | 33.81 |
| Escaped difference `B3` minus `C3`, 90% case resample | [-2.81, 0.52] | - |
| Round-1 recall difference `B3` minus `C3` | [0.00, 0.07] | - |
| Wrong per run | 0.04 | 0.04 |
| `blocked` lens reviews | 0 of 75 | 0 of 75 |
| Seconds median | 460.8 | 424.6 |
| Lens reviews that saw every line of their own diff whole (after the round-1 repair of `diffCoverage`) | 74 of 75 | 64 of 75 |

- Decision 3: (a) 0.52 < 2, (b) 0.00 > -0.05, (c) +0.00 wrong per run, (d) 0 of 75 `blocked`: Cblk stays.
- Step `ship`: no plugin change for Cblk; `git grep -n "partial read" -- plugins/plan-lifecycle` prints the two Cblk lines (a5).
- Step `sentence`: the contract's review-loop paragraph now states the bound result of plan #115; the plan-manager content hash is in sync; `bun scripts/ci.mjs` exit 0 on `0695e961`.
- Step `results_log`: section "Run 2026-10-27: Cblk on large diffs (plan #119)"; `tier.openai` is `priority` again.
- Red baseline, step coverage, review round 1: `bun test ./scripts/tests/unit/review-benchmark.test.mjs`: 1 failed, 131 passed (shown lines from `displayContent.lineNumbers`); 1 failed, 132 passed (cut lines); 1 failed, 133 passed (list reads); 1 failed, 134 passed (focus hunks through `full.diff`); 1 failed, 134 passed (per-arm row). After the repairs: 135 pass; full gate exit 0 on `e5ae9ad9`. Every lens review in both arms saw at least 99.3% of its own diff; the reviews below 100% missed only lines longer than 768 characters that omp showed cut.
- Red baseline, step coverage, review round 2: `bun test ./scripts/tests/unit/review-benchmark.test.mjs`: 2 failed, 133 passed (list-read oracles). After the repair: 135 pass; full gate exit 0.
- Red baseline, step coverage, review round 3: `node --test scripts/tests/unit/review-benchmark.test.mjs`: 1 failed, 134 passed (list-read oracles). After the repair: 135 pass; full gate exit 0.
- Code review stalled at round 4 (the list-read finding returned after two repairs); the user answered `Continue yolo`. Red baseline, step coverage, review round 4: `node --test scripts/tests/unit/review-benchmark.test.mjs`: 1 failed, 134 passed. After the repair: 135 pass; full gate exit 0; coverage per arm unchanged.
- Code review: round 1 (panel) pass with 3 lens findings and the self-review; round 2 (panel, the repair was more than half the diff) pass with 3 findings; rounds 3 and 4 (delta) pass with list-read findings; stall after round 4, `Continue yolo`; round 5 (delta) pass with no open finding. Reviewed head `9ae2feed`; full gate exit 0.

