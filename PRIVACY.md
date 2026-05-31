# Privacy Policy

Last updated: 2026-05-31

Marko only processes data needed to organize bookmarks.

## What the extension reads

- Chrome bookmark titles, URLs, and current folder paths
- Your extension settings, including provider, model, Base URL, speed mode, whitelist, and custom prompt
- Local snapshot backups and task status

## How the data is used

- To check whether bookmarked links are clearly dead when Complete link checks are enabled
- To send bookmark context to the model provider you choose only when Complete preview or enabled auto organize needs model classification
- To generate preview plans and, when the selected model is fast enough in Complete mode, stable taxonomy suggestions before a full rebuild
- To create local snapshot backups before applying a preview plan, before automatic organize rebuilds, and before restoring an older backup
- To render progress, delete logs, and unprocessed items in the UI

## Where data is sent

- Bookmark title, URL, current path, and custom prompt are only sent to the model provider you configure when Complete preview or enabled auto organize still needs model classification after local rules and cache reuse
- Applying a saved preview plan rebuilds locally and does not call the model again
- Fast mode skips dead-link checks, the separate taxonomy-planning model request, and model classification during preview and organize runs
- Complete mode can send HEAD / GET requests directly to bookmarked websites and uses model classification when uncached bookmarks need it. Faster providers may add the separate taxonomy-planning model request; slow providers skip that extra request.

## Local storage

- API keys and extension settings are stored in `chrome.storage.local`
- Local snapshot backups, including pre-restore snapshots, are stored in IndexedDB
- Classification cache and dead-link cache are stored locally to speed up future runs
- The extension developer does not operate a relay server for user data

## Your control

- You can change or remove API settings at any time
- You can choose Fast mode for fewer requests, fewer permissions, and faster previews, or Complete mode for link checks and AI classification with provider-aware planning
- You can turn off auto organize
- You can whitelist domains
- You can delete backups or restore older versions; restoring first creates a fresh local snapshot of the current bookmark state when there is anything to preserve
- You can revoke API endpoint and website access permissions in Chrome at any time

## Contact

For public support, use the GitHub repository issue tracker:

`https://github.com/Ariandel35/marko/issues`
