---
description: Write literal absolute paths and leave HOME unchanged
condition:
  - '(?:[\s=:"''(`]|\\[nt])(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)~/'
  - '(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)\$HOME(?=\W)'
  - '(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)\$\{HOME[}:]'
  - '(?:[\s;&|("''`]|\\[nt])(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)HOME='
scope: "tool:bash, tool:eval"
repeatMode: always
---
Write literal absolute paths in each command.

- Do not use `~` or `$HOME` in a command.
- Do not set or export `HOME`.
