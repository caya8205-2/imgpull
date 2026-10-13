# imgpull

[![npm](https://img.shields.io/npm/v/imgpull?style=flat&logo=npm&logoColor=white)](https://www.npmjs.com/package/imgpull)
[![Node.js](https://img.shields.io/badge/Node.js-18+-43853d?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-f472b6?style=flat&logo=bun&logoColor=white)](https://bun.sh/)
[![sharp](https://img.shields.io/badge/sharp-libvips-99cc00?style=flat&logo=sharp&logoColor=white)](https://sharp.pixelplumbing.com/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat)](LICENSE)

> A small CLI to download images directly from a URL and auto-convert (e.g. from `.webp` to `.png`/`.jpg`), without needing third-party downloader sites or manual ImageMagick conversion.

---

## Quick Start

```powershell
# Install globally via npm
npm install -g imgpull

# Or run directly without installing
npx imgpull "https://example.com/image.webp" -f png
```

---

## Installation

### Option 1: One-line Install (Windows)

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/caya8205-2/imgpull/main/scripts/install.ps1 | iex"
```

This downloads and installs `imgpull.exe` from the latest GitHub Release to `%LOCALAPPDATA%\imgpull` and adds it to your user PATH.

### Option 2: One-line Install (Linux & macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/caya8205-2/imgpull/main/scripts/install.sh | bash
```

This detects your operating system and architecture, downloads the release binary to `~/.local/bin`, and adds it to your shell configuration (`~/.bashrc`, `~/.zshrc`, etc.).

### Option 3: npm (Cross-platform)

```powershell
npm install -g imgpull
```

Requires Node.js 18+.

### Option 4: Build from Source

```powershell
git clone https://github.com/caya8205-2/imgpull.git
cd imgpull
bun install
bun run build
```

Or for local development:
```powershell
npm install
npm link
```

---

## Usage

### TUI mode (interactive)

Run without any arguments:

```powershell
imgpull
```

The flow: enter URLs one by one (empty Enter to continue) → if Instagram link is detected, choose whether to download the first image or all carousel slides → choose format from a list with up/down arrows → enter quality (for lossy formats) → enter output folder → download+convert with a progress spinner per URL.

### Flag mode (headless, for scripting)

```powershell
# most basic — download & convert to png (default)
imgpull https://example.com/image.webp

# convert to jpg with quality 90
imgpull https://example.com/image.webp -f jpg -q 90

# custom file name & output folder
imgpull https://example.com/image.webp -f png -n result -o ./downloads

# set default output folder permanently to ~/.imgpullrc
imgpull -s "C:/Users/Caya/Pictures"

# Instagram post: download first image (cover)
imgpull "https://www.instagram.com/p/ABC123xyz/" -f jpg

# Instagram post: download all carousel slides (all)
imgpull "https://www.instagram.com/p/ABC123xyz/" -a -c cookies.txt

# Save default Instagram cookies file path permanently
imgpull --set-cookie "C:/path/to/cookies.txt"

# multiple URLs at once
imgpull https://a.com/1.webp https://b.com/2.webp -f jpg

# from a list file (one URL per line, # lines are ignored)
imgpull --batch urls.txt -f png -o ./downloads
```

As soon as any argument/flag is present, it automatically runs headless (no TUI) — so it works great when called from scripts or aliases. In an interactive terminal without `-a` or `--first`, it will prompt whether you want the first image or all images.

## Options

| Flag | Description | Default |
|---|---|---|
| `-f, --format <fmt>` | png, jpg, webp, avif, tiff, gif | `png` |
| `-o, --output <dir>` | output folder | `imgpull` (auto-created, or from config `-s`) |
| `-s, --set-default <dir>` | save default output folder to config | - |
| `-a, --all` | download all images (for Instagram carousel) | - |
| `--first` | download first image only (for Instagram posts) | default |
| `-c, --cookies <file>` | Netscape cookies file (.txt) for Instagram login | - |
| `--set-cookie <file>` | save default cookies file path to config | - |
| `-n, --name <name>` | custom file name (single URL only) | derived from URL |
| `-q, --quality <n>` | quality 1-100 (jpg/webp/avif/tiff) | sharp default |
| `-b, --batch <file>` | read list of URLs from a text file | - |

### Instagram Posts & Carousels

Share links from Instagram (e.g. `instagram.com/p/xxxx/` or `instagram.com/reel/xxxx/`) are supported:
- **First image (default)**: Uses public oEmbed endpoint. Fast, clean, no login or cookies needed.
- **All images (carousel)**: Downloads every slide in the carousel. Requires a Netscape format cookie file (exported from browser) via `-c <file>` or `--set-cookie <file>`. If no cookie is present, it will safely fall back to the first image with a warning notice.

If the source format matches the target format (and it's not webp with a specific quality request), the file is saved raw without re-encoding — faster and no unnecessary quality loss.

Name conflicts are automatically suffixed with `-1`, `-2`, etc. — files will never be silently overwritten.

## Why not just use ImageMagick commands?

You could, but this combines download + convert + auto-rename + batch in a single command, and uses `sharp` (native libvips bindings) so you don't need to install ImageMagick separately on your system.

## Structure

```
bin/imgpull.js   entry point, chooses TUI or headless based on whether arguments exist
src/lib.js       core logic: download, format detection, conversion, unique filename
src/instagram.js Instagram URL parsing, oEmbed resolver, and carousel cookie resolver
src/config.js    persistent config manager (~/.imgpullrc)
src/cli.js       headless mode (commander + interactive prompt)
src/ui.js        TUI mode (ink / React in the terminal)
scripts/         install and release automation scripts (.ps1, .sh)
```

Note: this package uses `"type": "module"` (ESM) because `ink` v7 is ESM-only.
