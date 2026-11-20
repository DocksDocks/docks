import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runBounded, runEngineNative } from "../../src/engine-native";
import { makeEngineServices } from "../../src/engine-native/services";

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

describe("native CLI argument and output behavior", () => {
  async function withIsolatedHome(run: (home: string) => Promise<void>): Promise<void> {
    const home = mkdtempSync(join(tmpdir(), "engine-di-"));
    const keys = ["HOME", "USERPROFILE", "DOCKS_KIT_HOME", "DRY_RUN", "DOCKS_KIT_VERBOSE"] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]])) as Record<
      (typeof keys)[number],
      string | undefined
    >;
    try {
      for (const key of keys) delete process.env[key];
      // engineHome reads USERPROFILE on win32, so both keys point at the temp home.
      process.env["HOME"] = home;
      process.env["USERPROFILE"] = home;
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

  it("lists the global flags in sync help and no sync target", async () => {
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
      expect(help).toContain("Usage: docks-kit sync [flags]");
      for (const flag of ["--dry-run", "--skip-plugin-refresh", "--verbose"]) {
        expect(help).toContain(flag);
      }
      for (const removed of ["agents", "--prune", "claude"]) expect(help).not.toContain(removed);
      expect(stderr).toEqual([]);
    });
  });
});
