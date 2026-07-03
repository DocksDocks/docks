# @effect/language-service

A TypeScript language-service plugin that adds Effect-aware diagnostics: it catches floating effects, missing requirements/errors in the type, and a long list of anti-patterns — at edit time in the editor, and (via a patch) at build time under `tsc`.

## 1. Install (dev dependency)

```bash
pnpm add -D @effect/language-service     # or npm i -D / bun add -d
```

## 2. Register the tsconfig plugin

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/Effect-TS/language-service/refs/heads/main/schema.json",
  "compilerOptions": {
    "plugins": [{ "name": "@effect/language-service" }]
  }
}
```

The plugin accepts options (all optional): `diagnostics`, `diagnosticSeverity`, `refactors`, `quickinfo`, `completions`, `goto`, `inlays`, `barrelImportPackages`, `namespaceImportPackages`. Start with the bare `{ "name": "@effect/language-service" }` and tune later.

## 3. Point the editor at the workspace TypeScript

A TS language-service plugin only runs under the workspace TypeScript, not VS Code's bundled copy.

```json
// .vscode/settings.json
{
  "typescript.tsdk": "./node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

Then: Command Palette → "TypeScript: Select TypeScript Version" → "Use Workspace Version". (Cursor is identical; JetBrains/NVim-vtsls/Emacs have their own workspace-TS settings.)

## 4. Build-time diagnostics (patch `tsc`)

`tsc` does not load language-service plugins, so the package patches the local `typescript`/`tsc` to emit Effect diagnostics even with `noEmit`/composite builds. Make it persistent with a `prepare` script:

```bash
pnpm exec effect-language-service patch     # one-off
```

```json
// package.json
{ "scripts": { "prepare": "effect-language-service patch" } }
```

CLI verbs: `setup`, `config`, `patch`, `unpatch`, `check`, `diagnostics`, `quickfixes`, `codegen`, `overview`, `layerinfo`.

## 5. Per-line control

```ts
// @effect-diagnostics effect/floatingEffect:off
// @effect-diagnostics effect/floatingEffect:error
// @effect-diagnostics *:off
```

## Diagnostics catalog (what it catches)

| Category | Examples |
|---|---|
| **Correctness** | `floatingEffect` (Effect not yielded/run), `missingEffectContext`, `missingEffectError`, `missingLayerContext`, `missingStarInYieldEffectGen` (`yield` vs `yield*`) |
| **Anti-pattern** | `tryCatchInEffectGen`, `runEffectInsideEffect`, `multipleEffectProvide`, `strictEffectProvide` (provide at entry only), `leakingRequirements`, `scopeInLayerEffect` (use `Layer.scoped`) |
| **Effect-native** (migration) | `processEnvInEffect` → `Config`, `globalFetchInEffect` → Effect HTTP, `globalConsoleInEffect` → `Effect.log`, `globalDateInEffect` → `Clock`/`DateTime`, `globalRandom` → `Random`, `globalTimersInEffect` → `Effect.sleep`/`Schedule`, `instanceOfSchema` → `Schema.is` |
| **Style** | `effectDoNotation` (prefer `Effect.gen`/`Effect.fn`), `schemaStructWithTag` → `Schema.TaggedStruct`, `unnecessaryEffectGen`, `unnecessaryPipe` |

Plus refactors/codegens: async-function → `Effect.gen`/`Effect.fn`, `Effect.Service` ↔ `Context.Tag` conversion, "Layer Magic" auto-composition, structural-type → `Schema`, and a mermaid Layer-graph in quickinfo. These are the same anti-patterns the `effect-ts-specialist` skill warns about — the LSP enforces them mechanically.
