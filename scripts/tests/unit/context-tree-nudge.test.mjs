import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const EXTENSION = path.resolve(import.meta.dirname, '../../../plugins/docks/extensions/context-tree-nudge.ts');
const NUDGE =
  /^Edited files inside context-tree node\(s\): (.+)\. If conventions in a listed folder changed, run context-tree refresh on it \(no-op when nothing semantic changed\)\.$/u;

// The fixture folders: `main` and `second` are git repositories with nested AGENTS.md nodes, `plain` is no
// repository. GIT_CEILING_DIRECTORIES stops git above the fixture, so a repository around the temporary
// folder cannot make `plain` part of a repository.
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'context-tree-nudge-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    'main/AGENTS.md': '# root\n',
    'main/README.md': 'readme\n',
    'main/lib/c.txt': 'c\n',
    'main/sub/AGENTS.md': '# sub\n',
    'main/sub/a.txt': 'a\n',
    'main/sub/deep/b.txt': 'b\n',
    'main/sub/nested/AGENTS.md': '# nested\n',
    'main/sub/nested/n.txt': 'n\n',
    'main/other/AGENTS.md': '# other\n',
    'main/other/w.txt': 'w\n',
    'second/AGENTS.md': '# second root\n',
    'second/pkg/AGENTS.md': '# pkg\n',
    'second/pkg/m.txt': 'm\n',
    'plain/node/AGENTS.md': '# plain node\n',
    'plain/node/f.txt': 'f\n',
  };
  for (const [relative, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), text);
  }
  for (const repo of ['main', 'second']) {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: path.join(root, repo) });
  }
  return {
    root,
    main: path.join(root, 'main'),
    second: path.join(root, 'second'),
    plain: path.join(root, 'plain'),
  };
}

// Run the extension factory with a fake `pi` that records each handler, and return the one `tool_result` handler.
async function toolResultHandler() {
  const { default: factory } = await import(EXTENSION);
  assert.equal(typeof factory, 'function', 'the extension must export a default factory');
  const handlers = new Map();
  await factory({ on: (name, handler) => handlers.set(name, [...(handlers.get(name) ?? []), handler]) });
  const list = handlers.get('tool_result') ?? [];
  assert.equal(list.length, 1, 'the extension must register one tool_result handler');
  return list[0];
}

// Drive the tool_result handler once, with the session folder `cwd`.
async function runNudge(dirs, { cwd = dirs.main, toolName, input = {}, details, isError = false }) {
  const handler = await toolResultHandler();
  const event = { type: 'tool_result', toolName, toolCallId: 'call_1', input, content: [], details, isError };
  const ctx = { cwd, sessionManager: { getSessionId: () => 's1' } };
  const ceiling = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = path.dirname(dirs.root);
  try {
    return await handler(event, ctx);
  } finally {
    if (ceiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
    else process.env.GIT_CEILING_DIRECTORIES = ceiling;
  }
}

// The node folders that the nudge text lists, in its order. The rest of the text must be the nudge sentence.
function nudgeNodes(result) {
  assert.deepEqual(Object.keys(result ?? {}), ['additionalContext'], `expected a nudge, got ${JSON.stringify(result)}`);
  const match = NUDGE.exec(result.additionalContext);
  assert.ok(match, `the nudge text is not the nudge sentence: ${result.additionalContext}`);
  return match[1].split(', ');
}

test('an edit with details.path inside a node names the nearest node', async (t) => {
  const dirs = fixture(t);
  const edit = (file) => runNudge(dirs, { toolName: 'edit', details: { path: path.join(dirs.main, file) } });
  assert.deepEqual(nudgeNodes(await edit('sub/a.txt')), ['sub']);
  // A folder without AGENTS.md belongs to the node above it; a nested node wins over its parent.
  assert.deepEqual(nudgeNodes(await edit('sub/deep/b.txt')), ['sub']);
  assert.deepEqual(nudgeNodes(await edit('sub/nested/n.txt')), ['sub/nested']);
  // A tool that does not change files gets no nudge.
  const read = await runNudge(dirs, { toolName: 'read', details: { path: path.join(dirs.main, 'sub/a.txt') } });
  assert.equal(read, undefined);
});

test('an edit with details.perFileResults names the node of each path and of each move source', async (t) => {
  const dirs = fixture(t);
  const result = await runNudge(dirs, {
    toolName: 'edit',
    details: {
      perFileResults: [
        { path: path.join(dirs.main, 'sub/a.txt'), op: 'update' },
        { path: path.join(dirs.main, 'sub/deep/b.txt'), op: 'update' },
        {
          path: path.join(dirs.main, 'sub/nested/moved.txt'),
          sourcePath: path.join(dirs.main, 'other/w.txt'),
          move: true,
          op: 'update',
        },
      ],
    },
  });
  // Each node comes once.
  assert.deepEqual(nudgeNodes(result).sort(), ['other', 'sub', 'sub/nested']);
});

test('a write with details.resolvedPath names its node', async (t) => {
  const dirs = fixture(t);
  const result = await runNudge(dirs, {
    toolName: 'write',
    input: { path: 'other/w.txt', content: 'w\n' },
    details: { resolvedPath: path.join(dirs.main, 'other/w.txt') },
  });
  assert.deepEqual(nudgeNodes(result), ['other']);
});

test('a write to a URL target gets no nudge', async (t) => {
  const dirs = fixture(t);
  for (const target of ['local://notes.md', 'agent://Main', 'xd://bash']) {
    const result = await runNudge(dirs, {
      toolName: 'write',
      input: { path: target, content: 'x\n' },
      details: { resolvedPath: path.join(dirs.main, 'sub/a.txt') },
    });
    assert.equal(result, undefined, target);
  }
});

test('an ast_edit preview gets no nudge', async (t) => {
  const dirs = fixture(t);
  const result = await runNudge(dirs, {
    toolName: 'ast_edit',
    input: { ops: [], paths: ['sub/a.txt'] },
    details: { applied: false, files: ['sub/a.txt'], cwd: dirs.main },
  });
  assert.equal(result, undefined);
});

test('a write to xd://resolve after an ast_edit names the nodes of its files, relative to ctx.cwd', async (t) => {
  const dirs = fixture(t);
  const result = await runNudge(dirs, {
    toolName: 'write',
    input: { path: 'xd://resolve', content: '' },
    details: {
      xdev: {
        inner: {
          action: 'apply',
          sourceToolName: 'ast_edit',
          sourceResultDetails: { applied: true, files: ['sub/nested/n.txt', 'other/w.txt'], scopePath: '.' },
        },
      },
    },
  });
  assert.deepEqual(nudgeNodes(result), ['sub/nested', 'other']);
});

test('a failed call gets no nudge', async (t) => {
  const dirs = fixture(t);
  const result = await runNudge(dirs, {
    toolName: 'edit',
    details: { path: path.join(dirs.main, 'sub/a.txt') },
    isError: true,
  });
  assert.equal(result, undefined);
});

test('a file whose nearest AGENTS.md is the repository root gets no nudge', async (t) => {
  const dirs = fixture(t);
  for (const file of ['README.md', 'lib/c.txt']) {
    const result = await runNudge(dirs, { toolName: 'edit', details: { path: path.join(dirs.main, file) } });
    assert.equal(result, undefined, file);
  }
});

test('a path in another repository than ctx.cwd names the node of that repository', async (t) => {
  const dirs = fixture(t);
  const result = await runNudge(dirs, {
    cwd: dirs.main,
    toolName: 'edit',
    details: { path: path.join(dirs.second, 'pkg/m.txt') },
  });
  assert.deepEqual(nudgeNodes(result), ['pkg']);
});

test('a path outside any git repository gets no nudge', async (t) => {
  const dirs = fixture(t);
  const result = await runNudge(dirs, {
    cwd: dirs.plain,
    toolName: 'edit',
    details: { path: path.join(dirs.plain, 'node/f.txt') },
  });
  assert.equal(result, undefined);
});
