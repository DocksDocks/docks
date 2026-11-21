/**
 * Host support map (Platform seam in DESIGN.md). Each of the two launchers
 * checks the host by hand before it runs Bun from source, so
 * `cli/test/unit/hostTargets.test.ts` checks them against this table:
 * - the `uname` keys in the Bash launcher `docks-kit`;
 * - the processor architecture in `docks-kit.ps1`.
 * The same test also checks two facts outside this table: the generated Bun
 * pin in the two launchers and the two installers equals the
 * `SoT/toolchain.json` pin, and `docks-kit.ps1` and `install.ps1` hold only
 * ASCII bytes.
 *
 * Membership here is the support matrix: adding a row is how a host becomes
 * supported, and `requireSupportedHost` in cli/src/engine.ts admits exactly the
 * platform/arch pairs this table names.
 */
import { platformName, type PlatformName } from "./index";

export type TargetId = "linux-x64" | "linux-arm64" | "darwin-arm64" | "windows-x64";

export type TargetArch = "x64" | "arm64";

export interface HostTarget {
  readonly id: TargetId;
  readonly platform: PlatformName;
  readonly arch: TargetArch;
  /** `uname -s`-`uname -m` keys the Bash launcher matches; empty on Windows. */
  readonly unameKeys: ReadonlyArray<string>;
  /**
   * `$env:PROCESSOR_ARCHITECTURE` values the PowerShell launcher matches; empty
   * off Windows. A 32-bit shell on an x64 host reports `x86` there, so a
   * launcher must read `PROCESSOR_ARCHITEW6432` first.
   */
  readonly processorArchitectures: ReadonlyArray<string>;
}

const target = (
  id: TargetId,
  platform: PlatformName,
  arch: TargetArch,
  unameKeys: ReadonlyArray<string>,
  processorArchitectures: ReadonlyArray<string>,
): HostTarget => ({
  id,
  platform,
  arch,
  unameKeys,
  processorArchitectures,
});

export const HOST_TARGETS: ReadonlyArray<HostTarget> = [
  target("linux-x64", "linux", "x64", ["Linux-x86_64"], []),
  target("linux-arm64", "linux", "arm64", ["Linux-aarch64"], []),
  target("darwin-arm64", "darwin", "arm64", ["Darwin-arm64"], []),
  target("windows-x64", "windows", "x64", [], ["AMD64"]),
];

function targetFor(platform: PlatformName, arch: string): HostTarget | undefined {
  return HOST_TARGETS.find((t) => t.platform === platform && t.arch === arch);
}

/** Resolve the supported host target for a raw Node platform/arch pair. */
export function targetForHost(platform: NodeJS.Platform, arch: string): HostTarget | undefined {
  return targetFor(platformName(platform), arch);
}
