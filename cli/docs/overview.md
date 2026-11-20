# docks-kit overview

docks-kit is a portable configuration kit for AI coding agents. Its Single
Source of Truth (SoT) directory `SoT/.omp/` deploys to the user-config location
of Oh My Pi (`omp`). Clone once, sync everywhere, and get a consistent
AI-assisted dev environment on every machine.

## Pieces

| Piece | Role |
|-------|------|
| `SoT/.omp/` | omp config deployed to `~/.omp/agent/` (AGENTS.md, config.yml, models.yml, mcp.json) plus `intercom.json` for pi intercom, plus the `plugin/` tree, deployed to `~/.docks-kit/omp-plugin` and linked as the `docks-kit-omp` omp plugin |
| `SoT/toolchain.json` | Verified-version floors for external tools (see `docks-kit docs toolchain`) |
| `cli/src/generated/sotPayload.ts` | Deterministic generated payload embedded in standalone/npm execution |
| `cli/src/engine-native/` | EngineNative mutation logic for sync/toolchain and the `docks-kit omp` session overlay |
| `cli/` | This CLI (Effect 4 on Bun) plus bundled docs |
| `docks-kit` / `docks-kit.ps1` | POSIX and Windows launchers: version-matching compiled binary → Bun-from-source, with Bun auto-install |

## Design rules

- **Idempotent**: every sync step is safe to re-run; no-change syncs are no-ops.
- **Quiet on no-ops**: by default a re-run prints only real changes, warnings
  (with a platform-correct install command when a tool is missing), and the
  summary; `--verbose` / `-v` also prints the no-op confirmations.
- **Additive by default**: user-only keys and plugins survive a plain sync.
- **Engine/CLI split**: the CLI adds UX (typed flags, pickers, docs, JSON);
  EngineNative owns mutation. No-Bun recovery is a platform release binary.
- **Authoring/runtime split**: changes begin in `SoT/`; build/prepack freshness
  checks keep the generated in-memory payload byte-identical for every runtime.

## Where to go next

- `docks-kit docs sync-layers` — what a sync actually touches
- `docks-kit docs flags` — full flag reference
- `docks-kit toolchain` — doctor view of this machine's external tools
