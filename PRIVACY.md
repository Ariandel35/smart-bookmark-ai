# Privacy Policy

Last updated: 2026-05-29

Marko only processes data needed to organize bookmarks.

## What the extension reads

- Chrome bookmark titles, URLs, and current folder paths
- Your extension settings, including provider, model, Base URL, speed mode, whitelist, and custom prompt
- Local snapshot backups and task status

## How the data is used

- To check whether bookmarked links are clearly dead when Complete link checks are enabled
- To send bookmark context to the model provider you choose for classification
- To generate preview plans and stable taxonomy suggestions before a full rebuild
- To create a local snapshot backup before reorganizing bookmarks
- To render progress, delete logs, and unprocessed items in the UI

## Where data is sent

- Bookmark title, URL, current path, and custom prompt are only sent to the model provider you configure
- Fast mode skips dead-link checks during organize runs
- Complete link checks send HEAD / GET requests directly to bookmarked websites

## Local storage

- API keys and extension settings are stored in `chrome.storage.local`
- Local snapshot backups are stored in IndexedDB
- Classification cache and dead-link cache are stored locally to speed up future runs
- The extension developer does not operate a relay server for user data

## Your control

- You can change or remove API settings at any time
- You can choose Fast mode for fewer permissions and faster previews, or Complete mode for link checks before classification
- You can turn off auto organize
- You can whitelist domains
- You can delete or restore backups
- You can revoke API endpoint and website access permissions in Chrome at any time

## Contact

For public support, use the GitHub repository issue tracker:

`https://github.com/Ariandel35/marko/issues`
