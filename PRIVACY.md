# Privacy Policy

Last updated: 2026-04-19

Smart Bookmark AI only processes data needed to organize bookmarks.

## What the extension reads

- Chrome bookmark titles, URLs, and current folder paths
- Your extension settings, including provider, model, Base URL, whitelist, and custom prompt
- Local snapshot backups and task status

## How the data is used

- To check whether bookmarked links are clearly dead
- To send bookmark context to the model provider you choose for classification
- To create a local snapshot backup before reorganizing bookmarks
- To render progress, delete logs, and unprocessed items in the UI

## Where data is sent

- Bookmark title, URL, current path, and custom prompt are only sent to the model provider you configure
- Dead link checks send requests directly to bookmarked websites

## Local storage

- API keys and extension settings are stored in `chrome.storage.local`
- Local snapshot backups are stored in IndexedDB
- The extension developer does not operate a relay server for user data

## Your control

- You can change or remove API settings at any time
- You can turn off auto organize
- You can whitelist domains
- You can delete or restore backups
- You can revoke website access permission in Chrome at any time

## Contact

For public support, use the GitHub repository issue tracker:

`https://github.com/Ariandel35/smart-bookmark-ai/issues`
