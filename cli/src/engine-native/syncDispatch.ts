/**
 * EngineNative sync dispatch: take the sync and folder locks, run the omp
 * pipeline, then print the summary and advice. Split from index.ts; the
 * `sync`/`toolchain` entry routing still lives there.
 */
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import type { Ctx } from "./index";
import { compareCodepoints } from "./jq";
import { acquireKitLock, releaseKitLock, type KitLock } from "./kitLock";
import {
  ompNextSteps,
  ompSummary,
  ompSync,
  ompWriteFolders,
  type OmpState,
  type OmpWriteFolders,
} from "./ompSync";
import { ExitError, parseArgs } from "./parseArgs";
import { folderSyncLockPath, syncLockPath } from "./scratch";

/** The default time that a sync waits for another sync to release the sync lock. */
export const SYNC_LOCK_WAIT_MS = 120_000;
const SYNC_LOCK_WAIT_ERROR = "DOCKS_KIT_SYNC_LOCK_WAIT_MS must be a non-negative safe integer";

/** Print one error line, as `Logger.err` does. */
type ErrorSink = (message: string) => void;

/**
 * The sync lock wait bound: `DOCKS_KIT_SYNC_LOCK_WAIT_MS` in ms, or
 * `SYNC_LOCK_WAIT_MS` when unset or empty. A value above
 * `Number.MAX_SAFE_INTEGER` exits 2: `Number` would round it or make it
 * Infinity, and an Infinity wait never ends.
 */
function syncLockWaitMs(err: ErrorSink): number {
  const configured = process.env["DOCKS_KIT_SYNC_LOCK_WAIT_MS"];
  if (configured === undefined || configured === "") return SYNC_LOCK_WAIT_MS;
  if (/^\d+$/.test(configured) && Number.isSafeInteger(Number(configured))) {
    return Number(configured);
  }
  err(SYNC_LOCK_WAIT_ERROR);
  throw new ExitError(2);
}

/**
 * The tokens that skip the sync lock. `-h` and `--help` make `parseArgs`
 * print the usage or an error and exit before the sync writes a file. A
 * `--dry-run` sync writes no kit file.
 */
const UNLOCKED_TOKENS: Record<string, true> = { "--dry-run": true, "-h": true, "--help": true };

/**
 * Run `body` under each lock of `paths`, taken in that order. When another
 * sync keeps a lock past the wait bound, print the held line and return 1
 * without a call to `body`. Each taken lock goes when the run ends, also when
 * it throws; the OS releases the locks when the process ends.
 *
 * With `privateDirectory` false, each path is a folder lock. A missing folder
 * is created just before its lock, so the locks of its ancestors in the set
 * are already held. Each folder that this creates gets mode 0700, as
 * `ompFileDeploy.ts ensureDirectory` gives the parents of an omp folder. An
 * existing folder keeps its mode: `mkdirSync` applies `mode` only to the
 * folders that it creates.
 */
async function withKitLocks(
  err: ErrorSink,
  paths: ReadonlyArray<string>,
  privateDirectory: boolean,
  body: () => Promise<number>,
): Promise<number> {
  const waitMs = syncLockWaitMs(err);
  const held: Array<KitLock> = [];
  try {
    for (const path of paths) {
      if (!privateDirectory) mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      const result = await acquireKitLock(path, { waitMs, privateDirectory });
      if (result.kind === "held") {
        err(`another docks-kit sync holds ${path}; run sync again after it ends`);
        return 1;
      }
      held.push(result.lock);
    }
    return await body();
  } finally {
    for (const lock of held.reverse()) releaseKitLock(lock);
  }
}

/**
 * Run `body` under the sync lock `syncLockPath(ctx.home)`. Two syncs of the
 * same home meet at this lock. A dry run takes no lock: `args` holds one of
 * `UNLOCKED_TOKENS`, or `ctx.dryRun` is true. `makeCtx` sets `ctx.dryRun`
 * from the `DRY_RUN` env global only on the channel that reads env globals.
 */
async function withSyncLock(
  ctx: Ctx,
  args: ReadonlyArray<string>,
  body: () => Promise<number>,
): Promise<number> {
  if (ctx.dryRun || args.some((arg) => Object.hasOwn(UNLOCKED_TOKENS, arg))) return await body();
  return await withKitLocks(ctx.services.logger.err, [syncLockPath(ctx.home)], true, body);
}

/**
 * The canonical path of `folder`, which can be missing: the real path of its
 * nearest existing ancestor, joined with the rest of the path.
 */
function canonicalFolder(folder: string): string {
  const missing: Array<string> = [];
  let current = folder;
  while (!existsSync(current) && dirname(current) !== current) {
    missing.unshift(basename(current));
    current = dirname(current);
  }
  return join(realpathSync.native(current), ...missing);
}

/**
 * The folder lock path of each folder, by the canonical path of the folder,
 * with no duplicates, sorted by folder. Every sync takes its folder locks in
 * this order, so no two syncs can wait on each other in a cycle. An ancestor
 * sorts before its descendants, and a nested folder keeps its own lock.
 */
export function folderLockPaths(folders: ReadonlyArray<string>): Array<string> {
  const canonical = new Set(folders.map(canonicalFolder));
  return [...canonical].sort(compareCodepoints).map(folderSyncLockPath);
}

/**
 * Run `body` under the folder lock of each folder in `folders`. Take it after
 * the sync lock. Syncs of different homes can share an omp folder, and
 * their home locks differ. A missing folder is created under the
 * locks of its ancestors in the set. A dry run takes no folder lock and
 * creates nothing.
 */
async function withFolderLocks(
  ctx: Ctx,
  folders: ReadonlyArray<string>,
  body: () => Promise<number>,
): Promise<number> {
  if (ctx.dryRun) return await body();
  return await withKitLocks(ctx.services.logger.err, folderLockPaths(folders), false, body);
}

/**
 * Run `body` under the sync lock of `home` and the folder locks of `folders`,
 * with the wait and the held line of a sync. A command that writes a sync
 * file outside a sync run uses it. Print each error line with `err`.
 */
export async function withHomeAndFolderLocks(
  home: string,
  folders: ReadonlyArray<string>,
  err: ErrorSink,
  body: () => Promise<number>,
): Promise<number> {
  return await withKitLocks(err, [syncLockPath(home)], true, () =>
    withKitLocks(err, folderLockPaths(folders), false, body),
  );
}

/**
 * Run a sync. The sync lock comes first, then the folder locks of the omp
 * folders, which `runSync` resolves after `parseArgs` reads the flags.
 */
export async function engineSync(ctx: Ctx, args: ReadonlyArray<string>): Promise<number> {
  return await withSyncLock(ctx, args, () => runSync(ctx, args));
}

async function runSync(ctx: Ctx, args: ReadonlyArray<string>): Promise<number> {
  parseArgs(ctx, args);
  // The folders that hold omp files. A writing sync creates its folders
  // anyway, so `withFolderLocks` creates each missing one under the locks of
  // its ancestors in the set. The omp folders are resolved once, here: the
  // omp pipeline and its omp children use these paths, so a data root that
  // appears after the locks cannot move them.
  const omp = ompWriteFolders(ctx);
  const folders = [omp.paths.agentDir, omp.intercomDir, omp.paths.dataRoot];
  return await withFolderLocks(ctx, folders, () => runPipeline(ctx, omp));
}

/** Run the omp pipeline in the omp folders `omp`, then print the summary and advice. */
async function runPipeline(ctx: Ctx, omp: OmpWriteFolders): Promise<number> {
  const { acquireTerminal, echo } = ctx.services.logger;

  const lease = acquireTerminal("Syncing omp...");
  ctx.terminalLease = lease;
  let ompState: OmpState;
  try {
    try {
      ompState = await ompSync(ctx, omp);
    } finally {
      lease.release();
      ctx.terminalLease = undefined;
    }
  } catch (error) {
    // A rejected pipeline skips the summary. Print the failures that it recorded before it stopped.
    printFailures(ctx);
    throw error;
  }

  echo("");
  echo("--- Sync complete ---");
  echo(`Repo:     ${ctx.repoDir}`);
  ompSummary(ctx, ompState);

  const advice = ompNextSteps(ctx);
  if (advice.length > 0) {
    echo("");
    for (const line of advice) echo(line);
  }
  if (printFailures(ctx)) return 1;
  return 0;
}

/** Print the `--- Failures ---` ledger. Returns true when the ledger has entries. */
function printFailures(ctx: Ctx): boolean {
  const { echo } = ctx.services.logger;
  if (ctx.failures.length === 0) return false;
  echo("");
  echo("--- Failures ---");
  for (const failure of ctx.failures) echo(`- ${failure}`);
  return true;
}
