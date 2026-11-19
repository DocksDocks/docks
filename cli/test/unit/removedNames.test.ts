/**
 * The public CLI refuses each name that the omp-only cutover removed, with
 * the message and exit code that a user sees, and writes nothing into the
 * home folder. Codex left in 0.23.0 (#181), Claude Code in the same release
 * (#182).
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
const env = { ...process.env, HOME: home, AGENTS_DIR: join(home, ".agents") };
afterAll(() => rmSync(home, { recursive: true, force: true }));

function run(args: ReadonlyArray<string>) {
  return spawnSync("bun", [CLI, ...args], { encoding: "utf8", env, timeout: SPAWN_TIMEOUT_MS });
}

describe("names removed by the omp-only cutover", () => {
  it(
    "refuses the removed sync targets and lists the remaining ones",
    () => {
      for (const target of ["claude", "codex"]) {
        const result = run(["sync", target, "--dry-run"]);
        expect(result.status, target).toBe(2);
        expect(result.stderr, target).toContain(
          `Unknown sync target(s): ${target} (valid: agents, omp)`,
        );
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
      for (const command of ["model", "plugins", "models", "status"]) {
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

  it("writes no Claude Code or Codex file into the home folder", () => {
    expect(existsSync(join(home, ".claude"))).toBe(false);
    expect(existsSync(join(home, ".codex"))).toBe(false);
  });
});
