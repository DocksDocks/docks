import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hostOs } from "../../src/engine-native/os";

// The launchers and the installers find Bun on their own, before the CLI runs. The probe of
// `docks-kit toolchain` must search the same folders, so each script's search list must equal the
// `bunSearch` list of its host.
const REPO_DIR = resolve(import.meta.dirname, "..", "..", "..");
const repoFile = (path: string): string => readFileSync(resolve(REPO_DIR, path), "utf8");

/** The quoted candidates of the `for c in ...; do` loop of a POSIX `find_bun`. */
function posixCandidates(script: string): ReadonlyArray<string> {
  const body = /find_bun\(\) \{([\s\S]*?)\n\}/.exec(repoFile(script))?.[1] ?? "";
  const loop = /for c in (.*); do/.exec(body)?.[1] ?? "";
  return [...loop.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "");
}

/** The `Join-Path $env:<VAR> '<path>'` candidates of a PowerShell `Find-Bun`, as `<VAR>\<path>`. */
function windowsCandidates(script: string): ReadonlyArray<string> {
  const body = /function Find-Bun \{([\s\S]*?)\n\}/.exec(repoFile(script))?.[1] ?? "";
  return [...body.matchAll(/Join-Path \$env:(\w+) '([^']+)'/g)].map(
    (match) => `${match[1]}\\${match[2]}`,
  );
}

describe("Bun search folders", () => {
  it.each(["docks-kit", "install.sh"])("%s searches the folders of the POSIX probe", (script) => {
    const expected = hostOs("linux").bunSearch.map((entry) =>
      [entry.base === "bunRoot" ? "${BUN_INSTALL:-$HOME/.bun}" : "$HOME", ...entry.rest].join("/"),
    );
    expect(posixCandidates(script), script).toEqual(expected);
  });

  it.each(["docks-kit.ps1", "install.ps1"])(
    "%s searches the folders of the Windows probe",
    (script) => {
      const expected = hostOs("windows").bunSearch.map((entry) =>
        [entry.base === "bunRoot" ? "BUN_INSTALL" : "USERPROFILE", entry.rest.join("\\")].join(
          "\\",
        ),
      );
      expect(windowsCandidates(script), script).toEqual(expected);
    },
  );
});
