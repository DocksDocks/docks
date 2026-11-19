import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { stripVTControlCharacters } from "node:util";

import type { Ctx } from "../../src/engine-native";
import { p } from "../../src/engine-native/exec";
import { writeHarnessSelection } from "../../src/engine-native/harnesses";
import { kitDbFile } from "../../src/engine-native/kitDb";
import { ExitError, parseArgs } from "../../src/engine-native/parseArgs";
import { makeEngineServices } from "../../src/engine-native/services";
import { kitHome } from "../../src/kitHome";

function targetCtx(
  home: string,
  interactive: boolean,
  echoes: Array<string>,
  errors: Array<string> = [],
): Ctx {
  return {
    repoDir: kitHome(),
    home,
    agentsDir: p(home, ".agents"),
    interactive,
    dryRun: false,
    verbose: false,
    skipPluginRefresh: false,
    prune: false,
    syncConcurrency: 3,
    services: makeEngineServices({
      sinks: {
        stderr: (chunk) => void errors.push(stripVTControlCharacters(chunk)),
        stdout: (chunk) => void echoes.push(chunk.replace(/\n$/, "")),
      },
    }),
    targetFilterSet: false,
    syncAgents: false,
    syncOmp: false,
    nextStepTriggers: {
      skillsRestart: false,
      ompRestart: false,
      ompPluginUpgraded: false,
    },
    failures: [],
  };
}

function selectedTargets(ctx: Ctx) {
  return {
    agents: ctx.syncAgents,
    omp: ctx.syncOmp,
  };
}

describe("sync target grammar", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "docks-kit-targets-"));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it("selects only omp when omp is explicit", () => {
    const ctx = targetCtx(home, false, []);

    parseArgs(ctx, ["omp"]);

    expect(selectedTargets(ctx)).toEqual({ agents: false, omp: true });
  });

  it("selects exactly the explicit agents target", () => {
    const ctx = targetCtx(home, false, []);

    parseArgs(ctx, ["agents"]);

    expect(selectedTargets(ctx)).toEqual({ agents: true, omp: false });
  });

  it("keeps an explicit target after a flag ahead of a stored selection", () => {
    writeHarnessSelection(home, ["omp"]);
    const ctx = targetCtx(home, false, []);

    parseArgs(ctx, ["--dry-run", "agents"]);

    expect(ctx.dryRun).toBe(true);
    expect(selectedTargets(ctx)).toEqual({ agents: true, omp: false });
  });

  it("uses a stored omp-only selection for a flag-less parse", () => {
    writeHarnessSelection(home, ["omp"]);
    const ctx = targetCtx(home, false, []);

    parseArgs(ctx, []);

    expect(selectedTargets(ctx)).toEqual({ agents: false, omp: true });
  });

  it("uses exactly a stored agents-only selection", () => {
    writeHarnessSelection(home, ["agents"]);
    const ctx = targetCtx(home, false, []);

    parseArgs(ctx, []);

    expect(selectedTargets(ctx)).toEqual({ agents: true, omp: false });
  });

  it("syncs agents and omp by default when no selection is stored", () => {
    const echoes: Array<string> = [];
    const ctx = targetCtx(home, false, echoes);

    parseArgs(ctx, []);

    expect({ agents: ctx.syncAgents, omp: ctx.syncOmp }).toEqual({ agents: true, omp: true });
    expect(echoes).toEqual([]);
  });

  it("drops a codex-only selection stored by an older kit and uses the default selection silently", () => {
    // An older kit could store `codex`; the kitDb CHECK still accepts that row,
    // so it is written straight to the table here.
    writeHarnessSelection(home, ["omp"]);
    const db = new DatabaseSync(kitDbFile(home));
    try {
      db.exec("DELETE FROM harness_selection");
      db.prepare("INSERT INTO harness_selection (harness) VALUES (?)").run("codex");
    } finally {
      db.close();
    }
    const echoes: Array<string> = [];
    const errors: Array<string> = [];
    const ctx = targetCtx(home, false, echoes, errors);

    parseArgs(ctx, []);

    expect(selectedTargets(ctx)).toEqual({ agents: true, omp: true });
    expect(echoes).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("prints both selection hints in order without stored state when interactive", () => {
    const echoes: Array<string> = [];
    const ctx = targetCtx(home, true, echoes);

    parseArgs(ctx, []);

    expect(selectedTargets(ctx)).toEqual({ agents: true, omp: true });
    expect(echoes).toEqual([
      "No harness selection stored; syncing agents, omp",
      "Choose harnesses with: docks-kit harnesses",
    ]);
  });

  it("prints no selection hints for stored state when interactive", () => {
    writeHarnessSelection(home, ["omp"]);
    const echoes: Array<string> = [];
    const ctx = targetCtx(home, true, echoes);

    parseArgs(ctx, []);

    expect(selectedTargets(ctx)).toEqual({ agents: false, omp: true });

    expect(echoes).toEqual([]);
  });

  it("never creates the harness state file during a flag-less parse", () => {
    const ctx = targetCtx(home, true, []);

    parseArgs(ctx, []);

    expect(existsSync(kitDbFile(home))).toBe(false);
  });

  it.each(["bogus", "claude"])(
    "reports the unknown positional target %s on stderr with exit code 2",
    (target) => {
      const errors: Array<string> = [];
      const ctx = targetCtx(home, false, [], errors);
      let thrown: unknown;

      try {
        parseArgs(ctx, [target]);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(ExitError);
      expect((thrown as ExitError).code).toBe(2);
      expect(errors).toEqual([`[err] Unknown arg: ${target}\n`]);
    },
  );
});
