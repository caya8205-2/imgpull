# imgpull

A small CLI to download images directly from a URL and auto-convert (e.g. from `.webp` to `.png`/`.jpg`), without needing third-party downloader sites or manual ImageMagick conversion.

## Install (local, once per machine)

```powershell
cd imgpull
npm install
npm link
```

After `npm link`, the `imgpull` command can be run from anywhere in the terminal.

> When you no longer need it: `npm unlink -g imgpull`

## Usage

### TUI mode (interactive)

Run without any arguments:

```powershell
imgpull
```

The flow: enter URLs one by one (empty Enter to continue) → choose format from a list with up/down arrows → enter quality (for lossy formats) → enter output folder → download+convert with a progress spinner per URL.

### Flag mode (headless, for scripting)

```powershell
# most basic — download & convert to png (default)
imgpull https://example.com/image.webp

# convert to jpg with quality 90
imgpull https://example.com/image.webp -f jpg -q 90

# custom file name & output folder
imgpull https://example.com/image.webp -f png -n result -o ./downloads

# multiple URLs at once
imgpull https://a.com/1.webp https://b.com/2.webp -f jpg

# from a list file (one URL per line, # lines are ignored)
imgpull --batch urls.txt -f png -o ./downloads
```

As soon as any argument/flag is present, it automatically runs headless (no TUI) — so it works great when called from scripts or aliases.

## Options

| Flag | Description | Default |
|---|---|---|
| `-f, --format <fmt>` | png, jpg, webp, avif, tiff, gif | `png` |
| `-o, --output <dir>` | output folder | `imgpull` (auto-created in current directory) |
| `-n, --name <name>` | custom file name (single URL only) | derived from URL |
| `-q, --quality <n>` | quality 1-100 (jpg/webp/avif/tiff) | sharp default |
| `-b, --batch <file>` | read list of URLs from a text file | - |

If the source format matches the target format (and it's not webp with a specific quality request), the file is saved raw without re-encoding — faster and no unnecessary quality loss.

Name conflicts are automatically suffixed with `-1`, `-2`, etc. — files will never be silently overwritten.

## Why not just use ImageMagick commands?

You could, but this combines download + convert + auto-rename + batch in a single command, and uses `sharp` (native libvips bindings) so you don't need to install ImageMagick separately on your system.

## Structure

```
bin/imgpull.js   entry point, chooses TUI or headless based on whether arguments exist
src/lib.js       core logic: download, format detection, conversion, unique filename
src/cli.js       headless mode (commander)
src/ui.js        TUI mode (ink / React in the terminal)
```

Note: this package uses `"type": "module"` (ESM) because `ink` v7 is ESM-only. Everything has been tested end-to-end (download + convert png→jpg, no-op copy, auto-rename collision, TUI fallback in non-TTY) before shipping.