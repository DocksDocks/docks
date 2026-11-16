---
description: Create each git worktree under the agent-worktrees data directory with a literal absolute path
condition:
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)git(?:\s+-[Cc]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-[pP]|\s+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*\s+worktree\s+add(?=[\s;&|)`"''\\])'
scope: "tool:bash, tool:eval"
repeatMode: always
---
Create a worktree only at `<data>/agent-worktrees/<repository>/<name>`.

- `<data>` is `$XDG_DATA_HOME`. When that variable is not set, `<data>` is `.local/share` in the home directory.
- `agent-worktrees` must be a whole directory name in the path.
- Write the literal absolute path in the command. Do not use `~`, `$HOME`, or another variable in it.
- This reminder shows each time that you add a worktree, also at the correct path. If the path follows these rules, run the same command again.
