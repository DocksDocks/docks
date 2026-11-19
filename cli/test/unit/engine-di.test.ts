import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runBounded, runEngineNative } from "../../src/engine-native";
import { p } from "../../src/engine-native/exec";
import { DEPENDENCIES } from "../../src/engine-native/deps";
import type { Ctx } from "../../src/engine-native";
import {
  makeEngineServices,
  makePlatform,
  type DependencyManager,
  type EngineServices,
  type Logger,
} from "../../src/engine-native/services";
import { skillsNextSteps, skillsSummary } from "../../src/engine-native/skillsSync";
import { kitHome } from "../../src/kitHome";

type LogLevel = "change" | "verbose" | "warn" | "err" | "echo";
interface LogRecord {
  readonly level: LogLevel;
  readonly message: string;
}

function stubServices(records: Array<LogRecord>): EngineServices {
  const logger: Logger = {
    change: (message) => void records.push({ level: "change", message }),
    progress: () => {},
    clearProgress: () => {},
    verbose: (message) => void records.push({ level: "verbose", message }),
    warn: (message) => void records.push({ level: "warn", message }),
    err: (message) => void records.push({ level: "err", message }),
    echo: (message) => void records.push({ level: "echo", message }),
    acquireTerminal: () => ({
      update: () => {},
      withExclusive: async (action) => await action(),
      release: () => {},
    }),
  };
  const platform = makePlatform("linux");
  const deps: DependencyManager = {
    spec: (id) => DEPENDENCIES[id],
    probe: (id) => ({ state: "present", path: `/stub-bin/${id}` }),
    version: async () => "",
    versionReading: async () => ({ kind: "version", value: "" }),
    path: async (id) => `/stub-bin/${id}`,
    warnMissing: () => {},
  };
  return { logger, deps, platform };
}

function summaryCtx(home: string, records: Array<LogRecord>): Ctx {
  return {
    repoDir: kitHome(),
    home,
    agentsDir: p(home, ".agents"),
    interactive: false,
    dryRun: false,
    verbose: true,
    prune: false,
    syncConcurrency: 3,
    services: stubServices(records),
    targetFilterSet: true,
    syncAgents: true,
    syncOmp: false,
    nextStepTriggers: {
      skillsRestart: false,
      ompRestart: false,
      ompPluginUpgraded: false,
    },
    failures: [],
  };
}

describe("sync pipeline coordinator", () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    return { promise, resolve, reject };
  }

  it("caps overlap and returns results in selection order", async () => {
    const names = ["first", "second", "third"] as const;
    const controls = names.map(() => deferred<string>());
    const thirdStarted = deferred<void>();
    const started: Array<string> = [];
    let active = 0;
    let maxActive = 0;
    const run = runBounded(
      names.map((name, index) => async () => {
        started.push(name);
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (index === 2) thirdStarted.resolve();
        const result = await controls[index]!.promise;
        active -= 1;
        return result;
      }),
      2,
    );
    expect(started).toEqual(["first", "second"]);
    controls[1]!.resolve("second-result");
    await thirdStarted.promise;
    expect(active).toBe(2);
    controls[0]!.resolve("first-result");
    controls[2]!.resolve("third-result");
    await expect(run).resolves.toEqual(["first-result", "second-result", "third-result"]);
    expect(maxActive).toBe(2);
  });

  it("runs the next pipeline only after the prior one settles at cap one", async () => {
    const first = deferred<number>();
    const secondStarted = deferred<void>();
    const started: Array<string> = [];
    const run = runBounded(
      [
        async () => {
          started.push("first");
          return await first.promise;
        },
        async () => {
          started.push("second");
          secondStarted.resolve();
          return 2;
        },
      ],
      1,
    );
    expect(started).toEqual(["first"]);
    first.resolve(1);
    await secondStarted.promise;
    await expect(run).resolves.toEqual([1, 2]);
  });

  it("drains started pipelines, stops queued work, and reports the first input failure", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const firstFailure = new Error("first failed");
    let queued = false;
    const run = runBounded(
      [
        async () => await first.promise,
        async () => await second.promise,
        async () => {
          queued = true;
          return "should not run";
        },
      ],
      2,
    );
    const result = expect(run).rejects.toBe(firstFailure);
    second.reject(new Error("second failed"));
    first.reject(firstFailure);
    await result;
    expect(queued).toBe(false);
  });
});

describe("skills sync summary", () => {
  it("reports the installed count only for a real sync and advises a restart after changes", () => {
    const records: Array<LogRecord> = [];
    const ctx = summaryCtx("/fixture-home", records);
    ctx.verbose = false;

    skillsSummary(ctx, { present: 2 });
    expect(records.filter(({ level }) => level === "echo")).toEqual([
      { level: "echo", message: `Skills:   ${p(ctx.agentsDir, "skills")}` },
      { level: "echo", message: "          2 universal skill(s) installed" },
    ]);
    expect(skillsNextSteps(ctx)).toEqual([]);

    ctx.nextStepTriggers.skillsRestart = true;
    expect(skillsNextSteps(ctx)).toEqual([
      "Restart Claude Code to discover newly installed universal skills.",
    ]);
    ctx.dryRun = true;
    records.length = 0;
    skillsSummary(ctx, { present: 2 });
    expect(records.filter(({ level }) => level === "echo")).toEqual([
      { level: "echo", message: `Skills:   ${p(ctx.agentsDir, "skills")}` },
    ]);
  });
});

describe("native CLI argument and output behavior", () => {
  async function withIsolatedHome(run: (home: string) => Promise<void>): Promise<void> {
    const home = mkdtempSync(join(tmpdir(), "engine-di-"));
    const keys = [
      "HOME",
      "USERPROFILE",
      "AGENTS_DIR",
      "DOCKS_KIT_HOME",
      "DRY_RUN",
      "DOCKS_KIT_VERBOSE",
      "DOCKS_KIT_INTERACTIVE",
      "DOCKS_KIT_SYNC_CONCURRENCY",
      "PRUNE",
    ] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]])) as Record<
      (typeof keys)[number],
      string | undefined
    >;
    try {
      for (const key of keys) delete process.env[key];
      // engineHome reads USERPROFILE on win32, so both keys point at the temp home.
      process.env["HOME"] = home;
      process.env["USERPROFILE"] = home;
      process.env["AGENTS_DIR"] = p(home, ".agents");
      process.env["DOCKS_KIT_INTERACTIVE"] = "0";
      await run(home);
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(home, { recursive: true, force: true });
    }
  }

  it("lists the agents and omp targets and the global flags in sync help", async () => {
    await withIsolatedHome(async () => {
      const stdout: Array<string> = [];
      const stderr: Array<string> = [];
      const services = makeEngineServices({
        sinks: {
          stdout: (chunk) => void stdout.push(chunk),
          stderr: (chunk) => void stderr.push(chunk),
        },
      });
      expect(await runEngineNative(["sync", "--help"], services)).toBe(0);
      const help = stdout.join("");
      expect(help).toContain("Usage: docks-kit sync [agents] [omp] [flags]");
      for (const flag of ["--dry-run", "--prune", "--skip-plugin-refresh", "--verbose"]) {
        expect(help).toContain(flag);
      }
      expect(help).not.toContain("claude");
      expect(stderr).toEqual([]);
    });
  });
});
