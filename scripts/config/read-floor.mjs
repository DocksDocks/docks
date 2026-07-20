#!/usr/bin/env node
// Read per-file score floor from scripts/config/scoring.json.
//   read-floor.mjs <kind> <category>   # categorized kinds (skills)
//   read-floor.mjs <kind>              # flat kinds (agents)
// Prints the integer per_file_floor; exits non-zero if the kind/category isn't declared.
import fs from 'node:fs';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const CONFIG = path.join(SCRIPT_DIR, 'scoring.json');
const kind = process.argv[2];
const category = process.argv[3] || '';

if (!kind) {
  console.error(`usage: ${process.argv[1]} <kind> [<category>]`);
  process.exit(1);
}
if (!fs.existsSync(CONFIG)) {
  console.error(`FAIL: ${CONFIG} not found`);
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
let node = cfg[kind];
let missing = node === undefined ? kind : null;
if (!missing && category) {
  if (node[category] === undefined) missing = category;
  else node = node[category];
}
if (!missing && node.per_file_floor === undefined) missing = 'per_file_floor';
if (missing !== null) {
  const p = kind + (category ? `.${category}` : '');
  console.error(`FAIL: unknown ${p} in ${CONFIG} (missing key: '${missing}')`);
  process.exit(1);
}
console.log(node.per_file_floor);
