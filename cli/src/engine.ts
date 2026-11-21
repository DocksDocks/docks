import { CliError } from "effect/cli";
import { Console, Effect } from "effect";
import { runEngineNative } from "./engine-native";
import { targetForHost } from "./engine-native/os/targets";
import { DependencyManagerService, LoggerService, PlatformService } from "./services";

/**
 * The single seam between the typed CLI and EngineNative. Engine execution
 * stays in-process after effect/cli has parsed pickers and flag spellings.
 */
const bashRemovedMessage = "bash engine removed — recover at tag bash-engine-final";
const bashEngineRequested = (): boolean => process.env["DOCKS_KIT_ENGINE"] === "bash";
const requireSupportedHost = () => {
  const platform = process.platform;
  const arch = process.arch;
  return targetForHost(platform, arch) !== undefined
    ? Effect.void
    : bail(
        `unsupported host ${platform}/${arch}; docks-kit supports Linux on x64 and arm64, macOS on arm64, and Windows on x64`,
        2,
      );
};

const failureMessage = (error: unknown): string => {
  if (error instanceof Error && error.message !== "") return error.message;
  return typeof error === "string" && error !== "" ? error : "unknown error";
};

export const engine = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    yield* requireSupportedHost();
    if (bashEngineRequested()) {
      return yield* bail(bashRemovedMessage, 2);
    }
    const logger = yield* LoggerService;
    const deps = yield* DependencyManagerService;
    const platform = yield* PlatformService;
    const code = yield* Effect.tryPromise({
      try: () => runEngineNative(args, { logger, deps, platform }, { envGlobals: false }),
      catch: (error) =>
        new CliError.UserError({
          cause: error,
          userMessage: `engine operation '${args.join(" ") || "default"}' failed: ${failureMessage(error)}`,
        }),
    });
    if (code !== 0) {
      return yield* Effect.sync(() => process.exit(code));
    }
  });

/** Print a message to stderr and exit — for CLI-side validation failures. */
export const bail = (message: string, code = 2) =>
  Console.error(message).pipe(Effect.andThen(Effect.sync(() => process.exit(code))));
