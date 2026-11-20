// Spec tests for the shipped agent-docs scripts (plan #169). Each expected line was recorded by running the
// current shell block of the skill once with bash on the same fixture (LC_ALL=C, so `sort` and globs use byte
// order). A comment names each intentional difference of the script contract:
// (a) no node_modules nodes, (b) exit 2 on ERROR, (c) non-git prune sets, (d) labeled audit lines, (e) --expect lines,
// (f) an ERROR line for a failed listing or an unreadable file, and raw non-ASCII paths, where the block went on.
// Plan #174 made the scripts omp-only: the .claude entry lines of detect and audit, C3, C4, C7, C9, and
// `convert-agent` state the new contract and have no shell block; the other lines keep the recorded output.
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
const BRIDGE = path.join(PLUGINS, 'docks/skills/claude-md-migration/scripts/bridge-check.mjs');

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
const TEST_SKILL = skill('x', '"Use when testing."');

// A repository that passes every agent-first check; each check test adds or removes entries.
const BASE_FILES = {
  'AGENTS.md': ROOT_AGENTS,
  '.agents/skills/verify/SKILL.md': VERIFY_SKILL,
  '.github/pull_request_template.md': '## Checklist\n',
};
const BASE = { files: BASE_FILES };

// One non-git folder for both skills: dist/ is pruned only by claude-md-migration, vendor/ and node_modules/ by both.
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
const MIGRATE = 'migrate it with claude-md-migration';
const C3_NEXT_TO = (file) => `FAIL C3 CLAUDE.md next to an AGENTS.md (omp ignores it; ${MIGRATE}): ${file}`;
const C3_CLAUDE_FOLDER = (file) =>
  `FAIL C3 .claude/CLAUDE.md (omp loads it instead of the AGENTS.md of that folder when a session starts there; ${MIGRATE}): ${file}`;
const C3_ALONE = (file) =>
  `FINDING C3 CLAUDE.md without an AGENTS.md next to it (it loads, but AGENTS.md is the convention; ${MIGRATE}): ${file}`;
const C3_PERSONAL = (file) =>
  `FINDING C3 CLAUDE.local.md that omp does not load (personal file; the user decides: list it in contextFiles.extra, move it to ~/.omp/agent/AGENTS.md, or keep it): ${file}`;
const C4 = (entry) => `FINDING C4 legacy .claude entry (agent-first-setup cleans it up): ${entry}`;
const C4_EXTERNAL = (entry) =>
  `FINDING C4 legacy .claude entry outside the repository (report it; never move or remove it): ${entry}`;
const C4_OTHER = (entry) => `FINDING C4 legacy .claude entry (report only; the user decides): ${entry}`;
const C3_LINK = (file) => `FAIL C3 CLAUDE.md link to AGENTS.md (remove the link; there is nothing to migrate): ${file}`;

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
  test('a present skill prints no link line, also when .claude/skills links to .agents/skills', () => {
    const own = fixture({ files: { '.agents/skills/verify/SKILL.md': VERIFY_SKILL } });
    expectRun(run(VERIFY, ['detect'], own), 0, ['verify skill: present']);
    const linkedFolder = fixture({
      files: { '.agents/skills/verify/SKILL.md': VERIFY_SKILL },
      links: { '.claude/skills': '../.agents/skills' },
    });
    expectRun(run(VERIFY, ['detect'], linkedFolder), 0, ['verify skill: present']);
  });

  test('one line per not observed mark', () => {
    const fx = fixture({ files: { '.agents/skills/verify/SKILL.md': MARKED_SKILL } });
    expectRun(run(VERIFY, ['detect'], fx), 0, [
      'verify skill: present',
      ...MARKS.map((m) => `verify unverified: ${m}`),
    ]);
  });

  test('a skill under .claude/skills is no verify skill', () => {
    const folder = fixture({ files: { '.claude/skills/verify/SKILL.md': VERIFY_SKILL } });
    expectRun(run(VERIFY, ['detect'], folder), 0, ['verify skill: missing']);
  });

  test('no skill', () => {
    expectRun(run(VERIFY, ['detect'], fixture()), 0, ['verify skill: missing']);
  });

  test('an unreadable skill prints the ERROR line', { skip: IS_ROOT }, () => {
    const fx = fixture({
      files: { '.agents/skills/verify/SKILL.md': VERIFY_SKILL },
      modes: { '.agents/skills/verify/SKILL.md': 0o000 },
    });
    // (b) the old block printed the same lines and exited 0.
    expectError(run(VERIFY, ['detect'], fx), [
      'verify skill: present',
      'ERROR verify skill check failed: cannot read .agents/skills/verify/SKILL.md',
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
  test('names .agents/skills/verify when an entry is there, a dangling link included, and no .claude entry; an unknown command is a usage error', () => {
    const fx = fixture({
      dirs: ['.agents/skills/verify'],
      links: { '.claude/skills/verify': '../../.agents/skills/verify' },
    });
    expectRun(run(VERIFY, ['entry-gate'], fx), 0, ['target occupied: .agents/skills/verify exists']);
    const dangling = fixture({ links: { '.agents/skills/verify': '../../gone' } });
    expectRun(run(VERIFY, ['entry-gate'], dangling), 0, ['target occupied: .agents/skills/verify exists']);
    expectRun(run(VERIFY, ['entry-gate'], fixture()), 0, []);
    assert.equal(run(VERIFY, ['bogus'], fx).status, 1);
  });
});

describe('verify-skill.mjs link', () => {
  test('is a usage error that names no link command and creates no .claude entry', () => {
    const fx = fixture({ files: { '.agents/skills/verify/SKILL.md': VERIFY_SKILL } });
    const result = run(VERIFY, ['link'], fx);
    expectRun(result, 1, []);
    assert.doesNotMatch(result.stderr, /\blink\b/u);
    assert.equal(fs.existsSync(path.join(fx.dir, '.claude')), false);
  });
});

describe('agent-first-check.mjs detect', () => {
  test('prints the Step 0 lines with the legacy skills, agents, and settings lines and no .claude/skills or verify link line, from the root and from a subfolder', () => {
    const fx = fixture({
      files: {
        'AGENTS.md': ROOT_AGENTS,
        '.gitignore': 'CLAUDE.local.md\ngen/\n',
        'CLAUDE.md': '@AGENTS.md\n',
        '.claude/CLAUDE.md': 'Use the review agent.\n',
        '.claude/agents/review.md': '---\nname: review\n---\n',
        '.claude/agents/locked.md': '---\nname: locked\n---\n',
        '.claude/agents/notes.txt': 'not an agent\n',
        '.claude/settings.json': '{}\n',
        '.claude/settings.local.json': '{}\n',
        'CLAUDE.local.md': 'my notes\n',
        'api/AGENTS.md': STALE,
        'api/CLAUDE.md': '@AGENTS.md\n',
        'gen/AGENTS.md': STALE,
        'gen/CLAUDE.md': 'generated\n',
        '.agents/skills/verify/SKILL.md': VERIFY_SKILL,
        '.claude/skills/local/SKILL.md': skill('local', '"Use when testing."'),
        '.github/pull_request_template.md': '## Checklist\n',
      },
      links: { '.claude/skills/verify': '../../.agents/skills/verify' },
    });
    const lines = [
      fx.dir,
      'root AGENTS.md: present',
      '.agents/skills: present',
      'legacy skills: .claude/skills',
      'legacy agents: .claude/agents/locked.md',
      'legacy agents: .claude/agents/review.md',
      'legacy settings: .claude/settings.json',
      'legacy settings: .claude/settings.local.json',
      'legacy: .claude/CLAUDE.md',
      'legacy: CLAUDE.md',
      'legacy: api/CLAUDE.md',
      'personal: CLAUDE.local.md',
      'node: api/AGENTS.md',
      'not-a-symlink: .claude/skills/local',
      'pull-request template: .github/pull_request_template.md (file)',
      'verify skill: present',
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
      'pull-request template: none',
      'verify skill: missing',
    ]);
  });

  test('an AGENTS.md under node_modules is no node', () => {
    const fx = fixture({ ...BASE, files: { ...BASE_FILES, 'node_modules/pkg/AGENTS.md': 'We currently ship.\n' } });
    // (a) the old block also printed `node: node_modules/pkg/AGENTS.md`.
    expectRun(run(AGENT_FIRST, ['detect'], fx), 0, [
      fx.dir,
      'root AGENTS.md: present',
      '.agents/skills: present',
      'pull-request template: .github/pull_request_template.md (file)',
      'verify skill: present',
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
      'legacy: CLAUDE.md',
      'legacy: dist/CLAUDE.md',
      'personal: CLAUDE.local.md',
      'node: sub/AGENTS.md',
      PR_ERROR,
      'verify skill: missing',
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

  test('C3 a CLAUDE.md next to an AGENTS.md and each .claude/CLAUDE.md fail, a lone CLAUDE.md and a CLAUDE.local.md are findings, and no node is hidden', () => {
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
        'tools/CLAUDE.md': '# Tool rules\n',
        'web/AGENTS.md': STALE,
        'web/CLAUDE.md': '@AGENTS.md\n',
      },
      links: { 'pkg/CLAUDE.md': 'AGENTS.md' },
    });
    expectRun(run(AGENT_FIRST, ['check'], fx), 0, [
      C3_CLAUDE_FOLDER('.claude/CLAUDE.md'),
      C3_PERSONAL('CLAUDE.local.md'),
      C3_NEXT_TO('CLAUDE.md'),
      C3_CLAUDE_FOLDER('api/.claude/CLAUDE.md'),
      C3_NEXT_TO('docs/CLAUDE.md'),
      C3_LINK('pkg/CLAUDE.md'),
      C3_ALONE('tools/CLAUDE.md'),
      C3_NEXT_TO('web/CLAUDE.md'),
    ]);
  });

  test('C4 a finding for each .claude/skills entry (link or folder, broken or not), each .claude/agents/*.md file, and each settings file; dot names are skipped', () => {
    const fx = fixture({
      files: {
        ...BASE_FILES,
        '.claude/skills/local/SKILL.md': skill('local', '"Use when testing."'),
        'ext/skill/SKILL.md': skill('skill', '"Use when testing."'),
        '.claude/agents/review.md': '---\nname: review\n---\n',
        '.claude/agents/notes.txt': 'not an agent\n',
        '.claude/settings.json': '{}\n',
        '.claude/settings.local.json': '{}\n',
      },
      links: {
        '.claude/skills/verify': '../../.agents/skills/verify',
        '.claude/skills/ext': '../../ext/skill',
        '.claude/skills/gone': '../../.agents/skills/gone',
      },
      dirs: ['.claude/skills/.hidden'],
    });
    expectRun(run(AGENT_FIRST, ['check'], fx), 0, [
      C4('.claude/skills/ext'),
      C4('.claude/skills/gone'),
      C4('.claude/skills/local'),
      C4('.claude/skills/verify'),
      C4('.claude/agents/review.md'),
      C4('.claude/settings.json'),
      C4('.claude/settings.local.json'),
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
      'FINDING C7 eager import AGENTS.md:13: @docs/guide.md (./docs/guide.md, 2 lines, omp expands it when this file loads)',
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
      `FINDING C7 eager import AGENTS.md:6: @~/notes.md (${home}/notes.md, 1 lines, omp expands it when this file loads)`,
      `FINDING C7 eager import AGENTS.md:7: @${absolute} (${absolute}, 3 lines, omp expands it when this file loads)`,
      `FINDING C7 eager import AGENTS.md:8: @${missing} (no file at ${missing})`,
    ]);
  });

  test('C9 a missing skill and unverified commands; a skill without a .claude/skills/verify link passes', () => {
    const noSkill = fixture({ files: { ...BASE_FILES, '.agents/skills/verify/SKILL.md': undefined } });
    expectRun(run(AGENT_FIRST, ['check'], noSkill), 0, [C9_NO_SKILL]);
    expectRun(run(AGENT_FIRST, ['check'], fixture({ files: BASE_FILES })), 0, []);
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
      links: { '.github/pull_request_template.md': 'missing.md' },
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
      C3_ALONE('dist/CLAUDE.md'),
      C9_NO_SKILL,
      'ERROR C10 pull-request template check failed (see the message above)',
    ]);
    assert.equal(run(AGENT_FIRST, ['bogus'], fx).status, 1);
  });
});

// Every entry below a fixture folder except .git: a file gives its text, a symlink its target, a folder `folder`.
function treeEntries(dir) {
  const entries = {};
  const walk = (folder) => {
    for (const entry of fs.readdirSync(path.join(dir, folder), { withFileTypes: true })) {
      const relative = path.posix.join(folder, entry.name);
      if (relative === '.git') continue;
      const abs = path.join(dir, relative);
      if (entry.isSymbolicLink()) entries[relative] = `link ${fs.readlinkSync(abs)}`;
      else if (entry.isDirectory()) {
        entries[relative] = 'folder';
        walk(relative);
      } else entries[relative] = fs.readFileSync(abs, 'utf8');
    }
  };
  walk('');
  return entries;
}

const AGENT_PATH = '.claude/agents/rev.md';
const AGENT_NAME = 'name: rev';
const AGENT_DESCRIPTION = 'description: Reviews a diff for bugs.';
const claudeAgent = (...fields) => `---\n${fields.join('\n')}\n---\n\nYou review diffs.\n`;

// One convert-agent run on a Claude agent file; the run must leave every entry of the fixture as it was.
function convertAgent(text, args = [AGENT_PATH]) {
  const fx = fixture({ files: { 'AGENTS.md': ROOT_AGENTS, [AGENT_PATH]: text } });
  const before = treeEntries(fx.dir);
  const result = run(AGENT_FIRST, ['convert-agent', ...args], fx);
  assert.deepEqual(treeEntries(fx.dir), before, 'convert-agent writes no file');
  return result;
}

// A refusal is one ERROR line that names the agent file and the reason, exit 2, and no agent text.
function expectRefusal(fields, reason) {
  expectRun(convertAgent(claudeAgent(AGENT_NAME, AGENT_DESCRIPTION, ...fields)), 2, [
    `ERROR convert-agent ${AGENT_PATH}: ${reason}; port it by hand`,
  ]);
}

describe('agent-first-check.mjs convert-agent', () => {
  test('prints the omp agent text of a simple agent with tools: read, grep, names the dropped model, color, and effort on stderr, and writes no file', () => {
    const result = convertAgent(
      claudeAgent(AGENT_NAME, AGENT_DESCRIPTION, 'tools: Read, Grep', 'model: sonnet', 'color: blue', 'effort: high'),
    );
    expectRun(result, 0, ['---', AGENT_NAME, AGENT_DESCRIPTION, 'tools: read, grep', '---', '', 'You review diffs.']);
    for (const field of ['model', 'color', 'effort']) assert.match(result.stderr, new RegExp(`\\b${field}\\b`, 'u'));
  });

  test('maps Read, Grep, Glob, Bash, Edit, Write, and WebSearch to their omp names', () => {
    const tools = 'tools: Read, Grep, Glob, Bash, Edit, Write, WebSearch';
    expectRun(convertAgent(claudeAgent(AGENT_NAME, AGENT_DESCRIPTION, tools)), 0, [
      '---',
      AGENT_NAME,
      AGENT_DESCRIPTION,
      'tools: read, grep, glob, bash, edit, write, web_search',
      '---',
      '',
      'You review diffs.',
    ]);
  });

  test('a missing path or a second path is a usage error', () => {
    const text = claudeAgent(AGENT_NAME, AGENT_DESCRIPTION, 'tools: Read');
    expectRun(convertAgent(text, []), 1, []);
    expectRun(convertAgent(text, [AGENT_PATH, AGENT_PATH]), 1, []);
  });

  test('refuses an agent without a tools list', () => {
    expectRefusal(['model: sonnet'], 'no tools list');
  });

  test('refuses disallowedTools, also when no tools list is there', () => {
    expectRefusal(['disallowedTools: Write, Edit, Bash'], 'disallowedTools has no omp form');
  });

  test('refuses a tool with no omp name', () => {
    expectRefusal(['tools: Read, WebFetch'], 'tool WebFetch has no omp name');
  });

  test('refuses a tool with a pattern', () => {
    expectRefusal(['tools: Read, Bash(git status)'], 'tool Bash(git status) has a pattern');
  });

  test('refuses permissionMode', () => {
    expectRefusal(['tools: Read', 'permissionMode: plan'], 'field permissionMode has no omp form');
  });

  test('refuses an unknown field', () => {
    expectRefusal(['tools: Read', 'unknownField: yes'], 'field unknownField has no omp form');
  });

  test('refuses an agent without name or without description', () => {
    for (const [fields, reason] of [
      [[AGENT_DESCRIPTION, 'tools: Read'], 'no name field'],
      [[AGENT_NAME, 'tools: Read'], 'no description field'],
    ]) {
      expectRun(convertAgent(claudeAgent(...fields)), 2, [
        `ERROR convert-agent ${AGENT_PATH}: ${reason}; port it by hand`,
      ]);
    }
  });

  // Each value leaves the field empty after its comment and its outer quotes go.
  test('refuses an empty or null name or description', () => {
    for (const value of ['', ' ""', " ''", ' ~', ' null', ' NULL', ' # no value', ' "" # empty']) {
      for (const [fields, reason] of [
        [[`name:${value}`, AGENT_DESCRIPTION, 'tools: Read'], 'no name field'],
        [[AGENT_NAME, `description:${value}`, 'tools: Read'], 'no description field'],
      ]) {
        expectRun(convertAgent(claudeAgent(...fields)), 2, [
          `ERROR convert-agent ${AGENT_PATH}: ${reason}; port it by hand`,
        ]);
      }
    }
  });

  test('refuses a field that appears twice', () => {
    expectRefusal(['tools: Read', 'tools: Grep'], 'field tools appears twice');
    expectRun(convertAgent(claudeAgent(AGENT_NAME, AGENT_NAME, AGENT_DESCRIPTION, 'tools: Read')), 2, [
      `ERROR convert-agent ${AGENT_PATH}: field name appears twice; port it by hand`,
    ]);
  });

  test('refuses a name that omp reserves, in any letter case and quoted', () => {
    for (const [value, name] of [
      ['main', 'main'],
      ['sub', 'sub'],
      ['Main', 'Main'],
      ['"sub" # quoted', 'sub'],
    ]) {
      expectRun(convertAgent(claudeAgent(`name: ${value}`, AGENT_DESCRIPTION, 'tools: Read')), 2, [
        `ERROR convert-agent ${AGENT_PATH}: name ${name} is reserved in omp; port it by hand`,
      ]);
    }
  });

  test('refuses a name that is no safe file name', () => {
    for (const name of ['Rev', 'my agent', '../rev', 'team/rev', 'rev-', '-rev', 'rev--x', 'rev_x', 'rev.md']) {
      expectRun(convertAgent(claudeAgent(`name: ${name}`, AGENT_DESCRIPTION, 'tools: Read')), 2, [
        `ERROR convert-agent ${AGENT_PATH}: name ${name} is not a safe file name; port it by hand`,
      ]);
    }
  });

  test('writes the name without its quotes and comment', () => {
    const result = convertAgent(claudeAgent('name: "code-review-2" # the reviewer', AGENT_DESCRIPTION, 'tools: Read'));
    expectRun(result, 0, [
      '---',
      'name: code-review-2',
      AGENT_DESCRIPTION,
      'tools: read',
      '---',
      '',
      'You review diffs.',
    ]);
  });

  test('converts each tools form: comma list, quoted scalar, trailing comment, flow list, block list, with comments', () => {
    const expected = ['---', AGENT_NAME, AGENT_DESCRIPTION, 'tools: read, grep', '---', '', 'You review diffs.'];
    for (const tools of [
      ['tools: Read, Grep'],
      ['tools: "Read, Grep"'],
      ["tools: 'Read, Grep'"],
      ['tools: "Read", "Grep"'],
      ['tools: Read, Grep # the reviewer reads only'],
      ['tools: [Read, Grep]'],
      ['tools: ["Read", \'Grep\']'],
      ['tools: [Read, Grep] # the reviewer reads only'],
      ['tools:', '  - Read', '  - Grep'],
      ['tools:', '  - "Read" # reads files', '  - Grep # searches'],
      ['tools: # the list', '  - Read', '  # a comment line', '  - Grep'],
    ]) {
      expectRun(convertAgent(claudeAgent(AGENT_NAME, AGENT_DESCRIPTION, ...tools)), 0, expected);
    }
  });

  test('a # inside quotes is no comment', () => {
    expectRefusal(['tools: "Read # not a comment"'], 'tool Read # not a comment has no omp name');
  });

  test('refuses a file without frontmatter and a frontmatter line that is no field', () => {
    for (const text of ['You review diffs.\n', `---\n${AGENT_NAME}\n${AGENT_DESCRIPTION}\ntools: Read\n`]) {
      expectRun(convertAgent(text), 2, [`ERROR convert-agent ${AGENT_PATH}: no frontmatter; port it by hand`]);
    }
    expectRefusal(['tools: Read', 'just text'], 'frontmatter line "just text" is no field');
  });

  test('a missing file prints the ERROR line and names the cause on stderr', () => {
    const missing = '.claude/agents/missing.md';
    const text = claudeAgent(AGENT_NAME, AGENT_DESCRIPTION, 'tools: Read');
    expectError(convertAgent(text, [missing]), [`ERROR convert-agent ${missing}: cannot read the file`]);
  });
});

// The Step 2 entries in block order; `audit(...present)` gives the four presence lines.
const AUDIT_PATHS = ['AGENTS.md', 'CLAUDE.md (root)', '.claude/CLAUDE.md', 'CLAUDE.local.md'];
const audit = (...present) => AUDIT_PATHS.map((p) => `${present.includes(p) ? 'EXISTS' : 'MISSING'} ${p}`);
// The last audit line of a repository that is no omp plugin source.
const NO_PLUGIN = 'plugin author: no';

describe('bridge-check.mjs audit', () => {
  test('the four presence lines, then the legacy skills, legacy agents, and legacy settings lines of the root .claude folder, then legacy and personal paths, also when started in a subfolder', () => {
    const fx = fixture({
      files: {
        '.gitignore': 'CLAUDE.local.md\ngen/\n',
        'AGENTS.md': ROOT_AGENTS,
        'CLAUDE.md': 'rules\n',
        '.claude/CLAUDE.md': 'rules\n',
        'CLAUDE.local.md': 'mine\n',
        '.claude/agents/review.md': '# Review\n',
        '.claude/settings.json': '{}\n',
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
      'legacy skills: .claude/skills',
      'legacy agents: .claude/agents/review.md',
      'legacy settings: .claude/settings.json',
      'legacy: .claude/CLAUDE.md',
      'legacy: CLAUDE.md',
      'legacy: api/CLAUDE.md',
      'legacy: dist/CLAUDE.md',
      'personal: CLAUDE.local.md',
      'personal: api/CLAUDE.local.md',
      NO_PLUGIN,
    ];
    expectRun(run(BRIDGE, ['audit'], fx), 0, lines);
    expectRun(run(BRIDGE, ['audit'], fx, 'api'), 0, lines);
  });

  test('an empty repository', () => {
    expectRun(run(BRIDGE, ['audit'], fixture()), 0, [...audit(), NO_PLUGIN]);
  });

  test('a dangling CLAUDE.local.md or CLAUDE.md symlink is no file', () => {
    const links = { 'CLAUDE.local.md': 'missing.md', 'api/CLAUDE.local.md': 'missing.md' };
    expectRun(run(BRIDGE, ['audit'], fixture({ links })), 0, [...audit(), NO_PLUGIN]);
    // Outside git, the Step 2 `find -type f` listed no symlink either.
    const outside = fixture({
      git: false,
      files: { 'api/CLAUDE.md': 'rules\n' },
      links: { ...links, 'CLAUDE.md': 'missing.md' },
    });
    expectRun(run(BRIDGE, ['audit'], outside), 0, [...audit(), 'legacy: api/CLAUDE.md', NO_PLUGIN]);
  });

  test('plugin author: yes for an omp plugin catalog or a package.json omp object, else no', () => {
    const catalog = fixture({ files: { '.omp-plugin/marketplace.json': '{"name":"m"}\n' } });
    expectRun(run(BRIDGE, ['audit'], catalog), 0, [...audit(), 'plugin author: yes (.omp-plugin/marketplace.json)']);
    const manifest = fixture({ files: { 'package.json': '{"name":"p","omp":{"skills":["./skills"]}}\n' } });
    expectRun(run(BRIDGE, ['audit'], manifest), 0, [...audit(), 'plugin author: yes (package.json omp object)']);
    for (const text of [
      '{"name":"p"}\n',
      '{"name":"p","omp":["./skills"]}\n',
      '{"name":"p","omp":null}\n',
      '{ no json\n',
    ]) {
      expectRun(run(BRIDGE, ['audit'], fixture({ files: { 'package.json': text } })), 0, [...audit(), NO_PLUGIN]);
    }
  });

  test('a CLAUDE.md or .claude/CLAUDE.md link to the AGENTS.md of its folder is a legacy link; verify still reports it', () => {
    const fx = fixture({
      files: { 'AGENTS.md': ROOT_AGENTS, 'docs/AGENTS.md': STALE, 'docs/other.md': 'other\n' },
      links: {
        'CLAUDE.md': 'AGENTS.md',
        '.claude/CLAUDE.md': '../AGENTS.md',
        'docs/CLAUDE.md': 'other.md',
      },
    });
    expectRun(run(BRIDGE, ['audit'], fx), 0, [
      ...audit('AGENTS.md', 'CLAUDE.md (root)', '.claude/CLAUDE.md'),
      'legacy link: .claude/CLAUDE.md',
      'legacy link: CLAUDE.md',
      'legacy: docs/CLAUDE.md',
      NO_PLUGIN,
    ]);
    expectRun(run(BRIDGE, ['verify'], fx), 0, [
      'BROKEN: legacy CLAUDE.md still present: .claude/CLAUDE.md',
      'BROKEN: legacy CLAUDE.md still present: CLAUDE.md',
      'BROKEN: legacy CLAUDE.md still present: docs/CLAUDE.md',
      'HANDOFF context-tree: unrouted node docs/AGENTS.md',
    ]);
  });
});

describe('non-git prune sets', () => {
  test('dist/CLAUDE.md is legacy for agent-first-setup and pruned for claude-md-migration', () => {
    const fx = fixture(NON_GIT);
    // (c) each skill walks with its own prune set; (d) labeled paths without the `./` of find.
    expectRun(run(BRIDGE, ['audit'], fx), 0, [
      ...audit('AGENTS.md', 'CLAUDE.md (root)', 'CLAUDE.local.md'),
      'legacy: CLAUDE.md',
      'personal: CLAUDE.local.md',
      NO_PLUGIN,
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
    expectRun(run(BRIDGE, ['audit'], fx), 0, [...audit(), ...sorted.map((n) => `legacy: ${n}/CLAUDE.md`), NO_PLUGIN]);
  });
});

describe('bridge-check.mjs verify', () => {
  test('a migrated repository prints nothing, also with .claude entries left in place, with and without --expect', () => {
    const fx = fixture({
      files: {
        'AGENTS.md': routed('api/AGENTS.md'),
        'api/AGENTS.md': STALE,
        '.agents/skills/x/SKILL.md': TEST_SKILL,
        '.claude/skills/plain/SKILL.md': TEST_SKILL,
        '.claude/agents/review.md': '# Review\n',
        '.claude/settings.json': '{}\n',
      },
      links: { '.claude/skills/x': '../../.agents/skills/x', '.claude/skills/gone': '../../.agents/skills/gone' },
    });
    expectRun(run(BRIDGE, ['verify'], fx), 0, []);
    expectRun(run(BRIDGE, ['verify', '--expect', 'AGENTS.md', '--expect', 'api/AGENTS.md'], fx), 0, []);
  });

  test('a missing AGENTS.md, legacy files, and missing --expect paths; no BROKEN line for a .claude/skills link', () => {
    const fx = fixture({
      files: {
        'CLAUDE.md': 'rules\n',
        '.claude/CLAUDE.md': 'rules\n',
        'api/CLAUDE.md': 'rules\n',
        'api/AGENTS.md': 'We currently ship.\n',
        'node_modules/pkg/CLAUDE.md': 'package\n',
        'node_modules/pkg/AGENTS.md': 'We recently shipped.\n',
      },
      links: {
        '.claude/skills/gone': '../../.agents/skills/gone',
        '.claude/skills/.dot': '../../.agents/skills/.dot',
      },
    });
    const head = [
      'BROKEN: AGENTS.md missing',
      'BROKEN: legacy CLAUDE.md still present: .claude/CLAUDE.md',
      'BROKEN: legacy CLAUDE.md still present: CLAUDE.md',
      'BROKEN: legacy CLAUDE.md still present: api/CLAUDE.md',
    ];
    const tail = ['HANDOFF context-tree: unrouted node api/AGENTS.md', 'VOLATILE time-relative api/AGENTS.md:1'];
    expectRun(run(BRIDGE, ['verify'], fx), 0, [...head, ...tail]);
    // (e) one line per --expect path that is not a file; it replaces the three placeholder lines of the old block.
    expectRun(run(BRIDGE, ['verify', '--expect', 'docs/AGENTS.md', '--expect', 'api'], fx), 0, [
      ...head,
      'BROKEN: docs/AGENTS.md missing',
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
      failed('legacy:'),
      failed('personal:'),
      failed('node:'),
      'pull-request template: .github/pull_request_template.md (file)',
      'verify skill: present',
    ]);
    expectError(run(BRIDGE, ['audit'], fx), [...audit('AGENTS.md', 'CLAUDE.md (root)'), failed('legacy:'), NO_PLUGIN]);
    expectError(run(BRIDGE, ['verify'], fx), [failed('legacy:'), failed('routing:'), failed('volatile:')]);
  });

  test('a folder that cannot be listed prints ERROR lines outside git', { skip: IS_ROOT }, () => {
    const fx = fixture({
      git: false,
      files: { 'AGENTS.md': ROOT_AGENTS },
      dirs: ['locked'],
      modes: { locked: 0o000 },
    });
    expectError(run(BRIDGE, ['audit'], fx), [...audit('AGENTS.md'), failed('legacy:'), failed('personal:'), NO_PLUGIN]);
    expectError(run(AGENT_FIRST, ['check'], fx), [
      ...LISTING_CHECKS.map(failed),
      C9_NO_SKILL,
      'ERROR C10 pull-request template check failed (see the message above)',
    ]);
  });

  test('an unreadable file prints ERROR C<n> and a bridge ERROR line, except for C3', { skip: IS_ROOT }, () => {
    const claude = fixture({
      ...BASE,
      files: { ...BASE_FILES, 'CLAUDE.md': '@AGENTS.md\n' },
      modes: { 'CLAUDE.md': 0o000 },
    });
    // C3 judges a CLAUDE.md by the AGENTS.md next to it, so an unreadable one still gets its FAIL line.
    expectRun(run(AGENT_FIRST, ['check'], claude), 0, [C3_NEXT_TO('CLAUDE.md')]);
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

// The .claude entry, legacy, and C3 and C4 lines of the three listings for one fixture.
function claudeLines(fx) {
  const pick = (result, pattern) => ({ ...result, lines: result.lines.filter((line) => pattern.test(line)) });
  return {
    detect: pick(run(AGENT_FIRST, ['detect'], fx), /^(legacy|not-a-symlink|ERROR)/u),
    check: pick(run(AGENT_FIRST, ['check'], fx), /^(FAIL|FINDING|ERROR) C[34] /u),
    audit: pick(run(BRIDGE, ['audit'], fx), /^(legacy|ERROR)/u),
  };
}

function expectClaudeLines(fx, status, { detect, check, audit: auditLines = detect }) {
  const lines = claudeLines(fx);
  expectRun(lines.detect, status, detect);
  expectRun(lines.check, status, check);
  expectRun(lines.audit, status, auditLines);
}

describe('.claude entries and root context files in detect, check, and audit', () => {
  test('a .claude, .claude/skills, or .claude/agents link to a place outside the repository is reported with its target as read and nothing below it', () => {
    const outside = fixture({
      git: false,
      files: {
        'CLAUDE.md': 'rules\n',
        'skills/x/SKILL.md': TEST_SKILL,
        'agents/rev.md': '# Rev\n',
        'settings.json': '{}\n',
        'commands/deploy.md': '# Deploy\n',
      },
    });
    const whole = fixture({ ...BASE, links: { '.claude': outside.dir } });
    expectClaudeLines(whole, 0, {
      detect: [`legacy external: .claude -> ${outside.dir}`],
      check: [C4_EXTERNAL('.claude')],
    });
    const agentsTarget = `../../${path.basename(outside.dir)}/agents`;
    const parts = fixture({
      ...BASE,
      files: { ...BASE_FILES, '.claude/settings.json': '{}\n' },
      links: { '.claude/skills': path.join(outside.dir, 'skills'), '.claude/agents': agentsTarget },
    });
    expectClaudeLines(parts, 0, {
      detect: [
        `legacy external: .claude/skills -> ${path.join(outside.dir, 'skills')}`,
        `legacy external: .claude/agents -> ${agentsTarget}`,
        'legacy settings: .claude/settings.json',
      ],
      check: [C4_EXTERNAL('.claude/skills'), C4_EXTERNAL('.claude/agents'), C4('.claude/settings.json')],
    });
    // A link that stays inside the repository is no external entry: its entries are listed.
    const inside = fixture({
      ...BASE,
      files: { ...BASE_FILES, 'claude-agents/rev.md': '# Rev\n' },
      links: { '.claude': 'claude-config', 'claude-config/agents': '../claude-agents' },
      dirs: ['claude-config/skills/local'],
    });
    expectClaudeLines(inside, 0, {
      detect: [
        'legacy skills: .claude/skills',
        'legacy agents: .claude/agents/rev.md',
        'not-a-symlink: .claude/skills/local',
      ],
      check: [C4('.claude/skills/local'), C4('.claude/agents/rev.md')],
      audit: ['legacy skills: .claude/skills', 'legacy agents: .claude/agents/rev.md'],
    });
  });

  test('each other .claude entry, dot names too, is a legacy other entry that is only reported', () => {
    const fx = fixture({
      ...BASE,
      files: {
        ...BASE_FILES,
        '.claude/commands/deploy.md': '# Deploy\n',
        '.claude/.mcp.json': '{}\n',
        '.claude/settings.json': '{}\n',
      },
    });
    expectClaudeLines(fx, 0, {
      detect: [
        'legacy settings: .claude/settings.json',
        'legacy other: .claude/.mcp.json',
        'legacy other: .claude/commands',
      ],
      check: [C4('.claude/settings.json'), C4_OTHER('.claude/.mcp.json'), C4_OTHER('.claude/commands')],
    });
  });

  test('an unreadable .claude/agents prints the legacy entries ERROR line in detect and audit, and ERROR C4 in check', {
    skip: IS_ROOT,
  }, () => {
    const fx = fixture({
      ...BASE,
      files: { ...BASE_FILES, '.claude/settings.json': '{}\n' },
      dirs: ['.claude/agents'],
      modes: { '.claude/agents': 0o000 },
    });
    const entries = 'ERROR legacy entries: file listing failed (see the message above)';
    const lines = claudeLines(fx);
    expectError(lines.detect, [entries]);
    expectError(lines.check, ['ERROR C4 file listing failed (see the message above)']);
    // The CLAUDE.local.md walk of audit enters every folder, so it cannot finish either.
    expectError(lines.audit, [entries, 'ERROR personal: file listing failed (see the message above)']);
  });

  test('a root CLAUDE.md and .claude/CLAUDE.md count also when git ignores them; a nested ignored one does not', () => {
    const fx = fixture({
      ...BASE,
      files: {
        ...BASE_FILES,
        '.gitignore': 'CLAUDE.md\n.claude/\n',
        'CLAUDE.md': 'rules\n',
        '.claude/CLAUDE.md': 'rules\n',
        'api/CLAUDE.md': 'rules\n',
      },
    });
    expectClaudeLines(fx, 0, {
      detect: ['legacy: .claude/CLAUDE.md', 'legacy: CLAUDE.md'],
      check: [C3_CLAUDE_FOLDER('.claude/CLAUDE.md'), C3_NEXT_TO('CLAUDE.md')],
    });
    expectRun(run(BRIDGE, ['verify'], fx), 0, [
      'BROKEN: legacy CLAUDE.md still present: .claude/CLAUDE.md',
      'BROKEN: legacy CLAUDE.md still present: CLAUDE.md',
    ]);
  });

  test('C3 a CLAUDE.md or .claude/CLAUDE.md link to the AGENTS.md of its folder; a link to another AGENTS.md is no such link', () => {
    const fx = fixture({
      ...BASE,
      files: { ...BASE_FILES, 'AGENTS.md': routed('docs/AGENTS.md'), 'docs/AGENTS.md': STALE },
      links: { 'CLAUDE.md': 'AGENTS.md', '.claude/CLAUDE.md': '../AGENTS.md', 'docs/CLAUDE.md': '../AGENTS.md' },
    });
    expectClaudeLines(fx, 0, {
      detect: ['legacy: .claude/CLAUDE.md', 'legacy: CLAUDE.md', 'legacy: docs/CLAUDE.md'],
      check: [C3_LINK('.claude/CLAUDE.md'), C3_LINK('CLAUDE.md'), C3_NEXT_TO('docs/CLAUDE.md')],
      audit: ['legacy link: .claude/CLAUDE.md', 'legacy link: CLAUDE.md', 'legacy: docs/CLAUDE.md'],
    });
  });
});
