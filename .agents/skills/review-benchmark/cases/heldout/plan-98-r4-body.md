<!-- plan-contract: v4 -->

## Goal

Make the plan-lifecycle review loops (plan review and code review) and the yolo flow faster and better: fewer rounds, more real defects found per round, less reviewer time and fewer tokens, and no weaker reviews. Improve the reviewer prompts, and give each reviewer role a skill with reference checklists, reusing docks skills where they fit. Build a reusable benchmark that replays past review rounds and blind seeded cases, so that every reviewer change is measured, kept only when it wins, and the reviewers can keep improving later. Every change carries its evidence and gets reviewed. The plugin already works well, so a change lands only when the evidence shows that it is better. The change stays portable across Claude Code, Codex, OpenCode, and omp, with omp first; the user runs the reviewers on GPT 6.1 sol through omp's per-agent model setting.

Yolo: the user delegated every decision except the merge to the agent.

Mode: plan-and-implement

## Research

### Where review time goes today

Times run from the reviewer's first prompt to its final answer, read from the omp transcripts of earlier runs; every reviewer ran on the user's model through the `code-reviewer` and `plan-reviewer` agents.

| Run | Plan review rounds (s) | Code review rounds (s) |
|---|---|---|
| #89 | 492, 553, 208, 94, 42 | 544, 181 |
| #96 | 219, 200 | 284, 180, 169 |

- A round is 11 to 19 model turns with about 6 tool calls each, at 14 to 34 s per turn. Model turns set the time; the reviewers already batch their reads.
- Every round reviews the whole candidate again. #96 code round 2 re-read the full 2,499-line diff to confirm a 94-line fix (180 s, about 1.5 M tokens).
- 7 of the 12 rounds above checked a small repair or a one-sentence edit. The yolo rule "fix every finding of every severity, then review again" turns each MEDIUM or LOW finding into one more round.
- One reviewer finds few defects per round, and the result varies widely between runs (benchmark 1).

### Benchmark 1: lenses and delta rounds

Benchmark 1 replayed #96 on frozen snapshots, with 15 reviewers running at the same time on the user's model. The raw blocks, times, and token counts are in `$(git rev-parse --git-path docks-review)/yolo-98/benchmark.md`.

| Arm (code review of `093c13f0`) | Round time (s) | Tokens | Real defects found |
|---|---:|---:|---:|
| one reviewer, run A | 393 | 2.04 M | 0 |
| one reviewer, run B | 309 | 1.50 M | 3 |
| three lenses, run A (slowest lens) | 577 | 3.76 M | 5 |
| three lenses, run B (slowest lens) | 316 | 3.74 M | 6 |

The defects are D1, the missing owner recheck at the pre-write read (found by #96 round 1); D2, a defect in shipped skill text (both text lenses rated it HIGH; details went to the repository owner outside this issue); D3, `repo-plan-cli` does not require `bun-1` because runner discovery sees only its Node runner (`scripts/tests/test-contracts.mjs`); D4, no test exercises the "changed during the settle wait" refusal; D5, the fake gh returns `merged` and `mergedAt` even when a query does not select them; D6, a test asserts request text (wiring); and D7, the report-section verify command accepts empty output. All 18 findings of these four runs were real: precision was 100%. D2 to D7 shipped in #96; this plan does not fix them (outside the Goal). No benchmark reviewer found the defect that #96's self-review found (the endless "run reopen again" message).

I checked each defect on `main` (`e09d273f`). D3: in a temporary worktree with `"toolchains": ["node-24"]` for `repo-plan-cli`, `bun scripts/tests/test-contracts.mjs` still prints `PASS test_contracts contracts=17 discovered=17 selected=17`. D4: no case in `scripts/tests/plan-cli/reopen.test.mjs` names that refusal. D5: the fake gh builds the pull request node with `merged` and `mergedAt` before it reads the selection. D6: `reopen.test.mjs` checks that the request text contains `addAssigneesToAssignable`. D2 and D7 hold in the current text as well.

| Arm (delta review of the #96 round-2 repair, 94 lines) | Round time (s) | Tokens | Result |
|---|---:|---:|---|
| #96 round 2 as it ran (full re-review) | 180 | about 1.5 M | pass |
| delta round, real fix | 108 | 0.38 M | pass; round-1 finding confirmed fixed |
| delta round, planted defect, run A | 119 | 0.31 M | fixes-required; found the planted HIGH |
| delta round, planted defect, run B | 123 | 0.34 M | fixes-required; found the planted HIGH |

Plan review of #96 round 1: one reviewer (307 s, 1.20 M tokens) and two lenses (220 s for the slower lens, 2.50 M tokens) each found 2 of the 6 findings of the historical round 1. A delta plan round on the round-2 body took 246 s and 0.81 M tokens, against 200 s and about 0.95 M tokens for the historical full round 2.

### External practice, October 2026

- **Find broadly, verify, then post.** Anthropic's Code Review runs narrow finders in parallel, then verifies each finding before posting; its prompting guides say a filter phrase such as "only report high-severity" makes the model investigate fully but report less (https://code.claude.com/docs/en/code-review; https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8). Cursor's Bugbot "was too cautious" until it "shifted to aggressive prompts" (https://cursor.com/blog/building-bugbot, 2026-01-15).
- **List every qualifying finding in one pass.** Codex's `/review` rubric: "Do not stop at the first qualifying finding. Continue until you've listed every qualifying finding", and its finding bar requires that a finding is discrete, introduced by the change, not an unstated assumption, and that "one must identify the other parts of the code that are provably affected" (https://github.com/openai/codex/blob/main/codex-rs/prompts/templates/review/rubric.md, 2026-07-21). An empty review is a valid answer; a "3-5 findings" cap made reviewers pad, and removing it raised recall from 47 to 75 of 96 (https://github.com/cursor/plugins/pull/419, 2026-09-23).
- **Rounds converge with delta review, no repeats, and defect classes.** The Claude Code team found that "about 59%" of repeat flags were code from the first pass; diff-only re-review, "no repeats of findings already posted", and "flag the class of bug, so the author fixes every instance" cut mean reviews to pass from 2.08 to 1.32 (https://claude.dev/blog/solving-code-review-at-anthropic/, 2026-10-15). Bugbot reviews "only the changes since the previous Bugbot review" and reads earlier comments "to avoid duplicate suggestions" (https://cursor.com/docs/bugbot); Cloudflare's re-review re-emits unfixed findings (https://blog.cloudflare.com/ai-code-review/, 2026-04-20).
- **Evidence for each finding.** Codex asks for "the triggering input, expected behavior, and actual behavior" (https://learn.chatgpt.com/docs/code-review); Anthropic's proof requirement raised substantive comments from 16 to 54% (https://claude.com/blog/how-anthropic-secures-its-ai-native-software-development-lifecycle, 2026-07-21).
- **Lean prompts for GPT-6.** OpenAI's GPT-6 guidance: "overly specific guidance can now hinder results", the model is "more sensitive to instructions contained in skills", state precedence, and make the root document "a minimal router that points to supporting docs" (https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra, 2026-09-11; https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6.1-sol). Cursor saw Sol models react strongly to emphasized wording (https://cursor.com/blog/agent-swarm-model-economics, 2026-07-20). OpenAI's own multi-agent example reviews a pull request "with three agents: one for correctness, one for security, and one for missing tests" (https://developers.openai.com/api/docs/guides/responses-multi-agent).
- **Scale the panel to the change.** noodle runs one reviewer under 50 changed lines (https://github.com/poteto/noodle/tree/main/.agents/skills/adversarial-review); Anthropic: "Large or complex changes get more agents… trivial ones get a lightweight pass" (https://claude.com/resources/articles/code-review, 2026-03-09).
- **Plan review: check facts, not personas.** poteto: "Don't review an abstract plan adversarially" (https://github.com/cursor/plugins/tree/main/pstack, 2026-10); Anthropic warns that "a reviewer prompted to find gaps will usually report some, even when the work is sound" (https://code.claude.com/docs/en/best-practices).
- **Benchmark method.** Mix historical and seeded defects, keep seeded defects to half the set or less, freeze a held-out split, match findings with a judge from another model family, run each arm more than once, and read the transcripts (https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents, 2026-01-09; https://github.com/withmartian/code-review-benchmark/blob/main/methodology/full.md; https://github.blog/ai-and-ml/github-copilot/reviewbench-an-open-benchmark-for-ai-code-review/, 2026-10-05; https://arxiv.org/abs/2606.15689).

### Runtime facts

- All four runtimes run several subagents at once: Claude Code (https://code.claude.com/docs/en/sub-agents), Codex (https://developers.openai.com/codex/subagents), OpenCode (https://opencode.ai/docs/agents/), and omp (`omp://tools/task.md`).
- omp resolves a subagent's model by agent name ("1. `task.agentModelOverrides[agentName]`…"), and "Claude-dialect plugin agents discard their frontmatter `model`" (`omp://task-agent-discovery.md`). Every dispatch of `code-reviewer` therefore runs on the user's reviewer model; a new agent name would not.
- omp's `orchestrate` is a prompt keyword that "applies only to the turn containing the keyword" (`omp://magic-keywords.md`), not an API that a skill can call.
- `parseReviewComment` in `plan.mjs` reads only the first verdict line of a comment (`.find(Boolean)`); a comment with several reviewer blocks would lose a later `repair` or `blocked`.
- Agent files cannot carry references: `claude plugin validate` lints every `agents/*.md` (`plugins/plan-lifecycle/skills/AGENTS.md`, Roles). References live in a skill folder, and `plan-reviewer.md` already loads its skill through `${CLAUDE_PLUGIN_ROOT}`.

### Decisions

1. **A full code-review round runs a panel of three lens reviewers.** The manager dispatches the `code-reviewer` agent three times in one message, with the lenses `correctness`, `spec-and-tests`, and `text-and-safety`; every dispatch shares the same opening text and puts its lens last, so the runtimes can reuse the prompt prefix. Each lens gets the full diff and a focus diff of the paths in its scope. When the full diff changes fewer than 50 lines, one reviewer covers every lens. The manager posts the returned blocks unchanged in one issue comment, in lens order. Evidence: benchmark 1 and External practice. Rejected: new agent files per lens (omp would not apply the user's `code-reviewer` model); a reviewer that dispatches lenses itself (the wrappers forbid dispatch); omp's `orchestrate` keyword (one turn only).
2. **A later code-review round is a delta round when it only checks repairs of a completed round.** The manager commits the candidate before each round; the commit is the round's reviewed head. Round k after round 1 is a delta round only when round k-1 completed (every reviewer returned a block with a verdict for that head, and no block returned `blocked`), every change since that head repairs a finding of round k-1 or of the self-review, and the delta diff is at most half as long as the full diff. Otherwise, and after a merge of the default branch, the round is a full panel round. A reviewer that fails or returns no block with a verdict is dispatched again before the round is posted. One delta reviewer gets the delta diff, the previous round's comment, and the manager's rejection comment for that round, if any: it marks each previous finding fixed or open and repeats an open one, reviews every delta hunk while tracing changed symbols to callers and callees, and repeats no finding that the manager rejected with evidence. Evidence: benchmark 1 and External practice.
3. **The helper reads every verdict line.** `parseReviewComment` returns the most severe verdict among the comment's verdict lines of the comment's kind: `blocked`, then `repair` or `fixes-required`, then `pass`. A verdict line with an unknown word makes the comment unreadable as a review; a verdict line of the other kind does not count; the severity upgrade for a code pass stays. Rejected: one comment per lens (the latest comment wins and could hide an earlier failure); round grouping (headings carry no required round number).
4. **Each reviewer gets a lean prompt with a router skill and reference checklists.** A new internal skill `code-reviewer` holds the finding bar, the evidence rules, the round modes, and the output contract, and routes each lens and the delta mode to one reference file (`references/correctness.md`, `references/spec-and-tests.md`, `references/text-and-safety.md`, `references/delta.md`); the `code-reviewer` agent loads it the way `plan-reviewer` loads its skill, and a lens loads the matching docks `code-review` reference when docks is installed. The `plan-reviewer` skill gets the same finding bar and a checklist reference of checkable plan facts (`references/checklist.md`). The new text asks for every qualifying finding in one pass, accepts an empty review, sets no count limit, requires the triggering input with expected and actual behavior, names the defect class and every instance in the diff, treats the plan's recorded decisions as settled, states precedence, and drops emphasis and repetition. The current prompts stay the baseline; step 6 keeps each new prompt only when the benchmark shows it is better (decision 8).
5. **The manager fixes a defect class at once, and overlaps waits.** When a finding names a defect class, the fix covers every instance in the candidate in the same commit. In yolo, the manager dispatches code review round 1 first and runs the self-review while it runs; the self-review's fixes go into the delta round with round 1's fixes, also when round 1 passed. While any round runs, the manager does work that does not depend on the verdict, such as acceptance records and the run summary draft. Evidence: External practice (defect classes; a lead that keeps working while subagents run).
6. **A project-local benchmark measures every reviewer change.** `.agents/skills/review-benchmark/` holds the cases, a `prepare.mjs` script that builds each case workspace (a snapshot without git history, the full, focus, and delta diffs, the plan file, and one dispatch prompt per reviewer and arm), a `score.mjs` script that parses the returned blocks, prefilters candidate pairs by file or section, and reports recall, extra findings, verdicts, time, and tokens, and a `SKILL.md` procedure: dispatch the reviewers through the runtime, match findings with a blind judge agent from another model family (it answers match, no match, or unknown), run each arm at least twice with the arms interleaved, report the median and range, keep held-out answer keys closed until the decision, and turn each escaped defect into a new case. A unit test covers the parser and the scorer.
7. **Benchmark cases and splits.** Dev: `code-96` (8 known defects), `code-89` (1 historical and 5 seeded defects), `plan-96` (6 known findings), and `plan-89` (3 known findings). The seeded `code-89` defects and the `plan-89` findings entered the prompt author's context during case preparation, so both are dev cases. Held-out: `code-H1` and `plan-H1`, built by a separate agent that seeded defects into other past changes and returned only paths and counts; their answer keys stay closed until the final run.
8. **Decision rule, fixed before any candidate runs.** A candidate replaces the baseline when, on the held-out cases, its mean recall over its runs is at least the baseline's, and on the dev cases it is higher; its median round time and tokens stay within 25% of the baseline; and its findings that the judge rates wrong do not increase. Otherwise the candidate gets at most two more dev iterations, each based on read transcripts, and is dropped if it still loses. The plan-review delta mode is a candidate under the same rule.
9. **Rejected after research.** A separate verification stage: benchmark 1 showed 100% precision, and the manager already reproduces each finding before it fixes it. Repeated shuffled passes with voting and cross-family panels: higher cost, and per-subagent models are not portable. Reasoning-effort tuning: omp needs `task.enableEffort`, and the other runtimes differ. Blocking only P0 and P1: the yolo landing rule needs a pass with no open finding, and delta rounds make the extra round cheap. A deterministic plan linter: the historical plan findings were semantic. Plan lenses: benchmark 1.

### Request corrections

Asked: "uses the orchestrate from omp, in the plan-lifecycle". Did: the manager dispatches the lens reviewers in parallel in every runtime that the plugin supports. Reason: `orchestrate` is a one-turn omp prompt keyword, not an API (`omp://magic-keywords.md`), and all four runtimes run subagents at once (Runtime facts).

Asked: "not only optimize the code reviewer but the plan reviewer too". Did: plan review gets a better prompt and a checklist reference, and a delta mode under the benchmark rule; it does not get lenses. Reason: benchmark 1 showed no gain from plan lenses, and External practice advises checking plans against facts instead of adversarial personas.

### Engineering standards

- Steps 1 and 2: `tdd-workflow` (spec tests before the parser change; red baseline in the main context) and `code-clarity`.
- Step 3: `write-skill` rules for skill and reference text, the agent rules in the root `AGENTS.md` (Authoring agents), and `code-clarity` for wording.
- Step 4: `code-clarity` for the contract, skill, wrapper, and README text.
- Step 5: `test-coverage` for the scorer tests, `code-clarity`, and the repository's unit-test registration rules.
- Step 6: the benchmark procedure of step 5.
- Commits: `commit-discipline`. Self-review during code review round 1: `code-review` with `code-clarity`.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | review_parser_spec | Write spec cases for decision 3: a comment with several blocks returns the most severe verdict for plan and code comments, `blocked` in a later block wins, a verdict line of the other kind does not count, an unknown verdict word makes the comment unreadable, and `show` reads a three-block lens comment | scripts/tests/plan-cli/reviews.test.mjs | - | local | planned | the new cases fail on their assertions against the current helper (red baseline recorded), and the existing cases pass |
| 2 | review_parser | Implement decision 3 in `parseReviewComment` | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs | 1 | local | planned | the step 1 cases pass unchanged, and `plan.mjs` line coverage stays at or above 99% |
| 3 | reviewer_skills | Implement decision 4: the new internal `code-reviewer` skill with its four references and the report section; the `code-reviewer` agent loads it and keeps its output contract; the `plan-reviewer` skill gets the finding bar and `references/checklist.md`, and the plan-review block stays identical in its agent and skill; backfill content hashes | plugins/plan-lifecycle/skills/productivity/code-reviewer/, plugins/plan-lifecycle/agents/code-reviewer.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/, plugins/plan-lifecycle/agents/plan-reviewer.md | - | local | planned | the skill and agent validators pass, and the new skill scores at or above the productivity floor |
| 4 | review_rounds | Implement decisions 1, 2, and 5: the contract's review loop (panel round, delta round, reviewed head, one comment, worst verdict, model note, defect classes); plan-manager phases 4 and 6; yolo Review loops and Engineering standards; the Codex code-reviewer wrapper and its template; the Roles set and the README role rows; backfill content hashes | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md, .codex/agents/code-reviewer.toml, plugins/plan-lifecycle/skills/productivity/plan-workspace/references/codex-agent-templates.md, plugins/plan-lifecycle/skills/AGENTS.md, README.md | 2, 3 | local | planned | `bun scripts/ci.mjs` exits 0 |
| 5 | review_benchmark | Implement decisions 6 and 7: the project-local skill, `prepare.mjs`, `score.mjs`, the dev and held-out case files (held-out keys kept in files that the prompt author does not open), the `.claude/skills` link, and the scorer unit test with its registry entry | .agents/skills/review-benchmark/, .claude/skills/review-benchmark, scripts/tests/unit/review-benchmark.test.mjs, scripts/config/test-contracts.json | - | local | planned | the unit test passes, and `prepare.mjs` builds a workspace for every case |
| 6 | benchmark_eval | Run the baseline and candidate arms through the harness under decision 8: code review (panel with the baseline lens text against the panel with the new skill), plan review (baseline against the new skill, and the delta mode), and the delta code round; read the transcripts of each loss, iterate on dev at most twice, run held-out once, keep or revert each candidate, and record the results in the benchmark's results log | plugins/plan-lifecycle/skills/productivity/code-reviewer/, plugins/plan-lifecycle/skills/productivity/plan-reviewer/, .agents/skills/review-benchmark/results.md | 3, 5 | local | planned | Verification Results hold the per-arm numbers and the decision for each candidate |
| 7 | release_plan_lifecycle | After the merge and only with its own question: run `bun scripts/release.mjs --plugin plan-lifecycle minor` from a clean `main` | plugins/plan-lifecycle/.claude-plugin/plugin.json, plugins/plan-lifecycle/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 4, 6 | release | planned | the `plan-lifecycle--v0.17.0` tag CI passes and `gh release view plan-lifecycle--v0.17.0` shows the release, or the step is skipped with the user's answer recorded |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| a1 | `bun scripts/ci.mjs` | exits 0 for the repo-wide checks and both plugins (root `AGENTS.md`: the full gate for a change outside one plugin's payload) |
| a2 | `node scripts/tests/plan-cli.mjs` | exits 0, including the step 1 cases |
| a3 | `bun run test:coverage` | reports at least 99% line coverage for `plan.mjs` |
| a4 | `bun scripts/agents/guard.mjs plugins/plan-lifecycle/agents` and `bun scripts/agents/score.mjs --per-file plugins/plan-lifecycle/agents` | both pass, and each reviewer agent stays at or above the per-file floor |
| a5 | `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file plugins/plan-lifecycle/skills` | `productivity/code-reviewer` and `productivity/plan-reviewer` score at or above the productivity floor |
| a6 | `for f in plugins/docks/skills/*/*/SKILL.md plugins/plan-lifecycle/skills/*/*/SKILL.md; do sed -n '/^## Report a problem with this skill$/,$p' "$f" \| sha256sum; done \| sort \| uniq -c` (`plugins/docks/skills/AGENTS.md`, Report section) | one line whose count equals the number of shipped skills (31 with the new skill), and the digest is not that of empty input |
| a7 | `bun test ./scripts/tests/unit/review-benchmark.test.mjs`, then `node .agents/skills/review-benchmark/scripts/prepare.mjs` for each case | the test passes, and each case gets a workspace with its snapshot, diffs, plan file, and prompts |
| a8 | step 6 benchmark runs | the results log and Verification Results show recall, extra findings, judge-rated wrong findings, median time, and tokens for each arm on the dev and held-out cases, and each candidate's decision under decision 8 |
| a9 | This plan's code review, with the branch helper for `show 98` | round 1 runs the three-lens panel and posts their blocks in one comment; `show 98` prints the most severe verdict of the blocks; each later round that decision 2 allows is a delta round; each reviewer's time and tokens are recorded |
| a10 | pull request checks | every check passes |

## Do not touch

- Review trust (assignee and author), the verdict words, the severity upgrade, the yolo round ceiling, and the landing rules.
- The defects D2 to D7 that benchmark 1 found in #96's code; this plan reports them and does not fix them.
- The docks plugin.
- The held-out answer keys before the final benchmark run.

## Open questions

## Verification Results
