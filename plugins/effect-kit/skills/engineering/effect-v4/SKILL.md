---
name: effect-v4
description: "Use when writing or reviewing Effect v4 code, when package.json plus the lockfile resolve `effect` 4.x (including beta/prerelease), or when the user explicitly requests Effect v4 — services, layers, Schema, Config, Schedule, Cache, Stream, unstable HTTP, and @effect/vitest. Inspect both dependency files before version-specific code. Not for Effect 3.x; use effect-ts-specialist."
user-invocable: false
license: MIT
compatibility: "Requires an installed Effect 4 dependency or an explicit Effect v4 request. Effect v4 is prerelease at this vendored snapshot."
metadata:
  pattern: upstream-adapted
  updated: "2026-07-15"
  upstream:
    repository: https://github.com/kitlangton/skills
    commit: "30dee8607214c893dd89f6eee65c669ef3dce8c9"
    path: skills/effect
    source: https://github.com/kitlangton/skills/tree/30dee8607214c893dd89f6eee65c669ef3dce8c9/skills/effect
    license: MIT
    vendored_at: "2026-07-15"
    patches:
      - "Renamed effect to effect-v4 and added reciprocal Effect Kit routing."
      - "Added package.json plus lockfile version gating and prerelease drift checks."
      - "Replaced mutable-upstream runtime lookup with installed-package inspection; added Docks reference TOCs."
  content_hash: "be01d73f90ff4a9325daa0d189edccf135d37ddf46ef45e9a8e9d18bff1e6944"
---

# Effect v4 Specialist

This is version-gated guidance for Effect v4. It adapts Kit Langton's pinned production guide while keeping Effect Kit's established Effect 3.x skills intact.

<constraint>
Before supplying version-specific code, inspect both `package.json` and the repository lockfile (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lock`, or the project's equivalent). Resolve the actual `effect` major from the lockfile or installed `node_modules/effect/package.json`; do not infer it from a range alone. A resolved 3.x dependency routes to **`effect-ts-specialist`**. Never write v4 APIs into a 3.x project.
</constraint>

<constraint>
Effect v4 is beta/prerelease at this vendored snapshot (`effect@4.0.0-beta.98`; npm `latest` remains 3.x). For an unfamiliar or moving API, inspect the installed package's exports, declarations, and source before using it. The pinned official snapshot is supporting evidence, not permission to download mutable guidance at runtime or to assume a later beta has the same surface.
</constraint>

<constraint>
Do not install, upgrade, migrate, or rewrite dependencies merely to activate this skill. An explicit v4 request permits v4 explanation or isolated examples, but if the current project resolves Effect 3.x, report the conflict and keep v4 code out of that project. V4 setup and v3-to-v4 migration are outside this skill.
</constraint>

## Version routing

| Evidence | Route |
|---|---|
| Lockfile or installed package resolves `effect` 4.x, including a prerelease | Continue with `effect-v4` |
| User explicitly asks for Effect v4 and the project has no Effect dependency | Give clearly labelled v4 guidance; do not install dependencies |
| Project resolves `effect` 3.x | Stop v4 generation; use `effect-ts-specialist` |
| `package.json` and lockfile disagree, or the resolved major is unclear | Stop and resolve the version evidence before code |
| Explicit Effect 3.x setup request | Use `effect-ts-setup` |
| Explicit Effect 3.x Fastify, Next.js, or React port request | Use `effect-ts-port` |
| Explicit or resolved Effect v4 setup/port/migration request | Report unsupported; do not activate a v3 skill |
| Generic TypeScript request with no Effect signal | Do not use an Effect Kit skill |

```text
BAD: package.json says "effect": "^4.0.0-beta.1", so emit the newest remembered v4 API.
GOOD: read package.json and the lockfile, confirm the resolved v4 build, then verify the API in that installed package.
```

## Source rule

Check these before guessing:

- the nearest `AGENTS.md` and project-local Effect practices
- `package.json`, the lockfile, and the installed `effect` package version/source
- this skill's matching reference branch
- the official source tag matching the installed version when local declarations do not answer the question

Do not fetch mutable `main`, `latest`, or remote skill content while applying this guidance. Project conventions still take precedence when they are valid for the resolved v4 version.

## Branch chooser

Read only the references matching the task. If a task spans branches, read all matching files before editing.

| Task | Reference |
|---|---|
| Data models, schemas, brands, variants, optional keys, decoders | [`SCHEMA.md`](references/SCHEMA.md) |
| Services, layers, runtime wiring, errors, `Effect.fn`, test services | [`SERVICES_LAYERS.md`](references/SERVICES_LAYERS.md) |
| Runtime config, env, `ConfigProvider`, `layerConfig` | [`CONFIG.md`](references/CONFIG.md) |
| Retry, repeat, polling, backoff, jitter, rate-limit policies | [`SCHEDULING.md`](references/SCHEDULING.md) |
| Memoization, TTL caches, concurrent lookup dedupe, batching | [`CACHING.md`](references/CACHING.md) |
| Streams, async sources, queues/pubsubs, pagination, backpressure | [`STREAMS.md`](references/STREAMS.md) |
| Outgoing HTTP, status handling, HTTP rate limiting | [`HTTP_CLIENTS.md`](references/HTTP_CLIENTS.md) |
| Effect tests, time, concurrency synchronization, fakes | [`TESTING.md`](references/TESTING.md) |

## Core defaults

- Compose workflows with `Effect.gen(function* () { ... })`.
- Define public and non-trivial internal service methods with `Effect.fn("Domain.operation")`.
- Prefer `Context.Service` for application services unless the project has a verified current convention.
- Build implementations with `Layer.effect(Service, Effect.gen(...))` and return `Service.of({ ... })`.
- Model records with `Schema.Struct(...)` plus a same-name `interface`.
- Model typed Effect errors with `Schema.TaggedErrorClass`.
- Read runtime config through `Config`, not direct `process.env` access in application logic.
- Use `Schedule` for retry, repeat, polling, pacing, and backoff.
- Use `Stream` for effectful multi-value sources needing pull, backpressure, interruption, or transformation.
- Treat `effect/unstable/*`, especially HTTP modules, as explicitly moving and verify the installed export first.
- Prefer Effect-aware tests, explicit layers, and deterministic synchronization over sleeps.
- Decode untrusted input with `Schema.decodeUnknownEffect(...)` or `schema.makeEffect(...)`; reserve throwing `schema.make(...)` for trusted construction.

## Quick selection guide

| Need | Default |
|---|---|
| Object record | `Schema.Struct(...)` plus a same-name `interface` |
| Scalar ID/value object | Constrained branded schema |
| Internal state/decision union | `Data.TaggedEnum` plus `Data.taggedEnum()` |
| Boundary-crossing variant/union | `Schema.TaggedStruct` / `Schema.TaggedUnion` |
| Expected typed failure | `Schema.TaggedErrorClass` |
| Unknown boundary payload | `Schema.decodeUnknownEffect(...)` |
| Service boundary | `Context.Service<Service, Interface>()(...)`, `Layer.effect(...)`, `Service.of(...)` |
| Runtime configuration | `Config` in layers; `ConfigProvider` overrides in tests |
| Event source | `Stream`, consumed with `Stream.runForEach(...)` |
| Keyed TTL lookup cache | `Cache.make(...)` or exit-aware `Cache.makeWith(...)` |
| Outgoing HTTP | Verified `effect/unstable/http` `HttpClient` surface |
| Time-sensitive test | `TestClock`, never real sleeping |

## Boundary rules

- Keep HTTP handlers thin: decode input, read context, call services, map typed errors.
- Keep business rules in domain functions or services, not transport handlers.
- Wrap HTTP clients, SDKs, CLIs, and external integrations in named effects at adapter boundaries.
- Decode persisted or external values that are not already trusted.
- Keep network/provider calls outside authoritative database transactions.
- Retry only when idempotency is proven; let exhausted failures remain visible without a truthful fallback.

## Do nots

- Do not use `as any`, non-null assertions, or unchecked casts to silence Effect typing problems.
- Do not introduce `Schema.Class` or `Schema.TaggedClass` as default application models.
- Do not hand-roll `_tag` errors when `Schema.TaggedErrorClass` fits.
- Do not use cause-level recovery when typed-error recovery is enough.
- Do not use `Layer.mergeAll(...)` or `provideMerge(...)` as blind make-it-compile tools.
- Do not hide required authority, credentials, persistence, or transports behind `Context.Reference` defaults.
- Do not add arbitrary `Effect.sleep(...)` to tests when deterministic synchronization exists.
- Do not hand-roll Map/TTL/prune caches when `effect/Cache` fits.

## Provenance and integration changes

The guidance and eight progressive-disclosure references were vendored from Kit Langton's MIT-licensed `skills/effect` at commit `30dee8607214c893dd89f6eee65c669ef3dce8c9` on 2026-07-15. API claims were checked against official `effect@4.0.0-beta.98` source at tag commit `3e4abbcb0d0e9a5e82b6b88c7ef7ab69900105ec`.

Integration changes are limited to the renamed skill, strict Effect Kit routing, package/lockfile gating, explicit prerelease and unstable-module cautions, removal of mutable runtime lookups, compacting duplicated selection prose, and Docks-required reference tables of contents. The existing Effect 3.x setup, port, and specialist skills remain separate.

## When this skill does not apply

- Effect 3.x implementation or review — use **`effect-ts-specialist`**.
- First-time Effect 3.x setup — use **`effect-ts-setup`**.
- Fastify, Next.js, or React porting specifically to Effect 3.x — use **`effect-ts-port`**.
- Effect v4 installation, v3-to-v4 migration, or dependency upgrades — no Effect Kit skill covers these in this release.
