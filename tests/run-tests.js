const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const JsonUtils = require("../json-utils.js");
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

  const popupSource = fs.readFileSync(path.join(ROOT_DIR, "popup.js"), "utf8");
  assert.match(popupSource, /APPLY_PREVIEW_PLAN/);
  assert.match(popupSource, /applyConfirmationVisible/);
  assert.match(popupSource, /createApplyConfirmationState/);
  assert.match(popupSource, /renderResponseError/);
  assert.match(popupSource, /detail: response\?\.detail \|\| ""/);
  assert.match(popupSource, /currentStatus\?\.detail \|\|/);
  assert.doesNotMatch(popupSource, /START_ORGANIZE/);
  assert.doesNotMatch(popupSource, /window\.confirm/);

  const stylesSource = fs.readFileSync(path.join(ROOT_DIR, "styles.css"), "utf8");
  assert.match(stylesSource, /\.confirm-strip/);
}

function testSlowModelResilienceSurface() {
  const backgroundSource = fs.readFileSync(path.join(ROOT_DIR, "background.js"), "utf8");
  assert.match(backgroundSource, /RUNTIME_BATCH_SIZE_CAPS/);
  assert.match(backgroundSource, /deepseek: 20/);
  assert.match(backgroundSource, /getRuntimeBatchSize/);
  assert.match(backgroundSource, /TAXONOMY_SAMPLE_SIZE_CAPS/);
  assert.match(backgroundSource, /getTaxonomyPlanningTimeoutMs/);
  assert.match(backgroundSource, /shouldPlanGlobalTaxonomy/);
  assert.match(backgroundSource, /Fast mode skipped the separate taxonomy-planning request/);
  assert.match(backgroundSource, /first-response-timeout\|request-timeout/);
}

function testOptionsBackupInlineConfirmationSurface() {
  const optionsHtml = fs.readFileSync(path.join(ROOT_DIR, "options.html"), "utf8");
  assert.match(optionsHtml, /id="settingsActionStatus"/);
  assert.match(optionsHtml, /id="backupActionStatus"/);

  const optionsSource = fs.readFileSync(path.join(ROOT_DIR, "options.js"), "utf8");
  assert.match(optionsSource, /showSettingsIssue/);
  assert.match(optionsSource, /setSettingsActionStatus/);
  assert.match(optionsSource, /parseIntegerInput/);
  assert.match(optionsSource, /batchSize: parseIntegerInput\(batchSizeInput\.value\)/);
  assert.match(optionsSource, /autoOrganizeIntervalHours: parseIntegerInput\(autoOrganizeIntervalInput\.value\)/);
  assert.match(optionsSource, /if \(!config\.baseUrl\) \{\n    setHostAccessStatus/);
  assert.match(optionsSource, /pendingBackupAction/);
  assert.match(optionsSource, /backupActionInFlight/);
  assert.match(optionsSource, /createBackupInlineConfirm/);
  assert.match(optionsSource, /confirmButton\.disabled = backupActionInFlight/);
  assert.match(optionsSource, /restoreButton\.disabled = backupActionInFlight/);
  assert.match(optionsSource, /deleteButton\.disabled = backupActionInFlight/);
  assert.doesNotMatch(optionsSource, /window\.alert/);
  assert.doesNotMatch(optionsSource, /window\.confirm/);

  const stylesSource = fs.readFileSync(path.join(ROOT_DIR, "styles.css"), "utf8");
  assert.match(stylesSource, /\.settings-action-status/);
  assert.match(stylesSource, /\.backup-confirm/);

  const i18nSource = fs.readFileSync(path.join(ROOT_DIR, "i18n.js"), "utf8");
  assert.match(i18nSource, /settingsSavedStatus/);
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
  assert.match(releaseNotes, /safer runtime batch size/);
  assert.match(releaseNotes, /inline confirmations and status messages/);
  assert.match(releaseNotes, /silently clamping invalid values/);

  const storeListing = fs.readFileSync(path.join(ROOT_DIR, "webstore/STORE_LISTING.md"), "utf8");
  assert.match(storeListing, /without calling the model again/);
  assert.match(storeListing, /safer runtime batch size/);
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
