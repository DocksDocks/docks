# Plugin-author tooling (scripts/)

These scripts validate and release the repo's plugins. They are **author-side only** — never shipped to consumers. All tooling is Node `.mjs` — including `release.mjs` (`--dry-run` supported) and the cross-tool `context-tree-nudge` PostToolUse hook. The only shell in the repo is session-relay's arch-dispatch launcher (`plugins/session-relay/bin/relay`, POSIX sh, shellcheck-linted). `ci.mjs` is the local gate, and `.github/workflows/ci.yml` invokes that same gate in full or with its supported `--lane` or `--plugin` target.

<constraint>
Run focused checks while implementing. For a final change owned by exactly one plugin, `node scripts/ci.mjs --plugin <name>` is the authoritative pre-commit, pre-push, and pre-release gate, including descriptor-owned author, source, and release contracts. Run full `node scripts/ci.mjs` only for repo-wide validation/tooling, shared multi-plugin infrastructure, registry or CI-topology changes, changes spanning plugins, or an explicit full-gate request. Reuse a green gate only while its validated implementation bytes are unchanged. Don't loosen validator floors to make a problematic file pass; fix the file.
</constraint>

## Multi-plugin model (`scripts/lib/plugins.mjs`)

The repo hosts **multiple plugins** (`docks`, `session-relay`, …) under `plugins/`. `scripts/lib/plugins.mjs` is the **single source of truth**: a `PLUGINS` array of descriptors, each declaring paths + capabilities. **Adding a plugin = adding one descriptor** — no edits to `ci.mjs`/`release.mjs`.

| Descriptor field | Meaning |
|---|---|
| `name` | marketplace + tag identity (`claude plugin tag` → `<name>--v<ver>`) |
| `root` | plugin dir under the repo (`plugins/<name>`) |
| `skills` | skills root, or `null` (skills-only checks self-skip when absent) |
| `agents` | agents root, or `null` (agents guard+score run only when set) |
| `codex` | `true` when a `.codex-plugin/` mirror + Codex marketplace entry ship |
| `selftest` | path to a runnable self-test, or `null` |
| `ciLane` | required pull-request lane ownership: `core` for ordinary plugins, `relay` for Session Relay |
| `rust` | Rust source/prebuilt capability, or `null`: `{ dir, binName, source: { manifest, lockfile, builtBinary, testBinaryEnv }, prebuilt: { targets, assetPrefix, checksumAsset } }` — `ci.mjs` formats, lints, builds, and exercises the source-selected host binary. Prebuilt target assets and `SHA256SUMS` are release artifacts produced by the pinned native workflow; they are never committed in a plugin payload. Helpers in `lib/rust-bin.mjs` |
| `extraJson` | extra JSON configs to validate (hooks/mcp/etc.) |
| `authorChecks` | ordered repository author suites owned by the plugin (`idempotency`, `plan-reviewer` for Docks; `[]` otherwise) |
| `releaseContracts` | ordered production release-state/evidence contract tests owned by the plugin (`[]` when absent) |
| `sourceChecks` | ordered source/process/smoke invocations; each `{ path, args, binaryArg? }`. `ci.mjs` appends the single fresh source-built Rust executable only through `binaryArg`, while also exporting the descriptor's test-binary env for nested process tests. |
| `transformGuard` | run `transform-guard.mjs` (curated transformers) |
| `install` | the consumer install snippet for the GitHub Release notes |
| `release` | Release artifact names, the non-install prerelease staging body, and the stable install command. Session Relay's state machine and workflow consume these identities without inventing alternate asset names or install text. |

`ci.mjs` is **registry-driven**. A full invocation runs repo-wide checks once (workflow YAML, both marketplace catalogs, tree/guard, durable anchors, author tooling, unit tests, and CI targeting), then selects every present plugin's shell hooks, repository author suites, and capability-driven `gatePlugin` work. `--plugin <name>` skips repo-wide sections and runs only the named plugin's owned author checks, target-derived shell lint, and plugin validation. When Docks plan author checks apply, CI runs `scripts/tests/plan-orchestration.mjs` plus `plan-skill-phases.mjs --case bounded-workflows`. Trigger-collision checks audit Docks and Effect Kit together once; Relay retains its own selected-root check.

Session Relay declares four exact Rust inventory invocations, the recursive reentry guard, and both workspace smoke cases in `sourceChecks`. The focused gate builds once, passes that absolute executable explicitly to smoke, then runs the immutable self-test at jobs 1 and jobs 4 and requires byte-identical stdout. Inventory tests execute their full nonempty target sets with zero ignored/filtered cases; reentry recursively classifies new process birth, FD transfer, signal, broker, Git, filesystem-probe, and platform sites. Linux GitHub CI owns one real delegated cgroup root for the gate; a direct local `workspace_lease_process` inventory self-provisions a unique noninteractive-sudo root when the caller did not supply one. Creator-owned roots are removed afterward, while absent or leaked delegation fails rather than skipping.

## Pull-request topology

The two closed PR lanes select plugins, not regression partitions:
- **Core** owns repo-wide checks, the focused Docks plan-orchestration and bounded-workflow contracts, Docks/effect-kit plugin gates, their joint trigger-collision audit, and JavaScript quality.
- **Relay** owns the Session Relay shell, trigger-collision, plugin, release-contract, and native Rust gates.

Both lanes perform the frozen pnpm install and materialize the pinned
`claude-code` binary. Only Relay provisions Rust and restores Cargo state. Their
results feed the single authoritative `validate (scripts/ci.mjs)` join; manual
dispatch remains one untargeted full gate, and a release tag remains one
strictly resolved `--plugin <name>` gate. There is no regression partition,
jobs-cap plumbing, mutation shard, or artifact handoff.

Clear, low-risk work describable as one concrete diff with one bounded
acceptance path goes straight to implementation. Canonical plans are reserved
for multi-commit work, scheduling, cold handoff, unresolved approaches,
cross-subsystem or public-contract changes, destructive or security-sensitive
work, external effects, or an explicit plan request.

The live plan author suite has exactly three owners: `plan-workspace` maintains
the workspace; main-context `plan-manager` owns classify through draft review,
one repair, implementation, observed acceptance, finish, and archive; internal
read-only `plan-reviewer` returns `PlanReviewV1`. Only reviewer wrappers ship.
Current state is one compact `PlanRunV1`; schemas 1–6 are historical
validation/quarantine only. The focused current contract lives in
`scripts/tests/plan-orchestration.mjs`; executable historical characterization,
including the frozen 143-case malformed corpus, is selected through
`--case historical`.

### Adding plugin N+1 (the whole checklist — no orchestrator edits)

1. **Payload** at `plugins/<name>/` — `.claude-plugin/plugin.json` (+ `.codex-plugin/plugin.json` when it ships to Codex) and its `skills/`/`agents/`/`hooks/` dirs.
2. **One descriptor** appended to `PLUGINS` in `lib/plugins.mjs` — assign required `ciLane` ownership (`core` or `relay`), declare only capabilities that exist (`agents`/`selftest`/`rust` take `null`, `extraJson`/`authorChecks`/`releaseContracts` use `[]` when absent), and include the install snippet.
3. **Two catalog entries**: `.claude-plugin/marketplace.json` (name/source/version — version in lockstep with both manifests) and `.agents/plugins/marketplace.json` (local-source + policy block) for Codex.
4. **Optional context node** (`plugins/<name>/AGENTS.md` + one-line `CLAUDE.md`) when the plugin carries conventions of its own — `tree/guard` enforces the pair; the durable-anchors guard scans it.
5. Verify: `node scripts/ci.mjs --list` shows the plugin and full `node scripts/ci.mjs` is green. Docks/effect-kit use the legacy positional release command; a prebuilt CLI uses its reviewed prepare/publication modes.

Ordinary plugin behavior stays registry-driven: extend descriptor capabilities rather than adding orchestrator branches. Session Relay is the deliberate exception because its reviewed source preparation, prerelease publication, serialized promotion, and stable finalization are one fail-closed release protocol, not a generic plugin bump.

## Validators (orchestrated by ci.mjs)

| Script | Purpose | Floor |
|---|---|---|
| `ci.mjs` | the authoritative gate entry point — without `--plugin`, runs repo-wide checks once and gates every registry entry; `--plugin <name>` skips repo-wide sections and runs only that plugin's owned author checks, shell-hook lint, and `gatePlugin` validation (manifest/version coherence, `claude plugin validate`, Codex parity, and the checks below) | — |
| `skills/guard.mjs` | runs the skill frontmatter validators (codex + claude via `lib/validate-skills.mjs`) + `codex-facts.mjs` + `refs-guard.mjs` | pass/fail |
| `lib/validate-skills.mjs` | skill frontmatter per runtime — name/description, 1024-char cap, no `#` truncation, CSO `Use when` prefix, `user-invocable`, `metadata.updated`, `references/` one level deep | pass/fail |
| `skills/codex-facts.mjs` | pins canonical Codex model ids / `sandbox_mode` / `model_reasoning_effort` + the `agents.max_depth` fact in the skill-agent-pipeline refs (self-skips when absent) | pass/fail |
| `skills/refs-guard.mjs` | reference hygiene: broken local `references/`/`assets/` links, orphan reference files, missing `## Contents` TOC on `references/*.md` > 100 lines with ≥3 doc-level headings | pass/fail |
| `skills/content-hash.mjs` | `metadata.updated` idempotency baseline | `--check-only` gate |
| `skills/transform-guard.mjs` | curated transformers carry a preservation `<constraint>` + `## Verification`; pending-allowlist warns, regression fails | pass/warn |
| `skills/no-author-scripts.mjs` | shipped SKILL.md + references/ + agent bodies must not name docks author scripts — incl. the `.mjs` entry points `scripts/ci.mjs`/`scripts/release.mjs` (verify: plant one in a non-allowlisted body → the guard must fail naming it; revert); allowlist: `scaffold`, `write-skill`. Takes `<skills-dir> [agents-dir]` args so `gatePlugin` scopes it per-plugin (agents scanned only when given) | pass/fail |
| `skills/durable-anchors.mjs` | repo-wide (runs once): long-lived docs — every shipped skill body/reference + every AGENTS.md node outside docs/plans/ (point-in-time by contract) — carry no LIVE `file:line` anchors (a `path:NN` whose path resolves in the repo fails; fictional example paths pass by non-resolution). Fix = the durable grammar: `` `path` — `symbol` — purpose (verify: `command`) `` | pass/fail |
| `agents/guard.mjs` | agent frontmatter, "Use when…"/"Not…" CSO, **no `model` key** (any literal — `inherit` included — reaches omp as a model ID and kills the spawn; Claude defaults to `inherit` anyway) | pass/fail |
| `agents/score.mjs` | agent quality (max 15) | per-file ≥14; total = N×14 |
| `tree/guard.mjs` | context-tree node pairs (AGENTS.md + one-line CLAUDE.md, ≤500) | pass/fail |
| `config/read-floor.mjs` | reads per-file floors from `scoring.json` | — |
| `tests/skill-trigger-collision.mjs` | cross-skill trigger-overlap audit — fails on a ≥5-token unrouted pair (`--report` prints the matrix) | pass/fail |
| `tests/idempotency.mjs` | content-hash determinism + every stored hash in sync | pass/fail |
| shellcheck (target-selected) | `-S warning` over selected plugins' `hooks/*.sh` plus a Rust capability's sh launcher (`bin/<binName>`), via `shellHooks(p)`; a full invocation selects every plugin | pass/warn |

`--per-file` prints `<category>/<name> <score>`. Total floors are count-derived (`artifact_count × per-file_floor`) — adding/removing an artifact moves the floor automatically. Per-file floors are the true gate. Skill frontmatter parsing uses Node + the npm `yaml` package (`corepack enable && pnpm install --frozen-lockfile`).

**Shared author-side libs (`scripts/lib/`):** `rust-bin.mjs` (the `rust` capability's helpers — `rustHostTarget()` maps the host to a supported target, `rustReleaseAssetNames()` defines the release asset set, `parseSha256Sums()` / `formatSha256Sums()` handle checksum manifests, `expectedRustFileIdentity()` / `detectRustFileIdentity()` validate target files, and `findCargo()` locates Cargo for source builds). `skills-walk.mjs` (SKILL.md traversal — `findSkillFiles`/`eachSkillDir`/`findSkillByName`) and `skills-parse.mjs` (frontmatter/body line helpers — `bodyAfterFrontmatter`/`slopCount`/`metaUpdated`/…) are imported by the author-side validators so the walk + body-line method live once. The bundled `write-skill/scripts/skill-guard.mjs` keeps its OWN copies on purpose — it ships standalone into consumer repos …

`ci-background-task.mjs` owns asynchronous Node-task capture for `ci.mjs`.
Successful tasks remove their private spool. Failed tasks retain complete stdout
and stderr in an owned mode-`0700` temporary directory with mode-`0600` files,
and print both exact paths before the gate reports failure.

**Single-source scorer:** the 16-pt skill scorer lives ONCE, in the bundled `plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs` (`score [--per-file]`). The kit's `ci.mjs` scores with that same shipped file over `plugins/docks/skills`, and consumers run it on their own skills (`validate` / `score`) — one rubric, no author-side mirror, no sync contract. Bundled `scripts/` aren't content-hashed; bump write-skill's `metadata.updated` when the rubric changes.

`--timings-json` is observational: it records ordered phase durations and
background-task durations without changing gate selection or status. Background
tasks remain mandatory; their failure output is retained behind reported spool
paths and their result is joined before `ci.mjs` can pass.

### Host-derived resource envelope

`scripts/lib/host-resources.mjs` sizes the gate to the host that actually runs it.
The gate prints a one-line envelope so a throttled or slow run explains itself.

It separates capacity — what the machine or cgroup allows — from availability —
what is free right now. Capacity resolves cgroup v2 or v1 limits before falling
back to host limits; `os.totalmem()` and `os.availableParallelism()` are cgroup-blind
and would otherwise give a CI container a host-sized envelope. Runtime availability
is sampled from PSI stall counters rather than load average. Competing-process
detection is human-facing diagnostics only; measurement, not the process-name list,
determines the job count.

The envelope derives only `CARGO_BUILD_JOBS`: it is memory-derived, bounded by
point-in-time availability, and reserves one core when there is no swap.

| Knob | Precedence |
|---|---|
| Cargo jobs | `DOCKS_CI_CARGO_JOBS` > `CARGO_BUILD_JOBS` > derived |

Both cargo settings explicitly control build parallelism and outrank derivation.
Budgeting defaults are estimates, not measurements: `cargoBytesPerJob` 512 MiB,
`memoryBudgetFraction` 0.6, `reserveBytes` 512 MiB, and `memoryStallCeiling` 0.1.
At or above that memory-stall fraction, the build collapses to one job.

The envelope reports rather than fixes a RAM-backed-temp hazard. When temp is
RAM-backed and the host has no swap, it emits
`WARNING <tmpdir> is <fstype> with no swap (temp competes for RAM)`.
Relocating temp is not an available remedy: the session-relay self-test nests roughly
98 bytes of scenario path under the temp root against the kernel's 108-byte Unix
`sun_path` limit, leaving under ten characters of budget. A longer root makes the
fake app-server socket's `bind()` fail. Swap is the real remedy because it makes
tmpfs pages reclaimable instead of pinning them in RAM until their files are deleted.

For example, an 8 GB, 6-core swapless host with tmpfs `/tmp` prints
`5/6 cpu free, 7.8G ram, swap 0.0G, WARNING /tmp is tmpfs with no swap (temp competes for RAM) → cargo -j5`;
a 2 GB, 2-CPU cgroup yields `cargo -j1`.

## Native workspace evidence boundary

The four `build-binaries.yml` matrix legs are native, not cross-build evidence. Before unchanged attestation/upload, Linux legs must complete the exact cgroup/pidfd/Landlock custody test and both smokes against that leg's explicit fresh binary; macOS legs must complete the frozen negative-admission test. `verify-session-relay-preflight.mjs` verifies all four successful job identities, exact runner labels, native target mapping, and ordered build → platform evidence → Linux smoke/skip → attestation → upload steps through the GitHub jobs API. Missing, reordered, skipped, failed, duplicated, or cross-run/cross-target evidence refuses.

This verifier-side check does not add receipt fields. `SourceCiReceiptV1`, `ProducerPreflightReceiptV1`, and `SessionRelayBinaryAttestationV1` retain their exact keys; verifier producer identity remains version 2. The producer still yields four binary+attestation artifacts and one checksum artifact, and publication still consumes exactly five release assets. macOS success means the refusal was proven, never that managed writing is supported. No generated binary or `SHA256SUMS` belongs in the source commit.

## Edit → release workflow

1. Edit files inside the target plugin (`plugins/<name>/{skills,agents,…}/`).
2. Run focused checks while iterating. Once the relevant implementation tree is final, use `node scripts/ci.mjs --plugin <name>` when exactly one plugin and its descriptor-owned tooling changed; use full `node scripts/ci.mjs` only for repo-wide, shared multi-plugin, registry/CI-topology, or multi-plugin changes. Plan-only lifecycle commits may reuse a green result while the validated implementation bytes remain unchanged.
3. Local Claude Code test (no push): `claude --plugin-dir ./plugins/<name>` (then `/reload-plugins`).
4. PR to main → PR-CI gates the merge.
5. After merge, release **one plugin**. Generic positional releases are Docks/Effect Kit only: `node scripts/release.mjs [--plugin <name>] patch|minor|major|<X.Y.Z>` (`--dry-run` previews). Session Relay positional bumps are invalid; begin its reviewed flow with `node scripts/release.mjs --prepare --plugin session-relay <reviewed-version> [--dry-run]`. That entry point continues through Relay's reviewed multi-stage protocol, not the generic bump/tag path.

## Generic Docks / Effect Kit release flow (double-layered gating)

```text
final implementation tree → node scripts/ci.mjs --plugin <name>   (LAYER 1 — local, selected plugin)
     → node scripts/release.mjs [--plugin <docks|effect-kit>] <bump>   (one plugin)
        ├── runs ci.mjs -q --plugin <name> as the selected-plugin preflight
        ├── bumps THIS plugin's plugin.json (+ codex mirror) + its marketplace entry
        ├── commits + pushes  (chore(release): <name> v<version>)
        ├── claude plugin tag --push          (creates <name>--v<version>)
        ├── waits for tag-CI on GitHub        (LAYER 2 — authoritative)
        ├── tag-CI passes → gh release create
        └── tag-CI fails  → exits non-zero, prints recovery
```

The positional flow above is preserved for docks/effect-kit, including its existing bump resolution, local and tag CI gates, commit/push/tag behavior, release notes, and read-only dry run. Session Relay dispatches before that legacy path into a closed grammar: source preparation/evidence binding, resumable prerelease publication, serialized promotion or recovery, and stable finalization. Unknown, duplicate, missing, orphaned receipt-digest, and cross-mode options fail before mutation.

GitHub pull requests run `node scripts/ci.mjs --lane core` and `node scripts/ci.mjs --lane relay`, then require the unchanged `validate` join status; their baseline/mutation partitions preserve the full contract without duplicate broad setup. `workflow_dispatch` runs one untargeted `node scripts/ci.mjs` full invocation. A release-tag push strictly resolves the tag's plugin identity, rejects malformed or unknown targets, and runs `node scripts/ci.mjs --plugin <name>` as the authoritative selected-plugin gate. Targeted CI skips the repo-wide workflow, standalone catalog, tree/durable-anchor, and CI-targeting sections; it runs only the selected plugin's owned author checks, shell-hook lint, and plugin gate, including that plugin's marketplace/version coherence. pnpm and conditional Cargo caches only reduce repeated download/build work. Their contents are never validation evidence: the frozen lockfile, pinned Rust toolchain, release preflight, and `ci.mjs` result remain authoritative.

<constraint>
Before `node scripts/release.mjs`, run the smallest authoritative gate for the final implementation tree: `node scripts/ci.mjs --plugin <name>` for one plugin and its descriptor-owned tooling, otherwise full `node scripts/ci.mjs`. The selected release path reruns the same plugin gate before mutation, and tag CI reruns it authoritatively after push.
</constraint>

Session Relay evidence is schema-1 closed RFC 8785 JCS. Every receipt input is an explicit adjacent path/SHA-256 pair; readers reject noncanonical bytes, unknown or missing fields, and digest/identity conflicts without ambient file search. Receipt writers use a new explicit path, mode `0600`, sibling exclusive creation, file and directory fsync, and an atomic no-clobber publish. Publication and promotion reconcile authoritative tag, run, Release, asset, transaction, lock, and branch identities before mutation; a retry or resume never substitutes or overwrites a conflicting identity.

## Versioning

Versions are **per-plugin and independent** — `docks` and `session-relay` bump separately, and the Claude marketplace catalog holds one entry per plugin (matched by `name`). Within a single plugin, both its `plugin.json`s (`.claude-plugin/`, `.codex-plugin/`) and its marketplace entry carry a `version` that must agree — `release.mjs` keeps that plugin's triple in lockstep, and `ci.mjs`'s per-plugin gate fails on disagreement; `claude plugin tag` validates it too. The Codex marketplace catalog has no plugin version field but is still validated for JSON shape. Without an explicit plugin `version`, every commit counts as a new "update" to consumers (noisy prompts), so always tag explicit semver bumps. Tag format: `<name>--v<X.Y.Z>` (e.g. `docks--v0.6.5`, `session-relay--v0.1.0`; double-dash separator from `claude plugin tag`).

### Bumping the public child (`docks-kit`) version

The child version is pinned in `scripts/lib/session-relay-release-promotion.mjs`,
`…-publication.mjs`, `public_child.{version,tag}` in the current
`session-relay-release-instances/<relay>.json`, and — in the large majority — across
the `plugins/session-relay/test/*contract*.mjs` files, which pin the literals, the
derived forms, the plan paths, the generated payload version, and the npm coordinate.
`…-preparation.mjs` needs **no** edit: it already reads
`INSTANCE.public_child.{version,tag}`. Bump as one gated transaction, never
incrementally — the contract tests fail on any partial state. Derive the current
inventory when you bump; do not transcribe a count here, because a stale inventory is
worse than none.

<constraint>
Bump by **constant name, never by value find-replace**. Two same-valued constants in
`companion-distribution-contract.mjs` must NOT move with the child: `PRODUCTION_VERSION`
is the *Session Relay* version (consumed as `session-relay--v${…}`, `relay.verified`,
`relay.plugin_version`), and `PUBLIC_VERSION` is the *legacy blocked-preflight* public
version — whose value is the number the child is moving toward, so it reads exactly
like the thing you came to change.
</constraint>

`release-instance-contract.mjs`'s identity census does **not** guard this, for two
independent reasons — widening either one alone is insufficient:

1. **File scope.** Its `MODULES` list names `scripts/lib/session-relay-release-*.mjs`
   only, with no entry under `plugins/`, so no contract-test file is ever scanned.
2. **Class scope.** Its `CLASSES` are `uuid`, `commit40`, `digest64`, and `planpath`.
   A bare version string such as `'0.12.0'` matches none of them, so version pins are
   out of scope in *every* file, including the ones it does scan.

Closing it means adding a version class whose expected value derives from
`loadReleaseInstance(VERSION).public_child`, extending the scan to the contract tests,
and allowlisting the two collisions above by constant name. Until then every
version-pin site must be swept by hand. Note the existing `CENSUS`/`PERMITTED_ESCAPED_PIN`
machinery is the pattern to reuse, including its rule: when a scan disagrees with the
frozen census, re-measure — never edit the census to match the scan.
