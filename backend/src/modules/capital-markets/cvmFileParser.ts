import { inflateRawSync } from 'node:zlib';
import type { CsvRecord } from './cvmDatasetRegistry.js';

export const decodeBuffer = (buffer: Buffer) => {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  const replacementRatio = (utf8.match(/�/g)?.length ?? 0) / Math.max(1, utf8.length);
  if (replacementRatio < 0.0005) return utf8;
  return new TextDecoder('windows-1252', { fatal: false }).decode(buffer);
};

export const extractZipEntries = (
  buffer: Buffer,
  include: (name: string) => boolean = () => true,
): Array<{ name: string; data: Buffer }> => {
  let eocdOffset = -1;
  for (let offset = Math.max(0, buffer.length - 65_557); offset <= buffer.length - 22; offset += 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) eocdOffset = offset;
  }
  if (eocdOffset < 0) throw new Error('ZIP end-of-central-directory not found.');

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: Array<{ name: string; data: Buffer }> = [];

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(centralOffset) !== 0x02014b50) throw new Error('Invalid ZIP central-directory entry.');
    const compressionMethod = buffer.readUInt16LE(centralOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const fileNameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const localHeaderOffset = buffer.readUInt32LE(centralOffset + 42);
    const name = buffer.subarray(centralOffset + 46, centralOffset + 46 + fileNameLength).toString('utf8');

    if (!name.endsWith('/') && include(name)) {
      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) throw new Error(`Invalid local ZIP header for ${name}.`);
      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);

      let data: Buffer;
      if (compressionMethod === 0) data = Buffer.from(compressed);
      else if (compressionMethod === 8) data = inflateRawSync(compressed);
      else throw new Error(`Unsupported ZIP compression method ${compressionMethod} for ${name}.`);
      entries.push({ name, data });
    }

    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
};

const detectDelimiter = (text: string) => {
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  if (tabs > semicolons && tabs > commas) return '\t';
  return semicolons >= commas ? ';' : ',';
};

export const parseCsv = (text: string, maxDataRows = Number.POSITIVE_INFINITY): CsvRecord[] => {
  const clean = text.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < clean.length; index += 1) {
    const character = clean[index];
    if (character === '"') {
      if (quoted && clean[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && clean[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value.trim().length > 0)) rows.push(row);
      row = [];
      if (rows.length > maxDataRows) break;
    } else {
      field += character;
    }
  }
  if ((field.length || row.length) && rows.length <= maxDataRows) {
    row.push(field);
    if (row.some((value) => value.trim().length > 0)) rows.push(row);
  }
  if (!rows.length) return [];

  const headers = rows[0].map((header, index) => header.trim() || `column_${index + 1}`);
  return rows.slice(1, Number.isFinite(maxDataRows) ? maxDataRows + 1 : undefined)
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ''])));
};
