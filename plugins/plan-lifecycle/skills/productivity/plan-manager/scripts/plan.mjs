#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const PLAN_STATUSES = new Set(['drafting', 'planned', 'ongoing', 'blocked']);
const STEP_STATUSES = new Set(['planned', 'in-flight', 'done', 'blocked', 'skipped']);
const STEP_EFFECTS = new Set(['local', 'probe', 'production_access', 'publish', 'push', 'release', 'deploy']);
const STEPS_HEADER = '| # | Id | Task | Files | Depends | Effect | Status | Done when |';
const STEPS_SEPARATOR = '|---:|---|---|---|---|---|---|---|';
const ACCEPTANCE_HEADER = '| ID | Command | Expected |';
const ACCEPTANCE_SEPARATOR = '|---|---|---|';
const PLAN_LABELS = ['plan', 'plan:drafting', 'plan:planned', 'plan:ongoing', 'plan:blocked'];
const ISSUE_FIELDS = 'number,title,body,state,stateReason,labels,assignees,url,createdAt,updatedAt';
const ACTING_LOGIN_ERROR = 'cannot resolve the acting GitHub login (gh api user --jq .login returned nothing)';
const CLOSING_PULL_REQUESTS_QUERY = `query($owner:String!,$name:String!,$number:Int!,$after:String){ repository(owner:$owner,name:$name){ defaultBranchRef{ name } issue(number:$number){ closing: closedByPullRequestsReferences(first:100, after:$after, excludeUserLinked:true){ nodes{ number url state mergedAt baseRefName repository{ nameWithOwner } } pageInfo{ hasNextPage endCursor } } timelineItems(last:100, itemTypes:CLOSED_EVENT){ nodes{ ... on ClosedEvent{ closer{ __typename ... on Commit{ oid } ... on PullRequest{ number url state mergedAt baseRefName repository{ nameWithOwner } } } } } } } } }`;
const ASSOCIATED_PULL_REQUESTS_QUERY = `query($owner:String!,$name:String!,$oid:String!,$after:String){ repository(owner:$owner,name:$name){ defaultBranchRef{ name } commit: object(expression:$oid){ ... on Commit{ associatedPullRequests(first:100, after:$after){ nodes{ number url state mergedAt baseRefName repository{ nameWithOwner } } pageInfo{ hasNextPage endCursor } } } } } }`;
function fail(message) {
  throw new Error(message);
}
function blankFencedRegions(text) {
  let fence;
  return text
    .split('\n')
    .map((line) => {
      const openingFence = fence ? undefined : /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (openingFence) fence = openingFence[1];
      else if (!fence) return line;
      else if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`).test(line)) fence = undefined;
      return line.replace(/[^\r]/g, ' ');
    })
    .join('\n');
}
function unquoteCode(value) {
  return /^`[^`]+`$/.test(value) ? value.slice(1, -1) : value;
}
function labelNames(labels) {
  return (labels ?? []).map((label) => (typeof label === 'string' ? label : label.name));
}
function runGh(argv) {
  const result = spawnSync('gh', argv, { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') fail('gh is not installed or not on PATH');
  if (result.error) fail(`gh ${argv.slice(0, 2).join(' ')} failed: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = result.stderr.trim() || `exit ${result.status}`;
    fail(`gh ${argv.slice(0, 2).join(' ')} failed: ${detail}`);
  }
  return result.stdout;
}
function resolveActingLogin() {
  if (actingLogin !== undefined) return actingLogin;
  const login = runGh(['api', 'user', '--jq', '.login']).trim();
  if (!login) fail(ACTING_LOGIN_ERROR);
  actingLogin = login;
  return actingLogin;
}
function resolveRepository() {
  try {
    const output = runGh(['repo', 'view', '--json', 'nameWithOwner,visibility,defaultBranchRef']);
    return JSON.parse(output);
  } catch (error) {
    if (error.message === 'gh is not installed or not on PATH') throw error;
    fail(`no GitHub remote: ${error.message}`);
  }
}
function parseJson(output, command) {
  try {
    return JSON.parse(output);
  } catch {
    fail(`${command} returned invalid JSON`);
  }
}
function repositoryCoordinates() {
  const [owner, name, ...extra] = repository.nameWithOwner.split('/');
  if (!owner || !name || extra.length > 0) fail(`invalid repository name: ${repository.nameWithOwner}`);
  return { owner, name };
}
function archivePullRequestReferences(issueNumber) {
  const { owner, name } = repositoryCoordinates();
  const closing = [];
  let closingCommitOid;
  let closerPullRequest;
  let defaultBranch;
  let after;
  let hasNextPage;
  do {
    const argv = [
      'api',
      'graphql',
      '-f',
      `query=${CLOSING_PULL_REQUESTS_QUERY}`,
      '-F',
      `owner=${owner}`,
      '-F',
      `name=${name}`,
      '-F',
      `number=${issueNumber}`,
    ];
    if (after !== undefined) argv.push('-F', `after=${after}`);
    const response = parseJson(runGh(argv), 'gh api graphql');
    const repo = response.data?.repository;
    const issue = repo?.issue;
    if (
      !repo?.defaultBranchRef?.name ||
      !issue ||
      !Array.isArray(issue.closing?.nodes) ||
      !Array.isArray(issue.timelineItems?.nodes)
    ) {
      fail('gh api graphql returned malformed closing pull request references');
    }
    defaultBranch = repo.defaultBranchRef.name;
    closing.push(...issue.closing.nodes);
    const latestClosure = issue.timelineItems.nodes.at(-1)?.closer;
    closingCommitOid = latestClosure?.__typename === 'Commit' ? latestClosure.oid : undefined;
    closerPullRequest = latestClosure?.__typename === 'PullRequest' ? latestClosure : undefined;
    hasNextPage = issue.closing.pageInfo?.hasNextPage === true;
    if (issue.closing.pageInfo?.endCursor != null) after = issue.closing.pageInfo.endCursor;
  } while (hasNextPage);
  return { closing, closingCommitOid, closerPullRequest, defaultBranch };
}
function associatedPullRequests(commitOid) {
  const { owner, name } = repositoryCoordinates();
  const pullRequests = [];
  let defaultBranch;
  let after;
  let hasNextPage;
  do {
    const argv = [
      'api',
      'graphql',
      '-f',
      `query=${ASSOCIATED_PULL_REQUESTS_QUERY}`,
      '-F',
      `owner=${owner}`,
      '-F',
      `name=${name}`,
      '-F',
      `oid=${commitOid}`,
    ];
    if (after !== undefined) argv.push('-F', `after=${after}`);
    const response = parseJson(runGh(argv), 'gh api graphql');
    const repo = response.data?.repository;
    const connection = repo?.commit?.associatedPullRequests;
    if (!repo?.defaultBranchRef?.name || !connection || !Array.isArray(connection.nodes)) {
      fail('gh api graphql returned malformed associated pull requests');
    }
    defaultBranch = repo.defaultBranchRef.name;
    pullRequests.push(...connection.nodes);
    hasNextPage = connection.pageInfo?.hasNextPage === true;
    if (connection.pageInfo?.endCursor != null) after = connection.pageInfo.endCursor;
  } while (hasNextPage);
  return { pullRequests, defaultBranch };
}
function parseIssueNumber(value) {
  const match = /^#?([1-9]\d*)$/.exec(String(value ?? ''));
  if (!match) fail(`invalid plan issue: ${value ?? '(missing)'}`);
  return Number(match[1]);
}
function issueView(number, fields = ISSUE_FIELDS, repo = repository.nameWithOwner) {
  return parseJson(runGh(['issue', 'view', String(number), '--json', fields, '--repo', repo]), 'gh issue view');
}
function issueComments(number) {
  const { owner, name } = repositoryCoordinates();
  const pages = parseJson(
    runGh(['api', `repos/${owner}/${name}/issues/${number}/comments`, '--paginate', '--slurp']),
    'gh api issue comments',
  );
  if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) {
    fail('gh api issue comments returned malformed comments');
  }
  return pages.flat();
}
function planWorkStarted(issue, recordStatus) {
  if (recordStatus !== 'drafting' && recordStatus !== 'planned') return true;
  const { owner, name } = repositoryCoordinates();
  const pages = parseJson(
    runGh(['api', `repos/${owner}/${name}/issues/${issue.number}/events`, '--paginate', '--slurp']),
    'gh api issue events',
  );
  if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) {
    fail('gh api issue events returned malformed events');
  }
  return pages.flat().some((event) => event?.event === 'labeled' && event?.label?.name === 'plan:ongoing');
}
function stateDirectory() {
  const base = process.env.XDG_STATE_HOME || path.join(process.env.HOME || os.homedir(), '.local', 'state');
  const directory = path.join(base, 'docks', 'plan');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  return directory;
}
function withBodyFile(body, callback) {
  const temporary = path.join(stateDirectory(), `body-${process.pid}-${randomUUID()}.md`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, body, 'utf8');
    fs.closeSync(descriptor);
    descriptor = undefined;
    return callback(temporary);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
  }
}
function editIssueBodyIfUnchanged(issue, after, labels = {}) {
  const current = issueView(issue.number, 'body,updatedAt');
  if (current.body !== issue.body) fail('plan issue changed remotely; re-read and retry');
  withBodyFile(after, (bodyFile) => {
    const argv = ['issue', 'edit', String(issue.number), '--body-file', bodyFile];
    if (Object.hasOwn(issue, 'claimLogin')) {
      if (!issue.claimLogin) fail(ACTING_LOGIN_ERROR);
      argv.push('--add-assignee', '@me');
    }
    if (labels.add) argv.push('--add-label', labels.add);
    for (const label of labels.remove ?? []) argv.push('--remove-label', label);
    argv.push('--repo', repository.nameWithOwner);
    runGh(argv);
  });
  const stored = issueView(issue.number, 'body,updatedAt');
  if (stored.body !== after) fail('plan issue body differs after edit');
}
function editIssueLabelsIfBodyUnchanged(issue, labels) {
  const remove = labels.remove ?? [];
  const claims = Object.hasOwn(issue, 'claimLogin');
  if (remove.length === 0 && !labels.add && !claims) return;
  const current = issueView(issue.number, 'body,updatedAt');
  if (current.body !== issue.body) fail('plan issue changed remotely; re-read and retry');
  const argv = ['issue', 'edit', String(issue.number)];
  if (claims) {
    if (!issue.claimLogin) fail(ACTING_LOGIN_ERROR);
    argv.push('--add-assignee', '@me');
  }
  if (labels.add) argv.push('--add-label', labels.add);
  for (const label of remove) argv.push('--remove-label', label);
  argv.push('--repo', repository.nameWithOwner);
  runGh(argv);
  if (remove.length > 0 || labels.add) {
    const stored = labelNames(issueView(issue.number, 'labels').labels);
    if ((labels.add && !stored.includes(labels.add)) || remove.some((label) => stored.includes(label))) {
      fail('plan issue labels differ after edit');
    }
  }
}
function parseOptions(args, allowed, repeatable = new Set()) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (
      !allowed.has(flag) ||
      args[index + 1] === undefined ||
      (!repeatable.has(flag) && Object.hasOwn(options, flag))
    ) {
      fail(`invalid option: ${flag ?? '(missing)'}`);
    }
    if (repeatable.has(flag)) {
      options[flag] ??= [];
      options[flag].push(args[index + 1]);
    } else options[flag] = args[index + 1];
  }
  return options;
}
function statusFromLabels(labels) {
  const statuses = labelNames(labels)
    .filter((label) => label.startsWith('plan:') && PLAN_STATUSES.has(label.slice(5)))
    .map((label) => label.slice(5));
  if (statuses.length === 0) return 'unlabelled';
  return statuses.length === 1 ? statuses[0] : 'unreadable';
}
export function statusFromIssue(issue) {
  if (String(issue.state).toUpperCase() !== 'CLOSED') return statusFromLabels(issue.labels);
  switch (String(issue.stateReason).toUpperCase()) {
    case 'COMPLETED':
      return 'finished';
    case 'NOT_PLANNED':
      return 'retired';
    case 'DUPLICATE':
      return 'duplicate';
    default:
      return 'unreadable';
  }
}
function labelsToRemove(issue, target) {
  return labelNames(issue.labels).filter(
    (label) => label.startsWith('plan:') && (!target || label !== `plan:${target}`),
  );
}
function headerStrip(issue, status) {
  return `#${issue.number} · ${status} · ${issue.title} · ${issue.url}`;
}
function reviewDirectory() {
  const result = spawnSync('git', ['rev-parse', '--git-path', 'docks-review'], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') fail('git is not installed or not on PATH');
  if (result.error) fail(`git rev-parse failed: ${result.error.message}`);
  if (result.status !== 0) fail(`git rev-parse failed: ${result.stderr.trim() || `exit ${result.status}`}`);
  const gitPath = result.stdout.trim();
  if (!gitPath) fail('git rev-parse failed: empty git path');
  return path.resolve(process.cwd(), gitPath);
}
function exportPlan(args) {
  if (args.length !== 1) fail('export requires one issue');
  const { issue } = readPlanIssue(args[0]);
  const directory = reviewDirectory();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const destination = path.join(directory, `plan-${issue.number}.md`);
  fs.writeFileSync(destination, issue.body, { encoding: 'utf8', mode: 0o600 });
  fs.writeFileSync(originFile(destination), `${bodyDigest(issue.body)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(destination, 0o600);
  fs.chmodSync(originFile(destination), 0o600);
  console.log(destination);
}
function bodyDigest(body) {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}
function originFile(planFile) {
  return `${planFile}.origin`;
}
function readOrigin(planFile) {
  const source = originFile(planFile);
  let recorded;
  try {
    recorded = fs.readFileSync(source, 'utf8').trim();
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    fail(`unreadable export provenance: ${source}`);
  }
  if (!/^[0-9a-f]{64}$/.test(recorded)) fail(`unreadable export provenance: ${source}`);
  return recorded;
}
function changedLines(before, after) {
  const left = before.split('\n');
  const right = after.split('\n');
  const lengths = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = left[i] === right[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const changes = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      i += 1;
      j += 1;
    } else if (i < left.length && (j === right.length || lengths[i + 1][j] >= lengths[i][j + 1])) {
      changes.push(`-${left[i]}`);
      i += 1;
    } else {
      changes.push(`+${right[j]}`);
      j += 1;
    }
  }
  return changes;
}
const SECTIONS = ['Goal', 'Research', 'Steps', 'Acceptance', 'Do not touch', 'Open questions', 'Verification Results'];
const MARKER = '<!-- plan-contract: v4 -->';
let repository, actingLogin;
const token = (value) => unquoteCode(value.trim()).toLowerCase();
const stepId = (value) => token(value).replaceAll('-', '_');
const terminal = (status) => ['done', 'skipped'].includes(status);
function sectionMap(body) {
  const headings = [...blankFencedRegions(body).matchAll(/^\s*##[ \t]+([^\n]+)$/gm)];
  return new Map(
    headings.map((heading, index) => [
      SECTIONS.find((name) => name.toLowerCase() === heading[1].trim().toLowerCase()) ?? heading[1].trim(),
      body.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? body.length).trim(),
    ]),
  );
}
function table(text, header) {
  const lines = text.split('\n'),
    cells = (line) =>
      line
        .trim()
        .replace(/^\||(?<!\\)\|$/g, '')
        .split(/(?<!\\)\|/)
        .map((cell) => cell.trim());
  const start = lines.findIndex((line) => cells(line).map(token).join('|') === cells(header).map(token).join('|'));
  if (start < 0) return { lines, start, end: start, rows: [] };
  const isSeparator = (line) => cells(line).every((cell) => /^:?-+:?$/.test(cell));
  const first = start + 1 + (lines[start + 1] !== undefined && isSeparator(lines[start + 1]) ? 1 : 0);
  let end = first;
  while (end < lines.length && lines[end].trim().startsWith('|')) end++;
  return { lines, start, end, rows: lines.slice(first, end).map(cells) };
}
const render = (sections) =>
  `${MARKER}\n\n${SECTIONS.map((name) => `## ${name}\n\n${sections.get(name) ?? ''}`.trimEnd()).join('\n\n')}\n`;
function replaceTable(sections, name, header, separator, rows) {
  const parsed = table(sections.get(name) ?? '', header);
  if (parsed.start < 0) return;
  parsed.lines.splice(
    parsed.start,
    parsed.end - parsed.start,
    header,
    separator,
    ...rows.map((cells) => `| ${cells.join(' | ')} |`),
  );
  sections.set(name, parsed.lines.join('\n'));
}
export function normalizePlan(text) {
  const advice = [];
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => (line.includes('\u2014') ? line.replaceAll('\u2014', ' - ').replace(/ {2,}/g, ' ') : line).trimEnd())
    .join('\n');
  const sections = sectionMap(cleaned),
    goal = sections.get('Goal') ?? '';
  const mode = /^\s*Mode:\s*(.*?)\s*$/im.exec(goal),
    value = mode?.[1].toLowerCase();
  const valid = ['plan-only', 'plan-and-implement'].includes(value);
  if (!valid) advice.push('Mode defaulted to plan-only; implementation needs an explicit mode.');
  sections.set('Goal', `${goal.replace(/^\s*Mode:.*$/gim, '').trim()}\n\nMode: ${valid ? value : 'plan-only'}`.trim());
  const rows = table(sections.get('Steps') ?? '', STEPS_HEADER).rows;
  for (const row of rows) {
    if (row.length !== 8) continue;
    row[1] = stepId(row[1]);
    row[5] = token(row[5]);
    row[6] = token(row[6]);
    if (!STEP_EFFECTS.has(row[5])) advice.push(`unknown Effect: ${row[5]}`);
    if (!STEP_STATUSES.has(row[6])) advice.push(`unknown Status: ${row[6]}`);
    if (row[5] !== 'local') advice.push(`step ${row[1]} Effect ${row[5]} needs an in-session ask before it runs.`);
  }
  const numbers = new Map(rows.map((row) => [row[1], row[0]]));
  for (const row of rows)
    if (row.length === 8)
      row[4] =
        row[4] === '-'
          ? '-'
          : row[4]
              .split(',')
              .map((part) => numbers.get(stepId(part)) ?? part.trim())
              .join(', ');
  replaceTable(sections, 'Steps', STEPS_HEADER, STEPS_SEPARATOR, rows);
  replaceTable(
    sections,
    'Acceptance',
    ACCEPTANCE_HEADER,
    ACCEPTANCE_SEPARATOR,
    table(sections.get('Acceptance') ?? '', ACCEPTANCE_HEADER).rows,
  );
  if (
    /(?:^|[\s("'`[{=:;,>])(?:\/(?!\/|\s|dev\/null\b)|[A-Za-z]:[\\/]|\\\\\S)/m.test(
      cleaned.replace(/\]\([^)\n]*\)/g, ']()'),
    )
  )
    advice.push('body contains an absolute machine path.');
  return { body: render(sections), advice };
}
export function parsePlan(text) {
  const { body } = normalizePlan(text),
    sections = sectionMap(body);
  return {
    marker: MARKER,
    sections,
    malformedSteps: table(sections.get('Steps'), STEPS_HEADER)
      .rows.map((row, index) => ({ line: index + 1, cells: row.length }))
      .filter((row) => row.cells !== 8),
    steps: table(sections.get('Steps'), STEPS_HEADER)
      .rows.filter((row) => row.length === 8)
      .map(([display, id, task, files, depends, effect, status, doneWhen]) => ({
        display,
        id,
        task,
        files,
        depends,
        effect,
        status,
        doneWhen,
      })),
    acceptance: table(sections.get('Acceptance'), ACCEPTANCE_HEADER).rows,
  };
}
function printAdvice(text, status, extra = []) {
  const result = normalizePlan(text);
  if (status !== 'drafting' && parsePlan(text).sections.get('Research').includes('_Not researched yet._'))
    result.advice.push('Research is not filled after drafting.');
  for (const message of [...result.advice, ...extra]) console.log(`advice: ${message}`);
}
export function parseReviewComment(body) {
  if (typeof body !== 'string') return undefined;
  const lines = body.trim().split(/\r?\n/),
    heading = /^(?:#+\s*)?(plan|code) review/i.exec(lines[0]);
  if (!heading) return undefined;
  const kind = heading[1].toLowerCase();
  const index = lines.findIndex((line, i) => i > 0 && /^(plan|code)[- ]review:\s*(\S+)/i.test(line));
  const match = /^(plan|code)[- ]review:\s*(\S+)/i.exec(lines[index] ?? '');
  if (!match || match[1].toLowerCase() !== kind) return undefined;
  const alias = match[2].toLowerCase();
  let verdict = ['pass', 'ok', 'approved'].includes(alias)
    ? 'pass'
    : ['repair', 'changes', 'fixes-required'].includes(alias)
      ? kind === 'plan'
        ? 'repair'
        : 'fixes-required'
      : alias === 'blocked'
        ? 'blocked'
        : undefined;
  if (!verdict) return undefined;
  if (
    kind === 'code' &&
    verdict === 'pass' &&
    /\b(critical|high)\b/i.test(lines.filter((_, i) => i > 0 && i !== index).join('\n'))
  )
    verdict = 'fixes-required';
  return { kind, verdict };
}
function reviewVerdicts(issue) {
  const owners = issue.assignees ?? [],
    verdicts = {};
  const comments = issueComments(issue.number)
    .map((comment, index) => ({ comment, index }))
    .sort(
      (a, b) =>
        (Date.parse(a.comment.createdAt ?? a.comment.created_at) || 0) -
          (Date.parse(b.comment.createdAt ?? b.comment.created_at) || 0) || a.index - b.index,
    );
  for (const { comment } of comments) {
    const review = parseReviewComment(comment.body);
    if (owners.length === 1 && (comment.user?.login ?? comment.author?.login) === owners[0].login && review)
      verdicts[review.kind] = review.verdict;
  }
  return verdicts;
}
function readPlanIssue(value, forWrite = false) {
  const issue = issueView(parseIssueNumber(value));
  if (!/^\s*<!-- plan-contract: v[34] -->/i.test(issue.body)) fail(`unreadable plan contract: #${issue.number}`);
  if (forWrite) {
    const login = resolveActingLogin(),
      owners = (issue.assignees ?? []).map((owner) => owner.login);
    const foreign = owners.find((owner) => owner !== login);
    if (foreign) fail(`plan #${issue.number} is owned by ${foreign}`);
    if (!owners.length) issue.claimLogin = login;
  }
  return { issue, parsed: parsePlan(issue.body), status: statusFromIssue(issue) };
}
function createPlan(args) {
  const options = parseOptions(args, new Set(['--title', '--goal', '--mode', '--label']), new Set(['--label']));
  if (!options['--title']?.trim() || !options['--goal']?.trim()) fail('new requires --title and --goal');
  const extras = options['--label'] ?? [];
  for (const label of extras) if (/^plan(?::|$)/i.test(label)) fail(`reserved label namespace: ${label}`);
  resolveActingLogin();
  for (const label of PLAN_LABELS) runGh(['label', 'create', label, '--force', '--repo', repository.nameWithOwner]);
  const source = `## Goal\n${options['--goal']}\nMode: ${options['--mode'] ?? ''}\n## Research\n_Not researched yet._\n## Steps\n${STEPS_HEADER}\n${STEPS_SEPARATOR}\n## Acceptance\n${ACCEPTANCE_HEADER}\n${ACCEPTANCE_SEPARATOR}`;
  const { body } = normalizePlan(source);
  const url = withBodyFile(body, (file) =>
    runGh([
      'issue',
      'create',
      '--title',
      options['--title'].replaceAll('\u2014', ' - ').replace(/ {2,}/g, ' ').trim(),
      '--body-file',
      file,
      '--label',
      'plan',
      '--label',
      'plan:drafting',
      '--assignee',
      '@me',
      ...extras.flatMap((label) => ['--label', label]),
      '--repo',
      repository.nameWithOwner,
    ]).trim(),
  );
  const number = /\/issues\/([1-9]\d*)\/?$/.exec(url)?.[1];
  if (!number) fail('gh issue create returned an invalid issue URL');
  console.log(`plan created: #${number} ${url}`);
  printAdvice(source, 'drafting');
}
function showPlan(args) {
  const [value, ...flags] = args;
  if (!value || flags.length > 1 || flags.some((flag) => flag !== '--body'))
    fail('show requires an issue and optional --body');
  const { issue, status } = readPlanIssue(value),
    reviews = reviewVerdicts(issue);
  const metadata = `${headerStrip(issue, status)}\nreviews: plan=${reviews.plan ?? 'none'} code=${reviews.code ?? 'none'}`;
  if (flags.length) {
    console.error(metadata);
    process.stdout.write(issue.body);
  } else {
    console.log(metadata);
    printAdvice(issue.body, status);
  }
}
function refuseMalformedSteps(plan) {
  const [first] = plan.malformedSteps;
  if (first)
    fail(
      `Steps row ${first.line} has ${first.cells} cells; expected 8. Escape a literal pipe as \\| so the row is preserved.`,
    );
}
function editPlan(args) {
  const [value, ...flags] = args,
    file = parseOptions(flags, new Set(['--file']))['--file'];
  if (!file) fail('edit requires an issue and --file');
  const { issue, parsed, status } = readPlanIssue(value, true),
    origin = readOrigin(file);
  if (!origin)
    fail(
      `missing export provenance: ${file}.origin does not exist; run \`plan.mjs export ${issue.number}\` and re-apply the edit`,
    );
  if (origin !== bodyDigest(issue.body))
    fail(
      `stale export: ${file} was exported from a superseded body; run \`plan.mjs export ${issue.number}\` and re-apply the edit`,
    );
  const source = fs.readFileSync(file, 'utf8'),
    { body } = normalizePlan(source),
    incomingPlan = parsePlan(body),
    incoming = incomingPlan.steps;
  refuseMalformedSteps(incomingPlan);
  const seenIds = new Set();
  for (const row of incoming) {
    if (seenIds.has(row.id)) fail(`duplicate step id after normalization: ${row.id}`);
    seenIds.add(row.id);
  }
  if (planWorkStarted(issue, status)) {
    const frozen = (detail) => fail(`step state is frozen once work starts: ${detail}`),
      ids = new Set(parsed.steps.map((row) => row.id));
    const last = incoming.reduce((position, row, index) => (ids.has(row.id) ? index : position), -1);
    for (const row of parsed.steps) {
      const matches = incoming.filter((next) => next.id === row.id);
      if (matches.length !== 1) frozen(`step ${row.id} removed or duplicated`);
      for (const key of ['id', 'display', 'depends', 'effect', 'status'])
        if (matches[0][key] !== row[key]) frozen(`step ${row.id} ${key} changed`);
    }
    incoming.forEach((row, index) => {
      if (
        !ids.has(row.id) &&
        (String(issue.state).toUpperCase() === 'CLOSED' || row.status !== 'planned' || index < last)
      )
        frozen(`new step ${row.id} must append as planned on an open plan`);
    });
  }
  fs.writeFileSync(file, body);
  fs.writeFileSync(originFile(file), `${bodyDigest(body)}\n`, { mode: 0o600 });
  fs.chmodSync(originFile(file), 0o600);
  editIssueBodyIfUnchanged(issue, body);
  const changes = changedLines(issue.body, body);
  console.log(headerStrip(issue, status));
  console.log(`changed: ${changes.length} line(s)`);
  for (const line of changes) console.log(line);
  printAdvice(source, status);
}
function setPlanStatus(args) {
  const [value, raw, ...flags] = args,
    target = token(raw ?? ''),
    options = parseOptions(flags, new Set(['--reason']));
  if (!PLAN_STATUSES.has(target)) fail(`unknown plan status: ${target}`);
  if (target === 'blocked' && (!options['--reason']?.trim() || /[\r\n]/.test(options['--reason'])))
    fail('blocked status requires --reason as single-line text');
  const { issue, parsed, status } = readPlanIssue(value, true);
  if (String(issue.state).toUpperCase() === 'CLOSED')
    fail(`plan #${issue.number} is closed; status applies to open plans`);
  if (planWorkStarted(issue, status) && !['ongoing', 'blocked'].includes(target))
    fail(`illegal plan status transition: ${status} -> ${target}`);
  const content = parsed.sections.get('Open questions').replace(/^Blocked:[^\n]*\n?\s*/i, '');
  parsed.sections.set(
    'Open questions',
    `${target === 'blocked' ? `Blocked: ${options['--reason']}\n\n` : ''}${content}`.trim(),
  );
  const source = render(parsed.sections);
  editIssueBodyIfUnchanged(issue, normalizePlan(source).body, {
    add: `plan:${target}`,
    remove: labelsToRemove(issue, target),
  });
  console.log(`plan #${issue.number} status: ${status} -> ${target}`);
  printAdvice(issue.body, target);
}
function setStepStatus(args) {
  if (args.length !== 3) fail('step requires an issue, step id, and status');
  const [value, id, raw] = args,
    target = token(raw),
    { issue, parsed, status } = readPlanIssue(value, true);
  if (!STEP_STATUSES.has(target)) fail(`unknown step status: ${target}`);
  if (status !== 'ongoing' && status !== 'finished') fail(`plan status is ${status}; expected ongoing`);
  refuseMalformedSteps(parsed);
  const row = parsed.steps.find((step) => step.id === stepId(id));
  if (!row) fail(`unknown step id: ${id}`);
  const current = row.status;
  if (
    (status === 'finished' && !terminal(target)) ||
    (status !== 'finished' && terminal(current) && current !== target)
  )
    fail(`illegal step status transition: ${current} -> ${target}`);
  const advice = normalizePlan(issue.body).advice.filter((message) => message.startsWith('Mode defaulted')),
    unfinished = row.depends
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '-' && !terminal(parsed.steps.find((step) => step.display === part)?.status));
  if (['in-flight', 'done'].includes(target) && unfinished.length)
    advice.push(`step ${row.id} has unfinished dependency ${unfinished.join(', ')}`);
  row.status = target;
  replaceTable(
    parsed.sections,
    'Steps',
    STEPS_HEADER,
    STEPS_SEPARATOR,
    parsed.steps.map((step) => Object.values(step)),
  );
  const source = render(parsed.sections);
  editIssueBodyIfUnchanged(issue, normalizePlan(source).body);
  console.log(`plan #${issue.number} step ${row.id}: ${current} -> ${target}`);
  printAdvice(source, status, advice);
}
function listPlans(args) {
  const selected = parseOptions(args, new Set(['--status']))['--status'];
  const issues = parseJson(
    runGh([
      'issue',
      'list',
      '--label',
      'plan',
      '--state',
      'all',
      '--limit',
      '500',
      '--json',
      ISSUE_FIELDS.replace('body,', ''),
      '--repo',
      repository.nameWithOwner,
    ]),
    'gh issue list',
  );
  issues.sort(
    (a, b) =>
      Number(a.state.toUpperCase() === 'CLOSED') - Number(b.state.toUpperCase() === 'CLOSED') || a.number - b.number,
  );
  for (const issue of issues) {
    const status = statusFromIssue(issue);
    if (!selected || status === token(selected)) console.log(`${status}\t#${issue.number}\t${issue.title}`);
  }
}
function archivePlan(args, retired = false) {
  const [value, ...flags] = args,
    options = parseOptions(flags, new Set(retired ? ['--reason'] : []));
  if (retired && (!options['--reason']?.trim() || /[\r\n]/.test(options['--reason'])))
    fail('retire requires a single-line --reason');
  const { issue, parsed, status } = readPlanIssue(value, true);
  if (retired && String(issue.state).toUpperCase() === 'CLOSED') fail(`cannot retire a ${status} plan`);
  if (!retired && status !== 'finished') fail(`archive requires finished status, found ${status}`);
  let closer;
  if (!retired) {
    if (parsed.steps.length === 0) fail('archive refused: no Steps rows parsed');
    const unfinished = parsed.steps.find((row) => !terminal(row.status));
    if (unfinished) fail(`archive refused: non-terminal step ${unfinished.id}`);
    if (reviewVerdicts(issue).code !== 'pass') fail('archive requires Code-review: pass');
    const { closingCommitOid, closerPullRequest, defaultBranch } = archivePullRequestReferences(issue.number);
    const references = closerPullRequest
      ? [closerPullRequest]
      : closingCommitOid
        ? associatedPullRequests(closingCommitOid).pullRequests
        : [];
    closer = references.find(
      (pr) =>
        pr.state === 'MERGED' &&
        pr.mergedAt &&
        pr.repository?.nameWithOwner === repository.nameWithOwner &&
        pr.baseRefName === defaultBranch,
    );
    if (!closer)
      fail(`archive requires a closing pull request merged into ${repository.nameWithOwner}:${defaultBranch}`);
  }
  editIssueLabelsIfBodyUnchanged(issue, { remove: labelsToRemove(issue) });
  if (retired)
    runGh([
      'issue',
      'close',
      String(issue.number),
      '--reason',
      'not planned',
      '--comment',
      options['--reason'].replaceAll('\u2014', ' - ').replace(/ {2,}/g, ' '),
      '--repo',
      repository.nameWithOwner,
    ]);
  console.log(
    retired
      ? `plan #${issue.number} retired`
      : `plan #${issue.number} finished (closed by ${closer.url ?? `https://github.com/${repository.nameWithOwner}/pull/${closer.number}`})`,
  );
}
function main([command, ...args]) {
  const commands = {
    new: createPlan,
    show: showPlan,
    export: exportPlan,
    edit: editPlan,
    status: setPlanStatus,
    step: setStepStatus,
    list: listPlans,
    archive: archivePlan,
    retire: (values) => archivePlan(values, true),
  };
  if (!Object.hasOwn(commands, command))
    fail('usage: plan.mjs <new|show|export|edit|status|step|list|archive|retire> ...');
  repository = resolveRepository();
  commands[command](args);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
