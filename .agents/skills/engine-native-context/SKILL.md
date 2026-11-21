---
name: engine-native-context
description: "Use when modifying cli/src/engine-native, the cli/src/engine.ts engine seam or requireSupportedHost, the cli/src/main.ts native-raw harness path, cli/test/golden-dryrun.ts, cli/test/golden-mutation.ts, cli/test/lib/golden*.ts, or cli/test/goldens; covers the golden-regression contract, the removed-engine failure for DOCKS_KIT_ENGINE value bash, the p() slash-join rule, ExitError aborts, jq.ts JSON helpers, prove-red, GOLDEN_FILTER, and supported-host rejection before engine execution. Not for sync flags or sync dispatch (use sync-orchestration-context) or toolchain pins and installs (use toolchain-context)."
user-invocable: false
metadata:
  pattern: tool-wrapper
  source_files:
    - path: cli/src/engine-native/index.ts
      lines: "1-66"
    - path: cli/src/engine.ts
      lines: "1-53"
    - path: cli/src/main.ts
      lines: "1-89"
    - path: cli/src/engine-native/exec.ts
      lines: "1-346"
    - path: cli/src/engine-native/jq.ts
      lines: "1-38"
    - path: cli/src/engine-native/parseHelp.ts
      lines: "1-26"
    - path: cli/src/engine-native/os/targets.ts
      lines: "1-64"
    - path: cli/test/unit/engine.test.ts
      lines: "1-112"
    - path: cli/test/golden-dryrun.ts
      lines: "1-199"
    - path: cli/test/golden-mutation.ts
      lines: "1-398"
    - path: cli/test/lib/goldenResources.ts
      lines: "1-316"
    - path: cli/test/lib/goldenExecution.ts
      lines: "1-298"
    - path: cli/test/lib/goldenSnapshot.ts
      lines: "1-189"
    - path: cli/test/lib/goldenCli.ts
      lines: "1-52"
    - path: cli/test/lib/goldenMutationCatalog.ts
      lines: "1-58"
    - path: cli/test/lib/goldenPlatform.ts
      lines: "1-18"
    - path: cli/test/lib/goldenProveRed.ts
      lines: "1-63"
  updated: "2026-11-19"
---

# EngineNative Golden Contract

EngineNative is the only supported engine. The deleted shell engine is preserved
only at the `bash-engine-final` tag for archaeology; `DOCKS_KIT_ENGINE` value `bash`
must fail with the removed-engine message (`engine.ts bashRemovedMessage`) instead
of selecting another runtime.

Pointers here name concepts, not coordinates — if a path or symbol moved, trust the stated purpose and re-locate it (grep the symbol) before acting.

<constraint>
Golden tests are the regression contract. Any EngineNative behavior change must
either keep `bun run golden:dryrun` and `bun run golden:mutation` green or update
goldens deliberately with `--update-goldens` and a reviewed diff.
</constraint>

<constraint>
`--prove-red` must stay red. A harness that cannot detect planted mismatches is
not a regression test.
verify: `bun cli/test/golden-dryrun.ts --prove-red` and
`bun cli/test/golden-mutation.ts --prove-red` must print `prove-red OK` and exit 1;
`bunx vitest run cli/test/unit/goldenProveRed.test.ts` must reject an
invariant-only failure as proof.
</constraint>

<constraint>
Build output-visible paths with `exec.ts p`, not `node:path.join`.
Engine output is snapshotted and must use forward slashes across platforms.
</constraint>

<constraint>
Use `ExitError` (`parseHelp.ts`, re-exported by `parseArgs.ts`) for intentional
engine aborts and validation failures; `index.ts runEngineNative` turns it into
the exit code. Swallowing a failed child process turns a real sync failure into a
success log.
</constraint>

## Golden Suites

| Suite | Script | Records |
|-------|--------|---------|
| Dry-run | `bun run golden:dryrun` | Normalized output for fixture and command combinations. |
| Mutation | `bun run golden:mutation` | Resulting file trees, backups, argv logs, output, and TOML invariants. |

`--update-goldens` regenerates snapshots from the live native engine.
`GOLDEN_FILTER=<regex>` scopes a run (`goldenCli.ts parseArgs`, `labelSelected`).
Golden files live in `cli/test/goldens/`. The golden scripts refuse a Windows
host with exit 2, because snapshots are Linux-canonical.
verify: `GOLDEN_FILTER='(' bun run golden:dryrun` must exit 2 with
`invalid GOLDEN_FILTER`; a filter that matches no case must exit 2 with
`GOLDEN_FILTER matched no cases`.

## Harness Geometry

- Public CLI paths route through `cli/src/engine.ts engine`, which runs
  `runEngineNative` in-process with env globals disabled.
  verify: `bunx vitest run cli/test/unit/engine.test.ts -t "runs the public engine with env globals disabled"`.
- `DOCKS_KIT_ENGINE=native-raw` is harness-private and bypasses Effect CLI
  parsing so tests can feed raw argv (`main.ts` raw-channel branch). Only this
  channel honors the unprefixed env globals.
- Golden children preload `goldenPlatform.ts` (`goldenExecution.ts childEntryArgs`),
  which pins `process.platform` to `linux` unless a case sets `nativeHost`, so a
  snapshot does not depend on the recording host.
- Stubs record child-process argv (`goldenResources.ts` stub runner,
  `GOLDEN_ARGV_LOG`), so command shape is part of the contract.

## JSON Helpers

- `jq.ts compareCodepoints` mirrors jq string order: it compares Unicode
  codepoints, not UTF-16 code units. `toolchain.ts report` and
  `syncDispatch.ts folderLockPaths` sort with it (verify: `grep -rn
  compareCodepoints cli/src/engine-native` lists every caller).
- `jq.ts parseJson` returns `undefined` for invalid JSON instead of throwing;
  `isObject` narrows a parsed value to a plain object.

## Supported-host boundary

- `engine.ts requireSupportedHost, pre-execution gate` admits exactly the
  platform/arch pairs in `os/targets.ts HOST_TARGETS` and runs before
  `runEngineNative`.
  verify: `grep -n 'target("' cli/src/engine-native/os/targets.ts` lists the
  admitted pairs.
- `engine.test.ts supported host boundary` runs `engine` once per
  `HOST_TARGETS` host and proves each one reaches EngineNative. Add a case when a
  host joins `HOST_TARGETS`.
- `engine.test.ts unsupported host boundary` runs `engine` on hosts outside
  `HOST_TARGETS` and proves exit 2, the support-matrix message, and that
  `runEngineNative` never runs.
  verify: `bunx vitest run cli/test/unit/engine.test.ts -t "host boundary"`.
- Golden normalization canonicalizes CRLF to LF and scrubs temp paths for
  deterministic fixtures; that normalization is not a supported-host path.
  `goldenSnapshot.ts normalizeOutput` normalizes stdout and stderr.
  `goldenSnapshot.ts normalizeTreeBody` normalizes each text artifact in a
  `snapshotTree` tree.
  `snapshotTree` hashes any other file as raw bytes, so a binary artifact keeps
  its CRLF bytes.
  verify (tree path only): `bunx vitest run cli/test/unit/goldenSnapshot.test.ts -t "still canonicalizes CRLF in explicitly textual artifacts"`
  and `bunx vitest run cli/test/unit/goldenSnapshot.test.ts -t "hashes binary CRLF bytes without text normalization"`.
  Unprobed: no unit test runs `normalizeOutput`. Read its CRLF line (verify:
  `grep -n -A1 "function normalizeOutput" cli/test/lib/goldenSnapshot.ts`).

## Gotchas

- A deliberate output text change can break many dry-run goldens at once. Use
  `GOLDEN_FILTER` to localize first, then update snapshots deliberately.
- Tests that mutate temp HOME are fine; do not run real syncs against the user's
  live home as part of golden maintenance.
- Keep the removed-engine failure covered. Silent native fallback when
  `DOCKS_KIT_ENGINE` is set to `bash` violates the removal contract.
  verify: `bunx vitest run cli/test/unit/engine.test.ts -t "rejects a removed Bash engine"`.
