/// <reference types="bun" />

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { COMPILE_FLAGS, targetForHost } from "../src/engine-native/os/targets";

const REPO_DIR = resolve(import.meta.dirname, "..", "..");
const DIST_DIR = join(REPO_DIR, "cli", "dist");
/** JavaScriptCore logs each bytecode cache lookup when this variable is 1. */
const BYTECODE_LOG_ENV = "BUN_JSC_verboseDiskCache";
/** The line that the binary prints when it runs its embedded bytecode. */
const BYTECODE_HIT = "[Disk Cache] Cache hit for sourceCode";

function fail(message: string): never {
  throw new Error(message);
}

/**
 * Runs `<artifact> --version` with `BUN_JSC_verboseDiskCache=1`, and gives the
 * cache-hit line that shows the run used the embedded bytecode. Throws without
 * that line: a Bun that rejects the bytecode parses the source again without
 * an error, so only this log line shows it.
 */
function requireBytecode(artifactPath: string): string {
  const run = spawnSync(artifactPath, ["--version"], {
    cwd: REPO_DIR,
    encoding: "utf8",
    env: { ...process.env, [BYTECODE_LOG_ENV]: "1" },
  });
  requireSuccess(`native --version with ${BYTECODE_LOG_ENV}=1`, run);
  const hit = `${run.stdout}\n${run.stderr}`
    .split(/\r?\n/)
    .find((line) => line.includes(BYTECODE_HIT));
  if (hit === undefined) {
    fail(
      `native binary ran without its embedded bytecode: no "${BYTECODE_HIT}" line with ${BYTECODE_LOG_ENV}=1; check that COMPILE_FLAGS in cli/src/engine-native/os/targets.ts holds --bytecode and that the Bun that compiled the binary also runs it`,
    );
  }
  return hit.trim();
}

function requireSuccess(label: string, result: SpawnSyncReturns<string>): void {
  if (result.error) {
    fail(`${label} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    const status = result.signal ? `signal ${result.signal}` : `exit ${result.status ?? "unknown"}`;
    fail(`${label} failed with ${status}${output ? `:\n${output}` : ""}`);
  }
}

function main(): void {
  const target = targetForHost(process.platform, process.arch);
  if (!target) {
    fail(`unsupported native smoke host: ${process.platform}/${process.arch}`);
  }
  console.log(`[native-smoke] target: ${target.id}`);

  mkdirSync(DIST_DIR, { recursive: true });
  const artifactPath = join(DIST_DIR, target.artifact);
  const build = spawnSync(
    "bun",
    [
      "build",
      ...COMPILE_FLAGS,
      `--target=${target.bunTarget}`,
      join(REPO_DIR, "cli", "src", "main.ts"),
      "--outfile",
      artifactPath,
    ],
    { cwd: REPO_DIR, encoding: "utf8" },
  );
  requireSuccess("native compile", build);
  console.log(`[native-smoke] compile: ${target.artifact}`);
  checkBinary(artifactPath);
}

/**
 * The checks of `smoke:native` on a compiled binary, in order: it ran its
 * embedded bytecode, its `--version` equals `package.json`, and `sync
 * --dry-run` exits 0 on this host. Each failed check throws its diagnostic.
 */
function checkBinary(artifactPath: string): void {
  console.log(`[native-smoke] bytecode: ${requireBytecode(artifactPath)}`);

  const packageJson = JSON.parse(readFileSync(join(REPO_DIR, "package.json"), "utf8")) as {
    version: string;
  };
  const versionRun = spawnSync(artifactPath, ["--version"], {
    cwd: REPO_DIR,
    encoding: "utf8",
  });
  requireSuccess("native --version", versionRun);
  const reportedVersion = versionRun.stdout.replace(/[\r\n]+$/, "");
  if (reportedVersion !== packageJson.version) {
    fail(
      `native --version mismatch: expected ${packageJson.version}, received ${JSON.stringify(reportedVersion)}`,
    );
  }
  console.log(`[native-smoke] version: ${reportedVersion}`);

  const temporaryHome = mkdtempSync(join(tmpdir(), "docks-kit-native-smoke-"));
  try {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: temporaryHome,
      USERPROFILE: temporaryHome,
    };
    delete env.BUN_OPTIONS;
    delete env.DOCKS_KIT_ENGINE;
    delete env.NODE_OPTIONS;

    const dryRun = spawnSync(artifactPath, ["sync", "--dry-run"], {
      cwd: REPO_DIR,
      encoding: "utf8",
      env,
    });
    requireSuccess("native sync --dry-run", dryRun);
    const output = `${dryRun.stdout}\n${dryRun.stderr}`;
    if (/unsupported host/i.test(output)) {
      fail("native sync --dry-run reported an unsupported host");
    }
    console.log(`[native-smoke] dry-run: exit ${dryRun.status}`);
  } finally {
    rmSync(temporaryHome, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(`[native-smoke] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
