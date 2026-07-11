---
title: Cross-company dual plan review (strong default, availability-aware) + orchestrator doctrine
goal: Make dual independent plan review a strong, availability-aware default via read-only portable CLIs, canonical receipts, and model-agnostic orchestration overridable by runtime-global guidance.
status: planned
created: "2026-07-11T14:44:27-03:00"
updated: "2026-07-11T15:34:17-03:00"
started_at: null
assignee: null
tags: [plan-lifecycle, skills, review-policy, session-relay]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-review/SKILL.md
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - scripts/tests/plan-review-policy.mjs
related_plans: []
review_status: null
planned_at_commit: "9e0bd6ab69bffc565a240139cb598af120b3bec9"
---

# Cross-company dual plan review (strong default, availability-aware) + orchestrator doctrine

## Goal

Promote independent plan review from the current *optional, single, picker-gated* cross-tool second opinion to a **strong, availability-aware default**: every plan drafted with plan-manager is red-teamed, before execution, by **(a) the best available model of the OTHER company** and **(b) a second independent instance of the author's own model** — both read-only, findings-only, reconciled by the orchestrator. It is a **strong default, not a hard block** (waivable per-plan; degrades gracefully by availability so a single-subscription user is never blocked), and it runs on a **portable CLI baseline** (`codex exec -s read-only` / `claude -p --permission-mode plan`) with session-relay as an optional async optimization — docks plan-lifecycle must not hard-depend on a separate plugin. Success = the plans contract + its plan-init template + the three skills encode author identity, policy precedence, an ordered model-tier resolver, deterministic degradation/waiver outcomes, canonical draft/completion receipts, sole-writer ownership, and two-reviewer attribution — self-demonstrated by this plan carrying a current-input X receipt plus a successful or explicitly degraded S result.

## Context & rationale

Verbatim user decisions (2026-07-11, via picker + prompt):
- **Enforcement = strong default, availability-aware.** "strong default, but of course when available right? some people don't have double subscription." → NOT a hard block; runs when the model is available; a user with only one company's subscription runs the same-company leg as their independent review, never blocked.
- **Scope = every plan (default posture).** "Every plan, no exceptions." → the review applies to every plan by default; the strong-default waiver + availability degradation (not a stub carve-out) provide proportionality, so a genuinely trivial stub or a single-subscription run naturally executes fewer/zero paid legs.
- **Doctrine home = in the skill, global-overridable.** "in the skill itself and by global settings it can be overwritten maybe?" → ship model-AGNOSTIC orchestrator doctrine in the skill; concrete model preference (e.g. gpt-5.6-sol default) lives in global config and overrides the skill default.
- **Cross-company consent = standing authorized for this user.** "i always approve cross-review company, dont need to ask that" → a runtime/global `always` authorization suppresses Docks' own consent picker for cross-company review. This standing consent does **not** bypass a host/platform security denial; a denied launch is recorded as a degraded leg with the exact reason, never retried through an alternate export path.
- **Author intent (prompt):** gpt-5.6-sol is the strongest reasoner and avoids Claude's `claude -p --resume` cache-miss on wakes, so it is a sensible default orchestrator run as the *interactive* (cache-warm) session; the orchestrator picks per task between an in-session subagent (this project) and a relay worker (other project/tool/durable). A plan authored by one company's model is reviewed by the other company's best (author gpt-5.6-sol → Claude `fable` high / `opus` xhigh; author Claude → gpt-5.6-sol xhigh) plus a same-company second instance.

Why: the mechanical pieces already exist (one-shot reviewer legs, the red-team pair); this makes independent review the default while staying portable and cost-aware. Cross-company diversity catches blind spots a model family shares; the same-company second instance is the independent leg when only one company is available and a tie-breaker otherwise.

## Environment & how-to-run

- Node 24 + pnpm (`corepack enable && pnpm install --frozen-lockfile`). Validators: `node scripts/ci.mjs`. After any SKILL.md edit, refresh `metadata.updated` + `content_hash` (ci.mjs enforces the hash) and keep bodies ≤500 lines.
- **Portable review baseline (no plugin dependency):** Codex = `codex exec -s read-only -m gpt-5.6-sol -c model_reasoning_effort=xhigh -- "<fixed rubric + immutable plan commit/path>"`; Claude = `claude -p --permission-mode plan --model <fable|opus> --effort <high|xhigh> --output-format json -- "<same fixed rubric + immutable plan commit/path>"`. Never use `--resume`; every leg is a fresh context. GNU hosts may wrap with `timeout 600`; on hosts without GNU `timeout`, the orchestrating runtime must set its process/tool timeout to 600 seconds and record that enforcement in the receipt.
- **Availability probes:** Codex: `command -v codex` then `codex login status`; Claude: `command -v claude` then `claude auth status`. Model availability is attempt-as-probe in the ordered tier list; `unknown model`/entitlement failures fall through once to the next listed model without counting as the leg's retry.
- **Optional relay optimization:** when session-relay is installed, use `relay spawn <dir> --tool <tool> --model <model> --effort <effort> --read-only --watch --reply-to <explicit-id> --timeout 600 -- "<task>"`; capture the returned child id, drain only the explicit reply mailbox, and accept findings only when the message names that child id plus the immutable review-input hash. Bare birth registration is never completion.
- **Immutable draft order:** plan-manager first writes and auto-commits the candidate draft; `reviewed_commit=$(git rev-parse HEAD)` is then fixed for both legs. Reviewers read the plan and cited affected paths from that commit (`git show <reviewed_commit>:<path>`), never a moving worktree. If accepted findings change canonical review input, plan-manager commits the revision and repeats both legs; only a no-input-change pass can mint the reusable receipt.
- **Product policy vs host policy:** resolve the `ReviewPolicyInput` below from the already-loaded user/runtime-global instruction context; skills do not read a new env var or consumer config file. Host sandbox/export policy remains an outer gate. An explicit host denial is `platform_denied`; it is never retried through another transport. An ambiguous launch failure is `unavailable_unknown`, never guessed to be policy denial.

## Interfaces & data shapes

- **Author identity (new base plan frontmatter, captured at draft creation):** `review_author_company: openai | anthropic | unknown`, `review_author_tool: <string>`, `review_author_model: <string>`, `review_author_effort: <string>`. A legacy/unknown company triggers one picker before first review and is then persisted; X = other company, S = a second instance of the persisted company.
- **Resolved policy input (logical input supplied by the orchestrator after normal instruction precedence):** `{ cross_company_consent: always | ask | never, zero_reviewer_policy: ask | proceed | block, orchestrator_preference: auto | in_session | relay, source: current_user | runtime_global | skill_default }`. Defaults are `ask`, `ask`, `auto`, `skill_default`. `cross_company_consent=always` suppresses only the X-leg export-consent picker; it never authorizes proceeding with zero reviewers. A current-turn user instruction overrides runtime-global guidance, which overrides skill defaults.
- **Ordered model-tier resolver (dated 2026-07; skill text says "check the current tier list"):**
  - OpenAI best: `gpt-5.6-sol` effort `xhigh`.
  - Claude best: try `fable` effort `high`; if unavailable, `opus` effort `xhigh`. (Deterministic order + per-model availability probe; fall through on probe failure.)
- **Leg result enum:** `passed | waived | unavailable_auth | unavailable_model | timed_out | platform_denied | failed_unparseable | unavailable_unknown`. Capture exact command/tool outcome + exit/status evidence. Retry at most once only for a transient launch/transport failure; never retry auth/model/policy/waiver/unparseable outcomes through a different transport.
- **Two-reviewer attribution grammar (extends `docs/plans/AGENTS.md`), leg-namespaced IDs, reasons preserved:**
  ```markdown
  Cross-check (<date>): [X: <company-B> <model> <effort>] N findings (sev) — accepted X<ids> / rejected X<ids> (one-line reason each); [S: <company-A second> <model> <effort>] M findings — accepted S<ids> / rejected S<ids> (reason each); [<author>] independently verified <X/S ids> against source before accepting.
  DISAGREEMENT: <topic> — [X<id>] <pos> / [S<id>] <pos>. Kept: <choice> — decided by <orchestrator|user via picker>, because <one line>.
  ```
- **Availability-degradation matrix (strong default, never a subscription hard block):** both passed → dual review; one passed → record the other exact outcome and proceed; zero passed → apply `zero_reviewer_policy` (`ask` = picker, `proceed` = surfaced degraded receipt, `block` = remain planned). `cross_company_consent=never` waives X only; it never suppresses S. A single-subscription user therefore proceeds with the available independent leg, while a host denial is visible and never bypassed.
- **Per-plan waiver (new frontmatter):** `review_waiver: null | { legs: [X | S], actor: <string>, reason: <non-empty string>, at: <ISO datetime> }`. plan-manager writes it only from an explicit current-user decision, includes it as `waived` in the receipt, and never infers it from missing auth or global consent.
- **Canonical draft receipt:** canonicalize UTF-8/LF plan content by removing mutable frontmatter keys (`status`, `updated`, `started_at`, `assignee`, `review_status`, `in_review_since`, `ship_commit`) and the complete `## Self-review`/`## Review` sections, then retain exactly one terminal newline and SHA-256 the bytes. Store one line inside `## Self-review`: `Review-receipt: input_sha256=<64hex> reviewed_commit=<40hex> author=<company>/<tool>/<model>/<effort> X=<result,model,effort,count> S=<result,model,effort,count> outcome=<dual|single|zero-degraded|blocked> reviewed_at=<ISO>`. Because receipt/self-review and lifecycle timestamps are excluded, ingestion and `start` do not self-invalidate; any goal/context/interface/step/acceptance change does.
- **Dispatch ownership:** plan-manager is the sole lifecycle orchestrator and plan writer. plan-review owns the fixed draft/completion rubrics, leg command builders, result parsing, and per-finding reproduction, but never launches a second duplicate pair when invoked by plan-manager. Both results are collected before reconciliation; plan-manager alone edits `## Self-review`.
- **Completion receipt:** completion review always runs by default and keys freshness to `(planned_at_commit, HEAD, sha256(diff --binary <planned_at_commit>..HEAD -- <affected_paths>))`. Any explicit completion waiver uses the same waiver grammar; there is no subjective "risk warrants" shortcut.

## Steps

| # | Task | Files | Depends | Status | Done condition / revert trigger |
|---|---|---|---|---|---|
| 1 | Define the strong-default dual-review contract in the cross-tool source of truth: author fields, resolved policy input, immutable review order, model resolver, result enum, degradation/waiver matrix, canonical draft + completion receipts, sole-writer ownership, and X#/S# attribution. Portable CLI baseline is normative; relay stays optional. | `docs/plans/AGENTS.md` | — | planned | A1/A3/A4 contract assertions pass. Revert if consent can authorize zero-review progression, a receipt self-invalidates, or either leg can inherit write permission. |
| 2 | Mirror the complete normative contract into the plan-init template so newly seeded projects receive byte-equivalent semantics. | `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md` | 1 | planned | A1 parity passes with zero semantic omissions. Revert if template defaults/schema differ from the source contract. |
| 3 | Update plan-manager as sole orchestrator/writer: commit immutable draft, capture author identity, resolve policy input, run/collect both legs once, iterate changed drafts, persist waiver/receipt, reuse only matching receipts at `start`, and apply zero-review policy. Refresh hash. | `plugins/docks/skills/productivity/plan-manager/SKILL.md` | 1 | planned | A4 simulations cover dual/single/zero, consent, waiver, changed-input rerun, and no duplicate dispatch. Revert if plan-manager can advance before both terminal outcomes arrive. |
| 4 | Update plan-review with fixed draft/completion rubrics, exact read-only CLI shapes, 600-second enforcement, tier/result classification, immutable-commit inputs, parsing, and per-finding reproduction. When called by plan-manager it returns results and never launches a duplicate pair or writes the plan. Refresh hash. | `plugins/docks/skills/productivity/plan-review/SKILL.md` | 1 | planned | A3/A4 prove Claude uses `--permission-mode plan`, Codex uses `-s read-only`, ambiguous failures stay unknown, and completion key is deterministic. Revert on any write-capable reviewer path. |
| 5 | Update session-relay's red-team pattern and model-agnostic orchestrator doctrine: explicit read-only/pinned spawn, child-id + input-hash-bound reply, in-session vs relay selection, and instruction-context overrides via `ReviewPolicyInput` (no new consumer env/config contract). Refresh hash. | `plugins/session-relay/skills/productivity/session-relay/SKILL.md` | 1 | planned | A3/A4 prove relay is optional and never treats birth registration as findings completion. Revert if docks plan lifecycle becomes dependent on session-relay. |
| 6 | Add an author-side executable contract test that parses the contract/template/skills and simulates author resolution, policy precedence, result classification, canonical hash stability/invalidation, receipt reuse, waiver, degradation, and completion keys. | `scripts/tests/plan-review-policy.mjs` | 1-5 | planned | `node scripts/tests/plan-review-policy.mjs` exits 0 with named PASS rows; fixtures fail when one required token/field/transition is removed. Revert if the test merely greps alternatives or duplicates production prose without behavioral assertions. |

## Acceptance criteria

| ID | Criterion | Command | Expected |
|---|---|---|---|
| A1 | Contract + template parity. | `node scripts/tests/plan-review-policy.mjs --case parity` | Exit 0; source and template carry the same author schema, policy input, trigger/order, result enum, degradation/waiver matrix, receipts, ownership, and attribution. |
| A2 | Skills gates green incl. hashes. | `node scripts/ci.mjs` | Exit 0; plan-manager/plan-review/session-relay skills pass CSO/frontmatter/≤500-line/`content_hash` gates. |
| A3 | Read-only, portability, classification, and consent separation are executable. | `node scripts/tests/plan-review-policy.mjs --case legs` | Exit 0; asserts Codex read-only and Claude plan-permission commands, GNU/non-GNU 600s enforcement, explicit result enum, `always` affects X consent only, zero-review policy remains independent, and platform denial is never transport-retried. |
| A4 | Receipt/ownership/degradation behavior is executable. | `node scripts/tests/plan-review-policy.mjs --case lifecycle` | Exit 0; canonical hash is stable across receipt/status timestamps but changes for goal/step/interface edits; both legs bind one immutable commit/hash; plan-manager is sole writer/dispatcher; dual/single/zero/waiver outcomes and completion triple-key behave exactly as specified. |
| A5 | Self-demonstration targets the final draft input. | `node scripts/tests/plan-review-policy.mjs --case self-demo docs/plans/active/cross-company-review-policy.md` | Exit 0; the plan has a current-input X receipt plus either an S receipt or exact degraded S outcome, with no stale Draft-2 receipt presented as current. |

## Out of scope / do-NOT-touch

- Consumer machine env vars, permissions, and a new Docks config file — those belong in DocksDocks/public, not this repo. This plan consumes already-loaded user/runtime-global instructions through the explicit `ReviewPolicyInput`; it does not make shipped skills read arbitrary machine files.
- One user's concrete model/cache preference — the shipped skill carries dated tier defaults plus the logical override input, not a hard-coded personal default.
- How plans are *executed* — only how they are *reviewed/selected*.
- No hard dependency of docks plan-lifecycle on the session-relay plugin; do not edit binaries, manifests, marketplace catalogs, versions, tags, or releases.

## Known gotchas

- Relay `spawn` returns at birth-registration, BEFORE findings exist — never advance the lifecycle on a bare spawn; require `--watch`+bus-reply or use the synchronous CLI leg.
- Two reviewer lists must namespace finding IDs (X#/S#) and preserve per-finding accept/reject reasons, or reconciliation is ambiguous.
- A receipt stored inside the plan can invalidate a naïve whole-file hash. Use the canonical exclusion algorithm exactly; any substantive section change still invalidates it.
- Product consent and host sandbox policy are different signals. `always` is not a sandbox override, and host denial is not permission to try a second export transport.
- Author company cannot be inferred reliably from the current executor after handoff; persist it when the draft is created and ask once for legacy/unknown plans.
- Ambient model/effort must never be inherited; pins are explicit and dated.
- `timeout 600` is GNU-specific; stock macOS must use the orchestrator's 600-second process/tool timeout and record that evidence.

## Global constraints

- Every plan is independently reviewed by default; availability may degrade the number of legs but never silently erases the receipt.
- Cross-company consent (`always | ask | never`) and zero-review progression (`ask | proceed | block`) are independent decisions.
- Both legs are read-only, findings-only, explicit-model, explicit-effort, fresh-context, and bound to the same immutable commit + canonical input hash.
- plan-manager is the sole lifecycle orchestrator and plan writer; plan-review supplies review mechanics and reproduction, not a competing writer.
- Session-relay is optional; the portable CLI path is normative.
- Host/platform security policy is authoritative and cannot be bypassed by skill text, a user-level receipt, or an alternate transport.
- Skills remain ≤500 lines with current `metadata.updated` + `content_hash`; validators/floors are never weakened.

## STOP conditions

- A reviewer command can write to the repo, inherits ambient permissions/model/effort, or reads a moving worktree instead of the immutable review input.
- Cross-company `always` suppresses the zero-review quality decision, or `never` suppresses the same-company leg.
- A receipt reuses after a goal/context/interface/step/acceptance edit, self-invalidates when only its own line/status timestamps change, or lacks exact author/X/S/outcome/time evidence.
- Both plan-manager and plan-review can launch/write the same lifecycle review, or lifecycle advances before both legs reach terminal outcomes.
- A platform denial is retried through another transport, an ambiguous failure is labeled `platform_denied`, or a single-subscription user is blocked despite one successful independent leg.
- The contract/template drift, the author-side test becomes a grep/count false positive, or a consumer-side setting/env var is added to this repo.

## Cold-handoff checklist

1. File manifest — six steps name exact paths, including template + executable contract test. ✅
2. Environment & commands — exact Codex/Claude read-only commands, auth/model probes, GNU/non-GNU timeout, immutable-commit and relay receipt flow. ✅
3. Interface/data contracts — author fields, `ReviewPolicyInput`, result enum, waiver, canonical draft/completion receipts, ownership, attribution. ✅
4. Executable acceptance — A1–A5 are commands with named expected behavior, not grep alternatives or prose assertions. ✅
5. Out of scope — no consumer env/config, execution change, plugin hard dependency, binaries, versions, or releases. ✅
6. Decision rationale — verbatim user decisions plus consent/quality/host-policy separation. ✅
7. Known gotchas — birth vs completion, self-invalidating hashes, handoff author identity, host denial, macOS timeout, ID namespacing. ✅
8. Global constraints — independent legs, read-only immutable input, sole writer, portability, host authority, skill/hash floors. ✅
9. No undefined/forward terms — every policy value, result, receipt field, hash exclusion, retry, owner, trigger, and fallback is defined. ✅

## Self-review

Score: **94/100** (Draft-4 candidate) · trajectory **86 claimed→55 verified (Draft-1)→88 claimed (Draft-2)→54 verified (Draft-3)→94 candidate (Draft-4)** · fresh X-leg re-review required before `start`.

**Draft-4 hardening (2026-07-11):** a fresh independent X-leg scored Draft-3 at 54/100 and returned 12 findings (7 high, 5 medium); all were independently reproduced and accepted. X1 split cross-company consent from zero-review progression. X2 replaced undefined machine-global config reads with an explicit logical `ReviewPolicyInput` resolved through normal instruction precedence. X3 pinned Claude `--permission-mode plan`. X4 defined a non-self-invalidating canonical hash and exact receipt grammar. X5 made plan-manager the sole launcher/writer over one committed immutable input. X6 added persisted author identity. X7 replaced false-positive/prose acceptance with an executable behavioral contract test. X8 defined portable timeout/auth/model probes and exact relay completion. X9 added a result enum/classifier. X10 defined per-plan waiver scope. X11 added done/revert conditions, Global constraints, STOP conditions, and a corrected checklist. X12 made completion freshness deterministic.

The user's standing cross-company consent is recorded as `cross_company_consent=always`; it suppresses only the product consent picker. The host auto-review layer denied the attempted external Claude S-leg twice, including after explicit user authorization, so the current S outcome is `platform_denied` and no alternate export transport was attempted. Because the current X-leg returned substantive findings and changed canonical input, its Draft-3 result is historical; Draft-4 must receive a new no-input-change X review before its receipt is current.

Historical Draft-2 cross-check (2026-07-11): [X: codex gpt-5.6-sol xhigh] 13 findings (6 high, 6 med, 1 low) — accepted X1–X6, X8–X13; X7 accepted-with-modification; rejected none. Key accepts: X2/X3 → portable CLI baseline, relay optional (no plugin hard-dep); X4 → full degradation matrix; X5 → plan-init template added to scope + parity acceptance; X6/X12 → Step 5 resolved as model-agnostic-in-skill + global override; X9 → review receipt; X10 → leg-namespaced attribution; X13 → ordered tier resolver. X1/X7 reconciled against the user's picker answers below. This receipt is not valid for Draft-4.
DISAGREEMENT: review scope — [X1: gpt-5.6-sol] tier by size (stubs local-only, dual only for big/risky) / [user via picker] every plan, no exceptions. Kept: **every-plan default** — decided by user; the reviewer's cost concern is addressed by the strong-default waiver + availability degradation + proportional same-company leg rather than a stub carve-out, so a trivial or single-subscription run still executes few/zero paid legs.

## Review

*(filled by plan-review on completion)*

## Sources

- `plugins/docks/skills/productivity/plan-manager/SKILL.md:42-62` — current OPTIONAL single cross-tool second opinion + pinned draft leg.
- `plugins/docks/skills/productivity/plan-review/SKILL.md:95-111` — one-shot reviewer legs (draft + completion), single reviewer.
- `plugins/session-relay/skills/productivity/session-relay/SKILL.md:383-398` — manual "Red-team pair spawn."
- `docs/plans/AGENTS.md` "Cross-tool second opinions" — attribution grammar this plan extends to two leg-namespaced reviewers.
- Cross-company review by policy-reviewer (gpt-5.6-sol xhigh), 2026-07-11 — 13 findings, verdict 55/100 on Draft-1; drove Draft-2.
