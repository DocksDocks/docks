<!-- plan-contract: v4 -->

## Goal

Fix six defects that the plan-lifecycle v4 helper and contract of #45 shipped, and release plan-lifecycle 0.10.1.
- A code pass derives as fixes-required only from a leading critical or high severity field. Severity words inside finding prose do not count.
- Phase labels and label history compare without case sensitivity.
- A table cell ends at a pipe unless an odd run of backslashes comes before the pipe.
- `new` keeps goal prose inside Goal when `--goal` holds an H2 heading.
- `new` prints its advice for the explicit `--mode`.
- The contract states the severity rule of the parser and the full checks policy.
- The manifests describe the five-round review loops.

Mode: plan-and-implement

## Research

Evidence (Node v24.22.1):

- `parseReviewComment()` in `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs` tests `/\b(critical|high)\b/i` on every line except the heading and the verdict line. Thus the pass `- [low] src/api.mjs:3 - the high-level API name is unclear; critical path is fine - rename` derives as fixes-required.
- `labelNames()`, `labelsToRemove()`, and `planWorkStarted()` compare label names as exact strings. GitHub matches label names without case sensitivity, so `Plan:Drafting` is the phase label `plan:drafting`. The helper reads such a plan as unlabelled and does not remove the label on a status write. The gh stub in `scripts/tests/fixtures/gh-stub/gh` also compares exact strings.
- `table()` splits a row with the lookbehind `(?<!\\)\|`. A cell that ends in a literal backslash, written `\\`, then joins the next cell, and the row does not parse to eight cells.
- `createPlan()` puts the `--goal` text into Goal as it is. An H2 heading in `--goal`, such as `## Context`, becomes an unknown section, and `new` refuses it.
- `createPlan()` calls `printAdvice(source, 'drafting')` without the mode. So `new --mode plan-only` prints the defaulted Mode advice.
- `plan-contract.md` (Phases and review comments) says that a whole-word critical or high token in the finding lines makes a code pass fixes-required. This no longer agrees with the parser after the change.
- `plan-contract.md` (Landing and archive proof) says only `Apply repository checks policy and wait up to five minutes for checks to appear.` The rule to wait for completion, the rule for a failed check, and the rule for a repository without checks are missing.
- The three manifests describe `bounded plan and code review repair loops`. The contract now runs five rounds and then asks the user to continue or block.

Decisions:

- A severity field is `[critical]`, `[high]`, `critical:`, or `high:`, in any case. It starts the line, or it follows a `- ` or `* ` list mark. A severity word in other text does not count.
- Compare label names after the helper token normalization. Remove each label by its stored spelling.
- Replace the lookbehind with a scanner. A pipe is escaped only when an odd run of backslashes comes before it.
- `new` changes each unfenced H2 heading in `--goal` to H3. Fenced lines stay as they are. A full body with an unknown H2 heading stays refused.
- `new` gives `--mode` to `normalizePlan()` for its advice too.
- Contract checks policy: wait up to five minutes for checks to appear, then wait for every check to complete. A failed or cancelled check blocks the merge question until the fix is reviewed. When the repository has no configured checks, treat the green local gate as the check result and say so in the merge question.
- Bump plan-lifecycle to 0.10.1 in both manifests and the marketplace catalog in this pull request, and add the normalizing helper and the five-round loops to the descriptions.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | severity_field | Derive fixes-required only from a leading severity field, and add a prose case and a bracket case | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | - | local | done | node scripts/tests/plan-cli.mjs passes with both new review cases |
| 2 | label_case | Compare phase labels and label history without case sensitivity, remove labels by their stored spelling, and make the gh stub match GitHub | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/fixtures/gh-stub/gh, scripts/tests/plan-cli.mjs | - | local | done | The mixed-case label cases in node scripts/tests/plan-cli.mjs pass |
| 3 | cell_scanner | Split table cells with a scanner that reads backslash runs | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | - | local | done | A row whose cell ends in an even backslash run survives an edit |
| 4 | goal_headings | Change unfenced H2 headings in --goal to H3, give --mode to the advice of new, and move the unknown-heading refusal test to edit | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | - | local | done | The explicit mode case keeps both headings inside Goal and prints no defaulted Mode advice |
| 5 | contract_wording | Align the severity rule with the parser, restore the checks policy with the no-CI fallback, then refresh the content hash | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md | 1 | local | done | node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills exits 0 |
| 6 | manifests | Bump plan-lifecycle to 0.10.1 and describe the normalizing helper and the five-round loops | .claude-plugin/marketplace.json, plugins/plan-lifecycle/.claude-plugin/plugin.json, plugins/plan-lifecycle/.codex-plugin/plugin.json | - | local | done | node plugins/plan-lifecycle/test/selftest.mjs reports manifest/catalog agreement (0.10.1) |
| 7 | plugin_gate | Run the plugin gate on the final tree | - | 1, 2, 3, 4, 5, 6 | local | done | PATH="$PWD/node_modules/.bin:$PATH" node scripts/ci.mjs --plugin plan-lifecycle exits 0 |
| 8 | release_patch | After the landing merge, release plan-lifecycle 0.10.1 | - | 7 | release | planned | The GitHub release plan-lifecycle--v0.10.1 exists |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | node scripts/tests/plan-cli.mjs | Exit 0 and a plan-cli smoke PASSED line |
| A2 | node --input-type=module -e "import { parseReviewComment } from './plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs'; console.log(parseReviewComment('### Code review round 1\nCode-review: pass\n- [low] src/api.mjs:3 - the high-level API name is unclear; critical path is fine - rename').verdict)" | Prints pass |
| A3 | node plugins/plan-lifecycle/test/selftest.mjs | Exit 0 and manifest/catalog agreement (0.10.1) |
| A4 | node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills | Exit 0 |
| A5 | PATH="$PWD/node_modules/.bin:$PATH" node scripts/ci.mjs --plugin plan-lifecycle | Exit 0 |
| A6 | gh release view plan-lifecycle--v0.10.1 --json tagName --jq .tagName | Prints plan-lifecycle--v0.10.1 (after step 8) |

## Do not touch

- plugins/plan-lifecycle/test/selftest.mjs: it checks packaging and compatibility only.
- The reviewer wrappers under plugins/plan-lifecycle/agents/ and .codex/agents/.
- The docks plugin and the release tooling.

## Open questions

None.

## Verification Results

Branch `plan-lifecycle-0.10.1`, Node v24.22.1.

- A1: `node scripts/tests/plan-cli.mjs` exited 0 and printed `plan-cli smoke PASSED: normalization, v3 read, ownership, compare-before-write, provenance, step freeze, transitions, review trust, archive proof`.
- A2: before the fix, the command printed `fixes-required`. After the fix, it printed `pass`.
- A3: `node plugins/plan-lifecycle/test/selftest.mjs` exited 0 (`plan-lifecycle self-test PASSED: manifest/catalog agreement (0.10.1), ...`).
- A4: `node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills` exited 0 (all three skills `unchanged`).
- A5: `PATH="$PWD/node_modules/.bin:$PATH" node scripts/ci.mjs --plugin plan-lifecycle` exited 0.
- A6: runs after the landing merge.
