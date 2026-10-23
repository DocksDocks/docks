// The plan-CLI cases load this hook through `--import`, so the waits of `reopen` return at once and the
// suite stays fast; the shipped helper keeps its real waits. Each skipped timeout is appended to the file
// that PLAN_CLI_WAIT_LOG names, so a case can check which pauses and settle wait the helper asked for.
import fs from 'node:fs';

const log = process.env.PLAN_CLI_WAIT_LOG;

Atomics.wait = (_typedArray, _index, _value, timeout) => {
  if (log) fs.appendFileSync(log, `${timeout}\n`);
  return 'timed-out';
};
