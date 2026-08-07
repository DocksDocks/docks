---
title: Unshare the graceful-stop and cgroup-empty budgets
goal: Stop the cgroup empty-proof inheriting the graceful-stop budget, so a healthy Linux workspace shutdown under CPU contention no longer becomes a retained custody fault.
plan_hash_mode: status-excluded-v1
status: ongoing
created: "2026-08-07T05:48:25.989Z"
updated: "2026-08-07T13:52:06.166+00:00"
started_at: "2026-08-07T13:52:06.166+00:00"
finished_at: null
assignee: null
tags: [session-relay, cgroup, custody, reliability, linux]
affected_paths:
  - scripts/config/plan-scope-waivers/session-relay-quiesce-deadline.json
  - plugins/session-relay/rust/README.md
  - plugins/session-relay/rust/src/workspace/platform/linux.rs
  - plugins/session-relay/rust/tests/workspace_lease_process.rs
  - plugins/session-relay/test/fixtures/rust-test-inventory.json
---
## Goal

Stop the cgroup empty-proof inheriting the graceful-stop budget, so a healthy Linux workspace shutdown under CPU contention no longer becomes a retained custody fault.

## Context & rationale

`graceful_stop_and_wait_empty` derives one budget and spends it on two unrelated waits:

```rust
let deadline = Instant::now() + GRACEFUL_STOP_DEADLINE;   // 500 ms, linux.rs:61
wait_pidfd_exit(root, deadline)?;                          // may consume ALL of it
reap_pidfd(root)?;
wait_recursive_empty(&self.leaf, deadline.saturating_duration_since(Instant::now()))?;
```

When the SIGTERM wait consumes the budget the empty proof receives `Duration::ZERO`. `wait_recursive_empty` (`linux.rs:2094-2111`) then sets `deadline = now + 0`, reads `populated` once, finds `Instant::now() >= deadline` already true, and returns `Err` with no retry and no sleep. `supervisor.rs:718-731` does not retry that error: it takes `retain_runtime_fault` and answers `quiesce_failed`, so custody is retained and the operator must run explicit recovery.

`EMPTY_DEADLINE = 10s` already exists at `linux.rs:59` and is unused on this path. The defect is not that 500 ms is too short. It is that a second wait silently inherits the unspent remainder of a budget sized for the first, and the two bound unrelated things: how long the root takes to leave after SIGTERM, and how long the kernel takes to schedule the remaining members through `do_exit` once it has.

### The two budgets and their injection point {mechanism}

Three facts constrain the shape of the fix, each measured against the source rather than assumed.

**The deadline is derived inside the method** (`linux.rs:774`), so nothing can drive the exhausted case from outside. The fix therefore splits the method: a public budget-explicit form takes `stop_deadline` and `empty_timeout`, and the existing entry point supplies `GRACEFUL_STOP_DEADLINE` and `EMPTY_DEADLINE`. `supervisor.rs` keeps calling the unchanged entry point and is not touched.

**An already-expired stop budget cannot be injected.** `wait_pidfd_exit` (`linux.rs:2141-2148`) returns `Err` the moment its remaining budget is zero, before any liveness check, so a test must pass a small nonzero stop deadline and an already-exited root rather than an expired deadline.

**The empty wait needs the leaf directory, not only an events fd.** Its first action each iteration is `has_child_cgroups(path)` (`linux.rs:2097`), which enumerates the leaf. An earlier draft of this work demanded an fd-only signature; that would either fail to compile or silently drop the recursive half of the proof, so the signature is left alone. Replacing the 20 ms sleep loop with the kernel's pollable un-populated notification, bounding `rmdir` against `EBUSY`, and adding an fd-taking read are all real improvements and all deliberately deferred - see Out of scope.

Two couplings that a symbol scan surfaces and a reading pass does not:

- The gate runs only `cargo test --locked --test <target>` for eight named targets (`rust-test-inventory.mjs:261`) and never `--lib`, so the regression test must be an integration test or it will never execute. `plugins/session-relay/rust/tests/workspace_lease_process.rs` is its home: it already builds `DelegatedCgroup` values.
- `plugins/session-relay/test/fixtures/rust-test-inventory.json` freezes the exact test list per target and is compared with `assert.deepEqual`, so adding a test requires regenerating it with `--generate`.
- `plugins/session-relay/rust/README.md` cites `linux.rs` spans and per-file line counts. Four spans are already wrong at HEAD 9334502 and one function is missing entirely. `graceful_stop_and_wait_empty` is never cited at HEAD: the 748-767 anchor is the `cgroup.kill` fence cluster (`fence_and_wait_empty`, `kill_and_wait_empty`, `wait_empty`), and it is stale too, because the cluster ends at 768 where `wait_empty` closes. The cluster does not move under this change, so that anchor is corrected to 748-768 and kept on the fence path rather than retargeted onto the graceful-stop path. The other wrong spans are `wait_recursive_empty` cited 2094-2115 but spanning 2094-2111, `read_populated` cited 2113-2124 but spanning 2113-2125, and `has_child_cgroups` never cited exactly - and this change shifts every citation past line 795.

This plan was drafted from a working implementation rather than from intent. Four earlier review invocations across two runs rejected step and acceptance text that the code then contradicted: a caller enumeration that missed `wait_recursive_empty`'s own callers, an fd-only signature incompatible with `has_child_cgroups`, a test that could not be driven deterministically, a `grep -c` count that miscounted an idiom the repository already uses, and `--lib` rows with no delegated cgroup. Every claim below was executed before it was written.

## Environment & how-to-run

Linux with cgroup v2, a running `systemd --user` instance, Node 24, and the pinned toolchain (`rust-toolchain.toml`, 1.85.0). Keep `CARGO_BUILD_JOBS=3` on a 6 vCPU host.

```bash
corepack enable && pnpm install --frozen-lockfile
node plugins/session-relay/test/rust-test-inventory.mjs --generate         # re-derive the frozen test list
node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_lease_process
node scripts/ci.mjs --plugin session-relay
```

`rust-test-inventory.mjs` provisions the delegated subtree itself. A bare `cargo test` does not, and the tests in this target return early when `SESSION_RELAY_TEST_CGROUP_ROOT` is absent, so run cargo directly only inside a scope: `systemd-run --user --scope -q -p Delegate=yes --collect -- sh -c '...'` with `SESSION_RELAY_TEST_CGROUP_ROOT=/sys/fs/cgroup$(cut -d: -f3 /proc/self/cgroup)`.

## Steps

| # | Id | Task | Files | Depends | Effect | Status | Done when / failure action |
|---|---|---|---|---|---|---|---|
| 1 | split_budgets | Split `graceful_stop_and_wait_empty` into the existing entry point, which supplies `GRACEFUL_STOP_DEADLINE` and `EMPTY_DEADLINE`, and a public `graceful_stop_and_wait_empty_within(root, stop_deadline, empty_timeout)` holding the body. The empty wait takes `empty_timeout` instead of `stop_deadline.saturating_duration_since(Instant::now())`. Leave `wait_recursive_empty`'s signature, `wait_pidfd_exit`, `read_populated`, `has_child_cgroups` and `supervisor.rs` unchanged. Record in a comment why the budgets cannot be shared. | `plugins/session-relay/rust/src/workspace/platform/linux.rs` | - | local | `planned` | Done when the crate compiles and the empty wait no longer reads from the stop deadline. Failure action: STOP if `supervisor.rs` needs an edit; the entry point exists so that call site stays untouched, and a change there means the split was done at the wrong seam. |
| 2 | prove_independence | Add `graceful_stop_keeps_the_empty_proof_off_the_stop_budget` to the `workspace_lease_process` integration target, and regenerate the frozen test list. The test builds TWO independent delegated leaves, because the two calls need opposite leaf states and one leaf cannot supply both: the success call waits until its member exits, which would leave a second call on the same leaf observing `populated 0` and returning Ok immediately. Each leaf gets its own 3 s member and its own root - a process placed in the leaf that exits and is left unreaped, detected by reading the state field after the LAST `)` in `/proc/<pid>/stat`, because comm is parenthesised and an exited-but-unreaped process is still present in `/proc` as a zombie. On the first leaf the budget-explicit form is called with a 100 ms stop deadline and a 10 s empty budget and must succeed: that proves a nearly exhausted stop budget does not shorten the empty wait. On the second it is called with a 100 ms stop deadline and a 50 ms empty budget while that leaf's member is still running, and must fail with `populated 0`: that proves the empty budget is still enforced, so the first assertion cannot be passing because the deadline is ignored altogether. | `plugins/session-relay/rust/tests/workspace_lease_process.rs`; `plugins/session-relay/test/fixtures/rust-test-inventory.json`; `scripts/config/plan-scope-waivers/session-relay-quiesce-deadline.json` | 1 | local | `planned` | Done when the test passes inside a delegated scope (A1), the frozen list carries it (A2), and restoring `stop_deadline.saturating_duration_since(Instant::now())` as the empty wait's argument makes it fail. Failure action: STOP if the test passes under both spellings, or if it reports success with `SESSION_RELAY_TEST_CGROUP_ROOT` unset; an early return still prints `1 passed` and would satisfy A1 vacuously. |
| 3 | refresh_crate_map | Re-derive the crate map. Step 1 grows `linux.rs`, so citations after the rewritten function move; the anchors this plan commits to verifying are five named function spans, each of which must appear on a README line that also names the function - `graceful_stop_and_wait_empty` and the new `graceful_stop_and_wait_empty_within`, which need citations created, and `wait_recursive_empty`, `read_populated` and `has_child_cgroups`, whose spans or symbol names are wrong or absent at HEAD independently of this change. The `cgroup.kill` fence anchor covers `fence_and_wait_empty`, `kill_and_wait_empty` and `wait_empty` and does not move under this change, but its 748-767 form is itself stale by one line: correct it to 748-768 and keep it on the fence path rather than retargeting it onto the graceful-stop path - the module-map line count for `linux.rs`, and that no citation in the file points past the end of the file it names. A bulk shift of the remaining citations is performed but is NOT claimed as verified: a citation that moved by the wrong amount stays inside the grown file and no cheap check distinguishes it, so claiming otherwise would be a promise A3 cannot keep. | `plugins/session-relay/rust/README.md` | 1 | local | `planned` | Done when the anchor check reports 0 (A3), having recomputed each named function's span from source, compared the module-map line count for `linux.rs` against the real file, and bounded every citation against its file's length. Failure action: STOP; a crate map with stale anchors is worse than none, because a reader trusts it. |

## Acceptance criteria

A1 greps for `1 passed` rather than `test result: ok`, because a filter matching no test still prints `test result: ok. 0 passed; ... filtered out` and exits 0. A3 is symbol-exact rather than a bounds check: it recomputes each named function's true span from source and requires that span to appear on a README line that also names the function, so a coincidental span match on a row describing a different entity is a violation, keeping an end-of-file bound over all citations as a secondary condition.

| ID | Step | Command | Expected |
|---|---|---|---|
| A1 | prove_independence | `systemd-run --user --scope -q -p Delegate=yes --collect -- sh -c 'cd plugins/session-relay/rust && SESSION_RELAY_TEST_CGROUP_ROOT=/sys/fs/cgroup$(cut -d: -f3 /proc/self/cgroup) CARGO_BUILD_JOBS=3 cargo test --locked --test workspace_lease_process -- graceful_stop_keeps_the_empty_proof_off_the_stop_budget --exact' 2>&1 \| grep -c '1 passed'` | `1` |
| A2 | prove_independence | `grep -c 'graceful_stop_keeps_the_empty_proof_off_the_stop_budget' plugins/session-relay/test/fixtures/rust-test-inventory.json` | `1` |
| A3 | refresh_crate_map | `node -e 'const f=require("fs"),p="plugins/session-relay/rust/",R=f.readFileSync(p+"README.md","utf8"),F="src/workspace/platform/linux.rs",L=f.readFileSync(p+F,"utf8").split("\n"),q=String.fromCharCode(96);let b=0;for(const s of ["graceful_stop_and_wait_empty","graceful_stop_and_wait_empty_within","wait_recursive_empty","read_populated","has_child_cgroups"]){const re=new RegExp("^\\s*(?:pub )?fn "+s+"\\(");const i=L.findIndex(x=>re.test(x));if(i<0){b++;continue}const ind=L[i].match(/^\s*/)[0];let j=i+1;while(j<L.length&&L[j]!==ind+"}")j++;const a=q+F+":"+(i+1)+"-"+(j+1)+q;if(!R.split("\n").some(l=>l.includes(a)&&l.includes(s)))b++}for(const m of R.matchAll(/`(src\/[A-Za-z0-9_\/.]+\.rs):(\d+)(?:-(\d+))?`/g)){try{if(+(m[3]??m[2])>f.readFileSync(p+m[1],"utf8").split("\n").length)b++}catch{b++}}const mm=R.match(/\| `src\/workspace\/platform\/linux\.rs` \| ([0-9,]+) \|/);if(!mm||+mm[1].replace(/,/g,"")!==L.length)b++;console.log(b)'` | `0` |
| A4 | prove_independence | `node plugins/session-relay/test/rust-test-inventory.mjs --case workspace_lease_process >/dev/null 2>&1; echo $?` | `0` |
| A5 | split_budgets | `node scripts/ci.mjs --plugin session-relay >/dev/null 2>&1; echo $?` | `0` |

How each row is judged:

| Binding | Meaning | Rows |
|---|---|---|
| `match` | the command's output is compared against the expected value | A1 A2 A3 |
| `exit` | the command's exit status is compared against the expected value | A4 A5 |

## Out of scope / do-NOT-touch

Deferred deliberately, each a real improvement and none required to fix the verified defect. Folding them in is what produced four rounds of review findings.

`wait_recursive_empty`'s 20 ms sleep loop stays. Replacing it with `poll(POLLPRI)` on the un-populated notification is correct - `cgroup.events` is pollable, the poll is armed by a `read()` on the same fd, and `POLLIN` is a silent trap because kernfs reports it ready unconditionally - but it needs an fd-taking read alongside the retained path-based one for the callers at `linux.rs:455`, `:742` and `:798`, and the leaf directory must still reach `has_child_cgroups`. Its own plan.

`DelegatedCgroup::remove` keeps its single unretried `fs::remove_dir`. A bounded `EBUSY` retry in runc's shape is worth having, but after a proven `populated 0` it is insurance, not the mechanism.

`RUNTIME_EXCHANGE_DEADLINE` (`workspace.rs:41`) is unchanged. Eight `custody runtime close_lease response deadline elapsed after 2000 ms` failures were measured under `cargo nextest -j6` on 2026-08-07, but that is a different fault: a 2 s timeout on the client's socket read means the custodian never answered, whereas this defect makes it answer promptly with an error. It needs its own diagnosis.

`supervisor.rs:718-731`'s decision not to retry `quiesce_failed` stands. Once the empty proof stops failing spuriously, whether a genuine failure deserves a retry is a separate question about custody semantics.

No dependency is added. The crate's three-dependency budget (`tinyjson`, `libc`, `rustix`) stands.

## STOP conditions

1. `supervisor.rs` requires an edit.
2. The regression test passes both before and after the fix.
3. Any test in this target reports success with `SESSION_RELAY_TEST_CGROUP_ROOT` unset.
4. The frozen test list is hand-edited rather than regenerated with `--generate`.
5. Any change lands under `rust/src/` outside `workspace/platform/linux.rs`.
6. The gate fails on a check this plan did not touch and the failure is attributed to load without first being reproduced in isolation.

## Open questions

None. The three constraints on the fix were measured against the source, the implementation was executed before this plan was written, and every deferral above carries its reason.

## Review

Plan-run: {"acceptance":null,"blocker":null,"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"e9c90c8c0c28743365d1f3921fed6cd6cadca6dcd1feb8e09d19c5ad6a6e0f89","invocations":1,"result_sha256":"bf0b2a2220599b3ece3e8b9cdc97a2bd4f2841f398f066f854b20254031fc3c0","state":"passed"},"execution_parent":"933450279136f964adb9964325d51efc2f849d6b","goal_id":"74a99059-893e-47e1-b828-05fec0b0dbe8","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-quiesce-deadline.md","plan_sha256":"9d1119d00b9a4ddf5d700ade8dbc09a269d604dab98b1343f8978ac49ff71d40","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"0cef4024-661a-4429-ba25-7169fa8d8cd8","schema":1,"source_base":"933450279136f964adb9964325d51efc2f849d6b","source_sha256":"d37347fa9cafefe1fadb9f852a76f7d9f0ca4f4d5c54482bcde2fb370bd91c85"}



Plan-attempt-history: {"authorization_source_sha256":"ea2e2e72b940250e6da7932ae7862df3f153a98af538bb357262b0290c926be7","plan_bytes_sha256":"598fcc4c27b6015362a7797a23afee84fcc9838dfa879185f97bf343a79c002f","replacement_run_id":"e3b4a49c-a934-46e5-aed6-cabea6b7ee3c","run":{"acceptance":null,"blocker":{"evidence_sha256":"06bc37aabb4b769e1144ebd6fef816310bca717fc05e39a5e71e434c7704707d","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"0d47d358737077a7a91c4b2d51c30b96097167f8460070d2d90d9fb04d1c1e2e","invocations":2,"result_sha256":"06bc37aabb4b769e1144ebd6fef816310bca717fc05e39a5e71e434c7704707d","state":"blocked"},"execution_parent":null,"goal_id":"74a99059-893e-47e1-b828-05fec0b0dbe8","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-quiesce-deadline.md","plan_sha256":"15c581a07aedac0601820c40235a2b86835da50dcd69a33df51ec05050f3d906","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"e56561fd-5ba6-4672-9924-bc71d0354613","schema":1,"source_base":"933450279136f964adb9964325d51efc2f849d6b","source_sha256":"e4afc1f42cee0105371437f816cea8369e748e99aad5d0941ff77a4ba4b78613"},"schema":1,"status":"blocked","successor_run_sha256":"bbd9421ed6aa3556b32c846fc6efc0142c4cb3731afb2531da5b9df9fca2d027"}
Plan-attempt-history: {"authorization_source_sha256":"ea2e2e72b940250e6da7932ae7862df3f153a98af538bb357262b0290c926be7","plan_bytes_sha256":"a9769b7d13d153dd34f139ade85dd8f48945d687e86571458d8b0875722bdc9f","replacement_run_id":"415309d6-fcbe-4ac6-bbd0-7d5711cad5b8","run":{"acceptance":null,"blocker":{"evidence_sha256":"fb57551ccb036856b8eacb28d7b92c173b47b9e5b68223a8c6ee08dc0885db7b","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"7db4720cc5119e082bde4f3e3117b3cea034a5c19b2bf080eed9b5b0acaf7d6c","invocations":2,"result_sha256":"fb57551ccb036856b8eacb28d7b92c173b47b9e5b68223a8c6ee08dc0885db7b","state":"blocked"},"execution_parent":null,"goal_id":"74a99059-893e-47e1-b828-05fec0b0dbe8","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-quiesce-deadline.md","plan_sha256":"efa254f2d9c1187625e6e54d815db76c5547ce2c72a32d3c2906f27c4df59dc9","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"e3b4a49c-a934-46e5-aed6-cabea6b7ee3c","schema":1,"source_base":"933450279136f964adb9964325d51efc2f849d6b","source_sha256":"128abbf00fa275dffa9a67e2736c43bbb7e1de04119fd3061da01f6f2c1f7dbe"},"schema":1,"status":"blocked","successor_run_sha256":"8907896b814c48e6b807ae75b594f51d0b5ff635bed7e61ea22cc92b0a20cf1b"}
Plan-attempt-history: {"authorization_source_sha256":"91fd695001c893d1b3edfeb957cf2049d7be578bf02413a71123cb9683290ed4","plan_bytes_sha256":"05db4139f7b557465cca91c495e36eb2399e83721d7bdb85f98efd34b67eafa2","replacement_run_id":"26b58bec-6193-4c85-bef5-cf7ddd8c57a2","run":{"acceptance":{"source_sha256":"b943f2d9b4bca319e88b82a2eb5691b278503d01742444aa1d878b89cdce23d0","verification_sha256":"a67a2e786ca92200c686731202a9354282f85cede30a47f4210ea7e31d89c6fc"},"blocker":{"evidence_sha256":"3e4bc9fee8f3f804f1a153e3e3520d33d34b6b0e162d5a1b16815ea45ea24d35","kind":"review_failed"},"completion_review":{"input_sha256":"1516f0f4c534d94c30124769f72bf8264df40aef8cc37c06ec38bae32020ac84","invocations":2,"result_sha256":"3e4bc9fee8f3f804f1a153e3e3520d33d34b6b0e162d5a1b16815ea45ea24d35","state":"blocked"},"draft_review":{"input_sha256":"2c5a6bb649e87e91045de88529875f3a033f2561705f18588790864546cad1fd","invocations":2,"result_sha256":"11cccc380a8927abb8ebdb0e00137a354c309744cc91864c98e5155dfc753b52","state":"passed"},"execution_parent":"933450279136f964adb9964325d51efc2f849d6b","goal_id":"74a99059-893e-47e1-b828-05fec0b0dbe8","implementation_commit":"755a56cb7799d9642db8723d2bb7caed509136ac","plan_path":"docs/plans/active/session-relay-quiesce-deadline.md","plan_sha256":"87e977fbc2c2125678ec33ca40ed37dd0f98e660fd2dc7f6d5ea867b66834cb5","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"415309d6-fcbe-4ac6-bbd0-7d5711cad5b8","schema":1,"source_base":"933450279136f964adb9964325d51efc2f849d6b","source_sha256":"128abbf00fa275dffa9a67e2736c43bbb7e1de04119fd3061da01f6f2c1f7dbe"},"schema":1,"status":"blocked","successor_run_sha256":"be7c95c42b77bc2d465912ea37eaf278944671722bab0bdbcef87a642ea51f52"}
Plan-attempt-history: {"authorization_source_sha256":"01860d84c7e42b00de4ea9b78574be359000a58adc56590592cf773b0e84f5ed","plan_bytes_sha256":"81a7c7e870c8244139c8136fe6cbe08b22a1d6eac4f97592fb9c33a3c2cc9223","replacement_run_id":"0cef4024-661a-4429-ba25-7169fa8d8cd8","run":{"acceptance":null,"blocker":{"evidence_sha256":"392aed50c584f40aec8f92e0284058ea4e12b1eb15126a4bd1fc5e56f975e343","kind":"review_failed"},"completion_review":{"input_sha256":null,"invocations":0,"result_sha256":null,"state":"not_started"},"draft_review":{"input_sha256":"3d271b43c8bffa6d0ecae0f83984b324874670d6905c03272ba4c55f968f8055","invocations":2,"result_sha256":"392aed50c584f40aec8f92e0284058ea4e12b1eb15126a4bd1fc5e56f975e343","state":"blocked"},"execution_parent":null,"goal_id":"74a99059-893e-47e1-b828-05fec0b0dbe8","implementation_commit":null,"plan_path":"docs/plans/active/session-relay-quiesce-deadline.md","plan_sha256":"519b5fa0f245878b4cf74334162e2f27bb0a12cc559fd59d2f9a6f2edfbebe8c","repository_id":"DocksDocks/docks","requested_effects":["local"],"risk":"sensitive","run_id":"26b58bec-6193-4c85-bef5-cf7ddd8c57a2","schema":1,"source_base":"933450279136f964adb9964325d51efc2f849d6b","source_sha256":"d37347fa9cafefe1fadb9f852a76f7d9f0ca4f4d5c54482bcde2fb370bd91c85"},"schema":1,"status":"blocked","successor_run_sha256":"cb2529d64f5988db61510d903c47d290d8cb7689bd53cb7f191ea60df6b6dd36"}


Three predecessor runs are recorded in `Plan-attempt-history`. The first two blocked at their draft-review permit ceilings across four invocations: they specified implementation that had not been written, and the code contradicted them. The third passed draft review with 0 findings and blocked at its completion ceiling on two record defects - stale prose in this section, and a claim that the five `Falsifiability-proof` records had drifted from `source_base`. The first was real. The second was not: `source_base` was never amended, only `implementation_commit` was, and the deterministic self-check reports `5/5 proven, 0 unproven`. A model re-derived a judgement a checker had already computed and got it backwards, at the cost of a terminal permit.

Each of those blocks came from correcting one field at a time. `input_sha256` freezes the reviewed bytes at reservation, so every fix stranded the narrative written for the fix before it. This run reseals in one composition: the scope-waiver file joins `affected_paths` and step 2's Files, closing the P21 coupling; the Steps rows and this section carry no claim this run has not yet earned.

N/A - drafted by main-context plan-manager, pending draft review.

## Verification Results

N/A - not started.
