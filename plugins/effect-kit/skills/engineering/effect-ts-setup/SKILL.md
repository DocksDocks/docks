---
name: effect-ts-setup
description: "Use when bootstrapping Effect-TS in a repo — detect the package manager (pnpm/npm/bun), install `effect` (+ `@effect/platform`/`@effect/cli` by project type), wire the `@effect/language-service` tsconfig plugin + `prepare` patch, apply the recommended tsconfig, add a `typecheck` script, and write an Effect best-practices block into AGENTS.md/CLAUDE.md. Effect 3.x. Not for porting Fastify/Next/React code (use effect-ts-port) or writing Effect patterns (use effect-ts-specialist)."
user-invocable: true
metadata:
  pattern: tool-wrapper
  updated: "2026-06-03"
  content_hash: "533b5b4341d872fca01fb6ea127c98b46398b07e6666fc8d0368565eb3d24694"
---

# Effect-TS Setup (one-time repo bootstrap)

Configure a repository to work well with Effect: the right dependencies, the language-service diagnostics, a strict-enough tsconfig, a type-check script, and an agent-instruction block so future AI sessions know the conventions. Modeled on Kit Langton's effect.solutions agent-guided setup, but self-contained — it needs no external CLI (and opportunistically uses `effect-solutions` when present).

<constraint>
Gate every mutation behind explicit confirmation. Before initializing a project, installing packages, editing `tsconfig.json`, editing `package.json` scripts, writing into `AGENTS.md`/`CLAUDE.md`, or cloning a source tree — print the exact change as your FINAL message and STOP. Do not call `Write`/`Edit` or run the install/clone command until the user replies. (On Claude, `AskUserQuestion` may collect the package-manager / project-type choices; the STOP gate before each write still applies.) This is the only portable pause — "STOP and await" without ending the turn gets bypassed.
</constraint>

<constraint>
Target **Effect 3.x stable**. Install with NO version pin (let the package manager take latest 3.x). `Schema` lives in **`effect/Schema`** — NEVER install `@effect/schema` (deprecated, folded into core in 3.10). The source-reference clone (Step 7) is **`Effect-TS/effect`** (the v3 monorepo), not `effect-smol` (that's the v4 beta).
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
- [ ] (optional) Clone Effect source reference
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

## Step 2 — Install dependencies (gate)

| Project type | Packages (no version pin) |
|---|---|
| Always | `effect` |
| CLI app | `+ @effect/cli @effect/platform-node` |
| HTTP server/client | `+ @effect/platform` (+ `@effect/platform-node` on Node) |
| React app | `+ @effect-atom/atom-react` |
| Tests | `-D @effect/vitest vitest` |

```bash
# example (pnpm) — confirm before running:
pnpm add effect @effect/platform
```

Never add `@effect/schema`. Print the exact command, STOP, then run on confirmation.

## Step 3 — Language service (gate)

`@effect/language-service` adds edit-time + build-time Effect diagnostics (floating effects, missing context, anti-patterns). Install it, register the tsconfig plugin, add the `prepare` patch, and set the editor to the workspace TypeScript. Full steps + the diagnostics catalog: `references/language-service.md`.

## Step 4 — tsconfig (gate)

Compare the repo's `tsconfig.json` to the recommended strict baseline and MERGE (don't overwrite). The exact `compilerOptions`, the "bundler vs `tsc`" rule of thumb, and the VS Code/Cursor settings: `references/tsconfig.md`.

## Step 5 — Package scripts (gate)

If no type-check script exists, add one (keep an existing one):

```jsonc
// simple project:
"typecheck": "tsc --noEmit"
// monorepo with project references:
"typecheck": "tsc --build --noEmit"
```

## Step 6 — Agent-instruction block (gate)

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

## Step 7 — Effect source reference (optional, gate)

For grep-able ground truth on Effect 3.x APIs, offer a shallow clone of the **v3** monorepo to a shared path:

```bash
git clone --depth 1 https://github.com/Effect-TS/effect.git ~/.local/share/effect-kit/effect
# update later: git -C ~/.local/share/effect-kit/effect pull --depth 1
```

Then add a one-line `## Local Effect Source` note pointing at that path. Optional — skip if the user declines.

## Step 8 — Summary

Report: package manager, steps completed vs skipped (with reasons), files created/modified, any errors + how resolved. Offer to continue with `effect-ts-specialist` (patterns) or `effect-ts-port` (migrate existing code).

> Large monorepo / multi-package setup? This bootstrap is single-session and mechanical — but if the work spans many packages, offer to write a tracked plan via **`plan-manager`** instead of doing it all inline.

## Gotchas

| Gotcha | Consequence | Right move |
|---|---|---|
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

- The repo already uses Effect and you're writing code — use **`effect-ts-specialist`**.
- Migrating an existing Fastify/Next/React app — use **`effect-ts-port`** (it runs setup detection as its phase 0).
