# CI workflows (.github/)

`workflows/ci.yml` keeps one authoritative `validate (scripts/ci.mjs)` status. Pull requests run two `validation-shards` matrix lanes (`core`, `relay`), and the `validate` job joins them without rerunning the gate. Core owns the broad baselines, foreground plan-policy fast-surfaces and convergence-repair checks, repo-wide checks, Docks/effect-kit gates, and JavaScript quality; Relay owns the Session Relay gate, all 140 mutation rows, and the focused/malformed global preflights. Manual dispatches run one untargeted full gate; a release-tag push first resolves the tag to one known plugin and then runs only that plugin's owned gate via `ci.mjs --plugin <name>`. Both PR lanes install Node + pnpm dependencies and materialize the lockfile-pinned `claude-code`; Rust is provisioned only by the PR Relay lane, a manual full run, or a Rust-capable release target.

## build-binaries.yml — the session-relay binary producer

`workflows/build-binaries.yml` is the external-artifact producer for Session Relay. It has four native runner/target legs (`ubuntu-24.04`/x86_64-linux-musl, `ubuntu-24.04-arm`/aarch64-linux-musl, `macos-15-intel`/x86_64-darwin, and `macos-15`/aarch64-darwin). Every locked release build runs its own executable's exact `--version`, then uploads one stable `session-relay-<target>` asset with a canonical same-run attestation. The aggregate job accepts exactly those four pairs and publishes the four-line `SHA256SUMS` artifact. A `validate-only` dispatch proves an exact 40-hex source commit without publishing; `publish-existing-tag` and `session-relay--v*` tag pushes may publish the existing, manifest-matched tag as a staging prerelease containing exactly the four executables plus `SHA256SUMS`. The fixed prerelease notice is staging-only. Do not commit generated executables or checksums into the plugin.

## Trigger model

Only three events trigger CI:
- `pull_request` to main → run the `core` and `relay` lanes, then require the unchanged `validate` join status before merge
- `push` of tags matching `*--v*` — strictly resolve `<plugin>--v<version>` to a known plugin, then run that plugin's gate (`release.mjs` waits for this authoritative result)
- `workflow_dispatch` → run the full gate manually

<constraint>
**No** `push: branches: [main]` trigger — main pushes don't re-run CI; PR validation already covers it. The tag-push CI is the authoritative release gate (it decides whether the GitHub Release object is created).
</constraint>

## No drift — ci.yml runs ci.mjs

`ci.yml` always invokes `scripts/ci.mjs`; targeting uses its supported `--lane` or `--plugin` arguments, not another validator implementation. Pull requests collectively execute the full contract through the two partitioned lane invocations: Core runs the `baselines` partition plus the foreground plan-policy fast-surfaces and convergence-repair checks, while Relay runs `mutations` and the focused/malformed global preflights. Manual runs execute the untargeted repo + all-plugin gate, preserving the unqualified three-baseline plus 140-mutation contract. Release-tag runs use `scripts/ci-target.mjs` to reject malformed or unknown tags before Cargo caching or Rust provisioning, then execute only the resolved plugin's owned author checks, target-derived shell lint, and plugin gate, including its marketplace/version coherence. Local validation is LAYER 1 (fast feedback); tag CI is LAYER 2 (the authoritative selected-plugin release gate, catching contributor-machine drift). See `scripts/AGENTS.md` for the validator list and release flow.

Both PR lanes perform the frozen pnpm install and materialize the lockfile-pinned `@anthropic-ai/claude-code` binary. Only Relay provisions Rust and restores the Cargo cache. Manual/tag runs materialize Node dependencies in the `validate` job and provision Rust only for a full run or Rust-capable target. The PR `validate` aggregator only checks the matrix result and performs no checkout, install, artifact handoff, or gate execution.

## PR topology decision record

The selected core+relay topology measured median lane times of 46,113 ms for Core and 49,622 ms for Relay, a 7.07% spread and 95,735 ms total compute; the Relay plugin phase measured 49,567 ms. It retains one authoritative join and no shard artifacts.

Keep the rejected layouts rejected unless new evidence changes the result:
- An empty Relay regression task duplicated useless preflight work and task output without owning useful cases.
- The regenerated three-lane fallback passed correctness but failed the 15% balance requirement: Core 46,840 ms, Relay 49,140 ms, mutations 14,586 ms; 70.3% spread and 110,566 ms total compute.
- An unpartitioned Core measured 68–96 seconds and misses the 60-second lane cap.

Classify future regression tests by contract: broad baselines belong to Core; mutation oracles belong to Relay. Preserve the authoritative unqualified inventory of three baselines plus 140 mutation rows. Do not add a lane, restore sharding, introduce a validation-artifact handoff, or move global preflight ownership without fresh three-run qualification and corresponding workflow, targeting, release-evidence, and source-contract updates. Qualification must prove stable passing inventories, the unqualified `3+140` and disjoint partition `3+0`/`0+140` contracts, lane medians at or below 60,000 ms, Relay phase at or below 52,815 ms, spread at or below 15%, compute no worse than the fallback, and the unchanged authoritative join/manual/tag behavior.

## Cache behavior

The workflow pins the Corepack-provided pnpm version from `package.json`, configures a deterministic `~/.pnpm-store`, and caches that store with official `actions/cache`; the exact key binds runner identity, `pnpm-lock.yaml`, and `package.json`, with a same-pnpm-major restore prefix. The conditional Cargo cache stores registry/git dependencies and `plugins/session-relay/rust/target`; its exact key binds runner identity, dependencies, toolchain, and Rust sources, while its restore prefix permits incremental rebuilds only with the same dependency/toolchain identity. Cargo caching runs for the PR Relay lane, manual full validation, and Rust-capable release tags. Caches are hints only: frozen installs, Cargo's source validation, the pinned toolchain, and `ci.mjs` remain authoritative.

## Supply-chain hardening

Mitigations against npm / GitHub Actions supply-chain attacks (per the Supabase + pnpm Dec-2025 guidance). Each is load-bearing — don't undo one to simplify a diff:

<constraint>
- **Pin every `uses:` to a 40-char commit SHA**, never a tag, with the version as a trailing comment (`actions/checkout@<sha> # v6.0.2`). A `@vN` tag is a moving target an attacker can republish; the tag-push run executes with `GITHUB_TOKEN`. SHA bumps are MANUAL — no update automation is configured (verify: `ls .github/dependabot.yml renovate.json` → neither exists); update the SHA + version comment together when bumping an action.
- **`permissions: contents: read`** at workflow scope — least privilege for validators and artifact builders. The Session Relay prerelease publisher is the sole job-level `contents: write` exception; it may consume only artifacts from its own run after the read-only identity, native-build, and aggregate jobs pass.
- **Dependency caches use official `actions/cache` pinned to a 40-character SHA**, with its release version in the trailing comment. The pnpm key binds `pnpm-lock.yaml`; the Cargo condition must stay identical to Rust provisioning so non-Rust release tags do not restore Rust state.
- **`claude-code` is pinned**, not `npm install -g`'d: it's an exact-version devDependency in `package.json`, hash-locked in `pnpm-lock.yaml` (incl. its 8 platform-binary optional deps). `pnpm-workspace.yaml` sets `allowBuilds: { '@anthropic-ai/claude-code': false }` (deny-by-default lifecycle scripts) and `minimumReleaseAge` (quarantine fresh publishes). Bump it only to a version aged past the quarantine.
- **Each PR Core/Relay lane and every non-PR `validate` execution** does a full `pnpm install --frozen-lockfile`, then `node node_modules/@anthropic-ai/claude-code/install.cjs` to materialize the ~230MB CLI binary (the `allowBuilds: false` build it skips), and puts `node_modules/.bin` on PATH so `ci.mjs`'s `claude plugin validate` resolves. Only the PR Relay lane provisions Rust and restores Cargo state; the PR `validate` job is only the authoritative lane-result join.
- **`npm audit signatures`** runs (non-blocking) after every install.
</constraint>
