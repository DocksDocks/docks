# CI workflows (.github/)

`workflows/ci.yml` runs the same guards + scorers as local `scripts/ci.sh`, plus YAML / manifest validation, on GitHub. Skill YAML/frontmatter guards use Node + pnpm (`corepack enable`, then `pnpm install --frozen-lockfile`) before running `scripts/skills/guard.sh`, which covers Codex and Claude compatibility checks.

## Trigger model

Only three events trigger CI:
- `pull_request` to main → gate merges
- `push` of tags matching `docks--v*` → gate releases (`release.sh` waits for this)
- `workflow_dispatch` → manual

<constraint>
**No** `push: branches: [main]` trigger — main pushes don't re-run CI; PR validation already covers it. The tag-push CI is the authoritative release gate (it decides whether the GitHub Release object is created).
</constraint>

## Keep in sync with scripts/ci.sh

`ci.yml` mirrors `scripts/ci.sh` — when you add or remove a validator under `scripts/`, update both. Local `ci.sh` is LAYER 1 (fast feedback); tag-CI here is LAYER 2 (authoritative, catches contributor-machine drift). See `scripts/AGENTS.md` for the validator list and release flow.

The one intentional divergence: `plugin-validate` in `ci.yml` runs `claude` from the lockfile-pinned `@anthropic-ai/claude-code` devDependency (clean runner, no ambient CLI), while `ci.sh` uses whatever `claude` is on the developer's PATH (and warns if absent). Both run the same `claude plugin validate ./plugins/docks` — don't "unify" them by forcing local devs through a 230MB binary install.

## Supply-chain hardening

Mitigations against npm / GitHub Actions supply-chain attacks (per the Supabase + pnpm Dec-2025 guidance). Each is load-bearing — don't undo one to simplify a diff:

<constraint>
- **Pin every `uses:` to a 40-char commit SHA**, never a tag, with the version as a trailing comment (`actions/checkout@<sha> # v6.0.2`). A `@vN` tag is a moving target an attacker can republish; the tag-push run executes with `GITHUB_TOKEN`. Renovate/Dependabot update the SHA + comment for you.
- **`permissions: contents: read`** at the workflow top — least privilege for read-only validators.
- **`claude-code` is pinned**, not `npm install -g`'d: it's an exact-version devDependency in `package.json`, hash-locked in `pnpm-lock.yaml` (incl. its 8 platform-binary optional deps). `pnpm-workspace.yaml` sets `allowBuilds: { '@anthropic-ai/claude-code': false }` (deny-by-default lifecycle scripts) and `minimumReleaseAge` (quarantine fresh publishes). Bump it only to a version aged past the quarantine.
- **Binary fetch is scoped to `plugin-validate`**: that job does a full `pnpm install --frozen-lockfile` then `node node_modules/@anthropic-ai/claude-code/install.cjs` to materialize the ~230MB CLI binary (the `allowBuilds: false` build it skips). `guard`/`scaffold` add `--config.optional=false` to skip the binary they don't need.
- **`npm audit signatures`** runs (non-blocking) after every install.
</constraint>
