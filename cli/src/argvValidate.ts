/**
 * Per-command validation for the Effect CLI layer: unknown-command/flag
 * detection, and boolean-value and duplicate rejection.
 * Operates on scanned flags so the grammar machinery stays in argvSurface.ts.
 */

import type { ArgvSurfaces, FlagSurface, ScannedFlag } from "./argvSurface";

/**
 * Run the validation checks in diagnostic order. Returns the reject message
 * for the first failure, or undefined when the scanned flags are valid.
 */
export const validateScannedArgv = (
  subcommand: string | undefined,
  commandSurface: FlagSurface | undefined,
  surfaces: ArgvSurfaces,
  flags: ReadonlyArray<ScannedFlag>,
): string | undefined => {
  const unknownCommandWouldMisdiagnoseFlag =
    subcommand !== undefined &&
    commandSurface === undefined &&
    flags.some((flag) => flag.canonicalName === undefined);
  if (unknownCommandWouldMisdiagnoseFlag) {
    return `unknown command '${subcommand}'`;
  }

  // Effect 4 expands clustered shorts, but the kit declares no clusterable alias
  // pair, so refusing a cluster as one unknown flag is the conservative direction.
  for (const flag of flags) {
    if (flag.canonicalName !== undefined) continue;
    const scope = subcommand === undefined ? "" : ` for '${subcommand}'`;
    return `unknown flag ${flag.token}${scope}`;
  }

  for (const flag of flags) {
    if (!flag.hasValue || flag.takesValue) continue;
    // These booleans are presence-based; Effect 4 would otherwise let `--dry-run=false`
    // or `--dry-run false` read as no dry run while performing a real mutating sync.
    return `flag ${flag.name} does not take a value`;
  }

  const seen = new Set<string>();
  for (const flag of flags) {
    const name = flag.canonicalName;
    if (name === undefined) continue;
    const duplicateAllowed =
      commandSurface?.repeatableFlags.includes(name) === true ||
      surfaces.globalSurface.repeatableFlags.includes(name) ||
      surfaces.globalSurface.actionFlags.has(name);
    if (!duplicateAllowed && seen.has(name)) {
      return `flag ${name} was given more than once`;
    }
    seen.add(name);
  }

  return undefined;
};
