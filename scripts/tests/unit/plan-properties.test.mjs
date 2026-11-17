import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import {
  normalizePlan,
  parsePlan,
  parseReviewComment,
} from '../../../plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs';

// Property tests for the pure parsers of the plan helper (#133, D3). fast-check prints the seed and the
// shrunk counterexample of a failing run; pass that seed to fc.assert to replay it. With 2000 runs, the
// idempotence property finds both fixed normalization defects: a padded code span in an Id, Effect, or Status
// cell, and an id that resolves to a display with a comma. The file runs in under a second.
const NUM_RUNS = 2000;
const STEPS_HEADER = '| # | Id | Task | Files | Depends | Effect | Status | Done when |';
const STEPS_SEPARATOR = '|---:|---|---|---|---|---|---|---|';
const ACCEPTANCE_HEADER = '| ID | Command | Expected |';
const ACCEPTANCE_SEPARATOR = '|---|---|---|';
const SECTIONS = ['Goal', 'Research', 'Steps', 'Acceptance', 'Do not touch', 'Open questions', 'Verification Results'];
// A line that the helper reads as a section heading or as a fence opener. Normalization turns an em dash into
// ` - ` and then folds space runs on that line, so a prose line is checked after that change too.
const SECTION_HEADING = /^ {0,3}##[ \t]/;
const FENCE = /^ {0,3}(?:`{3,}|~{3,})/;
const structural = (line) =>
  [line, line.includes('\u2014') ? line.replaceAll('\u2014', ' - ').replace(/ {2,}/g, ' ') : line].some(
    (form) => SECTION_HEADING.test(form) || FENCE.test(form),
  );

const row = (cells, compact = false) => (compact ? `|${cells.join('|')}|` : `| ${cells.join(' | ')} |`);
const letterCase = fc.constantFrom(
  (text) => text,
  (text) => text.toLowerCase(),
  (text) => text.toUpperCase(),
);

// Plan prose: words, Markdown marks, escaped and bare pipes, em dashes, Mode lines, and machine paths.
// It holds no section heading and no fence opener, so every fence that a plan holds is closed.
const proseLine = fc
  .string({
    unit: fc.constantFrom(
      'word',
      'Mode:',
      'mode: ',
      'plan-and-implement',
      'Plan-Only',
      ' ',
      '  ',
      '\t',
      '\u2014',
      '|',
      '\\|',
      '\\',
      '`',
      '*',
      '#',
      '-',
      '1.',
      '/home/user/x',
    ),
    maxLength: 8,
  })
  .filter((line) => !structural(line));
const fencedBlock = fc
  .tuple(
    fc.constantFrom('```', '````', '~~~', '```js'),
    fc.array(
      fc.oneof(proseLine, fc.constantFrom('## Research', '## Unknown', 'Mode: plan-and-implement', STEPS_HEADER)),
      { maxLength: 3 },
    ),
  )
  .map(([open, lines]) => [open, ...lines, open.replace(/[a-z]+$/, '')]);
// Random cells rarely repeat, so half of the cells come from a small set. Ids, displays, and Depends parts then
// refer to each other, and code spans with inner spaces reach the Id, Effect, and Status cells.
const tableCell = fc.oneof(
  fc.string({
    unit: fc.constantFrom(
      'a',
      'B',
      '1',
      '-',
      '_',
      ',',
      ' ',
      '`',
      '\\|',
      '\u2014',
      'local',
      'Done',
      'in-flight',
      'fix-it',
    ),
    maxLength: 5,
  }),
  fc.constantFrom(
    '',
    '-',
    '1',
    '2',
    ',',
    '1, 2',
    'fix-it',
    'Fix_It',
    '`fix-it`',
    '` fix-it`',
    '` `',
    '`local `',
    'done',
  ),
);
const tableBlock = (header, separator, width) =>
  fc
    .record({
      header: fc.constantFrom(header, header.toLowerCase()),
      separator: fc.boolean(),
      rows: fc.array(fc.array(tableCell, { minLength: width - 1, maxLength: width + 1 }), { maxLength: 4 }),
      compact: fc.boolean(),
    })
    .map(({ header: shown, separator: withSeparator, rows, compact }) => [
      shown,
      ...(withSeparator ? [separator] : []),
      ...rows.map((cells) => row(cells, compact)),
    ]);
const sectionContent = (name) =>
  fc
    .array(
      fc.oneof(
        fc.array(proseLine, { minLength: 1, maxLength: 3 }),
        fencedBlock,
        ...(name === 'Steps' ? [tableBlock(STEPS_HEADER, STEPS_SEPARATOR, 8)] : []),
        ...(name === 'Acceptance' ? [tableBlock(ACCEPTANCE_HEADER, ACCEPTANCE_SEPARATOR, 3)] : []),
      ),
      { maxLength: 3 },
    )
    .map((blocks) => blocks.flat());
// A plan body with any subset of the known sections and the retired Review section, in any order and letter case.
const planBody = fc
  .record({
    preamble: fc.array(proseLine, { maxLength: 2 }),
    names: fc.shuffledSubarray([...SECTIONS, 'Review']),
    lineEnding: fc.constantFrom('\n', '\r\n'),
  })
  .chain(({ preamble, names, lineEnding }) =>
    fc
      .tuple(
        ...names.map((name) =>
          fc
            .record({ shown: letterCase, indent: fc.constantFrom('', ' ', '   '), content: sectionContent(name) })
            .map(({ shown, indent, content }) => [`${indent}## ${shown(name)}`, ...content]),
        ),
      )
      .map((sections) => [...preamble, ...sections.flat()].join(lineEnding)),
  );

test('normalization is idempotent', () => {
  fc.assert(
    fc.property(planBody, (text) => {
      const once = normalizePlan(text).body;
      assert.equal(normalizePlan(once).body, once);
    }),
    { numRuns: NUM_RUNS },
  );
});

// A cell holds a pipe only as `\|` and a backslash only as `\\` or inside `\|`, so each cell is valid GFM text.
// A cell can end in `\\`, so a compact row puts an escaped backslash right before a delimiter pipe.
const roundTripCell = fc
  .string({
    unit: fc.constantFrom('a', 'Z', '0', ' ', '-', ':', '#', '*', '`', '\\|', '\\\\'),
    maxLength: 6,
  })
  .map((cell) => cell.trim());

test('table cells with escaped pipes round-trip through normalization', () => {
  fc.assert(
    fc.property(
      fc.array(fc.tuple(roundTripCell, roundTripCell, roundTripCell), { minLength: 1, maxLength: 3 }),
      fc.array(fc.tuple(roundTripCell, roundTripCell, roundTripCell), { minLength: 1, maxLength: 3 }),
      fc.boolean(),
      (stepCells, acceptance, compact) => {
        const text = [
          '<!-- plan-contract: v4 -->',
          '## Goal',
          'Fix the parser.',
          'Mode: plan-and-implement',
          '## Steps',
          STEPS_HEADER,
          STEPS_SEPARATOR,
          ...stepCells.map(([task, files, doneWhen], index) =>
            row([`${index + 1}`, `s${index + 1}`, task, files, '-', 'local', 'planned', doneWhen], compact),
          ),
          '## Acceptance',
          ACCEPTANCE_HEADER,
          ACCEPTANCE_SEPARATOR,
          ...acceptance.map((cells) => row(cells, compact)),
        ].join('\n');
        const parsed = parsePlan(text),
          normalized = parsePlan(normalizePlan(text).body);
        const stepTexts = (plan) => plan.steps.map(({ task, files, doneWhen }) => [task, files, doneWhen]);
        assert.deepEqual(stepTexts(parsed), stepCells);
        assert.deepEqual(parsed.acceptance, acceptance);
        assert.deepEqual(stepTexts(normalized), stepCells);
        assert.deepEqual(normalized.acceptance, acceptance);
      },
    ),
    { numRuns: NUM_RUNS },
  );
});

// Review comments follow plan-contract.md, Phases and review comments.
const ALIASES = ['pass', 'ok', 'approved', 'repair', 'changes', 'fixes-required', 'blocked'];
const SEVERITY = { pass: 0, repair: 1, 'fixes-required': 1, blocked: 2 };
const verdictFor = (kind, alias) => {
  if (['pass', 'ok', 'approved'].includes(alias)) return 'pass';
  if (alias === 'blocked') return 'blocked';
  return kind === 'plan' ? 'repair' : 'fixes-required';
};
const SEVERE_FINDING = '- [HIGH] src/a.mjs:4 - data loss - fix';
const reviewBlock = (first) =>
  fc.record({
    hashes: fc.constantFrom(...(first ? ['', '#', '##'] : ['#', '##'])),
    level: fc.constantFrom('#', '##', '###', '####'),
    indent: fc.constantFrom('', ' ', '   '),
    kindCase: letterCase,
    suffix: fc.constantFrom('', ' round 2', ' round 1, lens correctness', ' - 2026-11-17'),
    // A block after the first may have no verdict line; it then belongs to the block before it.
    verdict: first ? fc.constantFrom(...ALIASES) : fc.option(fc.constantFrom(...ALIASES), { nil: undefined }),
    verdictCase: letterCase,
    separator: fc.constantFrom('-', ' '),
    tail: fc.constantFrom('', '.', ' (round 2)'),
    before: fc.array(fc.constantFrom('None.', 'The step lacks a test.', '## Standards', 'OTHER-review: blocked'), {
      maxLength: 2,
    }),
    after: fc.array(
      fc.constantFrom('None.', '- [low] src/a.mjs:3 - the name is unclear - rename', 'KIND-review: blocked'),
      { maxLength: 2 },
    ),
    severe: fc.boolean(),
  });
const reviewModel = fc.record({
  kind: fc.constantFrom('plan', 'code'),
  blocks: fc
    .tuple(reviewBlock(true), fc.array(reviewBlock(false), { maxLength: 3 }))
    .map(([head, rest]) => [head, ...rest]),
});
const MARKS = ['**', '*', '_', '__', '`'];
const wrap = (text, mark) => (mark ? `${mark}${text}${mark}` : text);
const markChoice = fc.option(fc.constantFrom(...MARKS), { nil: undefined });
// A decoration keeps the block structure: marks go around kind and verdict words, and quote or list markers go
// only on verdict lines, never on heading lines.
const decoration = fc.record({
  headingWords: fc.constantFrom('phrase', 'words'),
  headingMark: markChoice,
  verdictKindWords: fc.constantFrom('label', 'label-colon', 'words'),
  verdictKindMark: markChoice,
  verdictMark: markChoice,
  quotes: fc.array(fc.constantFrom('>', '> ', '>> '), { maxLength: 2 }).map((quotes) => quotes.join('')),
  listMarker: fc.constantFrom('', '- ', '+ ', '* ', '1. ', '2) '),
});

function renderReview({ kind, blocks }, decorations) {
  const other = kind === 'plan' ? 'code' : 'plan';
  return blocks
    .flatMap((block, index) => {
      const decor = decorations?.[index];
      const words = block.kindCase(`${kind} review`);
      const kindTitle = !decor
        ? words
        : decor.headingWords === 'phrase'
          ? wrap(words, decor.headingMark)
          : words
              .split(' ')
              .map((word) => wrap(word, decor.headingMark))
              .join(' ');
      const hashes = index === 0 ? block.hashes : block.level;
      const heading = `${block.indent}${hashes}${hashes ? ' ' : ''}${kindTitle}${block.suffix}`;
      const lines = [heading, ...block.before.map((line) => line.replace('OTHER', other))];
      if (block.verdict !== undefined) {
        const label = block.kindCase(`${kind}${block.separator}review`);
        const word = block.verdictCase(block.verdict);
        let verdictLine = `${label}: ${word}${block.tail}`;
        if (decor) {
          const kindPart =
            decor.verdictKindWords === 'label'
              ? `${wrap(label, decor.verdictKindMark)}:`
              : decor.verdictKindWords === 'label-colon'
                ? wrap(`${label}:`, decor.verdictKindMark)
                : `${label
                    .split(block.separator)
                    .map((part) => wrap(part, decor.verdictKindMark))
                    .join(block.separator)}:`;
          verdictLine = `${decor.quotes}${decor.listMarker}${kindPart} ${wrap(word, decor.verdictMark)}${block.tail}`;
        }
        lines.push(verdictLine, ...block.after.map((line) => line.replace('KIND', kind)));
      }
      if (block.severe) lines.push(SEVERE_FINDING);
      return [...lines, ''];
    })
    .join('\n');
}

function expectedReview({ kind, blocks }) {
  const verdicts = blocks
    .filter((block) => block.verdict !== undefined)
    .map((block) => verdictFor(kind, block.verdict));
  let verdict = verdicts.reduce((worst, next) => (SEVERITY[next] > SEVERITY[worst] ? next : worst));
  if (kind === 'code' && verdict === 'pass' && blocks.some((block) => block.severe)) verdict = 'fixes-required';
  return { kind, verdict };
}

test('review verdicts are invariant under emphasis, code marks, and verdict-line quote and list markers', () => {
  fc.assert(
    fc.property(
      reviewModel.chain((model) =>
        fc.tuple(
          fc.constant(model),
          fc.array(decoration, { minLength: model.blocks.length, maxLength: model.blocks.length }),
        ),
      ),
      ([model, decorations]) => {
        const expected = expectedReview(model);
        assert.deepEqual(parseReviewComment(renderReview(model)), expected);
        assert.deepEqual(parseReviewComment(renderReview(model, decorations)), expected);
      },
    ),
    { numRuns: NUM_RUNS },
  );
});
