<!-- plan-contract: v4 -->

## Goal

Fix #71: the plan.mjs advice for absolute machine paths fires on URL routes, slash prose, regex text, relative paths, and portable system paths, and it does not name the match.
- The advice flags only a path that points into one machine: a user or root home, a mount, a named temporary or runtime directory, a Windows drive, or a network share.
- The advice names each distinct path, one advice line per path.
- The plan contract defines a machine path, so an agent knows the rule without running the helper.
- plan-lifecycle 0.12.1 is released after the merge.

Mode: plan-and-implement

## Research

Evidence (Node v24.22.0):

- `normalizePlan()` in `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs` tests one regex. Its first branch matches any slash after a space or a listed mark. On a match it pushes the fixed text `body contains an absolute machine path.`. It removes Markdown link targets before the test, because that branch flags every root-relative link.
- `printAdvice()` prints each advice message as `advice: <text>` for `new`, `show`, `edit`, `status`, and `step`.
- No test covers this advice. `scripts/tests/plan-cli.mjs` already imports `normalizePlan`. `plugins/plan-lifecycle/test/selftest.mjs` checks packaging only and says "The author smoke covers the helper", so the new cases go into `scripts/tests/plan-cli.mjs`.
- Baseline: the body of #71, put under a `## Research` heading, gives one line: `body contains an absolute machine path.`. The line has no location.
- A prototype with a lookbehind regex returned the expected result for all rows of the #71 table. It also handled the macOS `$TMPDIR` form without `/private`, `/private/tmp`, the Linux per-user runtime directory, Linux removable-media mounts, macOS `/Volumes`, `file://` URLs, a link target into a home, duplicates, and escaped regex text.
- `plan-contract.md` (Normalization, advice, and refusals) lists absolute machine paths as an advice topic but does not define them.

Decisions:

- Flag machine roots only (option 1 in #71), plus the extra roots above. Portable system paths, such as `/usr/bin/env`, `/dev/null`, or a bare `/tmp`, get no advice, because portable commands use them.
- Scan Markdown link targets too. The root list does not flag root-relative links, and a link into a home is a real leak.
- Print one line per distinct path, in body order: `body contains an absolute machine path: <path>`. Trailing `.` and `:` are not part of the path.
- Match a network share only as a backslash pair, a host, a backslash, and a share name, so escaped regex text does not match.
- Define a machine path in `plan-contract.md`. #71 says the contract needs no change; the definition helps agents avoid the paths before the helper runs.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | machine_path_advice | Replace the slash regex with machine roots, name each distinct path in the advice, scan link targets, and add positive and negative cases | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | - | local | done | node scripts/tests/plan-cli.mjs passes with the machine path cases |
| 2 | contract_machine_paths | Define a machine path and the named advice in the contract, then refresh the content hash | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md | - | local | done | The contract defines a machine path and node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills exits 0 |
| 3 | full_gate | Run the full gate on the final tree | - | 1, 2 | local | done | PATH="$PWD/node_modules/.bin:$PATH" node scripts/ci.mjs exits 0 |
| 4 | release_patch | After the landing merge, release plan-lifecycle as a patch | plugins/plan-lifecycle/.claude-plugin/plugin.json, plugins/plan-lifecycle/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 3 | release | planned | The GitHub release plan-lifecycle--v0.12.1 exists |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | node scripts/tests/plan-cli.mjs | Exit 0 and a plan-cli smoke PASSED line that names machine path advice |
| A2 | node --input-type=module -e "import { normalizePlan } from './plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs'; console.log(normalizePlan('## Research\n\nRoute /login/, TMPDIR=/tmp, /usr/bin/php8.5, scratch /tmp/run-1 and /home/<user>/x.').advice.filter((a) => a.startsWith('body contains')).join('\n'))" | Exactly two lines: body contains an absolute machine path: /tmp/run-1, then body contains an absolute machine path: /home/<user>/x |
| A3 | node plugins/plan-lifecycle/test/selftest.mjs | Exit 0 |
| A4 | node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills | Exit 0 |
| A5 | PATH="$PWD/node_modules/.bin:$PATH" node scripts/ci.mjs | Exit 0 |
| A6 | gh release view plan-lifecycle--v0.12.1 --json tagName --jq .tagName | Prints plan-lifecycle--v0.12.1 (after step 4) |

## Do not touch

- plugins/plan-lifecycle/test/selftest.mjs: it checks packaging and compatibility only.
- The docks plugin, release tooling, and other advice texts in plan.mjs.

## Open questions

None.

## Verification Results

Branch `72-plan-lifecycle-fix-71-machine-path-advice`, Node v24.22.0.

- A1: `node scripts/tests/plan-cli.mjs` exited 0 and printed `plan-cli smoke PASSED: ..., early closure, list limit, machine path advice`.
- A2: before the fix, the command printed one line, `body contains an absolute machine path.`. After the fix, it printed exactly the two expected lines, for the `/tmp/run-1` path and then the `/home/<user>/x` path. Exit 0.
- A3: `node plugins/plan-lifecycle/test/selftest.mjs` exited 0 (`plan-lifecycle self-test PASSED: manifest/catalog agreement (0.12.0), ...`).
- A4: `node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills` exited 0 (all three skills `unchanged`).
- A5: `PATH="$PWD/node_modules/.bin:$PATH" node scripts/ci.mjs` exited 0 (`All ci.mjs checks passed - 2 plugin(s) + repo-wide; safe to release.`).
- A6: runs after the landing merge.
- Extra check: the body of #71 under a `## Research` heading now gives 13 named advice lines, one per machine path in its table, and none for the URL routes, `TMPDIR=/tmp`, `/usr/bin/php8.5`, `/vendor/autoload.php`, or `/dev/null`.
