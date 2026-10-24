#!/usr/bin/env node
// Scores review benchmark runs. `findings` parses the returned review blocks, `pairs` builds the judge input,
// `report` turns the judgments and the run metadata into recall, cost, and configuration tables, `transcripts`
// fills the run metadata and the read scope of each reviewer from omp subagent transcripts, and `names` prints the
// dispatch name of every prompt.
// `fixPlan` and `loopEnds` give the fix step of a review loop to `prepare.mjs loop`.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseReviewComment } from '../../../../plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs';

const USAGE =
  'usage: score.mjs findings <ws> | pairs <ws> --cases <cases-dir> [--keys <keys-dir>] | report <ws> [--keys <keys-dir>] [--configs <name,...>] | transcripts <ws> --omp-sessions <dir> | names <ws>';
const CASE_KINDS = new Set(['code', 'code-delta', 'plan', 'plan-delta']);
const REVIEWER_ORDER = ['full', 'correctness', 'spec-and-tests', 'text-and-safety', 'delta', 'plan'];
const RUN_DIR = /^run-(\d+)$/;
const ROUND_DIR = /^round-([1-9]\d*)$/;
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
// Read scope (see readScope). In each input folder of a run, a reviewer may read these folders and files and the
// `*.diff` files.
const INPUT_FOLDERS = ['snapshot', 'prompts'];
const INPUT_FILES = new Set(['plan.md', 'previous-review.md', 'rejection.md']);
const REVIEWER_SKILLS = new Set(['code-reviewer', 'plan-reviewer']);
const ALLOWED_SKILLS = new Set(['code-review', 'code-clarity', ...REVIEWER_SKILLS]);
// These tools search the working directory when a call names no path.
const SEARCH_TOOLS = new Set(['grep', 'glob', 'find']);
const URI_SCHEME = /^([a-z][a-z0-9+.-]*):\/\//i;
const WEB_SCHEMES = new Set(['http', 'https']);
// The selector of a read at the end of a path, for example `:1-260` or `:23-54:raw`.
const READ_SELECTOR = /(?::[^:/]*)+$/;
const GLOB_CHARACTER = /[*?[{]/;
// Hosts whose paths start with the owner and the name of a repository.
const REPOSITORY_HOSTS = new Set(['github.com', 'www.github.com', 'raw.githubusercontent.com']);
// The owner and the names of the benchmark repository, in lower case.
const BENCHMARK_REPOSITORY = { owner: 'docksdocks', names: new Set(['docks', 'docks.git']) };
// An invalid-run reason names this many outside targets, then the count of the others.
const LISTED_READS = 3;
// An absolute path `<plugin root>/skills/[<folder>/]code-reviewer/SKILL.md` (or plan-reviewer) in an agent text.
const REVIEWER_SKILL = /(?<=^|[\s`'"(<])(\/[^\s`'"]*?)\/skills\/(?:[^\s`'"/]+\/)?(?:code|plan)-reviewer\/SKILL\.md/g;

function fail(message) {
  throw new Error(message);
}
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const hash = (text) => createHash('sha256').update(text).digest('hex');
const runNumber = (run) => Number(RUN_DIR.exec(String(run))?.[1] ?? run);
const reviewerRank = (name) => (REVIEWER_ORDER.includes(name) ? REVIEWER_ORDER.indexOf(name) : REVIEWER_ORDER.length);
const byReviewer = (a, b) => reviewerRank(a) - reviewerRank(b) || compare(a, b);
// The path of a run below its arm folder, with its round folder when the run has round folders.
const runPath = (run, round) => (round === undefined ? run : `${run}/round-${round}`);
const distinct = (values) => [...new Set(values)];
const sum = (values) => values.reduce((result, value) => result + value, 0);
// The sum of the values, or null when one of them is not a number.
const total = (values) => (values.every((value) => typeof value === 'number') ? sum(values) : null);
// The first `limit` items, then the count of the others.
function listSome(items, limit = 10) {
  const more = items.length > limit ? `, and ${items.length - limit} more` : '';
  return `${items.slice(0, limit).join(', ')}${more}`;
}

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

// Some runtimes return the block JSON-wrapped: a JSON string, or an object whose fields the reviewer chose. In an
// object, the block is the one string field that holds a review comment, so other fields such as an acknowledgment
// do not hide it; an object with one string field gives that field. Any other text, including other JSON, stays.
export function unwrapBlock(text) {
  let value;
  try {
    value = JSON.parse(text.trim());
  } catch {
    return text;
  }
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const strings = Object.values(value).filter((field) => typeof field === 'string');
    const reviews = strings.filter((field) => parseReviewComment(field) !== undefined);
    if (reviews.length === 1) return reviews[0];
    if (strings.length === 1 && Object.keys(value).length === 1) return strings[0];
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

// A run folder holds the prompts and blocks of one review round, or one `round-<r>` folder per round with them.
// The round folders start at round-1 and have no gap. A run without round folders gets the round `undefined`.
function roundFolders(runDir) {
  const rounds = directories(runDir)
    .filter((name) => ROUND_DIR.test(name))
    .map((name) => Number(ROUND_DIR.exec(name)[1]))
    .sort((a, b) => a - b);
  if (rounds.length === 0) return [{ round: undefined, dir: runDir }];
  if (rounds.some((round, index) => round !== index + 1))
    fail(`the round folders of ${runDir} must start at round-1 and have no gap`);
  if (baseNames(path.join(runDir, 'prompts'), '.txt').length || baseNames(path.join(runDir, 'blocks'), '.md').length)
    fail(`${runDir} has round folders and also its own prompts or blocks; keep them in the round folders only`);
  return rounds.map((round) => ({ round, dir: path.join(runDir, `round-${round}`) }));
}

// One entry per review round of each run. `dir` holds the prompts, blocks, and meta.json of the round.
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
        for (const { round, dir } of roundFolders(runDir)) {
          const prompts = baseNames(path.join(dir, 'prompts'), '.txt');
          const reviewers = [...new Set([...prompts, ...baseNames(path.join(dir, 'blocks'), '.md')])].sort(byReviewer);
          runs.push({
            caseId: folder,
            caseData,
            family,
            arm,
            run,
            round,
            dir,
            prompts: new Set(prompts),
            reviewers,
          });
        }
      }
    }
  }
  if (runs.length === 0) fail(`no case runs under ${ws}`);
  return runs;
}

// The blocks and findings of a round folder get its `round`. A run without round folders is round 1: its blocks and
// findings get no `round` field, so its finding ids do not change.
export function collectFindings(ws) {
  const blocks = [];
  const findings = [];
  for (const { caseId, caseData, family, arm, run, round, dir, reviewers } of readWorkspace(ws)) {
    const inRound = round === undefined ? {} : { round };
    for (const reviewer of reviewers) {
      const file = path.join(dir, 'blocks', `${reviewer}.md`);
      const block = {
        case: caseId,
        kind: caseData.kind,
        arm,
        run,
        ...inRound,
        reviewer,
        verdict: 'missing',
        findings: 0,
      };
      blocks.push(block);
      if (!fs.existsSync(file)) continue;
      const parsed = parseBlock(fs.readFileSync(file, 'utf8'), family);
      block.verdict = parsed.verdict;
      block.findings = parsed.findings.length;
      for (const [index, finding] of parsed.findings.entries()) {
        const id = `${caseId}/${arm}/${runPath(run, round)}/${reviewer}#${index + 1}`;
        findings.push({
          id,
          blind: blindId(id),
          case: caseId,
          arm,
          run,
          ...inRound,
          reviewer,
          n: index + 1,
          ...finding,
        });
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

function requireKnownList(caseId, known) {
  if (!Array.isArray(known) || known.some((item) => typeof item?.id !== 'string'))
    fail(`the known defects of ${caseId} must be a list of items with a string id`);
  if (new Set(known.map((item) => item.id)).size !== known.length) fail(`${caseId} repeats a known defect id`);
  return known;
}

const keyFile = (dir, caseId) => path.join(dir, `${caseId}.key.json`);

// The known defects in `<dir>/<caseId>.key.json`: a list, or an object with a `known` list. The result is undefined
// when the file does not exist. Every reader of a key file uses this function.
export function readKey(dir, caseId) {
  const file = keyFile(dir, caseId);
  if (!fs.existsSync(file)) return undefined;
  const key = readJson(file);
  return requireKnownList(caseId, Array.isArray(key) ? key : key?.known);
}

// The case file `<casesDir>/<split>/<caseId>.json`, else `<casesDir>/<caseId>.json`.
export function caseFilePath(casesDir, caseId, split) {
  const caseFile = [path.join(casesDir, split ?? '', `${caseId}.json`), path.join(casesDir, `${caseId}.json`)].find(
    (file) => fs.existsSync(file),
  );
  if (!caseFile) fail(`case file ${caseId}.json not found under ${casesDir}`);
  return caseFile;
}

// The known defects of a case: inline in a development case, or in the key file of a held-out case. With `keys`,
// the key file is `<keys>/<id>.key.json`, and the key file next to the case file stays unread. `dir` is the folder
// of the files that the known defects name, such as their fix patches: the case folder for inline defects, else the
// folder of the key file.
export function readKnown(casesDir, caseId, split, keys) {
  const caseFile = caseFilePath(casesDir, caseId, split);
  const data = readJson(caseFile);
  if (data.known !== undefined)
    return { kind: data.kind, known: requireKnownList(caseId, data.known), dir: path.dirname(caseFile) };
  const keyDir = keys ?? path.dirname(caseFile);
  const known = readKey(keyDir, caseId);
  if (known === undefined) fail(`${keyFile(keyDir, caseId)} is missing and ${caseFile} has no known defects`);
  return { kind: data.kind, known, dir: keyDir };
}

// Each review round of a run is one judge run with its own label. A run without round folders keeps its label.
export function buildPairs(findingsDoc, cases) {
  const result = new Map();
  const labels = new Map();
  const blinds = new Map();
  const runEntry = ({ case: caseId, arm, run, round }) => {
    if (!result.has(caseId)) {
      if (!cases[caseId]) fail(`no known defects for case ${caseId}`);
      const { kind, split, known } = cases[caseId];
      result.set(caseId, { case: caseId, kind, split: split ?? null, known, runs: new Map() });
    }
    const label = runLabel(caseId, arm, runPath(run, round));
    const key = `${caseId}/${arm}/${runPath(run, round)}`;
    if (labels.has(label) && labels.get(label) !== key) fail(`run label collision: ${key} and ${labels.get(label)}`);
    labels.set(label, key);
    const runs = result.get(caseId).runs;
    if (!runs.has(label)) runs.set(label, { run: label, findings: [], pairs: [] });
    return runs.get(label);
  };
  for (const block of findingsDoc.blocks) runEntry(block);
  for (const finding of findingsDoc.findings) {
    if (blinds.has(finding.blind)) fail(`finding id collision: ${finding.id} and ${blinds.get(finding.blind)}`);
    blinds.set(finding.blind, finding.id);
    const target = runEntry(finding);
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
      split: entry.split,
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
    mean: numbers.reduce((result, value) => result + value, 0) / numbers.length,
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
  return { verdicts, matched, unsure, ratings };
}

// A candidate pair without an answer would count as a miss, so the report refuses judgments that skip one.
// Answers for pairs that are not candidates stay allowed.
function requireCandidateAnswers(pairsDoc, verdicts) {
  const missing = pairsDoc.cases
    .flatMap((entry) => entry.runs.flatMap((run) => run.pairs))
    .map((pair) => `${pair.finding} ${pair.known}`)
    .filter((pair) => !verdicts.has(pair))
    .map((pair) => pair.replace(' ', ' and '));
  if (missing.length === 0) return;
  fail(`judgments.json has no match answer for ${missing.length} candidate pairs of pairs.json: ${listSome(missing)}`);
}

// A finding with neither a `match` answer nor a rating would count as unjudged, so the report stops on it, as it
// stops on a candidate pair without an answer. The fix step of a loop stops on it too, because it cannot decide it.
function requireJudgedFindings(findings, judgments) {
  const judged = new Set([
    ...(judgments.matches ?? []).filter((entry) => entry.verdict === 'match').map((entry) => entry.finding),
    ...(judgments.adjudications ?? []).map((entry) => entry.finding),
  ]);
  const open = findings.map((finding) => finding.blind).filter((blind) => !judged.has(blind));
  if (open.length === 0) return;
  fail(`judgments.json has no match and no adjudication for ${open.length} findings: ${listSome(open)}`);
}

// The production loop stops at this round when the round does not pass.
const MAX_LOOP_ROUNDS = 5;

// The fix step after one round of a review loop. It repairs every finding that stands:
// - fixes: the fix patch of each known defect that a finding of the round matches and that no earlier round fixed
//   (`applied`), and before it the patches that it needs through `fix_after`, also indirectly. A needed patch that
//   no finding of the round matched gets `pulled: true`. The order takes, again and again, the first known defect
//   in known-list order whose `fix_after` ids are all applied or already placed.
// - extras: the stable ids of the findings without a `match` answer that the judge rated `valid`. The fixer agent
//   repairs them.
// - rejections: the findings without a `match` answer rated `wrong` or `unknown`, with the judge's reason, for the
//   rejection comment.
// A finding that matches only applied defects needs no repair.
export function fixPlan({ findings, judgments, known, applied = [] }) {
  requireJudgedFindings(findings, judgments);
  const byId = new Map(known.map((item) => [item.id, item]));
  const matched = new Map();
  for (const entry of judgments.matches ?? []) {
    if (entry.verdict !== 'match') continue;
    if (!matched.has(entry.finding)) matched.set(entry.finding, []);
    matched.get(entry.finding).push(entry.known);
  }
  const ratings = new Map();
  for (const entry of judgments.adjudications ?? []) {
    if (!RATINGS.has(entry.rating)) fail(`judgments.json has rating ${entry.rating}`);
    recordOnce(ratings, entry.finding, entry.rating, entry.finding);
  }
  const reasons = new Map((judgments.adjudications ?? []).map((entry) => [entry.finding, entry.reason]));
  const done = new Set(applied);
  // Each known defect to fix, with true when only a fix_after list needs it.
  const wanted = new Map();
  const extras = [];
  const rejections = [];
  for (const finding of findings) {
    const hits = matched.get(finding.blind);
    if (hits) {
      for (const id of hits) {
        if (!byId.has(id))
          fail(`judgments.json pairs ${finding.blind} with ${id}, which is not a known defect of its case`);
        if (!done.has(id)) wanted.set(id, false);
      }
      continue;
    }
    const rating = ratings.get(finding.blind);
    if (rating === 'valid') extras.push(finding.id);
    else rejections.push({ finding: finding.id, rating, reason: reasons.get(finding.blind) });
  }
  const pull = (id) => {
    for (const after of byId.get(id).fix_after ?? []) {
      if (!byId.has(after)) fail(`known defect ${id} lists ${after} in fix_after, which is not a known defect`);
      if (done.has(after) || wanted.has(after)) continue;
      wanted.set(after, true);
      pull(after);
    }
  };
  for (const id of [...wanted.keys()]) pull(id);
  const fixes = [];
  const remaining = known.filter((item) => wanted.has(item.id));
  while (remaining.length) {
    const next = remaining.findIndex((item) => (item.fix_after ?? []).every((after) => done.has(after)));
    if (next === -1) fail(`the fix_after lists of ${remaining.map((item) => item.id).join(', ')} form a cycle`);
    const [item] = remaining.splice(next, 1);
    if (typeof item.fix !== 'string' || !item.fix) fail(`known defect ${item.id} has no fix patch`);
    const fix = { known: item.id, patch: item.fix };
    fixes.push(wanted.get(item.id) ? { ...fix, pulled: true } : fix);
    done.add(item.id);
  }
  return { fixes, extras, rejections };
}

// The loop ends after a round that leaves no finding open: the fix step repairs every finding that stands, so a plan
// without fixes and extras means that no finding stands. It also ends at round 5.
export function loopEnds(round, plan) {
  return round >= MAX_LOOP_ROUNDS || (plan.fixes.length === 0 && plan.extras.length === 0);
}

// Sorts findings by the judge's answers: the known defects that they found, the known defects of their `unknown`
// pairs, the count of `unknown` pairs, and the ratings of the findings without a `match` answer.
function judgeFindings(findings, { matched, unsure, ratings }) {
  const result = {
    found: new Set(),
    doubtful: new Set(),
    unknownPairs: 0,
    validExtras: 0,
    wrong: 0,
    unknown: 0,
    unjudged: 0,
  };
  for (const finding of findings) {
    for (const id of unsure.get(finding.blind) ?? []) {
      result.doubtful.add(id);
      result.unknownPairs += 1;
    }
    const hits = matched.get(finding.blind);
    if (hits) {
      for (const id of hits) result.found.add(id);
      continue;
    }
    const rating = ratings.get(finding.blind);
    if (rating === 'valid') result.validExtras += 1;
    else if (rating === 'wrong') result.wrong += 1;
    else if (rating === 'unknown') result.unknown += 1;
    else result.unjudged += 1;
  }
  return result;
}

// A round's time is its slowest reviewer and its tokens are the sum; one reviewer without a value leaves both open.
// `found` lists the known defects that the findings of the round matched.
function scoreRound(round, knownIds, judged, meta) {
  const costs = round.blocks.map((block) => meta?.reviewers?.[block.reviewer]);
  const { found, validExtras } = judgeFindings(round.findings, judged);
  return {
    round: round.round,
    mode: meta?.mode ?? null,
    seconds: costs.every((cost) => typeof cost?.seconds === 'number')
      ? Math.max(...costs.map((cost) => cost.seconds))
      : null,
    tokens: total(costs.map((cost) => cost?.tokens)),
    found: knownIds.filter((id) => found.has(id)),
    validExtras,
    fixerSeconds: typeof meta?.fixer?.seconds === 'number' ? meta.fixer.seconds : 0,
    verdicts: round.blocks.map((block) => ({ reviewer: block.reviewer, verdict: block.verdict })),
    verdict: roundVerdict(round.blocks.map((block) => block.verdict)),
  };
}

// The reasons of one reviewer entry against the configuration of its run.
function configReasons(config, label, entry) {
  if (!Array.isArray(entry?.messages)) return [`${label}: no transcript facts`];
  const reasons = [];
  for (const model of distinct(entry.messages.map((message) => message.model))) {
    if (model !== config.model) reasons.push(`${label}: model ${model}, not ${config.model}`);
  }
  if (entry.effort !== config.effort) reasons.push(`${label}: effort ${entry.effort}, not ${config.effort}`);
  if (config.tier === null || config.tier === undefined) return reasons;
  const ownMessages = entry.messages.filter((message) => message.model === config.model);
  for (const tier of distinct(ownMessages.map((message) => message.servedTier))) {
    if (tier !== config.tier) reasons.push(`${label}: served tier ${tier}, not ${config.tier}`);
  }
  return reasons;
}

// A run proves its configuration with the transcript facts of each reviewer; a run without a configuration has no
// configuration to prove. Every run must show, by the `readScope` of each reviewer entry, that the reviewer read only
// the inputs of the run. Each reviewer is `{ label, entry }`, where entry is its meta.json reviewer entry.
function invalidReasons(config, reviewers) {
  const reasons = [];
  for (const { label, entry } of reviewers) {
    if (config) reasons.push(...configReasons(config, label, entry));
    const outside = entry?.readScope?.outside ?? [];
    if (outside.length) reasons.push(`${label}: read outside its inputs: ${listSome(outside, LISTED_READS)}`);
  }
  return reasons;
}

// The transcript facts of the reviewers of a run, merged for the configuration table.
function runFacts(entries) {
  const proven = entries.filter((entry) => Array.isArray(entry?.messages));
  const messages = proven.flatMap((entry) => entry.messages);
  return {
    models: distinct(messages.map((message) => message.model ?? null)),
    efforts: distinct(proven.map((entry) => entry.effort ?? null)),
    servedTiers: distinct(messages.map((message) => message.servedTier ?? null)),
    sideCallTokens: sum(proven.flatMap((entry) => entry.sideCalls ?? []).map((call) => call.tokens ?? 0)),
  };
}

// A run's time and tokens are the sums over its rounds; its found defects and finding counts cover every round; its
// verdicts are those of its last round. A known defect is unresolved in a run when the run did not find it and the
// judge answered `unknown` for a pair of it with at least one finding of the run. `unknownPairs` counts every
// `unknown` pair answer of the run, also those that cannot change recall, such as a finding that may repeat a known
// defect the run found.
function scoreRun(run, caseEntry, judged, metas) {
  const knownIds = caseEntry.known.map((item) => item.id);
  const metaOf = (round) => metas[run.hasRounds ? `${run.key}/round-${round}` : run.key];
  const config = metas[run.key]?.config ?? metaOf(1)?.config ?? null;
  const rounds = [...run.rounds.values()].sort((a, b) => a.round - b.round);
  const reviewers = rounds.flatMap((round) =>
    round.blocks.map((block) => ({
      label: run.hasRounds ? `round-${round.round}/${block.reviewer}` : block.reviewer,
      entry: metaOf(round.round)?.reviewers?.[block.reviewer],
    })),
  );
  const roundScores = rounds.map((round) => scoreRound(round, knownIds, judged, metaOf(round.round)));
  const all = judgeFindings(
    rounds.flatMap((round) => round.findings),
    judged,
  );
  // A round is caused only by extra findings when the round before it found no known defect that no earlier round of
  // the run had found, and had a valid extra. A repeat of a fixed defect needs no repair, so it causes no round.
  const seen = new Set();
  const newFound = roundScores.map((round) => {
    const fresh = round.found.filter((id) => !seen.has(id));
    for (const id of round.found) seen.add(id);
    return fresh.length;
  });
  const extraOnlyRounds = roundScores.filter(
    (_, index) => index > 0 && newFound[index - 1] === 0 && roundScores[index - 1].validExtras > 0,
  ).length;
  const last = roundScores.at(-1);
  return {
    case: run.case,
    arm: run.arm,
    run: run.run,
    split: caseEntry.split ?? null,
    config,
    invalid: invalidReasons(config, reviewers),
    known: knownIds.length,
    found: knownIds.filter((id) => all.found.has(id)),
    recall: knownIds.length ? all.found.size / knownIds.length : null,
    escaped: knownIds.filter((id) => !all.found.has(id)).length,
    validExtras: all.validExtras,
    wrong: all.wrong,
    unknown: all.unknown,
    unjudged: all.unjudged,
    extraOnlyRounds,
    unresolved: knownIds.filter((id) => all.doubtful.has(id) && !all.found.has(id)).length,
    unknownPairs: all.unknownPairs,
    seconds: total(roundScores.map((round) => round.seconds)),
    tokens: total(roundScores.map((round) => round.tokens)),
    fixerSeconds: sum(roundScores.map((round) => round.fixerSeconds)),
    ...runFacts(reviewers.map((reviewer) => reviewer.entry)),
    verdicts: last.verdicts,
    roundVerdict: last.verdict,
    rounds: roundScores,
  };
}

// metas maps `<case>/<arm>/<run>` to the content of that run's meta.json, and `<case>/<arm>/<run>/round-<r>` to the
// meta.json of a round folder. Summaries leave out invalid runs.
export function scoreRuns({ findings: findingsDoc, pairs: pairsDoc, judgments, metas = {} }) {
  const caseEntries = new Map(pairsDoc.cases.map((entry) => [entry.case, entry]));
  const knownByCase = new Map(pairsDoc.cases.map((entry) => [entry.case, entry.known.map((item) => item.id)]));
  const byBlind = new Map(findingsDoc.findings.map((finding) => [finding.blind, finding]));
  const runs = new Map();
  const roundOf = ({ case: caseId, arm, run, round }) => {
    const key = `${caseId}/${arm}/${run}`;
    if (!runs.has(key)) runs.set(key, { key, case: caseId, arm, run, hasRounds: false, rounds: new Map() });
    const entry = runs.get(key);
    if (round !== undefined) entry.hasRounds = true;
    const number = round ?? 1;
    if (!entry.rounds.has(number)) entry.rounds.set(number, { round: number, blocks: [], findings: [] });
    return entry.rounds.get(number);
  };
  for (const block of findingsDoc.blocks) {
    if (!knownByCase.has(block.case)) fail(`pairs.json has no case ${block.case}; run score.mjs pairs first`);
    roundOf(block).blocks.push(block);
  }
  const judged = readJudgments(judgments, byBlind, knownByCase);
  requireCandidateAnswers(pairsDoc, judged.verdicts);
  for (const finding of findingsDoc.findings) roundOf(finding).findings.push(finding);
  const runScores = [...runs.values()]
    .map((run) => scoreRun(run, caseEntries.get(run.case), judged, metas))
    .sort((a, b) => compare(a.case, b.case) || compare(a.arm, b.arm) || runNumber(a.run) - runNumber(b.run));
  const groups = new Map();
  for (const run of runScores.filter((entry) => entry.invalid.length === 0)) {
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

// mulberry32: a small seeded generator, so that a report gives the same intervals each time.
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = Math.imul(state ^ (state >>> 15), state | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

// The quantile `share` of sorted values, with linear interpolation between the two nearest values.
function quantile(sorted, share) {
  const position = (sorted.length - 1) * share;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

// A paired bootstrap over cases. Each case is `{ value, reference, weight = 1 }`, and the statistic of a set of
// cases is sum(value - reference) / sum(weight). A resample draws as many cases as there are, with replacement.
export function pairedBootstrap(cases, { seed = 1, resamples = 10000, level = 0.9 } = {}) {
  const items = cases.map(({ value, reference, weight = 1 }) => ({ difference: value - reference, weight }));
  const statistic = (sample) => {
    const weight = sum(sample.map((item) => item.weight));
    return weight === 0 ? null : sum(sample.map((item) => item.difference)) / weight;
  };
  const estimate = statistic(items);
  if (estimate === null) return { estimate: null, low: null, high: null, cases: cases.length, resamples };
  const random = seededRandom(seed);
  const statistics = [];
  for (let resample = 0; resample < resamples; resample += 1) {
    let difference = 0;
    let weight = 0;
    for (let draw = 0; draw < items.length; draw += 1) {
      const item = items[Math.floor(random() * items.length)];
      difference += item.difference;
      weight += item.weight;
    }
    if (weight !== 0) statistics.push(difference / weight);
  }
  statistics.sort((a, b) => a - b);
  return {
    estimate,
    low: quantile(statistics, (1 - level) / 2),
    high: quantile(statistics, (1 + level) / 2),
    cases: cases.length,
    resamples,
  };
}

// Compares each answer of a second judge with the same answer of the first judge.
export function judgeAgreement(judgments, second) {
  const verdicts = new Map(
    (judgments.matches ?? []).map((entry) => [`${entry.finding} ${entry.known}`, entry.verdict]),
  );
  const ratings = new Map((judgments.adjudications ?? []).map((entry) => [entry.finding, entry.rating]));
  let answers = 0;
  let agreed = 0;
  for (const entry of second.matches ?? []) {
    const pair = `${entry.finding} ${entry.known}`;
    if (!verdicts.has(pair))
      fail(`judgments-second.json answers ${entry.finding} and ${entry.known}, which judgments.json does not answer`);
    if (!MATCH_VERDICTS.has(entry.verdict)) fail(`judgments-second.json has match verdict ${entry.verdict}`);
    answers += 1;
    if (verdicts.get(pair) === entry.verdict) agreed += 1;
  }
  for (const entry of second.adjudications ?? []) {
    if (!ratings.has(entry.finding))
      fail(`judgments-second.json answers ${entry.finding}, which judgments.json does not answer`);
    if (!RATINGS.has(entry.rating)) fail(`judgments-second.json has rating ${entry.rating}`);
    answers += 1;
    if (ratings.get(entry.finding) === entry.rating) agreed += 1;
  }
  return { answers, agreed, rate: answers ? agreed / answers : null };
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

// The sum of a value over the runs, divided by the runs; null without runs.
const perRun = (runs, value) => (runs.length ? sum(runs.map(value)) / runs.length : null);
const joinValues = (values) =>
  distinct(values.filter((value) => value !== null && value !== undefined))
    .sort(compare)
    .join(', ') || '-';

// `<mode> <count>` in mode-name order. A round without a recorded mode counts as `-`.
function modeCounts(rounds) {
  const counts = new Map();
  for (const { mode } of rounds) counts.set(mode ?? '-', (counts.get(mode ?? '-') ?? 0) + 1);
  return (
    [...counts]
      .sort(([a], [b]) => compare(a, b))
      .map(([mode, count]) => `${mode} ${count}`)
      .join(', ') || '-'
  );
}

// The rows of round `round`, over the runs that reached it.
function roundRows(round) {
  const reached = (runs) => runs.flatMap((run) => run.rounds.filter((entry) => entry.round === round));
  const seconds = (runs) => summarize(reached(runs).map((entry) => entry.seconds));
  return [
    [`Round ${round} seconds median`, (runs) => oneDecimal(seconds(runs).median)],
    [`Round ${round} seconds min`, (runs) => oneDecimal(seconds(runs).min)],
    [`Round ${round} seconds max`, (runs) => oneDecimal(seconds(runs).max)],
    [`Round ${round} modes`, (runs) => modeCounts(reached(runs))],
    [`Round ${round} known found per run`, (runs) => ratio(perRun(reached(runs), (entry) => entry.found.length))],
  ];
}

const PER_RUN_ROWS = [
  ['Known found per run', (run) => run.found.length],
  ['Escaped per run', (run) => run.escaped],
  ['Valid extras per run', (run) => run.validExtras],
  ['Extra-only rounds per run', (run) => run.extraOnlyRounds],
  ['Wrong per run', (run) => run.wrong],
  ['Unjudged per run', (run) => run.unjudged],
  ['Unknown ratings per run', (run) => run.unknown],
  ['Unknown pairs per run', (run) => run.unknownPairs],
];

// The known defects that the runs found, divided by their loop minutes.
function foundPerMinute(runs) {
  const seconds = total(runs.map((run) => run.seconds));
  return seconds ? sum(runs.map((run) => run.found.length)) / (seconds / 60) : null;
}

// Each interval row: the measure, the value of a run, the weight of a case from its known defects, and the format.
const INTERVAL_ROWS = [
  ['Round 1 recall', (run) => run.rounds[0].found.length, (known) => known, ratio],
  ['Escaped per 50 known', (run) => run.escaped, (known) => known / 50, ratio],
  ['Loop seconds', (run) => run.seconds, () => 1, oneDecimal],
];

// The cases that both lists of runs ran, in case order. The value of a case is the mean over its runs.
function pairedCases(runs, referenceRuns, value, weight) {
  const meanByCase = (list) => {
    const values = new Map();
    for (const run of list) {
      if (!values.has(run.case)) values.set(run.case, { known: run.known, values: [] });
      values.get(run.case).values.push(value(run));
    }
    return new Map([...values].map(([caseId, entry]) => [caseId, { ...entry, mean: summarize(entry.values).mean }]));
  };
  const own = meanByCase(runs);
  const reference = meanByCase(referenceRuns);
  return [...own.keys()]
    .filter((caseId) => reference.has(caseId))
    .sort(compare)
    .map((caseId) => ({
      case: caseId,
      value: own.get(caseId).mean,
      reference: reference.get(caseId).mean,
      weight: weight(own.get(caseId).known),
    }))
    .filter((entry) => entry.value !== null && entry.reference !== null);
}

function intervalRows(reference, runsOf) {
  const referenceRuns = runsOf(reference);
  return INTERVAL_ROWS.map(([measure, value, weight, format]) => [
    `${measure} difference from ${reference}, 90% interval`,
    (runs, name) => {
      if (name === reference) return '-';
      const { low, high } = pairedBootstrap(pairedCases(runs, referenceRuns, value, weight), { level: 0.9 });
      return low === null ? '-' : `[${format(low)}, ${format(high)}]`;
    },
  ]);
}

// The default reference: of the columns with runs, the one with the fewest escaped defects per run; the first on a tie.
function fewestEscaped(columns, runsOf) {
  let best = null;
  let bestEscaped = Infinity;
  for (const name of columns) {
    const escaped = perRun(runsOf(name), (run) => run.escaped);
    if (escaped !== null && escaped < bestEscaped) [best, bestEscaped] = [name, escaped];
  }
  return best;
}

// One column per configuration name; a column holds the runs of that configuration in the case group.
function configurationTable(groupRuns, columns, reference) {
  const runsOf = (name) => groupRuns.filter((run) => run.config.name === name);
  const base = reference ?? fewestEscaped(columns, runsOf);
  const lastRound = Math.max(0, ...columns.flatMap((name) => runsOf(name).map((run) => run.rounds.length)));
  const rounds = (runs) => summarize(runs.map((run) => run.rounds.length));
  const median = (runs, field) => summarize(runs.map((run) => run[field])).median;
  const rows = [
    ['Runs', (runs) => runs.length],
    ...Array.from({ length: lastRound }, (_, index) => roundRows(index + 1)).flat(),
    ['Rounds median', (runs) => oneDecimal(rounds(runs).median)],
    ['Rounds max', (runs) => whole(rounds(runs).max)],
    ['Loop seconds median', (runs) => oneDecimal(median(runs, 'seconds'))],
    ...PER_RUN_ROWS.map(([label, value]) => [label, (runs) => ratio(perRun(runs, value))]),
    ['Tokens median', (runs) => whole(median(runs, 'tokens'))],
    ['Side-call tokens median', (runs) => whole(median(runs, 'sideCallTokens'))],
    ['Fixer seconds median', (runs) => oneDecimal(median(runs, 'fixerSeconds'))],
    ['Model', (runs) => joinValues(runs.flatMap((run) => run.models))],
    ['Effort', (runs) => joinValues(runs.flatMap((run) => run.efforts))],
    ['Served tier', (runs) => joinValues(runs.flatMap((run) => run.servedTiers))],
    ['Known found per loop minute', (runs) => ratio(foundPerMinute(runs))],
    ...(base === null ? [] : intervalRows(base, runsOf)),
  ];
  return [
    row(['Measure', ...columns]),
    `|${['---', ...columns.map(() => '---:')].join('|')}|`,
    ...rows.map(([label, cell]) => row([label, ...columns.map((name) => cell(runsOf(name), name))])),
  ];
}

// One table per case group, in name order, from the valid runs that have a configuration. The columns are
// `configs`, or the configuration names in run order.
function configurationSections(runs, { configs, reference }) {
  const configured = runs.filter((run) => run.config);
  const columns = configs ?? distinct(configured.map((run) => run.config.name));
  const groups = new Map();
  for (const run of configured.filter((entry) => entry.invalid.length === 0)) {
    const group = run.split ?? '-';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(run);
  }
  return [...groups.keys()]
    .sort(compare)
    .flatMap((group) => [
      `## Configurations: ${group}`,
      '',
      ...configurationTable(groups.get(group), columns, reference),
      '',
    ]);
}

// The report holds numbers, verdicts, configuration names, and known-defect ids only, so a held-out reader learns
// no defect text.
export function renderReport({ summaries, runs, agreement }, { configs, reference } = {}) {
  const invalid = runs.filter((run) => run.invalid.length > 0);
  return [
    '# Review benchmark report',
    '',
    'Recall is the number of known defects that at least one reviewer of a run found, divided by the known defects of the case.',
    'Unresolved is the number of known defects that a run did not find, where the judge answered unknown for a pair of the defect with a finding of the run.',
    'Unknown pairs is the number of unknown answers for pairs of a finding of the run and a known defect. Unresolved counts the known defects of those answers that can change recall.',
    'Seconds is the slowest reviewer of a round, added over the rounds of a run. Tokens is the sum over the reviewers and rounds of a run. A dash means no value.',
    'The Runs table lists every run. The summary and the configuration tables leave out invalid runs: runs whose transcripts show another model, effort, or served tier than their configuration, or a reviewer that read a file outside the inputs of its run.',
    'A configuration table has one column per configuration in one case group. A round row covers the runs that reached that round. Extra-only rounds are rounds whose previous round found no known defect that an earlier round of the run had not found, and had a valid extra finding. Fixer seconds is the time of the fix steps of a loop, apart from the loop seconds. An interval row gives the 90% paired bootstrap interval of the difference from the reference column, over the cases that both columns ran.',
    '',
    '## Summary',
    '',
    ...table(SUMMARY_COLUMNS, summaries),
    '',
    '## Runs',
    '',
    ...table(RUN_COLUMNS, runs),
    '',
    ...(invalid.length === 0
      ? []
      : [
          '## Invalid runs',
          '',
          ...invalid.map((run) => `- ${run.case}/${run.arm}/${run.run}: ${run.invalid.join('; ')}`),
          '',
        ]),
    ...configurationSections(runs, { configs, reference }),
    ...(agreement
      ? [
          '## Judge agreement',
          '',
          `The second judge agreed with ${agreement.agreed} of ${agreement.answers} answers (${ratio(agreement.rate)}).`,
          '',
        ]
      : []),
  ].join('\n');
}

// The omp task name of a dispatch, for example `Code96C3R2SpecAndTests`; its transcript is `<name>.jsonl`. A
// dispatch of a round folder has `K<round>` after the run part, for example `Code7C1LowR1K2Delta`.
export function dispatchName(caseId, arm, run, reviewer, round) {
  const pascal = (value) =>
    String(value)
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join('');
  const roundPart = round === undefined ? '' : `K${round}`;
  return `${pascal(caseId)}${pascal(arm)}R${runNumber(run)}${roundPart}${pascal(reviewer)}`;
}

// Adds the dispatch name to each `{ caseId, arm, run, round, reviewer }` entry. The name drops separators and case,
// so for example `code-7` and `code_7` give one name; two reviewers with one name would share one transcript.
export function dispatchNames(dispatches) {
  const owners = new Map();
  return dispatches.map((dispatch) => {
    const { caseId, arm, run, round, reviewer } = dispatch;
    const name = dispatchName(caseId, arm, run, reviewer, round);
    const owner = `${caseId}/${arm}/${runPath(run, round)}/${reviewer}`;
    if (owners.has(name) && owners.get(name) !== owner)
      fail(`dispatch name collision: ${owners.get(name)} and ${owner} both give ${name}; rename a case or an arm`);
    owners.set(name, owner);
    return { ...dispatch, name };
  });
}

// `prepare.mjs loop` writes the prompt of the fixer agent of a loop round to `<round folder>/fixer/fixer-1.txt`. A
// round has one fixer, which repairs every valid extra finding of the round, as the manager of a production round
// does. The prompt names `fixer-1.patch` in the same folder as its output.
export const FIXER_DIR = 'fixer';
export const FIXER_NAME = 'fixer-1';

// `prepare.mjs loop` writes the reviewed tree of each loop round after round 1 to `<ws>/trees/<run label>/` for the
// judge. The run label is the blind label of pairs.json, so the judge opens no arm folder.
export const JUDGE_TREES = 'trees';

// Every reviewer that has a prompt and every fixer prompt, in workspace order, with its dispatch name and its prompt
// file. Each round folder is a dispatch of its own; a fixer entry has `fixer: true`, and a round has at most one.
function promptedDispatches(ws) {
  return dispatchNames(
    readWorkspace(ws).flatMap(({ caseId, arm, run, round, dir, reviewers, prompts }) => {
      const dispatch = (folder, reviewer) => ({
        caseId,
        arm,
        run,
        round,
        dir,
        reviewer,
        fixer: folder === FIXER_DIR,
        prompt: path.join(dir, folder, `${reviewer}.txt`),
      });
      const fixer = fs.existsSync(path.join(dir, FIXER_DIR, `${FIXER_NAME}.txt`));
      return [
        ...reviewers.filter((reviewer) => prompts.has(reviewer)).map((reviewer) => dispatch('prompts', reviewer)),
        ...(fixer ? [dispatch(FIXER_DIR, FIXER_NAME)] : []),
      ];
    }),
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

function transcriptEntries(text, source) {
  const entries = [];
  for (const [index, line] of text.split('\n').entries()) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      fail(`${source} line ${index + 1} is not JSON`);
    }
  }
  return entries;
}
const usageTokens = (usage) => TOKEN_FIELDS.reduce((result, field) => result + (usage?.[field] ?? 0), 0);
// `<provider>/<model>`, `<model>` without a provider, and null without a model.
const modelId = ({ provider, model } = {}) => (model ? (provider ? `${provider}/${model}` : model) : null);

// Seconds run from the first user message to the last assistant message. Tokens add uncached input, cache reads,
// cache writes, and output over the assistant messages. With `model`, only the assistant messages of that model
// count, so the messages of a fallback model stay out; with no message of `model`, seconds are null and tokens 0.
// `model_usage` side calls never count.
export function parseTranscript(text, source = 'transcript', model) {
  let first;
  let last;
  let lastOfModel;
  let tokens = 0;
  for (const entry of transcriptEntries(text, source)) {
    if (entry.type !== 'message') continue;
    const time = Date.parse(entry.timestamp);
    if (entry.message?.role === 'user' && first === undefined) first = time;
    if (entry.message?.role !== 'assistant') continue;
    last = time;
    if (model !== undefined && model !== null && modelId(entry.message) !== model) continue;
    lastOfModel = time;
    tokens += usageTokens(entry.message.usage);
  }
  if (!Number.isFinite(first) || !Number.isFinite(last))
    fail(`${source} has no timestamped user message and assistant message`);
  if (lastOfModel === undefined) return { seconds: null, tokens: 0 };
  return { seconds: Math.round((lastOfModel - first) / 100) / 10, tokens };
}

// The tool calls of an assistant message: the name and the `path` argument (null without one) of each.
const toolCallsOf = (message) =>
  (Array.isArray(message.content) ? message.content : [])
    .filter((item) => item?.type === 'toolCall')
    .map((item) => ({
      name: item.name ?? null,
      path: typeof item.arguments?.path === 'string' ? item.arguments.path : null,
    }));

// The configuration that a transcript shows: the last requested effort and OpenAI tier, the model and the served
// tier of each assistant message, and the `model_usage` side calls of helper models. When the assistant messages
// call tools, `toolCalls` lists the calls in order; a transcript without a tool call gives no `toolCalls`.
export function transcriptFacts(text, source = 'transcript') {
  const facts = { effort: null, requestedTier: null, messages: [], sideCalls: [] };
  const toolCalls = [];
  for (const entry of transcriptEntries(text, source)) {
    if (entry.type === 'thinking_level_change') facts.effort = entry.thinkingLevel ?? null;
    else if (entry.type === 'service_tier_change') facts.requestedTier = entry.serviceTier?.openai ?? null;
    else if (entry.type === 'model_usage')
      facts.sideCalls.push({ model: modelId(entry), purpose: entry.purpose ?? null, tokens: usageTokens(entry.usage) });
    else if (entry.type === 'message' && entry.message?.role === 'assistant') {
      facts.messages.push({ model: modelId(entry.message), servedTier: entry.message.serviceTier ?? null });
      toolCalls.push(...toolCallsOf(entry.message));
    }
  }
  return toolCalls.length ? { ...facts, toolCalls } : facts;
}

// The working directory of the session of a transcript and the plugin roots that the agent text of the session
// names. omp records the agent text in the system prompt (a string or a list of strings) of the `session_init` entry.
function transcriptSession(text, source) {
  let cwd = null;
  const pluginRoots = new Set();
  for (const entry of transcriptEntries(text, source)) {
    if (entry.type === 'session' && cwd === null && typeof entry.cwd === 'string') cwd = entry.cwd;
    if (entry.type !== 'session_init') continue;
    const prompt = [entry.systemPrompt]
      .flat()
      .filter((part) => typeof part === 'string')
      .join('\n');
    for (const match of prompt.matchAll(REVIEWER_SKILL)) pluginRoots.add(match[1]);
  }
  return { cwd, pluginRoots: [...pluginRoots] };
}

// The folder itself or a path below it.
function isUnder(folder, target) {
  const relative = path.relative(folder, target);
  return relative === '' || !(relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
}

// The input folders of a run, the folders that a reviewer may read with every path below them, and the plugin roots.
// An input folder is the case folder, and the run folder or each round folder up to `round`. The tree copies are those
// of the rounds up to `round`.
function scopeRules(runDir, round, pluginRoots) {
  const armDir = path.dirname(runDir);
  const caseDir = path.dirname(armDir);
  const [caseId, arm, run] = [caseDir, armDir, runDir].map((dir) => path.basename(dir));
  const rounds = Array.from({ length: round ?? 0 }, (_, index) => index + 1);
  const roundDirs = round === undefined ? [runDir] : rounds.map((number) => path.join(runDir, `round-${number}`));
  const inputDirs = [caseDir, ...roundDirs];
  const trees = rounds.map((number) =>
    path.join(path.dirname(caseDir), JUDGE_TREES, runLabel(caseId, arm, runPath(run, number))),
  );
  return {
    inputDirs,
    folders: [...inputDirs.flatMap((dir) => INPUT_FOLDERS.map((name) => path.join(dir, name))), ...trees],
    pluginRoots,
  };
}

// A path under an allowed folder, or under the code-reviewer or plan-reviewer skill folder of a plugin root, directly
// in `skills/` or in a category folder of it.
function folderAllowed(target, { folders, pluginRoots }) {
  if (folders.some((folder) => isUnder(folder, target))) return true;
  return pluginRoots.some((root) => {
    const skills = path.join(root, 'skills');
    if (!isUnder(skills, target)) return false;
    const [first, second] = path.relative(skills, target).split(path.sep);
    return REVIEWER_SKILLS.has(first) || REVIEWER_SKILLS.has(second);
  });
}

// An input file of an input folder, or a reviewer agent file of a plugin root.
function fileAllowed(target, { inputDirs, pluginRoots }) {
  const dir = path.dirname(target);
  const name = path.basename(target);
  if (inputDirs.includes(dir) && (INPUT_FILES.has(name) || name.endsWith('.diff'))) return true;
  return name.endsWith('-reviewer.md') && pluginRoots.some((root) => path.join(root, 'agents') === dir);
}

// A relative path resolves against the working directory, so without one it is outside. A glob is allowed when the
// folder before its first glob segment is allowed and no later segment can leave that folder with `..`.
function localPathAllowed(target, cwd, rules) {
  if (!path.isAbsolute(target) && typeof cwd !== 'string') return false;
  const segments = target.split('/');
  const globAt = segments.findIndex((segment) => GLOB_CHARACTER.test(segment));
  if (globAt === -1) {
    const resolved = path.resolve(cwd ?? path.sep, target);
    return folderAllowed(resolved, rules) || fileAllowed(resolved, rules);
  }
  if (segments.slice(globAt).some((segment) => segment.includes('..'))) return false;
  const base = segments.slice(0, globAt).join('/') || (path.isAbsolute(target) ? path.sep : '.');
  return folderAllowed(path.resolve(cwd ?? path.sep, base), rules);
}

// A web page outside the benchmark repository. The pages of the repository can show the fixes of the corpus defects.
function webPageAllowed(target) {
  let url;
  try {
    url = new URL(target);
  } catch {
    return false;
  }
  const parts = url.pathname
    .split('/')
    .filter(Boolean)
    .map((part) => part.toLowerCase());
  const benchmark = ([owner, name]) => owner === BENCHMARK_REPOSITORY.owner && BENCHMARK_REPOSITORY.names.has(name);
  if (REPOSITORY_HOSTS.has(url.hostname)) return !benchmark(parts);
  return !(url.hostname === 'api.github.com' && parts[0] === 'repos' && benchmark(parts.slice(1)));
}

const uriScheme = (target) => URI_SCHEME.exec(target)?.[1].toLowerCase();

function targetAllowed(target, cwd, rules) {
  const scheme = uriScheme(target);
  if (scheme === undefined) return localPathAllowed(target, cwd, rules);
  if (scheme === 'artifact') return true;
  if (scheme === 'skill') return ALLOWED_SKILLS.has(target.slice(target.indexOf('://') + 3).split('/')[0]);
  return WEB_SCHEMES.has(scheme) && webPageAllowed(target);
}

// The targets of a `path` argument: its `;`-separated parts, trimmed. A local path or an internal URI drops its read
// selector; a web URL stays as it is.
function pathTargets(value) {
  return value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (WEB_SCHEMES.has(uriScheme(part)) ? part : part.replace(READ_SELECTOR, '')));
}

// The reviewers run in the live checkout, which holds the fixes of the corpus defects, so a reviewer that reads a
// file outside the inputs of its run can see a fix. readScope gives the targets of the tool calls that are outside,
// each once, as the reviewer wrote them without the read selector, in call order. `runDir` is
// `<ws>/<case>/<arm folder>/run-<k>`; `round` is the number of a round folder, or undefined for a run without round
// folders; `cwd` is the working directory of the session (null when unknown); `pluginRoots` are the plugin roots that
// the agent text names. The function reads no file. A target is allowed when it is:
// - under an input of the run: `snapshot/`, `prompts/`, a `*.diff` file, `plan.md`, `previous-review.md`, or
//   `rejection.md` in the case folder, and in the run folder or in each round folder up to `round`;
// - under the tree copy of the judge for a round of the run up to `round`;
// - an instruction file of the reviewer: `<root>/agents/<name>-reviewer.md`, or a path under the code-reviewer or
//   plan-reviewer skill folder of a plugin root;
// - a `skill://` URI of the code-review, code-clarity, code-reviewer, or plan-reviewer skill, or an `artifact://` URI
//   (the spilled output of the reviewer);
// - an http or https URL that is not a page of the benchmark repository.
// Every other target is outside. A grep, glob, or find call without a path searches the working directory, so it gives
// the outside target `<name> without a path`; other calls without a path read no file.
export function readScope(toolCalls, { runDir, round, cwd = null, pluginRoots = [] }) {
  const rules = scopeRules(path.resolve(runDir), round, pluginRoots);
  const outside = new Set();
  for (const { name, path: value } of toolCalls) {
    if (typeof value !== 'string' || !value.trim()) {
      if (SEARCH_TOOLS.has(name)) outside.add(`${name} without a path`);
      continue;
    }
    for (const target of pathTargets(value)) {
      if (!targetAllowed(target, cwd, rules)) outside.add(target);
    }
  }
  return { outside: [...outside] };
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

export function pairsCommand(ws, casesDir, { keys } = {}) {
  const findingsDoc = readJson(path.join(ws, 'findings.json'), '; run score.mjs findings first');
  const cases = {};
  for (const caseId of new Set(findingsDoc.blocks.map((block) => block.case))) {
    const { split } = readJson(path.join(ws, caseId, 'case.json'));
    const { kind, known } = readKnown(casesDir, caseId, split, keys);
    cases[caseId] = { kind, known, split };
  }
  const doc = buildPairs(findingsDoc, cases);
  writeJson(path.join(ws, 'pairs.json'), doc);
  return doc;
}

// A key that changed after `pairs` would score the runs against an old list of known defects.
function requireCurrentKeys(pairsDoc, keys) {
  const ids = (known) =>
    known
      .map((item) => item.id)
      .sort(compare)
      .join(', ') || 'none';
  for (const entry of pairsDoc.cases) {
    const key = readKey(keys, entry.case);
    if (key === undefined || ids(key) === ids(entry.known)) continue;
    fail(
      `pairs.json is out of date for ${entry.case}: its key has ${ids(key)}, but pairs.json has ${ids(entry.known)}; run score.mjs pairs again`,
    );
  }
}

// The meta.json of each run, and of each round folder of a run with round folders, by the keys that scoreRuns reads.
function readMetas(ws, blocks) {
  const metas = {};
  const read = (key) => {
    const file = path.join(ws, ...key.split('/'), 'meta.json');
    if (!(key in metas) && fs.existsSync(file)) metas[key] = readJson(file);
  };
  for (const block of blocks) {
    read(`${block.case}/${block.arm}/${block.run}`);
    if (block.round !== undefined) read(`${block.case}/${block.arm}/${runPath(block.run, block.round)}`);
  }
  return metas;
}

// Writes report.md. It stops before it writes when a key under `keys` changed after `pairs`, or when a finding has
// neither a `match` answer nor an adjudication. `<ws>/judgments-second.json`, when it exists, gives the agreement.
export function reportCommand(ws, { keys, configs } = {}) {
  const findings = readJson(path.join(ws, 'findings.json'), '; run score.mjs findings first');
  const pairs = readJson(path.join(ws, 'pairs.json'), '; run score.mjs pairs first');
  const judgments = readJson(path.join(ws, 'judgments.json'), '; the judge writes it');
  if (keys) requireCurrentKeys(pairs, keys);
  const scores = scoreRuns({ findings, pairs, judgments, metas: readMetas(ws, findings.blocks) });
  requireJudgedFindings(findings.findings, judgments);
  const secondFile = path.join(ws, 'judgments-second.json');
  if (fs.existsSync(secondFile)) scores.agreement = judgeAgreement(judgments, readJson(secondFile));
  fs.writeFileSync(path.join(ws, 'report.md'), renderReport(scores, { configs }));
  return scores;
}

export function namesCommand(ws) {
  return promptedDispatches(ws).map(({ prompt, name }) => ({ prompt: path.relative(ws, prompt), name }));
}

// Fills the meta.json of each run or round folder from the transcripts of its dispatches and keeps every other field.
// A reviewer entry under `reviewers` gets the time and tokens of the assistant messages of the configured model
// (`config.model`; every model without a configuration) and the transcript facts. When the reviewer called tools, it
// also gets `readScope: { outside }` (see readScope) for the working directory and the plugin roots that its transcript
// shows. The fixer entry of a round, under `fixer.agents`, gets the time and tokens of every assistant message and the
// transcript facts. A round has one fixer, so `fixer.seconds` and `fixer.tokens` are its time and tokens.
// meta.json keeps no tool calls. The command checks every dispatch name before it writes, writes what it finds, then
// fails with the names of the dispatches that have no transcript.
export function transcriptsCommand(ws, sessionsDir) {
  const files = transcriptFiles(sessionsDir);
  const byDir = new Map();
  for (const dispatch of promptedDispatches(ws)) {
    if (!byDir.has(dispatch.dir)) byDir.set(dispatch.dir, []);
    byDir.get(dispatch.dir).push(dispatch);
  }
  const updated = [];
  const missing = [];
  for (const [dir, dispatches] of byDir) {
    const metaFile = path.join(dir, 'meta.json');
    const meta = fs.existsSync(metaFile) ? readJson(metaFile) : {};
    let changed = false;
    for (const { caseId, arm, run, round, reviewer, name, fixer } of dispatches) {
      const file = pickTranscript(files, name);
      if (!file) {
        missing.push(name);
        continue;
      }
      const text = fs.readFileSync(file, 'utf8');
      const { toolCalls, ...facts } = transcriptFacts(text, file);
      if (fixer) {
        const agent = { ...parseTranscript(text, file), ...facts };
        meta.fixer = { ...meta.fixer, seconds: agent.seconds, tokens: agent.tokens, agents: { [reviewer]: agent } };
      } else {
        meta.reviewers ??= {};
        const entry = { ...meta.reviewers[reviewer], ...parseTranscript(text, file, meta.config?.model), ...facts };
        // The read scope comes from this transcript only: a transcript without tool calls read no file.
        delete entry.readScope;
        if (toolCalls) {
          const runDir = path.join(ws, caseId, arm, run);
          entry.readScope = readScope(toolCalls, { runDir, round, ...transcriptSession(text, file) });
        }
        meta.reviewers[reviewer] = entry;
      }
      updated.push(name);
      changed = true;
    }
    if (changed) writeJson(metaFile, meta);
  }
  if (missing.length) fail(`no transcript under ${sessionsDir} for: ${missing.join(', ')}`);
  return updated;
}

function parseOptions(args, { required = [], optional = [] }) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const [flag, value] = [args[index], args[index + 1]];
    const known = required.includes(flag) || optional.includes(flag);
    if (!known || value === undefined || value.startsWith('--')) fail(USAGE);
    options[flag] = value;
  }
  for (const flag of required) if (!options[flag]) fail(USAGE);
  return options;
}

const COMMANDS = {
  findings: {
    run: (ws) => {
      const { blocks, findings } = findingsCommand(ws);
      const missing = blocks.filter((block) => block.verdict === 'missing').length;
      const unreadable = blocks.filter((block) => block.verdict === 'unreadable').length;
      return `findings.json: ${findings.length} findings in ${blocks.length} blocks (${missing} missing, ${unreadable} unreadable)`;
    },
  },
  pairs: {
    required: ['--cases'],
    optional: ['--keys'],
    run: (ws, options) => {
      const { cases } = pairsCommand(ws, options['--cases'], { keys: options['--keys'] });
      const count = cases.reduce(
        (result, entry) => result + entry.runs.reduce((runTotal, run) => runTotal + run.pairs.length, 0),
        0,
      );
      return `pairs.json: ${count} candidate pairs in ${cases.length} cases`;
    },
  },
  report: {
    optional: ['--keys', '--configs'],
    run: (ws, options) => {
      const configs = options['--configs']
        ?.split(',')
        .map((name) => name.trim())
        .filter(Boolean);
      return `report.md: ${reportCommand(ws, { keys: options['--keys'], configs }).runs.length} runs`;
    },
  },
  transcripts: {
    required: ['--omp-sessions'],
    run: (ws, options) => `meta.json: ${transcriptsCommand(ws, options['--omp-sessions']).length} reviewers updated`,
  },
  names: {
    run: (ws) =>
      namesCommand(ws)
        .map(({ prompt, name }) => `${prompt}\t${name}`)
        .join('\n'),
  },
};

export function main([command, ws, ...args]) {
  if (!Object.hasOwn(COMMANDS, command) || !ws) fail(USAGE);
  const { run, ...flags } = COMMANDS[command];
  return run(path.resolve(ws), parseOptions(args, flags));
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
