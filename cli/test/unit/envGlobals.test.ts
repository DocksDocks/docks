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

const ENV_KEYS = [
  "HOME",
  "USERPROFILE",
  "AGENTS_DIR",
  "DRY_RUN",
  "DOCKS_KIT_VERBOSE",
  "DOCKS_KIT_INTERACTIVE",
  "PRUNE",
  "DOCKS_KIT_SYNC_CONCURRENCY",
] as const;

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
    process.env["AGENTS_DIR"] = join(root, ".agents");
  });

  afterEach(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  });

  it("ignores env globals unless the raw channel enables them", async () => {
    process.env["PRUNE"] = "1";
    const mentionsPrune = (records: Array<LogRecord>): boolean =>
      records.some(({ message }) => message.includes("(--prune)"));

    const publicRecords: Array<LogRecord> = [];
    expect(
      await runEngineNative(["sync", "agents", "--dry-run"], stubServices(publicRecords)),
    ).toBe(0);
    expect(mentionsPrune(publicRecords)).toBe(false);

    const rawRecords: Array<LogRecord> = [];
    expect(
      await runEngineNative(["sync", "agents", "--dry-run"], stubServices(rawRecords), {
        envGlobals: true,
      }),
    ).toBe(0);
    expect(mentionsPrune(rawRecords)).toBe(true);
  });

  it("ignores flags when selecting a toolchain operation", async () => {
    const records: Array<LogRecord> = [];

    expect(await runEngineNative(["toolchain", "--verbose", "ensure"], stubServices(records))).toBe(
      2,
    );
    expect(records).toEqual([{ level: "err", message: "Usage: toolchain ensure <tool>" }]);
  });
});
