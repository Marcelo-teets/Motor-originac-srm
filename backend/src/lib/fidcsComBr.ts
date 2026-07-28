import { createHash } from 'node:crypto';

export type FidcsFundSnapshot = {
  provider: 'fidcs.com.br'; canonicalUpstream: 'CVM'; publicRecordKey: string;
  cnpj: string; cnpjFormatted: string; fundName: string | null; legalName: string | null;
  status: string | null; manager: string | null; administrator: string | null;
  netAssetValueBrl: number | null; shareholdersCount: number | null;
  defaultRatePercent: number | null; pddPercent: number | null; sourceUrl: string;
  observedAt: string; contentHash: string; providerEdgeWarning: boolean;
  sourceConfidence: number; observedVsInferred: 'observed';
};

const entities: Record<string, string> = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  aacute: 'á', Aacute: 'Á', acirc: 'â', Acirc: 'Â', atilde: 'ã', Atilde: 'Ã',
  eacute: 'é', Eacute: 'É', ecirc: 'ê', Ecirc: 'Ê', iacute: 'í', Iacute: 'Í',
  oacute: 'ó', Oacute: 'Ó', ocirc: 'ô', Ocirc: 'Ô', otilde: 'õ', Otilde: 'Õ',
  uacute: 'ú', Uacute: 'Ú', ccedil: 'ç', Ccedil: 'Ç', ndash: '–', mdash: '—',
};

const decodeHtml = (value: string) => value
  .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&([a-z]+);/gi, (match, name) => entities[name] ?? match);

const htmlToText = (html: string) => decodeHtml(html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const capture = (text: string, pattern: RegExp) => text.match(pattern)?.[1]?.trim() || null;

export const normalizeCnpj = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 14) throw new Error('CNPJ deve conter 14 dígitos.');
  return digits;
};

export const formatCnpj = (value: string) => {
  const digits = normalizeCnpj(value);
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
};

const parsePtNumber = (value: string | null) => {
  if (!value) return null;
  const parsed = Number(value.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseMoney = (value: string | null, scale: string | null) => {
  const parsed = parsePtNumber(value);
  if (parsed === null) return null;
  const multiplier = /bi/i.test(scale ?? '') ? 1_000_000_000 : /mi/i.test(scale ?? '') ? 1_000_000 : /mil/i.test(scale ?? '') ? 1_000 : 1;
  return Math.round(parsed * multiplier * 100) / 100;
};

const firstHeading = (html: string) => {
  const raw = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  return raw ? htmlToText(raw) : null;
};

export const parseFidcsFundHtml = (
  html: string, requestedCnpj: string, sourceUrl: string, observedAt = new Date().toISOString(),
): FidcsFundSnapshot => {
  const cnpj = normalizeCnpj(requestedCnpj);
  const cnpjFormatted = formatCnpj(cnpj);
  const text = htmlToText(html);
  if (!text.includes(cnpjFormatted) && !text.includes(cnpj)) {
    throw new Error(`A página do FIDCS.com.br não corresponde ao CNPJ ${cnpjFormatted}.`);
  }

  const escapedCnpj = cnpjFormatted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = firstHeading(html);
  const fundName = capture(text, /O que é o\s+(.+?)\?/i)
    ?? heading?.replace(/^Fundo\s+/i, '').replace(/\s+-\s+\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}.*$/, '').trim() ?? null;
  const legalName = capture(text, new RegExp(`O CNPJ do\\s+(.+?)\\s+é\\s+${escapedCnpj}`, 'i'));
  const manager = capture(text, /é um Fundo de Investimento em Direitos Creditórios \(FIDC\), gerido pela\s+(.+?)\s+e administrado por/i)
    ?? capture(text, /A gestora responsável.+? é a\s+(.+?)\./i);
  const administrator = capture(text, /e administrado por\s+(.+?)(?:\.\s+Possui| O administrador|\.\.\s)/i)
    ?? capture(text, /O administrador fiduciário é\s+(.+?), responsável/i);
  const status = capture(text, new RegExp(`${escapedCnpj}\\s+(Fase Pré-Operacional|Em Funcionamento Normal|Cancelado|Em Liquidação|Incorporado|Encerrado)`, 'i'));
  const moneyMatch = text.match(/patrimônio líquido de R\$\s*([\d.,]+)\s*(bi|mi|mil)?/i);
  const shareholders = capture(text, /Conta atualmente com\s+(\d+)\s+cotistas/i);
  const defaultRate = capture(text, /taxa de inadimplência atual.+? é de\s+([\d.,]+)%/i);
  const pdd = capture(text, /PDD\) corresponde a\s+([\d.,]+)%/i);
  const providerEdgeWarning = /Failed to send a request to the Edge Function/i.test(text);
  const netAssetValueBrl = parseMoney(moneyMatch?.[1] ?? null, moneyMatch?.[2] ?? null);
  const normalizedForHash = JSON.stringify({
    cnpj, fundName, legalName, status, manager, administrator, netAssetValueBrl,
    shareholdersCount: shareholders ? Number(shareholders) : null,
    defaultRatePercent: parsePtNumber(defaultRate), pddPercent: parsePtNumber(pdd),
  });

  return {
    provider: 'fidcs.com.br', canonicalUpstream: 'CVM', publicRecordKey: `fidcs_com_br:${cnpj}`,
    cnpj, cnpjFormatted, fundName, legalName, status, manager, administrator, netAssetValueBrl,
    shareholdersCount: shareholders ? Number(shareholders) : null,
    defaultRatePercent: parsePtNumber(defaultRate), pddPercent: parsePtNumber(pdd), sourceUrl, observedAt,
    contentHash: createHash('sha256').update(normalizedForHash).digest('hex'), providerEdgeWarning,
    sourceConfidence: 0.75, observedVsInferred: 'observed',
  };
};

export const fetchFidcsFundSnapshot = async (cnpjInput: string, options: {
  timeoutMs?: number; sessionCookie?: string; observedAt?: string;
} = {}) => {
  const cnpj = normalizeCnpj(cnpjInput);
  const sourceUrl = `https://fidcs.com.br/fundo/${cnpj}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    const response = await fetch(sourceUrl, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Origination-Intelligence-Platform/1.0 (+bounded public validation)',
        ...(options.sessionCookie ? { cookie: options.sessionCookie } : {}),
      },
      redirect: 'follow', signal: controller.signal,
    });
    if (!response.ok) throw new Error(`FIDCS.com.br respondeu HTTP ${response.status} para ${formatCnpj(cnpj)}.`);
    return parseFidcsFundHtml(await response.text(), cnpj, sourceUrl, options.observedAt);
  } finally {
    clearTimeout(timeout);
  }
};
