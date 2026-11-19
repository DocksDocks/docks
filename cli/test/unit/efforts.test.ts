import { describe, expect, it } from "vitest";

import {
  advisorCatalog,
  effortCatalog,
  isEffortModifierValue,
  resolveEffort,
  sotEffort,
  validateEffortDefault,
} from "../../src/efforts";

describe("deploy-time effort catalogs", () => {
  it("accepts the catalog limits plus default and rejects unknown efforts", () => {
    expect(isEffortModifierValue("xhigh")).toBe(true);
    expect(isEffortModifierValue("default")).toBe(true);
    expect(isEffortModifierValue("ultra")).toBe(false);
  });

  it("resolves embedded defaults and rejects invalid explicit efforts", () => {
    expect(sotEffort()).toBe("high");
    expect(resolveEffort("claude", "default")).toBe("high");
    expect(resolveEffort("claude", "low")).toBe("low");
    expect(() => resolveEffort("claude", "ultra")).toThrow("Invalid claude effort 'ultra'");
  });

  it("rejects missing or out-of-catalog embedded defaults", () => {
    expect(validateEffortDefault("low")).toBe("low");
    expect(() => validateEffortDefault("max")).toThrow(
      "Embedded SoT Claude effortLevel 'max' is outside the verified catalog",
    );
    expect(() => validateEffortDefault(undefined)).toThrow(
      "Embedded SoT Claude effortLevel is missing",
    );
  });

  it("renders exact discoverable catalogs with per-tool defaults", () => {
    expect(effortCatalog("claude")).toBe(
      [
        "Available claude effort levels (effortLevel; verified 2026-07-10):",
        "  low",
        "  medium",
        "  high",
        "  xhigh",
        "  default  — SoT: high",
      ].join("\n"),
    );
    expect(advisorCatalog()).toBe(
      [
        "Available claude advisor states (advisorModel; verified 2026-09-22):",
        "  on  — set advisorModel: opus",
        "  off  — unset advisorModel",
        "  default  — SoT: off (unset)",
      ].join("\n"),
    );
  });
});
