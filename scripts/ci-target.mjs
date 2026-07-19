#!/usr/bin/env node
import fs from 'node:fs';
import { parseReleaseTag } from './lib/ci-targeting.mjs';

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(2);
}

const args = process.argv.slice(2);
if (args[0] !== 'release-tag' || typeof args[1] !== 'string') {
  fail('usage: ci-target.mjs release-tag <tag> [--github-output <path>]');
}

let outputPath = null;
if (args.length === 4 && args[2] === '--github-output' && args[3] !== '') outputPath = args[3];
else if (args.length !== 2) fail('usage: ci-target.mjs release-tag <tag> [--github-output <path>]');

try {
  const resolved = parseReleaseTag(args[1]);
  if (outputPath === null) {
    process.stdout.write(`${JSON.stringify({ mode: 'targeted', plugin: resolved.plugin, needs_rust: resolved.needsRust })}\n`);
  } else {
    fs.appendFileSync(outputPath, `mode=targeted\nplugin=${resolved.plugin}\nneeds_rust=${resolved.needsRust}\n`, { encoding: 'utf8' });
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
