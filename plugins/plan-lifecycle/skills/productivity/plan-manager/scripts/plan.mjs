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
const SECTIONS = ['Goal', 'Research', 'Steps', 'Acceptance', 'Do not touch', 'Open questions', 'Review', 'Verification Results'];
const V3_MARKER = '<!-- plan-contract: v3 -->';
const STEPS_HEADER = '| # | Id | Task | Files | Depends | Effect | Status | Done when |';
const STEPS_SEPARATOR = '|---:|---|---|---|---|---|---|---|';
const ACCEPTANCE_HEADER = '| ID | Command | Expected |';
const ACCEPTANCE_SEPARATOR = '|---|---|---|';
const PLAN_LABELS = ['plan', 'plan:drafting', 'plan:planned', 'plan:ongoing', 'plan:blocked'];
const STATUS_TRANSITIONS = {
  drafting: new Set(['planned', 'ongoing', 'blocked']),
  planned: new Set(['drafting', 'ongoing', 'blocked']),
  ongoing: new Set(['blocked']),
  blocked: new Set(['drafting', 'planned', 'ongoing']),
};
const STEP_TRANSITIONS = {
  planned: new Set(['in-flight', 'done', 'blocked', 'skipped']),
  'in-flight': new Set(['done', 'blocked', 'skipped']),
  blocked: new Set(['in-flight', 'done', 'skipped']),
  done: new Set(),
  skipped: new Set(),
};
const ISSUE_FIELDS = 'number,title,body,state,stateReason,labels,assignees,url,createdAt,updatedAt';
const ACTING_LOGIN_ERROR = 'cannot resolve the acting GitHub login (gh api user --jq .login returned nothing)';
// `closedByPullRequestsReferences` returns manually linked pull requests alongside keyword closers, so a
// collaborator could link any merged pull request and pass this verifier; `excludeUserLinked` drops them and
// keeps keyword closers (verified live: microsoft/vscode#331368 returns its link in the plain connection,
// cli/cli#14073 keeps its keyword closer under exclusion). `includeClosedPrs` stays at its `false` default
// because a merged pull request is returned regardless (cli/cli#14073) while that default also hides the
// closed-unmerged references this verifier must never accept (cli/cli#14156).
const CLOSING_PULL_REQUESTS_QUERY = `query($owner:String!,$name:String!,$number:Int!,$after:String){
  repository(owner:$owner,name:$name){
    defaultBranchRef{ name }
    issue(number:$number){
      closing: closedByPullRequestsReferences(first:100, after:$after, excludeUserLinked:true){
        nodes{ number url state mergedAt baseRefName repository{ nameWithOwner } }
        pageInfo{ hasNextPage endCursor }
      }
      timelineItems(last:100, itemTypes:CLOSED_EVENT){
        nodes{ ... on ClosedEvent{ closer{ __typename ... on Commit{ oid } } } }
      }
    }
  }
}`;
const ASSOCIATED_PULL_REQUESTS_QUERY = `query($owner:String!,$name:String!,$oid:String!,$after:String){
  repository(owner:$owner,name:$name){
    defaultBranchRef{ name }
    commit: object(expression:$oid){
      ... on Commit{
        associatedPullRequests(first:100, after:$after){
          nodes{ number url state mergedAt baseRefName repository{ nameWithOwner } }
          pageInfo{ hasNextPage endCursor }
        }
      }
    }
  }
}`;
let repository;
let actingLogin;
 

function fail(message) {
  throw new Error(message);
}

function planContract(planText) {
  return planText.startsWith(`${V3_MARKER}\n\n`) ? 'v3' : 'unreadable';
}

function parsePlanText(planText) {
  const contract = planContract(planText);
  if (contract !== 'v3') fail('unreadable plan record');
  return { body: planText };
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

function parseRows(sectionText, header, separator, width) {
  const lines = blankFencedRegions(sectionText).split('\n');
  const headerIndex = lines.indexOf(header);
  const headerMatches = headerIndex !== -1 && lines[headerIndex + 1] === separator;
  if (!headerMatches) return { headerMatches, rowCount: 0, rows: [] };
  const rows = [];
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    if (!lines[index].startsWith('|')) break;
    const cells = lines[index].slice(1, -1).split('|').map((cell) => cell.trim());
    rows.push({ cells, line: lines[index], lineIndex: index });
  }
  return { headerMatches: true, rowCount: rows.length, rows: rows.filter((row) => row.cells.length === width) };
}

function sectionMap(body) {
  const headings = [...blankFencedRegions(body).matchAll(/^## (.+)$/gm)];
  const sections = new Map();
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const start = heading.index + heading[0].length + 1;
    sections.set(heading[1], body.slice(start, headings[index + 1]?.index ?? body.length).trimEnd());
  }
  return { headings: headings.map((match) => match[1]), sections };
}

function unquoteCode(value) {
  return /^`[^`]+`$/.test(value) ? value.slice(1, -1) : value;
}

function pathsInFilesCell(value) {
  return value.split(',').map((entry) => unquoteCode(entry.trim())).filter(Boolean);
}

function labelNames(labels) {
  return (labels ?? []).map((label) => typeof label === 'string' ? label : label.name);
}

function issueIdentity(planRef) {
  if (planRef === undefined || planRef === null) return undefined;
  if (typeof planRef === 'object') {
    const number = Number(planRef.number);
    return {
      number: Number.isInteger(number) && number > 0 ? number : undefined,
      url: planRef.url,
    };
  }
  const value = String(planRef).trim();
  const match = /(?:^#?|\/issues\/)([1-9]\d*)$/.exec(value);
  if (!match) return undefined;
  return { number: Number(match[1]), url: value.includes('/issues/') ? value : undefined };
}

export function machinePathCitations(planText) {
  return planText
    .split('\n')
    .filter((line) => !/^[A-Z][A-Za-z0-9-]*: *\{/.test(line) && /\/home\/[a-z]|\/Users\/[A-Za-z]/.test(line));
}

export function checkPlan(planText, planRef) {
  const contract = planContract(planText);
  if (contract !== 'v3') return ['check 1: unreadable plan contract'];

  const failures = [];
  // Count standalone marker lines only: a record about this contract legitimately quotes the marker in prose.
  const markerLines = planText.split('\n').filter((line) => line.trim() === V3_MARKER).length;
  if (!planText.startsWith(`${V3_MARKER}\n\n`) || markerLines !== 1 || /^---[ \t]*$/m.test(planText)) {
    failures.push('check 1: v3 marker must be the first line, followed by one blank line, with no frontmatter fence');
  }

  const status = planRef && typeof planRef === 'object' ? statusFromIssue(planRef) : 'drafting';
  const { headings, sections } = sectionMap(planText);
  if (status === 'unreadable' || status === 'unlabelled') {
    failures.push('check 2: an open plan requires exactly one recognized phase label');
  }
  const openQuestionsFirstLine = (sections.get('Open questions') ?? '').trimStart().split('\n')[0] ?? '';
  if (status === 'blocked' && !/^Blocked: [^\r\n]+$/.test(openQuestionsFirstLine)) {
    failures.push('check 2: blocked status requires `Blocked: <one-line text>` as the first line of Open questions');
  }
  if (status !== 'blocked' && /^Blocked:/.test(openQuestionsFirstLine)) {
    failures.push(`check 2: only blocked status may open Open questions with \`Blocked:\`; status is ${status}`);
  }

  if (
    planRef &&
    typeof planRef === 'object' &&
    Object.hasOwn(planRef, 'title') &&
    (typeof planRef.title !== 'string' || !planRef.title.trim() || planRef.title.length > 70)
  ) {
    failures.push('check 3: issue title must contain 1 to 70 characters');
  }
  if (planRef && typeof planRef === 'object' && (Object.hasOwn(planRef, 'createdAt') || Object.hasOwn(planRef, 'updatedAt'))) {
    const created = Date.parse(planRef.createdAt);
    const updated = Date.parse(planRef.updatedAt);
    if (!Number.isFinite(created) || !Number.isFinite(updated) || updated < created) {
      failures.push('check 4: issue createdAt and updatedAt must be timestamps in chronological order');
    }
  }
  if (headings.join('\0') !== SECTIONS.join('\0')) {
    failures.push('check 5: required sections must appear once in contract order');
  }

  const stepsTable = parseRows(sections.get('Steps') ?? '', STEPS_HEADER, STEPS_SEPARATOR, 8);
  if (!stepsTable.headerMatches) failures.push('check 6: Steps table header must match the contract');
  if (stepsTable.headerMatches && stepsTable.rows.length === 0) failures.push('check 6: Steps table requires at least one row');
  const stepsHaveEightCells = stepsTable.rowCount === stepsTable.rows.length;
  if (stepsTable.headerMatches && !stepsHaveEightCells) failures.push('check 6: every Steps row must have eight cells');
  const stepIds = new Set();
  const displayNumbers = new Set();
  const stepFiles = new Set();
  for (const row of stepsTable.rows) {
    const [display, id, task, files, , effectCell, statusCell, doneWhen] = row.cells;
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(id) || stepIds.has(id)) failures.push(`check 6: invalid or duplicate step Id ${id || '(empty)'}`);
    else stepIds.add(id);
    if (!task || !files || !doneWhen) failures.push(`check 6: step ${id || display} has an empty required cell`);
    if (!STEP_EFFECTS.has(unquoteCode(effectCell))) failures.push(`check 6: step ${id || display} has an invalid Effect`);
    if (!STEP_STATUSES.has(unquoteCode(statusCell))) failures.push(`check 6: step ${id || display} has an invalid Status`);
    if (!/^[1-9]\d*$/.test(display) || displayNumbers.has(display)) failures.push(`check 8: invalid display number ${display}`);
    displayNumbers.add(display);
    for (const file of pathsInFilesCell(files)) stepFiles.add(file);
  }
  for (const citation of planText.matchAll(/\bstep:([A-Za-z0-9_-]+)\b/g)) {
    if (!stepIds.has(citation[1])) failures.push(`check 7: unknown step citation step:${citation[1]}`);
  }
  if (/\bstep \d+\b/.test(planText)) failures.push('check 7: bare numeric step citation is not allowed');
  for (const row of stepsTable.rows) {
    const display = Number(row.cells[0]);
    const dependencies = row.cells[4] === '—' ? [] : row.cells[4].split(',').map((value) => value.trim());
    for (const dependency of dependencies) {
      if (!displayNumbers.has(dependency) || !/^\d+$/.test(dependency) || Number(dependency) >= display) {
        failures.push(`check 8: step ${row.cells[1] || row.cells[0]} has invalid dependency ${dependency}`);
      }
    }
  }
  const acceptance = parseRows(sections.get('Acceptance') ?? '', ACCEPTANCE_HEADER, ACCEPTANCE_SEPARATOR, 3);
  if (!acceptance.headerMatches) failures.push('check 9: Acceptance table header must match the contract');
  if (acceptance.headerMatches && acceptance.rows.length === 0) failures.push('check 9: Acceptance table requires at least one row');
  const acceptanceCellsMatch = acceptance.rowCount === acceptance.rows.length;
  if (acceptance.headerMatches && !acceptanceCellsMatch) failures.push('check 9: every Acceptance row must have three cells');
  const acceptanceIds = new Set();
  for (const { cells } of acceptance.rows) {
    const [id, command, expected] = cells;
    if (!id || acceptanceIds.has(id)) failures.push(`check 9: invalid or duplicate acceptance ID ${id || '(empty)'}`);
    else acceptanceIds.add(id);
    if (!command || !expected) failures.push(`check 9: acceptance ${id || '(empty)'} has an empty required cell`);
  }
  if (machinePathCitations(planText).length > 0) failures.push('check 10: body contains an absolute machine path');
  const researchIsPlaceholder = (sections.get('Research') ?? '').includes('_Not researched yet._');
  if (researchIsPlaceholder && status !== 'drafting') {
    failures.push('check 11: Research must be filled once the plan leaves drafting');
  }
  const identity = issueIdentity(planRef);
  if (identity?.number !== undefined) {
    const references = new Set([String(identity.number), `#${identity.number}`]);
    if (identity.url) references.add(identity.url);
    if ([...stepFiles].some((file) => references.has(file))) failures.push('check 12: Steps Files contains the plan issue itself');
  }
  const modes = [...(sections.get('Goal') ?? '').matchAll(/^Mode: (plan-and-implement|plan-only)$/gm)];
  if (modes.length !== 1) failures.push('check 13: Goal must contain exactly one valid Mode line');
  return failures;
}

function planTemplate(goal, mode) {
  return `${V3_MARKER}\n\n## Goal\n\n${goal}\n\nMode: ${mode}\n\n## Research\n\n_Not researched yet._\n\n## Steps\n\n${STEPS_HEADER}\n${STEPS_SEPARATOR}\n\n## Acceptance\n\n${ACCEPTANCE_HEADER}\n${ACCEPTANCE_SEPARATOR}\n\n## Do not touch\n\nNone\n\n## Open questions\n\nNone\n\n## Review\n\n_No review yet._\n\n## Verification Results\n\n_Not implemented yet._\n`;
}

function replaceBlockedReason(planText, reason) {
  const lines = planText.split('\n');
  const heading = lines.indexOf('## Open questions');
  const nextHeading = lines.indexOf('## Review', heading + 1);
  if (heading === -1 || nextHeading === -1) fail('Open questions section is missing or out of order');
  const content = lines.slice(heading + 1, nextHeading);
  const probe = [...content];
  while (probe[0] === '') probe.shift();
  // Nothing to write and nothing to clear: leave the bytes untouched instead of renormalizing whitespace.
  if (reason === undefined && !/^Blocked: /.test(probe[0] ?? '')) return planText;
  while (content[0] === '') content.shift();
  if (/^Blocked: /.test(content[0] ?? '')) content.shift();
  while (content[0] === '') content.shift();
  if (reason !== undefined) content.unshift(`Blocked: ${reason}`);
  if (content.length === 0) content.push('None');
  lines.splice(heading + 1, nextHeading - heading - 1, '', ...content, '');
  return lines.join('\n');
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
    // The current closure is the only one that proves anything: an issue closed by a commit, reopened, then
    // closed by hand must not keep the earlier commit as proof, so read the latest event and require it.
    const latestClosure = issue.timelineItems.nodes.at(-1)?.closer;
    closingCommitOid = latestClosure?.__typename === 'Commit' ? latestClosure.oid : undefined;
    hasNextPage = issue.closing.pageInfo?.hasNextPage === true;
    if (issue.closing.pageInfo?.endCursor != null) after = issue.closing.pageInfo.endCursor;
  } while (hasNextPage);
  return { closing, closingCommitOid, defaultBranch };
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

function readPlanIssue(value, forWrite = false) {
  const number = parseIssueNumber(value);
  const issue = issueView(number);
  const contract = planContract(issue.body);
  if (contract !== 'v3') fail(`unreadable plan contract: #${number}`);
  if (forWrite) {
    const login = resolveActingLogin();
    const owners = (issue.assignees ?? []).map((assignee) => assignee.login).filter(Boolean);
    const foreignOwner = owners.find((owner) => owner !== login);
    if (foreignOwner) fail(`plan #${issue.number} is owned by ${foreignOwner}`);
    if (owners.length === 0) issue.claimLogin = login;
  }
  return {
    issue,
    parsed: parsePlanText(issue.body),
    record: {
      title: issue.title,
      status: statusFromIssue(issue),
      owner: (issue.assignees ?? []).map((assignee) => assignee.login).filter(Boolean)[0] ?? null,
      created: issue.createdAt,
      updated: issue.updatedAt,
    },
  };
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
}

function parseOptions(args, allowed, repeatable = new Set()) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (!allowed.has(flag) || args[index + 1] === undefined || (!repeatable.has(flag) && Object.hasOwn(options, flag))) {
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

function statusFromIssue(issue) {
  if (String(issue.state).toUpperCase() !== 'CLOSED') return statusFromLabels(issue.labels);
  switch (String(issue.stateReason).toUpperCase()) {
    case 'COMPLETED': return 'finished';
    case 'NOT_PLANNED': return 'retired';
    case 'DUPLICATE': return 'duplicate';
    default: return 'unreadable';
  }
}

function labelsToRemove(issue, target) {
  return labelNames(issue.labels)
    .filter((label) => label.startsWith('plan:') && (!target || label !== `plan:${target}`));
}

function headerStrip(issue, status) {
  return `#${issue.number} · ${status} · ${issue.title} · ${issue.url}`;
}

function labelsCommand(args) {
  const options = parseOptions(args, new Set(['--extra']), new Set(['--extra']));
  const extras = options['--extra'] ?? [];
  const labels = [...PLAN_LABELS, ...extras];
  for (const label of labels) {
    if (!label.trim() || /[\r\n]/.test(label)) fail('label names must be non-empty single-line text');
  }
  const reserved = extras.find((label) => /^plan(?::|$)/.test(label));
  if (reserved) fail(`reserved label namespace: ${reserved}`);
  for (const label of labels) {
    runGh(['label', 'create', label, '--force', '--repo', repository.nameWithOwner]);
    console.log(`label ready: ${label}`);
  }
}

function createPlan(args) {
  const options = parseOptions(args, new Set(['--title', '--goal', '--mode', '--label']), new Set(['--label']));
  if (!options['--title'] || !options['--goal']) fail('new requires --title and --goal');
  const mode = options['--mode'] ?? 'plan-and-implement';
  if (!new Set(['plan-and-implement', 'plan-only']).has(mode)) fail(`invalid plan mode: ${mode}`);
  if ([options['--title'], options['--goal']].some((value) => /[\r\n]/.test(value))) fail('title and goal must be single-line text');
  for (const label of options['--label'] ?? []) {
    if (!label.trim() || /[\r\n]/.test(label)) fail('label names must be non-empty single-line text');
    if (/^plan(?::|$)/.test(label)) fail(`reserved label namespace: ${label}`);
  }
  const body = planTemplate(options['--goal'], mode);
  const output = withBodyFile(body, (bodyFile) => {
    const argv = [
      'issue',
      'create',
      '--title',
      options['--title'],
      '--body-file',
      bodyFile,
      '--label',
      'plan',
      '--label',
      'plan:drafting',
      '--assignee',
      '@me',
    ];
    for (const label of options['--label'] ?? []) argv.push('--label', label);
    argv.push('--repo', repository.nameWithOwner);
    return runGh(argv).trim();
  });
  const match = /\/issues\/([1-9]\d*)\/?$/.exec(output);
  if (!match) fail('gh issue create returned an invalid issue URL');
  console.log(`plan created: #${match[1]} ${output}`);
}

function claimPlan(args) {
  if (args.length !== 1) fail('claim requires one issue');
  const { issue } = readPlanIssue(args[0]);
  const login = resolveActingLogin();
  const owners = (issue.assignees ?? []).map((assignee) => assignee.login);
  const foreignOwner = owners.find((owner) => owner !== login);
  if (foreignOwner) fail(`plan #${issue.number} is owned by ${foreignOwner}`);
  if (owners.includes(login)) {
    console.log(`plan #${issue.number} already claimed: ${login}`);
    return;
  }
  runGh(['issue', 'edit', String(issue.number), '--add-assignee', '@me', '--repo', repository.nameWithOwner]);
  console.log(`plan #${issue.number} claimed: ${login}`);
}

function showPlan(args) {
  const [value, ...flags] = args;
  if (!value || flags.some((flag) => flag !== '--body') || flags.length > 1) fail('show requires an issue and optional --body');
  const { issue, record } = readPlanIssue(value);
  const header = headerStrip(issue, record.status);
  if (flags[0] === '--body') {
    console.error(header);
    process.stdout.write(issue.body);
    return;
  }
  console.log(header);
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
  // Record the body this copy came from. A label-only write moves the issue timestamp without touching the
  // body, so the digest of the bytes is the only provenance that neither misses a revert nor invents one.
  fs.writeFileSync(originFile(destination), `${bodyDigest(issue.body)}\n`, { encoding: 'utf8', mode: 0o600 });
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
    throw error;
  }
  // A truncated or hand-edited sidecar must stop the edit. Treating it as absent would disable the guard
  // exactly when provenance is least trustworthy.
  if (!/^[0-9a-f]{64}$/.test(recorded)) fail(`unreadable export provenance: ${source} holds no sha256 digest; re-export the plan`);
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

function editPlan(args) {
  const [value, ...flags] = args;
  if (!value) fail('edit requires an issue and --file');
  const options = parseOptions(flags, new Set(['--file']));
  if (!options['--file']) fail('edit requires an issue and --file');
  const { issue, record } = readPlanIssue(value, true);
  const file = options['--file'];
  const after = fs.readFileSync(file, 'utf8');
  // Every body edit runs export, edit, check, delete, so a file with no sidecar was derived from bytes this
  // tool never recorded. Accepting it would let a copy or a deleted sidecar disable the guard silently.
  const origin = readOrigin(file);
  if (!origin) {
    fail(`missing export provenance: ${originFile(file)} does not exist; run \`plan.mjs export ${issue.number}\` and re-apply the edit`);
  }
  const current = bodyDigest(issue.body);
  if (origin !== current) {
    fail(
      `stale export: ${file} was exported from body ${origin.slice(0, 12)}, but #${issue.number} now holds ${current.slice(0, 12)}; re-export and re-apply the edit`,
    );
  }
  const failures = checkPlan(after, issue);
  if (failures.length > 0) fail(failures.map((message) => `${file}: ${message}`).join('\n'));
  const changes = changedLines(issue.body, after);
  // Stage provenance before the remote write. A failed sidecar write then costs one re-export; the reverse
  // order would leave a local digest naming a body GitHub already replaced, which reads as a valid export.
  fs.writeFileSync(originFile(file), `${bodyDigest(after)}\n`, { encoding: 'utf8', mode: 0o600 });
  editIssueBodyIfUnchanged(issue, after);
  console.log(headerStrip(issue, record.status));
  console.log(`changed: ${changes.length} line(s)`);
  for (const line of changes) console.log(line);
}

function checkCommand(args) {
  if (args.length === 2 && args[0] === '--file') {
    const file = args[1];
    const planText = fs.readFileSync(file, 'utf8');
    const failures = checkPlan(planText, undefined);
    if (failures.length > 0) fail(failures.map((message) => `${file}: ${message}`).join('\n'));
    console.log(`plan check passed: ${file}`);
    return;
  }
  if (args.length !== 1) fail('check requires one issue or --file path');
  // check is the validator: an unclassifiable body must surface as a numbered failure, not as a read error.
  const issue = issueView(parseIssueNumber(args[0]));
  const failures = checkPlan(issue.body, issue);
  if (failures.length > 0) fail(failures.map((message) => `#${issue.number}: ${message}`).join('\n'));
  console.log(`plan check passed: #${issue.number}`);
}

function setPlanStatus(args) {
  const [value, target, ...flags] = args;
  if (!value || !target) fail('status requires an issue and status');
  if (!PLAN_STATUSES.has(target)) fail(`unknown plan status: ${target}`);
  const options = parseOptions(flags, new Set(['--reason']));
  if (target === 'blocked' && (!String(options['--reason'] ?? '').trim() || /[\r\n]/.test(options['--reason']))) fail('blocked status requires --reason as single-line text');
  if (target !== 'blocked' && options['--reason'] !== undefined) fail('--reason is allowed only for blocked status');
  const { issue, record } = readPlanIssue(value, true);
  if (String(issue.state).toUpperCase() === 'CLOSED') {
    fail(`plan #${issue.number} is closed; status applies to open plans`);
  }
  const current = record.status;
  if (!new Set(['unreadable', 'unlabelled']).has(current) && !STATUS_TRANSITIONS[current]?.has(target)) {
    fail(`illegal plan status transition: ${current} -> ${target}`);
  }
  const after = replaceBlockedReason(issue.body, target === 'blocked' ? options['--reason'] : undefined);
  const labels = { add: `plan:${target}`, remove: labelsToRemove(issue, target) };
  // A phase-only move changes no body bytes, so it stays a label write and cannot lose a concurrent body edit.
  if (after === issue.body) editIssueLabelsIfBodyUnchanged(issue, labels);
  else editIssueBodyIfUnchanged(issue, after, labels);
  console.log(`plan #${issue.number} status: ${current} -> ${target}`);
}

function setStepStatus(args) {
  const [value, stepId, target] = args;
  if (!value || !stepId || !target || args.length !== 3) fail('step requires an issue, step id, and status');
  if (!STEP_STATUSES.has(target)) fail(`unknown step status: ${target}`);
  const { issue, parsed, record } = readPlanIssue(value, true);
  if (record.status !== 'ongoing') fail(`plan status is ${record.status}; expected ongoing`);
  const { sections } = sectionMap(parsed.body);
  const table = parseRows(sections.get('Steps') ?? '', STEPS_HEADER, STEPS_SEPARATOR, 8);
  const row = table.rows.find(({ cells }) => cells[1] === stepId);
  if (!row) fail(`unknown step id: ${stepId}`);
  const current = unquoteCode(row.cells[6]);
  if (!STEP_TRANSITIONS[current]?.has(target)) fail(`illegal step status transition: ${current} -> ${target}`);
  if (new Set(['in-flight', 'done']).has(target) && row.cells[4] !== '—') {
    const byNumber = new Map(table.rows.map((entry) => [entry.cells[0], unquoteCode(entry.cells[6])]));
    const unfinished = row.cells[4].split(',').map((dependency) => dependency.trim()).filter((number) => !new Set(['done', 'skipped']).has(byNumber.get(number)));
    if (unfinished.length > 0) fail(`step:${stepId} has unfinished dependency ${unfinished.join(', ')}`);
  }
  const bodyLines = parsed.body.split('\n');
  const stepSectionStart = bodyLines.indexOf('## Steps') + 1;
  const rowIndex = bodyLines.findIndex((line, index) => index >= stepSectionStart && line === row.line);
  const parts = bodyLines[rowIndex].split('|');
  parts[7] = parts[7].replace(current, target);
  bodyLines[rowIndex] = parts.join('|');
  const after = `${issue.body.slice(0, issue.body.length - parsed.body.length)}${bodyLines.join('\n')}`;
  editIssueBodyIfUnchanged(issue, after);
  console.log(`plan #${issue.number} step ${stepId}: ${current} -> ${target}`);
}

function issueListings() {
  const issues = parseJson(
    runGh(['issue', 'list', '--label', 'plan', '--state', 'all', '--limit', '500', '--json', ISSUE_FIELDS.replace('body,', ''), '--repo', repository.nameWithOwner]),
    'gh issue list',
  );
  return issues
    .map((issue) => ({
      ...issue,
      status: statusFromIssue(issue),
      owner: (issue.assignees ?? []).map((assignee) => assignee.login).filter(Boolean)[0] ?? null,
      created: issue.createdAt,
      updated: issue.updatedAt,
    }))
    .sort((left, right) => {
      const leftClosed = String(left.state).toUpperCase() === 'CLOSED' ? 1 : 0;
      const rightClosed = String(right.state).toUpperCase() === 'CLOSED' ? 1 : 0;
      return leftClosed - rightClosed || left.number - right.number;
    });
}

function listPlans(args) {
  const options = parseOptions(args, new Set(['--status']));
  const selectableStatuses = new Set([...PLAN_STATUSES, 'finished', 'retired', 'duplicate', 'unlabelled', 'unreadable']);
  if (options['--status'] && !selectableStatuses.has(options['--status'])) fail(`unknown plan status: ${options['--status']}`);
  for (const issue of issueListings()) {
    if (!options['--status'] || issue.status === options['--status']) console.log(`${issue.status}\t#${issue.number}\t${issue.title}`);
  }
}

function parseQueue(queueText) {
  const lines = queueText.split('\n');
  const headerIndex = lines.indexOf('| Stage | Plan | Depends on | Why |');
  if (headerIndex === -1 || lines[headerIndex + 1] !== '|---:|---|---|---|') fail('queue table header is invalid');
  const rows = [];
  const planValues = new Set();
  for (let index = headerIndex + 2; index < lines.length && lines[index].startsWith('|'); index += 1) {
    const cells = lines[index].slice(1, -1).split('|').map((cell) => cell.trim());
    if (cells.length !== 4 || !/^\d+$/.test(cells[0]) || !cells[1] || !cells[3]) fail(`queue row ${index + 1} is invalid`);
    if (planValues.has(cells[1])) fail(`duplicate queue plan ${cells[1]}`);
    planValues.add(cells[1]);
    const numeric = /^#?([1-9]\d*)$/.exec(cells[1]);
    rows.push({
      stage: Number(cells[0]),
      plan: cells[1],
      number: numeric ? Number(numeric[1]) : undefined,
      dependencies: cells[2] === '—' ? [] : cells[2].split(',').map((item) => item.trim()),
      order: rows.length,
    });
  }
  return rows.sort((left, right) => left.stage - right.stage || left.order - right.order);
}

function nextPlans(args) {
  if (args.length > 0) fail('next takes no arguments');
  const listings = issueListings();
  const planned = new Set(listings.filter(({ status }) => status === 'planned').map(({ number }) => number));
  const finished = new Set(listings.filter(({ status }) => status === 'finished').map(({ number }) => number));
  const queueFile = 'docs/PLAN-QUEUE.md';
  if (fs.existsSync(queueFile)) {
    try {
      const rows = parseQueue(fs.readFileSync(queueFile, 'utf8'));
      if (rows.length > 0) {
        const byReference = new Map(rows.map((row) => [row.plan.replace(/^#/, ''), row]));
        const dependencyClosureIsFinished = (reference, seen = new Set()) => {
          const key = reference.replace(/^#/, '');
          if (seen.has(key) || !/^[1-9]\d*$/.test(key)) return false;
          const number = Number(key);
          if (!finished.has(number)) return false;
          const dependencyRow = byReference.get(key);
          if (!dependencyRow || dependencyRow.number === undefined) return dependencyRow === undefined;
          const nextSeen = new Set(seen).add(key);
          return dependencyRow.dependencies.every((dependency) => dependencyClosureIsFinished(dependency, nextSeen));
        };
        for (const row of rows) {
          if (row.number !== undefined && planned.has(row.number) && row.dependencies.every((dependency) => dependencyClosureIsFinished(dependency))) console.log(`#${row.number}`);
        }
        return;
      }
    } catch (error) {
      console.error(`warning: malformed ${queueFile}: ${error.message}; falling back to planned plans`);
    }
  } else {
    console.error(`warning: missing ${queueFile}; falling back to planned plans`);
  }
  for (const number of [...planned].sort((left, right) => left - right)) console.log(`#${number}`);
}

function archivePlan(args, retired = false) {
  const [value, ...flags] = args;
  if (!value) fail(`${retired ? 'retire' : 'archive'} requires an issue`);
  const options = parseOptions(flags, retired ? new Set(['--reason']) : new Set());
  if (retired && (!String(options['--reason'] ?? '').trim() || /[\r\n]/.test(options['--reason']))) fail('retire requires a single-line --reason');
  const { issue, parsed, record } = readPlanIssue(value, true);
  if (retired && String(issue.state).toUpperCase() === 'CLOSED') fail(`cannot retire a ${record.status} plan`);
  if (!retired && record.status !== 'finished') fail(`archive requires finished status, found ${record.status}`);

  let closingPullRequest;
  if (!retired) {
    const { sections } = sectionMap(parsed.body);
    const steps = parseRows(sections.get('Steps') ?? '', STEPS_HEADER, STEPS_SEPARATOR, 8).rows;
    const unfinished = steps.length === 0 ? { cells: ['', '(missing)'] } : steps.find(({ cells }) => !new Set(['done', 'skipped']).has(unquoteCode(cells[6])));
    if (unfinished) fail(`archive refused: non-terminal step ${unfinished.cells[1]}`);
    if (!/^Code-review: pass$/m.test(sections.get('Review') ?? '')) fail('archive requires Code-review: pass');

    const { closing, closingCommitOid, defaultBranch } = archivePullRequestReferences(issue.number);
    if (closing.length > 0) {
      closingPullRequest = closing.find((reference) => (
        reference.state === 'MERGED' &&
        reference.mergedAt &&
        reference.repository?.nameWithOwner === repository.nameWithOwner &&
        reference.baseRefName === defaultBranch
      ));
      if (!closingPullRequest) {
        const wrongBranch = closing.find((reference) => reference.state === 'MERGED' && reference.mergedAt)?.baseRefName;
        if (wrongBranch) fail(`archive requires a pull request merged into ${defaultBranch}, found ${wrongBranch}`);
        fail(`archive requires a closing pull request merged into ${repository.nameWithOwner}:${defaultBranch}`);
      }
    } else {
      if (!closingCommitOid) fail('archive requires a merged closing pull request; issue has no closing commit');
      const associated = associatedPullRequests(closingCommitOid);
      closingPullRequest = associated.pullRequests.find((reference) => (
        reference.state === 'MERGED' &&
        reference.mergedAt &&
        reference.repository?.nameWithOwner === repository.nameWithOwner &&
        reference.baseRefName === associated.defaultBranch
      ));
      if (!closingPullRequest) {
        const wrongBranch = associated.pullRequests.find((reference) => reference.state === 'MERGED' && reference.mergedAt)?.baseRefName;
        if (wrongBranch) fail(`archive requires a pull request merged into ${associated.defaultBranch}, found ${wrongBranch}`);
        fail(`archive requires a merged closing pull request; closing commit ${closingCommitOid} has no associated merged pull request into ${associated.defaultBranch}`);
      }
    }
  }

  if (retired) {
    runGh([
      'issue',
      'close',
      String(issue.number),
      '--reason',
      'not planned',
      '--comment',
      options['--reason'],
      '--repo',
      repository.nameWithOwner,
    ]);
  }
  editIssueLabelsIfBodyUnchanged(issue, { remove: labelsToRemove(issue) });
  if (retired) console.log(`plan #${issue.number} retired`);
  else {
    const url = closingPullRequest.url ?? `https://github.com/${repository.nameWithOwner}/pull/${closingPullRequest.number}`;
    console.log(`plan #${issue.number} finished (closed by ${url})`);
  }
}

function usage() {
  return 'usage: plan.mjs <labels|new|claim|show|export|edit|check|status|step|list|next|archive|retire> ...';
}

function main(argv) {
  const [command, ...args] = argv;
  if (!command) fail(usage());
  const commands = {
    labels: labelsCommand,
    new: createPlan,
    claim: claimPlan,
    show: showPlan,
    export: exportPlan,
    edit: editPlan,
    check: checkCommand,
    status: setPlanStatus,
    step: setStepStatus,
    list: listPlans,
    next: nextPlans,
    archive: (values) => archivePlan(values),
    retire: (values) => archivePlan(values, true),
  };
  if (!commands[command]) fail(usage());
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
