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
  "webstore/audit_ui_layout.mjs",
  "webstore/build_extension_package.mjs",
  "webstore/e2e_extension.mjs",
  "webstore/render_store_assets.mjs",
  "webstore/verify_release.mjs"
];

function readPngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  assert.equal(buffer.toString("ascii", 1, 4), "PNG", `${filePath} is not a PNG`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function sliceSourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Source is missing ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Source is missing ${end}`);
  return source.slice(startIndex, endIndex);
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

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function normalizeFallbackText(value) {
  return decodeHtmlEntities(value)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function collectLocalMarkdownReferences(markdownFile) {
  const source = fs.readFileSync(path.join(ROOT_DIR, markdownFile), "utf8");
  const refs = new Set();
  const collect = (value) => {
    const target = String(value || "").split("#")[0].split("?")[0];
    if (!target || /^(?:https?:|mailto:|chrome:|data:)/i.test(target)) {
      return;
    }
    refs.add(target);
  };

  for (const match of source.matchAll(/!?\[[^\]]*]\(([^)]+)\)/g)) {
    collect(match[1]);
  }
  for (const match of source.matchAll(/<(?:a|img)\b[^>]*(?:href|src)="([^"]+)"/g)) {
    collect(match[1]);
  }

  return Array.from(refs).sort();
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
  assert.equal(packageJson.scripts?.["audit:ui"], "node webstore/audit_ui_layout.mjs");
  assert.equal(packageJson.scripts?.["e2e:extension"], "node webstore/e2e_extension.mjs");
  assert.equal(packageJson.scripts?.["install:e2e-browser"], "playwright-core install chromium");
  assert.equal(packageJson.scripts?.["render:store-assets"], "node webstore/render_store_assets.mjs");
  assert.equal(packageJson.scripts?.["verify:release"], "node webstore/verify_release.mjs");
  assert.equal(packageJson.scripts?.["verify:release:full"], "npm run verify:release && npm run e2e:extension");
  assert.equal(packageJson.scripts?.["package:webstore"], "node webstore/build_extension_package.mjs");
  assert.equal(packageJson.dependencies, undefined);
  assert.deepEqual(Object.keys(packageJson.devDependencies || {}), ["playwright-core"]);

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

function testReadmeLocalReferences() {
  for (const markdownFile of ["README.md", "README.zh-CN.md"]) {
    const markdownDir = path.dirname(path.join(ROOT_DIR, markdownFile));
    const refs = collectLocalMarkdownReferences(markdownFile);
    assert.ok(refs.length > 0, `${markdownFile} should contain local links or images`);

    for (const ref of refs) {
      const targetPath = path.resolve(markdownDir, decodeURIComponent(ref));
      assert.equal(
        fs.existsSync(targetPath),
        true,
        `${markdownFile} references missing local file or directory: ${ref}`
      );
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
  assert.match(optionsHtml, /id="linkCheckMode"[\s\S]*type="hidden"[\s\S]*value="fast"/);
  assert.match(optionsHtml, /data-settings-speed-mode="fast"/);
  assert.match(optionsHtml, /data-settings-speed-mode="balanced"/);
  assert.match(optionsHtml, /data-settings-speed-mode="complete"/);
  assert.doesNotMatch(optionsHtml, /<select id="linkCheckMode"/);

  const optionsSource = fs.readFileSync(path.join(ROOT_DIR, "options.js"), "utf8");
  assert.match(optionsSource, /linkCheckMode/);
  assert.match(optionsSource, /renderLinkCheckModeButtons/);
  assert.match(optionsSource, /setLinkCheckMode/);
  assert.match(optionsSource, /LINK_CHECK_MODE_FAST/);
  assert.match(optionsSource, /LINK_CHECK_MODE_BALANCED/);
  assert.match(optionsSource, /LINK_CHECK_MODE_COMPLETE/);

  const backgroundSource = fs.readFileSync(path.join(ROOT_DIR, "background.js"), "utf8");
  assert.match(backgroundSource, /shouldCheckDeadLinks/);
  assert.match(backgroundSource, /buildSkippedDeadLinkScanResult/);
  assert.match(backgroundSource, /DEAD_LINK_CHECK_TIMEOUT_MS = 6_000/);
  assert.match(backgroundSource, /DEAD_LINK_SCAN_CONCURRENCY = 8/);
  assert.match(backgroundSource, /left for review; only confirmed dead links/);
  assert.match(backgroundSource, /Cannot generate a Complete preview without site access/);
  assert.match(backgroundSource, /previewing Complete mode/);
  assert.match(backgroundSource, /Failed to clean legacy AI organizer root folders/);
  assert.doesNotMatch(backgroundSource, /Cannot start organizing without site access/);
  assert.doesNotMatch(backgroundSource, /Failed to clean forbidden Smart Bookmark root folders/);

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

function testRuntimeBrandingSurface() {
  const runtimeFiles = [
    "background.js",
    "popup.js",
    "options.js",
    "i18n.js",
    "privacy.html",
    "_locales/en/messages.json",
    "_locales/zh_CN/messages.json"
  ];
  const oldBrandPattern = /Smart Bookmark AI|Smart Bookmark|TidyMarks AI|TidyMarks/;
  const backgroundSource = fs.readFileSync(path.join(ROOT_DIR, "background.js"), "utf8");
  assert.match(
    backgroundSource,
    /const LEGACY_ROOT_FOLDERS = \["Smart Bookmark AI", "TidyMarks AI"\];/
  );

  for (const file of runtimeFiles) {
    const source = fs
      .readFileSync(path.join(ROOT_DIR, file), "utf8")
      .replace(/const LEGACY_ROOT_FOLDERS = \[[^\n]+\];/, "");
    assert.doesNotMatch(source, oldBrandPattern, `${file} should not expose old product names`);
  }
}

function testFirstRunFastDefaults() {
  const optionsHtml = fs.readFileSync(path.join(ROOT_DIR, "options.html"), "utf8");
  const autoOrganizeInput = optionsHtml.match(/<input[^>]*id="autoOrganizeEnabled"[^>]*>/)?.[0] || "";
  assert.match(optionsHtml, /id="linkCheckMode"[\s\S]*type="hidden"[\s\S]*value="fast"/);
  assert.match(autoOrganizeInput, /type="checkbox"/);
  assert.match(autoOrganizeInput, /role="switch"/);
  assert.doesNotMatch(autoOrganizeInput, /\bchecked\b/);

  const backgroundSource = fs.readFileSync(path.join(ROOT_DIR, "background.js"), "utf8");
  const optionsSource = fs.readFileSync(path.join(ROOT_DIR, "options.js"), "utf8");
  const popupSource = fs.readFileSync(path.join(ROOT_DIR, "popup.js"), "utf8");

  const backgroundDefaultBlock = sliceSourceBetween(
    backgroundSource,
    'function buildDefaultConfig(provider = "openai")',
    "function mergeConfig(raw = {})"
  );
  const optionsDefaultBlock = sliceSourceBetween(
    optionsSource,
    'function buildDefaultConfig(provider = "openai")',
    "function mergeConfig(raw = {})"
  );

  for (const defaultBlock of [backgroundDefaultBlock, optionsDefaultBlock]) {
    assert.match(defaultBlock, /provider,/);
    assert.match(defaultBlock, /linkCheckMode: LINK_CHECK_MODE_FAST,/);
    assert.match(defaultBlock, /autoOrganizeEnabled: false,/);
    assert.match(defaultBlock, /autoOrganizeIntervalHours: 24,/);
    assert.doesNotMatch(defaultBlock, /LINK_CHECK_MODE_BALANCED|LINK_CHECK_MODE_COMPLETE/);
    assert.doesNotMatch(defaultBlock, /autoOrganizeEnabled: true/);
  }

  const initializeDefaultsBlock = sliceSourceBetween(
    backgroundSource,
    "async function initializeDefaults()",
    "async function bootstrapState()"
  );
  const bootstrapStateBlock = sliceSourceBetween(
    backgroundSource,
    "async function bootstrapState()",
    "async function syncBackupRecordsForBootstrap()"
  );
  assert.match(initializeDefaultsBlock, /\[STORAGE_KEYS\.config\]: buildDefaultConfig\("openai"\)/);
  assert.match(bootstrapStateBlock, /\[STORAGE_KEYS\.config\]: buildDefaultConfig\("openai"\)/);

  const backgroundMergeBlock = sliceSourceBetween(
    backgroundSource,
    "function mergeConfig(raw = {})",
    "function shouldPersistNormalizedConfig"
  );
  const optionsMergeBlock = sliceSourceBetween(
    optionsSource,
    "function mergeConfig(raw = {})",
    "function normalizeWhitelistDomain"
  );
  for (const mergeBlock of [backgroundMergeBlock, optionsMergeBlock]) {
    assert.match(mergeBlock, /const provider = providerKnown \? raw\.provider : "openai"/);
    assert.match(mergeBlock, /const defaults = buildDefaultConfig\(provider\)/);
    assert.match(mergeBlock, /const linkCheckMode = normalizeLinkCheckMode\(raw\.linkCheckMode \|\| defaults\.linkCheckMode\)/);
    assert.match(mergeBlock, /const autoOrganizeEnabled =\s*Boolean\(raw\.autoOrganizeEnabled\) &&/);
  }

  const popupNormalizeBlock = sliceSourceBetween(
    popupSource,
    "function normalizeLinkCheckMode(rawValue)",
    "function mergePopupConfig(raw = {})"
  );
  const popupMergeBlock = sliceSourceBetween(
    popupSource,
    "function mergePopupConfig(raw = {})",
    "async function ensureOrganizeAccess"
  );
  assert.match(popupNormalizeBlock, /: LINK_CHECK_MODE_FAST/);
  assert.match(popupMergeBlock, /const provider = providerKnown \? raw\.provider : "openai"/);
  assert.match(popupMergeBlock, /linkCheckMode: normalizeLinkCheckMode\(raw\.linkCheckMode\)/);
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
  assert.match(backgroundSource, /buildPreservedBookmarkSetSignature/);
  assert.match(backgroundSource, /buildPreviewSourceBookmarkSignature/);
  assert.match(backgroundSource, /buildPreviewSourceBookmarkSignature\(\s*bookmarkState\.bookmarks,\s*bookmarkState\.preservedBookmarks\s*\)/);
  assert.match(backgroundSource, /sourceBookmarkSignature: buildPreviewSourceBookmarkSignature\(job\.bookmarks, job\.preservedBookmarks\)/);
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
  assert.match(backgroundSource, /whitelist-preserved bookmarks no longer match the preview/);
  assert.match(backgroundSource, /normalizePreviewPlanBatchSize/);
  assert.match(backgroundSource, /const batchSize = normalizePreviewPlanBatchSize\(previewPlan\.batchSize, config\.batchSize\)/);
  assert.match(backgroundSource, /ux\("模型名称不能为空。", "Model Name is required\."\)/);
  assert.doesNotMatch(backgroundSource, /ux\("Model Name 不能为空。"/);
  assert.match(backgroundSource, /getBookmarkById/);
  assert.match(backgroundSource, /Stale unprocessed record removed/);
  assert.match(backgroundSource, /adjustPreviewFoldersForResolvedUnprocessedEntry/);
  assert.match(backgroundSource, /previewFolders: shouldRemoveManualPreviewCount/);
  assert.match(backgroundSource, /folder\?\.title === MANUAL_FOLDER_TITLE/);
  assert.match(backgroundSource, /currentStatus\?\.phase !== "completed"/);
  assert.match(backgroundSource, /Apply and finish the organize plan before handling unprocessed items/);
  assert.match(backgroundSource, /before generating a preview/);
  assert.doesNotMatch(backgroundSource, /whitelist that site before organizing/);
  assert.match(backgroundSource, /existingBookmark\.id/);
  assert.match(backgroundSource, /Pre-restore backup failed/);
  assert.match(backgroundSource, /createCurrentSnapshotBackup\(bookmarkBarNode, "manual", \{ preserveIds: \[backupId\] \}\)/);
  assert.match(backgroundSource, /for \(const child of currentChildren\) \{[\s\S]*if \(isBackupFolderNode\(child\)\) \{[\s\S]*continue;[\s\S]*\}/);
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
  assert.match(popupSource, /function setPopupActionInFlight\(inFlight, message = "", options = \{\}\)/);
  assert.match(popupSource, /else if \(!options\.preserveStatus\) \{/);
  assert.match(popupSource, /setPopupActionStatus/);
  assert.match(popupSource, /popupRefreshFailureVisible/);
  assert.match(popupSource, /popupRefreshFailedStatus/);
  assert.match(popupSource, /renderPopupRefreshFailure/);
  assert.match(popupSource, /async function refreshAllSafely\(reason = "refresh"\)/);
  assert.match(popupSource, /async function refreshAllBeforeActionFeedback\(reason = "action feedback"\)/);
  assert.match(popupSource, /async function refreshAllAfterActionSuccess\(reason = "action success"\)/);
  assert.match(popupSource, /return true;\n  \} catch \(error\) \{\n    renderPopupRefreshFailure\(error, reason\);\n    return false;/);
  assert.match(popupSource, /renderPopupRefreshFailure\(error, reason\)/);
  assert.match(popupSource, /refreshAllBeforeActionFeedback\("apply preview error"\)/);
  assert.match(popupSource, /refreshAllBeforeActionFeedback\("preview permission denial"\)/);
  assert.match(popupSource, /refreshAllBeforeActionFeedback\("manual backup error"\)/);
  assert.match(popupSource, /refreshAllAfterActionSuccess\("speed mode update"\)/);
  assert.match(popupSource, /refreshAllAfterActionSuccess\("cancel and switch fast success"\)/);
  assert.match(popupSource, /if \(refreshed\) \{\n      setPopupActionStatus\(t\("popupSpeedModeSavedStatus"\)\);/);
  assert.match(popupSource, /preserveActionStatus = !\(await refreshAllAfterActionSuccess\("apply preview success"\)\)/);
  assert.match(popupSource, /preserveActionStatus = !\(await refreshAllAfterActionSuccess\("preview start success"\)\)/);
  assert.match(popupSource, /preserveActionStatus = !\(await refreshAllAfterActionSuccess\("manual backup success"\)\)/);
  assert.match(popupSource, /preserveActionStatus = !\(await refreshAllAfterActionSuccess\("unprocessed item success"\)\)/);
  assert.match(popupSource, /preserveActionStatus = !\(await refreshAllAfterActionSuccess\("cancel job success"\)\)/);
  assert.match(popupSource, /if \(popupRefreshFailureVisible\) \{\n      setPopupActionStatus\(""\)/);
  assert.match(popupSource, /void refreshAllSafely\("visibilitychange"\)/);
  assert.match(popupSource, /refreshAllSafely\("initial load"\)\.then/);
  assert.match(popupSource, /void refreshAllSafely\("timer"\)/);
  assert.match(popupSource, /const STATE_REFRESH_INTERVAL_MS = 5_000/);
  assert.match(popupSource, /const PROGRESS_CLOCK_INTERVAL_MS = 1_000/);
  assert.match(popupSource, /const STALE_STATUS_THRESHOLD_MS = 45_000/);
  assert.match(popupSource, /let progressClockTimer = null/);
  assert.match(popupSource, /let staleStatusNoticeVisible = false/);
  assert.match(popupSource, /function syncProgressClock\(\)/);
  assert.match(popupSource, /function syncStaleStatusNotice\(\)/);
  assert.match(popupSource, /currentStatus\?\.phase === "running" && document\.visibilityState !== "hidden"/);
  assert.match(popupSource, /renderStatus\(currentStatus\)/);
  assert.match(popupSource, /}, PROGRESS_CLOCK_INTERVAL_MS\)/);
  assert.match(popupSource, /}, STATE_REFRESH_INTERVAL_MS\)/);
  assert.match(popupSource, /stopProgressClock\(\)/);
  assert.doesNotMatch(popupSource, /refreshAll\(\)\.catch\(console\.error\)/);
  assert.match(popupSource, /getOptionsSectionUrl/);
  assert.match(popupSource, /options\.html#\$\{safeSection\}/);
  assert.match(popupSource, /chrome\.tabs\?\.create/);
  assert.match(popupSource, /chrome\.runtime\?\.openOptionsPage/);
  assert.match(popupSource, /throw new Error\(t\("popupOpenSettingsFailed"\)\)/);
  assert.match(popupSource, /async function openOptionsSectionSafely\(sectionId = "connection"\)/);
  assert.match(popupSource, /setPopupActionStatus\(t\("popupOpenSettingsFailed"\), \{ isError: true \}\)/);
  assert.match(popupSource, /openOptionsSectionSafely\("connection"\)/);
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
  assert.match(popupSource, /popupCancellingToFastStatus/);
  assert.match(popupSource, /popupCancelledToFastStatus/);
  assert.match(popupSource, /popupCancelToFastFailedStatus/);
  assert.match(popupSource, /speedModeButtons/);
  assert.match(popupSource, /normalizeLinkCheckMode/);
  assert.match(popupSource, /async function persistPopupSpeedMode/);
  assert.match(popupSource, /async function updatePopupSpeedMode/);
  assert.match(popupSource, /const storedConfig = mergePopupConfig\(stored\[CONFIG_KEY\] \|\| currentConfig \|\| \{\}\)/);
  assert.doesNotMatch(popupSource, /const storedConfig = stored\[CONFIG_KEY\] \|\| currentConfig/);
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
  assert.match(popupSource, /let popupReady = false/);
  assert.match(popupSource, /const isInitializing = !popupReady/);
  assert.match(popupSource, /popupReady = true/);
  assert.match(popupSource, /startButton\.disabled = isInitializing \|\| popupActionInFlight \|\| isRunning/);
  assert.match(popupSource, /backupButton\.disabled = isInitializing \|\| popupActionInFlight \|\| isRunning/);
  assert.match(popupSource, /button\.disabled = isInitializing \|\| popupActionInFlight \|\| isRunning/);
  assert.match(popupSource, /const isCancelling = Boolean\(currentStatus\?\.cancelRequested\)/);
  assert.match(popupSource, /cancelButton\.disabled = isInitializing \|\| popupActionInFlight \|\| !isRunning \|\| isCancelling/);
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
  assert.match(popupSource, /renderPopupActionError\(t\("startJobException"\)\)/);
  assert.match(popupSource, /renderResponseError/);
  assert.match(popupSource, /function renderPopupActionError\(message, detail = ""\)/);
  assert.match(popupSource, /setPopupActionStatus\(message, \{ isError: true \}\)/);
  assert.match(popupSource, /renderPopupActionError\(response\?\.error \|\| fallbackMessage, response\?\.detail \|\| ""\)/);
  assert.match(popupSource, /preserveActionStatus = true/);
  assert.match(popupSource, /setPopupActionInFlight\(false, "", \{ preserveStatus: preserveActionStatus \}\)/);
  assert.match(popupSource, /phase: "error",\n    message,\n    detail/);
  assert.match(popupSource, /progressTrack\.setAttribute\("aria-valuenow", String\(progress\)\)/);
  assert.match(popupSource, /currentStatus\?\.detail \|\|/);
  assert.match(popupSource, /managedFolderLoadFailed/);
  assert.match(popupSource, /createManagedFolderLoadFailureState/);
  assert.match(popupSource, /managedFolderLoadFailed = false/);
  assert.match(popupSource, /managedFolderLoadFailed = loadFailed/);
  assert.match(popupSource, /wrapper\.appendChild\(createManagedFolderLoadFailureState\(\)\)/);
  assert.match(popupSource, /applyButton\.disabled = true/);
  assert.match(popupSource, /cancelButton\.disabled = true/);
  assert.match(popupSource, /hasPreviewAttemptConfig/);
  assert.match(popupSource, /Providers\?\.hasProvider\?\.\(config\.provider\)/);
  assert.match(popupSource, /if \(!shouldRequireModelAccess\(config\)\) \{[\s\S]*return true;[\s\S]*\}/);
  assert.match(popupSource, /if \(!shouldRequireModelAccess\(config\)\) \{[\s\S]*return t\("setupRequiredDesc"\);[\s\S]*\}/);
  assert.match(popupSource, /shouldRequireModelAccess\(config\) && !provider\?\.apiKeyOptional && !config\?\.apiKey/);
  assert.match(popupSource, /shouldRequireModelAccess\(currentConfig\) && !hasModelAccessConfig\(currentConfig\)/);
  assert.match(popupSource, /function mergePopupConfig\(raw = \{\}\)/);
  assert.match(popupSource, /baseUrl:[\s\S]*defaults\.baseUrl \|\| ""/);
  assert.match(popupSource, /model:[\s\S]*defaults\.model \|\| ""/);
  assert.match(popupSource, /currentConfig = mergePopupConfig\(stored\[CONFIG_KEY\] \|\| \{\}\)/);
  assert.match(popupSource, /hasModelAccessConfig/);
  assert.match(popupSource, /CHECK_LOCAL_MODEL_REQUIREMENT/);
  assert.match(popupSource, /localRequirementCheckId: requirement\.checkId \|\| ""/);
  assert.match(popupSource, /chrome\.storage\.local\.get\(\[CONFIG_KEY, STATUS_KEY, PREVIEW_PLAN_KEY\]\)/);
  assert.match(popupSource, /requirement\.needsModel \|\| requirement\.requiresBroadHostAccess/);
  assert.match(popupSource, /const aiCandidateCount = Number\(requirement\.aiCandidateCount \|\| 0\)/);
  assert.match(popupSource, /error: getSetupProblem\(currentConfig\)/);
  assert.match(popupSource, /modelAccessRequiredForUncachedPreviewWithCount/);
  assert.match(popupSource, /modelAccessRequiredForUncachedPreview/);
  assert.match(popupSource, /async function createManualBackup\(\) \{\n  setPopupActionInFlight\(true, t\("popupCreatingBackupStatus"\)\);/);
  assert.match(popupSource, /async function cancelJob\(\) \{\n  setPopupActionInFlight\(true, t\("popupCancellingStatus"\)\);/);
  assert.match(popupSource, /async function cancelAndSwitchToFastMode\(\) \{\n  setPopupActionInFlight\(true, t\("popupCancellingToFastStatus"\)\);/);
  assert.match(popupSource, /chrome\.runtime\.sendMessage\(\{ type: "CANCEL_JOB" \}\)/);
  assert.match(popupSource, /await persistPopupSpeedMode\(LINK_CHECK_MODE_FAST\)/);
  assert.match(popupSource, /setPopupActionStatus\(t\("popupCancelledToFastStatus"\)\)/);
  assert.match(popupSource, /const recordTitle = entry\.title \|\| t\("untitledBookmark"\)/);
  assert.match(popupSource, /const keepLabel = t\("keepBookmarkAria", \{ title: recordTitle \}\)/);
  assert.match(popupSource, /keepButton\.title = keepLabel/);
  assert.match(popupSource, /keepButton\.setAttribute\("aria-label", keepLabel\)/);
  assert.match(popupSource, /const deleteLabel = t\("deleteBookmarkAria", \{ title: recordTitle \}\)/);
  assert.match(popupSource, /deleteButton\.title = deleteLabel/);
  assert.match(popupSource, /deleteButton\.setAttribute\("aria-label", deleteLabel\)/);
  assert.match(popupSource, /keepButton\.setAttribute\("aria-describedby", popupActionStatus\.id\)/);
  assert.match(popupSource, /deleteButton\.setAttribute\("aria-describedby", popupActionStatus\.id\)/);
  assert.match(popupSource, /keepButton\.dataset\.unprocessedActionButton = "keep"/);
  assert.match(popupSource, /deleteButton\.dataset\.unprocessedActionButton = "delete"/);
  assert.match(popupSource, /detailPanel\.querySelectorAll\("\[data-unprocessed-action-button\]"\)/);
  assert.match(popupSource, /button\.disabled = popupActionInFlight \|\| isRunning/);
  assert.match(popupSource, /detailPanel\.querySelectorAll\("\[data-stale-status-cancel-button\]"\)/);
  assert.match(popupSource, /button\.disabled = popupActionInFlight \|\| !isRunning \|\| isCancelling/);
  assert.match(popupSource, /detailPanel\.querySelectorAll\("\[data-stale-status-fast-button\]"\)/);
  assert.match(popupSource, /const lockEntryActions = \(\) => \{\n        keepButton\.disabled = true;\n        deleteButton\.disabled = true;/);
  assert.match(popupSource, /keepButton\.addEventListener\("click", \(\) => \{\n        if \(popupActionInFlight\) \{/);
  assert.match(popupSource, /deleteButton\.addEventListener\("click", \(\) => \{\n        if \(popupActionInFlight\) \{/);
  assert.match(popupSource, /renderPopupActionError\(t\("keepError"\)\)/);
  assert.match(popupSource, /renderPopupActionError\(t\("deleteUnprocessedError"\)\)/);
  assert.doesNotMatch(popupSource, /START_ORGANIZE/);
  assert.doesNotMatch(popupSource, /window\.confirm/);

  const popupHtml = fs.readFileSync(path.join(ROOT_DIR, "popup.html"), "utf8");
  assert.match(popupHtml, /id="startButton"[\s\S]*aria-describedby="popupActionStatus"[\s\S]*disabled/);
  assert.match(popupHtml, /id="backupButton"[\s\S]*aria-describedby="popupActionStatus"[\s\S]*disabled/);
  assert.match(popupHtml, /data-i18n="backupButton"[\s\S]*Backup Now/);
  assert.match(popupHtml, /id="cancelButton"[\s\S]*aria-describedby="popupActionStatus"[\s\S]*hidden[\s\S]*disabled/);
  assert.match(popupHtml, /class="popup-mode-bar"[\s\S]*aria-labelledby="popupSpeedModeLabel"/);
  assert.match(popupHtml, /role="radiogroup"[\s\S]*aria-labelledby="popupSpeedModeLabel"/);
  assert.match(popupHtml, /role="radiogroup"[\s\S]*aria-orientation="horizontal"/);
  assert.match(popupHtml, /id="speedModeFastButton"[\s\S]*role="radio"[\s\S]*data-popup-speed-mode="fast"[\s\S]*disabled/);
  assert.match(popupHtml, /id="speedModeBalancedButton"[\s\S]*role="radio"[\s\S]*data-popup-speed-mode="balanced"[\s\S]*disabled/);
  assert.match(popupHtml, /id="speedModeCompleteButton"[\s\S]*role="radio"[\s\S]*data-popup-speed-mode="complete"[\s\S]*disabled/);
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
  assert.match(popupSource, /function buildRemainingMeta\(status, phase\)/);
  assert.match(popupSource, /function buildStaleStatusMeta\(status, phase\)/);
  assert.match(popupSource, /function shouldShowStaleStatusNotice\(status = currentStatus\)/);
  assert.match(popupSource, /function createStaleStatusNotice\(\)/);
  assert.match(popupSource, /"ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"/);
  assert.match(popupSource, /event\.key === "Home"/);
  assert.match(popupSource, /event\.key === "End"/);
  assert.match(popupSource, /\["ArrowRight", "ArrowDown"\]\.includes\(event\.key\)/);
  assert.match(popupSource, /phase !== "running" \|\| !status\?\.startedAt/);
  assert.match(popupSource, /metaParts\.push\(elapsedMeta\)/);
  assert.match(popupSource, /processed <= 0 \|\| processed >= total/);
  assert.match(popupSource, /elapsedMs < 5_000/);
  assert.match(popupSource, /metaParts\.push\(remainingMeta\)/);
  assert.match(popupSource, /staleMs < STALE_STATUS_THRESHOLD_MS/);
  assert.match(popupSource, /metaParts\.push\(staleStatusMeta\)/);
  assert.match(popupSource, /staleStatusNoticeVisible = nextVisible/);
  assert.match(popupSource, /record-item record-item--notice/);
  assert.match(popupSource, /t\("staleStatusTitle"\)/);
  assert.match(popupSource, /t\("staleStatusDetail"\)/);
  assert.match(popupSource, /staleFastButton\.dataset\.staleStatusFastButton = "true"/);
  assert.match(popupSource, /staleFastButton\.setAttribute\("aria-describedby", popupActionStatus\.id\)/);
  assert.match(popupSource, /setButtonLabel\(staleFastButton, t\("staleStatusFastAction"\)\)/);
  assert.match(popupSource, /staleFastButton\.disabled = popupActionInFlight \|\| Boolean\(currentStatus\?\.cancelRequested\)/);
  assert.match(popupSource, /cancelAndSwitchToFastMode\(\)\.catch\(\(error\) => \{/);
  assert.match(popupSource, /Failed to cancel stale task and switch to Fast mode/);
  assert.match(popupSource, /staleCancelButton\.dataset\.staleStatusCancelButton = "true"/);
  assert.match(popupSource, /staleCancelButton\.setAttribute\("aria-describedby", popupActionStatus\.id\)/);
  assert.match(popupSource, /setButtonLabel\(staleCancelButton, t\("staleStatusCancelAction"\)\)/);
  assert.match(popupSource, /staleCancelButton\.disabled = popupActionInFlight \|\| Boolean\(currentStatus\?\.cancelRequested\)/);
  assert.match(popupSource, /staleCancelButton\.addEventListener\("click", \(\) => \{/);
  assert.match(popupSource, /cancelJob\(\)\.catch\(\(error\) => \{/);
  assert.match(popupSource, /Failed to cancel stale task/);
  assert.match(popupSource, /wrapper\.appendChild\(createStaleStatusNotice\(\)\)/);
  assert.match(popupSource, /progressTrack\.setAttribute\("aria-valuetext", `\$\{progress\}%, \$\{progressSummaryText\}, \$\{progressMetaText\}`\)/);
  assert.doesNotMatch(popupSource, /processedValue/);
  assert.match(popupSource, /title\.id = "folderSummaryTitle"/);
  assert.match(popupSource, /table\.setAttribute\("aria-labelledby", title\.id\)/);
  assert.match(popupSource, /folderHeader\.scope = "col"/);
  assert.match(popupSource, /countHeader\.scope = "col"/);

  const stylesSource = fs.readFileSync(path.join(ROOT_DIR, "styles.css"), "utf8");
  assert.match(stylesSource, /\.confirm-strip/);
  assert.match(stylesSource, /\.popup-action-status/);
  assert.match(stylesSource, /\.record-item--notice \.record-item__title/);
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
  assert.match(i18nSource, /popupRefreshFailedStatus/);
  assert.match(i18nSource, /popupOpenSettingsFailed/);
  assert.match(i18nSource, /popupMainTitle: "Marko"/);
  assert.doesNotMatch(i18nSource, /popupMainTitle: "书签整理"/);
  assert.match(i18nSource, /setupButton: "Open Settings"/);
  assert.match(i18nSource, /setupButton: "打开设置"/);
  assert.doesNotMatch(i18nSource, /setupButton: "Set up"/);
  assert.doesNotMatch(i18nSource, /setupButton: "去设置"/);
  assert.match(i18nSource, /backupButton: "Backup Now"/);
  assert.match(i18nSource, /backupButton: "手动备份"/);
  assert.doesNotMatch(i18nSource, /backupButton: "Backup"/);
  assert.match(i18nSource, /logModelTimeoutFallback/);
  assert.match(i18nSource, /elapsedMeta/);
  assert.match(i18nSource, /remainingMeta/);
  assert.match(i18nSource, /staleStatusMeta/);
  assert.match(i18nSource, /staleStatusTitle/);
  assert.match(i18nSource, /staleStatusDetail/);
  assert.match(i18nSource, /staleStatusFastAction/);
  assert.match(i18nSource, /staleStatusCancelAction/);
  assert.match(i18nSource, /detailPanelAriaLabel/);
  assert.match(i18nSource, /notStartedMessage: "No preview has been generated yet\."/);
  assert.match(i18nSource, /notStartedMessage: "尚未生成预览。"/);
  assert.doesNotMatch(i18nSource, /No organize task has started yet/);
  assert.doesNotMatch(i18nSource, /尚未开始整理/);
  assert.match(i18nSource, /managedFoldersLoadFailedTitle/);
  assert.match(i18nSource, /managedFoldersLoadFailedDesc/);
  assert.match(i18nSource, /keepBookmarkAria/);
  assert.match(i18nSource, /deleteBookmarkAria/);
  assert.match(i18nSource, /optionsMeta: "Marko \/ Options"/);
  assert.match(i18nSource, /optionsMainTitle: "Marko Settings"/);
  assert.doesNotMatch(i18nSource, /optionsMainTitle: "Settings"/);
  assert.match(i18nSource, /navEyebrow: "Navigation"/);
  assert.match(i18nSource, /optionsMeta: "Marko \/ 设置"/);
  assert.match(i18nSource, /optionsMainTitle: "Marko 设置"/);
  assert.doesNotMatch(i18nSource, /optionsMainTitle: "设置"/);
  assert.match(i18nSource, /navEyebrow: "导航"/);
  assert.match(i18nSource, /saveBadgeFailed: "失败"/);
  assert.match(i18nSource, /saveBadgeLoadFailed: "读取失败"/);
  assert.match(i18nSource, /apiKeyClearedOnProviderChange: "已清空 API Key，避免把旧服务商密钥用于新服务商。"/);
  assert.match(i18nSource, /connectionTitle: "Connection"/);
  assert.match(i18nSource, /connectionTitle: "连接"/);
  assert.match(i18nSource, /labelProvider: "服务商"/);
  assert.match(i18nSource, /labelModel: "模型名称"/);
  assert.match(i18nSource, /aiConnectionFastSummary: "快速模式可选"/);
  assert.match(i18nSource, /aiConnectionRequiredSummary: "AI 模式需要"/);
  assert.match(i18nSource, /connectionModeFastHint:[\s\S]*"快速模式会本地生成预览。只选服务商即可；Base URL、模型、API Key 和授权检测可以等切到 AI 分类时再配置。"/);
  assert.match(i18nSource, /connectionModeBalancedHint:[\s\S]*"平衡模式会跳过网站检测，但未缓存书签需要 AI 分类时，要填写 Base URL、模型、API Key 并授权模型接口。"/);
  assert.match(i18nSource, /connectionModeCompleteHint:[\s\S]*"完整模式需要模型连接做 AI 分类，也需要网站访问权限来检测失效链接。"/);
  assert.match(i18nSource, /automationTitle: "自动整理"/);
  assert.match(i18nSource, /settingsStepAccess: "快速自动整理可本地运行；平衡模式需要模型接口权限；完整模式还需要网站访问权限。"/);
  assert.match(i18nSource, /autoOrganizePermission: "快速自动整理会在本地运行；平衡自动整理需要模型接口权限，完整自动整理还需要网站访问权限。"/);
  assert.match(i18nSource, /backupTitle: "备份管理"/);
  assert.match(i18nSource, /setupRequiredTitle: "完成预览设置"/);
  assert.match(i18nSource, /setupRequiredDesc: "快速预览只需要选择服务商；平衡或完整模式只有需要 AI 分类时才要求 Base URL 和模型名称。"/);
  assert.match(i18nSource, /setupMissingProvider: "请先选择服务商。"/);
  assert.match(i18nSource, /setupInvalidBaseUrl: "Base URL 必须是有效的 http 或 https 地址。"/);
  assert.match(i18nSource, /setupMissingModel: "预览前需要填写模型名称。"/);
  assert.match(i18nSource, /setupMissingApiKey: "当前服务商需要 API Key。"/);
  assert.match(i18nSource, /modelAccessRequiredForUncachedPreviewWithCount:[\s\S]*"\{count\} 条书签没有命中本地规则或分类缓存/);
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
  assert.match(backgroundSource, /CONFIG_PERSISTENCE_KEYS/);
  assert.match(backgroundSource, /persistNormalizedConfigIfSafe/);
  assert.match(backgroundSource, /shouldPersistNormalizedConfig/);
  assert.match(backgroundSource, /CONFIG_PERSISTENCE_KEYS\.some\(\(key\) => rawConfig\[key\] !== normalizedConfig\[key\]\)/);
  assert.doesNotMatch(backgroundSource, /normalizeRetryBatchSize\(rawConfig\.batchSize, Number\.NaN\)/);
  assert.match(backgroundSource, /options\.activeJob\?\.phase === "running" \|\| options\.previewPlan/);
  assert.match(backgroundSource, /STORAGE_KEYS\.previewPlan/);
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
  assert.match(backgroundSource, /let nextBatchTimerId = 0/);
  assert.match(backgroundSource, /function clearImmediateBatchTimer/);
  assert.match(backgroundSource, /function scheduleImmediateBatchProcessing/);
  assert.match(backgroundSource, /nextBatchTimerId = setTimeout/);
  assert.match(backgroundSource, /void processNextBatch\(\)/);
  assert.match(backgroundSource, /async function scheduleNextBatch\(options = \{\}\)/);
  assert.match(backgroundSource, /options\.immediate !== false/);
  assert.match(backgroundSource, /clearImmediateBatchTimer\(\);\n  await chrome\.alarms\.clear\(ALARM_NAME\)/);
  assert.match(backgroundSource, /normalizeRunningOrganizeJobRuntime/);
  assert.match(backgroundSource, /Math\.min\(storedBatchSize, cappedRuntimeBatchSize\)/);
  assert.match(backgroundSource, /splitIntoModelRequestBatches/);
  assert.match(backgroundSource, /splitIntoFixedSizeChunks/);
  assert.match(backgroundSource, /getAdaptiveRetryBatchSize/);
  assert.match(backgroundSource, /classifySplitModelRequestBatches/);
  assert.match(backgroundSource, /classifyAdaptiveModelRequestBatch/);
  assert.match(backgroundSource, /if \(requestBatchCap && batch\.length > requestBatchCap\)/);
  assert.match(backgroundSource, /Promise\.allSettled\(workers\)/);
  assert.match(backgroundSource, /partialClassificationResults/);
  assert.match(backgroundSource, /attachPartialClassificationResults/);
  assert.match(backgroundSource, /filterBookmarksByClassificationResults/);
  assert.match(backgroundSource, /modelCacheBookmarks/);
  assert.match(backgroundSource, /partialModelFallbackCount/);
  assert.match(backgroundSource, /partialModelFallbackPendingCount/);
  assert.match(backgroundSource, /Marko kept and cached \$\{partialModelBookmarks\.length\} classifications/);
  assert.match(backgroundSource, /remaining \$\{fallbackBookmarks\.length\} bookmarks will stop waiting/);
  assert.match(backgroundSource, /kept partial model output and is writing the fallback plan/);
  assert.match(backgroundSource, /mini-request results are being kept in the final plan/);
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
  assert.match(backgroundSource, /MIN_TAXONOMY_AI_CANDIDATES = 25/);
  assert.match(backgroundSource, /getTaxonomyPlanningTimeoutMs/);
  assert.match(backgroundSource, /shouldPlanGlobalTaxonomy/);
  assert.match(backgroundSource, /shouldPlanGlobalTaxonomy\(runtimeConfig, startupAiCandidateCount\)/);
  assert.match(backgroundSource, /Only \$\{startupAiCandidateCount\} bookmarks need AI classification/);
  assert.match(backgroundSource, /taxonomyPlanned: planTaxonomy/);
  assert.match(backgroundSource, /const previewTaxonomyDetailZh = job\.taxonomyPlanned/);
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
  assert.match(backgroundSource, /const reusableLocalCheck = takeReusableLocalRequirementCheck\(runtimeConfig, runContext\)/);
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
  assert.match(optionsHtml, /data-i18n="optionsMainTitle">Marko Settings<\/h1>/);
  assert.match(optionsHtml, /id="backupActionStatus"/);
  assert.match(optionsHtml, /id="saveBadge"[\s\S]*role="status"[\s\S]*aria-live="polite"[\s\S]*aria-atomic="true"[\s\S]*data-i18n="saveBadgeLoading"/);
  assert.match(optionsHtml, /id="backupStatusBadge"[\s\S]*role="status"[\s\S]*aria-live="polite"[\s\S]*aria-atomic="true"/);
  assert.match(optionsHtml, /id="settingsActionStatus"[\s\S]*role="status"[\s\S]*aria-live="polite"/);
  assert.match(optionsHtml, /id="privacyButton"[\s\S]*aria-describedby="settingsActionStatus"/);
  assert.match(optionsHtml, /id="backupActionStatus"[\s\S]*role="status"[\s\S]*aria-live="polite"/);
  assert.match(optionsHtml, /data-i18n="navOrganize">Rules<\/span>/);
  assert.match(optionsHtml, /data-i18n="navAutomation">Auto<\/span>/);
  assert.doesNotMatch(optionsHtml, /data-i18n="navOrganize">Organization<\/span>/);
  assert.doesNotMatch(optionsHtml, /data-i18n="navAutomation">Automation<\/span>/);
  assert.match(optionsHtml, /id="saveButton"[\s\S]*aria-describedby="settingsActionStatus"[\s\S]*disabled/);
  assert.match(optionsHtml, /id="resetButton"[\s\S]*aria-describedby="settingsActionStatus"[\s\S]*disabled/);
  assert.match(optionsHtml, /id="createBackupButton"[\s\S]*aria-describedby="backupActionStatus"[\s\S]*disabled/);
  assert.match(optionsHtml, /id="testApiButton"[\s\S]*aria-describedby="apiTestStatus"[\s\S]*disabled/);
  assert.match(optionsHtml, /id="grantAccessButton"[\s\S]*aria-describedby="hostAccessStatus"[\s\S]*disabled/);
  assert.match(optionsHtml, /id="connectionModeHint"[\s\S]*role="status"[\s\S]*aria-live="polite"[\s\S]*data-i18n="connectionModeFastHint"/);
  assert.match(optionsHtml, /Fast mode previews locally\. Provider is enough; Base URL, model, API key, and access checks are optional until you switch to AI classification\./);
  assert.doesNotMatch(optionsHtml, /Fast mode can preview and save without model fields/);
  assert.match(optionsHtml, /data-i18n="connectionTitle">Connection<\/h2>/);
  assert.match(optionsHtml, /data-i18n="labelProvider">Provider<\/label>/);
  assert.doesNotMatch(optionsHtml, /API Provider/);
  assert.match(optionsHtml, /id="provider"[\s\S]*aria-describedby="connectionModeHint aiConnectionSummaryNote"/);
  assert.match(optionsHtml, /id="aiConnectionBlock"/);
  assert.match(optionsHtml, /id="aiConnectionSummaryNote"[\s\S]*data-i18n="aiConnectionFastSummary"/);
  assert.match(optionsHtml, /data-i18n="labelModel">Model<\/label>/);
  assert.doesNotMatch(optionsHtml, /data-i18n="labelModel">Model Name<\/label>/);
  assert.match(optionsHtml, /id="model"[\s\S]*aria-describedby="connectionModeHint"/);
  assert.match(optionsHtml, /id="baseUrl"[\s\S]*aria-describedby="connectionModeHint"/);
  assert.match(optionsHtml, /id="apiKey"[\s\S]*type="password"[\s\S]*aria-describedby="connectionModeHint apiKeyVisibilityHint"/);
  assert.match(optionsHtml, /class="input-action"[\s\S]*id="apiKeyVisibilityButton"[\s\S]*aria-controls="apiKey"[\s\S]*aria-pressed="false"[\s\S]*data-i18n="showApiKeyButton"/);
  assert.match(optionsHtml, /id="apiKeyVisibilityHint"[\s\S]*data-i18n="apiKeyVisibilityHint"/);
  assert.match(optionsHtml, /id="autoOrganizeAccessHint"[\s\S]*role="status"[\s\S]*aria-live="polite"[\s\S]*hidden/);
  assert.match(optionsHtml, /id="linkCheckMode"[\s\S]*type="hidden"[\s\S]*value="fast"/);
  assert.match(optionsHtml, /id="linkCheckModeLabel"[\s\S]*data-i18n="labelLinkCheckMode">Speed mode<\/div>/);
  assert.doesNotMatch(optionsHtml, /data-i18n="labelLinkCheckMode">Speed Mode<\/div>/);
  assert.match(optionsHtml, /class="segmented-control segmented-control--settings"[\s\S]*role="radiogroup"[\s\S]*aria-labelledby="linkCheckModeLabel"[\s\S]*aria-describedby="linkCheckModeHint"/);
  assert.match(optionsHtml, /id="settingsSpeedModeFastButton"[\s\S]*role="radio"[\s\S]*data-settings-speed-mode="fast"[\s\S]*aria-checked="true"[\s\S]*disabled/);
  assert.match(optionsHtml, /id="settingsSpeedModeBalancedButton"[\s\S]*role="radio"[\s\S]*data-settings-speed-mode="balanced"[\s\S]*aria-checked="false"[\s\S]*disabled/);
  assert.match(optionsHtml, /id="settingsSpeedModeCompleteButton"[\s\S]*role="radio"[\s\S]*data-settings-speed-mode="complete"[\s\S]*aria-checked="false"[\s\S]*disabled/);
  assert.doesNotMatch(optionsHtml, /<select id="linkCheckMode"/);
  assert.match(optionsHtml, /id="linkCheckModeHint"[\s\S]*data-i18n="hintLinkCheckMode"/);
  assert.match(optionsHtml, /Fast finishes locally without waiting for the model\. Balanced skips link checks but keeps AI classification\. Complete checks links and uses AI\./);
  assert.match(optionsHtml, /data-i18n="organizeTitle">Rules<\/h2>/);
  assert.doesNotMatch(optionsHtml, /Organization Rules/);
  assert.match(optionsHtml, /data-i18n="labelBatchSize">Batch size<\/label>/);
  assert.doesNotMatch(optionsHtml, /data-i18n="labelBatchSize">Batch Size<\/label>/);
  assert.match(optionsHtml, /id="batchSize"[\s\S]*aria-describedby="batchSizeHint"/);
  assert.match(optionsHtml, /id="batchSizeHint"[\s\S]*data-i18n="hintBatchSize"/);
  assert.match(optionsHtml, /DeepSeek and DeepSeek-compatible endpoints are capped per run and split into 3-item model requests/);
  assert.doesNotMatch(optionsHtml, /Smaller batches are safer for slower models/);
  assert.match(optionsHtml, /id="batchSizeCapHint"[\s\S]*role="status"[\s\S]*aria-live="polite"[\s\S]*hidden/);
  assert.match(optionsHtml, /data-i18n-placeholder="placeholderWhitelistSearch"[\s\S]*placeholder="Search bookmark websites"/);
  assert.match(optionsHtml, /data-i18n-placeholder="placeholderProtectedRootFolders"[\s\S]*placeholder="One root folder per line, for example:&#10;Work&#10;Personal&#10;Reference"/);
  assert.match(optionsHtml, /data-i18n-placeholder="placeholderDomainFolderRules"[\s\S]*placeholder="One rule per line, for example:&#10;github\.com =&gt; AI &amp; Tech \/ Code&#10;mail\.google\.com =&gt; Tools &amp; Productivity"/);
  assert.doesNotMatch(optionsHtml, /placeholder="Search websites"/);
  assert.doesNotMatch(optionsHtml, /placeholder="One root folder per line"/);
  assert.doesNotMatch(optionsHtml, /placeholder="example\.com => Tools \/ Reading"/);
  assert.match(optionsHtml, /data-i18n="advancedSettingsTitle">Advanced<\/summary>/);
  assert.doesNotMatch(optionsHtml, /Advanced Settings/);
  assert.match(optionsHtml, /data-i18n="automationTitle">Auto<\/h2>/);
  assert.doesNotMatch(optionsHtml, /Automation<\/h2>/);
  assert.match(optionsHtml, /class="toggle"[\s\S]*for="autoOrganizeEnabled"/);
  assert.match(optionsHtml, /id="autoOrganizeEnabled"[\s\S]*type="checkbox"[\s\S]*role="switch"[\s\S]*aria-describedby="autoOrganizeAccessHint"[\s\S]*disabled/);
  assert.match(optionsHtml, /class="toggle__track"[\s\S]*class="toggle__thumb"/);
  assert.match(optionsHtml, /data-i18n="labelAutoOrganizeEnabled">Silent organize<\/span>/);
  assert.match(optionsHtml, /id="autoOrganizeState"[\s\S]*data-i18n="autoOrganizeOff"/);
  assert.doesNotMatch(optionsHtml, /<select id="autoOrganizeEnabled"/);
  assert.doesNotMatch(optionsHtml, /Auto Silent Organize/);
  assert.match(optionsHtml, /data-i18n="labelAutoOrganizeInterval">Interval \(hours\)<\/label>/);
  assert.doesNotMatch(optionsHtml, /Auto Organize Interval/);
  assert.match(optionsHtml, /id="autoOrganizeIntervalHours"[\s\S]*aria-describedby="autoOrganizeIntervalHint"/);
  assert.match(optionsHtml, /id="autoOrganizeIntervalHint"[\s\S]*data-i18n="hintAutoOrganizeInterval"/);
  assert.match(optionsHtml, /id="whitelistSelectionStatus"[\s\S]*role="status"[\s\S]*aria-live="polite"/);
  assert.match(optionsHtml, /id="whitelistSearch"[\s\S]*aria-describedby="whitelistSelectionStatus"/);
  assert.match(optionsHtml, /data-i18n="backupTitle">Backups<\/h2>/);
  assert.doesNotMatch(optionsHtml, /Backup Management/);
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
  assert.match(optionsSource, /connectionModeHint/);
  assert.match(optionsSource, /apiKeyVisibilityButton/);
  assert.match(optionsSource, /function setApiKeyVisible\(isVisible\)/);
  assert.match(optionsSource, /apiKeyInput\.type = isVisible \? "text" : "password"/);
  assert.match(optionsSource, /function updateApiKeyVisibilityButton\(\)/);
  assert.match(optionsSource, /apiKeyVisibilityButton\.setAttribute\("aria-pressed", String\(isVisible\)\)/);
  assert.match(optionsSource, /apiKeyVisibilityButton\.disabled = isLocked/);
  assert.match(optionsSource, /setApiKeyVisible\(false\)/);
  assert.match(optionsSource, /apiKeyVisibilityButton\.addEventListener\("click"/);
  assert.match(optionsSource, /function updateBatchSizeCapHint\(\)/);
  assert.match(optionsSource, /function updateConnectionModeHint\(\)/);
  assert.match(optionsSource, /connectionModeCompleteHint/);
  assert.match(optionsSource, /connectionModeBalancedHint/);
  assert.match(optionsSource, /connectionModeFastHint/);
  assert.match(optionsSource, /connectionModeHint\.className = requiresAccess \? "field__hint panel__hint field__hint--warm" : "field__hint panel__hint"/);
  assert.match(optionsSource, /function updateAiConnectionDisclosure/);
  assert.match(optionsSource, /aiConnectionRequiredSummary/);
  assert.match(optionsSource, /aiConnectionFastSummary/);
  assert.match(optionsSource, /aiConnectionBlock\.open = true/);
  assert.match(optionsSource, /aiConnectionBlock\.open = false/);
  assert.match(optionsSource, /getCurrentBatchProfileConfig/);
  assert.match(optionsSource, /t\("batchSizeCapHint", \{ count: cap \}\)/);
  assert.match(optionsSource, /addDescribedByToken\(batchSizeInput, batchSizeCapHint\.id\)/);
  assert.match(optionsSource, /removeDescribedByTokens\(batchSizeInput, \[batchSizeCapHint\.id\]\)/);
  assert.match(optionsSource, /settingsSlowBatchAdjustedStatus/);
  assert.match(optionsSource, /autoOrganizeAccessHint/);
  assert.match(optionsSource, /function updateAutoOrganizeAccessHint\(\)/);
  assert.match(optionsSource, /autoOrganizeDisabledHint/);
  assert.match(optionsSource, /autoOrganizeFastHint/);
  assert.match(optionsSource, /autoOrganizeBalancedHint/);
  assert.match(optionsSource, /autoOrganizeCompleteHint/);
  assert.match(optionsSource, /addDescribedByToken\(autoOrganizeEnabledInput, autoOrganizeAccessHint\.id\)/);
  assert.match(optionsSource, /updateConnectionModeHint\(\)/);
  assert.match(optionsSource, /updateAutoOrganizeAccessHint\(\)/);
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
  assert.match(optionsSource, /async function openPrivacyPage\(\)/);
  assert.match(optionsSource, /chrome\.tabs\?\.create/);
  assert.match(optionsSource, /window\.open\(privacyUrl, "_blank", "noopener"\)/);
  assert.match(optionsSource, /setSettingsActionStatus\(t\("privacyOpenFailed"\), true\)/);
  assert.match(optionsSource, /setGrantAccessButtonState\(grantAccessButton\.dataset\.granted === "true", \{/);
  assert.match(optionsSource, /accessNeeded: grantAccessButton\.dataset\.accessNeeded !== "false"/);
  assert.match(optionsSource, /function syncNavigationButtonLabels\(\)/);
  assert.match(optionsSource, /button\.querySelector\("\.nav-button__title"\)\?\.textContent/);
  assert.match(optionsSource, /button\.title = safeLabel/);
  assert.match(optionsSource, /button\.setAttribute\("aria-label", safeLabel\)/);
  assert.match(optionsSource, /const removeLabel = t\("whitelistRemoveDomain", \{ domain \}\)/);
  assert.match(optionsSource, /button\.title = removeLabel/);
  assert.match(optionsSource, /button\.setAttribute\("aria-label", removeLabel\)/);
  assert.match(optionsSource, /whitelistCatalogLoadFailed/);
  assert.match(optionsSource, /t\("whitelistCatalogLoadFailed"\)/);
  assert.match(optionsSource, /whitelistCatalogLoadFailed = false/);
  assert.match(optionsSource, /whitelistCatalogLoadFailed = true/);
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
  assert.match(optionsSource, /const autoOrganizeState = document\.getElementById\("autoOrganizeState"\)/);
  assert.match(optionsSource, /const autoOrganizeIntervalField = autoOrganizeIntervalInput\?\.closest\("\.field"\)/);
  assert.match(optionsSource, /function renderAutoOrganizeToggle/);
  assert.match(optionsSource, /autoOrganizeEnabledInput\.checked = Boolean\(config\.autoOrganizeEnabled\)/);
  assert.match(optionsSource, /autoOrganizeEnabled: Boolean\(autoOrganizeEnabledInput\.checked\)/);
  assert.match(optionsSource, /autoOrganizeIntervalInput\.disabled = isLocked \|\| !autoOrganizeEnabled/);
  assert.match(optionsSource, /autoOrganizeIntervalField\?\.classList\.toggle\("is-disabled", !isLocked && !autoOrganizeEnabled\)/);
  assert.match(optionsSource, /if \(config\.autoOrganizeEnabled && !hasValidAutoInterval\)/);
  assert.match(optionsSource, /if \(!config\.autoOrganizeEnabled && !hasValidAutoInterval\)/);
  assert.doesNotMatch(optionsSource, /autoOrganizeEnabledInput\.value === "true"/);
  assert.match(optionsSource, /renderHostAccessRefreshFailure\(\)/);
  assert.match(optionsSource, /console\.error\("Failed to save settings:"/);
  assert.match(optionsSource, /console\.error\("Failed to save settings after API test:"/);
  assert.match(optionsSource, /apiTestSaveFailed/);
  assert.match(optionsSource, /setSaveBadge\(t\("saveBadgeFailed"\), "danger"\)/);
  assert.match(optionsSource, /settingsAccessRequestingStatus/);
  assert.match(optionsSource, /let settingsReady = false/);
  assert.match(optionsSource, /const linkCheckModeButtons = Array\.from\(document\.querySelectorAll\("\[data-settings-speed-mode\]"\)\)/);
  assert.match(optionsSource, /function renderLinkCheckModeButtons/);
  assert.match(optionsSource, /function setLinkCheckMode/);
  assert.match(optionsSource, /linkCheckModeSelect\.dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
  assert.match(optionsSource, /button\.setAttribute\("aria-checked", String\(isActive\)\)/);
  assert.match(optionsSource, /button\.tabIndex = isActive \? 0 : -1/);
  assert.match(optionsSource, /linkCheckModeButtons\.forEach\(\(button, index\) =>/);
  assert.match(optionsSource, /const handledKeys = \["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"\]/);
  assert.match(optionsSource, /const isLocked = !settingsReady \|\| settingsActionInFlight/);
  assert.match(optionsSource, /settingsFields\.forEach/);
  assert.match(optionsSource, /field\.disabled = isLocked/);
  assert.match(optionsSource, /linkCheckModeButtons\.forEach\(\(button\) => \{\n    button\.disabled = isLocked;/);
  assert.match(optionsSource, /saveButton\.disabled = isLocked/);
  assert.match(optionsSource, /testApiButton\.disabled = isLocked/);
  assert.match(optionsSource, /resetButton\.disabled = isLocked/);
  assert.match(optionsSource, /function updateBackupOperationControls\(\)/);
  assert.match(optionsSource, /createBackupButton\.disabled = !settingsReady \|\| backupActionInFlight/);
  assert.match(optionsSource, /function setSettingsReady\(isReady\)/);
  assert.match(optionsSource, /setSaveBadge\(t\("saveBadgeLoading"\), "accent"\)/);
  assert.match(optionsSource, /setSettingsReady\(false\)/);
  assert.match(optionsSource, /setSettingsReady\(true\)/);
  assert.match(optionsSource, /hostAccessCheckingInFlight/);
  assert.match(optionsSource, /hostAccessRefreshTimer/);
  assert.match(optionsSource, /clearScheduledHostAccessStatusRefresh/);
  assert.match(optionsSource, /scheduleHostAccessStatusRefresh/);
  assert.match(optionsSource, /hostAccessRefreshVersion \+= 1/);
  assert.match(optionsSource, /scheduleHostAccessStatusRefresh[\s\S]*setHostAccessStatus\(t\("hostAccessChecking"\), true\)/);
  assert.match(optionsSource, /grantAccessButton\.disabled = isLocked \|\| !accessNeeded \|\| granted \|\| hostAccessCheckingInFlight/);
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
  assert.match(optionsSource, /const requiresModelAccess = shouldRequireModelAccess\(config\)/);
  assert.match(optionsSource, /if \(requiresModelAccess && !config\.baseUrl\) \{[\s\S]*showSettingsIssue\(t\("baseUrlRequired"\), "connection", "baseUrl"\)/);
  assert.match(optionsSource, /if \(requiresModelAccess && !isValidHttpUrl\(config\.baseUrl\)\) \{[\s\S]*showSettingsIssue\(t\("baseUrlInvalid"\), "connection", "baseUrl"\)/);
  assert.match(optionsSource, /if \(requiresModelAccess && !config\.model\) \{[\s\S]*showSettingsIssue\(t\("modelRequired"\), "connection", "model"\)/);
  assert.match(optionsSource, /showSettingsIssue\(t\("batchSizeValidation"\), "organize", "batchSize"\)/);
  assert.match(optionsSource, /showSettingsIssue\(t\("autoIntervalValidation"\), "automation", "autoOrganizeIntervalHours"\)/);
  assert.match(optionsSource, /config\.autoOrganizeEnabled &&[\s\S]*requiresModelAccess[\s\S]*!defaults\.apiKeyOptional &&[\s\S]*!config\.apiKey/);
  assert.match(optionsSource, /showSettingsIssue\(t\("requiredApiKey", \{ provider: defaults\.label \}\), "connection", "apiKey"\)/);
  assert.match(optionsSource, /showApiTestIssue\(t\("baseUrlRequired"\), "baseUrl"\)/);
  assert.match(optionsSource, /showApiTestIssue\(t\("baseUrlInvalid"\), "baseUrl"\)/);
  assert.match(optionsSource, /showApiTestIssue\(t\("modelRequired"\), "model"\)/);
  assert.match(optionsSource, /showApiTestIssue\(t\("batchSizeValidation"\), "batchSize"\)/);
  assert.match(optionsSource, /showApiTestIssue\(t\("requiredApiKey", \{ provider: defaults\.label \}\), "apiKey"\)/);
  assert.match(optionsSource, /setSaveBadge\(t\("saveBadgeUnsaved"\), "accent"\);\n  setApiTestStatus\(t\("apiTesting"\)\)/);
  assert.match(optionsSource, /if \(!granted\) \{[\s\S]*setSaveBadge\(t\("saveBadgeFailed"\), "danger"\)[\s\S]*setApiTestStatus\(t\("currentApiAccessMissing"\), true\)/);
  assert.match(optionsSource, /Failed to refresh host access status after API test access check/);
  assert.match(optionsSource, /if \(!response\?\.ok\) \{[\s\S]*setSaveBadge\(t\("saveBadgeFailed"\), "danger"\)[\s\S]*setApiTestStatus\(/);
  assert.match(optionsSource, /if \(!granted\) \{[\s\S]*setSaveBadge\(t\("saveBadgeFailed"\), "danger"\)[\s\S]*showSettingsIssue\(t\("autoOrganizePermission"\), "automation", "autoOrganizeEnabled"\)/);
  assert.match(optionsSource, /Failed to refresh host access status after auto organize permission check/);
  assert.match(optionsSource, /if \(!autoAccessGranted\) \{[\s\S]*setApiTestStatus\([\s\S]*apiTestAutoAccessFailed[\s\S]*true[\s\S]*showSettingsIssue\(t\("autoOrganizePermission"\), "automation", "autoOrganizeEnabled"\)/);
  assert.match(optionsSource, /Failed to refresh host access status after API test auto permission check/);
  assert.match(optionsSource, /function shouldRequireModelAccess\(config\)/);
  assert.match(optionsSource, /if \(configToSave\.autoOrganizeEnabled\) \{[\s\S]*const granted = shouldRequireBroadHostAccess\(configToSave\)[\s\S]*ensureBroadHostAccess\(\)[\s\S]*shouldRequireModelAccess\(configToSave\)[\s\S]*ensureOriginAccess\(configToSave\.baseUrl\)[\s\S]*: true/);
  assert.match(optionsSource, /showSettingsIssue\(t\("autoOrganizePermission"\), "automation", "autoOrganizeEnabled"\)/);
  assert.match(optionsSource, /setSettingsActionStatus\(t\("hostAccessGranted"\)\)/);
  assert.match(optionsSource, /Failed to refresh host access status after access decision/);
  assert.match(optionsSource, /renderHostAccessRefreshFailure\(\);[\s\S]*if \(!granted\)/);
  assert.match(optionsSource, /catch \(error\) \{[\s\S]*Failed to request host access:[\s\S]*showSettingsIssue\(t\("hostAccessRequestException"\), "connection", "grantAccessButton"\)/);
  assert.match(optionsSource, /void requestHostAccess\(\)\.catch/);
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
  assert.match(backgroundSource, /if \(!requireModelAccess\) \{[\s\S]*return;[\s\S]*\}/);
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
  assert.match(stylesSource, /\.panel__hint/);
  assert.match(stylesSource, /\.field label,[\s\S]*\.field__label/);
  assert.match(stylesSource, /\.field__hint--warm/);
  assert.match(stylesSource, /\.field__hint\[hidden\]/);
  assert.match(stylesSource, /\.input-action[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(stylesSource, /\.input-action__button[\s\S]*white-space: nowrap/);
  assert.match(stylesSource, /\.segmented-control[\s\S]*width: 100%/);
  assert.match(stylesSource, /\.segmented-control__button:focus-visible/);
  assert.match(stylesSource, /\.toggle[\s\S]*grid-template-columns: auto minmax\(0, 1fr\)/);
  assert.match(stylesSource, /\.toggle__input:checked \+ \.toggle__track/);
  assert.match(stylesSource, /\.toggle__input:focus-visible \+ \.toggle__track/);
  assert.match(stylesSource, /\.toggle:has\(\.toggle__input\[aria-invalid="true"\]\) \.toggle__track/);
  assert.match(stylesSource, /\.field\.is-disabled input/);
  assert.match(stylesSource, /\.field input\[aria-invalid="true"\]/);
  assert.match(stylesSource, /\.field select\[aria-invalid="true"\]/);
  assert.match(stylesSource, /\.field textarea\[aria-invalid="true"\]/);
  assert.match(stylesSource, /\.button\[aria-invalid="true"\]/);
  assert.match(stylesSource, /border-color: var\(--danger\)/);
  assert.match(stylesSource, /\.button:disabled[\s\S]*background: var\(--surface-muted\)/);

  const i18nSource = fs.readFileSync(path.join(ROOT_DIR, "i18n.js"), "utf8");
  assert.match(i18nSource, /whitelistRemoveDomain/);
  assert.match(i18nSource, /whitelistCatalogLoadFailed/);
  assert.match(i18nSource, /whitelistAddDomainWithCount/);
  assert.match(i18nSource, /whitelistRemoveDomainWithCount/);
  assert.match(i18nSource, /hintBatchSize/);
  assert.match(i18nSource, /showApiKeyButton/);
  assert.match(i18nSource, /hideApiKeyButton/);
  assert.match(i18nSource, /showApiKeyAria/);
  assert.match(i18nSource, /hideApiKeyAria/);
  assert.match(i18nSource, /apiKeyVisibilityHint/);
  assert.match(i18nSource, /hintAutoOrganizeInterval/);
  assert.match(i18nSource, /settingsSavedStatus/);
  assert.match(i18nSource, /saveBadgeLoading/);
  assert.match(i18nSource, /settingsSavingStatus/);
  assert.match(i18nSource, /settingsLoadException/);
  assert.match(i18nSource, /settingsSaveException/);
  assert.match(i18nSource, /apiTestSaveFailed/);
  assert.match(i18nSource, /apiTestAutoAccessFailed/);
  assert.match(i18nSource, /settingsAccessRequestingStatus/);
  assert.match(i18nSource, /privacyOpenFailed/);
  assert.match(i18nSource, /hostAccessChecking/);
  assert.match(i18nSource, /autoOrganizeDisabledHint/);
  assert.match(i18nSource, /autoOrganizeFastHint/);
  assert.match(i18nSource, /autoOrganizeBalancedHint/);
  assert.match(i18nSource, /autoOrganizeCompleteHint/);
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
  assert.match(stylesSource, /\.button[\s\S]*min-width: 0[\s\S]*line-height: 1\.25[\s\S]*overflow-wrap: anywhere/);
  assert.match(stylesSource, /\.pill[\s\S]*min-width: 0[\s\S]*max-width: 100%[\s\S]*white-space: normal[\s\S]*overflow-wrap: anywhere/);
  assert.match(stylesSource, /body\.popup-body[\s\S]*width: min\(400px, 100vw\)/);
  assert.match(stylesSource, /\.page-shell \{[\s\S]*width: 100%/);
  assert.match(stylesSource, /\.workspace[\s\S]*min-width: 0/);
  assert.match(stylesSource, /\.page-shell,[\s\S]*\.popup-shell[\s\S]*min-width: 0/);
  assert.match(stylesSource, /\.content-stack,[\s\S]*\.panel-stack[\s\S]*min-width: 0/);
  assert.match(stylesSource, /\.settings-section[\s\S]*min-width: 0/);
  assert.match(stylesSource, /\.form-grid,[\s\S]*\.stack-sm[\s\S]*min-width: 0/);
  assert.match(stylesSource, /\.popup-mode-bar[\s\S]*flex-wrap: wrap/);
  assert.match(stylesSource, /\.segmented-control[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(stylesSource, /\.segmented-control__button[\s\S]*min-width: 0/);
  assert.match(stylesSource, /\.popup-shell \.topbar__actions--popup[\s\S]*flex-wrap: wrap[\s\S]*max-width: 132px/);
  assert.match(stylesSource, /\.popup-shell \.topbar__actions--popup \.pill[\s\S]*white-space: normal[\s\S]*overflow-wrap: anywhere/);
  assert.match(stylesSource, /@media \(max-width: 360px\)/);
  assert.match(stylesSource, /\.popup-shell \.topbar__actions--popup[\s\S]*position: static/);
  assert.match(stylesSource, /\.popup-shell \.topbar__actions--popup[\s\S]*max-width: 100%/);
  assert.match(stylesSource, /\.progress-head__summary,[\s\S]*\.progress-head__meta[\s\S]*overflow-wrap: anywhere/);
  assert.match(stylesSource, /\.field input,[\s\S]*\.field textarea[\s\S]*max-width: 100%/);
  assert.match(stylesSource, /\.status-text[\s\S]*overflow-wrap: anywhere[\s\S]*word-break: break-word[\s\S]*line-break: anywhere/);
  assert.match(stylesSource, /\.field__hint,[\s\S]*\.meta-list[\s\S]*overflow-wrap: anywhere[\s\S]*line-break: anywhere/);
  assert.match(stylesSource, /\.bookmark-item__title[\s\S]*overflow-wrap: anywhere/);
  assert.match(stylesSource, /\.bookmark-item__meta[\s\S]*overflow-wrap: anywhere/);
  assert.match(stylesSource, /\.record-item__row > :first-child[\s\S]*min-width: 0/);
  assert.match(stylesSource, /\.record-item__title[\s\S]*overflow-wrap: anywhere/);
  assert.match(stylesSource, /\.result-table[\s\S]*table-layout: fixed/);
  assert.match(stylesSource, /\.result-table th,[\s\S]*\.result-table td[\s\S]*overflow-wrap: anywhere/);
  assert.match(stylesSource, /\.confirm-strip__desc[\s\S]*overflow-wrap: anywhere/);
  assert.match(stylesSource, /\.advanced-block__summary[\s\S]*justify-content: space-between/);
  assert.match(stylesSource, /\.advanced-block__summary-note[\s\S]*text-align: right/);
}

function testReleaseMaterialsCurrent() {
  const changelog = fs.readFileSync(path.join(ROOT_DIR, "CHANGELOG.md"), "utf8");
  const readme = fs.readFileSync(path.join(ROOT_DIR, "README.md"), "utf8");
  const readmeZh = fs.readFileSync(path.join(ROOT_DIR, "README.zh-CN.md"), "utf8");
  const heroSvg = fs.readFileSync(path.join(ROOT_DIR, "docs/assets/hero.svg"), "utf8");
  assert.match(heroSvg, />MARKO</);
  assert.doesNotMatch(heroSvg, /SMART BOOKMARK AI|Smart Bookmark AI/);
  assert.match(changelog, /without a second model request/);
  assert.match(changelog, /Fast\/Balanced\/Complete mode switch/);
  assert.match(changelog, /wakes the next batch immediately with a Chrome alarm fallback/);
  assert.match(changelog, /Balanced mode now skips dead-link scans/);
  assert.match(changelog, /built-in domain rules/);
  assert.match(changelog, /Backup failures before applying a saved preview/);
  assert.match(changelog, /only for explicit preview-apply failures/);
  assert.match(changelog, /runtime batches are capped to nine bookmarks/);
  assert.match(changelog, /three-bookmark model requests/);
  assert.match(changelog, /older 48-item settings/);
  assert.match(changelog, /writes normalized batch-size settings back to storage only when no run or saved preview is active/);
  assert.match(changelog, /full normalized config instead of using retry-batch rules/);
  assert.match(changelog, /reuses the popup preflight local coverage check after runtime batch caps/);
  assert.match(changelog, /warn inline before saving when a DeepSeek-compatible batch size will be capped/);
  assert.match(changelog, /auto-organize permission impact inline/);
  assert.match(changelog, /explicit granted status after permission approval succeeds/);
  assert.match(changelog, /speed-mode changes now save against merged provider defaults/);
  assert.match(changelog, /API test succeeded but auto-organize permission was not granted/);
  assert.match(changelog, /store release materials now describe the slow-batch/);
  assert.match(changelog, /DeepSeek-compatible endpoints/);
  assert.match(changelog, /up to three mini requests/);
  assert.match(changelog, /preview-time model calls, local Apply Plan rebuilds, and auto organize data flow/);
  assert.match(changelog, /same preview-first data-flow language/);
  assert.match(changelog, /Privacy page breadcrumb and section eyebrow labels/);
  assert.match(changelog, /i18n document applier now sets page language reliably/);
  assert.match(changelog, /Whitelist domain chips and catalog options/);
  assert.match(changelog, /Whitelist website catalog load failures now show a distinct inline error/);
  assert.match(changelog, /Backup restore, delete, confirm, and cancel controls/);
  assert.match(changelog, /Popup unprocessed-item keep\/delete controls/);
  assert.match(changelog, /unprocessed-item actions now lock the whole action group/);
  assert.match(changelog, /stale manual-review count from the folder summary/);
  assert.match(changelog, /Popup primary, settings, backup, cancel, and apply-confirmation buttons/);
  assert.match(changelog, /Popup Settings shortcuts now show an inline error if both tab creation and the options-page fallback fail/);
  assert.match(changelog, /Settings save, reset, privacy, API test, access, and manual backup buttons/);
  assert.match(changelog, /Settings Privacy now falls back from tab creation to window opening/);
  assert.match(changelog, /Popup Fast, Balanced, and Complete mode toggles/);
  assert.match(changelog, /Settings navigation tabs now expose localized hover tooltips/);
  assert.match(changelog, /Settings save and backup status badges/);
  assert.match(changelog, /Fast mode now finishes locally without waiting for the model/);
  assert.match(changelog, /Fast mode no longer blocks preview or settings save when Base URL or model name are blank/);
  assert.match(changelog, /Settings connection now explains which modes need model fields or website access/);
  assert.match(changelog, /collapses AI endpoint fields by default in Fast mode/);
  assert.match(changelog, /API Key field now has an explicit show\/hide toggle/);
  assert.match(changelog, /neutral Provider\/Connection wording/);
  assert.match(changelog, /no preview has been generated yet/);
  assert.match(changelog, /Chinese popup title now keeps the Marko brand visible/);
  assert.match(changelog, /Settings page header now keeps the Marko brand visible/);
  assert.match(changelog, /Popup backup action now says Backup Now/);
  assert.match(changelog, /Popup setup primary action now says Open Settings/);
  assert.match(changelog, /Settings organization rules now use the same Fast\/Balanced\/Complete segmented control as the popup/);
  assert.match(changelog, /Settings automation now uses a direct Silent organize switch/);
  assert.match(changelog, /Settings automation fallback labels now match the simplified Silent organize wording/);
  assert.match(changelog, /Settings fallback section headings now match the shorter Rules, Auto, Advanced, and Backups labels/);
  assert.match(changelog, /Settings fallback labels, hints, and placeholders now match the current English i18n copy before translations load/);
  assert.match(changelog, /Release tests now fail when HTML fallback copy drifts from the current English i18n text/);
  assert.match(changelog, /README hero artwork now shows the Marko brand instead of the old Smart Bookmark AI label/);
  assert.match(changelog, /Release tests now verify README local links and images resolve to existing files or directories/);
  assert.match(changelog, /Release tests now lock new-install and reset defaults to OpenAI, Fast mode, and Silent organize off/);
  assert.match(changelog, /keeps the interval field disabled until Silent organize is turned on/);
  assert.match(changelog, /Popup progress now estimates remaining time/);
  assert.match(changelog, /warns when the background status has not changed for 45 seconds/);
  assert.match(changelog, /inline wait-or-cancel suggestion/);
  assert.match(changelog, /direct cancel action/);
  assert.match(changelog, /one-click stop-and-use-Fast action/);
  assert.match(changelog, /without reloading the full popup state every second/);
  assert.match(changelog, /Added `npm run render:store-assets`/);
  assert.match(changelog, /playwright-core/);
  assert.match(changelog, /without downloading a browser/);
  assert.match(changelog, /Added `npm run install:e2e-browser`/);
  assert.match(changelog, /Playwright browser-cache discovery/);
  assert.match(changelog, /Settings connection fields now expose the selected mode requirement hint/);
  assert.match(changelog, /avoid implying Fast mode needs API credentials/);
  assert.match(changelog, /show how many uncached bookmarks require model classification/);
  assert.match(changelog, /Popup action failures now keep their inline error visible/);
  assert.match(changelog, /Popup action error responses now keep their specific failure message/);
  assert.match(changelog, /Popup action successes now preserve refresh-failure feedback/);
  assert.match(changelog, /Added `npm run audit:ui`/);
  assert.match(changelog, /separates expected long single-line input value scrolling from actual form-control layout overflow/);
  assert.match(changelog, /retries a layout case once after a transient CDP timeout/);
  assert.match(changelog, /Added `npm run e2e:extension` and `npm run verify:release:full`/);
  assert.match(changelog, /settings Backup UI create, inline restore confirmation, and inline delete confirmation/);
  assert.match(changelog, /stale progress stop-and-use-Fast recovery/);
  assert.match(changelog, /seeds a temporary bookmark profile and verifies manual backup, Fast preview, Apply Plan/);
  assert.match(changelog, /deletes a generated unprocessed item and verifies the live bookmark tree and warning count/);
  assert.match(changelog, /restores the original manual backup, verifies the duplicate returns, deletes that backup record/);
  assert.match(changelog, /saves settings through the real options UI and verifies DeepSeek batch-size capping/);
  assert.match(changelog, /100-bookmark Fast-mode scale case/);
  assert.match(changelog, /Added `npm run verify:release`/);
  assert.match(changelog, /validates README screenshots, Chrome Web Store promo image dimensions, and icon sizes/);
  assert.match(changelog, /Buttons and status badges now shrink and wrap/);
  assert.match(changelog, /startup controls now stay disabled/);
  assert.match(changelog, /Long settings status and hint text now wraps safely/);
  assert.match(changelog, /Popup state refresh failures now show an inline error/);
  assert.match(changelog, /Popup folder-summary load failures now render an inline detail message/);
  assert.match(changelog, /Popup header actions and the phase badge now wrap/);
  assert.match(changelog, /Saved preview validation now includes whitelist-preserved bookmarks/);
  assert.match(changelog, /Backup restore now preserves existing backup folders/);
  assert.match(changelog, /fewer than 25 AI candidates/);
  assert.match(changelog, /local fallback now keeps and caches completed mini-request classifications/);
  assert.match(changelog, /fallback status now distinguishes partial AI results/);
  assert.match(changelog, /Complete-mode site-access errors and duplicate cleanup suggestions/);
  assert.match(changelog, /DeepSeek-compatible runs now keep the same runtime provider label/);
  assert.match(changelog, /Popup preview checks now merge provider defaults/);
  assert.match(changelog, /Complete-mode preview no longer asks for broad website access/);
  assert.match(changelog, /Complete-mode dead-link checks now scan up to eight links/);
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
  assert.match(changelog, /Settings access requests now keep the permission decision separate/);
  assert.match(changelog, /Settings save and Test & Save now keep API or automation permission-denied feedback visible/);
  assert.match(changelog, /clear stale backup error text/);
  assert.match(changelog, /Backup actions now preserve the completed action message/);
  assert.match(readme, /npm test/);
  assert.match(readme, /npm run audit:ui/);
  assert.match(readme, /npm run e2e:extension/);
  assert.match(readme, /npm run install:e2e-browser/);
  assert.match(readme, /Playwright Chromium/);
  assert.match(readme, /real popup Preview -> Apply Plan confirmation click flow/);
  assert.match(readme, /stale progress stop-and-use-Fast recovery/);
  assert.match(readme, /real popup unprocessed-item Delete button/);
  assert.match(readme, /real settings Backup UI create\/restore\/delete flow/);
  assert.match(readme, /100-bookmark Fast-mode scale run/);
  assert.match(readme, /manual backup, Fast preview, duplicate cleanup/);
  assert.match(readme, /Backup UI create\/restore\/delete/);
  assert.match(readme, /real options UI save/);
  assert.match(readme, /DeepSeek batch-size capping/);
  assert.match(readme, /Automated Chrome runs are headless by default/);
  assert.match(readme, /Playwright browser cache/);
  assert.match(readme, /PLAYWRIGHT_BROWSERS_PATH/);
  assert.match(readme, /MARKO_SHOW_BROWSER=1/);
  assert.match(readme, /MARKO_EXTENSION_SCREENSHOT_DIR=\/tmp\/marko-e2e/);
  assert.match(readme, /npm run render:store-assets/);
  assert.match(readme, /playwright-core/);
  assert.match(readme, /without downloading a browser/);
  assert.match(readme, /npm install/);
  assert.match(readme, /MARKO_RENDER_BROWSER/);
  assert.match(readme, /npm run verify:release/);
  assert.match(readme, /npm run verify:release:full/);
  assert.match(readme, /npm run package:webstore/);
  assert.match(readme, /Popup mode switch/);
  assert.match(readme, /keeps AI connection fields collapsed until Balanced or Complete needs them/);
  assert.match(readme, /keeps API keys hidden by default with a show\/hide check/);
  assert.match(readme, /same Fast\/Balanced\/Complete segmented control as the popup/);
  assert.match(readme, /built-in domain rules/);
  assert.match(readme, /unless Balanced\/Complete preview or enabled auto organize needs external access/);
  assert.match(readme, /manual-review fallback finish locally/);
  assert.match(readme, /Fast automatic organize can run locally without an API key/);
  assert.match(readme, /Silent organize switch enables the interval field only when needed/);
  assert.match(readme, /automation access still needs approval/);
  assert.match(readme, /shows the permission impact inline before saving/);
  assert.match(readme, /Settings warn inline before a slow-model batch cap/);
  assert.match(readme, /estimated remaining time/);
  assert.match(readme, /If the background status has not changed for 45 seconds/);
  assert.match(readme, /one-click stop-and-use-Fast action/);
  assert.match(readme, /plus direct cancel/);
  assert.match(readme, /lightweight once-per-second clock/);
  assert.match(readme, /Batches wake immediately while a Chrome alarm remains as fallback/);
  assert.match(readme, /Complete mode checks up to 8 links at a time/);
  assert.doesNotMatch(readme, /unless you start an organize run/);
  assert.match(readme, /restoring creates a fresh local snapshot first/);
  assert.match(readmeZh, /DeepSeek 兼容接口/);
  assert.match(readmeZh, /npm test/);
  assert.match(readmeZh, /npm run audit:ui/);
  assert.match(readmeZh, /npm run e2e:extension/);
  assert.match(readmeZh, /npm run install:e2e-browser/);
  assert.match(readmeZh, /Playwright Chromium/);
  assert.match(readmeZh, /真实弹窗“预览整理 -> 应用方案 -> 备份并应用”点击流/);
  assert.match(readmeZh, /慢任务一键切到快速模式恢复/);
  assert.match(readmeZh, /真实弹窗未处理项删除按钮/);
  assert.match(readmeZh, /真实设置页备份创建\/恢复\/删除点击流/);
  assert.match(readmeZh, /100 条书签快速模式规模用例/);
  assert.match(readmeZh, /手动备份、快速预览、重复清理/);
  assert.match(readmeZh, /未处理项删除/);
  assert.match(readmeZh, /备份创建\/恢复\/删除点击流/);
  assert.match(readmeZh, /真实设置页保存/);
  assert.match(readmeZh, /DeepSeek 批量压低/);
  assert.match(readmeZh, /headless 后台运行，不会打开可见浏览器窗口/);
  assert.match(readmeZh, /Playwright 浏览器缓存/);
  assert.match(readmeZh, /PLAYWRIGHT_BROWSERS_PATH/);
  assert.match(readmeZh, /MARKO_SHOW_BROWSER=1/);
  assert.match(readmeZh, /批处理会优先即时唤醒，Chrome alarm 仅作为后台兜底/);
  assert.match(readmeZh, /MARKO_EXTENSION_SCREENSHOT_DIR=\/tmp\/marko-e2e/);
  assert.match(readmeZh, /npm run render:store-assets/);
  assert.match(readmeZh, /playwright-core/);
  assert.match(readmeZh, /不会下载浏览器/);
  assert.match(readmeZh, /npm install/);
  assert.match(readmeZh, /MARKO_RENDER_BROWSER/);
  assert.match(readmeZh, /npm run verify:release/);
  assert.match(readmeZh, /npm run verify:release:full/);
  assert.match(readmeZh, /npm run package:webstore/);
  assert.match(readmeZh, /弹窗模式切换/);
  assert.match(readmeZh, /AI 连接字段会在平衡或完整模式需要时再展开/);
  assert.match(readmeZh, /API Key 默认隐藏/);
  assert.match(readmeZh, /手动显示\/隐藏/);
  assert.match(readmeZh, /和弹窗一致的快速\/平衡\/完整三段控件/);
  assert.match(readmeZh, /内置域名规则/);
  assert.match(readmeZh, /待手动分类兜底会在本地完成/);
  assert.match(readmeZh, /快速自动整理可以不填 API Key 本地运行/);
  assert.match(readmeZh, /静默整理开关打开后才启用间隔设置/);
  assert.match(readmeZh, /自动整理权限仍未授权时明确提示/);
  assert.match(readmeZh, /保存前直接显示权限影响/);
  assert.match(readmeZh, /慢模型批量被压低前先提示/);
  assert.match(readmeZh, /预计剩余时间/);
  assert.match(readmeZh, /45 秒没有后台更新/);
  assert.match(readmeZh, /一键停止并改用快速模式/);
  assert.match(readmeZh, /保留直接取消/);
  assert.match(readmeZh, /每秒轻量刷新/);
  assert.match(readmeZh, /完整模式每次最多并发检测 8 条链接/);
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
  assert.match(releaseNotes, /Fast mode no longer blocks preview or settings save when Base URL or model name are blank/);
  assert.match(releaseNotes, /Settings connection now explains which modes need model fields or website access/);
  assert.match(releaseNotes, /keeps AI connection fields collapsed by default/);
  assert.match(releaseNotes, /offers a show\/hide toggle/);
  assert.match(releaseNotes, /neutral Connection and Provider labels/);
  assert.match(releaseNotes, /no preview has been generated yet/);
  assert.match(releaseNotes, /Chinese popup title now keeps the Marko brand visible/);
  assert.match(releaseNotes, /Settings page header now keeps the Marko brand visible/);
  assert.match(releaseNotes, /Popup backup action now says Backup Now/);
  assert.match(releaseNotes, /Popup setup primary action now says Open Settings/);
  assert.match(releaseNotes, /Settings organization rules now use the same Fast\/Balanced\/Complete segmented control as the popup/);
  assert.match(releaseNotes, /Settings automation now uses a direct Silent organize switch/);
  assert.match(releaseNotes, /Settings automation fallback labels now match the simplified Silent organize wording/);
  assert.match(releaseNotes, /Settings fallback section headings now match the shorter Rules, Auto, Advanced, and Backups labels/);
  assert.match(releaseNotes, /Settings fallback labels, hints, and placeholders now match the current English i18n copy before translations load/);
  assert.match(releaseNotes, /Release tests now fail when HTML fallback copy drifts from the current English i18n text/);
  assert.match(releaseNotes, /README hero artwork now shows the Marko brand instead of the old Smart Bookmark AI label/);
  assert.match(releaseNotes, /Release tests now verify README local links and images resolve to existing files or directories/);
  assert.match(releaseNotes, /new installs and resets default to the OpenAI provider, Fast mode, and Silent organize off/);
  assert.match(releaseNotes, /automation interval stays disabled until Silent organize is turned on/);
  assert.match(releaseNotes, /Popup progress now estimates remaining time/);
  assert.match(releaseNotes, /warns when the background status has not changed for 45 seconds/);
  assert.match(releaseNotes, /inline wait-or-cancel suggestion/);
  assert.match(releaseNotes, /direct cancel action/);
  assert.match(releaseNotes, /one-click stop-and-use-Fast action/);
  assert.match(releaseNotes, /without reloading the full popup state every second/);
  assert.match(releaseNotes, /Added `npm run render:store-assets`/);
  assert.match(releaseNotes, /playwright-core/);
  assert.match(releaseNotes, /without downloading a browser/);
  assert.match(releaseNotes, /Added `npm run install:e2e-browser`/);
  assert.match(releaseNotes, /Playwright browser-cache discovery/);
  assert.match(releaseNotes, /Settings connection fields now expose the selected mode requirement hint/);
  assert.match(releaseNotes, /Settings Privacy now falls back from tab creation to window opening/);
  assert.match(releaseNotes, /Popup Settings shortcuts now show an inline error if both tab creation and the options-page fallback fail/);
  assert.match(releaseNotes, /show how many uncached bookmarks require model classification/);
  assert.match(releaseNotes, /Popup action failures now keep their inline error visible/);
  assert.match(releaseNotes, /Popup action error responses now keep their specific failure message/);
  assert.match(releaseNotes, /Popup action successes now preserve refresh-failure feedback/);
  assert.match(releaseNotes, /Added `npm run audit:ui`/);
  assert.match(releaseNotes, /separates expected long single-line input value scrolling from actual form-control layout overflow/);
  assert.match(releaseNotes, /retries the current layout case once after a transient CDP timeout/);
  assert.match(releaseNotes, /run headless by default/);
  assert.match(releaseNotes, /Added `npm run e2e:extension` and `npm run verify:release:full`/);
  assert.match(releaseNotes, /stale progress stop-and-use-Fast recovery/);
  assert.match(releaseNotes, /clicks the real popup unprocessed-item Delete button/);
  assert.match(releaseNotes, /settings Backup UI create, inline restore confirmation, and inline delete confirmation/);
  assert.match(releaseNotes, /seeds temporary bookmarks and verifies manual backup, Fast preview, Apply Plan/);
  assert.match(releaseNotes, /deletes a generated unprocessed item and verifies the live bookmark tree and warning count/);
  assert.match(releaseNotes, /restores the original manual backup, verifies the duplicate returns, deletes that backup record/);
  assert.match(releaseNotes, /saves settings through the real options UI and verifies DeepSeek batch-size capping/);
  assert.match(releaseNotes, /100-bookmark Fast-mode scale case/);
  assert.match(releaseNotes, /Added `npm run verify:release`/);
  assert.match(releaseNotes, /validates README screenshots, Chrome Web Store promo image dimensions, and icon sizes/);
  assert.match(releaseNotes, /Buttons and status badges now shrink and wrap/);
  assert.match(releaseNotes, /startup controls now stay disabled/);
  assert.match(releaseNotes, /Long settings status and hint text now wraps safely/);
  assert.match(releaseNotes, /Popup state refresh failures now show an inline error/);
  assert.match(releaseNotes, /Popup folder-summary load failures now render an inline detail message/);
  assert.match(releaseNotes, /Whitelist website catalog load failures now show a distinct inline error/);
  assert.match(releaseNotes, /Popup header actions and the phase badge now wrap/);
  assert.match(releaseNotes, /Complete-mode dead-link checks now scan up to eight links/);
  assert.match(releaseNotes, /fewer than 25 AI candidates/);
  assert.match(releaseNotes, /Saved preview validation now includes whitelist-preserved bookmarks/);
  assert.match(releaseNotes, /Backup restore now preserves existing backup folders/);
  assert.match(releaseNotes, /keeps and caches any completed mini-request classifications/);
  assert.match(releaseNotes, /shows how many were preserved/);
  assert.match(releaseNotes, /Fast mode needs API credentials/);
  assert.match(releaseNotes, /speed-mode changes now save against merged provider defaults/);
  assert.match(releaseNotes, /Fast automatic organize can now run locally without an API key/);
  assert.match(releaseNotes, /Balanced automatic organize requires model credentials/);
  assert.match(releaseNotes, /auto organize access is not granted/);
  assert.match(releaseNotes, /warn before capping slow-model batch sizes/);
  assert.match(releaseNotes, /auto-organize mode's permission impact inline/);
  assert.match(releaseNotes, /explicit granted status/);
  assert.match(releaseNotes, /Backup failures before applying a saved preview/);
  assert.match(releaseNotes, /only for preview-apply failures/);
  assert.match(releaseNotes, /wakes the next batch immediately while keeping a Chrome alarm fallback/);
  assert.match(releaseNotes, /re-split large batches before each request/);
  assert.match(releaseNotes, /cap runtime batches at 9 bookmarks/);
  assert.match(releaseNotes, /cap each model request at 3 bookmarks/);
  assert.match(releaseNotes, /run up to three mini requests at a time/);
  assert.match(releaseNotes, /skip the separate taxonomy-planning request/);
  assert.match(releaseNotes, /sends only unfinished bookmarks to local fallback/);
  assert.match(releaseNotes, /reuses the popup preflight coverage result/);
  assert.match(releaseNotes, /inline confirmations and status messages/);
  assert.match(releaseNotes, /preview and error states cannot mutate bookmarks/);
  assert.match(releaseNotes, /lock the whole action group while one item is being handled/);
  assert.match(releaseNotes, /removes the stale manual-review count from the popup folder summary/);
  assert.match(releaseNotes, /creates a fresh local snapshot/);
  assert.match(releaseNotes, /keeps the saved connection visible/);
  assert.match(releaseNotes, /Access-status refresh failures now restore controls/);
  assert.match(releaseNotes, /separate the permission decision from follow-up status refresh failures/);
  assert.match(releaseNotes, /Settings save and Test & Save keep API or automation permission-denied feedback visible/);
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
  const zhShortDescription = storeListing.match(/### 简短描述\n([^\n]+)/)?.[1] || "";
  const enShortDescription = storeListing.match(/### Short description\n([^\n]+)/)?.[1] || "";
  assert.ok(zhShortDescription.length > 0, "Chinese store short description is missing");
  assert.ok(enShortDescription.length > 0, "English store short description is missing");
  assert.ok(zhShortDescription.length <= 132, "Chinese store short description is too long");
  assert.ok(enShortDescription.length <= 132, "English store short description is too long");
  assert.match(storeListing, /### 单一用途/);
  assert.match(storeListing, /### 产品详情/);
  assert.match(storeListing, /隐私说明：/);
  assert.match(storeListing, /### Single purpose/);
  assert.match(storeListing, /### Detailed description/);
  assert.match(storeListing, /Privacy summary:/);
  assert.match(storeListing, /without calling the model again/);
  assert.match(storeListing, /模型服务商/);
  assert.match(storeListing, /应用已保存的预览方案会直接本地重建，不会再次请求模型/);
  assert.match(storeListing, /API Key、备份快照、分类缓存和死链缓存保存在浏览器本地/);
  assert.match(storeListing, /只有完整模式会直接访问书签对应的网站/);
  assert.match(storeListing, /扩展开发者不会接收你的书签数据/);
  assert.match(storeListing, /model provider chosen by the user/);
  assert.match(storeListing, /API keys, backups, and caches are stored locally in the browser/);
  assert.match(storeListing, /only Complete mode sends requests directly to bookmarked websites/);
  assert.match(storeListing, /The extension developer does not receive bookmark data/);
  assert.match(storeListing, /changed directly in the popup/);
  assert.match(storeListing, /Balanced keeps AI classification without website scans/);
  assert.match(storeListing, /built-in domain rules/);
  assert.match(storeListing, /Backup failures before applying a saved preview/);
  assert.match(storeListing, /only after a preview-apply failure/);
  assert.match(storeListing, /re-split large batches before each request/);
  assert.match(storeListing, /cap runtime batches at 9 bookmarks/);
  assert.match(storeListing, /cap each model request at 3 bookmarks/);
  assert.match(storeListing, /run up to three mini requests at a time/);
  assert.match(storeListing, /auto organize access is not granted/);
  assert.match(storeListing, /slow-model batch sizes are capped/);
  assert.match(storeListing, /Complete-mode link checks scan up to 8 links/);
  assert.match(storeListing, /skip the separate taxonomy-planning request/);
  assert.match(storeListing, /fewer than 25 bookmarks still need AI/);
  assert.match(storeListing, /finishes with local fallback/);
  assert.match(storeListing, /OpenAI、DeepSeek、MiniMax、Anthropic/);
  assert.match(storeListing, /OpenAI, DeepSeek, MiniMax, Anthropic/);
  assert.match(storeListing, /inline confirmations and validation feedback/);
  assert.match(storeListing, /Popup Settings shortcuts show inline feedback if both opening paths fail/);
  assert.match(storeListing, /Popup action errors keep their specific failure message/);
  assert.match(storeListing, /Popup action successes keep refresh-failure feedback visible/);
  assert.match(storeListing, /pre-release UI audit script checks bilingual narrow-screen layouts/);
  assert.match(storeListing, /single release gate runs tests, UI audit, package generation/);
  assert.match(storeListing, /validates README screenshots, store promo image dimensions, and icon sizes/);
  assert.match(storeListing, /真实解压扩展冒烟测试/);
  assert.match(storeListing, /real unpacked-extension smoke test/);
  assert.match(storeListing, /background\.js` service worker/);
  assert.match(storeListing, /Buttons and status badges shrink and wrap/);
  assert.match(storeListing, /startup controls stay disabled/);
  assert.match(storeListing, /Long settings status and hint text wraps safely/);
  assert.match(storeListing, /Settings Privacy falls back from tab creation to window opening/);
  assert.match(storeListing, /Popup state refresh failures show an inline error/);
  assert.match(storeListing, /folder-summary load failures show an inline detail message/);
  assert.match(storeListing, /Whitelist website catalog load failures show a distinct inline error/);
  assert.match(storeListing, /read-only until an organize\/apply run completes/);
  assert.match(storeListing, /lock the whole action group while one item is being kept or deleted/);
  assert.match(storeListing, /静默整理使用直接开关/);
  assert.match(storeListing, /direct Silent organize switch/);
  assert.match(storeListing, /interval field is enabled only after the switch is on/);
  assert.match(storeListing, /runs locally, needs model endpoint access, or needs website access/);
  assert.match(storeListing, /Save and Test & Save keep API or automation permission-denied feedback visible/);
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
  assert.match(storeAssetRenderer, /#settingsSpeedModeFastButton/);
  assert.match(storeAssetRenderer, /require\("playwright-core"\)\.chromium/);
  assert.match(storeAssetRenderer, /MARKO_RENDER_BROWSER/);
  assert.match(storeAssetRenderer, /MARKO_RENDER_HEADLESS/);
  assert.match(storeAssetRenderer, /linear-gradient\(\$\{palette\.lineSoft\} 1px, transparent 1px\)/);
  assert.match(storeAssetRenderer, /letter-spacing: 0/);
  assert.match(storeAssetRenderer, /border-radius: 8px/);
  assert.doesNotMatch(storeAssetRenderer, /require\("playwright"\)/);
  assert.doesNotMatch(storeAssetRenderer, /Chrome DevTools Protocol/);
  assert.doesNotMatch(storeAssetRenderer, /CdpClient/);
  assert.doesNotMatch(storeAssetRenderer, /radial-gradient/);
  assert.doesNotMatch(storeAssetRenderer, /letter-spacing: -/);
  assert.doesNotMatch(storeAssetRenderer, /waitForSelector\("#linkCheckMode"\)/);

  const layoutAuditor = fs.readFileSync(
    path.join(ROOT_DIR, "webstore/audit_ui_layout.mjs"),
    "utf8"
  );
  assert.match(layoutAuditor, /const auditCases = \[/);
  assert.match(layoutAuditor, /popup zh preview 320/);
  assert.match(layoutAuditor, /popup en stale running 320/);
  assert.match(layoutAuditor, /staleRunningSample/);
  assert.match(layoutAuditor, /popup en long error 320/);
  assert.match(layoutAuditor, /settings en connection 390/);
  assert.match(layoutAuditor, /settings zh organization 390/);
  assert.match(layoutAuditor, /settings en organization 390/);
  assert.match(layoutAuditor, /settings zh automation 390/);
  assert.match(layoutAuditor, /settings en automation 390/);
  assert.match(layoutAuditor, /settings zh backup 1280/);
  assert.match(layoutAuditor, /overflowElements/);
  assert.match(layoutAuditor, /scrollableControls/);
  assert.match(layoutAuditor, /scrollableValueControls/);
  assert.match(layoutAuditor, /isExpectedSingleLineValueScroll/);
  assert.match(layoutAuditor, /scrollable controls:/);
  assert.match(layoutAuditor, /clippedButtons/);
  assert.match(layoutAuditor, /Runtime\.exceptionThrown/);
  assert.match(layoutAuditor, /Page\.addScriptToEvaluateOnNewDocument/);
  assert.match(layoutAuditor, /CDP_COMMAND_TIMEOUT_MS = 20_000/);
  assert.match(layoutAuditor, /AUDIT_PAGE_ATTEMPTS = 2/);
  assert.match(layoutAuditor, /function isTransientCdpTimeout/);
  assert.match(layoutAuditor, /async function auditPageWithRetry/);
  assert.match(layoutAuditor, /Retrying \$\{auditCase\.label\} after transient CDP timeout/);
  assert.match(layoutAuditor, /waitForProcessExit/);
  assert.match(layoutAuditor, /removeDirectoryWithRetry/);

  const extensionE2e = fs.readFileSync(
    path.join(ROOT_DIR, "webstore/e2e_extension.mjs"),
    "utf8"
  );
  assert.match(extensionE2e, /MARKO_EXTENSION_BROWSER/);
  assert.match(extensionE2e, /staticBrowserCandidates/);
  assert.match(extensionE2e, /getPlaywrightBrowserCacheRoots/);
  assert.match(extensionE2e, /getPlaywrightBrowserCandidates/);
  assert.match(extensionE2e, /PLAYWRIGHT_BROWSERS_PATH/);
  assert.match(extensionE2e, /ms-playwright/);
  assert.match(extensionE2e, /npm run install:e2e-browser/);
  assert.match(extensionE2e, /MARKO_SHOW_BROWSER/);
  assert.match(extensionE2e, /MARKO_EXTENSION_HEADLESS/);
  assert.match(extensionE2e, /MARKO_EXTENSION_SCREENSHOT_DIR/);
  assert.match(extensionE2e, /CDP_COMMAND_TIMEOUT_MS = 20_000/);
  assert.match(extensionE2e, /OPTIONAL_SCREENSHOT_TIMEOUT_MS = 5_000/);
  assert.match(extensionE2e, /async function saveOptionalScreenshot/);
  assert.match(extensionE2e, /WARN optional screenshot skipped/);
  assert.match(extensionE2e, /Timed out waiting for CDP response to \$\{method\} after \$\{timeoutMs\}ms/);
  assert.match(extensionE2e, /Google Chrome for Testing/);
  assert.match(extensionE2e, /chrome-mac-arm64",\s*"Google Chrome for Testing\.app"/);
  assert.match(extensionE2e, /chrome-mac", "Chromium\.app"/);
  assert.match(extensionE2e, /--disable-extensions-except/);
  assert.match(extensionE2e, /--load-extension/);
  assert.match(extensionE2e, /--headless=new/);
  assert.match(extensionE2e, /service_worker/);
  assert.match(extensionE2e, /background\.js/);
  assert.match(extensionE2e, /chrome-extension:\/\/\$\{extensionId\}\/popup\.html/);
  assert.match(extensionE2e, /chrome-extension:\/\/\$\{extensionId\}\/options\.html#connection/);
  assert.match(extensionE2e, /Page\.captureScreenshot/);
  assert.match(extensionE2e, /CREATE_MANUAL_BACKUP/);
  assert.match(extensionE2e, /CHECK_LOCAL_MODEL_REQUIREMENT/);
  assert.match(extensionE2e, /START_PREVIEW/);
  assert.match(extensionE2e, /APPLY_PREVIEW_PLAN/);
  assert.match(extensionE2e, /setupPopupUiFlowExpression/);
  assert.match(extensionE2e, /popupUiFlowExpression/);
  assert.match(extensionE2e, /runPopupUiFlow/);
  assert.match(extensionE2e, /formatPopupUiFlowFailures/);
  assert.match(extensionE2e, /setupStaleFastRecoveryFlowExpression/);
  assert.match(extensionE2e, /staleFastRecoveryFlowExpression/);
  assert.match(extensionE2e, /runStaleFastRecoveryFlow/);
  assert.match(extensionE2e, /formatStaleFastRecoveryFlowFailures/);
  assert.match(extensionE2e, /smartBookmarkActiveJob/);
  assert.match(extensionE2e, /\[data-stale-status-fast-button\]/);
  assert.match(extensionE2e, /stale Fast recovery did not save Fast mode/);
  assert.match(extensionE2e, /stale Fast recovery did not record a cancellation request/);
  assert.match(extensionE2e, /OK stale Fast recovery flow/);
  assert.match(extensionE2e, /popup-stale-fast-recovery-flow-320\.png/);
  assert.match(extensionE2e, /popupUnprocessedUiFlowExpression/);
  assert.match(extensionE2e, /runPopupUnprocessedUiFlow/);
  assert.match(extensionE2e, /formatPopupUnprocessedUiFlowFailures/);
  assert.match(extensionE2e, /document\.getElementById\("startButton"\)/);
  assert.match(extensionE2e, /\[data-apply-confirmation-primary\]/);
  assert.match(extensionE2e, /\[data-unprocessed-action-button="delete"\]/);
  assert.match(extensionE2e, /clickButton\(previewButton\)/);
  assert.match(extensionE2e, /clickButton\(applyPlanButton\)/);
  assert.match(extensionE2e, /confirmationText/);
  assert.match(extensionE2e, /finalWarningCount/);
  assert.match(extensionE2e, /popup-ui-preview-apply-flow-400\.png/);
  assert.match(extensionE2e, /popup-unprocessed-delete-flow-400\.png/);
  assert.match(extensionE2e, /popup still shows one manual-review item/);
  assert.match(extensionE2e, /OK popup UI flow/);
  assert.match(extensionE2e, /OK popup unprocessed UI flow/);
  assert.match(extensionE2e, /setupOptionsBackupUiFlowExpression/);
  assert.match(extensionE2e, /optionsBackupUiFlowExpression/);
  assert.match(extensionE2e, /runOptionsBackupUiFlow/);
  assert.match(extensionE2e, /formatOptionsBackupUiFlowFailures/);
  assert.match(extensionE2e, /createBackupButton/);
  assert.match(extensionE2e, /\[data-backup-action-button="restore"\]/);
  assert.match(extensionE2e, /\[data-backup-action-button="delete"\]/);
  assert.match(extensionE2e, /\[data-backup-confirm-primary\]/);
  assert.match(extensionE2e, /options-backup-ui-restore-delete-1280\.png/);
  assert.match(extensionE2e, /OK options backup UI flow/);
  assert.match(extensionE2e, /RESOLVE_UNPROCESSED_ENTRY/);
  assert.match(extensionE2e, /RESTORE_BACKUP_ENTRY/);
  assert.match(extensionE2e, /DELETE_BACKUP_ENTRY/);
  assert.match(extensionE2e, /largeFastLibraryFlowExpression/);
  assert.match(extensionE2e, /runLargeFastLibraryFlow/);
  assert.match(extensionE2e, /formatLargeFastLibraryFlowFailures/);
  assert.match(extensionE2e, /expected to seed 100 bookmarks/);
  assert.match(extensionE2e, /large Fast preview unexpectedly used AI classification/);
  assert.match(extensionE2e, /large Fast preview took too long/);
  assert.match(extensionE2e, /OK large Fast library flow/);
  assert.match(extensionE2e, /optionsSaveExpression/);
  assert.match(extensionE2e, /settingsSpeedModeBalancedButton/);
  assert.match(extensionE2e, /settingsSpeedModeFastButton/);
  assert.match(extensionE2e, /apiKeyVisibilityButton/);
  assert.match(extensionE2e, /apiKeyTypeBeforeToggle/);
  assert.match(extensionE2e, /apiKeyTypeAfterShow/);
  assert.match(extensionE2e, /apiKeyTypeAfterHide/);
  assert.match(extensionE2e, /options API key visibility toggle did not switch between password and text modes/);
  assert.match(extensionE2e, /options API key visibility toggle did not update aria-pressed/);
  assert.match(extensionE2e, /element\.type === "checkbox"/);
  assert.match(extensionE2e, /element\.checked = value === true \|\| value === "true"/);
  assert.match(extensionE2e, /setValue\("autoOrganizeEnabled", false\)/);
  assert.match(extensionE2e, /clickInput\("autoOrganizeEnabled"\)/);
  assert.match(extensionE2e, /options Silent organize switch did not turn on/);
  assert.match(extensionE2e, /options Silent organize switch did not turn off/);
  assert.match(extensionE2e, /config\.autoOrganizeIntervalHours === 24/);
  assert.match(extensionE2e, /automationIntervalDisabledBefore/);
  assert.match(extensionE2e, /options save did not fall back to the default disabled automation interval/);
  assert.match(extensionE2e, /options speed-mode segmented control did not activate Balanced mode/);
  assert.match(extensionE2e, /options speed-mode segmented control did not return to Fast mode/);
  assert.match(extensionE2e, /config\.provider === "deepseek"/);
  assert.match(extensionE2e, /config\.batchSize === 9/);
  assert.match(extensionE2e, /balancedConnectionOpen/);
  assert.match(extensionE2e, /fastConnectionOpen/);
  assert.match(extensionE2e, /balancedButton=/);
  assert.match(extensionE2e, /fastButton=/);
  assert.match(extensionE2e, /automationOn=/);
  assert.match(extensionE2e, /automationOff=/);
  assert.match(extensionE2e, /interval=/);
  assert.match(extensionE2e, /auto-open AI connection fields for Balanced mode/);
  assert.match(extensionE2e, /E2E saved prompt/);
  assert.match(extensionE2e, /openai\\.com => AI Saved/);
  assert.match(extensionE2e, /formatCoreFlowFailures/);
  assert.match(extensionE2e, /duplicateGithub/);
  assert.match(extensionE2e, /resolvedBookmarks/);
  assert.match(extensionE2e, /resolveStatus/);
  assert.match(extensionE2e, /restoredBookmarks/);
  assert.match(extensionE2e, /backupRecordsAfterDelete/);
  assert.match(extensionE2e, /backupRecordCount/);
  assert.match(extensionE2e, /popup completed flow 400/);
  assert.match(extensionE2e, /phaseBadgeText/);
  assert.match(extensionE2e, /speedModeBalancedButton/);
  assert.match(extensionE2e, /settings-tab-backup/);

  const releaseVerifier = fs.readFileSync(
    path.join(ROOT_DIR, "webstore/verify_release.mjs"),
    "utf8"
  );
  assert.match(releaseVerifier, /tests\/run-tests\.js/);
  assert.match(releaseVerifier, /webstore\/audit_ui_layout\.mjs/);
  assert.match(releaseVerifier, /verifyStoreTextMaterials/);
  assert.match(releaseVerifier, /Store text materials/);
  assert.match(releaseVerifier, /CHROME_SHORT_DESCRIPTION_MAX_LENGTH = 132/);
  assert.match(releaseVerifier, /STORE_LISTING_REQUIRED_HEADINGS/);
  assert.match(releaseVerifier, /webstore\/STORE_LISTING\.md/);
  assert.match(releaseVerifier, /webstore\/REVIEW_NOTES\.md/);
  assert.match(releaseVerifier, /webstore\/PRIVACY_POLICY\.md/);
  assert.match(releaseVerifier, /assertTextExcludesAll/);
  assert.match(releaseVerifier, /contains internal-only text/);
  assert.match(releaseVerifier, /发布前事项/);
  assert.match(releaseVerifier, /webstore\/PUBLISH_CHECKLIST\.md/);
  assert.match(releaseVerifier, /webstore\/GITHUB_LINKS_TEMPLATE\.md/);
  assert.match(releaseVerifier, /verifyStoreAssets/);
  assert.match(releaseVerifier, /README_SCREENSHOTS/);
  assert.match(releaseVerifier, /EXACT_IMAGE_DIMENSIONS/);
  assert.match(releaseVerifier, /chrome-web-store-screenshot-1280x800\.png/);
  assert.match(releaseVerifier, /icons\/icon-128\.png/);
  assert.match(releaseVerifier, /webstore\/build_extension_package\.mjs/);
  assert.match(releaseVerifier, /Validate ZIP archive/);
  assert.match(releaseVerifier, /assertZipContents/);
  assert.match(releaseVerifier, /DISALLOWED_PACKAGE_PATTERNS/);

  const layoutAuditorHeadless = fs.readFileSync(
    path.join(ROOT_DIR, "webstore/audit_ui_layout.mjs"),
    "utf8"
  );
  assert.match(layoutAuditorHeadless, /MARKO_SHOW_BROWSER/);
  assert.match(layoutAuditorHeadless, /MARKO_AUDIT_HEADLESS/);
  assert.match(layoutAuditorHeadless, /--headless=new/);

  const reviewNotes = fs.readFileSync(path.join(ROOT_DIR, "webstore/REVIEW_NOTES.md"), "utf8");
  assert.match(reviewNotes, /复用已保存方案/);
  assert.match(reviewNotes, /平衡\/完整模式预览或已开启自动整理且本地规则、缓存无法覆盖/);
  assert.match(reviewNotes, /平衡模式会跳过失效链接检测和单独目录规划请求，但保留 AI 分类/);
  assert.match(reviewNotes, /完整模式才会请求更广的网站访问权限/);
  assert.match(reviewNotes, /隐私披露/);
  assert.match(reviewNotes, /权限说明/);

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
  assert.doesNotMatch(webstorePrivacyPolicy, /发布前事项/);
  assert.doesNotMatch(webstorePrivacyPolicy, /将本文件发布到一个公开可访问的 HTTPS URL/);
  assert.doesNotMatch(webstorePrivacyPolicy, /在 Chrome Web Store 后台把该 URL 作为隐私政策链接填写/);

  const publishChecklist = fs.readFileSync(
    path.join(ROOT_DIR, "webstore/PUBLISH_CHECKLIST.md"),
    "utf8"
  );
  assert.match(publishChecklist, /不会再次请求模型/);
  assert.match(publishChecklist, /自动整理重建前都会自动备份/);
  assert.match(publishChecklist, /页面内确认/);
  assert.match(publishChecklist, /截图、宣传图和图标尺寸/);
  assert.match(publishChecklist, /商店文案、隐私政策、审核备注、发布清单/);
  assert.match(publishChecklist, /隐私披露/);
  assert.match(publishChecklist, /权限说明/);
  assert.match(publishChecklist, /npm run audit:ui/);
  assert.match(publishChecklist, /npm run e2e:extension/);
  assert.match(publishChecklist, /npm run install:e2e-browser/);
  assert.match(publishChecklist, /npm run render:store-assets/);
  assert.match(publishChecklist, /playwright-core/);
  assert.match(publishChecklist, /Playwright Chromium/);
  assert.match(publishChecklist, /Playwright 缓存/);
  assert.match(publishChecklist, /PLAYWRIGHT_BROWSERS_PATH/);
  assert.match(publishChecklist, /Chrome\/Chrome for Testing/);
  assert.match(publishChecklist, /自动化默认 headless 后台运行/);
  assert.match(publishChecklist, /MARKO_SHOW_BROWSER=1/);
  assert.match(publishChecklist, /临时书签可完成真实弹窗预览\/应用点击流、慢任务一键切到快速模式恢复、真实弹窗未处理项删除点击流、真实设置页备份创建\/恢复\/删除点击流、100 条书签快速模式规模用例、手动备份、快速预览、应用方案、重复清理、备份记录、真实设置页保存和 DeepSeek 批量压低验证/);
  assert.match(publishChecklist, /npm run verify:release/);
  assert.match(publishChecklist, /npm run verify:release:full/);
  assert.match(publishChecklist, /--load-extension is not allowed in Google Chrome, ignoring/);
  assert.match(publishChecklist, /Chrome for Testing 或 Chromium/);
  assert.match(publishChecklist, /弹窗在 320px、360px、400px 宽度下没有横向滚动/);
  assert.match(publishChecklist, /设置页在 390px、720px、1280px 宽度下没有横向滚动，连接区、整理规则区、自动化区、备份区/);
}

function testI18nCoverage() {
  const keys = collectI18nKeysFromFiles();
  for (const language of ["en", "zh-CN"]) {
    const i18n = loadI18nForLanguage(language);
    const missing = Array.from(keys).filter((key) => i18n.t(key) === key);
    assert.deepEqual(missing, [], `${language} missing i18n keys`);
  }
}

function testHtmlFallbacksMatchEnglishI18n() {
  const enI18n = loadI18nForLanguage("en");
  const htmlFiles = ["popup.html", "options.html", "privacy.html"];

  for (const file of htmlFiles) {
    const source = fs.readFileSync(path.join(ROOT_DIR, file), "utf8");

    for (const match of source.matchAll(/<([a-z0-9-]+)([^>]*\sdata-i18n="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/gi)) {
      const [, tagName, , key, content] = match;
      const fallback = normalizeFallbackText(content);
      const expected = normalizeFallbackText(enI18n.t(key));
      if (!fallback) {
        continue;
      }
      assert.equal(
        fallback,
        expected,
        `${file} <${tagName}> fallback for data-i18n="${key}" must match English i18n`
      );
    }

    for (const match of source.matchAll(/<([a-z0-9-]+)([^>]*\sdata-i18n-placeholder="([^"]+)"[^>]*)>/gi)) {
      const [, tagName, attributes, key] = match;
      const fallback = decodeHtmlEntities(
        attributes.match(/\splaceholder="([^"]*)"/)?.[1] || ""
      );
      const expected = enI18n.t(key);
      assert.equal(
        fallback,
        expected,
        `${file} <${tagName}> fallback for data-i18n-placeholder="${key}" must match English i18n`
      );
    }

    for (const match of source.matchAll(/<([a-z0-9-]+)([^>]*\sdata-i18n-aria-label="([^"]+)"[^>]*)>/gi)) {
      const [, tagName, attributes, key] = match;
      const fallback = decodeHtmlEntities(
        attributes.match(/\saria-label="([^"]*)"/)?.[1] || ""
      );
      const expected = enI18n.t(key);
      assert.equal(
        fallback,
        expected,
        `${file} <${tagName}> fallback for data-i18n-aria-label="${key}" must match English i18n`
      );
    }
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
  testReadmeLocalReferences();
  testExtensionPackageFileList();
  testSpeedModeSurface();
  testRuntimeBrandingSurface();
  testFirstRunFastDefaults();
  testPreviewApplySurface();
  testSlowModelResilienceSurface();
  testOptionsBackupInlineConfirmationSurface();
  testResponsiveTextHardeningSurface();
  testReleaseMaterialsCurrent();
  testI18nCoverage();
  testHtmlFallbacksMatchEnglishI18n();
  testI18nApplyDocumentRobustness();
  console.log("All tests passed.");
}

main();
