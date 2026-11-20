import { describe, expect, it } from "vitest";
import { hostOs, platformName } from "../../../src/engine-native/os";

describe("Darwin host OS", () => {
  it("maps the Node platform name", () => {
    expect(platformName("darwin")).toBe("darwin");
  });

  it("exposes every Darwin host fact", () => {
    const host = hostOs("darwin");

    expect(host.id).toBe("darwin");
    expect(host.toolchainOs).toBe("darwin");
    expect(host.executableSuffixes).toEqual([""]);
    expect(host.invoke("/usr/local/bin/npm", ["-v"])).toEqual({
      command: "/usr/local/bin/npm",
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
    expect(host.installHint("git")).toBe("brew install git");
    expect(host.installHint("jq")).toBe("brew install jq");
    expect(host.installHint("curl")).toBe("brew install curl");
  });
});
