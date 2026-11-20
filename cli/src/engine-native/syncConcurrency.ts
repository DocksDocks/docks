/**
 * EngineNative bounded-concurrency runner, which tidy and the tidy report use
 * for their parallel probes. index.ts re-exports it so existing import paths
 * keep working.
 */

export type SyncConcurrency = 1 | 2 | 3;
export type SyncTask<T> = () => Promise<T>;

/**
 * Run input-ordered tasks with bounded overlap. Once one task rejects, queued
 * tasks stay queued while already-started tasks drain; the earliest rejection
 * in input order is then propagated.
 */
export async function runBounded<T>(
  tasks: ReadonlyArray<SyncTask<T>>,
  concurrency: SyncConcurrency,
): Promise<Array<T>> {
  const results = new Array<T>(tasks.length);
  const failures = new Map<number, unknown>();
  let nextIndex = 0;
  let stopped = false;

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    for (;;) {
      if (stopped || nextIndex >= tasks.length) return;
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await tasks[index]!();
      } catch (error) {
        failures.set(index, error);
        stopped = true;
      }
    }
  });
  await Promise.all(workers);

  for (let index = 0; index < tasks.length; index += 1) {
    if (failures.has(index)) throw failures.get(index);
  }
  return results;
}
