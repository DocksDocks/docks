---
plan_contract: v2
title: Release plan-lifecycle 0.5.0 and move the repo to Bun 1.4
goal: plan-lifecycle 0.5.0 is released from main, and this repository installs, caches and runs its package scripts with Bun 1.4 instead of pnpm.
status: planned
created: "2026-08-20T22:26:04.692+00:00"
updated: "2026-08-20T22:37:25+00:00"
assignee: null
---

## Goal

plan-lifecycle 0.5.0 is released from main, and this repository installs, caches and runs its package scripts with Bun 1.4 instead of pnpm.

User request (in session, 2026-08-20): "Release plan-lifecycle 0.5.0 from main once pull request #11 is in. Then move the repo from pnpm to Bun 1.4, so that Bun installs, caches and runs every gate. Move the shipped skills to Bun as well."

Scope: the merge of pull request #11, the plan-lifecycle 0.5.0 release, the repository toolchain (package-manager pin, lockfile, install policy, gate subprocesses, both workflows, toolchain documents), and the scaffold skill that seeds this toolchain into new projects. Research records two corrections to the request.

Mode: plan-and-implement

## Research

### Facts

- Versions. plan-lifecycle is 0.4.1 in `plugins/plan-lifecycle/.claude-plugin/plugin.json:4`, `plugins/plan-lifecycle/.codex-plugin/plugin.json:3` and `.claude-plugin/marketplace.json:70`. docks is 0.17.0 (`.claude-plugin/marketplace.json:12`) and effect-kit is 0.5.0 (`.claude-plugin/marketplace.json:42`). The Codex catalog has no version field (`.agents/plugins/marketplace.json:31-42`). `plugins/plan-lifecycle/compatibility.json:1-4` gates only the docks major (`plugins/plan-lifecycle/test/selftest.mjs:62-80`), so the release does not change it.
- Pull request #11. Main at this snapshot does not hold it: `docs/plans/AGENTS.md` still defines the markdown workspace that the pull request replaces, and `docs/PLAN.md` does not exist. Its commit declares `BREAKING CHANGE: plan-lifecycle no longer reads or writes plan markdown under docs/plans/` (https://github.com/DocksDocks/docks/pull/11). It also edits `AGENTS.md`, `README.md`, `.github/AGENTS.md`, `scripts/AGENTS.md` and both scaffold files, but none of their pnpm lines. The line numbers below are for this snapshot, so the later steps find each line by its text.
- Release flow. `node scripts/release.mjs --plugin plan-lifecycle 0.5.0` runs the whole release (`scripts/release.mjs:4-6`), and an explicit `X.Y.Z` is a valid argument (`scripts/lib/plugin-release.mjs:187`, `:218`). `runGenericPluginRelease` refuses a dirty working tree or a branch other than `main` before it bumps anything (`scripts/lib/plugin-release.mjs:271`). Then it runs the selected-plugin gate (`:273-277`), writes 0.5.0 into the Claude manifest, the Claude catalog entry and the Codex manifest (`:292-312`), commits `chore(release): plan-lifecycle v0.5.0` (`:326`), runs `git push origin HEAD` (`:327`, `:428-430`), tags `plan-lifecycle--v0.5.0` with `claude plugin tag --push` (`:331`, `:409-413`), waits for the tag CI run (`:334-352`), and only then runs `gh release create` (`:358-362`). `scripts/AGENTS.md:190-192` also requires `node scripts/ci.mjs --plugin plan-lifecycle` before the release command.
- Package manager. `package.json:4` pins `pnpm@11.5.1`. `pnpm-lock.yaml:1` is lockfile version 9.0. `pnpm-workspace.yaml:2` sets `minimumReleaseAge: 4320` in minutes (three days), and `pnpm-workspace.yaml:3-7` denies the `@anthropic-ai/claude-code` build. `pnpm-workspace.yaml` sets no linker and no `packages` list.
- Gate subprocesses. `scripts/ci.mjs:227-231` starts every JavaScript-quality task with `pnpm`: `run check:js` (`:234`) and `exec biome ci` or `exec biome lint` (`:248-250`). `scripts/ci.mjs:302-304` runs and advises `pnpm run test:unit`.
- Gate memo. `installFingerprint` digests pnpm's install record `node_modules/.modules.yaml` and returns `absent` when the file is missing (`scripts/lib/gate-memo.mjs:85-96`). `computeGateKey` also fingerprints `pnpm --version` (`scripts/lib/gate-memo.mjs:161`). The unit tests build fixtures with no install record (`scripts/tests/unit/gate-memo.test.mjs:18-34`).
- Tests that name pnpm. `scripts/tests/ci-plugin-targeting.mjs` shims `pnpm` (`:201-277`, `:396-418`), counts the `pnpm` calls of `ci.mjs` (`:501-593`, `:670-683`), uses `pnpm-lock.yaml` as the lockfile-only diff (`:1461-1462`), and asserts the pnpm step names, cache id, cache key and integrity steps (`:1807-1811`, `:1872-2040`, `:2130-2150`, `:2246-2252`). `scripts/tests/unit/skill-score-vacuity.test.mjs:74` shims `pnpm`. `scripts/tests/unit/ci-background-task.test.mjs:99` names `pnpm run check:js` in a comment.
- Workflows. Each of the three gate-running jobs of `.github/workflows/ci.yml` runs `enable corepack`, `configure deterministic pnpm store`, `cache pnpm store`, `mark hosted cache restore` and `install pnpm dependencies` (`:112-129`, `:179-196`, `:251-273`), and names its claude binary step after `allowBuilds` (`:137`, `:204`, `:282`). `.github/workflows/dependency-integrity.yml:24-35` repeats the setup. Every `uses:` value is a 40-character SHA with a version comment, for example `actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0` (`.github/workflows/ci.yml:118`).
- Toolchain documents. pnpm or Corepack appears in `AGENTS.md:10` and `:121`, `README.md:138-139`, `scripts/AGENTS.md:40`, `:100` and `:188`, and `.github/AGENTS.md:37`, `:83`, `:88` and `:105-107`. `.github/AGENTS.md:100` credits the "Supabase + pnpm Dec-2025 guidance" as the source of the hardening rules.
- Scaffold. Seed mode runs `corepack enable && pnpm install --frozen-lockfile` in the new project (`plugins/docks/skills/productivity/scaffold/SKILL.md:93`). The spec example seeds `pnpm-lock.yaml.template` (`plugins/docks/skills/productivity/scaffold/references/spec-schema.md:49`) and names `pnpm-lock.yaml` as the source of the `yaml` dependency (`:111`).
- Repository rules. `.github/AGENTS.md:103` pins every `uses:` to a 40-character SHA. `.github/AGENTS.md:105` requires official `actions/cache` pinned by SHA for dependency caches. `.github/AGENTS.md:106` keeps `claude-code` exact-pinned, hash-locked, denied its lifecycle script and quarantined. `.github/AGENTS.md:107` keeps the frozen install, the explicit `install.cjs` step and the PATH step. `.github/AGENTS.md:108` runs `npm audit signatures` after every install. `AGENTS.md:126` requires the full `node scripts/ci.mjs` for repo-wide tooling and CI-topology changes. `plugins/docks/skills/AGENTS.md:10` requires `node scripts/skills/content-hash.mjs --backfill` after the meaning of a skill changes.
- Bun install. When `pnpm-lock.yaml` exists and `bun.lock` does not, `bun install` converts lockfile versions 7 to 9 to `bun.lock` and keeps resolved versions and integrity hashes (https://bun.com/docs/pm/cli/install, section pnpm migration). Bun does not turn on `--frozen-lockfile` in CI by itself. With no lockfile, `--frozen-lockfile` installs from `package.json`, and with only `pnpm-lock.yaml` it migrates in memory (same page, section Production mode). So the acceptance must prove a tracked `bun.lock` and the absence of the pnpm files.
- Bun age gate. `[install] minimumReleaseAge` filters npm package versions that are newer than the threshold, and a bare number is seconds (same page, section Minimum release age). The port of 4320 minutes is `259200`.
- Bun layout. Bun uses the hoisted linker for a single-package project unless `linker` says otherwise (same page, section Installation strategies). pnpm's default `nodeLinker` is `isolated` (https://pnpm.io/settings/node-modules#nodelinker). An isolated install keeps each package in `node_modules/.bun/<name>@<version>/node_modules` and links it from the top level (https://bun.com/docs/pm/isolated-installs, section Directory structure). That layout has no `.modules.yaml`. `bunfig.toml` is strict TOML in 1.4, so the linker value must be quoted (https://bun.com/blog/bun-v1.4).
- Bun scripts. `bun run` runs a `package.json` script in a subshell, keeps a `#!/usr/bin/env node` CLI on Node unless `--bun` is given, and resolves the binaries of project packages after scripts and files (https://bun.com/docs/runtime, section Resolution order). So `pnpm exec biome` becomes `bun run biome`.
- CI action. `oven-sh/setup-bun` reads the Bun version from `packageManager`, and its own cache holds the downloaded Bun executable (input `no-cache`, https://github.com/oven-sh/setup-bun#readme). Its v2.2.0 tag is commit `0c5077e51419868618aeaa5fe8019c62421857d6` (https://github.com/oven-sh/setup-bun/releases/tag/v2.2.0). Bun keeps downloaded packages in `~/.bun/install/cache` (https://bun.com/docs/pm/global-cache), so the dependency cache stays an `actions/cache` step on that folder.

### Decisions

1. The user chose 0.5.0, a minor bump, for the breaking change of pull request #11. SemVer 2.0.0 item 4 states that anything may change in a `0.y.z` version (https://semver.org/#spec-item-4), and no plugin of this repository has declared 1.0.0 (Facts, Versions). step:release_plan_lifecycle passes the explicit version.
2. The user chose to adopt Bun 1.4.0 on its release day, 2026-08-20 (https://github.com/oven-sh/bun/releases/tag/bun-v1.4.0), and accepted the risk of a fresh toolchain. The three-day quarantine of `pnpm-workspace.yaml:2` filters npm dependency versions, not the Bun executable that setup-bun installs. The mitigations are the exact `bun@1.4.0` pin with no range, the full gate as the acceptance bar, and a revert that is one `git revert`, because `pnpm-lock.yaml` and `pnpm-workspace.yaml` stay in git history.
3. The user chose to drop the `allowBuilds` deny without a Bun counterpart, so `package.json` gets no `trustedDependencies` field. The user's reason: Bun runs no dependency lifecycle script unless the project trusts the package (https://bun.com/docs/pm/lifecycle), so the Bun default already denies the `claude-code` postinstall, and the explicit `install.cjs` step stays the only way that the binary appears.
4. Request correction. Asked: "Move the shipped skills to Bun as well." Did: move the scaffold skill, because its seed mode installs this repository's toolchain into a new project (Facts, Scaffold). Keep the other shipped lines that name pnpm, because they advise a consumer's own project or show trigger keywords. Reason: `plugins/docks/skills/AGENTS.md:22` asks for concrete trigger keywords and gives "Use when running pnpm audit" as the example. `plugins/docks/skills/engineering/dep-vuln-workflow/SKILL.md:3` triggers on "pnpm/npm/yarn audit", and `plugins/docks/skills/productivity/write-skill/SKILL.md:108` routes "pnpm audit flags lodash" to that skill. `plugins/effect-kit/skills/engineering/effect-ts-setup/SKILL.md:47-56` picks the package manager from the lockfile of the consumer and already maps `bun.lock` to bun. A rewrite to Bun would make these skills match fewer real requests and give a pnpm or npm project commands for a tool that it does not use.
5. Request correction. Asked: "Bun installs, caches and runs every gate." Did: Bun installs and caches the dependencies and starts every package script and tool binary that pnpm started. Each gate script keeps running on Node 24: `node scripts/ci.mjs` stays the gate entry point, and the package scripts call `node` or `biome` directly (`package.json:6-17`). Reason: `AGENTS.md:10` pins Node 24 to match the `node-version` of CI (`.github/workflows/ci.yml:38-41`), and `scripts/AGENTS.md:3` states that all tooling is Node `.mjs`. `bun run` keeps a Node CLI on Node (Facts, Bun scripts). A move of the gate to the Bun runtime is a runtime port that no instruction file asks for, and Bun 1.4 states that it is not yet fully compatible with Node.js (https://bun.com/blog/bun-v1.4, section Node.js compatibility).
6. `bunfig.toml` selects `linker = "isolated"`, so the install keeps the isolated layout that pnpm gives today (Facts, Bun layout).
7. The workflows keep `npm audit signatures` after the Bun install, because `.github/AGENTS.md:108` requires it after every install, and the `bun audit` page documents an advisory check, not a signature check (https://bun.com/docs/pm/cli/audit).
8. `installFingerprint` moves to the isolated store. It records the name and the link target of every entry under `node_modules/.bun`, including the links inside the `node_modules` folder of each entry, without following links or hashing contents. A missing store still gives `absent`.

Durable fix: replace pnpm in every caller of the repository toolchain and delete `pnpm-lock.yaml` and `pnpm-workspace.yaml`, instead of the temporary option of running Bun next to pnpm with two lockfiles.

### Tool facts

- Bun 1.4.0: release page https://github.com/oven-sh/bun/releases/tag/bun-v1.4.0, published 2026-08-20. step:bun_lockfile_policy pins it in the `packageManager` field of `package.json`, and setup-bun reads that pin.
- pnpm 11.5.1: `package.json:4`. It runs the gate and the release until step:bun_lockfile_policy.
- Node 24: `.github/workflows/ci.yml:38-41` and `AGENTS.md:10`. npm is the copy that ships with Node 24, and it runs `npm audit signatures` (https://docs.npmjs.com/cli/v11/commands/npm-audit).
- claude 2.1.158 and biome 2.5.4: `package.json:19-20`.
- gh: no repository pin. The release tool requires it (`scripts/lib/plugin-release.mjs:267`). step:release_plan_lifecycle records `gh --version` in Verification Results.
- setup-bun v2.2.0 at `0c5077e51419868618aeaa5fe8019c62421857d6`, and actions/cache v6.1.0 at `55cc8345863c7cc4c66a329aec7e433d2d1c52a9` (`.github/workflows/ci.yml:118`).

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | merge_cutover | Ask in session. Then merge pull request #11 into main with the merge method that the repository allows, after its `validate (scripts/ci.mjs)` check passes | none | — | `push` | `planned` | `gh pr view 11 --json state` prints `MERGED` |
| 2 | release_plan_lifecycle | Run `node scripts/ci.mjs --plugin plan-lifecycle`. Ask in session. Then run `node scripts/release.mjs --plugin plan-lifecycle 0.5.0` in the current checkout (decision 1). The branch check of the release tool keeps the bump on main (Facts, Release flow) | plugins/plan-lifecycle/.claude-plugin/plugin.json, plugins/plan-lifecycle/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 1 | `release` | `planned` | tag `plan-lifecycle--v0.5.0` exists on origin, its tag CI run passed, and its GitHub release is published |
| 3 | bun_lockfile_policy | Create the migration branch from `origin/main` after the release commit. Write `bunfig.toml` with `[install]` `minimumReleaseAge = 259200` and `linker = "isolated"` (decision 6). Set `packageManager` to `bun@1.4.0` (decision 2). Run `bun install` to migrate `pnpm-lock.yaml` to `bun.lock`. Delete `pnpm-lock.yaml` and `pnpm-workspace.yaml`. The `allowBuilds` deny gets no Bun counterpart (decision 3) | package.json, bunfig.toml, bun.lock, pnpm-lock.yaml, pnpm-workspace.yaml | 2 | `local` | `planned` | from a clean checkout, `bun install --frozen-lockfile` exits 0 against the tracked `bun.lock`, and no pnpm lockfile or workspace file remains |
| 4 | gate_subprocesses | Start every package-manager subprocess of `scripts/ci.mjs` with `bun`: `bun run check:js`, `bun run biome ci`, `bun run biome lint` and `bun run test:unit`, with the matching failure hint (decision 5). Move `installFingerprint` to the isolated store (decision 8), and fingerprint `bun --version` instead of `pnpm --version`. Port the pnpm shims and call counts of the contract test, the vacuity shim and the background-task comment to Bun. Add gate-memo tests for the store | scripts/ci.mjs, scripts/lib/gate-memo.mjs, scripts/tests/unit/gate-memo.test.mjs, scripts/tests/unit/skill-score-vacuity.test.mjs, scripts/tests/unit/ci-background-task.test.mjs, scripts/tests/ci-plugin-targeting.mjs | 3 | `local` | `planned` | `node scripts/tests/ci-plugin-targeting.mjs --unit` passes with a `bun` shim that counts the expected `bun` calls, and the gate-memo tests give different keys for a present, a changed (also one nested store link) and a removed `node_modules/.bun` store |
| 5 | workflow_contracts | In each gate-running job of `.github/workflows/ci.yml` and in `.github/workflows/dependency-integrity.yml`, replace the Corepack and pnpm-store steps with `oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0`. Cache `~/.bun/install/cache` with the same `actions/cache` SHA under a key that hashes `bun.lock` and `package.json`. Install with `bun install --frozen-lockfile`. Rename the cache id, the cache-hit fields and the step names away from pnpm and `allowBuilds`. Keep each `if:` condition, the `npm audit signatures` steps (decision 7), and the `install.cjs` and PATH steps. Update the workflow assertions and the lockfile-only diff of the contract test to match | .github/workflows/ci.yml, .github/workflows/dependency-integrity.yml, scripts/tests/ci-plugin-targeting.mjs | 3, 4 | `local` | `planned` | `node scripts/tests/ci-plugin-targeting.mjs` passes against the Bun workflows, no workflow step names pnpm or Corepack, and every `uses:` value is still a 40-character SHA with a version comment |
| 6 | toolchain_docs | Rewrite every toolchain line that names pnpm or Corepack (Facts, Toolchain documents) for Bun 1.4.0, `bun.lock`, the `bunfig.toml` age gate and the new step names. Keep the credit to the Dec-2025 guidance | AGENTS.md, README.md, scripts/AGENTS.md, .github/AGENTS.md | 5 | `local` | `planned` | the only pnpm or Corepack line left in these four files is the guidance credit in `.github/AGENTS.md`, and each documented command and step name exists in the workflows or in `package.json` |
| 7 | scaffold_seed | Change seed mode of the scaffold skill to `bun install --frozen-lockfile` (decision 4). Change the spec example to seed `bun.lock.template` and `bunfig.toml.template`, and name `bun.lock` as the source of the `yaml` dependency. Run `node scripts/skills/content-hash.mjs --backfill` | plugins/docks/skills/productivity/scaffold/SKILL.md, plugins/docks/skills/productivity/scaffold/references/spec-schema.md | 3 | `local` | `planned` | no scaffold file names pnpm or Corepack, and `node scripts/skills/content-hash.mjs --check-only plugins/docks/skills` exits 0 |
| 8 | push_migration | Run `node scripts/ci.mjs` on the final tree. Ask in session. Then commit the migration under `docks:commit-discipline` and push the branch | none | 4, 5, 6, 7 | `push` | `planned` | `node scripts/ci.mjs` exits 0 on the committed tree, and `git ls-remote --heads origin` lists the branch |
| 9 | open_pull_request | Ask in session. Then open the pull request from the branch to main with `Closes #12` in its description | none | 8 | `publish` | `planned` | the pull request carries `Closes #12`, and its `validate (scripts/ci.mjs)` check passes on the Bun workflows |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/ci.mjs --plugin plan-lifecycle` | exits 0 on main after step:merge_cutover and before step:release_plan_lifecycle |
| A2 | `gh release view plan-lifecycle--v0.5.0 --json tagName,isDraft` | reports tag `plan-lifecycle--v0.5.0` with `isDraft` false |
| A3 | `git ls-files --error-unmatch bun.lock && bun install --frozen-lockfile` | exits 0: the frozen install reads the tracked `bun.lock` |
| A4 | `git ls-files pnpm-lock.yaml pnpm-workspace.yaml` | prints nothing |
| A5 | `test -x node_modules/.bin/claude && test -x node_modules/.bin/biome` | exits 0 after the Bun install, so the PATH step of CI still finds both binaries |
| A6 | `node -p "require('./package.json').packageManager"` | prints `bun@1.4.0` |
| A7 | `grep -nx 'linker = "isolated"' bunfig.toml` | prints the quoted linker line |
| A8 | `grep -n '^minimumReleaseAge = 259200' bunfig.toml` | prints the three-day age gate in seconds |
| A9 | `grep -rni -e pnpm -e corepack .github/workflows package.json scripts/ci.mjs scripts/lib scripts/tests/unit` | prints nothing |
| A10 | `grep -c 'oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0' .github/workflows/ci.yml .github/workflows/dependency-integrity.yml` | prints `.github/workflows/ci.yml:3` and `.github/workflows/dependency-integrity.yml:1` |
| A11 | `grep -c 'uses: actions/cache@' .github/workflows/ci.yml` | prints `3`: each gate-running job restores the Bun install cache keyed on `bun.lock` |
| A12 | `grep -rnE 'uses: .*@v[0-9]' .github/workflows` | prints nothing: no action uses a moving tag |
| A13 | `node scripts/tests/ci-plugin-targeting.mjs` | exits 0: the workflow contract that CI runs outside the gate (`.github/workflows/ci.yml:212-215`) passes |
| A14 | `npm audit signatures` | exits 0 and reports verified registry signatures after the Bun install |
| A15 | `grep -rni -e pnpm -e corepack plugins/docks/skills/productivity/scaffold` | prints nothing |
| A16 | `grep -c 'bun install --frozen-lockfile' plugins/docks/skills/productivity/scaffold/SKILL.md` | prints `1`: seed mode installs with Bun |
| A17 | `node scripts/skills/content-hash.mjs --check-only plugins/docks/skills` | exits 0 after the backfill |
| A18 | `grep -ni -e pnpm -e corepack AGENTS.md README.md scripts/AGENTS.md .github/AGENTS.md` | prints one line: the guidance credit in `.github/AGENTS.md` |
| A19 | `node scripts/ci.mjs` | exits 0 for every plugin and the repo-wide checks |

## Do not touch

- `docs/plans/finished/`, the frozen archive.
- The docks and effect-kit plugin versions.
- The plan-lifecycle payload. step:release_plan_lifecycle changes only the three version fields.
- The Node 24 runtime of every gate script (decision 5).
- Shipped skill lines that advise the own package manager of a consumer or show trigger keywords (decision 4).
- The commands of the `npm audit signatures`, `install.cjs` and PATH steps in the workflows.

## Open questions

None

## Review

_No review yet._

## Verification Results

_Not implemented yet._
