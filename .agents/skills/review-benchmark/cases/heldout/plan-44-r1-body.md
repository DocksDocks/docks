<!-- plan-contract: v3 -->

## Goal

Replace the v3 byte contract with an agent-first v4 contract. Agents read one canonical contract reference and follow the skills; a thin `plan.mjs` helper normalizes what agents write instead of refusing it, and keeps only the mechanisms an agent cannot perform alone: compare-before-write with read-back, sole-assignee ownership, the step freeze after work starts, a guarded body edit, and merged-closer archive proof. Prose lives in one place; no test pins prose sentences.

Mode: plan-and-implement

User decisions recorded in this session: thin normalizing helper; hard refusals limited to the mechanisms above plus any that make durable sense; delete prose pinning and keep one helper smoke; `plan-contract.md` in the plugin is canonical; em dash and absolute path become normalize-and-advise.

## Research

Findings, each bound to a repository path or observed GitHub state:

1. Case-sensitive comparisons that reject agent output: `STEP_EFFECTS.has` and `STEP_STATUSES.has` at `plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs:234-235`; step id regex `[a-z][a-z0-9_]{0,63}` at `:231`; `Mode:` regex at `:277`; heading comparison `headings.join('\0') !== SECTIONS.join('\0')` at `:217`; exact table headers at `:14-17`; review heading, verdict, finding kind, and severity tokens at `:470-497`; CLI status arguments at `:943` and `:970`. None of these differences carries meaning.
2. Review records lost to the comment grammar, measured on 2026-09-09 over all 16 `plan` issues: 40 real verdict comments, 15 ineligible. Causes: ` (round N)` heading suffix (8), U+2014 heading separator (6), U+2014 inside a finding line (5), `### Code review` with no round number (1). `plan.mjs show` derives `plan=none` for #35 and #33, `plan=none code=none` for #23, and `code=none` for #22. `archive 23` would refuse today.
3. `createdAt` ordering drift: the contract (`docs/PLAN.md:344-347`) orders review records by `createdAt`; `reviewVerdicts` at `plan.mjs:512-524` uses API order only. On #35 the round-1 repair has a later `createdAt` than the round-2 pass.
4. Mechanisms an agent cannot do alone, with current line ranges: compare-before-write and read-back `editIssueBodyIfUnchanged` `:579-596`; ownership `readPlanIssue` `:531-554`; step freeze `planWorkStarted` `:451-467` and `editPlan` `:866-912`; export digest `:776-810`; archive closer proof `:349-428` and `:1110-1137`. Everything else in the 1,197-line script is a style check, a transition table, or the optional queue parser.
5. Prose duplication: the durable-solution sentence is in 6 files, the review-comment shape in 7, the five-round loop in 6, the dirty-worktree rule in 6, and the merge ask in 5 (`docs/PLAN.md`, `plan-contract.md`, `plan-md-template.md`, `plan-manager/SKILL.md`, `github-issue-publication.md`, both agent wrappers, root `AGENTS.md`). `scripts/tests/plan-skill-phases.mjs` pins 57 clauses verbatim across those files (`V3_PINNED_CLAUSES`, `:39-314`). Observed drift: `docs/PLAN.md:337` says zero or more finding lines; `plan.mjs:484-485` requires zero on pass and at least one otherwise.
6. Behavioral coverage today: `scripts/tests/plan-cli.mjs` (about 2,470 lines) covers em dashes, provenance, review trust, edit freeze, and archive proof; `plugins/plan-lifecycle/test/selftest.mjs` covers exports, the fail-loud paragraph, and plugin metadata only.
7. CI wiring: `scripts/ci.mjs:373-385` runs `plan-cli.mjs` and two `plan-skill-phases.mjs` cases; `scripts/config/test-contracts.json` registers `repo-plan-cli` and `repo-plan-skill-phases`; `package.json` `test:coverage` targets `plan-cli.mjs`; `scripts/AGENTS.md:23,53-63,95-96` and `.github/AGENTS.md:6-9` describe them; `plugins/docks/skills/AGENTS.md:78-80` and `plugins/plan-lifecycle/skills/AGENTS.md:77-91` name `plan-skill-phases.mjs` as the verbatim asserter.
8. Other references to the v3 marker or retired commands: `AGENTS.md:26,79-135`, `README.md:72-118`, `docs/AGENTS.md:7-16`, `plugins/docks/skills/engineering/refactor/references/executor-dispatch.md:37-38` (`plan.mjs check`), `plugins/docks/skills/productivity/scaffold/references/spec-schema.md:88`, `plan-workspace/SKILL.md:73-282` (`labels`, `check`, `PLAN-QUEUE.md`).
9. Plugin version: `plan-lifecycle` is `0.9.0` in `plugins/plan-lifecycle/.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and `.claude-plugin/marketplace.json`; `compatibility.json` is `{schema:1, minimum_docks_major:0}`. `ci.mjs --plugin plan-lifecycle` enforces lockstep.
10. Friction history: `docs/plans/finished/2026-05-24-skill-maintainer-fixes.md:103-104` records a brittle global `git status` assertion; the clean-tree rule stays limited to branch checkout. No archive entry records an incident behind the em-dash ban, absolute-path ban, or digest sidecar.

Durable fix: one canonical contract, one thin helper that normalizes, one smoke test of the kept mechanisms. Temporary fix it replaces: relaxing individual regexes inside the 1,197-line script while keeping seven prose copies and the pinning test.

v4 contract summary (the canonical text lands in step `contract`):

- Marker `<!-- plan-contract: v4 -->`. The helper reads v3 and v4 bodies and writes v4 on its first body write. Self-hosting: this plan, #44, is a v3 record and stays one until its first v4 `edit`; the rewritten helper must `show`, `step`, `edit`, and `archive` it, so the v3 read path is a requirement of step `helper`, not a compatibility extra.
- Seven sections: Goal, Research, Steps, Acceptance, Do not touch, Open questions, Verification Results. `## Review` is dropped; the helper ignores it when present. Headings match case-insensitively after trimming; a missing section is inserted empty on write.
- Steps columns unchanged. On write the helper lowercases Id, Effect, and Status, maps `-` to `_` in Id, and accepts Depends as display numbers or ids. Unknown Effect or Status is an advisory line, not a refusal.
- Review comment: heading starts with `plan review` or `code review` (any level, any case, any suffix); verdict line `plan-review:` or `code-review:` (case-insensitive, hyphen or space) with aliases `pass|ok|approved`, `repair|fixes-required|changes`, `blocked`; finding lines are free text; a code-review `pass` whose finding lines carry a `critical` or `high` severity token is derived as `fixes-required`, so a known severe defect never authorizes archive. Trust is the sole assignee; latest by `createdAt`. No legacy body fallback.
- Helper commands: `new`, `show [--body]`, `export`, `edit --file`, `status`, `step`, `list`, `archive`, `retire`. `new` creates the five labels idempotently. The first mutating write claims an unassigned plan. `labels`, `claim`, `check`, `next`, and the `docs/PLAN-QUEUE.md` parser are removed.
- Refusals: foreign owner; body changed since export; existing Steps row Status, Effect, or presence changed through `edit` after `plan:ongoing` was ever applied; new rows not `planned`; closed plan gains rows; `status` on a closed issue; `step` leaving `done` or `skipped` on an open plan; archive without a merged pull request into the default branch as the latest closure, or without a trusted latest code-review pass, or with a non-terminal step.
- Normalization on write: U+2014 becomes ` - `; token case and heading case become canonical; trailing whitespace trimmed. Advisories (stdout `advice:` lines, exit 0): absolute machine path, Research placeholder after drafting, missing or unknown Mode line (the conservative `plan-only` is written and named in the advisory; implementation never starts from a defaulted mode), unfinished dependency on `in-flight` or `done`, non-local Effect reminder.
- Open-status transitions are free among `drafting`, `planned`, `ongoing`, `blocked`. `blocked` requires `--reason`.
- The three skills stay: `plan-workspace`, `plan-manager`, `plan-reviewer`; two reviewer wrappers stay. The six phases stay; the five-round ceiling becomes: stop on pass; on no progress or a surviving finding, `ask` the user to continue or block; a round-5 non-pass also routes through `ask`.
- Landing text keeps the fresh `Merge now` ask, `--match-head-commit`, and clean-tree-before-checkout. Exact retry counts are replaced by "wait up to five minutes for checks to appear".

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | helper | Rewrite plan.mjs as the thin normalizing helper: normalize module, v3 and v4 readers, v4 writer, tolerant review parser sorted by createdAt, the nine commands, the listed refusals and advisories | plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs | - | `local` | `planned` | `wc -l` of plan.mjs is at most 500 and `plan.mjs show 23` prints `reviews: plan=pass code=pass` |
| 2 | contract | Write the canonical v4 contract reference and reduce every other copy to a pointer: docs/PLAN.md, the workspace template, docs/AGENTS.md, the root AGENTS.md Plans block, README.md, spec-schema.md, executor-dispatch.md | plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plan-md-template.md, docs/PLAN.md, docs/AGENTS.md, AGENTS.md, README.md, plugins/docks/skills/productivity/scaffold/references/spec-schema.md, plugins/docks/skills/engineering/refactor/references/executor-dispatch.md | - | `local` | `planned` | plan-contract.md is at most 220 lines, docs/PLAN.md is at most 40 lines, and no normative document outside docs/plans/finished contains `plan-contract: v3` (the helper and its smoke test are exempt) |
| 3 | skills | Shrink the three lifecycle skills, the publication reference, the codex agent templates, both shipped agents, both Codex wrappers, and both skills AGENTS.md nodes to reference the contract instead of restating it; refresh content hashes | plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-manager/references/github-issue-publication.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/SKILL.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/references/codex-agent-templates.md, plugins/plan-lifecycle/skills/productivity/plan-reviewer/SKILL.md, plugins/plan-lifecycle/agents/plan-reviewer.md, plugins/plan-lifecycle/agents/code-reviewer.md, .codex/agents/plan-reviewer.toml, .codex/agents/code-reviewer.toml, plugins/plan-lifecycle/skills/AGENTS.md, plugins/docks/skills/AGENTS.md | - | `local` | `planned` | plan-manager/SKILL.md is at most 180 lines and `node scripts/skills/content-hash.mjs --check-only` exits 0 |
| 4 | tests | Delete plan-skill-phases.mjs; rewrite plan-cli.mjs as the helper smoke covering normalization, ownership, compare-before-write, step freeze, review trust, and archive proof; update selftest.mjs, the test registry, ci.mjs, package.json, scripts/AGENTS.md, and .github/AGENTS.md | scripts/tests/plan-skill-phases.mjs, scripts/tests/plan-cli.mjs, plugins/plan-lifecycle/test/selftest.mjs, scripts/config/test-contracts.json, scripts/tests/test-contracts.mjs, scripts/ci.mjs, package.json, scripts/AGENTS.md, .github/AGENTS.md | 1 | `local` | `planned` | `node scripts/tests/plan-cli.mjs` exits 0 and plan-skill-phases.mjs is absent |
| 5 | version | Bump plan-lifecycle to 0.10.0 in both plugin manifests and the Claude marketplace catalog, then run the selected-plugin gate and the full gate | plugins/plan-lifecycle/.claude-plugin/plugin.json, plugins/plan-lifecycle/.codex-plugin/plugin.json, .claude-plugin/marketplace.json | 1, 2, 3, 4 | `local` | `planned` | `node scripts/ci.mjs --plugin plan-lifecycle` and `node scripts/ci.mjs` both exit 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-cli.mjs` | Exit 0; the smoke names every kept refusal and at least one normalization case |
| A2 | `node plugins/plan-lifecycle/test/selftest.mjs` | Exit 0 |
| A3 | `node plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs show 23` | Second line is `reviews: plan=pass code=pass` |
| A4 | `node plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs show 22` | Second line is `reviews: plan=pass code=pass` |
| A5 | `wc -l plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs plugins/plan-lifecycle/skills/productivity/plan-manager/references/plan-contract.md docs/PLAN.md plugins/plan-lifecycle/skills/productivity/plan-manager/SKILL.md` | plan.mjs at most 500, plan-contract.md at most 220, docs/PLAN.md at most 40, SKILL.md at most 180 |
| A6 | `git grep -l -e 'plan-contract: v3' -e 'plan-skill-phases' -- ':!docs/plans/finished' ':!plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs' ':!scripts/tests/plan-cli.mjs'` | No output; the helper and its smoke test are the only files that still name the v3 marker, because the helper reads v3 records |
| A7 | `node scripts/ci.mjs --plugin plan-lifecycle` | Exit 0 |
| A8 | `node scripts/ci.mjs` | Exit 0 |
| A9 | `node plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs show 44` | Exit 0 and the header strip names this plan; proves the v4 helper reads its own v3 record |

## Do not touch

- `docs/plans/finished/` (frozen history)
- Existing GitHub plan issue bodies and comments; no rewrite of v3 records; the helper reads them as they are
- Skill bodies under `plugins/docks/skills/` other than the two references and the AGENTS.md node named in Steps
- Release tooling and the release itself; the version bump is local and the tag is a later user action

## Open questions

None

## Review

_Review records are stored in issue comments._

## Verification Results

_Not implemented yet._
