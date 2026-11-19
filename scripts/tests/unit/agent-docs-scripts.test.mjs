// Spec tests for the shipped agent-docs scripts (plan #169). Each expected line was recorded by running the
// current shell block of the skill once with bash on the same fixture (LC_ALL=C, so `sort` and globs use byte
// order). A comment names each intentional difference of the script contract:
// (a) no node_modules nodes, (b) exit 2 on ERROR, (c) non-git prune sets, (d) labeled audit lines, (e) --expect lines,
// (f) an ERROR line for a failed listing or an unreadable file, and raw non-ASCII paths, where the block went on.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, test } from 'node:test';

const PLUGINS = path.resolve(import.meta.dirname, '../../../plugins');
const PR_TEMPLATE = path.join(PLUGINS, 'plan-lifecycle/skills/plan-workspace/scripts/pr-template.mjs');
const VERIFY = path.join(PLUGINS, 'plan-lifecycle/skills/plan-workspace/scripts/verify-skill.mjs');
const AGENT_FIRST = path.join(PLUGINS, 'docks/skills/agent-first-setup/scripts/agent-first-check.mjs');
const BRIDGE = path.join(PLUGINS, 'docks/skills/multi-tool-bridge/scripts/bridge-check.mjs');

// A mode-0 file or folder blocks nobody when the tests run as root.
const IS_ROOT = process.getuid?.() === 0;

const created = [];
afterEach(() => {
  for (const { dir, locked } of created.splice(0)) {
    for (const p of locked) fs.chmodSync(p, 0o700);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Build one fixture folder. `files` maps a path to its text (undefined skips the entry), `links` maps a path to
// its symlink target, `dirs` lists empty folders, `modes` maps a path to the mode it gets last.
function fixture({ git = true, files = {}, links = {}, dirs = [], modes = {} } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-docs-')));
  const entry = { dir, locked: [] };
  created.push(entry);
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    // The global ignore file ($XDG_CONFIG_HOME/git/ignore) applies also without a global config file.
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.excludesFile',
    GIT_CONFIG_VALUE_0: '/dev/null',
    // Outside git, no repository above the fixture may answer `git rev-parse`.
    GIT_CEILING_DIRECTORIES: path.dirname(dir),
  };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[name];
  if (git) {
    const init = spawnSync('git', ['init', '-q'], { cwd: dir, env, encoding: 'utf8' });
    assert.equal(init.status, 0, `git init: ${init.stderr}`);
  }
  const at = (p) => {
    const abs = path.join(dir, p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    return abs;
  };
  for (const d of dirs) fs.mkdirSync(path.join(dir, d), { recursive: true });
  for (const [p, text] of Object.entries(files)) if (text !== undefined) fs.writeFileSync(at(p), text);
  for (const [p, target] of Object.entries(links)) fs.symlinkSync(target, at(p));
  for (const [p, mode] of Object.entries(modes)) {
    fs.chmodSync(path.join(dir, p), mode);
    entry.locked.push(path.join(dir, p));
  }
  return { dir, env };
}

function run(script, args, fx, sub = '') {
  const result = spawnSync('node', [script, ...args], { cwd: path.join(fx.dir, sub), env: fx.env, encoding: 'utf8' });
  const lines = result.stdout === '' ? [] : result.stdout.replace(/\n$/u, '').split('\n');
  return { status: result.status, lines, stderr: result.stderr };
}

function expectRun(result, status, lines) {
  assert.deepEqual({ status: result.status, lines: result.lines }, { status, lines }, `stderr: ${result.stderr}`);
}

// An ERROR line comes with exit 2 and the failing tool's message on stderr.
function expectError(result, lines) {
  expectRun(result, 2, lines);
  assert.notEqual(result.stderr, '', 'an ERROR line names its cause on stderr');
}

const STALE = 'Pointers here name concepts; check each one before you trust it.\n';
const ROOT_AGENTS = `# Repo\n\nBuild with \`make build\`, test with \`make test\`, and lint with \`make lint\`.\n\n${STALE}`;
const routed = (...nodes) =>
  `${ROOT_AGENTS}\n## Context tree\n\n| Node | Scope |\n|---|---|\n${nodes.map((n) => `| \`${n}\` | folder |\n`).join('')}`;
const skill = (name, description) => `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;
const VERIFY_SKILL = `${skill('verify', '"Use when checking this repository end to end."')}
| Id | Flow | Command | Expected result |
|---|---|---|---|
| V1 | Build | \`make build\` | exit 0 |
`;
const MARKED_SKILL = `${skill('verify', '"Use when checking this repository end to end."')}
| Id | Flow | Command | Expected result |
|---|---|---|---|
| V1 | Build | \`make build\` | not observed: expect exit 0 |
| V2 | Test | \`make test\` | not observed: expect exit 0; got make: *** [test] Error 1 |
`;
const MARKS = [
  '10:| V1 | Build | `make build` | not observed: expect exit 0 |',
  '11:| V2 | Test | `make test` | not observed: expect exit 0; got make: *** [test] Error 1 |',
];
const VERIFY_LINK = { '.claude/skills/verify': '../../.agents/skills/verify' };
const TEST_SKILL = skill('x', '"Use when testing."');

// A repository that passes every agent-first check; each check test adds or removes entries.
const BASE_FILES = {
  'AGENTS.md': ROOT_AGENTS,
  '.agents/skills/verify/SKILL.md': VERIFY_SKILL,
  '.github/pull_request_template.md': '## Checklist\n',
};
const BASE = { files: BASE_FILES, links: VERIFY_LINK };

// One non-git folder for both skills: dist/ is pruned only by multi-tool-bridge, vendor/ and node_modules/ by both.
const NON_GIT = {
  git: false,
  files: {
    'AGENTS.md': ROOT_AGENTS,
    'CLAUDE.md': 'rules\n',
    'CLAUDE.local.md': 'mine\n',
    'dist/CLAUDE.md': 'built\n',
    'sub/AGENTS.md': STALE,
    'vendor/CLAUDE.md': 'vendored\n',
    'vendor/CLAUDE.local.md': 'vendored\n',
    'node_modules/pkg/AGENTS.md': STALE,
  },
};

const PR_ERROR = 'ERROR pull-request template check failed (see the message above)';
const C1 = (k) =>
  `FINDING C1 root AGENTS.md names no ${k} command (add it, or accept: the repo has none or one gate covers it)`;
const C9_NO_SKILL =
  'FINDING C9 no .agents/skills/verify/SKILL.md (add it in Step 2b, or accept: the repo has no runnable surface)';
const C10_NONE =
  'FINDING C10 no usable pull-request template (add it in Step 2c, or accept: the repository wants none)';

describe('pr-template.mjs detect', () => {
  test('names each usable and unusable entry, by folder and then by byte order of the name', () => {
    const fx = fixture({
      files: {
        'pull_request_template.md': '## Checklist\n',
        'docs/PULL_REQUEST_TEMPLATE/a.md': '## A\n',
        'docs/pull_request_template.md.bak': 'old\n',
        'tpl.txt': 'text\n',
      },
      links: {
        PULL_REQUEST_TEMPLATE: 'docs/PULL_REQUEST_TEMPLATE',
        'docs/pull_request_template.txt': '../tpl.txt',
        '.github/pull_request_template': 'missing.md',
      },
      dirs: ['.github/PULL_REQUEST_TEMPLATE', '.github/pull_request_template.md'],
    });
    const lines = [
      'pull-request template: ./PULL_REQUEST_TEMPLATE (symlink to folder)',
      'pull-request template: ./pull_request_template.md (file)',
      'pull-request template: docs/PULL_REQUEST_TEMPLATE (folder)',
      'pull-request template: docs/pull_request_template.txt (symlink to file)',
      'pull-request template: unusable .github/PULL_REQUEST_TEMPLATE (folder without a .md or .txt file)',
      'pull-request template: unusable .github/pull_request_template (broken symlink)',
      'pull-request template: unusable .github/pull_request_template.md (folder with a file name)',
    ];
    expectRun(run(PR_TEMPLATE, ['detect'], fx), 0, lines);
    expectRun(run(PR_TEMPLATE, ['detect'], fx, 'docs'), 0, lines);
  });

  test('prints none when no usable entry exists, also after an unusable one', () => {
    const broken = fixture({ links: { '.github/pull_request_template.md': 'missing.md' } });
    expectRun(run(PR_TEMPLATE, ['detect'], broken), 0, [
      'pull-request template: unusable .github/pull_request_template.md (broken symlink)',
      'pull-request template: none',
    ]);
    expectRun(run(PR_TEMPLATE, ['detect'], fixture()), 0, ['pull-request template: none']);
  });

  test('outside git prints the ERROR line', () => {
    // (b) the old wrapper printed the same line and exited 0.
    expectError(run(PR_TEMPLATE, ['detect'], fixture({ git: false })), [PR_ERROR]);
  });

  test('a symlinked docs or .github folder lists no entry', () => {
    const fx = fixture({
      files: { 'real/pull_request_template.md': '## Checklist\n', 'gh/pull_request_template.md': '## Checklist\n' },
      links: { docs: 'real', '.github': 'gh' },
    });
    expectRun(run(PR_TEMPLATE, ['detect'], fx), 0, ['pull-request template: none']);
  });

  test('a folder that cannot be listed prints the ERROR line', { skip: IS_ROOT }, () => {
    expectError(run(PR_TEMPLATE, ['detect'], fixture({ dirs: ['docs'], modes: { docs: 0o000 } })), [PR_ERROR]);
    const folder = '.github/PULL_REQUEST_TEMPLATE';
    expectError(run(PR_TEMPLATE, ['detect'], fixture({ dirs: [folder], modes: { [folder]: 0o000 } })), [PR_ERROR]);
  });

  test('an entry that is no file, folder, or symlink is not a regular file', () => {
    const fx = fixture({ dirs: ['.github'] });
    const fifo = spawnSync('mkfifo', [path.join(fx.dir, '.github/pull_request_template.md')], { encoding: 'utf8' });
    assert.equal(fifo.status, 0, `mkfifo: ${fifo.stderr}`);
    expectRun(run(PR_TEMPLATE, ['detect'], fx), 0, [
      'pull-request template: unusable .github/pull_request_template.md (not a regular file)',
      'pull-request template: none',
    ]);
  });
});

describe('pr-template.mjs gate', () => {
  test('refuses an entry with a supported name at .github/pull_request_template.md in any letter case', () => {
    const broken = fixture({ links: { '.github/pull_request_template.md': 'missing.md' } });
    expectRun(run(PR_TEMPLATE, ['gate'], broken), 0, ['target occupied: write nothing']);
    const upper = fixture({ files: { '.github/PULL_REQUEST_TEMPLATE.md': '## Checklist\n' } });
    expectRun(run(PR_TEMPLATE, ['gate'], upper), 0, ['target occupied: write nothing']);
  });

  test('frees the target when no usable template exists and .github is no symlink', () => {
    expectRun(run(PR_TEMPLATE, ['gate'], fixture()), 0, ['target free']);
    expectRun(run(PR_TEMPLATE, ['gate'], fixture({ dirs: ['docs/PULL_REQUEST_TEMPLATE'] })), 0, ['target free']);
  });

  test('writes nothing next to a usable template or through a .github symlink', () => {
    const line = 'no write: a usable template exists, or .github is a symlink';
    expectRun(run(PR_TEMPLATE, ['gate'], fixture({ files: { 'pull_request_template.md': '## Checklist\n' } })), 0, [
      line,
    ]);
    expectRun(run(PR_TEMPLATE, ['gate'], fixture({ files: { 'gh/.keep': '' }, links: { '.github': 'gh' } })), 0, [
      line,
    ]);
  });

  test('outside git prints the ERROR line; an unknown command is a usage error', () => {
    const fx = fixture({ git: false });
    // (b) the old gate printed the same line and exited 0.
    expectError(run(PR_TEMPLATE, ['gate'], fx), [PR_ERROR]);
    assert.equal(run(PR_TEMPLATE, ['bogus'], fx).status, 1);
    assert.equal(run(PR_TEMPLATE, [], fx).status, 1);
  });
});

describe('verify-skill.mjs detect', () => {
  test('a skill whose link resolves, through its own link or a linked .claude/skills', () => {
    const lines = ['verify skill: present', 'verify link: present'];
    const own = fixture({ files: { '.agents/skills/verify/SKILL.md': VERIFY_SKILL }, links: VERIFY_LINK });
    expectRun(run(VERIFY, ['detect'], own), 0, lines);
    const linkedFolder = fixture({
      files: { '.agents/skills/verify/SKILL.md': VERIFY_SKILL },
      links: { '.claude/skills': '../.agents/skills' },
    });
    expectRun(run(VERIFY, ['detect'], linkedFolder), 0, lines);
  });

  test('one line per not observed mark, and a missing link', () => {
    const fx = fixture({ files: { '.agents/skills/verify/SKILL.md': MARKED_SKILL } });
    expectRun(run(VERIFY, ['detect'], fx), 0, [
      'verify skill: present',
      ...MARKS.map((m) => `verify unverified: ${m}`),
      'verify link: missing',
    ]);
  });

  test('another entry at .claude/skills/verify occupies the link', () => {
    const folder = fixture({ files: { '.claude/skills/verify/SKILL.md': VERIFY_SKILL } });
    expectRun(run(VERIFY, ['detect'], folder), 0, ['verify skill: missing', 'verify link: occupied']);
    const elsewhere = fixture({
      files: { '.agents/skills/verify/SKILL.md': VERIFY_SKILL, 'other/SKILL.md': VERIFY_SKILL },
      links: { '.claude/skills/verify': '../../other' },
    });
    expectRun(run(VERIFY, ['detect'], elsewhere), 0, ['verify skill: present', 'verify link: occupied']);
    const dangling = fixture({ links: VERIFY_LINK });
    expectRun(run(VERIFY, ['detect'], dangling), 0, ['verify skill: missing', 'verify link: occupied']);
  });

  test('no skill and no link', () => {
    expectRun(run(VERIFY, ['detect'], fixture()), 0, ['verify skill: missing', 'verify link: missing']);
  });

  test('an unreadable skill prints the ERROR line', { skip: IS_ROOT }, () => {
    const fx = fixture({
      files: { '.agents/skills/verify/SKILL.md': VERIFY_SKILL },
      links: VERIFY_LINK,
      modes: { '.agents/skills/verify/SKILL.md': 0o000 },
    });
    // (b) the old block printed the same lines and exited 0.
    expectError(run(VERIFY, ['detect'], fx), [
      'verify skill: present',
      'ERROR verify skill check failed: cannot read .agents/skills/verify/SKILL.md',
      'verify link: present',
    ]);
  });
});

describe('verify-skill.mjs write-gate', () => {
  test('refuses a symlink and a path outside the repository, and accepts the rest', () => {
    const fx = fixture({
      files: { 'real.md': 'real\n' },
      links: { 'link.md': 'real.md', out: '..', '.claude/skills': '../.agents/skills' },
      dirs: ['.agents/skills'],
    });
    const paths = [
      'link.md',
      'out/new.md',
      '.agents/skills/verify/SKILL.md',
      '.claude/skills/verify',
      'new/deep/file.md',
      'real.md',
    ];
    expectRun(run(VERIFY, ['write-gate', ...paths], fx), 0, [
      'target occupied: link.md is a symlink',
      'target occupied: out/new.md resolves outside the repository',
    ]);
    expectRun(run(VERIFY, ['write-gate', '.agents/skills/verify/SKILL.md', '.claude/skills/verify'], fx), 0, []);
    assert.equal(run(VERIFY, ['write-gate'], fx).status, 1);
  });

  test('refuses a path whose nearest folder cannot be entered', { skip: IS_ROOT }, () => {
    const fx = fixture({ dirs: ['locked'], modes: { locked: 0o000 } });
    expectRun(run(VERIFY, ['write-gate', 'locked/new.md'], fx), 0, [
      'target occupied: cannot resolve the folder of locked/new.md',
    ]);
  });

  test('refuses a path with a .. segment, also through a symlink or a missing folder', () => {
    const fx = fixture({ links: { link: '..' } });
    expectRun(run(VERIFY, ['write-gate', 'link/../x', 'missing/../../x'], fx), 0, [
      'target occupied: link/../x holds a .. segment',
      'target occupied: missing/../../x holds a .. segment',
    ]);
  });
});

describe('verify-skill.mjs entry-gate', () => {
  test('names each existing entry, a dangling link included; an unknown command is a usage error', () => {
    const fx = fixture({ dirs: ['.agents/skills/verify'], links: VERIFY_LINK });
    expectRun(run(VERIFY, ['entry-gate'], fx), 0, [
      'target occupied: .agents/skills/verify exists',
      'target occupied: .claude/skills/verify exists',
    ]);
    expectRun(run(VERIFY, ['entry-gate'], fixture()), 0, []);
    assert.equal(run(VERIFY, ['bogus'], fx).status, 1);
  });
});

describe('verify-skill.mjs link', () => {
  test('creates the relative link when no entry is there', () => {
    const fx = fixture({ files: { '.agents/skills/verify/SKILL.md': VERIFY_SKILL } });
    expectRun(run(VERIFY, ['link'], fx), 0, ['verify skill: linked']);
    assert.equal(fs.readlinkSync(path.join(fx.dir, '.claude/skills/verify')), '../../.agents/skills/verify');
  });

  test('adds no link when .claude/skills links to .agents/skills', () => {
    const fx = fixture({
      files: { '.agents/skills/verify/SKILL.md': VERIFY_SKILL },
      links: { '.claude/skills': '../.agents/skills' },
    });
    expectRun(run(VERIFY, ['link'], fx), 0, ['verify skill: linked']);
    assert.equal(fs.lstatSync(path.join(fx.dir, '.agents/skills/verify')).isDirectory(), true);
  });

  test('reports BROKEN next to another entry, and after a link to a missing skill', () => {
    const occupied = fixture({
      files: { '.agents/skills/verify/SKILL.md': VERIFY_SKILL, '.claude/skills/verify/SKILL.md': VERIFY_SKILL },
    });
    expectRun(run(VERIFY, ['link'], occupied), 0, ['BROKEN: .claude/skills/verify']);
    assert.equal(fs.lstatSync(path.join(occupied.dir, '.claude/skills/verify')).isDirectory(), true);
    const noSkill = fixture();
    expectRun(run(VERIFY, ['link'], noSkill), 0, ['BROKEN: .claude/skills/verify']);
    assert.equal(fs.readlinkSync(path.join(noSkill.dir, '.claude/skills/verify')), '../../.agents/skills/verify');
  });
});

describe('agent-first-check.mjs detect', () => {
  test('prints the Step 0 lines from the root, also when started in a subfolder', () => {
    const fx = fixture({
      files: {
        'AGENTS.md': ROOT_AGENTS,
        '.gitignore': 'CLAUDE.local.md\ngen/\n',
        'CLAUDE.md': '@AGENTS.md\n',
        '.claude/CLAUDE.md': 'Use the review agent.\n',
        'CLAUDE.local.md': 'my notes\n',
        'api/AGENTS.md': STALE,
        'api/CLAUDE.md': '@AGENTS.md\n',
        'gen/AGENTS.md': STALE,
        'gen/CLAUDE.md': 'generated\n',
        '.agents/skills/verify/SKILL.md': VERIFY_SKILL,
        '.claude/skills/local/SKILL.md': skill('local', '"Use when testing."'),
        '.github/pull_request_template.md': '## Checklist\n',
      },
      links: VERIFY_LINK,
    });
    const lines = [
      fx.dir,
      'root AGENTS.md: present',
      '.agents/skills: present',
      '.claude/skills: present',
      'legacy: .claude/CLAUDE.md',
      'legacy: CLAUDE.md',
      'legacy: api/CLAUDE.md',
      'personal: CLAUDE.local.md',
      'node: api/AGENTS.md',
      'not-a-symlink: .claude/skills/local',
      'pull-request template: .github/pull_request_template.md (file)',
      'verify skill: present',
      'verify link: present',
    ];
    expectRun(run(AGENT_FIRST, ['detect'], fx), 0, lines);
    expectRun(run(AGENT_FIRST, ['detect'], fx, 'api'), 0, lines);
  });

  test('an empty repository', () => {
    const fx = fixture();
    expectRun(run(AGENT_FIRST, ['detect'], fx), 0, [
      fx.dir,
      'root AGENTS.md: missing',
      '.agents/skills: missing',
      '.claude/skills: missing',
      'pull-request template: none',
      'verify skill: missing',
      'verify link: missing',
    ]);
  });

  test('an AGENTS.md under node_modules is no node', () => {
    const fx = fixture({ ...BASE, files: { ...BASE_FILES, 'node_modules/pkg/AGENTS.md': 'We currently ship.\n' } });
    // (a) the old block also printed `node: node_modules/pkg/AGENTS.md`.
    expectRun(run(AGENT_FIRST, ['detect'], fx), 0, [
      fx.dir,
      'root AGENTS.md: present',
      '.agents/skills: present',
      '.claude/skills: present',
      'pull-request template: .github/pull_request_template.md (file)',
      'verify skill: present',
      'verify link: present',
    ]);
  });

  test('outside git walks the tree and prints the pull-request ERROR line', () => {
    const fx = fixture(NON_GIT);
    // (c) the find replacement of Step 0 with the agent-first-setup prune set (.git, node_modules, vendor),
    // without the `./` prefix of find; (b) exit 2 for the ERROR line.
    expectError(run(AGENT_FIRST, ['detect'], fx), [
      fx.dir,
      'root AGENTS.md: present',
      '.agents/skills: missing',
      '.claude/skills: missing',
      'legacy: CLAUDE.md',
      'legacy: dist/CLAUDE.md',
      'personal: CLAUDE.local.md',
      'node: sub/AGENTS.md',
      PR_ERROR,
      'verify skill: missing',
      'verify link: missing',
    ]);
  });
});

describe('agent-first-check.mjs check', () => {
  test('an agent-first repository prints nothing, also when started in a subfolder', () => {
    const fx = fixture(BASE);
    expectRun(run(AGENT_FIRST, ['check'], fx), 0, []);
    expectRun(run(AGENT_FIRST, ['check'], fx, '.github'), 0, []);
  });

  test('C1 a missing root AGENTS.md, and one that names no test or lint command', () => {
    expectRun(run(AGENT_FIRST, ['check'], fixture()), 0, ['FAIL C1 root AGENTS.md missing', C9_NO_SKILL, C10_NONE]);
    const words = fixture({ ...BASE, files: { ...BASE_FILES, 'AGENTS.md': '# Repo\n\nRun make build.\n' } });
    expectRun(run(AGENT_FIRST, ['check'], words), 0, [
      C1('test'),
      C1('lint'),
      'FINDING C5 no stale-tolerance line: AGENTS.md',
    ]);
    const parts = fixture({
      ...BASE,
      files: { ...BASE_FILES, 'AGENTS.md': `# Repo\n\nThe builder tests each linter.\n\n${STALE}` },
    });
    // `grep -w`: a kind inside a longer word names no command.
    expectRun(run(AGENT_FIRST, ['check'], parts), 0, [C1('build'), C1('test'), C1('lint')]);
  });

  test('C2 an unrouted node and a dead route; @ and ./ prefixes of a row are stripped', () => {
    const fx = fixture({
      ...BASE,
      files: {
        ...BASE_FILES,
        'AGENTS.md': routed('api/AGENTS.md', '@./web/AGENTS.md', 'gone/AGENTS.md'),
        'api/AGENTS.md': STALE,
        'web/AGENTS.md': STALE,
        'lib/AGENTS.md': STALE,
      },
    });
    expectRun(run(AGENT_FIRST, ['check'], fx), 0, [
      'FAIL C2 node not routed from root: lib/AGENTS.md',
      'FAIL C2 dead route in root table: gone/AGENTS.md',
    ]);
  });

  test('C3 each CLAUDE.md kind, and nodes hidden while the root has a CLAUDE.md', () => {
    const fx = fixture({
      files: {
        ...BASE_FILES,
        'AGENTS.md': routed('api/AGENTS.md', 'docs/AGENTS.md', 'lib/AGENTS.md', 'pkg/AGENTS.md', 'web/AGENTS.md'),
        '.gitignore': 'CLAUDE.local.md\ngen/\n',
        'CLAUDE.md': '@AGENTS.md\n',
        '.claude/CLAUDE.md': '@../AGENTS.md\n\nUse the review agent.\n',
        'CLAUDE.local.md': 'my notes\n',
        'gen/CLAUDE.md': 'generated\n',
        'api/AGENTS.md': STALE,
        'api/.claude/CLAUDE.md': '@../AGENTS.md\n',
        'docs/AGENTS.md': STALE,
        'docs/CLAUDE.md': '# Docs rules\n',
        'lib/AGENTS.md': STALE,
        'pkg/AGENTS.md': STALE,
        'web/AGENTS.md': STALE,
        'web/CLAUDE.md': '@AGENTS.md\n',
      },
      links: { ...VERIFY_LINK, 'pkg/CLAUDE.md': 'AGENTS.md' },
    });
    expectRun(run(AGENT_FIRST, ['check'], fx), 0, [
      'FINDING C3 CLAUDE.md imports AGENTS.md and holds other lines (move them, then delete the file): .claude/CLAUDE.md',
      'FINDING C3 CLAUDE.local.md without an @AGENTS.md import makes Claude read it instead of AGENTS.md (personal file; user decides): CLAUDE.local.md',
      'FINDING C3 redundant import stub (AGENTS.md still loads; cleanup): CLAUDE.md',
      'FINDING C3 redundant import stub (AGENTS.md still loads; cleanup): api/.claude/CLAUDE.md',
      'FAIL C3 CLAUDE.md without an @AGENTS.md import makes Claude read it instead of AGENTS.md: docs/CLAUDE.md',
      'FINDING C3 redundant symlink to AGENTS.md (content still loads; cleanup): pkg/CLAUDE.md',
      'FINDING C3 redundant import stub (AGENTS.md still loads; cleanup): web/CLAUDE.md',
      'FAIL C3 node hidden from Claude (the root has a CLAUDE.md file and docs has no import stub): docs/AGENTS.md',
      'FAIL C3 node hidden from Claude (the root has a CLAUDE.md file and lib has no import stub): lib/AGENTS.md',
    ]);
  });

  test('C4 a folder, a link outside .agents/skills, and a broken link; dot names are skipped', () => {
    const fx = fixture({
      files: {
        ...BASE_FILES,
        '.claude/skills/local/SKILL.md': skill('local', '"Use when testing."'),
        'ext/skill/SKILL.md': skill('skill', '"Use when testing."'),
      },
      links: {
        ...VERIFY_LINK,
        '.claude/skills/ext': '../../ext/skill',
        '.claude/skills/gone': '../../.agents/skills/gone',
      },
      dirs: ['.claude/skills/.hidden'],
    });
    expectRun(run(AGENT_FIRST, ['check'], fx), 0, [
      'FAIL C4 target outside .agents/skills: .claude/skills/ext',
      'FAIL C4 broken symlink: .claude/skills/gone',
      'FAIL C4 not a symlink: .claude/skills/local',
    ]);
  });

  test('C5 time, count, and anchor findings outside fences, URLs, spans, and quotes; a node without the stale line', () => {
    const fx = fixture({
      ...BASE,
      files: {
        ...BASE_FILES,
        'AGENTS.md': `${routed('lib/AGENTS.md')}
We currently ship one tool.
The kit has 12 skills.
The kit has 12 skills (verify: ls .agents/skills | wc -l).
The word \`currently\` sits in a code span.
"It now has 3 files" is a quoted example.
Step 3 files are listed below.
See https://example.com/recently for news.
See src/app.ts:10 for the entry.
See \`src/app.ts:12\` in a code span.
See demo/fake.ts:3 for a fictional path.

\`\`\`text
recently 4 tests
\`\`\`
“We currently ship 3 files” in curly quotes.
`,
        'src/app.ts': 'export {};\n',
        'lib/AGENTS.md': '# Lib\n',
        '.agents/skills/demo/SKILL.md': skill('demo', '"Use when demoing."'),
        '.agents/skills/demo/references/notes.md': 'See ../SKILL.md:2 for the header.\n',
      },
    });
    expectRun(run(AGENT_FIRST, ['check'], fx), 0, [
      'FINDING C5 line-anchor .agents/skills/demo/references/notes.md:1 (../SKILL.md exists)',
      'FINDING C5 time-relative AGENTS.md:13',
      'FINDING C5 bare-count AGENTS.md:14',
      'FINDING C5 line-anchor AGENTS.md:20 (src/app.ts exists)',
      'FINDING C5 line-anchor AGENTS.md:21 (src/app.ts exists)',
      'FINDING C5 no stale-tolerance line: lib/AGENTS.md',
    ]);
  });

  test('C6 descriptions, block scalars included; C7 eager imports; C8 node size', () => {
    const fx = fixture({
      ...BASE,
      files: {
        ...BASE_FILES,
        'AGENTS.md': `${routed('lib/AGENTS.md')}
Read @docs/guide.md first.
Then read @missing.md too.
The row \`@docs/guide.md\` is a code span.
`,
        'docs/guide.md': 'one\ntwo\n',
        'lib/AGENTS.md': `${STALE}${'x\n'.repeat(500)}`,
        '.agents/skills/plain/SKILL.md': skill('plain', 'Does a thing.'),
        '.agents/skills/folded/SKILL.md': skill('folded', '>-\n  Use when folding text.'),
        '.agents/skills/literal/SKILL.md': skill('literal', '|\n  Lists things.'),
        '.agents/skills/quoted/SKILL.md': skill('quoted', "'Use when quoting.'"),
      },
    });
    expectRun(run(AGENT_FIRST, ['check'], fx), 0, [
      "FAIL C6 description does not start with 'Use when': .agents/skills/literal/SKILL.md",
      "FAIL C6 description does not start with 'Use when': .agents/skills/plain/SKILL.md",
      'FINDING C7 eager import AGENTS.md:13: @docs/guide.md (./docs/guide.md, 2 lines, loads with this file)',
      'FINDING C7 eager import AGENTS.md:14: @missing.md (no file at ./missing.md)',
      'FINDING C8 over the 500-line kit policy: lib/AGENTS.md (501 lines)',
    ]);
  });

  test('C7 imports from the home folder and from absolute paths', () => {
    const fx = fixture({ ...BASE, files: { ...BASE_FILES, 'home/notes.md': 'one\n', 'abs/target.md': 'a\nb\nc\n' } });
    const home = path.join(fx.dir, 'home');
    fx.env.HOME = home;
    const absolute = path.join(fx.dir, 'abs/target.md');
    const missing = '/nonexistent-agent-docs/x.md';
    const imports = `Read @~/notes.md first.\nRead @${absolute} next.\nRead @${missing} last.\n`;
    fs.writeFileSync(path.join(fx.dir, 'AGENTS.md'), `${ROOT_AGENTS}${imports}`);
    expectRun(run(AGENT_FIRST, ['check'], fx), 0, [
      `FINDING C7 eager import AGENTS.md:6: @~/notes.md (${home}/notes.md, 1 lines, loads with this file)`,
      `FINDING C7 eager import AGENTS.md:7: @${absolute} (${absolute}, 3 lines, loads with this file)`,
      `FINDING C7 eager import AGENTS.md:8: @${missing} (no file at ${missing})`,
    ]);
  });

  test('C9 a missing skill, a link that does not resolve, and unverified commands', () => {
    const noSkill = fixture({ files: { ...BASE_FILES, '.agents/skills/verify/SKILL.md': undefined } });
    expectRun(run(AGENT_FIRST, ['check'], noSkill), 0, [C9_NO_SKILL]);
    expectRun(run(AGENT_FIRST, ['check'], fixture({ files: BASE_FILES })), 0, [
      'FAIL C9 .claude/skills/verify does not resolve to .agents/skills/verify',
    ]);
    const marked = fixture({ ...BASE, files: { ...BASE_FILES, '.agents/skills/verify/SKILL.md': MARKED_SKILL } });
    expectRun(
      run(AGENT_FIRST, ['check'], marked),
      0,
      MARKS.map(
        (m) => `FAIL C9 unverified command (rerun every command in Step 2b): .agents/skills/verify/SKILL.md:${m}`,
      ),
    );
  });

  test('C9 an unreadable skill prints the ERROR line, and C5 and C6 cannot read it either', { skip: IS_ROOT }, () => {
    const fx = fixture({ ...BASE, modes: { '.agents/skills/verify/SKILL.md': 0o000 } });
    // (b) the old block printed the C9 line and exited 0; (f) it read the skill as empty for C5 and C6, and printed
    // `FAIL C6 description does not start with 'Use when'` for it.
    expectError(run(AGENT_FIRST, ['check'], fx), [
      'ERROR C5 cannot read .agents/skills/verify/SKILL.md',
      'ERROR C6 cannot read .agents/skills/verify/SKILL.md',
      'ERROR C9 cannot read .agents/skills/verify/SKILL.md',
    ]);
  });

  test('C10 each unusable entry, and no usable template', () => {
    const broken = fixture({
      files: { ...BASE_FILES, '.github/pull_request_template.md': undefined },
      links: { ...VERIFY_LINK, '.github/pull_request_template.md': 'missing.md' },
    });
    expectRun(run(AGENT_FIRST, ['check'], broken), 0, [
      'FINDING C10 unusable pull-request template: .github/pull_request_template.md (broken symlink)',
      C10_NONE,
    ]);
    const unusable = fixture({ ...BASE, dirs: ['docs/PULL_REQUEST_TEMPLATE'] });
    expectRun(run(AGENT_FIRST, ['check'], unusable), 0, [
      'FINDING C10 unusable pull-request template: docs/PULL_REQUEST_TEMPLATE (folder without a .md or .txt file)',
    ]);
  });

  test('an AGENTS.md under node_modules is no node for C2 to C8', () => {
    const fx = fixture({ ...BASE, files: { ...BASE_FILES, 'node_modules/pkg/AGENTS.md': 'We currently ship.\n' } });
    // (a) the old block printed `FAIL C2 node not routed from root: node_modules/pkg/AGENTS.md`,
    // `FINDING C5 time-relative node_modules/pkg/AGENTS.md:1`, and `FINDING C5 no stale-tolerance line: node_modules/pkg/AGENTS.md`.
    expectRun(run(AGENT_FIRST, ['check'], fx), 0, []);
  });

  test('outside git walks the tree and prints the C10 ERROR line; an unknown command is a usage error', () => {
    const fx = fixture({
      git: false,
      files: {
        'AGENTS.md': ROOT_AGENTS,
        'dist/CLAUDE.md': 'built\n',
        'vendor/CLAUDE.md': 'vendored\n',
        'node_modules/pkg/AGENTS.md': 'We currently ship.\n',
      },
    });
    // (c) ls_repo replaced by a walk with the agent-first-setup prune set; (b) exit 2 for the ERROR line.
    expectError(run(AGENT_FIRST, ['check'], fx), [
      'FAIL C3 CLAUDE.md without an @AGENTS.md import makes Claude read it instead of AGENTS.md: dist/CLAUDE.md',
      C9_NO_SKILL,
      'ERROR C10 pull-request template check failed (see the message above)',
    ]);
    assert.equal(run(AGENT_FIRST, ['bogus'], fx).status, 1);
  });
});

// The Step 2 entries in block order; `audit(...present)` gives the nine presence lines.
const AUDIT_PATHS = [
  'AGENTS.md',
  'CLAUDE.md (root)',
  '.claude/CLAUDE.md',
  'CLAUDE.local.md',
  '.agents/skills/',
  '.claude/skills/',
  '.claude/agents/',
  '.claude/rules/',
  '.claude/rules/claude-code.md',
];
const audit = (...present) => AUDIT_PATHS.map((p) => `${present.includes(p) ? 'EXISTS' : 'MISSING'} ${p}`);

describe('bridge-check.mjs audit', () => {
  test('the nine presence lines, then legacy and personal paths, also when started in a subfolder', () => {
    const fx = fixture({
      files: {
        '.gitignore': 'CLAUDE.local.md\ngen/\n',
        'AGENTS.md': ROOT_AGENTS,
        'CLAUDE.md': 'rules\n',
        '.claude/CLAUDE.md': 'rules\n',
        'CLAUDE.local.md': 'mine\n',
        '.claude/rules/claude-code.md': '# Claude Code\n',
        '.claude/agents/review.md': '# Review\n',
        '.agents/skills/x/SKILL.md': TEST_SKILL,
        'api/CLAUDE.md': 'rules\n',
        'api/CLAUDE.local.md': 'mine\n',
        'dist/CLAUDE.md': 'built\n',
        'dist/CLAUDE.local.md': 'built\n',
        'gen/CLAUDE.md': 'generated\n',
        'node_modules/pkg/CLAUDE.md': 'package\n',
      },
      links: { '.claude/skills/x': '../../.agents/skills/x' },
    });
    // (d) the old commands printed bare paths (personal ones with `./`, in find order) in separate blocks.
    const lines = [
      ...audit(...AUDIT_PATHS),
      'legacy: .claude/CLAUDE.md',
      'legacy: CLAUDE.md',
      'legacy: api/CLAUDE.md',
      'legacy: dist/CLAUDE.md',
      'personal: CLAUDE.local.md',
      'personal: api/CLAUDE.local.md',
    ];
    expectRun(run(BRIDGE, ['audit'], fx), 0, lines);
    expectRun(run(BRIDGE, ['audit'], fx, 'api'), 0, lines);
  });

  test('an empty repository', () => {
    expectRun(run(BRIDGE, ['audit'], fixture()), 0, audit());
  });

  test('a dangling CLAUDE.local.md or CLAUDE.md symlink is no file', () => {
    const links = { 'CLAUDE.local.md': 'missing.md', 'api/CLAUDE.local.md': 'missing.md' };
    expectRun(run(BRIDGE, ['audit'], fixture({ links })), 0, audit());
    // Outside git, the Step 2 `find -type f` listed no symlink either.
    const outside = fixture({
      git: false,
      files: { 'api/CLAUDE.md': 'rules\n' },
      links: { ...links, 'CLAUDE.md': 'missing.md' },
    });
    expectRun(run(BRIDGE, ['audit'], outside), 0, [...audit(), 'legacy: api/CLAUDE.md']);
  });
});

describe('non-git prune sets', () => {
  test('dist/CLAUDE.md is legacy for agent-first-setup and pruned for multi-tool-bridge', () => {
    const fx = fixture(NON_GIT);
    // (c) each skill walks with its own prune set; (d) labeled paths without the `./` of find.
    expectRun(run(BRIDGE, ['audit'], fx), 0, [
      ...audit('AGENTS.md', 'CLAUDE.md (root)', 'CLAUDE.local.md'),
      'legacy: CLAUDE.md',
      'personal: CLAUDE.local.md',
    ]);
    const agentFirst = run(AGENT_FIRST, ['detect'], fx).lines.filter((l) => l.startsWith('legacy: '));
    assert.deepEqual(agentFirst, ['legacy: CLAUDE.md', 'legacy: dist/CLAUDE.md']);
  });

  test('a walk lists whole paths in byte order, not in creation or folder order', () => {
    const names = ['é', 'B', '😀', 'a', 'z', '_', 'a-b', 'ｚ'];
    const fx = fixture({ git: false, files: Object.fromEntries(names.map((n) => [`${n}/CLAUDE.md`, 'rules\n'])) });
    // `a-b/` sorts before `a/`, because `-` is below `/`, although a walk enters `a` first. UTF-16 order would put
    // 😀 (a surrogate pair) before ｚ (U+FF5A); byte order puts it last.
    const sorted = ['B', '_', 'a-b', 'a', 'z', 'é', 'ｚ', '😀'];
    expectRun(run(BRIDGE, ['audit'], fx), 0, [...audit(), ...sorted.map((n) => `legacy: ${n}/CLAUDE.md`)]);
  });
});

describe('bridge-check.mjs verify', () => {
  test('a bridged repository prints nothing, with and without --expect', () => {
    const fx = fixture({
      files: {
        'AGENTS.md': routed('api/AGENTS.md'),
        'api/AGENTS.md': STALE,
        '.agents/skills/x/SKILL.md': TEST_SKILL,
        '.claude/rules/claude-code.md': '# Claude Code\n',
        '.claude/skills/plain/SKILL.md': TEST_SKILL,
      },
      links: { '.claude/skills/x': '../../.agents/skills/x' },
    });
    expectRun(run(BRIDGE, ['verify'], fx), 0, []);
    expectRun(
      run(BRIDGE, ['verify', '--expect', '.claude/rules/claude-code.md', '--expect', 'api/AGENTS.md'], fx),
      0,
      [],
    );
  });

  test('broken links, dot names included, a missing AGENTS.md, legacy files, and missing --expect paths', () => {
    const fx = fixture({
      files: {
        'CLAUDE.md': 'rules\n',
        'api/CLAUDE.md': 'rules\n',
        'api/AGENTS.md': 'We currently ship.\n',
        'node_modules/pkg/CLAUDE.md': 'package\n',
        'node_modules/pkg/AGENTS.md': 'We recently shipped.\n',
        '.agents/skills/x/SKILL.md': TEST_SKILL,
      },
      links: {
        '.claude/skills/x': '../../.agents/skills/x',
        '.claude/skills/gone': '../../.agents/skills/gone',
        '.claude/skills/.dot': '../../.agents/skills/.dot',
      },
    });
    const head = [
      'BROKEN: .claude/skills/.dot',
      'BROKEN: .claude/skills/gone',
      'BROKEN: AGENTS.md missing',
      'BROKEN: legacy CLAUDE.md still present: CLAUDE.md',
      'BROKEN: legacy CLAUDE.md still present: api/CLAUDE.md',
    ];
    const tail = ['HANDOFF context-tree: unrouted node api/AGENTS.md', 'VOLATILE time-relative api/AGENTS.md:1'];
    expectRun(run(BRIDGE, ['verify'], fx), 0, [...head, ...tail]);
    // (e) one line per --expect path that is not a file; it replaces the three placeholder lines of the old block.
    expectRun(run(BRIDGE, ['verify', '--expect', '.claude/rules/claude-code.md', '--expect', 'api'], fx), 0, [
      ...head,
      'BROKEN: .claude/rules/claude-code.md missing',
      'BROKEN: api missing',
      ...tail,
    ]);
  });

  test('routing handoffs and volatile values; a bad argument is a usage error', () => {
    const fx = fixture({
      files: {
        'AGENTS.md': `${routed('api/AGENTS.md', 'gone/AGENTS.md')}
We currently ship one tool.
The kit has 12 skills.
See src/app.ts:10 for the entry.
`,
        'src/app.ts': 'export {};\n',
        'api/AGENTS.md': STALE,
        'lib/AGENTS.md': STALE,
      },
    });
    expectRun(run(BRIDGE, ['verify'], fx), 0, [
      'HANDOFF context-tree: unrouted node lib/AGENTS.md',
      'HANDOFF context-tree: dead route gone/AGENTS.md',
      'VOLATILE time-relative AGENTS.md:14',
      'VOLATILE bare-count AGENTS.md:15',
      'VOLATILE line-anchor AGENTS.md:16 (src/app.ts exists)',
    ]);
    assert.equal(run(BRIDGE, ['verify', '--expect'], fx).status, 1);
    assert.equal(run(BRIDGE, ['verify', '--bogus'], fx).status, 1);
    assert.equal(run(BRIDGE, ['bogus'], fx).status, 1);
  });

  test('outside git a symlinked node stays in the routing and volatile checks', () => {
    const fx = fixture({
      git: false,
      files: { 'AGENTS.md': ROOT_AGENTS, 'docs/api.md': 'We currently ship.\n' },
      links: { 'api/AGENTS.md': '../docs/api.md' },
    });
    expectRun(run(BRIDGE, ['verify'], fx), 0, [
      'HANDOFF context-tree: unrouted node api/AGENTS.md',
      'VOLATILE time-relative api/AGENTS.md:1',
    ]);
  });
});

// (f) the old blocks read a failed `git ls-files`, an unreadable folder, or an unreadable file as no match.
describe('failed listings and unreadable files', () => {
  const failed = (label) => `ERROR ${label} file listing failed (see the message above)`;
  const LISTING_CHECKS = ['C2', 'C3', 'C5', 'C6', 'C7', 'C8'];

  test('a corrupt git index prints ERROR lines in both entry scripts', () => {
    const fx = fixture({ ...BASE, files: { ...BASE_FILES, 'CLAUDE.md': 'rules\n' } });
    fs.writeFileSync(path.join(fx.dir, '.git/index'), 'not an index\n');
    expectError(run(AGENT_FIRST, ['check'], fx), LISTING_CHECKS.map(failed));
    expectError(run(AGENT_FIRST, ['detect'], fx), [
      fx.dir,
      'root AGENTS.md: present',
      '.agents/skills: present',
      '.claude/skills: present',
      failed('legacy:'),
      failed('personal:'),
      failed('node:'),
      'pull-request template: .github/pull_request_template.md (file)',
      'verify skill: present',
      'verify link: present',
    ]);
    expectError(run(BRIDGE, ['audit'], fx), [
      ...audit('AGENTS.md', 'CLAUDE.md (root)', '.agents/skills/', '.claude/skills/'),
      failed('legacy:'),
    ]);
    expectError(run(BRIDGE, ['verify'], fx), [failed('legacy:'), failed('routing:'), failed('volatile:')]);
  });

  test('a folder that cannot be listed prints ERROR lines outside git', { skip: IS_ROOT }, () => {
    const fx = fixture({
      git: false,
      files: { 'AGENTS.md': ROOT_AGENTS },
      dirs: ['locked'],
      modes: { locked: 0o000 },
    });
    expectError(run(BRIDGE, ['audit'], fx), [...audit('AGENTS.md'), failed('legacy:'), failed('personal:')]);
    expectError(run(AGENT_FIRST, ['check'], fx), [
      ...LISTING_CHECKS.map(failed),
      C9_NO_SKILL,
      'ERROR C10 pull-request template check failed (see the message above)',
    ]);
  });

  test('an unreadable file prints ERROR C<n> and a bridge ERROR line', { skip: IS_ROOT }, () => {
    const claude = fixture({
      ...BASE,
      files: { ...BASE_FILES, 'CLAUDE.md': '@AGENTS.md\n' },
      modes: { 'CLAUDE.md': 0o000 },
    });
    expectError(run(AGENT_FIRST, ['check'], claude), ['ERROR C3 cannot read CLAUDE.md']);
    const node = fixture({
      ...BASE,
      files: { ...BASE_FILES, 'AGENTS.md': routed('api/AGENTS.md'), 'api/AGENTS.md': STALE },
      modes: { 'api/AGENTS.md': 0o000 },
    });
    expectError(run(AGENT_FIRST, ['check'], node), [
      'ERROR C5 cannot read api/AGENTS.md',
      'ERROR C7 cannot read api/AGENTS.md',
      'ERROR C8 cannot read api/AGENTS.md',
    ]);
    expectError(run(BRIDGE, ['verify'], node), ['ERROR volatile: cannot read api/AGENTS.md']);
  });

  test('a non-ASCII node is routed and read', () => {
    const fx = fixture({ ...BASE, files: { ...BASE_FILES, 'AGENTS.md': routed('é/AGENTS.md'), 'é/AGENTS.md': STALE } });
    // (f) git quoted the path, so the old block printed a false `FAIL C2` and `FINDING C5` line for it.
    expectRun(run(AGENT_FIRST, ['check'], fx), 0, []);
    expectRun(run(BRIDGE, ['verify'], fx), 0, []);
  });
});
