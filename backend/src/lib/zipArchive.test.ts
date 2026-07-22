import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';
import {
  calculateCrc32,
  extractZipArchiveEntry,
  listZipArchiveEntries,
} from './zipArchive.js';

type FixtureEntry = {
  name: string;
  body: string;
  method: 0 | 8;
};

const buildZipFixture = (definitions: FixtureEntry[]) => {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const definition of definitions) {
    const name = Buffer.from(definition.name, 'utf8');
    const body = Buffer.from(definition.body, 'utf8');
    const compressed = definition.method === 8 ? deflateRawSync(body) : body;
    const crc = calculateCrc32(body);
    const flags = 0x0800;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(definition.method, 8);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(body.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    const localRecord = Buffer.concat([localHeader, name, compressed]);
    localParts.push(localRecord);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(definition.method, 10);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(body.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(Buffer.concat([centralHeader, name]));
    localOffset += localRecord.length;
  }

  const localSection = Buffer.concat(localParts);
  const centralSection = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(definitions.length, 8);
  end.writeUInt16LE(definitions.length, 10);
  end.writeUInt32LE(centralSection.length, 12);
  end.writeUInt32LE(localSection.length, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([localSection, centralSection, end]);
};

test('lists and extracts stored and deflated ZIP entries without external binaries', () => {
  const archive = buildZipFixture([
    { name: 'stored.csv', body: 'a;b\n1;2\n', method: 0 },
    { name: 'fre_cia_aberta_endividamento_2026.csv', body: 'cnpj_cia;valor_total\n123;1000\n', method: 8 },
  ]);
  const entries = listZipArchiveEntries(archive);

  assert.deepEqual(entries.map((entry) => entry.name), [
    'stored.csv',
    'fre_cia_aberta_endividamento_2026.csv',
  ]);
  assert.equal(extractZipArchiveEntry(archive, entries[0]).toString('utf8'), 'a;b\n1;2\n');
  assert.equal(
    extractZipArchiveEntry(archive, entries[1]).toString('utf8'),
    'cnpj_cia;valor_total\n123;1000\n',
  );
});

test('rejects archives that exceed configured entry limits', () => {
  const archive = buildZipFixture([
    { name: 'one.csv', body: '1', method: 8 },
    { name: 'two.csv', body: '2', method: 8 },
  ]);
  assert.throws(() => listZipArchiveEntries(archive, { maxEntries: 1 }), /contains 2 entries/);
});

test('rejects corrupted entry data through CRC validation', () => {
  const archive = buildZipFixture([{ name: 'data.csv', body: 'original', method: 0 }]);
  const entries = listZipArchiveEntries(archive);
  const corrupted = Buffer.from(archive);
  const dataOffset = entries[0].localHeaderOffset + 30 + Buffer.byteLength(entries[0].name);
  corrupted[dataOffset] ^= 0xff;
  assert.throws(() => extractZipArchiveEntry(corrupted, entries[0]), /CRC mismatch/);
});
