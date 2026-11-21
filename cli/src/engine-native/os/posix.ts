// No import from "../exec": exec.ts imports "./os", which evaluates linux and darwin
// through this module. A slash join keeps the same host-stable path p() would produce.
import type { HintedTool, HostOs } from "./types";

/** Package-manager hints for the tools a POSIX host installs through its own package manager. */
export type PackageManagerHints = Readonly<Record<HintedTool, string>>;

interface PosixHostInputs {
  readonly id: HostOs["id"];
  readonly toolchainOs: HostOs["toolchainOs"];
  readonly packageManagerHints: PackageManagerHints;
}

/** Members shared by every POSIX host; linux and darwin differ only in the inputs. */
export function posixHost(inputs: PosixHostInputs): HostOs {
  return {
    id: inputs.id,
    toolchainOs: inputs.toolchainOs,
    executableSuffixes: [""],
    invoke: (executablePath, args) => ({ command: executablePath, args }),
    bunExecutableName: "bun",
    // install.sh links the Bun that it used into ~/.local/bin, a folder on non-interactive PATHs.
    bunSearch: [
      { base: "bunRoot", rest: ["bin", "bun"] },
      { base: "home", rest: [".bun", "bin", "bun"] },
      { base: "home", rest: [".local", "bin", "bun"] },
    ],
    bunInstaller: (pin, directory) => {
      const scriptPath = `${directory}/install.sh`;
      return {
        scriptPath,
        download: {
          command: "curl",
          args: ["-fsSL", "https://bun.sh/install", "-o", scriptPath],
        },
        run: {
          command: "bash",
          args: [scriptPath, `bun-v${pin}`],
        },
      };
    },
    installHint: (tool) => inputs.packageManagerHints[tool],
  };
}
