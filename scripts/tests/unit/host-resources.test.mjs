import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeEnvelope,
  detectCompetingWork,
  hostResources,
  mountFilesystem,
  parsePressureTotal,
  runtimeAvailability,
} from '../../lib/host-resources.mjs';

const GIB = 1024 ** 3;
const CGROUP_ROOT = '/sys/fs/cgroup';

function fakeReader(entries = []) {
  const files = new Map(entries);
  const reads = new Map();
  const calls = [];
  const readFile = (file) => {
    calls.push(file);
    if (!files.has(file)) {
      const error = new Error(`ENOENT: no such file or directory, open '${file}'`);
      error.code = 'ENOENT';
      throw error;
    }
    const contents = files.get(file);
    if (!Array.isArray(contents)) return contents;
    const index = reads.get(file) ?? 0;
    reads.set(file, index + 1);
    return contents[Math.min(index, contents.length - 1)];
  };
  return { readFile, calls };
}

function linuxResources(entries, overrides = {}) {
  const { readFile } = fakeReader([
    ['/proc/self/cgroup', '0::/foo/bar\n'],
    ['/proc/meminfo', `MemAvailable: ${48 * 1024 ** 2} kB\nSwapTotal: ${8 * 1024 ** 2} kB\n`],
    ['/proc/mounts', '/dev/root / ext4 rw 0 0\ntmpfs /tmp tmpfs rw 0 0\n'],
    ...entries,
  ]);
  return hostResources({
    platform: 'linux',
    tmpdir: '/tmp',
    readFile,
    totalmem: () => 64 * GIB,
    freemem: () => 32 * GIB,
    availableParallelism: () => 16,
    ...overrides,
  });
}

test('hostResources honours a cgroup v2 memory bound', () => {
  const resources = linuxResources([[`${CGROUP_ROOT}/foo/memory.max`, String(2 * GIB)]]);

  assert.equal(resources.totalBytes, 2 * GIB);
  assert.equal(resources.constrainedBy, 'cgroup');
});

test('hostResources uses the tightest cgroup v2 memory limit in the ancestry', () => {
  const resources = linuxResources([
    [`${CGROUP_ROOT}/foo/bar/memory.max`, String(4 * GIB)],
    [`${CGROUP_ROOT}/foo/memory.max`, String(2 * GIB)],
    [`${CGROUP_ROOT}/memory.max`, String(8 * GIB)],
  ]);

  assert.equal(resources.totalBytes, 2 * GIB);
  assert.equal(resources.constrainedBy, 'cgroup');
});

test('hostResources treats a cgroup v2 max memory value as unlimited', () => {
  const resources = linuxResources([[`${CGROUP_ROOT}/foo/bar/memory.max`, 'max\n']]);

  assert.equal(resources.totalBytes, 64 * GIB);
  assert.equal(resources.constrainedBy, null);
});

test('hostResources applies finite cgroup v2 cpu quotas and ignores max quotas', () => {
  const limited = linuxResources([[`${CGROUP_ROOT}/foo/bar/cpu.max`, '200000 100000\n']]);
  const unlimited = linuxResources([[`${CGROUP_ROOT}/foo/bar/cpu.max`, 'max 100000\n']]);

  assert.equal(limited.cpus, 2);
  assert.equal(limited.constrainedBy, 'cgroup');
  assert.equal(unlimited.cpus, 16);
  assert.equal(unlimited.constrainedBy, null);
});

test('hostResources falls back to cgroup v1 memory limits', () => {
  const limited = linuxResources([[`${CGROUP_ROOT}/memory/memory.limit_in_bytes`, String(3 * GIB)]]);
  const sentinel = linuxResources([[`${CGROUP_ROOT}/memory/memory.limit_in_bytes`, String(128 * GIB)]]);

  assert.equal(limited.totalBytes, 3 * GIB);
  assert.equal(limited.constrainedBy, 'cgroup');
  assert.equal(sentinel.totalBytes, 64 * GIB);
  assert.equal(sentinel.constrainedBy, null);
});

test('hostResources avoids proc reads and reports unknown swap on non-Linux hosts', () => {
  const { readFile, calls } = fakeReader();
  const resources = hostResources({
    platform: 'darwin',
    tmpdir: '/private/tmp',
    readFile,
    totalmem: () => 16 * GIB,
    freemem: () => 6 * GIB,
    availableParallelism: () => 10,
  });

  assert.deepEqual(calls, []);
  assert.equal(resources.tmpIsRamBacked, false);
  assert.equal(resources.swapBytes, null);
  assert.equal(resources.totalBytes, 16 * GIB);
  assert.equal(resources.cpus, 10);
});

test('parsePressureTotal reads the some counter and rejects malformed pressure data', () => {
  assert.equal(
    parsePressureTotal('some avg10=0.00 avg60=0.00 avg300=0.00 total=12345\nfull avg10=0.00 total=99\n'),
    12345,
  );
  assert.equal(parsePressureTotal('full avg10=0.00 total=99\n'), null);
  assert.equal(parsePressureTotal('some avg10=0.00 total=invalid\n'), null);
  assert.equal(parsePressureTotal(null), null);
});

test('runtimeAvailability samples cgroup PSI without consulting host cpu statistics', () => {
  const { readFile, calls } = fakeReader([
    [`${CGROUP_ROOT}/foo/bar/cpu.pressure`, ['some avg10=0.00 total=1000\n', 'some avg10=0.00 total=21000\n']],
    [`${CGROUP_ROOT}/foo/bar/memory.pressure`, ['some avg10=0.00 total=5000\n', 'some avg10=0.00 total=15000\n']],
  ]);
  const availability = runtimeAvailability({
    platform: 'linux',
    cpus: 8,
    constrained: true,
    cgroupRelative: '/foo/bar',
    readFile,
    sampleMs: 100,
    sleep: () => {},
  });

  assert.deepEqual(availability, { idleCpus: 6, cpuStall: 0.2, memoryStall: 0.1, sampled: true });
  assert.equal(calls.includes('/proc/stat'), false);
});

test('runtimeAvailability returns full unmeasured capacity without reads on non-Linux hosts', () => {
  const { readFile, calls } = fakeReader();
  const availability = runtimeAvailability({
    platform: 'darwin',
    cpus: 10,
    readFile,
    sleep: () => {
      assert.fail('non-Linux availability must not sleep');
    },
  });

  assert.deepEqual(availability, { idleCpus: 10, cpuStall: null, memoryStall: null, sampled: false });
  assert.deepEqual(calls, []);
});

test('detectCompetingWork returns no entries or reads on non-Linux hosts', () => {
  let readDirCalls = 0;
  const { readFile, calls } = fakeReader();
  const competing = detectCompetingWork({
    platform: 'darwin',
    readDir: () => {
      readDirCalls += 1;
      return ['42'];
    },
    readFile,
    selfPid: 100,
  });

  assert.deepEqual(competing, []);
  assert.equal(readDirCalls, 0);
  assert.deepEqual(calls, []);
});

test('detectCompetingWork excludes self and ancestors while reporting planted proc entries', () => {
  const { readFile } = fakeReader([
    ['/proc/100/stat', '100 (node) S 50 0 0 0\n'],
    ['/proc/50/stat', '50 (shell parent) S 1 0 0 0\n'],
    ['/proc/42/cmdline', '/usr/bin/cargo\0build\0'],
    ['/proc/900/cmdline', '/usr/bin/node\0unrelated.mjs\0'],
  ]);
  const competing = detectCompetingWork({
    platform: 'linux',
    readDir: () => ['100', '50', '42', '900', 'self', 'net'],
    readFile,
    selfPid: 100,
  });

  assert.deepEqual(competing, [{ pid: 42, label: 'cargo', command: '/usr/bin/cargo build' }]);
});

test('describeEnvelope warns only when temp is RAM-backed without swap', () => {
  const diskHost = {
    cpus: 4,
    totalBytes: 8 * GIB,
    swapBytes: 4 * GIB,
    tmpdir: '/tmp',
    tmpFilesystem: 'ext4',
    tmpIsRamBacked: false,
    constrainedBy: null,
  };
  const diskEnvelope = describeEnvelope(diskHost, {});
  assert.ok(!diskEnvelope.includes('WARNING'), `disk-backed temp must not warn: ${diskEnvelope}`);

  const tmpfsWithSwap = describeEnvelope({ ...diskHost, tmpFilesystem: 'tmpfs', tmpIsRamBacked: true }, {});
  assert.ok(!tmpfsWithSwap.includes('WARNING'), `tmpfs with swap must not warn: ${tmpfsWithSwap}`);

  const swaplessTmpfs = describeEnvelope(
    { ...diskHost, swapBytes: 0, tmpFilesystem: 'tmpfs', tmpIsRamBacked: true },
    {},
  );
  assert.match(swaplessTmpfs, /WARNING \/tmp is tmpfs with no swap/);
});

test('mountFilesystem chooses the longest prefix, decodes spaces, and returns null without a match', () => {
  const mounts = [
    '/dev/root / ext4 rw 0 0',
    'tmpfs /tmp tmpfs rw 0 0',
    '/dev/data /media/shared\\040files xfs rw 0 0',
  ].join('\n');

  assert.equal(mountFilesystem('/tmp/x', mounts), 'tmpfs');
  assert.equal(mountFilesystem('/media/shared files/report.txt', mounts), 'xfs');
  assert.equal(mountFilesystem('/var/data', 'tmpfs /tmp tmpfs rw 0 0'), null);
});
