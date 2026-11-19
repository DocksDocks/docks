import { describe, expect, it, vi } from "vitest";

vi.mock("../../docs/overview.md", () => ({ default: "" }));
vi.mock("../../docs/flags.md", () => ({ default: "" }));
vi.mock("../../docs/toolchain.md", () => ({ default: "" }));
vi.mock("../../docs/sync-layers.md", () => ({ default: "" }));
vi.mock("../../docs/install.md", () => ({ default: "" }));
vi.mock("../../docs/platforms.md", () => ({ default: "" }));
vi.mock("../../docs/omp-models.md", () => ({ default: "" }));
vi.mock("../../docs/omp-context.md", () => ({ default: "" }));
vi.mock("../../docs/command-guards.md", () => ({ default: "" }));

import { COMMANDS, prepareArgv, subcommandName } from "../../src/argv";

/** The subcommands in registration order, which is also the `--help` order. */
const REGISTERED_SUBCOMMANDS = [
  "sync",
  "harnesses",
  "update",
  "toolchain",
  "skills",
  "docs",
  "omp",
  "scratch",
  "tidy",
] as const;

describe("argument validation", () => {
  it.each([
    [
      "joins a dash-leading repo value for Effect 4",
      ["tidy", "--repo", "-1"],
      ["tidy", "--repo=-1"],
    ],
    [
      "joins multiple dash-leading values during one normalization walk",
      ["tidy", "--repo", "-1", "--log-level", "-2"],
      ["tidy", "--repo=-1", "--log-level=-2"],
    ],
    [
      "joins an unknown dash-leading repo value while preserving later flags",
      ["tidy", "--repo", "--bogus", "--apply"],
      ["tidy", "--repo=--bogus", "--apply"],
    ],
    ["accepts a command-local short alias", ["sync", "-v"], ["sync", "-v"]],
    ["accepts the global version short alias at the root", ["-v"], ["-v"]],
    ["collapses a repeated global help action into one", ["--help", "--help"], ["--help"]],
    [
      "collapses a help alias that repeats the long form",
      ["docs", "--help", "-h"],
      ["docs", "--help"],
    ],
    ["collapses a repeated global wizard action into one", ["--wizard", "--wizard"], ["--wizard"]],
    ["accepts the global version short alias after docs", ["docs", "-v"], ["docs", "-v"]],
    ["accepts a global help flag after a subcommand", ["sync", "--help"], ["sync", "--help"]],
    ["accepts the update no-sync flag", ["update", "--no-sync"], ["update", "--no-sync"]],
    [
      "accepts flag-shaped positionals after the delimiter",
      ["sync", "--", "--bogus"],
      ["sync", "--", "--bogus"],
    ],
    [
      "accepts a global value flag before the subcommand unchanged",
      ["--log-level", "debug", "sync"],
      ["--log-level", "debug", "sync"],
    ],
    [
      "accepts a target word after a boolean flag",
      ["sync", "--dry-run", "omp"],
      ["sync", "--dry-run", "omp"],
    ],
  ] as const)("%s", (_name, input, args) => {
    expect(prepareArgv(input)).toEqual({ kind: "accept", args });
  });

  it.each([
    [
      "rejects legacy --remove-plugins with its prune rename hint",
      "--remove-plugins",
      "--remove-plugins was renamed to --prune",
    ],
    [
      "rejects legacy --agents with its positional-target rename hint",
      "--agents",
      "--agents was renamed: pass the target as a word, e.g. 'sync agents'",
    ],
    [
      "rejects legacy --omp with its positional-target rename hint",
      "--omp",
      "--omp was renamed: pass the target as a word, e.g. 'sync omp'",
    ],
  ] as const)("%s", (_name, flag, message) => {
    expect(prepareArgv(["sync", flag])).toEqual({ kind: "reject", message, exitCode: 2 });
  });

  it.each([
    [
      "rejects an unknown long sync flag and names its scope",
      ["sync", "--bogus"],
      "--bogus",
      "sync",
    ],
    ["rejects an unknown short sync flag and names its scope", ["sync", "-x"], "-x", "sync"],
    [
      "rejects a long name with a single dash and names its scope",
      ["sync", "-dry-run"],
      "-dry-run",
      "sync",
    ],
    [
      "rejects an undeclared boolean negation and names its scope",
      ["sync", "--no-dry-run"],
      "--no-dry-run",
      "sync",
    ],
    [
      "rejects an unknown negation with an inline value before boolean-value validation",
      ["sync", "--no-dry-run=true"],
      "--no-dry-run=true",
      "sync",
    ],
    [
      "rejects an undeclared tidy negation and names its scope",
      ["tidy", "--no-apply"],
      "--no-apply",
      "tidy",
    ],
    [
      "rejects a sync legacy flag as unknown outside the sync scope",
      ["docs", "--agents"],
      "--agents",
      "docs",
    ],
    [
      "rejects --skip-rtk as unknown now that its bubblewrap rename hint is gone",
      ["sync", "--skip-rtk"],
      "--skip-rtk",
      "sync",
    ],
    [
      "rejects --codex as unknown now that the codex target is gone",
      ["sync", "--codex"],
      "--codex",
      "sync",
    ],
    [
      "rejects --claude as unknown now that the claude target is gone",
      ["sync", "--claude"],
      "--claude",
      "sync",
    ],
    [
      "rejects --force as unknown now that its reconcile rename hint is gone",
      ["sync", "--force"],
      "--force",
      "sync",
    ],
  ] as const)("%s", (_name, input, flag, command) => {
    expect(prepareArgv(input)).toEqual({
      kind: "reject",
      message: `unknown flag ${flag} for '${command}'`,
      exitCode: 2,
    });
  });

  it("rejects an unknown root flag without a subcommand scope", () => {
    expect(prepareArgv(["--bogus"])).toEqual({
      kind: "reject",
      message: "unknown flag --bogus",
      exitCode: 2,
    });
  });

  it("rejects an unknown flag on harnesses and names its scope", () => {
    expect(prepareArgv(["harnesses", "--bogus"])).toEqual({
      kind: "reject",
      message: "unknown flag --bogus for 'harnesses'",
      exitCode: 2,
    });
  });

  it.each([
    [
      "rejects an unknown subcommand before blaming one of its flags",
      ["snyc", "--dry-run"],
      "unknown command 'snyc'",
    ],
    [
      "rejects an Object.prototype name as an unknown subcommand instead of crashing",
      ["toString", "--dry-run"],
      "unknown command 'toString'",
    ],
    [
      "rejects a repeated value-taking global action rather than silently keeping the first",
      ["--completions", "bash", "--completions", "zsh"],
      "flag --completions was given more than once",
    ],
  ] as const)("%s", (_name, input, message) => {
    expect(prepareArgv(input)).toEqual({ kind: "reject", message, exitCode: 2 });
  });

  it.each([
    [
      "rejects an inline value for the sync dry-run boolean",
      ["sync", "--dry-run=false"],
      "--dry-run",
    ],
    ["rejects an inline value for the sync prune boolean", ["sync", "--prune=true"], "--prune"],
    ["rejects an inline value for the tidy apply boolean", ["tidy", "--apply=false"], "--apply"],
    [
      "rejects a separate boolean literal after the sync dry-run boolean",
      ["sync", "--dry-run", "false"],
      "--dry-run",
    ],
    [
      "rejects a separate numeric literal after a target and the dry-run boolean",
      ["sync", "omp", "--dry-run", "0"],
      "--dry-run",
    ],
    [
      "rejects a separate boolean literal after the prune boolean",
      ["sync", "--prune", "no"],
      "--prune",
    ],
    [
      "rejects a separate boolean literal after the update no-sync boolean",
      ["update", "--no-sync", "false"],
      "--no-sync",
    ],
  ] as const)("%s", (_name, input, flag) => {
    expect(prepareArgv(input)).toEqual({
      kind: "reject",
      message: `flag ${flag} does not take a value`,
      exitCode: 2,
    });
  });

  it.each([
    [
      "rejects duplicate uses of a non-repeatable boolean flag",
      ["sync", "--prune", "--prune"],
      "--prune",
    ],
    [
      "rejects duplicate uses of a non-repeatable value flag",
      ["tidy", "--repo", "a", "--repo", "b"],
      "--repo",
    ],
    [
      "treats a short alias and its canonical spelling as the same flag",
      ["sync", "-v", "--verbose"],
      "--verbose",
    ],
    [
      "rejects duplicate uses of a non-repeatable global flag",
      ["--log-level", "debug", "--log-level", "info"],
      "--log-level",
    ],
  ] as const)("%s", (_name, input, flag) => {
    expect(prepareArgv(input)).toEqual({
      kind: "reject",
      message: `flag ${flag} was given more than once`,
      exitCode: 2,
    });
  });
});

describe("omp passthrough boundary", () => {
  it.each([
    [
      "forwards a short flag tail behind an injected delimiter",
      ["omp", "-p", "hi"],
      ["omp", "--", "-p", "hi"],
    ],
    [
      "keeps a declared value flag and its value before the boundary",
      ["omp", "--model", "x", "-p", "hi"],
      ["omp", "--model", "x", "--", "-p", "hi"],
    ],
    [
      "starts the tail at a positional message",
      ["omp", "fix the bug"],
      ["omp", "--", "fix the bug"],
    ],
    [
      "preserves an explicit delimiter before an omp flag sharing the launcher's name",
      ["omp", "--", "--model", "upstream"],
      ["omp", "--", "--model", "upstream"],
    ],
    ["leaves a lone picker flag unchanged", ["omp", "--pick"], ["omp", "--pick"]],
    ["leaves help unchanged", ["omp", "--help"], ["omp", "--help"]],
    [
      "forwards an undeclared long flag and its value",
      ["omp", "--mode", "json", "-p", "hi"],
      ["omp", "--", "--mode", "json", "-p", "hi"],
    ],
    [
      "forwards omp's own --models without confusing it with --model",
      ["omp", "--models", "a,b"],
      ["omp", "--", "--models", "a,b"],
    ],
    [
      "skips a global option value before locating the omp passthrough",
      ["--log-level", "debug", "omp", "-p", "hi"],
      ["--log-level", "debug", "omp", "--", "-p", "hi"],
    ],
  ] as const)("%s", (_name, input, args) => {
    expect(prepareArgv(input)).toEqual({ kind: "accept", args });
  });
});

describe("subcommand resolution", () => {
  it.each([
    [
      "skips a separate global flag value and resolves sync",
      ["--log-level", "debug", "sync"],
      "sync",
    ],
    ["skips an inline global flag value and resolves sync", ["--log-level=debug", "sync"], "sync"],
    ["uses the first positional word as the subcommand", ["docs", "sync"], "docs"],
    ["returns no subcommand for an empty invocation", [], undefined],
    ["returns no subcommand for a root global flag", ["--help"], undefined],
  ] as const)("%s", (_name, input, expected) => {
    expect(subcommandName(input)).toBe(expected);
  });
});

describe("registered subcommands", () => {
  it.each(REGISTERED_SUBCOMMANDS)("resolves every registered subcommand: %s", (name) => {
    expect(COMMANDS.map((command) => command.name)).toEqual(REGISTERED_SUBCOMMANDS);
    expect(subcommandName([name])).toBe(name);
    expect(prepareArgv([name, "--help"])).toEqual({ kind: "accept", args: [name, "--help"] });
  });
});
