import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { writeHarnessSelection } from "../../src/engine-native/harnesses";
import { modelCatalog } from "../../src/engine-native/models";
import { runPublicCli } from "../lib/goldenExecution";
import {
  FIXTURES_DIR,
  cleanupTemporaryDirs,
  makeStubDir,
  temporaryDir,
} from "../lib/goldenResources";

afterAll(cleanupTemporaryDirs);

function deployedText(home: string, path: string): string {
  return readFileSync(join(home, ...path.split("/")), "utf8");
}

describe("retained model and sync behavior", () => {
  it("lists curated Claude models when no login is available", () => {
    const run = runPublicCli(["models", "--json"], "home-fresh", makeStubDir());
    try {
      expect(run.exitCode).toBe(0);
      expect(JSON.parse(run.stdout)).toEqual({
        claude: {
          tool: "claude",
          source: "curated",
          verified: modelCatalog("claude").verified,
          fallbackReason: "no Claude Code login found in ~/.claude/.credentials.json",
          models: modelCatalog("claude").models,
        },
      });
      expect(run.stderr).toBe("");
    } finally {
      rmSync(run.home, { recursive: true, force: true });
    }
  });

  it("lists only enabled model harnesses by default and allows an explicit tool", () => {
    const home = temporaryDir("models-selected-home-");
    writeHarnessSelection(home, ["agents", "omp"]);
    const stubs = makeStubDir();
    const options = { reuseHome: home };

    const selected = runPublicCli(["models", "--json"], "home-fresh", stubs, options);
    expect(selected.exitCode).toBe(0);
    expect(selected.stderr).toBe("");
    expect(JSON.parse(selected.stdout)).toEqual({
      omp: {
        tool: "omp",
        source: "curated",
        verified: "?",
        fallbackReason: "'omp models --json' returned no usable catalog",
        models: [],
      },
    });

    const explicit = runPublicCli(["models", "claude", "--json"], "home-fresh", stubs, options);
    expect(explicit.exitCode).toBe(0);
    expect(explicit.stderr).toBe("");
    expect(JSON.parse(explicit.stdout)).toEqual({
      claude: {
        tool: "claude",
        source: "curated",
        verified: modelCatalog("claude").verified,
        fallbackReason: "claude harness not enabled (docks-kit harnesses)",
        models: modelCatalog("claude").models,
      },
    });
  });

  it("shows the curated fallback and reason when no live Claude catalog exists", () => {
    const run = runPublicCli(["models", "claude"], "home-fresh", makeStubDir());
    try {
      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain(
        `claude models (kit-verified ${modelCatalog("claude").verified}):`,
      );
      expect(run.stdout).toContain(
        "  (live list unavailable: no Claude Code login found in ~/.claude/.credentials.json)",
      );
      expect(run.stdout).not.toContain("omp models");
      expect(run.stderr).toBe("");
    } finally {
      rmSync(run.home, { recursive: true, force: true });
    }
  });

  it("parses ordinary model and effort modifiers through the public sync command", () => {
    const fixtureClaude = readFileSync(
      join(FIXTURES_DIR, "home-drift", ".claude", "settings.json"),
      "utf8",
    );
    const run = runPublicCli(
      ["sync", "claude", "--dry-run", "--claude-model=opus", "--claude-effort=xhigh"],
      "home-drift",
      makeStubDir(),
    );
    try {
      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain("[dry-run] (--claude-model) set .model=opus");
      expect(run.stdout).toContain("[dry-run] (--claude-effort) set .effortLevel=xhigh");
      expect(deployedText(run.home, ".claude/settings.json")).toBe(fixtureClaude);
    } finally {
      rmSync(run.home, { recursive: true, force: true });
    }
  });
});
