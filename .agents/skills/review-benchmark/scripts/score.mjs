#!/usr/bin/env node
// Scores review benchmark runs. `findings` parses the returned review blocks and removes the judge answers of each
// finding whose text changed or that is gone, `pairs` builds the judge input, `report` turns the judgments and the run
// metadata into recall, cost, configuration or arm tables, and the self-review lead, `transcripts` fills the run
// metadata, the read scope, and the read coverage of each reviewer from omp subagent transcripts, and `names` prints
// the dispatch name of every prompt that the operator still dispatches (a fixer prompt only until its patch exists).
// `loadJudgments`, `fixPlan`, and `loopEnds` give the judge's answers and the fix step of a review loop to
// `prepare.mjs loop`.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  parsePlan,
  parseReviewComment,
} from '../../../../plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs';

const USAGE =
  'usage: score.mjs findings <ws> | pairs <ws> --cases <cases-dir> [--keys <keys-dir>] | report <ws> [--keys <keys-dir>] [--configs <name,...> | --arms <folder,...> [--reference <folder>]] [--lead <folder,...> --lead-ref <folder>] | transcripts <ws> --omp-sessions <dir> | names <ws>';
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
// The verdicts of a block that holds a review. A block without one of them (`missing`, `unreadable`, or `blocked`)
// holds no review, so its run is invalid (see invalidReasons).
const REVIEW_VERDICTS = new Set(['pass', 'repair', 'fixes-required']);
const TOKEN_FIELDS = ['input', 'cacheRead', 'cacheWrite', 'output'];
// Read scope (see readScope). In each input folder of a run, a reviewer may read these folders and files and the
// `*.diff` files.
const INPUT_FOLDERS = ['snapshot', 'prompts'];
const INPUT_FILES = new Set(['plan.md', 'previous-review.md', 'rejection.md']);
// The copy of the plan contract in the run folder of a variant with a contract overlay (`prepare.mjs case`). The prompt
// of the run names it as the plan contract, so it is an input of that run and of no other run.
export const CONTRACT_COPY = 'plan-contract.md';
// The own skill folder of a reviewer of a plugin root has one of these names.
const REVIEWER_SKILLS = new Set(['code-reviewer', 'plan-reviewer']);
// A reviewer may read these skills through a `skill://` URI or in an installed plugin cache copy. Both resolve to the
// installed version of the skill. For a reviewer skill, that version can be another version than the one of the arm,
// so the reviewer skills are not in the list. The self-review agent loads these skills as its own instructions.
const ALLOWED_SKILLS = new Set(['code-review', 'code-clarity']);
// The plan contract of a plugin root, as a path relative to its `skills/` folder, with its path from the skill folder
// name on. The plan-reviewer checklist tells the reviewer to read this contract in its own plugin.
const PLAN_CONTRACT = /^(?:[^/]+\/)?(plan-manager\/references\/plan-contract\.md)$/;
// The folder of an allowed skill, or a path below it, in an installed plugin cache copy, with its path from the skill
// folder name on. A `skill://` URI of an allowed skill can resolve to this copy.
const CACHE_SKILL = new RegExp(
  `/plugins/cache/plugins/[^/]+/skills/(?:[^/]+/)??((?:${[...ALLOWED_SKILLS].join('|')})(?:/.*)?)$`,
);
// The lines of a diff header that name a changed path: `diff --git a/<path> b/<path>` and `+++ b/<path>`.
const DIFF_GIT = 'diff --git ';
const DIFF_NEW = '+++ b/';
const CHANGED_FILES_HINT = '; the read scope compares the reads of the reviewer with the files that the case changes';
// These tools search the working directory when a call names no path (see the omp tool docs `omp://tools/<tool>.md`).
const SEARCH_TOOLS = new Set(['grep', 'glob', 'find', 'ast_grep']);
// The `path` of these tools takes a `;`-separated list of paths, so each part is a target of its own, and a relative
// part resolves against the working directory. The path of every other tool, for example `read` and `find`, is one
// target, which can hold a `;`.
const PATH_LIST_TOOLS = new Set(['grep', 'glob', 'ast_grep']);
// When no file or folder has a path, omp can read the path as a list of paths (omp://tools/read.md, Flow step 7; the
// recovery of a delimited path list in packages/coding-agent/src/tools/path-utils.ts of omp 18.12). It splits the path
// between delimiters outside `{}` and not after a backslash, and takes the first of these splits that it can: on `;`;
// on `,` when some part exists; on white space when each part exists; on all three delimiters when each part exists.
// A part exists when the folder before its first glob segment exists, or when the part is an internal URI. An http,
// https, or internal URI is a list only on `;`, and only when each part is a URI. See readLists.
const LIST_SPLITS = [
  { delimiter: /;/, existing: 'none' },
  { delimiter: /,/, existing: 'some' },
  { delimiter: /\s/, existing: 'all' },
  { delimiter: /[;,\s]/, existing: 'all' },
];
const ANY_DELIMITER = /[;,\s]/;
const URI_DELIMITER = /;/;
// The note of a list read for each path that omp could not read: `Could not read <path>: <reason>`.
const UNREAD_NOTE = 'Could not read ';
// A web search has a `query`, not a path. A query that targets the benchmark repository can find its pages. Outside
// its `-site:` tokens (exclusions), a query targets it when it names the repository, or when it names the owner
// without a repository and no exclusion removes the repository or its owner: the owner alone or the owner and the
// word `docks` can find its pages. The URLs that the result of a search cites show the pages that the reviewer saw
// (see webPageAllowed).
const WEB_SEARCH_TOOL = 'web_search';
const SITE_EXCLUSION = /(?:^|\s)-site:(\S+)/gi;
const OWNER_MENTION = /docksdocks(?:\/([\w.-]+))?/gi;
const RESULT_URL = /https?:\/\/[^\s<>()[\]{}"'`]+/g;
// The JSON query selector of an omp read of a local file (`omp://tools/read.md`), for example `config.json?q=.suites`.
const JSON_QUERY_SELECTOR = /\?q=.*$/s;
const URI_SCHEME = /^([a-z][a-z0-9+.-]*):\/\//i;
const WEB_SCHEMES = new Set(['http', 'https']);
// The selector of a read at the end of a path, for example `:1-260` or `:23-54:raw`. It can also take a tail that omp
// does not read as a selector, so a list decides on the path with its selectors (see readLists).
const READ_SELECTOR = /(?::[^:/]*)+$/;
// A read selector as omp parses it (omp://tools/read.md, Selector grammar): `:raw`, `:img`, `:conflicts`, or line
// ranges (`:N`, `:LN`, `:N-`, `:N..`, `:A-B`, `:A..B`, `:A+C`, `:-N`, and comma lists of these, with or without a
// colon after each comma), alone or with `:raw` before or after them.
const LINE_RANGE = String.raw`(?:L?\d+(?:(?:-|\.\.)(?:L?\d+)?|\+L?\d+)?|-\d+)`;
const LINE_RANGES = `${LINE_RANGE}(?:,:?${LINE_RANGE})*`;
const OMP_SELECTOR = new RegExp(`:(?:raw|img|conflicts|${LINE_RANGES}(?::raw)?|raw:${LINE_RANGES})$`, 'i');
// A part of a line selector of omp without its `L` prefixes: `-N` (group 1), `A+C` (groups 2 and 3), `A-B` or `A..B`
// (groups 4 and 5), `A-` or `A..` (group 4 only), and `A` (group 6).
const LINE_PART = /^(?:-(\d+)|(\d+)\+(\d+)|(\d+)(?:-|\.\.)(\d+)?|(\d+))$/;
// The rows of the text of a list read result that end the output of a path (see listResultLines): the footer row
// that omp writes under an output that it cut, and the note row of a path that it could not read. The footer
// `[Showing lines A-B of N. ...]` gives the shown range A to B of a file of N lines (groups 1 to 3), and its clause
// `Some lines truncated to M chars` gives the column limit M (group 1).
const OUTPUT_END = /^\[(?:Showing |Some lines truncated to |Could not read ).*\]$/;
const RANGE_FOOTER = /^\[Showing lines (\d+)-(\d+) of (\d+)\b/;
const COLUMN_FOOTER = /Some lines truncated to (\d+) chars\b/;
// The own diff of a reviewer (see ownDiffFile) comes from its name. A self-review lens has the name of its lens after
// this prefix (see prepare.mjs ARMS).
const PANEL_LENSES = new Set(['correctness', 'spec-and-tests', 'text-and-safety']);
const SELF_REVIEW = 'self-review';
const GLOB_CHARACTER = /[*?[{]/;
// Hosts whose paths start with the owner and the name of a repository.
const GITHUB_WEB_HOSTS = new Set(['github.com', 'www.github.com']);
const REPOSITORY_HOSTS = new Set([...GITHUB_WEB_HOSTS, 'raw.githubusercontent.com']);
// The owner and the names of the benchmark repository, in lower case.
const BENCHMARK_REPOSITORY = { owner: 'docksdocks', names: new Set(['docks', 'docks.git']) };
// An invalid-run reason names this many outside targets, then the count of the others.
const LISTED_READS = 3;
// The instruction paths of an agent text are absolute paths. A path in backticks or quotes ends at the closing quote
// and can hold spaces, for example in a plugin root under a folder with a space. A bare path ends at the first space or
// quote. In the two patterns below, group 2 holds the path in quotes and group 3 the bare path.
//
// The path `<plugin root>/skills/[<folder>/]code-reviewer/SKILL.md` (or plan-reviewer). The groups hold the plugin
// root.
const REVIEWER_SKILL_TAIL = String.raw`\/skills\/(?:[^\s\x60'"/]+\/)?(?:code|plan)-reviewer\/SKILL\.md`;
const REVIEWER_SKILL = new RegExp(
  String.raw`([\x60'"])(\/[^\x60'"\r\n]*?)${REVIEWER_SKILL_TAIL}\1|` +
    String.raw`(?<=^|[\s\x60'"(<])(\/[^\s\x60'"]*?)${REVIEWER_SKILL_TAIL}`,
  'g',
);
// The name of the self-review agent of a configuration starts with this prefix (see prepare.mjs selfReviewAgent).
export const SELF_REVIEW_AGENT_PREFIX = 'review-bench-selfreview-';
// The path `<project>/.omp/agents/<self-review agent>.md` (or `.claude/agents/`). The self-review agent has no plugin
// root, so its text names its own agent file. The groups hold the full path.
const SELF_REVIEW_AGENT_TAIL = String.raw`\/\.(?:omp|claude)\/agents\/${SELF_REVIEW_AGENT_PREFIX}[^\s\x60'"/]+\.md`;
const SELF_REVIEW_AGENT_FILE = new RegExp(
  String.raw`([\x60'"])(\/[^\x60'"\r\n]*${SELF_REVIEW_AGENT_TAIL})\1|` +
    String.raw`(?<=^|[\s\x60'"(<])(\/[^\s\x60'"]*${SELF_REVIEW_AGENT_TAIL})(?=$|[\s\x60'")>])`,
  'g',
);
// The path of a match of one of the patterns above: in quotes, else bare.
const instructionPath = (match) => match[2] ?? match[3];

// The plugin roots that an agent text names: the folder P of each absolute path `P/skills/[<folder>/]code-reviewer/
// SKILL.md` or `P/skills/[<folder>/]plan-reviewer/SKILL.md`, each once, in text order. readScope lets a reviewer read
// the instructions under these roots, and `prepare.mjs agents` refuses a variant agent that names another root.
export function reviewerPluginRoots(text) {
  return [...new Set(Array.from(text.matchAll(REVIEWER_SKILL), instructionPath))];
}

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
function readText(file, hint = '') {
  if (!fs.existsSync(file)) fail(`${file} is missing${hint}`);
  return fs.readFileSync(file, 'utf8');
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

// The protected decisions of a case: one { id, section, summary } per decision that the user made or delegated, such as
// a request correction or a decision that a yolo plan records, which a reviewer must not re-argue (see the `protected`
// row of the Cases table in SKILL.md). The judge names them by id, so each id is a string, once.
function requireProtectedList(caseId, decisions) {
  if (!Array.isArray(decisions) || decisions.some((item) => typeof item?.id !== 'string'))
    fail(`the protected decisions of ${caseId} must be a list of items with a string id`);
  if (new Set(decisions.map((item) => item.id)).size !== decisions.length)
    fail(`${caseId} repeats a protected decision id`);
  return decisions;
}

const keyFile = (dir, caseId) => path.join(dir, `${caseId}.key.json`);

// The known defects and the protected decisions in `<dir>/<caseId>.key.json`: a list of known defects, or an object
// with a `known` list and an optional `protected` list. A list, or an object without `protected`, gives no protected
// decisions. The result is undefined when the file does not exist. Every reader of a key file uses this function.
function readKeyFile(dir, caseId) {
  const file = keyFile(dir, caseId);
  if (!fs.existsSync(file)) return undefined;
  const key = readJson(file);
  if (Array.isArray(key)) return { known: requireKnownList(caseId, key), protected: [] };
  return {
    known: requireKnownList(caseId, key?.known),
    protected: requireProtectedList(caseId, key.protected ?? []),
  };
}

// The known defects in `<dir>/<caseId>.key.json` (see readKeyFile), or undefined when the file does not exist.
export function readKey(dir, caseId) {
  return readKeyFile(dir, caseId)?.known;
}

// The case file `<casesDir>/<split>/<caseId>.json`, else `<casesDir>/<caseId>.json`.
export function caseFilePath(casesDir, caseId, split) {
  const caseFile = [path.join(casesDir, split ?? '', `${caseId}.json`), path.join(casesDir, `${caseId}.json`)].find(
    (file) => fs.existsSync(file),
  );
  if (!caseFile) fail(`case file ${caseId}.json not found under ${casesDir}`);
  return caseFile;
}

// The known defects and the protected decisions of a case: inline in a development case, or in the key file of a
// held-out case. With `keys`, the key file is `<keys>/<id>.key.json`, and the key file next to the case file stays
// unread. `dir` is the folder of the files that the known defects name, such as their fix patches: the case folder for
// inline defects, else the folder of the key file.
export function readKnown(casesDir, caseId, split, keys) {
  const caseFile = caseFilePath(casesDir, caseId, split);
  const data = readJson(caseFile);
  if (data.known !== undefined) {
    return {
      kind: data.kind,
      known: requireKnownList(caseId, data.known),
      protected: requireProtectedList(caseId, data.protected ?? []),
      dir: path.dirname(caseFile),
    };
  }
  const keyDir = keys ?? path.dirname(caseFile);
  const key = readKeyFile(keyDir, caseId);
  if (key === undefined) fail(`${keyFile(keyDir, caseId)} is missing and ${caseFile} has no known defects`);
  return { kind: data.kind, known: key.known, protected: key.protected, dir: keyDir };
}

// Each review round of a run is one judge run with its own label. A run without round folders keeps its label. Each
// finding pairs with each protected decision of its case without the shared-file rule of code pairs, because a finding
// can re-argue a decision from any file.
export function buildPairs(findingsDoc, cases) {
  const result = new Map();
  const labels = new Map();
  const blinds = new Map();
  const runEntry = ({ case: caseId, arm, run, round }) => {
    if (!result.has(caseId)) {
      if (!cases[caseId]) fail(`no known defects for case ${caseId}`);
      const { kind, split, known, protected: decisions = [] } = cases[caseId];
      result.set(caseId, { case: caseId, kind, split: split ?? null, known, protected: decisions, runs: new Map() });
    }
    const label = runLabel(caseId, arm, runPath(run, round));
    const key = `${caseId}/${arm}/${runPath(run, round)}`;
    if (labels.has(label) && labels.get(label) !== key) fail(`run label collision: ${key} and ${labels.get(label)}`);
    labels.set(label, key);
    const runs = result.get(caseId).runs;
    if (!runs.has(label)) runs.set(label, { run: label, findings: [], pairs: [], protectedPairs: [] });
    return runs.get(label);
  };
  for (const block of findingsDoc.blocks) runEntry(block);
  for (const finding of findingsDoc.findings) {
    if (blinds.has(finding.blind)) fail(`finding id collision: ${finding.id} and ${blinds.get(finding.blind)}`);
    blinds.set(finding.blind, finding.id);
    const target = runEntry(finding);
    const { kind, known, protected: decisions } = result.get(finding.case);
    const { severity, category, locator, text } = finding;
    target.findings.push({ finding: finding.blind, severity, category, locator, text });
    for (const item of known) {
      if (pairWanted(caseFamily(kind), finding, item)) target.pairs.push({ finding: finding.blind, known: item.id });
    }
    for (const item of decisions) target.protectedPairs.push({ finding: finding.blind, protected: item.id });
  }
  const sortedCases = [...result.values()].sort((a, b) => compare(a.case, b.case));
  return {
    cases: sortedCases.map((entry) => ({
      case: entry.case,
      kind: entry.kind,
      split: entry.split,
      known: entry.known,
      protected: entry.protected,
      runs: [...entry.runs.values()]
        .sort((a, b) => compare(a.run, b.run))
        .map((run) => ({
          run: run.run,
          findings: run.findings.sort((a, b) => compare(a.finding, b.finding)),
          pairs: run.pairs.sort((a, b) => compare(a.finding, b.finding) || compare(a.known, b.known)),
          protectedPairs: run.protectedPairs.sort(
            (a, b) => compare(a.finding, b.finding) || compare(a.protected, b.protected),
          ),
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

// `knownByCase` and `protectedByCase` map each case to the ids of its known defects and of its protected decisions.
function readJudgments(judgments, byBlind, knownByCase, protectedByCase) {
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
  const rearguedAnswers = new Map();
  for (const entry of judgments.reargued ?? []) {
    const finding = byBlind.get(entry.finding);
    if (!finding) fail(`judgments.json names unknown finding ${entry.finding}`);
    if (!protectedByCase.get(finding.case).includes(entry.protected))
      fail(
        `judgments.json pairs ${entry.finding} with ${entry.protected}, which is not a protected decision of its case`,
      );
    if (!MATCH_VERDICTS.has(entry.verdict)) fail(`judgments.json has reargued verdict ${entry.verdict}`);
    const pair = `${entry.finding} ${entry.protected}`;
    recordOnce(rearguedAnswers, pair, entry.verdict, `${entry.finding} and ${entry.protected}`);
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
  // A reargued `match` names a protected decision that the finding re-argues. It finds no known defect and does not
  // judge the finding, so the finding still needs a `match` answer for a known defect or a rating. A reargued
  // `unknown` is no unknown pair, because no known defect can hide behind it.
  const reargued = new Map();
  for (const [pair, verdict] of rearguedAnswers) {
    if (verdict !== 'match') continue;
    const [finding, id] = pair.split(' ');
    if (!reargued.has(finding)) reargued.set(finding, new Set());
    reargued.get(finding).add(id);
  }
  return { verdicts, matched, unsure, ratings, rearguedAnswers, reargued };
}

// The judge's answers in `<ws>/judgments.json`. The operator skips the judge when no finding needs an answer, so a
// missing file holds no answers; the completeness checks then stop when a finding needs one.
export function loadJudgments(ws) {
  const file = path.join(ws, 'judgments.json');
  return fs.existsSync(file) ? readJson(file) : { matches: [], adjudications: [] };
}

// A candidate pair without an answer would count as a miss, so the report and the fix step of a loop refuse
// judgments that skip one. `pairs` lists { finding, known } with blind finding ids. Answers for pairs that are not
// candidates stay allowed.
function requirePairAnswers(pairs, verdicts) {
  const missing = pairs
    .filter((pair) => !verdicts.has(`${pair.finding} ${pair.known}`))
    .map((pair) => `${pair.finding} and ${pair.known}`);
  if (missing.length === 0) return;
  fail(`judgments.json has no match answer for ${missing.length} candidate pairs of pairs.json: ${listSome(missing)}`);
}

// A protected pair without an answer would hide a re-argued decision, so the report refuses judgments that skip one,
// as it refuses a candidate pair without an answer. `pairs` lists { finding, protected } with blind finding ids. The
// fix step of a loop reads no reargued answer: a protected decision has no fix.
function requireRearguedAnswers(pairs, answers) {
  const missing = pairs
    .filter((pair) => !answers.has(`${pair.finding} ${pair.protected}`))
    .map((pair) => `${pair.finding} and ${pair.protected}`);
  if (missing.length === 0) return;
  fail(
    `judgments.json has no reargued answer for ${missing.length} protected pairs of pairs.json: ${listSome(missing)}`,
  );
}

// A finding with neither a `match` answer nor a rating would count as unjudged, so the report stops on it, as it
// stops on a candidate pair without an answer. The fix step of a loop stops on it too, because it cannot decide it. A
// reargued `match` answer (`reargued`) is no `match` answer here: it says nothing about the defect of the finding.
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

// The fix step after one round of a review loop. It plans a repair for every finding that can stand:
// - fixes: the fix patch of each known defect that a finding of the round matches, and before it the patches that it
//   needs through `fix_after`, also indirectly. A needed patch that no finding of the round matched gets
//   `pulled: true`; the plan pulls in no defect that an earlier round fixed (`applied`). A matched defect stays in
//   the plan also when an earlier round fixed it, because a later repair can bring the defect back: `loop` drops its
//   patch only when the tree of the round still holds the fix. The order takes, again and again, the first known
//   defect in known-list order whose `fix_after` ids are all placed, or fixed by an earlier round and not in the plan.
// - extras: the stable ids of the findings without a `match` answer that the judge rated `valid`. The fixer agent
//   repairs them.
// - rejections: the findings without a `match` answer rated `wrong` or `unknown`, with the judge's reason, for the
//   rejection comment.
// It stops before it plans when the judge did not answer a candidate pair of a finding of the round (pairWanted, as
// `pairs` builds them) or did not rate a finding without a `match` answer.
export function fixPlan({ findings, judgments, known, applied = [] }) {
  const verdicts = new Map();
  for (const entry of judgments.matches ?? []) {
    if (!MATCH_VERDICTS.has(entry.verdict)) fail(`judgments.json has match verdict ${entry.verdict}`);
    recordOnce(verdicts, `${entry.finding} ${entry.known}`, entry.verdict, `${entry.finding} and ${entry.known}`);
  }
  const candidates = findings.flatMap((finding) =>
    known
      .filter((item) => pairWanted('code', finding, item))
      .map((item) => ({ finding: finding.blind, known: item.id })),
  );
  requirePairAnswers(candidates, verdicts);
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
        wanted.set(id, false);
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
  const placed = new Set(applied.filter((id) => !wanted.has(id)));
  const remaining = known.filter((item) => wanted.has(item.id));
  while (remaining.length) {
    const next = remaining.findIndex((item) => (item.fix_after ?? []).every((after) => placed.has(after)));
    if (next === -1) fail(`the fix_after lists of ${remaining.map((item) => item.id).join(', ')} form a cycle`);
    const [item] = remaining.splice(next, 1);
    if (typeof item.fix !== 'string' || !item.fix) fail(`known defect ${item.id} has no fix patch`);
    const fix = { known: item.id, patch: item.fix };
    fixes.push(wanted.get(item.id) ? { ...fix, pulled: true } : fix);
    placed.add(item.id);
  }
  return { fixes, extras, rejections };
}

// The loop ends after a round that leaves no finding open, and after round 5. `repairs` holds `fixes`, the fixes of
// the known defects that the fix step repairs, and `extras`, the valid extra findings for the fixer. The fix step
// repairs every finding that stands, so no fix and no extra means that no finding stands. `loop` asks with the fix
// plan first, then with the fixes whose defects stand in the tree of the round (see prepare.mjs prepareLoop).
export function loopEnds(round, { fixes, extras }) {
  return round >= MAX_LOOP_ROUNDS || (fixes.length === 0 && extras.length === 0);
}

// Sorts findings by the judge's answers: the known defects that they found, the known defects of their `unknown`
// pairs, the count of `unknown` pairs, the protected decisions that they re-argue, and the ratings of the findings
// without a `match` answer. A re-argued decision changes no other count, so the finding keeps its rating.
function judgeFindings(findings, { matched, unsure, ratings, reargued }) {
  const result = {
    found: new Set(),
    doubtful: new Set(),
    unknownPairs: 0,
    reargued: new Set(),
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
    for (const id of reargued.get(finding.blind) ?? []) result.reargued.add(id);
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
// `found` lists the known defects that the findings of the round matched. `fixer` tells if the meta.json of the round
// records a fix step after the round, and `fixerSeconds` and `fixerTokens` are the time and the tokens of that step.
// `knownRepair` and `extraRepair` come from the record of that fix step (`fix`, `fixAlreadyApplied`, `fixedByFixer`,
// and `fixerChangedNothing`, see prepare.mjs prepareLoop) and from the fixer reply (`fixer.replies`, see
// transcriptsCommand): `knownRepair` tells if it repaired a known defect that a finding of the round matched, with a
// fix patch that applied or through the fixer. A patch that the tree already held and a pulled-in patch repair no
// finding of the round. A defect that the fixer got counts only when the fixer patch changed the tree and the fixer did
// not reply `not present` for each finding of the round that matches the defect. `extraRepair` tells if the fixer
// repaired valid extra findings: the fix step gave valid extras to the fixer, the fixer patch changed the tree, and
// the fixer did not reply `not present` for each of these extras.
function scoreRound(round, knownIds, judged, meta) {
  const costs = round.blocks.map((block) => meta?.reviewers?.[block.reviewer]);
  const { found } = judgeFindings(round.findings, judged);
  const present = new Set(meta?.fixAlreadyApplied ?? []);
  const byFixer = new Set(meta?.fixedByFixer ?? []);
  const replies = meta?.fixer?.replies ?? {};
  // The fixer repaired one of the findings `ids` when its patch changed the tree and it replied `not present` for not
  // all of them.
  const fixerRepaired = (ids) => !meta?.fixerChangedNothing && ids.some((id) => replies[id] !== 'not present');
  const matching = (known) => round.findings.filter((finding) => judged.matched.get(finding.blind)?.has(known));
  const repaired = (fix) =>
    !fix.pulled &&
    !present.has(fix.known) &&
    (!byFixer.has(fix.known) || fixerRepaired(matching(fix.known).map((finding) => finding.id)));
  return {
    round: round.round,
    mode: meta?.mode ?? null,
    seconds: costs.every((cost) => typeof cost?.seconds === 'number')
      ? Math.max(...costs.map((cost) => cost.seconds))
      : null,
    tokens: total(costs.map((cost) => cost?.tokens)),
    found: knownIds.filter((id) => found.has(id)),
    knownRepair: (meta?.fix?.fixes ?? []).some(repaired),
    extraRepair: fixerRepaired(meta?.fix?.extras ?? []),
    fixer: Boolean(meta?.fixer),
    fixerSeconds: typeof meta?.fixer?.seconds === 'number' ? meta.fixer.seconds : 0,
    fixerTokens: typeof meta?.fixer?.tokens === 'number' ? meta.fixer.tokens : 0,
    verdicts: round.blocks.map((block) => ({ reviewer: block.reviewer, verdict: block.verdict })),
    verdict: roundVerdict(round.blocks.map((block) => block.verdict)),
  };
}

// The reasons of one agent entry against its setting: the configuration of its run for a reviewer, the fixer setting
// of its loop for a fixer. The checks cover the model of each message, the effort that was active at each message of
// the model of the setting, and the served tier of these messages (only for a setting with a tier). A failed request
// (`failed: true`) stays out of the model and served-tier checks, because no model served it; an entry needs at least
// one other message.
function configReasons(setting, label, entry) {
  if (!Array.isArray(entry?.messages)) return [`${label}: no transcript facts`];
  const served = entry.messages.filter((message) => !message.failed);
  if (served.length === 0) return [`${label}: no served assistant message`];
  const reasons = [];
  for (const model of distinct(served.map((message) => message.model))) {
    if (model !== setting.model) reasons.push(`${label}: model ${model}, not ${setting.model}`);
  }
  const own = entry.messages.filter((message) => message.model === setting.model);
  for (const effort of distinct(own.map((message) => message.effort ?? null))) {
    if (effort !== setting.effort) reasons.push(`${label}: effort ${effort}, not ${setting.effort}`);
  }
  if (setting.tier === null || setting.tier === undefined) return reasons;
  for (const tier of distinct(own.filter((message) => !message.failed).map((message) => message.servedTier))) {
    if (tier !== setting.tier) reasons.push(`${label}: served tier ${tier}, not ${setting.tier}`);
  }
  return reasons;
}

// A run proves its configuration with the transcript facts of each reviewer, and a loop proves its fixer setting
// (`fixerConfig`, from `prepare.mjs agents`) with the transcript facts of the fixer of each round that ran one or that
// gave findings to the fixer; a run without a configuration has no configuration to prove. A loop with a
// configuration and a fixer entry but without a fixer setting cannot prove its fixer. Every run must show, by the
// `readScope` of each reviewer entry, that the reviewer read only the inputs of the run, and must hold a review in the
// block of each reviewer of each round: a block that is missing, unreadable, or `blocked` holds no review. The
// production loop does not post such a round, so the run does not show the review of its arm. Each reviewer is
// `{ label, verdict, entry }` and each fixer is `{ label, entry }`, where verdict is the verdict of the block and entry
// is the meta.json entry (undefined for a fixer without an entry).
function invalidReasons(config, reviewers, { fixerConfig = null, fixers = [] } = {}) {
  const reasons = [];
  for (const { label, verdict, entry } of reviewers) {
    if (!REVIEW_VERDICTS.has(verdict)) reasons.push(`${label}: no review (${verdict})`);
    if (config) reasons.push(...configReasons(config, label, entry));
    const outside = entry?.readScope?.outside ?? [];
    if (outside.length) reasons.push(`${label}: read outside its inputs: ${listSome(outside, LISTED_READS)}`);
  }
  if (!config) return reasons;
  for (const { label, entry } of fixers) {
    reasons.push(...(fixerConfig ? configReasons(fixerConfig, label, entry) : [`${label}: no fixer setting`]));
  }
  return reasons;
}

// The transcript facts of the reviewers of a run, merged for the comparison tables. A failed request shows no model
// and no served tier, so the model and served-tier values leave it out.
function runFacts(entries) {
  const proven = entries.filter((entry) => Array.isArray(entry?.messages));
  const messages = proven.flatMap((entry) => entry.messages);
  const served = messages.filter((message) => !message.failed);
  return {
    models: distinct(served.map((message) => message.model ?? null)),
    efforts: distinct(messages.map((message) => message.effort ?? null)),
    servedTiers: distinct(served.map((message) => message.servedTier ?? null)),
    sideCallTokens: sum(proven.flatMap((entry) => entry.sideCalls ?? []).map((call) => call.tokens ?? 0)),
  };
}

// A run is a loop when it has round folders (a `code` case built with `case --loop`); every other run is a single
// review. A run's time and tokens are the sums over its rounds; its found defects and finding counts cover every
// round; its verdicts are those of its last round. A known defect is unresolved in a run when the run did not find it
// and the judge answered `unknown` for a pair of it with at least one finding of the run. `unknownPairs` counts every
// `unknown` pair answer of the run, also those that cannot change recall, such as a finding that may repeat a known
// defect the run found. `reargued` lists the protected decisions of the case that a finding of the run re-argues (a
// reargued `match` answer), each once, in the order of the case's list. They are no known defects, so they count in
// neither `known` nor recall. `diffCoverages` lists the read coverage (`diffCoverage`, see transcriptsCommand) of each
// reviewer of each round that has one, and `lowestDiffCoverage` is the lowest of them, so the Runs table shows the
// reviewer that read the least of its own diff. The read coverage is an observation: it makes no run invalid.
function scoreRun(run, caseEntry, judged, metas) {
  const knownIds = caseEntry.known.map((item) => item.id);
  const protectedIds = (caseEntry.protected ?? []).map((item) => item.id);
  const metaOf = (round) => metas[run.hasRounds ? `${run.key}/round-${round}` : run.key];
  const config = metas[run.key]?.config ?? metaOf(1)?.config ?? null;
  const rounds = [...run.rounds.values()].sort((a, b) => a.round - b.round);
  const reviewers = rounds.flatMap((round) =>
    round.blocks.map((block) => ({
      label: run.hasRounds ? `round-${round.round}/${block.reviewer}` : block.reviewer,
      verdict: block.verdict,
      entry: metaOf(round.round)?.reviewers?.[block.reviewer],
    })),
  );
  const diffCoverages = reviewers
    .map((reviewer) => reviewer.entry?.diffCoverage)
    .filter((value) => typeof value === 'number');
  // The fixer of each loop round that ran one (`fixer.agents` of the round meta.json), against the fixer setting. A
  // round whose fix step gave findings to the fixer (`fix.extras` or `fixedByFixer`) needs the transcript facts of its
  // fixer: a repair by hand (`loop --fixer-patch`) or by an agent of another setting changes the later rounds too. Such
  // a round without a fixer entry gets the entry `fixer-1` without facts. Only a loop round has a fixer.
  const fixerConfig = metas[run.key]?.fixerConfig ?? metaOf(1)?.fixerConfig ?? null;
  const fixers = rounds.flatMap((round) => {
    const meta = metaOf(round.round);
    const agents = Object.entries(meta?.fixer?.agents ?? {});
    const needed = (meta?.fix?.extras ?? []).length > 0 || (meta?.fixedByFixer ?? []).length > 0;
    if (needed && agents.length === 0) agents.push([FIXER_NAME, undefined]);
    return agents.map(([name, entry]) => ({ label: `round-${round.round}/${name}`, entry }));
  });
  const roundScores = rounds.map((round) => scoreRound(round, knownIds, judged, metaOf(round.round)));
  const all = judgeFindings(
    rounds.flatMap((round) => round.findings),
    judged,
  );
  // A round is caused only by extra findings when the fix step after the round before it repaired valid extra findings
  // and no known defect (see scoreRound). A finding that needed no repair, such as a repeat of a fixed defect whose fix
  // the tree holds or a finding that the fixer found `not present`, causes no round.
  const extraOnlyRounds = roundScores.filter(
    (_, index) => index > 0 && roundScores[index - 1].extraRepair && !roundScores[index - 1].knownRepair,
  ).length;
  const last = roundScores.at(-1);
  return {
    case: run.case,
    arm: run.arm,
    run: run.run,
    split: caseEntry.split ?? null,
    config,
    invalid: invalidReasons(config, reviewers, { fixerConfig, fixers }),
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
    reargued: protectedIds.filter((id) => all.reargued.has(id)),
    diffCoverages,
    lowestDiffCoverage: summarize(diffCoverages).min,
    seconds: total(roundScores.map((round) => round.seconds)),
    tokens: total(roundScores.map((round) => round.tokens)),
    fixerSeconds: sum(roundScores.map((round) => round.fixerSeconds)),
    fixerTokens: sum(roundScores.map((round) => round.fixerTokens)),
    ...runFacts(reviewers.map((reviewer) => reviewer.entry)),
    verdicts: last.verdicts,
    roundVerdict: last.verdict,
    loop: run.hasRounds,
    rounds: roundScores,
  };
}

// metas maps `<case>/<arm>/<run>` to the content of that run's meta.json, and `<case>/<arm>/<run>/round-<r>` to the
// meta.json of a round folder. Summaries leave out invalid runs. The read coverage of a summary is the mean over the
// reviewers of its runs, not over the runs, so a run counts with the number of its reviewers that have a value.
export function scoreRuns({ findings: findingsDoc, pairs: pairsDoc, judgments, metas = {} }) {
  const caseEntries = new Map(pairsDoc.cases.map((entry) => [entry.case, entry]));
  const knownByCase = new Map(pairsDoc.cases.map((entry) => [entry.case, entry.known.map((item) => item.id)]));
  // A pairs.json of an earlier version has no protected decisions and no protected pairs.
  const protectedByCase = new Map(
    pairsDoc.cases.map((entry) => [entry.case, (entry.protected ?? []).map((item) => item.id)]),
  );
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
  const judged = readJudgments(judgments, byBlind, knownByCase, protectedByCase);
  requirePairAnswers(
    pairsDoc.cases.flatMap((entry) => entry.runs.flatMap((run) => run.pairs)),
    judged.verdicts,
  );
  requireRearguedAnswers(
    pairsDoc.cases.flatMap((entry) => entry.runs.flatMap((run) => run.protectedPairs ?? [])),
    judged.rearguedAnswers,
  );
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
    reargued: summarize(runsOfArm.map((run) => run.reargued.length)).mean,
    diffCoverage: summarize(runsOfArm.flatMap((run) => run.diffCoverages)).mean,
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

// Compares each answer of a second judge with the same answer of the first judge: a `matches` answer with the answer
// of the same finding and known defect, an adjudication with the rating of the same finding, and a `reargued` answer
// with the reargued answer of the same finding and protected decision.
export function judgeAgreement(judgments, second) {
  const verdicts = new Map(
    (judgments.matches ?? []).map((entry) => [`${entry.finding} ${entry.known}`, entry.verdict]),
  );
  const ratings = new Map((judgments.adjudications ?? []).map((entry) => [entry.finding, entry.rating]));
  const reargued = new Map(
    (judgments.reargued ?? []).map((entry) => [`${entry.finding} ${entry.protected}`, entry.verdict]),
  );
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
  for (const entry of second.reargued ?? []) {
    const pair = `${entry.finding} ${entry.protected}`;
    if (!reargued.has(pair))
      fail(
        `judgments-second.json answers ${entry.finding} and ${entry.protected}, which judgments.json does not answer`,
      );
    if (!MATCH_VERDICTS.has(entry.verdict)) fail(`judgments-second.json has reargued verdict ${entry.verdict}`);
    answers += 1;
    if (reargued.get(pair) === entry.verdict) agreed += 1;
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
  ['Re-argued mean', (entry) => ratio(entry.reargued), true],
  ['Diff read mean', (entry) => ratio(entry.diffCoverage), true],
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
  ['Re-argued', (run) => run.reargued.join(', ') || '-'],
  ['Diff read', (run) => ratio(run.lowestDiffCoverage), true],
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

// Rows that divide the sum of a value over the runs by the runs.
const KNOWN_ROWS = [
  ['Known found per run', (run) => run.found.length],
  ['Escaped per run', (run) => run.escaped],
];
const VALID_EXTRAS_ROW = ['Valid extras per run', (run) => run.validExtras];
const EXTRA_ONLY_ROW = ['Extra-only rounds per run', (run) => run.extraOnlyRounds];
const ANSWER_ROWS = [
  ['Wrong per run', (run) => run.wrong],
  ['Unjudged per run', (run) => run.unjudged],
  ['Unknown ratings per run', (run) => run.unknown],
  ['Unknown pairs per run', (run) => run.unknownPairs],
];
const perRunRow = ([label, value]) => [label, (runs) => ratio(perRun(runs, value))];
const median = (runs, field) => summarize(runs.map((run) => run[field])).median;
const FACT_ROWS = [
  ['Model', (runs) => joinValues(runs.flatMap((run) => run.models))],
  ['Effort', (runs) => joinValues(runs.flatMap((run) => run.efforts))],
  ['Served tier', (runs) => joinValues(runs.flatMap((run) => run.servedTiers))],
];

// The known defects that the runs did not find, per 50 known defects of their cases; null without known defects.
function escapedPer50(runs) {
  const known = sum(runs.map((run) => run.known));
  return known ? (50 * sum(runs.map((run) => run.escaped))) / known : null;
}

// The known defects that the runs found, divided by their loop minutes.
function foundPerMinute(runs) {
  const seconds = total(runs.map((run) => run.seconds));
  return seconds ? sum(runs.map((run) => run.found.length)) / (seconds / 60) : null;
}

// Each interval row: the measure, the value of a run, the weight of a case from its known defects, the format, and
// the runs that the row compares. A single review has no loop, so the loop seconds row compares loop runs only.
const INTERVAL_ROWS = [
  ['Round 1 recall', (run) => run.rounds[0].found.length, (known) => known, ratio, () => true],
  ['Escaped per 50 known', (run) => run.escaped, (known) => known / 50, ratio, () => true],
  ['Loop seconds', (run) => run.seconds, () => 1, oneDecimal, (run) => run.loop],
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
  return INTERVAL_ROWS.map(([measure, value, weight, format, compared]) => {
    const referenceRuns = runsOf(reference).filter(compared);
    return [
      `${measure} difference from ${reference}, 90% interval`,
      (runs, name) => {
        if (name === reference) return '-';
        const cases = pairedCases(runs.filter(compared), referenceRuns, value, weight);
        const { low, high } = pairedBootstrap(cases, { level: 0.9 });
        return low === null ? '-' : `[${format(low)}, ${format(high)}]`;
      },
    ];
  });
}

// The default reference, the best configuration of the decision rule: of the columns with known defects, the one with
// the fewest escaped defects per 50 known defects; the first on a tie.
function fewestEscaped(columns, runsOf) {
  let best = null;
  let bestEscaped = Infinity;
  for (const name of columns) {
    const escaped = escapedPer50(runsOf(name));
    if (escaped !== null && escaped < bestEscaped) [best, bestEscaped] = [name, escaped];
  }
  return best;
}

// The runs of each column; `columnOf` gives the column name of a run.
const columnRuns = (runs, columnOf) => (name) => runs.filter((run) => columnOf(run) === name);
const configColumn = (run) => run.config.name;
const armColumn = (run) => run.arm;
const casesOf = (runs) => new Set(runs.map((run) => run.case));
const CASES_ROW = ['Cases', (list) => casesOf(list).size];
// A cell that compares a column with the reference column; the reference column gets `-`.
const besideReference = (reference, cell) => (list, name) => (name === reference ? '-' : cell(list));

// One column per name and one row per [label, cell]. A cell gets the runs of its column and the name.
function measureTable(rows, columns, runsOf) {
  return [
    row(['Measure', ...columns]),
    `|${['---', ...columns.map(() => '---:')].join('|')}|`,
    ...rows.map(([label, cell]) => row([label, ...columns.map((name) => cell(runsOf(name), name))])),
  ];
}

// The cases that a column and the reference column both ran. The interval rows pair only these cases.
function sharedCasesRow(reference, runsOf) {
  const referenceCases = casesOf(runsOf(reference));
  const shared = (list) => [...casesOf(list)].filter((caseId) => referenceCases.has(caseId)).length;
  return [`Cases shared with ${reference}`, besideReference(reference, shared)];
}

// The measures of the decision rule over all runs of a case group, with the intervals against the reference column.
// With `sharedCases`, the table also gives the cases of each column and the cases that it shares with the reference
// column, because the columns can hold different cases. `Diff read mean` is the mean of the read coverage of the
// reviewers of all rounds of the runs (see scoreRun), as the summary gives it for one case.
function decisionTable(runs, columns, columnOf, { reference, sharedCases }) {
  const runsOf = columnRuns(runs, columnOf);
  const base = reference ?? fewestEscaped(columns, runsOf);
  const rows = [
    ['Runs', (list) => list.length],
    ...(sharedCases ? [CASES_ROW] : []),
    ...KNOWN_ROWS.map(perRunRow),
    ['Escaped per 50 known', (list) => ratio(escapedPer50(list))],
    ['Diff read mean', (list) => ratio(summarize(list.flatMap((run) => run.diffCoverages)).mean)],
    ...FACT_ROWS,
    ...(base === null ? [] : [...(sharedCases ? [sharedCasesRow(base, runsOf)] : []), ...intervalRows(base, runsOf)]),
  ];
  return measureTable(rows, columns, runsOf);
}

// The loop runs of a case group, with the model, effort, and served tier that the transcripts show. The fixer seconds
// and fixer tokens medians cover only the loops that ran a fixer.
function loopTable(runs, columns, columnOf) {
  const runsOf = columnRuns(runs, columnOf);
  const lastRound = Math.max(0, ...runs.map((run) => run.rounds.length));
  const rounds = (list) => summarize(list.map((run) => run.rounds.length));
  const withFixer = (list) => list.filter((run) => run.rounds.some((round) => round.fixer));
  const rows = [
    ['Runs', (list) => list.length],
    ...FACT_ROWS,
    ...Array.from({ length: lastRound }, (_, index) => roundRows(index + 1)).flat(),
    ['Rounds median', (list) => oneDecimal(rounds(list).median)],
    ['Rounds max', (list) => whole(rounds(list).max)],
    ['Loop seconds median', (list) => oneDecimal(median(list, 'seconds'))],
    ...[...KNOWN_ROWS, VALID_EXTRAS_ROW, EXTRA_ONLY_ROW, ...ANSWER_ROWS].map(perRunRow),
    ['Tokens median', (list) => whole(median(list, 'tokens'))],
    ['Side-call tokens median', (list) => whole(median(list, 'sideCallTokens'))],
    ['Loops with a fixer', (list) => withFixer(list).length],
    ['Fixer seconds median', (list) => oneDecimal(median(withFixer(list), 'fixerSeconds'))],
    ['Fixer tokens median', (list) => whole(median(withFixer(list), 'fixerTokens'))],
    ['Known found per loop minute', (list) => ratio(foundPerMinute(list))],
  ];
  return measureTable(rows, columns, runsOf);
}

// The single reviews of a case group: runs of one round without round folders, with the model, effort, and served tier
// that the transcripts show.
function singleReviewTable(runs, columns, columnOf) {
  const runsOf = columnRuns(runs, columnOf);
  const seconds = (list) => summarize(list.map((run) => run.seconds));
  const rows = [
    ['Runs', (list) => list.length],
    ...FACT_ROWS,
    ['Seconds median', (list) => oneDecimal(seconds(list).median)],
    ['Seconds min', (list) => oneDecimal(seconds(list).min)],
    ['Seconds max', (list) => oneDecimal(seconds(list).max)],
    ...[...KNOWN_ROWS, VALID_EXTRAS_ROW, ...ANSWER_ROWS].map(perRunRow),
    ['Tokens median', (list) => whole(median(list, 'tokens'))],
  ];
  return measureTable(rows, columns, runsOf);
}

// The runs by case group (`-` for a case without a split), in group-name order.
function bySplit(runs) {
  const groups = new Map();
  for (const run of runs) {
    const group = run.split ?? '-';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(run);
  }
  return [...groups].sort(([a], [b]) => compare(a, b));
}

// One section `## <title>: <split>` per case group, in name order, from the valid runs whose column (`columnOf`) is
// one of `columns`. A section has a decision table over all its runs, a code-loop table over its loop runs, and a
// single-review table over its other runs; a table without runs is left out.
function comparisonSections(runs, { title, columns, columnOf, reference, sharedCases = false }) {
  const shown = runs.filter((run) => run.invalid.length === 0 && columns.includes(columnOf(run)));
  return bySplit(shown).flatMap(([group, groupRuns]) => {
    const loops = groupRuns.filter((run) => run.loop);
    const singles = groupRuns.filter((run) => !run.loop);
    const tables = [
      [`Decision: ${group}`, groupRuns, () => decisionTable(groupRuns, columns, columnOf, { reference, sharedCases })],
      [`Code loops: ${group}`, loops, () => loopTable(loops, columns, columnOf)],
      [`Single reviews: ${group}`, singles, () => singleReviewTable(singles, columns, columnOf)],
    ].filter(([, tableRuns]) => tableRuns.length > 0);
    const lines = tables.flatMap(([heading, , render]) => [`### ${heading}`, '', ...render(), '']);
    return [`## ${title}: ${group}`, '', ...lines];
  });
}

// The configuration sections: one column per configuration, from the runs that have a configuration. The columns are
// `configs`, or the configuration names in run order.
function configurationSections(runs, { configs, reference }) {
  const configured = runs.filter((run) => run.config);
  const columns = configs ?? distinct(configured.map(configColumn));
  return comparisonSections(configured, { title: 'Configurations', columns, columnOf: configColumn, reference });
}

// The arm sections: one column per arm folder of `arms`, in that order. Arm folders can hold different cases, so the
// decision table gives the cases of each column and the cases that it shares with the reference column.
function armSections(runs, { arms, reference }) {
  return comparisonSections(runs, { title: 'Arms', columns: arms, columnOf: armColumn, reference, sharedCases: true });
}

// Round 1 of a run: the run itself for a single review, the first round for a loop.
const roundOne = (run) => run.rounds[0];

// The known ids that round 1 of the runs found, by case. Each case of the runs has an entry, also without ids.
function roundOneFound(runs) {
  const found = new Map();
  for (const run of runs) {
    if (!found.has(run.case)) found.set(run.case, new Set());
    for (const id of roundOne(run).found) found.get(run.case).add(id);
  }
  return found;
}

const byKnownId = (a, b) => a.localeCompare(b, 'en', { numeric: true });

// `<case>: <id>, <id>; <case>: <id>` in case order, for the cases with ids; `-` without ids.
function idsByCase(found) {
  return (
    [...found]
      .filter(([, ids]) => ids.size > 0)
      .sort(([a], [b]) => compare(a, b))
      .map(([caseId, ids]) => `${caseId}: ${[...ids].sort(byKnownId).join(', ')}`)
      .join('; ') || '-'
  );
}

// The self-review lead of one case group: one column per lead folder and one for the reference folder. Each run
// counts with its round 1 only, and a known defect counts as found when round 1 of at least one run found it. The
// only-found row gives, for each case that the reference ran, the known defects that the column found and no
// reference run found. The last row counts the cases of the column that the reference did not run.
function leadTable(runs, columns, reference) {
  const runsOf = columnRuns(runs, armColumn);
  const referenceFound = roundOneFound(runsOf(reference));
  const seconds = (list) => summarize(list.map((run) => roundOne(run).seconds));
  const onlyFound = (list) =>
    new Map(
      [...roundOneFound(list)]
        .filter(([caseId]) => referenceFound.has(caseId))
        .map(([caseId, ids]) => [caseId, new Set([...ids].filter((id) => !referenceFound.get(caseId).has(id)))]),
    );
  const withoutReference = (list) => [...casesOf(list)].filter((caseId) => !referenceFound.has(caseId)).length;
  const rows = [
    ['Runs', (list) => list.length],
    CASES_ROW,
    ['Round 1 seconds median', (list) => oneDecimal(seconds(list).median)],
    ['Round 1 seconds min', (list) => oneDecimal(seconds(list).min)],
    ['Round 1 seconds max', (list) => oneDecimal(seconds(list).max)],
    ['Known found in a run', (list) => idsByCase(roundOneFound(list))],
    [`Known found that no ${reference} run found`, besideReference(reference, (list) => idsByCase(onlyFound(list)))],
    [`Cases without a ${reference} run`, besideReference(reference, withoutReference)],
  ];
  return measureTable(rows, columns, runsOf);
}

// The self-review lead: the lead folders `lead` and the reference folder `leadRef`, one table per case group, from
// the valid runs.
function leadSection(runs, { lead, leadRef }) {
  const columns = distinct([...lead, leadRef]);
  const shown = runs.filter((run) => run.invalid.length === 0 && columns.includes(armColumn(run)));
  return [
    '## Self-review lead',
    '',
    `The reference is ${leadRef}. A column holds the valid runs of one arm folder in one case group. Each run counts with its round 1 only: a single review is one round, and a loop counts only its first round. The seconds are the round 1 seconds, the slowest reviewer of the round. Known found in a run lists the known defects that round 1 of at least one run found, as \`<case>: <ids>\`. The next row lists, for each case that ${leadRef} ran, the known defects that the column found and round 1 of no ${leadRef} run found. The cases that ${leadRef} did not run stay out of that row, and the last row counts them.`,
    '',
    ...bySplit(shown).flatMap(([group, groupRuns]) => [
      `### Self-review lead: ${group}`,
      '',
      ...leadTable(groupRuns, columns, leadRef),
      '',
    ]),
  ];
}

// The report holds numbers, verdicts, configuration names, arm folder names, and known-defect ids only, so a held-out
// reader learns no defect text. `configs` and `arms` set the columns of the comparison tables, one or the other;
// `reference` sets the column that the intervals compare with (default: the column with the fewest escaped defects per
// 50 known defects); `lead` (lead folders) and `leadRef` (the reference folder) together add the self-review lead.
export function renderReport({ summaries, runs, agreement }, { configs, arms, reference, lead, leadRef } = {}) {
  if (configs && arms) fail('report takes --configs or --arms, not both');
  if (Boolean(lead) !== Boolean(leadRef)) fail('report takes --lead and --lead-ref together');
  const columnNote = arms
    ? 'An arm table has one column per arm folder in one case group. Its decision table also gives the cases of each column and the cases that the column and the reference column both ran.'
    : 'A configuration table has one column per configuration in one case group.';
  const referenceNote = reference
    ? `The reference column is ${reference}.`
    : 'The reference column has the fewest escaped defects per 50 known defects.';
  const invalid = runs.filter((run) => run.invalid.length > 0);
  return [
    '# Review benchmark report',
    '',
    'Recall is the number of known defects that at least one reviewer of a run found, divided by the known defects of the case.',
    'Unresolved is the number of known defects that a run did not find, where the judge answered unknown for a pair of the defect with a finding of the run.',
    'Unknown pairs is the number of unknown answers for pairs of a finding of the run and a known defect. Unresolved counts the known defects of those answers that can change recall.',
    'Diff read is the share of the lines of the own diff of a reviewer (its focus, full, or delta diff) that its read results showed whole; a line of a focus diff also counts when a read of the full diff showed it. The Runs table gives the lowest share of the reviewers of a run. The summary and the decision tables give the mean over the reviewers of their runs. It is an observation: it makes no run invalid.',
    'Seconds is the slowest reviewer of a round, added over the rounds of a run. Tokens is the sum over the reviewers and rounds of a run. A dash means no value.',
    'The Runs table lists every run. The summary, the configuration or arm tables, and the self-review lead leave out invalid runs: runs whose reviewer transcripts show another model, effort, or served tier than their configuration; loops whose fixer transcripts show another model, effort, or served tier than the fixer setting; runs with a reviewer or a fixer without transcript facts or without a served assistant message, also a loop round that gave findings to the fixer and has no transcript facts of its fixer (for example a repair with --fixer-patch); loops with a fixer but without a fixer setting; runs with a reviewer that read a file outside the inputs of its run; and runs with a round in which a reviewer block holds no review (missing, unreadable, or blocked).',
    `${columnNote} The decision table covers all runs of the group. The code-loop table covers the loop runs (runs with round folders), and the single-review table covers the other runs; a table without runs is left out. A round row covers the loops that reached that round. Extra-only rounds are rounds whose previous fix step repaired valid extra findings and no known defect that a finding of the previous round matched. The fixer repaired the valid extras when it got them, its patch changed the tree, and it did not reply not present for each of them. A known defect was repaired when its fix patch applied, or when the fixer repaired it (a fixer patch that changed nothing, or a not present reply for each finding of the defect, repairs none). A patch whose fix the tree already held and a pulled-in patch repair no such defect. Fixer seconds and fixer tokens are the time and the tokens of the fix steps of a loop, apart from the loop seconds and the tokens of the reviewers; their medians cover only the loops with a fixer. An interval row gives the 90% paired bootstrap interval of the difference from the reference column, over the cases that both columns ran. ${referenceNote} The loop seconds interval compares loop runs only.`,
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
    ...(arms ? armSections(runs, { arms, reference }) : configurationSections(runs, { configs, reference })),
    ...(lead ? leadSection(runs, { lead, leadRef }) : []),
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
// round has one fixer, which repairs every valid extra finding of the round and the findings of each known defect
// whose fix patch does not apply, as the manager of a production round repairs every finding. The prompt names
// `fixer-1.patch` in the same folder as its output.
export const FIXER_DIR = 'fixer';
export const FIXER_NAME = 'fixer-1';

// `prepare.mjs loop` writes the reviewed tree of each loop round after round 1 to `<ws>/trees/<run label>/` for the
// judge. The run label is the blind label of pairs.json, so the judge opens no arm folder.
export const JUDGE_TREES = 'trees';

// Every reviewer that has a prompt and every fixer prompt, in workspace order, with its dispatch name, its prompt
// file, and the family of its case. Each round folder is a dispatch of its own; a fixer entry has `fixer: true`, and a
// round has at most one.
function promptedDispatches(ws) {
  return dispatchNames(
    readWorkspace(ws).flatMap(({ caseId, family, arm, run, round, dir, reviewers, prompts }) => {
      const dispatch = (folder, reviewer) => ({
        caseId,
        family,
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

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// omp writes `<name>.jsonl`, `<parent>.<name>.jsonl` for a nested dispatch, and `<name>-<n>.jsonl` for a repeated
// name. Two workspaces that one session dispatches can use the same names, so only the files that `belongs` accepts
// count (see transcriptsCommand). The latest repeat of these is the dispatch whose block the operator kept.
export function pickTranscript(files, name, belongs) {
  const pattern = new RegExp(`^(?:.+\\.)?${escapeRegExp(name)}(?:-(\\d+))?\\.jsonl$`);
  const matches = files.flatMap((file) => {
    const match = pattern.exec(path.basename(file));
    return match && belongs(file) ? [{ file, repeat: Number(match[1] ?? 1) }] : [];
  });
  const latest = Math.max(...matches.map((match) => match.repeat));
  const chosen = matches.filter((match) => match.repeat === latest);
  if (chosen.length > 1) fail(`more than one transcript for ${name}: ${chosen.map((match) => match.file).join(', ')}`);
  return chosen[0]?.file;
}

// One line of a transcript; `number` counts the lines from 1.
function transcriptEntry(line, source, number) {
  try {
    return JSON.parse(line);
  } catch {
    fail(`${source} line ${number} is not JSON`);
  }
}

function transcriptEntries(text, source) {
  const entries = [];
  for (const [index, line] of text.split('\n').entries()) {
    if (line.trim()) entries.push(transcriptEntry(line, source, index + 1));
  }
  return entries;
}

// The lines of a file, without the newline. The generator reads the file in chunks, so a caller that stops early
// reads only the head of the file.
function* fileLines(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const chunk = Buffer.alloc(64 * 1024);
    let pending = Buffer.alloc(0);
    for (;;) {
      const size = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (size <= 0) break;
      pending = Buffer.concat([pending, chunk.subarray(0, size)]);
      for (let newline = pending.indexOf(0x0a); newline >= 0; newline = pending.indexOf(0x0a)) {
        yield pending.toString('utf8', 0, newline);
        pending = pending.subarray(newline + 1);
      }
    }
    if (pending.length) yield pending.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

// The text of a message: its content string, or the text parts of its content list.
const messageText = ({ content }) =>
  typeof content === 'string'
    ? content
    : (Array.isArray(content) ? content : [])
        .filter((part) => part?.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('\n');

// The first user message of a transcript file is the task of the dispatch; '' when the file has none. omp writes it
// before the work of the agent, so the function reads the file only up to that message.
function transcriptTask(file) {
  let number = 0;
  for (const line of fileLines(file)) {
    number += 1;
    if (!line.trim()) continue;
    const entry = transcriptEntry(line, file, number);
    if (entry.type === 'message' && entry.message?.role === 'user') return messageText(entry.message);
  }
  return '';
}

// True when `text` names a path under `folder`. A path starts at the start of the text, after white space, or after a
// quote, a backtick, or an opening bracket, so the folder of another workspace whose path ends with `folder` does not
// count.
function namesPathUnder(text, folder) {
  return new RegExp(`(?:^|[\\s"'\`(<[])${escapeRegExp(folder + path.sep)}`).test(text);
}
const usageTokens = (usage) => TOKEN_FIELDS.reduce((result, field) => result + (usage?.[field] ?? 0), 0);
// `<provider>/<model>`, `<model>` without a provider, and null without a model.
const modelId = ({ provider, model } = {}) => (model ? (provider ? `${provider}/${model}` : model) : null);

// A request that stopped on an error and got no served tier: no model served it. Its time is real wall time, but it
// shows no model or tier that served the agent.
const failedRequest = (message) => message.stopReason === 'error' && (message.serviceTier ?? null) === null;

// Seconds run from the first user message to the last assistant message. Tokens add uncached input, cache reads,
// cache writes, and output over the assistant messages. With `model`, only the assistant messages of that model
// count, so the messages of a fallback model stay out; with no message of `model`, seconds are null and tokens 0. A
// failed request (see failedRequest) counts for the seconds also with another model, because its time is real wall
// time. `model_usage` side calls never count.
export function parseTranscript(text, source = 'transcript', model) {
  let first;
  let last;
  let lastCounted;
  let tokens = 0;
  for (const entry of transcriptEntries(text, source)) {
    if (entry.type !== 'message') continue;
    const time = Date.parse(entry.timestamp);
    if (entry.message?.role === 'user' && first === undefined) first = time;
    if (entry.message?.role !== 'assistant') continue;
    last = time;
    const ofModel = model === undefined || model === null || modelId(entry.message) === model;
    if (ofModel || failedRequest(entry.message)) lastCounted = time;
    if (ofModel) tokens += usageTokens(entry.message.usage);
  }
  if (!Number.isFinite(first) || !Number.isFinite(last))
    fail(`${source} has no timestamped user message and assistant message`);
  if (lastCounted === undefined) return { seconds: null, tokens: 0 };
  return { seconds: Math.round((lastCounted - first) / 100) / 10, tokens };
}

// The tool calls of an assistant message, each with its `id`: the name and the `path` argument (null without one). A
// web search has no path, so its call also gives its `query` argument (null without one).
const toolCallsOf = (message) =>
  (Array.isArray(message.content) ? message.content : [])
    .filter((item) => item?.type === 'toolCall')
    .map((item) => {
      const argument = (name) => (typeof item.arguments?.[name] === 'string' ? item.arguments[name] : null);
      const call = { name: item.name ?? null, path: argument('path') };
      return { id: item.id, call: call.name === WEB_SEARCH_TOOL ? { ...call, query: argument('query') } : call };
    });

// The http and https URLs in the text content of a tool result, each once, in text order, without the punctuation that
// ends a sentence after a URL.
function resultUrls(message) {
  const text = (Array.isArray(message.content) ? message.content : [])
    .map((item) => (typeof item?.text === 'string' ? item.text : ''))
    .join('\n');
  return [...new Set((text.match(RESULT_URL) ?? []).map((url) => url.replace(/[.,;:!?]+$/, '')))];
}

// The configuration that a transcript shows: the last requested OpenAI tier, one entry per assistant message, and the
// `model_usage` side calls of helper models. A message entry gives the model, the effort that was active at the
// message (the `thinkingLevel` of the last `thinking_level_change` before it, else null), and the served tier; a
// failed request (see failedRequest) also gets `failed: true`. An effort change before the first assistant message is
// setup, so it shows only through the messages after it. When the assistant messages call tools, `toolCalls` lists
// the calls in order; a transcript without a tool call gives no `toolCalls`. A web search call whose tool result is in
// the transcript also gets `resultUrls`: the URLs that the result cites (see resultUrls).
export function transcriptFacts(text, source = 'transcript') {
  const facts = { requestedTier: null, messages: [], sideCalls: [] };
  const toolCalls = [];
  const searches = new Map();
  let effort = null;
  for (const entry of transcriptEntries(text, source)) {
    if (entry.type === 'thinking_level_change') effort = entry.thinkingLevel ?? null;
    else if (entry.type === 'service_tier_change') facts.requestedTier = entry.serviceTier?.openai ?? null;
    else if (entry.type === 'model_usage')
      facts.sideCalls.push({ model: modelId(entry), purpose: entry.purpose ?? null, tokens: usageTokens(entry.usage) });
    else if (entry.type === 'message' && entry.message?.role === 'assistant') {
      const { message } = entry;
      const fact = { model: modelId(message), effort, servedTier: message.serviceTier ?? null };
      facts.messages.push(failedRequest(message) ? { ...fact, failed: true } : fact);
      for (const { id, call } of toolCallsOf(message)) {
        toolCalls.push(call);
        if (call.name === WEB_SEARCH_TOOL && id !== undefined) searches.set(id, call);
      }
    } else if (entry.type === 'message' && entry.message?.role === 'toolResult') {
      const search = searches.get(entry.message.toolCallId);
      if (search) search.resultUrls = resultUrls(entry.message);
    }
  }
  return toolCalls.length ? { ...facts, toolCalls } : facts;
}

// A web search query targets the benchmark repository when, outside its `-site:` exclusions, it names the repository,
// or names the owner without a repository and no exclusion removes the repository or its owner (see OWNER_MENTION).
// An exclusion removes them only when it covers the whole repository or the whole owner on GitHub: an exclusion of
// part of the repository, or of another site, leaves the repository in the search. A dot that ends a sentence is not
// part of a repository name.
function targetsBenchmark(query) {
  const repositoryName = (name) => (name === undefined ? undefined : name.replace(/\.+$/, '').toLowerCase());
  const mentions = (text) => [...text.matchAll(OWNER_MENTION)].map(([, name]) => repositoryName(name));
  const benchmark = (name) => BENCHMARK_REPOSITORY.names.has(name);
  const coversRepository = (site) => {
    const [host, ...path] = site.replace(/^https?:\/\//i, '').split('/');
    const parts = path.filter((part) => part !== '' && part !== '*').map((part) => part.toLowerCase());
    if (!GITHUB_WEB_HOSTS.has(host.toLowerCase()) || parts[0] !== BENCHMARK_REPOSITORY.owner) return false;
    return parts.length === 1 || (parts.length === 2 && benchmark(parts[1]));
  };
  const excluded = [...query.matchAll(SITE_EXCLUSION)].some(([, site]) => coversRepository(site));
  const kept = mentions(query.replace(SITE_EXCLUSION, ' '));
  return kept.some((name) => (name === undefined || name === '' ? !excluded : benchmark(name)));
}

// A line of the fixer reply: `<finding id>: repaired` or `<finding id>: not present` (see prepare.mjs fixerPrompt),
// maybe after a list marker and with the id in backticks.
const FIXER_REPLY = /^\s*(?:[-*+]\s+)?`?([^\s`:]+#\d+)`?\s*:\s*(repaired|not present)\b/i;
// An omp subagent gives its reply as the arguments of a call of this tool, under keys that the agent picks.
const REPLY_TOOL = 'yield';
// Each string in a JSON value, in order.
function stringsOf(value) {
  if (typeof value === 'string') return [value];
  return value && typeof value === 'object' ? Object.values(value).flatMap(stringsOf) : [];
}

// The fixer reply of a transcript: each finding id that the reply names, with `repaired` or `not present`; a later
// line of an id wins. The reply is each string in the arguments of the last `yield` call, or without such a call,
// the text of the last assistant message with text.
function fixerReplies(text, source) {
  let yielded;
  let said = [];
  for (const entry of transcriptEntries(text, source)) {
    if (entry.type !== 'message' || entry.message?.role !== 'assistant') continue;
    const content = Array.isArray(entry.message.content) ? entry.message.content : [];
    for (const item of content) {
      if (item?.type === 'toolCall' && item.name === REPLY_TOOL) yielded = item.arguments;
    }
    const texts = content.filter((item) => item?.type === 'text' && typeof item.text === 'string');
    if (texts.length) said = texts.map((item) => item.text);
  }
  const replies = {};
  for (const line of stringsOf(yielded ?? said).flatMap((value) => value.split('\n'))) {
    const match = FIXER_REPLY.exec(line);
    if (match) replies[match[1]] = match[2].toLowerCase();
  }
  return replies;
}

// The working directory of the session of a transcript, the plugin roots that the agent text of the session names,
// and the self-review agent files that it names. omp records the agent text in the system prompt (a string or a list
// of strings) of the `session_init` entry.
function transcriptSession(text, source) {
  let cwd = null;
  const pluginRoots = new Set();
  const agentFiles = new Set();
  for (const entry of transcriptEntries(text, source)) {
    if (entry.type === 'session' && cwd === null && typeof entry.cwd === 'string') cwd = entry.cwd;
    if (entry.type !== 'session_init') continue;
    const prompt = [entry.systemPrompt]
      .flat()
      .filter((part) => typeof part === 'string')
      .join('\n');
    for (const root of reviewerPluginRoots(prompt)) pluginRoots.add(root);
    for (const match of prompt.matchAll(SELF_REVIEW_AGENT_FILE)) agentFiles.add(instructionPath(match));
  }
  return { cwd, pluginRoots: [...pluginRoots], agentFiles: [...agentFiles] };
}

// The folder itself or a path below it.
function isUnder(folder, target) {
  const relative = path.relative(folder, target);
  return relative === '' || !(relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
}

// The input folders of a run, the folders that a reviewer may read with every path below them, the copy of the plan
// contract of the run, the plugin roots, the agent files of the reviewer, and the keys of the files that the case
// changes (see changedPathKeys). An input folder is the case folder, and the run folder or each round folder up to
// `round`. The tree copies are those of the rounds up to `round`. A reviewer with an agent file of its own is the
// self-review agent.
function scopeRules(runDir, round, pluginRoots, agentFiles, changedFiles) {
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
    contractCopy: path.join(runDir, CONTRACT_COPY),
    pluginRoots,
    agentFiles: agentFiles.map((file) => path.resolve(file)),
    selfReview: agentFiles.length > 0,
    changed: distinct(changedFiles.flatMap(changedPathKeys)),
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

// An input file of an input folder, the copy of the plan contract of the run, a reviewer agent file of a plugin root,
// or an agent file of the reviewer.
function fileAllowed(target, { inputDirs, contractCopy, pluginRoots, agentFiles }) {
  const dir = path.dirname(target);
  const name = path.basename(target);
  if (inputDirs.includes(dir) && (INPUT_FILES.has(name) || name.endsWith('.diff'))) return true;
  if (target === contractCopy || agentFiles.includes(target)) return true;
  return name.endsWith('-reviewer.md') && pluginRoots.some((root) => path.join(root, 'agents') === dir);
}

// The case-change rule of readScope compares an optional instruction read with the files that the case changes. It
// compares keys: paths from the skill folder name on, `<skill>/<rest>`. The key '' stands for every path.

// The keys of a repository path that the case changes. After `plugins/<plugin>/skills/`, the path `<a>/<b>/…` can be
// the skill `<a>`, or the skill `<b>` in the category folder `<a>`, so it gives both `<a>/<b>/…` and `<b>/…`. A key
// that does not start with the name of an instruction skill matches no read. The decision is lexical and
// conservative: a path with a glob counts as the folder before its first glob segment, and a path that ends with `/`
// or whose last segment has no `.` can be a folder. A folder that can hold skill folders gives '': `<a>` directly in
// `skills/` (it can be a category folder), `plugins/<plugin>/skills/`, and each folder above it. Other paths give no
// key.
function changedPathKeys(file) {
  const segments = path.posix
    .normalize(file)
    .split('/')
    .filter((segment) => segment && segment !== '.');
  const globAt = segments.findIndex((segment) => GLOB_CHARACTER.test(segment));
  if (globAt !== -1) segments.length = globAt;
  const folder = globAt !== -1 || file.endsWith('/') || !segments.at(-1)?.includes('.');
  const [top, , skills, ...rest] = segments;
  if (segments.length === 0 || (top === 'plugins' && segments.length < 3 && folder)) return [''];
  if (top !== 'plugins' || skills !== 'skills') return [];
  if (rest.length === 0 || (rest.length === 1 && folder)) return [''];
  return rest.length === 1 ? rest : [rest.join('/'), rest.slice(1).join('/')];
}

// Two keys overlap when they are equal or one is a folder above the other. So a read of a folder (for example a grep,
// or the folder before the first glob segment of a glob) overlaps each changed file under it, and a changed folder
// overlaps each read under it.
const keysOverlap = (a, b) => a === '' || b === '' || a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

// The key of the plan contract of a plugin root, or undefined for another path.
function contractKey(target, pluginRoots) {
  for (const root of pluginRoots) {
    const skills = path.join(root, 'skills');
    const contract = isUnder(skills, target) && PLAN_CONTRACT.exec(path.relative(skills, target));
    if (contract) return contract[1];
  }
  return undefined;
}

// The key of a path under the folder of an allowed skill in an installed plugin cache copy, or undefined for another
// path. The path as the reviewer wrote it must have no `..` segment.
function cacheKey(written, resolved) {
  return written.split('/').includes('..') ? undefined : CACHE_SKILL.exec(resolved)?.[1];
}

// The key of a `skill://` URI of an allowed skill, or undefined for another URI: `skill://<skill>` reads
// `<skill>/SKILL.md`, and `skill://<skill>/<rest>` reads `<skill>/<rest>`. A glob counts as the folder before its
// first glob segment. The skill name of the key comes after the `..` segments resolve, so a URI that leaves the
// folder of an allowed skill for another skill gives no key.
function skillUriKey(target) {
  const rest = target.slice(target.indexOf('://') + 3);
  const segments = rest.split('/').filter(Boolean);
  if (segments.length === 1) return ALLOWED_SKILLS.has(segments[0]) ? `${segments[0]}/SKILL.md` : undefined;
  const globAt = segments.findIndex((segment) => GLOB_CHARACTER.test(segment));
  if (globAt !== -1) segments.length = globAt;
  const key = path.posix.normalize(segments.join('/'));
  return ALLOWED_SKILLS.has(key.split('/')[0]) ? key : undefined;
}

// An optional instruction read with the key `key` is allowed when the case changes no file at that key. An undefined
// key is no optional instruction read.
function instructionAllowed(key, { changed }) {
  return key !== undefined && !changed.some((other) => keysOverlap(key, other));
}

// A read of an allowed skill through a `skill://` URI or an installed plugin cache copy, with the key `key` (undefined
// for another read). The self-review agent loads these skills as its own instructions, so its reads of them stay
// allowed also when the case changes them. For another reviewer, they are optional instruction reads.
function skillReadAllowed(key, rules) {
  return (rules.selfReview && key !== undefined) || instructionAllowed(key, rules);
}

// The folder of a path before its first glob segment (`base`), and the segments from that segment on (`rest`). A path
// without a glob segment is its own base and has no rest.
function globParts(target) {
  const segments = target.split('/');
  const globAt = segments.findIndex((segment) => GLOB_CHARACTER.test(segment));
  if (globAt === -1) return { base: target, rest: [] };
  const base = segments.slice(0, globAt).join('/') || (path.isAbsolute(target) ? path.sep : '.');
  return { base, rest: segments.slice(globAt) };
}

// A relative path resolves against the working directory, so without one it is outside. A glob is allowed when the
// folder before its first glob segment is allowed and no later segment can leave that folder with `..`.
function localPathAllowed(target, cwd, rules) {
  if (!path.isAbsolute(target) && typeof cwd !== 'string') return false;
  const { base, rest } = globParts(target);
  if (rest.length === 0) {
    const resolved = path.resolve(cwd ?? path.sep, target);
    if (folderAllowed(resolved, rules) || fileAllowed(resolved, rules)) return true;
    if (instructionAllowed(contractKey(resolved, rules.pluginRoots), rules)) return true;
    return skillReadAllowed(cacheKey(target, resolved), rules);
  }
  if (rest.some((segment) => segment.includes('..'))) return false;
  const resolvedBase = path.resolve(cwd ?? path.sep, base);
  return folderAllowed(resolvedBase, rules) || skillReadAllowed(cacheKey(base, resolvedBase), rules);
}

// A web page outside the benchmark repository. The pages of the repository can show the fixes of the corpus defects.
// A web page is allowed unless it can show the benchmark repository: a page of the repository on GitHub, or a page of
// any site whose host, path, or query names the owner and the repository, such as a mirror, a code search, or a GitHub
// search. A URL that a search result cut with `…`, or that cannot be parsed, is allowed unless its text names the
// owner, because its cut part can hold the repository name.
function webPageAllowed(target) {
  if (target.includes('…')) return !/docksdocks/i.test(target);
  let url;
  try {
    url = new URL(target);
  } catch {
    return !/docksdocks/i.test(target);
  }
  const parts = url.pathname
    .split('/')
    .filter(Boolean)
    .map((part) => part.toLowerCase());
  const benchmark = ([owner, name]) => owner === BENCHMARK_REPOSITORY.owner && BENCHMARK_REPOSITORY.names.has(name);
  if (REPOSITORY_HOSTS.has(url.hostname) && benchmark(parts)) return false;
  if (url.hostname === 'api.github.com' && parts[0] === 'repos' && benchmark(parts.slice(1))) return false;
  let text = `${url.hostname}${url.pathname}${url.search}`;
  try {
    text = decodeURIComponent(text);
  } catch {
    // Keep the encoded text: a bad escape cannot hide the plain owner and repository names.
  }
  return !/docksdocks\/docks(?:\.git)?(?![\w.-])/i.test(text);
}

const uriScheme = (target) => URI_SCHEME.exec(target)?.[1].toLowerCase();

function targetAllowed(target, cwd, rules) {
  const scheme = uriScheme(target);
  if (scheme === undefined) return localPathAllowed(target, cwd, rules);
  if (scheme === 'artifact') return true;
  if (scheme === 'skill') return skillReadAllowed(skillUriKey(target), rules);
  return WEB_SCHEMES.has(scheme) && webPageAllowed(target);
}

// A local path or an internal URI without its read selector, and a local path also without its JSON query selector; a
// web URL stays as it is.
const withoutSelector = (target) => {
  const scheme = uriScheme(target);
  if (WEB_SCHEMES.has(scheme)) return target;
  const read = scheme === undefined ? target.replace(JSON_QUERY_SELECTOR, '') : target;
  return read.replace(READ_SELECTOR, '');
};

// The targets of the `path` argument of a call of the tool `name`: for a tool whose path takes a list
// (PATH_LIST_TOOLS), its `;`-separated parts, else the whole path; each trimmed, with its read selector.
function pathTargets(name, value) {
  return (PATH_LIST_TOOLS.has(name) ? value.split(';') : [value]).map((part) => part.trim()).filter(Boolean);
}

// The parts of `text` between the delimiters that `delimiter` matches, outside `{}` and not after a backslash, as
// omp splits a delimited path list: each part trimmed, and empty parts left out. Null when `text` holds no such
// delimiter or holds only empty parts.
function splitPathList(text, delimiter) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '\\') index += 1;
    else if (character === '{') depth += 1;
    else if (character === '}') depth = Math.max(0, depth - 1);
    else if (depth === 0 && delimiter.test(character)) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  if (parts.length === 0) return null;
  parts.push(text.slice(start));
  const kept = parts.map((part) => part.trim()).filter(Boolean);
  return kept.length ? kept : null;
}

// The file of a local path as omp resolves it: `~` is the home folder, a bare `/` is the working directory, and a
// relative path resolves against the working directory. Null for a relative path without a working directory.
function ompFile(target, cwd) {
  if (target === '~' || target.startsWith('~/')) return path.join(os.homedir(), target.slice(1));
  if (/^\/+$/.test(target)) return cwd;
  if (path.isAbsolute(target)) return target;
  return typeof cwd === 'string' ? path.resolve(cwd, target) : null;
}

function ompPathExists(target, cwd) {
  const file = ompFile(target, cwd);
  return typeof file === 'string' && fs.existsSync(file);
}

// The paths that omp reads for the target `target` of a tool call (trimmed, with its read selectors) when it reads
// the target as a list of paths (see LIST_SPLITS), each with its read selector, or null when omp reads the target as
// one path. A target whose whole path exists, as written or without its read selector, is one path, also when it
// holds a delimiter: for example a file whose name holds a space or a `;`, or a workspace folder with a space.
function delimitedParts(target, cwd) {
  if (splitPathList(target, ANY_DELIMITER) === null) return null;
  if (uriScheme(target) !== undefined) {
    const parts = splitPathList(target, URI_DELIMITER);
    return parts !== null && parts.length > 1 && parts.every((part) => uriScheme(part) !== undefined) ? parts : null;
  }
  if (ompPathExists(target, cwd) || ompPathExists(target.replace(OMP_SELECTOR, ''), cwd)) return null;
  // omp reads `<file>?q=<filter>` as one file with a JSON query, also when the filter holds a delimiter.
  if (ompPathExists(target.replace(JSON_QUERY_SELECTOR, ''), cwd)) return null;
  const exists = (part) => {
    const scheme = uriScheme(part);
    if (scheme !== undefined) return !WEB_SCHEMES.has(scheme);
    return ompPathExists(globParts(part.replace(OMP_SELECTOR, '')).base, cwd);
  };
  for (const { delimiter, existing } of LIST_SPLITS) {
    const parts = splitPathList(target, delimiter);
    if (parts === null) continue;
    if (existing === 'none' || (existing === 'some' ? parts.some(exists) : parts.every(exists))) return parts;
  }
  return null;
}

// The paths of a list that omp read for a `read` call, from the details of its tool result, or null when the result
// records no list. omp records each path of the list in `displayReadTargets` (for a path that a unique suffix match
// resolved, the path that it found), and writes a note `Could not read <path>: <reason>` for each path that it could
// not read. Such a path read no file, so it is not in the result.
function recordedParts(details) {
  if (!Array.isArray(details?.displayReadTargets)) return null;
  const notes = Array.isArray(details.notes) ? details.notes.filter((note) => typeof note === 'string') : [];
  const unread = (part) => notes.some((note) => note.startsWith(`${UNREAD_NOTE}${part}: `));
  return details.displayReadTargets
    .filter((part) => typeof part === 'string')
    .map((part) => part.trim())
    .filter((part) => part && !unread(part));
}

// The tool calls of the assistant messages of a transcript, in order, and the tool result message of each call, by the
// id of the call (its `toolCallId`). readLists and diffCoverage read them.
function toolCallResults(text, source) {
  const calls = [];
  const results = new Map();
  for (const entry of transcriptEntries(text, source)) {
    const message = entry.type === 'message' ? entry.message : undefined;
    if (message?.role === 'assistant' && Array.isArray(message.content)) {
      calls.push(...message.content.filter((item) => item?.type === 'toolCall'));
    } else if (message?.role === 'toolResult' && typeof message.toolCallId === 'string') {
      results.set(message.toolCallId, message);
    }
  }
  return { calls, results };
}

// The list targets of the tool calls `calls` of a transcript: a map from each target (see pathTargets) that omp read
// as a list of paths to these paths, each without its read selector. A relative path stays relative, and readScope
// resolves it against the working directory `cwd` of the session, as omp did. For a `read` call whose tool result (in
// `results`, see toolCallResults) records a list, the tool result decides, because it shows what omp read (see
// recordedParts). For every other call, the files decide as they decided for omp (see delimitedParts); readLists
// checks them when it runs, after the session. Without a record, readLists cannot see which paths omp could not read,
// so each path of the split counts. When two calls give paths for the same target, the map keeps the paths of both.
function readLists({ calls, results }, cwd) {
  const lists = new Map();
  for (const call of calls) {
    const value = call.arguments?.path;
    if (typeof value !== 'string') continue;
    const recorded = call.name === 'read' ? recordedParts(results.get(call.id)?.details) : null;
    for (const target of pathTargets(call.name, value)) {
      const parts = recorded ?? delimitedParts(target, cwd);
      if (parts !== null) lists.set(target, distinct([...(lists.get(target) ?? []), ...parts.map(withoutSelector)]));
    }
  }
  return lists;
}

// The own diff of a reviewer in `folder`, the folder of the inputs of its round, by the name of the reviewer (see
// prepare.mjs ARMS and buildTail): the focus diff of a panel lens, also of a self-review lens; the full diff of a full
// review, also of the self-review of the full diff; and the delta diff of a delta review. A plan reviewer has none.
function ownDiffFile(reviewer, folder) {
  const lens = reviewer.startsWith(`${SELF_REVIEW}-`) ? reviewer.slice(SELF_REVIEW.length + 1) : reviewer;
  if (PANEL_LENSES.has(lens)) return path.join(folder, `focus-${lens}.diff`);
  if (reviewer === 'full' || reviewer === SELF_REVIEW) return path.join(folder, 'full.diff');
  return reviewer === 'delta' ? path.join(folder, 'delta.diff') : null;
}

// The lines of a text as omp counts them in `totalLines`: the last newline ends the last line and starts no line.
function textLines(text) {
  if (text === '') return [];
  const lines = text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  return lines;
}

// The line numbers from `start` to `end`; none when `end` is before `start`.
const lineSpan = (start, end) => Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);

// The read selector of the read target `target` when the target names the file `file` (an absolute path): '' for a
// target without a selector, else the selector as omp parses it (see OMP_SELECTOR). Null for a target that names
// another file, and for a URI. A relative target resolves against the working directory `cwd`, as omp resolves it.
function selectorOfRead(target, file, cwd) {
  if (uriScheme(target) !== undefined) return null;
  const selector = OMP_SELECTOR.exec(target)?.[0] ?? '';
  const read = ompFile(target.slice(0, target.length - selector.length), cwd);
  return read !== null && path.resolve(read) === file ? selector : null;
}

// The lines that the read selector `selector` names in a file whose last line is `last`, as [start, end] ranges up to
// `last`, by the selector grammar of omp (omp://tools/read.md): no selector and `:raw` alone name every line; `:A-B`
// and `:A..B` name A to B; `:A+C` names C lines from A; `:A`, `:A-`, and `:A..` name A to the last line; `:-N` names
// the last N lines; and a comma list joins its parts, in which a bare `A` is the single line A. A `:raw` before or
// after the lines changes no line, but omp reads a lone bare `A` with `:raw` as the single line A. `:img` and
// `:conflicts` show no line of the file.
function selectorRanges(selector, last) {
  const lower = selector.toLowerCase();
  const raw = lower.startsWith(':raw') || lower.endsWith(':raw');
  const lines = lower.replace(/^:raw(?=:|$)/, '').replace(/:raw$/, '');
  if (lines === '') return [[1, last]];
  if (lines === ':img' || lines === ':conflicts') return [];
  const parts = lines.slice(1).split(/,:?/);
  return parts.map((part) => {
    const [, tail, start, count, from, to, single] = LINE_PART.exec(part.replaceAll('l', ''));
    if (tail !== undefined) return [Math.max(1, last - Number(tail) + 1), last];
    if (start !== undefined) return [Number(start), Math.min(last, Number(start) + Number(count) - 1)];
    if (from !== undefined) return [Number(from), to === undefined ? last : Math.min(last, Number(to))];
    return [Number(single), parts.length > 1 || raw ? Math.min(last, Number(single)) : last];
  });
}

// The lines of a file with the lines `lines` (see textLines) that the details `details` of the tool result of a read
// call with the selector `selector` give as shown whole, as line numbers. The line numbers of the rows that omp showed
// decide when the result has them (`displayContent.lineNumbers`, without the rows that show no line, such as an
// elision row): they hold the context lines that omp adds around a range, also outside the shown range of a cut
// output. Else the shown range decides when omp cut the output, else the selector decides (see selectorRanges), up to
// the `totalLines` of the result, or up to the last line of the file when the result has no totalLines (omp gives
// neither for a raw comma list). omp cuts a line of a read that is not raw after `maxColumn` characters (JavaScript
// string length) and then records `meta.limits.columnTruncated`; a line longer than that limit shows cut, so it is
// not shown whole.
function resultLines(details, selector, lines) {
  const rows = details?.displayContent?.lineNumbers;
  const shown = details?.meta?.truncation?.shownRange;
  const total = details?.totalLines;
  let numbers;
  if (Array.isArray(rows)) numbers = rows.filter(Number.isInteger);
  else {
    const ranges =
      Number.isInteger(shown?.start) && Number.isInteger(shown?.end)
        ? [[shown.start, shown.end]]
        : selectorRanges(selector, Number.isInteger(total) ? total : lines.length);
    numbers = ranges.flatMap(([start, end]) => lineSpan(start, end));
  }
  const maxColumn = details?.meta?.limits?.columnTruncated?.maxColumn;
  const whole = (line) => !Number.isInteger(maxColumn) || lines[line - 1].length <= maxColumn;
  return numbers.filter((line) => line >= 1 && line <= lines.length && whole(line));
}

// The lines of a file with the lines `lines` (see textLines) that the text `content` of the tool result of a read that
// omp read as a list of paths showed whole, as line numbers. omp records no details of a path of a list: it writes its
// note `Note: interpreted as <n> paths: <paths>` and then the output of each path after a blank line, without a header
// and without line numbers. The output of a path that omp cut ends with a blank line and the footer row
// `[Showing lines A-B of N. ...]` (see RANGE_FOOTER): A to B is its shown range, with the context lines of a range.
// The rows of lines A to B come before the footer in order, and omp can add outline rows, each after an elision row
// `…`, before and after them. So a footer whose N is the number of lines of the file shows lines A to B when the rows
// of its output (after the row that ends the output before it, see OUTPUT_END) hold rows of lines A to B in order. A
// row that is the line shows it whole. A row that is the first `maxColumn` characters of the line and `…`, where the
// footer has `Some lines truncated to <maxColumn> chars`, shows it cut, so the line does not count. An output without
// such a footer (of a comma list, or of a range up to the last line of the file) gives no line numbers, so it shows no
// line: an undercount is safer than a count of lines that omp may not have shown.
function listResultLines(content, lines) {
  const rows = (Array.isArray(content) ? content : [])
    .filter((item) => item?.type === 'text' && typeof item.text === 'string')
    .flatMap((item) => item.text.split('\n'));
  const numbers = [];
  let outputStart = 0;
  rows.forEach((row, index) => {
    if (!OUTPUT_END.test(row)) return;
    const [start, end, total] = (RANGE_FOOTER.exec(row)?.slice(1) ?? []).map(Number);
    if (total === lines.length && start >= 1 && start <= end && end <= total) {
      const range = lines.slice(start - 1, end);
      const maxColumn = Number(COLUMN_FOOTER.exec(row)?.[1]);
      const shows = (line, shownRow) =>
        shownRow === line || (line.length > maxColumn && shownRow === `${line.slice(0, maxColumn)}…`);
      for (let first = index - range.length; first >= outputStart; first -= 1) {
        if (!range.every((line, offset) => shows(line, rows[first + offset]))) continue;
        range.forEach((line, offset) => {
          if (rows[first + offset] === line) numbers.push(start + offset);
        });
        break;
      }
    }
    outputStart = index + 1;
  });
  return numbers;
}

// The lines of the file `file` (an absolute path; `lines` are its lines, see textLines) that the tool results of the
// `read` calls of `calls` showed, as a set of line numbers. A read call counts when its path without the read
// selector names the file (see selectorOfRead), and its tool result gives its lines (see resultLines). A read that omp
// read as a list of paths (as readLists finds them: the paths of the result, see recordedParts, else the paths of the
// delimiters, see delimitedParts) counts when a path of the list names the file, and the text of its result gives its
// lines (see listResultLines). A call without a tool result, a result with an error, a read of another file, and a
// call of another tool, for example a grep of the file, show no line of it. `calls` and `results` come from
// toolCallResults, and `cwd` is the working directory of the session.
function shownLines({ calls, results }, file, lines, cwd) {
  const shown = new Set();
  for (const call of calls) {
    const value = call.arguments?.path;
    if (call.name !== 'read' || typeof value !== 'string') continue;
    const result = results.get(call.id);
    if (result === undefined || result.isError === true) continue;
    const target = value.trim();
    const parts = recordedParts(result.details) ?? delimitedParts(target, cwd);
    let numbers = [];
    if (parts === null) {
      const selector = selectorOfRead(target, file, cwd);
      if (selector !== null) numbers = resultLines(result.details, selector, lines);
    } else if (parts.some((part) => selectorOfRead(part, file, cwd) !== null)) {
      numbers = listResultLines(result.content, lines);
    }
    for (const line of numbers) shown.add(line);
  }
  return shown;
}

// The file sections of the diff lines `lines`: each from a `diff --git` line up to the next one or the end, as
// [start, end] pairs of 0-based indexes, with `end` after the last line of the section.
function diffSections(lines) {
  const starts = [];
  lines.forEach((line, index) => {
    if (line.startsWith('diff --git ')) starts.push(index);
  });
  return starts.map((start, index) => [start, starts[index + 1] ?? lines.length]);
}

// The lines that the focus diff with the lines `focusLines` and the full diff with the lines `fullLines` share, as
// [focus diff line, full diff line] pairs of line numbers. Each file section of the focus diff (see diffSections) maps
// line for line to the first section of the full diff with the same `diff --git` line and the same lines; a section
// without such a section in the full diff maps no line. prepare.mjs writes a focus diff as the diff of a part of the
// changed files, so each of its sections is also a section of the full diff.
function sharedSectionLines(focusLines, fullLines) {
  const byHeader = new Map();
  for (const [start, end] of diffSections(fullLines)) {
    const header = fullLines[start];
    if (!byHeader.has(header)) byHeader.set(header, []);
    byHeader.get(header).push([start, end]);
  }
  const pairs = [];
  for (const [start, end] of diffSections(focusLines)) {
    const length = end - start;
    const same = ([fullStart, fullEnd]) =>
      fullEnd - fullStart === length &&
      focusLines.slice(start, end).every((line, k) => line === fullLines[fullStart + k]);
    const match = byHeader.get(focusLines[start])?.find(same);
    if (match) for (let k = 0; k < length; k += 1) pairs.push([start + k + 1, match[0] + k + 1]);
  }
  return pairs;
}

// The read coverage of a reviewer: the share of the lines of its own diff `file` (an absolute path, see ownDiffFile)
// that the tool results of its `read` calls showed (see shownLines), as an exact ratio from 0 to 1, not rounded. A
// focus diff (`focus-<lens>.diff`, the own diff of a panel lens or a self-review lens) holds sections of `full.diff` in
// the same folder, which the lens can read there. So a line of a focus diff also counts when the reads of that full
// diff showed the same line of the same file section (see sharedSectionLines). A line that several reads showed
// counts once. The result is null when the file does not exist or has no line. `tools` comes from toolCallResults,
// and `cwd` is the working directory of the session.
function diffCoverage(tools, file, cwd) {
  if (!fs.existsSync(file)) return null;
  const lines = textLines(fs.readFileSync(file, 'utf8'));
  if (lines.length === 0) return null;
  const shown = shownLines(tools, file, lines, cwd);
  const full = path.join(path.dirname(file), 'full.diff');
  if (path.basename(file).startsWith('focus-') && fs.existsSync(full)) {
    const fullLines = textLines(fs.readFileSync(full, 'utf8'));
    const fullShown = shownLines(tools, full, fullLines, cwd);
    for (const [line, fullLine] of sharedSectionLines(lines, fullLines)) if (fullShown.has(fullLine)) shown.add(line);
  }
  return shown.size / lines.length;
}

// The reviewers run in the live checkout, which holds the fixes of the corpus defects, so a reviewer that reads a
// file outside the inputs of its run can see a fix. readScope gives the targets of the tool calls that are outside,
// each once, in call order: a target as the reviewer wrote it without the read selector, and a list target (see below)
// as the reviewer wrote it. `runDir` is `<ws>/<case>/<arm folder>/run-<k>`; `round` is the number of a round folder,
// or undefined for a run without round folders; `cwd` is the working directory of the session (null when unknown);
// `pluginRoots` are the plugin roots that the agent text names; `agentFiles` are the agent files that the agent text
// names as its own (the self-review agent has no plugin root). The function reads no file. A target is allowed when it
// is:
// - under an input of the run: `snapshot/`, `prompts/`, a `*.diff` file, `plan.md`, `previous-review.md`, or
//   `rejection.md` in the case folder, and in the run folder or in each round folder up to `round`;
// - the copy `plan-contract.md` of the plan contract in the run folder, which the prompt of a run of a variant with a
//   contract overlay names as its plan contract. It is an input of the run, so the case-change rule does not apply to
//   it;
// - under the tree copy of the judge for a round of the run up to `round`;
// - an instruction file of the reviewer: `<root>/agents/<name>-reviewer.md`, a path under the code-reviewer or
//   plan-reviewer skill folder of a plugin root, or a file of `agentFiles`. For the self-review agent (a reviewer with
//   `agentFiles`), also a read of the code-review or code-clarity skill as below, because it loads these two skills as
//   its own instructions. The reviewer cannot work without these files, so they stay allowed also when the case
//   changes them;
// - an optional instruction read, when the case changes no file at its key (see below): the plan contract
//   `<root>/skills/[<folder>/]plan-manager/references/plan-contract.md` of a plugin root (the plan-reviewer checklist
//   tells the reviewer to read it in its own plugin); a path under the folder of the code-review or code-clarity skill
//   in an installed plugin cache copy, `<any>/plugins/cache/plugins/<plugin dir>/skills/[<folder>/]<skill>/`, without
//   a `..` segment (a `skill://` URI of these skills can resolve to this copy); or a `skill://` URI of one of these two
//   skills;
// - an `artifact://` URI (the spilled output of the reviewer);
// - an http or https URL that cannot show the benchmark repository (see webPageAllowed).
// Every other target is outside, also the other skills of the repository that holds a plugin root: the reviewed
// repository has its own copy of them under `snapshot/`. A `skill://` URI or a plugin cache copy of the code-reviewer
// or plan-reviewer skill is outside for every reviewer: it resolves to the installed version of the skill, which can be
// another version than the reviewer skill of the arm. A grep, glob, find, or ast_grep call without a path searches the
// working directory, so it gives the outside target `<name> without a path`; other calls without a path read no file.
// The path of a grep, glob, or ast_grep call is a `;`-separated list of targets; the path of every other tool is one
// target, also when it holds a `;`. When no file or folder has the path of a target, omp can read it as a list of
// paths. `lists` maps each target that omp read as a list to these paths, each without its read selector
// (transcriptsCommand gives it, see readLists); a list target is allowed when each of these paths is allowed. Every
// other target is one path.
// A web search has no path: `queries` lists its queries, each once, in call order. A query that targets the benchmark
// repository (see targetsBenchmark) gives the outside target `web_search: <query>`, and each cited URL of its result
// that webPageAllowed refuses gives `web_search result: <url>`. A reviewer without a web search gets no `queries`.
// A local path also loses its JSON query selector (`?q=`), because omp reads the file before it.
// The reviewer setup is newer than the cases. When a case changes the file of an optional instruction read, that read
// shows a later version of a file under review, which can show the fix. `changedFiles` are the repository paths that
// the case changes (transcriptsCommand reads them). The rule compares keys, the paths from the skill folder name on:
// the plan contract gives `plan-manager/references/plan-contract.md`, a cache path gives `<skill>/<rest>`,
// `skill://<skill>` gives `<skill>/SKILL.md`, `skill://<skill>/<rest>` gives `<skill>/<rest>`, and changedPathKeys
// gives the keys of a changed path. A read is outside when its key overlaps the key of a changed path (see
// keysOverlap). A glob gives the key of the folder before its first glob segment, so a glob that could match a changed
// file is outside.
export function readScope(
  toolCalls,
  { runDir, round, cwd = null, pluginRoots = [], agentFiles = [], changedFiles = [], lists = new Map() },
) {
  const rules = scopeRules(path.resolve(runDir), round, pluginRoots, agentFiles, changedFiles);
  const outside = new Set();
  const queries = new Set();
  for (const { name, path: value, query, resultUrls: cited = [] } of toolCalls) {
    if (name === WEB_SEARCH_TOOL) {
      if (typeof query === 'string') {
        queries.add(query);
        if (targetsBenchmark(query)) outside.add(`${WEB_SEARCH_TOOL}: ${query}`);
      }
      for (const url of cited) if (!webPageAllowed(url)) outside.add(`${WEB_SEARCH_TOOL} result: ${url}`);
      continue;
    }
    if (typeof value !== 'string' || !value.trim()) {
      if (SEARCH_TOOLS.has(name)) outside.add(`${name} without a path`);
      continue;
    }
    for (const target of pathTargets(name, value)) {
      const parts = lists.get(target);
      if (parts !== undefined) {
        if (!parts.every((part) => targetAllowed(part, cwd, rules))) outside.add(target);
        continue;
      }
      const read = withoutSelector(target);
      if (!targetAllowed(read, cwd, rules)) outside.add(read);
    }
  }
  return queries.size ? { outside: [...outside], queries: [...queries] } : { outside: [...outside] };
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

// The paths that a diff changes, from its header lines. prepare.mjs writes each diff with --no-renames, so the two
// sides of a `diff --git` line name one path, and the line splits in its middle also when the path holds ` b/`. A
// `+++ b/` line counts only in the header of a file, before its first `@@` line, because a line of a hunk can start
// with `++`.
function diffFiles(text) {
  const files = [];
  let header = false;
  for (const line of text.split('\n')) {
    if (line.startsWith(DIFF_GIT)) {
      header = true;
      const sides = line.slice(DIFF_GIT.length);
      const half = (sides.length - 1) / 2;
      const [a, b] = [sides.slice(0, half), sides.slice(half + 1)];
      if (a.startsWith('a/') && b === `b/${a.slice(2)}`) files.push(a.slice(2));
    } else if (line.startsWith('@@')) {
      header = false;
    } else if (header && line.startsWith(DIFF_NEW)) {
      files.push(line.slice(DIFF_NEW.length));
    }
  }
  return distinct(files);
}

// The paths in the Files cells of the Steps table of a plan export, as the plan helper reads the table. A cell holds
// comma-separated paths, each maybe in backticks. The function also splits a cell on white space, so two paths without
// a comma between them give two paths. The helper finds no Files cell in a Steps row that does not have 8 cells, so the
// function stops on such a row.
function planStepFiles(file) {
  const text = readText(file, CHANGED_FILES_HINT);
  let plan;
  try {
    plan = parsePlan(text);
  } catch (error) {
    fail(`${file}: ${error.message}`);
  }
  if (plan.malformedSteps.length) {
    fail(
      `${file}: a row of the Steps table does not have 8 cells, so its Files cell is not known${CHANGED_FILES_HINT}`,
    );
  }
  return distinct(
    plan.steps.flatMap((step) =>
      step.files
        .split(/[\s,]+/)
        .map((part) => part.replace(/^`+|`+$/g, ''))
        .filter(Boolean),
    ),
  );
}

// The repository paths that the case of a reviewer changes, for the case-change rule of readScope: for a plan or
// plan-delta case, the Files cells of the Steps table of the plan export; for a run with round folders, the paths of
// the full.diff of the round (round 1 reviews the full.diff of the case folder); for a single-review code run, the
// paths of each diff file of the case folder. `dir` is the run folder or the round folder of the reviewer.
function caseChangedFiles(caseDir, family, round, dir) {
  if (family === 'plan') return planStepFiles(path.join(caseDir, 'plan.md'));
  const diffs =
    round === undefined
      ? distinct(['full', ...baseNames(caseDir, '.diff')]).map((name) => path.join(caseDir, `${name}.diff`))
      : [path.join(round === 1 ? caseDir : dir, 'full.diff')];
  return distinct(diffs.flatMap((file) => diffFiles(readText(file, CHANGED_FILES_HINT))));
}

// The fields of a finding that the judge reads in pairs.json. A finding id names a place in a block, not a text, so a
// reviewer that is dispatched again can give an id another text.
const JUDGED_FIELDS = ['severity', 'category', 'locator', 'text'];
// The files of the judge answers, by finding: the answers of the first judge and of the second judge.
const JUDGMENT_FILES = ['judgments.json', 'judgments-second.json'];
// The fields of a judgment file whose entries answer one finding each.
const ANSWER_FIELDS = ['matches', 'adjudications', 'reargued'];

// The answers of a judge hold for the text that the judge read. A finding of `previous` that `current` does not have,
// or whose judged fields changed, is stale: the function removes each `matches`, `adjudications`, and `reargued`
// entry of its blind id from each judgment file of `ws` that exists. It returns the stable ids of the stale findings
// that had an answer, in `previous` order.
function removeStaleAnswers(ws, previous, current) {
  const judgedText = (finding) => JSON.stringify(JUDGED_FIELDS.map((field) => finding[field] ?? null));
  const now = new Map(current.map((finding) => [finding.id, judgedText(finding)]));
  // The stable id of each stale finding, by its blind id, which the judgment files use.
  const stale = new Map();
  for (const finding of previous) {
    if (now.get(finding.id) !== judgedText(finding)) stale.set(finding.blind, finding.id);
  }
  if (stale.size === 0) return [];
  const removed = new Set();
  for (const name of JUDGMENT_FILES) {
    const file = path.join(ws, name);
    if (!fs.existsSync(file)) continue;
    const judgments = readJson(file);
    let changed = false;
    for (const field of ANSWER_FIELDS) {
      if (!Array.isArray(judgments[field])) continue;
      const staleEntries = judgments[field].filter((entry) => stale.has(entry.finding));
      if (staleEntries.length === 0) continue;
      for (const entry of staleEntries) removed.add(stale.get(entry.finding));
      judgments[field] = judgments[field].filter((entry) => !stale.has(entry.finding));
      changed = true;
    }
    if (changed) writeJson(file, judgments);
  }
  return [...stale.values()].filter((id) => removed.has(id));
}

// Writes findings.json and returns its content with `removed`: before it writes, it compares each finding with the
// previous findings.json and removes the judge answers of each stale finding (see removeStaleAnswers). `removed` lists
// the stable ids of these findings.
export function findingsCommand(ws) {
  const file = path.join(ws, 'findings.json');
  const previous = fs.existsSync(file) ? readJson(file) : {};
  const doc = collectFindings(ws);
  const removed = removeStaleAnswers(ws, previous.findings ?? [], doc.findings);
  writeJson(file, doc);
  return { ...doc, removed };
}

export function pairsCommand(ws, casesDir, { keys } = {}) {
  const findingsDoc = readJson(path.join(ws, 'findings.json'), '; run score.mjs findings first');
  const cases = {};
  for (const caseId of new Set(findingsDoc.blocks.map((block) => block.case))) {
    const { split } = readJson(path.join(ws, caseId, 'case.json'));
    const { kind, known, protected: decisions } = readKnown(casesDir, caseId, split, keys);
    cases[caseId] = { kind, known, protected: decisions, split };
  }
  const doc = buildPairs(findingsDoc, cases);
  writeJson(path.join(ws, 'pairs.json'), doc);
  return doc;
}

// A key that changed after `pairs` would score the runs against an old list of known defects or protected decisions.
function requireCurrentKeys(pairsDoc, keys) {
  const ids = (items) =>
    items
      .map((item) => item.id)
      .sort(compare)
      .join(', ') || 'none';
  for (const entry of pairsDoc.cases) {
    const key = readKeyFile(keys, entry.case);
    if (key === undefined) continue;
    if (ids(key.known) !== ids(entry.known)) {
      fail(
        `pairs.json is out of date for ${entry.case}: its key has ${ids(key.known)}, but pairs.json has ${ids(entry.known)}; run score.mjs pairs again`,
      );
    }
    // A pairs.json of an earlier version has no protected decisions.
    const paired = entry.protected ?? [];
    if (ids(key.protected) !== ids(paired)) {
      fail(
        `pairs.json is out of date for ${entry.case}: its key has the protected decisions ${ids(key.protected)}, but pairs.json has ${ids(paired)}; run score.mjs pairs again`,
      );
    }
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

// Writes report.md. It stops before it writes when a key under `keys` changed after `pairs`, when a candidate pair or
// a protected pair has no answer, or when a finding has neither a `match` answer nor an adjudication.
// `<ws>/judgments-second.json`, when it exists, gives the agreement.
// `configs` or `arms` sets the columns of the comparison tables, `reference` (with `arms` only) sets the column that
// the intervals compare with, and `lead` with `leadRef` adds the self-review lead (see renderReport).
export function reportCommand(ws, { keys, configs, arms, reference, lead, leadRef } = {}) {
  if (reference !== undefined) {
    if (!reference) fail('report --reference needs the name of an arm folder of --arms');
    if (!arms) fail('report takes --reference only with --arms');
    if (!arms.includes(reference)) fail(`report --reference names ${reference}, which is not in --arms`);
  }
  const findings = readJson(path.join(ws, 'findings.json'), '; run score.mjs findings first');
  const pairs = readJson(path.join(ws, 'pairs.json'), '; run score.mjs pairs first');
  const judgments = loadJudgments(ws);
  if (keys) requireCurrentKeys(pairs, keys);
  const scores = scoreRuns({ findings, pairs, judgments, metas: readMetas(ws, findings.blocks) });
  requireJudgedFindings(findings.findings, judgments);
  const secondFile = path.join(ws, 'judgments-second.json');
  if (fs.existsSync(secondFile)) scores.agreement = judgeAgreement(judgments, readJson(secondFile));
  fs.writeFileSync(path.join(ws, 'report.md'), renderReport(scores, { configs, arms, reference, lead, leadRef }));
  return scores;
}

// The prompts that the operator still dispatches, each with its task name. A fixer prompt stays in the list only until
// the fixer writes `fixer-1.patch` (an empty patch file counts), so that the operator does not dispatch it again; a
// second dispatch writes a newer transcript of the same name, which `transcripts` then takes. `transcripts` uses every
// dispatch, so it still finds the transcript of a fixer whose patch exists.
export function namesCommand(ws) {
  return promptedDispatches(ws)
    .filter(({ fixer, dir }) => !fixer || !fs.existsSync(path.join(dir, FIXER_DIR, `${FIXER_NAME}.patch`)))
    .map(({ prompt, name }) => ({ prompt: path.relative(ws, prompt), name }));
}

// Fills the meta.json of each run or round folder from the transcripts of its dispatches and keeps every other field.
// The transcript of a dispatch is the latest repeat of its name (see pickTranscript) among the transcripts whose task
// names a path under the case folder of the dispatch in `ws`. Each prompt of prepare.mjs names such a path, and two
// workspaces that one session dispatches can use the same dispatch names.
// A reviewer entry under `reviewers` gets the time and tokens of the assistant messages of the configured model
// (`config.model`; every model without a configuration) and the transcript facts. When the reviewer called tools, it
// also gets `readScope` (see readScope) for the working directory and the plugin roots that its transcript shows, for
// the targets that omp read as lists of paths (see readLists), and for the files that its case changes (see
// caseChangedFiles); the command stops when an input that names these files is missing. A reviewer with an own diff
// (see ownDiffFile) also gets `diffCoverage`, the share of the lines of that diff that its read results showed (see
// diffCoverage). Its own diff is in the case folder for a run without round folders and for round 1 of a loop, and in
// the round folder for a later round, as prepare.mjs writes them. A reviewer whose own diff does not exist or has no
// line gets no `diffCoverage`. The fixer entry of a round, under `fixer.agents`, gets the time and tokens of every
// assistant message and the transcript facts, which `report` checks against the fixer setting of the loop (see
// invalidReasons). A round has one fixer, so `fixer.seconds` and `fixer.tokens` are its time and tokens, and
// `fixer.replies` maps each finding id that the fixer reply names to `repaired` or `not present` (see fixerReplies; no
// field when the reply names no finding). meta.json keeps no tool calls. The command checks every dispatch name before
// it writes, writes what it finds, then fails with the names of the dispatches that have no transcript.
export function transcriptsCommand(ws, sessionsDir) {
  const files = transcriptFiles(sessionsDir);
  const wsDir = path.resolve(ws);
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
    // The case changes the same files for each reviewer of the folder, so the command reads them once, when needed.
    let changedFiles;
    for (const { caseId, family, arm, run, round, reviewer, name, fixer } of dispatches) {
      const caseFolder = path.join(wsDir, caseId);
      const file = pickTranscript(files, name, (candidate) => namesPathUnder(transcriptTask(candidate), caseFolder));
      if (!file) {
        missing.push(name);
        continue;
      }
      const text = fs.readFileSync(file, 'utf8');
      const { toolCalls, ...facts } = transcriptFacts(text, file);
      if (fixer) {
        const agent = { ...parseTranscript(text, file), ...facts };
        const replies = fixerReplies(text, file);
        meta.fixer = {
          ...meta.fixer,
          seconds: agent.seconds,
          tokens: agent.tokens,
          agents: { [reviewer]: agent },
          replies,
        };
        if (Object.keys(replies).length === 0) delete meta.fixer.replies;
      } else {
        meta.reviewers ??= {};
        const entry = { ...meta.reviewers[reviewer], ...parseTranscript(text, file, meta.config?.model), ...facts };
        // The read scope and the read coverage come from this transcript only: a transcript without tool calls read no
        // file.
        delete entry.readScope;
        delete entry.diffCoverage;
        const session = transcriptSession(text, file);
        const tools = toolCallResults(text, file);
        if (toolCalls) {
          const caseDir = path.join(ws, caseId);
          changedFiles ??= caseChangedFiles(caseDir, family, round, dir);
          const runDir = path.join(caseDir, arm, run);
          const lists = readLists(tools, session.cwd);
          entry.readScope = readScope(toolCalls, { runDir, round, changedFiles, ...session, lists });
        }
        const ownDiff = ownDiffFile(reviewer, round === undefined || round === 1 ? caseFolder : path.resolve(dir));
        const coverage = ownDiff === null ? null : diffCoverage(tools, ownDiff, session.cwd);
        if (coverage !== null) entry.diffCoverage = coverage;
        meta.reviewers[reviewer] = entry;
      }
      updated.push(name);
      changed = true;
    }
    if (changed) writeJson(metaFile, meta);
  }
  if (missing.length) {
    fail(`no transcript under ${sessionsDir} whose task names its case folder in ${wsDir} for: ${missing.join(', ')}`);
  }
  return updated;
}

// A comma-separated list of names; undefined without a value.
const nameList = (value) =>
  value
    ?.split(',')
    .map((name) => name.trim())
    .filter(Boolean);

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
      const { blocks, findings, removed } = findingsCommand(ws);
      const missing = blocks.filter((block) => block.verdict === 'missing').length;
      const unreadable = blocks.filter((block) => block.verdict === 'unreadable').length;
      const lines = [
        `findings.json: ${findings.length} findings in ${blocks.length} blocks (${missing} missing, ${unreadable} unreadable)`,
      ];
      if (removed.length) {
        lines.push(
          `removed the judge answers of ${removed.length} findings whose text changed or that are gone: ${removed.join(', ')}`,
        );
      }
      return lines.join('\n');
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
    optional: ['--keys', '--configs', '--arms', '--reference', '--lead', '--lead-ref'],
    run: (ws, options) => {
      const scores = reportCommand(ws, {
        keys: options['--keys'],
        configs: nameList(options['--configs']),
        arms: nameList(options['--arms']),
        reference: options['--reference'],
        lead: nameList(options['--lead']),
        leadRef: options['--lead-ref'],
      });
      return `report.md: ${scores.runs.length} runs`;
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
