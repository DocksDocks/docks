# CI workflows (.github/)

`workflows/ci.yml` keeps one authoritative `validate (scripts/ci.mjs)` status.
Pull requests run two `validation-shards` matrix lanes (`core`, `relay`) plus
the independent `targeting-contracts` job; `validate` joins both prerequisites
without rerunning the gate. Core owns repo-wide checks, the focused Docks
`PlanRunV1` orchestration and bounded-workflow contracts, the joint
Docks/Effect Kit trigger-collision audit, both plugin gates, and JavaScript
quality. Relay owns the Session Relay shell, trigger, plugin, release-contract,
and native Rust gates. Manual dispatches run one full gate alongside the
targeting contract before the same join. Tag pushes run one registry-resolved
plugin gate; the skipped targeting contract is accepted by the join.

## build-binaries.yml — the session-relay binary producer

`workflows/build-binaries.yml` is the external-artifact producer for Session Relay. It has three native runner/target legs (`ubuntu-24.04`/x86_64-linux-musl, `ubuntu-24.04-arm`/aarch64-linux-musl, and `macos-15`/aarch64-darwin). x86_64-apple-darwin is no longer published as of Session Relay 0.16.0; macOS support is aarch64-apple-darwin, and retained 0.13-0.15 receipts keep their frozen four-leg shape as historical evidence. Each locked native build must prove platform behavior before unchanged attestation/upload: Linux runs positive cgroup/pidfd/Landlock custody and both workspace smokes against that leg's explicit fresh executable; macOS runs the frozen negative-admission test and remains unsupported for managed writing. Preflight verifies successful job identity, exact native runner label, and ordered build → platform evidence → Linux smoke/skip → attestation → upload without changing V1 receipt or attestation keys. The aggregate still accepts exactly three binary+attestation pairs and publishes the three-line `SHA256SUMS` artifact. A `validate-only` dispatch proves an exact 40-hex source commit without publishing; `publish-existing-tag` and `session-relay--v*` tag pushes retain the existing staging-prerelease contract of exactly three executables plus `SHA256SUMS`, with the Intel deprecation sentence in the staged prerelease body.

## Trigger model

Only three events trigger CI:
- `pull_request` to main → run the `core` and `relay` lanes plus the targeting contract, then require their unchanged `validate` join status before merge
- `push` of tags matching `*--v*` — strictly resolve `<plugin>--v<version>` to a known plugin, then run that plugin's gate (`release.mjs` waits for this authoritative result)
- `workflow_dispatch` → run the full gate manually

<constraint>
**No** `push: branches: [main]` trigger — main pushes don't re-run CI; PR validation already covers it. The tag-push CI is the authoritative release gate (it decides whether the GitHub Release object is created).
</constraint>

## No drift — ci.yml runs ci.mjs

`ci.yml` always invokes `scripts/ci.mjs`; targeting uses its supported `--lane`
or `--plugin` arguments, not another validator implementation. The two PR lanes
collectively cover the full contract through plugin ownership. They do not split
a mutation catalog, pass validation artifacts, or carry regression partition or
jobs-cap arguments.

Both PR lanes perform the frozen pnpm install and materialize the lockfile-pinned
`@anthropic-ai/claude-code` binary. Only Relay provisions Rust and restores the
Cargo cache. Manual/tag runs materialize Node dependencies in `validate` and
provision Rust only for a full run or Rust-capable target. The PR `validate`
aggregator only checks the matrix result and performs no checkout, install,
artifact handoff, or gate execution.

Relay/full Linux source gates also provision one owned cgroup-v2 delegation,
export it as `SESSION_RELAY_TEST_CGROUP_ROOT`, and remove it after `ci.mjs`. Core
and non-Rust tag gates do not provision one. Missing delegation, failed native
prerequisites, or leaked nested cgroups fail the owning gate; they are never
hidden skips.

## PR topology

- `core`: repo-wide checks; focused plan orchestration; three-skill/one-wrapper
  bounded workflows; Docks/effect-kit and their joint collision audit;
  JavaScript quality.
- `relay`: Session Relay's selected shell, collision, plugin, release-contract,
  and Rust/source checks.

Keep the two-lane selector and authoritative join in sync with
`scripts/lib/ci-targeting.mjs`, `scripts/ci.mjs`, and
`scripts/tests/ci-plugin-targeting.mjs`. Adding a third lane or moving plugin
ownership requires corresponding workflow and targeting-contract changes.

The separate targeting-contract job runs this test without `--unit` for pull
requests and manual (`workflow_dispatch`) validation, then feeds its result
into the single authoritative `validate` join. Its nested effect-kit timing
contract stays out of `ci.mjs` and release-tag targeted gates; a tag push skips
the job, and the join accepts that expected skip.

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
