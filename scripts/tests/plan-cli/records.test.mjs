import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { normalizePlan } from '../../../plugins/plan-lifecycle/skills/productivity/plan-manager/scripts/plan.mjs';
import { body, expectSuccess, planCliContext, refuse } from './harness.mjs';

test('new creates each missing plan label and keeps existing label metadata unchanged', (t) => {
  const { loadState, updateState, createPlan } = planCliContext(t);
  // Existing label metadata is not an input for new and must survive unchanged.
  const existingLabels = {
    plan: { color: '123456', description: 'Keep this color' },
    'plan:drafting': { color: 'abcdef', description: 'Keep this description' },
  };
  updateState((state) => {
    state.labels = structuredClone(existingLabels);
  });
  createPlan('labels already present');
  assert.deepEqual(
    Object.fromEntries(Object.entries(loadState().labels).filter(([name]) => name in existingLabels)),
    existingLabels,
    'new creates missing labels without changing existing metadata',
  );
  assert.deepEqual(
    Object.keys(loadState().labels).sort(),
    ['plan', 'plan:blocked', 'plan:drafting', 'plan:ongoing', 'plan:planned'],
    'new creates each missing plan label',
  );
  const allLabels = loadState().labels;
  createPlan('all labels already present');
  assert.deepEqual(loadState().labels, allLabels, 'repeating new leaves every existing label unchanged');
});

test('edit writes the normalized body to the remote issue and to the export provenance', (t) => {
  const { issue, createPlan, exported, edit } = planCliContext(t);
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
});

test('edit stores a body that quotes gh placeholder tokens unchanged, in one mutation request (#89)', (t) => {
  const { run, loadState, issue, createPlan, exported } = planCliContext(t);
  // The body travels as a gh `@file` field; gh would type-convert and placeholder-fill a plain -F value.
  const quoting = createPlan('placeholder tokens');
  const quoted = 'Run `gh api repos/{owner}/{repo}/branches/{branch}` or `gh api repos/:owner/:repo`.';
  const file = exported(quoting);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Not run.', quoted));
  const callsBefore = loadState().calls.length;
  expectSuccess(run('edit', String(quoting), '--file', file), 'edit a body that quotes placeholder tokens');
  const editCalls = loadState().calls.slice(callsBefore);
  assert.deepEqual(
    editCalls.map((call) => call.slice(0, 2).join(' ')),
    ['api graphql', 'issue view', 'api graphql'],
    'an edit sends the snapshot, the pre-write read, and one mutation request',
  );
  assert.equal(issue(quoting).body, body().replace('Not run.', quoted), 'the stored body keeps every token');
  const shown = run('show', String(quoting), '--body');
  expectSuccess(shown, 'show the body that quotes placeholder tokens');
  assert.equal(shown.stdout, issue(quoting).body, 'show reads the stored body back unchanged');
});

test('machine path advice names each distinct machine path and skips routes, portable paths, and slash text', () => {
  // Machine path advice names each distinct path into a home, a mount, a named temporary or runtime directory,
  // a Windows drive, or a network share. URL routes, portable system paths, and slash text get none (#71).
  const machinePathAdvice = (text) =>
    normalizePlan(body().replace('The parser loses mixed-case records.', text)).advice.filter((message) =>
      message.startsWith('body contains an absolute machine path'),
    );
  const named = (...paths) => paths.map((found) => `body contains an absolute machine path: ${found}`);
  for (const [text, expected] of [
    ['Clone into /home/<user>/projects/x.', named('/home/<user>/projects/x')],
    ['Open `/Users/<user>/src`.', named('/Users/<user>/src')],
    ['Read /root/.ssh/config and /mnt/data/x', named('/root/.ssh/config', '/mnt/data/x')],
    [
      'Mounts /media/<user>/usb, /run/media/<user>/usb, /Volumes/Data/x',
      named('/media/<user>/usb', '/run/media/<user>/usb', '/Volumes/Data/x'),
    ],
    ['Scratch `/tmp/<name>`, /var/tmp/x, /private/tmp/x', named('/tmp/<name>', '/var/tmp/x', '/private/tmp/x')],
    [
      'Temp /var/folders/ab/cd/T/x and /private/var/folders/ab/T/x',
      named('/var/folders/ab/cd/T/x', '/private/var/folders/ab/T/x'),
    ],
    ['XDG_RUNTIME_DIR=/run/user/1000/bus', named('/run/user/1000/bus')],
    [
      'Windows C:\\Users\\<user>\\x, D:/work/x, \\\\server\\share\\x',
      named('C:\\Users\\<user>\\x', 'D:/work/x', '\\\\server\\share\\x'),
    ],
    ['See [log](/home/<user>/log.txt) and file:///home/<user>/y', named('/home/<user>/log.txt', '/home/<user>/y')],
    ['Twice /home/a/x, /home/a/x then /tmp/y;', named('/home/a/x', '/tmp/y')],
    ['Routes /login/, `/wp-json/<namespace>/v1/items/123`, /search/transfer/user', []],
    ['TMPDIR=/tmp node t.mjs, /usr/bin/php8.5, #!/usr/bin/env node, x > /dev/null', []],
    ["Pick `A`/`B`, awk '/^## /{f=0}', __DIR__ . '/vendor/autoload.php'", []],
    ['URLs https://example.com/home/a and ssh://host/home/a', []],
    ['Portable ~/.local/state/docks/x, $HOME/x, bare /tmp, /tmp/ and /home/', []],
    ["Regex `'\\\\d+\\\\.'`", []],
  ])
    assert.deepEqual(machinePathAdvice(text), expected, text);
});

test('edit refuses step ids that collide after normalization and writes nothing', (t) => {
  const { issue, createPlan, edit } = planCliContext(t);
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
});

test('show reads a v3 record and the next edit writes it as v4', (t) => {
  const { run, issue, createPlan, edit } = planCliContext(t);
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
});

test('dependency normalization resolves a numeric step id and a second pass changes nothing', (t) => {
  const { issue, createPlan, edit } = planCliContext(t);
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
});

test('edit advises on steps that share a path only when no Depends chain links them (#78)', (t) => {
  const { createPlan, edit } = planCliContext(t);
  // Steps that edit the same path need a Depends chain, or parallel work collides (#78).
  const sharedFiles = createPlan('shared files');
  const sharedRows = [
    '| 1 | fix_parser | Fix parser | src/parser.mjs | - | local | planned | Records round-trip |',
    '| 2 | parse_dates | Parse dates | `src/parser.mjs`, src/dates.mjs | - | local | planned | Dates parse |',
    '| 3 | format_dates | Format dates | src/dates.mjs | parse_dates | local | planned | Dates format |',
    '| 4 | print_dates | Print dates | src/dates.mjs | format_dates | local | planned | Dates print |',
  ].join('\n');
  const sharedEdit = edit(sharedFiles, (text) =>
    text.replace(
      '| 1 | fix_parser | Fix parser | src/parser.mjs | - | local | planned | Records round-trip |',
      sharedRows,
    ),
  );
  expectSuccess(sharedEdit, 'edit with shared files');
  assert.deepEqual(
    sharedEdit.stdout.split('\n').filter((line) => line.includes(' share ')),
    ['advice: steps fix_parser and parse_dates share src/parser.mjs with no Depends link'],
    'only steps without a Depends chain get shared-path advice',
  );
});
