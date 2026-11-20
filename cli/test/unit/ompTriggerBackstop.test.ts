/**
 * Runs `ompTriggerBackstop.ts`, the Bun backstop for the linear time of the
 * conditions of the kit's omp trigger rules (plan DocksDocks/public#187). It
 * runs the measured input families under Bun, because V8 hides the
 * JavaScriptCore cost that froze omp. `ompTriggerRules.test.ts` holds the rule
 * tables and the shape guard.
 *
 * The backstop needs about 70 s of processor time and spreads it over one
 * child per core. While it shared the cores with the other unit files, a slow
 * runner took it past its timeout although every check passed
 * (DocksDocks/docks-kit#187). So `vitest.config.ts` puts this file in its own
 * project, which starts after every other unit file has ended.
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { BUN_RUNTIME } from "../lib/cliEntry";
import { SPAWN_TIMEOUT_MS } from "../lib/spawnTimeout";

const BACKSTOP_SCRIPT = fileURLToPath(new URL("../lib/ompTriggerBackstop.ts", import.meta.url));
/**
 * The rewritten rules pass in about 3 s and the old rules fail in about 20 s
 * on a developer machine, and the backstop alone took 18 s on 4 of its cores;
 * the rest is room for a slow runner.
 */
const BACKSTOP_TIMEOUT_MS = 2 * SPAWN_TIMEOUT_MS;
/** Time left after the script's own timeout to report its output. */
const BACKSTOP_REPORT_MS = 5_000;
/** JavaScriptCore reads this option at start-up; `0` turns the regex JIT off. */
const REGEX_JIT_ENV = "BUN_JSC_useRegExpJIT";

describe("ompTriggerBackstop.ts", () => {
  /** One backstop run, from a test environment that turns the regex JIT off. */
  let run: SpawnSyncReturns<string>;

  beforeAll(() => {
    // The backstop runs its budget and fire checks in its own process, and
    // omp pays that cost with the regex JIT on, so the test removes the
    // option. Each scaling child sets its own mode.
    const env = Object.fromEntries(
      Object.entries({ ...process.env, [REGEX_JIT_ENV]: "0" }).filter(
        ([name]) => name !== REGEX_JIT_ENV,
      ),
    );
    run = spawnSync(BUN_RUNTIME, [BACKSTOP_SCRIPT], {
      encoding: "utf8",
      env,
      timeout: BACKSTOP_TIMEOUT_MS - BACKSTOP_REPORT_MS,
    });
  }, BACKSTOP_TIMEOUT_MS);

  it("keeps every condition within budget, firing, and at 64 KB within 8 times its 16 KB time plus 15 ms under JavaScriptCore", () => {
    const failures = run.stdout.split("\n").filter((line) => line.startsWith("FAIL"));
    expect(failures).toEqual([]);
    expect(run.status, `${run.error?.message ?? ""}\n${run.stdout}${run.stderr}`).toBe(0);
  });

  it(`runs the budget and fire checks with the regex JIT on when the test environment has ${REGEX_JIT_ENV}=0, and refuses that option when run directly`, () => {
    const refusal = `FAIL budget and fire: ${REGEX_JIT_ENV} is 0, so the regex JIT is off`;
    expect(run.stdout).not.toContain(refusal);
    expect(run.status, `${run.error?.message ?? ""}\n${run.stdout}${run.stderr}`).toBe(0);
    const direct = spawnSync(BUN_RUNTIME, [BACKSTOP_SCRIPT], {
      encoding: "utf8",
      env: { ...process.env, [REGEX_JIT_ENV]: "0" },
      timeout: SPAWN_TIMEOUT_MS,
    });
    expect(direct.stdout.trim().split("\n")).toEqual([
      `${refusal}. Run this script without ${REGEX_JIT_ENV}: each scaling child sets its own regex JIT mode.`,
    ]);
    expect(direct.status).toBe(1);
  });
});
