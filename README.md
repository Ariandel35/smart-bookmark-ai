# Smart Bookmark AI

Smart Bookmark AI is a Chrome extension built on Manifest V3 that helps users reorganize large bookmark collections with LLM-assisted classification.

It reads bookmark titles, URLs, and folder paths, checks for clearly dead links, removes obvious duplicates, and rebuilds a cleaner bookmark structure directly at the bookmark bar root.

## Features

- Works with OpenAI, DeepSeek, MiniMax, and Ollama
- Custom Base URL, API Key, model name, and prompt
- Chunked background processing for large bookmark libraries
- Dead link detection before AI classification
- Conservative duplicate cleanup
- Whitelist domains that should never be reorganized
- Automatic local snapshot backup before each organize run
- Manual backup, restore, and delete
- Auto organize with Chrome alarms
- Reviewable "Unprocessed" and delete logs

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

## Project Files

- [manifest.json](manifest.json)
- [background.js](background.js)
- [popup.html](popup.html)
- [popup.js](popup.js)
- [options.html](options.html)
- [options.js](options.js)
- [styles.css](styles.css)
- [privacy.html](privacy.html)
- [webstore](webstore)

## Local Development

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked"
4. Select this folder

## GitHub and Chrome Web Store

Recommended public links after pushing this repository:

- Homepage URL: `https://github.com/<your-name>/<your-repo>`
- Support URL: `https://github.com/<your-name>/<your-repo>/issues`
- Privacy Policy URL: `https://github.com/<your-name>/<your-repo>/blob/main/PRIVACY.md`

Additional store materials are prepared in [webstore](webstore).
