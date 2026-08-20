#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const PLAN_STATUSES = new Set(['drafting', 'planned', 'ongoing', 'blocked', 'finished']);
const STEP_STATUSES = new Set(['planned', 'in-flight', 'done', 'blocked', 'skipped']);
const STEP_EFFECTS = new Set(['local', 'probe', 'production_access', 'publish', 'push', 'release', 'deploy']);
const BASE_KEYS = ['plan_contract', 'title', 'goal', 'status', 'created', 'updated', 'assignee'];
const SECTIONS = ['Goal', 'Research', 'Steps', 'Acceptance', 'Do not touch', 'Open questions', 'Review', 'Verification Results'];
const STEPS_HEADER = '| # | Id | Task | Files | Depends | Effect | Status | Done when |';
const STEPS_SEPARATOR = '|---:|---|---|---|---|---|---|---|';
const ACCEPTANCE_HEADER = '| ID | Command | Expected |';
const ACCEPTANCE_SEPARATOR = '|---|---|---|';
const PLAN_LABELS = ['plan', 'plan:drafting', 'plan:planned', 'plan:ongoing', 'plan:blocked', 'plan:finished', 'plan-scheduled'];
const STATUS_TRANSITIONS = {
  drafting: new Set(['planned', 'ongoing', 'blocked']),
  planned: new Set(['drafting', 'ongoing', 'blocked']),
  ongoing: new Set(['finished', 'blocked']),
  blocked: new Set(['drafting', 'planned', 'ongoing']),
  finished: new Set(),
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
const CLOSING_PULL_REQUESTS_QUERY = `query($owner:String!,$name:String!,$number:Int!,$after:String,$afterUser:String){
  repository(owner:$owner,name:$name){
    issue(number:$number){
      closing: closedByPullRequestsReferences(first:100, after:$after){
        nodes{ number mergedAt baseRefName repository{ nameWithOwner defaultBranchRef{ name } } }
        pageInfo{ hasNextPage endCursor }
      }
      userLinked: closedByPullRequestsReferences(first:100, after:$afterUser, userLinkedOnly:true){
        nodes{ number repository{ nameWithOwner } }
        pageInfo{ hasNextPage endCursor }
      }
    }
  }
}`;
let repository;
let actingLogin;
 

function fail(message) {
  throw new Error(message);
}

function utcTimestamp() {
  return new Date().toISOString().replace('Z', '+00:00');
}

function parseFrontmatter(planText) {
  if (!planText.startsWith('---\n')) fail('frontmatter must open with ---');
  const end = planText.indexOf('\n---\n', 4);
  if (end === -1) fail('frontmatter must close with ---');
  const source = planText.slice(4, end);
  const lines = source.split('\n');
  const entries = [];
  const values = {};
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([a-z_]+):(?: (.*))?$/.exec(lines[index]);
    if (!match) fail(`invalid frontmatter line ${index + 2}`);
    const [, key, raw = ''] = match;
    if (Object.hasOwn(values, key)) fail(`duplicate frontmatter key ${key}`);
    let value = raw;
    if (raw === 'null') {
      value = null;
    } else if (/^".*"$/.test(raw)) {
      try {
        value = JSON.parse(raw);
      } catch {
        fail(`invalid quoted scalar for ${key}`);
      }
    }
    entries.push({ key, raw });
    values[key] = value;
  }
  return { body: planText.slice(end + 5), entries, values };
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
      labels: Object.hasOwn(planRef, 'labels') ? labelNames(planRef.labels) : undefined,
    };
  }
  const value = String(planRef).trim();
  const match = /(?:^#?|\/issues\/)([1-9]\d*)$/.exec(value);
  if (!match) return undefined;
  return { number: Number(match[1]), url: value.includes('/issues/') ? value : undefined, labels: undefined };
}

export function machinePathCitations(planText) {
  return planText
    .split('\n')
    .filter((line) => !/^[A-Z][A-Za-z0-9-]*: *\{/.test(line) && /\/home\/[a-z]|\/Users\/[A-Za-z]/.test(line));
}

export function checkPlan(planText, planRef) {
  const failures = [];
  let parsed;
  try {
    parsed = parseFrontmatter(planText);
  } catch (error) {
    return [`check 1: ${error.message}`];
  }
  const { body, entries, values } = parsed;
  const expectedKeys = values.status === 'blocked' ? BASE_KEYS.toSpliced(4, 0, 'blocked_reason') : BASE_KEYS;
  const actualKeys = entries.map(({ key }) => key);
  const firstMisplacedKey = actualKeys.find((key, index) => key !== expectedKeys[index]);
  const keysMatch = actualKeys.length === expectedKeys.length && firstMisplacedKey === undefined;
  if (!keysMatch || values.plan_contract !== 'v2' || values.assignee !== null) {
    const positionFailure = firstMisplacedKey
      ? `; frontmatter key ${firstMisplacedKey} is out of position (expected ${expectedKeys[actualKeys.indexOf(firstMisplacedKey)] ?? 'no additional key'})`
      : '';
    failures.push(`check 1: frontmatter keys and plan_contract must match the closed v2 map${positionFailure}`);
  }
  if (!PLAN_STATUSES.has(values.status)) failures.push('check 2: status is not recognized');
  if (values.status === 'blocked' && !String(values.blocked_reason ?? '').trim()) {
    failures.push('check 2: blocked status requires blocked_reason');
  }
  if (values.status !== 'blocked' && Object.hasOwn(values, 'blocked_reason')) {
    failures.push('check 2: blocked_reason is allowed only for blocked status');
  }
  const identity = issueIdentity(planRef);
  if (identity?.labels !== undefined) {
    const statusLabels = identity.labels.filter((label) => label.startsWith('plan:'));
    if (statusLabels.length !== 1 || statusLabels[0] !== `plan:${values.status}`) {
      failures.push('check 2: plan label must mirror the frontmatter status');
    }
  }
  if (typeof values.title !== 'string' || !values.title.trim() || values.title.length > 70) {
    failures.push('check 3: title must contain 1 to 70 characters');
  }
  if (typeof values.goal !== 'string' || !values.goal.trim() || values.goal.length > 200) {
    failures.push('check 3: goal must contain 1 to 200 characters');
  }
  const timestampPattern = /^"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})"$/;
  const createdRaw = entries.find(({ key }) => key === 'created')?.raw ?? '';
  const updatedRaw = entries.find(({ key }) => key === 'updated')?.raw ?? '';
  if (
    !timestampPattern.test(createdRaw) ||
    !timestampPattern.test(updatedRaw) ||
    !Number.isFinite(Date.parse(values.created)) ||
    !Number.isFinite(Date.parse(values.updated)) ||
    Date.parse(values.updated) < Date.parse(values.created)
  ) {
    failures.push('check 4: created and updated must be quoted offset timestamps in chronological order');
  }
  const { headings, sections } = sectionMap(body);
  const requiredHeadings = headings.filter((heading) => heading !== 'Retirement');
  const retirementCount = headings.filter((heading) => heading === 'Retirement').length;
  const retirementValid = retirementCount <= 1 && (retirementCount === 0 || headings.at(-1) === 'Retirement');
  if (requiredHeadings.join('\0') !== SECTIONS.join('\0') || !retirementValid) {
    failures.push('check 5: required sections must appear once in contract order and Retirement must be last');
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
  for (const citation of body.matchAll(/\bstep:([A-Za-z0-9_-]+)\b/g)) {
    if (!stepIds.has(citation[1])) failures.push(`check 7: unknown step citation step:${citation[1]}`);
  }
  if (/\bstep \d+\b/.test(body)) failures.push('check 7: bare numeric step citation is not allowed');
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
  if (machinePathCitations(body).length > 0) failures.push('check 10: body contains an absolute machine path');
  const researchIsPlaceholder = (sections.get('Research') ?? '').includes('_Not researched yet._');
  if (researchIsPlaceholder && values.status !== 'drafting') {
    failures.push('check 11: Research must be filled once the plan leaves drafting');
  }
  if (identity?.number !== undefined) {
    const references = new Set([String(identity.number), `#${identity.number}`]);
    if (identity.url) references.add(identity.url);
    if ([...stepFiles].some((file) => references.has(file))) failures.push('check 12: Steps Files contains the plan issue itself');
  }
  const modes = [...(sections.get('Goal') ?? '').matchAll(/^Mode: (plan-and-implement|plan-only)$/gm)];
  if (modes.length !== 1) failures.push('check 13: Goal must contain exactly one valid Mode line');
  return failures;
}

function planTemplate(title, goal, mode) {
  const now = utcTimestamp();
  return `---\nplan_contract: v2\ntitle: ${title}\ngoal: ${goal}\nstatus: drafting\ncreated: "${now}"\nupdated: "${now}"\nassignee: null\n---\n\n## Goal\n\n${goal}\n\nMode: ${mode}\n\n## Research\n\n_Not researched yet._\n\n## Steps\n\n${STEPS_HEADER}\n${STEPS_SEPARATOR}\n\n## Acceptance\n\n${ACCEPTANCE_HEADER}\n${ACCEPTANCE_SEPARATOR}\n\n## Do not touch\n\nNone\n\n## Open questions\n\nNone\n\n## Review\n\n_No review yet._\n\n## Verification Results\n\n_Not implemented yet._\n`;
}

function replaceFrontmatterFields(planText, fields) {
  let updated = planText;
  for (const [key, value] of Object.entries(fields)) {
    const line = `${key}: ${value}`;
    const pattern = new RegExp(`^${key}:.*$`, 'm');
    if (pattern.test(updated)) updated = updated.replace(pattern, line);
    else if (key === 'blocked_reason') updated = updated.replace(/^status:.*$/m, (statusLine) => `${statusLine}\n${line}`);
  }
  if (fields.blocked_reason === undefined) updated = updated.replace(/^blocked_reason:.*\n/m, '');
  return updated;
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

function archivePullRequestReferences(issueNumber) {
  const [owner, name, ...extra] = repository.nameWithOwner.split('/');
  if (!owner || !name || extra.length > 0) fail(`invalid repository name: ${repository.nameWithOwner}`);
  const closing = [];
  const userLinked = [];
  let after;
  let afterUser;
  let hasNextPage;
  let hasNextUserPage;
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
    if (afterUser !== undefined) argv.push('-F', `afterUser=${afterUser}`);
    const response = parseJson(runGh(argv), 'gh api graphql');
    const issue = response.data?.repository?.issue;
    if (!issue || !Array.isArray(issue.closing?.nodes) || !Array.isArray(issue.userLinked?.nodes)) {
      fail('gh api graphql returned malformed closing pull request references');
    }
    closing.push(...issue.closing.nodes);
    userLinked.push(...issue.userLinked.nodes);
    hasNextPage = issue.closing.pageInfo?.hasNextPage === true;
    hasNextUserPage = issue.userLinked.pageInfo?.hasNextPage === true;
    if (issue.closing.pageInfo?.endCursor != null) after = issue.closing.pageInfo.endCursor;
    if (issue.userLinked.pageInfo?.endCursor != null) afterUser = issue.userLinked.pageInfo.endCursor;
  } while (hasNextPage || hasNextUserPage);
  return { closing, userLinked };
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
  if (!/^plan_contract: v2$/m.test(issue.body.slice(0, issue.body.indexOf('\n---\n', 4)))) {
    fail(`not a v2 plan: #${number} (no plan_contract: v2)`);
  }
  if (forWrite) {
    const login = resolveActingLogin();
    const owners = (issue.assignees ?? []).map((assignee) => assignee.login).filter(Boolean);
    const foreignOwner = owners.find((owner) => owner !== login);
    if (foreignOwner) fail(`plan #${issue.number} is owned by ${foreignOwner}`);
    if (owners.length === 0) issue.claimLogin = login;
  }
  return { issue, parsed: parseFrontmatter(issue.body) };
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
  return statuses.length === 1 ? statuses[0] : 'unreadable';
}

function labelsToRemove(issue, target) {
  return labelNames(issue.labels).filter((label) => label.startsWith('plan:') && label !== `plan:${target}`);
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
  const body = planTemplate(options['--title'], options['--goal'], mode);
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
  const { issue, parsed } = readPlanIssue(value);
  const header = headerStrip(issue, parsed.values.status);
  if (flags[0] === '--body') {
    console.error(header);
    process.stdout.write(issue.body);
    return;
  }
  console.log(header);
}

function exportPlan(args) {
  if (args.length !== 1) fail('export requires one issue');
  const { issue } = readPlanIssue(args[0]);
  const result = spawnSync('git', ['rev-parse', '--git-path', 'docks-review'], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') fail('git is not installed or not on PATH');
  if (result.error) fail(`git rev-parse failed: ${result.error.message}`);
  if (result.status !== 0) fail(`git rev-parse failed: ${result.stderr.trim() || `exit ${result.status}`}`);
  const gitPath = result.stdout.trim();
  if (!gitPath) fail('git rev-parse failed: empty git path');
  const directory = path.resolve(process.cwd(), gitPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const destination = path.join(directory, `plan-${issue.number}.md`);
  fs.writeFileSync(destination, issue.body, { encoding: 'utf8', mode: 0o600 });
  console.log(destination);
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
  const { issue } = readPlanIssue(value, true);
  const after = fs.readFileSync(options['--file'], 'utf8');
  const failures = checkPlan(after, issue);
  if (failures.length > 0) fail(failures.map((message) => `${options['--file']}: ${message}`).join('\n'));
  const changes = changedLines(issue.body, after);
  editIssueBodyIfUnchanged(issue, after);
  const status = parseFrontmatter(after).values.status;
  console.log(headerStrip(issue, status));
  console.log(`changed: ${changes.length} line(s)`);
  for (const line of changes) console.log(line);
}

function checkCommand(args) {
  if (args.length === 2 && args[0] === '--file') {
    const file = args[1];
    const planText = fs.readFileSync(file, 'utf8');
    if (!/^plan_contract: v2$/m.test(planText.slice(0, planText.indexOf('\n---\n', 4)))) {
      fail(`not a v2 plan: ${file} (no plan_contract: v2)`);
    }
    const failures = checkPlan(planText, undefined);
    if (failures.length > 0) fail(failures.map((message) => `${file}: ${message}`).join('\n'));
    console.log(`plan check passed: ${file}`);
    return;
  }
  if (args.length !== 1) fail('check requires one issue or --file path');
  const { issue } = readPlanIssue(args[0]);
  const failures = checkPlan(issue.body, issue);
  if (failures.length > 0) fail(failures.map((message) => `#${issue.number}: ${message}`).join('\n'));
  console.log(`plan check passed: #${issue.number}`);
}

function setPlanStatus(args) {
  const [value, target, ...flags] = args;
  if (!value || !target) fail('status requires an issue and status');
  const options = parseOptions(flags, new Set(['--reason']));
  if (target === 'blocked' && (!String(options['--reason'] ?? '').trim() || /[\r\n]/.test(options['--reason']))) fail('blocked status requires --reason as single-line text');
  if (target !== 'blocked' && options['--reason'] !== undefined) fail('--reason is allowed only for blocked status');
  const { issue, parsed } = readPlanIssue(value, true);
  const current = parsed.values.status;
  if (!STATUS_TRANSITIONS[current]?.has(target)) fail(`illegal plan status transition: ${current} -> ${target}`);
  const after = replaceFrontmatterFields(issue.body, {
    status: target,
    blocked_reason: target === 'blocked' ? options['--reason'] : undefined,
    updated: `"${utcTimestamp()}"`,
  });
  editIssueBodyIfUnchanged(issue, after, { add: `plan:${target}`, remove: labelsToRemove(issue, target) });
  console.log(`plan #${issue.number} status: ${current} -> ${target}`);
}

function setStepStatus(args) {
  const [value, stepId, target] = args;
  if (!value || !stepId || !target || args.length !== 3) fail('step requires an issue, step id, and status');
  if (!STEP_STATUSES.has(target)) fail(`unknown step status: ${target}`);
  const { issue, parsed } = readPlanIssue(value, true);
  if (parsed.values.status !== 'ongoing') fail(`plan status is ${parsed.values.status}; expected ongoing`);
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
  let after = `${issue.body.slice(0, issue.body.length - parsed.body.length)}${bodyLines.join('\n')}`;
  after = replaceFrontmatterFields(after, { updated: `"${utcTimestamp()}"` });
  editIssueBodyIfUnchanged(issue, after);
  console.log(`plan #${issue.number} step ${stepId}: ${current} -> ${target}`);
}

function issueListings() {
  const issues = parseJson(
    runGh(['issue', 'list', '--label', 'plan', '--state', 'all', '--limit', '500', '--json', 'number,title,state,labels', '--repo', repository.nameWithOwner]),
    'gh issue list',
  );
  return issues
    .map((issue) => ({ ...issue, status: statusFromLabels(issue.labels) }))
    .sort((left, right) => {
      const leftClosed = String(left.state).toUpperCase() === 'CLOSED' ? 1 : 0;
      const rightClosed = String(right.state).toUpperCase() === 'CLOSED' ? 1 : 0;
      return leftClosed - rightClosed || left.number - right.number;
    });
}

function listPlans(args) {
  const options = parseOptions(args, new Set(['--status']));
  const selectableStatuses = new Set([...PLAN_STATUSES, 'unreadable']);
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
  const finished = new Set(listings.filter((issue) => String(issue.state).toUpperCase() === 'CLOSED' || labelNames(issue.labels).includes('plan:finished')).map(({ number }) => number));
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
  const { issue, parsed } = readPlanIssue(value, true);
  if (retired && parsed.values.status === 'finished') fail('cannot retire a finished plan');
  if (!retired && parsed.values.status !== 'ongoing') fail(`archive requires ongoing status, found ${parsed.values.status}`);
  let closingPullRequest;
  if (!retired) {
    const { sections } = sectionMap(parsed.body);
    const steps = parseRows(sections.get('Steps') ?? '', STEPS_HEADER, STEPS_SEPARATOR, 8).rows;
    const unfinished = steps.length === 0 ? { cells: ['', '(missing)'] } : steps.find(({ cells }) => !new Set(['done', 'skipped']).has(unquoteCode(cells[6])));
    if (unfinished) fail(`archive refused: non-terminal step ${unfinished.cells[1]}`);
    if (!/^Code-review: pass$/m.test(sections.get('Review') ?? '')) fail('archive requires Code-review: pass');
    const { closing, userLinked } = archivePullRequestReferences(issue.number);
    const userLinkedPairs = new Set(
      userLinked.map((reference) => `${reference.repository?.nameWithOwner}#${reference.number}`),
    );
    let wrongBranch;
    let manuallyLinked;
    for (const reference of closing) {
      if (!reference.mergedAt) continue;
      const repo = reference.repository?.nameWithOwner;
      const defaultBranch = reference.repository?.defaultBranchRef?.name;
      if (!repo || !defaultBranch) fail('gh api graphql returned malformed closing pull request references');
      if (reference.baseRefName !== defaultBranch) {
        wrongBranch ??= { defaultBranch, found: reference.baseRefName };
        continue;
      }
      if (userLinkedPairs.has(`${repo}#${reference.number}`)) {
        manuallyLinked ??= reference;
        continue;
      }
      closingPullRequest = {
        url: `https://github.com/${repo}/pull/${reference.number}`,
      };
      break;
    }
    if (!closingPullRequest) {
      if (manuallyLinked) {
        fail(`archive requires a keyword-linked pull request; #${manuallyLinked.number} is manually linked`);
      }
      if (wrongBranch) {
        fail(`archive requires a pull request merged into ${wrongBranch.defaultBranch}, found ${wrongBranch.found}`);
      }
      fail('archive requires a merged linked pull request');
    }
  }
  let after = replaceFrontmatterFields(issue.body, { status: 'finished', blocked_reason: undefined, updated: `"${utcTimestamp()}"` });
  if (retired) {
    if (/^## Retirement$/m.test(parsed.body)) fail('plan already has a Retirement section');
    after = `${after.trimEnd()}\n\n## Retirement\n\n${options['--reason']}\n`;
  }
  editIssueBodyIfUnchanged(issue, after, { add: 'plan:finished', remove: labelsToRemove(issue, 'finished') });
  runGh(['issue', 'close', String(issue.number), '--reason', retired ? 'not planned' : 'completed', '--repo', repository.nameWithOwner]);
  if (retired) console.log(`plan #${issue.number} retired`);
  else console.log(`plan #${issue.number} finished (closed by ${closingPullRequest.url})`);
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
