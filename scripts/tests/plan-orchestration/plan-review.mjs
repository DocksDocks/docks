import assert from 'node:assert/strict';

import { expectThrow } from './harness.mjs';

// A minimal plan carrying the structures the unit gate enumerates. Kept small on purpose: every
// case below edits exactly one thing, so a regression names itself.
function fixture({
  mechanisms = ['Alpha', 'Beta'],
  rows = ['A1', 'A2', 'A3'],
  declared = ['src/a.mjs'],
  depends = '-',
} = {}) {
  const mech = mechanisms.map((m) => `### ${m} {mechanism}\n\nProse for ${m}.\n`).join('\n');
  const acc = rows.map((id, i) => `| ${id} | claim ${i} | \`cmd ${id}\` |`).join('\n');
  return `---
title: fixture
affected_paths:
${declared.map((p) => `  - ${p}`).join('\n')}
---

## Goal

Ship it.

## Context & rationale

${mech}
## Steps

| # | Task | Files | Depends |
|---|---|---|---|
| 1 | first | \`src/a.mjs\` | ${depends} |

## Acceptance criteria

| ID | Claim | Command |
|---|---|---|
${acc}

## STOP conditions

None.
`;
}

export function registerPlanReview(suite, mod) {
  const G = 'plan-review';

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

  suite.test(G, 'a step may not depend on a later or absent step', () => {
    assert.equal(mod.scriptChecks(fixture()).P16.verdict, 'pass');
    assert.equal(mod.scriptChecks(fixture({ depends: '2' })).P16.verdict, 'fail', 'forward dependency');
    assert.equal(mod.scriptChecks(fixture({ depends: '9' })).P16.verdict, 'fail', 'absent dependency');
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
