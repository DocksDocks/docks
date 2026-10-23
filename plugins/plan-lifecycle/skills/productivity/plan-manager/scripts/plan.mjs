#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PLAN_STATUSES = new Set(['drafting', 'planned', 'ongoing', 'blocked']);
const STEP_STATUSES = new Set(['planned', 'in-flight', 'done', 'blocked', 'skipped']);
const STEP_EFFECTS = new Set(['local', 'probe', 'production_access', 'publish', 'push', 'release', 'deploy']);
const STEPS_HEADER = '| # | Id | Task | Files | Depends | Effect | Status | Done when |';
const STEPS_SEPARATOR = '|---:|---|---|---|---|---|---|---|';
const ACCEPTANCE_HEADER = '| ID | Command | Expected |';
const ACCEPTANCE_SEPARATOR = '|---|---|---|';
const PLAN_LABELS = ['plan', 'plan:drafting', 'plan:planned', 'plan:ongoing', 'plan:blocked'];
const ACTING_LOGIN_ERROR = 'cannot resolve the acting GitHub login (the GraphQL viewer.login lookup returned nothing)';
const PAGE_INFO = 'pageInfo{hasNextPage endCursor}';
const PULL_REQUEST_FIELDS = 'number url state mergedAt baseRefName repository{nameWithOwner}';
const PULL_REQUEST_CONNECTION = `nodes{${PULL_REQUEST_FIELDS}} ${PAGE_INFO}`;
const REPOSITORY_LABELS = PLAN_LABELS.map((name) => `${name.split(':').at(-1)}:label(name:"${name}"){name id}`);
// The pre-write read returns the body to compare and the node ids that the write mutation needs.
const PRE_WRITE_FIELDS = 'id,body,updatedAt,labels,assignees';
// The last field of a write mutation returns the stored state that the post-write checks read.
const STORED_ISSUE_FIELDS = `body labels(first:100){nodes{name} ${PAGE_INFO}} assignees(first:100){nodes{login}}`;
// `list` reads the newest plans first, as `gh issue list` did, so the 500-plan cap keeps the same plans.
const PLAN_LIST_ARGS = ',labels:["plan"],states:[OPEN,CLOSED],orderBy:{field:CREATED_AT,direction:DESC}';
const PLAN_LIST_FIELDS = 'number title state stateReason labels(first:100){nodes{name}}';
const GH_MAX_BUFFER_MIB = 256;
const PLAN_LIST_LIMIT = 500;
// A machine path points into a user or root home, a mount, a named temporary or runtime directory,
// a Windows drive, or a network share. URL routes, slash prose, and portable system paths such as
// /usr/bin/env or a bare /tmp do not match (#71). The match runs to the next space or delimiter.
const MACHINE_PATH =
  /(?<=^|[\s("'`[{=:;,>]|file:\/\/)(?:\/(?:home|Users|root|mnt|media|Volumes|run\/(?:user|media))\/[^\s/`'")]|\/(?:private\/)?(?:tmp|var\/tmp)\/[^\s/`'")]|\/(?:private\/)?var\/folders\/|[A-Za-z]:[\\/]|\\\\[\w.$-]+\\[\w.$-])[^\s`'"()[\]{}|,;]*/gm;
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
  return (labels ?? []).map((label) => token(typeof label === 'string' ? label : label.name));
}
function runGh(argv) {
  const result = spawnSync('gh', argv, { encoding: 'utf8', maxBuffer: GH_MAX_BUFFER_MIB * 1024 * 1024 });
  if (result.error?.code === 'ENOENT') fail('gh is not installed or not on PATH');
  if (result.error?.code === 'ENOBUFS')
    fail(`gh ${argv.slice(0, 2).join(' ')} output exceeded ${GH_MAX_BUFFER_MIB} MiB`);
  if (result.error) fail(`gh ${argv.slice(0, 2).join(' ')} failed: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = result.stderr.trim() || `exit ${result.status}`;
    fail(`gh ${argv.slice(0, 2).join(' ')} failed: ${detail}`);
  }
  return result.stdout;
}
// Run `gh api graphql` with the given fields and return the response data.
function graphqlData(fields) {
  const response = parseJson(runGh(['api', 'graphql', ...fields]), 'gh api graphql');
  if (!response || (response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length))) {
    fail(`gh api graphql returned errors: ${response?.errors?.[0]?.message ?? 'malformed errors'}`);
  }
  if (!response.data || typeof response.data !== 'object') fail('gh api graphql returned missing data');
  return response.data;
}
function graphql(query, variables = {}) {
  const fields = ['-f', `query=${query}`, '-F', 'owner={owner}', '-F', 'name={repo}'];
  for (const [key, value] of Object.entries(variables)) fields.push('-F', `${key}=${value}`);
  return graphqlData(fields);
}
function parseJson(output, command) {
  try {
    return JSON.parse(output);
  } catch {
    fail(`${command} returned invalid JSON`);
  }
}
const ASSIGNEE_FIELDS = '... on Actor{login}';
const LABELED_EVENT_FIELDS = '... on LabeledEvent{label{name}}';
const CLOSED_EVENT_FIELDS = `... on ClosedEvent{closer{__typename ... on PullRequest{${PULL_REQUEST_FIELDS} body} ... on Commit{oid associatedPullRequests(first:100){${PULL_REQUEST_CONNECTION}}}}}`;

function issueConnectionSelection(field, nodeFields, extraArgs = '', after = false) {
  return `${field}(first:100${after ? ',after:$after' : ''}${extraArgs}){nodes{${nodeFields}} ${PAGE_INFO}}`;
}

function connectionNodes(initial, name, nextPage, limit = Infinity) {
  const nodes = [];
  const seen = new Set();
  let connection = initial;
  for (;;) {
    if (
      !connection ||
      !Array.isArray(connection.nodes) ||
      !connection.pageInfo ||
      typeof connection.pageInfo.hasNextPage !== 'boolean' ||
      !Object.hasOwn(connection.pageInfo, 'endCursor') ||
      (connection.pageInfo.endCursor !== null && typeof connection.pageInfo.endCursor !== 'string') ||
      connection.nodes.some((node) => !node || typeof node !== 'object')
    )
      fail(`gh api graphql returned malformed ${name}`);
    nodes.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage || nodes.length >= limit) return nodes;
    const cursor = connection.pageInfo.endCursor;
    if (typeof cursor !== 'string' || !cursor || seen.has(cursor))
      fail(`gh api graphql returned malformed ${name} cursor`);
    seen.add(cursor);
    connection = nextPage(cursor);
  }
}

function pullRequestNodes(nodes) {
  if (
    nodes.some(
      (pr) =>
        !Number.isInteger(pr.number) ||
        pr.number < 1 ||
        typeof pr.url !== 'string' ||
        typeof pr.state !== 'string' ||
        (pr.mergedAt !== null && typeof pr.mergedAt !== 'string') ||
        typeof pr.baseRefName !== 'string' ||
        typeof pr.repository?.nameWithOwner !== 'string',
    )
  )
    fail('gh api graphql returned malformed closing pull requests');
  return nodes;
}

function hasClosingKeyword(body, number, nameWithOwner) {
  const repo = nameWithOwner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    String.raw`\b(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved):?[ \t]+(?:#|${repo}#)${number}(?![A-Za-z0-9_])`,
    'i',
  ).test(body);
}

function issueNodes(issueNumber, initial, field, nodeFields, extraArgs = '') {
  const name = field.includes(':') ? field.split(':')[0] : field;
  const selection = issueConnectionSelection(field, nodeFields, extraArgs, true);
  const query = `query($owner:String!,$name:String!,$number:Int!,$after:String!){repository(owner:$owner,name:$name){issue(number:$number){${selection}}}}`;
  return connectionNodes(
    initial,
    name,
    (after) => graphql(query, { number: issueNumber, after }).repository?.issue?.[name],
  );
}

function associatedNodes(commit) {
  if (typeof commit.oid !== 'string' || !commit.oid) fail('gh api graphql returned malformed closing commit');
  const query = `query($owner:String!,$name:String!,$oid:String!,$after:String!){repository(owner:$owner,name:$name){commit:object(expression:$oid){... on Commit{associatedPullRequests(first:100,after:$after){${PULL_REQUEST_CONNECTION}}}}}}`;
  return connectionNodes(
    commit.associatedPullRequests,
    'associated pull requests',
    (after) => graphql(query, { oid: commit.oid, after }).repository?.commit?.associatedPullRequests,
  );
}

function readSnapshot(
  number,
  { acting = false, labelLookup = false, comments = false, history = false, archive = false, closure = false } = {},
) {
  const readsClosure = closure || archive;
  const issueFields =
    number === undefined
      ? ''
      : [
          'number title body state stateReason url createdAt updatedAt',
          issueConnectionSelection('labels', 'name'),
          issueConnectionSelection('assignedActors', ASSIGNEE_FIELDS),
          comments ? issueConnectionSelection('comments', 'body createdAt author{login}') : '',
          history
            ? issueConnectionSelection('history:timelineItems', LABELED_EVENT_FIELDS, ',itemTypes:[LABELED_EVENT]')
            : '',
          readsClosure
            ? `latestClosure:timelineItems(last:1,itemTypes:[CLOSED_EVENT]){nodes{${CLOSED_EVENT_FIELDS}}}`
            : '',
        ].join(' ');
  const query = `query($owner:String!,$name:String!${number === undefined ? '' : ',$number:Int!'}){${acting ? 'viewer{login id}' : ''} repository(owner:$owner,name:$name){nameWithOwner visibility ${archive ? 'defaultBranchRef{name}' : ''} ${labelLookup ? REPOSITORY_LABELS.join(' ') : ''} ${number === undefined ? '' : `issue(number:$number){${issueFields}}`}}}`;
  const data = graphql(query, number === undefined ? {} : { number });
  const repo = data.repository;
  if (
    !repo ||
    typeof repo.nameWithOwner !== 'string' ||
    !/^[^/]+\/[^/]+$/.test(repo.nameWithOwner) ||
    typeof repo.visibility !== 'string'
  )
    fail('gh api graphql returned malformed repository');
  repository = repo;
  const login = data.viewer?.login;
  const viewerId = data.viewer?.id;
  if (acting && (typeof login !== 'string' || !login.trim())) fail(ACTING_LOGIN_ERROR);
  if (acting && (typeof viewerId !== 'string' || !viewerId)) fail('gh api graphql returned malformed viewer');
  // Each plan label name maps to its node id, or to null when the repository lacks the label.
  let labelIds;
  if (labelLookup) {
    labelIds = new Map();
    for (const name of PLAN_LABELS) {
      const label = repo[name.split(':').at(-1)];
      if (
        label === undefined ||
        (label !== null &&
          (typeof label.name !== 'string' || token(label.name) !== name || typeof label.id !== 'string' || !label.id))
      )
        fail('gh api graphql returned malformed repository labels');
      labelIds.set(name, label?.id ?? null);
    }
  }
  if (number === undefined) return { labelIds };
  const issue = repo.issue;
  if (
    !issue ||
    issue.number !== number ||
    typeof issue.title !== 'string' ||
    typeof issue.body !== 'string' ||
    typeof issue.state !== 'string' ||
    (issue.stateReason !== null && typeof issue.stateReason !== 'string') ||
    typeof issue.url !== 'string' ||
    typeof issue.createdAt !== 'string' ||
    typeof issue.updatedAt !== 'string'
  )
    fail('gh api graphql returned malformed plan issue');
  issue.labels = issueNodes(number, issue.labels, 'labels', 'name');
  issue.assignees = issueNodes(number, issue.assignedActors, 'assignedActors', ASSIGNEE_FIELDS);
  if (
    issue.labels.some((label) => typeof label.name !== 'string') ||
    issue.assignees.some((owner) => typeof owner.login !== 'string' || !owner.login)
  )
    fail('gh api graphql returned malformed plan issue labels or assignees');
  if (comments) {
    issue.comments = issueNodes(number, issue.comments, 'comments', 'body createdAt author{login}');
    if (
      issue.comments.some(
        (comment) =>
          typeof comment.body !== 'string' ||
          !Number.isFinite(Date.parse(comment.createdAt)) ||
          (comment.author !== null && typeof comment.author?.login !== 'string'),
      )
    )
      fail('gh api graphql returned malformed issue comments');
  }
  if (history) {
    issue.history = issueNodes(
      number,
      issue.history,
      'history:timelineItems',
      LABELED_EVENT_FIELDS,
      ',itemTypes:[LABELED_EVENT]',
    );
    if (issue.history.some((event) => typeof event.label?.name !== 'string'))
      fail('gh api graphql returned malformed label history');
  }
  if (archive && typeof repo.defaultBranchRef?.name !== 'string')
    fail('gh api graphql returned malformed latest closure');
  if (readsClosure) {
    if (!Array.isArray(issue.latestClosure?.nodes)) fail('gh api graphql returned malformed latest closure');
    const closer = issue.latestClosure.nodes.at(-1)?.closer;
    if (
      issue.latestClosure.nodes.length > 1 ||
      (issue.latestClosure.nodes.length && (closer === undefined || (closer !== null && !closer.__typename)))
    )
      fail('gh api graphql returned malformed latest closure');
    if (closer?.__typename === 'PullRequest') pullRequestNodes([closer]);
    if (closer?.__typename === 'Commit') {
      if (typeof closer.oid !== 'string' || !closer.oid) fail('gh api graphql returned malformed closing commit');
      if (archive) issue.associatedPullRequests = pullRequestNodes(associatedNodes(closer));
    }
    issue.closer = closer;
  }
  return { issue, login, viewerId, labelIds };
}
function parseIssueNumber(value) {
  const match = /^#?([1-9]\d*)$/.exec(String(value ?? ''));
  if (!match) fail(`invalid plan issue: ${value ?? '(missing)'}`);
  return Number(match[1]);
}
function workStarted(issue, recordStatus) {
  if (recordStatus !== 'drafting' && recordStatus !== 'planned') return true;
  return issue.history.some((event) => token(event.label.name) === 'plan:ongoing');
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
// The pre-write read: the issue as GitHub stores it now, with the node ids that the write mutation needs.
function preWriteIssue(number) {
  const current = parseJson(
    runGh(['issue', 'view', String(number), '--json', PRE_WRITE_FIELDS, '--repo', repository.nameWithOwner]),
    'gh issue view',
  );
  const hasId = (node) => typeof node?.id === 'string' && node.id !== '';
  if (
    !hasId(current) ||
    typeof current.body !== 'string' ||
    !Array.isArray(current.labels) ||
    !Array.isArray(current.assignees) ||
    !current.labels.every((label) => hasId(label) && typeof label.name === 'string') ||
    !current.assignees.every(hasId)
  )
    fail('gh issue view returned malformed plan issue');
  return current;
}
// A status write can target a phase label that the repository lacks: create it as `new` does, then read its id.
function createdLabelId(name) {
  runGh(['label', 'create', name, '--repo', repository.nameWithOwner]);
  const query = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){label(name:${JSON.stringify(name)}){name id}}}`;
  const label = graphql(query).repository?.label;
  if (typeof label?.name !== 'string' || token(label.name) !== name || typeof label.id !== 'string' || !label.id)
    fail('gh api graphql returned malformed repository labels');
  return label.id;
}
// A write is the pre-write read plus one GraphQL request (#89). GitHub runs its mutation fields in order:
// updateIssue first, so the body and the claim of an unassigned plan land in one write; then discrete label
// additions and removals, so a label that someone else adds meanwhile survives. The last field returns the
// stored state, which the post-write checks read.
function writeIssueIfUnchanged(issue, { body, add, remove = [], labelIds } = {}) {
  const claims = issue.claimantId !== undefined;
  if (body === undefined && !add && remove.length === 0 && !claims) return;
  const current = preWriteIssue(issue.number);
  if (current.body !== issue.body) fail('plan issue changed remotely; re-read and retry');
  const idLists = [];
  const fields = [];
  if (body !== undefined || claims) {
    const input = ['id:$issue'];
    if (body !== undefined) input.push('body:$body');
    if (claims) {
      idLists.push(['assignees', [...new Set([...current.assignees.map((owner) => owner.id), issue.claimantId])]]);
      input.push('assigneeIds:$assignees');
    }
    fields.push({ mutation: 'updateIssue', input: input.join(','), payload: 'issue' });
  }
  if (add) {
    idLists.push(['add', [labelIds.get(add) ?? createdLabelId(add)]]);
    fields.push({ mutation: 'addLabelsToLabelable', input: 'labelableId:$issue,labelIds:$add', payload: 'labelable' });
  }
  const removed = new Set(remove.map(token));
  const removeIds = current.labels.filter((label) => removed.has(token(label.name))).map((label) => label.id);
  if (removeIds.length) {
    idLists.push(['remove', removeIds]);
    fields.push({
      mutation: 'removeLabelsFromLabelable',
      input: 'labelableId:$issue,labelIds:$remove',
      payload: 'labelable',
    });
  }
  // Nothing left to change: the pre-write read already shows every label to remove as absent.
  if (!fields.length) return;
  const declarations = [
    '$issue:ID!',
    ...(body === undefined ? [] : ['$body:String!']),
    ...idLists.map(([name]) => `$${name}:[ID!]!`),
  ];
  const selections = fields.map(({ mutation, input, payload }, index) => {
    const stored =
      payload === 'issue' ? `issue{${STORED_ISSUE_FIELDS}}` : `labelable{... on Issue{${STORED_ISSUE_FIELDS}}}`;
    return `${mutation}(input:{${input}}){${index === fields.length - 1 ? stored : 'clientMutationId'}}`;
  });
  const send = (bodyFile) =>
    graphqlData([
      '-f',
      `query=mutation(${declarations.join(',')}){${selections.join(' ')}}`,
      '-f',
      `issue=${current.id}`,
      // gh passes an @file field byte for byte; any other -F value gets type conversion and placeholder filling.
      ...(bodyFile === undefined ? [] : ['-F', `body=@${bodyFile}`]),
      ...idLists.flatMap(([name, ids]) => ids.flatMap((id) => ['-f', `${name}[]=${id}`])),
    ]);
  const data = body === undefined ? send() : withBodyFile(body, send);
  const last = fields.at(-1);
  const stored = data[last.mutation]?.[last.payload];
  if (
    typeof stored?.body !== 'string' ||
    !Array.isArray(stored.labels?.nodes) ||
    !Array.isArray(stored.assignees?.nodes)
  )
    fail('gh api graphql returned malformed stored plan issue');
  if (body !== undefined && stored.body !== body) fail('plan issue body differs after edit');
  if (!add && remove.length === 0) return;
  const storedLabels = issueNodes(issue.number, stored.labels, 'labels', 'name');
  if (storedLabels.some((label) => typeof label.name !== 'string')) fail('gh api graphql returned malformed labels');
  const labels = labelNames(storedLabels);
  if ((add && !labels.includes(add)) || remove.some((label) => labels.includes(token(label))))
    fail('plan issue labels differ after edit');
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
  const names = (issue.labels ?? []).map((label) => (typeof label === 'string' ? label : label.name));
  return names.filter((label) => token(label).startsWith('plan:') && (!target || token(label) !== `plan:${target}`));
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
let repository;
const token = (value) => unquoteCode(value.trim()).toLowerCase();
const stepId = (value) => token(value).replaceAll('-', '_');
const terminal = (status) => ['done', 'skipped'].includes(status);
const trimBlankLines = (text) => text.replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '');
const RETIRED_SECTIONS = new Set(['review']);
function sectionMap(body) {
  const headings = [...blankFencedRegions(body).matchAll(/^ {0,3}##[ \t]+([^\n]+)$/gm)];
  const sections = new Map();
  headings.forEach((heading, index) => {
    const title = heading[1].trim();
    const name = SECTIONS.find((known) => known.toLowerCase() === title.toLowerCase());
    if (!name && !RETIRED_SECTIONS.has(title.toLowerCase()))
      fail(
        `unknown section heading: ${title}; use only ${SECTIONS.join(', ')} or write it below an existing section as ### or plain text`,
      );
    const key = name ?? title;
    if (sections.has(key)) fail(`duplicate section heading: ${key}`);
    sections.set(
      key,
      trimBlankLines(body.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? body.length)),
    );
  });
  return sections;
}
// Split a table row on pipes that are not escaped; a pipe is escaped only when an odd
// run of backslashes precedes it, so `\\|` is a literal backslash followed by a delimiter.
function splitCells(row) {
  const cells = [];
  let cell = '',
    backslashes = 0;
  for (const char of row) {
    if (char === '|' && backslashes % 2 === 0) {
      cells.push(cell);
      cell = '';
    } else cell += char;
    backslashes = char === '\\' ? backslashes + 1 : 0;
  }
  cells.push(cell);
  if (cells.length > 1 && cells[0].trim() === '') cells.shift();
  if (cells.length > 1 && cells.at(-1).trim() === '') cells.pop();
  return cells;
}
function table(text, header) {
  const lines = text.split('\n'),
    scan = blankFencedRegions(text)
      .split('\n')
      .map((line) => (/^(?: {4}|\t)/.test(line) ? '' : line)),
    cells = (line) => splitCells(line.trim()).map((cell) => cell.trim());
  const start = scan.findIndex((line) => cells(line).map(token).join('|') === cells(header).map(token).join('|'));
  if (start < 0) return { lines, start, end: start, rows: [] };
  const isSeparator = (line) => cells(line).every((cell) => /^:?-+:?$/.test(cell));
  const first = start + 1 + (scan[start + 1] !== undefined && isSeparator(scan[start + 1]) ? 1 : 0);
  let end = first;
  while (end < scan.length && scan[end].trim().startsWith('|')) end++;
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
// Steps that edit the same path need a Depends order, or parallel work collides (#78).
function sharedFilesAdvice(rows) {
  const paths = rows.map(
    (row) =>
      new Set(
        row[3]
          .split(',')
          .map((part) => unquoteCode(part.trim()))
          .filter((part) => part && part !== '-'),
      ),
  );
  const dependencies = new Map(
    rows.map((row) => [row[0], row[4] === '-' ? [] : row[4].split(',').map((part) => part.trim())]),
  );
  const reaches = (from, to, seen = new Set()) => {
    if (seen.has(from)) return false;
    seen.add(from);
    return (dependencies.get(from) ?? []).some((next) => next === to || reaches(next, to, seen));
  };
  const advice = [];
  rows.forEach((row, index) => {
    for (let other = index + 1; other < rows.length; other += 1) {
      const shared = [...paths[index]].filter((entry) => paths[other].has(entry));
      if (shared.length && !reaches(row[0], rows[other][0]) && !reaches(rows[other][0], row[0]))
        advice.push(`steps ${row[1]} and ${rows[other][1]} share ${shared.join(', ')} with no Depends link`);
    }
  });
  return advice;
}
export function normalizePlan(text, { mode: explicitMode } = {}) {
  const advice = [];
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => (line.includes('\u2014') ? line.replaceAll('\u2014', ' - ').replace(/ {2,}/g, ' ') : line).trimEnd())
    .join('\n');
  const sections = sectionMap(cleaned),
    goal = sections.get('Goal') ?? '';
  const goalLines = goal.split('\n'),
    modeLines = blankFencedRegions(goal)
      .split('\n')
      .map((line, index) => (/^ {0,3}Mode:/i.test(line) ? index : -1))
      .filter((index) => index >= 0);
  const mode = modeLines.length ? /^ {0,3}Mode:\s*(.*?)\s*$/i.exec(goalLines[modeLines.at(-1)]) : undefined,
    value = (explicitMode ?? mode?.[1] ?? '').toLowerCase();
  const valid = ['plan-only', 'plan-and-implement'].includes(value);
  if (!valid) advice.push('Mode defaulted to plan-only; implementation needs an explicit mode.');
  const goalWithoutMode = goalLines.filter((_, index) => !modeLines.includes(index)).join('\n');
  sections.set('Goal', trimBlankLines(`${trimBlankLines(goalWithoutMode)}\n\nMode: ${valid ? value : 'plan-only'}`));
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
  const numbers = new Map(rows.filter((row) => row.length === 8).map((row) => [row[1], row[0]]));
  const displays = new Set(numbers.values());
  const dependency = (part) => {
    const trimmed = part.trim();
    if (displays.has(trimmed)) return trimmed;
    return numbers.get(stepId(trimmed)) ?? trimmed;
  };
  for (const row of rows)
    if (row.length === 8) row[4] = row[4] === '-' ? '-' : row[4].split(',').map(dependency).join(', ');
  advice.push(...sharedFilesAdvice(rows.filter((row) => row.length === 8)));
  replaceTable(sections, 'Steps', STEPS_HEADER, STEPS_SEPARATOR, rows);
  replaceTable(
    sections,
    'Acceptance',
    ACCEPTANCE_HEADER,
    ACCEPTANCE_SEPARATOR,
    table(sections.get('Acceptance') ?? '', ACCEPTANCE_HEADER).rows,
  );
  const machinePaths = new Set(Array.from(cleaned.matchAll(MACHINE_PATH), ([match]) => match.replace(/[.:]+$/, '')));
  for (const machinePath of machinePaths) advice.push(`body contains an absolute machine path: ${machinePath}`);
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
// A drafted plan holds this placeholder until research is published (#78).
const RESEARCH_PLACEHOLDER = '_Not researched yet._';
// Compare the whole section: research prose may quote the placeholder.
function researchFilled(plan) {
  const research = plan.sections.get('Research').trim();
  return research !== '' && research !== RESEARCH_PLACEHOLDER;
}
function printAdvice(text, status, extra = [], options = {}) {
  const result = normalizePlan(text, options);
  if (status !== 'drafting' && !researchFilled(parsePlan(text)))
    result.advice.push('Research is not filled after drafting.');
  for (const message of [...result.advice, ...extra]) console.log(`advice: ${message}`);
}
// A plan-review pass covers the body that the reviewer read (#78).
const PLANNED_WORK_SECTIONS = ['Goal', 'Research', 'Steps', 'Acceptance', 'Do not touch'];
function plannedWorkChanges(before, after) {
  return PLANNED_WORK_SECTIONS.filter((name) => before.sections.get(name) !== after.sections.get(name));
}
// Reviewers write Markdown: read review keywords through emphasis, code marks, quotes, and list markers (#49).
function reviewText(line) {
  return line
    .replace(/[*_`]/g, '')
    .trim()
    .replace(/^(?:>\s*)+/, '')
    .replace(/^(?:[-+]|\d+[.)])\s+/, '')
    .trim();
}
const REVIEW_HEADING = /^(?:#+\s*)?(plan|code) review/i;
const REVIEW_VERDICT = /^(plan|code)[- ]review:\s*([a-z]+(?:-[a-z]+)*)/i;
const severeFinding = (text) =>
  /\[(?:critical|high)\]/i.test(text) ||
  /^(?:critical|high)\s*:/i.test(text) ||
  /^severity\s*:\s*(?:critical|high)\b/i.test(text);
export function parseReviewComment(body) {
  if (typeof body !== 'string') return undefined;
  const lines = body.trim().split(/\r?\n/).map(reviewText);
  const heading = REVIEW_HEADING.exec(lines[0]);
  if (!heading) return undefined;
  const kind = heading[1].toLowerCase();
  const match = lines
    .slice(1)
    .map((line) => REVIEW_VERDICT.exec(line))
    .find(Boolean);
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
  if (kind === 'code' && verdict === 'pass' && lines.some(severeFinding)) verdict = 'fixes-required';
  return { kind, verdict };
}
function reviewVerdicts(issue) {
  const owners = issue.assignees,
    verdicts = {};
  const comments = issue.comments
    .map((comment, index) => ({ comment, index }))
    .sort((a, b) => Date.parse(a.comment.createdAt) - Date.parse(b.comment.createdAt) || a.index - b.index);
  for (const { comment } of comments) {
    const review = parseReviewComment(comment.body);
    if (owners.length === 1 && comment.author?.login === owners[0].login && review)
      verdicts[review.kind] = review.verdict;
  }
  return verdicts;
}
function readPlanIssue(value, forWrite = false, connections = {}) {
  const { issue, login, viewerId, labelIds } = readSnapshot(parseIssueNumber(value), {
    acting: forWrite,
    ...connections,
  });
  if (!/^\s*<!-- plan-contract: v[34] -->/i.test(issue.body)) fail(`unreadable plan contract: #${issue.number}`);
  if (forWrite) {
    const owners = issue.assignees.map((owner) => owner.login);
    const foreign = owners.find((owner) => owner !== login);
    if (foreign) fail(`plan #${issue.number} is owned by ${foreign}`);
    // The write claims an unassigned plan for the acting viewer.
    if (!owners.length) issue.claimantId = viewerId;
  }
  return { issue, parsed: parsePlan(issue.body), status: statusFromIssue(issue), labelIds };
}
function createPlan(args) {
  const options = parseOptions(args, new Set(['--title', '--goal', '--mode', '--label']), new Set(['--label']));
  if (!options['--title']?.trim() || !options['--goal']?.trim()) fail('new requires --title and --goal');
  const extras = options['--label'] ?? [];
  for (const label of extras) if (/^plan(?::|$)/i.test(label)) fail(`reserved label namespace: ${label}`);
  const { labelIds } = readSnapshot(undefined, { acting: true, labelLookup: true });
  for (const [label, id] of labelIds)
    if (id === null) runGh(['label', 'create', label, '--repo', repository.nameWithOwner]);
  const goalText = blankFencedRegions(options['--goal'])
    .split('\n')
    .map((masked, index) => {
      const line = options['--goal'].split('\n')[index];
      return /^ {0,3}##[ \t]/.test(masked) ? line.replace(/^( {0,3})##/, '$1###') : line;
    })
    .join('\n');
  const source = `## Goal\n${goalText}\n## Research\n${RESEARCH_PLACEHOLDER}\n## Steps\n${STEPS_HEADER}\n${STEPS_SEPARATOR}\n## Acceptance\n${ACCEPTANCE_HEADER}\n${ACCEPTANCE_SEPARATOR}`;
  const { body } = normalizePlan(source, { mode: options['--mode'] });
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
  printAdvice(source, 'drafting', [], { mode: options['--mode'] });
}
function describeCloser(closer) {
  if (closer?.__typename === 'PullRequest') return closer.url;
  if (closer?.__typename === 'Commit') return `commit ${closer.oid}`;
  return 'an unknown closer';
}
function showPlan(args) {
  const [value, ...flags] = args;
  if (!value || flags.length > 1 || flags.some((flag) => flag !== '--body'))
    fail('show requires an issue and optional --body');
  const { issue, parsed, status } = readPlanIssue(value, false, { comments: true, closure: true }),
    reviews = reviewVerdicts(issue);
  const metadata = `${headerStrip(issue, status)}\nreviews: plan=${reviews.plan ?? 'none'} code=${reviews.code ?? 'none'}`;
  if (flags.length) {
    console.error(metadata);
    process.stdout.write(issue.body);
  } else {
    console.log(metadata);
    const unfinished = status === 'finished' ? parsed.steps.find((step) => !terminal(step.status)) : undefined;
    const extra = unfinished
      ? [
          `plan is closed as completed while step ${unfinished.id} is ${unfinished.status}; closed by ${describeCloser(issue.closer)}; reopen the issue if work remains`,
        ]
      : [];
    printAdvice(issue.body, status, extra);
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
  const { issue, parsed, status } = readPlanIssue(value, true, { history: true, comments: true }),
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
  if (workStarted(issue, status)) {
    refuseMalformedSteps(parsed);
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
  writeIssueIfUnchanged(issue, { body });
  // Refresh provenance only after the remote write, so a failed write can be retried with the same file (#78).
  fs.writeFileSync(originFile(file), `${bodyDigest(body)}\n`, { mode: 0o600 });
  fs.chmodSync(originFile(file), 0o600);
  const changes = changedLines(issue.body, body);
  console.log(headerStrip(issue, status));
  console.log(`changed: ${changes.length} line(s)`);
  for (const line of changes) console.log(line);
  const changedWork = reviewVerdicts(issue).plan === 'pass' ? plannedWorkChanges(parsed, incomingPlan) : [];
  const rereview = changedWork.length
    ? [
        `plan review passed before this edit; changed sections: ${changedWork.join(', ')}; run a new plan-review round before code that depends on them`,
      ]
    : [];
  printAdvice(source, status, rereview);
}
function setPlanStatus(args) {
  const [value, raw, ...flags] = args,
    target = token(raw ?? ''),
    options = parseOptions(flags, new Set(['--reason']));
  if (!PLAN_STATUSES.has(target)) fail(`unknown plan status: ${target}`);
  if (target === 'blocked' && (!options['--reason']?.trim() || /[\r\n]/.test(options['--reason'])))
    fail('blocked status requires --reason as single-line text');
  const { issue, parsed, status, labelIds } = readPlanIssue(value, true, { history: true, labelLookup: true });
  if (String(issue.state).toUpperCase() === 'CLOSED')
    fail(`plan #${issue.number} is closed; status applies to open plans`);
  if (workStarted(issue, status) && !['ongoing', 'blocked'].includes(target))
    fail(`illegal plan status transition: ${status} -> ${target}`);
  if (['planned', 'ongoing'].includes(target) && !researchFilled(parsed))
    fail(`status ${target} requires a filled Research section`);
  const content = parsed.sections.get('Open questions').replace(/^Blocked:[^\n]*\n?\s*/i, '');
  parsed.sections.set(
    'Open questions',
    `${target === 'blocked' ? `Blocked: ${options['--reason']}\n\n` : ''}${content}`.trim(),
  );
  const source = render(parsed.sections);
  writeIssueIfUnchanged(issue, {
    body: normalizePlan(source).body,
    add: `plan:${target}`,
    remove: labelsToRemove(issue, target),
    labelIds,
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
  if (status === 'finished' && !terminal(target))
    fail(`plan #${issue.number} is finished; reopen it before moving step ${row.id} to ${target}`);
  if (status !== 'finished' && terminal(current) && current !== target)
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
  writeIssueIfUnchanged(issue, { body: normalizePlan(source).body });
  console.log(`plan #${issue.number} step ${row.id}: ${current} -> ${target}`);
  printAdvice(source, status, advice);
}
function listPlans(args) {
  const selected = parseOptions(args, new Set(['--status']))['--status'];
  // One GraphQL query per 100 plans; like every snapshot, it names the repository through gh's {owner}/{repo}.
  const query = `query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){${issueConnectionSelection('issues', PLAN_LIST_FIELDS, PLAN_LIST_ARGS, true)}}}`;
  const page = (variables) => graphql(query, variables).repository?.issues;
  const nodes = connectionNodes(page(), 'plan issues', (after) => page({ after }), PLAN_LIST_LIMIT);
  if (
    nodes.some(
      (issue) =>
        !Number.isInteger(issue.number) ||
        typeof issue.title !== 'string' ||
        typeof issue.state !== 'string' ||
        (issue.stateReason !== null && typeof issue.stateReason !== 'string') ||
        !Array.isArray(issue.labels?.nodes) ||
        issue.labels.nodes.some((label) => typeof label?.name !== 'string'),
    )
  )
    fail('gh api graphql returned malformed plan issues');
  const issues = nodes.slice(0, PLAN_LIST_LIMIT).map((issue) => ({ ...issue, labels: issue.labels.nodes }));
  issues.sort(
    (a, b) =>
      Number(a.state.toUpperCase() === 'CLOSED') - Number(b.state.toUpperCase() === 'CLOSED') || a.number - b.number,
  );
  for (const issue of issues) {
    const status = statusFromIssue(issue);
    if (!selected || status === token(selected)) console.log(`${status}\t#${issue.number}\t${issue.title}`);
  }
  if (issues.length >= PLAN_LIST_LIMIT) console.log('advice: list stopped at 500 plans; more plans may exist');
}
function archivePlan(args, retired = false) {
  const [value, ...flags] = args,
    options = parseOptions(flags, new Set(retired ? ['--reason'] : []));
  if (retired && (!options['--reason']?.trim() || /[\r\n]/.test(options['--reason'])))
    fail('retire requires a single-line --reason');
  const { issue, parsed, status } = readPlanIssue(value, true, retired ? {} : { comments: true, archive: true });
  if (retired && String(issue.state).toUpperCase() === 'CLOSED') fail(`cannot retire a ${status} plan`);
  if (!retired && status !== 'finished') fail(`archive requires finished status, found ${status}`);
  let closer;
  if (!retired) {
    if (parsed.steps.length === 0) fail('archive refused: no Steps rows parsed');
    const unfinished = parsed.steps.find((row) => !terminal(row.status));
    if (unfinished) fail(`archive refused: non-terminal step ${unfinished.id}`);
    if (reviewVerdicts(issue).code !== 'pass') fail('archive requires Code-review: pass');
    const defaultBranch = repository.defaultBranchRef.name;
    const references =
      issue.closer?.__typename === 'PullRequest'
        ? typeof issue.closer.body === 'string' &&
          hasClosingKeyword(issue.closer.body, issue.number, repository.nameWithOwner)
          ? [issue.closer]
          : []
        : issue.closer?.__typename === 'Commit'
          ? issue.associatedPullRequests
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
  writeIssueIfUnchanged(issue, { remove: labelsToRemove(issue) });
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
  repository = undefined;
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
