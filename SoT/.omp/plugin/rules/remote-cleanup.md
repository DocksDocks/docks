---
description: Clean up a remote resource only when its target is not production
condition:
  - '(?:(?<![\w./-])|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)(?:wrangler|vercel|netlify|flyctl|fly|supabase|kubectl|oc|helm|terraform|pulumi|gcloud|gsutil|aws|az|doctl|heroku|railway|neonctl|neon|pscale|turso|firebase|s3cmd|hcloud|linode-cli|scw|oci|ibmcloud|nomad|eksctl|render|mc)(?:\s|\\t)(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?(?<=[\s:-]|\\t)(?:delete|destroy|remove|rm|rb|rmdir|del|purge|drop|wipe|prune|undeploy|uninstall|deprovision|teardown|down|stop|terminate)(?=[-\s;&|)`''"\\])'
  - '(?i)(?:(?<![\w./-])|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)(?:(?:psql|mysql|sqlite3|mongosh)\b(?:\\[^n\\]|\\\\(?!n)|[^&|"\\])*?(?:\bdrop(?:\s|\\t)+(?:table|database|schema)\b|\.drop(?:database)?(?:\s|\\t)*\()|dropdb(?=[\s;&|)`''"\\])|redis-cli\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?(?:\s|\\t)flush(?:all|db)(?=[\s;&|)`''"\\]))'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)docker\b(?:(?!(?:\s|\\t)--(?:\s|\\t))(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\]))*?(?:(?:\s|\\t)-[Hc](?:[\s=]|\\t)?(?=[^\s;&|"\\])|(?:\s|\\t)--host(?:[\s=]|\\t)|(?:\s|\\t)--context(?:[\s=]|\\t))(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?(?:\s|\\t)(?:rm|rmi|stop|kill|prune|down)(?=[\s;&|)`''"\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)podman\b(?:(?!(?:\s|\\t)--(?:\s|\\t))(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\]))*?(?:(?:\s|\\t)--remote(?=[\s=]|\\t)|(?:\s|\\t)-r(?=\s|\\t)|(?:\s|\\t)--connection(?:[\s=]|\\t)|(?:\s|\\t)--url(?:[\s=]|\\t))(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?(?:\s|\\t)(?:rm|rmi|stop|kill|prune|down)(?=[\s;&|)`''"\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)(?:DOCKER_(?:HOST|CONTEXT)|CONTAINER_(?:HOST|CONNECTION))=(?:\\[^nrt]|[^\s;&|"\\])+(?:\s|\\t)(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?\b(?:docker|podman)\b(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?(?:\s|\\t)(?:rm|rmi|stop|kill|prune|down)(?=[\s;&|)`''"\\])'
  - '(?:\b|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)ssh(?:\s|\\t)(?:\\[^n\\]|\\\\(?!n)|[^"\\])*?(?:[\s''`;&|(]|\\["t])(?:sudo(?:\s|\\t)+)?(?:(?:[\w.~-]*/)*rm|trash|shred|unlink|truncate|find(?:\s|\\t)(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?(?:\s|\\t)-delete|(?:docker|podman)(?:-compose)?[^;&|"''`\\]*?(?:\s|\\t)(?:rm|rmi|stop|kill|down|prune)|systemctl(?:(?:\s|\\t)+-[\w-]+)*(?:\s|\\t)+(?:stop|disable|mask)|kill|killall|pkill)(?=[\s;&|)`''"\\])'
  - '(?:(?<![\w./-])|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)rsync(?:\s|\\t)(?=(?:(?!(?:\s|\\t)--(?:\s|\\t))(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\]))*?(?:\s|\\t)--del[\w-]*(?=[\s=;&|)`"''\\]))(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?(?:\s|\\t)(?:\\*["''])?(?:[\w.-]+@)?\w[\w.-]*::?[^\s;&|"''\\`]*(?:\\*["''])*(?:(?:\s|\\t)+(?:-[^\s;&|"''\\`]+|&?\d*[<>]+&?(?:\s|\\t)*[^\s;&|"''\\`]*)(?:\\*["''])*)*(?:\s|\\t)*(?=[;&|)`"]|\\[nr])'
  - '(?:(?<![\w./-])|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)rclone(?:\s|\\t)(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?(?<=\s|\\t)(?:delete|deletefile|purge|rmdirs?|cleanup)(?=[\s;&|)`''"\\])'
  - '(?:(?<![\w./-])|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)rclone(?:\s|\\t)(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?(?<=\s|\\t)sync(?:\s|\\t)(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\])*?(?:\s|\\t)(?:\\*["''])?[\w.-]*\w:[^\s;&|"''\\`]*(?:\\*["''])*(?:(?:\s|\\t)+(?:-[^\s;&|"''\\`]+|&?\d*[<>]+&?(?:\s|\\t)*[^\s;&|"''\\`]*)(?:\\*["''])*)*(?:\s|\\t)*(?=[;&|)`"]|\\[nr])'
  - '(?:(?<![\w./-])|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)gh(?:\s|\\t)+[a-z][\w-]*(?:(?:\s|\\t)+[a-z][\w-]*)?(?:\s|\\t)+(?:[a-z]+-)?delete(?=[\s;&|)`''"\\])'
  - '(?:(?<![\w./-])|(?<=\\[nrt]))(?<="(?:command|code)"\s*:\s*"(?:\\.|[^"\\])*)gh(?:\s|\\t)+api\b(?:(?!(?:\s|\\t)--(?:\s|\\t))(?:\\[^n\\]|\\\\(?!n)|[^;&|"\\]))*?(?:\s|\\t)(?:-X(?:\s|\\t)*|--method(?:[\s=]|\\t)(?:\s|\\t)*)(?:\\*["''])?(?:DELETE|delete)(?=[\s;&|)`''"\\])'
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
