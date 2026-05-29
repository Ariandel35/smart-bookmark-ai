import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const PACKAGE_LIST_PATH = path.join(SCRIPT_DIR, "EXTENSION_PACKAGE_FILES.json");
const FIXED_DOS_DATE = 0x5c21; // 2026-01-01
const FIXED_DOS_TIME = 0x0000;

function parseArgs(argv) {
  const options = {
    outputPath: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      options.outputPath = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log("Usage: node webstore/build_extension_package.mjs [--out path/to/package.zip]");
}

function makeCrcTable() {
  const table = [];
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUInt16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function writeUInt32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function assertSafePackagePath(filePath) {
  if (
    !filePath ||
    path.isAbsolute(filePath) ||
    filePath.includes("\\") ||
    filePath.split("/").includes("..") ||
    filePath.startsWith("./")
  ) {
    throw new Error(`Unsafe package path: ${filePath}`);
  }
}

async function readPackageFiles() {
  const packageList = JSON.parse(await fs.readFile(PACKAGE_LIST_PATH, "utf8"));
  const packageFiles = packageList.packageFiles || [];
  const seen = new Set();

  for (const filePath of packageFiles) {
    assertSafePackagePath(filePath);
    if (seen.has(filePath)) {
      throw new Error(`Duplicate package path: ${filePath}`);
    }
    seen.add(filePath);
  }

  return packageFiles;
}

async function readManifestVersion() {
  const manifest = JSON.parse(await fs.readFile(path.join(ROOT_DIR, "manifest.json"), "utf8"));
  return manifest.version || "0.0.0";
}

async function buildZip(packageFiles) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const filePath of packageFiles) {
    const absolutePath = path.join(ROOT_DIR, filePath);
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) {
      throw new Error(`Package entry is not a file: ${filePath}`);
    }

    const data = await fs.readFile(absolutePath);
    const name = Buffer.from(filePath, "utf8");
    const checksum = crc32(data);

    const localHeader = Buffer.concat([
      writeUInt32(0x04034b50),
      writeUInt16(20),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(FIXED_DOS_TIME),
      writeUInt16(FIXED_DOS_DATE),
      writeUInt32(checksum),
      writeUInt32(data.length),
      writeUInt32(data.length),
      writeUInt16(name.length),
      writeUInt16(0),
      name
    ]);

    const centralHeader = Buffer.concat([
      writeUInt32(0x02014b50),
      writeUInt16(20),
      writeUInt16(20),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(FIXED_DOS_TIME),
      writeUInt16(FIXED_DOS_DATE),
      writeUInt32(checksum),
      writeUInt32(data.length),
      writeUInt32(data.length),
      writeUInt16(name.length),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(0),
      writeUInt32(offset),
      name
    ]);

    localParts.push(localHeader, data);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.concat([
    writeUInt32(0x06054b50),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(packageFiles.length),
    writeUInt16(packageFiles.length),
    writeUInt32(centralDirectory.length),
    writeUInt32(offset),
    writeUInt16(0)
  ]);

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const packageFiles = await readPackageFiles();
  const version = await readManifestVersion();
  const outputPath = options.outputPath
    ? path.resolve(ROOT_DIR, options.outputPath)
    : path.join(SCRIPT_DIR, "dist", `marko-${version}.zip`);
  const zipBuffer = await buildZip(packageFiles);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, zipBuffer);

  const displayPath = path.relative(ROOT_DIR, outputPath).startsWith("..")
    ? outputPath
    : path.relative(ROOT_DIR, outputPath);
  console.log(`Created ${displayPath} with ${packageFiles.length} files.`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
