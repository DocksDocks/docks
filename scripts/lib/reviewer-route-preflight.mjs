// reviewer-route-preflight.mjs — prove a reviewer route BEFORE a review permit is
// reserved.
//
// A permit was burned because the shipped route answered `usage_limit_reached` and a
// hastily chosen replacement replied off-contract; both facts were only discovered
// after the reservation, when the run could no longer take them back. Executability
// alone does not catch either: the binary existed and spawned fine in both cases.
//
// So this probe actually RUNS the route once against a trivial fixed prompt and
// reports three separately observable facts:
//
//   spawned   - the process started at all (no ENOENT/EACCES)
//   exitZero  - it exited 0 (a quota refusal usually does not)
//   jsonFound - its output contains a parseable JSON object (an off-contract reply
//               that is prose, a banner, or a bare error string does not)
//
// It is cheap, bounded by an explicit timeout, reads no plan record, and writes
// nothing anywhere. It never throws for a failing route: a failing route is a RESULT.
import { spawnSync } from 'node:child_process';

export const PROBE_PROMPT = 'Reply with exactly this JSON object and nothing else: {"probe":"ok"}';
export const PLACEHOLDER = '{{PROMPT}}';
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_CAPTURE = 4096;

// Scans for the first balanced, parseable JSON object. A reviewer reply is routinely
// wrapped in prose or a fenced block, and a route that emits a usable object inside
// that wrapper is a working route; a bare `[]`, a number or a quoted string is not.
export function findJsonObject(text) {
  if (typeof text !== 'string') return null;
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === '{') depth += 1;
      else if (character === '}') {
        depth -= 1;
        if (depth !== 0) continue;
        const candidate = text.slice(start, index + 1);
        try {
          const parsed = JSON.parse(candidate);
          if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch {
          // Not JSON after all - keep scanning from the next '{'.
        }
        break;
      }
    }
  }
  return null;
}

/**
 * Probes a reviewer route with a trivial prompt.
 *
 * @param {object} options
 * @param {string[]} options.argv reviewer argv; every `{{PROMPT}}` element is replaced by the probe prompt.
 * @param {number} [options.timeoutMs] hard bound on the probe (default 60000).
 * @param {string} [options.prompt] override the fixed probe prompt.
 * @param {string} [options.cwd] working directory for the probe.
 * @param {NodeJS.ProcessEnv} [options.env] environment for the probe.
 * @param {Function} [options.spawn] injection seam for tests; defaults to spawnSync.
 * @returns {{usable: boolean, spawned: boolean, exitZero: boolean, jsonFound: boolean,
 *            exitCode: number|null, signal: string|null, timedOut: boolean,
 *            durationMs: number, reason: string, argv: string[]|null,
 *            stdout: string, stderr: string}}
 */
export function probeReviewerRoute({
  argv,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  prompt = PROBE_PROMPT,
  cwd,
  env,
  spawn = spawnSync,
} = {}) {
  const failure = (reason, extra = {}) => ({
    usable: false,
    spawned: false,
    exitZero: false,
    jsonFound: false,
    exitCode: null,
    signal: null,
    timedOut: false,
    durationMs: 0,
    argv: null,
    stdout: '',
    stderr: '',
    reason,
    ...extra,
  });

  if (!Array.isArray(argv) || argv.length === 0) return failure('argv must be a non-empty array');
  if (!argv.every((element) => typeof element === 'string')) return failure('argv must contain only strings');
  if (argv[0].trim() === '') return failure('argv[0] is empty');
  if (!argv.includes(PLACEHOLDER)) return failure(`argv contains no ${PLACEHOLDER} placeholder`);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return failure('timeoutMs must be a positive number');

  const probeArgv = argv.map((element) => (element === PLACEHOLDER ? prompt : element));
  const startedAt = Date.now();
  let result;
  try {
    result = spawn(probeArgv[0], probeArgv.slice(1), {
      cwd,
      env,
      encoding: 'utf8',
      timeout: timeoutMs,
      // The probe must never inherit or block on a terminal: a route that waits for
      // input would otherwise hang until the timeout instead of failing fast.
      input: '',
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    return failure(`spawn threw: ${error.message}`, { durationMs: Date.now() - startedAt, argv: probeArgv });
  }
  const durationMs = Date.now() - startedAt;
  const stdout = (result.stdout ?? '').slice(0, MAX_CAPTURE);
  const stderr = (result.stderr ?? '').slice(0, MAX_CAPTURE);

  if (result.error !== undefined && result.error !== null && result.signal === null && result.status === null) {
    return failure(`did not spawn: ${result.error.message}`, { durationMs, argv: probeArgv, stdout, stderr });
  }

  const timedOut = result.signal !== null && result.error?.code === 'ETIMEDOUT';
  const spawned = true;
  const exitZero = result.status === 0;
  const jsonFound = findJsonObject(`${stdout}\n${stderr}`) !== null;
  const reason = timedOut
    ? `timed out after ${timeoutMs}ms`
    : !exitZero
      ? `exit ${result.status ?? `signal ${result.signal}`}: ${(stderr || stdout).trim().split('\n')[0].slice(0, 200)}`
      : jsonFound
        ? 'route spawns, exits 0 and returns a JSON object'
        : 'exited 0 but returned no JSON object (off-contract reply)';

  return {
    usable: exitZero && jsonFound && !timedOut,
    spawned,
    exitZero,
    jsonFound,
    exitCode: result.status ?? null,
    signal: result.signal ?? null,
    timedOut,
    durationMs,
    argv: probeArgv,
    stdout,
    stderr,
    reason,
  };
}
