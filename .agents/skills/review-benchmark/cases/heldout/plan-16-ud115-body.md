<!-- plan-contract: v3 -->

## Goal

`node scripts/release.mjs --dry-run` states what a re-cut release does. When the release would stage nothing, the preview says that each manifest stays unchanged and that the release tags the existing HEAD instead of making a release commit. The preview decides this with a predicate that sees what the write does, so it never promises a commit that the release skips or hides one that the release makes.

Why now: the manifests carry plan-lifecycle 0.6.0, so the next release of that number is a re-cut, and today its preview promises a release commit that the release will not make.

User request (in session, 2026-08-21): "Make `release.mjs --dry-run` tell the truth about a re-cut. When the manifests already carry the version, the preview must say they stay unchanged and that the release tags the existing HEAD instead of making a release commit. Pin it in the release tests, document it in the runbook, and run the full gate before you hand it back."

Scope: the dry-run path and the closed IO adapter in `scripts/lib/plugin-release.mjs`, the release contract and the release shim in `scripts/tests/ci-plugin-targeting.mjs`, and the release runbook in `scripts/AGENTS.md`.

Mode: plan-and-implement

## Research

Hypothesis: the dry-run tail always prints a release commit, and its per-manifest comparison cannot see file bytes. The facts below confirm both.

Durable fix: the preview and the release decide on one question, whether `git add` of the written bytes would stage anything, and print one shared sentence; this replaces the temporary fix of a runbook sentence or a deleted label that leaves the preview wrong.

### Repository facts

- The engine owns the re-cut. `scripts/lib/plugin-release.mjs:283-289` refuses a same-version run only when the tag `<plugin>--v<version>` exists. `releaseTagExists` at `scripts/lib/plugin-release.mjs:193-209` checks the local tag, then runs `git ls-remote --tags origin`, and throws when origin is unreachable.
- The executed re-cut. `createGenericPluginReleaseIo.commit` at `scripts/lib/plugin-release.mjs:395-405` runs `git add` on the files and tests `git diff --cached --quiet -- <files>`. When that test exits 0, it prints `manifests already at this version — tagging existing HEAD` and returns without a commit. The recovery text at `scripts/lib/plugin-release.mjs:343-350` tells the author to re-cut the same number, which takes that branch.
- The false commit promise. The dry-run tail at `scripts/lib/plugin-release.mjs:316-323` always prints `[dry-run] git commit -m "chore(release): <plugin> v<version>"`. On a re-cut of canonical manifests the release makes no commit and tags the existing HEAD.
- The blind comparison. `previewJsonWrite` at `scripts/lib/plugin-release.mjs:226-236` compares `formattedJson(after)` with an `original` that the caller builds with `formattedJson` of the parsed manifest (`scripts/lib/plugin-release.mjs:292`, `:298`, `:307`), because `io.readJson` at `scripts/lib/plugin-release.mjs:431-433` returns parsed JSON. Both sides are canonical. So the comparison sees value changes only, and its `none — formatting drift!` label cannot occur. `io.writeJson` at `scripts/lib/plugin-release.mjs:524-526` always writes canonical bytes. A same-version run on a noncanonical manifest therefore changes the file, stages it, and commits.
- The skipped refusal. `scripts/lib/plugin-release.mjs:271` calls `io.ensureCleanTree()` only when `!dryRun`. The release refuses a dirty tree with `working tree dirty — commit/stash first` before it reads a manifest, and the dry run never reports that. `ensureCleanTree` at `scripts/lib/plugin-release.mjs:415-417` is a read: `git status --porcelain`.
- Exposure. The seven files that the release writes are `.claude-plugin/marketplace.json` and the `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` of `docks`, `effect-kit`, and `plan-lifecycle`. Each one is byte-equal to `JSON.stringify(value, null, 2)` plus a newline today (measured: parse each file, serialize it, compare). No gate check enforces that state: no `javascriptQuality` path in `scripts/lib/plugins.mjs:56-59`, `:78`, `:97-100` and no `check:js` path in `package.json:12` covers a manifest or the catalog.
- The closed adapter. `IO_KEYS` at `scripts/lib/plugin-release.mjs:5-20` is a frozen set of fourteen operations, and `validateIo` at `scripts/lib/plugin-release.mjs:108-116` refuses an IO with any other key set. The suite derives `GENERIC_RELEASE_IO_KEYS` from the production adapter (`scripts/tests/ci-plugin-targeting.mjs:34-36`), and the fixture builder `genericReleaseIo` (`scripts/tests/ci-plugin-targeting.mjs:737-819`) asserts its own keys against that list at `:813-817`. So each new operation costs one fixture stub. `scripts/tests/unit/tag-ci-run-identity.test.mjs:54` builds the production adapter and calls only `waitForTagCi`, so a new key does not affect it.
- The test home. `testGenericReleaseModuleContract` (`scripts/tests/ci-plugin-targeting.mjs:848-1099`) drives `runGenericPluginRelease` with `genericReleaseIo` and reads the captured log lines. It runs on every invocation of the suite: in the default mode that the `targeting-contracts` job runs (`.github/workflows/ci.yml:208-211`) and in the `--unit` mode that the gate runs (`scripts/ci.mjs:307`). Assertions added there therefore run in the gate and in CI.
- The network in a re-cut test. A same-version run reaches `releaseTagExists`, which spawns the real `git ls-remote --tags origin`. A re-cut case in the contract would then fail offline and would depend on the real tag state. Behind the adapter, a fixture can answer the lookup.
- The real-git scenario. `testDryRunReleaseSafety` (`scripts/tests/ci-plugin-targeting.mjs:1101-1256`) runs `scripts/release.mjs --dry-run` through `writeReleaseShim` (`:304-321`). The shim passes only `node` through and exits 97 for every `git`, `claude`, and `gh` call. The scenario requires a clean checkout (`:1127-1128`) and compares `gitSnapshot` (`:286-302`: status, refs, three manifests) before and after. A dry run that calls git needs the shim to pass the read-only calls to the real git.
- The entry point. `scripts/release.mjs:17-23` only composes `createGenericPluginReleaseIo` with `dispatchPluginRelease`, so engine and adapter changes reach the command without an edit there.

### Official sources

- `git diff`, <https://git-scm.com/docs/git-diff>: the `--cached` form views "the changes you staged for the next commit relative to the named <commit>", and "if you do not give <commit>, it defaults to HEAD". `--quiet` "Implies --exit-code", and `--exit-code` "exits with 1 if there were differences and 0 means no differences". So status 0 in `commit` means that nothing is staged relative to HEAD for those files.
- `git hash-object`, <https://git-scm.com/docs/git-hash-object>: `--path` hashes "as if it were located at the given path", and Git uses the path "to determine which Git filters should be applied to the object". `--stdin` will "Read the object from standard input instead of from a file". Only `-w` will "Actually write the object into the object database".
- `gitattributes`, <https://git-scm.com/docs/gitattributes>: the clean command of a `filter` converts the worktree file "upon checkin", and `text` normalizes line endings "in the index every time the file is checked in". So raw byte inequality can over-predict a commit, and `hash-object --path` computes the blob that `git add` stores.
- `git rev-parse`, <https://git-scm.com/docs/git-rev-parse>: `<rev>:<path>` names "the blob or tree at the given path in the tree-ish object named by the part before the colon". With `--verify`, `--quiet` exits "with non-zero status silently" when the name is not valid.
- `claude plugin tag`, <https://code.claude.com/docs/en/plugins/cli-reference#plugin-tag>: the command creates an annotated tag `<name>--v<version>` after it checks that `plugin.json` and the marketplace entry agree. `--push` pushes the tag, and `-f, --force` skips "the dirty-working-tree and tag-already-exists checks". The repository pins `@anthropic-ai/claude-code` 2.1.234 (`package.json:20`), and that CLI's `claude plugin tag --help` lists the same `--push` and `-f, --force` text (read 2026-08-21). `createTag` at `scripts/lib/plugin-release.mjs:409-414` passes only `--push` and `--message`, so a release never skips the dirty-tree check.

### The predicate

On a clean tree `git status --porcelain` prints nothing, so the index equals HEAD. Then `git add` of the written bytes stages a change exactly when their filtered blob differs from `HEAD:<path>`. `git hash-object --path <path> --stdin` computes that blob without a write, and `git rev-parse --quiet --verify HEAD:<path>` names the committed blob. On a dirty tree the release refuses before any write, so the preview reports that refusal and predicts nothing else.

### Decisions

1. The user chose to keep the executed `createGenericPluginReleaseIo.commit` as it is: the same `git add`, the same `git diff --cached --quiet -- <files>` test, the same early return, and the same sentence bytes, which only move behind one shared constant. The preview gets its own read-only probe, and the plan does not move the commit decision into the engine. The user's reason: `scripts/AGENTS.md:187` keeps the existing "commit/push/tag behavior" of the positional flow, and the re-cut branch is the recovery that the tool itself prints (`scripts/lib/plugin-release.mjs:343-350`). On a clean tree the probe answers the same question as the cached diff, so the two cannot disagree.
2. The user chose to report a noncanonical manifest, not to forbid one. The plan adds no canonical-bytes check to the gate and reformats no manifest. The user's reason: with the staging probe the preview is true for every byte form, the seven written files are canonical today, and the next release write restores canonical bytes in any case (`scripts/lib/plugin-release.mjs:524-526`). A gate check would guard nothing that the preview relies on.

### Request corrections

Request correction 1. Asked: "When the manifests already carry the version, the preview must say they stay unchanged and that the release tags the existing HEAD instead of making a release commit." Did: the preview says `unchanged` and predicts the tag of the existing HEAD only when `git add` of the bytes that the release writes would stage nothing (`step:preview_truth`, `step:predict_commit`). A manifest that carries the version in other bytes gets the formatting-only label, and the preview predicts the release commit. Reason: `io.writeJson` (`scripts/lib/plugin-release.mjs:524-526`) always writes canonical bytes, and `commit` (`scripts/lib/plugin-release.mjs:400`) decides on the staged diff, not on the version value. A version test would print `unchanged` for a file that the release rewrites and commits.

Request correction 2. Asked: "run the full gate before you hand it back." Did: the final gate is `node scripts/ci.mjs --plugin plan-lifecycle` (`step:verify_local`, a15), not the full `node scripts/ci.mjs`. Reason: `AGENTS.md` (Tool-agnostic rules) makes the selected-plugin gate authoritative for a change owned by one plugin and its descriptor-owned release-contract tooling, and it says not to run the full gate merely because a single-plugin release is imminent. The release engine in `scripts/lib/plugin-release.mjs` is the release-contract tooling of the plan-lifecycle descriptor, and the only release that this plan previews is the plan-lifecycle 0.6.0 re-cut. The selected gate is therefore the authoritative one, and the full gate adds only repo-wide checks that no changed byte touches.

### Rows that need a clean checkout

Rows a12 and a13 need a clean tree: the scenario asserts an empty status first, and the new dry run reports a dirty tree instead of a preview. Run them in a clean clone of the change commit under the agent-worktrees root, after `bun install --frozen-lockfile`. That commit is the user's to make (`AGENTS.md`, Plans), so these two rows run once the user asks for it. On the uncommitted implementation tree, a1 checks the refusal instead.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | tag_lookup | Move the already-released lookup behind the closed adapter as `tagPublished(tag)`: the production adapter runs the same local `git rev-parse -q --verify refs/tags/<tag>` and `git ls-remote --tags origin refs/tags/<tag>` calls with the same unreachable-origin refusal, and the engine calls `io.tagPublished` where it called `releaseTagExists` | scripts/lib/plugin-release.mjs | — | local | planned | `IO_KEYS` holds fifteen keys, the engine no longer spawns git for the lookup, and both refusal texts are unchanged |
| 2 | stage_probe | Add `wouldStageChange(file, text)` to the closed IO set: hash the text with `git hash-object --path <path> --stdin`, compare it with `git rev-parse --quiet --verify HEAD:<path>`, never pass `-w`, and throw when `hash-object` fails | scripts/lib/plugin-release.mjs | 1 | local | planned | `IO_KEYS` holds sixteen keys, and the probe returns true only when the blob differs from HEAD or the path is absent from HEAD |
| 3 | clean_gate | Consult `ensureCleanTree` in the dry run at the point where the release consults it; on a dirty tree print `[dry-run] the release would refuse: working tree dirty — commit/stash first` and return with exit 0 before selected CI and the manifest preview | scripts/lib/plugin-release.mjs | 2 | local | planned | A dirty-tree dry run prints the refusal line and no selected-CI, manifest, `git commit`, `git push`, or `plugin tag` line |
| 4 | preview_truth | Replace the parsed comparison in `previewJsonWrite`: probe `formattedJson(after)` for each manifest, print `unchanged (already at <version>)` when nothing would stage, a formatting-only label when it would stage at the same version, or the version write otherwise, delete the unreachable `none — formatting drift!` label, and return whether the file would stage | scripts/lib/plugin-release.mjs | 3 | local | planned | A canonical re-cut prints `unchanged (already at 0.6.0)` per manifest, and a staging fixture prints the formatting-only label |
| 5 | predict_commit | Branch the dry-run tail on the union of the probe results: print the `git commit` line when any manifest would stage, otherwise print the sentence from one shared `RECUT_TAG_REASON` constant that `commit` also prints | scripts/lib/plugin-release.mjs | 4 | local | planned | A canonical re-cut prints `manifests already at this version — tagging existing HEAD` and no `git commit` line, while a staging re-cut and a patch bump print the commit line |
| 6 | contract_tests | Extend `testGenericReleaseModuleContract`: give `genericReleaseIo` `tagPublished` and `wouldStageChange` stubs with options, run a plan-lifecycle re-cut with the production `wouldStageChange`, and pin the three preview labels, both tail branches, the dirty-tree return, the already-released refusal through `tagPublished`, and the closed-set refusal of an IO without either key | scripts/tests/ci-plugin-targeting.mjs | 5 | local | planned | The suite exits 0, and reverting the union branch or the probe result fails it |
| 7 | shim_vectors | Let `writeReleaseShim` pass exactly `git status --porcelain`, `git hash-object --path <path> --stdin`, and `git rev-parse --quiet --verify HEAD:<path>` to the real git, keep exit 97 for every other `git`, `claude`, and `gh` call, and add the `git cat-file --batch-all-objects --batch-check` listing to `gitSnapshot` | scripts/tests/ci-plugin-targeting.mjs | 6 | local | planned | The `--dry-run-release-safety` scenario exits 0 from a clean clone, and its before and after snapshots, including the object list, are identical |
| 8 | docs_recut | Record in `scripts/AGENTS.md` that the closed adapter holds the read-only staging probe and the tag lookup, and that the tag is the release fact: a re-cut whose manifests stage nothing tags the existing HEAD, and the dry run reports that and the dirty-tree refusal; use the durable anchor grammar | scripts/AGENTS.md | 5 | local | planned | The adapter paragraph and the release flow state the re-cut contract with no live `file:line` anchor |
| 9 | verify_local | Run every acceptance row and the final gate named in Request correction 2 | scripts/lib/plugin-release.mjs, scripts/tests/ci-plugin-targeting.mjs, scripts/AGENTS.md | 7, 8 | local | planned | `node scripts/ci.mjs --plugin plan-lifecycle` exits 0, rows a1 to a11 and a14 pass on the implementation tree, and a12 and a13 pass from the clean clone of the change commit |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| a1 | `node scripts/release.mjs --plugin plan-lifecycle 0.6.0 --dry-run` on the uncommitted implementation tree | exits 0, prints `[dry-run] the release would refuse: working tree dirty — commit/stash first`, and prints no `Running local ci.mjs`, manifest, `git commit`, `git push`, or `plugin tag` line |
| a2 | `node scripts/tests/ci-plugin-targeting.mjs` | exits 0, and the release contract asserts `unchanged (already at 0.6.0)` for the three plan-lifecycle manifests from the production probe, the shared re-cut sentence, and no `git commit` line |
| a3 | `node scripts/tests/ci-plugin-targeting.mjs` | exits 0, and a same-version fixture whose probe reports a staged change asserts the formatting-only label and the `git commit` line |
| a4 | `node scripts/tests/ci-plugin-targeting.mjs` | exits 0, and a patch-bump fixture asserts the version write per manifest and the `git commit` line |
| a5 | `node scripts/tests/ci-plugin-targeting.mjs` | exits 0, and a fixture whose `ensureCleanTree` returns false asserts the refusal line, no `runSelectedCi` call, and no later preview line |
| a6 | `node scripts/tests/ci-plugin-targeting.mjs` | exits 0, and a same-version fixture whose `tagPublished` returns true asserts the `already released` refusal |
| a7 | `node scripts/tests/ci-plugin-targeting.mjs` | exits 0, and an IO without `wouldStageChange` or without `tagPublished` is refused with `generic release IO must be the exact closed adapter` before any IO call |
| a8 | Delete the union branch from the dry-run tail, run `node scripts/tests/ci-plugin-targeting.mjs`, then restore the file | exits 1 naming the missing re-cut sentence |
| a9 | Make `wouldStageChange` return false for every file, run `node scripts/tests/ci-plugin-targeting.mjs`, then restore the file | exits 1 naming the mispredicted formatting-only case |
| a10 | Skip the `ensureCleanTree` consult in the dry run, run `node scripts/tests/ci-plugin-targeting.mjs`, then restore the file | exits 1 naming the unreported dirty-tree refusal |
| a11 | `git diff -- scripts/lib/plugin-release.mjs`, read `createGenericPluginReleaseIo.commit` | only the sentence moves behind `RECUT_TAG_REASON`, whose value is byte-identical; `git add`, the cached-diff test, the early return, and `git commit` are unchanged |
| a12 | From a clean clone of the change commit: `node scripts/tests/ci-plugin-targeting.mjs --dry-run-release-safety` | exits 0 with `Docks release dry-run left repository bytes and refs unchanged` |
| a13 | From the same clean clone: `node scripts/release.mjs --plugin plan-lifecycle 0.6.0 --dry-run` | exits 0, prints `unchanged (already at 0.6.0)` for each of the three manifests and `manifests already at this version — tagging existing HEAD`, and prints no line containing `git commit` |
| a14 | `grep -n 'already at this version' scripts/AGENTS.md` | the release runbook states the re-cut contract |
| a15 | `node scripts/ci.mjs --plugin plan-lifecycle` | exits 0 |

## Do not touch

The executed behavior of `createGenericPluginReleaseIo.commit`: only its sentence moves behind a shared constant, byte-identical. `io.readJson` keeps parsing, and `io.writeJson` keeps writing canonical bytes. The probe never passes `-w`, so the object database is never written. The tag lookup keeps its two git calls and both refusal texts; only its call site moves into the adapter. The `ensureTool` checks stay real-run only (`scripts/lib/plugin-release.mjs:267-268`), so `--dry-run` still works on a machine without `gh` or `claude`. The `scripts/release.mjs` entry point, the descriptors in `scripts/lib/plugins.mjs`, the workflows, every plugin manifest and version, and the whole `plugins/` payload stay unchanged. No command-line flag is added, and no manifest is reformatted by this plan or by its tests.

## Open questions

None

## Review

_No review yet._

## Verification Results

_Not implemented yet._
