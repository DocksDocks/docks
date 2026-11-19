# Flag Matrix - docks-kit sync

This file is the only flag table for this skill. `parseArgs.ts parseArgs` owns
the engine vocabulary and `cli/src/commands/sync.ts syncCommand` owns the public
options (verify: `grep -n 'case "--' cli/src/engine-native/parseArgs.ts`).

## Critical Constraints

- Targets are positional words: `agents`, `omp`. Any other word exits 2
  (`Unknown sync target(s)` on the public CLI, `Unknown arg` in the engine).
- Unknown flags and renamed legacy flags (`parseArgs.ts LEGACY_FLAG_HINTS`)
  exit 2 before mutation.
- Every sync flag is a boolean. A value such as `--prune no` or
  `--dry-run=false` exits 2 on the public CLI; the engine parser has no
  `--flag=value` arm, so it exits 2 with `Unknown arg`.
  (verify: `bunx vitest run cli/test/unit/argv.test.ts -t "rejects a separate boolean literal after the prune boolean"` and `bunx vitest run cli/test/unit/targetGrammar.test.ts -t "reports the unknown positional target"`)

## Full Truth Table

| `--prune` | `--dry-run` | Effect |
|-----------|-------------|--------|
| 0 | 0 | Sync the selected targets. |
| 0 | 1 | Preview the selected targets. |
| 1 | 0 | Sync, then remove kit-owned universal skills that the manifest no longer lists (`agents` selected only). |
| 1 | 1 | Preview the sync and the removals without writes. |

## Flags

| Flag | `Ctx` field | Consumer | Notes |
|------|-------------|----------|-------|
| `--dry-run` | `ctx.dryRun` | every step | Preview only. Also skips the sync lock and the folder locks. |
| `--verbose` | `ctx.verbose` | `index.ts runEngineNative` logger | Also prints no-op confirmations. The public `sync` command also accepts `-v`. |
| `--prune` | `ctx.prune` | `skillsSync.ts skillsSync` -> `skillsPrune.ts reconcileRemovals` | See § Layer Scope By Flag. |
| `--skip-plugin-refresh` | `ctx.skipPluginRefresh` | `ompMarketplace.ts syncMarketplace`, `ompPlugins.ts syncPlugins` | Installs missing omp plugins but skips refresh-only calls. No command passes it automatically: `commands/update.ts updateSyncArgs` chains a flag-less sync. |
| target word present | `ctx.targetFilterSet` | `parseArgs.ts applyDefaultSelection` | Once any target word appears, only named targets run. |

(verify: `bunx vitest run cli/test/unit/engine-di.test.ts -t "lists the agents and omp targets and the global flags in sync help"` and `bunx vitest run cli/test/unit/ompPluginInventory.test.ts -t "skips every refresh of present plugins under --skip-plugin-refresh"`)

Default target behavior: when no target word is present, `parseArgs.ts
applyDefaultSelection` selects the stored kit.db harness selection. When no
selection is stored, it selects `harnesses.ts DEFAULT_SELECTION` (agents and
omp).

## Layer Scope By Flag

| Layer | `--prune` | Default |
|-------|-----------|---------|
| `~/.agents/skills/` | Remove slugs in `~/.agents/.kit-owned-skills` that the manifest no longer lists; keep legacy `.kit-managed-skills` entries with a `keep` line | Additive install and symlink heal; record kit installs in `.kit-owned-skills` |
| omp agent folder and plugins | No effect | `omp-sync-context` owns the merge, removal, and plugin rules |

(verify: `bunx vitest run cli/test/unit/skillsDurability.test.ts -t "keeps a dropped slug tracked through a plain sync until a prune removes it"`)

## Gotchas

- `--dry-run --prune` previews the removals; a dry-run sync can still migrate
  `kit.db`.
