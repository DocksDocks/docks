import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hostOs } from "../../src/engine-native/os";
import type { BunSearchEntry } from "../../src/engine-native/os/types";

// The launchers and the installers find Bun on their own, before the CLI runs. The probe of
// `docks-kit toolchain` must search the same folders. So each script's whole finder function must
// equal the function that the `bunSearch` list of its host renders: a new search form, a new
// folder, or a new order in a script fails this test until the list and the template follow.
const REPO_DIR = resolve(import.meta.dirname, "..", "..", "..");
const repoFile = (path: string): string =>
  readFileSync(resolve(REPO_DIR, path), "utf8").replaceAll("\r\n", "\n");

/** Each definition of the function that starts with `opening` and ends at the next `}` line. */
function finderFunctions(script: string, opening: string): ReadonlyArray<string> {
  return repoFile(script)
    .split(opening)
    .slice(1)
    .map((rest) => `${opening}${rest.slice(0, rest.indexOf("\n}\n") + 2)}`);
}

function posixFinder(search: ReadonlyArray<BunSearchEntry>): string {
  const candidates = search
    .map(
      (entry) =>
        `"${[entry.base === "bunRoot" ? "${BUN_INSTALL:-$HOME/.bun}" : "$HOME", ...entry.rest].join("/")}"`,
    )
    .join(" ");
  return [
    "find_bun() {",
    "  local c",
    '  c="$(command -v bun 2>/dev/null || true)"',
    `  [[ -n "$c" ]] && { printf '%s\\n' "$c"; return 0; }`,
    `  for c in ${candidates}; do`,
    `    [[ -x "$c" ]] && { printf '%s\\n' "$c"; return 0; }`,
    "  done",
    "  return 1",
    "}",
  ].join("\n");
}

function windowsFinder(search: ReadonlyArray<BunSearchEntry>): string {
  const candidates = search.flatMap((entry) => {
    const variable = entry.base === "bunRoot" ? "BUN_INSTALL" : "USERPROFILE";
    return [
      `  if (-not [string]::IsNullOrWhiteSpace($env:${variable})) {`,
      `    $Candidates += Join-Path $env:${variable} '${entry.rest.join("\\")}'`,
      "  }",
    ];
  });
  return [
    "function Find-Bun {",
    "  $Command = Get-Command bun -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1",
    "  if ($null -ne $Command) {",
    "    return $Command.Source",
    "  }",
    "",
    "  $Candidates = @()",
    ...candidates,
    "  foreach ($Candidate in $Candidates) {",
    "    if (Test-Path -LiteralPath $Candidate -PathType Leaf) {",
    "      return $Candidate",
    "    }",
    "  }",
    "  return $null",
    "}",
  ].join("\n");
}

describe("Bun search folders", () => {
  it.each(["docks-kit", "install.sh"])("%s searches the folders of the POSIX probe", (script) => {
    expect(finderFunctions(script, "find_bun() {"), script).toEqual([
      posixFinder(hostOs("linux").bunSearch),
    ]);
  });

  it.each(["docks-kit.ps1", "install.ps1"])(
    "%s searches the folders of the Windows probe",
    (script) => {
      expect(finderFunctions(script, "function Find-Bun {"), script).toEqual([
        windowsFinder(hostOs("windows").bunSearch),
      ]);
    },
  );
});
