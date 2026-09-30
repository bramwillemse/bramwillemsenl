#!/usr/bin/env bash
#
# Set up a fresh Linux (cloud) environment to build and test this site.
#
# - Installs Hugo (extended) in the version Netlify uses (netlify.toml)
# - Installs Node dependencies with Yarn
# - Installs the Playwright Chromium browser for `yarn test`
#
# Safe to run repeatedly: steps that are already done are skipped.
#
# Usage:
#   bin/setup-cloud.sh                 # full setup
#   SKIP_BROWSER=1 bin/setup-cloud.sh  # skip Playwright browser (faster)
#   INSTALL_DIR=$HOME/.local/bin bin/setup-cloud.sh   # Hugo without root

set -euo pipefail

cd "$(dirname "$0")/.."

INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

log() { printf '\n==> %s\n' "$1"; }

# --- Hugo --------------------------------------------------------------------

HUGO_VERSION="$(sed -n 's/^[[:space:]]*HUGO_VERSION[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' netlify.toml)"
if [ -z "$HUGO_VERSION" ]; then
  echo "Could not read HUGO_VERSION from netlify.toml" >&2
  exit 1
fi

hugo_bin="$INSTALL_DIR/hugo"
installed_hugo="$("$hugo_bin" version 2>/dev/null || true)"

if printf '%s' "$installed_hugo" | grep -q "v${HUGO_VERSION}" && printf '%s' "$installed_hugo" | grep -q "extended"; then
  log "Hugo ${HUGO_VERSION} extended already installed"
else
  log "Installing Hugo ${HUGO_VERSION} extended to ${INSTALL_DIR}"
  case "$(uname -m)" in
    x86_64)  arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
  esac

  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  url="https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-${arch}.tar.gz"

  curl -fsSL -o "$tmp/hugo.tgz" "$url"
  tar -xzf "$tmp/hugo.tgz" -C "$tmp" hugo
  mkdir -p "$INSTALL_DIR"
  install -m 755 "$tmp/hugo" "$INSTALL_DIR/hugo"
fi

# --- Node --------------------------------------------------------------------

expected_node="$(tr -d 'v\n' < .nvmrc 2>/dev/null || true)"
actual_node="$(node --version | sed 's/^v//')"
if [ -n "$expected_node" ] && [ "${actual_node%%.*}" != "${expected_node%%.*}" ]; then
  log "Warning: Node ${actual_node} found, .nvmrc/Netlify use Node ${expected_node}"
fi

# --- Dependencies ------------------------------------------------------------

log "Installing Node dependencies"
yarn install --frozen-lockfile

# --- Playwright --------------------------------------------------------------

if [ "${SKIP_BROWSER:-0}" = "1" ]; then
  log "Skipping Playwright browser (SKIP_BROWSER=1)"
else
  log "Installing Playwright Chromium"
  yarn playwright install --with-deps chromium
fi

log "Done"
echo "  hugo:  $("$hugo_bin" version | cut -d' ' -f2)"
echo "  node:  $(node --version)"
echo "  yarn:  $(yarn --version)"
echo
echo "Next: yarn build:webpack && hugo server   (then: yarn test)"
