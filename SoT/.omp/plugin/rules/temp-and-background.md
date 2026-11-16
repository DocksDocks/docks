---
description: Keep temporary files in a scratch directory and do not leave detached processes, global installs, or scheduled jobs
condition:
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)(?:mkdir|touch|tee)\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*\s(?:\\*["''])?/tmp(?=[/\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)(?:cp|mv|ln|rsync|install)\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*\s(?:\\*["''])?/tmp(?:/[^\s;&|"''\\`]*)?(?:\\*["''])*(?:\s+(?:-[^\s;&|"''\\`]+|&?\d*[<>]+&?\s*[^\s;&|"''\\`]*)(?:\\*["''])*)*\s*(?=[;&|)`"]|\\[nrt])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)git(?:\s+-[Cc]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-[pP]|\s+--[\w-]+(?:=(?:\\[^nrt]|[^\s;&|"\\])+)?)*\s+clone\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*\s(?:\\*["''])?/tmp(?=[/\s;&|)`"''\\])'
  - '(?<="(?:command|code)":"(?:\\.|[^"\\])*)>\s*(?:\\*["''])?/tmp(?=[/\s;&|)`"''\\])'
  - '(?<="(?:command|code)":"(?:\\.|[^"\\])*)(?:\s-o\s*|\s--output[=\s]|\s--out-?dir[=\s])(?:\\*["''])?/tmp(?=[/\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)mktemp(?=[\s;&|()`''"\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)TMPDIR=(?:\\*["''])?/tmp(?=[/\s;&|)`"''\\])'
  - '(?:(?:[;&|({`''"!]|\\[nrt])\s*|(?:\b|(?<=\\[nrt]))sudo\s+)(?:\w+=(?:\\[^nrt]|[^\s;&|"\\])*\s+)*(?<="(?:command|code)":"(?:\\.|[^"\\])*)(?:nohup|setsid|disown)(?=[\s;&|)`''"\\])'
  - '(?:[;&|({`''"!]|\\[nrt])\s*(?:\w+=(?:\\[^nrt]|[^\s;&|"\\])*\s+)*(?<="(?:command|code)":"(?:\\.|[^"\\])*)tmux(?:\s+-[LSf]\s+(?:\\[^nrt]|[^\s;&|"\\])+|\s+-(?:\\[^nrt]|[^\s;&|"\\])+)*(?:\s+(?:new|new-session|new-window|neww|split-window|splitw|respawn-pane|respawn-window)(?=[\s;&|)`''"\\])|\s*(?=[;&|)`''"\\]))'
  - '(?:[;&|({`''"!]|\\[nrt])\s*(?:\w+=(?:\\[^nrt]|[^\s;&|"\\])*\s+)*(?<="(?:command|code)":"(?:\\.|[^"\\])*)screen(?:\s*(?=[;&|)`''"\\])|\s+(?!-(?:ls|list)(?=[\s;&|)`''"\\]))[^\s;&|)`''"\\]+(?=[\s;&|)`''"\\]))'
  - '(?<="(?:command|code)":"(?:\\.|[^"\\])*)\s--watch(?:All)?(?:=(?!(?:false|0)(?=[\s;&|)`''"\\]))[^\s;&|)`''"\\]*)?(?=[\s;&|)`''"\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)npm\s+(?:(?:\\[^n\\]|\\\\(?!n)|(?!\s--\s)[^;&|"\\])*\s)?(?:i|install|add)\b(?:\\[^n\\]|\\\\(?!n)|(?!\s--\s)[^;&|"\\])*\s(?:-g|--global)(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)npm\s+(?:-g|--global)\s+(?:i|install|add)(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)(?:bun|pnpm)\s+(?:add|install|i)\b(?:\\[^n\\]|\\\\(?!n)|(?!\s--\s)[^;&|"\\])*\s(?:-g|--global)(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)(?:bun|pnpm)\s+(?:-g|--global)\s+(?:add|install|i)(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)yarn\s+global\s+add(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)pipx\s+install(?=[-\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)cargo\s+install(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)(?:go|gem|uv\s+tool)\s+install(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)crontab(?:\s*(?=[;&|)`''"\\])|\s+(?!-l(?=[\s;&|)`''"\\]))[^\s;&|)`''"\\]+(?=[\s;&|)`''"\\]))'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)systemctl(?:\s+-(?:\\[^nrt]|[^\s;&|"\\])+)*\s+enable(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)docker\s+system\s+prune(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)docker\s+(?:volume|image)\s+(?:rm|prune)(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)docker\s+rmi(?=[\s;&|)`"''\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)":"(?:\\.|[^"\\])*)docker\s+(?:builder|buildx)\s+prune(?=[\s;&|)`"''\\])'
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
