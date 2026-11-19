/**
 * EngineNative flag layer: target selection and the argv dispatch loop.
 * Help text and the early-exit error live in parseHelp.ts (re-exported here
 * so existing `from "./parseArgs"` imports keep working).
 */
import type { Ctx } from "./index";
import { DEFAULT_SELECTION, readHarnessSelection, type Harness } from "./harnesses";
import { ExitError, printUsage } from "./parseHelp";

export { ExitError } from "./parseHelp";

type TargetFlag = "syncAgents" | "syncOmp";

const TARGET_FLAGS = {
  agents: "syncAgents",
  omp: "syncOmp",
} satisfies Record<Harness, TargetFlag>;

/**
 * The rename hint for each retired sync flag. The engine prints it here, and
 * the public CLI layer (`argvValidate.ts`) rejects the same flag with the same
 * text, so the two paths cannot drift.
 */
export const LEGACY_FLAG_HINTS = {
  "--agents": "--agents was renamed: pass the target as a word, e.g. 'sync agents'",
  "--omp": "--omp was renamed: pass the target as a word, e.g. 'sync omp'",
  "--remove-plugins": "--remove-plugins was renamed to --prune",
} as const satisfies Record<string, string>;

type LegacyFlag = keyof typeof LEGACY_FLAG_HINTS;

/** Own-key check, so a word such as `constructor` never reads an Object prototype member. */
export const isLegacyFlag = (flag: string): flag is LegacyFlag =>
  Object.hasOwn(LEGACY_FLAG_HINTS, flag);

function selectTarget(ctx: Ctx, target: Harness): void {
  ctx[TARGET_FLAGS[target]] = true;
  ctx.targetFilterSet = true;
}

function applySelection(ctx: Ctx, selection: ReadonlyArray<Harness>): void {
  ctx.syncAgents = selection.includes("agents");
  ctx.syncOmp = selection.includes("omp");
}

function applyDefaultSelection(ctx: Ctx): void {
  if (ctx.targetFilterSet) return;

  const storedSelection = readHarnessSelection(ctx.home);
  applySelection(ctx, storedSelection ?? DEFAULT_SELECTION);
  if (storedSelection !== undefined || !ctx.interactive) return;

  ctx.services.logger.echo(`No harness selection stored; syncing ${DEFAULT_SELECTION.join(", ")}`);
  ctx.services.logger.echo("Choose harnesses with: docks-kit harnesses");
}

export function parseArgs(ctx: Ctx, args: ReadonlyArray<string>): void {
  const { err } = ctx.services.logger;
  for (const arg of args) {
    switch (arg) {
      case "agents":
      case "omp":
        selectTarget(ctx, arg);
        continue;
      case "--dry-run":
        ctx.dryRun = true;
        continue;
      case "--skip-plugin-refresh":
        ctx.skipPluginRefresh = true;
        continue;
      case "--prune":
        ctx.prune = true;
        continue;
      case "--verbose":
        ctx.verbose = true;
        continue;
      case "--agents":
      case "--omp":
      case "--remove-plugins":
        err(LEGACY_FLAG_HINTS[arg]);
        throw new ExitError(2);
      case "-h":
      case "--help":
        printUsage(ctx);
        throw new ExitError(0);
      default:
        err(`Unknown arg: ${arg}`);
        throw new ExitError(2);
    }
  }

  applyDefaultSelection(ctx);
}
