# Agent rules for an Effect project

The installed `effect` package carries the style rules for its version. The project `AGENTS.md` only points agents at those files and names the checks.

## Contents

- [AGENTS.md block](#agentsmd-block)
- [What not to put in AGENTS.md](#what-not-to-put-in-agentsmd)
- [Sources to trust](#sources-to-trust)
- [Sources to avoid](#sources-to-avoid)
- [Feedback loop](#feedback-loop)
- [Official skills](#official-skills)

## AGENTS.md block

```md
## Effect

This project uses Effect 4 (`effect` <effect-version>). Every `@effect/*` package has the same exact version.
Before you write Effect code, read `node_modules/effect/AGENTS.md` completely.
Follow its links into `node_modules/effect/ai-docs/src/` when you need an example.
For APIs that the guide does not cover, search `node_modules/effect/src/` and `node_modules/@effect/*/src/`.
Do not use web search, blog posts, or memory for Effect APIs. They often show Effect 3 or beta names.
`Effect.Service`, `Context.Tag`, `catchAll`, `Either`, `ServiceMap`, `TaggedErrorClass`, and `effect/unstable/*` do not exist in Effect 4.
Run Effect programs only in <entry-file>. All other code returns an Effect.
Check: `<pm> run typecheck` runs `effect-tsgo tsc` with Effect diagnostics. It must exit 0.
Tests: `@effect/vitest` (`it.effect`, `layer(...)`, `TestClock` from `effect/testing`). Run `<pm> run test`.
Never silence a type error or an Effect diagnostic with `as any`, `@ts-expect-error`, or an `@effect-diagnostics` comment.
```

- Replace `<pm>` with `bun`, `pnpm`, or `npm`. Replace `<entry-file>` with the entry files, for example `src/main.ts`.
- Update `<effect-version>` in the commit that upgrades Effect.
- Optional: name the folder for layers and the file that holds the `ManagedRuntime`, if the project has one.

## What not to put in AGENTS.md

- A copy of the shipped guide or a long rule list. Both drift from the installed version.
- Setup for `effect-mcp`, the `effect-solutions` command-line tool, or an `effect-smol` clone. See [Sources to avoid](#sources-to-avoid).
- Code examples with `effect/unstable/*`, `Schema.TaggedErrorClass`, or `ServiceMap`.
- Instructions to run Effect tests with `bun test`. `@effect/vitest` needs Vitest.

## Sources to trust

| Source | Why |
|---|---|
| `node_modules/effect/AGENTS.md` | The official agent guide, shipped in the package and matched to the installed version. It has the same text as https://github.com/Effect-TS/effect/blob/main/LLMS.md |
| `node_modules/effect/ai-docs/src/` | Example programs that the guide links to (https://github.com/Effect-TS/effect/tree/main/ai-docs/src) |
| `node_modules/effect/src/` | The readable source, with documentation comments on each export |
| A vendored copy of the Effect repository | The Effect blog advises it, because many agents do not search `node_modules` (https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive) |

To vendor the source, add it as a read-only git subtree. Use the tag of the installed version, so that the copy matches `node_modules`.

```sh
git subtree add --prefix=repos/effect https://github.com/Effect-TS/effect.git effect@<effect-version> --squash
```

Then add these lines to the block: "Read `repos/effect/LLMS.md` before you write Effect code. Treat `repos/` as read only. Do not import from `repos/`."

## Sources to avoid

| Source | Reason |
|---|---|
| `effect-mcp`, a Model Context Protocol (MCP) server (https://github.com/tim-smart/effect-mcp) | A personal project outside the Effect-TS organization. Its bundled guide teaches Effect 3 names: `Effect.Service`, `Context.Tag`, `catchAll` |
| `effect-solutions` (https://github.com/kitlangton/effect-solutions) | It is pinned to an Effect 4 beta. Its docs use `Schema.TaggedErrorClass` and `effect/unstable/http`. Its agent setup clones `effect-smol` |
| A clone of `effect-smol` (https://github.com/Effect-TS/effect-smol) | The repository is archived and read only. The Effect 4 source is in https://github.com/Effect-TS/effect |
| Third-party skills pinned to a beta, for example https://github.com/tenequm/skills/tree/main/skills/effect-ts | It teaches `Schema.TaggedErrorClass` and `effect/unstable/httpapi`. These names do not exist in Effect 4 |

## Feedback loop

1. **Check command.** The block names `<pm> run typecheck`. One pass reports type errors and Effect diagnostics. The agent fixes the code until the command exits 0.
2. **One line per finding.** `effect-tsgo diagnostics --project tsconfig.json --format text` prints the rule name on each line. Use `--format json` for tools that parse the output.
3. **Pre-push hook.** A hook runs the check command before each push. Continuous integration (CI) runs the same command. The `ci-speed` skill covers hook tools.
4. **Language Server Protocol (LSP).** A harness with LSP support can start `effect-tsgo tsc --lsp --stdio` for live diagnostics and quick fixes. To confirm it, open a file with a floating Effect and look for `floatingEffect`.

By default, suggestions print in the type check output (`includeSuggestionsInTsc`). They steer the agent, but they do not fail the check.

## Official skills

The Effect team publishes agent skills in https://github.com/Effect-TS/skills (MIT license). Its `effect-ts` skill sets up a repository: it adds an `AGENTS.md` block that points at `node_modules/effect/AGENTS.md` and `node_modules/effect/src`. Install the skills with `npx skills add Effect-TS/skills`. This docks skill uses the same approach. It adds the diagnostics gate, the test gate, and the table of names that do not exist in Effect 4.

## Sources

- https://github.com/Effect-TS/skills/blob/main/skills/effect-ts/SKILL.md
- https://github.com/Effect-TS/tsgo: `diagnostics` formats, LSP command, `includeSuggestionsInTsc`
- https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive
