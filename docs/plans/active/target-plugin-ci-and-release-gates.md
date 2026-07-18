---
title: Target CI and release gates by plugin
goal: Make CI measurable, parallel where safe, and plugin-targeted for local and release-tag gates while preserving full pull-request and manual validation.
status: in_review
created: "2026-07-16T22:50:14-03:00"
updated: "2026-07-18T13:16:25-03:00"
started_at: "2026-07-16T23:38:16-03:00"
in_review_since: "2026-07-17T00:15:14-03:00"
assignee: codex
review_author_company: openai
review_author_tool: codex
review_author_model: gpt-5.6-sol
review_author_effort: high
review_waivers: [{"actor":"user","at":"2026-07-16T23:38:16-03:00","input_sha256":"c9d69c854e3be7719f46f2625ce032512a329e809bebd84e68b29975962915a1","legs":["X","S"],"phase":"draft","reason":"User explicitly approved the measured CI-first recommendation and autonomous execution."}]
tags: [ci, release, plugins, performance]
affected_paths:
  - scripts/lib/plugins.mjs
  - scripts/lib/ci-targeting.mjs
  - scripts/lib/ci-background-task.mjs
  - scripts/ci-target.mjs
  - scripts/ci.mjs
  - scripts/release.mjs
  - scripts/tests/ci-plugin-targeting.mjs
  - scripts/tests/plan-review-policy.mjs
  - scripts/tests/plan-review-policy-regressions.mjs
  - scripts/AGENTS.md
  - .github/workflows/ci.yml
  - .github/AGENTS.md
  - AGENTS.md
related_plans:
  - single-gpt-plan-review-default
review_status: null
planned_at_commit: 5ba8e810112b1be3570e06fd0b94715630c990b7
execution_base_commit: 6909ef89cb95f08c344fcfd5686dc3df8d5ffec0
---

# Target CI and release gates by plugin

## Goal

Make `node scripts/ci.mjs --plugin <name>` the authoritative fast path for a
single plugin: always run shared repository guards, then run only the selected
plugin's shell hooks, author suites, manifest/skill/agent checks, Rust
capability, and self-test. Emit machine-readable phase timings, overlap the
expensive Docks mutation suite with independent gates, cache pnpm and Cargo
inputs in GitHub Actions, and forward the selected plugin through local release
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
node scripts/ci.mjs --plugin docks --timings-json /tmp/docks-ci-timings.json
node scripts/ci.mjs --plugin effect-kit
node scripts/release.mjs --dry-run --plugin docks patch
node scripts/ci.mjs
```

## Steps

| # | Task | Files | Depends | Status | Done condition |
|---|---|---|---|---|---|
| 1 | Freeze targeting, timing, and workflow behavior before production edits. | `scripts/tests/ci-plugin-targeting.mjs` (tag parser, author-check selection, shell selection, release args, timing schema, malformed input, event/cache cases) | — | done | The test failed before helpers existed, then passed in both direct and nonrecursive `--unit` modes. |
| 2 | Add registry-driven target and tag resolution. | `scripts/lib/plugins.mjs` (`PLUGINS` author-check capability); `scripts/lib/ci-targeting.mjs` (`resolveCiTargets`, `parseReleaseTag`, `releaseCiArgs`); `scripts/ci-target.mjs` (GitHub-safe resolver CLI) | 1 | done | Known canonical tags map to one descriptor; malformed/unknown tags throw; selected author/shell/Rust capabilities derive only from the registry. |
| 3 | Apply selection, phase timing, and background overlap to local CI and release preflight. | `scripts/lib/ci-background-task.mjs` (complete mode-`0600` failure spools); `scripts/ci.mjs` (shared phase, selected shell hooks, selected Docks author suites, bounded timing JSON, background mutation driver); `scripts/release.mjs` (preflight argv); `scripts/tests/ci-plugin-targeting.mjs`, `scripts/tests/plan-review-policy.mjs`, `scripts/tests/plan-review-policy-regressions.mjs` (timing/release/selection, failure-output, and scheduling assertions) | 2 | done | Targeted invocations omit unrelated plugin work; release forwards `--plugin` as separate argv; timing JSON records closed phase/task results; the mandatory mutation task starts early and joins once; a failing task retains complete stdout/stderr behind reported artifact paths. |
| 4 | Target release-tag work, cache dependencies, and update the gate contract. | `.github/workflows/ci.yml` (strict resolver, conditional Rust, pnpm/Cargo caches, full PR/manual, targeted tag); `.github/AGENTS.md`, `scripts/AGENTS.md`, `AGENTS.md` (no-drift contract); `scripts/tests/ci-plugin-targeting.mjs` (workflow event/cache matrix) | 2, 3 | done | PR/manual use full CI; known tags use one plugin; non-Rust tags skip Rust; malformed tags stop before caches/provisioning; exact and restore cache keys bind their correctness inputs. |
| 5 | Run focused, targeted, measured, and integration verification. | `scripts/tests/ci-plugin-targeting.mjs`; `scripts/ci.mjs`; `scripts/release.mjs`; `.github/workflows/ci.yml` | 3, 4 | done | A1-A8 and the separate full project CI completion gate pass; measured output proves unrelated plugin phases are absent from targeted runs. |

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
- `--timings-json <path>` writes one closed schema with total status, ordered
  phase durations, and background-task durations. Timing is observational only:
  it cannot alter pass/fail behavior or hide child output on failure.
  Failed background output is written without truncation to an owned mode-`0700`
  temporary directory containing mode-`0600` stdout/stderr files; the failure
  diagnostic prints both exact paths.
- The Docks mutation regression driver may start before independent guards and
  is joined before the Docks gate passes. Its exit status remains mandatory.
- GitHub caches are dependency caches, not correctness inputs. pnpm keys bind
  `pnpm-lock.yaml`; Cargo keys bind runner OS/architecture, `Cargo.lock`, and the
  Rust toolchain. A miss falls back to the ordinary install/build path.

## Acceptance criteria

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/ci-plugin-targeting.mjs` | Exits 0; registry tag/target/release/timing/workflow/cache cases pass and malformed or unknown inputs fail closed. |
| A2 | `node scripts/ci.mjs --plugin docks --timings-json /tmp/docks-ci-timings.json` | Exits 0; shared and Docks-owned checks run; timing JSON validates; output contains no Session Relay Rust/self-test or Effect Kit plugin gate. |
| A3 | `node scripts/ci.mjs --plugin effect-kit` | Exits 0; shared and Effect Kit checks run; output contains no Docks-only author suites or Session Relay Rust/self-test. |
| A4 | `node scripts/tests/ci-plugin-targeting.mjs --dry-run-release-safety` | Exits 0 from a clean checkout after running the Docks release dry-run through instrumented Git, Claude, and GitHub CLI shims; tracked/untracked state, refs, and all three version-bearing catalog/manifest bytes are unchanged, and the call log contains zero push, tag, or Release invocations. |
| A5 | `node scripts/ci.mjs --plugin unknown-plugin` | Exits 2 before plugin work and names the known registry plugins. |
| A6 | `node scripts/tests/ci-plugin-targeting.mjs --validate-docks-timings /tmp/docks-ci-timings.json` | Exits 0; every phase/task has a nonnegative integer duration and valid status, and exactly one passed `plan-review-policy regressions` task proves the mutation driver joined once before success. |
| A7 | `node scripts/tests/ci-plugin-targeting.mjs --unit` | Exits 0; PR/manual remain full, release tags resolve strictly, pnpm cache is shared, and Cargo cache/provisioning is Session Relay-only. |
| A8 | `node scripts/tests/ci-plugin-targeting.mjs --background-output` | Exits 0; a child emits an identifying prefix, writes more than 1 MiB, fails, and retains the complete prefix/output in reported mode-`0600` artifact files. |

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
- STOP if timing or background execution can convert a failed child into success.
- STOP if cache restoration is required for correctness or cache keys do not bind
  the relevant dependency lockfile.

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
and full merge/manual integration. Timing is bounded observational data, and
parallelism changes only scheduling: the same mandatory child status is joined
before success. The new pure targeting module and resolver CLI keep tests off
incidental implementation text.

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

The user approved the measured-CI-first sequence and autonomous execution on
2026-07-16. Dependency caching and safe overlap are included because targeting
alone does not reduce Docks' dominant mutation-suite wall time.

The successful measured Docks target recorded `status:"passed"`, nine ordered
phases, exactly one passed mutation task, and 181600 ms total/task duration.
The Effect Kit target and release dry-run completed in under two seconds and
omitted every Docks author suite and unrelated plugin gate. The plan-review
surface and mutation fixtures are now explicit affected paths because safe
background scheduling necessarily changed their frozen CI composition anchors.

The final full local gate passed all three plugins with `CI` cleared to preserve
the documented local warning for cross-image Session Relay binary variance. It
recorded 177673 ms total versus the previously observed 234–236 seconds: the
57-second Relay phase overlapped the mandatory mutation task instead of extending
the critical path. An inherited nonempty `CI` run also exercised the expected
local byte-identity failure before the clean local rerun passed.

Completion review round 1 accepted blockers P1-P3. P1 showed that the background
driver retained only the last 1 MiB and could hide an earlier failure prefix.
P2 showed that A6 named no executable timing validator. P3 showed that A4 relied
on dry-run prose without comparing repository state or refs. The repair is
limited to those three accepted blockers and their direct regression coverage.
Focused background-output, targeting, policy-surface, mutation, Docks timing,
Effect Kit, unknown-plugin, and full repository gates passed on the repaired
candidate before its commit.
Completion repair review round 2 cleared P1 and P2 but reproduced a remaining
P3 gap: local state comparison could not detect remote mutation calls. The
substantive candidate now uses instrumented Git, Claude, and GitHub CLI shims
that proxy required read-only preflight operations, fail closed on mutating
calls, and assert the call log contains no push, tag, or Release invocation.
