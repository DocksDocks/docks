---
title: Target CI and release gates by plugin
goal: Make explicit single-plugin CI, release preflight, and release-tag validation run shared repository guards plus only the selected plugin's owned work, while preserving full pull-request and manual validation.
status: planned
created: "2026-07-16T22:50:14-03:00"
updated: "2026-07-16T22:50:14-03:00"
assignee: codex
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: high
review_waivers: []
tags: [ci, release, plugins, performance]
affected_paths:
  - scripts/lib/plugins.mjs
  - scripts/lib/ci-targeting.mjs
  - scripts/ci.mjs
  - scripts/release.mjs
  - scripts/tests/ci-plugin-targeting.mjs
  - scripts/AGENTS.md
  - .github/workflows/ci.yml
  - .github/AGENTS.md
  - AGENTS.md
related_plans:
  - single-gpt-plan-review-default
review_status: null
planned_at_commit: c944a38f1dc09d28d624cbe3a978f93f56395308
execution_base_commit: null
---

# Target CI and release gates by plugin

## Goal

Make `node scripts/ci.mjs --plugin <name>` the authoritative fast path for a
single plugin: always run shared repository guards, then run only the selected
plugin's shell hooks, author suites, manifest/skill/agent checks, Rust
capability, and self-test. Forward the selected plugin through local release
preflight and release-tag CI. Keep pull-request and manual workflow runs full.

## Context and rationale

`ci.mjs` already resolves a registry plugin for `--plugin`, but that selection
currently narrows only `gatePlugin`. Shell lint still scans every plugin, and
Docks-only skill-maintainer, scaffold, and plan-review suites run for Session
Relay and Effect Kit. `release.mjs --plugin` then discards its selection when it
spawns `ci.mjs`, and tag CI always provisions the Session Relay Rust toolchain
and invokes the full three-plugin gate.

This caused the Docks release tag to fail on an unrelated Session Relay binary
reproducibility check. Targeting must not weaken shared invariants: workflow YAML,
both marketplace catalogs, context-tree pairs, and durable anchors remain on
every invocation. The full default remains the merge/manual integration gate.
A release tag is safe to target only after strict canonical parsing maps it to a
known registry descriptor and fails closed before toolchain provisioning.

## Environment and commands

Repository: `/home/vagrant/projects/docks`

```bash
node scripts/tests/ci-plugin-targeting.mjs
node scripts/ci.mjs --plugin docks
node scripts/ci.mjs --plugin effect-kit
node scripts/release.mjs --dry-run --plugin docks patch
node scripts/ci.mjs
```

## Steps

| # | Task | Files | Depends | Status | Done condition |
|---|---|---|---|---|---|
| 1 | Freeze the plugin-targeting behavior matrix before production edits. | `scripts/tests/ci-plugin-targeting.mjs` (tag parser, author-check selection, shell selection, release args, malformed input cases) | — | pending | The test fails because strict tag resolution and reusable target-selection helpers do not exist. |
| 2 | Add registry-driven target and tag resolution. | `scripts/lib/plugins.mjs` (`PLUGINS` author-check capability); `scripts/lib/ci-targeting.mjs` (`resolveCiTargets`, `parseReleaseTag`, `releaseCiArgs`) | 1 | pending | Known canonical tags map to one descriptor; malformed/unknown tags throw; selected author/shell/Rust capabilities derive only from the registry. |
| 3 | Apply selection to local CI and release preflight. | `scripts/ci.mjs` (shared phase, selected shell hooks, selected Docks author suites, per-plugin gate); `scripts/release.mjs` (preflight argv); `scripts/tests/ci-plugin-targeting.mjs` (release/selection assertions) | 2 | pending | `--plugin docks` omits Session Relay/Effect Kit work; `--plugin effect-kit` omits Docks author suites and Session Relay Rust; release preflight forwards `--plugin <name>` as separate argv. |
| 4 | Target release-tag workflow work and update the gate contract. | `.github/workflows/ci.yml` (strict resolver step, conditional Rust, full PR/manual step, targeted tag step); `.github/AGENTS.md` (`Trigger model`, no-drift contract); `scripts/AGENTS.md` (layered gate/release flow); `AGENTS.md` (`Commands`, tool-agnostic CI rule); `scripts/tests/ci-plugin-targeting.mjs` (workflow event matrix) | 2, 3 | pending | PR/manual use full CI; a known tag uses one plugin; Docks/Effect tags skip Rust; Session Relay tags retain Rust; malformed/unknown tags stop before provisioning. |
| 5 | Run focused, targeted, and integration verification. | `scripts/tests/ci-plugin-targeting.mjs`; `scripts/ci.mjs`; `scripts/release.mjs`; `.github/workflows/ci.yml` | 3, 4 | pending | A1-A5 pass, then the separate full project CI completion gate passes once. |

## Interfaces and invariants

- `--plugin` accepts exactly one known `PLUGINS` registry name; unknown or missing
  values fail nonzero.
- Shared checks always run: workflow YAML, Claude/Codex marketplace JSON,
  context-tree guard, and durable-anchor guard.
- Plugin-owned checks are selected: shell hooks; Docks-only idempotency,
  scaffold, and plan-review suites; `gatePlugin` capabilities and self-tests.
- Canonical release tags are exactly `<known-plugin>--v<major>.<minor>.<patch>`
  with SemVer numeric components and no leading zeroes except zero itself.
- Tag parsing is data-only and shell-injection-resistant. The validated plugin
  name is passed as a separate argument, never interpolated into a command.
- Pull-request and `workflow_dispatch` runs remain full. Tag pushes run shared
  checks plus the resolved plugin only.
- Session Relay Rust provisioning occurs only for a full workflow or a resolved
  plugin descriptor with a Rust capability.
- `build-binaries.yml` remains Session Relay-only and unchanged.

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/ci-plugin-targeting.mjs` | Exits 0; all registry tag/target/release/workflow cases pass and malformed or unknown tags fail closed. |
| A2 | `node scripts/ci.mjs --plugin docks` | Exits 0; shared and Docks-owned checks run; output contains no Session Relay Rust/self-test or Effect Kit plugin gate. |
| A3 | `node scripts/ci.mjs --plugin effect-kit` | Exits 0; shared and Effect Kit checks run; output contains no Docks-only author suites or Session Relay Rust/self-test. |
| A4 | `node scripts/release.mjs --dry-run --plugin docks patch` | Exits 0 from a clean checkout; output identifies a Docks-targeted preflight and makes no write, tag, push, or release. |
| A5 | `node scripts/ci.mjs --plugin unknown-plugin` | Exits 2 before plugin work and names the known registry plugins. |

## Project CI completion gate

After A1-A5 pass, run `node scripts/ci.mjs` once as the separate full repository
completion gate. Pull requests and manual workflow dispatches must execute that
same unfiltered command.

## Out of scope

- Do not weaken, remove, or make optional any selected plugin validator.
- Do not skip shared catalogs or repository guards in targeted mode.
- Do not change Session Relay artifact production or committed binary policy.
- Do not add plugin selection to `build-binaries.yml`; it already has one owner.
- Do not add package-manager convenience wrappers unless they remove measured
  work beyond the authoritative `ci.mjs` path.
- Do not move or delete the failed immutable `docks--v0.12.8` tag.

## Failure modes and STOP conditions

- STOP if a malformed/unknown tag can reach provisioning or `ci.mjs`.
- STOP if targeted mode can omit a shared repository invariant.
- STOP if full PR/manual validation no longer gates all present plugins.
- STOP if a Docks tag can run Session Relay Rust or a Session Relay tag can skip it.
- STOP if release preflight can target a plugin other than the release descriptor.

## Cold-handoff checklist

- Exact files, symbols, commands, and event behavior are listed.
- Shared versus plugin-owned checks are explicitly partitioned.
- Strict tag identity and Rust provisioning rules fail closed.
- Focused and targeted commands precede one separate full integration gate.
- No generated binary or release tag mutation is in scope.

## Self-review

Score: 97/100. The design reuses the existing plugin registry and `--plugin`
contract rather than adding a second selector. It targets the measured expensive
work—Docks mutation suites and Session Relay Rust—while preserving shared guards
and full merge/manual integration. The only new module contains pure selection
and tag-parsing behavior so tests do not assert incidental source text.

## Review

(filled by plan-review on completion)

## Sources

- `scripts/ci.mjs:19-47` — existing registry-backed `--plugin` selection.
- `scripts/ci.mjs:53-110` — shared checks, all-plugin shell aggregation, and
  unconditional Docks-only author suites before `gatePlugin`.
- `scripts/ci.mjs:112-211` — capability-driven plugin, Rust, and self-test gates.
- `scripts/lib/plugins.mjs:1-24,29-79,105-117` — registry contract, plugin
  capabilities, and plugin-local shell-hook discovery.
- `scripts/release.mjs:1-13,29-70` — one-plugin release identity followed by an
  unfiltered local CI preflight.
- `.github/workflows/ci.yml:21-48` — one job currently provisions Session Relay
  Rust and runs full CI for PR, tag, and manual events.
- `.github/workflows/build-binaries.yml` — already dedicated to Session Relay
  artifact production; no additional targeting is warranted.

## Notes

The user explicitly requested this optimization after observing repeated full
CI during Docks-only work, then asked for an audit of other non-targeted work.
Two independent read-only scouts agreed on release preflight, shell lint, and
Rust provisioning. Main context additionally classified skill-maintainer,
scaffold, and plan-review suites as Docks-owned because their paths and fixtures
are Docks-specific; the full unfiltered gate still runs them through the Docks
descriptor.
