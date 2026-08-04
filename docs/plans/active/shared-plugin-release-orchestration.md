---
title: Extract and close shared plugin release orchestration
goal: Move the ordinary multi-plugin release lane behind one closed function-first library, make policy selection and command parsing fail closed, preserve fixture-only simulation before production dispatch, derive current Session Relay identities from synchronized records, and reconcile the immutable accidental Docks 0.16.1 publication without another release effect.
status: ongoing
created: "2026-08-04T14:30:00.000+00:00"
updated: "2026-08-04T20:01:27.054+00:00"
started_at: "2026-08-04T20:01:27.054+00:00"
finished_at: null
assignee: null
tags: [plans, release, multi-plugin, refactor]
affected_paths:
  - .claude-plugin/marketplace.json
  - plugins/docks/.claude-plugin/plugin.json
  - plugins/docks/.codex-plugin/plugin.json
  - scripts/AGENTS.md
  - scripts/release.mjs
  - scripts/lib/plugin-release.mjs
  - scripts/lib/plugins.mjs
  - scripts/lib/session-relay-release-core.mjs
  - scripts/lib/session-relay-release-fixture.mjs
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

# Extract and close shared plugin release orchestration

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":["v1_evidence_mismatch"],"input_sha256":"3941297da62dfd48710a7911861287a0d2f46591c1bb6f4182b87150c91b05ca","invocations":2,"result_sha256":"4f98b3b2b964e9e7ad34ac46ae48fd708718fa6779c0cc5814673977ab7820b4","state":"passed"},"execution_parent":"583afd626ef1f7bb81711daf1bbd61ff87b225d8","goal_id":"35a855fb-19c4-484e-b019-22a0b49a65df","implementation_commit":null,"plan_path":"docs/plans/active/shared-plugin-release-orchestration.md","plan_sha256":"14c8704180b241bca4f2f47332c7bb204b4e4daf3f25e9927fb62bd268f8d299","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push"],"risk":"external","run_id":"25ecfa3f-e424-49a9-9c47-59feb98fa60d","schema":1,"source_base":"74a76682c54757245466e0d07514954dfcd2d8d9","source_sha256":"59fbd28ffe5989ace38ac6eb46251e9d9ab26a1a53375155299e3ba383f2df3d"}

## Goal

Make `scripts/release.mjs` a small command-line composition root. Put the existing ordinary Docks, Effect Kit, and Plan Lifecycle release flow in `scripts/lib/plugin-release.mjs`, selected by one closed release policy in `scripts/lib/plugins.mjs`.

Close command parsing and fixture dispatch before any production IO. Remove live Session Relay identity duplication where synchronized manifests and its current release-instance record already carry the identity. Keep every retained historical version and receipt fixture explicit and byte-compatible.

Record the already-published Docks 0.16.1 release as an immutable unexpected effect. Keep its three synchronized manifest bytes and remote tag intact. This successor must not create, move, delete, or edit another release artifact.

## Current architecture

- `scripts/release.mjs` owns both command-line parsing and the complete ordinary release implementation.
- `scripts/lib/plugins.mjs` is already the multi-plugin registry, but ordinary `install` text is top-level while only Session Relay has a `release` object.
- `scripts/lib/session-relay-release-cli.mjs` dispatches the separate reviewed Session Relay state machine before the generic positional lane.
- `scripts/lib/session-relay-release-core.mjs` hardcodes the current Relay version even though both plugin manifests and the Claude marketplace must agree.
- Publication and promotion still duplicate the current public child version that the current release instance already owns.
- Correction verification at source checkpoint `d0f8dfd` exposed a composition-root regression: release fixture environment variables no longer intercepted generic plugins before production dispatch. The Docks patch fixture reached real release IO, pushed manifest commit `cb00d16101cb3f8d4e0adb471c21ca11b9647f57`, and published stable tag `docks--v0.16.1` before the harness failed because no fixture report existed.
- Read-only remote probes confirm `origin/main` is `cb00d16101cb3f8d4e0adb471c21ca11b9647f57`; tag `docks--v0.16.1` exists; and its stable GitHub Release was published at `2026-08-04T18:44:52Z`. The tag is burned. This plan preserves that public state and prevents any repeat.
- The correction still hard-codes only Docks and Effect Kit as `legacy-release` fixtures. Plan Lifecycle is the third registry-validated generic plugin, so its composition-root fixture path falls through to a grammar conflict and is not covered.

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

The Interface accepts only closed release intent, a registered descriptor, repository identity, and one exact IO Adapter. Shared code owns clean-tree checks, tool checks, semver resolution, manifest/catalog synchronization, selected CI, commit/push, canonical tag creation, tag-CI wait, notes, and stable GitHub Release creation.

Generic options parse in one closed pass. Duplicate `--plugin`, missing or option-shaped plugin values, unknown options, duplicate dry-run flags, and excess positional values refuse before IO. The production Adapter uses `fs`, `git`, `claude`, and `gh`. Tests use an exact fake with the same closed operations. A dry run may read and run selected CI, but invokes no write, push, tag, workflow mutation, or release mutation operation.

### Reviewed Session Relay Adapter

Session Relay remains outside the generic Interface. Positional Relay syntax stays rejected. Its preparation, canonical receipts, child binding, asset set, prerelease reconciliation, promotion journal, locks, recovery, and stable finalization keep their closed schemas and ordering.

The composition root checks the paired Session Relay fixture environment variables before release-policy dispatch. Fixture simulation routes through the reviewed fixture engine and returns before generic or reviewed production adapters. The fixture engine derives generic eligibility from the same closed, validated plugin registry; it carries no hard-coded ordinary-plugin list. Production dispatch remains descriptor-selected.

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
| 5 | prove_release_contracts | Run focused release, Relay, dry-run, and full shared-tooling gates. | all affected paths in frontmatter | 4 | `local` | `done` | A1-A5 passed before completion review. Reverting descriptor closure, dry-run mutation refusal, or live identity derivation makes its named test fail and restoration returns green. |
| 6 | close_parser_fixture_boundaries | Add failing contracts for duplicate plugin-option smuggling and generic fixture isolation, then close both boundaries before production IO. | `scripts/release.mjs`; `scripts/lib/plugin-release.mjs`; `scripts/tests/ci-plugin-targeting.mjs`; `plugins/session-relay/test/distribution-contract.mjs` | 5 | `local` | `done` | The duplicate `--plugin` case refuses before any adapter. Generic fixture scenarios emit canonical reports through the fixture dispatcher and invoke no production mutation operation. |
| 7 | bind_unexpected_release | Probe and bind the immutable Docks 0.16.1 remote commit, tag, release state, and three synchronized manifest paths without mutating them. | `.claude-plugin/marketplace.json`; `plugins/docks/.claude-plugin/plugin.json`; `plugins/docks/.codex-plugin/plugin.json` | 6 | `probe` | `done` | A matching live `ExternalAuthorityV1` authorizes the exact repository, ref, and release targets. A6 asserts version 0.16.1 and exact SHA-256 digests `6da30165eaf1536f18942955e6197816eadd49979fadfe1a9c3b2a3470bfdb42`, `e26c1e6b603e0c643bb9ed1d144c28ae8cd1509077edcedd0bf3fa976d0ec64a`, and `651ee5db0d24ec4bbb796ca9a311ffa579f570badb0bc55a9a0a918e3ecf83db`; it also reports the exact remote commit, tag, and stable release timestamp. No remote write occurs. |
| 8 | generalize_generic_fixture_registry | Add a failing Plan Lifecycle composition-root fixture case, then classify every validated non-Relay descriptor through the closed registry. | `scripts/lib/session-relay-release-fixture.mjs`; `plugins/session-relay/test/distribution-contract.mjs` | 7 | `local` | `planned` | Docks, Effect Kit, and Plan Lifecycle each emit a successful `legacy-release` fixture report. Unknown, malformed, and reviewed descriptors still fail closed; no hard-coded ordinary-plugin list remains. |
| 9 | checkpoint_and_archive | Bind the exact implementation checkpoint created after Step 8 and the required A1, A2, and A5 reruns, pass CompletionReviewV1, archive, and publish the terminal checkpoint. | all affected paths in frontmatter | 8 | `push` | `planned` | Reviewed implementation and archive reach exact `origin/main`; no additional release, tag, prerelease, asset, or package mutation occurs. |

## Acceptance

| ID | Command | Expected result |
|---|---|---|
| A1 | `node scripts/tests/ci-plugin-targeting.mjs --dry-run-release-safety` | Exit 0; all three generic plugins select one Interface, duplicate or malformed options refuse before IO, fixture-only dispatch invokes no production adapter, and dry-run invokes no mutation. |
| A2 | `node plugins/session-relay/test/distribution-contract.mjs && node plugins/session-relay/test/release-evidence-contract.mjs && node plugins/session-relay/test/release-instance-contract.mjs && node plugins/session-relay/test/release-publication-contract.mjs && node plugins/session-relay/test/release-promotion-contract.mjs && node plugins/session-relay/test/companion-distribution-contract.mjs` | Exit 0; Docks, Effect Kit, and Plan Lifecycle generic fixtures plus all Relay fixtures route through the composition root without production IO; current identities derive from synchronized records; accepted-child and historical receipt, asset, promotion, and recovery contracts remain valid. |
| A3 | `node scripts/release.mjs --dry-run --plugin docks patch && node scripts/release.mjs --dry-run --plugin effect-kit patch && node scripts/release.mjs --dry-run --plugin plan-lifecycle patch` | Exit 0; all three ordinary plugins preview through the shared library, derive their own manifest version, and leave repository bytes and refs unchanged. |
| A4 | `node scripts/release.mjs --dry-run --plugin session-relay patch` | Exit non-zero with the existing positional-release refusal before generic orchestration or mutation. |
| A5 | `node scripts/ci.mjs` | Exit 0; full shared tooling, all plugin gates, release contracts, formatting, and lint pass. |
| A6 | `node -e "const c=require('crypto'),f=require('fs');const e={'.claude-plugin/marketplace.json':'6da30165eaf1536f18942955e6197816eadd49979fadfe1a9c3b2a3470bfdb42','plugins/docks/.claude-plugin/plugin.json':'e26c1e6b603e0c643bb9ed1d144c28ae8cd1509077edcedd0bf3fa976d0ec64a','plugins/docks/.codex-plugin/plugin.json':'651ee5db0d24ec4bbb796ca9a311ffa579f570badb0bc55a9a0a918e3ecf83db'};for(const[p,d]of Object.entries(e)){const b=f.readFileSync(p);if(c.createHash('sha256').update(b).digest('hex')!==d)throw Error(p+' digest');const j=JSON.parse(b),v=j.version??j.plugins.find(x=>x.name==='docks').version;if(v!=='0.16.1')throw Error(p+' version')}}" && git ls-remote origin refs/heads/main refs/tags/docks--v0.16.1 && gh release view docks--v0.16.1 --repo DocksDocks/docks --json tagName,isDraft,isPrerelease,publishedAt,url` | Local assertions pass for version 0.16.1 and all three sealed manifest digests; read-only probes report main commit `cb00d16101cb3f8d4e0adb471c21ca11b9647f57`, existing tag `docks--v0.16.1`, and one stable non-draft release published at `2026-08-04T18:44:52Z`; no remote state changes. |

## Out of scope / do-NOT-touch

- Do not create, move, delete, or edit another release, tag, prerelease, asset, or package. Preserve the already-published Docks 0.16.1 commit, tag, and stable Release.
- Do not add generic prerelease staging in this change.
- Do not change Session Relay receipt keys, canonical JCS, digest rules, transaction refs, locks, recovery, asset policy, or public-child protocol.
- Do not replace frozen historical version literals or retained instance files.
- Do not expose plugin-provided command argv, shell strings, callbacks, or optional safety gates.
- Do not add classes or an inheritance hierarchy; use pure functions and one exact IO Adapter.
- Do not hard-code an allowlist of ordinary plugin names in the release fixture engine. Derive it from the closed registry.

## STOP conditions

1. The extraction changes generic release order, output contract, tag grammar, CI selection, or dry-run safety.
2. A plugin descriptor can bypass a shared precondition or inject executable behavior.
3. Relay positional syntax reaches the generic engine.
4. Any current or historical Relay receipt, asset, child, promotion, or recovery contract changes without explicit schema scope.
5. Any fixture environment reaches a production adapter, generic parsing can hide an option, or a validated generic plugin lacks fixture coverage.
6. Any additional remote release mutation occurs.
7. Full CI fails after focused checks pass.

## Open decisions

None. The approved approach is the narrow generic extraction. Generic prerelease staging remains deliberately absent.

## Review

N/A — manager-written after draft and completion review.


Plan-attempt-history: {"authorization_source_sha256":"5c1210455f6854c60c9e9e916c73e784f8df289ebd017a406f7d6a823054c20a","plan_bytes_sha256":"153646f07aaff7f26f42bc456940723640c1964c645a8f42f4233c3e2f3dbe63","replacement_run_id":"91be1391-90a4-481b-bb1d-8f47f730eace","run":{"acceptance":null,"blocker":{"evidence_sha256":"21264bd15d057d9a4ff1d842b5b2adfc1223c38a6af4b3ec419546fd3633ea4f","kind":"verification_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"65d8807916c24d0912523597b62a236827ba592c0acc70cba8985a0b1d2d8614","invocations":1,"result_sha256":"a8abb4c7f9fc6194ca18146a58e3243ed10665b725ac18e11bae69508a6db1ca","state":"passed"},"execution_parent":"98ea3821689bdfb04c919023cccac9401ff61c63","goal_id":"35a855fb-19c4-484e-b019-22a0b49a65df","implementation_commit":null,"plan_path":"docs/plans/active/shared-plugin-release-orchestration.md","plan_sha256":"3db508b66fae44ed5df2e9a786bbdec6670e1009a71de23de08dcdfd35c50d65","repository_id":"DocksDocks/docks","requested_effects":["local","push"],"risk":"external","run_id":"56f68445-c0b6-4229-848e-dfb40493af6d","schema":1,"source_base":"98ea3821689bdfb04c919023cccac9401ff61c63","source_sha256":"cf1c89cf0384ad3b4492ea3c43b1371c6dfbee36a46676c2c4aea8918905eb8d"},"schema":1,"status":"blocked","successor_run_sha256":"bda22b16adfd2ac96d911f3863084d2b74e2a3a54499d2560c372e6e4689efa3"}

Plan-attempt-history: {"authorization_source_sha256":"5c1210455f6854c60c9e9e916c73e784f8df289ebd017a406f7d6a823054c20a","plan_bytes_sha256":"01c391949ee542a41fa3b56049df9aadbdbc5a0ad6a7cbb15e468693d848e132","replacement_run_id":"133c8f0c-5986-4b0d-8d56-4416f04333c9","run":{"acceptance":{"source_sha256":"de4a6a55dc478ed0eeffb3f72c468938f27927d8217d5a5be2193a75af96d651","verification_sha256":"880372e71bfd76768168927943c40f4303a4bb0e8feece7c26b10c4bff73865b"},"blocker":{"evidence_sha256":"76388348e6c8ab964838f17fa582cebbb054f8083e45a478b81811951c549168","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":"9f0fdce9bdbfb84e442ecdba965265b3275df80db47f187b31e95a9144463028","invocations":1,"result_sha256":"76388348e6c8ab964838f17fa582cebbb054f8083e45a478b81811951c549168","state":"blocked"},"draft_review":{"accepted_classes":[],"input_sha256":"a2ba31b8bac01256885d81e1d5a9e9ecf9d25d719fa80bda7dff6df95f33333f","invocations":1,"result_sha256":"2108e04d757429b031227fa04ed865f80a5c48ca9518808cc9e160e3b5afae8f","state":"passed"},"execution_parent":"98ea3821689bdfb04c919023cccac9401ff61c63","goal_id":"35a855fb-19c4-484e-b019-22a0b49a65df","implementation_commit":"fd42ada4453ec6b21bcd0caa9bf6a825b99f44df","plan_path":"docs/plans/active/shared-plugin-release-orchestration.md","plan_sha256":"f54969979ca2a21072eb99cd92bbaf77ec5328288fd81d509f41d7f77ba5e434","repository_id":"DocksDocks/docks","requested_effects":["local","push"],"risk":"external","run_id":"91be1391-90a4-481b-bb1d-8f47f730eace","schema":1,"source_base":"438b07c424e88f3a98868df4c89b985c8f3a4664","source_sha256":"937be3ce0ac5bc850c8311b83e5626c9fc4c6eee35aca1ced9adc8829dca672c"},"schema":1,"status":"blocked","successor_run_sha256":"4d70cb7ecd5620fb3626a11764d87b47ef566cf46d670bed2a5d0830d194df31"}

Plan-attempt-history: {"authorization_source_sha256":"5c1210455f6854c60c9e9e916c73e784f8df289ebd017a406f7d6a823054c20a","plan_bytes_sha256":"527961a2b863bb7f93adf2e53b462343c627ef54daf1972d1d87c76fcd731dc3","replacement_run_id":"d030b398-2dc2-4e06-9219-8ded5eb7c77b","run":{"acceptance":null,"blocker":{"evidence_sha256":"15c0f5cbdd4df62ad78f4b8a87766ead78e37a1ffab1a7c9fea736d5f274bc86","kind":"verification_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"9005f80da4a1f4203935899018e518e49ab1e6e31b519db17480caf4ab21d6ed","invocations":1,"result_sha256":"c1b46fdd51a2b25849378ecb9ae5a1a680a73148a76f4e1e74c3b5830290eeb2","state":"passed"},"execution_parent":"98ea3821689bdfb04c919023cccac9401ff61c63","goal_id":"35a855fb-19c4-484e-b019-22a0b49a65df","implementation_commit":null,"plan_path":"docs/plans/active/shared-plugin-release-orchestration.md","plan_sha256":"f54969979ca2a21072eb99cd92bbaf77ec5328288fd81d509f41d7f77ba5e434","repository_id":"DocksDocks/docks","requested_effects":["local","push"],"risk":"external","run_id":"133c8f0c-5986-4b0d-8d56-4416f04333c9","schema":1,"source_base":"fd42ada4453ec6b21bcd0caa9bf6a825b99f44df","source_sha256":"de4a6a55dc478ed0eeffb3f72c468938f27927d8217d5a5be2193a75af96d651"},"schema":1,"status":"blocked","successor_run_sha256":"63168f6a9289cf822b529dc31938c3ff76136735da5dec1355e241a0e6fbc60f"}

Plan-attempt-history: {"authorization_source_sha256":"5c1210455f6854c60c9e9e916c73e784f8df289ebd017a406f7d6a823054c20a","plan_bytes_sha256":"ba43893d8aad430482d2f930e8101a717b4d710ff710eb185f0bfbba870a8cd8","replacement_run_id":"197eaaaa-12ed-4fcb-8a45-b4b88156a656","run":{"acceptance":{"source_sha256":"2ffbdc3e5ba259ed9883d0c860b7db92ae7f10900fbafed380d9f47987434b5e","verification_sha256":"614791fa3cdbf4377cc3222ac4f224c3c32ea82f986fbbc3d3cb804114fcfdb6"},"blocker":{"evidence_sha256":"e8685f4b99e4e4a58c72520063f9b27b9cb960f6324bf097d71c4c1ffa0732a6","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":"b8ee8725776430401f39c834cbd05fec3c67d32984c7d3464fb89d0792d09c6f","invocations":2,"result_sha256":"e8685f4b99e4e4a58c72520063f9b27b9cb960f6324bf097d71c4c1ffa0732a6","state":"blocked"},"draft_review":{"accepted_classes":[],"input_sha256":"b6728c1fcf4f26099886d485b34892795106ae997106b82849b4ebab9bd2ce05","invocations":1,"result_sha256":"485951580d9c85616c8f0da06c9a5776b4b6252c3a8747e628108711e5ea27a9","state":"passed"},"execution_parent":"98ea3821689bdfb04c919023cccac9401ff61c63","goal_id":"35a855fb-19c4-484e-b019-22a0b49a65df","implementation_commit":"7da7e17b46615e31a6f62903f69b934c28126a2e","plan_path":"docs/plans/active/shared-plugin-release-orchestration.md","plan_sha256":"1423b5be1ae4c46d38bbfee52257f317d7f194b4fdf2c76bcd3670eac7fa5227","repository_id":"DocksDocks/docks","requested_effects":["local","push"],"risk":"external","run_id":"d030b398-2dc2-4e06-9219-8ded5eb7c77b","schema":1,"source_base":"f509e0111a133274e98aa2b5ca8e41b259ab3fc4","source_sha256":"abe60f05d336ce9fa9bd56a0e608ff2094d3b4b986441d5010ccd3b4a31c9a70"},"schema":1,"status":"blocked","successor_run_sha256":"29d89da7b100d7979eb0d63f66a7c1109f369792efe0bf646b7d1d8b71376edd"}

Plan-attempt-history: {"authorization_source_sha256":"5c1210455f6854c60c9e9e916c73e784f8df289ebd017a406f7d6a823054c20a","plan_bytes_sha256":"b916b390e0af3bb6ec77ed2080d40c5e87489e2e24c71ef91a09d2a30878937e","replacement_run_id":"f5e86fb4-b6c5-4e40-a2d8-35c7956698cf","run":{"acceptance":{"source_sha256":"77852b9c3738abcb606527875cac010b52e10fcd9ab7b1286a0b8c1b9affa547","verification_sha256":"dbc4ff017b12fa83c0048eb97b60fc452cc2d69c3da3018ee04b37e69dccc10b"},"blocker":{"evidence_sha256":"3d78d393ee3016626a9328d6324bbb7114e0917e70799eab8b3ef0a4ddff2038","kind":"review_failed"},"completion_review":{"accepted_classes":[],"input_sha256":"e4cb74645a22b600beb3d99511a235e9feb1b311aebabefba2549ac6e08518fd","invocations":1,"result_sha256":"3d78d393ee3016626a9328d6324bbb7114e0917e70799eab8b3ef0a4ddff2038","state":"blocked"},"draft_review":{"accepted_classes":[],"input_sha256":"f13daca480fc2eb3b11759cc228008729e8484bce030768681187e9b513210da","invocations":1,"result_sha256":"68ff242cba351391cf995844af42b8660200632be696e4ecad597d80db3db04c","state":"passed"},"execution_parent":"f509e0111a133274e98aa2b5ca8e41b259ab3fc4","goal_id":"35a855fb-19c4-484e-b019-22a0b49a65df","implementation_commit":"afa68bb5d8edfb01dc052193481be71b0b45dbf4","plan_path":"docs/plans/active/shared-plugin-release-orchestration.md","plan_sha256":"1423b5be1ae4c46d38bbfee52257f317d7f194b4fdf2c76bcd3670eac7fa5227","repository_id":"DocksDocks/docks","requested_effects":["local","push"],"risk":"external","run_id":"197eaaaa-12ed-4fcb-8a45-b4b88156a656","schema":1,"source_base":"7da7e17b46615e31a6f62903f69b934c28126a2e","source_sha256":"2ffbdc3e5ba259ed9883d0c860b7db92ae7f10900fbafed380d9f47987434b5e"},"schema":1,"status":"blocked","successor_run_sha256":"702516b417a17d6548817ef54fb7fa66ac03e9e785e5ead26205493bb93057f1"}

Plan-attempt-history: {"authorization_source_sha256":"5c1210455f6854c60c9e9e916c73e784f8df289ebd017a406f7d6a823054c20a","plan_bytes_sha256":"1675ef9e56afccfc9fe0b77ee6a846e242fcb420372b10899e1051f7ded1b41a","replacement_run_id":"050484f5-b7fb-44d0-8e28-8da37e9f24ad","run":{"acceptance":null,"blocker":{"evidence_sha256":"6fe7b7f6cb736f69055da666a41d3041c2a3d2d94e80d23a1cb17260b1a93d65","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":["v1_acceptance_output_mismatch","v1_unauthorized_effect"],"input_sha256":"c1256e9d0de8b21cfcaa77af8f6b558325af472c5cc6399049c572ed2f0a70cb","invocations":2,"result_sha256":"6fe7b7f6cb736f69055da666a41d3041c2a3d2d94e80d23a1cb17260b1a93d65","state":"blocked"},"execution_parent":null,"goal_id":"35a855fb-19c4-484e-b019-22a0b49a65df","implementation_commit":null,"plan_path":"docs/plans/active/shared-plugin-release-orchestration.md","plan_sha256":"a74cc52a2cfe762ccf76852b51d9554f7bbe87d0abe0f324ec33a1393ced1b4e","repository_id":"DocksDocks/docks","requested_effects":["local","push"],"risk":"external","run_id":"f5e86fb4-b6c5-4e40-a2d8-35c7956698cf","schema":1,"source_base":"583afd626ef1f7bb81711daf1bbd61ff87b225d8","source_sha256":"e263e59011dab3b4227472b7362cdb93580d80f69d53d0d1352719ccba787e42"},"schema":1,"status":"blocked","successor_run_sha256":"80810667588f822e3a6ddb444f16711bd4b551dc5a6ab233474070373d878372"}

Plan-attempt-history: {"authorization_source_sha256":"5c1210455f6854c60c9e9e916c73e784f8df289ebd017a406f7d6a823054c20a","plan_bytes_sha256":"c89f80c6d7d24c3346b6f7bd21a37be32bbf3f9d21e272d80ecf43201b809fe6","replacement_run_id":"a34d1417-a3dc-4243-ab2a-739e6d595df7","run":{"acceptance":null,"blocker":{"evidence_sha256":"368e6de1947acd0806a0b9e90af18d12e52a07397c7945f6c9a3b041a666164b","kind":"verification_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"cca86d836494296f2acf08fb6521373ca135f6b8958674a6228bf267aeafa4e5","invocations":1,"result_sha256":"393c5118387eade74ada507422a3661d56e166060f3cac4b17944bdc9ab64ec1","state":"passed"},"execution_parent":"583afd626ef1f7bb81711daf1bbd61ff87b225d8","goal_id":"35a855fb-19c4-484e-b019-22a0b49a65df","implementation_commit":null,"plan_path":"docs/plans/active/shared-plugin-release-orchestration.md","plan_sha256":"29c2472afe1c92caa47f9e919b556723e851b8ae466361b430e5112ffb3f9006","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push"],"risk":"external","run_id":"050484f5-b7fb-44d0-8e28-8da37e9f24ad","schema":1,"source_base":"583afd626ef1f7bb81711daf1bbd61ff87b225d8","source_sha256":"e263e59011dab3b4227472b7362cdb93580d80f69d53d0d1352719ccba787e42"},"schema":1,"status":"blocked","successor_run_sha256":"548ce02783a93d773a7ea74fd75ae76223338fbdd8a6ad36248fccec1fda1c47"}

Plan-attempt-history: {"authorization_source_sha256":"5c1210455f6854c60c9e9e916c73e784f8df289ebd017a406f7d6a823054c20a","plan_bytes_sha256":"ac6c4deaab68d329190e62f65999041944777b49b329b63de1ef87d51cd6260d","replacement_run_id":"25ecfa3f-e424-49a9-9c47-59feb98fa60d","run":{"acceptance":null,"blocker":{"evidence_sha256":"61b56bd4b43834c7a6039ca0a2646a2c09013380cb99720decdfc3375408c298","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"accepted_classes":[],"input_sha256":"35273044323c0bb9106ffada386f3322f2acf41c7849f54b5de4f8caa9842071","invocations":1,"result_sha256":"61b56bd4b43834c7a6039ca0a2646a2c09013380cb99720decdfc3375408c298","state":"blocked"},"execution_parent":null,"goal_id":"35a855fb-19c4-484e-b019-22a0b49a65df","implementation_commit":null,"plan_path":"docs/plans/active/shared-plugin-release-orchestration.md","plan_sha256":"13b4255aa876ee9da2bcb95eb2c8d308951006d0b3ce6a11fc24a91ffd3085f4","repository_id":"DocksDocks/docks","requested_effects":["local","probe","push"],"risk":"external","run_id":"a34d1417-a3dc-4243-ab2a-739e6d595df7","schema":1,"source_base":"74a76682c54757245466e0d07514954dfcd2d8d9","source_sha256":"911ea17e2ee0a39e1aa15a3485eae30032018c9862f73102daec63182b087b97"},"schema":1,"status":"blocked","successor_run_sha256":"6ac362cadf8665218844bd33bfffde6697f3e98e2dafa6fd9dc433588da3fdbb"}

## Verification Results

- A1 passed at implementation `74a76682c54757245466e0d07514954dfcd2d8d9`: the three generic plugins selected the shared engine; malformed, duplicate, and cross-lane options refused; the fixture-only callback invoked no generic or reviewed production adapter; dry-run left bytes and refs unchanged.
- A2 passed: the distribution contract reported all eight checks, including generic legacy fixtures routed through the composition root with canonical reports and no production IO. Release evidence, instance, publication, promotion, and detached companion contracts all passed.
- A3 passed in the clean canonical checkout. Docks previewed `0.16.1 -> 0.16.2`, Effect Kit previewed `0.5.0 -> 0.5.1`, and Plan Lifecycle previewed `0.1.0 -> 0.1.1`; each ran selected CI and reported no written bytes, push, tag, or release.
- A4 passed: positional Session Relay invocation exited 1 with `Session Relay positional release syntax is disabled; use --prepare` before generic IO.
- A5 passed: `node scripts/ci.mjs` completed every repository-wide and four-plugin gate, every Session Relay release contract, Cargo checks, JavaScript format, and lint at exact implementation `74a76682c54757245466e0d07514954dfcd2d8d9`.
- A6 passed under live `ExternalAuthorityV1` source `5c1210455f6854c60c9e9e916c73e784f8df289ebd017a406f7d6a823054c20a`, scope `probe`, mode `read`, and exact refs/release targets. All three Docks records report version 0.16.1 and preserve sealed SHA-256 digests `6da30165eaf1536f18942955e6197816eadd49979fadfe1a9c3b2a3470bfdb42`, `e26c1e6b603e0c643bb9ed1d144c28ae8cd1509077edcedd0bf3fa976d0ec64a`, and `651ee5db0d24ec4bbb796ca9a311ffa579f570badb0bc55a9a0a918e3ecf83db`. Remote main is `cb00d16101cb3f8d4e0adb471c21ca11b9647f57`; tag `docks--v0.16.1` exists; its GitHub Release is stable, non-draft, and published at `2026-08-04T18:44:52Z`.
- No remote mutation occurred after the accidental Docks 0.16.1 publication. Steps 1-7 remain observed `done`. A1, A2, and A5 must rerun after Step 8 adds Plan Lifecycle fixture coverage. Only archive Step 9 may remain `planned`; it binds the exact implementation checkpoint created after Step 8 and the required reruns pass.
