import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { finished } from 'node:stream/promises';

export function startNodeTask(name, args, {
  cwd,
  tasks,
  errorStream = process.stderr,
  artifactRoot = os.tmpdir(),
} = {}) {
  const taskStartedAt = performance.now();
  const artifactDirectory = fs.mkdtempSync(path.join(artifactRoot, 'docks-ci-task-'));
  fs.chmodSync(artifactDirectory, 0o700);
  const stdoutPath = path.join(artifactDirectory, 'stdout.log');
  const stderrPath = path.join(artifactDirectory, 'stderr.log');
  const stdoutFile = fs.createWriteStream(stdoutPath, { flags: 'wx', mode: 0o600 });
  const stderrFile = fs.createWriteStream(stderrPath, { flags: 'wx', mode: 0o600 });

  return new Promise((resolve) => {
    const child = spawn('node', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let spawnError = null;
    child.stdout.pipe(stdoutFile);
    child.stderr.pipe(stderrFile);
    child.on('error', (error) => { spawnError = error; });
    child.on('close', async (code, signal) => {
      try {
        await Promise.all([finished(stdoutFile), finished(stderrFile)]);
      } catch (error) {
        spawnError ??= error;
      }
      const passed = spawnError === null && code === 0;
      tasks.push({
        name,
        duration_ms: Math.max(0, Math.round(performance.now() - taskStartedAt)),
        status: passed ? 'passed' : 'failed',
      });
      if (passed) {
        fs.rmSync(artifactDirectory, { recursive: true });
      } else {
        errorStream.write(`${name} output retained: stdout=${stdoutPath} stderr=${stderrPath}\n`);
        if (spawnError) errorStream.write(`${spawnError.message}\n`);
        else if (signal) errorStream.write(`${name} terminated by ${signal}\n`);
      }
      resolve(passed);
    });
  });
}
