# React → Effect (effect-atom)

The React binding is **`@effect-atom/atom-react`** (`tim-smart/effect-atom`, MIT — the successor to `@effect-rx/rx-react`). Atoms are fine-grained reactive cells with first-class Effect integration: an Effect-backed atom surfaces a `Result` (Initial / Success / Failure), so loading and error states are modeled, not improvised.

## Contents

- [Install + (optional) provider](#install--optional-provider)
- [Basic state + hooks](#basic-state--hooks)
- [Server/async state — Effect-backed atoms + `Result`](#serverasync-state--effect-backed-atoms--result)
- [Services & layers in components — `Atom.runtime`](#services--layers-in-components--atomruntime)
- [Actions / mutations — `Atom.fn`](#actions--mutations--atomfn)
- [Migration map](#migration-map)
- [Slicing](#slicing)

## Install + (optional) provider

```bash
pnpm add @effect-atom/atom-react        # peers: effect ^3.19, react >=18 <20
```

No provider is required — hooks fall back to a default registry. Wrap with `RegistryProvider` only for SSR initial values or custom GC config:

```tsx
import { RegistryProvider } from "@effect-atom/atom-react"
<RegistryProvider initialValues={[[countAtom, 99]]}>{children}</RegistryProvider>
```

`atom-react` re-exports `Atom`, `Result`, `Registry` — import everything from it.

## Basic state + hooks

```tsx
import { Atom, useAtom, useAtomValue, useAtomSet } from "@effect-atom/atom-react"

const countAtom = Atom.make(0)

function Counter() {
  const [count, setCount] = useAtom(countAtom)   // [value, setter]; setCount(c => c + 1)
  // or split:  const count = useAtomValue(countAtom);  const setCount = useAtomSet(countAtom)
}
```

Derived/computed atoms take a getter; they recompute when any `get(...)` dependency changes:

```tsx
const doubledAtom = Atom.make((get) => get(countAtom) * 2)
const label       = Atom.map(countAtom, (n) => `Count: ${n}`)
```

## Server/async state — Effect-backed atoms + `Result`

```tsx
import { Atom, Result, useAtomValue } from "@effect-atom/atom-react"
import { Effect, Schema } from "effect"

const userAtom = Atom.make((get) =>
  Effect.gen(function* () {
    const id = get(userIdAtom)
    const res = yield* Effect.tryPromise(() => fetch(`/api/users/${id}`))
    return yield* Schema.decodeUnknown(User)(yield* Effect.tryPromise(() => res.json()))
  }),
)   // value type is Result<User, ...>; re-runs automatically when userIdAtom changes

function UserCard() {
  const result = useAtomValue(userAtom)
  return Result.match(result, {
    onInitial: () => <Spinner />,
    onFailure: (f) => <Error cause={f.cause} />,
    onSuccess: (s) => <div style={{ opacity: s.waiting ? 0.5 : 1 }}>{s.value.name}</div>,
  })
}
```

`success.waiting` is the stale-while-revalidate flag (a refresh is in flight but the old value still shows). There's also a fluent `Result.builder(result).onInitial(...).onErrorTag("NotFound", ...).onSuccess(...).render()`.

## Services & layers in components — `Atom.runtime`

```tsx
import { Atom } from "@effect-atom/atom-react"
import { Effect } from "effect"

const runtimeAtom = Atom.runtime(Users.Default)        // bridge an Effect Layer into atoms
const usersAtom = runtimeAtom.atom(
  Effect.gen(function* () { return yield* (yield* Users).getAll }),
)   // Atom<Result<User[], ...>>
// global layers once:  Atom.runtime.addGlobalLayer(LoggerLive)
```

## Actions / mutations — `Atom.fn`

```tsx
import { Atom, useAtomSet } from "@effect-atom/atom-react"
const createUserAtom = runtimeAtom.fn(
  Effect.fnUntraced(function* (name: string) { return yield* (yield* Users).create(name) }),
)
function NewUser() {
  const create = useAtomSet(createUserAtom, { mode: "promiseExit" })
  const onSubmit = async (name: string) => {
    const exit = await create(name)            // Promise<Exit<User, E>>
    if (exit._tag === "Success") { /* ... */ }
  }
}
```

Keyed atoms: `const todoAtom = Atom.family((id: string) => runtimeAtom.atom(getTodo(id)))` → `useAtomValue(todoAtom(id))`.

## Migration map

| Today | With effect-atom |
|---|---|
| `useState` for **local/ephemeral UI** (form input, toggles) | **Keep it** — atoms are for shared/async/server state |
| `useState`/`useReducer` for **shared** state | `Atom.make(value)` + `useAtom`/`useAtomValue`/`useAtomSet` |
| Selectors / `useMemo` over store | derived `Atom.make((get) => ...)` / `Atom.map` |
| React Query / SWR query | `runtimeAtom.atom(effect).pipe(Atom.withReactivity(keys))`; `Result` replaces `{isLoading,isError,data}` |
| React Query mutation + `invalidateQueries` | `runtimeAtom.fn(effect, { reactivityKeys })` — completing it refreshes matching query atoms |
| Optimistic update boilerplate | `Atom.optimistic` / `Atom.optimisticFn` (auto-rollback on failure) |
| Zustand / Jotai store | atoms (same mental model; `useAtom` trio mirrors Jotai) |

## Slicing

Lift one piece of shared/server state into an atom at a time, leaving `useState` for local concerns. A component reading an Effect-backed atom doesn't need a `ManagedRuntime` in the tree — `Atom.runtime(Layer)` carries the services. One atom (+ its consumers) per slice; the component renders the three `Result` states explicitly.

> effect-atom is pre-1.0 (0.5.x) — the API is settling. Verify hook/combinator names against the current docs (atom.kitlangton.com examples, or `tim-smart/effect-atom`) before relying on a less-common one.
