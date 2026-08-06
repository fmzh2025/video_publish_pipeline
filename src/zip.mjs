import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export function extractZip(zipPath, outputDir) {
  const buffer = fs.readFileSync(zipPath);
  const entries = readCentralDirectory(buffer);
  fs.mkdirSync(outputDir, { recursive: true });

  const extracted = [];
  for (const entry of entries) {
    const destination = safeDestination(outputDir, entry.name);
    if (entry.name.endsWith("/")) {
      fs.mkdirSync(destination, { recursive: true });
      continue;
    }

    const data = readEntryData(buffer, entry);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, data);
    extracted.push(destination);
  }
  return extracted;
}

function readCentralDirectory(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);

  const entries = [];
  let offset = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error(`invalid ZIP central directory at offset ${offset}`);
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString("utf8");

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset
    });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  throw new Error("invalid ZIP: end of central directory not found");
}

function readEntryData(buffer, entry) {
  const offset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(offset) !== LOCAL_SIGNATURE) {
    throw new Error(`invalid ZIP local header at offset ${offset}`);
  }

  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return Buffer.from(compressed);
  }
  if (entry.compressionMethod === 8) {
    return zlib.inflateRawSync(compressed);
  }

  throw new Error(`unsupported ZIP compression method: ${entry.compressionMethod}`);
}

function safeDestination(outputDir, entryName) {
  const destination = path.resolve(outputDir, entryName);
  const root = path.resolve(outputDir);
  if (destination !== root && !destination.startsWith(`${root}${path.sep}`)) {
    throw new Error(`unsafe ZIP entry path: ${entryName}`);
  }
  return destination;
}
