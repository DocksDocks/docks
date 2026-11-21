import { describe, expect, it } from "vitest";
import { bytecodeProblem } from "../../scripts/native-smoke";

// The log lines of a compiled docks-kit binary's `--version` run with
// BUN_JSC_verboseDiskCache=1, as Bun 1.4.4 prints them (plan #191).
const VERSION_LINE = "0.26.1";
const HIT = "[Disk Cache] Cache hit for sourceCode";
const MISS = "[Disk Cache] Cache miss for sourceCode";

describe("bytecodeProblem", () => {
  it("accepts a run that used the embedded bytecode, beside a miss for Bun's own builtins", () => {
    expect(bytecodeProblem(`${VERSION_LINE}\n${MISS}\n${HIT}\n`)).toBeUndefined();
  });

  it("refuses a run that parsed the source again, and names the flag list to check", () => {
    const problem = bytecodeProblem(`${VERSION_LINE}\n${MISS}\n${MISS}\n`);
    expect(problem).toContain("ran without its embedded bytecode");
    expect(problem).toContain("COMPILE_FLAGS");
  });

  it("refuses a run that printed no cache line at all", () => {
    expect(bytecodeProblem(`${VERSION_LINE}\n`)).toContain("ran without its embedded bytecode");
  });
});
