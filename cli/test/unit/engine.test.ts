import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runEngineNative: vi.fn() }));

vi.mock("../../src/engine-native", () => ({ runEngineNative: mocks.runEngineNative }));

import { engine } from "../../src/engine";
import { EngineServicesLive } from "../../src/services";

beforeEach(() => {
  mocks.runEngineNative.mockReset();
  vi.stubEnv("DOCKS_KIT_ENGINE", "");
  vi.stubEnv("DOCKS_KIT_HOME", "");
  vi.spyOn(process, "platform", "get").mockReturnValue("win32");
  vi.spyOn(process, "arch", "get").mockReturnValue("x64");
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`exit ${String(code)}`);
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const runEngine = (args: ReadonlyArray<string>) =>
  Effect.runPromise(Effect.provide(engine(args), EngineServicesLive));

describe("supported host boundary", () => {
  it.each([
    ["linux", "x64"],
    ["linux", "arm64"],
    ["darwin", "arm64"],
    ["win32", "x64"],
  ] as const)(
    "admits %s/%s and exits with the native engine's failure code",
    async (platform, arch) => {
      vi.spyOn(process, "platform", "get").mockReturnValue(platform);
      vi.spyOn(process, "arch", "get").mockReturnValue(arch);
      mocks.runEngineNative.mockResolvedValue(37);

      await expect(runEngine(["toolchain"])).rejects.toThrow("exit 37");
      expect(console.error).not.toHaveBeenCalled();
    },
  );
});

describe("unsupported host boundary", () => {
  it.each([
    ["darwin", "x64"],
    ["win32", "arm64"],
    ["freebsd", "arm64"],
    ["linux", "ia32"],
    ["win32", "ia32"],
  ] as const)("rejects unsupported %s/%s hosts", async (platform, arch) => {
    vi.spyOn(process, "platform", "get").mockReturnValue(platform);
    vi.spyOn(process, "arch", "get").mockReturnValue(arch);

    await expect(runEngine(["toolchain"])).rejects.toThrow("exit 2");
    expect(console.error).toHaveBeenCalledWith(
      `unsupported host ${platform}/${arch}; docks-kit supports Linux on x64 and arm64, macOS on arm64, and Windows on x64`,
    );
    expect(mocks.runEngineNative).not.toHaveBeenCalled();
  });
});

describe("EngineNative Effect seam", () => {
  beforeEach(() => {
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    vi.spyOn(process, "arch", "get").mockReturnValue("x64");
  });

  it("rejects a removed Bash engine before running the native engine", async () => {
    vi.stubEnv("DOCKS_KIT_ENGINE", "bash");

    await expect(runEngine(["toolchain"])).rejects.toThrow("exit 2");
    expect(console.error).toHaveBeenCalledWith(
      "bash engine removed — recover at tag bash-engine-final",
    );
    expect(mocks.runEngineNative).not.toHaveBeenCalled();
  });

  it("maps a rejected EngineNative Promise to a user-facing CLI failure", async () => {
    mocks.runEngineNative.mockRejectedValue(new Error("native engine failed"));

    await expect(runEngine(["toolchain"])).rejects.toMatchObject({
      _tag: "UserError",
      message: "engine operation 'toolchain' failed: native engine failed",
    });
  });

  it("reports the default operation and unknown cause when the native engine rejects silently", async () => {
    mocks.runEngineNative.mockRejectedValue(new Error(""));

    await expect(runEngine([])).rejects.toMatchObject({
      _tag: "UserError",
      message: "engine operation 'default' failed: unknown error",
    });
  });

  it("runs the public engine with env globals disabled", async () => {
    mocks.runEngineNative.mockResolvedValue(0);

    await runEngine(["sync", "omp"]);
    expect(mocks.runEngineNative).toHaveBeenCalledWith(["sync", "omp"], expect.anything(), {
      envGlobals: false,
    });
  });
});
