// Size the gate to the host that is actually running it, at the moment it runs.
// The same checkout gates on an 8 GB laptop with no swap, inside a 2 GB CI
// container on a 64 GB runner, and on a 128 GB workstation.
//
// Two distinct questions have to be answered, and conflating them is the bug
// this module exists to avoid:
//   * capacity     - what this machine or cgroup is allowed to use at all
//   * availability - what is actually free at this instant, and whether the
//                    machine is already struggling
// A 16-core host mid-build has the capacity of 16 and the availability of
// nearly zero, so limits derive from the second number.
//
// Every reading must stay in one coordinate system. The naive host-level calls
// silently mix scopes under a cgroup:
//   * os.totalmem()             -> host RAM, ignores memory.max
//   * os.availableParallelism() -> affinity mask, ignores cpu.max quota
//   * os.freemem()              -> excludes reclaimable page cache
//   * os.loadavg()              -> host-wide, has no cgroup-scoped equivalent,
//                                  and is a ~60 s EWMA that lags reality
// So capacity resolves cgroup v2 -> cgroup v1 -> host, taking the minimum along
// the cgroup ancestry because nested limits compose as a minimum; availability
// is measured from PSI stall counters over an explicit sampling window.
//
// One further host property drives temp placement: tmpfs pages on a swapless
// host are unreclaimable - they free only when files are deleted - so a temp
// tree staged in RAM competes with the build for the very same bytes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Other work competing for the same cores. Reported to the operator so a
// shrunken envelope explains itself; deliberately NOT an input to the job
// maths, because a name list both misses renamed competitors and matches the
// gate's own helper processes. Measurement decides the number.
export const COMPETING_COMMANDS = Object.freeze(['cargo', 'rustc', 'biome', 'cc1', 'cc1plus', 'ld']);
export const COMPETING_SCRIPTS = Object.freeze(['ci.mjs', 'selftest.mjs', 'vitest', 'jest']);

const CGROUP_ROOT = '/sys/fs/cgroup';
const RAM_FILESYSTEMS = new Set(['tmpfs', 'ramfs']);
const KIB = 1024;
const MICROS_PER_MS = 1000;

const readText = (readFile, file) => {
  try {
    return readFile(file).trim();
  } catch {
    return null;
  }
};

// cgroup limit files spell "no limit" as `max`; v1 spells it as a sentinel far
// above real memory, which the caller clamps against host total. v1 cpu quota
// spells it `-1`, rejected here by the `> 0` test.
function readLimit(readFile, file) {
  const text = readText(readFile, file);
  if (text === null || text === '' || text === 'max') return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// Swap needs its own reader: `0` is the meaningful "swap forbidden" value that
// readLimit deliberately rejects, and it must survive the ancestry minimum.
function readSwapLimit(readFile, file) {
  const text = readText(readFile, file);
  if (text === null || text === '' || text === 'max') return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function readCpuMax(readFile, file) {
  const text = readText(readFile, file);
  if (text === null) return null;
  const [quota, period] = text.split(/\s+/);
  if (quota === 'max' || quota === undefined) return null;
  const numerator = Number(quota);
  const denominator = Number(period ?? '100000');
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

// /proc/self/cgroup carries both layouts:
//   v2 -> `0::/some/path`            (empty controller field)
//   v1 -> `5:memory:/docker/abc123`  (one line per controller set)
// Reading only the v2 line and then looking under /sys/fs/cgroup/memory/ finds
// the ROOT v1 cgroup, which is always unlimited - so a v1 container would fall
// straight through to host values. Both layouts are resolved here.
function selfCgroupPaths(readFile) {
  const text = readText(readFile, '/proc/self/cgroup');
  const v1 = new Map();
  let v2 = '/';
  if (text === null) return { v2, v1 };
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const firstColon = line.indexOf(':');
    const secondColon = line.indexOf(':', firstColon + 1);
    if (firstColon < 0 || secondColon < 0) continue;
    const controllers = line.slice(firstColon + 1, secondColon);
    const cgroupPath = line.slice(secondColon + 1) || '/';
    if (controllers === '') {
      v2 = cgroupPath;
      continue;
    }
    for (const controller of controllers.split(',')) v1.set(controller, cgroupPath);
  }
  return { v2, v1 };
}

function cgroupChain(rootDirectory, relative) {
  const parts = relative.split('/').filter(Boolean);
  const chain = [];
  for (let depth = parts.length; depth >= 0; depth -= 1) {
    chain.push(path.join(rootDirectory, ...parts.slice(0, depth)));
  }
  return chain;
}

// Nested limits compose as a minimum: a 2 GB container inside an 8 GB slice is
// bounded by 2 GB, so the effective value is the tightest ancestor.
function effectiveLimit(readFile, rootDirectory, relative, fileName, parse) {
  let tightest = null;
  for (const directory of cgroupChain(rootDirectory, relative)) {
    const value = parse(readFile, path.join(directory, fileName));
    if (value !== null && (tightest === null || value < tightest)) tightest = value;
  }
  return tightest;
}

// v1 keeps quota and period in sibling files, so the ratio is per-directory.
function cgroupV1CpuLimit(readFile, relative) {
  let tightest = null;
  for (const directory of cgroupChain(path.join(CGROUP_ROOT, 'cpu'), relative)) {
    const quota = readLimit(readFile, path.join(directory, 'cpu.cfs_quota_us'));
    const period = readLimit(readFile, path.join(directory, 'cpu.cfs_period_us'));
    if (quota === null || period === null) continue;
    const value = quota / period;
    if (tightest === null || value < tightest) tightest = value;
  }
  return tightest;
}

function parseMeminfo(text) {
  const fields = new Map();
  for (const line of text.split('\n')) {
    const match = /^(\w+):\s+(\d+) kB$/.exec(line);
    if (match) fields.set(match[1], Number(match[2]) * KIB);
  }
  return fields;
}

// Longest mountpoint prefixing `target`, so /tmp wins over / for /tmp/foo.
export function mountFilesystem(target, mountsText) {
  const resolved = path.resolve(target);
  let best = null;
  for (const line of mountsText.split('\n')) {
    const [, mountPoint, fsType] = line.split(' ');
    if (!mountPoint || !fsType) continue;
    const point = mountPoint.replace(/\\040/g, ' ');
    const isPrefix = resolved === point || resolved.startsWith(point.endsWith('/') ? point : `${point}/`);
    if (isPrefix && (best === null || point.length > best.point.length)) best = { point, fsType };
  }
  return best?.fsType ?? null;
}

export function hostResources({
  platform = process.platform,
  tmpdir = os.tmpdir(),
  readFile = (file) => fs.readFileSync(file, 'utf8'),
  totalmem = os.totalmem,
  freemem = os.freemem,
  availableParallelism = os.availableParallelism,
} = {}) {
  const hostTotal = totalmem();
  const hostCpus = availableParallelism();
  if (platform !== 'linux') {
    // No /proc or /sys. macOS and Windows keep a disk-backed temp directory, so
    // the tmpfs diversion is correctly a no-op rather than a guess.
    return Object.freeze({
      platform,
      cpus: hostCpus,
      totalBytes: hostTotal,
      availableBytes: freemem(),
      swapBytes: null,
      tmpdir,
      tmpFilesystem: null,
      tmpIsRamBacked: false,
      cgroupRelative: null,
      constrainedBy: null,
    });
  }

  const meminfo = parseMeminfo(readText(readFile, '/proc/meminfo') ?? '');
  const { v2, v1 } = selfCgroupPaths(readFile);
  const memoryLimit =
    effectiveLimit(readFile, CGROUP_ROOT, v2, 'memory.max', readLimit) ??
    effectiveLimit(
      readFile,
      path.join(CGROUP_ROOT, 'memory'),
      v1.get('memory') ?? '/',
      'memory.limit_in_bytes',
      readLimit,
    );
  const cpuLimit =
    effectiveLimit(readFile, CGROUP_ROOT, v2, 'cpu.max', readCpuMax) ??
    cgroupV1CpuLimit(readFile, v1.get('cpu') ?? '/');

  // A v1 sentinel exceeds real memory; clamping folds it back to "unlimited".
  const bounded = memoryLimit !== null && memoryLimit < hostTotal;
  const totalBytes = bounded ? memoryLimit : hostTotal;
  const current = bounded ? readLimit(readFile, path.join(CGROUP_ROOT, v2, 'memory.current')) : null;
  const hostAvailable = meminfo.get('MemAvailable') ?? freemem();
  const availableBytes = bounded ? Math.min(hostAvailable, Math.max(0, totalBytes - (current ?? 0))) : hostAvailable;

  // A container may forbid swap on a host that has plenty, and the prohibition
  // can sit on any ancestor, so this walks the chain like the other limits.
  const swapMax = effectiveLimit(readFile, CGROUP_ROOT, v2, 'memory.swap.max', readSwapLimit);
  const swapTotal = meminfo.get('SwapTotal') ?? null;
  const swapBytes = swapMax === null ? swapTotal : Math.min(swapMax, swapTotal ?? swapMax);

  const tmpFilesystem = mountFilesystem(tmpdir, readText(readFile, '/proc/mounts') ?? '');
  return Object.freeze({
    platform,
    cpus: cpuLimit === null ? hostCpus : Math.max(1, Math.min(hostCpus, Math.ceil(cpuLimit))),
    totalBytes,
    availableBytes,
    swapBytes,
    tmpdir,
    tmpFilesystem,
    tmpIsRamBacked: tmpFilesystem !== null && RAM_FILESYSTEMS.has(tmpFilesystem),
    cgroupRelative: v2,
    constrainedBy: bounded || cpuLimit !== null ? 'cgroup' : null,
  });
}

// Pressure Stall Information lines read:
//   some avg10=0.00 avg60=0.00 avg300=0.00 total=2958
// `total` is a monotonic microsecond counter of time spent stalled. Sampling it
// twice yields a true point-in-time stall share, whereas avg10 is a decaying
// 10 s average that lets one gate run inherit the previous run's tail.
export function parsePressureTotal(text) {
  if (typeof text !== 'string') return null;
  for (const line of text.split('\n')) {
    if (!line.startsWith('some ')) continue;
    const match = /total=(\d+)/.exec(line);
    if (match) {
      const value = Number(match[1]);
      return Number.isFinite(value) ? value : null;
    }
  }
  return null;
}

function cpuTotals(text) {
  const line = text.split('\n').find((candidate) => candidate.startsWith('cpu '));
  if (line === undefined) return null;
  const fields = line.trim().split(/\s+/).slice(1).map(Number);
  if (fields.length < 5 || fields.some((value) => !Number.isFinite(value))) return null;
  const total = fields.reduce((sum, value) => sum + value, 0);
  // idle + iowait: an I/O-blocked core is still available for compute.
  return { idle: fields[3] + fields[4], total };
}

const sleepSync = (ms) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

const clampFraction = (value) => Math.min(1, Math.max(0, value));

// The availability half of the sizing question. Everything here stays in the
// caller's coordinate system: under a cgroup only leaf PSI is consulted, never
// host-wide /proc/stat, because a busy neighbour must not shrink an otherwise
// idle container's envelope.
export function runtimeAvailability({
  platform = process.platform,
  cpus = 1,
  constrained = false,
  cgroupRelative = null,
  readFile = (file) => fs.readFileSync(file, 'utf8'),
  sampleMs = 150,
  sleep = sleepSync,
} = {}) {
  const unmeasured = { idleCpus: cpus, cpuStall: null, memoryStall: null, sampled: false };
  if (platform !== 'linux') return unmeasured;

  const pressureFile = (leaf, host) => (cgroupRelative === null ? host : path.join(CGROUP_ROOT, cgroupRelative, leaf));
  const cpuPressurePath = pressureFile('cpu.pressure', '/proc/pressure/cpu');
  const memoryPressurePath = pressureFile('memory.pressure', '/proc/pressure/memory');

  // Under a cgroup, host-wide /proc/stat is the wrong coordinate system, so it
  // is not merely ignored but never read: a busy neighbour on the host must not
  // shrink an otherwise idle container's envelope.
  const snapshot = () => ({
    stat: constrained ? null : cpuTotals(readText(readFile, '/proc/stat') ?? ''),
    cpu: parsePressureTotal(readText(readFile, cpuPressurePath) ?? ''),
    memory: parsePressureTotal(readText(readFile, memoryPressurePath) ?? ''),
  });

  const first = snapshot();
  sleep(sampleMs);
  const second = snapshot();
  const windowMicros = sampleMs * MICROS_PER_MS;
  const stallShare = (before, after) =>
    before === null || after === null || windowMicros <= 0 ? null : clampFraction((after - before) / windowMicros);

  const cpuStall = stallShare(first.cpu, second.cpu);
  const memoryStall = stallShare(first.memory, second.memory);

  // Host /proc/stat is only meaningful when nothing narrower binds us.
  let idleFraction = null;
  if (!constrained && first.stat !== null && second.stat !== null) {
    const totalDelta = second.stat.total - first.stat.total;
    if (totalDelta > 0) idleFraction = clampFraction((second.stat.idle - first.stat.idle) / totalDelta);
  }
  const byPressure = cpuStall === null ? 1 : 1 - cpuStall;
  const usableShare = idleFraction === null ? byPressure : Math.min(idleFraction, byPressure);

  return {
    idleCpus: Math.max(1, Math.floor(cpus * usableShare)),
    cpuStall,
    memoryStall,
    sampled: cpuStall !== null || idleFraction !== null,
  };
}

function processAncestry(readFile, selfPid) {
  const ancestry = new Set([selfPid]);
  let pid = selfPid;
  for (let hops = 0; hops < 64; hops += 1) {
    const stat = readText(readFile, `/proc/${pid}/stat`);
    if (stat === null) break;
    // comm can contain spaces and parentheses, so parse after the final ')'.
    const tail = stat
      .slice(stat.lastIndexOf(')') + 1)
      .trim()
      .split(/\s+/);
    const parent = Number(tail[1]);
    if (!Number.isSafeInteger(parent) || parent <= 1 || ancestry.has(parent)) break;
    ancestry.add(parent);
    pid = parent;
  }
  return ancestry;
}

function competingLabel(argv) {
  const command = path.basename(argv[0] ?? '');
  if (COMPETING_COMMANDS.includes(command)) return command;
  for (const argument of argv.slice(1)) {
    const candidate = path.basename(argument);
    if (COMPETING_SCRIPTS.includes(candidate)) return candidate;
  }
  return null;
}

// Diagnostics only: explains to a human why the envelope shrank. Excludes this
// process and its own ancestry so a gate never reports itself.
export function detectCompetingWork({
  platform = process.platform,
  readDir = (directory) => fs.readdirSync(directory),
  readFile = (file) => fs.readFileSync(file, 'utf8'),
  selfPid = process.pid,
} = {}) {
  if (platform !== 'linux') return [];
  let entries;
  try {
    entries = readDir('/proc');
  } catch {
    return [];
  }
  const skip = processAncestry(readFile, selfPid);
  const found = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (skip.has(pid)) continue;
    let raw;
    try {
      raw = readFile(`/proc/${pid}/cmdline`);
    } catch {
      continue;
    }
    const argv = raw.split('\0').filter(Boolean);
    if (argv.length === 0) continue;
    const label = competingLabel(argv);
    if (label !== null) found.push({ pid, label, command: argv.join(' ').slice(0, 120) });
  }
  return found;
}

const gib = (bytes) => `${(bytes / 1024 ** 3).toFixed(1)}G`;
const percent = (fraction) => `${Math.round(fraction * 100)}%`;

export function describeEnvelope(resources, { availability = null, competing = [] }) {
  const swap = resources.swapBytes === null ? 'swap unknown' : `swap ${gib(resources.swapBytes)}`;
  const scope = resources.constrainedBy === 'cgroup' ? ' (cgroup-limited)' : '';
  const cores = availability === null ? `${resources.cpus} cpu` : `${availability.idleCpus}/${resources.cpus} cpu free`;
  const stall = availability?.memoryStall ? `, memory stall ${percent(availability.memoryStall)}` : '';
  const busy = competing.length === 0 ? '' : `, ${competing.length} competing (${competing[0].label})`;
  // Reported, deliberately not worked around. Relocating the temp root is not
  // available as a remedy here: a scenario suite can nest most of the kernel's
  // 108-byte unix `sun_path` budget under the temp root, leaving under ten
  // characters spare, so a longer root makes socket bind() fail. Swap is the
  // real fix - it makes tmpfs pages reclaimable instead of pinning them in RAM
  // until their files are deleted.
  const ramTemp =
    resources.tmpIsRamBacked && resources.swapBytes === 0
      ? `, WARNING ${resources.tmpdir} is ${resources.tmpFilesystem} with no swap (temp competes for RAM)`
      : '';
  return `${cores}, ${gib(resources.totalBytes)} ram, ${swap}${scope}${stall}${busy}${ramTemp}`;
}
