import {
  cpSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { hostOs } from "../../src/engine-native/os/index";
import { floorVersion } from "../lib/toolchainManifest";

const REPO_DIR = resolve(import.meta.dirname, "..", "..", "..");
const BUN_FLOOR = floorVersion("bun");
const CURRENT_VERSION = (
  JSON.parse(readFileSync(join(REPO_DIR, "package.json"), "utf8")) as { version: string }
).version;
const roots: Array<string> = [];
const currentHost = hostOs().id;
const POSIX_LAUNCHER_APPLIES = currentHost === "linux" || currentHost === "darwin";
const launcherSuiteLabel = POSIX_LAUNCHER_APPLIES
  ? "checkout launcher source launch"
  : "checkout launcher source launch (skipped: docks-kit is a POSIX artifact and does not apply to this host)";

function launcherFixture(
  binaryName: string,
  binaryVersion: string | null,
  bunVersion = BUN_FLOOR,
  dependenciesInstalled = true,
): { root: string; binDir: string } {
  const root = mkdtempSync(join(tmpdir(), "docks-launcher-"));
  roots.push(root);
  const binDir = join(root, "test-bin");
  mkdirSync(join(root, "cli", "dist"), { recursive: true });
  mkdirSync(join(root, "cli", "src"), { recursive: true });
  if (dependenciesInstalled) mkdirSync(join(root, "node_modules", "effect"), { recursive: true });
  mkdirSync(binDir, { recursive: true });
  cpSync(join(REPO_DIR, "docks-kit"), join(root, "docks-kit"));
  cpSync(join(REPO_DIR, "package.json"), join(root, "package.json"));
  chmodSync(join(root, "docks-kit"), 0o755);
  writeFileSync(join(root, "cli", "src", "main.ts"), "// launcher test fixture\n");

  const binary = join(root, "cli", "dist", binaryName);
  const versionProbe = binaryVersion === null ? ":" : `printf '%s\\n' '${binaryVersion}'`;
  writeFileSync(
    binary,
    `#!/bin/bash
if [[ "\${1:-}" == "--version" ]]; then
  ${versionProbe}
else
  printf 'compiled:%s\\n' "$*"
fi
`,
  );
  chmodSync(binary, 0o755);

  const bun = join(binDir, "bun");
  writeFileSync(
    bun,
    `#!/bin/bash
if [[ "\${1:-}" == "--version" ]]; then
  printf '%s\\n' '${bunVersion}'
elif [[ "\${2:-}" == "--version" ]]; then
  printf '%s\\n' '${CURRENT_VERSION}'
else
  shift
  printf 'source:%s\\n' "$*"
fi
`,
  );
  chmodSync(bun, 0o755);

  const uname = join(binDir, "uname");
  writeFileSync(
    uname,
    `#!/bin/bash
case "\${1:-}" in
  -s) printf '%s\\n' "\${FAKE_UNAME_S}" ;;
  -m) printf '%s\\n' "\${FAKE_UNAME_M}" ;;
  *) exit 2 ;;
esac
`,
  );
  chmodSync(uname, 0o755);
  return { root, binDir };
}

function runLauncher(
  fixture: { root: string; binDir: string },
  uname: { system: string; machine: string },
  args: ReadonlyArray<string>,
) {
  return spawnSync("bash", [join(fixture.root, "docks-kit"), ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: fixture.root,
      PATH: `${fixture.binDir}${delimiter}${process.env.PATH ?? ""}`,
      FAKE_UNAME_S: uname.system,
      FAKE_UNAME_M: uname.machine,
    },
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe.skipIf(!POSIX_LAUNCHER_APPLIES)(launcherSuiteLabel, () => {
  it.each([BUN_FLOOR, "1.10.0", "2.0.0", `${BUN_FLOOR}-canary.1+build`, "unparseable"])(
    "accepts Bun %s before installing checkout dependencies",
    (bunVersion) => {
      const fixture = launcherFixture("docks-kit-linux-x64", null, bunVersion, false);
      const result = runLauncher(fixture, { system: "Linux", machine: "x86_64" }, ["probe"]);

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("source:probe");
      expect(result.stderr).toContain("Installing CLI dependencies");
    },
  );

  it("rejects Bun below the floor before installing checkout dependencies", () => {
    const fixture = launcherFixture("docks-kit-linux-x64", null, "1.3.14\r", false);
    const result = runLauncher(fixture, { system: "Linux", machine: "x86_64" }, ["probe"]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(`Bun 1.3.14 is below the required floor ${BUN_FLOOR}`);
    expect(result.stderr).toContain(`checkout's lockfile requires Bun ${BUN_FLOOR} or newer`);
    expect(result.stderr).toContain("Run: bun upgrade");
    expect(result.stderr).not.toContain("Installing CLI dependencies");
  });

  it("compares installed Bun against the floor rather than the verified install pin", () => {
    const fixture = launcherFixture("docks-kit-linux-x64", null, BUN_FLOOR, false);
    const launcherPath = join(fixture.root, "docks-kit");
    const launcher = readFileSync(launcherPath, "utf8");
    const rewrittenLauncher = launcher.replace(/^BUN_PIN="[^"]*"$/m, 'BUN_PIN="9.0.0"');
    expect(rewrittenLauncher).toContain('BUN_PIN="9.0.0"');
    writeFileSync(launcherPath, rewrittenLauncher);

    const result = runLauncher(fixture, { system: "Linux", machine: "x86_64" }, ["probe"]);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("source:probe");
  });

  // docks-kit runs through Bun only, so a binary that an older checkout built
  // in cli/dist stays on disk and never runs (plan #195).
  it("runs the checkout source even when a version-matching binary in cli/dist is newer than every source file", () => {
    const fixture = launcherFixture("docks-kit-linux-x64", CURRENT_VERSION);

    const result = runLauncher(fixture, { system: "Linux", machine: "x86_64" }, ["probe"]);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("source:probe");
    expect(result.stderr).toBe("");
  });

  it.each([
    ["Darwin", "x86_64"],
    ["MINGW64_NT-10.0-19045", "x86_64"],
    ["Linux", "i686"],
    ["FreeBSD", "x86_64"],
  ])("rejects unsupported %s-%s before the Bun source fallback", (system, machine) => {
    const fixture = launcherFixture("docks-kit-linux-x64", CURRENT_VERSION);
    const result = runLauncher(fixture, { system, machine }, ["probe"]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe(
      `[docks-kit] unsupported host ${system}-${machine}; docks-kit supports Linux on x64 and arm64, macOS on arm64, and Windows on x64 - on Windows run docks-kit.ps1 instead.`,
    );
  });
});
