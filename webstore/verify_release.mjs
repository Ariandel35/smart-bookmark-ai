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
  runStep("Build Web Store package", process.execPath, ["webstore/build_extension_package.mjs"]);
  verifyPackage();
}

try {
  main();
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}
