# JavaScript and TypeScript toolchain

Use this file to make the continuous integration (CI) install, format, lint, and type check steps fast. Do not lose a check. Measure each step before and after each change.

## Contents

- [Install](#install)
- [Format](#format)
- [Lint](#lint)
- [Type check](#type-check)
- [Job sketches](#job-sketches)
- [Sources](#sources)

## Install

| Package manager | Frozen install in CI | Cache path (key on the lockfile) | Setup action |
|---|---|---|---|
| Bun | `bun ci` (same as `bun install --frozen-lockfile`) | `~/.bun/install/cache` or `$BUN_INSTALL_CACHE_DIR` | `oven-sh/setup-bun` reads `packageManager` and caches only the Bun binary |
| pnpm 12 | `pnpm install` (frozen in CI by default) | the output of `pnpm store path` and `pnpm cache path` | `pnpm/setup` or `pnpm/action-setup` reads `packageManager` |
| npm | `npm ci` | `~/.npm` (`actions/setup-node` with `cache: npm`) | `actions/setup-node` |

- Bun does not turn on frozen mode in CI by itself. Always run `bun ci` in CI.
- Bun skips dependency lifecycle scripts unless `trustedDependencies` lists the package. So untrusted packages run no postinstall downloads.
- Do not install pnpm through Corepack. The pnpm docs say so, and Node.js 25 and later do not ship Corepack.
- If you use `actions/setup-node` with `cache: pnpm`, put pnpm on `PATH` first. Run `pnpm/action-setup` before `actions/setup-node`.
- Also cache the `pnpm cache path` directory. The pnpm docs say that a store cache alone may not make the install faster.
- `npm ci` deletes an existing `node_modules`. Cache `~/.npm`, not `node_modules`.
- Let only trusted events write dependency caches, such as `push` to the default branch. `github-actions.md` explains the cache scope.
- In jobs without browser tests, set `CYPRESS_INSTALL_BINARY=0` and `PUPPETEER_SKIP_DOWNLOAD=true`.
- In the end-to-end (E2E) job, run `cypress install`. Cache the `CYPRESS_CACHE_FOLDER` directory.
- In a monorepo, install only the packages that the job needs: `pnpm install --filter "<pkg>..."` or `bun install --filter "<pkg>..."`.
- A filtered install can be faster than a `node_modules` cache restore. The Linear engineering team measured this. Measure both on your repository.

## Format

A format check is the cheapest gate. Run it first, so that a format error stops the run early.

| Formatter | CI command | Notes |
|---|---|---|
| `bun fmt` (since Bun 1.4.4) | `bun fmt --no-script --check` | Reads Prettier and oxfmt configuration. Needs no install. Exit codes: 0 clean, 1 needs formatting, 2 error |
| oxfmt | `oxfmt --check` | `oxfmt --migrate=prettier` converts a Prettier configuration |
| Prettier | `prettier . --check` | Exit codes: 0 clean, 1 needs formatting, 2 Prettier error |

- If `package.json` has a `fmt` script, `bun fmt` runs that script. Pass `--no-script` in CI.
- A formatter swap is a proposal. Make it only when the user asks.
- Before a swap, run the new formatter with `--check` on an unchanged tree. Each listed file is a diff that the swap adds.

## Lint

Oxlint implements many rules from ESLint core, typescript-eslint, React, Jest, Vitest, import, unicorn, and jsx-a11y. It does not implement every rule.

- Convert an ESLint flat configuration with `@oxlint/migrate`. Convert a legacy `.eslintrc` to flat configuration first.
- During a staged move, run `oxlint && eslint`.
- Put `eslint-plugin-oxlint` last in `eslint.config.js`. It turns off the ESLint rules that oxlint already covers.
- Use `...oxlint.configs['flat/recommended']` or `...(await oxlint.buildFromConfigFile('./.oxlintrc.json'))` for that last entry.
- Type-aware rules (`--type-aware` or root `options.typeAware: true`) need the `oxlint-tsgolint` dev dependency.
- Type-aware rules use TypeScript 7 configuration rules. Remove `baseUrl` from the tsconfig files.
- In a monorepo, build the packages before type-aware lint. Their `.d.ts` files must exist.
- Add `--deny-warnings` so that a warning fails the job.
- Inside GitHub Actions, oxlint turns on GitHub annotations by itself.
- Warning: oxlint lints `node_modules` when no ignore rule covers it. Add dependencies and build output to `.gitignore` or `ignorePatterns`.
- ESLint in CI: use `eslint --cache --cache-strategy content --cache-location <path>`. Restore `<path>` with `actions/cache`.
- A fresh checkout changes file times. So the default `metadata` cache strategy misses.
- Warning: the ESLint cache does not track dependencies between files. Do not let `--cache` gate merges on type-aware or import rules.
- An ESLint run without `--cache` deletes the cache file.
- `eslint --concurrency <n>|auto` lints files in worker threads. Keep `<n>` at or below the runner core count.

## Type check

TypeScript 7 `tsc` is the native compiler and the default checker. Install the `typescript` package at major 7.

- Do not add `@typescript/native-preview` or `tsgo`. The `tsc` of TypeScript 7 supersedes them.
- `--checkers <n>` sets the checker worker count. The default is a fixed count, not the core count. Print it with `tsc --help --all`.
- On a small runner, such as the single-core `ubuntu-slim`, lower `--checkers`. Use one value everywhere, because different values can rarely change results.
- `--builders <n>` applies to `tsc -b`. It multiplies with `--checkers`.
- For a warm start, set `incremental`. Cache the `.tsbuildinfo` files, keyed on the lockfile and the tsconfig files, with a restore key.
- Before you rely on that cache, compare a warm run and a clean run on the same commit.
- TypeScript 7 turns TypeScript 6 defaults and deprecations into errors, for example `baseUrl` and `moduleResolution: node10`. Plan that migration as its own change.
- Another option is `oxlint --type-aware --type-check`. It reports TypeScript errors in the lint run. It is experimental.

TypeScript 7.0 has no programmatic application programming interface (API). Tools that import `typescript`, such as typescript-eslint and Volar-based tools, need TypeScript 6 under the `typescript` name:

```json
{ "devDependencies": { "typescript": "npm:@typescript/typescript6@^6", "@typescript/native": "npm:typescript@^7" } }
```

`bun check` (since Bun 1.4.3) is the faster Bun option. It applies TypeScript 7 rules and needs no `typescript` package. Know its limits:

- It writes no `.tsbuildinfo`. Every run is a full check, and there is nothing to cache.
- It emits no `.d.ts` or JavaScript. Keep `tsc` for declarations.
- It ignores `compilerOptions.plugins`, so it gives no language-service plugin diagnostics, such as Effect diagnostics.
- If `package.json` has a `check` script, `bun check` runs that script. Pass `--no-script`, or name the script `typecheck`.
- Do not define `"check": "bun check"`. A Bun version without the checker runs that script in an endless loop.
- Inside GitHub Actions, it prints `::error` annotations. Add `--threads <n>` on shared runners.

Before you switch checkers, prove parity on the same commit. Compare error codes and counts, because the output formats differ. Then add one known type error. Both checkers must fail.

```bash
bun x tsc --noEmit --pretty false > old.txt || true   # the checker in use
bun check --no-script --no-pretty > new.txt || true   # the candidate
diff <(grep -oE 'TS[0-9]+' old.txt | sort | uniq -c) <(grep -oE 'TS[0-9]+' new.txt | sort | uniq -c)
```

## Job sketches

Both sketches use `runs-on: ${{ vars.CI_RUNNER_LINUX || 'ubuntu-latest' }}`. `runner-fallback.md` explains this expression. Verify each action major before you copy a sketch: `gh release view --repo <owner>/<repo> --json tagName -q .tagName`.

```yaml
# Bun project. package.json has "packageManager": "bun@<version>".
jobs:
  check:
    runs-on: ${{ vars.CI_RUNNER_LINUX || 'ubuntu-latest' }}
    steps:
      - uses: actions/checkout@v7
      - uses: oven-sh/setup-bun@v2            # version from packageManager
      - run: bun fmt --no-script --check      # needs no install, so it fails first
      - uses: actions/cache@v6
        with:
          path: ~/.bun/install/cache
          key: bun-${{ runner.os }}-${{ hashFiles('bun.lock') }}
          restore-keys: bun-${{ runner.os }}-
      - run: bun ci
      - run: bun x oxlint --type-aware --deny-warnings
      - run: bun x tsc --noEmit               # default; bun check --no-script is the faster option
      - run: bun test
```

```yaml
# pnpm 12 project. package.json has "packageManager": "pnpm@<version>".
jobs:
  check:
    runs-on: ${{ vars.CI_RUNNER_LINUX || 'ubuntu-latest' }}
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/setup@v3                   # pnpm from packageManager; runs a frozen install
        with: { runtime: "node@<major>", cache: true }
      - run: pnpm exec prettier . --check     # the project formatter, first after the install
      - run: pnpm exec oxlint --type-aware --deny-warnings
      - run: pnpm exec tsc --noEmit
      - run: pnpm exec vitest run
```

## Sources

- Install: https://bun.com/docs/pm/cli/install, https://bun.com/docs/pm/global-cache, https://bun.com/docs/pm/filter, https://github.com/oven-sh/setup-bun, https://pnpm.io/continuous-integration, https://pnpm.io/cli/install, https://github.com/pnpm/setup, https://github.com/pnpm/action-setup, https://docs.npmjs.com/cli/v11/commands/npm-ci, https://github.com/actions/setup-node, https://github.com/actions/cache/blob/main/examples.md, https://nodejs.org/en/blog/release/v25.0.0
- Postinstall downloads and filtered installs: https://docs.cypress.io/app/references/advanced-installation, https://pptr.dev/api/puppeteer.configuration, https://linear.app/now/ci-bottleneck-reworked
- Format: https://bun.com/docs/format, https://bun.com/blog/bun-v1.4.4, https://oxc.rs/docs/guide/usage/formatter, https://prettier.io/docs/cli
- Lint: https://oxc.rs/docs/guide/usage/linter.html, https://oxc.rs/docs/guide/usage/linter/migrate-from-eslint.html, https://github.com/oxc-project/eslint-plugin-oxlint, https://oxc.rs/docs/guide/usage/linter/type-aware.html, https://oxc.rs/docs/guide/usage/linter/ci, https://eslint.org/docs/latest/use/command-line-interface
- Type check: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/, https://www.typescriptlang.org/tsconfig/#incremental, https://github.com/microsoft/typescript-go, https://bun.com/docs/runtime/check, https://bun.com/blog/bun-v1.4.3, https://docs.github.com/en/actions/reference/runners/github-hosted-runners
