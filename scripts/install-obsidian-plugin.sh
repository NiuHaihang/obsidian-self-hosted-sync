#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PLUGIN_ID="self-hosted-sync"
PLUGIN_WORKSPACE="@self-hosted/obsidian-plugin"
PLUGIN_DIST_DIR="${REPO_ROOT}/apps/obsidian-plugin/dist"

usage() {
  echo "Usage: $0 <vault-path> [--no-build]"
  echo
  echo "Examples:"
  echo "  $0 \"$HOME/Documents/MyVault\""
  echo "  $0 \"$HOME/Documents/MyVault\" --no-build"
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 1
fi

VAULT_PATH="$1"
NO_BUILD="false"

if [[ $# -eq 2 ]]; then
  if [[ "$2" != "--no-build" ]]; then
    usage
    exit 1
  fi
  NO_BUILD="true"
fi

if [[ ! -d "${VAULT_PATH}" ]]; then
  echo "Vault path does not exist: ${VAULT_PATH}"
  exit 1
fi

if [[ "${NO_BUILD}" != "true" ]]; then
  echo "[install] Building plugin bundle..."
  npm run --workspace "${PLUGIN_WORKSPACE}" build --prefix "${REPO_ROOT}"
fi

if [[ ! -f "${PLUGIN_DIST_DIR}/main.js" || ! -f "${PLUGIN_DIST_DIR}/manifest.json" ]]; then
  echo "Plugin dist files not found. Run build first or remove --no-build."
  exit 1
fi

TARGET_DIR="${VAULT_PATH}/.obsidian/plugins/${PLUGIN_ID}"
mkdir -p "${TARGET_DIR}"

cp "${PLUGIN_DIST_DIR}/main.js" "${TARGET_DIR}/main.js"
cp "${PLUGIN_DIST_DIR}/manifest.json" "${TARGET_DIR}/manifest.json"

if [[ -f "${PLUGIN_DIST_DIR}/styles.css" ]]; then
  cp "${PLUGIN_DIST_DIR}/styles.css" "${TARGET_DIR}/styles.css"
fi

echo "[install] Installed ${PLUGIN_ID} to: ${TARGET_DIR}"
echo "[install] In Obsidian: Settings -> Community plugins -> Reload/Enable '${PLUGIN_ID}'"
