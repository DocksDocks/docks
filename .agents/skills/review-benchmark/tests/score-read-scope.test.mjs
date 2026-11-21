import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { BUN_RUNTIME } from '../../../../cli/test/lib/cliEntry.ts';
import * as score from '../scripts/score.mjs';
import { dispatchName, namesCommand, renderReport, scoreRuns, transcriptsCommand } from '../scripts/score.mjs';
import {
  assistantLine,
  BASELINE_PLUGIN,
  CODE_KNOWN,
  CONFIGS,
  fakeOmp,
  FALLBACK_TRANSCRIPT,
  FULL_BLOCK,
  isoAt,
  jsonl,
  judgedArm,
  LIVE,
  LIVE_PLUGIN,
  MODEL,
  neutralScratch,
  provenCost,
  put,
  readJson,
  reads,
  readText,
  SCOPE_CASE,
  SCOPE_WS,
  sessionRecord,
  scratch,
  SCRIPTS_DIR,
  SKILL_DIR,
  toolTranscript,
  VERIFIED_OMP,
} from './helpers.mjs';

// Plan #100: API note for the read-scope tests below. They read the new export through `score`.
//
// The reviewers run in the live checkout, which holds the fixes of the corpus defects. A reviewer that reads a file
// outside the inputs of its run can see a fix, so its recall does not count.
//
// Changed export:
// - transcriptFacts(text, source): when an assistant message of the transcript has a `toolCall` content item, the
//   result also has `toolCalls`: one { name, path } per item, in transcript order. path is `arguments.path` when it
//   is a string, else null. A `web_search` call also has `query`: `arguments.query` when it is a string, else null.
//   When the transcript has a `toolResult` message for a `web_search` call (same `toolCallId`), the call also has
//   `resultUrls`: the http and https URLs in the text content of that result, each once, in text order.
//   A transcript without a tool call gives no `toolCalls` field, so the facts of the earlier tests do not change.
//
// New export:
// - readScope(toolCalls, { runDir, round, cwd, pluginRoots }) -> { outside } or { outside, queries }
//   runDir is `<ws>/<case>/<arm folder>/run-<k>`. round is the number of a round folder, or undefined for a run
//   without round folders. cwd is the working directory of the reviewer session, or null when it is unknown.
//   pluginRoots are the plugin roots that the agent text of the reviewer names. The function reads no file.
//   The path of a grep, glob, or ast_grep call gives one target per `;`-separated part, trimmed; the path of every
//   other call is one trimmed target. A local path or an internal URI loses its selector: the
//   `:<text>` parts without `/` at its end, for example `:1-260` or `:23-54:raw`. A call without a path gives no
//   target, except grep, glob, find, and ast_grep: they search the working directory, so they give
//   `<name> without a path`. A web_search call gives its query to `queries` (each once, in call order; the field is
//   there only when the reviewer searched the web), and the target `web_search: <query>` when the query targets the
//   benchmark repository: outside its `-site:<text>` tokens, it names `DocksDocks/docks` (in any case, without a dot
//   that ends a sentence), or it names `DocksDocks` without `/<name>` of a repository and no `-site:` token excludes
//   the benchmark repository or its owner. `DocksDocks/<name>` of another repository targets that repository. Each
//   URL of its `resultUrls` that the web rule below puts outside gives the target `web_search result: <url>`. A local
//   path also loses a JSON query selector: the text from `?q=` on.
//   A relative path resolves against cwd. "Under a folder" means the folder itself or a path below it.
//   A target is allowed when it is:
//   - a path under an input of the run. An input folder is the case folder, and the run folder (a run without round
//     folders) or each `round-<j>` folder of the run with j <= round. The inputs of an input folder are `snapshot/`
//     and `prompts/`, each `*.diff` file in it, `plan.md`, `previous-review.md`, and `rejection.md`.
//   - a path under `<ws>/trees/<runLabel(case, arm folder, 'run-<k>/round-<j>')>/` with j <= round, the tree copy of
//     an earlier or the same round that `loop` wrote.
//   - for each plugin root P: `P/agents/<name>-reviewer.md`, or a path under `P/skills/code-reviewer/`,
//     `P/skills/plan-reviewer/`, `P/skills/<folder>/code-reviewer/`, or `P/skills/<folder>/plan-reviewer/`.
//   - `skill://<name>` or `skill://<name>/...`, where name is code-review or code-clarity.
//   - an `artifact://` URI.
//   - an http or https URL that cannot show the benchmark repository. Such pages are the paths `/DocksDocks/docks`
//     and below on github.com, www.github.com, and raw.githubusercontent.com, `/repos/DocksDocks/docks` and below on
//     api.github.com, and a page of any site whose decoded host, path, or query names `DocksDocks/docks`. A URL with
//     `…` (cut by a search result) cannot show it only when it does not name `DocksDocks`. The owner and the
//     repository name match in any case.
//   A path with a glob character (`*`, `?`, `[`, `{`) is allowed only when the segments before its first glob
//   segment give a folder that a rule above allows, and no later segment holds `..`.
//   Every other target is outside: every other local path, a relative path when cwd is null, and every other URI
//   (issue://, pr://, local://, history://, and others).
//   The option `lists` maps each target that omp read as a list of paths to these paths (see the list tests of code
//   review round 3 below); such a target is allowed only when each of these paths is allowed. Every other target is
//   one path.
//   outside lists each outside target once, in call order: a target as the reviewer wrote it but without its
//   selector, and a list target as the reviewer wrote it.
//
// Changed exports:
// - transcriptsCommand: a reviewer entry never gets `toolCalls`. When the transcript has tool calls, the entry gets
//   `readScope: readScope(toolCalls, scope)`. The scope takes runDir and round from the dispatch. cwd is the `cwd` of
//   the `session` entry of the transcript. pluginRoots are the folders P of each absolute path
//   `P/skills/code-reviewer/SKILL.md`, `P/skills/plan-reviewer/SKILL.md`, `P/skills/<folder>/code-reviewer/SKILL.md`,
//   or `P/skills/<folder>/plan-reviewer/SKILL.md` in the `systemPrompt` of the `session_init` entry (a string or a
//   list of strings). The system prompt holds the agent text, so these are the roots that the agent file names. A
//   fixer entry gets neither `toolCalls` nor `readScope`.
// - scoreRuns: a reviewer entry whose readScope has outside targets makes its run invalid, also in a run without a
//   config. The reason is `<reviewer>: read outside its inputs: <first 3 targets joined by ", ">`, then
//   `, and <n> more` for the other targets. It comes after the config reasons of the same reviewer.

test('transcript facts list the name and the path of each tool call of the assistant messages', () => {
  const call = (name, args) => ({ type: 'toolCall', id: name, name, arguments: args });
  const first = assistantLine(5, 'openai-codex', 'gpt-6.1-sol', 'default', { input: 10 });
  first.message.content = [
    { type: 'thinking', thinking: 'Read the plan first.' },
    call('read', { i: 'Reading the plan', path: `${SCOPE_CASE}/plan.md:1-40` }),
    call('grep', { i: 'Finding the lock', pattern: 'lock' }),
  ];
  const second = assistantLine(9, 'openai-codex', 'gpt-6.1-sol', 'default', { input: 10 });
  second.message.content = [
    { type: 'text', text: 'Done.' },
    call('glob', { path: 7 }),
    call('yield', { result: { data: 'block' } }),
  ];
  const text = jsonl([
    { type: 'message', timestamp: isoAt(0), message: { role: 'user', content: [{ type: 'text', text: 'Review.' }] } },
    first,
    { type: 'message', timestamp: isoAt(6), message: { role: 'toolResult', content: [{ type: 'text', text: 'x' }] } },
    second,
  ]);
  assert.deepEqual(score.transcriptFacts(text, 'tools.jsonl'), {
    requestedTier: null,
    messages: [
      { model: MODEL, effort: null, servedTier: 'default' },
      { model: MODEL, effort: null, servedTier: 'default' },
    ],
    sideCalls: [],
    ompVersion: VERIFIED_OMP,
    toolCalls: [
      { name: 'read', path: `${SCOPE_CASE}/plan.md:1-40` },
      { name: 'grep', path: null },
      { name: 'glob', path: null },
      { name: 'yield', path: null },
    ],
  });
  // A transcript without a tool call has no toolCalls field.
  assert.equal('toolCalls' in score.transcriptFacts(jsonl(FALLBACK_TRANSCRIPT), 'fallback.jsonl'), false);
});
test('readScope allows the inputs of the run, the instructions of the reviewer, and other web pages', () => {
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  const allowed = [
    ...reads(
      `${SCOPE_CASE}/snapshot`,
      `${SCOPE_CASE}/snapshot/src/sync.mjs:40-52`,
      `${SCOPE_CASE}/snapshot/src/sync.mjs:1-20:raw`,
      `${SCOPE_CASE}/plan.md:1-260`,
      `${SCOPE_CASE}/full.diff`,
      `${SCOPE_CASE}/focus-correctness.diff:100+50`,
      `${SCOPE_CASE}/delta.diff`,
      `${SCOPE_CASE}/plan.diff`,
      `${SCOPE_CASE}/previous-review.md`,
      `${SCOPE_CASE}/rejection.md`,
      `${SCOPE_CASE}/C3-low/run-1/prompts/correctness.txt`,
      // The instructions of the reviewer, by an absolute path and by a path relative to the working directory.
      `${LIVE_PLUGIN}/agents/code-reviewer.md`,
      'plugins/plan-lifecycle/skills/code-reviewer/SKILL.md',
      `${LIVE_PLUGIN}/skills/code-reviewer/references/correctness.md:1-80`,
      `${LIVE_PLUGIN}/skills/plan-reviewer/references/checklist.md`,
      'skill://code-review/references/perf.md',
      'skill://code-clarity',
      'artifact://12:1-40',
      'https://nodejs.org/api/fs.html',
      'https://github.com/nodejs/node/issues/1',
    ),
    { name: 'glob', path: `${SCOPE_CASE}/snapshot/**/AGENTS.md` },
    { name: 'grep', path: `${SCOPE_CASE}/snapshot/src; ${SCOPE_CASE}/snapshot/tests` },
    { name: 'glob', path: `${LIVE_PLUGIN}/skills/code-reviewer/references/*.md` },
    // Calls without a path that search nothing.
    { name: 'yield', path: null },
    { name: 'web_search', path: null },
  ];
  assert.deepEqual(score.readScope(allowed, scope), { outside: [] });
});
test('readScope lists each target outside the inputs of the run once, in call order', () => {
  // The measured plugin copies hold plan-manager, so its installed copy is outside (see score.mjs pluginSkills).
  const scope = {
    runDir: `${SCOPE_CASE}/C3-low/run-1`,
    cwd: LIVE,
    pluginRoots: [LIVE_PLUGIN],
    heldSkills: ['code-reviewer', 'plan-manager', 'plan-reviewer'],
  };
  const calls = [
    // case.json can hold the known defects of a dev case.
    ...reads(
      `${SCOPE_CASE}/case.json`,
      `${SCOPE_CASE}/case.json:1-20`,
      `${SCOPE_CASE}/snapshot/../case.json`,
      `${SCOPE_CASE}/C3-high/run-1/blocks/correctness.md`,
    ),
    { name: 'glob', path: `${SCOPE_CASE}/**/*.diff` },
    { name: 'glob', path: `${SCOPE_CASE}/snapshot/**/../*.json` },
    { name: 'grep', path: `${SCOPE_CASE}/snapshot;${LIVE}/src` },
    // The live checkout: other files, other skills (they can hold fixed shipped text), and the other plugin root.
    ...reads(
      'scripts/score.mjs',
      `${LIVE}/plugins/docks/skills/code-review/references/perf.md`,
      `${LIVE_PLUGIN}/skills/plan-manager/SKILL.md`,
      `${LIVE_PLUGIN}/README.md`,
      `${BASELINE_PLUGIN}/skills/code-reviewer/SKILL.md`,
    ),
    { name: 'grep', path: null },
    { name: 'glob', path: null },
    { name: 'find', path: null },
    ...reads(
      '/etc/hosts',
      'skill://plan-manager/SKILL.md',
      // A skill that no measured plugin copy holds, such as the always-apply skill unslop, and a spill file of the
      // reviewer (omp.mjs SPILL_SCHEMES) stay inside.
      'skill://unslop/SKILL.md',
      'local://3.log',
      'history://Code7C3R2Correctness',
      'issue://100',
      'pr://101',
      'https://github.com/DocksDocks/docks/blob/main/src/sync.mjs',
      'https://raw.githubusercontent.com/DocksDocks/docks/main/src/sync.mjs',
      'https://github.com/docksdocks/Docks/issues/100',
      'https://api.github.com/repos/DocksDocks/docks/pulls/101',
    ),
  ];
  assert.deepEqual(score.readScope(calls, scope), {
    outside: [
      `${SCOPE_CASE}/case.json`,
      `${SCOPE_CASE}/snapshot/../case.json`,
      `${SCOPE_CASE}/C3-high/run-1/blocks/correctness.md`,
      `${SCOPE_CASE}/**/*.diff`,
      `${SCOPE_CASE}/snapshot/**/../*.json`,
      `${LIVE}/src`,
      'scripts/score.mjs',
      `${LIVE}/plugins/docks/skills/code-review/references/perf.md`,
      `${LIVE_PLUGIN}/skills/plan-manager/SKILL.md`,
      `${LIVE_PLUGIN}/README.md`,
      `${BASELINE_PLUGIN}/skills/code-reviewer/SKILL.md`,
      'grep without a path',
      'glob without a path',
      'find without a path',
      '/etc/hosts',
      'skill://plan-manager/SKILL.md',
      'history://Code7C3R2Correctness',
      'issue://100',
      'pr://101',
      'https://github.com/DocksDocks/docks/blob/main/src/sync.mjs',
      'https://raw.githubusercontent.com/DocksDocks/docks/main/src/sync.mjs',
      'https://github.com/docksdocks/Docks/issues/100',
      'https://api.github.com/repos/DocksDocks/docks/pulls/101',
    ],
  });
  // Without a working directory, a relative path is outside. Without a plugin root, the skill of the reviewer is too.
  const ownSkill = `${LIVE_PLUGIN}/skills/code-reviewer/SKILL.md`;
  const relativeSkill = 'plugins/plan-lifecycle/skills/code-reviewer/SKILL.md';
  assert.deepEqual(score.readScope(reads(relativeSkill, ownSkill), { ...scope, cwd: null }), {
    outside: [relativeSkill],
  });
  assert.deepEqual(score.readScope(reads(ownSkill), { ...scope, pluginRoots: [] }), { outside: [ownSkill] });
});
test('readScope refuses every skill:// read of the benchmark skill and every read inside the live benchmark folder', () => {
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN], heldSkills: [] };
  const installed = '/home/u/.omp/plugins/node_modules/docks-kit-omp/skills';
  // The benchmark skill is no measured plugin skill, so only its own rule keeps a reviewer from its answer keys.
  const benchmarkReads = reads(
    'skill://review-benchmark/cases/heldout/x.key.json',
    'skill://review-benchmark',
    'skill://unslop/../review-benchmark/cases',
    `${installed}/review-benchmark/cases/heldout/x.key.json`,
  );
  const kept = reads('skill://unslop', `${installed}/unslop/SKILL.md`);
  assert.deepEqual(score.readScope([...benchmarkReads, ...kept], scope), {
    outside: benchmarkReads.map((call) => call.path),
  });
  // A read inside the live benchmark folder is outside, also when the run itself sits there and the read names one of
  // its inputs, and also as a relative path or a glob from the benchmark folder.
  const runDir = `${SKILL_DIR}/ws/code-7/C3-low/run-1`;
  const liveReads = [
    ...reads(`${SKILL_DIR}/cases/heldout/x.key.json`, `${SKILL_DIR}/ws/code-7/snapshot/src/sync.mjs`, 'cases/heldout'),
    { name: 'glob', path: `${SKILL_DIR}/ws/code-7/snapshot/**/*.mjs` },
  ];
  assert.deepEqual(score.readScope(liveReads, { ...scope, runDir, cwd: SKILL_DIR }), {
    outside: liveReads.map((call) => call.path),
  });
});
test('readScope refuses a read through a symbolic link of an allowed folder that points into the live benchmark folder', () => {
  const root = scratch();
  const caseDir = path.join(root, 'ws', 'code-7');
  const snapshot = path.join(caseDir, 'snapshot');
  put(snapshot, 'src/sync.mjs', 'export const lock = 1;\n');
  const heldout = path.join(SKILL_DIR, 'cases', 'heldout');
  const heldoutFile = path.join(heldout, fs.readdirSync(heldout).sort()[0]);
  const link = (name, target) => fs.symlinkSync(target, path.join(snapshot, name));
  // A folder link and a file link into the benchmark folder, a dangling link into it, and a link that stays inside
  // the snapshot.
  link('keys', heldout);
  link('key.md', heldoutFile);
  link('gone.key.json', path.join(heldout, 'none.key.json'));
  link('alias.mjs', path.join(snapshot, 'src', 'sync.mjs'));
  const scope = { runDir: path.join(caseDir, 'C3-low', 'run-1'), cwd: snapshot, pluginRoots: [], heldSkills: [] };
  const outside = [
    // An absolute path and a relative path of the file link.
    ...reads(path.join(snapshot, 'key.md'), 'key.md'),
    // A file of the linked folder, and a missing file under it.
    ...reads(path.join(snapshot, 'keys', path.basename(heldoutFile)), path.join(snapshot, 'keys', 'missing.key.json')),
    // A glob and a grep whose folder is the linked folder.
    { name: 'glob', path: path.join(snapshot, 'keys', '*.patch') },
    { name: 'grep', path: path.join(snapshot, 'keys') },
    // A dangling link whose target would be in the benchmark folder.
    ...reads(path.join(snapshot, 'gone.key.json')),
  ];
  const inside = reads(path.join(snapshot, 'alias.mjs'), 'alias.mjs', path.join(snapshot, 'src', 'sync.mjs'));
  assert.deepEqual(score.readScope([...outside, ...inside], scope), { outside: outside.map((call) => call.path) });
});
test('readScope refuses a glob or a search of a folder that holds a symbolic link into the benchmark folder at any depth', () => {
  const root = scratch();
  const snapshotOf = (caseId) => path.join(root, 'ws', caseId, 'snapshot');
  const scopeOf = (caseId) => ({
    runDir: path.join(root, 'ws', caseId, 'C3-low', 'run-1'),
    cwd: snapshotOf(caseId),
    pluginRoots: [],
    heldSkills: [],
  });
  const searchesOf = (snapshot) => [
    { name: 'glob', path: path.join(snapshot, '**', 'x.json') },
    { name: 'grep', path: snapshot },
    { name: 'find', path: snapshot },
    { name: 'glob', path: '**/*.mjs' },
  ];
  // A nested link `deep/k` to the held-out folder: a glob or a search of the snapshot can follow it.
  const linked = snapshotOf('code-7');
  put(linked, 'src/sync.mjs', 'export const lock = 1;\n');
  fs.mkdirSync(path.join(linked, 'deep'));
  fs.symlinkSync(path.join(SKILL_DIR, 'cases', 'heldout'), path.join(linked, 'deep', 'k'));
  const linkedSearches = searchesOf(linked);
  // readScope lists each outside target once, so the grep and the find of the snapshot give one entry.
  assert.deepEqual(score.readScope(linkedSearches, scopeOf('code-7')), {
    outside: [...new Set(linkedSearches.map((call) => call.path))],
  });
  // A read of a file of the same snapshot is no search, so the link under it does not matter.
  assert.deepEqual(score.readScope(reads(path.join(linked, 'src', 'sync.mjs')), scopeOf('code-7')), { outside: [] });
  // The same searches of a snapshot without such a link, also with a link that stays inside the snapshot.
  const plain = snapshotOf('code-8');
  put(plain, 'src/sync.mjs', 'export const lock = 1;\n');
  fs.mkdirSync(path.join(plain, 'deep'));
  fs.symlinkSync(path.join(plain, 'src'), path.join(plain, 'deep', 'k'));
  assert.deepEqual(score.readScope(searchesOf(plain), scopeOf('code-8')), { outside: [] });
});
test('readScope of a loop round allows the tree copies of its run up to that round and nothing fixed after it', () => {
  const run = `${SCOPE_CASE}/B0-low/run-1`;
  const tree = (runRound) => `${SCOPE_WS}/trees/${score.runLabel('code-7', 'B0-low', runRound)}/src/sync.mjs`;
  const scope = { runDir: run, round: 2, cwd: LIVE, pluginRoots: [BASELINE_PLUGIN] };
  const allowed = [
    ...reads(
      `${run}/round-2/snapshot/src/sync.mjs`,
      `${run}/round-2/full.diff`,
      `${run}/round-2/focus-spec-and-tests.diff`,
      `${run}/round-2/delta.diff`,
      `${run}/round-2/previous-review.md:1-30`,
      `${run}/round-2/rejection.md`,
      `${run}/round-2/prompts/full.txt`,
      `${run}/round-1/prompts/full.txt`,
      // Round 1 reviewed the tree of the case folder.
      `${SCOPE_CASE}/snapshot/src/sync.mjs`,
      `${SCOPE_CASE}/plan.md`,
      tree('run-1/round-2'),
      // A baseline plugin at a ref before the flat layout keeps its skills in a category folder.
      `${BASELINE_PLUGIN}/agents/code-reviewer.md`,
      `${BASELINE_PLUGIN}/skills/legacy/code-reviewer/SKILL.md`,
    ),
    { name: 'glob', path: `${run}/round-2/snapshot/**/*.mjs` },
  ];
  assert.deepEqual(score.readScope(allowed, scope), { outside: [] });
  // A later round and the fixer folder hold fixed code; meta.json holds the fix plan.
  const outside = [
    `${run}/round-3/snapshot/src/sync.mjs`,
    `${run}/round-1/fixer/snapshot/src/sync.mjs`,
    `${run}/round-1/fixer/fixer-1.patch`,
    `${run}/round-1/meta.json`,
    `${SCOPE_CASE}/B0-low/run-2/round-2/snapshot/src/sync.mjs`,
    tree('run-1/round-3'),
    tree('run-2/round-2'),
    `${LIVE_PLUGIN}/skills/code-reviewer/SKILL.md`,
  ];
  assert.deepEqual(score.readScope(reads(...outside), scope), { outside });
});
test('transcripts command writes the outside reads of each reviewer and leaves fixer entries without them', () => {
  const root = scratch();
  const ws = path.join(root, 'ws');
  const sessions = path.join(root, 'sessions');
  const { low } = CONFIGS;
  const caseDir = path.join(ws, 'code-7');
  const round = (r) => path.join(caseDir, 'C1-low', 'run-1', `round-${r}`);
  put(ws, 'code-7/case.json', { id: 'code-7', kind: 'code', split: 'dev' });
  put(round(1), 'prompts/full.txt', 'agent: review-bench-candidate-code-low\n\nReview.\n');
  put(round(1), 'meta.json', { config: low, mode: 'full' });
  put(round(1), 'fixer/fixer-1.txt', 'agent: review-bench-fixer\n\nRepair.\n');
  put(round(2), 'prompts/delta.txt', 'agent: review-bench-candidate-code-low\n\nReview.\n');
  put(round(2), 'meta.json', { config: low, mode: 'delta' });
  // The read scope takes the files that the case changes from the full.diff of each round.
  put(caseDir, 'full.diff', '');
  put(round(2), 'full.diff', '');
  const relativeSkill = 'plugins/docks/skills/code-review/references/perf.md';
  put(
    sessions,
    'Code7C1LowR1K1Full.jsonl',
    toolTranscript(caseDir, 30, [
      // The system prompt names the plugin root of this skill.
      ['read', { path: `${LIVE_PLUGIN}/skills/code-reviewer/SKILL.md` }],
      ['read', { path: `${path.join(caseDir, 'full.diff')}:1-200` }],
      ['read', { path: relativeSkill }],
      ['grep', { pattern: 'lock' }],
      ['yield', { result: { data: 'block' } }],
    ]),
  );
  put(
    sessions,
    'Code7C1LowR1K1Fixer1.jsonl',
    toolTranscript(
      caseDir,
      20,
      [
        ['read', { path: path.join(round(1), 'fixer', 'snapshot', 'src', 'extra.mjs') }],
        ['write', { path: '/work/scratch/b/src/extra.mjs' }],
      ],
      'review-bench-fixer',
    ),
  );
  put(
    sessions,
    'Code7C1LowR1K2Delta.jsonl',
    toolTranscript(caseDir, 12, [
      ['read', { path: path.join(round(2), 'snapshot', 'src', 'sync.mjs') }],
      ['read', { path: path.join(round(2), 'delta.diff') }],
      ['grep', { pattern: 'lock', path: path.join(round(2), 'snapshot') }],
    ]),
  );
  assert.deepEqual(transcriptsCommand(ws, sessions), [
    'Code7C1LowR1K1Full',
    'Code7C1LowR1K1Fixer1',
    'Code7C1LowR1K2Delta',
  ]);
  assert.deepEqual(readJson(path.join(round(1), 'meta.json')), {
    config: low,
    mode: 'full',
    reviewers: {
      full: { ...provenCost(low, 30, 100), readScope: { outside: [relativeSkill, 'grep without a path'] } },
    },
    fixer: { seconds: 20, tokens: 100, agents: { 'fixer-1': provenCost(low, 20, 100) } },
  });
  // A reviewer with tool calls only inside its inputs gets an empty outside list.
  assert.deepEqual(readJson(path.join(round(2), 'meta.json')), {
    config: low,
    mode: 'delta',
    reviewers: { delta: { ...provenCost(low, 12, 100), readScope: { outside: [] } } },
  });
});
test('names lists a fixer prompt only until its patch exists, and transcripts still reads the fixer transcript', () => {
  const root = scratch();
  const ws = path.join(root, 'ws');
  const sessions = path.join(root, 'sessions');
  const { low } = CONFIGS;
  const caseDir = path.join(ws, 'code-7');
  const round1 = path.join(caseDir, 'C1-low', 'run-1', 'round-1');
  const relative = path.join('code-7', 'C1-low', 'run-1', 'round-1');
  put(ws, 'code-7/case.json', { id: 'code-7', kind: 'code', split: 'dev' });
  put(round1, 'prompts/full.txt', 'agent: review-bench-candidate-code-low\n\nReview.\n');
  put(round1, 'meta.json', { config: low, mode: 'full' });
  put(round1, 'blocks/full.md', FULL_BLOCK);
  put(round1, 'fixer/fixer-1.txt', 'agent: review-bench-fixer\n\nRepair.\n');
  const reviewerEntry = { prompt: path.join(relative, 'prompts', 'full.txt'), name: 'Code7C1LowR1K1Full' };
  assert.deepEqual(namesCommand(ws), [
    reviewerEntry,
    { prompt: path.join(relative, 'fixer', 'fixer-1.txt'), name: 'Code7C1LowR1K1Fixer1' },
  ]);
  // The fixer wrote an empty patch: no listed finding needed a change.
  put(round1, 'fixer/fixer-1.patch', '');
  assert.deepEqual(namesCommand(ws), [reviewerEntry]);
  put(sessions, 'Code7C1LowR1K1Full.jsonl', toolTranscript(caseDir, 30, []));
  // The fixer replies through its `yield` call, under a key of its own choice, with one line per finding.
  const finding = (n) => `code-7/C1-low/run-1/round-1/full#${n}`;
  const reply = [`${finding(1)}: not present`, `- \`${finding(2)}\`: Not present.`];
  put(
    sessions,
    'Code7C1LowR1K1Fixer1.jsonl',
    toolTranscript(
      caseDir,
      20,
      [
        ['read', { path: path.join(round1, 'fixer', 'snapshot', 'src', 'extra.mjs') }],
        ['yield', { data: { reply } }],
      ],
      'review-bench-fixer',
    ),
  );
  assert.deepEqual(transcriptsCommand(ws, sessions), ['Code7C1LowR1K1Full', 'Code7C1LowR1K1Fixer1']);
  assert.deepEqual(readJson(path.join(round1, 'meta.json')).fixer, {
    seconds: 20,
    tokens: 100,
    agents: { 'fixer-1': provenCost(low, 20, 100) },
    replies: { [finding(1)]: 'not present', [finding(2)]: 'not present' },
  });
});
test('transcripts on the probe workspace writes the effort and the served tier of each reviewer', () => {
  const root = neutralScratch();
  const ws = path.join(root, 'ws');
  const sessions = path.join(root, 'sessions');
  const project = path.join(root, 'project');
  const configs = [CONFIGS['low-fast'], CONFIGS.high];
  put(project, '.omp/agents/review-bench-configs.json', { configs });
  const script = path.join(SCRIPTS_DIR, 'prepare.mjs');
  const probe = spawnSync(BUN_RUNTIME, [script, 'probe', '--out', ws, '--project', project], {
    encoding: 'utf8',
    env: fakeOmp().env,
  });
  assert.equal(probe.status, 0, probe.stderr);
  assert.match(probe.stdout, /^dispatch at most 8 agents at a time, so that every arm runs the same way$/m);
  const caseDir = path.join(ws, 'probe');
  // The probe changes no file, so its full.diff is empty.
  assert.equal(readText(path.join(caseDir, 'full.diff')), '');
  const runDir = (config) => path.join(caseDir, `C1-${config.name}`, 'run-1');
  // One fake reviewer transcript per configuration: the task is the prompt of the probe, and the reviewer replies with
  // one yield call (the reply tool of an agent with an output schema, see omp.mjs REPLY_TOOL) and reads no file.
  for (const [index, config] of configs.entries()) {
    const [provider, model] = config.model.split('/');
    const [, , ...task] = readText(path.join(runDir(config), 'prompts', 'full.txt')).split('\n');
    const last = assistantLine(5 + index, provider, model, config.tier, { input: 90, output: 10 });
    last.message.content = [
      { type: 'text', text: 'ready' },
      { type: 'toolCall', id: 'call-1', name: 'yield', arguments: { result: { data: 'ready' } } },
    ];
    const message = { role: 'user', content: [{ type: 'text', text: task.join('\n') }] };
    const name = dispatchName('probe', `C1-${config.name}`, 'run-1', 'full');
    put(
      sessions,
      `${name}.jsonl`,
      jsonl([
        sessionRecord({ cwd: LIVE }),
        { type: 'model_change', timestamp: isoAt(0), model: config.model },
        { type: 'thinking_level_change', timestamp: isoAt(0), thinkingLevel: config.effort },
        { type: 'service_tier_change', timestamp: isoAt(0), serviceTier: { openai: config.tier } },
        {
          type: 'session_init',
          timestamp: isoAt(0),
          agent: `review-bench-candidate-code-${config.name}`,
          systemPrompt: ['You are a coding assistant.'],
          task: message.content[0].text,
        },
        { type: 'message', timestamp: isoAt(0), message },
        last,
      ]),
    );
  }
  assert.deepEqual(transcriptsCommand(ws, sessions).sort(), ['ProbeC1HighR1Full', 'ProbeC1LowFastR1Full']);
  for (const [index, config] of configs.entries()) {
    assert.deepEqual(readJson(path.join(runDir(config), 'meta.json')), {
      config,
      reviewers: { full: { ...provenCost(config, 5 + index, 100), readScope: { outside: [] } } },
    });
  }
  // The probe case is a code case like the others, so a code case without full.diff still stops transcripts.
  fs.rmSync(path.join(caseDir, 'full.diff'));
  assert.throws(() => transcriptsCommand(ws, sessions), /full\.diff is missing/);
});
test('a reviewer that read outside its inputs makes the run invalid, also without a configuration', () => {
  const config = CONFIGS['xhigh-fast'];
  const many = ['a', 'b', 'c', 'd', 'e'].map((name) => `${LIVE}/src/${name}.mjs`);
  const perf = `${LIVE}/plugins/docks/skills/code-review/references/perf.md`;
  const costs = [
    provenCost(config, 100, 100, { readScope: { outside: [] } }),
    provenCost(config, 200, 100, { readScope: { outside: [perf] } }),
    provenCost(config, 300, 100, {
      messages: [{ model: MODEL, effort: 'high', servedTier: 'priority' }],
      readScope: { outside: many },
    }),
  ];
  // Only the runs that read outside their inputs find D1, so they would raise the recall of the summary.
  const answers = [[], [{ matches: { D1: 'match' } }], [{ matches: { D1: 'match' } }]];
  const fixture = judgedArm(CODE_KNOWN.slice(0, 1), answers, costs);
  for (const meta of Object.values(fixture.metas)) meta.config = config;
  const scores = scoreRuns(fixture);
  const manyReason = `correctness: read outside its inputs: ${many.slice(0, 3).join(', ')}, and 2 more`;
  assert.deepEqual(
    scores.runs.map((run) => [run.run, run.invalid]),
    [
      ['run-1', []],
      ['run-2', [`correctness: read outside its inputs: ${perf}`]],
      ['run-3', ['correctness: effort high, not xhigh', manyReason]],
    ],
  );
  const [summary] = scores.summaries;
  assert.deepEqual([summary.runs, summary.recall.mean], [1, 0]);
  const lines = renderReport(scores).split('\n');
  assert.ok(lines.includes('## Invalid runs'));
  assert.ok(lines.includes(`- code-7/C3/run-3: correctness: effort high, not xhigh; ${manyReason}`));
  // A run without a configuration still proves that it read only its inputs.
  const legacy = scoreRuns(judgedArm(CODE_KNOWN.slice(0, 1), answers, costs));
  assert.deepEqual(
    legacy.runs.map((run) => [run.run, run.invalid]),
    [
      ['run-1', []],
      ['run-2', [`correctness: read outside its inputs: ${perf}`]],
      ['run-3', [manyReason]],
    ],
  );
  assert.equal(legacy.summaries[0].runs, 1);
});
// Changed export:
// - readScope also allows, for each plugin root P, the file `P/skills/plan-manager/references/plan-contract.md` or
//   `P/skills/<folder>/plan-manager/references/plan-contract.md`: the plan-reviewer checklist tells the reviewer to
//   read this contract in its own plugin. It also allows a path under
//   `<any>/plugins/cache/plugins/<plugin dir>/skills/[<folder>/]<skill>/`, where skill is code-review or code-clarity,
//   when the path as the reviewer wrote it has no `..` segment: a `skill://` URI of these skills can resolve to this
//   installed copy. A glob follows the glob rule above. The other skills of the repository that holds P stay outside,
//   because the reviewed repository has its own copy under `snapshot/`.

test('readScope allows the plan contract of a plugin root and an installed cache copy of an allowed skill', () => {
  // The measured plugin copies hold plan-manager (see score.mjs pluginSkills).
  const scope = {
    runDir: `${SCOPE_CASE}/C3-low/run-1`,
    cwd: LIVE,
    pluginRoots: [LIVE_PLUGIN],
    heldSkills: ['code-reviewer', 'plan-manager', 'plan-reviewer'],
  };
  const cache = '/home/user/.omp/plugins/cache/plugins/docks___docks___0.21.0/skills';
  // omp 19 installs the kit plugin as a package (omp.mjs INSTALLED_SKILL_ROOTS).
  const kitPackage = '/home/user/.omp/plugins/node_modules/docks-kit-omp/skills';
  const allowed = [
    ...reads(
      `${LIVE_PLUGIN}/skills/plan-manager/references/plan-contract.md:120-160`,
      `${LIVE_PLUGIN}/skills/plan-manager/references/plan-contract.md`,
      `${cache}/engineering/code-review/references/security.md`,
      `${cache}/code-clarity/SKILL.md:1-40`,
      // A `..` segment that stays among the allowed skills reads the path that it reaches (see normalizeLocal).
      `${cache}/engineering/code-review/../code-clarity/SKILL.md`,
      `${cache}/engineering//code-review/./references/perf.md`,
      `${kitPackage}/code-review/SKILL.md`,
      // A skill that no measured plugin copy holds.
      `${kitPackage}/unslop/SKILL.md`,
    ),
    { name: 'glob', path: `${cache}/engineering/code-review/references/*.md` },
  ];
  assert.deepEqual(score.readScope(allowed, scope), { outside: [] });
  const outside = [
    // The docks skills of the repository that holds the plugin root. The plans name them, but the copy of the reviewed
    // repository is under the snapshot root.
    `${LIVE}/plugins/docks/skills/code-review/references/perf.md`,
    `${LIVE}/plugins/docks/skills/**/code-clarity/SKILL.md`,
    // Only the plan contract file of a plugin root of the reviewer.
    `${LIVE_PLUGIN}/skills/plan-manager/references/other.md`,
    `${LIVE_PLUGIN}/skills/plan-manager/references/*.md`,
    `${LIVE_PLUGIN}/skills/a/b/plan-manager/references/plan-contract.md`,
    `${BASELINE_PLUGIN}/skills/plan-manager/references/plan-contract.md`,
    // An installed copy of a skill that a measured plugin copy holds, a path whose `..` segment leaves the allowed skill
    // for it, and a glob from a folder above the skill folders.
    `${cache}/productivity/plan-manager/references/plan-contract.md`,
    `${cache}/engineering/code-review/../../productivity/plan-manager/SKILL.md`,
    `${cache}/**/code-review/SKILL.md`,
    `${kitPackage}/plan-manager/SKILL.md`,
    `${kitPackage}/code-reviewer/SKILL.md`,
  ];
  assert.deepEqual(score.readScope(reads(...outside), scope), { outside });
});
// Changed exports:
// - readScope takes the option changedFiles: the repository paths that the case changes (default none). An optional
//   instruction read is outside when the case changes the same file: the plan contract of a plugin root, a path under
//   an allowed skill folder of a plugin cache copy, or a `skill://` URI of an allowed skill. The comparison uses the
//   path from the skill folder name on: `plugins/<plugin>/skills/[<folder>/]<skill>/<rest>` and a cache path
//   `…/skills/[<folder>/]<skill>/<rest>` give `<skill>/<rest>`, `skill://<skill>` gives `<skill>/SKILL.md`, and
//   `skill://<skill>/<rest>` gives `<skill>/<rest>`. A glob is outside when a changed file can be under the folder
//   before its first glob segment. The agent file and the skill folder of the reviewer in its plugin root stay allowed
//   also when the case changes them.
// - transcriptsCommand gives readScope the changed files of the case: for a plan or plan-delta case, the paths in the
//   Files cells of the Steps table of the plan.md of the case folder; for a run with round folders, the paths in the
//   `diff --git` and `+++ b/` lines of the full.diff of the round (round 1: of the case folder); for a single-review
//   code run, the paths in these lines of each diff file of the case folder.

test('readScope puts an optional instruction read outside when the case changes the same file', () => {
  const cache = '/home/user/.omp/plugins/cache/plugins/docks___docks___0.21.0/skills';
  const scope = {
    runDir: `${SCOPE_CASE}/C3-low/run-1`,
    cwd: LIVE,
    pluginRoots: [LIVE_PLUGIN],
    changedFiles: [
      'plugins/plan-lifecycle/skills/plan-manager/references/plan-contract.md',
      'plugins/docks/skills/code-review/SKILL.md',
      'plugins/plan-lifecycle/agents/code-reviewer.md',
      'plugins/plan-lifecycle/skills/code-reviewer/SKILL.md',
    ],
  };
  const allowed = [
    ...reads(
      `${cache}/engineering/code-review/references/perf.md`,
      'skill://code-clarity',
      // The reviewer cannot work without its agent file and its own skill folder, so they stay allowed.
      `${LIVE_PLUGIN}/skills/code-reviewer/SKILL.md`,
      `${LIVE_PLUGIN}/agents/code-reviewer.md`,
    ),
    { name: 'glob', path: `${cache}/engineering/code-review/references/*.md` },
  ];
  assert.deepEqual(score.readScope(allowed, scope), { outside: [] });
  const outside = [
    `${LIVE_PLUGIN}/skills/plan-manager/references/plan-contract.md`,
    `${cache}/engineering/code-review/SKILL.md`,
    'skill://code-review',
    // The folder before the first glob segment holds the changed SKILL.md.
    `${cache}/engineering/code-review/*.md`,
  ];
  assert.deepEqual(score.readScope(reads(...outside), scope), { outside });
  // A case that changes none of these files allows the same reads.
  assert.deepEqual(score.readScope(reads(...outside), { ...scope, changedFiles: [] }), { outside: [] });
});
test('transcripts command takes the changed files of a plan case from the Files cells of its Steps table', () => {
  const root = scratch();
  const ws = path.join(root, 'ws');
  const sessions = path.join(root, 'sessions');
  const contract = 'plugins/plan-lifecycle/skills/plan-manager/references/plan-contract.md';
  put(ws, 'plan-3/case.json', { id: 'plan-3', kind: 'plan', split: 'dev' });
  put(
    ws,
    'plan-3/plan.md',
    [
      '## Goal',
      '',
      'Change the plan contract.',
      '',
      '## Steps',
      '',
      '| # | Id | Task | Files | Depends | Effect | Status | Done when |',
      '|---:|---|---|---|---|---|---|---|',
      `| 1 | contract | Edit the contract | \`${contract}\`, scripts/a.mjs | - | local | planned | the check passes |`,
      '',
    ].join('\n'),
  );
  put(ws, 'plan-3/P0/run-1/prompts/plan.txt', 'agent: review-bench-candidate-plan-low\n\nReview.\n');
  const contractRead = `${LIVE_PLUGIN}/skills/plan-manager/references/plan-contract.md`;
  put(
    sessions,
    'Plan3P0R1Plan.jsonl',
    toolTranscript(path.join(ws, 'plan-3'), 30, [
      ['read', { path: contractRead }],
      ['read', { path: 'skill://code-review/references/perf.md' }],
    ]),
  );
  assert.deepEqual(transcriptsCommand(ws, sessions), ['Plan3P0R1Plan']);
  assert.deepEqual(readJson(path.join(ws, 'plan-3/P0/run-1/meta.json')).reviewers.plan.readScope, {
    outside: [contractRead],
  });
});
