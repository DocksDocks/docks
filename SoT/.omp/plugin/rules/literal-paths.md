---
description: Write literal absolute paths and leave HOME unchanged
condition:
  - '(?:[\s=:"''(`]|\\[nt])(?<="(?:command|code)":"(?:\\.|[^"\\])*)~/'
  - '(?<="(?:command|code)":"(?:\\.|[^"\\])*)\$HOME(?=\W)'
  - '(?<="(?:command|code)":"(?:\\.|[^"\\])*)\$\{HOME[}:]'
  - '(?:[\s;&|("''`]|\\[nt])(?<="(?:command|code)":"(?:\\.|[^"\\])*)HOME='
scope: "tool:bash, tool:eval"
repeatMode: always
---
Write literal absolute paths in each command.

- Do not use `~` or `$HOME` in a command.
- Do not set or export `HOME`.
