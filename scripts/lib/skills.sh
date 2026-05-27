#!/bin/bash
# Shared helpers for skill validation scripts.

skills_repo_root() {
  cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd
}

skills_print_node_install_help() {
  cat >&2 <<'EOF'
FAIL: Node.js is required for skill YAML validation.

Install Node.js, then enable pnpm through Corepack:
  corepack enable
  pnpm install --frozen-lockfile

OS notes:
  macOS/Homebrew:        brew install node
  Debian/Ubuntu:         sudo apt install nodejs npm
  Fedora:                sudo dnf install nodejs
  Arch:                  sudo pacman -S nodejs npm
  CI/GitHub Actions:     use actions/setup-node, then corepack enable

If your distro ships an old Node.js without Corepack, install a current Node.js
from your standard Node distribution channel, then rerun the commands above.
EOF
}

skills_print_yaml_install_help() {
  cat >&2 <<'EOF'
FAIL: missing Node dependency `yaml`.

This repo uses pnpm and the npm `yaml` package for SKILL.md frontmatter
validation. Install the locked dev dependency before running CI:
  corepack enable
  pnpm install --frozen-lockfile

If pnpm is unavailable after enabling Corepack:
  corepack prepare pnpm@10.33.2 --activate
  pnpm install --frozen-lockfile
EOF
}

skills_require_node_yaml() {
  local repo_root="${1:-$(skills_repo_root)}"

  if ! command -v node >/dev/null 2>&1; then
    skills_print_node_install_help
    return 2
  fi

  if ! (cd "$repo_root" && node -e 'require.resolve("yaml")' >/dev/null 2>&1); then
    skills_print_yaml_install_help
    return 2
  fi
}
