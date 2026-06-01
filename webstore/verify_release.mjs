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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function runStep(label, command, args) {
  console.log(`\n== ${label} ==`);
  execFileSync(command, args, {
    cwd: ROOT_DIR,
    stdio: "inherit"
  });
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
  runStep("Responsive UI audit", process.execPath, ["webstore/audit_ui_layout.mjs"]);
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
