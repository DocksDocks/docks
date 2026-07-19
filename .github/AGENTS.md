# CI workflows (.github/)

`workflows/ci.yml` runs `node scripts/ci.mjs` in one validate job. Pull requests and manual dispatches run the full gate; a release-tag push first resolves the tag to one known plugin and then runs `ci.mjs --plugin <name>`. All validators are Node `.mjs`; the job needs Node + pnpm (`corepack enable`, then `pnpm install --frozen-lockfile`) for the `yaml` package and the lockfile-pinned `claude-code` binary, and adds `node_modules/.bin` to PATH so `ci.mjs` finds `claude`. Rust is provisioned only for a full run or when the resolved plugin declares the session-relay Rust leg.

## build-binaries.yml — the session-relay binary producer

`workflows/build-binaries.yml` is the external-artifact producer for Session Relay. It has four native runner/target legs (`ubuntu-24.04`/x86_64-linux-musl, `ubuntu-24.04-arm`/aarch64-linux-musl, `macos-15-intel`/x86_64-darwin, and `macos-15`/aarch64-darwin). Every locked release build runs its own executable's exact `--version`, then uploads one stable `session-relay-<target>` asset with a canonical same-run attestation. The aggregate job accepts exactly those four pairs and publishes the four-line `SHA256SUMS` artifact. A `validate-only` dispatch proves an exact 40-hex source commit without publishing; `publish-existing-tag` and `session-relay--v*` tag pushes may publish the existing, manifest-matched tag as a staging prerelease containing exactly the four executables plus `SHA256SUMS`. The fixed prerelease notice is staging-only. Do not commit generated executables or checksums into the plugin.

## Trigger model

Only three events trigger CI:
- `pull_request` to main → run the full gate before merge
- `push` of tags matching `*--v*` — strictly resolve `<plugin>--v<version>` to a known plugin, then run that plugin's gate (`release.mjs` waits for this authoritative result)
- `workflow_dispatch` → run the full gate manually

<constraint>
**No** `push: branches: [main]` trigger — main pushes don't re-run CI; PR validation already covers it. The tag-push CI is the authoritative release gate (it decides whether the GitHub Release object is created).
</constraint>

## No drift — ci.yml runs ci.mjs

`ci.yml` always invokes `scripts/ci.mjs`; targeting changes its supported `--plugin` argument, not the validator implementation. Pull requests and manual runs execute the full repo + all-plugin gate. Release-tag runs use `scripts/ci-target.mjs` to reject malformed or unknown tags before Cargo caching or Rust provisioning, then execute the repo-wide checks plus the resolved plugin gate. Local validation is LAYER 1 (fast feedback); tag CI is LAYER 2 (authoritative, catches contributor-machine drift). See `scripts/AGENTS.md` for the validator list and release flow.

The validate job materializes the lockfile-pinned `@anthropic-ai/claude-code` binary before invoking either gate form — the same `claude` the developer would run locally.

## Cache behavior

The workflow pins the Corepack-provided pnpm version from `package.json`, configures a deterministic `~/.pnpm-store`, and caches that store with official `actions/cache`; the exact key binds runner identity, `pnpm-lock.yaml`, and `package.json`, with a same-pnpm-major restore prefix. The conditional Cargo cache stores registry/git dependencies and `plugins/session-relay/rust/target`; its exact key binds runner identity, dependencies, toolchain, and Rust sources, while its restore prefix permits incremental rebuilds only with the same dependency/toolchain identity. Cargo caching runs for full PR/manual validation and Rust-capable release tags. Caches are hints only: frozen installs, Cargo's source validation, the pinned toolchain, and `ci.mjs` remain authoritative.

## Supply-chain hardening

Mitigations against npm / GitHub Actions supply-chain attacks (per the Supabase + pnpm Dec-2025 guidance). Each is load-bearing — don't undo one to simplify a diff:

<constraint>
- **Pin every `uses:` to a 40-char commit SHA**, never a tag, with the version as a trailing comment (`actions/checkout@<sha> # v6.0.2`). A `@vN` tag is a moving target an attacker can republish; the tag-push run executes with `GITHUB_TOKEN`. SHA bumps are MANUAL — no update automation is configured (verify: `ls .github/dependabot.yml renovate.json` → neither exists); update the SHA + version comment together when bumping an action.
- **`permissions: contents: read`** at workflow scope — least privilege for validators and artifact builders. The Session Relay prerelease publisher is the sole job-level `contents: write` exception; it may consume only artifacts from its own run after the read-only identity, native-build, and aggregate jobs pass.
- **Dependency caches use official `actions/cache` pinned to a 40-character SHA**, with its release version in the trailing comment. The pnpm key binds `pnpm-lock.yaml`; the Cargo condition must stay identical to Rust provisioning so non-Rust release tags do not restore Rust state.
- **`claude-code` is pinned**, not `npm install -g`'d: it's an exact-version devDependency in `package.json`, hash-locked in `pnpm-lock.yaml` (incl. its 8 platform-binary optional deps). `pnpm-workspace.yaml` sets `allowBuilds: { '@anthropic-ai/claude-code': false }` (deny-by-default lifecycle scripts) and `minimumReleaseAge` (quarantine fresh publishes). Bump it only to a version aged past the quarantine.
- **The single validate job** does a full `pnpm install --frozen-lockfile` then `node node_modules/@anthropic-ai/claude-code/install.cjs` to materialize the ~230MB CLI binary (the `allowBuilds: false` build it skips), and puts `node_modules/.bin` on PATH so `ci.mjs`'s `claude plugin validate` resolves.
- **`npm audit signatures`** runs (non-blocking) after every install.
</constraint>
