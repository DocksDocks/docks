# Dispatch Flow - docks-kit to EngineNative

## Critical Constraints

- Mutating commands route through `cli/src/engine.ts`, which runs
  `runEngineNative` in-process.
- The harness-only raw channel is `DOCKS_KIT_ENGINE=native-raw`; public users
  should not be routed through it.
- Only the `main.ts` `native-raw` branch passes `{ envGlobals: true }` to
  `runEngineNative`. Only that channel honors the unprefixed env globals that
  `engineCtx.ts makeCtx` reads (`DRY_RUN`, `DOCKS_KIT_VERBOSE`, `PRUNE`,
  `AGENTS_DIR`); `engine.ts engine` passes `{ envGlobals: false }`.
  (verify: `bunx vitest run cli/test/unit/envGlobals.test.ts -t "ignores env globals unless the raw channel enables them"`)
- `DOCKS_KIT_ENGINE` set to `bash` exits 2 with the removed-engine recovery
  message. It is not a fallback selector.
- SoT comes from the embedded payload (`payload.ts payloadText`/`payloadBytes`).
  No sync step reads kit files from disk.

## Entry Chain

```text
./docks-kit
|-- cli/dist/docks-kit-<os>-<arch>  preferred only when binary version matches package.json
|                                   and no file under cli/src or cli/docs is newer than it
`-- Bun from source
    |-- find_bun and bootstrap Bun when needed
    |-- bun install --frozen-lockfile when node_modules/effect is absent
    `-- bun cli/src/main.ts "$@"
        |-- DOCKS_KIT_ENGINE=native-raw
        |   `-- runEngineNative(rawArgs, undefined, { envGlobals: true })
        `-- prepareArgv(argv)                        argv.ts; argvValidate.ts rejects with exit 2
            `-- Effect CLI root command                 subcommands: argv.ts COMMANDS
                `-- mutating commands call engine(args)
                    `-- cli/src/engine.ts
                        `-- runEngineNative(args, services, { envGlobals: false })
```

`kitHome()` (`kitHome.ts resolveKitHome`) identifies a kit root by a
`package.json` whose `name` is `docks-kit`. It checks `DOCKS_KIT_HOME` first.
Next, it takes the nearest such ancestor of the module directory, the
executable directory, or the cwd, in that order. Last, it falls back to the
executable directory. `ctx.repoDir` holds the result for display only.
`kitHome()` also selects the update target (`commands/update.ts`) and the
checkout that `commands/sync.ts updateNudge` checks. `updateNudge` starts
`git` through `exec.ts spawnHost`, so a Windows host never runs a `git.exe`
from the current directory.
(verify: `bunx vitest run cli/test/unit/kitHome.test.ts -t "resolveKitHome"` and `bunx vitest run cli/test/unit/syncUpdateNudge.test.ts -t "runs git through spawnHost"`)

## Sync Execution Order

```text
runEngineNative(argv, services?, options?)        index.ts
|-- makeCtx(services, { envGlobals })             engineCtx.ts; env globals only when true
`-- switch (argv[0])
    |-- toolchain -> modeToolchain(ctx, args)     modes.ts; no lock
    `-- sync/default -> engineSync(ctx, args)     syncDispatch.ts
        |-- withSyncLock(ctx, args, ...)          ~/.cache/docks-kit/sync-lock.db; none for
        |                                         --dry-run, -h, --help, or ctx.dryRun; held
        |                                         past the wait bound: held line, returns 1
        |-- parseArgs(ctx, args)
        |   `-- applyDefaultSelection(ctx) when no target word:
        |       kit.db harness selection, else harnesses.ts DEFAULT_SELECTION
        |-- DOCKS_KIT_SYNC_CONCURRENCY            1, 2, or 3; unset or empty means 3;
        |                                         other values exit 2
        |-- ompWriteFolders(ctx)                  omp selected only; resolved once, before
        |                                         the locks; ompSync and its omp children
        |                                         use the result
        |-- withFolderLocks(ctx, folders, ...)    <folder>/.docks-kit-sync-lock.db of the
        |                                         selected agents folder and, for
        |                                         omp, the ompWriteFolders agent, intercom, and
        |                                         data root folders; canonical, sorted
        |                                         ancestor-first; a missing folder is made
        |                                         under the locks of its ancestors in the
        |                                         set; none in a dry run
        `-- runPipelines(ctx, omp)
            |-- selected tasks, in input order; runBounded runs them below
            |   |-- skillsSync(ctx) when agents is selected        skillsSync.ts
            |   `-- ompSync(ctx, omp) when omp is selected         ompSync.ts
            |-- runBounded(tasks, ctx.syncConcurrency)
            |       input-ordered results; on the first rejection, started tasks drain,
            |       queued tasks do not start, and the earliest rejection propagates;
            |       runPipelines then prints the "--- Failures ---" ledger and rethrows
            |-- "--- Sync complete ---" summaries
            |-- next steps for the pipelines that ran
            `-- "--- Failures ---" ledger when recordFailure ran; returns 1
        releaseKitLock of each lock in finally
```

Each pipeline function owns its step order. Read the function body, not a copy
here (verify: `sed -n '/^export async function skillsSync/,/^}/p' cli/src/engine-native/skillsSync.ts`;
use the same command for `ompSync` in `ompSync.ts`). The order rules that
matter across pipelines:

- `ompSync` starts with `bun.ts bunBootstrap`, which is memoized on
  `ctx.bunRuntime` for the engine run.
- `skillsSync` calls `skillsPrune.ts reconcileRemovals` only with `--prune`.
- Every pipeline of a writing sync runs under the sync lock and the folder
  locks, so two syncs never run the read-modify-write of one file at the same
  time. `SKILL.md` § Sync Lock owns the lock rules.

## Direct Modes

`.agents/skills/sync-orchestration-context/SKILL.md` § Direct Modes owns the
mode table. `toolchain-context` owns the toolchain operations.

## Idempotency Invariants

| Step | Pre-check |
|------|-----------|
| omp docks marketplace add | Marketplace neither registered nor adoptable from the omp registry (`ompMarketplace.ts syncMarketplace`). |
| omp marketplace plugin install | Plugin absent from the `omp plugin list --json` inventory; a present plugin gets `plugin upgrade` instead, or nothing under `--skip-plugin-refresh` (`ompPlugins.ts syncPlugins`). |
| Universal skill install | Canonical `~/.agents/skills/<basename>` directory absent (`skillsInstall.ts syncUniversal`). A directory that existed before is reused and never recorded as kit-owned. |

## New Target Checklist

1. Add the harness name to `harnesses.ts Harness`, `HARNESSES`, and
   `isHarness`, and a `sync<Name>` selection flag to `engineCtx.ts Ctx`
   (initialized in `makeCtx`). SoT content stays in the embedded payload
   (`payload.ts`); `Ctx` holds no SoT path.
2. Map the word in `parseArgs.ts TARGET_FLAGS` and `applySelection`. Add a
   `case` label for the word in the `parseArgs` target switch; without it,
   the word exits 2 with `Unknown arg`. List the target in
   `parseHelp.ts printUsage`.
3. Add dependency checks at each concrete consuming operation.
4. Add the folders the pipeline writes to the folder list in
   `syncDispatch.ts runSync`, and the pipeline to the `selected` list in
   `syncDispatch.ts runPipelines`.
5. Add summary and next-step hooks if the target has user-facing output.
6. Mirror the target in `cli/src/commands/sync.ts VALID_TARGETS` and the
   `main.ts` root overview line.
7. Add or update golden cases for selected-target and default-selection behavior.
