import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jcs, sha256, validatePlanRun } from './plan-run.mjs';

export const QUEUE_MARKER = 'Plan-queue: PlanQueueV1';

const QUEUE_HEADER = '| Stage | Goal ID | Plan | Depends on | Why |';
const QUEUE_ALIGNMENT = '|---:|---|---|---|---|';
const HASH = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ELIGIBLE_STATUSES = new Set(['planned', 'scheduled']);
const STARTED_STATUSES = new Set(['ongoing', 'finished']);
const USAGE =
  'Usage: node plan-queue.mjs <check|show|next|add|move|remove> <queue-path> [--repo <path>] ' +
  '[--expected-sha256 <digest>] [--stage <integer>] [--goal-id <uuid>] [--label <text>] ' +
  '[--depends-on <goal-id,...|—>] [--why <text>] [--lock-root <path>] [--lock-timeout-ms <integer>]';

function fail(message) {
  throw new Error(message);
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${label} must be a plain object`);
}

function assertClosed(value, requiredKeys, optionalKeys, label) {
  assertPlainObject(value, label);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} contains unknown field ${key}`);
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) fail(`${label} is missing ${key}`);
  }
}

function decodeQueue(bytes) {
  const input = Buffer.from(bytes);
  if (input.length >= 3 && input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) {
    fail('PlanQueueV1 must not contain a UTF-8 BOM');
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(input);
  } catch {
    fail('PlanQueueV1 must be valid UTF-8');
  }
  if (/\r(?!\n)/.test(text)) fail('PlanQueueV1 must not contain CR-only newlines');
  return text.replaceAll('\r\n', '\n');
}

function unfencedLineIndexes(lines) {
  const indexes = [];
  let fence = null;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^ {0,3}(`{3,}|~{3,})/.exec(lines[index]);
    if (match !== null) {
      const marker = match[1][0];
      if (fence === null) {
        fence = { marker, width: match[1].length };
      } else if (marker === fence.marker && match[1].length >= fence.width) {
        fence = null;
      }
      continue;
    }
    if (fence === null) indexes.push(index);
  }
  return indexes;
}

function tableCells(line) {
  if (!line.startsWith('|') || !line.endsWith('|')) fail('PlanQueueV1 table row is malformed');
  const cells = [];
  let cell = '';
  for (let index = 1; index < line.length - 1; index += 1) {
    const character = line[index];
    if (character === '\\' && line[index + 1] === '|') {
      cell += '|';
      index += 1;
    } else if (character === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function parseDependsOn(raw, rowNumber) {
  if (raw === '—') return [];
  const dependencies = raw.split(',').map((value) => value.trim());
  if (dependencies.length === 0 || dependencies.some((value) => value === '')) {
    fail(`PlanQueueV1 row ${rowNumber} dependency list is malformed`);
  }
  const seen = new Set();
  for (const dependency of dependencies) {
    if (!UUID.test(dependency)) fail(`PlanQueueV1 row ${rowNumber} dependency must be a lowercase UUID`);
    if (seen.has(dependency)) fail(`PlanQueueV1 row ${rowNumber} repeats dependency ${dependency}`);
    seen.add(dependency);
  }
  return dependencies;
}

function parseQueueInternal(bytes) {
  const text = decodeQueue(bytes);
  const lines = text.split('\n');
  const unfenced = unfencedLineIndexes(lines);
  const markerIndexes = unfenced.filter((index) => lines[index] === QUEUE_MARKER);
  if (markerIndexes.length === 0) fail(`PlanQueueV1 marker is missing; expected ${QUEUE_MARKER}`);
  if (markerIndexes.length > 1) fail('PlanQueueV1 marker is duplicated');

  const headerIndexes = unfenced.filter((index) => lines[index] === QUEUE_HEADER);
  if (headerIndexes.length === 0) fail(`PlanQueueV1 table is missing; expected ${QUEUE_HEADER}`);
  if (headerIndexes.length > 1) fail('PlanQueueV1 table is duplicated');
  const headerIndex = headerIndexes[0];
  if (lines[headerIndex + 1] !== QUEUE_ALIGNMENT) {
    fail(`PlanQueueV1 table alignment is malformed; expected ${QUEUE_ALIGNMENT}`);
  }

  const rows = [];
  let rowEnd = headerIndex + 2;
  let previousStage = 0;
  const goals = new Set();
  while (rowEnd < lines.length && lines[rowEnd].startsWith('|')) {
    const rowNumber = rows.length + 1;
    const cells = tableCells(lines[rowEnd]);
    if (cells.length !== 5) fail(`PlanQueueV1 row ${rowNumber} must contain exactly five columns`);
    if (!/^[0-9]+$/.test(cells[0])) fail(`PlanQueueV1 row ${rowNumber} stage must be a positive integer`);
    const stage = Number(cells[0]);
    if (!Number.isSafeInteger(stage) || stage <= 0) {
      fail(`PlanQueueV1 row ${rowNumber} stage must be a positive integer`);
    }
    if (stage < previousStage) fail('PlanQueueV1 rows must be ordered by ascending stage');
    previousStage = stage;

    const goalId = cells[1];
    if (!UUID.test(goalId)) fail(`PlanQueueV1 row ${rowNumber} Goal ID must be a lowercase UUID`);
    if (goals.has(goalId)) fail(`PlanQueueV1 duplicate goal id ${goalId}`);
    goals.add(goalId);

    const labelMatch = /^`([^`]+)`$/.exec(cells[2]);
    if (labelMatch === null || labelMatch[1].trim() === '') {
      fail(`PlanQueueV1 row ${rowNumber} Plan label must be nonempty text in backticks`);
    }
    const why = cells[4].trim();
    if (why === '') fail(`PlanQueueV1 row ${rowNumber} reason must be nonempty`);
    rows.push({
      stage,
      goal_id: goalId,
      label: labelMatch[1],
      depends_on: parseDependsOn(cells[3], rowNumber),
      why,
    });
    rowEnd += 1;
  }

  return {
    headerIndex,
    lines,
    marker: QUEUE_MARKER,
    rowEnd,
    rows,
    text,
  };
}

export function parseQueue(bytes) {
  const parsed = parseQueueInternal(bytes);
  return { rows: parsed.rows, marker: parsed.marker, headerIndex: parsed.headerIndex };
}

function repositoryRoot(repo) {
  if (typeof repo !== 'string' || repo === '') fail('queue repository path must be nonempty');
  let root;
  try {
    root = fs.realpathSync(repo);
  } catch {
    fail('queue repository path does not exist');
  }
  if (!fs.statSync(root).isDirectory()) fail('queue repository path must be a directory');
  return root;
}

function walkMarkdown(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name, 'en'),
  );
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkMarkdown(entryPath));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(entryPath);
  }
  return files;
}

function scanPlanRecords(repo) {
  const root = repositoryRoot(repo);
  const records = new Map();
  for (const area of ['active', 'finished']) {
    for (const file of walkMarkdown(path.join(root, 'docs', 'plans', area))) {
      let validated;
      try {
        validated = validatePlanRun(fs.readFileSync(file), { acceptanceProof: 'recorded' });
      } catch {
        continue;
      }
      const goalId = validated.run.goal_id;
      const record = {
        path: path.relative(root, file).split(path.sep).join('/'),
        status: validated.status,
        title: validated.frontmatter.title,
      };
      const matches = records.get(goalId) ?? [];
      matches.push(record);
      records.set(goalId, matches);
    }
  }
  return records;
}

export function resolvePlanRecords(options) {
  assertClosed(options, ['repo'], [], 'queue resolution options');
  const records = new Map();
  for (const [goalId, matches] of scanPlanRecords(options.repo)) {
    records.set(
      goalId,
      matches.map(({ path: recordPath, status }) => ({ path: recordPath, status })),
    );
  }
  return records;
}

function assertGraph(rows) {
  const byGoal = new Map(rows.map((row) => [row.goal_id, row]));
  for (const row of rows) {
    for (const dependency of row.depends_on) {
      if (!byGoal.has(dependency)) {
        fail(`PlanQueueV1 goal ${row.goal_id} has unqueued dependency ${dependency}`);
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const visit = (goalId) => {
    if (visiting.has(goalId)) fail(`PlanQueueV1 dependency cycle includes ${goalId}`);
    if (visited.has(goalId)) return;
    visiting.add(goalId);
    for (const dependency of byGoal.get(goalId).depends_on) visit(dependency);
    visiting.delete(goalId);
    visited.add(goalId);
  };
  for (const row of rows) visit(row.goal_id);

  for (const row of rows) {
    for (const dependency of row.depends_on) {
      const dependencyRow = byGoal.get(dependency);
      if (dependencyRow.stage >= row.stage) {
        fail(
          `PlanQueueV1 dependency ${dependency} for ${row.goal_id} must be at an earlier stage, not the same/later stage`,
        );
      }
    }
  }
  return byGoal;
}

function dependencyClosure(row, byGoal) {
  const closure = new Set();
  const visit = (goalId) => {
    if (closure.has(goalId)) return;
    closure.add(goalId);
    for (const dependency of byGoal.get(goalId).depends_on) visit(dependency);
  };
  for (const dependency of row.depends_on) visit(dependency);
  return closure;
}

function validatedQueue(bytes, repo) {
  const parsed = parseQueueInternal(bytes);
  const byGoal = assertGraph(parsed.rows);
  const records = scanPlanRecords(repo);
  const rows = parsed.rows.map((row) => {
    const matches = records.get(row.goal_id) ?? [];
    if (matches.length === 0) fail(`PlanQueueV1 goal ${row.goal_id} resolves to zero current PlanRunV1 records`);
    if (matches.length > 1) fail(`PlanQueueV1 goal ${row.goal_id} resolves to multiple current PlanRunV1 records`);
    const record = matches[0];
    if (typeof record.title !== 'string' || row.label !== record.title) {
      fail(
        `PlanQueueV1 stale Plan label for ${row.goal_id}: queued ${JSON.stringify(row.label)}, ` +
          `resolved title ${JSON.stringify(record.title)}`,
      );
    }
    return { ...row, path: record.path, status: record.status };
  });

  const resolvedByGoal = new Map(rows.map((row) => [row.goal_id, row]));
  for (const row of rows) {
    if (!STARTED_STATUSES.has(row.status)) continue;
    const contradictory = [...dependencyClosure(row, byGoal)].find(
      (goalId) => resolvedByGoal.get(goalId).status !== 'finished',
    );
    if (contradictory !== undefined) {
      fail(
        `PlanQueueV1 dependency state contradicts resolved PlanRun status: ${row.goal_id} is ${row.status} ` +
          `while dependency ${contradictory} is ${resolvedByGoal.get(contradictory).status}`,
      );
    }
  }
  return { parsed, rows, byGoal };
}

export function validateQueue(bytes, options) {
  assertClosed(options, ['repo'], [], 'queue validation options');
  return { rows: validatedQueue(bytes, options.repo).rows };
}

export function showQueue(bytes, options) {
  assertClosed(options, ['repo'], [], 'queue display options');
  return validateQueue(bytes, options).rows;
}

export function nextQueue(bytes, options) {
  assertClosed(options, ['repo'], [], 'queue next options');
  const { byGoal, rows } = validatedQueue(bytes, options.repo);
  const blocked = [];
  const eligible = [];
  for (const row of rows) {
    const closure = dependencyClosure(row, byGoal);
    const waitingOn = rows
      .filter((candidate) => closure.has(candidate.goal_id) && candidate.status !== 'finished')
      .map((candidate) => candidate.goal_id);
    if (waitingOn.length > 0) blocked.push({ row, waiting_on: waitingOn });
    if (ELIGIBLE_STATUSES.has(row.status) && waitingOn.length === 0) eligible.push(row);
  }
  // Every startable row is returned, not just the lowest stage: work runs in parallel, and a row
  // whose own closure is finished is startable no matter what unrelated lower-stage work is still
  // open. Filtering to one stage would hide that row and quietly restore the stage barrier three
  // predecessors of this plan removed. Order is priority only: stage first, then table order.
  return {
    eligible: [...eligible].sort((left, right) => left.stage - right.stage),
    blocked,
  };
}

function markdownCell(value) {
  return value.replaceAll('|', '\\|');
}

function renderRow(row) {
  const dependencies = row.depends_on.length === 0 ? '—' : row.depends_on.join(', ');
  return `| ${row.stage} | ${row.goal_id} | \`${markdownCell(row.label)}\` | ${dependencies} | ${markdownCell(row.why)} |`;
}

function queueBytesWithRows(parsed, rows) {
  const lines = [...parsed.lines];
  lines.splice(parsed.headerIndex + 2, parsed.rowEnd - (parsed.headerIndex + 2), ...rows.map(renderRow));
  return Buffer.from(lines.join('\n'));
}

function normalizeDependencies(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  const seen = new Set();
  return value.map((dependency) => {
    if (typeof dependency !== 'string' || !UUID.test(dependency)) fail(`${label} must contain lowercase UUIDs`);
    if (seen.has(dependency)) fail(`${label} must not contain duplicates`);
    seen.add(dependency);
    return dependency;
  });
}

function normalizeStage(value) {
  if (!Number.isSafeInteger(value) || value <= 0) fail('queue setter stage must be a positive integer');
  return value;
}

function normalizeReason(value) {
  if (typeof value !== 'string' || value.trim() === '') fail('queue setter reason must be nonempty');
  if (/[\r\n]/.test(value)) fail('queue setter reason must be one line');
  return value.trim();
}

function normalizeLabel(value) {
  if (typeof value !== 'string' || value.trim() === '') fail('queue setter label must be nonempty');
  if (/[\r\n`]/.test(value)) fail('queue setter label must be one line without backticks');
  return value;
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}

function readQueueLock(lockPath) {
  try {
    const owner = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    assertClosed(owner, ['schema', 'hostname', 'pid', 'expected_preimage', 'nonce'], [], 'queue lock owner');
    if (
      owner.schema !== 1 ||
      typeof owner.hostname !== 'string' ||
      !Number.isInteger(owner.pid) ||
      owner.pid <= 0 ||
      typeof owner.expected_preimage !== 'string' ||
      !HASH.test(owner.expected_preimage) ||
      typeof owner.nonce !== 'string' ||
      !UUID.test(owner.nonce)
    ) {
      return null;
    }
    return owner;
  } catch {
    return null;
  }
}

function assertQueuePreimage(file, expectedBytesSha256, message) {
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    fail('queue file does not exist');
  }
  if (sha256(bytes) !== expectedBytesSha256) fail(message);
  return bytes;
}

async function acquireQueueLock({ file, expectedBytesSha256, lockRoot, lockTimeoutMs }) {
  const timeoutMs = lockTimeoutMs ?? 1_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) fail('queue lock timeout must be a nonnegative integer');
  const root = lockRoot ?? path.join(os.tmpdir(), 'docks-plan-queue-locks');
  if (typeof root !== 'string' || root === '') fail('queue lock root must be nonempty');
  assertQueuePreimage(file, expectedBytesSha256, 'queue lock preimage is stale');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const lockPath = path.join(root, `${sha256(file)}.lock`);
  const owner = {
    schema: 1,
    hostname: os.hostname(),
    pid: process.pid,
    expected_preimage: expectedBytesSha256,
    nonce: randomUUID(),
  };
  const started = Date.now();
  while (true) {
    try {
      const descriptor = fs.openSync(lockPath, 'wx', 0o600);
      try {
        fs.writeFileSync(descriptor, jcs(owner));
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      return {
        release() {
          const current = readQueueLock(lockPath);
          if (current !== null && current.nonce === owner.nonce) fs.rmSync(lockPath, { force: true });
        },
      };
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
    }

    const existing = readQueueLock(lockPath);
    if (existing === null) fail('queue lock is held by an unreadable owner');
    if (existing.hostname !== os.hostname()) fail('queue lock is held by a foreign owner');
    if (existing.expected_preimage !== expectedBytesSha256) {
      fail('dead queue lock belongs to a different preimage');
    }
    if (!processAlive(existing.pid)) {
      assertQueuePreimage(file, expectedBytesSha256, 'dead queue lock preimage is stale');
      const tombstone = `${lockPath}.reclaim-${process.pid}-${randomUUID()}`;
      try {
        fs.renameSync(lockPath, tombstone);
        fs.rmSync(tombstone, { force: true });
        continue;
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
      }
    }
    if (Date.now() - started >= timeoutMs) fail('queue lock is held or lock acquisition timed out');
    await new Promise((resolve) => setTimeout(resolve, Math.min(10, Math.max(1, timeoutMs))));
  }
}

function fsyncDirectory(directory) {
  const descriptor = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function writeQueueBytes(file, expectedBytesSha256, nextBytes) {
  const directory = path.dirname(file);
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    const descriptor = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeFileSync(descriptor, nextBytes);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    assertQueuePreimage(file, expectedBytesSha256, 'queue CAS preimage changed before atomic rename');
    fs.renameSync(temporary, file);
    fsyncDirectory(directory);
    const readback = fs.readFileSync(file);
    if (!readback.equals(nextBytes)) fail('queue transaction readback mismatch');
    return readback;
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function canonicalQueueFile(file) {
  if (typeof file !== 'string' || file === '') fail('queue setter file is required');
  try {
    return fs.realpathSync(file);
  } catch {
    return path.resolve(file);
  }
}

async function mutateQueue({ file, repo, expectedBytesSha256, lockRoot, lockTimeoutMs, mutate }) {
  if (typeof expectedBytesSha256 !== 'string' || !HASH.test(expectedBytesSha256)) {
    fail('queue setter expected preimage must be a SHA-256 digest');
  }
  const root = repositoryRoot(repo);
  const canonicalFile = canonicalQueueFile(file);
  const currentBytes = assertQueuePreimage(canonicalFile, expectedBytesSha256, 'queue setter stale preimage');
  const parsed = parseQueueInternal(currentBytes);
  const nextRows = mutate(parsed.rows.map((row) => ({ ...row, depends_on: [...row.depends_on] })), root);
  const nextBytes = queueBytesWithRows(parsed, nextRows);
  validateQueue(nextBytes, { repo: root });

  const lock = await acquireQueueLock({
    file: canonicalFile,
    expectedBytesSha256,
    lockRoot,
    lockTimeoutMs,
  });
  try {
    assertQueuePreimage(canonicalFile, expectedBytesSha256, 'queue setter stale preimage');
    validateQueue(nextBytes, { repo: root });
    const readback = writeQueueBytes(canonicalFile, expectedBytesSha256, nextBytes);
    const validated = validateQueue(readback, { repo: root });
    return { bytes_sha256: sha256(readback), rows: validated.rows };
  } finally {
    lock.release();
  }
}

export async function addQueueRow(options) {
  assertClosed(
    options,
    ['file', 'repo', 'expectedBytesSha256', 'row'],
    ['lockRoot', 'lockTimeoutMs'],
    'add queue row options',
  );
  assertClosed(options.row, ['stage', 'goal_id', 'label', 'depends_on', 'why'], [], 'queue row');
  const row = {
    stage: normalizeStage(options.row.stage),
    goal_id: options.row.goal_id,
    label: normalizeLabel(options.row.label),
    depends_on: normalizeDependencies(options.row.depends_on, 'queue row depends_on'),
    why: normalizeReason(options.row.why),
  };
  if (typeof row.goal_id !== 'string' || !UUID.test(row.goal_id)) fail('queue setter goal id must be a lowercase UUID');
  return mutateQueue({
    ...options,
    mutate(rows) {
      if (rows.some((candidate) => candidate.goal_id === row.goal_id)) {
        fail(`PlanQueueV1 duplicate goal id ${row.goal_id}`);
      }
      return [...rows, row].sort((left, right) => left.stage - right.stage);
    },
  });
}

function resolvedTitle(repo, goalId) {
  const matches = scanPlanRecords(repo).get(goalId) ?? [];
  if (matches.length === 0) fail(`PlanQueueV1 goal ${goalId} resolves to zero current PlanRunV1 records`);
  if (matches.length > 1) fail(`PlanQueueV1 goal ${goalId} resolves to multiple current PlanRunV1 records`);
  return matches[0].title;
}

export async function moveQueueRow(options) {
  assertClosed(
    options,
    ['file', 'repo', 'expectedBytesSha256', 'goal_id', 'stage', 'depends_on', 'why'],
    ['lockRoot', 'lockTimeoutMs'],
    'move queue row options',
  );
  if (typeof options.goal_id !== 'string' || !UUID.test(options.goal_id)) {
    fail('queue setter goal id must be a lowercase UUID');
  }
  const stage = normalizeStage(options.stage);
  const dependsOn = normalizeDependencies(options.depends_on, 'queue move depends_on');
  const why = normalizeReason(options.why);
  return mutateQueue({
    ...options,
    mutate(rows, repo) {
      const index = rows.findIndex((row) => row.goal_id === options.goal_id);
      if (index === -1) fail(`PlanQueueV1 goal ${options.goal_id} is not queued`);
      rows[index] = {
        ...rows[index],
        stage,
        label: resolvedTitle(repo, options.goal_id),
        depends_on: dependsOn,
        why,
      };
      return rows.sort((left, right) => left.stage - right.stage);
    },
  });
}

export async function removeQueueRow(options) {
  assertClosed(
    options,
    ['file', 'repo', 'expectedBytesSha256', 'goal_id'],
    ['lockRoot', 'lockTimeoutMs'],
    'remove queue row options',
  );
  if (typeof options.goal_id !== 'string' || !UUID.test(options.goal_id)) {
    fail('queue setter goal id must be a lowercase UUID');
  }
  return mutateQueue({
    ...options,
    mutate(rows) {
      if (!rows.some((row) => row.goal_id === options.goal_id)) {
        fail(`PlanQueueV1 goal ${options.goal_id} is not queued`);
      }
      return rows.filter((row) => row.goal_id !== options.goal_id);
    },
  });
}

function parseFlags(args) {
  const flags = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (typeof name !== 'string' || !name.startsWith('--') || value === undefined || flags.has(name)) fail(USAGE);
    flags.set(name, value);
  }
  return flags;
}

function flag(flags, name, { required = false } = {}) {
  const value = flags.get(name);
  if (required && value === undefined) fail(`${name} is required\n${USAGE}`);
  return value;
}

function assertAllowedFlags(flags, allowed) {
  for (const name of flags.keys()) {
    if (!allowed.has(name)) fail(`unknown flag ${name}\n${USAGE}`);
  }
}

function cliDependencies(value) {
  if (value === '—' || value === '') return [];
  return value.split(',').map((dependency) => dependency.trim());
}

async function main(args) {
  const [command, queuePath, ...flagArgs] = args;
  if (!['check', 'show', 'next', 'add', 'move', 'remove'].includes(command) || queuePath === undefined) fail(USAGE);
  const flags = parseFlags(flagArgs);
  const common = new Set(['--repo']);
  const mutation = new Set([
    ...common,
    '--expected-sha256',
    '--stage',
    '--goal-id',
    '--label',
    '--depends-on',
    '--why',
    '--lock-root',
    '--lock-timeout-ms',
  ]);
  assertAllowedFlags(flags, ['check', 'show', 'next'].includes(command) ? common : mutation);
  const repo = path.resolve(flag(flags, '--repo') ?? process.cwd());
  const file = path.resolve(queuePath);
  if (['check', 'show', 'next'].includes(command) && !fs.existsSync(file)) {
    console.log('no queue');
    return;
  }
  const bytes = ['check', 'show', 'next'].includes(command) ? fs.readFileSync(file) : null;
  if (command === 'check') {
    const result = validateQueue(bytes, { repo });
    console.log(`PlanQueueV1 queue is valid (${result.rows.length} rows)`);
    return;
  }
  if (command === 'show') {
    console.log(JSON.stringify(showQueue(bytes, { repo }), null, 2));
    return;
  }
  if (command === 'next') {
    console.log(JSON.stringify(nextQueue(bytes, { repo }), null, 2));
    return;
  }

  const expectedBytesSha256 = flag(flags, '--expected-sha256', { required: true });
  const lockRoot = flag(flags, '--lock-root');
  const timeoutText = flag(flags, '--lock-timeout-ms');
  const lockTimeoutMs = timeoutText === undefined ? undefined : Number(timeoutText);
  const goalId = flag(flags, '--goal-id', { required: true });
  let result;
  if (command === 'add') {
    result = await addQueueRow({
      file,
      repo,
      expectedBytesSha256,
      row: {
        stage: Number(flag(flags, '--stage', { required: true })),
        goal_id: goalId,
        label: flag(flags, '--label', { required: true }),
        depends_on: cliDependencies(flag(flags, '--depends-on', { required: true })),
        why: flag(flags, '--why', { required: true }),
      },
      ...(lockRoot === undefined ? {} : { lockRoot }),
      ...(lockTimeoutMs === undefined ? {} : { lockTimeoutMs }),
    });
  } else if (command === 'move') {
    result = await moveQueueRow({
      file,
      repo,
      expectedBytesSha256,
      goal_id: goalId,
      stage: Number(flag(flags, '--stage', { required: true })),
      depends_on: cliDependencies(flag(flags, '--depends-on', { required: true })),
      why: flag(flags, '--why', { required: true }),
      ...(lockRoot === undefined ? {} : { lockRoot }),
      ...(lockTimeoutMs === undefined ? {} : { lockTimeoutMs }),
    });
  } else {
    result = await removeQueueRow({
      file,
      repo,
      expectedBytesSha256,
      goal_id: goalId,
      ...(lockRoot === undefined ? {} : { lockRoot }),
      ...(lockTimeoutMs === undefined ? {} : { lockTimeoutMs }),
    });
  }
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message.split('\n')[0] : String(error));
    process.exitCode = 1;
  });
}
