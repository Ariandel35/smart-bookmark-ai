# Contributing

## Development

1. Load the extension locally through `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked"
4. Select the repository root

## Before submitting changes

- Verify the extension still loads in Chrome
- Re-test organize, backup, restore, and API test flows
- Check syntax with:

```bash
node --check background.js
node --check options.js
node --check popup.js
```

## Scope guidance

- Keep Manifest V3 compatibility
- Preserve root-level bookmark rebuild behavior
- Preserve local snapshot backup safety
- Avoid increasing permissions without a clear review note
