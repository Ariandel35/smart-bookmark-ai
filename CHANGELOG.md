# Changelog

## Unreleased

- Added Fast and Complete speed modes so users can choose quicker organizing that skips extra checks and taxonomy planning, or full dead-link checks with global planning
- Reduced popup and settings permission requests in Fast mode to the configured model API origin
- Applying a saved preview plan now reuses the stored plan and rebuilds locally without a second model request
- Applying a stale preview now shows specific guidance when settings or bookmarks changed
- Saved previews are now invalidated automatically when settings or bookmarks change
- Popup summary details now stay visible for non-error status messages such as invalidated previews
- DeepSeek runs are capped to a safer runtime batch size before the first model request, then timeout retries can shrink again
- Replaced blocking browser alert/confirm flows in popup and settings with inline confirmations and status messages
- Popup actions now disable related controls immediately to avoid duplicate apply, preview, or backup requests
- Fast mode now finishes locally when rules and the classification cache cover every bookmark, skipping model calls and batch scheduling
- Backup create, restore, and delete actions now lock related controls while an operation is in flight
- Settings now validate raw numeric input instead of silently clamping invalid batch sizes or automation intervals
- Updated privacy, Chrome Web Store, README, locale, and visual materials to describe optional dead-link checks accurately

## 3.0.0 - 2026-05-08

- Simplified the popup into a preview-first flow with a clearer `Preview` -> `Apply Plan` primary action
- Added direct setup routing from the popup when provider, model, Base URL, or API key configuration is incomplete
- Added automatic slow-model recovery that reduces the current batch size and retries after model timeouts
- Lowered the default DeepSeek batch size for new/reset configurations
- Moved advanced organization fields behind a single Advanced section to keep everyday rules easier to scan
- Made successful API tests save the current settings, reducing the setup path to `Test & Save`
- Refined bilingual labels, status copy, spacing, color tokens, and responsive form behavior
- Removed unused popup detail-rendering code from the previous multi-tab result view

## 1.3.0 - 2026-04-22

- Added bilingual interface support for English and Simplified Chinese
- Refined the popup and settings center into a simpler preview-first workflow
- Added global taxonomy planning before chunked AI classification for Complete mode
- Added protected root folders, whitelist website selection, and domain folder rules
- Added classification cache reuse and dead-link cache for faster reruns
- Expanded provider support and shared provider definitions
- Added refreshed GitHub and Chrome Web Store release materials
- Added modular helper files and local test coverage for parsing, rules, and cache logic

## 1.2.0 - 2026-04-19

- Switched broad site access to runtime optional host permissions
- Added explicit website access grant flow in settings and popup
- Added privacy page and GitHub/Web Store publishing materials
- Added permission-aware auto organize behavior
- Improved release readiness for Chrome Web Store submission

## 1.1.0 - 2026-04-19

- Added icons and release-ready extension metadata
- Moved backups to local snapshot storage
- Unified unresolved folder handling
- Reworked organize flow to snapshot first, then rebuild at root

## 1.0.0 - 2026-04-18

- Initial Marko extension implementation
