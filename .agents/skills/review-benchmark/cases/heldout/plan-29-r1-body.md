<!-- plan-contract: v3 -->

## Goal

Reword the phase 6 sentence about committing before a terminal review block in docs/PLAN.md and the workspace template so it unambiguously names the blocked stop rather than the posted review record, and pin the corrected wording in the phase tests

Mode: plan-and-implement

## Research

- The defective sentence is "Before any terminal review block, commit and normally push all current work to the linked plan branch." It sits in the phase 6 item at docs/PLAN.md:368 and plan-md-template.md:372, a byte-identical pair.
- The same numbered item uses "block" both ways: "Post each reviewer block as one issue comment" (markdown record) and "a technical block" (lifecycle stop). "Terminal review block" therefore admits two parses. The markdown-record parse contradicts docs/PLAN.md:417, which commits reviewed bytes only after `Code-review: pass`. The lifecycle-block parse is redundant with the normative paragraph at docs/PLAN.md:356-359, which already requires commit and normal push before recording the blocker.
- The ambiguity is load-bearing: in one session, two enforcement passes read it opposite ways, one forcing a redundant post-push re-review of byte-identical content, the other forbidding pre-pass commits.
- plan-contract.md carries only the unambiguous blocked-path sentence (220-222) and never the phase 6 phrasing; it needs no change. The plan-manager SKILL does not carry the phrase.
- No test pins the sentence, which is how it drifted unnoticed. The fix adds a plan-skill-phases.mjs pin asserting the corrected sentence in both files and the absence of the old phrase.
- Chosen wording: "Before recording a technical block or terminal repair failure, commit and normally push all current work to the linked plan branch." This names the two stop conditions exactly as the normative paragraph does and reuses no ambiguous noun.
- The sentence entered with plan #22 and is unreleased: the last tag is plan-lifecycle--v0.7.0, which predates it. Landing this fix before the 0.8.0 release means the defect never ships to consumers. The release itself is a separate action outside this plan.
- docs/PLAN.md must stay byte-identical to the template's terminal fenced block; selftest and the phase tests assert this, so both files change in lockstep. No SKILL.md body changes, so no content-hash re-sync is needed.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when |
|---:|---|---|---|---|---|---|---|
| 1 | reword | Replace the ambiguous phase 6 sentence with the chosen wording in both byte-identical files | docs/PLAN.md, plugins/plan-lifecycle/skills/productivity/plan-workspace/references/plan-md-template.md | - | `local` | `planned` | Both files carry the corrected sentence, remain byte-identical in the fenced body, and contain no occurrence of "terminal review block" |
| 2 | pin | Assert the corrected sentence in both files and refuse the old phrase | scripts/tests/plan-skill-phases.mjs | 1 | `local` | `planned` | `node scripts/tests/plan-skill-phases.mjs` exits 0 and fails if either file reverts to "terminal review block" |
| 3 | gate | Run the plugin and full gates | docs/PLAN.md | 1, 2 | `local` | `planned` | `node scripts/ci.mjs --plugin plan-lifecycle` and full `node scripts/ci.mjs` exit 0 |

## Acceptance

| ID | Command | Expected |
|---|---|---|
| A1 | `node scripts/tests/plan-skill-phases.mjs` | Exit 0 with the corrected-sentence pin |
| A2 | `node plugins/plan-lifecycle/test/selftest.mjs` | Exit 0; template and docs/PLAN.md stay synchronized |
| A3 | `node scripts/ci.mjs --plugin plan-lifecycle` | Exit 0; full `node scripts/ci.mjs` also exits 0 because docs/PLAN.md is outside the plugin root |

## Do not touch

- docs/PLAN.md:356-359 and plan-contract.md:220-222: the normative blocked-path rule is correct and stays
- docs/PLAN.md:417-419: the after-pass landing rule is correct and stays
- `docs/plans/finished/` - frozen history

## Open questions

None

## Review

_Review records are stored in issue comments._

## Verification Results

_Not implemented yet._
