#!/usr/bin/env bash
set -euo pipefail

REPO_OWNER="caya8205-2"
REPO_NAME="imgpull"
INSTALL_DIR="${HOME}/.local/bin"

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

# ── Detect OS & arch ──────────────────────────────────────
detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux*)  PLATFORM="linux" ;;
    Darwin*) PLATFORM="macos" ;;
    *)       err "Unsupported OS: $os"; exit 1 ;;
  esac

  case "$arch" in
    x86_64|amd64) ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *)             err "Unsupported architecture: $arch"; exit 1 ;;
  esac
}

# ── Determine binary names for GitHub Release assets ──────
get_binary_names() {
  IMGPULL_BIN="imgpull-${PLATFORM}"
}

# ── Download helper ───────────────────────────────────────
dl() {
  local url="$1" dest="$2" name
  name="$(basename "$url")"
  echo -n "  Downloading ${name} ..."
  if command -v curl &>/dev/null; then
    curl -fsSL -o "$dest" "$url"
  elif command -v wget &>/dev/null; then
    wget -qO "$dest" "$url"
  else
    err "Neither curl nor wget found. Cannot download."
    exit 1
  fi
  echo ""
  checkmark "Downloaded ${name}"
}

# ── Add to PATH via shell rc ─────────────────────────────
add_to_path() {
  local line="export PATH=\"${INSTALL_DIR}:\$PATH\""

  for rc in "${HOME}/.bashrc" "${HOME}/.zshrc" "${HOME}/.profile"; do
    if [ -f "$rc" ]; then
      if ! grep -qF "$INSTALL_DIR" "$rc" 2>/dev/null; then
        echo "" >> "$rc"
        echo "# imgpull" >> "$rc"
        echo "$line" >> "$rc"
        checkmark "Added to PATH in $(basename "$rc")"
      fi
    fi
  done

  # Also add to current session
  export PATH="${INSTALL_DIR}:$PATH"
}

# ── Remove from PATH via shell rc ─────────────────────────
remove_from_path() {
  for rc in "${HOME}/.bashrc" "${HOME}/.zshrc" "${HOME}/.profile"; do
    if [ -f "$rc" ] && grep -qF "# imgpull" "$rc" 2>/dev/null; then
      sed -i.bak "/# imgpull/d" "$rc"
      sed -i.bak "\|${INSTALL_DIR}|d" "$rc"
      rm -f "${rc}.bak"
    fi
  done
}

# ── Uninstall ─────────────────────────────────────────────
do_uninstall() {
  echo -e "${YELLOW}Removing imgpull ...${NC}"
  if [ -f "${INSTALL_DIR}/imgpull" ]; then
    rm -f "${INSTALL_DIR}/imgpull"
    checkmark "Removed ${INSTALL_DIR}/imgpull"
  else
    warn "Binary not found: ${INSTALL_DIR}/imgpull"
  fi
  remove_from_path
  echo ""
  checkmark "imgpull uninstalled"
}

# ── Main ──────────────────────────────────────────────────
main() {
  detect_platform
  get_binary_names

  # Handle --uninstall flag
  if [ "${1:-}" = "--uninstall" ] || [ "${1:-}" = "-u" ]; then
    do_uninstall
    exit 0
  fi

  echo -e "${CYAN}imgpull installer (${PLATFORM}/${ARCH})${NC}"
  echo ""

  # Check if already installed
  if [ -f "${INSTALL_DIR}/imgpull" ]; then
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

  # Create install dir
  mkdir -p "$INSTALL_DIR"

  # Check for local install (running from dist/ folder)
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd 2>/dev/null || true)"
  LOCAL_BIN="${SCRIPT_DIR}/imgpull"

  if [ -n "$SCRIPT_DIR" ] && [ -f "$LOCAL_BIN" ]; then
    echo -e "${CYAN}Installing from local files ...${NC}"
    cp "$LOCAL_BIN" "${INSTALL_DIR}/imgpull"
    chmod +x "${INSTALL_DIR}/imgpull"
    checkmark "Copied imgpull"
  else
    echo -e "${CYAN}Fetching release info from GitHub ...${NC}"

    # Get release info
    local api_url="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest"
    local release_json=""
    if command -v curl &>/dev/null; then
      release_json="$(curl -fsSL -H "User-Agent: imgpull-installer" "$api_url" || true)"
    else
      release_json="$(wget -qO- --header="User-Agent: imgpull-installer" "$api_url" || true)"
    fi

    local tag_name=""
    if [ -n "$release_json" ]; then
      tag_name="$(echo "$release_json" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)"
    fi

    if [ -z "$tag_name" ]; then
      err "Failed to fetch release info from GitHub."
      echo -e "${YELLOW}Make sure the repository has published releases.${NC}"
      echo -e "${CYAN}You can also install via npm:${NC}"
      echo "  npm install -g imgpull"
      echo ""
      echo -e "${CYAN}Or download manually from:${NC}"
      echo "https://github.com/${REPO_OWNER}/${REPO_NAME}/releases"
      exit 1
    fi

    checkmark "Found release ${tag_name}"
    local base_url="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${tag_name}"

    dl "${base_url}/${IMGPULL_BIN}" "${INSTALL_DIR}/imgpull"
    chmod +x "${INSTALL_DIR}/imgpull"
  fi

  add_to_path

  echo ""
  checkmark "Installation complete"
  echo ""
  echo -e "${CYAN}Installed to:${NC}"
  echo -e "  ${INSTALL_DIR}/imgpull"
  echo ""
  echo -e "Open a new terminal and run: ${GREEN}imgpull --help${NC}"
}

main "$@"
