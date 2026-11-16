---
description: Remove files through the trash or a command that checks the path, never through rm or code
condition:
  - '(?:(?:[;&|({`''"!]|\\[nrt])\s*|(?:\b|(?<=\\[nrt]))(?:sudo|doas|env|nice|nohup|time|timeout|exec|command|xargs|then|do|else)(?:\s+(?:-[ugCnI]\s+(?:\\[^nrt]|[^\s;&|"\\])+|-(?:\\[^nrt]|[^\s;&|"\\])*|\d(?:\\[^nrt]|[^\s;&|"\\])*|\w+=(?:\\[^nrt]|[^\s;&|"\\])*|\{\}))*\s+)(?:\w+=(?:\\[^nrt]|[^\s;&|"\\])*\s+)*(?<="(?:command|code)":"(?:\\.|[^"\\])*)\\*(?:[\w.~-]*/)*(?:rm|unlink|shred)(?=[\s;&|)`''"\\])'
  - '(?<="(?:command|code)":"(?:\\.|[^"\\])*)\s-(?:exec|execdir|ok|okdir)\s+\\*(?:[\w.~-]*/)*(?:rm|unlink|shred)(?=[\s;&|)`''"\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)find\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*\s-delete(?=[\s;&|)`''"\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)os\.(?:remove|unlink|rmdir|removedirs)\s*\('
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)shutil\.rmtree(?=[^\w$])'
  - '(?<="(?:command|code)":"(?:\\.|[^"\\])*)\.(?:unlink|rmdir)\s*\('
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)fs(?:\.promises)?\.(?:rm|rmdir|unlink)(?:Sync)?(?=[^\w$])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)(?:rmSync|unlinkSync|rmdirSync)(?=[^\w$])'
  - '(?:(?<![\w$.])|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)(?:rm|rmdir|unlink)\s*\('
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)Bun\.file\([^)]*\)\.delete\s*\('
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)git(?:\s+-[Cc]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-[pP]|\s+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*\s+worktree\s+remove\b(?:\\[^n\\]|\\\\(?!n)|(?!\s--\s)[^;&|"\\])*?\s(?:--f[\w-]*|-[a-zA-Z]*f[a-zA-Z]*)(?=[\s=;&|)`"''\\])'
scope: "tool:bash, tool:eval"
repeatMode: always
---
Do not use `rm`, `unlink`, or `shred`. Do not delete files through `eval`, Python, or Node code.

- To remove a temporary file or directory, use the `scratch_remove` tool or run `docks-kit scratch remove <path>`. Both remove only a path in the scratch root, the system temporary directory, or `/var/tmp`.
- `gio trash` fails on a `tmpfs` `/tmp`.
- To remove any other file or directory, run `gio trash -- <path>` on Linux or `trash <path>` on macOS.
- To remove a path from the git index, run `git rm -- <path>`.
- To remove a worktree, run `git worktree remove -- <path>`.
- If git refuses because the worktree has changes, do these steps:
  1. Make sure that each commit of the worktree is on the remote.
  2. Make sure that `git status --porcelain` lists only generated files.
  3. Run `git worktree remove --force -- <path>` one time.
- This rule shows for each `git worktree remove` with `--force`, `-f`, or an abbreviation of `--force`. Use that form only after the two checks above.
- Never pass `--force` two times to `git worktree remove`.
- Write the `--` exactly as shown.
- If a deletion needs `rm -r` or a bulk command, do not run it. Put the paths in your report.
