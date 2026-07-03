# Recommended tsconfig

Effect leans on precise types — a strict tsconfig is what makes the requirement/error channels catch mistakes. MERGE these into the repo's existing `tsconfig.json`; don't overwrite settings the user already chose.

## Baseline `compilerOptions`

```jsonc
{
  "compilerOptions": {
    // build performance
    "incremental": true,
    "composite": true,

    // module / target
    "target": "ES2022",
    "module": "NodeNext",
    "moduleDetection": "force",

    // imports
    "verbatimModuleSyntax": true,
    "rewriteRelativeImportExtensions": true,

    // type-safety (the part that matters most for Effect)
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,

    // dev ergonomics
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true,

    // the language-service plugin (see language-service.md)
    "plugins": [{ "name": "@effect/language-service" }]
  }
}
```

`exactOptionalPropertyTypes` + `strict` are the load-bearing flags — they make `Schema` optional fields and the error channel behave as written.

## Rule of thumb: who compiles your code?

| Situation | Settings |
|---|---|
| A bundler (Vite, esbuild, Next, tsx) compiles your code; `tsc` only type-checks | `"module": "preserve"`, `"moduleResolution": "bundler"`, `"noEmit": true` |
| `tsc` compiles (a library, an npm package, a Node app/CLI) | `"module": "NodeNext"`, `"declaration": true` (+ `"composite"`/`"declarationMap"` for a monorepo) |

So a Next.js or Vite app uses the bundler row; a published library or a `tsc`-built CLI uses the `tsc` row.

## Monorepo (project references)

Each package extends a shared `tsconfig.base.json` and the root composes them with `references`. Use `"composite": true` per package and a root `typecheck` of `tsc --build --noEmit`. Keep one `tsconfig.base.json` holding the language-service plugin so every package inherits the diagnostics.

## Editor settings (recap)

```json
// .vscode/settings.json — required for the LSP plugin to run
{
  "typescript.tsdk": "./node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

## Notes

- If the repo has no `tsconfig.json`, create one with the baseline above (pick the bundler vs `tsc` row by project type).
- Don't silently flip a setting the user set differently (e.g. they intentionally disabled `noUnusedLocals`) — surface the diff and let them choose.
- `skipLibCheck: true` is recommended for speed; it does not weaken your own code's type-checking.
