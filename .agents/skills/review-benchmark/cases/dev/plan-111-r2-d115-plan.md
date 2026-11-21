<!-- plan-contract: v4 -->

## Goal

Make the plan-lifecycle review loop reach the best durable plan or change in fewer review rounds, with the same or better review quality. Follow-ups of #109: candidate A (now on main) is the best plan-reviewer prompt so far at `openai-codex/gpt-6.1-sol` effort `xhigh`; candidates B and C found more known defects but 3 to 5 times the wrong findings, and five dev defects were found by no prompt because they need checks of external tools or exact code paths. Research what drives extra rounds in the real review history, design and test reviewer prompts that keep A's precision with more recall, give the reviewers the tools that they need to check facts where it is safe, measure whether effort `high` keeps the quality at less time, and apply the changes that cut rounds. Measure with the review benchmark at the `default` service tier (fast mode off for these tests, as the user asked), decide with a rule fixed before the deciding runs, and ship the winners in plan-lifecycle. No release in this plan; the release follows after the merge only with its own question.

Yolo: the user delegated every decision except the merge to the agent.

Mode: plan-and-implement

## Research

### Evidence: what drives extra rounds

A count of all 53 review rounds of the plans #96, #98, #100, #102, #103, #106, and #109 (review comments, issue-body edit history, and diffs at the reviewed commits) found 22 needed rounds and 31 extra rounds:

- 13 extra rounds followed plan edits after a plan pass. 7 of the 10 edit-triggered rounds found nothing; #100 round 4 reviewed an edit that changed only the Mode line, and #100 rounds 7 and 8 reviewed two edits made 12 minutes apart.
- 13 of the 15 extra code rounds were started by a pass that listed only MEDIUM or LOW findings (the yolo rule "fix every finding of every severity, then review again"). 19 of the 33 later code findings were faults in the repair of an earlier finding, and 17 of the 33 were LOW. In #100, one LOW finding about path tokenization kept the loop open from round 2 to round 6. In the #100 benchmark, held-out rounds 3 to 5 found 0.00 known defects per run at every configuration, and `xhigh-fast` loops had 1.03 extra-only rounds per run.
- Round-1 misses and class fixes that missed an instance caused about 4 rounds (for example #103 plan round 3: the repair bound `GH_REPO` but not `GH_HOST`, which the cited page lists together).
- Manager mistakes caused 3 rounds (a finding neither repaired nor rejected; a new decision without a step; an acceptance probe recorded before its fix). No round came from a rejected finding.

### Evidence: the plan reviewer

- #109 shipped candidate A. On 16 held-out plan cases at `xhigh` (default tier), A let 22.58 known defects per 50 escape with 0.16 wrong findings per run; candidates B and C let about 21 escape with 0.38 and 0.47 wrong findings per run.
- The benchmark prompt says "Take review evidence only from files under the snapshot root and the files that this message names" (`prepare.mjs`, `buildOpening`). Candidates A, B, and C follow the manager's dispatch first, so they read no web page in the dev runs, while the 0.16.0 prompt read 9 to 22 official pages per run. The 0.16.0 prompt found P83-2 in 3 of 3 dev runs, and every one of those runs cited the Docker Compose volume pages; one candidate run wrote that it dropped the point because "the user restricts reads". Production plan reviews read the web (the #103 round 1 comment cites official URLs). So #100 and #109 measured the current prompts with less evidence than production gives them. The read scope of the benchmark already allows official pages outside the benchmark repository.
- A held-out note: while designing, one research script counted web-read tool calls in the #109 held-out transcripts (counts only), and the design used the aggregate count of A's wrong findings per case. So the #109 held-out cases are no longer blind for this plan; they serve as a regression check, and new held-out cases decide.

### Evidence: tools

- No runtime lets a plugin-shipped agent have a Bash tool limited to read-only commands. Claude Code's agent `tools` field takes tool names only, and a plugin cannot ship permission rules or a sandbox (Claude Code docs: https://code.claude.com/docs/en/sub-agents, https://code.claude.com/docs/en/plugins-reference, https://code.claude.com/docs/en/settings). omp's own documentation says subagents run headless with approval mode yolo and that `bash.patterns` is an approval policy, not containment (`omp://approval-mode.md`, `omp://settings.md`).
- In omp, the plan reviewer's `WebSearch` and `WebFetch` resolve to no tool; omp reads web pages through `read <url>` and searches with `web_search` (`omp://tools/`). The production plan-reviewer transcripts of #109 show only `read`, `glob`, and `grep`.
- Of the five dev defects that no prompt found, only P57-5 needs the machine's state (the installed ShellCheck version); P89-3 needs the `gh api -F` manual and the helper code; P96-6, P57-4, and P96-1 need repository reading.

### Decisions

1. **Benchmark web evidence.** The benchmark opening for every reviewer says: take repository evidence only from the snapshot and the named files; official documentation on the web may be read, but no page of the benchmark repository. The read scope already enforces the repository part (`readScope` puts a `read` of a benchmark-repository URL and a `web_search` query that names the repository outside). Both judges get the same evidence: `references/judge.md` lets a judge read official documentation pages to decide a claim about an external tool, library, or API, but no page of the benchmark repository, and `unknown` stays the answer when neither the snapshot nor official documentation decides the claim. Every comparison of this plan runs with this opening and these judges.
2. **Plan-reviewer candidates.** All variants carry the plan finding field `class:` (decision 6), so the reference is Ac = A plus the field.
   - Every variant also lists omp's `web_search` in its tools (decision 7), so the measured refs carry the tools that ship.
   - D1 = Ac plus the parts of B that keep A's precision: a load-bearing finding includes an Acceptance or Done-when check that cannot run or passes when the step is wrong, and a cited source that does not state the claim; a labeled inference qualifies when it names the fact it starts from and the step or check that fails; a finding is not dropped because its scenario is long; plus three safeguards: an unsourced load-bearing claim is checked first and reported only when the check shows it false or unguaranteed and the step fails without it; a claim that a repository instruction requires something quotes the instruction's condition; and the re-read drops a finding whose evidence the reviewer cannot point to.
   - D2 = D1 plus a lever for external behavior: for each external tool, command, library, or API that a step or check relies on, name the behavior the step needs (full result set, order and all-or-nothing behavior, value handling, the flag at the recorded version, scope, side effects, failure), read the official page of that exact command or field, and report when the page contradicts it or covers fewer cases than the step handles.
   - Rejected: B and C as they were (3 to 5 times the wrong findings); a return to 0.16.0 (no delta mode, missing checklist items).
3. **Effort.** Ac also runs at effort `high`. The recommended plan-reviewer effort becomes `high` only when Ac ships (no candidate passes decision 5) and Ac-high is not worse than Ac-xhigh under the bounds of decision 5. When D1 or D2 wins, the recommendation stays `xhigh`, because that variant is not measured at `high`. The setting is a user setting (`task.agentModelOverrides`), recorded in `results.md`.
4. **Cases.** New held-out cases decide: the two plan-review rounds of #109 with their 6 real findings, plus seeded defects in recent plans that a builder agent writes and keeps closed (the builder does not write prompts; the seeds cover a recorded decision with a false premise, an external tool or API behavior, a missing Files cell or gate, an Acceptance check that cannot run, a contract conflict, and partial-failure semantics). The 16 held-out cases of #109 are a regression check. Dev cases check each change on the way.
5. **Decision rule, fixed before the held-out runs.** At `xhigh`, default tier, with the arms mixed in one dispatch queue: a candidate (D1, D2) replaces Ac only when, on the new held-out cases, its escaped known defects per 50 known are fewer than Ac's, its escaped-difference 90% interval against Ac stays below 2 per 50 and its round-1 recall interval stays above -0.05, and its wrong findings per run and its unknown findings per run are each at most 0.10 more than Ac's; and on the #109 held-out cases its escaped-difference interval against Ac stays below 2 and its recall interval above -0.05. Among the candidates that pass, the one with the fewest escaped defects on the new held-out cases wins; a tie goes to the lower median time. When none passes, Ac ships. The same bounds compare Ac-high with Ac-xhigh for decision 3.
6. **Rules that cut rounds** (plan-lifecycle text; each targets a counted round driver):
   - After `plan=pass`, plan edits are collected and reviewed in one plan `delta` round before the first code that depends on them, or before the next code-review round when that comes first. An edit that only sets the Mode or Delegation line that the yolo invocation decides needs no round (Verification Results edits already need none).
   - The plan finding line ends with `class:`, as the code finding line does. Before a repair commit, the manager searches the plan or the candidate (and, for a cited source, that source) for every instance of each finding's class and lists the instances it fixed in the round record; the delta reviewer checks that list.
   - A repair that adds a branch, a list split, a parser rule, or a refusal adds a test that fails when that branch is removed; a parser or matcher repair lists its input forms and tests each one.
   - Before the next round, the manager accounts for every finding of the last round as fixed (with its line or commit) or rejected (with its comment); an edit that adds a decision adds or reopens its step.
   - The code reviewer rates a fault that no current caller, fixture, or documented input reaches as LOW and says so. From code-review round 3, a pass whose open findings are only such LOW findings lands: the findings go to Open findings in the run summary and to one follow-up issue, and the reviewed bytes stay unchanged. Step `loop_sim` checks this rule on the recorded #100 loops before it ships, and the rule ships only when no known defect would escape.
   - The plan contract's Research asks, for each external program that a Step or Acceptance command runs, its version and the source of that version (its `--version` output with the date, or a repository pin).
   - The yolo self-review runs as one self-review per lens (#100: 0.67 against 0.50 known defects per run at about the same time, with more wrong findings that the manager must reject with evidence); it runs in parallel with round 1, so it adds no round.
   - Rejected: a LOW finding never starting a round (the #100 and #102 chains show real repair faults in rounds 2 and 3); fixing LOW findings without a review (19 of 33 later findings were faults in repairs).
7. **Tools.** The plan reviewer keeps `WebSearch` and `WebFetch` for Claude Code and also lists omp's `web_search`, so omp reviewers can search; `read` reads URLs in omp. Neither reviewer gets a command tool. Rejected: raw Bash (no runtime limits it to read-only commands for a plugin agent, and the reviewer reads untrusted plan text); a plugin MCP tool that runs `--version` (a new executable surface in every session, and live machine state drifts, as P57-5 now does). The tool facts of decision 6 cover the version case.
8. **Fast mode and release.** The user turned fast mode off for these tests; after the last benchmark run, fast mode goes back on. No release in this plan; the release follows the merge only with its own question.

### Request corrections

Asked: "give tools". Did: give the plan reviewer working web search in omp and let the benchmark reviewers read official documentation; no command tool. Reason: no runtime offers a read-only Bash tool for a plugin agent (decision 7), and the only fact that needs a command is the installed version, which the plan now records (decision 6).

Asked: "reduce the rounds necessary". Did: change the review rules that the round count shows as drivers, and measure the prompt changes; the plan does not measure the manager rules with the benchmark, because the benchmark replays reviewers, not managers. Reason: the round count above.

### Engineering standards

- Steps `harness_web`, `loop_sim`: `code-clarity`, `commit-discipline`; `tdd-workflow` where a harness behavior changes.
- Step `fresh_cases`: `commit-discipline`.
- Steps `reviewer_tools`, `candidates`, `ship_prompt`, `lifecycle_rules`: `code-clarity` (instructions say what the reviewer or manager does and why), `commit-discipline`; the content-hash backfill that `plugins/plan-lifecycle/skills/AGENTS.md` requires.
- Before code review round 1: `code-review` self-review with `code-clarity`, one per lens.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | harness_web | Implement decision 1 in the benchmark opening and in the judge instructions, and parse the plan finding field `class:` | .agents/skills/review-benchmark/scripts/prepare.mjs, .agents/skills/review-benchmark/scripts/score.mjs, .agents/skills/review-benchmark/references/judge.md, .agents/skills/review-benchmark/SKILL.md, scripts/tests/unit/review-benchmark.test.mjs, scripts/config/test-contracts.json | - | local | planned | a plan finding line with `class:` parses with its class kept in the text; the dev runs of step 5 show official web reads and no invalid read of the benchmark repository; `judge.md` allows official documentation pages and no benchmark-repository page |
| 2 | fresh_cases | Build the new held-out cases of decision 4 with a builder agent that reports only counts, keys outside the repository | .agents/skills/review-benchmark/cases/heldout/ | - | local | planned | the cases build with `prepare.mjs case --keys`, and the builder's counts are in Verification Results |
| 3 | reviewer_tools | Add omp's `web_search` to the plan reviewer's tools (decision 7) and commit it on the linked branch | plugins/plan-lifecycle/agents/plan-reviewer.md | - | local | planned | `claude plugin validate` passes through `bun scripts/ci.mjs --plugin plan-lifecycle`, and one omp spawn of the plan reviewer lists `web_search` among its tools |
| 4 | candidates | Write Ac, D1, and D2 of decision 2 as commits on local refs from the `reviewer_tools` commit | plugins/plan-lifecycle/agents/plan-reviewer.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/references/checklist.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/references/delta.md | 3 | local | planned | three refs exist; each changes only its items and keeps `web_search`; `bun scripts/ci.mjs --plugin plan-lifecycle` exits 0 on each ref |
| 5 | dev_runs | Run Ac at `xhigh` and `high`, D1, and D2 on the dev plan cases (3 runs), check each change, and revise a candidate at most once | .agents/skills/review-benchmark/results.md | 1, 4 | local | planned | the dev table and the check of each change are in the results log |
| 6 | heldout_runs | Run the four arms on the new held-out cases (5 runs) and the #109 held-out cases (3 runs) in one mixed queue, judge, run the second judge, and apply decisions 3 and 5 | .agents/skills/review-benchmark/results.md | 2, 5 | local | planned | the results log holds both tables, the intervals against Ac, and the decisions |
| 7 | ship_prompt | Apply the winning plan-reviewer files (or Ac) to plan-lifecycle and refresh the content hashes | plugins/plan-lifecycle/agents/plan-reviewer.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/references/checklist.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/references/delta.md | 6 | local | planned | the shipped files equal the winner's ref, and `bun scripts/ci.mjs --plugin plan-lifecycle` exits 0 |
| 8 | loop_sim | Simulate the LOW rule of decision 6 on the recorded #100 held-out code loops: the rounds and seconds that it saves, and the known defects that would escape | .agents/skills/review-benchmark/results.md | 5 | local | planned | the results log gives the saved rounds and the escaped known defects, and the decision on the LOW rule |
| 9 | lifecycle_rules | Write the rules of decision 6 into the contract, the plan-manager and yolo skills, the plan-reviewer and code-reviewer skills and agents, with the LOW rule only when step 8 allows it | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md, plugins/plan-lifecycle/skills/productivity/yolo/references/run-summary.md, plugins/plan-lifecycle/skills/productivity/code-reviewer/SKILL.md, plugins/plan-lifecycle/agents/code-reviewer.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md | 7, 8 | local | planned | each rule of decision 6 is in its file, the plan-review and code-review blocks stay parseable by the plan helper (`scripts/tests/plan-cli.mjs` passes), and `bun scripts/ci.mjs --plugin plan-lifecycle` exits 0 |
| 10 | keys_and_fast | After the held-out runs, add the new held-out keys to the repository, and turn fast mode back on with `docks-kit omp --fast` | .agents/skills/review-benchmark/cases/heldout/ | 6 | local | planned | the keys are committed, and `tier.openai` is `priority` in the deployed omp config |
| 11 | release_plan_lifecycle | After the merge and only with its own question, release plan-lifecycle with the changes of this plan and of #109 | plugins/plan-lifecycle/.claude-plugin/plugin.json, plugins/plan-lifecycle/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 9 | release | planned | the release tag CI passes, or the step is skipped with the user's answer recorded |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| a1 | `bun scripts/ci.mjs` | exits 0 for the repo-wide checks and both plugins |
| a2 | `bun test ./scripts/tests/unit/review-benchmark.test.mjs` | passes |
| a3 | `score.mjs report` on the dev and held-out workspaces | no invalid run, or each invalid run named; every valid run shows model `openai-codex/gpt-6.1-sol`, its effort, and served tier `default` |
| a4 | `.agents/skills/review-benchmark/results.md` | the dev check, both held-out tables, the intervals against Ac, the decisions of 3 and 5, and the LOW-rule simulation |
| a5 | `git diff <winner ref> HEAD -- <plan-reviewer files>` | prints nothing, apart from the content-hash fields and the rules that step `lifecycle_rules` adds to the plan-reviewer skill |
| a6 | `bun scripts/ci.mjs --plugin plan-lifecycle` | exits 0 |
| a7 | `node scripts/tests/plan-cli.mjs` through the gate | passes, so the helper still reads the review blocks |

## Do not touch

- The plan-review and code-review verdict words, the review block headings, and the plan helper's parsing.
- The #100 and #109 entries of `results.md` and their decision rules.
- The code-review panel and delta rules of #98 and #100, apart from the LOW rule of decision 6.

## Open questions

## Verification Results
