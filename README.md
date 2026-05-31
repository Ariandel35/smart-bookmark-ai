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
| Folders created one batch at a time | Stable root categories in Fast mode; global planning in Complete mode |
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
    <td><strong>Backups</strong><br />Create, inspect, restore, and delete local bookmark snapshots; restore first saves the current state as a new rollback point.</td>
  </tr>
</table>

<table>
  <tr>
    <td width="50%">
      <img src="docs/screenshots/popup-apply-store.png" alt="Marko inline apply confirmation" width="100%" />
    </td>
    <td width="50%">
      <img src="docs/screenshots/options-organization-store.png" alt="Marko organization rules and speed mode" width="100%" />
    </td>
  </tr>
  <tr>
    <td><strong>Apply</strong><br />Confirm the saved preview inline, then back up and rebuild locally without a second model run.</td>
    <td><strong>Rules</strong><br />Tune speed mode, batch size, whitelist websites, and advanced rules without crowding setup.</td>
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
5. Use local rules in Fast mode, or plan a global taxonomy and classify bookmarks with AI in Complete mode.
6. Rebuild the bookmark bar root in one final pass.

## What v3.0 Focuses On

| Area | v3.0 behavior |
| --- | --- |
| Main action | `Preview` is the first step. `Apply Plan` appears only when a plan is ready. |
| Popup mode switch | Fast/Complete can be changed directly in the popup, and any saved preview is invalidated when the mode changes. |
| Setup | Missing provider, Base URL, or model routes the user to settings. Fast preview does not request model access; Complete requests it only when uncached bookmarks need AI classification. |
| API settings | `Test & Save` validates the connection and stores the working configuration. |
| Slow models | DeepSeek and DeepSeek-compatible runs skip the separate taxonomy-planning request, cap each runtime batch at 15 bookmarks, split model requests to 5 bookmarks each, and run up to three mini requests at a time. If the model still times out, Marko stops waiting for that run and finishes with local rules, cache, built-in rules, and manual review. |
| Apply speed | Applying a ready preview reuses the saved plan and rebuilds locally without a second model run. |
| Speed mode | Fast mode skips dead-link checks, the extra taxonomy-planning request, and model waiting; unmatched bookmarks go to manual review. Complete mode keeps link checks and AI classification, while slow providers skip the extra planning request and can fall back locally on timeout. |
| Local reruns | Fast mode can preview without asking for an API key or model endpoint access, because custom rules, cached classifications, built-in domain rules, and manual-review fallback finish locally. |
| Automation | Fast automatic organize can run locally without an API key; Complete automatic organize still requires model credentials and website access. |
| DeepSeek | New/reset configurations start at 15; older large-batch settings are capped per run, DeepSeek-compatible Base URLs or model names use the same profile, and active older jobs are normalized before the next batch without changing the saved setting. |
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
npm test
```

Build the Chrome Web Store upload package:

```bash
npm run package:webstore
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

- Bookmark titles, URLs, current paths, prompts, API settings, caches, and backups stay in local browser storage unless Complete preview or enabled auto organize needs external access.
- Bookmark metadata is sent only to the model provider you configured when Complete preview or enabled auto organize still needs model classification after local rules and cache reuse.
- Applying a saved preview plan rebuilds locally and does not call the model again.
- API keys are stored locally and are never sent to this project or its developer.
- Complete mode connects directly to bookmarked websites for link checks and adds separate taxonomy-planning and model-classification requests; Fast mode skips those external requests.
- Snapshot backups are local and can be restored or deleted from the settings page; restoring creates a fresh local snapshot first.

Read the full policy in [PRIVACY.md](PRIVACY.md).

## Links

- Homepage: [github.com/Ariandel35/marko](https://github.com/Ariandel35/marko)
- Support: [github.com/Ariandel35/marko/issues](https://github.com/Ariandel35/marko/issues)
- Privacy policy: [github.com/Ariandel35/marko/blob/main/PRIVACY.md](https://github.com/Ariandel35/marko/blob/main/PRIVACY.md)
