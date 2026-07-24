---
name: effect-ts-setup
description: "Use when bootstrapping Effect 3.x in a repo — resolve package.json plus the lockfile, install `effect` and relevant official packages, wire `@effect/language-service`, merge tsconfig, add typecheck, and write Effect conventions. Complete an explicit setup request as one bounded change. Not for Effect v4 setup (unsupported), Effect v4 code (use effect-v4), Fastify/Next/React porting (use effect-ts-port), or existing Effect code (use effect-ts-specialist)."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-07-24"
  content_hash: "87d799eced4df3b3b1912a6c5e3704c60e23b72e16b551cd6441da8621950272"
---

# Effect-TS Setup (one-time repo bootstrap)

Configure a repository to work well with Effect: the right dependencies, the language-service diagnostics, a strict-enough tsconfig, a type-check script, and an agent-instruction block so future AI sessions know the conventions. Modeled on Kit Langton's effect.solutions agent-guided setup, but self-contained — it needs no external CLI (and opportunistically uses `effect-solutions` when present).

<constraint>
An explicit setup request authorizes this bounded local bootstrap. Detect and merge first, then complete the applicable install, configuration, agent-context, and verification steps in one workflow; do not stop for confirmation before each command or file write. Ask once only when multiple/no lockfiles leave the package manager unresolved or repository evidence cannot determine a materially different project type. After that answer, continue without another confirmation loop. A plan-only request reports the reviewed setup plan and stops; an implementation request executes it.
</constraint>

<constraint>
Resolve `package.json` plus the lockfile (or installed package) before selecting guidance, then use exactly one primary Effect skill for the current boundary: this skill for an explicit Effect 3.x bootstrap, `effect-ts-port` for an existing Fastify/Next/React migration, `effect-ts-specialist` for resolved 3.x code, or `effect-v4` for resolved/explicit v4 code. Do not load them as an umbrella. This setup targets **Effect 3.x stable**; v4 setup remains unsupported. Install with no version pin only while the package manager's current default resolves 3.x. `Schema` lives in **`effect/Schema`** — NEVER install `@effect/schema`. The optional source reference is **`Effect-TS/effect`**, not the v4 prerelease repository.
</constraint>

<constraint>
Detect before you write — never clobber. Read existing `tsconfig.json`, `package.json` scripts, and agent files first; MERGE recommended settings into what's there rather than overwriting, and keep a `typecheck` script the repo already defines. Write the agent block only between the `<!-- effect-kit:start -->` / `<!-- effect-kit:end -->` markers (replace in place if they exist) so re-running is idempotent.
</constraint>

## Checklist (show once at the start)

```text
- [ ] Detect repo state + package manager
- [ ] Install Effect dependencies
- [ ] Wire @effect/language-service
- [ ] Apply tsconfig settings
- [ ] Add typecheck script
- [ ] Write agent-instruction block
- [ ] (explicitly requested only) Clone Effect source reference
- [ ] Summary
```

## Step 1 — Detect (read-only)

```bash
ls -la package.json tsconfig.json bun.lock pnpm-lock.yaml package-lock.json yarn.lock .vscode AGENTS.md CLAUDE.md .claude .cursorrules 2>/dev/null
file AGENTS.md CLAUDE.md 2>/dev/null | grep -i link   # detect symlinks
```

Resolve the package manager from the lock file, then confirm:

| Lock file | Package manager |
|---|---|
| `pnpm-lock.yaml` | pnpm |
| `bun.lock` | bun |
| `package-lock.json` | npm |
| `yarn.lock` | yarn |
| multiple | ASK which to use |
| none | ASK preference (default pnpm); `package.json` absent → offer `<pm> init` first |

Infer project type from deps/files (drives Step 2): a CLI (bin entry), an HTTP server/client (fastify/express/next/fetch usage), a React app, or a plain library.

## Step 2 — Install dependencies

| Project type | Packages (no version pin) |
|---|---|
| Always | `effect` |
| CLI app | `+ @effect/cli @effect/platform-node` |
| HTTP server/client | `+ @effect/platform` (+ `@effect/platform-node` on Node) |
| React app | `+ @effect-atom/atom-react` |
| Tests | `-D @effect/vitest vitest` |

```bash
# example (pnpm):
pnpm add effect @effect/platform
```

Never add `@effect/schema`. Run the resolved package-manager command as part of the bounded setup; do not insert a per-command confirmation stop.

## Step 3 — Language service

`@effect/language-service` adds edit-time + build-time Effect diagnostics (floating effects, missing context, anti-patterns). Install it, register the tsconfig plugin, add the `prepare` patch, and set the editor to the workspace TypeScript. Full steps + the diagnostics catalog: `references/language-service.md`.

## Step 4 — tsconfig

Compare the repo's `tsconfig.json` to the recommended strict baseline and MERGE (don't overwrite). The exact `compilerOptions`, the "bundler vs `tsc`" rule of thumb, and the VS Code/Cursor settings: `references/tsconfig.md`.

## Step 5 — Package scripts

If no type-check script exists, add one (keep an existing one):

```jsonc
// simple project:
"typecheck": "tsc --noEmit"
// monorepo with project references:
"typecheck": "tsc --build --noEmit"
```

## Step 6 — Agent-instruction block

Write this managed block so future agents follow the conventions. Insert between the markers (replace in place if present — idempotent):

```markdown
<!-- effect-kit:start -->
## Effect Best Practices

Target **Effect 3.x stable**. Before writing Effect code, consult the `effect-ts-specialist` skill — services & layers, tagged errors, `effect/Schema`, `Config`, `ManagedRuntime`, `@effect/vitest`. `Schema` is `effect/Schema`, never `@effect/schema`.

Deeper references when available: `bunx effect-solutions@latest show <topic>` (Bun CLI), context7 (`effect`), or a cloned `Effect-TS/effect` tree. Never guess an Effect API — verify first.
<!-- effect-kit:end -->
```

Placement by file state:

| State | Action |
|---|---|
| Both `AGENTS.md` + `CLAUDE.md` exist, not symlinked | Write the block into both |
| One exists | Write into it; optionally create the other as a symlink/`@AGENTS.md` shim |
| One is a symlink of the other | Write the real file only |
| Neither | Create `AGENTS.md` with the block; add `CLAUDE.md` = `@AGENTS.md` |

## Step 7 — Effect source reference (optional, explicit only)

Clone a grep-able Effect 3.x source reference only when the current user request explicitly includes that network read; otherwise skip it without opening a confirmation turn:

```bash
git clone --depth 1 https://github.com/Effect-TS/effect.git ~/.local/share/effect-kit/effect
# update later: git -C ~/.local/share/effect-kit/effect pull --depth 1
```

Then add a one-line `## Local Effect Source` note pointing at that path. Never infer this optional external read from a normal local setup request.

## Step 8 — Summary

Report: package manager, steps completed vs skipped (with reasons), files created/modified, and any errors plus their resolution. Name a later matching Effect skill only if the user separately requests that work after dependency resolution; do not stack another Effect skill onto setup by default.

For a large monorepo or multi-package setup, route the complete implementation request through the unified **`plan-manager`** when it warrants a canonical plan; after review, continue without asking for a lifecycle command.

## Gotchas

| Gotcha | Consequence | Right move |
|---|---|---|
| Pausing before every install/edit | Turns one mechanical setup into a user-scheduled workflow | Ask once only for material package-manager/project ambiguity, then complete the bounded setup |
| Installing `@effect/schema` | Deprecated package, wrong types | `effect/Schema` ships in core |
| Pinning an Effect version | Drifts from latest 3.x, peer-dep friction | Install unpinned; let the PM resolve |
| Overwriting an existing `tsconfig.json` | Wipes the user's settings | Read first; merge recommended keys |
| `tsc` ignores the LSP plugin at build time | No build-time Effect diagnostics | Run `effect-language-service patch` in a `prepare` script |
| Editor uses the bundled TS, not the workspace | Plugin diagnostics never show | Set `typescript.tsdk` + select workspace version |
| Appending the agent block twice on re-run | Duplicated section | Replace between the `<!-- effect-kit:start/end -->` markers |
| Cloning `effect-smol` for a v3 project | v4 APIs mislead the agent | Clone `Effect-TS/effect` for v3 ground truth |

## References

| Read for | File |
|---|---|
| `@effect/language-service` install, plugin config, build patch, diagnostics | `references/language-service.md` |
| Recommended `compilerOptions`, bundler-vs-tsc rule, editor settings | `references/tsconfig.md` |

## When this skill does NOT apply

- Effect v4 setup or a repository already resolved to Effect 4.x — setup is unsupported; use **`effect-v4`** only for v4 code/review, never install v3 over it.
- The repo already uses Effect 3.x and you're writing code — use **`effect-ts-specialist`**.
- Migrating an existing Fastify/Next/React app — use **`effect-ts-port`** after resolving package and lock evidence.
