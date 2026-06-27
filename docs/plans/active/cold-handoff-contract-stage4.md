---
title: Stage 4 — kit-wide cold-handoff/authoring sweep
goal: Apply the research's Stage 4 across the kit — soften the ~7 non-safety all-caps imperatives (the kit already pairs most with their why), quality-audit skill/agent descriptions, add a minimal hand-written Codex commands block, and document the Claude-A/Claude-B fresh-instance test as standing QA.
status: ongoing
created: "2026-06-26T04:59:29+00:00"
updated: "2026-06-27T03:06:00-03:00"
started_at: "2026-06-27T02:37:20-03:00"
assignee: null
tags: [plans, kit-wide, authoring, codex, follow-up]
affected_paths:
  - plugins/docks/skills
  - plugins/docks/agents
  - AGENTS.md
  - plugins/docks/skills/productivity/write-skill/SKILL.md
related_plans: [cold-handoff-contract]
review_status: null
planned_at_commit: 463a3fbd5c88d67399381b91119cb1660cabd929
---

# Stage 4 — kit-wide cold-handoff/authoring sweep

## Goal

The deferred follow-up to `cold-handoff-contract` (Stages 1–3 shipped). Apply the
research artifact's **Stage 4** kit-wide recommendations that are in scope for
THIS repo: (1) soften the **guidance + domain-correctness** `MUST/ALWAYS/NEVER`
imperatives — an enumerated **7-occurrence** set (resolved q1: Moderate; full
keep/reframe verdict in `## Notes`). The kit already pairs 6 of the 7 with their
*why*, so this is mostly `MUST`→`must` lowercasing; only `feedback-loops:28` is a
substantive "state the rule, then why" rewrite. Keep verification-discipline,
approval gates, mentions, and defined-labels emphatic;
(2) a quality audit of every skill/agent description
(front-loaded trigger, collision routing, within the listing budget) — beyond the
"Use when" prefix the guard already enforces; (3) add a minimal, hand-written
build/test/lint commands block early in the root `AGENTS.md` for Codex
portability; (4) document the Claude-A/Claude-B fresh-instance test as the
standing QA method (it already proved its worth on `cold-handoff-contract`).
Success: each landed without loosening any validator floor, CI green, scores held.

## Context & rationale

Parent plan `cold-handoff-contract` shipped Stages 1–3 and explicitly parked
Stage 4 as too broad to bundle. Grounding audit (this session, at
`planned_at_commit`):

- `grep -rE '\b(MUST|ALWAYS|NEVER)\b' plugins/docks/skills plugins/docks/agents -o | wc -l`
  → **39 occurrences** (across 36 matching lines; the `-o` occurrence count is what
  the acceptance criterion tracks). Not all are defects: the research flags bare
  imperatives as a "yellow flag to reframe", but enforcement-critical/safety rules
  SHOULD stay emphatic. So the step reframes *guidance* imperatives only.
- Descriptions already pass the `Use when` prefix guard and the
  `skill-trigger-collision` test (CI green), so this is a **quality pass** (trigger
  front-loading in the first ~100 chars, near-miss routing per `write-skill`), not
  a structural fix. Do not "fix" descriptions the guard already accepts.
- Root `AGENTS.md` mentions `node scripts/ci.mjs` only in prose ("Tool-agnostic
  rules", line ~77), not as an early, explicit commands block. The research
  ("agents.md lessons") wants executable commands early.

Decisions (pre-resolved so this is execution-ready, not blocked on questions):
- **All-caps reframe = guidance only.** Keep safety/enforcement imperatives (e.g.
  data-preservation, "never force-push", approval gates) emphatic; the skill
  scorer rewards `<constraint>` blocks, so reframing must not delete them.
- **Classification test (documents how the `## Notes` verdict was derived).** The
  baked keep/reframe verdict in `## Notes` is **authoritative**; these branches only
  record its derivation. On an undrifted HEAD (the normal case) step 1 re-confirms the
  `## Notes` table and does **not** re-run the branches. On drift, re-derive via the
  full **6-category KEEP taxonomy in `## Notes`** (mentions/phenomenon · defined-labels
  · approval gates · verification/anti-hallucination · operational/structural-correctness
  · out-of-scope) — the 3 branches alone omit the operational/structural-correctness and
  out-of-scope categories and so cannot reproduce |K| = 32. For each occurrence the
  branches decide KEEP-verbatim vs REFRAME, in this order:
  1. **Mention or defined-label, not a live order** — leave verbatim if the token
     is (a) a *quoted example* / BAD-GOOD illustration / a sentence or table row
     *describing* the caps-emphasis phenomenon, or (b) a **defined-term label** in
     a taxonomy. Verified sites to exclude up front: `capability-tuning/SKILL.md:122`
     (BAD example block), `:142` (the "4.6+ overtriggers on MUST/CRITICAL" row),
     `write-skill/SKILL.md:151` (the "caps is the yellow flag" teaching line); and
     the `MUST FIX`/`SHOULD FIX` severity labels at `refactor/SKILL.md:83` and
     `refactor/references/pre-verifier.md:6,17,18,23`.
  2. **Load-bearing imperative — KEEP emphatic** if it (a) sits in a `<constraint>`
     block, (b) names a destructive/irreversible or gated action (data loss,
     `force-push`/`hard reset`/branch delete, an approval/safety gate, a security
     invariant), (c) asserts a **verification / anti-hallucination discipline** (an
     assertion about having read/run/cited evidence before claiming — e.g.
     `plan-review.md:49-51`, `plan-review/SKILL.md:194-196`, `code-review/SKILL.md:14`,
     `human-docs-workflow/SKILL.md:14`, `fix-workflow/SKILL.md:18`), **OR (d) is an
     operational / structural-correctness gate** in an executable pipeline procedure
     (no-op/idempotency, ordering, parse, or cross-reference integrity — e.g.
     `conflict-resolution:78`, `content-auditor:59`, `categorizer:10`,
     `per-tool-catalog:17`, `verifier:29/33`, `role-mapper:8`, `agents-builder:29`,
     `tdd-workflow:14`). **Precedence:** the `## Notes` REFRAME list wins over 2(a) — a
     *domain-correctness* MUST that happens to sit in a `<constraint>` block is still
     REFRAMEd (caps softened; the `<constraint>` structure itself stays).
  3. **Guidance + domain-correctness — REFRAME** to "state the rule, then the why"
     (resolved q1: **Moderate**): the 1 guidance occurrence
     (`fix-workflow/references/feedback-loops.md:28`) **plus** the domain-correctness
     MUSTs (`design-tokenization:18/:22`, `react-component-patterns/references/effects.md:47`,
     `dep-vuln-workflow:118`, `multi-tool-bridge/…:112`) — soften the caps while
     preserving each rule and its existing *why*. 7 occurrences total (see `## Notes`).
  Applies to both `SKILL.md` bodies and `references/` files (39 occurrences / 36 lines).
- **Reframe scope = Moderate (resolved q1).** The pre-computed classification
  (`## Notes`) is **|K| = 32 keep / 7 reframe**; the kit already follows rule+why,
  so clause 1 is a small enumerated edit, not a 39-wide sweep.
- **Codex commands block = yes, but minimal** (`corepack enable && pnpm install
  --frozen-lockfile`, then `node scripts/ci.mjs`). Heeds the Gloaguen et al.
  finding that context files can *reduce* agent success and raise cost >20%, so
  keep it to the commands an agent would otherwise get wrong, and no more. (The
  finding, not its citation ID, backs this — the arXiv number is unverified
  offline; do not put a specific ID in shipped text without confirming it.)
- **RTK hook enforcement is OUT OF SCOPE** — RTK config lives in
  `DocksDocks/public`, not this repo (root `AGENTS.md`, "What does NOT belong").

## Environment & how-to-run

- Runtime: Node `22.x`, pnpm `11.5.1` via `corepack`.
- Install: `corepack enable && pnpm install --frozen-lockfile`
- Gate (green before commit): `node scripts/ci.mjs`
- After any SKILL.md body / `references/` change: `node scripts/skills/content-hash.mjs --backfill` (then re-run CI's idempotency check).
- Score a skill: `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file`
- Score agents: `node scripts/agents/score.mjs --per-file`
- Revert a bad reframe: `git restore <file>` then re-run
  `node scripts/skills/content-hash.mjs --backfill` to resync the hash.

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | Re-confirm the pre-computed keep/reframe verdict in `## Notes` (|K| = 32 keep / 7 reframe) against HEAD: run the enumerate grep recorded in `## Notes` (expect 39 occ / 36 lines) and check each listed `file:line` still matches; if HEAD drifted, re-derive via the 6-category KEEP taxonomy in `## Notes` (which is authoritative over the 3 branches). `plan-init/…/plans-agents-md-template.md:251` stays KEEP-by-scope | `plugins/docks/skills/**/{SKILL.md,references/*.md}`, `plugins/docks/agents/*.md` | — | done |
| 2 | Apply the guidance reframes; bump `metadata.updated` + `content-hash --backfill` on every touched skill | touched `SKILL.md` + frontmatter | 1 | done |
| 3 | Quality-audit each skill/agent description (trigger in first ~100 chars, near-miss routing per `write-skill`, ≤1536-char listing); record a verdict table (each description → keep/tighten) under this plan's `## Notes`, then apply the tightenings | descriptions in frontmatter; this plan's `## Notes` | — | planned |
| 4 | Add a minimal hand-written build/test/lint commands block early in root `AGENTS.md` (install + `node scripts/ci.mjs`) | `AGENTS.md` | — | planned |
| 5 | Document the Claude-A/Claude-B fresh-instance test as standing QA for plan/skill authoring; bump `write-skill`'s `metadata.updated` (mirrors step 2) | `plugins/docks/skills/productivity/write-skill/SKILL.md` | — | planned |
| 6 | Re-run `node scripts/skills/content-hash.mjs --backfill` first (covers every body edit, incl. step 5's write-skill change); then `node scripts/ci.mjs` green; per-file scores hold; self-review; commit | all touched | 2,3,4,5 | planned |

## Interfaces & data shapes

No code interfaces — this is authoring/wording. The relevant invariants the steps
must not break:

- Skill per-file score floors (`scripts/config/scoring.json`): engineering 10,
  productivity 8; agents 14. Reframing must not drop a skill below its floor
  (the scorer rewards `<constraint>` blocks, BAD/GOOD, tables — don't delete them).
- `metadata.content_hash` = hash of body + `references/`; any body edit needs a
  matching `metadata.updated` bump + `--backfill` or CI's idempotency check fails.
- Description hard cap 1,024 chars; listing truncates at 1,536; "Use when" prefix
  required (guard) — the audit tightens within these, never violates them.

## Acceptance criteria

- `node scripts/ci.mjs; echo $?` → `✔ All ci.mjs checks passed`, exit `0`
  (guards, trigger-collision, per-file score floors, content-hash idempotency).
- Reframe applied without floor regressions:
  `node plugins/docks/skills/productivity/write-skill/scripts/skill-guard.mjs score --per-file`
  → every skill ≥ its category floor; `node scripts/agents/score.mjs --per-file` → each ≥ 14.
- Guidance imperatives actually reframed (independently verifiable, not a tautology):
  after step 2, `grep -rEo '\b(MUST|ALWAYS|NEVER)\b' plugins/docks/skills plugins/docks/agents | wc -l`
  → **32** (= |K|; the 7-occurrence reframe set in `## Notes` is lower-cased, so it
  drops from the case-sensitive count), strictly `< 39`. Each of the 7 reframe
  `file:line`s no longer matches `\b(MUST|ALWAYS|NEVER)\b`; each of the 32 keep
  occurrences still does (re-grep each).
- Step 3 audit ran (fails pre-impl, passes after): step 3 appends a verdict table
  under `## Notes` with one `| <name> | keep | <note> |` (or `tighten`) row per
  description.
  `grep -cE '^\| [^|]+ \| (keep|tighten) \|' docs/plans/active/cold-handoff-contract-stage4.md`
  → `≥` the skill + agent count (returns `0` on the untouched plan, so it cannot
  self-pass); each `tighten` row has a matching frontmatter diff.
- Codex commands block present — `pnpm install --frozen-lockfile` is **absent
  from `AGENTS.md` today**, so a match proves step 4 ran:
  `grep -nE 'corepack enable|pnpm install --frozen-lockfile' AGENTS.md` → matches,
  and the matched line number precedes the `## Repository scope` heading
  (`grep -n '## Repository scope' AGENTS.md`) — i.e. the block is early.
- Claude-A/B method documented: `grep -rl -i 'fresh-instance\|Claude A.*Claude B\|fresh-context' plugins/docks/skills/productivity/write-skill/SKILL.md` → matches.

## Out of scope / do-NOT-touch

- **RTK hook enforcement / consumer settings** — RTK config lives in
  `DocksDocks/public` (root `AGENTS.md`); never add it here.
- **Loosening any validator floor** to make a reframed file pass — fix the file.
- **The plan contract itself** (`docs/plans/AGENTS.md` + the plan-init template
  `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md`,
  incl. its `:251` `MUST render` line) — Stages 1–3 shipped in `cold-handoff-contract`;
  this plan does not re-touch it. Step 1's grep surfaces `:251`; classify it KEEP-by-scope.
- **`finished/` archive** and the shipped `cold-handoff-contract` plan.
- **Instruction-budget measurement** (the "~150–200 instructions" tuning) — needs
  real session traces; a separate, measured effort, not this wording sweep.

## Known gotchas

- A blanket find/replace of `MUST/ALWAYS/NEVER` would gut load-bearing
  `<constraint>` blocks and tank skill scores — classify first (step 1), then edit.
- Editing a skill body without bumping `metadata.updated` + `--backfill` breaks
  the content-hash idempotency check (silent until CI).
- The Gloaguen finding means "more context" can hurt — the Codex block stays
  minimal; resist the urge to document everything in root `AGENTS.md`.
- Some descriptions are double-quoted scalars (`description: "Use when…"` —
  caveman, scaffold, write-skill, zoom-out, capability-tuning, context-tree, …);
  "audit" means reading the parsed YAML value, not grepping
  `^description: Use when` (which misses every quoted form).

## Global constraints

- `node scripts/ci.mjs` exits 0 before any commit (`scripts/AGENTS.md`).
- Per-file floors: engineering 10 / productivity 8 / agents 14 (`scripts/config/scoring.json`).
- Skill body sweet spot 80–310 lines, hard cap 500.
- Develop on a dedicated branch off `main` named `cold-handoff-contract-stage4`; no plugin version bump in prose.

## STOP conditions

- If a reframed skill/agent drops below its category floor and restoring its
  `<constraint>` / BAD-GOOD / table structure does **not** recover the score,
  STOP and report — do not pad filler or delete a `<constraint>` to pass.
- If an imperative is genuinely ambiguous after the Classification test (neither
  clearly safety nor clearly guidance), leave it emphatic and note it — do not
  guess-reframe a possibly load-bearing rule.
- If the step-4 commands block would need to grow beyond install + CI to be
  correct, STOP and reconsider scope — the Gloaguen finding caps it; don't bloat
  root `AGENTS.md`.

## Cold-handoff checklist

1. **File manifest** — present: Steps `Files` column + `affected_paths` (dir-level where the sweep spans many files; step 1 narrows to a concrete list before edits).
2. **Environment & commands** — present: `## Environment & how-to-run`.
3. **Interface & data contracts** — present: `## Interfaces & data shapes` (score floors, hash rule, description caps).
4. **Executable acceptance** — present: `## Acceptance criteria` are commands + expected output.
5. **Out of scope** — present: `## Out of scope / do-NOT-touch`.
6. **Decision rationale** — present: `## Context & rationale` pre-resolves the classification (mention/label · verification-discipline · guidance + domain-correctness) and commands-block scope; q1 (reframe boundary) resolved = **Moderate**, full keep/reframe verdict in `## Notes`.
7. **Known gotchas** — present: `## Known gotchas`.
8. **Global constraints verbatim** — present: `## Global constraints`.
9. **No undefined terms / forward refs** — present: every file/command/threshold named resolves; no `TBD`.

Adversarial cold-read: an executor can run step 1 (enumerate via the grep given),
classify by the three-branch Classification test (mention / load-bearing /
guidance, with the trap sites pre-named), edit, and verify via the acceptance
commands. Step 3's judgment ("which descriptions are weak") is bounded by the
`write-skill` near-miss procedure AND made verifiable by the recorded audit table
— not an open guess.

## Self-review

Fresh-context, multi-lens scored review (replacing the author's optimistic 96/100),
iterated over four rounds: **81** (original draft) → **86** (first fix round) →
**84** (second round — fixes closed the original holes but a deeper empirical pass
exposed clause 1 as largely cosmetic and two fixes as self-defeating) → **89**
(round 4, post-q1-resolution; the two round-3 holes verified closed by simulation).
Per-dimension at the round-4 measurement (89/100); "(since)" marks the round-4
residuals applied afterward:

- Standalone executability 18/22 — full cold-handoff content, verified; primary path
  deterministic (re-confirm the baked |K|=32/7 table; HEAD == planned base, no drift).
  −4: the drift-fallback (3-branch test) diverged from the baked verdict in both
  directions. *(since: `## Notes` made authoritative; drift re-derivation routed to the
  6-category taxonomy; branch 2 gained an operational/structural category + a
  REFRAME-precedence note; step-1 grep un-escaped.)*
- Actionability 15/16 — steps crisp; step-3 false-pass fixed (counts verdict rows). −1:
  step 3 keeps bounded judgment + a self-computed threshold.
- Dependency order 12/12 — DAG acyclic; step 6 backfills first, then CI.
- Evidence re-verify 9/10 — every cited `file:line` re-confirmed at HEAD; the 7 reframe
  sites uppercase, the 39/36 counts reproduce. −1: a few KEEPs were mis-bucketed under
  "verification". *(since: re-bucketed into operational/structural-correctness.)*
- Goal coverage 10/12 — all four clauses mapped; q1=Moderate makes clause 1 a concrete
  7-occurrence edit. −2: 6 of 7 targets already carry their why, so clause 1 is mostly
  cosmetic `MUST`→`must` lowercasing. *(since: Goal reworded to match.)*
- Executable acceptance 11/12 — reframe-count concrete (`wc -l → 32`, <39); step-3 grep
  returns 0 on the untouched plan. −1: step-3 threshold is "≥ skill+agent count".
- Failure mode 9/10 — per-file revert + 3 STOP conditions. −1: no batch rollback.
- Assumption→question 5/6 — q1 surfaced/resolved/baked, ## Open questions removed. −1:
  the constraint-block-domain-MUST precedence was baked silently. *(since: noted in branch 2.)*

`Score: 89/100 · trajectory 81→86→84→89 · stopped: above the 85 bar at round 4 (honesty-critic confirmed, adjustment 0); the round-4 MEDIUM residuals (drift-fallback divergence, KEEP mis-bucketing, clause-1 wording) applied since the measurement; formal re-score loop halted at round 4 by maintainer discretion — diminishing returns, primary execution path deterministic and acceptance-verified, the residual divergence was drift-fallback-only and does not fire on the current un-drifted HEAD`

## Review

(filled by plan-review on completion)

## Notes

### Step-1 keep/reframe verdict — pre-computed this session at `planned_at_commit`

Enumerated via `grep -rnoE '\b(MUST|ALWAYS|NEVER)\b' plugins/docks/skills plugins/docks/agents`
= **39 occurrences / 36 lines**. Scope = **Moderate** (resolved q1). Re-confirm
against HEAD before step 2.

**Step-1 re-confirmation — DONE** (branch `cold-handoff-contract-stage4`, HEAD
`18444a8`): drift check `git diff 463a3fb..HEAD -- plugins/docks/skills plugins/docks/agents`
is empty (skills/agents unchanged since `planned_at_commit`); `grep -rEo … | wc -l`
= 39 occ / 36 lines; all 7 reframe tokens present at their recorded lines
(`design-tokenization:22` carries 2 `NEVER`); `template:251`'s `MUST` intact
(KEEP-by-scope). The baked |K| = 32 / 7 verdict stands — proceed to step 2.

**REFRAME — 7 occurrences / 6 lines** (soften the caps, keep the rule + its why):

| file:line | token(s) | reframe |
|---|---|---|
| `fix-workflow/references/feedback-loops.md:28` | MUST | "if a human MUST click" → "if a human has to click" |
| `design-tokenization/SKILL.md:18` | MUST | "MUST also be defined in `.dark`" → "must also …" |
| `design-tokenization/SKILL.md:22` | NEVER ×2 | "must NEVER be used / carry" → "must never …" |
| `react-component-patterns/references/effects.md:47` | MUST | "MUST match exactly one" → "must match …" |
| `dep-vuln-workflow/SKILL.md:118` | MUST | "MUST be committed" → "must be committed" |
| `multi-tool-bridge/references/claude-md-classification.md:112` | MUST | "the import MUST be" → "must be" |

**KEEP — |K| = 32 occurrences** (by category):

- *Mentions / phenomenon* (4): `write-skill:151` (ALWAYS+NEVER), `capability-tuning:122`, `:142`.
- *Defined-term labels* `MUST FIX`/`SHOULD FIX` (5): `refactor:83`, `pre-verifier:6,17,18,23`.
- *Approval gates* (2): `scaffold:20`, `context-tree:24`.
- *Verification / anti-hallucination — evidence-before-claiming* (9): `plan-review/SKILL.md:194-196`, `plan-review.md:49-51`, `code-review:14`, `human-docs-workflow:14`, `fix-workflow:18`.
- *Operational / structural-correctness gates — kept emphatic* (11): `tdd-workflow:14` (MUST NOT ×2, ordering), `context-tree/references/conflict-resolution:78` (no-op/idempotency), `skill-agent-pipeline/references/{content-auditor:59, skills-builder:57, verifier:29, verifier:33, role-mapper:8, agents-builder:29, categorizer:10}` (parse / cross-ref integrity), `lint-no-suppressions/references/per-tool-catalog:17` (suppression-reason rule). Domain/pipeline-correctness, **not** evidence-before-claiming — kept because they enforce executable-procedure integrity, distinct from the reframed-6 user-facing teaching MUSTs.
- *Out-of-scope, KEEP-by-scope* (1): `plan-init/references/plans-agents-md-template:251`.

After step 2: `grep -rEo … | wc -l` → **32** (each reframed token lower-cased).

### Per-description verdicts (step 3)

(Recorded here at execution time — one `| <name> | keep | <note> |` (or `tighten`)
row per skill/agent description; the acceptance criterion counts these rows.)

## Sources

- `docs/plans/finished/2026-06-26-cold-handoff-contract.md` — parent plan; its Out-of-scope deferred exactly this Stage 4.
- Uploaded research artifact "Closing the Cold-Handoff Gap in `DocksDocks/docks`", §6–§7 (kit-wide + Codex) and Recommendations Stage 4.
- `AGENTS.md` (root) line ~77 — `node scripts/ci.mjs` mentioned in prose, not an early commands block; "What does NOT belong" — RTK config is in DocksDocks/public.
- `scripts/config/scoring.json` — per-file floors (engineering 10, productivity 8, agents 14).
- `plugins/docks/hooks/` — `context-tree-nudge.mjs` + `hooks.json` (the repo's only hook surface).
