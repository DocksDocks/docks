# Plugin-author tooling (scripts/)

These scripts validate and release the repo's plugins. They are **author-side only** — never shipped to consumers. All tooling is Node `.mjs` — including `release.mjs` (`--dry-run` supported) and the cross-tool `context-tree-nudge` PostToolUse hook; the repository ships no shell scripts of its own. `ci.mjs` is the local gate, and `.github/workflows/ci.yml` invokes that same gate in full or with its supported `--lane` or `--plugin` target; `ci-target.mjs` resolves both targets — a release tag to one plugin, and a pull-request diff to the shard set the matrix runs.

<constraint>
Gate choice (focused checks while implementing, `node scripts/ci.mjs --plugin <name>` for a change owned by one plugin, full `node scripts/ci.mjs` otherwise, reuse of a green gate) is repo-wide policy in the root `AGENTS.md` (Tool-agnostic rules). Don't loosen validator floors to make a problematic file pass; fix the file.
</constraint>

## Multi-plugin model (`scripts/lib/plugins.mjs`)

The repo hosts **multiple plugins** under `plugins/` (verify: `node scripts/ci.mjs --list`). `scripts/lib/plugins.mjs` is the **single source of truth**: a `PLUGINS` array of descriptors, each declaring paths + capabilities. **Adding a plugin = adding one descriptor** — no edits to `ci.mjs`/`release.mjs`.

The `Fields:` header comment in `scripts/lib/plugins.mjs` defines every descriptor field (verify: `sed -n '/^\/\/ Fields:/,/^import/p' scripts/lib/plugins.mjs`). Update that comment in the same change that adds or changes a field.

`lib/plugin-release.mjs` owns ordinary release ordering behind `runGenericPluginRelease({ argv, repo, plugins, io })`. Its IO value is an exact closed adapter: the `IO_KEYS` list in `lib/plugin-release.mjs` names every filesystem, Git, Claude, GitHub, selected-CI, and logging operation (verify: `grep -n -A20 'const IO_KEYS' scripts/lib/plugin-release.mjs`). `release.mjs` composes the production operations. Descriptors remain inert policy data. The `wouldStageChange` operation answers whether `git add` of release bytes would stage anything different from HEAD. Production hashes the proposed bytes with `git hash-object --path <file> --stdin`. It compares that hash with `git rev-parse --quiet --verify HEAD:<path>`. `--path` applies the same clean filters that `git add` applies. The probe never passes `-w`, so it never writes an object. The `tagPublished` operation answers whether a release tag is already published: it checks the local ref, then asks origin, and refuses to guess when origin is unreachable. It is an adapter operation because reaching origin is IO. A caller that cannot stub it puts the network inside every test of the surrounding decision. The engine validates every policy before touching IO. It enforces dry-run no-mutation itself rather than trusting an adapter.

`ci.mjs` is **registry-driven**. A full invocation runs repo-wide checks once (workflow YAML, both marketplace catalogs, tree/guard, durable anchors, author tooling, unit tests, and CI targeting), then selects every present plugin's shell hooks, repository author suites, and capability-driven `gatePlugin` work. `--plugin <name>` skips repo-wide sections and runs only the named plugin's owned author checks, target-derived shell lint, and plugin validation. When plan author checks apply, CI runs only the `scripts/tests/plan-cli.mjs` helper smoke. Trigger-collision checks audit Docks once.

## Pull-request topology and plan checks

Lane ownership, the shard set, and fail-open resolution are CI-workflow facts
owned by `.github/AGENTS.md` (PR topology). The changed-path → shard mapping is
`root` + `ciLane` in `scripts/lib/plugins.mjs`.

The root `AGENTS.md` (Plans) decides when a change needs a canonical plan.

The live plan author suite runs the helper smoke in `scripts/tests/plan-cli.mjs`
against the shipped
`plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs`.
The canonical issue-body contract lives in
`plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md`.

`docs/PLAN-QUEUE.md` is a human note; `docs/AGENTS.md` owns its rules.

### Adding plugin N+1 (the whole checklist — no orchestrator edits)

1. **Payload** at `plugins/<name>/` — `plugins/<name>/.claude-plugin/plugin.json` (+ `plugins/<name>/.codex-plugin/plugin.json` when it ships to Codex) and its `skills/`/`agents/`/`hooks/` dirs.
2. **One descriptor** appended to `PLUGINS` in `lib/plugins.mjs` — assign required `ciLane` ownership (`core`; a diff under `root` then selects that shard), declare only capabilities that exist (`agents`/`selftest` take `null`, `extraJson`/`authorChecks`/`releaseContracts` use `[]` when absent), and declare the exact data-only `release` policy.
3. **Two catalog entries**: `.claude-plugin/marketplace.json` (name/source/version — version in lockstep with both manifests) and `.agents/plugins/marketplace.json` (local-source + policy block) for Codex.
4. **Optional context node** (a single `plugins/<name>/AGENTS.md`) when the plugin carries conventions of its own — `tree/guard` enforces the node contract; the durable-anchors guard scans it.
5. Verify: `node scripts/ci.mjs --list` shows the plugin and full `node scripts/ci.mjs` is green. Every plugin uses the generic positional release command.

Plugin behavior stays registry-driven: extend descriptor capabilities rather than adding orchestrator branches.

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
| `agents/guard.mjs` | agent frontmatter, "Use when…"/"Not…" CSO, **no `model` key** (reason: root `AGENTS.md` (Authoring agents)) | pass/fail |
| `agents/score.mjs` | agent quality (rubric maximum defined in the script) | per-file floor from `scoring.json` (verify: `node scripts/config/read-floor.mjs agents`); total = N × per-file floor |
| `tree/guard.mjs` | context-tree nodes (AGENTS.md ≤500; no legacy CLAUDE.md; the root AGENTS.md routing table names every nested node and every row resolves; every backticked repo pointer — a `/` path whose first segment is a tracked top-level dir — resolves from the node's folder or the repo root) | pass/fail |
| `plans/no-bespoke-gates.mjs` | shipped code carries no bespoke per-plan verification gate (an exported findings-accumulator that can pass vacuously) | pass/fail |
| `config/read-floor.mjs` | reads per-file floors from `scoring.json` | — |
| `tests/skill-trigger-collision.mjs` | cross-skill trigger-overlap audit — fails on a ≥5-token unrouted pair (`--report` prints the matrix) | pass/fail |
| `tests/idempotency.mjs` | content-hash determinism + every stored hash in sync | pass/fail |
| `tests/plan-cli.mjs` | smoke-tests the shipped plan helper (`plan.mjs`) | pass/fail |
| `tests/ci-observability.mjs` | validates command timing records, wall-time reconstruction, and CI host metadata | pass/fail |
| `tests/test-contracts.mjs` | validates the closed test-contract registry and its discovered, registered, selected, and executed sets | pass/fail |
| `tests/author-tooling.mjs` | author-tool contracts: Biome rejects a syntax defect, combined skill validation, tree/guard operational failures, skills-guard spawn failure; this table lists every `scripts/**/*.mjs` outside `lib/`, `tests/unit/`, and the non-validator entry points `release.mjs`/`ci-target.mjs`/`capture-tdd-red.mjs`, and every first-column `.mjs` path resolves from `scripts/` or the repo root | pass/fail |
| `tests/ci-plugin-targeting.mjs` | CI targeting and release contracts: shard selection, `ci.yml` trigger block, release module and dry-run safety (`--unit` in the gate) | pass/fail |
| shellcheck (target-selected) | `-S warning` over selected plugins' `hooks/*.sh`, via `shellHooks(p)`; a full invocation selects every plugin | pass/warn |

`tests/author-tooling.mjs` compares this table with the scripts on disk: a validator script without a row fails, and a row whose script is missing fails. A `lib/` module may have a row but does not need one.

`--per-file` prints `<category>/<name> <score>`. Total floors are count-derived (`artifact_count × per-file_floor`) — adding/removing an artifact moves the floor automatically. Per-file floors are the true gate. Skill frontmatter parsing uses Node + the npm `yaml` package installed by `bun install --frozen-lockfile`.

The `test:coverage` package command measures test coverage on demand. `scripts/ci.mjs` deliberately does not run it because coverage is a diagnostic, not a gate.

**Shared author-side libs (`scripts/lib/`):** `skills-walk.mjs` (SKILL.md traversal — `findSkillFiles`/`eachSkillDir`/`eachSkillCandidateDir`/`findSkillByName`) and `skills-parse.mjs` (frontmatter/body line helpers — `splitLines`/`bodyAfterFrontmatter`/`countLines`/`anyLine`/`slopCount`) are imported by the author-side validators so the walk + body-line method live once. The bundled `write-skill/scripts/skill-guard.mjs` keeps its OWN copies on purpose — it ships standalone into consumer repos.

`ci-background-task.mjs` owns asynchronous Node-task capture for `ci.mjs`. It
launches each background child through a separate short-lived Node process. That
launcher measures its own child with one monotonic clock and owns both log
files, so neither this gate's blocked event loop nor pipe backpressure can
inflate a duration; each recorded duration is the real spawn-to-exit lifetime. A
worker thread was measured and rejected for this job: its loop stalled for the
whole blocking window on a minority of runs. Successful tasks remove their
private spool. Failed tasks retain complete stdout and stderr in an owned
mode-`0700` temporary directory with mode-`0600` files, and print both exact
paths before the gate reports failure.

**Single-source scorer:** the skill scorer lives ONCE, in the bundled `plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs` (`score [--per-file]`; the script defines the rubric maximum). The kit's `ci.mjs` scores with that same shipped file over `plugins/docks/skills`, and consumers run it on their own skills (`validate` / `score`) — one rubric, no author-side mirror, no sync contract. Bundled `scripts/` aren't content-hashed; bump write-skill's `metadata.updated` when the rubric changes.

`--timings-json` is observational. It changes no gate selection and no pass/fail
status. The report includes `commands`, with one closed `CommandRecordV1` per
orchestrated child command. Each record carries stable identity, argv, phase,
monotonic start and end offsets, exit state, overlap, a retained-output
reference, and optional cache facts. The `reconstruction` member contains
`wall_ms`, `command_busy_ms`, `command_total_ms`, `overlap_ms`,
`unaccounted_ms`, and `peak_concurrency`. The `host` member contains the GitHub
run, attempt, job, workflow, and runner identity, or `null` off CI. A child that
has not exited is never reported as passed.

### Closed test-contract registry

`scripts/config/test-contracts.json` is the registry data, and
`scripts/tests/test-contracts.mjs` is its validator. The registry assigns one
suite owner per normative contract. The validator computes discovered,
registered, selected, and executed sets. It rejects unknown, duplicate, expired,
ignored, or zero-selected entries. It never chooses tests or authorises
deletions. Run the focused validators through the `test:observability` and
`test:contracts` package scripts. Both validators run inside the gate's
repo-wide guards section.

When one suite has multiple gate-selected cases, its selector joins the sorted case values with `|`, and
`expected_min` records the number of distinct invocations.

### Host-derived resource envelope

`scripts/lib/host-resources.mjs` sizes the gate to the host that actually runs it.
The gate prints a one-line envelope so a throttled or slow run explains itself.

It separates capacity — what the machine or cgroup allows — from availability —
what is free right now. Capacity resolves cgroup v2 or v1 limits before falling
back to host limits; `os.totalmem()` and `os.availableParallelism()` are cgroup-blind
and would otherwise give a CI container a host-sized envelope. Runtime availability
is sampled from PSI stall counters rather than load average. Competing-process
detection is human-facing diagnostics only and changes no gate behavior.

The envelope reports rather than fixes a RAM-backed-temp hazard. When temp is
RAM-backed and the host has no swap, it emits
`WARNING <tmpdir> is <fstype> with no swap (temp competes for RAM)`.
Swap is the real remedy, because it makes tmpfs pages reclaimable instead of
pinning them in RAM until their files are deleted.

For example, an 8 GB, 6-core swapless host with tmpfs `/tmp` prints
`5/6 cpu free, 7.8G ram, swap 0.0G, WARNING /tmp is tmpfs with no swap (temp competes for RAM)`.

## Edit → release workflow

1. Edit files inside the target plugin (`plugins/<name>/{skills,agents,…}/`).
2. Run focused checks while iterating. Once the relevant implementation tree is final, run the smallest authoritative gate the root `AGENTS.md` (Tool-agnostic rules) names.
3. Local Claude Code test (no push): `claude --plugin-dir ./plugins/<name>` (then `/reload-plugins`).
4. PR to main → PR-CI gates the merge.
5. After merge, release **one plugin** with the generic positional command: `node scripts/release.mjs [--plugin <name>] patch|minor|major|<X.Y.Z>` (`--dry-run` previews).

## Generic ordinary-plugin release flow (double-layered gating)

```text
final implementation tree → node scripts/ci.mjs --plugin <name>   (LAYER 1 — local, selected plugin)
     → node scripts/release.mjs [--plugin <name>] <bump>   (one plugin)
        ├── runs ci.mjs -q --plugin <name> as the selected-plugin preflight
        ├── bumps THIS plugin's plugin.json (+ codex mirror) + its marketplace entry
        ├── commits + pushes  (chore(release): <name> v<version>)
        ├── claude plugin tag --push          (creates <name>--v<version>)
        ├── waits for tag-CI on GitHub        (LAYER 2 — authoritative)
        ├── tag-CI passes → gh release create
        └── tag-CI fails  → exits non-zero, prints recovery
```

The release tag, not the manifest number, is the fact that a version was released. When manifests are already at this version, a re-cut stages nothing. The release tags existing HEAD instead of creating a commit. A dry run consults the clean-tree gate. On a dirty tree, it reports the refusal instead of forecasting a landing it cannot predict.

Every plugin uses this positional flow: bump resolution, local and tag CI gates, commit/push/tag, release notes, and a read-only dry run.

Pull-request sharding, manual dispatch, and tag-push CI behavior live in `.github/AGENTS.md`. PR sharding never touches the release path: tag CI runs the repo lane, then `node scripts/ci.mjs --plugin <name>` as the authoritative selected-plugin gate (`.github/AGENTS.md` (Trigger model)), and targeted `--plugin` runs skip the repo-wide sections.

<constraint>
Before `node scripts/release.mjs`, run the smallest authoritative gate for the final implementation tree: `node scripts/ci.mjs --plugin <name>` for one plugin and its descriptor-owned tooling, otherwise full `node scripts/ci.mjs`. The selected release path reruns the same plugin gate before mutation, and tag CI reruns it authoritatively after push.
</constraint>

## Versioning

Versions are **per-plugin and independent** — each plugin bumps separately, and the Claude marketplace catalog holds one entry per plugin (matched by `name`). Within a single plugin, both its `plugin.json`s (`.claude-plugin/`, `.codex-plugin/`) and its marketplace entry carry a `version` that must agree — `release.mjs` keeps that plugin's triple in lockstep, and `ci.mjs`'s per-plugin gate fails on disagreement; `claude plugin tag` validates it too (verify: bump one manifest's version alone → `node scripts/ci.mjs --plugin <name>` must fail on the disagreement; revert). The Codex marketplace catalog has no plugin version field but is still validated for JSON shape. Without an explicit plugin `version`, every commit counts as a new "update" to consumers (noisy prompts), so always tag explicit semver bumps. Tag format: `<name>--v<X.Y.Z>`, with the double-dash separator from `claude plugin tag`.

Pointers here name concepts, not coordinates — if a path or symbol moved, trust the stated purpose and re-locate it (grep the symbol) before acting.
