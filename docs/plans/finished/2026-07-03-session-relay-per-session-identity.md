---
title: Give session-relay per-session identity (parked stub)
goal: Decide and implement how the session-relay bus resolves "which session am I?" so two sessions sharing one project dir no longer mis-attribute whoami, inbox, and sender identity.
status: finished
in_review_since: "2026-07-03T13:33:00-03:00"
created: "2026-07-02T16:02:39-03:00"
updated: "2026-07-03T13:36:00-03:00"
started_at: "2026-07-03T12:58:58-03:00"
assignee: claude
tags: [session-relay, identity, bus, rust, exploration, parked]
affected_paths:
  - plugins/session-relay/rust/src/bus.rs
  - plugins/session-relay/rust/src/hook.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/.claude-plugin/plugin.json
related_plans: [session-relay-auto-inbox-push, session-relay-cross-tool-bus]
review_status: passed
ship_commit: "a0b3560d39db6227c9309cec8e06987556459df6"
planned_at_commit: "c70605356d4fe3327b8f5c24ec5e658eb73e17bd"
---

# Give session-relay per-session identity (parked stub)

## Goal

Make the session-relay bus resolve **which session is calling** correctly when two or more sessions share a single project directory (the common claude+codex pairing, or two same-tool sessions). Today identity is derived from a per-directory marker, so the last hook-runner in a dir silently claims that dir's identity — breaking `whoami`, inbox targeting, and sender attribution for every other session in the same dir. Pick a direction from the candidates below, then implement it within the plugin's zero-new-crate budget and 4-arch rebuild/release flow. This stub parks the problem with its live-verified evidence so a future session starts warm; it does **not** decide the direction.

## Context & rationale

Live-verified evidence (2026-07-02, session-relay v0.2.2), recorded as given:

- **The mechanism.** The SessionStart hook writes `store::set_marker(cwd, session_id)` on **every** start — including resume and compact re-fires — and, since v0.3.0, on **every user prompt** too (`plugins/session-relay/rust/src/hook.rs:184`; see Notes 2026-07-02b and 2026-07-03). The marker is keyed by cwd only (`plugins/session-relay/rust/src/store.rs:5` — "markers/<cwd> the session id last registered for a project dir"). So the last hook-runner in a directory owns that directory's identity.
- **Why the MCP server can't just know its own id.** MCP servers receive no session id from either runtime. The bus derives identity from the cwd marker via a `self_id` closure (`plugins/session-relay/rust/src/bus.rs:157` — `store::id_for_dir(pdir)`). It reads the project dir from `RELAY_PROJECT_DIR` on Claude (set in `plugins/session-relay/.claude-plugin/plugin.json:30` = `${CLAUDE_PROJECT_DIR}`), falling back to process cwd on Codex, which passes MCP children no env at all (`bus.rs:85-98`).
- **Consequence — two live incidents today in `/home/docks/projects/docks`:**
  - A Claude session's compact at 15:24 -03 re-ran its SessionStart hook and re-claimed the marker; the live Codex session's bus send at 15:59 -03 self-attributed as `claude-main` (msg id `fc4dea3f-d4cd-4ec2-a36b-50ed2758cebb` — delivered fine, but `from` label wrong). Sender attribution flows through `bus.rs:220-223` (`from_id = self_id()`), which is exactly the marker-derived value.
  - Earlier, a dead Codex probe session held the marker, so the user's live Codex session answered "check your inbox" with the wrong identity (id `019f2403-…`), requiring manual marker healing.
- **Interaction with the planned `session-relay-auto-inbox-push` plan.** That plan's Monitor nudge targets the correct mailbox because the *hook* knows `session_id` (read from stdin at `hook.rs:170`). Only the *MCP bus process* lacks identity. Any fix here must not regress that plan, and should ideally hand the bus the same id the hook already has.
- **Partial plumbing already exists.** `register` already accepts an optional `id` override that falls back to `self_id` (`bus.rs:188` — `arg_str(args, "id").or_else(self_id)`; the tool schema exposes it at `bus.rs:34`). `send` does **not** yet accept a caller-supplied sender id — it always uses `self_id()`. Candidate (b) below builds on this existing seam.

## Environment & how-to-run

- **Language/runtime:** Rust (static musl/darwin binaries). Crate deps are deliberately minimal — `tinyjson` + `rustix` only (`plugins/session-relay/rust/Cargo.toml:10-11`). The release profile requires `codegen-units=1` for the reproducible-rebuild check (`Cargo.toml:13-20`).
- **Local build (dev/test only):** `cd plugins/session-relay/rust && cargo build --release` for iterating; the selftest prefers this fresh `target/<triple>/release/relay` over `bin/`. **Shipped binaries are NEVER built locally** — see release flow below.
- **Shipped binaries are 4-arch:** `aarch64-apple-darwin`, `aarch64-unknown-linux-musl`, `x86_64-apple-darwin`, `x86_64-unknown-linux-musl` (in `plugins/session-relay/bin/`, checksummed by `bin/SHA256SUMS`).
- **Release flow (the CURRENT flow used for 0.4.0 and 0.5.0 — supersedes any "rebuild locally" wording):** dispatch `.github/workflows/build-binaries.yml`, download the artifacts, commit them into `bin/` (mode 100755) + regenerate `SHA256SUMS`, then `node scripts/release.mjs --plugin session-relay minor` (bumps the 3 manifests in lockstep, tags, waits for tag-CI, cuts the Release). `release.mjs` refuses to tag unless all four committed binaries + launcher verify against `SHA256SUMS`. Committed binaries come ONLY from that workflow — never a local `cargo build`.
- **Self-test:** `node plugins/session-relay/test/selftest.mjs` exercises the bus end to end (currently **52 checks** at v0.5.0; a code change extends it).
- **Repo gate:** `node scripts/ci.mjs` must exit 0 before commit (guards + scorers; session-relay is self-versioned and gated by its own section).
- Do not hand-edit `bin/` artifacts or `SHA256SUMS` — regenerate them through the workflow.

## Steps

| # | Task | Files | Depends | Status |
|---|---|---|---|---|
| 1 | Reproduce the mis-attribution deterministically: two sessions (claude+codex, then two same-tool) in one dir, capture whoami/inbox/send `from` divergence as a failing selftest or scripted repro | notes → this plan; maybe `plugins/session-relay/test/selftest.mjs` | — | done |
| 2 | Research to confirm/refute candidate (b) (the user's working hypothesis, 2026-07-02): does the SessionStart/UserPromptSubmit `additionalContext` reliably inject the bus id into agent context on **both** runtimes, and can agents be relied on to pass it back to `send`? Verify the Codex `additionalContext`/session-id surface against current docs (context7 → docs; per repo memory, Codex hook/MCP facts are post-Jan-2026 — re-fetch, don't assert from training). **Now also scope in the two v0.4.0/v0.5.0 findings (see Notes 2026-07-03):** (i) the `relay spawn` **pre-mint** injection point — for a claude spawn the child's bus id is minted (`--session-id <uuid>`) and knowable at prompt-build time, a deterministic (non-model-mediated) place to inject "your bus id is `<id>`"; codex spawn has no pre-mint (marker-diff birth) so it still needs the hook path; (ii) the **CLI `send` attribution gap** (`cli.rs:242` hardcodes `fromName:"cli"`, `from:null`) — a SECOND identity-loss site distinct from the marker-derived MCP `send`, exercised by spawned claude workers' PRIMARY reply command. Also cost (a)/(c) for the comparison | notes → this plan | 1 | done |
| 3 | Decide the direction via the open question below (surface through the native picker); encode the decision + rationale here | this plan | 2 | done |
| 4 | Implement per the decision; extend selftest to cover multi-session identity; produce the 4 arch binaries via the **release flow** (dispatch `build-binaries.yml` → download artifacts → commit into `bin/` + regenerate `SHA256SUMS`, then `scripts/release.mjs --plugin session-relay minor`) — NOT a local `cargo build`; run the repo gate | `rust/src/{bus,hook,cli,watch,spawn}.rs`, `test/selftest.mjs`, `skills/productivity/session-relay/SKILL.md`, then `plugin.json` + `bin/*` at release | 3 | done |

## Acceptance criteria

- Step 1 produces a recorded, reproducible failure (script or failing test) showing wrong `whoami`/`from`/inbox identity for a second same-dir session.
- Step 2's candidate comparison is recorded here with the trade-offs, each grounded in a `file:line` or a measured cost.
- Step 3's decision is encoded in this plan with rationale; the open question is removed.
- If step 4 implements: the step-1 repro passes; `node plugins/session-relay/test/selftest.mjs` exits 0 with a check count > 52 (the v0.5.0 baseline); `node scripts/ci.mjs` exits 0; all four `bin/` binaries regenerated **via `build-binaries.yml`** (not a local build) and `bin/SHA256SUMS` refreshed; no new crate added to `Cargo.toml`. If the decision is "don't fix now", this plan moves to `finished/` as decided-not-to-build with the reasoning kept.

## Interfaces & data shapes

Deferred to step 3 — the chosen candidate defines the contract. Sketch for a cold reader:

- **(a)** marker key becomes `(cwd, tool)` instead of `cwd`; `store::set_marker`/`id_for_dir` gain a `tool` param; lookup falls back to the dir-only marker for old entries.
- **(b)** `send` gains an optional `self_id`/`from` param mirroring the existing `register` `id` override (`bus.rs:34,188`); the SessionStart/UserPromptSubmit hook injects the session's bus id into agent context so the agent can pass it explicitly; the MCP server validates the supplied id against the registry before trusting it. **Two send paths mis-attribute and BOTH need the param (v0.5.0 finding):** the MCP `send` (`bus.rs:220-223`, `from_id = self_id()` — marker-derived) AND the CLI `send` (`cli.rs:242`, hardcoded `fromName:"cli"`, `from:null` — no identity at all); the CLI path is what spawned claude workers use for their PRIMARY reply. For a `relay spawn` **claude** child the id is pre-minted at prompt-build time, so the identity line can be injected deterministically into the birth prompt (no model round-trip); codex spawn (marker-diff birth) and all interactive sessions still rely on the hook injection.
- **(c)** rejected shape retained for the record — see Out of scope.

## Out of scope / do-NOT-touch

- **Candidate (c) — process-lineage sniffing** (walk parent PIDs to find the owning session): recorded as a likely-reject, not a work item. Fragile, tool-version-dependent, and OS-specific; do not build it without new evidence that (a)/(b) are both infeasible.
- Do **not** change the `session-relay-auto-inbox-push` design — its hook-side mailbox path is already correct; this plan only touches how the *bus process* learns identity.
- Do **not** add a new crate to satisfy this (zero-new-crate budget, see Global constraints).
- Do **not** hand-edit the compiled `bin/` binaries or `SHA256SUMS` — regenerate them through the build/release flow.

## Global constraints

- **Zero new crates.** Deps stay `tinyjson` + `rustix` only (`Cargo.toml:10-11`).
- **4-arch rebuild.** Any source change ships as all four target binaries with a refreshed `SHA256SUMS`, **produced by `build-binaries.yml` and committed — never a local `cargo build`** (`release.mjs` refuses to tag otherwise).
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

**RESOLVED (2026-07-03, native picker): direction = (b) identity handshake.**
The user confirmed (b) after steps 1–2 delivered the deterministic repro and the
confirming research. Implementation contract (step 4):

1. `bus.rs` — `send` gains optional `from` (name-or-uuid → `store::resolve`,
   must be registered; invalid → tool error so the agent corrects; absent →
   marker fallback = today's behavior). `inbox` gains the same optional `id`
   (correctness, not auth — the store is single-user-trust and the CLI can
   already drain any mailbox). Tool descriptions teach agents to pass them.
2. `hook.rs` — every SessionStart (startup/resume/compact, BOTH tools) injects
   an identity line: "Your session-relay bus id is `<id>`…; pass from:`<id>`
   when sending". This CHANGES the codex empty-SessionStart no-output invariant
   (justified: the beacon mis-attribution incident was codex; once-per-start
   cost only) — update `codex_sessionstart_with_empty_inbox_emits_nothing`.
   The prompt-event empty-inbox no-output invariant is UNCHANGED (watch.rs
   depends on it). `mail_block` gains a recipient-identity trailer (signature
   gains the recipient id — `watch.rs` passes its target id; shared fence
   unchanged).
3. `cli.rs` — `send` gains `--from <nameOrId>` (value flag, no BOOL_FLAGS
   change); resolves + stamps `from`/`fromName`; invalid → die. Absent →
   `fromName:"cli"` as today.
4. `spawn.rs` — the claude child's injected PRIMARY reply command becomes
   `<abs-relay> send "<reply-to>" --from <premint-id> -- "…"` (deterministic);
   codex children rely on their own hook's identity line + MCP `from`.
5. `selftest.mjs` — the alice/bob repro becomes passing checks (explicit-from
   MCP send, explicit-id inbox, CLI `--from`, spawn prompt carries `--from`,
   SessionStart identity lines on both tools, mail-trailer identity).

## Self-review

Score: 60/100 (parked-stub tier: one weighted score + single critique pass, no iteration). Standalone executability and Executable acceptance score low **on purpose** — the deliverable shape is itself the step-3 decision, so step-4 paths and commands can't be pinned yet; the stub's job is to preserve the live evidence (every mechanism claim carries a `file:line` opened this session), the two incident records, the three candidates with trade-offs, and the hard constraints (zero-new-crate, 4-arch) so a future session starts warm rather than re-deriving them. Critique pass caught and fixed: (1) the first draft asserted the bug from memory — now every mechanism line cites `hook.rs`/`store.rs`/`bus.rs`/`plugin.json` verified this session; (2) it missed that `register` already has an `id` override, which materially changes candidate (b)'s cost — now recorded at `bus.rs:34,188`; (3) step 4 had no gate — now conditioned on the step-1 repro passing, selftest + `ci.mjs` green, all 4 binaries rebuilt, and no new crate; (4) the "don't fix" outcome now has an explicit terminal path (`finished/` as decided-not-to-build).

## Review

- **Goal met:** yes — shared-dir mis-attribution is closed by the (b) identity handshake. `send` gains a registry-validated `from` and `inbox` a validated `id` (`bus.rs` — unknown → soft tool error, absent → marker fallback unchanged); `cli.rs` `send` gains `--from <name-or-id>` (`cli.rs:237-259` — unknown → `die`, absent → `fromName:"cli"`); `spawn.rs build_prompt` bakes `--from <premint>` into the claude worker's PRIMARY reply command; every SessionStart on both tools injects the session's own bus id (`hook.rs render_context`) and the fenced mail trailer names the recipient id (`hook.rs mail_block`, `watch.rs:196`). The dir-marker fallback is preserved for single-session dirs (back-compat). Live leg proved marker-independence: a spawned claude worker replied `from:5f8a76ad-213a-4301-a207-1c57269b9337` / `fromName:"w-id"` after the dir marker was stomped with a decoy id (0.5.0 produced `fromName:"cli"`, `from:null`). Residual by design: non-spawn interactive sessions rely on the agent honoring the injected identity line (the accepted model-mediation of (b), decided at step 3); the spawn path is fully deterministic.
- **Regressions:** none — `cargo test` 29/29 (26 unit incl. the 3 new identity tests + `bus_smoke` + 2 `lock_race`), `cargo clippy --all-targets -D warnings` + `cargo fmt --check` clean, selftest **62 checks** (was 52; +10 alice/bob identity matrix), zero new crate (`Cargo.toml` deps still `tinyjson` + `rustix`). The `prompt_event_with_empty_inbox_emits_nothing` invariant that `watch.rs` depends on is unchanged. Scope: `store.rs` is in `affected_paths` but untouched (candidate (b) reused `store::resolve`/`drain`; only candidate (a) would have needed it — benign), and `spawn.rs`/`watch.rs` changed without being in the frontmatter array though both are named in the step-4 contract (Open questions §4–5).
- **CI:** pass — `node scripts/ci.mjs` exit 0, all checks green (session-relay 0.6.0, bin checksums verify 4 listed, cargo fmt/clippy clean); one benign ⚠ host-rebuild digest variance (CI enforces byte-identity via the same image as build-binaries; locally expected path/linker variance). Tag `session-relay--v0.6.0` present; tag-CI green on release.
- **Follow-ups:** none.
- Filed by: plan-review on 2026-07-03T13:27:56-03:00

## Step 1 — recorded repro (2026-07-03, deterministic, throwaway store)

Black-box through the v0.5.0 binary (`SESSION_RELAY_HOME=$(mktemp -d)`), no live
sessions needed:

1. Hook alice (`{"session_id":A,"cwd":DIRX,"source":"startup"}` → `relay hook`),
   `register alice --id A --dir DIRX`; then hook + register bob in the SAME dir.
2. `markers/<encoded-DIRX>` now holds **B** (last claimant).
3. A bus process serving ALICE (`RELAY_PROJECT_DIR=DIRX relay bus`) calls `send
   {to:"alice", body:"msg composed by ALICE"}` → the delivered mail reads
   **`fromName:"bob"`, `from:<B>`** — alice's own message attributed to bob
   (same signature as live incident msg `fc4dea3f-…`). `whoami` returns bob.
4. CLI path: `relay send alice -- "cli message"` → **`fromName:"cli"`,
   `from:null`** — the second identity-loss site (cli.rs:242), confirmed.
5. Implied and worse: `inbox {}` on alice's bus drains **bob's** mailbox —
   mis-attribution is also cross-session mail drain/loss.

## Step 2 — candidate (b) research: CONFIRMED (evidence, 2026-07-03)

All load-bearing questions answer YES from this week's live-verified work:

- **Does `additionalContext` reliably inject on BOTH runtimes?** YES — v0.3.0's
  live legs (user-confirmed "circuit"/"beacon" tests) had claude AND codex
  sessions receive hook-injected context and act on it; v0.5.0's spawn legs
  re-confirmed (both children self-registered via the hook and followed
  injected instructions).
- **Does a SessionStart identity line survive compaction?** YES — SessionStart
  RE-FIRES on compact with `additionalContext` honored (observed live in the
  executing session: `SessionStart:compact` hook success + the Monitor nudge
  re-delivered post-compact). So the identity line does NOT need the per-prompt
  path — v0.3.0's zero-per-turn-overhead invariant (empty-inbox prompt emits
  nothing, `hook.rs` test `prompt_event_with_empty_inbox_emits_nothing`, relied
  on by `watch.rs`) is preserved untouched.
- **Can agents be relied on to pass the id back?** Yes, with three assists that
  remove most model-mediation: (i) the identity line re-injects on every
  SessionStart incl. resume/compact; (ii) the fenced mail block's trailer can
  name the recipient's own id ("you are <id>; pass from:<id> when replying");
  (iii) spawned claude workers are FULLY deterministic — spawn pre-mints the id
  and can bake `--from <id>` into the injected PRIMARY reply command
  (spawn.rs `build_prompt`); codex workers get (i) from their own hook. Codex
  headless obeys injected bus instructions (worker2's MCP send, live-verified).
- **Validation seam exists:** `register` already models the id-override
  (`bus.rs:34,188`); `send`/`inbox` gain the same optional param validated
  against the registry (UUID + registered) before being trusted.
- **(a) costed for comparison:** `(dir,tool)` marker key fixes only the
  claude+codex pairing; the step-1 repro (two same-tool sessions) stays broken
  on every turn (per-prompt re-claim). Small change, does not meet the Goal.
- **(c):** remains rejected (fragile process-lineage sniffing; no new evidence).

**Implied (b) implementation shape (step-4 input):** `bus.rs` — `send` gains
optional `from`, `inbox` gains optional `id`, both resolved name-or-uuid and
validated registered-in-registry, falling back to the marker when absent;
`hook.rs` — `render_context` adds an identity line on every SessionStart
(startup/resume/compact, both tools) and names the recipient id in the mail
trailer; prompt-event empty-inbox behavior unchanged; `cli.rs` — `send` gains
`--from <nameOrId>`; `spawn.rs` — claude reply command gains `--from
<premint>`; selftest — the alice/bob repro becomes a passing multi-session
identity check.

## Notes

- **2026-07-02** — User reviewed the `direction` question via the native picker and chose to **defer the decision** (it stays open, decided at step 3) while naming a working hypothesis: *"i think defering is proper, but identity handshake makes sense, just make the research to confirm."* So candidate (b) (identity handshake) is the lead direction, and step 2 is now scoped to confirm-or-refute it specifically — chiefly whether SessionStart `additionalContext` reliably injects the bus id into agent context on both runtimes and whether agents can be relied on to pass it back to `send`. Candidates (a) and (c) remain live only as fallbacks if the research refutes (b).
- **2026-07-02b (draft-review pass · session-relay v0.3.0)** — v0.3.0 shipped after this stub parked (commit `4e2c1f8`, UserPromptSubmit prompt-drain), materially changing the weakness and both live candidates. Recorded so a future session doesn't re-derive it:
  - **Anchors + one mislabel corrected this pass.** hook.rs was rewritten today (`parse_invocation`/`render_context`/`HookEvent` added), pushing the `session_id` read 75→**169** and `set_marker` 89→**183** (fixed in Context/Sources). The `id`-override seam (b) builds on is on **`register`** (`bus.rs:34,188`), **not `whoami`** — whoami takes no args and calls `self_id()` directly (`bus.rs:159-186`); the original self-review misattributed it. bus.rs is otherwise byte-identical to the plan base, so its other anchors still hold.
  - **The weakness is now worse — and easier to reproduce.** `set_marker` (`hook.rs:183` at that pass; now `:184` — see 2026-07-03) runs from `inner()` for **both** SessionStart and the new `--event prompt` path (wired in `hooks/hooks.json` → UserPromptSubmit), so the dir marker is re-claimed on **every user prompt**, not just start/resume/compact. Two live sessions in one dir now ping-pong identity turn-by-turn. Step 1's repro no longer needs a forced compact — interleaving prompts from two same-dir sessions triggers the mis-attribution deterministically.
  - **Candidate (a): per-prompt re-claim does NOT help it.** (a) still only disambiguates different-tool pairs; its *same-tool* residual now mis-attributes every turn instead of once per start — the gap fires *more* often, not less.
  - **Candidate (b): strengthened — a cheaper, compaction-robust injection point.** The UserPromptSubmit hook already injects `additionalContext` via `render_context()` (`hook.rs:136-157`); (b)'s identity line can ride that per-turn path, re-asserting "your bus id is `<id>`" on every prompt and surviving a compact that would drop a SessionStart-only injection. **Widen step 2** — it is currently scoped to the SessionStart `additionalContext` only, but the UserPromptSubmit path is the stronger variant; testing only SessionStart risks refuting (b) on its compaction-fragile form. Step-4 design note: `render_context` returns `None` on an empty-inbox prompt turn (test `prompt_event_with_empty_inbox_emits_nothing`, `hook.rs:278`) — a (b) identity line must change that to emit even with no mail.
  - **Flag only (not a required candidate):** the `discover` tool (`bus.rs:274`) already recency-ranks same-dir sessions without a marker — a partial self-locate the a/b/c enumeration doesn't mention.
- **2026-07-03 (pre-start review · v0.5.0)** — TWO more session-relay releases shipped since 2026-07-02b: **v0.4.0** (`relay watch` — app-server WS-over-UDS push; `finished/2026-07-02-session-relay-app-server-push.md`) and **v0.5.0** (`relay spawn` — worker sessions; `finished/2026-07-02-session-relay-spawn.md`). HEAD manifests read **0.5.0** (was v0.2.2/v0.3.0 when this stub parked). All facts below re-verified against current source this pass.
  - **Anchor drift corrected (+1 on hook.rs, again).** v0.4.0's app-server plan added a doc-comment to `mail_block` ("Shared with `relay watch`…"), shifting hook.rs down one more line: `session_id` read **170** (was 169), `set_marker` **184** (was 183), `render_context` **137-158** (was 136-157), the Monitor-arm nudge ~**148-152**. Fixed in Context/Sources/Interfaces/Steps. `bus.rs` is still **byte-identical** to the plan base — all its anchors verified exact: `id` schema `:34`, `self_id` closure `:157`, `register` id-override `:188`, `send from_id=self_id()` `:220-223`, `whoami` `:159-186`, `discover` `:274`; only the plan's `project_dir` cite was loose and is corrected 82-94→**85-98**. `store.rs:5` still correct.
  - **NEW candidate-(b) injection point — `relay spawn` pre-mint (deterministic for claude).** `spawn.rs` PRE-MINTS the claude child's session id (`claude -p --session-id <uuid>`) and builds the child's first prompt at that moment (verified: `finished/2026-07-02-session-relay-spawn.md` A3 "`--session-id <uuid>` pre-mint WORKS", child argv table, standing-prefix template). So for a **claude spawn**, "your bus id is `<id>`" can be injected verbatim into the birth prompt with ZERO model-mediation — the strongest, most exact form of (b), and it PARTLY voids the open-question's "but model-mediated" caveat against (b). **Codex spawn has NO pre-mint** (A4: "No pre-set-id flag exists on `codex exec`" → marker-diff birth), so codex spawn + all interactive sessions still need the hook-path injection. Candidate (b) therefore splits: deterministic (claude spawn birth prompt) vs hook-mediated (everything else).
  - **NEW second attribution gap — the CLI `send` path has NO identity (`cli.rs:242`).** Verified: the CLI `send` arm hardcodes `msg.fromName = "cli"` and `msg.from = null` (`cli.rs:241-242`) — it never consults `self_id`/the marker at all. This is DISTINCT from the marker-derived MCP `send` gap the plan documents. It is now load-bearing because spawned claude workers reply via the injected PRIMARY command `<abs-relay> send "<reply-to>" -- "…"` (the CLI path), so **every** spawned-claude-worker reply currently lands as `fromName:"cli"` regardless of marker state. A (b) fix scoped to `bus.rs` alone would NOT close this — `cli.rs` must gain the same `--from`/self-id plumbing. Hence `cli.rs` added to `affected_paths` and step 4's likely-files.
  - **Live corroboration of the core thesis (spawn live legs, 2026-07-02).** A claude worker's `relay send` reply was attributed `fromName:"cli"` (the CLI gap above). A codex worker's MCP `send` reply got `fromName:"worker2"` **only because it happened to be the last/sole marker claimant in its dir** — the exact last-writer-wins marker mechanism this plan is about, now reproduced for spawned workers: two same-dir workers WOULD mis-attribute. (`finished/2026-07-02-session-relay-spawn.md` Phase B live-leg evidence.)
  - **v0.4.0 confirms headless codex CAN drive bus MCP tools unattended** (`watch.rs` `pump_turn` + the codex spawn leg) — a positive datum for step 2's "can agents be relied on to pass the id back to `send`": the mechanism (headless/hosted codex reaching the bus MCP) is proven to work, so (b)'s feasibility question narrows to reliability/consistency, not capability.
  - **New reuse constraint — `hook.rs`'s `mail_block`/`defuse` are now `pub(crate)`, shared with `watch.rs`** (verified `:59`/`:102`). Any (b) change to `render_context` (`:137-158`) or the fence helpers must not break `watch.rs`'s reuse NOR the `render_context`-returns-`None`-on-empty-inbox behavior (test `prompt_event_with_empty_inbox_emits_nothing`, `hook.rs:279`) that both the UserPromptSubmit drain and `watch` depend on. A (b) identity line that must emit even with an empty inbox has to change that `None` path deliberately (already flagged in 2026-07-02b for step-4 design; now it also affects `watch`).
  - **Release-flow correction (was implying local builds ship).** The current flow (used for both 0.4.0 and 0.5.0): dispatch `.github/workflows/build-binaries.yml` → download artifacts → commit into `bin/` (mode 100755) + regenerate `SHA256SUMS` → `node scripts/release.mjs --plugin session-relay minor`. Committed binaries come ONLY from that workflow; `release.mjs` refuses to tag unless all four verify against `SHA256SUMS`. Corrected in Environment/Steps/Acceptance/Global constraints.
  - **Red-team gaps to close before/at start (this plan lacks what its three siblings all have):** (1) **No `## STOP conditions` section** — the siblings each carry a drift-check STOP (`git diff --stat <planned_at_commit>..HEAD -- plugins/session-relay/`) plus named halts. Since this plan will touch `hook.rs`/`bus.rs`/`cli.rs` after 3 releases of drift and those files are now shared with `watch.rs`/`spawn.rs`, add a drift-check STOP and a "if step-2 research refutes (b)'s injection reliability, fall back to (a) and reassess — do not ship a half-mediated (b)" STOP at step 3/4 time. (2) **Selftest baseline moved 44→52** — the multi-session-identity repro (step 1) and any (b) coverage extend from 52. (3) `planned_at_commit` `c706053…` is now far behind HEAD (0.5.0); step 4 must reconcile against current source, not the parked-base anchors.
- **2026-07-03b (step-4 implementation — code + tests done; release pending)** — All five contract points landed:
  - **bus.rs**: `send` gained optional `from` (resolved via `store::resolve`, unknown → soft tool error, nothing enqueued; omitted → marker fallback unchanged); `inbox` gained optional `id` (drain the named session; unknown → soft tool error). Schemas updated in `TOOLS_JSON`.
  - **hook.rs**: `mail_block(msgs, recipient_id)` — the reply trailer now names the recipient's own id (`passing from:"<id>"`); `render_context(..., self_id)` emits the identity line on **every SessionStart, both tools** (survives `RELAY_NO_WATCH`; rides resume/compact re-fires). The `prompt_event_with_empty_inbox_emits_nothing` invariant is **unchanged** (watch/UserPromptSubmit safe); the codex empty-SessionStart cell now deliberately emits identity-only (test updated accordingly).
  - **cli.rs**: `send --from <name-or-id>` resolves and stamps `from`/`fromName`; unknown → `die` without queueing. Omitted keeps `fromName:"cli"`.
  - **watch.rs**: `mail_block(&msgs, &t.id)` — pushed mail carries the target's id in the trailer.
  - **spawn.rs**: `premint` computed before prompt build; claude workers' PRIMARY reply command bakes `--from <premint>`; codex workers rely on the hook identity line (no pre-mint exists).
  - **Verification (all green this session):** `cargo fmt` clean, `cargo clippy --all-targets -D warnings` clean, `cargo test` 29/29 (26 unit incl. 3 new identity tests + bus_smoke + 2 lock_race), selftest **62 checks** (was 52; +10: shared-dir alice/bob matrix — identity line per-session, from-override, marker fallback intact, unknown-from/id soft errors, inbox-by-id, CLI `--from` + trailer, unknown `--from` dies), `node scripts/ci.mjs` all green. SKILL.md gained "Shared-dir identity" section + anti-hallucination entries (`updated: 2026-07-03`, hash backfilled). Released as **v0.6.0** (tag `session-relay--v0.6.0`, binaries from workflow run 28672286253, tag-CI green). **Live leg (user-requested, 2026-07-03):** real claude worker spawned via the fresh binary into an isolated store; the dir marker was deliberately stomped with a decoy session id BEFORE the reply — the worker's reply still arrived `from: 5f8a76ad-213a-4301-a207-1c57269b9337` / `fromName: "w-id"` (its pre-minted identity, via the baked `--from`), where 0.5.0 produced `fromName:"cli"`, `from:null`. Marker-independence proven live.

## Sources

- `plugins/session-relay/rust/src/hook.rs:170` — hook reads `session_id` from stdin (basis for candidate (b)).
- `plugins/session-relay/rust/src/hook.rs:184` — `store::set_marker(&dir, &id)` runs from `inner()` on every SessionStart **and** every UserPromptSubmit (v0.3.0), including resume/compact.
- `plugins/session-relay/rust/src/store.rs:5` — marker is keyed by cwd only ("markers/<cwd> the session id last registered for a project dir").
- `plugins/session-relay/rust/src/bus.rs:157` — `self_id = || store::id_for_dir(pdir)`: identity derived from the dir marker.
- `plugins/session-relay/rust/src/bus.rs:188` — `register` already accepts an optional `id` override falling back to `self_id` (whoami takes no args).
- `plugins/session-relay/rust/src/bus.rs:220-223` — `send` sets `from` from `self_id()` — the path that mis-attributed msg `fc4dea3f-…`.
- `plugins/session-relay/rust/src/bus.rs:85-98` — `project_dir()` reads `RELAY_PROJECT_DIR` (then `CLAUDE_PROJECT_DIR`), fallback to process cwd (Codex has no MCP env).
- `plugins/session-relay/.claude-plugin/plugin.json:30` — `RELAY_PROJECT_DIR` = `${CLAUDE_PROJECT_DIR}`.
- `plugins/session-relay/rust/Cargo.toml:10-20` — deps (`tinyjson`, `rustix`) + reproducible-rebuild release profile (zero-new-crate + 4-arch constraints).
- `plugins/session-relay/bin/` — the 4 shipped arch binaries + `SHA256SUMS`.
