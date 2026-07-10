---
title: Relay notification reliability — spawn completion signal + doorbell liveness
goal: Close the two orchestration gaps found 2026-07-10 — relay spawn is fire-and-forget with no completion signal, and a dead mailbox watcher is undetectable — so detached workers and long-running orchestrator sessions never depend on a user turn to surface finished work.
status: planned
created: "2026-07-10T04:03:30-03:00"
updated: "2026-07-10T05:21:18-03:00"
started_at: null
assignee: null
tags: [session-relay, reliability, doorbell, follow-up]
affected_paths:
  - plugins/session-relay/rust/src/spawn.rs
  - plugins/session-relay/rust/src/cli.rs
  - plugins/session-relay/rust/src/bus.rs
  - plugins/session-relay/rust/src/store.rs
  - plugins/session-relay/rust/src/hook.rs
  - plugins/session-relay/skills/productivity/session-relay/SKILL.md
  - plugins/session-relay/test/selftest.mjs
related_plans: []
review_status: null
planned_at_commit: 579b55cd7af213355267c13a4a4317bf2d98e66f
---

## Goal

Two reliability gaps, one incident (2026-07-10, recorded below in Context):

1. **`relay spawn` emits no completion signal.** `relay wake` blocks until the child's turn ends, so the caller's harness gets a task notification that doubles as a doorbell; `spawn` returns at registration and the child works detached. If the orchestrator's mailbox watcher is not alive, the child's finished-work mail sits undelivered until an unrelated turn occurs.
2. **A dead mailbox watcher is silent and undetectable.** The SessionStart hook nudges Claude sessions to arm a Monitor (`tail -F` on their mailbox) once; nothing detects or re-arms it if it later dies (environment crash, /tmp exhaustion, harness restart). Delivery degrades from push to next-turn-drain with no signal that it happened.

After this plan: a spawn caller can opt into a completion event; any sender can see whether its recipient's watcher is alive; and a one-command doctor check tells an orchestrator its own receive path is healthy.

## Context & rationale

- Incident (2026-07-10, docks-kit overnight orchestration): the orchestrator's mailbox Monitor died during a /tmp ENOSPC crash and was never re-armed; later, a detached `relay spawn` worker (statusline-worker) finished a plan draft at 06:36Z and its bus reply sat undelivered ~25 minutes until the user happened to type. All mail was durably queued (no loss) — the gap is latency/visibility, not integrity.
- The doorbell today is sender-side only (`relay wake` spawns a headless resume; cli.rs `doorbell_args`, ~line 142). Receiver-side liveness has no representation in the store: `roster` shows last-seen but nothing about the watch.
- Second incident (2026-07-10, same night): `relay wake` on a session whose previous resume process was still alive (mid-turn, polling its inbox for an approval) started a SECOND concurrent `codex exec resume` of the same session — two processes racing in one shared worktree, duplicate work reports, near-miss on conflicting edits. Wake needs a per-session liveness/lock check: refuse (or queue the doorbell) when a resume process is already running. This becomes Step 1b below at implementation time — fold it into Step 1's spawn/wake surface work.
- The skill's delivery matrix (SKILL.md ~lines 44-46) documents "live, between turns → Monitor mailbox watch / next prompt" — this plan adds the missing row: what happens when the watch is dead, and how to detect it.

## Steps

| # | Task | Depends | Status |
|---|---|---|---|
| 1 | **`relay spawn --watch`**: after registering and launching the child, poll the child session's store state (and its reply-to mailbox activity) and exit when the child goes idle after its first completed turn, printing a one-line summary (`spawned <name>; first turn complete; N mail sent`). Without the flag, behavior is unchanged. The caller runs it as a background task, so its exit becomes the harness completion notification — same ergonomics `relay wake` already has. Unit tests over the polling/exit conditions with a stubbed store. | — | planned |
| 2 | **Watcher heartbeat in the store**: the Monitor arm-command the SessionStart hook nudges (and the skill documents) gains a heartbeat — the suggested watch command touches `~/.agent-relay/watchers/<session-id>` on arm and every N minutes (mechanism per resolved OQ-1). `store.rs` exposes watcher freshness; `bus.rs` `send` result gains `recipient_watch: "fresh"|"stale"|"never"` so a sender knows push delivery is degraded and can choose `relay wake` instead. Backward compatible: absent heartbeat = `never`. | — | planned |
| 3 | **`relay doctor`**: one command that checks, for the CURRENT session: registration present, mailbox readable, watcher heartbeat fresh, store lock healthy; prints PASS/FAIL per check with the exact re-arm command on watcher failure. Orchestrators run it after any environment incident. Selftest coverage. | 2 | planned |
| 4 | **Docs**: SKILL.md delivery matrix gains the degraded-watch row + `relay doctor`; orchestrator guidance: verify watchers after environment-level crashes; spawn section documents `--watch`. `metadata.updated` bump. Release rides the next session-relay version (lockstep manifests per repo rules; `node scripts/ci.mjs` green). | 1-3 | planned |

## Acceptance criteria

- [ ] `relay spawn <dir> --tool codex --watch -- <task>` (against a stub child that completes one turn) exits 0 only after the child's first turn completes; without `--watch` it exits immediately after registration — both proven in selftest.
- [ ] With a fresh heartbeat file, `send` result contains `recipient_watch: "fresh"`; with none, `"never"`; with one older than the staleness window, `"stale"` — selftest-pinned.
- [ ] `relay doctor` exits 0 with all-PASS in a healthy session; killing the watcher heartbeat makes it exit 1 naming the watcher check and printing the re-arm command.
- [ ] `node scripts/ci.mjs --plugin session-relay` green; skill guard/score floors hold.

## Out of scope / do-NOT-touch

- No change to wake/doorbell argv shapes (security-reviewed surface), mail format, or store layout beyond the additive `watchers/` dir.
- No auto-re-arm of a dead watcher from the server side (the harness owns Monitor lifecycle; relay can only detect and instruct).
- No push-notification transport; this is detection and signaling only.

## Cold-handoff checklist

- File manifest: `affected_paths`; the incident narrative in Context is the motivating spec.
- Environment: repo root `~/projects/docks`; Rust source under `plugins/session-relay/rust/`; gates = `node scripts/ci.mjs` (includes relay selftest + binary-release discipline per `plugins/session-relay/AGENTS.md` — read it before editing).
- Contracts: Step tasks name the exact new surfaces (`--watch`, `recipient_watch`, `watchers/<id>` heartbeat, `relay doctor`).
- Decision rationale: heartbeat-file over PID tracking per resolved OQ-1 (see Notes when ingested); watch-flag over always-blocking spawn to preserve existing spawn semantics.
- Known gotcha: `planned_at_commit` is the docks repo tip at drafting (579b55c); relay binary releases are versioned separately — check `plugins/session-relay/AGENTS.md` release discipline before shipping.

## Self-review

- Score: 87/100 — standalone executability 19/22 (heartbeat staleness window left to implementer with a stated default), actionability 14/16, dependency order 12/12, evidence 8/10 (light audit, per parked-plan proportionality: cli.rs/spawn.rs/SKILL.md opened; store.rs/bus.rs internals not), goal coverage 13/14, executable acceptance 11/12, failure modes 6/8, assumption→question 4/4. Adequate for a parked plan; a start-time draft review should re-score before implementation.

## Notes

- 2026-07-10: OQ-1 resolved (user via picker): **heartbeat file** — the watch command touches `~/.agent-relay/watchers/<session-id>` every 2 minutes; freshness = mtime within 5 minutes. Encoded in Step 2.

## Review

(filled by plan-review on completion)
