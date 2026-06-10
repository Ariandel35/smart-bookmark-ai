import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const PACKAGE_LIST_PATH = path.join(SCRIPT_DIR, "EXTENSION_PACKAGE_FILES.json");
const DISALLOWED_PACKAGE_PATTERNS = [
  /^docs\//,
  /^tests\//,
  /^webstore\//,
  /^README(?:\.|$)/,
  /^CHANGELOG\.md$/,
  /^CONTRIBUTING\.md$/,
  /^SUPPORT\.md$/,
  /^SECURITY\.md$/
];
const README_SCREENSHOTS = [
  "docs/screenshots/popup-store.png",
  "docs/screenshots/popup-apply-store.png",
  "docs/screenshots/options-connection-store.png",
  "docs/screenshots/options-organization-store.png",
  "docs/screenshots/options-backup-store.png"
];
const EXACT_IMAGE_DIMENSIONS = {
  "webstore/assets/chrome-web-store-screenshot-1280x800.png": [1280, 800],
  "webstore/assets/chrome-web-store-small-promo-440x280.png": [440, 280],
  "webstore/assets/chrome-web-store-marquee-1400x560.png": [1400, 560],
  "icons/icon-16.png": [16, 16],
  "icons/icon-32.png": [32, 32],
  "icons/icon-48.png": [48, 48],
  "icons/icon-128.png": [128, 128]
};
const CHROME_SHORT_DESCRIPTION_MAX_LENGTH = 132;
const EXPECTED_MANIFEST_PERMISSIONS = ["bookmarks", "storage", "alarms"];
const EXPECTED_OPTIONAL_HOST_PERMISSIONS = ["https://*/*", "http://*/*"];
const REQUIRED_MANIFEST_MESSAGE_KEYS = ["extName", "extDescription", "actionTitle"];
const OLD_BRAND_SNIPPETS = ["Smart Bookmark AI", "Smart Bookmark", "TidyMarks AI", "TidyMarks"];
const STORE_LISTING_REQUIRED_HEADINGS = [
  "### 单一用途",
  "### 简短描述",
  "### 产品详情",
  "隐私说明：",
  "### Single purpose",
  "### Short description",
  "### Detailed description",
  "Privacy summary:"
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");
}

function runStep(label, command, args) {
  console.log(`\n== ${label} ==`);
  execFileSync(command, args, {
    cwd: ROOT_DIR,
    stdio: "inherit"
  });
}

function assertTextIncludes(source, snippet, label) {
  if (!source.includes(snippet)) {
    throw new Error(`${label} is missing required text: ${snippet}`);
  }
}

function assertTextIncludesAll(source, snippets, label) {
  for (const snippet of snippets) {
    assertTextIncludes(source, snippet, label);
  }
  console.log(`OK ${label}`);
}

function assertTextExcludesAll(source, snippets, label) {
  for (const snippet of snippets) {
    if (source.includes(snippet)) {
      throw new Error(`${label} contains internal-only text: ${snippet}`);
    }
  }
}

function assertJsonEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function getManifestMessageKey(manifestValue, label) {
  const key = String(manifestValue || "").match(/^__MSG_([A-Za-z0-9_]+)__$/)?.[1];
  if (!key) {
    throw new Error(`${label} must use a localized __MSG_*__ manifest value.`);
  }
  return key;
}

function getSectionBody(source, heading) {
  const headingStart = source.indexOf(`${heading}\n`);
  if (headingStart === -1) {
    throw new Error(`Missing markdown heading: ${heading}`);
  }

  const bodyStart = headingStart + heading.length + 1;
  const remaining = source.slice(bodyStart);
  const nextHeadingIndex = remaining.search(/\n#{1,6}\s/);
  return (nextHeadingIndex === -1 ? remaining : remaining.slice(0, nextHeadingIndex)).trim();
}

function getSectionFirstLine(source, heading) {
  const body = getSectionBody(source, heading);
  const line = body.split(/\r?\n/).find((candidate) => candidate.trim());
  if (!line) {
    throw new Error(`Markdown heading has no body text: ${heading}`);
  }
  return line.trim();
}

function assertShortDescription(source, heading, label) {
  const shortDescription = getSectionFirstLine(source, heading);
  if (shortDescription.length > CHROME_SHORT_DESCRIPTION_MAX_LENGTH) {
    throw new Error(
      `${label} short description must be ${CHROME_SHORT_DESCRIPTION_MAX_LENGTH} characters or fewer, got ${shortDescription.length}.`
    );
  }
  console.log(`OK ${label} short description ${shortDescription.length}/${CHROME_SHORT_DESCRIPTION_MAX_LENGTH}`);
}

function readPngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`${path.relative(ROOT_DIR, filePath)} is not a PNG file.`);
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function assertImageDimensions(filePath, expectedDimensions) {
  const dimensions = readPngDimensions(filePath);
  const relativePath = path.relative(ROOT_DIR, filePath);
  if (dimensions.width !== expectedDimensions[0] || dimensions.height !== expectedDimensions[1]) {
    throw new Error(
      `${relativePath} must be ${expectedDimensions[0]}x${expectedDimensions[1]}, got ${dimensions.width}x${dimensions.height}.`
    );
  }
}

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error("Unable to find ZIP central directory.");
}

function readZipEntries(zipPath) {
  const buffer = fs.readFileSync(zipPath);
  const directoryOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(directoryOffset + 10);
  let cursor = buffer.readUInt32LE(directoryOffset + 16);
  const entries = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`Invalid ZIP central directory entry at offset ${cursor}.`);
    }

    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const nameStart = cursor + 46;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    entries.push(name);
    cursor = nameStart + nameLength + extraLength + commentLength;
  }

  return entries;
}

function verifyManifestMetadata() {
  console.log("\n== Manifest metadata ==");
  const manifest = readJson(path.join(ROOT_DIR, "manifest.json"));
  const packageJson = readJson(path.join(ROOT_DIR, "package.json"));

  if (manifest.manifest_version !== 3) {
    throw new Error(`Manifest version must be 3, got ${manifest.manifest_version}.`);
  }
  if (manifest.version !== packageJson.version) {
    throw new Error(`Manifest version ${manifest.version} does not match package version ${packageJson.version}.`);
  }
  if (manifest.default_locale !== "en") {
    throw new Error(`Manifest default_locale must be en, got ${manifest.default_locale || "(missing)"}.`);
  }
  if (manifest.homepage_url !== "https://github.com/Ariandel35/marko") {
    throw new Error(`Manifest homepage_url must point to the Marko GitHub repo, got ${manifest.homepage_url || "(missing)"}.`);
  }

  assertJsonEqual(manifest.permissions, EXPECTED_MANIFEST_PERMISSIONS, "Manifest permissions");
  assertJsonEqual(manifest.optional_host_permissions, EXPECTED_OPTIONAL_HOST_PERMISSIONS, "Manifest optional_host_permissions");
  if (Object.prototype.hasOwnProperty.call(manifest, "host_permissions")) {
    throw new Error("Manifest must not declare host_permissions; website/API access must remain optional.");
  }
  if (manifest.background?.service_worker !== "background.js") {
    throw new Error(`Manifest service worker must be background.js, got ${manifest.background?.service_worker || "(missing)"}.`);
  }
  if (manifest.action?.default_popup !== "popup.html") {
    throw new Error(`Manifest action popup must be popup.html, got ${manifest.action?.default_popup || "(missing)"}.`);
  }
  if (manifest.options_page !== "options.html") {
    throw new Error(`Manifest options_page must be options.html, got ${manifest.options_page || "(missing)"}.`);
  }

  const manifestMessageKeys = [
    getManifestMessageKey(manifest.name, "Manifest name"),
    getManifestMessageKey(manifest.description, "Manifest description"),
    getManifestMessageKey(manifest.action?.default_title, "Manifest action title")
  ];
  for (const key of REQUIRED_MANIFEST_MESSAGE_KEYS) {
    if (!manifestMessageKeys.includes(key)) {
      throw new Error(`Manifest must reference localized message key ${key}.`);
    }
  }

  for (const localePath of ["_locales/en/messages.json", "_locales/zh_CN/messages.json"]) {
    const messages = readJson(path.join(ROOT_DIR, localePath));
    for (const key of REQUIRED_MANIFEST_MESSAGE_KEYS) {
      if (!messages[key]?.message) {
        throw new Error(`${localePath} is missing manifest message ${key}.`);
      }
    }
    if (messages.extName.message !== "Marko" || messages.actionTitle.message !== "Marko") {
      throw new Error(`${localePath} extension name and action title must both be Marko.`);
    }
    if (messages.extDescription.message.length > CHROME_SHORT_DESCRIPTION_MAX_LENGTH) {
      throw new Error(`${localePath} extDescription must be ${CHROME_SHORT_DESCRIPTION_MAX_LENGTH} characters or fewer.`);
    }
    assertTextExcludesAll(
      Object.values(messages).map((entry) => entry?.message || "").join("\n"),
      OLD_BRAND_SNIPPETS,
      `${localePath} manifest messages`
    );
  }

  console.log("OK manifest metadata");
}

function verifyStoreAssets() {
  console.log("\n== Store image assets ==");
  for (const screenshotPath of README_SCREENSHOTS) {
    const absolutePath = path.join(ROOT_DIR, screenshotPath);
    const dimensions = readPngDimensions(absolutePath);
    if (dimensions.width < 800 || dimensions.height < 600) {
      throw new Error(
        `${screenshotPath} must be at least 800x600, got ${dimensions.width}x${dimensions.height}.`
      );
    }
    console.log(`OK ${screenshotPath} ${dimensions.width}x${dimensions.height}`);
  }

  for (const [assetPath, expectedDimensions] of Object.entries(EXACT_IMAGE_DIMENSIONS)) {
    assertImageDimensions(path.join(ROOT_DIR, assetPath), expectedDimensions);
    console.log(`OK ${assetPath} ${expectedDimensions[0]}x${expectedDimensions[1]}`);
  }
}

function verifyStoreTextMaterials() {
  console.log("\n== Store text materials ==");
  const storeListing = readText("webstore/STORE_LISTING.md");
  const reviewNotes = readText("webstore/REVIEW_NOTES.md");
  const privacyPolicy = readText("webstore/PRIVACY_POLICY.md");
  const publishChecklist = readText("webstore/PUBLISH_CHECKLIST.md");
  const githubLinks = readText("webstore/GITHUB_LINKS_TEMPLATE.md");
  const supportPolicy = readText("SUPPORT.md");
  const securityPolicy = readText("SECURITY.md");

  assertTextIncludesAll(storeListing, STORE_LISTING_REQUIRED_HEADINGS, "store listing sections");
  assertShortDescription(storeListing, "### 简短描述", "Chinese store listing");
  assertShortDescription(storeListing, "### Short description", "English store listing");
  assertTextIncludesAll(
    storeListing,
    [
      "模型服务商",
      "应用已保存的预览方案会直接本地重建，不会再次请求模型",
      "API Key、备份快照、分类缓存和死链缓存保存在浏览器本地",
      "只有完整模式会直接访问书签对应的网站",
      "扩展开发者不会接收你的书签数据",
      "model provider chosen by the user",
      "Applying a saved preview rebuilds locally without another model request",
      "API keys, backups, and caches are stored locally in the browser",
      "only Complete mode sends requests directly to bookmarked websites",
      "The extension developer does not receive bookmark data"
    ],
    "store listing privacy and data flow"
  );

  assertTextIncludesAll(
    reviewNotes,
    [
      "复用已保存方案",
      "快速模式",
      "平衡模式",
      "完整模式",
      "隐私披露",
      "权限说明",
      "不会把数据发送到开发者自有服务器"
    ],
    "review notes"
  );

  assertTextIncludesAll(
    privacyPolicy,
    [
      "最后更新：2026-06-09",
      "模型服务商、Base URL、模型名",
      "应用已保存的预览方案会直接本地重建，不会再次请求模型",
      "恢复旧备份前也会先为当前书签状态创建本地快照",
      "扩展开发者不会将这些数据上传到自有服务器"
    ],
    "webstore privacy policy"
  );
  assertTextExcludesAll(
    privacyPolicy,
    [
      "发布前事项",
      "将本文件发布到一个公开可访问的 HTTPS URL",
      "在 Chrome Web Store 后台把该 URL 作为隐私政策链接填写"
    ],
    "webstore privacy policy"
  );

  assertTextIncludesAll(
    publishChecklist,
    [
      "npm run verify:release",
      "chrome://extensions",
      "Chrome for Testing 或 Chromium",
      "隐私披露",
      "权限说明",
      "商店文案、隐私政策、审核备注、发布清单"
    ],
    "publish checklist"
  );

  assertTextIncludesAll(
    githubLinks,
    [
      "https://github.com/Ariandel35/marko",
      "https://github.com/Ariandel35/marko/issues",
      "https://github.com/Ariandel35/marko/blob/main/PRIVACY.md"
    ],
    "GitHub store links"
  );

  assertTextIncludesAll(
    supportPolicy,
    [
      "https://github.com/Ariandel35/marko/issues",
      "[SECURITY.md](SECURITY.md)"
    ],
    "support policy"
  );

  assertTextIncludesAll(
    securityPolicy,
    [
      "https://github.com/Ariandel35/marko/security/advisories/new",
      "Do not include exploit details, API keys, bookmark data, or personal data in public issues",
      "Expected first response: best effort within 5 business days"
    ],
    "security policy"
  );
  assertTextExcludesAll(
    securityPolicy,
    [
      "replace this file",
      "security@your-domain.com",
      "Recommended format"
    ],
    "security policy"
  );
}

function assertPackageList(packageFiles) {
  const seen = new Set();
  for (const filePath of packageFiles) {
    if (seen.has(filePath)) {
      throw new Error(`Duplicate package path: ${filePath}`);
    }
    seen.add(filePath);

    if (DISALLOWED_PACKAGE_PATTERNS.some((pattern) => pattern.test(filePath))) {
      throw new Error(`Non-runtime file is listed for upload: ${filePath}`);
    }

    const absolutePath = path.join(ROOT_DIR, filePath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      throw new Error(`Package file does not exist or is not a file: ${filePath}`);
    }
  }

  if (!seen.has("manifest.json")) {
    throw new Error("Package file list must include manifest.json at the ZIP root.");
  }
}

function assertZipContents(zipPath, packageFiles) {
  const expected = [...packageFiles].sort();
  const actual = readZipEntries(zipPath).sort();

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      [
        "ZIP contents do not match EXTENSION_PACKAGE_FILES.json.",
        `Expected: ${expected.join(", ")}`,
        `Actual: ${actual.join(", ")}`
      ].join("\n")
    );
  }
}

function verifyPackage() {
  const manifest = readJson(path.join(ROOT_DIR, "manifest.json"));
  const packageFiles = readJson(PACKAGE_LIST_PATH).packageFiles || [];
  const zipPath = path.join(SCRIPT_DIR, "dist", `marko-${manifest.version}.zip`);

  assertPackageList(packageFiles);
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Expected package was not created: ${path.relative(ROOT_DIR, zipPath)}`);
  }

  runStep("Validate ZIP archive", "unzip", ["-t", path.relative(ROOT_DIR, zipPath)]);
  assertZipContents(zipPath, packageFiles);
  console.log(`Verified ${path.relative(ROOT_DIR, zipPath)} contains ${packageFiles.length} runtime files.`);
}

function main() {
  runStep("Static and unit tests", process.execPath, ["tests/run-tests.js"]);
  verifyManifestMetadata();
  runStep("Responsive UI audit", process.execPath, ["webstore/audit_ui_layout.mjs"]);
  verifyStoreTextMaterials();
  verifyStoreAssets();
  runStep("Build Web Store package", process.execPath, ["webstore/build_extension_package.mjs"]);
  verifyPackage();
}

try {
  main();
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}
