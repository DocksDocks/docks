#!/usr/bin/env node
import fs from 'node:fs';
import { CI_LANES, parseReleaseTag, resolveShardSelection } from './lib/ci-targeting.mjs';

const RELEASE_TAG_USAGE = 'usage: ci-target.mjs release-tag <tag> [--github-output <path>]';
const SHARDS_USAGE =
  'usage: ci-target.mjs shards (--changed-paths <path> | --unresolved) [--event <name>] [--github-output <path>]';

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(2);
}

function emit(outputPath, pairs, jsonPayload) {
  if (outputPath === null) {
    process.stdout.write(`${JSON.stringify(jsonPayload)}\n`);
    return;
  }
  fs.appendFileSync(outputPath, pairs.map(([key, value]) => `${key}=${value}\n`).join(''), { encoding: 'utf8' });
}

function releaseTagCommand(args) {
  if (typeof args[0] !== 'string') fail(RELEASE_TAG_USAGE);
  let outputPath = null;
  if (args.length === 3 && args[1] === '--github-output' && args[2] !== '') outputPath = args[2];
  else if (args.length !== 1) fail(RELEASE_TAG_USAGE);
  try {
    const resolved = parseReleaseTag(args[0]);
    emit(
      outputPath,
      [
        ['mode', 'targeted'],
        ['plugin', resolved.plugin],
        ['needs_rust', resolved.needsRust],
      ],
      { mode: 'targeted', plugin: resolved.plugin, needs_rust: resolved.needsRust },
    );
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function shardsCommand(args) {
  let outputPath = null;
  let changedPathsFile = null;
  let unresolved = false;
  let eventName = 'pull_request';
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--unresolved') {
      unresolved = true;
      continue;
    }
    const value = args[index + 1];
    if (typeof value !== 'string' || value === '') fail(SHARDS_USAGE);
    index += 1;
    if (arg === '--changed-paths') changedPathsFile = value;
    else if (arg === '--github-output') outputPath = value;
    else if (arg === '--event') eventName = value;
    else fail(SHARDS_USAGE);
  }
  if (unresolved === (changedPathsFile !== null)) fail(SHARDS_USAGE);

  // FAIL OPEN TO THE FULL GATE. Reading the diff, decoding it, and mapping it onto
  // the registry can all go wrong; none of those failures is evidence that a shard
  // has nothing to do, so every one of them selects every shard. Only a resolution
  // that completed selects fewer. Under-selecting here is silent and severe - a
  // green pull request that gated none of its own changes - so this catch must
  // never be narrowed into a rethrow.
  let selection;
  try {
    const changedPaths =
      changedPathsFile === null ? [] : fs.readFileSync(changedPathsFile, { encoding: 'utf8' }).split('\n');
    selection = resolveShardSelection({ eventName, baseResolved: !unresolved, changedPaths });
  } catch (error) {
    console.error(`warning: shard resolution failed, running every shard: ${error?.message ?? String(error)}`);
    selection = { lanes: [...CI_LANES], reason: 'resolution-error' };
  }
  console.error(`shards: ${selection.lanes.join(',')} (${selection.reason})`);
  emit(
    outputPath,
    [
      ['lanes', JSON.stringify(selection.lanes)],
      ['reason', selection.reason],
    ],
    { lanes: selection.lanes, reason: selection.reason },
  );
}

const args = process.argv.slice(2);
if (args[0] === 'release-tag') releaseTagCommand(args.slice(1));
else if (args[0] === 'shards') shardsCommand(args.slice(1));
else fail(`${RELEASE_TAG_USAGE}\n       ${SHARDS_USAGE}`);
