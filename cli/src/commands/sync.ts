import { Argument, Command, Flag } from "effect/cli";
import { Effect } from "effect";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { bail, engine } from "../engine";
import { spawnHost } from "../engine-native/exec";
import type { Logger } from "../engine-native/logger";
import { kitHome } from "../kitHome";
import { LoggerService } from "../services";

/** Best-effort update autodetection: nudge (never block, never fail) when
 * the kit checkout is behind its upstream. Silent on detached HEADs, no
 * upstream, no network, no git. git starts through spawnHost, so a Windows
 * host never runs a `git.exe` from the current directory. */
export const updateNudge = (logger: Logger): void => {
  try {
    const home = kitHome();
    if (!existsSync(join(home, ".git"))) return;
    if (
      spawnHost("git", ["-C", home, "fetch", "--quiet"], { stdio: "ignore", timeout: 4000 })
        .status !== 0
    )
      return;
    const res = spawnHost("git", ["-C", home, "rev-list", "--count", "HEAD..@{u}"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const behind = (res.stdout ?? "").trim();
    if (res.status === 0 && behind !== "" && behind !== "0") {
      logger.warn(
        `kit checkout is ${behind} commit(s) behind its upstream — run: docks-kit update`,
      );
    }
  } catch {
    // nudge only — a sync must never fail because the update check did
  }
};

const VALID_TARGETS = ["agents", "omp"];

const targets: Argument.Argument<ReadonlyArray<string>> = Argument.String("target").pipe(
  Argument.withDescription("Sync targets: agents, omp (default: selected harnesses)"),
  Argument.variadic(),
);

const dryRun = Flag.Boolean("dry-run").pipe(
  Flag.withDescription("Preview without applying"),
  Flag.withDefault(false),
);
const prune = Flag.Boolean("prune").pipe(
  Flag.withDescription("Remove kit-managed universal skills not in SoT/.agents/skills.txt"),
  Flag.withDefault(false),
);
const skipPluginRefresh = Flag.Boolean("skip-plugin-refresh").pipe(
  Flag.withDescription(
    "Install missing plugins but skip refresh-only updates for existing plugins",
  ),
  Flag.withDefault(false),
);
const verbose = Flag.Boolean("verbose").pipe(
  Flag.withAlias("v"),
  Flag.withDescription("Also print no-op confirmations (already in sync, up to date, left as-is)"),
  Flag.withDefault(false),
);

export const syncCommand = Command.make(
  "sync",
  {
    targets,
    dryRun,
    prune,
    skipPluginRefresh,
    verbose,
  },
  (config) =>
    Effect.gen(function* () {
      const bad = config.targets.filter((t) => !VALID_TARGETS.includes(t));
      if (bad.length > 0) {
        return yield* bail(
          `Unknown sync target(s): ${bad.join(", ")} (valid: ${VALID_TARGETS.join(", ")})`,
        );
      }

      const args: Array<string> = ["sync", ...config.targets];
      if (config.dryRun) args.push("--dry-run");
      if (config.prune) args.push("--prune");
      if (config.skipPluginRefresh) args.push("--skip-plugin-refresh");
      if (config.verbose) args.push("--verbose");

      // Not on --dry-run: the nudge's git fetch writes FETCH_HEAD/remote
      // refs, and a preview command must not mutate the checkout.
      if (!config.dryRun) {
        const logger = yield* LoggerService;
        yield* Effect.sync(() => updateNudge(logger));
      }
      yield* engine(args);
    }),
).pipe(Command.withDescription("Deploy the SoT to this machine with EngineNative."));
