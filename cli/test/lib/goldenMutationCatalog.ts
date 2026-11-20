export interface MutationMatrixCase {
  fixture: string;
  cmd: Array<string>;
  stubs?: Record<string, string | null>;
  variant?: string;
}

export interface MutationReplayCase {
  fixture: string;
  cmd: Array<string>;
}

// `variant` disambiguates rows whose fixture+cmd+stub-keys are identical but
// whose stub BODIES differ — without it their labels collide and the later
// row silently overwrites the earlier one's golden.
export const MATRIX: Array<MutationMatrixCase> = [
  { fixture: "home-fresh", cmd: ["sync"] },
  { fixture: "home-fresh", cmd: ["sync"], stubs: { omp: null } },
  // omp is present but every plugin/marketplace subcommand exits non-zero: the
  // run must list each failed operation under `--- Failures ---` and exit 1
  // instead of reporting a clean sync over a stale plugin.
  {
    fixture: "home-fresh",
    cmd: ["sync"],
    stubs: {
      omp: `if (args[0] === "--version") {
  console.log("omp/19.0.0")
} else if (args[0] === "plugin" && args[1] === "list") {
  console.log('{"npm":[],"marketplace":[]}')
} else {
  console.error("stub omp operation failure")
  process.exitCode = 1
}`,
    },
    variant: "plugin-failure",
  },
  { fixture: "home-fresh", cmd: ["toolchain", "check"] },
  {
    fixture: "home-fresh",
    cmd: ["sync"],
    stubs: { jq: null },
    variant: "jq-absent-native-sync",
  },
  // Missing git: one hint-bearing warn from the dependency registry.
  { fixture: "home-fresh", cmd: ["sync"], stubs: { git: null } },
];

/**
 * Sequential same-HOME replay rows — run the command twice against ONE home
 * and golden the SECOND run, so repeat-run output (the "already in sync"
 * surface) is pinned explicitly.
 */
export const REPLAYS: Array<MutationReplayCase> = [
  { fixture: "home-fresh", cmd: ["sync"] },
  { fixture: "home-drift", cmd: ["sync"] },
  // Verbose replay: the demoted no-op confirmations must come back.
  { fixture: "home-fresh", cmd: ["sync", "--verbose"] },
];
