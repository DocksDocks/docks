#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLAN_CLI = path.join(ROOT, 'plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs');
const GH_STUB_DIR = path.join(ROOT, 'scripts/tests/fixtures/gh-stub');
const stateBase = process.env.XDG_STATE_HOME || path.join(process.env.HOME || os.homedir(), '.local', 'state');
const testScratchRoot = path.join(stateBase, 'docks');
fs.mkdirSync(testScratchRoot, { recursive: true, mode: 0o700 });
fs.chmodSync(testScratchRoot, 0o700);
const scratch = fs.realpathSync(fs.mkdtempSync(path.join(testScratchRoot, 'plan-cli-')));
const stateHome = fs.realpathSync(fs.mkdtempSync(path.join(testScratchRoot, 'plan-cli-state-')));
const linkedParent = fs.realpathSync(fs.mkdtempSync(path.join(testScratchRoot, 'plan-cli-linked-')));
const linkedScratch = path.join(linkedParent, 'worktree');
const statePath = path.join(scratch, 'gh-state.json');
const V3_MARKER = '<!-- plan-contract: v3 -->';
const FORBIDDEN_DASH = String.fromCodePoint(0x2014);
const V3_SECTIONS = [
  '## Goal',
  '## Research',
  '## Steps',
  '## Acceptance',
  '## Do not touch',
  '## Open questions',
  '## Review',
  '## Verification Results',
];
fs.mkdirSync(path.join(scratch, 'docs'), { recursive: true });
const initialized = spawnSync('git', ['init', '--quiet'], { cwd: scratch, encoding: 'utf8' });
assert.equal(initialized.status, 0, initialized.stderr);
const committed = spawnSync(
  'git',
  [
    '-c',
    'user.name=Plan CLI test',
    '-c',
    'user.email=plan-cli@example.invalid',
    'commit',
    '--quiet',
    '--allow-empty',
    '-m',
    'fixture',
  ],
  { cwd: scratch, encoding: 'utf8' },
);
assert.equal(committed.status, 0, committed.stderr);
fs.writeFileSync(
  statePath,
  `${JSON.stringify(
    {
      repo: {
        nameWithOwner: 'DocksDocks/fixture',
        visibility: 'PRIVATE',
        defaultBranchRef: { name: 'main' },
      },
      repositoryDefaults: {
        'DocksDocks/fixture': 'main',
        'OtherOrg/landing': 'trunk',
        'ManualOrg/manual': 'main',
      },
      viewerLogin: 'plan-agent',
      labels: {},
      issues: [],
      prs: [],
      nextIssue: 1,
      nextComment: 1,
      clock: 0,
      calls: [],
    },
    null,
    2,
  )}\n`,
);

const childEnv = {
  ...process.env,
  PATH: `${GH_STUB_DIR}${path.delimiter}${process.env.PATH ?? ''}`,
  GH_STUB_STATE: statePath,
  XDG_STATE_HOME: stateHome,
};

function runIn(cwd, ...args) {
  return spawnSync(process.execPath, [PLAN_CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: childEnv,
  });
}

function run(...args) {
  return runIn(scratch, ...args);
}

function bodyDigest(body) {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

function expectSuccess(result, label) {
  assert.equal(result.status, 0, `${label}: ${result.stderr}`);
}

function loadState() {
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function updateState(update) {
  const state = loadState();
  update(state);
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function issue(number) {
  return loadState().issues.find((entry) => entry.number === number);
}

function updateIssue(number, update) {
  updateState((state) => update(state.issues.find((entry) => entry.number === number)));
}

function addIssueComment(number, body, author = 'plan-agent') {
  updateState((state) => {
    const entry = state.issues.find((candidate) => candidate.number === number);
    const id = state.nextComment++;
    entry.comments ??= [];
    entry.comments.push({
      id,
      body,
      author,
      createdAt: new Date(Date.parse('2026-08-20T20:00:00Z') + id * 1000).toISOString(),
    });
  });
}

function createPlan(name, options = {}) {
  const title = options.title ?? `Exercise ${name}`;
  const goal = options.goal ?? `The ${name} plan completes its observable contract`;
  const labelArgs = (options.labels ?? []).flatMap((label) => ['--label', label]);
  const result = run(
    'new',
    '--title',
    title,
    '--goal',
    goal,
    ...(options.mode ? ['--mode', options.mode] : []),
    ...labelArgs,
  );
  expectSuccess(result, `new ${name}`);
  const match = /^plan created: #(\d+) (https:\/\/\S+)$/m.exec(result.stdout);
  assert.ok(match, `new ${name} did not print identity`);
  return Number(match[1]);
}

function makeValid(number, options = {}) {
  const steps = options.steps ?? [
    '| 1 | implement_contract | Implement the contract | src/example.mjs | - | `local` | `planned` | command exits 0 |',
  ];
  updateIssue(number, (entry) => {
    entry.body = entry.body
      .replace('|---:|---|---|---|---|---|---|---|\n', `|---:|---|---|---|---|---|---|---|\n${steps.join('\n')}\n`)
      .replace(
        '| ID | Command | Expected |\n|---|---|---|\n',
        '| ID | Command | Expected |\n|---|---|---|\n| A1 | `node --version` | Exit 0 |\n',
      );
  });
  return issue(number).body;
}

function setIssueStatus(number, status, reason = 'fixture reason') {
  updateIssue(number, (entry) => {
    entry.labels = entry.labels.filter((label) => !label.startsWith('plan:'));
    entry.labels.push(`plan:${status}`);
    entry.body = entry.body.replace(/(## Open questions\n\n)([\s\S]*?)(?=\n## Review)/, (_, heading, contents) => {
      const withoutBlockedReason = contents.replace(/^Blocked: .+\n?/, '');
      return `${heading}${status === 'blocked' ? `Blocked: ${reason}\n` : ''}${withoutBlockedReason}`;
    });
    if (status !== 'drafting')
      entry.body = entry.body.replace('_Not researched yet._', 'Repository facts confirmed the durable fix.');
  });
}

function expectCheckPass(value) {
  const result = run('check', String(value));
  expectSuccess(result, `check ${value}`);
  assert.equal(result.stdout.trim(), `plan check passed: #${String(value).replace(/^#/, '')}`);
}

function mutateAndRestore(number, mutationName, mutate, errorPattern) {
  const before = issue(number);
  const savedBody = before.body;
  const savedLabels = [...before.labels];
  updateIssue(number, mutate);
  const failed = run('check', String(number));
  assert.equal(failed.status, 1, `${mutationName} mutation unexpectedly passed`);
  if (errorPattern) assert.match(failed.stderr, errorPattern, `${mutationName} must report its contract failure`);
  updateIssue(number, (entry) => {
    entry.body = savedBody;
    entry.labels = savedLabels;
  });
  expectCheckPass(number);
}

function replaceStepStatus(body, status) {
  return body.replace(
    /\| `(?:planned|in-flight|done|blocked|skipped)` \| command exits 0 \|/,
    `| \`${status}\` | command exits 0 |`,
  );
}

try {
  const labelsBeforeReservedFailure = loadState().labels;
  const reservedExtra = run('labels', '--extra', 'plan:foo');
  assert.equal(reservedExtra.status, 1);
  assert.equal(reservedExtra.stderr.trim(), 'reserved label namespace: plan:foo');
  assert.deepEqual(loadState().labels, labelsBeforeReservedFailure);
  const labelsResult = run('labels', '--extra', 'security', '--extra', 'auth');
  expectSuccess(labelsResult, 'labels');
  assert.deepEqual(
    labelsResult.stdout.trimEnd().split('\n'),
    ['plan', 'plan:drafting', 'plan:planned', 'plan:ongoing', 'plan:blocked', 'security', 'auth'].map(
      (label) => `label ready: ${label}`,
    ),
  );
  const beforeReservedNew = loadState();
  const reservedNew = run(
    'new',
    '--title',
    'Reserved label',
    '--goal',
    'A reserved label creates no issue',
    '--label',
    'plan:ongoing',
  );
  assert.equal(reservedNew.status, 1);
  assert.equal(reservedNew.stderr.trim(), 'reserved label namespace: plan:ongoing');
  assert.equal(loadState().nextIssue, beforeReservedNew.nextIssue);
  assert.deepEqual(loadState().issues, beforeReservedNew.issues);
  const beforeOversizedTitle = loadState();
  const oversizedTitle = run('new', '--title', 'x'.repeat(71), '--goal', 'An oversized title creates no issue');
  assert.equal(oversizedTitle.status, 1);
  assert.equal(oversizedTitle.stderr.trim(), 'title must contain 1 to 70 characters after trimming');
  assert.equal(loadState().nextIssue, beforeOversizedTitle.nextIssue);
  assert.deepEqual(loadState().issues, beforeOversizedTitle.issues);
  const beforeWhitespaceGoal = loadState();
  const whitespaceGoal = run('new', '--title', 'Whitespace goal', '--goal', ' \t ');
  assert.equal(whitespaceGoal.status, 1);
  assert.equal(whitespaceGoal.stderr.trim(), 'goal must be non-empty after trimming');
  assert.equal(loadState().nextIssue, beforeWhitespaceGoal.nextIssue);
  assert.deepEqual(loadState().issues, beforeWhitespaceGoal.issues);
  for (const [name, title, goal] of [
    ['title', `Forbidden${FORBIDDEN_DASH}title`, 'A forbidden title creates no issue'],
    ['goal', 'Forbidden goal', `A forbidden${FORBIDDEN_DASH}goal creates no issue`],
  ]) {
    const beforeForbiddenNew = loadState();
    const forbiddenNew = run('new', '--title', title, '--goal', goal);
    assert.equal(forbiddenNew.status, 1, `${name} must reject an em dash`);
    assert.equal(forbiddenNew.stderr.trim(), 'title and goal must not contain an em dash');
    const afterForbiddenNew = loadState();
    assert.equal(afterForbiddenNew.nextIssue, beforeForbiddenNew.nextIssue, `${name} must create no issue`);
    assert.deepEqual(afterForbiddenNew.issues, beforeForbiddenNew.issues, `${name} must leave issues unchanged`);
    assert.equal(
      afterForbiddenNew.calls.filter((call) => call[0] === 'issue' && call[1] === 'create').length,
      beforeForbiddenNew.calls.filter((call) => call[0] === 'issue' && call[1] === 'create').length,
      `${name} must fail before gh issue create`,
    );
  }

  const failedCreateAssignmentNumber = loadState().nextIssue;
  updateState((state) => {
    state.dropCreateAssignee = true;
  });
  const failedCreateAssignment = run(
    'new',
    '--title',
    'Missing create assignment',
    '--goal',
    'The silently dropped assignment must be reported',
  );
  assert.equal(failedCreateAssignment.status, 1);
  assert.equal(failedCreateAssignment.stdout, '');
  assert.equal(
    failedCreateAssignment.stderr.trim(),
    `plan #${failedCreateAssignmentNumber} assignee verification failed: expected sole assignee plan-agent`,
  );
  assert.deepEqual(issue(failedCreateAssignmentNumber).assignees, []);
  updateState((state) => {
    delete state.dropCreateAssignee;
  });
  const topicNumber = createPlan('topic-label', { labels: ['security'] });
  assert.deepEqual(issue(topicNumber).labels, ['plan', 'plan:drafting', 'security']);

  const templateNumber = createPlan('template', { mode: 'plan-only' });
  const template = issue(templateNumber);
  assert.equal(template.body.split('\n', 3).slice(0, 2).join('\n'), `${V3_MARKER}\n`);
  assert.equal(/^---\s*$/m.test(template.body), false, 'v3 body must not contain a frontmatter fence line');
  assert.equal(template.body.startsWith('---'), false, 'v3 body must not open with a frontmatter fence');
  assert.deepEqual(
    [...template.body.matchAll(/^## .+$/gm)].map(([heading]) => heading),
    V3_SECTIONS,
    'v3 body must contain the eight contract sections exactly once and in order',
  );
  assert.doesNotMatch(
    template.body,
    /^(?:plan_contract|title|goal|status|created|updated|assignee|blocked_reason):/m,
    'GitHub-owned machine fields must not be stored in the body',
  );
  assert.match(template.body, /^Mode: plan-only$/m);
  assert.match(template.body, /^_Review records are stored in issue comments\._$/m);
  assert.deepEqual(template.labels, ['plan', 'plan:drafting']);
  assert.deepEqual(template.assignees, ['plan-agent']);
  const createCall = loadState().calls.find(
    (call) => call[0] === 'issue' && call[1] === 'create' && call.includes('Exercise template'),
  );
  assert.deepEqual(createCall.slice(createCall.indexOf('--assignee'), createCall.indexOf('--assignee') + 2), [
    '--assignee',
    '@me',
  ]);
  const claimNumber = createPlan('claim');
  makeValid(claimNumber);
  updateIssue(claimNumber, (entry) => {
    entry.assignees = [];
  });
  const claimed = run('claim', String(claimNumber));
  expectSuccess(claimed, 'claim unassigned plan');
  assert.equal(claimed.stdout.trim(), `plan #${claimNumber} claimed: plan-agent`);
  assert.deepEqual(issue(claimNumber).assignees, ['plan-agent']);
  const claimedAgain = run('claim', `#${claimNumber}`);
  expectSuccess(claimedAgain, 'claim idempotently');
  assert.equal(claimedAgain.stdout.trim(), `plan #${claimNumber} already claimed: plan-agent`);
  assert.deepEqual(issue(claimNumber).assignees, ['plan-agent']);
  const failedClaimAssignmentNumber = createPlan('failed-claim-assignment');
  makeValid(failedClaimAssignmentNumber);
  updateIssue(failedClaimAssignmentNumber, (entry) => {
    entry.assignees = [];
  });
  updateState((state) => {
    state.dropEditAssignee = true;
  });
  const failedClaimAssignment = run('claim', String(failedClaimAssignmentNumber));
  assert.equal(failedClaimAssignment.status, 1);
  assert.equal(failedClaimAssignment.stdout, '');
  assert.equal(
    failedClaimAssignment.stderr.trim(),
    `plan #${failedClaimAssignmentNumber} assignee verification failed: expected sole assignee plan-agent`,
  );
  assert.deepEqual(issue(failedClaimAssignmentNumber).assignees, []);
  updateState((state) => {
    delete state.dropEditAssignee;
  });

  const concurrentClaimNumber = createPlan('concurrent-claim');
  makeValid(concurrentClaimNumber);
  updateIssue(concurrentClaimNumber, (entry) => {
    entry.assignees = [];
  });
  const concurrentClaimBody = issue(concurrentClaimNumber).body;
  updateState((state) => {
    state.remoteChange = {
      issue: concurrentClaimNumber,
      viewsBeforeChange: 1,
      body: `${concurrentClaimBody}\nremote claim change\n`,
    };
  });
  const concurrentClaim = run('claim', String(concurrentClaimNumber));
  assert.equal(concurrentClaim.status, 1);
  assert.equal(concurrentClaim.stdout, '');
  assert.equal(concurrentClaim.stderr.trim(), 'plan issue changed remotely; re-read and retry');
  assert.deepEqual(issue(concurrentClaimNumber).assignees, []);

  const malformedClaimNumber = createPlan('malformed-claim');
  makeValid(malformedClaimNumber);
  updateIssue(malformedClaimNumber, (entry) => {
    entry.assignees = [];
    entry.body = entry.body.replace('| A1 | `node --version` | Exit 0 |\n', '');
  });
  const malformedClaimBefore = issue(malformedClaimNumber);
  const malformedClaimEditsBefore = loadState().calls.filter(
    (call) => call[0] === 'issue' && call[1] === 'edit' && call[2] === String(malformedClaimNumber),
  ).length;
  const malformedClaim = run('claim', String(malformedClaimNumber));
  assert.equal(malformedClaim.status, 1);
  assert.match(malformedClaim.stderr, new RegExp(`#${malformedClaimNumber}: check 9:`));
  assert.deepEqual(issue(malformedClaimNumber), malformedClaimBefore);
  assert.equal(
    loadState().calls.filter(
      (call) => call[0] === 'issue' && call[1] === 'edit' && call[2] === String(malformedClaimNumber),
    ).length,
    malformedClaimEditsBefore,
  );
  const foreignClaimNumber = createPlan('foreign-claim');
  updateIssue(foreignClaimNumber, (entry) => {
    entry.assignees = ['other-agent'];
  });
  const foreignBefore = issue(foreignClaimNumber);
  const foreignClaim = run('claim', String(foreignClaimNumber));
  assert.equal(foreignClaim.status, 1);
  assert.equal(foreignClaim.stderr.trim(), `plan #${foreignClaimNumber} is owned by other-agent`);
  assert.deepEqual(issue(foreignClaimNumber), foreignBefore);
  for (const command of ['edit', 'status', 'step', 'archive', 'retire']) {
    const number = createPlan(`foreign-${command}`);
    makeValid(number);
    if (command === 'step' || command === 'archive') setIssueStatus(number, 'ongoing');
    updateIssue(number, (entry) => {
      entry.assignees = ['other-agent'];
    });
    const before = issue(number);
    let editFile = '';
    if (command === 'edit') {
      const editExport = run('export', String(number));
      expectSuccess(editExport, 'export before foreign-owner edit refusal');
      editFile = editExport.stdout.trim();
      fs.writeFileSync(editFile, before.body);
    }
    const commandArgs = {
      edit: ['edit', String(number), '--file', editFile],
      status: ['status', String(number), 'planned'],
      step: ['step', String(number), 'implement_contract', 'done'],
      archive: ['archive', String(number)],
      retire: ['retire', String(number), '--reason', 'Foreign owner'],
    }[command];
    const refused = run(...commandArgs);
    assert.equal(refused.status, 1, `${command} must refuse a foreign owner`);
    assert.equal(refused.stderr.trim(), `plan #${number} is owned by other-agent`);
    assert.deepEqual(issue(number), before, `${command} must not mutate a foreign-owned issue`);
  }
  expectSuccess(run('show', String(foreignClaimNumber)), 'show foreign-owned plan');
  expectSuccess(run('export', String(foreignClaimNumber)), 'export foreign-owned plan');
  expectSuccess(run('list'), 'list foreign-owned plan');

  const unassignedWriteNumber = createPlan('unassigned-write');
  makeValid(unassignedWriteNumber);
  updateIssue(unassignedWriteNumber, (entry) => {
    entry.assignees = [];
    entry.body = entry.body.replace('_Not researched yet._', 'Research is complete.');
  });
  const unassignedStatus = run('status', String(unassignedWriteNumber), 'planned');
  expectSuccess(unassignedStatus, 'status claims an unassigned plan');
  assert.deepEqual(issue(unassignedWriteNumber).assignees, ['plan-agent']);
  const ownershipEdit = loadState().calls.findLast(
    (call) => call[0] === 'issue' && call[1] === 'edit' && call[2] === String(unassignedWriteNumber),
  );
  assert.equal(ownershipEdit.includes('--body-file'), false, 'phase-only status must not rewrite the v3 body');
  assert.ok(ownershipEdit.includes('--remove-label'));
  assert.ok(ownershipEdit.includes('--add-label'));
  assert.deepEqual(
    ownershipEdit.slice(ownershipEdit.indexOf('--add-assignee'), ownershipEdit.indexOf('--add-assignee') + 2),
    ['--add-assignee', '@me'],
  );
  const emptyLoginCases = [];
  for (const command of ['edit', 'status', 'step', 'archive', 'retire']) {
    const number = createPlan(`empty-login-${command}`);
    makeValid(number);
    if (command === 'step' || command === 'archive') setIssueStatus(number, 'ongoing');
    const before = issue(number);
    let editFile = '';
    if (command === 'edit') {
      const editExport = run('export', String(number));
      expectSuccess(editExport, 'export before missing-login edit refusal');
      editFile = editExport.stdout.trim();
      fs.writeFileSync(editFile, before.body);
    }
    emptyLoginCases.push({
      command,
      number,
      before,
      args: {
        edit: ['edit', String(number), '--file', editFile],
        status: ['status', String(number), 'planned'],
        step: ['step', String(number), 'implement_contract', 'done'],
        archive: ['archive', String(number)],
        retire: ['retire', String(number), '--reason', 'No acting login'],
      }[command],
    });
  }
  updateState((state) => {
    delete state.viewerLogin;
  });
  const loginFailure = 'cannot resolve the acting GitHub login (gh api user --jq .login returned nothing)';
  for (const { command, number, before, args } of emptyLoginCases) {
    const refused = run(...args);
    assert.equal(refused.status, 1, `${command} must require an acting login`);
    assert.equal(refused.stderr.trim(), loginFailure);
    assert.deepEqual(issue(number), before, `${command} must not mutate without an acting login`);
  }
  expectSuccess(run('show', String(emptyLoginCases[0].number)), 'show without acting login');
  expectSuccess(run('export', String(emptyLoginCases[0].number)), 'export without acting login');
  expectSuccess(run('list'), 'list without acting login');
  updateState((state) => {
    state.viewerLogin = 'plan-agent';
  });
  assert.equal(fs.readdirSync(path.join(stateHome, 'docks/plan')).length, 0, 'new must remove its body temp file');
  assert.equal(fs.statSync(path.join(stateHome, 'docks/plan')).mode & 0o777, 0o700);

  const validNumber = createPlan('checks');
  makeValid(validNumber);
  expectCheckPass(validNumber);

  const mutations = [
    [
      'removed v3 marker',
      (entry) => {
        entry.body = entry.body.replace(`${V3_MARKER}\n\n`, '');
      },
      /check 1: unreadable plan contract/,
    ],
    [
      'frontmatter fence inserted into a v3 body',
      (entry) => {
        entry.body = entry.body.replace(`${V3_MARKER}\n\n`, `${V3_MARKER}\n\n---\nstatus: drafting\n---\n\n`);
      },
      /check 1:/,
    ],
    [
      'Research section renamed',
      (entry) => {
        entry.body = entry.body.replace('## Research', '## Findings');
      },
      /check 5:/,
    ],
    [
      'step id made non-portable',
      (entry) => {
        entry.body = entry.body.replace('| implement_contract |', '| Implement-contract |');
      },
      /check 6:/,
    ],
    [
      'unknown step token introduced',
      (entry) => {
        entry.body = entry.body.replace('_Not researched yet._', '_Not researched yet._ step:missing');
      },
      /check 7:/,
    ],
    [
      'unfinished dependency introduced',
      (entry) => {
        entry.body = entry.body.replace('| - | `local` |', '| 2 | `local` |');
      },
      /check 8:/,
    ],
    [
      'duplicate Acceptance id introduced',
      (entry) => {
        entry.body = entry.body.replace(
          '| A1 | `node --version` | Exit 0 |',
          '| A1 | `node --version` | Exit 0 |\n| A1 | `node -v` | Exit 0 |',
        );
      },
      /check 9:/,
    ],
    [
      'absolute path introduced',
      (entry) => {
        entry.body = entry.body.replace('_Not researched yet._', '_Not researched yet._ /home/alice/private');
      },
      /check 10:/,
    ],
    [
      'em dash introduced',
      (entry) => {
        entry.body = entry.body.replace('_Not researched yet._', `_Not researched yet._ ${FORBIDDEN_DASH}`);
      },
      /check 10: body contains an em dash/,
    ],
    [
      'self-reference introduced',
      (entry) => {
        entry.body = entry.body.replace('src/example.mjs', `#${validNumber}`);
      },
      /check 12:/,
    ],
    [
      'unsupported mode introduced',
      (entry) => {
        entry.body = entry.body.replace('Mode: plan-and-implement', 'Mode: direct');
      },
      /check 13:/,
    ],
  ];
  for (const [mutationName, mutate, errorPattern] of mutations)
    mutateAndRestore(validNumber, mutationName, mutate, errorPattern);

  mutateAndRestore(validNumber, 'second phase label added', (entry) => entry.labels.push('plan:blocked'), /check 2:/);
  for (const ownReference of [String(validNumber), `#${validNumber}`, issue(validNumber).url]) {
    mutateAndRestore(
      validNumber,
      `self-reference ${ownReference} introduced`,
      (entry) => {
        entry.body = entry.body.replace('src/example.mjs', ownReference);
      },
      /check 12:/,
    );
  }
  for (const machinePath of [
    '/usr/local/x',
    '/workspace/x',
    '/tmp/x',
    'C:\\Users\\x',
    '\\\\host\\share',
    '`/home/user/x`',
    '`C:\\Users\\x`',
    '`\\\\host\\share`',
    '/dev/shm/x',
  ]) {
    mutateAndRestore(
      validNumber,
      `machine path ${machinePath} introduced`,
      (entry) => {
        entry.body = entry.body.replace('_Not researched yet._', `_Not researched yet._ ${machinePath}`);
      },
      /check 10:/,
    );
  }

  const portableCitationsFile = path.join(scratch, 'portable-citations-plan.md');
  fs.writeFileSync(
    portableCitationsFile,
    issue(validNumber).body.replace(
      '_Not researched yet._',
      [
        'Repository facts are in src/example.mjs and DocksDocks/docks#23.',
        'See https://example.com/usr/local/x and [the lifecycle guide](/docs/plan-lifecycle).',
        'Command: {/tmp/example}',
        'Cover each untracked path with `git diff --no-index /dev/null docs/PLAN.md`.',
      ].join('\n'),
    ),
  );
  expectSuccess(run('check', '--file', portableCitationsFile), 'check portable path citations');

  const validFile = path.join(scratch, 'valid-plan.md');
  fs.writeFileSync(validFile, issue(validNumber).body);
  const fileCheck = run('check', '--file', validFile);
  expectSuccess(fileCheck, 'check --file v3');
  assert.equal(fileCheck.stdout.trim(), `plan check passed: ${validFile}`);

  const fileOnlyBlockedNumber = createPlan('file-only-blocked');
  makeValid(fileOnlyBlockedNumber);
  setIssueStatus(fileOnlyBlockedNumber, 'blocked', 'waiting for a durable dependency');
  const fileOnlyBlockedBody = issue(fileOnlyBlockedNumber).body;
  const fileOnlyBlockedExport = run('export', String(fileOnlyBlockedNumber));
  expectSuccess(fileOnlyBlockedExport, 'export blocked plan');
  const fileOnlyBlockedFile = fileOnlyBlockedExport.stdout.trim();
  assert.equal(
    fs.readFileSync(fileOnlyBlockedFile, 'utf8'),
    fileOnlyBlockedBody,
    'export must copy the blocked body verbatim',
  );
  expectSuccess(run('check', '--file', fileOnlyBlockedFile), 'check --file without phase');
  expectSuccess(run('check', String(fileOnlyBlockedNumber)), 'check blocked issue with Blocked reason');
  updateIssue(fileOnlyBlockedNumber, (entry) => {
    entry.labels = entry.labels.filter((label) => !label.startsWith('plan:'));
    entry.labels.push('plan:ongoing');
  });
  const ongoingBlockedCheck = run('check', String(fileOnlyBlockedNumber));
  assert.equal(ongoingBlockedCheck.status, 1, 'issue-bound checks must still apply phase rules');
  assert.equal(
    ongoingBlockedCheck.stderr.trim(),
    `#${fileOnlyBlockedNumber}: check 2: only blocked status may open Open questions with \`Blocked:\`; status is ongoing`,
  );

  const fileOnlyPlaceholderNumber = createPlan('file-only-placeholder');
  const fileOnlyPlaceholderBody = makeValid(fileOnlyPlaceholderNumber);
  const fileOnlyPlaceholderFile = path.join(scratch, 'file-only-placeholder-plan.md');
  fs.writeFileSync(fileOnlyPlaceholderFile, fileOnlyPlaceholderBody);
  expectSuccess(run('check', '--file', fileOnlyPlaceholderFile), 'check --file with placeholder Research');
  setIssueStatus(fileOnlyPlaceholderNumber, 'ongoing');
  updateIssue(fileOnlyPlaceholderNumber, (entry) => {
    entry.body = fileOnlyPlaceholderBody;
  });
  const ongoingPlaceholderCheck = run('check', String(fileOnlyPlaceholderNumber));
  assert.equal(ongoingPlaceholderCheck.status, 1, 'issue-bound checks must reject placeholder Research after drafting');
  assert.equal(
    ongoingPlaceholderCheck.stderr.trim(),
    `#${fileOnlyPlaceholderNumber}: check 11: Research must be filled once the plan leaves drafting`,
  );

  // A plan about this contract must be able to quote the marker inline; only a second standalone marker line is a defect.
  const quotingFile = path.join(scratch, 'quotes-marker-plan.md');
  fs.writeFileSync(
    quotingFile,
    issue(validNumber).body.replace(
      '## Research\n',
      `## Research\n\nA v3 body opens with \`${V3_MARKER}\` on its first line.\n`,
    ),
  );
  expectSuccess(run('check', '--file', quotingFile), 'check --file marker quoted inline');
  const duplicateMarkerFile = path.join(scratch, 'duplicate-marker-plan.md');
  fs.writeFileSync(
    duplicateMarkerFile,
    issue(validNumber).body.replace('## Research\n', `## Research\n\n${V3_MARKER}\n`),
  );
  const duplicateMarker = run('check', '--file', duplicateMarkerFile);
  assert.equal(duplicateMarker.status, 1, 'a second standalone marker line must fail');
  assert.match(duplicateMarker.stderr, /check 1:/);

  const frontmatterFile = path.join(scratch, 'frontmatter-plan.md');
  const frontmatterBody = issue(validNumber).body.replace(
    `${V3_MARKER}\n\n`,
    [
      '---',
      'plan_contract: v2',
      'title: Exercise checks',
      'goal: The checks plan completes its observable contract',
      'status: drafting',
      'created: "2026-08-20T20:00:00.000Z"',
      'updated: "2026-08-20T20:00:00.000Z"',
      'assignee: null',
      '---',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(frontmatterFile, frontmatterBody);
  const frontmatterCheck = run('check', '--file', frontmatterFile);
  assert.equal(frontmatterCheck.status, 1, 'accepting frontmatter as a plan-contract mutation must fail');
  assert.match(
    frontmatterCheck.stderr,
    /check 1: unreadable plan contract/,
    'routing frontmatter to a parser instead of unreadable-contract refusal must fail',
  );

  const planRunFile = path.join(scratch, 'plan-run-plan.md');
  fs.writeFileSync(planRunFile, issue(validNumber).body.replace(`${V3_MARKER}\n\n`, 'Plan-run: historical-run\n\n'));
  const planRunCheck = run('check', '--file', planRunFile);
  assert.equal(planRunCheck.status, 1, 'accepting an unmarked Plan-run body mutation must fail');
  assert.match(
    planRunCheck.stderr,
    /check 1: unreadable plan contract/,
    'classifying an unmarked Plan-run body as anything but unreadable must fail',
  );

  const unreadableFile = path.join(scratch, 'unreadable-plan.md');
  fs.writeFileSync(unreadableFile, '# Unmarked plan\n');
  const unreadableCheck = run('check', '--file', unreadableFile);
  assert.equal(unreadableCheck.status, 1, 'removing every contract marker must classify the body as unreadable');
  assert.match(unreadableCheck.stderr, /check 1: unreadable plan contract/);

  const beforeReordered = fs.readFileSync(validFile, 'utf8');
  fs.writeFileSync(validFile, beforeReordered.replace('| # | Id |', '| Number | Id |'));
  const wrongHeader = run('check', '--file', validFile);
  assert.equal(wrongHeader.status, 1);
  assert.match(wrongHeader.stderr, /check 6: Steps table header must match the contract/);
  assert.doesNotMatch(wrongHeader.stderr, /eight cells/);
  assert.equal(wrongHeader.stderr.match(/check 6:/g)?.length, 1);

  const fenced = beforeReordered
    .replace(
      '| # | Id | Task | Files | Depends | Effect | Status | Done when |',
      [
        '```text',
        '| # | Id | Task | Files | Depends | Effect | Status | Done when |',
        '|---:|---|---|---|---|---|---|---|',
        '```',
        '| # | Id | Task | Files | Depends | Effect | Status | Done when |',
      ].join('\n'),
    )
    .replace('_Not implemented yet._', ['```text', '## Captured command output', '```'].join('\n'));
  fs.writeFileSync(validFile, fenced);
  expectSuccess(run('check', '--file', validFile), 'fenced table check');

  const editNumber = createPlan('edit');
  makeValid(editNumber);
  const beforeRejectedEdit = issue(editNumber).body;
  const editExport = run('export', String(editNumber));
  expectSuccess(editExport, 'export before edit validation');
  const invalidEdit = editExport.stdout.trim();
  fs.writeFileSync(invalidEdit, beforeRejectedEdit.replace('Mode: plan-and-implement', 'Mode: direct'));
  const rejectedEdit = run('edit', String(editNumber), '--file', invalidEdit);
  assert.equal(rejectedEdit.status, 1);
  assert.match(rejectedEdit.stderr, /check 13:/);
  assert.equal(issue(editNumber).body, beforeRejectedEdit, 'failed edit must leave issue unchanged');

  const acceptedEdit = invalidEdit;
  fs.writeFileSync(
    acceptedEdit,
    beforeRejectedEdit.replace('None\n\n## Open questions', 'src/generated.mjs\n\n## Open questions'),
  );
  const edited = run('edit', `#${editNumber}`, '--file', acceptedEdit);
  expectSuccess(edited, 'edit');
  assert.match(edited.stdout, new RegExp(`^#${editNumber} · drafting · Exercise edit · https://`));
  assert.match(edited.stdout, /changed: 2 line\(s\)\n-None\n\+src\/generated\.mjs/);
  assert.doesNotMatch(edited.stdout, /plan_contract: v2/);
  assert.equal(issue(editNumber).body, fs.readFileSync(acceptedEdit, 'utf8'));

  const shown = run('show', String(editNumber));
  expectSuccess(shown, 'show');
  const shownHeader = `#${editNumber} · drafting · Exercise edit · ${issue(editNumber).url}`;
  const emptyReviewSummary = 'reviews: plan=none code=none';
  assert.equal(shown.stdout, `${shownHeader}\n${emptyReviewSummary}\n`);
  assert.equal(shown.stderr, '');
  assert.doesNotMatch(shown.stdout, /plan_contract:/);
  const shownBody = run('show', `#${editNumber}`, '--body');
  expectSuccess(shownBody, 'show --body');
  assert.equal(shownBody.stdout, issue(editNumber).body);
  assert.equal(shownBody.stderr, `${shownHeader}\n${emptyReviewSummary}\n`);

  const commentSummaryNumber = createPlan('comment-review-summary');
  updateState((state) => {
    const entry = state.issues.find((candidate) => candidate.number === commentSummaryNumber);
    entry.comments = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      body:
        index === 0
          ? '### Plan review - 2026-08-20\nPlan-review: repair\n- [goal_fit] ## Goal - foreign finding - ignore it'
          : 'not a review record',
      author: 'other-agent',
      createdAt: new Date(Date.parse('2026-08-20T20:00:00Z') + index * 1000).toISOString(),
    }));
    state.nextComment = 101;
  });
  addIssueComment(
    commentSummaryNumber,
    '### Plan review - 2026-08-21\nPlan-review: repair\n- [research_gap] src/example.mjs:1 - evidence is missing - cite the source',
  );
  addIssueComment(commentSummaryNumber, '### Code review round 1 - 2026-08-21\nCode-review: pass');
  addIssueComment(commentSummaryNumber, '### Plan review - 2026-08-22\nPlan-review: pass');
  addIssueComment(
    commentSummaryNumber,
    '### Code review round 2 - 2026-08-22\nCode-review: fixes-required\n- HIGH · Bug · src/example.mjs:9 - later regression survives - fix the regression',
  );
  addIssueComment(commentSummaryNumber, '### Code review round 3 - 2026-08-23\nCode-review: pass', 'other-agent');
  addIssueComment(
    commentSummaryNumber,
    '### Code review round 4 - 2026-08-24\nCode-review: pass\n- HIGH · Security · src/example.mjs:10 - malformed pass carries high - reject the malformed record',
  );
  const commentCallsBefore = loadState().calls.length;
  const commentSummary = run('show', String(commentSummaryNumber));
  expectSuccess(commentSummary, 'show paginated trusted review summary');
  assert.equal(
    commentSummary.stdout,
    `#${commentSummaryNumber} · drafting · Exercise comment-review-summary · ${issue(commentSummaryNumber).url}\n` +
      'reviews: plan=pass code=fixes-required\n',
  );
  const commentApiCall = loadState()
    .calls.slice(commentCallsBefore)
    .find(
      (call) => call[0] === 'api' && call[1] === `repos/DocksDocks/fixture/issues/${commentSummaryNumber}/comments`,
    );
  assert.ok(commentApiCall?.includes('--paginate'), 'show must request every issue-comment page');
  assert.ok(commentApiCall?.includes('--slurp'), 'show must parse paginated issue comments as pages');

  const legacySummaryNumber = createPlan('legacy-review-summary');
  updateIssue(legacySummaryNumber, (entry) => {
    entry.body = entry.body.replace(
      '_Review records are stored in issue comments._',
      'Plan-review: repair\nCode-review: pass',
    );
  });
  const legacySummary = run('show', String(legacySummaryNumber));
  expectSuccess(legacySummary, 'show legacy review summary');
  assert.match(legacySummary.stdout, /reviews: plan=repair code=pass\n$/);

  const ambiguousOwnerSummaryNumber = createPlan('ambiguous-owner-review-summary');
  updateIssue(ambiguousOwnerSummaryNumber, (entry) => {
    entry.assignees.push('other-agent');
  });
  addIssueComment(ambiguousOwnerSummaryNumber, '### Plan review - 2026-08-24\nPlan-review: pass');
  const ambiguousOwnerSummary = run('show', String(ambiguousOwnerSummaryNumber));
  expectSuccess(ambiguousOwnerSummary, 'show refuses comment trust without a sole assignee');
  assert.match(ambiguousOwnerSummary.stdout, /reviews: plan=none code=none\n$/);

  const reviewDirectory = path.join(scratch, '.git/docks-review');
  const exported = run('export', String(editNumber));
  expectSuccess(exported, 'export');
  const exportPath = path.join(reviewDirectory, `plan-${editNumber}.md`);
  assert.equal(exported.stdout, `${exportPath}\n`);
  assert.equal(fs.readFileSync(exportPath, 'utf8'), issue(editNumber).body);
  assert.equal(shownBody.stdout, fs.readFileSync(exportPath, 'utf8'));
  assert.equal(fs.statSync(reviewDirectory).mode & 0o777, 0o700);
  updateIssue(editNumber, (entry) => {
    entry.body = entry.body.replace('src/generated.mjs', 'src/exported.mjs');
  });
  expectSuccess(run('export', `#${editNumber}`), 'export overwrite');
  assert.equal(fs.readFileSync(exportPath, 'utf8'), issue(editNumber).body);
  const addedWorktree = spawnSync('git', ['worktree', 'add', '--quiet', '--detach', linkedScratch, 'HEAD'], {
    cwd: scratch,
    encoding: 'utf8',
  });
  assert.equal(addedWorktree.status, 0, addedWorktree.stderr);
  assert.equal(fs.statSync(path.join(linkedScratch, '.git')).isFile(), true);
  const linkedExport = runIn(linkedScratch, 'export', String(editNumber));
  expectSuccess(linkedExport, 'export from linked worktree');
  const linkedExportPath = linkedExport.stdout.trim();
  assert.equal(path.isAbsolute(linkedExportPath), true);
  assert.equal(path.basename(linkedExportPath), `plan-${editNumber}.md`);
  assert.equal(fs.readFileSync(linkedExportPath, 'utf8'), issue(editNumber).body);
  assert.equal(fs.statSync(path.dirname(linkedExportPath)).mode & 0o777, 0o700);
  const badExportNumber = createPlan('bad-export');
  updateIssue(badExportNumber, (entry) => {
    entry.body = 'unmarked plan\n';
  });
  assert.match(run('export', String(badExportNumber)).stderr, /unreadable plan contract/);
  assert.match(run('export', 'not-a-number').stderr, /invalid plan issue/);

  const sidecarExportNumber = createPlan('sidecar-export');
  makeValid(sidecarExportNumber);
  const sidecarExport = run('export', String(sidecarExportNumber));
  expectSuccess(sidecarExport, 'sidecar export');
  const sidecarExportPath = sidecarExport.stdout.trim();
  const sidecarExportBody = fs.readFileSync(sidecarExportPath, 'utf8');
  assert.equal(sidecarExportBody, issue(sidecarExportNumber).body, 'export must write the live plan body');
  assert.equal(
    fs.readFileSync(`${sidecarExportPath}.origin`, 'utf8'),
    `${bodyDigest(sidecarExportBody)}\n`,
    'export must write the body digest to its sibling origin file',
  );

  const deletedOriginNumber = createPlan('deleted-origin-edit');
  const beforeDeletedOriginEdit = makeValid(deletedOriginNumber);
  const deletedOriginExport = run('export', String(deletedOriginNumber));
  expectSuccess(deletedOriginExport, 'deleted origin export');
  const deletedOriginExportPath = deletedOriginExport.stdout.trim();
  fs.writeFileSync(
    deletedOriginExportPath,
    fs.readFileSync(deletedOriginExportPath, 'utf8').replace('src/example.mjs', 'src/deleted-origin.mjs'),
  );
  fs.unlinkSync(`${deletedOriginExportPath}.origin`);
  const deletedOriginEdit = run('edit', String(deletedOriginNumber), '--file', deletedOriginExportPath);
  assert.equal(deletedOriginEdit.status, 1, 'deleting an export sidecar must fail closed');
  assert.equal(
    deletedOriginEdit.stderr.trim(),
    `missing export provenance: ${deletedOriginExportPath}.origin does not exist; run \`plan.mjs export ${deletedOriginNumber}\` and re-apply the edit`,
  );
  assert.equal(
    issue(deletedOriginNumber).body,
    beforeDeletedOriginEdit,
    'an edit whose export sidecar was deleted must not mutate the issue',
  );

  const copiedExportNumber = createPlan('copied-export-edit');
  const beforeCopiedExportEdit = makeValid(copiedExportNumber);
  const copiedExport = run('export', String(copiedExportNumber));
  expectSuccess(copiedExport, 'copied file export');
  const copiedExportPath = path.join(scratch, 'copied-export-edit.md');
  fs.copyFileSync(copiedExport.stdout.trim(), copiedExportPath);
  fs.writeFileSync(
    copiedExportPath,
    fs.readFileSync(copiedExportPath, 'utf8').replace('src/example.mjs', 'src/copied-export.mjs'),
  );
  assert.equal(fs.existsSync(`${copiedExportPath}.origin`), false, 'copy fixture must omit the origin sidecar');
  const copiedExportEdit = run('edit', String(copiedExportNumber), '--file', copiedExportPath);
  assert.equal(copiedExportEdit.status, 1, 'copying an export without its sidecar must fail closed');
  assert.equal(
    copiedExportEdit.stderr.trim(),
    `missing export provenance: ${copiedExportPath}.origin does not exist; run \`plan.mjs export ${copiedExportNumber}\` and re-apply the edit`,
  );
  assert.equal(
    issue(copiedExportNumber).body,
    beforeCopiedExportEdit,
    'renaming an exported body without its sidecar must not bypass provenance',
  );

  const failedRemoteNumber = createPlan('failed-remote-edit');
  const beforeFailedRemoteEdit = makeValid(failedRemoteNumber);
  const failedRemoteExport = run('export', String(failedRemoteNumber));
  expectSuccess(failedRemoteExport, 'failed remote edit export');
  const failedRemoteExportPath = failedRemoteExport.stdout.trim();
  const failedRemoteBody = fs
    .readFileSync(failedRemoteExportPath, 'utf8')
    .replace('src/example.mjs', 'src/failed-remote.mjs');
  fs.writeFileSync(failedRemoteExportPath, failedRemoteBody);
  updateState((state) => {
    state.issueEditError = 'stubbed issue edit failure';
  });
  const failedRemoteEdit = run('edit', String(failedRemoteNumber), '--file', failedRemoteExportPath);
  assert.equal(failedRemoteEdit.status, 1, 'a remote issue edit failure must remain visible');
  assert.equal(failedRemoteEdit.stderr.trim(), 'gh issue edit failed: stubbed issue edit failure');
  assert.equal(
    fs.readFileSync(`${failedRemoteExportPath}.origin`, 'utf8'),
    `${bodyDigest(failedRemoteBody)}\n`,
    'the refreshed digest must be durable before the remote mutation starts',
  );
  assert.equal(
    issue(failedRemoteNumber).body,
    beforeFailedRemoteEdit,
    'a failed remote issue edit must leave the live body unchanged',
  );
  updateState((state) => {
    delete state.issueEditError;
  });
  const failedRemoteRetry = run('edit', String(failedRemoteNumber), '--file', failedRemoteExportPath);
  assert.equal(failedRemoteRetry.status, 1, 'retrying the failed remote edit without re-exporting must fail closed');
  assert.equal(
    failedRemoteRetry.stderr.trim(),
    `stale export: ${failedRemoteExportPath} was exported from body ${bodyDigest(failedRemoteBody).slice(0, 12)}, but #${failedRemoteNumber} now holds ${bodyDigest(beforeFailedRemoteEdit).slice(0, 12)}; re-export and re-apply the edit`,
  );
  assert.equal(
    issue(failedRemoteNumber).body,
    beforeFailedRemoteEdit,
    'the stale retry after a remote failure must not silently apply',
  );

  const freshExportNumber = createPlan('fresh-export-edit');
  makeValid(freshExportNumber);
  const freshExport = run('export', String(freshExportNumber));
  expectSuccess(freshExport, 'fresh edit export');
  const freshExportPath = freshExport.stdout.trim();
  const freshOriginBefore = fs.readFileSync(`${freshExportPath}.origin`, 'utf8').trim();
  fs.writeFileSync(
    freshExportPath,
    fs.readFileSync(freshExportPath, 'utf8').replace('src/example.mjs', 'src/fresh.mjs'),
  );
  const freshEdit = run('edit', String(freshExportNumber), '--file', freshExportPath);
  expectSuccess(freshEdit, 'fresh exported edit');
  const freshAppliedBody = fs.readFileSync(freshExportPath, 'utf8');
  const freshOriginAfter = fs.readFileSync(`${freshExportPath}.origin`, 'utf8').trim();
  assert.notEqual(freshOriginAfter, freshOriginBefore, 'successful edit must refresh the export origin');
  assert.equal(freshOriginAfter, bodyDigest(freshAppliedBody), 'refreshed origin must describe the applied file');
  assert.equal(issue(freshExportNumber).body, freshAppliedBody, 'fresh exported edit must update the issue body');
  fs.writeFileSync(freshExportPath, freshAppliedBody.replace('src/fresh.mjs', 'src/fresher.mjs'));
  const secondFreshEdit = run('edit', String(freshExportNumber), '--file', freshExportPath);
  expectSuccess(secondFreshEdit, 'second consecutive fresh exported edit');
  const secondFreshAppliedBody = fs.readFileSync(freshExportPath, 'utf8');
  assert.equal(
    fs.readFileSync(`${freshExportPath}.origin`, 'utf8'),
    `${bodyDigest(secondFreshAppliedBody)}\n`,
    'a successful edit must leave provenance valid for the next edit',
  );
  assert.equal(
    issue(freshExportNumber).body,
    secondFreshAppliedBody,
    'a second consecutive edit of the same exported file must update the issue',
  );

  const terminalRegressionNumber = createPlan('terminal-step-regression-edit');
  makeValid(terminalRegressionNumber);
  updateIssue(terminalRegressionNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done');
  });
  const beforeTerminalRegressionEdit = issue(terminalRegressionNumber).body;
  const terminalRegressionExport = run('export', String(terminalRegressionNumber));
  expectSuccess(terminalRegressionExport, 'terminal step regression edit export');
  const terminalRegressionExportPath = terminalRegressionExport.stdout.trim();
  fs.writeFileSync(
    terminalRegressionExportPath,
    replaceStepStatus(fs.readFileSync(terminalRegressionExportPath, 'utf8'), 'planned'),
  );
  const terminalRegressionBodyWritesBefore = loadState().calls.filter(
    (call) =>
      call[0] === 'issue' &&
      call[1] === 'edit' &&
      call[2] === String(terminalRegressionNumber) &&
      call.includes('--body-file'),
  ).length;
  const terminalRegressionEdit = run(
    'edit',
    String(terminalRegressionNumber),
    '--file',
    terminalRegressionExportPath,
  );
  assert.equal(terminalRegressionEdit.status, 1, 'a file must not regress a terminal remote step');
  assert.equal(
    terminalRegressionEdit.stderr.trim(),
    `status regression: step implement_contract (done -> planned) is terminal on #${terminalRegressionNumber} but the file reverts it; re-export and re-apply the edit`,
  );
  assert.equal(
    issue(terminalRegressionNumber).body,
    beforeTerminalRegressionEdit,
    'a terminal step regression must leave the remote body unchanged',
  );
  assert.equal(
    loadState().calls.filter(
      (call) =>
        call[0] === 'issue' &&
        call[1] === 'edit' &&
        call[2] === String(terminalRegressionNumber) &&
        call.includes('--body-file'),
    ).length,
    terminalRegressionBodyWritesBefore,
    'a terminal step regression must fail before the body write',
  );

  const terminalStepRow =
    '| 1 | implement_contract | Implement the contract | src/example.mjs | - | `local` | `done` | command exits 0 |';
  const addedStepRow =
    '| 2 | extend_contract | Extend the contract | src/extra.mjs | - | `local` | `planned` | command exits 0 |';
  const terminalPreservingBody = beforeTerminalRegressionEdit.replace(
    terminalStepRow,
    `${terminalStepRow}\n${addedStepRow}`,
  );
  assert.notEqual(
    terminalPreservingBody,
    beforeTerminalRegressionEdit,
    'the non-regressing edit fixture must add a step row',
  );
  fs.writeFileSync(terminalRegressionExportPath, terminalPreservingBody);
  const terminalPreservingEdit = run(
    'edit',
    String(terminalRegressionNumber),
    '--file',
    terminalRegressionExportPath,
  );
  expectSuccess(terminalPreservingEdit, 'terminal-preserving row addition edit');
  assert.equal(
    issue(terminalRegressionNumber).body,
    terminalPreservingBody,
    'adding a row while preserving terminal cells must update the remote body',
  );
  assert.match(issue(terminalRegressionNumber).body, /\| `done` \| command exits 0 \|/);
  assert.match(issue(terminalRegressionNumber).body, /\| 2 \| extend_contract .+ \| `planned` \| command exits 0 \|/);

  const staleExportNumber = createPlan('stale-export-edit');
  makeValid(staleExportNumber);
  setIssueStatus(staleExportNumber, 'ongoing');
  const staleExport = run('export', String(staleExportNumber));
  expectSuccess(staleExport, 'stale edit export');
  const staleExportPath = staleExport.stdout.trim();
  const staleExportBody = fs.readFileSync(staleExportPath, 'utf8');
  const staleOrigin = bodyDigest(staleExportBody);
  expectSuccess(
    run('step', String(staleExportNumber), 'implement_contract', 'in-flight'),
    'body-changing step before stale edit',
  );
  const steppedBody = issue(staleExportNumber).body;
  const steppedDigest = bodyDigest(steppedBody);
  assert.notEqual(steppedDigest, staleOrigin, 'step status change must make the exported body stale');
  const staleEdit = run('edit', String(staleExportNumber), '--file', staleExportPath);
  assert.equal(staleEdit.status, 1, 'stale exported edit must fail');
  assert.equal(
    staleEdit.stderr.trim(),
    `stale export: ${staleExportPath} was exported from body ${staleOrigin.slice(0, 12)}, but #${staleExportNumber} now holds ${steppedDigest.slice(0, 12)}; re-export and re-apply the edit`,
    'stale edit failure must identify both body digests',
  );
  assert.equal(issue(staleExportNumber).body, steppedBody, 'stale edit refusal must leave the stepped body unchanged');
  assert.match(
    issue(staleExportNumber).body,
    /\| `in-flight` \| command exits 0 \|/,
    'stale edit refusal must preserve the live step status',
  );

  const emptyOriginNumber = createPlan('empty-origin-edit');
  makeValid(emptyOriginNumber);
  const emptyOriginExport = run('export', String(emptyOriginNumber));
  expectSuccess(emptyOriginExport, 'empty origin export');
  const emptyOriginExportPath = emptyOriginExport.stdout.trim();
  const emptyOriginPath = `${emptyOriginExportPath}.origin`;
  const beforeEmptyOriginEdit = issue(emptyOriginNumber).body;
  fs.writeFileSync(
    emptyOriginExportPath,
    fs.readFileSync(emptyOriginExportPath, 'utf8').replace('src/example.mjs', 'src/empty-origin.mjs'),
  );
  fs.truncateSync(emptyOriginPath, 0);
  const emptyOriginEdit = run('edit', String(emptyOriginNumber), '--file', emptyOriginExportPath);
  assert.equal(
    emptyOriginEdit.status,
    1,
    'making readOrigin treat an empty sidecar as absent would let the edit succeed',
  );
  assert.equal(
    emptyOriginEdit.stderr.trim(),
    `unreadable export provenance: ${emptyOriginPath} holds no sha256 digest; re-export the plan`,
    'removing the empty-digest validation from readOrigin would lose the unreadable-provenance diagnostic',
  );
  assert.equal(
    issue(emptyOriginNumber).body,
    beforeEmptyOriginEdit,
    'letting an empty readOrigin result bypass the guard would overwrite the live body',
  );

  const whitespaceOriginNumber = createPlan('whitespace-origin-edit');
  makeValid(whitespaceOriginNumber);
  const whitespaceOriginExport = run('export', String(whitespaceOriginNumber));
  expectSuccess(whitespaceOriginExport, 'whitespace origin export');
  const whitespaceOriginExportPath = whitespaceOriginExport.stdout.trim();
  const whitespaceOriginPath = `${whitespaceOriginExportPath}.origin`;
  const beforeWhitespaceOriginEdit = issue(whitespaceOriginNumber).body;
  fs.writeFileSync(
    whitespaceOriginExportPath,
    fs.readFileSync(whitespaceOriginExportPath, 'utf8').replace('src/example.mjs', 'src/whitespace-origin.mjs'),
  );
  fs.writeFileSync(whitespaceOriginPath, ' \t\n');
  const whitespaceOriginEdit = run('edit', String(whitespaceOriginNumber), '--file', whitespaceOriginExportPath);
  assert.equal(
    whitespaceOriginEdit.status,
    1,
    'making readOrigin use a bare nonempty check would let a whitespace-only sidecar edit succeed',
  );
  assert.equal(
    whitespaceOriginEdit.stderr.trim(),
    `unreadable export provenance: ${whitespaceOriginPath} holds no sha256 digest; re-export the plan`,
    'removing trimmed-digest validation from readOrigin would lose the whitespace provenance diagnostic',
  );
  assert.equal(
    issue(whitespaceOriginNumber).body,
    beforeWhitespaceOriginEdit,
    'letting whitespace provenance bypass the guard would overwrite the live body',
  );

  const timestampOriginNumber = createPlan('timestamp-origin-edit');
  makeValid(timestampOriginNumber);
  const timestampOriginExport = run('export', String(timestampOriginNumber));
  expectSuccess(timestampOriginExport, 'timestamp origin export');
  const timestampOriginExportPath = timestampOriginExport.stdout.trim();
  const timestampOriginPath = `${timestampOriginExportPath}.origin`;
  const beforeTimestampOriginEdit = issue(timestampOriginNumber).body;
  fs.writeFileSync(
    timestampOriginExportPath,
    fs.readFileSync(timestampOriginExportPath, 'utf8').replace('src/example.mjs', 'src/timestamp-origin.mjs'),
  );
  fs.writeFileSync(timestampOriginPath, '2026-08-21T10:00:00Z\n');
  const timestampOriginEdit = run('edit', String(timestampOriginNumber), '--file', timestampOriginExportPath);
  assert.equal(
    timestampOriginEdit.status,
    1,
    'changing readOrigin to accept timestamp provenance would let the edit succeed',
  );
  assert.equal(
    timestampOriginEdit.stderr.trim(),
    `unreadable export provenance: ${timestampOriginPath} holds no sha256 digest; re-export the plan`,
    'replacing digest provenance with timestamps in readOrigin would suppress the unreadable diagnostic',
  );
  assert.equal(
    issue(timestampOriginNumber).body,
    beforeTimestampOriginEdit,
    'accepting timestamp provenance as a digest would overwrite the live body',
  );

  const wrongDigestNumber = createPlan('wrong-digest-edit');
  makeValid(wrongDigestNumber);
  const wrongDigestExport = run('export', String(wrongDigestNumber));
  expectSuccess(wrongDigestExport, 'wrong digest export');
  const wrongDigestExportPath = wrongDigestExport.stdout.trim();
  const wrongDigestPath = `${wrongDigestExportPath}.origin`;
  const beforeWrongDigestEdit = issue(wrongDigestNumber).body;
  fs.writeFileSync(
    wrongDigestExportPath,
    fs.readFileSync(wrongDigestExportPath, 'utf8').replace('src/example.mjs', 'src/wrong-digest.mjs'),
  );
  fs.writeFileSync(wrongDigestPath, `${bodyDigest('a different exported body\n')}\n`);
  const wrongDigestEdit = run('edit', String(wrongDigestNumber), '--file', wrongDigestExportPath);
  assert.equal(
    wrongDigestEdit.status,
    1,
    'removing the live-body digest comparison after readOrigin would let a wrong digest edit succeed',
  );
  assert.match(
    wrongDigestEdit.stderr,
    /stale export:/,
    'routing every sidecar mismatch through readOrigin validation would lose the stale-export diagnostic',
  );
  assert.doesNotMatch(
    wrongDigestEdit.stderr,
    /unreadable export provenance/,
    'rejecting a valid sha256 digest in readOrigin would misreport stale provenance as unreadable',
  );
  assert.equal(
    issue(wrongDigestNumber).body,
    beforeWrongDigestEdit,
    'removing the stale-export refusal after a valid wrong digest would overwrite the live body',
  );

  const blockedStatusNumber = createPlan('blocked-status-export-edit');
  makeValid(blockedStatusNumber);
  const blockedStatusExport = run('export', String(blockedStatusNumber));
  expectSuccess(blockedStatusExport, 'blocked status export');
  const blockedStatusExportPath = blockedStatusExport.stdout.trim();
  const beforeBlockedStatus = issue(blockedStatusNumber).body;
  expectSuccess(
    run('status', String(blockedStatusNumber), 'blocked', '--reason', 'waiting for provenance review'),
    'body-changing blocked status',
  );
  const afterBlockedStatus = issue(blockedStatusNumber).body;
  assert.notEqual(
    afterBlockedStatus,
    beforeBlockedStatus,
    'removing the Blocked line body write from setPlanStatus would leave the export fresh',
  );
  assert.match(
    afterBlockedStatus,
    /## Open questions\n\nBlocked: waiting for provenance review\n/,
    'moving the setPlanStatus Blocked line outside Open questions would break the body-write fixture',
  );
  fs.writeFileSync(
    blockedStatusExportPath,
    fs.readFileSync(blockedStatusExportPath, 'utf8').replace('src/example.mjs', 'src/blocked-stale.mjs'),
  );
  const blockedStatusEdit = run('edit', String(blockedStatusNumber), '--file', blockedStatusExportPath);
  assert.equal(
    blockedStatusEdit.status,
    1,
    'skipping provenance checks after setPlanStatus body writes would let a stale edit succeed',
  );
  assert.match(
    blockedStatusEdit.stderr,
    /stale export:/,
    'failing to compare the pre-blocked export digest would suppress the stale-export diagnostic',
  );
  assert.equal(
    issue(blockedStatusNumber).body,
    afterBlockedStatus,
    'letting an export predate the setPlanStatus Blocked line would overwrite the live body',
  );

  const labelOnlyNumber = createPlan('label-only-export-edit');
  makeValid(labelOnlyNumber);
  updateIssue(labelOnlyNumber, (entry) => {
    entry.body = entry.body.replace('_Not researched yet._', 'Repository facts confirm the phase-only transition.');
  });
  const labelOnlyExport = run('export', String(labelOnlyNumber));
  expectSuccess(labelOnlyExport, 'label-only edit export');
  const labelOnlyExportPath = labelOnlyExport.stdout.trim();
  const beforeLabelOnlyStatus = issue(labelOnlyNumber);
  const labelOnlyOrigin = fs.readFileSync(`${labelOnlyExportPath}.origin`, 'utf8');
  expectSuccess(run('status', String(labelOnlyNumber), 'planned'), 'label-only status change');
  const afterLabelOnlyStatus = issue(labelOnlyNumber);
  assert.equal(
    afterLabelOnlyStatus.body,
    beforeLabelOnlyStatus.body,
    'phase-only status change must leave body provenance valid',
  );
  assert.notEqual(
    afterLabelOnlyStatus.updatedAt,
    beforeLabelOnlyStatus.updatedAt,
    'label-only fixture write must advance the issue timestamp',
  );
  assert.equal(
    fs.readFileSync(`${labelOnlyExportPath}.origin`, 'utf8'),
    labelOnlyOrigin,
    'a phase-only status write must not invalidate digest provenance',
  );
  assert.equal(
    labelOnlyOrigin,
    `${bodyDigest(afterLabelOnlyStatus.body)}\n`,
    'phase-only provenance must describe body bytes rather than the issue timestamp',
  );
  fs.writeFileSync(
    labelOnlyExportPath,
    fs.readFileSync(labelOnlyExportPath, 'utf8').replace('src/example.mjs', 'src/label-safe.mjs'),
  );
  const labelOnlyEdit = run('edit', String(labelOnlyNumber), '--file', labelOnlyExportPath);
  expectSuccess(labelOnlyEdit, 'edit after label-only status change');
  assert.equal(
    issue(labelOnlyNumber).body,
    fs.readFileSync(labelOnlyExportPath, 'utf8'),
    'label-only write must not block a fresh exported edit',
  );

  const handwrittenNumber = createPlan('handwritten-edit');
  const beforeHandwrittenEdit = makeValid(handwrittenNumber);
  const handwrittenBody = beforeHandwrittenEdit.replace('src/example.mjs', 'src/handwritten.mjs');
  const handwrittenPath = path.join(scratch, 'handwritten-edit.md');
  fs.writeFileSync(handwrittenPath, handwrittenBody);
  assert.equal(
    fs.existsSync(`${handwrittenPath}.origin`),
    false,
    'hand-written edit fixture must have no origin sidecar',
  );
  const handwrittenEdit = run('edit', String(handwrittenNumber), '--file', handwrittenPath);
  assert.equal(handwrittenEdit.status, 1, 'a hand-written edit without provenance must fail closed');
  assert.equal(
    handwrittenEdit.stderr.trim(),
    `missing export provenance: ${handwrittenPath}.origin does not exist; run \`plan.mjs export ${handwrittenNumber}\` and re-apply the edit`,
  );
  assert.equal(
    issue(handwrittenNumber).body,
    beforeHandwrittenEdit,
    'a hand-written file without provenance metadata must not apply',
  );

  const planTransitions = {
    drafting: new Set(['planned', 'ongoing', 'blocked']),
    planned: new Set(['drafting', 'ongoing', 'blocked']),
    ongoing: new Set(['blocked']),
    blocked: new Set(['drafting', 'planned', 'ongoing']),
  };
  const transitionNumber = createPlan('transitions');
  makeValid(transitionNumber);
  for (const [source, legalTargets] of Object.entries(planTransitions)) {
    for (const target of Object.keys(planTransitions)) {
      setIssueStatus(transitionNumber, source);
      const result = run(
        'status',
        String(transitionNumber),
        target,
        ...(target === 'blocked' ? ['--reason', 'waiting for input'] : []),
      );
      if (legalTargets.has(target)) {
        expectSuccess(result, `${source} -> ${target}`);
        assert.equal(result.stdout.trim(), `plan #${transitionNumber} status: ${source} -> ${target}`);
        if (target === 'blocked') {
          assert.match(
            issue(transitionNumber).body,
            /## Open questions\n\nBlocked: waiting for input\n/,
            'moving Blocked below the first Open questions line must fail',
          );
        }
      } else {
        assert.equal(result.status, 1, `${source} -> ${target} must be illegal`);
        assert.match(result.stderr, /illegal plan status transition/);
      }
    }
  }
  setIssueStatus(transitionNumber, 'drafting');
  const missingReason = run('status', String(transitionNumber), 'blocked');
  assert.equal(missingReason.status, 1);
  assert.match(missingReason.stderr, /blocked status requires --reason/);
  const beforeForbiddenBlockedReason = issue(transitionNumber);
  const blockedReasonEditsBefore = loadState().calls.filter(
    (call) => call[0] === 'issue' && call[1] === 'edit' && call[2] === String(transitionNumber),
  ).length;
  const forbiddenBlockedReason = run(
    'status',
    String(transitionNumber),
    'blocked',
    '--reason',
    `waiting${FORBIDDEN_DASH}for input`,
  );
  assert.equal(forbiddenBlockedReason.status, 1, 'blocked status reason must reject an em dash');
  assert.equal(forbiddenBlockedReason.stderr.trim(), 'blocked status --reason must not contain an em dash');
  assert.deepEqual(
    issue(transitionNumber),
    beforeForbiddenBlockedReason,
    'forbidden blocked reason must leave issue unchanged',
  );
  assert.equal(
    loadState().calls.filter(
      (call) => call[0] === 'issue' && call[1] === 'edit' && call[2] === String(transitionNumber),
    ).length,
    blockedReasonEditsBefore,
    'forbidden blocked reason must fail before the composed-body write',
  );

  const blockedCheckNumber = createPlan('blocked-first-line');
  makeValid(blockedCheckNumber);
  setIssueStatus(blockedCheckNumber, 'blocked', 'waiting for a decision');
  expectCheckPass(blockedCheckNumber);
  mutateAndRestore(
    blockedCheckNumber,
    'Blocked reason moved below the first Open questions line',
    (entry) => {
      entry.body = entry.body.replace(
        '## Open questions\n\nBlocked: waiting for a decision\nNone',
        '## Open questions\n\nNone\nBlocked: waiting for a decision',
      );
    },
    /check 2:/,
  );

  const inverseBlockedNumber = createPlan('blocked-line-on-drafting-plan');
  makeValid(inverseBlockedNumber);
  updateIssue(inverseBlockedNumber, (entry) => {
    entry.body = entry.body.replace(
      '## Open questions\n\nNone',
      '## Open questions\n\nBlocked: waiting on a decision\nNone',
    );
  });
  const inverseBlockedCheck = run('check', String(inverseBlockedNumber));
  assert.equal(inverseBlockedCheck.status, 1, 'a non-blocked plan must reject a leading Blocked line');
  assert.equal(
    inverseBlockedCheck.stderr.trim(),
    `#${inverseBlockedNumber}: check 2: only blocked status may open Open questions with \`Blocked:\`; status is drafting`,
  );
  setIssueStatus(inverseBlockedNumber, 'blocked', 'waiting on a decision');
  expectCheckPass(inverseBlockedNumber);

  const finishedStatus = run('status', String(transitionNumber), 'finished');
  assert.equal(finishedStatus.status, 1, 're-adding finished to the writable status enum must fail');
  assert.match(finishedStatus.stderr, /unknown plan status: finished/);

  const closedStatusNumber = createPlan('closed-status');
  makeValid(closedStatusNumber);
  setIssueStatus(closedStatusNumber, 'ongoing');
  updateIssue(closedStatusNumber, (entry) => {
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
  });
  const closedStatus = run('status', String(closedStatusNumber), 'blocked', '--reason', 'too late');
  assert.equal(closedStatus.status, 1, 'changing CLOSED to OPEN must be refused');
  assert.match(closedStatus.stderr, /is closed; status applies to open plans/);
  assert.deepEqual(issue(closedStatusNumber).labels, ['plan', 'plan:ongoing']);

  setIssueStatus(transitionNumber, 'drafting');
  updateIssue(transitionNumber, (entry) => entry.labels.push('plan:bogus', 'security'));
  const bogusListing = run('list');
  expectSuccess(bogusListing, 'list ignores bogus status labels');
  assert.match(bogusListing.stdout, new RegExp(`^drafting\\t#${transitionNumber}\\t`, 'm'));
  assert.doesNotMatch(bogusListing.stdout, /plan:bogus/);
  updateIssue(transitionNumber, (entry) => entry.labels.push('plan:blocked'));
  const malformedStatusBefore = issue(transitionNumber);
  const malformedStatusEditsBefore = loadState().calls.filter(
    (call) => call[0] === 'issue' && call[1] === 'edit' && call[2] === String(transitionNumber),
  ).length;
  const malformedStatus = run('status', String(transitionNumber), 'planned');
  assert.equal(malformedStatus.status, 1);
  assert.match(malformedStatus.stderr, new RegExp(`#${transitionNumber}: check 2:`));
  assert.deepEqual(issue(transitionNumber), malformedStatusBefore);
  assert.equal(
    loadState().calls.filter(
      (call) => call[0] === 'issue' && call[1] === 'edit' && call[2] === String(transitionNumber),
    ).length,
    malformedStatusEditsBefore,
  );

  const stepTransitions = {
    planned: new Set(['in-flight', 'done', 'blocked', 'skipped']),
    'in-flight': new Set(['done', 'blocked', 'skipped']),
    blocked: new Set(['in-flight', 'done', 'skipped']),
    done: new Set(),
    skipped: new Set(),
  };
  const stepNumber = createPlan('step-transitions');
  makeValid(stepNumber);
  setIssueStatus(stepNumber, 'ongoing');
  for (const [source, legalTargets] of Object.entries(stepTransitions)) {
    for (const target of Object.keys(stepTransitions)) {
      updateIssue(stepNumber, (entry) => {
        entry.body = replaceStepStatus(entry.body, source);
      });
      const result = run('step', String(stepNumber), 'implement_contract', target);
      if (legalTargets.has(target)) {
        expectSuccess(result, `step ${source} -> ${target}`);
        assert.equal(result.stdout.trim(), `plan #${stepNumber} step implement_contract: ${source} -> ${target}`);
      } else {
        assert.equal(result.status, 1, `step ${source} -> ${target} must be illegal`);
        assert.match(result.stderr, /illegal step status transition/);
      }
    }
  }

  const finishedStepNumber = createPlan('finished-step-repair');
  makeValid(finishedStepNumber);
  setIssueStatus(finishedStepNumber, 'ongoing');
  updateIssue(finishedStepNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'in-flight');
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
  });
  const finishedStepBefore = issue(finishedStepNumber);
  const finishedStepCallsBefore = loadState().calls.length;
  const finishedStepRepair = run('step', String(finishedStepNumber), 'implement_contract', 'done');
  expectSuccess(finishedStepRepair, 'finished plan terminal step repair');
  assert.equal(
    finishedStepRepair.stdout.trim(),
    `plan #${finishedStepNumber} step implement_contract: in-flight -> done`,
  );
  const finishedStepAfter = issue(finishedStepNumber);
  assert.match(finishedStepAfter.body, /\| `done` \| command exits 0 \|/);
  assert.equal(finishedStepAfter.state, finishedStepBefore.state, 'terminal repair must not reopen the issue');
  assert.equal(
    finishedStepAfter.stateReason,
    finishedStepBefore.stateReason,
    'terminal repair must preserve the completed state reason',
  );
  assert.deepEqual(
    finishedStepAfter.labels,
    finishedStepBefore.labels,
    'terminal repair must not mutate the plan labels',
  );
  const finishedStepCalls = loadState().calls.slice(finishedStepCallsBefore);
  assert.equal(
    finishedStepCalls.filter(
      (call) =>
        call[0] === 'issue' &&
        call[1] === 'edit' &&
        call[2] === String(finishedStepNumber) &&
        call.includes('--body-file'),
    ).length,
    1,
    'terminal repair must record exactly one body edit',
  );
  assert.equal(
    finishedStepCalls.some(
      (call) => call[0] === 'issue' && new Set(['close', 'reopen']).has(call[1]),
    ),
    false,
    'terminal repair must not create another issue state transition',
  );

  const finishedStepBodyBeforeRefusal = finishedStepAfter.body;
  const finishedStepBodyWritesBeforeRefusal = loadState().calls.filter(
    (call) =>
      call[0] === 'issue' &&
      call[1] === 'edit' &&
      call[2] === String(finishedStepNumber) &&
      call.includes('--body-file'),
  ).length;
  const finishedNonterminalStep = run(
    'step',
    String(finishedStepNumber),
    'implement_contract',
    'in-flight',
  );
  assert.equal(finishedNonterminalStep.status, 1, 'a finished plan must reject a non-terminal step target');
  assert.equal(finishedNonterminalStep.stderr.trim(), 'plan status is finished; expected ongoing');
  assert.equal(
    issue(finishedStepNumber).body,
    finishedStepBodyBeforeRefusal,
    'refusing a non-terminal repair must leave the closed issue body unchanged',
  );
  assert.equal(
    loadState().calls.filter(
      (call) =>
        call[0] === 'issue' &&
        call[1] === 'edit' &&
        call[2] === String(finishedStepNumber) &&
        call.includes('--body-file'),
    ).length,
    finishedStepBodyWritesBeforeRefusal,
    'a non-terminal target on a finished plan must fail before the body write',
  );
  const malformedStepNumber = createPlan('malformed-step');
  makeValid(malformedStepNumber);
  setIssueStatus(malformedStepNumber, 'ongoing');
  updateIssue(malformedStepNumber, (entry) => {
    entry.body = entry.body.replace('| A1 | `node --version` | Exit 0 |\n', '');
  });
  const malformedStepBefore = issue(malformedStepNumber);
  const malformedStepEditsBefore = loadState().calls.filter(
    (call) => call[0] === 'issue' && call[1] === 'edit' && call[2] === String(malformedStepNumber),
  ).length;
  const malformedStep = run('step', String(malformedStepNumber), 'implement_contract', 'done');
  assert.equal(malformedStep.status, 1);
  assert.match(malformedStep.stderr, new RegExp(`#${malformedStepNumber}: check 9:`));
  assert.deepEqual(issue(malformedStepNumber), malformedStepBefore);
  assert.equal(
    loadState().calls.filter(
      (call) => call[0] === 'issue' && call[1] === 'edit' && call[2] === String(malformedStepNumber),
    ).length,
    malformedStepEditsBefore,
  );

  const dependencyNumber = createPlan('dependency');
  makeValid(dependencyNumber, {
    steps: [
      '| 1 | prepare | Prepare the dependency | src/example.mjs | - | `local` | `planned` | command exits 0 |',
      '| 2 | consume | Consume the dependency | src/example.mjs | 1 | `local` | `planned` | command exits 0 |',
    ],
  });
  setIssueStatus(dependencyNumber, 'ongoing');
  const dependencyBlocked = run('step', String(dependencyNumber), 'consume', 'in-flight');
  assert.equal(dependencyBlocked.status, 1);
  assert.match(dependencyBlocked.stderr, /unfinished dependency/);

  const unfinishedArchiveNumber = createPlan('unfinished-archive');
  makeValid(unfinishedArchiveNumber);
  setIssueStatus(unfinishedArchiveNumber, 'ongoing');
  updateIssue(unfinishedArchiveNumber, (entry) => {
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
  });
  const unfinishedArchive = run('archive', String(unfinishedArchiveNumber));
  assert.equal(unfinishedArchive.status, 1, 'changing a non-terminal Steps row to done must be required');
  assert.match(unfinishedArchive.stderr, /non-terminal step/);

  updateIssue(unfinishedArchiveNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done').replace(
      '_Review records are stored in issue comments._',
      'Code-review: pass with caveat',
    );
  });
  const inexactReviewArchive = run('archive', String(unfinishedArchiveNumber));
  assert.equal(inexactReviewArchive.status, 1, 'changing the exact Code-review pass line must be refused');
  assert.match(inexactReviewArchive.stderr, /Code-review: pass/);

  const advisoryPassNumber = createPlan('advisory-pass-archive');
  makeValid(advisoryPassNumber);
  setIssueStatus(advisoryPassNumber, 'ongoing');
  updateIssue(advisoryPassNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done').replace(
      '_Review records are stored in issue comments._',
      'Code-review: pass\n- MEDIUM · Maintainability · src/example.mjs:9 - duplicated guard clause - extract a named predicate',
    );
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
    entry.closedByPullRequestsReferences = [
      {
        number: 43,
        url: 'https://github.com/DocksDocks/fixture/pull/43',
        repository: 'DocksDocks/fixture',
        userLinked: false,
      },
    ];
  });
  updateState((state) => {
    state.prs.push({
      number: 43,
      repository: 'DocksDocks/fixture',
      mergedAt: '2026-08-20T21:30:00Z',
      state: 'MERGED',
      baseRefName: 'main',
      url: 'https://github.com/DocksDocks/fixture/pull/43',
    });
  });
  const advisoryPassArchive = run('archive', String(advisoryPassNumber));
  expectSuccess(advisoryPassArchive, 'archive accepts a pass carrying only an advisory line');

  const trustedPassNumber = createPlan('trusted-comment-pass-archive');
  makeValid(trustedPassNumber);
  setIssueStatus(trustedPassNumber, 'ongoing');
  updateIssue(trustedPassNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done');
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
    entry.closedByPullRequestsReferences = [
      {
        number: 43,
        url: 'https://github.com/DocksDocks/fixture/pull/43',
        repository: 'DocksDocks/fixture',
        userLinked: false,
      },
    ];
  });
  addIssueComment(trustedPassNumber, '### Code review round 1 - 2026-08-24\nCode-review: pass');
  const trustedPassArchive = run('archive', String(trustedPassNumber));
  expectSuccess(trustedPassArchive, 'archive accepts latest trusted code-review pass comment');

  const supersededPassNumber = createPlan('superseded-comment-pass-archive');
  makeValid(supersededPassNumber);
  setIssueStatus(supersededPassNumber, 'ongoing');
  updateIssue(supersededPassNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done').replace(
      '_Review records are stored in issue comments._',
      'Code-review: pass',
    );
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
  });
  addIssueComment(supersededPassNumber, '### Code review round 1 - 2026-08-23\nCode-review: pass');
  addIssueComment(
    supersededPassNumber,
    '### Code review round 2 - 2026-08-24\nCode-review: fixes-required\n- HIGH · Bug · src/example.mjs:9 - the earlier pass is stale - repair the defect',
  );
  const supersededPassArchive = run('archive', String(supersededPassNumber));
  assert.equal(supersededPassArchive.status, 1, 'a later trusted fixes-required record must supersede a pass');
  assert.match(supersededPassArchive.stderr, /archive requires Code-review: pass/);

  for (const [name, commentBody, author] of [
    ['foreign-comment-pass', '### Code review round 1 - 2026-08-24\nCode-review: pass', 'other-agent'],
    ['malformed-comment-pass', 'Code-review: pass', 'plan-agent'],
  ]) {
    const number = createPlan(`${name}-archive`);
    makeValid(number);
    setIssueStatus(number, 'ongoing');
    updateIssue(number, (entry) => {
      entry.body = replaceStepStatus(entry.body, 'done');
      entry.state = 'CLOSED';
      entry.stateReason = 'COMPLETED';
    });
    addIssueComment(number, commentBody, author);
    const refused = run('archive', String(number));
    assert.equal(refused.status, 1, `${name} must not authorize archive`);
    assert.match(refused.stderr, /archive requires Code-review: pass/);
  }
  const legacyDashRecordNumber = createPlan('legacy-dash-record-archive');
  makeValid(legacyDashRecordNumber);
  setIssueStatus(legacyDashRecordNumber, 'ongoing');
  updateIssue(legacyDashRecordNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done');
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
  });
  addIssueComment(
    legacyDashRecordNumber,
    `### Plan review - 2026-08-24\nPlan-review: repair\n- [goal_fit] ## Goal ${FORBIDDEN_DASH} temporary fix ${FORBIDDEN_DASH} require the durable fix`,
  );
  addIssueComment(legacyDashRecordNumber, `### Code review round 1 ${FORBIDDEN_DASH} 2026-08-24\nCode-review: pass`);
  const legacyDashRecordShow = run('show', String(legacyDashRecordNumber));
  expectSuccess(legacyDashRecordShow, 'show finished plan with legacy dash records');
  assert.match(legacyDashRecordShow.stdout, / · finished · /);
  assert.match(legacyDashRecordShow.stdout, /reviews: plan=none code=none\n$/);
  const legacyDashRecordArchive = run('archive', String(legacyDashRecordNumber));
  assert.equal(legacyDashRecordArchive.status, 1, 'legacy dash code-review pass must not authorize archive');
  assert.match(legacyDashRecordArchive.stderr, /archive requires Code-review: pass/);

  const mediumOnlyRequiredNumber = createPlan('medium-only-fixes-required');
  makeValid(mediumOnlyRequiredNumber);
  setIssueStatus(mediumOnlyRequiredNumber, 'ongoing');
  updateIssue(mediumOnlyRequiredNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done').replace(
      '_Review records are stored in issue comments._',
      'Code-review: fixes-required\n- MEDIUM · Maintainability · src/example.mjs:9 - duplicated guard clause - extract a named predicate',
    );
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
  });
  const mediumOnlyRequiredArchive = run('archive', String(mediumOnlyRequiredNumber));
  assert.equal(mediumOnlyRequiredArchive.status, 1, 'a fixes-required verdict must refuse archive');
  assert.match(mediumOnlyRequiredArchive.stderr, /Code-review: pass/);

  const wrongBranchNumber = createPlan('wrong-branch-archive');
  makeValid(wrongBranchNumber);
  setIssueStatus(wrongBranchNumber, 'ongoing');
  updateIssue(wrongBranchNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done').replace(
      '_Review records are stored in issue comments._',
      'Code-review: pass',
    );
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
    entry.closedByPullRequestsReferences = [
      {
        number: 42,
        url: 'https://github.com/DocksDocks/fixture/pull/42',
        repository: 'DocksDocks/fixture',
      },
    ];
  });
  updateState((state) => {
    state.prs.push({
      number: 42,
      repository: 'DocksDocks/fixture',
      mergedAt: '2026-08-20T20:30:00Z',
      state: 'MERGED',
      baseRefName: 'release/1.x',
      url: 'https://github.com/DocksDocks/fixture/pull/42',
    });
  });
  const beforeWrongBranchArchive = issue(wrongBranchNumber);
  const wrongBranchArchive = run('archive', String(wrongBranchNumber));
  assert.equal(wrongBranchArchive.status, 1, 'changing baseRefName from main must be refused');
  assert.match(wrongBranchArchive.stderr, /merged into main|found release\/1\.x/);
  assert.deepEqual(issue(wrongBranchNumber), beforeWrongBranchArchive);

  const unsupportedMergedField = spawnSync(
    'gh',
    ['pr', 'view', '42', '--json', 'merged', '--repo', 'DocksDocks/fixture'],
    { cwd: scratch, encoding: 'utf8', env: childEnv },
  );
  assert.equal(unsupportedMergedField.status, 1);
  assert.equal(unsupportedMergedField.stderr.trim(), 'Unknown JSON field: "merged"');
  const unsupportedGraphqlArgument = spawnSync(
    'gh',
    [
      'api',
      'graphql',
      '-f',
      'query=query{repository(owner:"x",name:"y"){issue(number:1){closing:closedByPullRequestsReferences(first:1,invented:true){nodes{number}}}}}',
    ],
    { cwd: scratch, encoding: 'utf8', env: childEnv },
  );
  assert.equal(unsupportedGraphqlArgument.status, 1);
  assert.equal(unsupportedGraphqlArgument.stderr.trim(), 'Unknown GraphQL argument: "invented"');

  const manualLinkArchiveNumber = createPlan('manual-link-archive');
  makeValid(manualLinkArchiveNumber);
  setIssueStatus(manualLinkArchiveNumber, 'ongoing');
  updateIssue(manualLinkArchiveNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done').replace(
      '_Review records are stored in issue comments._',
      'Code-review: pass',
    );
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
    entry.closedByPullRequestsReferences = [
      {
        number: 41,
        url: 'https://github.com/DocksDocks/fixture/pull/41',
        repository: 'DocksDocks/fixture',
        userLinked: true,
      },
      {
        number: 40,
        url: 'https://github.com/DocksDocks/fixture/pull/40',
        repository: 'DocksDocks/fixture',
        userLinked: false,
      },
    ];
  });
  updateState((state) => {
    state.prs.push(
      {
        number: 41,
        repository: 'DocksDocks/fixture',
        mergedAt: '2026-08-20T21:00:00Z',
        state: 'MERGED',
        baseRefName: 'main',
        url: 'https://github.com/DocksDocks/fixture/pull/41',
      },
      {
        number: 40,
        repository: 'DocksDocks/fixture',
        mergedAt: null,
        state: 'OPEN',
        baseRefName: 'main',
        url: 'https://github.com/DocksDocks/fixture/pull/40',
      },
    );
  });
  const beforeManualLinkArchive = issue(manualLinkArchiveNumber);
  const manualLinkArchive = run('archive', String(manualLinkArchiveNumber));
  assert.equal(manualLinkArchive.status, 1, 'accepting a manually linked merged pull request must fail');
  assert.equal(
    manualLinkArchive.stderr.trim(),
    'archive requires a closing pull request merged into DocksDocks/fixture:main',
  );
  assert.deepEqual(issue(manualLinkArchiveNumber), beforeManualLinkArchive);

  const keywordArchiveNumber = createPlan('keyword-archive');
  makeValid(keywordArchiveNumber);
  setIssueStatus(keywordArchiveNumber, 'ongoing');
  updateIssue(keywordArchiveNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done').replace(
      '_Review records are stored in issue comments._',
      'Code-review: pass',
    );
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
    entry.closedByPullRequestsReferences = [
      {
        number: 41,
        url: 'https://github.com/DocksDocks/fixture/pull/41',
        repository: 'DocksDocks/fixture',
        userLinked: false,
      },
    ];
  });
  const keywordBodyBefore = issue(keywordArchiveNumber).body;
  const keywordCallsBefore = loadState().calls.length;
  const keywordArchived = run('archive', String(keywordArchiveNumber));
  expectSuccess(keywordArchived, 'archive through keyword reference');
  assert.equal(
    keywordArchived.stdout.trim(),
    `plan #${keywordArchiveNumber} finished (closed by https://github.com/DocksDocks/fixture/pull/41)`,
  );
  assert.equal(issue(keywordArchiveNumber).body, keywordBodyBefore, 'archive must not rewrite the plan body');
  assert.deepEqual(issue(keywordArchiveNumber).labels, ['plan'], 'archive must strip the leftover phase label');
  const keywordArchiveCalls = loadState().calls.slice(keywordCallsBefore);
  assert.ok(keywordArchiveCalls.some((call) => call[0] === 'api' && call[1] === 'graphql'));
  assert.ok(
    keywordArchiveCalls.some((call) => call.join(' ').includes('excludeUserLinked:true')),
    'removing excludeUserLinked:true from the closing-reference query must fail',
  );
  assert.equal(
    keywordArchiveCalls.some((call) => call[0] === 'issue' && call[1] === 'close'),
    false,
    'archive is a verifier and must not close an already landed issue',
  );

  const paginatedArchiveNumber = createPlan('paginated-keyword-archive');
  makeValid(paginatedArchiveNumber);
  setIssueStatus(paginatedArchiveNumber, 'ongoing');
  updateIssue(paginatedArchiveNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done').replace(
      '_Review records are stored in issue comments._',
      'Code-review: pass',
    );
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
    entry.closedByPullRequestsReferences = Array.from({ length: 101 }, (_, index) => ({
      number: 1_000 + index,
      url: `https://github.com/DocksDocks/fixture/pull/${1_000 + index}`,
      repository: 'DocksDocks/fixture',
      userLinked: false,
      state: index === 100 ? 'MERGED' : 'OPEN',
      mergedAt: index === 100 ? '2026-08-20T22:00:00Z' : null,
      baseRefName: 'main',
    }));
  });
  const paginatedCallsBefore = loadState().calls.length;
  const paginatedArchive = run('archive', String(paginatedArchiveNumber));
  expectSuccess(paginatedArchive, 'archive through a later closing-reference page');
  assert.equal(
    paginatedArchive.stdout.trim(),
    `plan #${paginatedArchiveNumber} finished (closed by https://github.com/DocksDocks/fixture/pull/1100)`,
  );
  const paginatedGraphqlCalls = loadState()
    .calls.slice(paginatedCallsBefore)
    .filter((call) => call[0] === 'api' && call[1] === 'graphql');
  assert.equal(paginatedGraphqlCalls.length, 2, 'stopping after the first closing-reference page must fail');
  assert.ok(
    paginatedGraphqlCalls[1].includes('after=closing:100'),
    'the second closing-reference query must carry the first page endCursor',
  );

  const closedReferenceNumber = createPlan('closed-reference-archive');
  makeValid(closedReferenceNumber);
  setIssueStatus(closedReferenceNumber, 'ongoing');
  updateIssue(closedReferenceNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done').replace(
      '_Review records are stored in issue comments._',
      'Code-review: pass',
    );
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
    entry.closedByPullRequestsReferences = [
      {
        number: 46,
        url: 'https://github.com/DocksDocks/fixture/pull/46',
        repository: 'DocksDocks/fixture',
        userLinked: false,
      },
    ];
  });
  updateState((state) => {
    state.prs.push({
      number: 46,
      repository: 'DocksDocks/fixture',
      mergedAt: null,
      state: 'CLOSED',
      baseRefName: 'main',
      url: 'https://github.com/DocksDocks/fixture/pull/46',
    });
  });
  const beforeClosedReferenceArchive = issue(closedReferenceNumber);
  const closedReferenceArchive = run('archive', String(closedReferenceNumber));
  assert.equal(closedReferenceArchive.status, 1, 'accepting a closed-unmerged reference must fail');
  assert.equal(
    closedReferenceArchive.stderr.trim(),
    'archive requires a merged closing pull request; issue has no closing commit',
  );
  assert.deepEqual(issue(closedReferenceNumber), beforeClosedReferenceArchive);

  const commitArchiveNumber = createPlan('commit-archive');
  makeValid(commitArchiveNumber);
  setIssueStatus(commitArchiveNumber, 'ongoing');
  updateIssue(commitArchiveNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done').replace(
      '_Review records are stored in issue comments._',
      'Code-review: pass',
    );
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
    entry.closedByPullRequestsReferences = [];
    entry.timelineItems = [{ closer: { __typename: 'Commit', oid: 'commit-lands-through-pr' } }];
  });
  updateState((state) => {
    state.commits = [
      {
        oid: 'commit-lands-through-pr',
        repository: 'DocksDocks/fixture',
        associatedPullRequests: [
          {
            number: 44,
            repository: 'DocksDocks/fixture',
          },
        ],
      },
    ];
    state.prs.push({
      number: 44,
      repository: 'DocksDocks/fixture',
      mergedAt: '2026-08-20T21:15:00Z',
      state: 'MERGED',
      baseRefName: 'main',
      url: 'https://github.com/DocksDocks/fixture/pull/44',
    });
  });
  const commitCallsBefore = loadState().calls.length;
  const commitArchived = run('archive', String(commitArchiveNumber));
  expectSuccess(commitArchived, 'archive through closing commit association');
  assert.equal(
    commitArchived.stdout.trim(),
    `plan #${commitArchiveNumber} finished (closed by https://github.com/DocksDocks/fixture/pull/44)`,
  );
  assert.deepEqual(issue(commitArchiveNumber).labels, ['plan']);
  const commitGraphqlCalls = loadState()
    .calls.slice(commitCallsBefore)
    .filter((call) => call[0] === 'api' && call[1] === 'graphql');
  assert.equal(commitGraphqlCalls.length, 2, 'removing the commit association fallback must fail');
  assert.ok(
    commitGraphqlCalls.some((call) => call.join(' ').includes('associatedPullRequests')),
    'removing associatedPullRequests from the fallback query must fail',
  );

  const ineligibleReferenceCommitNumber = createPlan('ineligible-reference-commit-archive');
  makeValid(ineligibleReferenceCommitNumber);
  setIssueStatus(ineligibleReferenceCommitNumber, 'ongoing');
  updateIssue(ineligibleReferenceCommitNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done').replace(
      '_Review records are stored in issue comments._',
      'Code-review: pass',
    );
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
    entry.closedByPullRequestsReferences = [
      {
        number: 49,
        url: 'https://github.com/DocksDocks/fixture/pull/49',
        repository: 'DocksDocks/fixture',
        userLinked: false,
        state: 'OPEN',
        mergedAt: null,
        baseRefName: 'main',
      },
    ];
    entry.timelineItems = [{ closer: { __typename: 'Commit', oid: 'commit-behind-open-reference' } }];
  });
  updateState((state) => {
    state.commits.push({
      oid: 'commit-behind-open-reference',
      repository: 'DocksDocks/fixture',
      associatedPullRequests: [{ number: 48, repository: 'DocksDocks/fixture' }],
    });
    state.prs.push({
      number: 48,
      repository: 'DocksDocks/fixture',
      mergedAt: '2026-08-20T22:15:00Z',
      state: 'MERGED',
      baseRefName: 'main',
      url: 'https://github.com/DocksDocks/fixture/pull/48',
    });
  });
  const ineligibleReferenceCallsBefore = loadState().calls.length;
  const ineligibleReferenceArchive = run('archive', String(ineligibleReferenceCommitNumber));
  expectSuccess(ineligibleReferenceArchive, 'archive through commit proof behind an ineligible reference');
  assert.equal(
    ineligibleReferenceArchive.stdout.trim(),
    `plan #${ineligibleReferenceCommitNumber} finished (closed by https://github.com/DocksDocks/fixture/pull/48)`,
  );
  const ineligibleReferenceCalls = loadState().calls.slice(ineligibleReferenceCallsBefore);
  assert.ok(
    ineligibleReferenceCalls.some(
      (call) => call[0] === 'api' && call[1] === 'graphql' && call.join(' ').includes('associatedPullRequests'),
    ),
    'a non-empty but ineligible closing-reference connection must still query the closing commit association',
  );

  const pullRequestLatestCloserNumber = createPlan('pull-request-latest-closer-archive');
  makeValid(pullRequestLatestCloserNumber);
  setIssueStatus(pullRequestLatestCloserNumber, 'ongoing');
  updateIssue(pullRequestLatestCloserNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done').replace(
      '_Review records are stored in issue comments._',
      'Code-review: pass',
    );
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
    entry.closedByPullRequestsReferences = [];
    entry.timelineItems = [
      { closer: { __typename: 'Commit', oid: 'superseded-by-pull-request-closer' } },
      { closer: { __typename: 'PullRequest', number: 51 } },
    ];
  });
  updateState((state) => {
    state.commits.push({
      oid: 'superseded-by-pull-request-closer',
      repository: 'DocksDocks/fixture',
      associatedPullRequests: [{ number: 50, repository: 'DocksDocks/fixture' }],
    });
    state.prs.push({
      number: 50,
      repository: 'DocksDocks/fixture',
      mergedAt: '2026-08-20T22:30:00Z',
      state: 'MERGED',
      baseRefName: 'main',
      url: 'https://github.com/DocksDocks/fixture/pull/50',
    });
  });
  const beforePullRequestLatestCloserArchive = issue(pullRequestLatestCloserNumber);
  const pullRequestLatestCloserArchive = run('archive', String(pullRequestLatestCloserNumber));
  assert.equal(
    pullRequestLatestCloserArchive.status,
    1,
    'an unmerged PullRequest latest closer must not reuse an earlier commit',
  );
  assert.equal(
    pullRequestLatestCloserArchive.stderr.trim(),
    'archive requires a closing pull request merged into DocksDocks/fixture:main',
  );
  assert.deepEqual(issue(pullRequestLatestCloserNumber), beforePullRequestLatestCloserArchive);

  const mergedCloserNumber = createPlan('merged-pull-request-closer-archive');
  makeValid(mergedCloserNumber);
  setIssueStatus(mergedCloserNumber, 'ongoing');
  updateIssue(mergedCloserNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done').replace(
      '_Review records are stored in issue comments._',
      'Code-review: pass',
    );
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
    entry.closedByPullRequestsReferences = [];
    entry.timelineItems = [
      {
        closer: {
          __typename: 'PullRequest',
          number: 52,
          url: 'https://github.com/DocksDocks/fixture/pull/52',
          state: 'MERGED',
          mergedAt: '2026-08-21T10:00:00Z',
          baseRefName: 'main',
          repository: { nameWithOwner: 'DocksDocks/fixture' },
        },
      },
    ];
  });
  const mergedCloserArchive = run('archive', String(mergedCloserNumber));
  assert.equal(
    mergedCloserArchive.status,
    0,
    'a merged default-branch PullRequest closer must satisfy archive when the excluded connection is empty',
  );
  assert.match(
    mergedCloserArchive.stdout,
    /finished \(closed by https:\/\/github\.com\/DocksDocks\/fixture\/pull\/52\)/,
  );

  const wrongBranchCloserNumber = createPlan('wrong-branch-pull-request-closer-archive');
  makeValid(wrongBranchCloserNumber);
  setIssueStatus(wrongBranchCloserNumber, 'ongoing');
  updateIssue(wrongBranchCloserNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done').replace(
      '_Review records are stored in issue comments._',
      'Code-review: pass',
    );
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
    entry.closedByPullRequestsReferences = [];
    entry.timelineItems = [
      {
        closer: {
          __typename: 'PullRequest',
          number: 53,
          url: 'https://github.com/DocksDocks/fixture/pull/53',
          state: 'MERGED',
          mergedAt: '2026-08-21T11:00:00Z',
          baseRefName: 'release',
          repository: { nameWithOwner: 'DocksDocks/fixture' },
        },
      },
    ];
  });
  const beforeWrongBranchCloserArchive = issue(wrongBranchCloserNumber);
  const wrongBranchCloserArchive = run('archive', String(wrongBranchCloserNumber));
  assert.equal(wrongBranchCloserArchive.status, 1, 'a PullRequest closer merged elsewhere must be refused');
  assert.equal(
    wrongBranchCloserArchive.stderr.trim(),
    'archive requires a pull request merged into main, found release',
  );
  assert.deepEqual(issue(wrongBranchCloserNumber), beforeWrongBranchCloserArchive);

  const directPushNumber = createPlan('direct-push-archive');
  makeValid(directPushNumber);
  setIssueStatus(directPushNumber, 'ongoing');
  updateIssue(directPushNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done').replace(
      '_Review records are stored in issue comments._',
      'Code-review: pass',
    );
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
    entry.closedByPullRequestsReferences = [];
    entry.timelineItems = [{ closer: { __typename: 'Commit', oid: 'direct-push-commit' } }];
  });
  updateState((state) => {
    state.commits.push({
      oid: 'direct-push-commit',
      repository: 'DocksDocks/fixture',
      associatedPullRequests: [],
    });
  });
  const beforeDirectPushArchive = issue(directPushNumber);
  const directPushArchive = run('archive', String(directPushNumber));
  assert.equal(directPushArchive.status, 1, 'adding no merged associated pull request must remain insufficient');
  assert.match(directPushArchive.stderr, /has no associated merged pull request into main/);
  assert.deepEqual(issue(directPushNumber), beforeDirectPushArchive);

  const commitWrongBranchNumber = createPlan('commit-wrong-branch-archive');
  makeValid(commitWrongBranchNumber);
  setIssueStatus(commitWrongBranchNumber, 'ongoing');
  updateIssue(commitWrongBranchNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done').replace(
      '_Review records are stored in issue comments._',
      'Code-review: pass',
    );
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
    entry.closedByPullRequestsReferences = [];
    entry.timelineItems = [{ closer: { __typename: 'Commit', oid: 'wrong-branch-commit' } }];
  });
  updateState((state) => {
    state.commits.push({
      oid: 'wrong-branch-commit',
      repository: 'DocksDocks/fixture',
      associatedPullRequests: [{ number: 45, repository: 'DocksDocks/fixture' }],
    });
    state.prs.push({
      number: 45,
      repository: 'DocksDocks/fixture',
      mergedAt: '2026-08-20T21:30:00Z',
      state: 'MERGED',
      baseRefName: 'release/2.x',
      url: 'https://github.com/DocksDocks/fixture/pull/45',
    });
  });
  const commitWrongBranchArchive = run('archive', String(commitWrongBranchNumber));
  assert.equal(commitWrongBranchArchive.status, 1, 'changing an associated pull request base from main must fail');
  assert.match(commitWrongBranchArchive.stderr, /merged into main|release\/2\.x/);

  const staleCommitNumber = createPlan('stale-commit-archive');
  makeValid(staleCommitNumber);
  setIssueStatus(staleCommitNumber, 'ongoing');
  updateIssue(staleCommitNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done').replace(
      '_Review records are stored in issue comments._',
      'Code-review: pass',
    );
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
    entry.closedByPullRequestsReferences = [];
    entry.timelineItems = [{ closer: { __typename: 'Commit', oid: 'superseded-closing-commit' } }, { closer: null }];
  });
  updateState((state) => {
    state.commits.push({
      oid: 'superseded-closing-commit',
      repository: 'DocksDocks/fixture',
      associatedPullRequests: [{ number: 47, repository: 'DocksDocks/fixture' }],
    });
    state.prs.push({
      number: 47,
      repository: 'DocksDocks/fixture',
      mergedAt: '2026-08-20T21:45:00Z',
      state: 'MERGED',
      baseRefName: 'main',
      url: 'https://github.com/DocksDocks/fixture/pull/47',
    });
  });
  const beforeStaleCommitArchive = issue(staleCommitNumber);
  const staleCommitArchive = run('archive', String(staleCommitNumber));
  assert.equal(staleCommitArchive.status, 1, 'reusing an earlier superseded commit closure must fail');
  assert.equal(
    staleCommitArchive.stderr.trim(),
    'archive requires a merged closing pull request; issue has no closing commit',
  );
  assert.deepEqual(issue(staleCommitNumber), beforeStaleCommitArchive);

  const retireRecoveryNumber = createPlan('retire-cleanup-recovery');
  makeValid(retireRecoveryNumber);
  setIssueStatus(retireRecoveryNumber, 'planned');
  updateState((state) => {
    state.labelRemovalErrorOnce = 'stubbed label cleanup failure';
  });
  const failedRetireCleanup = run('retire', String(retireRecoveryNumber), '--reason', 'The request was withdrawn');
  assert.equal(failedRetireCleanup.status, 1, 'retire must expose a failed label cleanup');
  assert.equal(failedRetireCleanup.stderr.trim(), 'gh issue edit failed: stubbed label cleanup failure');
  assert.equal(issue(retireRecoveryNumber).state, 'CLOSED');
  assert.equal(issue(retireRecoveryNumber).stateReason, 'NOT_PLANNED');
  assert.deepEqual(
    issue(retireRecoveryNumber).labels,
    ['plan', 'plan:planned'],
    'failed retire cleanup must preserve the recoverable phase label',
  );
  const recoveredRetire = run('retire', String(retireRecoveryNumber), '--reason', 'Retry the label cleanup');
  expectSuccess(recoveredRetire, 'retire label cleanup recovery');
  assert.equal(recoveredRetire.stdout.trim(), `plan #${retireRecoveryNumber} retired (recovered label cleanup)`);
  assert.deepEqual(issue(retireRecoveryNumber).labels, ['plan']);
  assert.equal(
    loadState().calls.filter(
      (call) => call[0] === 'issue' && call[1] === 'close' && call[2] === String(retireRecoveryNumber),
    ).length,
    1,
    'retire recovery must not close the issue again',
  );
  const completedRecoveryRetry = run('retire', String(retireRecoveryNumber), '--reason', 'A second retry');
  assert.equal(completedRecoveryRetry.status, 1, 'a fully retired plan must remain refused');
  assert.equal(completedRecoveryRetry.stderr.trim(), 'cannot retire a retired plan');

  const retiredNumber = createPlan('retired');
  makeValid(retiredNumber);
  setIssueStatus(retiredNumber, 'planned');
  const retiredBodyBefore = issue(retiredNumber).body;
  const retired = run('retire', String(retiredNumber), '--reason', 'The request was withdrawn');
  expectSuccess(retired, 'retire');
  assert.equal(retired.stdout.trim(), `plan #${retiredNumber} retired`);
  assert.equal(issue(retiredNumber).body, retiredBodyBefore, 'retire must not add a ninth body section');
  assert.equal(issue(retiredNumber).stateReason, 'NOT_PLANNED');
  assert.deepEqual(issue(retiredNumber).labels, ['plan'], 'retire must strip the leftover phase label');
  const retireCall = loadState().calls.findLast(
    (call) => call[0] === 'issue' && call[1] === 'close' && call[2] === String(retiredNumber),
  );
  assert.deepEqual(retireCall.slice(retireCall.indexOf('--comment'), retireCall.indexOf('--comment') + 2), [
    '--comment',
    'The request was withdrawn',
  ]);
  const retireAgain = run('retire', String(retiredNumber), '--reason', 'A second reason');
  assert.equal(retireAgain.status, 1);

  const concurrentNumber = createPlan('concurrent');
  makeValid(concurrentNumber);
  const concurrentBody = issue(concurrentNumber).body;
  updateState((state) => {
    state.remoteChange = { issue: concurrentNumber, viewsBeforeChange: 1, body: `${concurrentBody}\nremote change\n` };
  });
  const concurrent = run('status', String(concurrentNumber), 'planned');
  assert.equal(concurrent.status, 1);
  assert.equal(concurrent.stderr.trim(), 'plan issue changed remotely; re-read and retry');
  assert.match(issue(concurrentNumber).body, /remote change\n$/);
  assert.deepEqual(issue(concurrentNumber).labels, ['plan', 'plan:drafting']);

  const openPlanned = createPlan('open-planned');
  makeValid(openPlanned);
  setIssueStatus(openPlanned, 'planned');
  const unlabelledNumber = createPlan('open-unlabelled');
  const openDrafting = createPlan('open-drafting');
  makeValid(openDrafting);
  const openOngoing = createPlan('open-ongoing');
  makeValid(openOngoing);
  setIssueStatus(openOngoing, 'ongoing');
  const openBlocked = createPlan('open-blocked');
  makeValid(openBlocked);
  setIssueStatus(openBlocked, 'blocked');
  makeValid(unlabelledNumber);
  updateIssue(unlabelledNumber, (entry) => {
    entry.labels = ['plan'];
  });
  const completedNumber = createPlan('closed-completed');
  makeValid(completedNumber);
  setIssueStatus(completedNumber, 'planned');
  updateIssue(completedNumber, (entry) => {
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
  });
  const notPlannedNumber = createPlan('closed-not-planned');
  makeValid(notPlannedNumber);
  setIssueStatus(notPlannedNumber, 'ongoing');
  updateIssue(notPlannedNumber, (entry) => {
    entry.state = 'CLOSED';
    entry.stateReason = 'NOT_PLANNED';
  });
  const duplicateNumber = createPlan('closed-duplicate');
  makeValid(duplicateNumber);
  setIssueStatus(duplicateNumber, 'blocked');
  updateIssue(duplicateNumber, (entry) => {
    entry.state = 'CLOSED';
    entry.stateReason = 'DUPLICATE';
  });
  const unreadableNumber = createPlan('unreadable');
  makeValid(unreadableNumber);
  updateIssue(unreadableNumber, (entry) => entry.labels.push('plan:blocked'));
  const listed = run('list');
  expectSuccess(listed, 'list');
  const listedNumbers = listed.stdout
    .trimEnd()
    .split('\n')
    .map((line) => Number(/#(\d+)/.exec(line)[1]));
  const listedState = loadState();
  let sawClosed = false;
  let previousOpen = 0;
  let previousClosed = 0;
  for (const number of listedNumbers) {
    const entry = listedState.issues.find((candidate) => candidate.number === number);
    if (entry.state === 'CLOSED') {
      sawClosed = true;
      assert.ok(number > previousClosed);
      previousClosed = number;
    } else {
      assert.equal(sawClosed, false, 'open issues must list before closed issues');
      assert.ok(number > previousOpen);
      previousOpen = number;
    }
  }
  assert.match(listed.stdout, new RegExp(`^planned\\t#${openPlanned}\\tExercise open-planned$`, 'm'));
  assert.match(listed.stdout, new RegExp(`^unlabelled\\t#${unlabelledNumber}\\tExercise open-unlabelled$`, 'm'));
  assert.match(listed.stdout, new RegExp(`^drafting\\t#${openDrafting}\\tExercise open-drafting$`, 'm'));
  assert.match(listed.stdout, new RegExp(`^ongoing\\t#${openOngoing}\\tExercise open-ongoing$`, 'm'));
  assert.match(listed.stdout, new RegExp(`^blocked\\t#${openBlocked}\\tExercise open-blocked$`, 'm'));
  assert.match(listed.stdout, new RegExp(`^finished\\t#${completedNumber}\\tExercise closed-completed$`, 'm'));
  assert.match(listed.stdout, new RegExp(`^retired\\t#${notPlannedNumber}\\tExercise closed-not-planned$`, 'm'));
  assert.match(listed.stdout, new RegExp(`^duplicate\\t#${duplicateNumber}\\tExercise closed-duplicate$`, 'm'));
  const plannedOnly = run('list', '--status', 'planned');
  expectSuccess(plannedOnly, 'list planned');
  assert.match(plannedOnly.stdout, new RegExp(`^planned\\t#${openPlanned}\\tExercise open-planned$`, 'm'));
  assert.doesNotMatch(plannedOnly.stdout, new RegExp(`#${completedNumber}\\b`));
  const unreadableOnly = run('list', '--status', 'unreadable');
  expectSuccess(unreadableOnly, 'list unreadable');
  assert.match(unreadableOnly.stdout, new RegExp(`^unreadable\\t#${unreadableNumber}\\tExercise unreadable$`, 'm'));
  const listCall = loadState().calls.findLast((call) => call[0] === 'issue' && call[1] === 'list');
  assert.deepEqual(listCall.slice(2, 8), ['--label', 'plan', '--state', 'all', '--limit', '500']);
  assert.equal(listCall.includes('--search'), false);

  const dependencyOne = createPlan('queue-dependency-one');
  makeValid(dependencyOne);
  updateIssue(dependencyOne, (entry) => {
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
  });
  const dependencyTwo = createPlan('queue-dependency-two');
  makeValid(dependencyTwo);
  updateIssue(dependencyTwo, (entry) => {
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
  });
  const queuedNumber = createPlan('queued');
  makeValid(queuedNumber);
  setIssueStatus(queuedNumber, 'planned');
  const queueFile = path.join(scratch, 'docs/PLAN-QUEUE.md');
  fs.writeFileSync(
    queueFile,
    `| Stage | Plan | Depends on | Why |\n|---:|---|---|---|\n| 1 | ${dependencyOne} | - | First dependency. |\n| 2 | #${dependencyTwo} | ${dependencyOne} | Second dependency. |\n| 3 | ${queuedNumber} | #${dependencyTwo} | Ready after transitive closure. |\n`,
  );
  const startable = run('next');
  expectSuccess(startable, 'next valid queue');
  assert.equal(startable.stdout.trim(), `#${queuedNumber}`);
  assert.equal(startable.stderr, '');
  updateIssue(dependencyOne, (entry) => {
    entry.state = 'OPEN';
    entry.labels = ['plan', 'plan:ongoing'];
  });
  assert.equal(run('next').stdout.trim(), '', 'unfinished transitive dependency must block the plan');
  updateIssue(dependencyOne, (entry) => {
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
    entry.labels = ['plan', 'plan:ongoing'];
  });

  fs.writeFileSync(
    queueFile,
    `| Stage | Plan | Depends on | Why |\n|---:|---|---|---|\n| 1 | ${queuedNumber} | - | Numeric plan. |\n| 2 | legacy-plan-slug | - | Frozen history. |\n| 3 | ${openPlanned} | legacy-plan-slug | Depends on frozen history. |\n`,
  );
  const mixedQueue = run('next');
  expectSuccess(mixedQueue, 'next mixed numeric and legacy queue');
  assert.equal(mixedQueue.stdout.trim(), `#${queuedNumber}`);
  assert.equal(mixedQueue.stderr, '');

  const fallbackPlanned = () =>
    loadState()
      .issues.filter(
        (entry) =>
          entry.state === 'OPEN' &&
          entry.labels.filter((label) => label.startsWith('plan:')).length === 1 &&
          entry.labels.includes('plan:planned'),
      )
      .map((entry) => entry.number)
      .sort((left, right) => left - right)
      .map((number) => `#${number}`);
  fs.writeFileSync(
    queueFile,
    `| Stage | Plan | Depends on | Why |\n|---:|---|---|---|\n| 1 | ${queuedNumber} | - | First declaration. |\n| 2 | ${queuedNumber} | - | Duplicate declaration. |\n`,
  );
  const duplicateQueue = run('next');
  expectSuccess(duplicateQueue, 'next duplicate queue fallback');
  assert.match(duplicateQueue.stderr, new RegExp(`duplicate queue plan ${queuedNumber}`));
  assert.deepEqual(duplicateQueue.stdout.trimEnd().split('\n'), fallbackPlanned());
  fs.writeFileSync(queueFile, '| Stage | Plan |\n');
  const malformedQueue = run('next');
  expectSuccess(malformedQueue, 'next malformed queue fallback');
  assert.match(malformedQueue.stderr, /malformed docs\/PLAN-QUEUE\.md/);
  assert.deepEqual(malformedQueue.stdout.trimEnd().split('\n'), fallbackPlanned());

  fs.rmSync(queueFile);
  const missingQueue = run('next');
  expectSuccess(missingQueue, 'next missing queue fallback');
  assert.match(missingQueue.stderr, /missing docs\/PLAN-QUEUE\.md/);
  assert.deepEqual(missingQueue.stdout.trimEnd().split('\n'), fallbackPlanned());

  assert.equal(fs.readdirSync(path.join(stateHome, 'docks/plan')).length, 0, 'all body temp files must be removed');
  console.log(
    'plan CLI contract: 13 checks, lifecycle repairs, fenced content, dependencies, archive/retire guards, list/next filters, temp cleanup, and concurrent writes passed',
  );
} finally {
  fs.rmSync(linkedParent, { recursive: true, force: true });
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.rmSync(stateHome, { recursive: true, force: true });
}
