/**
 * Help text and the early-exit signal for the EngineNative flag layer.
 * Kept dependency-free (besides injected ctx) so the dispatch loop and its
 * callers can share it without import cycles.
 */

import type { Ctx } from "./index";

export class ExitError extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}

export function printUsage(ctx: Ctx): void {
  const { echo } = ctx.services.logger;
  const argv0 = "docks-kit sync";
  echo(`Usage: ${argv0} [flags]`);
  echo("");
  echo("Global flags");
  echo("  --dry-run         preview without applying");
  echo("  --skip-plugin-refresh  install missing plugins but skip refresh-only updates");
  echo(
    "  --verbose         also print no-op confirmations (already in sync, up to date, left as-is)",
  );
}
