/**
 * EngineNative flag layer: the argv dispatch loop of `docks-kit sync`.
 * Help text and the early-exit error live in parseHelp.ts (re-exported here
 * so existing `from "./parseArgs"` imports keep working).
 */
import type { Ctx } from "./index";
import { ExitError, printUsage } from "./parseHelp";

export { ExitError } from "./parseHelp";

export function parseArgs(ctx: Ctx, args: ReadonlyArray<string>): void {
  const { err } = ctx.services.logger;
  for (const arg of args) {
    switch (arg) {
      case "--dry-run":
        ctx.dryRun = true;
        continue;
      case "--skip-plugin-refresh":
        ctx.skipPluginRefresh = true;
        continue;
      case "--verbose":
        ctx.verbose = true;
        continue;
      case "-h":
      case "--help":
        printUsage(ctx);
        throw new ExitError(0);
      default:
        err(`Unknown arg: ${arg}`);
        throw new ExitError(2);
    }
  }
}
