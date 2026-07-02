---
title: Give session-relay per-session identity (parked stub)
goal: Decide and implement how the session-relay bus resolves "which session am I?" so two sessions sharing one project dir no longer mis-attribute whoami, inbox, and sender identity.
status: planned
created: "2026-07-02T16:02:39-03:00"
updated: "2026-07-02T17:36:04-03:00"
started_at: null
assignee: null
tags: [session-relay, identity, bus, rust, exploration, parked]
affected_paths:
  - plugins/session-relay/rust/src/bus.rs
  - plugins/session-relay/rust/src/hook.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/.claude-plugin/plugin.json
related_plans: [session-relay-auto-inbox-push, session-relay-cross-tool-bus]
review_status: null
planned_at_commit: "c70605356d4fe3327b8f5c24ec5e658eb73e17bd"
---

# Give session-relay per-session identity (parked stub)

## Goal

Make the session-relay bus resolve **which session is calling** correctly when two or more sessions share a single project directory (the common claude+codex pairing, or two same-tool sessions). Today identity is derived from a per-directory marker, so the last hook-runner in a dir silently claims that dir's identity — breaking `whoami`, inbox targeting, and sender attribution for every other session in the same dir. Pick a direction from the candidates below, then implement it within the plugin's zero-new-crate budget and 4-arch rebuild/release flow. This stub parks the problem with its live-verified evidence so a future session starts warm; it does **not** decide the direction.

## Context & rationale

Live-verified evidence (2026-07-02, session-relay v0.2.2), recorded as given:

- **The mechanism.** The SessionStart hook writes `store::set_marker(cwd, session_id)` on **every** start — including resume and compact re-fires — and, since v0.3.0, on **every user prompt** too (`plugins/session-relay/rust/src/hook.rs:183`; see Notes 2026-07-02b). The marker is keyed by cwd only (`plugins/session-relay/rust/src/store.rs:5` — "markers/<cwd> the session id last registered for a project dir"). So the last hook-runner in a directory owns that directory's identity.
- **Why the MCP server can't just know its own id.** MCP servers receive no session id from either runtime. The bus derives identity from the cwd marker via a `self_id` closure (`plugins/session-relay/rust/src/bus.rs:157` — `store::id_for_dir(pdir)`). It reads the project dir from `RELAY_PROJECT_DIR` on Claude (set in `plugins/session-relay/.claude-plugin/plugin.json:30` = `${CLAUDE_PROJECT_DIR}`), falling back to process cwd on Codex, which passes MCP children no env at all (`bus.rs:82-94`).
- **Consequence — two live incidents today in `/home/docks/projects/docks`:**
  - A Claude session's compact at 15:24 -03 re-ran its SessionStart hook and re-claimed the marker; the live Codex session's bus send at 15:59 -03 self-attributed as `claude-main` (msg id `fc4dea3f-d4cd-4ec2-a36b-50ed2758cebb` — delivered fine, but `from` label wrong). Sender attribution flows through `bus.rs:220-223` (`from_id = self_id()`), which is exactly the marker-derived value.
  - Earlier, a dead Codex probe session held the marker, so the user's live Codex session answered "check your inbox" with the wrong identity (id `019f2403-…`), requiring manual marker healing.
- **Interaction with the planned `session-relay-auto-inbox-push` plan.** That plan's Monitor nudge targets the correct mailbox because the *hook* knows `session_id` (read from stdin at `hook.rs:169`). Only the *MCP bus process* lacks identity. Any fix here must not regress that plan, and should ideally hand the bus the same id the hook already has.
- **Partial plumbing already exists.** `register` already accepts an optional `id` override that falls back to `self_id` (`bus.rs:188` — `arg_str(args, "id").or_else(self_id)`; the tool schema exposes it at `bus.rs:34`). `send` does **not** yet accept a caller-supplied sender id — it always uses `self_id()`. Candidate (b) below builds on this existing seam.

## Environment & how-to-run

- **Language/runtime:** Rust (static musl/darwin binaries). Crate deps are deliberately minimal — `tinyjson` + `rustix` only (`plugins/session-relay/rust/Cargo.toml:10-11`). The release profile requires `codegen-units=1` for the reproducible-rebuild check (`Cargo.toml:13-20`).
- **Build:** `cd plugins/session-relay/rust && cargo build --release`. Shipped binaries are 4-arch: `aarch64-apple-darwin`, `aarch64-unknown-linux-musl`, `x86_64-apple-darwin`, `x86_64-unknown-linux-musl` (see `plugins/session-relay/bin/`, checksummed by `bin/SHA256SUMS`). Any code change requires rebuilding + rechecksumming all four before release.
- **Self-test:** `node plugins/session-relay/test/selftest.mjs` exercises the bus end to end.
- **Repo gate:** `node scripts/ci.mjs` must exit 0 before commit (guards + scorers; session-relay is self-versioned and gated by its own section).
- The exact multi-arch rebuild/release commands live in the plugin's release flow — confirm them at step time before shipping a binary change; do not hand-edit `bin/` artifacts.

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | Reproduce the mis-attribution deterministically: two sessions (claude+codex, then two same-tool) in one dir, capture whoami/inbox/send `from` divergence as a failing selftest or scripted repro | notes → this plan; maybe `plugins/session-relay/test/selftest.mjs` | — | planned |
| 2 | Research to confirm/refute candidate (b) (the user's working hypothesis, 2026-07-02): does the SessionStart `additionalContext` reliably inject the bus id into agent context on **both** runtimes, and can agents be relied on to pass it back to `send`? Verify the Codex `additionalContext`/session-id surface against current docs (context7 → docs; per repo memory, Codex hook/MCP facts are post-Jan-2026 — re-fetch, don't assert from training). Also cost (a)/(c) for the comparison | notes → this plan | 1 | planned |
| 3 | Decide the direction via the open question below (surface through the native picker); encode the decision + rationale here | this plan | 2 | planned |
| 4 | Implement per the decision, rebuild all 4 arch binaries + refresh `SHA256SUMS`, extend selftest to cover multi-session identity, run the repo gate | TBD by step 3 (likely `bus.rs`, `hook.rs`, `store.rs`, `plugin.json`, `bin/*`) | 3 | planned |

## Acceptance criteria

- Step 1 produces a recorded, reproducible failure (script or failing test) showing wrong `whoami`/`from`/inbox identity for a second same-dir session.
- Step 2's candidate comparison is recorded here with the trade-offs, each grounded in a `file:line` or a measured cost.
- Step 3's decision is encoded in this plan with rationale; the open question is removed.
- If step 4 implements: the step-1 repro passes; `node plugins/session-relay/test/selftest.mjs` exits 0; `node scripts/ci.mjs` exits 0; all four `bin/` binaries rebuilt and `bin/SHA256SUMS` refreshed; no new crate added to `Cargo.toml`. If the decision is "don't fix now", this plan moves to `finished/` as decided-not-to-build with the reasoning kept.

## Interfaces & data shapes

Deferred to step 3 — the chosen candidate defines the contract. Sketch for a cold reader:

- **(a)** marker key becomes `(cwd, tool)` instead of `cwd`; `store::set_marker`/`id_for_dir` gain a `tool` param; lookup falls back to the dir-only marker for old entries.
- **(b)** `send` (and any other identity-taking tool) gains an optional `self_id`/`from` param mirroring the existing `register` `id` override (`bus.rs:34,188`); the SessionStart hook injects the session's bus id into agent context so the agent can pass it explicitly; the MCP server validates the supplied id against the registry before trusting it.
- **(c)** rejected shape retained for the record — see Out of scope.

## Out of scope / do-NOT-touch

- **Candidate (c) — process-lineage sniffing** (walk parent PIDs to find the owning session): recorded as a likely-reject, not a work item. Fragile, tool-version-dependent, and OS-specific; do not build it without new evidence that (a)/(b) are both infeasible.
- Do **not** change the `session-relay-auto-inbox-push` design — its hook-side mailbox path is already correct; this plan only touches how the *bus process* learns identity.
- Do **not** add a new crate to satisfy this (zero-new-crate budget, see Global constraints).
- Do **not** hand-edit the compiled `bin/` binaries or `SHA256SUMS` — regenerate them through the build/release flow.

## Global constraints

- **Zero new crates.** Deps stay `tinyjson` + `rustix` only (`Cargo.toml:10-11`).
- **4-arch rebuild.** Any source change ships as all four target binaries with a refreshed `SHA256SUMS`.
- **Reproducible-rebuild profile.** Keep `codegen-units=1`, `lto=true`, `panic=abort`, `strip=true` (`Cargo.toml:15-20`).
- **MCP servers get no session id from either runtime**, and Codex passes MCP children no env at all — the fix cannot assume the bus process can read its own session id from the environment.

## Cold-handoff checklist

1. **File manifest** — ✓ candidate blast radius listed (`bus.rs`, `hook.rs`, `store.rs`, `plugin.json`, `bin/*`); exact per-line edits are the step-3 decision output.
2. **Environment & commands** — ✓ build (`cargo build --release`), selftest, and repo gate given with paths; exact multi-arch release commands flagged for step-time confirmation.
3. **Interface & data contracts** — partial by design: sketched per-candidate above; the chosen contract is fixed at step 3.
4. **Executable acceptance** — ✓ for steps 1–3 (recorded repro + encoded decision); step-4 commands attach once the shape is chosen.
5. **Out of scope** — ✓ candidate (c), the auto-inbox-push design, new crates, and hand-edited binaries all named positively.
6. **Decision rationale** — ✓ the marker-is-cwd-keyed mechanism and why the MCP server can't self-identify are in Context, each with `file:line`.
7. **Known gotchas** — ✓ compact/resume re-fires the hook and re-claims the marker; dead sessions can hold a stale marker; Codex passes no env to MCP children.
8. **Global constraints verbatim** — ✓ zero-new-crate, 4-arch rebuild, reproducible-rebuild profile, no-session-id-to-MCP.
9. **No undefined terms / forward refs** — ✓ TBDs are explicit step-3/step-4 outputs, not silent gaps.

## Open questions

- `direction` (choice, decided at step 3): **(a)** key the marker by `(dir, tool)` — fixes the common claude+codex same-dir case with a small, backward-compatible change, but two **same-tool** sessions in one dir stay ambiguous · **(b)** identity handshake — SessionStart hook injects "your bus identity is `<id>`" into context (it already reads `session_id` from stdin), agents pass that id explicitly to bus tools, MCP server validates against the registry; exact but model-mediated `(recommended — working hypothesis per user 2026-07-02; only candidate that disambiguates two same-tool sessions)` · **(c)** process-lineage sniffing — walk parent PIDs; fragile, tool-version-dependent, likely reject · custom allowed. NEEDS CLARIFICATION — user leans (b) but wants steps 1–2 to **confirm it works** before committing; decision stays at step 3.

## Self-review

Score: 60/100 (parked-stub tier: one weighted score + single critique pass, no iteration). Standalone executability and Executable acceptance score low **on purpose** — the deliverable shape is itself the step-3 decision, so step-4 paths and commands can't be pinned yet; the stub's job is to preserve the live evidence (every mechanism claim carries a `file:line` opened this session), the two incident records, the three candidates with trade-offs, and the hard constraints (zero-new-crate, 4-arch) so a future session starts warm rather than re-deriving them. Critique pass caught and fixed: (1) the first draft asserted the bug from memory — now every mechanism line cites `hook.rs`/`store.rs`/`bus.rs`/`plugin.json` verified this session; (2) it missed that `register` already has an `id` override, which materially changes candidate (b)'s cost — now recorded at `bus.rs:34,188`; (3) step 4 had no gate — now conditioned on the step-1 repro passing, selftest + `ci.mjs` green, all 4 binaries rebuilt, and no new crate; (4) the "don't fix" outcome now has an explicit terminal path (`finished/` as decided-not-to-build).

## Review

(filled by plan-review on completion)

## Notes

- **2026-07-02** — User reviewed the `direction` question via the native picker and chose to **defer the decision** (it stays open, decided at step 3) while naming a working hypothesis: *"i think defering is proper, but identity handshake makes sense, just make the research to confirm."* So candidate (b) (identity handshake) is the lead direction, and step 2 is now scoped to confirm-or-refute it specifically — chiefly whether SessionStart `additionalContext` reliably injects the bus id into agent context on both runtimes and whether agents can be relied on to pass it back to `send`. Candidates (a) and (c) remain live only as fallbacks if the research refutes (b).
- **2026-07-02b (draft-review pass · session-relay v0.3.0)** — v0.3.0 shipped after this stub parked (commit `4e2c1f8`, UserPromptSubmit prompt-drain), materially changing the weakness and both live candidates. Recorded so a future session doesn't re-derive it:
  - **Anchors + one mislabel corrected this pass.** hook.rs was rewritten today (`parse_invocation`/`render_context`/`HookEvent` added), pushing the `session_id` read 75→**169** and `set_marker` 89→**183** (fixed in Context/Sources). The `id`-override seam (b) builds on is on **`register`** (`bus.rs:34,188`), **not `whoami`** — whoami takes no args and calls `self_id()` directly (`bus.rs:159-186`); the original self-review misattributed it. bus.rs is otherwise byte-identical to the plan base, so its other anchors still hold.
  - **The weakness is now worse — and easier to reproduce.** `set_marker` (`hook.rs:183`) runs from `inner()` for **both** SessionStart and the new `--event prompt` path (wired in `hooks/hooks.json` → UserPromptSubmit), so the dir marker is re-claimed on **every user prompt**, not just start/resume/compact. Two live sessions in one dir now ping-pong identity turn-by-turn. Step 1's repro no longer needs a forced compact — interleaving prompts from two same-dir sessions triggers the mis-attribution deterministically.
  - **Candidate (a): per-prompt re-claim does NOT help it.** (a) still only disambiguates different-tool pairs; its *same-tool* residual now mis-attributes every turn instead of once per start — the gap fires *more* often, not less.
  - **Candidate (b): strengthened — a cheaper, compaction-robust injection point.** The UserPromptSubmit hook already injects `additionalContext` via `render_context()` (`hook.rs:136-157`); (b)'s identity line can ride that per-turn path, re-asserting "your bus id is `<id>`" on every prompt and surviving a compact that would drop a SessionStart-only injection. **Widen step 2** — it is currently scoped to the SessionStart `additionalContext` only, but the UserPromptSubmit path is the stronger variant; testing only SessionStart risks refuting (b) on its compaction-fragile form. Step-4 design note: `render_context` returns `None` on an empty-inbox prompt turn (test `prompt_event_with_empty_inbox_emits_nothing`, `hook.rs:278`) — a (b) identity line must change that to emit even with no mail.
  - **Flag only (not a required candidate):** the `discover` tool (`bus.rs:274`) already recency-ranks same-dir sessions without a marker — a partial self-locate the a/b/c enumeration doesn't mention.

## Sources

- `plugins/session-relay/rust/src/hook.rs:169` — hook reads `session_id` from stdin (basis for candidate (b)).
- `plugins/session-relay/rust/src/hook.rs:183` — `store::set_marker(&dir, &id)` runs from `inner()` on every SessionStart **and** every UserPromptSubmit (v0.3.0), including resume/compact.
- `plugins/session-relay/rust/src/store.rs:5` — marker is keyed by cwd only ("markers/<cwd> the session id last registered for a project dir").
- `plugins/session-relay/rust/src/bus.rs:157` — `self_id = || store::id_for_dir(pdir)`: identity derived from the dir marker.
- `plugins/session-relay/rust/src/bus.rs:188` — `register` already accepts an optional `id` override falling back to `self_id` (whoami takes no args).
- `plugins/session-relay/rust/src/bus.rs:220-223` — `send` sets `from` from `self_id()` — the path that mis-attributed msg `fc4dea3f-…`.
- `plugins/session-relay/rust/src/bus.rs:82-94` — project dir read from `RELAY_PROJECT_DIR`, fallback to process cwd (Codex has no MCP env).
- `plugins/session-relay/.claude-plugin/plugin.json:30` — `RELAY_PROJECT_DIR` = `${CLAUDE_PROJECT_DIR}`.
- `plugins/session-relay/rust/Cargo.toml:10-20` — deps (`tinyjson`, `rustix`) + reproducible-rebuild release profile (zero-new-crate + 4-arch constraints).
- `plugins/session-relay/bin/` — the 4 shipped arch binaries + `SHA256SUMS`.
