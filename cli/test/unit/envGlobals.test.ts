import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runEngineNative } from "../../src/engine-native";
import { DEPENDENCIES } from "../../src/engine-native/deps";
import {
  makePlatform,
  type DependencyManager,
  type EngineServices,
  type Logger,
} from "../../src/engine-native/services";

interface LogRecord {
  readonly level: "change" | "verbose" | "warn" | "err" | "echo";
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
    spec: (id) => {
      const specification = DEPENDENCIES[id];
      return {
        ...specification,
        installHint: (value = platform.raw()) => specification.installHint(value),
      };
    },
    probe: (id) => ({ state: "present", path: `/stub-bin/${id}` }),
    version: async (id) => (id === "bun" ? "1.4.0" : "0.5.3"),
    versionReading: async (id) => ({ kind: "version", value: id === "bun" ? "1.4.0" : "0.5.3" }),
    path: async (id) => `/stub-bin/${id}`,
    warnMissing: () => {},
  };
  return { logger, deps, platform };
}

const ENV_KEYS = ["HOME", "USERPROFILE", "DRY_RUN", "DOCKS_KIT_VERBOSE"] as const;

describe("engine env globals", () => {
  let root = "";
  let previous = new Map<string, string | undefined>();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "env-globals-"));
    previous = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of ENV_KEYS) delete process.env[key];
    // engineHome reads USERPROFILE on win32, so both keys point at the temp home.
    process.env["HOME"] = root;
    process.env["USERPROFILE"] = root;
  });

  afterEach(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  });

  it("ignores env globals unless the raw channel enables them", async () => {
    process.env["DOCKS_KIT_VERBOSE"] = "1";
    // A dry run changes nothing, so only --verbose prints the restart advice.
    const advice = "Restart omp to load any refreshed plugins, skills, or tools.";

    const publicRecords: Array<LogRecord> = [];
    expect(await runEngineNative(["sync", "--dry-run"], stubServices(publicRecords))).toBe(0);
    expect(publicRecords.some(({ message }) => message === advice)).toBe(false);

    const rawRecords: Array<LogRecord> = [];
    expect(
      await runEngineNative(["sync", "--dry-run"], stubServices(rawRecords), {
        envGlobals: true,
      }),
    ).toBe(0);
    expect(rawRecords.some(({ message }) => message === advice)).toBe(true);
  });

  it("ignores flags when selecting a toolchain operation", async () => {
    const records: Array<LogRecord> = [];

    expect(await runEngineNative(["toolchain", "--verbose", "ensure"], stubServices(records))).toBe(
      2,
    );
    expect(records).toEqual([{ level: "err", message: "Usage: toolchain ensure <tool>" }]);
  });
});
