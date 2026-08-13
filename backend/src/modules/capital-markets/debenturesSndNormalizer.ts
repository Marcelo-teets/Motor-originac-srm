import type {
  CapitalMarketEntityRole,
  NormalizedCapitalMarketEntityLink,
  NormalizedCapitalMarketMetric,
  NormalizedCapitalMarketRecord,
} from './cvmDatasetRegistry.js';
import type { DebenturesSndRow } from './debenturesSndTypes.js';
import { DEBENTURES_SND_DATASET_CODE, DEBENTURES_SND_SOURCE_CODE } from './debenturesSndTypes.js';
import { cleanSndValue, normalizeSndEntityName, parseSndDate, parseSndNumber, sndCnpj, stableSndHash } from './debenturesSndParser.js';

const nameLink = (
  row: DebenturesSndRow,
  field: string,
  role: CapitalMarketEntityRole,
  recordKey: string,
  hash: string,
  observedAt: string,
): NormalizedCapitalMarketEntityLink | null => {
  const name = cleanSndValue(row[field]);
  if (!name || name === '-') return null;
  return {
    dataset_code: DEBENTURES_SND_DATASET_CODE,
    record_key: recordKey,
    content_hash: hash,
    entity_key: stableSndHash(normalizeSndEntityName(name)),
    entity_role: role,
    entity_cnpj: null,
    entity_name: name,
    is_primary_origination_target: false,
    resolution_confidence: 0.7,
    source_fields: [field],
    observed_at: observedAt,
    updated_at: observedAt,
  };
};

const metric = (
  recordKey: string,
  hash: string,
  observedAt: string,
  referenceDate: string | null,
  code: string,
  label: string,
  value: number | null,
  unit: NormalizedCapitalMarketMetric['metric_unit'],
  sourceColumn: string,
): NormalizedCapitalMarketMetric | null => value == null ? null : {
  dataset_code: DEBENTURES_SND_DATASET_CODE,
  record_key: recordKey,
  content_hash: hash,
  metric_code: code,
  metric_label: label,
  metric_value: value,
  metric_unit: unit,
  reference_date: referenceDate,
  measurement_scope: 'security',
  source_column: sourceColumn,
  observed_at: observedAt,
  updated_at: observedAt,
};

export const normalizeDebenturesSndRow = (
  row: DebenturesSndRow,
  sourceUrl: string,
  referenceDate: string | null,
  observedAt = new Date().toISOString(),
): NormalizedCapitalMarketRecord => {
  const securityCode = cleanSndValue(row['Codigo do Ativo']).toUpperCase();
  if (!securityCode) throw new Error('Debentures SND row without Codigo do Ativo.');
  const recordKey = `asset:${securityCode}`;
  const hash = stableSndHash(JSON.stringify(row));
  const cnpj = sndCnpj(row.CNPJ);
  const issueDate = parseSndDate(row['Data de Emissao']);
  const registrationDate = parseSndDate(row['Data de Registro CVM da Emissao']);
  const originalMaturity = parseSndDate(row['Data de Vencimento']);
  const revisedMaturity = parseSndDate(row['Data de Saida / Novo Vencimento']);
  const issuedQuantity = parseSndNumber(row['Quantidade Emitida']);
  const outstandingQuantity = parseSndNumber(row['Quantidade em Mercado']);
  const issueNominal = parseSndNumber(row['Valor Nominal na Emissao']);
  const currentNominal = parseSndNumber(row['Valor Nominal Atual']);
  const issueAmount = issuedQuantity != null && issueNominal != null ? issuedQuantity * issueNominal : null;
  const outstandingBalance = outstandingQuantity != null && currentNominal != null ? outstandingQuantity * currentNominal : null;
  const links: NormalizedCapitalMarketEntityLink[] = [];

  if (cnpj || cleanSndValue(row.Empresa)) {
    links.push({
      dataset_code: DEBENTURES_SND_DATASET_CODE,
      record_key: recordKey,
      content_hash: hash,
      entity_key: cnpj ?? stableSndHash(normalizeSndEntityName(row.Empresa)),
      entity_role: 'issuer',
      entity_cnpj: cnpj,
      entity_name: cleanSndValue(row.Empresa) || null,
      is_primary_origination_target: true,
      resolution_confidence: cnpj ? 1 : 0.65,
      source_fields: ['CNPJ', 'Empresa'],
      observed_at: observedAt,
      updated_at: observedAt,
    });
  }
  const coordinator = nameLink(row, 'Coordenador Lider', 'coordinator', recordKey, hash, observedAt);
  const fiduciary = nameLink(row, 'Agente Fiduciario', 'fiduciary_agent', recordKey, hash, observedAt);
  if (coordinator) links.push(coordinator);
  if (fiduciary) links.push(fiduciary);

  const metrics = [
    metric(recordKey, hash, observedAt, referenceDate, 'issued_quantity', 'Quantidade emitida', issuedQuantity, 'COUNT', 'Quantidade Emitida'),
    metric(recordKey, hash, observedAt, referenceDate, 'outstanding_quantity', 'Quantidade em mercado', outstandingQuantity, 'COUNT', 'Quantidade em Mercado'),
    metric(recordKey, hash, observedAt, referenceDate, 'nominal_value_at_issue', 'Valor nominal na emissão', issueNominal, 'BRL', 'Valor Nominal na Emissao'),
    metric(recordKey, hash, observedAt, referenceDate, 'current_nominal_value', 'Valor nominal atual', currentNominal, 'BRL', 'Valor Nominal Atual'),
    metric(recordKey, hash, observedAt, referenceDate, 'issue_amount', 'Volume estimado na emissão', issueAmount, 'BRL', 'Quantidade Emitida * Valor Nominal na Emissao'),
    metric(recordKey, hash, observedAt, referenceDate, 'outstanding_balance', 'Saldo estimado em mercado', outstandingBalance, 'BRL', 'Quantidade em Mercado * Valor Nominal Atual'),
    metric(recordKey, hash, observedAt, referenceDate, 'remuneration_multiplier', 'Multiplicador / rentabilidade', parseSndNumber(row['Percentual Multiplicador/Rentabilidade']), 'PERCENT', 'Percentual Multiplicador/Rentabilidade'),
  ].filter((item): item is NormalizedCapitalMarketMetric => item !== null);

  return {
    bronze: {
      dataset_code: DEBENTURES_SND_DATASET_CODE,
      record_key: recordKey,
      ref_date: referenceDate,
      entity_cnpj: cnpj,
      payload: row,
      source_url: sourceUrl,
      content_hash: hash,
    },
    event: {
      dataset_code: DEBENTURES_SND_DATASET_CODE,
      source_code: DEBENTURES_SND_SOURCE_CODE,
      record_key: recordKey,
      content_hash: hash,
      event_type: 'debenture_registry_snapshot',
      instrument_type: 'DEBENTURE',
      issuer_cnpj: cnpj,
      issuer_name: cleanSndValue(row.Empresa) || null,
      fund_cnpj: null,
      fund_name: null,
      security_code: securityCode,
      offer_id: cleanSndValue(row['Registro CVM da Emissao']) || null,
      series: cleanSndValue(row.Serie) || null,
      status: cleanSndValue(row.Situacao) || null,
      reference_date: referenceDate,
      event_date: registrationDate ?? issueDate,
      maturity_date: revisedMaturity ?? originalMaturity,
      volume: issueAmount,
      currency: 'BRL',
      source_url: sourceUrl,
      source_resource_name: 'SND · Características das Debêntures Públicas · Registradas',
      source_file_name: 'caracteristicas_debentures_publicas.xls',
      raw_payload: row,
      normalized_payload: {
        isin: cleanSndValue(row.ISIN) || null,
        issuanceNumber: cleanSndValue(row.Emissao) || null,
        issueDate,
        originalMaturityDate: originalMaturity,
        revisedMaturityDate: revisedMaturity,
        nextRepricingDate: parseSndDate(row['Data da Proxima Repactuacao']),
        form: cleanSndValue(row.Forma) || null,
        guarantee: cleanSndValue(row['Garantia/Especie']) || null,
        class: cleanSndValue(row.Classe) || null,
        index: cleanSndValue(row.indice) || null,
        remunerationType: cleanSndValue(row.Tipo) || null,
        calculationCriterion: cleanSndValue(row['Criterio de Calculo']) || null,
        remunerationMultiplier: parseSndNumber(row['Percentual Multiplicador/Rentabilidade']),
        fiduciaryAgent: cleanSndValue(row['Agente Fiduciario']) || null,
        leadCoordinator: cleanSndValue(row['Coordenador Lider']) || null,
        mandatedBank: cleanSndValue(row['Banco Mandatario']) || null,
        depositaryInstitution: cleanSndValue(row['Instituicao Depositaria']) || null,
        incentivizedLaw12431: cleanSndValue(row['Deb. Incent. (Lei 12.431)']).toUpperCase() === 'S',
        sourceConfidence: 0.99,
        sourceAuthority: 'anbima_snd_legacy_primary_market_infrastructure',
      },
      observed_at: observedAt,
      updated_at: observedAt,
    },
    entityLinks: links,
    metrics,
  };
};
