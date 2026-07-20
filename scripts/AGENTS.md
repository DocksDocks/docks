# Plugin-author tooling (scripts/)

These scripts validate and release the repo's plugins. They are **author-side only** — never shipped to consumers. All tooling is Node `.mjs` — including `release.mjs` (`--dry-run` supported) and the cross-tool `context-tree-nudge` PostToolUse hook. The only shell in the repo is session-relay's arch-dispatch launcher (`plugins/session-relay/bin/relay`, POSIX sh, shellcheck-linted). `ci.mjs` is the local gate, and `.github/workflows/ci.yml` invokes that same gate either in full or with its supported `--plugin` target.

<constraint>
Run focused checks for the changed area while implementing, then run `node scripts/ci.mjs` once on the final relevant implementation tree before commit, push, or release; it exits non-zero on any failure. Plan-only orchestration or lifecycle commits may reuse that green gate only while the relevant implementation bytes, and thus the validated implementation-tree identity, are unchanged. Any relevant source or implementation change invalidates reuse and requires a new full gate. Don't loosen validator floors to make a problematic file pass; fix the file.
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
| `rust` | Rust source/prebuilt capability, or `null`: `{ dir, binName, source: { manifest, lockfile, builtBinary, testBinaryEnv }, prebuilt: { targets, assetPrefix, checksumAsset } }` — `ci.mjs` formats, lints, builds, and exercises the source-selected host binary. Prebuilt target assets and `SHA256SUMS` are release artifacts produced by the pinned native workflow; they are never committed in a plugin payload. Helpers in `lib/rust-bin.mjs` |
| `extraJson` | extra JSON configs to validate (hooks/mcp/etc.) |
| `authorChecks` | ordered repository author suites owned by the plugin (`idempotency`, `scaffold`, `plan-reviewer` for Docks; `[]` otherwise) |
| `releaseContracts` | ordered production release-state/evidence contract tests owned by the plugin (`[]` when absent) |
| `transformGuard` | run `transform-guard.mjs` (curated transformers) |
| `install` | the consumer install snippet for the GitHub Release notes |
| `release` | Release artifact names, the non-install prerelease staging body, and the stable install command. Session Relay's state machine and workflow consume these identities without inventing alternate asset names or install text. |

`ci.mjs` is **registry-driven**. A full invocation runs repo-wide checks once (workflow YAML, both marketplace catalogs, tree/guard, durable-anchors, and the CI-targeting contract), then selects every present plugin's shell hooks, repository author suites, and capability-driven `gatePlugin` work. `--plugin <name>` skips those repo-wide sections and runs only the named plugin's owned author checks, target-derived shell lint, and `gatePlugin` validation; the plugin gate still reads the catalogs to enforce that plugin's marketplace/version coherence. Docks' long mutation regression task runs only when Docks is selected, starts before independent checks, and is joined exactly once before success. Flags: `-q` (quiet), `--list` (registry + presence), `--plugin <name>` (one target), `--timings-json <path>` (closed phase/task wall-time report). Versions remain per-plugin and independent.

The Docks plan-workflow author suite follows the live five-phase contract:
`plan-workspace` owns `docs/plans` bootstrap, migration, audit, and explicit
refresh; `plan-creator` owns creation of one missing canonical plan and
`PlanCreatedV1`; `plan-manager` owns existing-plan operations, review
orchestration, receipts, and lifecycle; `plan-reviewer` provides internal
read-only typed evidence over one sealed bundle; and `plan-repairer` provides
one bounded internal patch for the accepted blocking set. Only manager and
reviewer have dispatch wrappers. Schema 6 is the current review/orchestration
contract; schemas 1–5 remain validation-only historical
compatibility. The `plan-reviewer` author check runs the focused policy surface,
bounded repair/convergence cases, and the single background mutation-regression
driver from `scripts/tests/`, all against the helper bundled under
`plan-reviewer/scripts/`.

### Adding plugin N+1 (the whole checklist — no orchestrator edits)

1. **Payload** at `plugins/<name>/` — `.claude-plugin/plugin.json` (+ `.codex-plugin/plugin.json` when it ships to Codex) and its `skills/`/`agents/`/`hooks/` dirs.
2. **One descriptor** appended to `PLUGINS` in `lib/plugins.mjs` — declare only capabilities that exist (`agents`/`selftest`/`rust` take `null`, `extraJson`/`authorChecks`/`releaseContracts` use `[]` when absent); include the install snippet.
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
| `agents/guard.mjs` | agent frontmatter, "Use when…"/"Not…" CSO, model declared | pass/fail |
| `agents/score.mjs` | agent quality (max 15) | per-file ≥14; total = N×14 |
| `tree/guard.mjs` | context-tree node pairs (AGENTS.md + one-line CLAUDE.md, ≤500) | pass/fail |
| `config/read-floor.mjs` | reads per-file floors from `scoring.json` | — |
| `scaffold/guard-spec.mjs` · `scaffold/test.mjs` | scaffold spec coherence + a full seed starts green | pass/fail |
| `tests/skill-trigger-collision.mjs` | cross-skill trigger-overlap audit — fails on a ≥5-token unrouted pair (`--report` prints the matrix) | pass/fail |
| `tests/idempotency.mjs` | content-hash determinism + every stored hash in sync | pass/fail |
| shellcheck (target-selected) | `-S warning` over selected plugins' `hooks/*.sh` plus a Rust capability's sh launcher (`bin/<binName>`), via `shellHooks(p)`; a full invocation selects every plugin | pass/warn |

`--per-file` prints `<category>/<name> <score>`. Total floors are count-derived (`artifact_count × per-file_floor`) — adding/removing an artifact moves the floor automatically. Per-file floors are the true gate. Skill frontmatter parsing uses Node + the npm `yaml` package (`corepack enable && pnpm install --frozen-lockfile`).

**Shared author-side libs (`scripts/lib/`):** `rust-bin.mjs` (the `rust` capability's helpers — `rustHostTarget()` maps `process.platform/arch` to the launcher's target triple with Linux always on the static musl leg, `findCargo()` falls back to `~/.cargo/bin` for non-login shells, `verifySha256Sums()` checks a `shasum -a 256`-format file with Node crypto). `skills-walk.mjs` (SKILL.md traversal — `findSkillFiles`/`eachSkillDir`/`findSkillByName`) and `skills-parse.mjs` (frontmatter/body line helpers — `bodyAfterFrontmatter`/`slopCount`/`metaUpdated`/…) are imported by the author-side validators so the walk + body-line method live once. The bundled `write-skill/scripts/skill-guard.mjs` keeps its OWN copies on purpose — it ships standalone into consumer repos where `scripts/lib/` doesn't exist; its body-line method must stay byte-identical to `skills-parse.mjs`'s or scores shift. `skills-walk.mjs` is seeded (the seeded validators import it); `skills-parse.mjs` is not (no seeded script imports it).

`ci-background-task.mjs` owns asynchronous Node-task capture for `ci.mjs`.
Successful tasks remove their private spool. Failed tasks retain complete stdout
and stderr in an owned mode-`0700` temporary directory with mode-`0600` files,
and print both exact paths before the gate reports failure.

**Single-source scorer:** the 16-pt skill scorer lives ONCE, in the bundled `plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs` (`score [--per-file]`). The kit's `ci.mjs` scores with that same shipped file over `plugins/docks/skills`, and consumers run it on their own skills (`validate` / `score`) — one rubric, no author-side mirror, no sync contract. Bundled `scripts/` aren't content-hashed; bump write-skill's `metadata.updated` when the rubric changes.

`--timings-json` is observational: it records ordered phase durations and
background-task durations without changing gate selection or status. Background
tasks remain mandatory; their failure output is retained behind reported spool
paths and their result is joined before `ci.mjs` can pass.

## Edit → release workflow

1. Edit files inside the target plugin (`plugins/<name>/{skills,agents,…}/`).
2. Run focused checks while iterating (`--plugin <name>` skips repo-wide sections and selects only that plugin's owned work). Once the relevant implementation tree is final, run full `node scripts/ci.mjs` once before commit, push, or release. Plan-only orchestration or lifecycle commits may reuse that green result only while the validated implementation-tree identity is unchanged; any relevant source change invalidates it.
3. Local Claude Code test (no push): `claude --plugin-dir ./plugins/<name>` (then `/reload-plugins`).
4. PR to main → PR-CI gates the merge.
5. After merge, release **one plugin**. Docks/effect-kit retain `node scripts/release.mjs [--plugin <name>] patch|minor|major|<X.Y.Z>` (`--dry-run` previews). Session Relay positional bumps are invalid; begin its reviewed flow with `node scripts/release.mjs --prepare --plugin session-relay <reviewed-version> [--dry-run]`.

## Release flow (double-layered gating)

```text
final implementation tree → node scripts/ci.mjs      (LAYER 1 — local, ALL plugins)
     → node scripts/release.mjs [--plugin <name>] <bump>   (one plugin)
        ├── runs ci.mjs -q --plugin <name> as the selected-plugin preflight
        ├── bumps THIS plugin's plugin.json (+ codex mirror) + its marketplace entry
        ├── commits + pushes  (chore(release): <name> v<version>)
        ├── claude plugin tag --push          (creates <name>--v<version>)
        ├── waits for tag-CI on GitHub        (LAYER 2 — authoritative)
        ├── tag-CI passes → gh release create
        └── tag-CI fails  → exits non-zero, prints recovery
```

The positional flow above is preserved for docks/effect-kit, including its existing bump resolution, local and tag CI gates, commit/push/tag behavior, release notes, and read-only dry run. Session Relay dispatches before that legacy path into a closed grammar: source preparation/evidence binding, resumable prerelease publication, serialized promotion or recovery, and stable finalization. Unknown, duplicate, missing, orphaned receipt-digest, and cross-mode options fail before mutation.

GitHub pull requests and `workflow_dispatch` run `node scripts/ci.mjs` without a target. A release-tag push strictly resolves the tag's plugin identity, rejects malformed or unknown targets, and runs `node scripts/ci.mjs --plugin <name>` as the authoritative selected-plugin gate. Targeted CI skips the repo-wide workflow, standalone catalog, tree/durable-anchor, and CI-targeting sections; it runs only the selected plugin's owned author checks, shell-hook lint, and plugin gate, including that plugin's marketplace/version coherence. pnpm and conditional Cargo caches only reduce repeated download/build work. Their contents are never validation evidence: the frozen lockfile, pinned Rust toolchain, release preflight, and `ci.mjs` result remain authoritative.

<constraint>
Run the full `node scripts/ci.mjs` gate on the final relevant implementation tree before `node scripts/release.mjs` — iterating on focused failures is easier without the release script's clean-tree requirement. That local full gate must pass before any push that goes near a tag.
</constraint>

Session Relay evidence is schema-1 closed RFC 8785 JCS. Every receipt input is an explicit adjacent path/SHA-256 pair; readers reject noncanonical bytes, unknown or missing fields, and digest/identity conflicts without ambient file search. Receipt writers use a new explicit path, mode `0600`, sibling exclusive creation, file and directory fsync, and an atomic no-clobber publish. Publication and promotion reconcile authoritative tag, run, Release, asset, transaction, lock, and branch identities before mutation; a retry or resume never substitutes or overwrites a conflicting identity.

## Versioning

Versions are **per-plugin and independent** — `docks` and `session-relay` bump separately, and the Claude marketplace catalog holds one entry per plugin (matched by `name`). Within a single plugin, both its `plugin.json`s (`.claude-plugin/`, `.codex-plugin/`) and its marketplace entry carry a `version` that must agree — `release.mjs` keeps that plugin's triple in lockstep, and `ci.mjs`'s per-plugin gate fails on disagreement; `claude plugin tag` validates it too. The Codex marketplace catalog has no plugin version field but is still validated for JSON shape. Without an explicit plugin `version`, every commit counts as a new "update" to consumers (noisy prompts), so always tag explicit semver bumps. Tag format: `<name>--v<X.Y.Z>` (e.g. `docks--v0.6.5`, `session-relay--v0.1.0`; double-dash separator from `claude plugin tag`).
