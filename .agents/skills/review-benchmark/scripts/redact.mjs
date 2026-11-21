#!/usr/bin/env bun
// redact.mjs turns an omp session transcript into a test fixture of the suite (tests/fixtures/omp/):
//
//   bun redact.mjs <in.jsonl> <out.jsonl> [--lines <n>[-<m>][,...]] [--home <dir>] [--keep-reply]
//
// The fixture keeps the line order, the `type` and the key set of each record, and each value that score.mjs and
// omp.mjs read: the record types and field paths of omp.mjs TRANSCRIPT_RECORDS, `runtime.version`, the times, the
// model, effort, and tier records, the usage token counts, the tool call names, ids, `path` and `query` arguments, the
// tool result ids, error marks, and read details (line numbers, total lines, truncation ranges, read targets, notes),
// and the paths under the home folder that the system prompt and the task name (see homePaths). Each other string
// becomes REDACTED, and the script removes the keys of DROPPED_KEYS (credentials, provider payloads, context
// snapshots, cost). Each path under the home folder `--home` (default: the home folder of the user) moves under
// FIXTURE_HOME with the same structure, so the read scope rules still see the same folders.
//
// - `--lines` keeps only the listed transcript lines (from 1), for example `1-12,40-60`, so a long main session
//   gives a small fixture.
// - `--keep-reply` keeps the text of the last assistant message with text: the reply of the agent (see score.mjs
//   fixerReplies). Use it only when that reply holds no private text.
//
// The script stops when the fixture would hold no `runtime.version`: the fixture test compares it with the omp pins of
// SoT/toolchain.json. Read the fixture for leftover secrets, private paths, or message text before you commit it.
import fs from 'node:fs';
import os from 'node:os';
import { parseArgs } from 'node:util';

const FIXTURE_HOME = '/fixture-home';
const REDACTED = 'redacted';
// Removed wherever they occur: they hold credentials, the raw provider request or response, the context of a
// request, or the price of a request, and score.mjs reads none of them.
const DROPPED_KEYS = new Set(['credentialId', 'providerPayload', 'contextSnapshot', 'cost']);
// The string values of these keys are ids, names, enumerations, times, paths, and URIs that score.mjs reads or that a
// test can name. They stay, with the home folder moved (see movePaths).
const KEPT_STRING_KEYS = new Set([
  'type',
  'name',
  'role',
  'timestamp',
  'updatedAt',
  'id',
  'parentId',
  'toolCallId',
  'toolName',
  'customType',
  'provider',
  'model',
  'resolvedModel',
  'modelRole',
  'api',
  'stopReason',
  'thinkingLevel',
  'configured',
  'purpose',
  'version',
  'cwd',
  'agent',
  'attribution',
  'path',
  'query',
  'resolvedPath',
  'value',
  'contentType',
  'unit',
  'selectorBase',
]);
// Arrays of strings that stay whole: tool names, the read targets of a list read, and the notes of a read result.
const KEPT_STRING_LISTS = new Set(['tools', 'mountedTools', 'spawns', 'displayReadTargets', 'notes']);
// The service tier of a message, or the requested tiers per tier family of a `service_tier_change`: it stays whole.
const TIER_KEY = 'serviceTier';
// The text of these fields keeps only the paths under the home folder that it names (see homePaths): score.mjs finds
// the plugin roots and the agent files in the system prompt, and the case folder in the task.
const PATH_TEXT_KEYS = new Set(['systemPrompt', 'task']);
// A path in backticks or quotes, which can hold a space, or a bare path, which ends at white space or a bracket.
const QUOTED_PATH = /[`'"](\/[^`'"\n]+)[`'"]/g;
const BARE_PATH = /(?:^|[\s(<[])(\/[^\s`'"()<>[\]]+)/g;

function fail(message) {
  console.error(`redact.mjs: ${message}`);
  process.exit(2);
}

// The line numbers of a `--lines` value, as a predicate, or null to keep every line.
function lineFilter(spec) {
  if (spec === undefined) return null;
  const ranges = spec.split(',').map((part) => {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!match) fail(`--lines takes <n>[-<m>][,...], not ${spec}`);
    return [Number(match[1]), Number(match[2] ?? match[1])];
  });
  return (number) => ranges.some(([first, last]) => number >= first && number <= last);
}

// `text` with each path under the home folder `home` moved under FIXTURE_HOME.
const movePaths = (text, home) => text.replaceAll(home, FIXTURE_HOME);

// The paths under the home folder `home` that `text` names, each once, in backticks on a line of its own, and under
// FIXTURE_HOME. score.mjs reads a path in backticks as one path, also with a space, and a path at the start of a line
// as a path of the task.
function homePaths(text, home) {
  const paths = [...text.matchAll(QUOTED_PATH), ...text.matchAll(BARE_PATH)]
    .map(([, found]) => found.replace(/[.,;:!?]+$/, ''))
    .filter((found) => found === home || found.startsWith(`${home}/`));
  return [...new Set(paths)].map((found) => `\`${movePaths(found, home)}\``).join('\n');
}

// The http and https URLs of `text`, one per line: the web search results that score.mjs reads (resultUrls).
const urlsOf = (text) => (text.match(/https?:\/\/[^\s<>()[\]{}"'`]+/g) ?? []).join('\n');

// A copy of `value` with the redaction rules: `key` is the key of the value in its parent, `context` tells how to
// treat the text of a message content part.
function redactValue(value, key, home, context) {
  if (key === TIER_KEY) return structuredClone(value);
  if (Array.isArray(value)) {
    if (KEPT_STRING_LISTS.has(key)) return value.map((item) => (typeof item === 'string' ? movePaths(item, home) : item));
    if (PATH_TEXT_KEYS.has(key)) return value.map((item) => (typeof item === 'string' ? homePaths(item, home) : item));
    return value.map((item) => redactValue(item, key, home, context));
  }
  if (value !== null && typeof value === 'object') return redactObject(value, home, context);
  if (typeof value !== 'string') return value;
  if (PATH_TEXT_KEYS.has(key)) return homePaths(value, home);
  if (KEPT_STRING_KEYS.has(key)) return movePaths(value, home);
  return REDACTED;
}

function redactObject(object, home, context) {
  const result = {};
  for (const [key, value] of Object.entries(object)) {
    if (DROPPED_KEYS.has(key)) continue;
    result[key] = redactValue(value, key, home, context);
  }
  // A text part of a message: the task of a user message keeps its paths (see homePaths), the reply keeps its text on
  // request, and a web search result keeps its URLs.
  if (object.type === 'text' && typeof object.text === 'string') {
    if (context.role === 'user') result.text = homePaths(object.text, home);
    else if (context.keepText) result.text = movePaths(object.text, home);
    else if (context.toolName === 'web_search') result.text = urlsOf(object.text);
  }
  if (object.type === 'thinking' && typeof object.thinking === 'string') result.thinking = '';
  return result;
}

function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { lines: { type: 'string' }, home: { type: 'string' }, 'keep-reply': { type: 'boolean' } },
  });
  const [input, output] = positionals;
  if (!input || !output || positionals.length > 2) {
    fail('usage: redact.mjs <in.jsonl> <out.jsonl> [--lines <n>[-<m>][,...]] [--home <dir>] [--keep-reply]');
  }
  const home = (values.home ?? os.homedir()).replace(/\/+$/, '');
  const keep = lineFilter(values.lines);
  const records = fs
    .readFileSync(input, 'utf8')
    .split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line, number }) => line.trim() && (keep === null || keep(number)))
    .map(({ line, number }) => {
      try {
        return JSON.parse(line);
      } catch {
        return fail(`${input} line ${number} is not JSON`);
      }
    });
  // The reply of the agent: the last assistant message with a text part.
  const hasText = (record) =>
    record.type === 'message' &&
    record.message?.role === 'assistant' &&
    Array.isArray(record.message.content) &&
    record.message.content.some((part) => part?.type === 'text');
  const reply = values['keep-reply'] ? records.findLastIndex(hasText) : -1;
  const redacted = records.map((record, index) => {
    const message = record.type === 'message' ? record.message : undefined;
    const context = { role: message?.role, toolName: message?.toolName, keepText: index === reply };
    return redactObject(record, home, context);
  });
  if (!redacted.some((record) => typeof record.runtime?.version === 'string')) {
    fail(`${input} gives no record with runtime.version; keep lines that omp 19 wrote`);
  }
  const text = `${redacted.map((record) => JSON.stringify(record)).join('\n')}\n`;
  if (text.includes(home)) fail(`the fixture still names ${home}`);
  fs.writeFileSync(output, text);
  console.log(`wrote ${redacted.length} records to ${output}`);
}

main(process.argv.slice(2));
