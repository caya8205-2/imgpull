#!/usr/bin/env bash
set -euo pipefail

REPO_OWNER="caya8205-2"
REPO_NAME="imgpull"
APP_DIR="${HOME}/.local/share/imgpull"
BIN_DIR="${HOME}/.local/bin"
BIN_PATH="${BIN_DIR}/imgpull"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
DIM='\033[2m'
NC='\033[0m'

checkmark() {
  echo -e "  ${GREEN}>> $1${NC}"
}

warn() {
  echo -e "  ${YELLOW}WARNING: $1${NC}"
}

err() {
  echo -e "  ${RED}ERROR: $1${NC}"
}

# ── Add to PATH via shell rc ─────────────────────────────
add_to_path() {
  local line="export PATH=\"${BIN_DIR}:\$PATH\""

  for rc in "${HOME}/.bashrc" "${HOME}/.zshrc" "${HOME}/.profile"; do
    if [ -f "$rc" ]; then
      if ! grep -qF "$BIN_DIR" "$rc" 2>/dev/null; then
        echo "" >> "$rc"
        echo "# imgpull" >> "$rc"
        echo "$line" >> "$rc"
        checkmark "Added to PATH in $(basename "$rc")"
      fi
    fi
  done

  # Also add to current session
  export PATH="${BIN_DIR}:$PATH"
}

# ── Remove from PATH via shell rc ─────────────────────────
remove_from_path() {
  for rc in "${HOME}/.bashrc" "${HOME}/.zshrc" "${HOME}/.profile"; do
    if [ -f "$rc" ] && grep -qF "# imgpull" "$rc" 2>/dev/null; then
      sed -i.bak "/# imgpull/d" "$rc"
      sed -i.bak "\|${BIN_DIR}|d" "$rc"
      rm -f "${rc}.bak"
    fi
  done
}

# ── Uninstall ─────────────────────────────────────────────
do_uninstall() {
  echo -e "${YELLOW}Removing imgpull ...${NC}"
  if [ -d "$APP_DIR" ]; then
    rm -rf "$APP_DIR"
    checkmark "Removed ${APP_DIR}"
  fi
  if [ -f "$BIN_PATH" ]; then
    rm -f "$BIN_PATH"
    checkmark "Removed ${BIN_PATH}"
  fi
  remove_from_path
  echo ""
  checkmark "imgpull uninstalled"
}

# ── Main ──────────────────────────────────────────────────
main() {
  # Handle --uninstall flag
  if [ "${1:-}" = "--uninstall" ] || [ "${1:-}" = "-u" ]; then
    do_uninstall
    exit 0
  fi

  # Check prerequisites
  if ! command -v node &>/dev/null; then
    err "Node.js is required to run imgpull."
    echo "Please install Node.js 18+ from https://nodejs.org"
    exit 1
  fi

  if ! command -v npm &>/dev/null; then
    err "npm is required to install imgpull."
    exit 1
  fi

  echo -e "${CYAN}imgpull installer${NC}"
  echo ""

  # Check if already installed
  if [ -f "$BIN_PATH" ]; then
    echo -e "${YELLOW}imgpull is already installed.${NC}"
    echo "  [U]ninstall   - remove imgpull"
    echo "  [R]einstall   - overwrite files"
    echo "  [C]ancel      - do nothing"
    read -rp "Choice: " choice
    choice="$(echo "$choice" | tr '[:lower:]' '[:upper:]')"
    case "$choice" in
      U) do_uninstall; exit 0 ;;
      R) ;; # continue to install
      *) echo -e "${DIM}Cancelled.${NC}"; exit 0 ;;
    esac
  fi

  # Create dirs
  mkdir -p "$APP_DIR" "$BIN_DIR"

  # Determine package source
  PKG_SPEC="imgpull"
  if ! npm view "$PKG_SPEC" version &>/dev/null; then
    PKG_SPEC="https://github.com/${REPO_OWNER}/${REPO_NAME}.git"
  fi

  echo -e "${CYAN}Installing imgpull (${PKG_SPEC}) via npm ...${NC}"
  npm install --prefix "$APP_DIR" "$PKG_SPEC" --no-fund --no-audit

  # Create launcher shim
  cat << 'EOF' > "$BIN_PATH"
#!/usr/bin/env bash
exec node "$HOME/.local/share/imgpull/node_modules/imgpull/bin/imgpull.js" "$@"
EOF
  chmod +x "$BIN_PATH"
  checkmark "Created launcher script at ${BIN_PATH}"

  add_to_path

  echo ""
  checkmark "Installation complete"
  echo ""
  echo -e "${CYAN}Installed to:${NC}"
  echo -e "  ${APP_DIR}"
  echo ""
  echo -e "Open a new terminal and run: ${GREEN}imgpull${NC}"
}

main "$@"
