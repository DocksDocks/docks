import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { runPublicCli } from "../lib/goldenExecution";
import {
  FIXTURES_DIR,
  cleanupTemporaryDirs,
  makeStubDir,
  temporaryDir,
} from "../lib/goldenResources";
import { SPAWN_TIMEOUT_MS } from "../lib/spawnTimeout";

afterAll(cleanupTemporaryDirs);

/**
 * The 18 overrides that the kit shipped until the owner returned them to the
 * omp 19.0.0 defaults, each at the value that the kit deployed. The user
 * changed `task.maxConcurrency` from the shipped `16` to `8`, so sync must keep
 * it.
 */
const DEPLOYED_CONFIG = `statusLine:
  compactThinkingLevel: false
github:
  enabled: true
find:
  enabled: true
browser:
  idleCloseSec: 600
task:
  eager: always
  showResolvedModelBadge: true
  enableLsp: true
  maxEffort: xhigh
  maxConcurrency: 8
  maxRuntimeMs: 3600000
  agentIdleTtlMs: 120000
providers:
  webSearchTimeoutSeconds: 30
commands:
  enableOpencodeProject: false
steeringMode: all
compaction:
  idleEnabled: true
  handoffSaveToDisk: true
doubleEscapeAction: tree
features:
  unexpectedStopDetection: smart
`;

/** The 17 keys that still hold the shipped value, so sync prunes each one. */
const UNEDITED_KEYS = [
  "statusLine.compactThinkingLevel",
  "github.enabled",
  "find.enabled",
  "browser.idleCloseSec",
  "task.eager",
  "task.showResolvedModelBadge",
  "task.enableLsp",
  "task.maxEffort",
  "task.maxRuntimeMs",
  "task.agentIdleTtlMs",
  "providers.webSearchTimeoutSeconds",
  "commands.enableOpencodeProject",
  "steeringMode",
  "compaction.idleEnabled",
  "compaction.handoffSaveToDisk",
  "doubleEscapeAction",
  "features.unexpectedStopDetection",
];

function valueAt(root: unknown, path: string): unknown {
  let node = root;
  for (const segment of path.split(".")) {
    if (typeof node !== "object" || node === null || !Object.hasOwn(node, segment)) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

/** A copy of the `home-fresh` fixture with the deployed omp config.yml added. */
function seededHome(): string {
  const home = temporaryDir("omp-retired-home-");
  cpSync(join(FIXTURES_DIR, "home-fresh"), home, { recursive: true });
  const agentDir = join(home, ".omp", "agent");
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, "config.yml"), DEPLOYED_CONFIG);
  return home;
}

describe("public sync over a config.yml from an earlier kit", () => {
  it(
    "prunes the 17 unedited returned overrides, keeps the edited one, and turns on the new tools",
    () => {
      // The native host pairing puts the omp stub first on PATH in a form that
      // the host runs (`omp.cmd` on Windows), so the plugin steps find it.
      const nativeHost = { nativeHost: true } as const;
      const run = runPublicCli(["sync"], "home-fresh", makeStubDir({}, nativeHost), {
        ...nativeHost,
        reuseHome: seededHome(),
      });

      expect(run.exitCode, run.stderr).toBe(0);
      const pruneLines = `${run.stdout}${run.stderr}`
        .split("\n")
        .filter((line) => line.includes("omp config.yml pruned"));
      expect(pruneLines).toHaveLength(1);
      const match = /pruned 17 retired entr\(ies\): (.+?)(?: \(backup at [^)]*\))?$/.exec(
        pruneLines[0] ?? "",
      );
      expect(match?.[1]?.split(", ").sort()).toEqual([...UNEDITED_KEYS].sort());

      const config: unknown = parse(
        readFileSync(join(run.home, ".omp", "agent", "config.yml"), "utf8"),
      );
      expect(UNEDITED_KEYS.filter((path) => valueAt(config, path) !== undefined)).toEqual([]);
      expect(valueAt(config, "task.maxConcurrency")).toBe(8);
      expect(valueAt(config, "astGrep.enabled")).toBe(true);
      expect(valueAt(config, "checkpoint.enabled")).toBe(true);
    },
    SPAWN_TIMEOUT_MS,
  );
});
