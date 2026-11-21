# Project skills (.agents/skills/)

Canonical project skills live here. omp reads `.agents/skills/` directly.
Read this file before you add, edit, or cite code from a skill.

## Conventions

**Project-skill scope.** Keep project skills within four classes: kit-mechanic skills, the `unslop` repo-prose skill, the `verify` skill, which holds the end-to-end checks that run the CLI the way a user does, and the `review-benchmark` skill, which measures changes to the kit's own reviewers.
Canonical project skills live in `.agents/skills/<name>/SKILL.md`. The repository tracks no symlinks.
Kit-mechanic skills document regression-prone kit logic. Most of it is TypeScript in `cli/src/engine-native/`, in the CLI commands under `cli/src/commands/`, and in the top-level `cli/src/*.ts` modules such as `cli/src/services.ts`. The rest is in the `docks-kit` launcher and in the omp extension `SoT/.omp/plugin/extensions/hygiene.ts`.
Kit-mechanic skills: `engine-native-context`, `sync-orchestration-context`, `toolchain-context`, `omp-sync-context`, `tidy-context`, and `host-platform-context`.
**Pipeline content** (multi-agent slash commands, refactor/security/docs workflows, parallel-scanner agents) belongs in the kit plugin under `SoT/.omp/plugin/skills/` (and its `agents/`, `commands/`, and `extensions/` siblings), which `docks-kit sync` ships as `docks-kit-omp` — not in `.agents/skills/`.
`review-benchmark` is maintainer tooling for this repository, so it stays out of the kit plugin. Keep it at `.agents/skills/review-benchmark/`: its scripts hide that path from every reviewer snapshot, and the frozen case commits hold the benchmark there, so another path would show the answer keys to reviewers. Its `cases/`, `variants/`, `results.md`, and `backup-key.asc` are records: change them only through the procedures of its `SKILL.md`, which add new cases and variants, append new entries to `results.md`, and replace the backup key in its own pull request. Never rewrite an existing case, variant, or `results.md` entry.

A maintainer refreshes `unslop` with `npx skills@1.7.0 add cursor/plugins -s unslop -y -a universal`, and root `skills-lock.json` pins it. The kit never runs this command. The skills CLI 1.7.0 installs the `universal` agent into the project path `.agents/skills/`. A newer skills CLI rewrites the version 1 `skills-lock.json` to version 2, so keep the 1.7.0 pin.
The repository vendors upstream `unslop` text and pins it by the lockfile hash, so never edit it locally.
Upstream licenses `pstack/` under MIT (Copyright (c) 2026 Lauren Tan), so redistribution is permitted.
MIT requires the notice to travel with the copy, so `.agents/skills/unslop/LICENSE` vendors it verbatim and must stay beside `SKILL.md`.
The `unslop` "adding soul" guidance conflicts with the global Simplified Technical English Output Standard.
The Output Standard wins.
Use `unslop` only for its pattern-detection lists.

<constraint>
When a kit-mechanic skill or its `references/` cites EngineNative internals, name the **module + exported/local function + semantic anchor** (e.g. `ompPlugins.ts syncPlugins, kit plugin link`) — never a raw `file:NNN` line number, which goes stale on every refactor. Keep exactly one coarse `metadata.source_files[].lines` range per skill file as the sole intentional line-number touchpoint.
</constraint>

## Owned elsewhere

- The guard for `metadata.source_files[].lines`: `cli/test/unit/skillMetadata.test.ts` (probe: set one range end past the line count of its file; `bunx vitest run cli/test/unit/skillMetadata.test.ts` must fail and name it; revert).
- The `review-benchmark` suite: the vitest project `review-benchmark` in `vitest.config.ts` (Linux only: `keys.mjs` needs GNU tar, and one test needs the util-linux `script`), with tests in `.agents/skills/review-benchmark/tests/`.
- The `unslop` pin: `skills-lock.json`.
- The EngineNative rules that the kit-mechanic skills document: `cli/AGENTS.md`.

Pointers here name concepts, not coordinates — if a path or symbol moved,
trust the stated purpose and re-locate it (grep the symbol) before acting.

<!-- machine-readable drift aid — `audit` reads `sources:` to scope its content check -->
## tree (metadata)
- sources: `.agents/skills/*/SKILL.md`, `skills-lock.json`, `.agents/skills/unslop/LICENSE`, `cli/test/unit/skillMetadata.test.ts`
