import { createHash } from 'node:crypto';
import type { StrategicPublicRecord } from './strategicPublicDatasetConnector.js';

export type BrasilApiQsaFallbackResult = {
  status: 'real' | 'failed';
  endpoint: string;
  observedAt: string;
  entityCnpj: string;
  records: StrategicPublicRecord[];
  sourceAuthority: 'secondary_public_api';
  sourceConfidence: number;
  error?: string;
};

const SOURCE_CODE = 'src_brasilapi_cnpj';
const DATASET_CODE = 'rfb_qsa' as const;
const SOURCE_CONFIDENCE = 0.78;

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const hashText = (value: string) => createHash('sha256').update(value).digest('hex');
const hashJson = (value: unknown) => hashText(JSON.stringify(value));

const pick = (row: Record<string, unknown>, aliases: string[]) => {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null && clean(value)) return value;
  }
  return null;
};

const parseDate = (value: unknown) => {
  const text = clean(value);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = text.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null;
};

const maskDocument = (value: unknown) => {
  const normalized = digits(value);
  if (!normalized) return null;
  if (normalized.length === 14) return `${normalized.slice(0, 8)}******`;
  return `***${normalized.slice(-4)}`;
};

const sanitizePartnerRow = (row: Record<string, unknown>) => ({
  partnerName: clean(pick(row, ['nome_socio', 'nome', 'razao_social'])) || null,
  partnerDocumentMasked: maskDocument(pick(row, ['cnpj_cpf_do_socio', 'cnpj_cpf_socio', 'cpf_cnpj', 'documento'])),
  qualification: clean(pick(row, ['qualificacao_socio', 'qualificacao', 'descricao_qualificacao'])) || null,
  qualificationCode: clean(pick(row, ['codigo_qualificacao_socio', 'qualificacao_codigo', 'codigo_qualificacao'])) || null,
  partnerIdentifier: clean(pick(row, ['identificador_de_socio', 'identificador_socio', 'tipo_socio'])) || null,
  entryDate: parseDate(pick(row, ['data_entrada_sociedade', 'data_inclusao', 'data_entrada'])),
  country: clean(pick(row, ['pais', 'descricao_pais'])) || null,
  countryCode: clean(pick(row, ['codigo_pais', 'pais_codigo'])) || null,
  ageRange: clean(pick(row, ['faixa_etaria', 'descricao_faixa_etaria'])) || null,
  representativeName: clean(pick(row, ['nome_representante_legal', 'nome_representante'])) || null,
  representativeDocumentMasked: maskDocument(pick(row, ['cpf_representante_legal', 'representante_legal', 'documento_representante'])),
  representativeQualification: clean(pick(row, ['qualificacao_representante_legal', 'descricao_qualificacao_representante'])) || null,
});

export const normalizeBrasilApiQsaPayload = (input: {
  cnpj: string;
  payload: Record<string, unknown>;
  endpoint: string;
  observedAt: string;
}): StrategicPublicRecord[] => {
  const entityCnpj = digits(input.cnpj);
  const entityRoot = entityCnpj.slice(0, 8);
  const qsa = Array.isArray(input.payload.qsa) ? input.payload.qsa : [];
  const referenceDate = `${input.observedAt.slice(0, 7)}-01`;

  return qsa.flatMap((rawPartner, index) => {
    if (!rawPartner || typeof rawPartner !== 'object') return [];
    const row = rawPartner as Record<string, unknown>;
    const partnerDocument = digits(pick(row, ['cnpj_cpf_do_socio', 'cnpj_cpf_socio', 'cpf_cnpj', 'documento']));
    const partnerName = clean(pick(row, ['nome_socio', 'nome', 'razao_social']));
    const partnerDocumentHash = partnerDocument
      ? hashText(partnerDocument)
      : hashText(`${entityRoot}|${partnerName}|${index}`);
    const sanitized = sanitizePartnerRow(row);
    const normalizedPayload = {
      summary: 'Quadro societário consultado por API pública secundária',
      partnerName: sanitized.partnerName,
      partnerType: partnerDocument.length === 14 ? 'legal_entity' : partnerDocument.length === 11 ? 'natural_person' : 'undisclosed',
      partnerDocumentMasked: sanitized.partnerDocumentMasked,
      partnerDocumentHash,
      qualificationCode: sanitized.qualificationCode,
      qualification: sanitized.qualification,
      partnerIdentifier: sanitized.partnerIdentifier,
      entryDate: sanitized.entryDate,
      country: sanitized.country,
      countryCode: sanitized.countryCode,
      ageRange: sanitized.ageRange,
      representativeName: sanitized.representativeName,
      representativeDocumentMasked: sanitized.representativeDocumentMasked,
      representativeQualification: sanitized.representativeQualification,
      sourceAuthority: 'secondary_public_api',
      sourceProvider: 'BrasilAPI',
      sourceConfidence: SOURCE_CONFIDENCE,
      officialBulkUnavailable: true,
      snapshotCadence: 'monthly',
      privacyTreatment: 'personal identifiers masked and fingerprinted before any persistence',
    };
    const rawPayload = {
      ...sanitized,
      partnerDocumentHash,
      sourceAuthority: 'secondary_public_api',
      sourceProvider: 'BrasilAPI',
    };
    const identity = {
      datasetCode: DATASET_CODE,
      sourceCode: SOURCE_CODE,
      entityRoot,
      partnerDocumentHash,
      qualificationCode: sanitized.qualificationCode,
      entryDate: sanitized.entryDate,
      referenceDate,
    };

    return [{
      datasetCode: DATASET_CODE,
      sourceCode: SOURCE_CODE,
      recordKey: hashJson(identity),
      entityCnpj: entityRoot,
      entityName: clean(input.payload.razao_social) || null,
      recordType: 'rfb_partner_snapshot',
      referenceDate,
      amount: null,
      status: sanitized.partnerIdentifier,
      sourceUrl: input.endpoint,
      resourceKey: `brasilapi-qsa:${entityCnpj}:${referenceDate}`,
      contentHash: hashJson({ rawPayload, normalizedPayload }),
      rawPayload: Object.fromEntries(Object.entries(rawPayload).map(([key, value]) => [key, value === null ? '' : String(value)])),
      normalizedPayload,
    } satisfies StrategicPublicRecord];
  });
};

export async function fetchBrasilApiQsaFallback(cnpj: string): Promise<BrasilApiQsaFallbackResult> {
  const entityCnpj = digits(cnpj);
  const endpoint = `https://brasilapi.com.br/api/cnpj/v1/${entityCnpj}`;
  const observedAt = new Date().toISOString();

  try {
    const response = await fetch(endpoint, {
      redirect: 'follow',
      headers: {
        accept: 'application/json',
        'user-agent': 'OriginationIntelligencePlatform/1.0',
      },
    });
    if (!response.ok) throw new Error(`BrasilAPI status ${response.status}`);
    const payload = await response.json() as Record<string, unknown>;
    const records = normalizeBrasilApiQsaPayload({ cnpj: entityCnpj, payload, endpoint, observedAt });
    if (!records.length) throw new Error('BrasilAPI response did not include a non-empty QSA array.');
    return {
      status: 'real',
      endpoint,
      observedAt,
      entityCnpj,
      records,
      sourceAuthority: 'secondary_public_api',
      sourceConfidence: SOURCE_CONFIDENCE,
    };
  } catch (error) {
    return {
      status: 'failed',
      endpoint,
      observedAt,
      entityCnpj,
      records: [],
      sourceAuthority: 'secondary_public_api',
      sourceConfidence: SOURCE_CONFIDENCE,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
