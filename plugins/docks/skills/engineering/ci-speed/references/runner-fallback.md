# One workflow for Blacksmith and GitHub-hosted runners

## Contents

- [Facts that shape the design](#facts-that-shape-the-design)
- [Pattern 1: one variable per runner class](#pattern-1-one-variable-per-runner-class)
- [Pattern 2: picker job](#pattern-2-picker-job)
- [Pattern 3: stuck-queue watchdog](#pattern-3-stuck-queue-watchdog)
- [Portable steps](#portable-steps)
- [Label map](#label-map)
- [Proof](#proof)

Read this file when a Blacksmith workflow must still run on GitHub-hosted runners without the Blacksmith budget, account, or service. Pattern 1 is required. Patterns 2 and 3 are optional. Blacksmith facts are in [blacksmith.md](blacksmith.md). Check each action major in a snippet with `gh release view --repo <owner>/<repo> --json tagName -q .tagName`.

## Facts that shape the design

| Fact | Effect on the design | Source |
|---|---|---|
| GitHub has no runner fallback. A `runs-on` label list means AND, not OR | `[blacksmith-<…>, ubuntu-latest]` is not a fallback: one runner must carry both labels | https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax |
| A job with no matching runner waits, up to 24 hours for self-hosted runners. For `timeout-minutes`, the docs bound run time only | A missing backend shows queued jobs, not failed jobs | https://docs.github.com/en/actions/reference/runners/self-hosted-runners |
| Blacksmith has no hard spend cap. It can suspend an account that is behind on payment | A budget stop looks like stuck queued jobs, not red jobs | https://docs.blacksmith.sh/introduction/settings, https://docs.blacksmith.sh/about/terms-of-service |
| `runs-on` accepts only the `github`, `needs`, `strategy`, `matrix`, `vars`, and `inputs` contexts | `secrets`, `env`, `runner`, and `steps` cannot choose the runner | https://docs.github.com/en/actions/reference/workflows-and-actions/contexts |
| Configuration variables are empty in fork pull request runs and Dependabot runs. An empty `runs-on` fails | Every `runs-on` expression needs a literal fallback | https://github.com/orgs/community/discussions/44322 |

## Pattern 1: one variable per runner class

Required. Give each runner class one configuration variable. Put a GitHub-hosted literal after `||` in each `runs-on`.

```yaml
jobs:
  changes:
    runs-on: ubuntu-slim                                       # small gate job: GitHub-hosted in both modes
  test:
    runs-on: ${{ vars.CI_RUNNER_LINUX || 'ubuntu-latest' }}    # the literal serves forks, Dependabot, and fallback
  e2e:
    runs-on: ${{ vars.CI_RUNNER_LINUX_LARGE || '<github-large-label>' }}
```

Switch a class with `gh`, the GitHub command-line interface (CLI), in a clone. Outside a clone, add `-R OWNER/REPO` (https://cli.github.com/manual/gh_variable_set). A repository variable overrides an organization variable of the same name. Environment-level variables cannot choose the runner (https://docs.github.com/en/actions/reference/workflows-and-actions/variables).

```bash
gh variable set CI_RUNNER_LINUX --body blacksmith-4vcpu-ubuntu-2404   # this repository to Blacksmith
gh variable delete CI_RUNNER_LINUX                                     # back to the organization value or the literal
gh variable set CI_RUNNER_LINUX --org <org> --repos <repo-a>,<repo-b> --body blacksmith-4vcpu-ubuntu-2404  # only repositories with the Blacksmith app
gh variable set CI_RUNNER_LINUX --body ubuntu-latest                   # keep one repository GitHub-hosted while the organization uses Blacksmith
```
- GitHub larger runners need a Team or Enterprise plan and a custom label that you create. Without them, use `ubuntu-latest` as the literal (https://docs.github.com/en/actions/concepts/runners/larger-runners).
- Keep gate jobs on `ubuntu-slim` when they fit its limits (https://docs.github.com/en/actions/reference/runners/github-hosted-runners). It is a small unprivileged container with no Docker and a short job time cap.

## Pattern 2: picker job

Optional. A picker job on `ubuntu-slim` writes the label to a job output. Later jobs set `needs: pick` and `runs-on: ${{ needs.pick.outputs.linux }}`. Cost: one more job on the critical path of every run.

```yaml
jobs:
  pick:
    runs-on: ubuntu-slim                                  # GitHub-hosted, so it runs when Blacksmith does not
    outputs: { linux: '${{ steps.pick.outputs.linux }}' }
    steps:
      - id: pick
        env: { FORCE: '${{ vars.CI_FORCE_GITHUB }}', BUDGET: '${{ vars.CI_BLACKSMITH_BUDGET }}', BLACKSMITH_TOKEN: '${{ secrets.BLACKSMITH_ORG_TOKEN }}' }
        run: |
          use() { echo "linux=$1" >> "$GITHUB_OUTPUT"; exit 0; }
          status=$(curl -fsS -m 5 https://status.blacksmith.sh/summary.json | jq -r .page.status) || status=error
          [ "$FORCE" != 1 ] && [ "$status" = UP ] || use ubuntu-latest
          # Optional cost check. Forks and Dependabot get no variables, and forks get no secrets, so both fall back.
          [ -n "$BLACKSMITH_TOKEN" ] && [ -n "$BUDGET" ] || use ubuntu-latest
          { curl -fsSL https://get.blacksmith.sh | sh && echo "$BLACKSMITH_TOKEN" | blacksmith auth login --api-token - --non-interactive --organization <org>; } || use ubuntu-latest
          cost=$(blacksmith usage --start-time "$(date -u +%Y-%m-01T00:00:00Z)" --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" | jq -r '<cost-path>')
          awk -v c="$cost" -v b="$BUDGET" 'BEGIN { exit !(c ~ /^[0-9.]+$/ && c < b) }' || use ubuntu-latest   # unknown cost: do not spend
          use blacksmith-4vcpu-ubuntu-2404
```
- `CI_FORCE_GITHUB=1` forces GitHub-hosted runners. `CI_BLACKSMITH_BUDGET` holds a copy of the Spending Alerts threshold, because the `blacksmith` CLI cannot read it. `page.status` is `UP` when the status page reports no problem, and any other value falls back (https://status.blacksmith.sh, https://instatus.com/help/api/public-data).
- An admin creates the organization token with `blacksmith org-token create` (https://docs.blacksmith.sh/blacksmith-cli/overview). Fork pull request runs get no secrets (https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).
- The usage output schema is not documented. Run `blacksmith usage --since 30d` once. Copy the path of the estimated cost into `<cost-path>` (https://docs.blacksmith.sh/blacksmith-cli/usage). Then run the picker once. Check in its log that `blacksmith` is on `PATH`.

## Pattern 3: stuck-queue watchdog

Optional. A scheduled workflow on a GitHub-hosted runner finds jobs that wait too long for a `blacksmith-` label. It cancels their runs, switches the variables, and re-runs the runs. Use a re-run, not `workflow_dispatch`: a dispatched run does not satisfy the required checks of a pull request (https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks). Warning: `GITHUB_TOKEN` has no variables permission. Store a GitHub App token or a fine-grained token with Variables write as the secret `CI_VARS_TOKEN` (https://docs.github.com/en/rest/actions/variables).

```yaml
on: { schedule: [{ cron: '*/10 * * * *' }] }
permissions: { actions: write }                           # cancel and re-run workflow runs
jobs:
  watch:
    runs-on: ubuntu-slim                                  # never the variable: it must run when Blacksmith does not
    env: { GH_TOKEN: '${{ github.token }}', VARS_TOKEN: '${{ secrets.CI_VARS_TOKEN }}', GH_REPO: '${{ github.repository }}' }
    steps:
      - run: |
          # Queued jobs and their age in seconds (TSV: run_id, job, labels, age_s)
          for id in $(gh run list -s queued -L 20 --json databaseId -q '.[].databaseId') \
                    $(gh run list -s in_progress -L 20 --json databaseId -q '.[].databaseId'); do
            gh api --paginate "repos/$GH_REPO/actions/runs/$id/jobs?per_page=100" \
              --jq ".jobs[] | select(.status==\"queued\") | [\"$id\", .name, (.labels|join(\",\")), ((now-(.created_at|fromdate))|floor)] | @tsv"
          done > queued.tsv
          awk -F'\t' '$3 ~ /(^|,)blacksmith-/ && $4 > 900 { print $1 }' queued.tsv | sort -u > stuck.txt   # 900 s: above a normal Blacksmith queue
          [ -s stuck.txt ] || exit 0
          while read -r id; do gh run cancel "$id"; done < stuck.txt
          GH_TOKEN="$VARS_TOKEN" gh variable set CI_RUNNER_LINUX --body ubuntu-latest
          GH_TOKEN="$VARS_TOKEN" gh variable set CI_RUNNER_LINUX_LARGE --body '<github-large-label>'
          while read -r id; do gh run watch "$id" > /dev/null; gh run rerun "$id"; done < stuck.txt   # a run must stop before it can re-run
```
- `gh` reads the repository from `GH_REPO` (https://cli.github.com/manual/gh_help_environment). To list queued jobs by hand, run the `for` loop with `GH_REPO=OWNER/REPO` (https://docs.github.com/en/rest/actions/workflow-jobs).
- Confirm the runner label of each re-run with the command in [Proof](#proof), or in its "Set up job" log. If the re-run still asks for a `blacksmith-` label, push a new commit.
- The repository variables override an organization value. When Blacksmith works again, delete them with `gh variable delete`.

## Portable steps

| Feature | On Blacksmith | On GitHub-hosted | Portable choice |
|---|---|---|---|
| `actions/cache`, `actions/setup-*` caches | Blacksmith cache ([docs](https://docs.blacksmith.sh/blacksmith-caching/dependencies-actions)) | GitHub cache | Keep the upstream actions. The backends do not share entries, so the first run after each switch is cold |
| Docker `cache-from`/`cache-to` `type=gha` | GitHub cache (same docs) | GitHub cache | Works on both |
| `useblacksmith/build-push-action` | Works | Not supported: it works only on Blacksmith runners ([README](https://github.com/useblacksmith/build-push-action)) | Gate it with `if: startsWith(vars.CI_RUNNER_LINUX, 'blacksmith-')`. Add a `docker/build-push-action` twin with the opposite condition |
| `useblacksmith/setup-docker-builder` | Sticky-disk builder | Falls back to a local builder unless `nofallback: true` ([README](https://github.com/useblacksmith/setup-docker-builder)) | Gate it the same way. Add a `docker/setup-buildx-action` twin, so `type=gha` gets a builder that exports cache |
| `useblacksmith/stickydisk` | Persistent disk | Plain directory that does not persist ([source](https://github.com/useblacksmith/stickydisk/blob/main/src/main.ts)) | Gate it. Use `actions/cache` on GitHub-hosted runners |
| `astral-sh/setup-uv` | `enable-cache: auto` is off ([source](https://github.com/astral-sh/setup-uv/blob/main/src/utils/inputs.ts)) | `enable-cache: auto` is on | Set `enable-cache: true` |
| Go, Turborepo, Bazel server-side caches | Transparent ([blacksmith.md](blacksmith.md#caches)) | Absent | Keep a cache step for GitHub-hosted runners |
| Docker Hub pulls | Rate limits apply ([limits](https://docs.github.com/en/actions/reference/limits)) | Public pulls are not limited | Log in to Docker Hub or use a registry mirror |
| Matrix width | No documented concurrency limit ([docs](https://docs.blacksmith.sh/blacksmith-runners/concurrency)) | Plan concurrency limit ([limits](https://docs.github.com/en/actions/reference/limits)) | Set `max-parallel` to a value that the GitHub plan allows |
| Tool worker counts | Blacksmith runner size | GitHub-hosted runner size | Let tools detect cores. Do not hard-code a count sized for the Blacksmith runner |
| Run History, Test Analytics, Monitors, Secure Shell (SSH) access | Available ([blacksmith.md](blacksmith.md#observability)) | Absent | Do not let them decide a required check |

```yaml
# Twin build steps. With Pattern 2, test needs.pick.outputs.linux in place of vars.CI_RUNNER_LINUX.
- if: startsWith(vars.CI_RUNNER_LINUX, 'blacksmith-')
  uses: useblacksmith/build-push-action@v2              # works only on Blacksmith runners
  with: { push: true, tags: '<registry>/<image>:<tag>' }
- if: ${{ !startsWith(vars.CI_RUNNER_LINUX, 'blacksmith-') }}   # a leading ! needs ${{ }}
  uses: docker/build-push-action@v7
  with: { push: true, tags: '<registry>/<image>:<tag>', cache-from: type=gha, cache-to: 'type=gha,mode=max' }
```

## Label map

| GitHub label ([reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)) | Closest Blacksmith label ([overview](https://docs.blacksmith.sh/blacksmith-runners/overview), [quickstart](https://docs.blacksmith.sh/introduction/quickstart)) | Difference |
|---|---|---|
| `ubuntu-slim` | None | No twin. Keep gate jobs on `ubuntu-slim` in both modes |
| `ubuntu-latest`, `ubuntu-24.04`, `ubuntu-26.04` | `blacksmith-2vcpu-ubuntu-2404`, `blacksmith-2vcpu-ubuntu-2604` | Same size as the GitHub-hosted runner for private repositories. Public repositories get a larger GitHub-hosted runner. Pin a release, because `ubuntu-latest` follows GitHub image rollouts |
| `ubuntu-24.04-arm`, `ubuntu-26.04-arm` | `blacksmith-2vcpu-ubuntu-2404-arm`, `blacksmith-2vcpu-ubuntu-2604-arm` | Less memory on Blacksmith. No nested virtualization on Blacksmith arm64 |
| Larger runner (custom label) | `blacksmith-<N>vcpu-ubuntu-2404` | GitHub needs a Team or Enterprise plan. The largest sizes differ |
| `windows-latest`, `windows-2025` | `blacksmith-2vcpu-windows-2025` | Beta on Blacksmith. No Linux containers and no full Visual Studio application |
| `macos-latest`, `macos-15`, `macos-26` | `blacksmith-6vcpu-macos-latest`, `blacksmith-6vcpu-macos-15`, `blacksmith-6vcpu-macos-26` | The smallest Blacksmith size is larger. Compare cost per job |

## Proof

1. Set the variable with `gh variable set CI_RUNNER_LINUX --body blacksmith-4vcpu-ubuntu-2404`. Push a commit to start the workflow.
2. Delete the variable with `gh variable delete CI_RUNNER_LINUX`. Push a commit again.
3. For each run, print the label and the runner of every job: `gh api "repos/OWNER/REPO/actions/runs/<run-id>/jobs" --jq '.jobs[] | [.name, (.labels | join(",")), .runner_name] | @tsv'`.
4. Check that each job shows the label that you expect for the mode. The "Set up job" log of each job also names the runner.
