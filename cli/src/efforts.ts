import { sotClaudeSettings, type Tool } from "./manifests";

export const CLAUDE_EFFORT_LEVELS = ["low", "medium", "high", "xhigh"] as const;
export const CLAUDE_ADVISOR_STATES = ["on", "off", "default"] as const;

const VERIFIED = "2026-07-10";
const ADVISOR_VERIFIED = "2026-09-22";
const DEFAULT = "default";

const upstreamEfforts: ReadonlyArray<string> = CLAUDE_EFFORT_LEVELS;

export const effortModifierValues: ReadonlyArray<string> = [...upstreamEfforts, DEFAULT];

export const effortValueGrammar = (): string => effortModifierValues.join("|");

export const effortFlagGrammar = (tool: Tool): string =>
  `--${tool}-effort=<${effortValueGrammar()}>`;

export const advisorValueGrammar = (): string => CLAUDE_ADVISOR_STATES.join("|");

export const advisorFlagGrammar = (): string => `--claude-advisor=<${advisorValueGrammar()}>`;

export const isEffortModifierValue = (value: string): boolean =>
  effortModifierValues.includes(value);

export function validateEffortDefault(value: unknown): string {
  if (typeof value !== "string" || value === "") {
    throw new Error("Embedded SoT Claude effortLevel is missing");
  }
  if (!upstreamEfforts.includes(value)) {
    throw new Error(`Embedded SoT Claude effortLevel '${value}' is outside the verified catalog`);
  }
  return value;
}

export function sotEffort(): string {
  return validateEffortDefault(sotClaudeSettings().effortLevel);
}

export function resolveEffort(tool: Tool, value: string): string {
  if (value === DEFAULT) return sotEffort();
  if (!upstreamEfforts.includes(value)) {
    throw new Error(`Invalid ${tool} effort '${value}'`);
  }
  return value;
}

export function effortCatalog(tool: Tool): string {
  return [
    `Available ${tool} effort levels (effortLevel; verified ${VERIFIED}):`,
    ...upstreamEfforts.map((value) => `  ${value}`),
    `  default  — SoT: ${sotEffort()}`,
  ].join("\n");
}

export function advisorCatalog(): string {
  return [
    `Available claude advisor states (advisorModel; verified ${ADVISOR_VERIFIED}):`,
    "  on  — set advisorModel: opus",
    "  off  — unset advisorModel",
    "  default  — SoT: off (unset)",
  ].join("\n");
}
