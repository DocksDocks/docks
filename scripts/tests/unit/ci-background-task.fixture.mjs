import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';

// Shared by the ci-background-task unit files, which are split so Bun's parallel runner can place
// the two timing-sensitive cases on separate workers.
export function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-background-task-test-'));
  const artifactRoot = path.join(root, 'artifacts');
  fs.mkdirSync(artifactRoot);
  let errors = '';
  const errorStream = new Writable({
    write(chunk, _encoding, callback) {
      errors += chunk.toString();
      callback();
    },
  });
  return {
    root,
    artifactRoot,
    errorStream,
    errors: () => errors,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

// Holds this process's event loop for `milliseconds`, the way `ci.mjs` does between join points.
// `spawnSync` itself blocks the event loop, so the blocker needs no CPU, and a busy loop starves the
// measured child (the flake in commit 692c0617).
export function blockEventLoop(milliseconds) {
  return spawnSync(process.execPath, ['--input-type=module', '--eval', `setTimeout(() => {}, ${milliseconds})`], {
    encoding: 'utf8',
  });
}
