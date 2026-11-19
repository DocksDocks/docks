/**
 * Golden platform pin (test-only; loaded via `bun --preload`).
 *
 * The engine reads the host OS through `os.ts rawPlatform`, and the install
 * hints in the `toolchain check` table and in missing-tool warnings come from
 * the per-OS `hostOs` table, so an unpinned run records different hints on
 * macOS than on Linux. The recorded snapshots
 * are shared by every host and by CI, so they must not depend on who recorded
 * them. Pinning here rather than behind an engine-read environment variable
 * keeps the override entirely inside the harness: production code has no way
 * to spoof the platform.
 */
Object.defineProperty(process, "platform", {
  value: "linux",
  configurable: true,
  enumerable: true,
  writable: false,
});
