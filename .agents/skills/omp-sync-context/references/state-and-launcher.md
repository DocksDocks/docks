# omp State Store And Launcher

Part of `omp-sync-context`. Read the SKILL.md constraints first.

## Local State Store

Store the omp session model in the SQLite store `~/.docks-kit/kit.db`, table
`omp_session`. The `harness_selection` table has had no use since 0.24.0 and
stays in `kitDb.ts MIGRATIONS[0]` only to keep schema 1; a `DROP` migration
would raise the schema and make older kits refuse the store.
Resolve that path from the engine home with `kitDb.ts kitDbFile`.
Open the store only through `kitDb.ts withKitDb`, which applies the migrations.
Append a new migration to `kitDb.ts MIGRATIONS`; never edit a shipped entry.
Write the state directory with mode `0700`.
Chmod the database file to mode `0600`.
Never create the store on a read when neither `kit.db` nor `state.json` exists.

`withKitDb` imports the session model of a legacy `~/.docks-kit/state.json`
once, when `omp_session` is empty, and renames the file to
`state.json.migrated`. It imports no harness selection.
Each table has one writer.

`ompSession.ts readOmpSessionModel` treats a missing, corrupt, or too-new
store as no stored session model.
`sync` never opens `kit.db`.

Every `docks-kit omp` launch writes a run overlay under `kitCacheDir`;
only `--model` or `--pick` writes the `omp_session` table.
`docks-kit omp --fast` writes only `tier.openai` in the deployed
`config.yml`, through `ompFastMode.ts toggleDeployedOpenAiFast`.
The session model entry stores a required free model selector and an optional session thinking level.
Every overlay role, `advisor` included, runs that one level.
Compute the level once at set time from the catalog row of the chosen model.
Derive the level from that model's own ladder, never from the global ladder
constant: free-model ladders differ per model, and some publish no `medium`
or no ladder (`cli/docs/omp-models.md`; verify: `omp models --json`).
Store no level for a model without a ladder, and render a bare selector for it.
An invented level makes omp fail when the session starts, not when the user
chooses the model.
Treat a missing, blank, or malformed entry as no stored model, and resolve it
to `DEFAULT_OMP_SESSION_MODEL`.
Never throw on a corrupt entry, because a launcher that refuses to start is
worse than one that starts on the default free model.
Drop the level field when it is blank, so a stale level never
survives a switch to a level-free model.

Anchor storage at `ompSession.ts` — `readOmpSessionModel` and `writeOmpSessionModel` — the `omp_session` table opened through `kitDb.ts withKitDb`.
Anchor rendering at `ompOverlay.ts` — `ladderCeiling`, `planEffortChoice`, and `renderFreeOverlay` — per-model ladder derivation, the picker question set, and empty fallback chains, including the chains keyed by the free model at every level.

The launcher enforces the free model before omp starts.
Reject each forwarded flag that can select a model, in both forms and also after a `--`, because omp can read that `--` as a flag value.
Start omp with `launch` first, so a forwarded subcommand name becomes message text.
Pass the session model as an explicit `--model`, so a restored session model cannot replace it.
Set the three model variables in the child environment instead of removing them, because omp refills an unset variable from its `.env` files.
Check the session model against the free catalog of every candidate profile.
Do not claim that the launcher controls these paths, which can still select a paid model: model selection inside a running session, the `web` role and its chain, the model-kind roles, and extensions and hooks.
`cli/docs/omp-models.md` `### Model selection outside the launcher` owns the list.
Anchor input checks at `cli/src/commands/omp.ts` — `rejectedForwardedFlag` and `forwardedProfile` — the rejected model flags and the candidate profiles, scanned past `--`.
Anchor the launch at `ompOverlay.ts` — `buildOmpArgs` and `ompChildEnvironment` — `launch` first, the explicit `--model`, the model variables, and the `PI_CONFIG_FILES` append.

Verify the store:
`bunx vitest run cli/test/unit/ompSession.test.ts -t "creates no store when a read finds neither file"`,
`bunx vitest run cli/test/unit/ompSession.test.ts -t "imports no harness selection from a legacy state.json"`,
`bunx vitest run cli/test/unit/ompSession.test.ts -t "treats a corrupt SQLite store as a missing session model"`,
`bunx vitest run cli/test/unit/ompSession.test.ts -t "refuses a store from a newer schema"`,
and `bunx vitest run cli/test/unit/ompSession.test.ts -t "leaves no stale level behind when a level-free model overwrites a levelled one"`.

Verify the launcher and the overlay:
`bunx vitest run cli/test/unit/ompCommand.test.ts -t "rejects a model flag after a forwarded"`,
`bunx vitest run cli/test/unit/ompCommand.test.ts -t "refuses a launch whose model is free in the environment profile but not in a forwarded profile"`,
`bunx vitest run cli/test/unit/ompOverlay.test.ts -t "starts omp with launch, the overlay, and the session model at its level"`,
`bunx vitest run cli/test/unit/ompOverlay.test.ts -t "lists replaced variables in smol, slow, plan order"`,
`bunx vitest run cli/test/unit/ompOverlay.test.ts -t "renders a level-free model with bare chat selectors and no thinking keys"`,
and `bunx vitest run cli/test/unit/ompFastMode.test.ts -t "turns fast on and changes only tier.openai"`.
