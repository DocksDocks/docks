---
title: Cross-company dual plan review (strong default, availability-aware) + orchestrator doctrine
goal: Make independent plan review a strong, availability-aware default across the plan lifecycle — a cross-company red-team plus a same-company second opinion — via a portable CLI baseline (relay optional), and add model-agnostic orchestrator-selection doctrine overridable by global config.
status: planned
created: "2026-07-11T14:44:27-03:00"
updated: "2026-07-11T15:26:14-03:00"
started_at: null
assignee: null
tags: [plan-lifecycle, skills, review-policy, session-relay]
affected_paths:
  - docs/plans/AGENTS.md
  - plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md
  - plugins/docks/skills/productivity/plan-manager/SKILL.md
  - plugins/docks/skills/productivity/plan-review/SKILL.md
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
related_plans: []
review_status: null
planned_at_commit: "9e0bd6ab69bffc565a240139cb598af120b3bec9"
---

# Cross-company dual plan review (strong default, availability-aware) + orchestrator doctrine

## Goal

Promote independent plan review from the current *optional, single, picker-gated* cross-tool second opinion to a **strong, availability-aware default**: every plan drafted with plan-manager is red-teamed, before execution, by **(a) the best available model of the OTHER company** and **(b) a second independent instance of the author's own model** — both read-only, findings-only, reconciled by the orchestrator. It is a **strong default, not a hard block** (waivable per-plan; degrades gracefully by availability so a single-subscription user is never blocked), and it runs on a **portable CLI baseline** (`codex exec -s read-only` / `claude -p`) with session-relay as an optional async optimization — docks plan-lifecycle must not hard-depend on a separate plugin. Success = the plans contract + its plan-init template + the three skills encode this with an ordered model-tier resolver, a complete availability-degradation matrix, a review receipt keyed by plan commit, and a two-reviewer attribution grammar — self-demonstrated by this plan having been cross-company reviewed.

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
- **Portable review baseline (no plugin dependency):** `timeout 600 codex exec -s read-only -m gpt-5.6-sol -c model_reasoning_effort=xhigh -- "<review task + plan path>"` (Codex leg) / `claude -p --resume`-free fresh `claude -p "<task>" --model <fable|opus> --effort <high|xhigh> --output-format json` (Claude leg). Availability probes: Codex = `command -v codex` && `codex login status` exit 0; Claude = `command -v claude` && a valid auth check.
- **Optional relay optimization:** when session-relay is installed, a reviewer may be dispatched async via `relay spawn … --read-only --watch --reply-to <me>` with a bounded wait on the bus reply; NEVER let the lifecycle advance before the findings message is received (use `--watch` or the synchronous CLI leg).
- **Consent/host-policy split:** resolve runtime/global review authorization as `always | ask | never` before any product-level picker (`always` = run without asking; `ask` = use the native picker; `never` = record the leg waived). Host sandbox/export policy is a separate outer gate. If it denies an otherwise authorized launch, record `platform-denied (<exact reason>)`, do not retry through a different transport, and follow the degradation matrix.

## Interfaces & data shapes

- **Ordered model-tier resolver (dated 2026-07; skill text says "check the current tier list"):**
  - OpenAI best: `gpt-5.6-sol` effort `xhigh`.
  - Claude best: try `fable` effort `high`; if unavailable, `opus` effort `xhigh`. (Deterministic order + per-model availability probe; fall through on probe failure.)
- **Two-reviewer attribution grammar (extends `docs/plans/AGENTS.md`), leg-namespaced IDs, reasons preserved:**
  ```markdown
  Cross-check (<date>): [X: <company-B> <model> <effort>] N findings (sev) — accepted X<ids> / rejected X<ids> (one-line reason each); [S: <company-A second> <model> <effort>] M findings — accepted S<ids> / rejected S<ids> (reason each); [<author>] independently verified <X/S ids> against source before accepting.
  DISAGREEMENT: <topic> — [X<id>] <pos> / [S<id>] <pos>. Kept: <choice> — decided by <orchestrator|user via picker>, because <one line>.
  ```
- **Availability-degradation matrix (strong default, never a hard block):** resolve standing authorization first, then per-leg probe → attempt (600 s bound, ≤1 retry). Outcomes: both legs ok → dual review; only cross-company ok → record `S leg unavailable (<reason>)`, proceed; only same-company ok → record `X leg unavailable`, proceed (single-subscription path); neither ok / timeout / unparseable / budget-exhausted / host `platform-denied` → record `both legs degraded (<reason>)`, proceed on local scored self-review; a big/risky plan with zero independent legs surfaces a picker ("proceed on self-review only?") unless runtime/global authorization is `always`, in which case the standing decision is reused and the degraded receipt is surfaced without asking again. No outcome blocks a single-subscription user, and no product setting claims to override host security policy.
- **Review receipt (idempotency + freshness):** keyed by the plan's reviewed commit (or content hash); stores `{author_tool, author_model, author_effort, X_leg, S_leg, outcome, timestamp}`. Draft and `start` reuse a receipt whose key matches the current plan hash; a plan edit changes the key and re-triggers. Completion review re-runs only when `planned_at_commit..HEAD` risk/diff warrants.

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | Define the strong-default dual-review contract in the cross-tool source of truth: trigger points, the ordered tier resolver, the full degradation matrix, the review receipt/freshness rule, and the leg-namespaced attribution grammar. Portable CLI baseline is normative; relay is an optional optimization with a synchronous-receipt requirement. | `docs/plans/AGENTS.md` | — | planned |
| 2 | Mirror the contract into the plan-init template so a freshly-seeded project's `docs/plans/AGENTS.md` carries it (repo rule: generated consumer contract moves in lockstep). | `plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md` | 1 | planned |
| 3 | Update plan-manager: on new-plan draft and `start`, run the dual review as a strong default via the CLI baseline (relay optional), honor the receipt, degrade per the matrix, ingest attributed findings; keep it read-only + orchestrator-reconciled. Refresh `metadata.updated`/`content_hash`. | `plugins/docks/skills/productivity/plan-manager/SKILL.md` | 1 | planned |
| 4 | Update plan-review: both legs (cross-company + same-company second instance) launched against the SAME immutable plan commit, collected independently (no shared debate section, no anchoring), reconciled after both arrive; two-reviewer attribution; explicit pins. Refresh hash. | `plugins/docks/skills/productivity/plan-review/SKILL.md` | 1 | planned |
| 5 | In session-relay, generalize "Red-team pair spawn" into the default dual-review pattern (independent read-only legs against one commit) AND add model-AGNOSTIC orchestrator doctrine: the interactive session owns orchestration+reconciliation; pick in-session subagent for this-project work vs a relay worker for cross-project/tool/durable work; keep the interactive session cache-warm. Concrete model/cache preferences are read from global config (which overrides the skill default), NOT hard-coded here. Refresh hash. | `plugins/session-relay/skills/productivity/session-relay/SKILL.md` | 1 | planned |

## Acceptance criteria

| ID | Criterion | Command | Expected |
|---|---|---|---|
| A1 | Contract + template parity. | `diff <(sed -n '/cross-company/,/^## /p' docs/plans/AGENTS.md) <(sed -n '/cross-company/,/^## /p' plugins/docks/skills/productivity/plan-init/references/plans-agents-md-template.md)` (or an equivalent parity assertion) | Both carry the same normative contract (trigger points, tier resolver, degradation matrix, receipt, attribution). |
| A2 | Skills gates green incl. hashes. | `node scripts/ci.mjs` | Exit 0; plan-manager/plan-review/session-relay skills pass CSO/frontmatter/≤500-line/`content_hash` gates. |
| A3 | Degradation + portability + standing consent are explicit. | `grep -c "single-subscription\|degrad\|codex exec -s read-only\|claude -p\|platform-denied\|always.*ask.*never" docs/plans/AGENTS.md` | ≥1 each: CLI baseline is normative, relay optional, single-subscription path defined, standing `always` suppresses the product picker, and host denial is recorded without bypass. |
| A4 | Self-demonstration (strong default). | this plan's `## Self-review` + `## Review` | Records either two successful attributed legs OR an explicitly recorded degraded outcome — never a silent skip. This draft already has the X (gpt-5.6-sol) leg ingested. |

## Out of scope / do-NOT-touch

- Concrete model-preference (gpt-5.6-sol-as-default) and one user's cache/cost profile — user-global config / DocksDocks-public, NOT the shipped skill (skill carries only model-agnostic doctrine + a global-override hook). Per root AGENTS.md "What does NOT belong in this repo."
- How plans are *executed* — only how they are *reviewed/selected*.
- No hard dependency of docks plan-lifecycle on the session-relay plugin; no new binaries, manifests, or version bumps.

## Known gotchas

- Relay `spawn` returns at birth-registration, BEFORE findings exist — never advance the lifecycle on a bare spawn; require `--watch`+bus-reply or use the synchronous CLI leg.
- Two reviewer lists must namespace finding IDs (X#/S#) and preserve per-finding accept/reject reasons, or reconciliation is ambiguous.
- A stale review looks current after a plan edit — always key the receipt to the plan commit/hash.
- Ambient model/effort must never be inherited; pins are explicit and dated.

## Cold-handoff checklist

1. File manifest — Steps name exact paths incl. the plan-init template. ✅
2. Environment & commands — CLI baseline + probes + relay-optional. ✅
3. Interface/data contracts — tier resolver, degradation matrix, receipt, attribution grammar. ✅
4. Executable acceptance — A1–A4. ✅ (A1/A3 static checks, A4 self-demo assertion.)
5. Out of scope — model-preference stays global; no plugin hard-dep. ✅
6. Decision rationale — Context (verbatim user answers + author intent). ✅
7. Known gotchas — spawn-receipt race, ID namespacing, freshness, pin discipline. ✅
8. Global constraints — strong-default-not-hard-block; portable baseline; ≤500-line skills; dated pins. ✅
9. No undefined/forward terms — Step 5 doctrine home resolved (skill + global override). ✅

## Self-review

Score: **88/100** (Draft-2, post cross-company review). Draft-1 scored 86 self-assessed; the gpt-5.6-sol cross-company leg found it was actually **55/100** and its 13 findings drove this Draft-2 — a clean demonstration that the very policy adds value a single-author self-review missed (portability, template parity, degradation completeness, receipts, ID namespacing).

**Draft-3 authorization delta (2026-07-11):** the user made cross-company review standing-authorized and asked not to be prompted again. The contract now separates product-level consent (`always | ask | never`) from host/platform export enforcement; `always` suppresses Docks' picker, while `platform-denied` is an attributable degraded outcome and may not be bypassed through another transport. This edit changes the plan hash, so the Draft-2 X-leg below is historical evidence only; fresh X and S receipts must target Draft-3 before `start`.

Cross-check (2026-07-11): [X: codex gpt-5.6-sol xhigh] 13 findings (6 high, 6 med, 1 low) — accepted X1–X6, X8–X13; X7 accepted-with-modification; rejected none. Key accepts: X2/X3 → portable CLI baseline, relay optional (no plugin hard-dep); X4 → full degradation matrix; X5 → plan-init template added to scope + parity acceptance; X6/X12 → Step 5 resolved as model-agnostic-in-skill + global override; X9 → review receipt; X10 → leg-namespaced attribution; X13 → ordered tier resolver. X1/X7 reconciled against the user's picker answers below. [S: same-company Claude second leg] not yet run — will run before `start` (this is the S leg of the policy applied to its own plan). [claude] independently verified X2/X3/X5 against `plan-manager` L42-62, `plan-review` L95-111, and the repo contract-sync rule before accepting.
DISAGREEMENT: review scope — [X1: gpt-5.6-sol] tier by size (stubs local-only, dual only for big/risky) / [user via picker] every plan, no exceptions. Kept: **every-plan default** — decided by user; the reviewer's cost concern is addressed by the strong-default waiver + availability degradation + proportional same-company leg rather than a stub carve-out, so a trivial or single-subscription run still executes few/zero paid legs.

## Review

*(filled by plan-review on completion)*

## Sources

- `plugins/docks/skills/productivity/plan-manager/SKILL.md:42-62` — current OPTIONAL single cross-tool second opinion + pinned draft leg.
- `plugins/docks/skills/productivity/plan-review/SKILL.md:95-111` — one-shot reviewer legs (draft + completion), single reviewer.
- `plugins/session-relay/skills/productivity/session-relay/SKILL.md:383-398` — manual "Red-team pair spawn."
- `docs/plans/AGENTS.md` "Cross-tool second opinions" — attribution grammar this plan extends to two leg-namespaced reviewers.
- Cross-company review by policy-reviewer (gpt-5.6-sol xhigh), 2026-07-11 — 13 findings, verdict 55/100 on Draft-1; drove Draft-2.
