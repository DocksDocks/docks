import assert from 'node:assert/strict';
import test from 'node:test';
import { body, expectSuccess, planCliContext, refuse } from './harness.mjs';

test('a fenced example table or Mode line is never live, and a duplicate section heading blocks the write', (t) => {
  const { run, issue, createPlan, edit } = planCliContext(t);
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
});

test('a fenced block that ends a section survives normalization with either fence style', (t) => {
  const { issue, createPlan, edit } = planCliContext(t);
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
});
