---
description: Clean up a remote resource only when its target is not production
condition:
  - '(?:(?<![\w./-])|(?<=\\[nrt]))(?:wrangler|vercel|netlify|flyctl|fly|supabase|kubectl|oc|helm|terraform|pulumi|gcloud|aws|az|doctl|heroku|railway)\s[^;&|]*?(?<=[\s:])(?:delete|destroy|remove|rm|undeploy|uninstall|down|stop|terminate)(?=[-\s;&|)`''"\\])'
  - '(?:\b|(?<=\\[nrt]))docker\b[^;&|]*?(?:\s-H[\s=]?\S|\s--host[\s=]|\s--context[\s=])[^;&|]*?\s(?:rm|rmi|stop|kill|prune|down)(?=[\s;&|)`''"\\])'
  - '(?:\b|(?<=\\[nrt]))podman\b[^;&|]*?(?:\s--remote(?=[\s=])|\s-r(?=\s)|\s--connection[\s=]|\s--url[\s=])[^;&|]*?\s(?:rm|rmi|stop|kill|prune|down)(?=[\s;&|)`''"\\])'
  - '(?:\b|(?<=\\[nrt]))(?:DOCKER_(?:HOST|CONTEXT)|CONTAINER_(?:HOST|CONNECTION))=\S+\s[^;&|]*?\b(?:docker|podman)\b[^;&|]*?\s(?:rm|rmi|stop|kill|prune|down)(?=[\s;&|)`''"\\])'
  - '(?:\b|(?<=\\[nrt]))ssh\s(?:(?!\\n).)*?(?:[\s"''`;&|(]|\\")(?:sudo\s+)?(?:(?:[\w.~-]*/)*rm|trash|shred|unlink|truncate|find\s(?:(?!\\n)[^;&|])*?\s-delete|(?:docker|podman)(?:-compose)?[^;&|"''`\\]*?\s(?:rm|rmi|stop|kill|down|prune)|systemctl(?:\s+-[\w-]+)*\s+(?:stop|disable|mask)|kill|killall|pkill)(?=[\s;&|)`''"\\])'
  - '(?:(?<![\w./-])|(?<=\\[nrt]))rsync\s(?=(?:(?!\\n)[^;&|])*?\s--del[\w-]*(?=[\s=;&|)"''\\]))(?:(?!\\n)[^;&|])*?\s(?:\\?["''])?(?:[\w.-]+@)?\w[\w.-]*::?[^\s;&|"''\\]*(?:\\?["''])?(?:\s+-[^\s;&|"''\\]+)*\s*(?=[;&|)"''\\])'
  - '(?:(?<![\w./-])|(?<=\\[nrt]))rclone\s[^;&|]*?(?<=\s)(?:delete|deletefile|purge|rmdirs?|cleanup)(?=[\s;&|)`''"\\])'
  - '(?:(?<![\w./-])|(?<=\\[nrt]))gh\s(?:(?!\\n)[^;&|])*?(?<=\s)(?:repo(?:\s+deploy-key)?|release|secret|variable|codespace|gist|cache|run)\s+delete(?=[-\s;&|)`''"\\])'
  - '(?:(?<![\w./-])|(?<=\\[nrt]))gh\s+api\b(?:(?!\\n)[^;&|])*?\s(?:-X\s*|--method[=\s]\s*)(?:\\?["''])?(?:DELETE|delete)(?=[\s;&|)`''"\\])'
scope: "tool:bash, tool:eval"
repeatMode: always
---
Resources on this workstation are always development. A remote resource is one that you reach through SSH, `rsync` to a `host:` target, `rclone`, `gh`, a remote `docker` or `podman`, or a provider CLI.

- Clean up a remote resource only when its target is named local, development, dev, test, homolog, homologation, staging, or preview.
- Every other target is production. For example, `wrangler delete` without `--env` acts on the top-level Worker.
- A cleanup deletes, removes, stops, disables, kills, or prunes. Examples: `gh repo delete`, `gh api -X DELETE`, `rclone purge`, `rsync --delete` to a host, and `ssh <host> 'systemctl stop <unit>'`.
- Never stop, remove, undeploy, or delete a production resource without an `ask` immediately before it.
- A `yolo` invocation does not answer that `ask`.
- In a subagent, do not do it. Name the resource in your report.
