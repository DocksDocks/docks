/**
 * The public CLI refuses each name that the omp-only cutover removed, with
 * the message and exit code that a user sees, and writes nothing into the
 * home folder. Codex left in 0.23.0 (#181), Claude Code in the same release
 * (#182), and universal skills, the sync targets, `--prune`, and the
 * `harnesses` and `skills` commands left in 0.24.0 (#183).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cliEntry } from "../lib/cliEntry";
import { SPAWN_TIMEOUT_MS } from "../lib/spawnTimeout";

const CLI = cliEntry();
const home = mkdtempSync(join(tmpdir(), "removed-names-"));
// The CLI reads its home from USERPROFILE on Windows and from HOME elsewhere.
const env = { ...process.env, HOME: home, USERPROFILE: home };
afterAll(() => rmSync(home, { recursive: true, force: true }));

const HARNESS_FILES = [".agents", ".claude", ".claude.json", ".codex"];

/** Run the public CLI, then check that the refusal wrote no harness file. */
function run(args: ReadonlyArray<string>) {
  const result = spawnSync("bun", [CLI, ...args], {
    encoding: "utf8",
    env,
    timeout: SPAWN_TIMEOUT_MS,
  });
  for (const file of HARNESS_FILES) {
    expect(existsSync(join(home, file)), `${args.join(" ")}: ${file}`).toBe(false);
  }
  return result;
}

describe("names removed by the omp-only cutover", () => {
  it(
    "refuses each sync target word as an unexpected positional argument",
    () => {
      for (const args of [
        ["sync", "agents", "--dry-run"],
        ["sync", "omp", "--dry-run"],
        ["sync", "claude"],
        ["sync", "codex"],
      ]) {
        const word = args[1];
        const result = run(args);
        expect(result.status, word).toBe(1);
        expect(result.stderr, word).toContain(`Unexpected positional argument: "${word}"`);
      }
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "refuses the removed sync flags as unknown flags",
    () => {
      for (const flag of [
        "--claude-model=opus",
        "--claude-effort=high",
        "--claude-advisor=on",
        "--claude-compact-window=680k",
        "--claude-permissive",
        "--claude-plugin=supabase",
        "--reconcile",
        "--codex-model=x",
        "--codex-effort=low",
        "--skip-bubblewrap",
        "--prune",
        "--agents",
        "--omp",
        "--remove-plugins",
      ]) {
        const result = run(["sync", "--dry-run", flag]);
        expect(result.status, flag).toBe(2);
        expect(result.stderr, flag).toContain(`unknown flag ${flag} for 'sync'`);
      }
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "refuses the removed commands as unknown subcommands",
    () => {
      for (const command of ["model", "plugins", "models", "status", "harnesses", "skills"]) {
        const result = run([command]);
        expect(result.status, command).toBe(1);
        expect(result.stderr, command).toContain(`Unknown subcommand "${command}" for "docks-kit"`);
      }
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "refuses the removed toolchain upgrade operation",
    () => {
      const result = run(["toolchain", "upgrade"]);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain(
        "Unknown toolchain op 'upgrade' (valid: check, ensure, outdated)",
      );
    },
    SPAWN_TIMEOUT_MS,
  );
});
