# Changelog

## Unreleased

- Added Fast, Balanced, and Complete speed modes so users can choose local-only organizing, AI classification without website scans, or full dead-link checks with provider-aware planning
- Popup now includes a Fast/Balanced/Complete mode switch so speed and quality can be adjusted without opening settings
- Switching Fast/Balanced/Complete in the popup now actively clears stale saved previews before the popup refreshes
- Balanced mode now skips dead-link scans and separate taxonomy planning while keeping AI classification for bookmarks not covered by local rules or cache
- Fast mode now applies conservative built-in domain rules for common developer, learning, productivity, design, community, shopping, media, and life sites after custom rules and cache reuse
- Fast mode now finishes locally without waiting for the model; bookmarks that do not match rules or cache are moved to the manual review folder, while Complete mode keeps AI classification
- Fast mode no longer asks for model endpoint access during preview because it does not call the model
- Fast automatic organize can now run locally without an API key; Balanced requires model credentials, and Complete still requires model credentials plus website access
- Complete mode now applies deterministic built-in domain rules before AI classification too, so common sites do not need a model request after dead-link checks
- DeepSeek and DeepSeek-compatible Complete runs now skip the separate taxonomy-planning request and fall back to local rules, cache, built-in rules, and manual review if model classification times out
- DeepSeek and DeepSeek-compatible endpoints now use the slow-model profile automatically, cap runtime batches at 12, split actual model requests to 4 bookmarks, and run up to three mini requests at once
- DeepSeek and DeepSeek-compatible classification now stops after an 8-second first-response stall or an 18-second full-response stall before falling back locally
- Running legacy organize jobs are normalized before the next batch so stale large batches cannot continue after an update
- Privacy, README, and store disclosures now describe preview-time model calls, local Apply Plan rebuilds, and auto organize data flow consistently
- Remaining README, privacy page, and review checklist wording now uses the same preview-first data-flow language
- Privacy page breadcrumb and section eyebrow labels are now localized in English and Chinese
- The shared i18n document applier now sets page language reliably for full documents and partial roots without requiring a global document
- Whitelist domain chips and catalog options now expose localized add/remove action labels in tooltips and accessible names
- Backup restore, delete, confirm, and cancel controls now reuse their localized accessible names as hover tooltips
- Popup unprocessed-item keep/delete controls now show localized bookmark-specific action tooltips
- Popup primary, settings, backup, cancel, and apply-confirmation buttons now keep localized text, hover tooltips, and accessible names in sync
- Settings save, reset, privacy, API test, access, and manual backup buttons now keep localized text, hover tooltips, and accessible names in sync
- Popup Fast, Balanced, and Complete mode toggles now expose localized tooltips and accessible names that explain the speed/quality tradeoff
- Popup speed-mode controls now shrink and wrap cleanly in narrow popup containers instead of relying on a fixed minimum width
- Settings navigation tabs now expose localized hover tooltips and explicit accessible names
- Settings save and backup status badges now expose polite atomic status semantics
- Complete-mode site-access errors and duplicate cleanup suggestions now refer to preview-first setup instead of the removed direct organize flow
- DeepSeek-compatible runs now keep the same runtime provider label through preview apply and final completion statuses
- Popup preview checks now merge provider defaults before deciding setup is incomplete, so legacy or partial configs do not block local-rule previews unnecessarily
- Complete-mode preview no longer asks for broad website access when there are no non-whitelisted bookmarks to scan
- Empty or missing job config no longer falls back to an OpenAI provider label in terminal status updates
- Applying a saved preview plan now reuses the stored plan and rebuilds locally without a second model request
- Removed the legacy direct organize message path so manual runs must go through Preview -> Apply Plan
- If applying a saved preview hits a recoverable failure, the popup now keeps the Apply Plan path available so users can retry without generating the model plan again
- Backup failures before applying a saved preview now also keep the saved preview retry path available
- Apply Plan retry is now shown only for explicit preview-apply failures instead of any generic error that happens while a saved preview exists
- Applying a stale preview now shows specific guidance when settings or bookmarks changed
- Saved previews are now invalidated automatically when settings or bookmarks change
- Popup summary details now stay visible for non-error status messages such as invalidated previews
- New and reset DeepSeek configurations now start at batch size twelve so they use the split mini-request path immediately
- DeepSeek runtime batches are capped to twelve bookmarks, then split into four-bookmark model requests with shorter response timeouts before timeout retries shrink again
- Slow-provider model calls are now split again right before the request is sent, so stale large batches cannot submit one oversized request
- Slow-provider split requests now run with a small provider-specific concurrency cap, so DeepSeek can process up to three mini requests at a time instead of waiting on one long serial queue
- Slow-provider mini-request timeouts now keep completed mini results for faster providers and only split/retry the failed block, avoiding whole-batch restarts after one stalled request
- DeepSeek-compatible timeout handling now skips recursive mini-batch retries and switches to local fallback on the first stall, keeping the whole run responsive
- Cancellation requests are now checked before each split slow-provider model request and preserved before batch results are written back
- Providers without a local timeout fallback can still split retries down to one-bookmark mini-batches, while DeepSeek uses a tighter output budget and switches to local fallback instead of waiting through recursive retries
- Applying a preview generated after slow-model mini-batch retries now preserves the preview's runtime batch display instead of clamping it back to the saved setting
- Model requests now use a compact built-in strategy prompt plus compact bookmark titles, URLs, paths, JSON payloads, and output budgets to reduce slow-provider latency
- DeepSeek-compatible classification now uses compact request/output keys and a lower token budget, while the parser still accepts the previous verbose response schema
- Replaced blocking browser alert/confirm flows in popup and settings with inline confirmations and status messages
- Popup actions now disable related controls immediately to avoid duplicate apply, preview, or backup requests
- Popup preflight actions now stay locked through refreshes while checks, permission prompts, or cancellation requests are in progress
- Popup preflight, backup, cancel, and unprocessed-item actions now show inline in-progress feedback while controls are locked
- Popup primary, backup, and cancel buttons are now explicitly associated with the inline action status text
- Popup unprocessed-item keep/delete buttons are now explicitly associated with the inline action status text
- Popup unprocessed-item keep/delete buttons now include the bookmark title in their accessible labels
- Popup and background unprocessed-item actions are now blocked until an organize/apply run has completed, so preview and error states cannot mutate bookmarks
- Popup apply-confirmation primary action is now explicitly associated with the inline action status text
- Cancellation requests now persist in job status so the popup keeps the cancel button locked after the request is accepted
- Popup apply confirmation now moves focus to the inline confirmation and returns focus to the primary action when dismissed
- Popup setup and permission errors now include an inline settings shortcut instead of only relying on the header button
- Popup settings shortcuts now deep-link directly to the connection section when setup fixes are needed
- Popup progress now exposes standard progressbar state for assistive technologies
- Popup running progress now shows elapsed time and includes the live status text in the progressbar announcement
- Popup phase, progress, and detail regions now expose clearer assistive-technology semantics without repeating unchanged phase text
- Popup folder summary tables now expose linked titles and scoped column headers
- Popup legacy result-view DOM and unused result-navigation styles were removed so the shipped UI surface stays smaller and easier to maintain
- Settings save and reset buttons are now explicitly associated with the inline settings action status text
- Settings save and backup inline status messages now expose live status semantics for assistive technologies
- Settings navigation now uses linked tab and panel semantics with arrow-key navigation
- Settings field validation cleanup now preserves persistent status descriptions on Save, Reset, API test, and access controls
- Backup create, restore, delete, and inline confirmation buttons are now explicitly associated with the backup action status text
- Backup list action buttons now include the specific backup name in their accessible labels
- Backup restore/delete confirmations now move focus into the inline confirmation and return it to the matching action when dismissed
- Backup restore now creates a fresh pre-restore snapshot and preserves the selected backup record while applying backup retention limits
- Backup restore confirmation copy now explicitly says a fresh snapshot is created before replacing the bookmark bar
- Chinese settings headings and model field labels now use natural localized wording instead of mixed English section text
- Chinese setup, validation, and privacy copy now uses the same service-provider and model-name wording as the settings UI
- Manifest locale descriptions now lead with the preview-first workflow and are checked against Chrome description length limits
- Historical webstore release notes now use the Marko brand consistently instead of the old extension name
- Webstore privacy policy now matches the Fast/Balanced/Complete mode data-flow disclosures used in the README and review notes
- Privacy page fallback copy now matches the Fast, Balanced, and Complete speed-mode data-access behavior even before localization applies
- GitHub privacy policy now explicitly covers auto organize runs and the current Complete-mode data flow
- Webstore provider lists now include MiniMax so store copy matches the actual provider registry and README
- Background configuration errors now use the same Chinese model-name wording as the settings UI
- Static UI checks now verify unique HTML IDs and valid label, form, and ARIA element references
- Static release checks now verify manifest entry points, localized manifest messages, action icons, and permission boundaries
- Added a machine-readable extension package file list and tests to keep store upload packages limited to runtime files
- Added a dependency-free webstore package builder that creates the upload zip from the runtime file list
- Release tests now execute the webstore package builder and verify the generated ZIP entries match the runtime file list
- Default webstore package output is now explicitly ignored so generated upload ZIPs are not accidentally committed
- Test coverage now runs syntax checks across every JavaScript and MJS source file
- Webstore package builder now fails clearly when `--out` is provided without an output path
- Added standard `npm test` and `npm run package:webstore` entrypoints for release checks and upload package builds
- Settings validation errors now move focus to the affected field and mark it for assistive technologies
- Invalid settings fields now show a visible error border and soft error background
- Invalid settings action buttons now show the same visible error treatment as invalid fields
- Settings buttons, speed-mode hints, and whitelist status text are now explicitly associated with their related controls
- Batch size and automation interval fields now include persistent range hints that are preserved alongside validation errors
- Settings validation now clears stale field error highlights when fields are edited or revalidated
- Whitelist domain toggle buttons now expose selected state, and selected chips announce their remove action
- Fast mode can now finish locally with custom rules, the classification cache, built-in fast rules, and manual-review fallback, skipping model calls and batch scheduling
- Preview now checks local rule/cache coverage before asking for API keys or model endpoint access in Complete mode
- Preview startup now reuses the fresh local coverage check when possible instead of scanning bookmarks and cache twice
- Background bootstrap now throttles backup-record synchronization and legacy root cleanup so consecutive popup actions do not repeat maintenance scans
- Unprocessed-item keep/delete actions now lock together immediately to avoid duplicate handling requests
- Stale unprocessed records are now cleared cleanly when the underlying bookmark was already removed
- Settings save, API test, access grant, and reset controls now lock together while a settings operation is in flight
- Settings now shows explicit in-progress feedback while saving or waiting for access approval
- Settings now refreshes API access status immediately after changing providers and generated defaults
- Settings access checks now show a checking state and ignore stale async results after rapid endpoint changes
- Settings now disables the access grant button while access checks are still in flight
- Settings now debounces API access checks after Base URL or speed-mode edits so the displayed authorization state follows the current endpoint
- Settings load now keeps the saved configuration visible when backup-list or access-status refreshes fail, and reports those secondary failures inline
- Settings access-status refresh failures now restore controls and show an inline permission-state error instead of leaving access checks stuck
- Backup list refreshes now clear stale backup error text once the list loads successfully again
- Backup actions now preserve the completed action message and render an inline list-load error if the follow-up backup refresh fails
- Resetting provider defaults and fallback settings now refresh access status immediately instead of leaving stale endpoint state visible
- Saving auto-organize settings now marks the Save badge as failed when required access is denied
- Debounced settings access checks now invalidate any older in-flight check immediately when endpoint fields change
- Settings load failures now show a clear inline fallback message when defaults are displayed
- Settings save failures now show a clear inline error instead of leaving the page in a saving state
- Test & Save now distinguishes a successful API test from a later settings-save failure
- Test & Save now marks the Save badge as failed when validation, permission, API, or network checks fail
- Settings and popup setup checks now reject invalid Base URLs before permission checks or model requests
- Settings now distinguish load-failure and save-failure badges so failed saves are not mislabeled as load errors
- Changing providers now clears the existing API key with an inline notice to avoid reusing one provider's secret with another provider
- Settings can now save non-secret organization rules without an API key, while Test & Save and automatic silent organize still require one when the provider needs it
- Test & Save now also verifies automatic-organize access requirements before saving auto-enabled settings
- Popup setup checks now reject unknown provider IDs instead of treating any non-empty provider value as configured
- Unknown stored provider IDs now fall back to default provider, Base URL, model, and empty API key instead of mixing stale provider fields into the default provider
- Automatic organize alarms are now cleared instead of scheduled when the selected provider requires an API key and none is saved
- Invalid stored automatic-organize settings now load as disabled when the selected provider needs an API key that is not saved
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
