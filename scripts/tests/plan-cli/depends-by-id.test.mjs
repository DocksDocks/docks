import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePlan } from '../../../plugins/plan-lifecycle/skills/plan-manager/scripts/plan.mjs';
import { body, expectSuccess, planCliContext } from './harness.mjs';

// The display `1, a` holds a comma, so normalization keeps the Depends entry `fix_parser` as an id. Each consumer
// of Depends must resolve that id to its step.
const FIRST_ROW = '| 1 | fix_parser | Fix parser | src/parser.mjs | - | local | planned | Records round-trip |';
const commaRows = (secondFiles) =>
  [
    '| 1, a | fix_parser | Fix parser | src/parser.mjs | - | local | planned | Records round-trip |',
    `| 2 | parse_dates | Parse dates | ${secondFiles} | fix_parser | local | planned | Dates parse |`,
  ].join('\n');

test('normalization keeps a Depends id whose step display holds a comma', () => {
  const { body: normalized } = normalizePlan(body().replace(FIRST_ROW, commaRows('src/dates.mjs')));
  assert.match(normalized, /\| 2 \| parse_dates \| Parse dates \| src\/dates\.mjs \| fix_parser \|/);
});

test('step resolves a Depends id when it checks for an unfinished dependency', (t) => {
  const { run, createPlan } = planCliContext(t);
  const number = createPlan('depends by id', body().replace(FIRST_ROW, commaRows('src/dates.mjs')));
  expectSuccess(run('status', String(number), 'ongoing'), 'start plan');
  const early = run('step', String(number), 'parse_dates', 'in-flight');
  expectSuccess(early, 'start the dependent step before its dependency');
  assert.ok(
    early.stdout.includes('advice: step parse_dates has unfinished dependency fix_parser'),
    'an unfinished dependency named by id gets advice',
  );
  expectSuccess(run('step', String(number), 'parse_dates', 'planned'), 'move the dependent step back');
  expectSuccess(run('step', String(number), 'fix_parser', 'done'), 'finish the dependency');
  const late = run('step', String(number), 'parse_dates', 'in-flight');
  expectSuccess(late, 'start the dependent step after its dependency');
  assert.ok(
    !late.stdout.includes('unfinished dependency'),
    `a done dependency named by id is finished: ${late.stdout}`,
  );
});

test('shared-path advice follows a Depends id whose step display holds a comma', () => {
  const { advice } = normalizePlan(body().replace(FIRST_ROW, commaRows('src/parser.mjs')));
  assert.deepEqual(
    advice.filter((message) => message.includes(' share ')),
    [],
    'the Depends id orders the two steps that share src/parser.mjs',
  );
});
