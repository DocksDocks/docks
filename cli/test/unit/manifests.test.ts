import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Payload from "../../src/payload";

const mocks = vi.hoisted<{
  home: string;
  claudeSettings: string | undefined;
  skillsManifest: string | undefined;
}>(() => ({
  home: "",
  claudeSettings: undefined,
  skillsManifest: undefined,
}));

vi.mock("../../src/payload", async () => {
  const actual = await vi.importActual<typeof Payload>("../../src/payload");
  return {
    ...actual,
    payloadText: (path: Parameters<typeof actual.payloadText>[0]) => {
      if (path === "SoT/.claude/settings.json" && mocks.claudeSettings !== undefined)
        return mocks.claudeSettings;
      if (path === "SoT/.agents/skills.txt" && mocks.skillsManifest !== undefined)
        return mocks.skillsManifest;
      return actual.payloadText(path);
    },
  };
});

import { installedPluginsState, pluginsView, skillsView } from "../../src/manifests";

beforeEach(() => {
  mocks.home = mkdtempSync(join(tmpdir(), "docks-manifests-"));
  vi.stubEnv("HOME", mocks.home);
  vi.stubEnv("USERPROFILE", mocks.home);
  mocks.claudeSettings = undefined;
  mocks.skillsManifest = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(mocks.home, { recursive: true, force: true });
  mocks.home = "";
});

describe("manifest resolvers", () => {
  it("reports SoT enablement separately from user-scope installation", () => {
    mocks.claudeSettings = JSON.stringify({
      enabledPlugins: {
        "disabled@test": false,
        "enabled@test": true,
        "project-only@test": true,
      },
    });
    const pluginsDir = join(mocks.home, ".claude", "plugins");
    mkdirSync(pluginsDir, { recursive: true });
    writeFileSync(
      join(pluginsDir, "installed_plugins.json"),
      JSON.stringify({
        plugins: {
          "disabled@test": [{ scope: "user" }],
          "project-only@test": [{ scope: "project" }],
          "user@test": [{ scope: "project" }, { scope: "user" }],
        },
      }),
    );

    expect(pluginsView()).toEqual([
      { plugin: "disabled@test", sot: "false", installed: true },
      { plugin: "enabled@test", sot: "true", installed: false },
      { plugin: "project-only@test", sot: "true", installed: false },
      { plugin: "user@test", sot: "absent", installed: true },
    ]);
  });

  it("distinguishes declared, installed, and correctly linked skills", () => {
    mocks.skillsManifest = "# ignored\nowner/repo/declared\nowner/repo/valid\n";
    const agentsSkills = join(mocks.home, ".agents", "skills");
    const claudeSkills = join(mocks.home, ".claude", "skills");
    for (const skill of ["dangling", "valid", "wrong"]) {
      mkdirSync(join(agentsSkills, skill), { recursive: true });
    }
    mkdirSync(claudeSkills, { recursive: true });
    symlinkSync(join(agentsSkills, "missing"), join(claudeSkills, "dangling"), "dir");
    symlinkSync("../../.agents/skills/valid", join(claudeSkills, "valid"), "dir");
    symlinkSync(join(agentsSkills, "valid"), join(claudeSkills, "wrong"), "dir");

    expect(skillsView()).toEqual([
      { skill: "dangling", declared: false, installed: true, claudeSymlink: false },
      { skill: "declared", declared: true, installed: false, claudeSymlink: false },
      { skill: "valid", declared: true, installed: true, claudeSymlink: true },
      { skill: "wrong", declared: false, installed: true, claudeSymlink: false },
    ]);
  });

  it("reports SoT plugins as not installed when installed_plugins.json is malformed", () => {
    mocks.claudeSettings = JSON.stringify({ enabledPlugins: { "enabled@test": true } });
    const pluginsDir = join(mocks.home, ".claude", "plugins");
    mkdirSync(pluginsDir, { recursive: true });
    const installedPath = join(pluginsDir, "installed_plugins.json");
    expect(installedPluginsState()).toBe("absent");

    for (const content of ['{"plugins": {', "null", '{"plugins": null}']) {
      writeFileSync(installedPath, content);
      expect(pluginsView()).toEqual([{ plugin: "enabled@test", sot: "true", installed: false }]);
      expect(installedPluginsState()).toBe("malformed");
    }

    writeFileSync(installedPath, JSON.stringify({ plugins: {} }));
    expect(installedPluginsState()).toBe("valid");
  });

  it("names a declared skill after the @skill part of an owner/repo@skill slug", () => {
    mocks.skillsManifest = "acme/pack@Demo\n";
    const agentsSkills = join(mocks.home, ".agents", "skills");
    const claudeSkills = join(mocks.home, ".claude", "skills");
    mkdirSync(join(agentsSkills, "demo"), { recursive: true });
    mkdirSync(claudeSkills, { recursive: true });
    symlinkSync(join(agentsSkills, "demo"), join(claudeSkills, "demo"), "dir");

    expect(skillsView()).toEqual([
      { skill: "demo", declared: true, installed: true, claudeSymlink: true },
    ]);
  });
});
