import assert from 'node:assert/strict';

import { expectThrow } from './harness.mjs';

// A minimal plan carrying the structures the unit gate enumerates. Kept small on purpose: every
// case below edits exactly one thing, so a regression names itself.
function fixture({
  mechanisms = ['Alpha', 'Beta'],
  rows = ['A1', 'A2', 'A3'],
  declared = ['src/a.mjs'],
  depends = '-',
  includeIds = true,
  planPath = null,
  steps = null,
} = {}) {
  const mech = mechanisms.map((m) => `### ${m} {mechanism}\n\nProse for ${m}.\n`).join('\n');
  const acc = rows.map((id, i) => `| ${id} | claim ${i} | \`cmd ${id}\` |`).join('\n');
  const stepFixtures = steps ?? [
    { number: 1, id: 'first_step', task: 'first', files: '`src/a.mjs`', depends, guard: 'clear' },
  ];
  const stepHeader = includeIds
    ? '| # | Id | Task | Files | Depends | Done when / failure action |\n|---|---|---|---|---|---|'
    : '| # | Task | Files | Depends | Done when / failure action |\n|---|---|---|---|---|';
  const stepTable = stepFixtures
    .map((step) =>
      includeIds
        ? `| ${step.number} | ${step.id} | ${step.task} | ${step.files} | ${step.depends} | ${step.guard} |`
        : `| ${step.number} | ${step.task} | ${step.files} | ${step.depends} | ${step.guard} |`,
    )
    .join('\n');
  const record = planPath === null ? '' : `\nPlan-run: ${JSON.stringify({ plan_path: planPath })}\n`;
  return `---
title: fixture
affected_paths:
${declared.map((p) => `  - ${p}`).join('\n')}
---

## Goal

Ship it.
${record}

## Context & rationale

${mech}
## Steps

${stepHeader}
${stepTable}

## Acceptance criteria

| ID | Claim | Command |
|---|---|---|
${acc}

## STOP conditions

None.
`;
}

export function registerPlanSelfCheck(suite, mod) {
  const G = 'plan-self-check';

  suite.test(G, 'adjacent mechanism headings do not swallow the rest of the document', () => {
    const units = mod.enumerateUnits(fixture());
    assert.equal(units.named_mechanisms.length, 2, 'both mechanisms enumerate');
    const [alpha, beta] = units.named_mechanisms;
    assert.ok(!alpha.text.includes('## Steps'), 'the first mechanism must end at the second, not at end of file');
    assert.ok(!alpha.text.includes('Prose for Beta'), 'the first mechanism must not contain the second');
    assert.ok(beta.text.includes('Prose for Beta'), 'the second mechanism keeps its own body');
    assert.notEqual(alpha.sha256, beta.sha256);
  });

  suite.test(G, 'a mechanism digest ignores edits outside its own block', () => {
    const before = mod.enumerateUnits(fixture());
    const after = mod.enumerateUnits(fixture({ rows: ['A1', 'A2', 'A3', 'A4'] }));
    const pick = (u, id) => u.named_mechanisms.find((m) => m.id === id).sha256;
    assert.equal(pick(before, 'alpha'), pick(after, 'alpha'), 'adding an acceptance row must not reopen a mechanism');
    assert.equal(pick(before, 'beta'), pick(after, 'beta'));
  });

  suite.test(G, 'editing one acceptance row invalidates only that row', () => {
    const before = mod.enumerateUnits(fixture());
    const after = mod.enumerateUnits(fixture({ rows: ['A1', 'A2edited', 'A3'] }));
    const map = (u) => new Map(u.acceptance_rows.map((r) => [r.id, r.sha256]));
    const [b, a] = [map(before), map(after)];
    assert.equal(b.get('A1'), a.get('A1'), 'an untouched row keeps its digest');
    assert.equal(b.get('A3'), a.get('A3'), 'an untouched row keeps its digest');
    assert.ok(!a.has('A2'), 'the edited row is no longer the same unit');
  });

  suite.test(G, 'mechanisms are declared, never inferred from heading depth', () => {
    const plan = fixture().replace('### Alpha {mechanism}', '### Alpha');
    const units = mod.enumerateUnits(plan);
    assert.deepEqual(
      units.named_mechanisms.map((m) => m.id),
      ['beta'],
      'an unmarked heading is not a mechanism',
    );
  });

  suite.test(G, 'declaring no mechanism fails the vacuity guard', () => {
    const none = fixture().replaceAll(' {mechanism}', '');
    assert.equal(mod.scriptChecks(none).P19.verdict, 'fail', 'an empty mechanism set would pass every probe property');
    assert.equal(mod.scriptChecks(fixture()).P19.verdict, 'pass');
  });

  suite.test(G, 'declared paths must match the paths the steps touch', () => {
    assert.equal(mod.scriptChecks(fixture()).P13.verdict, 'pass');
    const extra = mod.scriptChecks(fixture({ declared: ['src/a.mjs', 'src/never-touched.mjs'] }));
    assert.equal(extra.P13.verdict, 'fail', 'a declared but untouched path is a scope mismatch');
    assert.match(extra.P13.reason, /untouched/);
  });

  suite.test(G, 'numeric Depends keeps its earlier-display-number semantics with an Id column', () => {
    const steps = (dependency) => [
      { number: 1, id: 'prepare', task: 'prepare', files: '`src/a.mjs`', depends: '-', guard: 'clear' },
      { number: 2, id: 'apply', task: 'apply', files: '`src/a.mjs`', depends: dependency, guard: 'clear' },
      { number: 3, id: 'verify', task: 'verify', files: '`src/a.mjs`', depends: '2', guard: 'clear' },
    ];
    assert.equal(mod.scriptChecks(fixture({ steps: steps('1') })).P16.verdict, 'pass', 'earlier display number');
    for (const [dependency, diagnostic] of [
      ['9', /does not exist/],
      ['2', /not earlier/],
      ['3', /not earlier/],
    ]) {
      const result = mod.scriptChecks(fixture({ steps: steps(dependency) })).P16;
      assert.equal(result.verdict, 'fail', `dependency ${dependency}`);
      assert.match(result.reason, diagnostic);
    }
  });

  suite.test(G, 'new plans require stable step identifiers', () => {
    const result = mod.stepIdentifierDiagnostics(fixture({ includeIds: false }));
    assert.equal(result.advisories.length, 0);
    assert.ok(result.errors.some((detail) => /new plans require Id immediately after #/.test(detail)));
    assert.equal(mod.scriptChecks(fixture({ includeIds: false })).P20.verdict, 'fail');
  });

  suite.test(G, 'the frozen grandfather set receives only a missing-Id advisory', () => {
    const grandfathered = [
      'docs/plans/active/lifecycle-dispatch-integrity.md',
      'docs/plans/active/plan-lifecycle-plugin-extraction.md',
      'docs/plans/active/relay-fanout-reaper-reporting.md',
      'docs/plans/finished/2026-08-02-session-relay-0.15.0-release.md',
      'docs/plans/active/step-ids-and-class-budget.md',
    ];
    for (const planPath of grandfathered) {
      const plan = fixture({ includeIds: false, planPath });
      const result = mod.stepIdentifierDiagnostics(plan);
      assert.deepEqual(result.errors, [], planPath);
      assert.equal(result.advisories.length, 1, planPath);
      assert.equal(mod.scriptChecks(plan).P20.verdict, 'pass', planPath);
      assert.equal(mod.scriptChecks(plan).P20.advisory, true, planPath);
    }
  });

  suite.test(G, 'a frozen plan reads its Plan-run record from the Review section', () => {
    const planPath = 'docs/plans/finished/2026-08-02-session-relay-0.15.0-release.md';
    const plan = `${fixture({ includeIds: false })}
## Review

Plan-run: ${JSON.stringify({ plan_path: planPath })}
`;
    const result = mod.stepIdentifierDiagnostics(plan);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.advisories, [
      `Steps table has no Id column for ${planPath}; grandfathered plan keeps numeric display identifiers`,
    ]);
    assert.equal(mod.scriptChecks(plan).P20.verdict, 'pass');
    assert.equal(mod.scriptChecks(plan).P20.advisory, true);
  });

  suite.test(G, 'known guard step identifiers pass and enumerate by stable Id', () => {
    const plan = fixture({
      steps: [
        { number: 1, id: 'prepare', task: 'prepare', files: '`src/a.mjs`', depends: '-', guard: 'clear' },
        {
          number: 2,
          id: 'verify',
          task: 'verify',
          files: '`src/a.mjs`',
          depends: '1',
          guard: 'run after step:prepare',
        },
      ],
    });
    assert.deepEqual(mod.stepIdentifierDiagnostics(plan), { errors: [], advisories: [] });
    assert.deepEqual(
      mod.enumerateUnits(plan).steps_rows.map((row) => row.id),
      ['prepare', 'verify'],
    );
  });

  suite.test(G, 'duplicate and unknown guard step identifiers fail by name', () => {
    const duplicate = fixture({
      steps: [
        { number: 1, id: 'same', task: 'first', files: '`src/a.mjs`', depends: '-', guard: 'clear' },
        { number: 2, id: 'same', task: 'second', files: '`src/a.mjs`', depends: '1', guard: 'clear' },
      ],
    });
    assert.ok(mod.stepIdentifierDiagnostics(duplicate).errors.some((detail) => /duplicate step Id same/.test(detail)));
    const unknown = fixture({
      steps: [
        {
          number: 1,
          id: 'known',
          task: 'first',
          files: '`src/a.mjs`',
          depends: '-',
          guard: 'after step:missing',
        },
      ],
    });
    assert.ok(
      mod.stepIdentifierDiagnostics(unknown).errors.some((detail) => /unknown guard step Id missing/.test(detail)),
    );
  });

  suite.test(G, 'numeric guard citations are rejected as renumber-sensitive', () => {
    const plan = fixture({
      steps: [
        {
          number: 1,
          id: 'known',
          task: 'first',
          files: '`src/a.mjs`',
          depends: '-',
          guard: 'failure: return to step 1',
        },
      ],
    });
    const result = mod.stepIdentifierDiagnostics(plan);
    assert.ok(result.errors.some((detail) => /numeric guard citation step 1; use step:<id>/.test(detail)));
  });

  suite.test(G, 'a return carrying a score is refused', () => {
    const plan = fixture();
    const problems = mod.validateReturn({ score: 91, verdicts: [] }, plan);
    assert.ok(
      problems.some((p) => /score/.test(p)),
      'the protocol has no scalar; accepting one reintroduces the gate that was measured to be a coin',
    );
  });

  suite.test(G, 'replaced_text must appear exactly once', () => {
    const plan = fixture();
    const one = mod.validateReturn(
      {
        verdicts: [
          {
            property: 'P8',
            unit: 'A1',
            verdict: 'fail',
            reason: 'r',
            replaced_text: '| A1 | claim 0 | `cmd A1` |',
            replacement_text: 'x',
          },
        ],
      },
      plan,
    );
    assert.ok(!one.some((p) => /replaced_text/.test(p)), 'a unique quote is accepted');
    const missing = mod.validateReturn(
      {
        verdicts: [
          {
            property: 'P8',
            unit: 'A1',
            verdict: 'fail',
            reason: 'r',
            replaced_text: 'text that is absent',
            replacement_text: 'x',
          },
        ],
      },
      plan,
    );
    assert.ok(
      missing.some((p) => /matches 0 times/.test(p)),
      'a stale quote is refused',
    );
    const twice = mod.validateReturn(
      {
        verdicts: [
          {
            property: 'P8',
            unit: 'A1',
            verdict: 'fail',
            reason: 'r',
            replaced_text: '|---|---|---|',
            replacement_text: 'x',
          },
        ],
      },
      plan,
    );
    assert.ok(
      twice.some((p) => /matches 2 times/.test(p)),
      'an ambiguous quote is refused',
    );
  });

  suite.test(G, 'a verdict naming an unenumerated unit is refused', () => {
    const problems = mod.validateReturn(
      { verdicts: [{ property: 'P8', unit: 'A99', verdict: 'pass', reason: 'r' }] },
      fixture(),
    );
    assert.ok(problems.some((p) => /A99 is not an enumerated unit/.test(p)));
  });

  suite.test(G, 'not_applicable without a reason is refused', () => {
    const problems = mod.validateReturn(
      { verdicts: [{ property: 'P8', unit: 'A1', verdict: 'not_applicable', reason: '' }] },
      fixture(),
    );
    assert.ok(problems.some((p) => /requires a reason/.test(p)));
  });

  suite.test(G, 'an unjudged unit blocks, and a waiver clears exactly one unit', () => {
    const plan = fixture();
    const merged = mod.mergeLedger(
      {},
      { verdicts: [{ property: 'P8', unit: 'A1', verdict: 'fail', reason: 'no observable' }] },
      plan,
    );
    const first = mod.gate(merged, plan);
    assert.equal(first.clear, false);
    assert.ok(
      first.blocking.some((b) => /P8\|acceptance_rows:A1: fail/.test(b)),
      'the failing unit blocks',
    );
    assert.ok(
      first.blocking.some((b) => /acceptance_rows:A2: never judged/.test(b)),
      'an unjudged unit blocks',
    );
    merged.units['P8|acceptance_rows:A1'].waiver = { reason: 'accepted', by: 'tester' };
    const after = mod.gate(merged, plan);
    assert.ok(!after.blocking.some((b) => b.startsWith('P8|acceptance_rows:A1')), 'the waived unit stops blocking');
    assert.ok(
      after.blocking.some((b) => b.startsWith('P8|acceptance_rows:A2')),
      'a waiver clears one unit, not the set',
    );
  });

  suite.test(G, 'a verdict judged against different bytes is reopened', () => {
    const plan = fixture();
    const merged = mod.mergeLedger(
      {},
      { verdicts: [{ property: 'P8', unit: 'A1', verdict: 'pass', reason: 'ok' }] },
      plan,
    );
    assert.ok(
      !mod.gate(merged, plan).blocking.some((b) => b.startsWith('P8|acceptance_rows:A1')),
      'a pass on unchanged bytes stays clear',
    );
    const edited = plan.replace('| A1 | claim 0 |', '| A1 | claim 0 EDITED |');
    assert.ok(
      mod.gate(merged, edited).blocking.some((b) => b.startsWith('P8|acceptance_rows:A1') && /re-judge/.test(b)),
      'a pass must not survive an edit to the unit it judged',
    );
  });

  suite.test(G, 'a probe outside the repository blocks the gate', () => {
    const plan = fixture();
    const ledger = mod.mergeLedger({}, { verdicts: [] }, plan);
    ledger.probes = ['/home/somebody/measure/spike.mjs'];
    assert.ok(
      mod.gate(ledger, plan).blocking.some((b) => /not repository-relative/.test(b)),
      'evidence a cold implementer cannot run is not evidence',
    );
  });

  suite.test(G, 'fixes apply in order and refuse a stale anchor', () => {
    const plan = fixture();
    const { text, applied } = mod.applyFixes(
      {
        apply_order: ['f1'],
        verdicts: [
          {
            id: 'f1',
            property: 'P8',
            unit: 'A1',
            verdict: 'fail',
            reason: 'r',
            replaced_text: 'claim 0',
            replacement_text: 'claim zero',
          },
        ],
      },
      plan,
    );
    assert.equal(applied.length, 1);
    assert.ok(text.includes('claim zero'));
    expectThrow(
      () =>
        mod.applyFixes(
          { apply_order: ['f1'], verdicts: [{ id: 'f1', replaced_text: 'absent text', replacement_text: 'x' }] },
          plan,
        ),
      /matches 0 times/,
    );
  });

  suite.test(G, 'the ledger records who judged, and the gate reports the distribution', () => {
    const plan = fixture();
    let led = mod.mergeLedger({}, { verdicts: [{ property: 'P8', unit: 'A1', verdict: 'pass', reason: 'ok' }] }, plan, {
      reviewer: 'alpha',
    });
    assert.equal(led.units['P8|acceptance_rows:A1'].reviewer, 'alpha', 'the label is stored per verdict');
    led = mod.mergeLedger(led, { verdicts: [{ property: 'P8', unit: 'A2', verdict: 'pass', reason: 'ok' }] }, plan, {
      reviewer: 'beta',
    });
    const { reviewers } = mod.gate(led, plan);
    assert.deepEqual(reviewers, { alpha: 1, beta: 1 }, 'the gate reports passing units per reviewer');
  });

  suite.test(G, 'an unlabelled reviewer is reported, not rejected', () => {
    // A consumer with one provider configured must still be able to clear this gate.
    const plan = fixture();
    const led = mod.mergeLedger(
      {},
      { verdicts: [{ property: 'P8', unit: 'A1', verdict: 'pass', reason: 'ok' }] },
      plan,
    );
    const { reviewers, blocking } = mod.gate(led, plan);
    assert.deepEqual(reviewers, { '(unlabelled)': 1 });
    assert.ok(!blocking.some((b) => /reviewer/.test(b)), 'missing provenance never blocks');
  });

  suite.test(G, 'a script-decided property is never asked of the model', () => {
    const plan = fixture();
    const prompt = mod.buildPrompt(plan);
    assert.ok(!prompt.includes('P16'), 'the step-ordering property is decided by script and must not be asked');
    assert.ok(!prompt.includes('P19'), 'the vacuity guard is decided by script and must not be asked');
    assert.ok(prompt.includes('P9'), 'genuinely judged properties are still asked');
    const problems = mod.validateReturn(
      { verdicts: [{ property: 'P16', unit: '1', verdict: 'fail', reason: 'r' }] },
      plan,
    );
    assert.ok(
      problems.some((p) => /decided by script/.test(p)),
      'a model verdict for a decided property is refused, or it can contradict the script check',
    );
  });

  suite.test(G, 'a hunt entry with an empty note is refused', () => {
    const plan = fixture();
    const empty = mod.validateReturn({ verdicts: [], hunt: [{ id: 'h1', severity: 'info', note: '   ' }] }, plan);
    assert.ok(
      empty.some((p) => /empty note/.test(p)),
      'an entry naming no defect would block the gate forever with nothing to act on',
    );
    const real = mod.validateReturn(
      { verdicts: [], hunt: [{ id: 'h1', severity: 'info', note: 'a real defect' }] },
      plan,
    );
    assert.ok(!real.some((p) => /empty note/.test(p)));
  });

  suite.test(G, 'the hunt prompt supplies no rubric', () => {
    const plan = fixture();
    const hunt = mod.buildPrompt(plan, { hunt: true });
    assert.ok(!hunt.includes('P8'), 'a hunt pass must not be anchored to the rubric it exists to escape');
    assert.ok(mod.buildPrompt(plan).includes('P8'), 'the rubric prompt does name its properties');
  });
}
