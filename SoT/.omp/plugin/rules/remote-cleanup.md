---
description: Clean up a remote resource only when its target is not production
condition:
  - '(?:(?<![\w./-])|(?<=\\[nrt]))(?:wrangler|vercel|netlify|flyctl|fly|supabase|kubectl|oc|helm|terraform|pulumi|gcloud|gsutil|aws|az|doctl|heroku|railway|neonctl|neon|pscale|turso|firebase|s3cmd|hcloud|linode-cli|scw|oci|ibmcloud|nomad|eksctl|render|mc)\s(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?(?<=[\s:-])(?:delete|destroy|remove|rm|rb|rmdir|del|purge|drop|wipe|prune|undeploy|uninstall|deprovision|teardown|down|stop|terminate)(?=[-\s;&|)`''"\\])'
  - '(?i)(?:(?<![\w./-])|(?<=\\[nrt]))(?:(?:psql|mysql|sqlite3|mongosh)\b(?:\\[^n\\]|\\\\(?!n)|[^&|"\\])*?(?:\bdrop\s+(?:table|database|schema)\b|\.drop(?:database)?\s*\()|dropdb(?=[\s;&|)`''"\\])|redis-cli\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?\sflush(?:all|db)(?=[\s;&|)`''"\\]))'
  - '(?:\b|(?<=\\[nrt]))docker\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?(?:\s-[Hc][\s=]?(?=[^\s;&|"\\])|\s--host[\s=]|\s--context[\s=])(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?\s(?:rm|rmi|stop|kill|prune|down)(?=[\s;&|)`''"\\])'
  - '(?:\b|(?<=\\[nrt]))podman\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?(?:\s--remote(?=[\s=])|\s-r(?=\s)|\s--connection[\s=]|\s--url[\s=])(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?\s(?:rm|rmi|stop|kill|prune|down)(?=[\s;&|)`''"\\])'
  - '(?:\b|(?<=\\[nrt]))(?:DOCKER_(?:HOST|CONTEXT)|CONTAINER_(?:HOST|CONNECTION))=(?:\\[^nrt]|[^\s;&|"\\])+\s(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?\b(?:docker|podman)\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?\s(?:rm|rmi|stop|kill|prune|down)(?=[\s;&|)`''"\\])'
  - '(?:\b|(?<=\\[nrt]))ssh\s(?:\\[^n\\]|\\\\(?!n)|[^"\\])*?(?:[\s''`;&|(]|\\")(?:sudo\s+)?(?:(?:[\w.~-]*/)*rm|trash|shred|unlink|truncate|find\s(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?\s-delete|(?:docker|podman)(?:-compose)?[^;&|"''`\\]*?\s(?:rm|rmi|stop|kill|down|prune)|systemctl(?:\s+-[\w-]+)*\s+(?:stop|disable|mask)|kill|killall|pkill)(?=[\s;&|)`''"\\])'
  - '(?:(?<![\w./-])|(?<=\\[nrt]))rsync\s(?=(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?\s--del[\w-]*(?=[\s=;&|)`"''\\]))(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?\s(?:\\*["''])?(?:[\w.-]+@)?\w[\w.-]*::?[^\s;&|"''\\`]*(?:\\*["''])*(?:\s+(?:-[^\s;&|"''\\`]+|&?\d*[<>]+&?\s*[^\s;&|"''\\`]*)(?:\\*["''])*)*\s*(?=[;&|)`"]|\\[nrt])'
  - '(?:(?<![\w./-])|(?<=\\[nrt]))rclone\s(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?(?<=\s)(?:delete|deletefile|purge|rmdirs?|cleanup)(?=[\s;&|)`''"\\])'
  - '(?:(?<![\w./-])|(?<=\\[nrt]))rclone\s(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?(?<=\s)sync\s(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?\s(?:\\*["''])?[\w.-]*\w:[^\s;&|"''\\`]*(?:\\*["''])*(?:\s+(?:-[^\s;&|"''\\`]+|&?\d*[<>]+&?\s*[^\s;&|"''\\`]*)(?:\\*["''])*)*\s*(?=[;&|)`"]|\\[nrt])'
  - '(?:(?<![\w./-])|(?<=\\[nrt]))gh\s+[a-z][\w-]*(?:\s+[a-z][\w-]*)?\s+(?:[a-z]+-)?delete(?=[\s;&|)`''"\\])'
  - '(?:(?<![\w./-])|(?<=\\[nrt]))gh\s+api\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?\s(?:-X\s*|--method[=\s]\s*)(?:\\*["''])?(?:DELETE|delete)(?=[\s;&|)`''"\\])'
scope: "tool:bash, tool:eval"
repeatMode: always
---
Resources on this workstation are always development. A remote resource is one that you reach through SSH, `rsync` to a `host:` target, `rclone`, `gh`, a remote `docker` or `podman`, a database client, or a provider CLI.

- Clean up a remote resource only when its target is named local, development, dev, test, homolog, homologation, staging, or preview.
- Every other target is production. For example, `wrangler delete` without `--env` acts on the top-level Worker.
- A cleanup deletes, removes, drops, stops, disables, kills, or prunes. Examples: `gh repo delete`, `gh api -X DELETE`, `rclone purge`, `rclone sync` to a remote, `rsync --delete` to a host, `aws s3 rb`, `DROP TABLE` in `psql`, and `ssh <host> 'systemctl stop <unit>'`.
- A production cleanup must be rare.
- Never stop, remove, undeploy, or delete a production resource without an `ask` immediately before it.
- A `yolo` invocation does not answer that `ask`.
- In a subagent, do not clean up a production resource. Name it in your report.
