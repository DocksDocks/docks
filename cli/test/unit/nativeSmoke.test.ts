import { describe, expect, it } from "vitest";
import { requireBytecode } from "../../scripts/native-smoke";

describe("requireBytecode", () => {
  // The test runtime prints its version with exit 0 but has no embedded
  // docks-kit bytecode, so it stands for a binary that parsed its source
  // again. `smoke:native` itself runs the passing case on each CI host.
  it("refuses a binary whose --version run prints no bytecode cache hit, and names the flag list to check", () => {
    expect(() => requireBytecode(process.execPath)).toThrow(
      /ran without its embedded bytecode: no "\[Disk Cache\] Cache hit for sourceCode" line.*COMPILE_FLAGS/,
    );
  });
});
