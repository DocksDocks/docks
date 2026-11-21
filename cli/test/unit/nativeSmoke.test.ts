import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hostOs } from "../../src/engine-native/os/index";
import { BUN_RUNTIME } from "../lib/cliEntry";

const REPO_DIR = resolve(import.meta.dirname, "..", "..", "..");
const roots: Array<string> = [];
const currentHost = hostOs().id;
// The fake compiler and the fake binary are POSIX shell scripts, as in buildBinaries.test.ts.
const FAKE_BUN_APPLIES = currentHost === "linux" || currentHost === "darwin";
const suiteLabel = FAKE_BUN_APPLIES
  ? "smoke:native"
  : "smoke:native (skipped: the fake compiler is a POSIX shell script and does not apply to this host)";

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * A copy of `native-smoke.ts` and the modules it imports in a temporary
 * checkout, so the run writes its binary there and never into this
 * checkout's `cli/dist`, and a fake `bun` whose `build` writes a binary that
 * prints its version and no bytecode cache line.
 */
function fixture(): { script: string; fakeBin: string } {
  const root = mkdtempSync(join(tmpdir(), "docks-native-smoke-"));
  roots.push(root);
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ version: "9.9.9" })}\n`);
  cpSync(
    join(REPO_DIR, "cli", "scripts", "native-smoke.ts"),
    join(root, "cli", "scripts", "native-smoke.ts"),
  );
  cpSync(
    join(REPO_DIR, "cli", "src", "engine-native", "os"),
    join(root, "cli", "src", "engine-native", "os"),
    {
      recursive: true,
    },
  );
  cpSync(
    join(REPO_DIR, "cli", "src", "engine-native", "exec.ts"),
    join(root, "cli", "src", "engine-native", "exec.ts"),
  );

  const fakeBin = join(root, "test-bin");
  mkdirSync(fakeBin);
  const bun = join(fakeBin, "bun");
  writeFileSync(
    bun,
    `#!/bin/sh
[ "$1" = build ] || exit 2
while [ "$#" -gt 0 ]; do
  if [ "$1" = --outfile ]; then
    printf '#!/bin/sh\\necho 9.9.9\\n' > "$2"
    chmod +x "$2"
    exit 0
  fi
  shift
done
exit 2
`,
  );
  chmodSync(bun, 0o755);
  return { script: join(root, "cli", "scripts", "native-smoke.ts"), fakeBin };
}

describe.skipIf(!FAKE_BUN_APPLIES)(suiteLabel, () => {
  it("exits 1 and names the flag list when the compiled binary runs without its embedded bytecode", () => {
    const { script, fakeBin } = fixture();
    const run = spawnSync(BUN_RUNTIME, [script], {
      encoding: "utf8",
      env: { ...process.env, PATH: [fakeBin, "/usr/bin", "/bin"].join(delimiter) },
    });
    expect(run.stdout).toContain("[native-smoke] compile:");
    expect(run.stdout).not.toContain("[native-smoke] bytecode:");
    expect(run.stderr).toMatch(
      /ran without its embedded bytecode: no "\[Disk Cache\] Cache hit for sourceCode" line.*COMPILE_FLAGS/,
    );
    expect(run.status).toBe(1);
  });
});
