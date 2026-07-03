# CI workflows (.github/)

`workflows/ci.yml` runs `node scripts/ci.mjs` — the exact same gate as local — in one job on GitHub. All validators are Node `.mjs`; the job needs Node + pnpm (`corepack enable`, then `pnpm install --frozen-lockfile`) for the `yaml` package and the lockfile-pinned `claude-code` binary, and adds `node_modules/.bin` to PATH so `ci.mjs` finds `claude`. The validate job also provisions Rust for the session-relay host leg (guarded: no-op until `plugins/session-relay/rust/rust-toolchain.toml` exists; rustup is preinstalled on the runner image, so no third-party toolchain action).

## build-binaries.yml — the session-relay binary producer

`workflows/build-binaries.yml` builds the four static `relay` binaries (2-runner matrix: Apple-Silicon `macos-latest` → both darwin arches; `ubuntu-latest` → both linux-musl arches) and uploads them as artifacts. **`workflow_dispatch` only — never tag-triggered**: binaries must be committed into `plugins/session-relay/bin/` *before* `release.mjs` tags HEAD (the tag push is the gate; it verifies what is in-tree, it cannot produce it). It is dispatchable only once the file exists on the default branch. No third-party toolchain action — both runner images preinstall rustup, and the pinned compiler comes from `rust-toolchain.toml`.

## Trigger model

Only three events trigger CI:
- `pull_request` to main → gate merges
- `push` of tags matching `*--v*` — any `<plugin>--v<version>` release tag (`docks--v*`, `session-relay--v*`, …) → gate releases (`release.mjs` waits for this; a plugin-specific glob here once left session-relay releases un-gated)
- `workflow_dispatch` → manual

<constraint>
**No** `push: branches: [main]` trigger — main pushes don't re-run CI; PR validation already covers it. The tag-push CI is the authoritative release gate (it decides whether the GitHub Release object is created).
</constraint>

## No drift — ci.yml runs ci.mjs

`ci.yml` runs `scripts/ci.mjs` directly, so the workflow and the local gate **cannot** drift: adding or removing a validator only touches `ci.mjs`. Local `ci.mjs` is LAYER 1 (fast feedback); tag-CI here is LAYER 2 (authoritative, catches contributor-machine drift). See `scripts/AGENTS.md` for the validator list and release flow.

The single validate job materializes the lockfile-pinned `@anthropic-ai/claude-code` binary and runs the full gate (including `claude plugin validate ./plugins/docks`) — the same `claude` the developer would run locally.

## Supply-chain hardening

Mitigations against npm / GitHub Actions supply-chain attacks (per the Supabase + pnpm Dec-2025 guidance). Each is load-bearing — don't undo one to simplify a diff:

<constraint>
- **Pin every `uses:` to a 40-char commit SHA**, never a tag, with the version as a trailing comment (`actions/checkout@<sha> # v6.0.2`). A `@vN` tag is a moving target an attacker can republish; the tag-push run executes with `GITHUB_TOKEN`. SHA bumps are MANUAL — no update automation is configured (verify: `ls .github/dependabot.yml renovate.json` → neither exists); update the SHA + version comment together when bumping an action.
- **`permissions: contents: read`** at the workflow top — least privilege for read-only validators.
- **`claude-code` is pinned**, not `npm install -g`'d: it's an exact-version devDependency in `package.json`, hash-locked in `pnpm-lock.yaml` (incl. its 8 platform-binary optional deps). `pnpm-workspace.yaml` sets `allowBuilds: { '@anthropic-ai/claude-code': false }` (deny-by-default lifecycle scripts) and `minimumReleaseAge` (quarantine fresh publishes). Bump it only to a version aged past the quarantine.
- **The single validate job** does a full `pnpm install --frozen-lockfile` then `node node_modules/@anthropic-ai/claude-code/install.cjs` to materialize the ~230MB CLI binary (the `allowBuilds: false` build it skips), and puts `node_modules/.bin` on PATH so `ci.mjs`'s `claude plugin validate` resolves.
- **`npm audit signatures`** runs (non-blocking) after every install.
</constraint>
