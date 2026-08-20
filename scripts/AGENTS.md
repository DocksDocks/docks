# Plugin-author tooling (scripts/)

These scripts validate and release the repo's plugins. They are **author-side only** — never shipped to consumers. All tooling is Node `.mjs` — including `release.mjs` (`--dry-run` supported) and the cross-tool `context-tree-nudge` PostToolUse hook; the repository ships no shell scripts of its own. `ci.mjs` is the local gate, and `.github/workflows/ci.yml` invokes that same gate in full or with its supported `--lane` or `--plugin` target; `ci-target.mjs` resolves both targets — a release tag to one plugin, and a pull-request diff to the shard set the matrix runs.

<constraint>
Run focused checks while implementing. For a final change owned by exactly one plugin, `node scripts/ci.mjs --plugin <name>` is the authoritative pre-commit, pre-push, and pre-release gate, including descriptor-owned author, source, and release contracts. Run full `node scripts/ci.mjs` only for repo-wide validation/tooling, shared multi-plugin infrastructure, registry or CI-topology changes, changes spanning plugins, or an explicit full-gate request. Reuse a green gate only while its validated implementation bytes are unchanged. Don't loosen validator floors to make a problematic file pass; fix the file.
</constraint>

## Multi-plugin model (`scripts/lib/plugins.mjs`)

The repo hosts **multiple plugins** (`docks`, `plan-lifecycle`, `effect-kit`) under `plugins/`. `scripts/lib/plugins.mjs` is the **single source of truth**: a `PLUGINS` array of descriptors, each declaring paths + capabilities. **Adding a plugin = adding one descriptor** — no edits to `ci.mjs`/`release.mjs`.

| Descriptor field | Meaning |
|---|---|
| `name` | marketplace + tag identity (`claude plugin tag` → `<name>--v<ver>`) |
| `root` | plugin dir under the repo (`plugins/<name>`) |
| `skills` | skills root, or `null` (skills-only checks self-skip when absent) |
| `agents` | agents root, or `null` (agents guard+score run only when set) |
| `codex` | `true` when a `.codex-plugin/` mirror + Codex marketplace entry ship |
| `selftest` | path to a runnable self-test, or `null` |
| `ciLane` | required pull-request shard ownership: `core` for every plugin. With `root`, this is the changed-path → shard mapping the PR matrix resolves against; `repo` is the always-on repo-wide shard and no plugin may claim it |
| `extraJson` | extra JSON configs to validate (hooks/mcp/etc.) |
| `authorChecks` | ordered repository author suites owned by the plugin (`idempotency`; `plan-reviewer`, which selects `plan-cli.mjs` and two `plan-skill-phases.mjs` cases, for Docks; `[]` otherwise) |
| `releaseContracts` | ordered production release-state/evidence contract tests owned by the plugin (`[]` when absent) |
| `sourceChecks` | ordered source/process/smoke invocations owned by the plugin; each `{ path, args }` (`[]` when absent) |
| `transformGuard` | run `transform-guard.mjs` (curated transformers) |
| `release` | Closed, data-only release policy. Every plugin declares exactly `{ kind: 'generic', install }`. No callbacks, commands, safety gates, or ordering belong in descriptors. |

`lib/plugin-release.mjs` owns ordinary release ordering behind `runGenericPluginRelease({ argv, repo, plugins, io })`. Its IO value is an exact closed adapter of filesystem, Git, Claude, GitHub, selected-CI, and logging operations; production composes those operations in `release.mjs`, while descriptors remain inert policy data. The engine validates every policy before touching IO and enforces dry-run no-mutation itself rather than trusting an adapter.

`ci.mjs` is **registry-driven**. A full invocation runs repo-wide checks once (workflow YAML, both marketplace catalogs, tree/guard, durable anchors, author tooling, unit tests, and CI targeting), then selects every present plugin's shell hooks, repository author suites, and capability-driven `gatePlugin` work. `--plugin <name>` skips repo-wide sections and runs only the named plugin's owned author checks, target-derived shell lint, and plugin validation. When Docks plan author checks apply, CI runs `scripts/tests/plan-cli.mjs` plus `scripts/tests/plan-skill-phases.mjs` with the `bounded-workflows` and `plan-workspace-template` cases. Trigger-collision checks audit Docks and Effect Kit together once.

## Pull-request topology

The closed `core` pull-request lane selects plugins, not regression partitions.
It owns the focused Docks plan CLI and plan skill phase contracts, the Docks,
effect-kit, and plan-lifecycle plugin gates, their joint trigger-collision
audit, and JavaScript quality. The always-on `repo` shard owns the repo-wide checks.

The lane performs the frozen Bun install and materializes the pinned
`claude-code` binary. Its result feeds the single authoritative
`validate (scripts/ci.mjs)` join; manual dispatch remains one untargeted full
gate, and a release tag remains one strictly resolved `--plugin <name>` gate.
There is no regression partition, jobs-cap plumbing, mutation shard, or
artifact handoff.

Clear, low-risk work describable as one concrete diff with one bounded
acceptance path goes straight to implementation. Canonical plans are reserved
for multi-commit work, scheduling, cold handoff, unresolved approaches,
cross-subsystem or public-contract changes, destructive or security-sensitive
work, external effects, or an explicit plan request.

The live plan author suite exercises the GitHub-issue-backed v2 lifecycle.
`scripts/tests/plan-cli.mjs` tests the shipped
`plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs`.
`scripts/tests/plan-skill-phases.mjs` runs the `bounded-workflows` and
`plan-workspace-template` cases; the latter compares `docs/PLAN.md` with
`plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plan-md-template.md`.

The optional plan queue keeps issue numbers in `docs/PLAN-QUEUE.md`. It is an
input to `plan.mjs next`, not a separate validator. The queue is only a discovery
and prioritization view and grants no lifecycle or execution authority. These
contracts run inside the existing plan orchestration section, so the timing
phase census is unchanged.

### Adding plugin N+1 (the whole checklist — no orchestrator edits)

1. **Payload** at `plugins/<name>/` — `.claude-plugin/plugin.json` (+ `.codex-plugin/plugin.json` when it ships to Codex) and its `skills/`/`agents/`/`hooks/` dirs.
2. **One descriptor** appended to `PLUGINS` in `lib/plugins.mjs` — assign required `ciLane` ownership (`core`; a diff under `root` then selects that shard), declare only capabilities that exist (`agents`/`selftest` take `null`, `extraJson`/`authorChecks`/`releaseContracts` use `[]` when absent), and declare the exact data-only `release` policy.
3. **Two catalog entries**: `.claude-plugin/marketplace.json` (name/source/version — version in lockstep with both manifests) and `.agents/plugins/marketplace.json` (local-source + policy block) for Codex.
4. **Optional context node** (`plugins/<name>/AGENTS.md` + one-line `CLAUDE.md`) when the plugin carries conventions of its own — `tree/guard` enforces the pair; the durable-anchors guard scans it.
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
| `agents/guard.mjs` | agent frontmatter, "Use when…"/"Not…" CSO, **no `model` key** (any literal — `inherit` included — reaches omp as a model ID and kills the spawn; Claude defaults to `inherit` anyway) | pass/fail |
| `agents/score.mjs` | agent quality (max 15, reachable in any harness) | per-file ≥14 with one genuine point of slack; total = N×14 |
| `tree/guard.mjs` | context-tree node pairs (AGENTS.md + one-line CLAUDE.md, ≤500) | pass/fail |
| `config/read-floor.mjs` | reads per-file floors from `scoring.json` | — |
| `tests/skill-trigger-collision.mjs` | cross-skill trigger-overlap audit — fails on a ≥5-token unrouted pair (`--report` prints the matrix) | pass/fail |
| `tests/idempotency.mjs` | content-hash determinism + every stored hash in sync | pass/fail |
| `tests/plan-cli.mjs` | validates the shipped v2 plan CLI, including checks, transitions, steps, archive, and retirement | pass/fail |
| `tests/plan-skill-phases.mjs` | validates the `bounded-workflows` and `plan-workspace-template` plan skill contracts | pass/fail |
| `tests/ci-observability.mjs` | validates command timing records, wall-time reconstruction, and CI host metadata | pass/fail |
| `tests/test-contracts.mjs` | validates the closed test-contract registry and its discovered, registered, selected, and executed sets | pass/fail |
| shellcheck (target-selected) | `-S warning` over selected plugins' `hooks/*.sh`, via `shellHooks(p)`; a full invocation selects every plugin | pass/warn |

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

**Single-source scorer:** the 16-pt skill scorer lives ONCE, in the bundled `plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs` (`score [--per-file]`). The kit's `ci.mjs` scores with that same shipped file over `plugins/docks/skills`, and consumers run it on their own skills (`validate` / `score`) — one rubric, no author-side mirror, no sync contract. Bundled `scripts/` aren't content-hashed; bump write-skill's `metadata.updated` when the rubric changes.

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
`test:contracts` package scripts. Both validators run inside the gate's existing
repo-wide guards section, so the phase census is unchanged.

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
2. Run focused checks while iterating. Once the relevant implementation tree is final, use `node scripts/ci.mjs --plugin <name>` when exactly one plugin and its descriptor-owned tooling changed; use full `node scripts/ci.mjs` only for repo-wide, shared multi-plugin, registry/CI-topology, or multi-plugin changes. Plan-only lifecycle commits may reuse a green result while the validated implementation bytes remain unchanged.
3. Local Claude Code test (no push): `claude --plugin-dir ./plugins/<name>` (then `/reload-plugins`).
4. PR to main → PR-CI gates the merge.
5. After merge, release **one plugin** with the generic positional command: `node scripts/release.mjs [--plugin <name>] patch|minor|major|<X.Y.Z>` (`--dry-run` previews).

## Generic ordinary-plugin release flow (double-layered gating)

```text
final implementation tree → node scripts/ci.mjs --plugin <name>   (LAYER 1 — local, selected plugin)
     → node scripts/release.mjs [--plugin <docks|effect-kit|plan-lifecycle>] <bump>   (one plugin)
        ├── runs ci.mjs -q --plugin <name> as the selected-plugin preflight
        ├── bumps THIS plugin's plugin.json (+ codex mirror) + its marketplace entry
        ├── commits + pushes  (chore(release): <name> v<version>)
        ├── claude plugin tag --push          (creates <name>--v<version>)
        ├── waits for tag-CI on GitHub        (LAYER 2 — authoritative)
        ├── tag-CI passes → gh release create
        └── tag-CI fails  → exits non-zero, prints recovery
```

The positional flow above is preserved for docks/effect-kit/plan-lifecycle, including its existing bump resolution, local and tag CI gates, commit/push/tag behavior, release notes, and read-only dry run.

GitHub pull requests resolve their diff into a shard set and run `node scripts/ci.mjs --lane <shard>` for each, then require the unchanged `validate` join status. `resolve-shards` maps changed paths onto plugin roots from `lib/plugins.mjs` and emits the matrix; the `repo` shard always runs, `core` runs when the diff implicates a plugin it owns, and every resolution failure — unresolvable base, empty diff, non-pull-request event, or a path outside every plugin root — falls open to both shards. `workflow_dispatch` runs one untargeted `node scripts/ci.mjs` full invocation. A release-tag push strictly resolves the tag's plugin identity, rejects malformed or unknown targets, and runs `node scripts/ci.mjs --plugin <name>` as the authoritative selected-plugin gate; PR sharding never touches that path. The `repo` shard owns the repo-wide workflow, standalone catalog, tree/durable-anchor, and CI-targeting sections, so a plugin shard runs only the selected plugins' owned author checks, shell-hook lint, and plugin gates, including marketplace/version coherence. Targeted `--plugin` CI skips the repo-wide sections entirely. The Bun dependency cache only reduces repeated download work. Its contents are never validation evidence: the frozen lockfile, release preflight, and `ci.mjs` result remain authoritative.

<constraint>
Before `node scripts/release.mjs`, run the smallest authoritative gate for the final implementation tree: `node scripts/ci.mjs --plugin <name>` for one plugin and its descriptor-owned tooling, otherwise full `node scripts/ci.mjs`. The selected release path reruns the same plugin gate before mutation, and tag CI reruns it authoritatively after push.
</constraint>

## Versioning

Versions are **per-plugin and independent** — `docks` and `effect-kit` bump separately, and the Claude marketplace catalog holds one entry per plugin (matched by `name`). Within a single plugin, both its `plugin.json`s (`.claude-plugin/`, `.codex-plugin/`) and its marketplace entry carry a `version` that must agree — `release.mjs` keeps that plugin's triple in lockstep, and `ci.mjs`'s per-plugin gate fails on disagreement; `claude plugin tag` validates it too. The Codex marketplace catalog has no plugin version field but is still validated for JSON shape. Without an explicit plugin `version`, every commit counts as a new "update" to consumers (noisy prompts), so always tag explicit semver bumps. Tag format: `<name>--v<X.Y.Z>`, with the double-dash separator from `claude plugin tag`.
