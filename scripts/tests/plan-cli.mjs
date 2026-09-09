#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizePlan,
  parseReviewComment,
} from '../../plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLAN_CLI = path.join(ROOT, 'plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs');
const GH_STUB_DIR = path.join(ROOT, 'scripts/tests/fixtures/gh-stub');
const stateBase = process.env.XDG_STATE_HOME || path.join(process.env.HOME || os.homedir(), '.local', 'state');
const testScratchRoot = path.join(stateBase, 'docks');
fs.mkdirSync(testScratchRoot, { recursive: true, mode: 0o700 });
fs.chmodSync(testScratchRoot, 0o700);
const scratch = fs.realpathSync(fs.mkdtempSync(path.join(testScratchRoot, 'plan-cli-')));
const stateHome = fs.realpathSync(fs.mkdtempSync(path.join(testScratchRoot, 'plan-cli-state-')));
const statePath = path.join(scratch, 'gh-state.json');
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

function run(...args) {
  return spawnSync(process.execPath, [PLAN_CLI, ...args], {
    cwd: scratch,
    encoding: 'utf8',
    env: childEnv,
  });
}

function expectSuccess(result, label) {
  assert.equal(result.status, 0, `${label}: ${result.stderr}`);
}

function refuse(result, message) {
  assert.equal(result.status, 1, message);
  assert.equal(result.stderr, `${message}\n`);
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

function body(status = 'planned') {
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

function closedPlan(name, { status = 'done', manual = false, base = 'main' } = {}) {
  const number = createPlan(name, body(status));
  const closer = {
    __typename: 'PullRequest',
    number: 100 + number,
    url: `https://github.com/DocksDocks/fixture/pull/${100 + number}`,
    state: 'MERGED',
    mergedAt: '2026-08-21T00:00:00Z',
    baseRefName: base,
    repository: { nameWithOwner: 'DocksDocks/fixture' },
  };
  updateIssue(number, (entry) => {
    entry.state = 'CLOSED';
    entry.stateReason = 'COMPLETED';
    entry.labels = ['plan', 'plan:ongoing'];
    entry.closedByPullRequestsReferences = [{ ...closer, userLinked: manual }];
    entry.timelineItems = [{ closer: manual ? null : closer }];
  });
  addIssueComment(number, '### Code review (round 2)\n\ncode-review: pass');
  return { number, closer };
}

try {
  // Normalization must reach the remote body, not just the local export.
  const irregular = body('Done')
    .replace('## Goal', '## goal')
    .replace('Mode: plan-and-implement\n', '')
    .replace('fix_parser', 'Fix-Parser')
    .replace('| local |', '| Local |')
    .replace('Fix the parser.', 'Fix the parser — preserve records.');
  const normalized = normalizePlan(irregular);
  assert.match(normalized.body, /Mode: plan-only/);
  assert.match(normalized.body, /## Goal\n/);
  assert.match(normalized.body, /\| fix_parser \|/);
  assert.match(normalized.body, /\| `?local`? \| `?done`? \|/);
  assert.ok(!normalized.body.includes('—'));
  assert.match(normalized.body, /Fix the parser - preserve records\./);
  const normalization = createPlan('normalization', irregular);
  const normalizedEdit = edit(normalization);
  expectSuccess(normalizedEdit, 'normalize edit');
  assert.equal(issue(normalization).body, normalized.body);
  assert.match(normalizedEdit.stdout, /^advice: .*mode/im);
  const normalizedFile = exported(normalization);
  assert.equal(
    fs.readFileSync(`${normalizedFile}.origin`, 'utf8'),
    `${createHash('sha256').update(normalized.body).digest('hex')}\n`,
  );

  // Ids that differ only by case or dash collapse after normalization; the write refuses the collision.
  const collision = createPlan('id-collision');
  const collisionEdit = edit(collision, (text) =>
    text.replace(
      '| 1 | fix_parser | Fix parser | src/parser.mjs | - | local | planned | Records round-trip |',
      '| 1 | fix_parser | Fix parser | src/parser.mjs | - | local | planned | Records round-trip |\n| 2 | Fix-Parser | Second | src/other.mjs | - | local | planned | Also round-trips |',
    ),
  );
  refuse(collisionEdit, 'duplicate step id after normalization: fix_parser');
  assert.equal(issue(collision).body, body(), 'a refused collision writes nothing');

  // Old records stay readable, but the next body write uses v4.
  const legacy = createPlan(
    'legacy',
    body()
      .replace('plan-contract: v4', 'plan-contract: v3')
      .replace('## Verification Results', '## Review\n\nOld body review.\n\n## Verification Results'),
  );
  const legacyShow = run('show', String(legacy), '--body');
  expectSuccess(legacyShow, 'show v3');
  assert.equal(legacyShow.stdout.trim(), issue(legacy).body.trim());
  assert.match(legacyShow.stderr, /reviews: plan=none code=none/);
  expectSuccess(edit(legacy), 'edit v3');
  assert.match(issue(legacy).body, /^<!-- plan-contract: v4 -->/);
  assert.doesNotMatch(issue(legacy).body, /^## Review$/m);

  // Ownership is checked before a mutating command can change the record.
  const foreign = createPlan('foreign owner');
  updateIssue(foreign, (entry) => {
    entry.assignees = ['other-agent'];
  });
  refuse(run('status', String(foreign), 'ongoing'), `plan #${foreign} is owned by other-agent`);
  assert.deepEqual(issue(foreign).labels, ['plan', 'plan:drafting']);

  // A second read catches a writer that races the edit after provenance passes.
  const raced = createPlan('raced body');
  const raceFile = exported(raced);
  fs.writeFileSync(raceFile, issue(raced).body.replace('Fix parser', 'Repair parser'));
  const remoteBody = issue(raced).body.replace('Fix parser', 'Remote task');
  updateState((state) => {
    state.remoteChange = { issue: raced, viewsBeforeChange: 1, body: remoteBody };
  });
  refuse(run('edit', String(raced), '--file', raceFile), 'plan issue changed remotely; re-read and retry');
  assert.equal(issue(raced).body, remoteBody);

  // An arbitrary file cannot bypass export provenance.
  const provenance = createPlan('provenance');
  const missingFile = path.join(scratch, 'missing.md');
  fs.writeFileSync(missingFile, issue(provenance).body);
  refuse(
    run('edit', String(provenance), '--file', missingFile),
    `missing export provenance: ${missingFile}.origin does not exist; run \`plan.mjs export ${provenance}\` and re-apply the edit`,
  );
  const staleFile = exported(provenance);
  updateIssue(provenance, (entry) => {
    entry.body = entry.body.replace('Fix parser', 'Remote task');
  });
  refuse(
    run('edit', String(provenance), '--file', staleFile),
    `stale export: ${staleFile} was exported from a superseded body; run \`plan.mjs export ${provenance}\` and re-apply the edit`,
  );
  assert.match(issue(provenance).body, /Remote task/);
  const unreadableFile = exported(provenance);
  fs.writeFileSync(`${unreadableFile}.origin`, 'not a digest\n');
  refuse(
    run('edit', String(provenance), '--file', unreadableFile),
    `unreadable export provenance: ${unreadableFile}.origin`,
  );

  // The event history keeps step state frozen even if phase labels are reset.
  const frozen = createPlan('frozen steps');
  updateIssue(frozen, (entry) => {
    entry.events = [{ event: 'labeled', label: { name: 'plan:ongoing' } }];
  });
  for (const [name, before, after] of [
    ['Status', '| planned |', '| done |'],
    ['Id', '| fix_parser |', '| renamed |'],
    ['Depends', '| - |', '| 2 |'],
  ]) {
    const result = edit(frozen, (text) => text.replace(before, after));
    assert.equal(result.status, 1, `${name} must stay frozen`);
    assert.match(result.stderr, /^step state is frozen once work starts: .+\n$/);
    assert.equal(issue(frozen).body, body(), `${name} refusal must preserve the remote body`);
  }
  expectSuccess(
    edit(frozen, (text) => text.replace('Fix parser', 'Repair parser')),
    'task text edit',
  );
  assert.match(issue(frozen).body, /Repair parser/);

  // Labels cannot erase started work, but drafting can enter implementation.
  const transitions = createPlan('status transitions');
  expectSuccess(run('status', String(transitions), 'ongoing'), 'drafting to ongoing');
  assert.ok(issue(transitions).labels.includes('plan:ongoing'));
  refuse(run('status', String(transitions), 'planned'), 'illegal plan status transition: ongoing -> planned');
  refuse(run('status', String(frozen), 'planned'), 'illegal plan status transition: drafting -> planned');

  // Review prose is flexible. Severity still prevents an unsafe code pass.
  const reviewCases = [
    ['## Plan review (round 2)\n\nplan-review: pass', { kind: 'plan', verdict: 'pass' }],
    [
      '### Plan review — round 2\n\nplan review: changes\nParser — records are lost.',
      { kind: 'plan', verdict: 'repair' },
    ],
    [
      '# Code review\n\ncode-review: approved\nHIGH: The parser loses data.',
      { kind: 'code', verdict: 'fixes-required' },
    ],
  ];
  for (const [text, expected] of reviewCases) assert.deepEqual(parseReviewComment(text), expected);
  const reviews = createPlan('trusted reviews');
  addIssueComment(reviews, '## Plan review (round 2)\n\nplan-review: pass');
  addIssueComment(reviews, '## Plan review\n\nplan-review: blocked', 'foreign-agent');
  addIssueComment(reviews, '## Code review\n\ncode-review: pass\nHIGH: Data loss.');
  let shown = run('show', String(reviews));
  expectSuccess(shown, 'trusted review show');
  assert.match(shown.stdout, /^reviews: plan=pass code=fixes-required$/m);
  addIssueComment(reviews, '## Plan review\n\nplan-review: repair');
  updateIssue(reviews, (entry) => {
    entry.comments.at(-1).createdAt = '2020-01-01T00:00:00Z';
  });
  shown = run('show', String(reviews));
  expectSuccess(shown, 'timestamp review show');
  assert.match(shown.stdout, /^reviews: plan=pass code=fixes-required$/m);

  // Archive needs terminal work, a trusted pass, and the actual merged closer.
  const landed = closedPlan('merged closer');
  const archived = run('archive', String(landed.number));
  expectSuccess(archived, 'archive merged closer');
  assert.equal(archived.stdout.trim(), `plan #${landed.number} finished (closed by ${landed.closer.url})`);
  assert.deepEqual(issue(landed.number).labels, ['plan']);
  const manual = closedPlan('manual link', { manual: true });
  refuse(
    run('archive', String(manual.number)),
    'archive requires a closing pull request merged into DocksDocks/fixture:main',
  );
  const wrongBase = closedPlan('wrong base', { base: 'release' });
  refuse(
    run('archive', String(wrongBase.number)),
    'archive requires a closing pull request merged into DocksDocks/fixture:main',
  );
  const unfinished = closedPlan('unfinished step', { status: 'in-flight' });
  refuse(run('archive', String(unfinished.number)), 'archive refused: non-terminal step fix_parser');
  // A broken Steps table parses to zero rows; that never counts as complete work.
  const tableless = closedPlan('broken steps table');
  updateIssue(tableless.number, (entry) => {
    entry.body = entry.body.replace('| # | Id | Task | Files | Depends | Effect | Status | Done when |\n', '');
  });
  refuse(run('archive', String(tableless.number)), 'archive refused: no Steps rows parsed');

  // A merged closer does not replace review approval.
  const unapproved = closedPlan('review repair');
  addIssueComment(unapproved.number, '## Code review\n\ncode-review: repair\nFix data loss.');
  refuse(run('archive', String(unapproved.number)), 'archive requires Code-review: pass');
  assert.ok(issue(unapproved.number).labels.includes('plan:ongoing'));

  // A terminal row cannot be reopened by the step command.
  const terminal = createPlan('terminal step', body('done'));
  expectSuccess(run('status', String(terminal), 'ongoing'), 'start terminal plan');
  refuse(run('step', String(terminal), 'fix_parser', 'in-flight'), 'illegal step status transition: done -> in-flight');
  assert.match(issue(terminal).body, /\| `?done`? \|/);

  // A step update preserves every sibling row, including one whose cell holds an escaped pipe.
  const piped = createPlan('escaped pipe sibling');
  const pipedRow = '| 2 | grep_pipe | Grep `a \\| b` | src/grep.mjs | - | local | planned | Pipe survives |';
  expectSuccess(
    edit(piped, (text) => text.replace('| Records round-trip |\n', `| Records round-trip |\n${pipedRow}\n`)),
    'add piped row',
  );
  assert.ok(issue(piped).body.includes(pipedRow), 'edit preserves the escaped pipe cell');
  expectSuccess(run('status', String(piped), 'ongoing'), 'start piped plan');
  expectSuccess(run('step', String(piped), 'fix_parser', 'in-flight'), 'update sibling of piped row');
  assert.ok(issue(piped).body.includes(pipedRow), 'step preserves the escaped pipe row');
  assert.match(issue(piped).body, /\| fix_parser \| .* \| in-flight \|/);

  // A row that does not parse to eight cells blocks every write instead of vanishing.
  const malformed = createPlan('malformed row');
  refuse(
    edit(malformed, (text) =>
      text.replace(
        '| Records round-trip |\n',
        '| Records round-trip |\n| 2 | broken | Unescaped a | b | src | - | local | planned | Lost |\n',
      ),
    ),
    'Steps row 2 has 9 cells; expected 8. Escape a literal pipe as \\| so the row is preserved.',
  );
  updateIssue(malformed, (entry) => {
    entry.body = entry.body.replace(
      '| Records round-trip |\n',
      '| Records round-trip |\n| 2 | broken | Unescaped a | b | src | - | local | planned | Lost |\n',
    );
  });
  expectSuccess(run('status', String(malformed), 'ongoing'), 'start malformed plan');
  refuse(
    run('step', String(malformed), 'fix_parser', 'in-flight'),
    'Steps row 2 has 9 cells; expected 8. Escape a literal pipe as \\| so the row is preserved.',
  );
  assert.match(issue(malformed).body, /\| broken \|/, 'the malformed row is untouched');

  // A missing separator line is inserted; the first data row is never mistaken for it.
  const unseparated = createPlan('missing separator');
  expectSuccess(
    edit(unseparated, (text) =>
      text.replace('|---:|---|---|---|---|---|---|---|\n', '').replace('|---|---|---|\n', ''),
    ),
    'edit without separators',
  );
  const unseparatedBody = issue(unseparated).body;
  assert.ok(unseparatedBody.includes('| 1 | fix_parser | Fix parser |'), 'first step row survives');
  assert.ok(unseparatedBody.includes('| A1 | node smoke.mjs | Exit 0 |'), 'first acceptance row survives');
  assert.equal(unseparatedBody, body(), 'separators are restored');

  // A fenced example table is not the live table, and a duplicate section heading blocks the write.
  const fenced = createPlan('fenced example');
  const example = [
    '```markdown',
    '| # | Id | Task | Files | Depends | Effect | Status | Done when |',
    '|---:|---|---|---|---|---|---|---|',
    '| 1 | example | Example | x | - | local | done | Never |',
    '```',
    '',
  ].join('\n');
  expectSuccess(
    edit(fenced, (text) => text.replace('## Steps\n\n', `## Steps\n\n${example}`)),
    'edit with fenced example',
  );
  assert.ok(
    issue(fenced).body.includes('| 1 | example | Example | x | - | local | done | Never |'),
    'example untouched',
  );
  expectSuccess(run('status', String(fenced), 'ongoing'), 'start fenced plan');
  expectSuccess(run('step', String(fenced), 'fix_parser', 'in-flight'), 'step targets the live table');
  assert.match(issue(fenced).body, /\| fix_parser \| .* \| in-flight \|/);
  assert.ok(
    issue(fenced).body.includes('| 1 | example | Example | x | - | local | done | Never |'),
    'example still untouched',
  );
  const doubled = createPlan('duplicate heading');
  refuse(
    edit(doubled, (text) => text.replace('## Acceptance', '## steps\n\nNothing.\n\n## Acceptance')),
    'duplicate section heading: Steps',
  );
  assert.equal(issue(doubled).body, body(), 'a duplicate heading writes nothing');
  const fencedMode = createPlan('fenced mode example');
  const modeExample = '```markdown\nMode: plan-and-implement\n```\n\n';
  expectSuccess(
    edit(fencedMode, (text) =>
      text
        .replace('Mode: plan-and-implement\n', 'Mode: plan-only\n')
        .replace('Fix the parser.\n\n', `Fix the parser.\n\n${modeExample}`),
    ),
    'edit with fenced mode example',
  );
  const fencedModeBody = issue(fencedMode).body;
  assert.ok(fencedModeBody.includes(modeExample.trimEnd()), 'fenced Mode example is preserved');
  assert.match(fencedModeBody, /\nMode: plan-only\n/, 'the unfenced Mode decision is the live mode');
  assert.equal(fencedModeBody.match(/^Mode:/gm).length, 2, 'one example, one live Mode line');

  // A fenced block that ends a section survives normalization with either fence style.
  for (const fence of ['```', '~~~']) {
    const trailing = createPlan(`trailing fence ${fence}`);
    const evidence = `${fence}text\nnode smoke.mjs | tail -1\n${fence}`;
    expectSuccess(
      edit(trailing, (text) =>
        text.replace('The parser loses mixed-case records.\n', `The parser loses mixed-case records.\n\n${evidence}\n`),
      ),
      `edit with trailing ${fence} fence`,
    );
    assert.ok(issue(trailing).body.includes(evidence), `trailing ${fence} block is preserved`);
  }

  // An indented code example never becomes the live Mode.
  const indentedMode = createPlan('indented mode example');
  expectSuccess(
    edit(indentedMode, (text) =>
      text
        .replace('Mode: plan-and-implement\n', 'Mode: plan-only\n')
        .replace('Fix the parser.\n\n', 'Fix the parser.\n\n    Mode: plan-and-implement\n\n'),
    ),
    'edit with indented mode example',
  );
  assert.ok(issue(indentedMode).body.includes('    Mode: plan-and-implement\n'), 'indented example is preserved');
  assert.match(issue(indentedMode).body, /\nMode: plan-only\n/, 'the plan-only decision is the live mode');

  for (const [label, transform] of [
    [
      'leading',
      (text) =>
        text.replace(
          '## Goal\n\nFix the parser.\n\n',
          '## Goal\n\n    Mode: plan-and-implement\n\nFix the parser.\n\n',
        ),
    ],
    ['trailing', (text) => text.replace('Mode: plan-only\n\n', 'Mode: plan-only\n\n    Mode: plan-and-implement\n\n')],
  ]) {
    const placed = createPlan(`${label} indented mode example`);
    expectSuccess(
      edit(placed, (text) => transform(text.replace('Mode: plan-and-implement\n', 'Mode: plan-only\n'))),
      `edit with ${label} indented example`,
    );
    expectSuccess(edit(placed), `${label} second normalization`);
    assert.ok(issue(placed).body.includes('    Mode: plan-and-implement\n'), `${label} indented example is preserved`);
    assert.match(issue(placed).body, /\nMode: plan-only\n/, `${label}: the plan-only decision stays live`);
    assert.equal(issue(placed).body.match(/^Mode:/gm).length, 1, `${label}: exactly one live Mode line`);
  }

  // An indented example table before the live table is neither selected nor rewritten.
  const indentedTable = createPlan('indented example table');
  const indentedExample = [
    '    | # | Id | Task | Files | Depends | Effect | Status | Done when |',
    '    |---:|---|---|---|---|---|---|---|',
    '    | 1 | example | Example | x | - | local | done | Never |',
  ].join('\n');
  expectSuccess(
    edit(indentedTable, (text) => text.replace('## Steps\n\n', `## Steps\n\n${indentedExample}\n\n`)),
    'edit with indented example table',
  );
  assert.ok(issue(indentedTable).body.includes(indentedExample), 'indented example bytes are preserved');
  expectSuccess(run('status', String(indentedTable), 'ongoing'), 'start indented-table plan');
  expectSuccess(run('step', String(indentedTable), 'fix_parser', 'in-flight'), 'step targets the live table');
  assert.match(issue(indentedTable).body, /\| fix_parser \| .* \| in-flight \|/);
  assert.ok(issue(indentedTable).body.includes(indentedExample), 'indented example still untouched');

  // An explicit --mode outranks a Mode line embedded in --goal; a later live Mode line wins.
  const explicit = run(
    'new',
    '--title',
    'explicit mode',
    '--goal',
    'Ship it.\nMode: plan-and-implement\n\n### Context\nDetails.',
    '--mode',
    'plan-only',
  );
  expectSuccess(explicit, 'new with explicit mode');
  const explicitNumber = Number(/^plan created: #(\d+)/m.exec(explicit.stdout)[1]);
  assert.match(issue(explicitNumber).body, /\nMode: plan-only\n/, 'explicit --mode is the live mode');
  assert.equal(issue(explicitNumber).body.match(/^Mode:/gm).length, 1, 'the embedded Mode line is removed');
  assert.ok(
    issue(explicitNumber).body.includes('### Context\nDetails.\n\nMode: plan-only'),
    'goal prose stays inside Goal',
  );
  refuse(
    run('new', '--title', 'unknown section', '--goal', 'Ship it.\n\n## Context\nDetails.', '--mode', 'plan-only'),
    'unknown section heading: Context; use only Goal, Research, Steps, Acceptance, Do not touch, Open questions, Verification Results or write it below an existing section as ### or plain text',
  );
  const embedded = run('new', '--title', 'embedded mode', '--goal', 'Ship it.\nMode: plan-and-implement');
  expectSuccess(embedded, 'new with embedded mode only');
  assert.match(
    issue(Number(/^plan created: #(\d+)/m.exec(embedded.stdout)[1])).body,
    /\nMode: plan-and-implement\n/,
    'goal-authored Mode is kept without --mode',
  );

  // Dependency normalization is idempotent even when a step id is a number.
  const numericId = createPlan('numeric step id');
  const numericRows = [
    '| 1 | prepare | Prepare | src/a.mjs | - | local | planned | Ready |',
    '| 2 | 1 | Numeric | src/b.mjs | - | local | planned | Ready |',
    '| 3 | finish | Finish | src/c.mjs | prepare | local | planned | Ready |',
  ].join('\n');
  expectSuccess(
    edit(numericId, (text) =>
      text.replace(
        '| 1 | fix_parser | Fix parser | src/parser.mjs | - | local | planned | Records round-trip |',
        numericRows,
      ),
    ),
    'edit with numeric id',
  );
  const once = issue(numericId).body;
  assert.match(once, /\| 3 \| finish \| Finish \| src\/c\.mjs \| 1 \|/, 'prepare resolves to display 1');
  expectSuccess(edit(numericId), 'second normalization');
  assert.equal(issue(numericId).body, once, 'a second normalization changes nothing');

  console.log(
    'plan-cli smoke PASSED: normalization, v3 read, ownership, compare-before-write, provenance, step freeze, transitions, review trust, archive proof',
  );
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.rmSync(stateHome, { recursive: true, force: true });
}
