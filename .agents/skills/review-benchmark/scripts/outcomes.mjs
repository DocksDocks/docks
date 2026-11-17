#!/usr/bin/env node
// outcomes.mjs lists the post-merge outcome of each closed plan issue of a repository: its landing pull request, the
// reverts of that pull request, and the follow-up defects that cite the pull request or the plan.
//
//   node outcomes.mjs --repo <owner/repo> [--json]
//
// The counts are a heuristic over titles, bodies, labels, and commit messages, so read the listed items before you
// use a count. ../SKILL.md (Outcomes) describes the rules. The script needs the GitHub CLI `gh` with read access.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const LIST_LIMIT = '1000';
const MAX_OUTPUT = 256 * 1024 * 1024;
// A revert names this word in its title, body, or commit message.
const REVERT_MARKER = /\brevert/i;
// A follow-up defect has a label with one of these words, or a title with one of these words or a `fix:` prefix.
const DEFECT_LABEL = /bug|fix|regression/i;
const DEFECT_TITLE = /\b(?:fix(?:es|ed)?|bug|regression|hotfix|broken)\b|^fix(?:\([^)]*\))?!?:/i;
// The follow-up issue of unreached LOW findings (plan-contract.md, Round ceiling) holds this marker.
const UNREACHED_MARKER = /\bUnreached:/;
// A commit sha or its abbreviation in a text.
const SHA_TOKEN = /\b[0-9a-f]{7,40}\b/gi;

class UsageError extends Error {}

function fail(message) {
  throw new UsageError(message);
}

function gh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: MAX_OUTPUT });
  if (result.error) fail(`gh did not run: ${result.error.message}`);
  if (result.status !== 0) fail(`gh ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

// The closed plan issues, all issues, all pull requests, and the commits of the default branch of `repo`.
export function fetchRepository(repo, run = gh) {
  const json = (args) => JSON.parse(run(args));
  const plans = json([
    'issue',
    'list',
    '--repo',
    repo,
    '--label',
    'plan',
    '--state',
    'closed',
    '--limit',
    LIST_LIMIT,
    '--json',
    'number,title,closedAt,closedByPullRequestsReferences',
  ]);
  const issues = json([
    'issue',
    'list',
    '--repo',
    repo,
    '--state',
    'all',
    '--limit',
    LIST_LIMIT,
    '--json',
    'number,title,body,createdAt,labels',
  ]);
  const pulls = json([
    'pr',
    'list',
    '--repo',
    repo,
    '--state',
    'all',
    '--limit',
    LIST_LIMIT,
    '--json',
    'number,title,body,createdAt,mergedAt,mergeCommit,labels',
  ]);
  const jq = '.[] | {sha: .sha, message: .commit.message, date: .commit.committer.date}';
  const commits = run(['api', '--paginate', `repos/${repo}/commits?per_page=100`, '--jq', jq])
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return { plans, issues, pulls, commits };
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Tells whether `text` cites issue or pull request `number` of `repo`: `#<n>`, `<owner/repo>#<n>`, or a GitHub URL of
// the issue or the pull request. A longer number does not count, so `#12` does not cite #1.
export function cites(text, repo, number) {
  const name = escapeRegExp(repo);
  const pattern = new RegExp(
    `(?:^|[^\\w/#])#${number}(?!\\d)|${name}#${number}(?!\\d)|github\\.com/${name}/(?:pull|issues)/${number}(?!\\d)`,
    'i',
  );
  return pattern.test(text ?? '');
}

// Tells whether `text` names the commit `sha` in full or by an abbreviation of 7 or more characters.
function namesCommit(text, sha) {
  const full = sha.toLowerCase();
  return [...(text ?? '').matchAll(SHA_TOKEN)].some(([token]) => full.startsWith(token.toLowerCase()));
}

const labelNames = (item) => (item.labels ?? []).map((label) => label.name ?? label);
const textOf = (item) => `${item.title ?? ''}\n${item.body ?? ''}`;
const after = (item, time) => !time || !item.createdAt || item.createdAt > time;

// A revert of the pull request `pull`: a pull request or a commit with a revert marker whose text names the merge
// commit of `pull` or cites `pull`. A commit that is the merge commit of a counted revert pull request does not count
// again.
function revertsOf(pull, { repo, pulls, commits }) {
  const sha = pull.mergeCommit?.oid;
  const reverts = (text) =>
    REVERT_MARKER.test(text) && ((sha && namesCommit(text, sha)) || cites(text, repo, pull.number));
  const revertPulls = pulls.filter((other) => other.number !== pull.number && reverts(textOf(other)));
  const counted = new Set(revertPulls.map((other) => other.mergeCommit?.oid).filter(Boolean));
  const revertCommits = commits.filter(
    (commit) => commit.sha !== sha && !counted.has(commit.sha) && reverts(commit.message),
  );
  return [...revertPulls.map((other) => `#${other.number}`), ...revertCommits.map((commit) => commit.sha.slice(0, 12))];
}

// The outcome of each closed plan issue, in issue-number order. `landing` is the last merged pull request that closed
// the plan. A follow-up defect is an issue or a pull request, created after the landing merge (or after the plan
// closed, without a landing pull request), that cites a landing pull request or the plan, is not a revert, and has a
// defect label, a defect title, or the `Unreached:` marker.
export function planOutcomes({ repo, plans, issues, pulls, commits }) {
  const pullByNumber = new Map(pulls.map((pull) => [pull.number, pull]));
  const [owner, name] = repo.toLowerCase().split('/');
  return [...plans]
    .sort((a, b) => a.number - b.number)
    .map((plan) => {
      const landed = (plan.closedByPullRequestsReferences ?? [])
        .filter(
          (ref) =>
            !ref.repository ||
            (ref.repository.owner?.login?.toLowerCase() === owner && ref.repository.name?.toLowerCase() === name),
        )
        .map((ref) => pullByNumber.get(ref.number))
        .filter((pull) => pull?.mergedAt)
        .sort((a, b) => (a.mergedAt < b.mergedAt ? -1 : 1));
      const landing = landed.at(-1) ?? null;
      const since = landing?.mergedAt ?? plan.closedAt ?? null;
      const reverts = [...new Set(landed.flatMap((pull) => revertsOf(pull, { repo, pulls, commits })))];
      const revertIds = new Set(reverts);
      const own = new Set([plan.number, ...landed.map((pull) => pull.number)]);
      const citesWork = (item) =>
        [plan.number, ...landed.map((pull) => pull.number)].some((n) => cites(textOf(item), repo, n));
      const candidates = [
        ...issues.map((item) => ({ ...item, type: 'issue' })),
        ...pulls.map((item) => ({ ...item, type: 'pull' })),
      ].filter(
        (item) => !own.has(item.number) && !revertIds.has(`#${item.number}`) && after(item, since) && citesWork(item),
      );
      const unreached = candidates.filter((item) => item.type === 'issue' && UNREACHED_MARKER.test(item.body ?? ''));
      const unreachedIds = new Set(unreached.map((item) => item.number));
      const defects = candidates.filter(
        (item) =>
          unreachedIds.has(item.number) ||
          labelNames(item).some((label) => DEFECT_LABEL.test(label)) ||
          DEFECT_TITLE.test(item.title ?? ''),
      );
      return {
        plan: plan.number,
        title: plan.title,
        landing: landing?.number ?? null,
        merged: landing?.mergedAt ?? null,
        mergeCommit: landing?.mergeCommit?.oid ?? null,
        reverts,
        followUps: defects.map((item) => `#${item.number}`),
        unreached: unreached.map((item) => `#${item.number}`),
      };
    });
}

const cell = (text) => String(text).replaceAll('|', '\\|');

export function renderOutcomes(rows) {
  const list = (items) => (items.length ? `${items.length} (${items.join(', ')})` : '0');
  return [
    '| Plan | Landing PR | Merged | Reverts | Follow-up defects | Unreached issues | Title |',
    '|---:|---:|---|---|---|---|---|',
    ...rows
      .map((row) =>
        [
          `#${row.plan}`,
          row.landing === null ? '-' : `#${row.landing}`,
          row.merged ? row.merged.slice(0, 10) : '-',
          row.landing === null ? '-' : list(row.reverts),
          list(row.followUps),
          list(row.unreached),
          cell(row.title),
        ].join(' | '),
      )
      .map((line) => `| ${line} |`),
  ].join('\n');
}

const USAGE = 'usage: outcomes.mjs --repo <owner/repo> [--json]';

function main(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: { repo: { type: 'string' }, json: { type: 'boolean' } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    fail(`${error.message}\n${USAGE}`);
  }
  if (!values.repo || !/^[\w.-]+\/[\w.-]+$/.test(values.repo)) fail(USAGE);
  const rows = planOutcomes({ repo: values.repo, ...fetchRepository(values.repo) });
  return values.json ? JSON.stringify(rows, null, 2) : renderOutcomes(rows);
}

function isEntryPoint() {
  try {
    return fs.realpathSync(process.argv[1] ?? '') === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  try {
    console.log(main(process.argv.slice(2)));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`outcomes.mjs: ${error.message}`);
    process.exit(1);
  }
}
