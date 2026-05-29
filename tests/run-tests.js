const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const JsonUtils = require("../json-utils.js");
const Providers = require("../providers.js");
const Rules = require("../rules.js");
const CacheUtils = require("../cache-utils.js");

const ROOT_DIR = path.resolve(__dirname, "..");

function readPngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  assert.equal(buffer.toString("ascii", 1, 4), "PNG", `${filePath} is not a PNG`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function testJsonUtils() {
  assert.deepEqual(JsonUtils.extractJsonArray('```json\n["A", "B"]\n```'), ["A", "B"]);
  assert.deepEqual(
    JsonUtils.extractJsonArray('before {"items":[1,2,3]} after'),
    [1, 2, 3]
  );
  assert.deepEqual(
    JsonUtils.extractJsonObject('noise ```json\n{"topFolders":["A","B"]}\n```'),
    { topFolders: ["A", "B"] }
  );
}

function testRules() {
  assert.deepEqual(
    Rules.parseProtectedRootFolders("Work\nPersonal\nWork"),
    ["Work", "Personal"]
  );

  const rules = Rules.parseDomainFolderRules(
    "github.com => AI & Tech / Code\n*.google.com => Tools & Productivity"
  );
  assert.equal(rules.length, 2);
  assert.deepEqual(rules[0].folderPath, ["AI & Tech", "Code"]);
  assert.equal(Rules.matchDomainRule("mail.google.com", rules).domain, "*.google.com");

  const fingerprint = Rules.buildBookmarkFingerprint({
    title: "OpenAI Docs",
    url: "https://platform.openai.com/docs#intro"
  });
  assert.ok(fingerprint.includes("platform.openai.com/docs"));
}

function testCacheUtils() {
  const now = Date.now();
  const entry = CacheUtils.createDeadLinkCacheEntry(
    "https://example.com/path#hash",
    {
      isDead: false,
      isHealthy: true,
      shouldRetryWithGet: false,
      reason: ""
    },
    now
  );

  assert.equal(entry.cacheKey, "https://example.com/path");
  assert.equal(CacheUtils.isDeadLinkCacheFresh(entry, now + 1000), true);
  assert.equal(
    CacheUtils.isDeadLinkCacheFresh(entry, now + CacheUtils.DEAD_LINK_TTL_MS.healthy + 1),
    false
  );
}

function testProviderOutputTokenBudgets() {
  const messages = [{ role: "user", content: "Return JSON only." }];
  const openAiRequest = Providers.buildRequest(
    {
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      apiKey: "test"
    },
    messages,
    { mode: "organize", outputTokenBudget: 1216 }
  );
  assert.equal(openAiRequest.body.max_tokens, 1216);

  const anthropicRequest = Providers.buildRequest(
    {
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      model: "claude-sonnet-4-5",
      apiKey: "test"
    },
    messages,
    { mode: "organize", outputTokenBudget: 384 }
  );
  assert.equal(anthropicRequest.body.max_tokens, 384);

  const geminiRequest = Providers.buildRequest(
    {
      provider: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-2.5-flash",
      apiKey: "test"
    },
    messages,
    { mode: "organize", outputTokenBudget: 512 }
  );
  assert.equal(geminiRequest.body.generationConfig.maxOutputTokens, 512);

  const testRequest = Providers.buildRequest(
    {
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      apiKey: "test"
    },
    messages,
    { mode: "test", outputTokenBudget: 2048 }
  );
  assert.equal(testRequest.body.max_tokens, 8);
}

function loadI18nForLanguage(language) {
  const sandbox = {
    globalThis: null,
    chrome: {
      i18n: {
        getUILanguage: () => language
      }
    },
    navigator: { language },
    Intl,
    Date,
    String,
    Set,
    Object,
    Array,
    console
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(ROOT_DIR, "i18n.js"), "utf8"),
    sandbox,
    { filename: "i18n.js" }
  );
  return sandbox.SmartBookmarkI18n;
}

function collectI18nKeysFromFiles() {
  const keys = new Set();
  const htmlFiles = ["popup.html", "options.html", "privacy.html"];
  const jsFiles = ["background.js", "popup.js", "options.js"];

  for (const file of htmlFiles) {
    const source = fs.readFileSync(path.join(ROOT_DIR, file), "utf8");
    for (const match of source.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) {
      keys.add(match[1]);
    }
  }

  for (const file of jsFiles) {
    const source = fs.readFileSync(path.join(ROOT_DIR, file), "utf8");
    for (const match of source.matchAll(/\bt\("([A-Za-z0-9_]+)"/g)) {
      keys.add(match[1]);
    }
  }

  return keys;
}

function testStaticExtensionAssets() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "3.0.0");

  for (const iconPath of Object.values(manifest.icons || {})) {
    assert.equal(fs.existsSync(path.join(ROOT_DIR, iconPath)), true, `Missing icon ${iconPath}`);
  }

  for (const localePath of ["_locales/en/messages.json", "_locales/zh_CN/messages.json"]) {
    JSON.parse(fs.readFileSync(path.join(ROOT_DIR, localePath), "utf8"));
  }

  const screenshotPaths = [
    "docs/screenshots/popup-store.png",
    "docs/screenshots/popup-apply-store.png",
    "docs/screenshots/options-connection-store.png",
    "docs/screenshots/options-organization-store.png",
    "docs/screenshots/options-backup-store.png"
  ];
  for (const screenshotPath of screenshotPaths) {
    const dimensions = readPngDimensions(path.join(ROOT_DIR, screenshotPath));
    assert.ok(dimensions.width >= 800, `${screenshotPath} is too narrow`);
    assert.ok(dimensions.height >= 600, `${screenshotPath} is too short`);
  }

  const exactAssetDimensions = {
    "webstore/assets/chrome-web-store-screenshot-1280x800.png": [1280, 800],
    "webstore/assets/chrome-web-store-small-promo-440x280.png": [440, 280],
    "webstore/assets/chrome-web-store-marquee-1400x560.png": [1400, 560]
  };
  for (const [assetPath, [width, height]] of Object.entries(exactAssetDimensions)) {
    const dimensions = readPngDimensions(path.join(ROOT_DIR, assetPath));
    assert.deepEqual(dimensions, { width, height }, `${assetPath} has the wrong size`);
  }

  for (const file of ["popup.html", "options.html", "privacy.html"]) {
    const source = fs.readFileSync(path.join(ROOT_DIR, file), "utf8");
    for (const match of source.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) {
      const ref = match[1];
      if (!/^https?:/.test(ref)) {
        assert.equal(fs.existsSync(path.join(ROOT_DIR, ref)), true, `${file} references missing ${ref}`);
      }
    }
  }
}

function testSpeedModeSurface() {
  const optionsHtml = fs.readFileSync(path.join(ROOT_DIR, "options.html"), "utf8");
  assert.match(optionsHtml, /id="linkCheckMode"/);
  assert.match(optionsHtml, /value="fast"/);
  assert.match(optionsHtml, /value="complete"/);

  const optionsSource = fs.readFileSync(path.join(ROOT_DIR, "options.js"), "utf8");
  assert.match(optionsSource, /linkCheckMode/);
  assert.match(optionsSource, /LINK_CHECK_MODE_FAST/);
  assert.match(optionsSource, /LINK_CHECK_MODE_COMPLETE/);

  const backgroundSource = fs.readFileSync(path.join(ROOT_DIR, "background.js"), "utf8");
  assert.match(backgroundSource, /shouldCheckDeadLinks/);
  assert.match(backgroundSource, /buildSkippedDeadLinkScanResult/);

  const popupSource = fs.readFileSync(path.join(ROOT_DIR, "popup.js"), "utf8");
  assert.match(popupSource, /ensureOrganizeAccess/);
  assert.match(popupSource, /ensureOriginAccess/);
  assert.match(popupSource, /LINK_CHECK_MODE_COMPLETE/);

  const localeDescription = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, "_locales/en/messages.json"), "utf8")
  ).extDescription.message;
  assert.match(localeDescription, /optional dead-link checks/);

  const storeListing = fs.readFileSync(path.join(ROOT_DIR, "webstore/STORE_LISTING.md"), "utf8");
  assert.match(storeListing, /Fast mode/);
  assert.match(storeListing, /Complete mode/);

  const privacyPolicy = fs.readFileSync(path.join(ROOT_DIR, "PRIVACY.md"), "utf8");
  assert.match(privacyPolicy, /Fast mode skips dead-link checks and the separate taxonomy-planning model request/);
  assert.match(privacyPolicy, /Complete link checks/);
}

function testPreviewApplySurface() {
  const backgroundSource = fs.readFileSync(path.join(ROOT_DIR, "background.js"), "utf8");
  assert.match(backgroundSource, /smartBookmarkPreviewPlan/);
  assert.match(backgroundSource, /APPLY_PREVIEW_PLAN/);
  assert.match(backgroundSource, /applyPreviewPlan/);
  assert.match(backgroundSource, /savePreviewPlan/);
  assert.match(backgroundSource, /buildBookmarkSetSignature/);
  assert.match(backgroundSource, /does not call the model again/);
  assert.match(backgroundSource, /oldSignature === nextSignature/);
  assert.match(backgroundSource, /invalidatePreviewPlan/);
  assert.match(backgroundSource, /onCreated\?\.addListener\(invalidatePreviewAfterBookmarkChange\)/);
  assert.match(backgroundSource, /onChildrenReordered\?\.addListener\(invalidatePreviewAfterBookmarkChange\)/);
  assert.match(backgroundSource, /rejectApplyPreviewPlan/);
  assert.match(backgroundSource, /Preview plans are tied to the provider/);
  assert.match(backgroundSource, /Marko detected that the bookmark set no longer matches the preview/);
  assert.match(backgroundSource, /getBookmarkById/);
  assert.match(backgroundSource, /Stale unprocessed record removed/);
  assert.match(backgroundSource, /existingBookmark\.id/);

  const popupSource = fs.readFileSync(path.join(ROOT_DIR, "popup.js"), "utf8");
  assert.match(popupSource, /APPLY_PREVIEW_PLAN/);
  assert.match(popupSource, /applyConfirmationVisible/);
  assert.match(popupSource, /popupActionInFlight/);
  assert.match(popupSource, /setPopupActionInFlight/);
  assert.match(popupSource, /setPopupActionStatus/);
  assert.match(popupSource, /getOptionsSectionUrl/);
  assert.match(popupSource, /options\.html#\$\{safeSection\}/);
  assert.match(popupSource, /chrome\.tabs\?\.create/);
  assert.match(popupSource, /openOptionsSection\("connection"\)/);
  assert.match(popupSource, /createSettingsShortcutButton/);
  assert.match(popupSource, /shouldShowSettingsShortcut/);
  assert.match(popupSource, /settingsShortcutButton/);
  assert.match(popupSource, /summaryActions\.appendChild\(createSettingsShortcutButton\(\)\)/);
  assert.match(popupSource, /popupCheckingCoverageStatus/);
  assert.match(popupSource, /popupRequestingAccessStatus/);
  assert.match(popupSource, /popupStartingPreviewStatus/);
  assert.match(popupSource, /popupApplyingPlanStatus/);
  assert.match(popupSource, /popupCreatingBackupStatus/);
  assert.match(popupSource, /popupResolvingItemStatus/);
  assert.match(popupSource, /popupCancellingStatus/);
  assert.match(popupSource, /startButton\.disabled = popupActionInFlight \|\| isRunning/);
  assert.match(popupSource, /backupButton\.disabled = popupActionInFlight \|\| isRunning/);
  assert.match(popupSource, /const isCancelling = Boolean\(currentStatus\?\.cancelRequested\)/);
  assert.match(popupSource, /cancelButton\.disabled = popupActionInFlight \|\| !isRunning \|\| isCancelling/);
  assert.match(popupSource, /cancelButton\.textContent = isCancelling \? t\("cancelRequestedButton"\) : t\("cancelButton"\)/);
  assert.match(popupSource, /createApplyConfirmationState/);
  assert.match(popupSource, /wrapper\.id = "applyConfirmation"/);
  assert.match(popupSource, /wrapper\.setAttribute\("aria-labelledby", "applyConfirmTitle"\)/);
  assert.match(popupSource, /wrapper\.setAttribute\("aria-describedby", "applyConfirmDesc"\)/);
  assert.match(popupSource, /applyButton\.setAttribute\("aria-describedby", popupActionStatus\.id\)/);
  assert.match(popupSource, /applyButton\.dataset\.applyConfirmationPrimary = "true"/);
  assert.match(popupSource, /function focusApplyConfirmationPrimary/);
  assert.match(popupSource, /focusApplyConfirmationPrimary\(\)/);
  assert.match(popupSource, /startButton\.focus\(\)/);
  assert.match(popupSource, /renderResponseError/);
  assert.match(popupSource, /detail: response\?\.detail \|\| ""/);
  assert.match(popupSource, /progressTrack\.setAttribute\("aria-valuenow", String\(progress\)\)/);
  assert.match(popupSource, /currentStatus\?\.detail \|\|/);
  assert.match(popupSource, /applyButton\.disabled = true/);
  assert.match(popupSource, /cancelButton\.disabled = true/);
  assert.match(popupSource, /hasPreviewAttemptConfig/);
  assert.match(popupSource, /hasModelAccessConfig/);
  assert.match(popupSource, /CHECK_LOCAL_MODEL_REQUIREMENT/);
  assert.match(popupSource, /localRequirementCheckId: requirement\.checkId \|\| ""/);
  assert.match(popupSource, /requirement\.needsModel \|\| requirement\.requiresBroadHostAccess/);
  assert.match(popupSource, /modelAccessRequiredForUncachedPreview/);
  assert.match(popupSource, /async function createManualBackup\(\) \{\n  setPopupActionInFlight\(true, t\("popupCreatingBackupStatus"\)\);/);
  assert.match(popupSource, /async function cancelJob\(\) \{\n  setPopupActionInFlight\(true, t\("popupCancellingStatus"\)\);/);
  assert.match(popupSource, /keepButton\.setAttribute\("aria-describedby", popupActionStatus\.id\)/);
  assert.match(popupSource, /deleteButton\.setAttribute\("aria-describedby", popupActionStatus\.id\)/);
  assert.match(popupSource, /const lockEntryActions = \(\) => \{\n        keepButton\.disabled = true;\n        deleteButton\.disabled = true;/);
  assert.match(popupSource, /keepButton\.addEventListener\("click", \(\) => \{\n        lockEntryActions\(\);/);
  assert.match(popupSource, /deleteButton\.addEventListener\("click", \(\) => \{\n        lockEntryActions\(\);/);
  assert.doesNotMatch(popupSource, /START_ORGANIZE/);
  assert.doesNotMatch(popupSource, /window\.confirm/);

  const popupHtml = fs.readFileSync(path.join(ROOT_DIR, "popup.html"), "utf8");
  assert.match(popupHtml, /id="startButton"[\s\S]*aria-describedby="popupActionStatus"/);
  assert.match(popupHtml, /id="backupButton"[\s\S]*aria-describedby="popupActionStatus"/);
  assert.match(popupHtml, /id="cancelButton"[\s\S]*aria-describedby="popupActionStatus"/);
  assert.match(popupHtml, /id="phaseBadge"[\s\S]*role="status"[\s\S]*aria-live="polite"[\s\S]*aria-atomic="true"/);
  assert.match(popupHtml, /id="popupActionStatus"/);
  assert.match(popupHtml, /role="status"/);
  assert.match(popupHtml, /id="progressTrack"/);
  assert.match(popupHtml, /role="progressbar"/);
  assert.match(popupHtml, /aria-describedby="progressSummary progressMeta"/);
  assert.match(popupHtml, /data-i18n-aria-label="progressAriaLabel"/);
  assert.match(popupHtml, /id="detailPanel"[\s\S]*role="region"[\s\S]*data-i18n-aria-label="detailPanelAriaLabel"/);
  assert.match(popupSource, /if \(phaseBadge\.textContent !== phaseLabel\)/);
  assert.match(popupSource, /progressTrack\.setAttribute\("aria-valuetext", `\$\{progress\}%, \$\{progressSummaryText\}`\)/);
  assert.match(popupSource, /title\.id = "folderSummaryTitle"/);
  assert.match(popupSource, /table\.setAttribute\("aria-labelledby", title\.id\)/);
  assert.match(popupSource, /folderHeader\.scope = "col"/);
  assert.match(popupSource, /countHeader\.scope = "col"/);

  const stylesSource = fs.readFileSync(path.join(ROOT_DIR, "styles.css"), "utf8");
  assert.match(stylesSource, /\.confirm-strip/);
  assert.match(stylesSource, /\.popup-action-status/);

  const i18nSource = fs.readFileSync(path.join(ROOT_DIR, "i18n.js"), "utf8");
  assert.match(i18nSource, /cancelRequestedButton/);
  assert.match(i18nSource, /settingsShortcutButton/);
  assert.match(i18nSource, /detailPanelAriaLabel/);

  const backgroundSourceForCancel = fs.readFileSync(path.join(ROOT_DIR, "background.js"), "utf8");
  assert.match(backgroundSourceForCancel, /cancelRequested: true/);
  assert.match(backgroundSourceForCancel, /cancelRequested: Boolean\(job\.cancelRequested\)/);
}

function testSlowModelResilienceSurface() {
  const backgroundSource = fs.readFileSync(path.join(ROOT_DIR, "background.js"), "utf8");
  assert.match(backgroundSource, /RUNTIME_BATCH_SIZE_CAPS/);
  assert.match(backgroundSource, /deepseek: 8/);
  assert.match(backgroundSource, /getRuntimeBatchSize/);
  assert.match(backgroundSource, /COMPACT_DEFAULT_PROMPT/);
  assert.match(backgroundSource, /buildModelStrategyPrompt/);
  assert.match(backgroundSource, /I18N\.isBuiltInPromptValue/);
  assert.match(backgroundSource, /MODEL_INPUT_URL_MAX_LENGTH/);
  assert.match(backgroundSource, /CLASSIFICATION_OUTPUT_TOKENS_PER_BOOKMARK/);
  assert.match(backgroundSource, /getClassificationOutputTokenBudget/);
  assert.match(backgroundSource, /buildModelBookmarkInputPayload/);
  assert.match(backgroundSource, /compactModelUrl/);
  assert.match(backgroundSource, /outputTokenBudget/);
  assert.match(backgroundSource, /JSON\.stringify\(inputPayload\)/);
  assert.match(backgroundSource, /TAXONOMY_SAMPLE_SIZE_CAPS/);
  assert.match(backgroundSource, /getTaxonomyPlanningTimeoutMs/);
  assert.match(backgroundSource, /shouldPlanGlobalTaxonomy/);
  assert.match(backgroundSource, /Fast mode skipped the separate taxonomy-planning request/);
  assert.match(backgroundSource, /buildFastLocalClassificationPlan/);
  assert.match(backgroundSource, /finishFastLocalJob/);
  assert.match(backgroundSource, /CHECK_LOCAL_MODEL_REQUIREMENT/);
  assert.match(backgroundSource, /checkLocalModelRequirement/);
  assert.match(backgroundSource, /LOCAL_REQUIREMENT_CHECK_TTL_MS/);
  assert.match(backgroundSource, /lastLocalRequirementCheck/);
  assert.match(backgroundSource, /takeReusableLocalRequirementCheck/);
  assert.match(backgroundSource, /localRequirementCheckId: message\.localRequirementCheckId \|\| ""/);
  assert.match(backgroundSource, /reusableLocalCheck\?\.bookmarkState \|\| await collectBookmarkPlanningState/);
  assert.match(backgroundSource, /validateConfig\(config, \{ requireModelAccess: false \}\)/);
  assert.match(backgroundSource, /validateConfig\(config, \{ requireModelAccess: true \}\)/);
  assert.match(backgroundSource, /!shouldCheckDeadLinks\(runtimeConfig\) && !startupAiCandidateCount/);
  assert.match(backgroundSource, /first-response-timeout\|request-timeout/);
}

function testOptionsBackupInlineConfirmationSurface() {
  const optionsHtml = fs.readFileSync(path.join(ROOT_DIR, "options.html"), "utf8");
  assert.match(optionsHtml, /role="tablist"/);
  assert.match(optionsHtml, /aria-orientation="vertical"/);
  assert.match(optionsHtml, /id="settings-tab-connection"[\s\S]*role="tab"[\s\S]*aria-controls="settings-panel-connection"/);
  assert.match(optionsHtml, /id="settings-tab-organize"[\s\S]*role="tab"[\s\S]*aria-controls="settings-panel-organize"/);
  assert.match(optionsHtml, /id="settings-panel-connection"[\s\S]*role="tabpanel"[\s\S]*aria-labelledby="settings-tab-connection"/);
  assert.match(optionsHtml, /id="settings-panel-backup"[\s\S]*role="tabpanel"[\s\S]*aria-labelledby="settings-tab-backup"/);
  assert.match(optionsHtml, /id="settingsActionStatus"/);
  assert.match(optionsHtml, /id="backupActionStatus"/);
  assert.match(optionsHtml, /id="settingsActionStatus"[\s\S]*role="status"[\s\S]*aria-live="polite"/);
  assert.match(optionsHtml, /id="backupActionStatus"[\s\S]*role="status"[\s\S]*aria-live="polite"/);
  assert.match(optionsHtml, /id="saveButton"[\s\S]*aria-describedby="settingsActionStatus"/);
  assert.match(optionsHtml, /id="resetButton"[\s\S]*aria-describedby="settingsActionStatus"/);
  assert.match(optionsHtml, /id="createBackupButton"[\s\S]*aria-describedby="backupActionStatus"/);
  assert.match(optionsHtml, /id="testApiButton"[\s\S]*aria-describedby="apiTestStatus"/);
  assert.match(optionsHtml, /id="grantAccessButton"[\s\S]*aria-describedby="hostAccessStatus"/);
  assert.match(optionsHtml, /id="linkCheckMode"[\s\S]*aria-describedby="linkCheckModeHint"/);
  assert.match(optionsHtml, /id="linkCheckModeHint"[\s\S]*data-i18n="hintLinkCheckMode"/);
  assert.match(optionsHtml, /id="batchSize"[\s\S]*aria-describedby="batchSizeHint"/);
  assert.match(optionsHtml, /id="batchSizeHint"[\s\S]*data-i18n="hintBatchSize"/);
  assert.match(optionsHtml, /id="autoOrganizeIntervalHours"[\s\S]*aria-describedby="autoOrganizeIntervalHint"/);
  assert.match(optionsHtml, /id="autoOrganizeIntervalHint"[\s\S]*data-i18n="hintAutoOrganizeInterval"/);
  assert.match(optionsHtml, /id="whitelistSelectionStatus"[\s\S]*role="status"[\s\S]*aria-live="polite"/);
  assert.match(optionsHtml, /id="whitelistSearch"[\s\S]*aria-describedby="whitelistSelectionStatus"/);
  assert.match(optionsHtml, /id="saveButton"/);

  const optionsSource = fs.readFileSync(path.join(ROOT_DIR, "options.js"), "utf8");
  assert.match(optionsSource, /showSettingsIssue/);
  assert.match(optionsSource, /clearSettingsFieldIssues/);
  assert.match(optionsSource, /getDescribedByTokens/);
  assert.match(optionsSource, /addDescribedByToken/);
  assert.match(optionsSource, /removeDescribedByTokens/);
  assert.match(optionsSource, /focusSettingsField/);
  assert.match(optionsSource, /markSettingsFieldIssue/);
  assert.match(optionsSource, /showApiTestIssue/);
  assert.match(optionsSource, /field\.setAttribute\("aria-invalid", "true"\)/);
  assert.match(optionsSource, /addDescribedByToken\(field, describedByElement\.id\)/);
  assert.match(optionsSource, /removeDescribedByTokens\(field, \[settingsActionStatus\.id, apiTestStatus\.id\]\)/);
  assert.match(optionsSource, /window\.requestAnimationFrame\(\(\) => \{\n    field\.focus\(\);/);
  assert.match(optionsSource, /button\.tabIndex = isActive \? 0 : -1/);
  assert.match(optionsSource, /handleNavigationKeydown/);
  assert.match(optionsSource, /ArrowDown/);
  assert.match(optionsSource, /Home/);
  assert.match(optionsSource, /setSettingsActionStatus/);
  assert.match(optionsSource, /settingsActionInFlight/);
  assert.match(optionsSource, /setSettingsActionInFlight/);
  assert.match(optionsSource, /settingsSavingStatus/);
  assert.match(optionsSource, /settingsLoadException/);
  assert.match(optionsSource, /settingsSaveException/);
  assert.match(optionsSource, /console\.error\("Failed to save settings:"/);
  assert.match(optionsSource, /console\.error\("Failed to save settings after API test:"/);
  assert.match(optionsSource, /apiTestSaveFailed/);
  assert.match(optionsSource, /setSaveBadge\(t\("saveBadgeFailed"\), "danger"\)/);
  assert.match(optionsSource, /settingsAccessRequestingStatus/);
  assert.match(optionsSource, /settingsFields\.forEach/);
  assert.match(optionsSource, /saveButton\.disabled = settingsActionInFlight/);
  assert.match(optionsSource, /testApiButton\.disabled = settingsActionInFlight/);
  assert.match(optionsSource, /resetButton\.disabled = settingsActionInFlight/);
  assert.match(optionsSource, /hostAccessCheckingInFlight/);
  assert.match(optionsSource, /hostAccessRefreshTimer/);
  assert.match(optionsSource, /clearScheduledHostAccessStatusRefresh/);
  assert.match(optionsSource, /scheduleHostAccessStatusRefresh/);
  assert.match(optionsSource, /hostAccessRefreshVersion \+= 1/);
  assert.match(optionsSource, /scheduleHostAccessStatusRefresh[\s\S]*setHostAccessStatus\(t\("hostAccessChecking"\), true\)/);
  assert.match(optionsSource, /grantAccessButton\.disabled = settingsActionInFlight \|\| granted \|\| hostAccessCheckingInFlight/);
  assert.match(optionsSource, /if \(settingsActionInFlight\) \{\n    return;\n  \}/);
  assert.match(optionsSource, /parseIntegerInput/);
  assert.match(optionsSource, /batchSize: parseIntegerInput\(batchSizeInput\.value\)/);
  assert.match(optionsSource, /autoOrganizeIntervalHours: parseIntegerInput\(autoOrganizeIntervalInput\.value\)/);
  assert.match(optionsSource, /if \(!config\.baseUrl\) \{[\s\S]*setHostAccessStatus/);
  assert.match(optionsSource, /hostAccessRefreshVersion/);
  assert.match(optionsSource, /const refreshVersion = \+\+hostAccessRefreshVersion/);
  assert.match(optionsSource, /hostAccessCheckingInFlight = true/);
  assert.match(optionsSource, /hostAccessCheckingInFlight = false/);
  assert.match(optionsSource, /hostAccessChecking/);
  assert.match(optionsSource, /refreshVersion !== hostAccessRefreshVersion/);
  assert.match(optionsSource, /showSettingsIssue\(t\("baseUrlRequired"\), "connection", "baseUrl"\)/);
  assert.match(optionsSource, /showSettingsIssue\(t\("modelRequired"\), "connection", "model"\)/);
  assert.match(optionsSource, /showSettingsIssue\(t\("batchSizeValidation"\), "organize", "batchSize"\)/);
  assert.match(optionsSource, /showSettingsIssue\(t\("autoIntervalValidation"\), "automation", "autoOrganizeIntervalHours"\)/);
  assert.match(optionsSource, /showSettingsIssue\(t\("requiredApiKey", \{ provider: defaults\.label \}\), "connection", "apiKey"\)/);
  assert.match(optionsSource, /showApiTestIssue\(t\("baseUrlRequired"\), "baseUrl"\)/);
  assert.match(optionsSource, /showApiTestIssue\(t\("modelRequired"\), "model"\)/);
  assert.match(optionsSource, /showApiTestIssue\(t\("requiredApiKey", \{ provider: defaults\.label \}\), "apiKey"\)/);
  assert.match(optionsSource, /targetId === "baseUrl" \|\| targetId === "linkCheckMode"/);
  assert.match(optionsSource, /Base URL change/);
  assert.match(optionsSource, /speed mode change/);
  assert.match(optionsSource, /Failed to refresh host access status after reset/);
  assert.match(optionsSource, /Failed to refresh host access status after config load failure/);
  assert.match(optionsSource, /Failed to refresh host access status after provider change/);
  assert.match(optionsSource, /providerSelect\.addEventListener\("change"[\s\S]*markPending\(\);[\s\S]*refreshHostAccessStatus/);
  assert.match(optionsSource, /pendingBackupAction/);
  assert.match(optionsSource, /backupActionInFlight/);
  assert.match(optionsSource, /restoreButton\.setAttribute\("aria-describedby", backupActionStatus\.id\)/);
  assert.match(optionsSource, /deleteButton\.setAttribute\("aria-describedby", backupActionStatus\.id\)/);
  assert.match(optionsSource, /confirmButton\.setAttribute\("aria-describedby", backupActionStatus\.id\)/);
  assert.match(optionsSource, /restoreButton\.dataset\.backupActionButton = "restore"/);
  assert.match(optionsSource, /deleteButton\.dataset\.backupActionButton = "delete"/);
  assert.match(optionsSource, /focusBackupConfirmationPrimary/);
  assert.match(optionsSource, /findBackupActionButton\(record\.id, action\)\?\.focus\(\)/);
  assert.match(optionsSource, /getBackupConfirmMessageId/);
  assert.match(optionsSource, /createBackupInlineConfirm/);
  assert.match(optionsSource, /wrapper\.setAttribute\("role", "group"\)/);
  assert.match(optionsSource, /wrapper\.setAttribute\("aria-labelledby", messageId\)/);
  assert.match(optionsSource, /confirmButton\.dataset\.backupConfirmPrimary = "true"/);
  assert.match(optionsSource, /confirmButton\.disabled = backupActionInFlight/);
  assert.match(optionsSource, /restoreButton\.disabled = backupActionInFlight/);
  assert.match(optionsSource, /deleteButton\.disabled = backupActionInFlight/);
  assert.doesNotMatch(optionsSource, /window\.alert/);
  assert.doesNotMatch(optionsSource, /window\.confirm/);

  const stylesSource = fs.readFileSync(path.join(ROOT_DIR, "styles.css"), "utf8");
  assert.match(stylesSource, /\.settings-action-status/);
  assert.match(stylesSource, /\.backup-confirm/);
  assert.match(stylesSource, /\.field input\[aria-invalid="true"\]/);
  assert.match(stylesSource, /\.field select\[aria-invalid="true"\]/);
  assert.match(stylesSource, /\.field textarea\[aria-invalid="true"\]/);
  assert.match(stylesSource, /\.button\[aria-invalid="true"\]/);
  assert.match(stylesSource, /border-color: var\(--danger\)/);

  const i18nSource = fs.readFileSync(path.join(ROOT_DIR, "i18n.js"), "utf8");
  assert.match(i18nSource, /hintBatchSize/);
  assert.match(i18nSource, /hintAutoOrganizeInterval/);
  assert.match(i18nSource, /settingsSavedStatus/);
  assert.match(i18nSource, /settingsSavingStatus/);
  assert.match(i18nSource, /settingsLoadException/);
  assert.match(i18nSource, /settingsSaveException/);
  assert.match(i18nSource, /apiTestSaveFailed/);
  assert.match(i18nSource, /settingsAccessRequestingStatus/);
  assert.match(i18nSource, /hostAccessChecking/);
  assert.match(i18nSource, /backupRestoreInlineConfirm/);
  assert.match(i18nSource, /backupDeleteInlineConfirm/);
  assert.doesNotMatch(i18nSource, /backupRestoreConfirm/);
  assert.doesNotMatch(i18nSource, /backupDeleteConfirm/);
}

function testResponsiveTextHardeningSurface() {
  const stylesSource = fs.readFileSync(path.join(ROOT_DIR, "styles.css"), "utf8");
  assert.match(stylesSource, /\.button[\s\S]*overflow-wrap: anywhere/);
  assert.match(stylesSource, /\.progress-head__summary,[\s\S]*\.progress-head__meta[\s\S]*overflow-wrap: anywhere/);
  assert.match(stylesSource, /\.bookmark-item__title[\s\S]*overflow-wrap: anywhere/);
  assert.match(stylesSource, /\.bookmark-item__meta[\s\S]*overflow-wrap: anywhere/);
  assert.match(stylesSource, /\.record-item__row > :first-child[\s\S]*min-width: 0/);
  assert.match(stylesSource, /\.record-item__title[\s\S]*overflow-wrap: anywhere/);
  assert.match(stylesSource, /\.result-table[\s\S]*table-layout: fixed/);
  assert.match(stylesSource, /\.result-table th,[\s\S]*\.result-table td[\s\S]*overflow-wrap: anywhere/);
  assert.match(stylesSource, /\.confirm-strip__desc[\s\S]*overflow-wrap: anywhere/);
}

function testReleaseMaterialsCurrent() {
  const changelog = fs.readFileSync(path.join(ROOT_DIR, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /without a second model request/);
  assert.match(changelog, /runtime batch size/);
  assert.match(changelog, /inline confirmations and status messages/);
  assert.match(changelog, /raw numeric input/);

  const releaseNotes = fs.readFileSync(
    path.join(ROOT_DIR, "webstore/RELEASE_NOTES_3.0.0.md"),
    "utf8"
  );
  assert.match(releaseNotes, /without another model request/);
  assert.match(releaseNotes, /smaller runtime batch size/);
  assert.match(releaseNotes, /shorter built-in/);
  assert.match(releaseNotes, /inline confirmations and status messages/);
  assert.match(releaseNotes, /silently clamping invalid values/);

  const storeListing = fs.readFileSync(path.join(ROOT_DIR, "webstore/STORE_LISTING.md"), "utf8");
  assert.match(storeListing, /without calling the model again/);
  assert.match(storeListing, /smaller runtime batch size/);
  assert.match(storeListing, /shorter built-in/);
  assert.match(storeListing, /inline confirmations and validation feedback/);
  assert.match(storeListing, /Popup inline apply confirmation/);
  assert.match(storeListing, /Backup management with inline restore confirmation/);

  const reviewNotes = fs.readFileSync(path.join(ROOT_DIR, "webstore/REVIEW_NOTES.md"), "utf8");
  assert.match(reviewNotes, /复用已保存方案/);

  const publishChecklist = fs.readFileSync(
    path.join(ROOT_DIR, "webstore/PUBLISH_CHECKLIST.md"),
    "utf8"
  );
  assert.match(publishChecklist, /不会再次请求模型/);
  assert.match(publishChecklist, /页面内确认/);
}

function testI18nCoverage() {
  const keys = collectI18nKeysFromFiles();
  for (const language of ["en", "zh-CN"]) {
    const i18n = loadI18nForLanguage(language);
    const missing = Array.from(keys).filter((key) => i18n.t(key) === key);
    assert.deepEqual(missing, [], `${language} missing i18n keys`);
  }
}

function main() {
  testJsonUtils();
  testProviderOutputTokenBudgets();
  testRules();
  testCacheUtils();
  testStaticExtensionAssets();
  testSpeedModeSurface();
  testPreviewApplySurface();
  testSlowModelResilienceSurface();
  testOptionsBackupInlineConfirmationSurface();
  testResponsiveTextHardeningSurface();
  testReleaseMaterialsCurrent();
  testI18nCoverage();
  console.log("All tests passed.");
}

main();
