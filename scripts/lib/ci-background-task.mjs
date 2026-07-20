import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { finished } from 'node:stream/promises';

export function startTask(name, command, args, options = {}) {
  const { cwd, tasks, errorStream = process.stderr, artifactRoot = os.tmpdir(), env = process.env } = options;
  if (tasks.some((task) => task.name === name)) throw new Error(`duplicate task name: ${name}`);

  const taskStartedAt = performance.now();
  const artifactDirectory = fs.mkdtempSync(path.join(artifactRoot, 'docks-ci-task-'));
  fs.chmodSync(artifactDirectory, 0o700);
  const stdoutPath = path.join(artifactDirectory, 'stdout.log');
  const stderrPath = path.join(artifactDirectory, 'stderr.log');
  const stdoutFile = fs.createWriteStream(stdoutPath, { flags: 'wx', mode: 0o600 });
  const stderrFile = fs.createWriteStream(stderrPath, { flags: 'wx', mode: 0o600 });
  const task = { name, duration_ms: 0, status: 'failed' };
  tasks.push(task);

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let spawnError = null;
    child.stdout.pipe(stdoutFile);
    child.stderr.pipe(stderrFile);
    child.on('error', (error) => {
      spawnError = error;
    });
    child.on('close', async (code, signal) => {
      try {
        await Promise.all([finished(stdoutFile), finished(stderrFile)]);
      } catch (error) {
        spawnError ??= error;
      }
      const passed = spawnError === null && signal === null && code === 0;
      task.duration_ms = Math.max(0, Math.round(performance.now() - taskStartedAt));
      task.status = passed ? 'passed' : 'failed';
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
