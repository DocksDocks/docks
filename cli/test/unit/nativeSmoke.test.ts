import { describe, expect, it } from "vitest";
import { checkBinary } from "../../scripts/native-smoke";

describe("checkBinary", () => {
  // The test runtime prints its version with exit 0 but has no embedded
  // docks-kit bytecode, so it stands for a binary that parsed its source
  // again. The bytecode check runs first, so it decides before the version
  // check would. `smoke:native` itself runs the passing case on each CI host.
  it("refuses a binary whose --version run prints no bytecode cache hit, and names the flag list to check", () => {
    expect(() => checkBinary(process.execPath)).toThrow(
      /ran without its embedded bytecode: no "\[Disk Cache\] Cache hit for sourceCode" line.*COMPILE_FLAGS/,
    );
  });
});
