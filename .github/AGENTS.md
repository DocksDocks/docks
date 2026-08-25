# CI workflows (.github/)

`workflows/ci.yml` keeps one authoritative `validate (scripts/ci.mjs)` status.
Pull requests run the `validation-shards` matrix lanes their changed paths
resolve to plus the independent `targeting-contracts` job; `validate` joins both
prerequisites without rerunning the gate. Core owns `scripts/tests/plan-cli.mjs`
plus the `bounded-workflows` case and the `plan-workspace-template` comparison
between `docs/PLAN.md` and the plugin plan template in
`scripts/tests/plan-skill-phases.mjs`, the Docks trigger-collision audit, the
plugin gates, and JavaScript quality. Manual
dispatches run one full gate alongside the targeting contract
before the same join. Tag pushes run one registry-resolved plugin gate; the join
requires the targeting contract to be skipped there.

`workflows/dependency-integrity.yml` is the only other workflow. It runs on a
weekly schedule and on manual dispatch, installs with the frozen lockfile, and
verifies registry signatures with `npm audit signatures`.

## Trigger model

Only three events trigger CI:
- `pull_request` to main → resolve the diff into a shard set, run those shards plus the targeting contract, then require their unchanged `validate` join status before merge
- `push` of tags matching `*--v*` — strictly resolve `<plugin>--v<version>` to a known plugin, then run the repo-wide shard over the released bytes followed by that plugin's gate (`release.mjs` waits for this authoritative result)
- `workflow_dispatch` → run the full gate manually

<constraint>
**No** `push: branches: [main]` trigger — main pushes don't re-run CI; PR validation already covers it. The tag-push CI is the authoritative release gate (it decides whether the GitHub Release object is created). Because the version-bump commit goes straight to main and the targeted `--plugin` gate skips every repo-wide phase, the tag push runs `--lane repo` first and the plugin gate last: the released bytes — including the repo-wide `.claude-plugin/marketplace.json` the bump edits — get repo-wide validation exactly once, without charging every merge a second full run.
</constraint>

## No drift — ci.yml runs ci.mjs

`ci.yml` always invokes `scripts/ci.mjs`; targeting uses its supported `--lane`
or `--plugin` arguments, not another validator implementation. The PR shards
collectively cover the full contract through plugin ownership. They do not split
a mutation catalog, pass validation artifacts, or carry regression partition or
jobs-cap arguments.

Every gate-running PR shard performs the frozen Bun install and materializes the
lockfile-pinned `@anthropic-ai/claude-code` binary. Manual and tag runs
materialize Node dependencies in `validate`. The PR `validate` aggregator only
checks prerequisite job results and performs no checkout, install, artifact
handoff, or gate execution.

## PR topology

A pull request pays for the shards its diff implicates, not for everything.
`resolve-shards` diffs the base SHA against HEAD with first-party git plumbing and
emits a lane list that `validation-shards` consumes through `fromJSON`. The
changed-path → shard mapping is `root` + `ciLane` in `scripts/lib/plugins.mjs`; no
lane list is duplicated in YAML.

- `repo` (always runs): workflow YAML, marketplace catalogs, repo-wide guards
  (context tree, no-bespoke-gates, durable anchors, author tooling, observability,
  test-contract registry, unit tests), and the CI targeting contract. Cross-plugin
  by nature and cheap (~10 s), so it is never skipped.
- `core`: Docks and plan-lifecycle — their plugin gates, the plan CLI
  contract, the bounded-workflows case, the plan-workspace-template comparison
  between `docs/PLAN.md` and the plugin plan template for three skills and two
  reviewer wrappers, collision audits, and JavaScript quality.

<constraint>
Resolution fails **open**. A missing or unresolvable base SHA, an empty diff, a
non-pull-request event, or any changed path outside every plugin root runs EVERY
shard. A shard is skipped only on a positive, successful determination that
nothing it owns changed. The join asserts a per-event truth table: each
prerequisite must hold exactly the result its own `if:` requires (all three
`success` on a pull request), so a skipped shard or resolver is a failure there
rather than a pass, and an unrecognised event fails outright. The resolver
itself may never return a selection that gates nothing.
</constraint>

Keep the shard selector and authoritative join in sync with
`scripts/lib/ci-targeting.mjs`, `scripts/ci-target.mjs`, `scripts/ci.mjs`, and
`scripts/tests/ci-plugin-targeting.mjs`. Adding a shard or moving plugin
ownership requires corresponding workflow and targeting-contract changes.

The separate targeting-contract job runs this test without `--unit` for pull
requests and manual (`workflow_dispatch`) validation, then feeds its result
into the single authoritative `validate` join. Its timing contract stays out of
`ci.mjs` and release-tag targeted gates; a tag push skips the job, and the join
accepts that expected skip.

## Cache behavior

The workflow installs Bun with `oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0`. The action reads Bun 1.4.0 from `packageManager`, needs no version input, and caches only the Bun executable. A separate official `actions/cache` step caches `~/.bun/install/cache`; its exact key binds runner identity, `bun.lock`, and `package.json`. Caches are hints only: frozen installs and `ci.mjs` gates decide correctness. `resolve-shards` restores no cache and installs no dependencies; it needs only a checkout and Node.

## Hosted cost capture

`workflows/ci.yml` — hosted timing stamps — `start hosted step timing` establishes the baseline and
`mark hosted cache restore` records Bun dependency-cache outcomes. The frozen install, registry-signature audit, Claude binary
materialization, PATH update, `run validation lane`,
`run non-unit plugin-targeting contracts`, and `run the authoritative gate (scripts/ci.mjs)` append stamps. A stamped
step's duration is its stamp minus the preceding stamp.

`workflows/ci.yml` — `publish hosted timing artifact` — uploads
`${{ runner.temp }}/docks-hosted-timings.jsonl` and `${{ runner.temp }}/docks-ci-timings.json` with the sole permitted
uploader, `actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1`. The `validate` job remains
read-only; never add `contents: write`.

## Supply-chain hardening

Mitigations against npm and GitHub Actions supply-chain attacks. Each is load-bearing — don't undo one to simplify a diff:

<constraint>
- **Pin every `uses:` to a 40-char commit SHA**, never a tag, with the version as a trailing comment (`actions/checkout@<sha> # v6.0.2`). A `@vN` tag is a moving target an attacker can republish; the tag-push run executes with `GITHUB_TOKEN`. SHA bumps are MANUAL — no update automation is configured (verify: `ls .github/dependabot.yml renovate.json` → neither exists); update the SHA + version comment together when bumping an action.
- **`permissions: contents: read`** at workflow scope — least privilege for validators and artifact builders.
- **Dependency caches use official `actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0`**, with the Bun key bound to `bun.lock` and `package.json`. Bun itself comes from `oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0`, which reads the `packageManager` pin and caches only the executable.
- **`claude-code` is pinned rather than installed globally**: it is an exact-version devDependency in `package.json` and hash-locked in `bun.lock`, including its eight platform-binary optional dependencies. `bunfig.toml` sets `minimumReleaseAge = 259200` seconds to quarantine fresh publishes; bump the dependency only to a version older than that quarantine.
- **Lifecycle scripts are denied in `package.json` with `"trustedDependencies": []`.** The empty array is the only spelling that denies every lifecycle script. Omitting the field instead trusts Bun's built-in list, which includes `@anthropic-ai/claude-code`.
- **The PR `core` lane and every non-PR `validate` execution** run `bun install --frozen-lockfile`, then `node node_modules/@anthropic-ai/claude-code/install.cjs` to materialize the approximately 230 MB CLI binary whose lifecycle script was denied, and put `node_modules/.bin` on PATH so `ci.mjs`'s `claude plugin validate` resolves. The PR `validate` job is only the authoritative lane-result join. Node 24 remains the validator runtime; Bun is the package manager and script runner.
- **`npm audit signatures`** remains the non-blocking signature check after every install because Bun has no signature-verification equivalent.
</constraint>
