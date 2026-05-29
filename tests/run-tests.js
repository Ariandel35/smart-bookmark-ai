const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const JsonUtils = require("../json-utils.js");
const Providers = require("../providers.js");
const Rules = require("../rules.js");
const CacheUtils = require("../cache-utils.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const JAVASCRIPT_SYNTAX_FILES = [
  "background.js",
  "cache-utils.js",
  "i18n.js",
  "json-utils.js",
  "options.js",
  "popup.js",
  "providers.js",
  "rules.js",
  "tests/run-tests.js",
  "webstore/build_extension_package.mjs",
  "webstore/render_store_assets.mjs"
];

function readPngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  assert.equal(buffer.toString("ascii", 1, 4), "PNG", `${filePath} is not a PNG`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function testJavaScriptSyntax() {
  for (const file of JAVASCRIPT_SYNTAX_FILES) {
    assert.equal(fs.existsSync(path.join(ROOT_DIR, file)), true, `Missing JavaScript file ${file}`);
    execFileSync(process.execPath, ["--check", file], {
      cwd: ROOT_DIR,
      stdio: "pipe"
    });
  }
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

function collectHtmlAttributeValues(source, attributeName) {
  const values = [];
  const pattern = new RegExp(`\\s${attributeName}="([^"]+)"`, "g");
  for (const match of source.matchAll(pattern)) {
    values.push(match[1]);
  }
  return values;
}

function testHtmlRelationshipIntegrity() {
  for (const file of ["popup.html", "options.html", "privacy.html"]) {
    const source = fs.readFileSync(path.join(ROOT_DIR, file), "utf8");
    const ids = new Set();

    for (const id of collectHtmlAttributeValues(source, "id")) {
      assert.equal(ids.has(id), false, `${file} has duplicate id "${id}"`);
      ids.add(id);
    }

    for (const attributeName of ["aria-describedby", "aria-labelledby", "aria-controls"]) {
      for (const value of collectHtmlAttributeValues(source, attributeName)) {
        for (const referencedId of value.trim().split(/\s+/).filter(Boolean)) {
          assert.equal(
            ids.has(referencedId),
            true,
            `${file} ${attributeName} references missing id "${referencedId}"`
          );
        }
      }
    }

    for (const attributeName of ["for", "form"]) {
      for (const referencedId of collectHtmlAttributeValues(source, attributeName)) {
        assert.equal(
          ids.has(referencedId),
          true,
          `${file} ${attributeName} references missing id "${referencedId}"`
        );
      }
    }
  }
}

function testStaticExtensionAssets() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "3.0.0");

  assert.deepEqual(manifest.permissions, ["bookmarks", "storage", "alarms"]);
  assert.deepEqual(manifest.optional_host_permissions, ["https://*/*", "http://*/*"]);
  assert.equal(Object.prototype.hasOwnProperty.call(manifest, "host_permissions"), false);

  for (const requiredPath of [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    manifest.options_page
  ]) {
    assert.ok(requiredPath, "Manifest is missing a required entry point");
    assert.equal(
      fs.existsSync(path.join(ROOT_DIR, requiredPath)),
      true,
      `Manifest references missing ${requiredPath}`
    );
  }

  for (const iconPath of [
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {})
  ]) {
    assert.equal(fs.existsSync(path.join(ROOT_DIR, iconPath)), true, `Missing icon ${iconPath}`);
  }

  const localeMessages = {};
  for (const localePath of ["_locales/en/messages.json", "_locales/zh_CN/messages.json"]) {
    localeMessages[localePath] = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, localePath), "utf8"));
  }
  for (const manifestMessage of [manifest.name, manifest.description, manifest.action?.default_title]) {
    const key = String(manifestMessage || "").match(/^__MSG_([A-Za-z0-9_]+)__$/)?.[1];
    assert.ok(key, `Manifest value ${manifestMessage} is not localized`);
    for (const [localePath, messages] of Object.entries(localeMessages)) {
      assert.ok(messages[key]?.message, `${localePath} is missing manifest message ${key}`);
    }
  }
  assert.equal(localeMessages["_locales/en/messages.json"].extName.message, "Marko");
  assert.equal(localeMessages["_locales/zh_CN/messages.json"].extName.message, "Marko");
  assert.match(localeMessages["_locales/en/messages.json"].extDescription.message, /Preview first/);
  assert.match(localeMessages["_locales/zh_CN/messages.json"].extDescription.message, /先预览再整理/);
  for (const [localePath, messages] of Object.entries(localeMessages)) {
    assert.ok(messages.extDescription.message.length <= 132, `${localePath} description is too long`);
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

function readZipLocalEntryNames(zipPath) {
  const buffer = fs.readFileSync(zipPath);
  const names = [];
  let offset = 0;

  while (offset < buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature === 0x02014b50 || signature === 0x06054b50) {
      break;
    }

    assert.equal(signature, 0x04034b50, `Unexpected ZIP signature at offset ${offset}`);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    names.push(buffer.subarray(nameStart, nameEnd).toString("utf8"));
    offset = nameEnd + extraLength + compressedSize;
  }

  return names;
}

function testExtensionPackageFileList() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "manifest.json"), "utf8"));
  const buildScriptSource = fs.readFileSync(
    path.join(ROOT_DIR, "webstore/build_extension_package.mjs"),
    "utf8"
  );
  const gitignoreSource = fs.readFileSync(path.join(ROOT_DIR, ".gitignore"), "utf8");
  assert.match(buildScriptSource, /EXTENSION_PACKAGE_FILES\.json/);
  assert.match(buildScriptSource, /buildZip/);
  assert.match(buildScriptSource, /--out/);
  assert.match(gitignoreSource, /^webstore\/dist\/$/m);
  assert.match(gitignoreSource, /^\*\.zip$/m);

  const packageList = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, "webstore/EXTENSION_PACKAGE_FILES.json"), "utf8")
  );
  const packageFiles = packageList.packageFiles || [];
  const packageFileSet = new Set(packageFiles);

  assert.equal(packageFiles.length, packageFileSet.size, "Package file list contains duplicates");
  assert.ok(packageFileSet.has("manifest.json"), "Package file list must include manifest.json");

  const requiredFiles = new Set([
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    manifest.options_page,
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}),
    "_locales/en/messages.json",
    "_locales/zh_CN/messages.json"
  ]);

  for (const htmlFile of ["popup.html", "options.html", "privacy.html"]) {
    const source = fs.readFileSync(path.join(ROOT_DIR, htmlFile), "utf8");
    for (const match of source.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) {
      const ref = match[1];
      if (!/^https?:/.test(ref)) {
        requiredFiles.add(ref);
      }
    }
  }

  for (const file of packageFiles) {
    assert.equal(fs.existsSync(path.join(ROOT_DIR, file)), true, `Package file is missing: ${file}`);
    assert.equal(/^(\.|\.\.)($|\/)/.test(file), false, `Package file path is not normalized: ${file}`);
    assert.equal(/^(docs|tests|webstore)\//.test(file), false, `Package file should not include release-only material: ${file}`);
    assert.equal(/(^|\/)(README|CHANGELOG|CONTRIBUTING|SUPPORT|SECURITY|LICENSE)\.md$/i.test(file), false, `Package file should not include repo docs: ${file}`);
  }

  for (const requiredFile of requiredFiles) {
    assert.ok(requiredFile, "Package required file cannot be empty");
    assert.equal(
      packageFileSet.has(requiredFile),
      true,
      `Package file list is missing required runtime file: ${requiredFile}`
    );
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "marko-package-"));
  const outputPath = path.join(tempDir, "marko-test.zip");
  try {
    const output = execFileSync(
      process.execPath,
      ["webstore/build_extension_package.mjs", "--out", outputPath],
      { cwd: ROOT_DIR, encoding: "utf8" }
    );
    assert.match(output, /Created .*marko-test\.zip with 19 files\./);
    assert.deepEqual(readZipLocalEntryNames(outputPath), packageFiles);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
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
  assert.match(localeDescription, /Preview first/);
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
  assert.match(backgroundSource, /ux\("模型名称不能为空。", "Model Name is required\."\)/);
  assert.doesNotMatch(backgroundSource, /ux\("Model Name 不能为空。"/);
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
  assert.match(popupSource, /const recordTitle = entry\.title \|\| t\("untitledBookmark"\)/);
  assert.match(popupSource, /keepButton\.setAttribute\("aria-label", t\("keepBookmarkAria", \{ title: recordTitle \}\)\)/);
  assert.match(popupSource, /deleteButton\.setAttribute\("aria-label", t\("deleteBookmarkAria", \{ title: recordTitle \}\)\)/);
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
  assert.match(i18nSource, /keepBookmarkAria/);
  assert.match(i18nSource, /deleteBookmarkAria/);
  assert.match(i18nSource, /optionsMeta: "Marko \/ Options"/);
  assert.match(i18nSource, /navEyebrow: "Navigation"/);
  assert.match(i18nSource, /optionsMeta: "Marko \/ 设置"/);
  assert.match(i18nSource, /navEyebrow: "导航"/);
  assert.match(i18nSource, /connectionTitle: "模型连接"/);
  assert.match(i18nSource, /labelProvider: "服务商"/);
  assert.match(i18nSource, /labelModel: "模型名称"/);
  assert.match(i18nSource, /automationTitle: "自动整理"/);
  assert.match(i18nSource, /backupTitle: "备份管理"/);
  assert.match(i18nSource, /setupRequiredDesc: "预览前需要先选择服务商，并填写 Base URL 和模型名称。"/);
  assert.match(i18nSource, /setupMissingProvider: "请先选择服务商。"/);
  assert.match(i18nSource, /setupMissingModel: "预览前需要填写模型名称。"/);
  assert.match(i18nSource, /setupMissingApiKey: "当前服务商需要 API Key。"/);
  assert.match(i18nSource, /modelRequired: "模型名称不能为空。"/);
  assert.match(i18nSource, /privacyStorageDesc: "API Key、服务商设置、模型名、白名单和备份快照都保存在你的浏览器本地存储与 IndexedDB 中。"/);

  const backgroundSourceForCancel = fs.readFileSync(path.join(ROOT_DIR, "background.js"), "utf8");
  assert.match(backgroundSourceForCancel, /cancelRequested: true/);
  assert.match(backgroundSourceForCancel, /cancelRequested: Boolean\(job\.cancelRequested\)/);
}

function testSlowModelResilienceSurface() {
  const backgroundSource = fs.readFileSync(path.join(ROOT_DIR, "background.js"), "utf8");
  assert.match(backgroundSource, /RUNTIME_BATCH_SIZE_CAPS/);
  assert.match(backgroundSource, /deepseek: 5/);
  assert.match(backgroundSource, /getRuntimeBatchSize/);
  assert.match(backgroundSource, /FIRST_RESPONSE_TIMEOUT_CAPS_MS/);
  assert.match(backgroundSource, /REQUEST_TIMEOUT_CAPS_MS/);
  assert.match(backgroundSource, /getFirstResponseTimeoutMs/);
  assert.match(backgroundSource, /getRequestTimeoutMs/);
  assert.match(backgroundSource, /formatTimeoutSeconds/);
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
  assert.match(optionsSource, /t\("whitelistRemoveDomain", \{ domain \}\)/);
  assert.match(optionsSource, /button\.setAttribute\("aria-pressed", String\(isSelected\)\)/);
  assert.match(optionsSource, /const isSelected = selectedSet\.has\(item\.domain\)/);
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
  assert.match(optionsSource, /getBackupRecordAccessibleName/);
  assert.match(optionsSource, /restoreButton\.setAttribute\("aria-label", t\("backupRestoreRecordAria", \{ title: backupName \}\)\)/);
  assert.match(optionsSource, /deleteButton\.setAttribute\("aria-label", t\("backupDeleteRecordAria", \{ title: backupName \}\)\)/);
  assert.match(optionsSource, /restoreButton\.setAttribute\("aria-describedby", backupActionStatus\.id\)/);
  assert.match(optionsSource, /deleteButton\.setAttribute\("aria-describedby", backupActionStatus\.id\)/);
  assert.match(optionsSource, /confirmButton\.setAttribute\("aria-describedby", backupActionStatus\.id\)/);
  assert.match(optionsSource, /backupConfirmRestoreRecordAria/);
  assert.match(optionsSource, /backupConfirmDeleteRecordAria/);
  assert.match(optionsSource, /backupCancelActionAria/);
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
  assert.match(i18nSource, /whitelistRemoveDomain/);
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
  assert.match(i18nSource, /backupRestoreRecordAria/);
  assert.match(i18nSource, /backupDeleteRecordAria/);
  assert.match(i18nSource, /backupConfirmRestoreRecordAria/);
  assert.match(i18nSource, /backupConfirmDeleteRecordAria/);
  assert.match(i18nSource, /backupCancelActionAria/);
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

  const historicalReleaseNotes = fs.readFileSync(
    path.join(ROOT_DIR, "webstore/RELEASE_NOTES_1.3.0.md"),
    "utf8"
  );
  assert.match(historicalReleaseNotes, /Marko 1\.3\.0 Release Notes/);
  assert.doesNotMatch(historicalReleaseNotes, /Smart Bookmark AI/);

  const storeListing = fs.readFileSync(path.join(ROOT_DIR, "webstore/STORE_LISTING.md"), "utf8");
  assert.match(storeListing, /without calling the model again/);
  assert.match(storeListing, /smaller runtime batch size/);
  assert.match(storeListing, /shorter built-in/);
  assert.match(storeListing, /OpenAI、DeepSeek、MiniMax、Anthropic/);
  assert.match(storeListing, /OpenAI, DeepSeek, MiniMax, Anthropic/);
  assert.match(storeListing, /inline confirmations and validation feedback/);
  assert.match(storeListing, /Popup inline apply confirmation/);
  assert.match(storeListing, /Backup management with inline restore confirmation/);

  const reviewNotes = fs.readFileSync(path.join(ROOT_DIR, "webstore/REVIEW_NOTES.md"), "utf8");
  assert.match(reviewNotes, /复用已保存方案/);

  const webstorePrivacyPolicy = fs.readFileSync(
    path.join(ROOT_DIR, "webstore/PRIVACY_POLICY.md"),
    "utf8"
  );
  assert.match(webstorePrivacyPolicy, /最后更新：2026-05-30/);
  assert.match(webstorePrivacyPolicy, /模型服务商、Base URL、模型名/);
  assert.match(webstorePrivacyPolicy, /完整模式还会在分类前生成全局目录方案/);
  assert.match(webstorePrivacyPolicy, /快速模式会跳过失效链接检测和单独目录规划请求/);
  assert.match(webstorePrivacyPolicy, /完整模式会直接访问书签对应的网站/);

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
  testJavaScriptSyntax();
  testJsonUtils();
  testProviderOutputTokenBudgets();
  testRules();
  testCacheUtils();
  testHtmlRelationshipIntegrity();
  testStaticExtensionAssets();
  testExtensionPackageFileList();
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
