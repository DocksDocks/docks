---
plan_contract: v2
title: Release plan-lifecycle 0.5.0 and move the repo to Bun 1.4
goal: plan-lifecycle 0.5.0 is released from main, and this repository installs, caches, and runs every gate with Bun 1.4 instead of pnpm.
status: ongoing
created: "2026-08-20T22:26:06+00:00"
updated: "2026-08-20T23:30:00+00:00"
assignee: null
---

## Goal

plan-lifecycle 0.5.0 is released from main. This repository installs, caches, and runs every gate with Bun 1.4 instead of pnpm 11. Node 24 still runs every validator, so the gate behavior does not change.

Mode: plan-and-implement

## Research

Version choice. plan-lifecycle is at 0.4.1, and the pending change is breaking. SemVer 2.0.0 section 4 says that anything can change in `0.y.z`. Thus a breaking change bumps the minor version, and the release is 0.5.0. docks is at 0.17.0 and effect-kit is at 0.5.0, so no plugin declares 1.0.0 stability. The user chose 0.5.0.

Release mechanism. `node scripts/release.mjs --plugin plan-lifecycle 0.5.0` runs the full flow (scripts/release.mjs:4-5, scripts/lib/plugin-release.mjs:258-367). It runs the local selected-plugin gate. It writes the version into the Claude manifest, the Claude marketplace catalog, and the Codex manifest. `.agents/plugins/marketplace.json` has no version, so the release does not edit it. The flow commits, pushes, tags `plan-lifecycle--v0.5.0`, waits for the CI run of the tag, and then creates the GitHub release. It needs a clean working tree on main.

Bun 1.4 facts. Bun 1.4.0 was published on 2026-08-20 (https://api.github.com/repos/oven-sh/bun/releases/latest). `bun install` writes the text lockfile `bun.lock` (https://bun.sh/docs/pm/lockfile). Bun migrates `pnpm-lock.yaml` directly, so the resolved versions carry over. Reproducible installs use `bun install --frozen-lockfile` (https://bun.sh/docs/pm/cli/install). `bun run` runs each package script as a shell command, so `node --test` and every spawned `node` stay on Node 24. `oven-sh/setup-bun` reads the Bun version from the `packageManager` field and caches only the Bun executable (https://github.com/oven-sh/setup-bun, README). Thus a separate `actions/cache` step caches the Bun install cache, with a key on `bun.lock`.

Action pinning. `.github/AGENTS.md:105` requires a 40-character commit SHA for every `uses:` value, with the version as a trailing comment. Every value in both workflows obeys this rule today. The `oven-sh/setup-bun` v2 tag resolves to commit `0c5077e51419868618aeaa5fe8019c62421857d6`, release v2.2.0.

Supply-chain policy. `pnpm-workspace.yaml` holds two protections, and the port keeps both.

- `minimumReleaseAge: 4320` quarantines freshly published versions for three days. Bun has `[install] minimumReleaseAge` in `bunfig.toml` (https://bun.sh/docs/pm/cli/install, section Minimum release age). The port keeps the three-day quarantine.
- `allowBuilds: {'@anthropic-ai/claude-code': false}` denies the claude-code postinstall. This script downloads a CLI binary of approximately 230 MB. Bun controls the lifecycle scripts of dependencies with `trustedDependencies` in `package.json` (https://bun.sh/docs/pm/lifecycle). The port keeps every lifecycle script of a dependency denied. The explicit `node install.cjs` step in CI stays the only source of the binary (.github/workflows/ci.yml:126).

`bun audit` reads `bun.lock` and queries the npm advisory endpoint (https://bun.sh/docs/pm/cli/audit). `npm audit signatures` stays after every install, because Bun has no signature check. Today it reports 3 packages with verified registry signatures.

Install layout. Bun has a hoisted linker and an isolated linker (https://bun.sh/docs/pm/isolated-installs). The isolated linker builds a store in `node_modules/.bun` and links each package into it, like the pnpm layout of today. The port keeps the isolated layout. The isolated linker also creates the fallback folder `node_modules/.bun/node_modules`. `install.hoist = false` removes this folder, so an undeclared import fails, as in pnpm.

Repository surface. package.json:4 pins `pnpm@11.5.1`. `pnpm-lock.yaml` and `pnpm-workspace.yaml` hold the lock and the policy. scripts/ci.mjs:228-230 and :302 start pnpm. scripts/lib/gate-memo.mjs:85-91 reads `node_modules/.modules.yaml`, which only pnpm writes, and :161 fingerprints pnpm. scripts/tests/ci-plugin-targeting.mjs shims pnpm and asserts the CI step names. `.github/workflows/ci.yml` and `.github/workflows/dependency-integrity.yml` run Corepack, a pnpm store cache with a key on `pnpm-lock.yaml`, `pnpm install --frozen-lockfile`, and `npm audit signatures`. AGENTS.md, README.md, scripts/AGENTS.md, and .github/AGENTS.md describe this setup. The shipped skills hold 41 pnpm lines in 19 files. No validator checks the lockfile name or the `packageManager` value.

Scope decision. The user chose the widest scope: the repository toolchain, the scaffold templates, and the shipped skill advice. The names of other package managers stay in skill descriptions only as trigger keywords for a consumer project.

Adoption risk. Bun 1.4.0 is new on the day of this plan. The user accepts this risk. The mitigations are an exact `packageManager` pin, the full gate as the acceptance bar, and a revert of one commit. `pnpm-lock.yaml` and `pnpm-workspace.yaml` stay in git history.

Implementation finding. `bun audit` found GHSA-7835-87q9-rgvv in `@anthropic-ai/claude-code@2.1.158`, a high-severity sandbox escape. Version 2.1.163 fixes it. The pin moves to 2.1.234. This is the newest patched release that is older than the three-day quarantine.

Durable fix: replace pnpm in every manifest, workflow, script, test, and document in one change. The temporary option, Bun next to pnpm with two lockfiles, is rejected.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | merge_cutover | Rebase-merge pull request #11 so that main carries the issue-backed lifecycle | none | — | push | done | `gh pr view 11 --json state` reports MERGED |
| 2 | release_plan_lifecycle | Run the release of plan-lifecycle 0.5.0 from main | plugins/plan-lifecycle/.claude-plugin/plugin.json, plugins/plan-lifecycle/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 1 | release | done | Tag `plan-lifecycle--v0.5.0` exists, its CI run passed, and the GitHub release is published |
| 3 | manifest_and_lockfile | Pin `bun@1.4.0` in `packageManager`, migrate the lockfile to `bun.lock`, and port the pnpm workspace policy to Bun | package.json, bunfig.toml, bun.lock, pnpm-lock.yaml, pnpm-workspace.yaml | 2 | local | done | `bun install --frozen-lockfile` succeeds from a clean checkout with the three-day age gate, the isolated layout without the fallback folder, and no lifecycle script of a dependency, and no pnpm lock or workspace file remains |
| 4 | gate_subprocesses | Move every package-manager subprocess, the install fingerprint, and the unit tests that shim or cite pnpm to Bun | scripts/ci.mjs, scripts/lib/gate-memo.mjs, scripts/tests/unit/gate-memo.test.mjs, scripts/tests/unit/skill-score-vacuity.test.mjs, scripts/tests/unit/ci-background-task.test.mjs | 3 | local | done | `node scripts/ci.mjs` starts no pnpm command, and the memo test proves that present, changed, and removed Bun install metadata each give a distinct key or a safe miss |
| 5 | workflow_contracts | Move both workflows to `oven-sh/setup-bun` pinned to a 40-character commit SHA, cache the Bun install cache with a key on `bun.lock`, install with the frozen flag, and update the workflow-contract assertions | .github/workflows/ci.yml, .github/workflows/dependency-integrity.yml, scripts/tests/ci-plugin-targeting.mjs | 4 | local | done | `node scripts/tests/ci-plugin-targeting.mjs` passes against the Bun workflows, and every `uses:` value is a 40-character SHA with a version comment |
| 6 | toolchain_docs | Rewrite every setup, cache, and timing paragraph that names pnpm | AGENTS.md, README.md, scripts/AGENTS.md, .github/AGENTS.md | 3 | local | done | No toolchain document names pnpm or Corepack, and the documented commands and settings match the workflows and `bunfig.toml` |
| 7 | shipped_advice | Move the shipped skill advice and the scaffold templates to Bun, and keep other package managers only as consumer trigger keywords | plugins/docks/skills/AGENTS.md, plugins/docks/skills/productivity/write-skill, plugins/docks/skills/engineering/dep-vuln-workflow, plugins/docks/skills/productivity/scaffold, plugins/docks/skills/engineering/fix-workflow, plugins/docks/skills/engineering/refactor, plugins/docks/skills/engineering/test-coverage, plugins/docks/skills/productivity/multi-tool-bridge | 3 | local | done | `grep -rn 'pnpm install' plugins` and `grep -rn corepack plugins` print nothing, and each quoted skill description matches its skill |
| 8 | verify_and_publish | Run the full gate, prove the migration end to end, and open the pull request that closes this plan | none | 5, 6, 7 | publish | in-flight | `node scripts/ci.mjs` exits 0 and the pull request carries `Closes #12` |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `bun install --frozen-lockfile` | Exit 0 against the committed `bun.lock` |
| A2 | `bun run check:js` | Exit 0, so package scripts run through Bun |
| A3 | `node scripts/ci.mjs` | Exit 0 for 3 plugins plus repo-wide |
| A4 | `node scripts/tests/ci-plugin-targeting.mjs` | Exit 0 with the Bun workflow contracts |
| A5 | `grep -rn pnpm .github/workflows package.json scripts` | Exactly one line: the `retiredPackageManagerNames` deny-list in the contract test |
| A6 | `grep -rn corepack .github/workflows package.json scripts` | Exactly the same single line |
| A7 | `gh release view plan-lifecycle--v0.5.0` | A published release |
| A8 | `grep -n minimumReleaseAge bunfig.toml` | The ported three-day age gate |
| A9 | `npm audit signatures` | Verified registry signatures after a Bun install |
| A10 | `grep -rnE 'uses: .*@v[0-9]' .github/workflows` | No output, so no action is pinned to a moving tag |
| A11 | `bun audit --audit-level=high` | No high or critical advisory |
| A12 | `stat -c %s node_modules/@anthropic-ai/claude-code/bin/claude.exe` | A placeholder size under 1000 after A1, so no lifecycle script replaced it with the large binary |
| A13 | `ls -d node_modules/.bun` | The isolated store exists after A1 |
| A14 | `grep -n 'hoist = false' bunfig.toml` | The setting that makes an undeclared dependency fail to resolve |
| A15 | `bun dedupe --check` | Exit 0, so `bun.lock` holds no duplicate versions |
| A16 | `git ls-files --error-unmatch bun.lock` | The lockfile is tracked |
| A17 | `grep -c '"packageManager": "bun@1.4.0"' package.json` | 1, so the pin is exact |
| A18 | `grep -rn corepack plugins` | No output |
| A19 | `grep -rn 'pnpm install' plugins` | No output |

## Do not touch

- `docs/plans/finished/`: it is frozen history from before the GitHub backend.
- The docks and effect-kit plugin versions.
- The behavior of the plan-lifecycle payload that step:release_plan_lifecycle released.
- The Node 24 runtime: every validator keeps running under `node`.

## Open questions

None

## Review

### Plan review — 2026-08-20
Plan-review: repair
- [research_gap] `scripts/tests/unit/skill-score-vacuity.test.mjs:74` — the inventory misses this pnpm shim and `scripts/tests/unit/ci-background-task.test.mjs:99`, and no step covers either file — add both files to step:gate_subprocesses and port the shim and the comment to Bun
- [research_gap] `scripts/tests/unit/gate-memo.test.mjs:20-39` — step:gate_subprocesses changes the install fingerprint, but the tests create no install metadata, so a fingerprint that is always `absent` passes — add this test file to the step and prove that present, changed, and removed Bun install metadata give distinct keys or a safe miss
- [research_gap] https://bun.sh/docs/pm/cli/install#production-mode — A1 can exit 0 with no `bun.lock`, because a frozen install without a lockfile installs from `package.json` — require a tracked `bun.lock` and the exact `packageManager` pin
- [research_gap] `plugins/docks/skills/productivity/write-skill/SKILL.md:18,97-108` — the chosen scope moves all shipped skill advice to Bun, but step:shipped_advice omits this skill and `plugins/docks/skills/AGENTS.md:22` — add both paths and scan the shipped payload

Disposition: all four findings were reproduced and fixed. Both test files of finding 1 and `scripts/tests/unit/gate-memo.test.mjs` are in step:gate_subprocesses, and its Done when requires distinct keys or a safe miss. A16 requires a tracked `bun.lock`, and A17 requires the exact pin. Both skill paths are in step:shipped_advice, and A18 and A19 scan the shipped payload. `dep-vuln-workflow` keeps `pnpm audit` as a trigger keyword for consumer projects.

## Verification Results

Branch `chore/bun-1.4-migration`, Node 24, Bun 1.4.0.

- A1, A2, and A4 exited 0.
- A3: `node scripts/ci.mjs` exited 0 for 3 plugins plus repo-wide. The exit code was read directly, not from a piped banner.
- A5 and A6 each printed one line, `scripts/tests/ci-plugin-targeting.mjs:1780`, the deny-list.
- A7: the release `plan-lifecycle--v0.5.0` is published.
- A9: 3 packages have verified registry signatures.
- A11: no vulnerabilities in 19 packages after the pin moved to 2.1.234.
- A15 exited 0.
- A8, A10, A12 to A14, and A17 to A19 printed the expected output.
- A16 needs the commit of this change.
- `node --test scripts/tests/unit/gate-memo.test.mjs` passed with the new install-fingerprint cases.
