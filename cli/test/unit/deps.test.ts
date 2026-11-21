import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it, vi } from "vitest";
import {
  DEPENDENCIES,
  resolvePath,
  resolveVersion,
  resolveVersionReading,
  VERSION_PROBE_LIMIT_MS,
  type ProbeExecutor,
} from "../../src/engine-native/deps";
import { capture, which, type CaptureOutcome } from "../../src/engine-native/exec";
import {
  makeDependencyManager,
  makeEngineServices,
  makePlatform,
} from "../../src/engine-native/services";

describe("DependencyManager registry", () => {
  it("captures successful stdout and strips only trailing newlines", async () => {
    await expect(
      capture(process.execPath, ["-e", 'process.stdout.write(" kept  \\r\\n\\n")']),
    ).resolves.toBe(" kept  ");
  });

  it("returns empty output for a non-zero exit", async () => {
    await expect(
      capture(process.execPath, ["-e", 'process.stdout.write("discarded"); process.exitCode = 7']),
    ).resolves.toBe("");
  });

  it("returns empty output for a spawn error", async () => {
    await expect(capture("docks-kit-command-that-does-not-exist", [])).resolves.toBe("");
  });

  it("returns empty output when spawn rejects invalid arguments synchronously", async () => {
    await expect(capture("\0", [])).resolves.toBe("");
  });

  it("resolves bare POSIX tools and Windows command shims from a real PATH directory", () => {
    const directory = mkdtempSync(join(tmpdir(), "docks-exec-"));
    const previousPath = process.env["PATH"];
    const posixTool = join(directory, "docks-posix-tool");
    const windowsTool = join(directory, "docks-windows-tool.cmd");
    const firstWindowsTool = join(directory, "docks-windows-first.exe");
    const laterWindowsTool = join(directory, "docks-windows-first.cmd");
    try {
      writeFileSync(posixTool, "#!/bin/sh\nexit 0\n");
      chmodSync(posixTool, 0o755);
      writeFileSync(windowsTool, "@echo off\r\n");
      chmodSync(windowsTool, 0o644);
      writeFileSync(firstWindowsTool, "");
      writeFileSync(laterWindowsTool, "");
      chmodSync(firstWindowsTool, 0o644);
      chmodSync(laterWindowsTool, 0o644);
      process.env["PATH"] = directory;

      expect(which("docks-posix-tool", [""])).toBe(posixTool);
      expect(which("docks-windows-tool", [".exe", ".cmd", ".bat", ""])).toBe(windowsTool);
      expect(which(join(directory, "docks-windows-tool"), [".exe", ".cmd", ".bat", ""])).toBe(
        windowsTool,
      );
      expect(which("docks-windows-first", [".exe", ".cmd", ".bat", ""])).toBe(firstWindowsTool);
    } finally {
      if (previousPath === undefined) delete process.env["PATH"];
      else process.env["PATH"] = previousPath;
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("splits a Windows PATH on semicolons outside quotes and strips one quote pair", () => {
    const directory = mkdtempSync(join(tmpdir(), "docks-exec-"));
    const previousPath = process.env["PATH"];
    const windowsTool = join(directory, "docks-windows-tool.cmd");
    const posixTool = join(directory, "docks-posix-tool");
    const semicolonDirectory = join(directory, "Tools;WithSemicolon");
    const semicolonTool = join(semicolonDirectory, "docks-semicolon-tool.exe");
    try {
      writeFileSync(windowsTool, "@echo off\r\n");
      writeFileSync(posixTool, "#!/bin/sh\nexit 0\n");
      chmodSync(posixTool, 0o755);
      mkdirSync(semicolonDirectory);
      writeFileSync(semicolonTool, "");
      const quoted = [`"${semicolonDirectory}"`, `"${directory}"`, "/docks-missing-dir"];
      process.env["PATH"] = quoted.join(";");

      expect(which("docks-semicolon-tool", [".exe", ".cmd", ".bat", ""])).toBe(semicolonTool);
      expect(which("docks-windows-tool", [".exe", ".cmd", ".bat", ""])).toBe(windowsTool);
      process.env["PATH"] = [`"${directory}"`, "/docks-missing-dir"].join(delimiter);
      expect(which("docks-posix-tool", [""])).toBe("");
    } finally {
      if (previousPath === undefined) delete process.env["PATH"];
      else process.env["PATH"] = previousPath;
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("preserves a resolved Windows shim path in dependency probes", async () => {
    const executable = "C:/tools/npm.cmd";
    const exec: ProbeExecutor = {
      commandExists: () => true,
      capture: async () => "",
      which: (name) => (name === "npm" ? executable : ""),
    };

    await expect(resolvePath(DEPENDENCIES.npm, exec, "win32")).resolves.toBe(executable);
  });

  it("gives an executable Linux git hint", () => {
    expect(DEPENDENCIES.git.installHint("linux")).toBe(
      "sudo apt install -y git (or your distro's package manager)",
    );
  });

  it("gives a pinned download-then-run Bun hint on every host", () => {
    const toolchain = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "..", "..", "..", "SoT", "toolchain.json"), "utf8"),
    ) as { tools: { bun: { verified: string } } };
    const pin = toolchain.tools.bun.verified;
    const posixHint = `tmp=$(mktemp -d) && curl -fsSL https://bun.sh/install -o "$tmp/install.sh" && bash "$tmp/install.sh" bun-v${pin}`;

    expect(DEPENDENCIES.bun.installHint("linux")).toBe(posixHint);
    expect(DEPENDENCIES.bun.installHint("darwin")).toBe(posixHint);
    expect(DEPENDENCIES.bun.installHint("win32")).toBe(
      `curl.exe -fsSL https://bun.sh/install.ps1 -o "$env:TEMP/install.ps1"; if ($LASTEXITCODE -eq 0) { powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$env:TEMP/install.ps1" -Version ${pin} }`,
    );
    for (const platform of ["linux", "darwin", "win32"] as const) {
      const hint = DEPENDENCIES.bun.installHint(platform);
      expect(hint, platform).toContain(pin);
      expect(hint, platform).toContain("https://bun.sh/install");
      expect(hint, platform).not.toMatch(/\|\s*(?:bash|sh|iex)\b/);
    }
  });

  it("directs users to Node.js when an npm-installed kit cannot find npm", () => {
    const warnings: Array<string> = [];
    const manager = makeDependencyManager(makePlatform("linux"));
    const logger = makeEngineServices({
      sinks: { stderr: (chunk) => void warnings.push(stripVTControlCharacters(chunk)) },
    }).logger;

    manager.warnMissing("npm", logger, "skipping the npm-global update");

    expect(warnings).toEqual([
      "[warn] npm not installed — ships with Node.js — install via https://nodejs.org (or your package manager) (skipping the npm-global update)\n",
    ]);
  });

  it("gives platform-correct jq hints", () => {
    expect(DEPENDENCIES.jq.installHint("darwin")).toBe("brew install jq");
    expect(DEPENDENCIES.jq.installHint("linux")).toBe("sudo apt install -y jq");
  });

  it("does not capture a Bun version when Bun is absent", async () => {
    const captureFn = vi.fn(async () => "");
    const exec: ProbeExecutor = {
      commandExists: () => false,
      capture: captureFn,
      which: () => "",
    };
    const version = DEPENDENCIES.bun.version;
    if (version === undefined) throw new Error("Bun version probe is not registered");

    await expect(version(exec, "linux")).resolves.toBe("");
    expect(captureFn).not.toHaveBeenCalled();
  });

  it("uses the resolved BUN_INSTALL executable for the Bun version probe", async () => {
    const previousHome = process.env["HOME"];
    const previousBunInstall = process.env["BUN_INSTALL"];
    const calls: Array<[string, ReadonlyArray<string>]> = [];
    try {
      process.env["HOME"] = "/fixture-home";
      process.env["BUN_INSTALL"] = "/custom-bun";
      const manager = makeDependencyManager(makePlatform("linux"), {
        commandExists: () => false,
        capture: async (cmd, args) => {
          calls.push([cmd, args]);
          return "1.4.0";
        },
        which: (name) => (name === "/custom-bun/bin/bun" ? name : ""),
      });

      await expect(manager.version("bun")).resolves.toBe("1.4.0");
      expect(calls).toEqual([["/custom-bun/bin/bun", ["--version"]]]);
    } finally {
      if (previousHome === undefined) delete process.env["HOME"];
      else process.env["HOME"] = previousHome;
      if (previousBunInstall === undefined) delete process.env["BUN_INSTALL"];
      else process.env["BUN_INSTALL"] = previousBunInstall;
    }
  });

  it("finds a POSIX Bun that only the installer link in <home>/.local/bin holds", async () => {
    // install.sh links the Bun it used into ~/.local/bin, and the launchers search there.
    vi.stubEnv("HOME", "/fixture-home");
    vi.stubEnv("USERPROFILE", "/fixture-home");
    vi.stubEnv("BUN_INSTALL", "");
    try {
      const linked = "/fixture-home/.local/bin/bun";
      const calls: Array<string> = [];
      const manager = makeDependencyManager(makePlatform("linux"), {
        commandExists: () => false,
        capture: async (cmd) => {
          calls.push(cmd);
          return "1.4.5";
        },
        which: (name) => (name === linked ? name : ""),
      });

      expect(manager.probe("bun")).toEqual({ state: "present", path: linked });
      await expect(manager.version("bun")).resolves.toBe("1.4.5");
      expect(calls).toEqual([linked]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reads the Bun version from the search list of the manager's host, not the runner's", async () => {
    // A Windows manager on a POSIX runner: only the Windows candidate, which ends in bun.exe, exists.
    vi.stubEnv("HOME", "/fixture-home");
    vi.stubEnv("USERPROFILE", "/fixture-home");
    vi.stubEnv("BUN_INSTALL", "");
    try {
      const windowsBun = "/fixture-home/.bun/bin/bun.exe";
      const manager = makeDependencyManager(makePlatform("win32"), {
        commandExists: () => false,
        capture: async (cmd) => (cmd === windowsBun ? "1.4.5" : ""),
        which: (name) => (name === windowsBun ? name : ""),
      });

      expect(manager.probe("bun")).toEqual({ state: "present", path: windowsBun });
      await expect(manager.version("bun")).resolves.toBe("1.4.5");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects relative POSIX bun paths from PATH and BUN_INSTALL fallbacks", () => {
    const previousHome = process.env["HOME"];
    const previousUserProfile = process.env["USERPROFILE"];
    const previousBunInstall = process.env["BUN_INSTALL"];
    try {
      // engineHome reads USERPROFILE on Windows and HOME elsewhere.
      process.env["HOME"] = "/fixture-home";
      process.env["USERPROFILE"] = "/fixture-home";
      process.env["BUN_INSTALL"] = "relative-bun";
      const fallback = "/fixture-home/.bun/bin/bun";
      const withFallback = makeDependencyManager(makePlatform("linux"), {
        commandExists: () => true,
        capture: async () => "",
        which: (name) =>
          name === "bun"
            ? "relative/bin/bun"
            : name === "relative-bun/bin/bun" || name === fallback
              ? name
              : "",
      });
      expect(withFallback.probe("bun")).toEqual({ state: "present", path: fallback });

      const onlyRelative = makeDependencyManager(makePlatform("linux"), {
        commandExists: () => true,
        capture: async () => "",
        which: (name) => (name === "bun" ? "relative/bin/bun" : ""),
      });
      expect(onlyRelative.probe("bun")).toEqual({ state: "missing" });
    } finally {
      if (previousHome === undefined) delete process.env["HOME"];
      else process.env["HOME"] = previousHome;
      if (previousUserProfile === undefined) delete process.env["USERPROFILE"];
      else process.env["USERPROFILE"] = previousUserProfile;
      if (previousBunInstall === undefined) delete process.env["BUN_INSTALL"];
      else process.env["BUN_INSTALL"] = previousBunInstall;
    }
  });

  it("treats an executor's missing verdict as missing even if its PATH resolver finds a tool", async () => {
    const manager = makeDependencyManager(makePlatform("linux"), {
      commandExists: () => false,
      capture: async () => "9.9.9",
      which: () => "/host/git",
    });

    expect(manager.probe("git")).toEqual({ state: "missing" });
    await expect(manager.path("git")).resolves.toBe("");
  });

  it("probes presence without running the version command", () => {
    const captureVersion = vi.fn(async () => "9.9.9");
    const manager = makeDependencyManager(makePlatform("linux"), {
      commandExists: () => true,
      capture: captureVersion,
      which: (name) => `/stub/${name}`,
    });
    expect(manager.probe("git")).toEqual({ state: "present", path: "/stub/git" });
    expect(captureVersion).not.toHaveBeenCalled();
  });

  it("reports a version probe that does not answer within the limit as timed out", async () => {
    const bounded: Array<[string, ReadonlyArray<string>, number]> = [];
    const exec: ProbeExecutor = {
      commandExists: () => true,
      capture: async () => "git version 2.53.0",
      captureWithin: async (cmd, args, timeoutMs) => {
        bounded.push([cmd, args, timeoutMs]);
        return { kind: "timed-out" };
      },
      which: (name) => `/stub/${name}`,
    };

    await expect(resolveVersionReading(DEPENDENCIES.git, exec)).resolves.toEqual({
      kind: "timed-out",
    });
    await expect(resolveVersion(DEPENDENCIES.git, exec)).resolves.toBe("");
    expect(bounded).toEqual([
      ["git", ["--version"], VERSION_PROBE_LIMIT_MS],
      ["git", ["--version"], VERSION_PROBE_LIMIT_MS],
    ]);
  });

  it("reads the version from the bounded probe output, and an empty one from a failed probe", async () => {
    const answering = (outcome: CaptureOutcome): ProbeExecutor => ({
      commandExists: () => true,
      capture: async () => "unbounded capture must not run",
      captureWithin: async () => outcome,
      which: (name) => `/stub/${name}`,
    });

    await expect(
      resolveVersionReading(
        DEPENDENCIES.git,
        answering({ kind: "output", stdout: "git version 2.53.0" }),
      ),
    ).resolves.toEqual({ kind: "version", value: "git version 2.53.0" });
    await expect(
      resolveVersionReading(DEPENDENCIES.git, answering({ kind: "failed" })),
    ).resolves.toEqual({ kind: "version", value: "" });
  });
});
