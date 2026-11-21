import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hostOs } from "../../src/engine-native/os";
import { childEnv } from "../lib/goldenResources";

const REPO_DIR = resolve(import.meta.dirname, "..", "..", "..");
const roots: Array<string> = [];
const WINDOWS_LAUNCHER_APPLIES = hostOs().id === "windows";
const pwshProbe = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", "exit 0"], {
  encoding: "utf8",
});
const pwshExecutable = pwshProbe.status === 0 ? "pwsh" : null;
const launcherSuiteLabel = !WINDOWS_LAUNCHER_APPLIES
  ? "checkout PowerShell launcher source launch (skipped: docks-kit.ps1 is a Windows artifact and does not apply to this host)"
  : pwshExecutable === null
    ? "checkout PowerShell launcher source launch (skipped: docks-kit.ps1 requires a resolvable pwsh interpreter)"
    : "checkout PowerShell launcher source launch";

interface LauncherFixture {
  readonly root: string;
  readonly binDir: string;
}

function launcherFixture(options: {
  readonly binaryName: string;
  readonly checkoutVersion: string | number;
  readonly binary: "bun";
}): LauncherFixture {
  const root = mkdtempSync(join(tmpdir(), "docks-launcher-windows-"));
  roots.push(root);
  const binDir = join(root, "test-bin");
  const distDir = join(root, "cli", "dist");
  mkdirSync(distDir, { recursive: true });
  mkdirSync(join(root, "cli", "src"), { recursive: true });
  mkdirSync(join(root, "node_modules", "effect"), { recursive: true });
  mkdirSync(binDir, { recursive: true });

  copyFileSync(join(REPO_DIR, "docks-kit.ps1"), join(root, "docks-kit.ps1"));
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ version: options.checkoutVersion }, null, 2)}\n`,
  );
  // The fake bun below is a copy of whatever interpreter runs this suite, which
  // on Windows is Node (the `vitest` bin shim is a `.cmd` that calls `node`), so
  // the fake source must use the argv both runtimes define.
  writeFileSync(
    join(root, "cli", "src", "main.ts"),
    'console.log(`source:${process.argv.slice(2).join(" ")}`)\n',
  );
  copyFileSync(process.execPath, join(binDir, "bun.exe"));

  // A leftover binary that an older checkout built in cli/dist: a copy of the
  // test interpreter, stamped as just built, so it is newer than every fixture
  // source and would win any freshness check.
  const binaryPath = join(distDir, options.binaryName);
  copyFileSync(process.execPath, binaryPath);
  const built = new Date();
  utimesSync(binaryPath, built, built);

  return { root, binDir };
}

function runLauncher(
  fixture: LauncherFixture,
  architecture: { readonly native: string; readonly wow64?: string },
  args: ReadonlyArray<string>,
) {
  if (pwshExecutable === null)
    throw new Error("docks-kit.ps1 requires a resolvable pwsh interpreter");
  const literal = (value: string): string => `'${value.replaceAll("'", "''")}'`;
  // Assign the two architecture variables inside the session rather than in the
  // spawn environment: the case under test owns them, and an in-session
  // assignment cannot be dropped or overridden by however the host merges an
  // environment block. `exit $LASTEXITCODE` forwards the launcher's own status.
  const command = [
    `$env:PROCESSOR_ARCHITECTURE=${literal(architecture.native)}`,
    `$env:PROCESSOR_ARCHITEW6432=${literal(architecture.wow64 ?? "")}`,
    `& ${[join(fixture.root, "docks-kit.ps1"), ...args].map(literal).join(" ")}`,
    "exit $LASTEXITCODE",
  ].join("; ");
  return spawnSync(
    pwshExecutable,
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
    {
      encoding: "utf8",
      env: childEnv({
        HOME: fixture.root,
        USERPROFILE: fixture.root,
        BUN_INSTALL: join(fixture.root, ".bun"),
        PATH: [fixture.binDir, process.env.PATH ?? ""].join(delimiter),
      }),
    },
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe.skipIf(!WINDOWS_LAUNCHER_APPLIES || pwshExecutable === null)(launcherSuiteLabel, () => {
  // docks-kit runs through Bun only, so a binary that an older checkout built
  // in cli/dist stays on disk and never runs (plan #195).
  it("runs the checkout source on AMD64 even when a version-matching binary in cli/dist is newer than every source file", () => {
    const runtimeVersion = spawnSync(process.execPath, ["--version"], {
      encoding: "utf8",
    }).stdout.trim();
    const fixture = launcherFixture({
      binaryName: "docks-kit-windows-x64.exe",
      checkoutVersion: runtimeVersion,
      binary: "bun",
    });
    const result = runLauncher(fixture, { native: "AMD64" }, ["probe"]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("source:probe");
    expect(result.stderr).toBe("");
  });

  // A 32-bit shell on an x64 host reports x86 in PROCESSOR_ARCHITECTURE and the
  // native AMD64 in PROCESSOR_ARCHITEW6432; the launcher must read the second.
  it("accepts an x86 process on an AMD64 host (WOW64) and runs the checkout source", () => {
    const fixture = launcherFixture({
      binaryName: "docks-kit-windows-x64.exe",
      checkoutVersion: "checkout-version",
      binary: "bun",
    });
    const result = runLauncher(fixture, { native: "x86", wow64: "AMD64" }, ["probe"]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("source:probe");
    expect(result.stderr).toBe("");
  });

  it.each([
    ["ARM64", "Windows-ARM64"],
    ["x86", "Windows-x86"],
  ])(
    "rejects the injected %s processor architecture before the Bun source fallback",
    (native, hostName) => {
      const fixture = launcherFixture({
        binaryName: "docks-kit-windows-x64.exe",
        checkoutVersion: "checkout-version",
        binary: "bun",
      });
      const result = runLauncher(fixture, { native }, ["probe"]);

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(
        `[docks-kit] unsupported host ${hostName}; docks-kit supports Linux on x64 and arm64, macOS on arm64, and Windows on x64.`,
      );
    },
  );
});
