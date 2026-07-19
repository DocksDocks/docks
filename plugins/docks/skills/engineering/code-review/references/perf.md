# Performance Finding Catalog

Per-axis expansion of the parent SKILL.md Step 3 (performance bucket). Load when triaging a perf finding. Pairs with the universal `<constraint>` rules: evidence-bearing file:line, articulated failure scenario, calibrated severity.

## Pattern Catalog — Per Domain

### Database / ORM

| Symptom in code | What's wrong | Severity floor |
|---|---|---|
| `users.forEach(async u => await loadOrders(u.id))` | N+1 — one query per user | HIGH |
| `.findOne({ where: { email } })` with no index on `email` | Full table scan per call | HIGH if hot path |
| `await Promise.all(items.map(... .findOne))` for 10k items | Unbounded fan-out, connection-pool exhaustion | HIGH |
| `SELECT *` in a result with 50 columns when only 3 are needed | Wastes IO + memory, breaks projection-only indexes | MEDIUM |
| Transaction held while doing external HTTP | Lock held during network latency | HIGH |

### Hot Path / Loop

| Symptom | What's wrong | Severity floor |
|---|---|---|
| `const arr = []; for (...) arr.push(...)` in tight loop with known size | Repeated grow + copy; pre-size or use typed array | LOW-MEDIUM |
| `JSON.parse(JSON.stringify(obj))` to clone in a request handler | O(n) clone on every request; structured clone or shallow ok | MEDIUM |
| Regex compiled inside the loop body | Recompiled per iteration | MEDIUM |
| String concatenation with `+=` over 10k items | Quadratic in some engines; use array join | LOW-MEDIUM |

### Async / IO

| Symptom | What's wrong | Severity floor |
|---|---|---|
| `fs.readFileSync` on the request path | Blocks the event loop | HIGH |
| Missing `await` on an async call that returns a promise | Silent unhandled rejection; race conditions | HIGH |
| Sequential `await` for independent calls (`await a; await b;`) | Wall-clock cost = sum; should be `Promise.all` | MEDIUM |
| `setTimeout(fn, 0)` for "concurrency" | Doesn't actually parallelize; usually a code smell | LOW |

### Frontend / Render

| Symptom | What's wrong | Severity floor |
|---|---|---|
| New object/array literal in render: `<Foo opts={{x: 1}} />` | New reference every render → child re-renders | MEDIUM |
| Function defined in render passed as prop without `useCallback` | Same as above; child re-renders on every parent render | LOW-MEDIUM |
| Heavy compute in render body (sort/filter of large list) | Runs on every render; move to `useMemo` or compute upstream | MEDIUM |
| `useEffect` dep array references unstable identity | Effect re-runs every render | MEDIUM |
| Unmemoized context value `<Ctx.Provider value={{ ... }}>` | All consumers re-render on every parent render | MEDIUM-HIGH |

## Severity Calibration

| Question | If yes → | If no → |
|---|---|---|
| Does this run on a hot path (request handler, render, animation)? | Keep severity floor | Drop 1 tier |
| Does it scale with user input (N items) where N can be ≥1000? | Keep severity floor | Drop 1 tier |
| Is there an observed perf regression (benchmark, profiler, user report)? | Bump 1 tier (now it's measurable, not theoretical) | Cap at HIGH |
| Does it block other operations (event loop, main thread, DB lock)? | Keep severity floor | Drop 1 tier |

A perf finding without a measurement is theoretical — cap at HIGH and mark "verify with profile."

## False-Positive Guards

| Pattern | Why it triggers | Why it's not a bug |
|---|---|---|
| Loop with `await` inside | Looks sequential | Order may be required (each iteration depends on the previous) |
| `JSON.parse(JSON.stringify(...))` | Looks wasteful | May be the intent (deep clone, strip non-serializable fields) |
| `Promise.all(map(async ...))` over a list | Looks like unbounded fan-out | List size may be bounded (UI shows ≤10; config caps it); read upstream |
| `useEffect` with empty deps + setState | Looks like cascade | May be intentional one-shot init; check |
| Synchronous file read | Looks blocking | May be at module load time (allowed) |

## Output Template (extends the parent SKILL.md format)

```text
HIGH · Performance · src/api/dashboard.ts:67
  Evidence:
    for (const user of users) {
      const orders = await db.orders.findAll({ where: { userId: user.id } })
      user.orderCount = orders.length
    }
  Why it's a problem: N+1 — one query per user. Dashboard for 200 users
    makes 201 queries. p95 latency observed at 2.3s for this endpoint.
  Suggested fix: single GROUP BY query:
    `SELECT userId, COUNT(*) FROM orders WHERE userId IN (?) GROUP BY userId`
    then join in memory.
  Measurement: capture before/after with EXPLAIN ANALYZE or @opentelemetry/api span timing.
```

## See Also

- `../SKILL.md` — universal 5-step review procedure + constraints
- `fix-workflow` references/perf-fix-templates.md — once findings are approved for fix
- `react-component-patterns` references/effects.md — when the finding is a React effect/render cascade
