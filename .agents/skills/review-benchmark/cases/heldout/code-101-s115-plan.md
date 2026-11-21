<!-- plan-contract: v4 -->

## Goal

Fix a review-parser regression of plan-lifecycle 0.17.0 (#98): a quoted review heading starts a review block of its own.
- A later review block starts only at a Markdown heading line that names the comment's review kind.
- A quoted heading or a list-item heading is prose. It starts no block, so a quoted verdict of an earlier round cannot win.
- Kinds and verdict lines keep the #49 reading through emphasis, code marks, quotes, and list markers.
- The plan contract states the heading rule.
- plan-lifecycle 0.17.1 is released after the merge.

Mode: plan-and-implement

## Research

Evidence (Node v24.22.1, Bun 1.4.4):

- `parseReviewComment()` in `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs` maps each line through `reviewText()` before it looks for a block heading. `reviewText()` removes emphasis, code marks, blockquote markers, and list markers. `REVIEW_BLOCK_HEADING` then tests the cleaned line.
- Baseline: a passing delta block that quotes round 1 under `## Previous findings` (`> ### Code review round 1`, then `> Code-review: fixes-required`) returns `{ kind: 'code', verdict: 'fixes-required' }`. The quoted line opens a block, and the most severe block verdict wins. A plan review returns `repair` in the same way.
- The failure is strict only: a quoted heading cannot turn a failure into a pass. But a delta reviewer that quotes earlier rounds can keep a review loop from passing. Version 0.16.0 read only the first verdict line and did not have this problem.
- `reviewText()` removes a `*` list marker as emphasis. So a `* ### Code review round 1` line must be tested before that cleanup.
- GitHub renders issue comments as GitHub Flavored Markdown. Its ATX heading rule (https://github.github.com/gfm/#atx-headings) allows 0-3 spaces before the opening `#`. A heading inside a block quote or a list item belongs to that quote or item, not to the comment.
- `plan-contract.md` (Phases and review comments) holds the review-record rules. It says that a block starts "at a later Markdown heading line (one or more `#`) that names the comment's kind".
- The review parser cases are in `scripts/tests/plan-cli/reviews.test.mjs`. `node scripts/tests/plan-cli.mjs` runs the plan-cli suite against the shipped `plan.mjs`.

Decisions:

- Test the raw line for a block heading: `#` after at most three spaces, with no quote marker and no list marker before it. Read only the title after the `#` markers through emphasis and code marks, so `### **Code review round 1, lens text-and-safety**` still starts a block.
- Keep `reviewText()` for the first line, the verdict lines, and the severity scan, because #49 needs them.
- State the heading rule in the review-record rules of `plan-contract.md`. Then refresh the content hash of plan-manager.
- Add parser cases for a quoted heading, a `-` and a `*` list-item heading, an indented lens heading, and an emphasized heading title.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | block_heading_rule | Start a later review block only at an unquoted Markdown heading line that is not a list item, and add the parser cases | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli/reviews.test.mjs | - | local | done | node scripts/tests/plan-cli.mjs passes with the quoted, list-item, indented, and emphasized heading cases |
| 2 | contract_heading_rule | State the heading rule in the review-record rules of the contract, then refresh the content hash | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md | - | local | done | The contract states the heading rule and node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills exits 0 |
| 3 | full_gate | Run the full gate on the final tree | - | 1, 2 | local | done | bun scripts/ci.mjs exits 0 |
| 4 | release_patch | After the landing merge, release plan-lifecycle as a patch | plugins/plan-lifecycle/.claude-plugin/plugin.json, plugins/plan-lifecycle/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 3 | release | planned | The GitHub release plan-lifecycle--v0.17.1 exists |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | node scripts/tests/plan-cli.mjs | Exit 0, with the quoted-heading, list-item heading, indented heading, and emphasized heading cases |
| A2 | node --input-type=module -e "import { parseReviewComment } from './plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs'; console.log(JSON.stringify(parseReviewComment('### Code review round 2, delta\n\nCode-review: pass\n\n## Previous findings\n\n> ### Code review round 1\n> Code-review: fixes-required')))" | Prints {"kind":"code","verdict":"pass"} |
| A3 | node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills | Exit 0 |
| A4 | bun scripts/ci.mjs | Exit 0 |
| A5 | gh release view plan-lifecycle--v0.17.1 --json tagName --jq .tagName | Prints plan-lifecycle--v0.17.1 (after step 4) |

## Do not touch

- The verdict table, the verdict aliases, and the severity scan in plan.mjs.
- The review block formats that the reviewer agents and the reviewer skills own.
- plugins/plan-lifecycle/test/selftest.mjs: it checks packaging and compatibility only.

## Open questions

None.

## Verification Results

Branch `fix-quoted-review-heading`, Node v24.22.1, Bun 1.4.4.

- Red baselines: before the fix, the quoted-heading case read `fixes-required`. A first version that tested the cleaned line also read `fixes-required` for the `* ### Code review round 1` case.
- A1: `node scripts/tests/plan-cli.mjs` exited 0: 67 of 67 tests passed.
- A2: printed `{"kind":"code","verdict":"pass"}`. Exit 0.
- A3: `node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills` exited 0 (all five skills `unchanged`).
- A4: `bun scripts/ci.mjs` exited 0 for the repo-wide checks and both plugins.
- A5: runs after the landing merge.
