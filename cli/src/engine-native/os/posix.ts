// No import from "../exec": exec.ts imports "./os", which evaluates linux and darwin
// through this module. A slash join keeps the same host-stable path p() would produce.
import type { HintedTool, HostOs } from "./types";

function posixLiteral(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

/** Package-manager hints for the tools a POSIX host installs through its own package manager. */
export type PackageManagerHints = Readonly<Record<Exclude<HintedTool, "claude">, string>>;

// Claude ships its own installer, so its hint is the same on every POSIX host.
const CLAUDE_INSTALLER_HINT =
  'tmp=$(mktemp) && curl -fsSL https://claude.ai/install.sh -o "$tmp" && bash "$tmp"';

interface PosixHostInputs {
  readonly id: HostOs["id"];
  readonly toolchainOs: HostOs["toolchainOs"];
  readonly packageManagerHints: PackageManagerHints;
  /** Home-relative bash startup files in read order; the first existing one gets the write, else the first entry. */
  readonly bashTargets: readonly [string, ...string[]];
}

/** Members shared by every POSIX host; linux and darwin differ only in the inputs. */
export function posixHost(inputs: PosixHostInputs): HostOs {
  return {
    id: inputs.id,
    toolchainOs: inputs.toolchainOs,
    directoryLinkKinds: ["symlink"],
    executableSuffixes: [""],
    invoke: (executablePath, args) => ({ command: executablePath, args }),
    bunExecutableName: "bun",
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
    environmentSetting: (name, value) => ({
      kind: "profile",
      // Bash reads .bash_login only as a login file. Only a host that writes to it
      // scans it, so a dormant copy cannot block the write to the loaded file.
      candidates: [
        ".zshrc",
        ".bashrc",
        ".bash_profile",
        ...(inputs.bashTargets.includes(".bash_login") ? [".bash_login"] : []),
        ".profile",
        ".zshenv",
      ],
      target: (shell, exists) => {
        const shellPath = shell ?? "bash";
        const shellName = shellPath.slice(shellPath.lastIndexOf("/") + 1);
        if (shellName === "zsh") return ".zshrc";
        if (shellName !== "bash") return ".profile";
        return inputs.bashTargets.find(exists) ?? inputs.bashTargets[0];
      },
      line: `export ${name}=${value}`,
    }),
    statusLineCommand: (bun, script) => {
      const bunLiteral = posixLiteral(bun);
      const scriptLiteral = posixLiteral(script);
      return `test -x ${bunLiteral} && test -f ${scriptLiteral} && exec ${bunLiteral} ${scriptLiteral} || true`;
    },
    failureHookCommand: (command) => command,
    installHint: (tool) =>
      tool === "claude" ? CLAUDE_INSTALLER_HINT : inputs.packageManagerHints[tool],
  };
}
