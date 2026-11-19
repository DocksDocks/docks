/**
 * EngineNative run context: the shared `Ctx` shape plus its construction from
 * the environment. Split from index.ts, which re-exports the public surface
 * so existing import paths keep working.
 */
import { p } from "./exec";
import { engineHome } from "./harnesses";
import type { TerminalLease } from "./logger";
import type { BunRuntimeState } from "./bun";
import { kitHome } from "../kitHome";
import type { EngineServices } from "./services";
import type { SyncConcurrency } from "./syncConcurrency";

export interface Ctx {
  readonly repoDir: string;
  readonly home: string;
  readonly agentsDir: string;
  readonly interactive: boolean;
  dryRun: boolean;
  verbose: boolean;
  skipPluginRefresh?: boolean;
  prune: boolean;
  /** Injected capability seam (logger/deps/platform) — see services.ts. */
  readonly services: EngineServices;
  syncConcurrency: SyncConcurrency;
  terminalLease?: TerminalLease;
  bunRuntime?: Promise<BunRuntimeState>;
  targetFilterSet: boolean;
  syncAgents: boolean;
  syncOmp: boolean;
  /** Per-run next-step triggers (Output Policy): advice prints only when its trigger changed or --verbose. */
  readonly nextStepTriggers: {
    skillsRestart: boolean;
    ompRestart: boolean;
    /** A marketplace plugin upgrade changed a version, so running omp sessions lost its folder. */
    ompPluginUpgraded: boolean;
  };
  /** Harness-CLI operations that failed this run; a non-empty list fails the sync. */
  readonly failures: Array<string>;
}

export interface CtxOptions {
  /**
   * True only on the harness-private native-raw channel: seed `Ctx` from the
   * unprefixed env globals DRY_RUN, DOCKS_KIT_VERBOSE, PRUNE, and AGENTS_DIR
   * (the historical ${VAR:-default} contract). The public CLI takes the same
   * behavior from flags.
   */
  readonly envGlobals: boolean;
}

/**
 * Build the run context. HOME and DOCKS_KIT_INTERACTIVE apply on every path;
 * the env globals apply only when `options.envGlobals` is true.
 */
export function makeCtx(services: EngineServices, options: CtxOptions): Ctx {
  const env = process.env;
  const home = engineHome(env);
  const globals: NodeJS.ProcessEnv = options.envGlobals ? env : {};
  return {
    repoDir: kitHome(),
    home,
    agentsDir:
      globals["AGENTS_DIR"] !== undefined && globals["AGENTS_DIR"] !== ""
        ? globals["AGENTS_DIR"]
        : p(home, ".agents"),
    interactive:
      env["DOCKS_KIT_INTERACTIVE"] === "1" ||
      (env["DOCKS_KIT_INTERACTIVE"] !== "0" &&
        process.stdout.isTTY === true &&
        process.stdin.isTTY === true),
    dryRun: globals["DRY_RUN"] === "1",
    verbose: globals["DOCKS_KIT_VERBOSE"] === "1",
    skipPluginRefresh: false,
    prune: globals["PRUNE"] === "1",
    syncConcurrency: 3,
    services,
    targetFilterSet: false,
    syncAgents: false,
    syncOmp: false,
    nextStepTriggers: {
      skillsRestart: false,
      ompRestart: false,
      ompPluginUpgraded: false,
    },
    failures: [],
  };
}
