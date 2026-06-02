export const ORIGINATION_SOURCE_CATEGORIES = [
  'regulatory',
  'company_registry',
  'capital_markets',
  'funds_structured',
  'central_bank',
  'open_finance',
  'company_site',
  'company_blog',
  'company_docs',
  'company_terms',
  'news_traditional',
  'news_niche',
  'newsletter',
  'vc_portfolio',
  'accelerator',
  'jobs',
  'social_signal',
  'technical_signal',
  'app_store',
  'reviews',
  'complaints',
  'legal',
  'procurement',
  'government_contracts',
  'patents_trademarks',
  'market_data',
  'macro_data',
  'search_dork',
  'internal_crm',
  'manual_research',
] as const;

export type OriginationSourceCategory = typeof ORIGINATION_SOURCE_CATEGORIES[number];

export const ORIGINATION_SIGNAL_TYPES = [
  'has_credit_product',
  'has_receivables',
  'fidc_fit',
  'dcm_fit',
  'existing_fidc',
  'existing_debt',
  'funding_event',
  'growth_signal',
  'capital_mismatch',
  'embedded_finance_pressure',
  'receivables_strong_funding_weak',
  'regulatory_license',
  'risk_alert',
  'approach_trigger',
  'target_person_found',
  'vc_backed_growth_signal',
  'market_signal',
] as const;

export type OriginationSignalType = typeof ORIGINATION_SIGNAL_TYPES[number];

const normalizeForTaxonomy = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

export function deriveOriginationSignalType(text: string): OriginationSignalType {
  const value = normalizeForTaxonomy(text);

  if (/fidc|direitos credit[oó]rios|securitiza|cess[aã]o de recebiveis|subordinad|senior/.test(value)) {
    return 'existing_fidc';
  }

  if (/debenture|deb[eê]nture|nota comercial|ccb|cri|cra|mercado de capitais|credito privado|d[ií]vida estruturada/.test(value)) {
    return 'existing_debt';
  }

  if (/serie a|series a|serie b|series b|venture capital|private equity|rodada|capta[cç][aã]o|aporte|funding|bridge/.test(value)) {
    return 'funding_event';
  }

  if (/credito|cr[eé]dito|financiamento|emprestimo|empr[eé]stimo|bnpl|pix parcelado|antecipacao|antecipa[cç][aã]o|capital de giro/.test(value)) {
    return 'has_credit_product';
  }

  if (/recebiveis|receb[ií]veis|cartao|cart[aã]o|boleto|mensalidade|assinatura|contrato recorrente|parcelamento|repasse|settlement/.test(value)) {
    return 'has_receivables';
  }

  if (/embedded finance|wallet|checkout|pagamento|subadquir|banco como servi[cç]o|banking as a service|baas/.test(value)) {
    return 'embedded_finance_pressure';
  }

  if (/ip autorizada|institui[cç][aã]o de pagamento|scd|sep|banco central|open finance|financeira/.test(value)) {
    return 'regulatory_license';
  }

  if (/expans[aã]o|nova pra[cç]a|novas regi[oõ]es|crescimento|go-to-market|gtm|aumentar equipe|contrata[cç][aã]o/.test(value)) {
    return 'growth_signal';
  }

  if (/tesouraria|capital markets|credit risk|underwriting|cobran[cç]a|collections|fp&a|head of finance|cfo/.test(value)) {
    return 'approach_trigger';
  }

  if (/kaszek|monashees|canary|astella|valor capital|redpoint|abseed|upload ventures|onevc|norte ventures|softbank|riverwood|patria/.test(value)) {
    return 'vc_backed_growth_signal';
  }

  if (/reclame aqui|processo|a[cç][aã]o judicial|protesto|inadimpl[eê]ncia|san[cç][aã]o|reclama[cç][aã]o/.test(value)) {
    return 'risk_alert';
  }

  if (/capital|d[ií]vida|funding gap|burn|runway|crescimento sem funding|alongamento/.test(value)) {
    return 'capital_mismatch';
  }

  return 'market_signal';
}

export function signalStrengthFromOriginationText(text: string): number {
  const signalType = deriveOriginationSignalType(text);

  const highIntentSignals: OriginationSignalType[] = [
    'existing_fidc',
    'existing_debt',
    'funding_event',
    'has_credit_product',
    'has_receivables',
  ];

  if (highIntentSignals.includes(signalType)) return 84;
  if (signalType === 'approach_trigger' || signalType === 'embedded_finance_pressure') return 78;
  if (signalType === 'vc_backed_growth_signal' || signalType === 'growth_signal') return 72;
  if (signalType === 'risk_alert') return 58;

  return 62;
}
