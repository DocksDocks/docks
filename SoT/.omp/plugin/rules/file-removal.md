---
description: Remove files through the trash or a command that checks the path, never through rm or code
condition:
  - '(?:[;&|({`''"!]\s*|\\[nrt]\s*|(?:\b|(?<=\\[nrt]))(?:sudo|doas|env|nice|nohup|time|timeout|exec|command|xargs|then|do|else)(?:\s+(?:-[ugCnI]\s+\S+|-\S*|\d\S*|\w+=\S*|\{\}))*\s+)\\*(?:[\w.~-]*/)*(?:rm|unlink|shred)(?=[\s;&|)`''"\\])'
  - '\s-(?:exec|execdir|ok|okdir)\s+\\*(?:[\w.~-]*/)*(?:rm|unlink|shred)(?=[\s;&|)`''"\\])'
  - '(?:\b|(?<=\\[nrt]))find\b[^;&|]*\s-delete(?=[\s;&|)`''"\\])'
  - '(?:\b|(?<=\\[nrt]))os\.(?:remove|unlink|rmdir|removedirs)\s*\('
  - '(?:\b|(?<=\\[nrt]))shutil\.rmtree(?=[^\w$])'
  - '\.(?:unlink|rmdir)\s*\('
  - '(?:\b|(?<=\\[nrt]))fs(?:\.promises)?\.(?:rm|rmdir|unlink)(?:Sync)?(?=[^\w$])'
  - '(?:\b|(?<=\\[nrt]))(?:rmSync|unlinkSync|rmdirSync)(?=[^\w$])'
  - '(?:(?<![\w$.])|(?<=\\[nrt]))(?:rm|rmdir|unlink)\s*\('
  - '(?:\b|(?<=\\[nrt]))Bun\.file\([^)]*\)\.delete\s*\('
  - '(?:\b|(?<=\\[nrt]))git(?:\s+-[Cc]\s+\S+|\s+--[\w-]+(?:=\S+)?)*\s+worktree\s+remove\b(?:(?!\\n)[^;&|])*?\s(?:--f[\w-]*|-[a-zA-Z]*f[a-zA-Z]*)(?=[\s=;&|)"''\\])'
scope: "tool:bash, tool:eval"
repeatMode: always
---
Do not use `rm`, `unlink`, or `shred`. Do not delete files through `eval`, Python, or Node code.

- To remove a temporary file or directory, use the `scratch_remove` tool or run `docks-kit scratch remove <path>`. Both remove only a path in the scratch root, the system temporary directory, or `/var/tmp`.
- `gio trash` fails on a `tmpfs` `/tmp`.
- To remove any other file or directory, run `gio trash -- <path>` on Linux or `trash <path>` on macOS.
- To remove a path from the git index, run `git rm -- <path>`.
- To remove a worktree, run `git worktree remove -- <path>`.
- If git refuses because the worktree has changes, make sure that each of its commits is on the remote.
- Then make sure that `git status --porcelain` lists only generated files. Then run `git worktree remove --force -- <path>` one time.
- This rule shows for each `git worktree remove` with `--force`, `-f`, or an abbreviation of `--force`. Use that form only after the two checks above.
- Never pass `--force` two times to `git worktree remove`.
- Write the `--` exactly as shown.
- If a deletion needs `rm -r` or a bulk command, do not run it. Put the paths in your report.
