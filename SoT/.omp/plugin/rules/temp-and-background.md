---
description: Keep temporary files in a scratch directory and do not leave detached processes, global installs, or scheduled jobs
condition:
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)(?:mkdir|touch|tee)\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*(?:\s|\\t)(?:\\*["''])?/tmp(?=[/\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)(?:cp|mv|ln|rsync|install)\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*(?:\s|\\t)(?:\\*["''])?/tmp(?:/[^\s;&|"''\\`]*)?(?:\\*["''])*(?:(?:\s|\\t)+(?:-[^\s;&|"''\\`]+|&?\d*[<>]+&?(?:\s|\\t)*[^\s;&|"''\\`]*)(?:\\*["''])*)*(?:\s|\\t)*(?=[;&|)`"]|\\[nr])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)git(?:(?:\s|\\t)+-[Cc](?:\s|\\t)+(?:\\[^nrt]|[^\s;&|"\\])+|(?:\s|\\t)+-[pP]|(?:\s|\\t)+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*(?:\s|\\t)+clone\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*(?:\s|\\t)(?:\\*["''])?/tmp(?=[/\s;&|)`"''\\])'
  - '(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)>(?:\s|\\t)*(?:\\*["''])?/tmp(?=[/\s;&|)`"''\\])'
  - '(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)(?:(?:\s|\\t)-o(?:\s|\\t)*|(?:\s|\\t)--output(?:[\s=]|\\t)|(?:\s|\\t)--out-?dir(?:[\s=]|\\t))(?:\\*["''])?/tmp(?=[/\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)mktemp(?=[\s;&|()`''"\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)TMPDIR=(?:\\*["''])?/tmp(?=[/\s;&|)`"''\\])'
  - '(?:(?:[;&|({`''"!]|\\[nr])(?:\s|\\t)*|(?:\b|(?<=\\[nrt]))sudo(?:\s|\\t)+)(?:\w+=(?:\\[^nrt]|[^\s;&|"\\])*(?:\s|\\t)+)*(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)(?:nohup|setsid|disown)(?=[\s;&|)`''"\\])'
  - '(?:[;&|({`''"!]|\\[nr])(?:\s|\\t)*(?:\w+=(?:\\[^nrt]|[^\s;&|"\\])*(?:\s|\\t)+)*(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)tmux(?:(?:\s|\\t)+-[LSf](?:\s|\\t)+(?:\\[^nrt]|[^\s;&|"\\])+|(?:\s|\\t)+-(?:\\[^nrt]|[^\s;&|"\\])+)*(?:(?:\s|\\t)+(?:new|new-session|new-window|neww|split-window|splitw|respawn-pane|respawn-window)(?=[\s;&|)`''"\\])|(?:\s|\\t)*(?=[;&|)`''"\\]))'
  - '(?:[;&|({`''"!]|\\[nr])(?:\s|\\t)*(?:\w+=(?:\\[^nrt]|[^\s;&|"\\])*(?:\s|\\t)+)*(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)screen(?:(?:\s|\\t)*(?=[;&|)`''"\\])|(?:\s|\\t)+(?!-(?:ls|list)(?=[\s;&|)`''"\\]))[^\s;&|)`''"\\]+(?=[\s;&|)`''"\\]))'
  - '(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)(?:\s|\\t)--watch(?:All)?(?:=(?!(?:false|0)(?=[\s;&|)`''"\\]))[^\s;&|)`''"\\]*)?(?=[\s;&|)`''"\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)npm(?:\s|\\t)+(?:(?:(?!(?:\s|\\t)--(?:\s|\\t))(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\]))*(?:\s|\\t))?(?:i|install|add)\b(?:(?!(?:\s|\\t)--(?:\s|\\t))(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\]))*(?:\s|\\t)(?:-g|--global)(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)npm(?:\s|\\t)+(?:-g|--global)(?:\s|\\t)+(?:i|install|add)(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)(?:bun|pnpm)(?:\s|\\t)+(?:add|install|i)\b(?:(?!(?:\s|\\t)--(?:\s|\\t))(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\]))*(?:\s|\\t)(?:-g|--global)(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)(?:bun|pnpm)(?:\s|\\t)+(?:-g|--global)(?:\s|\\t)+(?:add|install|i)(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)yarn(?:\s|\\t)+global(?:\s|\\t)+add(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)pipx(?:\s|\\t)+install(?=[-\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)cargo(?:\s|\\t)+install(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)(?:go|gem|uv(?:\s|\\t)+tool)(?:\s|\\t)+install(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)crontab(?:(?:\s|\\t)*(?=[;&|)`''"\\])|(?:\s|\\t)+(?!-l(?=[\s;&|)`''"\\]))[^\s;&|)`''"\\]+(?=[\s;&|)`''"\\]))'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)systemctl(?:(?:\s|\\t)+-(?:\\[^nrt]|[^\s;&|"\\])+)*(?:\s|\\t)+enable(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)docker(?:\s|\\t)+system(?:\s|\\t)+prune(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)docker(?:\s|\\t)+(?:volume|image)(?:\s|\\t)+(?:rm|prune)(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)docker(?:\s|\\t)+rmi(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)docker(?:\s|\\t)+(?:builder|buildx)(?:\s|\\t)+prune(?=[\s;&|)`"''\\])'
scope: "tool:bash, tool:eval"
repeatMode: always
---
Do not put a temporary file, a temporary directory, a package store, a cache, or a clone in `/tmp`.

- Create a temporary directory with the `scratch_new` tool or `docks-kit scratch new <label>`. Put each temporary file in that directory.
- A scratch directory is deleted after 7 idle days. Put evidence that you cite in the issue, the pull request, or the repository.
- Run a test suite in single-run mode.
- Start a server, a watcher, a tunnel, or a database only as a named bash service or an async job.
- Do not detach a process with `nohup`, `setsid`, `disown`, `tmux`, or `screen`.
- Do not install a package globally, add a scheduled job, or enable a service unless the user asks for it. `go install`, `gem install`, and `uv tool install` are global installs too.
- Do not remove a Docker volume, image, or build cache that you did not create.
- Do not run `docker system prune`.
