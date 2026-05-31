const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
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
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "3.0.0");
  assert.equal(packageJson.name, "marko");
  assert.equal(packageJson.version, manifest.version);
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.scripts?.test, "node tests/run-tests.js");
  assert.equal(packageJson.scripts?.["package:webstore"], "node webstore/build_extension_package.mjs");
  assert.equal(packageJson.dependencies, undefined);
  assert.equal(packageJson.devDependencies, undefined);

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

  const missingOutPath = spawnSync(process.execPath, ["webstore/build_extension_package.mjs", "--out"], {
    cwd: ROOT_DIR,
    encoding: "utf8"
  });
  assert.notEqual(missingOutPath.status, 0, "Package builder should fail when --out has no path");
  assert.match(missingOutPath.stderr, /--out requires an output path\./);
}

function testSpeedModeSurface() {
  const optionsHtml = fs.readFileSync(path.join(ROOT_DIR, "options.html"), "utf8");
  assert.match(optionsHtml, /id="linkCheckMode"/);
  assert.match(optionsHtml, /value="fast"/);
  assert.match(optionsHtml, /value="balanced"/);
  assert.match(optionsHtml, /value="complete"/);

  const optionsSource = fs.readFileSync(path.join(ROOT_DIR, "options.js"), "utf8");
  assert.match(optionsSource, /linkCheckMode/);
  assert.match(optionsSource, /LINK_CHECK_MODE_FAST/);
  assert.match(optionsSource, /LINK_CHECK_MODE_BALANCED/);
  assert.match(optionsSource, /LINK_CHECK_MODE_COMPLETE/);

  const backgroundSource = fs.readFileSync(path.join(ROOT_DIR, "background.js"), "utf8");
  assert.match(backgroundSource, /shouldCheckDeadLinks/);
  assert.match(backgroundSource, /buildSkippedDeadLinkScanResult/);
  assert.match(backgroundSource, /Cannot generate a Complete preview without site access/);
  assert.match(backgroundSource, /previewing Complete mode/);
  assert.doesNotMatch(backgroundSource, /Cannot start organizing without site access/);

  const popupSource = fs.readFileSync(path.join(ROOT_DIR, "popup.js"), "utf8");
  assert.match(popupSource, /ensureOrganizeAccess/);
  assert.match(popupSource, /ensureOriginAccess/);
  assert.match(popupSource, /isValidHttpUrl/);
  assert.match(popupSource, /setupInvalidBaseUrl/);
  assert.match(popupSource, /LINK_CHECK_MODE_BALANCED/);
  assert.match(popupSource, /LINK_CHECK_MODE_COMPLETE/);

  const localeDescription = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, "_locales/en/messages.json"), "utf8")
  ).extDescription.message;
  assert.match(localeDescription, /Preview first/);
  assert.match(localeDescription, /optional dead-link checks/);

  const storeListing = fs.readFileSync(path.join(ROOT_DIR, "webstore/STORE_LISTING.md"), "utf8");
  assert.match(storeListing, /Fast mode/);
  assert.match(storeListing, /Balanced mode/);
  assert.match(storeListing, /Complete mode/);

  const privacyPolicy = fs.readFileSync(path.join(ROOT_DIR, "PRIVACY.md"), "utf8");
  assert.match(privacyPolicy, /Last updated: 2026-05-31/);
  assert.match(privacyPolicy, /when Balanced\/Complete preview or enabled auto organize/);
  assert.match(privacyPolicy, /Applying a saved preview plan rebuilds locally and does not call the model again/);
  assert.match(privacyPolicy, /Fast mode skips dead-link checks, the separate taxonomy-planning model request, and model classification/);
  assert.match(privacyPolicy, /Balanced mode can use model classification without sending HEAD \/ GET requests/);
  assert.match(privacyPolicy, /Complete mode can send HEAD \/ GET requests directly to bookmarked websites/);
  assert.match(privacyPolicy, /before restoring an older backup/);
  assert.match(privacyPolicy, /pre-restore snapshots/);

  const privacyHtml = fs.readFileSync(path.join(ROOT_DIR, "privacy.html"), "utf8");
  assert.match(privacyHtml, /Faster providers may also use a separate taxonomy-planning request/);
  assert.match(privacyHtml, /Balanced mode skips direct website checks/);
  assert.match(privacyHtml, /Complete mode can send direct HEAD \/ GET requests/);
  assert.match(privacyHtml, /Fast mode skips those external requests/);
  assert.match(privacyHtml, /Applying a saved preview does not call the model again/);
  assert.match(privacyHtml, /before restoring an older backup/);
  assert.match(privacyHtml, /data-i18n="privacyMeta"/);
  assert.match(privacyHtml, /data-i18n="privacyDataUseEyebrow"/);
  assert.match(privacyHtml, /data-i18n="privacyControlEyebrow"/);

  const i18nSource = fs.readFileSync(path.join(ROOT_DIR, "i18n.js"), "utf8");
  assert.match(i18nSource, /privacyMeta: "Marko \/ 隐私说明"/);
  assert.match(i18nSource, /privacyDataUseEyebrow: "数据使用"/);
  assert.match(i18nSource, /privacyControlEyebrow: "控制项"/);
}

function testPreviewApplySurface() {
  const backgroundSource = fs.readFileSync(path.join(ROOT_DIR, "background.js"), "utf8");
  assert.match(backgroundSource, /smartBookmarkPreviewPlan/);
  assert.match(backgroundSource, /APPLY_PREVIEW_PLAN/);
  assert.doesNotMatch(backgroundSource, /START_ORGANIZE/);
  assert.match(backgroundSource, /applyPreviewPlan/);
  assert.match(backgroundSource, /previewApplyRetryAvailable: false/);
  assert.match(backgroundSource, /const statusPatch = \{\n    previewApplyRetryAvailable: false,/);
  assert.match(backgroundSource, /previewApplyRetryAvailable: true/);
  assert.match(backgroundSource, /keepPreviewApplyRetryAvailable/);
  assert.match(backgroundSource, /return await keepPreviewApplyRetryAvailable\(error\)/);
  assert.match(backgroundSource, /savePreviewPlan/);
  assert.match(backgroundSource, /buildBookmarkSetSignature/);
  assert.match(backgroundSource, /does not call the model again/);
  assert.match(backgroundSource, /oldSignature === nextSignature/);
  assert.match(backgroundSource, /invalidatePreviewPlan/);
  assert.match(backgroundSource, /INVALIDATE_PREVIEW_PLAN/);
  assert.match(backgroundSource, /Mode changed\. Generate a new preview/);
  assert.match(backgroundSource, /onCreated\?\.addListener\(invalidatePreviewAfterBookmarkChange\)/);
  assert.match(backgroundSource, /onChildrenReordered\?\.addListener\(invalidatePreviewAfterBookmarkChange\)/);
  assert.match(backgroundSource, /rejectApplyPreviewPlan/);
  assert.match(backgroundSource, /async function rejectApplyPreviewPlan\(error, detail\) \{\n  await chrome\.storage\.local\.remove\(STORAGE_KEYS\.previewPlan\)/);
  assert.match(backgroundSource, /Preview plans are tied to the provider/);
  assert.doesNotMatch(backgroundSource, /Preview plans are tied to the provider, batch size/);
  assert.match(backgroundSource, /Marko detected that the bookmark set no longer matches the preview/);
  assert.match(backgroundSource, /normalizePreviewPlanBatchSize/);
  assert.match(backgroundSource, /const batchSize = normalizePreviewPlanBatchSize\(previewPlan\.batchSize, config\.batchSize\)/);
  assert.match(backgroundSource, /ux\("模型名称不能为空。", "Model Name is required\."\)/);
  assert.doesNotMatch(backgroundSource, /ux\("Model Name 不能为空。"/);
  assert.match(backgroundSource, /getBookmarkById/);
  assert.match(backgroundSource, /Stale unprocessed record removed/);
  assert.match(backgroundSource, /currentStatus\?\.phase !== "completed"/);
  assert.match(backgroundSource, /Apply and finish the organize plan before handling unprocessed items/);
  assert.match(backgroundSource, /before generating a preview/);
  assert.doesNotMatch(backgroundSource, /whitelist that site before organizing/);
  assert.match(backgroundSource, /existingBookmark\.id/);
  assert.match(backgroundSource, /Pre-restore backup failed/);
  assert.match(backgroundSource, /createCurrentSnapshotBackup\(bookmarkBarNode, "manual", \{ preserveIds: \[backupId\] \}\)/);
  assert.match(backgroundSource, /limitBackupRecords\(records, maxRecords = MAX_BACKUP_RECORDS, options = \{\}\)/);
  assert.match(backgroundSource, /preserveIds/);
  assert.match(backgroundSource, /addBackupRecord\(record, source = "manual", options = \{\}\)/);
  assert.match(backgroundSource, /createCurrentSnapshotBackup\(bookmarkBarNode, source = "manual", options = \{\}\)/);
  assert.match(backgroundSource, /BOOTSTRAP_BACKUP_SYNC_TTL_MS/);
  assert.match(backgroundSource, /BOOTSTRAP_ROOT_CLEANUP_TTL_MS/);
  assert.match(backgroundSource, /let lastBootstrapBackupSyncMs = 0/);
  assert.match(backgroundSource, /let lastBootstrapRootCleanupMs = 0/);
  assert.match(backgroundSource, /await syncBackupRecordsForBootstrap\(\)/);
  assert.match(backgroundSource, /await cleanupForbiddenRootFoldersForBootstrap\(stored\[STORAGE_KEYS\.job\]\)/);
  assert.match(backgroundSource, /now - lastBootstrapBackupSyncMs < BOOTSTRAP_BACKUP_SYNC_TTL_MS/);
  assert.match(backgroundSource, /now - lastBootstrapRootCleanupMs < BOOTSTRAP_ROOT_CLEANUP_TTL_MS/);

  const popupSource = fs.readFileSync(path.join(ROOT_DIR, "popup.js"), "utf8");
  assert.match(popupSource, /APPLY_PREVIEW_PLAN/);
  assert.match(popupSource, /PREVIEW_PLAN_KEY = "smartBookmarkPreviewPlan"/);
  assert.match(popupSource, /currentPreviewPlan/);
  assert.match(popupSource, /isSavedPreviewPlanUsable/);
  assert.match(popupSource, /function canApplyPreviewPlan/);
  assert.match(popupSource, /Boolean\(currentStatus\?\.previewApplyRetryAvailable\) && isSavedPreviewPlanUsable\(currentPreviewPlan\)/);
  assert.doesNotMatch(popupSource, /currentStatus\?\.phase === "error" && isSavedPreviewPlanUsable\(currentPreviewPlan\)/);
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
  assert.match(popupSource, /function canResolveUnprocessedEntries\(\) \{/);
  assert.match(popupSource, /return currentStatus\?\.phase === "completed"/);
  assert.match(popupSource, /\{ allowActions: canResolveUnprocessedEntries\(\) \}/);
  assert.match(popupSource, /settingsShortcutButton/);
  assert.match(popupSource, /summaryActions\.appendChild\(createSettingsShortcutButton\(\)\)/);
  assert.match(popupSource, /popupCheckingCoverageStatus/);
  assert.match(popupSource, /popupRequestingAccessStatus/);
  assert.match(popupSource, /popupStartingPreviewStatus/);
  assert.match(popupSource, /popupApplyingPlanStatus/);
  assert.match(popupSource, /popupCreatingBackupStatus/);
  assert.match(popupSource, /popupResolvingItemStatus/);
  assert.match(popupSource, /popupCancellingStatus/);
  assert.match(popupSource, /speedModeButtons/);
  assert.match(popupSource, /normalizeLinkCheckMode/);
  assert.match(popupSource, /async function updatePopupSpeedMode/);
  assert.match(popupSource, /chrome\.storage\.local\.set\(\{ \[CONFIG_KEY\]: nextConfig \}\)/);
  assert.match(popupSource, /chrome\.runtime\.sendMessage\(\{ type: "INVALIDATE_PREVIEW_PLAN" \}\)/);
  assert.match(popupSource, /applyConfirmationVisible = false/);
  assert.match(popupSource, /popupSavingSpeedModeStatus/);
  assert.match(popupSource, /popupSpeedModeSavedStatus/);
  assert.match(popupSource, /button\.setAttribute\("aria-checked", String\(isActive\)\)/);
  assert.match(popupSource, /function setButtonLabel\(button, label\)/);
  assert.match(popupSource, /button\.title = safeLabel/);
  assert.match(popupSource, /button\.setAttribute\("aria-label", safeLabel\)/);
  assert.match(popupSource, /function setButtonAccessibleLabel\(button, label\)/);
  assert.match(popupSource, /\[LINK_CHECK_MODE_BALANCED\]: t\("popupSpeedModeBalancedAria"\)/);
  assert.match(popupSource, /\[LINK_CHECK_MODE_COMPLETE\]: t\("popupSpeedModeCompleteAria"\)/);
  assert.match(popupSource, /setButtonAccessibleLabel\(button, modeLabel\)/);
  assert.match(popupSource, /startButton\.disabled = popupActionInFlight \|\| isRunning/);
  assert.match(popupSource, /backupButton\.disabled = popupActionInFlight \|\| isRunning/);
  assert.match(popupSource, /button\.disabled = popupActionInFlight \|\| isRunning/);
  assert.match(popupSource, /const isCancelling = Boolean\(currentStatus\?\.cancelRequested\)/);
  assert.match(popupSource, /cancelButton\.disabled = popupActionInFlight \|\| !isRunning \|\| isCancelling/);
  assert.match(popupSource, /const startLabel = !isConfigured[\s\S]*canApplyPreviewPlan\(\)[\s\S]*t\("confirmOrganizeButton"\)/);
  assert.match(popupSource, /const cancelLabel = isCancelling \? t\("cancelRequestedButton"\) : t\("cancelButton"\)/);
  assert.match(popupSource, /setButtonLabel\(optionsButton, t\("optionsButton"\)\)/);
  assert.match(popupSource, /setButtonLabel\(startButton, startLabel\)/);
  assert.match(popupSource, /setButtonLabel\(backupButton, t\("backupButton"\)\)/);
  assert.match(popupSource, /setButtonLabel\(cancelButton, cancelLabel\)/);
  assert.match(popupSource, /if \(!canApplyPreviewPlan\(\)\) \{\n    applyConfirmationVisible = false;/);
  assert.match(popupSource, /createApplyConfirmationState/);
  assert.match(popupSource, /wrapper\.id = "applyConfirmation"/);
  assert.match(popupSource, /wrapper\.setAttribute\("aria-labelledby", "applyConfirmTitle"\)/);
  assert.match(popupSource, /wrapper\.setAttribute\("aria-describedby", "applyConfirmDesc"\)/);
  assert.match(popupSource, /applyButton\.setAttribute\("aria-describedby", popupActionStatus\.id\)/);
  assert.match(popupSource, /applyButton\.dataset\.applyConfirmationPrimary = "true"/);
  assert.match(popupSource, /const applyLabel = t\("applyConfirmPrimary"\)/);
  assert.match(popupSource, /setButtonLabel\(applyButton, applyLabel\)/);
  assert.match(popupSource, /const cancelApplyLabel = t\("applyConfirmSecondary"\)/);
  assert.match(popupSource, /setButtonLabel\(confirmationCancelButton, cancelApplyLabel\)/);
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
  assert.match(popupSource, /Providers\?\.hasProvider\?\.\(config\.provider\)/);
  assert.match(popupSource, /function mergePopupConfig\(raw = \{\}\)/);
  assert.match(popupSource, /baseUrl:[\s\S]*defaults\.baseUrl \|\| ""/);
  assert.match(popupSource, /model:[\s\S]*defaults\.model \|\| ""/);
  assert.match(popupSource, /currentConfig = mergePopupConfig\(stored\[CONFIG_KEY\] \|\| \{\}\)/);
  assert.match(popupSource, /hasModelAccessConfig/);
  assert.match(popupSource, /CHECK_LOCAL_MODEL_REQUIREMENT/);
  assert.match(popupSource, /localRequirementCheckId: requirement\.checkId \|\| ""/);
  assert.match(popupSource, /chrome\.storage\.local\.get\(\[CONFIG_KEY, STATUS_KEY, PREVIEW_PLAN_KEY\]\)/);
  assert.match(popupSource, /requirement\.needsModel \|\| requirement\.requiresBroadHostAccess/);
  assert.match(popupSource, /modelAccessRequiredForUncachedPreview/);
  assert.match(popupSource, /async function createManualBackup\(\) \{\n  setPopupActionInFlight\(true, t\("popupCreatingBackupStatus"\)\);/);
  assert.match(popupSource, /async function cancelJob\(\) \{\n  setPopupActionInFlight\(true, t\("popupCancellingStatus"\)\);/);
  assert.match(popupSource, /const recordTitle = entry\.title \|\| t\("untitledBookmark"\)/);
  assert.match(popupSource, /const keepLabel = t\("keepBookmarkAria", \{ title: recordTitle \}\)/);
  assert.match(popupSource, /keepButton\.title = keepLabel/);
  assert.match(popupSource, /keepButton\.setAttribute\("aria-label", keepLabel\)/);
  assert.match(popupSource, /const deleteLabel = t\("deleteBookmarkAria", \{ title: recordTitle \}\)/);
  assert.match(popupSource, /deleteButton\.title = deleteLabel/);
  assert.match(popupSource, /deleteButton\.setAttribute\("aria-label", deleteLabel\)/);
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
  assert.match(popupHtml, /class="popup-mode-bar"[\s\S]*aria-labelledby="popupSpeedModeLabel"/);
  assert.match(popupHtml, /role="radiogroup"[\s\S]*aria-labelledby="popupSpeedModeLabel"/);
  assert.match(popupHtml, /role="radiogroup"[\s\S]*aria-orientation="horizontal"/);
  assert.match(popupHtml, /id="speedModeFastButton"[\s\S]*role="radio"[\s\S]*data-popup-speed-mode="fast"/);
  assert.match(popupHtml, /id="speedModeBalancedButton"[\s\S]*role="radio"[\s\S]*data-popup-speed-mode="balanced"/);
  assert.match(popupHtml, /id="speedModeCompleteButton"[\s\S]*role="radio"[\s\S]*data-popup-speed-mode="complete"/);
  assert.match(popupHtml, /id="phaseBadge"[\s\S]*role="status"[\s\S]*aria-live="polite"[\s\S]*aria-atomic="true"/);
  assert.match(popupHtml, /id="popupActionStatus"/);
  assert.match(popupHtml, /role="status"/);
  assert.match(popupHtml, /id="progressTrack"/);
  assert.match(popupHtml, /role="progressbar"/);
  assert.match(popupHtml, /aria-describedby="progressSummary progressMeta"/);
  assert.match(popupHtml, /data-i18n-aria-label="progressAriaLabel"/);
  assert.match(popupHtml, /id="detailPanel"[\s\S]*role="region"[\s\S]*data-i18n-aria-label="detailPanelAriaLabel"/);
  assert.doesNotMatch(popupHtml, /id="processedValue"/);
  assert.match(popupSource, /if \(phaseBadge\.textContent !== phaseLabel\)/);
  assert.match(popupSource, /function formatDuration\(milliseconds\)/);
  assert.match(popupSource, /function buildElapsedMeta\(status, phase\)/);
  assert.match(popupSource, /"ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"/);
  assert.match(popupSource, /event\.key === "Home"/);
  assert.match(popupSource, /event\.key === "End"/);
  assert.match(popupSource, /\["ArrowRight", "ArrowDown"\]\.includes\(event\.key\)/);
  assert.match(popupSource, /phase !== "running" \|\| !status\?\.startedAt/);
  assert.match(popupSource, /metaParts\.push\(elapsedMeta\)/);
  assert.match(popupSource, /progressTrack\.setAttribute\("aria-valuetext", `\$\{progress\}%, \$\{progressSummaryText\}, \$\{progressMetaText\}`\)/);
  assert.doesNotMatch(popupSource, /processedValue/);
  assert.match(popupSource, /title\.id = "folderSummaryTitle"/);
  assert.match(popupSource, /table\.setAttribute\("aria-labelledby", title\.id\)/);
  assert.match(popupSource, /folderHeader\.scope = "col"/);
  assert.match(popupSource, /countHeader\.scope = "col"/);

  const stylesSource = fs.readFileSync(path.join(ROOT_DIR, "styles.css"), "utf8");
  assert.match(stylesSource, /\.confirm-strip/);
  assert.match(stylesSource, /\.popup-action-status/);
  assert.match(stylesSource, /\.popup-mode-bar/);
  assert.match(stylesSource, /\.segmented-control/);
  assert.match(stylesSource, /\.segmented-control__button\.is-active/);
  assert.doesNotMatch(stylesSource, /\.result-nav/);
  assert.doesNotMatch(stylesSource, /\.results-workspace/);

  const i18nSource = fs.readFileSync(path.join(ROOT_DIR, "i18n.js"), "utf8");
  assert.match(i18nSource, /cancelRequestedButton/);
  assert.match(i18nSource, /settingsShortcutButton/);
  assert.match(i18nSource, /popupSpeedModeLabel/);
  assert.match(i18nSource, /popupSpeedModeFastAria/);
  assert.match(i18nSource, /popupSpeedModeBalancedAria/);
  assert.match(i18nSource, /popupSpeedModeCompleteAria/);
  assert.match(i18nSource, /popupSpeedModeSavedStatus/);
  assert.match(i18nSource, /logModelTimeoutFallback/);
  assert.match(i18nSource, /elapsedMeta/);
  assert.match(i18nSource, /detailPanelAriaLabel/);
  assert.match(i18nSource, /keepBookmarkAria/);
  assert.match(i18nSource, /deleteBookmarkAria/);
  assert.match(i18nSource, /optionsMeta: "Marko \/ Options"/);
  assert.match(i18nSource, /navEyebrow: "Navigation"/);
  assert.match(i18nSource, /optionsMeta: "Marko \/ 设置"/);
  assert.match(i18nSource, /navEyebrow: "导航"/);
  assert.match(i18nSource, /saveBadgeFailed: "失败"/);
  assert.match(i18nSource, /saveBadgeLoadFailed: "读取失败"/);
  assert.match(i18nSource, /apiKeyClearedOnProviderChange: "已清空 API Key，避免把旧服务商密钥用于新服务商。"/);
  assert.match(i18nSource, /connectionTitle: "模型连接"/);
  assert.match(i18nSource, /labelProvider: "服务商"/);
  assert.match(i18nSource, /labelModel: "模型名称"/);
  assert.match(i18nSource, /automationTitle: "自动整理"/);
  assert.match(i18nSource, /settingsStepAccess: "快速自动整理可本地运行；平衡模式需要模型接口权限；完整模式还需要网站访问权限。"/);
  assert.match(i18nSource, /autoOrganizePermission: "快速自动整理会在本地运行；平衡自动整理需要模型接口权限，完整自动整理还需要网站访问权限。"/);
  assert.match(i18nSource, /backupTitle: "备份管理"/);
  assert.match(i18nSource, /setupRequiredDesc: "预览前需要先选择服务商，并填写 Base URL 和模型名称。"/);
  assert.match(i18nSource, /setupMissingProvider: "请先选择服务商。"/);
  assert.match(i18nSource, /setupInvalidBaseUrl: "Base URL 必须是有效的 http 或 https 地址。"/);
  assert.match(i18nSource, /setupMissingModel: "预览前需要填写模型名称。"/);
  assert.match(i18nSource, /setupMissingApiKey: "当前服务商需要 API Key。"/);
  assert.match(i18nSource, /baseUrlInvalid: "Base URL 必须是有效的 http 或 https 地址。"/);
  assert.match(i18nSource, /modelRequired: "模型名称不能为空。"/);
  assert.match(i18nSource, /hostAccessRefreshFailed: "访问状态刷新失败。请检查 Chrome 扩展权限后重试。"/);
  assert.match(i18nSource, /应用已保存预览不会再次请求模型。/);
  assert.match(i18nSource, /privacyStorageDesc: "API Key、服务商设置、模型名、白名单和备份快照都保存在你的浏览器本地存储与 IndexedDB 中。"/);
  assert.match(i18nSource, /privacyBackupDesc: "应用预览方案、自动整理重建和恢复旧备份前都会先创建本地快照备份。你可以在设置页管理备份并恢复旧版本。"/);

  const backgroundSourceForCancel = fs.readFileSync(path.join(ROOT_DIR, "background.js"), "utf8");
  assert.match(backgroundSourceForCancel, /cancelRequested: true/);
  assert.match(backgroundSourceForCancel, /cancelRequested: Boolean\(job\.cancelRequested\)/);
  assert.match(backgroundSourceForCancel, /mergeStoredCancellationFlag/);
  assert.match(backgroundSourceForCancel, /storedJob\.cancelRequested/);
}

function testSlowModelResilienceSurface() {
  const backgroundSource = fs.readFileSync(path.join(ROOT_DIR, "background.js"), "utf8");
  assert.match(backgroundSource, /DEEPSEEK_RUNTIME_BATCH_SIZE = 9/);
  assert.match(backgroundSource, /DEEPSEEK_MODEL_REQUEST_BATCH_SIZE = 3/);
  assert.match(backgroundSource, /RUNTIME_BATCH_SIZE_CAPS/);
  assert.match(backgroundSource, /RUNTIME_BATCH_SIZE_CAPS[\s\S]*deepseek: DEEPSEEK_RUNTIME_BATCH_SIZE/);
  assert.match(backgroundSource, /return provider === "deepseek" \? DEEPSEEK_RUNTIME_BATCH_SIZE : DEFAULT_BATCH_SIZE/);
  assert.match(backgroundSource, /MODEL_REQUEST_BATCH_SIZE_CAPS/);
  assert.match(backgroundSource, /MODEL_REQUEST_BATCH_SIZE_CAPS[\s\S]*deepseek: DEEPSEEK_MODEL_REQUEST_BATCH_SIZE/);
  assert.match(backgroundSource, /MODEL_REQUEST_CONCURRENCY_CAPS/);
  assert.match(backgroundSource, /MODEL_REQUEST_CONCURRENCY_CAPS[\s\S]*deepseek: 3/);
  assert.match(backgroundSource, /getRuntimeBatchSizeCap/);
  assert.match(backgroundSource, /normalizeConfigBatchSize/);
  assert.match(backgroundSource, /getProviderPerformanceProfile/);
  assert.match(backgroundSource, /normalizedBaseUrl\.includes\("deepseek"\)/);
  assert.match(backgroundSource, /normalizedModel\.includes\("deepseek"\)/);
  assert.match(backgroundSource, /getRuntimeProviderLabel/);
  assert.match(backgroundSource, /return config\?\.provider \? getProviderLabel\(config\.provider\) : ""/);
  assert.match(backgroundSource, /provider: getRuntimeProviderLabel\(config\)/);
  assert.match(backgroundSource, /getRuntimeProviderLabel\(job\?\.config \|\| \{\}\)/);
  assert.match(backgroundSource, /getModelRequestConcurrency/);
  assert.match(backgroundSource, /getRuntimeBatchSize/);
  assert.match(backgroundSource, /getModelRequestBatchSizeCap/);
  assert.match(backgroundSource, /normalizeRunningOrganizeJobRuntime/);
  assert.match(backgroundSource, /Math\.min\(storedBatchSize, cappedRuntimeBatchSize\)/);
  assert.match(backgroundSource, /splitIntoModelRequestBatches/);
  assert.match(backgroundSource, /splitIntoFixedSizeChunks/);
  assert.match(backgroundSource, /getAdaptiveRetryBatchSize/);
  assert.match(backgroundSource, /classifySplitModelRequestBatches/);
  assert.match(backgroundSource, /classifyAdaptiveModelRequestBatch/);
  assert.match(backgroundSource, /if \(requestBatchCap && batch\.length > requestBatchCap\)/);
  assert.match(backgroundSource, /Promise\.allSettled\(workers\)/);
  assert.match(backgroundSource, /activeModelAbortControllers/);
  assert.match(backgroundSource, /abortActiveModelRequests/);
  assert.match(backgroundSource, /Splitting slow-model request/);
  assert.match(backgroundSource, /Completed mini-request results are kept/);
  assert.match(backgroundSource, /only the failed \$\{requestBatch\.length\} bookmarks are being split and retried/);
  assert.match(backgroundSource, /assertNoStoredCancellationBeforeModelRequest/);
  assert.match(backgroundSource, /MIN_AUTO_RETRY_BATCH_SIZE = 1/);
  assert.match(backgroundSource, /normalizeRetryBatchSize/);
  assert.match(backgroundSource, /FIRST_RESPONSE_TIMEOUT_CAPS_MS/);
  assert.match(backgroundSource, /REQUEST_TIMEOUT_CAPS_MS/);
  assert.match(backgroundSource, /deepseek:\s*6_000/);
  assert.match(backgroundSource, /deepseek:\s*14_000/);
  assert.match(backgroundSource, /within 6 seconds/);
  assert.match(backgroundSource, /within 14 seconds/);
  assert.match(backgroundSource, /getFirstResponseTimeoutMs/);
  assert.match(backgroundSource, /getRequestTimeoutMs/);
  assert.match(backgroundSource, /formatTimeoutSeconds/);
  assert.match(backgroundSource, /COMPACT_DEFAULT_PROMPT/);
  assert.match(backgroundSource, /buildModelStrategyPrompt/);
  assert.match(backgroundSource, /I18N\.isBuiltInPromptValue/);
  assert.match(backgroundSource, /MODEL_INPUT_URL_MAX_LENGTH/);
  assert.match(backgroundSource, /CLASSIFICATION_OUTPUT_TOKENS_PER_BOOKMARK/);
  assert.match(backgroundSource, /CLASSIFICATION_OUTPUT_BUDGET_PROFILES/);
  assert.match(backgroundSource, /getClassificationOutputBudgetProfile/);
  assert.match(backgroundSource, /getClassificationOutputTokenBudget/);
  assert.match(backgroundSource, /getClassificationOutputTokenBudget\(batch\.length, config\)/);
  assert.match(backgroundSource, /shouldUseCompactModelProtocol/);
  assert.match(backgroundSource, /COMPACT_MODEL_INPUT_TITLE_MAX_LENGTH/);
  assert.match(backgroundSource, /compactKeys: useCompactProtocol/);
  assert.match(backgroundSource, /i: id/);
  assert.match(backgroundSource, /u: url/);
  assert.match(backgroundSource, /"a": "k or d"/);
  assert.match(backgroundSource, /entry\?\.id \?\? entry\?\.i/);
  assert.match(backgroundSource, /entry\.action \?\? entry\.a/);
  assert.match(backgroundSource, /entry\.folderPath \?\? entry\.path \?\? entry\.category \?\? entry\.p/);
  assert.match(backgroundSource, /entry\.duplicateOf \?\? entry\.d/);
  assert.match(backgroundSource, /delete_duplicate\|delete-duplicate\|delete duplicate/);
  assert.match(backgroundSource, /Current model-request batch size/);
  assert.match(backgroundSource, /buildModelBookmarkInputPayload/);
  assert.match(backgroundSource, /compactModelUrl/);
  assert.match(backgroundSource, /outputTokenBudget/);
  assert.match(backgroundSource, /JSON\.stringify\(inputPayload\)/);
  assert.match(backgroundSource, /TAXONOMY_SAMPLE_SIZE_CAPS/);
  assert.match(backgroundSource, /getTaxonomyPlanningTimeoutMs/);
  assert.match(backgroundSource, /shouldPlanGlobalTaxonomy/);
  assert.match(backgroundSource, /shouldUseAiClassification/);
  assert.match(backgroundSource, /shouldUseModelTimeoutFallback/);
  assert.match(backgroundSource, /shouldRetryModelTimeout/);
  assert.match(backgroundSource, /!shouldRetryModelTimeout\(config\)/);
  assert.match(backgroundSource, /modelFallbackToManual/);
  assert.match(backgroundSource, /buildModelTimeoutFallbackWarnings/);
  assert.match(backgroundSource, /skips the separate global taxonomy request/);
  assert.match(backgroundSource, /slow models will continue with the local fallback/);
  assert.match(backgroundSource, /Fast mode skipped the separate taxonomy-planning request/);
  assert.match(backgroundSource, /Balanced mode skips dead-link checks and separate taxonomy planning/);
  assert.match(backgroundSource, /FAST_LOCAL_FOLDER_RULES/);
  assert.match(backgroundSource, /buildBuiltInFastFolderPlans/);
  assert.match(backgroundSource, /matchBuiltInFastFolderPath/);
  assert.match(backgroundSource, /buildFastLocalUnclassifiedWarnings/);
  assert.match(backgroundSource, /finishUnclassifiedLocally: !useAiClassification/);
  assert.match(backgroundSource, /includeMissingAsManual: !finishUnclassifiedLocally/);
  assert.match(backgroundSource, /includeMissingAsManual: useAiClassification && !job\.modelFallbackToManual/);
  assert.match(backgroundSource, /Fast mode does not wait for the model/);
  assert.match(backgroundSource, /useBuiltInFastRules: true/);
  assert.match(backgroundSource, /built-in fast rules/);
  assert.match(backgroundSource, /buildFastLocalClassificationPlan/);
  assert.match(backgroundSource, /finishFastLocalJob/);
  assert.match(backgroundSource, /CHECK_LOCAL_MODEL_REQUIREMENT/);
  assert.match(backgroundSource, /checkLocalModelRequirement/);
  assert.match(backgroundSource, /requiresBroadHostAccess: shouldCheckDeadLinks\(runtimeConfig\) && bookmarkState\.bookmarks\.length > 0/);
  assert.match(backgroundSource, /LOCAL_REQUIREMENT_CHECK_TTL_MS/);
  assert.match(backgroundSource, /lastLocalRequirementCheck/);
  assert.match(backgroundSource, /takeReusableLocalRequirementCheck/);
  assert.match(backgroundSource, /localRequirementCheckId: message\.localRequirementCheckId \|\| ""/);
  assert.match(backgroundSource, /reusableLocalCheck\?\.bookmarkState \|\| await collectBookmarkPlanningState/);
  assert.match(backgroundSource, /validateConfig\(config, \{ requireModelAccess: false \}\)/);
  assert.match(backgroundSource, /if \(!bookmarks\.length\) \{[\s\S]*return \{ ok: true \};[\s\S]*await assertOrganizeHostAccess\(runContext\.trigger, runtimeConfig\)/);
  assert.match(backgroundSource, /validateConfig\(config, \{ requireModelAccess: true \}\)/);
  assert.match(backgroundSource, /function hasRequiredProviderCredential/);
  assert.match(backgroundSource, /requireModelAccess && !hasRequiredProviderCredential\(config\)/);
  assert.match(backgroundSource, /!shouldCheckDeadLinks\(runtimeConfig\) && !startupAiCandidateCount/);
  assert.match(backgroundSource, /one-bookmark mini-batch/);
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
  assert.match(optionsHtml, /id="saveBadge"[\s\S]*role="status"[\s\S]*aria-live="polite"[\s\S]*aria-atomic="true"/);
  assert.match(optionsHtml, /id="backupStatusBadge"[\s\S]*role="status"[\s\S]*aria-live="polite"[\s\S]*aria-atomic="true"/);
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
  assert.match(optionsHtml, /id="batchSizeCapHint"[\s\S]*role="status"[\s\S]*aria-live="polite"[\s\S]*hidden/);
  assert.match(optionsHtml, /id="autoOrganizeIntervalHours"[\s\S]*aria-describedby="autoOrganizeIntervalHint"/);
  assert.match(optionsHtml, /id="autoOrganizeIntervalHint"[\s\S]*data-i18n="hintAutoOrganizeInterval"/);
  assert.match(optionsHtml, /id="whitelistSelectionStatus"[\s\S]*role="status"[\s\S]*aria-live="polite"/);
  assert.match(optionsHtml, /id="whitelistSearch"[\s\S]*aria-describedby="whitelistSelectionStatus"/);
  assert.match(optionsHtml, /id="saveButton"/);

  const optionsSource = fs.readFileSync(path.join(ROOT_DIR, "options.js"), "utf8");
  assert.match(optionsSource, /DEEPSEEK_RUNTIME_BATCH_SIZE = 9/);
  assert.match(optionsSource, /return provider === "deepseek" \? DEEPSEEK_RUNTIME_BATCH_SIZE : DEFAULT_BATCH_SIZE/);
  assert.match(optionsSource, /getProviderPerformanceProfile/);
  assert.match(optionsSource, /normalizedBaseUrl\.includes\("deepseek"\)/);
  assert.match(optionsSource, /getRuntimeBatchSizeCap/);
  assert.match(optionsSource, /normalizeConfigBatchSize/);
  assert.match(optionsSource, /capConfigBatchSize/);
  assert.match(optionsSource, /batchSizeCapHint/);
  assert.match(optionsSource, /function updateBatchSizeCapHint\(\)/);
  assert.match(optionsSource, /getCurrentBatchProfileConfig/);
  assert.match(optionsSource, /t\("batchSizeCapHint", \{ count: cap \}\)/);
  assert.match(optionsSource, /addDescribedByToken\(batchSizeInput, batchSizeCapHint\.id\)/);
  assert.match(optionsSource, /removeDescribedByTokens\(batchSizeInput, \[batchSizeCapHint\.id\]\)/);
  assert.match(optionsSource, /settingsSlowBatchAdjustedStatus/);
  assert.match(optionsSource, /showSettingsIssue/);
  assert.match(optionsSource, /isValidHttpUrl/);
  assert.match(optionsSource, /const providerKnown = Boolean\(raw\.provider && Providers\.hasProvider\(raw\.provider\)\)/);
  assert.match(optionsSource, /const apiKey = providerKnown && typeof raw\.apiKey === "string" \? raw\.apiKey\.trim\(\) : ""/);
  assert.match(optionsSource, /const linkCheckMode = normalizeLinkCheckMode\(raw\.linkCheckMode \|\| defaults\.linkCheckMode\)/);
  assert.match(optionsSource, /!shouldRequireModelAccess\(\{ linkCheckMode \}\) \|\| Boolean\(defaults\.apiKeyOptional \|\| apiKey\)/);
  assert.match(optionsSource, /const baseUrl =\s*providerKnown && typeof raw\.baseUrl === "string"/);
  assert.match(optionsSource, /const batchProfileConfig = \{ provider, baseUrl, model \}/);
  assert.match(optionsSource, /batchSize: normalizeConfigBatchSize\(raw\.batchSize, batchProfileConfig, defaults\.batchSize\)/);
  assert.match(optionsSource, /apiKey,/);
  assert.match(optionsSource, /const model =\s*providerKnown && typeof raw\.model === "string"/);
  assert.match(optionsSource, /autoOrganizeEnabled,/);
  assert.match(optionsSource, /function setButtonLabel\(button, label\)/);
  assert.match(optionsSource, /button\.title = safeLabel/);
  assert.match(optionsSource, /button\.setAttribute\("aria-label", safeLabel\)/);
  assert.match(optionsSource, /function setGrantAccessButtonState\(granted = false, options = \{\}\)/);
  assert.match(optionsSource, /grantAccessButton\.dataset\.granted = String\(isGranted\)/);
  assert.match(optionsSource, /grantAccessButton\.dataset\.accessNeeded = String\(accessNeeded\)/);
  assert.match(optionsSource, /setButtonLabel\(\s*grantAccessButton,[\s\S]*hostAccessNotNeededButton[\s\S]*hostAccessGrantedButton[\s\S]*hostAccessButton/);
  assert.match(optionsSource, /function syncPrimaryActionButtonLabels\(\)/);
  assert.match(optionsSource, /setButtonLabel\(saveButton, t\("saveButton"\)\)/);
  assert.match(optionsSource, /setButtonLabel\(resetButton, t\("resetButton"\)\)/);
  assert.match(optionsSource, /setButtonLabel\(privacyButton, t\("privacyButton"\)\)/);
  assert.match(optionsSource, /setButtonLabel\(testApiButton, t\("testApiButton"\)\)/);
  assert.match(optionsSource, /setButtonLabel\(createBackupButton, t\("createBackupNow"\)\)/);
  assert.match(optionsSource, /setGrantAccessButtonState\(grantAccessButton\.dataset\.granted === "true", \{/);
  assert.match(optionsSource, /accessNeeded: grantAccessButton\.dataset\.accessNeeded !== "false"/);
  assert.match(optionsSource, /function syncNavigationButtonLabels\(\)/);
  assert.match(optionsSource, /button\.querySelector\("\.nav-button__title"\)\?\.textContent/);
  assert.match(optionsSource, /button\.title = safeLabel/);
  assert.match(optionsSource, /button\.setAttribute\("aria-label", safeLabel\)/);
  assert.match(optionsSource, /const removeLabel = t\("whitelistRemoveDomain", \{ domain \}\)/);
  assert.match(optionsSource, /button\.title = removeLabel/);
  assert.match(optionsSource, /button\.setAttribute\("aria-label", removeLabel\)/);
  assert.match(optionsSource, /const actionLabel = t\(isSelected \? "whitelistRemoveDomainWithCount" : "whitelistAddDomainWithCount"/);
  assert.match(optionsSource, /button\.title = actionLabel/);
  assert.match(optionsSource, /button\.setAttribute\("aria-label", actionLabel\)/);
  assert.match(optionsSource, /button\.setAttribute\("aria-pressed", String\(isSelected\)\)/);
  assert.match(optionsSource, /const isSelected = selectedSet\.has\(item\.domain\)/);
  assert.match(optionsSource, /clearSettingsFieldIssues/);
  assert.match(optionsSource, /function clearSettingsFieldIssue\(fieldId\)/);
  assert.match(optionsSource, /clearSettingsFieldIssue\(targetId\)/);
  assert.match(optionsSource, /async function saveConfig\(event\) \{[\s\S]*clearSettingsFieldIssues\(\);[\s\S]*const config = collectFormData\(\)/);
  assert.match(optionsSource, /async function testApiConnection\(\) \{[\s\S]*clearSettingsFieldIssues\(\);[\s\S]*const config = collectFormData\(\)/);
  assert.match(optionsSource, /form\.querySelectorAll\("\[aria-invalid\]"\)/);
  assert.doesNotMatch(optionsSource, /querySelectorAll\("\[aria-invalid\], \[aria-describedby\]"\)/);
  assert.match(optionsSource, /getDescribedByTokens/);
  assert.match(optionsSource, /addDescribedByToken/);
  assert.match(optionsSource, /removeDescribedByTokens/);
  assert.match(optionsSource, /focusSettingsField/);
  assert.match(optionsSource, /markSettingsFieldIssue/);
  assert.match(optionsSource, /showApiTestIssue/);
  assert.match(optionsSource, /function showApiTestIssue\(message, fieldId = ""\) \{[\s\S]*setSaveBadge\(t\("saveBadgeFailed"\), "danger"\)[\s\S]*setApiTestStatus\(message, true\)/);
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
  assert.match(optionsSource, /setSaveBadge\(t\("saveBadgeLoadFailed"\), "danger"\)/);
  assert.match(optionsSource, /async function refreshBackupStatus\(reason = "manual refresh", options = \{\}\)/);
  assert.match(optionsSource, /Failed to refresh backup status after \$\{reason\}/);
  assert.match(optionsSource, /renderBackupLoadFailure\(t\("backupReadFailed"\), \{/);
  assert.match(optionsSource, /preserveActionStatus: options\.preserveActionStatus/);
  assert.match(optionsSource, /if \(!options\.preserveActionStatus \|\| !backupActionStatus\.textContent\.trim\(\)\)/);
  assert.match(optionsSource, /refreshBackupStatus\("manual backup", \{ preserveActionStatus: true \}\)/);
  assert.match(optionsSource, /refreshBackupStatus\("backup restore", \{ preserveActionStatus: true \}\)/);
  assert.match(optionsSource, /refreshBackupStatus\("backup delete", \{ preserveActionStatus: true \}\)/);
  assert.match(optionsSource, /refreshHostAccessStatus\(\)\.catch\(\(error\) => \{/);
  assert.match(optionsSource, /Failed to refresh host access status after config load/);
  assert.match(optionsSource, /hostAccessCheckingInFlight = false/);
  assert.match(optionsSource, /function renderHostAccessRefreshFailure\(message = t\("hostAccessRefreshFailed"\)\)/);
  assert.match(optionsSource, /setHostAccessStatus\(message, false\)/);
  assert.match(optionsSource, /setGrantAccessButtonState\(false\)/);
  assert.match(optionsSource, /setGrantAccessButtonState\(granted\)/);
  assert.doesNotMatch(optionsSource, /grantAccessButton\.textContent/);
  assert.match(optionsSource, /renderHostAccessRefreshFailure\(\)/);
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
  assert.match(optionsSource, /grantAccessButton\.disabled = settingsActionInFlight \|\| !accessNeeded \|\| granted \|\| hostAccessCheckingInFlight/);
  assert.match(optionsSource, /if \(settingsActionInFlight\) \{\n    return;\n  \}/);
  assert.match(optionsSource, /parseIntegerInput/);
  assert.match(optionsSource, /batchSize: parseIntegerInput\(batchSizeInput\.value\)/);
  assert.match(optionsSource, /autoOrganizeIntervalHours: parseIntegerInput\(autoOrganizeIntervalInput\.value\)/);
  assert.match(optionsSource, /if \(!config\.baseUrl\) \{[\s\S]*setHostAccessStatus/);
  assert.match(optionsSource, /setHostAccessStatus\(t\("baseUrlInvalid"\), false\)/);
  assert.match(optionsSource, /hostAccessRefreshVersion/);
  assert.match(optionsSource, /const refreshVersion = \+\+hostAccessRefreshVersion/);
  assert.match(optionsSource, /hostAccessCheckingInFlight = true/);
  assert.match(optionsSource, /hostAccessCheckingInFlight = false/);
  assert.match(optionsSource, /hostAccessChecking/);
  assert.match(optionsSource, /hostAccessNotNeeded/);
  assert.match(optionsSource, /hostAccessNotNeededAction/);
  assert.match(optionsSource, /setGrantAccessButtonState\(false, \{ accessNeeded: false \}\)/);
  assert.match(optionsSource, /hostAccessRefreshFailed/);
  assert.match(optionsSource, /refreshVersion !== hostAccessRefreshVersion/);
  assert.match(optionsSource, /showSettingsIssue\(t\("baseUrlRequired"\), "connection", "baseUrl"\)/);
  assert.match(optionsSource, /showSettingsIssue\(t\("baseUrlInvalid"\), "connection", "baseUrl"\)/);
  assert.match(optionsSource, /showSettingsIssue\(t\("modelRequired"\), "connection", "model"\)/);
  assert.match(optionsSource, /showSettingsIssue\(t\("batchSizeValidation"\), "organize", "batchSize"\)/);
  assert.match(optionsSource, /showSettingsIssue\(t\("autoIntervalValidation"\), "automation", "autoOrganizeIntervalHours"\)/);
  assert.match(optionsSource, /config\.autoOrganizeEnabled &&[\s\S]*shouldRequireModelAccess\(config\)[\s\S]*!defaults\.apiKeyOptional &&[\s\S]*!config\.apiKey/);
  assert.match(optionsSource, /showSettingsIssue\(t\("requiredApiKey", \{ provider: defaults\.label \}\), "connection", "apiKey"\)/);
  assert.match(optionsSource, /showApiTestIssue\(t\("baseUrlRequired"\), "baseUrl"\)/);
  assert.match(optionsSource, /showApiTestIssue\(t\("baseUrlInvalid"\), "baseUrl"\)/);
  assert.match(optionsSource, /showApiTestIssue\(t\("modelRequired"\), "model"\)/);
  assert.match(optionsSource, /showApiTestIssue\(t\("batchSizeValidation"\), "batchSize"\)/);
  assert.match(optionsSource, /showApiTestIssue\(t\("requiredApiKey", \{ provider: defaults\.label \}\), "apiKey"\)/);
  assert.match(optionsSource, /setSaveBadge\(t\("saveBadgeUnsaved"\), "accent"\);\n  setApiTestStatus\(t\("apiTesting"\)\)/);
  assert.match(optionsSource, /if \(!granted\) \{[\s\S]*setSaveBadge\(t\("saveBadgeFailed"\), "danger"\)[\s\S]*setApiTestStatus\(t\("currentApiAccessMissing"\), true\)/);
  assert.match(optionsSource, /if \(!response\?\.ok\) \{[\s\S]*setSaveBadge\(t\("saveBadgeFailed"\), "danger"\)[\s\S]*setApiTestStatus\(/);
  assert.match(optionsSource, /if \(!granted\) \{[\s\S]*setSaveBadge\(t\("saveBadgeFailed"\), "danger"\)[\s\S]*showSettingsIssue\(t\("autoOrganizePermission"\), "automation", "autoOrganizeEnabled"\)/);
  assert.match(optionsSource, /function shouldRequireModelAccess\(config\)/);
  assert.match(optionsSource, /if \(configToSave\.autoOrganizeEnabled\) \{[\s\S]*const granted = shouldRequireBroadHostAccess\(configToSave\)[\s\S]*ensureBroadHostAccess\(\)[\s\S]*shouldRequireModelAccess\(configToSave\)[\s\S]*ensureOriginAccess\(configToSave\.baseUrl\)[\s\S]*: true/);
  assert.match(optionsSource, /showSettingsIssue\(t\("autoOrganizePermission"\), "automation", "autoOrganizeEnabled"\)/);
  assert.match(optionsSource, /targetId === "baseUrl" \|\| targetId === "linkCheckMode"/);
  assert.match(optionsSource, /Base URL change/);
  assert.match(optionsSource, /speed mode change/);
  assert.match(optionsSource, /Failed to refresh host access status after reset/);
  assert.match(optionsSource, /Failed to refresh host access status after config load failure/);
  assert.match(optionsSource, /Failed to refresh host access status after provider change/);
  assert.match(optionsSource, /const providerChanged = nextProvider !== lastProvider/);
  assert.match(optionsSource, /const shouldClearApiKey = providerChanged && Boolean\(apiKeyInput\.value\.trim\(\)\)/);
  assert.match(optionsSource, /apiKeyInput\.value = ""/);
  assert.match(optionsSource, /setApiTestStatus\(t\("apiKeyClearedOnProviderChange"\)\)/);
  assert.match(optionsSource, /providerSelect\.addEventListener\("change"[\s\S]*markPending\(\);[\s\S]*refreshHostAccessStatus/);

  const backgroundSource = fs.readFileSync(path.join(ROOT_DIR, "background.js"), "utf8");
  assert.match(backgroundSource, /isValidHttpUrl/);
  assert.match(backgroundSource, /Base URL must be a valid http or https URL/);
  assert.match(backgroundSource, /const providerKnown = Boolean\(raw\.provider && Providers\.hasProvider\(raw\.provider\)\)/);
  assert.match(backgroundSource, /const apiKey = providerKnown && typeof raw\.apiKey === "string" \? raw\.apiKey\.trim\(\) : ""/);
  assert.match(backgroundSource, /const linkCheckMode = normalizeLinkCheckMode\(raw\.linkCheckMode \|\| defaults\.linkCheckMode\)/);
  assert.match(backgroundSource, /!shouldRequireModelAccess\(\{ linkCheckMode \}\) \|\| Boolean\(defaults\.apiKeyOptional \|\| apiKey\)/);
  assert.match(backgroundSource, /const baseUrl =\s*providerKnown && typeof raw\.baseUrl === "string"/);
  assert.match(backgroundSource, /const batchProfileConfig = \{ provider, baseUrl, model \}/);
  assert.match(backgroundSource, /batchSize: normalizeConfigBatchSize\(raw\.batchSize, batchProfileConfig, defaults\.batchSize\)/);
  assert.match(backgroundSource, /apiKey,/);
  assert.match(backgroundSource, /const model =\s*providerKnown && typeof raw\.model === "string"/);
  assert.match(backgroundSource, /autoOrganizeEnabled,/);
  assert.match(backgroundSource, /function shouldRequireModelAccess\(config = \{\}\)/);
  assert.match(backgroundSource, /if \(shouldRequireModelAccess\(config\) && !hasRequiredProviderCredential\(config\)\) \{[\s\S]*chrome\.alarms\.clear\(AUTO_ORGANIZE_ALARM_NAME\)/);
  assert.match(backgroundSource, /if \(shouldRequireModelAccess\(config\) && !\(await hasOriginAccess\(config\.baseUrl\)\)\) \{/);

  assert.match(optionsSource, /pendingBackupAction/);
  assert.match(optionsSource, /backupActionInFlight/);
  assert.match(optionsSource, /clearBackupErrorStatus/);
  assert.match(optionsSource, /if \(backupActionStatus\.classList\.contains\("is-error"\)\) \{/);
  assert.match(optionsSource, /setBackupActionStatus\(""\)/);
  assert.match(optionsSource, /function renderBackupLoadFailure\(message, options = \{\}\)/);
  assert.match(optionsSource, /getBackupRecordAccessibleName/);
  assert.match(optionsSource, /const restoreLabel = t\("backupRestoreRecordAria", \{ title: backupName \}\)/);
  assert.match(optionsSource, /restoreButton\.title = restoreLabel/);
  assert.match(optionsSource, /restoreButton\.setAttribute\("aria-label", restoreLabel\)/);
  assert.match(optionsSource, /const deleteLabel = t\("backupDeleteRecordAria", \{ title: backupName \}\)/);
  assert.match(optionsSource, /deleteButton\.title = deleteLabel/);
  assert.match(optionsSource, /deleteButton\.setAttribute\("aria-label", deleteLabel\)/);
  assert.match(optionsSource, /restoreButton\.setAttribute\("aria-describedby", backupActionStatus\.id\)/);
  assert.match(optionsSource, /deleteButton\.setAttribute\("aria-describedby", backupActionStatus\.id\)/);
  assert.match(optionsSource, /confirmButton\.setAttribute\("aria-describedby", backupActionStatus\.id\)/);
  assert.match(optionsSource, /backupConfirmRestoreRecordAria/);
  assert.match(optionsSource, /backupConfirmDeleteRecordAria/);
  assert.match(optionsSource, /backupCancelActionAria/);
  assert.match(optionsSource, /const confirmLabel =[\s\S]*backupConfirmRestoreRecordAria[\s\S]*backupConfirmDeleteRecordAria/);
  assert.match(optionsSource, /confirmButton\.title = confirmLabel/);
  assert.match(optionsSource, /confirmButton\.setAttribute\("aria-label", confirmLabel\)/);
  assert.match(optionsSource, /const cancelLabel = t\("backupCancelActionAria", \{ title: backupName \}\)/);
  assert.match(optionsSource, /cancelButton\.title = cancelLabel/);
  assert.match(optionsSource, /cancelButton\.setAttribute\("aria-label", cancelLabel\)/);
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
  assert.match(stylesSource, /\.field__hint--warm/);
  assert.match(stylesSource, /\.field__hint\[hidden\]/);
  assert.match(stylesSource, /\.field input\[aria-invalid="true"\]/);
  assert.match(stylesSource, /\.field select\[aria-invalid="true"\]/);
  assert.match(stylesSource, /\.field textarea\[aria-invalid="true"\]/);
  assert.match(stylesSource, /\.button\[aria-invalid="true"\]/);
  assert.match(stylesSource, /border-color: var\(--danger\)/);

  const i18nSource = fs.readFileSync(path.join(ROOT_DIR, "i18n.js"), "utf8");
  assert.match(i18nSource, /whitelistRemoveDomain/);
  assert.match(i18nSource, /whitelistAddDomainWithCount/);
  assert.match(i18nSource, /whitelistRemoveDomainWithCount/);
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
  assert.match(i18nSource, /A fresh snapshot of current bookmarks is created first/);
  assert.match(i18nSource, /恢复前会先为当前书签创建新快照/);
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
  assert.match(stylesSource, /body\.popup-body[\s\S]*width: min\(400px, 100vw\)/);
  assert.match(stylesSource, /\.popup-mode-bar[\s\S]*flex-wrap: wrap/);
  assert.match(stylesSource, /\.segmented-control[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(stylesSource, /\.segmented-control__button[\s\S]*min-width: 0/);
  assert.match(stylesSource, /@media \(max-width: 360px\)/);
  assert.match(stylesSource, /\.popup-shell \.topbar__actions--popup[\s\S]*position: static/);
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
  const readme = fs.readFileSync(path.join(ROOT_DIR, "README.md"), "utf8");
  const readmeZh = fs.readFileSync(path.join(ROOT_DIR, "README.zh-CN.md"), "utf8");
  assert.match(changelog, /without a second model request/);
  assert.match(changelog, /Fast\/Balanced\/Complete mode switch/);
  assert.match(changelog, /Balanced mode now skips dead-link scans/);
  assert.match(changelog, /built-in domain rules/);
  assert.match(changelog, /Backup failures before applying a saved preview/);
  assert.match(changelog, /only for explicit preview-apply failures/);
  assert.match(changelog, /runtime batches are capped to nine bookmarks/);
  assert.match(changelog, /three-bookmark model requests/);
  assert.match(changelog, /older 48-item settings/);
  assert.match(changelog, /warn inline before saving when a DeepSeek-compatible batch size will be capped/);
  assert.match(changelog, /DeepSeek-compatible endpoints/);
  assert.match(changelog, /up to three mini requests/);
  assert.match(changelog, /preview-time model calls, local Apply Plan rebuilds, and auto organize data flow/);
  assert.match(changelog, /same preview-first data-flow language/);
  assert.match(changelog, /Privacy page breadcrumb and section eyebrow labels/);
  assert.match(changelog, /i18n document applier now sets page language reliably/);
  assert.match(changelog, /Whitelist domain chips and catalog options/);
  assert.match(changelog, /Backup restore, delete, confirm, and cancel controls/);
  assert.match(changelog, /Popup unprocessed-item keep\/delete controls/);
  assert.match(changelog, /Popup primary, settings, backup, cancel, and apply-confirmation buttons/);
  assert.match(changelog, /Settings save, reset, privacy, API test, access, and manual backup buttons/);
  assert.match(changelog, /Popup Fast, Balanced, and Complete mode toggles/);
  assert.match(changelog, /Settings navigation tabs now expose localized hover tooltips/);
  assert.match(changelog, /Settings save and backup status badges/);
  assert.match(changelog, /Fast mode now finishes locally without waiting for the model/);
  assert.match(changelog, /Complete-mode site-access errors and duplicate cleanup suggestions/);
  assert.match(changelog, /DeepSeek-compatible runs now keep the same runtime provider label/);
  assert.match(changelog, /Popup preview checks now merge provider defaults/);
  assert.match(changelog, /Complete-mode preview no longer asks for broad website access/);
  assert.match(changelog, /missing job config no longer falls back to an OpenAI provider label/);
  assert.match(changelog, /mini-request timeouts now keep completed mini results/);
  assert.match(changelog, /Cancellation requests are now checked before each split slow-provider model request/);
  assert.match(changelog, /compact request\/output keys and a lower token budget/);
  assert.match(changelog, /inline confirmations and status messages/);
  assert.match(changelog, /preview and error states cannot mutate bookmarks/);
  assert.match(changelog, /raw numeric input/);
  assert.match(changelog, /fresh pre-restore snapshot/);
  assert.match(changelog, /keeps the saved configuration visible/);
  assert.match(changelog, /access-status refresh failures now restore controls/);
  assert.match(changelog, /clear stale backup error text/);
  assert.match(changelog, /Backup actions now preserve the completed action message/);
  assert.match(readme, /npm test/);
  assert.match(readme, /npm run package:webstore/);
  assert.match(readme, /Popup mode switch/);
  assert.match(readme, /built-in domain rules/);
  assert.match(readme, /unless Balanced\/Complete preview or enabled auto organize needs external access/);
  assert.match(readme, /manual-review fallback finish locally/);
  assert.match(readme, /Fast automatic organize can run locally without an API key/);
  assert.doesNotMatch(readme, /unless you start an organize run/);
  assert.match(readme, /restoring creates a fresh local snapshot first/);
  assert.match(readmeZh, /DeepSeek 兼容接口/);
  assert.match(readmeZh, /npm test/);
  assert.match(readmeZh, /npm run package:webstore/);
  assert.match(readmeZh, /弹窗模式切换/);
  assert.match(readmeZh, /内置域名规则/);
  assert.match(readmeZh, /待手动分类兜底会在本地完成/);
  assert.match(readmeZh, /快速自动整理可以不填 API Key 本地运行/);
  assert.match(readmeZh, /恢复前会先创建新的本地快照/);

  const releaseNotes = fs.readFileSync(
    path.join(ROOT_DIR, "webstore/RELEASE_NOTES_3.0.0.md"),
    "utf8"
  );
  assert.match(releaseNotes, /without another model request/);
  assert.match(releaseNotes, /Fast\/Balanced\/Complete mode switch/);
  assert.match(releaseNotes, /Balanced skips dead-link checks but keeps AI classification/);
  assert.match(releaseNotes, /built-in domain rules/);
  assert.match(releaseNotes, /unmatched bookmarks go to manual review/);
  assert.match(releaseNotes, /Fast automatic organize can now run locally without an API key/);
  assert.match(releaseNotes, /Balanced automatic organize requires model credentials/);
  assert.match(releaseNotes, /Backup failures before applying a saved preview/);
  assert.match(releaseNotes, /only for preview-apply failures/);
  assert.match(releaseNotes, /re-split large batches before each request/);
  assert.match(releaseNotes, /cap runtime batches at 9 bookmarks/);
  assert.match(releaseNotes, /cap each model request at 3 bookmarks/);
  assert.match(releaseNotes, /run up to three mini requests at a time/);
  assert.match(releaseNotes, /skip the separate taxonomy-planning request/);
  assert.match(releaseNotes, /finishes with local fallback/);
  assert.match(releaseNotes, /inline confirmations and status messages/);
  assert.match(releaseNotes, /preview and error states cannot mutate bookmarks/);
  assert.match(releaseNotes, /creates a fresh local snapshot/);
  assert.match(releaseNotes, /keeps the saved connection visible/);
  assert.match(releaseNotes, /Access-status refresh failures now restore controls/);
  assert.match(releaseNotes, /clear stale backup error text/);
  assert.match(releaseNotes, /preserve the completed action message/);
  assert.match(releaseNotes, /silently clamping invalid values/);

  const historicalReleaseNotes = fs.readFileSync(
    path.join(ROOT_DIR, "webstore/RELEASE_NOTES_1.3.0.md"),
    "utf8"
  );
  assert.match(historicalReleaseNotes, /Marko 1\.3\.0 Release Notes/);
  assert.doesNotMatch(historicalReleaseNotes, /Smart Bookmark AI/);

  const storeListing = fs.readFileSync(path.join(ROOT_DIR, "webstore/STORE_LISTING.md"), "utf8");
  assert.match(storeListing, /without calling the model again/);
  assert.match(storeListing, /changed directly in the popup/);
  assert.match(storeListing, /Balanced keeps AI classification without website scans/);
  assert.match(storeListing, /built-in domain rules/);
  assert.match(storeListing, /Backup failures before applying a saved preview/);
  assert.match(storeListing, /only after a preview-apply failure/);
  assert.match(storeListing, /re-split large batches before each request/);
  assert.match(storeListing, /cap runtime batches at 9 bookmarks/);
  assert.match(storeListing, /cap each model request at 3 bookmarks/);
  assert.match(storeListing, /run up to three mini requests at a time/);
  assert.match(storeListing, /skip the separate taxonomy-planning request/);
  assert.match(storeListing, /finishes with local fallback/);
  assert.match(storeListing, /OpenAI、DeepSeek、MiniMax、Anthropic/);
  assert.match(storeListing, /OpenAI, DeepSeek, MiniMax, Anthropic/);
  assert.match(storeListing, /inline confirmations and validation feedback/);
  assert.match(storeListing, /read-only until an organize\/apply run completes/);
  assert.match(storeListing, /fresh pre-restore snapshot/);
  assert.match(storeListing, /keeps saved connection fields visible/);
  assert.match(storeListing, /Access-status refresh failures restore controls/);
  assert.match(storeListing, /clear stale error text/);
  assert.match(storeListing, /Backup action successes stay visible/);
  assert.match(storeListing, /Popup inline apply confirmation/);
  assert.match(storeListing, /Backup management with inline restore confirmation/);

  const storeAssetRenderer = fs.readFileSync(
    path.join(ROOT_DIR, "webstore/render_store_assets.mjs"),
    "utf8"
  );
  assert.match(storeAssetRenderer, /batchSize: 9/);
  assert.match(storeAssetRenderer, /currentBatch: 18/);
  assert.match(storeAssetRenderer, /totalBatches: 18/);

  const reviewNotes = fs.readFileSync(path.join(ROOT_DIR, "webstore/REVIEW_NOTES.md"), "utf8");
  assert.match(reviewNotes, /复用已保存方案/);
  assert.match(reviewNotes, /平衡\/完整模式预览或已开启自动整理且本地规则、缓存无法覆盖/);
  assert.match(reviewNotes, /平衡模式会跳过失效链接检测和单独目录规划请求，但保留 AI 分类/);

  const webstorePrivacyPolicy = fs.readFileSync(
    path.join(ROOT_DIR, "webstore/PRIVACY_POLICY.md"),
    "utf8"
  );
  assert.match(webstorePrivacyPolicy, /最后更新：2026-05-31/);
  assert.match(webstorePrivacyPolicy, /模型服务商、Base URL、模型名/);
  assert.match(webstorePrivacyPolicy, /较快服务商可能会在分类前额外生成全局目录方案/);
  assert.match(webstorePrivacyPolicy, /应用已保存的预览方案会直接本地重建，不会再次请求模型/);
  assert.match(webstorePrivacyPolicy, /快速模式会在预览和整理流程中跳过失效链接检测、单独目录规划请求和模型分类/);
  assert.match(webstorePrivacyPolicy, /平衡模式可以使用模型分类，但不会直接访问书签对应的网站做链接检测/);
  assert.match(webstorePrivacyPolicy, /完整模式会直接访问书签对应的网站/);
  assert.match(webstorePrivacyPolicy, /恢复旧备份前也会先为当前书签状态创建本地快照/);

  const publishChecklist = fs.readFileSync(
    path.join(ROOT_DIR, "webstore/PUBLISH_CHECKLIST.md"),
    "utf8"
  );
  assert.match(publishChecklist, /不会再次请求模型/);
  assert.match(publishChecklist, /自动整理重建前都会自动备份/);
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

function testI18nApplyDocumentRobustness() {
  const zhI18n = loadI18nForLanguage("zh-CN");
  assert.doesNotThrow(() => zhI18n.applyDocument());

  const textNode = {
    dataset: { i18n: "privacyMainTitle" },
    textContent: ""
  };
  const placeholderNode = {
    dataset: { i18nPlaceholder: "placeholderModel" },
    placeholder: ""
  };
  const ariaNode = {
    dataset: { i18nAriaLabel: "progressAriaLabel" },
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  };
  const titleNode = {
    dataset: { i18n: "privacyPageTitle" },
    textContent: ""
  };
  const fakeDocument = {
    documentElement: { lang: "en" },
    querySelectorAll(selector) {
      return {
        "[data-i18n]": [textNode],
        "[data-i18n-placeholder]": [placeholderNode],
        "[data-i18n-aria-label]": [ariaNode]
      }[selector] || [];
    },
    querySelector(selector) {
      return selector === "title[data-i18n]" ? titleNode : null;
    }
  };

  zhI18n.applyDocument(fakeDocument);
  assert.equal(fakeDocument.documentElement.lang, "zh-CN");
  assert.equal(textNode.textContent, "隐私说明");
  assert.equal(placeholderNode.placeholder, "例如：gpt-4.1-mini");
  assert.equal(ariaNode.attributes["aria-label"], "整理进度");
  assert.equal(titleNode.textContent, "Marko - 隐私说明");

  const ownerDocument = { documentElement: { lang: "en" } };
  const partialRoot = {
    ownerDocument,
    querySelectorAll() {
      return [];
    }
  };
  assert.doesNotThrow(() => zhI18n.applyDocument(partialRoot));
  assert.equal(ownerDocument.documentElement.lang, "zh-CN");
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
  testI18nApplyDocumentRobustness();
  console.log("All tests passed.");
}

main();
