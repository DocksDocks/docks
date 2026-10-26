<!-- plan-contract: v3 -->

## Goal

`release.mjs --dry-run` states what a re-cut release does. A re-cut is a release at the version that the manifests already carry. The real run then stages nothing and tags existing HEAD. Today the dry run prints a `git commit` line for every run, and its manifest preview cannot see a noncanonical manifest. After this plan, the preview and the real run decide the same question: would `git add` stage anything.

Mode: plan-and-implement

## Research

Evidence, read in the repository at the base commit:

- `runGenericPluginRelease` in `scripts/lib/plugin-release.mjs` refuses a same-version run only when `releaseTagExists` finds the tag. Its comment states the contract: the manifest number is a proxy for "already released". The tag is the fact.
- `releaseTagExists` first checks a local tag with `git rev-parse -q --verify refs/tags/<tag>`. Without a local tag, it asks origin with `git ls-remote --tags origin refs/tags/<tag>`. It returns true only when origin lists the tag. When origin is unreachable, it refuses with `cannot reach origin to check whether <tag> is already released — refusing to guess`.
- `createGenericPluginReleaseIo().commit` stages the manifests and runs `git diff --cached --quiet`. On exit status 0, it prints `manifests already at this version — tagging existing HEAD` and makes no commit. The recovery text after a failed tag-CI run tells the author to re-cut exactly that version.
- The dry-run tail always prints `[dry-run] git commit -m "chore(release): <plugin> v<version>"`. On a re-cut of canonical manifests, the real run makes no commit. So the preview promises an action that the release does not take.
- `previewJsonWrite` compares `formattedJson(after)` with `formattedJson` of the parsed manifest. Both sides are canonical, so its label `none — formatting drift!` names a state that it cannot reach. `io.writeJson` always writes canonical bytes. Thus a same-version run on a noncanonical manifest stages a diff and commits, but the preview cannot show it.
- A byte comparison is not the staging decision either. A clean filter can map two byte strings to one blob. The local `git help hash-object` text for `--path` says: "the path is used to determine which Git filters should be applied to the object before it can be placed in the object database". `--stdin` is "Read the object from standard input instead of from a file". Only `-w` will "Actually write the object into the object database".
- The local `git help revisions` text for `<rev>:<path>` says that it "names the blob or tree at the given path in the tree-ish object named by the part before the colon". So `git rev-parse --quiet --verify HEAD:<path>` gives the committed blob of a manifest.
- https://git-scm.com/docs/git-diff says that `--quiet` will "Disable all output of the program. Implies `--exit-code`.", and that `--exit-code` "exits with 1 if there were differences and 0 means no differences". So exit status 0 in `commit` means "nothing staged relative to HEAD".
- The dry run skips `ensureCleanTree`. The real run refuses a dirty tree with `working tree dirty — commit/stash first` before it touches a manifest. On a clean tree, the index equals HEAD, so a blob that matches HEAD stages nothing.
- `IO_KEYS` is a frozen closed set of fourteen operations, and `validateIo` holds every caller to that set. The fixture builder in `scripts/tests/ci-plugin-targeting.mjs` checks its own keys against the production adapter, so a new operation costs one stub.
- The fake-adapter release contracts run only under `--dry-run-release-safety`. Neither `scripts/ci.mjs` nor a workflow passes that flag. So the default suite does not run them.
- `releaseTagExists` is outside the closed set. When the contracts move to the default suite, every same-version case reaches origin. `node scripts/ci.mjs` then fails when origin is unreachable.
- The local `git help config` text for `GIT_CONFIG_COUNT` says: "These environment variables will override values in configuration files". So a fixture `--local` setting does not isolate a fixture from ambient pairs.

Decisions:

- Add `wouldStageChange(file, content)` to the closed set. Production runs `git hash-object --path <file> --stdin` with the proposed bytes and compares the result with `git rev-parse --quiet --verify HEAD:<path>`. It never passes `-w`. It refuses when either command fails.
- Label each manifest from the probe and the version change: `unchanged (already at <v>)`, `would rewrite formatting only (already at <v>)`, or `would write version → <v>`.
- Consult `ensureCleanTree` in the dry run. On a dirty tree, print the refusal of the real run, compare no manifest, and predict no landing.
- Print the `git commit` line only when a probe says that a manifest would stage. Else print the re-cut sentence. One constant holds that sentence for the preview and for `commit`.
- Move `releaseTagExists` into the closed set as `tagPublished(tag)`. Keep its order, its result, and its refusal text unchanged. The fixture stubs it false, so the default suite needs no network.
- Run the fake-adapter contracts in the default suite. Assert the two fail-loud git predicates of the adapter against real git in temporary repositories.
- The test process is the isolation boundary for real git. The adapter keeps the environment of the operator, because it must predict the operator's own `git add`. Around the adapter contracts, the test sets `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` to the null device, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_COUNT=0`, and `GIT_TERMINAL_PROMPT=0`. Afterwards it restores every prior value.
- The release shim of the safety scenario fails closed. Only three exact read-only git argument vectors reach real git. The selected-plugin gate argv is stubbed green. Every other argv exits 97.

Durable fix: the preview and the real run decide on the same staging question and share one reason constant, so they cannot drift. A documentation sentence alone, or a deleted label alone, would leave the preview wrong.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | stage_probe | Add `wouldStageChange` to the closed IO set as `git hash-object --path <file> --stdin` compared with `git rev-parse --quiet --verify HEAD:<path>`, without `-w` | scripts/lib/plugin-release.mjs | — | local | done | The probe returns true only when the staged blob would differ from HEAD |
| 2 | preview_truth | Label each manifest as unchanged, formatting-only, or a version write from the probe result and the version change | scripts/lib/plugin-release.mjs | 1 | local | done | A canonical re-cut dry run prints `unchanged (already at <v>)` for each manifest |
| 3 | clean_gate | Consult `ensureCleanTree` in the dry run, print the refusal of the real run, and predict no landing on a dirty tree | scripts/lib/plugin-release.mjs | — | local | done | A dirty-tree dry run prints the `working tree dirty` refusal and no `git commit`, `git push`, or `plugin tag` line |
| 4 | predict_commit | Print the commit line only when a probe would stage, else the shared re-cut sentence | scripts/lib/plugin-release.mjs | 2, 3 | local | done | A canonical re-cut dry run prints no `git commit` line, and a staging re-cut and a real bump print one |
| 5 | closed_tag_check | Move the already-released check into the closed adapter as `tagPublished`, with the same order, result, and refusal text | scripts/lib/plugin-release.mjs, scripts/tests/ci-plugin-targeting.mjs | — | local | done | `IO_KEYS` holds sixteen keys, and the suite asserts the same-version consult and the `already released` refusal |
| 6 | contract_tests | Add both new keys to the fixture, pin the three labels, both tail branches, the dirty-tree suppression, and the closed-set refusal, and run the contracts in the default suite | scripts/tests/ci-plugin-targeting.mjs | 1, 2, 3, 4, 5 | local | done | The default run and the `--unit` run print `generic release module contract and dry-run manifest previews passed` |
| 7 | adapter_coverage | Assert the adapter predicates against real git: a folder that is not a repository, a required clean filter that fails, a path absent from HEAD, and the committed-bytes truth table | scripts/tests/ci-plugin-targeting.mjs | 1 | local | done | Deleting the `git status` throw or the `git hash-object` throw fails the default suite |
| 8 | ambient_config | Isolate the adapter contracts from ambient Git configuration in the test process and restore every prior value afterwards | scripts/tests/ci-plugin-targeting.mjs | 7 | local | done | The suite exits 0 under injected `GIT_CONFIG_KEY_<n>` pairs and under a hostile global configuration file |
| 9 | fail_closed_shim | Make the release shim fail closed and pin its refusal matrix in the default suite | scripts/tests/ci-plugin-targeting.mjs | 6 | local | done | The suite prints `release shim refuses every argv but the read-only three and the stubbed gate` |
| 10 | docs_recut | Record the staging probe, `tagPublished`, and the re-cut contract where the adapter and the release runbook are described | scripts/AGENTS.md | 1, 5 | local | done | `grep -n 'already at this version' scripts/AGENTS.md` prints the runbook sentence |
| 11 | verify_local | Run the full gate on the final tree | scripts/lib/plugin-release.mjs, scripts/tests/ci-plugin-targeting.mjs, scripts/AGENTS.md | 6, 7, 8, 9, 10 | local | done | `node scripts/ci.mjs` exits 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/release.mjs --plugin plan-lifecycle 0.6.0 --dry-run` | Exit 0, `unchanged (already at 0.6.0)` for all three manifests, the re-cut sentence, and no line with `git commit` |
| A2 | `node scripts/release.mjs --plugin plan-lifecycle patch --dry-run` | Exit 0, `would write version → 0.6.1` for each manifest, and the `git commit` line |
| A3 | `node scripts/tests/ci-plugin-targeting.mjs` | Exit 0, and the contract line, `release adapter git predicates refuse to guess`, and the shim matrix line print |
| A4 | `node scripts/tests/ci-plugin-targeting.mjs --unit` | Exit 0 and the contract line prints |
| A5 | Drop the `io.tagPublished` consult, then make the fixture ignore its option, and run the suite after each | Exit 1 that names the missing same-version consult, then exit 1 that names the missing `already released` refusal |
| A6 | `git remote set-url origin` to a path that does not exist in a clone of these bytes, then `node scripts/tests/ci-plugin-targeting.mjs` | Exit 0 |
| A7 | `git count-objects -v` and `git status --porcelain` around a same-version dry run | Both unchanged |
| A8 | Export `GIT_CONFIG_COUNT=3` with pairs that map `*.json` to a required clean filter that exits 3, then `node scripts/tests/ci-plugin-targeting.mjs` | Exit 0 |
| A9 | `grep -n 'already at this version' scripts/AGENTS.md` | The runbook states the re-cut contract |
| A10 | `node scripts/ci.mjs` | Exit 0 |

## Do not touch

- The executed behavior of `createGenericPluginReleaseIo().commit`. Only its message moves behind a shared constant, byte for byte.
- `io.readJson` keeps parsing, and `io.writeJson` keeps writing canonical bytes.
- The probe never passes `-w`, so the object database is never written.
- `scripts/release.mjs`, the descriptors in `scripts/lib/plugins.mjs`, every plugin manifest and version, and the whole `plugins/` payload.
- No new command-line flag.

## Open questions

None

## Review

### Plan review — 2026-08-21
Plan-review: repair
- [research_gap] `## Research` — the plan treats a raw byte comparison as the staging decision, but the dry run skips the clean-tree gate and a clean filter can map different bytes to one blob — call `ensureCleanTree` in the dry run and use a Git-normalized comparison
- [research_gap] `## Research` — the claims about `git diff --cached --quiet` cite only repository prose — cite the official git-diff page

Both findings were reproduced and repaired. `step:clean_gate` adds the clean-tree consult. `step:stage_probe` replaces the byte comparison with the `git hash-object --path` probe. `## Research` now quotes the git-diff page and the local git help texts.

## Verification Results

- A1: exit 0. The dry run printed `unchanged (already at 0.6.0)` for the three manifests and `manifests already at this version — tagging existing HEAD`, with no `git commit` line.
- A2: exit 0. Each manifest printed `would write version → 0.6.1`, and the `git commit` line printed.
- A3 and A4: exit 0 in both modes. The contract line, the adapter line, and the shim matrix line printed.
- A5: each mutation exited 1 with the expected name.
- A6: exit 0 with an unreachable origin.
- A7: `git count-objects -v` and `git status --porcelain` were byte-identical before and after.
- A8: exit 0.
- A9: `scripts/AGENTS.md:187` states the re-cut contract.
- A10: `node scripts/ci.mjs` exited 0.
