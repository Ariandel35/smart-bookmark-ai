# Smart Bookmark AI

[English](README.md) | [简体中文](README.zh-CN.md)

![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)
![Release](https://img.shields.io/badge/Version-1.2.0-1f6d53?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-black?style=flat-square)

Smart Bookmark AI is a Chrome extension that helps users clean up large bookmark libraries with LLM-assisted classification.

It creates a local snapshot backup, checks clearly dead links, removes obvious duplicates, and rebuilds a simpler bookmark structure directly at the bookmark bar root.

<p align="center">
  <img src="docs/assets/hero.svg" alt="Smart Bookmark AI hero" width="980" />
</p>

## What It Solves

- Too many bookmarks with no usable structure
- Repeated links that make folders noisy
- Dead bookmarks that should be removed before reorganization
- Settings that need to work with different LLM providers

## Interface Preview

### Product Overview

<p align="center">
  <img src="docs/assets/pages.svg" alt="Product overview" width="980" />
</p>

The overview graphic shows how the popup, settings center, and backup management fit together.

### Popup

<p align="center">
  <img src="docs/screenshots/popup-overview.png" alt="Popup overview" width="430" />
</p>

The popup keeps the main actions close to the top: organize bookmarks, create a manual backup, cancel the current job, and review progress in one place.

### Settings Center

<p align="center">
  <img src="docs/screenshots/options-organization.png" alt="Settings center" width="980" />
</p>

The settings page uses a left-side navigation layout for connection settings, organization rules, automation, and backup management.

## Highlights

- Works with OpenAI, DeepSeek, MiniMax, and Ollama
- Custom Base URL, API key, model name, and prompt
- Chunked background processing for large bookmark collections
- Dead link detection before AI classification
- Conservative duplicate cleanup
- Whitelist domains that should never be reorganized
- Automatic local snapshot backup before each organize run
- Manual backup, restore, and delete
- Auto organize with Chrome alarms
- Reviewable unprocessed and delete logs

## Workflow

Smart Bookmark AI is designed for safety first. It does not rewrite the bookmark tree while analysis is still in progress.

<p align="center">
  <img src="docs/assets/workflow.svg" alt="Workflow diagram" width="980" />
</p>

1. Create a local snapshot backup
2. Scan links for clearly dead bookmarks
3. Send bookmark context to the model provider you selected
4. Build a full plan
5. Rebuild the final structure at the bookmark root in one pass

## Privacy Summary

- Bookmarks are only sent to the model provider you choose
- API keys and backups are stored locally in the browser
- Dead link detection sends requests directly to bookmarked websites
- The extension developer does not receive your bookmark data

Full privacy details: [PRIVACY.md](PRIVACY.md)

## Required Permissions

- `bookmarks`: read, move, delete, and rebuild bookmarks
- `storage`: save settings, progress, and backup records
- `alarms`: schedule auto organize jobs
- Optional website access: requested at runtime for model API access and dead link checks

## Repository Structure

- [manifest.json](manifest.json)
- [background.js](background.js)
- [popup.html](popup.html)
- [popup.js](popup.js)
- [options.html](options.html)
- [options.js](options.js)
- [styles.css](styles.css)
- [privacy.html](privacy.html)
- [docs/assets](docs/assets)
- [docs/screenshots](docs/screenshots)
- [webstore](webstore)

## Local Development

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select this repository root

### Syntax checks

```bash
node --check background.js
node --check options.js
node --check popup.js
```

## GitHub and Chrome Web Store

- Homepage: [github.com/Ariandel35/smart-bookmark-ai](https://github.com/Ariandel35/smart-bookmark-ai)
- Support: [github.com/Ariandel35/smart-bookmark-ai/issues](https://github.com/Ariandel35/smart-bookmark-ai/issues)
- Privacy policy: [github.com/Ariandel35/smart-bookmark-ai/blob/main/PRIVACY.md](https://github.com/Ariandel35/smart-bookmark-ai/blob/main/PRIVACY.md)

Store submission materials are prepared in [webstore](webstore).
