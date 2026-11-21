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
- Scan Markdown link targets too. The root list does not flag root-relative links, and a link into a home is a real leak. Skip fenced code blocks with `blankFencedRegions()`, as the Mode parser does, because a fence holds example commands, not paths of this machine.
- Print one line per distinct path, in body order: `body contains an absolute machine path: <path>`. Trailing `.` and `:` are not part of the path. Keep the `test()` gate and collect the paths with `matchAll()` on the same module-level regex with the `g` flag; neither method keeps state between calls.
- Match a network share only as a backslash pair, a host, a backslash, and a share name, so escaped regex text does not match.
- Define a machine path in `plan-contract.md`. #71 says the contract needs no change; the definition helps agents avoid the paths before the helper runs.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | machine_path_advice | Replace the slash regex with machine roots, name each distinct path in the advice, scan link targets, and add positive and negative cases | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs, scripts/tests/plan-cli.mjs | - | local | planned | node scripts/tests/plan-cli.mjs passes with the machine path cases |
| 2 | contract_machine_paths | Define a machine path and the named advice in the contract, then refresh the content hash | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md | - | local | planned | The contract defines a machine path and node scripts/skills/content-hash.mjs --check-only plugins/plan-lifecycle/skills exits 0 |
| 3 | full_gate | Run the full gate on the final tree | - | 1, 2 | local | planned | PATH="$PWD/node_modules/.bin:$PATH" node scripts/ci.mjs exits 0 |
| 4 | release_patch | After the landing merge, release plan-lifecycle as a patch; the settled plan-and-implement Mode covers this landing work, so the step needs no new ask | plugins/plan-lifecycle/.claude-plugin/plugin.json, plugins/plan-lifecycle/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 3 | release | planned | The GitHub release plan-lifecycle--v0.12.1 exists |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | node scripts/tests/plan-cli.mjs | Exit 0 and a plan-cli smoke PASSED line that names machine path advice |
| A2 | node --input-type=module -e "import { normalizePlan } from './plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs'; console.log(normalizePlan('## Research\n\nRoute /login/, TMPDIR=/tmp, /usr/bin/php8.5, scratch /tmp/run-1 and /home/<user>/x.').advice.find((a) => a.startsWith('body contains')))" | Prints body contains an absolute machine path: /tmp/run-1 (no line for the route, the bare /tmp, or /usr/bin/php8.5) |
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

Not run.
