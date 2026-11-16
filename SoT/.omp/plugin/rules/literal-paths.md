---
description: Write literal absolute paths and leave HOME unchanged
condition:
  - '(?:^|[\s=:"''(`]|\\[nt])~/'
  - '\$HOME(?=\W)'
  - '\$\{HOME[}:]'
  - '(?:^|[\s;&|("''`]|\\[nt])HOME='
scope: "tool:bash, tool:eval"
---
Write literal absolute paths in each command.

- Do not use `~` or `$HOME` in a command.
- Do not set or export `HOME`.
