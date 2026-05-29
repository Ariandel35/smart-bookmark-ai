# Marko

<p align="center">
  <img src="icons/icon-128.png" alt="Marko icon" width="88" />
</p>

<p align="center">
  <strong>A calmer Chrome bookmark organizer, powered by the model you choose.</strong>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="https://github.com/Ariandel35/marko/issues">Issues</a> ·
  <a href="PRIVACY.md">Privacy</a>
</p>

<p align="center">
  <img alt="Chrome MV3" src="https://img.shields.io/badge/Chrome-MV3-4285F4?style=flat-square&logo=googlechrome&logoColor=white" />
  <img alt="Version 3.0.0" src="https://img.shields.io/badge/Version-3.0.0-1f6d53?style=flat-square" />
  <img alt="MIT License" src="https://img.shields.io/badge/License-MIT-black?style=flat-square" />
</p>

<p align="center">
  <img src="docs/assets/hero.svg" alt="Marko product hero" width="920" />
</p>

Marko helps turn a crowded Chrome bookmark bar into a smaller, clearer, easier-to-browse structure. It previews an AI-assisted cleanup plan first, creates a local backup before real changes, and only rebuilds your bookmarks after you choose to apply the plan.

## Why Marko

| A messy bookmark library usually has... | Marko responds with... |
| --- | --- |
| Duplicate links scattered across folders | Conservative duplicate cleanup before classification |
| Old links that no longer open | Dead-link checks that remove only clearly failed URLs |
| Folders created one batch at a time | A global taxonomy plan before chunked classification |
| Risky one-click cleanup tools | Preview first, backup second, rebuild last |
| Too many settings for a simple task | A focused popup and a shorter setup path |

## Product Tour

<p align="center">
  <img src="docs/assets/pages.svg" alt="Marko popup, settings, and backup pages" width="920" />
</p>

<table>
  <tr>
    <td width="34%">
      <img src="docs/screenshots/popup-store.png" alt="Marko popup preview" width="100%" />
    </td>
    <td width="33%">
      <img src="docs/screenshots/options-connection-store.png" alt="Marko model settings" width="100%" />
    </td>
    <td width="33%">
      <img src="docs/screenshots/options-backup-store.png" alt="Marko backup settings" width="100%" />
    </td>
  </tr>
  <tr>
    <td><strong>Popup</strong><br />Preview, apply, back up, cancel, and watch progress from one compact panel.</td>
    <td><strong>Connection</strong><br />Choose a provider, test the API, save the working model, and keep advanced fields out of the way.</td>
    <td><strong>Backups</strong><br />Create, inspect, restore, and delete local bookmark snapshots when you need a rollback point.</td>
  </tr>
</table>

## Safe Organizing Flow

<p align="center">
  <img src="docs/assets/workflow.svg" alt="Marko safe organizing workflow" width="920" />
</p>

1. Generate a preview plan without changing the current bookmark tree.
2. Create a local snapshot backup before a real organize run.
3. Check links and remove only confirmed dead bookmarks.
4. Detect exact duplicates and preserve uncertain items for review.
5. Plan a global folder taxonomy, then classify bookmarks in batches.
6. Rebuild the bookmark bar root in one final pass.

## What v3.0 Focuses On

| Area | v3.0 behavior |
| --- | --- |
| Main action | `Preview` is the first step. `Apply Plan` appears only when a plan is ready. |
| Setup | Missing provider, Base URL, model, or API key routes the user to settings. |
| API settings | `Test & Save` validates the connection and stores the working configuration. |
| Slow models | Timeout retries automatically shrink the current batch size before giving up. |
| Speed mode | Fast mode skips dead-link checks for quicker previews; Complete mode checks links before classification. |
| DeepSeek | New and reset configurations start with a smaller default batch size. |
| Advanced rules | Protected folders, domain rules, and prompt fields stay available but quieter. |
| Language | English and Simplified Chinese are both supported in the extension UI. |

## Model Providers

Marko works with OpenAI, DeepSeek, MiniMax, Anthropic, Gemini, OpenRouter, Groq, xAI, Moonshot AI, Ollama, and generic OpenAI-compatible endpoints.

You can configure the provider, Base URL, API key, model name, prompt, batch size, whitelist, protected root folders, and domain-to-folder rules.

## Install Locally

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this repository root.

## Development

Run the static checks and extension tests:

```bash
node --check background.js
node --check popup.js
node --check options.js
node --check providers.js
node --check i18n.js
node --check rules.js
node --check cache-utils.js
node --check json-utils.js
node tests/run-tests.js
```

Core files:

| File | Purpose |
| --- | --- |
| [manifest.json](manifest.json) | Chrome MV3 extension manifest |
| [background.js](background.js) | Organizing jobs, backups, scanning, and rebuild logic |
| [providers.js](providers.js) | Provider defaults, request builders, and response parsing |
| [popup.js](popup.js) | Preview and apply flow |
| [options.js](options.js) | Settings, API test, backups, and rules |
| [i18n.js](i18n.js) | English and Simplified Chinese copy |
| [tests](tests) | JSON, rules, cache, asset, and i18n checks |
| [docs](docs) | README visuals and screenshots |
| [webstore](webstore) | Chrome Web Store listing material |

## Privacy Boundaries

- Bookmark titles, URLs, current paths, prompts, API settings, caches, and backups stay in local browser storage unless you start an organize run.
- During organize or auto organize, bookmark metadata is sent only to the model provider you configured.
- API keys are stored locally and are never sent to this project or its developer.
- Complete link checks connect directly to bookmarked websites; Fast mode skips those checks.
- Snapshot backups are local and can be restored or deleted from the settings page.

Read the full policy in [PRIVACY.md](PRIVACY.md).

## Links

- Homepage: [github.com/Ariandel35/marko](https://github.com/Ariandel35/marko)
- Support: [github.com/Ariandel35/marko/issues](https://github.com/Ariandel35/marko/issues)
- Privacy policy: [github.com/Ariandel35/marko/blob/main/PRIVACY.md](https://github.com/Ariandel35/marko/blob/main/PRIVACY.md)
