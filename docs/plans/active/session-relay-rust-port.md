---
title: Port session-relay to a single Rust binary (zero-runtime, both tools)
goal: Replace session-relay's Node payload with one static Rust `relay` binary (4 committed arches + sh launcher) so a Codex host needs no Node, enabling kernel flock locking.
status: in_review
created: "2026-07-01T15:56:09-03:00"
updated: "2026-07-02T13:06:09-03:00"
started_at: "2026-07-01T17:56:26-03:00"
assignee: claude
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
  - .gitattributes
  - scripts/lib/plugins.mjs
  - scripts/lib/rust-bin.mjs
  - scripts/AGENTS.md
  - scripts/ci.mjs
  - scripts/release.mjs
  - .gitignore
related_plans: [session-relay-cross-tool-bus, session-relay-auto-discovery]
review_status: partial
in_review_since: "2026-07-01T20:07:05-03:00"
planned_at_commit: "7ee6a0de28bdae9109282cfba3acc5803df69242"
---

# Port session-relay to a single Rust binary (zero-runtime, both tools)

## Goal

Replace session-relay's five store-touching Node `.mjs` files with **one statically-linked Rust binary** (`relay`, multi-call via subcommands) so the plugin runs on a **Codex-only host that has no Node installed** — the single real gap in today's cross-tool story. "Replace" means the five `.mjs` are **deleted** and every manifest/hook/test path resolves to the plugin's `bin/relay` via each tool's plugin-root variable — `${CLAUDE_PLUGIN_ROOT}` in the Claude manifests, and on Codex a `sh` resolver (env-first, cache-glob fallback — live-verify showed Codex substitutes NO variable in MCP config; see the per-manifest table in Interfaces). The port also (a) upgrades the cross-process store lock from a hand-rolled mkdir-mutex + stale-reclaim to a **kernel-managed `flock`** (auto-released on crash), and (b) cuts per-`Write` hook cold-start from ~20–60 ms (Node) to ~1–5 ms (native). Success = both tools launch the bus/hook/CLI from `bin/relay`, every existing security/self-test invariant still passes, all four arch binaries are committed, and `node scripts/ci.mjs` is green.

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

- **Toolchain:** Node 24.x + pnpm (`corepack enable`) for the existing gate; **Rust, pinned to an exact version** via a committed `plugins/session-relay/rust/rust-toolchain.toml` (`channel = "1.85.0"` — floor: edition 2024 stabilized in 1.85.0, 2025-02-20, [Rust blog](https://blog.rust-lang.org/2025/02/20/Rust-1.85.0/); bump deliberately). rustup auto-selects it locally; CI references the same version — one compiler everywhere is what makes the reproducible-rebuild acceptance criterion achievable. `rustup target add x86_64-unknown-linux-musl aarch64-unknown-linux-musl x86_64-apple-darwin aarch64-apple-darwin`. The Linux aarch64-musl leg needs `musl-tools` + an aarch64 cross-linker (or `cross`); **both darwin legs build on ONE Apple-Silicon runner** (`macos-latest`/`macos-15`, arm64): `aarch64-apple-darwin` native + `x86_64-apple-darwin` via the cross target. The Linux host cannot build darwin at all.
- **Setup:** `corepack enable && pnpm install --frozen-lockfile` (once).
- **Local gate:** `node scripts/ci.mjs` — Rust leg runs `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, builds ONLY the host-arch `relay` leg **with `--locked`** (assert `Cargo.lock` integrity), runs the self-test against it, and verifies committed binary checksums (this check **skips with a printed notice while `bin/` holds no committed binaries** — they land in step 7). Must be green before any commit.
- **Build host-arch binary (local):** `cargo build --release --locked --manifest-path plugins/session-relay/rust/Cargo.toml` then copy `target/release/relay` → `plugins/session-relay/bin/relay-<hostTarget>`.
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
  d=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
  case "$(uname -sm)" in
    'Darwin arm64')  exec "$d/relay-aarch64-apple-darwin" "$@" ;;
    'Darwin x86_64') exec "$d/relay-x86_64-apple-darwin" "$@" ;;
    'Linux aarch64') exec "$d/relay-aarch64-unknown-linux-musl" "$@" ;;
    'Linux x86_64')  exec "$d/relay-x86_64-unknown-linux-musl" "$@" ;;
    *) echo "session-relay: unsupported platform $(uname -sm)" >&2; exit 1 ;;
  esac
  ```
- **Per-manifest flip shapes (the plugin-root variable differs by tool — do NOT uniform them):**

  | Manifest | New shape |
  |---|---|
  | `.claude-plugin/plugin.json` (MCP) | `"command": "${CLAUDE_PLUGIN_ROOT}/bin/relay"`, `"args": ["bus"]` (binary-in-`command` is the docs' own example) |
  | `.codex-plugin/bus.mcp.json` (MCP) | **DIRECT server map** (no `mcpServers` wrapper — Codex parses only the direct map or snake_case `mcp_servers`): `"bus": {"command": "sh", "args": ["-c", "<env-first + cache-glob>"]}`. Live-verified 2026-07-02 on codex 0.142.5: Codex substitutes NO variable in MCP config (command OR args) and exports NO `PLUGIN_ROOT` env to MCP children (only hooks get it) — [#19372](https://github.com/openai/codex/issues/19372) open, latest release affected. The sh line tries `$PLUGIN_ROOT` first (future-proof for the upstream fix), else resolves the newest `~/.codex/plugins/cache/*/session-relay/*/bin/relay` |
  | `hooks/hooks.json` (Claude) | **exec form** — `{"type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/bin/relay", "args": ["hook"]}` (docs: "Prefer exec form for any hook that references a path placeholder") |
  | `hooks/codex-hooks.json` (Codex) | keep **shell form** — `"\"${CLAUDE_PLUGIN_ROOT}/bin/relay\" hook codex"` (sh expands the exported env var at runtime — the mechanism the current hook already proves works on Codex) |
- **Crate release profile** (`rust/Cargo.toml` — all stable-channel, per [min-sized-rust](https://github.com/johnthagen/min-sized-rust); `codegen-units = 1` is also a prerequisite for the reproducible-rebuild criterion):
  ```toml
  [profile.release]
  opt-level = "z"     # try "s" if it benches smaller
  lto = true
  codegen-units = 1
  panic = "abort"
  strip = true
  ```
- **Binary hygiene in git:** all five `bin/` entries (launcher + 4 arch binaries) committed **mode 100755** (the launcher `exec`s them — a 100644 blob fails `EACCES`); a repo-root `.gitattributes` gains `plugins/session-relay/bin/relay-* binary` (= `-diff -merge -text`, no EOL mangling); **plain git blobs, never Git LFS** (see Global constraints).
- **Store env-var contract the binary MUST honor** (the self-test sets these): `AGENT_RELAY_HOME` / `SESSION_RELAY_HOME` (home + back-compat precedence), `RELAY_PROJECT_DIR` (bus self-id; unsubstituted `${...}` → absent → cwd), `RELAY_CLAUDE_PROJECTS` / `RELAY_CODEX_SESSIONS` and `CLAUDE_CONFIG_DIR` / `CODEX_HOME` (discover roots).
- **`.lock` shape change:** the mkdir-mutex uses a `.lock` **directory**; `flock` uses a `.lock` **regular file**. On first run after upgrade, the binary must remove a stale `.lock` *directory* before opening the lock file (else `open` fails `EISDIR`).
- **MCP wire contract to preserve byte-for-byte:** newline-delimited JSON-RPC 2.0 lifecycle (`initialize` → `notifications/initialized` → `ping` → `tools/list` → `tools/call`), the 6 tool schemas (`whoami/register/roster/send/inbox/discover`), protocol `2025-06-18`.

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | Fix the `session-relay--v*` tag-CI trigger gap: broaden the tag glob `- 'docks--v*'` → `- '*--v*'` (covers any `<plugin>--v*`; replaced rather than added — one pattern, no redundancy); update the trigger-model doc so the pair stays in sync | `.github/workflows/ci.yml:14`, `.github/AGENTS.md` (Trigger model) | — | done |
| 2 | Stand up the build infrastructure: (a) **Rust-provisioning step** in `ci.yml`'s validate job — implemented with the image-preinstalled rustup (NO third-party toolchain action; better than planned — zero new supply-chain pins) + `apt musl-tools` + `rustup target add x86_64-unknown-linux-musl`, guarded to no-op until `rust/rust-toolchain.toml` exists; (b) `.github/workflows/build-binaries.yml` — 2-runner matrix (`macos-latest` arm64 → both darwin arches; `ubuntu-latest` → both musl arches, aarch64 linked via `gcc-aarch64-linux-gnu`), `--locked`, per-runner `SHA256SUMS-*.part` (committed `SHA256SUMS` is regenerated in `bin/` at commit time), `workflow_dispatch` **only**; new `uses:` pins: `upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` v7.0.1 | `.github/workflows/ci.yml`, `.github/workflows/build-binaries.yml` | 1 | done |
| 3 | Scaffold the crate — `Cargo.toml` with the `[profile.release]` block from Interfaces, committed `Cargo.lock`, and `rust-toolchain.toml` (`channel = "1.85.0"`); port `store.rs` FIRST with `flock` (**rustix** advisory lock on the `.lock` FILE) replacing the mkdir-mutex; add the stale-`.lock`-**dir**→file first-run migration; keep atomic tmp+rename, field-preserving registry upsert, `sanitize()`/`encodeDir()` traversal defense. Prove with a `cargo test` that spawns multiple `relay` **child processes** (via `env!("CARGO_BIN_EXE_relay")`) racing `enqueue`/`register` | `plugins/session-relay/rust/{Cargo.toml,Cargo.lock,rust-toolchain.toml,src/main.rs,src/store.rs,src/lib.rs}`, `rust/tests/lock_race.rs`, `.gitignore` (add `plugins/session-relay/rust/target/`) | — | done |
| 4 | Port the rest preserving every tested invariant: `discover.rs` (stat-then-content, `UUID_RE` gate, cwd-from-content, Codex `session_meta`, `READ_CAP=65536`, root env resolution), `cli.rs` wake (`--` fencing, UUID gate on `--id` AND resolved-name, refuse-if-dir-missing), `hook.rs` (`<session-relay-mail>` fence + `defuse()`), `bus.rs` (JSON-RPC lifecycle, 6 tools, `2025-06-18`, `RELAY_PROJECT_DIR` fallback, **stdout purity: ONLY JSON-RPC frames on stdout, ALL diagnostics to stderr** — normative MCP-stdio MUST; mirrors `bus.mjs:21,138` — AND the send/discover hint strings formerly at `bus.mjs:111,130` — now pointing at `<plugin>/bin/relay wake`) | `plugins/session-relay/rust/src/{discover,cli,hook,bus}.rs`, `src/main.rs`, `rust/tests/bus_smoke.rs` (added: black-box MCP lifecycle smoke) | 3 | done |
| 5 | Wire the toolchain: session-relay descriptor gains a build capability; `ci.mjs`'s Rust leg runs `cargo fmt --check` + `cargo clippy --all-targets -- -D warnings` + builds ONLY the host leg (`cargo build --release --locked` → `bin/relay-<hostTarget>`) and verifies committed `SHA256SUMS` BEFORE the self-test — **skipping that check with a printed notice while `bin/` holds no committed binaries** (they land in step 7, so the gate stays green between steps 5 and 7); `release.mjs` does **not** build darwin — it asserts all 4 committed binaries exist + `sha256sum -c` passes, then bumps+tags. Implemented as a `rust: { dir, bin, binName, targets }` descriptor capability + shared `scripts/lib/rust-bin.mjs` (`rustHostTarget`/`findCargo`/`verifySha256Sums` — Node-crypto verify, no `sha256sum` dep); release also asserts the launcher + exec bits; confirmed locally that the musl host leg builds with only `rustup target add` (static-pie, no musl-gcc needed) | `scripts/lib/plugins.mjs`, `scripts/lib/rust-bin.mjs`, `scripts/ci.mjs`, `scripts/release.mjs`, `scripts/AGENTS.md` | 3, 4 | done |
| 6 | Rewrite the tests + docs against the host-leg binary (manifests still on Node — nothing consumer-facing flips yet): self-test black-box subset spawns `bin/relay` (host leg from step 5) — seed the cwd→id marker by piping a synthesized SessionStart event into `bin/relay hook`, seed **named** registrations via the `relay register` CLI subcommand; white-box store internals + the 8×10 cross-process stress move to `cargo test`; add read-only `relay peek <id>` for the remaining store assertions; rewrite ALL `SKILL.md` path strings (`:32,40,46,59,76,97,98,126` — every `relay.mjs` and `mcp/bus.mjs` mention, including the `codex mcp add` example) + rebump `content_hash` via `node scripts/skills/content-hash.mjs --backfill`. Done: 39-check selftest all through the binary (skip-with-notice if `bin/` empty on a cargo-less box); the `## Verify` line (`node test/selftest.mjs`) intentionally unchanged — the selftest stays a Node *harness* driving the binary; `list` awk example field `$3`→`$4` (Rust list interposes `[tool]`) | `test/selftest.mjs`, `rust/src/{cli,main}.rs` (`peek`), `skills/productivity/session-relay/SKILL.md` | 4, 5 | done |
| 7 | Land the consumer-facing flip in ONE atomic commit: add the `bin/relay` sh launcher; commit the 4 arch binaries from `build-binaries.yml` artifacts + `SHA256SUMS` (all five `bin/` entries **mode 100755**); add the repo-root `.gitattributes` line; flip ALL FOUR manifests **per the Interfaces table** — Claude `plugin.json` MCP + `hooks.json` (exec form) on `${CLAUDE_PLUGIN_ROOT}`, `codex-hooks.json` shell form, `bus.mcp.json` on **native `${PLUGIN_ROOT}`** . Done: binaries from build-binaries run 28552485456 (all 4 transit checksums OK); launcher shellcheck-linted (SC1007 fix: `CDPATH=''`) and smoke-tested (dispatches to the musl leg); exec bits verified in the git INDEX (Write had staged the launcher 100644 — the exact EACCES gotcha; re-chmodded) | `bin/{relay,relay-*,SHA256SUMS}`, `.gitattributes`, the 4 manifests, `scripts/{ci.mjs,lib/rust-bin.mjs,lib/plugins.mjs,AGENTS.md}` | 6 | done |
| 8 | Delete the now-unreferenced Node payload and finalize: `git rm` the five superseded `.mjs`; run the full gate | `git rm plugins/session-relay/{mcp/bus.mjs,lib/store.mjs,lib/discover.mjs,hooks/session-start.mjs,skills/productivity/session-relay/scripts/relay.mjs}` | 7 | done |

## Acceptance criteria

- **Build (host):** `cargo build --release --locked --manifest-path plugins/session-relay/rust/Cargo.toml` exits 0.
- **Lint (Rust):** `cargo fmt --check --manifest-path plugins/session-relay/rust/Cargo.toml` → exit 0, no diff; `cargo clippy --all-targets --manifest-path plugins/session-relay/rust/Cargo.toml -- -D warnings` → exit 0.
- **All 4 arches committed:** `ls plugins/session-relay/bin/` shows `relay` + `relay-x86_64-unknown-linux-musl` + `relay-aarch64-unknown-linux-musl` + `relay-x86_64-apple-darwin` + `relay-aarch64-apple-darwin` + `SHA256SUMS`.
- **Integrity:** `cd plugins/session-relay/bin && sha256sum -c SHA256SUMS` → every line `OK` (integrity of the committed set; reproducibility is a separate criterion below).
- **Reproducible host leg (CI-enforced):** `ci.mjs` rebuilds the host target (pinned toolchain, `--locked`) and compares digests against the committed binary: byte-identity is a **FAIL in CI** (`process.env.CI` — the runner shares the producer workflow's image) and a warn locally. Empirically (2026-07-01): CI musl digest `56ba41…` vs local `79e08e…` — binaries embed build paths + host-linker output, so cross-machine byte-identity is unachievable without `--remap-path-prefix` AND an identical linker; the CI-side check delivers the tamper-evidence where it is authoritative. The committed binary is never overwritten by the gate.
- **Full gate:** `node scripts/ci.mjs` → exits 0, ends `✔ All ci.mjs checks passed`.
- **Rust tests:** `cargo test --manifest-path plugins/session-relay/rust/Cargo.toml` → `test result: ok`, including the cross-process lock race test.
- **Ported self-test:** `node plugins/session-relay/test/selftest.mjs` → `PASS` over the black-box subset enumerated in Step 6, exit 0, spawning `bin/relay` (grep the file: no `spawnSync('node'` and no `import .*lib/store`).
- **Plugin lint:** `claude plugin validate ./plugins/session-relay` → passes.
- **All four manifests flipped (per-file, not a line-coincidence grep):** `cd plugins/session-relay && grep -L 'bin/relay' .claude-plugin/plugin.json .codex-plugin/bus.mcp.json hooks/hooks.json hooks/codex-hooks.json` prints **nothing**, AND `grep -rn '"command":[[:space:]]*"node"' .claude-plugin .codex-plugin hooks` prints **nothing**.
- **Codex manifest uses the live-verified sh form (native `${PLUGIN_ROOT}` is falsified — #19372):** `grep -q 'plugins/cache/\*/session-relay' plugins/session-relay/.codex-plugin/bus.mcp.json && ! grep -q 'CLAUDE_PLUGIN_ROOT' plugins/session-relay/.codex-plugin/bus.mcp.json && ! grep -q '"mcpServers"' plugins/session-relay/.codex-plugin/bus.mcp.json` → exit 0 (direct map, cache-glob fallback, no camelCase wrapper).
- **Exec bits committed:** `git ls-files -s plugins/session-relay/bin/ | grep -vc '^100755'` → `1` (only `SHA256SUMS` is non-executable; launcher + 4 binaries are all `100755`).
- **No residual Node paths in the skill doc:** `grep -n 'relay\.mjs\|mcp/bus\.mjs' plugins/session-relay/skills/productivity/session-relay/SKILL.md` prints **nothing**.
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
- **flock all-or-nothing:** a single manifest entry left on `node …mjs` silently breaks mutual exclusion. Step 7 flips all four in one atomic commit + step 8 deletes the `.mjs`; the per-file acceptance grep + the delete criterion enforce it.
- **MCP stdout purity is a spec MUST, easy to break in Rust:** the stdio transport spec says the server "MUST NOT write anything to its stdout that is not a valid MCP message"; logs belong on stderr. `bus.mjs` already obeys (`:21` stderr log helper, `:138` stdout = JSON-RPC only) — one stray `println!`/`dbg!` in `bus.rs` corrupts the stream and kills the handshake. Keep a `log_to_stderr` helper and never `println!` in bus code paths.
- **Exec bit travels through git, but only if committed:** the launcher `exec`s `relay-<arch>`; a binary committed as `100644` fails `EACCES` at session start on a fresh clone. Verify with `git ls-files -s` (the acceptance criterion), not `ls -l` on the build machine.
- **flock is advisory + weaker on NFS/network mounts** than mkdir-atomicity. Keep `~/.agent-relay` on a local FS or document the constraint.
- **CI drift trap:** adding `cargo` to `ci.mjs` without a Rust-setup step in `ci.yml` breaks the authoritative tag-CI gate (`.github/AGENTS.md` doctrine). Step 2a provisions it.
- **Codex `${CLAUDE_PLUGIN_ROOT}` substitution moves from `args` (today) to `command` (the flip).** The current `bus.mcp.json` already relies on Codex substituting `${CLAUDE_PLUGIN_ROOT}` — but in `args` (`["${CLAUDE_PLUGIN_ROOT}/mcp/bus.mjs"]`), with `command:"node"` found on PATH. The flip puts the substitution in the **`command`** field (`${CLAUDE_PLUGIN_ROOT}/bin/relay`). Codex's native var is **`${PLUGIN_ROOT}`** and it "also sets `CLAUDE_PLUGIN_ROOT` … for compatibility" ([Codex plugins/build docs](https://developers.openai.com/codex/plugins/build)); the build docs show a bundled-binary command (`${PLUGIN_ROOT}/bin/…`). BUT [openai/codex#19372](https://github.com/openai/codex/issues/19372) reports auto-mirrored Claude marketplaces failing the MCP handshake because Codex didn't substitute `${CLAUDE_PLUGIN_ROOT}`. So: **prefer `${PLUGIN_ROOT}` (native) in the Codex manifest**, keep the live-verify STOP, and confirm command-field substitution on a real Codex install (Claude Code substitution in `command` is fully documented — see Sources — so the Claude side is safe).
- **`bin/relay` launcher is not shellcheck-linted today** — `scripts/lib/plugins.mjs` `shellHooks()` globs only `hooks/*.sh`. Extend it to cover `bin/*` or accept the trivial static launcher is unlinted.
- **`workflow_dispatch` needs the file on the DEFAULT branch** — `build-binaries.yml` cannot be dispatched (UI or `gh workflow run`) while it exists only on this feature branch. The step-7 binary production therefore happens **after this branch merges to main** (or the workflow is cherry-picked there first). It will also fail by design if dispatched before the crate lands (step 3).

## Global constraints

- Manifest versions stay in lockstep across `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and the versioned marketplace entry (`release.mjs` enforces).
- Pin every CI `uses:` to a 40-char commit SHA with a trailing version comment; keep `permissions: contents: read` (per `.github/AGENTS.md` supply-chain constraints).
- Skill body ≤ 500 lines; `metadata.content_hash` re-synced (`node scripts/skills/content-hash.mjs --backfill`) on any SKILL.md change.
- **Dependency budget:** keep the crate lean — std + a small JSON serializer (e.g. `tinyjson`) + **one** small advisory-lock crate (`rustix`, chosen for size over `nix`/`fs2`). No async runtime (do NOT use `rmcp` — it pulls the whole tokio stack), no heavy transitive tree; this bounds binary size + reproducibility.
- **Never Git LFS for `bin/`** — plugins reach consumers by plain `git clone`; without `git-lfs` installed the clone materializes **pointer text files** where the binaries should be, silently shipping a broken plugin. Plain git blobs only, marked `binary` in `.gitattributes`.
- **Mutable state lives in `~/.agent-relay` only — never under `${CLAUDE_PLUGIN_ROOT}`**: the plugin install dir is replaced on every update (old dir cleaned after ~7 days, per the plugins reference); the store's home already sits outside it by design — keep it that way.
- **Rust gate = fmt + clippy + `--locked`:** `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, and `--locked` on every CI/gate build (assert `Cargo.lock`), matching the repo's supply-chain posture (SHA-pinned actions, frozen lockfiles).

## Cold-handoff checklist

1. **File manifest** — ✓ every step names exact path(s) (`rust/{Cargo.toml,Cargo.lock,rust-toolchain.toml}`, `rust/src/{store,discover,cli,hook,bus}.rs`, the four manifests, `bin/{relay,relay-*,SHA256SUMS}`, `.gitattributes`, `ci.yml:14`, `build-binaries.yml`, and the five `git rm` targets).
2. **Environment & commands** — ✓ `cargo build --release --locked --manifest-path plugins/session-relay/rust/Cargo.toml`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `node scripts/ci.mjs`, `cargo test --manifest-path …`, `node plugins/session-relay/test/selftest.mjs`, `claude plugin validate ./plugins/session-relay`, `node scripts/skills/content-hash.mjs --backfill`.
3. **Interface & data contracts** — ✓ the sh launcher, the per-manifest flip table (per-tool plugin-root var + exec/shell form), the `[profile.release]` block, the store env-var contract, the `.lock` dir→file change, and the MCP wire contract — all in `## Interfaces & data shapes`.
4. **Executable acceptance** — ✓ command + expected output each (`cargo build --locked` exit 0; fmt/clippy exit 0; `sha256sum -c` → `OK`; per-file `grep -L 'bin/relay'` → empty; the `${PLUGIN_ROOT}` Codex-var grep → exit 0; `git ls-files -s` exec-bit count; SKILL residual grep → empty; `ls …` deleted → `No such file`; self-test `PASS`).
5. **Out of scope** — ✓ `context-tree-nudge.mjs` stays Node, docks manifests/skills untouched, no message-bus protocol change.
6. **Decision rationale** — ✓ one-binary (flock all-or-nothing), Rust-over-Go, darwin-via-matrix, CI-provisioning, commit-in-tree — all in `## Context & rationale`.
7. **Known gotchas** — ✓ `.lock` dir→file `EISDIR`, flock all-or-nothing, NFS advisory weakness, unverified Codex `${CLAUDE_PLUGIN_ROOT}` command substitution, unlinted launcher.
8. **Global constraints verbatim** — ✓ manifest version lockstep, SHA-pinned `uses:`, `permissions: contents: read`, ≤500-line skill body, dependency budget (`rustix` + small JSON serializer, no tokio/rmcp), **no Git LFS for `bin/`**, state in `~/.agent-relay` never under the plugin root, Rust gate = fmt + clippy + `--locked`.
9. **No undefined terms / forward refs** — ✓ no TBD/TODO; every path, command, crate, and env var resolves in-repo or in `## Interfaces & data shapes`.

## STOP conditions

- ~~If a real Codex install does NOT substitute **native `${PLUGIN_ROOT}`** in the MCP `command` field → STOP~~ **FIRED + RESOLVED 2026-07-02**: live verify confirmed no substitution AND no env for MCP children; shipped the prescribed sh fallback (env-first + cache-glob — see Interfaces). Bus verified live on codex 0.142.5 (`whoami`/`roster` over the plugin MCP handshake).
- If the cross-process `cargo test` cannot demonstrate `flock` mutual exclusion as reliably as the current mkdir-mutex → STOP at step 3; do not flip manifests. The flock upgrade is the point of the port.
- If `build-binaries.yml` cannot produce a runnable darwin binary on the native runners → STOP before step 7; do not commit a partial arch set (the launcher would `exit 1` on the missing platform).

## Open questions

_Resolved by the maintainer's scope choice (full port, commit-in-tree) and this draft: darwin binaries are produced by the `build-binaries.yml` native matrix; CI is provisioned with Rust in `ci.yml`; the four binaries are committed before the tag. The one deferred sub-decision — automating the "download CI artifacts → commit into `bin/`" step (bot commit) vs. the manual first-cut flow — is a follow-up, not a blocker._

## Self-review

Score: 75 → ~90/100 · trajectory 66→88→75→~90 (two fresh-context `plan-review` red-teams, big/risky tier; every finding from both applied pre-start) · stopped: second review pass, all findings applied.

**Second re-review pass (2026-07-01, post build-model rewrite) scored 75/100** and caught one BLOCKING propagation gap: the resolved "Codex uses native `${PLUGIN_ROOT}`" decision never reached Goal/Interfaces/Step 6, so a cold executor would have written the exact `${CLAUDE_PLUGIN_ROOT}` form [#19372](https://github.com/openai/codex/issues/19372) reports failing — and the `grep -L 'bin/relay'` acceptance couldn't distinguish. Fixed: per-manifest flip table in Interfaces, a dedicated Codex-var acceptance grep. Its 7 practice defects (merged with an independent web-research pass): Git-LFS forbid (pointer files = silently broken consumer plugin), concrete `[profile.release]` block, `rust-toolchain.toml` exact-pin (without it the reproducible-rebuild criterion was unachievable), ci.mjs checksum-verify ordered before the binaries exist (now skips-with-notice until step 7), exec-bit 100755 + `.gitattributes` for committed binaries, `bus.rs` stdout-purity as a normative MCP MUST, and fmt/clippy/`--locked` gating. Also: split the overloaded step 6 into 6 (tests+docs) / 7 (atomic flip), fixed step-3 over-declared dependency, enumerated all 8 SKILL.md path strings + a residual grep, corrected the selftest ~L390 source imprecision, named the black-box name-seeding path (`relay register`).

Web-verification pass corrected/confirmed: **GitHub runner labels were stale** — `macos-13` (Intel) is retired; switched to one arm64 `macos-latest` runner cross-building both darwin arches (was a 3-runner macos-14/macos-13/ubuntu matrix). **Dropped the `build-all.sh` Mac fallback** as a speculative second build path (CI produces all four; Mac dev needs only the host leg). **Codex substitution** clarified: native `${PLUGIN_ROOT}` + `${CLAUDE_PLUGIN_ROOT}` compat, with issue #19372 as the residual risk — STOP retained. Claude-side binary `command` flip confirmed documented-supported.

Red-team caught and fixed: (1) **no producer for the two darwin binaries** — release.mjs runs on Linux and can't cross-compile darwin, so added `build-binaries.yml` (an arm64 `macos-latest` runner builds both darwin arches + `ubuntu` builds both musl) and made release.mjs *assert* the committed set rather than build it; (2) **ci.yml never provisioned Rust/musl** yet step 5 runs `cargo` in ci.mjs — added a Rust-setup step to the validate job (the "ci.yml runs ci.mjs, no drift" doctrine); (3) **the 5 superseded `.mjs` were never deleted** — added the final `git rm` step (now step 8) + all 5 to `affected_paths`; (4) the "no residual node `.mjs`" grep **false-passed** on the two MCP manifests (command/`.mjs` on separate lines) — replaced with a per-file `grep -L 'bin/relay'` + `"command": "node"` check; (5) the flip step edited a to-be-deleted `bus.mjs` — moved the hint strings into `bus.rs`; (6) specified black-box marker seeding (`bin/relay hook`) + the cargo cross-process mechanism; (7) resolved the dep-budget contradiction (rustix, budget raised) + added the `.lock` dir→file migration; (8) replaced the circular `sha256sum -c` sole-check with a reproducible-rebuild criterion. Every cited anchor was re-verified accurate (ci.yml:14, all four manifest command strings, store.mjs mkdir-mutex, the selftest black/white-box split, .gitignore:6, the bus.mjs/SKILL.md hint strings).

## Review

- **Goal met:** partial — every headless acceptance criterion passes: `cargo build --release --locked`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, and `cargo test` (incl. the cross-process `concurrent_writers_no_lost_or_torn_writes` lock race + `legacy_lock_dir_is_migrated_to_a_file`) all exit 0; `node scripts/ci.mjs` is green; the 39-check selftest PASSes through `bin/relay` (no `spawnSync('node')`, no `import lib/store`); all four manifests are flipped per the Interfaces table (Claude `plugin.json`/​`hooks.json` on `${CLAUDE_PLUGIN_ROOT}`, Codex `bus.mcp.json` on native `${PLUGIN_ROOT}` with zero `CLAUDE_PLUGIN_ROOT`, no `command:"node"`); all 4 arch binaries + launcher are committed `100755` with `sha256sum -c` all OK; the five Node `.mjs` are deleted with no live code references (only plan-doc + Rust `// port of …` mentions remain); tag-CI glob broadened to `*--v*`. Two criteria are inherently un-runnable headlessly and remain OPEN: the **live cross-tool round-trip** on real Claude+Codex sessions, and the **Codex `${PLUGIN_ROOT}` command-field substitution on a real install** (carries a STOP condition) — clear both on live sessions before ship.
- **Regressions:** none — no code/gate criterion failed; the local host-rebuild digest mismatch is the plan's designed CI-only byte-identity gate (warn locally, enforced only under `process.env.CI`), not a regression.
- **CI:** pass — `node scripts/ci.mjs` exits 0, ends `✔ All ci.mjs checks passed — 2 plugin(s) + repo-wide; safe to release.`
- **Follow-ups:** session-relay-binary-commit-bot, context-tree-nudge-rust-port, session-relay-windows-arch, session-relay-tag-time-arch-verify
- Filed by: plan-review (completion review, in_review) on 2026-07-01T20:12:14-03:00

## Mistakes & Dead Ends

- **2026-07-01T20:05-03:00**: Expected local host rebuild to match CI's committed binary byte-for-byte (pinned toolchain + `--locked` + `codegen-units=1`) → digests differ (`56ba41…` CI vs `79e08e…` local): binaries embed absolute build/registry paths and the distro linker's output → don't chase cross-machine reproducibility with `--remap-path-prefix` (linker still differs); enforce byte-identity only in CI (same image as producer) and warn locally.
- **2026-07-01T20:05-03:00**: Launcher used the classic `CDPATH= cd` idiom → shellcheck SC1007 warning failed the gate (launcher is now linted via `shellHooks`) → use the explicit `CDPATH=''` empty-string form.
- **2026-07-01T20:10-03:00**: Wrote the launcher with the Write tool and staged it → landed `100644` in the index (the plan's own EACCES gotcha) → always verify `git ls-files -s`, not `ls -l`, after creating executables.

- **2026-07-02T13:05-03:00**: Shipped `bus.mcp.json` as `{"mcpServers": {...}}` (camelCase, Claude's shape) → Codex parses ONLY a direct server map or snake_case `mcp_servers` — the file was silently ignored, so the bus NEVER loaded on Codex (latent since 0.1.0; masked because the SKILL suggested `codex mcp add` as an alternative) → mirror Codex manifests from Codex docs, not by analogy to Claude's.
- **2026-07-02T13:05-03:00**: Assumed native `${PLUGIN_ROOT}` substitutes in the Codex MCP `command` field (build docs show that form) → live debug trace (`RefreshMcpServers`) shows the literal string reaching spawn, and an env-dump probe shows MCP children get NO `PLUGIN_ROOT`/`CLAUDE_PLUGIN_ROOT` env at all (hooks do) → for plugin MCP on codex ≤0.142.5 use `sh -c` env-first + newest `~/.codex/plugins/cache/*/session-relay/*/bin/relay` glob; re-check when #19372 closes.
- **2026-07-02T13:05-03:00**: Expected the Codex SessionStart hook to fire in `codex exec` → Codex gates each plugin hook behind a `trusted_hash` in `config.toml` `[hooks.state]`; headless exec skips untrusted hooks silently → one interactive session must approve the hook (or automation passes the dangerous bypass flag).

## Sources

- `.github/workflows/ci.yml:9-15` — tag trigger `- 'docks--v*'` only; the `session-relay--v*` gap. Single `ubuntu-latest` Node/pnpm job (no Rust provisioning today).
- `.github/AGENTS.md` "Trigger model" + "No drift — ci.yml runs ci.mjs" — the doctrine step 2a must satisfy.
- `plugins/session-relay/.claude-plugin/plugin.json:24-33` — `mcpServers.bus` `command:"node"` + `args:["…/mcp/bus.mjs"]` + `env.RELAY_PROJECT_DIR`.
- `plugins/session-relay/.codex-plugin/bus.mcp.json:4-5` · `hooks/hooks.json:8` · `hooks/codex-hooks.json:8` (trailing `codex`) — the other three flip targets.
- `plugins/session-relay/lib/store.mjs` — mkdir-mutex on `.lock` (the flock target), stale-reclaim, atomic tmp+rename, sanitize/encodeDir.
- `plugins/session-relay/mcp/bus.mjs:111,130` — relay-CLI hint strings (move to `bus.rs`/`cli.rs`).
- `plugins/session-relay/test/selftest.mjs` — black-box (spawns bus/hook/relay, from ~L148) + white-box (`import ../lib/store.mjs:21`, `../lib/discover.mjs:165`, stress worker 349-367, held-lock test ~L390 — white-box, not a spawn).
- `plugins/session-relay/skills/productivity/session-relay/SKILL.md:32,40,46,59,76,97,98,126` — every `relay.mjs` / `mcp/bus.mjs` path string to rewrite (incl. the `codex mcp add … mcp/bus.mjs` example at `:76`).
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
- [MCP spec 2025-06-18 — transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) — stdio: "The server **MUST NOT** write anything to its stdout that is not a valid MCP message"; stderr MAY carry logs; newline-delimited, no embedded newlines. → **the `bus.rs` stdout-purity invariant is normative, not style.**
- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks) — exec form = `command` + `args` array, spawned with no shell; "Prefer exec form for any hook that references a path placeholder." → **`hooks.json` flips to exec form.**
- [min-sized-rust](https://github.com/johnthagen/min-sized-rust) — `opt-level="z"`, `lto=true`, `codegen-units=1`, `panic="abort"`, `strip=true` all stable-channel. → **the `[profile.release]` block.**
- [Cargo book — `cargo build`](https://doc.rust-lang.org/cargo/commands/cargo-build.html) `--locked` asserts the exact `Cargo.lock` deps ("environments where deterministic builds are desired, such as in CI"); `rust-toolchain.toml` pins the compiler per-project. → **pin toolchain + lock deps = the reproducibility story.**
- [git-lfs/git-lfs#2406](https://github.com/git-lfs/git-lfs/issues/2406) — cloning LFS content without smudge (or without git-lfs) leaves **pointer files** in the working tree. → **why LFS is forbidden for `bin/`.**
- [runner-images Ubuntu2404 readme](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md) + [macos-15-arm64 readme](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-arm64-Readme.md) (verified 2026-07-01) — both images preinstall rustup 1.29 + Rust 1.96; ubuntu has NO musl-tools. → **no toolchain action needed; apt musl-tools required.**
- `actions/upload-artifact` v7.0.1 = `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` (resolved via `gh api .../releases/latest` + tag deref, 2026-07-01) — the one new pinned action.

## Notes

Sequence rationale: fix the release gate (1) → stand up the build infra (2) → prove the lock (3) → port behavior (4) → wire the build (5) → rewrite tests + docs against the host leg (6) → land the consumer-facing flip in one atomic commit (7) → delete dead Node + gate (8). Only step 7 must be atomic (the flock all-or-nothing); steps 6's deliverables are individually reviewable. Binaries are committed **on release only** (not dev churn), size-`z` stripped (~<1 MB each), produced by the native-runner matrix — the permanent clone-size growth (~4 MB/release) is an **accepted tradeoff** for zero-runtime install. First-cut binary-commit flow is manual (download artifacts → commit); a bot-commit automation is a follow-up.
