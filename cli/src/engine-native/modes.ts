/**
 * Direct mode for `toolchain`. Same public argv vocabulary, golden-tested
 * messages, same exit codes.
 */
import type { Ctx } from "./index";
import { bunBootstrap } from "./bun";
import { belowFloor, field, installedVersion, outdatedReport, present, report } from "./toolchain";

const TOOLCHAIN_USAGE = "Usage: toolchain [check|ensure <tool> [--dry-run]|outdated [--refresh]]";

export async function modeToolchain(ctx: Ctx, args: ReadonlyArray<string>): Promise<number> {
  const { echo, err, verbose, warn } = ctx.services.logger;
  const words = args.filter((arg) => !arg.startsWith("--"));
  const op = words[0] ?? "check";
  const tool = words[1] ?? "";
  for (const arg of args) {
    if (arg === "--verbose") ctx.verbose = true;
    else if (arg === "--dry-run") ctx.dryRun = true;
  }
  if (words.length > (op === "ensure" ? 2 : 1)) {
    err(TOOLCHAIN_USAGE);
    return 2;
  }

  if (op === "check") {
    await report(ctx);
    return 0;
  }
  if (op === "outdated") {
    await outdatedReport(ctx, { refresh: args.includes("--refresh") });
    return 0;
  }
  if (op !== "ensure") {
    err(TOOLCHAIN_USAGE);
    return 2;
  }
  if (tool === "") {
    err("Usage: toolchain ensure <tool>");
    return 2;
  }
  switch (tool) {
    case "bun": {
      // `bun` is the one managed tool, and its bootstrap is silent when Bun is
      // already installed. Probe first so the no-op confirmation the `--verbose`
      // contract promises is not mistaken for a fresh install.
      const alreadyInstalled = present(ctx, "bun");
      if ((await bunBootstrap(ctx, ctx.services)).kind !== "ready") return 1;
      if (alreadyInstalled) {
        // A present tool whose --version cannot be read reports `unknown` in the
        // doctor table; keep the same vocabulary rather than an empty pair of
        // parentheses. `ensure` never upgrades (policy `present`), but a Bun
        // below the kit floor is a real problem, so it warns on every run.
        const probed = await installedVersion(ctx, "bun");
        const floor = field("bun", "floor");
        const label = probed === "" ? "version unknown" : probed;
        if (belowFloor(probed, floor)) {
          warn(`bun ${probed} is below the kit floor ${floor}; run bun upgrade`);
        } else if (ctx.dryRun) echo(`[dry-run] bun present (${label})`);
        else verbose(`bun present (${label})`);
      }
      return 0;
    }
    default:
      err("toolchain ensure supports managed tools only (bun)");
      return 2;
  }
}
