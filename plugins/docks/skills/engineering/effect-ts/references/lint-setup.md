# Effect diagnostics as lint rules

The Effect language service reports Effect mistakes as diagnostics. This file connects them to the editor, the package scripts, and continuous integration (CI). Agents, hooks, and CI run one gate command.

## Contents

- [Pick the package](#pick-the-package)
- [Install](#install)
- [tsconfig plugin block](#tsconfig-plugin-block)
- [Unstable APIs](#unstable-apis)
- [Scripts and CI](#scripts-and-ci)
- [Output formats and exit codes](#output-formats-and-exit-codes)
- [Suppression, Oxlint, and editors](#suppression-oxlint-and-editors)
- [Setup check](#setup-check)

## Pick the package

| TypeScript major | Package | Binary |
|---|---|---|
| 7 | `@effect/tsgo` | `effect-tsgo` |
| 5 or 6 | `@effect/language-service` | `effect-language-service` |

Both packages use the plugin name `@effect/language-service` in `tsconfig.json`. On TypeScript 5 or 6, the plugin loads only in the editor. Add `"prepare": "effect-language-service patch"`, so that plain `tsc` reports Effect diagnostics. After the patch, delete the `.tsbuildinfo` files. Use the schema `./node_modules/@effect/language-service/schema.json`. The rest of this file is for TypeScript 7.

## Install

`@effect/tsgo` is pre-1.0. Pick a `typescript` version from the "Supported Package Versions" table in the tsgo README. Pin both packages exactly. Pin every Effect package to the exact `effect` version too.

```sh
bun add -d -E @effect/tsgo@<tsgo-version> typescript@<typescript-version>    # Bun
pnpm add -D -E @effect/tsgo@<tsgo-version> typescript@<typescript-version>   # pnpm
grep -n -A8 'Supported Package Versions' node_modules/@effect/tsgo/README.md  # confirm the pair
```

## tsconfig plugin block

```jsonc
{
  "$schema": "./node_modules/@effect/tsgo/schema.json",
  "compilerOptions": {
    "plugins": [
      {
        "name": "@effect/language-service",
        // Defaults: Effect errors and warnings fail effect-tsgo tsc; suggestions do not
        "ignoreEffectErrorsInTscExitCode": false,
        "ignoreEffectWarningsInTscExitCode": false,
        "ignoreEffectSuggestionsInTscExitCode": true,
        // Default true: suggestions print in the tsc output and steer agents
        "includeSuggestionsInTsc": true,
        // Levels: off, suggestion, message, warning, error
        "diagnosticSeverity": {
          "outdatedApi": "error", "runEffectInsideEffect": "error", "globalErrorInEffectFailure": "error",
          "anyUnknownInErrorContext": "warning", "strictEffectProvide": "warning",
          "tryCatchInEffectGen": "warning", "leakingRequirements": "warning",
          "globalDateInEffect": "warning", "globalConsoleInEffect": "warning", "globalFetchInEffect": "warning",
          "globalRandomInEffect": "warning", "globalTimersInEffect": "warning", "globalJsonInEffect": "warning"
        },
        "allowedUnstableApis": ["@effect/platform-bun/BunRuntime", "@effect/vitest", "effect/http"]
      }
    ]
  }
}
```

The defaults already fail on errors and warnings, for example `floatingEffect`, `missingReturnYieldStar`, and `duplicatePackage`. The block raises rules that catch common agent mistakes. Read each default in `node_modules/@effect/tsgo/schema.json`.

| Rule | Catches |
|---|---|
| `outdatedApi` | a name that does not exist in Effect 4 |
| `runEffectInsideEffect` | `Effect.run*` inside an Effect |
| `globalErrorInEffectFailure`, `anyUnknownInErrorContext` | the global `Error`, `any`, or `unknown` in the error channel |
| `strictEffectProvide` | `Effect.provide` with a layer outside an entry point. Tests provide doubles with `layer(...)` |
| `tryCatchInEffectGen` | `try`/`catch` inside an Effect generator |
| `leakingRequirements` | a service method that leaks a dependency to its callers |
| `global*InEffect` | `Date`, `console`, `fetch`, `Math.random`, timers, or `JSON` inside Effect code |

## Unstable APIs

`unstableApiUsage` warns on each application programming interface (API) with the `@stability unstable` tag, for example `BunRuntime`, `@effect/vitest`, and `effect/http`. Confirm a tag with `grep -n '@stability' node_modules/@effect/platform-bun/src/BunRuntime.ts`. Run the type check and read each `effect(unstableApiUsage)` line. Add each module that the project uses on purpose to `allowedUnstableApis`. An entry such as `effect/http` allows the module and its children. An entry such as `effect/http/HttpClient#get` allows one export.

## Scripts and CI

```json
{
  "scripts": {
    "typecheck": "effect-tsgo tsc --noEmit -p tsconfig.json",
    "lint:effect": "effect-tsgo diagnostics --project tsconfig.json --format text --strict"
  }
}
```

- `typecheck` is the gate. It reports plain type errors and Effect diagnostics in one pass.
- `lint:effect` reports only Effect diagnostics. A plain type error does not make it fail.
- Do not name a script `check`: `bun check` runs that script instead of the type checker.
- Prefer `effect-tsgo tsc` to `effect-tsgo patch`. `patch` rewrites the compiler in `node_modules`. With a shared store (pnpm global virtual store, Yarn PnP, Nix), the change reaches other projects.
- An install with `--ignore-scripts` skips `prepare`. Then stock `tsc` runs without Effect diagnostics and exits 0.
- Add `"prepare": "effect-tsgo patch"` only when an editor or a tool starts stock `tsc` and the store is not shared. `effect-tsgo unpatch` restores the files.

GitHub Actions steps. `--strict` makes Effect warnings fail. The last step adds annotations to the pull request and type checks a second time.

```yaml
- run: bun install --frozen-lockfile
- run: bun run typecheck
- run: bun x effect-tsgo diagnostics --project tsconfig.json --format github-actions --strict
# pnpm: pnpm install --frozen-lockfile, pnpm run typecheck, pnpm exec effect-tsgo diagnostics ...
```

## Output formats and exit codes

| Command | Output | Exits 1 on |
|---|---|---|
| `effect-tsgo tsc -p tsconfig.json` | `src/main.ts(4,3): error TS377001: <message> effect(floatingEffect)` | type errors, Effect errors, Effect warnings |
| `effect-tsgo diagnostics --format text` | `<path>(4,3): error effect(floatingEffect): <message>`, then a summary | Effect errors |
| `diagnostics` with `--strict` | as above | Effect errors and warnings |
| `diagnostics --format github-actions` or `json` | `::error file=<path>,line=4,...,title=floatingEffect::<message>`, or `{ "diagnostics": [...], "summary": {...} }` | as for `text` |
| `effect-tsgo oxlint --type-aware` | `src/main.ts:4:3: error effecttsgo(floating-effect): <message>` | errors |

## Suppression, Oxlint, and editors

**Suppression.** Fix the code first: see the `lint-no-suppressions` skill. When the user approves an exception, write `// @effect-diagnostics-next-line floatingEffect:off` with the bare rule name. The `effect/floatingEffect:off` form does not work in `@effect/tsgo`.

**Oxlint (optional, experimental).** Use it only when the project already runs type-aware Oxlint.

1. Install `oxlint` and `oxlint-tsgolint` at versions from the tsgo support table.
2. In `.oxlintrc.json`, set `"$schema": "./node_modules/@effect/tsgo/oxlint-schema.json"` and `"extends": ["./node_modules/@effect/tsgo/oxlint-presets/recommended.json"]`. Other presets: `strict`, `correctness`, `antipattern`, `effect-native`, `style`, `maintainers`.
3. Run `effect-tsgo oxlint --type-aware`. Stock `oxlint` fails with `Unknown plugin: 'effecttsgo'`.
4. Set `"diagnostics": false` in the tsconfig plugin to stop duplicate reports. Then the Oxlint command is the Effect gate in hooks and CI.

**Editors.** Use `effect-tsgo` instead of `tsgo`, not next to it, because two servers give duplicate diagnostics. A Language Server Protocol (LSP) client starts `effect-tsgo tsc --lsp --stdio`. For VS Code, run `npx @effect/tsgo setup --non-interactive --accept-defaults --typescript --vscode`. Without `--apply`, it prints the changes and writes nothing. The VS Code settings include `"js/ts.experimental.useTsgo": true` and need the patched `typescript` (`effect-tsgo patch`).

## Setup check

Confirm that the gate fails on a floating Effect. The file must be inside the `include` paths of `tsconfig.json`.

```sh
printf 'import { Effect } from "effect"\nexport const program = Effect.gen(function*() {\n  Effect.log("never runs")\n})\n' > src/effect-setup-check.ts
bun run typecheck   # must exit 1 and print effect(floatingEffect)
rm src/effect-setup-check.ts
```

## Sources

- https://github.com/Effect-TS/tsgo: support table, `tsc`, `patch`, `diagnostics`, `allowedUnstableApis`, LSP command
- https://github.com/Effect-TS/tsgo/blob/main/docs/README.md: Oxlint setup and presets
- https://github.com/Effect-TS/language-service: TypeScript 5 and 6 plugin and `patch`
- https://bun.com/docs/runtime/check, https://pnpm.io/global-virtual-store, https://oxc.rs/docs/guide/usage/linter/config
