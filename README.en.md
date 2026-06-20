# BookmarkSync

> [English](README.en.md) | [中文](README.md)

> [!WARNING]
> Please back up your bookmarks before use. This tool is provided "as is" without any guarantee of stability or reliability. Use at your own risk.

Cross-platform browser bookmark sync tool. Based on Gist (Gitee/GitHub) storage with smart merge, manual merge, AES-256-GCM encryption, i18n UI, and time machine rollback.

> More storage backends (WebDAV, self-hosted Git, etc.) coming in future releases.

---

## Features

- **Multi-device sync** — Store bookmarks via Gitee Gist / GitHub Gist
- **Smart three-way merge** — Automatically merges additions, deletions, and modifications with conflict resolution
- **Manual merge** — Three-column comparison UI with per-item keep/delete selection
- **Order sync strategy** — Disabled / Cloud priority / Local priority
- **Safe guard** — Detects mass deletions and prompts manual merge confirmation
- **AES-256-GCM encryption** — Optional end-to-end encryption with passphrase-derived key
- **Multi-language** — 简体中文, 繁體中文(台灣/香港/澳門), 日本語, 한국어, English
- **Time machine** — Auto-backup snapshots with history tree view and one-click restore
- **Auto sync** — Background sync at configurable intervals
- **Dark theme** — System / Light / Dark

## Installation

### Chrome Web Store

_Coming soon_

### Manual Install

1. Download the built extension or build it yourself
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `BookmarkSync/.output/chrome-mv3` directory

## Development

```bash
# Install dependencies
pnpm install

# Dev mode (hot reload)
pnpm dev

# Production build
pnpm build

# Output to .output/chrome-mv3/
```

## Tech Stack

- **Framework**: WXT + Vite + React
- **Language**: TypeScript
- **UI**: Bootstrap 4 + react-bootstrap
- **Encryption**: Web Crypto API (SubtleCrypto)
- **i18n**: react-i18next + i18next
- **Package manager**: pnpm

## License

MIT
