# Marko

[English](README.md) | [简体中文](README.zh-CN.md)

![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)
![Release](https://img.shields.io/badge/Version-3.0.0-1f6d53?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-black?style=flat-square)

Marko is a Chrome extension that helps users clean up large bookmark libraries with LLM-assisted classification.

It creates a local snapshot backup, checks clearly dead links, removes obvious duplicates, plans a stable global taxonomy, and rebuilds a simpler bookmark structure directly at the bookmark bar root.

<p align="center">
  <img src="docs/assets/hero.svg" alt="Marko hero" width="860" />
</p>

## What It Solves

- Too many bookmarks with no usable structure
- Repeated links that make folders noisy
- Dead bookmarks that should be removed before reorganization
- Settings that need to work with different LLM providers

## Interface Preview

### Product Overview

<p align="center">
  <img src="docs/assets/pages.svg" alt="Product overview" width="860" />
</p>

The overview graphic shows how the popup, settings, and backup management fit together.

### Popup

<p align="center">
  <img src="docs/screenshots/popup-store.png" alt="Popup overview" width="430" />
</p>

The popup is preview-first: generate a plan, apply it when it looks right, create a manual backup, or cancel a running job from one compact panel.

### Settings

<p align="center">
  <img src="docs/screenshots/options-connection-store.png" alt="Settings center" width="860" />
</p>

The settings page keeps the everyday path focused on model connection, rules, automation, and backups, with advanced rule fields collapsed by default.

## Highlights

- Works with OpenAI, DeepSeek, Anthropic, Gemini, OpenRouter, Groq, xAI, Moonshot AI, Ollama, and generic OpenAI-compatible endpoints
- Custom Base URL, API key, model name, and prompt
- Global taxonomy planning before chunked classification for more stable folders
- Preview mode before applying changes to the bookmark tree
- API testing saves the verified connection settings
- Slow model requests automatically retry with smaller batches instead of stopping immediately
- Conservative duplicate cleanup and dead link detection before AI classification
- Protected root folders and domain-to-folder rules
- Classification cache reuse and dead link cache for faster reruns
- Automatic local snapshot backup before each organize run
- Manual backup, restore, and delete
- Auto organize with Chrome alarms
- Reviewable unprocessed and delete logs
- English and Simplified Chinese interface support

## Workflow

Marko is designed for safety first. It does not rewrite the bookmark tree while analysis is still in progress.

<p align="center">
  <img src="docs/assets/workflow.svg" alt="Workflow diagram" width="860" />
</p>

1. Optionally generate a preview without changing bookmarks
2. Create a local snapshot backup before a real organize run
3. Scan links for clearly dead bookmarks
4. Plan a global folder taxonomy, then classify in chunks
5. Rebuild the final structure at the bookmark root in one pass

## Privacy Summary

- Bookmarks are only sent to the model provider you choose
- API keys and backups are stored locally in the browser
- Classification cache and dead-link cache are stored locally to speed up later runs
- Dead link detection sends requests directly to bookmarked websites
- The extension developer does not receive your bookmark data

Full privacy details: [PRIVACY.md](PRIVACY.md)

## Required Permissions

- `bookmarks`: read, move, delete, and rebuild bookmarks
- `storage`: save settings, progress, and backup records
- `alarms`: schedule auto organize jobs
- Optional website access: requested at runtime for model API access and dead link checks

## Advanced Rules

- `Protected root folders`: keep selected top-level bookmark folders untouched during organize runs
- `Domain folder rules`: force matching domains into specific folders before AI classification
- `Preview mode`: inspect the planned structure and key counts before rebuilding
- `Cache reuse`: previously classified bookmarks can be reused locally when the title, URL, and rules signature still match

## Repository Structure

- [manifest.json](manifest.json)
- [background.js](background.js)
- [providers.js](providers.js)
- [json-utils.js](json-utils.js)
- [rules.js](rules.js)
- [cache-utils.js](cache-utils.js)
- [i18n.js](i18n.js)
- [popup.html](popup.html)
- [popup.js](popup.js)
- [options.html](options.html)
- [options.js](options.js)
- [styles.css](styles.css)
- [privacy.html](privacy.html)
- [tests](tests)
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
node --check providers.js
node --check i18n.js
node tests/run-tests.js
```

## GitHub and Chrome Web Store

- Homepage: [github.com/Ariandel35/smart-bookmark-ai](https://github.com/Ariandel35/smart-bookmark-ai)
- Support: [github.com/Ariandel35/smart-bookmark-ai/issues](https://github.com/Ariandel35/smart-bookmark-ai/issues)
- Privacy policy: [github.com/Ariandel35/smart-bookmark-ai/blob/main/PRIVACY.md](https://github.com/Ariandel35/smart-bookmark-ai/blob/main/PRIVACY.md)

Store submission materials are prepared in [webstore](webstore).
