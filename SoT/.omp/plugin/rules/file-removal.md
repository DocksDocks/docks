---
description: Remove files through the trash or a command that checks the path, never through rm or code
condition:
  - '(?:(?:[;&|({`''"!]|\\[nr])(?:\s|\\t)*|(?:\b|(?<=\\[nrt]))(?:sudo|doas|env|nice|nohup|time|timeout|exec|command|xargs|then|do|else)(?:(?:\s|\\t)+(?:-[ugCnI](?:\s|\\t)+(?:\\[^nrt]|[^\s;&|"\\])+|-(?:\\[^nrt]|[^\s;&|"\\])*|\d(?:\\[^nrt]|[^\s;&|"\\])*|\w+=(?:\\[^nrt]|[^\s;&|"\\])*|\{\}))*(?:\s|\\t)+)(?:\w+=(?:\\[^nrt]|[^\s;&|"\\])*(?:\s|\\t)+)*(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)\\*(?:[\w.~-]*/)*(?:rm|unlink|shred)(?=[\s;&|)`''"\\])'
  - '(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)(?:\s|\\t)-(?:exec|execdir|ok|okdir)(?:\s|\\t)+\\*(?:[\w.~-]*/)*(?:rm|unlink|shred)(?=[\s;&|)`''"\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)find\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*(?:\s|\\t)-delete(?=[\s;&|)`''"\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)os\.(?:remove|unlink|rmdir|removedirs)(?:\s|\\t)*\('
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)shutil\.rmtree(?=[^\w$])'
  - '(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)\.(?:unlink|rmdir)(?:\s|\\t)*\('
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)fs(?:\.promises)?\.(?:rm|rmdir|unlink)(?:Sync)?(?=[^\w$])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)(?:rmSync|unlinkSync|rmdirSync)(?=[^\w$])'
  - '(?:(?<![\w$.])|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)(?:rm|rmdir|unlink)(?:\s|\\t)*\('
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)Bun\.file\([^)]*\)\.delete(?:\s|\\t)*\('
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)git(?:(?:\s|\\t)+-[Cc](?:\s|\\t)+(?:\\[^nrt]|[^\s;&|"\\])+|(?:\s|\\t)+-[pP]|(?:\s|\\t)+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*(?:\s|\\t)+worktree(?:\s|\\t)+remove\b(?:(?!(?:\s|\\t)--(?:\s|\\t))(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\]))*?(?:\s|\\t)(?:--f[\w-]*|-[a-zA-Z]*f[a-zA-Z]*)(?=[\s=;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)git(?:(?:\s|\\t)+-[Cc](?:\s|\\t)+(?:\\[^nrt]|[^\s;&|"\\])+|(?:\s|\\t)+-[pP]|(?:\s|\\t)+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*(?:\s|\\t)+rm\b(?:(?!(?:\s|\\t)--(?:\s|\\t))(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\]))*?(?:\s|\\t)-[a-zA-Z]*[rR][a-zA-Z]*(?=[\s=;&|)`"''\\])'
scope: "tool:bash, tool:eval"
repeatMode: always
---
Do not use `rm`, `unlink`, or `shred`. Do not delete files through `eval`, Python, or Node code.

- To remove a temporary file or directory, use the `scratch_remove` tool or run `docks-kit scratch remove <path>`. Both remove only a path in the scratch root, the system temporary directory, or `/var/tmp`.
- `gio trash` fails on a `tmpfs` `/tmp`.
- To remove any other file or directory, run `gio trash -- <path>` on Linux or `trash <path>` on macOS.
- To remove a path from the git index, run `git rm -- <path>`.
- omp denies `git rm -r`. To remove a folder from git, run `git rm -- '<dir>/*'`. To stop tracking a folder and keep its files, run `git rm --cached -- '<dir>/*'`. Keep the quotes: git then matches every file in every subfolder.
- To remove a worktree, run `git worktree remove -- <path>`.
- If git refuses because the worktree has changes, do these steps:
  1. Make sure that each commit of the worktree is on the remote.
  2. Make sure that `git status --porcelain` lists only generated files.
  3. Run `git worktree remove --force -- <path>` one time.
- This rule shows for each `git worktree remove` with `--force`, `-f`, or an abbreviation of `--force`. Use that form only after the two checks above.
- Never pass `--force` two times to `git worktree remove`.
- Write the `--` exactly as shown.
- If a deletion needs `rm -r` or a bulk command, do not run it. Put the paths in your report.
