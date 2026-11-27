// Packages the Chrome extension (extension/) into a standard PKZIP archive at
// the repo root: smallprint-scout-extension-v<version>.zip, with manifest.json
// at the zip root. Zero dependencies: deflateRawSync + a CRC32 table.
//
// Usage: node scripts/zip-extension.mjs   (or: npm run zip:extension)

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const extensionDir = join(repoRoot, "extension");

// --- CRC32 (PKZIP, polynomial 0xEDB88320) ---------------------------------

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// --- collect files ---------------------------------------------------------

function collectFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

// --- ZIP records -----------------------------------------------------------

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const VERSION_NEEDED = 20;
const FLAG_UTF8 = 0x0800;
const METHOD_DEFLATE = 8;
const DOS_TIME = 0; // 00:00:00
const DOS_DATE = 0x21; // 1980-01-01 (day=1, month=1, year=0)

function toZipName(absPath) {
  return relative(extensionDir, absPath).split(sep).join("/");
}

const manifestPath = join(extensionDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const version = manifest.version;
if (typeof version !== "string" || version.length === 0) {
  throw new Error("extension/manifest.json is missing a string \"version\"");
}

const files = collectFiles(extensionDir)
  .map((absPath) => ({ absPath, name: toZipName(absPath) }))
  .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

const localParts = [];
const centralParts = [];
let offset = 0;

for (const { absPath, name } of files) {
  const raw = readFileSync(absPath);
  const data = deflateRawSync(raw);
  const nameBuf = Buffer.from(name, "utf8");
  const crc = crc32(raw);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(LOCAL_SIG, 0);
  local.writeUInt16LE(VERSION_NEEDED, 4);
  local.writeUInt16LE(FLAG_UTF8, 6);
  local.writeUInt16LE(METHOD_DEFLATE, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28); // extra length

  localParts.push(local, nameBuf, data);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(CENTRAL_SIG, 0);
  central.writeUInt16LE(VERSION_NEEDED, 4); // version made by
  central.writeUInt16LE(VERSION_NEEDED, 6); // version needed
  central.writeUInt16LE(FLAG_UTF8, 8);
  central.writeUInt16LE(METHOD_DEFLATE, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30); // extra length
  central.writeUInt16LE(0, 32); // comment length
  central.writeUInt16LE(0, 34); // disk number start
  central.writeUInt16LE(0, 36); // internal attributes
  central.writeUInt32LE(0, 38); // external attributes
  central.writeUInt32LE(offset, 42);

  centralParts.push(central, nameBuf);

  offset += local.length + nameBuf.length + data.length;
}

const localBuf = Buffer.concat(localParts);
const centralBuf = Buffer.concat(centralParts);

const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(EOCD_SIG, 0);
eocd.writeUInt16LE(0, 4); // disk number
eocd.writeUInt16LE(0, 6); // disk with central directory
eocd.writeUInt16LE(files.length, 8); // entries on this disk
eocd.writeUInt16LE(files.length, 10); // total entries
eocd.writeUInt32LE(centralBuf.length, 12); // central directory size
eocd.writeUInt32LE(localBuf.length, 16); // central directory offset
eocd.writeUInt16LE(0, 20); // comment length

const zip = Buffer.concat([localBuf, centralBuf, eocd]);

const outPath = join(repoRoot, `smallprint-scout-extension-v${version}.zip`);
writeFileSync(outPath, zip);

console.log(`Wrote ${outPath} (${files.length} files, ${zip.length} bytes)`);
