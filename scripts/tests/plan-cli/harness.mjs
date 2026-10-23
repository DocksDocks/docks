import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PLAN_CLI = path.join(ROOT, 'plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs');
const GH_STUB_DIR = path.join(ROOT, 'scripts/tests/fixtures/gh-stub');
// The state a repository reaches after its first `new`: every plan label exists as the fake gh
// `label create` stores it. A case that depends on label metadata replaces this map itself.
const PLAN_LABELS = ['plan', 'plan:drafting', 'plan:planned', 'plan:ongoing', 'plan:blocked'];
// The cases load this hook through `--import` so the waits of `reopen` return at once and get recorded.
export const SKIP_WAITS = new URL('./skip-waits.mjs', import.meta.url).href;
// A partial pull request merges at MERGED_AT, and GitHub records its close 2 s later, as it did for #89.
const MERGED_AT = '2026-08-21T00:00:00Z';
const CLOSED_AT = '2026-08-21T00:00:02Z';

export function expectSuccess(result, label) {
  assert.equal(result.status, 0, `${label}: ${result.stderr}`);
}

export function refuse(result, message) {
  assert.equal(result.status, 1, message);
  assert.equal(result.stderr, `${message}\n`);
}

export function body(status = 'planned') {
  return [
    '<!-- plan-contract: v4 -->',
    '',
    '## Goal',
    '',
    'Fix the parser.',
    '',
    'Mode: plan-and-implement',
    '',
    '## Research',
    '',
    'The parser loses mixed-case records.',
    '',
    '## Steps',
    '',
    '| # | Id | Task | Files | Depends | Effect | Status | Done when |',
    '|---:|---|---|---|---|---|---|---|',
    `| 1 | fix_parser | Fix parser | src/parser.mjs | - | local | ${status} | Records round-trip |`,
    '',
    '## Acceptance',
    '',
    '| ID | Command | Expected |',
    '|---|---|---|',
    '| A1 | node smoke.mjs | Exit 0 |',
    '',
    '## Do not touch',
    '',
    'Release tooling.',
    '',
    '## Open questions',
    '',
    'None.',
    '',
    '## Verification Results',
    '',
    'Not run.',
    '',
  ].join('\n');
}

// The change GitHub makes when `closer` closes a plan as completed, for a scheduled change of the fake gh.
export function closedBy(closer, createdAt = CLOSED_AT) {
  return { state: 'CLOSED', stateReason: 'COMPLETED', closedEvent: { closer, createdAt } };
}

// Each test gets its own scratch repository, fake gh state, and XDG_STATE_HOME, so tests share no
// issue numbers, labels, or exports and the runner can execute case files in parallel.
export function planCliContext(t) {
  const stateBase = process.env.XDG_STATE_HOME || path.join(process.env.HOME || os.homedir(), '.local', 'state');
  const testScratchRoot = path.join(stateBase, 'docks');
  fs.mkdirSync(testScratchRoot, { recursive: true, mode: 0o700 });
  fs.chmodSync(testScratchRoot, 0o700);
  const scratch = fs.realpathSync(fs.mkdtempSync(path.join(testScratchRoot, 'plan-cli-')));
  const stateHome = fs.realpathSync(fs.mkdtempSync(path.join(testScratchRoot, 'plan-cli-state-')));
  t.after(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.rmSync(stateHome, { recursive: true, force: true });
  });
  const statePath = path.join(scratch, 'gh-state.json');
  const waitLog = path.join(scratch, 'waits.log');
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
        repo: { nameWithOwner: 'DocksDocks/fixture', visibility: 'PRIVATE', defaultBranchRef: { name: 'main' } },
        repositoryDefaults: { 'DocksDocks/fixture': 'main' },
        viewerLogin: 'plan-agent',
        labels: Object.fromEntries(PLAN_LABELS.map((name) => [name, { color: 'ededed' }])),
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
    PLAN_CLI_WAIT_LOG: waitLog,
  };

  // Node flags such as `['--import', SKIP_WAITS]` apply to this one helper process.
  function runWith(nodeFlags, ...args) {
    return spawnSync(process.execPath, [...nodeFlags, PLAN_CLI, ...args], {
      cwd: scratch,
      encoding: 'utf8',
      env: childEnv,
    });
  }

  function run(...args) {
    return runWith([], ...args);
  }

  // The timeouts that the skip-waits hook received, in call order.
  function waits() {
    if (!fs.existsSync(waitLog)) return [];
    return fs.readFileSync(waitLog, 'utf8').split('\n').filter(Boolean).map(Number);
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

  // The gh calls that write: GraphQL mutations and every non-api command other than `view` and `list`.
  function writes() {
    return loadState().calls.filter(([group, command, ...rest]) => {
      if (group !== 'api') return !['view', 'list'].includes(command);
      return command === 'graphql' && rest.some((argument) => /^query=\s*mutation\b/.test(argument));
    });
  }

  // Each change lands once the fake gh has served `afterReads` GraphQL reads of the issue.
  function schedule(number, ...changes) {
    updateIssue(number, (entry) => {
      entry.pendingChanges = [...(entry.pendingChanges ?? []), ...changes];
    });
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

  function createPlan(name, text = body()) {
    const result = run('new', '--title', name, '--goal', 'Preserve plan records');
    expectSuccess(result, `new ${name}`);
    const match = /^plan created: #(\d+) (https:\/\/\S+)$/m.exec(result.stdout);
    assert.ok(match, 'new prints the issue identity');
    const number = Number(match[1]);
    updateIssue(number, (entry) => {
      entry.body = text;
    });
    return number;
  }

  function exported(number) {
    const result = run('export', String(number));
    expectSuccess(result, 'export');
    const file = result.stdout.trim();
    assert.ok(path.isAbsolute(file), 'export returns an absolute file path');
    return file;
  }

  function edit(number, transform = (text) => text) {
    const file = exported(number);
    fs.writeFileSync(file, transform(fs.readFileSync(file, 'utf8')));
    return run('edit', String(number), '--file', file);
  }

  function closedPlan(name, { status = 'done', base = 'main', prBody } = {}) {
    const number = createPlan(name, body(status));
    const closer = {
      __typename: 'PullRequest',
      number: 100 + number,
      url: `https://github.com/DocksDocks/fixture/pull/${100 + number}`,
      state: 'MERGED',
      mergedAt: '2026-08-21T00:00:00Z',
      baseRefName: base,
      body: prBody === undefined ? `Closes #${number}` : prBody?.replaceAll('ISSUE', String(number)),
      repository: { nameWithOwner: 'DocksDocks/fixture' },
    };
    updateIssue(number, (entry) => {
      entry.state = 'CLOSED';
      entry.stateReason = 'COMPLETED';
      entry.labels = ['plan', 'plan:ongoing'];
      entry.timelineItems = [{ closer }];
    });
    addIssueComment(number, '### Code review (round 2)\n\ncode-review: pass');
    return { number, closer };
  }

  // An ongoing plan after the merge of a partial pull request that lists it in closingIssuesReferences.
  // The plan still reads OPEN: a case schedules the close that GitHub records a while after the merge.
  function partialMerge(name, { assignees = [], merged = true, closes = true } = {}) {
    const number = createPlan(name, body('in-flight'));
    const pr = 100 + number;
    updateState((state) => {
      const entry = state.issues.find((candidate) => candidate.number === number);
      entry.labels = ['plan', 'plan:ongoing'];
      entry.assignees = assignees;
      state.prs.push({
        number: pr,
        url: `https://github.com/DocksDocks/fixture/pull/${pr}`,
        state: merged ? 'MERGED' : 'OPEN',
        mergedAt: merged ? MERGED_AT : null,
        baseRefName: 'main',
        repository: 'DocksDocks/fixture',
        closingIssuesReferences: closes ? [number] : [],
      });
      // The call log then holds only what the case itself runs.
      state.calls = [];
    });
    return { number, pr, closer: { __typename: 'PullRequest', number: pr } };
  }

  return {
    scratch,
    run,
    runWith,
    waits,
    writes,
    schedule,
    loadState,
    updateState,
    issue,
    updateIssue,
    addIssueComment,
    createPlan,
    exported,
    edit,
    closedPlan,
    partialMerge,
  };
}
