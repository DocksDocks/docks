import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { HOST_TARGETS } from "../../src/engine-native/os/targets";

const REPO_DIR = resolve(import.meta.dirname, "..", "..", "..");
const PIN_BLOCK_PATTERN = /# BEGIN GENERATED BUN PIN\r?\n([\s\S]*?)\r?\n# END GENERATED BUN PIN/g;

function repoFile(path: string): string {
  return readFileSync(resolve(REPO_DIR, path), "utf8");
}

function generatedPinBody(source: string): string {
  const blocks = [...source.matchAll(PIN_BLOCK_PATTERN)];
  expect(blocks, "generated Bun pin block count").toHaveLength(1);
  return blocks[0]?.[1]?.trim() ?? "";
}

describe("host target script contracts", () => {
  it("keeps the Bash launcher aligned with every POSIX host target", () => {
    const launcher = repoFile("docks-kit");
    const targets = HOST_TARGETS.filter(({ platform }) => platform !== "windows");

    for (const key of targets.flatMap(({ unameKeys }) => unameKeys)) {
      expect(launcher, key).toContain(key);
    }
  });

  it("keeps the PowerShell launcher aligned with every Windows host target", () => {
    const launcher = repoFile("docks-kit.ps1");
    const targets = HOST_TARGETS.filter(({ platform }) => platform === "windows");

    for (const architecture of targets.flatMap(
      ({ processorArchitectures }) => processorArchitectures,
    )) {
      expect(launcher, architecture).toContain(architecture);
    }
  });

  it("keeps the generated Bun pin synchronized across every launcher and installer", () => {
    const manifest = JSON.parse(repoFile("SoT/toolchain.json")) as {
      tools: { bun: { verified: string } };
    };
    const version = manifest.tools.bun.verified;
    const scripts = [
      ["docks-kit", `BUN_PIN="${version}"`],
      ["docks-kit.ps1", `$BunPin = "${version}"`],
      ["install.sh", `BUN_PIN="${version}"`],
      ["install.ps1", `$BunPin = "${version}"`],
    ] as const;

    for (const [path, assignment] of scripts) {
      expect(generatedPinBody(repoFile(path)), path).toBe(assignment);
    }
  });

  // Windows PowerShell 5.1 reads a script without a BOM in the ANSI code page,
  // where a UTF-8 em dash decodes to a closing quote and breaks the parse.
  it.each(["docks-kit.ps1", "install.ps1"])("keeps %s pure ASCII", (path) => {
    const bytes = readFileSync(resolve(REPO_DIR, path));
    expect([...bytes].some((byte) => byte > 0x7f)).toBe(false);
  });
});
