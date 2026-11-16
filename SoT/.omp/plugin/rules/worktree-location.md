---
description: Create each git worktree under the agent-worktrees data directory with a literal absolute path
condition:
  - '(?:\b|(?<=\\[nrt]))git(?:\s+-[Cc]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-[pP]|\s+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*\s+worktree\s+add(?:\s+(?:-[bB]\s+[^\s;&|"''\\]+|--reason\s+[^\s;&|"''\\]+|-(?![bB]\s|-reason\s)[^\s;&|"''\\]+))*\s+(?!(?:\\*["''])?/(?:[^\s;&|$`"''\\/]+/)*agent-worktrees/[^\s;&|$`"''\\/]+(?:/[^\s;&|$`"''\\/]+)+(?:\\*["''])?(?=[\s;&|)`"'']|\\.))(?:\\*["''])?[^\s;&|"''\\-][^\s;&|"''\\]*(?:\\*["''])?(?=[\s;&|)`"'']|\\.)'
scope: "tool:bash, tool:eval"
---
Create a worktree only at `<data>/agent-worktrees/<repository>/<name>`.

- `<data>` is `$XDG_DATA_HOME`. When that variable is not set, `<data>` is `.local/share` in the home directory.
- `agent-worktrees` must be a whole directory name in the path.
- Write the literal absolute path in the command. Do not use `~`, `$HOME`, or another variable in it.
