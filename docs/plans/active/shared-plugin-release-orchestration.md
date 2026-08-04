---
title: Extract shared plugin release orchestration
goal: Move the ordinary multi-plugin release lane behind one closed function-first library, make plugin release policy descriptor-driven, and derive current Session Relay identities from synchronized manifests and release instances without weakening its reviewed prerelease protocol or historical receipts.
status: ongoing
created: "2026-08-04T14:30:00.000+00:00"
updated: "2026-08-04T17:23:32.197+00:00"
started_at: "2026-08-04T17:23:32.197+00:00"
finished_at: null
assignee: null
tags: [plans, release, multi-plugin, refactor]
affected_paths:
  - scripts/AGENTS.md
  - scripts/release.mjs
  - scripts/lib/plugin-release.mjs
  - scripts/lib/plugins.mjs
  - scripts/lib/session-relay-release-core.mjs
  - scripts/lib/session-relay-release-publication.mjs
  - scripts/lib/session-relay-release-promotion.mjs
  - scripts/tests/ci-plugin-targeting.mjs
  - plugins/session-relay/test/release-instance-contract.mjs
  - plugins/session-relay/test/release-publication-contract.mjs
  - plugins/session-relay/test/release-promotion-contract.mjs
  - plugins/session-relay/test/companion-distribution-contract.mjs
  - plugins/session-relay/test/distribution-contract.mjs
  - plugins/session-relay/test/release-evidence-contract.mjs
related_plans:
  - docs/plans/finished/2026-08-04-session-relay-0.16.0-release.md
---

# Extract shared plugin release orchestration

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"b6728c1fcf4f26099886d485b34892795106ae997106b82849b4ebab9bd2ce05","invocations":1,"result_sha256":"485951580d9c85616c8f0da06c9a5776b4b6252c3a8747e628108711e5ea27a9","state":"passed"},"execution_parent":"98ea3821689bdfb04c919023cccac9401ff61c63","goal_id":"35a855fb-19c4-484e-b019-22a0b49a65df","implementation_commit":null,"plan_path":"docs/plans/active/shared-plugin-release-orchestration.md","plan_sha256":"1423b5be1ae4c46d38bbfee52257f317d7f194b4fdf2c76bcd3670eac7fa5227","repository_id":"DocksDocks/docks","requested_effects":["local","push"],"risk":"external","run_id":"d030b398-2dc2-4e06-9219-8ded5eb7c77b","schema":1,"source_base":"f509e0111a133274e98aa2b5ca8e41b259ab3fc4","source_sha256":"abe60f05d336ce9fa9bd56a0e608ff2094d3b4b986441d5010ccd3b4a31c9a70"}

## Goal

Make `scripts/release.mjs` a small command-line composition root. Put the existing ordinary Docks, Effect Kit, and Plan Lifecycle release flow in `scripts/lib/plugin-release.mjs`, selected by one closed release policy in `scripts/lib/plugins.mjs`.

Remove live release-version duplication from Session Relay where synchronized manifests and its current release-instance record already carry the identity. Keep every retained historical version and receipt fixture explicit and byte-compatible.

## Current architecture

- `scripts/release.mjs` owns both command-line parsing and the complete ordinary release implementation.
- `scripts/lib/plugins.mjs` is already the multi-plugin registry, but ordinary `install` text is top-level while only Session Relay has a `release` object.
- `scripts/lib/session-relay-release-cli.mjs` dispatches the separate reviewed Session Relay state machine before the generic positional lane.
- `scripts/lib/session-relay-release-core.mjs` hardcodes the current Relay version even though both plugin manifests and the Claude marketplace must agree.
- Publication and promotion still duplicate the current public child version that the current release instance already owns.

## Release mechanism {mechanism}

### Closed plugin policy

Every descriptor carries exactly one discriminated release policy:

```js
release: { kind: 'generic', install: '...' }
release: {
  kind: 'reviewed-session-relay',
  assets: [...],
  prereleaseBody: '...',
  install: 'docks-kit sync',
}
```

Unknown kinds and missing fields fail before CI or mutation. Plugin descriptors cannot provide shell commands, arbitrary callbacks, optional safety gates, tag templates, or mutation ordering.

### Generic release Interface

`scripts/lib/plugin-release.mjs` exports a function-first Interface similar to:

```js
runGenericPluginRelease({ argv, repo, plugins, io })
```

The Interface accepts only parsed release intent, a registered descriptor, repository identity, and one exact IO Adapter. Shared code owns clean-tree checks, tool checks, semver resolution, manifest/catalog synchronization, selected CI, commit/push, canonical tag creation, tag-CI wait, notes, and stable GitHub Release creation.

The production Adapter uses `fs`, `git`, `claude`, and `gh`. Tests use an exact fake with the same closed operations. A dry run may read and run selected CI, but invokes no write, push, tag, workflow mutation, or release mutation operation.

### Reviewed Session Relay Adapter

Session Relay remains outside the generic Interface. Positional Relay syntax stays rejected. Its preparation, canonical receipts, child binding, asset set, prerelease reconciliation, promotion journal, locks, recovery, and stable finalization keep their closed schemas and ordering.

Current Relay version derives from the synchronized Claude manifest after exact agreement with the Codex manifest and Claude marketplace. Current public child version and tag derive from `loadReleaseInstance(VERSION).public_child`. The implementation never selects the numerically greatest instance file and never rewrites retained historical constants.

### Prerelease policy

Generic releases remain stable-only. `--dry-run` remains the no-mutation test path. A generic prerelease is not a boolean preview: it burns a tag and requires a separate stage/verify/promote protocol. This change leaves that protocol absent until a non-Relay plugin supplies the second concrete use case. Session Relay keeps its existing reviewed prerelease path.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---:|---|---|---|---|---|---|---|
| 1 | characterize_generic_lane | Add failing module-level contracts for three ordinary descriptors, closed policy, mutation ordering, and dry-run refusal. | `scripts/tests/ci-plugin-targeting.mjs` | — | `local` | `done` | Tests reproduce that orchestration is trapped in the CLI, then define identical Docks, Effect Kit, and Plan Lifecycle behavior through one Interface. |
| 2 | extract_generic_engine | Move ordinary release implementation behind the exact IO Adapter and leave the CLI as dispatch plus error reporting. | `scripts/release.mjs`; `scripts/lib/plugin-release.mjs` | 1 | `local` | `done` | All existing output, semver, manifest writes, CI selection, commit/tag/release order, and failures remain compatible; no mutation primitive remains in the CLI. |
| 3 | close_release_descriptors | Give every plugin one closed release-policy variant and update author guidance. | `scripts/lib/plugins.mjs`; `scripts/AGENTS.md`; `scripts/tests/ci-plugin-targeting.mjs` | 2 | `local` | `done` | Three generic descriptors run the shared engine; Relay selects only the reviewed dispatcher; unknown policy, callback, shell, missing install, and cross-lane inputs fail before mutation. |
| 4 | derive_current_relay_identity | Derive live Relay and public-child identities from synchronized current records, and verify the accepted child at its immutable release tag instead of assuming moving public main remains on that generation. | `scripts/lib/session-relay-release-core.mjs`; `scripts/lib/session-relay-release-publication.mjs`; `scripts/lib/session-relay-release-promotion.mjs`; `plugins/session-relay/test/distribution-contract.mjs`; `plugins/session-relay/test/release-evidence-contract.mjs`; `plugins/session-relay/test/release-instance-contract.mjs`; `plugins/session-relay/test/release-publication-contract.mjs`; `plugins/session-relay/test/release-promotion-contract.mjs`; `plugins/session-relay/test/companion-distribution-contract.mjs` | 3 | `local` | `done` | Current version comes from exact manifest/catalog agreement; current child comes from the selected instance; the companion contract reads the immutable accepted child tag; current and historical harnesses receive their identity through synchronized fixture manifests instead of source-text mutation; mismatches refuse; all historical 0.13-0.15 fixtures stay byte-identical. |
| 5 | prove_release_contracts | Run focused release, Relay, dry-run, and full shared-tooling gates. | all affected paths in frontmatter | 4 | `local` | `done` | A1-A5 pass. Reverting descriptor closure, dry-run mutation refusal, or live identity derivation makes its named test fail and restoration returns green. |
| 6 | checkpoint_and_archive | Bind the exact implementation, pass CompletionReviewV1, archive, and publish the terminal checkpoint. | all affected paths in frontmatter | 5 | `push` | `planned` | Reviewed implementation and archive reach exact `origin/main`; no release, tag, prerelease, or asset mutation occurs. |

## Acceptance

| ID | Command | Expected result |
|---|---|---|
| A1 | `node scripts/tests/ci-plugin-targeting.mjs --dry-run-release-safety` | Exit 0; Docks, Effect Kit, and Plan Lifecycle all select one generic Interface, run their targeted CI, and invoke no write, push, tag, or release mutation under dry-run. |
| A2 | `node plugins/session-relay/test/distribution-contract.mjs && node plugins/session-relay/test/release-evidence-contract.mjs && node plugins/session-relay/test/release-instance-contract.mjs && node plugins/session-relay/test/release-publication-contract.mjs && node plugins/session-relay/test/release-promotion-contract.mjs && node plugins/session-relay/test/companion-distribution-contract.mjs` | Exit 0; current identities derive from synchronized records, current and historical fixture harnesses bind exact manifest identity without source mutation, the accepted child verifies at its immutable release tag, and closed receipt, asset, child, and promotion contracts remain valid after public main advances. |
| A3 | `node scripts/release.mjs --dry-run --plugin docks patch && node scripts/release.mjs --dry-run --plugin effect-kit patch && node scripts/release.mjs --dry-run --plugin plan-lifecycle patch` | Exit 0; all three ordinary plugins preview through the shared library, derive their own manifest version, and leave repository bytes and refs unchanged. |
| A4 | `node scripts/release.mjs --dry-run --plugin session-relay patch` | Exit non-zero with the existing positional-release refusal before generic orchestration or mutation. |
| A5 | `node scripts/ci.mjs` | Exit 0; full shared-tooling, all plugin gates, release contracts, formatting, and lint pass. |

## Out of scope / do-NOT-touch

- Do not run a release, create or move a tag, edit a GitHub Release, upload assets, or publish a package.
- Do not add generic prerelease staging in this change.
- Do not change Session Relay receipt keys, canonical JCS, digest rules, transaction refs, locks, recovery, asset policy, or public-child protocol.
- Do not replace frozen historical version literals or retained instance files.
- Do not expose plugin-provided command argv, shell strings, callbacks, or optional safety gates.
- Do not add classes or an inheritance hierarchy; use pure functions and one exact IO Adapter.

## STOP conditions

1. The extraction changes generic release order, output contract, tag grammar, CI selection, or dry-run safety.
2. A plugin descriptor can bypass a shared precondition or inject executable behavior.
3. Relay positional syntax reaches the generic engine.
4. Any current or historical Relay receipt, asset, child, promotion, or recovery contract changes without explicit schema scope.
5. Full CI fails after focused checks pass.

## Open decisions

None. The approved approach is the narrow generic extraction. Generic prerelease staging remains deliberately absent.

## Review

N/A — manager-written after draft and completion review.


Plan-attempt-history: {"authorization_source_sha256":"5c1210455f6854c60c9e9e916c73e784f8df289ebd017a406f7d6a823054c20a","plan_bytes_sha256":"153646f07aaff7f26f42bc456940723640c1964c645a8f42f4233c3e2f3dbe63","replacement_run_id":"91be1391-90a4-481b-bb1d-8f47f730eace","run":{"acceptance":null,"blocker":{"evidence_sha256":"21264bd15d057d9a4ff1d842b5b2adfc1223c38a6af4b3ec419546fd3633ea4f","kind":"verification_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"65d8807916c24d0912523597b62a236827ba592c0acc70cba8985a0b1d2d8614","invocations":1,"result_sha256":"a8abb4c7f9fc6194ca18146a58e3243ed10665b725ac18e11bae69508a6db1ca","state":"passed"},"execution_parent":"98ea3821689bdfb04c919023cccac9401ff61c63","goal_id":"35a855fb-19c4-484e-b019-22a0b49a65df","implementation_commit":null,"plan_path":"docs/plans/active/shared-plugin-release-orchestration.md","plan_sha256":"3db508b66fae44ed5df2e9a786bbdec6670e1009a71de23de08dcdfd35c50d65","repository_id":"DocksDocks/docks","requested_effects":["local","push"],"risk":"external","run_id":"56f68445-c0b6-4229-848e-dfb40493af6d","schema":1,"source_base":"98ea3821689bdfb04c919023cccac9401ff61c63","source_sha256":"cf1c89cf0384ad3b4492ea3c43b1371c6dfbee36a46676c2c4aea8918905eb8d"},"schema":1,"status":"blocked","successor_run_sha256":"bda22b16adfd2ac96d911f3863084d2b74e2a3a54499d2560c372e6e4689efa3"}

Plan-attempt-history: {"authorization_source_sha256":"5c1210455f6854c60c9e9e916c73e784f8df289ebd017a406f7d6a823054c20a","plan_bytes_sha256":"01c391949ee542a41fa3b56049df9aadbdbc5a0ad6a7cbb15e468693d848e132","replacement_run_id":"133c8f0c-5986-4b0d-8d56-4416f04333c9","run":{"acceptance":{"source_sha256":"de4a6a55dc478ed0eeffb3f72c468938f27927d8217d5a5be2193a75af96d651","verification_sha256":"880372e71bfd76768168927943c40f4303a4bb0e8feece7c26b10c4bff73865b"},"blocker":{"evidence_sha256":"76388348e6c8ab964838f17fa582cebbb054f8083e45a478b81811951c549168","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":"9f0fdce9bdbfb84e442ecdba965265b3275df80db47f187b31e95a9144463028","invocations":1,"result_sha256":"76388348e6c8ab964838f17fa582cebbb054f8083e45a478b81811951c549168","state":"blocked"},"draft_review":{"accepted_classes":[],"input_sha256":"a2ba31b8bac01256885d81e1d5a9e9ecf9d25d719fa80bda7dff6df95f33333f","invocations":1,"result_sha256":"2108e04d757429b031227fa04ed865f80a5c48ca9518808cc9e160e3b5afae8f","state":"passed"},"execution_parent":"98ea3821689bdfb04c919023cccac9401ff61c63","goal_id":"35a855fb-19c4-484e-b019-22a0b49a65df","implementation_commit":"fd42ada4453ec6b21bcd0caa9bf6a825b99f44df","plan_path":"docs/plans/active/shared-plugin-release-orchestration.md","plan_sha256":"f54969979ca2a21072eb99cd92bbaf77ec5328288fd81d509f41d7f77ba5e434","repository_id":"DocksDocks/docks","requested_effects":["local","push"],"risk":"external","run_id":"91be1391-90a4-481b-bb1d-8f47f730eace","schema":1,"source_base":"438b07c424e88f3a98868df4c89b985c8f3a4664","source_sha256":"937be3ce0ac5bc850c8311b83e5626c9fc4c6eee35aca1ced9adc8829dca672c"},"schema":1,"status":"blocked","successor_run_sha256":"4d70cb7ecd5620fb3626a11764d87b47ef566cf46d670bed2a5d0830d194df31"}

Plan-attempt-history: {"authorization_source_sha256":"5c1210455f6854c60c9e9e916c73e784f8df289ebd017a406f7d6a823054c20a","plan_bytes_sha256":"527961a2b863bb7f93adf2e53b462343c627ef54daf1972d1d87c76fcd731dc3","replacement_run_id":"d030b398-2dc2-4e06-9219-8ded5eb7c77b","run":{"acceptance":null,"blocker":{"evidence_sha256":"15c0f5cbdd4df62ad78f4b8a87766ead78e37a1ffab1a7c9fea736d5f274bc86","kind":"verification_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"9005f80da4a1f4203935899018e518e49ab1e6e31b519db17480caf4ab21d6ed","invocations":1,"result_sha256":"c1b46fdd51a2b25849378ecb9ae5a1a680a73148a76f4e1e74c3b5830290eeb2","state":"passed"},"execution_parent":"98ea3821689bdfb04c919023cccac9401ff61c63","goal_id":"35a855fb-19c4-484e-b019-22a0b49a65df","implementation_commit":null,"plan_path":"docs/plans/active/shared-plugin-release-orchestration.md","plan_sha256":"f54969979ca2a21072eb99cd92bbaf77ec5328288fd81d509f41d7f77ba5e434","repository_id":"DocksDocks/docks","requested_effects":["local","push"],"risk":"external","run_id":"133c8f0c-5986-4b0d-8d56-4416f04333c9","schema":1,"source_base":"fd42ada4453ec6b21bcd0caa9bf6a825b99f44df","source_sha256":"de4a6a55dc478ed0eeffb3f72c468938f27927d8217d5a5be2193a75af96d651"},"schema":1,"status":"blocked","successor_run_sha256":"63168f6a9289cf822b529dc31938c3ff76136735da5dec1355e241a0e6fbc60f"}

## Verification Results

N/A — manager-written after execution.
