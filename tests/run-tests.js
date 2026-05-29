const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const JsonUtils = require("../json-utils.js");
const Rules = require("../rules.js");
const CacheUtils = require("../cache-utils.js");

const ROOT_DIR = path.resolve(__dirname, "..");

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
  assert.match(privacyPolicy, /Fast mode skips dead-link checks/);
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

  const popupSource = fs.readFileSync(path.join(ROOT_DIR, "popup.js"), "utf8");
  assert.match(popupSource, /APPLY_PREVIEW_PLAN/);
  assert.match(popupSource, /applyConfirmationVisible/);
  assert.match(popupSource, /createApplyConfirmationState/);
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
  assert.match(backgroundSource, /first-response-timeout\|request-timeout/);
}

function testOptionsBackupInlineConfirmationSurface() {
  const optionsHtml = fs.readFileSync(path.join(ROOT_DIR, "options.html"), "utf8");
  assert.match(optionsHtml, /id="backupActionStatus"/);

  const optionsSource = fs.readFileSync(path.join(ROOT_DIR, "options.js"), "utf8");
  assert.match(optionsSource, /pendingBackupAction/);
  assert.match(optionsSource, /createBackupInlineConfirm/);
  assert.doesNotMatch(optionsSource, /window\.confirm/);

  const stylesSource = fs.readFileSync(path.join(ROOT_DIR, "styles.css"), "utf8");
  assert.match(stylesSource, /\.backup-confirm/);

  const i18nSource = fs.readFileSync(path.join(ROOT_DIR, "i18n.js"), "utf8");
  assert.match(i18nSource, /backupRestoreInlineConfirm/);
  assert.match(i18nSource, /backupDeleteInlineConfirm/);
  assert.doesNotMatch(i18nSource, /backupRestoreConfirm/);
  assert.doesNotMatch(i18nSource, /backupDeleteConfirm/);
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
  testI18nCoverage();
  console.log("All tests passed.");
}

main();
