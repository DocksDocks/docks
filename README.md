# docks-kit

Portable configuration kit for AI coding agents. Per-tool **Single Source of
Truth (SoT)** directories deploy to each tool's user-config location. Clone
once to get a consistent AI-assisted environment on supported Linux, macOS,
and Windows machines. Tuned for **token efficiency without sacrificing quality**.

Supported harness: **Oh My Pi (`omp`)**.
The kit also deploys [agentskills.io](https://agentskills.io) universal skills.

## Quick start

```bash
git clone https://github.com/DocksDocks/public.git ~/projects/public
cd ~/projects/public
./docks-kit harnesses       # choose this machine's flag-less sync harnesses
./docks-kit sync            # deploy this machine's harness selection
./docks-kit sync omp        # deploy omp explicitly
./docks-kit toolchain       # doctor view: verified-version floors for external tools
```

POSIX hosts use the `./docks-kit` launcher on Linux x64 and arm64 and on macOS
arm64. Windows uses `.\docks-kit.ps1` on x64. Each launcher prefers the matching compiled
binary in `cli/dist/` only when its version matches the checkout. Otherwise it
runs from source via Bun and auto-installs Bun plus dependencies when needed.
Hosts outside this matrix fail immediately and never fall back to Bun source.
Stale ignored build artifacts cannot mask newer checkout code.

Other install paths include global `bun add -g docks-kit`, the POSIX curl
installer, and the Windows PowerShell installer. See `./docks-kit docs install`.

**No-Bun recovery path**:

Download the platform release binary from GitHub Releases and run it directly.
The executable carries the generated sync payload; no checkout or adjacent
`SoT/` directory is required.

Source and global installs require Bun. npm-global tools require Node/npm.
`jq` is optional doctor/test tooling. `curl` is needed only to download Bun's
upstream installer when Bun is absent: by the POSIX launcher and installer, and
by sync's Bun bootstrap, which a release binary can also run. The Windows
launcher and installer use Invoke-WebRequest.

## CLI

```text
docks-kit sync [agents] [omp]                   deploy explicit targets or the machine selection
docks-kit harnesses                             view or change this machine's selection
docks-kit update [--no-sync]                    self-update the kit (autodetects checkout vs global install), then sync
docks-kit omp [--model <m>|--pick] [args...]    one omp session on a free model, nothing deployed changes
docks-kit omp --fast                            toggle omp fast mode for OpenAI/Codex models, then exit
docks-kit toolchain [check|ensure <tool>|outdated]  verified-version floors for external tools
docks-kit skills list [--json]                  universal skills vs manifest
docks-kit scratch new|remove                    agent temporary files and directories
docks-kit tidy [--apply] [--report]             remove safe agent leftovers
docks-kit docs [topic]                          self-documentation (9 topics)
--help --version --wizard --completions    built-in
```

The CLI is a typed Effect 4 front-end on Bun; all mutation runs through
EngineNative in `cli/src/engine-native/`, with golden-regression coverage for
dry-run output, mutation snapshots, and argv logs. Its dependency graph is
`effect@4.1.2` (including `effect/cli`), `@effect/platform-bun@4.1.2`
(`BunServices.layer` and `BunRuntime.runMain`), and
`@effect/platform-node-shared@4.1.2`. Tests run on `vitest@5.1.0`.
`bun run lint:effect` checks the Effect rules through `@effect/tsgo`. The
same package can run as the editor's TypeScript language server
(`node_modules/.bin/effect-tsgo tsc --lsp --stdio`).
`@effect/cli` and `@effect/platform` are removed: neither has a 4.x release,
the CLI API moved into core, and the standalone platform package was unused
here.

### Key flags (`docks-kit sync`)

| Flag | Effect |
|------|--------|
| `--dry-run` | Preview without applying |
| `--prune` | Remove kit-managed universal skills not in `SoT/.agents/skills.txt` |
| `--skip-plugin-refresh` | Install missing omp plugins but skip refresh-only updates |
| `--verbose` | Also print no-op confirmations |

Full reference: `docks-kit docs flags` (includes the old→new rename table for
the pre-CLI `sync.sh` flags).

## How syncing works

- **Additive by default** — user-only settings keys, plugins, and skills
  survive a plain sync. Removing kit-managed universal skills that left the
  SoT is explicit (`--prune`).
- **Per-machine selection** — `~/.docks-kit/kit.db` drives a flag-less sync.
  A missing selection selects universal skills and omp. Use
  `docks-kit harnesses` to view or change the selection.
- **Idempotent** — every step is safe to re-run; no-change syncs are no-ops.
- **Toolchain floors** — `SoT/toolchain.json` records the kit-verified version
  floors for external tools (bun, omp, …). `docks-kit toolchain check` prints
  the full doctor table. Bun is the one managed install and is pinned to its
  verified version.
- **Command guards** — omp's policy for destructive shell commands: to
  remove, agents use the trash (`gio trash -- <path>`, or `trash <path>` on
  macOS) or remove a temporary file or directory with
  `docks-kit scratch remove`. omp denies `rm` of the home directory or `/`,
  `HOME` reassignment, every recursive `rm`, `find -delete`, `find -exec rm`,
  and `xargs rm`. The kit ships no omp prompt rule, so omp runs every command
  that no deny matches without a question, in subagents too. Details and
  gaps: `docks-kit docs command-guards`.
- **Agent cleanup (omp)** — `docks-kit scratch` creates agent temporary
  directories and removes agent temporary files and directories with checked
  paths. `docks-kit tidy` lists merged idle worktrees, their containers,
  orphaned processes, and idle scratch directories, and `docks-kit tidy
  --apply` removes them; `--report` lists other disk and memory use. The kit
  omp plugin `docks-kit-omp` exposes these as tools, reminds the agent of
  what it created, and runs the sweep at most once per 12 hours.

## Repository map

| Path | Purpose |
|------|---------|
| `SoT/.omp/` | omp SoT (AGENTS.md, config.yml, models.yml, mcp.json, intercom.json, and the `plugin/` source of `docks-kit-omp`) |
| `SoT/.agents/` | Universal-skill manifest |
| `SoT/toolchain.json` | Verified-version floors |
| `cli/src/engine-native/` | EngineNative sync/toolchain implementation |
| `cli/src/generated/sotPayload.ts` | Generated in-memory payload used by standalone and npm installs |
| `cli/` | docks-kit CLI (Effect 4 on Bun) + bundled docs topics |
| `docks-kit` / `docks-kit.ps1` | POSIX and Windows launchers (binary → Bun-from-source) |
| `install.sh` / `install.ps1` | POSIX and Windows global installers |
| `docs/PLAN.md` | Plan record standard; plans are GitHub issues |
| `AGENTS.md` | Agent-facing engineering rules |

## Platform support

| Platform | Architecture | docks-kit binary | Sync engine |
|----------|--------------|------------------|-------------|
| Linux | x64 | ✅ | ✅ native |
| Linux | arm64 | ✅ | ✅ native |
| macOS | arm64 | ✅ | ✅ native |
| Windows | x64 | ✅ | ✅ native |

Details: `docks-kit docs platforms`.

## Releases

Tagging `cli-v*` builds four standalone binaries: `docks-kit-linux-x64`,
`docks-kit-linux-arm64`, `docks-kit-darwin-arm64`, and
`docks-kit-windows-x64.exe`. The workflow attaches them plus `SHA256SUMS` to the GitHub
release. npm publishes the exact package tarball through trusted publishing
with OIDC provenance.
Published binaries, checksums, and release notes are available on
[GitHub Releases](https://github.com/DocksDocks/public/releases).
Each `docks-kit` npm release bundles the CLI + generated payload, so releases
are versioned config snapshots without shipping the authoring `SoT/` tree.

## Deeper docs

- `docks-kit docs <topic>` - overview, sync-layers, flags, toolchain, install,
  platforms, omp-models, omp-context, command-guards (works offline, bundled
  with the CLI)
- [`AGENTS.md`](AGENTS.md) — engineering rules for agents working on the kit
