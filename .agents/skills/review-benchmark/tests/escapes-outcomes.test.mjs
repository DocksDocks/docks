import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { BUN_RUNTIME } from '../../../../cli/test/lib/cliEntry.ts';
import * as escapes from '../scripts/escapes.mjs';
import * as outcomes from '../scripts/outcomes.mjs';
import * as prepare from '../scripts/prepare.mjs';
import { main } from '../scripts/score.mjs';
import {
  gridFixture,
  oneKnownCases,
  put,
  readJson,
  readText,
  REPO_ROOT,
  scratch,
  singleRuns,
  tableAfter,
  writeFixture,
} from './helpers.mjs';

test('outcomes counts the reverts and follow-up defects of each landed plan', () => {
  const repo = 'Owner/repo';
  const merge = `${'a'.repeat(9)}${'b'.repeat(31)}`;
  const ref = (number) => ({ number, repository: { name: 'repo', owner: { login: 'Owner' } } });
  const plans = [
    { number: 10, title: 'Plan ten', closedAt: '2026-01-02T00:00:00Z', closedByPullRequestsReferences: [ref(11)] },
    { number: 20, title: 'Plan | twenty', closedAt: '2026-01-05T00:00:00Z', closedByPullRequestsReferences: [] },
  ];
  const pull = (number, title, body, createdAt, extra = {}) => ({
    number,
    title,
    body,
    createdAt,
    mergedAt: null,
    mergeCommit: null,
    labels: [],
    ...extra,
  });
  const pulls = [
    pull(11, 'Land plan ten', 'Closes #10', '2026-01-01T00:00:00Z', {
      mergedAt: '2026-01-02T00:00:00Z',
      mergeCommit: { oid: merge },
    }),
    pull(12, 'Revert "Land plan ten"', 'Reverts Owner/repo#11', '2026-01-03T00:00:00Z', {
      mergedAt: '2026-01-03T01:00:00Z',
      mergeCommit: { oid: 'c'.repeat(40) },
    }),
    pull(13, 'fix: retry after the plan', 'Follows #10.', '2026-01-04T00:00:00Z'),
    pull(14, 'Docs', 'Mentions #10 in passing.', '2026-01-04T00:00:00Z'),
    pull(15, 'fix: an older bug', 'See #10.', '2025-12-31T00:00:00Z'),
  ];
  const issue = (number, title, body, labels = []) => ({
    number,
    title,
    body,
    createdAt: '2026-01-04T00:00:00Z',
    labels,
  });
  const issues = [
    issue(10, 'Plan ten', 'fix things'),
    issue(16, 'Open LOW findings of plan #10', 'Unreached: src/a.mjs:3'),
    issue(17, 'Crash', 'After https://github.com/Owner/repo/pull/11 the command crashes.', [{ name: 'bug' }]),
    issue(18, 'Bug in #100', ''),
  ];
  const commits = [
    { sha: 'd'.repeat(40), message: `Revert "Land plan ten"\n\nThis reverts commit ${merge.slice(0, 9)}.` },
    { sha: 'c'.repeat(40), message: 'Merge pull request #12\n\nRevert "Land plan ten" (Reverts Owner/repo#11)' },
    { sha: merge, message: 'Merge pull request #11' },
  ];
  const rows = outcomes.planOutcomes({ repo, plans, issues, pulls, commits });
  assert.deepEqual(rows, [
    {
      plan: 10,
      title: 'Plan ten',
      landing: 11,
      merged: '2026-01-02T00:00:00Z',
      mergeCommit: merge,
      reverts: ['#12', 'dddddddddddd'],
      followUps: ['#16', '#17', '#13'],
      unreached: ['#16'],
    },
    {
      plan: 20,
      title: 'Plan | twenty',
      landing: null,
      merged: null,
      mergeCommit: null,
      reverts: [],
      followUps: [],
      unreached: [],
    },
  ]);
  assert.deepEqual(outcomes.renderOutcomes(rows).split('\n'), [
    '| Plan | Landing PR | Merged | Reverts | Follow-up defects | Unreached issues | Title |',
    '|---:|---:|---|---|---|---|---|',
    '| #10 | #11 | 2026-01-02 | 2 (#12, dddddddddddd) | 3 (#16, #17, #13) | 1 (#16) | Plan ten |',
    '| #20 | - | - | - | 0 | 0 | Plan \\| twenty |',
  ]);
  for (const [text, cited] of [
    ['see #10.', true],
    ['see #100', false],
    ['abc#10', false],
    ['Owner/repo#10', true],
    ['https://github.com/Owner/repo/issues/10', true],
    ['https://github.com/Owner/repo/pull/105', false],
  ]) {
    assert.equal(outcomes.cites(text, repo, 10), cited, text);
  }
  // fetchRepository reads the plans, the issues, the pull requests, and the commit lines through gh.
  const calls = [];
  const run = repositoryRunner({ plans, issues, pulls, commits: [commits[0], commits[2]] }, {}, calls);
  const fetched = outcomes.fetchRepository(repo, run);
  assert.deepEqual(calls, ['plans', 'issues', 'pulls', 'commits']);
  assert.deepEqual(
    [fetched.plans, fetched.issues, fetched.pulls, fetched.commits],
    [plans, issues, pulls, [commits[0], commits[2]]],
  );
});
test('outcomes counts only merged revert pull requests and keeps the revert commits of the default branch', () => {
  const repo = 'Owner/repo';
  const merge = 'a'.repeat(40);
  const plans = [
    {
      number: 10,
      title: 'Plan ten',
      closedAt: '2026-01-02T00:00:00Z',
      closedByPullRequestsReferences: [{ number: 11 }],
    },
  ];
  const pull = (number, title, body, extra = {}) => ({
    number,
    title,
    body,
    createdAt: '2026-01-03T00:00:00Z',
    mergedAt: null,
    mergeCommit: null,
    labels: [],
    ...extra,
  });
  const pulls = [
    pull(11, 'Land plan ten', 'Closes #10', {
      createdAt: '2026-01-01T00:00:00Z',
      mergedAt: '2026-01-02T00:00:00Z',
      mergeCommit: { oid: merge },
    }),
    // An open revert pull request and one that closed without a merge revert nothing.
    pull(12, 'Revert "Land plan ten"', 'Reverts #11.'),
    pull(13, 'Revert "Land plan ten"', `Reverts ${merge.slice(0, 9)}, but it closed without a merge.`),
  ];
  const commits = [
    { sha: 'd'.repeat(40), message: `Revert "Land plan ten"\n\nThis reverts commit ${merge}.` },
    { sha: merge, message: 'Merge pull request #11' },
  ];
  const [row] = outcomes.planOutcomes({ repo, plans, issues: [], pulls, commits });
  assert.deepEqual(row.reverts, ['dddddddddddd']);
  // Without a defect label or a defect title, an unmerged revert pull request is no follow-up defect either.
  assert.deepEqual(row.followUps, []);
});
// The commit that a test draw records as the commit of its script.
const DRAW_OPTIONS = { drawCommit: 'd'.repeat(40) };
// The source snapshot is synthetic: no held-out production defect is used in these parser tests.
function escapeFixture() {
  const date = (day) => `2026-01-${String(day).padStart(2, '0')}T00:00:00Z`;
  const comment = (id, day, body) => ({ id, createdAt: date(day), url: `https://example.test/comments/${id}`, body });
  const modern = (reviewer, round, findings = [], previous = [], suffix = '') =>
    `### ${reviewer} review round ${round}${suffix}\n\n${findings.join('\n')}\n\nPrevious findings:\n\n${previous.join('\n')}`;
  const plans = [20, 10, 30].map((number) => ({
    number,
    title: `Plan ${number}`,
    closedAt: date(number === 30 ? 25 : 10),
    closedByPullRequestsReferences: number === 10 ? [{ number: 11 }] : [],
  }));
  return {
    version: 1,
    repo: 'Owner/repo',
    cutoff: date(20),
    script_commit: 'a'.repeat(40),
    cases: [
      { id: 'dev-20', issue: 20, round: 1, kind: 'plan', split: 'dev' },
      { id: 'heldout-10', issue: 10, round: 9, kind: 'plan', split: 'heldout' },
    ],
    repository: {
      plans,
      issues: [
        { number: 41, title: 'fix: follow-up', body: 'Cites only #11.', createdAt: date(12), labels: [] },
        { number: 42, title: 'fix: too late', body: 'See #11.', createdAt: date(20), labels: [] },
      ],
      pulls: [
        {
          number: 11,
          title: 'Land work',
          body: 'Closes #10',
          createdAt: date(1),
          mergedAt: date(10),
          mergeCommit: { oid: 'b'.repeat(40) },
          labels: [],
        },
      ],
      commits: [{ sha: 'b'.repeat(40), message: 'Land work', date: date(10) }],
    },
    comments: {
      10: [
        comment(101, 1, modern('Code', 1)),
        comment(
          102,
          2,
          modern('Code', 2, ['- [HIGH] Bug - src/a.mjs:1 - SECRET_A - repair A. - class: failure a'], [], ', delta'),
        ),
        comment(
          103,
          2,
          modern(
            'Code',
            2,
            ['- [MEDIUM] Spec - src/b.mjs:2 - SECRET_B - repair B. - class: failure b'],
            [],
            ', lens spec-and-tests',
          ),
        ),
        comment(
          104,
          3,
          modern(
            'Code',
            3,
            ['- [LOW] Bug - src/c.mjs:3 - SECRET_C - repair C.'],
            [
              '- Round-2 finding on src/a.mjs:1: fixed - repaired A.',
              '- Round-2 finding on src/b.mjs:2: fixed - repaired B.',
            ],
            ', delta',
          ),
        ),
        comment(105, 4, modern('Code', 4, [], ['- Round-3 finding on src/c.mjs:3: resolved - repaired C.'], ', delta')),
        comment(106, 5, modern('Code', 5, ['- [HIGH] Bug - src/d.mjs:4 - UNFIXED - repair D.'])),
        comment(107, 6, modern('Code', 6, [], ['- Round-5 finding on src/d.mjs:4: open - still broken.'])),
        comment(108, 20, modern('Code', 7, [], ['- Round-5 finding on src/d.mjs:4: fixed - too late.'])),
        comment(109, 7, modern('Plan', 1)),
        comment(110, 8, modern('Plan', 2, ['- security_risk - Steps 3 - SECRET_PLAN - check containment.'])),
        comment(111, 9, modern('Plan', 3, [], ['- Round-2 finding on Steps 3: resolved - repaired.'])),
      ],
      20: [
        comment(201, 1, '### Plan review\nPlan-review: pass\nNone.'),
        comment(202, 2, '### Plan review\n- [goal_fit] Goal - DEV_FINDING - add the missing output.'),
        comment(203, 3, '### Plan review\nPlan-review: pass\nNone.'),
        comment(204, 1, modern('Code', 1)),
        comment(205, 2, modern('Code', 2, ['- [LOW] Bug - src/dev.mjs:1 - DEV_CODE - repair.'])),
        comment(206, 3, modern('Code', 3, [], ['- Round-2 finding on src/dev.mjs:1: fixed - repaired.'])),
      ],
      30: [comment(301, 1, '### Code review round 1')],
    },
  };
}
function repositoryRunner(repository, comments = {}, calls = []) {
  const lines = (items) => items.map((item) => JSON.stringify(item)).join('\n');
  return (args) => {
    if (args[1] !== 'graphql') {
      const commentPath = args.find((arg) => /\/issues\/\d+\/comments\?/.test(arg));
      if (commentPath) {
        const issue = Number(commentPath.match(/\/issues\/(\d+)\//)[1]);
        calls.push(`comments:${issue}`);
        return lines(comments[issue] ?? []);
      }
      calls.push('commits');
      return lines(repository.commits);
    }
    assert.ok(args.includes('--paginate'));
    const query = args.find((arg) => arg.startsWith('query='));
    if (query.includes('closedByPullRequestsReferences')) {
      calls.push('plans');
      return lines(
        repository.plans.map((plan) => ({
          ...plan,
          closedByPullRequestsReferences: {
            nodes: plan.closedByPullRequestsReferences,
            referencePage: { hasNextPage: false, endCursor: null },
          },
        })),
      );
    }
    const kind = query.includes('pullRequests(') ? 'pulls' : 'issues';
    calls.push(kind);
    return lines(repository[kind].map((item) => ({ ...item, labels: { nodes: item.labels } })));
  };
}
test('escape units follow issue, reviewer, and review-sequence order, with two findings in one round', () => {
  const { record } = escapes.buildDraw(escapeFixture(), 'test', DRAW_OPTIONS);
  assert.deepEqual(
    record.frozen.units.map(({ issue, reviewer, missed_round: round }) => [issue, reviewer, round]),
    [
      [10, 'code', 1],
      [10, 'code', 2],
      [10, 'code', 6],
      [10, 'plan', 1],
      [20, 'code', 1],
      [20, 'plan', 1],
    ],
  );
  assert.deepEqual(
    record.frozen.units[0].findings.map((finding) => finding.locator),
    ['src/a.mjs:1', 'src/b.mjs:2'],
  );
  assert.equal(record.frozen.units[0].split, 'heldout');
  assert.equal(record.frozen.units.at(-1).split, 'dev');
});
test('escape draw keeps delta missed rounds and excludes findings without a later fix', () => {
  const units = escapes.buildDraw(escapeFixture(), 'test', DRAW_OPTIONS).record.frozen.units;
  assert.equal(units[1].kind, 'code-delta');
  assert.equal(units[1].missed_round, 2);
  assert.equal(units[1].findings[0].found_round, 3);
  assert.equal(
    units.some((unit) => unit.findings.some((finding) => finding.text.includes('UNFIXED'))),
    false,
  );
});
test('escape draw accepts the old unnumbered plan review format with a later review', () => {
  const units = escapes.buildDraw(escapeFixture(), 'test', DRAW_OPTIONS).record.frozen.units;
  const old = units.find((unit) => unit.issue === 20 && unit.reviewer === 'plan');
  assert.equal(old.missed_round, 1);
  assert.equal(old.findings.length, 1);
  assert.equal(old.findings[0].category, 'goal_fit');
  assert.match(old.findings[0].text, /DEV_FINDING/);
});
test('escape snapshot captures complete input and all plan comments once, with cutoff and script commit', () => {
  const fixture = escapeFixture();
  const calls = [];
  const snapshot = escapes.captureSnapshot(
    {
      repo: fixture.repo,
      closedBefore: fixture.cutoff,
      commit: fixture.script_commit,
      cases: fixture.cases,
    },
    repositoryRunner(fixture.repository, fixture.comments, calls),
  );
  assert.deepEqual(snapshot.repository, fixture.repository);
  assert.deepEqual(snapshot.comments, { 10: fixture.comments[10], 20: fixture.comments[20] });
  assert.equal(snapshot.cutoff, fixture.cutoff.replace('Z', '.000Z'));
  assert.equal(snapshot.script_commit, fixture.script_commit);
  assert.deepEqual(calls, ['plans', 'issues', 'pulls', 'commits', 'comments:10', 'comments:20']);
});
test('escape draw ignores plans, comments, follow-ups, and merge events at or after the cutoff', () => {
  const fixture = escapeFixture();
  const original = escapes.buildDraw(fixture, 'test', DRAW_OPTIONS).record.frozen.units;
  fixture.comments[10].pop();
  fixture.comments[10] = fixture.comments[10].filter((comment) => comment.id !== 108);
  // Remove a pre-cutoff confirmation too: it must change the draw, unlike the too-late round.
  const changed = escapes.buildDraw(fixture, 'test', DRAW_OPTIONS).record.frozen.units;
  assert.equal(
    changed.some((unit) => unit.reviewer === 'plan' && unit.issue === 10),
    false,
  );
  assert.equal(
    original.some((unit) => unit.issue === 30),
    false,
  );
  assert.equal(
    original.some((unit) => unit.findings.some((finding) => finding.item === 42)),
    false,
  );
  fixture.repository.plans.find((plan) => plan.number === 10).closedByPullRequestsReferences.push({ number: 12 });
  fixture.repository.pulls.push({
    number: 12,
    title: 'Later landing',
    body: 'Closes #10',
    createdAt: '2026-01-09T00:00:00Z',
    mergedAt: fixture.cutoff,
    mergeCommit: { oid: 'd'.repeat(40) },
    labels: [],
  });
  fixture.repository.pulls.push({
    number: 43,
    title: 'Revert work',
    body: 'Reverts #11',
    createdAt: '2026-01-12T00:00:00Z',
    mergedAt: fixture.cutoff,
    mergeCommit: { oid: 'c'.repeat(40) },
    labels: [],
  });
  fixture.repository.commits.push({
    sha: 'c'.repeat(40),
    message: 'Revert #11',
    date: fixture.cutoff,
  });
  assert.deepEqual(escapes.buildDraw(fixture, 'test', DRAW_OPTIONS).record.frozen.units, changed);
});
test('the given-data follow-up rule agrees with planOutcomes and keeps landing-PR-only citations', () => {
  const fixture = escapeFixture();
  const data = { repo: fixture.repo, ...fixture.repository };
  const plan = data.plans.find((item) => item.number === 10);
  const result = outcomes.followUpsOf(plan, data.pulls, data);
  const row = outcomes.planOutcomes(data).find((item) => item.plan === 10);
  assert.deepEqual(
    result.defects.map((item) => `#${item.number}`),
    row.followUps,
  );
  assert.deepEqual(
    result.unreached.map((item) => `#${item.number}`),
    row.unreached,
  );
  assert.equal(result.defects[0].body, 'Cites only #11.');
  const unit = escapes
    .buildDraw(fixture, 'test', DRAW_OPTIONS)
    .record.frozen.units.find((item) => item.findings.some((finding) => finding.origin === 'follow-up'));
  assert.equal(unit.issue, 10);
  assert.equal(unit.missed_round, 6);
  assert.equal(unit.findings[0].item, 41);
});
test('escape frozen record and manifest are byte-stable and reveal no held-out unit identities', () => {
  const fixture = escapeFixture();
  const first = escapes.buildDraw(fixture, 'test', DRAW_OPTIONS);
  const second = escapes.buildDraw(JSON.parse(escapes.frozenJson(fixture)), 'test', DRAW_OPTIONS);
  assert.equal(escapes.frozenJson(first.record), escapes.frozenJson(second.record));
  assert.equal(first.manifest, second.manifest);
  assert.doesNotMatch(first.manifest, /SECRET|10-code|10-plan|"issue": 10|heldout-10|#10\b/);
  assert.match(first.manifest, /\| heldout \| code-delta \| 1 \|/);
  const hashes = first.record.frozen.seeded_plans.map((item) => item.hash);
  const reordered = structuredClone(fixture);
  reordered.comments[10].reverse();
  assert.deepEqual(escapes.buildDraw(reordered, 'test', DRAW_OPTIONS).record.frozen.units, first.record.frozen.units);
  assert.deepEqual(hashes, [...hashes].sort());
  assert.equal(
    first.record.frozen.seeded_plans.some((item) => item.issue === 20),
    false,
  );
});
test('escape draw keeps separate cycles and drops open repeats even when their locator moves', () => {
  const fixture = escapeFixture();
  fixture.repository.issues = [];
  fixture.comments[10] = [
    { id: 1, createdAt: '2026-01-01T00:00:00Z', body: '### Code review round 1\n' },
    {
      id: 2,
      createdAt: '2026-01-02T00:00:00Z',
      body: '### Code review round 2\n- [HIGH] Bug - a.mjs:1 - broken - class: carried',
    },
    {
      id: 3,
      createdAt: '2026-01-03T00:00:00Z',
      body: '### Code review round 3\nPrevious findings:\n- Round-2 finding on a.mjs:1: open - repeat.\n- [HIGH] Bug - a.mjs:7 - still broken - class: carried',
    },
    {
      id: 4,
      createdAt: '2026-01-04T00:00:00Z',
      body: '### Code review round 4\nPrevious findings:\n- Round-2 finding on a.mjs:1: fixed - repaired.',
    },
    {
      id: 5,
      createdAt: '2026-01-05T00:00:00Z',
      body: '### Code review round 1 (cycle 2)\n- [LOW] Bug - a.mjs:8 - New cycle defect - repair.',
    },
    {
      id: 6,
      createdAt: '2026-01-06T00:00:00Z',
      body: '### Code review round 2 (cycle 2)\n- [low] a.mjs:2 - Other bug - repair.',
    },
    { id: 7, createdAt: '2026-01-07T00:00:00Z', body: '### Code review round 3 (cycle 2)\nNone.' },
  ];
  const units = escapes
    .buildDraw(fixture, 'test', DRAW_OPTIONS)
    .record.frozen.units.filter((unit) => unit.issue === 10);
  // The first round of cycle 2 reports a new defect, but it reviews another sequence: no unit for round 4 of cycle 1.
  assert.deepEqual(
    units.map((unit) => [unit.missed_round, unit.cycle]),
    [
      [1, 1],
      [1, 2],
    ],
  );
  assert.notEqual(units[0].id, units[1].id);
  assert.equal(units[0].findings.length, 1);
});
test('escape CLI writes restricted frozen data and the public manifest, and never overwrites a record', () => {
  const root = scratch();
  put(root, 'source.json', escapeFixture());
  const args = ['draw', '--snapshot', path.join(root, 'source.json'), '--seed', 'test'];
  const expected = escapes.main(args);
  assert.equal(
    escapes.main([...args, '--record', path.join(root, 'record.json'), '--manifest', path.join(root, 'manifest.md')]),
    expected,
  );
  assert.equal(readText(path.join(root, 'manifest.md')), expected);
  assert.equal(fs.statSync(path.join(root, 'record.json')).mode & 0o777, 0o600);
  const record = readJson(path.join(root, 'record.json'));
  assert.deepEqual(record.outcomes, []);
  assert.equal(record.frozen.units.length, 6);
  // The draw records the commit of its own script next to the commit of the snapshot.
  assert.match(record.frozen.draw_commit, /^[0-9a-f]{40}(?:-dirty)?$/);
  assert.equal(record.frozen.script_commit, 'a'.repeat(40));
  assert.ok(expected.includes(`- Draw script commit: ${record.frozen.draw_commit}\n`));
  // A commit that does not hold the running draw code is refused (see the git-archive test below for a match).
  assert.throws(() => escapes.main([...args, '--commit', 'e'.repeat(40)]), { message: /differs from .* at e{40}/ });
  assert.throws(() => escapes.main([...args, '--commit', 'HEAD']), { message: 'draw needs the commit of its script' });
  assert.throws(() => escapes.buildDraw(escapeFixture(), 'test'), { message: 'draw needs the commit of its script' });
  assert.throws(() => escapes.main([...args, '--record', path.join(root, 'record.json')]), /EEXIST/);
});
test('repository fetching paginates lists and closing references without a fixed list limit', () => {
  const fixture = escapeFixture();
  const base = repositoryRunner(fixture.repository);
  let extraPage = false;
  const run = (args) => {
    const query = args.find((arg) => arg.startsWith('query=')) ?? '';
    assert.equal(args.includes('--limit'), false);
    if (query.includes('issue(number: 10)')) {
      extraPage = true;
      assert.ok(args.includes('cursor=more-refs'));
      return JSON.stringify({
        data: {
          repository: {
            issue: {
              closedByPullRequestsReferences: {
                nodes: [{ number: 12 }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      });
    }
    const result = base(args);
    if (!query.includes('closedByPullRequestsReferences')) return result;
    return result
      .split('\n')
      .map((line) => {
        const plan = JSON.parse(line);
        if (plan.number === 10)
          plan.closedByPullRequestsReferences.referencePage = { hasNextPage: true, endCursor: 'more-refs' };
        return JSON.stringify(plan);
      })
      .join('\n');
  };
  const result = outcomes.fetchRepository(fixture.repo, run);
  assert.equal(extraPage, true);
  assert.deepEqual(result.plans.find((plan) => plan.number === 10).closedByPullRequestsReferences, [
    { number: 11 },
    { number: 12 },
  ]);
  assert.deepEqual(result.issues, fixture.repository.issues);
});
test('plan cases validate seeded as a boolean while code cases use patch', () => {
  const plan = {
    id: 'plan-5',
    kind: 'plan',
    split: 'dev',
    issue: 5,
    round: 1,
    plan: 'plan.md',
    repo_ref: 'HEAD',
    known: [],
  };
  for (const seeded of [true, false]) assert.equal(prepare.validateCase({ ...plan, seeded }).seeded, seeded);
  for (const seeded of [null, 1, 'true', [], {}])
    assert.throws(() => prepare.validateCase({ ...plan, seeded }), {
      message: 'case plan-5: seeded must be true or false',
    });
  assert.equal(prepare.validateCase(plan).seeded, undefined);
  assert.equal(
    prepare.validateCase({
      ...plan,
      kind: 'plan-delta',
      previous_body: 'previous.md',
      previous_review: 'review.md',
      seeded: true,
    }).seeded,
    true,
  );
  assert.throws(() => prepare.validateCase({ ...plan, kind: 'code', base: 'a', head: 'b', seeded: true }), {
    message: 'case plan-5: only plan cases take seeded; code cases use patch',
  });
});
test('a case may record the review cycle of its round as a positive integer', () => {
  const code = {
    id: 'code-5',
    kind: 'code',
    split: 'dev',
    issue: 5,
    round: 2,
    plan: 'p.md',
    base: 'a',
    head: 'b',
    known: [],
  };
  assert.equal(prepare.validateCase({ ...code, cycle: 2 }).cycle, 2);
  for (const cycle of [0, 1.5, '2', null]) {
    assert.throws(() => prepare.validateCase({ ...code, cycle }), {
      message: 'case code-5: cycle must be a positive integer',
    });
  }
});
test('the seeded-share report counts seeded plan cases and keeps older plan status unknown', () => {
  const ws = path.join(scratch(), 'ws');
  const runs = [...singleRuns('B0', 2, 1, () => true), ...singleRuns('C1', 2, 1, () => true)];
  writeFixture(ws, gridFixture(oneKnownCases(2), runs));
  put(ws, 'code-1/case.json', { id: 'code-1', kind: 'plan', split: 'dev', seeded: true });
  put(ws, 'code-2/case.json', { id: 'code-2', kind: 'plan-delta', split: 'dev', seeded: false });
  const args = ['report', ws, '--arms', 'B0-xhigh-fast,C1-xhigh-fast', '--reference', 'B0-xhigh-fast'];
  const row = () =>
    tableAfter(readText(path.join(ws, 'report.md')), '### Decision: dev').find((line) => line.startsWith('| Seeded'));
  main(args);
  assert.equal(row(), '| Seeded cases of the shared cases with known defects | - | 1 of 2 (0.50) |');
  put(ws, 'code-2/case.json', { id: 'code-2', kind: 'plan-delta', split: 'dev' });
  main(args);
  assert.equal(row(), '| Seeded cases of the shared cases with known defects | - | - |');
});
test('escape review sequences break equal comment times by round number, not comment id', () => {
  const fixture = escapeFixture();
  const comments = fixture.comments[10];
  const third = comments.find((comment) => comment.id === 104);
  third.createdAt = comments.find((comment) => comment.id === 102).createdAt;
  third.id = 100;
  comments.reverse();
  const units = escapes
    .buildDraw(fixture, 'test', DRAW_OPTIONS)
    .record.frozen.units.filter((unit) => unit.issue === 10);
  assert.deepEqual(
    units.map((unit) => [unit.reviewer, unit.missed_round]),
    [
      ['code', 1],
      ['code', 2],
      ['code', 6],
      ['plan', 1],
    ],
  );
});
// C9: a plan issue, or a pull request that closed a plan, is later plan work, also with a defect title or label.
test('escape follow-ups leave out later plans that cite an earlier plan, with their landing pull requests', () => {
  const fixture = escapeFixture();
  const { repository } = fixture;
  const day = (n) => `2026-01-${String(n).padStart(2, '0')}T00:00:00Z`;
  repository.plans.push({
    number: 50,
    title: 'Fix the crash of #10',
    closedAt: day(15),
    closedByPullRequestsReferences: [{ number: 51 }],
  });
  repository.issues.push(
    { number: 50, title: 'Fix the crash of #10', body: 'Follows #10.', createdAt: day(12), labels: [{ name: 'plan' }] },
    // An open plan is in no plan list, but its label marks it.
    { number: 52, title: 'Fix more of #11', body: 'Follows #11.', createdAt: day(12), labels: [{ name: 'plan' }] },
  );
  repository.pulls.push({
    number: 51,
    title: 'fix: land plan 50',
    body: 'Closes #50. Follows #10.',
    createdAt: day(13),
    mergedAt: day(14),
    mergeCommit: { oid: 'e'.repeat(40) },
    labels: [],
  });
  const data = { repo: fixture.repo, ...repository };
  // Their titles are defect titles, but the one follow-up rule of outcomes.mjs and of the draw leaves them out.
  const row = outcomes.planOutcomes(data).find((item) => item.plan === 10);
  assert.ok(row.followUps.includes('#41'));
  for (const id of ['#50', '#51', '#52']) assert.equal(row.followUps.includes(id), false, id);
  const plan = data.plans.find((item) => item.number === 10);
  const given = outcomes.followUpsOf(plan, [data.pulls[0]], data).defects.map((item) => `#${item.number}`);
  assert.deepEqual(given, row.followUps);
  const followUps = escapes
    .buildDraw(fixture, 'test', DRAW_OPTIONS)
    .record.frozen.units.flatMap((unit) => unit.findings.filter((finding) => finding.origin === 'follow-up'))
    .map((finding) => finding.item);
  assert.deepEqual(followUps, [41]);
});
test('escape follow-ups give an item that cites two plans to one plan', () => {
  const fixture = escapeFixture();
  const day = (n) => `2026-01-${String(n).padStart(2, '0')}T00:00:00Z`;
  fixture.repository.issues.push(
    // Cites the landing pull request of plan 10 and the number of plan 20: the landing citation wins.
    { number: 45, title: 'fix: crash', body: 'Breaks #20 and #11.', createdAt: day(13), labels: [] },
    // Cites two plans that closed before it: the higher number wins.
    { number: 46, title: 'Bug in the output', body: 'Seen in #10 and #20.', createdAt: day(13), labels: [] },
  );
  const owners = new Map();
  for (const unit of escapes.buildDraw(fixture, 'test', DRAW_OPTIONS).record.frozen.units) {
    for (const finding of unit.findings.filter((item) => item.origin === 'follow-up')) {
      owners.set(finding.item, [...(owners.get(finding.item) ?? []), `${unit.issue} ${unit.split}`]);
    }
  }
  assert.deepEqual(Object.fromEntries(owners), { 41: ['10 heldout'], 45: ['10 heldout'], 46: ['20 dev'] });
  // The order of the plans gives the same owners.
  fixture.repository.plans.reverse();
  fixture.repository.issues.reverse();
  const again = escapes
    .buildDraw(fixture, 'test', DRAW_OPTIONS)
    .record.frozen.units.flatMap((unit) =>
      unit.findings.filter((item) => item.origin === 'follow-up').map((item) => [item.item, unit.issue]),
    );
  assert.deepEqual(
    again.toSorted((a, b) => a[0] - b[0]),
    [
      [41, 10],
      [45, 10],
      [46, 20],
    ],
  );
});
test('the escape manifest lists dev units by commitment and holds no finding text', () => {
  const fixture = escapeFixture();
  fixture.repository.issues.push({
    number: 46,
    title: 'Bug in the output',
    body: 'DEV_FOLLOW_UP text after #20.',
    createdAt: '2026-01-13T00:00:00Z',
    labels: [],
  });
  const { record, manifest } = escapes.buildDraw(fixture, 'test', DRAW_OPTIONS);
  const texts = record.frozen.units.flatMap((unit) => unit.findings.map((finding) => finding.text));
  assert.ok(texts.some((text) => text.includes('DEV_FOLLOW_UP')));
  for (const text of texts) {
    for (const line of text.split('\n').filter((part) => part.trim().length > 8)) {
      assert.equal(manifest.includes(line), false, line);
    }
  }
  assert.doesNotMatch(manifest, /DEV_FINDING|DEV_CODE|DEV_FOLLOW_UP|SECRET|src\//);
  const dev = record.frozen.units.filter((unit) => unit.split === 'dev');
  const commitment = (unit) => createHash('sha256').update(escapes.frozenJson(unit)).digest('hex');
  assert.deepEqual(
    manifest.split('\n').filter((line) => line.startsWith('| #')),
    dev.map(
      (unit) => `| #${unit.issue} | ${unit.reviewer} | ${unit.missed_round} | ${unit.kind} | ${commitment(unit)} |`,
    ),
  );
  assert.equal(dev.length, 3);
});
test('score corpus counts the cases with known defects by reviewer and split, also with --keys', () => {
  const root = scratch();
  const cases = path.join(root, 'cases');
  const keys = path.join(root, 'keys');
  const known = (count) => Array.from({ length: count }, (_, index) => ({ id: `K${index + 1}`, title: 'Hidden' }));
  put(cases, 'dev/code-3.json', { id: 'code-3', kind: 'code', split: 'dev', issue: 3, known: known(1) });
  put(cases, 'dev/code-3b.json', { id: 'code-3b', kind: 'code-delta', split: 'dev', issue: 3, known: known(2) });
  put(cases, 'dev/plan-3.json', { id: 'plan-3', kind: 'plan', split: 'dev', issue: 3, known: known(2) });
  put(cases, 'dev/code-9.json', { id: 'code-9', kind: 'code', split: 'dev', issue: 9, control: true, known: [] });
  put(cases, 'heldout/code-4.json', { id: 'code-4', kind: 'code', split: 'heldout', issue: 4 });
  put(cases, 'heldout/plan-4.json', { id: 'plan-4', kind: 'plan', split: 'heldout', issue: 4 });
  put(cases, 'heldout/plan-4.key.json', known(3));
  put(cases, 'heldout/plan-5.json', { id: 'plan-5', kind: 'plan-delta', split: 'heldout', issue: 5 });
  put(cases, 'heldout/plan-5.key.json', { known: known(1) });
  const table = (keyRows, missing) => [
    '| Reviewer | Split | Cases with known defects | Distinct plans |',
    '|---|---|---:|---:|',
    ...keyRows,
    '',
    `The cases of the corpus <cases>, by count only. Held-out cases without a key file: ${missing}.`,
  ];
  const run = (...args) =>
    main(['corpus', '--cases', cases, ...args])
      .replaceAll(cases, '<cases>')
      .split('\n');
  assert.deepEqual(
    run(),
    table(
      [
        '| code-reviewer | dev | 2 | 1 |',
        '| code-reviewer | held-out | 0 | 0 |',
        '| plan-reviewer | dev | 1 | 1 |',
        '| plan-reviewer | held-out | 2 | 2 |',
      ],
      1,
    ),
  );
  // With --keys, every held-out key comes from the keys folder.
  put(keys, 'code-4.key.json', known(2));
  put(keys, 'plan-5.key.json', known(1));
  assert.deepEqual(
    run('--keys', keys),
    table(
      [
        '| code-reviewer | dev | 2 | 1 |',
        '| code-reviewer | held-out | 1 | 1 |',
        '| plan-reviewer | dev | 1 | 1 |',
        '| plan-reviewer | held-out | 1 | 1 |',
      ],
      1,
    ),
  );
  assert.throws(() => main(['corpus']), { message: /^usage: score\.mjs / });
});
// The outcome parts of C7 on a fixture draw: one outcome file per decided unit, case files in a scratch cases folder.
function outcomeFixture() {
  const root = scratch();
  put(root, 'source.json', escapeFixture());
  const record = path.join(root, 'record.json');
  const manifest = path.join(root, 'manifest.md');
  escapes.main([
    'draw',
    '--snapshot',
    path.join(root, 'source.json'),
    '--seed',
    'test',
    '--record',
    record,
    '--manifest',
    manifest,
  ]);
  const cases = path.join(root, 'cases');
  put(cases, 'dev/plan-20-r1.json', { id: 'plan-20-r1', kind: 'plan', split: 'dev', issue: 20, round: 1, cycle: 1 });
  put(cases, 'heldout/code-10-r1.json', {
    id: 'code-10-r1',
    kind: 'code',
    split: 'heldout',
    issue: 10,
    round: 1,
    cycle: 1,
  });
  const units = readJson(record).frozen.units;
  const outcome = (unit, extra) => ({
    unit: unit.id,
    issue: unit.issue,
    reviewer: unit.reviewer,
    kind: unit.kind,
    missed_round: unit.missed_round,
    split: unit.split,
    findings: unit.findings.map((_, index) => index),
    inputs: { note: 'restricted' },
    decided: '2026-11-18T12:00:00Z',
    ...extra,
  });
  const [held1, held2] = units.filter((unit) => unit.split === 'heldout');
  const [devCode, devPlan] = units.filter((unit) => unit.split === 'dev');
  const decided = [
    outcome(held1, { outcome: 'taken', case: 'code-10-r1' }),
    outcome(held2, { outcome: 'rejected', reason: 'a' }),
    outcome(devCode, { outcome: 'rejected', reason: 'b' }),
    outcome(devPlan, { outcome: 'taken', case: 'plan-20-r1' }),
  ];
  const dir = path.join(root, 'outcomes');
  for (const item of decided) put(dir, `${item.unit}.json`, item);
  const args = ['outcomes', '--record', record, '--outcomes', dir, '--manifest', manifest, '--cases', cases];
  return { root, record, manifest, cases, dir, units, decided, outcome, args, devCode, devPlan };
}
test('escape outcomes write both outcome parts, keep both frozen parts, and rerun to the same bytes', () => {
  const fixture = outcomeFixture();
  const frozenRecord = readText(fixture.record);
  const frozenManifest = readText(fixture.manifest);
  assert.match(escapes.main(fixture.args), /^outcomes: 4 decided units/);
  const record = readJson(fixture.record);
  assert.equal(escapes.frozenJson(record.frozen), escapes.frozenJson(JSON.parse(frozenRecord).frozen));
  assert.equal(fs.statSync(fixture.record).mode & 0o777, 0o600);
  // Draw order, not file-name order.
  const order = fixture.units.map((unit) => unit.id);
  assert.deepEqual(
    record.outcomes.map((item) => item.unit),
    order.filter((id) => fixture.decided.some((item) => item.unit === id)),
  );
  assert.deepEqual(record.outcomes[0].inputs, { note: 'restricted' });
  const manifest = readText(fixture.manifest);
  assert.ok(manifest.startsWith(frozenManifest));
  const section = manifest.slice(frozenManifest.length);
  assert.ok(section.startsWith('\n## Outcomes\n'));
  const commitment = (unit) => createHash('sha256').update(escapes.frozenJson(unit)).digest('hex');
  const lines = section.split('\n');
  assert.ok(lines.includes('| dev | 2 | 1 | 0 | 1 | 0 | 0 | 0 | 0 |'));
  assert.ok(lines.includes('| heldout | 4 | 1 | 1 | 0 | 0 | 0 | 0 | 2 |'));
  assert.deepEqual(
    lines.filter((line) => line.startsWith('| #')),
    [
      `| #20 | code | 1 | code | ${commitment(fixture.devCode)} | rejected | (b) |`,
      `| #20 | plan | 1 | plan | ${commitment(fixture.devPlan)} | taken | plan-20-r1 |`,
    ],
  );
  // No held-out unit, case, or finding text.
  assert.doesNotMatch(section, /#10\b|code-10-r1|10-code|10-plan|SECRET|DEV_|src\//);
  // A rerun replaces the section and gives the same bytes; an earlier run's section does not stay.
  const [recordBytes, manifestBytes] = [readText(fixture.record), manifest];
  escapes.main(fixture.args);
  assert.equal(readText(fixture.record), recordBytes);
  assert.equal(readText(fixture.manifest), manifestBytes);
  fs.rmSync(path.join(fixture.dir, `${fixture.devCode.id}.json`));
  escapes.main(fixture.args);
  const fewer = readText(fixture.manifest);
  assert.ok(fewer.startsWith(frozenManifest));
  assert.equal(fewer.split('## Outcomes').length, 2);
  assert.ok(fewer.includes('| dev | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |'));
  assert.equal(readJson(fixture.record).outcomes.length, 3);
});
test('escape outcomes refuse outcome files that do not match the frozen draw, and write nothing', () => {
  const fixture = outcomeFixture();
  const recordText = readText(fixture.record);
  const manifestText = readText(fixture.manifest);
  const [held1] = fixture.units.filter((unit) => unit.split === 'heldout');
  const apply = (files, texts = {}) =>
    escapes.applyOutcomes({
      recordText: texts.record ?? recordText,
      manifestText: texts.manifest ?? manifestText,
      files: files.map((item) => ({ name: item.name ?? `${item.body.unit}.json`, text: JSON.stringify(item.body) })),
      casesDir: fixture.cases,
    });
  const taken = fixture.outcome(held1, { outcome: 'taken', case: 'code-10-r1' });
  const cases = [
    [[{ body: { ...taken, unit: '99-code-1' } }], /names no unit of the draw/],
    [[{ name: 'other.json', body: taken }], /must be named/],
    [[{ body: taken }, { body: taken }], /has two outcome files/],
    [[{ body: { ...taken, split: 'dev' } }], /split is "dev", the frozen unit has "heldout"/],
    [[{ body: { ...taken, kind: 'plan' } }], /kind is "plan"/],
    [[{ body: { ...taken, case: 'code-10-r9' } }], /has no case file in heldout/],
    [[{ body: { ...taken, reason: 'a' } }], /a taken unit has no reason/],
    [[{ body: { ...taken, outcome: 'rejected', case: undefined, reason: 'f' } }], /reason letter a to e/],
    [[{ body: { ...taken, outcome: 'rejected' } }], /a rejected unit has no case/],
    [[{ body: { ...taken, outcome: 'maybe' } }], /outcome must be taken or rejected/],
    [[{ body: { ...taken, decided: 'soon' } }], /decided must be an ISO time/],
    [[{ body: { ...taken, remark: 'x' } }], /unknown fields: remark/],
    [[{ body: { ...taken, note: 3 } }], /note must be a string/],
  ];
  for (const [files, message] of cases) assert.throws(() => apply(files), { message }, String(message));
  // A case file of another issue does not count for this unit.
  put(fixture.cases, 'heldout/code-11-r1.json', { id: 'code-11-r1', kind: 'code', split: 'heldout', issue: 11 });
  assert.throws(() => apply([{ body: { ...taken, case: 'code-11-r1' } }]), {
    message: /is not a heldout case of issue #10/,
  });
  // An edited record, and a manifest of another draw.
  assert.throws(() => apply([{ body: taken }], { record: recordText.replace('\n', '\n ') }), {
    message: /not in canonical form/,
  });
  assert.throws(
    () => apply([{ body: taken }], { manifest: manifestText.replace(/(record SHA-256: )[0-9a-f]/, '$1z') }),
    { message: /names another frozen record/ },
  );
  // The command writes nothing when one outcome file fails.
  put(fixture.dir, `${held1.id}.json`, { ...taken, reason: 'a' });
  assert.throws(() => escapes.main(fixture.args), { message: /a taken unit has no reason/ });
  assert.equal(readText(fixture.record), recordText);
  assert.equal(readText(fixture.manifest), manifestText);
});
test('escape outcomes keep a note in the restricted record and never print it in the manifest', () => {
  const fixture = outcomeFixture();
  const notes = { 0: 'HELD_NOTE: the defect sits in a helper', 2: 'DEV_NOTE: the fix is two rounds later' };
  for (const [index, note] of Object.entries(notes)) {
    const item = { ...fixture.decided[index], note };
    put(fixture.dir, `${item.unit}.json`, item);
  }
  escapes.main(fixture.args);
  const kept = Object.fromEntries(
    readJson(fixture.record)
      .outcomes.filter((item) => item.note)
      .map((item) => [item.unit, item.note]),
  );
  assert.deepEqual(kept, {
    [fixture.decided[0].unit]: notes[0],
    [fixture.decided[2].unit]: notes[2],
  });
  assert.doesNotMatch(readText(fixture.manifest), /HELD_NOTE|DEV_NOTE|helper|two rounds later/);
});
test('escape draw confirms an old-format finding only when a later review no longer reports it', () => {
  const fixture = escapeFixture();
  const finding = '- [goal_fit] Goal - DEV_FINDING - add the missing output.';
  const plan20 = (comments) => {
    fixture.comments[20] = [
      ...fixture.comments[20].filter((comment) => !comment.body.startsWith('### Plan')),
      ...comments,
    ];
    return escapes
      .buildDraw(fixture, 'test', DRAW_OPTIONS)
      .record.frozen.units.filter((unit) => unit.issue === 20 && unit.reviewer === 'plan');
  };
  const review = (id, day, body) => ({ id, createdAt: `2026-01-0${day}T00:00:00Z`, body: `### Plan review\n${body}` });
  // The review after the finding repeats it, and no later review exists: no confirmed fix, so no unit. The repeat is
  // no new finding of round 3 either.
  const repeated = [review(201, 1, 'None.'), review(202, 2, finding), review(203, 3, finding)];
  assert.deepEqual(plan20(repeated), []);
  // A fourth review no longer reports it: the fix is confirmed, and round 1 is the missed round.
  const fixed = plan20([...repeated, review(204, 4, 'Plan-review: pass\nNone.')]);
  assert.deepEqual(
    fixed.map((unit) => [unit.missed_round, unit.findings.map((item) => item.found_round)]),
    [[1, [2]]],
  );
});
test('escape follow-ups check every landing pull request of a plan before the plan number', () => {
  const fixture = escapeFixture();
  const day = (n) => `2026-01-${String(n).padStart(2, '0')}T00:00:00Z`;
  // Plan 10 landed twice: #11, then #12. The item cites the earlier landing and the number of plan 20.
  fixture.repository.plans.find((plan) => plan.number === 10).closedByPullRequestsReferences.push({ number: 12 });
  fixture.repository.pulls.push({
    number: 12,
    title: 'Land more work',
    body: 'Closes #10',
    createdAt: day(9),
    mergedAt: day(11),
    mergeCommit: { oid: 'f'.repeat(40) },
    labels: [],
  });
  fixture.repository.issues.push({
    number: 47,
    title: 'fix: crash',
    body: 'After #11, see #20.',
    createdAt: day(13),
    labels: [],
  });
  const owners = escapes
    .buildDraw(fixture, 'test', DRAW_OPTIONS)
    .record.frozen.units.flatMap((unit) =>
      unit.findings.filter((item) => item.item === 47).map(() => `${unit.issue} ${unit.split}`),
    );
  assert.deepEqual(owners, ['10 heldout']);
});
test('escape outcomes refuse a case of another kind, round, or cycle, a case without a cycle, and a case that two units name', () => {
  const fixture = outcomeFixture();
  const [held1] = fixture.units.filter((unit) => unit.split === 'heldout');
  const apply = (bodies, recordText = readText(fixture.record), manifestText = readText(fixture.manifest)) =>
    escapes.applyOutcomes({
      recordText,
      manifestText,
      files: bodies.map((body) => ({ name: `${body.unit}.json`, text: JSON.stringify(body) })),
      casesDir: fixture.cases,
    });
  const heldCase = (id, extra) =>
    put(fixture.cases, `heldout/${id}.json`, { id, kind: 'code', split: 'heldout', issue: 10, round: 1, ...extra });
  heldCase('code-10-r2', { round: 2, cycle: 1 });
  heldCase('plan-10-r1', { kind: 'plan', cycle: 1 });
  heldCase('code-10-c2-r1', { cycle: 2 });
  heldCase('code-10-nocycle-r1', {});
  const taken = (id) => fixture.outcome(held1, { outcome: 'taken', case: id });
  for (const id of ['code-10-r2', 'plan-10-r1']) {
    assert.throws(() => apply([taken(id)]), { message: /is a (code|plan) case of round \d, not the code round 1/ }, id);
  }
  assert.throws(() => apply([taken('code-10-c2-r1')]), { message: /is a case of cycle 2, not cycle 1 of the unit/ });
  // A round number can repeat in a cycle that gives no unit, so every taken case records its cycle, even when the draw
  // holds one unit of this round.
  assert.throws(() => apply([taken('code-10-nocycle-r1')]), {
    message: `outcome ${held1.id}.json: case code-10-nocycle-r1 records no cycle; give the case "cycle": 1`,
  });
  assert.equal(apply([taken('code-10-r1')]).outcomes.length, 1);
  // Two cycles give two units of the same issue, kind, and round; each case names the cycle of its own unit.
  const root = scratch();
  const source = escapeFixture();
  source.repository.issues = [];
  source.comments[10] = [
    { id: 1, createdAt: '2026-01-01T00:00:00Z', body: '### Code review round 1\n' },
    { id: 2, createdAt: '2026-01-02T00:00:00Z', body: '### Code review round 2\n- [HIGH] Bug - a.mjs:1 - broken.' },
    { id: 3, createdAt: '2026-01-03T00:00:00Z', body: '### Code review round 3\nNone.' },
    { id: 4, createdAt: '2026-01-04T00:00:00Z', body: '### Code review round 1 (cycle 2)\n' },
    {
      id: 5,
      createdAt: '2026-01-05T00:00:00Z',
      body: '### Code review round 2 (cycle 2)\n- [LOW] Bug - b.mjs:2 - other.',
    },
    { id: 6, createdAt: '2026-01-06T00:00:00Z', body: '### Code review round 3 (cycle 2)\nNone.' },
  ];
  put(root, 'source.json', source);
  const record = path.join(root, 'record.json');
  const manifest = path.join(root, 'manifest.md');
  const draw = ['draw', '--snapshot', path.join(root, 'source.json'), '--seed', 'test'];
  escapes.main([...draw, '--record', record, '--manifest', manifest]);
  const cycles = readJson(record).frozen.units.filter((unit) => unit.issue === 10 && unit.reviewer === 'code');
  assert.deepEqual(
    cycles.map((unit) => [unit.missed_round, unit.cycle]),
    [
      [1, 1],
      [1, 2],
    ],
  );
  const outcomesOf = (caseIds) =>
    cycles.map((unit, index) => fixture.outcome(unit, { outcome: 'taken', case: caseIds[index] }));
  const [first, second] = cycles;
  // Swapped cycles are refused; matching cycles are accepted.
  assert.throws(() => apply(outcomesOf(['code-10-c2-r1', 'code-10-r1']), readText(record), readText(manifest)), {
    message: /is a case of cycle 2, not cycle 1 of the unit/,
  });
  assert.equal(
    apply(outcomesOf(['code-10-r1', 'code-10-c2-r1']), readText(record), readText(manifest)).outcomes.length,
    2,
  );
  // A case named by two units is refused. The draw gives each unit its own cycle and round, so this needs a record that
  // holds two units with one identity.
  const twin = { ...first, id: `${first.id}-twin`, cycle: second.cycle };
  const crafted = { frozen: { units: [{ ...first, cycle: 2 }, twin] }, outcomes: [] };
  const craftedText = escapes.frozenJson(crafted);
  const craftedManifest = `- Restricted frozen record SHA-256: ${createHash('sha256').update(escapes.frozenJson(crafted.frozen)).digest('hex')}\n`;
  const twinOutcomes = crafted.frozen.units.map((unit) =>
    fixture.outcome(unit, { outcome: 'taken', case: 'code-10-c2-r1' }),
  );
  assert.throws(() => apply(twinOutcomes, craftedText, craftedManifest), {
    message: `case code-10-c2-r1 is named by units ${first.id} and ${twin.id}`,
  });
});
// `draw --commit` checks the blobs of the running escapes.mjs and outcomes.mjs against the commit, in the repository of
// the current folder, so the scripts can also run from a `git archive` of that commit (acceptance A4).
test('escape draw takes a --commit only when the running draw code is the code of that commit', () => {
  const root = scratch();
  const repo = path.join(root, 'repo');
  const scriptsPath = '.agents/skills/review-benchmark/scripts';
  const source = path.join(REPO_ROOT, scriptsPath);
  fs.mkdirSync(path.join(repo, scriptsPath), { recursive: true });
  for (const name of ['escapes.mjs', 'outcomes.mjs']) {
    fs.copyFileSync(path.join(source, name), path.join(repo, scriptsPath, name));
  }
  const git = (...args) => {
    const result = spawnSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
      {
        cwd: repo,
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-q');
  git('add', '.');
  git('commit', '-q', '-m', 'draw code');
  const commit = git('rev-parse', 'HEAD');
  put(root, 'source.json', escapeFixture());
  const draw = (script, given) =>
    spawnSync(
      BUN_RUNTIME,
      [script, 'draw', '--snapshot', path.join(root, 'source.json'), '--seed', 'test', '--commit', given],
      { cwd: repo, encoding: 'utf8' },
    );
  const checkout = path.join(repo, scriptsPath, 'escapes.mjs');
  // The checkout holds the code of the commit.
  const matched = draw(checkout, commit);
  assert.equal(matched.status, 0, matched.stderr);
  assert.ok(matched.stdout.includes(`- Draw script commit: ${commit}\n`));
  // The scripts of a `git archive` of the commit, outside the work tree, match too.
  const archive = path.join(root, 'archive');
  fs.mkdirSync(archive);
  const tar = spawnSync('sh', ['-c', `git archive ${commit} ${scriptsPath} | tar -x -C "${archive}"`], { cwd: repo });
  assert.equal(tar.status, 0);
  const extracted = draw(path.join(archive, scriptsPath, 'escapes.mjs'), commit);
  assert.equal(extracted.status, 0, extracted.stderr);
  assert.equal(extracted.stdout, matched.stdout);
  // A running outcomes.mjs that differs from the commit is refused, and so is an unknown commit.
  fs.appendFileSync(path.join(repo, scriptsPath, 'outcomes.mjs'), '// changed\n');
  for (const given of [commit, 'f'.repeat(40)]) {
    const refused = draw(checkout, given);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, new RegExp(`differs from ${scriptsPath} at ${given}`));
    assert.equal(refused.stdout, '');
  }
  // Without --commit, the draw takes the commit of the checkout and marks the changed code.
  const head = spawnSync(
    BUN_RUNTIME,
    [checkout, 'draw', '--snapshot', path.join(root, 'source.json'), '--seed', 'test'],
    {
      cwd: repo,
      encoding: 'utf8',
    },
  );
  assert.ok(head.stdout.includes(`- Draw script commit: ${commit}-dirty\n`));
});
