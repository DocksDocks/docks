import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { privatizeBuiltBinary, resolveBuiltBinary } from '../../lib/plugins.mjs';
import { acceptanceSpecifications } from '../../lib/session-relay-release-preparation.mjs';

const REPO = path.resolve('test-repository');
const SOURCE = { builtBinary: 'plugins/example/rust/target/release/relay' };
const BIN_NAME = 'relay';

test('resolveBuiltBinary uses the descriptor path when CARGO_TARGET_DIR is unset', () => {
  assert.equal(
    resolveBuiltBinary({ source: SOURCE, binName: BIN_NAME, env: {}, repo: REPO }),
    path.resolve(REPO, SOURCE.builtBinary),
  );
});

test('resolveBuiltBinary uses an absolute CARGO_TARGET_DIR', () => {
  const cargoTargetDir = path.resolve(os.tmpdir(), 'absolute-cargo-target');

  assert.equal(
    resolveBuiltBinary({
      source: SOURCE,
      binName: BIN_NAME,
      env: { CARGO_TARGET_DIR: cargoTargetDir },
      repo: REPO,
    }),
    path.join(cargoTargetDir, 'release', BIN_NAME),
  );
});

test('resolveBuiltBinary resolves a relative CARGO_TARGET_DIR against the directory cargo runs in', () => {
  // Cargo resolves a relative CARGO_TARGET_DIR against its own cwd, and gateRust
  // invokes cargo with `cwd: p.rust.dir`. Asserting the repository root here is
  // what previously locked in a resolver that stats a path cargo never wrote.
  assert.equal(
    resolveBuiltBinary({
      source: SOURCE,
      binName: BIN_NAME,
      env: { CARGO_TARGET_DIR: 'shared/cargo-target' },
      repo: REPO,
      cargoCwd: 'plugins/session-relay/rust',
    }),
    path.resolve(REPO, 'plugins/session-relay/rust', 'shared/cargo-target', 'release', BIN_NAME),
  );
});

test('resolveBuiltBinary treats an empty CARGO_TARGET_DIR as unset', () => {
  assert.equal(
    resolveBuiltBinary({
      source: SOURCE,
      binName: BIN_NAME,
      env: { CARGO_TARGET_DIR: '' },
      repo: REPO,
    }),
    path.resolve(REPO, SOURCE.builtBinary),
  );
});

test('privatizeBuiltBinary creates distinct byte-identical executable copies', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cargo-target-dir-'));
  try {
    const binary = path.join(root, 'shared-relay');
    const dir = path.join(root, 'private');
    const contents = Buffer.from('shared binary bytes\n');
    fs.mkdirSync(dir);
    fs.writeFileSync(binary, contents, { mode: 0o751 });

    const first = privatizeBuiltBinary({ binary, dir });
    const second = privatizeBuiltBinary({ binary, dir });

    assert.notEqual(first, second);
    for (const copy of [first, second]) {
      const relative = path.relative(dir, copy);
      assert.ok(relative.length > 0 && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
      assert.deepEqual(fs.readFileSync(copy), contents);
      assert.equal(fs.statSync(copy).mode & 0o777, fs.statSync(binary).mode & 0o777);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('release preparation unsets CARGO_TARGET_DIR without changing cargo argv', () => {
  const cargo = acceptanceSpecifications('refs/heads/example', 'a'.repeat(40)).at(-1)[0];
  assert.deepEqual(
    [cargo.executable, ...cargo.args],
    ['cargo', '+1.85.0', 'build', '--manifest-path', 'plugins/session-relay/rust/Cargo.toml', '--release', '--locked'],
  );
  assert.equal(cargo.options.env.CARGO_TARGET_DIR, undefined);

  const probe = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "process.stdout.write(Object.hasOwn(process.env, 'CARGO_TARGET_DIR') ? 'present' : 'absent')",
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        CARGO_TARGET_DIR: '/inherited/shared-target',
        ...cargo.options.env,
      },
    },
  );
  assert.equal(probe.status, 0, probe.stderr);
  assert.equal(probe.stdout, 'absent');
});
