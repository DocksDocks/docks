#!/usr/bin/env node
// parity.mjs — proves a .mjs port is behaviourally identical to the .sh it
// replaces. Runs both with the same args, compares stdout + exit code. A
// non-empty diff fails — nothing gets deleted until its replacement is proven
// byte-identical, which is what protects the calibrated scores/hashes.
//
// Usage: node tests/parity.mjs <old.sh> <new.mjs> [--sort] [-- <args...>]
//   --sort  sort output lines before comparing (for order-insensitive checks)
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const passThrough = sep === -1 ? [] : argv.slice(sep + 1);
const head = sep === -1 ? argv : argv.slice(0, sep);
const sort = head.includes('--sort');
const [oldSh, newMjs] = head.filter((a) => a !== '--sort');

if (!oldSh || !newMjs) {
  console.error('usage: node tests/parity.mjs <old.sh> <new.mjs> [--sort] [-- <args...>]');
  process.exit(2);
}

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  let out = r.stdout ?? '';
  if (sort) out = out.split('\n').filter(Boolean).sort().join('\n') + '\n';
  return { out, code: r.status ?? 0 };
};

const a = run('bash', [oldSh, ...passThrough]);
const b = run('node', [newMjs, ...passThrough]);

if (a.out === b.out && a.code === b.code) {
  console.log(`parity OK: ${oldSh} == ${newMjs} (exit ${a.code}, ${a.out.split('\n').filter(Boolean).length} lines)`);
  process.exit(0);
}

console.error(`PARITY FAILED: ${oldSh} != ${newMjs}`);
if (a.code !== b.code) console.error(`  exit: sh=${a.code} mjs=${b.code}`);
const al = a.out.split('\n');
const bl = b.out.split('\n');
const max = Math.max(al.length, bl.length);
let shown = 0;
for (let i = 0; i < max && shown < 30; i += 1) {
  if (al[i] !== bl[i]) {
    console.error(`  L${i + 1}: sh=${JSON.stringify(al[i])} mjs=${JSON.stringify(bl[i])}`);
    shown += 1;
  }
}
process.exit(1);
