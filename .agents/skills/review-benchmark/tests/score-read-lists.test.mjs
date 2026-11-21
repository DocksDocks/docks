import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import * as score from '../scripts/score.mjs';
import {
  findingsCommand,
  main,
  pairsCommand,
  parseTranscript,
  renderReport,
  scoreRuns,
  transcriptsCommand,
} from '../scripts/score.mjs';
import {
  assistantLine,
  CODE_KNOWN,
  CONFIGS,
  CORRECTNESS_BLOCK,
  isoAt,
  jsonl,
  judgeAll,
  judgedArm,
  LIVE,
  LIVE_PLUGIN,
  MODEL,
  put,
  readJson,
  reads,
  SCOPE_CASE,
  scratch,
  tableAfter,
  toolTranscript,
  transcriptEntry,
  workspace,
} from './helpers.mjs';

test('readScope splits the path of grep, glob, and ast_grep on `;` and keeps the path of other tools whole', () => {
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  // A file name can hold `;`: a read or a find of it is one target under the snapshot.
  const whole = [
    ...reads(`${SCOPE_CASE}/snapshot/src/a;b.mjs`, `${SCOPE_CASE}/snapshot/src/a;b.mjs:1-20`),
    { name: 'find', path: `${SCOPE_CASE}/snapshot/src;b` },
  ];
  assert.deepEqual(score.readScope(whole, scope), { outside: [] });
  // The path of these tools is a list, so each part is a target; a relative part resolves against the live checkout.
  const lists = [
    { name: 'grep', path: `${SCOPE_CASE}/snapshot/src;b.mjs` },
    { name: 'glob', path: `${SCOPE_CASE}/snapshot/**/*.md; ${LIVE}/docs/*.md` },
    { name: 'ast_grep', path: `${SCOPE_CASE}/snapshot/src; ${LIVE}/src` },
    // ast_grep without a path searches the working directory, as grep, glob, and find do.
    { name: 'ast_grep', path: null },
  ];
  assert.deepEqual(score.readScope(lists, scope), {
    outside: ['b.mjs', `${LIVE}/docs/*.md`, `${LIVE}/src`, 'ast_grep without a path'],
  });
});
// Plan #100, code review round 3: omp reads a path as a list only when no file or folder has the whole path, and it
// resolves a relative path of the list against its working directory.
//
// Changed exports:
// - readScope takes the option `lists`: a Map from a target (the trimmed path of a call, or a `;`-part of the path of
//   grep, glob, or ast_grep, with its read selector) to the paths that omp read for it, without read selectors. A
//   target with an entry is allowed only when each of these paths is allowed, and outside lists it as the reviewer
//   wrote it. A target without an entry is one path. The function reads no file.
// - transcriptsCommand gives readScope the lists of the transcript of the reviewer:
//   - for a read call whose tool result has `details.displayReadTargets`, the paths of that list, except each path
//     that a note `Could not read <path>: <reason>` in `details.notes` names (omp could not read it);
//   - for every other target with `;`, `,`, or white space outside `{}` and not after a backslash, the split that omp
//     takes, checked on the files, with a relative path against the `cwd` of the session. A target whose whole path
//     exists, as written or without its read selector, gets no list. Else the list is the first of these splits: on
//     `;`; on `,` when some part exists; on white space when each part exists; on all three when each part exists. A
//     part exists when the folder before its first glob segment exists. A URI is a list only on `;`, and only when
//     each part is a URI.

test('readScope allows a list target only when each path that omp read for it is allowed', () => {
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  const snapshot = `${SCOPE_CASE}/snapshot`;
  const [a, b] = [`${snapshot}/src/a.mjs`, `${snapshot}/src/b.mjs`];
  const lists = new Map([
    [`${a}, ${b}`, [a, b]],
    // omp could not read the path `133`, so the list holds only the snapshot file.
    [`${a}:65:raw,133:raw`, [a]],
    [`${a};${LIVE}/src/b.mjs`, [a, `${LIVE}/src/b.mjs`]],
    // A relative path of a list resolves against the working directory, the live checkout.
    [`${a}:1-20, src/b.mjs`, [a, 'src/b.mjs']],
    ['skill://code-review/SKILL.md;skill://code-reviewer', ['skill://code-review/SKILL.md', 'skill://code-reviewer']],
    [`${snapshot}/src, ${LIVE}/src`, [`${snapshot}/src`, `${LIVE}/src`]],
  ]);
  const allowed = reads(`${a}, ${b}`, `${a}:65:raw,133:raw`, `${snapshot}/docs/release notes.md:1-20`);
  assert.deepEqual(score.readScope(allowed, { ...scope, lists }), { outside: [] });
  const calls = [
    ...reads(`${a};${LIVE}/src/b.mjs`, `${a}:1-20, src/b.mjs`, 'skill://code-review/SKILL.md;skill://code-reviewer'),
    { name: 'grep', path: `${snapshot}/src, ${LIVE}/src` },
  ];
  assert.deepEqual(score.readScope(calls, { ...scope, lists }), {
    outside: [
      `${a};${LIVE}/src/b.mjs`,
      `${a}:1-20, src/b.mjs`,
      'skill://code-review/SKILL.md;skill://code-reviewer',
      `${snapshot}/src, ${LIVE}/src`,
    ],
  });
  // Without an entry in `lists`, a target is one path, and each whole path below is under the snapshot.
  assert.deepEqual(score.readScope(reads(`${a};${LIVE}/src/b.mjs`, `${a}:1-20, src/b.mjs`), scope), { outside: [] });
});
// The case `code-7` of the workspace `<root>/<name>` for the transcripts tests of list targets: one full round of the
// candidate at `low`, whose session runs in the live checkout `<root>/live`. The case changes no file.
function listCase(root, name) {
  const ws = path.join(root, name);
  const caseDir = path.join(ws, 'code-7');
  const round1 = path.join(caseDir, 'C1-low', 'run-1', 'round-1');
  put(ws, 'code-7/case.json', { id: 'code-7', kind: 'code', split: 'dev' });
  put(caseDir, 'full.diff', '');
  put(round1, 'prompts/full.txt', 'agent: review-bench-candidate-code-low\n\nReview.\n');
  put(round1, 'meta.json', { config: CONFIGS.low, mode: 'full' });
  const live = path.join(root, 'live');
  return { ws, sessions: path.join(root, 'sessions'), live, caseDir, snapshot: path.join(caseDir, 'snapshot'), round1 };
}
// The read scope that transcripts gives the reviewer of `listCase` for a session with the tool calls `calls` and the
// tool results `results` (see toolTranscript).
function listReadScope({ ws, sessions, live, caseDir, round1 }, calls, results = {}) {
  put(sessions, 'Code7C1LowR1K1Full.jsonl', toolTranscript(caseDir, 30, calls, undefined, { cwd: live, results }));
  assert.deepEqual(transcriptsCommand(ws, sessions), ['Code7C1LowR1K1Full']);
  return readJson(path.join(round1, 'meta.json')).reviewers.full.readScope;
}
test('transcripts reads a target as a list only when no file has its whole path, and prefers the list of omp', () => {
  // A workspace folder whose name holds a space, as `bench=…/bench-gpt 7` gives it, so each snapshot path holds one.
  const fixture = listCase(scratch(), 'bench-gpt 7');
  const { live, snapshot } = fixture;
  // The live checkout, the working directory of the reviewer, has the layout of the snapshot. The agent text names
  // another plugin root, as for a baseline reviewer, so the skill file of the live checkout is outside.
  const skill = 'plugins/plan-lifecycle/skills/code-reviewer/SKILL.md';
  for (const file of ['src/a.mjs', 'src/a;b.mjs', 'docs/release notes.md', skill]) put(snapshot, file, 'text\n');
  put(live, skill, 'text\n');
  const a = path.join(snapshot, 'src', 'a.mjs');
  const calls = [
    // Each whole path exists, as written or without its read selector, so each target is one path.
    ['read', { path: `${a}:1-20` }],
    ['read', { path: path.join(snapshot, 'src', 'a;b.mjs') }],
    ['read', { path: `${path.join(snapshot, 'docs', 'release notes.md')}:1-20` }],
    ['grep', { pattern: 'lock', path: path.join(snapshot, 'src') }],
    // No folder has the part before the space, so omp does not split the glob on white space.
    ['glob', { path: path.join(snapshot, 'src', '*.{mjs,json}') }],
    // A URL is a list only when each part is a URI.
    ['read', { path: 'https://nodejs.org/api/fs.html;jsessionid=1' }],
    // No file has the whole path, so omp reads the paths between `,`, and the relative path resolves against the live
    // checkout.
    ['read', { path: `${a}, ${skill}` }],
    ['read', { path: `${a}, ${path.join(snapshot, skill)}` }],
    // The tool result records the list: omp could not read the path `133`, so only the snapshot file counts.
    ['read', { path: `${a}:65:raw,133:raw` }],
    // Without a tool result, transcripts cannot see which paths omp could not read, so each path of the list counts:
    // `140` resolves against the live checkout.
    ['read', { path: `${a}:70:raw,140:raw` }],
  ];
  const results = {
    'call-9': {
      notes: [`Note: interpreted as 2 paths: ${a}:65:raw, 133:raw`, "Could not read 133:raw: Path '133' not found"],
      displayReadTargets: [`${a}:65:raw`, '133:raw'],
    },
  };
  assert.deepEqual(listReadScope(fixture, calls, results), { outside: [`${a}, ${skill}`, `${a}:70:raw,140:raw`] });
});
// Each call below has no tool result, so the files decide the split, as they decided for omp. Each target that is
// outside is allowed as one path (the whole path is under the snapshot, or under the code-review skill), so only the
// split makes it outside. omp://tools/find.md is silent on a delimited path, so the path of `find` follows score.mjs:
// it is one target, not a `;` list of targets as for grep, and it splits as the path of `read` splits.
test('transcripts splits a target on `;`, on white space, and on all three delimiters as omp does', () => {
  // A workspace folder without a space: a white-space split of a snapshot path in `bench-gpt 7` breaks the folder name.
  const fixture = listCase(scratch(), 'bench');
  const { live, snapshot } = fixture;
  for (const file of ['src/a.mjs', 'src/b.mjs', 'src/a,b.mjs']) put(snapshot, file, 'text\n');
  for (const file of ['src/b.mjs', 'src/c.mjs']) put(live, file, 'text\n');
  const [a, b] = [path.join(snapshot, 'src', 'a.mjs'), path.join(snapshot, 'src', 'b.mjs')];
  const [liveB, liveC] = [path.join(live, 'src', 'b.mjs'), path.join(live, 'src', 'c.mjs')];
  const whiteSpace = `${a} ${liveB}`;
  const semicolons = `${a};${liveB};missing.mjs`;
  const skills = 'skill://code-review/SKILL.md;skill://code-reviewer';
  // Each part between white space exists, but no part between `,` and not every part of the split on all three
  // delimiters exists, so only the white-space split reads this target as two paths.
  const commaName = `${path.join(snapshot, 'src', 'a,b.mjs')} ${liveC}`;
  // No part between `,` exists, and the part `<b>,<live b>` between white space does not exist, so only the split on
  // all three delimiters has parts that each exist.
  const allThree = `${a} ${b},${liveB} ${liveC}`;
  const calls = [
    // Each part exists, so omp reads the paths between white space.
    ['grep', { pattern: 'lock', path: whiteSpace }],
    // `missing.mjs` resolves against the live checkout and does not exist, so the target is one path.
    ['grep', { pattern: 'lock', path: `${a} missing.mjs` }],
    // The split on `;` needs no part to exist.
    ['find', { query: 'lock release', grep_keywords: [], path: semicolons }],
    // Each part is a URI, so omp reads the URIs between `;`: the code-reviewer skill is outside, the code-clarity
    // skill is allowed.
    ['read', { path: skills }],
    ['read', { path: 'skill://code-review/SKILL.md;skill://code-clarity' }],
    ['grep', { pattern: 'lock', path: commaName }],
    ['read', { path: allThree }],
  ];
  assert.deepEqual(listReadScope(fixture, calls), { outside: [whiteSpace, semicolons, skills, commaName, allThree] });
});
test('readScope records each web search query, and a query that targets the benchmark repository is outside', () => {
  const call = (name, args) => ({ type: 'toolCall', id: name, name, arguments: args });
  const reply = assistantLine(5, 'openai-codex', 'gpt-6.1-sol', 'default', { input: 10 });
  reply.message.content = [
    call('web_search', { query: 'node lock release finally' }),
    call('web_search', { recency: 'week' }),
    call('read', { path: `${SCOPE_CASE}/plan.md` }),
  ];
  const text = jsonl([{ type: 'message', timestamp: isoAt(0), message: { role: 'user' } }, reply]);
  assert.deepEqual(score.transcriptFacts(text, 'search.jsonl').toolCalls, [
    { name: 'web_search', path: null, query: 'node lock release finally' },
    { name: 'web_search', path: null, query: null },
    { name: 'read', path: `${SCOPE_CASE}/plan.md` },
  ]);
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  const search = (query) => ({ name: 'web_search', path: null, query });
  // The repository can show the fixes of the corpus defects. A query that names it, or names its owner without
  // another repository, can find its pages, also without a URL.
  const repository = [
    'site:github.com/DocksDocks/docks sync lock',
    'docksdocks/DOCKS review fixes',
    'GITHUB.COM/docksdocks plan-lifecycle',
    'DocksDocks docks plan-lifecycle archive fix',
    '"docks-kit" site:github.com/DocksDocks/public OR site:github.com/DocksDocks/docks',
    // An exclusion does not cancel a query that names the repository itself.
    'DocksDocks/docks sync lock -site:github.com/DocksDocks/docks',
    // A dot that ends a sentence is not part of the repository name.
    'see DocksDocks/docks.',
    // An exclusion of part of the repository, or of another site, does not remove the repository from the search.
    'DocksDocks "docks-kit" -site:github.com/DocksDocks/docks/issues',
    'DocksDocks docks-kit -site:deepwiki.com/DocksDocks/docks',
  ];
  // Another repository of the owner is not the benchmark repository, and `-site:` excludes the benchmark repository.
  const other = [
    'site:github.com/DocksDocks/public "docks-kit" "fast"',
    '"docks-kit" "sync omp" "DocksDocks/public"',
    '"docks-kit" "omp" "--fast" -site:github.com/DocksDocks/docks',
    'DocksDocks docs -site:github.com/DocksDocks',
    'DocksDocks "docks-kit" -site:github.com/DocksDocks/docks',
  ];
  const calls = [
    search('node lock release finally'),
    ...repository.map(search),
    ...other.map(search),
    search('node lock release finally'),
    search(null),
    ...reads(`${SCOPE_CASE}/plan.md`),
  ];
  assert.deepEqual(score.readScope(calls, scope), {
    outside: repository.map((query) => `web_search: ${query}`),
    queries: ['node lock release finally', ...repository, ...other],
  });
  // A reviewer without a web search gets no queries.
  assert.deepEqual(score.readScope(reads(`${SCOPE_CASE}/plan.md`), scope), { outside: [] });
});
// The benchmark repository is DocksDocks/docks-kit, and DocksDocks/docks, its name before the rename, which GitHub
// redirects to docks-kit (score.mjs BENCHMARK_REPOSITORY, targetsBenchmark, webPageAllowed).
test('a web search query and a web page of DocksDocks/docks-kit or of the old DocksDocks/docks are outside', () => {
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  const search = (query) => ({ name: 'web_search', path: null, query });
  const benchmarkQueries = [
    'DocksDocks/docks-kit sync lock',
    'site:github.com/DocksDocks/docks-kit plan base-blob',
    'docksdocks/DOCKS-KIT.git review',
    'DocksDocks/docks sync lock',
  ];
  const otherQueries = ['DocksDocks/docks-kitchen sync lock', 'site:github.com/DocksDocks/public docks-kit'];
  assert.deepEqual(score.readScope([...benchmarkQueries, ...otherQueries].map(search), scope), {
    outside: benchmarkQueries.map((query) => `web_search: ${query}`),
    queries: [...benchmarkQueries, ...otherQueries],
  });
  const benchmarkPages = [
    'https://github.com/DocksDocks/docks-kit/blob/main/cli/src/plan/checkout.ts',
    'https://github.com/DocksDocks/docks-kit.git',
    'https://raw.githubusercontent.com/DocksDocks/docks-kit/main/README.md',
    'https://github.com/docksdocks/Docks-Kit/issues/192',
    'https://github.com/DocksDocks/docks/pull/45',
    'https://deepwiki.com/DocksDocks/docks-kit',
  ];
  const otherPages = ['https://github.com/DocksDocks/docks-kitchen', 'https://github.com/other/docks-kit'];
  assert.deepEqual(score.readScope(reads(...benchmarkPages, ...otherPages), scope), { outside: benchmarkPages });
});
test('a web search whose result cites a page of the benchmark repository is outside', () => {
  const call = (id, query) => ({ type: 'toolCall', id, name: 'web_search', arguments: { query } });
  const reply = assistantLine(5, 'openai-codex', 'gpt-6.1-sol', 'default', { input: 10 });
  reply.message.content = [call('s1', 'docks-kit fast mode'), call('s2', 'compose anonymous volumes')];
  const result = (toolCallId, text) => ({
    type: 'message',
    timestamp: isoAt(6),
    message: { role: 'toolResult', toolCallId, toolName: 'web_search', content: [{ type: 'text', text }] },
  });
  const cited = 'https://github.com/DocksDocks/docks/blob/main/plugins/plan-lifecycle/README.md';
  const docs = 'https://docs.docker.com/reference/cli/docker/compose/down/';
  const text = jsonl([
    { type: 'message', timestamp: isoAt(0), message: { role: 'user' } },
    reply,
    result('s1', `The toggle is documented in the plugin README (${cited}).`),
    result('s2', `Anonymous volumes stay after down: ${docs}.`),
  ]);
  const toolCalls = score.transcriptFacts(text, 'search.jsonl').toolCalls;
  assert.deepEqual(toolCalls, [
    { name: 'web_search', path: null, query: 'docks-kit fast mode', resultUrls: [cited] },
    { name: 'web_search', path: null, query: 'compose anonymous volumes', resultUrls: [docs] },
  ]);
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  assert.deepEqual(score.readScope(toolCalls, scope), {
    outside: [`web_search result: ${cited}`],
    queries: ['docks-kit fast mode', 'compose anonymous volumes'],
  });
});
test('a truncated result URL is outside only when its text names the owner of the benchmark repository', () => {
  // omp cuts long result text with `…`, also inside a host name, so such a URL cannot be parsed, and its cut part
  // can hold the repository name.
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  const search = (resultUrls) => ({ name: 'web_search', path: null, query: 'lock release', resultUrls });
  const truncated = 'https://github.com/DocksDocks/do…';
  assert.deepEqual(score.readScope([search(['https://news.ycombinator.c…', truncated])], scope), {
    outside: [`web_search result: ${truncated}`],
    queries: ['lock release'],
  });
});
test('a page of another site that names the benchmark repository is outside', () => {
  // A mirror, a code search, or a GitHub search can show the current text of the repository.
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  // The benchmark repository is DocksDocks/docks-kit, and DocksDocks/docks, its name before the rename.
  const mirrors = [
    'https://deepwiki.com/DocksDocks/docks',
    'https://sourcegraph.com/github.com/DocksDocks/docks/-/blob/plugins/plan-lifecycle/README.md',
    'https://github.com/search?q=repo%3ADocksDocks%2Fdocks+lock&type=code',
    'https://deepwiki.com/DocksDocks/docks-kit',
    'https://github.com/search?q=repo%3ADocksDocks%2Fdocks-kit+lock&type=code',
  ];
  const allowed = ['https://deepwiki.com/DocksDocks/public', 'https://github.com/DocksDocks/docks-kitchen'];
  assert.deepEqual(score.readScope(reads(...mirrors, ...allowed), scope), { outside: mirrors });
  const search = { name: 'web_search', path: null, query: 'lock release', resultUrls: [mirrors[0], allowed[0]] };
  assert.deepEqual(score.readScope([search], scope), {
    outside: [`web_search result: ${mirrors[0]}`],
    queries: ['lock release'],
  });
});
test('readScope reads a local file with a JSON query selector as the file before the selector', () => {
  const scope = { runDir: `${SCOPE_CASE}/C3-low/run-1`, cwd: LIVE, pluginRoots: [LIVE_PLUGIN] };
  const calls = reads(
    `${SCOPE_CASE}/snapshot/scripts/config/test-contracts.json?q=.suites // .`,
    `${SCOPE_CASE}/case.json?q=.known`,
  );
  assert.deepEqual(score.readScope(calls, scope), { outside: [`${SCOPE_CASE}/case.json`] });
});
// omp reads `<file>?q=<filter>` as one file with a JSON query, also when the filter holds white space. The `?` is a glob
// character, so without this rule the white-space split would find parts that each exist (`//` and `.`).
test('transcripts reads a local file with a JSON query selector as one target, also with white space', () => {
  const fixture = listCase(scratch(), 'bench');
  const { live, snapshot } = fixture;
  put(snapshot, 'scripts/config/test-contracts.json', '{}\n');
  put(live, 'README.md', 'text\n');
  const file = path.join(snapshot, 'scripts', 'config', 'test-contracts.json');
  assert.deepEqual(listReadScope(fixture, [['read', { path: `${file}?q=.suites // .` }]]), { outside: [] });
});
test('a failed request without a served tier stays out of the model and tier checks and keeps its time', () => {
  const config = CONFIGS['xhigh-fast'];
  const head = [
    { type: 'thinking_level_change', timestamp: isoAt(0), thinkingLevel: 'xhigh' },
    { type: 'service_tier_change', timestamp: isoAt(0), serviceTier: { openai: 'priority' } },
    { type: 'message', timestamp: isoAt(1), message: { role: 'user' } },
  ];
  const reply = (second, tier) => assistantLine(second, 'openai-codex', 'gpt-6.1-sol', tier, { input: 10 });
  const error = (line) => {
    line.message.stopReason = 'error';
    return line;
  };
  // A failed request of the configured model, then a failed request of a fallback model at second 61.
  const failedFallback = error(assistantLine(61, 'anthropic', 'claude-opus-5-5', null, { input: 0 }));
  const failing = jsonl([...head, reply(5, 'priority'), error(reply(40, null)), failedFallback]);
  assert.deepEqual(score.transcriptFacts(failing, 'failing.jsonl').messages, [
    { model: MODEL, effort: 'xhigh', servedTier: 'priority' },
    { model: MODEL, effort: 'xhigh', servedTier: null, failed: true },
    { model: 'anthropic/claude-opus-5-5', effort: 'xhigh', servedTier: null, failed: true },
  ]);
  // The time of the failed requests is real wall time: the seconds run to the last failed request, also of another
  // model. The tokens count the messages of the configured model only.
  assert.deepEqual(parseTranscript(failing, 'failing.jsonl', MODEL), { seconds: 60, tokens: 20 });
  // Every request failed: no model served the reviewer.
  const noReply = jsonl([...head, error(reply(5, null))]);
  // A message that stopped on an error but has a served tier was served, so the checks keep it.
  const servedError = jsonl([...head, reply(5, 'priority'), error(reply(9, 'default'))]);
  const costs = [transcriptEntry(failing), transcriptEntry(noReply), transcriptEntry(servedError)];
  const fixture = judgedArm(CODE_KNOWN.slice(0, 1), [[], [], []], costs);
  for (const meta of Object.values(fixture.metas)) meta.config = config;
  const scores = scoreRuns(fixture);
  assert.deepEqual(
    scores.runs.map((run) => [run.run, run.invalid]),
    [
      ['run-1', []],
      ['run-2', ['correctness: no served assistant message']],
      ['run-3', ['correctness: served tier default, not priority']],
    ],
  );
  // The model and served-tier rows leave the failed requests out too.
  const decision = tableAfter(renderReport(scores, { configs: ['xhigh-fast'] }), '### Decision: -');
  assert.ok(decision.includes(`| Model | ${MODEL} |`));
  assert.ok(decision.includes('| Served tier | priority |'));
});
test('findings removes the judge answers of each finding whose text changed or that is gone', () => {
  const { ws, cases } = workspace();
  const { findings } = findingsCommand(ws);
  pairsCommand(ws, cases);
  const judgments = judgeAll(ws, () => 'no');
  const blind = Object.fromEntries(findings.map((finding) => [finding.id, finding.blind]));
  const changed = 'code-7/C3/run-1/correctness#2';
  const gone = 'code-7/B0/run-1/full#1';
  const kept = 'code-7/C3/run-2/correctness#2';
  const answersOf = (doc, id) => [...doc.matches, ...doc.adjudications].filter((entry) => entry.finding === blind[id]);
  // The second judge rated a sample that holds the changed finding and a finding that stays.
  const rated = (id) => judgments.adjudications.filter((entry) => entry.finding === blind[id]);
  put(ws, 'judgments-second.json', { matches: [], adjudications: [...rated(changed), ...rated(kept)] });
  for (const id of [changed, gone, kept]) assert.ok(answersOf(judgments, id).length > 0, `${id} has no answer`);
  // The reviewer of C3/run-1/correctness is dispatched again and words its second finding in another way, and the
  // block of B0/run-1/full is removed for a new dispatch. The ids stay the same, so the old answers would apply.
  put(ws, 'code-7/C3/run-1/blocks/correctness.md', CORRECTNESS_BLOCK.replace('on every call', 'for each call'));
  fs.rmSync(path.join(ws, 'code-7/B0/run-1/blocks/full.md'));
  const output = main(['findings', ws]).split('\n');
  assert.equal(
    output[1],
    `removed the judge answers of 2 findings whose text changed or that are gone: ${gone}, ${changed}`,
  );
  const first = readJson(path.join(ws, 'judgments.json'));
  const second = readJson(path.join(ws, 'judgments-second.json'));
  for (const id of [changed, gone]) {
    assert.deepEqual(answersOf(first, id), [], `judgments.json keeps an answer of ${id}`);
    assert.deepEqual(answersOf(second, id), [], `judgments-second.json keeps an answer of ${id}`);
  }
  // The answers of the other findings stay, also when the same text is at another place.
  assert.deepEqual(answersOf(first, kept), answersOf(judgments, kept));
  assert.deepEqual(answersOf(second, kept), rated(kept));
  const others = findings.map((finding) => finding.id).filter((id) => id !== changed && id !== gone);
  for (const id of others) assert.deepEqual(answersOf(first, id), answersOf(judgments, id));
  // A second call finds nothing stale and prints no removal.
  assert.equal(main(['findings', ws]).split('\n').length, 1);
  assert.deepEqual(findingsCommand(ws).removed, []);
});
