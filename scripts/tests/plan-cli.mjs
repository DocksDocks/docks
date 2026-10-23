#!/usr/bin/env node
// This entry keeps one stable name for the gate, the CI targeting contracts, and the test-contract
// registry. The plan-CLI cases live in plan-cli/*.test.mjs; Node's test runner gives each case file
// its own process, so the files run in parallel against the shipped plan.mjs.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CASE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'plan-cli');
const files = fs.existsSync(CASE_DIR)
  ? fs
      .readdirSync(CASE_DIR)
      .filter((name) => name.endsWith('.test.mjs'))
      .sort()
      .map((name) => path.join(CASE_DIR, name))
  : [];
if (files.length === 0) {
  console.error(`plan-cli: no case files (*.test.mjs) found in ${CASE_DIR}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', `--test-concurrency=${os.availableParallelism()}`, ...files], {
  stdio: 'inherit',
});
if (result.error) console.error(`plan-cli: node --test did not start: ${result.error.message}`);
else if (result.signal) console.error(`plan-cli: node --test was killed by ${result.signal}`);
process.exit(result.status ?? 1);
