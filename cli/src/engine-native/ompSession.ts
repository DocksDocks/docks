/**
 * The omp session model that `docks-kit omp` stores in ~/.docks-kit/kit.db
 * (kitDb.ts), and the engine home root that locates the kit store.
 */
import { homedir } from "node:os";

import { isNonBlankString, nonBlankOrNull, withKitDb } from "./kitDb";
import type { OmpSessionModel } from "./sharedTypes";

export type { OmpSessionModel };

export const DEFAULT_OMP_SESSION_MODEL: OmpSessionModel = {
  selector: "opencode-zen/muse-spark-1.3-contributor-free",
  thinking: "xhigh",
};

/**
 * Resolve the engine home root the way the harness resolves `~`. On Windows,
 * USERPROFILE applies and HOME is ignored. Elsewhere, HOME applies. The
 * platform home is the fallback.
 */
export function engineHome(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const home = platform === "win32" ? env["USERPROFILE"] : env["HOME"];
  return home !== undefined && home !== "" ? home : homedir();
}

// Read the stored session model without throwing so a corrupt store falls
// back to the default instead of breaking sync.
export function readOmpSessionModel(home: string): OmpSessionModel | undefined {
  try {
    return withKitDb(home, "read", (db) => {
      const row = db.prepare("SELECT selector, thinking FROM omp_session WHERE id = 1").get();
      const selector = row?.["selector"];
      if (!isNonBlankString(selector)) return undefined;
      const thinking = row?.["thinking"];
      const model: OmpSessionModel = {
        selector,
        ...(isNonBlankString(thinking) ? { thinking } : {}),
      };
      return model;
    });
  } catch {
    return undefined;
  }
}

export function writeOmpSessionModel(home: string, model: OmpSessionModel): void {
  // A blank selector would make omp resolve an arbitrary model, so reject it
  // before anything reaches disk.
  if (!isNonBlankString(model.selector)) {
    throw new Error("Omp session model selector must be a non-empty string");
  }
  // Store a blank or absent level as NULL so a switch to a level-free model
  // leaves no stale level behind.
  const thinking = nonBlankOrNull(model.thinking);
  withKitDb(home, "write", (db) =>
    db
      .prepare(
        `INSERT INTO omp_session (id, selector, thinking) VALUES (1, ?, ?)
ON CONFLICT(id) DO UPDATE SET selector = excluded.selector, thinking = excluded.thinking`,
      )
      .run(model.selector, thinking),
  );
}
