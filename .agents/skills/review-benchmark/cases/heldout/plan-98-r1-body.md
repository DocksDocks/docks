<!-- plan-contract: v4 -->

## Goal

Make the plan-lifecycle review loops (plan review and code review) finish faster and need fewer rounds, without weaker reviews. The user runs code review with a dedicated reviewer model in omp and suggested several reviewers at once; that is one idea to evaluate among others, and the user asked for any other way to speed up this workflow. Scope: the review loops in the plan-lifecycle plugin (reviewer wrappers, plan-manager, yolo, the contract, and the helper where its review parsing must change). The change stays portable across the runtimes that the plugin supports, with omp first. Measure where review time goes today and keep only the changes that the evidence supports.

Yolo: the user delegated every decision except the merge to the agent.

Mode: plan-and-implement

## Research

### Where review time goes today

Times below run from the reviewer's first prompt to its final answer, read from the omp transcripts of earlier runs; every reviewer ran on the user's dedicated model through the `code-reviewer` and `plan-reviewer` agents.

| Run | Plan review rounds (s) | Code review rounds (s) |
|---|---|---|
| #89 | 492, 553, 208, 94, 42 | 544, 181 |
| #96 | 219, 200 | 284, 180, 169 |

- A round is about 11 to 19 model turns with about 6 tool calls each (mostly file reads), and 14 to 34 s per turn. Model turns, not tool calls, set the time, and the reviewers already batch their reads.
- Every round reviews the whole candidate again. #96 round 2 re-read the full 2,499-line diff and about 80 files and ranges to confirm a 94-line fix (180 s, about 1.5 M tokens).
- Re-review rounds are common: 7 of the 12 rounds above checked a small repair or a one-sentence edit. The yolo rule "fix every finding of every severity, then review again" turns each MEDIUM or LOW finding on a pass into one more round (#89 code round 2, #96 code rounds 2 and 3).
- One reviewer finds few defects per round, and the result varies widely between runs. #96's three code-review rounds found one defect; the self-review found another; at least four more shipped (below).

### Benchmark

The benchmark replayed #96 on frozen snapshots in a temporary scratch directory, with 15 reviewers running at the same time on the user's model. The raw blocks, times, and token counts are in `$(git rev-parse --git-path docks-review)/yolo-98/benchmark.md`.

- **Full code-review round on the #96 candidate before review (`093c13f0`):** two single-reviewer runs against two runs of three parallel lens reviewers (decision 1).

| Arm | Round time (s) | Tokens | Real defects found |
|---|---:|---:|---:|
| single reviewer, run A | 393 | 2.04 M | 0 |
| single reviewer, run B | 309 | 1.50 M | 3 |
| three lenses, run A (slowest lens) | 577 | 3.76 M | 5 |
| three lenses, run B (slowest lens) | 316 | 3.74 M | 6 |

The defects are D1, the missing owner recheck at the pre-write read (found by #96 round 1); D2, a defect in shipped skill text (both text lenses rated it HIGH; details went to the repository owner outside this issue); D3, `repo-plan-cli` does not require `bun-1` because runner discovery sees only its Node runner (`scripts/tests/test-contracts.mjs`); D4, no test exercises the "changed during the settle wait" refusal; D5, the fake gh returns `merged` and `mergedAt` even when a query does not select them; D6, a test asserts request text (wiring); and D7, the report-section verify command accepts empty output. Lens run A found D1 to D5; run B found D1 to D4, D6, and D7; single run B found D1 to D3. D2 to D7 shipped in #96, and this plan does not fix them (outside the Goal). The self-review's defect (the endless "run reopen again" message) was found by no benchmark reviewer, so the self-review keeps its place (decision 4).

I checked each defect on the current `main` (`e09d273f`). D3: in a temporary worktree with `"toolchains": ["node-24"]` for `repo-plan-cli`, `bun scripts/tests/test-contracts.mjs` still prints `PASS test_contracts contracts=17 discovered=17 selected=17`. D4: no case in `scripts/tests/plan-cli/reopen.test.mjs` names that refusal. D5: the fake gh builds the pull request node with `merged` and `mergedAt` before it reads the selection. D6: `reopen.test.mjs` checks that the request text contains `addAssigneesToAssignable`. D2 and D7 hold in the current text as well.

- **Delta code-review round:** the round-2 delta of #96 (`6a3ef0e8..b7fc4fef`, 94 lines) with the round-1 block (decision 2).

| Arm | Round time (s) | Tokens | Result |
|---|---:|---:|---|
| #96 round 2 as it ran (full re-review) | 180 | about 1.5 M | pass |
| delta round, real fix | 108 | 0.38 M | pass; round-1 finding confirmed fixed |
| delta round, planted defect, run A | 119 | 0.31 M | fixes-required; found the planted HIGH |
| delta round, planted defect, run B | 123 | 0.34 M | fixes-required; found the planted HIGH |

The planted defect renamed one returned field (`viewerId` to `viewer`), so every claim would send `assignees[]=undefined`. A delta round took about 35% less time and 75% fewer tokens than the full re-review it replaces, and it did not wave a broken fix through.

- **Plan review on #96 round 1 (`plan96` body at 04:45 UTC):** one reviewer took 307 s (1.20 M tokens) and found 2 of the 6 findings that the historical round 1 reported. Two lenses (`goal-and-risk`, `research`) took 220 s for the slower lens (2.50 M tokens) and also found 2 of the 6; the research lens found none. A delta plan round on the round-2 body took 246 s and 0.81 M tokens, against 200 s and about 0.95 M tokens for the historical full round 2. Neither change shows a gain worth its cost (decision 5).

### Runtime facts

- All four runtimes run several subagents at once. Claude Code: "spawn multiple subagents to work simultaneously", 20 at once by default (https://code.claude.com/docs/en/sub-agents). Codex: "spawning specialized agents in parallel and then collecting their results in one response" (https://developers.openai.com/codex/subagents). OpenCode: the task tool can "run multiple units of work in parallel" (https://opencode.ai/docs/agents/). omp: "Parallelism is parallel `task` calls in one assistant message", with `task.maxConcurrency` 32 by default (`omp://tools/task.md`).
- omp resolves a subagent's model by agent name: "1. `task.agentModelOverrides[agentName]` 2. the agent frontmatter's prioritized `model` list 3. the parent's active model", and "Claude-dialect plugin agents discard their frontmatter `model`" (`omp://task-agent-discovery.md`). Each dispatch of `code-reviewer` therefore runs on the user's reviewer model; a new agent name would not. Claude Code applies a definition's model to every dispatch unless a call passes one (https://code.claude.com/docs/en/sub-agents), and a Codex agent file's `model` "takes precedence" on every spawn (https://developers.openai.com/codex/subagents).
- omp's `orchestrate` is a prompt keyword that "applies only to the turn containing the keyword" and adds a delegation contract (`omp://magic-keywords.md`); it is not an API that a skill can call.
- `parseReviewComment` in `plan.mjs` takes the first verdict line of a comment (`.find(Boolean)`) and upgrades a code pass when any line carries `[critical]` or `[high]`. A comment that holds several reviewer blocks would read only the first verdict; a later `repair` or `blocked` block would be lost.

### Decisions

1. **A full code-review round dispatches three lens reviewers at once.** The manager dispatches the `code-reviewer` agent three times in one message, with the lenses `correctness` (Bug and Performance in changed production code, tracing callers and callees), `spec-and-tests` (the Spec axis, and tests of consumer-visible behavior with faithful fixtures), and `text-and-safety` (Security everywhere, Maintainability, and every changed instruction, comment, and message against what the code does). Each lens gets the full diff and a focus diff of the changed paths in its scope. The manager posts the three returned blocks unchanged in one issue comment, in that order. A runtime that cannot run subagents at the same time runs one reviewer that covers every lens, as today. Evidence: the benchmark (5 and 6 real defects per lens round against 0 and 3 for one reviewer, at about 2.1 times the tokens and no shorter round time). Rejected: new agent files per lens, because omp would not apply the user's `code-reviewer` model to them; one reviewer that dispatches the lenses itself, because the wrappers forbid dispatch and Codex documents no nesting depth; depending on omp's `orchestrate` keyword, because it lasts one turn and other runtimes lack it.
2. **A later code-review round is a delta round when it only checks repairs.** The manager commits the candidate before each round; the commit is the round's reviewed head. Round k after round 1 is a delta round when every change since the reviewed head of round k-1 repairs a finding of round k-1 or of the self-review, and the delta diff is at most half as long as the full diff. One reviewer gets the delta diff, the previous round's comment, and the export: it states for each previous finding whether the delta fixes it, reviews every delta hunk on both axes while tracing changed symbols to callers and callees, and leaves unchanged code alone unless the delta changes its behavior. Any other change, including a merge of the default branch, gets a full lens round. Evidence: the delta benchmark. Rejected: dropping the confirmation round for MEDIUM and LOW fixes, because the yolo landing rule needs a pass with no open finding, and a delta round makes that round cheap instead.
3. **The helper reads every verdict line.** `parseReviewComment` returns the most severe verdict among the comment's verdict lines of the comment's kind: `blocked`, then `repair` or `fixes-required`, then `pass`. A verdict line with an unknown word still makes the comment unreadable as a review; a verdict line of the other kind is prose and does not count. The severity upgrade for code passes stays. This keeps the contract's "post the returned blocks unchanged" rule and makes the lens comment safe without new comment grammar. Rejected: one comment per lens, because the latest comment wins and could hide an earlier lens's failure; round grouping in the helper, because headings carry no required round number.
4. **The yolo self-review runs during code review round 1.** Today the manager finishes the self-review and its fixes before round 1. The self-review found a defect that no benchmark reviewer found, so it stays; running it while round 1 runs removes one serial wait, and its fixes go into the delta round with round 1's fixes. When the self-review finds anything, a delta round follows even when round 1 passed, so the reviewed head stays `HEAD`. While a round runs, the manager also does other work that does not depend on the verdict, such as recording acceptance results and drafting the run summary.
5. **Plan review stays as it is.** Two plan lenses and a delta plan round showed no gain worth their cost in the benchmark (above). A plan reviewer re-checks research against the repository and the web either way.

### Request corrections

Asked: "uses the orchestrate from omp, in the plan-lifecycle". Did: the manager dispatches the lens reviewers in parallel in every runtime that the plugin supports. Reason: `orchestrate` is a one-turn omp prompt keyword, not an API (`omp://magic-keywords.md`), and all four runtimes run subagents at once (Runtime facts).

Asked: "optimize the reviews ... so we have less rounds maybe". Did: code review gets lens rounds and delta rounds; plan review does not change. Reason: the plan-review benchmark showed no gain worth its cost (decision 5).

### Engineering standards

- Step 1 `review_parser_spec`: `tdd-workflow` (spec tests before the parser change, red baseline in the main context) and `code-clarity`.
- Step 2 `review_parser`: `tdd-workflow`, `code-clarity`.
- Step 3 `code_review_rounds`: `code-clarity` for the agent, skill, contract, and README text; the agent stays inside the repository's agent rules (root `AGENTS.md`, Authoring agents).
- Commits: `commit-discipline`. Self-review before round 1 and during it: `code-review` with `code-clarity`.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | review_parser_spec | Write spec cases for decision 3: a comment with several blocks returns the most severe verdict for plan and code comments, `blocked` in a later block wins, a verdict line of the other kind does not count, an unknown verdict word makes the comment unreadable, and `show` reads a three-block lens comment | scripts/tests/plan-cli/reviews.test.mjs | - | local | planned | the new cases fail on their assertions against the current helper (red baseline recorded), and the existing cases pass |
| 2 | review_parser | Implement decision 3 in `parseReviewComment`, and update the comment rules in the contract (Phases and review comments) | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md | 1 | local | planned | the step 1 cases pass unchanged (`git diff` on the spec file prints nothing), and `plan.mjs` line coverage stays at or above 99% |
| 3 | code_review_rounds | Implement decisions 1, 2, and 4: round modes and lens scopes in the code-reviewer agent; the Codex code-reviewer wrapper and its template read the supplied full, focus, or delta diff; the contract's review loop (lens round, delta round, reviewed head, one comment, model note); plan-manager phase 6 commands; yolo Review loops and Engineering standards (self-review during round 1, overlapping work); the README roles row; backfill the plan-lifecycle content hashes | plugins/plan-lifecycle/agents/code-reviewer.md, .codex/agents/code-reviewer.toml, plugins/plan-lifecycle/skills/productivity/plan-workspace/references/codex-agent-templates.md, plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/yolo/SKILL.md, README.md | 2 | local | planned | `bun scripts/ci.mjs` exits 0, and this plan's own code review runs a lens round and, when allowed, delta rounds (a5) |
| 4 | release_plan_lifecycle | After the merge and only with its own question: run `bun scripts/release.mjs --plugin plan-lifecycle minor` from a clean `main` | plugins/plan-lifecycle/.claude-plugin/plugin.json, plugins/plan-lifecycle/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 3 | release | planned | the `plan-lifecycle--v0.17.0` tag CI passes and `gh release view plan-lifecycle--v0.17.0` shows the release, or the step is skipped with the user's answer recorded |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| a1 | `bun scripts/ci.mjs` | exits 0 for the repo-wide checks and both plugins (root `AGENTS.md`: the full gate for a change outside one plugin's payload, here `.codex/agents/`) |
| a2 | `node scripts/tests/plan-cli.mjs` | exits 0, including the step 1 cases |
| a3 | `bun run test:coverage` | reports at least 99% line coverage for `plan.mjs` |
| a4 | `bun scripts/agents/guard.mjs` and `bun scripts/agents/score.mjs --per-file` | both pass, and `code-reviewer` stays at or above the per-file floor |
| a5 | This plan's code review, with the branch helper for `show 98` | round 1 runs three `code-reviewer` lens dispatches at once and posts their blocks in one comment; `show 98` prints the most severe verdict of the blocks; each later round that decision 2 allows is a delta round; each reviewer's time and tokens are recorded |
| a6 | pull request checks | every check passes |

## Do not touch

- The plan-reviewer agent, the plan-reviewer skill, and the plan-review loop (decision 5).
- Review trust (assignee and author), verdict words, the severity upgrade, the yolo round ceiling, and the landing rules.
- The defects D2 to D7 that the benchmark found in #96's code; this plan reports them and does not fix them.
- The docks plugin.

## Open questions

## Verification Results
