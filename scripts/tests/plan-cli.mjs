#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
    '| 1 | implement_contract | Implement the contract | src/example.mjs | — | `local` | `planned` | command exits 0 |',
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

function setIssueStatus(number, status) {
  updateIssue(number, (entry) => {
    entry.body = entry.body.replace(/^blocked_reason:.*\n/m, '').replace(/^status:.*$/m, `status: ${status}`);
    if (status === 'blocked')
      entry.body = entry.body.replace(/^status: blocked$/m, 'status: blocked\nblocked_reason: fixture reason');
    if (status !== 'drafting')
      entry.body = entry.body.replace('_Not researched yet._', 'Repository facts confirmed the durable fix.');
    entry.labels = entry.labels.filter((label) => !label.startsWith('plan:'));
    entry.labels.push(`plan:${status}`);
  });
}

function expectCheckPass(value) {
  const result = run('check', String(value));
  expectSuccess(result, `check ${value}`);
  assert.equal(result.stdout.trim(), `plan check passed: #${String(value).replace(/^#/, '')}`);
}

function mutateAndRestore(number, checkNumber, mutate) {
  const before = issue(number);
  const savedBody = before.body;
  const savedLabels = [...before.labels];
  updateIssue(number, mutate);
  const failed = run('check', String(number));
  assert.equal(failed.status, 1, `check ${checkNumber} mutation unexpectedly passed`);
  assert.match(failed.stderr, new RegExp(`check ${checkNumber}\\b`));
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
    [
      'plan',
      'plan:drafting',
      'plan:planned',
      'plan:ongoing',
      'plan:blocked',
      'plan:finished',
      'plan-scheduled',
      'security',
      'auth',
    ].map((label) => `label ready: ${label}`),
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
  const topicNumber = createPlan('topic-label', { labels: ['security'] });
  assert.deepEqual(issue(topicNumber).labels, ['plan', 'plan:drafting', 'security']);

  const templateNumber = createPlan('template', { mode: 'plan-only' });
  const template = issue(templateNumber);
  assert.match(template.body, /^---\nplan_contract: v2\n/);
  assert.match(template.body, /^status: drafting$/m);
  assert.match(template.body, /^Mode: plan-only$/m);
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
    const editFile = path.join(scratch, `foreign-${command}.md`);
    fs.writeFileSync(editFile, before.body);
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
  assert.ok(ownershipEdit.includes('--body-file'));
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
    const editFile = path.join(scratch, `empty-login-${command}.md`);
    fs.writeFileSync(editFile, before.body);
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
      1,
      (entry) => {
        entry.body = entry.body.replace('assignee: null', 'unexpected: value\nassignee: null');
      },
    ],
    [
      2,
      (entry) => {
        entry.body = entry.body.replace('status: drafting', 'status: unknown');
      },
    ],
    [
      3,
      (entry) => {
        entry.body = entry.body.replace('title: Exercise checks', 'title: ');
      },
    ],
    [
      4,
      (entry) => {
        entry.body = entry.body.replace(/^updated: "(.*)"$/m, 'updated: $1');
      },
    ],
    [
      5,
      (entry) => {
        entry.body = entry.body.replace('## Research', '## Findings');
      },
    ],
    [
      6,
      (entry) => {
        entry.body = entry.body.replace('| implement_contract |', '| Implement-contract |');
      },
    ],
    [
      7,
      (entry) => {
        entry.body = entry.body.replace('_Not researched yet._', '_Not researched yet._ step:missing');
      },
    ],
    [
      8,
      (entry) => {
        entry.body = entry.body.replace('| — | `local` |', '| 2 | `local` |');
      },
    ],
    [
      9,
      (entry) => {
        entry.body = entry.body.replace(
          '| A1 | `node --version` | Exit 0 |',
          '| A1 | `node --version` | Exit 0 |\n| A1 | `node -v` | Exit 0 |',
        );
      },
    ],
    [
      10,
      (entry) => {
        entry.body = entry.body.replace('_Not researched yet._', '_Not researched yet._ /home/alice/private');
      },
    ],
    [
      11,
      (entry) => {
        entry.body = entry.body.replace('status: drafting', 'status: planned');
        entry.labels = ['plan', 'plan:planned'];
      },
    ],
    [
      12,
      (entry) => {
        entry.body = entry.body.replace('src/example.mjs', `#${validNumber}`);
      },
    ],
    [
      13,
      (entry) => {
        entry.body = entry.body.replace('Mode: plan-and-implement', 'Mode: direct');
      },
    ],
  ];
  for (const [checkNumber, mutate] of mutations) mutateAndRestore(validNumber, checkNumber, mutate);

  mutateAndRestore(validNumber, 2, (entry) => entry.labels.push('plan:blocked'));
  for (const ownReference of [String(validNumber), `#${validNumber}`, issue(validNumber).url]) {
    mutateAndRestore(validNumber, 12, (entry) => {
      entry.body = entry.body.replace('src/example.mjs', ownReference);
    });
  }

  const validFile = path.join(scratch, 'valid-plan.md');
  fs.writeFileSync(validFile, issue(validNumber).body);
  const fileCheck = run('check', '--file', validFile);
  expectSuccess(fileCheck, 'check --file');
  assert.equal(fileCheck.stdout.trim(), `plan check passed: ${validFile}`);

  const beforeReordered = fs.readFileSync(validFile, 'utf8');
  fs.writeFileSync(validFile, beforeReordered.replace(/^(created: .+)\n(updated: .+)$/m, '$2\n$1'));
  const reordered = run('check', '--file', validFile);
  assert.equal(reordered.status, 1);
  assert.match(reordered.stderr, /check 1: .*frontmatter key updated is out of position/);
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
  const invalidEdit = path.join(scratch, 'invalid-edit.md');
  fs.writeFileSync(invalidEdit, beforeRejectedEdit.replace('Mode: plan-and-implement', 'Mode: direct'));
  const rejectedEdit = run('edit', String(editNumber), '--file', invalidEdit);
  assert.equal(rejectedEdit.status, 1);
  assert.match(rejectedEdit.stderr, /check 13:/);
  assert.equal(issue(editNumber).body, beforeRejectedEdit, 'failed edit must leave issue unchanged');

  const acceptedEdit = path.join(scratch, 'accepted-edit.md');
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
  assert.equal(shown.stdout, `${shownHeader}\n`);
  assert.equal(shown.stderr, '');
  assert.doesNotMatch(shown.stdout, /plan_contract:/);
  const shownBody = run('show', `#${editNumber}`, '--body');
  expectSuccess(shownBody, 'show --body');
  assert.equal(shownBody.stdout, issue(editNumber).body);
  assert.equal(shownBody.stderr, `${shownHeader}\n`);

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
    entry.body = 'not a v2 plan\n';
  });
  assert.match(run('export', String(badExportNumber)).stderr, /not a v2 plan/);
  assert.match(run('export', 'not-a-number').stderr, /invalid plan issue/);

  const planTransitions = {
    drafting: new Set(['planned', 'ongoing', 'blocked']),
    planned: new Set(['drafting', 'ongoing', 'blocked']),
    ongoing: new Set(['finished', 'blocked']),
    blocked: new Set(['drafting', 'planned', 'ongoing']),
    finished: new Set(),
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

  setIssueStatus(transitionNumber, 'drafting');
  updateIssue(transitionNumber, (entry) => entry.labels.push('plan:bogus', 'plan-scheduled'));
  const bogusListing = run('list');
  expectSuccess(bogusListing, 'list ignores bogus status labels');
  assert.match(bogusListing.stdout, new RegExp(`^drafting\\t#${transitionNumber}\\t`, 'm'));
  assert.doesNotMatch(bogusListing.stdout, /plan:bogus/);
  updateIssue(transitionNumber, (entry) => entry.labels.push('plan:blocked'));
  expectSuccess(run('status', String(transitionNumber), 'planned'), 'conflicting labels repaired');
  assert.deepEqual(issue(transitionNumber).labels.sort(), ['plan', 'plan-scheduled', 'plan:planned']);

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

  const dependencyNumber = createPlan('dependency');
  makeValid(dependencyNumber, {
    steps: [
      '| 1 | prepare | Prepare the dependency | src/example.mjs | — | `local` | `planned` | command exits 0 |',
      '| 2 | consume | Consume the dependency | src/example.mjs | 1 | `local` | `planned` | command exits 0 |',
    ],
  });
  setIssueStatus(dependencyNumber, 'ongoing');
  const dependencyBlocked = run('step', String(dependencyNumber), 'consume', 'in-flight');
  assert.equal(dependencyBlocked.status, 1);
  assert.match(dependencyBlocked.stderr, /unfinished dependency/);

  const wrongBranchNumber = createPlan('wrong-branch-archive');
  makeValid(wrongBranchNumber);
  setIssueStatus(wrongBranchNumber, 'ongoing');
  updateIssue(wrongBranchNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done').replace('_No review yet._', 'Code-review: pass');
    entry.closedByPullRequestsReferences = [
      {
        id: 'PR_fixture_42',
        number: 42,
        url: 'https://github.com/DocksDocks/fixture/pull/42',
        repository: {
          id: 'R_fixture',
          name: 'fixture',
          owner: { id: 'U_docks', login: 'DocksDocks' },
        },
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
  assert.equal(wrongBranchArchive.status, 1);
  assert.equal(wrongBranchArchive.stderr.trim(), 'archive requires a pull request merged into main, found release/1.x');
  assert.deepEqual(issue(wrongBranchNumber), beforeWrongBranchArchive);

  const manuallyLinkedNumber = createPlan('manually-linked-archive');
  makeValid(manuallyLinkedNumber);
  setIssueStatus(manuallyLinkedNumber, 'ongoing');
  updateIssue(manuallyLinkedNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done').replace('_No review yet._', 'Code-review: pass');
    entry.closedByPullRequestsReferences = [
      {
        id: 'PR_manual_43',
        number: 43,
        repository: {
          id: 'R_manual',
          name: 'manual',
          owner: { id: 'U_manual', login: 'ManualOrg' },
        },
        url: 'https://github.com/ManualOrg/manual/pull/43',
      },
    ];
    entry.userLinkedPullRequests = [
      ...Array.from({ length: 100 }, (_, index) => ({
        number: 1000 + index,
        repository: 'DummyOrg/repo',
      })),
      { number: 43, repository: 'ManualOrg/manual' },
    ];
  });
  updateState((state) => {
    state.prs.push({
      number: 43,
      repository: 'ManualOrg/manual',
      mergedAt: '2026-08-20T20:45:00Z',
      state: 'MERGED',
      baseRefName: 'main',
      url: 'https://github.com/ManualOrg/manual/pull/43',
    });
  });
  const manualCallsBefore = loadState().calls.length;
  const beforeManuallyLinkedArchive = issue(manuallyLinkedNumber);
  const manuallyLinkedArchive = run('archive', String(manuallyLinkedNumber));
  assert.equal(manuallyLinkedArchive.status, 1);
  assert.equal(
    manuallyLinkedArchive.stderr.trim(),
    'archive requires a keyword-linked pull request; #43 is manually linked',
  );
  assert.deepEqual(issue(manuallyLinkedNumber), beforeManuallyLinkedArchive);
  assert.equal(
    loadState()
      .calls.slice(manualCallsBefore)
      .filter((call) => call[0] === 'api' && call[1] === 'graphql').length,
    2,
  );

  const archiveNumber = createPlan('archive');
  makeValid(archiveNumber);
  setIssueStatus(archiveNumber, 'ongoing');
  const unfinishedArchive = run('archive', String(archiveNumber));
  assert.equal(unfinishedArchive.status, 1);
  assert.match(unfinishedArchive.stderr, /non-terminal step/);
  updateIssue(archiveNumber, (entry) => {
    entry.body = replaceStepStatus(entry.body, 'done');
  });
  const unreviewedArchive = run('archive', String(archiveNumber));
  assert.equal(unreviewedArchive.status, 1);
  assert.match(unreviewedArchive.stderr, /Code-review: pass/);
  updateIssue(archiveNumber, (entry) => {
    entry.body = entry.body.replace('_No review yet._', 'Code-review: pass');
    entry.closedByPullRequestsReferences = [
      {
        id: 'PR_fixture_41',
        number: 41,
        url: 'https://github.com/OtherOrg/landing/pull/41',
        repository: {
          id: 'R_other',
          name: 'landing',
          owner: { id: 'U_other', login: 'OtherOrg' },
        },
      },
    ];
  });
  updateState((state) =>
    state.prs.push({
      number: 41,
      repository: 'OtherOrg/landing',
      mergedAt: null,
      state: 'CLOSED',
      baseRefName: 'trunk',
      url: 'https://github.com/OtherOrg/landing/pull/41',
    }),
  );
  const unsupportedMergedField = spawnSync(
    'gh',
    ['pr', 'view', '41', '--json', 'merged', '--repo', 'OtherOrg/landing'],
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
      'query=query{repository(owner:\"x\",name:\"y\"){issue(number:1){closing:closedByPullRequestsReferences(first:1,invented:true){nodes{number}}}}}',
    ],
    { cwd: scratch, encoding: 'utf8', env: childEnv },
  );
  assert.equal(unsupportedGraphqlArgument.status, 1);
  assert.equal(unsupportedGraphqlArgument.stderr.trim(), 'Unknown GraphQL argument: "invented"');
  const beforeUnmergedArchive = issue(archiveNumber);
  const unmergedArchive = run('archive', String(archiveNumber));
  assert.equal(unmergedArchive.status, 1);
  assert.match(unmergedArchive.stderr, /merged linked pull request/);
  assert.deepEqual(issue(archiveNumber), beforeUnmergedArchive);
  updateState((state) => {
    state.prs.find((entry) => entry.number === 41 && entry.repository === 'OtherOrg/landing').mergedAt =
      '2026-08-20T21:00:00Z';
    state.prs.push({
      number: 41,
      repository: 'ManualOrg/manual',
      mergedAt: '2026-08-20T20:55:00Z',
      state: 'MERGED',
      baseRefName: 'main',
      url: 'https://github.com/ManualOrg/manual/pull/41',
    });
    const planIssue = state.issues.find((entry) => entry.number === archiveNumber);
    planIssue.closedByPullRequestsReferences.unshift({
      id: 'PR_manual_41',
      number: 41,
      repository: {
        id: 'R_manual',
        name: 'manual',
        owner: { id: 'U_manual', login: 'ManualOrg' },
      },
      url: 'https://github.com/ManualOrg/manual/pull/41',
    });
    planIssue.userLinkedPullRequests = [{ number: 41, repository: 'ManualOrg/manual' }];
  });
  const archiveCallsBefore = loadState().calls.length;
  const archived = run('archive', String(archiveNumber));
  expectSuccess(archived, 'archive');
  assert.equal(
    archived.stdout.trim(),
    `plan #${archiveNumber} finished (closed by https://github.com/OtherOrg/landing/pull/41)`,
  );
  const archiveCalls = loadState().calls.slice(archiveCallsBefore);
  assert.ok(archiveCalls.some((call) => call[0] === 'api' && call[1] === 'graphql'));
  assert.equal(
    archiveCalls.some((call) => call[0] === 'pr' && call[1] === 'view'),
    false,
  );
  assert.equal(
    archiveCalls.some((call) => call[0] === 'repo' && call[1] === 'view' && call.includes('--repo')),
    false,
  );
  assert.equal(issue(archiveNumber).state, 'CLOSED');
  assert.equal(issue(archiveNumber).stateReason, 'COMPLETED');
  assert.deepEqual(issue(archiveNumber).labels.sort(), ['plan', 'plan:finished']);

  const retiredNumber = createPlan('retired');
  makeValid(retiredNumber);
  const retired = run('retire', String(retiredNumber), '--reason', 'The request was withdrawn');
  expectSuccess(retired, 'retire');
  assert.equal(retired.stdout.trim(), `plan #${retiredNumber} retired`);
  assert.equal(issue(retiredNumber).body.match(/^## Retirement$/gm)?.length, 1);
  assert.match(issue(retiredNumber).body, /## Retirement\n\nThe request was withdrawn\n$/);
  assert.equal(issue(retiredNumber).stateReason, 'NOT_PLANNED');
  const retireAgain = run('retire', String(retiredNumber), '--reason', 'A second reason');
  assert.equal(retireAgain.status, 1);
  assert.equal(issue(retiredNumber).body.match(/^## Retirement$/gm)?.length, 1);

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
  assert.doesNotMatch(issue(concurrentNumber).body, /^status: planned$/m);

  const openPlanned = createPlan('open-planned');
  makeValid(openPlanned);
  setIssueStatus(openPlanned, 'planned');
  const closedPlanned = createPlan('closed-planned');
  makeValid(closedPlanned);
  setIssueStatus(closedPlanned, 'planned');
  updateIssue(closedPlanned, (entry) => {
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
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
  const plannedOnly = run('list', '--status', 'planned');
  expectSuccess(plannedOnly, 'list planned');
  assert.match(plannedOnly.stdout, new RegExp(`^planned\\t#${openPlanned}\\tExercise open-planned$`, 'm'));
  assert.match(plannedOnly.stdout, new RegExp(`^planned\\t#${closedPlanned}\\tExercise closed-planned$`, 'm'));
  const unreadableOnly = run('list', '--status', 'unreadable');
  expectSuccess(unreadableOnly, 'list unreadable');
  assert.match(unreadableOnly.stdout, new RegExp(`^unreadable\\t#${unreadableNumber}\\tExercise unreadable$`, 'm'));
  const listCall = loadState().calls.findLast((call) => call[0] === 'issue' && call[1] === 'list');
  assert.deepEqual(listCall.slice(2, 8), ['--label', 'plan', '--state', 'all', '--limit', '500']);
  assert.equal(listCall.includes('--search'), false);

  const dependencyOne = createPlan('queue-dependency-one');
  makeValid(dependencyOne);
  setIssueStatus(dependencyOne, 'finished');
  updateIssue(dependencyOne, (entry) => {
    entry.state = 'CLOSED';
  });
  const dependencyTwo = createPlan('queue-dependency-two');
  makeValid(dependencyTwo);
  setIssueStatus(dependencyTwo, 'finished');
  updateIssue(dependencyTwo, (entry) => {
    entry.state = 'CLOSED';
  });
  const queuedNumber = createPlan('queued');
  makeValid(queuedNumber);
  setIssueStatus(queuedNumber, 'planned');
  const queueFile = path.join(scratch, 'docs/PLAN-QUEUE.md');
  fs.writeFileSync(
    queueFile,
    `| Stage | Plan | Depends on | Why |\n|---:|---|---|---|\n| 1 | ${dependencyOne} | — | First dependency. |\n| 2 | #${dependencyTwo} | ${dependencyOne} | Second dependency. |\n| 3 | ${queuedNumber} | #${dependencyTwo} | Ready after transitive closure. |\n`,
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
    entry.labels = ['plan', 'plan:finished'];
  });

  fs.writeFileSync(
    queueFile,
    `| Stage | Plan | Depends on | Why |\n|---:|---|---|---|\n| 1 | ${queuedNumber} | — | Numeric plan. |\n| 2 | legacy-plan-slug | — | Frozen history. |\n| 3 | ${openPlanned} | legacy-plan-slug | Depends on frozen history. |\n`,
  );
  const mixedQueue = run('next');
  expectSuccess(mixedQueue, 'next mixed numeric and legacy queue');
  assert.equal(mixedQueue.stdout.trim(), `#${queuedNumber}`);
  assert.equal(mixedQueue.stderr, '');

  const fallbackPlanned = () =>
    loadState()
      .issues.filter(
        (entry) =>
          entry.labels.filter((label) => label.startsWith('plan:')).length === 1 &&
          entry.labels.includes('plan:planned'),
      )
      .map((entry) => entry.number)
      .sort((left, right) => left - right)
      .map((number) => `#${number}`);
  fs.writeFileSync(
    queueFile,
    `| Stage | Plan | Depends on | Why |\n|---:|---|---|---|\n| 1 | ${queuedNumber} | — | First declaration. |\n| 2 | ${queuedNumber} | — | Duplicate declaration. |\n`,
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
