#!/usr/bin/env node
// Scores review benchmark runs. `findings` parses the returned review blocks, `pairs` builds the judge input,
// `report` turns the judgments and the run metadata into recall and cost tables, `transcripts` fills the run
// metadata from omp subagent transcripts, and `names` prints the dispatch name of every prompt.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseReviewComment } from '../../../../plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs';

const USAGE =
  'usage: score.mjs findings <ws> | pairs <ws> --cases <cases-dir> | report <ws> | transcripts <ws> --omp-sessions <dir> | names <ws>';
const CASE_KINDS = new Set(['code', 'code-delta', 'plan', 'plan-delta']);
const REVIEWER_ORDER = ['full', 'correctness', 'spec-and-tests', 'text-and-safety', 'delta', 'plan'];
const RUN_DIR = /^run-(\d+)$/;
const CODE_FINDING = /^\s*[-*+]\s+(?:\*\*)?\[(critical|high|medium|low)\](?:\*\*)?\s*(.*)$/i;
const PLAN_FINDING = /^\s*[-*+]\s+(?:\*\*|`)?(goal_fit|research_gap|security_risk)(?:\*\*|`)?(?=[\s:]|$)\s*:?\s*(.*)$/i;
// Fields of a finding line are separated by a dash with spaces around it, so `plan-reviewer` and `12-30` stay whole.
const FIELD_SEPARATOR = /\s+[-–—]\s+/;
// `path`, `path:12`, `path:12-30`, `path:12:5`, `path#L12`, and `path#L12-L30`.
const LOCATION = /^(.*?)(?:(?::|#L)(\d+)(?:[-–]L?(\d+))?(?::\d+)?)?$/;
const MATCH_VERDICTS = new Set(['match', 'no', 'unknown']);
const RATINGS = new Set(['valid', 'wrong', 'unknown']);
// A round is as bad as its worst block, the rule that the plan helper applies to a comment with several blocks.
const VERDICT_RANK = { pass: 0, repair: 1, 'fixes-required': 1, blocked: 2 };
const TOKEN_FIELDS = ['input', 'cacheRead', 'cacheWrite', 'output'];

function fail(message) {
  throw new Error(message);
}
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const hash = (text) => createHash('sha256').update(text).digest('hex');
const runNumber = (run) => Number(RUN_DIR.exec(String(run))?.[1] ?? run);
const reviewerRank = (name) => (REVIEWER_ORDER.includes(name) ? REVIEWER_ORDER.indexOf(name) : REVIEWER_ORDER.length);
const byReviewer = (a, b) => reviewerRank(a) - reviewerRank(b) || compare(a, b);

function readJson(file, hint = '') {
  if (!fs.existsSync(file)) fail(`${file} is missing${hint}`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${file} is not valid JSON: ${error.message}`);
  }
}
function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}
function directories(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compare);
}
function baseNames(dir, extension) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(extension))
    .map((name) => name.slice(0, -extension.length));
}

// Opaque ids keep arm names out of the judge input. They derive from the stable ids, so a rerun keeps them.
export const blindId = (id) => `F-${hash(id).slice(0, 10)}`;
export const runLabel = (caseId, arm, run) => `R-${hash(`${caseId}/${arm}/${run}`).slice(0, 8)}`;

export function caseFamily(kind) {
  if (!CASE_KINDS.has(kind)) fail(`unknown case kind: ${kind}`);
  return kind.startsWith('plan') ? 'plan' : 'code';
}

// A reviewer may write a path relative to the snapshot root, a bare file name, or an absolute snapshot path.
function normalizeFile(value) {
  let file = value.replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');
  const snapshot = file.lastIndexOf('/snapshot/');
  if (file.startsWith('/') && snapshot !== -1) file = file.slice(snapshot + '/snapshot/'.length);
  return file;
}
function isFilePath(value) {
  if (!/^[\w@.+~/-]+$/.test(value) || /^[\d.]+$/.test(value)) return false;
  const base = value.split('/').filter(Boolean).at(-1) ?? '';
  return value.includes('/') ? base !== '' : /^[\w@+~-]*\.[A-Za-z][\w-]*$/.test(base);
}

// Every file in a locator with its line range; a locator without a file, such as a plan section, gives none.
export function parseLocator(locator) {
  const files = new Map();
  for (const raw of String(locator ?? '').split(/[\s,;()[\]]+/)) {
    const token = raw.replace(/^[`'"<]+/, '').replace(/[`'".:>]+$/, '');
    if (!token || token.includes('://')) continue;
    const [, candidate, start, end] = LOCATION.exec(token);
    const file = normalizeFile(candidate);
    if (!isFilePath(file)) continue;
    const startLine = start === undefined ? null : Number(start);
    const endLine = end === undefined ? startLine : Number(end);
    files.set(`${file}:${startLine}:${endLine}`, { file, start: startLine, end: endLine });
  }
  return [...files.values()];
}

function splitFields(text, separators) {
  const fields = [];
  let rest = text;
  while (fields.length < separators) {
    const match = FIELD_SEPARATOR.exec(rest);
    if (!match) break;
    fields.push(rest.slice(0, match.index).trim());
    rest = rest.slice(match.index + match[0].length);
  }
  fields.push(rest.trim());
  return fields;
}

// `- [SEVERITY] Category - locator - defect - fix` or `- goal_fit|research_gap|security_risk - locator - defect - fix`.
// The defect and the fix stay together in `text`, because reviewers do not always separate them with a dash.
export function parseFindingLine(line) {
  const code = CODE_FINDING.exec(line);
  if (code) {
    const fields = splitFields(code[2], 2);
    let [category, locator, text] = fields;
    if (fields.length === 1) [category, locator, text] = ['', '', fields[0]];
    if (fields.length === 2 && parseLocator(locator).length === 0) [locator, text] = ['', locator];
    return {
      type: 'code',
      severity: code[1].toUpperCase(),
      category: category.replace(/[*`]/g, '').trim(),
      locator,
      files: parseLocator(locator),
      text: text ?? '',
    };
  }
  const plan = PLAN_FINDING.exec(line);
  if (!plan) return undefined;
  const rest = plan[2].replace(/^[-–—]\s+/, '');
  const fields = splitFields(rest, 1);
  const [locator, text] = fields.length === 1 ? ['', fields[0]] : fields;
  return { type: 'plan', severity: null, category: plan[1].toLowerCase(), locator, files: parseLocator(locator), text };
}

// Indented lines under a finding, such as a list of more instances of one defect class, belong to that finding.
export function parseFindings(text) {
  const findings = [];
  let current;
  for (const line of text.split(/\r?\n/)) {
    const finding = parseFindingLine(line);
    if (finding) {
      findings.push(finding);
      current = finding;
    } else if (current && /^\s+\S/.test(line)) {
      current.text = `${current.text} ${line.trim()}`.trim();
      const known = new Set(current.files.map((file) => `${file.file}:${file.start}:${file.end}`));
      for (const file of parseLocator(line)) {
        if (!known.has(`${file.file}:${file.start}:${file.end}`)) current.files.push(file);
      }
    } else {
      current = undefined;
    }
  }
  return findings;
}

// Some runtimes return the block JSON-wrapped: a JSON string, or an object whose one field is the block text.
// Any other text, including other JSON, stays as it is.
export function unwrapBlock(text) {
  let value;
  try {
    value = JSON.parse(text.trim());
  } catch {
    return text;
  }
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const values = Object.values(value);
    if (values.length === 1 && typeof values[0] === 'string') return values[0];
  }
  return text;
}

// The verdict comes from the plan helper. A block of the other review kind is unreadable for this case.
export function parseBlock(text, family) {
  const block = unwrapBlock(text);
  const review = parseReviewComment(block);
  return { verdict: review?.kind === family ? review.verdict : 'unreadable', findings: parseFindings(block) };
}

export function roundVerdict(verdicts) {
  if (verdicts.length === 0 || verdicts.some((verdict) => !Object.hasOwn(VERDICT_RANK, verdict))) return 'incomplete';
  return verdicts.reduce((worst, next) => (VERDICT_RANK[next] > VERDICT_RANK[worst] ? next : worst));
}

export function readWorkspace(ws) {
  if (!fs.existsSync(ws)) fail(`workspace not found: ${ws}`);
  const runs = [];
  for (const folder of directories(ws)) {
    const caseFile = path.join(ws, folder, 'case.json');
    if (!fs.existsSync(caseFile)) continue;
    const caseData = readJson(caseFile);
    if (caseData.id !== folder) fail(`${caseFile} has id ${caseData.id}, but its folder is ${folder}`);
    const family = caseFamily(caseData.kind);
    for (const arm of directories(path.join(ws, folder)).filter((name) => name !== 'snapshot')) {
      const armDir = path.join(ws, folder, arm);
      const runNames = directories(armDir).filter((name) => RUN_DIR.test(name));
      for (const run of runNames.sort((a, b) => runNumber(a) - runNumber(b))) {
        const runDir = path.join(armDir, run);
        const prompts = baseNames(path.join(runDir, 'prompts'), '.txt');
        const reviewers = [...new Set([...prompts, ...baseNames(path.join(runDir, 'blocks'), '.md')])].sort(byReviewer);
        runs.push({ caseId: folder, caseData, family, arm, run, runDir, prompts: new Set(prompts), reviewers });
      }
    }
  }
  if (runs.length === 0) fail(`no case runs under ${ws}`);
  return runs;
}

export function collectFindings(ws) {
  const blocks = [];
  const findings = [];
  for (const { caseId, caseData, family, arm, run, runDir, reviewers } of readWorkspace(ws)) {
    for (const reviewer of reviewers) {
      const file = path.join(runDir, 'blocks', `${reviewer}.md`);
      const block = { case: caseId, kind: caseData.kind, arm, run, reviewer, verdict: 'missing', findings: 0 };
      blocks.push(block);
      if (!fs.existsSync(file)) continue;
      const parsed = parseBlock(fs.readFileSync(file, 'utf8'), family);
      block.verdict = parsed.verdict;
      block.findings = parsed.findings.length;
      for (const [index, finding] of parsed.findings.entries()) {
        const id = `${caseId}/${arm}/${run}/${reviewer}#${index + 1}`;
        findings.push({ id, blind: blindId(id), case: caseId, arm, run, reviewer, n: index + 1, ...finding });
      }
    }
  }
  return { blocks, findings };
}

export function sameFile(a, b) {
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`) || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

// Code pairs need a shared file. Plan pairs, and pairs where either side has no file, always go to the judge.
export function pairWanted(family, finding, known) {
  if (family === 'plan') return true;
  const knownFiles = parseLocator(known.locator);
  if (finding.files.length === 0 || knownFiles.length === 0) return true;
  return finding.files.some((file) => knownFiles.some((item) => sameFile(file.file, item.file)));
}

// The known defects of a case: inline in a development case, or in the `<id>.key.json` file of a held-out case.
export function readKnown(casesDir, caseId, split) {
  const caseFile = [path.join(casesDir, split ?? '', `${caseId}.json`), path.join(casesDir, `${caseId}.json`)].find(
    (file) => fs.existsSync(file),
  );
  if (!caseFile) fail(`case file ${caseId}.json not found under ${casesDir}`);
  const data = readJson(caseFile);
  let known = data.known;
  if (known === undefined) {
    const key = readJson(caseFile.replace(/\.json$/, '.key.json'), ` and ${caseFile} has no known defects`);
    known = Array.isArray(key) ? key : key.known;
  }
  if (!Array.isArray(known) || known.some((item) => typeof item?.id !== 'string'))
    fail(`the known defects of ${caseId} must be a list of items with a string id`);
  if (new Set(known.map((item) => item.id)).size !== known.length) fail(`${caseId} repeats a known defect id`);
  return { kind: data.kind, known };
}

export function buildPairs(findingsDoc, cases) {
  const result = new Map();
  const labels = new Map();
  const blinds = new Map();
  const runEntry = (caseId, arm, run) => {
    if (!result.has(caseId)) {
      if (!cases[caseId]) fail(`no known defects for case ${caseId}`);
      const { kind, known } = cases[caseId];
      result.set(caseId, { case: caseId, kind, known, runs: new Map() });
    }
    const label = runLabel(caseId, arm, run);
    const key = `${caseId}/${arm}/${run}`;
    if (labels.has(label) && labels.get(label) !== key) fail(`run label collision: ${key} and ${labels.get(label)}`);
    labels.set(label, key);
    const runs = result.get(caseId).runs;
    if (!runs.has(label)) runs.set(label, { run: label, findings: [], pairs: [] });
    return runs.get(label);
  };
  for (const block of findingsDoc.blocks) runEntry(block.case, block.arm, block.run);
  for (const finding of findingsDoc.findings) {
    if (blinds.has(finding.blind)) fail(`finding id collision: ${finding.id} and ${blinds.get(finding.blind)}`);
    blinds.set(finding.blind, finding.id);
    const target = runEntry(finding.case, finding.arm, finding.run);
    const { kind, known } = result.get(finding.case);
    const { severity, category, locator, text } = finding;
    target.findings.push({ finding: finding.blind, severity, category, locator, text });
    for (const item of known) {
      if (pairWanted(caseFamily(kind), finding, item)) target.pairs.push({ finding: finding.blind, known: item.id });
    }
  }
  const sortedCases = [...result.values()].sort((a, b) => compare(a.case, b.case));
  return {
    cases: sortedCases.map((entry) => ({
      case: entry.case,
      kind: entry.kind,
      known: entry.known,
      runs: [...entry.runs.values()]
        .sort((a, b) => compare(a.run, b.run))
        .map((run) => ({
          run: run.run,
          findings: run.findings.sort((a, b) => compare(a.finding, b.finding)),
          pairs: run.pairs.sort((a, b) => compare(a.finding, b.finding) || compare(a.known, b.known)),
        })),
    })),
  };
}

export function summarize(values) {
  const numbers = values.filter((value) => typeof value === 'number').sort((a, b) => a - b);
  if (numbers.length === 0) return { mean: null, median: null, min: null, max: null };
  const middle = Math.floor(numbers.length / 2);
  return {
    mean: numbers.reduce((sum, value) => sum + value, 0) / numbers.length,
    median: numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2,
    min: numbers[0],
    max: numbers.at(-1),
  };
}

function recordOnce(map, key, value, label) {
  if (map.has(key) && map.get(key) !== value) fail(`judgments.json gives ${label} two different answers`);
  map.set(key, value);
}

function readJudgments(judgments, byBlind, knownByCase) {
  const verdicts = new Map();
  const ratings = new Map();
  for (const entry of judgments.matches ?? []) {
    const finding = byBlind.get(entry.finding);
    if (!finding) fail(`judgments.json names unknown finding ${entry.finding}`);
    if (!knownByCase.get(finding.case).includes(entry.known))
      fail(`judgments.json pairs ${entry.finding} with ${entry.known}, which is not a known defect of its case`);
    if (!MATCH_VERDICTS.has(entry.verdict)) fail(`judgments.json has match verdict ${entry.verdict}`);
    recordOnce(verdicts, `${entry.finding} ${entry.known}`, entry.verdict, `${entry.finding} and ${entry.known}`);
  }
  for (const entry of judgments.adjudications ?? []) {
    if (!byBlind.has(entry.finding)) fail(`judgments.json names unknown finding ${entry.finding}`);
    if (!RATINGS.has(entry.rating)) fail(`judgments.json has rating ${entry.rating}`);
    recordOnce(ratings, entry.finding, entry.rating, entry.finding);
  }
  // `match` pairs count as found. `unknown` pairs stay, because a known defect that a run did not find can still
  // hide behind one of them.
  const matched = new Map();
  const unsure = new Map();
  for (const [pair, verdict] of verdicts) {
    const target = verdict === 'match' ? matched : verdict === 'unknown' ? unsure : null;
    if (!target) continue;
    const [finding, known] = pair.split(' ');
    if (!target.has(finding)) target.set(finding, new Set());
    target.get(finding).add(known);
  }
  return { matched, unsure, ratings };
}

// A known defect is unresolved in a run when the run did not find it and the judge answered `unknown` for a pair
// of it with at least one finding of the run. `unknownPairs` counts every `unknown` pair answer of the run, also
// those that cannot change recall, such as a finding that may repeat a known defect the run found.
function scoreRun(run, knownIds, { matched, unsure, ratings }, meta) {
  const found = new Set();
  const doubtful = new Set();
  let unknownPairs = 0;
  const counts = { validExtras: 0, wrong: 0, unknown: 0, unjudged: 0 };
  for (const finding of run.findings) {
    for (const id of unsure.get(finding.blind) ?? []) {
      doubtful.add(id);
      unknownPairs += 1;
    }
    const hits = matched.get(finding.blind);
    if (hits) {
      for (const id of hits) found.add(id);
      continue;
    }
    const rating = ratings.get(finding.blind);
    if (rating === 'valid') counts.validExtras += 1;
    else if (rating === 'wrong') counts.wrong += 1;
    else if (rating === 'unknown') counts.unknown += 1;
    else counts.unjudged += 1;
  }
  // A run's time is its slowest reviewer and its tokens are the sum; one reviewer without a value leaves both open.
  const costs = run.blocks.map((block) => meta?.reviewers?.[block.reviewer]);
  const seconds = costs.every((cost) => typeof cost?.seconds === 'number')
    ? Math.max(...costs.map((cost) => cost.seconds))
    : null;
  const tokens = costs.every((cost) => typeof cost?.tokens === 'number')
    ? costs.reduce((sum, cost) => sum + cost.tokens, 0)
    : null;
  return {
    case: run.case,
    arm: run.arm,
    run: run.run,
    known: knownIds.length,
    found: knownIds.filter((id) => found.has(id)),
    recall: knownIds.length ? found.size / knownIds.length : null,
    ...counts,
    unresolved: knownIds.filter((id) => doubtful.has(id) && !found.has(id)).length,
    unknownPairs,
    seconds,
    tokens,
    verdicts: run.blocks.map((block) => ({ reviewer: block.reviewer, verdict: block.verdict })),
    roundVerdict: roundVerdict(run.blocks.map((block) => block.verdict)),
  };
}

// metas maps `<case>/<arm>/<run>` to the content of that run's meta.json.
export function scoreRuns({ findings: findingsDoc, pairs: pairsDoc, judgments, metas = {} }) {
  const knownByCase = new Map(pairsDoc.cases.map((entry) => [entry.case, entry.known.map((item) => item.id)]));
  const byBlind = new Map(findingsDoc.findings.map((finding) => [finding.blind, finding]));
  const runs = new Map();
  for (const block of findingsDoc.blocks) {
    if (!knownByCase.has(block.case)) fail(`pairs.json has no case ${block.case}; run score.mjs pairs first`);
    const key = `${block.case}/${block.arm}/${block.run}`;
    if (!runs.has(key)) runs.set(key, { case: block.case, arm: block.arm, run: block.run, blocks: [], findings: [] });
    runs.get(key).blocks.push(block);
  }
  const judged = readJudgments(judgments, byBlind, knownByCase);
  for (const finding of findingsDoc.findings)
    runs.get(`${finding.case}/${finding.arm}/${finding.run}`).findings.push(finding);
  const runScores = [...runs.entries()]
    .map(([key, run]) => scoreRun(run, knownByCase.get(run.case), judged, metas[key]))
    .sort((a, b) => compare(a.case, b.case) || compare(a.arm, b.arm) || runNumber(a.run) - runNumber(b.run));
  const groups = new Map();
  for (const run of runScores) {
    const key = `${run.case}/${run.arm}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run);
  }
  const mean = (runsOfArm, field) => summarize(runsOfArm.map((run) => run[field])).mean;
  const summaries = [...groups.values()].map((runsOfArm) => ({
    case: runsOfArm[0].case,
    arm: runsOfArm[0].arm,
    runs: runsOfArm.length,
    known: runsOfArm[0].known,
    recall: summarize(runsOfArm.map((run) => run.recall)),
    validExtras: mean(runsOfArm, 'validExtras'),
    wrong: mean(runsOfArm, 'wrong'),
    unknown: mean(runsOfArm, 'unknown'),
    unresolved: mean(runsOfArm, 'unresolved'),
    unknownPairs: mean(runsOfArm, 'unknownPairs'),
    seconds: summarize(runsOfArm.map((run) => run.seconds)),
    tokens: summarize(runsOfArm.map((run) => run.tokens)),
  }));
  return { summaries, runs: runScores };
}

const decimals = (digits) => (value) => (value === null || value === undefined ? '-' : value.toFixed(digits));
const ratio = decimals(2);
const oneDecimal = decimals(1);
const whole = decimals(0);
const row = (cells) => `| ${cells.join(' | ')} |`;
// Each column is [heading, cell of one entry, right-aligned].
const SUMMARY_COLUMNS = [
  ['Case', (entry) => entry.case],
  ['Arm', (entry) => entry.arm],
  ['Runs', (entry) => entry.runs, true],
  ['Known', (entry) => entry.known, true],
  ['Recall mean', (entry) => ratio(entry.recall.mean), true],
  ['Recall median', (entry) => ratio(entry.recall.median), true],
  ['Recall min', (entry) => ratio(entry.recall.min), true],
  ['Recall max', (entry) => ratio(entry.recall.max), true],
  ['Valid extras mean', (entry) => ratio(entry.validExtras), true],
  ['Wrong mean', (entry) => ratio(entry.wrong), true],
  ['Unknown mean', (entry) => ratio(entry.unknown), true],
  ['Unresolved mean', (entry) => ratio(entry.unresolved), true],
  ['Unknown pairs mean', (entry) => ratio(entry.unknownPairs), true],
  ['Seconds median', (entry) => oneDecimal(entry.seconds.median), true],
  ['Seconds min', (entry) => oneDecimal(entry.seconds.min), true],
  ['Seconds max', (entry) => oneDecimal(entry.seconds.max), true],
  ['Tokens median', (entry) => whole(entry.tokens.median), true],
  ['Tokens min', (entry) => whole(entry.tokens.min), true],
  ['Tokens max', (entry) => whole(entry.tokens.max), true],
];
const RUN_COLUMNS = [
  ['Case', (run) => run.case],
  ['Arm', (run) => run.arm],
  ['Run', (run) => run.run],
  ['Recall', (run) => ratio(run.recall), true],
  ['Found', (run) => run.found.join(', ') || '-'],
  ['Valid extras', (run) => run.validExtras, true],
  ['Wrong', (run) => run.wrong, true],
  ['Unknown', (run) => run.unknown, true],
  ['Unjudged', (run) => run.unjudged, true],
  ['Unresolved', (run) => run.unresolved, true],
  ['Unknown pairs', (run) => run.unknownPairs, true],
  ['Seconds', (run) => oneDecimal(run.seconds), true],
  ['Tokens', (run) => whole(run.tokens), true],
  ['Round verdict', (run) => run.roundVerdict],
  ['Block verdicts', (run) => run.verdicts.map(({ reviewer, verdict }) => `${reviewer}: ${verdict}`).join(', ')],
];
function table(columns, entries) {
  return [
    row(columns.map(([heading]) => heading)),
    row(columns.map(([, , right]) => (right ? '---:' : '---'))),
    ...entries.map((entry) => row(columns.map(([, cell]) => cell(entry)))),
  ];
}

// The report holds numbers, verdicts, and known-defect ids only, so a held-out reader learns no defect text.
export function renderReport({ summaries, runs }) {
  return [
    '# Review benchmark report',
    '',
    'Recall is the number of known defects that at least one reviewer of a run found, divided by the known defects of the case.',
    'Unresolved is the number of known defects that a run did not find, where the judge answered unknown for a pair of the defect with a finding of the run.',
    'Unknown pairs is the number of unknown answers for pairs of a finding of the run and a known defect. Unresolved counts the known defects of those answers that can change recall.',
    'Seconds is the slowest reviewer of a run. Tokens is the sum over the reviewers of a run. A dash means no value.',
    '',
    '## Summary',
    '',
    ...table(SUMMARY_COLUMNS, summaries),
    '',
    '## Runs',
    '',
    ...table(RUN_COLUMNS, runs),
    '',
  ].join('\n');
}

// The omp task name of a dispatch, for example `Code96C3R2SpecAndTests`; its transcript is `<name>.jsonl`.
export function dispatchName(caseId, arm, run, reviewer) {
  const pascal = (value) =>
    String(value)
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join('');
  return `${pascal(caseId)}${pascal(arm)}R${runNumber(run)}${pascal(reviewer)}`;
}

// Adds the dispatch name to each `{ caseId, arm, run, reviewer }` entry. The name drops separators and case, so
// for example `code-7` and `code_7` give one name; two reviewers with one name would share one transcript.
export function dispatchNames(dispatches) {
  const owners = new Map();
  return dispatches.map((dispatch) => {
    const { caseId, arm, run, reviewer } = dispatch;
    const name = dispatchName(caseId, arm, run, reviewer);
    const owner = `${caseId}/${arm}/${run}/${reviewer}`;
    if (owners.has(name) && owners.get(name) !== owner)
      fail(`dispatch name collision: ${owners.get(name)} and ${owner} both give ${name}; rename a case or an arm`);
    owners.set(name, owner);
    return { ...dispatch, name };
  });
}

// Every reviewer that has a prompt, in workspace order, with its dispatch name.
function promptedDispatches(ws) {
  return dispatchNames(
    readWorkspace(ws).flatMap(({ caseId, arm, run, runDir, reviewers, prompts }) =>
      reviewers.filter((reviewer) => prompts.has(reviewer)).map((reviewer) => ({ caseId, arm, run, runDir, reviewer })),
    ),
  );
}

// omp writes `<name>.jsonl`, `<parent>.<name>.jsonl` for a nested dispatch, and `<name>-<n>.jsonl` for a repeated
// name. The latest repeat is the dispatch whose block the operator kept.
export function pickTranscript(files, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^(?:.+\\.)?${escaped}(?:-(\\d+))?\\.jsonl$`);
  const matches = files.flatMap((file) => {
    const match = pattern.exec(path.basename(file));
    return match ? [{ file, repeat: Number(match[1] ?? 1) }] : [];
  });
  const latest = Math.max(...matches.map((match) => match.repeat));
  const chosen = matches.filter((match) => match.repeat === latest);
  if (chosen.length > 1) fail(`more than one transcript for ${name}: ${chosen.map((match) => match.file).join(', ')}`);
  return chosen[0]?.file;
}

// Seconds run from the first user message to the last assistant message. Tokens add uncached input, cache reads,
// cache writes, and output over the assistant messages.
export function parseTranscript(text, source = 'transcript') {
  let first;
  let last;
  let tokens = 0;
  for (const [index, line] of text.split('\n').entries()) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      fail(`${source} line ${index + 1} is not JSON`);
    }
    if (entry.type !== 'message') continue;
    const time = Date.parse(entry.timestamp);
    if (entry.message?.role === 'user' && first === undefined) first = time;
    if (entry.message?.role === 'assistant') {
      last = time;
      const usage = entry.message.usage ?? {};
      tokens += TOKEN_FIELDS.reduce((sum, field) => sum + (usage[field] ?? 0), 0);
    }
  }
  if (!Number.isFinite(first) || !Number.isFinite(last))
    fail(`${source} has no timestamped user message and assistant message`);
  return { seconds: Math.round((last - first) / 100) / 10, tokens };
}

function transcriptFiles(dir) {
  if (!fs.existsSync(dir)) fail(`omp session directory not found: ${dir}`);
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...transcriptFiles(file));
    else if (entry.name.endsWith('.jsonl')) files.push(file);
  }
  return files;
}

export function findingsCommand(ws) {
  const doc = collectFindings(ws);
  writeJson(path.join(ws, 'findings.json'), doc);
  return doc;
}

export function pairsCommand(ws, casesDir) {
  const findingsDoc = readJson(path.join(ws, 'findings.json'), '; run score.mjs findings first');
  const cases = {};
  for (const caseId of new Set(findingsDoc.blocks.map((block) => block.case))) {
    cases[caseId] = readKnown(casesDir, caseId, readJson(path.join(ws, caseId, 'case.json')).split);
  }
  const doc = buildPairs(findingsDoc, cases);
  writeJson(path.join(ws, 'pairs.json'), doc);
  return doc;
}

export function reportCommand(ws) {
  const findings = readJson(path.join(ws, 'findings.json'), '; run score.mjs findings first');
  const pairs = readJson(path.join(ws, 'pairs.json'), '; run score.mjs pairs first');
  const judgments = readJson(path.join(ws, 'judgments.json'), '; the judge writes it');
  const metas = {};
  for (const block of findings.blocks) {
    const key = `${block.case}/${block.arm}/${block.run}`;
    const file = path.join(ws, block.case, block.arm, block.run, 'meta.json');
    if (!(key in metas) && fs.existsSync(file)) metas[key] = readJson(file);
  }
  const scores = scoreRuns({ findings, pairs, judgments, metas });
  fs.writeFileSync(path.join(ws, 'report.md'), renderReport(scores));
  return scores;
}

export function namesCommand(ws) {
  return promptedDispatches(ws).map(({ runDir, reviewer, name }) => ({
    prompt: path.relative(ws, path.join(runDir, 'prompts', `${reviewer}.txt`)),
    name,
  }));
}

// Fills `seconds` and `tokens` in each run's meta.json and keeps every other field. It checks every dispatch name
// before it writes, writes what it finds, then fails with the names of the dispatches that have no transcript.
export function transcriptsCommand(ws, sessionsDir) {
  const files = transcriptFiles(sessionsDir);
  const byRun = new Map();
  for (const dispatch of promptedDispatches(ws)) {
    if (!byRun.has(dispatch.runDir)) byRun.set(dispatch.runDir, []);
    byRun.get(dispatch.runDir).push(dispatch);
  }
  const updated = [];
  const missing = [];
  for (const [runDir, dispatches] of byRun) {
    const metaFile = path.join(runDir, 'meta.json');
    const meta = fs.existsSync(metaFile) ? readJson(metaFile) : {};
    meta.reviewers ??= {};
    let changed = false;
    for (const { reviewer, name } of dispatches) {
      const file = pickTranscript(files, name);
      if (!file) {
        missing.push(name);
        continue;
      }
      meta.reviewers[reviewer] = {
        ...meta.reviewers[reviewer],
        ...parseTranscript(fs.readFileSync(file, 'utf8'), file),
      };
      updated.push(name);
      changed = true;
    }
    if (changed) writeJson(metaFile, meta);
  }
  if (missing.length) fail(`no transcript under ${sessionsDir} for: ${missing.join(', ')}`);
  return updated;
}

function parseOptions(args, allowed) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const [flag, value] = [args[index], args[index + 1]];
    if (!allowed.includes(flag) || value === undefined || value.startsWith('--')) fail(USAGE);
    options[flag] = value;
  }
  for (const flag of allowed) if (!options[flag]) fail(USAGE);
  return options;
}

const COMMANDS = {
  findings: {
    options: [],
    run: (ws) => {
      const { blocks, findings } = findingsCommand(ws);
      const missing = blocks.filter((block) => block.verdict === 'missing').length;
      const unreadable = blocks.filter((block) => block.verdict === 'unreadable').length;
      return `findings.json: ${findings.length} findings in ${blocks.length} blocks (${missing} missing, ${unreadable} unreadable)`;
    },
  },
  pairs: {
    options: ['--cases'],
    run: (ws, options) => {
      const { cases } = pairsCommand(ws, options['--cases']);
      const count = cases.reduce(
        (sum, entry) => sum + entry.runs.reduce((total, run) => total + run.pairs.length, 0),
        0,
      );
      return `pairs.json: ${count} candidate pairs in ${cases.length} cases`;
    },
  },
  report: {
    options: [],
    run: (ws) => `report.md: ${reportCommand(ws).runs.length} runs`,
  },
  transcripts: {
    options: ['--omp-sessions'],
    run: (ws, options) => `meta.json: ${transcriptsCommand(ws, options['--omp-sessions']).length} reviewers updated`,
  },
  names: {
    options: [],
    run: (ws) =>
      namesCommand(ws)
        .map(({ prompt, name }) => `${prompt}\t${name}`)
        .join('\n'),
  },
};

export function main([command, ws, ...args]) {
  if (!Object.hasOwn(COMMANDS, command) || !ws) fail(USAGE);
  const { options, run } = COMMANDS[command];
  return run(path.resolve(ws), parseOptions(args, options));
}

function invokedDirectly() {
  try {
    return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  try {
    console.log(main(process.argv.slice(2)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
