import { configDefaults, defineConfig } from "vitest/config";
import { TEST_TIMEOUT_MS } from "./cli/test/lib/spawnTimeout";

/**
 * The omp trigger-rule backstop spreads about 70 s of processor time over one
 * child per core. It runs in a later group, so it starts only after every
 * other unit file has ended and does not share the cores with them
 * (DocksDocks/docks-kit#187).
 */
const BACKSTOP_TEST = "cli/test/unit/ompTriggerBackstop.test.ts";

/**
 * The review-benchmark maintainer suite runs its scripts with `sh`, `ps`, `gpg`,
 * and the util-linux `script` command, so it runs on Linux and macOS only
 * (DocksDocks/docks-kit#192).
 */
const REVIEW_BENCHMARK_PROJECTS =
  process.platform === "win32"
    ? []
    : [
        {
          test: {
            name: "review-benchmark",
            include: [".agents/skills/review-benchmark/tests/**/*.test.mjs"],
          },
        },
      ];

export default defineConfig({
  test: {
    // The root global setups run once per run; the projects do not inherit them.
    globalSetup: ["cli/test/lib/sharedCliEntry.ts", "cli/test/lib/rootGuard.ts"],
    // Ceilings and their rationale live in cli/test/lib/spawnTimeout.ts.
    testTimeout: TEST_TIMEOUT_MS,
    projects: [
      {
        test: {
          name: "unit",
          include: ["cli/test/unit/**/*.test.ts"],
          exclude: [...configDefaults.exclude, BACKSTOP_TEST],
        },
      },
      {
        test: {
          name: "backstop",
          include: [BACKSTOP_TEST],
          sequence: { groupOrder: 1 },
        },
      },
      ...REVIEW_BENCHMARK_PROJECTS,
    ],
  },
});
