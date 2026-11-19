#!/usr/bin/env bun
// Read per-file score floor from scripts/config/scoring.json.
//   read-floor.mjs <kind>   # skills or agents
// Prints the integer per_file_floor; exits non-zero if the kind isn't declared.
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const CONFIG = path.join(SCRIPT_DIR, 'scoring.json');
const kind = process.argv[2];

if (!kind) {
  console.error(`usage: ${process.argv[1]} <kind>`);
  process.exit(1);
}
if (!fs.existsSync(CONFIG)) {
  console.error(`FAIL: ${CONFIG} not found`);
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
const node = cfg[kind];
const missing = node === undefined ? kind : node.per_file_floor === undefined ? 'per_file_floor' : null;
if (missing !== null) {
  console.error(`FAIL: unknown ${kind} in ${CONFIG} (missing key: '${missing}')`);
  process.exit(1);
}
console.log(node.per_file_floor);
