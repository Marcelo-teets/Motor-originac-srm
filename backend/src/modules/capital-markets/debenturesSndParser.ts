import { createHash } from 'node:crypto';
import type { DebenturesSndRow, DebenturesSndSnapshot } from './debenturesSndTypes.js';

const REQUIRED = [
  'Codigo do Ativo','Empresa','Serie','Emissao','Situacao','ISIN',
  'Registro CVM da Emissao','Data de Registro CVM da Emissao','Data de Emissao',
  'Data de Vencimento','Quantidade Emitida','Quantidade em Mercado',
  'Valor Nominal na Emissao','Valor Nominal Atual','Agente Fiduciario',
  'Coordenador Lider','CNPJ','Deb. Incent. (Lei 12.431)',
];

export const stableSndHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const cleanSndValue = (value: string | null | undefined) => String(value ?? '').trim();
export const sndCnpj = (value: string | null | undefined) => {
  const digits = cleanSndValue(value).replace(/\D/g, '');
  return digits.length === 14 ? digits : null;
};
export const parseSndDate = (value: string | null | undefined) => {
  const match = cleanSndValue(value).match(/^([0-3]?\d)\/([01]?\d)\/((?:19|20)\d{2})$/);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : null;
};
export const parseSndNumber = (value: string | null | undefined) => {
  let candidate = cleanSndValue(value).replace(/R\$/gi, '').replace(/\s/g, '').replace(/%/g, '');
  if (!candidate || candidate === '-') return null;
  const comma = candidate.lastIndexOf(',');
  const dot = candidate.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) candidate = comma > dot ? candidate.replace(/\./g, '').replace(',', '.') : candidate.replace(/,/g, '');
  else if (comma >= 0) candidate = candidate.replace(',', '.');
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
};
export const normalizeSndEntityName = (value: string) => value
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLowerCase();

const uniqueHeaders = (values: string[]) => {
  const counts = new Map<string, number>();
  return values.map((value) => {
    const name = cleanSndValue(value);
    const count = (counts.get(name) ?? 0) + 1;
    counts.set(name, count);
    return count === 1 ? name : `${name} (${count})`;
  });
};
const generatedAt = (lines: string[]) => {
  const match = lines.slice(0, 8).join(' ').match(/Gerado em\s+(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/i);
  if (!match) return { generatedAt: null, generatedDate: null };
  const date = `${match[3]}-${match[2]}-${match[1]}`;
  return { generatedAt: `${date}T${match[4]}:${match[5]}:${match[6]}-03:00`, generatedDate: date };
};

export const decodeDebenturesSndExport = (buffer: ArrayBuffer | Uint8Array) => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return new TextDecoder('windows-1252').decode(bytes).replace(/^\uFEFF/, '');
};

export const parseDebenturesSndText = (text: string): DebenturesSndSnapshot => {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headerIndex = lines.findIndex((line) => line.startsWith('Codigo do Ativo\tEmpresa'));
  if (headerIndex < 0) throw new Error('Debentures SND export header not found.');
  const headers = uniqueHeaders(lines[headerIndex].split('\t'));
  const missing = REQUIRED.filter((column) => !headers.includes(column));
  if (missing.length) throw new Error(`Debentures SND export missing required columns: ${missing.join(', ')}.`);

  const rows: DebenturesSndRow[] = [];
  for (const [offset, line] of lines.slice(headerIndex + 1).entries()) {
    if (!line.trim()) continue;
    const values = line.split('\t');
    if (values.length !== headers.length) throw new Error(`Debentures SND malformed row ${headerIndex + offset + 2}.`);
    const row: DebenturesSndRow = {};
    headers.forEach((header, index) => { row[header] = cleanSndValue(values[index]); });
    rows.push(row);
  }
  if (!rows.length) throw new Error('Debentures SND export returned no data rows.');
  const timestamp = generatedAt(lines);
  const sourceHash = stableSndHash(rows.map((row) => stableSndHash(JSON.stringify(row))).sort().join('|'));
  return { ...timestamp, sourceHash, rows };
};

export const parseDebenturesSndExport = (buffer: ArrayBuffer | Uint8Array) => parseDebenturesSndText(decodeDebenturesSndExport(buffer));
