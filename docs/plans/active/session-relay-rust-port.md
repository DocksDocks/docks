---
title: Port session-relay to a single Rust binary (zero-runtime, both tools)
goal: Replace session-relay's Node payload with one static Rust `relay` binary (4 committed arches + sh launcher) so a Codex host needs no Node, enabling kernel flock locking.
status: planned
created: "2026-07-01T15:56:09-03:00"
updated: "2026-07-01T17:06:53-03:00"
started_at: null
assignee: null
tags: [rust, session-relay, plugin, cross-tool, build, ci]
affected_paths:
  - plugins/session-relay/rust/
  - plugins/session-relay/bin/
  - plugins/session-relay/.claude-plugin/plugin.json
  - plugins/session-relay/.codex-plugin/bus.mcp.json
  - plugins/session-relay/hooks/hooks.json
  - plugins/session-relay/hooks/codex-hooks.json
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - plugins/session-relay/skills/productivity/session-relay/scripts/relay.mjs
  - plugins/session-relay/mcp/bus.mjs
  - plugins/session-relay/lib/store.mjs
  - plugins/session-relay/lib/discover.mjs
  - plugins/session-relay/hooks/session-start.mjs
  - plugins/session-relay/test/selftest.mjs
  - .github/workflows/ci.yml
  - .github/workflows/build-binaries.yml
  - .github/AGENTS.md
  - scripts/lib/plugins.mjs
  - scripts/ci.mjs
  - scripts/release.mjs
  - .gitignore
related_plans: [session-relay-cross-tool-bus, session-relay-auto-discovery]
review_status: null
planned_at_commit: "7ee6a0de28bdae9109282cfba3acc5803df69242"
---

# Port session-relay to a single Rust binary (zero-runtime, both tools)

## Goal

Replace session-relay's five store-touching Node `.mjs` files with **one statically-linked Rust binary** (`relay`, multi-call via subcommands) so the plugin runs on a **Codex-only host that has no Node installed** — the single real gap in today's cross-tool story. "Replace" means the five `.mjs` are **deleted** and every manifest/hook/test path resolves to `${CLAUDE_PLUGIN_ROOT}/bin/relay`. The port also (a) upgrades the cross-process store lock from a hand-rolled mkdir-mutex + stale-reclaim to a **kernel-managed `flock`** (auto-released on crash), and (b) cuts per-`Write` hook cold-start from ~20–60 ms (Node) to ~1–5 ms (native). Success = both tools launch the bus/hook/CLI from `bin/relay`, every existing security/self-test invariant still passes, all four arch binaries are committed, and `node scripts/ci.mjs` is green.

**Why now / why Rust (decision rationale):** A prior multi-language analysis (this branch) concluded a compiled binary is the *only* option that removes the consumer runtime dependency — Python/uv only grows it. Rust was chosen over Go for the smaller committed artifact (binaries live in git), no-GC purity, ecosystem alignment with Codex (itself Rust), and being the more correct home for the concurrency-critical store. macOS was verified a **non-issue** for this git-clone-delivered CLI: a free Apple-Silicon `macos-latest` runner builds both darwin arches with zero cross-toolchain (arm64 native + x86_64 via the added target), and Gatekeeper/notarization never fires on a git-cloned (non-quarantined) binary. Scope (**commit binaries in-tree**, full 5-file port) was chosen by the maintainer over download-on-first-run.

## Context & rationale

- **Why one binary, not per-file:** the flock upgrade is **all-or-nothing**. `~/.agent-relay` is a store shared by the bus, the hook, and the CLI; `flock` only interlocks with other `flock` callers and Node has no stable `flock`. If any store toucher stays Node (mkdir-mutex), mutual exclusion silently breaks. Collapsing the 3 process entry points + 2 library modules into one executable guarantees every toucher shares one lock implementation by construction — which is also why the 5 `.mjs` must be **deleted**, not left as orphaned Node store touchers.
- **Entry points → subcommands:** `mcp/bus.mjs` → `relay bus`; `hooks/session-start.mjs` (argv `codex` tag) → `relay hook [codex]`; `skills/.../scripts/relay.mjs` (already subcommand-shaped) → `relay discover|list|register|send|inbox|wake`. `lib/store.mjs` + `lib/discover.mjs` are `import`ed modules today → internal Rust modules `store.rs` / `discover.rs`. The `bus.mjs:111,130` hint strings (they point users at the relay CLI) move into `bus.rs`/`cli.rs`, not the deleted `bus.mjs`.
- **Why binaries are committed in-tree, not shipped as Release assets (delivery model):** the whole point is "every consumer, Codex or Claude, works just by installing." Plugins are delivered by **git clone** (marketplace → local cache); `${CLAUDE_PLUGIN_ROOT}` resolves to that cloned tree. A GitHub **Release asset is never cloned**, so a consumer would get a plugin with no binary. Therefore the four arch binaries MUST live in `plugins/session-relay/bin/` **inside the tagged commit**. `gh release create` (which `release.mjs` runs) is only the human-facing changelog — not a delivery channel.
- **Chicken-and-egg this forces:** `release.mjs` tags `HEAD`, and that tag push **is** the CI gate. So the binaries must already be in `HEAD` when `release.mjs` runs — they **cannot** be produced by the tag-triggered CI (it fires *after* the tag exists). Order is forced: build (pre-tag) → commit into `bin/` → `release.mjs` bumps + tags + gates. Hence `build-binaries.yml` runs on `workflow_dispatch` (pre-release), never on the tag.
- **Who builds the four binaries — GitHub Actions is the single canonical producer (resolved decision):** darwin needs a genuine Apple SDK (no osxcross; `cross`/Docker cannot ship darwin images — [cross-rs README](https://github.com/cross-rs/cross)), so the **Linux host can only make the 2 musl arches, never darwin**. The producer is a **GitHub Actions matrix** (`build-binaries.yml`), free+unlimited on public repos ([GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)): **one Apple-Silicon `macos-latest` (arm64) runner builds BOTH darwin arches** — `aarch64-apple-darwin` native + `x86_64-apple-darwin` via `rustup target add` (Apple's universal SDK cross-compiles Intel from Apple Silicon) — plus **one `ubuntu-latest`** for both linux-musl arches. Four binaries, two free runners. (`macos-13`, the old Intel image, was **retired**; Intel is now `macos-*-intel` — but we don't need an Intel runner since arm64 cross-builds the Intel-darwin leg.) Download the four artifacts + `SHA256SUMS`, **commit into `bin/` before tagging**; `release.mjs` does **not** build darwin — it *asserts* all four exist and `sha256sum -c` passes, then version-bumps + tags. First-cut artifact→commit is **manual**; a bot-commit automation is a follow-up.
- **No local "build-all" second path (decision — why not a Mac script):** a committed `build-all.sh` maintained in lockstep with the workflow would be a duplicate build system (drift risk + env variance vs the controlled CI runner) for zero benefit toward "every consumer just installs it" — CI already produces all four. Developing from the MacBook needs only the **host leg** (`ci.mjs` builds `aarch64-apple-darwin` natively). Producing all four locally is *possible* (the four `cargo build --target …` commands, darwin native+cross on the Mac, musl via `cross`) and documented as an optional escape hatch, but is not a maintained artifact.
- **CI provisioning (resolved decision):** because step 5 wires `cargo build` (host leg only) into `ci.mjs`, and `.github/AGENTS.md` doctrine is "ci.yml runs ci.mjs → cannot drift," the `validate` job in `ci.yml` **must** gain a Rust-provisioning step (SHA-pinned toolchain action + `rustup target add <host>` + `apt-get install musl-tools`). `ci.mjs` builds only the host-arch leg for the self-test and verifies the committed binaries' checksums; it never builds darwin.
- **Out-of-plugin, deferred:** `plugins/docks/hooks/context-tree-nudge.mjs` is a *different* plugin, store-less, no flock coupling — leave it Node; a `plugins/docks/bin/ctnudge` port is a separate follow-up plan (folding it in would cross the plugin boundary).
- **Pre-existing bug this plan also fixes:** `.github/workflows/ci.yml` triggers tag-CI only on `docks--v*` (line 14); session-relay tags are `session-relay--v*`, so `release.mjs`'s tag-CI wait finds no run and errors. Session-relay releases are un-gated today. Fixing it (step 1) makes the `validate` workflow run on a session-relay tag, so `release.mjs`'s tag-CI wait resolves and the release is actually gated.

## Environment & how-to-run

- **Toolchain:** Node 24.x + pnpm (`corepack enable`) for the existing gate; **Rust ≥ 1.85** (edition 2024 stabilized in 1.85.0, 2025-02-20 — [Rust blog](https://blog.rust-lang.org/2025/02/20/Rust-1.85.0/)) with `cargo`. `rustup target add x86_64-unknown-linux-musl aarch64-unknown-linux-musl x86_64-apple-darwin aarch64-apple-darwin`. The Linux aarch64-musl leg needs `musl-tools` + an aarch64 cross-linker (or `cross`); **both darwin legs build on ONE Apple-Silicon runner** (`macos-latest`/`macos-15`, arm64): `aarch64-apple-darwin` native + `x86_64-apple-darwin` via the cross target. The Linux host cannot build darwin at all.
- **Setup:** `corepack enable && pnpm install --frozen-lockfile` (once).
- **Local gate:** `node scripts/ci.mjs` — builds ONLY the host-arch `relay` leg + runs the self-test against it + verifies committed binary checksums. Must be green before any commit.
- **Build host-arch binary (local):** `cargo build --release --manifest-path plugins/session-relay/rust/Cargo.toml` then copy `target/release/relay` → `plugins/session-relay/bin/relay-<hostTarget>`.
- **Build all 4 (canonical, CI):** trigger `.github/workflows/build-binaries.yml` (`workflow_dispatch`); download the four artifacts + `SHA256SUMS`; commit them into `plugins/session-relay/bin/`.
- **Build all 4 locally (optional escape hatch, from an Apple-Silicon Mac):** `cargo build --release --target aarch64-apple-darwin && cargo build --release --target x86_64-apple-darwin` (both darwin) + `cross build --release --target {x86_64,aarch64}-unknown-linux-musl` (both Linux); then `sha256sum relay-* > SHA256SUMS`. Not a committed script — just the commands, for offline/CI-down releases. The Linux host can only do the two musl legs.
- **Rust tests:** `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml` (store internals + cross-process lock race, via `env!("CARGO_BIN_EXE_relay")`).
- **Self-test (black-box):** `node plugins/session-relay/test/selftest.mjs` (spawns `bin/relay`). **Plugin lint:** `claude plugin validate ./plugins/session-relay`.

## Interfaces & data shapes

- **`${CLAUDE_PLUGIN_ROOT}`** = `plugins/session-relay/`; `bin/` = `${CLAUDE_PLUGIN_ROOT}/bin`.
- **The sh launcher** `bin/relay` (mode 755) forwards all args so the subcommand rides through:
  ```sh
  #!/bin/sh
  # relay — arch-dispatch launcher for the session-relay Rust binary.
  d=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  case "$(uname -sm)" in
    'Darwin arm64')  exec "$d/relay-aarch64-apple-darwin" "$@" ;;
    'Darwin x86_64') exec "$d/relay-x86_64-apple-darwin" "$@" ;;
    'Linux aarch64') exec "$d/relay-aarch64-unknown-linux-musl" "$@" ;;
    'Linux x86_64')  exec "$d/relay-x86_64-unknown-linux-musl" "$@" ;;
    *) echo "session-relay: unsupported platform $(uname -sm)" >&2; exit 1 ;;
  esac
  ```
- **Manifest command shape:** MCP entries → `"command": "${CLAUDE_PLUGIN_ROOT}/bin/relay"`, `"args": ["bus"]`; the two shell-form hooks → one `command` string `"\"${CLAUDE_PLUGIN_ROOT}/bin/relay\" hook [codex]"`.
- **Store env-var contract the binary MUST honor** (the self-test sets these): `AGENT_RELAY_HOME` / `SESSION_RELAY_HOME` (home + back-compat precedence), `RELAY_PROJECT_DIR` (bus self-id; unsubstituted `${...}` → absent → cwd), `RELAY_CLAUDE_PROJECTS` / `RELAY_CODEX_SESSIONS` and `CLAUDE_CONFIG_DIR` / `CODEX_HOME` (discover roots).
- **`.lock` shape change:** the mkdir-mutex uses a `.lock` **directory**; `flock` uses a `.lock` **regular file**. On first run after upgrade, the binary must remove a stale `.lock` *directory* before opening the lock file (else `open` fails `EISDIR`).
- **MCP wire contract to preserve byte-for-byte:** newline-delimited JSON-RPC 2.0 lifecycle (`initialize` → `notifications/initialized` → `ping` → `tools/list` → `tools/call`), the 6 tool schemas (`whoami/register/roster/send/inbox/discover`), protocol `2025-06-18`.

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | Fix the `session-relay--v*` tag-CI trigger gap: broaden the tag glob `- 'docks--v*'` → add `- '*--v*'` (covers any `<plugin>--v*`); update the trigger-model doc so the pair stays in sync | `.github/workflows/ci.yml:14`, `.github/AGENTS.md` (Trigger model) | — | planned |
| 2 | Stand up the build infrastructure: (a) add a **Rust-provisioning step** to `ci.yml`'s validate job (SHA-pinned toolchain action + `rustup target add <host-musl>` + `apt-get install musl-tools`); (b) add `.github/workflows/build-binaries.yml` — a 2-runner matrix: **`macos-latest` (arm64)** builds `aarch64-apple-darwin` native + `x86_64-apple-darwin` (via the added target), **`ubuntu-latest`** builds both linux-musl targets; each size-optimized + stripped; uploads `relay-<target>` + a combined `SHA256SUMS`, on `workflow_dispatch` **only** (pre-release producer; NOT tag-triggered — see chicken-and-egg); SHA-pin every `uses:` | `.github/workflows/ci.yml`, `.github/workflows/build-binaries.yml` | 1 | planned |
| 3 | Scaffold the crate; port `store.rs` FIRST with `flock` (**rustix** advisory lock on the `.lock` FILE) replacing the mkdir-mutex; add the stale-`.lock`-**dir**→file first-run migration; keep atomic tmp+rename, field-preserving registry upsert, `sanitize()`/`encodeDir()` traversal defense. Prove with a `cargo test` that spawns multiple `relay` **child processes** (via `env!("CARGO_BIN_EXE_relay")`) racing `enqueue`/`register` | `plugins/session-relay/rust/{Cargo.toml,Cargo.lock,src/main.rs,src/store.rs}`, `rust/tests/`, `.gitignore` (add `plugins/session-relay/rust/target/`) | 1 | planned |
| 4 | Port the rest preserving every tested invariant: `discover.rs` (stat-then-content, `UUID_RE` gate, cwd-from-content, Codex `session_meta`, `READ_CAP=65536`, root env resolution), `cli.rs` wake (`--` fencing, UUID gate on `--id` AND resolved-name, refuse-if-dir-missing), `hook.rs` (`<session-relay-mail>` fence + `defuse()`), `bus.rs` (JSON-RPC lifecycle, 6 tools, `2025-06-18`, `RELAY_PROJECT_DIR` fallback, AND the send/discover hint strings formerly at `bus.mjs:111,130`) | `plugins/session-relay/rust/src/{discover,cli,hook,bus}.rs`, `src/main.rs` | 3 | planned |
| 5 | Wire the toolchain: session-relay descriptor gains a build capability; `ci.mjs` builds ONLY the host leg (`cargo build --release` → `bin/relay-<hostTarget>`) and verifies committed `SHA256SUMS` BEFORE the self-test; `release.mjs` does **not** build darwin — it asserts all 4 committed binaries exist + `sha256sum -c` passes, then bumps+tags | `scripts/lib/plugins.mjs`, `scripts/ci.mjs`, `scripts/release.mjs:~94` | 3, 4 | planned |
| 6 | Land a consistent Rust tree in ONE commit: add the `bin/relay` sh launcher (755); obtain the 4 arch binaries from `build-binaries.yml` artifacts and commit them + `SHA256SUMS`; flip ALL FOUR manifests to `${CLAUDE_PLUGIN_ROOT}/bin/relay <sub>`; rewrite the self-test (black-box subset spawns `bin/relay`, seeding the cwd→id marker by running `bin/relay hook` with a synthesized SessionStart event; white-box store internals + the 8×10 cross-process stress move to `cargo test`; add read-only `relay peek <id>` for the remaining store assertions); rewrite `SKILL.md` path strings + rebump `content_hash` via `node scripts/skills/content-hash.mjs --backfill` | `bin/{relay,relay-*,SHA256SUMS}`, the 4 manifests, `test/selftest.mjs`, `rust/src/cli.rs` (`peek`), `skills/productivity/session-relay/SKILL.md` | 4, 5 | planned |
| 7 | Delete the now-unreferenced Node payload and finalize: `git rm` the five superseded `.mjs`; run the full gate | `git rm plugins/session-relay/{mcp/bus.mjs,lib/store.mjs,lib/discover.mjs,hooks/session-start.mjs,skills/productivity/session-relay/scripts/relay.mjs}` | 6 | planned |

## Acceptance criteria

- **Build (host):** `cargo build --release --manifest-path plugins/session-relay/rust/Cargo.toml` exits 0.
- **All 4 arches committed:** `ls plugins/session-relay/bin/` shows `relay` + `relay-x86_64-unknown-linux-musl` + `relay-aarch64-unknown-linux-musl` + `relay-x86_64-apple-darwin` + `relay-aarch64-apple-darwin` + `SHA256SUMS`.
- **Integrity:** `cd plugins/session-relay/bin && sha256sum -c SHA256SUMS` → every line `OK` (integrity of the committed set; reproducibility is a separate criterion below).
- **Reproducible host leg:** rebuilding the host target with the pinned toolchain + `--remap-path-prefix` yields a digest identical to the committed `relay-<hostTarget>` line in `SHA256SUMS` (tamper-evidence, not just self-consistency).
- **Full gate:** `node scripts/ci.mjs` → exits 0, ends `✔ All ci.mjs checks passed`.
- **Rust tests:** `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml` → `test result: ok`, including the cross-process lock race test.
- **Ported self-test:** `node plugins/session-relay/test/selftest.mjs` → `PASS` over the black-box subset enumerated in Step 6, exit 0, spawning `bin/relay` (grep the file: no `spawnSync('node'` and no `import .*lib/store`).
- **Plugin lint:** `claude plugin validate ./plugins/session-relay` → passes.
- **All four manifests flipped (per-file, not a line-coincidence grep):** `cd plugins/session-relay && grep -L 'bin/relay' .claude-plugin/plugin.json .codex-plugin/bus.mcp.json hooks/hooks.json hooks/codex-hooks.json` prints **nothing**, AND `grep -rn '"command":[[:space:]]*"node"' .claude-plugin .codex-plugin hooks` prints **nothing**.
- **Node payload deleted:** `ls plugins/session-relay/{mcp/bus.mjs,lib/store.mjs,lib/discover.mjs,hooks/session-start.mjs,skills/productivity/session-relay/scripts/relay.mjs} 2>&1` → all `No such file`.
- **Tag-CI fix:** a `session-relay--v*` tag triggers the `validate` workflow — the release gate (verify `ci.yml`'s `on.push.tags` glob matches). (`build-binaries.yml` is `workflow_dispatch`-only by design; a tag-time all-4-arch rebuild-and-compare is a noted hardening follow-up.)
- **Live round-trip:** a real bus session registers + exchanges a message via `bin/relay` on both a Claude and a Codex session (session-time check; record in `## Review`).

## Out of scope / do-NOT-touch

- **`plugins/docks/hooks/context-tree-nudge.mjs`** — different plugin, store-less, no flock coupling. Leave it Node; its port is a **separate follow-up plan**.
- **`docks` plugin manifests / skills / scorers** — untouched; scope is `plugins/session-relay/` + shared `scripts/` + CI.
- **The two in_review session-relay plans** — do not re-open or ship them here.
- **No behavior change to the message-bus protocol** — the Rust bus must be wire-identical to `bus.mjs`; do not "improve" tool schemas or JSON-RPC framing.
- **Windows-native (non-WSL) is out of the arch set** — the four committed arches + the POSIX-`sh` launcher cover macOS (arm64/x86_64) + Linux (arm64/x86_64), which is the CLI-agent audience today; Node's session-relay had the same practical reach. A Windows `x86_64-pc-windows-msvc.exe` + a `.cmd`/native-shell launcher is a **separate follow-up**, not this port. (WSL counts as Linux and works.)

## Known gotchas

- **`.lock` dir→file migration:** the old mkdir-mutex leaves a `.lock` **directory**; `flock` opens a `.lock` **file**. Without a first-run "remove stale `.lock` dir" step the `open` fails `EISDIR` on upgrade (covered in step 3).
- **flock all-or-nothing:** a single manifest entry left on `node …mjs` silently breaks mutual exclusion. Step 6 flips all four in one commit + step 7 deletes the `.mjs`; the per-file acceptance grep + the delete criterion enforce it.
- **flock is advisory + weaker on NFS/network mounts** than mkdir-atomicity. Keep `~/.agent-relay` on a local FS or document the constraint.
- **CI drift trap:** adding `cargo` to `ci.mjs` without a Rust-setup step in `ci.yml` breaks the authoritative tag-CI gate (`.github/AGENTS.md` doctrine). Step 2a provisions it.
- **Codex `${CLAUDE_PLUGIN_ROOT}` substitution moves from `args` (today) to `command` (the flip).** The current `bus.mcp.json` already relies on Codex substituting `${CLAUDE_PLUGIN_ROOT}` — but in `args` (`["${CLAUDE_PLUGIN_ROOT}/mcp/bus.mjs"]`), with `command:"node"` found on PATH. The flip puts the substitution in the **`command`** field (`${CLAUDE_PLUGIN_ROOT}/bin/relay`). Codex's native var is **`${PLUGIN_ROOT}`** and it "also sets `CLAUDE_PLUGIN_ROOT` … for compatibility" ([Codex plugins/build docs](https://developers.openai.com/codex/plugins/build)); the build docs show a bundled-binary command (`${PLUGIN_ROOT}/bin/…`). BUT [openai/codex#19372](https://github.com/openai/codex/issues/19372) reports auto-mirrored Claude marketplaces failing the MCP handshake because Codex didn't substitute `${CLAUDE_PLUGIN_ROOT}`. So: **prefer `${PLUGIN_ROOT}` (native) in the Codex manifest**, keep the live-verify STOP, and confirm command-field substitution on a real Codex install (Claude Code substitution in `command` is fully documented — see Sources — so the Claude side is safe).
- **`bin/relay` launcher is not shellcheck-linted today** — `scripts/lib/plugins.mjs` `shellHooks()` globs only `hooks/*.sh`. Extend it to cover `bin/*` or accept the trivial static launcher is unlinted.

## Global constraints

- Manifest versions stay in lockstep across `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and the versioned marketplace entry (`release.mjs` enforces).
- Pin every CI `uses:` to a 40-char commit SHA with a trailing version comment; keep `permissions: contents: read` (per `.github/AGENTS.md` supply-chain constraints).
- Skill body ≤ 500 lines; `metadata.content_hash` re-synced (`node scripts/skills/content-hash.mjs --backfill`) on any SKILL.md change.
- **Dependency budget:** keep the crate lean — std + a small JSON serializer (e.g. `tinyjson`) + **one** small advisory-lock crate (`rustix`, chosen for size over `nix`/`fs2`). No async runtime (do NOT use `rmcp` — it pulls the whole tokio stack), no heavy transitive tree; this bounds binary size + reproducibility.

## Cold-handoff checklist

1. **File manifest** — ✓ every step names exact path(s) (`rust/src/{store,discover,cli,hook,bus}.rs`, the four manifests, `bin/{relay,relay-*,SHA256SUMS}`, `ci.yml:14`, `build-binaries.yml`, and the five `git rm` targets).
2. **Environment & commands** — ✓ `cargo build --release --manifest-path plugins/session-relay/rust/Cargo.toml`, `node scripts/ci.mjs`, `cargo test --manifest-path …`, `node plugins/session-relay/test/selftest.mjs`, `claude plugin validate ./plugins/session-relay`, `node scripts/skills/content-hash.mjs --backfill`.
3. **Interface & data contracts** — ✓ the sh launcher, manifest command/args shape, the store env-var contract, the `.lock` dir→file change, and the MCP wire contract — all in `## Interfaces & data shapes`.
4. **Executable acceptance** — ✓ command + expected output each (`cargo build` exit 0; `sha256sum -c` → `OK`; per-file `grep -L 'bin/relay'` → empty; `ls …` deleted → `No such file`; self-test `PASS`).
5. **Out of scope** — ✓ `context-tree-nudge.mjs` stays Node, docks manifests/skills untouched, no message-bus protocol change.
6. **Decision rationale** — ✓ one-binary (flock all-or-nothing), Rust-over-Go, darwin-via-matrix, CI-provisioning, commit-in-tree — all in `## Context & rationale`.
7. **Known gotchas** — ✓ `.lock` dir→file `EISDIR`, flock all-or-nothing, NFS advisory weakness, unverified Codex `${CLAUDE_PLUGIN_ROOT}` command substitution, unlinted launcher.
8. **Global constraints verbatim** — ✓ manifest version lockstep, SHA-pinned `uses:`, `permissions: contents: read`, ≤500-line skill body, dependency budget (`rustix` + small JSON serializer, no tokio/rmcp).
9. **No undefined terms / forward refs** — ✓ no TBD/TODO; every path, command, crate, and env var resolves in-repo or in `## Interfaces & data shapes`.

## STOP conditions

- If a real Codex install does NOT substitute the plugin-root var in the MCP `command` field (step 6 verification): first switch the Codex manifest to the **native `${PLUGIN_ROOT}`** (vs the `${CLAUDE_PLUGIN_ROOT}` compat alias); if that also fails → STOP, do not ship the Codex manifest change. Report; consider a `command:"sh"` + `args:["${PLUGIN_ROOT}/bin/relay", …]` form so substitution stays in `args` (the form that works today).
- If the cross-process `cargo test` cannot demonstrate `flock` mutual exclusion as reliably as the current mkdir-mutex → STOP at step 3; do not flip manifests. The flock upgrade is the point of the port.
- If `build-binaries.yml` cannot produce a runnable darwin binary on the native runners → STOP before step 6; do not commit a partial arch set (the launcher would `exit 1` on the missing platform).

## Open questions

_Resolved by the maintainer's scope choice (full port, commit-in-tree) and this draft: darwin binaries are produced by the `build-binaries.yml` native matrix; CI is provisioned with Rust in `ci.yml`; the four binaries are committed before the tag. The one deferred sub-decision — automating the "download CI artifacts → commit into `bin/`" step (bot commit) vs. the manual first-cut flow — is a follow-up, not a blocker._

## Self-review

Score: 66 → 88/100 · trajectory 66→88 (fresh-context `plan-review` red-team, big/risky tier; its 9 findings applied pre-start) · stopped: fixes applied, then a web-verification pass (2026-07-01) grounded every external claim in a cited source (see Sources → External research).

Web-verification pass corrected/confirmed: **GitHub runner labels were stale** — `macos-13` (Intel) is retired; switched to one arm64 `macos-latest` runner cross-building both darwin arches (was a 3-runner macos-14/macos-13/ubuntu matrix). **Dropped the `build-all.sh` Mac fallback** as a speculative second build path (CI produces all four; Mac dev needs only the host leg). **Codex substitution** clarified: native `${PLUGIN_ROOT}` + `${CLAUDE_PLUGIN_ROOT}` compat, with issue #19372 as the residual risk — STOP retained. Claude-side binary `command` flip confirmed documented-supported.

Red-team caught and fixed: (1) **no producer for the two darwin binaries** — release.mjs runs on Linux and can't cross-compile darwin, so added `build-binaries.yml` (an arm64 `macos-latest` runner builds both darwin arches + `ubuntu` builds both musl) and made release.mjs *assert* the committed set rather than build it; (2) **ci.yml never provisioned Rust/musl** yet step 5 runs `cargo` in ci.mjs — added a Rust-setup step to the validate job (the "ci.yml runs ci.mjs, no drift" doctrine); (3) **the 5 superseded `.mjs` were never deleted** — added step 7 `git rm` + all 5 to `affected_paths`; (4) the "no residual node `.mjs`" grep **false-passed** on the two MCP manifests (command/`.mjs` on separate lines) — replaced with a per-file `grep -L 'bin/relay'` + `"command": "node"` check; (5) step 6 edited a to-be-deleted `bus.mjs` — moved the hint strings into `bus.rs`; (6) specified black-box marker seeding (`bin/relay hook`) + the cargo cross-process mechanism; (7) resolved the dep-budget contradiction (rustix, budget raised) + added the `.lock` dir→file migration; (8) replaced the circular `sha256sum -c` sole-check with a reproducible-rebuild criterion. Every cited anchor was re-verified accurate (ci.yml:14, all four manifest command strings, store.mjs mkdir-mutex, the selftest black/white-box split, .gitignore:6, the bus.mjs/SKILL.md hint strings).

## Review

(filled by plan-review on completion)

## Sources

- `.github/workflows/ci.yml:9-15` — tag trigger `- 'docks--v*'` only; the `session-relay--v*` gap. Single `ubuntu-latest` Node/pnpm job (no Rust provisioning today).
- `.github/AGENTS.md` "Trigger model" + "No drift — ci.yml runs ci.mjs" — the doctrine step 2a must satisfy.
- `plugins/session-relay/.claude-plugin/plugin.json:24-33` — `mcpServers.bus` `command:"node"` + `args:["…/mcp/bus.mjs"]` + `env.RELAY_PROJECT_DIR`.
- `plugins/session-relay/.codex-plugin/bus.mcp.json:4-5` · `hooks/hooks.json:8` · `hooks/codex-hooks.json:8` (trailing `codex`) — the other three flip targets.
- `plugins/session-relay/lib/store.mjs` — mkdir-mutex on `.lock` (the flock target), stale-reclaim, atomic tmp+rename, sanitize/encodeDir.
- `plugins/session-relay/mcp/bus.mjs:111,130` — relay-CLI hint strings (move to `bus.rs`/`cli.rs`).
- `plugins/session-relay/test/selftest.mjs` — black-box (spawns bus/hook/relay, lines ~148/390) + white-box (`import ../lib/store.mjs:21`, `../lib/discover.mjs:165`, stress worker 349-367).
- `plugins/session-relay/skills/productivity/session-relay/SKILL.md:40,46,97,126` — `node …/relay.mjs` strings to rewrite.
- `scripts/release.mjs:~94` (`addFiles`) · `scripts/ci.mjs:138` (`node p.selftest`) · `scripts/lib/plugins.mjs` (descriptor + `shellHooks`).
- `.gitignore:6` — `node_modules/`; add `plugins/session-relay/rust/target/`.

**External research (web-verified 2026-07-01, not from memory):**
- [Claude Code plugins reference](https://code.claude.com/docs/en/plugins-reference) — `${CLAUDE_PLUGIN_ROOT}` is "the absolute path to your plugin's installation directory. Use this to reference **scripts, binaries, and config files** bundled with the plugin"; it is "substituted inline anywhere they appear in … MCP or LSP server configs"; the doc's own MCP example is `"command": "${CLAUDE_PLUGIN_ROOT}/servers/db-server"`. → **Claude-side binary `command` flip is documented-supported.** Marketplace installs are "copied into the plugin cache"; the versioned install dir is cleaned ~7 days after an update. → **delivery = copy-in-tree, not Release assets.**
- [Codex — Build plugins](https://developers.openai.com/codex/plugins/build) — Codex substitutes env vars in MCP `command`/`args`; native var is **`${PLUGIN_ROOT}`**; it "also sets `CLAUDE_PLUGIN_ROOT` … for compatibility with existing plugin hooks"; a bundled-binary command (`${PLUGIN_ROOT}/bin/…`) is shown. → **Codex binary `command` is intended.**
- [openai/codex#19372](https://github.com/openai/codex/issues/19372) — auto-mirrored Claude marketplaces fail the MCP handshake when Codex "does not substitute `${CLAUDE_PLUGIN_ROOT}`". → **the residual risk behind the live-verify STOP; prefer native `${PLUGIN_ROOT}`.**
- [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) — arm64: `macos-14/15/26/latest`; Intel: `macos-15-intel`/`macos-26-intel` (`macos-13` retired); "free and unlimited on public repositories". → **one `macos-latest` arm64 runner + one `ubuntu-latest` produce all four arches free.**
- [cross-rs README](https://github.com/cross-rs/cross) — "MSVC and Apple Darwin targets, which we cannot ship pre-built images of." → **`cross`/Docker cannot produce darwin; darwin needs a real Mac/macOS runner.**
- [Rust 1.85.0 announcement](https://blog.rust-lang.org/2025/02/20/Rust-1.85.0/) — edition 2024 stabilized in 1.85.0 (2025-02-20). → **MSRV floor for the crate.**
- [`rustix::fs::flock`](https://docs.rs/rustix/latest/rustix/fs/fn.flock.html) — `flock(fd, FlockOperation) -> Result<()>`, wraps `flock(2)`, requires the `fs` feature. → **the chosen small advisory-lock crate exposes what the store needs.**

## Notes

Sequence rationale: fix the release gate (1) → stand up the build infra (2) → prove the lock (3) → port behavior (4) → wire the build (5) → land a consistent Rust tree in one commit (6) → delete dead Node + gate (7). Binaries are committed **on release only** (not dev churn), size-`z` stripped (~<1 MB each), produced by the native-runner matrix. First-cut binary-commit flow is manual (download artifacts → commit); a bot-commit automation is a follow-up.
