import { describe, expect, it } from "vitest";
import { hostOs, platformName } from "../../../src/engine-native/os";

describe("Linux host OS", () => {
  it("maps the Node platform name", () => {
    expect(platformName("linux")).toBe("linux");
  });

  it("exposes every Linux host fact", () => {
    const host = hostOs("linux");

    expect(host.id).toBe("linux");
    expect(host.toolchainOs).toBe("linux");
    expect(host.executableSuffixes).toEqual([""]);
    expect(host.invoke("/usr/bin/npm", ["-v"])).toEqual({
      command: "/usr/bin/npm",
      args: ["-v"],
    });
    expect(host.bunExecutableName).toBe("bun");
    expect(host.bunInstaller("1.4.0", "/tmp/bun")).toEqual({
      scriptPath: "/tmp/bun/install.sh",
      download: {
        command: "curl",
        args: ["-fsSL", "https://bun.sh/install", "-o", "/tmp/bun/install.sh"],
      },
      run: {
        command: "bash",
        args: ["/tmp/bun/install.sh", "bun-v1.4.0"],
      },
    });
    expect(host.installHint("git")).toBe(
      "sudo apt install -y git (or your distro's package manager)",
    );
    expect(host.installHint("jq")).toBe("sudo apt install -y jq");
    expect(host.installHint("curl")).toBe("sudo apt install -y curl");
  });

  it("leaves an unsupported platform without a toolchain OS", () => {
    expect(platformName("freebsd")).toBe("unknown");
    const host = hostOs("unknown");

    expect(host.id).toBe("unknown");
    expect(host.toolchainOs).toBe("");
    expect(host.installHint("git")).toBe(
      "sudo apt install -y git (or your distro's package manager)",
    );
  });
});
