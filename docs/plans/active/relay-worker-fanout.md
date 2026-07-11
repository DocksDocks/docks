---
title: Relay worker self-orchestration (fan-out sub-workers)
goal: Let a spawned relay worker safely fan out its own sub-workers — decompose, spawn worktree-isolated children in parallel (whole-tree cap 2, depth 1), aggregate their handbacks — via atomic under-lock reservation, Entry lifecycle state, fail-closed cleanup, and an opt-in founding-prompt convention.
status: planned
created: 2026-07-10T22:57:23-03:00
updated: 2026-07-10T23:19:55-03:00
started_at: null
assignee: null
tags: [session-relay, orchestration, rust]
affected_paths:
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/appserver.rs
  - plugins/session-relay/rust/src/hook.rs
  - plugins/session-relay/rust/src/main.rs
  - plugins/session-relay/test/selftest.mjs
  - plugins/session-relay/AGENTS.md
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
related_plans:
  - relay-live-view
  - relay-store-hygiene
review_status: null
planned_at_commit: 37039d58af72de9f65336b964af1ee260654b9df
---

## Goal

Enable a spawned session-relay worker to **orchestrate its own implementation** — decompose a task into independent slices, spawn worktree-isolated sub-workers in parallel, collect their handbacks, and integrate — with hard safety guarantees: no shared-checkout corruption, a **bounded** child tree (whole-tree active cap **2**, recursion depth **1**), an invisible/uncollectable tree made visible and reclaimable, and no data loss on cleanup. Ship the safety **primitives** in the `relay` binary plus an **opt-in founding-prompt convention** that teaches a parent worker to drive them. The parent decides *what* to slice; relay guarantees the fan-out is isolated, reserved atomically, lifecycle-tracked, and fail-closed.

## Context & rationale

- **Why now.** User asked (2026-07-10) for relay workers to "spawn a worker that fans out its own sub-workers" — parallel sub-work (multiple files, probes, tools) to offset the felt slowness of a single serial `xhigh` worker.
- **Already mechanically possible, but unsafe.** `spawn.rs:222 build_prompt` bakes the absolute relay path into every worker's founding prompt, so a worker can already `relay spawn` children. Unsafe today because of the four gaps below.
- **Cross-check (2026-07-10):** [codex gpt-5.6-sol] independent red-team scored the first draft **62/100 — DO NOT DISPATCH**, and caught real defects now folded in: my per-parent cap allowed **geometric growth** (each child could spawn more); my cap was a racy **count-then-spawn** (needs atomic under-lock reservation); `last_seen` is **freshness, not liveness** so "slots free for retry" was undefined (needs explicit lifecycle state); **parent ownership ≠ reply routing** (needs canonical parent/root UUIDs separate from the mutable `reply_to`); my draft Entry **dropped `last_seen`** and named a branch with **no branch field**; my GC **force-removed worktrees** (data loss — must fail closed); and **handback/failure contracts were undefined**. [claude opus] independently verified the `last_seen`-drop against `store.rs:482` (CONFIRMED) and discovered `Entry.spawned_via` already exists (live-view) so fan-out reuses it. All findings accepted. Decisions below reflect the reconciled design; user settled the two forks via picker.
- **Distinct from codex's in-session subagents** (which parallelize reasoning within one checkout). Relay fan-out's niche is parallelism *across sessions / checkouts / tools* with aggregation over the bus.
- **Distinct from relay-live-view** (human watching a session). Overlap is the shared `Entry`/registry and — critically — the **app-server-born spawn-birth path** live-view Step 4 is building right now, where the SessionStart hook does NOT register the child; fan-out's reservation/attachment must work for that path too (see Dependencies).

## Decisions (resolved — no open forks)

| Fork | Decision | Source |
|---|---|---|
| Isolation model | **worktree-per-child** (only option giving true parallel *implementation*) | consensus (claude + codex) |
| Interface shape | **extend `spawn`** with flags + a prompt convention (no dedicated scheduler verb) | consensus |
| Whole-tree active cap | **2** active descendants per root tree (parent is a 3rd running session on top) | user picker |
| Recursion depth | **1** — a worker fans out leaf children; children may NOT fan out further | user picker |
| Cap enforcement | **atomic reservation under the store lock** (never count-then-spawn); lease reclaim on launch failure / birth timeout | codex blocker |
| Ownership | canonical **parent-UUID + root-UUID** on `Entry`, separate from `reply_to` | codex blocker |
| Cleanup / GC | **fail closed** — never force-remove a dirty/unmerged worktree; branch deletion separate + explicit; abandon (`--force`) explicit only | codex blocker |
| Cross-tool children | **YES** (v1, same-repo) — pin model/effort per child; test one heterogeneous parent→child path | codex |
| Cross-repo write fan-out | **NO** (v1) — reject worktree fan-out outside the root repo; ordinary spawn stays cross-repo; read-only research allowed | codex |
| Integration order | **incremental** — parent drains handbacks as they arrive and integrates each; conflict → report up, never auto-resolve | claude (engineering call) |
| Ship order | **AFTER relay-live-view** — rebase on finished live-view Step 4 (app-server birth path) | codex |

## Environment & how-to-run

- **Repo:** `/home/vagrant/projects/docks`. Rust crate at `plugins/session-relay/rust/` (compiler pinned by `rust-toolchain.toml`, `Cargo.lock` committed).
- **Branch discipline:** branch from `main` **after `relay-live-view` merges**; the base recorded here (`37039d58`) is provisional — rebase onto merged live-view HEAD and re-run the drift check (`git diff --stat <live-view-ship-commit>..HEAD -- plugins/session-relay/rust/src/{store,spawn,appserver,hook}.rs`) before Step 1, because live-view mutates `Entry` and the spawn-birth path.
- **Build/test (green before commit):**
  ```bash
  export PATH="$HOME/.cargo/bin:$PATH"
  cargo test --manifest-path plugins/session-relay/rust/Cargo.toml
  node plugins/session-relay/test/selftest.mjs
  node scripts/ci.mjs --plugin session-relay      # fmt + clippy -D warnings + host-rebuild-digest + SHA256SUMS + selftest
  ```
  Local `⚠ host rebuild digest differs` is expected (linker/path variance); CI enforces byte-identity.
- **Do NOT rebuild `bin/` locally.** Committed binaries come only from `build-binaries.yml` artifacts. Source-only plan; the binary rebuild + release is a separate later user-gated step (batched with live-view + hygiene, likely 0.10.0).
- **Live smoke sandbox:** `AGENT_RELAY_HOME=$(mktemp -d)` so probes never touch the real `~/.agent-relay` store.

## Interfaces & data shapes

- **`Entry` (store.rs:477) — corrected, additive, backward-compatible.** Keep all existing fields; `from_json` (store.rs:524) already None-defaults absent keys, so old rows and older binaries round-trip:
  ```rust
  pub struct Entry {
      pub id: String,
      pub dir: Option<String>,
      pub name: Option<String>,
      pub tool: String,
      pub last_seen: String,            // KEEP — freshness (draft-1 dropped it; codex caught)
      pub server: Option<String>,       // live-view
      pub spawned_via: Option<String>,  // live-view app-server marker — REUSE, don't reinvent
      // NEW (all Option<String>, to_json emits, from_json None-defaults):
      pub parent: Option<String>,       // canonical PARENT UUID — NOT reply_to
      pub root: Option<String>,         // canonical ROOT-of-tree UUID — whole-tree cap accounting
      pub worktree: Option<String>,     // abs path of child's isolated git worktree
      pub repo_root: Option<String>,    // repo the worktree belongs to (cross-repo guard)
      pub branch: Option<String>,       // child's relay/<id> branch (draft-1 named it, had no field)
      pub lifecycle: Option<String>,    // reserved | running | completed | failed | collected
  }
  ```
  `last_seen` is freshness (GC input); `lifecycle` is liveness (cap/reservation input). They are orthogonal — do not conflate.
- **`relay spawn` new flags** (spawn.rs USAGE line 42):
  - `--worktree` — isolate the child: `git worktree add <AGENT_RELAY_HOME>/worktrees/<child-id> -b relay/<child-id>` off `repo_root`; run the child there; record worktree/repo_root/branch. Rejected if `repo_root` ≠ the parent's root repo (cross-repo guard).
  - `--max-parallel <N>` / env `AGENT_RELAY_MAX_DESCENDANTS` — override the whole-tree active cap (default **2**). Depth stays **1** in v1 regardless.
  - `--fanout` — opt into the fan-out founding-prompt block (Step 6). Absent = today's prompt, byte-identical.
- **Reservation protocol (atomic, under `with_lock`):** to spawn a fan-out child the caller `reserve_child(root, parent, depth)`:
  1. refuse (distinct exit code, documented in USAGE) if `depth ≥ 1` (children are leaves) OR active descendants of `root` (`lifecycle ∈ {reserved, running}`) `≥ cap`.
  2. else write the child `Entry` with `lifecycle = reserved`, `parent`, `root`, `depth` — all inside the same lock hold (no count-then-spawn window).
  Birth flips `reserved → running`: **hook-born** children via the SessionStart hook (`hook.rs`) updating their pre-registered entry; **app-server-born** children via the live-view detached spawn pump (`appserver.rs`). Launch failure / birth timeout → lease reclaim removes the reservation (frees the slot) — this is what makes "slots free for retry" defined.
- **`relay collect <childNameOrId> [--force]`** (new verb, cli.rs) — handback + cleanup:
  - reads the child's handback `{ base_sha, head_sha, branch, status }`;
  - `git worktree remove` **only if clean** (uncommitted changes → refuse + report unless `--force`);
  - branch deletion is a **separate explicit** action (`git worktree remove` never deletes the branch);
  - sets `lifecycle = collected`.
- **GC cascade (store::gc) — fail closed.** When a root/parent is collected under existing freshness rules, descendants are reclaimed under the same all-surfaces-old + held-lock-safe + O_NOFOLLOW discipline (reuse relay-store-hygiene's deletion code) **only if their worktrees are clean/merged**; a dirty/unmerged orphan is **never** destroyed on stale ancestry alone — GC reports it and leaves it.
- **Handback contract (child → parent over the bus):** `{ base_sha, head_sha, branch, status: completed|failed|conflict, note }`. Parent integrates **incrementally** (drains completions as they arrive); `conflict`/`failed`/child-crash/birth-timeout → parent reports up, never auto-resolves.

## Steps

1. **Entry ownership + lifecycle fields.** Add `parent, root, worktree, repo_root, branch, lifecycle` (Option<String>) to `Entry` (store.rs:477); extend `to_json`/`from_json` (camelCase keys, None-default). Keep `last_seen`/`server`/`spawned_via`. **Done when:** a unit test round-trips a full Entry AND an old-shape row (missing every new key) still decodes with `None`s + preserved `last_seen`; `relay list` renders `root → parent → child` indentation with lifecycle in a sandbox.

2. **Atomic reservation + whole-tree cap + depth-1.** Implement `reserve_child(root, parent, depth)` inside `with_lock` (store.rs): refuse with a distinct documented exit code when `depth ≥ 1` or active-descendants-of-root `≥ cap` (default 2, `--max-parallel`/`AGENT_RELAY_MAX_DESCENDANTS` override); else write `lifecycle=reserved` in the same lock hold. Add lease reclaim on launch failure / birth timeout. **Done when:** a test simulates two concurrent reservations racing the last slot and the cap is NEVER exceeded (atomicity); depth-1 refusal fires; a failed birth reclaims its lease so the next reserve succeeds; reservations are scoped per-root (a different root is unaffected).

3. **Worktree isolation (`--worktree`) + birth attachment (both paths).** Implement `--worktree` (git worktree add + branch off `repo_root`, run child there, record worktree/repo_root/branch), rejecting a `repo_root` outside the parent's root repo. Flip `reserved → running` at birth for **hook-born** (hook.rs updates the pre-registered entry) and **app-server-born** (appserver.rs spawn pump) children. **Done when:** two `--worktree` children spawned against the same repo each edit the SAME file in parallel and neither sees the other's uncommitted change; a hook-born and an app-server-born child both transition their entry `reserved → running` with correct parent/root; a cross-repo `--worktree` spawn is refused.

4. **Fail-closed cleanup + GC.** Implement `relay collect` (clean-only `git worktree remove`; separate explicit branch deletion; `--force` for dirty abandon) and wire orphan handling into `store::gc`: reclaim only clean/merged descendant worktrees (O_NOFOLLOW discipline reused from hygiene); a dirty/unmerged orphan is reported, never destroyed. **Done when:** a clean worktree is collected and (on explicit request) its branch removed; a dirty worktree `collect` is refused + reported; a GC pass over a dirty orphan reports it and leaves both tree and branch intact; a `--force` abandon removes it.

5. **Handback + failure contracts.** Implement the child→parent handback `{base_sha, head_sha, branch, status, note}` and incremental parent integration (drain completions, integrate each; conflict/failed/crash/timeout → report up, set `lifecycle` accordingly, reclaim lease). **Done when:** tests cover a completed handback integrated incrementally, a conflict reported (not auto-merged), a child crash → `lifecycle=failed` + lease reclaimed, and a birth timeout → reclaimed.

6. **Opt-in fan-out founding-prompt convention + cross-tool.** Extend `build_prompt` (spawn.rs:222) with a `--fanout`-gated block teaching: decompose → `reserve+spawn --worktree --reply-to <self>` each slice (≤ cap, depth 1, may set `--tool codex|claude` + pinned model/effort) → drain your mailbox for handbacks → integrate incrementally → report up. **Done when:** a rendered `--fanout` prompt contains the decompose→reserve→spawn→collect→integrate→report loop, cap, and depth rule; a rendered non-`--fanout` prompt is byte-identical to today's (assert, no bloat regression); a heterogeneous parent(codex)→child(claude) path is exercised in the live smoke.

7. **Docs + selftest + contract.** Update `plugins/session-relay/AGENTS.md` (new flags/verb, cap/depth/lifecycle, reservation, fail-closed GC), the `session-relay` SKILL.md (how a worker fans out safely), the `main.rs` header multi-call verb list (`collect`), and extend `selftest.mjs` for reservation atomicity, cap/depth, lifecycle transitions, fail-closed cleanup, and the prompt opt-in gate. **Done when:** `node scripts/ci.mjs --plugin session-relay` is green and the selftest summary check count rises by the added assertions.

## Acceptance criteria

- `cargo test` + `node plugins/session-relay/test/selftest.mjs` pass, covering: Entry full/old-shape round-trip (with `last_seen` preserved); **reservation atomicity** (concurrent race never exceeds cap); depth-1 refusal; lease reclaim on failed birth/timeout; `--worktree` isolation (two parallel children editing one file don't corrupt); birth attachment for **both** hook-born and app-server-born children; cross-repo `--worktree` refusal; **fail-closed** cleanup + GC (dirty worktree refused/reported, never destroyed; `--force` abandons); handback contract fields + incremental integration + conflict/crash/timeout paths; `--fanout` prompt opt-in gate (default prompt unchanged).
- `node scripts/ci.mjs --plugin session-relay` green (fmt, clippy `-D warnings`, host-rebuild-digest, SHA256SUMS, selftest).
- **Live smoke** (`AGENT_RELAY_HOME` sandbox): a parent fans out **2** `--worktree` children (one heterogeneous tool), both report handbacks, `relay list` shows the `root→parent→child` tree with lifecycle, the parent integrates both incrementally, a 3rd concurrent reserve is refused by the cap, and cleanup + GC leave **no** orphaned worktrees or dangling branches. Transcript recorded in `## Review`.
- No `bin/` change in this plan's diff (source-only).

## Out of scope / do-NOT-touch

- **Codex's in-session subagents** — not touched/reimplemented.
- **relay-live-view** app-server/live-view surface — separate plan; only the shared `Entry`/birth seam is consumed (as a dependency), not modified beyond the additive fields here.
- **Recursion beyond depth 1** — children are leaves in v1; deeper trees are a later plan (needs stricter accounting).
- **Cross-repo WRITE fan-out** — rejected in v1; multi-repo integration contract is a future plan. Read-only cross-repo research via ordinary `spawn` is unaffected.
- **Auto-decomposition intelligence** — the parent slices; relay provides isolated/reserved/tracked/fail-closed primitives only.
- **`bin/` binaries + version bump + release** — later, user-gated, batched with live-view + hygiene.

## Dependencies

- **relay-live-view must be finished + merged first.** Fan-out consumes the app-server-born spawn-birth path (live-view Step 4) to flip `reserved → running` for app-server children, and live-view mutates `Entry`. Rebase on live-view's ship commit and re-run the drift check before Step 1.
- **relay-store-hygiene (merged 072c830):** reuse its `store::gc` deletion discipline (all-surfaces-old, held-lock-safe, O_NOFOLLOW dirfd-relative unlinkat) for descendant reclamation — do not write a second deletion path.

## Cold-handoff checklist

- **File manifest w/ exact paths** — ✅ `affected_paths` + per-step file:line anchors.
- **Environment & commands** — ✅ `## Environment & how-to-run` (PATH, cargo/selftest/ci, sandbox, rebase drift check).
- **Interface/data contracts** — ✅ `## Interfaces & data shapes` (corrected Entry, reservation protocol, collect/GC, handback).
- **Executable acceptance** — ✅ `## Acceptance criteria` (named tests + live smoke).
- **Out-of-scope** — ✅ `## Out of scope / do-NOT-touch`.
- **Decision rationale** — ✅ `## Context & rationale` + `## Decisions` table (with cross-check attribution).
- **Known gotchas** — ✅ freshness≠liveness, atomic-reserve-not-count-then-spawn, parent-UUID≠reply_to, fail-closed cleanup, both birth paths, cross-repo guard, no-local-`bin`-rebuild, rebase-after-live-view.
- **Global constraints verbatim** — ✅ binary-release discipline + `bin/` untouched + `ci.mjs --plugin session-relay` gate (from `plugins/session-relay/AGENTS.md`).
- **No undefined/forward terms** — ✅ all three original forks + the cap-scope/lifecycle fork resolved in `## Decisions`; no open questions remain.

## Open questions

*(none — all forks resolved in `## Decisions`)*

## Self-review

Score: pending final pass. Cross-check (2026-07-10): [codex gpt-5.6-sol xhigh] 1 review, 62/100, ~10 findings (3 picks + 1 blocking missed fork + 4 blockers + 3 scope calls) — all accepted; [claude opus] independently verified the `last_seen`-drop (CONFIRMED vs store.rs:482) and the pre-existing `spawned_via` field before folding in. User settled cap=2 and depth=1 via picker. Draft rewritten from 5→7 steps to add reservation atomicity, lifecycle state, corrected Entry, fail-closed cleanup, handback/failure contracts, and an explicit live-view dependency. Re-score on `start`.

## Review

*(pending completion)*
