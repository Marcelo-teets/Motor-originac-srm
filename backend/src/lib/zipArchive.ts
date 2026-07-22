import { inflateRawSync } from 'node:zlib';

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const MAX_ZIP_COMMENT_BYTES = 0xffff;
const DEFAULT_MAX_ENTRIES = 2_000;
const DEFAULT_MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 256 * 1024 * 1024;

export type ZipArchiveEntry = {
  name: string;
  flags: number;
  compressionMethod: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

export type ZipArchiveOptions = {
  maxEntries?: number;
  maxEntryBytes?: number;
  maxTotalUncompressedBytes?: number;
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let current = value;
    for (let bit = 0; bit < 8; bit += 1) {
      current = (current & 1) !== 0 ? (0xedb88320 ^ (current >>> 1)) : (current >>> 1);
    }
    table[value] = current >>> 0;
  }
  return table;
})();

export const calculateCrc32 = (buffer: Buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const assertRange = (buffer: Buffer, offset: number, length: number, label: string) => {
  if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new Error(`Invalid ZIP ${label} range: offset=${offset}, length=${length}, archive=${buffer.length}.`);
  }
};

const findEndOfCentralDirectory = (buffer: Buffer) => {
  if (buffer.length < 22) throw new Error('ZIP archive is shorter than the end-of-central-directory record.');
  const minimumOffset = Math.max(0, buffer.length - 22 - MAX_ZIP_COMMENT_BYTES);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== END_OF_CENTRAL_DIRECTORY) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) return offset;
  }
  throw new Error('ZIP end-of-central-directory record was not found.');
};

const decodeEntryName = (buffer: Buffer, flags: number) => buffer.toString((flags & 0x0800) !== 0 ? 'utf8' : 'latin1');

export function listZipArchiveEntries(buffer: Buffer, options: ZipArchiveOptions = {}): ZipArchiveEntry[] {
  const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
  const maxEntryBytes = Math.max(1, options.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES);
  const maxTotalBytes = Math.max(maxEntryBytes, options.maxTotalUncompressedBytes ?? DEFAULT_MAX_TOTAL_BYTES);
  const endOffset = findEndOfCentralDirectory(buffer);
  const diskNumber = buffer.readUInt16LE(endOffset + 4);
  const centralDiskNumber = buffer.readUInt16LE(endOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(endOffset + 8);
  const totalEntries = buffer.readUInt16LE(endOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);

  if (diskNumber !== 0 || centralDiskNumber !== 0 || entriesOnDisk !== totalEntries) {
    throw new Error('Multi-disk ZIP archives are not supported.');
  }
  if (totalEntries === 0xffff || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported by this bounded reader.');
  }
  if (totalEntries > maxEntries) throw new Error(`ZIP contains ${totalEntries} entries; limit is ${maxEntries}.`);
  assertRange(buffer, centralDirectoryOffset, centralDirectorySize, 'central directory');

  const entries: ZipArchiveEntry[] = [];
  let offset = centralDirectoryOffset;
  let totalUncompressedBytes = 0;

  for (let index = 0; index < totalEntries; index += 1) {
    assertRange(buffer, offset, 46, 'central directory header');
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_HEADER) {
      throw new Error(`Invalid ZIP central-directory signature at offset ${offset}.`);
    }

    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const crc32 = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const diskStart = buffer.readUInt16LE(offset + 34);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);

    if ((flags & 0x0001) !== 0) throw new Error('Encrypted ZIP entries are not supported.');
    if (diskStart !== 0) throw new Error('Multi-disk ZIP entries are not supported.');
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      throw new Error('ZIP64 entries are not supported by this bounded reader.');
    }
    if (uncompressedSize > maxEntryBytes) {
      throw new Error(`ZIP entry exceeds ${maxEntryBytes} uncompressed bytes.`);
    }

    const variableLength = fileNameLength + extraLength + commentLength;
    assertRange(buffer, offset + 46, variableLength, 'central directory fields');
    const name = decodeEntryName(buffer.subarray(offset + 46, offset + 46 + fileNameLength), flags);
    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > maxTotalBytes) {
      throw new Error(`ZIP uncompressed total exceeds ${maxTotalBytes} bytes.`);
    }

    entries.push({
      name,
      flags,
      compressionMethod,
      crc32,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset += 46 + variableLength;
  }

  if (offset > centralDirectoryOffset + centralDirectorySize) {
    throw new Error('ZIP central-directory entries exceed the declared directory size.');
  }
  return entries;
}

export function extractZipArchiveEntry(buffer: Buffer, entry: ZipArchiveEntry): Buffer {
  assertRange(buffer, entry.localHeaderOffset, 30, 'local file header');
  if (buffer.readUInt32LE(entry.localHeaderOffset) !== LOCAL_FILE_HEADER) {
    throw new Error(`Invalid ZIP local-header signature for ${entry.name}.`);
  }

  const localFlags = buffer.readUInt16LE(entry.localHeaderOffset + 6);
  const localCompressionMethod = buffer.readUInt16LE(entry.localHeaderOffset + 8);
  const fileNameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  if ((localFlags & 0x0001) !== 0) throw new Error(`Encrypted ZIP entry is not supported: ${entry.name}.`);
  if (localCompressionMethod !== entry.compressionMethod) {
    throw new Error(`ZIP compression mismatch for ${entry.name}.`);
  }

  const dataOffset = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  assertRange(buffer, dataOffset, entry.compressedSize, `compressed data for ${entry.name}`);
  const compressed = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);
  const extracted = entry.compressionMethod === 0
    ? Buffer.from(compressed)
    : entry.compressionMethod === 8
      ? inflateRawSync(compressed, { maxOutputLength: entry.uncompressedSize || DEFAULT_MAX_ENTRY_BYTES })
      : null;

  if (!extracted) throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod} for ${entry.name}.`);
  if (extracted.length !== entry.uncompressedSize) {
    throw new Error(`ZIP size mismatch for ${entry.name}: expected ${entry.uncompressedSize}, got ${extracted.length}.`);
  }
  if (calculateCrc32(extracted) !== entry.crc32) throw new Error(`ZIP CRC mismatch for ${entry.name}.`);
  return extracted;
}
